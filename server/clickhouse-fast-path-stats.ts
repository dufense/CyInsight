/**
 * Task #187 — Per-tenant rolling counters of ClickHouse fast-path successes
 * vs failures. Wired in via `logChQuery`, consumed by:
 *   - GET /api/admin/platform-health/clickhouse-fast-path-stats (operator UI)
 *   - clickhouse-fast-path-monitor.ts (alerting / outage promotion)
 *
 * Counters live in-process per worker: 60 one-minute buckets per tenant + a
 * small ring buffer of recent failure samples so operators can see *what*
 * failed, not just the rate. Each worker also periodically UPSERTs its dirty
 * buckets into `clickhouse_fast_path_buckets` so the monitor and stats
 * endpoint can SUM across all workers — single-worker counters would otherwise
 * miss thresholds when traffic is spread across the cluster.
 */

import { randomUUID } from "crypto";
import { pool } from "./db";

const BUCKET_MS = 60_000;
const BUCKETS = 60; // → 1-hour rolling window
const MAX_RECENT_FAILURES_PER_TENANT = 25;
const MAX_RECENT_FAILURES_PER_BUCKET = 10;
const FLUSH_INTERVAL_MS = 30_000;
const RETENTION_MS = (BUCKETS + 5) * BUCKET_MS; // a little slack for read-side window

interface Bucket {
  ts: number;
  success: number;
  failure: number;
  recentFailures: FailureSample[];
}

interface FailureSample {
  ts: number;
  op: string;
  error: string;
}

interface TenantState {
  buckets: Bucket[];
  recentFailures: FailureSample[]; // tenant-wide ring buffer for fast in-memory inspection
}

const tenants = new Map<number, TenantState>();
const dirtyBuckets = new Set<string>(); // "tenantId:bucketTs"

const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;
let flushTimer: NodeJS.Timeout | null = null;
let flushRunning = false;
let lastRetentionSweep = 0;

function bucketStart(ts: number): number {
  return ts - (ts % BUCKET_MS);
}

function getOrCreate(tenantId: number): TenantState {
  let s = tenants.get(tenantId);
  if (!s) {
    s = { buckets: [], recentFailures: [] };
    tenants.set(tenantId, s);
  }
  return s;
}

function pushSample(state: TenantState, success: boolean, now: number, sample?: FailureSample): Bucket {
  const bs = bucketStart(now);
  let last = state.buckets[state.buckets.length - 1];
  if (!last || last.ts !== bs) {
    last = { ts: bs, success: 0, failure: 0, recentFailures: [] };
    state.buckets.push(last);
    const cutoff = now - BUCKETS * BUCKET_MS;
    while (state.buckets.length > BUCKETS || (state.buckets[0] && state.buckets[0].ts < cutoff)) {
      state.buckets.shift();
    }
  }
  if (success) last.success++;
  else last.failure++;
  if (sample) {
    last.recentFailures.push(sample);
    while (last.recentFailures.length > MAX_RECENT_FAILURES_PER_BUCKET) {
      last.recentFailures.shift();
    }
  }
  return last;
}

/**
 * Record a single CH fast-path attempt. `name` is the logChQuery operation
 * label; names ending with `.failed` count as a failure, otherwise success.
 * `tenantId` and optional `error` come from the logChQuery `extras` map.
 */
