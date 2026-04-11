import { Router, type Request, type Response } from "express";
import { KAFKA_TOPICS } from "../../../server/kafka/topics";

interface PushReceiverConfig {
  kafkaBrokers: string;
  onEventsReceived: (count: number) => void;
  onError: () => void;
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
