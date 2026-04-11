import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "migration-data");

if (!process.argv[2]) {
  console.error("Usage: npx tsx scripts/push-to-prod.ts <PROD_URL>");
  console.error("Example: npx tsx scripts/push-to-prod.ts https://ccc.example.com");
  process.exit(1);
}
const PROD_URL = process.argv[2];
const MIGRATE_KEY = "secureops-migrate-2026";
const BATCH_SIZE = 50;

async function sendBatch(table: string, rows: any[]): Promise<{ inserted: number; total: number }> {
  const resp = await fetch(`${PROD_URL}/api/_migrate/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-migrate-key": MIGRATE_KEY,
    },
    body: JSON.stringify({ table, rows }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function migrateTable(table: string, fileName: string) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping ${table} — file not found`);
    return;
  }
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows, skipping`);
    return;
  }

  let totalInserted = 0;
  const batches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    try {
      const result = await sendBatch(table, batch);
      totalInserted += result.inserted;
      process.stdout.write(`  ${table}: batch ${batchNum}/${batches} — ${result.inserted}/${result.total} inserted\r`);
    } catch (err: any) {
      console.error(`\n  ERROR ${table} batch ${batchNum}: ${err.message}`);
    }
  }
  console.log(`  ${table}: ${totalInserted}/${rows.length} total inserted                    `);
}

async function resetSequences() {
  console.log("\nResetting ID sequences...");
  const resp = await fetch(`${PROD_URL}/api/_migrate/reset-sequences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-migrate-key": MIGRATE_KEY,
    },
  });
  if (resp.ok) {
    const results = await resp.json();
    console.log("  Sequences reset:", JSON.stringify(results));
  } else {
    console.error("  Failed to reset sequences:", await resp.text());
  }
}

async function main() {
  console.log(`Migrating dev data to: ${PROD_URL}`);
  console.log("=".repeat(60));

  const migrationOrder = [
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

  for (const { table, file } of migrationOrder) {
    console.log(`\nMigrating ${table}...`);
    await migrateTable(table, file);
  }

  await resetSequences();

  console.log("\n" + "=".repeat(60));
  console.log("Migration complete!");
}

main().catch(console.error);