export function recordChFastPath(
  name: string,
  _latencyMs: number,
  extras?: Record<string, unknown>,
): void {
  const tenantRaw = extras?.tenant;
  const tenantId =
    typeof tenantRaw === "number" ? tenantRaw : parseInt(String(tenantRaw ?? ""), 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;

  const isFailure = name.endsWith(".failed");
  const op = isFailure ? name.slice(0, -".failed".length) : name;
  const now = Date.now();
  const state = getOrCreate(tenantId);

  let sample: FailureSample | undefined;
  if (isFailure) {
    const errRaw = extras?.error;
    const error = typeof errRaw === "string" ? errRaw : errRaw == null ? "unknown" : String(errRaw);
    sample = { ts: now, op, error: error.slice(0, 500) };
    state.recentFailures.push(sample);
    while (state.recentFailures.length > MAX_RECENT_FAILURES_PER_TENANT) {
      state.recentFailures.shift();
    }
  }

  const bucket = pushSample(state, !isFailure, now, sample);
  dirtyBuckets.add(`${tenantId}:${bucket.ts}`);
  // Self-arm the flush loop on first sample so every worker that ever sees CH
  // traffic publishes its counters into the cluster aggregation table.
  if (!flushTimer) startFastPathBucketFlush();
}

export interface TenantFastPathStats {
  tenantId: number;
  windowMinutes: number;
  successes: number;
  failures: number;
  attempts: number;
  failureRate: number;
  recentFailures: Array<{ ts: string; op: string; error: string }>;
}

export interface FastPathStatsSnapshot {
  windowMinutes: number;
  generatedAt: string;
  totals: {
    successes: number;
    failures: number;
    attempts: number;
    failureRate: number;
  };
  tenants: TenantFastPathStats[];
  source: "in_memory" | "cluster";
}

function clampWindowMinutes(m: number): number {
  if (!Number.isFinite(m)) return 10;
  return Math.min(BUCKETS, Math.max(1, Math.round(m)));
}

/**
 * In-process snapshot. Used by tests and as a fallback when the cluster
 * aggregation table is unavailable.
 */
export function getChFastPathStats(windowMinutes = 10): FastPathStatsSnapshot {
  const window = clampWindowMinutes(windowMinutes);
  const now = Date.now();
  const cutoff = now - window * BUCKET_MS;
  const out: TenantFastPathStats[] = [];
  let totalS = 0;
  let totalF = 0;
  for (const [tenantId, state] of Array.from(tenants.entries())) {
    let successes = 0;
    let failures = 0;
    for (const b of state.buckets) {
      if (b.ts < cutoff) continue;
      successes += b.success;
      failures += b.failure;
    }
    const attempts = successes + failures;
    if (attempts === 0 && state.recentFailures.every((f: FailureSample) => f.ts < cutoff)) continue;
    out.push({
      tenantId,
      windowMinutes: window,
      successes,
      failures,
      attempts,
      failureRate: attempts > 0 ? failures / attempts : 0,
      recentFailures: state.recentFailures
        .filter((f: FailureSample) => f.ts >= cutoff)
        .slice(-10)
        .map((f: FailureSample) => ({ ts: new Date(f.ts).toISOString(), op: f.op, error: f.error })),
    });
    totalS += successes;
    totalF += failures;
  }
  out.sort((a, b) => b.failureRate - a.failureRate || b.failures - a.failures);
  const totalAttempts = totalS + totalF;
  return {
    windowMinutes: window,
    generatedAt: new Date(now).toISOString(),
    totals: {
      successes: totalS,
      failures: totalF,
      attempts: totalAttempts,
      failureRate: totalAttempts > 0 ? totalF / totalAttempts : 0,
    },
    tenants: out,
    source: "in_memory",
  };
}

/**
 * Flush dirty in-memory buckets to the cluster aggregation table. Each worker
 * owns its own (tenant_id, bucket_ts, worker_id) row, so concurrent UPSERTs
 * never collide on counts.
 */
export async function flushFastPathBucketsToDb(): Promise<void> {
  if (dirtyBuckets.size === 0) return;
  const snapshot = Array.from(dirtyBuckets);
  dirtyBuckets.clear();

  type Row = {
    tenantId: number;
    bucketTs: number;
    successes: number;
    failures: number;
    recentFailures: FailureSample[];
  };
  const rows: Row[] = [];
  for (const key of snapshot) {
    const [tStr, tsStr] = key.split(":");
    const tenantId = parseInt(tStr, 10);
    const bucketTs = parseInt(tsStr, 10);
    const state = tenants.get(tenantId);
    if (!state) continue;
    const bucket = state.buckets.find(b => b.ts === bucketTs);
    if (!bucket) continue;
    rows.push({
      tenantId,
      bucketTs,
      successes: bucket.success,
      failures: bucket.failure,
      recentFailures: bucket.recentFailures.slice(-MAX_RECENT_FAILURES_PER_BUCKET),
    });
  }
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO clickhouse_fast_path_buckets
           (tenant_id, bucket_ts, worker_id, successes, failures, recent_failures, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
         ON CONFLICT (tenant_id, bucket_ts, worker_id)
         DO UPDATE SET successes = EXCLUDED.successes,
                       failures = EXCLUDED.failures,
                       recent_failures = EXCLUDED.recent_failures,
                       updated_at = NOW()`,
        [
          row.tenantId, row.bucketTs, WORKER_ID,
          row.successes, row.failures,
          JSON.stringify(row.recentFailures.map(f => ({
            ts: new Date(f.ts).toISOString(), op: f.op, error: f.error,
          }))),
        ],
      );
    } catch (err: any) {
      // Re-mark dirty so we retry on next flush; don't lose data.
      dirtyBuckets.add(`${row.tenantId}:${row.bucketTs}`);
      console.error(`[ChFastPathStats] Flush failed for tenant ${row.tenantId} bucket ${row.bucketTs}: ${err.message}`);
    }
  }

  // Periodic retention sweep: drop rows older than the rolling window.
  const now = Date.now();
  if (now - lastRetentionSweep > 5 * 60_000) {
    lastRetentionSweep = now;
    try {
      await pool.query(
        `DELETE FROM clickhouse_fast_path_buckets WHERE bucket_ts < $1`,
        [now - RETENTION_MS],
      );
    } catch { /* non-fatal */ }
  }
}

/**
 * Cluster-wide snapshot: SUMs counts and merges recent_failures across all
 * workers via the aggregation table. Falls back to the in-process snapshot
 * if the table is unavailable so the UI/monitor still see *something*.
 */
export async function getChFastPathStatsCluster(windowMinutes = 10): Promise<FastPathStatsSnapshot> {
  const window = clampWindowMinutes(windowMinutes);
  const now = Date.now();
  const cutoff = now - window * BUCKET_MS;
  // Best-effort flush so this worker's freshest data is visible to the query.
  await flushFastPathBucketsToDb().catch(() => undefined);

  let rows: any[];
  try {
    const r = await pool.query(
      `SELECT tenant_id,
              SUM(successes)::bigint AS successes,
              SUM(failures)::bigint AS failures,
              jsonb_agg(recent_failures) FILTER (WHERE jsonb_array_length(recent_failures) > 0) AS recent_failures
         FROM clickhouse_fast_path_buckets
        WHERE bucket_ts >= $1
        GROUP BY tenant_id`,
      [cutoff],
    );
    rows = r.rows;
  } catch (err: any) {
    console.error(`[ChFastPathStats] Cluster read failed, falling back to in-memory: ${err.message}`);
    return getChFastPathStats(window);
  }

  const out: TenantFastPathStats[] = [];
  let totalS = 0;
  let totalF = 0;
  for (const row of rows) {
    const tenantId = Number(row.tenant_id);
    const successes = Number(row.successes) || 0;
    const failures = Number(row.failures) || 0;
    const attempts = successes + failures;
    if (attempts === 0) continue;
    // recent_failures is jsonb_agg of jsonb arrays — flatten and pick top 10 by ts.
    const merged: Array<{ ts: string; op: string; error: string }> = [];
    const groups = Array.isArray(row.recent_failures) ? row.recent_failures : [];
    for (const arr of groups) {
      if (Array.isArray(arr)) {
        for (const f of arr) {
          if (f && typeof f.ts === "string") {
            merged.push({ ts: f.ts, op: String(f.op ?? ""), error: String(f.error ?? "") });
          }
        }
      }
    }
    merged.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    out.push({
      tenantId,
      windowMinutes: window,
      successes,
      failures,
      attempts,
      failureRate: failures / attempts,
      recentFailures: merged.slice(0, 10),
    });
    totalS += successes;
    totalF += failures;
  }
  out.sort((a, b) => b.failureRate - a.failureRate || b.failures - a.failures);
  const totalAttempts = totalS + totalF;
  return {
    windowMinutes: window,
    generatedAt: new Date(now).toISOString(),
    totals: {
      successes: totalS,
      failures: totalF,
      attempts: totalAttempts,
      failureRate: totalAttempts > 0 ? totalF / totalAttempts : 0,
    },
    tenants: out,
    source: "cluster",
  };
}

/**
 * Start the periodic flush of dirty buckets to the aggregation table. Called
 * from server/index.ts on every worker (each worker has its own counters).
 */
export function startFastPathBucketFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (flushRunning) return;
    flushRunning = true;
    flushFastPathBucketsToDb()
      .catch(err => console.error(`[ChFastPathStats] Flush error: ${err?.message || err}`))
      .finally(() => { flushRunning = false; });
  }, FLUSH_INTERVAL_MS);
}

/** Test-only hook for resetting in-memory counters. */
export function __resetChFastPathStatsForTests(): void {
  tenants.clear();
  dirtyBuckets.clear();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export const __WORKER_ID_FOR_TESTS = WORKER_ID;
