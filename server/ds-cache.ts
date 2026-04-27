import Redis from "ioredis";
import type { Pool } from "pg";

let redisClient: Redis | null = null;
let redisAvailable = false;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!url) return null;
  try {
    redisClient = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 5_000 });
    redisClient.on("ready", () => { redisAvailable = true; });
    redisClient.on("error", () => { redisAvailable = false; });
    redisClient.connect().catch(() => { redisAvailable = false; });
  } catch {
    redisClient = null;
  }
  return redisClient;
}

const TTL_SECONDS = 300;

export async function getCoverage(key: string, pool: Pool): Promise<{ data: any; hit: boolean } | null> {
  const redis = getRedis();
  if (redis && redisAvailable) {
    try {
      const raw = await redis.get(key);
      if (raw) return { data: JSON.parse(raw), hit: true };
    } catch {}
  }
  // PostgreSQL fallback
  try {
    const row = await pool.query(
      `SELECT payload FROM detection_studio_coverage_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1`,
      [key]
    );
    if (row.rows.length > 0) return { data: row.rows[0].payload, hit: true };
  } catch {}
  return null;
}

export async function setCoverage(key: string, data: any, pool: Pool): Promise<void> {
  const redis = getRedis();
  if (redis && redisAvailable) {
    try {
      await redis.set(key, JSON.stringify(data), "EX", TTL_SECONDS);
      return;
    } catch {}
  }
  // PostgreSQL fallback
  pool.query(
    `INSERT INTO detection_studio_coverage_cache (cache_key, payload, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(data)]
  ).catch(() => {});
}
