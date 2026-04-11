import express from "express";
import { Pool } from "pg";
import { EventWriter, type EventRecord } from "./event-writer";
import { IncidentGenerator } from "./incident-generator";
import { OpenSearchIndexer } from "./opensearch-indexer";
import { RetentionManager } from "./retention";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "storage";
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || "";
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || "secureops-events";
const WRITE_LATENCY_PAUSE_THRESHOLD = parseInt(process.env.BACKPRESSURE_LATENCY_MS || process.env.WRITE_LATENCY_PAUSE_THRESHOLD || "5000", 10);

app.use(express.json({ limit: "50mb" }));

const startTime = Date.now();
let eventsStored = 0;
let incidentsGenerated = 0;
let errorsCount = 0;
let consumerPaused = false;

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const eventWriter = new EventWriter(pool);
const incidentGenerator = new IncidentGenerator(pool);
const openSearchIndexer = new OpenSearchIndexer({
  url: OPENSEARCH_URL,
  index: OPENSEARCH_INDEX,
  username: process.env.OPENSEARCH_USERNAME,
  password: process.env.OPENSEARCH_PASSWORD,
  batchSize: 200,
});
const retentionManager = new RetentionManager(pool, {
  hotDays: parseInt(process.env.RETENTION_HOT_DAYS || "90", 10),
  warmDays: parseInt(process.env.RETENTION_WARM_DAYS || "365", 10),
  coldDays: parseInt(process.env.RETENTION_COLD_DAYS || "2555", 10),
});

let kafkaConsumer: any = null;

async function processAlertBatch(messages: any[]): Promise<void> {
  const events: EventRecord[] = [];

  for (const msg of messages) {
    try {
      const payload = msg.value?.payload || msg.value;
      if (!payload) continue;

      events.push({
        tenantId: payload.tenantId || msg.value?.tenantId || 0,
        eventType: payload.eventType || payload.event_type || "endpoint",
        severity: payload.severity || "medium",
        threat: payload.threat || null,
        target: payload.target || null,
        attacker: payload.attacker || payload.sourceIp || null,
        asset: payload.asset || payload.hostname || null,
        app: payload.app || null,
        description: payload.description || null,
        threatVector: payload.threatVector || null,
        mitreTactic: payload.mitreTactic || payload.mitre_tactic || null,
        mitreTechnique: payload.mitreTechnique || payload.mitre_technique || null,
        action: payload.action || null,
        sourceType: payload.sourceType || payload.source_type || null,
        logSource: payload.logSource || payload.log_source || null,
        sender: payload.sender || null,
        recipient: payload.recipient || null,
        protocol: payload.protocol || null,
        country: payload.country || null,
        riskScore: payload.riskScore || payload.risk_score || null,
        rawPayload: payload.rawPayload || payload.raw_payload || payload,
        sigmaMatches: payload.sigmaMatches || payload.sigma_matches || null,
        enrichedDescription: payload.enrichedDescription || null,
        occurredAt: payload.occurredAt || payload.occurred_at || new Date().toISOString(),
        normalizedAt: payload.normalizedAt || null,
        enrichedAt: payload.enrichedAt || null,
        correlatedAt: payload.correlatedAt || null,
      });
    } catch (err: any) {
      errorsCount++;
      console.error(`[${SERVICE_NAME}] Failed to parse event: ${err.message}`);
    }
  }

  if (events.length === 0) return;

  const writeResult = await eventWriter.writeBatch(events);
  eventsStored += writeResult.inserted;

  if (eventWriter.getWriteLatency() > WRITE_LATENCY_PAUSE_THRESHOLD && !consumerPaused) {
    console.warn(`[${SERVICE_NAME}] Write latency ${eventWriter.getWriteLatency()}ms exceeds threshold, pausing consumer`);
    consumerPaused = true;
    if (kafkaConsumer) {
      await kafkaConsumer.pause();
    }

    setTimeout(async () => {
      consumerPaused = false;
      if (kafkaConsumer) {
        await kafkaConsumer.resume();
        console.log(`[${SERVICE_NAME}] Consumer resumed after backpressure cooldown`);
      }
    }, 10000);
  }

  const incidents = await incidentGenerator.generateFromEvents(events);
  incidentsGenerated += incidents.length;

  await openSearchIndexer.indexBatch(events);
}

async function startKafkaConsumer(): Promise<void> {
  if (!KAFKA_BROKERS) {
    console.log(`[${SERVICE_NAME}] No KAFKA_BROKERS configured, running in API-only mode`);
    return;
  }

  try {
    const { KafkaConsumerGroup } = await import("../../server/kafka/consumer");
    const { KAFKA_TOPICS } = await import("../../server/kafka/topics");

    kafkaConsumer = new KafkaConsumerGroup({
      groupId: "secureops-storage-service",
      topics: [KAFKA_TOPICS.ALERTS],
      batchSize: 100,
      concurrency: 5,
      fromBeginning: false,
    });

    const started = await kafkaConsumer.start(processAlertBatch);
    if (started) {
      console.log(`[${SERVICE_NAME}] Kafka consumer started, listening on ${KAFKA_TOPICS.ALERTS}`);
    } else {
      console.log(`[${SERVICE_NAME}] Kafka consumer failed to start, falling back to API-only mode`);
    }
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] Kafka consumer initialization failed: ${err.message}`);
  }
}

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

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
      openSearch: openSearchIndexer.getStats(),
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
      openSearch: openSearchIndexer.getStats(),
    },
  });
});

app.post("/store", async (req, res) => {
  try {
    const events: EventRecord[] = Array.isArray(req.body) ? req.body : [req.body];
    const writeResult = await eventWriter.writeBatch(events);
    eventsStored += writeResult.inserted;

    const incidents = await incidentGenerator.generateFromEvents(events);
    incidentsGenerated += incidents.length;

    await openSearchIndexer.indexBatch(events);

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

async function startup() {
  console.log(`[${SERVICE_NAME}] Starting storage microservice...`);

  try {
    await pool.query("SELECT 1");
    console.log(`[${SERVICE_NAME}] Database connection verified`);
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] Database connection failed: ${err.message}`);
  }

  await openSearchIndexer.connect();
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
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down...`);
  retentionManager.stopSchedule();
  if (kafkaConsumer) await kafkaConsumer.stop();
  await pool.end();
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down...`);
  retentionManager.stopSchedule();
  if (kafkaConsumer) await kafkaConsumer.stop();
  await pool.end();
  server.close(() => {
    process.exit(0);
  });
});
