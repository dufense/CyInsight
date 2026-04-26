import crypto from "crypto";
import { storage } from "./storage";
import type { IngestApiKey, IngestBatch } from "@shared/schema";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 1000;

const rateLimitMap = new Map<number, { count: number; windowStart: number }>();
const rateLimitLocks = new Map<number, Promise<void>>();

async function acquireTenantLock(tenantId: number): Promise<() => void> {
  while (rateLimitLocks.has(tenantId)) {
    await rateLimitLocks.get(tenantId);
  }
  let release: () => void;
  const lock = new Promise<void>(resolve => { release = resolve; });
  rateLimitLocks.set(tenantId, lock);
  return () => {
    rateLimitLocks.delete(tenantId);
    release!();
  };
}

export async function checkRateLimit(tenantId: number, eventCount: number): Promise<{ allowed: boolean; remaining: number }> {
  const release = await acquireTenantLock(tenantId);
  try {
    const now = Date.now();
    let entry = rateLimitMap.get(tenantId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry = { count: 0, windowStart: now };
      rateLimitMap.set(tenantId, entry);
    }

    const remaining = RATE_LIMIT_MAX_EVENTS - entry.count;
    if (eventCount > remaining) {
      return { allowed: false, remaining };
    }

    entry.count += eventCount;
    return { allowed: true, remaining: remaining - eventCount };
  } finally {
    release();
  }
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = `soi_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 8);
  return { rawKey, keyHash, keyPrefix };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function authenticateApiKey(authHeader: string | undefined): Promise<IngestApiKey | null> {
  if (!authHeader) return null;

  let rawKey: string;
  if (authHeader.startsWith("Bearer ")) {
    rawKey = authHeader.substring(7);
  } else {
    rawKey = authHeader;
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = await storage.getIngestApiKeyByHash(keyHash);

  if (!apiKey || !apiKey.isActive) return null;

  storage.updateIngestApiKeyLastUsed(apiKey.id).catch(() => {});

  return apiKey;
}

export interface ParsedIngestPayload {
  events: Record<string, any>[];
  source: string;
  contentType: string;
}

export function parseJsonPayload(body: any): Record<string, any>[] {
  if (Array.isArray(body)) {
    return body;
  }

  if (body && typeof body === "object") {
    if (body.events && Array.isArray(body.events)) {
      return body.events;
    }
    if (body.data && Array.isArray(body.data)) {
      return body.data;
    }
    if (body.alerts && Array.isArray(body.alerts)) {
      return body.alerts;
    }
    if (body.detections && Array.isArray(body.detections)) {
      return body.detections;
    }
    if (body.incidents && Array.isArray(body.incidents)) {
      return body.incidents;
    }
    return [body];
  }

  return [];
}

export function parseNdjsonPayload(raw: string): Record<string, any>[] {
  const events: Record<string, any>[] = [];
  const lines = raw.split("\n").filter(line => line.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      }
    } catch {
    }
  }
  return events;
}

export function parseCsvPayload(raw: string): Record<string, any>[] {
  const lines = raw.split("\n").filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const events: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === headers.length) {
      const event: Record<string, any> = {};
      headers.forEach((header, idx) => {
        event[header] = values[idx];
      });
      events.push(event);
    }
  }

  return events;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

export function detectSource(events: Record<string, any>[]): string {
  if (events.length === 0) return "unknown";

  const sample = events[0];
  const keys = Object.keys(sample).map(k => k.toLowerCase());
  const allText = JSON.stringify(sample).toLowerCase();

  if (keys.some(k => k.includes("crowdstrike")) || allText.includes("falcon")) return "crowdstrike";
  if (keys.some(k => k.includes("paloalto") || k.includes("cortex")) || allText.includes("cortex xdr")) return "palo_alto_cortex";
  if (keys.some(k => k.includes("checkpoint")) || allText.includes("check point")) return "checkpoint";
  if (keys.some(k => k.includes("cynet")) || allText.includes("cynet")) return "cynet";
  if (keys.some(k => k.includes("sentinel")) || allText.includes("sentinel")) return "azure_sentinel";
  if (keys.some(k => k.includes("splunk")) || allText.includes("splunk")) return "splunk";
  if (keys.some(k => k.includes("skyhigh")) || allText.includes("skyhigh")) return "skyhigh";
  if (keys.some(k => k.includes("netskope")) || allText.includes("netskope")) return "netskope";
  if (keys.some(k => k.includes("qualys")) || allText.includes("qualys")) return "qualys";
  if (keys.some(k => k.includes("tenable")) || allText.includes("tenable")) return "tenable";
  if (keys.some(k => k.includes("rapid7")) || allText.includes("rapid7")) return "rapid7";

  if (keys.some(k => ["severity", "alert", "threat", "event_type"].includes(k))) return "generic_security";

  return "unknown";
}

export async function createIngestBatch(
  tenantId: number,
  events: Record<string, any>[],
  channel: "api" | "file" | "connector",
  source: string,
  metadata?: Record<string, any>
): Promise<IngestBatch> {
  const batch = await storage.createIngestBatch({
    tenantId,
    source,
    channel,
    status: "queued",
    totalEvents: events.length,
    processedEvents: 0,
    errorCount: 0,
    startedAt: new Date(),
    metadata: {
      ...metadata,
      rawEventsSample: events.slice(0, 10).map((e) => {
        const s: Record<string, any> = {};
        for (const [k, v] of Object.entries(e)) {
          s[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
        }
        return s;
      }),
      eventCount: events.length,
    },
  });

  return batch;
}
