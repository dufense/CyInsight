import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as fs from "fs";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ── SSL configuration (RDS / Aurora / Neon / any TLS-required PG) ─────────────
// Priority order:
//   1. DB_SSL=true  forces SSL with rejectUnauthorized=false (self-signed / RDS)
//   2. DB_SSL_CA=<path>  forces SSL + verifies against the supplied CA bundle
//      (recommended for production RDS — download from AWS)
//   3. DATABASE_URL contains sslmode=require  → rely on pg to handle it
//   4. NODE_ENV=production and no explicit opt-out → enable SSL by default
//      (safe for RDS; harmless for pg instances that allow both)
function buildSslConfig(): pg.PoolConfig["ssl"] {
  const explicit = process.env.DB_SSL;

  if (explicit === "false" || explicit === "0") {
    return false;
  }

  if (explicit === "true" || explicit === "1") {
    const caPath = process.env.DB_SSL_CA;
    if (caPath) {
      try {
        return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
      } catch {
        console.warn("[DB SSL] Could not read DB_SSL_CA file — falling back to rejectUnauthorized=false");
      }
    }
    return { rejectUnauthorized: false };
  }

  const url = process.env.DATABASE_URL ?? "";
  const hasExplicitNoSsl = url.includes("sslmode=disable") || url.includes("sslmode=allow");
  if (hasExplicitNoSsl) return false;

  const hasSslRequired = url.includes("sslmode=require") || url.includes("sslmode=verify-ca") || url.includes("sslmode=verify-full");
  if (hasSslRequired) return { rejectUnauthorized: false };

  if (process.env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }

  return false;
}

// ── Pool sizing ────────────────────────────────────────────────────────────────
// RDS instance connection limits:
//   db.t3.micro:    ~87  connections max
//   db.t3.small:    ~170 connections max
//   db.t3.medium:   ~340 connections max
//   db.m5.large:    ~823 connections max
//
// With ECS Fargate (multiple task replicas), divide the RDS limit by replica count.
// Default 30 (raised from 20) accommodates the detection pipeline + analytics
// dashboards which can spike to ~25 concurrent queries per task. Tune via
// DB_POOL_MAX env var per deployment based on Aurora capacity / replica count.
const POOL_MAX = parseInt(process.env.DB_POOL_MAX ?? "30", 10);
const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? "30000", 10);
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS ?? "30000", 10);
// connectionTimeoutMillis bumped 3000 → 8000 so brief Aurora failovers / spikes
// don't immediately surface as "timeout exceeded when trying to connect" cascades.
const CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS ?? "8000", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? "10000", 10);

const sslConfig = buildSslConfig();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: POOL_MAX,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  // statement_timeout: Postgres-level per-statement timeout (milliseconds)
  // query_timeout: node-postgres client-side socket timeout
  statement_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: QUERY_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "cyber-command-center",
  ...(sslConfig !== false ? { ssl: sslConfig } : {}),
});

pool.on("connect", (client) => {
  client.query(`SET TIME ZONE 'UTC'`).catch(() => {});
  // Signal success to circuit breaker on a healthy new connection
  import("./crash-guard").then(({ recordDbSuccess }) => recordDbSuccess()).catch(() => {});
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected pool error:", err.message);
  import("./crash-guard").then(({ recordDbFailure }) => recordDbFailure(err)).catch(() => {});
});

if (sslConfig) {
  console.log("[DB] SSL enabled for database connections (rejectUnauthorized:", (sslConfig as any).rejectUnauthorized ?? "true", ")");
}
console.log(`[DB] Pool configured: max=${POOL_MAX}, statement_timeout=${STATEMENT_TIMEOUT_MS}ms`);

const SLOW_QUERY_MS = 2000;
const origQuery: typeof pool.query = pool.query.bind(pool);
pool.query = ((...args: Parameters<typeof pool.query>) => {
  const start = Date.now();
  const result = (origQuery as (...a: typeof args) => ReturnType<typeof pool.query>)(...args);
  if (result && typeof (result as Promise<unknown>).then === "function") {
    (result as Promise<unknown>).then(() => {
      const dur = Date.now() - start;
      if (dur > SLOW_QUERY_MS) {
        const firstArg = args[0] as string | { text?: string } | undefined;
        const queryText = typeof firstArg === "string" ? firstArg.substring(0, 200) : (firstArg?.text?.substring(0, 200) ?? "prepared");
        console.warn(`[DB Slow Query] ${dur}ms: ${queryText}`);
      }
    }).catch((_err: unknown) => {});
  }
  return result;
}) as typeof pool.query;

