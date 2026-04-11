import pg from "pg";
const { Pool } = pg;
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "migration-data");
const DEV_URL = process.env.DATABASE_URL!;

async function getProductionUrl(): Promise<string> {
  const devUrl = new URL(DEV_URL);
  const host = devUrl.hostname;
  const devMatch = host.match(/^(.+?)-dev\./);
  if (devMatch) {
    return DEV_URL.replace("-dev.", ".");
  }
  const parts = host.split(".");
  if (parts.length >= 2) {
    const epId = parts[0];
    return DEV_URL.replace(epId, epId).replace(/\/[^/]+$/, (m) => m);
  }
  return "";
}

async function main() {
  console.log("Dev DB URL host:", new URL(DEV_URL).hostname);

  const devPool = new Pool({ connectionString: DEV_URL });
  const devCount = await devPool.query("SELECT count(*) FROM tenants");
  console.log("Dev tenants:", devCount.rows[0].count);

  const prodUrlGuess = DEV_URL.replace(
    new URL(DEV_URL).pathname,
    new URL(DEV_URL).pathname
  );

  console.log("\nThis script will read JSON files and insert into the CURRENT database.");
  console.log("To target production, set DATABASE_URL to the production connection string.\n");

  const tables = [
    { table: "tenants", file: "tenants.json" },
    { table: "users", file: "users.json" },
    { table: "superadmins", file: "superadmins.json" },
    { table: "tenant_users", file: "tenant_users.json" },
    { table: "incidents", file: "incidents.json" },
    { table: "security_events", file: "security_events.json" },
    { table: "assets", file: "assets.json" },
    { table: "user_assets", file: "user_assets.json" },
    { table: "reports", file: "reports.json" },
  ];

  for (const { table, file } of tables) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${table} — file not found`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (rows.length === 0) {
      console.log(`${table}: 0 rows, skipping`);
      continue;
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const cols = Object.keys(row);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const vals = cols.map((c) => {
        const v = row[c];
        if (v !== null && typeof v === "object") return JSON.stringify(v);
        if (Array.isArray(v)) return JSON.stringify(v);
        return v;
      });
      try {
        const result = await devPool.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          vals
        );
        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors++;
        if (errors <= 3) {
          console.error(`  Error (${table}): ${e.message?.substring(0, 120)}`);
        }
      }
    }
    console.log(`${table}: ${inserted} inserted, ${skipped} skipped (existing), ${errors} errors (of ${rows.length} total)`);
  }

  const seqTables = [
    "tenants", "tenant_users", "superadmins", "incidents",
    "security_events", "assets", "user_assets", "reports"
  ];
  for (const t of seqTables) {
    try {
      await devPool.query(
        `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true)`
      );
    } catch {}
  }
  console.log("\nSequences reset. Migration complete!");
  await devPool.end();
}

main().catch(console.error);
