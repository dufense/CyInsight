import { createGzip } from "zlib";
import { randomBytes } from "crypto";
import { Readable } from "stream";

export interface RetentionConfig {
  hotDays: number;
  warmDays: number;
  coldDays: number;
}

export interface RetentionStats {
  hotEvents: number;
  warmCandidates: number;
  coldCandidates: number;
  deleteCandidates: number;
  lastRunAt: string | null;
  archivedToS3?: number;
}

/**
 * Minimal subset of CloudStorageService used by RetentionManager.
 * Keeping the interface narrow allows easy testing/mocking and avoids a
 * hard compile-time import of the server-side cloud-storage module.
 */
export interface ICloudStorageUploader {
  upload(
    bucket: string,
    key: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string }>;

  /** Streaming upload — preferred for large objects.  Falls back to upload() if absent. */
  uploadStream?(
    bucket: string,
    key: string,
    stream: import("stream").Readable,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string }>;
}

export interface ArchiveStorageConfig {
  bucket: string;
  /** Optional: override for the bucket name read from the uploader's default. */
  bucketOverride?: string;
}

const DEFAULT_CONFIG: RetentionConfig = {
  hotDays: 90,
  warmDays: 365,
  coldDays: 2555,
};

/** Maximum events exported per S3 archival run to avoid memory pressure. */
const MAX_ARCHIVE_BATCH = 10_000;

export class RetentionManager {
  private pool: any;
  private config: RetentionConfig;
  private storageUploader: ICloudStorageUploader | null;
  private archiveBucket: string | null;
  private lastRunAt: Date | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * @param pool          pg-pool connection pool
   * @param config        Hot/warm/cold retention thresholds (days)
   * @param uploader      CloudStorageService instance (or compatible uploader).
   *                      When null, S3 archival is skipped but tier-counting
   *                      still runs.
   * @param archiveBucket Target bucket name for cold-tier NDJSON.gz exports.
   *                      Falls back to the S3_ARCHIVE_BUCKET env var or the
   *                      uploader's own default bucket if not specified.
   */
  constructor(
    pool: any,
    config?: Partial<RetentionConfig>,
    uploader?: ICloudStorageUploader | null,
    archiveBucket?: string,
  ) {
    this.pool = pool;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storageUploader = uploader ?? null;
    this.archiveBucket =
      archiveBucket ??
      process.env.S3_ARCHIVE_BUCKET ??
      null;
  }

  startSchedule(intervalHours: number = 24): void {
    if (this.intervalHandle) return;
    console.log(`[RetentionManager] Starting retention schedule every ${intervalHours}h`);
    this.intervalHandle = setInterval(() => {
      this.runRetention().catch(err => {
        console.error(`[RetentionManager] Scheduled retention failed: ${err.message}`);
      });
    }, intervalHours * 60 * 60 * 1000);
  }

