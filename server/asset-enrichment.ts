import { pool } from "./db";

export function isValidIPAddress(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  const trimmed = value.trim();
  const macRegex = /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/;
  if (macRegex.test(trimmed)) return false;
  const hexOnly = /^[0-9a-fA-F]{6,}$/;
  if (hexOnly.test(trimmed)) return false;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(trimmed)) {
    const parts = trimmed.split(".").map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  const ipv6Full = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const ipv6Compressed = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Full.test(trimmed)) return true;
  if (ipv6Compressed.test(trimmed) && trimmed.includes("::")) return true;
  return false;
}

export function sanitizeIPAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(",").map(s => s.trim()).filter(isValidIPAddress);
  if (parts.length === 0) return null;
  return parts[0];
}

export async function cleanInvalidIPAddresses(): Promise<number> {
  const result = await pool.query(`
    UPDATE assets SET ip_address = NULL
    WHERE ip_address IS NOT NULL
      AND ip_address != ''
      AND ip_address !~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'
      AND ip_address !~ ':'
  `);
  return result.rowCount || 0;
}

export async function enrichAssetsFromEvents(tenantId: number): Promise<{ enrichedFromEvents: number; softwareInferred: number; totalUpdated: number }> {
  const cynetEvents = await pool.query(`
    SELECT
      asset as hostname,
      COUNT(*)::int as event_count,
      MAX(occurred_at) as last_seen,
      MAX(raw_payload->>'Scan Group Name') as scan_group,
      MAX(raw_payload->>'Host/Risk') as host_risk,
      MAX(raw_payload->>'User/Risk') as user_risk,
      MAX(CASE WHEN raw_payload->>'EPS Auto-Remediation Action Status' IS NOT NULL THEN 'CynetEPS' END) as has_eps,
      MAX(COALESCE(
        NULLIF(raw_payload->>'EPS Version', ''),
        NULLIF(raw_payload->>'Agent Version', ''),
        NULLIF(raw_payload->>'AgentVersion', ''),
        NULLIF(raw_payload->>'eps_version', ''),
        NULLIF(raw_payload->>'agent_version', '')
      )) as eps_version
    FROM security_events
    WHERE tenant_id = $1
      AND log_source = 'Cynet 360'
      AND asset IS NOT NULL AND asset != ''
    GROUP BY asset
  `, [tenantId]);

  let enrichedCount = 0;
  for (const ev of cynetEvents.rows) {
    const hostname = ev.hostname;
    let riskScore: number | null = null;
    if (ev.host_risk) {
      const parts = ev.host_risk.split("/");
      if (parts.length === 2) {
        const raw = parseFloat(parts[1]) || null;
        if (raw !== null) {
          riskScore = raw > 100 ? Math.round((raw / 1000) * 100) : raw;
        }
      }
    }

    let loggedInUser: string | null = null;
    if (ev.user_risk) {
      const userPart = ev.user_risk.split("/")[0];
      if (userPart) {
        const domainUser = userPart.includes("\\") ? userPart.split("\\")[1] : userPart;
        if (domainUser && domainUser.trim()) {
          loggedInUser = domainUser.trim();
        }
      }
    }

    const epsVersion = ev.eps_version || "active";
    const swEntry = { name: "CynetEPS", category: "Endpoint Security", source: "detected", version: epsVersion };

    const assetRes = await pool.query(
      `SELECT id, software_inventory, agent_version, endpoint_group, last_logged_in_user, source FROM assets WHERE tenant_id = $1 AND hostname = $2 LIMIT 1`,
      [tenantId, hostname]
    );
    if (assetRes.rows.length === 0) continue;
    const asset = assetRes.rows[0];

    let softwareInventory = asset.software_inventory;
    if (!softwareInventory || !Array.isArray(softwareInventory)) {
      softwareInventory = [];
    }
    const cynetEntries = softwareInventory.filter((s: any) => s.name === "CynetEPS");
    if (cynetEntries.length > 1) {
      const hasDetected = cynetEntries.some((s: any) => s.source === "detected");
      softwareInventory = softwareInventory.filter((s: any) => s.name !== "CynetEPS");
      if (hasDetected) {
        softwareInventory.push(swEntry);
      } else {
        softwareInventory.push(swEntry);
      }
    } else if (cynetEntries.length === 1) {
      if (cynetEntries[0].source !== "detected") {
        softwareInventory = softwareInventory.filter((s: any) => s.name !== "CynetEPS");
        softwareInventory.push(swEntry);
      }
    } else {
      softwareInventory.push(swEntry);
    }

    const fortinacEntry = { name: "FortiNAC Persistent Agent", category: "Network Access Control", source: "detected", version: "active" };
    const hasFortiNAC = softwareInventory.some((s: any) => s.name?.includes("FortiNAC"));
    if (!hasFortiNAC && ev.scan_group) {
      softwareInventory.push(fortinacEntry);
    }

    await pool.query(
      `UPDATE assets SET
        agent_version = COALESCE(NULLIF(agent_version, ''), $2),
        endpoint_group = COALESCE(NULLIF(endpoint_group, ''), $3),
        software_inventory = $4::jsonb,
        last_seen = COALESCE($5, last_seen),
        risk_score = COALESCE($6, risk_score),
        last_logged_in_user = COALESCE($7, NULLIF(last_logged_in_user, '')),
        source = CASE WHEN source = 'import' THEN 'enriched' ELSE source END,
        updated_at = NOW()
      WHERE id = $1`,
      [
        asset.id,
        epsVersion !== "active" ? `CynetEPS ${epsVersion}` : "CynetEPS",
        ev.scan_group || asset.endpoint_group,
        JSON.stringify(softwareInventory),
        ev.last_seen,
        riskScore ? Math.round(Math.min(riskScore, 100)) : null,
        loggedInUser,
      ]
    );
    enrichedCount++;
  }

  let swEnrichedCount = 0;
  if (cynetEvents.rows.length > 0) {
    const remainingAssets = await pool.query(
      `SELECT id, hostname FROM assets WHERE tenant_id = $1 AND (software_inventory IS NULL OR software_inventory::text = '[]' OR software_inventory::text = 'null')`,
      [tenantId]
    );
    for (const asset of remainingAssets.rows) {
      const swInventory = [
        { name: "CynetEPS", category: "Endpoint Security", source: "inferred", version: "active" },
      ];
      await pool.query(
        `UPDATE assets SET software_inventory = $2::jsonb, source = CASE WHEN source = 'import' THEN 'enriched' ELSE source END, updated_at = NOW() WHERE id = $1`,
        [asset.id, JSON.stringify(swInventory)]
      );
      swEnrichedCount++;
    }
  }

  return {
    enrichedFromEvents: enrichedCount,
    softwareInferred: swEnrichedCount,
    totalUpdated: enrichedCount + swEnrichedCount,
  };
}

