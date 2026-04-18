/**
 * ClickHouse Indexer for Security Events
 *
 * ClickHouse is the single source of truth for security events in the starter
 * stack.  This module ensures the canonical `security_events` table (plus the
 * `security_events_hourly_stats` aggregating materialized view) exist and
 * handles batched INSERTs from the storage microservice.
 *
 * Scalability targets:
 *   - Billions of events across all tenants
 *   - Thousands of tenants (per-tenant partition pruning via tenant_id in ORDER BY)
 *   - Millions of log sources (log_source stored as String, not LowCardinality)
 *
 * Column mapping notes (storage → ClickHouse):
 *   - asset           → host (enriched) + asset (legacy)
 *   - attacker        → src_ip (enriched) + attacker (legacy)
 *   - sourceType      → source_type (enriched) + log_source (legacy)
 *   - occurredAt      → occurred_at (legacy) + ingested_at (enriched)
 *   - rawPayload      → raw_event (JSON string, ZSTD compressed)
 *   - sigmaMatches    → iocs (JSON string)
 *   - riskScore       → risk_score (legacy) + confidence_score (enriched)
 */

import type { EventRecord } from "./event-writer";

export interface ClickHouseConfig {
  url: string;
  database: string;
  table: string;
  username?: string;
  password?: string;
  batchSize: number;
}

export interface IndexResult {
  indexed: number;
  errors: number;
}

export interface ClickHouseStats {
  connected: boolean;
  totalIndexed: number;
  totalErrors: number;
  table: string;
  circuitOpen: boolean;
  lastErrorMs: number;
}

interface EventSearchParams {
  tenantIds: number[];
  eventType?: string;
  severity?: string | string[];
  threat?: string;
  attacker?: string;
  target?: string;
  description?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
}

