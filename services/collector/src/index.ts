import express from "express";
import { CollectorScheduler } from "./scheduler";
import { createPushReceiver, createSyslogUdpServer, createSyslogTcpServer, createSyslogTlsServer } from "./push-receiver";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const SERVICE_NAME = "collector";

app.use(express.json({ limit: "50mb" }));
app.use(express.text({ limit: "50mb", type: ["text/*", "application/octet-stream"] }));
app.use(express.raw({ limit: "50mb", type: "*/*", inflate: true }));

const startTime = Date.now();
let eventsCollected = 0;
let errorsCount = 0;
let lastPollTime: string | null = null;

const MANAGEMENT_URL = process.env.MANAGEMENT_PLANE_URL || "http://localhost:5000";

const scheduler = new CollectorScheduler({
  concurrency: parseInt(process.env.POLLING_CONCURRENCY || process.env.COLLECTOR_CONCURRENCY || "5", 10),
  maxEventsPerCycle: parseInt(process.env.MAX_EVENTS_PER_CYCLE || "10000", 10),
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || "5", 10),
  circuitBreakerCooldownMs: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || "300000", 10),
  kafkaBrokers: process.env.KAFKA_BROKERS || "",
  managementPlaneUrl: MANAGEMENT_URL,
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
  managementPlaneUrl: MANAGEMENT_URL,
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

const SYSLOG_DEFAULT_TENANT = parseInt(process.env.SYSLOG_DEFAULT_TENANT_ID || "1", 10);

const ipToTenantCache = new Map<string, number>();

async function resolveTenantFromIp(srcIp: string): Promise<number | null> {
  if (ipToTenantCache.has(srcIp)) return ipToTenantCache.get(srcIp)!;
  try {
    const headers: Record<string, string> = {};
    const secret = process.env.COLLECTOR_INTERNAL_SECRET;
    if (secret) headers['x-internal-secret'] = secret;
    const resp = await fetch(`${MANAGEMENT_URL}/api/log-sources/resolve-ip?ip=${encodeURIComponent(srcIp)}`, { headers });
    if (resp.ok) {
      const data = await resp.json() as { tenantId?: number };
      if (data.tenantId) {
        ipToTenantCache.set(srcIp, data.tenantId);
        return data.tenantId;
      }
    }
  } catch (err) {
    console.warn('[Collector] resolveTenantFromIp failed', { srcIp, error: (err as Error).message });
  }
  return null;
}

const syslogConfig = {
  kafkaBrokers: process.env.KAFKA_BROKERS || "",
  defaultTenantId: SYSLOG_DEFAULT_TENANT,
  onEventsReceived: (count: number) => { eventsCollected += count; },
  onError: () => { errorsCount++; },
  resolveTenant: resolveTenantFromIp,
  managementPlaneUrl: MANAGEMENT_URL,
};

const SYSLOG_UDP_PORT = parseInt(process.env.SYSLOG_UDP_PORT || "514", 10);
const SYSLOG_TCP_PORT = parseInt(process.env.SYSLOG_TCP_PORT || "1514", 10);
const SYSLOG_TLS_PORT = parseInt(process.env.SYSLOG_TLS_PORT || "6514", 10);

let udpSocket: ReturnType<typeof createSyslogUdpServer> | null = null;
let tcpServer: ReturnType<typeof createSyslogTcpServer> | null = null;

if (process.env.ENABLE_SYSLOG_UDP !== "false") {
  try {
    udpSocket = createSyslogUdpServer(SYSLOG_UDP_PORT, syslogConfig);
  } catch (err: any) {
    console.warn(`[${SERVICE_NAME}] Syslog UDP startup failed: ${err.message}`);
  }
}

if (process.env.ENABLE_SYSLOG_TCP !== "false") {
  try {
    tcpServer = createSyslogTcpServer(SYSLOG_TCP_PORT, syslogConfig);
  } catch (err: any) {
    console.warn(`[${SERVICE_NAME}] Syslog TCP startup failed: ${err.message}`);
  }
}

if (process.env.ENABLE_SYSLOG_TLS !== "false" && (process.env.SYSLOG_TLS_CERT || process.env.SYSLOG_TLS_KEY)) {
  try {
    createSyslogTlsServer(SYSLOG_TLS_PORT, syslogConfig);
  } catch (err: any) {
    console.warn(`[${SERVICE_NAME}] Syslog TLS startup failed: ${err.message}`);
  }
}

process.on("SIGTERM", async () => {
  console.log(`[${SERVICE_NAME}] SIGTERM received, shutting down...`);
  scheduler.stop();
  if (udpSocket) try { udpSocket.close(); } catch {}
  if (tcpServer) try { tcpServer.close(); } catch {}
  server.close(() => {
    console.log(`[${SERVICE_NAME}] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log(`[${SERVICE_NAME}] SIGINT received, shutting down...`);
  scheduler.stop();
  if (udpSocket) try { udpSocket.close(); } catch {}
  if (tcpServer) try { tcpServer.close(); } catch {}
  server.close(() => {
    process.exit(0);
  });
});