  stopSchedule(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Attach or replace the cloud storage uploader after construction.
   * Used by the storage service to wire in the uploader once it is
   * asynchronously initialised without requiring a class cast.
   */
  setUploader(uploader: ICloudStorageUploader): void {
    this.storageUploader = uploader;
  }

  async runRetention(): Promise<RetentionStats> {
    console.log("[RetentionManager] Running retention lifecycle...");

    const now = new Date();
    const hotCutoff = new Date(now.getTime() - this.config.hotDays * 86400000);
    const warmCutoff = new Date(now.getTime() - this.config.warmDays * 86400000);
    const coldCutoff = new Date(now.getTime() - this.config.coldDays * 86400000);

    let hotEvents = 0;
    let warmCandidates = 0;
    let coldCandidates = 0;
    let deleteCandidates = 0;
    let archivedToS3 = 0;

    try {
      const hotResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at >= $1`,
        [hotCutoff]
      );
      hotEvents = parseInt(hotResult.rows[0]?.cnt || "0");

      const warmResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1 AND occurred_at >= $2`,
        [hotCutoff, warmCutoff]
      );
      warmCandidates = parseInt(warmResult.rows[0]?.cnt || "0");

      const coldResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1 AND occurred_at >= $2`,
        [warmCutoff, coldCutoff]
      );
      coldCandidates = parseInt(coldResult.rows[0]?.cnt || "0");

      const deleteResult = await this.pool.query(
        `SELECT COUNT(*) as cnt FROM security_events WHERE occurred_at < $1`,
        [coldCutoff]
      );
      deleteCandidates = parseInt(deleteResult.rows[0]?.cnt || "0");

      // Archive all events older than the hot boundary (warm + cold + delete bands).
      const archiveCandidates = warmCandidates + coldCandidates + deleteCandidates;
      if (archiveCandidates > 0) {
        console.log(`[RetentionManager] ${archiveCandidates} events past hot tier (${this.config.hotDays}d) — candidates for S3 archive`);
      }

      if (this.storageUploader && this.archiveBucket && archiveCandidates > 0) {
        archivedToS3 = await this.archiveWarmEvents(hotCutoff, warmCutoff);
      }

      if (deleteCandidates > 0) {
        console.log(`[RetentionManager] ${deleteCandidates} events past cold tier (${this.config.coldDays}d) — candidates for deletion`);
      }
    } catch (err: any) {
      console.error(`[RetentionManager] Retention analysis error: ${err.message}`);
    }

    this.lastRunAt = now;

    return {
      hotEvents,
      warmCandidates,
      coldCandidates,
      deleteCandidates,
      archivedToS3,
      lastRunAt: now.toISOString(),
    };
  }

  /**
   * Export ALL events older than hotCutoff to cold-tier cloud storage as
   * gzip-compressed NDJSON, partitioned by year/month/tenantId.
   *
   * "Older than hot-tier" means occurred_at < hotCutoff (the 90-day boundary).
   * There is no lower bound — events from any age are archived, not just the
   * 90–365 day "warm" band.  This satisfies the requirement: move everything
   * outside the hot-store window to cold storage, then delete from PG.
   *
   * Uses the injected CloudStorageService uploader so the archive destination
   * is abstracted (S3, Azure Blob, GCS, MinIO) and the same credentials that
   * power the rest of the platform are reused.
   *
   * Archive path: year=YYYY/month=MM/tenant_id=<id>/events.ndjson.gz
   */
  private async archiveWarmEvents(
    hotCutoff: Date,
    _warmCutoff: Date,  // retained for signature compat; not used as lower bound
  ): Promise<number> {
    if (!this.storageUploader || !this.archiveBucket) return 0;

    console.log("[RetentionManager] Starting cloud-storage archival of events older than hot-tier...");
    let totalArchived = 0;

    try {
      // Respect HOT_RETENTION_DAYS env override; take the more conservative cutoff.
      const archiveEnvDays = parseInt(process.env.HOT_RETENTION_DAYS || "90", 10);
      const effectiveCutoff = new Date(Date.now() - archiveEnvDays * 86400000);
      // Use the later of the two boundaries (smaller window = safer default).
      const cutoff = effectiveCutoff > hotCutoff ? effectiveCutoff : hotCutoff;

      // Enumerate ALL year/month/tenant partitions that have events before the
      // cutoff.  We page through partitions in batches of 500 so a single run
      // can drain an arbitrarily large backlog without missing anything.
      const PARTITION_PAGE = 500;
      let partitionOffset = 0;
      let allPartitions: Array<{ tenant_id: number; yr: number; mo: number }> = [];
      while (true) {
        const page = await this.pool.query(
          `SELECT DISTINCT
             tenant_id,
             EXTRACT(YEAR FROM occurred_at)::int  AS yr,
             EXTRACT(MONTH FROM occurred_at)::int AS mo
           FROM security_events
           WHERE occurred_at < $1
           ORDER BY tenant_id, yr, mo
           LIMIT $2 OFFSET $3`,
          [cutoff, PARTITION_PAGE, partitionOffset],
        );
        allPartitions = allPartitions.concat(page.rows);
        if (page.rows.length < PARTITION_PAGE) break;  // last page
        partitionOffset += PARTITION_PAGE;
      }

      // Unique run identifier: ISO timestamp + 8-char hex token.
      // Ensures each run creates immutable S3 objects and never overwrites a
      // previous archive, even for the same partition.
      const runTs = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
      const runId  = randomBytes(4).toString("hex");

      // Manifest: list of all objects written in this run.  Committed to S3
      // after all partitions succeed — deletes from PG only happen after the
      // manifest is uploaded (atomic checkpoint).
      type ManifestEntry = {
        key: string;
        rowCount: number;
        tenantId: number;
        yr: number;
        mo: number;
        archivedAt: string;
      };
      const manifest: ManifestEntry[] = [];
      // Track which PG row IDs to delete per partition key (post-manifest).
      const pendingDeletes: Map<string, number[]> = new Map();

      for (const part of allPartitions as Array<{ tenant_id: number; yr: number; mo: number }>) {
        const { tenant_id, yr, mo } = part;
        const monthStart = new Date(yr, mo - 1, 1);
        const monthEnd = new Date(yr, mo, 1);
        const paddedMo = String(mo).padStart(2, "0");

        // Immutable key: every run gets a unique timestamped object.
        // Athena's external table uses LOCATION over the parent prefix so all
        // run objects are automatically included in queries.
        // Pattern: year=YYYY/month=MM/tenant_id=<id>/events-<runTs>-<runId>.ndjson.gz
        // The partition key is `tenant_id` (not `tenant`) so that Glue/Athena
        // partition projection and the forensic-query Athena table are aligned.
        const objectKey =
          `year=${yr}/month=${paddedMo}/tenant_id=${tenant_id}/events-${runTs}-${runId}.ndjson.gz`;

        // Page through all events in the partition using keyset pagination.
        let lastId: number = 0;
        let partitionRows: Array<Record<string, unknown>> = [];

        while (true) {
          const eventsResult = await this.pool.query(
            `SELECT
               id, tenant_id, event_type, severity, threat, target, attacker,
               asset, source_type, log_source, mitre_tactic, mitre_technique,
               confidence_score, raw_payload, sigma_matches, occurred_at,
               stored_at, event_hash
             FROM security_events
             WHERE tenant_id = $1
               AND occurred_at >= $2
               AND occurred_at < $3
               AND occurred_at < $4
               AND id > $5
             ORDER BY id
             LIMIT $6`,
            [tenant_id, monthStart, monthEnd, cutoff, lastId, MAX_ARCHIVE_BATCH],
          );

          if (eventsResult.rows.length === 0) break;
          partitionRows = partitionRows.concat(eventsResult.rows);
          lastId = (eventsResult.rows[eventsResult.rows.length - 1] as { id: number }).id;
          if (eventsResult.rows.length < MAX_ARCHIVE_BATCH) break;
        }

        if (partitionRows.length === 0) continue;

        const archivedAt = new Date().toISOString();
        const uploadMeta: Record<string, string> = {
          tenant_id:        String(tenant_id),
          year:             String(yr),
          month:            paddedMo,
          run_id:           runId,
          row_count:        String(partitionRows.length),
          archived_at:      archivedAt,
          content_type:     "application/x-ndjson",
          content_encoding: "gzip",
        };

        if (typeof this.storageUploader!.uploadStream === "function") {
          const ndjsonLines = partitionRows.map((r: Record<string, unknown>) => JSON.stringify(r));
          const src = Readable.from(ndjsonLines.join("\n"));
          const gz = createGzip({ level: 6 });
          src.pipe(gz);
          await this.storageUploader!.uploadStream!(
            this.archiveBucket!,
            objectKey,
            gz,
            uploadMeta,
          );
        } else {
          const ndjson = partitionRows
            .map((r: Record<string, unknown>) => JSON.stringify(r))
            .join("\n");
          const gzippedBuffer = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            const gz = createGzip({ level: 6 });
            const src = Readable.from(ndjson);
            src.pipe(gz);
            gz.on("data", (chunk: Buffer) => chunks.push(chunk));
            gz.on("end", () => resolve(Buffer.concat(chunks)));
            gz.on("error", reject);
            src.on("error", reject);
          });
          await this.storageUploader!.upload(
            this.archiveBucket!,
            objectKey,
            gzippedBuffer,
            uploadMeta,
          );
        }

        // Stage for deletion — actual delete happens after manifest commit.
        const ids = (partitionRows as Array<{ id: number }>).map(r => r.id);
        pendingDeletes.set(objectKey, ids);
        manifest.push({ key: objectKey, rowCount: partitionRows.length, tenantId: tenant_id, yr, mo, archivedAt });

        totalArchived += partitionRows.length;
        console.log(`[RetentionManager] Staged ${partitionRows.length} events → ${this.archiveBucket}/${objectKey} (tenant_id=${tenant_id} ${yr}/${paddedMo})`);
      }

      if (manifest.length === 0) {
        console.log("[RetentionManager] No events to archive.");
      } else {
        const manifestKey = `_manifests/run-${runTs}-${runId}.json`;
        await this.storageUploader!.upload(
          this.archiveBucket!,
          manifestKey,
          Buffer.from(JSON.stringify({ runId, runTs, objects: manifest }, null, 2)),
          { content_type: "application/json", row_count: String(totalArchived) },
        );
        console.log(`[RetentionManager] Manifest committed → ${this.archiveBucket}/${manifestKey} (${manifest.length} partitions, ${totalArchived} rows)`);

        for (const [objKey, ids] of pendingDeletes) {
          for (let i = 0; i < ids.length; i += 1000) {
            const batch = ids.slice(i, i + 1000);
            const placeholders = batch.map((_: unknown, j: number) => `$${j + 1}`).join(",");
            await this.pool.query(
              `DELETE FROM security_events WHERE id IN (${placeholders})`,
              batch,
            );
          }
          console.log(`[RetentionManager] Deleted ${ids.length} rows from PG for ${objKey}`);
        }
      }
    } catch (err: any) {
      console.error(`[RetentionManager] Cloud-storage archival error: ${err.message}`);
    }

    console.log(`[RetentionManager] Cloud-storage archival complete — ${totalArchived} events exported.`);
    return totalArchived;
  }

  async getStats(): Promise<RetentionStats> {
    return this.runRetention();
  }

  getConfig(): RetentionConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[RetentionManager] Config updated: hot=${this.config.hotDays}d, warm=${this.config.warmDays}d, cold=${this.config.coldDays}d`);
  }
}
