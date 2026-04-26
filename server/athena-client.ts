/**
 * AWS Athena client for Cyber Command Center — cold-tier forensic queries
 *
 * Queries the S3/Iceberg data lake for security events older than 90 days
 * using AWS Athena (Presto/Trino engine) via the @aws-sdk/client-athena SDK.
 *
 * Credentials are loaded from the platform_integrations table, not env vars:
 *   FORENSICS_AWS_ACCESS_KEY       AWS access key with Athena + S3 read perms
 *   FORENSICS_AWS_SECRET_KEY       Matching secret key
 *   FORENSICS_AWS_REGION           AWS region (e.g. us-east-1)
 *   FORENSICS_ATHENA_DATABASE      Glue catalog DB name (e.g. ccc_security_events)
 *   FORENSICS_ATHENA_RESULTS_BUCKET S3 bucket for Athena query results (no trailing slash)
 *
 * Usage:
 *   const client = await getAthenaClient(pool);
 *   if (!client) return; // not configured
 *   const result = await client.query(sql, { maxRows: 1000, pollIntervalMs: 5000 });
 */

import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StopQueryExecutionCommand,
  type QueryExecution,
  type ResultSet,
} from "@aws-sdk/client-athena";

function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 500): Promise<T> {
  return fn().catch(async (err: any) => {
    const isRetryable =
      err?.name === "ThrottlingException" ||
      err?.name === "TooManyRequestsException" ||
      err?.name === "ServiceUnavailableException" ||
      err?.name === "InternalServerException" ||
      err?.code === "ECONNRESET" ||
      err?.code === "ETIMEDOUT" ||
      err?.code === "ENOTFOUND" ||
      err?.message?.includes("timeout") ||
      err?.statusCode >= 500;
    if (retries <= 0 || !isRetryable) throw err;
    await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, 3 - retries)));
    return withRetry(fn, retries - 1, baseDelayMs);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AthenaQueryResult {
  rows: Record<string, unknown>[];
  total: number;
  executionMs: number;
  queryId: string;
  tier: "cold";
  status: "completed" | "failed" | "timeout";
  errorMessage?: string;
}

export interface AthenaQueryOptions {
  maxRows?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface AthenaCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  database: string;
  resultsBucket: string;
  /** Athena workgroup — defaults to "ccc-forensics" for backwards compat.
   *  In AWS deployments this should match the CloudFormation output:
   *  ccc-forensics-<EnvironmentName>.  Pass via FORENSICS_ATHENA_WORKGROUP
   *  platform_integration key or the env var of the same name. */
  workGroup?: string;
}

// ── Credentials loader ────────────────────────────────────────────────────────

/**
 * Load Athena credentials from the platform_integrations table.
 * Returns null if any required credential is missing.
 */
