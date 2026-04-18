import { pool } from "./db";
import { classifyAttack } from "./ai-attack-classifier";
import { storeAttackDetection, correlateAndBuildChains } from "./attack-chain-correlator";
import { computeEntityMLScore } from "./ml-behavior-engine";
import type { AttackClassificationResult } from "./ai-attack-classifier";

export interface PipelineInput {
  tenantId: number;
  eventId: number | null;
  incidentId?: number | null;
  eventData: Record<string, any>;
  skipBehavioral?: boolean;
}

export interface PipelineResult {
  detectionId: number;
  chainId: string | null;
  classification: AttackClassificationResult;
  behavioralDeviationScore: number;
}

async function getBehavioralDeviationScore(tenantId: number, event: Record<string, any>): Promise<number> {
  try {
    const user = event.userName || event.user_name || event.sender?.split("@")[0];
    const asset = event.asset;
    const ip = event.raw_payload?.sourceIp || event.raw_payload?.attackerIp;

    let maxScore = 0;

    if (user) {
      const result = await computeEntityMLScore(pool, tenantId, [tenantId], "users", user.toLowerCase());
      if (result && result.confidenceScore > maxScore) maxScore = result.confidenceScore;
    }
    if (asset) {
      const result = await computeEntityMLScore(pool, tenantId, [tenantId], "devices", asset.toLowerCase());
      if (result && result.confidenceScore > maxScore) maxScore = result.confidenceScore;
    }
    if (ip) {
      const result = await computeEntityMLScore(pool, tenantId, [tenantId], "ips", ip);
      if (result && result.confidenceScore > maxScore) maxScore = result.confidenceScore;
    }

    return Math.min(100, maxScore);
  } catch (err: any) {
    console.warn("[DetectionPipeline] Behavioral score error:", err.message);
    return 0;
  }
}

export async function runDetectionPipeline(input: PipelineInput): Promise<PipelineResult | null> {
  const { tenantId, eventId, incidentId, eventData, skipBehavioral } = input;

  let behavioralDeviationScore = 0;
  if (!skipBehavioral) {
    behavioralDeviationScore = await getBehavioralDeviationScore(tenantId, eventData);
  }

  const classification = await classifyAttack(eventData, tenantId, behavioralDeviationScore);

  if (classification.confidence < 20) {
    return null;
  }

  const detectionId = await storeAttackDetection(tenantId, eventId || null, incidentId || null, classification);

  const chainId = await correlateAndBuildChains(
    tenantId,
    detectionId,
    classification,
    eventId || null,
    { timeWindowMinutes: 120, minConfidenceThreshold: 30, minEventsForChain: 2, autoPromoteConfidenceThreshold: 70 }
  ).catch((err: any) => {
    console.warn("[DetectionPipeline] Chain correlation error:", err.message);
    return null;
  });

  await pool.query(
    `UPDATE security_events SET pipeline_status = 'correlated', correlated_at = NOW() WHERE id = $1`,
    [eventId]
  ).catch(() => {});

  return { detectionId, chainId, classification, behavioralDeviationScore };
}

export async function runBatchDetectionPipeline(
  tenantId: number,
  limit = 50
): Promise<{ processed: number; detected: number; chained: number }> {
  const pendingRes = await pool.query(
    `SELECT id, event_type, severity, threat, target, attacker, asset, description,
            enriched_description, mitre_tactic, mitre_technique, log_source, action,
            sender, recipient, raw_payload, occurred_at
     FROM security_events
     WHERE tenant_id = $1
       AND pipeline_status IN ('received', 'normalized', 'enriched', 'stored')
       AND correlated_at IS NULL
     ORDER BY occurred_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );

  let processed = 0;
  let detected = 0;
  let chained = 0;

  for (const row of pendingRes.rows) {
    try {
      const eventData = {
        eventType: row.event_type,
        severity: row.severity,
        threat: row.threat,
        target: row.target,
        attacker: row.attacker,
        asset: row.asset,
        description: row.description,
        enrichedDescription: row.enriched_description,
        mitreTactic: row.mitre_tactic,
        mitreTechnique: row.mitre_technique,
        logSource: row.log_source,
        action: row.action,
        sender: row.sender,
        recipient: row.recipient,
        raw_payload: row.raw_payload || {},
      };

      const result = await runDetectionPipeline({
        tenantId,
        eventId: row.id,
        eventData,
        skipBehavioral: false,
      });

      processed++;
      if (result) {
        detected++;
        if (result.chainId) chained++;
      }
    } catch (err: any) {
      console.warn(`[DetectionPipeline] Event ${row.id} processing error:`, err.message);
      processed++;
    }
  }

  return { processed, detected, chained };
}

export async function startDetectionPipelineJob(): Promise<void> {
  console.log("[DetectionPipeline] Starting periodic detection job");

  setInterval(async () => {
    try {
      const tenantRes = await pool.query(`SELECT id FROM tenants WHERE is_active = true LIMIT 500`);
      for (const t of tenantRes.rows) {
        const result = await runBatchDetectionPipeline(t.id, 30).catch((err: any) => {
          console.error(`[DetectionPipeline] Tenant ${t.id} batch error:`, err.message);
          return null;
        });
        if (result && result.processed > 0) {
          console.log(`[DetectionPipeline] Tenant ${t.id}: processed=${result.processed}, detected=${result.detected}, chained=${result.chained}`);
        }
      }
    } catch (err: any) {
      console.error("[DetectionPipeline] Periodic job error:", err.message);
    }
  }, 5 * 60 * 1000);
}