let lastPoolLog = 0;
export function logPoolStats() {
  const now = Date.now();
  if (now - lastPoolLog < 60_000) return;
  lastPoolLog = now;
  console.log(`[DB Pool] total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`);
}

export const db = drizzle(pool, { schema });

// ── Read replica pool (Task #123) ──────────────────────────────────────────────
// When READ_REPLICA_URL is set, high-traffic GET routes use this pool to offload
// reads from the primary. Falls back to the primary pool transparently.
const READ_REPLICA_URL = process.env.READ_REPLICA_URL;

export const poolRead: typeof pool = READ_REPLICA_URL
  ? (() => {
      const replicaPool = new Pool({
        connectionString: READ_REPLICA_URL,
        max: Math.max(5, Math.floor(POOL_MAX / 2)),
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 3_000,
        statement_timeout: STATEMENT_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        application_name: "cyber-command-center-replica",
        ...(sslConfig !== false ? { ssl: sslConfig } : {}),
      });
      replicaPool.on("error", (err) => {
        console.error("[DB Replica Pool] Unexpected error:", err.message);
      });
      replicaPool.on("connect", (client) => {
        client.query(`SET TIME ZONE 'UTC'`).catch(() => {});
      });
      console.log("[DB] Read replica pool configured (READ_REPLICA_URL set)");
      return replicaPool;
    })()
  : pool;

export const dbRead = drizzle(poolRead, { schema });

export async function warmUpPool(connections = 3) {
  const clients: any[] = [];
  try {
    for (let i = 0; i < connections; i++) {
      clients.push(await pool.connect());
    }
    console.log(`[DB Pool] Warmed up ${connections} connections`);
  } catch (err: any) {
    console.warn("[DB Pool] Warm-up partial:", err.message);
  } finally {
    for (const c of clients) {
      try { c.release(); } catch (releaseErr: any) {
        console.warn("[DB Pool] Error releasing warm-up connection:", releaseErr?.message);
      }
    }
  }
}

export async function createPerformanceIndexes() {
  const indexes = [
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_tenant_created ON incidents (tenant_id, created_at DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_tenant_status ON incidents (tenant_id, status)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_tenant_severity ON incidents (tenant_id, severity)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_dedup_hash ON incidents (tenant_id, dedup_hash) WHERE dedup_hash IS NOT NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_tenant_occurred ON security_events (tenant_id, occurred_at DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_tenant_type ON security_events (tenant_id, event_type)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_tenant_pipeline ON security_events (tenant_id, pipeline_status)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_tenant_severity ON security_events (tenant_id, severity)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_tenant_created ON tickets (tenant_id, created_at DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_tenant_status ON tickets (tenant_id, status)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_inv_tenant_status ON ai_investigations (tenant_id, status)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_inv_incident ON ai_investigations (incident_id)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_tenant ON assets (tenant_id)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_assets_tenant ON user_assets (tenant_id)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_assets_tenant_uname ON user_assets (tenant_id, lower(user_name))`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_users_userid ON tenant_users (user_id)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_tenant ON incident_notifications (tenant_id)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_token ON incident_notifications (action_token) WHERE action_token IS NOT NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingest_batches_status ON ingest_batches (status, started_at DESC)`, // ingest_batches has started_at, not created_at (see shared/schema.ts:2067)
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingest_batches_tenant_status ON ingest_batches (tenant_id, status)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_hash ON security_events (event_hash) WHERE event_hash IS NOT NULL`,
  ];

  console.log(`[DB] Creating ${indexes.length} performance indexes...`);
  let created = 0;
  for (const ddl of indexes) {
    try {
      await pool.query(ddl);
      created++;
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        console.warn(`[DB Index] Warning: ${err.message}`);
      }
    }
  }
  console.log(`[DB] Index creation complete (${created}/${indexes.length} processed)`);

  // Attempt TimescaleDB hypertable setup on security_events — no-op on standard PostgreSQL
  try {
    await pool.query(`
      SELECT create_hypertable(
        'security_events', 'occurred_at',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists       => TRUE
      )
    `);
    console.log("[DB] TimescaleDB hypertable enabled on security_events (occurred_at, 1-day chunks)");
  } catch (tsErr: any) {
    const msg: string = tsErr?.message ?? String(tsErr);
    if (msg.includes("already a hypertable")) {
      // Silently ignore — already set up by a previous boot
    } else if (msg.includes("create_hypertable")) {
      // TimescaleDB extension not installed — warn so operators know to enable it for time-series performance
      console.warn("[DB] TimescaleDB extension not available — skipping hypertable setup. Install TimescaleDB for time-series partitioning on security_events.");
    } else {
      console.warn(`[DB] TimescaleDB hypertable setup failed: ${msg}`);
    }
  }
}
