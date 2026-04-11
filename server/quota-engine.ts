/**
 * Per-Tenant Quota Engine — Task #123
 *
 * Implements a Redis-backed sliding-window token-bucket rate limiter per tenant.
 * Falls back gracefully to an in-memory Map when Redis is unavailable.
 *
 * Quota types:
 *   api_requests_per_second  — enforced per HTTP request on tenant-scoped endpoints
 *   events_per_second        — enforced per ingest event batch
 *
 * Quota tiers (defaults — overridden by `tenant_quotas` table):
 *   standard     : 50 API req/s,  100 events/s,   10 GB storage
 *   professional : 500 API req/s, 1000 events/s, 100 GB storage
 *   enterprise   : unlimited
 */

import Redis from "ioredis";
import { pool } from "./db";

// ── Types ──────────────────────────────────────────────────────────────────────

export type QuotaType = "api_requests_per_second" | "events_per_second" | "storage_gb_max";

export interface TenantQuotaConfig {
  tenantId: number;
  tier: "standard" | "professional" | "enterprise";
  eventsPerSecond: number;
  apiRequestsPerSecond: number;
  storageGb: number;
  isActive: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Milliseconds until the current rate window resets (numeric — use for Retry-After / programmatic delays). */
  resetInMs: number;
  /** ISO-8601 UTC timestamp when the current window resets (always a string — use for logging / human display). */
  resetAt: string;
  tier: string;
}

export interface TenantQuotaStatus {
  tenantId: number;
  tenantName: string;
  tier: string;
  apiLimit: number;
  eventsLimit: number;
  storageGb: number;
  currentApiRate: number;
  currentEventsRate: number;
  apiThrottledCount: number;
  eventsThrottledCount: number;
  lastThrottledAt: string | null;
  isActive: boolean;
}

// ── Tier defaults ──────────────────────────────────────────────────────────────

export const QUOTA_TIER_DEFAULTS: Record<string, { eventsPerSecond: number; apiRequestsPerSecond: number; storageGb: number }> = {
  standard:     { eventsPerSecond: 100,      apiRequestsPerSecond: 50,       storageGb: 10 },
  professional: { eventsPerSecond: 1000,     apiRequestsPerSecond: 500,      storageGb: 100 },
  enterprise:   { eventsPerSecond: 999999,   apiRequestsPerSecond: 999999,   storageGb: 999999 },
};

// ── Redis client (lazy, shared singleton) ─────────────────────────────────────

let redis: Redis | null = null;
let redisReady = false;
let redisDegradedLogged = false;   // emit one-time log when Redis drops after being ready

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    redis.on("ready", () => {
      if (!redisReady && redisDegradedLogged) {
        console.log("[QuotaEngine] Redis reconnected — quota counters resuming Redis-backed mode");
        redisDegradedLogged = false;
      }
      redisReady = true;
    });
    redis.on("error", (err: Error) => {
      if (redisReady && !redisDegradedLogged) {
        console.warn("[QuotaEngine] Redis unavailable — quota counters falling back to in-memory mode:", err.message);
        redisDegradedLogged = true;
      }
      redisReady = false;
    });
    redis.connect().catch((err: Error) => {
      if (!redisDegradedLogged) {
        console.warn("[QuotaEngine] Redis initial connection failed — using in-memory fallback:", err.message);
        redisDegradedLogged = true;
      }
      redisReady = false;
    });
  } catch {
    redis = null;
  }
  return redis;
}

// ── In-memory fallback bucket ──────────────────────────────────────────────────

interface MemBucket {
  tokens: number;
  lastRefill: number;
  throttledCount: number;
  lastThrottledAt: number | null;
}

const memBuckets = new Map<string, MemBucket>();

// ── Real-time usage sliding window (60s) ──────────────────────────────────────
// When Redis is available: uses a Redis sorted set (ZADD + ZCOUNT) for accurate
// cross-process usage tracking. Falls back to process-local circular buffer
// when Redis is unavailable.
//
// Redis key: quota:usage:{tenantId}:{type}  (sorted set, score=epoch_ms, member=epoch_ms+jitter)
// TTL: 120s so keys self-expire even without active traffic.

const usageWindows = new Map<string, number[]>();
const USAGE_WINDOW_MS = 60_000;
// Normalize raw 60-second counts to a per-second rate (count / window_seconds).
// All quota limits are stored as per-second values; usage counters must match the same unit.
const USAGE_WINDOW_SECS = USAGE_WINDOW_MS / 1000; // 60

