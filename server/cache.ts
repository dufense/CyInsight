/**
 * Distributed cache: Redis when REDIS_URL is set, in-process LRU otherwise.
 *
 * When Redis is enabled the LRU is NOT used for data — Redis is the sole
 * authoritative store so that invalidations (deleteCache / deleteCachePrefix /
 * flushAllCache) propagate to every worker immediately without pub/sub.
 * The LRU is used only when REDIS_URL is absent (single-process dev/test).
 *
 * Rate-limiting: makeRateLimitStore(windowMs, limiterPrefix) returns an
 * express-rate-limit Store per limiter with its own Redis keyspace and its own
 * isolated in-memory fallback counter map.
 */

import LRU from "lru-cache";
import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import type { Store } from "express-rate-limit";

const CACHE_TTLS_MS = {
  dashboard: 120_000,
  incidents:  30_000,
  events:     60_000,
  default:    60_000,
};

export function getCacheTTL(key: string): number {
  if (key.includes("dashboard") || key.includes("stats")) return CACHE_TTLS_MS.dashboard;
  if (key.includes("incident"))                             return CACHE_TTLS_MS.incidents;
  if (key.includes("event"))                                return CACHE_TTLS_MS.events;
  return CACHE_TTLS_MS.default;
}

// LRU — only active when Redis is not configured (REDIS_URL absent)
const lru = new LRU<string, unknown>({ max: 500, maxAge: CACHE_TTLS_MS.default });

let _hits   = 0;
let _misses = 0;
let _redisErrors = 0;

const REDIS_URL = process.env.REDIS_URL;
const CACHE_NS  = "ccc:cache:";

let redisClient: Redis | null = null;
let redisReady  = false;
let redisConnectError: string | null = null;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect:           true,
      maxRetriesPerRequest:  2,
      enableOfflineQueue:    false,
      connectTimeout:        3_000,
      commandTimeout:        200,
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });

    redisClient.on("ready", () => {
      redisReady = true;
      redisConnectError = null;
      console.log("[Cache] Redis connected and ready");
    });
    redisClient.on("error", (err: Error) => {
      if (redisReady) console.warn("[Cache] Redis connection error:", err.message);
      redisReady = false;
      redisConnectError = err.message;
    });
    redisClient.on("close",        () => { redisReady = false; });
    redisClient.on("reconnecting", () => { console.log("[Cache] Redis reconnecting…"); });

    redisClient.connect().catch((err: Error) => {
      redisConnectError = err.message;
      console.warn("[Cache] Redis initial connect failed (will retry):", err.message);
    });
  } catch (err: unknown) {
    console.warn("[Cache] Redis client init failed:", err instanceof Error ? err.message : String(err));
    redisClient = null;
  }
} else {
  console.warn(
    "[Cache] REDIS_URL not set — LOCAL FALLBACK mode: " +
    "cache=in-process LRU (not shared across workers), " +
    "rate-limiting=in-memory MemoryStore, sessions=PostgreSQL. " +
    "Set REDIS_URL for distributed cache/rate-limit/session support."
  );
}

function rkey(key: string): string { return `${CACHE_NS}${key}`; }

async function redisDelByPrefix(prefix: string): Promise<void> {
  if (!redisClient || !redisReady) return;
  try {
    const pattern = `${CACHE_NS}${prefix}*`;
    let cursor = "0";
    do {
      const [next, keys] = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await redisClient.del(...keys);
    } while (cursor !== "0");
  } catch { _redisErrors++; }
}

async function redisFlushNamespace(): Promise<void> {
  if (!redisClient || !redisReady) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redisClient.scan(cursor, "MATCH", `${CACHE_NS}*`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await redisClient.del(...keys);
    } while (cursor !== "0");
  } catch { _redisErrors++; }
}

export function tenantCacheKey(tenantId: number | string, suffix: string): string {
  return `t:${tenantId}:${suffix}`;
}

/** Read from cache. Redis is the sole store when REDIS_URL is set. */
export async function getCache(key: string): Promise<unknown | null> {
  if (REDIS_URL) {
    // Redis mode: bypass LRU — Redis is the single authoritative source
    if (!redisClient || !redisReady) {
      _misses++;
      return null;
    }
    try {
      const raw = await redisClient.get(rkey(key));
      if (raw !== null) {
        _hits++;
        return JSON.parse(raw) as unknown;
      }
    } catch { _redisErrors++; }
    _misses++;
    return null;
  }

  // LRU-only mode (no REDIS_URL)
  const val = lru.get(key);
  if (val !== undefined) { _hits++; return val; }
  _misses++;
  return null;
}

