import type { IOCIndicator } from "./ioc-scorer";

export interface CorrelationResult {
  entityType: "ip" | "domain" | "hash" | "email" | "hostname" | "user";
  entityValue: string;
  sourceCount: number;
  sources: string[];
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface CorrelationConfig {
  windowMs: number;
  minSources: number;
}

interface EntityEntry {
  entityType: string;
  entityValue: string;
  source: string;
  tenantId: number;
  timestamp: number;
  severity: string;
}

export class CorrelationEngine {
  private config: CorrelationConfig;
  private entityIndex: Map<string, EntityEntry[]> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config: CorrelationConfig) {
    this.config = config;
    this.cleanupInterval = setInterval(() => this.cleanExpiredEntries(), 60000);
  }

  addEvent(tenantId: number, event: Record<string, any>, iocs: IOCIndicator[]): void {
    const now = Date.now();
    const source = event.logSource || event.sourceType || event.source || "unknown";
    const severity = (event.severity || "medium").toLowerCase();

    for (const ioc of iocs) {
      const key = `${tenantId}:${ioc.type}:${ioc.value}`;
      if (!this.entityIndex.has(key)) {
        this.entityIndex.set(key, []);
      }
      this.entityIndex.get(key)!.push({
        entityType: ioc.type,
        entityValue: ioc.value,
        source,
        tenantId,
        timestamp: now,
        severity,
      });
    }

    const hostname = event.asset || event.hostname || event.host;
    if (hostname && typeof hostname === "string") {
      const key = `${tenantId}:hostname:${hostname}`;
      if (!this.entityIndex.has(key)) {
        this.entityIndex.set(key, []);
      }
      this.entityIndex.get(key)!.push({
        entityType: "hostname",
        entityValue: hostname,
        source,
        tenantId,
        timestamp: now,
        severity,
      });
    }

    const user = event.user || event.userName || event.userPrincipalName;
    if (user && typeof user === "string") {
      const key = `${tenantId}:user:${user}`;
      if (!this.entityIndex.has(key)) {
        this.entityIndex.set(key, []);
      }
      this.entityIndex.get(key)!.push({
        entityType: "user",
        entityValue: user,
        source,
        tenantId,
        timestamp: now,
        severity,
      });
    }
  }

  findCorrelations(tenantId: number, event: Record<string, any>): CorrelationResult[] {
    const results: CorrelationResult[] = [];
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const keysToCheck: string[] = [];

    const hostname = event.asset || event.hostname || event.host;
    if (hostname) keysToCheck.push(`${tenantId}:hostname:${hostname}`);

    const user = event.user || event.userName || event.userPrincipalName;
    if (user) keysToCheck.push(`${tenantId}:user:${user}`);

    const sourceIp = event.sourceIp || event.source_ip || event.attacker;
    if (sourceIp) keysToCheck.push(`${tenantId}:ip:${sourceIp}`);

    const destIp = event.destinationIp || event.destination_ip || event.target;
    if (destIp) keysToCheck.push(`${tenantId}:ip:${destIp}`);

    const domain = event.domain || event.senderDomain;
    if (domain) keysToCheck.push(`${tenantId}:domain:${domain}`);

    for (const key of keysToCheck) {
      const entries = this.entityIndex.get(key);
      if (!entries) continue;

      const recentEntries = entries.filter((e) => e.timestamp >= windowStart);
      if (recentEntries.length === 0) continue;

      const uniqueSources = new Set(recentEntries.map((e) => e.source));
      if (uniqueSources.size < this.config.minSources) continue;

      const parts = key.split(":");
      const entityType = parts[1] as CorrelationResult["entityType"];
      const entityValue = parts.slice(2).join(":");

      const timestamps = recentEntries.map((e) => e.timestamp);
      const severities = recentEntries.map((e) => e.severity);

      let maxSeverity: CorrelationResult["severity"] = "low";
      if (severities.includes("critical")) maxSeverity = "critical";
      else if (severities.includes("high")) maxSeverity = "high";
      else if (severities.includes("medium")) maxSeverity = "medium";

      results.push({
        entityType,
        entityValue,
        sourceCount: uniqueSources.size,
        sources: Array.from(uniqueSources),
        eventCount: recentEntries.length,
        firstSeen: new Date(Math.min(...timestamps)).toISOString(),
        lastSeen: new Date(Math.max(...timestamps)).toISOString(),
        severity: maxSeverity,
      });
    }

    return results;
  }

  getWindowSize(): number {
    return this.entityIndex.size;
  }

  getActiveEntityCount(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let count = 0;
    for (const entries of this.entityIndex.values()) {
      if (entries.some((e) => e.timestamp >= windowStart)) {
        count++;
      }
    }
    return count;
  }

  private cleanExpiredEntries(): void {
    const cutoff = Date.now() - this.config.windowMs;
    for (const [key, entries] of this.entityIndex.entries()) {
      const active = entries.filter((e) => e.timestamp >= cutoff);
      if (active.length === 0) {
        this.entityIndex.delete(key);
      } else {
        this.entityIndex.set(key, active);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.entityIndex.clear();
  }
}
