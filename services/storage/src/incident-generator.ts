import crypto from "crypto";
import type { EventRecord } from "./event-writer";

export interface GeneratedIncident {
  tenantId: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  source: string;
  incidentType: string;
  affectedAssets: string;
  sourceIp: string;
  mitreTactic: string;
  mitreTechnique: string;
  dedupHash: string;
}

const INCIDENT_TYPE_MAP: [RegExp, string][] = [
  [/ransomware/, "Ransomware"],
  [/malware|trojan|worm|backdoor|keylogger|spyware/, "Malware"],
  [/cryptominer|coinminer/, "Cryptomining"],
  [/cve-|vulnerab|patch.*missing|unpatched/, "Vulnerability"],
  [/suspicious.*process|rare.*unsigned/, "Suspicious Process"],
  [/remote.*wmi|psexec|remote.*execution/, "Remote Code Execution"],
  [/process.*injection|dll.*injection/, "Process Injection"],
  [/dll.*sideload|dll.*hijack/, "DLL Side-Loading"],
  [/privilege.*escalation/, "Privilege Escalation"],
  [/defense.*evasion|impair.*defense/, "Defense Evasion"],
  [/port.*scan/, "Port Scan"],
  [/lateral.*movement/, "Lateral Movement"],
  [/phish|spear.*phish|bec/, "Phishing"],
  [/brute.*force|credential.*stuff|password.*spray/, "Brute Force"],
  [/unauthorized.*access/, "Unauthorized Access"],
  [/data.*exfiltration|dlp|data.*loss/, "Data Exfiltration"],
  [/sql.*inject|xss|cross.*site/, "Web Application Attack"],
  [/cloud.*misconfig/, "Cloud Misconfiguration"],
  [/network.*intrusion|ids.*alert|ips.*alert/, "Network Intrusion"],
];

function classifyIncidentType(text: string): string {
  const lower = text.toLowerCase();
  for (const [pattern, type] of INCIDENT_TYPE_MAP) {
    if (pattern.test(lower)) return type;
  }
  return "Security Alert";
}

function generateDedupHash(tenantId: number, title: string, severity: string, asset: string, sourceIp: string, dateWindow: string): string {
  const parts = [
    String(tenantId),
    title,
    severity,
    asset,
    sourceIp,
    dateWindow,
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex");
}

export class IncidentGenerator {
  private existingHashes: Set<string> = new Set();
  private pool: any;
  private totalGenerated = 0;
  private totalDeduped = 0;

  constructor(pool: any) {
    this.pool = pool;
  }

  async loadExistingHashes(tenantIds: number[]): Promise<void> {
    if (tenantIds.length === 0) return;
    try {
      const result = await this.pool.query(
        `SELECT dedup_hash FROM incidents WHERE tenant_id = ANY($1) AND dedup_hash IS NOT NULL`,
        [tenantIds]
      );
      for (const row of result.rows) {
        this.existingHashes.add(row.dedup_hash);
      }
    } catch (err: any) {
      console.error(`[IncidentGenerator] Failed to load existing hashes: ${err.message}`);
    }
  }

  async generateFromEvents(events: EventRecord[]): Promise<GeneratedIncident[]> {
    const incidents: GeneratedIncident[] = [];
    const newHashes = new Set<string>();

    const tenantIds = [...new Set(events.map(e => e.tenantId))];
    await this.loadExistingHashes(tenantIds);

    for (const event of events) {
      const sev = (event.severity || "medium").toLowerCase();
      if (sev !== "critical" && sev !== "high" && sev !== "medium") continue;

      const text = `${event.threat || ""} ${event.description || ""} ${event.eventType || ""}`;
      const incidentType = classifyIncidentType(text);
      const title = event.threat || event.description || `${incidentType} detected on ${event.asset || "unknown"}`;
      const dateWindow = event.occurredAt
        ? new Date(event.occurredAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const dedupHash = generateDedupHash(
        event.tenantId,
        title,
        sev,
        event.asset || "",
        event.attacker || "",
        dateWindow
      );

      if (this.existingHashes.has(dedupHash) || newHashes.has(dedupHash)) {
        this.totalDeduped++;
        continue;
      }

      newHashes.add(dedupHash);

      incidents.push({
        tenantId: event.tenantId,
        title,
        description: event.description || `${incidentType} incident detected by ${event.logSource || event.sourceType || "security monitoring"}`,
        severity: sev,
        status: "open",
        source: event.logSource || event.sourceType || "pipeline",
        incidentType,
        affectedAssets: event.asset || "",
        sourceIp: event.attacker || "",
        mitreTactic: event.mitreTactic || "",
        mitreTechnique: event.mitreTechnique || "",
        dedupHash,
      });
    }

    if (incidents.length > 0) {
      await this.persistIncidents(incidents);
    }

    this.totalGenerated += incidents.length;
    return incidents;
  }

  private async persistIncidents(incidents: GeneratedIncident[]): Promise<void> {
    for (const inc of incidents) {
      try {
        await this.pool.query(
          `INSERT INTO incidents (
            tenant_id, title, description, severity, status, source,
            incident_type, affected_assets, source_ip,
            mitre_tactic, mitre_technique, dedup_hash, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          ON CONFLICT (dedup_hash) DO NOTHING`,
          [
            inc.tenantId, inc.title, inc.description, inc.severity, inc.status, inc.source,
            inc.incidentType, inc.affectedAssets, inc.sourceIp,
            inc.mitreTactic, inc.mitreTechnique, inc.dedupHash,
          ]
        );
        this.existingHashes.add(inc.dedupHash);
      } catch (err: any) {
        console.error(`[IncidentGenerator] Failed to persist incident: ${err.message}`);
      }
    }
  }

  getStats() {
    return {
      totalGenerated: this.totalGenerated,
      totalDeduped: this.totalDeduped,
      cachedHashes: this.existingHashes.size,
    };
  }
}
