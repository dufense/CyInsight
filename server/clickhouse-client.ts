/**
 * ClickHouse HTTP API client for Cyber Command Center
 *
 * Wraps the ClickHouse HTTP interface (port 8123) to provide fast OLAP
 * analytics over security events stored in the ClickHouse data-plane cluster.
 *
 * Activation:  Set CLICKHOUSE_URL env var (e.g. http://ccc-ch-alb.internal:8123).
 *              If unset the client is disabled and all methods return gracefully.
 *
 * Security:
 *   - Credentials are sent via X-ClickHouse-User / X-ClickHouse-Key HTTP headers
 *     (not URL query parameters) to prevent leakage through proxy access logs.
 *   - CLICKHOUSE_PASSWORD is required when CLICKHOUSE_URL is set; the client
 *     will not start with an empty password in production (enforced at runtime).
 *
 * Architecture:
 *   Management plane  → Aurora PostgreSQL  (OLTP: tenants, configs, metadata)
 *   Data plane hot    → ClickHouse cluster  (OLAP: fast SQL over security events)
 *   Data plane cold   → S3 / Iceberg        (long-term, Athena queries)
 *
 * Data flow:
 *   MSK (Kafka) → data-plane ECS tasks → ClickHouse HTTP API (INSERT)
 *   Dashboard / events console → ClickHouse HTTP API (SELECT) with fallback to PG
 */

import * as http from "http";
import * as https from "https";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClickHouseConfig {
  url: string;            // e.g. http://10.0.0.1:8123
  user?: string;          // default: "default"
  password: string;       // required; loaded from CLICKHOUSE_PASSWORD env var
  database?: string;      // default: "ccc"
  timeoutMs?: number;     // query timeout (default 30 000 ms)
}

export interface EventQueryFilters {
  startDate?: Date;
  endDate?: Date;
  severity?: string[];
  sourceType?: string[];
  limit?: number;
  offset?: number;
  search?: string;
  eventType?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
}

export interface EventCountBucket {
  hour: string;
  count: number;
  severity: string;
  sourceType: string;
}

export interface EventStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avgConfidence: number;
}

export interface HealthResult {
  status: "connected" | "disconnected";
  latencyMs: number;
  version?: string;
  error?: string;
}

export interface IngestEventPayload {
  event_id?: string;
  tenant_id: number;
  source_type: string;
  severity: string;
  event_type: string;
  host?: string;
  src_ip?: string;
  dst_ip?: string;
  user_name?: string;
  process_name?: string;
  mitre_tactic?: string;
  mitre_technique?: string;
  kill_chain_phase?: string;
  confidence_score?: number;
  data_region?: string;
  raw_event?: string;
  normalized_event?: string;
  iocs?: string;
  ingested_at?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Build auth headers for every ClickHouse request (no credentials in URL). */
function buildAuthHeaders(user: string, password: string): Record<string, string> {
  return {
    "X-ClickHouse-User": user,
    "X-ClickHouse-Key": password,
    "Content-Type": "text/plain; charset=utf-8",
  };
}

function sanitizeIdentifier(value: string): string {
  // Only allow alphanumeric, underscores, hyphens, dots — no SQL metacharacters
  return value.replace(/[^a-zA-Z0-9_\-. ]/g, "");
}

function quotedStringList(values: string[]): string {
  return values.map((v) => `'${sanitizeIdentifier(v)}'`).join(",");
}

// ── Client ───────────────────────────────────────────────────────────────────

export class ClickHouseClient {
  private readonly url: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;
  private readonly timeoutMs: number;

