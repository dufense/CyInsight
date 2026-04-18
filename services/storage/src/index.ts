import express from "express";
import { Pool } from "pg";
import { EventWriter, type EventRecord } from "./event-writer";
import { IncidentGenerator } from "./incident-generator";
import { ClickHouseIndexer } from "./clickhouse-indexer";
import { RetentionManager, type ICloudStorageUploader } from "./retention";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "storage";
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

// ClickHouse is the single source of truth for security events.
const CLICKHOUSE_URL      = process.env.CLICKHOUSE_URL      || "";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "ccc";
const CLICKHOUSE_TABLE    = process.env.CLICKHOUSE_TABLE    || "security_events";
const CLICKHOUSE_USER     = process.env.CLICKHOUSE_USER     || "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || "";

// Backpressure: pause Kafka consumer when PG write latency is too high
const WRITE_LATENCY_PAUSE_THRESHOLD = parseInt(
  process.env.BACKPRESSURE_LATENCY_MS || process.env.WRITE_LATENCY_PAUSE_THRESHOLD || "5000", 10,
);

// Kafka concurrency and batch sizing for high-throughput ingestion
const KAFKA_CONCURRENCY  = parseInt(process.env.KAFKA_CONCURRENCY  || "10", 10);
const KAFKA_BATCH_SIZE   = parseInt(process.env.KAFKA_BATCH_SIZE    || "500", 10);

app.use(express.json({ limit: "50mb" }));

const startTime = Date.now();
let eventsStored       = 0;
let incidentsGenerated = 0;
let errorsCount        = 0;
let consumerPaused     = false;

// PostgreSQL pool — OLTP (tenants, incidents, metadata)
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || "30", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
});

const eventWriter      = new EventWriter(pool);
const incidentGenerator = new IncidentGenerator(pool);

// ClickHouse indexer — OLAP SSOT for security events
const clickHouseIndexer = new ClickHouseIndexer({
  url:      CLICKHOUSE_URL,
  database: CLICKHOUSE_DATABASE,
  table:    CLICKHOUSE_TABLE,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  batchSize: parseInt(process.env.CH_BATCH_SIZE || "2000", 10),
});

// ── Cloud storage uploader for cold-tier archival ─────────────────────────────
interface CloudStorageModule {
  CloudStorageService: new () => ICloudStorageUploader & { getProvider(): string };
}

async function buildRetentionUploader(): Promise<ICloudStorageUploader | null> {
  const archiveBucket = process.env.S3_ARCHIVE_BUCKET;
  const provider = process.env.CLOUD_STORAGE_PROVIDER || (process.env.AWS_ACCESS_KEY_ID ? "s3" : null);
  if (!archiveBucket || !provider) return null;
  try {
    const { CloudStorageService } = await import("../../../server/cloud-storage") as unknown as CloudStorageModule;
    const svc = new CloudStorageService();
    if (!svc.getProvider() || svc.getProvider() === "none") return null;
    console.log(`[RetentionManager] Cloud storage uploader ready (provider=${svc.getProvider()}, bucket=${archiveBucket})`);
    return svc;
  } catch {
    return null;
  }
}

const retentionManager = new RetentionManager(pool, {
  hotDays:  parseInt(process.env.HOT_RETENTION_DAYS  || process.env.RETENTION_HOT_DAYS  || "90",   10),
  warmDays: parseInt(process.env.RETENTION_WARM_DAYS || "365",  10),
  coldDays: parseInt(process.env.RETENTION_COLD_DAYS || "2555", 10),
},
  null,
  process.env.S3_ARCHIVE_BUCKET,
);

buildRetentionUploader().then(uploader => {
  if (uploader) {
    retentionManager.setUploader(uploader);
    console.log("[RetentionManager] Uploader attached — S3 cold-tier archival enabled");
  }
}).catch(() => {/* non-fatal */});

let kafkaConsumer: any = null;

// ── Event processing ──────────────────────────────────────────────────────────

