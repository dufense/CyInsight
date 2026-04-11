import { db } from "./db";
import { assets, incidents, securityEvents, userAssets, complianceAssessments, tenants } from "@shared/schema";
import { eq, and, sql, count } from "drizzle-orm";

interface ControlDef {
  id: string;
  name: string;
  description: string;
  autoMapFn: string;
}

interface FunctionDef {
  id: string;
  name: string;
  description: string;
  controls: ControlDef[];
}

interface FrameworkDef {
  id: string;
  name: string;
  version: string;
  functions: FunctionDef[];
}

export const NIST_CSF: FrameworkDef = {
  id: "nist_csf",
  name: "NIST Cybersecurity Framework",
  version: "2.0",
  functions: [
    {
      id: "GV",
      name: "Govern",
      description: "Establish and monitor cybersecurity risk management strategy, expectations, and policy",
      controls: [
        { id: "GV.OC", name: "Organizational Context", description: "Circumstances related to cybersecurity risk management decisions are understood", autoMapFn: "check_tenant_config" },
        { id: "GV.RM", name: "Risk Management Strategy", description: "Priorities, constraints, risk tolerance, and appetite are established and communicated", autoMapFn: "check_risk_management" },
        { id: "GV.RR", name: "Roles & Responsibilities", description: "Cybersecurity roles and responsibilities are established and communicated", autoMapFn: "check_roles_assigned" },
        { id: "GV.PO", name: "Policy", description: "Organizational cybersecurity policy is established, communicated, and enforced", autoMapFn: "check_policies" },
        { id: "GV.OV", name: "Oversight", description: "Results of cybersecurity activities are used to inform and adjust strategy", autoMapFn: "check_reporting" },
        { id: "GV.SC", name: "Supply Chain Risk Management", description: "Cyber supply chain risk management processes are identified and managed", autoMapFn: "check_supply_chain" },
      ],
    },
    {
      id: "ID",
      name: "Identify",
      description: "Understand the organization's cybersecurity risk to systems, assets, data, and capabilities",
      controls: [
        { id: "ID.AM", name: "Asset Management", description: "Assets that enable the organization to achieve business purposes are identified and managed", autoMapFn: "check_asset_inventory" },
        { id: "ID.RA", name: "Risk Assessment", description: "Asset vulnerabilities are identified and documented, threat and vulnerability information is received", autoMapFn: "check_risk_assessment" },
        { id: "ID.IM", name: "Improvement", description: "Improvements to organizational cybersecurity are identified", autoMapFn: "check_improvement_tracking" },
      ],
    },
    {
      id: "PR",
      name: "Protect",
      description: "Develop and implement safeguards to ensure delivery of critical services",
      controls: [
        { id: "PR.AA", name: "Identity Management & Access Control", description: "Access to assets and associated facilities is limited to authorized users and services", autoMapFn: "check_identity_access" },
        { id: "PR.AT", name: "Awareness & Training", description: "The organization's personnel are provided cybersecurity awareness and training", autoMapFn: "check_awareness_training" },
        { id: "PR.DS", name: "Data Security", description: "Data is managed consistent with the organization's risk strategy to protect confidentiality, integrity, and availability", autoMapFn: "check_data_security" },
        { id: "PR.PS", name: "Platform Security", description: "The hardware, software, and services of physical and virtual platforms are managed consistent with the organization's risk strategy", autoMapFn: "check_platform_security" },
        { id: "PR.IR", name: "Technology Infrastructure Resilience", description: "Security architectures are managed to protect asset confidentiality, integrity, and availability", autoMapFn: "check_infra_resilience" },
      ],
    },
    {
      id: "DE",
      name: "Detect",
      description: "Develop and implement activities to identify the occurrence of a cybersecurity event",
      controls: [
        { id: "DE.CM", name: "Continuous Monitoring", description: "Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events", autoMapFn: "check_continuous_monitoring" },
        { id: "DE.AE", name: "Adverse Event Analysis", description: "Anomalies, indicators of compromise, and other potentially adverse events are analyzed to characterize the events", autoMapFn: "check_event_analysis" },
      ],
    },
    {
      id: "RS",
      name: "Respond",
      description: "Develop and implement activities to take action regarding a detected cybersecurity incident",
      controls: [
        { id: "RS.MA", name: "Incident Management", description: "Responses to detected cybersecurity incidents are managed", autoMapFn: "check_incident_management" },
        { id: "RS.AN", name: "Incident Analysis", description: "Investigation is conducted to ensure effective response and support forensics", autoMapFn: "check_incident_analysis" },
        { id: "RS.CO", name: "Incident Response Reporting & Communication", description: "Response activities are coordinated with internal and external stakeholders", autoMapFn: "check_incident_communication" },
        { id: "RS.MI", name: "Incident Mitigation", description: "Activities are performed to prevent expansion of an event and mitigate its effects", autoMapFn: "check_incident_mitigation" },
      ],
    },
    {
      id: "RC",
      name: "Recover",
      description: "Develop and implement activities to maintain plans for resilience and to restore capabilities impaired due to a cybersecurity incident",
      controls: [
        { id: "RC.RP", name: "Incident Recovery Plan Execution", description: "Restoration activities are performed to ensure operational availability of systems and services", autoMapFn: "check_recovery_plan" },
        { id: "RC.CO", name: "Incident Recovery Communication", description: "Restoration activities and status of restoring operational capabilities are communicated", autoMapFn: "check_recovery_communication" },
      ],
    },
  ],
};

