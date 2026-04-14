/**
 * ClickHouse Indexer for Security Events
 *
 * ClickHouse is the single source of truth for security events in the starter
 * stack.  This module ensures the canonical `security_events` table (plus the
 * `security_events_hourly_stats` aggregating materialized view) exist and
 * handles batched INSERTs from the storage microservice.
 *
 * Column mapping notes (storage → ClickHouse):
 *   - asset           → host (new enriched column) + asset (legacy)
 *   - attacker        → src_ip (new enriched column) + attacker (legacy IPv4)
 *   - sourceType / logSource → source_type (new enriched column) + log_source (legacy)
 *   - occurredAt      → occurred_at (legacy) + ingested_at (new enriched)
 *   - rawPayload      → raw_event (JSON string)
 *   - sigmaMatches    → iocs (JSON string)
 *   - riskScore       → risk_score (legacy) + confidence_score (new enriched)
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

export class ClickHouseIndexer {
  private config: ClickHouseConfig;
  private totalIndexed = 0;
  private totalErrors = 0;
  private connected = false;

  constructor(config: ClickHouseConfig) {
    this.config = config;
  }

  /**
   * Connect to ClickHouse and ensure table exists
   */
  async connect(): Promise<boolean> {
    if (!this.config.url) {
      console.log("[ClickHouseIndexer] No URL configured, indexing disabled");
      return false;
    }

    try {
      const response = await fetch(`${this.config.url}/ping`, {
        method: "GET",
      });
      if (response.ok) {
        this.connected = true;
        console.log("[ClickHouseIndexer] Connected to ClickHouse");
        await this.ensureTable();
        return true;
      }
    } catch (err: any) {
      console.log(`[ClickHouseIndexer] Connection failed: ${err.message}`);
    }
    return false;
  }

  /**
   * Ensure the security_events table exists with the enriched schema.
   * Self-healing: re-runs CREATE IF NOT EXISTS on every connect.
   */
  private async ensureTable(): Promise<void> {
    // Create database if not exists
    await this.query(`CREATE DATABASE IF NOT EXISTS ${this.config.database}`);

    // Canonical enriched schema — keeps legacy columns for backward
    // compatibility and adds the richer fields required by the dashboard.
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.config.database}.${this.config.table} (
        event_id UUID DEFAULT generateUUIDv4(),
        tenant_id Int32,
        event_date Date MATERIALIZED toDate(occurred_at),
        -- legacy columns (still populated by the storage service)
        event_type LowCardinality(String),
        severity LowCardinality(String),
        threat String CODEC(ZSTD(3)),
        target String CODEC(ZSTD(3)),
        attacker IPv4,
        asset String CODEC(ZSTD(3)),
        description String CODEC(ZSTD(3)),
        mitre_tactic LowCardinality(String),
        mitre_technique LowCardinality(String),
        action LowCardinality(String),
        log_source LowCardinality(String),
        country LowCardinality(String),
        risk_score UInt8,
        occurred_at DateTime64(3),
        stored_at DateTime64(3) DEFAULT now64(3),
        -- enriched columns required by the management server / dashboard
        source_type LowCardinality(String),
        host String CODEC(ZSTD(3)),
        src_ip String CODEC(ZSTD(3)),
        dst_ip String CODEC(ZSTD(3)),
        user_name String CODEC(ZSTD(3)),
        process_name String CODEC(ZSTD(3)),
        kill_chain_phase LowCardinality(String),
        confidence_score UInt8 DEFAULT 0,
        data_region LowCardinality(String),
        raw_event String CODEC(ZSTD(3)),
        normalized_event String CODEC(ZSTD(3)),
        iocs String CODEC(ZSTD(3)),
        ingested_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      PARTITION BY (tenant_id, toYYYYMM(event_date))
      ORDER BY (tenant_id, event_date, severity, event_type, occurred_at)
    `;

    await this.query(createTableSQL);
    console.log(`[ClickHouseIndexer] Table ${this.config.table} ready`);

    await this.createMaterializedViews();
  }

  /**
   * Create materialized views for common aggregations.
   * The hourly-stats MV uses AggregatingMergeTree so that the management
   * server can query it with countMerge() for sub-second KPI responses.
   */
  private async createMaterializedViews(): Promise<void> {
    const mvTable = `${this.config.table}_hourly_stats`;

    // NOTE: We intentionally do NOT drop the MV here; dropping would erase
    // historical aggregated data on every storage service restart.
    // Schema migrations should be handled by explicit migration scripts.

    const createMVSQL = `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.${mvTable}
      ENGINE = AggregatingMergeTree()
      PARTITION BY (tenant_id, toYYYYMM(hour))
      ORDER BY (tenant_id, hour, severity, event_type, source_type)
      AS SELECT
        tenant_id,
        toStartOfHour(occurred_at) AS hour,
        severity,
        event_type,
        source_type,
        countState() AS cnt,
        sumState(risk_score) AS total_risk_score_state,
        uniqExactState(event_id) AS unique_events_state
      FROM ${this.config.database}.${this.config.table}
      GROUP BY tenant_id, hour, severity, event_type, source_type
    `;

    try {
      await this.query(createMVSQL);
      console.log(`[ClickHouseIndexer] Materialized view ${mvTable} ready`);
    } catch (err: any) {
      console.warn(`[ClickHouseIndexer] Failed to create MV: ${err.message}`);
    }
  }

  /**
   * Index a batch of events to ClickHouse
   */
  async indexBatch(events: EventRecord[]): Promise<IndexResult> {
    if (!this.connected || events.length === 0) {
      return { indexed: 0, errors: 0 };
    }

    const values = events.map((e) => this.formatEventForInsert(e)).join(",");

    const sql = `
      INSERT INTO ${this.config.database}.${this.config.table}
      (tenant_id, event_type, severity, threat, target, attacker, asset,
       description, mitre_tactic, mitre_technique, action, log_source,
       country, risk_score, occurred_at,
       source_type, host, src_ip, dst_ip, user_name, process_name,
       kill_chain_phase, confidence_score, data_region, raw_event,
       normalized_event, iocs, ingested_at)
      VALUES ${values}
    `;

    try {
      await this.query(sql);
      this.totalIndexed += events.length;
      return { indexed: events.length, errors: 0 };
    } catch (err: any) {
      this.totalErrors += events.length;
      console.error(`[ClickHouseIndexer] Insert failed: ${err.message}`);
      return { indexed: 0, errors: events.length };
    }
  }

  /**
   * Format a single event for ClickHouse INSERT.
   * Maps EventRecord fields to the enriched canonical schema.
   */
  private formatEventForInsert(e: EventRecord): string {
    const escape = (str: string | undefined | null): string => {
      if (!str) return "NULL";
      return `'${str.replace(/'/g, "''")}'`;
    };

    const json = (obj: any): string => {
      if (obj == null) return "NULL";
      return escape(JSON.stringify(obj));
    };

    const occurredAtIso = e.occurredAt
      ? escape(new Date(e.occurredAt).toISOString())
      : "now64(3)";

    return `(
      ${e.tenantId || 0},
      ${escape(e.eventType || "endpoint")},
      ${escape(e.severity || "medium")},
      ${escape(e.threat)},
      ${escape(e.target)},
      ${e.attacker ? `toIPv4('${this.escapeString(e.attacker)}')` : "NULL"},
      ${escape(e.asset)},
      ${escape(e.description)},
      ${escape(e.mitreTactic)},
      ${escape(e.mitreTechnique)},
      ${escape(e.action)},
      ${escape(e.logSource)},
      ${escape(e.country)},
      ${e.riskScore || 0},
      ${occurredAtIso},
      ${escape(e.sourceType || e.logSource)},
      ${escape(e.host || e.asset)},
      ${escape(e.srcIp || e.attacker)},
      ${escape(e.dstIp)},
      ${escape(e.userName)},
      ${escape(e.processName)},
      ${escape(e.killChainPhase)},
      ${e.confidenceScore || e.riskScore || 0},
      ${escape(e.dataRegion)},
      ${json(e.rawPayload)},
      ${json(e.normalizedEvent)},
      ${json(e.sigmaMatches ?? [])},
      ${occurredAtIso}
    )`;
  }

  /**
   * Search events in ClickHouse
   */
  async search(params: EventSearchParams): Promise<EventSearchResult> {
    const conditions: string[] = [];

    // Tenant filter (required)
    if (params.tenantIds.length === 1) {
      conditions.push(`tenant_id = ${params.tenantIds[0]}`);
    } else {
      conditions.push(`tenant_id IN (${params.tenantIds.join(",")})`);
    }

    // Optional filters
    if (params.eventType) {
      conditions.push(`event_type = '${this.escapeString(params.eventType)}'`);
    }
    if (params.severity) {
      const severities = Array.isArray(params.severity)
        ? params.severity
        : [params.severity];
      conditions.push(
        `severity IN ('${severities.map((s) => this.escapeString(s)).join("','")}')`,
      );
    }
    if (params.threat) {
      conditions.push(`threat ILIKE '%${this.escapeString(params.threat)}%'`);
    }
    if (params.target) {
      conditions.push(`target ILIKE '%${this.escapeString(params.target)}%'`);
    }
    if (params.attacker) {
      conditions.push(
        `attacker = toIPv4('${this.escapeString(params.attacker)}')`,
      );
    }
    if (params.description) {
      conditions.push(
        `description ILIKE '%${this.escapeString(params.description)}%'`,
      );
    }
    if (params.dateFrom) {
      conditions.push(
        `occurred_at >= parseDateTime64BestEffort('${params.dateFrom.toISOString()}')`,
      );
    }
    if (params.dateTo) {
      conditions.push(
        `occurred_at <= parseDateTime64BestEffort('${params.dateTo.toISOString()}')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = `ORDER BY occurred_at ${params.sortOrder === "asc" ? "ASC" : "DESC"}`;
    const offset = ((params.page || 1) - 1) * (params.pageSize || 50);
    const limit = `LIMIT ${params.pageSize || 50} OFFSET ${offset}`;

    // Get total count
    const countQuery = `SELECT COUNT() as total FROM ${this.config.database}.${this.config.table} ${whereClause}`;
    const countResult = await this.query(countQuery);
    const totalCount = parseInt(countResult.data?.[0]?.total || "0");

    // Get data
    const dataQuery = `SELECT * FROM ${this.config.database}.${this.config.table} ${whereClause} ${orderBy} ${limit}`;
    const dataResult = await this.query(dataQuery);

    return {
      events: dataResult.data || [],
      totalCount,
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      totalPages: Math.ceil(totalCount / (params.pageSize || 50)),
    };
  }

  /**
   * Get event volume timeline (for charts)
   */
  async getEventVolumeTimeline(
    tenantIds: number[],
    granularity: "hour" | "day" = "hour",
    hoursBack: number = 24,
  ): Promise<Array<{ bucket: string; count: number }>> {
    const tenantFilter =
      tenantIds.length === 1
        ? `tenant_id = ${tenantIds[0]}`
        : `tenant_id IN (${tenantIds.join(",")})`;

    const bucketFn = granularity === "hour" ? "toStartOfHour" : "toStartOfDay";

    const sql = `
      SELECT
        ${bucketFn}(occurred_at) as bucket,
        count() as count
      FROM ${this.config.database}.${this.config.table}
      WHERE ${tenantFilter}
        AND occurred_at >= now() - INTERVAL ${hoursBack} HOUR
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const result = await this.query(sql);
    return (
      result.data?.map((row: any) => ({
        bucket: row.bucket,
        count: parseInt(row.count),
      })) || []
    );
  }

  /**
   * Get severity distribution (for pie charts)
   */
  async getSeverityDistribution(
    tenantIds: number[],
  ): Promise<Array<{ severity: string; count: number }>> {
    const tenantFilter =
      tenantIds.length === 1
        ? `tenant_id = ${tenantIds[0]}`
        : `tenant_id IN (${tenantIds.join(",")})`;

    const sql = `
      SELECT
        severity,
        count() as count
      FROM ${this.config.database}.${this.config.table}
      WHERE ${tenantFilter}
        AND occurred_at >= now() - INTERVAL 24 HOUR
      GROUP BY severity
      ORDER BY count DESC
    `;

    const result = await this.query(sql);
    return (
      result.data?.map((row: any) => ({
        severity: row.severity,
        count: parseInt(row.count),
      })) || []
    );
  }

  /**
   * Execute a ClickHouse query
   */
  private async query(sql: string): Promise<any> {
    const auth =
      this.config.username && this.config.password
        ? Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")
        : null;

    const url = new URL(`${this.config.url}/`);
    url.searchParams.set("database", this.config.database);
    url.searchParams.set("output_format_json_quote_64bit_integers", "0");

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Accept: "application/json",
        ...(auth ? { Authorization: `Basic ${auth}` } : {}),
      },
      body: sql,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ClickHouse query failed (${response.status}): ${errorText}`);
    }

    // ClickHouse returns JSON format
    return await response.json();
  }

  /**
   * Escape special characters in strings for SQL
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Get indexer statistics
   */
  getStats(): ClickHouseStats {
    return {
      connected: this.connected,
      totalIndexed: this.totalIndexed,
      totalErrors: this.totalErrors,
      table: `${this.config.database}.${this.config.table}`,
    };
  }

  /**
   * Check if connected to ClickHouse
   */
  isConnected(): boolean {
    return this.connected;
  }
}

export default ClickHouseIndexer;
