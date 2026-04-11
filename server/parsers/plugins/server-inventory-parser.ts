import XLSX from "xlsx";
import type {
  BaseParser,
  ParseResult,
  ParsedAsset,
  EOLReference,
  AppMapping,
} from "../base-parser";
import {
  normalizeHostname,
  parseExcelDate,
  inferEndpointType,
  inferEnvironment,
  normalizeOS,
  inferDeploymentType,
  inferCloudProvider,
  calculateRiskScore,
  classifyWorkload,
  getSheetData,
  getSheetHeaders,
  findColumn,
  getVal,
  emptyParseResult,
} from "../base-parser";
import { ParserRegistry } from "../parser-registry";

interface ColumnMapping {
  hostname: string[];
  ip: string[];
  os: string[];
  osVersion: string[];
  application: string[];
  owner: string[];
  managedBy: string[];
  location: string[];
  environment: string[];
  status: string[];
  manufacturer: string[];
  model: string[];
  serialNo: string[];
  machineType: string[];
  monitoringStatus: string[];
  monitoringTool: string[];
  hmc: string[];
  frame: string[];
  migrationStatus: string[];
  patchingStatus: string[];
  supportGroup: string[];
  applicationDL: string[];
  siteCode: string[];
  domain: string[];
  systemType: string[];
  biosReleaseDate: string[];
  biosAssetTag: string[];
  comments: string[];
  createdOn: string[];
  updatedOn: string[];
  kernelVersion: string[];
  serverOwner: string[];
  envType: string[];
  currentOsVersion: string[];
  latestOsVersion: string[];
  datacenter: string[];
  cluster: string[];
  vmName: string[];
  alreadyDecommissioned: string[];
  plannedDecommissioned: string[];
  review: string[];
  legalRequirement: string[];
  memoryGb: string[];
  vcpuCount: string[];
  totalDiskGb: string[];
  serverType: string[];
}

const COLUMN_ALIASES: ColumnMapping = {
  hostname: ["Name", "System Name", "Server_Name", "Server Name", "Host name", "Hostname", "Host_Name", "Computer Name", "Device Name", "Asset Name"],
  ip: ["IP ADDRESS", "IP Address", "Ip address", "IP_Address", "IP", "IPv4 Address", "IP Addr"],
  os: ["OS", "Operating System Name", "Operating System", "OS Name", "Platform"],
  osVersion: ["Version", "OS Version", "Os Version", "OS_Version"],
  application: ["Application", "Short_Description", "Application Name", "Application name", "App Name", "Service", "App"],
  owner: ["Owned_By", "Application Owner", "Owner", "Server Owner", "Asset Owner"],
  managedBy: ["Managed_by", "Managed By", "Manager"],
  location: ["Location", "Site Code", "Site", "Data Center", "Datacenter", "DC"],
  environment: ["Used_for", "Used for", "Env Type", "Env type", "Environment", "Env"],
  status: ["Status", "Operational_status", "Operational Status", "State", "Power State"],
  manufacturer: ["Manufacturer", "Make", "Vendor", "Hardware Vendor"],
  model: ["Model", "Hardware Model", "Server Model"],
  serialNo: ["Serial No", "Serial Number", "Serial_Number", "Serial", "BIOS Serial"],
  machineType: ["Machine Type", "Type", "System Type", "Server Type", "Asset Type"],
  monitoringStatus: ["Monitoring Status", "Monitoring_Status", "Monitored"],
  monitoringTool: ["Monitoring Tool", "Monitoring_Tool", "Monitor Tool"],
  hmc: ["HMC", "HMC Name"],
  frame: ["Frame", "Frame Name", "LPAR Frame"],
  migrationStatus: ["Migratation status", "Migration Status", "Migration_Status", "Migration"],
  patchingStatus: ["Patching status", "Patching_Status", "Patching staus", "Patch Status"],
  supportGroup: ["Support_group", "Support Group", "Support_Group", "Support Team"],
  applicationDL: ["Application DL", "Application_DL", "Distribution List", "DL"],
  siteCode: ["Site Code", "Site_Code", "Site"],
  domain: ["Domain", "AD Domain", "Domain Name"],
  systemType: ["System Type", "Type"],
  biosReleaseDate: ["BIOS Release Date", "BIOS_Release_Date"],
  biosAssetTag: ["BIOS Asset Tag", "Asset Tag", "BIOS_Asset_Tag"],
  comments: ["Comments", "Notes", "Remarks", "Description"],
  createdOn: ["Sys_created_on", "Created On", "Created_On", "Created Date"],
  updatedOn: ["Sys_updated_on", "Sys_updated_on/Planned", "Updated On", "Updated_On", "Last Updated"],
  kernelVersion: ["Kernel version", "Kernel_Version", "Kernel"],
  serverOwner: ["Server Owner", "Server_Owner"],
  envType: ["Env Type", "Env type", "Environment Type"],
  currentOsVersion: ["Current OS Version", "Current_OS_Version"],
  latestOsVersion: ["Latest OS Version", "Latest_OS_Version"],
  datacenter: ["DatacenterName", "Datacenter Name", "Datacenter", "Data Center", "DC Name", "DC"],
  cluster: ["ClusterName", "Cluster Name", "Cluster", "Cluster ID"],
  vmName: ["VMname", "VM Name", "VM", "Virtual Machine Name", "Virtual Machine"],
  alreadyDecommissioned: ["Already Decommissioned", "Already Decom", "Decom Status", "Decomm"],
  plannedDecommissioned: ["Planned Decommissioned", "Planned Decommission", "Planned Decom", "Decom Plan", "Decommission Plan"],
  review: ["Review", "Review Status", "Migration Review"],
  legalRequirement: ["Legal Requirement", "Legal Hold", "Legal Retention"],
  memoryGb: ["MemoryGB", "Memory GB", "Memory (GB)", "RAM GB", "RAM", "Memory"],
  vcpuCount: ["vCPUcount", "vCPU Count", "vCPU", "CPU Count", "vCPUs", "CPU Cores", "Num CPU"],
  totalDiskGb: ["TotalVmdkSizeGB", "Total Vmdk Size GB", "VMDK Size", "Total Disk", "Disk Size GB", "Storage GB", "Total Storage GB", "Provisioned Space GB"],
  serverType: ["Type"],
};

