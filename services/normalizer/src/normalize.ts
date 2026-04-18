import { VendorRegistry, type VendorDetectionResult, type EventType } from "./vendor-registry";
import { parseRawLog, parsedEventToSecurityEvent, type ParsedSecurityEvent } from "../../../server/ai-log-parser";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface NormalizedEvent {
  eventType: EventType;
  severity: Severity;
  threat: string | null;
  target: string | null;
  attacker: string | null;
  asset: string | null;
  app: string | null;
  description: string | null;
  threatVector: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  action: string | null;
  sourceType: string | null;
  logSource: string | null;
  sender: string | null;
  recipient: string | null;
  protocol: string | null;
  country: string | null;
  riskScore: number | null;
  rawPayload: Record<string, any>;
  occurredAt: string;
  tenantId: number;
  traceId: string | null;
  normalizedBy: "deterministic" | "ai-fallback" | "generic";
  vendorConfidence: number;
  parseConfidence: number | null;
  needsReview: boolean;
  aiReasoning: string | null;
  rawLog: string | null;
}

export interface NormalizationResult {
  normalized: NormalizedEvent[];
  errors: NormalizationError[];
  stats: {
    total: number;
    deterministic: number;
    aiFallback: number;
    generic: number;
    failed: number;
  };
}

export interface NormalizationError {
  index: number;
  error: string;
  rawData: Record<string, any>;
}

const vendorRegistry = new VendorRegistry();

export function normalizeSeverity(raw: string | number | undefined | null): Severity {
  if (raw == null) return "medium";

  if (typeof raw === "number") {
    if (raw >= 9) return "critical";
    if (raw >= 7) return "high";
    if (raw >= 4) return "medium";
    if (raw >= 1) return "low";
    return "info";
  }

  const s = String(raw).toLowerCase().trim();
  if (["critical", "crit", "fatal", "emergency", "5", "very high"].includes(s)) return "critical";
  if (["high", "4", "major", "severe"].includes(s)) return "high";
  if (["medium", "moderate", "3", "warning", "warn"].includes(s)) return "medium";
  if (["low", "2", "minor"].includes(s)) return "low";
  if (["info", "informational", "1", "0", "none", "negligible"].includes(s)) return "info";
  return "medium";
}

function getNestedValue(obj: any, key: string): any {
  if (obj == null) return undefined;
  if (obj[key] !== undefined) return obj[key];
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      const val = getNestedValue(obj[k], key);
      if (val !== undefined) return val;
    }
  }
  return undefined;
}

function normalizeCrowdStrike(data: Record<string, any>): Partial<NormalizedEvent> {
  const behaviors = Array.isArray(data.behaviors) ? data.behaviors[0] : data;
  const device = data.device || {};
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.max_severity_displayname || behaviors?.severity),
    threat: behaviors?.scenario || behaviors?.tactic || data.detection_description || null,
    target: device?.hostname || behaviors?.hostname || null,
    attacker: behaviors?.cmdline || behaviors?.filename || null,
    asset: device?.hostname || null,
    description: data.detection_description || behaviors?.description || null,
    mitreTactic: behaviors?.tactic || null,
    mitreTechnique: behaviors?.technique || null,
    action: behaviors?.pattern_disposition_details?.action_taken || "Detected",
    sourceType: "CrowdStrike Falcon",
    logSource: "CrowdStrike Falcon",
  };
}

function normalizePaloAlto(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "network",
    severity: normalizeSeverity(data.Severity || data.severity),
    threat: data.ThreatID || data.ThreatName || data.threat_name || null,
    target: data.DestinationAddress || data.dst || null,
    attacker: data.SourceAddress || data.src || null,
    asset: data.DeviceName || null,
    app: data.Application || data.app || null,
    description: data.Description || null,
    action: data.Action || data.action || null,
    protocol: data.Protocol || data.proto || null,
    country: data.SourceCountry || data.srccountry || null,
    sourceType: "Palo Alto Firewall",
    logSource: "Palo Alto Firewall",
  };
}

function normalizeCheckpointEmail(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "email",
    severity: normalizeSeverity(data.severity || data.confidence),
    threat: data.emailThreatType || data.threatType || null,
    target: data.recipientAddress || data.recipient || null,
    sender: data.senderAddress || data.sender || data.from || null,
    recipient: data.recipientAddress || data.recipient || data.to || null,
    description: data.subject || data.description || null,
    action: data.effectiveAction || data.action || null,
    sourceType: "Checkpoint Harmony Email",
    logSource: "Checkpoint Harmony Email",
  };
}

