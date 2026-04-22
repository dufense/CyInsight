import { pool } from "./db";
import { hasMarker, setMarker } from "./migration-marker";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "migration-data");
const BATCH_SIZE = 150;

async function buildTenantMapping(): Promise<Map<number, number>> {
  const mapping = new Map<number, number>();
  const filePath = path.join(DATA_DIR, "tenants.json");
  if (!fs.existsSync(filePath)) return mapping;

  const devTenants = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const { rows: prodTenants } = await pool.query(`SELECT id, name FROM tenants`);

  const prodByName: Record<string, number> = {};
  for (const pt of prodTenants) {
    prodByName[pt.name.toLowerCase().trim()] = pt.id;
  }

  for (const dt of devTenants) {
    const devName = (dt.name || "").toLowerCase().trim();
    const devNameShort = devName.replace(/\s+(africa|global|international)$/i, "");

    let prodId = prodByName[devName] || prodByName[devNameShort];
    if (!prodId) {
      for (const [pName, pId] of Object.entries(prodByName)) {
        if (pName.includes(devNameShort) || devNameShort.includes(pName)) {
          prodId = pId;
          break;
        }
      }
    }

    if (prodId) {
      mapping.set(dt.id, prodId);
      console.log(`  Tenant map: ${dt.name} (dev:${dt.id}) → prod:${prodId}`);
    } else {
      try {
        if (dt.parent_id && mapping.has(dt.parent_id)) {
          dt.parent_id = mapping.get(dt.parent_id);
        }
        const cols = Object.keys(dt).filter(c => c !== "id");
        const colList = cols.map(c => `"${c}"`).join(", ");
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const vals = cols.map(c => {
          const v = dt[c];
          if (v !== null && typeof v === "object") return JSON.stringify(v);
          return v;
        });
        const result = await pool.query(
          `INSERT INTO tenants (${colList}) VALUES (${placeholders}) RETURNING id`,
          vals
        );
        const newId = result.rows[0].id;
        mapping.set(dt.id, newId);
        prodByName[devName] = newId;
        console.log(`  Tenant new: ${dt.name} (dev:${dt.id}) → prod:${newId}`);
      } catch (e: any) {
        if (e.message?.includes("duplicate key") || e.message?.includes("already exists")) {
          const { rows: found } = await pool.query(`SELECT id FROM tenants WHERE LOWER(name) = $1`, [devName]);
          if (found.length > 0) {
            mapping.set(dt.id, found[0].id);
            console.log(`  Tenant exists: ${dt.name} (dev:${dt.id}) → prod:${found[0].id}`);
          }
        } else {
          console.error(`  Tenant create error for ${dt.name}: ${e.message?.substring(0, 100)}`);
        }
      }
    }
  }

  return mapping;
}

function serializeValue(v: any): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function migrateTableBatch(
  table: string,
  fileName: string,
  tenantMap: Map<number, number>
): Promise<string> {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return `${table}: file not found, skipping`;

  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (rows.length === 0) return `${table}: 0 rows, skipping`;

  for (const row of rows) {
    if (row.tenant_id && tenantMap.has(row.tenant_id)) {
      row.tenant_id = tenantMap.get(row.tenant_id);
    }
  }

  if (table === "incidents") {
    return await migrateIncidentsIncremental(rows, tenantMap);
  }

  if (table === "security_events") {
    return await migrateSecurityEventsIncremental(rows);
  }

  const { rows: countCheck } = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
  const existingCount = parseInt(countCheck[0]?.cnt || "0", 10);
  if (existingCount >= rows.length) {
    return `${table}: already has ${existingCount} rows (expected ${rows.length}), skipping`;
  }
  if (existingCount > 0) {
    console.log(`  ${table}: has ${existingCount} rows (seed: ${rows.length}), importing additively...`);
  }

  const cols = Object.keys(rows[0]).filter(c => c !== "id");
  const colList = cols.map(c => `"${c}"`).join(", ");

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const allVals: any[] = [];
    const rowPlaceholders: string[] = [];

    for (const row of batch) {
      const startIdx = allVals.length;
      const placeholders = cols.map((_, ci) => `$${startIdx + ci + 1}`).join(", ");
      rowPlaceholders.push(`(${placeholders})`);
      for (const c of cols) {
        allVals.push(serializeValue(row[c]));
      }
    }

    try {
      const result = await pool.query(
        `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders.join(", ")}`,
        allVals
      );
      inserted += result.rowCount || batch.length;
    } catch (e: any) {
      errors++;
      if (errors <= 3) {
        console.error(`  Batch error (${table}) at row ${i}: ${e.message?.substring(0, 200)}`);
      }
      for (const row of batch) {
        const singlePlaceholders = cols.map((_, ci) => `$${ci + 1}`).join(", ");
        const singleVals = cols.map(c => serializeValue(row[c]));
        try {
          await pool.query(
            `INSERT INTO "${table}" (${colList}) VALUES (${singlePlaceholders})`,
            singleVals
          );
          inserted++;
        } catch {}
      }
    }
  }

  return `${table}: ${inserted} inserted, ${errors} batch errors (of ${rows.length})`;
}