const CHARACTERISTIC_COLUMNS = [
  { columns: ["HMC", "Frame"], weight: 20 },
  { columns: ["Support_group", "Support Group"], weight: 15 },
  { columns: ["Owned_By", "Application Owner", "Server Owner"], weight: 12 },
  { columns: ["Monitoring Tool", "Monitoring Status"], weight: 12 },
  { columns: ["Migratation status", "Migration Status", "Patching status", "Patching staus"], weight: 10 },
  { columns: ["System Name", "Server_Name", "Host name", "Hostname"], weight: 10 },
  { columns: ["Machine Type", "System Type"], weight: 10 },
  { columns: ["Site Code"], weight: 8 },
  { columns: ["Operating System Name", "OS"], weight: 5 },
  { columns: ["IP ADDRESS", "IP Address", "Ip address", "IP_Address"], weight: 5 },
  { columns: ["Application", "Short_Description", "Application Name", "Application name"], weight: 8 },
  { columns: ["Operational_status", "Status"], weight: 5 },
  { columns: ["Manufacturer", "Model", "Serial No"], weight: 8 },
  { columns: ["Domain"], weight: 5 },
  { columns: ["Env Type", "Env type", "Used_for", "Used for"], weight: 8 },
  { columns: ["DatacenterName", "Datacenter Name", "ClusterName", "Cluster Name"], weight: 15 },
  { columns: ["VMname", "VM Name", "Virtual Machine"], weight: 10 },
  { columns: ["Already Decommissioned", "Planned Decommissioned"], weight: 12 },
  { columns: ["MemoryGB", "vCPUcount", "TotalVmdkSizeGB"], weight: 10 },
  { columns: ["RunningOS", "Running OS"], weight: 5 },
];

const EOL_SHEET_PATTERNS = [/eol/i, /eos/i, /end.of.life/i, /end.of.support/i, /testing/i, /lifecycle/i];
const DECOM_SHEET_PATTERNS = [/decom/i, /decommission/i, /retired/i, /obsolete/i, /removed/i];
const INVENTORY_SHEET_PATTERNS = [/inv/i, /inventory/i, /server/i, /linux/i, /aix/i, /windows/i, /patching/i, /sheet1/i, /global.compute/i, /^hpd$/i];
const SKIP_SHEET_PATTERNS = [/pivot/i, /^sheet2$/i, /vmname.count/i, /^sheet\d+$/i];

function isEOLSheet(name: string): boolean {
  return EOL_SHEET_PATTERNS.some(p => p.test(name));
}

function isDecomSheet(name: string): boolean {
  return DECOM_SHEET_PATTERNS.some(p => p.test(name));
}

function isInventorySheet(name: string, headers: string[]): boolean {
  if (INVENTORY_SHEET_PATTERNS.some(p => p.test(name))) return true;
  const normalizedHeaders = headers.map(h => h.toLowerCase());
  const hostnameIndicators = ["name", "hostname", "host name", "server_name", "system name", "server name"];
  return hostnameIndicators.some(ind => normalizedHeaders.some(h => h.includes(ind)));
}

function shouldSkipSheet(name: string): boolean {
  return SKIP_SHEET_PATTERNS.some(p => p.test(name));
}

function detectSheetCategory(name: string): string {
  const n = name.toLowerCase();
  if (shouldSkipSheet(name)) return "Skip";
  if (n.includes("linux")) return "Linux";
  if (n.includes("aix")) return "AIX";
  if (n.includes("windows")) return "Windows";
  if (n.includes("patching")) return "Patching";
  if (n.includes("appliance")) return "Appliance";
  if (isDecomSheet(name)) return "Decommissioned";
  if (isEOLSheet(name)) return "EOL";
  if (n.includes("pivot")) return "Pivot";
  if (n.includes("global compute") || n.includes("global_compute")) return "General";
  if (/^hpd$/i.test(n)) return "General";
  return "General";
}

function detectDecomSubType(name: string): "planned" | "already" | "generic" {
  const n = name.toLowerCase();
  if (n.includes("planned")) return "planned";
  if (n.includes("already")) return "already";
  return "generic";
}

