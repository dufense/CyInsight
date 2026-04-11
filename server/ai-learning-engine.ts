import { createAIClient, getDefaultModel } from "./ai-provider";
import { db, dbRead } from "./db";
import { aiLearningFeedback, tenantAiContext, incidents } from "@shared/schema";
import { eq, gte, and, sql, count, desc } from "drizzle-orm";

export interface LearningStats {
  tenantId: number;
  decisionsThisWeek: number;
  totalDecisions: number;
  accuracyPercent: number | null;
  topMisclassified: Array<{ source: string; count: number }>;
  lastDigestAt: string | null;
  fewShotExamples: string | null;
}

/** Capture a single analyst TP/FP decision and write to learning feedback table */
export async function captureAnalystDecision(params: {
  tenantId: number;
  incidentId: number;
  analystId: string;
  analystVerdict: "true_positive" | "false_positive" | "inconclusive";
  incidentSeverity: string | null;
  mitreTactic: string | null;
  iocCount: number;
  aiSuggestedClassification: string | null;
  aiConfidence: number | null;
  sourceType?: string | null;
  assetCriticality?: string | null;
}): Promise<void> {
  try {
    // Normalize aiSuggestedClassification to canonical short form ("TP"|"FP"|"inconclusive"|"unknown")
    // so aiMatched accuracy is stable regardless of whether the triage engine stored "TP", "true_positive",
    // "True Positive", or some historical variant.
    function normalizeAiLabel(raw: string | null): "TP" | "FP" | "inconclusive" | "unknown" {
      if (!raw) return "unknown";
      const v = raw.trim().toLowerCase().replace(/[-_ ]/g, "");
      if (v === "tp" || v === "truepositive") return "TP";
      if (v === "fp" || v === "falsepositive") return "FP";
      if (v === "inconclusive" || v === "unclassified") return "inconclusive";
      return "unknown";
    }
    const normalizedAiLabel = normalizeAiLabel(params.aiSuggestedClassification);
    const aiMatched = normalizedAiLabel !== "unknown" &&
      normalizedAiLabel !== "inconclusive" &&
      ((normalizedAiLabel === "TP" && params.analystVerdict === "true_positive") ||
       (normalizedAiLabel === "FP" && params.analystVerdict === "false_positive"));

    await db.insert(aiLearningFeedback).values({
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      analystId: params.analystId,
      severity: params.incidentSeverity,
      sourceType: params.sourceType ?? null,
      iocCount: params.iocCount,
      mitreTactic: params.mitreTactic,
      assetCriticality: params.assetCriticality ?? null,
      // Store normalized canonical label so accuracy metrics are stable across historical label variants
      aiSuggestedClassification: normalizedAiLabel !== "unknown" ? normalizedAiLabel : (params.aiSuggestedClassification ?? null),
      aiConfidence: params.aiConfidence,
      analystVerdict: params.analystVerdict,
      aiMatched,
    });
  } catch (err: any) {
    console.error("[LearningEngine] Failed to capture analyst decision:", err.message);
  }
}

/** Run the daily learning digest for a tenant: builds few-shot examples and updates tenant_ai_context */
export async function runLearningDigest(tenantId: number): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  // Fetch last 24h feedback records for this tenant (read replica)
  const recentFeedback = await dbRead
    .select()
    .from(aiLearningFeedback)
    .where(and(
      eq(aiLearningFeedback.tenantId, tenantId),
      gte(aiLearningFeedback.createdAt, since24h)
    ))
    .orderBy(desc(aiLearningFeedback.createdAt))
    .limit(100);

  if (!recentFeedback.length) {
    console.info(`[LearningEngine] No new feedback for tenant ${tenantId} in last 24h — skipping digest.`);
    return;
  }

  // Compute accuracy over 30 days (read replica)
  const accuracy30d = await dbRead
    .select({ total: count(), matched: sql<number>`SUM(CASE WHEN ${aiLearningFeedback.aiMatched} THEN 1 ELSE 0 END)` })
    .from(aiLearningFeedback)
    .where(and(
      eq(aiLearningFeedback.tenantId, tenantId),
      gte(aiLearningFeedback.createdAt, since30d)
    ));
  const total30d = Number(accuracy30d[0]?.total ?? 0);
  const matched30d = Number(accuracy30d[0]?.matched ?? 0);
  const accuracyPercent = total30d > 0 ? Math.round((matched30d / total30d) * 100) : null;

  // Decisions this week (read replica)
  const weekStats = await dbRead
    .select({ cnt: count() })
    .from(aiLearningFeedback)
    .where(and(
      eq(aiLearningFeedback.tenantId, tenantId),
      gte(aiLearningFeedback.createdAt, since7d)
    ));
  const decisionsThisWeek = Number(weekStats[0]?.cnt ?? 0);

  // Total decisions (read replica)
  const totalStats = await dbRead
    .select({ cnt: count() })
    .from(aiLearningFeedback)
    .where(eq(aiLearningFeedback.tenantId, tenantId));
  const totalDecisions = Number(totalStats[0]?.cnt ?? 0);

  // Top misclassified sources (where AI was wrong) — read replica
  const misclassifiedRaw = await dbRead
    .select({
      source: aiLearningFeedback.sourceType,
      cnt: count()
    })
    .from(aiLearningFeedback)
    .where(and(
      eq(aiLearningFeedback.tenantId, tenantId),
      eq(aiLearningFeedback.aiMatched, false),
      gte(aiLearningFeedback.createdAt, since30d)
    ))
    .groupBy(aiLearningFeedback.sourceType)
    .orderBy(desc(count()))
    .limit(3);

  const topMisclassified = misclassifiedRaw.map(r => ({
    source: r.source ?? "Unknown",
    count: Number(r.cnt),
  }));

  // Build few-shot examples from recent correct analyst decisions
  const fewShotExamples = await buildFewShotExamples(tenantId, recentFeedback);

  // Upsert tenant_ai_context
  await db
    .insert(tenantAiContext)
    .values({
      tenantId,
      fewShotExamples,
      accuracyPercent,
      totalDecisions,
      decisionsThisWeek,
      topMisclassified,
      lastDigestAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tenantAiContext.tenantId,
      set: {
        fewShotExamples,
        accuracyPercent,
        totalDecisions,
        decisionsThisWeek,
        topMisclassified,
        lastDigestAt: new Date(),
        updatedAt: new Date(),
      },
    });

  console.info(`[LearningEngine] Digest complete for tenant ${tenantId}: ${recentFeedback.length} decisions, accuracy ${accuracyPercent}%`);
}

