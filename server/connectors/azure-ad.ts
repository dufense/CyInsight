import { BaseConnector, registerConnector, type ConnectionTestResult, type PullDataResult, type EventSchemaField } from "./base-connector";

export class AzureADConnector extends BaseConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const tenantId = this.getCredential("tenantId") || this.getCredential("tenant_id") || "";
    const clientId = this.getCredential("clientId") || this.getCredential("client_id") || "";
    const clientSecret = this.getCredential("clientSecret") || this.getCredential("client_secret") || "";

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("Azure AD OAuth2 credentials (tenantId, clientId, clientSecret) are required");
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const { status, data } = await this.httpRequest(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=${encodeURIComponent("https://graph.microsoft.com/.default")}&grant_type=client_credentials`,
    });

    if (status !== 200 || !data.access_token) {
      throw new Error(`Azure AD authentication failed: ${data.error_description || data.error || `HTTP ${status}`}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
    return this.accessToken!;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.authenticate();
      const baseUrl = this.config.apiBaseUrl || "https://graph.microsoft.com/v1.0";

      const { status, data, latencyMs } = await this.httpRequest(`${baseUrl}/organization`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      if (status === 200) {
        const org = data.value?.[0];
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Successfully connected to Microsoft Entra ID${org?.displayName ? ` (${org.displayName})` : ""}`,
          apiVersion: "v1.0",
          timestamp: new Date().toISOString(),
          details: {
            organization: org?.displayName || "connected",
            tenantId: org?.id,
          },
        };
      }

      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Microsoft Graph API returned HTTP ${status}: ${data.error?.message || "Unknown error"}`,
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
      const baseUrl = this.config.apiBaseUrl || "https://graph.microsoft.com/v1.0";
      const since = this.getSinceTimestamp();

      let alertsUrl: string;
      if (cursor) {
        alertsUrl = cursor;
      } else {
        alertsUrl = `${baseUrl}/security/alerts_v2?$filter=createdDateTime ge ${since}&$top=100&$orderby=createdDateTime desc`;
      }

      const { status, data } = await this.httpRequest(alertsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (status !== 200) {
        return {
          events: [],
          totalPulled: 0,
          hasMore: false,
          message: `Failed to fetch security alerts: HTTP ${status} - ${data.error?.message || "Unknown error"}`,
        };
      }

      const alerts = data.value || [];
      const events = alerts.map((a: any) => this.mapToInternal(a));

      return {
        events,
        totalPulled: events.length,
        hasMore: !!data["@odata.nextLink"],
        cursor: data["@odata.nextLink"] || undefined,
        message: `Pulled ${events.length} security alerts from Microsoft Entra ID`,
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
      { name: "id", type: "string", description: "Unique alert identifier", required: true },
      { name: "title", type: "string", description: "Alert title", required: true },
      { name: "severity", type: "string", description: "Alert severity (high/medium/low/informational)", required: true },
      { name: "category", type: "string", description: "Alert category", required: false },
      { name: "description", type: "string", description: "Alert description", required: false },
      { name: "serviceSource", type: "string", description: "Service that raised the alert", required: false },
      { name: "detectionSource", type: "string", description: "Detection technology or sensor", required: false },
      { name: "createdDateTime", type: "string", description: "Alert creation timestamp", required: true },
      { name: "evidence", type: "array", description: "Evidence associated with the alert", required: false },
    ];
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    const evidence = Array.isArray(rawEvent.evidence) ? rawEvent.evidence : [];
    const deviceEvidence = evidence.find((e: any) => e["@odata.type"] === "#microsoft.graph.security.deviceEvidence");
    const userEvidence = evidence.find((e: any) => e["@odata.type"] === "#microsoft.graph.security.userEvidence");
    const ipEvidence = evidence.find((e: any) => e["@odata.type"] === "#microsoft.graph.security.ipEvidence");

    const mitreTechniques = rawEvent.mitreTechniques || [];
    const tactics = rawEvent.tactics || [];

    return {
      sourceType: "Microsoft Entra ID",
      logSource: rawEvent.serviceSource || "Microsoft Entra ID",
      eventType: "identity",
      severity: this.mapSeverity(rawEvent.severity),
      threat: rawEvent.title || rawEvent.category || null,
      target: userEvidence?.userAccount?.userPrincipalName || deviceEvidence?.deviceDnsName || null,
      attacker: ipEvidence?.ipAddress || null,
      asset: deviceEvidence?.deviceDnsName || null,
      description: rawEvent.description || rawEvent.title || null,
      mitreTactic: tactics[0] || null,
      mitreTechnique: mitreTechniques[0] || null,
      action: rawEvent.status || "Detected",
      country: ipEvidence?.countryLetterCode || null,
      occurredAt: rawEvent.createdDateTime || new Date().toISOString(),
      rawPayload: rawEvent,
      _meta: {
        alertId: rawEvent.id,
        incidentId: rawEvent.incidentId,
        serviceSource: rawEvent.serviceSource,
        detectionSource: rawEvent.detectionSource,
        category: rawEvent.category,
        classification: rawEvent.classification,
        determination: rawEvent.determination,
      },
    };
  }

  private mapSeverity(raw: string | undefined): string {
    if (!raw) return "medium";
    const s = raw.toLowerCase();
    if (s === "high") return "high";
    if (s === "medium") return "medium";
    if (s === "low") return "low";
    if (s === "informational") return "info";
    return "medium";
  }
}

registerConnector("azure_ad", AzureADConnector);
