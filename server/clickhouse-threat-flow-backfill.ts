/**
 * One-shot backfill for the new ClickHouse threat-flow detail columns
 * (`threat`, `action`, `recipient`, `description`) added by Task #203.
 *
 * Why this exists
 * ---------------
 * Task #203 added these columns to `ccc.security_events` so the dashboard
 * threat-flow Sankey can render per-threat / per-action / per-recipient detail
 * via the CH fast-path. The dual-write in `storage.chDualWrite` populates them
 * for newly-ingested events, but every row written before that migration was
 * deployed has empty strings — so the fast-path Sankey for those older rows
 * silently degrades to the generic mitre_technique / "Detected" labels (see
 * the `if(empty(...))` fallbacks in the threat-flow CH SQL in routes.ts).
 *
 * Strategy
 * --------
 *  1. Idempotency is gated by a row in `ccc._migrations` named
 *     `threat_flow_columns_backfill_v1` — the same marker pattern used for
 *     the `incidents_dedup_shard_v1` remediation in clickhouse-client.ts.
 *  2. Walk PG `security_events` in (id) batches over the hot retention
 *     window (HOT_RETENTION_DAYS) where `event_hash` is set AND any of
 *     threat/action/recipient/description carries a non-empty value worth
 *     mirroring. We don't bother with rows whose PG copy is also empty —
 *     there's nothing to backfill from.
 *  3. Group each batch by identical (threat, action, recipient, description)
 *     tuples and issue one `ALTER TABLE ... UPDATE` per group with
 *     `WHERE event_id IN (...) AND (... '' ...)`. Grouping cuts the mutation
 *     count dramatically — most rows from the same product/event_type cluster
 *     onto a handful of distinct tuples — and the `'' = empty` predicate
 *     guarantees the mutation is a no-op for any row already populated
 *     (i.e. by a fresh ingest in flight while we backfill).
 *  4. The CH `security_events` table is a (Replicated)MergeTree, NOT a
 *     ReplacingMergeTree, so plain re-INSERT would duplicate rows. ALTER
 *     UPDATE is the only safe in-place option.
 *
 * Failure mode
 * ------------
 * Errors are non-fatal. If a batch fails the marker is NOT written, so the
 * next process restart will re-attempt the backfill. Per-group mutation
 * errors are logged and skipped so a single malformed row can't strand the
 * entire backfill.
 */

import { pool } from "./db";
import { getClickHouseClient, HOT_RETENTION_DAYS } from "./clickhouse-client";

const MIGRATION_NAME = "threat_flow_columns_backfill_v1";
const PG_BATCH_SIZE = 500;
const DESCRIPTION_MAX_LEN = 1000;
// Cap per-mutation IN() list length so the resulting HTTP GET URL stays well
// inside any proxy/ALB URI limits (~8 KB on typical CloudFront/ALB setups).
// 200 64-char hashes ≈ 13 KB on the wire after URL-encoding; 150 keeps a
// comfortable margin even with extra SET / WHERE / SETTINGS bytes.
const CH_MUTATION_ID_CHUNK = 150;

let backfillDone = false;
let backfillRunning = false;

// Observability state (Task #210). The backfill historically logged only to
// the server console — operators had no in-app way to confirm whether the
// migration had finished. We track per-run + cumulative stats here and expose
// them via `getThreatFlowBackfillStatus()` so the admin platform-health page
// can render a progress card.
interface BackfillRunStats {
  updated: number;
  groups: number;
  failedGroups: number;
  durationMs: number;
  finishedAt: string;
  error?: string;
}
let lastAttemptAt: string | null = null;
let lastSuccessAt: string | null = null;
let lastRun: BackfillRunStats | null = null;
let cumulativeUpdated = 0;
let cumulativeGroups = 0;
let cumulativeFailedGroups = 0;
let attemptCount = 0;

// Rolling window of recent run stats used to derive a "rows-per-minute"
// throughput estimate for Task #225. We only retain runs that actually did
// work (updated > 0, durationMs > 0) — otherwise no-op skips would dilute
// the rate.
//
// We retain a longer history (`RECENT_RUN_HISTORY`) so Task #226 can render
// a tiny sparkline of per-run rows/min, while the ETA average in
// `getRecentThroughput()` still uses only the last `RECENT_RUN_AVG_WINDOW`
// runs — keeping the rate responsive to recent system load (e.g. CH
// backpressure) instead of being dragged by stale samples from earlier
// backfill passes.
const RECENT_RUN_AVG_WINDOW = 5;
const RECENT_RUN_HISTORY = 20;
const recentProductiveRuns: { updated: number; durationMs: number }[] = [];

