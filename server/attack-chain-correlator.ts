import { pool } from "./db";
import type { AttackCategory } from "@shared/schema";
import { ATTACK_CATEGORY_LABELS } from "@shared/schema";
import type { AttackClassificationResult } from "./ai-attack-classifier";
import crypto from "crypto";

export interface CorrelationConfig {
  timeWindowMinutes: number;
  minConfidenceThreshold: number;
  minEventsForChain: number;
  autoPromoteConfidenceThreshold: number;
}

const DEFAULT_CONFIG: CorrelationConfig = {
  timeWindowMinutes: 60,
  minConfidenceThreshold: 30,
  minEventsForChain: 2,
  autoPromoteConfidenceThreshold: 70,
};


const KILL_CHAIN_ORDER = [
  "reconnaissance",
  "weaponization",
  "delivery",
  "exploitation",
  "installation",
  "command_and_control",
  "lateral_movement",
  "actions_on_objectives",
];

function severityWeight(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s] || 1;
}

function computeChainSeverity(severities: string[]): string {
  if (severities.length === 0) return "medium";
  const maxW = Math.max(...severities.map(severityWeight));
  return Object.entries({ critical: 4, high: 3, medium: 2, low: 1 }).find(([, w]) => w === maxW)?.[0] || "medium";
}

function generateChainId(tenantId: number, entityKeys: string[]): string {
  const hash = crypto.createHash("sha256")
    .update(`${tenantId}:${entityKeys.sort().join(",")}`)
    .digest("hex")
    .slice(0, 16);
  return `chain-${hash}`;
}

function shareEntity(
  entitiesA: AttackClassificationResult["entities"],
  entitiesB: AttackClassificationResult["entities"]
): { shared: boolean; keys: string[] } {
  const shared: string[] = [];
  for (const ip of entitiesA.ips) {
    if (entitiesB.ips.includes(ip)) shared.push(`ip:${ip}`);
  }
  for (const u of entitiesA.users) {
    if (entitiesB.users.includes(u)) shared.push(`user:${u}`);
  }
  for (const h of entitiesA.hosts) {
    if (entitiesB.hosts.includes(h)) shared.push(`host:${h}`);
  }
  for (const h of entitiesA.hashes) {
    if (entitiesB.hashes.includes(h)) shared.push(`hash:${h}`);
  }
  return { shared: shared.length > 0, keys: shared };
}

export async function storeAttackDetection(
  tenantId: number,
  eventId: number | null,
  incidentId: number | null,
  result: AttackClassificationResult
): Promise<number> {
  const res = await pool.query(
    `INSERT INTO attack_detections
     (tenant_id, event_id, incident_id, attack_category, sub_type, confidence, severity,
      mitre_attack_id, mitre_attack_ids, kill_chain_phase, explanation, entities, signal_score, signals, behavioral_deviation_score, detected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
     RETURNING id`,
    [
      tenantId, eventId, incidentId, result.attackCategory, result.subType,
      result.confidence, result.severity, result.mitreAttackId,
      result.mitreAttackIds, result.killChainPhase, result.explanation,
      JSON.stringify(result.entities), result.signalScore,
      JSON.stringify(result.signals), result.behavioralDeviationScore,
    ]
  );
  return res.rows[0].id;
}

