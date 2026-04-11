import { pool } from "./db";
import { PRODUCT_DEFINITIONS, LOG_SOURCE_PATTERNS } from "./product-detection";

interface ToolNistMapping {
  name: string;
  vendor: string;
  functions: Record<string, { weight: number; categories: string[]; reason: string }>;
  matchers: string[];
}

const TOOL_NIST_MAPPINGS: ToolNistMapping[] = [
  {
    name: "Cynet 360 AutoXDR",
    vendor: "Cynet",
    functions: {
      Identify: { weight: 55, categories: ["ID.AM", "ID.RA"], reason: "Asset discovery & risk assessment" },
      Protect: { weight: 80, categories: ["PR.DS", "PR.PT", "PR.IP"], reason: "Endpoint protection & prevention" },
      Detect: { weight: 85, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "XDR detection & correlation" },
      Respond: { weight: 70, categories: ["RS.MI", "RS.AN", "RS.RP"], reason: "Automated remediation & analysis" },
    },
    matchers: ["cynet", "cyneteps", "cynet_360", "cynet360", "autoxdr"],
  },
  {
    name: "FortiNAC",
    vendor: "Fortinet",
    functions: {
      Identify: { weight: 70, categories: ["ID.AM", "ID.RA"], reason: "Network asset discovery & profiling" },
      Protect: { weight: 65, categories: ["PR.AC", "PR.PT"], reason: "Network access control enforcement" },
      Detect: { weight: 50, categories: ["DE.CM"], reason: "Network monitoring & anomaly detection" },
      Respond: { weight: 45, categories: ["RS.MI"], reason: "Automated quarantine & isolation" },
    },
    matchers: ["fortinac", "forti nac", "nac persistent agent"],
  },
  {
    name: "Palo Alto Cortex XDR",
    vendor: "Palo Alto Networks",
    functions: {
      Identify: { weight: 45, categories: ["ID.AM"], reason: "Endpoint asset inventory" },
      Protect: { weight: 80, categories: ["PR.DS", "PR.PT", "PR.IP"], reason: "Endpoint prevention & host firewall" },
      Detect: { weight: 90, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "XDR behavioral & analytics detection" },
      Respond: { weight: 75, categories: ["RS.AN", "RS.MI", "RS.RP"], reason: "Investigation & automated response" },
    },
    matchers: ["cortex", "palo alto", "panw", "traps"],
  },
  {
    name: "Check Point Harmony Email",
    vendor: "Check Point Software",
    functions: {
      Protect: { weight: 75, categories: ["PR.DS", "PR.AT"], reason: "Email filtering & anti-phishing" },
      Detect: { weight: 65, categories: ["DE.CM", "DE.AE"], reason: "Phishing & malware detection" },
    },
    matchers: ["checkpoint", "harmony email", "check point"],
  },
  {
    name: "Skyhigh Security SSE",
    vendor: "Skyhigh Security",
    functions: {
      Govern: { weight: 40, categories: ["GV.SC"], reason: "Cloud security governance & policy" },
      Protect: { weight: 75, categories: ["PR.AC", "PR.DS"], reason: "SWG, CASB & web protection" },
      Detect: { weight: 60, categories: ["DE.CM"], reason: "Cloud activity monitoring & CASB alerts" },
    },
    matchers: ["skyhigh", "skyhigh sse", "mcafee mvision"],
  },
  {
    name: "Skyhigh Security DLP",
    vendor: "Skyhigh Security",
    functions: {
      Govern: { weight: 45, categories: ["GV.SC", "GV.RM"], reason: "Data governance policies" },
      Identify: { weight: 50, categories: ["ID.AM"], reason: "Data classification & discovery" },
      Protect: { weight: 80, categories: ["PR.DS", "PR.IP"], reason: "Data loss prevention enforcement" },
      Detect: { weight: 55, categories: ["DE.CM"], reason: "DLP violation monitoring" },
    },
    matchers: ["skyhigh dlp", "mcafee dlp", "trellix dlp"],
  },
  {
    name: "Vicarius vRx",
    vendor: "Vicarius",
    functions: {
      Identify: { weight: 85, categories: ["ID.RA", "ID.AM"], reason: "Vulnerability assessment & prioritization" },
      Protect: { weight: 60, categories: ["PR.IP"], reason: "Automated patch management" },
    },
    matchers: ["vicarius", "vrx"],
  },
  {
    name: "Trellix EDR",
    vendor: "Trellix",
    functions: {
      Protect: { weight: 70, categories: ["PR.DS", "PR.PT"], reason: "Endpoint protection" },
      Detect: { weight: 80, categories: ["DE.CM", "DE.AE"], reason: "EDR behavioral detection" },
      Respond: { weight: 60, categories: ["RS.AN", "RS.MI"], reason: "Investigation & containment" },
    },
    matchers: ["trellix", "mcafee edr", "fireeye"],
  },
  {
    name: "AWS Security Services",
    vendor: "Amazon Web Services",
    functions: {
      Identify: { weight: 50, categories: ["ID.AM", "ID.RA"], reason: "Cloud asset inventory & risk" },
      Protect: { weight: 45, categories: ["PR.AC", "PR.DS"], reason: "IAM & security groups" },
      Detect: { weight: 70, categories: ["DE.CM", "DE.AE"], reason: "GuardDuty & SecurityHub detection" },
    },
    matchers: ["aws", "guardduty", "cloudtrail", "securityhub"],
  },
  {
    name: "FortiGate Firewall",
    vendor: "Fortinet",
    functions: {
      Protect: { weight: 80, categories: ["PR.AC", "PR.PT", "PR.DS"], reason: "Network perimeter protection & IPS" },
      Detect: { weight: 55, categories: ["DE.CM"], reason: "IDS/IPS & traffic analysis" },
      Respond: { weight: 40, categories: ["RS.MI"], reason: "Automated blocking & quarantine" },
    },
    matchers: ["fortigate", "fortinet firewall", "fortianalyzer"],
  },
  {
    name: "Microsoft Defender",
    vendor: "Microsoft",
    functions: {
      Protect: { weight: 65, categories: ["PR.DS", "PR.PT"], reason: "Built-in endpoint protection" },
      Detect: { weight: 55, categories: ["DE.CM"], reason: "Antimalware & threat detection" },
    },
    matchers: ["defender", "windows defender", "microsoft defender"],
  },
  {
    name: "SentinelOne",
    vendor: "SentinelOne",
    functions: {
      Protect: { weight: 80, categories: ["PR.DS", "PR.PT"], reason: "AI-powered endpoint protection" },
      Detect: { weight: 85, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "Behavioral AI detection" },
      Respond: { weight: 75, categories: ["RS.MI", "RS.AN"], reason: "Automated remediation & rollback" },
    },
    matchers: ["sentinelone", "sentinel one", "s1 agent"],
  },
  {
    name: "Sophos",
    vendor: "Sophos",
    functions: {
      Protect: { weight: 70, categories: ["PR.DS", "PR.PT"], reason: "Endpoint & server protection" },
      Detect: { weight: 65, categories: ["DE.CM", "DE.AE"], reason: "Threat detection & EDR" },
      Respond: { weight: 50, categories: ["RS.MI"], reason: "Synchronized security response" },
    },
    matchers: ["sophos", "intercept x", "sophos xg"],
  },
  {
    name: "CrowdStrike Falcon",
    vendor: "CrowdStrike",
    functions: {
      Identify: { weight: 50, categories: ["ID.AM"], reason: "Asset & identity visibility" },
      Protect: { weight: 80, categories: ["PR.DS", "PR.PT"], reason: "Next-gen antivirus & prevention" },
      Detect: { weight: 90, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "Cloud-native EDR/XDR detection" },
      Respond: { weight: 75, categories: ["RS.AN", "RS.MI", "RS.RP"], reason: "Real-time response & forensics" },
    },
    matchers: ["crowdstrike", "falcon", "cs falcon"],
  },
  {
    name: "Splunk SIEM",
    vendor: "Splunk",
    functions: {
      Identify: { weight: 40, categories: ["ID.RA"], reason: "Risk-based visibility" },
      Detect: { weight: 85, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "SIEM correlation & alerting" },
      Respond: { weight: 50, categories: ["RS.AN"], reason: "Investigation & search" },
    },
    matchers: ["splunk", "hec", "splunk hec"],
  },
  {
    name: "QRadar SIEM",
    vendor: "IBM",
    functions: {
      Detect: { weight: 80, categories: ["DE.CM", "DE.AE"], reason: "SIEM detection & offenses" },
      Respond: { weight: 45, categories: ["RS.AN"], reason: "Investigation workflows" },
    },
    matchers: ["qradar"],
  },
  {
    name: "Qualys",
    vendor: "Qualys",
    functions: {
      Identify: { weight: 85, categories: ["ID.RA", "ID.AM"], reason: "Vulnerability & asset management" },
      Protect: { weight: 50, categories: ["PR.IP"], reason: "Patch prioritization" },
    },
    matchers: ["qualys"],
  },
  {
    name: "Proofpoint Email Security",
    vendor: "Proofpoint",
    functions: {
      Protect: { weight: 75, categories: ["PR.DS", "PR.AT"], reason: "Email protection & training" },
      Detect: { weight: 65, categories: ["DE.CM"], reason: "Threat detection in email" },
    },
    matchers: ["proofpoint"],
  },
  {
    name: "Okta Identity",
    vendor: "Okta",
    functions: {
      Govern: { weight: 50, categories: ["GV.SC"], reason: "Identity governance" },
      Protect: { weight: 80, categories: ["PR.AC", "PR.AA"], reason: "SSO, MFA & access management" },
      Detect: { weight: 45, categories: ["DE.CM"], reason: "Identity threat detection" },
    },
    matchers: ["okta"],
  },
  {
    name: "Veeam Backup",
    vendor: "Veeam",
    functions: {
      Protect: { weight: 50, categories: ["PR.DS", "PR.IP"], reason: "Data backup & protection" },
      Recover: { weight: 85, categories: ["RC.RP", "RC.CO"], reason: "Backup & disaster recovery" },
    },
    matchers: ["veeam", "backup exec"],
  },
  {
    name: "Acronis Backup",
    vendor: "Acronis",
    functions: {
      Protect: { weight: 55, categories: ["PR.DS", "PR.IP"], reason: "Cyber protection & backup" },
      Recover: { weight: 80, categories: ["RC.RP", "RC.CO"], reason: "Disaster recovery & restore" },
    },
    matchers: ["acronis"],
  },
  {
    name: "BitLocker Encryption",
    vendor: "Microsoft",
    functions: {
      Protect: { weight: 60, categories: ["PR.DS"], reason: "Full disk encryption" },
    },
    matchers: ["bitlocker"],
  },
];