function normalizeSkyhighSSE(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "sse",
    severity: normalizeSeverity(data.riskLevel || data.severity || "info"),
    threat: data.urlCategory || data.threatName || null,
    target: data.url || data.destination || null,
    asset: data.hostName || data.sourceHost || null,
    app: data.applicationName || data.service || null,
    description: `${data.webAction || "Access"} to ${data.applicationName || data.url || "unknown"}`,
    action: data.webAction || data.action || null,
    sourceType: "Skyhigh Security SSE",
    logSource: "Skyhigh Security SSE",
  };
}

function normalizeVulnerability(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "vulnerability",
    severity: normalizeSeverity(data.vulnerabilitySeverity || data.SEVERITY || data.risk_factor || data.severity),
    threat: data.cveId || data.QID || data.plugin_name || data.vulnerability_id || null,
    target: data.assetName || data.hostname || data.asset || null,
    asset: data.assetName || data.hostname || null,
    description: data.patchName || data.SOLUTION || data.solution_fix || data.description || null,
    action: data.patchAvailable ? "Patch Available" : "No Fix Available",
    sourceType: data.patchId ? "Vicarius vRx" : "Vulnerability Scanner",
    logSource: data.patchId ? "Vicarius vRx" : (data.QID ? "Qualys" : (data.plugin_id ? "Tenable" : "Vulnerability Scanner")),
    riskScore: data.cvss_base_score || data.CVSS_SCORE || data.risk_score || null,
  };
}

function normalizeCynet(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.severity || (data.riskScore > 700 ? "critical" : data.riskScore > 400 ? "high" : "medium")),
    threat: data.alertType || data.detectionName || null,
    target: data.hostName || data.hostname || null,
    asset: data.hostName || data.hostname || null,
    description: data.description || data.alertType || null,
    action: data.remediationAction || data.processActionType || null,
    sourceType: "Cynet",
    logSource: "Cynet",
    riskScore: data.riskScore || null,
  };
}

function normalizeOkta(data: Record<string, any>): Partial<NormalizedEvent> {
  const actor = typeof data.actor === "object" ? data.actor : {};
  const outcome = typeof data.outcome === "object" ? data.outcome : {};
  const client = typeof data.client === "object" ? data.client : {};
  return {
    eventType: "identity",
    severity: outcome?.result === "FAILURE" ? "medium" : "info",
    threat: data.eventType || null,
    target: Array.isArray(data.target) ? data.target[0]?.displayName : null,
    attacker: client?.ipAddress || null,
    description: data.displayMessage || `${data.eventType} by ${actor?.displayName || "unknown"}`,
    action: outcome?.result || null,
    sourceType: "Okta",
    logSource: "Okta",
    country: client?.geographicalContext?.country || null,
  };
}

function normalizeAWSCloudTrail(data: Record<string, any>): Partial<NormalizedEvent> {
  const identity = typeof data.userIdentity === "object" ? data.userIdentity : {};
  return {
    eventType: "cloud",
    severity: data.errorCode ? "medium" : "info",
    threat: data.eventName || null,
    target: data.requestParameters ? JSON.stringify(data.requestParameters).slice(0, 200) : null,
    attacker: data.sourceIPAddress || null,
    description: `${data.eventName} by ${identity?.arn || identity?.userName || "unknown"} from ${data.sourceIPAddress || "unknown"}`,
    action: data.errorCode ? "Failed" : "Success",
    sourceType: "AWS CloudTrail",
    logSource: "AWS CloudTrail",
    country: null,
  };
}

function normalizeGuardDuty(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "cloud",
    severity: normalizeSeverity(data.severity),
    threat: data.type || data.title || null,
    target: data.resource?.instanceDetails?.instanceId || null,
    description: data.description || data.title || null,
    action: "Detected",
    sourceType: "AWS GuardDuty",
    logSource: "AWS GuardDuty",
    country: data.service?.action?.networkConnectionAction?.remoteIpDetails?.country?.countryName || null,
  };
}

function normalizeSentinelOne(data: Record<string, any>): Partial<NormalizedEvent> {
  const threat = typeof data.threatInfo === "object" ? data.threatInfo : {};
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(threat?.confidenceLevel || data.severity),
    threat: threat?.threatName || threat?.classification || null,
    target: data.agentRealtimeInfo?.agentComputerName || null,
    asset: data.agentRealtimeInfo?.agentComputerName || null,
    description: threat?.threatName || null,
    action: data.mitigationStatus || "Detected",
    sourceType: "SentinelOne",
    logSource: "SentinelOne",
  };
}

