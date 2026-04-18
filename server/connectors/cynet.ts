import { BaseConnector, registerConnector, type ConnectionTestResult, type PullDataResult, type EventSchemaField, type AssetRecord } from "./base-connector";
import { normalizeActionLabel } from "../enrichment-pipeline";

export interface CynetHostDetails {
  hostId: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  osType: string;
  osVersion: string;
  domain: string;
  agentVersion: string;
  agentStatus: string;
  lastSeen: string;
  riskScore: number;
  avProduct: string;
  avStatus: string;
  avVersion: string;
  groups: string[];
  lastLoggedInUser: string;
  rawPayload: Record<string, any>;
}

export interface CynetUserDetails {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  domain: string;
  lastLogin: string;
  status: string;
  riskLevel: string;
  loginAnomalies: number;
  groups: string[];
  rawPayload: Record<string, any>;
}

export interface CynetFullHostDetails extends CynetHostDetails {
  installedSoftware: Array<{
    name: string;
    version: string;
    vendor: string;
    installDate?: string;
  }>;
  hardware: {
    cpu?: string;
    memory?: string;
    diskSpace?: string;
    model?: string;
    manufacturer?: string;
  };
  networkInterfaces: Array<{
    name: string;
    ipAddress: string;
    macAddress: string;
    type: string;
  }>;
  isFullHost: true;
}

export interface CynetNetworkDetails {
  connectionId: string;
  sourceIp: string;
  destinationIp: string;
  destinationDomain: string;
  port: number;
  protocol: string;
  direction: string;
  action: string;
  threatType: string;
  severity: string;
  timestamp: string;
  rawPayload: Record<string, any>;
}

/**
 * Standalone risk score normalizer for Cynet-sourced values.
 * Handles text labels, 0–4 categorical scale, and arbitrary numeric (clamped to 100).
 * Exported so callers (e.g. routes.ts) can reuse the same logic without instantiating the connector.
 */
export function normalizeCynetRiskScore(raw: any): number {
  if (raw == null || raw === "" || raw === false) return 0;
  const str = String(raw).toLowerCase().trim();
  if (str === "critical") return 90;
  if (str === "high") return 70;
  if (str === "medium" || str === "moderate") return 50;
  if (str === "low") return 25;
  if (str === "none" || str === "no risk" || str === "clean") return 0;
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  if (Number.isInteger(n) && n >= 0 && n <= 4) {
    return ([0, 25, 50, 75, 90] as const)[n] ?? 0;
  }
  return Math.min(100, Math.round(n));
}