function recordUsageLocal(tenantId: number, type: QuotaType) {
  const key = `${tenantId}:${type}`;
  const now = Date.now();
  let win = usageWindows.get(key);
  if (!win) { win = []; usageWindows.set(key, win); }
  win.push(now);
  const cutoff = now - USAGE_WINDOW_MS;
  let i = 0;
  while (i < win.length && win[i] < cutoff) i++;
  if (i > 0) win.splice(0, i);
  if (win.length > 100_000) win.splice(0, win.length - 100_000);
}

function getCurrentRateLocal(tenantId: number, type: QuotaType): number {
  const key = `${tenantId}:${type}`;
  const win = usageWindows.get(key);
  if (!win) return 0;
  const cutoff = Date.now() - USAGE_WINDOW_MS;
  let start = 0;
  while (start < win.length && win[start] < cutoff) start++;
  // Normalize to per-second — same unit as the stored quota limits
  return Math.round((win.length - start) / USAGE_WINDOW_SECS);
}

function recordUsage(tenantId: number, type: QuotaType): void {
  const r = getRedis();
  if (r && redisReady) {
    const now = Date.now();
    const rkey = `quota:usage:${tenantId}:${type}`;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    // Fire-and-forget — don't await to avoid blocking hot path
    r.zadd(rkey, now, member).catch(() => {/* ignore */});
    r.zremrangebyscore(rkey, 0, now - USAGE_WINDOW_MS).catch(() => {/* ignore */});
    r.expire(rkey, 120).catch(() => {/* ignore */});
  }
  recordUsageLocal(tenantId, type);
}

async function getCurrentRate(tenantId: number, type: QuotaType): Promise<number> {
  const r = getRedis();
  if (r && redisReady) {
    try {
      const rkey = `quota:usage:${tenantId}:${type}`;
      const count = await r.zcount(rkey, Date.now() - USAGE_WINDOW_MS, "+inf");
      // Normalize to per-second — same unit as the stored quota limits
      return Math.round(count / USAGE_WINDOW_SECS);
    } catch {
      // Redis unavailable — fall through to local
    }
  }
  return getCurrentRateLocal(tenantId, type);
}

function memConsumeToken(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let bucket = memBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now, throttledCount: 0, lastThrottledAt: null };
    memBuckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  if (elapsed >= 1) {
    bucket.tokens = Math.min(limit, bucket.tokens + Math.floor(elapsed * limit));
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    bucket.throttledCount++;
    bucket.lastThrottledAt = now;
    return { allowed: false, remaining: 0 };
  }

  bucket.tokens = Math.max(0, bucket.tokens - 1);
  return { allowed: true, remaining: bucket.tokens };
}

function getMemBucketStats(key: string): { throttledCount: number; lastThrottledAt: number | null; currentRate: number } {
  const bucket = memBuckets.get(key);
  if (!bucket) return { throttledCount: 0, lastThrottledAt: null, currentRate: 0 };
  return {
    throttledCount: bucket.throttledCount,
    lastThrottledAt: bucket.lastThrottledAt,
    currentRate: bucket.tokens,
  };
}

// ── Redis Lua token-bucket (atomic sliding window) ────────────────────────────
//
// Uses a sorted set per key, where each member is a unique request timestamp.
// Atomically removes expired entries, counts remaining, then adds a new entry.
//
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local throttle_key = KEYS[2]

redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window_ms)
local count = redis.call("ZCARD", key)

if count >= limit then
  redis.call("INCR", throttle_key)
  redis.call("EXPIRE", throttle_key, 86400)
  redis.call("SET", KEYS[3], now, "EX", 86400)
  return {0, 0, limit}
end