function parseEventPayload(payload: any): EventRecord {
  return {
    tenantId:           payload.tenantId            || payload.tenant_id       || 0,
    eventType:          payload.eventType            || payload.event_type      || "endpoint",
    severity:           payload.severity             || "medium",
    threat:             payload.threat               || null,
    target:             payload.target               || null,
    attacker:           payload.attacker             || payload.sourceIp        || null,
    asset:              payload.asset                || payload.hostname        || null,
    app:                payload.app                  || null,
    description:        payload.description          || null,
    threatVector:       payload.threatVector         || null,
    mitreTactic:        payload.mitreTactic          || payload.mitre_tactic    || null,
    mitreTechnique:     payload.mitreTechnique       || payload.mitre_technique || null,
    action:             payload.action               || null,
    sourceType:         payload.sourceType           || payload.source_type     || null,
    logSource:          payload.logSource            || payload.log_source      || null,
    sender:             payload.sender               || null,
    recipient:          payload.recipient            || null,
    protocol:           payload.protocol             || null,
    country:            payload.country              || null,
    riskScore:          payload.riskScore            || payload.risk_score      || null,
    rawPayload:         payload.rawPayload           || payload.raw_payload     || payload,
    sigmaMatches:       payload.sigmaMatches         || payload.sigma_matches   || null,
    enrichedDescription: payload.enrichedDescription || null,
    occurredAt:         payload.occurredAt           || payload.occurred_at     || new Date().toISOString(),
    normalizedAt:       payload.normalizedAt         || null,
    enrichedAt:         payload.enrichedAt           || null,
    correlatedAt:       payload.correlatedAt         || null,
    // Enriched columns for ClickHouse
    host:               payload.host                 || payload.asset           || payload.hostname || null,
    srcIp:              payload.srcIp                || payload.src_ip          || payload.attacker || null,
    dstIp:              payload.dstIp                || payload.dst_ip          || payload.target   || null,
    userName:           payload.userName             || payload.user_name       || null,
    processName:        payload.processName          || payload.process_name    || null,
    killChainPhase:     payload.killChainPhase       || payload.kill_chain_phase|| null,
    confidenceScore:    payload.confidenceScore      || payload.confidence_score|| null,
    dataRegion:         payload.dataRegion           || payload.data_region     || null,
    normalizedEvent:    payload.normalizedEvent      || payload.normalized_event|| null,
    iocs:               payload.iocs                 || payload.sigma_matches   || null,
  } as EventRecord;
}

async function processAlertBatch(messages: any[]): Promise<void> {
  const events: EventRecord[] = [];

  for (const msg of messages) {
    try {
      const payload = msg.value?.payload || msg.value;
      if (!payload) continue;
      events.push(parseEventPayload(payload));
    } catch (err: any) {
      errorsCount++;
      console.error(`[${SERVICE_NAME}] Failed to parse event: ${err.message}`);
    }
  }

  if (events.length === 0) return;

  // 1. Write to PostgreSQL (OLTP) — primary of record for management plane
  const writeResult = await eventWriter.writeBatch(events);
  eventsStored += writeResult.inserted;

  // 2. Backpressure: pause consumer when PG writes are slow
  if (eventWriter.getWriteLatency() > WRITE_LATENCY_PAUSE_THRESHOLD && !consumerPaused) {
    console.warn(`[${SERVICE_NAME}] Write latency ${eventWriter.getWriteLatency()}ms — pausing consumer`);
    consumerPaused = true;
    if (kafkaConsumer) await kafkaConsumer.pause?.();
    setTimeout(async () => {
      consumerPaused = false;
      if (kafkaConsumer) {
        await kafkaConsumer.resume?.();
        console.log(`[${SERVICE_NAME}] Consumer resumed after backpressure cooldown`);
      }
    }, 10_000);
  }

  // 3. Generate incidents from events (PG-backed)
  const incidents = await incidentGenerator.generateFromEvents(events);
  incidentsGenerated += incidents.length;

  // 4. Index to ClickHouse (SSOT OLAP) — non-fatal if unavailable
  if (clickHouseIndexer.isConnected()) {
    const chResult = await clickHouseIndexer.indexBatch(events);
    if (chResult.errors > 0) {
      console.warn(`[${SERVICE_NAME}] ClickHouse indexed ${chResult.indexed}/${events.length} (${chResult.errors} errors)`);
    }
  }
}

// ── Kafka consumer ────────────────────────────────────────────────────────────

