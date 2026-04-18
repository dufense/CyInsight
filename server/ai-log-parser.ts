import { createAIClient, getDefaultModel } from "./ai-provider";
import type { InsertSecurityEvent } from "@shared/schema";

const openai = createAIClient();

export interface ParsedSecurityEvent {
  eventType: string;
  severity: string;
  srcIp: string | null;
  dstIp: string | null;
  srcPort: number | null;
  dstPort: number | null;
  protocol: string | null;
  user: string | null;
  action: string | null;
  threat: string | null;
  threatIndicator: string | null;
  url: string | null;
  process: string | null;
  commandLine: string | null;
  fileHash: string | null;
  fileName: string | null;
  hostname: string | null;
  description: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  mitreTechniqueId: string | null;
  killChainPhase: string | null;
  country: string | null;
  geoCity: string | null;
  riskScore: number | null;
  vendor: string | null;
  product: string | null;
  logFormat: string | null;
  deviceFingerprint: string | null;
  occurredAt: Date;
  rawLog: string;
  parseConfidence: number;
  needsReview: boolean;
  aiReasoning: string | null;
}

export interface LogSourceContext {
  sourceId?: number;
  sourceIdentifier?: string;
  knownVendor?: string;
  knownProduct?: string;
  knownFormat?: string;
  eventCategory?: string;
}

const UNIVERSAL_SCHEMA_DESCRIPTION = `
You are a universal security log parser. Parse any raw log line and extract a structured security event.

UNIVERSAL SECURITY EVENT SCHEMA:
- eventType: one of [network, endpoint, identity, web, email, cloud, database, ot_iot, vulnerability, casb, waf, dlp, sse] — use "web" for proxy/web access logs, "database" for DB audit logs, "ot_iot" for SCADA/ICS/IoT device logs
- severity: one of [critical, high, medium, low, info]
- srcIp: source IP address (string or null)
- dstIp: destination IP address (string or null)
- srcPort: source port number (integer or null)
- dstPort: destination port number (integer or null)
- protocol: network protocol (TCP, UDP, ICMP, HTTP, etc. or null)
- user: username or account involved (string or null)
- action: action taken or observed (blocked, allowed, denied, alerted, detected, quarantined, etc.)
- threat: threat name or attack type (string or null)
- threatIndicator: IOC value (IP, domain, hash, URL) (string or null)
- url: URL if applicable (string or null)
- process: process name if applicable (string or null)
- commandLine: command line if applicable (string or null)
- fileHash: MD5/SHA1/SHA256 hash if present (string or null)
- fileName: file name if applicable (string or null)
- hostname: host or device name (string or null)
- description: human-readable description of the event (string)
- mitreTactic: MITRE ATT&CK tactic name (string or null)
- mitreTechnique: MITRE ATT&CK technique name (string or null)
- mitreTechniqueId: MITRE ATT&CK technique ID like T1234 (string or null)
- killChainPhase: Lockheed Martin Kill Chain phase (string or null)
- country: source country if detectable (string or null)
- geoCity: source city if detectable (string or null)
- riskScore: numeric risk score 0-100 (integer or null)
- vendor: detected vendor name (string or null)
- product: detected product name (string or null)
- logFormat: detected log format (syslog, CEF, LEEF, JSON, W3C, etc.)
- deviceFingerprint: device category (firewall, IDS, EDR, WAF, proxy, email_gateway, etc.)
- occurredAt: ISO8601 timestamp of the event
- parseConfidence: 0-100 integer indicating your confidence in the parsing accuracy
- aiReasoning: brief explanation of how you identified the log format and extracted the fields
`;