export async function correlateAndBuildChains(
  tenantId: number,
  newDetectionId: number,
  newResult: AttackClassificationResult,
  newEventId: number | null,
  config: Partial<CorrelationConfig> = {}
): Promise<string | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const windowStart = new Date(Date.now() - cfg.timeWindowMinutes * 60 * 1000);

  const recentRes = await pool.query(
    `SELECT id, event_id, attack_category, sub_type, confidence, severity, kill_chain_phase,
            entities, attack_chain_id, detected_at
     FROM attack_detections
     WHERE tenant_id = $1
       AND detected_at >= $2
       AND confidence >= $3
       AND id != $4
     ORDER BY detected_at DESC
     LIMIT 200`,
    [tenantId, windowStart, cfg.minConfidenceThreshold, newDetectionId]
  );

  const recent = recentRes.rows;
  let bestChainId: string | null = null;
  const sharedKeys: string[] = [];

  for (const row of recent) {
    const rowEntities = typeof row.entities === "string" ? JSON.parse(row.entities) : (row.entities || {});
    const { shared, keys } = shareEntity(newResult.entities, {
      ips: rowEntities.ips || [],
      users: rowEntities.users || [],
      hosts: rowEntities.hosts || [],
      hashes: rowEntities.hashes || [],
      domains: rowEntities.domains || [],
    });

    if (!shared) continue;

    if (row.attack_chain_id) {
      bestChainId = row.attack_chain_id;
      sharedKeys.push(...keys);
      break;
    }

    sharedKeys.push(...keys);
  }

  const uniqueKeys = [...new Set(sharedKeys)];

  if (!bestChainId && uniqueKeys.length > 0) {
    bestChainId = generateChainId(tenantId, uniqueKeys);
  }

  if (!bestChainId) {
    return null;
  }

  await pool.query(
    `UPDATE attack_detections SET attack_chain_id = $1 WHERE id = $2`,
    [bestChainId, newDetectionId]
  );

  const chainRes = await pool.query(
    `SELECT id, event_id, attack_category, severity, kill_chain_phase, confidence, entities, detected_at
     FROM attack_detections
     WHERE tenant_id = $1 AND attack_chain_id = $2
     ORDER BY detected_at ASC`,
    [tenantId, bestChainId]
  );

  const chainDetections = chainRes.rows;
  if (chainDetections.length < cfg.minEventsForChain) {
    return null;
  }

  const categories = [...new Set(chainDetections.map((d: any) => d.attack_category))] as string[];
  const phases = [...new Set(chainDetections.map((d: any) => d.kill_chain_phase).filter(Boolean))] as string[];
  phases.sort((a, b) => KILL_CHAIN_ORDER.indexOf(a) - KILL_CHAIN_ORDER.indexOf(b));

  const severities = chainDetections.map((d: any) => d.severity);
  const overallSeverity = computeChainSeverity(severities);
  const avgConfidence = Math.round(chainDetections.reduce((s: number, d: any) => s + (d.confidence || 0), 0) / chainDetections.length);

  const allEntities: AttackClassificationResult["entities"] = { ips: [], users: [], hosts: [], hashes: [], domains: [] };
  for (const d of chainDetections) {
    const ent = typeof d.entities === "string" ? JSON.parse(d.entities) : (d.entities || {});
    for (const ip of (ent.ips || [])) { if (!allEntities.ips.includes(ip)) allEntities.ips.push(ip); }
    for (const u of (ent.users || [])) { if (!allEntities.users.includes(u)) allEntities.users.push(u); }
    for (const h of (ent.hosts || [])) { if (!allEntities.hosts.includes(h)) allEntities.hosts.push(h); }
    for (const h of (ent.hashes || [])) { if (!allEntities.hashes.includes(h)) allEntities.hashes.push(h); }
  }

  const detectionIds = chainDetections.map((d: any) => d.id);
  const eventIds = chainDetections.map((d: any) => d.event_id).filter(Boolean);
  const firstEventAt = chainDetections[0].detected_at;
  const lastEventAt = chainDetections[chainDetections.length - 1].detected_at;

  const phasesLabel = phases.join(" → ");
  const categoriesLabel = categories.map(c => ATTACK_CATEGORY_LABELS[c as AttackCategory] || c).join(", ");
  const title = `Attack Chain: ${categoriesLabel.substring(0, 100)}`;
  const description = `Multi-step attack chain involving ${chainDetections.length} detections across ${categories.length} attack categories. Kill chain progression: ${phasesLabel || "unknown"}. Shared entities: ${uniqueKeys.slice(0, 5).join(", ")}.`;

  await pool.query(
    `INSERT INTO attack_chain_groups
     (tenant_id, chain_id, title, description, attack_categories, kill_chain_phases,
      shared_entities, event_ids, detection_ids, overall_confidence, severity,
      time_window_minutes, first_event_at, last_event_at, promoted_to_incident)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false)
     ON CONFLICT (chain_id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       attack_categories = EXCLUDED.attack_categories,
       kill_chain_phases = EXCLUDED.kill_chain_phases,
       shared_entities = EXCLUDED.shared_entities,
       event_ids = EXCLUDED.event_ids,
       detection_ids = EXCLUDED.detection_ids,
       overall_confidence = EXCLUDED.overall_confidence,
       severity = EXCLUDED.severity,
       last_event_at = EXCLUDED.last_event_at,
       updated_at = NOW()`,
    [
      tenantId, bestChainId, title, description,
      categories, phases, JSON.stringify({
        ips: allEntities.ips,
        users: allEntities.users,
        hosts: allEntities.hosts,
        hashes: allEntities.hashes,
      }),
      eventIds, detectionIds, avgConfidence, overallSeverity,
      cfg.timeWindowMinutes, firstEventAt, lastEventAt,
    ]
  );

  if (avgConfidence >= cfg.autoPromoteConfidenceThreshold && chainDetections.length >= 3) {
    await promoteChainToIncident(tenantId, bestChainId, title, description, overallSeverity, categories, allEntities, avgConfidence);
  }

  return bestChainId;
}

async function promoteChainToIncident(
  tenantId: number,
  chainId: string,
  title: string,
  description: string,
  severity: string,
  categories: string[],
  entities: AttackClassificationResult["entities"],
  confidence: number
): Promise<void> {
  const existing = await pool.query(
    `SELECT promoted_to_incident, incident_id FROM attack_chain_groups WHERE chain_id = $1`,
    [chainId]
  );

  if (existing.rows[0]?.promoted_to_incident) return;

  try {
    const topCategory = categories[0];
    const topEntities = [...entities.ips, ...entities.users, ...entities.hosts].slice(0, 3).join(", ");

    const incidentRes = await pool.query(
      `INSERT INTO incidents
       (tenant_id, title, description, severity, status, source, category, confidence_score, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'open','attack_chain_correlator',$5,$6,NOW(),NOW())
       RETURNING id`,
      [tenantId, title, `Auto-promoted from attack chain ${chainId}. ${description}`, severity, topCategory, confidence]
    );

    const incidentId = incidentRes.rows[0].id;

    await pool.query(
      `UPDATE attack_chain_groups SET promoted_to_incident = true, incident_id = $1 WHERE chain_id = $2`,
      [incidentId, chainId]
    );

    await pool.query(
      `UPDATE attack_detections SET incident_id = $1 WHERE attack_chain_id = $2 AND tenant_id = $3`,
      [incidentId, chainId, tenantId]
    );

    console.log(`[AttackChain] Promoted chain ${chainId} to incident #${incidentId} (tenant ${tenantId})`);
  } catch (err: any) {
    console.error("[AttackChain] Failed to promote chain to incident:", err.message);
  }
}

export async function getRecentChains(tenantId: number, limit = 20): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM attack_chain_groups WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return res.rows;
}

export async function getDetectionsForEvent(tenantId: number, eventId: number): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM attack_detections WHERE tenant_id = $1 AND event_id = $2 ORDER BY detected_at DESC`,
    [tenantId, eventId]
  );
  return res.rows;
}