export const ISO_27001: FrameworkDef = {
  id: "iso_27001",
  name: "ISO/IEC 27001",
  version: "2022",
  functions: [
    {
      id: "A5",
      name: "Organizational Controls",
      description: "Information security policies, roles, responsibilities, and management commitment",
      controls: [
        { id: "A.5.1", name: "Policies for Information Security", description: "Information security policy and topic-specific policies shall be defined and approved", autoMapFn: "check_policies" },
        { id: "A.5.2", name: "Information Security Roles & Responsibilities", description: "Information security roles and responsibilities shall be defined and allocated", autoMapFn: "check_roles_assigned" },
        { id: "A.5.3", name: "Segregation of Duties", description: "Conflicting duties and responsibilities shall be segregated", autoMapFn: "check_segregation" },
        { id: "A.5.7", name: "Threat Intelligence", description: "Information relating to information security threats shall be collected and analyzed", autoMapFn: "check_threat_intel" },
        { id: "A.5.8", name: "Information Security in Project Management", description: "Information security shall be integrated into project management", autoMapFn: "check_project_security" },
        { id: "A.5.23", name: "Information Security for Cloud Services", description: "Processes for acquisition, use, management, and exit from cloud services shall be established", autoMapFn: "check_cloud_security" },
        { id: "A.5.24", name: "Incident Management Planning", description: "The organization shall plan and prepare for managing information security incidents", autoMapFn: "check_incident_management" },
        { id: "A.5.25", name: "Assessment & Decision on Events", description: "The organization shall assess information security events and decide if they are incidents", autoMapFn: "check_event_analysis" },
        { id: "A.5.26", name: "Response to Incidents", description: "Information security incidents shall be responded to in accordance with documented procedures", autoMapFn: "check_incident_response" },
        { id: "A.5.28", name: "Collection of Evidence", description: "The organization shall establish and implement procedures for evidence collection", autoMapFn: "check_forensics" },
        { id: "A.5.29", name: "Information Security During Disruption", description: "The organization shall plan how to maintain information security during disruption", autoMapFn: "check_bcp" },
        { id: "A.5.30", name: "ICT Readiness for Business Continuity", description: "ICT readiness shall be planned, implemented, maintained and tested", autoMapFn: "check_recovery_plan" },
      ],
    },
    {
      id: "A6",
      name: "People Controls",
      description: "Human resource security and awareness training",
      controls: [
        { id: "A.6.3", name: "Information Security Awareness & Training", description: "Personnel shall receive appropriate information security awareness education and training", autoMapFn: "check_awareness_training" },
        { id: "A.6.4", name: "Disciplinary Process", description: "A disciplinary process shall be formalized and communicated", autoMapFn: "check_policies" },
      ],
    },
    {
      id: "A7",
      name: "Physical Controls",
      description: "Physical and environmental security",
      controls: [
        { id: "A.7.1", name: "Physical Security Perimeters", description: "Security perimeters shall be defined and used to protect areas", autoMapFn: "check_physical_security" },
        { id: "A.7.4", name: "Physical Security Monitoring", description: "Premises shall be continuously monitored for unauthorized physical access", autoMapFn: "check_physical_monitoring" },
      ],
    },
    {
      id: "A8",
      name: "Technological Controls",
      description: "Technical security controls and measures",
      controls: [
        { id: "A.8.1", name: "User Endpoint Devices", description: "Information stored on, processed by, or accessible via user endpoint devices shall be protected", autoMapFn: "check_endpoint_protection" },
        { id: "A.8.2", name: "Privileged Access Rights", description: "The allocation and use of privileged access rights shall be restricted and managed", autoMapFn: "check_identity_access" },
        { id: "A.8.5", name: "Secure Authentication", description: "Secure authentication technologies and procedures shall be established", autoMapFn: "check_authentication" },
        { id: "A.8.7", name: "Protection Against Malware", description: "Protection against malware shall be implemented and supported by appropriate user awareness", autoMapFn: "check_endpoint_protection" },
        { id: "A.8.8", name: "Management of Technical Vulnerabilities", description: "Information about technical vulnerabilities of information systems shall be obtained and managed", autoMapFn: "check_vuln_management" },
        { id: "A.8.9", name: "Configuration Management", description: "Configurations shall be established, documented, implemented, monitored, and reviewed", autoMapFn: "check_config_management" },
        { id: "A.8.10", name: "Information Deletion", description: "Information stored in information systems shall be deleted when no longer required", autoMapFn: "check_data_security" },
        { id: "A.8.11", name: "Data Masking", description: "Data masking shall be used in accordance with the organization's policies", autoMapFn: "check_data_security" },
        { id: "A.8.12", name: "Data Leakage Prevention", description: "Data leakage prevention measures shall be applied to systems, networks, and any other devices", autoMapFn: "check_dlp" },
        { id: "A.8.15", name: "Logging", description: "Logs that record activities, exceptions, faults, and other relevant events shall be produced and stored", autoMapFn: "check_logging" },
        { id: "A.8.16", name: "Monitoring Activities", description: "Networks, systems, and applications shall be monitored for anomalous behavior", autoMapFn: "check_continuous_monitoring" },
        { id: "A.8.20", name: "Network Security", description: "Networks and network devices shall be secured, managed, and controlled", autoMapFn: "check_network_security" },
        { id: "A.8.23", name: "Web Filtering", description: "Access to external websites shall be managed to reduce exposure to malicious content", autoMapFn: "check_web_filtering" },
        { id: "A.8.24", name: "Use of Cryptography", description: "Rules for the effective use of cryptography, including key management, shall be defined", autoMapFn: "check_encryption" },
        { id: "A.8.25", name: "Secure Development Life Cycle", description: "Rules for the secure development of software and systems shall be established", autoMapFn: "check_sdlc" },
        { id: "A.8.28", name: "Secure Coding", description: "Secure coding principles shall be applied to software development", autoMapFn: "check_sdlc" },
      ],
    },
  ],
};

