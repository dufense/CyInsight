/**
 * Vicarius vRx Live Connector
 *
 * Implements full asset inventory sync against the Vicarius External Data API.
 * Pulls assets, per-asset CVE/CVSS vulnerability data, missing patches,
 * risk scores, and vTags — all stored in AssetRecord with enrichmentData.
 *
 * Auth: Authorization: Bearer {apiKey}
 * Base URL: https://{tenant}.vicarius.cloud/vicarius-external-data-api
 *
 * IMPORTANT: The Vicarius External Data API token expires. If you see
 * "Token expired" errors, regenerate the token at:
 *   vRx Dashboard → Settings → External Data API → Generate Token
 *
 * There are TWO distinct tokens in Vicarius vRx:
 *  1. Regular vRx login credentials (username/password) — NOT used here
 *  2. External Data API token — THIS is what goes in the "API Token" field
 *     Generate at: vRx Dashboard → Settings → External Data API → Generate Token
 */

import {
  BaseConnector,
  registerConnector,
  type ConnectionTestResult,
  type PullDataResult,
  type EventSchemaField,
  type AssetRecord,
} from "./base-connector";

// ---------------------------------------------------------------------------
// Vicarius API response shapes
// ---------------------------------------------------------------------------

interface VicariusApiResponse {
  serverResponseResult?: {
    serverResponseResultCode: string;
    serverResponseResultMessage: string;
  };
  // Paginated list responses
  content?: VicariusAsset[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  // Direct data fields
  data?: any;
}

interface VicariusAsset {
  id?: string;
  assetId?: string;
  name?: string;
  assetName?: string;
  hostname?: string;
  ipAddress?: string;
  ipv4Address?: string;
  os?: string;
  operatingSystem?: string;
  osPrettyName?: string;
  agentVersion?: string;
  agentVer?: string;
  riskScore?: number;
  score?: number;
  status?: string;
  agentStatus?: string;
  tags?: string[];
  vTags?: string[];
  lastSeen?: string;
  lastSeenDate?: string;
  domain?: string;
  serialNumber?: string;
}

interface VicariusVulnerability {
  cveId?: string;
  cve?: string;
  cvssScore?: number;
  cvssBaseScore?: number;
  cvssBaseSeverity?: string;
  severity?: string;
  title?: string;
  description?: string;
  summary?: string;
  patchAvailable?: boolean;
  isPatched?: boolean;
  publishedDate?: string;
}

interface VicariusPatch {
  patchId?: string;
  id?: string;
  title?: string;
  name?: string;
  severity?: string;
  cvssScore?: number;
  kb?: string;
  kbArticleId?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Auth-failure classification
// ---------------------------------------------------------------------------

/**
 * Three distinct reasons the Vicarius API rejects a request:
 *
 *  token_expired     — The External Data API JWT has passed its expiry date.
 *                      Server returns TOKEN_EXPIRED code or JWT-expiry body text.
 *                      Fix: regenerate a fresh token from the Vicarius vRx Dashboard.
 *
 *  token_invalid     — The token is syntactically wrong or the wrong token type
 *                      (e.g. regular vRx login token instead of the External Data API token).
 *                      Server returns BAD_TOKEN or INVALID_TOKEN code.
 *                      Fix: use the External Data API token, not regular vRx credentials.
 *
 *  plan_unauthorized — The account / plan doesn't include External Data API access,
 *                      or the token is valid but lacks the required scope.
 *                      Server returns UNAUTHORIZED code or HTTP 403.
 *                      Fix: confirm the Vicarius plan includes External Data API.
 *
 *  generic_auth      — HTTP 401 with no further detail to distinguish the cause.
 */
type AuthFailureKind =
  | "token_expired"
  | "token_invalid"
  | "plan_unauthorized"
  | "generic_auth";

interface AuthFailure {
  kind: AuthFailureKind;
  httpStatus: number;
  rawSnippet: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export class VicariusConnector extends BaseConnector {
  private getApiKey(): string {
    return (
      this.getCredential("apiKey") ||
      this.getCredential("api_key") ||
      this.getCredential("token") ||
      this.getCredential("bearerToken") ||
      ""
    );
  }

  private getBaseUrl(): string {
    const configured =
      this.config.apiBaseUrl ||
      this.getCredential("apiBaseUrl") ||
      "";
    return configured.replace(/\/+$/, "");
  }

  /**
   * Validate that the base URL includes the required API path.
   * Returns an error message if invalid, or null if OK.
   */
  private validateBaseUrl(baseUrl: string): string | null {
    if (!baseUrl) return null; // handled separately
    try {
      const parsed = new URL(baseUrl);
      // The path must contain 'vicarius-external-data-api'
      if (!parsed.pathname.includes("vicarius-external-data-api")) {
        return (
          `API Base URL appears to be missing the required path. ` +
          `Expected: https://<tenant>.vicarius.cloud/vicarius-external-data-api — ` +
          `Got: ${baseUrl}`
        );
      }
    } catch {
      return `API Base URL is not a valid URL: ${baseUrl}`;
    }
    return null;
  }

  /**
   * Extract a compact diagnostic snippet from an API response for storing in
   * last_poll_message so admins can see exactly what the server returned.
   */
  private responseSnippet(status: number, data: any): string {
    const body =
      typeof data === "string"
        ? data.slice(0, 300)
        : JSON.stringify(data ?? "").slice(0, 300);
    return `[HTTP ${status}: ${body}]`;
  }

  /**
   * Classify an authentication failure into one of three specific kinds with an
   * actionable message, so users and admins know exactly what to do.
   *
   * Priority order (most-specific first):
   *   1. token_expired   — TOKEN_EXPIRED code OR jwt/expiry body text
   *   2. token_invalid   — BAD_TOKEN / INVALID_TOKEN code OR bad-token body text
   *                        (wrong token type, e.g. regular vRx login token used)
   *   3. plan_unauthorized — UNAUTHORIZED code OR HTTP 403 without expiry/bad-token
   *   4. generic_auth    — HTTP 401 with no further detail
   *
   * Returns null if no auth failure is detected at all.
   */
  private classifyAuthFailure(status: number, data: any): AuthFailure | null {
    const isHttpAuthError = status === 401 || status === 403;
    const code: string =
      data?.serverResponseResult?.serverResponseResultCode ?? "";
    const serverMsg: string =
      data?.serverResponseResult?.serverResponseResultMessage ?? "";

    const rawSnippet = this.responseSnippet(status, data);

    const bodyText =
      typeof data === "string"
        ? data.toLowerCase()
        : JSON.stringify(data ?? "").toLowerCase();

    // Signals for each failure category (evaluated independently)
    const isExpiryCode = code === "TOKEN_EXPIRED";
    const isExpiryBody =
      /expir/i.test(serverMsg) ||
      /refresh.*token|please.*refresh/i.test(serverMsg) ||
      /token.*expir|expir.*token/i.test(bodyText) ||
      /jwt.*expir|expir.*jwt/i.test(bodyText);

    const isBadTokenCode = code === "BAD_TOKEN" || code === "INVALID_TOKEN";
    const isBadTokenBody =
      /bad.?token/i.test(bodyText) ||
      /invalid.?token|token.?invalid/i.test(bodyText) ||
      /malformed.?token|token.?malformed/i.test(bodyText) ||
      /signature.*invalid|invalid.*signature/i.test(bodyText);

    const isUnauthorizedCode = code === "UNAUTHORIZED";
    const isUnauthorizedBody = /unauthorized|unauthenticated/i.test(bodyText);

    // Detect any auth-related response content (to allow non-401 responses to be caught)
    const isResponseAuthError =
      isExpiryCode || isExpiryBody ||
      isBadTokenCode || isBadTokenBody ||
      isUnauthorizedCode || isUnauthorizedBody;

    if (!isHttpAuthError && !isResponseAuthError) return null;

    // ── Priority 1: TOKEN_EXPIRED ──────────────────────────────────────────
    // isExpiryBody now includes "Please refresh your token" language, so
    // BAD_TOKEN + refresh/expiry server message correctly routes here rather
    // than to token_invalid. BAD_TOKEN with no refresh/expiry signal still
    // falls through to Priority 2 (wrong token type).
    if (isExpiryCode || isExpiryBody) {
      return {
        kind: "token_expired",
        httpStatus: status,
        rawSnippet,
        message:
          `Vicarius External Data API token has expired — ` +
          `generate a fresh token at: vRx Dashboard → Settings → External Data API → Generate Token. ` +
          rawSnippet,
      };
    }

    // ── Priority 2: BAD_TOKEN / INVALID_TOKEN ──────────────────────────────
    // Token is structurally wrong or the wrong type (e.g., regular vRx login
    // token used instead of the External Data API token).
    if (isBadTokenCode || isBadTokenBody) {
      return {
        kind: "token_invalid",
        httpStatus: status,
        rawSnippet,
        message:
          `Vicarius token invalid or wrong type — ` +
          `ensure you are using the External Data API token (not your regular vRx login token). ` +
          `Generate it at: vRx Dashboard → Settings → External Data API → Generate Token. ` +
          rawSnippet,
      };
    }

    // ── Priority 3: UNAUTHORIZED / 403 ────────────────────────────────────
    // Token is accepted but the account/plan lacks External Data API access.
    if (isUnauthorizedCode || isUnauthorizedBody || status === 403) {
      return {
        kind: "plan_unauthorized",
        httpStatus: status,
        rawSnippet,
        message:
          `Vicarius API access denied — confirm your Vicarius plan includes the External Data API feature ` +
          `and the token was generated specifically from Settings → External Data API ` +
          `(not a regular API key or login credential). ` +
          rawSnippet,
      };
    }

    // ── Priority 4: Generic 401 ────────────────────────────────────────────
    return {
      kind: "generic_auth",
      httpStatus: status,
      rawSnippet,
      message:
        `Vicarius authentication failed — verify: ` +
        `(1) the API Token is the External Data API token from vRx Dashboard → Settings → External Data API, ` +
        `(2) the Base URL includes /vicarius-external-data-api, ` +
        `(3) the token has not expired. ` +
        rawSnippet,
    };
  }

  /**
   * Throw a typed error if the response indicates an auth failure.
   * Used inside pullAssets() to propagate failures up immediately.
   */
  private throwIfAuthFailure(status: number, data: any, context: string): void {
    const failure = this.classifyAuthFailure(status, data);
    if (failure) {
      throw new Error(`[vicarius_auth_failure] ${failure.message} (at ${context})`);
    }
  }

  /**
   * Extract the content array from a Vicarius paginated response.
   * Handles both wrapped (serverResponseResult envelope) and direct shapes.
   */
  private extractPageContent(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.content)) return data.content;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.assets)) return data.assets;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  /**
   * Resolve which assets endpoint this tenant's API uses.
   * Some Vicarius tenants expose /assets (plural, standard) while others
   * expose /asset (singular, older version). Tries plural first.
   * Does NOT raise auth errors here — leaves that to the caller.
   */
  private async resolveAssetsPath(baseUrl: string, apiKey: string): Promise<string> {
    try {
      const { status } = await this.httpRequest(
        `${baseUrl}/assets?page=0&size=1`,
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }
      );
      if (status !== 404 && status !== 405) return "assets";
    } catch {
      // fall through to singular
    }
    return "asset";
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();

