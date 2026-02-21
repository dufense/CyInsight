import { pool } from "./db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import fs from "fs";
import path from "path";

export async function runMigrations() {
  console.log("Running database migrations...");

  const client = await pool.connect();
  try {
    const journalExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);

    const tenantsExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenants'
      );
    `);

    if (tenantsExist.rows[0].exists && !journalExists.rows[0].exists) {
      console.log("Existing database detected without migration journal. Creating baseline...");
      await client.query(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `);

      const metaPath = path.resolve("./migrations/meta/_journal.json");
      const journal = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

      if (journal.entries && journal.entries.length > 0) {
        const firstEntry = journal.entries[0];
        const migrationHash = firstEntry.tag;

        const alreadyApplied = await client.query(
          `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
          [migrationHash]
        );

        if (alreadyApplied.rows.length === 0) {
          await client.query(
            `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
            [migrationHash, Date.now()]
          );
          console.log(`Baseline migration "${migrationHash}" marked as applied (tables already exist).`);
        }
      }
    }
  } finally {
    client.release();
  }

  try {
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./migrations" });
    console.log("Database migrations completed successfully.");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("Database schema is up to date.");
      const journalPath = path.resolve("./migrations/meta/_journal.json");
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
      const client2 = await pool.connect();
      try {
        for (const entry of journal.entries) {
          const applied = await client2.query(
            `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
            [entry.tag]
          );
          if (applied.rows.length === 0) {
            await client2.query(
              `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
              [entry.tag, Date.now()]
            );
            console.log(`Marked migration "${entry.tag}" as applied.`);
          }
        }
      } finally {
        client2.release();
      }
    } else {
      console.error("Migration failed:", error.message);
      throw error;
    }
  }
}