function normalizeMicrosoftDefender(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.severity),
    threat: data.title || data.category || null,
    target: data.computerDnsName || data.machineId || null,
    asset: data.computerDnsName || null,
    description: data.description || data.title || null,
    action: data.status || "Detected",
    sourceType: "Microsoft Defender",
    logSource: "Microsoft Defender",
    mitreTactic: Array.isArray(data.mitreTechniques) ? data.mitreTechniques[0] : null,
  };
}

function normalizeCheckpoint(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "network",
    severity: normalizeSeverity(data.severity),
    threat: data.protection_type || data.attack || null,
    target: data.dst || data.destination || null,
    attacker: data.src || data.source || null,
    asset: data.origin || null,
    description: data.protection_name || data.description || null,
    action: data.action || null,
    protocol: data.proto || data.service || null,
    sourceType: "Check Point",
    logSource: "Check Point",
  };
}

function normalizeSkyhighCASB(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "casb",
    severity: normalizeSeverity(data["Threat Category"] ? "medium" : "info"),
    threat: data["Threat Category"] || null,
    target: data["Service"] || null,
    asset: null,
    app: data["Service"] || null,
    description: `${data["Activity"] || "Activity"} on ${data["Service"] || "unknown"} by ${data["User"] || "unknown"}`,
    action: data["Activity"] || null,
    sourceType: "Skyhigh Security CASB",
    logSource: "Skyhigh Security CASB",
  };
}

function normalizeAzureAD(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "identity",
    severity: data.riskLevelDuringSignIn && data.riskLevelDuringSignIn !== "none" ? "medium" : "info",
    threat: data.riskDetail || null,
    target: data.userPrincipalName || null,
    description: `Sign-in by ${data.userPrincipalName || "unknown"} to ${data.appDisplayName || "unknown"}`,
    action: data.conditionalAccessStatus || null,
    sourceType: "Microsoft Entra ID",
    logSource: "Microsoft Entra ID",
    country: data.location?.countryOrRegion || null,
  };
}

function normalizeZscaler(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "sse",
    severity: normalizeSeverity(data.severity || "info"),
    threat: data.urlclass || null,
    target: data.url || null,
    app: data.appname || null,
    description: `${data.action || "Access"} to ${data.url || "unknown"} by ${data.user || "unknown"}`,
    action: data.action || null,
    sourceType: "Zscaler",
    logSource: "Zscaler",
  };
}

function normalizeForcepointDLP(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "dlp",
    severity: normalizeSeverity(data.severity || "medium"),
    threat: data.policyName || data.matchedRule || null,
    target: data.destinationInfo || null,
    description: `DLP policy "${data.policyName || "unknown"}" triggered on ${data.channel || "unknown"}`,
    action: data.actionTaken || null,
    sourceType: "Forcepoint DLP",
    logSource: "Forcepoint DLP",
  };
}

function normalizeProofpoint(data: Record<string, any>): Partial<NormalizedEvent> {
  const threats = Array.isArray(data.threatsInfoMap) ? data.threatsInfoMap[0] : {};
  return {
    eventType: "email",
    severity: normalizeSeverity(threats?.classification || "medium"),
    threat: threats?.threat || threats?.threatType || null,
    target: data.recipient || null,
    sender: data.fromAddress || null,
    recipient: data.recipient || null,
    description: data.subject || null,
    action: threats?.threatStatus || "Detected",
    sourceType: "Proofpoint",
    logSource: "Proofpoint",
  };
}

function normalizeMimecast(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "email",
    severity: data.spamScore && data.spamScore > 5 ? "medium" : "info",
    threat: data.spamScore && data.spamScore > 5 ? "Spam" : null,
    target: data.recipientAddress || null,
    sender: data.senderAddress || null,
    recipient: data.recipientAddress || null,
    description: data.subject || null,
    action: data.route || "Delivered",
    sourceType: "Mimecast",
    logSource: "Mimecast",
  };
}

function normalizeSophos(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.severity || "medium"),
    threat: data.threat || null,
    target: data.location || null,
    asset: data.managedAgent?.name || data.location || null,
    description: data.threat || null,
    action: data.cleanedUp ? "Cleaned" : "Detected",
    sourceType: "Sophos",
    logSource: "Sophos",
  };
}