const FEW_SHOT_EXAMPLES = `
EXAMPLES:

1. Cisco ASA Firewall (syslog):
Input: "<164>Apr 10 10:15:32 asa01 %ASA-4-106023: Deny tcp src outside:192.168.1.100/54321 dst inside:10.0.0.5/443 by access-group outside_in"
Output: {"eventType":"network","severity":"medium","srcIp":"192.168.1.100","dstIp":"10.0.0.5","srcPort":54321,"dstPort":443,"protocol":"TCP","action":"denied","description":"Cisco ASA denied TCP connection from 192.168.1.100:54321 to 10.0.0.5:443","vendor":"Cisco","product":"ASA Firewall","logFormat":"syslog","deviceFingerprint":"firewall","parseConfidence":95}

2. Palo Alto Firewall (CEF):
Input: "CEF:0|Palo Alto Networks|PAN-OS|10.1|THREAT|Threat|7|src=203.0.113.10 dst=10.1.1.50 spt=12345 dpt=80 proto=TCP act=block cs1=Conficker cs1Label=ThreatName"
Output: {"eventType":"network","severity":"high","srcIp":"203.0.113.10","dstIp":"10.1.1.50","srcPort":12345,"dstPort":80,"protocol":"TCP","action":"blocked","threat":"Conficker","vendor":"Palo Alto Networks","product":"PAN-OS","logFormat":"CEF","deviceFingerprint":"firewall","mitreTactic":"Initial Access","parseConfidence":92}

3. Windows Event Log (Sysmon):
Input: "EventID=4624 SubjectUserName=jdoe SubjectDomainName=CORP LogonType=3 IpAddress=10.5.1.12 TargetUserName=admin"
Output: {"eventType":"identity","severity":"medium","srcIp":"10.5.1.12","user":"jdoe","action":"logon","description":"Windows logon event: jdoe authenticated as admin from 10.5.1.12","vendor":"Microsoft","product":"Windows Event Log","logFormat":"WEF","deviceFingerprint":"endpoint","mitreTactic":"Credential Access","mitreTechniqueId":"T1078","parseConfidence":90}

4. Snort IDS:
Input: "[1:1000001:1] ET MALWARE CnC Beacon [**] [Classification: A Network Trojan was Detected] [Priority: 1] {TCP} 192.0.2.55:54000 -> 10.0.0.100:443"
Output: {"eventType":"network","severity":"critical","srcIp":"192.0.2.55","dstIp":"10.0.0.100","srcPort":54000,"dstPort":443,"protocol":"TCP","threat":"ET MALWARE CnC Beacon","action":"alerted","vendor":"Snort","product":"Snort IDS","logFormat":"Snort alert","deviceFingerprint":"ids_ips","mitreTactic":"Command and Control","mitreTechniqueId":"T1071","parseConfidence":93}

5. AWS CloudTrail (JSON):
Input: {"eventVersion":"1.05","userIdentity":{"type":"IAMUser","principalId":"AIDAEXAMPLE","arn":"arn:aws:iam::123456789012:user/alice","accountId":"123456789012","userName":"alice"},"eventTime":"2024-01-15T10:30:00Z","eventSource":"s3.amazonaws.com","eventName":"DeleteBucket","awsRegion":"us-east-1","sourceIPAddress":"198.51.100.10","requestParameters":{"bucketName":"sensitive-bucket"}}
Output: {"eventType":"cloud","severity":"high","srcIp":"198.51.100.10","user":"alice","action":"DeleteBucket","description":"AWS IAM user alice deleted S3 bucket sensitive-bucket","vendor":"Amazon","product":"AWS CloudTrail","logFormat":"JSON","deviceFingerprint":"cloud","mitreTactic":"Impact","mitreTechniqueId":"T1485","parseConfidence":97}

6. CrowdStrike Falcon EDR:
Input: {"event_type":"DetectionSummaryEvent","Severity":3,"Tactic":"Persistence","Technique":"Registry Run Keys","FileName":"malware.exe","MD5String":"d41d8cd98f00b204e9800998ecf8427e","ComputerName":"WORKSTATION-01","UserName":"victim"}
Output: {"eventType":"endpoint","severity":"high","hostname":"WORKSTATION-01","user":"victim","fileName":"malware.exe","fileHash":"d41d8cd98f00b204e9800998ecf8427e","threat":"Persistence via Registry Run Keys","vendor":"CrowdStrike","product":"Falcon","logFormat":"JSON","deviceFingerprint":"edr","mitreTactic":"Persistence","mitreTechniqueId":"T1547","parseConfidence":96}

7. F5 BIG-IP (WAF):
Input: "unit_hostname=bigip01,management_ip_address=10.0.0.1,request_status=alerted,src_ip=203.0.113.5,dest_ip=172.16.0.10,dest_port=443,ip_client=203.0.113.5,method=POST,uri=/admin/login,attack_type=SQL Injection,severity=Critical,violations=Attack signature detected"
Output: {"eventType":"waf","severity":"critical","srcIp":"203.0.113.5","dstIp":"172.16.0.10","dstPort":443,"url":"/admin/login","action":"alerted","threat":"SQL Injection","vendor":"F5","product":"BIG-IP WAF","logFormat":"key=value","deviceFingerprint":"waf","mitreTactic":"Initial Access","mitreTechniqueId":"T1190","parseConfidence":94}
`;

