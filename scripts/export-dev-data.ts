import pg from "pg";
const { Pool } = pg;
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "migration-data");

async function exportDevData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const testUserPatterns = [
    "test-%", "e2e-%", "admin-flow-%", "admin-test-%",
    "mss-admin-%", "role-switcher-%", "si-test-%",
    "test-asset-%", "test-dash-%", "test-e2e-%",
    "test-hier-%", "test-hierarchy-%", "test-mss-%",
    "test-mssp-%", "test-platform-%", "test-role-%",
    "940D-S", "wMafbg"
  ];
  const testEmailPatterns = ["%@example.com", "%@test.com", "%@secureops-test.com"];

  console.log("Exporting tenants...");
  const tenants = await pool.query("SELECT * FROM tenants ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "tenants.json"), JSON.stringify(tenants.rows, null, 2));
  console.log(`  ${tenants.rows.length} tenants exported`);

  console.log("Exporting real users (excluding test users)...");
  let userWhere = testUserPatterns.map((_, i) => `id NOT LIKE $${i + 1}`).join(" AND ");
  const emailOffset = testUserPatterns.length;
  userWhere += " AND " + testEmailPatterns.map((_, i) => `email NOT LIKE $${emailOffset + i + 1}`).join(" AND ");
  const userParams = [...testUserPatterns, ...testEmailPatterns];
  const users = await pool.query(`SELECT * FROM users WHERE ${userWhere} ORDER BY id`, userParams);
  fs.writeFileSync(path.join(OUTPUT_DIR, "users.json"), JSON.stringify(users.rows, null, 2));
  console.log(`  ${users.rows.length} real users exported`);

  const realUserIds = users.rows.map((u: any) => u.id);
  console.log(`  Real user IDs: ${realUserIds.join(", ")}`);

  console.log("Exporting tenant_users for real users + superadmin...");
  const keepUserIds = [...realUserIds, "superadmin-001"];
  const tuPlaceholders = keepUserIds.map((_, i) => `$${i + 1}`).join(",");
  const tenantUsers = await pool.query(
    `SELECT * FROM tenant_users WHERE user_id IN (${tuPlaceholders}) ORDER BY id`,
    keepUserIds
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "tenant_users.json"), JSON.stringify(tenantUsers.rows, null, 2));
  console.log(`  ${tenantUsers.rows.length} tenant_users exported`);

  console.log("Exporting superadmins...");
  const superadmins = await pool.query("SELECT * FROM superadmins ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "superadmins.json"), JSON.stringify(superadmins.rows, null, 2));
  console.log(`  ${superadmins.rows.length} superadmins exported`);

  console.log("Exporting incidents...");
  const incidents = await pool.query("SELECT * FROM incidents ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "incidents.json"), JSON.stringify(incidents.rows, null, 2));
  console.log(`  ${incidents.rows.length} incidents exported`);

  console.log("Exporting security_events...");
  const secEvents = await pool.query("SELECT * FROM security_events ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "security_events.json"), JSON.stringify(secEvents.rows, null, 2));
  console.log(`  ${secEvents.rows.length} security_events exported`);

  console.log("Exporting assets...");
  const assets = await pool.query("SELECT * FROM assets ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "assets.json"), JSON.stringify(assets.rows, null, 2));
  console.log(`  ${assets.rows.length} assets exported`);

  console.log("Exporting user_assets...");
  const userAssets = await pool.query("SELECT * FROM user_assets ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "user_assets.json"), JSON.stringify(userAssets.rows, null, 2));
  console.log(`  ${userAssets.rows.length} user_assets exported`);

  console.log("Exporting reports...");
  const reports = await pool.query("SELECT * FROM reports ORDER BY id");
  fs.writeFileSync(path.join(OUTPUT_DIR, "reports.json"), JSON.stringify(reports.rows, null, 2));
  console.log(`  ${reports.rows.length} reports exported`);

  await pool.end();
  console.log("\nExport complete! Files saved to:", OUTPUT_DIR);
}

exportDevData().catch(console.error);