function normalizeMicrosoftSentinel(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.AlertSeverity),
    threat: data.AlertName || null,
    target: data.CompromisedEntity || null,
    description: data.Description || data.AlertName || null,
    action: "Detected",
    mitreTactic: data.Tactics || null,
    sourceType: "Microsoft Sentinel",
    logSource: "Microsoft Sentinel",
  };
}

function normalizeCortexXDR(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.severity || data.alert_severity),
    threat: data.alert_name || data.description || null,
    target: data.endpoint_id || null,
    attacker: data.actor_process_image_name || null,
    description: data.description || data.action_pretty || null,
    action: data.action_pretty || "Detected",
    sourceType: "Palo Alto Cortex XDR",
    logSource: "Palo Alto Cortex XDR",
  };
}

function normalizeWAF(data: Record<string, any>): Partial<NormalizedEvent> {
  return {
    eventType: "waf",
    severity: data.action === "BLOCK" ? "high" : "medium",
    threat: data.terminatingRuleId || data.ruleGroupId || null,
    target: data.httpRequest?.uri || null,
    attacker: data.httpRequest?.clientIp || null,
    description: `WAF rule ${data.terminatingRuleId || "unknown"} triggered`,
    action: data.action || "Detected",
    sourceType: "AWS WAF",
    logSource: "AWS WAF",
    protocol: "HTTP",
  };
}

const DETERMINISTIC_NORMALIZERS: Record<string, (data: Record<string, any>) => Partial<NormalizedEvent>> = {
  "CrowdStrike Falcon": normalizeCrowdStrike,
  "SentinelOne": normalizeSentinelOne,
  "Palo Alto Cortex XDR": normalizeCortexXDR,
  "Palo Alto Firewall": normalizePaloAlto,
  "Check Point": normalizeCheckpoint,
  "Checkpoint Harmony Email": normalizeCheckpointEmail,
  "Microsoft Defender": normalizeMicrosoftDefender,
  "Microsoft Sentinel": normalizeMicrosoftSentinel,
  "Qualys": normalizeVulnerability,
  "Tenable Nessus": normalizeVulnerability,
  "Rapid7 InsightVM": normalizeVulnerability,
  "Skyhigh Security SSE": normalizeSkyhighSSE,
  "Skyhigh Security CASB": normalizeSkyhighCASB,
  "Zscaler": normalizeZscaler,
  "Forcepoint DLP": normalizeForcepointDLP,
  "Cynet": normalizeCynet,
  "Sophos": normalizeSophos,
  "Proofpoint": normalizeProofpoint,
  "Mimecast": normalizeMimecast,
  "Okta": normalizeOkta,
  "Microsoft Entra ID": normalizeAzureAD,
  "AWS CloudTrail": normalizeAWSCloudTrail,
  "AWS GuardDuty": normalizeGuardDuty,
  "AWS WAF": normalizeWAF,
  "Vicarius vRx": normalizeVulnerability,
};

function genericNormalize(data: Record<string, any>): Partial<NormalizedEvent> {
  const severity = normalizeSeverity(
    getNestedValue(data, "severity") ||
    getNestedValue(data, "risk") ||
    getNestedValue(data, "priority")
  );

  return {
    eventType: "endpoint",
    severity,
    threat: getNestedValue(data, "threat") || getNestedValue(data, "alert") || getNestedValue(data, "event") || null,
    target: getNestedValue(data, "target") || getNestedValue(data, "destination") || getNestedValue(data, "host") || null,
    attacker: getNestedValue(data, "source") || getNestedValue(data, "attacker") || getNestedValue(data, "src") || null,
    asset: getNestedValue(data, "hostname") || getNestedValue(data, "host") || getNestedValue(data, "asset") || null,
    description: getNestedValue(data, "description") || getNestedValue(data, "message") || getNestedValue(data, "summary") || null,
    action: getNestedValue(data, "action") || getNestedValue(data, "status") || null,
    sourceType: "Unknown",
    logSource: "Unknown",
  };
}

