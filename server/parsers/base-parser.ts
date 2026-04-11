import XLSX from "xlsx";

export interface ParsedAsset {
  hostname: string;
  ipAddress?: string;
  ipv6Address?: string;
  macAddress?: string;
  operatingSystem?: string;
  endpointType?: string;
  endpointAlias?: string;
  endpointGroup?: string;
  deploymentType?: string;
  cloudProvider?: string;
  cloudRegion?: string;
  cloudInstanceId?: string;
  systemManufacturer?: string;
  systemModel?: string;
  biosSerialNumber?: string;
  processor?: string;
  totalPhysicalMemory?: string;
  storageInfo?: string;
  status?: string;
  source?: string;
  tags?: string;
  user?: string;
  lastLoggedInUser?: string;
  riskScore?: number;
  riskLevel?: string;
  deviceHealth?: string;
  agentVersion?: string;
  enrichmentData?: Record<string, any>;
  softwareInventory?: any[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AppMapping {
  name: string;
  category: "Enterprise" | "Business" | "InfoSec" | "Unknown";
  confidence: number;
  servers: string[];
  owners: string[];
  supportGroups: string[];
  environments: string[];
  locations: string[];
  distributionLists: string[];
  monitoringTools: string[];
  serverCount: number;
  riskSummary?: {
    eolCount: number;
    unpatchedCount: number;
    highRiskCount: number;
  };
}

export interface StakeholderView {
  name: string;
  role: "owner" | "manager" | "support_group" | "distribution_list";
  applications: string[];
  serverCount: number;
  environments: string[];
}

export interface EOLReference {
  vendor: string;
  product: string;
  version: string;
  eosDate: string | null;
  eolDate: string | null;
  extendedEosDate?: string | null;
  serverCount?: number;
  renewalContact?: string;
  nextRenewalDate?: string;
}

export interface WorkloadClassification {
  hostname: string;
  recommendation: "Rehost" | "Replatform" | "Retain" | "Retire";
  confidence: number;
  reasons: string[];
  quickWin: boolean;
}

export interface ImportSummary {
  parserName: string;
  confidence: number;
  sheetsProcessed: string[];
  totalRecords: number;
  recordsPerSheet: Record<string, number>;
  newAssets: number;
  updatedAssets: number;
  applicationsDiscovered: number;
  enterpriseApps: number;
  businessApps: number;
  stakeholdersIdentified: number;
  correlationsFound: number;
  riskFlags: {
    eolCount: number;
    unpatchedCount: number;
    noMonitoringCount: number;
    staleSnapshotCount: number;
    outdatedToolsCount: number;
    decomCount: number;
  };
  infrastructureSummary?: {
    esxiHostCount: number;
    clusterCount: number;
    datastoreCount: number;
    datacenterCount: number;
    totalVMs: number;
    poweredOnVMs: number;
  };
  workloadClassification?: {
    rehost: number;
    replatform: number;
    retain: number;
    retire: number;
    quickWins: number;
  };
  platformBreakdown?: Record<string, number>;
}

export interface ParseResult {
  assets: ParsedAsset[];
  infrastructureAssets: ParsedAsset[];
  applications: AppMapping[];
  eolData: EOLReference[];
  workloadClassifications: WorkloadClassification[];
  stakeholders: StakeholderView[];
  summary: ImportSummary;
}

export interface BaseParser {
  name: string;
  description: string;
  detect(workbook: XLSX.WorkBook, sheetNames: string[], sampleHeaders: Record<string, string[]>): number;
  parse(workbook: XLSX.WorkBook): ParseResult;
}

export function normalizeHostname(hostname: string): string {
  if (!hostname) return "";
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.local$/, "")
    .replace(/\.internal$/, "")
    .replace(/\.corp$/, "")
    .replace(/\.ad\..+$/, "")
    .replace(/\.[a-z]+\.[a-z]+\.[a-z]+$/, "")
    .replace(/\s+/g, "");
}

export function parseExcelDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    const parts = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (parts) {
      const year = parts[3].length === 2 ? 2000 + parseInt(parts[3]) : parseInt(parts[3]);
      return new Date(year, parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  return undefined;
}

export function inferEndpointType(hostname: string, os: string, machineType?: string): string {
  const h = (hostname || "").toLowerCase();
  const o = (os || "").toLowerCase();
  const m = (machineType || "").toLowerCase();

  if (m.includes("virtual") || m.includes("vm") || m.includes("vmware")) return "Virtual Server";
  if (m.includes("physical")) return "Physical Server";

  if (o.includes("esxi") || o.includes("hypervisor")) return "ESXi Host";
  if (o.includes("vios")) return "VIO Server";

  const serverPatterns = ["srv", "server", "svr", "db", "sql", "app", "web", "api", "dns", "dc", "ad", "mail", "mq", "esb"];
  if (serverPatterns.some(p => h.includes(p))) return "Server";
  if (o.includes("server") || o.includes("aix") || o.includes("linux") || o.includes("rhel") || o.includes("suse") || o.includes("centos") || o.includes("ubuntu server")) return "Server";

  if (o.includes("windows 10") || o.includes("windows 11") || o.includes("macos")) return "Workstation";

  return "Server";
}

export function inferEnvironment(value: string): string {
  if (!value) return "Unknown";
  const v = value.toLowerCase().trim();

  const envMap: Record<string, string> = {
    "production": "Production",
    "prod": "Production",
    "production-ilo": "Production",
    "prd": "Production",
    "development": "Development",
    "dev": "Development",
    "qa": "QA",
    "quality": "QA",
    "test": "Test",
    "testing": "Test",
    "test-ilo": "Test",
    "staging": "Staging",
    "stg": "Staging",
    "uat": "UAT",
    "sandbox": "Sandbox",
    "dr": "DR",
    "disaster recovery": "DR",
    "vio": "Infrastructure",
    "vios": "Infrastructure",
  };

  for (const [key, mapped] of Object.entries(envMap)) {
    if (v === key || v.startsWith(key)) return mapped;
  }
  return value;
}

const OS_SIGNATURES: Array<{ pattern: RegExp; canonical: string; family: string }> = [
  { pattern: /red\s*hat\s*enterprise\s*linux/i, canonical: "Red Hat Enterprise Linux", family: "Linux" },
  { pattern: /rhel/i, canonical: "RHEL", family: "Linux" },
  { pattern: /red\s*hat\s*linux/i, canonical: "Red Hat Enterprise Linux", family: "Linux" },
  { pattern: /oracle\s*linux/i, canonical: "Oracle Linux", family: "Linux" },
  { pattern: /suse\s*linux\s*enterprise/i, canonical: "SUSE Linux Enterprise Server", family: "Linux" },
  { pattern: /sles/i, canonical: "SLES", family: "Linux" },
  { pattern: /suse/i, canonical: "SUSE Linux Enterprise Server", family: "Linux" },
  { pattern: /cent\s*os\s*stream/i, canonical: "CentOS Stream", family: "Linux" },
  { pattern: /cent\s*os/i, canonical: "CentOS", family: "Linux" },
  { pattern: /ubuntu/i, canonical: "Ubuntu", family: "Linux" },
  { pattern: /debian/i, canonical: "Debian", family: "Linux" },
  { pattern: /amazon\s*linux/i, canonical: "Amazon Linux", family: "Linux" },
  { pattern: /alma\s*linux/i, canonical: "AlmaLinux", family: "Linux" },
  { pattern: /rocky\s*linux/i, canonical: "Rocky Linux", family: "Linux" },
  { pattern: /fedora/i, canonical: "Fedora", family: "Linux" },
  { pattern: /windows\s*server/i, canonical: "Windows Server", family: "Windows" },
  { pattern: /windows/i, canonical: "Windows", family: "Windows" },
  { pattern: /mac\s*os\s*x/i, canonical: "macOS", family: "macOS" },
  { pattern: /macos/i, canonical: "macOS", family: "macOS" },
  { pattern: /mac\s*os/i, canonical: "macOS", family: "macOS" },
  { pattern: /aix/i, canonical: "IBM AIX", family: "AIX" },
  { pattern: /hp[\s-]*ux/i, canonical: "HP-UX", family: "HP-UX" },
  { pattern: /solaris/i, canonical: "Solaris", family: "Solaris" },
  { pattern: /sunos/i, canonical: "SunOS", family: "Solaris" },
  { pattern: /esxi/i, canonical: "VMware ESXi", family: "VMware" },
  { pattern: /vmware/i, canonical: "VMware ESXi", family: "VMware" },
  { pattern: /freebsd/i, canonical: "FreeBSD", family: "BSD" },
  { pattern: /openbsd/i, canonical: "OpenBSD", family: "BSD" },
  { pattern: /linux/i, canonical: "Linux", family: "Linux" },
];

function extractOsFromRaw(raw: string): { osName: string; versionPart: string } | null {
  for (const sig of OS_SIGNATURES) {
    const globalPattern = new RegExp(sig.pattern.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(raw)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      const beforeMatch = raw.substring(0, matchStart);
      if (beforeMatch && /[a-zA-Z0-9]-$/.test(beforeMatch)) continue;
      const charAfter = raw[matchEnd];
      if (charAfter && /[a-zA-Z]/.test(charAfter) && !/\d/.test(charAfter)) continue;
      const afterMatch = raw.substring(matchEnd).trim();
      const versionMatch = afterMatch.match(/^[\s._-]*(\d[\d._]*\S*)/);
      const versionPart = versionMatch ? versionMatch[1].replace(/_/g, ".") : "";
      const remainder = versionPart
        ? afterMatch.substring(versionMatch![0].length).trim()
        : afterMatch;
      let result = sig.canonical;
      if (versionPart) result += " " + versionPart;
      if (remainder) result += " " + remainder;
      return { osName: result.replace(/\s+/g, " ").trim(), versionPart };
    }
  }
  return null;
}

function insertVersionSpace(s: string): string {
  return s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
}

export function normalizeOS(os: string, version?: string, sheetCategory?: string): string {
  if (!os && !sheetCategory) return "";
  if (!os && sheetCategory) {
    const catLower = sheetCategory.toLowerCase();
    const exactMatch = OS_SIGNATURES.find(s => s.canonical.toLowerCase() === catLower);
    if (exactMatch) return exactMatch.canonical;
    const familyMatch = OS_SIGNATURES.find(s => s.family.toLowerCase() === catLower);
    if (familyMatch) return familyMatch.family;
    return sheetCategory;
  }

  let raw = os.trim();
  if (version && !raw.toLowerCase().includes(version.toLowerCase())) {
    raw = `${raw} ${version}`.trim();
  }

  const extracted = extractOsFromRaw(raw);
  if (extracted) {
    let normalized = extracted.osName;
    normalized = normalized
      .replace(/microsoft\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized;
  }

  const spaced = insertVersionSpace(raw);
  const retryExtracted = extractOsFromRaw(spaced);
  if (retryExtracted) {
    let normalized = retryExtracted.osName;
    normalized = normalized
      .replace(/microsoft\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized;
  }

  if (sheetCategory) {
    const catLower = sheetCategory.toLowerCase();
    const exactMatch = OS_SIGNATURES.find(s => s.canonical.toLowerCase() === catLower);
    if (exactMatch) return exactMatch.canonical;
    const familyMatch = OS_SIGNATURES.find(s => s.family.toLowerCase() === catLower);
    if (familyMatch) return familyMatch.family;
    return sheetCategory;
  }

  let normalized = raw
    .replace(/microsoft\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

export function inferDeploymentType(value: string, os?: string, manufacturer?: string): string {
  const v = (value || "").toLowerCase();
  const o = (os || "").toLowerCase();
  const m = (manufacturer || "").toLowerCase();

  if (v.includes("virtual") || v.includes("vm") || v.includes("vmware")) return "Virtual";
  if (v.includes("physical") || v.includes("bare metal")) return "Physical";
  if (v.includes("onprem") || v.includes("on-prem") || v.includes("on premise")) return "On-Premise";
  if (v.includes("cloud") || v.includes("azure") || v.includes("aws") || v.includes("gcp")) return "Cloud";

  if (m.includes("vmware")) return "Virtual";
  if (m.includes("hpe") || m.includes("hewlett") || m.includes("dell") || m.includes("lenovo") || m.includes("ibm") || m.includes("cisco")) return "Physical";

  if (o.includes("esxi")) return "Hypervisor";
  if (o.includes("vios")) return "Virtual I/O";

  return "Unknown";
}

export function inferCloudProvider(manufacturer?: string, deploymentType?: string): string {
  const m = (manufacturer || "").toLowerCase();
  const d = (deploymentType || "").toLowerCase();

  if (m.includes("vmware")) return "VMware";
  if (m.includes("microsoft") && d.includes("cloud")) return "Azure";
  if (d.includes("aws") || d.includes("amazon")) return "AWS";
  if (d.includes("gcp") || d.includes("google")) return "GCP";
  if (m.includes("hpe") || m.includes("hewlett") || m.includes("dell") || m.includes("lenovo") || m.includes("ibm") || m.includes("cisco") || m.includes("supermicro")) return "On-Premise";

  return "";
}

export function calculateRiskScore(asset: ParsedAsset): { score: number; level: string; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const ed = asset.enrichmentData || {};

  if (ed.eolStatus === "ended") { score += 25; factors.push("End-of-Life OS/Software"); }
  else if (ed.eolStatus === "approaching") { score += 10; factors.push("Approaching End-of-Life"); }

  if (ed.patchingStatus && !["completed", "patched", "current", "up to date"].includes(ed.patchingStatus.toLowerCase())) {
    score += 15; factors.push("Incomplete patching");
  }

  if (ed.monitoring?.status === "No" || ed.monitoringStatus === "No") {
    score += 10; factors.push("No monitoring configured");
  }

  if (ed.staleSnapshots && ed.staleSnapshots > 0) {
    score += 15; factors.push(`${ed.staleSnapshots} stale snapshot(s)`);
  }

  if (ed.toolsStatus && !["ok", "current", "guestToolsCurrent"].includes(ed.toolsStatus.toLowerCase())) {
    score += 10; factors.push("Outdated VMware Tools");
  }

  if (asset.status === "decommissioned" || asset.status === "inactive") {
    score += 5; factors.push("Inactive/decommissioned");
  }

  const fw = (ed.firmware || ed.bootFirmware || "").toLowerCase();
  if (fw === "bios") {
    score += 5; factors.push("Legacy BIOS firmware (no Secure Boot)");
  }

  const osLower = (asset.operatingSystem || "").toLowerCase();
  const EOL_OS_PATTERNS = [
    { pattern: /server 2008/i, label: "Windows Server 2008 (EOL Jan 2020)" },
    { pattern: /server 2012(?!\sR2)/i, label: "Windows Server 2012 (EOL Oct 2023)" },
    { pattern: /server 2012 r2/i, label: "Windows Server 2012 R2 (EOL Oct 2023)" },
    { pattern: /centos\s*[4-7]/i, label: "CentOS (EOL Jun 2024)" },
    { pattern: /suse.*(?:11|12)\b/i, label: "SUSE Linux Enterprise 11/12 (EOL)" },
    { pattern: /windows\s*(?:7|8)\b/i, label: "Windows 7/8 (EOL)" },
    { pattern: /red hat.*(?:6|7)\b/i, label: "RHEL 6/7 (EOL/approaching EOL)" },
  ];
  for (const eol of EOL_OS_PATTERNS) {
    if (eol.pattern.test(asset.operatingSystem || "")) {
      score += 20; factors.push(eol.label);
      break;
    }
  }

  if (osLower.includes("windows 10")) {
    score += 8; factors.push("Windows 10 (EOL Oct 2025 - approaching)");
  }

  if (ed.migrationStatus && !["completed", "done", "migrated"].includes(ed.migrationStatus.toLowerCase())) {
    score += 5; factors.push("Pending migration");
  }

  const level = score >= 70 ? "critical" : score >= 50 ? "high" : score >= 30 ? "medium" : score >= 10 ? "low" : "info";

  return { score: Math.min(score, 100), level, factors };
}

export function classifyWorkload(asset: ParsedAsset): WorkloadClassification {
  const ed = asset.enrichmentData || {};
  const reasons: string[] = [];
  let recommendation: WorkloadClassification["recommendation"] = "Retain";
  let quickWin = false;

  const isVirtual = (asset.deploymentType || "").toLowerCase().includes("virtual") || (asset.cloudProvider || "").toLowerCase().includes("vmware");
  const isPhysical = (asset.deploymentType || "").toLowerCase().includes("physical");
  const isDecom = asset.status === "decommissioned" || asset.status === "inactive";
  const isEOL = ed.eolStatus === "ended";
  const hasModernOS = !isEOL && asset.operatingSystem && !/xp|vista|2003|2008|centos\s*[56]|rhel\s*[56]|aix\s*[56]/i.test(asset.operatingSystem);
  const isSpecialized = /as400|iseries|power|hmc|vios|mainframe/i.test(asset.operatingSystem || "") || /as400|iseries|power|hmc/i.test(ed.frame || "");
  const hasApp = !!ed.applicationName;

  if (isDecom || (isEOL && !hasApp)) {
    recommendation = "Retire";
    reasons.push(isDecom ? "Decommissioned asset" : "End-of-Life with no active application");
  } else if (isSpecialized) {
    recommendation = "Retain";
    reasons.push("Specialized platform requiring dedicated infrastructure");
  } else if (isVirtual && hasModernOS) {
    recommendation = "Rehost";
    reasons.push("Already virtualized with modern OS");
    if (hasApp && ed.applicationCategory !== "Unknown") {
      quickWin = true;
      reasons.push("Standard application - quick-win candidate");
    }
  } else if (isVirtual && !hasModernOS) {
    recommendation = "Replatform";
    reasons.push("Virtualized but requires OS/platform upgrade");
  } else if (isPhysical && hasModernOS) {
    recommendation = "Rehost";
    reasons.push("Physical server with modern OS suitable for virtualization");
  } else if (isPhysical && !hasModernOS) {
    recommendation = "Replatform";
    reasons.push("Physical server with outdated OS needing upgrade");
  }

  const risk = calculateRiskScore(asset);
  const confidence = recommendation === "Retire" ? 90 : recommendation === "Retain" && isSpecialized ? 85 : quickWin ? 80 : 60;

  return {
    hostname: asset.hostname,
    recommendation,
    confidence,
    reasons,
    quickWin,
  };
}

export function getSheetData(workbook: XLSX.WorkBook, sheetName: string): Record<string, any>[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows as Record<string, any>[];
}

export function getSheetHeaders(workbook: XLSX.WorkBook, sheetName: string): string[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (cell && cell.v) headers.push(String(cell.v));
  }
  return headers;
}

export function findColumn(headers: string[], aliases: string[]): string | undefined {
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\-\.\/\\]+/g, " ").replace(/\s+/g, " ").trim());
  const normalizedAliases = aliases.map(a => a.toLowerCase().replace(/[_\-\.\/\\]+/g, " ").replace(/\s+/g, " ").trim());

  for (const alias of normalizedAliases) {
    const idx = normalizedHeaders.findIndex(h => h === alias);
    if (idx >= 0) return headers[idx];
  }

  for (const alias of normalizedAliases) {
    const idx = normalizedHeaders.findIndex(h => h.includes(alias) || alias.includes(h));
    if (idx >= 0) return headers[idx];
  }

  return undefined;
}

export function getVal(row: Record<string, any>, column: string | undefined): string {
  if (!column) return "";
  const val = row[column];
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function emptyParseResult(parserName: string): ParseResult {
  return {
    assets: [],
    infrastructureAssets: [],
    applications: [],
    eolData: [],
    workloadClassifications: [],
    stakeholders: [],
    summary: {
      parserName,
      confidence: 0,
      sheetsProcessed: [],
      totalRecords: 0,
      recordsPerSheet: {},
      newAssets: 0,
      updatedAssets: 0,
      applicationsDiscovered: 0,
      enterpriseApps: 0,
      businessApps: 0,
      stakeholdersIdentified: 0,
      correlationsFound: 0,
      riskFlags: {
        eolCount: 0,
        unpatchedCount: 0,
        noMonitoringCount: 0,
        staleSnapshotCount: 0,
        outdatedToolsCount: 0,
        decomCount: 0,
      },
    },
  };
}
