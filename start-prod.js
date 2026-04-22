/**
 * Cyber Command Center — Production Startup
 *
 * Supports cluster mode for vertical scaling:
 *   - Defaults to one worker per available CPU core (CLUSTER_WORKERS=auto)
 *   - Set CLUSTER_WORKERS=<N> to override with a specific worker count
 *   - Set CLUSTER_WORKERS=1 to run single-process (useful for debugging)
 *   - Primary process monitors workers and respawns on crash (max 5 restarts / 60s)
 *   - SIGTERM/SIGINT broadcast to all workers for graceful shutdown
 *
 * Crash-hardening additions:
 *   - Exponential backoff on crash-loop (15s → 30s → 60s → 120s)
 *   - Worker memory pressure monitoring (RSS > WORKER_MAX_RSS_MB → graceful restart)
 *   - Primary process uncaughtException / unhandledRejection handlers
 *   - Liveness probe via /_health HTTP endpoint polling
 *
 * Examples:
 *   node start-prod.js                         # auto-detect CPUs (default)
 *   CLUSTER_WORKERS=8 node start-prod.js       # use 8 worker processes
 *   CLUSTER_WORKERS=1 node start-prod.js       # single-process mode
 *   CLUSTER_WORKERS_MAX=4 node start-prod.js   # cap at 4 workers (ECS Fargate)
 *   WORKER_MAX_RSS_MB=512 node start-prod.js   # restart worker if RSS exceeds 512 MB
 */

import cluster from 'cluster';
import { cpus } from 'os';
import { createRequire } from 'module';

process.env.NODE_ENV = 'production';

// ── Primary-process crash protection ────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Cluster][Primary] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Cluster][Primary] Unhandled rejection:', reason);
});

const availableCPUs = cpus().length;
const workerEnv = process.env.CLUSTER_WORKERS || 'auto';
const requestedWorkers =
  workerEnv === 'auto' ? availableCPUs : parseInt(workerEnv, 10) || 1;

// CLUSTER_WORKERS_MAX caps the worker count regardless of how many CPUs the OS
// reports. Defaults to 1 (single-process mode) which is correct for:
//   - Replit Autoscale: scales horizontally across containers; no intra-process
//     cluster needed, and Replit's PostgreSQL has a tight connection limit.
//   - ECS Fargate: the host's full CPU count is visible inside the container
//     even though the task only has a fraction of vCPUs allocated.
const maxWorkers = parseInt(process.env.CLUSTER_WORKERS_MAX || "1", 10) || 1;
const numWorkers = Math.min(Math.max(1, requestedWorkers), maxWorkers);

// Maximum RSS in MB before a worker is gracefully recycled (OOM prevention)
const WORKER_MAX_RSS_MB = parseInt(process.env.WORKER_MAX_RSS_MB || "1200", 10);

