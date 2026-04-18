import crypto from "crypto";

export interface EventRecord {
  tenantId: number;
  eventType: string;
  severity: string;
  threat?: string;
  target?: string;
  attacker?: string;
  asset?: string;
  app?: string;
  description?: string;
  threatVector?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  action?: string;
  sourceType?: string;
  logSource?: string;
  sender?: string;
  recipient?: string;
  protocol?: string;
  country?: string;
  riskScore?: number;
  rawPayload?: Record<string, any>;
  sigmaMatches?: any;
  enrichedDescription?: string;
  occurredAt?: string;
  normalizedAt?: string;
  enrichedAt?: string;
  correlatedAt?: string;
  // Enriched fields — populated from payload and forwarded to ClickHouse indexer
  host?: string;
  srcIp?: string;
  dstIp?: string;
  userName?: string;
  processName?: string;
  killChainPhase?: string;
  confidenceScore?: number;
  dataRegion?: string;
  normalizedEvent?: Record<string, any>;
  iocs?: any;
}

export interface WriteResult {
  inserted: number;
  duplicates: number;
  errors: number;
  errorMessages: string[];
  /** Hashes of the events that were actually inserted (not rejected by ON CONFLICT). */
  insertedHashes?: Set<string>;
}

export function computeEventHash(event: EventRecord): string {
  const parts = [
    String(event.tenantId || ""),
    event.logSource || "",
    event.eventType || "",
    event.threat || "",
    event.occurredAt || "",
    event.attacker || "",
    event.target || "",
    event.asset || "",
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex");
}

const BATCH_SIZE = 500;

/** Best-effort ClickHouse write after each successful PG batch (non-fatal). */
async function tryClickHouseDualWrite(events: EventRecord[], insertedCount: number): Promise<void> {
  if (insertedCount === 0) return;
  let chClient: { insertEvents: (rows: unknown[]) => Promise<void> } | null = null;
  try {
    // Use a resolved absolute path to avoid relative-path ambiguity when this
    // module is loaded from different working directories.
    const chModule = await import("../../../server/clickhouse-client") as {
      getClickHouseClient: () => { insertEvents: (rows: unknown[]) => Promise<void> } | null;
    };
    chClient = chModule.getClickHouseClient();
  } catch {
    // Module not found (e.g. standalone storage service build) — skip silently.
    return;
  }
  if (!chClient) return;

  const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
  const IPV6_RE = /^[0-9a-fA-F:]+$/;
  const validIp = (v: string | null | undefined): string | undefined =>
    v && (IPV4_RE.test(v) || IPV6_RE.test(v)) ? v : undefined;

  const chPayload = events.map((e) => ({
    event_id:        computeEventHash(e),
    tenant_id:       e.tenantId,
    event_type:      e.eventType,
    source_type:     e.sourceType ?? "",
    severity:        e.severity,
    host:            e.asset ?? "",
    src_ip:          validIp(e.attacker),
    dst_ip:          validIp(e.target),
    user_name:       e.attacker && !validIp(e.attacker) ? e.attacker : "",
    mitre_tactic:    e.mitreTactic ?? "",
    mitre_technique: e.mitreTechnique ?? "",
    raw_event:       e.rawPayload ? JSON.stringify(e.rawPayload) : "",
    ingested_at:     e.occurredAt ?? new Date().toISOString(),
  }));

  chClient.insertEvents(chPayload).catch((err: Error) => {
    console.warn(`[EventWriter] ClickHouse write error (non-fatal): ${err.message}`);
  });
}

export class EventWriter {
  private pool: any;
  private writeLatencyMs = 0;
  private totalWritten = 0;
  private totalDuplicates = 0;
  private totalErrors = 0;

  constructor(pool: any) {
    this.pool = pool;
  }

  async writeBatch(events: EventRecord[]): Promise<WriteResult> {
    const result: WriteResult = { inserted: 0, duplicates: 0, errors: 0, errorMessages: [] };
    if (events.length === 0) return result;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const chunk = events.slice(i, i + BATCH_SIZE);
      const chunkResult = await this.writeChunk(chunk);
      result.inserted += chunkResult.inserted;
      result.duplicates += chunkResult.duplicates;
      result.errors += chunkResult.errors;
      result.errorMessages.push(...chunkResult.errorMessages);

      if (chunkResult.inserted > 0) {
        const insertedHashes = chunkResult.insertedHashes;
        const newEvents = insertedHashes && insertedHashes.size > 0
          ? chunk.filter(e => insertedHashes.has(computeEventHash(e)))
          : chunk;
        if (newEvents.length > 0) {
          await tryClickHouseDualWrite(newEvents, chunkResult.inserted);
        }
      }
    }

    this.totalWritten += result.inserted;
    this.totalDuplicates += result.duplicates;
    this.totalErrors += result.errors;
    return result;
  }

  private async writeChunk(events: EventRecord[]): Promise<WriteResult> {
    const result: WriteResult = { inserted: 0, duplicates: 0, errors: 0, errorMessages: [] };
    const startTime = Date.now();

    try {
      const values: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      for (const event of events) {
        const hash = computeEventHash(event);
        const now = new Date().toISOString();
        const occurredAt = event.occurredAt || now;

        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        params.push(
          event.tenantId,
          event.eventType,
          event.severity || "medium",
          event.threat || null,
          event.target || null,
          event.attacker || null,
          event.asset || null,
          event.app || null,
          event.description || null,
          event.threatVector || null,
          event.mitreTactic || null,
          event.mitreTechnique || null,
          event.action || null,
          event.sourceType || null,
          event.logSource || null,
          event.sender || null,
          event.recipient || null,
          event.protocol || null,
          event.country || null,
          event.riskScore || null,
          event.rawPayload ? JSON.stringify(event.rawPayload) : null,
          event.sigmaMatches ? JSON.stringify(event.sigmaMatches) : null,
          event.enrichedDescription || null,
          hash,
          occurredAt,
          "stored",
          now,
        );
      }

      const query = `
        INSERT INTO security_events (
          tenant_id, event_type, severity, threat, target, attacker, asset, app,
          description, threat_vector, mitre_tactic, mitre_technique, action,
          source_type, log_source, sender, recipient, protocol, country,
          risk_score, raw_payload, sigma_matches, enriched_description,
          event_hash, occurred_at, pipeline_status, stored_at
        ) VALUES ${values.join(", ")}
        ON CONFLICT (event_hash) DO NOTHING
        RETURNING event_hash
      `;

      const res = await this.pool.query(query, params);
      result.inserted = res.rowCount || 0;
      result.duplicates = events.length - result.inserted;
      // Track which hashes were actually persisted so dual-write can filter.
      result.insertedHashes = new Set<string>(
        (res.rows as Array<{ event_hash: string }>).map(r => r.event_hash),
      );
    } catch (err: any) {
      result.errors = events.length;
      result.errorMessages.push(err.message);
      console.error(`[EventWriter] Batch write error: ${err.message}`);
    }

    this.writeLatencyMs = Date.now() - startTime;
    return result;
  }

  getStats() {
    return {
      totalWritten: this.totalWritten,
      totalDuplicates: this.totalDuplicates,
      totalErrors: this.totalErrors,
      lastWriteLatencyMs: this.writeLatencyMs,
    };
  }

  getWriteLatency(): number {
    return this.writeLatencyMs;
  }
}