/** Write to cache. Uses Redis when configured, LRU otherwise. */
export function setCache(key: string, data: unknown, ttlMs?: number): void {
  const ttl = ttlMs ?? getCacheTTL(key);
  if (REDIS_URL) {
    if (redisClient && redisReady) {
      redisClient.set(rkey(key), JSON.stringify(data), "PX", ttl).catch(() => { _redisErrors++; });
    }
    return;
  }
  lru.set(key, data, ttl);
}

/** Delete one key. Coherent across all workers when Redis is enabled. */
export function deleteCache(key: string): void {
  if (REDIS_URL) {
    if (redisClient && redisReady) {
      redisClient.del(rkey(key)).catch(() => { _redisErrors++; });
    }
    return;
  }
  lru.del(key);
}

/**
 * Evict all keys with the given prefix. Coherent across all workers when Redis
 * is enabled (only Redis keys exist in that mode). Returns a Promise so callers
 * that require strict read-after-write freshness can `await` it; fire-and-forget
 * callers may call it without awaiting.
 */
export async function deleteCachePrefix(prefix: string): Promise<void> {
  if (REDIS_URL) {
    await redisDelByPrefix(prefix);
    return;
  }
  for (const key of lru.keys()) {
    if ((key as string).startsWith(prefix)) lru.del(key as string);
  }
}

/** Flush everything in our cache namespace. */
export function flushAllCache(): void {
  if (!REDIS_URL) lru.reset();
  redisFlushNamespace().catch(() => { /* tracked */ });
}

export interface CacheStats {
  entries:  number;
  hits:     number;
  misses:   number;
  hitRatio: string;
  redis: {
    enabled:   boolean;
    ready:     boolean;
    errors:    number;
    error:     string | null;
  };
}

export function getCacheStats(): CacheStats {
  const total = _hits + _misses;
  return {
    entries:  REDIS_URL ? 0 : lru.length,
    hits:     _hits,
    misses:   _misses,
    hitRatio: total > 0 ? `${((_hits / total) * 100).toFixed(1)}%` : "0.0%",
    redis: {
      enabled: !!REDIS_URL,
      ready:   redisReady,
      errors:  _redisErrors,
      error:   redisConnectError,
    },
  };
}

export interface RedisHealthInfo {
  status:           "connected" | "disconnected" | "not_configured";
  latencyMs:        number | null;
  url:              string | null;
  error:            string | null;
  memoryUsed:       string | null;
  memoryMax:        string | null;
  keyspaceHits:     number | null;
  keyspaceMisses:   number | null;
  keyspaceHitRatio: string | null;
}

function maskRedisUrl(url: string): string {
  return url.replace(/:\/\/[^@]*@/, "://*@");
}

function parseInfoField(info: string, field: string): string | null {
  const m = new RegExp(`^${field}:(.+)$`, "m").exec(info);
  return m ? m[1].trim() : null;
}

export async function getRedisHealth(): Promise<RedisHealthInfo> {
  const maskedUrl = REDIS_URL ? maskRedisUrl(REDIS_URL) : null;

  if (!REDIS_URL) {
    return {
      status: "not_configured", latencyMs: null, url: null, error: null,
      memoryUsed: null, memoryMax: null,
      keyspaceHits: null, keyspaceMisses: null, keyspaceHitRatio: null,
    };
  }
  if (!redisClient || !redisReady) {
    return {
      status: "disconnected", latencyMs: null, url: maskedUrl, error: redisConnectError,
      memoryUsed: null, memoryMax: null,
      keyspaceHits: null, keyspaceMisses: null, keyspaceHitRatio: null,
    };
  }

  try {
    const start = Date.now();
    const [, memInfo, statsInfo] = await Promise.all([
      redisClient.ping(),
      redisClient.info("memory").catch(() => ""),
      redisClient.info("stats").catch(() => ""),
    ]);
    const latencyMs   = Date.now() - start;
    const memoryUsed  = parseInfoField(memInfo, "used_memory_human");
    const memoryMax   = parseInfoField(memInfo, "maxmemory_human");
    const hitsStr     = parseInfoField(statsInfo, "keyspace_hits");
    const missesStr   = parseInfoField(statsInfo, "keyspace_misses");
    const ksHits      = hitsStr   ? parseInt(hitsStr)   : null;
    const ksMisses    = missesStr ? parseInt(missesStr) : null;
    const ksTotal     = (ksHits !== null && ksMisses !== null) ? ksHits + ksMisses : null;
    const ksRatio     = (ksTotal !== null && ksTotal > 0)
      ? `${((ksHits! / ksTotal) * 100).toFixed(1)}%`
      : null;

    return {
      status: "connected", latencyMs, url: maskedUrl, error: null,
      memoryUsed, memoryMax,
      keyspaceHits: ksHits, keyspaceMisses: ksMisses, keyspaceHitRatio: ksRatio,
    };
  } catch (err: unknown) {
    return {
      status: "disconnected", latencyMs: null, url: maskedUrl,
      error: err instanceof Error ? err.message : String(err),
      memoryUsed: null, memoryMax: null,
      keyspaceHits: null, keyspaceMisses: null, keyspaceHitRatio: null,
    };
  }
}