export function normalizeEvent(
  rawData: Record<string, any>,
  tenantId: number,
  traceId: string | null = null
): { event: NormalizedEvent; method: "deterministic" | "generic" } {
  const detection = vendorRegistry.detect(rawData);
  let partial: Partial<NormalizedEvent>;
  let method: "deterministic" | "generic" = "generic";

  if (detection) {
    const normalizer = DETERMINISTIC_NORMALIZERS[detection.vendor];
    if (normalizer) {
      partial = normalizer(rawData);
      method = "deterministic";
    } else {
      partial = genericNormalize(rawData);
    }
  } else {
    partial = genericNormalize(rawData);
  }

  const event: NormalizedEvent = {
    eventType: partial.eventType || "endpoint",
    severity: partial.severity || "medium",
    threat: partial.threat || null,
    target: partial.target || null,
    attacker: partial.attacker || null,
    asset: partial.asset || null,
    app: partial.app || null,
    description: partial.description || null,
    threatVector: partial.threatVector || null,
    mitreTactic: partial.mitreTactic || null,
    mitreTechnique: partial.mitreTechnique || null,
    action: partial.action || null,
    sourceType: partial.sourceType || null,
    logSource: partial.logSource || null,
    sender: partial.sender || null,
    recipient: partial.recipient || null,
    protocol: partial.protocol || null,
    country: partial.country || null,
    riskScore: partial.riskScore || null,
    rawPayload: rawData,
    occurredAt: rawData.timestamp || rawData.occurredAt || rawData.created_at || new Date().toISOString(),
    tenantId,
    traceId,
    normalizedBy: method,
    vendorConfidence: detection?.confidence || 0,
    parseConfidence: null,
    needsReview: false,
    aiReasoning: null,
    rawLog: rawData.rawMessage || rawData.raw || rawData.message || null,
  };

  return { event, method };
}

export async function normalizeEventWithAI(
  rawData: Record<string, any>,
  tenantId: number,
  traceId: string | null = null
): Promise<{ event: NormalizedEvent; method: "deterministic" | "ai-fallback" | "generic" }> {
  const detection = vendorRegistry.detect(rawData);

  if (detection) {
    const normalizer = DETERMINISTIC_NORMALIZERS[detection.vendor];
    if (normalizer) {
      const partial = normalizer(rawData);
      const event: NormalizedEvent = {
        eventType: partial.eventType || "endpoint",
        severity: partial.severity || "medium",
        threat: partial.threat || null,
        target: partial.target || null,
        attacker: partial.attacker || null,
        asset: partial.asset || null,
        app: partial.app || null,
        description: partial.description || null,
        threatVector: partial.threatVector || null,
        mitreTactic: partial.mitreTactic || null,
        mitreTechnique: partial.mitreTechnique || null,
        action: partial.action || null,
        sourceType: partial.sourceType || null,
        logSource: partial.logSource || null,
        sender: partial.sender || null,
        recipient: partial.recipient || null,
        protocol: partial.protocol || null,
        country: partial.country || null,
        riskScore: partial.riskScore || null,
        rawPayload: rawData,
        occurredAt: rawData.timestamp || rawData.occurredAt || rawData.created_at || new Date().toISOString(),
        tenantId,
        traceId,
        normalizedBy: "deterministic",
        vendorConfidence: detection.confidence,
        parseConfidence: null,
        needsReview: false,
        aiReasoning: null,
        rawLog: rawData.rawMessage || rawData.raw || rawData.message || null,
      };
      return { event, method: "deterministic" };
    }
  }

  const rawMessage: string | undefined =
    rawData.rawMessage ||
    rawData.message ||
    rawData.raw ||
    (typeof rawData === "object" && Object.keys(rawData).length === 1 ? String(Object.values(rawData)[0]) : undefined);

  if (rawMessage && rawMessage.length > 0) {
    try {
      const parsed = await parseRawLog(rawMessage);
      const mapped = parsedEventToSecurityEvent(parsed, tenantId);
      const event: NormalizedEvent = {
        eventType: mapped.eventType as EventType,
        severity: mapped.severity as Severity,
        threat: mapped.threat || null,
        target: mapped.target || null,
        attacker: mapped.attacker || null,
        asset: mapped.asset || null,
        app: null,
        description: mapped.description || null,
        threatVector: mapped.threatVector || null,
        mitreTactic: mapped.mitreTactic || null,
        mitreTechnique: mapped.mitreTechnique || null,
        action: mapped.action || null,
        sourceType: mapped.sourceType || null,
        logSource: mapped.logSource || null,
        sender: null,
        recipient: null,
        protocol: mapped.protocol || null,
        country: mapped.country || null,
        riskScore: mapped.riskScore || null,
        rawPayload: { ...rawData, ...(mapped.rawPayload || {}) },
        occurredAt: mapped.occurredAt ? mapped.occurredAt.toISOString() : new Date().toISOString(),
        tenantId,
        traceId,
        normalizedBy: "ai-fallback",
        vendorConfidence: parsed.parseConfidence ?? 0,
        parseConfidence: parsed.parseConfidence ?? null,
        needsReview: parsed.needsReview ?? false,
        aiReasoning: parsed.aiReasoning ?? null,
        rawLog: rawMessage,
      };
      return { event, method: "ai-fallback" };
    } catch {
    }
  }

  const { event, method } = normalizeEvent(rawData, tenantId, traceId);
  return { event, method };
}

