import express, { type Request, Response, NextFunction } from "express";
import cluster from "cluster";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "./migrate";
import { runProdDataMigration } from "./migrate-prod-data";
import { runStartupEnrichment, cleanInvalidIPAddresses, cleanupInferredCynetEPS } from "./asset-enrichment";
import { runSigmaEnrichmentOnExistingEvents } from "./enrichment-pipeline";
import { markSchedulerReady } from "./ai-soc-analyst";
import {
  startMemoryMonitor,
  startPoolSaturationMonitor,
  circuitBreakerMiddleware,
  requestIdMiddleware,
  globalErrorHandler,
  drainConnections,
  clearAllIntervals,
  safeSetInterval,
  safeSetTimeout,
} from "./crash-guard";

import { pool } from "./db";
import pg from "pg";
import { ensureQuotaTable } from "./quota-engine";
import { initClickHouseSchema } from "./clickhouse-client";

// ── TAXII Poll Scheduler ───────────────────────────────────────────────────────
async function startTaxiiPollScheduler(): Promise<void> {
  const { ensureTaxiiTables, loadTaxiiServerConfigs, pollTaxiiServer } = await import("./taxii-client");
  await ensureTaxiiTables();

  safeSetTimeout(async () => {
    try {
      const configs = await loadTaxiiServerConfigs();
      for (const cfg of configs) {
        if (!cfg.enabled) continue;
        pollTaxiiServer(cfg).catch(e => console.error(`[TAXII] Poll error for ${cfg.displayName}: ${e.message}`));
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e: any) {
      console.error("[TAXII] Startup poll error:", e.message);
    }
  }, 30000, "taxii-startup-poll");

  // Periodic poll every 30 minutes — respects each server's pollIntervalHours
  safeSetInterval(async () => {
    try {
      const configs = await loadTaxiiServerConfigs();
      const now = Date.now();
      for (const cfg of configs) {
        if (!cfg.enabled) continue;
        const lastSync = cfg.lastSyncedAt ? new Date(cfg.lastSyncedAt).getTime() : 0;
        const intervalMs = (cfg.pollIntervalHours || 6) * 60 * 60 * 1000;
        if (now - lastSync >= intervalMs) {
          pollTaxiiServer(cfg).catch(e => console.error(`[TAXII] Poll error for ${cfg.displayName}: ${e.message}`));
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (e: any) {
      console.error("[TAXII] Scheduled poll error:", e.message);
    }
  }, 30 * 60 * 1000, "taxii-poll");
}

// ── OpenCTI Sync Scheduler ────────────────────────────────────────────────────
async function startOpenCTISyncScheduler(): Promise<void> {
  const { ensureOpenCTITables, loadOpenCTIConfig, runOpenCTISync, startLiveStream } = await import("./opencti-connector");
  await ensureOpenCTITables();

  const runSync = async () => {
    try {
      const config = await loadOpenCTIConfig();
      if (!config) return;
      // Respect the operator sync toggle
      if (!config.syncEnabled) {
        console.log("[OpenCTI] Sync skipped — syncEnabled is false in config");
      } else {
        await runOpenCTISync(config);
      }
    } catch (e: unknown) {
      console.error("[OpenCTI] Sync error:", e instanceof Error ? e.message : String(e));
    }
  };

  // On startup: auto-start live stream independently of sync toggle
  const autoStartStream = async () => {
    try {
      const config = await loadOpenCTIConfig();
      if (config && config.liveStreamEnabled) {
        startLiveStream(config).catch((e: Error) => console.error("[OpenCTI] Stream error:", e.message));
      }
    } catch (e: unknown) {
      console.error("[OpenCTI] Stream auto-start error:", e instanceof Error ? e.message : String(e));
    }
  };

  // Initial stream + sync 60s after startup
  safeSetTimeout(async () => {
    await autoStartStream();
    await runSync();
  }, 60000, "opencti-startup-sync");

  // Re-sync every 6 hours (stream lifecycle is managed by opencti-connector reconnect)
  safeSetInterval(runSync, 6 * 60 * 60 * 1000, "opencti-sync");
}

function isKafkaPrimaryWorker(): boolean {
  // start-prod.js cluster primary (master) requires dist/index.cjs only in workers
  // and single-process mode — the master process itself never runs this file.
  // So !cluster.isWorker means "single-process dev/test mode", not "cluster master".
  if (!cluster.isWorker) return true;
  return cluster.worker?.id === 1;
}

async function startKafkaConsumerIfPrimary(log: (msg: string) => void): Promise<void> {
  if (!process.env.KAFKA_BROKERS || !isKafkaPrimaryWorker()) return;
  const { ensureTopicsExist } = await import("./kafka/admin");
  await ensureTopicsExist(1).catch((e: Error) =>
    console.warn("[Kafka Admin] Topic setup warning:", e.message)
  );
  const { startIngestConsumer } = await import("./kafka/ingest-consumer");
  const started = await startIngestConsumer().catch((e: Error) => {
    console.error("[Kafka] Consumer startup error:", e.message);
    return false;
  });
  if (started) log("Kafka ingest consumer started");
}

// Process-level handlers are registered in ./crash-guard (imported above)
// They handle ECONNRESET/EPIPE as harmless and log all others.

// Worker IPC: respond to memory healthcheck from the cluster primary
if (cluster.isWorker && process.send) {
  process.on("message", (msg: any) => {
    if (msg?.type === "healthcheck") {
      const mem = process.memoryUsage();
      const v8 = require("v8");
      const heapStats = v8.getHeapStatistics();
      try {
        process.send!({
          type: "memory_report",
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          heapSizeLimit: heapStats.heap_size_limit,
        });
      } catch {}
    }
  });
}

async function runStartupAssetCleanup() {
  // Use a dedicated client with extended timeouts for heavy cleanup queries.
  // pool.connect() inherits the pool's query_timeout (30s), so we create a
  // one-off Client with both statement_timeout and query_timeout set to 120s.
  const sslConfig = (pool as any).options?.ssl;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    statement_timeout: 120_000,
    query_timeout: 120_000,
    connectionTimeoutMillis: 10_000,
    ...(sslConfig ? { ssl: sslConfig } : {}),
  });
  try {
    await client.connect();

    const dedupResult = await client.query(`
      DELETE FROM assets WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(hostname)), tenant_id 
            ORDER BY updated_at DESC NULLS LAST, id DESC
          ) as rn FROM assets WHERE hostname IS NOT NULL AND TRIM(hostname) != '' AND LENGTH(TRIM(hostname)) >= 2
        ) t WHERE rn > 1
      ) RETURNING tenant_id
    `);
    const dedupCount = dedupResult.rowCount || 0;
    if (dedupCount > 0) {
      const tenantCounts: Record<number, number> = {};
      for (const row of dedupResult.rows) {
        tenantCounts[row.tenant_id] = (tenantCounts[row.tenant_id] || 0) + 1;
      }
      for (const [tid, cnt] of Object.entries(tenantCounts)) {
        console.log(`[Cleanup] Dedup tenant ${tid}: removed ${cnt} duplicate assets`);
      }
    }

    const ipDedupResult = await client.query(`
      DELETE FROM assets WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY TRIM(ip_address), tenant_id 
            ORDER BY 
              CASE WHEN hostname IS NOT NULL AND TRIM(hostname) != '' THEN 0 ELSE 1 END,
              updated_at DESC NULLS LAST, id DESC
          ) as rn FROM assets 
          WHERE ip_address IS NOT NULL AND TRIM(ip_address) != '' AND TRIM(ip_address) != '0.0.0.0'
            AND (hostname IS NULL OR TRIM(hostname) = '' OR LENGTH(TRIM(hostname)) < 2)
        ) t WHERE rn > 1
      ) RETURNING tenant_id
    `);
    const ipDedupCount = ipDedupResult.rowCount || 0;
    if (ipDedupCount > 0) {
      console.log(`[Cleanup] IP-based dedup: removed ${ipDedupCount} duplicate assets without hostnames`);
    }

    await client.query(`DELETE FROM assets WHERE (hostname IS NULL OR TRIM(hostname) = '') AND (ip_address IS NULL OR TRIM(ip_address) = '')`).then(r => {
      if (r.rowCount && r.rowCount > 0) console.log(`[Cleanup] Removed ${r.rowCount} ghost assets (no hostname, no IP)`);
    }).catch(() => {});

    const osFixResult = await client.query(`
      UPDATE assets SET operating_system = TRIM(REGEXP_REPLACE(operating_system, '^(.+?)\\s+\\1', '\\1'))
      WHERE operating_system ~ '^(.+?)\\s+\\1'
    `);
    const osFixed = osFixResult.rowCount || 0;
    if (osFixed > 0) console.log(`[Cleanup] Fixed ${osFixed} duplicated OS strings`);

    const riskFixResult = await client.query(`
      UPDATE assets SET risk_score = LEAST(100, ROUND(risk_score / 5.0))
      WHERE risk_score > 100
    `);
    const riskFixed = riskFixResult.rowCount || 0;
    if (riskFixed > 0) console.log(`[Cleanup] Normalized ${riskFixed} risk scores from >100 to 0-100 range`);

    const STATUS_VALUES = ['active', 'inactive', 'online', 'offline', 'paused', 'enabled', 'disabled', 'running', 'stopped', 'unknown'];
    const versionCandidates = await client.query<{ id: number }>(`
      SELECT id FROM assets
      WHERE software_inventory IS NOT NULL 
        AND jsonb_typeof(software_inventory) = 'array'
        AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(software_inventory) e 
            WHERE (e->>'name') IN ('CynetEPS', 'Cynet EPS') 
              AND (e->>'version' IS NULL OR LOWER(e->>'version') = ANY($1::text[]) OR e->>'version' != COALESCE(agent_version, ''))
              AND agent_version IS NOT NULL AND agent_version != '' AND agent_version ~ '[0-9]'
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(software_inventory) e 
            WHERE LOWER(e->>'version') = ANY($1::text[])
          )
        )
    `, [STATUS_VALUES]);
    const candidateIds = versionCandidates.rows.map(r => r.id);
    let versionFixed = 0;
    const BATCH_SIZE_CLEANUP = 100;
    for (let bi = 0; bi < candidateIds.length; bi += BATCH_SIZE_CLEANUP) {
      const batchIds = candidateIds.slice(bi, bi + BATCH_SIZE_CLEANUP);
      const batchResult = await client.query(`
        UPDATE assets SET software_inventory = (
          SELECT jsonb_agg(
            CASE 
              WHEN (elem->>'name') IN ('CynetEPS', 'Cynet EPS') AND agent_version IS NOT NULL AND agent_version != '' 
                AND agent_version ~ '[0-9]'
              THEN jsonb_set(elem, '{version}', to_jsonb(agent_version))
              WHEN LOWER(elem->>'version') = ANY($1::text[])
              THEN elem - 'version' || jsonb_build_object('version', null)
              ELSE elem
            END
          ) FROM jsonb_array_elements(software_inventory) elem
        )
        WHERE id = ANY($2::int[])
      `, [STATUS_VALUES, batchIds]);
      versionFixed += batchResult.rowCount || 0;
      if (bi + BATCH_SIZE_CLEANUP < candidateIds.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    if (versionFixed > 0) console.log(`[Cleanup] Fixed software versions for ${versionFixed} assets (removed status values, synced CynetEPS versions)`);

    const OS_STATUS_VALUES = ['decommissioned', 'running', 'operational', 'powered off', 'powered on', 'inactive', 'retired', 'unknown', 'n/a', 'none', 'not available', 'shutoff', 'suspended', 'pending', 'maintenance', 'active', 'online', 'offline', 'down', 'up', 'stopped'];
    const osStatusFixResult = await client.query(`
      UPDATE assets SET 
        status = CASE 
          WHEN LOWER(TRIM(operating_system)) IN ('decommissioned', 'retired') THEN 'decommissioned'
          WHEN LOWER(TRIM(operating_system)) IN ('inactive', 'powered off', 'shutoff', 'suspended', 'offline', 'down', 'stopped') THEN 'inactive'
          ELSE status
        END,
        operating_system = NULL
      WHERE LOWER(TRIM(operating_system)) = ANY($1::text[])
    `, [OS_STATUS_VALUES]);
    const osStatusFixed = osStatusFixResult.rowCount || 0;
    if (osStatusFixed > 0) console.log(`[Cleanup] Fixed ${osStatusFixed} assets with status values stored as OS (moved to status field)`);

    const tsRegionFixResult = await client.query(`
      UPDATE assets SET cloud_region = NULL
      WHERE cloud_region IS NOT NULL AND cloud_region ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    `);
    const tsRegionFixed = tsRegionFixResult.rowCount || 0;
    if (tsRegionFixed > 0) console.log(`[Cleanup] Fixed ${tsRegionFixed} assets with timestamp values in cloud_region`);

    if (dedupCount === 0 && osFixed === 0 && riskFixed === 0 && versionFixed === 0 && osStatusFixed === 0 && tsRegionFixed === 0) {
      console.log(`[Cleanup] Asset data is clean, no fixes needed`);
    }
  } catch (err: any) {
    console.error(`[Cleanup] Asset cleanup error:`, err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

// ============================================================
// PKF AFRICA INTEGRATION RESTORE — SAFETY GUARD
// ============================================================
// Ensures that PKF Africa (tenant 37) always has its expected
// security_integrations rows. If a row is missing (e.g. due to
// a prior seed script erroneously deleting it), we re-insert it
// in 'disconnected' status with empty credentials so the admin
// can re-enter real API keys through the Settings UI.
//
// This function NEVER overwrites existing rows — it only inserts
// if the row is absent (ON CONFLICT DO NOTHING).
// ============================================================
async function ensureSecurityIntegrationsUniqueConstraint() {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'security_integrations_tenant_platform_key'
            AND conrelid = 'security_integrations'::regclass
        ) THEN
          ALTER TABLE security_integrations
            ADD CONSTRAINT security_integrations_tenant_platform_key
            UNIQUE (tenant_id, platform_key);
        END IF;
      END
      $$;
    `);
  } catch (err: any) {
    console.error("[IntegRestore] Failed to ensure unique constraint:", err.message);
  }
}

async function restorePkfAfricaIntegrations() {
  await ensureSecurityIntegrationsUniqueConstraint();
  try {
    // Resolve PKF Africa tenant ID dynamically — dev=37, prod=7, etc.
    const { rows: tenantRows } = await pool.query<{ id: number }>(
      `SELECT id FROM tenants WHERE name = 'PKF Africa' LIMIT 1`
    );
    if (tenantRows.length === 0) {
      console.log("[IntegRestore] PKF Africa tenant not found — skipping integration restore.");
      return;
    }
    const PKF_TENANT_ID = tenantRows[0].id;

    const { rows: existing } = await pool.query<{ platform_key: string }>(
      `SELECT platform_key FROM security_integrations WHERE tenant_id = $1`,
      [PKF_TENANT_ID]
    );
    const existingKeys = new Set(existing.map((r) => r.platform_key));

    const integrations = [
      {
        platform_key: "cynet",
        platform_name: "Cynet 360 AutoXDR",
        category: "edr_xdr",
        description: "Cynet 360 AutoXDR — Extended Detection and Response for PKF Africa endpoints",
      },
      {
        platform_key: "skyhigh_sse",
        platform_name: "Skyhigh Security SSE",
        category: "sse_casb",
        description: "Skyhigh Security SSE — CASB, DLP, SWG for PKF Africa cloud traffic",
      },
      {
        platform_key: "fortinac",
        platform_name: "FortiNAC",
        category: "network_security",
        description: "FortiNAC — Network Access Control for PKF Africa wired/wireless endpoints",
      },
    ];

    for (const integ of integrations) {
      if (!existingKeys.has(integ.platform_key)) {
        await pool.query(
          `INSERT INTO security_integrations
            (tenant_id, platform_key, platform_name, category, status,
             auth_type, polling_enabled, polling_interval_minutes,
             last_poll_status, last_poll_message, events_imported,
             config_json, description, is_enabled)
           VALUES ($1, $2, $3, $4, 'disconnected',
             'token', false, 15,
             'error', 'API credentials required — please re-enter in Settings.',
             0, '{}', $5, true)
           ON CONFLICT (tenant_id, platform_key) DO NOTHING`,
          [PKF_TENANT_ID, integ.platform_key, integ.platform_name, integ.category, integ.description]
        );
        console.log(`[IntegRestore] Restored missing PKF Africa integration: ${integ.platform_key} (tenantId=${PKF_TENANT_ID}, status: disconnected, credentials required)`);
      }
    }
  } catch (err: any) {
    console.error("[IntegRestore] Failed to restore PKF Africa integrations:", err.message);
  }
}

const app = express();
const httpServer = createServer(app);
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;

async function gracefulShutdown(signal: string) {
  console.log(`[Shutdown] Received ${signal} — starting graceful shutdown...`);

  clearAllIntervals();

  await Promise.race([
    import("./kafka/ingest-consumer")
      .then(({ stopIngestConsumer }) => stopIngestConsumer())
      .catch(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]);

  import("./ch-outbox-worker")
    .then(({ stopChOutboxWorker }) => stopChOutboxWorker())
    .catch(() => {});

  httpServer.close(async () => {
    console.log("[Shutdown] HTTP server closed — draining DB connections...");
    await drainConnections(4000);
    await pool.end().catch(() => {});
    console.log("[Shutdown] DB pool drained — exiting cleanly");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Shutdown] Force-exit after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(requestIdMiddleware);
app.use(circuitBreakerMiddleware);

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.text({ type: ["text/csv", "application/x-ndjson", "text/plain"], limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const REQUEST_TIMEOUT_MS = 30_000;
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  const isSSE = req.headers.accept?.includes("text/event-stream");
  if (path.startsWith("/api") && !isSSE) {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        log(`TIMEOUT ${req.method} ${path} after ${REQUEST_TIMEOUT_MS}ms`, "timeout");
        res.status(503).json({ message: "Request timed out. Please retry." });
      }
    }, REQUEST_TIMEOUT_MS);
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
  }

  next();
});

let serverReady = false;

(async () => {
  const port = parseInt(process.env.PORT || "5000", 10);

  // ── Health check endpoint (available immediately) ──
  app.get("/_health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", ready: serverReady });
  });

  // ── Start listening BEFORE blocking initialization ──
  // This ensures ALB and Docker health checks pass immediately,
  // preventing ECS from marking tasks unhealthy during startup.
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });

  // ── Run all blocking initialization in the background ──
  if (process.env.NODE_ENV === "production") {
    (async () => {
      try {
        // Run migrations in a nested try-catch so a migration failure doesn't
        // block route registration (which would make the API return 404s).
        try {
          await runMigrations();
        } catch (migrationErr) {
          console.error("[Migrations] Failed (non-fatal):", migrationErr);
        }
        // Ensure tenant_quotas table exists (idempotent — safe to run every startup)
        await ensureQuotaTable();

        // Initialize ClickHouse schema (no-op if CLICKHOUSE_URL not configured).
        // We MUST await this before kicking off the incident backfill/sweeper so
        // that `incidents_distributed` exists when the first INSERT goes out.
        // Retries up to 5 times with exponential backoff (2s, 4s, 8s, 16s, 32s)
        // so a transient CH outage at deploy time doesn't permanently disable CH.
        let chSchemaReady = false;
        const chTimeoutMs = 15_000;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await Promise.race([
              initClickHouseSchema(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`ClickHouse schema init timed out after ${chTimeoutMs}ms`)), chTimeoutMs)
              ),
            ]);
            chSchemaReady = true;
            console.log("[ClickHouse] Schema init succeeded");
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[ClickHouse] Schema init attempt ${attempt}/5 failed: ${msg}`);
            if (attempt < 5) {
              await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
            }
          }
        }
        if (!chSchemaReady) {
          console.warn("[ClickHouse] Schema init exhausted all retries — background sweeper will keep retrying");
        }

        // Mirror the PG `incidents` table into ClickHouse so the MITRE coverage
        // fast-path counts stay aligned with the PG path. Two pieces:
        //
        //   1. One-time backfill of all historical PG incidents on startup, so the
        //      fast-path has full coverage from the moment it goes live (instead
        //      of slowly converging as new incidents arrive). Idempotent — safe to
        //      re-run because the CH table is a ReplacingMergeTree(updated_at)
        //      keyed on (tenant_id, id).
        //
        //   2. A 30-second background loop that retries the backfill if it hasn't
        //      yet succeeded (e.g. CH was briefly unreachable on first attempt),
        //      then drains any new incidents via the sweeper. The sweeper catches
        //      every raw-SQL incident write path in routes.ts and the engines
        //      (Checkpoint email, UEBA escalation, classification/triage/status/IOC
        //      updates, bulk updates) that bypass storage.createIncident /
        //      storage.updateIncident, and only advances its (updated_at, id)
        //      cursor after each batch is durably in CH, so a CH outage never
        //      strands rows.
        if (chSchemaReady) {
          void import("./storage").then(async ({ DatabaseStorage }) => {
            const runOnce = async () => {
              try {
                await DatabaseStorage.backfillIncidentsToClickHouse();
              } catch (err) {
                console.warn(
                  "[ClickHouse] Incident backfill error (will retry):",
                  err instanceof Error ? err.message : err,
                );
              }
              try {
                await DatabaseStorage.sweepIncidentsToClickHouse();
              } catch (err) {
                console.warn(
                  "[ClickHouse] Incident sweep error (non-fatal):",
                  err instanceof Error ? err.message : err,
                );
              }
              // Task #206: one-shot backfill of security_events.target for events
              // ingested before the CH ALTER added the column. The method's own
              // in-memory `done` guard makes the periodic re-tick a cheap no-op
              // once it succeeds; failures will be retried on the next tick.
              try {
                await DatabaseStorage.backfillSecurityEventTargetsToClickHouse();
              } catch (err) {
                console.warn(
                  "[ClickHouse] security_events.target backfill error (will retry):",
                  err instanceof Error ? err.message : err,
                );
              }

              // Security events sweeper: catches any rows that bypassed live dual-write.
              try {
                await DatabaseStorage.sweepSecurityEventsToClickHouse();
              } catch (err) {
                console.warn(
                  "[ClickHouse] security event sweep error (will retry):",
                  err instanceof Error ? err.message : err,
                );
              }
            };
            await runOnce();
            safeSetInterval(runOnce, 30_000, "ch-sweeper");
          }).catch(() => { /* startup race — ignore */ });

          // Task #207: one-shot backfill of `threat`/`action`/`recipient`/
          // `description` for older CH security_events rows ingested before
          // Task #203's column migration. Idempotent (gated by a row in
          // `ccc._migrations`) and fire-and-forget — failures simply leave the
          // marker absent so the next restart retries. Runs after the schema init
          // so the ALTER UPDATE statements always target the new columns.
          void import("./clickhouse-threat-flow-backfill")
            .then(async ({ backfillChThreatFlowDetails, isThreatFlowBackfillComplete }) => {
              const tryBackfill = async () => {
                if (isThreatFlowBackfillComplete()) return;
                try {
                  await backfillChThreatFlowDetails();
                } catch (err) {
                  console.warn(
                    "[ClickHouse] Threat-flow backfill error (will retry):",
                    err instanceof Error ? err.message : err,
                  );
                }
              };
              await tryBackfill();
              // Light retry cadence — once the migration marker is written this
              // becomes a single SELECT on _migrations per tick.
              safeSetInterval(tryBackfill, 5 * 60_000, "ch-threat-flow-backfill");
            })
            .catch(() => { /* startup race — ignore */ });
        }

        // ── Automatic DLQ retry job ────────────────────────────────────────────
        // Replays failed DLQ entries every 60 seconds, up to max_retries, with a
        // 5-minute cooldown between attempts.  This turns transient pipeline
        // failures (downstream DB/CH hiccups, external API timeouts) into
        // self-healing events without operator intervention.
        void import("./storage").then(async ({ DatabaseStorage }) => {
          const { runPipelineAsync } = await import("./enrichment-pipeline");
          const retryDlq = async () => {
            try {
              const entries = await new DatabaseStorage().getRetryableDlqEntries(10);
              if (entries.length === 0) return;
              console.log(`[DLQ Auto-Retry] Processing ${entries.length} retryable entries`);
              for (const entry of entries) {
                const isReplayable =
                  entry.tenantId &&
                  entry.batchId &&
                  entry.rawPayload &&
                  (() => {
                    const raw = entry.rawPayload as Record<string, any>;
                    const evts = raw.events || raw.payload?.events || [];
                    return Array.isArray(evts) && evts.length > 0;
                  })();

                if (!isReplayable) {
                  await new DatabaseStorage().updateDlqEntry(entry.id, {
                    status: "abandoned",
                    retryCount: (entry.retryCount || 0) + 1,
                    lastRetryAt: new Date(),
                  }).catch(() => {});
                  continue;
                }

                await new DatabaseStorage().updateDlqEntry(entry.id, {
                  status: "retrying",
                  retryCount: (entry.retryCount || 0) + 1,
                  lastRetryAt: new Date(),
                }).catch(() => {});

                const raw = entry.rawPayload as Record<string, any>;
                const events = raw.events || raw.payload?.events || [];
                runPipelineAsync(entry.batchId!, entry.tenantId!, events, {
                  vendorHint: raw.vendorHint || raw.payload?.vendorHint,
                }).then(() => {
                  new DatabaseStorage().updateDlqEntry(entry.id, {
                    status: "recovered",
                    recoveredAt: new Date(),
                  }).catch(() => {});
                }).catch(() => {
                  new DatabaseStorage().updateDlqEntry(entry.id, {
                    status: "failed",
                  }).catch(() => {});
                });
              }
            } catch (err) {
              console.warn("[DLQ Auto-Retry] Job error:", err instanceof Error ? err.message : err);
            }
          };
          // Run immediately, then every 60s.
          await retryDlq();
          safeSetInterval(retryDlq, 60_000, "dlq-auto-retry");
        }).catch(() => { /* startup race — ignore */ });

        const { createPerformanceIndexes, warmUpPool } = await import("./db");
        warmUpPool(3).catch(err => console.warn("[DB Pool] Warm-up error:", err.message));
        createPerformanceIndexes().catch(err => console.warn("[DB] Index creation deferred:", err.message));

        // Start crash-guard monitors
        startMemoryMonitor(30_000);
        startPoolSaturationMonitor(15_000);

        await registerRoutes(httpServer, app);
        app.use(globalErrorHandler);
        serveStatic(app);

        // Background tasks that don't block server readiness
        await runProdDataMigration();
        await restorePkfAfricaIntegrations();
        await cleanupInferredCynetEPS();
        await runStartupEnrichment();
        const ipsCleaned = await cleanInvalidIPAddresses();
        if (ipsCleaned > 0) log(`Cleaned ${ipsCleaned} invalid IP addresses`);
        // Run cleanup asynchronously so it doesn't block server startup
        setTimeout(() => {
          runStartupAssetCleanup().catch(e => console.error("[Cleanup] Async startup error:", e.message));
        }, 5000);
        runSigmaEnrichmentOnExistingEvents().catch(e => console.error("[Sigma] Startup enrichment error:", e));
        serverReady = true;
        markSchedulerReady();
        const { startAIAgentScheduler } = await import("./ai-agent-scheduler");
        startAIAgentScheduler();
        const { startChOutboxWorker } = await import("./ch-outbox-worker");
        startChOutboxWorker(5_000);
        const { startEdrScheduler } = await import("./edr-scheduler");
        startEdrScheduler();
        if (isKafkaPrimaryWorker()) {
          const { startClickHouseIngestMonitor } = await import("./clickhouse-ingest-monitor");
          startClickHouseIngestMonitor();
          const { startClickHouseFastPathMonitor } = await import("./clickhouse-fast-path-monitor");
          startClickHouseFastPathMonitor();
          const { startPlatformSettingsAuditDigest } = await import("./platform-settings-audit-digest");
          startPlatformSettingsAuditDigest();
        }
        // TAXII poll scheduler — only run in primary worker to avoid duplicate polling
        if (!cluster.isWorker || cluster.worker?.id === 1) {
          startTaxiiPollScheduler().catch((e: any) => console.error("[TAXII] Scheduler error:", e));
          // OpenCTI 6h sync + optional live stream
          startOpenCTISyncScheduler().catch((e: any) => console.error("[OpenCTI] Scheduler error:", e));
        }
        await startKafkaConsumerIfPrimary(log);
        log("Background initialization complete");
      } catch (err) {
        console.error("Background initialization error:", err);
      }
    })();
  } else {
    // Dev mode — same pattern: listen first, init in background
    (async () => {
      await runProdDataMigration();
      await restorePkfAfricaIntegrations();
      await registerRoutes(httpServer, app);
      app.use(globalErrorHandler);
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      serverReady = true;
      markSchedulerReady();
      // Start TAXII/OpenCTI schedulers in dev mode too
      startTaxiiPollScheduler().catch((e: any) => console.error("[TAXII] Scheduler error:", e));
      startOpenCTISyncScheduler().catch((e: any) => console.error("[OpenCTI] Scheduler error:", e));
      import("./clickhouse-ingest-monitor").then(({ startClickHouseIngestMonitor }) => {
        startClickHouseIngestMonitor();
      }).catch((e: any) => console.error("[ClickHouseIngestMonitor] Import error:", e));
      import("./clickhouse-fast-path-monitor").then(({ startClickHouseFastPathMonitor }) => {
        startClickHouseFastPathMonitor();
      }).catch((e: any) => console.error("[ClickHouseFastPathMonitor] Import error:", e));
      import("./platform-settings-audit-digest").then(({ startPlatformSettingsAuditDigest }) => {
        startPlatformSettingsAuditDigest();
      }).catch((e: any) => console.error("[PlatformSettingsAuditDigest] Import error:", e));
      await startKafkaConsumerIfPrimary(log);
      log("Server fully initialized");
    })();
  }

  // ML behavioral jobs — run in all environments using existing shared pool
  import("./ml-behavior-engine.js").then(({ startBaselineRefreshJob, startEntityScoringJob }) => {
    startBaselineRefreshJob(pool).catch((e: any) => console.error("[ML Baseline] Startup error:", e));
    startEntityScoringJob(pool).catch((e: any) => console.error("[ML Scoring] Startup error:", e));
  }).catch((e: any) => console.error("[ML Baseline] Import error:", e));

  // Attack Detection Pipeline — multi-vector classification + chain correlation + training loop
  setTimeout(() => {
    import("./attack-detection-pipeline.js").then(({ startDetectionPipelineJob }) => {
      startDetectionPipelineJob().catch((e: any) => console.error("[DetectionPipeline] Startup error:", e));
    }).catch((e: any) => console.error("[DetectionPipeline] Import error:", e));

    import("./ai-training-manager.js").then(({ startTrainingReviewJob }) => {
      startTrainingReviewJob();
    }).catch((e: any) => console.error("[TrainingManager] Import error:", e));
  }, 60_000);

  // Integration Autoheal Monitor — watches for failed integrations and heals them automatically
  import("./integration-autoheal.js").then(({ startAutoHealMonitor }) => {
    startAutoHealMonitor();
  }).catch((e: any) => console.error("[Autoheal] Import error:", e));
})();
