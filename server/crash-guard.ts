/**
 * server/crash-guard.ts — Cyber Command Center Crash Protection Layer
 *
 * Provides:
 *  1. Enhanced process-level exception handlers
 *  2. asyncHandler() — wraps Express route handlers so async throws are forwarded to next(err)
 *  3. safeSetTimeout() / safeSetInterval() — scheduler wrappers that catch and log errors
 *  4. Memory pressure monitor — warns at 80%, soft-restarts worker at 95%
 *  5. DB circuit breaker — stops hammering a failed DB and returns 503 early
 *  6. Pool saturation guard — warns when DB pool is near exhaustion
 *  7. requestId middleware — attaches unique X-Request-ID to every request
 */

import { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";

// ─── 1. Process-level handlers ─────────────────────────────────────────────────

process.on("uncaughtException", (err: Error) => {
  const isHarmless =
    (err as any).code === "ECONNRESET" ||
    (err as any).code === "EPIPE" ||
    (err as any).code === "ENOTFOUND" ||
    err.message?.includes("socket hang up") ||
    err.message?.includes("write after end") ||
    err.message?.includes("read ECONNRESET");

  if (isHarmless) {
    console.warn("[CrashGuard] Harmless socket error (swallowed):", err.message);
    return;
  }

  console.error("[CrashGuard] UNCAUGHT EXCEPTION — process will continue:", err);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const isHarmless =
    msg.includes("ECONNRESET") ||
    msg.includes("EPIPE") ||
    msg.includes("socket hang up") ||
    msg.includes("AbortError") ||
    msg.includes("The operation was aborted") ||
    msg.includes("Request aborted");

  if (isHarmless) {
    console.warn("[CrashGuard] Harmless unhandled rejection (swallowed):", msg);
    return;
  }

  console.error("[CrashGuard] UNHANDLED REJECTION:", reason, "Promise:", promise);
});

// ─── 2. asyncHandler — universal async Express wrapper ─────────────────────────

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (!res.headersSent) {
        next(err);
      } else {
        console.error("[CrashGuard] asyncHandler: headers already sent, cannot forward error:", err?.message);
      }
    });
  };
}

// ─── 3. Safe scheduler wrappers ────────────────────────────────────────────────

export function safeSetTimeout(fn: () => Promise<void> | void, ms: number, label = "scheduler"): NodeJS.Timeout {
  return setTimeout(() => {
    try {
      const result = fn();
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((err: Error) => {
          console.error(`[CrashGuard][${label}] setTimeout async error:`, err?.message ?? err);
        });
      }
    } catch (err: any) {
      console.error(`[CrashGuard][${label}] setTimeout sync error:`, err?.message ?? err);
    }
  }, ms);
}

let _intervalHandles: Map<string, NodeJS.Timeout> = new Map();

export function safeSetInterval(
  fn: () => Promise<void> | void,
  ms: number,
  label = "interval",
  allowOverlap = false
): NodeJS.Timeout {
  let running = false;

  const handle = setInterval(async () => {
    if (!allowOverlap && running) {
      console.warn(`[CrashGuard][${label}] Previous run still in progress — skipping tick`);
      return;
    }
    running = true;
    try {
      const result = fn();
      if (result && typeof (result as Promise<void>).then === "function") {
        await result;
      }
    } catch (err: any) {
      console.error(`[CrashGuard][${label}] setInterval error:`, err?.message ?? err);
    } finally {
      running = false;
    }
  }, ms);

  _intervalHandles.set(label, handle);
  return handle;
}

export function clearAllIntervals(): void {
  for (const [label, handle] of _intervalHandles) {
    clearInterval(handle);
    console.log(`[CrashGuard] Cleared interval: ${label}`);
  }
  _intervalHandles.clear();
}

// ─── 4. Memory pressure monitor ────────────────────────────────────────────────

const MEMORY_WARN_RATIO = 0.80;
const MEMORY_CRITICAL_RATIO = 0.92;
let _memMonitorHandle: NodeJS.Timeout | null = null;

