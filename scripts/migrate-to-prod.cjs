const { Pool } = require("pg");
const fs = require("fs");

const DEV_URL = process.env.DATABASE_URL;

async function exportData() {
  const pool = new Pool({ connectionString: DEV_URL });
  
  const tables = [
    "tenants", "users", "tenant_users", "superadmins",
    "incidents", "security_events", "assets", "user_assets",
    "reports", "report_schedules", "services", "sla_definitions",
    "team_members", "shift_rosters", "projects", "tasks",
    "tickets", "ticket_comments", "ticket_attachments", "ticket_feedback",
    "licenses", "security_integrations"
  ];

  const exportDir = "/tmp/db_export";
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  for (const table of tables) {
    try {
      const countRes = await pool.query(`SELECT count(*) as c FROM "${table}"`);
      const count = parseInt(countRes.rows[0].c);
      
      if (count === 0) {
        console.log(`${table}: 0 rows, skipping`);
        continue;
      }

      const colRes = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
        [table]
      );
      const cols = colRes.rows;
      const colNames = cols.map(c => c.column_name);
      const colList = colNames.map(c => `"${c}"`).join(", ");

      const BATCH = 200;
      let allStatements = [];
      
      allStatements.push(`-- ${table}: ${count} rows`);

      for (let offset = 0; offset < count; offset += BATCH) {
        const dataRes = await pool.query(
          `SELECT ${colList} FROM "${table}" ORDER BY "id" LIMIT ${BATCH} OFFSET ${offset}`
        );

        for (const row of dataRes.rows) {
          const vals = colNames.map(name => {
            const val = row[name];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
            if (typeof val === "number") return String(val);
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            return `'${String(val).replace(/'/g, "''")}'`;
          });
          allStatements.push(
            `INSERT INTO "${table}" (${colList}) VALUES (${vals.join(", ")}) ON CONFLICT (id) DO NOTHING;`
          );
        }
      }

      allStatements.push(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true);`
      );

      const filePath = `${exportDir}/${table}.sql`;
      fs.writeFileSync(filePath, allStatements.join("\n"));
      console.log(`${table}: exported ${count} rows to ${filePath}`);
    } catch (e) {
      console.error(`${table}: ERROR - ${e.message.substring(0, 100)}`);
    }
  }

  await pool.end();
  console.log("\nExport complete! SQL files are in /tmp/db_export/");
}

exportData().catch(e => {
  console.error("Export failed:", e);
  process.exit(1);
});
