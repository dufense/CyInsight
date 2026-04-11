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
}

export interface WriteResult {
  inserted: number;
  duplicates: number;
  errors: number;
  errorMessages: string[];
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
      `;

      const res = await this.pool.query(query, params);
      result.inserted = res.rowCount || 0;
      result.duplicates = events.length - result.inserted;
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
