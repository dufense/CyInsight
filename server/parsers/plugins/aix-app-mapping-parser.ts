import XLSX from "xlsx";
import type {
  BaseParser,
  ParseResult,
  ParsedAsset,
  AppMapping,
} from "../base-parser";
import {
  normalizeHostname,
  calculateRiskScore,
  classifyWorkload,
  emptyParseResult,
} from "../base-parser";
import { ParserRegistry } from "../parser-registry";

interface SectionInfo {
  dcLabel: string;
  dcName: string;
  headerRow: number;
  dataStartRow: number;
  dataEndRow: number;
}

function findSections(sheet: XLSX.Sheet, maxRow: number): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const sectionStartRows: number[] = [];
  const sectionLabels: string[] = [];
  const sectionDescriptions: string[] = [];

  for (let r = 0; r <= maxRow; r++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cellA || !cellA.v) continue;
    const val = String(cellA.v).trim().toUpperCase();
    if (val === "PRIMARY DC" || val === "DR SITE" || val === "DR-SITE" || val === "DR_SITE") {
      sectionStartRows.push(r);
      sectionLabels.push(val);
      const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
      sectionDescriptions.push(cellB ? String(cellB.v).trim() : "");
    } else if (val === "NOTES" || val === "NOTE") {
      sectionStartRows.push(r);
      sectionLabels.push("NOTES");
      sectionDescriptions.push("");
    }
  }

  for (let i = 0; i < sectionStartRows.length; i++) {
    const label = sectionLabels[i];
    if (label === "NOTES") continue;

    const startRow = sectionStartRows[i];
    const headerRow = startRow + 1;
    const dataStartRow = headerRow + 1;
    const endRow = i + 1 < sectionStartRows.length
      ? sectionStartRows[i + 1] - 1
      : maxRow;

    let actualEnd = dataStartRow;
    for (let r = dataStartRow; r <= endRow; r++) {
      const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
      if (cellB && cellB.v && String(cellB.v).trim()) {
        actualEnd = r;
      }
    }

    let dcName = "";
    const desc = sectionDescriptions[i];
    if (desc) {
      const match = desc.match(/^([^(\r\n]+)/);
      if (match) {
        dcName = match[1].trim();
      }
    }
    if (!dcName) {
      dcName = label === "PRIMARY DC" ? "Primary DC" : "DR Site";
    }

    sections.push({
      dcLabel: label,
      dcName,
      headerRow,
      dataStartRow,
      dataEndRow: actualEnd,
    });
  }

  return sections;
}