export async function loadAthenaCredentials(
  pool: any,
): Promise<AthenaCredentials | null> {
  try {
    const rows = await pool.query(
      `SELECT name, api_key FROM platform_integrations
       WHERE name IN (
         'FORENSICS_AWS_ACCESS_KEY',
         'FORENSICS_AWS_SECRET_KEY',
         'FORENSICS_AWS_REGION',
         'FORENSICS_ATHENA_DATABASE',
         'FORENSICS_ATHENA_RESULTS_BUCKET',
         'FORENSICS_ATHENA_WORKGROUP'
       ) AND enabled = true AND api_key IS NOT NULL AND api_key != ''`,
    );

    const creds: Record<string, string> = {};
    for (const row of rows.rows as Array<{ name: string; api_key: string }>) {
      creds[row.name] = row.api_key;
    }

    const required = [
      "FORENSICS_AWS_ACCESS_KEY",
      "FORENSICS_AWS_SECRET_KEY",
      "FORENSICS_AWS_REGION",
      "FORENSICS_ATHENA_DATABASE",
      "FORENSICS_ATHENA_RESULTS_BUCKET",
    ];
    if (required.some((k) => !creds[k])) return null;

    return {
      accessKeyId:   creds.FORENSICS_AWS_ACCESS_KEY,
      secretAccessKey: creds.FORENSICS_AWS_SECRET_KEY,
      region:        creds.FORENSICS_AWS_REGION,
      database:      creds.FORENSICS_ATHENA_DATABASE,
      resultsBucket: creds.FORENSICS_ATHENA_RESULTS_BUCKET,
      workGroup:     creds.FORENSICS_ATHENA_WORKGROUP || undefined,
    };
  } catch (err: unknown) {
    console.warn("[Athena] Credential load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

export class CccAthenaClient {
  private client: AthenaClient;
  private database: string;
  private resultsBucket: string;
  private workGroup: string;

  constructor(creds: AthenaCredentials) {
    this.database = creds.database;
    this.resultsBucket = creds.resultsBucket;
    // Workgroup resolution order:
    //   1. Explicit value from FORENSICS_ATHENA_WORKGROUP integration key.
    //   2. Athena built-in "primary" workgroup — always exists in every AWS account,
    //      so Athena queries succeed without any operator configuration.
    // AWS deployments with a custom CF workgroup (e.g. "ccc-forensics-prod") should
    // set FORENSICS_ATHENA_WORKGROUP in platform_integrations to that name.
    this.workGroup = creds.workGroup ?? "primary";
    this.client = new AthenaClient({
      region: creds.region,
      credentials: {
        accessKeyId:     creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });
  }

  /**
   * Start an Athena query and return immediately with the queryExecutionId.
   * Use pollQuery() to check status and fetch results.
   */
  async startQuery(sql: string, tenantId?: number): Promise<string> {
    return withRetry(async () => {
      const bucketBase = this.resultsBucket.startsWith("s3://")
        ? this.resultsBucket
        : `s3://${this.resultsBucket}`;
      const tenantPrefix = tenantId != null ? `tenant_id=${tenantId}/` : "";
      const outputLocation = `${bucketBase}/forensics/athena-results/${tenantPrefix}`;
      const cmd = new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: { Database: this.database },
        ResultConfiguration: {
          OutputLocation: outputLocation,
          EncryptionConfiguration: { EncryptionOption: "SSE_S3" },
        },
        WorkGroup: this.workGroup,
      });
      const resp = await this.client.send(cmd);
      if (!resp.QueryExecutionId) throw new Error("Athena did not return a QueryExecutionId");
      return resp.QueryExecutionId;
    });
  }

  /**
   * Poll a previously started query until it completes, fails, or times out.
   */
  async pollQuery(
    queryId: string,
    opts: AthenaQueryOptions = {},
  ): Promise<{ state: string; stateChangeReason?: string }> {
    const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
    const timeoutMs = opts.timeoutMs ?? 300_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getQueryStatus(queryId);
      const state = status?.Status?.State ?? "UNKNOWN";
      if (state === "SUCCEEDED" || state === "FAILED" || state === "CANCELLED") {
        return { state, stateChangeReason: status?.Status?.StateChangeReason };
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    // Cancel the query to avoid unnecessary Athena charges
    try {
      await this.client.send(new StopQueryExecutionCommand({ QueryExecutionId: queryId }));
    } catch (e: any) {
      console.warn(`[Athena] Failed to cancel timed-out query ${queryId}:`, e.message);
    }
    return { state: "TIMEOUT" };
  }

  /**
   * Fetch a raw QueryExecution record (status, stats, error info).
   */
  async getQueryStatus(queryId: string): Promise<QueryExecution | undefined> {
    return withRetry(async () => {
      const cmd = new GetQueryExecutionCommand({ QueryExecutionId: queryId });
      const resp = await this.client.send(cmd);
      return resp.QueryExecution;
    });
  }

  /**
   * Fetch paginated results from a SUCCEEDED query.
   * Converts Athena's column/row format to plain objects.
   */
  async getQueryResults(
    queryId: string,
    maxRows = 1000,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let nextToken: string | undefined;
    let columns: string[] | null = null;
    let firstPage = true;

    do {
      const resp = await withRetry(async () => {
        const cmd = new GetQueryResultsCommand({
          QueryExecutionId: queryId,
          MaxResults: Math.min(maxRows - rows.length, 1000),
          NextToken: nextToken,
        });
        return this.client.send(cmd);
      });
      const resultSet: ResultSet = resp.ResultSet ?? { Rows: [] };

      // On the first page the Athena SDK always returns the column header row
      // as the first data row (Athena protocol).  We extract column names from
      // ResultSetMetadata and skip that first row so it never appears in output.
      const allRows = resultSet.Rows ?? [];
      let dataRows = allRows;

      if (firstPage) {
        columns = (resultSet.ResultSetMetadata?.ColumnInfo ?? []).map(
          (c) => c.Name ?? "unknown",
        );
        // Skip the header row returned by Athena on the first page.
        dataRows = allRows.slice(1);
        firstPage = false;
      }

      for (const row of dataRows) {
        if (!columns) break;
        const obj: Record<string, unknown> = {};
        (row.Data ?? []).forEach((cell, i) => {
          obj[columns![i]] = cell.VarCharValue ?? null;
        });
        rows.push(obj);
      }

      nextToken = resp.NextToken;
    } while (nextToken && rows.length < maxRows);

    return rows;
  }

  /**
   * Run a SQL query synchronously (start + poll + fetch results).
   * Returns AthenaQueryResult with rows, tier="cold", status, executionMs.
   */
  async query(
    sql: string,
    opts: AthenaQueryOptions = {},
  ): Promise<AthenaQueryResult> {
    const start = Date.now();
    let queryId = "";

    try {
      queryId = await this.startQuery(sql);
    } catch (err: unknown) {
      return {
        rows: [],
        total: 0,
        executionMs: Date.now() - start,
        queryId: "",
        tier: "cold",
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }

    const pollResult = await this.pollQuery(queryId, opts);
    const executionMs = Date.now() - start;

    if (pollResult.state === "TIMEOUT") {
      return { rows: [], total: 0, executionMs, queryId, tier: "cold", status: "timeout" };
    }
    if (pollResult.state !== "SUCCEEDED") {
      return {
        rows: [],
        total: 0,
        executionMs,
        queryId,
        tier: "cold",
        status: "failed",
        errorMessage: pollResult.stateChangeReason ?? pollResult.state,
      };
    }

    const rows = await this.getQueryResults(queryId, opts.maxRows ?? 1000);
    return { rows, total: rows.length, executionMs, queryId, tier: "cold", status: "completed" };
  }

  /**
   * Build a SELECT against the security_events Glue/Athena external table.
   *
   * Column contract — must match the NDJSON fields exported by RetentionManager:
   *   id, tenant_id, event_type, severity, threat, target, attacker, asset,
   *   source_type, log_source, mitre_tactic, mitre_technique, confidence_score,
   *   raw_payload, sigma_matches, occurred_at, stored_at, event_hash
   *
   * The corresponding Glue external table DDL (run once via the Athena console
   * or a CloudFormation resource) should declare these columns in the same
   * order, stored as NDJSON with Hive partitioning on year/month/tenant_id.
   *
   * Equivalent Athena DDL:
   *   CREATE EXTERNAL TABLE security_events (
   *     id            BIGINT,
   *     tenant_id     INT,
   *     event_type    STRING,
   *     severity      STRING,
   *     threat        STRING,
   *     target        STRING,
   *     attacker      STRING,
   *     asset         STRING,
   *     source_type   STRING,
   *     log_source    STRING,
   *     mitre_tactic  STRING,
   *     mitre_technique STRING,
   *     confidence_score DOUBLE,
   *     raw_payload   STRING,
   *     sigma_matches STRING,
   *     occurred_at   TIMESTAMP,
   *     stored_at     TIMESTAMP,
   *     event_hash    STRING
   *   )
   *   PARTITIONED BY (year INT, month INT, tenant_id INT)
   *   ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
   *   STORED AS TEXTFILE
   *   LOCATION 's3://<archive-bucket>/'
   *   TBLPROPERTIES ('has_encrypted_data'='true');
   */
  buildEventQuery(
    tenantIds: number | number[],
    filters: {
      startDate?: Date;
      endDate?: Date;
      severity?: string | string[];
      sourceType?: string | string[];
      eventType?: string;
      mitreTactic?: string;
      mitreTechnique?: string;
      search?: string;
      entityFilter?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): string {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds];
    const conditions: string[] = [`tenant_id IN (${ids.join(",")})`];

    // Use occurred_at — the column name in the exported NDJSON from RetentionManager.
    if (filters.startDate) {
      conditions.push(`occurred_at >= TIMESTAMP '${filters.startDate.toISOString().replace("T", " ").replace("Z", "")}'`);
    }
    if (filters.endDate) {
      conditions.push(`occurred_at < TIMESTAMP '${filters.endDate.toISOString().replace("T", " ").replace("Z", "")}'`);
    }

    // Coerce scalar → array so callers can pass either form.
    const severityArr = filters.severity
      ? (Array.isArray(filters.severity) ? filters.severity : [filters.severity])
      : [];
    const sourceTypeArr = filters.sourceType
      ? (Array.isArray(filters.sourceType) ? filters.sourceType : [filters.sourceType])
      : [];

    if (severityArr.length) {
      const list = severityArr.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
      conditions.push(`severity IN (${list})`);
    }
    if (sourceTypeArr.length) {
      const list = sourceTypeArr.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
      conditions.push(`source_type IN (${list})`);
    }
    if (filters.eventType) {
      conditions.push(`event_type = '${filters.eventType.replace(/'/g, "''")}'`);
    }
    if (filters.mitreTactic) {
      conditions.push(`mitre_tactic = '${filters.mitreTactic.replace(/'/g, "''")}'`);
    }
    if (filters.mitreTechnique) {
      conditions.push(`mitre_technique = '${filters.mitreTechnique.replace(/'/g, "''")}'`);
    }
    if (filters.search) {
      const s = filters.search.replace(/'/g, "''");
      conditions.push(
        `(LOWER(attacker) LIKE LOWER('%${s}%') OR LOWER(target) LIKE LOWER('%${s}%') ` +
        `OR LOWER(asset) LIKE LOWER('%${s}%') OR LOWER(event_type) LIKE LOWER('%${s}%'))`,
      );
    }
    if (filters.entityFilter) {
      const ef = filters.entityFilter.replace(/'/g, "''");
      conditions.push(
        `(LOWER(attacker) LIKE LOWER('%${ef}%') OR LOWER(target) LIKE LOWER('%${ef}%') ` +
        `OR LOWER(asset) LIKE LOWER('%${ef}%'))`,
      );
    }

    const where = conditions.join(" AND ");
    const rawLimit  = Number(filters.limit  ?? 100);
    const rawOffset = Number(filters.offset ?? 0);
    if (!Number.isFinite(rawLimit) || !Number.isFinite(rawOffset)) {
      throw new Error("Invalid pagination parameters: limit and offset must be finite integers");
    }
    const limit  = Math.max(1, Math.min(1000, Math.trunc(rawLimit)));
    const offset = Math.max(0, Math.trunc(rawOffset));

    // Queries target the GlueArchiveTable ("security_events_archive") — the external
    // NDJSON table backed by S3ArchiveBucket, NOT the Iceberg "security_events" table
    // which is populated by the ClickHouse hot-tier export pipeline.
    return `
      SELECT
        CAST(id AS VARCHAR)          AS event_id,
        tenant_id,
        source_type,
        log_source,
        severity,
        event_type,
        threat,
        target,
        attacker,
        asset,
        mitre_tactic,
        mitre_technique,
        confidence_score,
        event_hash,
        CAST(occurred_at AS VARCHAR) AS occurred_at,
        CAST(stored_at   AS VARCHAR) AS stored_at
      FROM security_events_archive
      WHERE ${where}
      ORDER BY occurred_at DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${limit} ROWS ONLY
    `.trim();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Validate that the Athena archive table exists and contains the required columns
 * that Athena queries depend on.  Logs a structured warning on failure so platform
 * health checks and operators can act immediately rather than discovering the
 * mismatch at query time.
 *
 * Expected table: security_events_archive
 * Required columns: id, tenant_id, severity, source_type, event_type, occurred_at
 */
export async function checkAthenaTableCompatibility(client: CccAthenaClient): Promise<void> {
  try {
    const queryId = await client.startQuery("DESCRIBE security_events_archive");
    const { state } = await client.pollQuery(queryId, { pollIntervalMs: 1000, timeoutMs: 30000 });
    if (state !== "SUCCEEDED") {
      console.error(
        `[Athena] Table check FAILED (state=${state}): security_events_archive could not be described. ` +
        `Deploy the GlueArchiveTable CloudFormation resource (05-data-lake.yml) to provision it.`,
      );
      return;
    }
    const rows = await client.getQueryResults(queryId, 200);
    const requiredCols = ["id", "tenant_id", "severity", "source_type", "event_type", "occurred_at"];
    const foundCols = rows.map((r: any) => {
      const firstVal = r[Object.keys(r)[0]];
      return String(firstVal ?? "").trim().toLowerCase();
    });
    const missing = requiredCols.filter((c) => !foundCols.includes(c));
    if (missing.length > 0) {
      console.error(
        `[Athena] Table compatibility check FAILED: security_events_archive missing columns: ` +
        `${missing.join(", ")}. Cold-tier queries will return incomplete results. ` +
        `Ensure GlueArchiveTable in 05-data-lake.yml is deployed with the correct schema.`,
      );
    } else {
      console.log("[Athena] Table compatibility check passed: security_events_archive schema OK.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Athena] Table compatibility check skipped (non-fatal): ${msg.slice(0, 256)}. ` +
      `Cold-tier queries will fail until security_events_archive is provisioned.`,
    );
  }
}

// Compatibility check is memoized per process — run once to avoid repeated
// DESCRIBE queries (and Athena charges) on every cold-tier request.
let _compatibilityChecked = false;

/**
 * Create a CccAthenaClient using credentials from platform_integrations.
 * Returns null if credentials are not configured.
 * Performs a once-per-process non-blocking table compatibility check.
 */
export async function getAthenaClient(pool: any): Promise<CccAthenaClient | null> {
  const creds = await loadAthenaCredentials(pool);
  if (!creds) return null;
  const client = new CccAthenaClient(creds);
  if (!_compatibilityChecked) {
    _compatibilityChecked = true;
    checkAthenaTableCompatibility(client).catch(() => {/* swallow — already logged inside */});
  }
  return client;
}