async function migrateSecurityEventsIncremental(rows: any[]): Promise<string> {
  const { rows: countCheck } = await pool.query(`SELECT COUNT(*) as cnt FROM security_events`);
  const existingCount = parseInt(countCheck[0]?.cnt || "0", 10);

  const seedByTenant: Record<number, any[]> = {};
  for (const row of rows) {
    const tid = row.tenant_id;
    if (!seedByTenant[tid]) seedByTenant[tid] = [];
    seedByTenant[tid].push(row);
  }

  const { rows: dbCounts } = await pool.query(
    `SELECT tenant_id, COUNT(*)::int as cnt, COUNT(*) FILTER (WHERE event_hash IS NOT NULL)::int as polled FROM security_events GROUP BY tenant_id`
  );
  const dbByTenant: Record<number, { cnt: number; polled: number }> = {};
  for (const r of dbCounts) {
    dbByTenant[r.tenant_id] = { cnt: r.cnt, polled: r.polled };
  }

  const tenantsNeedingImport: number[] = [];
  for (const tidStr of Object.keys(seedByTenant)) {
    const tid = parseInt(tidStr);
    const seedCount = seedByTenant[tid].length;
    const dbInfo = dbByTenant[tid] || { cnt: 0, polled: 0 };
    const seedOnlyInDb = dbInfo.cnt - dbInfo.polled;
    if (seedOnlyInDb < seedCount) {
      tenantsNeedingImport.push(tid);
      console.log(`  security_events tenant ${tid}: DB has ${dbInfo.cnt} (${dbInfo.polled} polled + ${seedOnlyInDb} seed), seed has ${seedCount} — gap of ${seedCount - seedOnlyInDb}`);
    } else {
      console.log(`  security_events tenant ${tid}: OK (${dbInfo.cnt} in DB, ${seedCount} in seed)`);
    }
  }

  if (tenantsNeedingImport.length === 0) {
    await fixPipelineStatus();
    return `security_events: ${existingCount} rows in db, all ${rows.length} seed events accounted for — no import needed`;
  }

  console.log(`  security_events: ${tenantsNeedingImport.length} tenant(s) need seed event import: [${tenantsNeedingImport.join(", ")}]`);

  const cols = Object.keys(rows[0]).filter(c => c !== "id");
  const colList = cols.map(c => `"${c}"`).join(", ");
  let totalInserted = 0;
  let totalErrors = 0;

  for (const tid of tenantsNeedingImport) {
    const tenantSeedRows = seedByTenant[tid];
    const dbInfo = dbByTenant[tid] || { cnt: 0, polled: 0 };

    console.log(`  tenant ${tid}: importing seed events additively (preserving ${dbInfo.cnt} existing events)`);

    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < tenantSeedRows.length; i += BATCH_SIZE) {
      const batch = tenantSeedRows.slice(i, i + BATCH_SIZE);
      const allVals: any[] = [];
      const rowPlaceholders: string[] = [];

      for (const row of batch) {
        const startIdx = allVals.length;
        const placeholders = cols.map((_, ci) => `$${startIdx + ci + 1}`).join(", ");
        rowPlaceholders.push(`(${placeholders})`);
        for (const c of cols) {
          allVals.push(serializeValue(row[c]));
        }
      }

      try {
        const result = await pool.query(
          `INSERT INTO security_events (${colList}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING`,
          allVals
        );
        inserted += result.rowCount || 0;
      } catch (e: any) {
        errors++;
        if (errors <= 3) {
          console.error(`  Batch error (security_events tenant ${tid}) at row ${i}: ${e.message?.substring(0, 200)}`);
        }
        for (const row of batch) {
          const singlePlaceholders = cols.map((_, ci) => `$${ci + 1}`).join(", ");
          const singleVals = cols.map(c => serializeValue(row[c]));
          try {
            await pool.query(
              `INSERT INTO security_events (${colList}) VALUES (${singlePlaceholders}) ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING`,
              singleVals
            );
            inserted++;
          } catch {}
        }
      }
    }

    totalInserted += inserted;
    totalErrors += errors;
    console.log(`  tenant ${tid}: imported ${inserted} seed events (${errors} errors)`);
  }

  await fixPipelineStatus();

  const { rows: finalCount } = await pool.query(`SELECT COUNT(*)::int as cnt FROM security_events`);
  const finalTotal = finalCount[0]?.cnt || 0;

  return `security_events: imported ${totalInserted} seed events across ${tenantsNeedingImport.length} tenants (${totalErrors} errors), total now ${finalTotal}`;
}