function parseCEFFallback(raw: string): Partial<ParsedSecurityEvent> {
  const cefIdx = raw.indexOf("CEF:");
  if (cefIdx === -1) return {};

  const content = raw.substring(cefIdx + 4);
  const parts = content.split("|");
  if (parts.length < 7) return {};

  const [, deviceVendor, deviceProduct, , signatureId, name, severity] = parts;
  const extensionStr = parts.slice(7).join("|");

  const extFields: Record<string, string> = {};
  const extRegex = /(\w+)=((?:[^=](?!\w+=))*)/g;
  let m: RegExpExecArray | null;
  while ((m = extRegex.exec(extensionStr)) !== null) {
    extFields[m[1]] = m[2].trim();
  }

  const severityNum = parseInt(severity || "0");
  let sev = "info";
  if (severityNum >= 9) sev = "critical";
  else if (severityNum >= 7) sev = "high";
  else if (severityNum >= 4) sev = "medium";
  else if (severityNum >= 1) sev = "low";

  return {
    eventType: "network",
    severity: sev,
    srcIp: extFields.src || extFields.shost || null,
    dstIp: extFields.dst || extFields.dhost || null,
    srcPort: extFields.spt ? parseInt(extFields.spt) || null : null,
    dstPort: extFields.dpt ? parseInt(extFields.dpt) || null : null,
    protocol: extFields.proto || null,
    action: extFields.act || null,
    threat: name || signatureId || null,
    url: extFields.request || null,
    user: extFields.suser || extFields.duser || null,
    hostname: extFields.dhost || extFields.shost || null,
    description: name || `${deviceVendor} ${deviceProduct} event: ${signatureId}`,
    vendor: deviceVendor || null,
    product: deviceProduct || null,
    logFormat: "CEF",
    deviceFingerprint: "firewall",
    occurredAt: extFields.rt ? new Date(parseInt(extFields.rt)) : new Date(),
    parseConfidence: 65,
    needsReview: false,
    aiReasoning: "Parsed via CEF regex fallback",
  };
}

function parseLEEFFallback(raw: string): Partial<ParsedSecurityEvent> {
  if (!raw.startsWith("LEEF:")) return {};

  const parts = raw.split("|");
  if (parts.length < 5) return {};

  const [, vendor, product, , eventId] = parts;
  const extStr = parts.slice(5).join("|");

  const fields: Record<string, string> = {};
  extStr.split("\t").forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      fields[pair.substring(0, eqIdx).trim()] = pair.substring(eqIdx + 1).trim();
    }
  });

  return {
    eventType: "network",
    severity: "medium",
    srcIp: fields.src || null,
    dstIp: fields.dst || null,
    protocol: fields.proto || null,
    action: fields.cat || null,
    threat: eventId || null,
    user: fields.usrName || null,
    hostname: fields.devName || null,
    description: `${vendor} ${product} event: ${eventId}`,
    vendor: vendor || null,
    product: product || null,
    logFormat: "LEEF",
    deviceFingerprint: "firewall",
    occurredAt: fields.devTime ? new Date(fields.devTime) : new Date(),
    parseConfidence: 60,
    needsReview: true,
    aiReasoning: "Parsed via LEEF regex fallback",
  };
}

