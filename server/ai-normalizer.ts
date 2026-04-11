import { createAIClient } from "./ai-provider";

const openai = createAIClient();

export type EventType = "email" | "endpoint" | "vulnerability" | "casb" | "waf" | "dlp" | "sse" | "network" | "identity" | "cloud";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface NormalizedSecurityEvent {
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
  occurredAt: Date;
}

export interface NormalizedIncident {
  title: string;
  description: string | null;
  severity: Severity;
  source: string | null;
  category: string | null;
  incidentType: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  actionTaken: string | null;
  detectionSource: string | null;
  affectedAssets: string | null;
  recommendation: string | null;
  mitreTactic: string | null;
  mitreTechniqueId: string | null;
  mitreTechnique: string | null;
  killChainPhase: string | null;
  confidenceScore: number | null;
  classification: string | null;
  iocData: any | null;
}

export interface NormalizationResult {
  events: NormalizedSecurityEvent[];
  incidents: NormalizedIncident[];
  sourceType: string;
  vendor: string | null;
  totalProcessed: number;
  errors: string[];
}

export interface ExtractedEntities {
  ips: string[];
  domains: string[];
  hashes: string[];
  emails: string[];
  hostnames: string[];
  usernames: string[];
}

interface VendorDetectionResult {
  vendor: string;
  sourceType: EventType;
  confidence: number;
}

const VENDOR_SIGNATURES: Record<string, { fields: string[]; vendor: string; sourceType: EventType }> = {
  crowdstrike: {
    fields: ["detection_id", "behaviors", "device", "max_severity_displayname", "hostinfo"],
    vendor: "CrowdStrike Falcon",
    sourceType: "endpoint",
  },
  sentinelone: {
    fields: ["agentDetectedAt", "threatInfo", "agentRealtimeInfo", "mitigationStatus"],
    vendor: "SentinelOne",
    sourceType: "endpoint",
  },
  cortex_xdr: {
    fields: ["alert_id", "endpoint_id", "detection_timestamp", "action_pretty", "actor_process_image_name"],
    vendor: "Palo Alto Cortex XDR",
    sourceType: "endpoint",
  },
  palo_alto_firewall: {
    fields: ["TimeGenerated", "SourceZone", "DestinationZone", "Action", "Rule", "Application"],
    vendor: "Palo Alto Firewall",
    sourceType: "network",
  },
  checkpoint: {
    fields: ["smartdefense_profile", "blade_name", "protection_type", "product"],
    vendor: "Check Point",
    sourceType: "network",
  },
  checkpoint_harmony: {
    fields: ["emailThreatType", "effectiveAction", "phishingSubCategory", "senderDomain"],
    vendor: "Checkpoint Harmony Email",
    sourceType: "email",
  },
  microsoft_defender: {
    fields: ["alertId", "incidentId", "serviceSource", "detectionSource", "category"],
    vendor: "Microsoft Defender",
    sourceType: "endpoint",
  },
  azure_sentinel: {
    fields: ["AlertSeverity", "ProviderName", "CompromisedEntity", "AlertLink", "Tactics"],
    vendor: "Microsoft Sentinel",
    sourceType: "endpoint",
  },
  qualys: {
    fields: ["QID", "SEVERITY", "CVSS_SCORE", "SOLUTION", "RESULTS"],
    vendor: "Qualys",
    sourceType: "vulnerability",
  },
  tenable: {
    fields: ["plugin_id", "plugin_name", "risk_factor", "cvss_base_score", "see_also"],
    vendor: "Tenable Nessus",
    sourceType: "vulnerability",
  },
  rapid7: {
    fields: ["vulnerability_id", "asset_id", "solution_fix", "risk_score", "exploit_count"],
    vendor: "Rapid7 InsightVM",
    sourceType: "vulnerability",
  },
  skyhigh_sse: {
    fields: ["userName", "applicationName", "webAction", "Upload (Bytes)", "Download (Bytes)", "urlCategory"],
    vendor: "Skyhigh Security SSE",
    sourceType: "sse",
  },
  skyhigh_casb: {
    fields: ["Service", "User", "Activity", "Object Type", "Threat Category"],
    vendor: "Skyhigh Security CASB",
    sourceType: "casb",
  },
  zscaler: {
    fields: ["datetime", "user", "url", "action", "urlclass", "department"],
    vendor: "Zscaler",
    sourceType: "sse",
  },
  forcepoint_dlp: {
    fields: ["policyName", "channel", "sourceInfo", "destinationInfo", "actionTaken", "matchedRule"],
    vendor: "Forcepoint DLP",
    sourceType: "dlp",
  },
  cynet: {
    fields: ["alertType", "hostName", "riskScore", "processActionType", "remediationAction"],
    vendor: "Cynet",
    sourceType: "endpoint",
  },
  sophos: {
    fields: ["managedAgent", "threat", "cleanedUp", "whenDetected", "location"],
    vendor: "Sophos",
    sourceType: "endpoint",
  },
  proofpoint: {
    fields: ["threatsInfoMap", "messageParts", "senderIP", "fromAddress", "recipient"],
    vendor: "Proofpoint",
    sourceType: "email",
  },
  mimecast: {
    fields: ["senderAddress", "recipientAddress", "subject", "route", "spamScore"],
    vendor: "Mimecast",
    sourceType: "email",
  },
  okta: {
    fields: ["actor", "client", "outcome", "target", "eventType", "debugContext"],
    vendor: "Okta",
    sourceType: "identity",
  },
  azure_ad: {
    fields: ["userPrincipalName", "appDisplayName", "conditionalAccessStatus", "riskDetail", "riskLevelDuringSignIn"],
    vendor: "Microsoft Entra ID",
    sourceType: "identity",
  },
  aws_cloudtrail: {
    fields: ["eventSource", "eventName", "userIdentity", "awsRegion", "sourceIPAddress", "requestParameters"],
    vendor: "AWS CloudTrail",
    sourceType: "cloud",
  },
  aws_guardduty: {
    fields: ["schemaVersion", "accountId", "region", "type", "resource", "service", "severity"],
    vendor: "AWS GuardDuty",
    sourceType: "cloud",
  },
  waf_generic: {
    fields: ["ruleId", "ruleGroupId", "action", "httpRequest", "terminatingRuleId"],
    vendor: "AWS WAF",
    sourceType: "waf",
  },
  vicarius: {
    fields: ["patchId", "patchName", "cveId", "exploitAvailable", "vulnerabilitySeverity", "assetName"],
    vendor: "Vicarius vRx",
    sourceType: "vulnerability",
  },
};