async function startKafkaConsumer(): Promise<void> {
  if (!KAFKA_BROKERS) {
    console.log(`[${SERVICE_NAME}] No KAFKA_BROKERS configured, running in API-only mode`);
    return;
  }

  try {
    const { KafkaConsumerGroup } = await import("../../server/kafka/consumer");
    const { KAFKA_TOPICS } = await import("../../server/kafka/topics");

    kafkaConsumer = new KafkaConsumerGroup({
      groupId:       "secureops-storage-service",
      topics:        [KAFKA_TOPICS.ALERTS],
      batchSize:     KAFKA_BATCH_SIZE,
      concurrency:   KAFKA_CONCURRENCY,
      fromBeginning: false,
    });

    const started = await kafkaConsumer.start(processAlertBatch);
    if (started) {
      console.log(`[${SERVICE_NAME}] Kafka consumer started — batchSize=${KAFKA_BATCH_SIZE} concurrency=${KAFKA_CONCURRENCY}`);
    } else {
      console.log(`[${SERVICE_NAME}] Kafka consumer failed to start, API-only mode`);
    }
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] Kafka consumer init failed: ${err.message}`);
  }
}

// ── HTTP API ──────────────────────────────────────────────────────────────────

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("/health", (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  res.json({
    status: "healthy",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: uptimeSeconds,
    stats: {
      eventsStored,
      incidentsGenerated,
      errorsCount,
      consumerPaused,
      eventWriter: eventWriter.getStats(),
      incidentGenerator: incidentGenerator.getStats(),
      clickHouse: clickHouseIndexer.getStats(),
    },
  });
});

app.get("/metrics", (_req, res) => {
  res.json({
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    metrics: {
      eventsStored,
      incidentsGenerated,
      errorsCount,
      consumerPaused,
      writeLatencyMs: eventWriter.getWriteLatency(),
      eventWriter: eventWriter.getStats(),
      incidentGenerator: incidentGenerator.getStats(),
      clickHouse: clickHouseIndexer.getStats(),
    },
  });
});

app.get("/clickhouse/stats", (_req, res) => {
  res.json(clickHouseIndexer.getStats());
});

app.post("/store", async (req, res) => {
  try {
    const events: EventRecord[] = (Array.isArray(req.body) ? req.body : [req.body])
      .map(parseEventPayload);
    const writeResult = await eventWriter.writeBatch(events);
    eventsStored += writeResult.inserted;

    const incidents = await incidentGenerator.generateFromEvents(events);
    incidentsGenerated += incidents.length;

    // Fire-and-forget ClickHouse write
    if (clickHouseIndexer.isConnected()) {
      clickHouseIndexer.indexBatch(events).catch((err: Error) =>
        console.warn(`[${SERVICE_NAME}] ClickHouse /store write: ${err.message}`),
      );
    }

    res.json({
      success: true,
      stored: writeResult.inserted,
      duplicates: writeResult.duplicates,
      errors: writeResult.errors,
      incidentsGenerated: incidents.length,
    });
  } catch (err: any) {
    errorsCount++;
    res.status(500).json({ error: err.message });
  }
});

app.get("/retention", async (_req, res) => {
  try {
    const stats = await retentionManager.getStats();
    res.json({ config: retentionManager.getConfig(), stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/retention/run", async (_req, res) => {
  try {
    const stats = await retentionManager.runRetention();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/retention/config", (req, res) => {
  retentionManager.updateConfig(req.body);
  res.json({ success: true, config: retentionManager.getConfig() });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function startup() {
  console.log(`[${SERVICE_NAME}] Starting storage microservice (ClickHouse SSOT mode)...`);

  try {
    await pool.query("SELECT 1");
    console.log(`[${SERVICE_NAME}] PostgreSQL connection verified`);
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] PostgreSQL connection failed: ${err.message}`);
  }

  const chConnected = await clickHouseIndexer.connect();
  if (chConnected) {
    console.log(`[${SERVICE_NAME}] ClickHouse indexer ready — events will be dual-written`);
  } else {
    console.warn(`[${SERVICE_NAME}] ClickHouse not available — PG-only mode (set CLICKHOUSE_URL + CLICKHOUSE_PASSWORD)`);
  }

  await startKafkaConsumer();
  retentionManager.startSchedule(24);
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  startup().catch(err => {
    console.error(`[${SERVICE_NAME}] Startup error: ${err.message}`);
  });
});

process.on("SIGTERM", async () => {
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down gracefully...`);
  retentionManager.stopSchedule();
  if (kafkaConsumer) await kafkaConsumer.stop?.();
  await pool.end();
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down gracefully...`);
  retentionManager.stopSchedule();
  if (kafkaConsumer) await kafkaConsumer.stop?.();
  await pool.end();
  server.close(() => process.exit(0));
});