function parseSyslogFallback(raw: string): Partial<ParsedSecurityEvent> {
  const syslogRfc3164 = /^<(\d+)>(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$/;
  const m = raw.match(syslogRfc3164);

  if (m) {
    const [, , timestamp, hostname, program, , message] = m;
    return {
      eventType: "network",
      severity: "info",
      hostname: hostname || null,
      description: message || raw,
      logFormat: "syslog",
      deviceFingerprint: "custom",
      occurredAt: timestamp ? new Date(timestamp + " " + new Date().getFullYear()) : new Date(),
      parseConfidence: 45,
      needsReview: true,
      aiReasoning: "Parsed via syslog RFC 3164 regex fallback",
    };
  }

  return {
    eventType: "network",
    severity: "info",
    description: raw.substring(0, 500),
    logFormat: "plaintext",
    deviceFingerprint: "custom",
    occurredAt: new Date(),
    parseConfidence: 20,
    needsReview: true,
    aiReasoning: "Could not parse log format — raw event stored",
  };
}

function parseJsonFallback(raw: string): Partial<ParsedSecurityEvent> {
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return {};

    const text = JSON.stringify(data).toLowerCase();
    let eventType = "network";
    if (text.includes("email") || text.includes("smtp")) eventType = "email";
    else if (text.includes("endpoint") || text.includes("process") || text.includes("malware")) eventType = "endpoint";
    else if (text.includes("cloud") || text.includes("aws") || text.includes("azure")) eventType = "cloud";
    else if (text.includes("identity") || text.includes("login") || text.includes("auth")) eventType = "identity";

    const srcIp = data.srcIp || data.src_ip || data.sourceIP || data.source_ip || data.src || null;
    const dstIp = data.dstIp || data.dst_ip || data.destIP || data.dest_ip || data.dst || null;
    const user = data.user || data.userName || data.username || data.user_name || null;
    const action = data.action || data.result || data.outcome || null;
    const threat = data.threat || data.alert || data.signature || data.threatName || null;
    const severity = data.severity || data.level || data.risk_level || "info";
    const hostname = data.hostname || data.host || data.computer || data.device || null;

    return {
      eventType,
      severity: typeof severity === "string" ? severity.toLowerCase() : "info",
      srcIp: typeof srcIp === "string" ? srcIp : null,
      dstIp: typeof dstIp === "string" ? dstIp : null,
      user: typeof user === "string" ? user : null,
      action: typeof action === "string" ? action : null,
      threat: typeof threat === "string" ? threat : null,
      hostname: typeof hostname === "string" ? hostname : null,
      description: data.message || data.description || data.msg || "JSON security event",
      logFormat: "JSON",
      deviceFingerprint: "custom",
      occurredAt: data.timestamp ? new Date(data.timestamp) : new Date(),
      parseConfidence: 55,
      needsReview: true,
      aiReasoning: "Parsed via JSON field extraction fallback",
    };
  } catch {
    return {};
  }
}

function regexFallback(raw: string): Partial<ParsedSecurityEvent> {
  if (raw.startsWith("CEF:") || raw.includes(" CEF:")) {
    const result = parseCEFFallback(raw);
    if (Object.keys(result).length > 0) return result;
  }

  if (raw.startsWith("LEEF:")) {
    const result = parseLEEFFallback(raw);
    if (Object.keys(result).length > 0) return result;
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const result = parseJsonFallback(raw);
    if (Object.keys(result).length > 0) return result;
  }

  return parseSyslogFallback(raw);
}

