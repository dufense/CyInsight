export interface CisControl {
  id: string;
  name: string;
  description: string;
  pass: boolean;
  evidence: string;
  weight: number;
}

export interface CisScoreResult {
  score: number;
  benchmark: string;
  controls: CisControl[];
  passCount: number;
  failCount: number;
}

interface AssetForCis {
  agentVersion?: string | null;
  softwareInventory?: any[] | null;
  vulnerabilityCount?: number | null;
  controlsCoverage?: Array<{ toolName: string; controlType: string; status: string }> | null;
  preventionPolicy?: string | null;
  eolFindings?: Array<{ eolStatus: string }> | null;
  lastSeen?: Date | string | null;
  primaryUserId?: string | null;
  primaryUserEmail?: string | null;
  ipAddress?: string | null;
  endpointType?: string | null;
  deviceHealth?: string | null;
}

function hasEdr(asset: AssetForCis): boolean {
  const cov = asset.controlsCoverage || [];
  return cov.some(c => /edr|xdr|cortex|cynet|endpoint.detection|crowdstrike|sentinel.one|trellix/i.test(c.toolName + " " + c.controlType) && c.status !== "disabled");
}

function hasAv(asset: AssetForCis): boolean {
  const cov = asset.controlsCoverage || [];
  const hasInCov = cov.some(c => /antivirus|av|endpoint.protect/i.test(c.toolName + " " + c.controlType) && c.status !== "disabled");
  if (hasInCov) return true;
  const sw = (asset.softwareInventory || []) as Array<{ name?: string }>;
  return sw.some(s => /defender|kaspersky|symantec|norton|bitdefender|malwarebytes|sophos|mcafee|trellix|eset|trend.micro|crowdstrike/i.test(s.name || ""));
}

function hasVulnScanner(asset: AssetForCis): boolean {
  const cov = asset.controlsCoverage || [];
  return cov.some(c => /vuln|patch|qualys|tenable|nessus|rapid7|vicarius/i.test(c.toolName + " " + c.controlType));
}

function seenRecently(asset: AssetForCis, days = 7): boolean {
  if (!asset.lastSeen) return false;
  const ms = new Date().getTime() - new Date(asset.lastSeen).getTime();
  return ms < days * 86400000;
}

function hasSoftwareInventory(asset: AssetForCis): boolean {
  return Array.isArray(asset.softwareInventory) && asset.softwareInventory.length > 0;
}

export function computeCisScore(asset: AssetForCis): CisScoreResult {
  const controls: CisControl[] = [
    (() => {
      const pass = !!asset.agentVersion;
      return {
        id: "CIS-1.1",
        name: "Inventory Agent Deployed",
        description: "CIS Control 1 – Inventory & Control of Enterprise Assets",
        pass,
        evidence: pass ? `Agent version: ${asset.agentVersion}` : "No agent version detected",
        weight: 12,
      };
    })(),
    (() => {
      const pass = hasSoftwareInventory(asset);
      const sw = asset.softwareInventory as Array<{ name?: string }> | null;
      return {
        id: "CIS-2.1",
        name: "Software Inventory Present",
        description: "CIS Control 2 – Inventory & Control of Software Assets",
        pass,
        evidence: pass ? `${(sw || []).length} software items catalogued` : "No software inventory data",
        weight: 10,
      };
    })(),
    (() => {
      const vulns = asset.vulnerabilityCount ?? 0;
      const pass = vulns < 5;
      return {
        id: "CIS-7.1",
        name: "Patch & Vulnerability Level",
        description: "CIS Control 7 – Continuous Vulnerability Management",
        pass,
        evidence: vulns === 0 ? "No open vulnerabilities" : `${vulns} open vulnerabilities`,
        weight: 14,
      };
    })(),
    (() => {
      const pass = hasEdr(asset);
      return {
        id: "CIS-10.1",
        name: "EDR/XDR Deployed",
        description: "CIS Control 10 – Malware Defenses (EDR coverage)",
        pass,
        evidence: pass ? "EDR/XDR tool detected in coverage" : "No EDR/XDR tool detected",
        weight: 14,
      };
    })(),
    (() => {
      const pass = hasAv(asset);
      return {
        id: "CIS-10.2",
        name: "Anti-Malware Active",
        description: "CIS Control 10 – Malware Defenses (AV/AM coverage)",
        pass,
        evidence: pass ? "Anti-malware solution detected" : "No AV/AM solution detected",
        weight: 8,
      };
    })(),
    (() => {
      const policy = asset.preventionPolicy || "";
      const pass = policy.length > 0 && !/default|none|disabled/i.test(policy);
      return {
        id: "CIS-4.1",
        name: "Prevention Policy Configured",
        description: "CIS Control 4 – Secure Configuration of Enterprise Assets",
        pass,
        evidence: pass ? `Policy: ${policy}` : "No prevention policy or default policy only",
        weight: 8,
      };
    })(),
    (() => {
      const eol = asset.eolFindings || [];
      const activeEol = eol.filter(e => e.eolStatus === "ended").length;
      const pass = activeEol === 0;
      return {
        id: "CIS-2.2",
        name: "No EOL Software",
        description: "CIS Control 2 – No end-of-life software running",
        pass,
        evidence: pass ? "No EOL software findings" : `${activeEol} EOL software items detected`,
        weight: 10,
      };
    })(),
    (() => {
      const pass = hasVulnScanner(asset);
      return {
        id: "CIS-7.2",
        name: "Vulnerability Scanner Coverage",
        description: "CIS Control 7 – Vulnerability scanner actively scanning this asset",
        pass,
        evidence: pass ? "Vulnerability scanning tool detected" : "No vulnerability scanner assigned",
        weight: 10,
      };
    })(),
    (() => {
      const pass = !!(asset.primaryUserId || asset.primaryUserEmail);
      return {
        id: "CIS-5.1",
        name: "User Assignment",
        description: "CIS Control 5 – Account Management (asset-to-user mapping)",
        pass,
        evidence: pass ? `Assigned to: ${asset.primaryUserEmail || asset.primaryUserId}` : "No primary user assigned",
        weight: 6,
      };
    })(),
    (() => {
      const pass = !!(asset.ipAddress);
      return {
        id: "CIS-12.1",
        name: "Network Visibility",
        description: "CIS Control 12 – Network Infrastructure Management",
        pass,
        evidence: pass ? `IP: ${asset.ipAddress}` : "No IP address recorded (untracked on network)",
        weight: 8,
      };
    })(),
  ];

  const totalWeight = controls.reduce((s, c) => s + c.weight, 0);
  const passWeight = controls.filter(c => c.pass).reduce((s, c) => s + c.weight, 0);
  const score = Math.round((passWeight / totalWeight) * 100);
  const passCount = controls.filter(c => c.pass).length;
  const failCount = controls.filter(c => !c.pass).length;

  const benchmark =
    score >= 70 ? "CIS Controls v8 – IG1 (Basic Hygiene)"
    : score >= 40 ? "CIS Controls v8 – Below IG1 (Partial)"
    : "CIS Controls v8 – Non-Compliant";

  return { score, benchmark, controls, passCount, failCount };
}
