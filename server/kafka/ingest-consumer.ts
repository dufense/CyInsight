import { KafkaConsumerGroup } from "./consumer";
import { KAFKA_TOPICS } from "./topics";
import { publishEvents, type EventMessage } from "./producer";
import { getConsumerGroupLag } from "./admin";
import { incrementCounter, recordError, recordProcessingLatency, getLocalMetrics } from "./metrics";
import { runEnrichmentPipeline } from "../enrichment-pipeline";
import { storage } from "../storage";

export const INGEST_CONSUMER_GROUP_ID = "secureops-ingest-workers";

/**
 * PIPELINE_ADDITIONAL_RETRIES = 3 means three retries after the initial attempt.
 * Total pipeline attempts per batch = 1 (initial) + PIPELINE_ADDITIONAL_RETRIES = 4.
 * Backoff per retry: 500ms * attempt number (500ms, 1000ms, 1500ms).
 */
const PIPELINE_ADDITIONAL_RETRIES = 3;

let consumerGroup: KafkaConsumerGroup | null = null;

export function getIngestConsumer(): KafkaConsumerGroup | null {
  return consumerGroup;
}

export async function getIngestConsumerStats(): Promise<{
  consumer: ReturnType<KafkaConsumerGroup["getStats"]> | null;
  lag: Record<string, number>;
  localMetrics: ReturnType<typeof getLocalMetrics>;
}> {
  const lag = await getConsumerGroupLag(INGEST_CONSUMER_GROUP_ID).catch(() => ({}));
  return {
    consumer: consumerGroup ? consumerGroup.getStats() : null,
    lag,
    localMetrics: getLocalMetrics(),
  };
}

interface IngestEnvelope {
  batchId: number;
  events: Record<string, any>[];
  vendorHint?: string;
  kafkaEnvelopeVersion?: number;
  publishedAt?: string;
}

function parseIngestMessage(raw: unknown): {
  tenantId: number;
  source: string;
  envelope: IngestEnvelope;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;

  const tenantId = typeof msg.tenantId === "number" ? msg.tenantId : Number(msg.tenantId);
  if (!tenantId || isNaN(tenantId)) return null;

  const source = typeof msg.source === "string" ? msg.source : "unknown";

  const payload = msg.payload;
  if (!payload || typeof payload !== "object") return null;
  const env = payload as Record<string, unknown>;

  const batchId = typeof env.batchId === "number" ? env.batchId : Number(env.batchId);
  if (!batchId || isNaN(batchId)) return null;

  if (!Array.isArray(env.events)) return null;

  return {
    tenantId,
    source,
    envelope: {
      batchId,
      events: env.events as Record<string, any>[],
      vendorHint: typeof env.vendorHint === "string" ? env.vendorHint : undefined,
      kafkaEnvelopeVersion:
        typeof env.kafkaEnvelopeVersion === "number" ? env.kafkaEnvelopeVersion : 1,
      publishedAt: typeof env.publishedAt === "string" ? env.publishedAt : undefined,
    },
  };
}

async function publishDownstream(
  tenantId: number,
  source: string,
  batchId: number,
  result: { eventsStored: number; incidentsCreated: number; iocCount: number; errors: string[] }
): Promise<void> {
  const now = new Date().toISOString();

  const enrichedMsg: EventMessage = {
    tenantId,
    source,
    payload: {
      batchId,
      eventsStored: result.eventsStored,
      incidentsCreated: result.incidentsCreated,
      iocCount: result.iocCount,
      errorCount: result.errors.length,
      completedAt: now,
      pipelineStage: "enriched",
    },
    timestamp: now,
  };

  await publishEvents(KAFKA_TOPICS.ENRICHED_EVENTS, [enrichedMsg]).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[IngestConsumer] Could not publish to enriched topic: ${msg}`);
  });

  if (result.incidentsCreated > 0) {
    const alertMsg: EventMessage = {
      tenantId,
      source,
      payload: {
        batchId,
        incidentsCreated: result.incidentsCreated,
        createdAt: now,
        alertType: "new_incidents",
      },
      timestamp: now,
    };
    await publishEvents(KAFKA_TOPICS.ALERTS, [alertMsg]).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[IngestConsumer] Could not publish to alerts topic: ${msg}`);
    });
  }
}

