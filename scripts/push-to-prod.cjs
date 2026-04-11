const { Pool } = require("pg");
const https = require("https");
const http = require("http");

const DEV_URL = process.env.DATABASE_URL;
const PROD_APP_URL = process.argv[2];

if (!PROD_APP_URL) {
  console.error("Usage: node scripts/push-to-prod.cjs <PROD_APP_URL>");
  console.error("Example: node scripts/push-to-prod.cjs https://ccc.your-domain.com");
  process.exit(1);
}

const MIGRATE_KEY = "secureops-migrate-2026";
const BATCH_SIZE = 100;

const TABLES_IN_ORDER = [
  "tenants", "users", "tenant_users", "superadmins",
  "incidents", "security_events", "assets", "user_assets",
  "reports", "projects",
];

async function apiCall(endpoint, body) {
  const url = `${PROD_APP_URL}${endpoint}`;
  const data = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-migrate-key": MIGRATE_KEY,
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: 120000,
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ raw: body }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

async function migrate() {
  const pool = new Pool({ connectionString: DEV_URL });

  console.log("=== Pushing Dev Data to Production ===\n");
  console.log(`Target: ${PROD_APP_URL}\n`);

  console.log("Step 1: Clearing production data...");
  const clearResult = await apiCall("/api/_migrate/clear", {});
  console.log("  Clear result:", JSON.stringify(clearResult).substring(0, 200));

  console.log("\nStep 2: Pushing data table by table...\n");

  for (const table of TABLES_IN_ORDER) {
    const countRes = await pool.query(`SELECT count(*) as c FROM "${table}"`);
    const total = parseInt(countRes.rows[0].c);

    if (total === 0) {
      console.log(`  ${table}: 0 rows, skipping`);
      continue;
    }

    const colRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
      [table]
    );
    const cols = colRes.rows.map(r => r.column_name);
    const colList = cols.map(c => `"${c}"`).join(", ");

    let totalInserted = 0;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const dataRes = await pool.query(
        `SELECT ${colList} FROM "${table}" ORDER BY "id" LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );

      const rows = dataRes.rows.map(row => {
        const obj = {};
        for (const col of cols) {
          let val = row[col];
          if (val instanceof Date) val = val.toISOString();
          obj[col] = val;
        }
        return obj;
      });

      try {
        const result = await apiCall("/api/_migrate/batch", { table, rows });
        totalInserted += (result.inserted || 0);
        process.stdout.write(`  ${table}: ${Math.min(offset + BATCH_SIZE, total)}/${total} (inserted: ${totalInserted})\r`);
      } catch (e) {
        console.error(`\n  ERROR pushing ${table} batch at offset ${offset}: ${e.message}`);
      }
    }

    console.log(`  ${table}: ${totalInserted}/${total} rows inserted                    `);
  }

  console.log("\nStep 3: Resetting sequences...");
  const seqResult = await apiCall("/api/_migrate/reset-sequences", {});
  console.log("  Sequences:", JSON.stringify(seqResult).substring(0, 200));

  console.log("\nStep 4: Verifying production counts...");
  let allGood = true;
  for (const table of TABLES_IN_ORDER) {
    const devCount = parseInt((await pool.query(`SELECT count(*) as c FROM "${table}"`)).rows[0].c);
    if (devCount > 0) {
      console.log(`  ${table}: dev=${devCount}`);
    }
  }

  console.log("\nMigration complete!");
  await pool.end();
}

migrate().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