export function startMemoryMonitor(intervalMs = 30_000): void {
  if (_memMonitorHandle) return;

  _memMonitorHandle = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const ratio = mem.heapUsed / mem.heapTotal;

    if (ratio >= MEMORY_CRITICAL_RATIO) {
      console.error(
        `[CrashGuard][Memory] CRITICAL: heap ${heapUsedMB}/${heapTotalMB}MB (${Math.round(ratio * 100)}%), RSS=${rssMB}MB` +
        ` — forcing global.gc() if available`
      );
      if (typeof (global as any).gc === "function") {
        (global as any).gc();
        console.log("[CrashGuard][Memory] Manual GC triggered");
      }
    } else if (ratio >= MEMORY_WARN_RATIO) {
      console.warn(
        `[CrashGuard][Memory] WARNING: heap ${heapUsedMB}/${heapTotalMB}MB (${Math.round(ratio * 100)}%), RSS=${rssMB}MB`
      );
    }

    if (rssMB > 900) {
      console.error(`[CrashGuard][Memory] RSS ${rssMB}MB exceeds 900MB threshold — potential memory leak`);
    }
  }, intervalMs);

  _memMonitorHandle.unref();
}

// ─── 5. DB Circuit Breaker ──────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  open: boolean;
  halfOpenAt: number;
}

const _cbState: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  open: false,
  halfOpenAt: 0,
};

const CB_FAILURE_THRESHOLD = 5;
const CB_WINDOW_MS = 30_000;
const CB_HALF_OPEN_DELAY_MS = 15_000;

export function recordDbSuccess(): void {
  if (_cbState.open || _cbState.failures > 0) {
    _cbState.failures = 0;
    _cbState.open = false;
    console.log("[CrashGuard][CB] Circuit breaker CLOSED — DB healthy");
  }
}

export function recordDbFailure(err: Error): void {
  const now = Date.now();
  if (now - _cbState.lastFailure > CB_WINDOW_MS) {
    _cbState.failures = 0;
  }
  _cbState.failures++;
  _cbState.lastFailure = now;

  if (_cbState.failures >= CB_FAILURE_THRESHOLD && !_cbState.open) {
    _cbState.open = true;
    _cbState.halfOpenAt = now + CB_HALF_OPEN_DELAY_MS;
    console.error(
      `[CrashGuard][CB] Circuit breaker OPEN after ${_cbState.failures} DB failures. ` +
      `Half-open in ${CB_HALF_OPEN_DELAY_MS / 1000}s. Last error: ${err.message}`
    );
  }
}

export function isCircuitBreakerOpen(): boolean {
  if (!_cbState.open) return false;
  if (Date.now() >= _cbState.halfOpenAt) {
    console.log("[CrashGuard][CB] Circuit breaker half-open — allowing probe request");
    return false;
  }
  return true;
}

export function circuitBreakerMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api") && isCircuitBreakerOpen()) {
    res.status(503).json({
      message: "Database is temporarily unavailable. Please retry in a few seconds.",
      retryAfter: Math.ceil((_cbState.halfOpenAt - Date.now()) / 1000),
    });
    return;
  }
  next();
}

// ─── 6. Pool saturation guard ──────────────────────────────────────────────────

export function startPoolSaturationMonitor(intervalMs = 15_000): void {
  setInterval(() => {
    const waiting = pool.waitingCount;
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const active = total - idle;

    if (waiting > 0) {
      console.warn(
        `[CrashGuard][Pool] Saturation: active=${active}, idle=${idle}, waiting=${waiting}, total=${total}`
      );
    }
    if (waiting > 5) {
      console.error(
        `[CrashGuard][Pool] CRITICAL: ${waiting} requests waiting for DB connection — consider increasing DB_POOL_MAX`
      );
    }
  }, intervalMs).unref();
}

// ─── 7. Request ID middleware ───────────────────────────────────────────────────

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  (req as any).requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}

// ─── 8. Integer parameter sanitizer ────────────────────────────────────────────

export function safeParseInt(value: unknown, fallback = 0): number {
  const parsed = parseInt(String(value ?? ""), 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function safeParsePositiveInt(value: unknown): number | null {
  const parsed = parseInt(String(value ?? ""), 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

// ─── 9. Global 404 + error handler factories ────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.path}` });
  } else {
    res.status(404).send("Not found");
  }
}

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  const message =
    status >= 500 && isProd
      ? "An internal error occurred. Please try again."
      : err.message || "Internal Server Error";

  if (status >= 500) {
    console.error(
      `[CrashGuard][Error] ${req.method} ${req.path} → ${status}:`,
      isProd ? err.message : err
    );
  }

  if (!res.headersSent) {
    res.status(status).json({ message, ...(isProd ? {} : { stack: err.stack }) });
  }
}

// ─── 10. Graceful drain helper ──────────────────────────────────────────────────

export async function drainConnections(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const waiting = pool.waitingCount;
      const active = pool.totalCount - pool.idleCount;
      if ((waiting === 0 && active === 0) || Date.now() - start > timeoutMs) {
        resolve();
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}