function normalizeDecomTimeline(value: string): string {
  if (!value) return "Unknown";
  const v = value.toLowerCase().trim();
  if (v === "yes") return "Immediate";
  if (v.includes("< 1") || v.includes("<1")) return "< 1 Year";
  if (v.includes("> 2") || v.includes(">2")) return "> 2 Years";
  if (v.includes("contact")) return "Under Review";
  return "Under Review";
}

function deriveDecomStatus(alreadyDecom: string, plannedDecom: string): { status: string; decommissionStatus: string } {
  const ad = (alreadyDecom || "").toLowerCase().trim();
  const pd = (plannedDecom || "").trim();

  if (ad === "yes" || ad === "decommissioned") {
    return { status: "decommissioned", decommissionStatus: "decommissioned" };
  }
  if (ad.includes("powered off") || ad.includes("turned off")) {
    return { status: "inactive", decommissionStatus: "powered_off" };
  }
  if (ad && ad !== "no" && ad !== "" && !ad.startsWith("active")) {
    return { status: "active", decommissionStatus: "under_review" };
  }
  if (pd && pd.trim() !== "" && pd.trim() !== " ") {
    return { status: "active", decommissionStatus: "planned" };
  }
  return { status: "active", decommissionStatus: "none" };
}

function getSheetDataWithHeaderRow(workbook: XLSX.WorkBook, sheetName: string, headerRow: number): Record<string, any>[] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (allRows.length <= headerRow) return [];
  const headers = allRows[headerRow].map((h: any) => String(h || "").trim());
  const dataRows = allRows.slice(headerRow + 1);
  return dataRows.map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    return obj;
  }).filter(row => Object.values(row).some(v => v != null && v !== ""));
}

function getSheetHeadersAtRow(workbook: XLSX.WorkBook, sheetName: string, headerRow: number): string[] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (allRows.length <= headerRow) return [];
  return allRows[headerRow].map((h: any) => String(h || "").trim()).filter(Boolean);
}

