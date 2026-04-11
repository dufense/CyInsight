import type { ParsedAsset, ParseResult, EOLReference, WorkloadClassification } from "./base-parser";
import { normalizeHostname, calculateRiskScore, classifyWorkload } from "./base-parser";
import { enrichAssetsWithAppCategory, buildApplicationIndex, buildStakeholderIndex } from "./application-registry";

export interface CorrelationResult {
  mergedAssets: ParsedAsset[];
  correlationsFound: number;
  newAssets: number;
  updatedAssets: number;
}

export function correlateAssets(
  parsedResults: ParseResult[],
  existingAssets: ParsedAsset[] = []
): {
  assets: ParsedAsset[];
  correlationsFound: number;
  eolData: EOLReference[];
  workloadClassifications: WorkloadClassification[];
} {
  const assetIndex = new Map<string, ParsedAsset>();
  const ipIndex = new Map<string, string>();
  const serialIndex = new Map<string, string>();
  let correlationsFound = 0;
  const allEolData: EOLReference[] = [];

  for (const existing of existingAssets) {
    const key = normalizeHostname(existing.hostname);
    if (key) {
      assetIndex.set(key, { ...existing });
      if (existing.ipAddress) ipIndex.set(existing.ipAddress, key);
      if (existing.biosSerialNumber) serialIndex.set(existing.biosSerialNumber.toLowerCase(), key);
    }
  }

  for (const result of parsedResults) {
    allEolData.push(...result.eolData);

    const allAssets = [...result.assets, ...result.infrastructureAssets];

    for (const asset of allAssets) {
      const key = normalizeHostname(asset.hostname);
      if (!key) continue;

      let matchKey = key;
      let matched = assetIndex.has(key);

      if (!matched && asset.ipAddress) {
        const existingKey = ipIndex.get(asset.ipAddress);
        if (existingKey) {
          matchKey = existingKey;
          matched = true;
        }
      }

      if (!matched && asset.biosSerialNumber) {
        const existingKey = serialIndex.get(asset.biosSerialNumber.toLowerCase());
        if (existingKey) {
          matchKey = existingKey;
          matched = true;
        }
      }

      if (matched) {
        const existing = assetIndex.get(matchKey)!;
        mergeAsset(existing, asset);
        correlationsFound++;
      } else {
        assetIndex.set(key, { ...asset });
        if (asset.ipAddress) ipIndex.set(asset.ipAddress, key);
        if (asset.biosSerialNumber) serialIndex.set(asset.biosSerialNumber.toLowerCase(), key);
      }
    }
  }

  const mergedAssets = Array.from(assetIndex.values());

  enrichAssetsWithAppCategory(mergedAssets);

  applyEolFlags(mergedAssets, allEolData);

  for (const asset of mergedAssets) {
    const risk = calculateRiskScore(asset);
    asset.riskScore = risk.score;
    asset.riskLevel = risk.level;
    if (!asset.enrichmentData) asset.enrichmentData = {};
    asset.enrichmentData.riskFactors = risk.factors;
  }

  const workloadClassifications = mergedAssets.map(a => classifyWorkload(a));

  return {
    assets: mergedAssets,
    correlationsFound,
    eolData: allEolData,
    workloadClassifications,
  };
}

function mergeAsset(target: ParsedAsset, source: ParsedAsset): void {
  const hardwareFields: (keyof ParsedAsset)[] = ["systemManufacturer", "systemModel", "biosSerialNumber", "processor", "totalPhysicalMemory", "storageInfo"];
  const vmFields: (keyof ParsedAsset)[] = ["cloudInstanceId", "cloudProvider"];
  const operationalFields: (keyof ParsedAsset)[] = ["user", "lastLoggedInUser", "deviceHealth", "agentVersion"];

  const isSourceHardware = source.source === "Server Inventory" || (source.deploymentType || "").includes("Physical");
  const isSourceVMware = (source.source || "").includes("VMware");
  const isSourceInventory = (source.source || "").includes("Inventory");

  for (const field of hardwareFields) {
    if (source[field] && (isSourceHardware || !target[field])) {
      (target as any)[field] = source[field];
    }
  }

  for (const field of vmFields) {
    if (source[field] && (isSourceVMware || !target[field])) {
      (target as any)[field] = source[field];
    }
  }

  for (const field of operationalFields) {
    if (source[field] && (isSourceInventory || !target[field])) {
      (target as any)[field] = source[field];
    }
  }

  const simpleFields: (keyof ParsedAsset)[] = [
    "ipAddress", "macAddress", "operatingSystem", "endpointType", "endpointGroup",
    "deploymentType", "cloudRegion", "status", "tags",
  ];
  for (const field of simpleFields) {
    if (source[field] && !target[field]) {
      (target as any)[field] = source[field];
    }
  }

  const targetEd = target.enrichmentData || {};
  const sourceEd = source.enrichmentData || {};

  const sources = targetEd.sources || [];
  sources.push({
    source: source.source || "Unknown",
    importedAt: new Date().toISOString(),
    fields: Object.keys(sourceEd).filter(k => k !== "sources"),
  });

  target.enrichmentData = {
    ...targetEd,
    ...sourceEd,
    sources,
  };

  if (source.softwareInventory && source.softwareInventory.length > 0) {
    const existing = target.softwareInventory || [];
    const merged = [...existing, ...source.softwareInventory];
    const unique = merged.filter((item, idx, arr) =>
      arr.findIndex(i => JSON.stringify(i) === JSON.stringify(item)) === idx
    );
    target.softwareInventory = unique;
  }
}