async function fixPipelineStatus(): Promise<void> {
  const { rows: receivedCheck } = await pool.query(
    `SELECT COUNT(*) as cnt FROM security_events WHERE pipeline_status = 'received' OR pipeline_status IS NULL`
  );
  const receivedCount = parseInt(receivedCheck[0]?.cnt || "0", 10);
  if (receivedCount > 0) {
    const { rowCount } = await pool.query(
      `UPDATE security_events SET pipeline_status = 'stored', stored_at = COALESCE(stored_at, NOW()), normalized_at = COALESCE(normalized_at, NOW()), enriched_at = COALESCE(enriched_at, NOW()), correlated_at = COALESCE(correlated_at, NOW()) WHERE pipeline_status = 'received' OR pipeline_status IS NULL`
    );
    console.log(`  Pipeline status fix: updated ${rowCount} events from 'received' to 'stored'`);
  }
}

async function migrateIncidentsIncremental(
  rows: any[],
  tenantMap: Map<number, number>
): Promise<string> {
  const { createHash } = await import("crypto");
  function computeDedupHash(tenantId: number, title: string, source: string, dateVal: string | Date | null): string {
    const dateStr = dateVal ? new Date(dateVal).toISOString().split("T")[0] : "";
    const key = `${tenantId}|${(title || "").substring(0, 200)}|${source || ""}|${dateStr}`;
    return createHash("sha256").update(key).digest("base64").substring(0, 44);
  }

  const { rows: unhashed } = await pool.query(
    `SELECT id, tenant_id, title, source, created_at FROM incidents WHERE dedup_hash IS NULL`
  );
  if (unhashed.length > 0) {
    console.log(`  Backfilling dedup_hash for ${unhashed.length} existing prod incidents (batch mode)...`);
    const HASH_BATCH = 500;
    for (let i = 0; i < unhashed.length; i += HASH_BATCH) {
      const batch = unhashed.slice(i, i + HASH_BATCH);
      const valueParts: string[] = [];
      const vals: any[] = [];
      for (const row of batch) {
        const hash = computeDedupHash(row.tenant_id, row.title, row.source, row.created_at);
        const idx = vals.length;
        valueParts.push(`($${idx + 1}::integer, $${idx + 2}::text)`);
        vals.push(row.id, hash);
      }
      try {
        await pool.query(
          `UPDATE incidents SET dedup_hash = v.hash FROM (VALUES ${valueParts.join(",")}) AS v(id, hash) WHERE incidents.id = v.id`,
          vals
        );
      } catch (e: any) {
        console.error(`  Batch hash update error at ${i}: ${e.message?.substring(0, 100)}`);
        for (const row of batch) {
          const hash = computeDedupHash(row.tenant_id, row.title, row.source, row.created_at);
          try { await pool.query(`UPDATE incidents SET dedup_hash = $1 WHERE id = $2`, [hash, row.id]); } catch {}
        }
      }
    }
    console.log(`  Backfilled ${unhashed.length} dedup hashes`);
  }

  const { rows: existingHashes } = await pool.query(
    `SELECT dedup_hash FROM incidents WHERE dedup_hash IS NOT NULL`
  );
  const existingSet = new Set(existingHashes.map((r: any) => r.dedup_hash));

  const newRows: any[] = [];
  let skipped = 0;
  for (const row of rows) {
    const hash = computeDedupHash(row.tenant_id, row.title, row.source, row.created_at);
    row.dedup_hash = hash;
    if (existingSet.has(hash)) {
      skipped++;
    } else {
      existingSet.add(hash);
      newRows.push(row);
    }
  }

  if (newRows.length === 0) {
    return `incidents: ${skipped} already exist, 0 new to insert (of ${rows.length})`;
  }

  const cols = Object.keys(newRows[0]).filter(c => c !== "id");
  const colList = cols.map(c => `"${c}"`).join(", ");

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    const allVals: any[] = [];
    const rowPlaceholders: string[] = [];

    for (const row of batch) {
      const startIdx = allVals.length;
      const placeholders = cols.map((_, ci) => `$${startIdx + ci + 1}`).join(", ");
      rowPlaceholders.push(`(${placeholders})`);
      for (const c of cols) {
        allVals.push(serializeValue(row[c]));
      }
    }

    try {
      const result = await pool.query(
        `INSERT INTO incidents (${colList}) VALUES ${rowPlaceholders.join(", ")}`,
        allVals
      );
      inserted += result.rowCount || batch.length;
    } catch (e: any) {
      errors++;
      if (errors <= 3) {
        console.error(`  Batch error (incidents) at row ${i}: ${e.message?.substring(0, 200)}`);
      }
      for (const row of batch) {
        const singlePlaceholders = cols.map((_, ci) => `$${ci + 1}`).join(", ");
        const singleVals = cols.map(c => serializeValue(row[c]));
        try {
          await pool.query(
            `INSERT INTO incidents (${colList}) VALUES (${singlePlaceholders})`,
            singleVals
          );
          inserted++;
        } catch {}
      }
    }
  }

  return `incidents: ${inserted} new inserted, ${skipped} duplicates skipped, ${errors} batch errors (of ${rows.length})`;
}

