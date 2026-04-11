import type { ITopicConfig } from "kafkajs";

export const KAFKA_TOPICS = {
  RAW_EVENTS: "secureops.events.raw",
  NORMALIZED_EVENTS: "secureops.events.normalized",
  ENRICHED_EVENTS: "secureops.events.enriched",
  ALERTS: "secureops.events.alerts",
  DLQ: "secureops.events.dlq",
  POLLING_COMMANDS: "secureops.commands.polling",
  PIPELINE_METRICS: "secureops.metrics.pipeline",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export interface TopicDefinition {
  topic: string;
  numPartitions: number;
  replicationFactor: number;
  retentionMs: number;
  description: string;
}

export const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    topic: KAFKA_TOPICS.RAW_EVENTS,
    numPartitions: 24,
    replicationFactor: 3,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    description: "Raw events from all connectors and push sources, keyed by tenantId",
  },
  {
    topic: KAFKA_TOPICS.NORMALIZED_EVENTS,
    numPartitions: 24,
    replicationFactor: 3,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    description: "Normalized events after vendor-specific field mapping",
  },
  {
    topic: KAFKA_TOPICS.ENRICHED_EVENTS,
    numPartitions: 12,
    replicationFactor: 3,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    description: "Events enriched with MITRE, IOC, Sigma, and confidence scoring",
  },
  {
    topic: KAFKA_TOPICS.ALERTS,
    numPartitions: 6,
    replicationFactor: 3,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    description: "Confirmed alerts/incidents ready for storage and notification",
  },
  {
    topic: KAFKA_TOPICS.DLQ,
    numPartitions: 3,
    replicationFactor: 3,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    description: "Dead letter queue for events that failed processing",
  },
  {
    topic: KAFKA_TOPICS.POLLING_COMMANDS,
    numPartitions: 6,
    replicationFactor: 3,
    retentionMs: 24 * 60 * 60 * 1000,
    description: "Commands from management plane to collector instances",
  },
  {
    topic: KAFKA_TOPICS.PIPELINE_METRICS,
    numPartitions: 3,
    replicationFactor: 3,
    retentionMs: 3 * 24 * 60 * 60 * 1000,
    description: "Pipeline telemetry and performance metrics from all services",
  },
];

export function getTopicConfigs(replicationFactor?: number): ITopicConfig[] {
  const rf = replicationFactor || 1;
  return TOPIC_DEFINITIONS.map((def) => ({
    topic: def.topic,
    numPartitions: def.numPartitions,
    replicationFactor: Math.min(rf, def.replicationFactor),
    configEntries: [
      { name: "retention.ms", value: String(def.retentionMs) },
      { name: "cleanup.policy", value: "delete" },
      { name: "compression.type", value: "snappy" },
    ],
  }));
}
