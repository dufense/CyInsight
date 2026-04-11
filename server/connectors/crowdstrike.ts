import { BaseConnector, registerConnector, type ConnectionTestResult, type PullDataResult, type EventSchemaField, type AssetRecord } from "./base-connector";

export class CrowdStrikeConnector extends BaseConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const clientId = this.getCredential("clientId") || this.getCredential("client_id") || "";
    const clientSecret = this.getCredential("clientSecret") || this.getCredential("client_secret") || "";
    const baseUrl = this.config.apiBaseUrl || "https://api.crowdstrike.com";

    if (!clientId || !clientSecret) {
      throw new Error("CrowdStrike OAuth2 credentials (clientId, clientSecret) are required");
    }

    const { status, data, latencyMs } = await this.httpRequest(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    });

    if (status !== 200 || !data.access_token) {
      throw new Error(`CrowdStrike authentication failed: ${data.errors?.[0]?.message || `HTTP ${status}`}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 1800) * 1000 - 60000;
    return this.accessToken!;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.authenticate();
      const baseUrl = this.config.apiBaseUrl || "https://api.crowdstrike.com";

      const { status, data, latencyMs } = await this.httpRequest(`${baseUrl}/sensors/queries/installers/ccid/v1`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      if (status === 200) {
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: "Successfully connected to CrowdStrike Falcon API",
          apiVersion: "v2",
          timestamp: new Date().toISOString(),
          details: { ccid: data.resources?.[0] || "connected" },
        };
      }

      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `CrowdStrike API returned HTTP ${status}: ${data.errors?.[0]?.message || "Unknown error"}`,
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
      const baseUrl = this.config.apiBaseUrl || "https://api.crowdstrike.com";
      const since = this.getSinceTimestamp();

      let detectionUrl = `${baseUrl}/detects/queries/detects/v1?limit=100&sort=last_behavior|desc`;
      if (!cursor) {
        detectionUrl += `&filter=last_behavior:>'${since}'`;
      } else {
        detectionUrl += `&offset=${cursor}`;
      }

      const { status: queryStatus, data: queryData } = await this.httpRequest(detectionUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (queryStatus !== 200 || !queryData.resources?.length) {
        return {
          events: [],
          totalPulled: 0,
          hasMore: false,
          message: "No new detections found",
        };
      }

      const detectionIds = queryData.resources.slice(0, 100);

      const { status: detailStatus, data: detailData } = await this.httpRequest(`${baseUrl}/detects/entities/summaries/GET/v1`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: { ids: detectionIds },
      });

      if (detailStatus !== 200) {
        return {
          events: [],
          totalPulled: 0,
          hasMore: false,
          message: `Failed to fetch detection details: HTTP ${detailStatus}`,
        };
      }

      const events = (detailData.resources || []).map((d: any) => this.mapToInternal(d));

      return {
        events,
        totalPulled: events.length,
        hasMore: (queryData.meta?.pagination?.total || 0) > detectionIds.length,
        cursor: queryData.meta?.pagination?.offset?.toString(),
        message: `Pulled ${events.length} detections from CrowdStrike Falcon`,
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

  getEventSchema(): EventSchemaField[] {
    return [
      { name: "detection_id", type: "string", description: "Unique detection identifier", required: true },
      { name: "max_severity_displayname", type: "string", description: "Severity level (Critical/High/Medium/Low/Informational)", required: true },
      { name: "behaviors", type: "array", description: "Array of detected behaviors with tactics and techniques", required: true },
      { name: "device.hostname", type: "string", description: "Hostname of the affected device", required: true },
      { name: "device.platform_name", type: "string", description: "OS platform (Windows/Mac/Linux)", required: false },
      { name: "first_behavior", type: "string", description: "Timestamp of first observed behavior", required: true },
      { name: "last_behavior", type: "string", description: "Timestamp of last observed behavior", required: true },
      { name: "status", type: "string", description: "Detection status", required: false },
    ];
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    const behaviors = Array.isArray(rawEvent.behaviors) ? rawEvent.behaviors : [];
    const firstBehavior = behaviors[0] || {};
    const device = rawEvent.device || {};

    return {
      sourceType: "CrowdStrike Falcon",
      logSource: "CrowdStrike Falcon",
      eventType: "endpoint",
      severity: this.mapSeverity(rawEvent.max_severity_displayname || firstBehavior.severity),
      threat: firstBehavior.scenario || firstBehavior.tactic || rawEvent.detection_description || null,
      target: device.hostname || firstBehavior.hostname || null,
      attacker: firstBehavior.cmdline || firstBehavior.filename || null,
      asset: device.hostname || null,
      description: rawEvent.detection_description || firstBehavior.description || null,
      mitreTactic: firstBehavior.tactic || null,
      mitreTechnique: firstBehavior.technique || null,
      action: firstBehavior.pattern_disposition_details?.action_taken || "Detected",
      occurredAt: rawEvent.last_behavior || rawEvent.first_behavior || new Date().toISOString(),
      rawPayload: rawEvent,
      _meta: {
        detectionId: rawEvent.detection_id,
        deviceId: device.device_id,
        platform: device.platform_name,
        status: rawEvent.status,
      },
    };
  }

  async pullAssets(): Promise<{ assets: AssetRecord[]; totalPulled: number; message: string }> {
    try {
      const token = await this.authenticate();
      const baseUrl = this.config.apiBaseUrl || "https://api.crowdstrike.com";
      const allDevices: any[] = [];
      let offset = 0;
      const limit = 500;

      while (true) {
        const { status, data } = await this.httpRequest(
          `${baseUrl}/devices/queries/devices/v1?limit=${limit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
        );
        if (status !== 200 || !data.resources?.length) break;
        const ids: string[] = data.resources;
        const { status: dStatus, data: dData } = await this.httpRequest(
          `${baseUrl}/devices/entities/devices/v2?${ids.map(id => `ids=${id}`).join("&")}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
        );
        if (dStatus === 200 && dData.resources?.length) {
          allDevices.push(...dData.resources);
        }
        const total = data.meta?.pagination?.total || 0;
        offset += ids.length;
        if (offset >= total || ids.length < limit) break;
      }

      const assets: AssetRecord[] = allDevices
        .filter(d => d.hostname)
        .map(d => {
          const statusMap: Record<string, AssetRecord["status"]> = {
            normal: "active", contained: "quarantined", containment_pending: "quarantined",
            lift_containment_pending: "quarantined", unknown: "inactive",
          };
          return {
            hostname: d.hostname,
            ipAddress: d.local_ip || undefined,
            macAddress: d.mac_address || undefined,
            operatingSystem: d.os_version ? `${d.platform_name || ""} ${d.os_version}`.trim() : (d.platform_name || undefined),
            agentVersion: d.agent_version || undefined,
            endpointType: d.product_type_desc || undefined,
            endpointGroup: d.groups?.[0] || undefined,
            tags: d.tags?.join(",") || undefined,
            lastSeen: d.last_seen ? new Date(d.last_seen) : undefined,
            status: statusMap[d.status?.toLowerCase() || ""] || "active",
            cloudProvider: d.service_provider || undefined,
            cloudRegion: d.service_provider_account_id || undefined,
            cloudInstanceId: d.instance_id || undefined,
            biosSerialNumber: d.bios_version || undefined,
            systemModel: d.system_product_name || undefined,
            systemManufacturer: d.system_manufacturer || undefined,
            assetSite: d.site_name || undefined,
            source: "connector",
            sourcePlatforms: ["crowdstrike"],
            enrichmentData: { sensorVersion: d.agent_version, cid: d.cid, deviceId: d.device_id },
            edrHostId: d.device_id || undefined,
            edrPlatform: "crowdstrike",
          } as AssetRecord;
        });
      return { assets, totalPulled: assets.length, message: `Pulled ${assets.length} devices from CrowdStrike Falcon` };
    } catch (error: any) {
      throw new Error(`CrowdStrike pullAssets failed: ${error.message}`);
    }
  }

  private mapSeverity(raw: string | number | undefined): string {
    if (!raw) return "medium";
    const s = String(raw).toLowerCase();
    if (s === "critical" || s === "5") return "critical";
    if (s === "high" || s === "4") return "high";
    if (s === "medium" || s === "3") return "medium";
    if (s === "low" || s === "2") return "low";
    if (s === "informational" || s === "1" || s === "0") return "info";
    return "medium";
  }
}

registerConnector("crowdstrike", CrowdStrikeConnector);
