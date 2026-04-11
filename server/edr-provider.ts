/**
 * EDR Provider Abstraction Layer
 *
 * Defines a vendor-neutral interface for EDR-based remote command execution
 * and endpoint isolation actions. Each adapter reads ALL configuration
 * (API base URL, credentials, etc.) from the security_integrations row —
 * nothing is hardcoded.
 *
 * Supported platforms at launch:
 *   - Cynet 360   (reuses CynetConnector for auth)
 *   - CrowdStrike Falcon
 *   - SentinelOne Singularity
 *   - Microsoft Defender for Endpoint
 */

import { db } from "./db";
import { securityIntegrations } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { SecurityIntegration } from "@shared/schema";
import type { CynetConnector } from "./connectors/cynet";

// Shared types

export interface EdrActionResult {
  success: boolean;
  message: string;
  rawResponse?: any;
}

export interface EdrCommandResult {
  success: boolean;
  output: string;
  rawResponse?: any;
}

export interface IEdrProvider {
  readonly platformKey: string;
  readonly platformLabel: string;

  /** Run an arbitrary script on the host and return its stdout as a string. */
  runAssessmentScript(hostId: string, osType: "windows" | "linux" | "macos", script: string): Promise<EdrCommandResult>;

  /** Isolate (network-quarantine) the host. */
  isolateHost(hostId: string): Promise<EdrActionResult>;

  /** Remove network isolation from the host. */
  unisolateHost(hostId: string): Promise<EdrActionResult>;
}

// Helper: HTTP with timeout

async function httpReq(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: any; timeout?: number } = {}
): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), opts.timeout ?? 30_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", "Accept": "application/json", ...(opts.headers ?? {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    let data: any;
    const ct = res.headers.get("content-type") ?? "";
    data = ct.includes("application/json") ? await res.json() : await res.text();
    return { status: res.status, data };
  } finally {
    clearTimeout(tid);
  }
}

// Cynet 360 Adapter — delegates auth to CynetConnector

export class CynetEdrProvider implements IEdrProvider {
  readonly platformKey = "cynet";
  readonly platformLabel = "Cynet 360";

  private integration: SecurityIntegration;

  constructor(integration: SecurityIntegration) {
    this.integration = integration;
  }

  private async getConnector(): Promise<CynetConnector> {
    const { CynetConnector } = await import("./connectors/cynet");
    return new CynetConnector(this.integration);
  }

  /** Retrieves a Bearer token via the connector's public getAuthToken() wrapper. */
  private async getToken(): Promise<string> {
    const connector = await this.getConnector();
    return connector.getAuthToken();
  }

  private getApiBase(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const raw = (this.integration.apiBaseUrl || configJson.apiBaseUrl || configJson.credentials?.apiBaseUrl || "").replace(/\/+$/, "");
    const knownPaths = ["/api/v2/login", "/api/account/token", "/api/v3/token", "/api/login"];
    for (const p of knownPaths) {
      if (raw.endsWith(p)) return raw.slice(0, -p.length);
    }
    return raw;
  }

  private getClientId(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const cred = configJson.credentials ?? configJson;
    return cred.clientId ?? cred.client_id ?? "";
  }