function detectVendor(data: Record<string, any>): VendorDetectionResult | null {
  const keys = new Set(Object.keys(data));
  const nestedKeys = new Set<string>();
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const nk of Object.keys(v)) {
        nestedKeys.add(nk);
      }
    }
  }
  const allKeys = new Set(Array.from(keys).concat(Array.from(nestedKeys)));

  let bestMatch: VendorDetectionResult | null = null;
  let bestScore = 0;

  for (const [, config] of Object.entries(VENDOR_SIGNATURES)) {
    const matched = config.fields.filter(f => allKeys.has(f)).length;
    const score = matched / config.fields.length;
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestMatch = {
        vendor: config.vendor,
        sourceType: config.sourceType,
        confidence: Math.round(score * 100),
      };
    }
  }

  return bestMatch;
}

function extractEntities(data: Record<string, any>): ExtractedEntities {
  const text = JSON.stringify(data);
  const entities: ExtractedEntities = {
    ips: [],
    domains: [],
    hashes: [],
    emails: [],
    hostnames: [],
    usernames: [],
  };

  const ipRegex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
  const ipMatches = text.match(ipRegex);
  if (ipMatches) {
    entities.ips = Array.from(new Set(ipMatches)).filter(ip => !ip.startsWith("0.") && ip !== "127.0.0.1" && ip !== "255.255.255.255");
  }

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailMatches = text.match(emailRegex);
  if (emailMatches) {
    entities.emails = Array.from(new Set(emailMatches)).filter(e => !e.includes("example.com"));
  }

  const md5Regex = /\b[a-fA-F0-9]{32}\b/g;
  const sha1Regex = /\b[a-fA-F0-9]{40}\b/g;
  const sha256Regex = /\b[a-fA-F0-9]{64}\b/g;
  const hashMatches = [
    ...(text.match(sha256Regex) || []),
    ...(text.match(sha1Regex) || []),
    ...(text.match(md5Regex) || []),
  ];
  entities.hashes = Array.from(new Set(hashMatches));

  const domainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|gov|edu|mil|co|us|uk|de|fr|ru|cn|jp|au|ca|br|in|it|nl|se|no|fi|dk|ch|at|es|pt|pl|cz|sk|hu|ro|bg|hr|si|rs|ba|me|mk|al|xn--[a-zA-Z0-9]+)\b/gi;
  const domainMatches = text.match(domainRegex);
  if (domainMatches) {
    entities.domains = Array.from(new Set(domainMatches.map(d => d.toLowerCase()))).filter(d =>
      !d.includes("example.") && !d.includes("schema.") && !d.includes("w3.org") && d.length < 100
    );
  }

  const hostnameFields = ["hostname", "hostName", "host_name", "computer_name", "computerName", "device_name", "deviceName", "asset", "assetName", "machineName"];
  for (const field of hostnameFields) {
    const val = getNestedValue(data, field);
    if (val && typeof val === "string" && val.length > 1 && val.length < 100) {
      entities.hostnames.push(val);
    }
  }
  entities.hostnames = Array.from(new Set(entities.hostnames));

  const usernameFields = ["userName", "user_name", "user", "username", "userPrincipalName", "actor", "accountName", "account_name", "sAMAccountName"];
  for (const field of usernameFields) {
    const val = getNestedValue(data, field);
    if (val && typeof val === "string" && val.length > 1 && val.length < 200 && !val.includes(" ")) {
      entities.usernames.push(val);
    }
  }
  entities.usernames = Array.from(new Set(entities.usernames));

  return entities;
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