const NIST_FUNCTIONS = ["Govern", "Identify", "Protect", "Detect", "Respond", "Recover"] as const;

interface DetectedToolInfo {
  name: string;
  vendor: string;
  source: string;
  deploymentCount?: number;
  totalAssets?: number;
  deploymentPct?: number;
}

export interface NistCsfResult {
  functions: Record<string, {
    score: number;
    categories: string[];
    tools: string[];
    toolDetails: { name: string; weight: number; reason: string; source: string }[];
  }>;
  overallMaturity: number;
  detectedTools: DetectedToolInfo[];
  dataSourcesUsed: string[];
}

function matchToolFromContext(contextString: string): ToolNistMapping | null {
  const lower = contextString.toLowerCase();
  for (const tool of TOOL_NIST_MAPPINGS) {
    if (tool.matchers.some(m => lower.includes(m))) {
      return tool;
    }
  }
  return null;
}

export async function computeNistCsfCoverage(tenantIds: number[]): Promise<NistCsfResult> {
  if (!tenantIds || tenantIds.length === 0) {
    const emptyResult: NistCsfResult = { functions: {}, overallMaturity: 0, detectedTools: [], dataSourcesUsed: [] };
    for (const fn of NIST_FUNCTIONS) {
      emptyResult.functions[fn] = { score: 0, categories: [], tools: [], toolDetails: [] };
    }
    return emptyResult;
  }

  const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(",");
  const dataSourcesUsed: string[] = [];
  const detectedToolsMap = new Map<string, DetectedToolInfo>();
  const toolFunctionBestWeight = new Map<string, number>();
  const functionContributions: Record<string, { weights: number[]; categories: Set<string>; tools: Set<string>; toolDetails: { name: string; weight: number; reason: string; source: string }[] }> = {};

  for (const fn of NIST_FUNCTIONS) {
    functionContributions[fn] = { weights: [], categories: new Set(), tools: new Set(), toolDetails: [] };
  }

  function addToolContribution(tool: ToolNistMapping, source: string, deploymentInfo?: { count: number; total: number }) {
    const toolKey = tool.name;
    const existing = detectedToolsMap.get(toolKey);
    if (!existing) {
      detectedToolsMap.set(toolKey, {
        name: tool.name,
        vendor: tool.vendor,
        source,
        deploymentCount: deploymentInfo?.count,
        totalAssets: deploymentInfo?.total,
        deploymentPct: deploymentInfo ? Math.round((deploymentInfo.count / Math.max(deploymentInfo.total, 1)) * 100) : undefined,
      });
    } else if (deploymentInfo && (!existing.deploymentPct || (deploymentInfo.count / Math.max(deploymentInfo.total, 1)) * 100 > existing.deploymentPct)) {
      existing.deploymentCount = deploymentInfo.count;
      existing.totalAssets = deploymentInfo.total;
      existing.deploymentPct = Math.round((deploymentInfo.count / Math.max(deploymentInfo.total, 1)) * 100);
      existing.source = `${existing.source}, ${source}`;
    }

    const deploymentFactor = deploymentInfo
      ? Math.min(1, 0.5 + 0.5 * (deploymentInfo.count / Math.max(deploymentInfo.total, 1)))
      : 0.7;

    for (const [fn, mapping] of Object.entries(tool.functions)) {
      const fc = functionContributions[fn];
      if (!fc) continue;
      const adjustedWeight = Math.round(mapping.weight * deploymentFactor);
      const dedupeKey = `${tool.name}::${fn}`;
      const prevBest = toolFunctionBestWeight.get(dedupeKey) || 0;

      if (adjustedWeight > prevBest) {
        if (prevBest > 0) {
          const idx = fc.weights.indexOf(prevBest);
          if (idx >= 0) fc.weights[idx] = adjustedWeight;
        } else {
          fc.weights.push(adjustedWeight);
        }
        toolFunctionBestWeight.set(dedupeKey, adjustedWeight);
      }

      mapping.categories.forEach(c => fc.categories.add(c));
      fc.tools.add(tool.name);
      const existingDetail = fc.toolDetails.find(td => td.name === tool.name);
      if (!existingDetail) {
        fc.toolDetails.push({ name: tool.name, weight: adjustedWeight, reason: mapping.reason, source });
      } else if (adjustedWeight > existingDetail.weight) {
        existingDetail.weight = adjustedWeight;
        existingDetail.source = source;
      }
    }
  }

  const [assetAgents, assetSoftware, assetPolicies, totalAssets, secIntegrations, eventSources] = await Promise.all([
    pool.query(`
      SELECT agent_version, COUNT(*)::int as cnt
      FROM assets
      WHERE tenant_id IN (${placeholders}) AND agent_version IS NOT NULL AND agent_version != ''
      GROUP BY agent_version
    `, tenantIds),

    pool.query(`
      SELECT jsonb_array_elements(software_inventory)->>'name' as sw_name, COUNT(*)::int as cnt
      FROM assets
      WHERE tenant_id IN (${placeholders}) AND software_inventory IS NOT NULL AND jsonb_array_length(software_inventory) > 0
      GROUP BY jsonb_array_elements(software_inventory)->>'name'
    `, tenantIds),

    pool.query(`
      SELECT DISTINCT prevention_policy
      FROM assets
      WHERE tenant_id IN (${placeholders}) AND prevention_policy IS NOT NULL AND prevention_policy != ''
    `, tenantIds),

    pool.query(`
      SELECT COUNT(*)::int as total FROM assets WHERE tenant_id IN (${placeholders})
    `, tenantIds),

    pool.query(`
      SELECT platform_name, platform_key, category, status
      FROM security_integrations
      WHERE tenant_id IN (${placeholders})
    `, tenantIds),

    pool.query(`
      SELECT log_source, source_type, COUNT(*)::int as cnt
      FROM security_events
      WHERE tenant_id IN (${placeholders}) AND log_source IS NOT NULL
      GROUP BY log_source, source_type
    `, tenantIds),
  ]);

  const totalAssetCount = totalAssets.rows[0]?.total || 0;

  for (const row of assetAgents.rows) {
    const agentVersion = row.agent_version || "";
    const tool = matchToolFromContext(agentVersion);
    if (tool) {
      dataSourcesUsed.push("Asset Agent Versions");
      addToolContribution(tool, "Agent Version", { count: row.cnt, total: totalAssetCount });
    } else {
      const agentLower = agentVersion.toLowerCase();
      if (/^\d+\.\d+\.\d+/.test(agentVersion)) {
        const major = parseInt(agentVersion.split(".")[0]);
        if (major >= 7 && major <= 9) {
          const cortexTool = TOOL_NIST_MAPPINGS.find(t => t.name.includes("Cortex XDR"));
          if (cortexTool) {
            dataSourcesUsed.push("Asset Agent Versions");
            addToolContribution(cortexTool, "Agent Version (Cortex XDR pattern)", { count: row.cnt, total: totalAssetCount });
          }
        }
      }
    }
  }

  for (const row of assetSoftware.rows) {
    const swName = row.sw_name || "";
    const tool = matchToolFromContext(swName);
    if (tool) {
      dataSourcesUsed.push("Software Inventory");
      addToolContribution(tool, "Software Inventory", { count: row.cnt, total: totalAssetCount });
    }
  }

  if (assetPolicies.rows.length > 0) {
    dataSourcesUsed.push("Prevention Policies");

    for (const row of assetPolicies.rows) {
      const policyName = row.prevention_policy || "";
      const tool = matchToolFromContext(policyName);
      if (tool && !detectedToolsMap.has(tool.name)) {
        const policyCountResult = await pool.query(`
          SELECT COUNT(*)::int as cnt FROM assets
          WHERE tenant_id IN (${placeholders}) AND prevention_policy = $${tenantIds.length + 1}
        `, [...tenantIds, policyName]);
        const policyCount = policyCountResult.rows[0]?.cnt || 0;
        addToolContribution(tool, "Prevention Policy", { count: policyCount, total: totalAssetCount });
      }
    }

    const hasEndpointPolicy = assetPolicies.rows.some((r: any) =>
      /endpoint|workstation|server|protect|security|mac/i.test(r.prevention_policy)
    );
    if (hasEndpointPolicy) {
      const fc = functionContributions["Protect"];
      if (!fc.tools.has("Endpoint Protection Policies")) {
        fc.weights.push(40);
        fc.categories.add("PR.IP");
        fc.tools.add("Endpoint Protection Policies");
        fc.toolDetails.push({ name: "Endpoint Protection Policies", weight: 40, reason: "Active endpoint protection policies enforced", source: "Prevention Policies" });
      }
      const fcGovern = functionContributions["Govern"];
      if (!fcGovern.tools.has("Security Policy Framework")) {
        fcGovern.weights.push(35);
        fcGovern.categories.add("GV.RM");
        fcGovern.categories.add("GV.OC");
        fcGovern.tools.add("Security Policy Framework");
        fcGovern.toolDetails.push({ name: "Security Policy Framework", weight: 35, reason: `${assetPolicies.rows.length} active prevention policies`, source: "Prevention Policies" });
      }
    }
  }

  for (const row of secIntegrations.rows) {
    const platformKey = row.platform_key || "";
    const platformName = row.platform_name || "";
    const combined = `${platformKey} ${platformName}`;
    const tool = matchToolFromContext(combined);
    if (tool) {
      dataSourcesUsed.push("Security Integrations");
      addToolContribution(tool, `Integration (${row.status})`);
    }
  }

  for (const row of eventSources.rows) {
    const combined = `${row.log_source || ""} ${row.source_type || ""}`;
    for (const mapping of LOG_SOURCE_PATTERNS) {
      if (mapping.pattern.test(combined)) {
        const def = PRODUCT_DEFINITIONS[mapping.productId];
        if (def) {
          const tool = matchToolFromContext(def.name) || matchToolFromContext(mapping.productId);
          if (tool) {
            dataSourcesUsed.push("Security Events");
            addToolContribution(tool, "Event Log Source");
          }
        }
        break;
      }
    }
  }

  try {
    const configuredTools = await pool.query(
      `SELECT tool_name, vendor, category, deployment_status, coverage_percent
       FROM tenant_security_tools WHERE tenant_id IN (${placeholders}) AND deployment_status != 'not_deployed'`,
      tenantIds
    );
    if (configuredTools.rows.length > 0) {
      dataSourcesUsed.push("Configured Security Tools");
      const { CATEGORY_NIST_MAPPING } = await import("@shared/schema");
      for (const row of configuredTools.rows) {
        const existingTool = matchToolFromContext(row.tool_name) || matchToolFromContext(row.vendor);
        if (existingTool) {
          const deployFactor = row.deployment_status === "deployed" ? 1.0 : row.deployment_status === "partial" ? 0.6 : 0.3;
          const coverageFactor = (row.coverage_percent || 100) / 100;
          addToolContribution(existingTool, "Configured Tools", {
            count: Math.round(totalAssetCount * deployFactor * coverageFactor),
            total: totalAssetCount,
          });
        } else {
          const catMapping = CATEGORY_NIST_MAPPING[row.category];
          if (catMapping) {
            const deployFactor = row.deployment_status === "deployed" ? 1.0 : row.deployment_status === "partial" ? 0.6 : 0.3;
            const coverageFactor = (row.coverage_percent || 100) / 100;
            const effectiveFactor = deployFactor * coverageFactor;
            for (const [fn, mapping] of Object.entries(catMapping.functions)) {
              const fc = functionContributions[fn];
              if (!fc) continue;
              const adjustedWeight = Math.round(mapping.weight * effectiveFactor);
              if (!fc.tools.has(row.tool_name)) {
                fc.weights.push(adjustedWeight);
                fc.tools.add(row.tool_name);
                mapping.categories.forEach((c: string) => fc.categories.add(c));
                fc.toolDetails.push({
                  name: row.tool_name,
                  weight: adjustedWeight,
                  reason: mapping.reason,
                  source: "Configured Tools",
                });
              }
            }
            if (!detectedToolsMap.has(row.tool_name)) {
              detectedToolsMap.set(row.tool_name, {
                name: row.tool_name,
                vendor: row.vendor,
                source: "Configured Tools",
                deploymentPct: Math.round(effectiveFactor * 100),
              });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Error loading configured tools for NIST:", e);
  }

  const result: NistCsfResult = {
    functions: {},
    overallMaturity: 0,
    detectedTools: Array.from(detectedToolsMap.values()),
    dataSourcesUsed: [...new Set(dataSourcesUsed)],
  };

  let totalScore = 0;
  for (const fn of NIST_FUNCTIONS) {
    const fc = functionContributions[fn];
    let score = 0;

    if (fc.weights.length > 0) {
      const sortedWeights = fc.weights.sort((a, b) => b - a);
      let remaining = 100;
      for (const w of sortedWeights) {
        const contribution = (w / 100) * remaining;
        score += contribution;
        remaining -= contribution;
      }
      score = Math.round(Math.min(score, 98));
    }

    if (fn === "Govern") {
      score = Math.max(score, 25);
    }
    if (fn === "Recover" && score === 0 && totalAssetCount > 0) {
      score = 10;
    }

    result.functions[fn] = {
      score,
      categories: Array.from(fc.categories),
      tools: Array.from(fc.tools),
      toolDetails: fc.toolDetails,
    };
    totalScore += score;
  }

  result.overallMaturity = Math.round(totalScore / NIST_FUNCTIONS.length);

  return result;
}
