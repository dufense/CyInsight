import { pool } from "./db";

let _tablesInitialized = false;

export function isValidIPv4(value: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return false;
  return value.split(".").map(Number).every(n => n >= 0 && n <= 255);
}

export function isPrivateIP(value: string): boolean {
  if (!isValidIPv4(value)) return false;
  const parts = value.split(".").map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
}

interface PendingNomination {
  id: number;
  tenant_id: number;
  ioc_value: string;
  ioc_type: string;
  confidence: number;
  reputation: string;
  threat_type: string | null;
  tags: string[];
}

interface SharedIntelRow {
  id: number;
  source_ioc_value: string;
  ioc_type: string;
  reputation: string;
  confidence: number;
}

export async function ensureFederatedIntelTables(): Promise<void> {
  if (_tablesInitialized) return;
  // Tables are created by migration 0016_add_federated_intel_tables.sql.
  // Verify the primary table exists to catch misconfigured environments early.
  const check = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_threat_intel' LIMIT 1`
  );
  if (check.rows.length === 0) {
    throw new Error("[FederatedIntel] required tables not found — run database migrations first (0016_add_federated_intel_tables.sql)");
  }
  _tablesInitialized = true;
}

export async function nominateFromIncident(
  tenantId: number,
  incidentId: number,
  iocValue: string,
  iocType: string,
  confidence: number,
  nominatedBy: string
): Promise<number | null> {
  await ensureFederatedIntelTables();
  const settings = await getOrCreateSharingSettings(tenantId);
  if (!settings.sharing_enabled || confidence < 80) return null;
  const normalizedValue = iocValue.trim().toLowerCase();
  if (iocType === "ip" && isPrivateIP(normalizedValue)) return null;

  const existing = await pool.query(
    `SELECT id FROM tenant_intel_nominations WHERE tenant_id = $1 AND ioc_value = $2 AND ioc_type = $3 AND status != 'rejected'`,
    [tenantId, normalizedValue, iocType]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await pool.query(
    `INSERT INTO tenant_intel_nominations (tenant_id, ioc_value, ioc_type, confidence, reputation, source_incident_id, status, nominated_by)
     VALUES ($1, $2, $3, $4, 'malicious', $5, 'pending', $6) RETURNING id`,
    [tenantId, normalizedValue, iocType, confidence, incidentId, nominatedBy]
  );
  return result.rows[0]?.id ?? null;
}

export async function nominateFromIOC(
  tenantId: number,
  iocId: number,
  iocValue: string,
  iocType: string,
  confidence: number,
  threatType: string | null,
  nominatedBy: string
): Promise<number | null> {
  await ensureFederatedIntelTables();
  const settings = await getOrCreateSharingSettings(tenantId);
  if (!settings.sharing_enabled || confidence < 80) return null;
  const normalizedValue = iocValue.trim().toLowerCase();
  if (iocType === "ip" && isPrivateIP(normalizedValue)) return null;

  const existing = await pool.query(
    `SELECT id FROM tenant_intel_nominations WHERE tenant_id = $1 AND ioc_value = $2 AND ioc_type = $3 AND status != 'rejected'`,
    [tenantId, normalizedValue, iocType]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await pool.query(
    `INSERT INTO tenant_intel_nominations (tenant_id, ioc_value, ioc_type, confidence, reputation, threat_type, source_ioc_id, status, nominated_by)
     VALUES ($1, $2, $3, $4, 'malicious', $5, $6, 'pending', $7) RETURNING id`,
    [tenantId, normalizedValue, iocType, confidence, threatType, iocId, nominatedBy]
  );
  return result.rows[0]?.id ?? null;
}

export async function getOrCreateSharingSettings(tenantId: number): Promise<{
  sharing_enabled: boolean;
  receiving_enabled: boolean;
  ioc_contributed: number;
  ioc_received: number;
  contribution_score: number;
}> {
  await ensureFederatedIntelTables();
  const existing = await pool.query(
    `SELECT * FROM tenant_intel_sharing_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  await pool.query(
    `INSERT INTO tenant_intel_sharing_settings (tenant_id, sharing_enabled, receiving_enabled, ioc_contributed, ioc_received, contribution_score)
     VALUES ($1, FALSE, TRUE, 0, 0, 0) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  return { sharing_enabled: false, receiving_enabled: true, ioc_contributed: 0, ioc_received: 0, contribution_score: 0 };
}

function normalizeIocType(raw: string): string {
  const typeMap: Record<string, string> = {
    file_name: "filename",
    file: "filename",
    hash: "hash_sha256",
    md5: "hash_md5",
    sha1: "hash_sha1",
    sha256: "hash_sha256",
  };
  const normalized = typeMap[raw] ?? raw;
  const validTypes = new Set(["ip", "domain", "hash_md5", "hash_sha1", "hash_sha256", "url", "email", "filename", "registry_key", "mutex"]);
  return validTypes.has(normalized) ? normalized : "domain";
}

function buildEventMatchQuery(iocType: string, tenantId: number, iocVal: string): { query: string; params: (string | number)[] } {
  const base = `SELECT COUNT(*) as count FROM security_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'`;
  if (iocType === "ip") {
    return {
      query: `${base} AND (attacker = $2 OR target = $2 OR description ~ $3 OR threat ~ $3)`,
      params: [tenantId, iocVal, `\\m${iocVal.replace(/\./g, "\\.")}\\M`],
    };
  }
  if (iocType === "domain") {
    return {
      query: `${base} AND (target = $2 OR attacker = $2 OR target ILIKE $3 OR attacker ILIKE $3 OR description ILIKE $4 OR threat ILIKE $4)`,
      params: [tenantId, iocVal, `%.${iocVal}`, `%${iocVal}%`],
    };
  }
  if (iocType === "url") {
    return {
      query: `${base} AND (description ILIKE $2 OR threat ILIKE $2 OR target ILIKE $2)`,
      params: [tenantId, `%${iocVal}%`],
    };
  }
  if (iocType.startsWith("hash_")) {
    return {
      query: `${base} AND (description ILIKE $2 OR threat ILIKE $2)`,
      params: [tenantId, `%${iocVal}%`],
    };
  }
  return {
    query: `${base} AND (description ILIKE $2 OR threat ILIKE $2 OR target ILIKE $2 OR attacker ILIKE $2)`,
    params: [tenantId, `%${iocVal}%`],
  };
}

export async function runFederatedIntelPropagation(): Promise<{
  processed: number;
  propagated: number;
  alertsGenerated: number;
}> {
  await ensureFederatedIntelTables();

  const nominations = await pool.query<PendingNomination>(
    `WITH claimed AS (
       UPDATE tenant_intel_nominations
       SET status = 'propagating', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM tenant_intel_nominations
         WHERE status = 'approved' AND shared_threat_intel_id IS NULL
         ORDER BY id
         LIMIT 50
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *
     )
     SELECT * FROM claimed`
  );

  let propagated = 0;
  let alertsGenerated = 0;

  for (const nom of nominations.rows) {
    try {
      const existing = await pool.query<SharedIntelRow>(
        `SELECT id, contributor_count FROM shared_threat_intel WHERE source_ioc_value = $1 AND ioc_type = $2 AND is_active = TRUE LIMIT 1`,
        [nom.ioc_value, nom.ioc_type]
      );

      let sharedId: number;
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE shared_threat_intel SET contributor_count = contributor_count + 1,
           confidence = GREATEST(confidence, $2), propagated_at = NOW()
           WHERE id = $1`,
          [existing.rows[0].id, nom.confidence]
        );
        sharedId = existing.rows[0].id;
      } else {
        const inserted = await pool.query(
          `INSERT INTO shared_threat_intel (source_ioc_value, ioc_type, reputation, confidence, threat_type, tags, contributor_count, propagated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 1, NOW()) RETURNING id`,
          [nom.ioc_value, nom.ioc_type, nom.reputation, nom.confidence, nom.threat_type, JSON.stringify(nom.tags ?? [])]
        );
        sharedId = inserted.rows[0].id;
        propagated++;
      }

      await pool.query(
        `UPDATE tenant_intel_nominations SET shared_threat_intel_id = $1, status = 'propagated', updated_at = NOW() WHERE id = $2`,
        [sharedId, nom.id]
      );

      await pool.query(
        `UPDATE tenant_intel_sharing_settings
         SET ioc_contributed = ioc_contributed + 1, contribution_score = contribution_score + 10, updated_at = NOW()
         WHERE tenant_id = $1`,
        [nom.tenant_id]
      );

      const tenants = await pool.query<{ id: number }>(
        `SELECT t.id FROM tenants t
         LEFT JOIN tenant_intel_sharing_settings s ON t.id = s.tenant_id
         WHERE t.id != $1 AND COALESCE(s.receiving_enabled, TRUE) = TRUE AND t.is_active = TRUE`,
        [nom.tenant_id]
      );

      for (const tenant of tenants.rows) {
        const { query: matchQuery, params: matchParams } = buildEventMatchQuery(nom.ioc_type, tenant.id, nom.ioc_value);
        const matches = await pool.query<{ count: string }>(matchQuery, matchParams);
        const matchCount = parseInt(matches.rows[0]?.count ?? "0", 10);

        const dbIocType = normalizeIocType(nom.ioc_type ?? "domain");
        const validReputations = new Set(["malicious", "suspicious", "clean", "unknown"]);
        const dbReputation = validReputations.has(nom.reputation ?? "") ? nom.reputation : "malicious";

        const iocInsert = await pool.query(
          `INSERT INTO threat_intel_iocs (tenant_id, indicator_type, indicator_value, reputation, confidence, source, tags, context, created_at)
           VALUES ($1, $2::ioc_type, $3, $4::ioc_reputation, $5, 'federated', ARRAY[]::text[], $6, NOW())
           ON CONFLICT (tenant_id, indicator_type, indicator_value) DO UPDATE
             SET reputation = CASE WHEN EXCLUDED.confidence > threat_intel_iocs.confidence THEN EXCLUDED.reputation ELSE threat_intel_iocs.reputation END,
                 confidence = GREATEST(threat_intel_iocs.confidence, EXCLUDED.confidence),
                 source = 'federated'
           RETURNING id, (xmax = 0) AS inserted`,
          [
            tenant.id,
            dbIocType,
            nom.ioc_value,
            dbReputation,
            nom.confidence,
            `Federated from community intel (threat: ${nom.threat_type ?? "unknown"})`,
          ]
        );

        if (iocInsert.rows[0]?.inserted === true) {
          await pool.query(
            `INSERT INTO tenant_intel_sharing_settings (tenant_id, receiving_enabled, ioc_received, updated_at)
             VALUES ($1, TRUE, 1, NOW())
             ON CONFLICT (tenant_id) DO UPDATE
             SET ioc_received = tenant_intel_sharing_settings.ioc_received + 1, updated_at = NOW()`,
            [tenant.id]
          );
        }

        if (matchCount > 0) {
          const priorResult = await pool.query(
            `SELECT COALESCE(matched_event_count, 0) as prior_count FROM community_alert_notifications WHERE tenant_id = $1 AND shared_threat_intel_id = $2`,
            [tenant.id, sharedId]
          );
          const priorCount = parseInt(priorResult.rows[0]?.prior_count ?? "0", 10);
          const delta = Math.max(0, matchCount - priorCount);
          if (delta > 0) {
            await pool.query(
              `UPDATE shared_threat_intel SET match_count = match_count + $1 WHERE id = $2`,
              [delta, sharedId]
            );
          }

          const severity = nom.confidence >= 90 ? "critical" : nom.confidence >= 80 ? "high" : "medium";
          const alertResult = await pool.query(
            `INSERT INTO community_alert_notifications (tenant_id, shared_threat_intel_id, ioc_value, ioc_type, matched_event_count, severity)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, shared_threat_intel_id) DO UPDATE
               SET matched_event_count = GREATEST(community_alert_notifications.matched_event_count, EXCLUDED.matched_event_count)
             RETURNING id, (xmax = 0) AS is_new_alert`,
            [tenant.id, sharedId, nom.ioc_value, nom.ioc_type, matchCount, severity]
          );

          if (alertResult.rows[0]?.is_new_alert === true) {
            alertsGenerated++;
            await pool.query(
              `INSERT INTO platform_notifications (tenant_id, user_id, type, title, message, severity, action_url)
               VALUES ($1, NULL, 'threat_intel', $2, $3, $4, '/threat-intel')`,
              [
                tenant.id,
                `Community Intel Alert: ${nom.ioc_value}`,
                `Federated IOC (${nom.ioc_type}) matched ${matchCount} event(s) in your environment. Severity: ${severity.toUpperCase()}.`,
                severity,
              ]
            );
          }
        }
      }
    } catch (err) {
      const msg = `Propagation error: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`;
      console.error(`[FederatedIntel] nomination ${nom.id} (${nom.ioc_value}) failed:`, (err as Error).message);
      try {
        await pool.query(
          "UPDATE tenant_intel_nominations SET status = 'failed', rejection_reason = $1 WHERE id = $2 AND status = 'propagating'",
          [msg, nom.id]
        );
      } catch (markErr) {
        console.error(`[FederatedIntel] could not mark nomination ${nom.id} as failed:`, (markErr as Error).message);
      }
    }
  }

  try {
    await pool.query(
      "UPDATE tenant_intel_nominations SET status = 'approved' WHERE status = 'propagating' AND updated_at < NOW() - INTERVAL '10 minutes'"
    );
  } catch (err) {
    console.warn("[FederatedIntel] stuck-propagating recovery failed:", (err as Error).message);
  }

  return { processed: nominations.rows.length, propagated, alertsGenerated };
}

export async function getContributionScores(): Promise<Array<{
  tenant_id: number;
  tenant_name: string;
  ioc_contributed: number;
  ioc_received: number;
  contribution_score: number;
  sharing_enabled: boolean;
}>> {
  await ensureFederatedIntelTables();
  const result = await pool.query(
    `SELECT s.tenant_id, t.name as tenant_name, s.ioc_contributed, s.ioc_received,
            s.contribution_score, s.sharing_enabled
     FROM tenant_intel_sharing_settings s
     JOIN tenants t ON t.id = s.tenant_id
     ORDER BY s.contribution_score DESC`
  );
  return result.rows;
}

export async function getPropagationStats(): Promise<{
  totalSharedIOCs: number;
  activeSharedIOCs: number;
  totalMatchCount: number;
  avgContributors: number;
  totalAlerts: number;
  unreadAlerts: number;
  topIOCs: Array<{ ioc_value: string; ioc_type: string; contributor_count: number; match_count: number }>;
  propagationLatencyMs: number | null;
  crossTenantMatchRate: number;
  tenantParticipationCount: number;
}> {
  await ensureFederatedIntelTables();

  const [stats, alerts, topIOCs, latencyResult, matchRateResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COALESCE(SUM(match_count), 0) as total_matches,
        COALESCE(AVG(contributor_count), 0) as avg_contributors
      FROM shared_threat_intel
    `),
    pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_read = FALSE) as unread
      FROM community_alert_notifications
    `),
    pool.query(
      `SELECT source_ioc_value as ioc_value, ioc_type, contributor_count, match_count
       FROM shared_threat_intel WHERE is_active = TRUE
       ORDER BY match_count DESC, contributor_count DESC LIMIT 10`
    ),
    pool.query(`
      SELECT COALESCE(
        AVG(EXTRACT(EPOCH FROM (sti.propagated_at - n.approved_at)) * 1000), NULL
      ) as avg_latency_ms
      FROM shared_threat_intel sti
      JOIN tenant_intel_nominations n ON n.ioc_value = sti.source_ioc_value AND n.ioc_type = sti.ioc_type
      WHERE n.status IN ('approved', 'propagated', 'propagating') AND n.approved_at IS NOT NULL AND sti.propagated_at IS NOT NULL
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE AND match_count > 0) as cross_tenant_matches,
        COUNT(*) FILTER (WHERE is_active = TRUE) as total_active
      FROM shared_threat_intel
    `),
  ]);

  const s = stats.rows[0];
  const a = alerts.rows[0];
  const latencyRaw = latencyResult.rows[0]?.avg_latency_ms;
  const mrRow = matchRateResult.rows[0];
  const totalActive = parseInt(mrRow?.total_active ?? "0", 10);
  const crossTenantMatches = parseInt(mrRow?.cross_tenant_matches ?? "0", 10);
  const crossTenantMatchRate = totalActive > 0 ? parseFloat(((crossTenantMatches / totalActive) * 100).toFixed(1)) : 0;

  const participationResult = await pool.query(
    `SELECT COUNT(DISTINCT tenant_id) as cnt FROM tenant_intel_sharing_settings WHERE sharing_enabled = TRUE OR receiving_enabled = TRUE`
  );

  return {
    totalSharedIOCs: parseInt(s.total, 10),
    activeSharedIOCs: parseInt(s.active, 10),
    totalMatchCount: parseInt(s.total_matches, 10),
    avgContributors: parseFloat(parseFloat(s.avg_contributors).toFixed(1)),
    totalAlerts: parseInt(a.total, 10),
    unreadAlerts: parseInt(a.unread, 10),
    topIOCs: topIOCs.rows,
    propagationLatencyMs: latencyRaw != null ? Math.round(parseFloat(latencyRaw)) : null,
    crossTenantMatchRate,
    tenantParticipationCount: parseInt(participationResult.rows[0]?.cnt ?? "0", 10),
  };
}
