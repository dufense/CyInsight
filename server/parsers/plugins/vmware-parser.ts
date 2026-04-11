import XLSX from "xlsx";
import type { BaseParser, ParseResult, ParsedAsset, EOLReference } from "../base-parser";
import {
  getSheetData,
  getSheetHeaders,
  getVal,
  findColumn,
  normalizeHostname,
  parseExcelDate,
  normalizeOS,
  calculateRiskScore,
  classifyWorkload,
  emptyParseResult,
} from "../base-parser";
import { ParserRegistry } from "../parser-registry";

const PARSER_NAME = "VMware Infrastructure (RVTools)";

function safeNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function mibToGB(mib: number): string {
  if (!mib) return "";
  return (mib / 1024).toFixed(1) + " GB";
}

const vmwareParser: BaseParser = {
  name: PARSER_NAME,
  description: "Parses RVTools-style VMware infrastructure exports with multi-sheet VM, host, cluster, datastore, snapshot, and network data",

  detect(workbook: XLSX.WorkBook, sheetNames: string[], sampleHeaders: Record<string, string[]>): number {
    const lowerSheets = sheetNames.map(s => s.toLowerCase());

    const hasVInfo = lowerSheets.includes("vinfo");
    const hasVHost = lowerSheets.includes("vhost");
    const hasVCluster = lowerSheets.includes("vcluster");
    const hasVDatastore = lowerSheets.includes("vdatastore");

    if (hasVInfo && hasVHost) {
      return 95;
    }

    if (hasVInfo) {
      const vInfoHeaders = sampleHeaders[sheetNames[lowerSheets.indexOf("vinfo")]] || [];
      const lowerHeaders = vInfoHeaders.map(h => h.toLowerCase());
      const vmwareIndicators = ["vm", "powerstate", "datacenter", "cluster", "esxi", "vcenter", "vmware tools"];
      const matchCount = vmwareIndicators.filter(ind => lowerHeaders.some(h => h.includes(ind))).length;
      if (matchCount >= 3) return 70;
    }

    const allHeaders = Object.values(sampleHeaders).flat().map(h => h.toLowerCase());
    const vmwareColumns = ["vm", "datacenter", "cluster", "host", "powerstate", "esxi", "vi sdk server"];
    const colMatches = vmwareColumns.filter(col => allHeaders.some(h => h.includes(col))).length;

    const vCenterColumns = ["vm name", "cpus", "memory", "nics", "disks", "total disk capacity", "primary ip", "os according to", "vi sdk server", "vm id"];
    const vCenterMatches = vCenterColumns.filter(col => allHeaders.some(h => h.includes(col))).length;
    if (vCenterMatches >= 5) return 85;

    if (colMatches >= 4) return 70;
    if (colMatches >= 3) return 50;

    return 0;
  },

  parse(workbook: XLSX.WorkBook): ParseResult {
    const result = emptyParseResult(PARSER_NAME);
    const sheetNames = workbook.SheetNames;
    const lowerSheets = sheetNames.map(s => s.toLowerCase());
    const hasVInfo = lowerSheets.includes("vinfo");

    if (!hasVInfo) {
      const flatHeaders = getSheetHeaders(workbook, sheetNames[0]).map(h => h.toLowerCase());
      const vCenterCols = ["vm name", "cpus", "memory", "total disk capacity", "primary ip", "os according to", "vi sdk server"];
      const isFlatVCenter = vCenterCols.filter(col => flatHeaders.some(h => h.includes(col))).length >= 4;
      if (isFlatVCenter) {
        return parseFlatVCenterExport(workbook, result);
      }
    }

    const vInfoData = getSheetData(workbook, findSheetName(sheetNames, "vInfo"));
    const vCPUData = getSheetData(workbook, findSheetName(sheetNames, "vCPU"));
    const vMemoryData = getSheetData(workbook, findSheetName(sheetNames, "vMemory"));
    const vDiskData = getSheetData(workbook, findSheetName(sheetNames, "vDisk"));
    const vNetworkData = getSheetData(workbook, findSheetName(sheetNames, "vNetwork"));
    const vHostData = getSheetData(workbook, findSheetName(sheetNames, "vHost"));
    const vSnapshotData = getSheetData(workbook, findSheetName(sheetNames, "vSnapshot"));
    const vClusterData = getSheetData(workbook, findSheetName(sheetNames, "vCluster"));
    const vDatastoreData = getSheetData(workbook, findSheetName(sheetNames, "vDatastore"));
    const vToolsData = getSheetData(workbook, findSheetName(sheetNames, "vTools"));
    const vLicenseData = getSheetData(workbook, findSheetName(sheetNames, "vLicense"));

    const cpuMap = buildLookup(vCPUData, "VM");
    const memoryMap = buildLookup(vMemoryData, "VM");
    const toolsMap = buildLookup(vToolsData, "VM");

    const diskMap = buildMultiLookup(vDiskData, "VM");
    const networkMap = buildMultiLookup(vNetworkData, "VM");
    const snapshotMap = buildMultiLookup(vSnapshotData, "VM");

    const sheetsProcessed: string[] = [];
    const recordsPerSheet: Record<string, number> = {};

    if (vInfoData.length) { sheetsProcessed.push("vInfo"); recordsPerSheet["vInfo"] = vInfoData.length; }
    if (vCPUData.length) { sheetsProcessed.push("vCPU"); recordsPerSheet["vCPU"] = vCPUData.length; }
    if (vMemoryData.length) { sheetsProcessed.push("vMemory"); recordsPerSheet["vMemory"] = vMemoryData.length; }
    if (vDiskData.length) { sheetsProcessed.push("vDisk"); recordsPerSheet["vDisk"] = vDiskData.length; }
    if (vNetworkData.length) { sheetsProcessed.push("vNetwork"); recordsPerSheet["vNetwork"] = vNetworkData.length; }
    if (vHostData.length) { sheetsProcessed.push("vHost"); recordsPerSheet["vHost"] = vHostData.length; }
    if (vSnapshotData.length) { sheetsProcessed.push("vSnapshot"); recordsPerSheet["vSnapshot"] = vSnapshotData.length; }
    if (vClusterData.length) { sheetsProcessed.push("vCluster"); recordsPerSheet["vCluster"] = vClusterData.length; }
    if (vDatastoreData.length) { sheetsProcessed.push("vDatastore"); recordsPerSheet["vDatastore"] = vDatastoreData.length; }
    if (vToolsData.length) { sheetsProcessed.push("vTools"); recordsPerSheet["vTools"] = vToolsData.length; }
    if (vLicenseData.length) { sheetsProcessed.push("vLicense"); recordsPerSheet["vLicense"] = vLicenseData.length; }

    let poweredOnVMs = 0;
    const datacenters = new Set<string>();
    const clusters = new Set<string>();

    for (const row of vInfoData) {
      const vmName = getVal(row, "VM");
      if (!vmName) continue;

      const isTemplate = getVal(row, "Template") === "True" || getVal(row, "Template") === "true";
      if (isTemplate) continue;

      const powerstate = getVal(row, "Powerstate");
      const isPoweredOn = powerstate.toLowerCase() === "poweredon";
      if (isPoweredOn) poweredOnVMs++;

      const datacenter = getVal(row, "Datacenter");
      const cluster = getVal(row, "Cluster");
      const host = getVal(row, "Host");
      if (datacenter) datacenters.add(datacenter);
      if (cluster) clusters.add(cluster);

      const osConfig = getVal(row, "OS according to the configuration file");
      const osTools = getVal(row, "OS according to the VMware Tools");
      const os = normalizeOS(osTools || osConfig);

      const cpuInfo = cpuMap.get(vmName);
      const memInfo = memoryMap.get(vmName);
      const toolsInfo = toolsMap.get(vmName);
      const disks = diskMap.get(vmName) || [];
      const networks = networkMap.get(vmName) || [];
      const snapshots = snapshotMap.get(vmName) || [];

      const cpuCount = safeNum(getVal(row, "CPUs")) || (cpuInfo ? safeNum(getVal(cpuInfo, "CPUs")) : 0);
      const memorySizeMiB = safeNum(getVal(row, "Memory")) || (memInfo ? safeNum(getVal(memInfo, "Size MiB")) : 0);
      const totalDiskMiB = safeNum(getVal(row, "Total disk capacity MiB"));

      const primaryIP = getVal(row, "Primary IP Address");
      const dnsName = getVal(row, "DNS Name");

      let ipv4 = "";
      let macAddress = "";
      const networkNames: string[] = [];
      for (const nic of networks) {
        if (!ipv4) ipv4 = getVal(nic, "IPv4 Address");
        if (!macAddress) macAddress = getVal(nic, "Mac Address");
        const netName = getVal(nic, "Network");
        if (netName && !networkNames.includes(netName)) networkNames.push(netName);
      }

      const staleSnapshots = snapshots.filter(s => {
        const snapDate = parseExcelDate(s["Date / time"]);
        if (!snapDate) return false;
        const daysSince = (Date.now() - snapDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 30;
      });

      const toolsStatus = toolsInfo ? getVal(toolsInfo, "Tools") : "";
      const toolsVersion = toolsInfo ? getVal(toolsInfo, "Tools Version") : "";
      const hwVersion = getVal(row, "HW version");
      const firmware = getVal(row, "Firmware");
      const annotation = getVal(row, "Annotation");
      const folder = getVal(row, "Folder");
      const resourcePool = getVal(row, "Resource pool");

      const cpuDetail = cpuInfo ? {
        sockets: safeNum(getVal(cpuInfo, "Sockets")),
        coresPerSocket: safeNum(getVal(cpuInfo, "Cores p/s")),
      } : undefined;

      const memDetail = memInfo ? {
        consumed: safeNum(getVal(memInfo, "Consumed")),
        active: safeNum(getVal(memInfo, "Active")),
        ballooned: safeNum(getVal(memInfo, "Ballooned")),
        swapped: safeNum(getVal(memInfo, "Swapped")),
      } : undefined;

      const diskDetails = disks.map(d => ({
        name: getVal(d, "Disk"),
        capacityMiB: safeNum(getVal(d, "Capacity MiB")),
        thin: getVal(d, "Thin") === "True" || getVal(d, "Thin") === "true",
        diskMode: getVal(d, "Disk Mode"),
      }));

      const networkDetails = networks.map(n => ({
        label: getVal(n, "NIC label"),
        network: getVal(n, "Network"),
        macAddress: getVal(n, "Mac Address"),
        ipv4: getVal(n, "IPv4 Address"),
        ipv6: getVal(n, "IPv6 Address"),
        connected: getVal(n, "Connected") === "True" || getVal(n, "Connected") === "true",
        adapterType: getVal(n, "Type"),
        switch: getVal(n, "Switch"),
      }));

      const snapshotDetails = snapshots.map(s => ({
        name: getVal(s, "Name"),
        description: getVal(s, "Description"),
        dateTime: getVal(s, "Date / time"),
        sizeMiB: safeNum(getVal(s, "Size MiB (total)")),
        quiesced: getVal(s, "Quiesced"),
      }));

      const creationDate = parseExcelDate(row["Creation date"]);

      const asset: ParsedAsset = {
        hostname: normalizeHostname(vmName),
        ipAddress: primaryIP || ipv4,
        macAddress: macAddress,
        operatingSystem: os,
        endpointType: "Virtual Server",
        deploymentType: "Virtual",
        cloudProvider: "VMware",
        cloudRegion: datacenter || "",
        systemManufacturer: "VMware",
        systemModel: `Virtual Machine (HW ${hwVersion || "N/A"})`,
        processor: cpuCount ? `${cpuCount} vCPU` + (cpuDetail ? ` (${cpuDetail.sockets}s x ${cpuDetail.coresPerSocket}c)` : "") : "",
        totalPhysicalMemory: mibToGB(memorySizeMiB),
        storageInfo: mibToGB(totalDiskMiB),
        status: isPoweredOn ? "active" : powerstate.toLowerCase() === "poweredoff" ? "inactive" : powerstate.toLowerCase(),
        source: "VMware Inventory",
        tags: [datacenter, cluster, folder, resourcePool].filter(Boolean).join(", "),
        enrichmentData: {
          vmName: vmName,
          dnsName: dnsName,
          datacenter: datacenter,
          cluster: cluster,
          esxiHost: host,
          folder: folder,
          resourcePool: resourcePool,
          powerstate: powerstate,
          firmware: firmware,
          hwVersion: hwVersion,
          annotation: annotation,
          toolsStatus: toolsStatus,
          toolsVersion: toolsVersion,
          cpuCount: cpuCount,
          cpuDetail: cpuDetail,
          memorySizeMiB: memorySizeMiB,
          memoryDetail: memDetail,
          totalDiskMiB: totalDiskMiB,
          diskDetails: diskDetails,
          networkDetails: networkDetails,
          networkNames: networkNames,
          snapshotCount: snapshots.length,
          staleSnapshots: staleSnapshots.length,
          snapshotDetails: snapshotDetails,
          provisionedMiB: safeNum(getVal(row, "Provisioned MiB")),
          inUseMiB: safeNum(getVal(row, "In Use MiB")),
          consolidationNeeded: getVal(row, "Consolidation Needed"),
          evcModeKey: getVal(row, "min Required EVC Mode Key"),
          ftState: getVal(row, "FT State"),
          haRestartPriority: getVal(row, "HA Restart Priority"),
          bootFirmware: firmware,
          efiBoot: getVal(row, "EFI Secure boot"),
          creationDate: creationDate?.toISOString(),
          sources: ["VMware/RVTools"],
        },
        createdAt: creationDate,
      };

      const risk = calculateRiskScore(asset);
      asset.riskScore = risk.score;
      asset.riskLevel = risk.level;
      if (asset.enrichmentData) {
        asset.enrichmentData.riskFactors = risk.factors;
      }

      const wl = classifyWorkload(asset);
      result.workloadClassifications.push(wl);

      result.assets.push(asset);
    }

    for (const row of vHostData) {
      const hostName = getVal(row, "Host");
      if (!hostName) continue;

      const datacenter = getVal(row, "Datacenter");
      const cluster = getVal(row, "Cluster");
      if (datacenter) datacenters.add(datacenter);
      if (cluster) clusters.add(cluster);

      const cpuModel = getVal(row, "CPU Model");
      const cpuCount = safeNum(getVal(row, "# CPU"));
      const coresPerCPU = safeNum(getVal(row, "Cores per CPU"));
      const totalCores = safeNum(getVal(row, "# Cores"));
      const memoryMiB = safeNum(getVal(row, "# Memory"));
      const nicCount = safeNum(getVal(row, "# NICs"));
      const hbaCount = safeNum(getVal(row, "# HBAs"));
      const vmCount = safeNum(getVal(row, "# VMs"));
      const cpuUsage = getVal(row, "CPU usage %");
      const memUsage = getVal(row, "Memory usage %");
      const inMaintenance = getVal(row, "in Maintenance Mode") === "True" || getVal(row, "in Maintenance Mode") === "true";
      const speed = getVal(row, "Speed");
      const configStatus = getVal(row, "Config status");

      const hostAsset: ParsedAsset = {
        hostname: normalizeHostname(hostName),
        operatingSystem: "VMware ESXi",
        endpointType: "ESXi Host",
        deploymentType: "Hypervisor",
        cloudProvider: "VMware",
        cloudRegion: datacenter || "",
        systemManufacturer: "VMware",
        processor: cpuModel ? `${cpuCount}x ${cpuModel} (${totalCores} cores)` : `${totalCores} cores`,
        totalPhysicalMemory: mibToGB(memoryMiB),
        status: inMaintenance ? "maintenance" : "active",
        source: "VMware Inventory",
        tags: [datacenter, cluster].filter(Boolean).join(", "),
        enrichmentData: {
          datacenter: datacenter,
          cluster: cluster,
          cpuModel: cpuModel,
          cpuCount: cpuCount,
          coresPerCPU: coresPerCPU,
          totalCores: totalCores,
          cpuSpeed: speed,
          cpuUsagePercent: cpuUsage,
          memoryUsagePercent: memUsage,
          nicCount: nicCount,
          hbaCount: hbaCount,
          vmCount: vmCount,
          configStatus: configStatus,
          inMaintenance: inMaintenance,
          htAvailable: getVal(row, "HT Available"),
          htActive: getVal(row, "HT Active"),
          vmotionSupport: getVal(row, "VMotion support"),
          storageVmotionSupport: getVal(row, "Storage VMotion support"),
          vCPUs: safeNum(getVal(row, "# vCPUs")),
          vCPUsPerCore: getVal(row, "vCPUs per Core"),
          vRAM: getVal(row, "vRAM"),
          sources: ["VMware/RVTools"],
        },
      };

      result.infrastructureAssets.push(hostAsset);
    }

    const clusterDetails: Record<string, any>[] = [];
    for (const row of vClusterData) {
      const clusterName = getVal(row, "Name");
      if (!clusterName) continue;

      clusterDetails.push({
        name: clusterName,
        numHosts: safeNum(getVal(row, "NumHosts")),
        numEffectiveHosts: safeNum(getVal(row, "numEffectiveHosts")),
        totalCpu: safeNum(getVal(row, "TotalCpu")),
        numCpuCores: safeNum(getVal(row, "NumCpuCores")),
        totalMemory: safeNum(getVal(row, "TotalMemory")),
        effectiveMemory: safeNum(getVal(row, "Effective Memory")),
        haEnabled: getVal(row, "HA enabled"),
        drsEnabled: getVal(row, "DRS enabled"),
        dpmEnabled: getVal(row, "DPM enabled"),
        numVMotions: safeNum(getVal(row, "Num VMotions")),
        failoverLevel: safeNum(getVal(row, "Failover Level")),
      });
    }

    const datastoreDetails: Record<string, any>[] = [];
    for (const row of vDatastoreData) {
      const dsName = getVal(row, "Name");
      if (!dsName) continue;

      datastoreDetails.push({
        name: dsName,
        type: getVal(row, "Type"),
        capacityMiB: safeNum(getVal(row, "Capacity MiB")),
        inUseMiB: safeNum(getVal(row, "In Use MiB")),
        freeMiB: safeNum(getVal(row, "Free MiB")),
        freePercent: getVal(row, "Free %"),
        vmCount: safeNum(getVal(row, "# VMs")),
        hostCount: safeNum(getVal(row, "# Hosts")),
        siocEnabled: getVal(row, "SIOC enabled"),
        accessible: getVal(row, "Accessible"),
        version: getVal(row, "Version"),
        clusterName: getVal(row, "Cluster name"),
      });
    }

    const licenseDetails: Record<string, any>[] = [];
    for (const row of vLicenseData) {
      const licenseName = getVal(row, "Name");
      if (!licenseName) continue;

      licenseDetails.push({
        name: licenseName,
        costUnit: getVal(row, "Cost Unit"),
        total: safeNum(getVal(row, "Total")),
        used: safeNum(getVal(row, "Used")),
        expirationDate: getVal(row, "Expiration Date"),
        features: getVal(row, "Features"),
      });
    }

    const eolData: EOLReference[] = [];

    const esxiVersions = new Map<string, number>();
    for (const hostAsset of result.infrastructureAssets) {
      const os = hostAsset.operatingSystem || "";
      if (os) {
        esxiVersions.set(os, (esxiVersions.get(os) || 0) + 1);
      }
    }

    result.eolData = eolData;

    let staleSnapshotCount = 0;
    let outdatedToolsCount = 0;
    let decomCount = 0;

    for (const asset of result.assets) {
      const ed = asset.enrichmentData || {};
      if (ed.staleSnapshots > 0) staleSnapshotCount++;
      if (ed.toolsStatus && !["guestToolsCurrent", "toolsOk", ""].includes(ed.toolsStatus)) outdatedToolsCount++;
      if (asset.status === "inactive" || asset.status === "decommissioned") decomCount++;
    }

    const platformBreakdown: Record<string, number> = {};
    for (const asset of [...result.assets, ...result.infrastructureAssets]) {
      const os = (asset.operatingSystem || "Unknown").split(" ")[0];
      platformBreakdown[os] = (platformBreakdown[os] || 0) + 1;
    }

    const wlCounts = { rehost: 0, replatform: 0, retain: 0, retire: 0, quickWins: 0 };
    for (const wl of result.workloadClassifications) {
      const key = wl.recommendation.toLowerCase() as keyof typeof wlCounts;
      wlCounts[key]++;
      if (wl.quickWin) wlCounts.quickWins++;
    }

    result.summary = {
      parserName: PARSER_NAME,
      confidence: 95,
      sheetsProcessed,
      totalRecords: result.assets.length + result.infrastructureAssets.length,
      recordsPerSheet,
      newAssets: result.assets.length + result.infrastructureAssets.length,
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
        staleSnapshotCount,
        outdatedToolsCount,
        decomCount,
      },
      infrastructureSummary: {
        esxiHostCount: result.infrastructureAssets.length,
        clusterCount: clusters.size,
        datastoreCount: datastoreDetails.length,
        datacenterCount: datacenters.size,
        totalVMs: result.assets.length,
        poweredOnVMs,
      },
      workloadClassification: wlCounts,
      platformBreakdown,
    };

    return result;
  },
};