function recordRunForThroughput(run: BackfillRunStats): void {
  if (run.updated <= 0 || run.durationMs <= 0) return;
  recentProductiveRuns.push({ updated: run.updated, durationMs: run.durationMs });
  if (recentProductiveRuns.length > RECENT_RUN_HISTORY) {
    recentProductiveRuns.shift();
  }
}

export interface ThreatFlowBackfillThroughput {
  /** Average rows mirrored per minute across the recent productive runs. */
  rowsPerMinute: number;
  /** Number of recent runs the throughput was averaged over (1..N). */
  sampleRuns: number;
  /** Total duration covered by the sample, in milliseconds. */
  sampleDurationMs: number;
  /** Total rows mirrored across the sample. */
  sampleUpdated: number;
  /** Per-run rows/min for the longer retained history (oldest → newest).
   *  Used by the admin UI to render a tiny throughput sparkline (Task #226).
   *  Each entry is `updated / durationMs * 60_000` for one productive run. */
  samples: number[];
}

export function getRecentThroughput(): ThreatFlowBackfillThroughput | null {
  if (recentProductiveRuns.length === 0) return null;
  // Average over only the most-recent N runs so the ETA stays responsive,
  // but expose the longer retained history as `samples` for the sparkline.
  const avgSlice = recentProductiveRuns.slice(-RECENT_RUN_AVG_WINDOW);
  let updated = 0;
  let durationMs = 0;
  for (const r of avgSlice) {
    updated += r.updated;
    durationMs += r.durationMs;
  }
  if (durationMs <= 0) return null;
  const samples = recentProductiveRuns.map((r) =>
    r.durationMs > 0 ? (r.updated / r.durationMs) * 60_000 : 0,
  );
  return {
    rowsPerMinute: (updated / durationMs) * 60_000,
    sampleRuns: avgSlice.length,
    sampleDurationMs: durationMs,
    sampleUpdated: updated,
    samples,
  };
}

export function isThreatFlowBackfillComplete(): boolean {
  return backfillDone;
}

// Cache the (cheap but still cross-network) `countIf(empty(...))` estimate so
// the every-30s admin poll doesn't hammer ClickHouse with redundant scans.
// 20s gives the UI a near-fresh value without amplifying load when multiple
// admins watch the page concurrently.
const REMAINING_CACHE_TTL_MS = 20_000;
interface RemainingCacheEntry {
  remainingRows: number | null;
  estimatedAt: string;
  error?: string;
}
let remainingCache: { value: RemainingCacheEntry; expiresAt: number } | null = null;
let remainingInflight: Promise<RemainingCacheEntry> | null = null;

export interface ThreatFlowRemainingEstimate {
  /** Approximate number of CH `security_events` rows whose threat / action /
   *  recipient / description columns are all still empty. `null` when the
   *  estimate could not be obtained (CH offline, query error). */
  remainingRows: number | null;
  /** ISO timestamp when this estimate was last computed. */
  estimatedAt: string;
  /** Truncated error message if the count query failed. */
  error?: string;
}

