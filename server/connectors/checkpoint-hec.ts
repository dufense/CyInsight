import { randomUUID } from "crypto";
import { BaseConnector, registerConnector, type ConnectionTestResult, type PullDataResult, type EventSchemaField } from "./base-connector";

const REGION_BASE_URLS: Record<string, string> = {
  eu: "https://cloudinfra-gw.portal.checkpoint.com",
  us: "https://cloudinfra-gw-us.portal.checkpoint.com",
  au: "https://cloudinfra-gw.ap.portal.checkpoint.com",
  ca: "https://cloudinfra-gw.ca.portal.checkpoint.com",
  uk: "https://cloudinfra-gw.uk.portal.checkpoint.com",
  me: "https://cloudinfra-gw.me.portal.checkpoint.com",
  in: "https://cloudinfra-gw.in.portal.checkpoint.com",
};

const AUTH_PATH = "/auth/external";
const EVENT_QUERY_PATH = "/app/hec-api/v1.0/event/query";
const MAX_PAGES = 50;
const PAGE_TIMEOUT = 30000;

export class CheckpointHECConnector extends BaseConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private getBaseUrl(): string {
    const explicit = this.config.apiBaseUrl || this.getCredential("apiBaseUrl") || this.getCredential("api_base_url") || "";
    if (explicit) {
      let cleaned = explicit.replace(/\/+$/, "");
      cleaned = cleaned.replace(/\/auth\/external$/, "");
      cleaned = cleaned.replace(/\/app\/hec-api.*$/, "");
      return cleaned;
    }
    const region = (this.getCredential("region") || this.getCredential("api_region") || "eu").toLowerCase();
    return REGION_BASE_URLS[region] || REGION_BASE_URLS.eu;
  }

  private getClientId(): string {
    return this.getCredential("clientId") || this.getCredential("client_id") ||
      process.env.CHECKPOINT_CLIENT_ID || "";
  }

  private getClientSecret(): string {
    return this.getCredential("accessKey") || this.getCredential("access_key") ||
      this.getCredential("clientSecret") || this.getCredential("client_secret") ||
      this.getCredential("secretKey") || this.getCredential("secret_key") ||
      process.env.CHECKPOINT_SECRET_KEY || "";
  }

  private getApiKey(): string {
    return this.getCredential("apiKey") || this.getCredential("api_key") || "";
  }

  private generateReqId(): string {
    return randomUUID();
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const apiKey = this.getApiKey();
    if (apiKey) {
      this.accessToken = apiKey;
      this.tokenExpiresAt = Date.now() + 3600 * 1000;
      return apiKey;
    }

    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error("Check Point API credentials required: either apiKey, or clientId + accessKey (client secret)");
    }

    const baseUrl = this.getBaseUrl();
    const authUrl = `${baseUrl}${AUTH_PATH}`;

    console.log(`[Checkpoint HEC] Authenticating: url=${authUrl}, clientId=${clientId.substring(0, 8)}...`);

    const { status, data } = await this.httpRequest(authUrl, {
      method: "POST",
      body: {
        clientId,
        accessKey: clientSecret,
      },
      timeout: 15000,
    });

    console.log(`[Checkpoint HEC] Auth response: status=${status}, type=${typeof data}`);

    if (status !== 200) {
      const errMsg = typeof data === "object" ? (data?.message || data?.error || JSON.stringify(data)) : String(data);
      throw new Error(`Authentication failed (HTTP ${status}): ${errMsg}`);
    }

    const token = typeof data === "object"
      ? (data.data?.token || data.token || data.access_token)
      : (typeof data === "string" ? data.replace(/^["']|["']$/g, "") : null);

    if (!token) {
      throw new Error(`Authentication failed: no token in response (keys: ${typeof data === "object" ? Object.keys(data).join(",") : typeof data})`);
    }

    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + (data.data?.expiresIn || data.expiresIn || data.expires_in || 3600) * 1000 - 60000;

    console.log(`[Checkpoint HEC] Authenticated successfully, token expires at ${new Date(this.tokenExpiresAt).toISOString()}`);
    return this.accessToken!;
  }

  private authHeaders(token: string): Record<string, string> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      return {
        "x-smart-api-key": apiKey,
        "x-av-req-id": this.generateReqId(),
      };
    }
    return {
      Authorization: `Bearer ${token}`,
      "x-av-req-id": this.generateReqId(),
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.authenticate();
      const baseUrl = this.getBaseUrl();

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const queryUrl = `${baseUrl}${EVENT_QUERY_PATH}`;
      console.log(`[Checkpoint HEC] Testing connection: ${queryUrl}`);

      const { status, data } = await this.httpRequest(queryUrl, {
        method: "POST",
        headers: this.authHeaders(token),
        body: {
          requestData: {
            startDate: oneDayAgo.toISOString(),
            endDate: now.toISOString(),
          },
        },
        timeout: 15000,
      });

      console.log(`[Checkpoint HEC] Test response: status=${status}, responseCode=${data?.responseEnvelope?.responseCode}, records=${data?.responseEnvelope?.recordsNumber}`);

      if (status === 200 && (data?.responseEnvelope?.responseCode === 0 || data?.responseEnvelope?.responseCode === 200)) {
        const totalRecords = data.responseEnvelope.totalRecordsNumber || data.responseEnvelope.recordsNumber || 0;
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected to Check Point Harmony Email API — ${totalRecords} events in last 24h`,
          apiVersion: "v1.0",
          timestamp: new Date().toISOString(),
          details: {
            service: "Harmony Email & Collaboration",
            vendor: "Check Point Software Technologies",
            region: this.getCredential("region") || "eu",
            recentEventCount: totalRecords,
          },
        };
      }

      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `API returned HTTP ${status}: ${data?.responseEnvelope?.responseText || data?.responseEnvelope?.additionalText || JSON.stringify(data)}`,
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
      const baseUrl = this.getBaseUrl();
      const queryUrl = `${baseUrl}${EVENT_QUERY_PATH}`;

      const sinceTimestamp = this.getSinceTimestamp();
      const startDate = cursor ? sinceTimestamp : sinceTimestamp;
      const endDate = new Date().toISOString();

      console.log(`[Checkpoint HEC] Pulling events: startDate=${startDate}, endDate=${endDate}`);

      const allEvents: Record<string, any>[] = [];
      let scrollId: string | undefined = cursor || undefined;
      let pageCount = 0;
      let totalRecordsNumber = 0;
      let partialWarning = "";

      while (pageCount < MAX_PAGES) {
        pageCount++;
        const requestBody: any = {
          requestData: {
            startDate,
            endDate,
          },
        };

        if (scrollId) {
          requestBody.requestData.scrollId = scrollId;
        }

        console.log(`[Checkpoint HEC] Page ${pageCount}: scrollId=${scrollId ? scrollId.substring(0, 20) + "..." : "none"}`);

        const { status, data } = await this.httpRequest(queryUrl, {
          method: "POST",
          headers: this.authHeaders(token),
          body: requestBody,
          timeout: PAGE_TIMEOUT,
        });

        if (status !== 200) {
          const errMsg = data?.responseEnvelope?.responseText || data?.responseEnvelope?.additionalText ||
            (typeof data === "object" ? JSON.stringify(data) : String(data));
          if (allEvents.length > 0) {
            console.log(`[Checkpoint HEC] Page ${pageCount} failed (HTTP ${status}), returning ${allEvents.length} events collected so far`);
            partialWarning = ` (warning: page ${pageCount} failed with HTTP ${status}, returning partial results)`;
            break;
          }
          return {
            events: [],
            totalPulled: 0,
            hasMore: false,
            message: `Failed to fetch events: HTTP ${status} - ${errMsg}`,
          };
        }

        const envelope = data?.responseEnvelope || {};
        if (envelope.responseCode !== 0 && envelope.responseCode !== 200 && envelope.responseCode !== undefined) {
          const errMsg = envelope.responseText || envelope.additionalText || `responseCode ${envelope.responseCode}`;
          if (allEvents.length > 0) {
            console.log(`[Checkpoint HEC] Page ${pageCount} error (code ${envelope.responseCode}), returning ${allEvents.length} events collected so far`);
            partialWarning = ` (warning: page ${pageCount} returned error code ${envelope.responseCode}, returning partial results)`;
            break;
          }
          return {
            events: [],
            totalPulled: 0,
            hasMore: false,
            message: `API error: ${errMsg}`,
          };
        }

        totalRecordsNumber = envelope.totalRecordsNumber || totalRecordsNumber;
        const responseData = data?.responseData;
        const eventBatch = Array.isArray(responseData) ? responseData : (responseData ? [responseData] : []);

        if (eventBatch.length === 0) {
          console.log(`[Checkpoint HEC] Page ${pageCount}: empty response, done`);
          break;
        }

        for (const rawEvent of eventBatch) {
          allEvents.push(this.mapToInternal(rawEvent));
        }

        console.log(`[Checkpoint HEC] Page ${pageCount}: ${eventBatch.length} events (total so far: ${allEvents.length}, total available: ${totalRecordsNumber})`);

        const newScrollId = envelope.scrollId;

        if (totalRecordsNumber > 0 && allEvents.length >= totalRecordsNumber) {
          break;
        }

        if (!newScrollId || newScrollId === scrollId) {
          break;
        }

        scrollId = newScrollId;
      }

      const hasMore = (totalRecordsNumber > 0 && allEvents.length < totalRecordsNumber) || (pageCount >= MAX_PAGES && scrollId !== undefined);

      console.log(`[Checkpoint HEC] Pull complete: ${allEvents.length} events in ${pageCount} pages (total available: ${totalRecordsNumber})`);

      return {
        events: allEvents,
        totalPulled: allEvents.length,
        hasMore,
        cursor: hasMore ? scrollId : undefined,
        message: `Pulled ${allEvents.length} email security events from Check Point Harmony Email (since ${startDate})${partialWarning}`,
      };
    } catch (error: any) {
      console.error(`[Checkpoint HEC] Pull failed:`, error.message);
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
      { name: "eventId", type: "string", description: "Unique event identifier", required: true },
      { name: "type", type: "string", description: "Event type (phishing, malware, dlp, anomaly, etc.)", required: true },
      { name: "severity", type: "string", description: "Event severity (Low, Medium, High, Critical)", required: true },
      { name: "description", type: "string", description: "Event description", required: true },
      { name: "eventCreated", type: "string", description: "Timestamp when event was created", required: true },
      { name: "state", type: "string", description: "Event state (new, dismissed, etc.)", required: false },
      { name: "saas", type: "string", description: "SaaS provider (office365_emails, gmail, etc.)", required: false },
      { name: "confidenceIndicator", type: "string", description: "Confidence indicator (malicious, suspicious, clean)", required: false },
      { name: "data", type: "string", description: "Extended event data", required: false },
      { name: "additionalData", type: "object", description: "Additional event metadata", required: false },
    ];
  }

  private parseCheckpointTemplateData(data: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!data || typeof data !== "string") return result;

    const bracketMatch = data.match(/#\{([^}]+)\}/);
    if (bracketMatch) {
      try {
        const inner = bracketMatch[1];
        const pairs = inner.split(/,\s*/);
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(":");
          if (colonIdx > 0) {
            const key = pair.substring(0, colonIdx).trim();
            const val = pair.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
            if (key && val) result[key] = val;
          }
        }
      } catch (_) {}
    }

    const subjectMatch = data.match(/[Ss]ubject[:\s=]+["']?([^"'\n,}{]+)["']?/);
    if (subjectMatch && !result.subject) result.subject = subjectMatch[1].trim();

    const verdictPatterns = [
      /[Vv]erdict[:\s=]+["']?([a-zA-Z_\-]+)["']?/,
      /[Aa]ction[:\s=]+["']?([a-zA-Z_\-]+)["']?/,
      /[Rr]esult[:\s=]+["']?([a-zA-Z_\-]+)["']?/,
    ];
    for (const pat of verdictPatterns) {
      const m = data.match(pat);
      if (m && !result.verdict) { result.verdict = m[1].trim(); break; }
    }

    const recipientCountMatch = data.match(/[Rr]ecipient[Cc]ount[:\s=]+["']?(\d+)["']?/);
    if (recipientCountMatch && !result.recipientCount) result.recipientCount = recipientCountMatch[1].trim();

    const senderPatterns = [
      /[Ss]ender[Aa]ddress[:\s=]+["']?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})["']?/,
      /[Ff]rom[:\s=]+["']?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})["']?/,
    ];
    for (const pat of senderPatterns) {
      const m = data.match(pat);
      if (m && !result.senderAddress) { result.senderAddress = m[1].trim(); break; }
    }

    const recipientPatterns = [
      /[Rr]ecipient[Aa]ddress[:\s=]+["']?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})["']?/,
      /[Tt]o[:\s=]+["']?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})["']?/,
    ];
    for (const pat of recipientPatterns) {
      const m = data.match(pat);
      if (m && !result.recipientAddress) { result.recipientAddress = m[1].trim(); break; }
    }

    return result;
  }

  private extractRecipientFromDescription(description: string): string {
    const mailboxMatch = description.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})'s\s+mailbox/i);
    if (mailboxMatch) return mailboxMatch[1];
    const inboxMatch = description.match(/(?:inbox|mailbox|recipient)[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (inboxMatch) return inboxMatch[1];
    return "";
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    const eventType = (rawEvent.type || "").toLowerCase();
    const rawData = rawEvent.data || "";
    const description = rawEvent.description || rawData || "";
    const additionalData = rawEvent.additionalData || {};
    const severity = this.mapSeverity(rawEvent.severity);
    const confidence = rawEvent.confidenceIndicator || "";

    const templateFields = this.parseCheckpointTemplateData(rawData);

    const senderEmail = additionalData.senderAddress || additionalData.sender ||
      additionalData.fromAddress || templateFields.senderAddress ||
      this.extractFromDescription(description, "from") || "";
    const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "";
    const rawRecipients = additionalData.recipientAddress || additionalData.recipients ||
      additionalData.toAddress || additionalData.internetRecipients ||
      templateFields.recipientAddress ||
      this.extractFromDescription(description, "to") ||
      this.extractRecipientFromDescription(description) || "";
    const recipientStr = Array.isArray(rawRecipients) ? rawRecipients.join(", ") : String(rawRecipients || "");
    const subject = additionalData.subject || additionalData.emailSubject ||
      templateFields.subject || "";

    const saas = rawEvent.saas || "";
    const state = rawEvent.state || "";

    const isGraymail = eventType === "graymail" || eventType.includes("graymail");
    const isSpam = eventType === "spam" || eventType.includes("spam");

    const templateVerdict = templateFields.verdict || "";
    let actionTaken = "Detected";
    const actions = rawEvent.actions || [];
    if (Array.isArray(actions) && actions.length > 0) {
      const actionTypes = actions.map((a: any) => a.actionType || a.action).filter(Boolean);
      if (isGraymail || isSpam) {
        const headerAction = actionTypes.find((a: string) => a.includes("header") || a.includes("graymail") || a.includes("spam"));
        actionTaken = headerAction
          ? "Header Added (Delivered)"
          : actionTypes.join(", ") || "Detected";
      } else {
        actionTaken = actionTypes.join(", ") || "Detected";
      }
    } else if (templateVerdict) {
      const v = templateVerdict.toLowerCase();
      if (v === "block" || v === "blocked" || v === "quarantine" || v === "quarantined") actionTaken = "Blocked";
      else if (v === "allow" || v === "allowed" || v === "clean" || v === "pass") actionTaken = "Allowed";
      else if (v === "header" || v === "header_added" || v === "deliver") actionTaken = "Header Added (Delivered)";
      else if (v === "delete" || v === "deleted" || v === "drop") actionTaken = "Deleted";
      else actionTaken = templateVerdict;
    }
    if (state === "dismissed") actionTaken = "Dismissed";
    if (confidence === "clean" && actionTaken === "Detected") actionTaken = "Allowed";

    const recipientCountRaw = additionalData.recipientCount || additionalData.recipient_count ||
      templateFields.recipientCount;
    const recipientCount = recipientCountRaw ? parseInt(String(recipientCountRaw), 10) : null;

    let threat = "";
    if (eventType === "phishing" || eventType.includes("phish")) {
      threat = `Phishing email${senderDomain ? ` from ${senderDomain}` : ""}${subject ? `: ${subject}` : ""}`;
    } else if (eventType === "malware" || eventType.includes("malware")) {
      threat = `Malware detected${senderDomain ? ` from ${senderDomain}` : ""}${subject ? `: ${subject}` : ""}`;
    } else if (eventType === "dlp" || eventType.includes("dlp") || eventType.includes("leak")) {
      threat = `DLP violation${subject ? `: ${subject}` : ""}`;
    } else if (eventType === "anomaly" || eventType.includes("anomal")) {
      threat = `Account anomaly detected${subject ? `: ${subject}` : ""}`;
    } else if (isSpam) {
      threat = `Spam email${senderDomain ? ` from ${senderDomain}` : ""}${subject ? `: "${subject}"` : ""}`;
    } else if (isGraymail) {
      threat = `Graymail (possible social engineering)${senderDomain ? ` from ${senderDomain}` : ""}${subject ? `: "${subject}"` : ""}`;
    } else {
      threat = description || `${eventType} event${senderDomain ? ` from ${senderDomain}` : ""}`;
    }

    let mitreTactic: string | null = null;
    let mitreTechnique: string | null = null;
    let killChainPhase: string | null = null;
    if (eventType === "phishing" || eventType.includes("phish")) {
      mitreTactic = "Initial Access";
      mitreTechnique = "T1566.001";
      killChainPhase = "Delivery";
    } else if (eventType === "malware" || eventType.includes("malware")) {
      mitreTactic = "Initial Access";
      mitreTechnique = "T1566.002";
      killChainPhase = "Delivery";
    } else if (eventType === "dlp" || eventType.includes("dlp") || eventType.includes("leak")) {
      mitreTactic = "Exfiltration";
      mitreTechnique = "T1048";
      killChainPhase = "Actions on Objectives";
    } else if (eventType === "anomaly" || eventType.includes("anomal")) {
      mitreTactic = "Initial Access";
      mitreTechnique = "T1078";
      killChainPhase = "Delivery";
    } else if (isSpam) {
      mitreTactic = "Initial Access";
      mitreTechnique = "T1566";
      killChainPhase = "Delivery";
    } else if (isGraymail) {
      mitreTactic = "Reconnaissance";
      mitreTechnique = "T1598.003";
      killChainPhase = "Reconnaissance";
    }

    const spf = additionalData.spf || additionalData.SPF ||
      templateFields.spf || null;
    const dkim = additionalData.dkim || additionalData.DKIM ||
      templateFields.dkim || null;
    const dmarc = additionalData.dmarc || additionalData.DMARC ||
      templateFields.dmarc || null;

    const resolvedEventType = isGraymail ? "graymail" : isSpam ? "spam" : eventType;

    return {
      sourceType: "Check Point Harmony Email",
      logSource: "Checkpoint HEC",
      eventType: "email",
      severity,
      threat,
      target: recipientStr || null,
      attacker: senderEmail || null,
      sender: senderEmail || null,
      asset: recipientStr ? recipientStr.split(",")[0]?.trim().split("@")[1] || "" : "",
      description: description || `${eventType} event: ${threat}`,
      mitreTactic,
      mitreTechnique,
      killChainPhase,
      action: actionTaken,
      occurredAt: rawEvent.eventCreated || new Date().toISOString(),
      rawPayload: rawEvent,
      _meta: {
        eventId: rawEvent.eventId,
        entityId: rawEvent.entityId,
        customerId: rawEvent.customerId,
        saas,
        state,
        eventType: resolvedEventType,
        confidenceIndicator: confidence,
        senderDomain,
        recipientDomain: recipientStr ? recipientStr.split("@")[1]?.split(",")[0]?.trim() || "" : "",
        subject,
        spf,
        dkim,
        dmarc,
        actions,
        platform: "Check Point Harmony Email",
        parsedFromTemplate: Object.keys(templateFields).length > 0,
        templateVerdict: templateVerdict || null,
        recipientCount: recipientCount || null,
      },
    };
  }

  private mapSeverity(severity: any): string {
    if (!severity) return "medium";
    const s = String(severity).toLowerCase();
    if (s === "highest" || s === "critical" || s === "very_high") return "critical";
    if (s === "high") return "high";
    if (s === "medium" || s === "med") return "medium";
    if (s === "low") return "low";
    if (s === "info" || s === "informational") return "info";
    return "medium";
  }

  private extractFromDescription(description: string, field: "from" | "to"): string {
    if (!description) return "";
    if (field === "from") {
      const match = description.match(/from\s+(\S+@\S+)/i);
      return match ? match[1].replace(/['"<>]/g, "") : "";
    }
    if (field === "to") {
      const match = description.match(/to\s+(\S+@\S+)/i);
      return match ? match[1].replace(/['"<>]/g, "") : "";
    }
    return "";
  }
}

registerConnector("checkpoint_hec", CheckpointHECConnector);
