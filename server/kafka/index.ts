export { KAFKA_TOPICS, TOPIC_DEFINITIONS, type KafkaTopic, type TopicDefinition, getTopicConfigs } from "./topics";
export { getKafkaInstance, getProducer, publishEvents, publishSingle, disconnectProducer, type EventMessage } from "./producer";
export { KafkaConsumerGroup, type ConsumerConfig, type BatchHandler, type MessageHandler, type ParsedMessage } from "./consumer";
export { ensureTopicsExist, getTopicHealth, getConsumerGroupLag } from "./admin";
export {
  incrementCounter, setGauge, recordHistogram,
  recordProcessingLatency, recordError, recordThroughput,
  startMetricsReporter, stopMetricsReporter, getLocalMetrics,
} from "./metrics";
