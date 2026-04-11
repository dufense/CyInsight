import { Consumer, type EachBatchPayload, type EachMessagePayload } from "kafkajs";
import { getKafkaInstance } from "./producer";
import type { KafkaTopic } from "./topics";
import { KAFKA_TOPICS } from "./topics";
import { publishEvents, type EventMessage } from "./producer";

export interface ConsumerConfig {
  groupId: string;
  topics: KafkaTopic[];
  batchSize?: number;
  concurrency?: number;
  fromBeginning?: boolean;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxWaitTimeInMs?: number;
}

export interface BatchHandler {
  (messages: ParsedMessage[]): Promise<void>;
}

export interface MessageHandler {
  (message: ParsedMessage): Promise<void>;
}

export interface ParsedMessage {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: Record<string, any>;
  timestamp: string;
  headers?: Record<string, string>;
}

export class KafkaConsumerGroup {
  private consumer: Consumer | null = null;
  private running = false;
  private paused = false;
  private config: ConsumerConfig;
  private processedCount = 0;
  private errorCount = 0;
  private lastProcessedAt: Date | null = null;
  private startedAt: Date | null = null;

  constructor(config: ConsumerConfig) {
    this.config = {
      batchSize: 100,
      concurrency: 5,
      fromBeginning: false,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000,
      ...config,
    };
  }

  async start(handler: BatchHandler): Promise<boolean> {
    const kafka = getKafkaInstance();
    if (!kafka) {
      console.error(`[KafkaConsumer:${this.config.groupId}] Kafka not configured`);
      return false;
    }

    try {
      this.consumer = kafka.consumer({
        groupId: this.config.groupId,
        sessionTimeout: this.config.sessionTimeout,
        heartbeatInterval: this.config.heartbeatInterval,
        maxWaitTimeInMs: this.config.maxWaitTimeInMs,
        retry: { retries: 10, initialRetryTime: 300, maxRetryTime: 30000 },
      });

      await this.consumer.connect();

      for (const topic of this.config.topics) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: this.config.fromBeginning,
        });
      }

      this.running = true;
      this.startedAt = new Date();

      await this.consumer.run({
        eachBatchAutoResolve: false,
        eachBatch: async (payload: EachBatchPayload) => {
          if (this.paused) return;

          const { batch, resolveOffset, heartbeat, isRunning, isStale } = payload;
          const messages: ParsedMessage[] = [];

          for (const message of batch.messages) {
            if (!isRunning() || isStale()) break;

            try {
              const parsed: ParsedMessage = {
                topic: batch.topic,
                partition: batch.partition,
                offset: message.offset,
                key: message.key?.toString() || null,
                value: message.value ? JSON.parse(message.value.toString()) : {},
                timestamp: message.timestamp,
                headers: message.headers
                  ? Object.fromEntries(
                      Object.entries(message.headers).map(([k, v]) => [
                        k,
                        v?.toString() || "",
                      ])
                    )
                  : undefined,
              };
              messages.push(parsed);
            } catch (parseErr: any) {
              this.errorCount++;
              await this.sendToDLQ(batch.topic, message, parseErr.message);
              resolveOffset(message.offset);
            }
          }

          if (messages.length === 0) return;

          const batchSize = this.config.batchSize!;
          for (let i = 0; i < messages.length; i += batchSize) {
            if (!isRunning() || isStale()) break;

            const chunk = messages.slice(i, i + batchSize);
            try {
              await handler(chunk);
              this.processedCount += chunk.length;
              this.lastProcessedAt = new Date();

              const lastMsg = chunk[chunk.length - 1];
              resolveOffset(lastMsg.offset);
              await heartbeat();
            } catch (err: any) {
              this.errorCount += chunk.length;
              console.error(
                `[KafkaConsumer:${this.config.groupId}] Batch processing error: ${err.message}`
              );

              for (const msg of chunk) {
                await this.sendToDLQ(msg.topic, msg, err.message);
              }
              const lastMsg = chunk[chunk.length - 1];
              resolveOffset(lastMsg.offset);
              await heartbeat();
            }
          }
        },
      });

      console.log(
        `[KafkaConsumer:${this.config.groupId}] Started, subscribed to: ${this.config.topics.join(", ")}`
      );
      return true;
    } catch (err: any) {
      console.error(
        `[KafkaConsumer:${this.config.groupId}] Failed to start: ${err.message}`
      );
      return false;
    }
  }

  async pause(): Promise<void> {
    this.paused = true;
    if (this.consumer) {
      try {
        this.consumer.pause(
          this.config.topics.map((t) => ({ topic: t }))
        );
      } catch {}
    }
    console.log(`[KafkaConsumer:${this.config.groupId}] Paused`);
  }

  async resume(): Promise<void> {
    this.paused = false;
    if (this.consumer) {
      try {
        this.consumer.resume(
          this.config.topics.map((t) => ({ topic: t }))
        );
      } catch {}
    }
    console.log(`[KafkaConsumer:${this.config.groupId}] Resumed`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch {}
      this.consumer = null;
    }
    console.log(`[KafkaConsumer:${this.config.groupId}] Stopped`);
  }

  getStats() {
    return {
      groupId: this.config.groupId,
      running: this.running,
      paused: this.paused,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      lastProcessedAt: this.lastProcessedAt?.toISOString() || null,
      startedAt: this.startedAt?.toISOString() || null,
    };
  }

  private async sendToDLQ(
    originalTopic: string,
    message: any,
    error: string
  ): Promise<void> {
    try {
      const dlqEvent: EventMessage = {
        tenantId: 0,
        source: "dlq",
        payload: {
          originalTopic,
          originalOffset: message.offset,
          originalPartition: message.partition,
          originalValue:
            typeof message.value === "string"
              ? message.value
              : message.value?.toString?.() || JSON.stringify(message.value || {}),
          error,
          failedAt: new Date().toISOString(),
          consumerGroup: this.config.groupId,
        },
      };
      await publishEvents(KAFKA_TOPICS.DLQ, [dlqEvent]);
    } catch {}
  }
}