local uid = now .. math.random(1000000)
redis.call("ZADD", key, now, uid)
redis.call("EXPIRE", key, 2)
local remaining = limit - count - 1
return {1, remaining, limit}
`;

async function redisConsumeToken(
  tenantId: number,
  type: QuotaType,
  limit: number
): Promise<{ allowed: boolean; remaining: number; limit: number } | null> {
  const r = getRedis();
  if (!r || !redisReady) return null;

  const windowMs = 1000;
  const now = Date.now();
  const bucketKey = `quota:${tenantId}:${type}`;
  const throttleKey = `quota:throttle:${tenantId}:${type}`;
  const lastKey = `quota:last_throttle:${tenantId}`;

  try {
    const result = await r.eval(
      TOKEN_BUCKET_SCRIPT,
      3,
      bucketKey,
      throttleKey,
      lastKey,
      String(now),
      String(windowMs),
      String(limit)
    ) as [number, number, number];
    return { allowed: result[0] === 1, remaining: result[1], limit: result[2] };
  } catch {
    return null;
  }
}

// ── Quota config cache (TTL 60s per tenant) ───────────────────────────────────

const configCache = new Map<number, { config: TenantQuotaConfig; fetchedAt: number }>();
const CONFIG_CACHE_TTL_MS = 60_000;

export async function getTenantQuotaConfig(tenantId: number): Promise<TenantQuotaConfig> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const { rows } = await pool.query<{
      tier: string;
      events_per_second: number;
      api_requests_per_second: number;
      storage_gb: number;
      custom_events_per_second: number | null;
      custom_api_requests_per_second: number | null;
      custom_storage_gb: number | null;
      is_active: boolean;
    }>(
      `SELECT tier, events_per_second, api_requests_per_second, storage_gb,
              custom_events_per_second, custom_api_requests_per_second, custom_storage_gb, is_active
       FROM tenant_quotas WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );

    let config: TenantQuotaConfig;
    if (rows.length > 0) {
      const r = rows[0];
      const defaults = QUOTA_TIER_DEFAULTS[r.tier] || QUOTA_TIER_DEFAULTS.standard;
      config = {
        tenantId,
        tier: r.tier as TenantQuotaConfig["tier"],
        eventsPerSecond: r.custom_events_per_second ?? r.events_per_second ?? defaults.eventsPerSecond,
        apiRequestsPerSecond: r.custom_api_requests_per_second ?? r.api_requests_per_second ?? defaults.apiRequestsPerSecond,
        storageGb: r.custom_storage_gb ?? r.storage_gb ?? defaults.storageGb,
        isActive: r.is_active,
      };
    } else {
      // No quota row yet — apply standard tier defaults
      const defaults = QUOTA_TIER_DEFAULTS.standard;
      config = {
        tenantId,
        tier: "standard",
        eventsPerSecond: defaults.eventsPerSecond,
        apiRequestsPerSecond: defaults.apiRequestsPerSecond,
        storageGb: defaults.storageGb,
        isActive: true,
      };
    }

    configCache.set(tenantId, { config, fetchedAt: Date.now() });
    return config;
  } catch {
    const defaults = QUOTA_TIER_DEFAULTS.standard;
    return {
      tenantId,
      tier: "standard",
      eventsPerSecond: defaults.eventsPerSecond,
      apiRequestsPerSecond: defaults.apiRequestsPerSecond,
      storageGb: defaults.storageGb,
      isActive: true,
    };
  }
}

export function invalidateTenantQuotaCache(tenantId: number) {
  configCache.delete(tenantId);
}

// ── Storage usage check (point-in-time, no token bucket) ─────────────────────

