import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

const MARKER_DIR = path.join(process.cwd(), "migration-data");

let tableVerified: boolean | null = null;

/**
 * Verify the migration_markers table exists (created by db:push / schema migration).
 * Caches the result so the check only runs once per process.
 * Logs a clear startup warning if the table is absent rather than silently creating it.
 */
async function verifyTable(): Promise<boolean> {
  if (tableVerified !== null) return tableVerified;
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'migration_markers'
       ) AS exists`
    );
    tableVerified = rows[0]?.exists === true;
    if (!tableVerified) {
      console.error(
        "[MigrationMarker] WARN: migration_markers table not found in the database. " +
        "Run 'npm run db:push' to create it. Falling back to filesystem markers."
      );
    }
  } catch (e: any) {
    tableVerified = false;
    console.error("[MigrationMarker] Could not verify migration_markers table:", e.message?.substring(0, 120));
  }
  return tableVerified;
}

/**
 * Check whether a one-time migration/backfill has already been completed.
 *
 * Checks the database first (authoritative). If the DB has no record but a
 * legacy filesystem marker file exists, the state is promoted to the database
 * immediately so future startups never hit the filesystem again. This makes
 * the transition transparent — no migration ever re-runs on an existing env.
 *
 * Falls back to the filesystem if the DB table is missing or a query fails,
 * so a transient DB error can never accidentally trigger a destructive migration.
 */
export async function hasMarker(key: string): Promise<boolean> {
  try {
    const tableReady = await verifyTable();
    if (!tableReady) {
      const fsPath = path.join(MARKER_DIR, key);
      return fs.existsSync(fsPath);
    }

    const { rows } = await pool.query(
      "SELECT 1 FROM migration_markers WHERE key = $1",
      [key]
    );
    if (rows.length > 0) return true;

    const fsPath = path.join(MARKER_DIR, key);
    if (fs.existsSync(fsPath)) {
      await setMarker(key, { promotedFromFilesystem: true, promotedAt: new Date().toISOString() });
      return true;
    }

    return false;
  } catch (e: any) {
    console.error(`[MigrationMarker] DB check failed for "${key}", falling back to filesystem:`, e.message?.substring(0, 120));
    const fsPath = path.join(MARKER_DIR, key);
    return fs.existsSync(fsPath);
  }
}

/**
 * Record that a one-time migration/backfill has completed. Writes to the DB
 * only. Silently ignores duplicate inserts (ON CONFLICT DO NOTHING).
 */
export async function setMarker(key: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    const tableReady = await verifyTable();
    if (!tableReady) {
      console.warn(`[MigrationMarker] Cannot set marker "${key}": migration_markers table not available.`);
      return;
    }
    await pool.query(
      `INSERT INTO migration_markers (key, completed_at, metadata)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, metadata !== undefined ? JSON.stringify(metadata) : null]
    );
  } catch (e: any) {
    console.error(`[MigrationMarker] Failed to set marker "${key}":`, e.message?.substring(0, 120));
  }
}