async function buildFewShotExamples(
  tenantId: number,
  recentFeedback: typeof aiLearningFeedback.$inferSelect[]
): Promise<string> {
  const ai = createAIClient();

  // Build a summary of recent decisions for AI to synthesize
  const decisionLines = recentFeedback
    .slice(0, 30)
    .map(f => {
      const match = f.aiMatched ? "AI was correct" : "AI was WRONG";
      return `- Severity=${f.severity ?? "?"}, Tactic=${f.mitreTactic ?? "?"}, IOCs=${f.iocCount ?? 0}, AI_suggested=${f.aiSuggestedClassification ?? "?"} → Analyst_verdict=${f.analystVerdict} (${match})`;
    })
    .join("\n");

  const prompt = `You are a SOC AI training specialist. Based on these analyst TP/FP decisions from the past 24 hours, write 3-5 concise few-shot examples that will help an AI triage model improve its accuracy. Focus on patterns where the AI was wrong or where the decision is nuanced.

Recent decisions:
${decisionLines}

Format each example as:
EXAMPLE N: [scenario description] → verdict: [TP|FP] because [brief reason]

Keep each example under 2 sentences. Return only the examples, no headers.`;

  try {
    const res = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content?.trim() ?? decisionLines;
  } catch {
    return decisionLines;
  }
}

/** Get learning stats for a tenant */
export async function getLearningStats(tenantId: number): Promise<LearningStats> {
  const ctx = await dbRead
    .select()
    .from(tenantAiContext)
    .where(eq(tenantAiContext.tenantId, tenantId))
    .limit(1);

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const weekStats = await dbRead
    .select({ cnt: count() })
    .from(aiLearningFeedback)
    .where(and(
      eq(aiLearningFeedback.tenantId, tenantId),
      gte(aiLearningFeedback.createdAt, since7d)
    ));
  const decisionsThisWeek = Number(weekStats[0]?.cnt ?? 0);

  const totalStats = await dbRead
    .select({ cnt: count() })
    .from(aiLearningFeedback)
    .where(eq(aiLearningFeedback.tenantId, tenantId));
  const totalDecisions = Number(totalStats[0]?.cnt ?? 0);

  const row = ctx[0];
  return {
    tenantId,
    decisionsThisWeek,
    totalDecisions,
    accuracyPercent: row?.accuracyPercent ?? null,
    topMisclassified: (row?.topMisclassified as Array<{ source: string; count: number }>) ?? [],
    lastDigestAt: row?.lastDigestAt?.toISOString() ?? null,
    fewShotExamples: row?.fewShotExamples ?? null,
  };
}

/** Get few-shot context string to prepend to triage prompts */
export async function getTenantLearningContext(tenantId: number): Promise<string | null> {
  try {
    const ctx = await db
      .select({ fewShotExamples: tenantAiContext.fewShotExamples })
      .from(tenantAiContext)
      .where(eq(tenantAiContext.tenantId, tenantId))
      .limit(1);
    return ctx[0]?.fewShotExamples ?? null;
  } catch {
    return null;
  }
}

/**
 * Reset learning context for a tenant.
 * By default only clears synthesized prompt context (tenant_ai_context) while
 * preserving raw analyst feedback for audit purposes.
 * Pass hardReset=true to also purge raw feedback history.
 */
export async function resetLearningContext(tenantId: number, hardReset = false): Promise<void> {
  // Always clear synthesized prompt context
  await db.delete(tenantAiContext).where(eq(tenantAiContext.tenantId, tenantId));
  // Only purge raw feedback when explicitly requested (hard reset)
  if (hardReset) {
    await db.delete(aiLearningFeedback).where(eq(aiLearningFeedback.tenantId, tenantId));
  }
}

/** Schedule nightly digest at 02:00 UTC — call once at server startup */
export function scheduleLearningDigests(getTenantIds: () => Promise<number[]>): void {
  const TWO_AM_UTC = 2;
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(TWO_AM_UTC, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        const tenantIds = await getTenantIds();
        for (const tid of tenantIds) {
          try { await runLearningDigest(tid); } catch (e: any) {
            console.error(`[LearningEngine] Digest failed for tenant ${tid}:`, e.message);
          }
        }
      } finally {
        scheduleNext();
      }
    }, delay);
    console.info(`[LearningEngine] Next learning digest scheduled at ${next.toISOString()}`);
  }
  scheduleNext();
}
