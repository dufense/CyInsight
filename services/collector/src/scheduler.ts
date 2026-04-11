import { KAFKA_TOPICS } from "../../../server/kafka/topics";

interface ConnectorConfig {
  id: number;
  tenantId: number;
  platformKey: string;
  apiBaseUrl: string;
  authType: string;
  configJson: Record<string, any>;
  pollingIntervalMinutes: number;
  lastPollAt: string | null;
  isActive: boolean;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
  isOpen: boolean;
}

interface SchedulerConfig {
  concurrency: number;
  maxEventsPerCycle: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
  kafkaBrokers: string;
  managementPlaneUrl: string;
  onEventsCollected: (count: number) => void;
  onError: () => void;
}

interface PollResult {
  tenantId: number;
  connectorId: number;
  platformKey: string;
  eventsCollected: number;
  hasMore: boolean;
  durationMs: number;
  error?: string;
}

export class CollectorScheduler {
  private config: SchedulerConfig;
  private running = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private activePollCount = 0;
  private metrics = {
    totalPolls: 0,
    successfulPolls: 0,
    failedPolls: 0,
    totalEventsCollected: 0,
    lastCycleStartTime: null as string | null,
    lastCycleDurationMs: 0,
    averagePollDurationMs: 0,
    pollDurations: [] as number[],
  };

  private registeredConnectors = [
    "checkpoint_hec",
    "crowdstrike",
    "cynet",
    "azure_ad",
    "generic_syslog",
  ];

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  isRunning(): boolean {
    return this.running;
  }

  getActiveConnectorCount(): number {
    return this.activePollCount;
  }

  getRegisteredConnectors(): string[] {
    return [...this.registeredConnectors];
  }

  getCircuitBreakerStatus(): Record<string, { isOpen: boolean; failures: number; cooldownUntil: string | null }> {
    const status: Record<string, any> = {};
    for (const [key, cb] of this.circuitBreakers) {
      status[key] = {
        isOpen: cb.isOpen,
        failures: cb.failures,
        cooldownUntil: cb.isOpen ? new Date(cb.cooldownUntil).toISOString() : null,
      };
    }
    return status;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activePollCount: this.activePollCount,
      circuitBreakers: this.getCircuitBreakerStatus(),
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[Scheduler] Starting with concurrency=${this.config.concurrency}, maxEvents=${this.config.maxEventsPerCycle}`);

    this.runPollCycle();

    this.pollInterval = setInterval(() => {
      this.runPollCycle();
    }, 60_000);
  }

  stop() {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log("[Scheduler] Stopped");
  }

  async pollTenantNow(tenantId: number): Promise<PollResult[]> {
    const connectors = await this.fetchTenantConnectors(tenantId);
    if (connectors.length === 0) {
      return [{ tenantId, connectorId: 0, platformKey: "none", eventsCollected: 0, hasMore: false, durationMs: 0, error: "No active connectors" }];
    }

    const results: PollResult[] = [];
    for (const connector of connectors) {
      const result = await this.pollConnector(connector);
      results.push(result);
    }
    return results;
  }

  private async runPollCycle() {
    if (!this.running) return;

    const cycleStart = Date.now();
    this.metrics.lastCycleStartTime = new Date().toISOString();

    try {
      const connectors = await this.fetchAllDueConnectors();
      if (connectors.length === 0) return;

      console.log(`[Scheduler] Poll cycle: ${connectors.length} connectors due`);

      const queue = [...connectors];
      const results: PollResult[] = [];

      const workers = Array.from({ length: Math.min(this.config.concurrency, queue.length) }, async () => {
        while (queue.length > 0 && this.running) {
          const connector = queue.shift();
          if (!connector) break;

          const cbKey = `${connector.tenantId}:${connector.platformKey}`;
          if (this.isCircuitOpen(cbKey)) {
            console.log(`[Scheduler] Circuit breaker open for ${cbKey}, skipping`);
            continue;
          }

          this.activePollCount++;
          try {
            const result = await this.pollConnector(connector);
            results.push(result);

            if (result.error) {
              this.recordFailure(cbKey);
            } else {
              this.recordSuccess(cbKey);
            }

            if (result.hasMore && result.eventsCollected < this.config.maxEventsPerCycle) {
              let continuationEvents = result.eventsCollected;
              let continuationRounds = 0;
              const MAX_CONTINUATION_ROUNDS = 10;

              while (result.hasMore && continuationEvents < this.config.maxEventsPerCycle && continuationRounds < MAX_CONTINUATION_ROUNDS && this.running) {
                continuationRounds++;
                const contResult = await this.pollConnector(connector);
                results.push(contResult);
                continuationEvents += contResult.eventsCollected;
                if (contResult.error || !contResult.hasMore) break;
              }
            }
          } finally {
            this.activePollCount--;
          }
        }
      });

      await Promise.allSettled(workers);

      const totalEvents = results.reduce((sum, r) => sum + r.eventsCollected, 0);
      const cycleDuration = Date.now() - cycleStart;

      this.metrics.lastCycleDurationMs = cycleDuration;
      this.metrics.totalEventsCollected += totalEvents;

      if (totalEvents > 0) {
        console.log(`[Scheduler] Cycle complete: ${totalEvents} events from ${results.length} polls in ${cycleDuration}ms`);
      }
    } catch (err: any) {
      console.error(`[Scheduler] Cycle error: ${err.message}`);
    }
  }

  private async pollConnector(connector: ConnectorConfig): Promise<PollResult> {
    const startTime = Date.now();
    this.metrics.totalPolls++;

    try {
      const response = await fetch(`${this.config.managementPlaneUrl}/api/integrations/${connector.id}/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      const events = data.events || [];
      const durationMs = Date.now() - startTime;

      if (events.length > 0) {
        await this.publishToKafka(connector.tenantId, connector.platformKey, events);
        this.config.onEventsCollected(events.length);
      }

      this.metrics.successfulPolls++;
      this.trackPollDuration(durationMs);

      return {
        tenantId: connector.tenantId,
        connectorId: connector.id,
        platformKey: connector.platformKey,
        eventsCollected: events.length,
        hasMore: data.hasMore || false,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.metrics.failedPolls++;
      this.config.onError();

      console.error(`[Scheduler] Poll failed for ${connector.platformKey} (tenant ${connector.tenantId}): ${err.message}`);

      return {
        tenantId: connector.tenantId,
        connectorId: connector.id,
        platformKey: connector.platformKey,
        eventsCollected: 0,
        hasMore: false,
        durationMs,
        error: err.message,
      };
    }
  }

