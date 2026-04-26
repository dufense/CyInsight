/**
 * Structured logger with PII redaction
 * Replaces console.* for production use
 */

const SENSITIVE_KEYS = new Set([
  "password", "token", "mfaToken", "secret", "apiKey", "api_key",
  "mfaSecret", "passwordHash", "refreshToken", "sessionId", "authorization",
  "cookie", "x-xsrf-token", "credit_card", "ssn", "passport",
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return Array.from(SENSITIVE_KEYS).some(sk => lower.includes(sk));
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      result[k] = redact(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function formatLog(level: string, message: string, meta?: Record<string, unknown>): string {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? redact(meta) : {}),
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(formatLog("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatLog("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatLog("error", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(formatLog("debug", message, meta));
    }
  },
};
