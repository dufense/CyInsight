import { publishEvents, type EventMessage } from "./producer";
import { KAFKA_TOPICS } from "./topics";

export interface PipelineMetric {
  service: string;
  metric: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

const metricsBuffer: PipelineMetric[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL_MS = 10000;
const serviceName = process.env.SERVICE_NAME || process.env.PLANE || "monolith";
const instanceId = process.env.HOSTNAME || `local-${process.pid}`;

const counters: Record<string, number> = {};
const gauges: Record<string, number> = {};
const histograms: Record<string, number[]> = {};

export function incrementCounter(name: string, delta = 1, tags?: Record<string, string>): void {
  const key = `${name}:${JSON.stringify(tags || {})}`;
  counters[key] = (counters[key] || 0) + delta;
}

export function setGauge(name: string, value: number, tags?: Record<string, string>): void {
  const key = `${name}:${JSON.stringify(tags || {})}`;
  gauges[key] = value;
}

export function recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
  const key = `${name}:${JSON.stringify(tags || {})}`;
  if (!histograms[key]) histograms[key] = [];
  histograms[key].push(value);
  if (histograms[key].length > 1000) {
    histograms[key] = histograms[key].slice(-500);
  }
}

export function recordProcessingLatency(stage: string, latencyMs: number): void {
  recordHistogram(`${stage}.latency_ms`, latencyMs);
  incrementCounter(`${stage}.processed`);
}

export function recordError(stage: string, errorType: string): void {
  incrementCounter(`${stage}.errors`, 1, { errorType });
}

export function recordThroughput(stage: string, count: number): void {
  incrementCounter(`${stage}.throughput`, count);
}

async function flushMetrics(): Promise<void> {
  const metrics: PipelineMetric[] = [];
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(counters)) {
    const [name, tagsStr] = key.split(":");
    metrics.push({
      service: serviceName,
      metric: name,
      value,
      unit: "count",
      tags: JSON.parse(tagsStr || "{}"),
    });
  }

  for (const [key, value] of Object.entries(gauges)) {
    const [name, tagsStr] = key.split(":");
    metrics.push({
      service: serviceName,
      metric: name,
      value,
      unit: "gauge",
      tags: JSON.parse(tagsStr || "{}"),
    });
  }

  for (const [key, values] of Object.entries(histograms)) {
    if (values.length === 0) continue;
    const [name, tagsStr] = key.split(":");
    const sorted = [...values].sort((a, b) => a - b);
    const tags = JSON.parse(tagsStr || "{}");
    metrics.push(
      { service: serviceName, metric: `${name}.p50`, value: sorted[Math.floor(sorted.length * 0.5)], unit: "ms", tags },
      { service: serviceName, metric: `${name}.p95`, value: sorted[Math.floor(sorted.length * 0.95)], unit: "ms", tags },
      { service: serviceName, metric: `${name}.p99`, value: sorted[Math.floor(sorted.length * 0.99)], unit: "ms", tags },
      { service: serviceName, metric: `${name}.avg`, value: values.reduce((a, b) => a + b, 0) / values.length, unit: "ms", tags }
    );
  }

  if (metrics.length === 0) return;

  const events: EventMessage[] = [{
    tenantId: 0,
    source: serviceName,
    payload: {
      type: "pipeline_metrics",
      instanceId,
      metrics,
      collectedAt: now,
    },
  }];

  try {
    await publishEvents(KAFKA_TOPICS.PIPELINE_METRICS, events);
  } catch {}

  Object.keys(counters).forEach((k) => delete counters[k]);
  Object.keys(histograms).forEach((k) => (histograms[k] = []));
}

export function startMetricsReporter(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushMetrics, FLUSH_INTERVAL_MS);
  console.log(`[Metrics] Reporter started (flush every ${FLUSH_INTERVAL_MS / 1000}s)`);
}

export function stopMetricsReporter(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function getLocalMetrics(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histogramSummaries: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number }>;
} {
  const summaries: Record<string, any> = {};
  for (const [key, values] of Object.entries(histograms)) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    summaries[key] = {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
  return { counters: { ...counters }, gauges: { ...gauges }, histogramSummaries: summaries };
}