export async function cleanupInferredCynetEPS(): Promise<number> {
  try {
    const cynetTenants = await pool.query(
      `SELECT DISTINCT tenant_id FROM security_events WHERE log_source = 'Cynet 360'`
    );
    const cynetTenantIds = cynetTenants.rows.map((r: any) => r.tenant_id);

    let cleaned = 0;
    if (cynetTenantIds.length === 0) {
      const result = await pool.query(`
        UPDATE assets SET software_inventory = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(software_inventory) elem
          WHERE NOT (elem->>'name' = 'CynetEPS' AND elem->>'source' = 'inferred')
        )
        WHERE software_inventory IS NOT NULL
          AND jsonb_typeof(software_inventory) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(software_inventory) e
            WHERE e->>'name' = 'CynetEPS' AND e->>'source' = 'inferred'
          )
      `);
      cleaned = result.rowCount || 0;
    } else {
      const result = await pool.query(`
        UPDATE assets SET software_inventory = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(software_inventory) elem
          WHERE NOT (elem->>'name' = 'CynetEPS' AND elem->>'source' = 'inferred')
        )
        WHERE tenant_id != ALL($1::int[])
          AND software_inventory IS NOT NULL
          AND jsonb_typeof(software_inventory) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(software_inventory) e
            WHERE e->>'name' = 'CynetEPS' AND e->>'source' = 'inferred'
          )
      `, [cynetTenantIds]);
      cleaned = result.rowCount || 0;
    }

    if (cleaned > 0) {
      console.log(`[Cleanup] Removed inferred CynetEPS from ${cleaned} assets in non-Cynet tenants`);
    }
    return cleaned;
  } catch (err: any) {
    console.error("[Cleanup] CynetEPS cleanup error:", err.message);
    return 0;
  }
}

export async function runStartupEnrichment(): Promise<void> {
  try {
    const tenants = await pool.query(
      `SELECT DISTINCT tenant_id FROM security_events WHERE log_source = 'Cynet 360'`
    );
    if (tenants.rows.length === 0) return;

    for (const t of tenants.rows) {
      const assetCount = await pool.query(
        `SELECT COUNT(*)::int as count FROM assets WHERE tenant_id = $1`,
        [t.tenant_id]
      );
      if (assetCount.rows[0].count === 0) continue;

      const needsEnrichment = await pool.query(
        `SELECT COUNT(*)::int as count FROM assets WHERE tenant_id = $1 AND (source = 'import' OR software_inventory IS NULL OR software_inventory::text = '[]' OR user_name ~ '^[0-9]+$')`,
        [t.tenant_id]
      );
      if (needsEnrichment.rows[0].count > 0) {
        const result = await enrichAssetsFromEvents(t.tenant_id);
        console.log(`[Enrichment] Tenant ${t.tenant_id}: ${result.enrichedFromEvents} from events, ${result.softwareInferred} inferred (${result.totalUpdated} total)`);
      }
    }
  } catch (err) {
    console.error("[Enrichment] Startup enrichment error:", err);
  }
}