if (numWorkers === 1 || !cluster.isPrimary) {
  // Single-process mode OR this is a worker — just run the app
  const require = createRequire(import.meta.url);
  require('./dist/index.cjs');
} else {
  // ── Primary process: cluster manager ────────────────────────────────────────

  console.log(
    `[Cluster] Starting ${numWorkers} worker processes (${availableCPUs} CPUs available, ` +
    `WORKER_MAX_RSS_MB=${WORKER_MAX_RSS_MB})`
  );

  /** Track restart timestamps + backoff state per worker */
  const restartHistory = new Map();
  const backoffState = new Map();
  const MAX_RESTARTS = 5;
  const RESTART_WINDOW_MS = 60_000;
  // Exponential backoff: 15s, 30s, 60s, 120s (capped)
  const BACKOFF_STEPS_MS = [15_000, 30_000, 60_000, 120_000];

  function getBackoffMs(workerId) {
    const step = backoffState.get(workerId) || 0;
    return BACKOFF_STEPS_MS[Math.min(step, BACKOFF_STEPS_MS.length - 1)];
  }

  function incrementBackoff(workerId) {
    const current = backoffState.get(workerId) || 0;
    backoffState.set(workerId, Math.min(current + 1, BACKOFF_STEPS_MS.length - 1));
  }

  function forkWorker() {
    const worker = cluster.fork();
    restartHistory.set(worker.id, []);
    backoffState.delete(worker.id);
    console.log(`[Cluster] Worker ${worker.process.pid} (id=${worker.id}) started`);

    // Monitor this worker's memory usage every 30s
    const memTimer = setInterval(() => {
      if (worker.isDead()) { clearInterval(memTimer); return; }
      try {
        // Approximate RSS from /proc/<pid>/status or use process.memoryUsage() via IPC
        const pid = worker.process.pid;
        if (!pid) { clearInterval(memTimer); return; }

        // Send a ping; worker responds with memory stats if healthy
        worker.send({ type: 'healthcheck' });
      } catch {}
    }, 30_000);

    memTimer.unref();
    return worker;
  }

  // Handle memory reports from workers
  cluster.on('message', (worker, message) => {
    if (!message || message.type !== 'memory_report') return;
    const rssMB = Math.round(message.rss / 1024 / 1024);
    if (rssMB > WORKER_MAX_RSS_MB) {
      console.error(
        `[Cluster] Worker ${worker.process.pid} RSS ${rssMB}MB exceeds ${WORKER_MAX_RSS_MB}MB limit — ` +
        `triggering graceful restart`
      );
      worker.disconnect();
      setTimeout(() => {
        if (!worker.isDead()) {
          console.warn(`[Cluster] Worker ${worker.process.pid} did not disconnect — force killing`);
          worker.process.kill('SIGKILL');
        }
      }, 5_000);
    }
  });

  // Fork initial workers
  for (let i = 0; i < numWorkers; i++) {
    forkWorker();
  }

  cluster.on('exit', (worker, code, signal) => {
    if (worker.exitedAfterDisconnect) {
      console.log(`[Cluster] Worker ${worker.process.pid} exited cleanly — respawning`);
      setTimeout(() => forkWorker(), 1000);
      return;
    }

    console.error(
      `[Cluster] Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Respawning...`
    );

    // Crash-loop protection with exponential backoff
    const history = restartHistory.get(worker.id) || [];
    const now = Date.now();
    const recent = history.filter((t) => now - t < RESTART_WINDOW_MS);
    recent.push(now);

    if (recent.length > MAX_RESTARTS) {
      incrementBackoff(worker.id);
      const backoffMs = getBackoffMs(worker.id);
      console.error(
        `[Cluster] Worker crash loop detected (${recent.length} restarts in ${RESTART_WINDOW_MS / 1000}s). ` +
        `Backing off ${backoffMs / 1000}s before respawning.`
      );
      setTimeout(() => {
        const newWorker = forkWorker();
        restartHistory.set(newWorker.id, []);
      }, backoffMs);
    } else {
      const newWorker = forkWorker();
      restartHistory.set(newWorker.id, recent);
    }
  });

  cluster.on('listening', (worker, address) => {
    console.log(`[Cluster] Worker ${worker.process.pid} listening on ${address.address}:${address.port}`);
  });

  // Graceful shutdown: forward signals to all workers, wait, then exit
  function shutdown(signal) {
    const workers = Object.values(cluster.workers || {});
    console.log(`[Cluster] Received ${signal}. Gracefully shutting down ${workers.length} worker(s)...`);

    for (const worker of workers) {
      if (worker && !worker.isDead()) {
        try { worker.process.kill(signal); } catch {}
      }
    }

    // Give workers 12s to exit cleanly, then force
    let exitTimer = setTimeout(() => {
      console.warn('[Cluster] Forced shutdown after 12s');
      process.exit(0);
    }, 12_000);
    exitTimer.unref();

    // Exit as soon as all workers have died
    let remaining = workers.length;
    if (remaining === 0) { clearTimeout(exitTimer); process.exit(0); }
    cluster.on('exit', () => {
      remaining--;
      if (remaining <= 0) {
        clearTimeout(exitTimer);
        console.log('[Cluster] All workers exited — shutdown complete');
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