async function fixTenantParentIds(tenantMap: Map<number, number>): Promise<void> {
  const { rows: allWithParent } = await pool.query(
    `SELECT id, name, parent_id FROM tenants WHERE parent_id IS NOT NULL`
  );
  if (allWithParent.length === 0) return;

  const reverseMap = new Map<number, number>();
  const entries = Array.from(tenantMap.entries());
  for (const [devId, prodId] of entries) {
    reverseMap.set(devId, prodId);
  }

  let fixed = 0;
  for (const t of allWithParent) {
    const { rows: parentExists } = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [t.parent_id]);
    const isOrphaned = parentExists.length === 0;
    const hasMappedParent = reverseMap.has(t.parent_id);

    if (isOrphaned && hasMappedParent) {
      const newParentId = reverseMap.get(t.parent_id)!;
      await pool.query(`UPDATE tenants SET parent_id = $1 WHERE id = $2`, [newParentId, t.id]);
      console.log(`    ${t.name}: parent_id ${t.parent_id} → ${newParentId} (orphan fix)`);
      fixed++;
    } else if (isOrphaned) {
      const { rows: msspTenants } = await pool.query(`SELECT id, name FROM tenants WHERE type = 'mssp' ORDER BY id LIMIT 1`);
      if (msspTenants.length > 0) {
        await pool.query(`UPDATE tenants SET parent_id = $1 WHERE id = $2`, [msspTenants[0].id, t.id]);
        console.log(`    ${t.name}: parent_id ${t.parent_id} → ${msspTenants[0].id} (fallback to ${msspTenants[0].name})`);
        fixed++;
      }
    }
  }

  if (fixed > 0) {
    console.log(`  Fixed ${fixed} tenant parent_id references`);
  }
}

async function fixDataTenantIds(tenantMap: Map<number, number>): Promise<void> {
  const tables = [
    "incidents", "security_events", "assets", "user_assets", "reports",
    "tickets", "projects", "services", "team_members", "shift_rosters",
    "documents", "licenses", "tenant_users", "security_integrations",
  ];
  for (const table of tables) {
    try {
      const { rows: orphaned } = await pool.query(
        `SELECT DISTINCT tenant_id FROM "${table}" WHERE tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = "${table}".tenant_id)`
      );
      if (orphaned.length === 0) continue;

      for (const row of orphaned) {
        const oldId = row.tenant_id;
        const newId = tenantMap.get(oldId);
        if (newId) {
          const { rowCount } = await pool.query(
            `UPDATE "${table}" SET tenant_id = $1 WHERE tenant_id = $2`,
            [newId, oldId]
          );
          console.log(`    ${table}: remapped tenant_id ${oldId} → ${newId} (${rowCount} rows)`);
        }
      }
    } catch {}
  }
}