function parseFlatVCenterExport(workbook: XLSX.WorkBook, result: ParseResult): ParseResult {
  const sheetNames = workbook.SheetNames;
  const processedSheets: string[] = [];
  const seenHostnames = new Set<string>();
  let poweredOnVMs = 0;
  const datacenters = new Set<string>();
  const clusters = new Set<string>();
  const esxiHosts = new Set<string>();

  for (const sheetName of sheetNames) {
    const data = getSheetData(workbook, sheetName);
    if (!data.length) continue;

    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    const hasVMName = headers.some(h => h.includes("vm name") || h.includes("system name"));
    if (!hasVMName) continue;

    processedSheets.push(sheetName);

    for (const row of data) {
      const vmName = getVal(row, "VM Name or System name") || getVal(row, "VM Name") || getVal(row, "VM");
      if (!vmName) continue;

      const hostname = normalizeHostname(vmName);
      if (seenHostnames.has(hostname.toLowerCase())) continue;
      seenHostnames.add(hostname.toLowerCase());

      const powerstate = getVal(row, "Powerstate");
      const isPoweredOn = powerstate.toLowerCase() === "poweredon";
      if (isPoweredOn) poweredOnVMs++;

      const datacenter = getVal(row, "Datacenter");
      const cluster = getVal(row, "Cluster");
      const host = getVal(row, "Host");
      if (datacenter) datacenters.add(datacenter);
      if (cluster) clusters.add(cluster);
      if (host) esxiHosts.add(host);

      const osConfig = getVal(row, "OS according to the configuration file");
      const osTools = getVal(row, "OS according to the VMware Tools");
      const os = normalizeOS(osTools || osConfig);

      const cpuCount = safeNum(getVal(row, "CPUs"));
      const memorySizeMiB = safeNum(getVal(row, "Memory"));
      const totalDiskMiB = safeNum(getVal(row, "Total disk capacity MiB"));
      const nicCount = safeNum(getVal(row, "NICs"));
      const diskCount = safeNum(getVal(row, "Disks"));

      const primaryIP = getVal(row, "Primary IP Address");
      const dnsName = getVal(row, "DNS Name");
      const firmware = getVal(row, "Firmware");
      const configStatus = getVal(row, "Config status");
      const connectionState = getVal(row, "Connection state");
      const guestState = getVal(row, "Guest state");
      const heartbeat = getVal(row, "Heartbeat");
      const consolidationNeeded = getVal(row, "Consolidation Needed");
      const networkName = getVal(row, "Network #1");
      const videoRam = getVal(row, "Video Ram KiB");
      const dasProtection = getVal(row, "DAS protection");
      const ftLatency = getVal(row, "FT Latency");
      const vmId = getVal(row, "VM ID");
      const vCenterVersion = getVal(row, "VI SDK Server type");

      const isValidIP = primaryIP && !primaryIP.startsWith("fe80") && !primaryIP.startsWith("169.254");

      const asset: ParsedAsset = {
        hostname: hostname,
        ipAddress: isValidIP ? primaryIP : undefined,
        operatingSystem: os,
        endpointType: "Virtual Server",
        endpointGroup: cluster || undefined,
        deploymentType: "Virtual",
        cloudProvider: "VMware",
        cloudRegion: datacenter || "",
        systemManufacturer: "VMware",
        systemModel: "Virtual Machine",
        processor: cpuCount ? `${cpuCount} vCPU` : "",
        totalPhysicalMemory: mibToGB(memorySizeMiB),
        storageInfo: mibToGB(totalDiskMiB),
        status: isPoweredOn ? "active" : powerstate.toLowerCase() === "poweredoff" ? "inactive" : powerstate.toLowerCase(),
        source: "VMware Inventory",
        tags: [datacenter, cluster].filter(Boolean).join(", "),
        enrichmentData: {
          vmName: vmName,
          dnsName: dnsName,
          datacenter: datacenter,
          cluster: cluster,
          esxiHost: host,
          powerstate: powerstate,
          firmware: firmware,
          configStatus: configStatus,
          connectionState: connectionState,
          guestState: guestState,
          heartbeat: heartbeat,
          consolidationNeeded: consolidationNeeded,
          cpuCount: cpuCount,
          memorySizeMiB: memorySizeMiB,
          totalDiskMiB: totalDiskMiB,
          nicCount: nicCount,
          diskCount: diskCount,
          networkNames: networkName ? [networkName] : [],
          videoRamKiB: safeNum(videoRam),
          dasProtection: dasProtection,
          ftLatency: ftLatency,
          vmId: vmId,
          vCenterVersion: vCenterVersion,
          bootFirmware: firmware,
          sources: ["VMware/vCenter"],
        },
      };

      const risk = calculateRiskScore(asset);
      asset.riskScore = risk.score;
      asset.riskLevel = risk.level;
      if (asset.enrichmentData) {
        asset.enrichmentData.riskFactors = risk.factors;
      }

      const wl = classifyWorkload(asset);
      result.workloadClassifications.push(wl);
      result.assets.push(asset);
    }
  }

  for (const host of esxiHosts) {
    const hostAsset: ParsedAsset = {
      hostname: normalizeHostname(host),
      operatingSystem: "VMware ESXi",
      endpointType: "ESXi Host",
      deploymentType: "Hypervisor",
      cloudProvider: "VMware",
      systemManufacturer: "VMware",
      status: "active",
      source: "VMware Inventory",
      enrichmentData: { sources: ["VMware/vCenter"] },
    };
    result.infrastructureAssets.push(hostAsset);
  }

  const platformBreakdown: Record<string, number> = {};
  for (const asset of [...result.assets, ...result.infrastructureAssets]) {
    const os = (asset.operatingSystem || "Unknown").split(" ")[0];
    platformBreakdown[os] = (platformBreakdown[os] || 0) + 1;
  }

  let decomCount = 0;
  for (const asset of result.assets) {
    if (asset.status === "inactive" || asset.status === "decommissioned") decomCount++;
  }

  const wlCounts = { rehost: 0, replatform: 0, retain: 0, retire: 0, quickWins: 0 };
  for (const wl of result.workloadClassifications) {
    const key = wl.recommendation.toLowerCase() as keyof typeof wlCounts;
    if (key in wlCounts) wlCounts[key]++;
    if (wl.quickWin) wlCounts.quickWins++;
  }

  result.summary = {
    parserName: PARSER_NAME,
    confidence: 85,
    sheetsProcessed: processedSheets,
    totalRecords: result.assets.length + result.infrastructureAssets.length,
    recordsPerSheet: Object.fromEntries(processedSheets.map(s => [s, result.assets.length])),
    newAssets: result.assets.length + result.infrastructureAssets.length,
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
      decomCount,
    },
    infrastructureSummary: {
      esxiHostCount: esxiHosts.size,
      clusterCount: clusters.size,
      datastoreCount: 0,
      datacenterCount: datacenters.size,
      totalVMs: result.assets.length,
      poweredOnVMs,
    },
    workloadClassification: wlCounts,
    platformBreakdown,
  };

  return result;
}

function findSheetName(sheetNames: string[], target: string): string {
  const exact = sheetNames.find(s => s.toLowerCase() === target.toLowerCase());
  if (exact) return exact;
  const partial = sheetNames.find(s => s.toLowerCase().includes(target.toLowerCase()));
  return partial || target;
}

function buildLookup(data: Record<string, any>[], keyColumn: string): Map<string, Record<string, any>> {
  const map = new Map<string, Record<string, any>>();
  for (const row of data) {
    const key = getVal(row, keyColumn);
    if (key && !map.has(key)) {
      map.set(key, row);
    }
  }
  return map;
}

function buildMultiLookup(data: Record<string, any>[], keyColumn: string): Map<string, Record<string, any>[]> {
  const map = new Map<string, Record<string, any>[]>();
  for (const row of data) {
    const key = getVal(row, keyColumn);
    if (key) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
  }
  return map;
}

ParserRegistry.register(vmwareParser);

export default vmwareParser;