  private async publishToKafka(tenantId: number, source: string, events: Record<string, any>[]) {
    if (!this.config.kafkaBrokers) return;

    try {
      const { publishEvents } = await import("../../../server/kafka/producer");
      const messages = events.map((evt) => ({
        tenantId,
        source,
        payload: evt,
        timestamp: evt.occurredAt || new Date().toISOString(),
        traceId: `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }));

      const result = await publishEvents(KAFKA_TOPICS.RAW_EVENTS, messages);
      if (!result.success) {
        console.warn(`[Scheduler] Kafka publish failed: ${result.error}`);
      }
    } catch (err: any) {
      console.warn(`[Scheduler] Kafka unavailable, events processed directly: ${err.message}`);
    }
  }

  private async fetchAllDueConnectors(): Promise<ConnectorConfig[]> {
    try {
      const response = await fetch(`${this.config.managementPlaneUrl}/api/integrations?status=active`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return [];

      const integrations = await response.json() as any[];
      const now = Date.now();

      return integrations
        .filter((i: any) => {
          if (!i.isActive) return false;
          if (!i.lastPollAt) return true;
          const lastPoll = new Date(i.lastPollAt).getTime();
          const intervalMs = (i.pollingIntervalMinutes || 15) * 60 * 1000;
          return now - lastPoll >= intervalMs;
        })
        .map((i: any) => ({
          id: i.id,
          tenantId: i.tenantId,
          platformKey: i.platformKey,
          apiBaseUrl: i.apiBaseUrl || "",
          authType: i.authType || "api_key",
          configJson: i.configJson || {},
          pollingIntervalMinutes: i.pollingIntervalMinutes || 15,
          lastPollAt: i.lastPollAt || null,
          isActive: i.isActive,
        }));
    } catch (err: any) {
      console.error(`[Scheduler] Failed to fetch connectors: ${err.message}`);
      return [];
    }
  }

  private async fetchTenantConnectors(tenantId: number): Promise<ConnectorConfig[]> {
    try {
      const response = await fetch(`${this.config.managementPlaneUrl}/api/integrations?tenantId=${tenantId}&status=active`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return [];

      const integrations = await response.json() as any[];
      return integrations
        .filter((i: any) => i.isActive && i.tenantId === tenantId)
        .map((i: any) => ({
          id: i.id,
          tenantId: i.tenantId,
          platformKey: i.platformKey,
          apiBaseUrl: i.apiBaseUrl || "",
          authType: i.authType || "api_key",
          configJson: i.configJson || {},
          pollingIntervalMinutes: i.pollingIntervalMinutes || 15,
          lastPollAt: i.lastPollAt || null,
          isActive: i.isActive,
        }));
    } catch {
      return [];
    }
  }

  private isCircuitOpen(key: string): boolean {
    const cb = this.circuitBreakers.get(key);
    if (!cb || !cb.isOpen) return false;
    if (Date.now() >= cb.cooldownUntil) {
      cb.isOpen = false;
      cb.failures = 0;
      return false;
    }
    return true;
  }

  private recordFailure(key: string) {
    let cb = this.circuitBreakers.get(key);
    if (!cb) {
      cb = { failures: 0, lastFailure: 0, cooldownUntil: 0, isOpen: false };
      this.circuitBreakers.set(key, cb);
    }
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.failures >= this.config.circuitBreakerThreshold) {
      cb.isOpen = true;
      cb.cooldownUntil = Date.now() + this.config.circuitBreakerCooldownMs;
      console.warn(`[Scheduler] Circuit breaker opened for ${key} (${cb.failures} failures, cooldown ${this.config.circuitBreakerCooldownMs / 1000}s)`);
    }
  }

  private recordSuccess(key: string) {
    const cb = this.circuitBreakers.get(key);
    if (cb) {
      cb.failures = 0;
      cb.isOpen = false;
    }
  }

  private trackPollDuration(ms: number) {
    this.metrics.pollDurations.push(ms);
    if (this.metrics.pollDurations.length > 100) {
      this.metrics.pollDurations.shift();
    }
    this.metrics.averagePollDurationMs = Math.round(
      this.metrics.pollDurations.reduce((a, b) => a + b, 0) / this.metrics.pollDurations.length
    );
  }
}
