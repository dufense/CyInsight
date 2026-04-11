import { createAIClient, getDefaultModel } from "./ai-provider";
import { db } from "./db";
import { incidents } from "@shared/schema";
import { eq, and, gte, sql, ne, count } from "drizzle-orm";
import { getTenantLearningContext } from "./ai-learning-engine";

export interface TriageResult {
  score: number;
  reasoning: string;
  suggestedClassification: "TP" | "FP" | "unknown";
}

export async function scoreIncident(incident: {
  id: number;
  tenantId: number;
  title: string;
  severity: string;
  description?: string | null;
  mitreTactic?: string | null;
  mitreTechniqueId?: string | null;
  sourceIp?: string | null;
  destinationIp?: string | null;
  iocData?: any;
  confidenceScore?: number | null;
}): Promise<TriageResult> {
  const ai = createAIClient();

  const since24h = new Date(Date.now() - 24 * 3600000);
  let similarCount = 0;
  try {
    if (incident.sourceIp) {
      const sim = await db
        .select({ cnt: count() })
        .from(incidents)
        .where(and(
          eq(incidents.tenantId, incident.tenantId),
          ne(incidents.id, incident.id),
          gte(incidents.createdAt, since24h),
          sql`${incidents.source_ip} = ${incident.sourceIp}`
        ));
      similarCount = Number(sim[0]?.cnt ?? 0);
    }
  } catch (_) { }

  const iocArray: any[] = incident.iocData
    ? Array.isArray(incident.iocData)
      ? incident.iocData as any[]
      : (incident.iocData as any)?.indicators ?? []
    : [];
  const iocSummary = iocArray.filter(i => i.reputation === "malicious").length;

  // Fetch tenant learning context (few-shot examples from analyst decisions)
  const learningContext = await getTenantLearningContext(incident.tenantId).catch(() => null);
  const fewShotSection = learningContext
    ? `\n\nLearning Context (from analyst decisions at this tenant — use these to improve accuracy):\n${learningContext}\n`
    : "";

  const prompt = `You are an expert SOC triage analyst. Analyze this security incident and provide a triage score.
${fewShotSection}
Incident Details:
- Title: ${incident.title}
- Severity: ${incident.severity}
- Description: ${incident.description ?? "N/A"}
- MITRE Tactic: ${incident.mitreTactic ?? "Unknown"}
- MITRE Technique: ${incident.mitreTechniqueId ?? "Unknown"}
- Source IP: ${incident.sourceIp ?? "Unknown"}
- Destination IP: ${incident.destinationIp ?? "Unknown"}
- AI Confidence Score: ${incident.confidenceScore ?? "Not scored"}
- Malicious IOC count: ${iocSummary}
- Similar incidents in last 24h from same source: ${similarCount}

Triage Score Guidelines:
- 0-25: Likely false positive (benign activity, no malicious IOCs, common false positive pattern)
- 26-50: Uncertain, needs analyst review
- 51-75: Probable true positive (suspicious indicators present)
- 76-100: High confidence true positive (known bad IOCs, active attack patterns, multiple corroborating signals)

Respond ONLY with this JSON (no explanation outside JSON):
{
  "score": <integer 0-100>,
  "reasoning": "<2-3 sentence reasoning for the score>",
  "suggestedClassification": "<TP|FP|unknown>"
}`;

  try {
    const res = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      score: Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
      reasoning: parsed.reasoning ?? "Unable to determine reasoning.",
      suggestedClassification: ["TP", "FP", "unknown"].includes(parsed.suggestedClassification) ? parsed.suggestedClassification : "unknown"
    };
  } catch (_) {
    const ruleBased = computeRuleBasedScore(incident, similarCount, iocSummary);
    return ruleBased;
  }
}

function computeRuleBasedScore(incident: any, similarCount: number, maliciousIocCount: number): TriageResult {
  let score = 50;

  if (incident.severity === "critical") score += 20;
  else if (incident.severity === "high") score += 10;
  else if (incident.severity === "low") score -= 15;
  else if (incident.severity === "info") score -= 25;

  if (maliciousIocCount > 0) score += 15;
  if (maliciousIocCount > 2) score += 10;

  if (similarCount > 0) score += 5;
  if (similarCount > 5) score += 5;

  if (incident.mitreTechniqueId) score += 10;
  if (incident.confidenceScore && incident.confidenceScore > 80) score += 10;
  else if (incident.confidenceScore && incident.confidenceScore < 30) score -= 15;

  score = Math.max(0, Math.min(100, score));

  const suggestedClassification: "TP" | "FP" | "unknown" = score >= 70 ? "TP" : score <= 25 ? "FP" : "unknown";

  return {
    score,
    reasoning: `Rule-based score: severity=${incident.severity}, malicious IOCs=${maliciousIocCount}, similar incidents=${similarCount}, MITRE mapped=${!!incident.mitreTechniqueId}.`,
    suggestedClassification
  };
}

export async function scoreIncidentInBackground(incidentId: number) {
  try {
    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!rows.length) return;
    const incident = rows[0];
    if (incident.triageScoredAt) return;

    const result = await scoreIncident({
      id: incident.id,
      tenantId: incident.tenantId,
      title: incident.title,
      severity: incident.severity,
      description: incident.description,
      mitreTactic: incident.mitreTactic,
      mitreTechniqueId: incident.mitreTechniqueId,
      sourceIp: incident.sourceIp,
      destinationIp: incident.destinationIp,
      iocData: Array.isArray(incident.iocData)
        ? (incident.iocData as any[])
        : (incident.iocData as any)?.indicators ?? [],
      confidenceScore: incident.confidenceScore,
    });

    await db.update(incidents).set({
      triageScore: result.score,
      triageReasoning: result.reasoning,
      triageSuggestedClassification: result.suggestedClassification,
      triageScoredAt: new Date(),
    }).where(eq(incidents.id, incidentId));
  } catch (err: any) {
    console.error(`[TriageEngine] Failed to score incident ${incidentId}:`, err.message);
  }
}
