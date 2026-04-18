import { pool } from "./db";

// ── Generic platform-settings audit helper (Task #196) ──────────────────────
// Task #188 introduced the `platform_settings_audit` table, but each writer
// (originally just the ClickHouse stalled-ingest monitor) was reimplementing
// the same "load previous value → compare → insert audit row" dance. This
// module centralises that pattern so any future admin-tunable platform setting
// gets a consistent who/when/before/after history without re-inventing it.

function logErr(msg: string): void {
  console.error(`[PlatformSettingsAudit] ${msg}`);
}

// Stable JSON stringification so member-order changes don't show up as edits.
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Insert a row into `platform_settings_audit` describing a change to a
 * platform setting. Returns true if a row was actually written (i.e. the
 * value changed), false otherwise. Failures are logged but never thrown —
 * auditing must not block the actual save.
 */
export async function writePlatformSettingsAudit<T>(
  key: string,
  prev: T | null | undefined,
  next: T,
  changedBy?: string | null,
): Promise<boolean> {
  // No-op when nothing actually changed so the history doesn't fill with
  // duplicate rows from accidental re-saves.
  if (prev !== null && prev !== undefined && valuesEqual(prev, next)) {
    return false;
  }
  try {
    await pool.query(
      `INSERT INTO platform_settings_audit (key, prev_value, new_value, changed_by, changed_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
      [
        key,
        prev !== null && prev !== undefined ? JSON.stringify(prev) : null,
        JSON.stringify(next),
        changedBy || null,
      ],
    );
    return true;
  } catch (err: any) {
    logErr(`Failed to write audit row for key=${key}: ${err?.message || err}`);
    return false;
  }
}

export interface PlatformSettingsAuditRow<T = unknown> {
  id: number;
  key: string;
  prevValue: T | null;
  newValue: T;
  changedBy: string | null;
  changedAt: string;
}

/**
 * Fetch the most recent audit rows for a given settings key. Optional
 * `normalize` lets callers coerce stored JSON into a typed shape (handy
 * when a setting's schema has evolved over time).
 */
export async function getPlatformSettingsAudit<T = unknown>(
  key: string,
  limit = 10,
  normalize?: (raw: any) => T,
): Promise<PlatformSettingsAuditRow<T>[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 10), 100);
  try {
    const r = await pool.query(
      `SELECT id, key, prev_value, new_value, changed_by, changed_at
         FROM platform_settings_audit
        WHERE key = $1
        ORDER BY changed_at DESC, id DESC
        LIMIT $2`,
      [key, safeLimit],
    );
    return r.rows.map((row: any) => ({
      id: Number(row.id),
      key: String(row.key),
      prevValue: row.prev_value
        ? (normalize ? normalize(row.prev_value) : (row.prev_value as T))
        : null,
      newValue: normalize ? normalize(row.new_value) : (row.new_value as T),
      changedBy: row.changed_by ?? null,
      changedAt: (row.changed_at instanceof Date
        ? row.changed_at
        : new Date(row.changed_at)
      ).toISOString(),
    }));
  } catch (err: any) {
    logErr(`Failed to load audit history for key=${key}: ${err?.message || err}`);
    return [];
  }
}