/**
 * Restore PKF Africa integration rows if they are missing.
 * Tenant ID is resolved dynamically by name so this works in any environment.
 * This is additive-only: it never updates or overwrites existing rows, so real
 * API credentials stored by the admin are never touched. It runs on every startup.
 */
async function restorePKFAfricaIntegrations(): Promise<void> {
  const integrations = [
    {
      platform_key: "cynet",
      platform_name: "Cynet 360 AutoXDR",
      category: "edr_xdr",
      description: "Cynet 360 AutoXDR — endpoint detection and response.",
      status: "disconnected",
      polling_enabled: true,
      polling_interval_minutes: 15,
    },
    {
      platform_key: "skyhigh_sse",
      platform_name: "Skyhigh Security SSE",
      category: "sse_casb",
      description: "Skyhigh Security Service Edge — cloud access security and DLP.",
      status: "disconnected",
      polling_enabled: false,
      polling_interval_minutes: 30,
    },
    {
      platform_key: "fortinac",
      platform_name: "FortiNAC",
      category: "network_security",
      description: "FortiNAC — network access control and device visibility.",
      status: "disconnected",
      polling_enabled: false,
      polling_interval_minutes: 60,
    },
  ];

  try {
    const { rows: tenantRows } = await pool.query<{ id: number }>(
      `SELECT id FROM tenants WHERE name = 'PKF Africa' LIMIT 1`
    );
    if (tenantRows.length === 0) {
      console.log("  [IntegRestore] PKF Africa tenant not found — skipping.");
      return;
    }
    const PKF_TENANT_ID = tenantRows[0].id;

    for (const intg of integrations) {
      const { rowCount } = await pool.query(
        "SELECT id FROM security_integrations WHERE tenant_id = $1 AND platform_key = $2",
        [PKF_TENANT_ID, intg.platform_key]
      );
      if (rowCount === 0) {
        await pool.query(`
          INSERT INTO security_integrations
            (tenant_id, platform_key, platform_name, category, description, status,
             polling_enabled, polling_interval_minutes, last_poll_message, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        `, [
          PKF_TENANT_ID, intg.platform_key, intg.platform_name, intg.category,
          intg.description, intg.status, intg.polling_enabled, intg.polling_interval_minutes,
          "Integration restored — API credentials required. Please re-enter in Security Integrations settings.",
        ]);
        console.log(`  ✓ Restored missing PKF Africa integration: ${intg.platform_name} (tenantId=${PKF_TENANT_ID})`);
      }
    }
  } catch (e: any) {
    console.error("  PKF Africa integration restore error:", e.message?.substring(0, 200));
  }
}