export async function parseRawLog(
  rawLog: string,
  sourceContext?: LogSourceContext
): Promise<ParsedSecurityEvent> {
  const contextHint = sourceContext
    ? `Source context: vendor=${sourceContext.knownVendor || "unknown"}, product=${sourceContext.knownProduct || "unknown"}, format=${sourceContext.knownFormat || "unknown"}, category=${sourceContext.eventCategory || "unknown"}`
    : "Source context: unknown";

  const prompt = `${UNIVERSAL_SCHEMA_DESCRIPTION}

${FEW_SHOT_EXAMPLES}

${contextHint}

Now parse the following raw log line and return ONLY a valid JSON object (no markdown, no explanation, just JSON):

RAW LOG:
${rawLog.substring(0, 4000)}`;

  let aiResult: Partial<ParsedSecurityEvent> = {};
  let usedAI = false;

  try {
    const model = getDefaultModel();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a security log parser. Always respond with valid JSON only. No markdown, no code blocks.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    const cleanContent = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    const parsed = JSON.parse(cleanContent);
    aiResult = parsed;
    usedAI = true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[AILogParser] AI parse failed: ${errMsg}, falling back to regex`);
    aiResult = regexFallback(rawLog);
  }

  const confidence = typeof aiResult.parseConfidence === "number" ? aiResult.parseConfidence : (usedAI ? 70 : 35);

  const result: ParsedSecurityEvent = {
    eventType: aiResult.eventType || "network",
    severity: aiResult.severity || "info",
    srcIp: aiResult.srcIp || null,
    dstIp: aiResult.dstIp || null,
    srcPort: aiResult.srcPort || null,
    dstPort: aiResult.dstPort || null,
    protocol: aiResult.protocol || null,
    user: aiResult.user || null,
    action: aiResult.action || null,
    threat: aiResult.threat || null,
    threatIndicator: aiResult.threatIndicator || null,
    url: aiResult.url || null,
    process: aiResult.process || null,
    commandLine: aiResult.commandLine || null,
    fileHash: aiResult.fileHash || null,
    fileName: aiResult.fileName || null,
    hostname: aiResult.hostname || null,
    description: aiResult.description || rawLog.substring(0, 200),
    mitreTactic: aiResult.mitreTactic || null,
    mitreTechnique: aiResult.mitreTechnique || null,
    mitreTechniqueId: aiResult.mitreTechniqueId || null,
    killChainPhase: aiResult.killChainPhase || null,
    country: aiResult.country || null,
    geoCity: aiResult.geoCity || null,
    riskScore: typeof aiResult.riskScore === "number" ? aiResult.riskScore : null,
    vendor: aiResult.vendor || sourceContext?.knownVendor || null,
    product: aiResult.product || sourceContext?.knownProduct || null,
    logFormat: aiResult.logFormat || null,
    deviceFingerprint: aiResult.deviceFingerprint || sourceContext?.eventCategory || null,
    occurredAt: aiResult.occurredAt ? new Date(String(aiResult.occurredAt)) : new Date(),
    rawLog,
    parseConfidence: confidence,
    needsReview: confidence < 60,
    aiReasoning: aiResult.aiReasoning || (usedAI ? "Parsed by AI" : "Parsed by regex fallback"),
  };

  if (isNaN(result.occurredAt.getTime())) {
    result.occurredAt = new Date();
  }

  return result;
}

const VALID_EVENT_TYPES = new Set([
  "email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse",
  "network", "identity", "cloud", "web", "database", "ot_iot",
]);

const DEVICE_FINGERPRINT_TO_EVENT_TYPE: Record<string, string> = {
  firewall: "network",
  ids: "network",
  ips: "network",
  ids_ips: "network",
  waf: "waf",
  proxy: "web",
  web_proxy: "web",
  email_gateway: "email",
  edr: "endpoint",
  antivirus: "endpoint",
  casb: "casb",
  sse: "sse",
  dlp: "dlp",
  siem: "network",
  cloud: "cloud",
  cloud_waf: "waf",
  database_monitor: "database",
  database: "database",
  ot: "ot_iot",
  iot: "ot_iot",
  ot_iot: "ot_iot",
  scada: "ot_iot",
  vulnerability_scanner: "vulnerability",
  identity: "identity",
  directory_services: "identity",
  network_tap: "network",
};

export function parsedEventToSecurityEvent(
  parsed: ParsedSecurityEvent,
  tenantId: number,
  batchId?: number
): InsertSecurityEvent {
  let eventType: InsertSecurityEvent["eventType"];
  if (VALID_EVENT_TYPES.has(parsed.eventType)) {
    eventType = parsed.eventType as InsertSecurityEvent["eventType"];
  } else if (parsed.deviceFingerprint && DEVICE_FINGERPRINT_TO_EVENT_TYPE[parsed.deviceFingerprint.toLowerCase()]) {
    eventType = DEVICE_FINGERPRINT_TO_EVENT_TYPE[parsed.deviceFingerprint.toLowerCase()] as InsertSecurityEvent["eventType"];
  } else {
    eventType = "network";
  }

  const validSeverities: InsertSecurityEvent["severity"][] = ["critical", "high", "medium", "low", "info"];
  const severity: InsertSecurityEvent["severity"] = validSeverities.includes(parsed.severity as InsertSecurityEvent["severity"]) ? parsed.severity as InsertSecurityEvent["severity"] : "info";

  const extraMeta: Record<string, any> = {};
  if (parsed.srcPort) extraMeta.srcPort = parsed.srcPort;
  if (parsed.dstPort) extraMeta.dstPort = parsed.dstPort;
  if (parsed.threatIndicator) extraMeta.threatIndicator = parsed.threatIndicator;
  if (parsed.url) extraMeta.url = parsed.url;
  if (parsed.process) extraMeta.process = parsed.process;
  if (parsed.commandLine) extraMeta.commandLine = parsed.commandLine;
  if (parsed.fileHash) extraMeta.fileHash = parsed.fileHash;
  if (parsed.fileName) extraMeta.fileName = parsed.fileName;
  if (parsed.geoCity) extraMeta.geoCity = parsed.geoCity;
  if (parsed.mitreTechniqueId) extraMeta.mitreTechniqueId = parsed.mitreTechniqueId;
  if (parsed.killChainPhase) extraMeta.killChainPhase = parsed.killChainPhase;
  if (parsed.parseConfidence !== undefined) extraMeta.parseConfidence = parsed.parseConfidence;
  if (parsed.needsReview) extraMeta.needsReview = true;
  if (parsed.aiReasoning) extraMeta.aiReasoning = parsed.aiReasoning;
  if (parsed.logFormat) extraMeta.logFormat = parsed.logFormat;
  if (parsed.deviceFingerprint) extraMeta.deviceFingerprint = parsed.deviceFingerprint;

  const result: InsertSecurityEvent = {
    tenantId,
    eventType,
    severity,
    threat: parsed.threat,
    target: parsed.dstIp || parsed.hostname,
    attacker: parsed.srcIp,
    asset: parsed.hostname,
    description: parsed.description,
    threatVector: parsed.deviceFingerprint,
    mitreTactic: parsed.mitreTactic,
    mitreTechnique: parsed.mitreTechnique,
    action: parsed.action,
    sourceType: parsed.vendor || parsed.deviceFingerprint,
    logSource: parsed.product || parsed.vendor,
    protocol: parsed.protocol,
    country: parsed.country,
    riskScore: parsed.riskScore,
    rawPayload: extraMeta,
    pipelineStatus: "normalized",
    batchId: batchId || null,
    normalizedAt: new Date(),
    occurredAt: parsed.occurredAt,
    parseConfidence: parsed.parseConfidence,
    needsReview: parsed.needsReview,
    aiReasoning: parsed.aiReasoning,
    rawLog: parsed.rawLog,
  };
  return result;
}