export async function getThreatFlowRemainingEstimate(
  forceRefresh = false,
): Promise<ThreatFlowRemainingEstimate> {
  const now = Date.now();
  if (!forceRefresh && remainingCache && remainingCache.expiresAt > now) {
    return remainingCache.value;
  }
  if (remainingInflight) return remainingInflight;

  const ch = getClickHouseClient();
  if (!ch) {
    const value: RemainingCacheEntry = {
      remainingRows: null,
      estimatedAt: new Date().toISOString(),
      error: "ClickHouse client unavailable",
    };
    remainingCache = { value, expiresAt: now + REMAINING_CACHE_TTL_MS };
    return value;
  }

  const database = process.env.CLICKHOUSE_DATABASE ?? "ccc";
  // `empty(col)` on String columns is true for `''`. We deliberately do NOT
  // restrict to the hot retention window — admins want a true count of rows
  // that the dashboard Sankey would still render with generic fallbacks.
  // The query is a single aggregate over a sparse predicate and runs in well
  // under a second on the typical `security_events` MergeTree.
  const sql = `SELECT countIf(empty(threat) AND empty(action) AND empty(recipient) AND empty(description)) AS remaining FROM ${database}.security_events`;

  remainingInflight = (async (): Promise<RemainingCacheEntry> => {
    try {
      const rows = await ch.queryRows<{ remaining: string | number }>(sql);
      const remainingRows = Number(rows[0]?.remaining ?? 0);
      const value: RemainingCacheEntry = {
        remainingRows: Number.isFinite(remainingRows) ? remainingRows : null,
        estimatedAt: new Date().toISOString(),
      };
      remainingCache = { value, expiresAt: Date.now() + REMAINING_CACHE_TTL_MS };
      return value;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const value: RemainingCacheEntry = {
        remainingRows: null,
        estimatedAt: new Date().toISOString(),
        error: msg.slice(0, 256),
      };
      // Cache failures too (briefly) so a broken CH doesn't get hammered on
      // every poll; the next refresh after TTL will retry.
      remainingCache = { value, expiresAt: Date.now() + REMAINING_CACHE_TTL_MS };
      return value;
    } finally {
      remainingInflight = null;
    }
  })();
  return remainingInflight;
}

export interface ThreatFlowBackfillStatus {
  /** Marker row written in `ccc._migrations` — backfill is finished. */
  complete: boolean;
  /** A backfill pass is currently executing. */
  running: boolean;
  /** ClickHouse client unavailable; backfill cannot run on this process. */
  clickhouseAvailable: boolean;
  /** Total successful invocations attempted (including no-op skips). */
  attempts: number;
  /** ISO timestamp of the most recent invocation, or null if never run. */
  lastAttemptAt: string | null;
  /** ISO timestamp of the most recent run that wrote the completion marker. */
  lastSuccessAt: string | null;
  /** Stats for the most recent run that actually executed work. */
  lastRun: BackfillRunStats | null;
  /** Sum of rows mirrored across every run on this process. */
  cumulativeUpdated: number;
  /** Sum of mutation groups dispatched across every run on this process. */
  cumulativeGroups: number;
  /** Sum of mutation groups that failed across every run on this process. */
  cumulativeFailedGroups: number;
  /** Rows-per-minute averaged across the most recent productive runs (Task
   *  #225). `null` while no productive run has been observed yet. */
  recentThroughput: ThreatFlowBackfillThroughput | null;
}

export function getThreatFlowBackfillStatus(): ThreatFlowBackfillStatus {
  // `getClickHouseClient()` is a cheap module-level lookup — no socket is
  // opened until a query runs — so it's safe to call on each admin poll
  // (every 30s). It lets the UI distinguish "ClickHouse is offline so the
  // backfill can't run on this process" from "still pending".
  return {
    complete: backfillDone,
    running: backfillRunning,
    clickhouseAvailable: getClickHouseClient() !== null,
    attempts: attemptCount,
    lastAttemptAt,
    lastSuccessAt,
    lastRun,
    cumulativeUpdated,
    cumulativeGroups,
    cumulativeFailedGroups,
    recentThroughput: getRecentThroughput(),
  };
}

interface PgRow {
  id: number;
  tenant_id: number;
  event_hash: string;
  threat: string | null;
  action: string | null;
  recipient: string | null;
  description: string | null;
}

interface UpdateGroup {
  tenantId: number;
  threat: string;
  action: string;
  recipient: string;
  description: string;
  eventIds: string[];
}

function escapeChString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function groupRows(rows: PgRow[]): UpdateGroup[] {
  const map = new Map<string, UpdateGroup>();
  for (const r of rows) {
    if (!r.event_hash || typeof r.tenant_id !== "number") continue;
    const threat = (r.threat ?? "").trim();
    const action = (r.action ?? "").trim();
    const recipient = (r.recipient ?? "").trim();
    const description = (r.description ?? "").trim().slice(0, DESCRIPTION_MAX_LEN);
    if (!threat && !action && !recipient && !description) continue;
    // Group by tenant_id too — every CH ALTER UPDATE is tenant-scoped so a
    // hypothetical event_hash collision across tenants can never cross-mutate.
    const key = `${r.tenant_id}\u0000${threat}\u0000${action}\u0000${recipient}\u0000${description}`;
    let g = map.get(key);
    if (!g) {
      g = { tenantId: r.tenant_id, threat, action, recipient, description, eventIds: [] };
      map.set(key, g);
    }
    g.eventIds.push(r.event_hash);
  }
  return Array.from(map.values());
}