function normalizeSeverity(raw: string | number | undefined | null): Severity {
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

function deterministicNormalizeCrowdStrike(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function deterministicNormalizePaloAlto(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function deterministicNormalizeCheckpointEmail(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
  const ad = data.additionalData || data.additional_data || {};
  const senderEmail = data.senderAddress || data.sender || data.from || ad.senderAddress || ad.sender || ad.fromAddress || null;
  return {
    eventType: "email",
    severity: normalizeSeverity(data.severity || data.confidence || ad.confidence),
    threat: data.emailThreatType || data.threatType || ad.emailThreatType || null,
    target: data.recipientAddress || data.recipient || ad.recipientAddress || null,
    sender: senderEmail,
    attacker: senderEmail,
    recipient: data.recipientAddress || data.recipient || ad.recipientAddress || data.to || null,
    description: data.subject || data.description || ad.subject || null,
    action: data.effectiveAction || data.action || ad.effectiveAction || null,
    sourceType: "Checkpoint Harmony Email",
    logSource: "Checkpoint Harmony Email",
  };
}

function deterministicNormalizeSkyhighSSE(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function deterministicNormalizeVulnerability(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function parseCynetIncidentJsonDesc(data: Record<string, any>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const src = data.IncidentJsonDescription ?? data.rawPayload?.IncidentJsonDescription;
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
    out.hostname = parsed["Hostname"] || parsed["HostName"] || null;
    out.deviceType = parsed["Device Type"] || parsed["DeviceType"] || null;
    out.deviceName = parsed["Device Name"] || parsed["DeviceName"] || null;
    out.deviceId = parsed["Device ID"] || parsed["DeviceId"] || null;
    out.deviceStatus = parsed["Device Status"] || parsed["DeviceStatus"] || null;
    out.epsPrevention = parsed["EPS Prevention"] || parsed["EPSPrevention"] || null;
    out.vendor = parsed["Vendor"] || parsed["vendor"] || null;
    out.product = parsed["Product"] || parsed["product"] || null;
    out.isUsb = parsed["Is USB"] || parsed["IsUSB"] || null;
    out.scanGroupName = parsed["ScanGroupName"] || null;
  }
  const topLevelHostIp = data.HostIp || data.rawPayload?.HostIp || null;
  if (topLevelHostIp) {
    out.hostIp = topLevelHostIp;
  }
  if (!out.scanGroupName) {
    out.scanGroupName = data.ScanGroupName || data.rawPayload?.ScanGroupName || null;
  }
  const incDesc = data.IncidentDescription ?? data.rawPayload?.IncidentDescription;
  if (typeof incDesc === "string" && incDesc) {
    const extract = (key: string) => {
      const m = incDesc.match(new RegExp(`${key}:\\s*([^,\\n]+)`, "i"));
      return m ? m[1].trim() : null;
    };
    if (!out.hostIp) out.hostIp = extract("Host Ip") || extract("HostIp");
    if (!out.osVersion) out.osVersion = extract("OS Version") || extract("OSVersion");
    if (!out.agentVersion) out.agentVersion = extract("CynetEPS Version") || extract("EPS Version");
    if (!out.hostname) out.hostname = extract("Hostname");
    if (!out.deviceType) out.deviceType = extract("Device Type");
    if (!out.deviceName) out.deviceName = extract("Device Name");
    if (!out.deviceId) out.deviceId = extract("Device ID");
    if (!out.deviceStatus) out.deviceStatus = extract("Device Status");
    if (!out.epsPrevention) out.epsPrevention = extract("EPS Prevention");
  }
  return out;
}

function deterministicNormalizeCynet(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
  const desc = parseCynetIncidentJsonDesc(data);
  const hostname = desc.hostname || data.hostName || data.hostname || null;
  const hostIp = desc.hostIp || null;

  data._cynetMeta = {
    hostIp,
    osVersion: desc.osVersion,
    agentVersion: desc.agentVersion,
    endpointGroup: desc.scanGroupName,
    hostname,
    deviceType: desc.deviceType,
    deviceName: desc.deviceName,
    deviceId: desc.deviceId,
    deviceStatus: desc.deviceStatus,
    epsPrevention: desc.epsPrevention,
    vendor: desc.vendor,
    product: desc.product,
    isUsb: desc.isUsb,
    isDeviceControl: !!(desc.deviceType || desc.deviceName),
  };

  return {
    eventType: "endpoint",
    severity: normalizeSeverity(data.severity || (data.riskScore > 700 ? "critical" : data.riskScore > 400 ? "high" : "medium")),
    threat: data.alertType || data.detectionName || null,
    target: hostIp || hostname || null,
    attacker: hostIp || null,
    asset: hostname || null,
    description: data.description || data.alertType || null,
    action: data.remediationAction || data.processActionType || null,
    sourceType: "Cynet",
    logSource: "Cynet",
    riskScore: data.riskScore || null,
  };
}

function deterministicNormalizeOkta(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function deterministicNormalizeAWSCloudTrail(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

function deterministicNormalizeGuardDuty(data: Record<string, any>): Partial<NormalizedSecurityEvent> {
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

const DETERMINISTIC_NORMALIZERS: Record<string, (data: Record<string, any>) => Partial<NormalizedSecurityEvent>> = {
  "CrowdStrike Falcon": deterministicNormalizeCrowdStrike,
  "Palo Alto Firewall": deterministicNormalizePaloAlto,
  "Checkpoint Harmony Email": deterministicNormalizeCheckpointEmail,
  "Skyhigh Security SSE": deterministicNormalizeSkyhighSSE,
  "Vicarius vRx": deterministicNormalizeVulnerability,
  "Qualys": deterministicNormalizeVulnerability,
  "Tenable Nessus": deterministicNormalizeVulnerability,
  "Rapid7 InsightVM": deterministicNormalizeVulnerability,
  "Cynet": deterministicNormalizeCynet,
  "Okta": deterministicNormalizeOkta,
  "AWS CloudTrail": deterministicNormalizeAWSCloudTrail,
  "AWS GuardDuty": deterministicNormalizeGuardDuty,
};

const AI_NORMALIZATION_PROMPT = `You are a security data normalization engine. Given raw security event data, normalize it to a structured format.

For each event, output:
{
  "eventType": "email|endpoint|vulnerability|casb|waf|dlp|sse|network|identity|cloud",
  "severity": "critical|high|medium|low|info",
  "threat": "threat name or description",
  "target": "target host/IP/user/resource",
  "attacker": "source IP/user/process",
  "asset": "affected asset hostname",
  "app": "application name if applicable",
  "description": "human-readable summary",
  "threatVector": "how the threat was delivered",
  "mitreTactic": "MITRE ATT&CK tactic if identifiable",
  "mitreTechnique": "MITRE technique name if identifiable",
  "action": "action taken (Blocked/Detected/Allowed/Quarantined)",
  "sourceType": "source platform/tool name",
  "logSource": "log source identifier",
  "sender": "email sender if applicable",
  "recipient": "email recipient if applicable",
  "protocol": "network protocol if applicable",
  "country": "country of origin if identifiable",
  "riskScore": 0-100,
  "occurredAt": "ISO timestamp if found in data, otherwise null",
  "isIncident": true/false (true if this represents a notable security incident requiring investigation),
  "incidentTitle": "short title for incident if isIncident is true",
  "incidentType": "malware|ransomware|phishing|brute_force|vulnerability|data_exfiltration|unauthorized_access|suspicious_process|network_intrusion|cloud_misconfiguration|other",
  "killChainPhase": "reconnaissance|weaponization|delivery|exploitation|installation|command_and_control|actions_on_objectives",
  "confidenceScore": 0-100,
  "classification": "true_positive|false_positive|suspicious",
  "recommendation": "recommended action"
}

Return JSON: {"results": [<normalized events>]}
Important: Always return valid JSON. Map fields intelligently based on the security context.`;

async function normalizeWithAI(rawEvents: Record<string, any>[]): Promise<{
  events: Partial<NormalizedSecurityEvent>[];
  incidents: Partial<NormalizedIncident>[];
}> {
  const batch = rawEvents.slice(0, 50);
  const eventsPayload = batch.map((evt, idx) => ({
    index: idx,
    data: truncateForAI(evt),
  }));

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: AI_NORMALIZATION_PROMPT },
        { role: "user", content: JSON.stringify(eventsPayload) },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { events: [], incidents: [] };
    }

    const parsed = JSON.parse(content);
    const results: any[] = parsed.results || [];

    const normalizedEvents: Partial<NormalizedSecurityEvent>[] = [];
    const normalizedIncidents: Partial<NormalizedIncident>[] = [];

    for (const result of results) {
      const idx = result.index ?? results.indexOf(result);
      const originalData = batch[idx] || {};

      normalizedEvents.push({
        eventType: validEventType(result.eventType),
        severity: normalizeSeverity(result.severity),
        threat: result.threat || null,
        target: result.target || null,
        attacker: result.attacker || null,
        asset: result.asset || null,
        app: result.app || null,
        description: result.description || null,
        threatVector: result.threatVector || null,
        mitreTactic: result.mitreTactic || null,
        mitreTechnique: result.mitreTechnique || null,
        action: result.action || null,
        sourceType: result.sourceType || null,
        logSource: result.logSource || null,
        sender: result.sender || null,
        recipient: result.recipient || null,
        protocol: result.protocol || null,
        country: result.country || null,
        riskScore: typeof result.riskScore === "number" ? result.riskScore : null,
        rawPayload: originalData,
        occurredAt: result.occurredAt ? new Date(result.occurredAt) : new Date(),
      });

      if (result.isIncident) {
        normalizedIncidents.push({
          title: result.incidentTitle || result.threat || "Security Incident",
          description: result.description || null,
          severity: normalizeSeverity(result.severity),
          source: result.sourceType || null,
          category: result.eventType || null,
          incidentType: result.incidentType || null,
          sourceIp: result.attacker || null,
          destinationIp: result.target || null,
          actionTaken: result.action || null,
          detectionSource: result.logSource || null,
          affectedAssets: result.asset || null,
          recommendation: result.recommendation || null,
          mitreTactic: result.mitreTactic || null,
          mitreTechniqueId: null,
          mitreTechnique: result.mitreTechnique || null,
          killChainPhase: result.killChainPhase || null,
          confidenceScore: typeof result.confidenceScore === "number" ? result.confidenceScore : null,
          classification: result.classification || "suspicious",
          iocData: null,
        });
      }
    }

    return { events: normalizedEvents, incidents: normalizedIncidents };
  } catch (error: any) {
    console.error("AI normalization failed:", error.message);
    return { events: [], incidents: [] };
  }
}

function truncateForAI(data: Record<string, any>, maxKeys: number = 30): Record<string, any> {
  const entries = Object.entries(data);
  if (entries.length <= maxKeys) return data;

  const priorityKeys = [
    "severity", "threat", "host", "hostname", "hostName", "source", "destination",
    "action", "type", "eventType", "description", "user", "userName", "ip",
    "sourceIp", "destinationIp", "alert", "detection", "category", "status",
    "mitre", "tactic", "technique", "cve", "vulnerability", "email", "sender",
    "recipient", "subject", "riskScore", "timestamp", "occurredAt", "created",
  ];

  const result: Record<string, any> = {};
  for (const key of priorityKeys) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }

  for (const [key, val] of entries) {
    if (Object.keys(result).length >= maxKeys) break;
    if (!(key in result)) {
      result[key] = typeof val === "string" && val.length > 500 ? val.slice(0, 500) : val;
    }
  }

  return result;
}

function validEventType(raw: string | undefined | null): EventType {
  const valid: EventType[] = ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud"];
  if (raw && valid.includes(raw as EventType)) return raw as EventType;
  return "endpoint";
}

function buildFullEvent(partial: Partial<NormalizedSecurityEvent>, rawData: Record<string, any>): NormalizedSecurityEvent {
  return {
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
    riskScore: partial.riskScore ?? null,
    rawPayload: rawData,
    occurredAt: partial.occurredAt || parseTimestamp(rawData) || new Date(),
  };
}

function parseTimestamp(data: Record<string, any>): Date | null {
  const timestampFields = [
    "timestamp", "occurredAt", "occurred_at", "createdAt", "created_at",
    "TimeGenerated", "time_generated", "eventTime", "event_time",
    "detectedAt", "detected_at", "whenDetected", "alertTime", "date", "datetime",
    "agentDetectedAt", "detection_timestamp",
  ];

  for (const field of timestampFields) {
    const val = getNestedValue(data, field);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function shouldCreateIncident(event: NormalizedSecurityEvent): boolean {
  if (event.severity === "critical") return true;
  if (event.severity === "high" && event.threat) return true;

  const threatLower = (event.threat || "").toLowerCase();
  const highThreatPatterns = [
    "malware", "ransomware", "phishing", "brute force", "data exfiltration",
    "unauthorized access", "privilege escalation", "lateral movement",
    "command and control", "rootkit", "webshell", "cryptominer",
  ];
  if (highThreatPatterns.some(p => threatLower.includes(p))) return true;

  return false;
}

function eventToIncident(event: NormalizedSecurityEvent): NormalizedIncident {
  return {
    title: event.threat || event.description || "Security Alert",
    description: event.description,
    severity: event.severity,
    source: event.sourceType,
    category: event.eventType,
    incidentType: classifyIncidentTypeFromEvent(event),
    sourceIp: event.attacker,
    destinationIp: event.target,
    actionTaken: event.action,
    detectionSource: event.logSource,
    affectedAssets: event.asset,
    recommendation: null,
    mitreTactic: event.mitreTactic,
    mitreTechniqueId: null,
    mitreTechnique: event.mitreTechnique,
    killChainPhase: null,
    confidenceScore: event.riskScore || 50,
    classification: "suspicious",
    iocData: null,
  };
}

function classifyIncidentTypeFromEvent(event: NormalizedSecurityEvent): string {
  const text = `${event.threat || ""} ${event.description || ""} ${event.eventType}`.toLowerCase();

  if (/malware|trojan|worm|backdoor|virus/.test(text)) return "Malware";
  if (/ransomware/.test(text)) return "Ransomware";
  if (/phish/.test(text)) return "Phishing";
  if (/brute.?force|credential.?stuff|password.?spray/.test(text)) return "Brute Force";
  if (/vulnerab|cve-|patch/.test(text)) return "Vulnerability";
  if (/data.?(exfil|leak|loss)|dlp/.test(text)) return "Data Exfiltration";
  if (/unauthorized|privilege.?escalat/.test(text)) return "Unauthorized Access";
  if (/suspicious.?process|suspicious.?exec/.test(text)) return "Suspicious Process";
  if (/network.?intrus|ids|ips/.test(text)) return "Network Intrusion";
  if (/cloud.?misconfig|s3.?public/.test(text)) return "Cloud Misconfiguration";
  if (/cryptomin/.test(text)) return "Cryptomining";
  if (/lateral.?move/.test(text)) return "Lateral Movement";
  if (/port.?scan/.test(text)) return "Port Scan";
  if (/webshell/.test(text)) return "Webshell";
  return "Security Alert";
}

export async function normalizeRawData(
  rawData: Record<string, any> | Record<string, any>[],
  options?: {
    forceAI?: boolean;
    vendorHint?: string;
    sourceTypeHint?: EventType;
  }
): Promise<NormalizationResult> {
  const dataArray = Array.isArray(rawData) ? rawData : [rawData];
  const result: NormalizationResult = {
    events: [],
    incidents: [],
    sourceType: "unknown",
    vendor: null,
    totalProcessed: 0,
    errors: [],
  };

  if (dataArray.length === 0) {
    return result;
  }

  const sample = dataArray[0];
  const vendorDetection = detectVendor(sample);
  const vendor = options?.vendorHint || vendorDetection?.vendor || null;
  const sourceType = options?.sourceTypeHint || vendorDetection?.sourceType || "endpoint";

  result.vendor = vendor;
  result.sourceType = sourceType;

  const deterministicNormalizer = vendor ? DETERMINISTIC_NORMALIZERS[vendor] : null;

  if (deterministicNormalizer && !options?.forceAI) {
    for (const rawEvent of dataArray) {
      try {
        const partial = deterministicNormalizer(rawEvent);
        const entities = extractEntities(rawEvent);

        if (!partial.target && entities.ips.length > 0) {
          partial.target = entities.ips[0];
        }
        if (!partial.asset && entities.hostnames.length > 0) {
          partial.asset = entities.hostnames[0];
        }

        const fullEvent = buildFullEvent(partial, rawEvent);
        result.events.push(fullEvent);

        if (shouldCreateIncident(fullEvent)) {
          result.incidents.push(eventToIncident(fullEvent));
        }

        result.totalProcessed++;
      } catch (err: any) {
        result.errors.push(`Event normalization error: ${err.message}`);
      }
    }
  } else {
    const batchSize = 50;
    for (let i = 0; i < dataArray.length; i += batchSize) {
      const batch = dataArray.slice(i, i + batchSize);
      try {
        const aiResult = await normalizeWithAI(batch);

        for (let j = 0; j < aiResult.events.length; j++) {
          const partial = aiResult.events[j];
          const rawEvent = batch[j] || {};
          const entities = extractEntities(rawEvent);

          if (!partial.target && entities.ips.length > 0) {
            partial.target = entities.ips[0];
          }
          if (!partial.asset && entities.hostnames.length > 0) {
            partial.asset = entities.hostnames[0];
          }

          const fullEvent = buildFullEvent(partial, rawEvent);
          result.events.push(fullEvent);

          if (shouldCreateIncident(fullEvent) && !aiResult.incidents.some((inc, idx) => idx === j)) {
            result.incidents.push(eventToIncident(fullEvent));
          }

          result.totalProcessed++;
        }

        result.incidents.push(...(aiResult.incidents as NormalizedIncident[]));

        const unprocessed = batch.length - aiResult.events.length;
        if (unprocessed > 0) {
          for (let k = aiResult.events.length; k < batch.length; k++) {
            const rawEvent = batch[k];
            const entities = extractEntities(rawEvent);
            const fallback = buildFallbackEvent(rawEvent, sourceType, entities);
            result.events.push(fallback);
            result.totalProcessed++;
          }
        }
      } catch (err: any) {
        result.errors.push(`AI batch normalization error: ${err.message}`);
        for (const rawEvent of batch) {
          const entities = extractEntities(rawEvent);
          const fallback = buildFallbackEvent(rawEvent, sourceType, entities);
          result.events.push(fallback);
          result.totalProcessed++;
        }
      }
    }
  }

  return result;
}

function buildFallbackEvent(
  rawData: Record<string, any>,
  sourceType: EventType,
  entities: ExtractedEntities
): NormalizedSecurityEvent {
  const severity = normalizeSeverity(
    rawData.severity || rawData.Severity || rawData.risk_level || rawData.priority
  );

  return {
    eventType: sourceType,
    severity,
    threat: rawData.threat || rawData.alert || rawData.detection || rawData.type || rawData.eventName || null,
    target: rawData.target || rawData.destination || rawData.dst || entities.ips[0] || entities.hostnames[0] || null,
    attacker: rawData.attacker || rawData.source || rawData.src || rawData.sourceIp || (entities.ips.length > 1 ? entities.ips[1] : null),
    asset: rawData.asset || rawData.hostname || rawData.hostName || entities.hostnames[0] || null,
    app: rawData.app || rawData.application || rawData.applicationName || null,
    description: rawData.description || rawData.message || rawData.summary || rawData.title || null,
    threatVector: null,
    mitreTactic: rawData.mitreTactic || rawData.tactic || null,
    mitreTechnique: rawData.mitreTechnique || rawData.technique || null,
    action: rawData.action || rawData.Action || rawData.status || null,
    sourceType: rawData.sourceType || rawData.source || null,
    logSource: rawData.logSource || rawData.log_source || rawData.source || null,
    sender: rawData.sender || rawData.from || (entities.emails.length > 0 ? entities.emails[0] : null),
    recipient: rawData.recipient || rawData.to || (entities.emails.length > 1 ? entities.emails[1] : null),
    protocol: rawData.protocol || rawData.proto || null,
    country: rawData.country || null,
    riskScore: typeof rawData.riskScore === "number" ? rawData.riskScore : null,
    rawPayload: rawData,
    occurredAt: parseTimestamp(rawData) || new Date(),
  };
}

export function detectSourceType(data: Record<string, any> | Record<string, any>[]): {
  vendor: string | null;
  sourceType: EventType;
  confidence: number;
} {
  const sample = Array.isArray(data) ? data[0] : data;
  if (!sample) return { vendor: null, sourceType: "endpoint", confidence: 0 };

  const detection = detectVendor(sample);
  if (detection) {
    return {
      vendor: detection.vendor,
      sourceType: detection.sourceType,
      confidence: detection.confidence,
    };
  }

  return { vendor: null, sourceType: inferSourceType(sample), confidence: 20 };
}

function inferSourceType(data: Record<string, any>): EventType {
  const text = JSON.stringify(data).toLowerCase();

  if (/email|phish|sender|recipient|subject|dkim|spf|dmarc/.test(text)) return "email";
  if (/endpoint|edr|xdr|process|agent|malware|virus/.test(text)) return "endpoint";
  if (/vulnerab|cve|patch|cvss|exploit/.test(text)) return "vulnerability";
  if (/casb|cloud access|saas|shadow it/.test(text)) return "casb";
  if (/waf|web application firewall|owasp|sql injection|xss/.test(text)) return "waf";
  if (/dlp|data loss|data leak|policy violation/.test(text)) return "dlp";
  if (/sse|web gateway|proxy|url filter/.test(text)) return "sse";
  if (/firewall|network|ids|ips|packet|flow/.test(text)) return "network";
  if (/identity|auth|login|sso|mfa|ldap|active directory/.test(text)) return "identity";
  if (/cloud|aws|azure|gcp|s3|ec2|lambda/.test(text)) return "cloud";

  return "endpoint";
}

export {
  extractEntities,
  detectVendor,
  normalizeSeverity,
  validEventType,
  shouldCreateIncident,
};
