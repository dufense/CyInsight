import express from "express";
import { SigmaMatcher, type SigmaMatchResult } from "./sigma-matcher";
import { enrichWithMITRE, enrichFromSigmaMatch, type MITREEnrichment } from "./mitre-enricher";
import { mapToKillChain, getKillChainFromMITRETactic, adjustSeverityByKillChain } from "./kill-chain-mapper";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "detection-engine";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "100", 10);

app.use(express.json({ limit: "50mb" }));

const startTime = Date.now();
let eventsProcessed = 0;
let matchesFound = 0;
let errorsCount = 0;
let lastProcessedAt: string | null = null;

const matcher = new SigmaMatcher(process.env.SIGMA_RULES_PATH || process.env.SIGMA_RULES_DIR);

console.log(`[${SERVICE_NAME}] Loading Sigma rules...`);
const ruleCount = matcher.loadRules();
console.log(`[${SERVICE_NAME}] ${ruleCount} rules loaded and indexed`);

interface KafkaConfig {
  brokers: string;
  groupId: string;
  inputTopic: string;
  outputTopic: string;
  dlqTopic: string;
}

const kafkaConfig: KafkaConfig = {
  brokers: process.env.KAFKA_BROKERS || "",
  groupId: process.env.KAFKA_GROUP_ID || "secureops-detection-engine",
  inputTopic: "secureops.events.normalized",
  outputTopic: "secureops.events.enriched",
  dlqTopic: "secureops.events.dlq",
};