async function detectClusterMode(
  ch: { queryRows: <T>(sql: string) => Promise<T[]> },
): Promise<boolean> {
  try {
    const rows = await ch.queryRows<{ cnt: string | number }>(
      `SELECT count() AS cnt FROM system.clusters WHERE cluster = 'ccc_cluster'`,
    );
    const cnt = Number(rows[0]?.cnt ?? 0);
    return cnt > 0;
  } catch {
    return false;
  }
}

export async function backfillChThreatFlowDetails(): Promise<{
  updated: number;
  groups: number;
  skipped: boolean;
}> {
  if (backfillDone || backfillRunning) {
    return { updated: 0, groups: 0, skipped: true };
  }
  const ch = getClickHouseClient();
  if (!ch) return { updated: 0, groups: 0, skipped: true };

  backfillRunning = true;
  attemptCount += 1;
  lastAttemptAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const database = process.env.CLICKHOUSE_DATABASE ?? "ccc";
  let totalUpdated = 0;
  let totalGroups = 0;
  let failedGroups = 0;

  try {
    const useCluster = await detectClusterMode(ch);

    // The cluster DDL in clickhouse-client.ts creates `_migrations`, but the
    // single-node DDL does not. Ensure it exists in both modes so the
    // idempotency marker can always be read/written; otherwise the backfill
    // would re-run forever on single-node deployments.
    const migrationsTableDdl = useCluster
      ? `CREATE TABLE IF NOT EXISTS ${database}._migrations ON CLUSTER ccc_cluster (
           name String, applied_at DateTime64(3) DEFAULT now64()
         ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/_migrations', '{replica}')
         ORDER BY name`
      : `CREATE TABLE IF NOT EXISTS ${database}._migrations (
           name String, applied_at DateTime64(3) DEFAULT now64()
         ) ENGINE = MergeTree() ORDER BY name`;
    try {
      await ch.exec(migrationsTableDdl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) {
        // Fall back to the simpler single-node form if cluster create failed
        // for any reason other than "already exists".
        try {
          await ch.exec(
            `CREATE TABLE IF NOT EXISTS ${database}._migrations (
               name String, applied_at DateTime64(3) DEFAULT now64()
             ) ENGINE = MergeTree() ORDER BY name`,
          );
        } catch { /* surfaced below if the marker query fails too */ }
      }
    }

    const existing = await ch
      .queryRows<{ name: string }>(
        `SELECT name FROM ${database}._migrations WHERE name = '${MIGRATION_NAME}' LIMIT 1`,
      )
      .catch(() => [] as { name: string }[]);
    if (existing.length > 0) {
      backfillDone = true;
      // Treat the marker existing as a successful "completion" observation so
      // the admin UI shows a finished-state timestamp even on a fresh process
      // that joined an already-backfilled cluster.
      lastSuccessAt = new Date().toISOString();
      return { updated: 0, groups: 0, skipped: true };
    }

    const tableTarget = useCluster
      ? `${database}.security_events ON CLUSTER ccc_cluster`
      : `${database}.security_events`;

    const cutoffIso = new Date(
      Date.now() - HOT_RETENTION_DAYS * 86_400_000,
    ).toISOString();

    let lastId = 0;
    while (true) {
      const { rows } = await pool.query<PgRow>(
        `SELECT id, tenant_id, event_hash, threat, action, recipient, description
           FROM security_events
          WHERE id > $1
            AND occurred_at >= $2
            AND event_hash IS NOT NULL
            AND tenant_id IS NOT NULL
            AND (
                 COALESCE(NULLIF(TRIM(threat), ''), '')      <> ''
              OR COALESCE(NULLIF(TRIM(action), ''), '')      <> ''
              OR COALESCE(NULLIF(TRIM(recipient), ''), '')   <> ''
              OR COALESCE(NULLIF(TRIM(description), ''), '') <> ''
            )
          ORDER BY id ASC
          LIMIT $3`,
        [lastId, cutoffIso, PG_BATCH_SIZE],
      );
      if (rows.length === 0) break;

      const groups = groupRows(rows);
      for (const g of groups) {
        const sets = [
          `threat = '${escapeChString(g.threat)}'`,
          `action = '${escapeChString(g.action)}'`,
          `recipient = '${escapeChString(g.recipient)}'`,
          `description = '${escapeChString(g.description)}'`,
        ].join(", ");
        // Chunk the IN() list so the HTTP GET URL never blows past
        // proxy / ALB URI-length limits on large groups.
        for (let i = 0; i < g.eventIds.length; i += CH_MUTATION_ID_CHUNK) {
          const slice = g.eventIds.slice(i, i + CH_MUTATION_ID_CHUNK);
          const idList = slice.map((id) => `'${escapeChString(id)}'`).join(",");
          // The `(threat = '' OR ...)` predicate guarantees the mutation is a
          // no-op for any row that already has the columns populated by the
          // live dual-write — making the backfill safe to retry mid-flight.
          // Tenant-scoped WHERE: even if a CH-side `event_id` (mirrored from
          // PG `event_hash`) ever collided across tenants, the mutation
          // still can't touch another tenant's row.
          const sql =
            `ALTER TABLE ${tableTarget} UPDATE ${sets} ` +
            `WHERE tenant_id = ${g.tenantId} ` +
            `AND event_id IN (${idList}) ` +
            `AND (threat = '' OR action = '' OR recipient = '' OR description = '') ` +
            `SETTINGS mutations_sync = 2, allow_nondeterministic_mutations = 1`;
          try {
            await ch.exec(sql);
            totalUpdated += slice.length;
            totalGroups += 1;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            failedGroups += 1;
            console.warn(
              `[ClickHouse] threat-flow backfill mutation error (continuing): ${msg.slice(0, 256)}`,
            );
          }
        }
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < PG_BATCH_SIZE) break;
    }

    if (failedGroups > 0) {
      // Don't write the marker — leave the next retry tick to re-attempt the
      // failed window. Without this guard a partial backfill would silently
      // be marked "complete" and the missing rows would never be revisited.
      console.warn(
        `[ClickHouse] Threat-flow detail backfill ended with ${failedGroups} failed mutation groups; ` +
        `marker NOT written, next retry will re-attempt. ` +
        `Succeeded: ${totalUpdated} rows / ${totalGroups} groups.`,
      );
      cumulativeUpdated += totalUpdated;
      cumulativeGroups += totalGroups;
      cumulativeFailedGroups += failedGroups;
      lastRun = {
        updated: totalUpdated,
        groups: totalGroups,
        failedGroups,
        durationMs: Date.now() - startedAtMs,
        finishedAt: new Date().toISOString(),
        error: `${failedGroups} mutation group(s) failed; will retry`,
      };
      recordRunForThroughput(lastRun);
      return { updated: totalUpdated, groups: totalGroups, skipped: false };
    }

    await ch.exec(
      `INSERT INTO ${database}._migrations (name) VALUES ('${MIGRATION_NAME}')`,
    );
    backfillDone = true;
    cumulativeUpdated += totalUpdated;
    cumulativeGroups += totalGroups;
    lastRun = {
      updated: totalUpdated,
      groups: totalGroups,
      failedGroups: 0,
      durationMs: Date.now() - startedAtMs,
      finishedAt: new Date().toISOString(),
    };
    recordRunForThroughput(lastRun);
    lastSuccessAt = lastRun.finishedAt;
    console.log(
      `[ClickHouse] Threat-flow detail backfill complete: ${totalUpdated} rows mirrored across ${totalGroups} mutation groups`,
    );
    return { updated: totalUpdated, groups: totalGroups, skipped: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ClickHouse] Threat-flow backfill error (will retry next startup): ${msg}`,
    );
    cumulativeUpdated += totalUpdated;
    cumulativeGroups += totalGroups;
    cumulativeFailedGroups += failedGroups;
    lastRun = {
      updated: totalUpdated,
      groups: totalGroups,
      failedGroups,
      durationMs: Date.now() - startedAtMs,
      finishedAt: new Date().toISOString(),
      error: msg.slice(0, 256),
    };
    recordRunForThroughput(lastRun);
    return { updated: totalUpdated, groups: totalGroups, skipped: false };
  } finally {
    backfillRunning = false;
  }
}
