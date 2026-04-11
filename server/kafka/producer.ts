import { Kafka, Producer, CompressionTypes, type Message } from "kafkajs";
import type { KafkaTopic } from "./topics";

let producer: Producer | null = null;
let kafka: Kafka | null = null;
let connected = false;

const BATCH_SIZE = 500;
const LINGER_MS = 100;
const MAX_RETRIES = 5;

export function getKafkaInstance(): Kafka | null {
  if (kafka) return kafka;
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return null;
  kafka = new Kafka({
    clientId: `secureops-${process.env.PLANE || "monolith"}-${process.env.HOSTNAME || "local"}`,
    brokers: brokers.split(",").map((b) => b.trim()),
    retry: {
      initialRetryTime: 300,
      retries: MAX_RETRIES,
      maxRetryTime: 30000,
      factor: 2,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  });
  return kafka;
}

export async function getProducer(): Promise<Producer | null> {
  if (producer && connected) return producer;
  const k = getKafkaInstance();
  if (!k) return null;

  try {
    producer = k.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
      maxInFlightRequests: 5,
      transactionTimeout: 60000,
    });

    await producer.connect();
    connected = true;

    producer.on("producer.disconnect", () => {
      connected = false;
      console.log("[Kafka Producer] Disconnected");
    });

    console.log("[Kafka Producer] Connected");
    return producer;
  } catch (err: any) {
    console.error(`[Kafka Producer] Connection failed: ${err.message}`);
    return null;
  }
}

export interface EventMessage {
  tenantId: number;
  source: string;
  payload: Record<string, any>;
  timestamp?: string;
  traceId?: string;
}

export async function publishEvents(
  topic: KafkaTopic,
  events: EventMessage[]
): Promise<{ success: boolean; count: number; error?: string }> {
  const p = await getProducer();
  if (!p) {
    return { success: false, count: 0, error: "Kafka producer not available" };
  }

  try {
    const messages: Message[] = events.map((evt) => ({
      key: String(evt.tenantId),
      value: JSON.stringify({
        tenantId: evt.tenantId,
        source: evt.source,
        payload: evt.payload,
        timestamp: evt.timestamp || new Date().toISOString(),
        traceId: evt.traceId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        publishedAt: new Date().toISOString(),
      }),
      timestamp: String(Date.now()),
    }));

    let sent = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await p.send({
        topic,
        messages: batch,
        compression: CompressionTypes.Snappy,
        acks: -1,
        timeout: 30000,
      });
      sent += batch.length;
    }

    return { success: true, count: sent };
  } catch (err: any) {
    console.error(`[Kafka Producer] Publish failed to ${topic}: ${err.message}`);
    return { success: false, count: 0, error: err.message };
  }
}

export async function publishSingle(
  topic: KafkaTopic,
  event: EventMessage
): Promise<boolean> {
  const result = await publishEvents(topic, [event]);
  return result.success;
}

export async function disconnectProducer(): Promise<void> {
  if (producer && connected) {
    try {
      await producer.disconnect();
    } catch {}
    connected = false;
    producer = null;
  }
}