function extractDcName(description: string, label: string): string {
  if (!description) {
    return label === "PRIMARY DC" ? "Primary DC" : "DR Site";
  }
  const match = description.match(/^([^(\r\n]+)/);
  if (match) {
    return match[1].trim();
  }
  return label === "PRIMARY DC" ? "Primary DC" : "DR Site";
}

function deriveStatus(decomStatus: string): string {
  if (!decomStatus) return "operational";
  const lower = decomStatus.toLowerCase();
  if (lower.includes("plan to decomm") || lower.includes("planned")) return "planned";
  if (lower.includes("decommission") && !lower.includes("plan")) return "decommissioned";
  return "operational";
}

const aixAppMappingParser: BaseParser = {
  name: "AIX Application Mapping",
  description: "Parses IBM AIX application mapping files with PRIMARY DC / DR SITE sections containing application-to-partition mappings",

  detect(workbook: XLSX.WorkBook, sheetNames: string[], sampleHeaders: Record<string, string[]>): number {
    if (sheetNames.length > 2) return 0;

    const sheetName = sheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) return 0;

    let hasPrimaryDC = false;
    let hasDRSite = false;
    let hasAppCategory = false;
    let hasFramesPartitions = false;

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const scanRows = Math.min(range.e.r, 40);

    for (let r = 0; r <= scanRows; r++) {
      const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cellA && cellA.v) {
        const val = String(cellA.v).trim().toUpperCase();
        if (val === "PRIMARY DC") hasPrimaryDC = true;
        if (val === "DR SITE" || val === "DR-SITE" || val === "DR_SITE") hasDRSite = true;
      }

      for (let c = 0; c <= Math.min(range.e.c, 6); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v) {
          const val = String(cell.v).trim().toLowerCase();
          if (val === "application category") hasAppCategory = true;
          if (val === "frames/partitions" || val === "frames / partitions") hasFramesPartitions = true;
        }
      }
    }

    let confidence = 0;
    if (hasPrimaryDC) confidence += 30;
    if (hasDRSite) confidence += 20;
    if (hasAppCategory) confidence += 25;
    if (hasFramesPartitions) confidence += 25;

    if (!hasPrimaryDC && !hasDRSite) return 0;
    if (!hasAppCategory && !hasFramesPartitions) return 0;

    return confidence;
  },

  parse(workbook: XLSX.WorkBook): ParseResult {
    const result = emptyParseResult("AIX Application Mapping");
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) return result;

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const sections = findSections(sheet, range.e.r);

    if (sections.length === 0) return result;

    const appMap = new Map<string, AppMapping>();
    const seenHostnames = new Set<string>();

    for (const section of sections) {
      for (let r = section.dataStartRow; r <= section.dataEndRow; r++) {
        const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
        const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
        const cellD = sheet[XLSX.utils.encode_cell({ r, c: 3 })];
        const cellE = sheet[XLSX.utils.encode_cell({ r, c: 4 })];
        const cellF = sheet[XLSX.utils.encode_cell({ r, c: 5 })];
        const cellG = sheet[XLSX.utils.encode_cell({ r, c: 6 })];

        const applicationCategory = cellB && cellB.v ? String(cellB.v).trim() : "";
        const partitionsRaw = cellC && cellC.v ? String(cellC.v).trim() : "";
        const frameSerial = cellD && cellD.v ? String(cellD.v).trim() : "";
        const environment = cellE && cellE.v ? String(cellE.v).trim() : "";
        const decomStatus = cellF && cellF.v ? String(cellF.v).trim() : "";
        const remarks = cellG && cellG.v ? String(cellG.v).trim() : "";

        if (!applicationCategory || !partitionsRaw) continue;

        if (partitionsRaw.toLowerCase().includes("similar to") || partitionsRaw.toLowerCase().includes("e.g.")) continue;

        const partitions = partitionsRaw
          .split(",")
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .map(p => p.replace(/\s*\(.*?\)\s*$/, "").trim())
          .filter(p => p.length > 0 && !p.toLowerCase().includes("linked dr"));

        const status = deriveStatus(decomStatus);

        for (const hostname of partitions) {
          const normalizedHost = normalizeHostname(hostname);
          if (!normalizedHost || seenHostnames.has(normalizedHost)) continue;
          seenHostnames.add(normalizedHost);

          const asset: ParsedAsset = {
            hostname,
            operatingSystem: "IBM AIX",
            deploymentType: "On Prem",
            endpointType: "Server",
            status,
            source: "IBM AIX App Mapping Import",
            enrichmentData: {
              applicationCategory,
              applicationName: applicationCategory,
              frameSerial,
              decomStatus,
              remarks,
              datacenterSite: section.dcLabel,
              datacenterName: section.dcName,
              environment,
              importSource: "IBM_Aix",
            },
          };

          const risk = calculateRiskScore(asset);
          asset.riskScore = risk.score;
          asset.riskLevel = risk.level;

          result.assets.push(asset);

          const appKey = applicationCategory.toLowerCase();
          if (!appMap.has(appKey)) {
            const category = classifyAppCategory(applicationCategory);
            appMap.set(appKey, {
              name: applicationCategory,
              category,
              confidence: 90,
              servers: [],
              owners: [],
              supportGroups: [],
              environments: [],
              locations: [],
              distributionLists: [],
              monitoringTools: [],
              serverCount: 0,
              riskSummary: { eolCount: 0, unpatchedCount: 0, highRiskCount: 0 },
            });
          }

          const app = appMap.get(appKey)!;
          app.servers.push(hostname);
          app.serverCount = app.servers.length;
          if (environment && !app.environments.includes(environment)) {
            app.environments.push(environment);
          }
          const loc = section.dcName;
          if (!app.locations.includes(loc)) {
            app.locations.push(loc);
          }
          if (risk.level === "high" || risk.level === "critical") {
            app.riskSummary!.highRiskCount++;
          }
        }
      }
    }

    result.applications = Array.from(appMap.values());

    for (const asset of result.assets) {
      result.workloadClassifications.push(classifyWorkload(asset));
    }

    result.summary = {
      parserName: "AIX Application Mapping",
      confidence: 90,
      sheetsProcessed: [sheetName],
      totalRecords: result.assets.length,
      recordsPerSheet: { [sheetName]: result.assets.length },
      newAssets: result.assets.length,
      updatedAssets: 0,
      applicationsDiscovered: result.applications.length,
      enterpriseApps: result.applications.filter(a => a.category === "Enterprise").length,
      businessApps: result.applications.filter(a => a.category === "Business").length,
      stakeholdersIdentified: 0,
      correlationsFound: 0,
      riskFlags: {
        eolCount: 0,
        unpatchedCount: 0,
        noMonitoringCount: result.assets.length,
        staleSnapshotCount: 0,
        outdatedToolsCount: 0,
        decomCount: result.assets.filter(a => a.status === "planned").length,
      },
      platformBreakdown: { "AIX": result.assets.length },
    };

    return result;
  },
};

function classifyAppCategory(appName: string): "Enterprise" | "Business" | "InfoSec" | "Unknown" {
  const lower = appName.toLowerCase();
  const enterprisePatterns = [
    "sap", "erp", "oracle", "jda", "informatica", "plm", "mq",
    "enterprise", "core", "logility",
  ];
  const businessPatterns = [
    "pkms", "warehouse", "edi", "gfe", "front end", "aldon",
    "change management", "reconnect", "crystal", "microstrategy",
  ];
  const infraPatterns = [
    "infra", "testing", "unix", "virtualization", "vios", "ip",
    "general infra",
  ];

  if (enterprisePatterns.some(p => lower.includes(p))) return "Enterprise";
  if (businessPatterns.some(p => lower.includes(p))) return "Business";
  if (infraPatterns.some(p => lower.includes(p))) return "Business";

  return "Unknown";
}

ParserRegistry.register(aixAppMappingParser);

export { aixAppMappingParser };
