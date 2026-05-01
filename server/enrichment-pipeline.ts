import { storage } from "./storage";
import { normalizeRawData, extractEntities, detectSourceType } from "./ai-normalizer";
import type { NormalizationResult, NormalizedSecurityEvent, NormalizedIncident, ExtractedEntities } from "./ai-normalizer";
import { calculateAssetRisk } from "./risk-engine";
import { pool } from "./db";
import { buildEntityInventory } from "./entity-engine";
import { db } from "./db";
import { assets, incidents, securityEvents, userAssets } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { IngestBatch, InsertSecurityEvent, InsertIncident } from "@shared/schema";
import crypto from "crypto";
import { matchEvent, detectCorrelationPatterns, type SigmaMatch } from "./sigma-engine";
import { securityEventBus, type LiveSecurityEvent } from "./event-bus";
import { getClickHouseClient, type IngestEventPayload } from "./clickhouse-client";

function parseExcelSerialDate(serial: number): Date | null {
  if (serial < 1000 || serial > 100000) return null;
  const epoch = new Date(1899, 11, 30);
  const days = Math.floor(serial);
  const fraction = serial - days;
  const ms = epoch.getTime() + days * 86400000 + Math.round(fraction * 86400000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  return d;
}

function parseEventTimestamp(occurredAt: any, rawPayload: any): Date | null {
  if (occurredAt instanceof Date && !isNaN(occurredAt.getTime())) {
    if (occurredAt.getFullYear() >= 2000 && occurredAt.getFullYear() <= 2100) return occurredAt;
  }
  if (typeof occurredAt === "string" && occurredAt.trim()) {
    const d = new Date(occurredAt);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) return d;
  }

  if (rawPayload) {
    const lastSeen = rawPayload["Last Seen"] || rawPayload["last_seen"];
    const firstSeen = rawPayload["First Seen"] || rawPayload["first_seen"];
    const ts = lastSeen || firstSeen;
    if (typeof ts === "number") {
      const parsed = parseExcelSerialDate(ts);
      if (parsed) return parsed;
    }
    if (typeof ts === "string") {
      const num = parseFloat(ts);
      if (!isNaN(num) && num > 1000) {
        const parsed = parseExcelSerialDate(num);
        if (parsed) return parsed;
      }
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
    }

    const activityTime = rawPayload.activityTime || rawPayload.activity_time;
    if (activityTime) {
      const d = new Date(activityTime);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

export type PipelineStage = "queued" | "normalizing" | "enriching" | "scoring" | "correlating" | "complete" | "failed";

export interface PipelineProgress {
  batchId: number;
  stage: PipelineStage;
  totalEvents: number;
  processedEvents: number;
  errorCount: number;
  errors: string[];
  stageDetails: Record<string, any>;
}

const pipelineListeners = new Map<number, Set<(progress: PipelineProgress) => void>>();

export function subscribeToPipeline(batchId: number, listener: (progress: PipelineProgress) => void): () => void {
  if (!pipelineListeners.has(batchId)) {
    pipelineListeners.set(batchId, new Set());
  }
  pipelineListeners.get(batchId)!.add(listener);
  return () => {
    const listeners = pipelineListeners.get(batchId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) pipelineListeners.delete(batchId);
    }
  };
}

function emitProgress(progress: PipelineProgress) {
  const listeners = pipelineListeners.get(progress.batchId);
  if (listeners) {
    listeners.forEach(listener => {
      try { listener(progress); } catch {}
    });
    // Auto-prune listeners for completed or failed batches to prevent memory leak
    if (progress.stage === "complete" || progress.stage === "failed") {
      pipelineListeners.delete(progress.batchId);
    }
  }
}

const CYNET_ACTION_MAP: Record<string, string> = {
  "0": "Unknown",
  "1": "Detected",
  "2": "Blocked",
  "3": "Quarantined",
  "4": "Remediated",
  "5": "Allowed",
  "6": "Isolated",
  "7": "Killed",
  "8": "Deleted",
  "9": "Restored",
  "10": "Reported",
};

const CHECKPOINT_VERDICT_MAP: Record<string, string> = {
  "clean": "Clean",
  "spam": "Spam",
  "suspected": "Suspected",
  "malicious": "Malicious",
  "phishing": "Phishing",
  "blocked": "Blocked",
  "quarantined": "Quarantined",
  "delivered": "Delivered",
  "allowed": "Allowed",
};

const SKYHIGH_ACTION_MAP: Record<string, string> = {
  "allow": "Allowed",
  "block": "Blocked",
  "monitor": "Monitored",
  "encrypt": "Encrypted",
  "quarantine": "Quarantined",
  "alert": "Alerted",
  "coach": "Coached",
  "bypass": "Bypassed",
  "request_access": "Access Requested",
};

export function normalizeActionLabel(action: string | null | undefined, logSource?: string | null): string | null {
  if (action == null) return null;
  const trimmed = String(action).trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const mapped = CYNET_ACTION_MAP[trimmed];
    if (mapped) return mapped;
    return `Action Code ${trimmed}`;
  }

  const lower = trimmed.toLowerCase();

  if (logSource && (logSource.includes("Checkpoint") || logSource.includes("checkpoint"))) {
    const mapped = CHECKPOINT_VERDICT_MAP[lower];
    if (mapped) return mapped;
  }

  if (logSource && (logSource.includes("Skyhigh") || logSource.includes("skyhigh"))) {
    const mapped = SKYHIGH_ACTION_MAP[lower];
    if (mapped) return mapped;
  }

  if (trimmed.length > 0 && trimmed[0] === trimmed[0].toUpperCase()) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function classifyEventTypeFromCynet(raw: any): string {
  const incidentDescription = raw.rawPayload?.IncidentDescription || raw.rawPayload?.incident_description || raw.description || "";
  const alertName = raw.threat || raw.rawPayload?.IncidentName || raw.rawPayload?.alert_name || "";
  const category = raw.rawPayload?.Category || raw.rawPayload?.category || "";
  const text = `${alertName} ${category} ${raw.rawPayload?.detection_type || raw.rawPayload?.DetectionType || ""} ${raw.rawPayload?.alert_type || raw.rawPayload?.AlertType || ""} ${incidentDescription}`.toLowerCase();

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

const MITRE_TACTIC_TECHNIQUE_MAP: Record<string, { techniques: string[]; killChainPhase: string }> = {
  "Reconnaissance": { techniques: ["T1595", "T1592", "T1589", "T1590"], killChainPhase: "Reconnaissance" },
  "Resource Development": { techniques: ["T1583", "T1584", "T1587", "T1588"], killChainPhase: "Weaponization" },
  "Initial Access": { techniques: ["T1566", "T1190", "T1133", "T1078"], killChainPhase: "Delivery" },
  "Execution": { techniques: ["T1059", "T1204", "T1203"], killChainPhase: "Exploitation" },
  "Persistence": { techniques: ["T1547", "T1053", "T1136", "T1098"], killChainPhase: "Installation" },
  "Privilege Escalation": { techniques: ["T1068", "T1055", "T1134"], killChainPhase: "Exploitation" },
  "Defense Evasion": { techniques: ["T1070", "T1036", "T1027", "T1562"], killChainPhase: "Exploitation" },
  "Credential Access": { techniques: ["T1003", "T1110", "T1555", "T1556"], killChainPhase: "Exploitation" },
  "Discovery": { techniques: ["T1087", "T1082", "T1083", "T1046"], killChainPhase: "Exploitation" },
  "Lateral Movement": { techniques: ["T1021", "T1570", "T1563"], killChainPhase: "Installation" },
  "Collection": { techniques: ["T1560", "T1005", "T1039", "T1114"], killChainPhase: "Actions on Objectives" },
  "Command and Control": { techniques: ["T1071", "T1105", "T1572", "T1573"], killChainPhase: "Command & Control" },
  "Exfiltration": { techniques: ["T1041", "T1048", "T1567"], killChainPhase: "Actions on Objectives" },
  "Impact": { techniques: ["T1486", "T1489", "T1490", "T1529"], killChainPhase: "Actions on Objectives" },
};

const THREAT_TO_TACTIC: Record<string, string> = {
  "malware": "Execution",
  "ransomware": "Impact",
  "phishing": "Initial Access",
  "brute_force": "Credential Access",
  "brute force": "Credential Access",
  "data exfiltration": "Exfiltration",
  "unauthorized access": "Initial Access",
  "privilege escalation": "Privilege Escalation",
  "lateral movement": "Lateral Movement",
  "command and control": "Command and Control",
  "cryptomining": "Impact",
  "rootkit": "Persistence",
  "webshell": "Persistence",
  "process injection": "Defense Evasion",
  "dll side-loading": "Defense Evasion",
  "port scan": "Discovery",
  "port scanning": "Discovery",
  "network scanning": "Discovery",
  "vulnerability": "Initial Access",
  "suspicious process": "Execution",
  "defense evasion": "Defense Evasion",
  "masquerading": "Defense Evasion",
  "suspicious cloud operation": "Discovery",
  "suspicious api call": "Execution",
  "exfiltration over usb": "Exfiltration",
  "exfiltration over removable": "Exfiltration",
  "copy to removable": "Exfiltration",
  "copy to usb": "Exfiltration",
  "data written to removable": "Exfiltration",
  "transfer to removable": "Exfiltration",
  "transfer to usb": "Exfiltration",
  "storage device": "Lateral Movement",
  "insertion of storage": "Lateral Movement",
  "removable media": "Lateral Movement",
  "device control": "Initial Access",
  "usb device": "Lateral Movement",
  "usb mass storage": "Lateral Movement",
  "terminate cynet": "Defense Evasion",
  "attempt to terminate": "Defense Evasion",
  "disable agent": "Defense Evasion",
  "kill process": "Defense Evasion",
  "malicious binary": "Execution",
  "infected file": "Execution",
  "file dumped": "Execution",
  "threat intelligence detection": "Command and Control",
  "blacklist": "Command and Control",
  "decoy triggered": "Credential Access",
  "decoy": "Credential Access",
  "responder": "Credential Access",
  "unauthorized file": "Collection",
  "process monitoring": "Discovery",
  "network activity inspection": "Discovery",
};

const THREAT_TO_TECHNIQUE: Record<string, string> = {
  "exfiltration over usb": "T1052",
  "exfiltration over removable": "T1052",
  "copy to removable": "T1052",
  "copy to usb": "T1052",
  "data written to removable": "T1052",
  "transfer to removable": "T1052",
  "transfer to usb": "T1052",
  "storage device": "T1091",
  "insertion of storage": "T1091",
  "removable media": "T1091",
  "usb device": "T1091",
  "usb mass storage": "T1091",
  "device control": "T1200",
  "ransomware": "T1486",
  "cryptomining": "T1496",
  "rootkit": "T1014",
  "webshell": "T1505",
  "process injection": "T1055",
  "dll side-loading": "T1574",
  "masquerading": "T1036",
  "brute force": "T1110",
  "brute_force": "T1110",
  "data exfiltration": "T1041",
  "privilege escalation": "T1068",
  "phishing": "T1566",
  "lateral movement": "T1021",
  "port scan": "T1046",
  "port scanning": "T1046",
  "network scanning": "T1046",
};

export const MITRE_PHISHING_SIGNALS = ["email", "link", "attachment", "credential", "message", "lure", "click", "href", "mailto", "spoofed", "impersonat"] as const;
export const MITRE_USB_MEDIA_TERMS = ["usb", "removable", "thumb drive", "flash drive", "external drive"] as const;
export const MITRE_USB_EXFIL_SIGNALS = ["exfil", "copy", "transfer", "written", "upload"] as const;

function buildCynetEnrichedDescription(event: NormalizedSecurityEvent): string | null {
  const cynetMeta = (event.rawPayload as any)?._cynetMeta;
  if (!cynetMeta) return null;
  if (!cynetMeta.isDeviceControl) return null;
  const deviceLabel = cynetMeta.deviceName || cynetMeta.deviceType || "Storage Device";
  const blocked = String(cynetMeta.deviceStatus || "").toLowerCase().includes("block") ||
    String(cynetMeta.epsPrevention || "").toLowerCase().includes("block");
  const hostname = cynetMeta.hostname || event.asset;
  const hostIp = cynetMeta.hostIp;
  const action = cynetMeta.epsRemediationLabel || (blocked ? "Blocked" : "Detected");

  if (event.rawPayload && typeof event.rawPayload === "object") {
    (event.rawPayload as any)._cynetMeta.deviceControl = {
      deviceName: cynetMeta.deviceName || null,
      deviceType: cynetMeta.deviceType || null,
      deviceId: cynetMeta.deviceId || null,
      vendor: cynetMeta.vendor || null,
      product: cynetMeta.product || null,
      isBlocked: blocked,
      action,
      hostname: hostname || null,
      hostIp: hostIp || null,
    };
  }

  let desc = `Device Control: ${blocked ? "Blocked" : "Detected"} — ${deviceLabel}`;
  if (cynetMeta.deviceType) desc += ` (${cynetMeta.deviceType})`;
  if (hostname) desc += ` on ${hostname}`;
  if (hostIp) desc += ` [${hostIp}]`;
  if (cynetMeta.vendor) desc += `. Vendor: ${cynetMeta.vendor}`;
  if (cynetMeta.product) desc += ` / ${cynetMeta.product}`;
  if (cynetMeta.deviceId) desc += `. Device ID: ${cynetMeta.deviceId}`;
  if (cynetMeta.epsRemediationLabel) desc += `. Action: ${cynetMeta.epsRemediationLabel}`;
  return desc;
}

async function upsertCynetAssets(tenantId: number, events: NormalizedSecurityEvent[]): Promise<void> {
  const cynetEvents = events.filter(e =>
    (
      e.logSource === "Cynet 360" || e.sourceType === "Cynet 360" ||
      e.logSource === "Cynet" || e.sourceType === "Cynet" ||
      !!(e.rawPayload as any)?._cynetMeta
    ) &&
    e.asset
  );
  if (cynetEvents.length === 0) return;

  type HostEntry = {
    alertCount: number;
    hostIp: string | null;
    osVersion: string | null;
    agentVersion: string | null;
    endpointGroup: string | null;
    lastSeen: Date;
  };
  const hostMap = new Map<string, HostEntry>();
  const canonicalHostname = new Map<string, string>();

  for (const event of cynetEvents) {
    const hn = event.asset!;
    const key = hn.toLowerCase();
    if (!canonicalHostname.has(key)) canonicalHostname.set(key, hn);
    const meta = (event.rawPayload as any)?._cynetMeta || {};
    const rawLastSeen = meta.lastSeenUtc ||
      (event.rawPayload as any)?.LastSeen ||
      (event.rawPayload as any)?.last_seen;
    const lastSeen = rawLastSeen ? new Date(rawLastSeen) : new Date();
    if (isNaN(lastSeen.getTime())) continue;

    const existing = hostMap.get(key);
    if (existing) {
      existing.alertCount += 1;
      if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
      existing.hostIp = existing.hostIp ?? (meta.hostIp || null);
      existing.osVersion = existing.osVersion ?? (meta.osVersion || null);
      existing.agentVersion = existing.agentVersion ?? (meta.agentVersion || null);
      existing.endpointGroup = existing.endpointGroup ?? (meta.endpointGroup || (event.rawPayload as any)?.ScanGroupName || null);
    } else {
      hostMap.set(key, {
        alertCount: 1,
        hostIp: meta.hostIp || null,
        osVersion: meta.osVersion || null,
        agentVersion: meta.agentVersion || null,
        endpointGroup: meta.endpointGroup || (event.rawPayload as any)?.ScanGroupName || (event.rawPayload as any)?.scan_group_name || null,
        lastSeen,
      });
    }
  }

  for (const [key, entry] of hostMap.entries()) {
    const hn = canonicalHostname.get(key) ?? key;
    try {
      await pool.query(
        `INSERT INTO assets (tenant_id, hostname, ip_address, operating_system, agent_version, endpoint_group, last_seen, status, source, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'cynet_alert', NOW())
         ON CONFLICT ON CONSTRAINT uq_assets_tenant_hostname
         DO UPDATE SET
           ip_address = COALESCE(EXCLUDED.ip_address, assets.ip_address),
           operating_system = COALESCE(EXCLUDED.operating_system, assets.operating_system),
           agent_version = COALESCE(EXCLUDED.agent_version, assets.agent_version),
           endpoint_group = COALESCE(EXCLUDED.endpoint_group, assets.endpoint_group),
           last_seen = COALESCE(GREATEST(EXCLUDED.last_seen, assets.last_seen), EXCLUDED.last_seen, assets.last_seen),
           status = 'active',
           incident_count = assets.incident_count + $8,
           updated_at = NOW()`,
        [tenantId, hn, entry.hostIp, entry.osVersion, entry.agentVersion, entry.endpointGroup, entry.lastSeen, entry.alertCount]
      );
    } catch (err: any) {
      console.error(`[Pipeline] Asset upsert failed for ${hn}: ${err.message}`);
    }
  }
}

export function classifyMITREThreat(threat: string, description: string): { tactic: string | null; technique: string | null } {
  const threatText = `${threat || ""} ${description || ""}`.toLowerCase();

  const hasUsbExfil = MITRE_USB_MEDIA_TERMS.some(t => threatText.includes(t)) && MITRE_USB_EXFIL_SIGNALS.some(s => threatText.includes(s));
  if (hasUsbExfil) {
    return { tactic: "Exfiltration", technique: "T1052" };
  }

  const isPhishingContext = MITRE_PHISHING_SIGNALS.some(sig => threatText.includes(sig));

  for (const [keyword, tactic] of Object.entries(THREAT_TO_TACTIC)) {
    if (keyword === "phishing" && !isPhishingContext) continue;
    if (threatText.includes(keyword)) {
      const technique = THREAT_TO_TECHNIQUE[keyword] || null;
      return { tactic, technique };
    }
  }
  return { tactic: null, technique: null };
}

function enrichMITRE(event: NormalizedSecurityEvent): {
  mitreTactic: string | null;
  mitreTechnique: string | null;
  killChainPhase: string | null;
} {
  if (event.mitreTactic) {
    const tacticInfo = MITRE_TACTIC_TECHNIQUE_MAP[event.mitreTactic];
    let technique = event.mitreTechnique || null;
    if (!technique) {
      const threatText = `${event.threat || ""} ${event.description || ""}`.toLowerCase();
      const isPhishingContext = MITRE_PHISHING_SIGNALS.some(sig => threatText.includes(sig));
      for (const [keyword, overrideTech] of Object.entries(THREAT_TO_TECHNIQUE)) {
        if (keyword === "phishing" && !isPhishingContext) continue;
        if (threatText.includes(keyword)) { technique = overrideTech; break; }
      }
      if (!technique && tacticInfo) technique = tacticInfo.techniques[0];
    }
    return {
      mitreTactic: event.mitreTactic,
      mitreTechnique: technique,
      killChainPhase: tacticInfo?.killChainPhase || null,
    };
  }

  const threatText = `${event.threat || ""} ${event.description || ""}`.toLowerCase();

  const hasUsbExfil = MITRE_USB_MEDIA_TERMS.some(t => threatText.includes(t)) && MITRE_USB_EXFIL_SIGNALS.some(s => threatText.includes(s));
  if (hasUsbExfil) {
    const exfilTacticInfo = MITRE_TACTIC_TECHNIQUE_MAP["Exfiltration"];
    return {
      mitreTactic: "Exfiltration",
      mitreTechnique: "T1052",
      killChainPhase: exfilTacticInfo?.killChainPhase || "actions_on_objectives",
    };
  }

  const isPhishingContext = MITRE_PHISHING_SIGNALS.some(sig => threatText.includes(sig));

  for (const [keyword, tactic] of Object.entries(THREAT_TO_TACTIC)) {
    if (keyword === "phishing" && !isPhishingContext) continue;
    if (threatText.includes(keyword)) {
      const tacticInfo = MITRE_TACTIC_TECHNIQUE_MAP[tactic];
      const techniqueOverride = THREAT_TO_TECHNIQUE[keyword];
      return {
        mitreTactic: tactic,
        mitreTechnique: techniqueOverride || (tacticInfo ? tacticInfo.techniques[0] : null),
        killChainPhase: tacticInfo?.killChainPhase || null,
      };
    }
  }

  return {
    mitreTactic: event.mitreTactic || null,
    mitreTechnique: event.mitreTechnique || null,
    killChainPhase: null,
  };
}

interface IOCIndicator {
  type: "ip" | "domain" | "hash" | "url" | "email";
  value: string;
  reputation: "malicious" | "suspicious" | "clean" | "unknown";
  source: string;
}

function extractAndScoreIOCs(entities: ExtractedEntities, event: NormalizedSecurityEvent): IOCIndicator[] {
  const indicators: IOCIndicator[] = [];

  const isMalicious = event.severity === "critical" || event.severity === "high";
  const isSuspicious = event.severity === "medium";

  const emailSet = new Set(entities.emails.map(e => e.toLowerCase()));
  const emailDomainSet = new Set(entities.emails.map(e => e.split("@")[1]?.toLowerCase()).filter(Boolean));

  for (const ip of entities.ips) {
    if (ip.includes("@")) continue;
    const isValidIP = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);
    if (!isValidIP) continue;
    const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
    if (isPrivate) continue;

    const isAttacker = event.attacker === ip;
    indicators.push({
      type: "ip",
      value: ip,
      reputation: isAttacker && isMalicious ? "malicious" : isAttacker && isSuspicious ? "suspicious" : "unknown",
      source: event.logSource || event.sourceType || "unknown",
    });
  }

  for (const domain of entities.domains) {
    if (domain.includes("@") || emailSet.has(domain.toLowerCase())) continue;
    indicators.push({
      type: "domain",
      value: domain,
      reputation: isMalicious ? "suspicious" : "unknown",
      source: event.logSource || event.sourceType || "unknown",
    });
  }

  for (const hash of entities.hashes) {
    indicators.push({
      type: "hash",
      value: hash,
      reputation: isMalicious ? "malicious" : isSuspicious ? "suspicious" : "unknown",
      source: event.logSource || event.sourceType || "unknown",
    });
  }

  for (const email of entities.emails) {
    if (event.sender === email && isMalicious) {
      indicators.push({
        type: "email",
        value: email,
        reputation: "suspicious",
        source: event.logSource || event.sourceType || "unknown",
      });
    }
  }

  return indicators;
}

function calculateConfidenceScore(event: NormalizedSecurityEvent, entities: ExtractedEntities, iocs: IOCIndicator[]): number {
  let confidence = 30;

  const sourceReliability: Record<string, number> = {
    "CrowdStrike Falcon": 20,
    "Palo Alto Firewall": 18,
    "Microsoft Defender": 18,
    "Microsoft Sentinel": 18,
    "SentinelOne": 18,
    "Cynet": 15,
    "Checkpoint Harmony Email": 15,
    "Check Point": 15,
    "AWS GuardDuty": 18,
    "Okta": 15,
    "Qualys": 15,
    "Tenable Nessus": 15,
  };

  const sourceBonus = sourceReliability[event.logSource || ""] || sourceReliability[event.sourceType || ""] || 5;
  confidence += sourceBonus;

  if (event.mitreTactic) confidence += 10;
  if (event.mitreTechnique) confidence += 5;
  if (event.threat && event.threat.length > 5) confidence += 5;
  if (event.asset) confidence += 5;

  const maliciousIocs = iocs.filter(i => i.reputation === "malicious").length;
  const suspiciousIocs = iocs.filter(i => i.reputation === "suspicious").length;
  confidence += maliciousIocs * 5 + suspiciousIocs * 2;

  if (entities.ips.length > 0) confidence += 3;
  if (entities.hostnames.length > 0) confidence += 3;
  if (entities.hashes.length > 0) confidence += 5;

  return Math.min(100, Math.max(0, confidence));
}

function generateDedupHash(incident: NormalizedIncident, tenantId: number): string {
  const dateWindow = (incident as any).occurredAt
    ? new Date((incident as any).occurredAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const parts = [
    String(tenantId),
    incident.title || "",
    incident.severity || "",
    incident.affectedAssets || "",
    incident.sourceIp || "",
    dateWindow,
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex");
}

function generateThreatNarrative(incident: any, sigmaMatches: any[], iocContext: any): string {
  const title = incident.title || "Unknown Incident";
  const severity = (incident.severity || "medium").toUpperCase();
  const source = incident.source || "Unknown";
  const mitreTactic = incident.mitre_tactic || "Unknown";
  const mitreTechnique = incident.mitre_technique || "Unknown";

  let narrative = `## Threat Narrative: ${title}\n\n`;
  narrative += `**Severity:** ${severity} | **Source:** ${source}\n`;
  narrative += `**MITRE ATT&CK:** ${mitreTactic} / ${mitreTechnique}\n\n`;

  narrative += `### Detection Summary\n`;
  narrative += `This incident was detected through ${source} and classified as ${severity} severity. `;

  if (sigmaMatches && Array.isArray(sigmaMatches) && sigmaMatches.length > 0) {
    narrative += `${sigmaMatches.length} Sigma detection rule(s) matched this activity:\n`;
    for (const match of sigmaMatches.slice(0, 5)) {
      narrative += `- **${match.ruleTitle || match.ruleId}** (${match.severity || "medium"}): ${match.description || "Detection rule match"}\n`;
    }
    narrative += "\n";
  }

  if (iocContext?.indicators && Array.isArray(iocContext.indicators)) {
    const maliciousIOCs = iocContext.indicators.filter((i: any) => i.reputation === "malicious");
    const suspiciousIOCs = iocContext.indicators.filter((i: any) => i.reputation === "suspicious");
    if (maliciousIOCs.length > 0 || suspiciousIOCs.length > 0) {
      narrative += `### Indicators of Compromise\n`;
      if (maliciousIOCs.length > 0) {
        narrative += `**Malicious indicators (${maliciousIOCs.length}):**\n`;
        for (const ioc of maliciousIOCs.slice(0, 5)) {
          narrative += `- ${ioc.type}: \`${ioc.value}\` (source: ${ioc.source})\n`;
        }
      }
      if (suspiciousIOCs.length > 0) {
        narrative += `**Suspicious indicators (${suspiciousIOCs.length}):**\n`;
        for (const ioc of suspiciousIOCs.slice(0, 5)) {
          narrative += `- ${ioc.type}: \`${ioc.value}\` (source: ${ioc.source})\n`;
        }
      }
      narrative += "\n";
    }
  }

  narrative += `### Attack Chain Analysis\n`;
  narrative += `Based on MITRE ATT&CK mapping, this activity falls under the **${mitreTactic}** tactic. `;

  const tacticNarratives: Record<string, string> = {
    "Initial Access": "The attacker is attempting to gain entry into the network through external-facing services, phishing, or exploiting public-facing applications.",
    "Execution": "Malicious code is being executed on the target system, potentially through scripts, scheduled tasks, or exploitation of application vulnerabilities.",
    "Persistence": "The adversary is establishing mechanisms to maintain their foothold in the environment across system restarts and credential changes.",
    "Privilege Escalation": "An attempt to gain higher-level permissions is detected, potentially escalating from user to administrator access.",
    "Defense Evasion": "The adversary is employing techniques to avoid detection by security tools and monitoring systems.",
    "Credential Access": "Credential theft or brute force activity has been detected, targeting authentication systems or stored credentials.",
    "Discovery": "The adversary is gathering information about the environment to inform their next actions.",
    "Lateral Movement": "Movement between systems within the network has been detected, indicating the adversary is expanding their reach.",
    "Collection": "Data gathering activity has been detected, potentially in preparation for exfiltration.",
    "Exfiltration": "Data is being moved outside the network perimeter to adversary-controlled infrastructure.",
    "Impact": "Destructive activity is detected, potentially including data encryption, service disruption, or system manipulation.",
    "Command and Control": "Communication with external infrastructure has been detected, indicating potential adversary command channels.",
  };

  narrative += tacticNarratives[mitreTactic] || "Further analysis is needed to determine the full scope of this activity.";
  narrative += "\n\n";

  narrative += `### Recommended Response\n`;
  if (severity === "CRITICAL") {
    narrative += `1. **Immediate containment:** Isolate affected systems from the network\n`;
    narrative += `2. **Preserve evidence:** Capture memory dumps and disk images before remediation\n`;
    narrative += `3. **Escalate:** Notify SOC leadership and initiate incident response procedures\n`;
    narrative += `4. **Hunt:** Search for related indicators across all monitored systems\n`;
  } else if (severity === "HIGH") {
    narrative += `1. **Investigate:** Review all related events and correlated data within the next 2 hours\n`;
    narrative += `2. **Contain:** Consider isolating affected systems if compromise is confirmed\n`;
    narrative += `3. **Document:** Record all findings in the incident timeline\n`;
    narrative += `4. **Monitor:** Increase monitoring on affected assets for 48 hours\n`;
  } else {
    narrative += `1. **Monitor:** Track this activity for escalation patterns\n`;
    narrative += `2. **Correlate:** Check for related events from other sources\n`;
    narrative += `3. **Baseline:** Compare against normal activity patterns for this entity\n`;
  }

  return narrative;
}

function classifyIncidentTypeFromEvent(event: NormalizedSecurityEvent): string {
  const text = `${event.threat || ""} ${event.description || ""} ${event.eventType || ""}`.toLowerCase();

  if (/ransomware/.test(text)) return "Ransomware";
  if (/malware|trojan|worm|backdoor|keylogger|spyware|adware|wildfire/.test(text)) return "Malware";
  if (/cryptominer|coinminer|crypto.*min/.test(text)) return "Cryptomining";
  if (/vulnerable.*driver|loldriver|byovd/.test(text)) return "Vulnerable Driver";
  if (/cve-|vulnerab|patch.*missing|unpatched/.test(text)) return "Vulnerability";
  if (/suspicious.*executable/.test(text)) return "Suspicious Executable";
  if (/suspicious.*process|rare.*unsigned/.test(text)) return "Suspicious Process";
  if (/remote.*wmi|psexec|remote.*execution|winrm/.test(text)) return "Remote Code Execution";
  if (/rootkit|uncommon.*driver/.test(text)) return "Rootkit";
  if (/webshell/.test(text)) return "Webshell";
  if (/process.*injection|process.*hollowing|dll.*injection|pe.*injection/.test(text)) return "Process Injection";
  if (/dll.*sideload|dll.*hijack/.test(text)) return "DLL Side-Loading";
  if (/masquerading/.test(text)) return "Masquerading";
  if (/ntlm.*relay/.test(text)) return "NTLM Relay";
  if (/powershell/.test(text)) return "Powershell Activity";
  if (/privilege.*escalation/.test(text)) return "Privilege Escalation";
  if (/defense.*evasion|impair.*defense|gain.*persistency/.test(text)) return "Defense Evasion";
  if (/port.*scan|connect.*\d+.*host/.test(text)) return "Port Scan";
  if (/lateral.*movement/.test(text)) return "Lateral Movement";
  if (/phish|spear.*phish|bec|business.*email/.test(text)) return "Phishing";
  if (/brute.*force|credential.*stuff|password.*spray/.test(text)) return "Brute Force";
  if (/unauthorized.*access|privilege.*abuse/.test(text)) return "Unauthorized Access";
  if (/data.*exfiltration|dlp|data.*loss/.test(text)) return "Data Exfiltration";
  if (/sql.*inject|xss|cross.*site|waf/.test(text)) return "Web Application Attack";
  if (/cloud.*misconfig|s3.*public/.test(text)) return "Cloud Misconfiguration";
  if (/suspicious.*api|unusual.*api/.test(text)) return "Suspicious API Call";
  if (/suspicious.*cloud|cloud.*token/.test(text)) return "Suspicious Cloud Operation";
  if (/network.*intrusion|ids.*alert|ips.*alert|firewall.*block/.test(text)) return "Network Intrusion";
  return "Security Alert";
}

function generateIncidentsFromEvents(
  events: NormalizedSecurityEvent[],
  tenantId: number,
  allIOCs: IOCIndicator[]
): NormalizedIncident[] {
  const generated: NormalizedIncident[] = [];

  for (const event of events) {
    const sev = (event.severity || "medium").toLowerCase();
    if (sev === "info" || sev === "informational") continue;

    const incidentType = classifyIncidentTypeFromEvent(event);
    const title = event.threat || event.description || `${incidentType} detected on ${event.asset || "unknown"}`;
    const mitreInfo = event.mitreTactic ? MITRE_TACTIC_TECHNIQUE_MAP[event.mitreTactic] : null;

    const confidenceScore =
      event.riskScore ||
      (sev === "critical" ? 85 : sev === "high" ? 70 : sev === "medium" ? 55 : 35);

    const incident: NormalizedIncident = {
      title: title.substring(0, 500),
      description: event.description || title,
      severity: event.severity as any,
      source: event.logSource || event.sourceType || "Unknown",
      category: event.eventType || null,
      incidentType,
      sourceIp: event.attacker || null,
      destinationIp: null,
      affectedAssets: event.asset || event.target || null,
      actionTaken: event.action || "Detected",
      detectionSource: event.logSource || event.sourceType || null,
      recommendation: null,
      mitreTactic: event.mitreTactic || null,
      mitreTechniqueId: event.mitreTechnique || null,
      mitreTechnique: event.mitreTechnique || null,
      killChainPhase: mitreInfo?.killChainPhase || null,
      confidenceScore,
      classification:
        sev === "critical" || sev === "high" ? "true_positive" : "suspicious",
      iocData: allIOCs.length > 0 ? { indicators: allIOCs.slice(0, 20) } : null,
      occurredAt: parseEventTimestamp(event.occurredAt, event.rawPayload) || new Date(),
    } as any;

    generated.push(incident);
  }

  return generated;
}

export interface EnrichmentResult {
  batchId: number;
  eventsStored: number;
  incidentsCreated: number;
  iocCount: number;
  correlationsFound: number;
  errors: string[];
  stages: Record<string, { status: string; duration: number; details: any }>;
}

export async function runEnrichmentPipeline(
  batchId: number,
  tenantId: number,
  rawEvents: Record<string, any>[],
  options?: {
    skipNormalization?: boolean;
    skipEnrichment?: boolean;
    skipScoring?: boolean;
    skipCorrelation?: boolean;
    vendorHint?: string;
    integrationId?: number;
  }
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    batchId,
    eventsStored: 0,
    incidentsCreated: 0,
    iocCount: 0,
    correlationsFound: 0,
    errors: [],
    stages: {},
  };

  const progress: PipelineProgress = {
    batchId,
    stage: "queued",
    totalEvents: rawEvents.length,
    processedEvents: 0,
    errorCount: 0,
    errors: [],
    stageDetails: {},
  };

  console.log(`[Pipeline] Starting batch ${batchId}: ${rawEvents.length} raw event(s) for tenant ${tenantId}${options?.integrationId ? ` (integration ${options.integrationId})` : ""}${options?.skipNormalization ? " [skipNormalization=true]" : ""}`);

  try {
    progress.stage = "normalizing";
    emitProgress(progress);
    await storage.updateIngestBatch(batchId, { status: "normalizing" });

    let normResult: NormalizationResult;
    const normStart = Date.now();

    if (options?.skipNormalization) {
      normResult = {
        events: rawEvents.map(raw => {
          let eventType = raw.eventType || raw.event_type || "endpoint";
          
          let detectedLogSource = raw.logSource || raw.sourceType || null;
          let detectedSourceType = raw.sourceType || null;
          let detectedThreat = raw.threat || null;

          const payload = raw.rawPayload || raw;
          const hasCynetFields = payload.incidentName || payload.scanGroup || payload.hostRisk;
          if (hasCynetFields) {
            detectedLogSource = "Cynet 360";
            detectedSourceType = "Cynet 360";
            if (!detectedThreat && payload.incidentName) {
              detectedThreat = payload.incidentName;
            }
            eventType = classifyEventTypeFromCynet(raw);
          } else if ((raw.sourceType === "Cynet 360" || raw.logSource === "Cynet 360") && raw.rawPayload) {
            eventType = classifyEventTypeFromCynet(raw);
          }

          if (detectedLogSource && detectedLogSource.includes("tag_id")) {
            const parsed = parseTagBasedLogSource(detectedLogSource);
            if (parsed) {
              detectedLogSource = parsed.product;
              detectedSourceType = getSourceTypeFromEventType(eventType) || parsed.sourceType;
            }
          }
          
          return {
            eventType,
            severity: raw.severity || "medium",
            threat: detectedThreat,
            target: raw.target || null,
            attacker: raw.attacker || null,
            asset: raw.asset || null,
            app: raw.app || null,
            description: raw.description || null,
            threatVector: raw.threatVector || null,
            mitreTactic: raw.mitreTactic || null,
            mitreTechnique: raw.mitreTechnique || null,
            action: normalizeActionLabel(raw.action, detectedLogSource || raw.logSource || raw.sourceType) || null,
            sourceType: detectedSourceType || raw.sourceType || null,
            logSource: detectedLogSource || raw.logSource || null,
            sender: raw.sender || null,
            recipient: raw.recipient || null,
            protocol: raw.protocol || null,
            country: raw.country || null,
            riskScore: raw.riskScore ?? null,
            rawPayload: raw,
            occurredAt: raw.occurredAt ? new Date(raw.occurredAt) : new Date(),
          };
        }) as NormalizedSecurityEvent[],
        incidents: [],
        sourceType: "pre-normalized",
        vendor: null,
        totalProcessed: rawEvents.length,
        errors: [],
      };
    } else {
      normResult = await normalizeRawData(rawEvents, {
        vendorHint: options?.vendorHint,
      });
    }

    result.stages.normalization = {
      status: "complete",
      duration: Date.now() - normStart,
      details: {
        eventsNormalized: normResult.events.length,
        incidentsDetected: normResult.incidents.length,
        vendor: normResult.vendor,
        sourceType: normResult.sourceType,
        errors: normResult.errors,
      },
    };
    progress.processedEvents = normResult.totalProcessed;
    progress.stageDetails.normalization = result.stages.normalization;
    emitProgress(progress);

    if (normResult.errors.length > 0) {
      result.errors.push(...normResult.errors);
    }

    progress.stage = "enriching";
    emitProgress(progress);
    await storage.updateIngestBatch(batchId, { status: "enriching" });

    const enrichStart = Date.now();
    const allIOCs: IOCIndicator[] = [];
    const enrichedEvents: NormalizedSecurityEvent[] = [];
    const enrichedIncidents: NormalizedIncident[] = [];

    const allSigmaMatches = new Map<number, SigmaMatch[]>();

    if (!options?.skipEnrichment) {
      for (let i = 0; i < normResult.events.length; i++) {
        const event = normResult.events[i];
        const mitreEnrichment = enrichMITRE(event);
        event.mitreTactic = mitreEnrichment.mitreTactic || event.mitreTactic;
        event.mitreTechnique = mitreEnrichment.mitreTechnique || event.mitreTechnique;

        const entities = extractEntities(event.rawPayload || {});
        const iocs = extractAndScoreIOCs(entities, event);
        allIOCs.push(...iocs);

        const confidenceScore = calculateConfidenceScore(event, entities, iocs);
        event.riskScore = event.riskScore ?? confidenceScore;

        const incomingSigmaMatches = (event.rawPayload as any)?.sigmaMatches;
        let sigmaMatches: SigmaMatch[] = [];
        if (Array.isArray(incomingSigmaMatches) && incomingSigmaMatches.length > 0) {
          sigmaMatches = incomingSigmaMatches as SigmaMatch[];
        } else {
          sigmaMatches = matchEvent(event as Record<string, any>);
          if (sigmaMatches.length > 0 && event.rawPayload && typeof event.rawPayload === "object") {
            (event.rawPayload as any).sigmaMatches = sigmaMatches.map(m => ({
              ruleId: m.ruleId,
              ruleTitle: m.ruleTitle,
              severity: m.severity,
              mitreTactic: m.mitreTactic,
              mitreTechnique: m.mitreTechnique,
            }));
          }
        }
        if (sigmaMatches.length > 0) {
          allSigmaMatches.set(i, sigmaMatches);
          const SIGMA_SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
          const topMatch = [...sigmaMatches].sort(
            (a, b) => (SIGMA_SEV_RANK[b.severity] ?? 0) - (SIGMA_SEV_RANK[a.severity] ?? 0)
          )[0];
          if (!event.mitreTactic && topMatch.mitreTactic) {
            event.mitreTactic = topMatch.mitreTactic;
          }
          if (!event.mitreTechnique && topMatch.mitreTechnique) {
            event.mitreTechnique = topMatch.mitreTechnique;
          }
        }

        enrichedEvents.push(event);
      }

      for (const incident of normResult.incidents) {
        const mitreInfo = incident.mitreTactic ? MITRE_TACTIC_TECHNIQUE_MAP[incident.mitreTactic] : null;
        if (mitreInfo && !incident.killChainPhase) {
          incident.killChainPhase = mitreInfo.killChainPhase;
        }
        if (!incident.confidenceScore) {
          incident.confidenceScore = incident.severity === "critical" ? 85 : incident.severity === "high" ? 70 : 50;
        }
        enrichedIncidents.push(incident);
      }
    } else {
      enrichedEvents.push(...normResult.events);
      enrichedIncidents.push(...normResult.incidents);
    }

    result.iocCount = allIOCs.length;
    result.stages.enrichment = {
      status: "complete",
      duration: Date.now() - enrichStart,
      details: {
        eventsEnriched: enrichedEvents.length,
        incidentsEnriched: enrichedIncidents.length,
        iocCount: allIOCs.length,
        iocBreakdown: {
          ips: allIOCs.filter(i => i.type === "ip").length,
          domains: allIOCs.filter(i => i.type === "domain").length,
          hashes: allIOCs.filter(i => i.type === "hash").length,
          emails: allIOCs.filter(i => i.type === "email").length,
        },
        maliciousIndicators: allIOCs.filter(i => i.reputation === "malicious").length,
        suspiciousIndicators: allIOCs.filter(i => i.reputation === "suspicious").length,
      },
    };
    progress.stageDetails.enrichment = result.stages.enrichment;
    emitProgress(progress);

    progress.stage = "scoring";
    emitProgress(progress);
    await storage.updateIngestBatch(batchId, { status: "scoring" });

    const scoreStart = Date.now();
    const storedEventIds: number[] = [];

    const now = new Date();
    const eventInserts: InsertSecurityEvent[] = enrichedEvents.map((event, idx) => ({
      tenantId,
      eventType: event.eventType as any,
      severity: event.severity as any,
      threat: event.threat || null,
      target: event.target || null,
      attacker: event.attacker || null,
      asset: event.asset || null,
      app: event.app || null,
      description: event.description || null,
      threatVector: event.threatVector || null,
      mitreTactic: event.mitreTactic || null,
      mitreTechnique: event.mitreTechnique || null,
      action: normalizeActionLabel(event.action, event.logSource || event.sourceType) || null,
      sourceType: event.sourceType || null,
      logSource: event.logSource || null,
      sender: event.sender || null,
      recipient: event.recipient || null,
      protocol: event.protocol || null,
      country: event.country || null,
      riskScore: event.riskScore || null,
      rawPayload: event.rawPayload || {},
      pipelineStatus: "stored" as any,
      batchId,
      normalizedAt: now,
      enrichedAt: now,
      correlatedAt: now,
      storedAt: now,
      sigmaMatches: allSigmaMatches.get(idx) ? allSigmaMatches.get(idx)! : null,
      occurredAt: parseEventTimestamp(event.occurredAt, event.rawPayload) || new Date(),
      enrichedDescription: buildCynetEnrichedDescription(event),
    }));

    if (eventInserts.length > 0) {
      const batchSize = 500;
      const pipelineStart = Date.now();
      for (let i = 0; i < eventInserts.length; i += batchSize) {
        const batch = eventInserts.slice(i, i + batchSize);
        try {
          const stored = await storage.createSecurityEvents(batch);
          storedEventIds.push(...stored.map(e => e.id));
          result.eventsStored += stored.length;

          // CH dual-write is handled by storage.createSecurityEvents via chDualWrite().

          for (const ev of stored) {
            securityEventBus.emit("security_event", {
              id: ev.id,
              tenantId: ev.tenantId,
              eventType: ev.eventType,
              severity: ev.severity,
              threat: ev.threat,
              target: ev.target,
              attacker: ev.attacker,
              source: ev.logSource || ev.sourceType,
              occurredAt: ev.occurredAt?.toISOString?.() || new Date().toISOString(),
              description: ev.description,
            } as LiveSecurityEvent);
          }
        } catch (err: any) {
          console.error(`[Pipeline] Event storage batch error (batch ${batchId}, ${batch.length} events): ${err.message}`);
          for (const singleEvent of batch) {
            try {
              const stored = await storage.createSecurityEvents([singleEvent]);
              if (stored.length > 0) {
                storedEventIds.push(stored[0].id);
                result.eventsStored += 1;
                securityEventBus.emit("security_event", {
                  id: stored[0].id,
                  tenantId: stored[0].tenantId,
                  eventType: stored[0].eventType,
                  severity: stored[0].severity,
                  threat: stored[0].threat,
                  target: stored[0].target,
                  attacker: stored[0].attacker,
                  source: stored[0].logSource || stored[0].sourceType,
                  occurredAt: stored[0].occurredAt?.toISOString?.() || new Date().toISOString(),
                  description: stored[0].description,
                } as LiveSecurityEvent);
              }
            } catch (singleErr: any) {
              console.error(`[Pipeline] Single event storage failed: ${singleErr.message} — event: ${JSON.stringify({ tenantId: singleEvent.tenantId, eventType: singleEvent.eventType, logSource: singleEvent.logSource, threat: singleEvent.threat?.substring(0, 80) })}`);
              result.errors.push(`Event storage error: ${singleErr.message}`);
              progress.errorCount++;
            }
          }
        }
      }
      const pipelineDur = Date.now() - pipelineStart;
      if (eventInserts.length > 0) {
        const eventsPerSec = result.eventsStored > 0 ? (result.eventsStored / (pipelineDur / 1000)).toFixed(0) : "0";
        console.log(`[Pipeline] Stored ${result.eventsStored}/${eventInserts.length} events in ${pipelineDur}ms (${eventsPerSec} events/sec)`);
      }
      upsertCynetAssets(tenantId, enrichedEvents).catch(err =>
        console.error(`[Pipeline] Asset upsert failed: ${err.message}`)
      );
    }

    if (result.eventsStored === 0 && eventInserts.length > 0) {
      const zeroStoreMsg = `0/${eventInserts.length} events stored for batch ${batchId} — storage returned empty result (possible DB error or duplicate suppression)`;
      console.error(`[Pipeline] CRITICAL: ${zeroStoreMsg}`);
      result.errors.push(`Storage failure: ${zeroStoreMsg}`);
      enrichedIncidents.length = 0;
    } else {
      if (enrichedIncidents.length === 0 && enrichedEvents.length > 0) {
        console.log(`[Pipeline] Batch ${batchId}: No normalization incidents — running generateIncidentsFromEvents fallback for ${enrichedEvents.length} event(s) (skipNormalization=${options?.skipNormalization ?? false}, tenant ${tenantId})`);
        const autoIncidents = generateIncidentsFromEvents(enrichedEvents, tenantId, allIOCs);
        enrichedIncidents.push(...autoIncidents);
        if (autoIncidents.length === 0 && enrichedEvents.length > 0) {
          const sevCounts = enrichedEvents.reduce((acc: Record<string, number>, e) => {
            const sev = (e.severity || "unknown").toLowerCase();
            acc[sev] = (acc[sev] || 0) + 1;
            return acc;
          }, {});
          console.log(`[Pipeline] Batch ${batchId}: generateIncidentsFromEvents produced 0 incidents — severity breakdown of ${enrichedEvents.length} events: ${JSON.stringify(sevCounts)} (info/informational severity events are skipped; all others generate incidents)`);
        } else {
          console.log(`[Pipeline] Batch ${batchId}: Auto-generated ${autoIncidents.length} incident(s) from ${enrichedEvents.length} event(s) via fallback (tenant ${tenantId})`);
        }
      }
    }

    console.log(`[Pipeline] Batch ${batchId}: ${result.eventsStored} events stored → ${enrichedIncidents.length} candidate incidents for tenant ${tenantId}`);

    const existingHashes = await (storage as any).getExistingDedupHashes?.(tenantId) || new Set<string>();
    let duplicatesSkipped = 0;
    for (const incident of enrichedIncidents) {
      try {
        const dedupHash = generateDedupHash(incident, tenantId);
        if (existingHashes.has(dedupHash)) {
          duplicatesSkipped++;
          continue;
        }

        const incidentData: InsertIncident = {
          tenantId,
          title: incident.title || "Security Incident",
          description: incident.description || null,
          severity: incident.severity as any,
          source: incident.source || null,
          category: incident.category || null,
          incidentType: incident.incidentType || null,
          sourceIp: incident.sourceIp || null,
          destinationIp: incident.destinationIp || null,
          actionTaken: incident.actionTaken || null,
          detectionSource: incident.detectionSource || null,
          affectedAssets: incident.affectedAssets || null,
          recommendation: incident.recommendation || null,
          mitreTactic: incident.mitreTactic || null,
          mitreTechniqueId: incident.mitreTechniqueId || null,
          mitreTechnique: incident.mitreTechnique || null,
          killChainPhase: incident.killChainPhase || null,
          confidenceScore: incident.confidenceScore || null,
          classification: incident.classification || "suspicious",
          iocData: incident.iocData || (allIOCs.length > 0 ? { indicators: allIOCs.slice(0, 20) } : null),
          dedupHash,
        };

        const createdIncident = await storage.createIncident(incidentData);
        result.incidentsCreated++;
        existingHashes.add(dedupHash);
        if (createdIncident?.id) {
          enrichIncidentAfterCreation(createdIncident.id, tenantId, 5000);
        }
      } catch (err: any) {
        result.errors.push(`Incident creation error: ${err.message}`);
        progress.errorCount++;
      }
    }

    console.log(`[Pipeline] Batch ${batchId}: Created ${result.incidentsCreated} incidents, skipped ${duplicatesSkipped} duplicates`);

    result.stages.scoring = {
      status: "complete",
      duration: Date.now() - scoreStart,
      details: {
        eventsStored: result.eventsStored,
        incidentsCreated: result.incidentsCreated,
        duplicatesSkipped,
      },
    };
    progress.processedEvents = result.eventsStored;
    progress.stageDetails.scoring = result.stages.scoring;
    emitProgress(progress);

    progress.stage = "correlating";
    emitProgress(progress);
    await storage.updateIngestBatch(batchId, { status: "correlating" });

    const corrStart = Date.now();
    let correlationsFound = 0;

    if (!options?.skipCorrelation) {
      try {
        const uniqueAssets = new Set(enrichedEvents.map(e => e.asset).filter(Boolean));
        const uniqueIPs = new Set([
          ...enrichedEvents.map(e => e.attacker).filter(Boolean),
          ...enrichedEvents.map(e => e.target).filter(Boolean),
        ]);
        const uniqueUsers = new Set<string>();
        for (const event of enrichedEvents) {
          if (event.sender) uniqueUsers.add(event.sender);
          if (event.recipient) uniqueUsers.add(event.recipient);
        }

        const crossSourceMap = new Map<string, Set<string>>();
        for (const event of enrichedEvents) {
          const source = event.logSource || event.sourceType || "unknown";
          const identifiers = [event.asset, event.attacker, event.target, event.sender].filter(Boolean);
          for (const id of identifiers) {
            if (!id) continue;
            if (!crossSourceMap.has(id)) crossSourceMap.set(id, new Set());
            crossSourceMap.get(id)!.add(source);
          }
        }

        crossSourceMap.forEach((sources, identifier) => {
          if (sources.size > 1) {
            correlationsFound++;
          }
        });

        const sigmaCorrelations = detectCorrelationPatterns(
          enrichedEvents as Record<string, any>[],
          allSigmaMatches
        );

        for (const pattern of sigmaCorrelations) {
          correlationsFound++;
          try {
            const dedupHash = crypto.createHash("sha256")
              .update(`${tenantId}|sigma-correlation|${pattern.patternName}|${pattern.events.map(e => (e as any).asset || (e as any).attacker || "").join(",")}`)
              .digest("hex");

            const existingHashCheck = await (storage as any).getExistingDedupHashes?.(tenantId) || new Set<string>();
            if (!existingHashCheck.has(dedupHash)) {
              // Extract real host/asset data from the pattern
              const patternEntity = pattern.entity;
              const rawAssets = pattern.events.map((e: any) => e.asset || e.target || e.attacker || e.sender).filter((v: any) => v && v !== "unknown");
              const uniqueAssets = [...new Set(rawAssets)] as string[];
              const affectedAssetsStr = uniqueAssets.length > 0 ? uniqueAssets.slice(0, 10).join(", ") : (patternEntity && patternEntity !== "unknown" ? patternEntity : undefined);
              const sourceIpVal = (pattern.sourceIps || []).find((v: string) => v && v !== "unknown") || undefined;
              const destIpVal = (pattern.destinationIps || []).find((v: string) => v && v !== "unknown") || undefined;

              // Build a meaningful title including entity when known
              const entitySuffix = patternEntity && patternEntity !== "unknown" ? ` — ${patternEntity}` : "";
              const incidentTitle = `[Sigma] ${pattern.patternName}${entitySuffix}`;

              // Build unique entity list for iocData
              const affectedEntities = uniqueAssets.map((ent: string) => {
                const evts = pattern.events.filter((e: any) => (e.asset || e.target || e.attacker || e.sender) === ent);
                return {
                  entity: ent,
                  eventCount: evts.length,
                  tactics: [...new Set(evts.flatMap((e: any) => (e.mitreTactic ? [e.mitreTactic] : [])))],
                };
              });

              const incidentData: InsertIncident = {
                tenantId,
                title: incidentTitle,
                description: pattern.description,
                severity: pattern.severity as any,
                source: "Sigma Correlation Engine",
                category: "correlation",
                incidentType: pattern.patternName,
                mitreTactic: pattern.mitreTactic,
                confidenceScore: pattern.confidence,
                classification: "suspicious",
                dedupHash,
                affectedAssets: affectedAssetsStr,
                sourceIp: sourceIpVal,
                destinationIp: destIpVal,
                iocData: {
                  sigmaPattern: pattern.patternName,
                  sigmaMatches: pattern.sigmaMatches.map(m => ({
                    ruleId: m.ruleId,
                    ruleTitle: m.ruleTitle,
                    severity: m.severity,
                  })),
                  eventCount: pattern.events.length,
                  affectedEntities,
                  tactics: pattern.tactics || [],
                },
              };
              const createdSigmaInc = await storage.createIncident(incidentData);
              result.incidentsCreated++;
              if (createdSigmaInc?.id) {
                enrichIncidentAfterCreation(createdSigmaInc.id, tenantId, 5000);
              }
            }
          } catch (err: any) {
            result.errors.push(`Sigma correlation incident error: ${err.message}`);
          }
        }

        result.correlationsFound = correlationsFound;
      } catch (err: any) {
        result.errors.push(`Correlation error: ${err.message}`);
      }
    }

    result.stages.correlation = {
      status: "complete",
      duration: Date.now() - corrStart,
      details: {
        correlationsFound,
        crossSourceEntities: correlationsFound,
        sigmaMatchedEvents: allSigmaMatches.size,
        sigmaMatchTotal: Array.from(allSigmaMatches.values()).reduce((sum, m) => sum + m.length, 0),
      },
    };
    progress.stageDetails.correlation = result.stages.correlation;
    emitProgress(progress);

    if (result.incidentsCreated > 0) {
      try {
        const recentIncidents = await pool.query(
          `SELECT id, title, description, severity, source, mitre_tactic, mitre_technique, ioc_data, sigma_matches
           FROM incidents WHERE tenant_id = $1 AND sigma_matches IS NOT NULL
           ORDER BY created_at DESC LIMIT 5`,
          [tenantId]
        );

        for (const inc of recentIncidents.rows) {
          if (inc.severity === "critical" || inc.severity === "high") {
            const sigmaContext = inc.sigma_matches || [];
            const iocContext = inc.ioc_data || {};

            const contextualAnalysis = {
              analyzedAt: new Date().toISOString(),
              entityHistory: {
                relatedIncidents: recentIncidents.rows.length,
                timespan: "current_batch",
              },
              sigmaContext: Array.isArray(sigmaContext) ? sigmaContext.map((m: any) => ({
                rule: m.ruleTitle || m.ruleId,
                severity: m.severity,
                mitre: m.mitreTactic,
              })) : [],
              riskFactors: [
                inc.severity === "critical" ? "Critical severity detection" : null,
                sigmaContext.length > 1 ? "Multiple Sigma rule matches" : null,
                iocContext?.indicators?.length > 0 ? "IOC indicators present" : null,
              ].filter(Boolean),
              businessImpact: inc.severity === "critical" ? "high" : "medium",
              recommendedActions: [
                "Investigate affected assets immediately",
                "Check for lateral movement indicators",
                "Review related log sources for corroboration",
              ],
            };

            const threatNarrative = generateThreatNarrative(inc, sigmaContext, iocContext);

            await pool.query(
              `UPDATE incidents SET contextual_analysis = $1, threat_narrative = $2, updated_at = NOW() WHERE id = $3`,
              [JSON.stringify(contextualAnalysis), threatNarrative, inc.id]
            );
          }
        }
      } catch (ctxErr: any) {
        result.errors.push(`Contextual intelligence error: ${ctxErr.message}`);
      }
    }

    progress.stage = "complete";
    progress.errorCount = result.errors.length;
    progress.errors = result.errors.slice(0, 20);
    emitProgress(progress);

    console.log(`[Pipeline] Batch ${batchId} complete: ${result.eventsStored} events → ${result.incidentsCreated} incidents, ${result.iocCount} IOCs, ${result.correlationsFound} correlations, ${result.errors.length} errors`);

    await storage.updateIngestBatch(batchId, {
      status: "complete",
      processedEvents: result.eventsStored,
      errorCount: result.errors.length,
      completedAt: new Date(),
      metadata: {
        stages: result.stages,
        iocCount: result.iocCount,
        incidentsCreated: result.incidentsCreated,
        correlationsFound: result.correlationsFound,
      },
    });

    if (result.incidentsCreated > 0) {
      try {
        const { autoInvestigateCriticalIncidents } = await import("./ai-soc-analyst");
        autoInvestigateCriticalIncidents(tenantId).then(count => {
          if (count > 0) console.log(`[AI SOC] Auto-investigated ${count} critical/high incidents for tenant ${tenantId}`);
        }).catch(err => {
          console.error(`[AI SOC] Auto-investigation error: ${err.message}`);
        });
      } catch {}
    }

    return result;

  } catch (error: any) {
    progress.stage = "failed";
    progress.errors.push(error.message);
    emitProgress(progress);

    result.errors.push(`Pipeline failed: ${error.message}`);
    result.stages.failure = {
      status: "failed",
      duration: 0,
      details: { error: error.message },
    };

    try {
      for (const rawEvent of rawEvents.slice(0, 100)) {
        await storage.createDlqEntry({
          tenantId,
          rawPayload: rawEvent,
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 2000),
          pipelineStage: progress.stage || "unknown",
          retryCount: 0,
          maxRetries: 3,
          status: "failed",
          batchId,
        });
      }
      console.log(`[DLQ] Saved ${Math.min(rawEvents.length, 100)} events to dead letter queue for batch ${batchId}`);
    } catch (dlqErr: any) {
      console.error(`[DLQ] Failed to save to DLQ: ${dlqErr.message}`);
    }

    try {
      await storage.updateIngestBatch(batchId, {
        status: "failed",
        errorCount: result.errors.length,
        completedAt: new Date(),
        metadata: {
          error: error.message,
          stages: result.stages,
        },
      });
    } catch {}

    return result;
  }
}

export async function runPipelineAsync(
  batchId: number,
  tenantId: number,
  rawEvents: Record<string, any>[],
  options?: {
    skipNormalization?: boolean;
    skipEnrichment?: boolean;
    skipScoring?: boolean;
    skipCorrelation?: boolean;
    vendorHint?: string;
    integrationId?: number;
  }
): Promise<void> {
  if (options?.integrationId) {
    try {
      const integration = await storage.getSecurityIntegration(options.integrationId);
      if (integration && integration.tenantId !== tenantId) {
        const mismatchMsg = `Tenant mismatch: pipeline called with tenantId=${tenantId} but integration ${options.integrationId} belongs to tenant ${integration.tenantId}. Events will not be attributed to the correct tenant.`;
        console.error(`[Pipeline] TENANT MISMATCH for batch ${batchId}: ${mismatchMsg}`);
        await storage.updateSecurityIntegration(options.integrationId, {
          lastPollStatus: "error",
          lastPollMessage: mismatchMsg,
        }).catch(() => {});
        return;
      }
    } catch (lookupErr: any) {
      console.warn(`[Pipeline] Could not verify integration tenant for batch ${batchId}: ${lookupErr.message}`);
    }
  }

  runEnrichmentPipeline(batchId, tenantId, rawEvents, options).then(result => {
    if (result.errors.length > 0 && options?.integrationId) {
      const errorSummary = result.errors.slice(0, 3).join("; ");
      storage.updateSecurityIntegration(options.integrationId, {
        lastPollStatus: result.eventsStored > 0 ? "success" : "error",
        lastPollMessage:
          result.eventsStored > 0
            ? `Stored ${result.eventsStored} event(s), ${result.incidentsCreated} incident(s) created — ${result.errors.length} pipeline warning(s): ${errorSummary}`
            : `Pipeline error — 0 events stored: ${errorSummary}`,
      }).catch(updateErr => {
        console.error(`[Pipeline] Failed to write error status to integration ${options.integrationId}:`, updateErr);
      });
    } else if (options?.integrationId) {
      if (result.eventsStored > 0) {
        storage.updateSecurityIntegration(options.integrationId, {
          lastPollStatus: "success",
          lastPollMessage: `Pipeline complete — ${result.eventsStored} event(s) stored, ${result.incidentsCreated} incident(s) created`,
        }).catch(() => {});
        import("./integration-autoheal.js").then(({ onIntegrationSuccess }) => {
          onIntegrationSuccess(options.integrationId!).catch(() => {});
        }).catch(() => {});
      } else {
        const schemaMsg = `Pipeline finished but 0 events were stored — check storage layer or event schema compatibility`;
        storage.updateSecurityIntegration(options.integrationId, {
          lastPollStatus: "error",
          lastPollMessage: schemaMsg,
        }).catch(() => {});
        import("./integration-autoheal.js").then(({ onIntegrationFailure }) => {
          onIntegrationFailure(options.integrationId!, schemaMsg).catch(() => {});
        }).catch(() => {});
      }
    }

    // ── Real-time Attack Detection — trigger detection on newly ingested events ──
    if (result.eventsStored > 0) {
      const eventsToDetect = Math.min(result.eventsStored, 20);
      import("./attack-detection-pipeline.js").then(({ runBatchDetectionPipeline }) => {
        runBatchDetectionPipeline(tenantId, eventsToDetect).then(detResult => {
          if (detResult.detected > 0) {
            console.log(`[DetectionPipeline] Post-ingest detection (tenant ${tenantId}): processed=${detResult.processed}, detected=${detResult.detected}, chained=${detResult.chained}`);
          }
        }).catch((e: any) => console.warn(`[DetectionPipeline] Post-ingest detection error (tenant ${tenantId}):`, e.message));
      }).catch(() => {});
    }
  }).catch(err => {
    console.error(`[Pipeline] Fatal failure for batch ${batchId} (tenant ${tenantId}):`, err);
    if (options?.integrationId) {
      const fatalMsg = `Pipeline failed: ${(err as Error).message || "Unknown error"}`;
      storage.updateSecurityIntegration(options.integrationId, {
        lastPollStatus: "error",
        lastPollMessage: fatalMsg,
      }).catch(updateErr => {
        console.error(`[Pipeline] Failed to write fatal error to integration ${options.integrationId}:`, updateErr);
      });
      import("./integration-autoheal.js").then(({ onIntegrationFailure }) => {
        onIntegrationFailure(options.integrationId!, fatalMsg).catch(() => {});
      }).catch(() => {});
    }
  });
}

export async function runPostImportCorrelation(
  tenantId: number,
  storedEvents: Array<{
    id: number;
    tenantId: number;
    eventType: string;
    severity: string;
    threat: string | null;
    target: string | null;
    attacker: string | null;
    logSource: string | null;
    sourceType: string | null;
    description: string | null;
    occurredAt: Date | null;
    sender: string | null;
    recipient: string | null;
    asset: string | null;
    mitreTactic?: string | null;
    mitreTechnique?: string | null;
    rawPayload?: any;
  }>,
  source: string
): Promise<void> {
  try {
    console.log(`[PostImport] Running post-import correlation for ${storedEvents.length} ${source} events (tenant ${tenantId})`);

    for (const ev of storedEvents) {
      securityEventBus.emit("security_event", {
        id: ev.id,
        tenantId: ev.tenantId,
        eventType: ev.eventType,
        severity: ev.severity,
        threat: ev.threat,
        target: ev.target,
        attacker: ev.attacker,
        source: ev.logSource || ev.sourceType,
        occurredAt: ev.occurredAt?.toISOString?.() || new Date().toISOString(),
        description: ev.description,
      } as LiveSecurityEvent);
    }
    console.log(`[PostImport] Emitted ${storedEvents.length} events to live dashboard feed`);

    let sigmaMatchCount = 0;
    const sigmaUpdates: Array<{ id: number; matches: any[] }> = [];
    for (const ev of storedEvents) {
      try {
        const matches = matchEvent(ev as any);
        if (matches.length > 0) {
          sigmaMatchCount += matches.length;
          sigmaUpdates.push({
            id: ev.id,
            matches: matches.map(m => ({
              ruleId: m.ruleId,
              ruleTitle: m.ruleTitle,
              severity: m.severity,
              mitreTactic: m.mitreTactic,
              mitreTechnique: m.mitreTechnique,
            })),
          });
        }
      } catch {}
    }

    if (sigmaUpdates.length > 0) {
      for (const upd of sigmaUpdates) {
        try {
          await pool.query(
            `UPDATE security_events SET sigma_matches = $1 WHERE id = $2`,
            [JSON.stringify(upd.matches), upd.id]
          );
        } catch {}
      }
      console.log(`[PostImport] Sigma: ${sigmaMatchCount} rule matches across ${sigmaUpdates.length} events`);
    }

    const crossSourceMap = new Map<string, Set<string>>();
    for (const ev of storedEvents) {
      const src = ev.logSource || ev.sourceType || "unknown";
      const identifiers = [ev.asset, ev.attacker, ev.target, ev.sender].filter(Boolean);
      for (const id of identifiers) {
        if (!id) continue;
        if (!crossSourceMap.has(id)) crossSourceMap.set(id, new Set());
        crossSourceMap.get(id)!.add(src);
      }
    }
    let crossSourceCorrelations = 0;
    crossSourceMap.forEach((sources) => {
      if (sources.size > 1) crossSourceCorrelations++;
    });
    if (crossSourceCorrelations > 0) {
      console.log(`[PostImport] Found ${crossSourceCorrelations} cross-source entity correlations`);
    }

    console.log(`[PostImport] ${source} post-import correlation complete`);
  } catch (err: any) {
    console.error(`[PostImport] Post-import correlation error: ${err.message}`);
  }
}

function normalizeEventForSigma(event: Record<string, any>): Record<string, any> {
  const normalized = { ...event };
  const raw = event.raw_payload || event.rawPayload || {};
  const logSource = event.log_source || event.logSource || "";

  if (logSource.includes("Checkpoint") || raw.dataType === "checkpoint_hec") {
    normalized.subject = raw.subject || raw.emailSubject || "";
    normalized.senderAddress = raw.senderAddress || raw.sender || event.sender || "";
    normalized.recipientAddress = raw.recipientAddress || raw.recipient || event.recipient || "";
    normalized.verdict = raw.verdictCategory || raw.verdict || raw.action || event.action || "";
    normalized.messageId = raw.messageId || "";
    normalized.attachmentNames = raw.attachmentNames || raw.attachments || "";
    normalized.senderDomain = normalized.senderAddress?.split("@")[1] || "";
    normalized.eventCategory = "email";
    normalized.product = "Checkpoint Harmony Email";
  } else if (logSource.includes("Skyhigh") || raw.dataType === "cloud_activity") {
    normalized.userName = raw.userName || raw.user || event.sender || "";
    normalized.serviceName = raw.serviceName || raw.application || event.app || "";
    normalized.sourceIp = raw.sourceIp || event.attacker || "";
    normalized.country = raw.country || event.country || "";
    normalized.isShadowIT = raw.isShadowIT || false;
    normalized.activityType = raw.activityType || raw.action || event.action || "";
    normalized.eventCategory = "cloud";
    normalized.product = "Skyhigh Security SSE";
  } else if (logSource.includes("Cynet") || raw.dataType === "endpoint") {
    normalized.hostname = raw.Name || raw.hostname || event.asset || "";
    normalized.processName = raw.ProcessName || raw.process_name || "";
    normalized.filePath = raw.FilePath || raw.file_path || "";
    normalized.commandLine = raw.CommandLine || raw.command_line || "";
    normalized.parentProcess = raw.ParentProcessName || raw.parent_process || "";
    normalized.agentVersion = raw.AgentVersion || raw.agent_version || "";
    normalized.eventCategory = "endpoint";
    normalized.product = "Cynet 360";
  }

  return normalized;
}

export async function runSigmaEnrichmentOnExistingEvents(): Promise<{ processed: number; matched: number; matchCount: number }> {
  const BATCH_SIZE = 500;
  let totalProcessed = 0;
  let totalEventsMatched = 0;
  let totalMatchCount = 0;

  try {
    const countResult = await pool.query(`SELECT COUNT(*)::int as cnt FROM security_events WHERE sigma_matches IS NULL`);
    const total = countResult.rows[0]?.cnt || 0;
    if (total === 0) {
      console.log("[SigmaEnrich] No events need Sigma enrichment");
      return { processed: 0, matched: 0, matchCount: 0 };
    }
    console.log(`[SigmaEnrich] Starting Sigma enrichment for ${total} events...`);

    let lastId = 0;
    while (true) {
      const batch = await pool.query(
        `SELECT id, tenant_id, event_type, severity, threat, target, attacker, asset, app, description,
                log_source, sender, recipient, country, action, mitre_tactic, mitre_technique,
                raw_payload, occurred_at
         FROM security_events
         WHERE sigma_matches IS NULL AND id > $1
         ORDER BY id ASC LIMIT $2`,
        [lastId, BATCH_SIZE]
      );

      if (batch.rows.length === 0) break;

      const updates: Array<{ id: number; matches: any[]; mitreTactic?: string; mitreTechnique?: string }> = [];

      for (const row of batch.rows) {
        const normalized = normalizeEventForSigma(row);
        const matches = matchEvent(normalized);

        if (matches.length > 0) {
          totalMatchCount += matches.length;
          totalEventsMatched++;
          const topMatch = matches[0];
          updates.push({
            id: row.id,
            matches: matches.map(m => ({
              ruleId: m.ruleId,
              ruleTitle: m.ruleTitle,
              severity: m.severity,
              mitreTactic: m.mitreTactic,
              mitreTechnique: m.mitreTechnique,
              matchedKeywords: m.matchedKeywords,
              confidence: m.confidence,
            })),
            mitreTactic: !row.mitre_tactic && topMatch.mitreTactic ? topMatch.mitreTactic : undefined,
            mitreTechnique: !row.mitre_technique && topMatch.mitreTechnique ? topMatch.mitreTechnique : undefined,
          });
        }

        lastId = row.id;
      }

      if (updates.length > 0) {
        for (const upd of updates) {
          try {
            let query = `UPDATE security_events SET sigma_matches = $1, enriched_at = NOW()`;
            const params: any[] = [JSON.stringify(upd.matches)];
            let paramIdx = 2;
            if (upd.mitreTactic) {
              query += `, mitre_tactic = $${paramIdx++}`;
              params.push(upd.mitreTactic);
            }
            if (upd.mitreTechnique) {
              query += `, mitre_technique = $${paramIdx++}`;
              params.push(upd.mitreTechnique);
            }
            query += ` WHERE id = $${paramIdx}`;
            params.push(upd.id);
            await pool.query(query, params);
          } catch {}
        }
      }

      const noMatchIds = batch.rows
        .filter(r => !updates.find(u => u.id === r.id))
        .map(r => r.id);
      if (noMatchIds.length > 0) {
        await pool.query(
          `UPDATE security_events SET sigma_matches = '[]'::jsonb, enriched_at = NOW() WHERE id = ANY($1)`,
          [noMatchIds]
        );
      }

      totalProcessed += batch.rows.length;
      if (totalProcessed % 2000 === 0) {
        console.log(`[SigmaEnrich] Progress: ${totalProcessed}/${total} events, ${totalEventsMatched} matched`);
      }
    }

    console.log(`[SigmaEnrich] Complete: ${totalProcessed} events processed, ${totalEventsMatched} events matched, ${totalMatchCount} total rule matches`);
    return { processed: totalProcessed, matched: totalEventsMatched, matchCount: totalMatchCount };
  } catch (err: any) {
    console.error(`[SigmaEnrich] Error: ${err.message}`);
    return { processed: totalProcessed, matched: totalEventsMatched, matchCount: totalMatchCount };
  }
}

export async function fixNumericActionCodes(): Promise<{ updated: number }> {
  try {
    const result = await pool.query(`
      UPDATE security_events 
      SET action = CASE action
        WHEN '0' THEN 'Unknown'
        WHEN '1' THEN 'Detected'
        WHEN '2' THEN 'Blocked'
        WHEN '3' THEN 'Quarantined'
        WHEN '4' THEN 'Remediated'
        WHEN '5' THEN 'Allowed'
        WHEN '6' THEN 'Isolated'
        WHEN '7' THEN 'Killed'
        WHEN '8' THEN 'Deleted'
        WHEN '9' THEN 'Restored'
        WHEN '10' THEN 'Reported'
        ELSE 'Action Code ' || action
      END
      WHERE action ~ '^[0-9]+$'
    `);
    const updated = result.rowCount || 0;
    if (updated > 0) {
      console.log(`[ActionFix] Updated ${updated} events with numeric action codes to human-readable labels`);
    }
    return { updated };
  } catch (err: any) {
    console.error(`[ActionFix] Error fixing numeric action codes: ${err.message}`);
    return { updated: 0 };
  }
}

export async function fixCynetEventLabels(): Promise<{ updated: number }> {
  try {
    const result = await pool.query(`
      UPDATE security_events 
      SET 
        log_source = 'Cynet 360',
        source_type = 'Cynet 360',
        threat = COALESCE(NULLIF(threat, ''), raw_payload->>'incidentName')
      WHERE tenant_id = 35
        AND raw_payload IS NOT NULL
        AND (
          raw_payload->>'incidentName' IS NOT NULL
          OR raw_payload->>'scanGroup' IS NOT NULL
          OR raw_payload->>'hostRisk' IS NOT NULL
        )
        AND (log_source != 'Cynet 360' OR source_type != 'Cynet 360' OR (threat IS NULL OR threat = ''))
    `);
    const updated = result.rowCount || 0;
    if (updated > 0) {
      console.log(`[CynetFix] Updated ${updated} Aspire events: log_source → Cynet 360, threat → real incidentName from raw_payload`);
    }
    return { updated };
  } catch (err: any) {
    console.error(`[CynetFix] Error fixing Cynet event labels: ${err.message}`);
    return { updated: 0 };
  }
}

export function parseTagBasedLogSource(logSource: string): { product: string; sourceType: string } | null {
  if (!logSource || !logSource.includes("tag_id")) return null;

  const DS_TAG_MAP: Record<string, { product: string; defaultSourceType: string }> = {
    "PANW/XDR Agent": { product: "Palo Alto Cortex XDR", defaultSourceType: "Endpoint Protection" },
    "Amazon/AWS": { product: "Amazon AWS CloudTrail", defaultSourceType: "Cloud Security" },
    "Microsoft/Azure": { product: "Microsoft Azure", defaultSourceType: "Cloud Security" },
    "CrowdStrike/Falcon": { product: "CrowdStrike Falcon", defaultSourceType: "Endpoint Protection" },
  };

  const dsMatch = logSource.match(/DS:([^'",}\]]+)/);
  if (dsMatch) {
    const dsValue = dsMatch[1].trim();
    const mapped = DS_TAG_MAP[dsValue];
    if (mapped) return { product: mapped.product, sourceType: mapped.defaultSourceType };
    const parts = dsValue.split("/");
    if (parts.length >= 2) {
      return { product: `${parts[0]} ${parts.slice(1).join(" ")}`, sourceType: "Security" };
    }
    return { product: dsValue, sourceType: "Security" };
  }

  return null;
}

export function getSourceTypeFromEventType(eventType: string): string {
  const mapping: Record<string, string> = {
    endpoint: "Endpoint Protection",
    network: "Network Security",
    vulnerability: "Vulnerability Management",
    cloud: "Cloud Security",
    identity: "Identity & Access",
    email: "Email Security",
    waf: "Web Application Security",
    dlp: "Data Loss Prevention",
  };
  return mapping[eventType] || "Security";
}

export async function fixFedfinaCortexXDR(): Promise<{ updated: number }> {
  try {
    const panwResult = await pool.query(`
      UPDATE security_events 
      SET 
        log_source = 'Palo Alto Cortex XDR',
        source_type = CASE event_type
          WHEN 'endpoint' THEN 'Endpoint Protection'
          WHEN 'network' THEN 'Network Security'
          WHEN 'vulnerability' THEN 'Vulnerability Management'
          WHEN 'cloud' THEN 'Cloud Security'
          WHEN 'identity' THEN 'Identity & Access'
          WHEN 'email' THEN 'Email Security'
          WHEN 'waf' THEN 'Web Application Security'
          ELSE 'Endpoint Protection'
        END
      WHERE tenant_id = 34
        AND log_source LIKE '%PANW/XDR%'
    `);
    const panwUpdated = panwResult.rowCount || 0;

    const awsResult = await pool.query(`
      UPDATE security_events 
      SET 
        log_source = 'Amazon AWS CloudTrail',
        source_type = CASE event_type
          WHEN 'cloud' THEN 'Cloud Security'
          WHEN 'identity' THEN 'Identity & Access'
          WHEN 'network' THEN 'Network Security'
          ELSE 'Cloud Security'
        END
      WHERE tenant_id = 34
        AND log_source LIKE '%Amazon/AWS%'
        AND log_source NOT LIKE '%PANW/XDR%'
    `);
    const awsUpdated = awsResult.rowCount || 0;

    const totalUpdated = panwUpdated + awsUpdated;
    if (totalUpdated > 0) {
      console.log(`[CortexXDRFix] Updated Fedfina events: ${panwUpdated} → Palo Alto Cortex XDR, ${awsUpdated} → Amazon AWS CloudTrail`);
    }
    return { updated: totalUpdated };
  } catch (err: any) {
    console.error(`[CortexXDRFix] Error fixing Fedfina Cortex XDR labels: ${err.message}`);
    return { updated: 0 };
  }
}

export const FAKE_SENDER_DOMAINS = [
  'paypal-secure.com', 'microsoft-verify.net', 'amazon-orders.info',
  'bankofamerica-alert.com', 'company-internal.org', 'coopers-promo.com',
  'quickbooks-billing.net', 'dropbox-share.org', 'fedex-tracking.info',
  'benefits-enrollment.com', 'docusign-verify.net', 'techdeals-daily.com',
  'apple-id-verify.com', 'netflix-account.info', 'chase-alerts.net',
];
export const FAKE_RECIPIENT_DOMAINS = [
  'initech.com', 'globex.net', 'acme-corp.com', 'umbrella-sec.org',
  'northwind.co.za', 'contoso.com', 'fabrikam.net', 'woodgrove.com',
];
export const ALL_FAKE_DOMAINS = [...FAKE_SENDER_DOMAINS, ...FAKE_RECIPIENT_DOMAINS];

async function batchDelete(table: string, column: string, ids: number[], batchSize = 100): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const result = await pool.query(`DELETE FROM ${table} WHERE ${column} IN (${batch.join(',')})`);
    total += result.rowCount || 0;
  }
  return total;
}

export async function purgeSimulatedData(): Promise<{ eventsDeleted: number; incidentsDeleted: number }> {
  const senderConditions = FAKE_SENDER_DOMAINS.map(d => `attacker LIKE '%@${d}'`).join(' OR ');
  const recipientConditions = FAKE_RECIPIENT_DOMAINS.map(d => `target LIKE '%@${d}'`).join(' OR ');

  const fakeEventsResult = await pool.query(`
    SELECT id FROM security_events
    WHERE (log_source IN ('Checkpoint HEC', 'Checkpoint Harmony Email', 'Check Point Harmony Email'))
      AND (${senderConditions} OR ${recipientConditions})
  `);
  const fakeEventIds = fakeEventsResult.rows.map((r: any) => r.id);
  let eventsDeleted = 0;
  if (fakeEventIds.length > 0) {
    eventsDeleted = await batchDelete('security_events', 'id', fakeEventIds);
  }

  const domainMatchTitle = ALL_FAKE_DOMAINS.map(d => `title LIKE '%${d}%'`).join(' OR ');
  const domainMatchDesc = ALL_FAKE_DOMAINS.map(d => `description LIKE '%${d}%'`).join(' OR ');

  const fakeIncidents = await pool.query(`
    SELECT id FROM incidents
    WHERE (
      (title LIKE '%Phishing email from%' OR title LIKE '%Malicious email from%'
       OR title LIKE '%Spam email from%' OR title LIKE '%Suspected phishing from%'
       OR title LIKE '%Checkpoint%' OR title LIKE '%Check Point%' OR title LIKE '%Harmony Email%'
       OR title = '[Sigma] Multi-Stage Attack')
      AND (${domainMatchTitle} OR ${domainMatchDesc})
    )
  `);
  const fakeIncidentIds = fakeIncidents.rows.map((r: any) => r.id);

  let incidentsDeleted = 0;
  if (fakeIncidentIds.length > 0) {
    const aiInvRows = await pool.query(`SELECT id FROM ai_investigations WHERE incident_id IN (${fakeIncidentIds.join(',')})`);
    const aiInvIds = aiInvRows.rows.map((r: any) => r.id);
    if (aiInvIds.length > 0) {
      await batchDelete('incident_notifications', 'investigation_id', aiInvIds);
      await batchDelete('analyst_feedback', 'investigation_id', aiInvIds);
    }
    await batchDelete('incident_notifications', 'incident_id', fakeIncidentIds);
    await batchDelete('analyst_feedback', 'incident_id', fakeIncidentIds);
    await batchDelete('ai_investigations', 'incident_id', fakeIncidentIds);
    incidentsDeleted = await batchDelete('incidents', 'id', fakeIncidentIds);
  }

  return { eventsDeleted, incidentsDeleted };
}

export async function cleanupSimulatedCheckpointEvents(): Promise<{ deleted: number }> {
  try {
    const { eventsDeleted, incidentsDeleted } = await purgeSimulatedData();
    if (eventsDeleted > 0 || incidentsDeleted > 0) {
      console.log(`[SimulatedCleanup] Removed ${eventsDeleted} simulated Checkpoint events and ${incidentsDeleted} related incidents (with dependent records)`);
    }
    return { deleted: eventsDeleted + incidentsDeleted };
  } catch (err: any) {
    console.error(`[SimulatedCleanup] Error cleaning up simulated Checkpoint events: ${err.message}`);
    return { deleted: 0 };
  }
}

export function getPipelineStages(): { id: PipelineStage; label: string; description: string }[] {
  return [
    { id: "queued", label: "Queued", description: "Batch received, waiting to be processed" },
    { id: "normalizing", label: "Normalizing", description: "AI-powered data normalization and vendor detection" },
    { id: "enriching", label: "Enriching", description: "MITRE ATT&CK mapping, IOC extraction, and reputation scoring" },
    { id: "scoring", label: "Scoring", description: "Storing events and calculating risk scores" },
    { id: "correlating", label: "Correlating", description: "Cross-source entity correlation analysis" },
    { id: "complete", label: "Complete", description: "Pipeline processing finished successfully" },
    { id: "failed", label: "Failed", description: "Pipeline encountered an error" },
  ];
}

const TACTIC_TO_KILL_CHAIN: Record<string, string> = {
  "Reconnaissance": "Reconnaissance",
  "Resource Development": "Weaponization",
  "Initial Access": "Delivery",
  "Execution": "Exploitation",
  "Persistence": "Installation",
  "Privilege Escalation": "Exploitation",
  "Defense Evasion": "Exploitation",
  "Credential Access": "Exploitation",
  "Discovery": "Exploitation",
  "Lateral Movement": "Installation",
  "Collection": "Actions on Objectives",
  "Command and Control": "Command & Control",
  "Exfiltration": "Actions on Objectives",
  "Impact": "Actions on Objectives",
};

export function extractIOCsFromText(text: string, rawPayload?: any, affectedAssets?: string): { type: string; value: string; reputation: string; source: string }[] {
  const iocs: { type: string; value: string; reputation: string; source: string }[] = [];
  const seen = new Set<string>();

  const add = (type: string, value: string, reputation = "suspicious", source = "auto-extracted") => {
    const key = `${type}:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      iocs.push({ type, value, reputation, source });
    }
  };

  const rawPayloadStr = rawPayload ? JSON.stringify(rawPayload) : "";
  const allText = [text, rawPayloadStr, affectedAssets || ""].join(" ");

  const ipRegex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
  const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|xyz|ru|cn|tk|info|biz|co|uk|de|fr|nl|br|in)\b/gi;
  const md5Regex = /\b[a-fA-F0-9]{32}\b/g;
  const sha1Regex = /\b[a-fA-F0-9]{40}\b/g;
  const sha256Regex = /\b[a-fA-F0-9]{64}\b/g;
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const hostnameRegex = /\b([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\s+(?:was|has|is|reported|accessed|connected|detected)|\s*[,;])/g;

  const PRIVATE_IPS = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0$|255\.255\.255\.255$)/;
  const LEGITIMATE_DOMAINS = /^(microsoft|google|amazon|windows|apple|cloudflare|adobe)\./i;
  const COMMON_DOMAINS = /^(en\.wikipedia|www\.microsoft|update\.microsoft|windowsupdate|ocsp\.)/i;
  const GENERIC_WORDS = new Set(["the", "and", "with", "from", "this", "that", "for", "was", "has", "not", "are", "were"]);

  for (const ip of allText.matchAll(ipRegex)) {
    if (!PRIVATE_IPS.test(ip[0])) add("ip", ip[0], "suspicious");
  }
  for (const domain of allText.matchAll(domainRegex)) {
    if (!LEGITIMATE_DOMAINS.test(domain[0]) && !COMMON_DOMAINS.test(domain[0])) {
      add("domain", domain[0].toLowerCase(), "suspicious");
    }
  }
  for (const hash of allText.matchAll(sha256Regex)) add("hash", hash[0].toLowerCase(), "suspicious");
  for (const hash of allText.matchAll(sha1Regex)) {
    if (!seen.has(`hash:${hash[0].toLowerCase()}`)) add("hash", hash[0].toLowerCase(), "suspicious");
  }
  for (const hash of allText.matchAll(md5Regex)) {
    if (!seen.has(`hash:${hash[0].toLowerCase()}`)) add("hash", hash[0].toLowerCase(), "suspicious");
  }
  for (const email of allText.matchAll(emailRegex)) {
    add("email", email[0].toLowerCase(), "suspicious");
  }

  if (affectedAssets) {
    const hostnames = affectedAssets.split(",").map(h => h.trim()).filter(h => h.length > 2 && h.length < 64 && !h.includes("@") && !h.includes("http"));
    for (const hostname of hostnames) {
      if (!GENERIC_WORDS.has(hostname.toLowerCase())) {
        add("hostname", hostname, "suspicious", "affected-assets");
      }
    }
  }

  if (rawPayload) {
    const extractHostnames = (obj: any, depth = 0): void => {
      if (depth > 3 || !obj) return;
      if (typeof obj === "string") {
        if (obj.length > 2 && obj.length < 64 && /^[A-Za-z0-9]/.test(obj) && !obj.includes("@") && !obj.includes("/") && !obj.includes(" ")) {
          if ((obj.includes("-") || /[A-Z]/.test(obj.slice(1))) && !GENERIC_WORDS.has(obj.toLowerCase())) {
            add("hostname", obj, "suspicious", "raw-payload");
          }
        }
        return;
      }
      if (typeof obj === "object" && !Array.isArray(obj)) {
        const hostnameKeys = ["hostname", "host", "computerName", "deviceName", "computer_name", "device_name", "asset", "endpoint", "machine"];
        for (const key of hostnameKeys) {
          if (obj[key] && typeof obj[key] === "string" && obj[key].length > 2 && obj[key].length < 64) {
            if (!GENERIC_WORDS.has(obj[key].toLowerCase())) add("hostname", obj[key], "suspicious", "raw-payload");
          }
        }
        for (const val of Object.values(obj)) extractHostnames(val, depth + 1);
      }
      if (Array.isArray(obj)) {
        for (const item of obj.slice(0, 5)) extractHostnames(item, depth + 1);
      }
    };
    extractHostnames(rawPayload);
  }

  return iocs.slice(0, 20);
}

export async function enrichIncidentAfterCreation(incidentId: number, tenantId: number, delayMs = 5000): Promise<void> {
  setTimeout(async () => {
    try {
      const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
      if (!rows.length) return;
      const incident = rows[0];

      const updates: Record<string, any> = {};

      let tactic = incident.mitreTactic || null;
      let techniqueId = incident.mitreTechniqueId || null;
      let killChain = incident.killChainPhase || null;

      if (!tactic && incident.sigmaMatches) {
        const sigmas = incident.sigmaMatches as any[];
        if (Array.isArray(sigmas) && sigmas.length > 0) {
          const topSigma = sigmas.sort((a: any, b: any) => {
            const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
            return (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0);
          })[0];
          tactic = topSigma.mitreTactic || null;
          techniqueId = topSigma.mitreTechnique || topSigma.mitreTechniqueId || null;
        }
      }

      if (!tactic) {
        const syntheticEvent: Record<string, any> = {
          title: incident.title || "",
          description: incident.description || "",
          threat: incident.title || "",
          asset: incident.affectedAssets?.split(",")[0]?.trim() || "",
          attacker: (incident as any).sourceIp || "",
          target: (incident as any).destinationIp || incident.affectedAssets?.split(",")[0]?.trim() || "",
          eventType: incident.category || incident.type || "incident",
          severity: incident.severity || "medium",
          logSource: incident.detectionSource || incident.source || "",
        };
        try {
          const sigmaMatches = matchEvent(syntheticEvent);
          if (sigmaMatches.length > 0) {
            const topMatch = sigmaMatches.sort((a: any, b: any) => {
              const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
              return (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0);
            })[0];
            tactic = (topMatch as any).mitreTactic || null;
            techniqueId = (topMatch as any).mitreTechnique || (topMatch as any).mitreTechniqueId || null;
            if (sigmaMatches.length > 0 && !incident.sigmaMatches) {
              updates.sigmaMatches = sigmaMatches.slice(0, 10);
            }
          }
        } catch (_sigmaErr) {}
      }

      if (!tactic) {
        const titleLower = (incident.title || "").toLowerCase();
        if (titleLower.includes("lateral") || titleLower.includes("pass-the-hash") || titleLower.includes("mimikatz")) {
          tactic = "Lateral Movement"; techniqueId = "T1550";
        } else if (titleLower.includes("ransomware") || titleLower.includes("encrypt")) {
          tactic = "Impact"; techniqueId = "T1486";
        } else if (titleLower.includes("phish") || titleLower.includes("spear")) {
          tactic = "Initial Access"; techniqueId = "T1566";
        } else if (titleLower.includes("brute") || titleLower.includes("credential") || titleLower.includes("password spray")) {
          tactic = "Credential Access"; techniqueId = "T1110";
        } else if (titleLower.includes("exfil") || titleLower.includes("data transfer") || titleLower.includes("upload")) {
          tactic = "Exfiltration"; techniqueId = "T1041";
        } else if (titleLower.includes("c2") || titleLower.includes("command") || titleLower.includes("c&c") || titleLower.includes("beacon")) {
          tactic = "Command and Control"; techniqueId = "T1071";
        } else if (titleLower.includes("persistence") || titleLower.includes("scheduled task") || titleLower.includes("registry")) {
          tactic = "Persistence"; techniqueId = "T1053";
        } else if (titleLower.includes("escalat") || titleLower.includes("privilege") || titleLower.includes("admin")) {
          tactic = "Privilege Escalation"; techniqueId = "T1548";
        } else if (titleLower.includes("recon") || titleLower.includes("scan") || titleLower.includes("enumerat")) {
          tactic = "Discovery"; techniqueId = "T1082";
        } else if (titleLower.includes("malware") || titleLower.includes("dropper") || titleLower.includes("payload")) {
          tactic = "Execution"; techniqueId = "T1059";
        } else if (titleLower.includes("evad") || titleLower.includes("obfuscat") || titleLower.includes("bypass")) {
          tactic = "Defense Evasion"; techniqueId = "T1027";
        }
      }

      if (tactic && !killChain) {
        killChain = TACTIC_TO_KILL_CHAIN[tactic] || null;
      }

      if (tactic !== incident.mitreTactic) updates.mitreTactic = tactic;
      if (techniqueId !== incident.mitreTechniqueId) updates.mitreTechniqueId = techniqueId;
      if (killChain !== incident.killChainPhase) updates.killChainPhase = killChain;

      const contextText = [incident.title || "", incident.description || ""].join(" ");
      const contextRaw = (incident as any).rawPayload;
      const newIOCs = extractIOCsFromText(contextText, contextRaw, incident.affectedAssets || undefined);
      if (newIOCs.length > 0 && !incident.iocData) {
        try {
          const { loadOpenCTIConfig, lookupOpenCTIIOC } = await import("./opencti-connector");
          const octiConfig = await loadOpenCTIConfig();
          const enriched = await Promise.all(
            newIOCs.map(async (ioc) => {
              if (!octiConfig) return ioc;
              try {
                const octiMatch = await lookupOpenCTIIOC(octiConfig, ioc.value, ioc.type);
                if (octiMatch) {
                  // Persist attribution context to opencti_ioc_context table
                  pool.query(
                    `INSERT INTO opencti_ioc_context
                      (ioc_value, ioc_type, stix_id, actor_name, actor_stix_id,
                       campaign_name, campaign_stix_id, malware_family, malware_stix_id,
                       confidence, score, incident_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                     ON CONFLICT DO NOTHING`,
                    [
                      ioc.value, ioc.type, octiMatch.stixId ?? null,
                      octiMatch.actorName ?? null, octiMatch.actorStixId ?? null,
                      octiMatch.campaignName ?? null, octiMatch.campaignStixId ?? null,
                      octiMatch.malwareFamily ?? null, octiMatch.malwareStixId ?? null,
                      octiMatch.confidence ?? 70, octiMatch.score ?? 0,
                      incidentId,
                    ]
                  ).catch((dbErr: Error) => console.warn(`[IncidentEnrich] opencti_ioc_context insert: ${dbErr.message}`));
                  return { ...ioc, reputation: "malicious" as const, source: `opencti:${octiMatch.source || "live"}` };
                }
              } catch (lookupErr: unknown) {
                console.warn(`[IncidentEnrich] OpenCTI lookup failed for ${ioc.value}:`, lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
              }
              return ioc;
            })
          );
          updates.iocData = { indicators: enriched };
        } catch (enrichErr: unknown) {
          console.warn(`[IncidentEnrich] OpenCTI enrichment block failed:`, enrichErr instanceof Error ? enrichErr.message : String(enrichErr));
          updates.iocData = { indicators: newIOCs };
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(incidents).set({ ...updates, updatedAt: new Date() }).where(eq(incidents.id, incidentId));
      }

      if (incident.triageScore == null) {
        try {
          const { scoreIncidentInBackground } = await import("./ai-triage-engine");
          await scoreIncidentInBackground(incidentId);
        } catch (_triageErr: any) {
          console.error(`[IncidentEnrich] AI triage failed for ${incidentId}: ${_triageErr.message}`);
        }
      }

      await buildBehavioralContext(incidentId, tenantId, incident.affectedAssets || null);

      const isEmailIncident = (incident.source || "").toLowerCase().includes("checkpoint") ||
        (incident.source || "").toLowerCase().includes("email") ||
        (incident.category || "").toLowerCase().includes("email") ||
        (incident.detectionSource || "").toLowerCase().includes("checkpoint") ||
        (incident.detectionSource || "").toLowerCase().includes("hec");
      if (isEmailIncident) {
        await enrichEmailIntelligence(incidentId, incident);
      }

    } catch (err: any) {
      console.error(`[IncidentEnrich] Failed to enrich incident ${incidentId}: ${err.message}`);
    }
  }, delayMs);
}

export interface EmailIntelligenceResult {
  socialEngineeringScore: number;
  detectedTactics: string[];
  hiddenAttackAssessment: string;
  domainReputationFlags: string[];
  escalationRecommended: boolean;
  reasoning: string;
  parsedSubject?: string;
  parsedSender?: string;
  parsedRecipient?: string;
  authStatus?: {
    spf: string | null;
    dkim: string | null;
    dmarc: string | null;
  };
}

async function enrichEmailIntelligence(incidentId: number, incident: any): Promise<void> {
  try {
    const existingAnalysis = incident.contextualAnalysis as any;
    if (existingAnalysis?.emailIntelligence) return;

    const rawPayload = incident.rawPayload || incident.raw_payload || {};
    const meta = rawPayload._meta || {};
    const rawEventPayload = rawPayload.rawPayload || rawPayload;

    const subject = meta.subject
      || rawEventPayload?.additionalData?.subject
      || rawEventPayload?.additionalData?.emailSubject
      || incident.description?.match(/Subject:\s*(.+?)(?:\n|$)/)?.[1]?.trim()
      || incident.title?.replace(/^(Spam|Graymail|Phishing|BEC|Malware)\s*:?\s*/i, "").trim()
      || "";

    const senderEmail = meta.senderDomain
      ? (rawEventPayload?.additionalData?.senderAddress || rawEventPayload?.additionalData?.sender || incident.sourceIp || "unknown@" + meta.senderDomain)
      : (incident.sourceIp || "");

    const senderDomain = meta.senderDomain || (senderEmail.includes("@") ? senderEmail.split("@")[1] : "");

    const actionTaken = meta.actions?.map((a: any) => a.actionType || a.action).filter(Boolean).join(", ")
      || rawPayload.action
      || incident.actionTaken
      || "";

    const confidenceIndicator = meta.confidenceIndicator || rawPayload.confidenceIndicator || "";
    const saas = meta.saas || rawPayload.saas || "";
    const eventType = meta.eventType || "";

    const spf = meta.spf || null;
    const dkim = meta.dkim || null;
    const dmarc = meta.dmarc || null;

    const authFailures = [
      spf === "fail" ? "SPF fail" : null,
      dkim === "fail" ? "DKIM fail" : null,
      dmarc === "fail" ? "DMARC fail" : null,
    ].filter(Boolean).join(", ");

    const prompt = `You are an expert email security AI analyst for a SOC platform. Analyze this email security event and assess whether it contains social engineering, hidden attacks, or indicators of compromise beyond the tool's classification.

Email Event Details:
- Event Type: ${eventType || "email"}
- Subject Line: "${subject || "N/A"}"
- Sender Domain: ${senderDomain || "unknown"}
- Platform/SaaS: ${saas || "N/A"}
- Tool Action Taken: ${actionTaken || "Detected only"}
- Tool Confidence Indicator: ${confidenceIndicator || "N/A"}
- SPF/DKIM/DMARC: ${authFailures || "Not available"}
- Incident Severity: ${incident.severity || "medium"}

Key Analysis Points:
1. Even if the tool classifies this as "spam" or "graymail" and only adds a header, analyze the subject for hidden attack intent
2. Look for: urgency manipulation, authority impersonation, celebrity bait, financial lures, BEC grooming, credential harvesting setup
3. A "Header Added (Delivered)" action means the email REACHED the inbox — assess real risk to recipient
4. Consider whether domain reputation, subject line patterns, and auth failures together indicate an active campaign

Respond ONLY with this JSON (no explanation outside JSON):
{
  "socialEngineeringScore": <integer 0-100, where 0=benign marketing, 50=suspicious, 80+=clear attack>,
  "detectedTactics": ["<tactic1>", "<tactic2>"],
  "hiddenAttackAssessment": "<2-3 sentence assessment of whether this is a hidden attack or benign. Be specific about the subject line content.>",
  "domainReputationFlags": ["<flag1>", "<flag2>"],
  "escalationRecommended": <true if socialEngineeringScore >= 65 OR auth failures present with suspicious content>,
  "reasoning": "<1-2 sentence summary of the key signals that drove this assessment>"
}`;

    const { createAIClient, getDefaultModel } = await import("./ai-provider");
    const ai = createAIClient();
    const res = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const result: EmailIntelligenceResult = {
      socialEngineeringScore: Math.max(0, Math.min(100, parseInt(parsed.socialEngineeringScore) || 30)),
      detectedTactics: Array.isArray(parsed.detectedTactics) ? parsed.detectedTactics : [],
      hiddenAttackAssessment: parsed.hiddenAttackAssessment || "No specific attack pattern identified.",
      domainReputationFlags: Array.isArray(parsed.domainReputationFlags) ? parsed.domainReputationFlags : [],
      escalationRecommended: Boolean(parsed.escalationRecommended),
      reasoning: parsed.reasoning || "",
      parsedSubject: subject || undefined,
      parsedSender: senderEmail || undefined,
      authStatus: (spf !== null || dkim !== null || dmarc !== null) ? { spf, dkim, dmarc } : undefined,
    };

    const existingCtx = (incident.contextualAnalysis as Record<string, any>) || {};
    const updatedCtx = { ...existingCtx, emailIntelligence: result };

    await db.update(incidents)
      .set({ contextualAnalysis: updatedCtx, updatedAt: new Date() })
      .where(eq(incidents.id, incidentId));

    if (result.escalationRecommended && incident.mitreTactic === "Reconnaissance") {
      await db.update(incidents)
        .set({
          mitreTactic: "Initial Access",
          mitreTechniqueId: "T1566",
          killChainPhase: "Delivery",
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, incidentId));
    }

    console.log(`[EmailIntel] Enriched incident ${incidentId}: SE score=${result.socialEngineeringScore}, escalate=${result.escalationRecommended}, tactics=${result.detectedTactics.join(",")||"none"}`);
  } catch (err: any) {
    console.error(`[EmailIntel] Failed to enrich email intelligence for incident ${incidentId}: ${err.message}`);
  }
}

async function buildBehavioralContext(incidentId: number, tenantId: number, affectedAssets: string | null): Promise<void> {
  try {
    if (!affectedAssets) return;
    const hostnames = affectedAssets.split(",").map(h => h.trim()).filter(Boolean);
    if (hostnames.length === 0) return;

    const since30d = new Date(Date.now() - 30 * 24 * 3600000);
    const since7d = new Date(Date.now() - 7 * 24 * 3600000);

    const [eventRows, userActivityRows, recentUserRows] = await Promise.all([
      pool.query(
        `SELECT asset, occurred_at, event_type, severity, attacker FROM security_events
         WHERE tenant_id = $1 AND occurred_at >= $2 AND asset = ANY($3) LIMIT 500`,
        [tenantId, since30d, hostnames]
      ),
      pool.query(
        `SELECT attacker, COUNT(*) as event_count
         FROM security_events
         WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at < $3 AND asset = ANY($4)
           AND attacker IS NOT NULL AND attacker != ''
         GROUP BY attacker ORDER BY event_count DESC LIMIT 10`,
        [tenantId, since30d, since7d, hostnames]
      ),
      pool.query(
        `SELECT attacker, COUNT(*) as event_count
         FROM security_events
         WHERE tenant_id = $1 AND occurred_at >= $2 AND asset = ANY($3)
           AND attacker IS NOT NULL AND attacker != ''
         GROUP BY attacker ORDER BY event_count DESC LIMIT 10`,
        [tenantId, since7d, hostnames]
      ),
    ]);

    const eventCount = eventRows.rows.length;
    const baselinePerDay = eventCount / 30;

    const recentRows = await pool.query(
      `SELECT id, title, affected_assets, created_at FROM incidents
       WHERE tenant_id = $1 AND id != $2
         AND affected_assets IS NOT NULL
         AND created_at >= $3
       ORDER BY created_at DESC LIMIT 50`,
      [tenantId, incidentId, since30d]
    );
    const relatedIncidentIds: number[] = recentRows.rows
      .filter((r: any) => {
        const assets = (r.affected_assets || "").split(",").map((h: string) => h.trim());
        return hostnames.some(h => assets.includes(h));
      })
      .slice(0, 10)
      .map((r: any) => r.id);

    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<string, number> = {};
    for (const row of eventRows.rows) {
      const d = new Date(row.occurred_at);
      const hr = d.getHours();
      const dayKey = d.toISOString().slice(0, 10);
      hourCounts[hr] = (hourCounts[hr] || 0) + 1;
      dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
    }
    const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const peakWindow = peakHour ? `${peakHour[0]}:00–${(Number(peakHour[0]) + 1) % 24}:00` : null;

    const dayCountValues = Object.values(dayCounts);
    const dayCountSorted = [...dayCountValues].sort((a, b) => b - a);
    const maxDayCount = dayCountSorted[0] ?? 0;
    const medianDayCount = dayCountSorted[Math.floor(dayCountSorted.length / 2)] ?? 0;
    const spikeMultiplier = medianDayCount > 0 ? Math.round((maxDayCount / medianDayCount) * 10) / 10 : null;
    const spikeDetected = spikeMultiplier !== null && spikeMultiplier >= 3;

    const baselineUsers = new Set<string>(userActivityRows.rows.map((r: any) => r.attacker));
    const recentUsers = recentUserRows.rows.map((r: any) => ({ user: r.attacker, eventCount: Number(r.event_count) }));
    const newUsers = recentUsers.filter(u => !baselineUsers.has(u.user));
    const userAnomalyDetected = newUsers.length > 0;
    const userAnomalySummary = userAnomalyDetected
      ? `${newUsers.length} new user${newUsers.length > 1 ? "s" : ""} active in last 7d not seen in prior 30d baseline: ${newUsers.slice(0, 3).map(u => u.user).join(", ")}`
      : recentUsers.length > 0
        ? `${recentUsers.length} known user${recentUsers.length > 1 ? "s" : ""} active on these assets in last 7d`
        : "No user activity recorded on affected assets";

    const anomalySummary = spikeDetected
      ? `Activity spike detected: peak day had ${maxDayCount} events (${spikeMultiplier}x above median of ${medianDayCount})${userAnomalyDetected ? "; " + userAnomalySummary : ""}`
      : userAnomalyDetected
        ? userAnomalySummary
        : baselinePerDay > 0
          ? `Normal activity pattern across ${Object.keys(dayCounts).length} active days in 30-day window`
          : "Insufficient historical data for anomaly baseline";

    const behavioralContext = {
      totalEvents30d: eventCount,
      baselineEventsPerDay: Math.round(baselinePerDay * 10) / 10,
      relatedIncidentIds,
      peakActivityWindow: peakWindow,
      analyzedHostnames: hostnames,
      spikeDetected,
      spikeMultiplier,
      maxEventsInDay: maxDayCount,
      medianEventsPerDay: medianDayCount,
      userAnomalyDetected,
      newUsersDetected: newUsers.slice(0, 5).map(u => u.user),
      recentActiveUsers: recentUsers.slice(0, 5).map(u => u.user),
      anomalySummary,
      generatedAt: new Date().toISOString(),
    };

    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!rows.length) return;
    const current = rows[0];
    const existing = (current.contextualAnalysis as any) || {};
    await db.update(incidents).set({
      contextualAnalysis: { ...existing, behavioralContext },
      updatedAt: new Date(),
    }).where(eq(incidents.id, incidentId));
  } catch (err: any) {
    console.error(`[BehavioralCtx] Failed for incident ${incidentId}: ${err.message}`);
  }
}

export async function backfillAssetsFromEventData(): Promise<void> {
  try {
    const tenantRows = await pool.query(
      `SELECT id FROM tenants WHERE type = 'customer'`
    );
    const customerTenantIds: number[] = tenantRows.rows.map((r: any) => r.id);

    for (const tenantId of customerTenantIds) {
      const assetCount = await pool.query(
        `SELECT COUNT(*) as cnt FROM assets WHERE tenant_id = $1`,
        [tenantId]
      );
      const cnt = parseInt(assetCount.rows[0]?.cnt || "0");
      if (cnt > 0) continue;

      // Skip backfill for tenants with active security integrations — those tenants get
      // authoritative, complete asset records from the integration sync (e.g. Cynet 360,
      // CrowdStrike). Running event backfill on top would create incomplete duplicates.
      const integrationCheck = await pool.query(
        `SELECT COUNT(*) as cnt FROM security_integrations WHERE tenant_id = $1 AND status = 'connected'`,
        [tenantId]
      );
      const intCnt = parseInt(integrationCheck.rows[0]?.cnt || "0");
      if (intCnt > 0) {
        console.log(`[AssetBackfill] Tenant ${tenantId} has ${intCnt} active integration(s) — skipping event backfill (integration sync will handle assets)`);
        continue;
      }

      console.log(`[AssetBackfill] Tenant ${tenantId} has 0 assets — scanning events/incidents...`);

      const eventRows = await pool.query(
        `SELECT asset, target, attacker,
                MAX(raw_payload->>'HostIp') as host_ip,
                MAX(raw_payload->'_cynetMeta'->>'osVersion') as os_version,
                MAX(raw_payload->>'source_type') as source_type,
                log_source,
                MAX(occurred_at) as last_seen
         FROM security_events
         WHERE tenant_id = $1 AND (asset IS NOT NULL OR target IS NOT NULL)
         GROUP BY asset, target, attacker, log_source
         LIMIT 200`,
        [tenantId]
      );

      const incidentRows = await pool.query(
        `SELECT DISTINCT affected_assets, created_at FROM incidents
         WHERE tenant_id = $1 AND affected_assets IS NOT NULL
         ORDER BY created_at DESC LIMIT 100`,
        [tenantId]
      );

      const hostMap = new Map<string, { ip: string | null; os: string | null; lastSeen: Date }>();

      for (const row of eventRows.rows) {
        const hostname = row.asset || row.target;
        if (!hostname || hostname.length < 2 || hostname.includes("@") || hostname.includes("http")) continue;
        const existing = hostMap.get(hostname);
        const ls = row.last_seen ? new Date(row.last_seen) : new Date();
        if (!existing || ls > existing.lastSeen) {
          hostMap.set(hostname, {
            ip: row.host_ip || (row.attacker?.match(/^\d+\.\d+\.\d+\.\d+$/) ? row.attacker : null),
            os: row.os_version || null,
            lastSeen: ls,
          });
        }
      }

      for (const row of incidentRows.rows) {
        const hostnames = (row.affected_assets as string).split(",").map((h: string) => h.trim()).filter(Boolean);
        for (const hostname of hostnames) {
          if (!hostname || hostname.length < 2 || hostname.includes("@") || hostname.includes("http")) continue;
          if (!hostMap.has(hostname)) {
            hostMap.set(hostname, { ip: null, os: null, lastSeen: new Date(row.created_at) });
          }
        }
      }

      let upserted = 0;
      for (const [hostname, entry] of hostMap.entries()) {
        try {
          await pool.query(
            `INSERT INTO assets (tenant_id, hostname, ip_address, operating_system, last_seen, status, source, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'active', 'event_backfill', NOW())
             ON CONFLICT ON CONSTRAINT uq_assets_tenant_hostname
             DO UPDATE SET
               ip_address = COALESCE(EXCLUDED.ip_address, assets.ip_address),
               operating_system = COALESCE(EXCLUDED.operating_system, assets.operating_system),
               last_seen = COALESCE(GREATEST(EXCLUDED.last_seen, assets.last_seen), EXCLUDED.last_seen, assets.last_seen),
               status = 'active',
               updated_at = NOW()`,
            [tenantId, hostname, entry.ip, entry.os, entry.lastSeen]
          );
          upserted++;
        } catch (err: any) {
          console.error(`[AssetBackfill] Upsert failed for ${hostname}: ${err.message}`);
        }
      }

      if (upserted > 0) console.log(`[AssetBackfill] Tenant ${tenantId}: upserted ${upserted} assets from event/incident data`);
    }
  } catch (err: any) {
    console.error(`[AssetBackfill] Error: ${err.message}`);
  }
}

export async function backfillUnenrichedIncidents(): Promise<void> {
  try {
    const { scoreIncidentInBackground } = await import("./ai-triage-engine");

    const rows = await pool.query(
      `SELECT id, tenant_id, title, severity, description, mitre_tactic, mitre_technique_id,
              source_ip, destination_ip, ioc_data, confidence_score, affected_assets,
              sigma_matches, triage_score, kill_chain_phase, contextual_analysis
       FROM incidents
       WHERE triage_score IS NULL OR ioc_data IS NULL OR kill_chain_phase IS NULL
       ORDER BY created_at DESC
       LIMIT 50`
    );

    let enriched = 0;
    for (const row of rows.rows) {
      try {
        const updates: Record<string, any> = {};

        let tactic = row.mitre_tactic;
        let techniqueId = row.mitre_technique_id;
        let killChain = row.kill_chain_phase;

        if (!tactic && row.sigma_matches) {
          const sigmas = (typeof row.sigma_matches === "string" ? JSON.parse(row.sigma_matches) : row.sigma_matches) as any[];
          if (Array.isArray(sigmas) && sigmas.length > 0) {
            const top = sigmas.sort((a: any, b: any) => {
              const ord: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
              return (ord[b.severity] || 0) - (ord[a.severity] || 0);
            })[0];
            tactic = top.mitreTactic || null;
            techniqueId = top.mitreTechnique || top.mitreTechniqueId || null;
          }
        }

        if (tactic && !killChain) {
          killChain = TACTIC_TO_KILL_CHAIN[tactic] || null;
        }

        if (tactic !== row.mitre_tactic) updates.mitre_tactic = tactic;
        if (techniqueId !== row.mitre_technique_id) updates.mitre_technique_id = techniqueId;
        if (killChain !== row.kill_chain_phase) updates.kill_chain_phase = killChain;

        if (!row.ioc_data) {
          const contextText = [row.title || "", row.description || ""].join(" ");
          const newIOCs = extractIOCsFromText(contextText, undefined, row.affected_assets || undefined);
          if (newIOCs.length > 0) updates.ioc_data = JSON.stringify({ indicators: newIOCs });
        }

        if (Object.keys(updates).length > 0) {
          const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
          await pool.query(
            `UPDATE incidents SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
            [row.id, ...Object.values(updates)]
          );
        }

        if (!row.triage_score) {
          await scoreIncidentInBackground(row.id);
        }

        if (row.affected_assets && !((row.contextual_analysis as any)?.behavioralContext)) {
          await buildBehavioralContext(row.id, row.tenant_id, row.affected_assets);
        }

        enriched++;
      } catch (err: any) {
        console.error(`[IncidentBackfill] Incident ${row.id}: ${err.message}`);
      }
    }

    if (enriched > 0) console.log(`[IncidentBackfill] Enriched ${enriched} incidents (MITRE/IOC/KillChain/Triage/Behavioral)`);
  } catch (err: any) {
    console.error(`[IncidentBackfill] Error: ${err.message}`);
  }
}