export function normalizeBatch(
  events: Array<{ data: Record<string, any>; tenantId: number; traceId?: string }>
): NormalizationResult {
  const result: NormalizationResult = {
    normalized: [],
    errors: [],
    stats: { total: events.length, deterministic: 0, aiFallback: 0, generic: 0, failed: 0 },
  };

  for (let i = 0; i < events.length; i++) {
    const rawEvent = events[i];
    try {
      const { event, method } = normalizeEvent(
        rawEvent.data,
        rawEvent.tenantId,
        rawEvent.traceId || null
      );
      result.normalized.push(event);

      if (method === "deterministic") {
        result.stats.deterministic++;
      } else {
        result.stats.generic++;
      }
    } catch (err: unknown) {
      result.stats.failed++;
      result.errors.push({
        index: i,
        error: err instanceof Error ? err.message : "Unknown normalization error",
        rawData: rawEvent.data,
      });
    }
  }

  return result;
}

const AI_BATCH_CONCURRENCY = parseInt(process.env.AI_NORMALIZATION_CONCURRENCY || "5", 10);

async function runWithConcurrency<T>(
  items: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await items[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function isPreParsedPayload(data: Record<string, any>): boolean {
  return (
    typeof data.eventType === "string" &&
    typeof data.tenantId === "number" &&
    (typeof data.parseConfidence === "number" || typeof data.needsReview === "boolean")
  );
}

function passThruPreParsed(
  data: Record<string, any>,
  tenantId: number,
  traceId: string | null
): { event: NormalizedEvent; method: "deterministic" | "ai-fallback" | "generic" } {
  const event: NormalizedEvent = {
    eventType: (data.eventType as EventType) || "endpoint",
    severity: (data.severity as Severity) || "medium",
    threat: data.threat || null,
    target: data.target || null,
    attacker: data.attacker || null,
    asset: data.asset || null,
    app: data.app || null,
    description: data.description || null,
    threatVector: data.threatVector || null,
    mitreTactic: data.mitreTactic || null,
    mitreTechnique: data.mitreTechnique || null,
    action: data.action || null,
    sourceType: data.sourceType || null,
    logSource: data.logSource || null,
    sender: data.sender || null,
    recipient: data.recipient || null,
    protocol: data.protocol || null,
    country: data.country || null,
    riskScore: data.riskScore || null,
    rawPayload: data.rawPayload || {},
    occurredAt: data.occurredAt || new Date().toISOString(),
    tenantId,
    traceId,
    normalizedBy: "ai-fallback",
    vendorConfidence: data.parseConfidence ?? 0,
    parseConfidence: typeof data.parseConfidence === "number" ? data.parseConfidence : null,
    needsReview: data.needsReview === true,
    aiReasoning: data.aiReasoning || null,
    rawLog: data.rawLog || null,
  };
  return { event, method: "ai-fallback" };
}

export async function normalizeBatchWithAI(
  events: Array<{ data: Record<string, any>; tenantId: number; traceId?: string }>
): Promise<NormalizationResult> {
  const result: NormalizationResult = {
    normalized: [],
    errors: [],
    stats: { total: events.length, deterministic: 0, aiFallback: 0, generic: 0, failed: 0 },
  };

  const tasks = events.map((rawEvent) => () => {
    if (isPreParsedPayload(rawEvent.data)) {
      return Promise.resolve(
        passThruPreParsed(rawEvent.data, rawEvent.tenantId, rawEvent.traceId || null)
      );
    }
    return normalizeEventWithAI(rawEvent.data, rawEvent.tenantId, rawEvent.traceId || null);
  });

  const settled = await runWithConcurrency(tasks, AI_BATCH_CONCURRENCY);

  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    if (res.status === "fulfilled") {
      const { event, method } = res.value;
      result.normalized.push(event);
      if (method === "deterministic") result.stats.deterministic++;
      else if (method === "ai-fallback") result.stats.aiFallback++;
      else result.stats.generic++;
    } else {
      result.stats.failed++;
      result.errors.push({
        index: i,
        error: res.reason instanceof Error ? res.reason.message : "Unknown normalization error",
        rawData: events[i].data,
      });
    }
  }

  return result;
}

export { vendorRegistry };