  private authHeaders(token: string): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    const clientId = this.getClientId();
    if (clientId) h["client_id"] = clientId;
    return h;
  }

  async runAssessmentScript(hostId: string, osType: "windows" | "linux" | "macos", script: string): Promise<EdrCommandResult> {
    try {
      const token = await this.getToken();
      const base = this.getApiBase();
      const scriptType = osType === "windows" ? "powershell" : "bash";
      const { status, data } = await httpReq(`${base}/api/host/remediation/runCommand`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { hostId, script, scriptType },
        timeout: 120_000,
      });
      if (status === 200 || status === 202) {
        const output = data?.output ?? data?.result ?? data?.stdout ?? JSON.stringify(data);
        return { success: true, output: String(output), rawResponse: data };
      }
      return { success: false, output: "", rawResponse: data };
    } catch (err: any) {
      return { success: false, output: "", rawResponse: { error: err.message } };
    }
  }

  async isolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.getToken();
      const base = this.getApiBase();
      const { status, data } = await httpReq(`${base}/api/host/remediation/isolate`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { hostId },
      });
      return { success: status === 200 || status === 202, message: data?.message ?? `HTTP ${status}`, rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async unisolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.getToken();
      const base = this.getApiBase();
      const { status, data } = await httpReq(`${base}/api/host/remediation/unisolate`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { hostId },
      });
      return { success: status === 200 || status === 202, message: data?.message ?? `HTTP ${status}`, rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

// CrowdStrike Falcon Adapter

export class CrowdStrikeEdrProvider implements IEdrProvider {
  readonly platformKey = "crowdstrike";
  readonly platformLabel = "CrowdStrike Falcon";

  private integration: SecurityIntegration;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(integration: SecurityIntegration) {
    this.integration = integration;
  }

  private getBase(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const raw = (this.integration.apiBaseUrl || configJson.apiBaseUrl || configJson.credentials?.apiBaseUrl || "").replace(/\/+$/, "");
    if (!raw) throw new Error("CrowdStrike: apiBaseUrl is not configured in the integration settings");
    return raw;
  }

  private getCredentials(): { clientId: string; clientSecret: string } {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const cred = configJson.credentials ?? configJson;
    return {
      clientId: cred.client_id ?? cred.clientId ?? "",
      clientSecret: cred.client_secret ?? cred.clientSecret ?? "",
    };
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const { clientId, clientSecret } = this.getCredentials();
    if (!clientId || !clientSecret) throw new Error("CrowdStrike: client_id and client_secret are required");

    const base = this.getBase();
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    const res = await fetch(`${base}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`CrowdStrike auth failed: ${data?.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
    }
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in ?? 1800) * 1000) - 60_000;
    return this.accessToken!;
  }

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async runAssessmentScript(hostId: string, _osType: "windows" | "linux" | "macos", script: string): Promise<EdrCommandResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();

      const { status: s1, data: d1 } = await httpReq(`${base}/real-time-response/combined/batch-init-session/v1`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { host_ids: [hostId], queue_offline: false },
        timeout: 60_000,
      });
      if (s1 !== 201 && s1 !== 200) return { success: false, output: "", rawResponse: d1 };
      const batchId = d1?.batch_id ?? d1?.resources?.[0]?.batch_id;
      if (!batchId) return { success: false, output: "No batch session ID returned", rawResponse: d1 };

      const { status: s2, data: d2 } = await httpReq(`${base}/real-time-response/combined/batch-command/v1`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { batch_id: batchId, command_string: `runscript -Raw=\`\`\`${script}\`\`\`` },
        timeout: 120_000,
      });

      const combined = d2?.combined?.resources?.[hostId];
      const output = combined?.stdout ?? combined?.output ?? JSON.stringify(d2);
      return { success: s2 === 201 || s2 === 200, output: String(output), rawResponse: d2 };
    } catch (err: any) {
      return { success: false, output: "", rawResponse: { error: err.message } };
    }
  }

  async isolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/devices/action/v2?action_name=contain`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { ids: [hostId] },
      });
      return { success: status === 202 || status === 200, message: data?.meta?.writes?.resources_affected > 0 ? "Host isolated" : (data?.errors?.[0]?.message ?? `HTTP ${status}`), rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async unisolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/devices/action/v2?action_name=lift_containment`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { ids: [hostId] },
      });
      return { success: status === 202 || status === 200, message: data?.meta?.writes?.resources_affected > 0 ? "Host unisolated" : (data?.errors?.[0]?.message ?? `HTTP ${status}`), rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

// SentinelOne Singularity Adapter

export class SentinelOneEdrProvider implements IEdrProvider {
  readonly platformKey = "sentinelone";
  readonly platformLabel = "SentinelOne Singularity";

  private integration: SecurityIntegration;

  constructor(integration: SecurityIntegration) {
    this.integration = integration;
  }

  private getBase(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const raw = (this.integration.apiBaseUrl || configJson.apiBaseUrl || configJson.credentials?.apiBaseUrl || "").replace(/\/+$/, "");
    if (!raw) throw new Error("SentinelOne: apiBaseUrl is not configured in the integration settings");
    return raw;
  }

  private getToken(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const cred = configJson.credentials ?? configJson;
    return cred.api_token ?? cred.apiToken ?? cred.token ?? "";
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `ApiToken ${this.getToken()}` };
  }

  async runAssessmentScript(hostId: string, osType: "windows" | "linux" | "macos", script: string): Promise<EdrCommandResult> {
    try {
      const base = this.getBase();
      const scriptType = osType === "windows" ? "powershell" : "bash";
      const { status, data } = await httpReq(`${base}/web/api/v2.1/agents/actions/run-script`, {
        method: "POST",
        headers: this.authHeaders(),
        body: { filter: { ids: [hostId] }, data: { script, scriptType, outputDestination: "Console" } },
        timeout: 120_000,
      });
      const output = data?.data?.output ?? data?.data?.result ?? JSON.stringify(data);
      return { success: status === 200 || status === 202, output: String(output), rawResponse: data };
    } catch (err: any) {
      return { success: false, output: "", rawResponse: { error: err.message } };
    }
  }

  async isolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/web/api/v2.1/agents/actions/isolate-network`, {
        method: "POST",
        headers: this.authHeaders(),
        body: { filter: { ids: [hostId] } },
      });
      return { success: status === 200 || status === 202, message: data?.data?.affected > 0 ? "Host isolated" : (data?.errors?.[0]?.detail ?? `HTTP ${status}`), rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async unisolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/web/api/v2.1/agents/actions/unisolate-network`, {
        method: "POST",
        headers: this.authHeaders(),
        body: { filter: { ids: [hostId] } },
      });
      return { success: status === 200 || status === 202, message: data?.data?.affected > 0 ? "Host unisolated" : (data?.errors?.[0]?.detail ?? `HTTP ${status}`), rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

// Microsoft Defender for Endpoint Adapter

export class MsDefenderEdrProvider implements IEdrProvider {
  readonly platformKey = "ms_defender_endpoint";
  readonly platformLabel = "Microsoft Defender for Endpoint";

  private integration: SecurityIntegration;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(integration: SecurityIntegration) {
    this.integration = integration;
  }

  private getBase(): string {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const raw = (this.integration.apiBaseUrl || configJson.apiBaseUrl || configJson.credentials?.apiBaseUrl || "").replace(/\/+$/, "");
    if (!raw) throw new Error("MDE: apiBaseUrl is not configured in the integration settings (e.g. https://api.securitycenter.microsoft.com)");
    return raw;
  }

  /**
   * All MDE config is read from security_integrations.configJson:
   *   credentials.tenant_id         — Azure AD tenant ID
   *   credentials.client_id         — App registration client ID
   *   credentials.client_secret     — App registration client secret
   *   credentials.token_url         — Full OAuth2 token URL (overrides default authority pattern)
   *   credentials.authority_base    — Authority base URL (e.g. https://login.microsoftonline.com)
   *   credentials.api_scope         — OAuth2 scope (e.g. https://api.securitycenter.microsoft.com/.default)
   */
  private getCredentials(): {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    apiScope: string;
  } {
    const configJson = (this.integration.configJson as Record<string, any>) ?? {};
    const cred = configJson.credentials ?? configJson;

    const tenantId: string = cred.tenant_id ?? cred.tenantId ?? "";
    const clientId: string = cred.client_id ?? cred.clientId ?? "";
    const clientSecret: string = cred.client_secret ?? cred.clientSecret ?? "";

    // Token URL: use explicit override, or build from authority_base + tenant_id
    const authorityBase: string = (cred.authority_base ?? "").replace(/\/$/, "");
    const explicitTokenUrl: string = cred.token_url ?? cred.tokenUrl ?? "";
    const tokenUrl = explicitTokenUrl || (authorityBase && tenantId
      ? `${authorityBase}/${tenantId}/oauth2/v2.0/token`
      : "");

    const apiScope: string = cred.api_scope ?? cred.apiScope ?? "https://api.securitycenter.microsoft.com/.default";

    return { tenantId, clientId, clientSecret, tokenUrl, apiScope };
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const { clientId, clientSecret, tokenUrl, apiScope } = this.getCredentials();
    if (!clientId || !clientSecret || !tokenUrl) {
      throw new Error("MDE: client_id, client_secret, and either token_url or (authority_base + tenant_id) are required in the integration config");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: apiScope,
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (res.status !== 200 || !data.access_token) {
      throw new Error(`MDE auth failed: ${data?.error_description ?? `HTTP ${res.status}`}`);
    }
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in ?? 3600) * 1000) - 60_000;
    return this.accessToken!;
  }

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async runAssessmentScript(hostId: string, _osType: "windows" | "linux" | "macos", script: string): Promise<EdrCommandResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/api/machines/${hostId}/runliveresponse`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { Commands: [{ type: "RunScript", params: [{ key: "ScriptName", value: "assess.ps1" }, { key: "Arguments", value: script }] }] },
        timeout: 120_000,
      });
      const output = data?.value ?? data?.output ?? JSON.stringify(data);
      return { success: status === 201 || status === 200, output: String(output), rawResponse: data };
    } catch (err: any) {
      return { success: false, output: "", rawResponse: { error: err.message } };
    }
  }

  async isolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/api/machines/${hostId}/isolate`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { Comment: "Isolated by Cyber Command Center EDR engine", IsolationType: "Full" },
      });
      return { success: status === 201 || status === 200, message: data?.status ?? `HTTP ${status}`, rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async unisolateHost(hostId: string): Promise<EdrActionResult> {
    try {
      const token = await this.authenticate();
      const base = this.getBase();
      const { status, data } = await httpReq(`${base}/api/machines/${hostId}/unisolate`, {
        method: "POST",
        headers: this.authHeaders(token),
        body: { Comment: "Unisolated by Cyber Command Center EDR engine" },
      });
      return { success: status === 201 || status === 200, message: data?.status ?? `HTTP ${status}`, rawResponse: data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

// Factory: resolve EDR provider for a tenant

const SUPPORTED_EDR_PLATFORMS = ["cynet", "crowdstrike", "sentinelone", "ms_defender_endpoint"] as const;
export type SupportedEdrPlatform = (typeof SUPPORTED_EDR_PLATFORMS)[number];

export function isSupportedEdrPlatform(key: string): key is SupportedEdrPlatform {
  return (SUPPORTED_EDR_PLATFORMS as readonly string[]).includes(key);
}

export async function getEdrProvider(tenantId: number): Promise<IEdrProvider | null> {
  const rows = await db
    .select()
    .from(securityIntegrations)
    .where(
      and(
        eq(securityIntegrations.tenantId, tenantId),
        eq(securityIntegrations.isEnabled, true),
        inArray(securityIntegrations.platformKey, [...SUPPORTED_EDR_PLATFORMS])
      )
    )
    .limit(1);

  if (!rows.length) return null;
  const integration = rows[0];

  switch (integration.platformKey) {
    case "cynet":
      return new CynetEdrProvider(integration);
    case "crowdstrike":
      return new CrowdStrikeEdrProvider(integration);
    case "sentinelone":
      return new SentinelOneEdrProvider(integration);
    case "ms_defender_endpoint":
      return new MsDefenderEdrProvider(integration);
    default:
      return null;
  }
}
