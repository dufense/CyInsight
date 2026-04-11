import express from "express";
import { KafkaConsumerGroup, type ParsedMessage } from "../../../server/kafka/consumer";
import { publishEvents, type EventMessage } from "../../../server/kafka/producer";
import { KAFKA_TOPICS } from "../../../server/kafka/topics";
import { IOCScorer, type IOCIndicator } from "./ioc-scorer";
import { ConfidenceCalculator } from "./confidence-calculator";
import { ThreatNarrativeGenerator } from "./threat-narrative";
import { CorrelationEngine } from "./correlation";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "enrichment";

app.use(express.json({ limit: "10mb" }));

const startTime = Date.now();
let eventsProcessed = 0;
let eventsEnriched = 0;
let alertsGenerated = 0;
let errorsCount = 0;
let lastProcessedAt: string | null = null;

const iocScorer = new IOCScorer({
  redisTTL: parseInt(process.env.IOC_CACHE_TTL || "3600", 10),
  redisUrl: process.env.REDIS_URL || undefined,
});

const confidenceCalc = new ConfidenceCalculator();
const narrativeGen = new ThreatNarrativeGenerator();
const correlationEngine = new CorrelationEngine({
  windowMs: parseInt(process.env.CORRELATION_WINDOW_MS || "300000", 10),
  minSources: parseInt(process.env.CORRELATION_MIN_SOURCES || "2", 10),
});

let consumer: KafkaConsumerGroup | null = null;

async function processEnrichedBatch(messages: ParsedMessage[]): Promise<void> {
  const alertEvents: EventMessage[] = [];

  for (const msg of messages) {
    try {
      const event = msg.value;
      const tenantId = event.tenantId || 0;
      const payload = event.payload || event;

      const iocs = iocScorer.extractAndScore(payload);

      const confidence = confidenceCalc.calculate(payload, iocs);

      correlationEngine.addEvent(tenantId, payload, iocs);
      const correlations = correlationEngine.findCorrelations(tenantId, payload);

      let threatNarrative: string | null = null;
      const severity = (payload.severity || "medium").toLowerCase();
      if (severity === "critical" || severity === "high") {
        threatNarrative = narrativeGen.generate(payload, iocs, correlations);
      }

      const enrichedPayload = {
        ...payload,
        enrichment: {
          iocs: iocs.map((i) => ({
            type: i.type,
            value: i.value,
            reputation: i.reputation,
            source: i.source,
          })),
          iocCount: iocs.length,
          maliciousIOCs: iocs.filter((i) => i.reputation === "malicious").length,
          suspiciousIOCs: iocs.filter((i) => i.reputation === "suspicious").length,
          confidence,
          correlations: correlations.length > 0 ? correlations : undefined,
          threatNarrative: threatNarrative || undefined,
          enrichedAt: new Date().toISOString(),
          enrichmentService: SERVICE_NAME,
        },
      };

      eventsEnriched++;

      const shouldAlert =
        confidence >= 60 ||
        severity === "critical" ||
        severity === "high" ||
        iocs.some((i) => i.reputation === "malicious") ||
        correlations.length > 0;

      if (shouldAlert) {
        alertEvents.push({
          tenantId,
          source: SERVICE_NAME,
          payload: enrichedPayload,
          timestamp: payload.timestamp || new Date().toISOString(),
          traceId: event.traceId,
        });
        alertsGenerated++;
      }

      eventsProcessed++;
      lastProcessedAt = new Date().toISOString();
    } catch (err: any) {
      errorsCount++;
      console.error(`[${SERVICE_NAME}] Error processing event: ${err.message}`);
    }
  }

  if (alertEvents.length > 0) {
    const result = await publishEvents(KAFKA_TOPICS.ALERTS, alertEvents);
    if (!result.success) {
      console.error(`[${SERVICE_NAME}] Failed to publish alerts: ${result.error}`);
      errorsCount += alertEvents.length;
    }
  }
}

async function startConsumer(): Promise<void> {
  const kafkaBrokers = process.env.KAFKA_BROKERS;
  if (!kafkaBrokers) {
    console.log(`[${SERVICE_NAME}] KAFKA_BROKERS not set, running in standalone mode`);
    return;
  }

  consumer = new KafkaConsumerGroup({
    groupId: `secureops-${SERVICE_NAME}`,
    topics: [KAFKA_TOPICS.ENRICHED_EVENTS],
    batchSize: parseInt(process.env.BATCH_SIZE || "100", 10),
    concurrency: parseInt(process.env.CONCURRENCY || "5", 10),
    fromBeginning: false,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  const started = await consumer.start(processEnrichedBatch);
  if (started) {
    console.log(`[${SERVICE_NAME}] Kafka consumer started, subscribed to ${KAFKA_TOPICS.ENRICHED_EVENTS}`);
  } else {
    console.warn(`[${SERVICE_NAME}] Failed to start Kafka consumer, will retry...`);
    setTimeout(startConsumer, 10000);
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
      eventsProcessed,
      eventsEnriched,
      alertsGenerated,
      errorsCount,
      lastProcessedAt,
      consumerStats: consumer?.getStats() || null,
      correlationWindowSize: correlationEngine.getWindowSize(),
      iocCacheStats: iocScorer.getCacheStats(),
    },
  });
});

app.get("/metrics", (_req, res) => {
  res.json({
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    metrics: {
      eventsProcessed,
      eventsEnriched,
      alertsGenerated,
      errorsCount,
      lastProcessedAt,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      enrichmentRate: eventsProcessed > 0
        ? (eventsEnriched / eventsProcessed * 100).toFixed(1)
        : "0",
      alertRate: eventsProcessed > 0
        ? (alertsGenerated / eventsProcessed * 100).toFixed(1)
        : "0",
    },
  });
});

app.post("/enrich", async (req, res) => {
  try {
    const event = req.body;
    const iocs = iocScorer.extractAndScore(event);
    const confidence = confidenceCalc.calculate(event, iocs);
    const correlations = correlationEngine.findCorrelations(event.tenantId || 0, event);

    let threatNarrative: string | null = null;
    const severity = (event.severity || "medium").toLowerCase();
    if (severity === "critical" || severity === "high") {
      threatNarrative = narrativeGen.generate(event, iocs, correlations);
    }

    res.json({
      iocs,
      confidence,
      correlations,
      threatNarrative,
      enrichedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ioc/check", async (req, res) => {
  try {
    const { indicators } = req.body;
    if (!Array.isArray(indicators)) {
      return res.status(400).json({ error: "indicators must be an array" });
    }
    const results = indicators.map((ind: any) => iocScorer.checkReputation(ind.type, ind.value));
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/correlation/stats", (_req, res) => {
  res.json({
    windowSize: correlationEngine.getWindowSize(),
    activeEntities: correlationEngine.getActiveEntityCount(),
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  startConsumer();
});

process.on("SIGTERM", async () => {
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down...`);
  if (consumer) await consumer.stop();
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down...`);
  if (consumer) await consumer.stop();
  server.close(() => {
    process.exit(0);
  });
});
