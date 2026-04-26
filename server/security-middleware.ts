import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { makeRateLimitStore } from "./cache";

export function applySecurityMiddleware(app: Express) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://fonts.googleapis.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
          fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          frameSrc: ["'none'"],
          frameAncestors: ["*"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xContentTypeOptions: true,
      xFrameOptions: false,
      xXssProtection: false,
      hidePoweredBy: true,
    })
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    next();
  });

  const globalWindowMs = 15 * 60 * 1000;
  const globalLimiter = rateLimit({
    windowMs: globalWindowMs,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !req.path.startsWith("/api/"),
    message: { message: "Too many requests, please try again later." },
    keyGenerator: (req) => {
      return (
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        "unknown"
      );
    },
    store: makeRateLimitStore(globalWindowMs, "global"),
  });

  const authWindowMs = 15 * 60 * 1000;
  const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        "unknown";
      const username = (req.body?.username || "").toString().toLowerCase().trim();
      return `auth:${ip}:${username}`;
    },
    store: makeRateLimitStore(authWindowMs, "auth"),
  });

  const writeWindowMs = 60 * 1000;
  const apiWriteLimiter = rateLimit({
    windowMs: writeWindowMs,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Write rate limit exceeded. Please slow down." },
    skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
    store: makeRateLimitStore(writeWindowMs, "write"),
  });

  const bulkWindowMs = 5 * 60 * 1000;
  const bulkOperationLimiter = rateLimit({
    windowMs: bulkWindowMs,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Bulk operation rate limit exceeded. Please wait before retrying." },
    store: makeRateLimitStore(bulkWindowMs, "bulk"),
  });

  const ingestWindowMs = 60 * 1000;
  const ingestLimiter = rateLimit({
    windowMs: ingestWindowMs,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Ingest rate limit exceeded." },
    store: makeRateLimitStore(ingestWindowMs, "ingest"),
  });

  app.use("/api/", globalLimiter);
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/", authLimiter);
  app.use("/api/incidents/bulk", bulkOperationLimiter);
  app.use("/api/events/bulk", bulkOperationLimiter);
  app.use("/api/ingest/", ingestLimiter);
  app.use("/api/", apiWriteLimiter);

  if (process.env.NODE_ENV === "production") {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const proto = req.headers["x-forwarded-proto"];
      if (proto && proto !== "https") {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }
}

const SENSITIVE_FIELDS = ["password", "token", "mfaToken", "secret", "apiKey", "code", "mfaSecret", "passwordHash", "refreshToken", "sessionId"];

function redactSensitive(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitive(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function securityAuditLogger(req: Request, _res: Response, next: NextFunction) {
  const suspiciousPatterns = [
    /(\bOR\b|\bAND\b)\s+[\d'"]+=\s*[\d'"]+/i,
    /<script[\s>]/i,
    /javascript:/i,
    /\.\.\//,
    /\x00/,
  ];
  const bodyForLog = typeof req.body === "string" ? req.body : JSON.stringify(redactSensitive(req.body) || {});
  const toCheck = [
    req.url,
    JSON.stringify(req.query),
    bodyForLog,
  ].join(" ");

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(toCheck)) {
      console.warn(`[Security] Suspicious request from ${req.ip} to ${req.method} ${req.path}`);
      break;
    }
  }
  next();
}
