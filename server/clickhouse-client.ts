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
import { recordChFastPath } from "./clickhouse-fast-path-stats";

// ── ClickHouse date formatting ────────────────────────────────────────────────
// Self-hosted ClickHouse defaults to `date_time_input_format=basic`, which only
// accepts `YYYY-MM-DD HH:MM:SS.sss` and rejects ISO-8601 `T`/`Z` separators.
// All DateTime64 values sent to CH must use this format to avoid Code: 27
// JSONEachRow parse errors.
export function formatChDateTime64(d: Date | string | null | undefined): string {
  const date = d instanceof Date ? d
    : typeof d === "string" && d ? new Date(d)
    : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

// ── Retry helpers ─────────────────────────────────────────────────────────────
/** Returns true for transient HTTP / network errors that are worth retrying. */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Fail fast on permanent / config errors that will never succeed on retry.
  if (
    msg.includes("Code: 701") ||       // CLUSTER_DOESNT_EXIST
    msg.includes("Code: 48")           // NOT_IMPLEMENTED (e.g. INSERT into VIEW)
  ) {
    return false;
  }
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    /\b5\d\d\b/.test(msg) ||          // HTTP 5xx embedded in message
    msg.includes("Code: 159") ||       // CH TimeoutExceeded
    msg.includes("Code: 209") ||       // CH SocketTimeout
    msg.includes("Code: 241")          // CH Memory limit exceeded (transient)
  );
}

/**
 * Retry an async operation with exponential backoff.
 * @param label  Log label (e.g. "ClickHouse INSERT")
 * @param fn     The operation to retry
 * @param opts   maxRetries (default 3), baseDelayMs (default 1000)
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt > maxRetries || !isTransientError(err)) throw err;
      const delay = baseDelayMs * attempt;
      console.warn(`[${label}] Transient error (attempt ${attempt}/${maxRetries + 1}): ${err instanceof Error ? err.message : String(err)}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Shared tier-routing constant ──────────────────────────────────────────────
/** Hot-tier retention in days.  Override via HOT_RETENTION_DAYS env var. */
export const HOT_RETENTION_DAYS = parseInt(process.env.HOT_RETENTION_DAYS ?? "90", 10);

// ── Cluster vs single-node detection ──────────────────────────────────────────
let _clickHouseUsesCluster = false;
/** Returns true when the last schema init detected a usable ccc_cluster. */
export function clickHouseUsesCluster(): boolean {
  return _clickHouseUsesCluster;
}

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

export interface IngestIncidentPayload {
  id: number;
  tenant_id: number;
  severity: string;
  status: string;
  source?: string;
  detection_source?: string;
  mitre_tactic?: string;
  mitre_technique_id?: string;
  mitre_technique?: string;
  kill_chain_phase?: string;
  confidence_score?: number;
  classification?: string;
  is_true_positive?: number;       // 0/1; ClickHouse UInt8
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601 (also serves as ReplacingMergeTree version)
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
  /**
   * Raw target text from the PG `target` column. May be a hostname, FQDN,
   * IPv4 literal, or empty. Stored alongside `dst_ip` (which only carries
   * valid IPv4 values) so the threat-globe fast-path can match offices via
   * hostname keywords / CIDR exactly the way the PG path does. Without this
   * field, multi-office tenants saw every CH-path arc collapse to the
   * default office because target hostnames weren't available server-side.
   */
  target?: string;
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
  // Task #203: richer threat-flow Sankey columns. These mirror the PG
  // `security_events` columns of the same name so the CH fast-path can
  // produce the same level of detail as the PG path for the dashboard
  // threat-flow Sankey (Email/EDR domains in particular).
  threat?: string;
  action?: string;
  recipient?: string;
  description?: string;
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
  private readonly agent: http.Agent | https.Agent;

