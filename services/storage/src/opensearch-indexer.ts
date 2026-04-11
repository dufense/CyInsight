import type { EventRecord } from "./event-writer";

export interface OpenSearchConfig {
  url: string;
  index: string;
  username?: string;
  password?: string;
  batchSize: number;
}

interface IndexResult {
  indexed: number;
  errors: number;
  errorMessages: string[];
}

export class OpenSearchIndexer {
  private config: OpenSearchConfig;
  private totalIndexed = 0;
  private totalErrors = 0;
  private connected = false;

  constructor(config: OpenSearchConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    if (!this.config.url) {
      console.log("[OpenSearchIndexer] No OpenSearch URL configured, indexing disabled");
      return false;
    }

    try {
      const authHeader = this.config.username && this.config.password
        ? `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`
        : undefined;

      const response = await fetch(this.config.url, {
        method: "GET",
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (response.ok) {
        this.connected = true;
        console.log("[OpenSearchIndexer] Connected to OpenSearch");
        await this.ensureIndex();
        return true;
      }
    } catch (err: any) {
      console.log(`[OpenSearchIndexer] Connection failed: ${err.message}`);
    }

    return false;
  }

  private async ensureIndex(): Promise<void> {
    if (!this.connected) return;

    try {
      const authHeader = this.getAuthHeader();
      const response = await fetch(`${this.config.url}/${this.config.index}`, {
        method: "HEAD",
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (response.status === 404) {
        const mapping = {
          settings: {
            number_of_shards: 3,
            number_of_replicas: 1,
            "index.refresh_interval": "5s",
          },
          mappings: {
            properties: {
              tenantId: { type: "integer" },
              eventType: { type: "keyword" },
              severity: { type: "keyword" },
              threat: { type: "text", fields: { keyword: { type: "keyword" } } },
              target: { type: "text", fields: { keyword: { type: "keyword" } } },
              attacker: { type: "ip", ignore_malformed: true },
              asset: { type: "text", fields: { keyword: { type: "keyword" } } },
              description: { type: "text" },
              mitreTactic: { type: "keyword" },
              mitreTechnique: { type: "keyword" },
              action: { type: "keyword" },
              logSource: { type: "keyword" },
              country: { type: "keyword" },
              riskScore: { type: "integer" },
              occurredAt: { type: "date" },
              storedAt: { type: "date" },
            },
          },
        };

        await fetch(`${this.config.url}/${this.config.index}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(mapping),
        });

        console.log(`[OpenSearchIndexer] Created index: ${this.config.index}`);
      }
    } catch (err: any) {
      console.error(`[OpenSearchIndexer] Failed to ensure index: ${err.message}`);
    }
  }

  async indexBatch(events: EventRecord[]): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, errorMessages: [] };

    if (!this.connected || events.length === 0) return result;

    for (let i = 0; i < events.length; i += this.config.batchSize) {
      const chunk = events.slice(i, i + this.config.batchSize);
      const chunkResult = await this.indexChunk(chunk);
      result.indexed += chunkResult.indexed;
      result.errors += chunkResult.errors;
      result.errorMessages.push(...chunkResult.errorMessages);
    }

    this.totalIndexed += result.indexed;
    this.totalErrors += result.errors;
    return result;
  }

  private async indexChunk(events: EventRecord[]): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, errorMessages: [] };

    try {
      const bulkBody = events.flatMap((event) => [
        JSON.stringify({ index: { _index: this.config.index } }),
        JSON.stringify({
          tenantId: event.tenantId,
          eventType: event.eventType,
          severity: event.severity,
          threat: event.threat,
          target: event.target,
          attacker: event.attacker,
          asset: event.asset,
          description: event.description,
          mitreTactic: event.mitreTactic,
          mitreTechnique: event.mitreTechnique,
          action: event.action,
          logSource: event.logSource,
          country: event.country,
          riskScore: event.riskScore,
          occurredAt: event.occurredAt,
          storedAt: new Date().toISOString(),
        }),
      ]).join("\n") + "\n";

      const authHeader = this.getAuthHeader();
      const response = await fetch(`${this.config.url}/_bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-ndjson",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: bulkBody,
      });

      if (response.ok) {
        const body = await response.json() as any;
        if (body.errors) {
          const errorItems = (body.items || []).filter((item: any) => item.index?.error);
          result.errors = errorItems.length;
          result.indexed = events.length - errorItems.length;
          result.errorMessages = errorItems.slice(0, 5).map((item: any) => item.index.error.reason);
        } else {
          result.indexed = events.length;
        }
      } else {
        result.errors = events.length;
        result.errorMessages.push(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err: any) {
      result.errors = events.length;
      result.errorMessages.push(err.message);
    }

    return result;
  }

  private getAuthHeader(): string | undefined {
    if (this.config.username && this.config.password) {
      return `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`;
    }
    return undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStats() {
    return {
      connected: this.connected,
      totalIndexed: this.totalIndexed,
      totalErrors: this.totalErrors,
      index: this.config.index,
    };
  }
}