const serverInventoryParser: BaseParser = {
  name: "Server Inventory",
  description: "Generic server inventory parser for diverse spreadsheet formats including Linux, AIX, Windows inventory, patching, decommission, and EOL data",

  detect(workbook: XLSX.WorkBook, sheetNames: string[], sampleHeaders: Record<string, string[]>): number {
    let score = 0;
    let matchedSheets = 0;

    const vmwareSheets = ["vInfo", "vHost", "vCPU", "vMemory", "vDisk", "vNetwork"];
    const hasVmwareSheets = vmwareSheets.some(vs => sheetNames.some(s => s.toLowerCase() === vs.toLowerCase()));
    if (hasVmwareSheets) return 0;

    for (const sheetName of sheetNames) {
      const headers = sampleHeaders[sheetName] || [];
      if (headers.length === 0) continue;

      const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\-\.\/\\]+/g, " ").replace(/\s+/g, " ").trim());

      for (const group of CHARACTERISTIC_COLUMNS) {
        const matched = group.columns.some(col => {
          const normalizedCol = col.toLowerCase().replace(/[_\-\.\/\\]+/g, " ").replace(/\s+/g, " ").trim();
          return normalizedHeaders.some(h => h === normalizedCol || h.includes(normalizedCol));
        });
        if (matched) {
          score += group.weight;
          matchedSheets++;
        }
      }
    }

    const hasInventorySheet = sheetNames.some(s => {
      const headers = sampleHeaders[s] || [];
      return isInventorySheet(s, headers);
    });
    if (hasInventorySheet) score += 10;

    const hasEolSheet = sheetNames.some(s => isEOLSheet(s));
    if (hasEolSheet) score += 5;

    const hasDecomSheet = sheetNames.some(s => isDecomSheet(s));
    if (hasDecomSheet) score += 5;

    return Math.min(score, 95);
  },

  parse(workbook: XLSX.WorkBook): ParseResult {
    const result = emptyParseResult("Server Inventory");
    const allAssets: ParsedAsset[] = [];
    const eolData: EOLReference[] = [];
    const appMap = new Map<string, { servers: Set<string>; owners: Set<string>; supportGroups: Set<string>; environments: Set<string>; locations: Set<string>; dls: Set<string>; monTools: Set<string> }>();
    const hostnameSet = new Set<string>();

    for (const sheetName of workbook.SheetNames) {
      const category = detectSheetCategory(sheetName);

      if (category === "Pivot" || category === "Skip") continue;

      let headers = getSheetHeaders(workbook, sheetName);

      if (isDecomSheet(sheetName) && headers.length < 3) {
        headers = getSheetHeadersAtRow(workbook, sheetName, 2);
      }

      if (headers.length === 0) continue;

      if (isEOLSheet(sheetName) && !isInventorySheet(sheetName, headers)) {
        const eolEntries = parseEOLSheet(workbook, sheetName, headers);
        eolData.push(...eolEntries);
        result.summary.sheetsProcessed.push(sheetName);
        result.summary.recordsPerSheet[sheetName] = eolEntries.length;
        continue;
      }

      if (isDecomSheet(sheetName)) {
        const decomAssets = parseDecomSheetEnhanced(workbook, sheetName, headers);
        allAssets.push(...decomAssets);
        result.summary.sheetsProcessed.push(sheetName);
        result.summary.recordsPerSheet[sheetName] = decomAssets.length;
        continue;
      }

      if (!isInventorySheet(sheetName, headers)) continue;

      const assets = parseInventorySheet(workbook, sheetName, headers, category);
      allAssets.push(...assets);
      result.summary.sheetsProcessed.push(sheetName);
      result.summary.recordsPerSheet[sheetName] = assets.length;
    }

    for (const asset of allAssets) {
      const key = normalizeHostname(asset.hostname);
      if (!key) continue;

      if (hostnameSet.has(key)) {
        const existing = result.assets.find(a => normalizeHostname(a.hostname) === key);
        if (existing) {
          mergeAsset(existing, asset);
        }
        continue;
      }

      hostnameSet.add(key);

      const risk = calculateRiskScore(asset);
      asset.riskScore = risk.score;
      asset.riskLevel = risk.level;

      const ed = asset.enrichmentData || {};
      const appName = ed.applicationName || "";
      if (appName) {
        if (!appMap.has(appName)) {
          appMap.set(appName, { servers: new Set(), owners: new Set(), supportGroups: new Set(), environments: new Set(), locations: new Set(), dls: new Set(), monTools: new Set() });
        }
        const entry = appMap.get(appName)!;
        entry.servers.add(asset.hostname);
        if (ed.owner) entry.owners.add(ed.owner);
        if (ed.supportGroup) entry.supportGroups.add(ed.supportGroup);
        if (ed.environment) entry.environments.add(ed.environment);
        if (ed.location) entry.locations.add(ed.location);
        if (ed.applicationDL) entry.dls.add(ed.applicationDL);
        if (ed.monitoringTool) entry.monTools.add(ed.monitoringTool);
      }

      result.assets.push(asset);
    }

    result.eolData = eolData;

    const appEntries = Array.from(appMap.entries());
    for (const [name, data] of appEntries) {
      const mapping: AppMapping = {
        name,
        category: "Unknown",
        confidence: 50,
        servers: Array.from(data.servers),
        owners: Array.from(data.owners),
        supportGroups: Array.from(data.supportGroups),
        environments: Array.from(data.environments),
        locations: Array.from(data.locations),
        distributionLists: Array.from(data.dls),
        monitoringTools: Array.from(data.monTools),
        serverCount: data.servers.size,
      };
      result.applications.push(mapping);
    }

    const wlClassifications = result.assets.map(a => classifyWorkload(a));
    result.workloadClassifications = wlClassifications;

    result.summary.confidence = 75;
    result.summary.totalRecords = result.assets.length;
    result.summary.applicationsDiscovered = result.applications.length;
    result.summary.riskFlags.eolCount = result.assets.filter(a => a.enrichmentData?.eolStatus === "ended").length;
    result.summary.riskFlags.unpatchedCount = result.assets.filter(a => {
      const ps = a.enrichmentData?.patchingStatus;
      return ps && !["completed", "patched", "current", "up to date"].includes(ps.toLowerCase());
    }).length;
    result.summary.riskFlags.noMonitoringCount = result.assets.filter(a => a.enrichmentData?.monitoringStatus === "No").length;
    result.summary.riskFlags.decomCount = result.assets.filter(a => a.status === "decommissioned").length;

    const platformCounts: Record<string, number> = {};
    for (const a of result.assets) {
      const os = (a.operatingSystem || "Unknown").toLowerCase();
      let platform = "Other";
      if (os.includes("aix")) platform = "AIX";
      else if (os.includes("linux") || os.includes("rhel") || os.includes("suse") || os.includes("centos") || os.includes("ubuntu") || os.includes("red hat")) platform = "Linux";
      else if (os.includes("windows")) platform = "Windows";
      else if (os.includes("esxi")) platform = "VMware";
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }
    result.summary.platformBreakdown = platformCounts;

    result.summary.workloadClassification = {
      rehost: wlClassifications.filter(w => w.recommendation === "Rehost").length,
      replatform: wlClassifications.filter(w => w.recommendation === "Replatform").length,
      retain: wlClassifications.filter(w => w.recommendation === "Retain").length,
      retire: wlClassifications.filter(w => w.recommendation === "Retire").length,
      quickWins: wlClassifications.filter(w => w.quickWin).length,
    };

    return result;
  },
};

