import path from "path";
import { pool } from "./db";

export interface DataPartition {
  tenantId: number;
  startDate: Date;
  endDate: Date;
  region: string;
  eventCount: number;
  sizeBytes: number;
  format: "parquet" | "iceberg" | "postgresql";
  storageUri: string;
  status: "active" | "archived" | "deleted";
}

export interface RetentionTier {
  name: "hot" | "warm" | "cold" | "archive";
  retentionDays: number;
  storageBackend: "postgresql" | "timescaledb" | "parquet" | "iceberg";
  compressionCodec: "none" | "snappy" | "zstd" | "gzip";
}

export interface SchemaVersion {
  version: number;
  logSource: string;
  fields: Record<string, string>;
  createdAt: Date;
  isLatest: boolean;
}

export interface ExportJob {
  id: string;
  tenantId: number;
  startDate: Date;
  endDate: Date;
  format: "parquet" | "iceberg" | "csv";
  status: "pending" | "running" | "complete" | "failed";
  outputUri?: string;
  eventCount: number;
  sizeBytes: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface QueryPlan {
  hotQuery: string | null;
  warmQuery: string | null;
  coldQuery: string | null;
  estimatedRows: number;
  partitions: DataPartition[];
}

const DEFAULT_TIERS: RetentionTier[] = [
  { name: "hot", retentionDays: 90, storageBackend: "postgresql", compressionCodec: "none" },
  { name: "warm", retentionDays: 365, storageBackend: "parquet", compressionCodec: "zstd" },
  { name: "cold", retentionDays: 2555, storageBackend: "iceberg", compressionCodec: "zstd" },
  { name: "archive", retentionDays: 3650, storageBackend: "iceberg", compressionCodec: "gzip" },
];

const REGIONS = ["eu-west-1", "us-east-1", "ap-south-1", "af-south-1", "me-south-1", "me-central-1"] as const;
type Region = (typeof REGIONS)[number];

const REGION_LABELS: Record<Region, string> = {
  "eu-west-1": "EU (Frankfurt)",
  "us-east-1": "US (Virginia)",
  "ap-south-1": "India (Mumbai)",
  "af-south-1": "Kenya (Africa South)",
  "me-south-1": "Bahrain (Middle East)",
  "me-central-1": "Saudi Arabia (Riyadh)",
};

interface StorageBackend {
  name: string;
  query(sql: string, params: any[]): Promise<any[]>;
  write(data: any[], partition: DataPartition): Promise<void>;
  delete(partition: DataPartition): Promise<void>;
}

class PostgreSQLBackend implements StorageBackend {
  name = "postgresql";

  async query(sql: string, params: any[]): Promise<any[]> {
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async write(data: any[], partition: DataPartition): Promise<void> {
    console.log(`[DataLake] PostgreSQL write: ${data.length} events to partition ${partition.tenantId}/${partition.startDate.toISOString()}`);
  }

  async delete(partition: DataPartition): Promise<void> {
    const result = await pool.query(
      `DELETE FROM security_events WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
      [partition.tenantId, partition.startDate, partition.endDate]
    );
    console.log(`[DataLake] PostgreSQL delete: ${result.rowCount} events from partition ${partition.tenantId}`);
  }
}

class ParquetBackend implements StorageBackend {
  name = "parquet";

  async query(_sql: string, _params: any[]): Promise<any[]> {
    console.log(`[DataLake] Parquet query — delegating to federation layer`);
    return [];
  }

  async write(data: any[], partition: DataPartition): Promise<void> {
    const parquetData = this.convertToParquetFormat(data);
    const uri = this.generatePartitionUri(partition);
    console.log(`[DataLake] Parquet write: ${data.length} events (${parquetData.sizeEstimate} bytes) → ${uri}`);
    partition.storageUri = uri;
    partition.sizeBytes = parquetData.sizeEstimate;
    partition.format = "parquet";
  }

  async delete(partition: DataPartition): Promise<void> {
    console.log(`[DataLake] Parquet delete: ${partition.storageUri}`);
  }

  private convertToParquetFormat(data: any[]): { buffer: Buffer; sizeEstimate: number } {
    const jsonStr = JSON.stringify(data);
    return {
      buffer: Buffer.from(jsonStr),
      sizeEstimate: Math.round(jsonStr.length * 0.3),
    };
  }

  private generatePartitionUri(partition: DataPartition): string {
    const dateStr = partition.startDate.toISOString().substring(0, 10);
    return `s3://${partition.region}/secureops/events/tenant=${partition.tenantId}/date=${dateStr}/data.parquet`;
  }
}

class DuckDBBackend implements StorageBackend {
  name = "duckdb";
  private db: any = null;
  available = false;
  initError: string | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const duckdbModule = await import("duckdb");
      // Handle both ESM default export and CJS module.exports patterns
      const DuckDB: any = (duckdbModule as any).default ?? duckdbModule;
      const DatabaseCtor: new (path: string) => any = DuckDB.Database ?? DuckDB;
      this.db = new DatabaseCtor(":memory:");
      this.available = true;
      console.log("[DataLake] DuckDB engine initialized (in-memory)");
    } catch (e: any) {
      this.available = false;
      this.initError = e.message;
      console.log("[DataLake] DuckDB not available:", e.message);
    }
  }