async function checkStorageQuota(tenantId: number, config: TenantQuotaConfig): Promise<QuotaCheckResult> {
  const limitGb = config.storageGb;
  const resetAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // storage resets daily

  if (limitGb >= 999999) {
    return { allowed: true, remaining: 999999, limit: limitGb, resetInMs: 86400_000, resetAt, tier: config.tier };
  }

  try {
    // Estimate tenant storage by counting rows in main tables (events + incidents + assets)
    // Each row ≈ 4 KB (rough estimate); convert to GB
    const { rows } = await pool.query<{ row_count: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM security_events WHERE tenant_id = $1) +
         (SELECT COUNT(*) FROM incidents        WHERE tenant_id = $1) +
         (SELECT COUNT(*) FROM assets           WHERE tenant_id = $1)
       )::text AS row_count`,
      [tenantId]
    );
    const rowCount = parseInt(rows[0]?.row_count ?? "0", 10);
    const estimatedGb = (rowCount * 4096) / (1024 * 1024 * 1024); // 4 KB per row
    const usedGb = Math.round(estimatedGb * 100) / 100;
    const remainingGb = Math.max(0, limitGb - usedGb);
    const allowed = usedGb < limitGb;
    return {
      allowed,
      remaining: Math.round(remainingGb * 100) / 100,
      limit: limitGb,
      resetInMs: 86400_000,
      resetAt,
      tier: config.tier,
    };
  } catch {
    // On error, allow (fail open) to avoid blocking storage operations
    return { allowed: true, remaining: limitGb, limit: limitGb, resetInMs: 86400_000, resetAt, tier: config.tier };
  }
}

// ── Main quota check function ─────────────────────────────────────────────────

export async function checkAndConsumeQuota(
  tenantId: number,
  type: QuotaType,
  config?: TenantQuotaConfig
): Promise<QuotaCheckResult> {
  const quotaConfig = config || await getTenantQuotaConfig(tenantId);
  const resetAt = new Date(Date.now() + 1000).toISOString(); // rate quotas reset in ~1s

  // Storage quota is a point-in-time check, not token-bucket
  if (type === "storage_gb_max") {
    return checkStorageQuota(tenantId, quotaConfig);
  }

  // Always record usage for real-time rate tracking
  recordUsage(tenantId, type);

  if (!quotaConfig.isActive) {
    return { allowed: true, remaining: 999999, limit: 999999, resetInMs: 1000, resetAt, tier: quotaConfig.tier };
  }

  const limit = type === "api_requests_per_second"
    ? quotaConfig.apiRequestsPerSecond
    : quotaConfig.eventsPerSecond;

  if (limit >= 999999) {
    return { allowed: true, remaining: 999999, limit, resetInMs: 1000, resetAt, tier: quotaConfig.tier };
  }

  const redisResult = await redisConsumeToken(tenantId, type, limit);
  if (redisResult) {
    return {
      allowed: redisResult.allowed,
      remaining: redisResult.remaining,
      limit: redisResult.limit,
      resetInMs: 1000,
      resetAt,
      tier: quotaConfig.tier,
    };
  }

  // Redis not configured or unavailable — degrade silently to in-memory token bucket.
  // One-time degraded-mode warning is already emitted in getRedis() via redisDegradedLogged.
  const memResult = memConsumeToken(`${tenantId}:${type}`, limit);
  return {
    allowed: memResult.allowed,
    remaining: memResult.remaining,
    limit,
    resetInMs: 1000,
    resetAt,
    tier: quotaConfig.tier,
  };
}

/**
 * checkQuota — non-consuming read-only check (does not decrement token bucket).
 * Returns current allowance without modifying state. Useful for proactive checks
 * before expensive operations or for UI display of remaining capacity.
 */
export async function checkQuota(
  tenantId: number,
  type: QuotaType
): Promise<QuotaCheckResult> {
  const quotaConfig = await getTenantQuotaConfig(tenantId);
  const resetAt = new Date(Date.now() + 1000).toISOString();

  if (type === "storage_gb_max") {
    return checkStorageQuota(tenantId, quotaConfig);
  }

  if (!quotaConfig.isActive) {
    return { allowed: true, remaining: 999999, limit: 999999, resetInMs: 1000, resetAt, tier: quotaConfig.tier };
  }

  const limit = type === "api_requests_per_second"
    ? quotaConfig.apiRequestsPerSecond
    : quotaConfig.eventsPerSecond;

  if (limit >= 999999) {
    return { allowed: true, remaining: 999999, limit, resetInMs: 1000, resetAt, tier: quotaConfig.tier };
  }

  // For read-only check, use current rate to estimate remaining without mutating
  const currentRate = await getCurrentRate(tenantId, type);
  const remaining = Math.max(0, limit - currentRate);
  return {
    allowed: currentRate < limit,
    remaining,
    limit,
    resetInMs: 1000,
    resetAt,
    tier: quotaConfig.tier,
  };
}

// ── Quota status for all tenants (used by Platform Health tab) ────────────────

export async function getAllTenantQuotaStatus(): Promise<TenantQuotaStatus[]> {
  try {
    const { rows } = await pool.query<{
      tenant_id: number;
      tenant_name: string;
      tier: string;
      events_per_second: number;
      api_requests_per_second: number;
      storage_gb: number;
      custom_events_per_second: number | null;
      custom_api_requests_per_second: number | null;
      custom_storage_gb: number | null;
      is_active: boolean;
    }>(`
      SELECT tq.tenant_id, t.name as tenant_name, tq.tier,
             tq.events_per_second, tq.api_requests_per_second, tq.storage_gb,
             tq.custom_events_per_second, tq.custom_api_requests_per_second, tq.custom_storage_gb,
             tq.is_active
      FROM tenant_quotas tq
      JOIN tenants t ON t.id = tq.tenant_id
      ORDER BY tq.tier, t.name
    `);

    const r = getRedis();

    return await Promise.all(rows.map(async (row) => {
      const apiLimit = row.custom_api_requests_per_second ?? row.api_requests_per_second;
      const eventsLimit = row.custom_events_per_second ?? row.events_per_second;

      let apiThrottled = 0;
      let eventsThrottled = 0;
      let lastThrottledAt: string | null = null;

      if (r && redisReady) {
        try {
          const [at, et, lt] = await Promise.all([
            r.get(`quota:throttle:${row.tenant_id}:api_requests_per_second`),
            r.get(`quota:throttle:${row.tenant_id}:events_per_second`),
            r.get(`quota:last_throttle:${row.tenant_id}`),
          ]);
          apiThrottled = parseInt(at || "0", 10);
          eventsThrottled = parseInt(et || "0", 10);
          if (lt) lastThrottledAt = new Date(parseInt(lt, 10)).toISOString();
        } catch {}
      } else {
        const apiStats = getMemBucketStats(`${row.tenant_id}:api_requests_per_second`);
        const evStats = getMemBucketStats(`${row.tenant_id}:events_per_second`);
        apiThrottled = apiStats.throttledCount;
        eventsThrottled = evStats.throttledCount;
        const lat = Math.max(apiStats.lastThrottledAt || 0, evStats.lastThrottledAt || 0);
        if (lat) lastThrottledAt = new Date(lat).toISOString();
      }

      return {
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        tier: row.tier,
        apiLimit,
        eventsLimit,
        storageGb: row.custom_storage_gb ?? row.storage_gb,
        currentApiRate: await getCurrentRate(row.tenant_id, "api_requests_per_second"),
        currentEventsRate: await getCurrentRate(row.tenant_id, "events_per_second"),
        apiThrottledCount: apiThrottled,
        eventsThrottledCount: eventsThrottled,
        lastThrottledAt,
        isActive: row.is_active,
      };
    }));
  } catch (err: any) {
    console.error("[QuotaEngine] Failed to get quota status:", err.message);
    return [];
  }
}

// ── DDL: ensure tenant_quotas table exists (idempotent startup) ───────────────
// Run once at server startup so new / deployed environments create the table
// without needing a separate migration step.

export async function ensureQuotaTable(): Promise<void> {
  try {
    // Create the quota_tier enum type if it doesn't already exist (matches Drizzle pgEnum in schema.ts)
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE quota_tier AS ENUM ('standard', 'professional', 'enterprise');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_quotas (
        id                          SERIAL PRIMARY KEY,
        tenant_id                   INTEGER NOT NULL UNIQUE,
        tier                        quota_tier NOT NULL DEFAULT 'standard',
        events_per_second           INTEGER NOT NULL DEFAULT 100,
        api_requests_per_second     INTEGER NOT NULL DEFAULT 50,
        storage_gb                  INTEGER NOT NULL DEFAULT 10,
        custom_events_per_second    INTEGER,
        custom_api_requests_per_second INTEGER,
        custom_storage_gb           INTEGER,
        is_active                   BOOLEAN NOT NULL DEFAULT true,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Seed a default standard-tier row for any tenant that doesn't have one
    await pool.query(`
      INSERT INTO tenant_quotas (tenant_id, tier, events_per_second, api_requests_per_second, storage_gb)
      SELECT id, 'standard', 100, 50, 10
      FROM tenants
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_quotas WHERE tenant_id = tenants.id
      )
      ON CONFLICT (tenant_id) DO NOTHING
    `);
    console.log("[QuotaEngine] tenant_quotas table ensured");
  } catch (err: any) {
    console.error("[QuotaEngine] ensureQuotaTable failed:", err.message);
  }
}

// ── Replica lag ───────────────────────────────────────────────────────────────

export async function getReplicaLag(): Promise<{
  primary: string;
  replica: string | null;
  lagBytes: number | null;
  lagSeconds: number | null;
  replicaAvailable: boolean;
}> {
  const replicaUrl = process.env.READ_REPLICA_URL;
  const replicaAvailable = !!replicaUrl;

  if (!replicaAvailable) {
    return { primary: "primary", replica: null, lagBytes: null, lagSeconds: null, replicaAvailable: false };
  }

  try {
    // Query pg_stat_replication on the PRIMARY — returns one row per connected standby.
    // This is the correct primary-side view of replication lag.
    const { rows } = await pool.query<{
      application_name: string | null;
      state: string | null;
      lag_bytes: string | null;
      lag_seconds: number | null;
    }>(`
      SELECT
        application_name,
        state,
        (sent_lsn - replay_lsn)::bigint AS lag_bytes,
        EXTRACT(EPOCH FROM write_lag + flush_lag + replay_lag)::float AS lag_seconds
      FROM pg_stat_replication
      LIMIT 1
    `);

    if (rows.length === 0) {
      // No standby currently connected — replica config present but no active standby
      return {
        primary: "primary",
        replica: "read-replica",
        lagBytes: 0,
        lagSeconds: 0,
        replicaAvailable: true,
      };
    }

    const row = rows[0];
    return {
      primary: "primary",
      replica: row.application_name || "read-replica",
      lagBytes: row.lag_bytes != null ? Number(row.lag_bytes) : null,
      lagSeconds: row.lag_seconds ?? null,
      replicaAvailable: true,
    };
  } catch {
    return { primary: "primary", replica: "read-replica", lagBytes: null, lagSeconds: null, replicaAvailable: true };
  }
}
