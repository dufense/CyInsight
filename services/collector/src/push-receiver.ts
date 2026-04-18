import { Router, type Request, type Response } from "express";
import * as dgram from "dgram";
import * as net from "net";
import * as tls from "tls";
import * as fs from "fs";
import { KAFKA_TOPICS } from "../../../server/kafka/topics";

interface PushReceiverConfig {
  kafkaBrokers: string;
  onEventsReceived: (count: number) => void;
  onError: () => void;
  managementPlaneUrl?: string;
}

export function createPushReceiver(config: PushReceiverConfig): Router {
  const router = Router();

  router.post("/http", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string, 10) || 0;
      const source = (req.headers["x-source"] as string) || "http-push";
      const apiKey = req.headers["x-api-key"] as string;

      if (!apiKey) {
        return res.status(401).json({ error: "Missing x-api-key header" });
      }

      if (!tenantId) {
        return res.status(400).json({ error: "Missing x-tenant-id header" });
      }

      let events: Record<string, any>[];
      const body = req.body;

      if (Array.isArray(body)) {
        events = body;
      } else if (body && typeof body === "object") {
        events = body.events || [body];
      } else {
        return res.status(400).json({ error: "Invalid payload format" });
      }

      if (events.length === 0) {
        return res.json({ accepted: 0, message: "No events to process" });
      }

      await publishEvents(tenantId, source, events, config);
      config.onEventsReceived(events.length);

      res.json({
        accepted: events.length,
        message: `${events.length} events accepted`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      config.onError();
      console.error(`[PushReceiver] HTTP ingest error: ${err.message}`);
      res.status(500).json({ error: "Internal processing error" });
    }
  });

  router.post("/webhook/:source", async (req: Request, res: Response) => {
    try {
      const source = req.params.source;
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || req.query.tenantId as string, 10) || 0;

      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenant identifier" });
      }

      let events: Record<string, any>[];
      const body = req.body;

      if (Array.isArray(body)) {
        events = body;
      } else if (body && typeof body === "object") {
        events = [body];
      } else {
        return res.status(400).json({ error: "Invalid payload" });
      }

      await publishEvents(tenantId, source, events, config);
      config.onEventsReceived(events.length);

      res.json({
        accepted: events.length,
        source,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      config.onError();
      console.error(`[PushReceiver] Webhook error: ${err.message}`);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  router.post("/syslog", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string, 10) || 0;
      const contentType = req.headers["content-type"] || "";

      if (!tenantId) {
        return res.status(400).json({ error: "Missing x-tenant-id header" });
      }

      let rawMessages: string[];

      if (contentType.includes("application/json")) {
        const body = req.body;
        rawMessages = Array.isArray(body) ? body : [typeof body === "string" ? body : JSON.stringify(body)];
      } else {
        const textBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        rawMessages = textBody.split("\n").filter((line: string) => line.trim());
      }

      const events = rawMessages.map((msg: string) => ({
        rawMessage: msg,
        source: "syslog",
        receivedAt: new Date().toISOString(),
        facility: parseSyslogFacility(msg),
        severity: parseSyslogSeverity(msg),
      }));

      await publishEvents(tenantId, "syslog", events, config);
      config.onEventsReceived(events.length);

      res.json({
        accepted: events.length,
        source: "syslog",
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      config.onError();
      console.error(`[PushReceiver] Syslog error: ${err.message}`);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  router.post("/hec", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string, 10) || 0;
      const token = req.headers.authorization?.replace("Splunk ", "") || req.headers["x-api-key"] as string;

      if (!token) {
        return res.status(401).json({ error: "Missing authorization" });
      }

      if (!tenantId) {
        return res.status(400).json({ error: "Missing x-tenant-id header" });
      }

      let events: Record<string, any>[];
      const body = req.body;

      if (Array.isArray(body)) {
        events = body.map((e: any) => e.event || e);
      } else if (body?.event) {
        events = [body.event];
      } else if (body && typeof body === "object") {
        events = [body];
      } else {
        return res.status(400).json({ error: "Invalid HEC payload" });
      }

      await publishEvents(tenantId, "hec", events, config);
      config.onEventsReceived(events.length);

      res.json({ text: "Success", code: 0, ackId: Date.now() });
    } catch (err: any) {
      config.onError();
      console.error(`[PushReceiver] HEC error: ${err.message}`);
      res.status(500).json({ text: "Internal server error", code: 8 });
    }
  });

  router.post("/raw", async (req: Request, res: Response) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      if (!apiKey) {
        return res.status(401).json({ error: "Missing x-api-key header" });
      }

      const claimedTenantId = parseInt(req.headers["x-tenant-id"] as string, 10) || 0;
      if (!claimedTenantId) {
        return res.status(400).json({ error: "Missing x-tenant-id header" });
      }

      let tenantId = claimedTenantId;
      if (config.managementPlaneUrl) {
        let verified = false;
        try {
          const internalSecret = process.env.COLLECTOR_INTERNAL_SECRET;
          const hdrs: Record<string, string> = { "Content-Type": "application/json" };
          if (internalSecret) hdrs["x-internal-secret"] = internalSecret;
          const verifyResp = await fetch(
            `${config.managementPlaneUrl}/api/log-sources/verify-key?tenantId=${claimedTenantId}&key=${encodeURIComponent(apiKey)}`,
            { headers: hdrs, signal: AbortSignal.timeout(5000) }
          );
          if (!verifyResp.ok) {
            return res.status(401).json({ error: "Invalid or unauthorized API key for tenant" });
          }
          const verifyData = await verifyResp.json() as { tenantId?: number };
          if (verifyData.tenantId) tenantId = verifyData.tenantId;
          verified = true;
        } catch (verifyErr: any) {
          console.warn(`[PushReceiver] API key verification failed: ${verifyErr.message}`);
          return res.status(503).json({ error: "Authorization service unavailable — request rejected" });
        }
        if (!verified) {
          return res.status(401).json({ error: "API key verification incomplete" });
        }
      }

      const source = (req.headers["x-source"] as string) || "raw-webhook";
      const contentType = req.headers["content-type"] || "";

      const bodyToString = (body: any): string => {
        if (typeof body === "string") return body;
        if (Buffer.isBuffer(body)) return body.toString("utf8");
        if (body && typeof body === "object") return JSON.stringify(body);
        return String(body ?? "");
      };

      let rawLines: string[] = [];

      if (contentType.includes("application/json")) {
        const body = req.body;
        if (Array.isArray(body)) {
          rawLines = body.map((l) => (typeof l === "string" ? l : JSON.stringify(l)));
        } else if (typeof body === "string") {
          rawLines = body.split("\n").filter((l) => l.trim());
        } else {
          rawLines = [bodyToString(body)];
        }
      } else {
        const rawText = bodyToString(req.body);
        rawLines = rawText.split("\n").filter((l) => l.trim());
      }

      if (rawLines.length === 0) {
        return res.json({ accepted: 0, message: "No log lines to process" });
      }

      let events: Record<string, any>[];
      if (config.managementPlaneUrl) {
        const srcIp = (req.headers["x-source-ip"] as string) || req.socket.remoteAddress || "unknown";
        events = await aiPreParseEvents(tenantId, rawLines, srcIp, config.managementPlaneUrl);
      } else {
        events = rawLines.map((line) => ({
          rawMessage: line,
          source,
          receivedAt: new Date().toISOString(),
        }));
      }

      await publishEvents(tenantId, source, events, config);
      config.onEventsReceived(events.length);

      res.json({
        accepted: events.length,
        source,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      config.onError();
      console.error(`[PushReceiver] Raw webhook error: ${err.message}`);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  return router;
}

async function publishEvents(
  tenantId: number,
  source: string,
  events: Record<string, any>[],
  config: PushReceiverConfig
) {
  if (!config.kafkaBrokers) return;

  try {
    const { publishEvents: kafkaPublish } = await import("../../../server/kafka/producer");
    const messages = events.map((evt) => ({
      tenantId,
      source,
      payload: evt,
      timestamp: evt.timestamp || evt.occurredAt || new Date().toISOString(),
      traceId: `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));

    const result = await kafkaPublish(KAFKA_TOPICS.RAW_EVENTS, messages);
    if (!result.success) {
      console.warn(`[PushReceiver] Kafka publish failed: ${result.error}`);
    }
  } catch (err: any) {
    console.warn(`[PushReceiver] Kafka unavailable: ${err.message}`);
  }
}

export type TenantResolver = (srcIp: string) => Promise<number | null>;

export interface SyslogServerConfig {
  kafkaBrokers: string;
  defaultTenantId: number;
  onEventsReceived: (count: number) => void;
  onError: () => void;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  allowedSourceIps?: string[];
  requireSourceToken?: boolean;
  resolveTenant?: TenantResolver;
  managementPlaneUrl?: string;
}

async function aiPreParseEvents(
  tenantId: number,
  rawLines: string[],
  srcIp: string,
  managementPlaneUrl: string
): Promise<Record<string, any>[]> {
  try {
    const internalSecret = process.env.COLLECTOR_INTERNAL_SECRET;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (internalSecret) headers["x-internal-secret"] = internalSecret;
    const resp = await fetch(`${managementPlaneUrl}/api/log-parse-raw`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rawLogs: rawLines, tenantId, sourceIp: srcIp }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const data = await resp.json() as { events?: Record<string, any>[] };
      if (Array.isArray(data.events)) return data.events;
    }
  } catch (err) {
    console.warn('[Collector] aiPreParseEvents failed — falling back to raw passthrough', { srcIp, error: (err as Error).message });
  }
  return rawLines.map((line) => ({ rawMessage: line, srcIp, receivedAt: new Date().toISOString() }));
}

function isSyslogSourceAllowed(srcIp: string, config: SyslogServerConfig): boolean {
  const cleanIp = srcIp.replace(/^::ffff:/, "");
  if (config.allowedSourceIps && config.allowedSourceIps.length > 0) {
    return config.allowedSourceIps.includes(cleanIp) || config.allowedSourceIps.includes(srcIp);
  }
  return false;
}

export function createSyslogUdpServer(port: number, config: SyslogServerConfig): dgram.Socket {
  const allowedIps = process.env.SYSLOG_ALLOWED_IPS
    ? process.env.SYSLOG_ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean)
    : config.allowedSourceIps;
  const resolvedConfig = { ...config, allowedSourceIps: allowedIps };
  const socket = dgram.createSocket("udp4");

  socket.on("message", async (msg, rinfo) => {
    const srcIp = rinfo.address.replace(/^::ffff:/, "");
    if (!isSyslogSourceAllowed(srcIp, resolvedConfig)) {
      console.warn(`[SyslogUDP] Rejected datagram from unlisted IP: ${srcIp}`);
      resolvedConfig.onError();
      return;
    }

    const tenantId = resolvedConfig.resolveTenant
      ? (await resolvedConfig.resolveTenant(srcIp).catch(() => null)) ?? resolvedConfig.defaultTenantId
      : resolvedConfig.defaultTenantId;

    const rawMessage = msg.toString("utf8");
    const lines = rawMessage.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;

    let events: Record<string, any>[];
    if (resolvedConfig.managementPlaneUrl) {
      events = await aiPreParseEvents(tenantId, lines, srcIp, resolvedConfig.managementPlaneUrl);
    } else {
      events = lines.map((line) => ({
        rawMessage: line,
        source: "syslog-udp",
        srcIp,
        srcPort: rinfo.port,
        receivedAt: new Date().toISOString(),
        facility: parseSyslogFacility(line),
        severity: parseSyslogSeverity(line),
      }));
    }

    await publishEvents(tenantId, "syslog-udp", events, resolvedConfig);
    resolvedConfig.onEventsReceived(events.length);
  });

  socket.on("error", (err) => {
    console.error(`[SyslogUDP] Error: ${err.message}`);
    config.onError();
  });

  if (!allowedIps || allowedIps.length === 0) {
    throw new Error("[SyslogUDP] SYSLOG_ALLOWED_IPS must be set — syslog listeners require an explicit IP allowlist for tenant isolation. Set SYSLOG_ALLOWED_IPS=comma-separated-source-ips.");
  }

  socket.bind(port, () => {
    console.log(`[SyslogUDP] Listening on UDP port ${port} (allowlist: ${allowedIps.join(",")})`);
  });

  return socket;
}

function handleSyslogTcpConnection(
  socket: net.Socket | tls.TLSSocket,
  config: SyslogServerConfig,
  proto: string
) {
  const remoteIp = (socket.remoteAddress || "unknown").replace(/^::ffff:/, "");

  if (!isSyslogSourceAllowed(remoteIp, config)) {
    console.warn(`[${proto}] Rejected connection from unlisted IP: ${remoteIp}`);
    config.onError();
    socket.destroy();
    return;
  }

  let buffer = "";
  let resolvedTenantId: number | null = null;

  const getTenantId = async (): Promise<number> => {
    if (resolvedTenantId !== null) return resolvedTenantId;
    if (config.resolveTenant) {
      resolvedTenantId = (await config.resolveTenant(remoteIp).catch(() => null)) ?? config.defaultTenantId;
    } else {
      resolvedTenantId = config.defaultTenantId;
    }
    return resolvedTenantId;
  };

  socket.on("data", async (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    const validLines = lines.filter((l) => l.trim());
    if (validLines.length === 0) return;

    const tenantId = await getTenantId();
    let events: Record<string, any>[];
    if (config.managementPlaneUrl) {
      events = await aiPreParseEvents(tenantId, validLines, remoteIp, config.managementPlaneUrl);
    } else {
      events = validLines.map((line) => ({
        rawMessage: line,
        source: proto,
        srcIp: remoteIp,
        srcPort: socket.remotePort || 0,
        receivedAt: new Date().toISOString(),
        facility: parseSyslogFacility(line),
        severity: parseSyslogSeverity(line),
      }));
    }

    await publishEvents(tenantId, proto, events, config);
    config.onEventsReceived(events.length);
  });

  socket.on("error", (err) => {
    console.warn(`[${proto}] Socket error from ${remoteIp}: ${err.message}`);
  });
}

export function createSyslogTcpServer(port: number, config: SyslogServerConfig): net.Server {
  const allowedIps = process.env.SYSLOG_ALLOWED_IPS
    ? process.env.SYSLOG_ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean)
    : config.allowedSourceIps;

  if (!allowedIps || allowedIps.length === 0) {
    throw new Error("[SyslogTCP] SYSLOG_ALLOWED_IPS must be set — syslog listeners require an explicit IP allowlist for tenant isolation. Set SYSLOG_ALLOWED_IPS=comma-separated-source-ips.");
  }

  const resolvedConfig = { ...config, allowedSourceIps: allowedIps };

  const server = net.createServer((socket) => {
    handleSyslogTcpConnection(socket, resolvedConfig, "syslog-tcp");
  });

  server.on("error", (err) => {
    console.error(`[SyslogTCP] Error: ${err.message}`);
    config.onError();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[SyslogTCP] Listening on TCP port ${port} (allowlist: ${allowedIps.join(",")})`);
  });

  return server;
}

export function createSyslogTlsServer(port: number, config: SyslogServerConfig): tls.Server | null {
  const certPath = config.tlsCertPath || process.env.SYSLOG_TLS_CERT;
  const keyPath = config.tlsKeyPath || process.env.SYSLOG_TLS_KEY;

  if (!certPath || !keyPath) {
    console.warn(`[SyslogTLS] No TLS cert/key configured — skipping TLS server on port ${port}`);
    return null;
  }

  const allowedIps = process.env.SYSLOG_ALLOWED_IPS
    ? process.env.SYSLOG_ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean)
    : config.allowedSourceIps;

  if (!allowedIps || allowedIps.length === 0) {
    throw new Error("[SyslogTLS] SYSLOG_ALLOWED_IPS must be set — syslog listeners require an explicit IP allowlist for tenant isolation.");
  }

  const resolvedTlsConfig = { ...config, allowedSourceIps: allowedIps };

  try {
    const options: tls.TlsOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };

    const server = tls.createServer(options, (socket) => {
      handleSyslogTcpConnection(socket, resolvedTlsConfig, "syslog-tls");
    });

    server.on("error", (err) => {
      console.error(`[SyslogTLS] Error: ${err.message}`);
      config.onError();
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(`[SyslogTLS] Listening on TLS port ${port} (allowlist: ${allowedIps.join(",")})`);
    });

    return server;
  } catch (err: unknown) {
    console.error(`[SyslogTLS] Failed to create TLS server: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function parseSyslogFacility(message: string): string {
  const match = message.match(/^<(\d+)>/);
  if (!match) return "user";
  const pri = parseInt(match[1], 10);
  const facility = Math.floor(pri / 8);
  const facilities = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news",
    "uucp", "cron", "authpriv", "ftp", "ntp", "audit", "alert", "clock",
    "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
  return facilities[facility] || "user";
}

function parseSyslogSeverity(message: string): string {
  const match = message.match(/^<(\d+)>/);
  if (!match) return "info";
  const pri = parseInt(match[1], 10);
  const severity = pri % 8;
  const severities = ["emergency", "alert", "critical", "error", "warning", "notice", "info", "debug"];
  return severities[severity] || "info";
}