interface RateLimitInfo {
  totalHits: number;
  resetTime: Date | undefined;
}

/**
 * Returns an express-rate-limit Store backed by Redis with an isolated in-memory
 * fallback. Each limiter must pass a unique `limiterPrefix` so its Redis keyspace
 * (ccc:rl:<prefix>:) and fallback Map are fully isolated from other limiters.
 * Returns undefined when REDIS_URL is not set (express-rate-limit uses MemoryStore).
 */
export function makeRateLimitStore(windowMs: number, limiterPrefix: string): Store | undefined {
  if (!redisClient || !REDIS_URL) {
    console.warn(`[RateLimit:${limiterPrefix}] REDIS_URL not set — rate limits are in-memory only (not shared across workers)`);
    return undefined;
  }
  console.log(`[RateLimit:${limiterPrefix}] store=redis prefix=ccc:rl:${limiterPrefix}:`);

  const redisStore = new RedisStore({
    sendCommand: (...args: string[]) =>
      (redisClient as Redis).call(...args as [string, ...string[]]) as Promise<number>,
    prefix: `ccc:rl:${limiterPrefix}:`,
  });

  const rlFallbackMap = new Map<string, { count: number; resetAt: number }>();

  // Throttle fallback warnings to at most one per minute per limiter instance
  let lastFallbackWarnAt = 0;
  function warnFallbackOnce(reason: string): void {
    const now = Date.now();
    if (now - lastFallbackWarnAt > 60_000) {
      lastFallbackWarnAt = now;
      console.warn(`[RateLimit:${limiterPrefix}] ${reason} — using in-memory fallback (suppressing further warnings for 60s)`);
    }
  }

  function fallbackIncrement(key: string): RateLimitInfo {
    const now = Date.now();
    const existing = rlFallbackMap.get(key);
    if (!existing || existing.resetAt <= now) {
      rlFallbackMap.set(key, { count: 1, resetAt: now + windowMs });
      return { totalHits: 1, resetTime: new Date(now + windowMs) };
    }
    existing.count++;
    return { totalHits: existing.count, resetTime: new Date(existing.resetAt) };
  }

  const store: Store = {
    // init is called by express-rate-limit to pass its Options (including windowMs).
    // Must be delegated so rate-limit-redis sets its internal this.windowMs before
    // any increment() call; without delegation redisStore.increment() throws.
    init(options: Parameters<NonNullable<Store["init"]>>[0]): void {
      if (redisStore.init) redisStore.init(options);
    },
    async increment(key: string): Promise<RateLimitInfo> {
      if (!redisReady) {
        warnFallbackOnce("Redis unavailable");
        return fallbackIncrement(key);
      }
      try {
        return await redisStore.increment(key);
      } catch (err: unknown) {
        _redisErrors++;
        warnFallbackOnce(`Redis error: ${err instanceof Error ? err.message : String(err)}`);
        return fallbackIncrement(key);
      }
    },
    async decrement(key: string): Promise<void> {
      if (!redisReady) return;
      try { await redisStore.decrement(key); } catch { _redisErrors++; }
    },
    async resetKey(key: string): Promise<void> {
      rlFallbackMap.delete(key);
      if (!redisReady) return;
      try { await redisStore.resetKey(key); } catch { _redisErrors++; }
    },
    async resetAll(): Promise<void> {
      rlFallbackMap.clear();
      if (!redisReady) return;
      try { if (redisStore.resetAll) await redisStore.resetAll(); } catch { _redisErrors++; }
    },
  };

  return store;
}

export function getRedisClient(): Redis | null { return redisClient; }
export function isRedisReady(): boolean        { return redisReady; }