export async function runProdDataMigration() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("No migration-data directory found, skipping data migration.");
    return;
  }

  const dataTables = [
    { table: "incidents", file: "incidents.json" },
    { table: "security_events", file: "security_events.json" },
    { table: "assets", file: "assets.json" },
    { table: "user_assets", file: "user_assets.json" },
    { table: "reports", file: "reports.json" },
  ];

  const tenantMap = await buildTenantMapping();

  await fixTenantParentIds(tenantMap);

  await fixDataTenantIds(tenantMap);

  try {
    const { rowCount } = await pool.query(
      `UPDATE assets SET operating_system = NULL WHERE operating_system IS NOT NULL AND operating_system = hostname`
    );
    if (rowCount && rowCount > 0) {
      console.log(`  OS cleanup: fixed ${rowCount} assets with hostname stored as operating_system`);
    }
  } catch {}

  try {
    const { rowCount: aixFixed } = await pool.query(`
      UPDATE assets
      SET operating_system = 'IBM AIX ' || trim(regexp_replace(operating_system, '.*AIX\\s*', '', 'i'))
      WHERE operating_system ~* '^[A-Za-z0-9]+ AIX'
        AND operating_system NOT LIKE 'IBM AIX%'
    `);
    if (aixFixed && aixFixed > 0) {
      console.log(`  AIX OS cleanup: fixed ${aixFixed} assets with hostname+AIX merged values`);
    }
  } catch (e: any) {
    console.warn("  AIX OS cleanup skipped:", e.message);
  }

  // Always run: restore PKF Africa integrations if they were accidentally deleted.
  // This runs on every startup regardless of the migration marker so recovery is guaranteed.
  await restorePKFAfricaIntegrations();

  // One-time cleanup: remove all algorithmically-seeded fake asset and user-asset records.
  // Seeded assets are identified by hostname pattern matching the generation formula
  // (WKS|CORP|LPT|SRV|DEV|MGT|FIN|OPS)-{tenantId}{000-999}.
  // All user_assets rows are synthetic (seeded when the table was empty; confirmed no real
  // connector data was ever added). The existing .seed_assets_v4 and .seed_user_assets
  // markers are LEFT INTACT so the seed routines do not re-run on the next restart.
  //
  // Safety: the marker INSERT is inside the same DB transaction as the DELETEs so the
  // marker is only persisted when both deletes succeed. If marker persistence fails the
  // transaction rolls back and no data is lost. If the deletes fail the transaction rolls
  // back and the marker is not written, so the next startup will try again.
  if (!(await hasMarker(".purge_seed_data_v1"))) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rowCount: deletedAssets } = await client.query(
        `DELETE FROM assets WHERE hostname ~ '^(WKS|CORP|LPT|SRV|DEV|MGT|FIN|OPS)-\\d+$'`
      );
      const { rowCount: deletedUserAssets } = await client.query(
        `DELETE FROM user_assets`
      );

      const metadata = JSON.stringify({
        completedAt: new Date().toISOString(),
        deletedAssets: deletedAssets ?? 0,
        deletedUserAssets: deletedUserAssets ?? 0,
      });
      await client.query(
        `INSERT INTO migration_markers (key, completed_at, metadata)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (key) DO NOTHING`,
        [".purge_seed_data_v1", metadata]
      );

      await client.query("COMMIT");

      console.log(
        `[PurgeSeed] Marker persisted. Removed ${deletedAssets ?? 0} synthetic asset(s) ` +
        `and ${deletedUserAssets ?? 0} synthetic user_asset(s) from all tenants.`
      );
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[PurgeSeed] Cleanup error (transaction rolled back, no data lost): ${e.message?.substring(0, 200)}`);
    } finally {
      client.release();
    }
  }

  if (await hasMarker(".purged")) {
    console.log(`Purge marker found — skipping seed migration to preserve live data.`);
    return;
  }

  if (await hasMarker(".migrated")) {
    console.log(`Data migration already complete (marker found). Skipping seed import to preserve live data.`);
    return;
  }

  console.log("Starting data migration with tenant ID remapping (batch mode)...");

  console.log(`  Mapped ${tenantMap.size} tenants`);

  for (const { table, file } of dataTables) {
    const result = await migrateTableBatch(table, file, tenantMap);
    console.log(`  ${result}`);
  }

  try {
    const assetsFilePath = path.join(DATA_DIR, "assets.json");
    if (fs.existsSync(assetsFilePath)) {
      const devAssets = JSON.parse(fs.readFileSync(assetsFilePath, "utf8"));
      const osMap = new Map<string, string>();
      for (const asset of devAssets) {
        if (asset.operating_system && asset.hostname) {
          const mappedTenant = tenantMap.has(asset.tenant_id) ? tenantMap.get(asset.tenant_id)! : asset.tenant_id;
          osMap.set(`${mappedTenant}|${asset.hostname}`, asset.operating_system);
        }
      }
      if (osMap.size > 0) {
        const { rows: nullOsAssets } = await pool.query(
          `SELECT id, tenant_id, hostname FROM assets WHERE operating_system IS NULL AND hostname IS NOT NULL`
        );
        const toUpdate: { id: number; os: string }[] = [];
        for (const asset of nullOsAssets) {
          const key = `${asset.tenant_id}|${asset.hostname}`;
          const correctOs = osMap.get(key);
          if (correctOs) toUpdate.push({ id: asset.id, os: correctOs });
        }
        if (toUpdate.length > 0) {
          const OS_BATCH = 300;
          let osFixed = 0;
          for (let i = 0; i < toUpdate.length; i += OS_BATCH) {
            const batch = toUpdate.slice(i, i + OS_BATCH);
            const valueParts: string[] = [];
            const vals: any[] = [];
            for (const u of batch) {
              const idx = vals.length;
              valueParts.push(`($${idx + 1}::integer, $${idx + 2}::text)`);
              vals.push(u.id, u.os);
            }
            try {
              const { rowCount } = await pool.query(
                `UPDATE assets SET operating_system = v.os FROM (VALUES ${valueParts.join(",")}) AS v(id, os) WHERE assets.id = v.id`,
                vals
              );
              osFixed += rowCount || 0;
            } catch {
              for (const u of batch) {
                try {
                  await pool.query(`UPDATE assets SET operating_system = $1 WHERE id = $2`, [u.os, u.id]);
                  osFixed++;
                } catch {}
              }
            }
          }
          console.log(`  OS sync: updated ${osFixed} assets with correct OS from dev data`);
        }
      }
    }
  } catch (e: any) {
    console.error(`  OS sync error: ${e.message?.substring(0, 200)}`);
  }

  try {
    const { rowCount: cynetFixed } = await pool.query(`
      UPDATE security_events 
      SET log_source = 'Cynet 360', source_type = 'Cynet 360'
      WHERE raw_payload->>'Scan Group Name' IS NOT NULL 
        AND log_source != 'Cynet 360'
    `);
    if (cynetFixed && cynetFixed > 0) {
      console.log(`  Cynet fix: updated ${cynetFixed} events with correct log_source='Cynet 360'`);
    }
  } catch (e: any) {
    console.error(`  Cynet log_source fix error: ${e.message?.substring(0, 200)}`);
  }

  const THREAT_MITRE_MAP: [string, string, string][] = [
    ["storage device", "Initial Access", "T1091"],
    ["insertion of storage", "Initial Access", "T1091"],
    ["removable media", "Initial Access", "T1091"],
    ["device control", "Initial Access", "T1091"],
    ["terminate cynet", "Defense Evasion", "T1562"],
    ["attempt to terminate", "Defense Evasion", "T1562"],
    ["disable agent", "Defense Evasion", "T1562"],
    ["kill process", "Defense Evasion", "T1562"],
    ["malicious binary", "Execution", "T1204"],
    ["infected file", "Execution", "T1204"],
    ["file dumped", "Execution", "T1204"],
    ["threat intelligence detection", "Command and Control", "T1071"],
    ["blacklist", "Command and Control", "T1071"],
    ["decoy", "Credential Access", "T1557"],
    ["responder", "Credential Access", "T1557"],
    ["unauthorized file", "Collection", "T1005"],
    ["process monitoring", "Discovery", "T1057"],
    ["network activity inspection", "Discovery", "T1046"],
    ["port scanning", "Discovery", "T1046"],
    ["malware", "Execution", "T1204"],
    ["ransomware", "Impact", "T1486"],
    ["phishing", "Initial Access", "T1566"],
    ["brute force", "Credential Access", "T1110"],
    ["data exfiltration", "Exfiltration", "T1041"],
    ["privilege escalation", "Privilege Escalation", "T1068"],
    ["lateral movement", "Lateral Movement", "T1021"],
    ["vulnerability", "Initial Access", "T1190"],
    ["defense evasion", "Defense Evasion", "T1070"],
    ["rootkit", "Persistence", "T1014"],
    ["webshell", "Persistence", "T1505"],
    ["cryptomining", "Impact", "T1496"],
    ["suspicious process", "Execution", "T1059"],
  ];

  try {
    let totalMitreUpdated = 0;
    for (const [keyword, tactic, technique] of THREAT_MITRE_MAP) {
      const { rowCount } = await pool.query(`
        UPDATE security_events 
        SET mitre_tactic = $1, mitre_technique = $2
        WHERE mitre_tactic IS NULL 
          AND (LOWER(threat) LIKE '%' || $3 || '%' OR LOWER(description) LIKE '%' || $3 || '%')
      `, [tactic, technique, keyword]);
      if (rowCount && rowCount > 0) totalMitreUpdated += rowCount;
    }
    if (totalMitreUpdated > 0) {
      console.log(`  MITRE enrichment backfill: updated ${totalMitreUpdated} events with tactic/technique mappings`);
    }
  } catch (e: any) {
    console.error(`  MITRE backfill error: ${e.message?.substring(0, 200)}`);
  }

  const seqTables = ["tenants", "incidents", "security_events", "assets", "user_assets", "reports"];
  for (const t of seqTables) {
    try {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true)`
      );
    } catch {}
  }

  await setMarker(".migrated", { migratedAt: new Date().toISOString() });
  console.log("Data migration complete! Marker recorded in database.");
}