const SECURITY_TOOL_CATEGORIES = [
  "endpoint", "web", "nac", "vpn", "firewall", "dlp",
  "email", "identity", "backup", "siem", "vuln_scanner",
  "encryption", "patch_mgmt",
] as const;

interface TenantContext {
  tenantId: number;
  assetCount: number;
  activeAssetCount: number;
  assetToolCoverage: Record<string, number>;
  configuredToolCategories: Set<string>;
  configuredToolCount: number;
  incidentCount: number;
  resolvedIncidents: number;
  securityEventCount: number;
  eventTypes: Set<string>;
  userAssetCount: number;
  hasTeamMembers: boolean;
  hasServices: boolean;
  hasProjects: boolean;
  hasTickets: boolean;
  hasReports: boolean;
  hasKnowledgeBase: boolean;
  hasDlpEvents: boolean;
  hasSseEvents: boolean;
  hasVulnEvents: boolean;
  hasEmailEvents: boolean;
  hasEndpointEvents: boolean;
  hasIdentityEvents: boolean;
  hasCloudEvents: boolean;
  hasNetworkEvents: boolean;
  hasWafEvents: boolean;
}

async function gatherTenantContext(tenantId: number): Promise<TenantContext> {
  const [assetRows] = await db.select({ count: count() }).from(assets).where(eq(assets.tenantId, tenantId));
  const [activeAssetRows] = await db.select({ count: count() }).from(assets).where(and(eq(assets.tenantId, tenantId), eq(assets.status, "active")));
  const [incidentRows] = await db.select({ count: count() }).from(incidents).where(eq(incidents.tenantId, tenantId));
  const [resolvedRows] = await db.select({ count: count() }).from(incidents).where(and(eq(incidents.tenantId, tenantId), eq(incidents.status, "resolved")));
  const [eventRows] = await db.select({ count: count() }).from(securityEvents).where(eq(securityEvents.tenantId, tenantId));
  const [userAssetRows] = await db.select({ count: count() }).from(userAssets).where(eq(userAssets.tenantId, tenantId));

  const eventTypeResults = await db.select({ eventType: securityEvents.eventType }).from(securityEvents).where(eq(securityEvents.tenantId, tenantId)).groupBy(securityEvents.eventType);
  const eventTypes = new Set(eventTypeResults.map(r => r.eventType));

  const allAssets = await db.select({
    enrichmentData: assets.enrichmentData,
  }).from(assets).where(eq(assets.tenantId, tenantId));

  const assetToolCoverage: Record<string, number> = {};
  for (const cat of SECURITY_TOOL_CATEGORIES) {
    assetToolCoverage[cat] = 0;
  }

  for (const a of allAssets) {
    const enrichment = a.enrichmentData as any;
    if (enrichment?.securityTools) {
      for (const cat of SECURITY_TOOL_CATEGORIES) {
        if (enrichment.securityTools[cat]) {
          assetToolCoverage[cat]++;
        }
      }
    }
  }

  let hasTeamMembers = false;
  let hasServices = false;
  let hasProjects = false;
  let hasTickets = false;
  let hasReports = false;
  let hasKnowledgeBase = false;

  try {
    const tmResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM team_members WHERE tenant_id = ${tenantId}`);
    hasTeamMembers = Number((tmResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}
  try {
    const svcResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM services WHERE tenant_id = ${tenantId}`);
    hasServices = Number((svcResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}
  try {
    const projResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM projects WHERE tenant_id = ${tenantId}`);
    hasProjects = Number((projResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}
  try {
    const ticketResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM tickets WHERE tenant_id = ${tenantId}`);
    hasTickets = Number((ticketResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}
  try {
    const reportResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM reports WHERE tenant_id = ${tenantId}`);
    hasReports = Number((reportResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}
  try {
    const kbResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ${tenantId}`);
    hasKnowledgeBase = Number((kbResult as any).rows?.[0]?.cnt || 0) > 0;
  } catch {}

  const configuredToolCategories = new Set<string>();
  let configuredToolCount = 0;
  try {
    const toolsResult = await db.execute(sql`SELECT category, deployment_status, coverage_percent FROM tenant_security_tools WHERE tenant_id = ${tenantId} AND deployment_status != 'not_deployed'`);
    const rows = (toolsResult as any).rows || [];
    configuredToolCount = rows.length;
    const categoryToEngineMap: Record<string, string[]> = {
      endpoint_protection: ["endpoint"],
      email_security: ["email"],
      siem: ["siem"],
      dlp: ["dlp"],
      waf: ["web"],
      nac: ["nac"],
      vpn: ["vpn"],
      firewall: ["firewall"],
      identity_access: ["identity"],
      backup_recovery: ["backup"],
      vulnerability_mgmt: ["vuln_scanner"],
      encryption: ["encryption"],
      patch_mgmt: ["patch_mgmt"],
      cloud_security: ["web"],
      soar: ["siem"],
      threat_intel: ["siem"],
    };
    for (const row of rows) {
      configuredToolCategories.add(row.category);
      const deployFactor = row.deployment_status === "deployed" ? 1.0
        : row.deployment_status === "partial" ? 0.6
        : row.deployment_status === "planned" ? 0.2 : 0;
      const coveragePct = Math.min(100, Math.max(0, row.coverage_percent ?? 100));
      const effectiveCoverage = Math.round(deployFactor * coveragePct);
      const engineCats = categoryToEngineMap[row.category] || [];
      for (const ec of engineCats) {
        assetToolCoverage[ec] = Math.min(100, Math.max(assetToolCoverage[ec] || 0, effectiveCoverage));
      }
    }
  } catch {}

  return {
    tenantId,
    assetCount: assetRows.count,
    activeAssetCount: activeAssetRows.count,
    assetToolCoverage,
    incidentCount: incidentRows.count,
    resolvedIncidents: resolvedRows.count,
    securityEventCount: eventRows.count,
    eventTypes,
    userAssetCount: userAssetRows.count,
    hasTeamMembers,
    hasServices,
    hasProjects,
    hasTickets,
    hasReports,
    hasKnowledgeBase,
    hasDlpEvents: eventTypes.has("dlp"),
    hasSseEvents: eventTypes.has("sse"),
    hasVulnEvents: eventTypes.has("vulnerability"),
    hasEmailEvents: eventTypes.has("email"),
    hasEndpointEvents: eventTypes.has("endpoint"),
    hasIdentityEvents: eventTypes.has("identity"),
    hasCloudEvents: eventTypes.has("cloud"),
    hasNetworkEvents: eventTypes.has("network"),
    hasWafEvents: eventTypes.has("waf"),
    configuredToolCategories,
    configuredToolCount,
  };
}

type ControlStatus = "implemented" | "partial" | "not_implemented" | "not_applicable";

function assessControl(autoMapFn: string, ctx: TenantContext): { status: ControlStatus; score: number; evidence: string } {
  switch (autoMapFn) {
    case "check_tenant_config":
      if (ctx.assetCount > 0 && ctx.hasServices) return { status: "implemented", score: 100, evidence: "Tenant configured with assets and services" };
      if (ctx.assetCount > 0) return { status: "partial", score: 50, evidence: "Assets present but services not configured" };
      return { status: "not_implemented", score: 0, evidence: "No assets or services configured" };

    case "check_risk_management":
      if (ctx.incidentCount > 0 && ctx.hasReports) return { status: "implemented", score: 100, evidence: "Risk management active with incidents tracked and reports generated" };
      if (ctx.incidentCount > 0) return { status: "partial", score: 60, evidence: "Incidents tracked but reporting incomplete" };
      return { status: "partial", score: 20, evidence: "Risk management framework established" };

    case "check_roles_assigned":
      if (ctx.hasTeamMembers) return { status: "implemented", score: 100, evidence: "Team members assigned with defined roles" };
      return { status: "not_implemented", score: 0, evidence: "No team members or roles configured" };

    case "check_policies":
      if (ctx.hasKnowledgeBase && ctx.hasServices) return { status: "implemented", score: 100, evidence: "Policies documented in knowledge base with service governance" };
      if (ctx.hasKnowledgeBase) return { status: "partial", score: 60, evidence: "Knowledge base with some policy documentation" };
      return { status: "not_implemented", score: 0, evidence: "No policy documentation found" };

    case "check_reporting":
      if (ctx.hasReports) return { status: "implemented", score: 100, evidence: "Regular reporting and oversight activities in place" };
      return { status: "not_implemented", score: 0, evidence: "No reporting configured" };

    case "check_supply_chain":
      if (ctx.hasServices && ctx.hasProjects) return { status: "partial", score: 50, evidence: "Service and project tracking provides partial supply chain oversight" };
      return { status: "not_implemented", score: 0, evidence: "No supply chain risk management processes detected" };

    case "check_asset_inventory": {
      if (ctx.assetCount >= 50 && ctx.userAssetCount > 0) return { status: "implemented", score: 100, evidence: `${ctx.assetCount} assets and ${ctx.userAssetCount} user assets inventoried` };
      if (ctx.assetCount > 0) return { status: "partial", score: 70, evidence: `${ctx.assetCount} assets inventoried` };
      return { status: "not_implemented", score: 0, evidence: "No asset inventory" };
    }

    case "check_risk_assessment": {
      const hasVuln = ctx.hasVulnEvents;
      if (hasVuln && ctx.incidentCount > 0) return { status: "implemented", score: 100, evidence: "Vulnerability scanning and incident tracking active" };
      if (hasVuln || ctx.incidentCount > 0) return { status: "partial", score: 50, evidence: "Partial risk assessment through event monitoring" };
      return { status: "not_implemented", score: 0, evidence: "No vulnerability or risk assessment data" };
    }

    case "check_improvement_tracking":
      if (ctx.hasProjects && ctx.hasTickets) return { status: "implemented", score: 100, evidence: "Improvement tracked through projects and ticketing" };
      if (ctx.hasTickets) return { status: "partial", score: 50, evidence: "Ticketing system tracks some improvements" };
      return { status: "not_implemented", score: 0, evidence: "No improvement tracking" };

    case "check_identity_access": {
      const idCov = ctx.assetToolCoverage.identity || 0;
      if (idCov >= 80 && ctx.hasIdentityEvents) return { status: "implemented", score: 100, evidence: `Identity management at ${idCov}% coverage with event monitoring` };
      if (idCov > 0 && ctx.hasIdentityEvents) return { status: "partial", score: Math.round(idCov * 0.8 + 20), evidence: `Identity management at ${idCov}% coverage with events` };
      if (idCov > 0) return { status: "partial", score: Math.round(idCov * 0.6), evidence: `Identity management at ${idCov}% coverage` };
      if (ctx.hasIdentityEvents) return { status: "partial", score: 40, evidence: "Identity events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No IAM tools detected" };
    }

    case "check_awareness_training":
      if (ctx.hasKnowledgeBase && ctx.hasTeamMembers) return { status: "partial", score: 50, evidence: "Knowledge base available for security awareness" };
      return { status: "not_implemented", score: 0, evidence: "No formal security awareness training program detected" };

    case "check_data_security": {
      const encCov = ctx.assetToolCoverage.encryption || 0;
      const dlpCov = ctx.assetToolCoverage.dlp || 0;
      const combinedCov = Math.max(encCov, dlpCov);
      if (ctx.hasDlpEvents && encCov >= 80) return { status: "implemented", score: 100, evidence: `DLP events active, encryption at ${encCov}% coverage` };
      if (ctx.hasDlpEvents && combinedCov > 0) return { status: "partial", score: Math.round(combinedCov * 0.7 + 30), evidence: `Data security at ${combinedCov}% coverage with DLP events` };
      if (combinedCov > 0) return { status: "partial", score: Math.round(combinedCov * 0.6), evidence: `Data security tools at ${combinedCov}% coverage` };
      if (ctx.hasDlpEvents) return { status: "partial", score: 40, evidence: "DLP events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No data security controls detected" };
    }

    case "check_platform_security": {
      const epCoverage = ctx.assetToolCoverage.endpoint || 0;
      const patchCoverage = ctx.assetToolCoverage.patch_mgmt || 0;
      const avgPlatformCov = (epCoverage + patchCoverage) / 2;
      if (epCoverage >= 80 && patchCoverage >= 80) return { status: "implemented", score: 100, evidence: `Endpoint at ${epCoverage}% and patch management at ${patchCoverage}% coverage` };
      if (epCoverage > 0 && patchCoverage > 0) return { status: "partial", score: Math.round(avgPlatformCov * 0.8 + 20), evidence: `Endpoint at ${epCoverage}% and patch at ${patchCoverage}% coverage` };
      if (epCoverage > 0) return { status: "partial", score: Math.round(epCoverage * 0.6), evidence: `Endpoint protection at ${epCoverage}% coverage` };
      if (ctx.hasEndpointEvents) return { status: "partial", score: 30, evidence: "Endpoint events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No platform security controls detected" };
    }

    case "check_infra_resilience": {
      const backupCov = ctx.assetToolCoverage.backup || 0;
      const fwCov = ctx.assetToolCoverage.firewall || 0;
      const infraAvg = (backupCov + fwCov) / 2;
      if (backupCov >= 80 && fwCov >= 80) return { status: "implemented", score: 100, evidence: `Backup at ${backupCov}% and firewall at ${fwCov}% coverage` };
      if (backupCov > 0 && fwCov > 0) return { status: "partial", score: Math.round(infraAvg * 0.8 + 20), evidence: `Backup at ${backupCov}% and firewall at ${fwCov}% coverage` };
      if (backupCov > 0 || fwCov > 0) return { status: "partial", score: Math.round(Math.max(backupCov, fwCov) * 0.5), evidence: `Partial infrastructure resilience (backup: ${backupCov}%, firewall: ${fwCov}%)` };
      return { status: "not_implemented", score: 0, evidence: "No infrastructure resilience controls" };
    }

    case "check_continuous_monitoring": {
      const siemCov = ctx.assetToolCoverage.siem || 0;
      if (siemCov >= 80 && ctx.securityEventCount > 0) return { status: "implemented", score: 100, evidence: `SIEM at ${siemCov}% coverage with ${ctx.securityEventCount} events monitored` };
      if (siemCov > 0 && ctx.securityEventCount > 0) return { status: "partial", score: Math.round(siemCov * 0.7 + 30), evidence: `SIEM at ${siemCov}% coverage with ${ctx.securityEventCount} events` };
      if (ctx.securityEventCount > 0) return { status: "partial", score: 70, evidence: `${ctx.securityEventCount} security events collected without dedicated SIEM` };
      if (siemCov > 0) return { status: "partial", score: Math.round(siemCov * 0.5), evidence: `SIEM at ${siemCov}% coverage but no events collected` };
      return { status: "not_implemented", score: 0, evidence: "No continuous monitoring" };
    }

    case "check_event_analysis":
      if (ctx.incidentCount > 0 && ctx.securityEventCount > 0) return { status: "implemented", score: 100, evidence: "Security events analyzed and incidents created" };
      if (ctx.securityEventCount > 0) return { status: "partial", score: 50, evidence: "Events collected but analysis incomplete" };
      return { status: "not_implemented", score: 0, evidence: "No event analysis capability" };

    case "check_incident_management":
      if (ctx.incidentCount > 0 && ctx.hasTickets) return { status: "implemented", score: 100, evidence: `${ctx.incidentCount} incidents managed with ticketing system` };
      if (ctx.incidentCount > 0) return { status: "partial", score: 70, evidence: `${ctx.incidentCount} incidents tracked` };
      return { status: "not_implemented", score: 0, evidence: "No incident management" };

    case "check_incident_analysis":
      if (ctx.incidentCount > 0 && ctx.resolvedIncidents > 0) return { status: "implemented", score: 100, evidence: `${ctx.resolvedIncidents} incidents analyzed and resolved` };
      if (ctx.incidentCount > 0) return { status: "partial", score: 50, evidence: "Incidents tracked but analysis incomplete" };
      return { status: "not_implemented", score: 0, evidence: "No incident analysis" };

    case "check_incident_communication":
      if (ctx.hasReports && ctx.incidentCount > 0) return { status: "implemented", score: 100, evidence: "Incident reporting and communication active" };
      if (ctx.incidentCount > 0) return { status: "partial", score: 40, evidence: "Incidents tracked but communication processes incomplete" };
      return { status: "not_implemented", score: 0, evidence: "No incident communication processes" };

    case "check_incident_mitigation":
      if (ctx.resolvedIncidents > 0) return { status: "implemented", score: 100, evidence: `${ctx.resolvedIncidents} incidents mitigated and resolved` };
      if (ctx.incidentCount > 0) return { status: "partial", score: 30, evidence: "Incidents tracked but mitigation incomplete" };
      return { status: "not_implemented", score: 0, evidence: "No incident mitigation capability" };

    case "check_incident_response":
      if (ctx.incidentCount > 0 && ctx.resolvedIncidents > 0 && ctx.hasTeamMembers) return { status: "implemented", score: 100, evidence: "Incident response with dedicated team" };
      if (ctx.incidentCount > 0 && ctx.resolvedIncidents > 0) return { status: "partial", score: 60, evidence: "Incidents resolved but no dedicated response team" };
      return { status: "not_implemented", score: 0, evidence: "No formal incident response" };

    case "check_recovery_plan": {
      const bkpCov = ctx.assetToolCoverage.backup || 0;
      if (bkpCov >= 80 && ctx.resolvedIncidents > 0) return { status: "implemented", score: 100, evidence: `Backup at ${bkpCov}% coverage with recovery processes active` };
      if (bkpCov > 0 && ctx.resolvedIncidents > 0) return { status: "partial", score: Math.round(bkpCov * 0.7 + 30), evidence: `Backup at ${bkpCov}% coverage with some recovery` };
      if (bkpCov > 0) return { status: "partial", score: Math.round(bkpCov * 0.5), evidence: `Backup infrastructure at ${bkpCov}% coverage` };
      return { status: "not_implemented", score: 0, evidence: "No recovery plan detected" };
    }

    case "check_recovery_communication": {
      const bkpCov2 = ctx.assetToolCoverage.backup || 0;
      if (ctx.hasReports && bkpCov2 >= 80) return { status: "partial", score: 60, evidence: `Reporting with backup at ${bkpCov2}% coverage supports recovery communication` };
      if (ctx.hasReports && bkpCov2 > 0) return { status: "partial", score: Math.round(bkpCov2 * 0.4 + 10), evidence: `Reporting with backup at ${bkpCov2}% coverage` };
      return { status: "not_implemented", score: 0, evidence: "No recovery communication processes" };
    }

    case "check_endpoint_protection": {
      const epCov = ctx.assetToolCoverage.endpoint || 0;
      if (epCov >= 80) return { status: "implemented", score: 100, evidence: `Endpoint protection at ${epCov}% coverage` };
      if (epCov > 0) return { status: "partial", score: Math.round(epCov), evidence: `Endpoint protection at ${epCov}% coverage` };
      return { status: "not_implemented", score: 0, evidence: "No endpoint protection deployed" };
    }

    case "check_authentication": {
      const authCov = ctx.assetToolCoverage.identity || 0;
      if (authCov >= 80) return { status: "implemented", score: 100, evidence: `Authentication controls at ${authCov}% coverage` };
      if (authCov > 0) return { status: "partial", score: Math.round(authCov * 0.6 + 20), evidence: `Authentication at ${authCov}% coverage` };
      return { status: "partial", score: 40, evidence: "Basic authentication via platform login" };
    }

    case "check_vuln_management": {
      const vulnCov = ctx.assetToolCoverage.vuln_scanner || 0;
      if (vulnCov >= 80 && ctx.hasVulnEvents) return { status: "implemented", score: 100, evidence: `Vulnerability scanning at ${vulnCov}% coverage with event tracking` };
      if (vulnCov > 0 && ctx.hasVulnEvents) return { status: "partial", score: Math.round(vulnCov * 0.7 + 20), evidence: `Vulnerability scanning at ${vulnCov}% coverage with events` };
      if (vulnCov > 0) return { status: "partial", score: Math.round(vulnCov * 0.5), evidence: `Vulnerability scanning at ${vulnCov}% coverage` };
      if (ctx.hasVulnEvents) return { status: "partial", score: 40, evidence: "Vulnerability events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No vulnerability management" };
    }

    case "check_config_management": {
      const patchCfgCov = ctx.assetToolCoverage.patch_mgmt || 0;
      if (ctx.assetCount > 0 && patchCfgCov >= 80) return { status: "partial", score: 70, evidence: `Asset tracking with patch management at ${patchCfgCov}% coverage` };
      if (ctx.assetCount > 0 && patchCfgCov > 0) return { status: "partial", score: Math.round(patchCfgCov * 0.4 + 20), evidence: `Patch management at ${patchCfgCov}% coverage provides partial config management` };
      if (ctx.assetCount > 0) return { status: "partial", score: 30, evidence: "Asset inventory provides basic configuration tracking" };
      return { status: "not_implemented", score: 0, evidence: "No configuration management" };
    }

    case "check_dlp": {
      const dlpToolCov = ctx.assetToolCoverage.dlp || 0;
      if (ctx.hasDlpEvents && dlpToolCov >= 80) return { status: "implemented", score: 100, evidence: `DLP tools at ${dlpToolCov}% coverage with event monitoring` };
      if (ctx.hasDlpEvents && dlpToolCov > 0) return { status: "partial", score: Math.round(dlpToolCov * 0.7 + 20), evidence: `DLP at ${dlpToolCov}% coverage with events` };
      if (dlpToolCov > 0) return { status: "partial", score: Math.round(dlpToolCov * 0.6), evidence: `DLP tools at ${dlpToolCov}% coverage` };
      if (ctx.hasDlpEvents) return { status: "partial", score: 40, evidence: "DLP events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No DLP controls" };
    }

    case "check_logging": {
      const logSiemCov = ctx.assetToolCoverage.siem || 0;
      if (logSiemCov >= 80 && ctx.securityEventCount > 100) return { status: "implemented", score: 100, evidence: `SIEM at ${logSiemCov}% coverage with ${ctx.securityEventCount} log events` };
      if (logSiemCov > 0 && ctx.securityEventCount > 0) return { status: "partial", score: Math.round(logSiemCov * 0.6 + 20), evidence: `SIEM at ${logSiemCov}% coverage with ${ctx.securityEventCount} events` };
      if (ctx.securityEventCount > 0) return { status: "partial", score: 60, evidence: `${ctx.securityEventCount} security events logged` };
      return { status: "not_implemented", score: 0, evidence: "No centralized logging" };
    }

    case "check_network_security": {
      const netFwCov = ctx.assetToolCoverage.firewall || 0;
      const nacCov = ctx.assetToolCoverage.nac || 0;
      const netAvg = (netFwCov + nacCov) / 2;
      if (netFwCov >= 80 && nacCov >= 80) return { status: "implemented", score: 100, evidence: `Firewall at ${netFwCov}% and NAC at ${nacCov}% coverage` };
      if (netFwCov > 0 && nacCov > 0) return { status: "partial", score: Math.round(netAvg * 0.7 + 20), evidence: `Firewall at ${netFwCov}% and NAC at ${nacCov}% coverage` };
      if (netFwCov > 0 || nacCov > 0) return { status: "partial", score: Math.round(Math.max(netFwCov, nacCov) * 0.6), evidence: `Network security at ${Math.max(netFwCov, nacCov)}% coverage` };
      if (ctx.hasNetworkEvents) return { status: "partial", score: 30, evidence: "Network events detected without configured tools" };
      return { status: "not_implemented", score: 0, evidence: "No network security controls" };
    }

    case "check_web_filtering": {
      const webCov = ctx.assetToolCoverage.web || 0;
      if (webCov >= 80 && ctx.hasSseEvents) return { status: "implemented", score: 100, evidence: `Web filtering at ${webCov}% coverage with SSE event monitoring` };
      if (webCov > 0 && ctx.hasSseEvents) return { status: "partial", score: Math.round(webCov * 0.7 + 20), evidence: `Web filtering at ${webCov}% coverage with events` };
      if (webCov > 0) return { status: "partial", score: Math.round(webCov * 0.6), evidence: `Web filtering at ${webCov}% coverage` };
      if (ctx.hasSseEvents) return { status: "partial", score: 40, evidence: "SSE events detected without configured web tools" };
      return { status: "not_implemented", score: 0, evidence: "No web filtering" };
    }

    case "check_encryption": {
      const encryptCov = ctx.assetToolCoverage.encryption || 0;
      if (encryptCov >= 80) return { status: "implemented", score: 100, evidence: `Encryption tools at ${encryptCov}% coverage` };
      if (encryptCov > 0) return { status: "partial", score: Math.round(encryptCov * 0.8), evidence: `Encryption tools at ${encryptCov}% coverage` };
      return { status: "not_implemented", score: 0, evidence: "No encryption controls detected" };
    }

    case "check_threat_intel":
      if (ctx.securityEventCount > 100 && ctx.incidentCount > 0) return { status: "implemented", score: 100, evidence: "Threat intelligence via event correlation and incident tracking" };
      if (ctx.securityEventCount > 0) return { status: "partial", score: 50, evidence: "Security events provide partial threat intelligence" };
      return { status: "not_implemented", score: 0, evidence: "No threat intelligence" };

    case "check_project_security":
      if (ctx.hasProjects) return { status: "partial", score: 50, evidence: "Project management tracks security implementation activities" };
      return { status: "not_implemented", score: 0, evidence: "No project management" };

    case "check_cloud_security":
      if (ctx.hasCloudEvents || ctx.hasSseEvents) return { status: "implemented", score: 100, evidence: "Cloud security monitoring active" };
      return { status: "not_implemented", score: 0, evidence: "No cloud security monitoring" };

    case "check_forensics":
      if (ctx.securityEventCount > 0 && ctx.incidentCount > 0) return { status: "partial", score: 50, evidence: "Event logs and incidents provide forensic evidence collection" };
      return { status: "not_implemented", score: 0, evidence: "No forensics capability" };

    case "check_bcp": {
      const bcpBackupCov = ctx.assetToolCoverage.backup || 0;
      if (bcpBackupCov >= 80 && ctx.hasServices) return { status: "partial", score: 60, evidence: `Backup at ${bcpBackupCov}% coverage with services support business continuity` };
      if (bcpBackupCov > 0 && ctx.hasServices) return { status: "partial", score: Math.round(bcpBackupCov * 0.4 + 10), evidence: `Backup at ${bcpBackupCov}% coverage with services` };
      if (bcpBackupCov > 0) return { status: "partial", score: Math.round(bcpBackupCov * 0.3), evidence: `Backup at ${bcpBackupCov}% coverage` };
      return { status: "not_implemented", score: 0, evidence: "No BCP detected" };
    }

    case "check_segregation":
      if (ctx.hasTeamMembers) return { status: "partial", score: 50, evidence: "Team roles provide some segregation of duties" };
      return { status: "not_implemented", score: 0, evidence: "No segregation of duties detected" };

    case "check_physical_security":
      return { status: "not_applicable", score: 0, evidence: "Physical security outside platform scope" };

    case "check_physical_monitoring":
      return { status: "not_applicable", score: 0, evidence: "Physical monitoring outside platform scope" };

    case "check_sdlc":
      return { status: "not_applicable", score: 0, evidence: "SDLC practices outside platform scope" };

    default:
      return { status: "not_implemented", score: 0, evidence: "Control assessment not mapped" };
  }
}

function assessFramework(framework: FrameworkDef, ctx: TenantContext) {
  const functionScores: Record<string, { id: string; name: string; score: number; totalControls: number; implemented: number; partial: number; notImplemented: number; notApplicable: number }> = {};
  const controlStatuses: Record<string, { status: ControlStatus; score: number; evidence: string; controlName: string; functionId: string; functionName: string }> = {};
  const gaps: Array<{ controlId: string; controlName: string; functionId: string; functionName: string; status: ControlStatus; evidence: string; priority: string }> = [];

  let totalScore = 0;
  let totalApplicable = 0;

  for (const func of framework.functions) {
    let funcScore = 0;
    let funcApplicable = 0;
    let implemented = 0;
    let partial = 0;
    let notImplemented = 0;
    let notApplicable = 0;

    for (const ctrl of func.controls) {
      const result = assessControl(ctrl.autoMapFn, ctx);
      controlStatuses[ctrl.id] = {
        status: result.status,
        score: result.score,
        evidence: result.evidence,
        controlName: ctrl.name,
        functionId: func.id,
        functionName: func.name,
      };

      if (result.status === "not_applicable") {
        notApplicable++;
      } else {
        funcScore += result.score;
        funcApplicable++;
        totalScore += result.score;
        totalApplicable++;

        if (result.status === "implemented") implemented++;
        else if (result.status === "partial") partial++;
        else notImplemented++;

        if (result.status === "not_implemented" || (result.status === "partial" && result.score < 50)) {
          const priority = result.status === "not_implemented" ? "high" : "medium";
          gaps.push({
            controlId: ctrl.id,
            controlName: ctrl.name,
            functionId: func.id,
            functionName: func.name,
            status: result.status,
            evidence: result.evidence,
            priority,
          });
        }
      }
    }

    functionScores[func.id] = {
      id: func.id,
      name: func.name,
      score: funcApplicable > 0 ? Math.round(funcScore / funcApplicable) : 0,
      totalControls: func.controls.length,
      implemented,
      partial,
      notImplemented,
      notApplicable,
    };
  }

  const overallScore = totalApplicable > 0 ? Math.round(totalScore / totalApplicable) : 0;

  gaps.sort((a, b) => {
    if (a.priority === "high" && b.priority !== "high") return -1;
    if (a.priority !== "high" && b.priority === "high") return 1;
    return 0;
  });

  return { overallScore, functionScores, controlStatuses, gapAnalysis: gaps };
}

export async function assessComplianceFrameworks(tenantId: number) {
  const ctx = await gatherTenantContext(tenantId);

  const nistResult = assessFramework(NIST_CSF, ctx);
  const isoResult = assessFramework(ISO_27001, ctx);

  for (const fw of [{ framework: NIST_CSF, result: nistResult }, { framework: ISO_27001, result: isoResult }]) {
    const existing = await db.select().from(complianceAssessments).where(
      and(eq(complianceAssessments.tenantId, tenantId), eq(complianceAssessments.frameworkId, fw.framework.id))
    );

    if (existing.length > 0) {
      await db.update(complianceAssessments)
        .set({
          overallScore: fw.result.overallScore,
          functionScores: fw.result.functionScores,
          controlStatuses: fw.result.controlStatuses,
          gapAnalysis: fw.result.gapAnalysis,
          assessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(complianceAssessments.id, existing[0].id));
    } else {
      await db.insert(complianceAssessments).values({
        tenantId,
        frameworkId: fw.framework.id,
        overallScore: fw.result.overallScore,
        functionScores: fw.result.functionScores,
        controlStatuses: fw.result.controlStatuses,
        gapAnalysis: fw.result.gapAnalysis,
        assessedAt: new Date(),
      });
    }
  }

  return {
    nist_csf: {
      framework: { id: NIST_CSF.id, name: NIST_CSF.name, version: NIST_CSF.version },
      ...nistResult,
    },
    iso_27001: {
      framework: { id: ISO_27001.id, name: ISO_27001.name, version: ISO_27001.version },
      ...isoResult,
    },
  };
}

export async function getComplianceData(tenantId: number) {
  const assessments = await db.select().from(complianceAssessments).where(eq(complianceAssessments.tenantId, tenantId));

  if (assessments.length === 0) return null;

  const result: Record<string, any> = {};
  for (const a of assessments) {
    const framework = a.frameworkId === "nist_csf" ? NIST_CSF : ISO_27001;
    result[a.frameworkId] = {
      framework: { id: framework.id, name: framework.name, version: framework.version },
      overallScore: a.overallScore,
      functionScores: a.functionScores,
      controlStatuses: a.controlStatuses,
      gapAnalysis: a.gapAnalysis,
      assessedAt: a.assessedAt,
    };
  }

  return result;
}

export function getFrameworkDefinitions() {
  return {
    nist_csf: {
      id: NIST_CSF.id,
      name: NIST_CSF.name,
      version: NIST_CSF.version,
      functions: NIST_CSF.functions.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        controlCount: f.controls.length,
      })),
    },
    iso_27001: {
      id: ISO_27001.id,
      name: ISO_27001.name,
      version: ISO_27001.version,
      functions: ISO_27001.functions.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        controlCount: f.controls.length,
      })),
    },
  };
}