const STARTUP_MAX_RETRIES = 3;
const STARTUP_RETRY_DELAY_MS = 2000;

export async function startIngestConsumer(): Promise<boolean> {
  if (consumerGroup) {
    console.log("[IngestConsumer] Already running");
    return true;
  }

  for (let attempt = 1; attempt <= STARTUP_MAX_RETRIES; attempt++) {
    try {
      const started = await tryStartConsumer();
      if (started) return true;
      if (attempt < STARTUP_MAX_RETRIES) {
        console.warn(
          `[IngestConsumer] Startup attempt ${attempt}/${STARTUP_MAX_RETRIES} returned false, retrying in ${STARTUP_RETRY_DELAY_MS}ms...`
        );
        await new Promise((r) => setTimeout(r, STARTUP_RETRY_DELAY_MS * attempt));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < STARTUP_MAX_RETRIES) {
        console.warn(
          `[IngestConsumer] Startup attempt ${attempt}/${STARTUP_MAX_RETRIES} threw: ${msg}. Retrying in ${STARTUP_RETRY_DELAY_MS}ms...`
        );
        await new Promise((r) => setTimeout(r, STARTUP_RETRY_DELAY_MS * attempt));
      } else {
        console.error(`[IngestConsumer] All ${STARTUP_MAX_RETRIES} startup attempts failed: ${msg}`);
      }
    }
  }
  return false;
}

async function tryStartConsumer(): Promise<boolean> {
  const cg = new KafkaConsumerGroup({
    groupId: INGEST_CONSUMER_GROUP_ID,
    topics: [KAFKA_TOPICS.RAW_EVENTS],
    batchSize: 50,
    concurrency: 5,
    fromBeginning: false,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxWaitTimeInMs: 5000,
  });

  const started = await cg.start(async (messages) => {
    for (const msg of messages) {
      const parsed = parseIngestMessage(msg.value);

      if (!parsed) {
        const malformErr = `Malformed ingest envelope at offset=${msg.offset} partition=${msg.partition}: expected { tenantId, payload: { batchId, events } }`;
        console.warn(`[IngestConsumer] ${malformErr}`);
        incrementCounter("ingest.consumer.malformed_messages");
        // Write to DLQ (DB + Kafka) so operators can inspect bad producer payloads.
        // tenantId=0 and batchId=0 are sentinel values for envelope-parse failures.
        await writeToDlq(0, 0, msg.value, malformErr, null, 0).catch((e: unknown) => {
          const msg2 = e instanceof Error ? e.message : String(e);
          console.error(`[IngestConsumer] Could not write malformed-envelope DLQ entry: ${msg2}`);
        });
        continue;
      }

      const { tenantId, source, envelope } = parsed;
      const { batchId, events, vendorHint } = envelope;
      const start = Date.now();

      const claimed = await storage
        .claimIngestBatch(batchId, "queued", "normalizing")
        .catch(() => false);
      if (!claimed) {
        console.log(
          `[IngestConsumer] Skipping batchId=${batchId} — atomic claim failed (already processing or completed via sync fallback)`
        );
        incrementCounter("ingest.consumer.idempotency_skips");
        continue;
      }

      let lastError: Error | null = null;
      const maxAttempts = 1 + PIPELINE_ADDITIONAL_RETRIES;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await runEnrichmentPipeline(batchId, tenantId, events, { vendorHint });

          const fatalStageFailure = Object.values(result.stages).some(
            (s) => s.status === "failed"
          );
          if (fatalStageFailure || (result.eventsStored === 0 && result.errors.length > 0)) {
            const errDetail = result.errors.slice(0, 3).join("; ");
            throw new Error(`Pipeline fatal failure for batchId=${batchId}: ${errDetail}`);
          }

          if (result.errors.length > 0) {
            console.warn(
              `[IngestConsumer] batchId=${batchId} completed with ${result.errors.length} pipeline warning(s)`
            );
          }

          await publishDownstream(tenantId, source, batchId, result);

          incrementCounter("ingest.consumer.events_processed", events.length, {
            tenantId: String(tenantId),
          });
          recordProcessingLatency("ingest.kafka_consumer", Date.now() - start);
          lastError = null;
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxAttempts) {
            console.warn(
              `[IngestConsumer] Attempt ${attempt}/${maxAttempts} failed for batchId=${batchId}: ${lastError.message}. Retrying in ${500 * attempt}ms...`
            );
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }

      if (lastError) {
        const errMsg = lastError.message;
        const errStack = lastError.stack?.substring(0, 2000) ?? null;
        console.error(
          `[IngestConsumer] All ${maxAttempts} attempts exhausted for batchId=${batchId}: ${errMsg}`
        );
        recordError("ingest.kafka_consumer", "pipeline_exhausted");
        incrementCounter("ingest.consumer.dlq_events", events.length, {
          tenantId: String(tenantId),
        });

        await storage.updateIngestBatch(batchId, {
          status: "failed",
          metadata: { failureReason: errMsg, retryCount: PIPELINE_ADDITIONAL_RETRIES, failedAt: new Date().toISOString() },
        }).catch((dbErr: unknown) => {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          console.error(`[IngestConsumer] Could not mark batch ${batchId} as failed: ${msg}`);
        });

        // DLQ ownership: runEnrichmentPipeline writes per-event DLQ entries on pipeline-stage
        // failures. This batch-level DLQ write is authoritative for consumer-level failures
        // (deserialization errors, catastrophic throws, or pre-pipeline claim failures) and
        // provides the admin DLQ retry entry point. The pipeline's per-event entries are
        // complementary, not duplicates — they carry stage/event context.
        await writeToDlq(tenantId, batchId, msg.value, errMsg, errStack, PIPELINE_ADDITIONAL_RETRIES);
      }
    }
  });

  if (started) {
    consumerGroup = cg;
    console.log(
      `[IngestConsumer] Consumer group '${INGEST_CONSUMER_GROUP_ID}' started on topic '${KAFKA_TOPICS.RAW_EVENTS}'`
    );
  }

  return started;
}