export async function bootstrapTenantHierarchy(): Promise<void> {
  try {
    const tenantRows = await pool.query(
      `SELECT id, type, parent_id, name FROM tenants ORDER BY id`
    );
    const allTenants: { id: number; type: string; parentId: number | null; name: string }[] = tenantRows.rows.map((r: any) => ({
      id: r.id, type: r.type, parentId: r.parent_id, name: r.name,
    }));

    const msspRoots = allTenants.filter(t => t.type === "mssp" && t.parentId === null);
    const msspChildren = allTenants.filter(t => t.type === "mssp" && t.parentId !== null);
    const validMsspIds = new Set(allTenants.filter(t => t.type === "mssp").map(t => t.id));

    const preferredRoot = msspRoots.find(t => t.id === 30) ?? msspRoots[0];

    let fixed = 0;

    for (const tenant of msspChildren) {
      if (tenant.parentId !== null && !validMsspIds.has(tenant.parentId)) {
        if (preferredRoot) {
          await pool.query(
            `UPDATE tenants SET parent_id = $1 WHERE id = $2`,
            [preferredRoot.id, tenant.id]
          );
          console.log(`[TenantHierarchy] Orphaned MSSP tenant ${tenant.id} (${tenant.name}) → parent ${preferredRoot.id}`);
          fixed++;
        }
      }
    }

    if (preferredRoot) {
      const rootId = preferredRoot.id;
      const result = await pool.query(
        `UPDATE tenants
         SET parent_id = $1
         WHERE type = 'mssp'
           AND parent_id IS NULL
           AND id != $1
           AND id IN (32, 36)`,
        [rootId]
      );
      if (result.rowCount && result.rowCount > 0) {
        fixed += result.rowCount;
        console.log(`[TenantHierarchy] Fixed ${result.rowCount} MSSP child(ren) → parent ${rootId}`);
      }
    }

    const orphanedCustomers = allTenants.filter(t => {
      if (t.type !== "customer") return false;
      if (t.parentId === null) return true;
      return !validMsspIds.has(t.parentId);
    });
    for (const tenant of orphanedCustomers) {
      if (preferredRoot) {
        await pool.query(
          `UPDATE tenants SET parent_id = $1 WHERE id = $2`,
          [preferredRoot.id, tenant.id]
        );
        console.log(`[TenantHierarchy] Orphaned customer ${tenant.id} (${tenant.name}) → parent ${preferredRoot.id}`);
        fixed++;
      }
    }

    if (fixed === 0) {
      console.log(`[TenantHierarchy] Hierarchy validated — no orphaned tenants found`);
    }
  } catch (err: any) {
    console.error(`[TenantHierarchy] Error: ${err.message}`);
  }
}