function applyEolFlags(assets: ParsedAsset[], eolData: EOLReference[]): void {
  if (eolData.length === 0) return;

  for (const asset of assets) {
    const os = (asset.operatingSystem || "").toLowerCase();
    if (!os) continue;

    for (const eol of eolData) {
      const vendor = (eol.vendor || "").toLowerCase();
      const product = (eol.product || "").toLowerCase();
      const version = (eol.version || "").toLowerCase();

      let matches = false;
      if (vendor === "redhat" && (os.includes("red hat") || os.includes("rhel"))) {
        if (os.includes(version)) matches = true;
      } else if (vendor === "suse" && os.includes("suse")) {
        if (os.includes(version)) matches = true;
      } else if (vendor === "ibm" && product === "aix" && os.includes("aix")) {
        if (os.includes(version.split(" ")[0])) matches = true;
      } else if (vendor === "ibm" && product === "vio" && os.includes("vios")) {
        if (os.includes(version)) matches = true;
      }

      if (matches) {
        if (!asset.enrichmentData) asset.enrichmentData = {};
        asset.enrichmentData.eolVendor = eol.vendor;
        asset.enrichmentData.eolProduct = eol.product;
        asset.enrichmentData.eolVersion = eol.version;
        asset.enrichmentData.eosDate = eol.eosDate;
        asset.enrichmentData.eolDate = eol.eolDate;
        asset.enrichmentData.renewalContact = eol.renewalContact;
        asset.enrichmentData.nextRenewalDate = eol.nextRenewalDate;

        if (eol.eolDate) {
          const eolDateObj = new Date(eol.eolDate);
          const now = new Date();
          const sixMonths = new Date();
          sixMonths.setMonth(sixMonths.getMonth() + 6);

          if (now > eolDateObj) {
            asset.enrichmentData.eolStatus = "ended";
          } else if (sixMonths > eolDateObj) {
            asset.enrichmentData.eolStatus = "approaching";
          } else {
            asset.enrichmentData.eolStatus = "active";
          }
        }
        break;
      }
    }
  }
}