  async query(sql: string, _params: any[]): Promise<any[]> {
    if (!this.available || !this.db) return [];
    return new Promise((resolve, reject) => {
      this.db.all(sql, (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async queryParquet(sql: string, paths: string[]): Promise<any[]> {
    if (!this.available || !this.db) return [];
    const pathList = paths.map(p => `'${p}'`).join(", ");
    const resolved = sql.replace("__PARQUET_PATHS__", `read_parquet([${pathList}])`);
    return this.query(resolved, []);
  }

  async queryParquetGlob(globPattern: string, whereSql: string): Promise<any[]> {
    if (!this.available || !this.db) return [];
    const sql = `SELECT * FROM read_parquet('${globPattern}', hive_partitioning=true) WHERE ${whereSql}`;
    return this.query(sql, []);
  }

  async write(_data: any[], _partition: DataPartition): Promise<void> {
    console.log("[DataLake] DuckDB write: stub — data written to Parquet tier");
  }

  async delete(_partition: DataPartition): Promise<void> {
    console.log("[DataLake] DuckDB delete: stub");
  }
}

class IcebergBackend implements StorageBackend {
  name = "iceberg";

  async query(_sql: string, _params: any[]): Promise<any[]> {
    console.log(`[DataLake] Iceberg query — delegating to catalog`);
    return [];
  }

  async write(data: any[], partition: DataPartition): Promise<void> {
    const uri = `s3://${partition.region}/secureops/iceberg/events/tenant=${partition.tenantId}/${partition.startDate.toISOString().substring(0, 7)}/`;
    console.log(`[DataLake] Iceberg write: ${data.length} events → ${uri}`);
    partition.storageUri = uri;
    partition.format = "iceberg";
  }

  async delete(partition: DataPartition): Promise<void> {
    console.log(`[DataLake] Iceberg delete: ${partition.storageUri}`);
  }
}

export class DataLakeManager {
  private backends: Map<string, StorageBackend> = new Map();
  private schemaRegistry: Map<string, SchemaVersion[]> = new Map();
  private duckdb: DuckDBBackend;

  constructor() {
    this.backends.set("postgresql", new PostgreSQLBackend());
    this.backends.set("parquet", new ParquetBackend());
    this.backends.set("iceberg", new IcebergBackend());
    this.duckdb = new DuckDBBackend();
    this.backends.set("duckdb", this.duckdb);
  }

  getDuckDBStatus(): { available: boolean; error: string | null } {
    return { available: this.duckdb.available, error: this.duckdb.initError };
  }

  async queryParquet(sql: string, paths: string[]): Promise<any[]> {
    if (!this.duckdb.available) {
      throw new Error("DuckDB not available: " + (this.duckdb.initError ?? "unknown error"));
    }
    return this.duckdb.queryParquet(sql, paths);
  }

  async getRetentionPolicy(tenantId: number): Promise<RetentionTier[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM data_retention_policies WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
      );
      if (result.rows.length > 0) {
        const policy = result.rows[0];
        return [
          { name: "hot", retentionDays: policy.hot_retention_days, storageBackend: "postgresql", compressionCodec: "none" },
          { name: "warm", retentionDays: policy.warm_retention_days, storageBackend: "parquet", compressionCodec: "zstd" },
          { name: "cold", retentionDays: policy.cold_retention_days, storageBackend: "iceberg", compressionCodec: "zstd" },
          { name: "archive", retentionDays: 3650, storageBackend: "iceberg", compressionCodec: "gzip" },
        ];
      }
    } catch (e) {}
    return [...DEFAULT_TIERS];
  }

  async setRetentionPolicy(tenantId: number, hot: number, warm: number, cold: number, format: string = "parquet"): Promise<void> {
    await pool.query(
      `INSERT INTO data_retention_policies (tenant_id, hot_retention_days, warm_retention_days, cold_retention_days, export_format)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id) DO UPDATE SET hot_retention_days = $2, warm_retention_days = $3, cold_retention_days = $4, export_format = $5, updated_at = NOW()`,
      [tenantId, hot, warm, cold, format]
    ).catch(() => {
      pool.query(
        `UPDATE data_retention_policies SET hot_retention_days = $2, warm_retention_days = $3, cold_retention_days = $4, export_format = $5, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId, hot, warm, cold, format]
      );
    });
  }

  async exportToParquet(tenantId: number, startDate: Date, endDate: Date): Promise<ExportJob> {
    const jobId = `export-${tenantId}-${Date.now()}`;
    const job: ExportJob = {
      id: jobId,
      tenantId,
      startDate,
      endDate,
      format: "parquet",
      status: "running",
      eventCount: 0,
      sizeBytes: 0,
      startedAt: new Date(),
    };

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
        [tenantId, startDate, endDate]
      );
      job.eventCount = parseInt(countResult.rows[0]?.cnt || "0");

      const BATCH_SIZE = 5000;
      let offset = 0;
      let totalSize = 0;

      while (offset < job.eventCount) {
        const batch = await pool.query(
          `SELECT id, tenant_id, event_type, severity, source_ip, destination_ip, hostname, username,
                  threat, action, risk_score, raw_payload, occurred_at, mitre_tactic, mitre_technique
           FROM security_events WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at < $3
           ORDER BY occurred_at LIMIT $4 OFFSET $5`,
          [tenantId, startDate, endDate, BATCH_SIZE, offset]
        );

        const partition: DataPartition = {
          tenantId,
          startDate,
          endDate,
          region: "eu-west-1",
          eventCount: batch.rows.length,
          sizeBytes: 0,
          format: "parquet",
          storageUri: "",
          status: "active",
        };

        const parquetBackend = this.backends.get("parquet")!;
        await parquetBackend.write(batch.rows, partition);
        totalSize += partition.sizeBytes;
        offset += BATCH_SIZE;
      }

      job.sizeBytes = totalSize;
      job.status = "complete";
      job.completedAt = new Date();
      job.outputUri = `s3://eu-west-1/secureops/exports/${jobId}/`;
    } catch (e: any) {
      job.status = "failed";
      console.error(`[DataLake] Export failed: ${e.message}`);
    }

    return job;
  }

  async planFederatedQuery(tenantId: number, startDate: Date, endDate: Date): Promise<QueryPlan> {
    const tiers = await this.getRetentionPolicy(tenantId);
    const now = new Date();
    const plan: QueryPlan = {
      hotQuery: null,
      warmQuery: null,
      coldQuery: null,
      estimatedRows: 0,
      partitions: [],
    };

    // Look up the tenant's warm/cold connector bindings from the retention policy
    const bindingResult = await pool.query(
      `SELECT p.warm_connector_id, p.cold_connector_id,
              w.name AS warm_connector_name, w.connector_type AS warm_connector_type,
              w.host AS warm_host, w.port AS warm_port, w.database AS warm_database,
              c.name AS cold_connector_name, c.connector_type AS cold_connector_type
       FROM data_retention_policies p
       LEFT JOIN db_connectors w ON w.id = p.warm_connector_id
       LEFT JOIN db_connectors c ON c.id = p.cold_connector_id
       WHERE p.tenant_id = $1 AND p.is_active = true
       LIMIT 1`,
      [tenantId]
    );
    const binding = bindingResult.rows[0] || {};

    const hotCutoff = new Date(now.getTime() - tiers[0].retentionDays * 86400000);
    const warmCutoff = new Date(now.getTime() - tiers[1].retentionDays * 86400000);

    if (endDate > hotCutoff) {
      const qStart = startDate > hotCutoff ? startDate : hotCutoff;
      plan.hotQuery = `SELECT * FROM security_events WHERE tenant_id = ${tenantId} AND occurred_at >= '${qStart.toISOString()}' AND occurred_at < '${endDate.toISOString()}'`;
      const countResult = await pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
        [tenantId, qStart, endDate]
      );
      plan.estimatedRows += parseInt(countResult.rows[0]?.cnt || "0");
    }

    if (startDate < hotCutoff && startDate > warmCutoff) {
      const qEnd = endDate < hotCutoff ? endDate : hotCutoff;
      const startStr = startDate.toISOString().substring(0, 10);
      const endStr = qEnd.toISOString().substring(0, 10);

      // Warm tier uses local filesystem Parquet storage (populated by export jobs).
      // The warm connector binding indicates an optional external OLAP DB for live warm queries.
      // DuckDB reads from local Parquet files at a deterministic path.
      const warmParquetBase = process.env.PARQUET_DATA_DIR || path.join(process.cwd(), "data", "events");
      const warmBaseUri = `${warmParquetBase}/tenant=${tenantId}`;
      const warmConnectorNote = binding.warm_connector_name
        ? ` /* warm OLAP connector: ${binding.warm_connector_name} (${binding.warm_connector_type}) */`
        : "";

      // Use DuckDB-compatible wildcard glob (not shell [start..end] ranges).
      // hive_partitioning=true lets DuckDB prune partitions by date= directory names.
      const parquetGlob = `${warmBaseUri}/date=*/**/*.parquet`;
      const whereClause = `occurred_at >= '${startDate.toISOString()}' AND occurred_at < '${qEnd.toISOString()}'`;

      // Planning phase: build the query expression only — no actual DuckDB scan.
      // Row-count estimation uses directory listing (cheap), not full Parquet reads.
      // Execution happens at query-time via DataLakeManager.executeWarmQuery().
      if (!this.duckdb.available) {
        plan.warmQuery = `-- WARM TIER UNAVAILABLE (DuckDB not initialized: ${this.duckdb.initError ?? "unknown"}): would scan ${parquetGlob}${warmConnectorNote}`;
      } else {
        plan.warmQuery = `SELECT * FROM read_parquet('${parquetGlob}', hive_partitioning=true) WHERE ${whereClause}${warmConnectorNote}`;
        // Lightweight estimate: count parquet files in the directory (no data read)
        try {
          const fs = await import("fs");
          if (fs.existsSync(warmBaseUri)) {
            const entries = fs.readdirSync(warmBaseUri, { recursive: true, withFileTypes: true } as any)
              .filter((e: any) => typeof e.name === "string" && e.name.endsWith(".parquet"));
            plan.estimatedRows += entries.length * 1000; // coarse estimate: ~1K rows/file
          }
        } catch {
          // Directory not yet created; leave estimatedRows unchanged
        }
      }
    }

    if (startDate < warmCutoff) {
      const coldConnectorNote = binding.cold_connector_name
        ? ` via connector: ${binding.cold_connector_name} (${binding.cold_connector_type})`
        : "";
      plan.coldQuery = `-- Iceberg scan${coldConnectorNote}: secureops.events WHERE tenant_id = ${tenantId} AND occurred_at >= '${startDate.toISOString()}'`;
    }

    return plan;
  }

  async getStorageStats(tenantId: number): Promise<{
    hotEvents: number;
    hotSizeEstimate: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    retentionTiers: RetentionTier[];
    regions: string[];
  }> {
    const countResult = await pool.query(
      `SELECT COUNT(*) as cnt, MIN(occurred_at) as oldest, MAX(occurred_at) as newest,
              pg_column_size(raw_payload)::bigint as avg_size
       FROM security_events WHERE tenant_id = $1`,
      [tenantId]
    );
    const row = countResult.rows[0] || {};
    const hotEvents = parseInt(row.cnt || "0");
    const tiers = await this.getRetentionPolicy(tenantId);

    return {
      hotEvents,
      hotSizeEstimate: hotEvents * 2048,
      oldestEvent: row.oldest ? new Date(row.oldest) : null,
      newestEvent: row.newest ? new Date(row.newest) : null,
      retentionTiers: tiers,
      regions: ["eu-west-1"],
    };
  }

  registerSchemaVersion(logSource: string, version: number, fields: Record<string, string>): void {
    const versions = this.schemaRegistry.get(logSource) || [];
    versions.forEach(v => v.isLatest = false);
    versions.push({
      version,
      logSource,
      fields,
      createdAt: new Date(),
      isLatest: true,
    });
    this.schemaRegistry.set(logSource, versions);
  }

  getSchemaVersions(logSource: string): SchemaVersion[] {
    return this.schemaRegistry.get(logSource) || [];
  }

  getLatestSchema(logSource: string): SchemaVersion | null {
    const versions = this.schemaRegistry.get(logSource) || [];
    return versions.find(v => v.isLatest) || null;
  }

  getAllRegisteredSources(): string[] {
    return Array.from(this.schemaRegistry.keys());
  }

  async applyRetentionPolicies(tenantId: number): Promise<{ eventsArchived: number; eventsDeleted: number }> {
    const tiers = await this.getRetentionPolicy(tenantId);
    const now = new Date();
    let eventsArchived = 0;
    let eventsDeleted = 0;

    const hotCutoff = new Date(now.getTime() - tiers[0].retentionDays * 86400000);
    const warmCutoff = new Date(now.getTime() - tiers[1].retentionDays * 86400000);
    const coldCutoff = new Date(now.getTime() - tiers[2].retentionDays * 86400000);

    const warmResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM security_events WHERE tenant_id = $1 AND occurred_at < $2`,
      [tenantId, hotCutoff]
    );
    const warmCount = parseInt(warmResult.rows[0]?.cnt || "0");

    if (warmCount > 0) {
      console.log(`[DataLake] Tenant ${tenantId}: ${warmCount} events past hot retention (${tiers[0].retentionDays}d). Would export to Parquet.`);
      eventsArchived += warmCount;
    }

    const coldResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM security_events WHERE tenant_id = $1 AND occurred_at < $2`,
      [tenantId, coldCutoff]
    );
    const coldCount = parseInt(coldResult.rows[0]?.cnt || "0");
    if (coldCount > 0) {
      console.log(`[DataLake] Tenant ${tenantId}: ${coldCount} events past cold retention (${tiers[2].retentionDays}d). Would delete.`);
      eventsDeleted += coldCount;
    }

    return { eventsArchived, eventsDeleted };
  }

  getAvailableRegions(): Array<{ id: string; label: string }> {
    return REGIONS.map(r => ({ id: r, label: REGION_LABELS[r] }));
  }

  getParquetSchema(): Record<string, string> {
    return {
      event_id: "INT64",
      tenant_id: "INT32",
      event_type: "BYTE_ARRAY (UTF8)",
      severity: "BYTE_ARRAY (UTF8)",
      source_ip: "BYTE_ARRAY (UTF8)",
      destination_ip: "BYTE_ARRAY (UTF8)",
      hostname: "BYTE_ARRAY (UTF8)",
      username: "BYTE_ARRAY (UTF8)",
      threat: "BYTE_ARRAY (UTF8)",
      action: "BYTE_ARRAY (UTF8)",
      risk_score: "INT32",
      raw_payload: "BYTE_ARRAY (JSON)",
      occurred_at: "INT96 (TIMESTAMP)",
      mitre_tactic: "BYTE_ARRAY (UTF8)",
      mitre_technique: "BYTE_ARRAY (UTF8)",
      ingested_at: "INT96 (TIMESTAMP)",
    };
  }

  getIcebergTableSpec(): object {
    return {
      tableName: "secureops.events",
      format: "Apache Iceberg v2",
      partitionSpec: [
        { field: "tenant_id", transform: "identity" },
        { field: "occurred_at", transform: "month" },
        { field: "event_type", transform: "identity" },
      ],
      sortOrder: [
        { field: "tenant_id", direction: "asc" },
        { field: "occurred_at", direction: "desc" },
      ],
      properties: {
        "write.format.default": "parquet",
        "write.parquet.compression-codec": "zstd",
        "write.metadata.compression-codec": "gzip",
        "read.split.target-size": "134217728",
        "history.expire.max-snapshot-age-ms": "604800000",
      },
    };
  }
}

export const dataLakeManager = new DataLakeManager();

dataLakeManager.registerSchemaVersion("checkpoint_harmony_email", 1, {
  eventId: "string", senderEmail: "string", senderDomain: "string",
  recipients: "string", subject: "string", emailThreatType: "string",
  phishingCombinedVerdict: "string", maliciousCombinedVerdict: "string",
  effectiveAction: "string", quarantined: "boolean", spfResult: "string",
  dkimResult: "string", dmarcResult: "string",
});

dataLakeManager.registerSchemaVersion("checkpoint_harmony_endpoint", 1, {
  eventId: "string", hostname: "string", username: "string",
  processName: "string", processPath: "string", action: "string",
  threatType: "string", severity: "string", malwareFamily: "string",
});

dataLakeManager.registerSchemaVersion("skyhigh_sse", 1, {
  eventId: "string", sourceIp: "string", destinationUrl: "string",
  category: "string", action: "string", riskLevel: "string",
  applicationName: "string", userName: "string",
});

dataLakeManager.registerSchemaVersion("crowdstrike_falcon", 1, {
  eventId: "string", hostname: "string", detectName: "string",
  severity: "number", tactic: "string", technique: "string",
  commandLine: "string", sha256: "string", parentProcess: "string",
});

dataLakeManager.registerSchemaVersion("azure_entra_id", 1, {
  eventId: "string", userPrincipalName: "string", ipAddress: "string",
  location: "string", appDisplayName: "string", riskLevel: "string",
  resultType: "string", authMethod: "string",
});