export class CynetConnector extends BaseConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private static readonly KNOWN_AUTH_PATHS = [
    "/api/v2/login",
    "/api/account/token",
    "/api/v3/token",
    "/api/login",
  ];

  private getRawBaseUrl(): string {
    return (this.config.apiBaseUrl || this.getCredential("apiBaseUrl") || "").replace(/\/+$/, "");
  }

  private getApiBase(): string {
    const raw = this.getRawBaseUrl();
    for (const path of CynetConnector.KNOWN_AUTH_PATHS) {
      if (raw.endsWith(path)) {
        return raw.slice(0, -path.length);
      }
    }
    return raw;
  }

  private getAuthUrl(): string {
    const raw = this.getRawBaseUrl();
    for (const path of CynetConnector.KNOWN_AUTH_PATHS) {
      if (raw.endsWith(path)) {
        return raw;
      }
    }
    return `${raw}/api/account/token`;
  }

  private isV2Auth(): boolean {
    const raw = this.getRawBaseUrl();
    return raw.includes("/api/v2/");
  }

  private getLastSeenParam(daysAgo: number = 30): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  }

  private getClientId(): string {
    return this.getCredential("clientId") || this.getCredential("client_id") || "";
  }

  /** Public wrapper so the EDR provider layer can retrieve a token without type-unsafe casting. */
  async getAuthToken(): Promise<string> {
    return this.authenticate();
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const rawUrl = this.getRawBaseUrl();
    const authUrl = this.getAuthUrl();
    const accessKey = this.getCredential("access_key") || this.getCredential("username") || "";
    const secretKey = this.getCredential("secret_key") || this.getCredential("password") || "";
    const clientId = this.getClientId();

    if (!rawUrl) {
      throw new Error("Cynet API Base URL is required (e.g., https://yourorg.api.cynet.com)");
    }

    if (!accessKey || !secretKey) {
      throw new Error("Cynet API credentials (access_key and secret_key) are required");
    }

    const isV2 = this.isV2Auth();
    const authBody: Record<string, string> = isV2
      ? { accessKey, secretKey }
      : { access_key: accessKey, secret_key: secretKey };
    if (clientId) {
      authBody.clientId = clientId;
    }

    console.log(`[Cynet] Authenticating: url=${authUrl}, isV2=${isV2}, bodyFields=${Object.keys(authBody).join(",")}, hasAccessKey=${!!accessKey}, hasSecretKey=${!!secretKey}, hasClientId=${!!clientId}`);

    const { status, data } = await this.httpRequest(authUrl, {
      method: "POST",
      body: authBody,
    });

    console.log(`[Cynet] Auth response: status=${status}, responseKeys=${data ? Object.keys(data).join(",") : "none"}`);

    if (status !== 200 || !(data.token || data.access_token || data.access)) {
      throw new Error(`Cynet authentication failed: ${data.message || data.error || `HTTP ${status}`}`);
    }

    this.accessToken = data.token || data.access_token || data.access;
    this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000) - 60000;
    return this.accessToken!;
  }

  private authHeaders(token: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const clientId = this.getClientId();
    if (clientId) {
      headers["client_id"] = clientId;
    }
    return headers;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();
      const lastSeen = this.getLastSeenParam(7);

      const testUrl = `${baseUrl}/api/alerts?LastSeen=${encodeURIComponent(lastSeen)}`;
      console.log(`[Cynet] Testing endpoint: ${testUrl}`);

      const { status, data } = await this.httpRequest(testUrl, {
        headers: this.authHeaders(token),
        timeout: 15000,
      });

      console.log(`[Cynet] Test response: status=${status}, responseKeys=${data && typeof data === "object" ? Object.keys(data).join(",") : typeof data}`);

      if (status === 200) {
        const entities = data?.Entities || [];
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: "Successfully connected to Cynet 360 API",
          apiVersion: this.isV2Auth() ? "v2" : "v3",
          timestamp: new Date().toISOString(),
          details: {
            alertCount: entities.length,
            platform: "Cynet 360",
            endpoint: testUrl,
            syncTime: data?.SyncTimeUtc || null,
          },
        };
      }

      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Cynet API returned HTTP ${status}: ${data?.message || data?.title || JSON.stringify(data?.errors) || "Unknown error"}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Connection failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async pullData(cursor?: string): Promise<PullDataResult> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();
      const since = this.getSinceTimestamp();
      const lastSeen = since || this.getLastSeenParam(30);

      const alertsUrl = `${baseUrl}/api/alerts?LastSeen=${encodeURIComponent(lastSeen)}`;

      const { status, data } = await this.httpRequest(alertsUrl, {
        headers: this.authHeaders(token),
      });

      if (status !== 200) {
        return {
          events: [],
          totalPulled: 0,
          hasMore: false,
          message: `Failed to fetch alerts: HTTP ${status} - ${data?.message || data?.title || JSON.stringify(data?.errors) || "Unknown error"}`,
        };
      }

      const entities = data?.Entities || [];

      const realEntities: any[] = [];
      const suppressedEntities: any[] = [];
      for (const entity of entities) {
        if (this.isSimulatedAlert(entity)) {
          suppressedEntities.push(entity);
        } else {
          realEntities.push(entity);
        }
      }

      if (suppressedEntities.length > 0) {
        console.log(
          `[Cynet] Suppressed ${suppressedEntities.length} simulated/test alert(s) (boolean flags, DetectionType, or BAS/simulation keywords) — ` +
          `only real alerts will be ingested. Suppressed names: ` +
          suppressedEntities
            .map((e: any) => e.IncidentName || e.alert_name || e.name || "(unknown)")
            .slice(0, 5)
            .join(", ") +
          (suppressedEntities.length > 5 ? ` … +${suppressedEntities.length - 5} more` : "")
        );
      }

      const events = realEntities.map((a: any) => this.mapToInternal(a));

      return {
        events,
        totalPulled: events.length,
        hasMore: false,
        message:
          `Pulled ${events.length} real alert(s) from Cynet 360 (since ${lastSeen})` +
          (suppressedEntities.length > 0
            ? ` — ${suppressedEntities.length} simulated/test alert(s) suppressed`
            : ""),
      };
    } catch (error: any) {
      return {
        events: [],
        totalPulled: 0,
        hasMore: false,
        message: `Pull failed: ${error.message}`,
      };
    }
  }

  async pullHosts(): Promise<{ hosts: (CynetHostDetails | CynetFullHostDetails)[]; message: string; usedFullApi: boolean }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();
      const lastSeen = this.getLastSeenParam(90);

      const fullHostResult = await this.tryFullHostApi(baseUrl, token, lastSeen);
      if (fullHostResult) {
        if (fullHostResult.hosts.length > 0) {
          return fullHostResult;
        }
        // Full API available but returned 0 hosts — continue to basic + alternative endpoints
        console.log("[Cynet] /api/full/host returned 0 hosts — falling through to /api/hosts and alternative endpoints");
      } else {
        console.log("[Cynet] /api/full/host not available, falling back to /api/hosts");
      }

      const hostsUrl = `${baseUrl}/api/hosts?LastSeen=${encodeURIComponent(lastSeen)}`;
      console.log(`[Cynet] Trying basic host API: ${hostsUrl}`);
      const { status, data } = await this.httpRequest(hostsUrl, {
        headers: this.authHeaders(token),
        timeout: 30000,
      });

      console.log(`[Cynet] /api/hosts response: status=${status}, dataKeys=${Object.keys(data || {}).join(",")}, entityCount=${data?.Entities?.length ?? "N/A"}, isArray=${Array.isArray(data)}, totalCount=${data?.TotalCount ?? data?.totalCount ?? data?.Total ?? "N/A"}`);

      if (status !== 200) {
        console.log(`[Cynet] /api/hosts returned HTTP ${status} — falling through to alternative endpoints`);
        const altResult = await this.tryAlternativeHostEndpoints(baseUrl, token);
        if (altResult) return altResult;
        return { hosts: [], usedFullApi: false, message: `Failed to fetch hosts: HTTP ${status} - ${data?.message || data?.title || JSON.stringify(data?.errors) || "Unknown error"}` };
      }

      const entities = data?.Entities || (Array.isArray(data) ? data : []);
      if (entities.length === 0) {
        const withWildcard = `${baseUrl}/api/hosts?LastSeen=${encodeURIComponent(lastSeen)}&Name=*`;
        console.log(`[Cynet] 0 hosts without Name filter, retrying with Name=*: ${withWildcard}`);
        const retry = await this.httpRequest(withWildcard, {
          headers: this.authHeaders(token),
          timeout: 30000,
        });
        console.log(`[Cynet] /api/hosts?Name=* response: status=${retry.status}, entityCount=${retry.data?.Entities?.length ?? "N/A"}`);
        if (retry.status === 200) {
          const retryEntities = retry.data?.Entities || (Array.isArray(retry.data) ? retry.data : []);
          if (retryEntities.length > 0) {
            const hosts: CynetHostDetails[] = retryEntities.map((h: any) => this.mapBasicHost(h));
            return { hosts, usedFullApi: false, message: `Pulled ${hosts.length} hosts from Cynet 360 (basic API with Name=*)` };
          }
        }
      }

      if (entities.length > 0) {
        const sample = entities[0];
        const keys = Object.keys(sample || {}).join(", ");
        const sampleStr = JSON.stringify(sample).substring(0, 1000);
        console.log(`[Cynet] Basic host entity keys: [${keys}]`);
        console.log(`[Cynet] Basic host sample: ${sampleStr}`);

        const hosts: CynetHostDetails[] = entities.map((h: any) => this.mapBasicHost(h));
        const withHostname = hosts.filter(h => h.hostname && h.hostname.trim());
        if (hosts.length > 0 && withHostname.length === 0 && entities.length > 0) {
          console.log(`[Cynet] WARNING: ${hosts.length} hosts received but 0 have hostname.`);
        } else if (hosts.length > 0 && withHostname.length < hosts.length) {
          console.log(`[Cynet] ${withHostname.length}/${hosts.length} hosts have hostname`);
        }
        return { hosts, usedFullApi: false, message: `Pulled ${hosts.length} hosts from Cynet 360 (basic API, ${withHostname.length} with hostname)` };
      }

      // All standard endpoints returned 0 — attempt Cynet v3 / alternative endpoints
      const altResult = await this.tryAlternativeHostEndpoints(baseUrl, token);
      if (altResult) return altResult;

      return { hosts: [], usedFullApi: false, message: "Pulled 0 hosts from Cynet 360 (no hosts found across all available endpoints)" };
    } catch (error: any) {
      return { hosts: [], usedFullApi: false, message: `Failed to pull hosts: ${error.message}` };
    }
  }

  /**
   * Try alternative / Cynet v3 API endpoints for host inventory when the primary
   * /api/full/host and /api/hosts endpoints return 0 results.
   * Attempts (in order): /api/v3/endpoints, /api/v3/hosts, /api/v3/assets,
   * /api/endpoints, /api/assets, /api/device, /api/devices.
   */
  private async tryAlternativeHostEndpoints(
    baseUrl: string,
    token: string,
  ): Promise<{ hosts: CynetHostDetails[]; message: string; usedFullApi: boolean } | null> {
    const candidates = [
      { path: "/api/v3/endpoints",    label: "v3/endpoints" },
      { path: "/api/v3/hosts",        label: "v3/hosts"     },
      { path: "/api/v3/assets",       label: "v3/assets"    },
      { path: "/api/endpoints",       label: "endpoints"    },
      { path: "/api/assets",          label: "assets"       },
      { path: "/api/device",          label: "device"       },
      { path: "/api/devices",         label: "devices"      },
    ];

    for (const { path, label } of candidates) {
      try {
        const url = `${baseUrl}${path}`;
        console.log(`[Cynet] Trying alternative host endpoint: ${url}`);
        const { status, data } = await this.httpRequest(url, {
          headers: this.authHeaders(token),
          timeout: 30000,
        });

        console.log(`[Cynet] ${label}: HTTP ${status}, dataKeys=[${Object.keys(data || {}).join(",")}]`);

        if (status === 404 || status === 405 || status === 501) {
          console.log(`[Cynet] ${label}: endpoint not available (HTTP ${status}), skipping`);
          continue;
        }
        if (status !== 200) {
          console.log(`[Cynet] ${label}: unexpected HTTP ${status}, skipping`);
          continue;
        }

        const entities: any[] =
          data?.Entities || data?.entities ||
          data?.Items || data?.items ||
          data?.Results || data?.results ||
          data?.Hosts || data?.hosts ||
          data?.Endpoints || data?.endpoints ||
          data?.Assets || data?.assets ||
          data?.Devices || data?.devices ||
          (Array.isArray(data) ? data : []);

        if (entities.length === 0) {
          console.log(`[Cynet] ${label}: 0 entities returned`);
          continue;
        }

        if (entities[0]) {
          console.log(`[Cynet] ${label}: field names: [${Object.keys(entities[0]).join(", ")}]`);
          console.log(`[Cynet] ${label}: first entity sample: ${JSON.stringify(entities[0]).substring(0, 600)}`);
        }

        const hosts: CynetHostDetails[] = entities.map((h: any) => this.mapBasicHost(h));
        const withHostname = hosts.filter(h => h.hostname && h.hostname.trim());
        console.log(`[Cynet] ${label}: mapped ${hosts.length} hosts, ${withHostname.length} with hostname`);

        if (withHostname.length === 0) {
          console.log(`[Cynet] ${label}: all entities lack a hostname field — skipping`);
          continue;
        }

        return {
          hosts,
          usedFullApi: false,
          message: `Pulled ${withHostname.length} hosts from Cynet 360 via ${label} endpoint`,
        };
      } catch (e: any) {
        console.log(`[Cynet] ${label}: request failed — ${e.message}`);
      }
    }

    console.log("[Cynet] All alternative host endpoints exhausted — 0 hosts available");
    return null;
  }

  async pullAssets(): Promise<{ assets: AssetRecord[]; totalPulled: number; message: string }> {
    try {
      const result = await this.pullHosts();
      let assets: AssetRecord[] = result.hosts
        .filter(h => h.hostname && h.hostname.trim())
        .map(h => {
          const full = h as CynetFullHostDetails;
          const osStr = [h.osType, h.osVersion].filter(Boolean).join(" ").trim() || undefined;
          const tags = h.groups?.length ? h.groups.join(",") : undefined;
          const statusMap: Record<string, AssetRecord["status"]> = {
            online: "active", active: "active", connected: "active",
            offline: "inactive", disconnected: "inactive",
            quarantined: "quarantined", isolated: "quarantined",
          };
          const mappedStatus = statusMap[(h.agentStatus || "").toLowerCase()] || "active";
          const riskLevel = h.riskScore >= 80 ? "critical" : h.riskScore >= 60 ? "high" : h.riskScore >= 40 ? "medium" : "low";
          const record: AssetRecord = {
            hostname: h.hostname.trim(),
            ipAddress: h.ipAddress || undefined,
            macAddress: h.macAddress || undefined,
            operatingSystem: osStr,
            agentVersion: h.agentVersion || undefined,
            user: h.lastLoggedInUser || undefined,
            lastLoggedInUser: h.lastLoggedInUser || undefined,
            endpointGroup: h.groups?.[0] || undefined,
            tags,
            lastSeen: h.lastSeen ? new Date(h.lastSeen) : undefined,
            status: mappedStatus,
            riskScore: this.normalizeCynetRiskScore(h.riskScore),
            riskLevel,
            deviceHealth: h.avStatus || undefined,
            source: "connector",
            sourcePlatforms: ["cynet"],
            enrichmentData: { avProduct: h.avProduct, avVersion: h.avVersion, agentStatus: h.agentStatus },
            edrHostId: h.hostId || undefined,
            edrPlatform: "cynet",
          };
          if (full.isFullHost) {
            record.softwareInventory = full.installedSoftware;
            record.processor = full.hardware?.cpu || undefined;
            record.totalPhysicalMemory = full.hardware?.memory || undefined;
            record.systemModel = full.hardware?.model || undefined;
            record.systemManufacturer = full.hardware?.manufacturer || undefined;
          }
          return record;
        });

      // ── Step 1: Deduplicate by normalised short hostname ──────────────────────
      // Cynet sometimes returns the same device under both its NetBIOS short name
      // and its FQDN (e.g. "PC01" and "PC01.vinca.local"). Collapse them to a
      // single record with the short name, preferring the more-populated entry.
      const beforeDedup = assets.length;
      assets = this.deduplicateAssets(assets);
      if (assets.length < beforeDedup) {
        console.log(`[Cynet] pullAssets: dedup collapsed ${beforeDedup} → ${assets.length} unique hosts`);
      }

      // ── Step 2: Fetch software from /api/va/installedSoftwares and merge ──────
      // pullSoftwareInventory() tries the VA endpoint first (the most accurate
      // source), then falls back through several host-level strategies. The
      // softwareMap is keyed by normalised short hostname to match our assets.
      try {
        const swResult = await this.pullSoftwareInventory();
        const swMapSize = Object.keys(swResult.softwareMap).length;
        if (swMapSize > 0) {
          console.log(`[Cynet] pullAssets: merging software inventory from "${swResult.source}" (${swMapSize} hosts)`);
          let merged = 0;
          assets = assets.map(a => {
            const key = this.normaliseHostname(a.hostname);
            const sw = swResult.softwareMap[key];
            if (sw && sw.length > 0) {
              merged++;
              return { ...a, softwareInventory: sw };
            }
            return a;
          });
          console.log(`[Cynet] pullAssets: software merged into ${merged}/${assets.length} assets`);
        } else {
          console.log(`[Cynet] pullAssets: software inventory returned 0 hosts — skipping merge`);
        }
      } catch (swErr: any) {
        // Non-fatal: assets still sync without software data
        console.log(`[Cynet] pullAssets: software inventory fetch failed (non-fatal): ${swErr.message}`);
      }

      return { assets, totalPulled: assets.length, message: result.message };
    } catch (error: any) {
      throw new Error(`Cynet pullAssets failed: ${error.message}`);
    }
  }

  /**
   * Fetch all pages from /api/full/host using Skip/Top pagination.
   * Returns null if the endpoint is not available (404/405/501) or completely fails.
   */
  private async fetchFullHostAllPages(baseUrl: string, token: string, queryParams: string, label: string): Promise<any[] | null> {
    const PAGE_SIZE = 500;
    const MAX_PAGES = 20; // safety cap – 500 × 20 = 10 000 hosts max
    const allEntities: any[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const skip = page * PAGE_SIZE;
      const url = `${baseUrl}/api/full/host?${queryParams}&Skip=${skip}&Top=${PAGE_SIZE}`;
      if (page === 0) {
        console.log(`[Cynet] /api/full/host (${label}) initial fetch: ${url}`);
      }

      let status: number;
      let data: any;
      try {
        ({ status, data } = await this.httpRequest(url, {
          headers: this.authHeaders(token),
          timeout: 45000,
        }));
      } catch (e: any) {
        console.log(`[Cynet] /api/full/host (${label}) page ${page} request failed: ${e.message}`);
        return allEntities.length > 0 ? allEntities : null;
      }

      if (page === 0 && (status === 404 || status === 405 || status === 501)) {
        return null; // endpoint not available, caller should fall back
      }
      if (status !== 200) {
        const errDetail = data?.message || data?.title || data?.error || JSON.stringify(data)?.substring(0, 200) || "unknown";
        console.log(`[Cynet] /api/full/host (${label}) page ${page} HTTP ${status}: ${errDetail}`);
        break;
      }

      const pageEntities: any[] = data?.Entities || (Array.isArray(data) ? data : []);
      const totalCount: number = data?.TotalCount ?? data?.totalCount ?? data?.Total ?? data?.total ?? -1;

      if (page === 0) {
        console.log(`[Cynet] /api/full/host (${label}) page 0: ${pageEntities.length} entities, TotalCount=${totalCount}, dataKeys=[${Object.keys(data || {}).join(",")}]`);
        if (pageEntities.length > 0) {
          const sampleKeys = Object.keys(pageEntities[0] || {}).join(", ");
          const rawSw = pageEntities[0]?.InstalledSoftware || pageEntities[0]?.installed_software || pageEntities[0]?.software || pageEntities[0]?.applications;
          console.log(`[Cynet] /api/full/host sample keys: [${sampleKeys}]`);
          console.log(`[Cynet] /api/full/host hasSoftware=${!!rawSw}, softwareCount=${Array.isArray(rawSw) ? rawSw.length : "N/A"}`);
          console.log(`[Cynet] /api/full/host sample (first entity): ${JSON.stringify(pageEntities[0]).substring(0, 800)}`);
        }
      }

      allEntities.push(...pageEntities);

      // Stop conditions
      if (pageEntities.length === 0) break; // empty page → done
      if (totalCount >= 0 && allEntities.length >= totalCount) break; // fetched all
      if (pageEntities.length < PAGE_SIZE) break; // partial page → last page
    }

    return allEntities;
  }

  private async tryFullHostApi(baseUrl: string, token: string, lastSeen: string): Promise<{ hosts: CynetFullHostDetails[]; message: string; usedFullApi: boolean } | null> {
    try {
      // Primary attempt: LastSeen + Name=* with full pagination
      let entities = await this.fetchFullHostAllPages(
        baseUrl, token,
        `LastSeen=${encodeURIComponent(lastSeen)}&Name=*`,
        "90d+Name=*"
      );

      if (entities === null) {
        // fetchFullHostAllPages returns null only on 404/405/501 — endpoint not available
        return null;
      }

      // If no hosts returned with the LastSeen filter, try without it
      if (entities.length === 0) {
        console.log(`[Cynet] /api/full/host: 0 hosts with LastSeen filter, retrying without date filter`);
        const fallbackEntities = await this.fetchFullHostAllPages(baseUrl, token, "Name=*", "NoDateFilter");
        if (fallbackEntities && fallbackEntities.length > 0) {
          entities = fallbackEntities;
        }
      }

      if (entities.length === 0) {
        // Return an empty success (endpoint is available but no hosts) so callers
        // don't fall back to the basic /api/hosts endpoint unnecessarily.
        return { hosts: [], usedFullApi: true, message: "Pulled 0 hosts from Cynet 360 (full API, empty)" };
      }

      const hosts: CynetFullHostDetails[] = entities.map((h: any) => this.mapFullHost(h));
      const withHostname = hosts.filter(h => h.hostname && h.hostname.trim());
      const withSoftware = hosts.filter(h => h.installedSoftware && h.installedSoftware.length > 0);
      console.log(`[Cynet] Full API mapped ${hosts.length} hosts, ${withHostname.length} with hostname, ${withSoftware.length} with software`);
      return { hosts, usedFullApi: true, message: `Pulled ${hosts.length} hosts from Cynet 360 (full API, ${withHostname.length} with hostname, ${withSoftware.length} with software)` };
    } catch (err: any) {
      console.log(`[Cynet] /api/full/host failed: ${err.message}, falling back`);
      return null;
    }
  }

  private normalizeCynetRiskScore(raw: any): number {
    return normalizeCynetRiskScore(raw);
  }

  /**
   * Normalise a hostname to a consistent short form for deduplication and
   * software-map lookups. Strips the FQDN suffix (everything after the first
   * dot) and lowercases. Examples:
   *   "MACHINE01.vinca.local" → "machine01"
   *   "machine01"            → "machine01"
   *   "  PC-22 "             → "pc-22"
   */
  private normaliseHostname(raw: string): string {
    return raw.trim().toLowerCase().split(".")[0];
  }

  /**
   * Deduplicate a batch of AssetRecords by normalised hostname, keeping the
   * record that has the most populated key fields when two entries collapse
   * to the same short hostname. The winning record's hostname is set to the
   * normalised (short) form.
   */
  private deduplicateAssets(records: AssetRecord[]): AssetRecord[] {
    const score = (r: AssetRecord): number =>
      (r.ipAddress ? 1 : 0) +
      (r.riskScore !== undefined ? 1 : 0) +
      (r.lastSeen ? 1 : 0) +
      (r.macAddress ? 1 : 0) +
      (r.operatingSystem ? 1 : 0) +
      ((r.softwareInventory?.length ?? 0) > 0 ? 1 : 0);

    const byKey = new Map<string, AssetRecord>();
    for (const rec of records) {
      const key = this.normaliseHostname(rec.hostname);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing || score(rec) > score(existing)) {
        byKey.set(key, { ...rec, hostname: key });
      }
    }
    return Array.from(byKey.values());
  }

  private mapBasicHost(h: any): CynetHostDetails {
    const scanGroup = h.ScanGroupInfo || {};
    const antivirus = h.Antivirus || {};

    const osRaw = h.OperatingSystem || h.OsType || h.os_type || h.osType || h.Os || h.os || "";
    const archMatch = osRaw.match(/\s+(x64|x86|arm64)$/i);
    const osBase = archMatch ? osRaw.slice(0, archMatch.index).trim() : osRaw.trim();
    const osArch = archMatch ? archMatch[1] : "";

    // Extract logged-in user — Cynet uses various field names across versions
    const rawUser =
      h.LastLoggedOnUser || h.lastLoggedOnUser ||
      h.LoggedUser || h.logged_user ||
      h.LoggedOnUser || h.loggedOnUser ||
      h.CurrentUser || h.currentUser ||
      h.LastLoggedUser || h.last_logged_user ||
      h.LastLoginUser || h.lastLoginUser ||
      h.LoginUser || h.loginUser ||
      h.UserLoginName || h.userLoginName ||
      h.LastUser || h.last_user ||
      h.PrimaryUser || h.primary_user ||
      h.ActiveUser || h.active_user ||
      h.ScanGroupInfo?.LastLoginUser || h.ScanGroupInfo?.LastLoggedUser || "";
    let lastLoggedInUser = "";
    if (rawUser && typeof rawUser === "string" && rawUser.trim()) {
      // Strip domain prefix: "DOMAIN\username" → "username"
      const parts = rawUser.trim().split("\\");
      lastLoggedInUser = (parts[parts.length - 1] || rawUser).trim();
    }
    if (!lastLoggedInUser && Array.isArray(h.Users) && h.Users.length > 0) {
      const SYSTEM_USERS = new Set(["system", "local service", "network service", "nt authority", "defaultaccount"]);
      const nonSystemUser = h.Users.find((u: any) => {
        const uName = ((u.Name || u.name || u.UserName || u.username || "")).toLowerCase().trim();
        return uName && !SYSTEM_USERS.has(uName) && !uName.endsWith("$");
      });
      if (nonSystemUser) {
        const rawName: string = nonSystemUser.Name || nonSystemUser.name || nonSystemUser.UserName || nonSystemUser.username || "";
        const parts = rawName.trim().split("\\");
        lastLoggedInUser = (parts[parts.length - 1] || rawName).trim();
      }
    }

    return {
      hostId: h.ClientDbId?.toString() || h.host_id || h.hostId || h.Id || h.id || "",
      hostname: h.HostName || h.Name || h.hostname || h.host_name || h.name || h.computer_name || h.ComputerName || h.Computer || h.DisplayName || "",
      ipAddress: h.LastIp || h.IpAddress || h.ip_address || h.ipAddress || h.Ip || h.ip || h.internal_ip || h.InternalIp || "",
      macAddress: h.MacAddress || h.mac_address || h.macAddress || h.Mac || h.mac || "",
      osType: osBase,
      osVersion: osArch,
      domain: scanGroup.ScanGroupName || h.Domain || h.domain || h.ad_domain || h.AdDomain || "",
      agentVersion: h.EpsVersion || h.AgentVersion || h.agent_version || h.agentVersion || h.Version || h.version || "",
      agentStatus: h.State?.IsPaused === true ? "paused" : h.State?.IsPaused === false ? "active" : h.AgentStatus || h.agent_status || h.agentStatus || h.Status || h.status || "",
      lastSeen: h.LastScanUTC || h.LastScan || h.LastSeen || h.last_seen || h.lastSeen || h.last_activity || "",
      riskScore: this.normalizeCynetRiskScore(h.RiskLevel ?? h.RiskScore ?? h.risk_score ?? h.riskScore ?? h.Risk ?? h.risk),
      avProduct: antivirus.Product || h.AntivirusProduct || h.antivirus?.product_name || h.av_product || "",
      avStatus: antivirus.Status || h.AntivirusStatus || h.antivirus?.status || h.av_status || "",
      avVersion: antivirus.DatabaseVersion || h.AntivirusVersion || h.antivirus?.version || h.av_version || "",
      groups: h.Groups || h.groups || h.group_names || (scanGroup.ScanGroupName ? [scanGroup.ScanGroupName] : []),
      lastLoggedInUser,
      rawPayload: h,
    };
  }

  private mapFullHost(h: any): CynetFullHostDetails {
    const basic = this.mapBasicHost(h);

    // Cynet uses many different field names for installed software across API versions.
    // Try all known variants; log which one matched so we can see what the live API returns.
    const rawSoftware =
      h.InstalledSoftware ||
      h.installed_software ||
      h.InstalledSoftwareList ||
      h.installed_software_list ||
      h.InstalledApplications ||
      h.installed_applications ||
      h.SoftwareDetails ||
      h.software_details ||
      h.Applications ||
      h.applications ||
      h.AppsList ||
      h.apps_list ||
      h.SoftwareList ||
      h.software_list ||
      h.Programs ||
      h.programs ||
      h.Softwares ||
      h.software ||
      h.installed_apps ||
      h.app_details ||
      h.AppDetails ||
      h.Packages ||
      h.packages ||
      h.AppList ||
      h.app_list ||
      [];

    // Log which field was found (only on non-empty results to avoid noise)
    if (Array.isArray(rawSoftware) && rawSoftware.length > 0) {
      const matchedKey = [
        "InstalledSoftware","installed_software","InstalledSoftwareList","installed_software_list",
        "InstalledApplications","installed_applications","SoftwareDetails","software_details",
        "Applications","applications","AppsList","apps_list","SoftwareList","software_list",
        "Programs","programs","Softwares","software","installed_apps","app_details","AppDetails",
        "Packages","packages","AppList","app_list",
      ].find(k => h[k] === rawSoftware) || "unknown";
      console.log(`[Cynet] mapFullHost: software found under field "${matchedKey}" — ${rawSoftware.length} entries`);
    }

    // Placeholder values that should not be stored as real version strings
    const INVALID_VERSION_VALUES = new Set(["active", "cyneteps", "unknown", "n/a", "na", "none", "-", ""]);
    const normalizeVersion = (raw: any): string => {
      if (!raw) return "";
      const v = String(raw).trim();
      return INVALID_VERSION_VALUES.has(v.toLowerCase()) ? "" : v;
    };

    const installedSoftware = (Array.isArray(rawSoftware) ? rawSoftware : []).map((s: any) => {
      const rawVersion =
        s.Version || s.version || s.product_version || s.ProductVersion ||
        s.DisplayVersion || s.display_version ||
        s.AppVersion || s.app_version ||
        s.FileVersion || s.file_version ||
        s.BuildVersion || s.build_version || "";
      return {
        name: s.Name || s.name || s.product_name || s.ProductName || s.DisplayName || s.AppName || s.app_name || s.SoftwareName || s.software_name || "",
        version: normalizeVersion(rawVersion),
        vendor: s.Vendor || s.vendor || s.Publisher || s.publisher || s.manufacturer || s.Manufacturer || s.Company || s.company || "",
        installDate: s.InstallDate || s.install_date || s.installDate || s.InstalledDate || s.installed_date || undefined,
      };
    });

    const rawHw = h.Hardware || h.hardware || h.SystemInfo || h.system_info || {};

    // Cynet returns hardware fields both in a nested sub-object AND at the top level
    // of the host entity depending on which API version / endpoint is used.
    // Build each value by checking the nested object first, then top-level.
    const rawMemBytes: number | undefined =
      rawHw.TotalMemory ?? h.TotalMemory ?? h.total_memory ?? h.RamBytes ?? h.ram_bytes ?? undefined;
    const rawDiskBytes: number | undefined =
      rawHw.SystemPartitionSize ?? h.SystemPartitionSize ?? h.system_partition_size ??
      rawHw.DiskBytes ?? h.DiskBytes ?? h.disk_bytes ?? undefined;

    const hardware = {
      cpu:
        rawHw.Cpu || rawHw.cpu || rawHw.ProcessorName || rawHw.processor_name || rawHw.processor ||
        h.ProcessorName || h.processor_name || h.CpuName || h.cpu_name ||
        h.Cpu || h.cpu || undefined,
      memory:
        rawHw.Memory || rawHw.memory || rawHw.Ram || rawHw.ram ||
        (rawMemBytes ? `${Math.round(rawMemBytes / 1024)} MB` : undefined) ||
        h.Memory || h.memory || undefined,
      diskSpace:
        rawHw.DiskSpace || rawHw.disk_space || rawHw.Disk || rawHw.disk || rawHw.TotalDisk ||
        (rawDiskBytes ? `${Math.round(rawDiskBytes / (1024 * 1024 * 1024))} GB` : undefined) ||
        h.DiskSpace || h.disk_space || undefined,
      model:
        rawHw.Model || rawHw.model || rawHw.SystemModel || rawHw.system_model ||
        h.Model || h.model || h.SystemModel || h.system_model ||
        h.DeviceModel || h.device_model || h.ComputerModel || undefined,
      manufacturer:
        rawHw.Manufacturer || rawHw.manufacturer || rawHw.SystemManufacturer || rawHw.system_manufacturer ||
        h.Manufacturer || h.manufacturer || h.SystemManufacturer || h.system_manufacturer ||
        h.OemManufacturer || h.oem_manufacturer || undefined,
      serialNumber:
        rawHw.SerialNumber || rawHw.serial_number || rawHw.BiosSerial ||
        h.HDSerial || h.BiosSerialNumber || h.bios_serial_number || h.serial_number ||
        h.SerialNumber || undefined,
      processorCores:
        rawHw.ProcessorCores ?? rawHw.processor_cores ?? rawHw.Cores ??
        h.ProcessorCores ?? h.processor_cores ?? h.CpuCores ?? h.NumCores ?? undefined,
    };

    const rawNics = h.NetworkInterfaces || h.network_interfaces || h.nics || h.adapters || [];
    const networkInterfaces = (Array.isArray(rawNics) ? rawNics : []).map((n: any) => ({
      name: n.Name || n.name || n.adapter_name || n.Description || "",
      ipAddress: n.IpAddress || n.ip_address || n.ipAddress || n.ip || "",
      macAddress: n.MacAddress || n.mac_address || n.macAddress || n.mac || "",
      type: n.Type || n.type || n.adapter_type || n.InterfaceType || "unknown",
    }));

    return {
      ...basic,
      installedSoftware,
      hardware,
      networkInterfaces,
      isFullHost: true,
    };
  }

  async pullUsers(): Promise<{ users: CynetUserDetails[]; message: string }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();
      const lastSeen = this.getLastSeenParam(90);

      const usersUrl = `${baseUrl}/api/users?LastSeen=${encodeURIComponent(lastSeen)}`;
      const { status, data } = await this.httpRequest(usersUrl, {
        headers: this.authHeaders(token),
      });

      if (status !== 200) {
        return { users: [], message: `Failed to fetch users: HTTP ${status} - ${data?.message || data?.title || JSON.stringify(data?.errors) || "Unknown error"}` };
      }

      const entities = data?.Entities || [];

      if (entities.length > 0 && entities[0]) {
        console.log(`[Cynet] /api/users entity field names: [${Object.keys(entities[0]).join(", ")}]`);
      }

      const users: CynetUserDetails[] = entities.map((u: any) => {
        const domain: string = u.Domain || u.domain || u.ADDomain || u.ad_domain || u.DomainName || u.domain_name || "";

        // Raw Cynet AccountType field: "Domain", "Local", "Service", "System" etc.
        const rawAccountType: string = (u.AccountType || u.account_type || u.UserType || u.user_type || "").toString();

        // Determine domain vs. local account and privilege level
        const isDomainAccount: boolean =
          rawAccountType.toLowerCase() === "domain" ||
          (domain.length > 0 && domain !== ".") ||
          !!u.SamAccountName || !!u.sam_account_name ||
          !!u.DistinguishedName || !!u.distinguished_name;
        const isLocalAccount: boolean = rawAccountType.toLowerCase() === "local" || (!isDomainAccount && !domain);

        // Admin classification
        const isAdmin: boolean =
          u.IsAdmin === true || u.is_admin === true ||
          u.IsAdministrator === true || u.is_administrator === true ||
          u.Administrator === 1 || u.administrator === 1 ||
          (typeof u.PrivilegeLevel === "string" && /admin|elevated|privileged/i.test(u.PrivilegeLevel));

        // Service / system account detection
        const rawName: string = u.Name || u.username || u.user_name || u.name || u.sam_account_name || "";

        // Split hostname\username style names to get the suffix (the actual account name)
        const nameParts = rawName.includes("\\") ? rawName.split("\\") : rawName.includes("/") && !rawName.includes("@") ? rawName.split("/") : null;
        const nameSuffix = nameParts ? nameParts[nameParts.length - 1].trim().toLowerCase() : rawName.toLowerCase().trim();

        // Well-known Windows local system/service accounts — always classified at source
        const SYSTEM_ACCOUNTS = new Set([
          "system", "nt authority", "local service", "network service",
          "defaultaccount", "wdagutilityaccount", "localservice", "networkservice",
        ]);
        const isSystem: boolean =
          rawAccountType.toLowerCase() === "system" ||
          u.IsSystem === true ||
          SYSTEM_ACCOUNTS.has(nameSuffix) ||
          nameSuffix.endsWith("$"); // computer account

        const isService: boolean =
          !isSystem && (
            rawAccountType.toLowerCase() === "service" ||
            u.IsService === true || u.is_service === true ||
            /^(svc[_-]|service[_-]|[_-]svc$|sa_)/i.test(nameSuffix) ||
            /service|svc/i.test(nameSuffix)
          );

        // Well-known local administrator accounts — suffix-driven, no vendor flag needed
        const KNOWN_LOCAL_ADMIN_SUFFIXES = new Set(["administrator", "admin"]);
        const isLocalAdmin: boolean =
          !isSystem && !isService &&
          (KNOWN_LOCAL_ADMIN_SUFFIXES.has(nameSuffix) || isAdmin);

        // Well-known local guest accounts
        const isGuest: boolean =
          !isSystem && !isService && !isLocalAdmin &&
          (nameSuffix === "guest" || nameSuffix === "defaultuser0" || /^(visitor|anonymous)$/i.test(nameSuffix));

        // Composite accountType label consistent with storeCynetUsers derivation
        const accountType: string =
          isSystem ? "System" :
          isService ? "Service" :
          isGuest ? "Guest" :
          isLocalAdmin ? "Admin" :
          "Standard";

        return {
          userId: u.ClientDbId?.toString() || u.user_id || u.userId || u.id || "",
          username: rawName,
          displayName: u.DisplayName || u.display_name || u.FullName || u.full_name || rawName,
          email: u.Email || u.email || u.mail || u.email_address || "",
          domain,
          lastLogin: u.LastLogin || u.LastSeen || u.last_login || u.lastLogin || u.last_logon || u.last_activity || "",
          status: u.IsDisabled === 1 || u.is_disabled === true ? "disabled" : (u.IsLocked === 1 || u.is_locked === true ? "locked" : (u.status || u.account_status || "active")),
          riskLevel: u.RiskLevel != null ? String(u.RiskLevel) : (u.risk_level || u.riskLevel || u.risk || "low"),
          loginAnomalies: u.BadLogins || u.bad_logins || u.login_anomalies || u.anomaly_count || u.anomalies || 0,
          groups: u.Groups || u.groups || u.group_names || (u.group_name ? [u.group_name] : []),
          rawPayload: {
            ...u,
            // Explicitly annotate derived fields so storeCynetUsers can rely on them
            _accountType: accountType,
            _isDomainAccount: isDomainAccount,
            _isLocalAccount: isLocalAccount,
            _isAdmin: isLocalAdmin,
            _isGuest: isGuest,
            _isService: isService,
            _isSystem: isSystem,
            _nameSuffix: nameSuffix,
            _lastLogonWorkstation: u.LastLogonWorkstation || u.last_logon_workstation || u.LogonWorkstation || u.logon_workstation || null,
            _samAccountName: u.SamAccountName || u.sam_account_name || rawName,
          },
        };
      });

      return { users, message: `Pulled ${users.length} users from Cynet 360` };
    } catch (error: any) {
      return { users: [], message: `Failed to pull users: ${error.message}` };
    }
  }

  /**
   * Per-host software fetch fallback.
   * When the bulk /api/full/host call returns hosts without InstalledSoftware, try fetching
   * each host individually via /api/full/host/{hostId}. Some Cynet deployments only return
   * full detail (including software) on per-host calls, not on the paginated bulk endpoint.
   * Caps at 50 hosts to avoid rate-limiting.
   */
  private async fetchPerHostSoftware(
    baseUrl: string,
    token: string,
    bulkEntities: any[] | null
  ): Promise<Record<string, { name: string; version: string; vendor: string; installDate?: string }[]>> {
    const softwareMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]> = {};
    // Process all known hosts in throttled batches of 20, pausing 500ms between batches
    // to avoid overwhelming the Cynet API while still covering large tenants fully.
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 500;

    // Collect host candidates: first from bulk entities (which have hostId), then from basic hosts endpoint
    let hostCandidates: Array<{ id: string; hostname: string }> = [];

    if (bulkEntities && bulkEntities.length > 0) {
      for (const h of bulkEntities) {
        const id = h.ClientDbId?.toString() || h.HostId?.toString() || h.host_id || h.hostId || h.Id?.toString() || h.id?.toString() || "";
        const hostname = (h.HostName || h.Name || h.hostname || h.host_name || h.ComputerName || "").toLowerCase().trim();
        if (id && hostname) hostCandidates.push({ id, hostname });
      }
    }

    // If no IDs from bulk, fetch basic host list for IDs
    if (hostCandidates.length === 0) {
      try {
        console.log(`[Cynet] Per-host software: fetching basic host list for IDs`);
        const { status, data } = await this.httpRequest(`${baseUrl}/api/hosts?Name=*`, {
          headers: this.authHeaders(token),
          timeout: 30000,
        });
        if (status === 200) {
          const entities = data?.Entities || (Array.isArray(data) ? data : []);
          for (const h of entities) {
            const id = h.ClientDbId?.toString() || h.HostId?.toString() || h.Id?.toString() || h.id?.toString() || "";
            const hostname = (h.HostName || h.Name || h.hostname || h.ComputerName || "").toLowerCase().trim();
            if (id && hostname) hostCandidates.push({ id, hostname });
          }
          console.log(`[Cynet] Per-host software: got ${hostCandidates.length} host candidates from basic API`);
        }
      } catch (e: any) {
        console.log(`[Cynet] Per-host software: basic host list fetch failed: ${e.message}`);
      }
    }

    if (hostCandidates.length === 0) {
      console.log(`[Cynet] Per-host software: no host IDs available, skipping per-host calls`);
      return softwareMap;
    }

    console.log(`[Cynet] Per-host software: fetching individual detail for all ${hostCandidates.length} hosts in batches of ${BATCH_SIZE}`);

    let hostsWithSoftware = 0;
    let isFirstHost = true;
    for (let batchStart = 0; batchStart < hostCandidates.length; batchStart += BATCH_SIZE) {
      if (batchStart > 0) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
      const batch = hostCandidates.slice(batchStart, batchStart + BATCH_SIZE);
      for (const host of batch) {
        try {
          const url = `${baseUrl}/api/full/host/${host.id}`;
          const { status, data } = await this.httpRequest(url, {
            headers: this.authHeaders(token),
            timeout: 20000,
          });

          if (status !== 200) {
            continue;
          }

          // Log raw field names for the first host response to aid debugging
          if (isFirstHost) {
            isFirstHost = false;
            const dataKeys = Object.keys(data || {}).join(", ");
            console.log(`[Cynet] Per-host /api/full/host/${host.id} field names: [${dataKeys}]`);
            console.log(`[Cynet] Per-host sample (truncated): ${JSON.stringify(data).substring(0, 600)}`);
          }

          const rawSw =
            data?.InstalledSoftware ||
            data?.installed_software ||
            data?.InstalledSoftwareList ||
            data?.installed_software_list ||
            data?.InstalledApplications ||
            data?.installed_applications ||
            data?.SoftwareDetails ||
            data?.software_details ||
            data?.Applications ||
            data?.applications ||
            data?.AppsList ||
            data?.apps_list ||
            data?.SoftwareList ||
            data?.software_list ||
            data?.Programs ||
            data?.programs ||
            data?.Softwares ||
            data?.software ||
            data?.installed_apps ||
            data?.app_details ||
            data?.AppDetails ||
            data?.Packages ||
            data?.packages ||
            data?.AppList ||
            data?.app_list ||
            data?.Apps ||
            data?.apps ||
            [];

          if (!Array.isArray(rawSw) || rawSw.length === 0) {
            continue;
          }

          const INVALID_SW_VERSIONS = new Set(["active", "cyneteps", "unknown", "n/a", "na", "none", "-", ""]);
          const normVer = (v: any) => { const s = String(v || "").trim(); return INVALID_SW_VERSIONS.has(s.toLowerCase()) ? "" : s; };
          const sw = rawSw.map((s: any) => ({
            name: s.Name || s.name || s.product_name || s.ProductName || s.DisplayName || s.AppName || s.app_name || s.SoftwareName || "",
            version: normVer(s.Version || s.version || s.product_version || s.ProductVersion || s.DisplayVersion || s.display_version || s.AppVersion || s.app_version || s.FileVersion || s.file_version || ""),
            vendor: s.Vendor || s.vendor || s.Publisher || s.publisher || s.manufacturer || s.Manufacturer || s.Company || s.company || "",
            installDate: s.InstallDate || s.install_date || s.installDate || undefined,
          })).filter((s: any) => s.name);

          if (sw.length > 0) {
            const normKey = this.normaliseHostname(host.hostname);
            softwareMap[normKey] = sw;
            hostsWithSoftware++;
            console.log(`[Cynet] Per-host ${host.hostname}: found ${sw.length} software entries`);
          }
        } catch (e: any) {
          // Silent — single host failure should not block others
        }
      } // end inner host loop
    } // end batch loop

    console.log(`[Cynet] Per-host software: ${hostsWithSoftware}/${hostCandidates.length} hosts returned software`);
    return softwareMap;
  }

  /**
   * Pull software inventory from Cynet.
   * Tries multiple strategies in order:
   * VA.  /api/va/installedSoftwares — PRIMARY. Vulnerability Assessment endpoint that returns
   *      the actual Windows Add/Remove Programs list. Most accurate and complete.
   * 0.   /api/full/host with explicit InstalledSoftware fields param
   * 1.   /api/full/host with 180-day lookback (already includes InstalledSoftware)
   * 1b.  Per-host fallback — /api/full/host/{id} for each known host
   * 2.   /api/apps — Cynet's dedicated application inventory endpoint
   * 3.   /api/software — alternative software endpoint
   * Returns a map of hostname (lowercase) → software list for merging into assets.
   */
  async pullSoftwareInventory(): Promise<{ softwareMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]>; source: string; message: string }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();
      const lastSeen180 = this.getLastSeenParam(180);

      // Strategy 1: /api/full/host with 180-day lookback, fully paginated
      // Try with date filter first, then without (some Cynet tenants ignore or reject LastSeen on this endpoint)
      const buildSoftwareMap = (entities: any[]): { softwareMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]>; hostsWithSoftware: number } => {
        const softwareMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]> = {};
        let hostsWithSoftware = 0;
        for (const h of entities) {
          const rawHostname = (h.HostName || h.Name || h.hostname || h.computer_name || h.ComputerName || "").trim();
          const hostname = this.normaliseHostname(rawHostname);
          if (!hostname) continue;
          const rawSoftware =
            h.InstalledSoftware || h.installed_software ||
            h.InstalledSoftwareList || h.installed_software_list ||
            h.InstalledApplications || h.installed_applications ||
            h.SoftwareDetails || h.software_details ||
            h.software || h.applications ||
            h.AppsList || h.apps_list ||
            h.SoftwareList || h.software_list ||
            h.Programs || h.programs ||
            h.Softwares || h.app_details || h.AppDetails ||
            h.Packages || h.packages || h.AppList || h.app_list || [];
          const software = (Array.isArray(rawSoftware) ? rawSoftware : []).map((s: any) => ({
            name: s.Name || s.name || s.product_name || s.DisplayName || s.AppName || s.app_name || s.SoftwareName || "",
            version: s.Version || s.version || s.product_version || s.DisplayVersion || s.AppVersion || "",
            vendor: s.Vendor || s.vendor || s.Publisher || s.publisher || s.manufacturer || s.Manufacturer || "",
            installDate: s.InstallDate || s.install_date || s.installDate || undefined,
          })).filter((s: any) => s.name);
          if (software.length > 0) {
            softwareMap[hostname] = software;
            hostsWithSoftware++;
          }
        }
        return { softwareMap, hostsWithSoftware };
      };

      // ─── Strategy VA: /api/va/installedSoftwares ─────────────────────────────
      // Primary strategy. This is the Cynet Vulnerability Assessment endpoint that
      // returns the actual Windows Add/Remove Programs list per host — the most
      // accurate and complete source of installed application data.
      // Response is a flat list: [{ SoftwareName, Version, Publisher, InstallDate, HostName, ... }]
      // We group entries by HostName to build the softwareMap.
      try {
        console.log(`[Cynet] Software inventory: trying /api/va/installedSoftwares (primary VA endpoint)`);
        const vaMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]> = {};
        let vaPage = 1;
        const vaPageSize = 500;
        let vaTotal = Infinity;
        let vaPulled = 0;

        while (vaPulled < vaTotal) {
          const vaUrl = `${baseUrl}/api/va/installedSoftwares?page=${vaPage}&pageSize=${vaPageSize}`;
          const { status, data } = await this.httpRequest(vaUrl, {
            headers: this.authHeaders(token),
            timeout: 30000,
          });

          if (status !== 200) {
            console.log(`[Cynet] /api/va/installedSoftwares returned HTTP ${status} — skipping VA strategy`);
            break;
          }

          // Log raw field names on first page to help diagnose field mapping
          if (vaPage === 1) {
            const entities0 = data?.Entities || data?.entities || data?.items || data?.data || (Array.isArray(data) ? data : []);
            const sample = entities0[0];
            if (sample) console.log(`[Cynet] /api/va/installedSoftwares field names: [${Object.keys(sample).join(", ")}]`);
          }

          const total = data?.Total || data?.total || data?.totalCount || data?.TotalCount;
          if (typeof total === "number" && isFinite(total)) vaTotal = total;

          const entries = data?.Entities || data?.entities || data?.items || data?.data || (Array.isArray(data) ? data : []);
          if (!Array.isArray(entries) || entries.length === 0) break;

          for (const e of entries) {
            const rawHostname = (
              e.HostName || e.hostname || e.host_name || e.ComputerName || e.computer_name ||
              e.DeviceName || e.device_name || e.MachineName || e.machine_name || ""
            ).trim();
            const hostname = this.normaliseHostname(rawHostname);
            if (!hostname) continue;

            const name = e.SoftwareName || e.software_name || e.Name || e.name || e.ProductName || e.product_name || e.DisplayName || e.display_name || "";
            if (!name) continue;

            const entry = {
              name,
              version: e.Version || e.version || e.SoftwareVersion || e.software_version || e.DisplayVersion || e.display_version || "",
              vendor: e.Publisher || e.publisher || e.Vendor || e.vendor || e.Manufacturer || e.manufacturer || "",
              installDate: e.InstallDate || e.install_date || e.InstalledDate || e.installed_date || undefined,
            };

            if (!vaMap[hostname]) vaMap[hostname] = [];
            vaMap[hostname].push(entry);
          }

          vaPulled += entries.length;
          vaPage++;

          // Safety: stop if we seem to have all data or hit 20 pages
          if (entries.length < vaPageSize || vaPage > 20) break;
        }

        const hostsWithVaSoftware = Object.keys(vaMap).length;
        const totalVaEntries = Object.values(vaMap).reduce((s, arr) => s + arr.length, 0);

        if (hostsWithVaSoftware > 0) {
          console.log(`[Cynet] /api/va/installedSoftwares: found ${totalVaEntries} software entries across ${hostsWithVaSoftware} hosts`);
          return {
            softwareMap: vaMap,
            source: "va_installed_softwares",
            message: `Got ${totalVaEntries} software entries for ${hostsWithVaSoftware} hosts via /api/va/installedSoftwares`,
          };
        }
        console.log(`[Cynet] /api/va/installedSoftwares returned 0 entries — falling through to host-level strategies`);
      } catch (e: any) {
        console.log(`[Cynet] /api/va/installedSoftwares failed: ${e.message} — falling through to host-level strategies`);
      }

      // Strategy 0: /api/full/host with explicit InstalledSoftware fields param
      // Some Cynet versions require explicit field selection to return software data
      try {
        const fieldsParam = "Fields=InstalledSoftware,HostName,Name,ClientDbId,LastIp,OperatingSystem&IncludeSoftware=true&expand=software&includeSoftwareInventory=true";
        console.log(`[Cynet] Software inventory: trying /api/full/host with explicit fields param`);
        const entitiesWithFields = await this.fetchFullHostAllPages(
          baseUrl, token,
          `${fieldsParam}&Name=*`,
          "sw-fields"
        );
        if (entitiesWithFields && entitiesWithFields.length > 0) {
          const { softwareMap, hostsWithSoftware } = buildSoftwareMap(entitiesWithFields);
          if (hostsWithSoftware > 0) {
            console.log(`[Cynet] Software inventory (fields param): ${hostsWithSoftware}/${entitiesWithFields.length} hosts have software`);
            return { softwareMap, source: "full_host_fields", message: `Got software for ${hostsWithSoftware} hosts via full host API (explicit fields)` };
          }
          console.log(`[Cynet] Full host API with fields returned ${entitiesWithFields.length} hosts but 0 have InstalledSoftware`);
        }
      } catch (e: any) {
        console.log(`[Cynet] Full host fields param pull failed: ${e.message}`);
      }

      let bulkEntities: any[] | null = null;
      try {
        console.log(`[Cynet] Software inventory: pulling /api/full/host (180d, paginated)`);
        // First try with LastSeen filter
        let entities = await this.fetchFullHostAllPages(
          baseUrl, token,
          `LastSeen=${encodeURIComponent(lastSeen180)}&Name=*`,
          "sw-180d"
        );
        // If endpoint returned null (not available) or returned hosts but none have software,
        // retry without the date filter to broaden the query
        if (entities !== null && entities.length > 0) {
          const { softwareMap, hostsWithSoftware } = buildSoftwareMap(entities);
          if (hostsWithSoftware > 0) {
            console.log(`[Cynet] Software inventory (full host 180d): ${hostsWithSoftware}/${entities.length} hosts have software`);
            return { softwareMap, source: "full_host_180d", message: `Got software for ${hostsWithSoftware} hosts via full host API (180d, ${entities.length} total hosts)` };
          }
          console.log(`[Cynet] Full host API (180d) returned ${entities.length} hosts but 0 have InstalledSoftware — retrying without date filter`);
          bulkEntities = entities; // save for per-host fallback
        }

        // Retry without date filter
        const entitiesNoFilter = await this.fetchFullHostAllPages(baseUrl, token, "Name=*", "sw-nodate");
        if (entitiesNoFilter && entitiesNoFilter.length > 0) {
          const { softwareMap, hostsWithSoftware } = buildSoftwareMap(entitiesNoFilter);
          if (hostsWithSoftware > 0) {
            console.log(`[Cynet] Software inventory (full host, no date filter): ${hostsWithSoftware}/${entitiesNoFilter.length} hosts have software`);
            return { softwareMap, source: "full_host_nodate", message: `Got software for ${hostsWithSoftware} hosts via full host API (no date filter, ${entitiesNoFilter.length} total hosts)` };
          }
          console.log(`[Cynet] Full host API (no date filter) returned ${entitiesNoFilter.length} hosts but still 0 have InstalledSoftware`);
          if (!bulkEntities) bulkEntities = entitiesNoFilter;
        }
      } catch (e: any) {
        console.log(`[Cynet] Full host software pull failed: ${e.message}`);
      }

      // Strategy 1b: per-host fallback — call /api/full/host/{id} for each known host
      // This is needed when the bulk endpoint omits InstalledSoftware but individual calls include it
      try {
        const perHostResult = await this.fetchPerHostSoftware(baseUrl, token, bulkEntities);
        if (perHostResult && Object.keys(perHostResult).length > 0) {
          const hostsWithSoftware = Object.keys(perHostResult).length;
          console.log(`[Cynet] Software inventory (per-host fallback): ${hostsWithSoftware} hosts have software`);
          return { softwareMap: perHostResult, source: "per_host_fallback", message: `Got software for ${hostsWithSoftware} hosts via per-host API calls` };
        }
      } catch (e: any) {
        console.log(`[Cynet] Per-host software fallback failed: ${e.message}`);
      }

      // Strategy 2: try /api/apps endpoint (Cynet's dedicated app/software inventory)
      for (const appsEndpoint of [`${baseUrl}/api/apps`, `${baseUrl}/api/software`, `${baseUrl}/api/installed-apps`]) {
        try {
          console.log(`[Cynet] Software inventory: trying ${appsEndpoint}`);
          const { status, data } = await this.httpRequest(appsEndpoint, { headers: this.authHeaders(token), timeout: 30000 });
          if (status === 200) {
            const items = data?.Entities || data?.Items || data?.Apps || data?.Software || (Array.isArray(data) ? data : []);
            if (items.length > 0) {
              const softwareMap: Record<string, { name: string; version: string; vendor: string; installDate?: string }[]> = {};
              for (const item of items) {
                const rawH = (item.HostName || item.hostname || item.host_name || item.ComputerName || item.computer_name || "").trim();
                const hostname = this.normaliseHostname(rawH);
                if (!hostname) continue;
                const entry = {
                  name: item.Name || item.AppName || item.SoftwareName || item.ProductName || item.name || item.app_name || "",
                  version: item.Version || item.AppVersion || item.version || item.app_version || "",
                  vendor: item.Vendor || item.Publisher || item.vendor || item.publisher || "",
                  installDate: item.InstallDate || item.install_date || undefined,
                };
                if (!entry.name) continue;
                if (!softwareMap[hostname]) softwareMap[hostname] = [];
                softwareMap[hostname].push(entry);
              }
              const hostsWithSoftware = Object.keys(softwareMap).length;
              if (hostsWithSoftware > 0) {
                console.log(`[Cynet] Software inventory via ${appsEndpoint}: ${hostsWithSoftware} hosts, ${items.length} total entries`);
                return { softwareMap, source: "apps_endpoint", message: `Got software for ${hostsWithSoftware} hosts via apps endpoint` };
              }
            }
          } else {
            console.log(`[Cynet] ${appsEndpoint} returned HTTP ${status}`);
          }
        } catch { /* try next */ }
      }

      console.log("[Cynet] Software inventory: no data available from any endpoint");
      return { softwareMap: {}, source: "none", message: "No software inventory available from Cynet API" };
    } catch (error: any) {
      return { softwareMap: {}, source: "error", message: `Software inventory pull failed: ${error.message}` };
    }
  }

  async pullNetwork(): Promise<{ connections: CynetNetworkDetails[]; message: string }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();

      const endpoints = [
        { url: `${baseUrl}/api/network`, type: "network" },
        { url: `${baseUrl}/api/domains`, type: "domain" },
      ];

      const allConnections: CynetNetworkDetails[] = [];

      for (const ep of endpoints) {
        try {
          const { status, data } = await this.httpRequest(ep.url, {
            headers: this.authHeaders(token),
            timeout: 30000,
          });

          if (status === 200) {
            const items = data?.Entities || (Array.isArray(data) ? data : (data.items || data.results || data.data || data.connections || data.domains || []));
            const mapped = items.map((n: any) => this.mapNetworkItem(n, ep.type));
            allConnections.push(...mapped);
          }
        } catch {}
      }

      return { connections: allConnections, message: `Pulled ${allConnections.length} network/domain entries from Cynet 360` };
    } catch (error: any) {
      return { connections: [], message: `Failed to pull network data: ${error.message}` };
    }
  }

  private mapNetworkItem(raw: any, type: string): CynetNetworkDetails {
    return {
      connectionId: raw.id || raw.connection_id || raw.domain_id || "",
      sourceIp: raw.source_ip || raw.src_ip || raw.internal_ip || "",
      destinationIp: raw.destination_ip || raw.dst_ip || raw.external_ip || raw.ip || "",
      destinationDomain: raw.domain || raw.destination_domain || raw.dst_domain || raw.url || "",
      port: raw.port || raw.dst_port || raw.destination_port || 0,
      protocol: raw.protocol || raw.proto || "",
      direction: raw.direction || (type === "domain" ? "outbound" : "unknown"),
      action: normalizeActionLabel(raw.action || raw.status || raw.verdict, "Cynet 360") || "Detected",
      threatType: raw.threat_type || raw.category || raw.detection_type || type,
      severity: raw.severity || raw.risk_level || "medium",
      timestamp: raw.timestamp || raw.last_seen || raw.detected_at || new Date().toISOString(),
      rawPayload: raw,
    };
  }

  /**
   * Pull missing patch / vulnerability data from /api/va/patchValidation.
   * Returns a map of hostname (lowercase) → array of missing patches.
   * Each patch: { title, kbArticle, severity, description, releaseDate }
   */
  async pullPatchValidation(): Promise<{
    patchMap: Record<string, Array<{ title: string; kbArticle: string; severity: string; description: string; installDate?: string; releaseDate?: string }>>;
    message: string;
  }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();

      const patchMap: Record<string, Array<{ title: string; kbArticle: string; severity: string; description: string; installDate?: string; releaseDate?: string }>> = {};
      let page = 1;
      const pageSize = 500;
      let totalPulled = 0;

      while (true) {
        const url = `${baseUrl}/api/va/patchValidation?page=${page}&pageSize=${pageSize}`;
        if (page === 1) console.log(`[Cynet] Pulling patch validation: ${url}`);

        const { status, data } = await this.httpRequest(url, {
          headers: this.authHeaders(token),
          timeout: 30000,
        });

        if (status === 404 || status === 405 || status === 501) {
          console.log(`[Cynet] /api/va/patchValidation not available (HTTP ${status}) — skipping`);
          return { patchMap: {}, message: `Patch validation endpoint not available (HTTP ${status})` };
        }
        if (status !== 200) {
          console.log(`[Cynet] /api/va/patchValidation HTTP ${status} — stopping`);
          break;
        }

        const entries = data?.Entities || data?.entities || data?.items || data?.data || (Array.isArray(data) ? data : []);
        if (!Array.isArray(entries) || entries.length === 0) break;

        if (page === 1 && entries[0]) {
          console.log(`[Cynet] /api/va/patchValidation field names: [${Object.keys(entries[0]).join(", ")}]`);
        }

        for (const e of entries) {
          const hostname = (
            e.HostName || e.hostname || e.host_name || e.ComputerName || e.computer_name ||
            e.DeviceName || e.device_name || e.MachineName || e.machine_name || ""
          ).toLowerCase().trim();
          if (!hostname) continue;

          const title = e.PatchName || e.patch_name || e.Title || e.title || e.Name || e.name || e.KB || e.kb || "";
          if (!title) continue;

          const patch = {
            title,
            kbArticle: e.KBArticle || e.kb_article || e.KB || e.kb || e.KBNumber || e.kb_number || "",
            severity: (e.Severity || e.severity || e.CriticalLevel || e.critical_level || "medium").toString().toLowerCase(),
            description: e.Description || e.description || e.Summary || e.summary || "",
            installDate: e.InstallDate || e.install_date || e.InstalledDate || e.installed_date || e.FixedDate || e.fixed_date || undefined,
            releaseDate: e.ReleaseDate || e.release_date || e.PublishedDate || e.published_date || undefined,
          };

          if (!patchMap[hostname]) patchMap[hostname] = [];
          patchMap[hostname].push(patch);
        }

        totalPulled += entries.length;
        page++;

        const total = data?.Total || data?.total || data?.TotalCount || data?.totalCount;
        if (entries.length < pageSize || (typeof total === "number" && totalPulled >= total) || page > 20) break;
      }

      const hostsWithPatches = Object.keys(patchMap).length;
      const totalPatches = Object.values(patchMap).reduce((s, a) => s + a.length, 0);
      const msg = hostsWithPatches > 0
        ? `Pulled ${totalPatches} missing patches across ${hostsWithPatches} hosts from /api/va/patchValidation`
        : `No missing patches found via /api/va/patchValidation`;
      console.log(`[Cynet] ${msg}`);
      return { patchMap, message: msg };
    } catch (error: any) {
      return { patchMap: {}, message: `Patch validation pull failed: ${error.message}` };
    }
  }

  /**
   * Pull fleet/agent health status from /api/HealthCheck/Get.
   * Returns a per-host health map (if the endpoint provides per-host data)
   * plus a raw fleet-level summary for logging.
   */
  async pullHealthCheck(): Promise<{
    hostHealthMap: Record<string, { status: string; agentStatus: string; healthScore: number; issues: string[] }>;
    fleetSummary: Record<string, any> | null;
    message: string;
  }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.getApiBase();

      const url = `${baseUrl}/api/HealthCheck/Get`;
      console.log(`[Cynet] Pulling health check: ${url}`);

      const { status, data } = await this.httpRequest(url, {
        headers: this.authHeaders(token),
        timeout: 30000,
      });

      if (status === 404 || status === 405 || status === 501) {
        return { hostHealthMap: {}, fleetSummary: null, message: `Health check endpoint not available (HTTP ${status})` };
      }
      if (status !== 200) {
        return { hostHealthMap: {}, fleetSummary: null, message: `Health check HTTP ${status}` };
      }

      console.log(`[Cynet] /api/HealthCheck/Get response keys: [${Object.keys(data || {}).join(", ")}]`);

      const hostHealthMap: Record<string, { status: string; agentStatus: string; healthScore: number; issues: string[] }> = {};

      // If the response contains a per-host list, extract it
      const entities: any[] =
        data?.Entities || data?.entities || data?.Hosts || data?.hosts ||
        data?.Results || data?.results || (Array.isArray(data) ? data : []);

      if (entities.length > 0 && entities[0]) {
        console.log(`[Cynet] /api/HealthCheck/Get entity field names: [${Object.keys(entities[0]).join(", ")}]`);
      }

      for (const e of entities) {
        const hostname = (
          e.HostName || e.hostname || e.host_name || e.ComputerName || e.computer_name ||
          e.Name || e.name || ""
        ).toLowerCase().trim();
        if (!hostname) continue;

        // Derive normalized health / agent status
        const rawHealthStatus = (e.Status || e.status || e.Health || e.health || e.HealthStatus || e.health_status || "unknown").toString().toLowerCase();
        const rawAgentStatus = (e.AgentStatus || e.agent_status || e.ConnectionStatus || e.connection_status || rawHealthStatus).toString().toLowerCase();

        const healthStatus =
          rawHealthStatus.includes("healthy") || rawHealthStatus === "ok" || rawHealthStatus === "good" ? "healthy" :
          rawHealthStatus.includes("warn") || rawHealthStatus.includes("degraded") || rawHealthStatus.includes("partial") ? "degraded" :
          rawHealthStatus.includes("offline") || rawHealthStatus.includes("disconnected") || rawHealthStatus === "down" ? "offline" :
          rawHealthStatus === "active" || rawHealthStatus === "connected" ? "healthy" :
          rawHealthStatus === "inactive" || rawHealthStatus === "disconnected" ? "offline" : "unknown";

        const agentStatus =
          rawAgentStatus === "active" || rawAgentStatus === "connected" || rawAgentStatus === "online" ? "active" :
          rawAgentStatus === "offline" || rawAgentStatus === "disconnected" || rawAgentStatus === "inactive" ? "offline" :
          "unknown";

        // Health score: prefer explicit numeric score, otherwise derive from health status
        const rawScore = e.HealthScore || e.health_score || e.Score || e.score || e.RiskScore || e.risk_score;
        const healthScore: number = (typeof rawScore === "number") ? Math.min(100, Math.max(0, rawScore)) :
          healthStatus === "healthy" ? 100 :
          healthStatus === "degraded" ? 50 :
          healthStatus === "offline" ? 0 : 75;

        const issues: string[] = [];
        if (e.Issues) issues.push(...(Array.isArray(e.Issues) ? e.Issues.map(String) : [String(e.Issues)]));
        if (e.issues) issues.push(...(Array.isArray(e.issues) ? e.issues.map(String) : [String(e.issues)]));
        if (e.Errors) issues.push(...(Array.isArray(e.Errors) ? e.Errors.map(String) : [String(e.Errors)]));
        if (e.Warnings) issues.push(...(Array.isArray(e.Warnings) ? e.Warnings.map(String) : [String(e.Warnings)]));

        hostHealthMap[hostname] = { status: healthStatus, agentStatus, healthScore, issues };
      }

      // If no per-host entries, treat the top-level object as a fleet summary
      const fleetSummary = entities.length === 0 ? data : null;
      if (fleetSummary) {
        console.log(`[Cynet] HealthCheck returned fleet summary (no per-host entries): ${JSON.stringify(fleetSummary).substring(0, 400)}`);
      }

      const msg = Object.keys(hostHealthMap).length > 0
        ? `Health check: ${Object.keys(hostHealthMap).length} hosts with health status`
        : (fleetSummary ? "Health check: fleet summary received" : "Health check: no data");
      return { hostHealthMap, fleetSummary, message: msg };
    } catch (error: any) {
      return { hostHealthMap: {}, fleetSummary: null, message: `Health check pull failed: ${error.message}` };
    }
  }

  getEventSchema(): EventSchemaField[] {
    return [
      { name: "alert_id", type: "string", description: "Unique alert identifier", required: true },
      { name: "alert_name", type: "string", description: "Alert name or title", required: true },
      { name: "severity", type: "string", description: "Alert severity (Critical/High/Medium/Low)", required: true },
      { name: "status", type: "string", description: "Alert status (Open/In Progress/Closed)", required: false },
      { name: "host_name", type: "string", description: "Affected hostname", required: false },
      { name: "user_name", type: "string", description: "Associated user account", required: false },
      { name: "category", type: "string", description: "Alert category/type", required: false },
      { name: "mitre_tactic", type: "string", description: "MITRE ATT&CK tactic", required: false },
      { name: "mitre_technique", type: "string", description: "MITRE ATT&CK technique", required: false },
      { name: "process_name", type: "string", description: "Process that triggered the alert", required: false },
      { name: "file_path", type: "string", description: "File path associated with the alert", required: false },
      { name: "source_ip", type: "string", description: "Source IP address", required: false },
      { name: "destination_ip", type: "string", description: "Destination IP address", required: false },
      { name: "timestamp", type: "string", description: "Alert timestamp", required: true },
      { name: "eps_action", type: "string", description: "EPS auto-remediation action taken", required: false },
    ];
  }

  private safeStr(val: any): string | null {
    if (val == null) return null;
    if (typeof val === "object") return null;
    return String(val);
  }

  private parseCynetDesc(rawEvent: Record<string, any>): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    const src = rawEvent.IncidentJsonDescription;
    if (src) {
      let parsed: Record<string, any> = {};
      if (typeof src === "object" && src !== null) {
        parsed = src;
      } else if (typeof src === "string") {
        try { parsed = JSON.parse(src); } catch { parsed = {}; }
      }
      out.hostIp = parsed["Host Ip"] || parsed["HostIp"] || null;
      out.osVersion = parsed["OS Version"] || parsed["OSVersion"] || null;
      out.agentVersion = parsed["CynetEPS Version"] || parsed["EPS Version"] || null;
      out.parsedHostname = parsed["Hostname"] || parsed["HostName"] || null;
      out.deviceType = parsed["Device Type"] || parsed["DeviceType"] || null;
      out.deviceName = parsed["Device Name"] || parsed["DeviceName"] || null;
      out.deviceId = parsed["Device ID"] || parsed["DeviceId"] || null;
      out.deviceStatus = parsed["Device Status"] || parsed["DeviceStatus"] || null;
      out.epsPrevention = parsed["EPS Prevention"] || parsed["EPSPrevention"] || null;
      out.vendor = parsed["Vendor"] || parsed["vendor"] || null;
      out.product = parsed["Product"] || parsed["product"] || null;
      out.isUsb = parsed["Is USB"] !== undefined ? String(parsed["Is USB"]) : null;
    }
    const topLevelHostIp = rawEvent.HostIp || null;
    if (topLevelHostIp) {
      out.hostIp = topLevelHostIp;
    } else if (!out.hostIp) {
      out.hostIp = null;
    }
    const incDesc = rawEvent.IncidentDescription;
    if (typeof incDesc === "string" && incDesc) {
      const extract = (key: string) => {
        const m = incDesc.match(new RegExp(`${key}:\\s*([^,\\n]+)`, "i"));
        return m ? m[1].trim() : null;
      };
      if (!out.hostIp) out.hostIp = extract("Host Ip") || extract("HostIp");
      if (!out.osVersion) out.osVersion = extract("OS Version") || extract("OSVersion");
      if (!out.agentVersion) out.agentVersion = extract("CynetEPS Version") || extract("EPS Version");
      if (!out.parsedHostname) out.parsedHostname = extract("Hostname");
      if (!out.deviceType) out.deviceType = extract("Device Type");
      if (!out.deviceName) out.deviceName = extract("Device Name");
      if (!out.deviceId) out.deviceId = extract("Device ID");
      if (!out.deviceStatus) out.deviceStatus = extract("Device Status");
      if (!out.epsPrevention) out.epsPrevention = extract("EPS Prevention");
      if (!out.vendor) out.vendor = extract("Vendor");
      if (!out.product) out.product = extract("Product");
    }
    return out;
  }

  private deriveDeviceControlAction(
    deviceType: string | null | undefined,
    deviceName: string | null | undefined,
    deviceStatus: string | null | undefined,
    epsPrevention: string | null | undefined,
    isDeviceControl: boolean
  ): string | null {
    if (!isDeviceControl) return null;
    const dt = (deviceType || "").toLowerCase();
    const dn = (deviceName || "").toLowerCase();
    const blockedSignal = (deviceStatus || "").toLowerCase().includes("block") ||
      (epsPrevention || "").toLowerCase().includes("block");
    const allowedSignal = (deviceStatus || "").toLowerCase().includes("allow") ||
      (epsPrevention || "").toLowerCase().includes("allow");
    const state = blockedSignal ? "Blocked" : allowedSignal ? "Allowed" : null;
    if (!state) return null;

    if (dt === "mtp" || dn.includes("mtp")) return `MTP USB Device ${state}`;
    if (dt === "usb" || dt === "removable" || dn.includes("usb")) return `USB Device ${state}`;
    if (dt === "bluetooth" || dn.includes("bluetooth")) return `Bluetooth Device ${state}`;
    if (dt === "cdrom" || dt === "cd" || dt === "dvd" || dn.includes("cd") || dn.includes("dvd")) return `CD/DVD Device ${state}`;
    if (dt === "printer" || dn.includes("printer")) return `Printer ${state}`;
    if (dt === "wifi" || dt === "wireless" || dn.includes("wifi")) return `WiFi Adapter ${state}`;
    if (dt === "storage" || dn.includes("storage")) return `Storage Device ${state}`;
    if (deviceName) return `${deviceName} ${state}`;
    return `Device ${state}`;
  }

  private decodeEpsRemediationCode(code: any): string | null {
    if (code == null) return null;
    const EPS_REMEDIATION_CODES: Record<string, string> = {
      "0": "No Action",
      "1": "Detected Only",
      "2": "Process Killed",
      "3": "File Quarantined",
      "4": "File Deleted",
      "5": "Network Connection Blocked",
      "6": "Registry Key Removed",
      "7": "Scheduled Task Removed",
      "8": "Service Stopped",
      "9": "File Restored",
      "10": "Endpoint Isolated",
      "11": "Memory Scan Completed",
      "12": "Script Blocked",
      "13": "Exploit Prevented",
      "14": "Ransomware Rolled Back",
      "15": "Credential Theft Prevented",
      "16": "Lateral Movement Blocked",
      "17": "USB Device Blocked",
      "18": "USB Device Allowed",
      "19": "MTP Device Blocked",
      "20": "MTP Device Allowed",
      "21": "CD/DVD Device Blocked",
      "22": "CD/DVD Device Allowed",
      "23": "Bluetooth Device Blocked",
      "24": "Bluetooth Device Allowed",
      "25": "WiFi Adapter Blocked",
      "26": "WiFi Adapter Allowed",
      "27": "Printer Blocked",
      "28": "Printer Allowed",
      "29": "Storage Device Detected (Blocked)",
      "30": "Storage Device Detected (Allowed)",
      "31": "Device Control Policy Applied",
      "32": "Device Blocked",
      "33": "Device Allowed",
      "34": "File Transfer Blocked",
      "35": "File Transfer Allowed",
      "36": "Shadow Copy Deleted",
      "37": "Boot Sector Protected",
      "38": "MBR Protected",
      "39": "Honeypot File Triggered",
      "40": "Decoy Document Accessed",
    };
    const key = String(code);
    if (EPS_REMEDIATION_CODES[key]) return EPS_REMEDIATION_CODES[key];
    return null;
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    const descFields = this.parseCynetDesc(rawEvent);
    const hostname = this.safeStr(
      descFields.parsedHostname ||
      rawEvent.HostName || rawEvent.host_name || rawEvent.hostname || rawEvent.endpoint_name ||
      rawEvent.computer_name || rawEvent.device_name || rawEvent.host
    );
    const username = this.safeStr(rawEvent.UserName || rawEvent.user_name || rawEvent.username || rawEvent.user ||
      rawEvent.account_name);
    const alertName = this.safeStr(rawEvent.IncidentName || rawEvent.alert_name || rawEvent.name || rawEvent.title ||
      rawEvent.incident_name || rawEvent.description || rawEvent.rule_name) || "";
    const category = this.safeStr(rawEvent.Category || rawEvent.category || rawEvent.alert_type || rawEvent.type) || "";
    const process = this.safeStr(rawEvent.ProcessName || rawEvent.process_name || rawEvent.process || rawEvent.file_name);
    const filePath = this.safeStr(rawEvent.FilePath || rawEvent.file_path || rawEvent.path);
    const srcIp = this.safeStr(rawEvent.SourceIp || rawEvent.source_ip || rawEvent.src_ip);
    const dstIp = this.safeStr(rawEvent.DestinationIp || rawEvent.destination_ip || rawEvent.dst_ip || rawEvent.remote_ip);
    const epsActionRaw = this.safeStr(rawEvent.EpsAction || rawEvent.eps_action || rawEvent.remediation_action ||
      rawEvent.auto_remediation || rawEvent.action_taken);
    const epsRemediationCode = rawEvent.EpsRemediationActionPerformed ?? rawEvent.eps_remediation_action_performed;
    const epsRemediationLabel = this.decodeEpsRemediationCode(epsRemediationCode);
    const severity = rawEvent.Severity || rawEvent.severity;
    const description = this.safeStr(rawEvent.IncidentDescription || rawEvent.description || rawEvent.details || alertName);

    const hostIp = descFields.hostIp || this.safeStr(rawEvent.HostIp || rawEvent.host_ip);
    const osVersion = descFields.osVersion;
    const agentVersion = descFields.agentVersion;
    const endpointGroup = this.safeStr(rawEvent.ScanGroupName || rawEvent.scan_group_name || rawEvent.endpoint_group);
    const hostId = this.safeStr(rawEvent.HostId || rawEvent.host_id || rawEvent.endpoint_id);
    const firstSeenUtc = rawEvent.FirstSeen || rawEvent.first_seen || rawEvent.FirstSeenUtc || null;
    const lastSeenUtc = rawEvent.LastSeen || rawEvent.last_seen || rawEvent.LastSeenUtc || null;

    const isDeviceControl = !!(descFields.deviceType || descFields.deviceName ||
      /device.control|usb|removable/i.test(alertName + " " + category));

    const isSimulated = this.isDefinitelySimulated(rawEvent);
    const isTestAlert = this.isBorderlineTestAlert(rawEvent);

    const eventType = this.classifyEventType(alertName, category, rawEvent);

    const cynetMeta = {
      hostIp,
      osVersion,
      agentVersion,
      endpointGroup,
      hostname,
      hostId,
      firstSeenUtc,
      lastSeenUtc,
      deviceType: descFields.deviceType,
      deviceName: descFields.deviceName,
      deviceId: descFields.deviceId,
      deviceStatus: descFields.deviceStatus,
      epsPrevention: descFields.epsPrevention,
      vendor: descFields.vendor,
      product: descFields.product,
      isUsb: descFields.isUsb,
      epsRemediationCode,
      epsRemediationLabel,
      isDeviceControl,
      isSimulated,
    };

    const enrichedPayload = {
      ...rawEvent,
      _cynetMeta: cynetMeta,
    };

    let enrichedDescription: string | null = null;
    if (isDeviceControl && (descFields.deviceName || descFields.deviceType)) {
      const deviceLabel = descFields.deviceName || descFields.deviceType || "Storage Device";
      const blocked = descFields.deviceStatus?.toLowerCase().includes("block") ||
        descFields.epsPrevention?.toLowerCase().includes("block") || false;
      enrichedDescription = `Device Control: ${blocked ? "Blocked" : "Detected"} — ${deviceLabel}` +
        (descFields.deviceType ? ` (${descFields.deviceType})` : "") +
        (hostname ? ` on ${hostname}` : "") +
        (hostIp ? ` [${hostIp}]` : "");
      if (descFields.vendor) enrichedDescription += `. Vendor: ${descFields.vendor}`;
      if (descFields.deviceId) enrichedDescription += `. Device ID: ${descFields.deviceId}`;
    }

    const deviceControlAction = this.deriveDeviceControlAction(
      descFields.deviceType, descFields.deviceName,
      descFields.deviceStatus, descFields.epsPrevention, isDeviceControl
    );

    const nameForFallback = (alertName || "").toLowerCase();
    const epsNameFallback = epsRemediationLabel == null && epsRemediationCode != null
      ? (nameForFallback.includes("blocked") || nameForFallback.includes("bloc") ? "Blocked"
        : nameForFallback.includes("detected") || nameForFallback.includes("active") ? "Detected"
        : nameForFallback.includes("quarantine") ? "Quarantined"
        : nameForFallback.includes("allow") ? "Allowed"
        : nameForFallback.includes("kill") ? "Process Killed"
        : nameForFallback.includes("isolat") ? "Endpoint Isolated"
        : nameForFallback.includes("device") ? "Device Blocked"
        : null)
      : null;

    const resolvedAction = deviceControlAction || epsRemediationLabel || epsNameFallback ||
      normalizeActionLabel(epsActionRaw || rawEvent.Status || rawEvent.status || rawEvent.action, "Cynet 360") ||
      "Detected";

    return {
      sourceType: "Cynet 360",
      logSource: "Cynet 360",
      eventType,
      severity: this.mapSeverity(severity),
      threat: alertName || category || null,
      target: hostIp || hostname || username || null,
      attacker: hostIp || srcIp || process || filePath || null,
      asset: hostname || null,
      description: enrichedDescription || description,
      mitreTactic: rawEvent.MitreTactic || rawEvent.mitre_tactic || rawEvent.tactic || rawEvent.attack_tactic || null,
      mitreTechnique: rawEvent.MitreTechnique || rawEvent.mitre_technique || rawEvent.technique || rawEvent.attack_technique || null,
      action: resolvedAction,
      country: rawEvent.country || rawEvent.geo_country || null,
      protocol: rawEvent.protocol || null,
      sender: null,
      recipient: username || null,
      occurredAt: rawEvent.Timestamp || rawEvent.DetectionTime || rawEvent.timestamp || rawEvent.created_at || rawEvent.detection_time ||
        lastSeenUtc || firstSeenUtc || new Date().toISOString(),
      rawPayload: enrichedPayload,
      _meta: {
        alertId: rawEvent.Uniqueness || rawEvent.alert_id || rawEvent.id,
        alertType: category,
        epsAction: epsActionRaw,
        epsRemediationCode,
        epsRemediationLabel,
        processName: process,
        filePath,
        sourceIp: srcIp,
        destinationIp: dstIp,
        userName: username,
        hostName: hostname,
        hostIp,
        osVersion,
        agentVersion,
        endpointGroup,
        hostId,
        firstSeenUtc,
        lastSeenUtc,
        isDeviceControl,
        isSimulated,
        isTestAlert,
        platform: "Cynet 360",
      },
    };
  }

  /**
   * Tier-1 (definitive) test detection — machine-set boolean flags or explicit
   * platform DetectionType.  Events matching here are HARD FILTERED in pullData().
   */
  private isDefinitelySimulated(raw: any): boolean {
    if (
      raw.IsTest === true || raw.is_test === true ||
      raw.IsSimulated === true || raw.is_simulated === true ||
      raw.IsSandbox === true || raw.is_sandbox === true ||
      raw.IsDemo === true || raw.is_demo === true ||
      raw.IsDemoMode === true || raw.is_demo_mode === true
    ) {
      return true;
    }
    const detectionType = String(
      raw.DetectionType || raw.detection_type || raw.alert_type || raw.AlertType || ""
    ).toLowerCase();
    if (/\bsimulat(ed|ion)\b|\btest\b|\bbas\b/.test(detectionType)) return true;
    return false;
  }

  /**
   * Tier-2 (keyword) test detection — clear simulation/BAS keyword matches in
   * alert name, category or description.  Events matching here are also HARD
   * FILTERED in pullData() because the terminology is unambiguous.
   */
  private isKeywordSimulated(raw: any): boolean {
    const alertName = String(
      raw.IncidentName || raw.alert_name || raw.name || raw.title || raw.incident_name || ""
    ).toLowerCase();
    const category = String(raw.Category || raw.category || raw.type || "").toLowerCase();
    const description = String(raw.IncidentDescription || raw.description || raw.details || "").toLowerCase();
    const combined = `${alertName} ${category} ${description}`;

    return (
      /\bsimulat(ed|ion)\b/.test(combined) ||
      /\bbas test\b/.test(combined) ||
      /\battack simulation\b/.test(combined) ||
      /\bbreach simulation\b/.test(combined) ||
      /\btest alert\b/.test(combined) ||
      /\btest incident\b/.test(combined) ||
      /\btest scenario\b/.test(combined) ||
      /\bcynet bas\b/.test(combined) ||
      /\bfake alert\b/.test(combined) ||
      /\bsynthetic event\b/.test(combined) ||
      /\bfire drill\b/.test(combined)
    );
  }

  /**
   * Tier-3 (soft/borderline) test detection — softer heuristics for alerts that
   * MAY be test-related but could also be legitimate security monitoring activity
   * (e.g. watching a pentest in progress).  Events matching ONLY here PASS through
   * pullData() but are tagged with `_meta.isTestAlert: true` for analyst review.
   */
  private isBorderlineTestAlert(raw: any): boolean {
    if (this.isDefinitelySimulated(raw) || this.isKeywordSimulated(raw)) return false;
    const alertName = String(
      raw.IncidentName || raw.alert_name || raw.name || raw.title || raw.incident_name || ""
    ).toLowerCase();
    const description = String(raw.IncidentDescription || raw.description || raw.details || "").toLowerCase();
    const combined = `${alertName} ${description}`;
    return /\bpenetration test\b/.test(combined) || /\bpentest\b/.test(combined);
  }

  /**
   * Hard-suppress check: definitive flags OR explicit simulation keywords.
   * Used as the pull-time filter.
   */
  private isSimulatedAlert(raw: any): boolean {
    return this.isDefinitelySimulated(raw) || this.isKeywordSimulated(raw);
  }

  private classifyEventType(alertName: string, category: string, raw: any): string {
    const rawDesc = raw.IncidentDescription || raw.incident_description || raw.description || "";
    const incidentDescription = typeof rawDesc === "string" ? rawDesc : String(rawDesc);
    const text = `${alertName} ${category} ${raw.detection_type || raw.DetectionType || ""} ${raw.alert_type || raw.AlertType || ""} ${incidentDescription}`.toLowerCase();

    if (/malware|trojan|ransomware|worm|virus|backdoor|rootkit/.test(text)) return "endpoint";
    if (/vulnerability|cve|patch|unpatched|outdated/.test(text)) return "vulnerability";
    if (/device\.control|usb|removable|media/.test(text)) return "endpoint";
    if (/email\.threat|email\.campaign|mail\.threat|email|phish|spam|bec|mail/.test(text)) return "email";
    if (/evasion|defense\.evasion|terminate.*process|kill.*process|disable.*agent/.test(text)) return "endpoint";
    if (/unauthorized|access\.violation|privilege\.escalation/.test(text)) return "identity";
    if (/network|dns|tunnel|c2|command\.and\.control|lateral\.movement|port\.scan|traffic/.test(text)) return "network";
    if (/identity|credential|brute\.force|login|authentication|ntlm|kerberos|pass\.the/.test(text)) return "identity";
    if (/dlp|data\.loss|exfiltration|sensitive\.data/.test(text)) return "dlp";
    if (/waf|web\.application|sql\.injection|xss|webshell/.test(text)) return "waf";
    if (/cloud|saas|api\.abuse/.test(text)) return "cloud";
    return "endpoint";
  }

  private mapSeverity(raw: string | number | undefined): string {
    if (!raw) return "medium";
    const s = String(raw).toLowerCase();
    if (s === "critical" || s === "5" || s === "very high") return "critical";
    if (s === "high" || s === "4") return "high";
    if (s === "medium" || s === "3" || s === "moderate") return "medium";
    if (s === "low" || s === "2") return "low";
    if (s === "informational" || s === "info" || s === "1" || s === "0") return "info";
    return "medium";
  }
}

registerConnector("cynet", CynetConnector);
