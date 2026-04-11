import express from "express";
import { CollectorScheduler } from "./scheduler";
import { createPushReceiver } from "./push-receiver";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "collector";

app.use(express.json({ limit: "50mb" }));

const startTime = Date.now();
let eventsCollected = 0;
let errorsCount = 0;
let lastPollTime: string | null = null;

const scheduler = new CollectorScheduler({
  concurrency: parseInt(process.env.POLLING_CONCURRENCY || process.env.COLLECTOR_CONCURRENCY || "5", 10),
  maxEventsPerCycle: parseInt(process.env.MAX_EVENTS_PER_CYCLE || "10000", 10),
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || "5", 10),
  circuitBreakerCooldownMs: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || "300000", 10),
  kafkaBrokers: process.env.KAFKA_BROKERS || "",
  managementPlaneUrl: process.env.MANAGEMENT_PLANE_URL || "http://localhost:5000",
  onEventsCollected: (count: number) => {
    eventsCollected += count;
    lastPollTime = new Date().toISOString();
  },
  onError: () => {
    errorsCount++;
  },
});

const pushReceiver = createPushReceiver({
  kafkaBrokers: process.env.KAFKA_BROKERS || "",
  onEventsReceived: (count: number) => {
    eventsCollected += count;
  },
  onError: () => {
    errorsCount++;
  },
});

app.use("/ingest", pushReceiver);

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
      eventsCollected,
      errorsCount,
      lastPollTime,
      schedulerRunning: scheduler.isRunning(),
      activeConnectors: scheduler.getActiveConnectorCount(),
      circuitBreakers: scheduler.getCircuitBreakerStatus(),
    },
  });
});

app.get("/metrics", (_req, res) => {
  const metrics = scheduler.getMetrics();
  res.json({
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    metrics: {
      ...metrics,
      totalEventsCollected: eventsCollected,
      totalErrors: errorsCount,
    },
  });
});

app.post("/poll/:tenantId", async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  if (isNaN(tenantId)) {
    return res.status(400).json({ error: "Invalid tenantId" });
  }
  try {
    const result = await scheduler.pollTenantNow(tenantId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/scheduler/start", (_req, res) => {
  scheduler.start();
  res.json({ status: "started" });
});

app.post("/scheduler/stop", (_req, res) => {
  scheduler.stop();
  res.json({ status: "stopped" });
});

app.get("/connectors", (_req, res) => {
  res.json({
    registered: scheduler.getRegisteredConnectors(),
    circuitBreakers: scheduler.getCircuitBreakerStatus(),
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  scheduler.start();
});

process.on("SIGTERM", async () => {
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down...`);
  scheduler.stop();
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down...`);
  scheduler.stop();
  server.close(() => {
    process.exit(0);
  });
});