  constructor(cfg: ClickHouseConfig) {
    this.url      = cfg.url;
    this.user     = cfg.user ?? "default";
    this.password = cfg.password;
    this.database = cfg.database ?? "ccc";
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    const parsed = new URL(this.url);
    const agentOpts = { keepAlive: true, maxSockets: 10, maxFreeSockets: 5, timeout: 30_000 };
    this.agent = parsed.protocol === "https:" ? new https.Agent(agentOpts) : new http.Agent(agentOpts);
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
   *
   * **Note:** ClickHouse rejects DDL (CREATE, DROP, ALTER, etc.) on GET because
   * it treats GET as readonly. Use `exec()` for any modifying query.
   */
  async query(sql: string): Promise<string> {
    return withRetry("ClickHouse query", () => this._queryRaw(sql), { maxRetries: 3, baseDelayMs: 1000 });
  }

  private _queryRaw(sql: string): Promise<string> {
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
      const req = transport.get(requestUrl, { headers, timeout: this.timeoutMs, agent: this.agent }, (res) => {
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
   * Execute a modifying SQL statement via HTTP POST.
   * Use this for DDL (CREATE, DROP, ALTER, TRUNCATE) and INSERT.
   * The SQL is sent in the request body to avoid URL-length limits.
   * Credentials are sent as headers, not URL params.
   * Returns raw response body.
   */
  async exec(sql: string): Promise<string> {
    return withRetry("ClickHouse exec", () => this._execRaw(sql), { maxRetries: 3, baseDelayMs: 1000 });
  }

  private _execRaw(sql: string): Promise<string> {
    const parsed = new URL(this.url);
    const qs = new URLSearchParams({
      database: this.database,
      default_format: "JSONEachRow",
    });
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = buildAuthHeaders(this.user, this.password);

    return new Promise<string>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: `/?${qs.toString()}`,
          method: "POST",
          headers: { ...headers, "Content-Length": Buffer.byteLength(sql) },
          timeout: this.timeoutMs,
          agent: this.agent,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => {
            if (res.statusCode !== undefined && res.statusCode >= 400) {
              reject(new Error(`ClickHouse ${res.statusCode}: ${body.slice(0, 256)}`));
            } else {
              resolve(body);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`ClickHouse exec timed out after ${this.timeoutMs}ms`));
      });
      req.write(sql);
      req.end();
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
   * Internal helper: sends an INSERT statement via HTTP POST with the given
   * body (JSONEachRow).  On >=400 status the promise is rejected with the
   * response text.
   */
  private _postInsert(insertSql: string, body: string, errorPrefix: string): Promise<void> {
    return withRetry(errorPrefix, () => this._postInsertRaw(insertSql, body, errorPrefix), { maxRetries: 3, baseDelayMs: 1000 });
  }

  private _postInsertRaw(insertSql: string, body: string, errorPrefix: string): Promise<void> {
    const parsed = new URL(this.url);
    const qs = new URLSearchParams({ query: insertSql, database: this.database });
    const requestUrl = `${parsed.origin}/?${qs.toString()}`;
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = buildAuthHeaders(this.user, this.password);

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
          agent:    this.agent,
        },
        (res) => {
          let respBody = "";
          res.on("data", (c: Buffer) => { respBody += c.toString(); });
          res.on("end", () => {
            if (res.statusCode !== undefined && res.statusCode >= 400) {
              reject(new Error(`${errorPrefix} ${res.statusCode}: ${respBody.slice(0, 256)}`));
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
   * Single-node safety: ClickHouse VIEWS do not support INSERT.  In cluster
   * mode `*_distributed` is a Distributed engine table (insertable); in
   * single-node mode it is a VIEW.  When we hit the VIEW error we silently
   * retry against the base table.
   */
  private async _insertWithFallback(
    insertSql: string,
    body: string,
    errorPrefix: string,
    distributedTable: string,
    baseTable: string,
  ): Promise<void> {
    try {
      await this._postInsert(insertSql, body, errorPrefix);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Single-node CH: *_distributed is either a VIEW (INSERT → NOT_IMPLEMENTED)
      // or the VIEW/table doesn't exist at all (UNKNOWN_TABLE / "does not exist").
      const isViewError = msg.includes("storage View") || msg.includes("NOT_IMPLEMENTED");
      const isMissingTable = msg.includes("UNKNOWN_TABLE") || msg.includes("does not exist") || msg.includes("Code: 60");
      if (isViewError || isMissingTable) {
        const fallbackSql = insertSql.replace(distributedTable, baseTable);
        await this._postInsert(fallbackSql, body, errorPrefix);
      } else {
        throw err;
      }
    }
  }

  /**
   * Insert a single event via HTTP POST (JSONEachRow).
   * Credentials sent via headers; no URL exposure.
   */
  async ingestEvent(event: IngestEventPayload): Promise<void> {
    const insertSql =
      `INSERT INTO ${this.database}.security_events_distributed ` +
      `(event_id, tenant_id, source_type, log_source, severity, event_type, host, ` +
      `src_ip, dst_ip, target, user_name, process_name, mitre_tactic, mitre_technique, ` +
      `kill_chain_phase, confidence_score, data_region, raw_event, ` +
      `normalized_event, iocs, ingested_at, ` +
      `threat, action, recipient, description) FORMAT JSONEachRow`;

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
      target:           event.target ?? "",
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
      ingested_at:      event.ingested_at ?? formatChDateTime64(new Date()),
      threat:           event.threat ?? "",
      action:           event.action ?? "",
      recipient:        event.recipient ?? "",
      description:      event.description ?? "",
    };
    const body = JSON.stringify(row);

    await this._insertWithFallback(
      insertSql, body, "ClickHouse INSERT",
      `${this.database}.security_events_distributed`,
      `${this.database}.security_events`,
    );
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
    const insertSql =
      `INSERT INTO ${this.database}.security_events_distributed ` +
      `(event_id, tenant_id, source_type, log_source, severity, event_type, host, ` +
      `src_ip, dst_ip, target, user_name, process_name, mitre_tactic, mitre_technique, ` +
      `kill_chain_phase, confidence_score, data_region, raw_event, ` +
      `normalized_event, iocs, ingested_at, ` +
      `threat, action, recipient, description) FORMAT JSONEachRow`;

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
          target:           event.target ?? "",
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
          ingested_at:      event.ingested_at ?? formatChDateTime64(new Date()),
          threat:           event.threat ?? "",
          action:           event.action ?? "",
          recipient:        event.recipient ?? "",
          description:      event.description ?? "",
        })
      )
      .join("\n");

    await this._insertWithFallback(
      insertSql, body, "ClickHouse batch INSERT",
      `${this.database}.security_events_distributed`,
      `${this.database}.security_events`,
    );
  }

  /**
   * Insert/update incidents into ClickHouse via JSONEachRow. The underlying
   * table is a ReplacingMergeTree keyed on (tenant_id, id) with `updated_at`
   * as the version column, so re-inserting the same id with a newer
   * `updated_at` upserts the row in place. Used by storage.chDualWriteIncidents
   * so the MITRE coverage fast-path can count incidents (not events) from CH
   * and stay apples-to-apples with the PostgreSQL path.
   */
  async insertIncidents(rows: IngestIncidentPayload[]): Promise<void> {
    if (rows.length === 0) return;
    const insertSql =
      `INSERT INTO ${this.database}.incidents_distributed ` +
      `(id, tenant_id, severity, status, source, detection_source, ` +
      `mitre_tactic, mitre_technique_id, mitre_technique, kill_chain_phase, ` +
      `confidence_score, classification, is_true_positive, ` +
      `created_at, updated_at) FORMAT JSONEachRow`;

    const body = rows
      .map((r) =>
        JSON.stringify({
          id:                  r.id,
          tenant_id:           r.tenant_id,
          severity:            r.severity ?? "",
          status:              r.status ?? "",
          source:              r.source ?? "",
          detection_source:    r.detection_source ?? "",
          mitre_tactic:        r.mitre_tactic ?? "",
          mitre_technique_id:  r.mitre_technique_id ?? "",
          mitre_technique:     r.mitre_technique ?? "",
          kill_chain_phase:    r.kill_chain_phase ?? "",
          confidence_score:    r.confidence_score ?? 0,
          classification:      r.classification ?? "",
          is_true_positive:    r.is_true_positive ?? 0,
          created_at:          r.created_at,
          updated_at:          r.updated_at,
        })
      )
      .join("\n");

    await this._insertWithFallback(
      insertSql, body, "ClickHouse incidents INSERT",
      `${this.database}.incidents_distributed`,
      `${this.database}.incidents`,
    );
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
      log_source       String DEFAULT '' CODEC(ZSTD(3)),
      host             String DEFAULT '' CODEC(ZSTD(3)),
      src_ip           IPv4 DEFAULT '0.0.0.0',
      dst_ip           IPv4 DEFAULT '0.0.0.0',
      -- Raw target text (hostname/FQDN/IPv4-literal). Required by the
      -- threat-globe fast-path so multi-office tenants can match offices via
      -- hostname keywords + CIDR identically to the PG path. dst_ip alone is
      -- not enough because it only carries valid IPv4 values.
      target           String DEFAULT '' CODEC(ZSTD(3)),
      user_name        String DEFAULT '' CODEC(ZSTD(3)),
      process_name     String DEFAULT '' CODEC(ZSTD(3)),
      mitre_tactic     LowCardinality(String) DEFAULT '',
      mitre_technique  LowCardinality(String) DEFAULT '',
      kill_chain_phase LowCardinality(String) DEFAULT '',
      confidence_score Float32 DEFAULT 0,
      data_region      LowCardinality(String) DEFAULT '',
      raw_event        String DEFAULT '' CODEC(ZSTD(6)),
      normalized_event String DEFAULT '' CODEC(ZSTD(3)),
      iocs             String DEFAULT '[]' CODEC(ZSTD(3)),
      ingested_at      DateTime64(3) DEFAULT now64(),
      -- Task #203: richer threat-flow Sankey context. Mirrors PG security_events
      -- so the CH fast-path can produce per-threat / per-action / per-recipient
      -- detail equivalent to the PG path. action is LowCardinality (small
      -- enumerated set); the rest are high-cardinality strings.
      threat           String DEFAULT '' CODEC(ZSTD(3)),
      action           LowCardinality(String) DEFAULT '',
      recipient        String DEFAULT '' CODEC(ZSTD(3)),
      description      String DEFAULT '' CODEC(ZSTD(6)),
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
    // Incidents mirror — feeds the MITRE coverage fast-path so per-tile counts
    // match the PostgreSQL incidents-grouped query (instead of approximating
    // via raw security_events). ReplacingMergeTree(updated_at) collapses to
    // the latest version per (tenant_id, id), so chDualWriteIncidents can
    // re-emit the row on every update without duplicates.
    `CREATE TABLE IF NOT EXISTS ${database}.incidents ON CLUSTER ccc_cluster (
      id                  UInt64,
      tenant_id           UInt32,
      severity            LowCardinality(String) DEFAULT '',
      status              LowCardinality(String) DEFAULT '',
      source              LowCardinality(String) DEFAULT '',
      detection_source    String DEFAULT '' CODEC(ZSTD(3)),
      mitre_tactic        LowCardinality(String) DEFAULT '',
      mitre_technique_id  LowCardinality(String) DEFAULT '',
      mitre_technique     LowCardinality(String) DEFAULT '',
      kill_chain_phase    LowCardinality(String) DEFAULT '',
      confidence_score    Int32                  DEFAULT 0,
      classification      LowCardinality(String) DEFAULT '',
      is_true_positive    UInt8                  DEFAULT 0,
      created_at          DateTime64(3)          DEFAULT now64(),
      updated_at          DateTime64(3)          DEFAULT now64(),
      INDEX idx_inc_mitre_id     mitre_technique_id  TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_inc_mitre_tactic mitre_tactic        TYPE bloom_filter(0.01) GRANULARITY 4
    ) ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/incidents', '{replica}', updated_at)
    PARTITION BY toYYYYMM(created_at)
    ORDER BY (tenant_id, id)
    SETTINGS index_granularity = 8192`,
    // IMPORTANT: shard deterministically by incident identity, NOT rand().
    // ReplacingMergeTree(updated_at) only deduplicates within a shard, and
    // FINAL on a Distributed query does not collapse cross-shard duplicates.
    // The CH dual-write re-emits the same (tenant_id, id) on every update to
    // upsert the latest version, so different versions of the same incident
    // MUST land on the same shard or the MITRE coverage fast-path will
    // overcount and drift from the PG path. cityHash64(tenant_id, id)
    // matches the table's ORDER BY key and pins all versions of an incident
    // to one shard.
    //
    // Drop + recreate is safe for the Distributed table because it owns no
    // data — the rows live on the underlying `incidents` shards. This
    // guarantees the sharding key is correct even if a prior deploy created
    // the table with a different key. The historical rows then get re-keyed
    // on the next ingest pass (the dual-write + sweeper re-emit on update).
    `DROP TABLE IF EXISTS ${database}.incidents_distributed ON CLUSTER ccc_cluster`,
    `CREATE TABLE ${database}.incidents_distributed ON CLUSTER ccc_cluster
     AS ${database}.incidents
     ENGINE = Distributed(ccc_cluster, ${database}, incidents, cityHash64(tenant_id, id))`,
    // Tiny migrations table used to gate one-shot data remediations across
    // restarts (e.g. truncating mis-sharded incident rows). Replicated so all
    // shards see the same applied set.
    `CREATE TABLE IF NOT EXISTS ${database}._migrations ON CLUSTER ccc_cluster (
       name       String,
       applied_at DateTime64(3) DEFAULT now64()
     ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/_migrations', '{replica}')
     ORDER BY name`,
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
      log_source       String DEFAULT '' CODEC(ZSTD(3)),
      host             String DEFAULT '' CODEC(ZSTD(3)),
      src_ip           IPv4 DEFAULT '0.0.0.0',
      dst_ip           IPv4 DEFAULT '0.0.0.0',
      target           String DEFAULT '' CODEC(ZSTD(3)),
      user_name        String DEFAULT '' CODEC(ZSTD(3)),
      process_name     String DEFAULT '' CODEC(ZSTD(3)),
      mitre_tactic     LowCardinality(String) DEFAULT '',
      mitre_technique  LowCardinality(String) DEFAULT '',
      kill_chain_phase LowCardinality(String) DEFAULT '',
      confidence_score Float32 DEFAULT 0,
      data_region      LowCardinality(String) DEFAULT '',
      raw_event        String DEFAULT '' CODEC(ZSTD(6)),
      normalized_event String DEFAULT '' CODEC(ZSTD(3)),
      iocs             String DEFAULT '[]' CODEC(ZSTD(3)),
      ingested_at      DateTime64(3) DEFAULT now64(),
      threat           String DEFAULT '' CODEC(ZSTD(3)),
      action           LowCardinality(String) DEFAULT '',
      recipient        String DEFAULT '' CODEC(ZSTD(3)),
      description      String DEFAULT '' CODEC(ZSTD(6)),
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
    // Single-node incidents mirror — same shape as the cluster table.
    `CREATE TABLE IF NOT EXISTS ${database}.incidents (
      id                  UInt64,
      tenant_id           UInt32,
      severity            LowCardinality(String) DEFAULT '',
      status              LowCardinality(String) DEFAULT '',
      source              LowCardinality(String) DEFAULT '',
      detection_source    String DEFAULT '' CODEC(ZSTD(3)),
      mitre_tactic        LowCardinality(String) DEFAULT '',
      mitre_technique_id  LowCardinality(String) DEFAULT '',
      mitre_technique     LowCardinality(String) DEFAULT '',
      kill_chain_phase    LowCardinality(String) DEFAULT '',
      confidence_score    Int32                  DEFAULT 0,
      classification      LowCardinality(String) DEFAULT '',
      is_true_positive    UInt8                  DEFAULT 0,
      created_at          DateTime64(3)          DEFAULT now64(),
      updated_at          DateTime64(3)          DEFAULT now64(),
      INDEX idx_inc_mitre_id     mitre_technique_id  TYPE bloom_filter(0.01) GRANULARITY 4,
      INDEX idx_inc_mitre_tactic mitre_tactic        TYPE bloom_filter(0.01) GRANULARITY 4
    ) ENGINE = ReplacingMergeTree(updated_at)
    PARTITION BY toYYYYMM(created_at)
    ORDER BY (tenant_id, id)
    SETTINGS index_granularity = 8192`,
    `CREATE VIEW IF NOT EXISTS ${database}.incidents_distributed AS SELECT * FROM ${database}.incidents`,
    // Idempotency marker table — used by backfills and migrations in both modes.
    `CREATE TABLE IF NOT EXISTS ${database}._migrations (
       name       String,
       applied_at DateTime64(3) DEFAULT now64()
     ) ENGINE = MergeTree() ORDER BY name`,
  ];

  const isClusterError = (msg: string) =>
    msg.includes("Cluster") || msg.includes("ON CLUSTER") || msg.includes("ccc_cluster") ||
    msg.includes("ReplicatedMergeTree") || msg.includes("No macro");

  // Try cluster DDL first; if any statement fails with a cluster-related error,
  // retry the entire sequence with the single-node DDL.
  let useSingleNode = false;
  for (const stmt of clusterDdl) {
    try {
      await client.exec(stmt.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("POPULATE")) continue;
      if (isClusterError(msg)) { useSingleNode = true; break; }
      console.warn(`[ClickHouse] DDL warning (non-fatal): ${msg.slice(0, 256)}`);
    }
  }

  _clickHouseUsesCluster = !useSingleNode;
  if (useSingleNode) {
    console.log("[ClickHouse] Cluster not available — initializing single-node schema.");
    for (const stmt of singleNodeDdl) {
      try {
        await client.exec(stmt.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("POPULATE")) continue;
        console.warn(`[ClickHouse] DDL warning (non-fatal): ${msg.slice(0, 256)}`);
      }
    }
  } else {
    // Cluster mode only: one-shot data remediation for environments that may
    // have ingested incidents while the Distributed wrapper still used
    // rand() sharding. Those rows can be physically located on any shard,
    // and ReplacingMergeTree(updated_at) + FINAL only deduplicates within a
    // shard — so leaving them in place would let the MITRE coverage
    // fast-path overcount versus PG. We TRUNCATE the local incidents table
    // on every shard once, then let storage.backfillIncidentsToClickHouse()
    // repopulate from PG using the new deterministic sharding key. The
    // marker in `_migrations` ensures this runs at most once per cluster.
    const MIGRATION = "incidents_dedup_shard_v1";
    try {
      const rows = await client.queryRows<{ name: string }>(
        `SELECT name FROM ${database}._migrations WHERE name = '${MIGRATION}' LIMIT 1`,
      );
      if (rows.length === 0) {
        console.log(
          "[ClickHouse] Applying migration incidents_dedup_shard_v1: " +
          "truncating mis-sharded incidents so the startup backfill can " +
          "rebuild them with the cityHash64(tenant_id, id) sharding key.",
        );
        await client.exec(`TRUNCATE TABLE IF EXISTS ${database}.incidents ON CLUSTER ccc_cluster`);
        await client.exec(
          `INSERT INTO ${database}._migrations (name) VALUES ('${MIGRATION}')`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ClickHouse] incident migration warning (non-fatal): ${msg.slice(0, 256)}`);
    }
  }

  // ── Forward-compatible column migrations ────────────────────────────────────
  // Existing deployments created the table before these columns were added.
  // ALTER ADD COLUMN IF NOT EXISTS is idempotent so this is safe on every
  // boot. The cluster variant uses ON CLUSTER so the change reaches every
  // shard; we fall back to the unqualified ALTER on single-node setups.
  //
  //  - Task #202: `target` (raw target text — hostname/FQDN/IP literal) is
  //    required by the threat-globe office matcher.
  //  - Task #203: `threat`, `action`, `recipient`, `description` mirror the
  //    PG security_events columns the threat-flow Sankey depends on so the
  //    CH fast-path matches the PG path's specificity.
  const alterColumnStmts: { col: string; type: string }[] = [
    { col: "target",      type: "String DEFAULT '' CODEC(ZSTD(3))" },
    { col: "threat",      type: "String DEFAULT '' CODEC(ZSTD(3))" },
    { col: "action",      type: "LowCardinality(String) DEFAULT ''" },
    { col: "recipient",   type: "String DEFAULT '' CODEC(ZSTD(3))" },
    { col: "description", type: "String DEFAULT '' CODEC(ZSTD(6))" },
  ];

  const runAlter = async (clusterStmt: string, singleStmt: string | null, label: string) => {
    try {
      await client.exec(useSingleNode && singleStmt ? singleStmt : clusterStmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!useSingleNode && isClusterError(msg) && singleStmt) {
        try { await client.exec(singleStmt); }
        catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          console.warn(`[ClickHouse] ALTER ${label} (non-fatal): ${msg2.slice(0, 256)}`);
        }
      } else if (!msg.includes("already exists") && !msg.includes("Cannot add")) {
        console.warn(`[ClickHouse] ALTER ${label} (non-fatal): ${msg.slice(0, 256)}`);
      }
    }
  };

  for (const { col, type } of alterColumnStmts) {
    const baseCluster = `ALTER TABLE ${database}.security_events ON CLUSTER ccc_cluster ADD COLUMN IF NOT EXISTS ${col} ${type}`;
    const baseSingle  = `ALTER TABLE ${database}.security_events ADD COLUMN IF NOT EXISTS ${col} ${type}`;
    await runAlter(baseCluster, baseSingle, `security_events.${col}`);
    // Distributed table — must be altered separately on cluster setups so
    // INSERT INTO security_events_distributed (..., ${col}, ...) recognises
    // the new column. (On single-node this is a regular VIEW recreated below
    // to pick up new base-table columns at query time.)
    if (!useSingleNode) {
      const distCluster = `ALTER TABLE ${database}.security_events_distributed ON CLUSTER ccc_cluster ADD COLUMN IF NOT EXISTS ${col} ${type}`;
      await runAlter(distCluster, null, `security_events_distributed.${col}`);
    }
  }

  // Single-node: `security_events_distributed` is a VIEW over security_events
  // whose `SELECT *` was expanded at creation time, so it won't include the
  // newly-added columns. Drop and recreate so reads see the new fields.
  // (In cluster mode the Distributed engine resolves columns lazily, so no
  // recreation is needed there.)
  if (useSingleNode) {
    try {
      await client.exec(`DROP VIEW IF EXISTS ${database}.security_events_distributed`);
      await client.exec(
        `CREATE VIEW IF NOT EXISTS ${database}.security_events_distributed AS SELECT * FROM ${database}.security_events`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ClickHouse] distributed-view refresh warning (non-fatal): ${msg.slice(0, 256)}`);
    }
  }

  // Safety: ensure incidents_distributed exists as a VIEW in single-node mode
  // or that the base incidents table exists for fallback inserts. This catches
  // cases where a partial cluster DDL run dropped the distributed table but
  // failed before the single-node fallback could recreate it.
  try {
    await client.exec(
      `CREATE VIEW IF NOT EXISTS ${database}.incidents_distributed AS SELECT * FROM ${database}.incidents`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) {
      console.warn(`[ClickHouse] incidents_distributed safety check (non-fatal): ${msg.slice(0, 256)}`);
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
  // Task #187 — feed per-tenant fast-path success/failure counters so a
  // sustained CH outage triggers a platform alert (see clickhouse-fast-path-monitor).
  try {
    recordChFastPath(name, latencyMs, extras);
  } catch { /* counters are best-effort */ }

  if (process.env.LOG_LEVEL === "debug" || process.env.DEBUG_CLICKHOUSE === "1") {
    const extrasStr = extras
      ? " " + Object.entries(extras).map(([k, v]) => `${k}=${v}`).join(" ")
      : "";
    console.debug(`[ClickHouse] ${name} latency=${latencyMs}ms${extrasStr}`);
  }
}
