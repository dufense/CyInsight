/**
 * server/cyber-llm-engine.ts
 * Cyber LLM Predictive Attack Engine — Task #149
 *
 * Gathers 4 signal sources, synthesises via LLM, persists run-oriented
 * prediction records in cyber_predictions, and runs every 6 hours.
 */

import { db, dbRead } from "./db";
import { createAIClient, getDefaultModel } from "./ai-provider";
import {
  cyberPredictions,
  incidents,
  threatIntelIocs,
  aiLearningFeedback,
  federatedThreatIndicators,
} from "@shared/schema";
import { eq, gte, desc, count, and, sql, ne } from "drizzle-orm";

// ── Kill Chain (Lockheed Martin 7 stages) ────────────────────────────────────
export const KILL_CHAIN_STAGES = [
  "Reconnaissance",
  "Weaponization",
  "Delivery",
  "Exploitation",
  "Installation",
  "Command & Control",
  "Actions on Objectives",
] as const;
export type KillChainStage = (typeof KILL_CHAIN_STAGES)[number];

// ── Core prediction row (one per attack type, sorted confidence DESC) ─────────
export interface PredictionRow {
  attackType: string;
  confidence: number;
  timeWindow: "24h" | "7d" | "30d";
  targetAssetClass: string;
  mitreTactic: string;
  mitreTechniqueId: string;
  killChainStage: KillChainStage;
  recommendedAction: string;
}

// ── Signal ingestion result ──────────────────────────────────────────────────
export interface InputSignalCounts {
  incidents: number;
  analystFeedback: number;
  federatedIocs: number;
  maliciousIocs: number;
}

export interface IncidentSeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SourceTypeBreakdown {
  sourceType: string;
  count: number;
}

export interface TPFPStats {
  truePositives: number;
  falsePositives: number;
  tpRate: number;
}

export interface IocTypeBreakdown {
  indicatorType: string;
  count: number;
  highConfidenceCount: number;
}