interface EventSearchResult {
  events: any[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Circuit Breaker ───────────────────────────────────────────────────────────
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 30_000;

export class ClickHouseIndexer {
  private config: ClickHouseConfig;
  private totalIndexed = 0;
  private totalErrors = 0;
  private connected = false;

  private circuitFailures = 0;
  private circuitOpenAt = 0;
  private lastErrorMs = 0;

  constructor(config: ClickHouseConfig) {
    this.config = config;
  }

  private isCircuitOpen(): boolean {
    if (this.circuitFailures < CIRCUIT_FAILURE_THRESHOLD) return false;
    const elapsed = Date.now() - this.circuitOpenAt;
    if (elapsed > CIRCUIT_OPEN_MS) {
      this.circuitFailures = 0;
      this.circuitOpenAt = 0;
      return false;
    }
    return true;
  }

  private recordSuccess() {
    this.circuitFailures = 0;
    this.circuitOpenAt = 0;
  }

  private recordFailure() {
    this.circuitFailures++;
    this.lastErrorMs = Date.now();
    if (this.circuitFailures >= CIRCUIT_FAILURE_THRESHOLD && !this.circuitOpenAt) {
      this.circuitOpenAt = Date.now();
      console.warn(`[ClickHouseIndexer] Circuit OPEN after ${this.circuitFailures} failures — pausing ${CIRCUIT_OPEN_MS / 1000}s`);
    }
  }

  async connect(): Promise<boolean> {
    if (!this.config.url) {
      console.log("[ClickHouseIndexer] No URL configured, indexing disabled");
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${this.config.url}/ping`, { method: "GET", signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          this.connected = true;
          console.log("[ClickHouseIndexer] Connected to ClickHouse");
          await this.ensureTable();
          return true;
        }
      } catch (err: any) {
        console.log(`[ClickHouseIndexer] Connection attempt ${attempt}/3 failed: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    return false;
  }

  /**
   * Ensure the security_events table and materialized views exist.
   *
   * Schema design for scale:
   *  - PARTITION BY toYYYYMMDD(occurred_at) — daily partitions for fast TTL drops
   *    and efficient range scans over billions of events
   *  - ORDER BY (tenant_id, toStartOfHour(occurred_at), severity, event_type, event_id)
   *    — tenant_id first for per-tenant partition pruning across 1000s of tenants
   *  - log_source stored as String (not LowCardinality) — LowCardinality has a
   *    65 536-value limit; millions of log sources require plain String
   *  - TTL occurred_at + INTERVAL 90 DAY — hot-tier auto-expiry; adjust via env
   *  - CODEC(ZSTD(3)) on all high-cardinality text fields
   */
  private async ensureTable(): Promise<void> {
    await this.query(`CREATE DATABASE IF NOT EXISTS ${this.config.database}`);

    const hotDays = parseInt(process.env.HOT_RETENTION_DAYS ?? "90", 10);

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.config.database}.${this.config.table} (
        event_id     UUID            DEFAULT generateUUIDv4(),
        tenant_id    Int32,
        event_date   Date            MATERIALIZED toDate(occurred_at),

        -- Core event fields (legacy columns — still populated by storage service)
        event_type       LowCardinality(String),
        severity         LowCardinality(String),
        threat           String CODEC(ZSTD(3)),
        target           String CODEC(ZSTD(3)),
        attacker         String CODEC(ZSTD(3)),
        asset            String CODEC(ZSTD(3)),
        description      String CODEC(ZSTD(3)),
        mitre_tactic     LowCardinality(String),
        mitre_technique  LowCardinality(String),
        action           LowCardinality(String),

        -- log_source is String (not LowCardinality) to support millions of unique sources
        log_source       String CODEC(ZSTD(3)),
        country          LowCardinality(String),
        risk_score       UInt8,
        occurred_at      DateTime64(3),
        stored_at        DateTime64(3) DEFAULT now64(3),

        -- Enriched columns (added by this PR — required by dashboard & SOC console)
        -- source_type is the normalised source category (EDR, SIEM, Firewall, etc.)
        source_type      LowCardinality(String),
        host             String CODEC(ZSTD(3)),
        src_ip           String CODEC(ZSTD(3)),
        dst_ip           String CODEC(ZSTD(3)),
        user_name        String CODEC(ZSTD(3)),
        process_name     String CODEC(ZSTD(3)),
        kill_chain_phase LowCardinality(String),
        confidence_score UInt8 DEFAULT 0,
        data_region      LowCardinality(String),
        raw_event        String CODEC(ZSTD(6)),
        normalized_event String CODEC(ZSTD(3)),
        iocs             String CODEC(ZSTD(3)),
        ingested_at      DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMMDD(occurred_at)
      ORDER BY (tenant_id, toStartOfHour(occurred_at), severity, event_type, event_id)
      SETTINGS index_granularity = 8192,
               min_bytes_for_wide_part = 10485760,
               min_rows_for_wide_part = 512000
      TTL occurred_at + INTERVAL ${hotDays} DAY
    `;

    await this.query(createTableSQL);
    console.log(`[ClickHouseIndexer] Table ${this.config.table} ready (TTL ${hotDays}d)`);

    await this.createMaterializedViews();
  }

  /**
   * AggregatingMergeTree hourly-stats MV — enables sub-second KPI queries
   * via countMerge(cnt) instead of full table scans.
   */
  private async createMaterializedViews(): Promise<void> {
    const mvTable = `${this.config.table}_hourly_stats`;

    const createMVSQL = `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.${mvTable}
      ENGINE = AggregatingMergeTree()
      PARTITION BY (tenant_id, toYYYYMM(hour))
      ORDER BY (tenant_id, hour, severity, event_type, source_type)
      AS SELECT
        tenant_id,
        toStartOfHour(occurred_at)     AS hour,
        severity,
        event_type,
        source_type,
        countState()                   AS cnt,
        sumState(risk_score)           AS total_risk_score_state,
        uniqExactState(event_id)       AS unique_events_state
      FROM ${this.config.database}.${this.config.table}
      GROUP BY tenant_id, hour, severity, event_type, source_type
    `;

    try {
      await this.query(createMVSQL);
      console.log(`[ClickHouseIndexer] MV ${mvTable} ready`);
    } catch (err: any) {
      console.warn(`[ClickHouseIndexer] MV create warning (may already exist): ${err.message.slice(0, 120)}`);
    }
  }

  /**
   * Index a batch of events using JSONEachRow format (most efficient for large batches).
   * Falls back to VALUES syntax for compatibility.
   */
  async indexBatch(events: EventRecord[]): Promise<IndexResult> {
    if (!this.connected || events.length === 0) return { indexed: 0, errors: 0 };
    if (this.isCircuitOpen()) {
      console.warn(`[ClickHouseIndexer] Circuit open — skipping batch of ${events.length}`);
      return { indexed: 0, errors: events.length };
    }

    const cols = [
      "tenant_id", "event_type", "severity", "threat", "target", "attacker", "asset",
      "description", "mitre_tactic", "mitre_technique", "action", "log_source",
      "country", "risk_score", "occurred_at",
      "source_type", "host", "src_ip", "dst_ip", "user_name", "process_name",
      "kill_chain_phase", "confidence_score", "data_region", "raw_event",
      "normalized_event", "iocs", "ingested_at",
    ];

    const body = events.map(e => JSON.stringify(this.toClickHouseRow(e))).join("\n");
    const insertSql = `INSERT INTO ${this.config.database}.${this.config.table} (${cols.join(",")}) FORMAT JSONEachRow`;

    try {
      await this.queryWithBody(insertSql, body);
      this.totalIndexed += events.length;
      this.recordSuccess();
      return { indexed: events.length, errors: 0 };
    } catch (err: any) {
      this.totalErrors += events.length;
      this.recordFailure();
      console.error(`[ClickHouseIndexer] Batch insert failed: ${err.message.slice(0, 200)}`);
      return { indexed: 0, errors: events.length };
    }
  }

  /** Map EventRecord to a flat row object for JSONEachRow format */
  private toClickHouseRow(e: EventRecord): Record<string, unknown> {
    const now = new Date().toISOString();
    const occurred = e.occurredAt ?? now;
    const safeIp = (v?: string | null) => {
      if (!v) return "0.0.0.0";
      return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? v : "0.0.0.0";
    };
    return {
      tenant_id:        e.tenantId ?? 0,
      event_type:       e.eventType ?? "endpoint",
      severity:         e.severity ?? "medium",
      threat:           e.threat ?? "",
      target:           e.target ?? "",
      attacker:         e.attacker ?? "",
      asset:            e.asset ?? "",
      description:      e.description ?? "",
      mitre_tactic:     e.mitreTactic ?? "",
      mitre_technique:  e.mitreTechnique ?? "",
      action:           e.action ?? "",
      log_source:       e.logSource ?? "",
      country:          e.country ?? "",
      risk_score:       e.riskScore ?? 0,
      occurred_at:      occurred,
      source_type:      e.sourceType ?? e.logSource ?? "",
      host:             (e as any).host ?? e.asset ?? "",
      src_ip:           safeIp((e as any).srcIp ?? e.attacker),
      dst_ip:           safeIp((e as any).dstIp ?? e.target),
      user_name:        (e as any).userName ?? "",
      process_name:     (e as any).processName ?? "",
      kill_chain_phase: (e as any).killChainPhase ?? "",
      confidence_score: (e as any).confidenceScore ?? e.riskScore ?? 0,
      data_region:      (e as any).dataRegion ?? "",
      raw_event:        e.rawPayload ? JSON.stringify(e.rawPayload) : "",
      normalized_event: (e as any).normalizedEvent ? JSON.stringify((e as any).normalizedEvent) : "",
      iocs:             e.sigmaMatches ? JSON.stringify(e.sigmaMatches) : "[]",
      ingested_at:      now,
    };
  }

  async search(params: EventSearchParams): Promise<EventSearchResult> {
    const conditions: string[] = [];

    if (params.tenantIds.length === 1) {
      conditions.push(`tenant_id = ${params.tenantIds[0]}`);
    } else {
      conditions.push(`tenant_id IN (${params.tenantIds.join(",")})`);
    }

    if (params.eventType) conditions.push(`event_type = '${this.escapeString(params.eventType)}'`);
    if (params.severity) {
      const sevs = Array.isArray(params.severity) ? params.severity : [params.severity];
      conditions.push(`severity IN ('${sevs.map(s => this.escapeString(s)).join("','")}')`);
    }
    if (params.threat) conditions.push(`threat ilike '%${this.escapeString(params.threat)}%'`);
    if (params.target) conditions.push(`target ilike '%${this.escapeString(params.target)}%'`);
    if (params.attacker) conditions.push(`attacker = '${this.escapeString(params.attacker)}'`);
    if (params.description) conditions.push(`description ilike '%${this.escapeString(params.description)}%'`);
    if (params.dateFrom) conditions.push(`occurred_at >= '${params.dateFrom.toISOString()}'`);
    if (params.dateTo) conditions.push(`occurred_at <= '${params.dateTo.toISOString()}'`);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = `ORDER BY occurred_at ${params.sortOrder === "asc" ? "ASC" : "DESC"}`;
    const pageSize = params.pageSize ?? 50;
    const offset = ((params.page ?? 1) - 1) * pageSize;

    const [countResult, dataResult] = await Promise.all([
      this.query(`SELECT COUNT() AS total FROM ${this.config.database}.${this.config.table} ${where}`),
      this.query(`SELECT * FROM ${this.config.database}.${this.config.table} ${where} ${order} LIMIT ${pageSize} OFFSET ${offset}`),
    ]);

    const totalCount = parseInt(countResult?.data?.[0]?.total ?? "0", 10);
    return {
      events: dataResult?.data ?? [],
      totalCount,
      page: params.page ?? 1,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  async getEventVolumeTimeline(
    tenantIds: number[],
    granularity: "hour" | "day" = "hour",
    hoursBack = 24,
  ): Promise<Array<{ bucket: string; count: number }>> {
    const tf = tenantIds.length === 1
      ? `tenant_id = ${tenantIds[0]}`
      : `tenant_id IN (${tenantIds.join(",")})`;
    const fn = granularity === "hour" ? "toStartOfHour" : "toStartOfDay";
    const sql = `
      SELECT ${fn}(occurred_at) AS bucket, countMerge(cnt) AS count
      FROM ${this.config.database}.${this.config.table}_hourly_stats
      WHERE ${tf} AND hour >= now() - INTERVAL ${hoursBack} HOUR
      GROUP BY bucket ORDER BY bucket ASC
    `;
    const result = await this.query(sql);
    return (result?.data ?? []).map((r: any) => ({ bucket: r.bucket, count: parseInt(r.count, 10) }));
  }

  async getSeverityDistribution(tenantIds: number[]): Promise<Array<{ severity: string; count: number }>> {
    const tf = tenantIds.length === 1
      ? `tenant_id = ${tenantIds[0]}`
      : `tenant_id IN (${tenantIds.join(",")})`;
    const sql = `
      SELECT severity, countMerge(cnt) AS count
      FROM ${this.config.database}.${this.config.table}_hourly_stats
      WHERE ${tf} AND hour >= now() - INTERVAL 24 HOUR
      GROUP BY severity ORDER BY count DESC
    `;
    const result = await this.query(sql);
    return (result?.data ?? []).map((r: any) => ({ severity: r.severity, count: parseInt(r.count, 10) }));
  }

  private async query(sql: string): Promise<any> {
    return this.queryWithBody(sql + " FORMAT JSON", "");
  }

  private async queryWithBody(sql: string, body: string): Promise<any> {
    const auth = (this.config.username && this.config.password)
      ? Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")
      : null;

    const url = new URL(`${this.config.url}/`);
    url.searchParams.set("database", this.config.database);
    url.searchParams.set("query", sql);
    url.searchParams.set("output_format_json_quote_64bit_integers", "0");

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Accept": "application/json",
        ...(auth ? { Authorization: `Basic ${auth}` } : {}),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClickHouse HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return response.json();
    return null;
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  getStats(): ClickHouseStats {
    return {
      connected: this.connected,
      totalIndexed: this.totalIndexed,
      totalErrors: this.totalErrors,
      table: `${this.config.database}.${this.config.table}`,
      circuitOpen: this.isCircuitOpen(),
      lastErrorMs: this.lastErrorMs,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export default ClickHouseIndexer;