async function startKafkaConsumer(): Promise<boolean> {
  if (!kafkaConfig.brokers) {
    console.log(`[${SERVICE_NAME}] No KAFKA_BROKERS configured, running in standalone mode`);
    return false;
  }

  try {
    const { KafkaConsumerGroup, KAFKA_TOPICS } = await import("../../../server/kafka/index");

    const consumer = new KafkaConsumerGroup({
      groupId: kafkaConfig.groupId,
      topics: [KAFKA_TOPICS.NORMALIZED_EVENTS],
      batchSize: BATCH_SIZE,
      concurrency: 10,
      fromBeginning: false,
    });

    const started = await consumer.start(async (messages) => {
      const batchStart = performance.now();

      for (const msg of messages) {
        try {
          const event = msg.value;
          const payload = event.payload || event;
          const tenantId = event.tenantId || payload.tenantId;

          const sigmaMatches = matcher.matchEvent(payload, tenantId);

          const mitreEnrichment = getMITREEnrichment(payload, sigmaMatches);
          const killChain = mitreEnrichment
            ? mapToKillChain(mitreEnrichment.killChainPhase) || getKillChainFromMITRETactic(mitreEnrichment.tactic)
            : null;

          const enrichedEvent = {
            ...payload,
            sigmaMatches: sigmaMatches.map(m => ({
              ruleId: m.ruleId,
              ruleTitle: m.ruleTitle,
              severity: m.severity,
              confidence: m.confidence,
              mitreTactic: m.mitreTactic,
              mitreTechnique: m.mitreTechnique,
              matchedKeywords: m.matchedKeywords,
            })),
            sigmaMatchCount: sigmaMatches.length,
            mitre: mitreEnrichment ? {
              tactic: mitreEnrichment.tactic,
              tacticId: mitreEnrichment.tacticId,
              technique: mitreEnrichment.technique,
              techniqueName: mitreEnrichment.techniqueName,
            } : null,
            killChain: killChain ? {
              phase: killChain.phase,
              phaseNumber: killChain.phaseNumber,
            } : null,
            detectedAt: new Date().toISOString(),
          };

          if (sigmaMatches.length > 0) {
            const topMatch = sigmaMatches.reduce((a, b) => a.confidence > b.confidence ? a : b);
            enrichedEvent.severity = adjustSeverityByKillChain(
              topMatch.severity || enrichedEvent.severity || "medium",
              killChain
            );
          }

          const { publishSingle } = await import("../../../server/kafka/index");
          await publishSingle(KAFKA_TOPICS.ENRICHED_EVENTS, {
            tenantId: tenantId || 0,
            source: SERVICE_NAME,
            payload: enrichedEvent,
          });

          eventsProcessed++;
          matchesFound += sigmaMatches.length;
          lastProcessedAt = new Date().toISOString();
        } catch (err: any) {
          errorsCount++;
          console.error(`[${SERVICE_NAME}] Event processing error: ${err.message}`);
        }
      }

      const elapsed = performance.now() - batchStart;
      if (messages.length > 0) {
        console.log(`[${SERVICE_NAME}] Processed batch of ${messages.length} events in ${elapsed.toFixed(1)}ms (${(elapsed / messages.length).toFixed(1)}ms/event)`);
      }
    });

    if (started) {
      console.log(`[${SERVICE_NAME}] Kafka consumer started, consuming from ${kafkaConfig.inputTopic}`);
    }
    return started;
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] Failed to start Kafka consumer: ${err.message}`);
    return false;
  }
}

function getMITREEnrichment(event: Record<string, any>, sigmaMatches: SigmaMatchResult[]): MITREEnrichment | null {
  const eventMitre = enrichWithMITRE(event);
  if (eventMitre) return eventMitre;

  for (const match of sigmaMatches) {
    if (match.mitreTactic) {
      const sigmaMitre = enrichFromSigmaMatch(match.mitreTactic, match.mitreTechnique);
      if (sigmaMitre) return sigmaMitre;
    }
  }

  return null;
}

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/health", (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const stats = matcher.getStats();
  res.json({
    status: "healthy",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: uptimeSeconds,
    stats: {
      eventsProcessed,
      matchesFound,
      errorsCount,
      lastProcessedAt,
      rules: {
        total: stats.totalRules,
        enabled: stats.enabledRules,
        avgMatchTimeMs: parseFloat(stats.avgMatchTimeMs.toFixed(3)),
        rulesBySource: stats.rulesBySource,
      },
    },
  });
});

app.get("/metrics", (_req, res) => {
  const stats = matcher.getStats();
  res.json({
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    metrics: {
      events_processed: eventsProcessed,
      matches_found: matchesFound,
      errors: errorsCount,
      rules_loaded: stats.totalRules,
      rules_enabled: stats.enabledRules,
      avg_match_time_ms: parseFloat(stats.avgMatchTimeMs.toFixed(3)),
      total_sigma_matches: stats.totalMatches,
    },
  });
});

app.post("/rules/reload", (_req, res) => {
  try {
    const count = matcher.reloadRules();
    res.json({
      status: "reloaded",
      rulesLoaded: count,
      stats: matcher.getStats(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/rules/stats", (_req, res) => {
  res.json(matcher.getStats());
});

app.post("/detect", (req, res) => {
  const { event, events, tenantId } = req.body;

  if (events && Array.isArray(events)) {
    const start = performance.now();
    const results: Array<{ index: number; matches: SigmaMatchResult[]; mitre: MITREEnrichment | null; killChain: any }> = [];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const sigmaMatches = matcher.matchEvent(e, tenantId);

      if (sigmaMatches.length > 0) {
        const mitreEnrichment = getMITREEnrichment(e, sigmaMatches);
        const killChain = mitreEnrichment
          ? mapToKillChain(mitreEnrichment.killChainPhase) || getKillChainFromMITRETactic(mitreEnrichment.tactic)
          : null;

        results.push({ index: i, matches: sigmaMatches, mitre: mitreEnrichment, killChain });
        matchesFound += sigmaMatches.length;
      }
      eventsProcessed++;
    }

    const elapsed = performance.now() - start;
    lastProcessedAt = new Date().toISOString();

    res.json({
      processedCount: events.length,
      matchedCount: results.length,
      processingTimeMs: parseFloat(elapsed.toFixed(2)),
      avgTimePerEventMs: parseFloat((elapsed / events.length).toFixed(3)),
      results,
    });
  } else if (event) {
    const start = performance.now();
    const sigmaMatches = matcher.matchEvent(event, tenantId);
    const mitreEnrichment = getMITREEnrichment(event, sigmaMatches);
    const killChain = mitreEnrichment
      ? mapToKillChain(mitreEnrichment.killChainPhase) || getKillChainFromMITRETactic(mitreEnrichment.tactic)
      : null;
    const elapsed = performance.now() - start;

    eventsProcessed++;
    matchesFound += sigmaMatches.length;
    lastProcessedAt = new Date().toISOString();

    res.json({
      matches: sigmaMatches,
      mitre: mitreEnrichment,
      killChain,
      processingTimeMs: parseFloat(elapsed.toFixed(3)),
    });
  } else {
    res.status(400).json({ error: "Provide 'event' or 'events' in request body" });
  }
});

app.post("/overrides/:tenantId", (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  if (isNaN(tenantId)) {
    return res.status(400).json({ error: "Invalid tenantId" });
  }
  const { disabledRuleIds } = req.body;
  if (!Array.isArray(disabledRuleIds)) {
    return res.status(400).json({ error: "disabledRuleIds must be an array" });
  }
  matcher.setTenantOverrides(tenantId, disabledRuleIds);
  res.json({ status: "ok", tenantId, disabledCount: disabledRuleIds.length });
});

app.delete("/overrides/:tenantId", (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  if (isNaN(tenantId)) {
    return res.status(400).json({ error: "Invalid tenantId" });
  }
  matcher.removeTenantOverrides(tenantId);
  res.json({ status: "ok", tenantId });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  startKafkaConsumer().catch((err) => {
    console.error(`[${SERVICE_NAME}] Kafka consumer startup error:`, err);
  });
});

process.on("SIGTERM", async () => {
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down...`);
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down...`);
  server.close(() => {
    process.exit(0);
  });
});