function parseInventorySheet(workbook: XLSX.WorkBook, sheetName: string, headers: string[], category: string): ParsedAsset[] {
  const rows = getSheetData(workbook, sheetName);
  const assets: ParsedAsset[] = [];

  let lastHmc = "";
  let lastFrame = "";

  const cols = {
    hostname: findColumn(headers, COLUMN_ALIASES.hostname),
    ip: findColumn(headers, COLUMN_ALIASES.ip),
    os: findColumn(headers, COLUMN_ALIASES.os),
    osVersion: findColumn(headers, COLUMN_ALIASES.osVersion),
    application: findColumn(headers, COLUMN_ALIASES.application),
    owner: findColumn(headers, COLUMN_ALIASES.owner),
    managedBy: findColumn(headers, COLUMN_ALIASES.managedBy),
    location: findColumn(headers, COLUMN_ALIASES.location),
    environment: findColumn(headers, COLUMN_ALIASES.environment),
    status: findColumn(headers, COLUMN_ALIASES.status),
    manufacturer: findColumn(headers, COLUMN_ALIASES.manufacturer),
    model: findColumn(headers, COLUMN_ALIASES.model),
    serialNo: findColumn(headers, COLUMN_ALIASES.serialNo),
    machineType: findColumn(headers, COLUMN_ALIASES.machineType),
    monitoringStatus: findColumn(headers, COLUMN_ALIASES.monitoringStatus),
    monitoringTool: findColumn(headers, COLUMN_ALIASES.monitoringTool),
    hmc: findColumn(headers, COLUMN_ALIASES.hmc),
    frame: findColumn(headers, COLUMN_ALIASES.frame),
    migrationStatus: findColumn(headers, COLUMN_ALIASES.migrationStatus),
    patchingStatus: findColumn(headers, COLUMN_ALIASES.patchingStatus),
    supportGroup: findColumn(headers, COLUMN_ALIASES.supportGroup),
    applicationDL: findColumn(headers, COLUMN_ALIASES.applicationDL),
    siteCode: findColumn(headers, COLUMN_ALIASES.siteCode),
    domain: findColumn(headers, COLUMN_ALIASES.domain),
    systemType: findColumn(headers, COLUMN_ALIASES.systemType),
    biosReleaseDate: findColumn(headers, COLUMN_ALIASES.biosReleaseDate),
    biosAssetTag: findColumn(headers, COLUMN_ALIASES.biosAssetTag),
    comments: findColumn(headers, COLUMN_ALIASES.comments),
    createdOn: findColumn(headers, COLUMN_ALIASES.createdOn),
    updatedOn: findColumn(headers, COLUMN_ALIASES.updatedOn),
    kernelVersion: findColumn(headers, COLUMN_ALIASES.kernelVersion),
    serverOwner: findColumn(headers, COLUMN_ALIASES.serverOwner),
    envType: findColumn(headers, COLUMN_ALIASES.envType),
    currentOsVersion: findColumn(headers, COLUMN_ALIASES.currentOsVersion),
    latestOsVersion: findColumn(headers, COLUMN_ALIASES.latestOsVersion),
    datacenter: findColumn(headers, COLUMN_ALIASES.datacenter),
    cluster: findColumn(headers, COLUMN_ALIASES.cluster),
    vmName: findColumn(headers, COLUMN_ALIASES.vmName),
    alreadyDecommissioned: findColumn(headers, COLUMN_ALIASES.alreadyDecommissioned),
    plannedDecommissioned: findColumn(headers, COLUMN_ALIASES.plannedDecommissioned),
    review: findColumn(headers, COLUMN_ALIASES.review),
    legalRequirement: findColumn(headers, COLUMN_ALIASES.legalRequirement),
    memoryGb: findColumn(headers, COLUMN_ALIASES.memoryGb),
    vcpuCount: findColumn(headers, COLUMN_ALIASES.vcpuCount),
    totalDiskGb: findColumn(headers, COLUMN_ALIASES.totalDiskGb),
    serverType: findColumn(headers, COLUMN_ALIASES.serverType),
  };

  for (const row of rows) {
    const hostnameRaw = getVal(row, cols.hostname);
    const vmNameRaw = getVal(row, cols.vmName);
    const hostname = vmNameRaw || hostnameRaw;
    if (!hostname) continue;

    const osRaw = getVal(row, cols.os);
    const osVersionRaw = getVal(row, cols.osVersion);
    const os = normalizeOS(osRaw, osVersionRaw, category);

    const machineType = getVal(row, cols.machineType) || getVal(row, cols.systemType);
    const manufacturer = getVal(row, cols.manufacturer);
    const deploymentType = inferDeploymentType(machineType, os, manufacturer);
    const cloudProvider = inferCloudProvider(manufacturer, deploymentType);

    const envRaw = getVal(row, cols.environment) || getVal(row, cols.envType);
    const environment = inferEnvironment(envRaw);

    const alreadyDecomRaw = getVal(row, cols.alreadyDecommissioned);
    const plannedDecomRaw = getVal(row, cols.plannedDecommissioned);
    const decomInfo = deriveDecomStatus(alreadyDecomRaw, plannedDecomRaw);

    const statusRaw = getVal(row, cols.status);
    let status = statusRaw ? statusRaw.toLowerCase().replace(/\s+/g, "_") : "active";
    if (decomInfo.status !== "active") {
      status = decomInfo.status;
    }

    const locationRaw = getVal(row, cols.location) || getVal(row, cols.siteCode);
    const owner = getVal(row, cols.owner) || getVal(row, cols.serverOwner);
    const applicationName = getVal(row, cols.application);
    const supportGroup = getVal(row, cols.supportGroup);
    const applicationDL = getVal(row, cols.applicationDL);
    const monitoringStatus = getVal(row, cols.monitoringStatus);
    const monitoringTool = getVal(row, cols.monitoringTool);
    const migrationStatus = getVal(row, cols.migrationStatus);
    const patchingStatus = getVal(row, cols.patchingStatus);
    const hmcRaw = getVal(row, cols.hmc);
    const frameRaw = getVal(row, cols.frame);
    if (hmcRaw) lastHmc = hmcRaw;
    if (frameRaw) lastFrame = frameRaw;
    const hmc = hmcRaw || lastHmc;
    const frame = frameRaw || lastFrame;
    const domain = getVal(row, cols.domain);
    const kernelVersion = getVal(row, cols.kernelVersion);
    const currentOsVersion = getVal(row, cols.currentOsVersion);
    const latestOsVersion = getVal(row, cols.latestOsVersion);
    const comments = getVal(row, cols.comments);
    const managedBy = getVal(row, cols.managedBy);

    const datacenterName = getVal(row, cols.datacenter);
    const clusterName = getVal(row, cols.cluster);
    const reviewStatus = getVal(row, cols.review);
    const legalReqRaw = getVal(row, cols.legalRequirement);
    const memoryGbRaw = getVal(row, cols.memoryGb);
    const vcpuCountRaw = getVal(row, cols.vcpuCount);
    const totalDiskGbRaw = getVal(row, cols.totalDiskGb);
    const serverType = getVal(row, cols.serverType);

    const memoryGb = memoryGbRaw ? parseFloat(memoryGbRaw) || undefined : undefined;
    const vcpuCount = vcpuCountRaw ? parseInt(vcpuCountRaw, 10) || undefined : undefined;
    const totalDiskGb = totalDiskGbRaw ? parseFloat(totalDiskGbRaw) || undefined : undefined;

    const enrichmentData: Record<string, any> = {
      source: "Server Inventory",
      sheetName,
      category,
      applicationName: applicationName || undefined,
      owner: owner || undefined,
      managedBy: managedBy || undefined,
      supportGroup: supportGroup || undefined,
      applicationDL: applicationDL || undefined,
      environment: environment || undefined,
      location: locationRaw || undefined,
      monitoringStatus: monitoringStatus || undefined,
      monitoringTool: monitoringTool || undefined,
      migrationStatus: migrationStatus || undefined,
      patchingStatus: patchingStatus || undefined,
      hmc: hmc || undefined,
      frame: frame || undefined,
      domain: domain || undefined,
      kernelVersion: kernelVersion || undefined,
      currentOsVersion: currentOsVersion || undefined,
      latestOsVersion: latestOsVersion || undefined,
      comments: comments || undefined,
      datacenterName: datacenterName || undefined,
      clusterName: clusterName || undefined,
      vmName: vmNameRaw || undefined,
      fqdn: (hostnameRaw && hostnameRaw.includes(".")) ? hostnameRaw : (vmNameRaw && vmNameRaw.includes(".")) ? vmNameRaw : undefined,
      alreadyDecommissioned: alreadyDecomRaw || undefined,
      plannedDecommissioned: plannedDecomRaw || undefined,
      decommissionStatus: decomInfo.decommissionStatus !== "none" ? decomInfo.decommissionStatus : undefined,
      decommissionTimeline: plannedDecomRaw ? normalizeDecomTimeline(plannedDecomRaw) : undefined,
      reviewStatus: reviewStatus || undefined,
      legalRequirement: legalReqRaw ? legalReqRaw.toLowerCase().trim() === "yes" : undefined,
      memoryGB: memoryGb,
      vCPUcount: vcpuCount,
      totalVmdkSizeGB: totalDiskGb,
      serverType: serverType || undefined,
    };

    Object.keys(enrichmentData).forEach(k => {
      if (enrichmentData[k] === undefined || enrichmentData[k] === "" || enrichmentData[k] === false) delete enrichmentData[k];
    });

    const ipRaw = getVal(row, cols.ip);

    const asset: ParsedAsset = {
      hostname: vmNameRaw || hostnameRaw || hostname,
      ipAddress: ipRaw || undefined,
      operatingSystem: os || undefined,
      endpointType: inferEndpointType(hostname, os, machineType),
      deploymentType: deploymentType !== "Unknown" ? deploymentType : undefined,
      cloudProvider: cloudProvider || undefined,
      systemManufacturer: manufacturer || undefined,
      systemModel: getVal(row, cols.model) || undefined,
      biosSerialNumber: getVal(row, cols.serialNo) || undefined,
      totalPhysicalMemory: memoryGb ? `${memoryGb} GB` : undefined,
      processor: vcpuCount ? `${vcpuCount} vCPU` : undefined,
      storageInfo: totalDiskGb ? `${totalDiskGb} GB` : undefined,
      status,
      source: "Server Inventory",
      tags: [category, environment, serverType].filter(Boolean).join(", "),
      user: owner || undefined,
      lastLoggedInUser: managedBy || undefined,
      enrichmentData,
    };

    assets.push(asset);
  }

  return assets;
}