    if (!apiKey) {
      return {
        success: false,
        latencyMs: 0,
        message:
          "Vicarius API Token is required — generate it at: vRx Dashboard → Settings → External Data API → Generate Token",
        timestamp: new Date().toISOString(),
      };
    }

    if (!baseUrl) {
      return {
        success: false,
        latencyMs: 0,
        message:
          "Vicarius API Base URL is required — enter the full URL including the path, e.g. https://yourtenant.vicarius.cloud/vicarius-external-data-api",
        timestamp: new Date().toISOString(),
      };
    }

    // Validate URL format before making any API call
    const urlError = this.validateBaseUrl(baseUrl);
    if (urlError) {
      return {
        success: false,
        latencyMs: 0,
        message: urlError,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Try /assets (plural, standard) then fall back to /asset (singular, older tenants)
      const assetsPath = await this.resolveAssetsPath(baseUrl, apiKey);
      const { status, data } = await this.httpRequest(
        `${baseUrl}/${assetsPath}?page=0&size=1`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        }
      );

      // Classify any auth failure with a specific actionable message
      const authFailure = this.classifyAuthFailure(status, data);
      if (authFailure) {
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          message: authFailure.message,
          timestamp: new Date().toISOString(),
        };
      }

      if (status === 200) {
        const total = data?.totalElements ?? data?.data?.totalElements ?? "unknown";
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected to Vicarius vRx — ${total} assets in inventory`,
          apiVersion: "External Data API v1",
          timestamp: new Date().toISOString(),
          details: { totalAssets: total, assetsEndpoint: `/${assetsPath}` },
        };
      }

      // Non-200 / non-auth failure — include the raw response for diagnostics
      const snippet = this.responseSnippet(status, data);
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Vicarius API returned an unexpected response ${snippet}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      const msg: string = error.message ?? "";
      // Surface auth failures that were thrown from resolveAssetsPath or deep calls
      if (msg.startsWith("[vicarius_auth_failure]")) {
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          message: msg.replace("[vicarius_auth_failure] ", ""),
          timestamp: new Date().toISOString(),
        };
      }
      if (msg.includes("timed out")) {
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          message: `Connection timed out reaching ${baseUrl} — verify the API Base URL is reachable and includes the full path /vicarius-external-data-api`,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Connection failed: ${msg}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async pullData(): Promise<PullDataResult> {
    return {
      events: [],
      totalPulled: 0,
      hasMore: false,
      message:
        "Vicarius vRx does not emit security events — use Asset Sync to pull inventory, vulnerabilities and patches",
    };
  }

  getEventSchema(): EventSchemaField[] {
    return [];
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    return rawEvent;
  }

  // ---------------------------------------------------------------------------
  // Asset sync — the core of this connector
  // ---------------------------------------------------------------------------

  async pullAssets(): Promise<{ assets: AssetRecord[]; totalPulled: number; message: string }> {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();

    if (!apiKey) {
      throw new Error(
        "Vicarius API Token is required — configure it in the integration settings. " +
        "Generate at: vRx Dashboard → Settings → External Data API → Generate Token"
      );
    }
    if (!baseUrl) {
      throw new Error(
        "Vicarius API Base URL is required — enter the full URL including the path, " +
        "e.g. https://yourtenant.vicarius.cloud/vicarius-external-data-api"
      );
    }

    const urlError = this.validateBaseUrl(baseUrl);
    if (urlError) throw new Error(urlError);

    // Resolve the correct assets endpoint path for this tenant's API version
    const assetsPath = await this.resolveAssetsPath(baseUrl, apiKey);

    const allRawAssets: VicariusAsset[] = [];
    let page = 0;
    const pageSize = 100;

    // ── Step 1: paginate through all assets ──────────────────────────────
    while (true) {
      const { status, data } = await this.httpRequest(
        `${baseUrl}/${assetsPath}?page=${page}&size=${pageSize}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30000,
        }
      );

      this.throwIfAuthFailure(status, data, `/${assetsPath}?page=${page}`);

      if (status !== 200) {
        throw new Error(
          `Vicarius /${assetsPath} returned ${this.responseSnippet(status, data)}`
        );
      }

      const content = this.extractPageContent(data);
      if (!content.length) break;

      allRawAssets.push(...content);

      const totalPages =
        data?.totalPages ??
        data?.data?.totalPages ??
        Math.ceil((data?.totalElements ?? content.length) / pageSize);

      if (page >= totalPages - 1 || content.length < pageSize) break;
      page++;
    }

    // ── Step 2: for each asset, fetch vulns + patches ─────────────────────
    const assets: AssetRecord[] = [];

    for (const raw of allRawAssets) {
      const assetId = raw.id || raw.assetId || "";
      const hostname =
        raw.name || raw.assetName || raw.hostname || assetId || "";
      if (!hostname) continue;

      let vulnerabilities: any[] = [];
      let missingPatches: any[] = [];

      // Fetch vulnerabilities (per-asset)
      // Auth errors → re-throw immediately. Other non-200 → warn and continue.
      if (assetId) {
        try {
          const { status, data } = await this.httpRequest(
            `${baseUrl}/assets/${assetId}/vulnerabilities?page=0&size=200`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 20000,
            }
          );
          this.throwIfAuthFailure(status, data, `/assets/${assetId}/vulnerabilities`);
          if (status === 200) {
            vulnerabilities = this.extractPageContent(data).map(
              (v: VicariusVulnerability) => ({
                cveId: v.cveId || v.cve || null,
                cvssScore: v.cvssScore ?? v.cvssBaseScore ?? null,
                severity: v.cvssBaseSeverity || v.severity || null,
                title: v.title || v.summary || v.description?.slice(0, 120) || null,
                patchAvailable: v.patchAvailable ?? v.isPatched ?? false,
                publishedDate: v.publishedDate || null,
              })
            );
          } else {
            console.warn(
              `[Vicarius] Vuln fetch for asset ${assetId} returned ${this.responseSnippet(status, data)} — skipping`
            );
          }
        } catch (err: any) {
          // Re-throw auth failures; swallow asset-level transient errors
          if (err.message.startsWith("[vicarius_auth_failure]")) throw err;
          console.warn(`[Vicarius] Could not fetch vulns for asset ${assetId}: ${err.message}`);
        }

        // Fetch missing patches
        try {
          const { status, data } = await this.httpRequest(
            `${baseUrl}/assets/${assetId}/patches?page=0&size=200`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 20000,
            }
          );
          this.throwIfAuthFailure(status, data, `/assets/${assetId}/patches`);
          if (status === 200) {
            missingPatches = this.extractPageContent(data).map(
              (p: VicariusPatch) => ({
                patchId: p.patchId || p.id || null,
                title: p.title || p.name || null,
                severity: p.severity || null,
                cvssScore: p.cvssScore ?? null,
                kb: p.kbArticleId || p.kb || null,
              })
            );
          } else {
            console.warn(
              `[Vicarius] Patch fetch for asset ${assetId} returned ${this.responseSnippet(status, data)} — skipping`
            );
          }
        } catch (err: any) {
          if (err.message.startsWith("[vicarius_auth_failure]")) throw err;
          console.warn(`[Vicarius] Could not fetch patches for asset ${assetId}: ${err.message}`);
        }
      }

      // ── Step 3: Map raw → AssetRecord ──────────────────────────────────
      const rawScore = raw.riskScore ?? raw.score ?? 0;
      const riskScore = Math.min(100, Math.max(0, Math.round(Number(rawScore) || 0)));

      const riskLevel =
        riskScore >= 75 ? "critical" :
        riskScore >= 50 ? "high" :
        riskScore >= 25 ? "medium" : "low";

      const statusRaw = (raw.status || raw.agentStatus || "").toLowerCase();
      const status: AssetRecord["status"] =
        statusRaw.includes("quarantine") ? "quarantined" :
        statusRaw.includes("offline") || statusRaw.includes("inactive") || statusRaw === "disconnected" ? "inactive" :
        statusRaw.includes("decommission") ? "decommissioned" :
        "active";

      const vTags: string[] = raw.tags || raw.vTags || [];

      const criticalCount = vulnerabilities.filter(
        v => (v.severity || "").toLowerCase() === "critical"
      ).length;
      const highCount = vulnerabilities.filter(
        v => (v.severity || "").toLowerCase() === "high"
      ).length;

      const record: AssetRecord = {
        hostname,
        ipAddress: raw.ipAddress || raw.ipv4Address || undefined,
        operatingSystem: raw.osPrettyName || raw.operatingSystem || raw.os || undefined,
        agentVersion: raw.agentVersion || raw.agentVer || undefined,
        riskScore,
        riskLevel,
        status,
        tags: vTags.length ? vTags.join(", ") : undefined,
        lastSeen:
          raw.lastSeen || raw.lastSeenDate
            ? new Date(raw.lastSeen || raw.lastSeenDate!)
            : undefined,
        assetGroup: raw.domain || undefined,
        biosSerialNumber: raw.serialNumber || undefined,
        source: "connector",
        sourcePlatforms: ["vicarius"],
        enrichmentData: {
          vicariusAssetId: assetId,
          vTags,
          vulnerabilities: vulnerabilities.slice(0, 200),
          missingPatches: missingPatches.slice(0, 200),
          totalVulnerabilities: vulnerabilities.length,
          criticalCount,
          highCount,
          missingPatchCount: missingPatches.length,
        },
      };

      assets.push(record);
    }

    return {
      assets,
      totalPulled: assets.length,
      message: `Pulled ${assets.length} assets from Vicarius vRx (${assets.reduce(
        (s, a) => s + ((a.enrichmentData?.totalVulnerabilities as number) || 0),
        0
      )} total vulnerabilities)`,
    };
  }
}

registerConnector("vicarius", VicariusConnector);
