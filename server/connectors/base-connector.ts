import type { SecurityIntegration } from "@shared/schema";

export interface ConnectorConfig {
  apiBaseUrl: string;
  authType: string;
  credentials: Record<string, any>;
  pollingIntervalMinutes: number;
  lastPollAt?: Date | null;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  apiVersion?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface PullDataResult {
  events: Record<string, any>[];
  totalPulled: number;
  hasMore: boolean;
  cursor?: string;
  message: string;
}

export interface AssetRecord {
  hostname: string;
  ipAddress?: string;
  ipv6Address?: string;
  macAddress?: string;
  endpointType?: string;
  operatingSystem?: string;
  agentVersion?: string;
  user?: string;
  endpointGroup?: string;
  cloudProvider?: string;
  cloudRegion?: string;
  cloudInstanceId?: string;
  tags?: string;
  lastSeen?: Date;
  status?: "active" | "inactive" | "decommissioned" | "quarantined";
  riskLevel?: string;
  riskScore?: number;
  processor?: string;
  totalPhysicalMemory?: string;
  systemModel?: string;
  systemManufacturer?: string;
  deviceHealth?: string;
  lastLoggedInUser?: string;
  softwareInventory?: any[];
  biosSerialNumber?: string;
  assetLocation?: string;
  assetSite?: string;
  assetGroup?: string;
  source?: string;
  sourcePlatforms?: string[];
  enrichmentData?: Record<string, any>;
  edrHostId?: string;
  edrPlatform?: string;
}

export interface EventSchemaField {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export abstract class BaseConnector {
  protected integration: SecurityIntegration;
  protected config: ConnectorConfig;

  constructor(integration: SecurityIntegration) {
    this.integration = integration;
    const configJson = (integration.configJson as Record<string, any>) || {};
    this.config = {
      apiBaseUrl: integration.apiBaseUrl || configJson.apiBaseUrl || "",
      authType: integration.authType || "api_key",
      credentials: configJson.credentials || configJson || {},
      pollingIntervalMinutes: integration.pollingIntervalMinutes || 15,
      lastPollAt: integration.lastPollAt,
    };
  }

  abstract testConnection(): Promise<ConnectionTestResult>;

  abstract pullData(cursor?: string): Promise<PullDataResult>;

  abstract getEventSchema(): EventSchemaField[];

  abstract mapToInternal(rawEvent: Record<string, any>): Record<string, any>;

  pullAssets?(): Promise<{ assets: AssetRecord[]; totalPulled: number; message: string }>;

  protected async httpRequest(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      timeout?: number;
    } = {}
  ): Promise<{ status: number; data: any; latencyMs: number }> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const fetchOptions: RequestInit = {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      };

      if (options.body) {
        fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);
      const latencyMs = Date.now() - startTime;

      let data: any;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return { status: response.status, data, latencyMs };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      if (error.name === "AbortError") {
        throw new Error(`Request timed out after ${options.timeout || 30000}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected getCredential(key: string): string | undefined {
    return this.config.credentials[key];
  }

  protected getSinceTimestamp(): string {
    if (this.config.lastPollAt) {
      return new Date(this.config.lastPollAt).toISOString();
    }
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return oneDayAgo.toISOString();
  }
}

const connectorRegistry = new Map<string, new (integration: SecurityIntegration) => BaseConnector>();

export function registerConnector(platformKey: string, connectorClass: new (integration: SecurityIntegration) => BaseConnector) {
  connectorRegistry.set(platformKey, connectorClass);
}

export function getConnector(integration: SecurityIntegration): BaseConnector | null {
  const ConnectorClass = connectorRegistry.get(integration.platformKey);
  if (!ConnectorClass) return null;
  return new ConnectorClass(integration);
}

export function hasConnector(platformKey: string): boolean {
  return connectorRegistry.has(platformKey);
}

export function getRegisteredConnectors(): string[] {
  return Array.from(connectorRegistry.keys());
}