function parseEOLSheet(workbook: XLSX.WorkBook, sheetName: string, headers: string[]): EOLReference[] {
  const rows = getSheetData(workbook, sheetName);
  const entries: EOLReference[] = [];

  const vendorCol = findColumn(headers, ["Vendors", "Vendor", "Publisher"]);
  const productCol = findColumn(headers, ["Product Name", "Product", "Software"]);
  const versionCol = findColumn(headers, ["EOS Version", "Version", "Product Version"]);
  const eosDateCol = findColumn(headers, ["EOS Date", "End of Support", "End_of_Support"]);
  const eolDateCol = findColumn(headers, ["EOL Date", "End of Life", "End_of_Life"]);
  const extendedEosCol = findColumn(headers, ["Extended EOS Date", "Extended Support", "Extended_EOS"]);
  const serverCountCol = findColumn(headers, ["Servers count", "Server Count", "Count"]);
  const renewalContactCol = findColumn(headers, ["Renewal contact", "Renewal Contact", "Contact"]);
  const nextRenewalCol = findColumn(headers, ["Next Renewal Date", "Next Renewal", "Renewal Date"]);

  for (const row of rows) {
    const vendor = getVal(row, vendorCol);
    const product = getVal(row, productCol);
    const version = getVal(row, versionCol);

    if (!product && !vendor) continue;

    const eosDate = getVal(row, eosDateCol);
    const eolDate = getVal(row, eolDateCol);
    const extendedEos = getVal(row, extendedEosCol);
    const serverCount = getVal(row, serverCountCol);
    const renewalContact = getVal(row, renewalContactCol);
    const nextRenewal = getVal(row, nextRenewalCol);

    entries.push({
      vendor: vendor || "Unknown",
      product: product || "Unknown",
      version: version || "",
      eosDate: eosDate || null,
      eolDate: eolDate || null,
      extendedEosDate: extendedEos || null,
      serverCount: serverCount ? parseInt(serverCount, 10) || undefined : undefined,
      renewalContact: renewalContact || undefined,
      nextRenewalDate: nextRenewal || undefined,
    });
  }

  return entries;
}