export async function stopIngestConsumer(): Promise<void> {
  if (consumerGroup) {
    await consumerGroup.stop();
    consumerGroup = null;
    console.log("[IngestConsumer] Stopped");
  }
}

async function writeToDlq(
  tenantId: number,
  batchId: number,
  originalPayload: Record<string, unknown>,
  errorMessage: string,
  errorStack: string | null,
  retryCount: number
): Promise<void> {
  try {
    await storage.createDlqEntry({
      tenantId,
      rawPayload: originalPayload,
      errorMessage,
      errorStack,
      pipelineStage: "kafka_consumer",
      retryCount,
      maxRetries: PIPELINE_ADDITIONAL_RETRIES,
      status: "failed",
      batchId,
    });
  } catch (dbErr: unknown) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error(`[IngestConsumer] Could not write DLQ entry to DB: ${msg}`);
  }

  const dlqMsg: EventMessage = {
    tenantId: tenantId ?? 0,
    source: "ingest-consumer-dlq",
    payload: {
      originalPayload,
      batchId,
      errorMessage,
      errorStack,
      retryCount,
      failedAt: new Date().toISOString(),
      consumerGroup: INGEST_CONSUMER_GROUP_ID,
    },
    timestamp: new Date().toISOString(),
  };

  await publishEvents(KAFKA_TOPICS.DLQ, [dlqMsg]).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[IngestConsumer] Could not publish DLQ message to Kafka: ${msg}`);
  });
}

export function buildKafkaEventBatch(
  tenantId: number,
  batchId: number,
  events: Record<string, any>[],
  source: string,
  vendorHint?: string
): EventMessage {
  return {
    tenantId,
    source,
    payload: {
      batchId,
      events,
      vendorHint,
      kafkaEnvelopeVersion: 1,
      publishedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };
}
