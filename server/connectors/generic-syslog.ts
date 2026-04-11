import { BaseConnector, registerConnector, type ConnectionTestResult, type PullDataResult, type EventSchemaField } from "./base-connector";

export class GenericSyslogConnector extends BaseConnector {
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const endpoint = this.config.apiBaseUrl;

    if (!endpoint) {
      return {
        success: true,
        latencyMs: Date.now() - startTime,
        message: "Generic syslog connector configured for passive reception (no remote endpoint to test)",
        apiVersion: "generic",
        timestamp: new Date().toISOString(),
        details: { mode: "passive" },
      };
    }

    try {
      const { status, data, latencyMs } = await this.httpRequest(endpoint, {
        timeout: 10000,
      });

      return {
        success: status >= 200 && status < 400,
        latencyMs: Date.now() - startTime,
        message: status >= 200 && status < 400
          ? `Successfully connected to syslog forwarder at ${endpoint}`
          : `Syslog forwarder returned HTTP ${status}`,
        apiVersion: "generic",
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
    const endpoint = this.config.apiBaseUrl;

    if (!endpoint) {
      return {
        events: [],
        totalPulled: 0,
        hasMore: false,
        message: "Generic syslog connector operates in passive mode - push data via the ingest API instead",
      };
    }

    try {
      const since = this.getSinceTimestamp();
      let url = `${endpoint}?since=${encodeURIComponent(since)}&limit=500`;
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const { status, data } = await this.httpRequest(url, {
        headers: this.buildAuthHeaders(),
      });

      if (status !== 200) {
        return {
          events: [],
          totalPulled: 0,
          hasMore: false,
          message: `Failed to pull from syslog forwarder: HTTP ${status}`,
        };
      }

      let rawEvents: Record<string, any>[] = [];
      if (typeof data === "string") {
        rawEvents = this.parseMultiFormat(data);
      } else if (Array.isArray(data)) {
        rawEvents = data;
      } else if (data && typeof data === "object") {
        rawEvents = data.events || data.logs || data.messages || data.data || [data];
      }

      const events = rawEvents.map((e: any) => this.mapToInternal(e));

      return {
        events,
        totalPulled: events.length,
        hasMore: !!(data?.nextCursor || data?.hasMore),
        cursor: data?.nextCursor,
        message: `Pulled ${events.length} events from syslog source`,
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
      { name: "message", type: "string", description: "Raw log message", required: true },
      { name: "timestamp", type: "string", description: "Event timestamp", required: false },
      { name: "hostname", type: "string", description: "Source hostname", required: false },
      { name: "facility", type: "string", description: "Syslog facility", required: false },
      { name: "severity", type: "string", description: "Syslog severity", required: false },
      { name: "program", type: "string", description: "Source program/application", required: false },
    ];
  }

  mapToInternal(rawEvent: Record<string, any>): Record<string, any> {
    if (typeof rawEvent === "string") {
      return this.parseSyslogLine(rawEvent);
    }

    if (rawEvent.CEF || rawEvent.cef || (typeof rawEvent.message === "string" && rawEvent.message.startsWith("CEF:"))) {
      return this.parseCEF(rawEvent);
    }

    return this.parseGenericJSON(rawEvent);
  }

  private parseSyslogLine(line: string): Record<string, any> {
    if (line.startsWith("CEF:") || line.includes("CEF:")) {
      return this.parseCEFString(line);
    }

    const syslogRegex = /^<(\d+)>(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$/;
    const match = line.match(syslogRegex);

    if (match) {
      const [, priority, timestamp, hostname, program, pid, message] = match;
      const pri = parseInt(priority || "0");
      const facility = Math.floor(pri / 8);
      const severityNum = pri % 8;

      return {
        sourceType: "Syslog",
        logSource: program || "Syslog",
        eventType: "network",
        severity: this.mapSyslogSeverity(severityNum),
        threat: null,
        target: hostname || null,
        asset: hostname || null,
        description: message || line,
        occurredAt: timestamp || new Date().toISOString(),
        rawPayload: { raw: line, facility, severity: severityNum, program, pid, hostname },
      };
    }

    return {
      sourceType: "Syslog",
      logSource: "Syslog",
      eventType: "network",
      severity: "info",
      description: line,
      occurredAt: new Date().toISOString(),
      rawPayload: { raw: line },
    };
  }

  private parseCEFString(raw: string): Record<string, any> {
    const cefStart = raw.indexOf("CEF:");
    const cefContent = raw.substring(cefStart + 4);
    const parts = cefContent.split("|");

    if (parts.length >= 7) {
      const [version, deviceVendor, deviceProduct, deviceVersion, signatureId, name, severity, ...extensionParts] = parts;
      const extension = extensionParts.join("|");
      const extFields = this.parseCEFExtension(extension);

      return {
        sourceType: `${deviceVendor} ${deviceProduct}`.trim(),
        logSource: deviceProduct || "CEF",
        eventType: "network",
        severity: this.mapCEFSeverity(severity),
        threat: name || signatureId || null,
        target: extFields.dst || extFields.dhost || null,
        attacker: extFields.src || extFields.shost || null,
        asset: extFields.dhost || extFields.dst || null,
        description: name || null,
        action: extFields.act || null,
        protocol: extFields.proto || null,
        occurredAt: extFields.rt || extFields.end || new Date().toISOString(),
        rawPayload: { cef: raw, vendor: deviceVendor, product: deviceProduct, signatureId, ...extFields },
      };
    }

    return {
      sourceType: "CEF",
      logSource: "CEF",
      eventType: "network",
      severity: "info",
      description: raw,
      occurredAt: new Date().toISOString(),
      rawPayload: { raw },
    };
  }

  private parseCEF(rawEvent: Record<string, any>): Record<string, any> {
    const cefStr = rawEvent.CEF || rawEvent.cef || rawEvent.message || "";
    if (typeof cefStr === "string") {
      return this.parseCEFString(cefStr);
    }
    return this.parseGenericJSON(rawEvent);
  }

  private parseCEFExtension(extension: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const regex = /(\w+)=((?:[^=](?!\w+=))*)/g;
    let match;
    while ((match = regex.exec(extension)) !== null) {
      fields[match[1]] = match[2].trim();
    }
    return fields;
  }

  private parseGenericJSON(data: Record<string, any>): Record<string, any> {
    const severity = data.severity || data.level || data.priority || data.risk_level || "info";
    const hostname = data.hostname || data.host || data.hostName || data.source_host || data.deviceName || null;
    const message = data.message || data.msg || data.description || data.summary || null;
    const timestamp = data.timestamp || data["@timestamp"] || data.time || data.datetime || data.occurred_at || data.eventTime || null;
    const source = data.source || data.program || data.application || data.app || data.sourcetype || null;
    const action = data.action || data.result || data.outcome || data.disposition || null;
    const srcIp = data.src_ip || data.sourceIP || data.src || data.source_address || null;
    const dstIp = data.dst_ip || data.destinationIP || data.dst || data.destination_address || null;
    const threat = data.threat || data.alert || data.rule || data.signature || data.threat_name || null;

    return {
      sourceType: source || "Generic Log",
      logSource: source || "Generic Log",
      eventType: this.inferEventType(data),
      severity: this.mapGenericSeverity(severity),
      threat,
      target: dstIp || hostname || null,
      attacker: srcIp || null,
      asset: hostname || null,
      description: message,
      action,
      protocol: data.protocol || data.proto || null,
      country: data.country || data.geo_country || null,
      occurredAt: timestamp || new Date().toISOString(),
      rawPayload: data,
    };
  }

  private parseMultiFormat(raw: string): Record<string, any>[] {
    const results: Record<string, any>[] = [];
    const lines = raw.split("\n").filter(l => l.trim());

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        results.push(parsed);
      } catch {
        results.push({ message: line, _format: "raw" });
      }
    }

    return results;
  }

  private inferEventType(data: Record<string, any>): string {
    const allText = JSON.stringify(data).toLowerCase();
    if (allText.includes("email") || allText.includes("smtp") || allText.includes("phish")) return "email";
    if (allText.includes("endpoint") || allText.includes("edr") || allText.includes("malware") || allText.includes("process")) return "endpoint";
    if (allText.includes("vuln") || allText.includes("cve-") || allText.includes("patch")) return "vulnerability";
    if (allText.includes("firewall") || allText.includes("ids") || allText.includes("ips") || allText.includes("network")) return "network";
    if (allText.includes("cloud") || allText.includes("aws") || allText.includes("azure") || allText.includes("gcp")) return "cloud";
    if (allText.includes("identity") || allText.includes("auth") || allText.includes("login") || allText.includes("ldap")) return "identity";
    if (allText.includes("dlp") || allText.includes("data loss") || allText.includes("exfil")) return "dlp";
    if (allText.includes("waf") || allText.includes("web application")) return "waf";
    return "network";
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = this.getCredential("apiKey") || this.getCredential("api_key") || this.getCredential("token");
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const username = this.getCredential("username");
    const password = this.getCredential("password");
    if (username && password) {
      headers["Authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    return headers;
  }

  private mapSyslogSeverity(level: number): string {
    if (level <= 1) return "critical";
    if (level <= 3) return "high";
    if (level === 4) return "medium";
    if (level <= 5) return "low";
    return "info";
  }

  private mapCEFSeverity(raw: string): string {
    const num = parseInt(raw);
    if (!isNaN(num)) {
      if (num >= 9) return "critical";
      if (num >= 7) return "high";
      if (num >= 4) return "medium";
      if (num >= 1) return "low";
      return "info";
    }
    const s = raw.toLowerCase();
    if (s === "very-high" || s === "critical") return "critical";
    if (s === "high") return "high";
    if (s === "medium") return "medium";
    if (s === "low") return "low";
    return "info";
  }

  private mapGenericSeverity(raw: any): string {
    if (typeof raw === "number") {
      if (raw >= 9) return "critical";
      if (raw >= 7) return "high";
      if (raw >= 4) return "medium";
      if (raw >= 1) return "low";
      return "info";
    }
    const s = String(raw).toLowerCase();
    if (["critical", "crit", "fatal", "emergency", "alert"].includes(s)) return "critical";
    if (["high", "error", "err", "major", "severe"].includes(s)) return "high";
    if (["medium", "warning", "warn", "moderate"].includes(s)) return "medium";
    if (["low", "minor", "notice"].includes(s)) return "low";
    if (["info", "informational", "debug", "trace"].includes(s)) return "info";
    return "info";
  }
}

registerConnector("generic_syslog", GenericSyslogConnector);