function parseDecomSheet(workbook: XLSX.WorkBook, sheetName: string, headers: string[]): ParsedAsset[] {
  const rows = getSheetData(workbook, sheetName);
  const assets: ParsedAsset[] = [];

  const hostnameCol = findColumn(headers, COLUMN_ALIASES.hostname) || (headers.length > 0 ? headers[0] : undefined);

  for (const row of rows) {
    const hostname = getVal(row, hostnameCol);
    if (!hostname) continue;

    const ipCol = findColumn(headers, COLUMN_ALIASES.ip);
    const osCol = findColumn(headers, COLUMN_ALIASES.os);

    const asset: ParsedAsset = {
      hostname,
      ipAddress: getVal(row, ipCol) || undefined,
      operatingSystem: getVal(row, osCol) || undefined,
      status: "decommissioned",
      source: "Server Inventory",
      endpointType: "Server",
      tags: "Decommissioned",
      enrichmentData: {
        source: "Server Inventory",
        sheetName,
        category: "Decommissioned",
        status: "decommissioned",
      },
    };

    assets.push(asset);
  }

  return assets;
}

function parseDecomSheetEnhanced(workbook: XLSX.WorkBook, sheetName: string, headers: string[]): ParsedAsset[] {
  const decomSubType = detectDecomSubType(sheetName);

  let rows: Record<string, any>[];
  let effectiveHeaders = headers;

  const standardHeaders = getSheetHeaders(workbook, sheetName);
  if (standardHeaders.length < 3) {
    effectiveHeaders = getSheetHeadersAtRow(workbook, sheetName, 2);
    rows = getSheetDataWithHeaderRow(workbook, sheetName, 2);
  } else {
    effectiveHeaders = standardHeaders;
    rows = getSheetData(workbook, sheetName);
  }

  const assets: ParsedAsset[] = [];

  const cols = {
    hostname: findColumn(effectiveHeaders, COLUMN_ALIASES.hostname),
    vmName: findColumn(effectiveHeaders, COLUMN_ALIASES.vmName),
    ip: findColumn(effectiveHeaders, COLUMN_ALIASES.ip),
    os: findColumn(effectiveHeaders, COLUMN_ALIASES.os),
    application: findColumn(effectiveHeaders, COLUMN_ALIASES.application),
    owner: findColumn(effectiveHeaders, COLUMN_ALIASES.owner),
    datacenter: findColumn(effectiveHeaders, COLUMN_ALIASES.datacenter),
    cluster: findColumn(effectiveHeaders, COLUMN_ALIASES.cluster),
    alreadyDecommissioned: findColumn(effectiveHeaders, COLUMN_ALIASES.alreadyDecommissioned),
    plannedDecommissioned: findColumn(effectiveHeaders, COLUMN_ALIASES.plannedDecommissioned),
    review: findColumn(effectiveHeaders, COLUMN_ALIASES.review),
    legalRequirement: findColumn(effectiveHeaders, COLUMN_ALIASES.legalRequirement),
    memoryGb: findColumn(effectiveHeaders, COLUMN_ALIASES.memoryGb),
    vcpuCount: findColumn(effectiveHeaders, COLUMN_ALIASES.vcpuCount),
    totalDiskGb: findColumn(effectiveHeaders, COLUMN_ALIASES.totalDiskGb),
    serverType: findColumn(effectiveHeaders, COLUMN_ALIASES.serverType),
  };

  for (const row of rows) {
    const hostnameRaw = getVal(row, cols.hostname);
    const vmNameRaw = getVal(row, cols.vmName);
    const hostname = hostnameRaw || vmNameRaw;
    if (!hostname) continue;

    const osRaw = getVal(row, cols.os);
    const os = normalizeOS(osRaw, "", "Decommissioned");

    const alreadyDecomRaw = getVal(row, cols.alreadyDecommissioned);
    const plannedDecomRaw = getVal(row, cols.plannedDecommissioned);

    let status: string;
    let decomStatus: string;
    if (decomSubType === "already") {
      status = "decommissioned";
      decomStatus = "decommissioned";
    } else if (decomSubType === "planned") {
      status = "active";
      decomStatus = "planned";
    } else {
      const info = deriveDecomStatus(alreadyDecomRaw, plannedDecomRaw);
      status = info.status;
      decomStatus = info.decommissionStatus;
    }

    const datacenterName = getVal(row, cols.datacenter);
    const clusterName = getVal(row, cols.cluster);
    const reviewStatus = getVal(row, cols.review);
    const legalReqRaw = getVal(row, cols.legalRequirement);
    const memoryGbRaw = getVal(row, cols.memoryGb);
    const vcpuCountRaw = getVal(row, cols.vcpuCount);
    const totalDiskGbRaw = getVal(row, cols.totalDiskGb);
    const serverType = getVal(row, cols.serverType);
    const applicationName = getVal(row, cols.application);
    const owner = getVal(row, cols.owner);

    const memoryGb = memoryGbRaw ? parseFloat(memoryGbRaw) || undefined : undefined;
    const vcpuCount = vcpuCountRaw ? parseInt(vcpuCountRaw, 10) || undefined : undefined;
    const totalDiskGb = totalDiskGbRaw ? parseFloat(totalDiskGbRaw) || undefined : undefined;

    const enrichmentData: Record<string, any> = {
      source: "Server Inventory",
      sheetName,
      category: "Decommissioned",
      decommissionStatus: decomStatus,
      decommissionTimeline: plannedDecomRaw ? normalizeDecomTimeline(plannedDecomRaw) : undefined,
      alreadyDecommissioned: alreadyDecomRaw || undefined,
      plannedDecommissioned: plannedDecomRaw || undefined,
      datacenterName: datacenterName || undefined,
      clusterName: clusterName || undefined,
      vmName: vmNameRaw || undefined,
      applicationName: applicationName || undefined,
      owner: owner || undefined,
      reviewStatus: reviewStatus || undefined,
      legalRequirement: legalReqRaw ? legalReqRaw.toLowerCase().trim() === "yes" : undefined,
      memoryGB: memoryGb,
      vCPUcount: vcpuCount,
      totalVmdkSizeGB: totalDiskGb,
      serverType: serverType || undefined,
    };

    Object.keys(enrichmentData).forEach(k => {
      if (enrichmentData[k] === undefined || enrichmentData[k] === "" || enrichmentData[k] === false) delete enrichmentData[k];
    });

    const asset: ParsedAsset = {
      hostname: vmNameRaw || hostnameRaw || hostname,
      ipAddress: getVal(row, cols.ip) || undefined,
      operatingSystem: os || undefined,
      status,
      source: "Server Inventory",
      endpointType: "Server",
      totalPhysicalMemory: memoryGb ? `${memoryGb} GB` : undefined,
      processor: vcpuCount ? `${vcpuCount} vCPU` : undefined,
      storageInfo: totalDiskGb ? `${totalDiskGb} GB` : undefined,
      tags: ["Decommissioned", serverType].filter(Boolean).join(", "),
      user: owner || undefined,
      enrichmentData,
    };

    assets.push(asset);
  }

  return assets;
}