export function buildAssessmentData(
  assets: ParsedAsset[],
  workloadClassifications: WorkloadClassification[],
  eolData: EOLReference[]
) {
  const platformBreakdown: Record<string, number> = {};
  const eolHeatmap: Array<{ product: string; version: string; status: string; count: number; eolDate: string | null }> = [];
  const networkSummary: { subnets: Set<string>; totalNICs: number } = { subnets: new Set(), totalNICs: 0 };
  const bcPosture: { drServers: number; backupTools: Set<string>; hasMonitoring: number; noMonitoring: number } = {
    drServers: 0, backupTools: new Set(), hasMonitoring: 0, noMonitoring: 0,
  };
  const licenseBaseline: Record<string, number> = {};

  for (const asset of assets) {
    const os = asset.operatingSystem || "Unknown";
    const platform = detectPlatform(os, asset.enrichmentData);
    platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;

    const osKey = normalizeOSForLicense(os);
    if (osKey) licenseBaseline[osKey] = (licenseBaseline[osKey] || 0) + 1;

    if (asset.ipAddress) {
      const parts = asset.ipAddress.split(".");
      if (parts.length === 4) {
        networkSummary.subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
      }
    }

    const ed = asset.enrichmentData || {};
    if (ed.nicCount) networkSummary.totalNICs += parseInt(ed.nicCount) || 0;

    if ((asset.cloudRegion || "").toLowerCase().includes("dr") || (asset.endpointGroup || "").toLowerCase().includes("dr")) {
      bcPosture.drServers++;
    }
    if (ed.applicationName && /backup|avamar|veeam|commvault|netbackup/i.test(ed.applicationName)) {
      bcPosture.backupTools.add(ed.applicationName);
    }
    if (ed.monitoringStatus === "Yes" || ed.monitoringTool) {
      bcPosture.hasMonitoring++;
    } else {
      bcPosture.noMonitoring++;
    }
  }

  for (const eol of eolData) {
    const count = eol.serverCount || 0;
    let status = "active";
    if (eol.eolDate) {
      const d = new Date(eol.eolDate);
      const now = new Date();
      const sixM = new Date();
      sixM.setMonth(sixM.getMonth() + 6);
      if (now > d) status = "ended";
      else if (sixM > d) status = "approaching";
    }
    eolHeatmap.push({
      product: `${eol.vendor} ${eol.product}`,
      version: eol.version,
      status,
      count: typeof count === "number" ? count : parseInt(String(count)) || 0,
      eolDate: eol.eolDate,
    });
  }

  const wlSummary = {
    rehost: workloadClassifications.filter(w => w.recommendation === "Rehost").length,
    replatform: workloadClassifications.filter(w => w.recommendation === "Replatform").length,
    retain: workloadClassifications.filter(w => w.recommendation === "Retain").length,
    retire: workloadClassifications.filter(w => w.recommendation === "Retire").length,
    quickWins: workloadClassifications.filter(w => w.quickWin).length,
  };

  return {
    platformBreakdown,
    eolHeatmap,
    workloadSuitability: wlSummary,
    quickWinCandidates: workloadClassifications.filter(w => w.quickWin),
    licenseBaseline,
    networkSummary: {
      subnetCount: networkSummary.subnets.size,
      subnets: Array.from(networkSummary.subnets).slice(0, 50),
      totalNICs: networkSummary.totalNICs,
    },
    bcPosture: {
      drServers: bcPosture.drServers,
      backupTools: Array.from(bcPosture.backupTools),
      monitoredAssets: bcPosture.hasMonitoring,
      unmonitoredAssets: bcPosture.noMonitoring,
    },
  };
}

function detectPlatform(os: string, enrichmentData?: Record<string, any>): string {
  const o = os.toLowerCase();
  const ed = enrichmentData || {};

  if (o.includes("aix")) return "AIX";
  if (o.includes("vios") || o.includes("vio")) return "IBM VIOS";
  if (o.includes("as400") || o.includes("iseries") || o.includes("i5/os") || o.includes("ibm i")) return "IBM i/AS400";
  if (o.includes("red hat") || o.includes("rhel")) return "Linux (RHEL)";
  if (o.includes("suse") || o.includes("sles")) return "Linux (SUSE)";
  if (o.includes("centos")) return "Linux (CentOS)";
  if (o.includes("ubuntu")) return "Linux (Ubuntu)";
  if (o.includes("linux")) return "Linux (Other)";
  if (o.includes("esxi")) return "VMware ESXi";
  if (o.includes("windows server")) return "Windows Server";
  if (o.includes("windows")) return "Windows";
  if (ed.cloudProvider === "VMware") return "VMware VM";
  return "Other";
}

function normalizeOSForLicense(os: string): string {
  const o = os.toLowerCase();
  if (o.includes("red hat") || o.includes("rhel")) return "Red Hat Enterprise Linux";
  if (o.includes("suse") || o.includes("sles")) return "SUSE Linux Enterprise";
  if (o.includes("aix")) return "IBM AIX";
  if (o.includes("vios")) return "IBM VIOS";
  if (o.includes("windows server 2022")) return "Windows Server 2022";
  if (o.includes("windows server 2019")) return "Windows Server 2019";
  if (o.includes("windows server 2016")) return "Windows Server 2016";
  if (o.includes("windows server")) return "Windows Server (Other)";
  if (o.includes("esxi 8")) return "VMware ESXi 8.x";
  if (o.includes("esxi 7")) return "VMware ESXi 7.x";
  if (o.includes("esxi")) return "VMware ESXi (Other)";
  if (o.includes("centos")) return "CentOS";
  if (o.includes("ubuntu")) return "Ubuntu";
  return "";
}
