import express from "express";
import { KafkaConsumerGroup, type ParsedMessage } from "../../../server/kafka/consumer";
import { publishEvents, type EventMessage } from "../../../server/kafka/producer";
import { KAFKA_TOPICS } from "../../../server/kafka/topics";
import {
  incrementCounter,
  recordProcessingLatency,
  recordError,
  recordThroughput,
  startMetricsReporter,
  getLocalMetrics,
} from "../../../server/kafka/metrics";
import { normalizeBatch, type NormalizedEvent } from "./normalize";
import { VendorRegistry } from "./vendor-registry";

const PORT = parseInt(process.env.PORT || "5000", 10);
const CONCURRENCY = parseInt(process.env.CONSUMER_CONCURRENCY || process.env.NORMALIZER_CONCURRENCY || "10", 10);
const SERVICE_NAME = "normalizer";

const app = express();
app.use(express.json());

let consumer: KafkaConsumerGroup | null = null;
let startedAt: Date | null = null;
let totalProcessed = 0;
let totalErrors = 0;
let lastBatchTime = 0;

const vendorRegistry = new VendorRegistry();

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_NAME,
    uptime: startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0,
    kafka: consumer ? "connected" : "disconnected",
  });
});

app.get("/readyz", (_req, res) => {
  if (consumer) {
    res.json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not ready", reason: "Kafka consumer not started" });
  }
});

app.get("/metrics", (_req, res) => {
  const stats = consumer?.getStats() || { processedCount: 0, errorCount: 0 };
  res.json({
    service: SERVICE_NAME,
    totalProcessed,
    totalErrors,
    lastBatchTimeMs: lastBatchTime,
    consumerStats: stats,
    vendorSignatures: vendorRegistry.getSignatureCount(),
    localMetrics: getLocalMetrics(),
  });
});

app.get("/vendors", (_req, res) => {
  const sigs = vendorRegistry.getSignatures();
  res.json({
    count: sigs.length,
    vendors: sigs.map((s) => ({
      id: s.id,
      vendor: s.vendor,
      sourceType: s.sourceType,
      fieldCount: s.fields.length,
    })),
  });
});

async function handleBatch(messages: ParsedMessage[]): Promise<void> {
  const batchStart = Date.now();

  const eventsToNormalize = messages.map((msg) => ({
    data: msg.value?.payload || msg.value || {},
    tenantId: msg.value?.tenantId || 0,
    traceId: msg.value?.traceId || undefined,
  }));

  const result = normalizeBatch(eventsToNormalize);

  if (result.normalized.length > 0) {
    const normalizedMessages: EventMessage[] = result.normalized.map((evt: NormalizedEvent) => ({
      tenantId: evt.tenantId,
      source: SERVICE_NAME,
      payload: {
        ...evt,
        rawPayload: undefined,
      },
      traceId: evt.traceId || undefined,
    }));

    const publishResult = await publishEvents(KAFKA_TOPICS.NORMALIZED_EVENTS, normalizedMessages);

    if (!publishResult.success) {
      console.error(`[Normalizer] Failed to publish ${normalizedMessages.length} normalized events: ${publishResult.error}`);
      recordError(SERVICE_NAME, "publish_failed");
    } else {
      recordThroughput(SERVICE_NAME, publishResult.count);
    }
  }

  if (result.errors.length > 0) {
    const dlqMessages: EventMessage[] = result.errors.map((err) => ({
      tenantId: 0,
      source: SERVICE_NAME,
      payload: {
        originalData: err.rawData,
        error: err.error,
        failedAt: new Date().toISOString(),
        stage: "normalization",
      },
    }));

    await publishEvents(KAFKA_TOPICS.DLQ, dlqMessages).catch(() => {});
  }

  const batchDuration = Date.now() - batchStart;
  lastBatchTime = batchDuration;
  totalProcessed += result.stats.deterministic + result.stats.generic + result.stats.aiFallback;
  totalErrors += result.stats.failed;

  incrementCounter(SERVICE_NAME, "events_processed", result.normalized.length);
  incrementCounter(SERVICE_NAME, "events_deterministic", result.stats.deterministic);
  incrementCounter(SERVICE_NAME, "events_generic", result.stats.generic);
  incrementCounter(SERVICE_NAME, "events_failed", result.stats.failed);
  recordProcessingLatency(SERVICE_NAME, batchDuration);

  if (result.normalized.length > 0) {
    console.log(
      `[Normalizer] Batch: ${result.normalized.length} normalized (${result.stats.deterministic} deterministic, ` +
      `${result.stats.generic} generic), ${result.stats.failed} failed, ${batchDuration}ms`
    );
  }
}

async function startConsumer(): Promise<boolean> {
  consumer = new KafkaConsumerGroup({
    groupId: "secureops-normalizer",
    topics: [KAFKA_TOPICS.RAW_EVENTS],
    batchSize: 100,
    concurrency: CONCURRENCY,
    fromBeginning: false,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxWaitTimeInMs: 5000,
  });

  const started = await consumer.start(handleBatch);

  if (started) {
    console.log(`[Normalizer] Kafka consumer started, subscribed to ${KAFKA_TOPICS.RAW_EVENTS}`);
    startMetricsReporter(SERVICE_NAME, 30000);
  } else {
    console.warn("[Normalizer] Kafka consumer failed to start, running in standalone mode");
  }

  return started;
}

async function startDirectMode(): Promise<void> {
  console.log("[Normalizer] Running in direct processing mode (no Kafka)");

  app.post("/normalize", (req, res) => {
    try {
      const events = Array.isArray(req.body) ? req.body : [req.body];
      const eventsToNormalize = events.map((evt: any) => ({
        data: evt.payload || evt,
        tenantId: evt.tenantId || 0,
        traceId: evt.traceId || undefined,
      }));

      const result = normalizeBatch(eventsToNormalize);
      totalProcessed += result.normalized.length;
      totalErrors += result.stats.failed;

      res.json({
        normalized: result.normalized,
        stats: result.stats,
        errors: result.errors,
      });
    } catch (err: any) {
      totalErrors++;
      res.status(500).json({ error: err.message });
    }
  });
}

async function main(): Promise<void> {
  startedAt = new Date();

  const kafkaStarted = await startConsumer();

  if (!kafkaStarted) {
    await startDirectMode();
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Normalizer] Service listening on port ${PORT}`);
    console.log(`[Normalizer] Vendor signatures loaded: ${vendorRegistry.getSignatureCount()}`);
    console.log(`[Normalizer] Concurrency: ${CONCURRENCY}`);
    console.log(`[Normalizer] Mode: ${kafkaStarted ? "Kafka consumer" : "Direct HTTP"}`);
  });
}

process.on("SIGTERM", async () => {
  console.log("[Normalizer] Received SIGTERM, shutting down...");
  if (consumer) {
    await consumer.stop();
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Normalizer] Received SIGINT, shutting down...");
  if (consumer) {
    await consumer.stop();
  }
  process.exit(0);
});

main().catch((err) => {
  console.error("[Normalizer] Fatal error:", err);
  process.exit(1);
});