function mergeAsset(existing: ParsedAsset, incoming: ParsedAsset): void {
  if (!existing.ipAddress && incoming.ipAddress) existing.ipAddress = incoming.ipAddress;
  if (!existing.operatingSystem && incoming.operatingSystem) existing.operatingSystem = incoming.operatingSystem;
  if (!existing.systemManufacturer && incoming.systemManufacturer) existing.systemManufacturer = incoming.systemManufacturer;
  if (!existing.systemModel && incoming.systemModel) existing.systemModel = incoming.systemModel;
  if (!existing.biosSerialNumber && incoming.biosSerialNumber) existing.biosSerialNumber = incoming.biosSerialNumber;
  if (!existing.deploymentType && incoming.deploymentType) existing.deploymentType = incoming.deploymentType;
  if (!existing.cloudProvider && incoming.cloudProvider) existing.cloudProvider = incoming.cloudProvider;

  const existingEd = existing.enrichmentData || {};
  const incomingEd = incoming.enrichmentData || {};

  for (const [key, value] of Object.entries(incomingEd)) {
    if (value && !existingEd[key]) {
      existingEd[key] = value;
    }
  }

  if (incomingEd.source) {
    const sources = existingEd.sources || [existingEd.source];
    if (!sources.includes(incomingEd.source)) {
      sources.push(incomingEd.source);
    }
    existingEd.sources = sources;
  }

  existing.enrichmentData = existingEd;
}

ParserRegistry.register(serverInventoryParser);

export { serverInventoryParser };
