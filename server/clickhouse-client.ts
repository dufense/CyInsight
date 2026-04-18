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

// ── Shared tier-routing constant ──────────────────────────────────────────────
/** Hot-tier retention in days.  Override via HOT_RETENTION_DAYS env var. */
export const HOT_RETENTION_DAYS = parseInt(process.env.HOT_RETENTION_DAYS ?? "90", 10);

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
  logSource?: string[];
  limit?: number;
  offset?: number;
  search?: string;
  eventType?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  /**
   * Pre-built ClickHouse WHERE fragment enforcing the integration-aware
   * visibility guard (built by routes.buildChIntegrationGuard). When present
   * it is AND-ed with the rest of the predicate so CH reads match the PG
   * buildIntegrationGuardSql semantics.
   */
  integrationGuardSql?: string;
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
  log_source?: string;
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
  private password: string;
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
   * Hot-swap the password used for every subsequent request without
   * recreating the client (preserves the singleton and avoids a restart).
   * Auth headers are built fresh per-request, so in-flight requests using the
   * old credentials complete on their existing TCP connection and only the
   * next request observes the new password — enabling zero-downtime rotation.
   */
  setPassword(newPassword: string): void {
    if (!newPassword) {
      throw new Error("ClickHouse password cannot be empty");
    }
    this.password = newPassword;
  }

  /** Test-only / observability helper — never log or return the value. */
  hasPassword(): boolean {
    return this.password.length > 0;
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
      `(event_id, tenant_id, source_type, log_source, severity, event_type, host, ` +
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
      log_source:       event.log_source ?? "",
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
    tenantIds: number | number[],
    filters: EventQueryFilters = {},
  ): Promise<EventCountBucket[]> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const { startDate, endDate, severity, sourceType, limit = 168, integrationGuardSql } = filters;

    // mv_hourly_event_counts does not materialise the log_source column, so
    // when the integration-aware guard is requested we query the raw events
    // table (security_events_distributed) and bucket on the fly. Without a
    // guard the MV is used for sub-second response.
    if (integrationGuardSql) {
      const conditions: string[] = [`tenant_id IN (${ids.join(",")})`, integrationGuardSql];
      if (startDate) conditions.push(`ingested_at >= '${startDate.toISOString()}'`);
      if (endDate)   conditions.push(`ingested_at <  '${endDate.toISOString()}'`);
      if (severity?.length)   conditions.push(`severity IN (${quotedStringList(severity)})`);
      if (sourceType?.length) conditions.push(`source_type IN (${quotedStringList(sourceType)})`);
      const where = conditions.join(" AND ");
      const sql = `
        SELECT
          formatDateTime(toStartOfHour(ingested_at), '%Y-%m-%dT%H:%M:%SZ') AS hour,
          toUInt64(count())                                                 AS count,
          severity,
          source_type                                                       AS sourceType
        FROM ${this.database}.security_events_distributed
        WHERE ${where}
        GROUP BY hour, severity, source_type
        ORDER BY hour DESC
        LIMIT ${limit}
      `;
      return this.queryRows<EventCountBucket>(sql);
    }

    const conditions: string[] = [`tenant_id IN (${ids.join(",")})`];
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
    tenantIds: number | number[],
    filters: EventQueryFilters = {},
  ): Promise<EventStats> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const { startDate, endDate, integrationGuardSql } = filters;
    const conditions: string[] = [`tenant_id IN (${ids.join(",")})`];
    if (startDate) conditions.push(`ingested_at >= '${startDate.toISOString()}'`);
    if (endDate)   conditions.push(`ingested_at <  '${endDate.toISOString()}'`);
    if (integrationGuardSql) conditions.push(integrationGuardSql);
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
      search, eventType, mitreTactic, mitreTechnique, integrationGuardSql,
    } = filters;
    const { logSource } = filters;
    const conditions: string[] = [`tenant_id IN (${ids.join(",")})`];
    if (startDate)          conditions.push(`ingested_at >= '${startDate.toISOString()}'`);
    if (endDate)            conditions.push(`ingested_at <  '${endDate.toISOString()}'`);
    if (severity?.length)   conditions.push(`severity IN (${quotedStringList(severity)})`);
    if (sourceType?.length) conditions.push(`source_type IN (${quotedStringList(sourceType)})`);
    if (logSource?.length)  conditions.push(`log_source IN (${quotedStringList(logSource)})`);
    if (eventType)          conditions.push(`event_type = ${quotedStringList([eventType])}`);
    if (mitreTactic)        conditions.push(`mitre_tactic = ${quotedStringList([mitreTactic])}`);
    if (mitreTechnique)     conditions.push(`mitre_technique = ${quotedStringList([mitreTechnique])}`);
    if (integrationGuardSql) conditions.push(integrationGuardSql);
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
          log_source,
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
    tenantIds: number | number[],
    lookbackHours = 24,
    topN = 20,
    integrationGuardSql?: string,
  ): Promise<Record<string, unknown>[]> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
    const guard = integrationGuardSql ? `AND ${integrationGuardSql}` : "";
    const sql = `
      SELECT
        arrayJoin(JSONExtractArrayRaw(iocs)) AS ioc_raw,
        JSONExtractString(ioc_raw, 'value')  AS ioc_value,
        JSONExtractString(ioc_raw, 'type')   AS ioc_type,
        count()                              AS event_count,
        uniq(source_type)                    AS source_type_count,
        groupArray(DISTINCT source_type)     AS source_types,
        groupArray(DISTINCT log_source)      AS log_sources,
        groupArray(DISTINCT event_type)      AS event_types,
        max(confidence_score)                AS max_confidence,
        max(ingested_at)                     AS last_seen
      FROM ${this.database}.security_events_distributed
      WHERE tenant_id IN (${ids.join(",")})
        AND ingested_at >= '${since}'
        AND iocs != '[]'
        AND iocs != ''
        ${guard}
      GROUP BY ioc_value, ioc_type
      HAVING source_type_count >= 2
      ORDER BY source_type_count DESC, event_count DESC
      LIMIT ${topN}
    `;
    return this.queryRows(sql);
  }

  /**
   * Aggregate event counts grouped by log_source (product-name identifier,
   * e.g. "Cynet 360") for a tenant. Mirrors the PG `log_source` column so
   * the /stats byLogSource breakdown matches the PG path exactly.
   */
  async queryEventsBySourceType(
    tenantIds: number | number[],
    lookbackHours = 24,
    topN = 20,
    integrationGuardSql?: string,
  ): Promise<{ logSource: string; count: number }[]> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
    const guard = integrationGuardSql ? `AND ${integrationGuardSql}` : "";
    const sql = `
      SELECT
        log_source        AS logSource,
        toUInt64(count()) AS count
      FROM ${this.database}.security_events_distributed
      WHERE tenant_id IN (${ids.join(",")})
        AND ingested_at >= '${since}'
        ${guard}
      GROUP BY log_source
      ORDER BY count DESC
      LIMIT ${topN}
    `;
    const rows = await this.queryRows<{ logSource: string; count: string }>(sql);
    return rows.map((r) => ({ logSource: r.logSource || "Unknown", count: parseInt(r.count, 10) }));
  }

  /**
   * Aggregate event counts grouped by event_type (the high-level taxonomy,
   * e.g. authentication/network/endpoint). Used by the events console /stats
   * endpoint to populate the byEventType breakdown.
   */
  async queryEventsByEventType(
    tenantIds: number | number[],
    lookbackHours = 24,
    topN = 20,
    integrationGuardSql?: string,
  ): Promise<{ eventType: string; count: number }[]> {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
    const guard = integrationGuardSql ? `AND ${integrationGuardSql}` : "";
    const sql = `
      SELECT
        event_type         AS eventType,
        toUInt64(count())  AS count
      FROM ${this.database}.security_events_distributed
      WHERE tenant_id IN (${ids.join(",")})
        AND ingested_at >= '${since}'
        ${guard}
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT ${topN}
    `;
    const rows = await this.queryRows<{ eventType: string; count: string }>(sql);
    return rows.map((r) => ({ eventType: r.eventType || "unknown", count: parseInt(r.count, 10) }));
  }

  /**
   * Insert multiple events in a single HTTP POST (JSONEachRow, newline-delimited).
   * More efficient than calling ingestEvent() in a loop for large batches.
   * Credentials sent via headers; no URL exposure.
   */
  async insertEvents(events: IngestEventPayload[]): Promise<void> {
    if (events.length === 0) return;
    const parsed = new URL(this.url);
    const insertSql =
      `INSERT INTO ${this.database}.security_events_distributed ` +
      `(event_id, tenant_id, source_type, log_source, severity, event_type, host, ` +
      `src_ip, dst_ip, user_name, process_name, mitre_tactic, mitre_technique, ` +
      `kill_chain_phase, confidence_score, data_region, raw_event, ` +
      `normalized_event, iocs, ingested_at) FORMAT JSONEachRow`;

    const qs = new URLSearchParams({ query: insertSql, database: this.database });
    const requestUrl = `${parsed.origin}/?${qs.toString()}`;
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = buildAuthHeaders(this.user, this.password);

    const body = events
      .map((event) =>
        JSON.stringify({
          event_id:         event.event_id ?? crypto.randomUUID(),
          tenant_id:        event.tenant_id,
          source_type:      event.source_type,
          log_source:       event.log_source ?? "",
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
        })
      )
      .join("\n");

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
              reject(new Error(`ClickHouse batch INSERT ${res.statusCode}: ${respBody.slice(0, 256)}`));
            } else {
              resolve();
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("ClickHouse batch insert timed out")); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Query ClickHouse replica lag from system.replicas for the
   * security_events table.  Returns the max absolute_delay (seconds) across
   * all local replicas, or null if the table has no replicas or the query
   * fails (e.g. single-node setup without ReplicatedMergeTree).
   */
  async queryReplicationLag(): Promise<number | null> {
    try {
      const sql = `
        SELECT max(absolute_delay) AS lag_seconds
        FROM system.replicas
        WHERE database = '${this.database}' AND table = 'security_events'
      `;
      const rows = await this.queryRows<{ lag_seconds: string }>(sql);
      const val = parseInt(rows[0]?.lag_seconds ?? "", 10);
      return isNaN(val) ? null : val;
    } catch {
      return null;
    }
  }

  /**
   * Query ClickHouse operational stats used by the Platform Health dashboard:
   *   - active query count (system.processes)
   *   - recent insert rate: rows inserted into security_events_distributed
   *     during the last `windowSeconds` (default 60) — exposed both as a raw
   *     row count and a per-second rate.
   *
   * Failures are non-fatal: each metric returns null when its query fails so
   * that one missing system table never breaks the whole health card.
   */
  async queryOpsStats(windowSeconds = 60): Promise<{
    activeQueries: number | null;
    recentInsertCount: number | null;
    recentInsertRatePerSec: number | null;
    windowSeconds: number;
  }> {
    const safeWindow = Math.max(1, Math.floor(windowSeconds));

    const [activeRows, insertRows] = await Promise.all([
      this.queryRows<{ active: string }>(
        `SELECT count() AS active FROM system.processes WHERE query NOT LIKE '%system.processes%'`,
      ).catch(() => null),
      this.queryRows<{ rows: string }>(
        `SELECT toUInt64(count()) AS rows
         FROM ${this.database}.security_events_distributed
         WHERE ingested_at >= now() - INTERVAL ${safeWindow} SECOND`,
      ).catch(() => null),
    ]);

    const activeQueries = activeRows
      ? parseInt(activeRows[0]?.active ?? "0", 10)
      : null;
    const recentInsertCount = insertRows
      ? parseInt(insertRows[0]?.rows ?? "0", 10)
      : null;
    const recentInsertRatePerSec =
      recentInsertCount !== null
        ? Math.round((recentInsertCount / safeWindow) * 100) / 100
        : null;

    return {
      activeQueries,
      recentInsertCount,
      recentInsertRatePerSec,
      windowSeconds: safeWindow,
    };
  }

  async queryIngestStats(tenantId?: number): Promise<{ totalRows: number; lastInsertAt: string | null }> {
    const where = tenantId !== undefined ? `WHERE tenant_id = ${tenantId}` : "";
    const sql = `
      SELECT
        toUInt64(count()) AS totalRows,
        if(count() > 0, formatDateTime(max(ingested_at), '%Y-%m-%dT%H:%M:%SZ'), '') AS lastInsertAt
      FROM ${this.database}.security_events_distributed
      ${where}
    `;
    const rows = await this.queryRows<{ totalRows: string; lastInsertAt: string }>(sql);
    return {
      totalRows: parseInt(rows[0]?.totalRows ?? "0", 10),
      lastInsertAt: rows[0]?.lastInsertAt || null,
    };
  }
}