// ── Full signal context fed to LLM ──────────────────────────────────────────
export interface SignalContext {
  counts: InputSignalCounts;
  severityBreakdown: IncidentSeverityBreakdown;
  topSourceTypes: SourceTypeBreakdown[];
  topTactics: Array<{ tactic: string; count: number }>;
  tpFpStats: TPFPStats;
  aiAccuracyPercent: number | null;
  iocByType: IocTypeBreakdown[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  dataSpanDays: number;
}

// ── Supplementary analytics ──────────────────────────────────────────────────
export interface AttackVector {
  tactic: string;
  techniqueIds: string[];
  probability: number;
  delta: number;
  confidence: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  killChainStage: KillChainStage;
  reasoning: string;
}

export interface RiskTimelinePoint {
  day: number;
  label: string;
  riskScore: number;
  dominantTactic: string;
  incidentCount: number;
}

export interface EmergingIndicator {
  ioc: string;
  type: string;
  prevalence: number;
  trending: "rising" | "stable" | "declining";
  associatedTactics: string[];
}

export interface PredictedTarget {
  industry: string;
  probability: number;
  confidence: number;
  primaryVector: string;
}

// ── Full result ───────────────────────────────────────────────────────────────
export interface CyberPredictionResult {
  id: number;
  createdAt: string;
  predictionWindowDays: number;
  overallConfidence: number;
  accuracyScore: number | null;
  modelUsed: string;
  status: string;
  predictions: PredictionRow[];
  inputSignalCounts: InputSignalCounts;
  vectors: AttackVector[];
  riskTimeline: RiskTimelinePoint[];
  emergingIndicators: EmergingIndicator[];
  predictedTargets: PredictedTarget[];
  narrative: string;
  signalContext: SignalContext;
}

export interface PredictionHistoryItem {
  id: number;
  createdAt: string;
  overallConfidence: number | null;
  accuracyScore: number | null;
  status: string;
  predictionCount: number;
  modelUsed: string | null;
  predictionWindowDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Type coercion helpers (no `any` escapes)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set<string>(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const VALID_KILL_CHAIN = new Set<string>(KILL_CHAIN_STAGES);
const VALID_WINDOWS = new Set<string>(["24h", "7d", "30d"]);

function coerceSeverity(v: unknown): AttackVector["severity"] {
  return typeof v === "string" && VALID_SEVERITIES.has(v) ? (v as AttackVector["severity"]) : "MEDIUM";
}
function coerceKillChain(v: unknown): KillChainStage {
  return typeof v === "string" && VALID_KILL_CHAIN.has(v) ? (v as KillChainStage) : "Exploitation";
}
function coerceWindow(v: unknown): PredictionRow["timeWindow"] {
  return typeof v === "string" && VALID_WINDOWS.has(v) ? (v as PredictionRow["timeWindow"]) : "30d";
}
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
function safeStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function safeStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Signal gathering — deep, multi-dimensional
// ─────────────────────────────────────────────────────────────────────────────

async function gatherSignals(tenantId: number): Promise<SignalContext> {
  const since90d = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [
    incidentTotal,
    severityCounts,
    sourceTypeCounts,
    tacticCounts,
    feedbackStats,
    federatedStats,
    maliciousIocStats,
    iocTypeStats,
    lastRunRow,
  ] = await Promise.all([
    // Total incident count (90d)
    dbRead
      .select({ cnt: count() })
      .from(incidents)
      .where(and(eq(incidents.tenantId, tenantId), gte(incidents.createdAt, since90d))),

    // Severity breakdown (90d)
    dbRead
      .select({ severity: incidents.severity, cnt: count() })
      .from(incidents)
      .where(and(eq(incidents.tenantId, tenantId), gte(incidents.createdAt, since90d)))
      .groupBy(incidents.severity),

    // Source type breakdown (90d) — top 10
    dbRead
      .select({ sourceType: incidents.sourceType, cnt: count() })
      .from(incidents)
      .where(and(eq(incidents.tenantId, tenantId), gte(incidents.createdAt, since90d)))
      .groupBy(incidents.sourceType)
      .orderBy(desc(count()))
      .limit(10),

    // Top MITRE ATT&CK tactics (90d) — top 15
    dbRead
      .select({ tactic: incidents.mitreTactic, cnt: count() })
      .from(incidents)
      .where(and(eq(incidents.tenantId, tenantId), gte(incidents.createdAt, since90d)))
      .groupBy(incidents.mitreTactic)
      .orderBy(desc(count()))
      .limit(15),

    // TP/FP analyst feedback (30d): total, tp count, fp count, ai match rate
    dbRead
      .select({
        total: count(),
        matched: sql<number>`SUM(CASE WHEN ${aiLearningFeedback.aiMatched} THEN 1 ELSE 0 END)`,
        truePositives: sql<number>`SUM(CASE WHEN ${aiLearningFeedback.analystVerdict} = 'true_positive' THEN 1 ELSE 0 END)`,
        falsePositives: sql<number>`SUM(CASE WHEN ${aiLearningFeedback.analystVerdict} = 'false_positive' THEN 1 ELSE 0 END)`,
      })
      .from(aiLearningFeedback)
      .where(and(eq(aiLearningFeedback.tenantId, tenantId), gte(aiLearningFeedback.createdAt, since30d))),

    // Federated IOC count (30d)
    dbRead
      .select({ cnt: count() })
      .from(federatedThreatIndicators)
      .where(and(eq(federatedThreatIndicators.isActive, true), gte(federatedThreatIndicators.createdAt, since30d))),

    // Malicious IOC count (all)
    dbRead
      .select({ cnt: count() })
      .from(threatIntelIocs)
      .where(and(eq(threatIntelIocs.tenantId, tenantId), eq(threatIntelIocs.reputation, "malicious"))),

    // IOC by indicator type: count + high-confidence count (confidence >= 70)
    dbRead
      .select({
        indicatorType: threatIntelIocs.indicatorType,
        total: count(),
        highConf: sql<number>`SUM(CASE WHEN ${threatIntelIocs.confidence} >= 70 THEN 1 ELSE 0 END)`,
      })
      .from(threatIntelIocs)
      .where(eq(threatIntelIocs.tenantId, tenantId))
      .groupBy(threatIntelIocs.indicatorType)
      .orderBy(desc(count()))
      .limit(8),

    // Last prediction run timestamp
    dbRead
      .select({ createdAt: cyberPredictions.createdAt })
      .from(cyberPredictions)
      .where(and(eq(cyberPredictions.tenantId, tenantId), eq(cyberPredictions.status, "complete")))
      .orderBy(desc(cyberPredictions.createdAt))
      .limit(1),
  ]);

  const totalIncidents = Number(incidentTotal[0]?.cnt ?? 0);

  // Severity breakdown
  const sev: IncidentSeverityBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of severityCounts) {
    const n = Number(row.cnt);
    if (row.severity === "critical") sev.critical = n;
    else if (row.severity === "high") sev.high = n;
    else if (row.severity === "medium") sev.medium = n;
    else if (row.severity === "low") sev.low = n;
  }

  // Source type breakdown
  const topSourceTypes: SourceTypeBreakdown[] = sourceTypeCounts
    .filter((r): r is typeof r & { sourceType: string } => typeof r.sourceType === "string")
    .map((r) => ({ sourceType: r.sourceType, count: Number(r.cnt) }));

  // Top tactics
  const topTactics = tacticCounts
    .filter((t): t is typeof t & { tactic: string } => typeof t.tactic === "string")
    .map((t) => ({ tactic: t.tactic, count: Number(t.cnt) }));

  // TP/FP
  const feedbackTotal = Number(feedbackStats[0]?.total ?? 0);
  const feedbackMatched = Number(feedbackStats[0]?.matched ?? 0);
  const tpCount = Number(feedbackStats[0]?.truePositives ?? 0);
  const fpCount = Number(feedbackStats[0]?.falsePositives ?? 0);
  const aiAccuracyPercent = feedbackTotal > 0 ? Math.round((feedbackMatched / feedbackTotal) * 100) : null;
  const tpRate = feedbackTotal > 0 ? Math.round((tpCount / feedbackTotal) * 100) : 0;

  // IOC by type
  const iocByType: IocTypeBreakdown[] = iocTypeStats
    .filter((r): r is typeof r & { indicatorType: string } => typeof r.indicatorType === "string")
    .map((r) => ({
      indicatorType: r.indicatorType,
      count: Number(r.total),
      highConfidenceCount: Number(r.highConf ?? 0),
    }));

  const lastRunAt = lastRunRow[0]?.createdAt?.toISOString() ?? null;
  const nextRunAt = lastRunAt
    ? new Date(new Date(lastRunAt).getTime() + 6 * 3600 * 1000).toISOString()
    : null;

  return {
    counts: {
      incidents: totalIncidents,
      analystFeedback: feedbackTotal,
      federatedIocs: Number(federatedStats[0]?.cnt ?? 0),
      maliciousIocs: Number(maliciousIocStats[0]?.cnt ?? 0),
    },
    severityBreakdown: sev,
    topSourceTypes,
    topTactics,
    tpFpStats: { truePositives: tpCount, falsePositives: fpCount, tpRate },
    aiAccuracyPercent,
    iocByType,
    lastRunAt,
    nextRunAt,
    dataSpanDays: 90,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Risk timeline (deterministic from signal rates)
// ─────────────────────────────────────────────────────────────────────────────

function buildRiskTimeline(topTactics: Array<{ tactic: string; count: number }>, totalIncidents: number): RiskTimelinePoint[] {
  const baseRate = totalIncidents / 90;
  const dominantTactic = topTactics[0]?.tactic ?? "Initial Access";
  return Array.from({ length: 30 }, (_, idx) => {
    const day = idx + 1;
    const trend = 1 + 0.15 * Math.sin(day / 4) + (day / 30) * 0.2;
    const riskScore = Math.min(100, Math.round(baseRate * trend * 3.5));
    const date = new Date();
    date.setDate(date.getDate() + day);
    return {
      day,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      riskScore,
      dominantTactic,
      incidentCount: Math.round(baseRate * trend),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  LLM forecast
// ─────────────────────────────────────────────────────────────────────────────

async function runLLMForecast(ctx: SignalContext): Promise<{
  predictions: PredictionRow[];
  vectors: AttackVector[];
  predictedTargets: PredictedTarget[];
  emergingIndicators: EmergingIndicator[];
  narrative: string;
  overallConfidence: number;
}> {
  const ai = createAIClient();
  const model = getDefaultModel();

  const tacticsStr = ctx.topTactics.slice(0, 10).map((t, i) => `  ${i + 1}. ${t.tactic} (${t.count})`).join("\n");
  const iocStr = ctx.iocByType.slice(0, 6).map((i) => `  - ${i.indicatorType}: ${i.count} total, ${i.highConfidenceCount} high-confidence`).join("\n");
  const sourceStr = ctx.topSourceTypes.slice(0, 5).map((s) => `  - ${s.sourceType}: ${s.count}`).join("\n");

  const prompt = `You are an elite cyber threat intelligence analyst specialising in predictive threat modeling.

## Signal Telemetry (last 90 days unless noted)
Incidents: ${ctx.counts.incidents} total
  Severity: CRITICAL=${ctx.severityBreakdown.critical}, HIGH=${ctx.severityBreakdown.high}, MEDIUM=${ctx.severityBreakdown.medium}, LOW=${ctx.severityBreakdown.low}
  Top source types:
${sourceStr || "  (none)"}
  Top MITRE ATT&CK tactics:
${tacticsStr || "  (none)"}

Analyst Feedback (30d): ${ctx.counts.analystFeedback} records, TP rate=${ctx.tpFpStats.tpRate}%, AI accuracy=${ctx.aiAccuracyPercent !== null ? `${ctx.aiAccuracyPercent}%` : "insufficient"}

Threat Intelligence IOCs:
  Malicious: ${ctx.counts.maliciousIocs}
  Federated (cross-tenant, 30d): ${ctx.counts.federatedIocs}
  By type (with high-confidence counts):
${iocStr || "  (none)"}

Kill Chain stages (Lockheed Martin): Reconnaissance, Weaponization, Delivery, Exploitation, Installation, Command & Control, Actions on Objectives

## Task
Generate a 30-day predictive attack forecast. Respond ONLY with valid JSON:
{
  "overallConfidence": <integer 0-100>,
  "narrative": "<3-4 sentence executive summary>",
  "predictions": [
    {
      "attackType": "<threat category>",
      "confidence": <integer 0-100>,
      "timeWindow": "24h" | "7d" | "30d",
      "targetAssetClass": "<Endpoint|Cloud|Identity|Network|OT/ICS|Data|Application>",
      "mitreTactic": "<MITRE tactic>",
      "mitreTechniqueId": "<e.g. T1566.001>",
      "killChainStage": "<one of 7 stages above>",
      "recommendedAction": "<1-sentence defensive action>"
    }
  ],
  "vectors": [
    {
      "tactic": "<MITRE tactic>",
      "techniqueIds": ["T1xxx"],
      "probability": <0-100>,
      "delta": <-50 to 50 vs prior 30d>,
      "confidence": <0-100>,
      "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW",
      "killChainStage": "<one of 7 stages>",
      "reasoning": "<1-2 sentences>"
    }
  ],
  "predictedTargets": [
    { "industry": "<sector>", "probability": <0-100>, "confidence": <0-100>, "primaryVector": "<tactic>" }
  ],
  "emergingIndicators": [
    {
      "ioc": "<brief description>",
      "type": "ip"|"domain"|"hash"|"url"|"email",
      "prevalence": <0-100>,
      "trending": "rising"|"stable"|"declining",
      "associatedTactics": ["<tactic>"]
    }
  ]
}
Rules: predictions=5-8 sorted by confidence DESC, vectors=5-8 sorted by probability DESC, predictedTargets=3-5, emergingIndicators=3-6.`;

  try {
    const res = await ai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2800,
      temperature: 0.25,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed: Record<string, unknown> = JSON.parse(raw);

    const rawPredictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];
    const predictions: PredictionRow[] = (rawPredictions as Record<string, unknown>[])
      .map((p) => ({
        attackType: safeStr(p.attackType, "Unknown"),
        confidence: clampInt(p.confidence, 0, 100, 50),
        timeWindow: coerceWindow(p.timeWindow),
        targetAssetClass: safeStr(p.targetAssetClass, "Endpoint"),
        mitreTactic: safeStr(p.mitreTactic, "Unknown"),
        mitreTechniqueId: safeStr(p.mitreTechniqueId),
        killChainStage: coerceKillChain(p.killChainStage),
        recommendedAction: safeStr(p.recommendedAction, "Implement monitoring."),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const rawVectors = Array.isArray(parsed.vectors) ? parsed.vectors : [];
    const vectors: AttackVector[] = (rawVectors as Record<string, unknown>[]).map((v) => ({
      tactic: safeStr(v.tactic, "Unknown"),
      techniqueIds: safeStrArray(v.techniqueIds),
      probability: clampInt(v.probability, 0, 100, 50),
      delta: clampInt(v.delta, -50, 50, 0),
      confidence: clampInt(v.confidence, 0, 100, 60),
      severity: coerceSeverity(v.severity),
      killChainStage: coerceKillChain(v.killChainStage),
      reasoning: safeStr(v.reasoning),
    }));

    const rawTargets = Array.isArray(parsed.predictedTargets) ? parsed.predictedTargets : [];
    const predictedTargets: PredictedTarget[] = (rawTargets as Record<string, unknown>[]).map((t) => ({
      industry: safeStr(t.industry, "Unknown"),
      probability: clampInt(t.probability, 0, 100, 50),
      confidence: clampInt(t.confidence, 0, 100, 60),
      primaryVector: safeStr(t.primaryVector),
    }));

    const rawIndicators = Array.isArray(parsed.emergingIndicators) ? parsed.emergingIndicators : [];
    const emergingIndicators: EmergingIndicator[] = (rawIndicators as Record<string, unknown>[]).map((e) => ({
      ioc: safeStr(e.ioc),
      type: safeStr(e.type, "ip"),
      prevalence: clampInt(e.prevalence, 0, 100, 30),
      trending: (["rising", "stable", "declining"].includes(safeStr(e.trending)) ? safeStr(e.trending) : "stable") as EmergingIndicator["trending"],
      associatedTactics: safeStrArray(e.associatedTactics),
    }));

    return {
      predictions,
      vectors,
      predictedTargets,
      emergingIndicators,
      narrative: safeStr(parsed.narrative, "Predictive analysis complete."),
      overallConfidence: clampInt(parsed.overallConfidence, 0, 100, 65),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CyberLLM] LLM forecast failed:", msg);

    // Deterministic fallback from signal data
    const fallbackPredictions: PredictionRow[] = ctx.topTactics.slice(0, 5).map((t, i) => ({
      attackType: t.tactic,
      confidence: Math.max(10, 80 - i * 12),
      timeWindow: "30d",
      targetAssetClass: "Endpoint",
      mitreTactic: t.tactic,
      mitreTechniqueId: "",
      killChainStage: KILL_CHAIN_STAGES[Math.min(i + 2, KILL_CHAIN_STAGES.length - 1)],
      recommendedAction: "Review detection rules and harden exposed attack surfaces.",
    })).sort((a, b) => b.confidence - a.confidence);

    return {
      predictions: fallbackPredictions,
      vectors: ctx.topTactics.slice(0, 5).map((t, i) => ({
        tactic: t.tactic,
        techniqueIds: [],
        probability: Math.max(10, 80 - i * 12),
        delta: 0,
        confidence: 55,
        severity: (i === 0 ? "HIGH" : "MEDIUM") as AttackVector["severity"],
        killChainStage: KILL_CHAIN_STAGES[Math.min(i + 2, KILL_CHAIN_STAGES.length - 1)],
        reasoning: "Based on historical frequency analysis.",
      })),
      predictedTargets: [
        { industry: "Financial Services", probability: 72, confidence: 60, primaryVector: "Credential Access" },
        { industry: "Healthcare", probability: 58, confidence: 55, primaryVector: "Ransomware" },
        { industry: "Technology", probability: 45, confidence: 50, primaryVector: "Supply Chain" },
      ],
      emergingIndicators: [],
      narrative: "LLM forecast temporarily unavailable. Pattern-based estimates from historical signal data are shown.",
      overallConfidence: 45,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Generate and persist a new prediction run for the given tenant. */
export async function generateTenantPredictions(tenantId: number): Promise<CyberPredictionResult> {
  const ctx = await gatherSignals(tenantId);
  const timeline = buildRiskTimeline(ctx.topTactics, ctx.counts.incidents);
  const { predictions, vectors, predictedTargets, emergingIndicators, narrative, overallConfidence } =
    await runLLMForecast(ctx);

  const modelUsed = getDefaultModel();

  const [inserted] = await db
    .insert(cyberPredictions)
    .values({
      tenantId,
      predictionWindowDays: 30,
      overallConfidence,
      status: "complete",
      predictions: predictions as unknown as Record<string, unknown>[],
      inputSignalCounts: ctx.counts as unknown as Record<string, unknown>,
      vectors: vectors as unknown as Record<string, unknown>[],
      riskTimeline: timeline as unknown as Record<string, unknown>[],
      emergingIndicators: emergingIndicators as unknown as Record<string, unknown>[],
      predictedTargets: predictedTargets as unknown as Record<string, unknown>[],
      narrative,
      modelUsed,
      signalSummary: ctx as unknown as Record<string, unknown>,
    })
    .returning();

  console.info(
    `[CyberLLM] Generated prediction #${inserted.id} for tenant ${tenantId}: confidence ${overallConfidence}%, predictions=${predictions.length}`
  );

  return buildResult(inserted, ctx, predictions, vectors, timeline, emergingIndicators, predictedTargets, narrative, overallConfidence, modelUsed);
}

/** Get the latest completed prediction for a tenant. */
export async function getLatestPrediction(tenantId: number): Promise<CyberPredictionResult | null> {
  const rows = await dbRead
    .select()
    .from(cyberPredictions)
    .where(and(eq(cyberPredictions.tenantId, tenantId), eq(cyberPredictions.status, "complete")))
    .orderBy(desc(cyberPredictions.createdAt))
    .limit(1);

  if (!rows.length) return null;
  return rowToResult(rows[0]);
}

/** Get last 10 prediction runs for a tenant. */
export async function getPredictionHistory(tenantId: number): Promise<PredictionHistoryItem[]> {
  const rows = await dbRead
    .select({
      id: cyberPredictions.id,
      createdAt: cyberPredictions.createdAt,
      overallConfidence: cyberPredictions.overallConfidence,
      accuracyScore: cyberPredictions.accuracyScore,
      status: cyberPredictions.status,
      predictions: cyberPredictions.predictions,
      modelUsed: cyberPredictions.modelUsed,
      predictionWindowDays: cyberPredictions.predictionWindowDays,
    })
    .from(cyberPredictions)
    .where(eq(cyberPredictions.tenantId, tenantId))
    .orderBy(desc(cyberPredictions.createdAt))
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    overallConfidence: r.overallConfidence,
    accuracyScore: r.accuracyScore,
    status: r.status,
    predictionCount: Array.isArray(r.predictions) ? r.predictions.length : 0,
    modelUsed: r.modelUsed,
    predictionWindowDays: r.predictionWindowDays,
  }));
}

/** Get signal stats (for Learning Signal tab). */
export async function getSignalStats(tenantId: number): Promise<SignalContext> {
  return gatherSignals(tenantId);
}

/** Record analyst accuracy feedback on a prediction. */
export async function recordAccuracyFeedback(
  predictionId: number,
  tenantId: number,
  feedback: { actualAccuracy: number; notes?: string; reviewedAt: string }
): Promise<void> {
  await db
    .update(cyberPredictions)
    .set({
      accuracyScore: feedback.actualAccuracy,
      accuracyFeedback: feedback as unknown as Record<string, unknown>,
    })
    .where(and(eq(cyberPredictions.id, predictionId), eq(cyberPredictions.tenantId, tenantId)));
}

/** 6-hour scheduler: auto-generate predictions for all active tenants. */
export function scheduleCyberLLMEngine(getActiveTenantIds: () => Promise<number[]>): void {
  const SIX_HOURS_MS = 6 * 3600 * 1000;

  async function runCycle(): Promise<void> {
    try {
      const tenantIds = await getActiveTenantIds();
      console.info(`[CyberLLM] Scheduler: generating predictions for ${tenantIds.length} tenants`);
      for (const tid of tenantIds) {
        try {
          await generateTenantPredictions(tid);
        } catch (e: unknown) {
          console.error(`[CyberLLM] Tenant ${tid} failed:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e: unknown) {
      console.error("[CyberLLM] Scheduler cycle error:", e instanceof Error ? e.message : e);
    } finally {
      setTimeout(runCycle, SIX_HOURS_MS);
    }
  }

  setTimeout(() => {
    console.info("[CyberLLM] Scheduler started — first run in 5min, then every 6h");
    runCycle();
  }, 5 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type InsertedRow = {
  id: number;
  createdAt: Date;
  predictionWindowDays: number;
  overallConfidence: number | null;
  accuracyScore: number | null;
  status: string;
  modelUsed: string | null;
};

function buildResult(
  row: InsertedRow,
  ctx: SignalContext,
  predictions: PredictionRow[],
  vectors: AttackVector[],
  riskTimeline: RiskTimelinePoint[],
  emergingIndicators: EmergingIndicator[],
  predictedTargets: PredictedTarget[],
  narrative: string,
  overallConfidence: number,
  modelUsed: string
): CyberPredictionResult {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    predictionWindowDays: row.predictionWindowDays,
    overallConfidence,
    accuracyScore: row.accuracyScore,
    modelUsed,
    status: row.status,
    predictions,
    inputSignalCounts: ctx.counts,
    vectors,
    riskTimeline,
    emergingIndicators,
    predictedTargets,
    narrative,
    signalContext: ctx,
  };
}

type DbRow = {
  id: number;
  createdAt: Date;
  predictionWindowDays: number;
  overallConfidence: number | null;
  accuracyScore: number | null;
  status: string;
  modelUsed: string | null;
  predictions: unknown;
  inputSignalCounts: unknown;
  vectors: unknown;
  riskTimeline: unknown;
  emergingIndicators: unknown;
  predictedTargets: unknown;
  narrative: string | null;
  signalSummary: unknown;
};

function rowToResult(r: DbRow): CyberPredictionResult {
  const ctx = (r.signalSummary as SignalContext | null) ?? ({} as SignalContext);
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    predictionWindowDays: r.predictionWindowDays,
    overallConfidence: r.overallConfidence ?? 0,
    accuracyScore: r.accuracyScore,
    modelUsed: r.modelUsed ?? "",
    status: r.status,
    predictions: Array.isArray(r.predictions) ? (r.predictions as PredictionRow[]) : [],
    inputSignalCounts: (r.inputSignalCounts as InputSignalCounts) ?? {
      incidents: 0,
      analystFeedback: 0,
      federatedIocs: 0,
      maliciousIocs: 0,
    },
    vectors: Array.isArray(r.vectors) ? (r.vectors as AttackVector[]) : [],
    riskTimeline: Array.isArray(r.riskTimeline) ? (r.riskTimeline as RiskTimelinePoint[]) : [],
    emergingIndicators: Array.isArray(r.emergingIndicators) ? (r.emergingIndicators as EmergingIndicator[]) : [],
    predictedTargets: Array.isArray(r.predictedTargets) ? (r.predictedTargets as PredictedTarget[]) : [],
    narrative: r.narrative ?? "",
    signalContext: ctx,
  };
}
