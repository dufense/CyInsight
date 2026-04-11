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
} from "./crash-guard";

import { pool } from "./db";
import { ensureQuotaTable } from "./quota-engine";

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
      try {
        process.send!({ type: "memory_report", rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal });
      } catch {}
    }
  });
}

async function runStartupAssetCleanup() {
  try {
    const dedupResult = await pool.query(`
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

    const ipDedupResult = await pool.query(`
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

    await pool.query(`DELETE FROM assets WHERE (hostname IS NULL OR TRIM(hostname) = '') AND (ip_address IS NULL OR TRIM(ip_address) = '')`).then(r => {
      if (r.rowCount && r.rowCount > 0) console.log(`[Cleanup] Removed ${r.rowCount} ghost assets (no hostname, no IP)`);
    }).catch(() => {});

    const osFixResult = await pool.query(`
      UPDATE assets SET operating_system = TRIM(REGEXP_REPLACE(operating_system, '^(.+?)\\s+\\1', '\\1'))
      WHERE operating_system ~ '^(.+?)\\s+\\1'
    `);
    const osFixed = osFixResult.rowCount || 0;
    if (osFixed > 0) console.log(`[Cleanup] Fixed ${osFixed} duplicated OS strings`);

    const riskFixResult = await pool.query(`
      UPDATE assets SET risk_score = LEAST(100, ROUND(risk_score / 5.0))
      WHERE risk_score > 100
    `);
    const riskFixed = riskFixResult.rowCount || 0;
    if (riskFixed > 0) console.log(`[Cleanup] Normalized ${riskFixed} risk scores from >100 to 0-100 range`);

    const STATUS_VALUES = ['active', 'inactive', 'online', 'offline', 'paused', 'enabled', 'disabled', 'running', 'stopped', 'unknown'];
    const versionFixResult = await pool.query(`
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
    const versionFixed = versionFixResult.rowCount || 0;
    if (versionFixed > 0) console.log(`[Cleanup] Fixed software versions for ${versionFixed} assets (removed status values, synced CynetEPS versions)`);

    const OS_STATUS_VALUES = ['decommissioned', 'running', 'operational', 'powered off', 'powered on', 'inactive', 'retired', 'unknown', 'n/a', 'none', 'not available', 'shutoff', 'suspended', 'pending', 'maintenance', 'active', 'online', 'offline', 'down', 'up', 'stopped'];
    const osStatusFixResult = await pool.query(`
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

    const tsRegionFixResult = await pool.query(`
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
  const PKF_TENANT_ID = 37;
  await ensureSecurityIntegrationsUniqueConstraint();
  try {
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
        console.log(`[IntegRestore] Restored missing PKF Africa integration: ${integ.platform_key} (status: disconnected, credentials required)`);
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

  app.get("/_health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", ready: serverReady });
  });

  await runMigrations();
  // Ensure tenant_quotas table exists (idempotent — safe to run every startup)
  await ensureQuotaTable();
  const { createPerformanceIndexes, warmUpPool } = await import("./db");
  warmUpPool(3).catch(err => console.warn("[DB Pool] Warm-up error:", err.message));
  createPerformanceIndexes().catch(err => console.warn("[DB] Index creation deferred:", err.message));

  // Start crash-guard monitors
  startMemoryMonitor(30_000);
  startPoolSaturationMonitor(15_000);

  if (process.env.NODE_ENV === "production") {
    await registerRoutes(httpServer, app);

    app.use(globalErrorHandler);

    serveStatic(app);

    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      log(`serving on port ${port}`);
    });

    (async () => {
      try {
        await runProdDataMigration();
        await restorePkfAfricaIntegrations();
        await cleanupInferredCynetEPS();
        await runStartupEnrichment();
        const ipsCleaned = await cleanInvalidIPAddresses();
        if (ipsCleaned > 0) log(`Cleaned ${ipsCleaned} invalid IP addresses`);
        await runStartupAssetCleanup();
        runSigmaEnrichmentOnExistingEvents().catch(e => console.error("[Sigma] Startup enrichment error:", e));
        serverReady = true;
        markSchedulerReady();
        const { startAIAgentScheduler } = await import("./ai-agent-scheduler");
        startAIAgentScheduler();
        const { startEdrScheduler } = await import("./edr-scheduler");
        startEdrScheduler();
        await startKafkaConsumerIfPrimary(log);
        log("Background initialization complete");
      } catch (err) {
        console.error("Background initialization error:", err);
      }
    })();
  } else {
    await runProdDataMigration();
    await restorePkfAfricaIntegrations();
    await registerRoutes(httpServer, app);

    app.use(globalErrorHandler);

    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);

    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      log(`serving on port ${port}`);
    });

    serverReady = true;
    markSchedulerReady();
    await startKafkaConsumerIfPrimary(log);
    log("Server fully initialized");
  }

  // ML behavioral jobs — run in all environments using existing shared pool
  import("./ml-behavior-engine.js").then(({ startBaselineRefreshJob, startEntityScoringJob }) => {
    startBaselineRefreshJob(pool).catch((e: any) => console.error("[ML Baseline] Startup error:", e));
    startEntityScoringJob(pool).catch((e: any) => console.error("[ML Scoring] Startup error:", e));
  }).catch((e: any) => console.error("[ML Baseline] Import error:", e));
})();