// ── DDL initialization ────────────────────────────────────────────────────────

/**
 * Create the ClickHouse schema (database, table, materialized view) if it does
 * not yet exist.  Safe to call on every server startup — all statements are
 * idempotent (CREATE … IF NOT EXISTS).  Silently no-ops when ClickHouse is not
 * configured (CLICKHOUSE_URL unset).
 */
export async function initClickHouseSchema(): Promise<void> {
  const client = getClickHouseClient();
  if (!client) return;

  const database = process.env.CLICKHOUSE_DATABASE ?? "ccc";

  const hotDays = HOT_RETENTION_DAYS;

  // Cluster DDL is preferred for production ClickHouse clusters.
  // Single-node deployments lack the cluster config, so we fall back to
  // equivalent statements without ON CLUSTER / ReplicatedMergeTree.
  const clusterDdl = [
    `CREATE DATABASE IF NOT EXISTS ${database}`,
    `CREATE TABLE IF NOT EXISTS ${database}.security_events ON CLUSTER ccc_cluster (
      event_id         String        DEFAULT generateUUIDv4(),
      tenant_id        UInt32,
      source_type      LowCardinality(String),
      severity         LowCardinality(String),
      event_type       LowCardinality(String),
      -- log_source stores raw log-source identifiers: millions of unique values are
      -- supported because this field uses String, NOT LowCardinality (which has a
      -- hard 65 536-value cardinality limit and would panic on large deployments).
      log_source       String CODEC(ZSTD(3))   DEFAULT '',
      host             String CODEC(ZSTD(3))   DEFAULT '',
      src_ip           IPv4          DEFAULT '0.0.0.0',
      dst_ip           IPv4          DEFAULT '0.0.0.0',
      user_name        String CODEC(ZSTD(3))   DEFAULT '',
      process_name     String CODEC(ZSTD(3))   DEFAULT '',
      mitre_tactic     LowCardinality(String) DEFAULT '',
      mitre_technique  LowCardinality(String) DEFAULT '',
      kill_chain_phase LowCardinality(String) DEFAULT '',
      confidence_score Float32       DEFAULT 0,
      data_region      LowCardinality(String) DEFAULT '',
      raw_event        String CODEC(ZSTD(6))   DEFAULT '',
      normalized_event String CODEC(ZSTD(3))   DEFAULT '',
      iocs             String CODEC(ZSTD(3))   DEFAULT '[]',
      ingested_at      DateTime64(3) DEFAULT now64(),
      INDEX idx_severity     severity      TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_mitre_tactic mitre_tactic  TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_source_type  source_type   TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_host         host          TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4
    ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/security_events', '{replica}')
    PARTITION BY toYYYYMMDD(ingested_at)
    ORDER BY (tenant_id, toStartOfHour(ingested_at), severity, event_type, event_id)
    TTL ingested_at + INTERVAL ${hotDays} DAY TO VOLUME 's3_cold'
    SETTINGS index_granularity = 8192,
             min_bytes_for_wide_part = 10485760,
             min_rows_for_wide_part = 512000`,
    `CREATE TABLE IF NOT EXISTS ${database}.security_events_distributed ON CLUSTER ccc_cluster
     AS ${database}.security_events
     ENGINE = Distributed(ccc_cluster, ${database}, security_events, rand())`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.mv_hourly_event_counts ON CLUSTER ccc_cluster
     ENGINE = AggregatingMergeTree()
     PARTITION BY toYYYYMM(hour)
     ORDER BY (tenant_id, hour, severity, source_type)
     POPULATE AS
     SELECT tenant_id, toStartOfHour(ingested_at) AS hour, severity, source_type, countState() AS cnt
     FROM ${database}.security_events GROUP BY tenant_id, hour, severity, source_type`,
  ];

  // Single-node fallback — same schema without ON CLUSTER / ReplicatedMergeTree.
  const singleNodeDdl = [
    `CREATE DATABASE IF NOT EXISTS ${database}`,
    `CREATE TABLE IF NOT EXISTS ${database}.security_events (
      event_id         String        DEFAULT generateUUIDv4(),
      tenant_id        UInt32,
      source_type      LowCardinality(String),
      severity         LowCardinality(String),
      event_type       LowCardinality(String),
      log_source       String CODEC(ZSTD(3))   DEFAULT '',
      host             String CODEC(ZSTD(3))   DEFAULT '',
      src_ip           IPv4          DEFAULT '0.0.0.0',
      dst_ip           IPv4          DEFAULT '0.0.0.0',
      user_name        String CODEC(ZSTD(3))   DEFAULT '',
      process_name     String CODEC(ZSTD(3))   DEFAULT '',
      mitre_tactic     LowCardinality(String) DEFAULT '',
      mitre_technique  LowCardinality(String) DEFAULT '',
      kill_chain_phase LowCardinality(String) DEFAULT '',
      confidence_score Float32       DEFAULT 0,
      data_region      LowCardinality(String) DEFAULT '',
      raw_event        String CODEC(ZSTD(6))   DEFAULT '',
      normalized_event String CODEC(ZSTD(3))   DEFAULT '',
      iocs             String CODEC(ZSTD(3))   DEFAULT '[]',
      ingested_at      DateTime64(3) DEFAULT now64(),
      INDEX idx_severity     severity      TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_mitre_tactic mitre_tactic  TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_source_type  source_type   TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_host         host          TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMMDD(ingested_at)
    ORDER BY (tenant_id, toStartOfHour(ingested_at), severity, event_type, event_id)
    SETTINGS index_granularity = 8192,
             min_bytes_for_wide_part = 10485760,
             min_rows_for_wide_part = 512000`,
    // Alias the distributed target to the base table for single-node queries.
    `CREATE VIEW IF NOT EXISTS ${database}.security_events_distributed AS SELECT * FROM ${database}.security_events`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.mv_hourly_event_counts
     ENGINE = AggregatingMergeTree()
     PARTITION BY toYYYYMM(hour)
     ORDER BY (tenant_id, hour, severity, source_type)
     POPULATE AS
     SELECT tenant_id, toStartOfHour(ingested_at) AS hour, severity, source_type, countState() AS cnt
     FROM ${database}.security_events GROUP BY tenant_id, hour, severity, source_type`,
  ];

  const isClusterError = (msg: string) =>
    msg.includes("Cluster") || msg.includes("ON CLUSTER") || msg.includes("ccc_cluster") ||
    msg.includes("ReplicatedMergeTree") || msg.includes("No macro");

  // Try cluster DDL first; if any statement fails with a cluster-related error,
  // retry the entire sequence with the single-node DDL.
  let useSingleNode = false;
  for (const stmt of clusterDdl) {
    try {
      await client.query(stmt.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("POPULATE")) continue;
      if (isClusterError(msg)) { useSingleNode = true; break; }
      console.warn(`[ClickHouse] DDL warning (non-fatal): ${msg.slice(0, 256)}`);
    }
  }

  if (useSingleNode) {
    console.log("[ClickHouse] Cluster not available — initializing single-node schema.");
    for (const stmt of singleNodeDdl) {
      try {
        await client.query(stmt.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("POPULATE")) continue;
        console.warn(`[ClickHouse] DDL warning (non-fatal): ${msg.slice(0, 256)}`);
      }
    }
  }

  console.log("[ClickHouse] Schema initialization complete.");
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

/**
 * Hot-rotate the ClickHouse password on the running process.
 *
 * Validates the new password by executing a `SELECT 1` against the live
 * ClickHouse server before swapping it onto the singleton. On success the
 * previous password is replaced and `process.env.CLICKHOUSE_PASSWORD` is
 * updated so any new-singleton bootstrap (e.g. lazy initialisation in worker
 * processes) sees the new value as well.
 *
 * Returns `{ ok: true }` on success and `{ ok: false, error }` otherwise —
 * the caller is responsible for surfacing rotation failures to the operator.
 *
 * Zero-downtime guarantee: in-flight requests use the password captured
 * inside their own header build at request time, so currently-running queries
 * complete normally; only requests that begin after this call observe the
 * new password.
 */
export async function rotateClickHousePassword(
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters" };
  }
  const url = process.env.CLICKHOUSE_URL;
  if (!url) {
    return { ok: false, error: "CLICKHOUSE_URL is not configured on this plane" };
  }

  // Build a probe client with the candidate password without disturbing the
  // singleton — if validation fails, the singleton's password is untouched.
  const probe = new ClickHouseClient({
    url,
    user:      process.env.CLICKHOUSE_USER     ?? "default",
    password:  newPassword,
    database:  process.env.CLICKHOUSE_DATABASE ?? "ccc",
    timeoutMs: 10_000,
  });

  try {
    const health = await probe.healthCheck();
    if (health.status !== "connected") {
      return {
        ok: false,
        error: `Validation against ClickHouse failed: ${health.error ?? "unknown"}`,
      };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Update env var first so a subsequent getClickHouseClient() in any code path
  // (including freshly-spawned worker processes inheriting env) sees the new
  // value. Then swap on the live singleton if it exists.
  process.env.CLICKHOUSE_PASSWORD = newPassword;
  if (_client) {
    _client.setPassword(newPassword);
  }
  console.log("[ClickHouse] Password hot-rotated successfully (validated against server).");
  return { ok: true };
}

/**
 * DEBUG-level latency logger for ClickHouse query routing.
 *
 * Emitted only when LOG_LEVEL=debug or DEBUG_CLICKHOUSE=1 so operators can
 * compare ClickHouse vs PostgreSQL latency without flooding production logs.
 * Use for every CH read path so the OLAP/OLTP performance gap is visible.
 */
export function logChQuery(
  name: string,
  latencyMs: number,
  extras?: Record<string, unknown>,
): void {
  if (process.env.LOG_LEVEL === "debug" || process.env.DEBUG_CLICKHOUSE === "1") {
    const extrasStr = extras
      ? " " + Object.entries(extras).map(([k, v]) => `${k}=${v}`).join(" ")
      : "";
    console.debug(`[ClickHouse] ${name} latency=${latencyMs}ms${extrasStr}`);
  }
}