  constructor(cfg: ClickHouseConfig) {
    this.url      = cfg.url;
    this.user     = cfg.user ?? "default";
    this.password = cfg.password;
    this.database = cfg.database ?? "ccc";
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  /**
   * Execute a read-only SQL query via HTTP GET.
   * Credentials are sent as headers, not URL params.
   * Returns raw response body (JSONEachRow format).
   */
  async query(sql: string): Promise<string> {
    const parsed = new URL(this.url);
    const qs = new URLSearchParams({
      query: sql,
      database: this.database,
      default_format: "JSONEachRow",
    });
    const requestUrl = `${parsed.origin}/?${qs.toString()}`;
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = buildAuthHeaders(this.user, this.password);

    return new Promise<string>((resolve, reject) => {
      const req = transport.get(requestUrl, { headers, timeout: this.timeoutMs }, (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`ClickHouse ${res.statusCode}: ${body.slice(0, 256)}`));
          } else {
            resolve(body);
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`ClickHouse query timed out after ${this.timeoutMs}ms`));
      });
    });
  }

  /**
   * Execute a query and parse each newline-delimited JSON row.
   */
  async queryRows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const raw = await this.query(sql);
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  /**
   * Insert a single event via HTTP POST (JSONEachRow).
   * Credentials sent via headers; no URL exposure.
   */
  async ingestEvent(event: IngestEventPayload): Promise<void> {
    const parsed = new URL(this.url);
    const insertSql =
      `INSERT INTO ${this.database}.security_events_distributed ` +
      `(event_id, tenant_id, source_type, severity, event_type, host, ` +
      `src_ip, dst_ip, user_name, process_name, mitre_tactic, mitre_technique, ` +
      `kill_chain_phase, confidence_score, data_region, raw_event, ` +
      `normalized_event, iocs, ingested_at) FORMAT JSONEachRow`;

    const qs = new URLSearchParams({
      query: insertSql,
      database: this.database,
    });
    const requestUrl = `${parsed.origin}/?${qs.toString()}`;
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = { ...buildAuthHeaders(this.user, this.password) };

    const row = {
      event_id:         event.event_id ?? crypto.randomUUID(),
      tenant_id:        event.tenant_id,
      source_type:      event.source_type,
      severity:         event.severity,
      event_type:       event.event_type,
      host:             event.host ?? "",
      src_ip:           event.src_ip ?? "0.0.0.0",
      dst_ip:           event.dst_ip ?? "0.0.0.0",
      user_name:        event.user_name ?? "",
      process_name:     event.process_name ?? "",
      mitre_tactic:     event.mitre_tactic ?? "",
      mitre_technique:  event.mitre_technique ?? "",
      kill_chain_phase: event.kill_chain_phase ?? "",
      confidence_score: event.confidence_score ?? 0,
      data_region:      event.data_region ?? "",
      raw_event:        event.raw_event ?? "",
      normalized_event: event.normalized_event ?? "",
      iocs:             event.iocs ?? "[]",
      ingested_at:      event.ingested_at ?? new Date().toISOString(),
    };
    const body = JSON.stringify(row);

    return new Promise<void>((resolve, reject) => {
      const reqOptions = new URL(requestUrl);
      const req = transport.request(
        {
          hostname: reqOptions.hostname,
          port:     reqOptions.port,
          path:     `${reqOptions.pathname}${reqOptions.search}`,
          method:   "POST",
          headers:  { ...headers, "Content-Length": Buffer.byteLength(body) },
          timeout:  this.timeoutMs,
        },
        (res) => {
          let respBody = "";
          res.on("data", (c: Buffer) => { respBody += c.toString(); });
          res.on("end", () => {
            if (res.statusCode !== undefined && res.statusCode >= 400) {
              reject(new Error(`ClickHouse INSERT ${res.statusCode}: ${respBody.slice(0, 256)}`));
            } else {
              resolve();
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("ClickHouse insert timed out")); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Health check: runs SELECT 1 and measures round-trip latency.
   * Uses header-based authentication.
   */
  async healthCheck(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const rows = await this.queryRows<{ result: number; version: string }>(
        "SELECT 1 AS result, version() AS version",
      );
      const latencyMs = Date.now() - start;
      const version = rows[0]?.version ?? "unknown";
      return { status: "connected", latencyMs, version };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "disconnected", latencyMs: Date.now() - start, error: message };
    }
  }

  /**
   * Aggregate event counts in hourly buckets for a tenant.
   * Reads from the materialised aggregating view for sub-second response.
   */
  async queryEventBuckets(
    tenantId: number,
    filters: EventQueryFilters = {},
  ): Promise<EventCountBucket[]> {
    const { startDate, endDate, severity, sourceType, limit = 168 } = filters;
    const conditions: string[] = [`tenant_id = ${tenantId}`];
    if (startDate) conditions.push(`hour >= '${startDate.toISOString()}'`);
    if (endDate)   conditions.push(`hour <  '${endDate.toISOString()}'`);
    if (severity?.length)   conditions.push(`severity IN (${quotedStringList(severity)})`);
    if (sourceType?.length) conditions.push(`source_type IN (${quotedStringList(sourceType)})`);
    const where = conditions.join(" AND ");

    const sql = `
      SELECT
        formatDateTime(hour, '%Y-%m-%dT%H:%M:%SZ')  AS hour,
        toUInt64(countMerge(cnt))                    AS count,
        severity,
        source_type                                  AS sourceType
      FROM ${this.database}.mv_hourly_event_counts
      WHERE ${where}
      GROUP BY hour, severity, source_type
      ORDER BY hour DESC
      LIMIT ${limit}
    `;
    return this.queryRows<EventCountBucket>(sql);
  }

  /**
   * Aggregate event statistics (totals + severity breakdown + avg confidence).
   * Used by dashboard KPI strip and CISO overview.
   */
  async queryEventStats(
    tenantId: number,
    filters: EventQueryFilters = {},
  ): Promise<EventStats> {
    const { startDate, endDate } = filters;
    const conditions: string[] = [`tenant_id = ${tenantId}`];
    if (startDate) conditions.push(`ingested_at >= '${startDate.toISOString()}'`);
    if (endDate)   conditions.push(`ingested_at <  '${endDate.toISOString()}'`);
    const where = conditions.join(" AND ");

    const sql = `
      SELECT
        toUInt64(count())                          AS total,
        toUInt64(countIf(severity = 'critical'))   AS critical,
        toUInt64(countIf(severity = 'high'))       AS high,
        toUInt64(countIf(severity = 'medium'))     AS medium,
        toUInt64(countIf(severity = 'low'))        AS low,
        round(avg(confidence_score), 1)            AS avgConfidence
      FROM ${this.database}.security_events_distributed
      WHERE ${where}
    `;
    const rows = await this.queryRows<EventStats>(sql);
    return rows[0] ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0, avgConfidence: 0 };
  }

  /**
   * Query recent events for the events console with full filter parity to the
   * PostgreSQL path. Returns lightweight summary rows (raw_event omitted).
   *
   * Accepts tenantIds (array) to preserve MSSP multi-tenant aggregation — when an
   * MSS admin views events for a parent tenant, accessibleTenantIds includes the
   * parent and all child tenants. The CH query mirrors this with an IN() predicate.
   *
   * Returns { rows, total } where total = COUNT(*) over the same predicate WITHOUT
   * LIMIT (true dataset size) so callers can compute correct pagination.
   */
  async queryEvents(
    tenantIds: number | number[],
    filters: EventQueryFilters = {},
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const {
      startDate, endDate, severity, sourceType,
      limit = 100, offset = 0,
      search, eventType, mitreTactic, mitreTechnique,
    } = filters;
    const conditions: string[] = [`tenant_id IN (${ids.join(",")})`];
    if (startDate)          conditions.push(`ingested_at >= '${startDate.toISOString()}'`);
    if (endDate)            conditions.push(`ingested_at <  '${endDate.toISOString()}'`);
    if (severity?.length)   conditions.push(`severity IN (${quotedStringList(severity)})`);
    if (sourceType?.length) conditions.push(`source_type IN (${quotedStringList(sourceType)})`);
    if (eventType)          conditions.push(`event_type = ${quotedStringList([eventType])}`);
    if (mitreTactic)        conditions.push(`mitre_tactic = ${quotedStringList([mitreTactic])}`);
    if (mitreTechnique)     conditions.push(`mitre_technique = ${quotedStringList([mitreTechnique])}`);
    if (search) {
      const s = search.replace(/'/g, "\\'");
      conditions.push(
        `(positionCaseInsensitive(host, '${s}') > 0 ` +
        `OR positionCaseInsensitive(user_name, '${s}') > 0 ` +
        `OR positionCaseInsensitive(toString(src_ip), '${s}') > 0 ` +
        `OR positionCaseInsensitive(event_type, '${s}') > 0)`,
      );
    }
    const where = conditions.join(" AND ");

    const [countRows, rows] = await Promise.all([
      this.queryRows<{ total: string }>(
        `SELECT count() AS total FROM ${this.database}.security_events_distributed WHERE ${where}`,
      ),
      this.queryRows(
        `SELECT
          toString(event_id)                                    AS event_id,
          tenant_id,
          source_type,
          severity,
          event_type,
          host,
          toString(src_ip)                                      AS src_ip,
          toString(dst_ip)                                      AS dst_ip,
          user_name,
          mitre_tactic,
          mitre_technique,
          kill_chain_phase,
          confidence_score,
          data_region,
          formatDateTime(ingested_at, '%Y-%m-%dT%H:%M:%SZ')    AS ingested_at
        FROM ${this.database}.security_events_distributed
        WHERE ${where}
        ORDER BY ingested_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      ),
    ]);

    return { rows, total: parseInt(countRows[0]?.total ?? "0", 10) };
  }

  /**
   * Cross-source event correlation over a tenant's recent events.
   * Returns the top-N IOCs that appear across 2+ distinct event source types.
   * Used by the events console cross-source correlation panel.
   */
  async queryCrossSourceCorrelations(
    tenantId: number,
    lookbackHours = 24,
    topN = 20,
  ): Promise<Record<string, unknown>[]> {
    const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
    const sql = `
      SELECT
        arrayJoin(JSONExtractArrayRaw(iocs)) AS ioc_raw,
        JSONExtractString(ioc_raw, 'value')  AS ioc_value,
        JSONExtractString(ioc_raw, 'type')   AS ioc_type,
        count()                              AS event_count,
        uniq(source_type)                    AS source_type_count,
        groupArray(DISTINCT source_type)     AS source_types,
        max(confidence_score)                AS max_confidence,
        max(ingested_at)                     AS last_seen
      FROM ${this.database}.security_events_distributed
      WHERE tenant_id = ${tenantId}
        AND ingested_at >= '${since}'
        AND iocs != '[]'
        AND iocs != ''
      GROUP BY ioc_value, ioc_type
      HAVING source_type_count >= 2
      ORDER BY source_type_count DESC, event_count DESC
      LIMIT ${topN}
    `;
    return this.queryRows(sql);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: ClickHouseClient | null = null;

/**
 * Returns the module-level ClickHouseClient singleton, or null when
 * CLICKHOUSE_URL is not configured.
 *
 * Fails closed: if CLICKHOUSE_URL is set but CLICKHOUSE_PASSWORD is absent,
 * the client is not created and a warning is logged.  This prevents the
 * app from silently operating with an empty password.
 */
export function getClickHouseClient(): ClickHouseClient | null {
  if (_client) return _client;

  const url = process.env.CLICKHOUSE_URL;
  if (!url) return null;

  const password = process.env.CLICKHOUSE_PASSWORD;
  if (!password) {
    console.warn(
      "[ClickHouse] CLICKHOUSE_URL is set but CLICKHOUSE_PASSWORD is missing — " +
      "ClickHouse integration disabled. Set CLICKHOUSE_PASSWORD to enable.",
    );
    return null;
  }

  _client = new ClickHouseClient({
    url,
    user:      process.env.CLICKHOUSE_USER     ?? "default",
    password,
    database:  process.env.CLICKHOUSE_DATABASE ?? "ccc",
    timeoutMs: 30_000,
  });

  return _client;
}

/** Returns true if CLICKHOUSE_URL is set (cluster configured). */
export function isClickHouseEnabled(): boolean {
  return Boolean(process.env.CLICKHOUSE_URL && process.env.CLICKHOUSE_PASSWORD);
}
