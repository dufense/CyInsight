import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb, pgEnum, real, doublePrecision, unique, uniqueIndex, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const tenantTypeEnum = pgEnum("tenant_type", ["mssp", "customer"]);
export const roleEnum = pgEnum("user_role", ["platform_admin", "mss_admin", "mss_analyst", "customer", "security_engineer", "service_desk", "security_analyst", "soc_manager"]);
export const severityEnum = pgEnum("severity", ["critical", "high", "medium", "low", "info"]);
export const incidentStatusEnum = pgEnum("incident_status", ["open", "investigating", "contained", "resolved", "closed"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "waiting", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["urgent", "high", "medium", "low"]);
export const projectStatusEnum = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "cancelled"]);
export const taskStatusEnum = pgEnum("task_status", ["backlog", "todo", "in_progress", "review", "done"]);
export const eventTypeEnum = pgEnum("event_type", ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud", "web", "database", "ot_iot"]);
export const pipelineStatusEnum = pgEnum("pipeline_status", ["received", "normalized", "enriched", "correlated", "stored"]);
export const reportTypeEnum = pgEnum("report_type", ["executive_summary", "endpoint", "email", "vulnerability", "compliance", "threat_intelligence", "incident_response", "cloud_security", "asset_inventory", "threat_landscape", "sla_performance", "soc_operations", "risk_posture"]);

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: tenantTypeEnum("type").default("customer").notNull(),
  parentId: integer("parent_id"),
  logoUrl: text("logo_url"),
  brandColor: varchar("brand_color", { length: 20 }).default("#3b82f6"),
  industry: varchar("industry", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  timezone: varchar("timezone", { length: 100 }).default("UTC"),
  allowedEmailDomains: text("allowed_email_domains").array(),
  mfaRequired: boolean("mfa_required").default(false),
  dataRegion: varchar("data_region", { length: 50 }),
  retentionHotDays: integer("retention_hot_days").default(90),
  retentionWarmDays: integer("retention_warm_days").default(365),
  retentionColdDays: integer("retention_cold_days").default(1095),
  archiveStorageProvider: varchar("archive_storage_provider", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tenantUsers = pgTable("tenant_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  role: roleEnum("role").default("customer").notNull(),
  assignedRoles: text("assigned_roles").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const infraTypeEnum = pgEnum("infra_type", ["on-prem", "hybrid", "cloud"]);

export const infrastructureLocations = pgTable("infrastructure_locations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  infraType: infraTypeEnum("infra_type").notNull(),
  cloudProvider: varchar("cloud_provider", { length: 100 }),
  regionalDc: varchar("regional_dc", { length: 100 }),
  publicIpRanges: jsonb("public_ip_ranges").$type<string[]>().default([]),
  privateIpRanges: jsonb("private_ip_ranges").$type<string[]>().default([]),
  assetTypes: jsonb("asset_types").$type<string[]>().default([]),
  connectedLocationIds: jsonb("connected_location_ids").$type<number[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Geo & office intelligence fields (added for office-aware threat map)
  city: varchar("city", { length: 150 }),
  countryCode: varchar("country_code", { length: 5 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  hostnameKeywords: text("hostname_keywords").array().default([]),
});

export const insertInfrastructureLocationSchema = createInsertSchema(infrastructureLocations).omit({ id: true, createdAt: true });
export type InsertInfrastructureLocation = z.infer<typeof insertInfrastructureLocationSchema>;
export type InfrastructureLocation = typeof infrastructureLocations.$inferSelect;

export const CLOUD_PROVIDERS = ["AWS", "Azure", "GCP", "OCI"] as const;
export const REGIONAL_DCS = ["Yotta", "NTT", "Sify", "Cloud4C", "PiDC", "Other"] as const;
export const ASSET_TYPE_OPTIONS = ["Servers", "Workstations", "Network Devices", "Firewalls", "Load Balancers", "Storage", "Virtual Machines", "Containers", "IoT Devices", "Printers", "IP Phones"] as const;

export const SECURITY_TOOL_CATEGORY_DEFINITIONS = [
  { key: "endpoint_protection", name: "Endpoint Protection", description: "EDR/XDR, antivirus, endpoint security agents", icon: "Monitor" },
  { key: "email_security", name: "Email Security", description: "Email gateway, anti-phishing, email encryption", icon: "Mail" },
  { key: "siem", name: "SIEM", description: "Security Information & Event Management", icon: "BarChart3" },
  { key: "dlp", name: "Data Loss Prevention", description: "Data protection, classification, and leak prevention", icon: "Lock" },
  { key: "waf", name: "Web Application Firewall", description: "Web app protection, bot management, DDoS mitigation", icon: "Globe" },
  { key: "nac", name: "Network Access Control", description: "Network admission, device profiling, segmentation", icon: "Network" },
  { key: "vpn", name: "VPN / Zero Trust", description: "Remote access, ZTNA, secure tunneling", icon: "Shield" },
  { key: "firewall", name: "Firewall / NGFW", description: "Network firewall, next-gen firewall, IPS/IDS", icon: "ShieldCheck" },
  { key: "identity_access", name: "Identity & Access Management", description: "IAM, SSO, MFA, directory services, PAM", icon: "Users" },
  { key: "backup_recovery", name: "Backup & Recovery", description: "Data backup, disaster recovery, BC solutions", icon: "HardDrive" },
  { key: "vulnerability_mgmt", name: "Vulnerability Management", description: "Vulnerability scanning, patch prioritization, risk scoring", icon: "Bug" },
  { key: "encryption", name: "Encryption", description: "Data-at-rest encryption, key management, PKI", icon: "KeyRound" },
  { key: "patch_mgmt", name: "Patch Management", description: "OS & application patching, update management", icon: "RefreshCw" },
  { key: "cloud_security", name: "Cloud Security", description: "CSPM, CWPP, CASB, cloud workload protection", icon: "Cloud" },
  { key: "soar", name: "SOAR", description: "Security orchestration, automation & response", icon: "Workflow" },
  { key: "threat_intel", name: "Threat Intelligence", description: "TIP, EASM, dark web monitoring, IOC feeds", icon: "Radar" },
  { key: "secure_web_gateway", name: "Secure Web Gateway / Browser Security", description: "SWG, browser isolation, web filtering, DNS security", icon: "Globe" },
  { key: "directory_service", name: "Directory Service", description: "Active Directory, LDAP, Azure AD, directory management", icon: "FolderTree" },
  { key: "ai_security", name: "AI Security", description: "AI/ML threat detection, AI governance, LLM security, prompt injection protection", icon: "Brain" },
  { key: "mobile_security", name: "Mobile Security", description: "MDM, MAM, mobile threat defense, app vetting", icon: "Smartphone" },
  { key: "database_security", name: "Database Security", description: "DAM, database firewall, encryption, activity monitoring", icon: "Database" },
] as const;

export const POPULAR_SECURITY_TOOLS: Record<string, { name: string; vendor: string }[]> = {
  endpoint_protection: [
    { name: "CrowdStrike Falcon", vendor: "CrowdStrike" },
    { name: "SentinelOne Singularity", vendor: "SentinelOne" },
    { name: "Microsoft Defender for Endpoint", vendor: "Microsoft" },
    { name: "Palo Alto Cortex XDR", vendor: "Palo Alto Networks" },
    { name: "Cynet 360 AutoXDR", vendor: "Cynet" },
    { name: "Sophos Intercept X", vendor: "Sophos" },
    { name: "Trend Micro Apex One", vendor: "Trend Micro" },
    { name: "Carbon Black", vendor: "VMware" },
    { name: "ESET Endpoint Security", vendor: "ESET" },
    { name: "Deceptive Bytes", vendor: "Deceptive Bytes" },
  ],
  email_security: [
    { name: "Proofpoint Email Protection", vendor: "Proofpoint" },
    { name: "Check Point Harmony Email", vendor: "Check Point" },
    { name: "Mimecast Email Security", vendor: "Mimecast" },
    { name: "Microsoft Defender for Office 365", vendor: "Microsoft" },
    { name: "Barracuda Email Security", vendor: "Barracuda" },
    { name: "Cisco Secure Email", vendor: "Cisco" },
  ],
  siem: [
    { name: "Splunk Enterprise Security", vendor: "Splunk" },
    { name: "IBM QRadar", vendor: "IBM" },
    { name: "Microsoft Sentinel", vendor: "Microsoft" },
    { name: "LogRhythm SIEM", vendor: "LogRhythm" },
    { name: "Elastic Security", vendor: "Elastic" },
    { name: "Wazuh", vendor: "Wazuh" },
    { name: "Sumo Logic", vendor: "Sumo Logic" },
  ],
  dlp: [
    { name: "Forcepoint DLP", vendor: "Forcepoint" },
    { name: "Trellix DLP", vendor: "Trellix" },
    { name: "FortiDLP", vendor: "Fortinet" },
    { name: "GTB DLP", vendor: "GTB Technologies" },
    { name: "Proofpoint DLP", vendor: "Proofpoint" },
    { name: "Digital Guardian", vendor: "Fortra" },
    { name: "Microsoft Purview DLP", vendor: "Microsoft" },
  ],
  waf: [
    { name: "Imperva WAF", vendor: "Imperva" },
    { name: "Cloudflare WAF", vendor: "Cloudflare" },
    { name: "F5 Advanced WAF", vendor: "F5" },
    { name: "AWS WAF", vendor: "Amazon" },
    { name: "Azure WAF", vendor: "Microsoft" },
    { name: "Radware WAF", vendor: "Radware" },
    { name: "Akamai Kona Site Defender", vendor: "Akamai" },
  ],
  nac: [
    { name: "FortiNAC", vendor: "Fortinet" },
    { name: "Cisco ISE", vendor: "Cisco" },
    { name: "Aruba ClearPass", vendor: "HPE Aruba" },
    { name: "Portnox CLEAR", vendor: "Portnox" },
    { name: "Forescout", vendor: "Forescout" },
  ],
  vpn: [
    { name: "Palo Alto GlobalProtect", vendor: "Palo Alto Networks" },
    { name: "Cisco AnyConnect", vendor: "Cisco" },
    { name: "Zscaler Private Access", vendor: "Zscaler" },
    { name: "Fortinet FortiClient", vendor: "Fortinet" },
    { name: "Netskope Private Access", vendor: "Netskope" },
  ],
  firewall: [
    { name: "Palo Alto NGFW", vendor: "Palo Alto Networks" },
    { name: "Fortinet FortiGate", vendor: "Fortinet" },
    { name: "Check Point Quantum", vendor: "Check Point" },
    { name: "Cisco Firepower", vendor: "Cisco" },
    { name: "Sophos XG Firewall", vendor: "Sophos" },
    { name: "Juniper SRX", vendor: "Juniper" },
  ],
  identity_access: [
    { name: "Microsoft Entra ID", vendor: "Microsoft" },
    { name: "Okta", vendor: "Okta" },
    { name: "CyberArk PAM", vendor: "CyberArk" },
    { name: "Microsoft Active Directory", vendor: "Microsoft" },
    { name: "Ping Identity", vendor: "Ping Identity" },
    { name: "JAMF Pro", vendor: "JAMF" },
    { name: "SailPoint IdentityNow", vendor: "SailPoint" },
  ],
  backup_recovery: [
    { name: "Veeam Backup & Replication", vendor: "Veeam" },
    { name: "Commvault Complete", vendor: "Commvault" },
    { name: "Veritas NetBackup", vendor: "Veritas" },
    { name: "Acronis Cyber Protect", vendor: "Acronis" },
    { name: "Rubrik", vendor: "Rubrik" },
    { name: "Cohesity DataProtect", vendor: "Cohesity" },
  ],
  vulnerability_mgmt: [
    { name: "Rapid7 InsightVM", vendor: "Rapid7" },
    { name: "Qualys VMDR", vendor: "Qualys" },
    { name: "Tenable.io", vendor: "Tenable" },
    { name: "Vicarius vRx", vendor: "Vicarius" },
    { name: "Nessus Professional", vendor: "Tenable" },
    { name: "Microsoft Defender Vulnerability Management", vendor: "Microsoft" },
  ],
  encryption: [
    { name: "BitLocker", vendor: "Microsoft" },
    { name: "Symantec Endpoint Encryption", vendor: "Broadcom" },
    { name: "Thales CipherTrust", vendor: "Thales" },
    { name: "Vormetric Data Security", vendor: "Thales" },
    { name: "Vera (IRM)", vendor: "Vera" },
  ],
  patch_mgmt: [
    { name: "Microsoft SCCM/Intune", vendor: "Microsoft" },
    { name: "Ivanti Patch Management", vendor: "Ivanti" },
    { name: "ManageEngine Patch Manager Plus", vendor: "ManageEngine" },
    { name: "Automox", vendor: "Automox" },
    { name: "BigFix", vendor: "HCL" },
  ],
  cloud_security: [
    { name: "Netskope SSE", vendor: "Netskope" },
    { name: "Zscaler SSE", vendor: "Zscaler" },
    { name: "Prisma Cloud", vendor: "Palo Alto Networks" },
    { name: "Microsoft Defender for Cloud", vendor: "Microsoft" },
    { name: "AWS Security Hub", vendor: "Amazon" },
    { name: "Wiz", vendor: "Wiz" },
    { name: "Lacework", vendor: "Fortinet" },
  ],
  soar: [
    { name: "Palo Alto XSOAR", vendor: "Palo Alto Networks" },
    { name: "Splunk SOAR", vendor: "Splunk" },
    { name: "IBM Resilient", vendor: "IBM" },
    { name: "Tines", vendor: "Tines" },
    { name: "Swimlane", vendor: "Swimlane" },
  ],
  threat_intel: [
    { name: "Recorded Future", vendor: "Recorded Future" },
    { name: "Cyble Vision", vendor: "Cyble" },
    { name: "ThreatMon", vendor: "ThreatMon" },
    { name: "Group-IB Threat Intelligence", vendor: "Group-IB" },
    { name: "Mandiant Advantage", vendor: "Google" },
    { name: "AlienVault OTX", vendor: "AT&T Cybersecurity" },
  ],
  secure_web_gateway: [
    { name: "Zscaler Internet Access", vendor: "Zscaler" },
    { name: "Netskope SWG", vendor: "Netskope" },
    { name: "Cisco Umbrella", vendor: "Cisco" },
    { name: "Menlo Security", vendor: "Menlo Security" },
    { name: "Forcepoint SWG", vendor: "Forcepoint" },
    { name: "Island Enterprise Browser", vendor: "Island" },
    { name: "Palo Alto Prisma Access", vendor: "Palo Alto Networks" },
  ],
  directory_service: [
    { name: "Microsoft Active Directory", vendor: "Microsoft" },
    { name: "Microsoft Entra ID (Azure AD)", vendor: "Microsoft" },
    { name: "JumpCloud", vendor: "JumpCloud" },
    { name: "OpenLDAP", vendor: "OpenLDAP" },
    { name: "Oracle Unified Directory", vendor: "Oracle" },
    { name: "Ping Directory", vendor: "Ping Identity" },
  ],
  ai_security: [
    { name: "Robust Intelligence", vendor: "Robust Intelligence" },
    { name: "Protect AI", vendor: "Protect AI" },
    { name: "CalypsoAI", vendor: "CalypsoAI" },
    { name: "HiddenLayer", vendor: "HiddenLayer" },
    { name: "Lakera Guard", vendor: "Lakera" },
    { name: "Arthur AI", vendor: "Arthur" },
  ],
  mobile_security: [
    { name: "Microsoft Intune", vendor: "Microsoft" },
    { name: "VMware Workspace ONE", vendor: "VMware" },
    { name: "Zimperium", vendor: "Zimperium" },
    { name: "Lookout Mobile Security", vendor: "Lookout" },
    { name: "Jamf Pro", vendor: "Jamf" },
    { name: "MobileIron", vendor: "Ivanti" },
  ],
  database_security: [
    { name: "Imperva Database Security", vendor: "Imperva" },
    { name: "IBM Guardium", vendor: "IBM" },
    { name: "Oracle Audit Vault", vendor: "Oracle" },
    { name: "Fortinet FortiDB", vendor: "Fortinet" },
    { name: "McAfee Database Security", vendor: "Trellix" },
    { name: "Trustwave DbProtect", vendor: "Trustwave" },
  ],
};

export const deploymentStatusEnum = pgEnum("deployment_status", ["deployed", "partial", "planned", "not_deployed"]);

export const tenantSecurityTools = pgTable("tenant_security_tools", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  category: varchar("category", { length: 50 }).notNull(),
  toolName: varchar("tool_name", { length: 200 }).notNull(),
  vendor: varchar("vendor", { length: 200 }).notNull(),
  deploymentStatus: deploymentStatusEnum("deployment_status").default("deployed").notNull(),
  coveragePercent: integer("coverage_percent").default(100),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tenantSecurityToolsRelations = relations(tenantSecurityTools, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantSecurityTools.tenantId], references: [tenants.id] }),
}));

export const insertTenantSecurityToolSchema = createInsertSchema(tenantSecurityTools).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantSecurityTool = z.infer<typeof insertTenantSecurityToolSchema>;
export type TenantSecurityTool = typeof tenantSecurityTools.$inferSelect;

export const CATEGORY_NIST_MAPPING: Record<string, { functions: Record<string, { weight: number; categories: string[]; reason: string }> }> = {
  endpoint_protection: {
    functions: {
      Protect: { weight: 85, categories: ["PR.DS", "PR.PT", "PR.IP"], reason: "Endpoint prevention & host protection" },
      Detect: { weight: 90, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "Endpoint detection & behavioral analytics" },
      Respond: { weight: 70, categories: ["RS.MI", "RS.AN"], reason: "Automated response & quarantine" },
      Identify: { weight: 40, categories: ["ID.AM"], reason: "Endpoint asset inventory" },
    },
  },
  email_security: {
    functions: {
      Protect: { weight: 75, categories: ["PR.DS", "PR.AT"], reason: "Email filtering & anti-phishing" },
      Detect: { weight: 65, categories: ["DE.CM", "DE.AE"], reason: "Phishing & malware detection" },
    },
  },
  siem: {
    functions: {
      Detect: { weight: 90, categories: ["DE.CM", "DE.AE", "DE.DP"], reason: "Centralized detection & correlation" },
      Identify: { weight: 50, categories: ["ID.RA"], reason: "Risk visibility & event analysis" },
      Respond: { weight: 60, categories: ["RS.AN", "RS.CO"], reason: "Investigation & alert triage" },
      Govern: { weight: 40, categories: ["GV.OV"], reason: "Security oversight & reporting" },
    },
  },
  dlp: {
    functions: {
      Protect: { weight: 85, categories: ["PR.DS", "PR.IP"], reason: "Data protection & classification" },
      Identify: { weight: 45, categories: ["ID.AM"], reason: "Sensitive data discovery" },
      Govern: { weight: 35, categories: ["GV.PO"], reason: "Data handling policy enforcement" },
    },
  },
  waf: {
    functions: {
      Protect: { weight: 80, categories: ["PR.DS", "PR.PT"], reason: "Web application protection" },
      Detect: { weight: 60, categories: ["DE.CM"], reason: "Web attack detection" },
    },
  },
  nac: {
    functions: {
      Protect: { weight: 70, categories: ["PR.AC", "PR.PT"], reason: "Network access enforcement" },
      Identify: { weight: 65, categories: ["ID.AM", "ID.RA"], reason: "Network device discovery & profiling" },
      Detect: { weight: 50, categories: ["DE.CM"], reason: "Rogue device detection" },
    },
  },
  vpn: {
    functions: {
      Protect: { weight: 75, categories: ["PR.AC", "PR.DS"], reason: "Secure remote access & encryption" },
      Identify: { weight: 30, categories: ["ID.AM"], reason: "Remote user identification" },
    },
  },
  firewall: {
    functions: {
      Protect: { weight: 85, categories: ["PR.AC", "PR.DS", "PR.PT"], reason: "Network perimeter protection" },
      Detect: { weight: 65, categories: ["DE.CM", "DE.AE"], reason: "Network threat detection & IPS" },
      Respond: { weight: 40, categories: ["RS.MI"], reason: "Automated blocking & containment" },
    },
  },
  identity_access: {
    functions: {
      Protect: { weight: 80, categories: ["PR.AC", "PR.AT"], reason: "Identity governance & access control" },
      Identify: { weight: 55, categories: ["ID.AM"], reason: "Identity & account inventory" },
      Govern: { weight: 50, categories: ["GV.RR", "GV.PO"], reason: "Role management & policy enforcement" },
    },
  },
  backup_recovery: {
    functions: {
      Recover: { weight: 90, categories: ["RC.RP", "RC.CO"], reason: "Data recovery & business continuity" },
      Protect: { weight: 50, categories: ["PR.DS", "PR.IP"], reason: "Data backup & integrity protection" },
      Identify: { weight: 30, categories: ["ID.AM"], reason: "Backup asset inventory" },
    },
  },
  vulnerability_mgmt: {
    functions: {
      Identify: { weight: 85, categories: ["ID.RA", "ID.AM"], reason: "Vulnerability discovery & risk scoring" },
      Protect: { weight: 50, categories: ["PR.IP"], reason: "Remediation prioritization" },
      Detect: { weight: 40, categories: ["DE.CM"], reason: "Continuous vulnerability scanning" },
    },
  },
  encryption: {
    functions: {
      Protect: { weight: 80, categories: ["PR.DS"], reason: "Data encryption at rest & in transit" },
      Govern: { weight: 35, categories: ["GV.PO"], reason: "Encryption policy management" },
    },
  },
  patch_mgmt: {
    functions: {
      Protect: { weight: 75, categories: ["PR.IP", "PR.MA"], reason: "Patch deployment & maintenance" },
      Identify: { weight: 45, categories: ["ID.RA"], reason: "Missing patch identification" },
    },
  },
  cloud_security: {
    functions: {
      Protect: { weight: 80, categories: ["PR.DS", "PR.AC", "PR.PT"], reason: "Cloud workload protection" },
      Detect: { weight: 70, categories: ["DE.CM", "DE.AE"], reason: "Cloud threat detection" },
      Identify: { weight: 55, categories: ["ID.AM", "ID.RA"], reason: "Cloud asset discovery & risk" },
      Govern: { weight: 40, categories: ["GV.PO"], reason: "Cloud security posture management" },
    },
  },
  soar: {
    functions: {
      Respond: { weight: 90, categories: ["RS.AN", "RS.MI", "RS.RP", "RS.CO"], reason: "Orchestrated incident response" },
      Detect: { weight: 40, categories: ["DE.DP"], reason: "Automated detection process improvement" },
      Recover: { weight: 45, categories: ["RC.RP"], reason: "Recovery playbook automation" },
    },
  },
  threat_intel: {
    functions: {
      Identify: { weight: 75, categories: ["ID.RA"], reason: "Threat landscape analysis" },
      Detect: { weight: 70, categories: ["DE.CM", "DE.AE"], reason: "IOC-based threat detection" },
      Respond: { weight: 45, categories: ["RS.AN"], reason: "Threat context for investigations" },
    },
  },
  secure_web_gateway: {
    functions: {
      Protect: { weight: 80, categories: ["PR.DS", "PR.AC", "PR.PT"], reason: "Web traffic filtering & browser isolation" },
      Detect: { weight: 60, categories: ["DE.CM"], reason: "Malicious URL & content detection" },
      Identify: { weight: 35, categories: ["ID.AM"], reason: "Web application discovery" },
    },
  },
  directory_service: {
    functions: {
      Protect: { weight: 75, categories: ["PR.AC", "PR.AT"], reason: "Centralized authentication & access control" },
      Identify: { weight: 70, categories: ["ID.AM"], reason: "Identity & account inventory" },
      Govern: { weight: 55, categories: ["GV.RR", "GV.PO"], reason: "Identity governance & directory policy" },
    },
  },
  ai_security: {
    functions: {
      Protect: { weight: 70, categories: ["PR.DS", "PR.IP"], reason: "AI model protection & prompt injection prevention" },
      Detect: { weight: 75, categories: ["DE.CM", "DE.AE"], reason: "AI-specific threat detection & anomaly analysis" },
      Govern: { weight: 65, categories: ["GV.PO", "GV.OV"], reason: "AI governance & ethical AI policy" },
      Identify: { weight: 45, categories: ["ID.RA"], reason: "AI risk assessment" },
    },
  },
  mobile_security: {
    functions: {
      Protect: { weight: 80, categories: ["PR.DS", "PR.AC", "PR.PT"], reason: "Mobile device & app protection" },
      Detect: { weight: 65, categories: ["DE.CM"], reason: "Mobile threat detection" },
      Identify: { weight: 50, categories: ["ID.AM"], reason: "Mobile device inventory" },
      Respond: { weight: 40, categories: ["RS.MI"], reason: "Remote wipe & containment" },
    },
  },
  database_security: {
    functions: {
      Protect: { weight: 85, categories: ["PR.DS", "PR.AC"], reason: "Database access control & encryption" },
      Detect: { weight: 70, categories: ["DE.CM", "DE.AE"], reason: "Database activity monitoring & anomaly detection" },
      Identify: { weight: 50, categories: ["ID.AM"], reason: "Database asset discovery" },
      Govern: { weight: 40, categories: ["GV.PO"], reason: "Database security policy enforcement" },
    },
  },
};

export const CATEGORY_ISO27001_MAPPING: Record<string, { controlGroups: Record<string, { weight: number; controls: string[]; reason: string }> }> = {
  endpoint_protection: {
    controlGroups: {
      Technological: { weight: 85, controls: ["A.8.7", "A.8.8"], reason: "Malware protection & technical vulnerability management" },
    },
  },
  email_security: {
    controlGroups: {
      Technological: { weight: 75, controls: ["A.8.7", "A.8.23"], reason: "Malware protection & web filtering" },
    },
  },
  siem: {
    controlGroups: {
      Technological: { weight: 85, controls: ["A.8.15", "A.8.16"], reason: "Logging & monitoring" },
      Organizational: { weight: 50, controls: ["A.5.25"], reason: "Information security event assessment" },
    },
  },
  dlp: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.11", "A.8.12"], reason: "Data masking & data leakage prevention" },
      Organizational: { weight: 45, controls: ["A.5.12", "A.5.13"], reason: "Information classification & labeling" },
    },
  },
  waf: {
    controlGroups: {
      Technological: { weight: 75, controls: ["A.8.9", "A.8.23"], reason: "Configuration management & web filtering" },
    },
  },
  nac: {
    controlGroups: {
      Technological: { weight: 70, controls: ["A.8.20", "A.8.22"], reason: "Network security & network segmentation" },
    },
  },
  vpn: {
    controlGroups: {
      Technological: { weight: 70, controls: ["A.8.20", "A.8.24"], reason: "Network security & cryptographic controls" },
    },
  },
  firewall: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.20", "A.8.22", "A.8.23"], reason: "Network security, segmentation & filtering" },
    },
  },
  identity_access: {
    controlGroups: {
      Technological: { weight: 75, controls: ["A.8.2", "A.8.3", "A.8.5"], reason: "Access rights & authentication" },
      Organizational: { weight: 60, controls: ["A.5.15", "A.5.16", "A.5.18"], reason: "Access control policy & provisioning" },
      People: { weight: 40, controls: ["A.6.1", "A.6.2"], reason: "Screening & employment terms" },
    },
  },
  backup_recovery: {
    controlGroups: {
      Technological: { weight: 85, controls: ["A.8.13", "A.8.14"], reason: "Information backup & redundancy" },
      Organizational: { weight: 50, controls: ["A.5.29", "A.5.30"], reason: "ICT continuity & readiness" },
    },
  },
  vulnerability_mgmt: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.8", "A.8.34"], reason: "Vulnerability management & audit" },
      Organizational: { weight: 40, controls: ["A.5.25"], reason: "Security event assessment" },
    },
  },
  encryption: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.24"], reason: "Use of cryptography" },
      Organizational: { weight: 35, controls: ["A.5.31"], reason: "Legal & regulatory requirements" },
    },
  },
  patch_mgmt: {
    controlGroups: {
      Technological: { weight: 75, controls: ["A.8.8", "A.8.9"], reason: "Vulnerability & configuration management" },
    },
  },
  cloud_security: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.23", "A.8.26"], reason: "Cloud services security" },
      Organizational: { weight: 55, controls: ["A.5.21", "A.5.22", "A.5.23"], reason: "ICT supply chain & cloud service management" },
    },
  },
  soar: {
    controlGroups: {
      Organizational: { weight: 75, controls: ["A.5.24", "A.5.25", "A.5.26"], reason: "Incident management planning & response" },
      Technological: { weight: 50, controls: ["A.8.16"], reason: "Monitoring automation" },
    },
  },
  threat_intel: {
    controlGroups: {
      Organizational: { weight: 70, controls: ["A.5.7"], reason: "Threat intelligence" },
      Technological: { weight: 45, controls: ["A.8.16"], reason: "Monitoring activities" },
    },
  },
  secure_web_gateway: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.23", "A.8.22"], reason: "Web filtering & network segmentation" },
      Organizational: { weight: 35, controls: ["A.5.14"], reason: "Information transfer policies" },
    },
  },
  directory_service: {
    controlGroups: {
      Technological: { weight: 75, controls: ["A.8.2", "A.8.3", "A.8.5"], reason: "Access rights & authentication management" },
      Organizational: { weight: 65, controls: ["A.5.15", "A.5.16", "A.5.18"], reason: "Access control & identity provisioning" },
      People: { weight: 45, controls: ["A.6.1", "A.6.2"], reason: "Personnel screening & employment terms" },
    },
  },
  ai_security: {
    controlGroups: {
      Technological: { weight: 70, controls: ["A.8.16", "A.8.28"], reason: "AI monitoring & secure coding" },
      Organizational: { weight: 65, controls: ["A.5.8", "A.5.23"], reason: "Information security in project management & cloud services" },
    },
  },
  mobile_security: {
    controlGroups: {
      Technological: { weight: 80, controls: ["A.8.1", "A.8.7"], reason: "User endpoint devices & malware protection" },
      Organizational: { weight: 50, controls: ["A.5.14"], reason: "Information transfer & mobile device policy" },
      People: { weight: 40, controls: ["A.6.7"], reason: "Remote working controls" },
    },
  },
  database_security: {
    controlGroups: {
      Technological: { weight: 85, controls: ["A.8.11", "A.8.15", "A.8.24"], reason: "Data masking, logging & cryptographic controls" },
      Organizational: { weight: 50, controls: ["A.5.12", "A.5.33"], reason: "Information classification & records protection" },
    },
  },
};

export const INDUSTRY_OPTIONS = [
  "Banking & Financial Services",
  "Healthcare",
  "Technology",
  "Government",
  "Retail & E-Commerce",
  "Education",
  "Manufacturing",
  "Energy & Utilities",
  "Telecommunications",
  "Insurance",
  "Legal",
  "Media & Entertainment",
  "Transportation & Logistics",
  "Real Estate",
  "Pharmaceuticals",
  "Defense & Aerospace",
  "Hospitality",
  "Cybersecurity",
  "Non-Profit",
  "Other",
] as const;

export const MITRE_TACTICS = [
  "Reconnaissance", "Resource Development", "Initial Access", "Execution",
  "Persistence", "Privilege Escalation", "Defense Evasion", "Credential Access",
  "Discovery", "Lateral Movement", "Collection", "Command and Control",
  "Exfiltration", "Impact",
] as const;

export const KILL_CHAIN_PHASES = [
  "Reconnaissance", "Weaponization", "Delivery", "Exploitation",
  "Installation", "Command & Control", "Actions on Objectives",
] as const;

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  severity: severityEnum("severity").default("medium").notNull(),
  status: incidentStatusEnum("status").default("open").notNull(),
  source: varchar("source", { length: 100 }),
  category: varchar("category", { length: 100 }),
  incidentType: varchar("incident_type", { length: 100 }),
  sourceIp: varchar("source_ip", { length: 200 }),
  destinationIp: varchar("destination_ip", { length: 200 }),
  actionTaken: text("action_taken"),
  detectionSource: varchar("detection_source", { length: 200 }),
  affectedAssets: text("affected_assets"),
  recommendation: text("recommendation"),
  assignedTo: varchar("assigned_to"),
  mitreTactic: varchar("mitre_tactic", { length: 200 }),
  mitreTechniqueId: varchar("mitre_technique_id", { length: 50 }),
  mitreTechnique: varchar("mitre_technique", { length: 200 }),
  killChainPhase: varchar("kill_chain_phase", { length: 100 }),
  confidenceScore: integer("confidence_score"),
  isTruePositive: boolean("is_true_positive"),
  classification: varchar("classification", { length: 50 }),
  iocData: jsonb("ioc_data"),
  dedupHash: varchar("dedup_hash", { length: 64 }),
  sigmaMatches: jsonb("sigma_matches"),
  contextualAnalysis: jsonb("contextual_analysis"),
  threatNarrative: text("threat_narrative"),
  enrichedDescription: text("enriched_description"),
  triageScore: integer("triage_score"),
  triageReasoning: text("triage_reasoning"),
  triageSuggestedClassification: varchar("triage_suggested_classification", { length: 20 }),
  triageScoredAt: timestamp("triage_scored_at"),
  resolvedAt: timestamp("resolved_at"),
  investigatedAt: timestamp("investigated_at"),
  aiClassification: varchar("ai_classification", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  serviceId: integer("service_id").references(() => services.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  priority: ticketPriorityEnum("priority").default("medium").notNull(),
  status: ticketStatusEnum("status").default("open").notNull(),
  category: varchar("category", { length: 100 }),
  assignedTo: varchar("assigned_to"),
  createdBy: varchar("created_by"),
  firstResponseAt: timestamp("first_response_at"),
  slaBreached: boolean("sla_breached").default(false),
  responseDueAt: timestamp("response_due_at"),
  resolutionDueAt: timestamp("resolution_due_at"),
  slaResponseBreached: boolean("sla_response_breached").default(false),
  slaResolutionBreached: boolean("sla_resolution_breached").default(false),
  resolvedAt: timestamp("resolved_at"),
  aiHandled: boolean("ai_handled").default(false),
  aiAgentName: varchar("ai_agent_name", { length: 100 }),
  aiConfidence: integer("ai_confidence"),
  aiEscalated: boolean("ai_escalated").default(false),
  aiPipelineStatus: varchar("ai_pipeline_status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ticketComments = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: varchar("user_id"),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: projectStatusEnum("status").default("planning").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  ownerId: varchar("owner_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: taskStatusEnum("status").default("backlog").notNull(),
  priority: ticketPriorityEnum("priority").default("medium").notNull(),
  assignedTo: varchar("assigned_to"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scopeTypeEnum = pgEnum("scope_type", ["inclusion", "exclusion"]);
export const raciTypeEnum = pgEnum("raci_type", ["responsible", "accountable", "consulted", "informed"]);
export const riskProbabilityEnum = pgEnum("risk_probability", ["very_low", "low", "medium", "high", "very_high"]);
export const riskImpactEnum = pgEnum("risk_impact", ["negligible", "minor", "moderate", "major", "severe"]);
export const riskStatusEnum = pgEnum("risk_status", ["open", "mitigating", "accepted", "closed"]);
export const activityStatusEnum = pgEnum("activity_status", ["not_started", "in_progress", "completed", "delayed", "blocked"]);

export const projectScope = pgTable("project_scope", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  scopeType: scopeTypeEnum("scope_type").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectActivities = pgTable("project_activities", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: activityStatusEnum("status").default("not_started").notNull(),
  percentComplete: integer("percent_complete").default(0),
  assignedTo: varchar("assigned_to"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projectRaci = pgTable("project_raci", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  activityId: integer("activity_id").notNull().references(() => projectActivities.id),
  teamMemberId: integer("team_member_id").notNull().references(() => teamMembers.id),
  raciType: raciTypeEnum("raci_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectRisks = pgTable("project_risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  probability: riskProbabilityEnum("probability").default("medium").notNull(),
  impact: riskImpactEnum("impact").default("moderate").notNull(),
  riskScore: integer("risk_score").default(0),
  mitigation: text("mitigation"),
  owner: varchar("owner", { length: 255 }),
  status: riskStatusEnum("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  activityId: integer("activity_id").references(() => projectActivities.id),
  description: text("description").notNull(),
  logType: varchar("log_type", { length: 50 }).default("update").notNull(),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const securityEvents = pgTable("security_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  eventType: eventTypeEnum("event_type").notNull(),
  severity: severityEnum("severity").default("medium").notNull(),
  threat: varchar("threat", { length: 500 }),
  target: varchar("target", { length: 500 }),
  attacker: varchar("attacker", { length: 500 }),
  asset: varchar("asset", { length: 500 }),
  app: varchar("app", { length: 255 }),
  description: text("description"),
  threatVector: varchar("threat_vector", { length: 200 }),
  mitreTactic: varchar("mitre_tactic", { length: 200 }),
  mitreTechnique: varchar("mitre_technique", { length: 200 }),
  action: varchar("action", { length: 100 }),
  sourceType: varchar("source_type", { length: 100 }),
  logSource: varchar("log_source", { length: 200 }),
  sender: varchar("sender", { length: 500 }),
  recipient: varchar("recipient", { length: 500 }),
  protocol: varchar("protocol", { length: 50 }),
  country: varchar("country", { length: 100 }),
  riskScore: integer("risk_score"),
  rawPayload: jsonb("raw_payload"),
  pipelineStatus: pipelineStatusEnum("pipeline_status").default("received"),
  batchId: integer("batch_id"),
  normalizedAt: timestamp("normalized_at"),
  enrichedAt: timestamp("enriched_at"),
  correlatedAt: timestamp("correlated_at"),
  storedAt: timestamp("stored_at"),
  sigmaMatches: jsonb("sigma_matches"),
  enrichedDescription: text("enriched_description"),
  eventHash: varchar("event_hash", { length: 64 }),
  parseConfidence: integer("parse_confidence"),
  needsReview: boolean("needs_review").default(false),
  aiReasoning: text("ai_reasoning"),
  rawLog: text("raw_log"),
  deviceFingerprintId: integer("device_fingerprint_id"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  reportType: reportTypeEnum("report_type").default("executive_summary").notNull(),
  period: varchar("period", { length: 50 }).notNull(),
  executiveSummary: text("executive_summary"),
  findings: jsonb("findings"),
  recommendations: jsonb("recommendations"),
  metrics: jsonb("metrics"),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  filePath: text("file_path"),
  fileName: varchar("file_name", { length: 255 }),
  generatedBy: varchar("generated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamTypeEnum = pgEnum("team_type", ["implementation", "mss"]);

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 100 }),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  msaStartDate: timestamp("msa_start_date"),
  msaEndDate: timestamp("msa_end_date"),
  msaDocument: text("msa_document"),
  contractValue: varchar("contract_value", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const slaDefinitions = pgTable("sla_definitions", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => services.id),
  name: varchar("name", { length: 255 }).notNull(),
  priority: ticketPriorityEnum("priority").default("medium").notNull(),
  responseTimeMinutes: integer("response_time_minutes").notNull(),
  resolutionTimeMinutes: integer("resolution_time_minutes").notNull(),
  uptimePercentage: varchar("uptime_percentage", { length: 10 }),
  penaltyClause: text("penalty_clause"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  teamType: teamTypeEnum("team_type").notNull(),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  isAI: boolean("is_ai").default(false),
  aiSpecialization: varchar("ai_specialization", { length: 50 }),
  aiPersonality: text("ai_personality"),
  aiModel: varchar("ai_model", { length: 50 }),
  aiAvatar: varchar("ai_avatar", { length: 50 }),
  aiStats: jsonb("ai_stats"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shiftRosters = pgTable("shift_rosters", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  teamMemberId: integer("team_member_id").notNull().references(() => teamMembers.id),
  shiftDate: timestamp("shift_date").notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  shiftType: varchar("shift_type", { length: 50 }).default("day").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiAgentActivityLog = pgTable("ai_agent_activity_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  agentId: integer("agent_id").notNull().references(() => teamMembers.id),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  targetId: integer("target_id"),
  targetType: varchar("target_type", { length: 50 }),
  summary: text("summary"),
  details: jsonb("details"),
  confidence: integer("confidence"),
  humanReviewed: boolean("human_reviewed").default(false),
  humanOverride: boolean("human_override").default(false),
  feedback: text("feedback"),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiAgentActivityLogRelations = relations(aiAgentActivityLog, ({ one }) => ({
  tenant: one(tenants, { fields: [aiAgentActivityLog.tenantId], references: [tenants.id] }),
  agent: one(teamMembers, { fields: [aiAgentActivityLog.agentId], references: [teamMembers.id] }),
}));

export const documentCategoryEnum = pgEnum("document_category", [
  "knowledge_transfer", "implementation", "sop", "runbook", "policy", "architecture", "training", "other"
]);

export const documentStatusEnum = pgEnum("document_status", ["draft", "published", "archived"]);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  category: documentCategoryEnum("category").default("other").notNull(),
  status: documentStatusEnum("status").default("draft").notNull(),
  tags: text("tags"),
  customerVisible: boolean("customer_visible").default(false).notNull(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  sourceProduct: varchar("source_product", { length: 200 }),
  docType: varchar("doc_type", { length: 100 }),
  generatedVersion: integer("generated_version").default(1),
  isAutoGenerated: boolean("is_auto_generated").default(false),
  officialUrls: text("official_urls"),
  staleDays: integer("stale_days").default(90),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [securityEvents.tenantId], references: [tenants.id] }),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  parent: one(tenants, { fields: [tenants.parentId], references: [tenants.id], relationName: "tenant_hierarchy" }),
  children: many(tenants, { relationName: "tenant_hierarchy" }),
  users: many(tenantUsers),
  incidents: many(incidents),
  tickets: many(tickets),
  projects: many(projects),
  reports: many(reports),
  securityEvents: many(securityEvents),
  services: many(services),
  teamMembers: many(teamMembers),
  shiftRosters: many(shiftRosters),
  documents: many(documents),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantUsers.tenantId], references: [tenants.id] }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  tenant: one(tenants, { fields: [incidents.tenantId], references: [tenants.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tickets.tenantId], references: [tenants.id] }),
  comments: many(ticketComments),
  service: one(services, { fields: [tickets.serviceId], references: [services.id] }),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [projects.tenantId], references: [tenants.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  tenant: one(tenants, { fields: [reports.tenantId], references: [tenants.id] }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, { fields: [services.tenantId], references: [tenants.id] }),
  slaDefinitions: many(slaDefinitions),
  tickets: many(tickets),
}));

export const slaDefinitionsRelations = relations(slaDefinitions, ({ one }) => ({
  service: one(services, { fields: [slaDefinitions.serviceId], references: [services.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [teamMembers.tenantId], references: [tenants.id] }),
  shifts: many(shiftRosters),
}));

export const shiftRostersRelations = relations(shiftRosters, ({ one }) => ({
  tenant: one(tenants, { fields: [shiftRosters.tenantId], references: [tenants.id] }),
  teamMember: one(teamMembers, { fields: [shiftRosters.teamMemberId], references: [teamMembers.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
}));

export const licenseStatusEnum = pgEnum("license_status", ["active", "expired", "suspended", "trial"]);

export const superadmins = pgTable("superadmins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const licenses = pgTable("licenses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  licenseType: varchar("license_type", { length: 100 }).notNull(),
  maxUsers: integer("max_users").default(10).notNull(),
  maxEndpoints: integer("max_endpoints"),
  status: licenseStatusEnum("status").default("active").notNull(),
  startDate: timestamp("start_date").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const licensesRelations = relations(licenses, ({ one }) => ({
  tenant: one(tenants, { fields: [licenses.tenantId], references: [tenants.id] }),
}));

export const ticketFeedback = pgTable("ticket_feedback", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: varchar("user_id").notNull(),
  rating: integer("rating").notNull(),
  sentiment: varchar("sentiment", { length: 50 }),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketFeedbackRelations = relations(ticketFeedback, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketFeedback.ticketId], references: [tickets.id] }),
}));

export const ticketAttachments = pgTable("ticket_attachments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketAttachments.ticketId], references: [tickets.id] }),
}));

export const integrationCategoryEnum = pgEnum("integration_category", [
  "edr_xdr", "sse_casb", "dlp", "email_security", "waf",
  "tip_easm", "vulnerability_management", "directory_services",
  "network_security", "endpoint_security", "siem", "soar",
  "patch_mgmt", "hardware_infra", "other"
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected", "disconnected", "error", "configuring", "disabled"
]);

export const securityIntegrations = pgTable("security_integrations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  platformKey: varchar("platform_key", { length: 100 }).notNull(),
  platformName: varchar("platform_name", { length: 200 }).notNull(),
  category: integrationCategoryEnum("category").notNull(),
  status: integrationStatusEnum("status").default("disconnected").notNull(),
  apiBaseUrl: text("api_base_url"),
  authType: varchar("auth_type", { length: 50 }),
  pollingEnabled: boolean("polling_enabled").default(false).notNull(),
  pollingIntervalMinutes: integer("polling_interval_minutes").default(15),
  lastPollAt: timestamp("last_poll_at"),
  lastPollStatus: varchar("last_poll_status", { length: 50 }),
  lastPollMessage: text("last_poll_message"),
  eventsImported: integer("events_imported").default(0).notNull(),
  configJson: jsonb("config_json"),
  description: text("description"),
  logoUrl: text("logo_url"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  lastAssetSyncAt: timestamp("last_asset_sync_at"),
  assetSyncStatus: varchar("asset_sync_status", { length: 30 }),
  assetSyncMessage: text("asset_sync_message"),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  autoHealEnabled: boolean("auto_heal_enabled").default(true).notNull(),
  lastHealAttemptAt: timestamp("last_heal_attempt_at"),
  lastHealStatus: varchar("last_heal_status", { length: 50 }),
  lastHealMessage: text("last_heal_message"),
}, (t) => ({
  tenantPlatformUniq: unique("security_integrations_tenant_platform_key").on(t.tenantId, t.platformKey),
}));

export const securityIntegrationsRelations = relations(securityIntegrations, ({ one }) => ({
  tenant: one(tenants, { fields: [securityIntegrations.tenantId], references: [tenants.id] }),
}));

export const integrationAuditActionEnum = pgEnum("integration_audit_action", [
  "created", "updated", "deleted", "restored", "test_connection", "pull_data"
]);

export const integrationAuditLog = pgTable("integration_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  integrationId: integer("integration_id"),
  platformName: varchar("platform_name", { length: 200 }).notNull(),
  platformKey: varchar("platform_key", { length: 100 }).notNull(),
  action: integrationAuditActionEnum("action").notNull(),
  userId: varchar("user_id", { length: 100 }),
  username: varchar("username", { length: 200 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIntegrationAuditLogSchema = createInsertSchema(integrationAuditLog).omit({ id: true, createdAt: true });
export type InsertIntegrationAuditLog = z.infer<typeof insertIntegrationAuditLogSchema>;
export type IntegrationAuditLog = typeof integrationAuditLog.$inferSelect;

export const healFailureTypeEnum = pgEnum("heal_failure_type", [
  "auth_failure", "endpoint_changed", "rate_limited", "schema_changed",
  "connectivity", "api_version", "ssl_error", "unknown"
]);

export const integrationHealLogs = pgTable("integration_heal_logs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => securityIntegrations.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  platformKey: varchar("platform_key", { length: 100 }).notNull(),
  platformName: varchar("platform_name", { length: 200 }).notNull(),
  failureType: healFailureTypeEnum("failure_type").notNull(),
  errorMessage: text("error_message"),
  healStrategy: varchar("heal_strategy", { length: 200 }),
  configPatch: jsonb("config_patch"),
  succeeded: boolean("succeeded").notNull(),
  resultMessage: text("result_message"),
  aiDiagnosis: text("ai_diagnosis"),
  consecutiveFailuresAtAttempt: integer("consecutive_failures_at_attempt").default(0),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
});

export type IntegrationHealLog = typeof integrationHealLogs.$inferSelect;
export type InsertIntegrationHealLog = typeof integrationHealLogs.$inferInsert;

export const insertSecurityIntegrationSchema = createInsertSchema(securityIntegrations).omit({ id: true, createdAt: true, updatedAt: true, lastPollAt: true, lastPollStatus: true, lastPollMessage: true, eventsImported: true });

export const assetStatusEnum = pgEnum("asset_status", ["active", "inactive", "decommissioned", "quarantined"]);

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 100 }),
  ipv6Address: varchar("ipv6_address", { length: 200 }),
  macAddress: varchar("mac_address", { length: 50 }),
  endpointType: varchar("endpoint_type", { length: 50 }),
  operatingSystem: varchar("operating_system", { length: 200 }),
  agentVersion: varchar("agent_version", { length: 100 }),
  contentVersion: varchar("content_version", { length: 100 }),
  user: varchar("user_name", { length: 255 }),
  endpointAlias: varchar("endpoint_alias", { length: 255 }),
  endpointGroup: varchar("endpoint_group", { length: 255 }),
  preventionPolicy: varchar("prevention_policy", { length: 255 }),
  extensionsPolicy: varchar("extensions_policy", { length: 255 }),
  deploymentType: varchar("deployment_type", { length: 50 }),
  cloudProvider: varchar("cloud_provider", { length: 100 }),
  cloudRegion: varchar("cloud_region", { length: 100 }),
  cloudInstanceId: varchar("cloud_instance_id", { length: 200 }),
  tags: text("tags"),
  lastSeen: timestamp("last_seen"),
  lastUpgradeStatus: varchar("last_upgrade_status", { length: 100 }),
  lastUpgradeTime: timestamp("last_upgrade_time"),
  status: assetStatusEnum("status").default("active").notNull(),
  riskLevel: varchar("risk_level", { length: 20 }),
  riskScore: integer("risk_score"),
  incidentCount: integer("incident_count").default(0),
  vulnerabilityCount: integer("vulnerability_count").default(0),
  enrichmentData: jsonb("enrichment_data"),
  source: varchar("source", { length: 100 }).default("import"),
  biosSerialNumber: varchar("bios_serial_number", { length: 255 }),
  processor: varchar("processor", { length: 500 }),
  totalPhysicalMemory: varchar("total_physical_memory", { length: 100 }),
  storageInfo: text("storage_info"),
  systemModel: varchar("system_model", { length: 500 }),
  systemManufacturer: varchar("system_manufacturer", { length: 255 }),
  deviceHealth: varchar("device_health", { length: 100 }),
  lastLoggedInUser: varchar("last_logged_in_user", { length: 255 }),
  softwareInventory: jsonb("software_inventory"),
  warrantyExpiry: timestamp("warranty_expiry"),
  warrantyStatus: varchar("warranty_status", { length: 30 }),
  warrantyContractId: varchar("warranty_contract_id", { length: 255 }),
  purchaseDate: timestamp("purchase_date"),
  licenseKey: varchar("license_key", { length: 500 }),
  licenseExpiry: timestamp("license_expiry"),
  licenseStatus: varchar("license_status_asset", { length: 30 }),
  assetLocation: varchar("asset_location", { length: 255 }),
  assetSite: varchar("asset_site", { length: 255 }),
  assetBuilding: varchar("asset_building", { length: 100 }),
  assetGroup: varchar("asset_group", { length: 255 }),
  memoryType: varchar("memory_type", { length: 50 }),
  processorCores: integer("processor_cores"),
  processorSpeed: varchar("processor_speed", { length: 50 }),
  primaryUserEmail: varchar("primary_user_email", { length: 255 }),
  primaryUserId: varchar("primary_user_id", { length: 100 }),
  linkedUserIds: jsonb("linked_user_ids").$type<string[]>().default([]),
  controlsCoverage: jsonb("controls_coverage").$type<{toolId: number; toolName: string; controlType: string; status: string}[]>().default([]),
  warrantyLookupData: jsonb("warranty_lookup_data"),
  eolFindings: jsonb("eol_findings").$type<Array<{name: string; version: string; vendor: string; eolDate: string | null; eosDate: string | null; eolStatus: string; eosStatus: string; successor?: string}>>().default([]),
  sourcePlatforms: jsonb("source_platforms").$type<string[]>().default([]),
  cisScore: integer("cis_score"),
  cisBenchmark: varchar("cis_benchmark", { length: 100 }),
  criticality: varchar("criticality", { length: 20 }),
  edrHostId: varchar("edr_host_id", { length: 255 }),
  edrPlatform: varchar("edr_platform", { length: 100 }),
  edrScheduleEnabled: boolean("edr_schedule_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantHostnameUniq: unique("uq_assets_tenant_hostname").on(table.tenantId, table.hostname),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  tenant: one(tenants, { fields: [assets.tenantId], references: [tenants.id] }),
}));

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true, updatedAt: true });

export const userAssets = pgTable("user_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userName: varchar("user_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  department: varchar("department", { length: 255 }),
  title: varchar("title", { length: 255 }),
  totalRequests: integer("total_requests").default(0),
  allowedRequests: integer("allowed_requests").default(0),
  deniedRequests: integer("denied_requests").default(0),
  isolatedRequests: integer("isolated_requests").default(0),
  sitesVisited: integer("sites_visited").default(0),
  totalBytesMB: integer("total_bytes_mb").default(0),
  downloadedBytesMB: integer("downloaded_bytes_mb").default(0),
  uploadedBytesMB: integer("uploaded_bytes_mb").default(0),
  riskLevel: varchar("risk_level", { length: 20 }),
  riskScore: integer("risk_score").default(0),
  reputation: varchar("reputation", { length: 100 }),
  topSites: jsonb("top_sites"),
  urlCategories: varchar("url_categories", { length: 1000 }),
  applicationNames: varchar("application_names", { length: 1000 }),
  linkedAssetIds: jsonb("linked_asset_ids"),
  activityData: jsonb("activity_data"),
  accountType: varchar("account_type", { length: 30 }).default("Unknown"),
  source: varchar("source", { length: 100 }).default("import"),
  status: varchar("user_status", { length: 20 }).default("active"),
  lastActivity: timestamp("last_activity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userAssetsRelations = relations(userAssets, ({ one }) => ({
  tenant: one(tenants, { fields: [userAssets.tenantId], references: [tenants.id] }),
}));

export const insertUserAssetSchema = createInsertSchema(userAssets).omit({ id: true, createdAt: true, updatedAt: true });

export const SECURITY_PLATFORMS = [
  { key: "crowdstrike", name: "CrowdStrike Falcon", category: "edr_xdr", authType: "oauth2", description: "Endpoint detection and response platform with threat intelligence" },
  { key: "palo_alto_cortex", name: "Palo Alto Cortex XDR", category: "edr_xdr", authType: "api_key", description: "Extended detection and response across endpoints, network, and cloud" },
  { key: "checkpoint_hec", name: "Check Point Harmony Email", category: "email_security", authType: "api_key", description: "Email and collaboration security platform" },
  { key: "cynet", name: "Cynet 360", category: "edr_xdr", authType: "oauth2", description: "Autonomous XDR platform — alerts, full host details, users, network & domain intelligence" },
  { key: "deceptive_bytes", name: "Deceptive Bytes", category: "endpoint_security", authType: "api_key", description: "Active endpoint deception platform" },
  { key: "netskope", name: "Netskope SSE", category: "sse_casb", authType: "api_key", description: "Security Service Edge with CASB, SWG, and ZTNA" },
  { key: "zscaler", name: "Zscaler SSE", category: "sse_casb", authType: "api_key", description: "Cloud-native Security Service Edge platform" },
  { key: "skyhigh", name: "SkyHigh Security SSE", category: "sse_casb", authType: "api_key", description: "Secure Service Edge for cloud and web security" },
  { key: "forcepoint_dlp", name: "Forcepoint DLP", category: "dlp", authType: "api_key", description: "Data loss prevention and insider threat protection" },
  { key: "forcepoint_swg", name: "Forcepoint SWG", category: "network_security", authType: "api_key", description: "Secure web gateway for web traffic protection" },
  { key: "trellix_dlp", name: "Trellix DLP", category: "dlp", authType: "api_key", description: "Data loss prevention across endpoints and network" },
  { key: "trellix_ndr", name: "Trellix NDR", category: "network_security", authType: "api_key", description: "Network detection and response platform" },
  { key: "fortidlp", name: "FortiDLP", category: "dlp", authType: "api_key", description: "AI-driven data loss prevention solution" },
  { key: "gtb_dlp", name: "GTB DLP", category: "dlp", authType: "api_key", description: "Enterprise data loss prevention solution" },
  { key: "proofpoint_email", name: "Proofpoint Email Security", category: "email_security", authType: "api_key", description: "Advanced email threat protection and DLP" },
  { key: "proofpoint_dlp", name: "Proofpoint DLP", category: "dlp", authType: "api_key", description: "Cloud-based data loss prevention" },
  { key: "imperva_waf", name: "Imperva WAF", category: "waf", authType: "api_key", description: "Web application firewall and DDoS protection" },
  { key: "radware_waf", name: "Radware WAF", category: "waf", authType: "api_key", description: "Web application firewall and bot management" },
  { key: "f5_waf", name: "F5 WAF", category: "waf", authType: "api_key", description: "Advanced web application firewall" },
  { key: "sophos_endpoint", name: "Sophos Endpoint", category: "endpoint_security", authType: "api_key", description: "Next-gen endpoint protection with EDR" },
  { key: "trendmicro_endpoint", name: "Trend Micro Endpoint", category: "endpoint_security", authType: "api_key", description: "Endpoint security with XDR capabilities" },
  { key: "cyble", name: "Cyble Vision", category: "tip_easm", authType: "api_key", description: "Threat intelligence and external attack surface management" },
  { key: "recorded_future", name: "Recorded Future", category: "tip_easm", authType: "api_key", description: "Intelligence-driven threat intelligence platform" },
  { key: "threatmon", name: "ThreatMon", category: "tip_easm", authType: "api_key", description: "Threat intelligence and attack surface monitoring" },
  { key: "group_ib", name: "Group-IB", category: "tip_easm", authType: "api_key", description: "Threat intelligence and digital risk protection" },
  { key: "rapid7", name: "Rapid7 InsightVM", category: "vulnerability_management", authType: "api_key", description: "Vulnerability management and assessment platform" },
  { key: "qualys", name: "Qualys VMDR", category: "vulnerability_management", authType: "api_key", description: "Vulnerability management, detection and response" },
  { key: "tenable", name: "Tenable.io", category: "vulnerability_management", authType: "api_key", description: "Exposure management and vulnerability scanning" },
  { key: "vicarius", name: "Vicarius vRx", category: "vulnerability_management", authType: "api_key", description: "Vulnerability remediation and prioritization" },
  { key: "sentinelone", name: "SentinelOne Singularity", category: "edr_xdr", authType: "api_key", description: "AI-powered EDR/XDR platform with autonomous threat detection and response" },
  { key: "ms_defender_endpoint", name: "Microsoft Defender for Endpoint", category: "edr_xdr", authType: "oauth2", description: "Enterprise endpoint security platform from Microsoft" },
  { key: "ivanti_patch", name: "Ivanti Patch Management", category: "patch_mgmt", authType: "api_key", description: "Patch management and software distribution platform" },
  { key: "manage_engine_patch", name: "ManageEngine Patch Manager Plus", category: "patch_mgmt", authType: "api_key", description: "Automated patch management for OS and third-party apps" },
  { key: "wsus", name: "Microsoft WSUS", category: "patch_mgmt", authType: "basic", description: "Windows Server Update Services for Windows patch management" },
  { key: "bigfix", name: "HCL BigFix", category: "patch_mgmt", authType: "api_key", description: "Unified endpoint management and patch compliance platform" },
  { key: "active_directory", name: "Microsoft Active Directory", category: "directory_services", authType: "ldap", description: "On-premises directory service for identity management" },
  { key: "azure_ad", name: "Microsoft Entra ID (Azure AD)", category: "directory_services", authType: "oauth2", description: "Cloud-based identity and access management" },
  { key: "jamf", name: "JAMF Pro", category: "directory_services", authType: "api_key", description: "Apple device management and security" },
  { key: "dell_ome", name: "Dell OpenManage Enterprise", category: "hardware_infra", authType: "basic", description: "Dell server hardware inventory, health monitoring, firmware management and iDRAC integration" },
  { key: "dell_idrac", name: "Dell iDRAC / Lifecycle Controller", category: "hardware_infra", authType: "basic", description: "Out-of-band server management, hardware telemetry, BIOS/firmware versions and warranty data" },
  { key: "hpe_ilo", name: "HP iLO (Integrated Lights-Out)", category: "hardware_infra", authType: "basic", description: "HPE server remote management, hardware health, firmware versions and service events" },
  { key: "hpe_oneview", name: "HPE OneView", category: "hardware_infra", authType: "api_key", description: "HPE composable infrastructure management — servers, storage, networking unified inventory" },
  { key: "lenovo_xclarity", name: "Lenovo XClarity Administrator", category: "hardware_infra", authType: "basic", description: "Lenovo server management, hardware inventory, firmware compliance and power telemetry" },
  { key: "intel_vpro", name: "Intel vPro / AMT", category: "hardware_infra", authType: "basic", description: "Intel Active Management Technology — out-of-band management, hardware asset discovery, CPU telemetry" },
  { key: "nvidia_ngc", name: "NVIDIA GPU Telemetry / NGC", category: "hardware_infra", authType: "api_key", description: "GPU inventory, driver versions, utilization telemetry and vulnerability advisories from NVIDIA" },
  { key: "ms_intune", name: "Microsoft Intune", category: "patch_mgmt", authType: "oauth2", description: "Device compliance, OS patch levels, app inventory, and hardware inventory via Microsoft Graph API" },
  { key: "ms_sccm", name: "Microsoft SCCM / Endpoint Manager", category: "patch_mgmt", authType: "basic", description: "On-prem endpoint management, hardware/software inventory, patch status and OS deployment" },
  { key: "vmware_vcenter", name: "VMware vCenter / vSphere", category: "hardware_infra", authType: "basic", description: "Virtual machine inventory, hypervisor health, ESXi host hardware, VM snapshots and network topology" },
  { key: "vmware_aria", name: "VMware Aria (vRealize)", category: "hardware_infra", authType: "api_key", description: "Multi-cloud infrastructure management — asset discovery, cost, performance and compliance" },
  { key: "aws_ssm", name: "AWS Systems Manager", category: "hardware_infra", authType: "api_key", description: "EC2 instance inventory, patch compliance, run command, session manager and parameter store via AWS API" },
  { key: "aws_config", name: "AWS Config / Security Hub", category: "hardware_infra", authType: "api_key", description: "AWS resource inventory, configuration compliance, security findings and GuardDuty integration" },
  { key: "azure_arc", name: "Microsoft Azure Arc", category: "hardware_infra", authType: "oauth2", description: "Hybrid/multicloud resource inventory — on-prem servers, Kubernetes clusters and Azure PaaS services" },
  { key: "azure_resource", name: "Azure Resource Manager", category: "hardware_infra", authType: "oauth2", description: "Azure resource inventory, VM metadata, network topology, RBAC and policy compliance" },
  { key: "gcp_asset", name: "GCP Cloud Asset Inventory", category: "hardware_infra", authType: "oauth2", description: "GCP resource inventory, IAM policies, asset history and Security Command Center integration" },
  { key: "gcp_scc", name: "GCP Security Command Center", category: "hardware_infra", authType: "oauth2", description: "GCP security findings, vulnerability detection, compliance monitoring and asset risk scoring" },
] as const;

export const INTEGRATION_CATEGORIES = [
  { key: "edr_xdr", name: "EDR / XDR", description: "Endpoint Detection & Response / Extended Detection & Response" },
  { key: "sse_casb", name: "SSE / CASB", description: "Security Service Edge / Cloud Access Security Broker" },
  { key: "dlp", name: "DLP", description: "Data Loss Prevention" },
  { key: "email_security", name: "Email Security", description: "Email Threat Protection & Filtering" },
  { key: "waf", name: "WAF", description: "Web Application Firewall" },
  { key: "tip_easm", name: "TIP & EASM", description: "Threat Intelligence Platform & External Attack Surface Management" },
  { key: "malware_sandbox", name: "Malware Sandboxes", description: "Interactive and AI-powered malware detonation, behavioral analysis, and hash reputation platforms" },
  { key: "vulnerability_management", name: "Vulnerability Management", description: "Vulnerability Assessment & Remediation" },
  { key: "directory_services", name: "Directory Services", description: "Identity & Access Management" },
  { key: "network_security", name: "Network Security", description: "Network Detection, Response & Gateway" },
  { key: "endpoint_security", name: "Endpoint Security", description: "Endpoint Protection & Management" },
  { key: "siem", name: "SIEM", description: "Security Information & Event Management" },
  { key: "soar", name: "SOAR", description: "Security Orchestration, Automation & Response" },
  { key: "hardware_infra", name: "Hardware & Infrastructure", description: "Server hardware, cloud platforms, hypervisors & OS vendors for asset discovery & enrichment" },
  { key: "other", name: "Other", description: "Other Security Solutions" },
] as const;

export interface PlatformAuthField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "select";
  required: boolean;
  helpText?: string;
  options?: { value: string; label: string }[];
}

export interface PlatformAuthConfig {
  urlPlaceholder?: string;
  urlLabel?: string;
  urlHelpText?: string;
  hideUrl?: boolean;
  fields: PlatformAuthField[];
}

export const PLATFORM_AUTH_FIELDS: Record<string, PlatformAuthConfig> = {
  crowdstrike: {
    urlPlaceholder: "https://api.crowdstrike.com",
    urlLabel: "API Base URL",
    urlHelpText: "Region-specific base URL (e.g., https://api.us-2.crowdstrike.com for US-2)",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "CrowdStrike OAuth2 Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "CrowdStrike OAuth2 Client Secret", type: "password", required: true },
    ],
  },
  palo_alto_cortex: {
    urlPlaceholder: "https://api-{fqdn}.xdr.us.paloaltonetworks.com",
    urlLabel: "API Base URL",
    urlHelpText: "Your Cortex XDR API FQDN (found in Settings > Configurations > API Keys)",
    fields: [
      { key: "apiKeyId", label: "API Key ID", placeholder: "Numeric API Key ID", type: "text", required: true },
      { key: "apiKey", label: "API Key", placeholder: "Cortex XDR API Key", type: "password", required: true },
    ],
  },
  checkpoint_hec: {
    hideUrl: true,
    fields: [
      { key: "region", label: "Region", placeholder: "Select your Infinity Portal region", type: "select", required: true, options: [
        { value: "eu", label: "EU (Europe)" },
        { value: "us", label: "US (United States)" },
        { value: "au", label: "AU (Australia / Asia Pacific)" },
        { value: "ca", label: "CA (Canada)" },
        { value: "uk", label: "UK (United Kingdom)" },
        { value: "me", label: "ME (Middle East)" },
        { value: "in", label: "IN (India)" },
      ]},
      { key: "clientId", label: "Client ID", placeholder: "Check Point API Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Secret Key", placeholder: "Check Point API Secret Key", type: "password", required: true },
    ],
  },
  cynet: {
    urlPlaceholder: "https://yourorg.api.cynet.com",
    urlLabel: "API Base URL",
    urlHelpText: "Enter the base domain or full login endpoint (e.g., https://yourorg.api.cynet.com/api/v2/login)",
    fields: [
      { key: "access_key", label: "Access Key", placeholder: "Cynet API access key", type: "text", required: true },
      { key: "secret_key", label: "Secret Key", placeholder: "Cynet API secret key", type: "password", required: true },
      { key: "clientId", label: "Client ID", placeholder: "MSSP Client ID", type: "text", required: false, helpText: "Optional — for MSSP multi-tenant configurations" },
    ],
  },
  deceptive_bytes: {
    urlPlaceholder: "https://api.deceptivebytes.com",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Deceptive Bytes API key", type: "password", required: true },
    ],
  },
  netskope: {
    urlPlaceholder: "https://yourtenant.goskope.com",
    urlLabel: "Tenant URL",
    urlHelpText: "Your Netskope tenant URL (found in Settings > Administration > REST API v2)",
    fields: [
      { key: "apiToken", label: "API Token (v2)", placeholder: "Netskope REST API v2 token", type: "password", required: true },
    ],
  },
  zscaler: {
    urlPlaceholder: "https://zsapi.zscaler.net",
    urlLabel: "Cloud Base URL",
    urlHelpText: "Zscaler cloud base URL (e.g., zsapi.zscaler.net, zsapi.zscalerone.net)",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Zscaler API key", type: "password", required: true },
      { key: "username", label: "Admin Username", placeholder: "admin@yourdomain.com", type: "text", required: true },
      { key: "password", label: "Admin Password", placeholder: "Zscaler admin password", type: "password", required: true },
    ],
  },
  skyhigh: {
    urlPlaceholder: "https://api.myshn.net",
    urlLabel: "API Base URL",
    urlHelpText: "SkyHigh Security API endpoint",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "SkyHigh Security API key", type: "password", required: true },
    ],
  },
  forcepoint_dlp: {
    urlPlaceholder: "https://your-forcepoint-server:port",
    urlLabel: "API Base URL",
    urlHelpText: "Forcepoint DLP Manager server address with port",
    fields: [
      { key: "username", label: "Username", placeholder: "Forcepoint admin username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "Forcepoint admin password", type: "password", required: true },
    ],
  },
  forcepoint_swg: {
    urlPlaceholder: "https://admin.forcepoint.net",
    urlLabel: "API Base URL",
    urlHelpText: "Forcepoint SWG cloud or on-premises admin URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Forcepoint SWG API key", type: "password", required: true },
    ],
  },
  trellix_dlp: {
    urlPlaceholder: "https://api.manage.trellix.com",
    urlLabel: "API Base URL",
    urlHelpText: "Trellix ePO cloud management URL",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Trellix API Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "Trellix API Client Secret", type: "password", required: true },
      { key: "apiKey", label: "API Key", placeholder: "Trellix API key", type: "password", required: true },
    ],
  },
  trellix_ndr: {
    urlPlaceholder: "https://api.manage.trellix.com",
    urlLabel: "API Base URL",
    urlHelpText: "Trellix ePO cloud management URL",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Trellix API Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "Trellix API Client Secret", type: "password", required: true },
      { key: "apiKey", label: "API Key", placeholder: "Trellix API key", type: "password", required: true },
    ],
  },
  fortidlp: {
    urlPlaceholder: "https://your-fortidlp-instance.com",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "FortiDLP API key", type: "password", required: true },
    ],
  },
  gtb_dlp: {
    urlPlaceholder: "https://your-gtb-server.com",
    urlLabel: "API Base URL",
    urlHelpText: "GTB Central Console server address",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "GTB DLP API key", type: "password", required: true },
    ],
  },
  proofpoint_email: {
    urlPlaceholder: "https://tap-api-v2.proofpoint.com",
    urlLabel: "API Base URL",
    urlHelpText: "Proofpoint TAP API endpoint (region-specific)",
    fields: [
      { key: "servicePrincipal", label: "Service Principal", placeholder: "Proofpoint service principal (username)", type: "text", required: true },
      { key: "secretKey", label: "Secret Key", placeholder: "Proofpoint API secret key", type: "password", required: true },
    ],
  },
  proofpoint_dlp: {
    urlPlaceholder: "https://api.proofpoint.com",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Proofpoint DLP API key", type: "password", required: true },
    ],
  },
  imperva_waf: {
    urlPlaceholder: "https://api.imperva.com",
    urlLabel: "API Base URL",
    urlHelpText: "Imperva Cloud WAF API endpoint",
    fields: [
      { key: "apiId", label: "API ID", placeholder: "Imperva API identifier", type: "text", required: true },
      { key: "apiKey", label: "API Key", placeholder: "Imperva API key", type: "password", required: true },
      { key: "accountId", label: "Account ID", placeholder: "Imperva account ID", type: "text", required: true },
    ],
  },
  radware_waf: {
    urlPlaceholder: "https://portals.radware.com/api",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Radware Cloud WAF API key", type: "password", required: true },
    ],
  },
  f5_waf: {
    urlPlaceholder: "https://your-f5-instance.com",
    urlLabel: "API Base URL",
    urlHelpText: "F5 BIG-IP management IP or FQDN",
    fields: [
      { key: "username", label: "Username", placeholder: "F5 admin username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "F5 admin password", type: "password", required: true },
    ],
  },
  sophos_endpoint: {
    urlPlaceholder: "https://api.central.sophos.com",
    urlLabel: "API Base URL",
    urlHelpText: "Sophos Central API base URL (auto-discovered after auth)",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Sophos Central API Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "Sophos Central API Client Secret", type: "password", required: true },
      { key: "tenantId", label: "Tenant ID", placeholder: "Sophos tenant UUID", type: "text", required: false, helpText: "Optional — auto-discovered if not provided" },
    ],
  },
  trendmicro_endpoint: {
    urlPlaceholder: "https://api.xdr.trendmicro.com",
    urlLabel: "API Base URL",
    urlHelpText: "Region-specific URL (e.g., api.xdr.trendmicro.co.jp for Japan)",
    fields: [
      { key: "apiToken", label: "API Token", placeholder: "Trend Micro Vision One API token", type: "password", required: true },
    ],
  },
  cyble: {
    urlPlaceholder: "https://api.cyble.ai",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiToken", label: "API Token", placeholder: "Cyble Vision API token", type: "password", required: true },
    ],
  },
  recorded_future: {
    hideUrl: true,
    fields: [
      { key: "apiToken", label: "API Token", placeholder: "Recorded Future API token", type: "password", required: true, helpText: "Token from Recorded Future portal (Settings > API Access)" },
    ],
  },
  threatmon: {
    urlPlaceholder: "https://api.threatmon.io",
    urlLabel: "API Base URL",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "ThreatMon API key", type: "password", required: true },
    ],
  },
  group_ib: {
    urlPlaceholder: "https://tap.group-ib.com/api/v2",
    urlLabel: "API Base URL",
    urlHelpText: "Group-IB Threat Intelligence API endpoint",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Group-IB API key", type: "password", required: true },
    ],
  },
  rapid7: {
    urlPlaceholder: "https://us.api.insight.rapid7.com",
    urlLabel: "API Base URL",
    urlHelpText: "Region-specific URL (us, eu, ca, au, ap)",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Rapid7 Insight platform API key", type: "password", required: true },
    ],
  },
  qualys: {
    urlPlaceholder: "https://qualysapi.qualys.com",
    urlLabel: "API Base URL",
    urlHelpText: "Qualys platform URL based on your subscription (e.g., qualysapi.qg2.apps.qualys.com)",
    fields: [
      { key: "username", label: "Username", placeholder: "Qualys API username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "Qualys API password", type: "password", required: true },
    ],
  },
  tenable: {
    hideUrl: true,
    fields: [
      { key: "accessKey", label: "Access Key", placeholder: "Tenable.io access key", type: "text", required: true },
      { key: "secretKey", label: "Secret Key", placeholder: "Tenable.io secret key", type: "password", required: true },
    ],
  },
  vicarius: {
    urlPlaceholder: "https://yourtenant.vicarius.cloud/vicarius-external-data-api",
    urlLabel: "External Data API URL",
    urlHelpText: "Your Vicarius vRx External Data API URL (Settings → External Data API)",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "Vicarius vRx External Data API token", type: "password", required: true, helpText: "Generate at: vRx Dashboard → Settings → External Data API → Generate Token" },
    ],
  },
  active_directory: {
    urlPlaceholder: "ldap://your-dc.domain.com:389",
    urlLabel: "LDAP Server URL",
    urlHelpText: "Domain Controller address (ldap:// or ldaps:// with port)",
    fields: [
      { key: "bindDn", label: "Bind DN", placeholder: "CN=ServiceAccount,OU=Users,DC=domain,DC=com", type: "text", required: true, helpText: "Distinguished name of the service account for LDAP binding" },
      { key: "bindPassword", label: "Bind Password", placeholder: "LDAP bind password", type: "password", required: true },
      { key: "baseDn", label: "Base DN", placeholder: "DC=domain,DC=com", type: "text", required: true, helpText: "Base DN for directory searches" },
      { key: "domain", label: "Domain", placeholder: "domain.com", type: "text", required: true },
    ],
  },
  azure_ad: {
    urlPlaceholder: "https://graph.microsoft.com/v1.0",
    urlLabel: "Graph API Base URL",
    urlHelpText: "Microsoft Graph API endpoint (default: https://graph.microsoft.com/v1.0)",
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "Azure AD Tenant ID (GUID)", type: "text", required: true, helpText: "Found in Azure Portal > Azure Active Directory > Overview" },
      { key: "clientId", label: "Application (Client) ID", placeholder: "App registration Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "App registration Client Secret value", type: "password", required: true },
    ],
  },
  jamf: {
    urlPlaceholder: "https://yourinstance.jamfcloud.com",
    urlLabel: "JAMF Pro Server URL",
    urlHelpText: "Your JAMF Pro instance URL (cloud or on-premises)",
    fields: [
      { key: "username", label: "Username", placeholder: "JAMF Pro API username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "JAMF Pro API password", type: "password", required: true },
    ],
  },
  dell_ome: {
    urlPlaceholder: "https://ome.yourdomain.com",
    urlLabel: "OpenManage Enterprise URL",
    urlHelpText: "Dell OME server URL (on-premises). Port 443 by default.",
    fields: [
      { key: "username", label: "Username", placeholder: "OME admin username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "OME admin password", type: "password", required: true },
    ],
  },
  dell_idrac: {
    urlPlaceholder: "https://idrac.yourdomain.com",
    urlLabel: "iDRAC Host or OME Gateway URL",
    urlHelpText: "Single iDRAC host or OpenManage Essentials gateway for bulk discovery",
    fields: [
      { key: "username", label: "Username", placeholder: "iDRAC root or admin user", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "iDRAC password", type: "password", required: true },
    ],
  },
  hpe_ilo: {
    urlPlaceholder: "https://ilo.yourdomain.com",
    urlLabel: "iLO Host / OneView Gateway URL",
    urlHelpText: "HP iLO management URL or HPE Insight Remote Support gateway",
    fields: [
      { key: "username", label: "Username", placeholder: "iLO administrator username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "iLO administrator password", type: "password", required: true },
    ],
  },
  hpe_oneview: {
    urlPlaceholder: "https://oneview.yourdomain.com",
    urlLabel: "HPE OneView Appliance URL",
    urlHelpText: "HPE OneView virtual appliance URL",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "HPE OneView session token or API key", type: "password", required: true },
    ],
  },
  lenovo_xclarity: {
    urlPlaceholder: "https://xclarity.yourdomain.com",
    urlLabel: "XClarity Administrator URL",
    urlHelpText: "Lenovo XClarity Administrator virtual appliance URL",
    fields: [
      { key: "username", label: "Username", placeholder: "XClarity admin username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "XClarity admin password", type: "password", required: true },
    ],
  },
  intel_vpro: {
    urlPlaceholder: "https://amt-gateway.yourdomain.com",
    urlLabel: "Intel AMT / MeshCentral Gateway URL",
    urlHelpText: "MeshCentral or Intel EMA server acting as AMT gateway for bulk discovery",
    fields: [
      { key: "username", label: "Username", placeholder: "AMT admin username", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "AMT admin password", type: "password", required: true },
    ],
  },
  nvidia_ngc: {
    urlPlaceholder: "https://api.ngc.nvidia.com",
    urlLabel: "NVIDIA NGC / DCGM Exporter URL",
    urlHelpText: "NVIDIA NGC API base URL or DCGM Exporter endpoint for GPU telemetry",
    fields: [
      { key: "apiKey", label: "NGC API Key", placeholder: "NVIDIA NGC API key (nvapi-...)", type: "password", required: true },
    ],
  },
  ms_intune: {
    urlPlaceholder: "https://graph.microsoft.com",
    urlLabel: "Microsoft Graph API URL",
    urlHelpText: "Microsoft Graph API endpoint — always https://graph.microsoft.com",
    hideUrl: true,
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "Azure AD Tenant ID (GUID)", type: "text", required: true },
      { key: "clientId", label: "Application (Client) ID", placeholder: "Entra ID App Registration Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "App registration client secret", type: "password", required: true },
    ],
  },
  ms_sccm: {
    urlPlaceholder: "https://sccm.yourdomain.com",
    urlLabel: "SCCM / ConfigMgr Admin Service URL",
    urlHelpText: "SCCM Admin Service REST endpoint: https://server/AdminService/wmi/",
    fields: [
      { key: "username", label: "Username (domain\\user)", placeholder: "DOMAIN\\svc_account", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "Service account password", type: "password", required: true },
    ],
  },
  vmware_vcenter: {
    urlPlaceholder: "https://vcenter.yourdomain.com",
    urlLabel: "vCenter Server URL",
    urlHelpText: "VMware vCenter Server appliance URL (port 443). Also works with vSphere directly.",
    fields: [
      { key: "username", label: "Username", placeholder: "administrator@vsphere.local", type: "text", required: true },
      { key: "password", label: "Password", placeholder: "vCenter admin password", type: "password", required: true },
    ],
  },
  vmware_aria: {
    urlPlaceholder: "https://aria.yourdomain.com",
    urlLabel: "VMware Aria Operations URL",
    urlHelpText: "VMware Aria Operations (formerly vRealize) appliance URL",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "VMware Aria API token", type: "password", required: true },
    ],
  },
  aws_ssm: {
    urlPlaceholder: "https://ssm.us-east-1.amazonaws.com",
    urlLabel: "AWS SSM Endpoint (optional)",
    urlHelpText: "AWS regional endpoint — leave default for standard regions",
    hideUrl: true,
    fields: [
      { key: "accessKeyId", label: "AWS Access Key ID", placeholder: "AKIA...", type: "text", required: true },
      { key: "secretAccessKey", label: "AWS Secret Access Key", placeholder: "AWS secret key", type: "password", required: true },
      { key: "region", label: "AWS Region", placeholder: "us-east-1", type: "text", required: true, helpText: "e.g. us-east-1, eu-west-1, ap-south-1" },
    ],
  },
  aws_config: {
    urlPlaceholder: "https://config.us-east-1.amazonaws.com",
    urlLabel: "AWS Config Endpoint (optional)",
    hideUrl: true,
    fields: [
      { key: "accessKeyId", label: "AWS Access Key ID", placeholder: "AKIA...", type: "text", required: true },
      { key: "secretAccessKey", label: "AWS Secret Access Key", placeholder: "AWS secret key", type: "password", required: true },
      { key: "region", label: "AWS Region", placeholder: "us-east-1", type: "text", required: true },
    ],
  },
  azure_arc: {
    urlPlaceholder: "https://management.azure.com",
    urlLabel: "Azure Management URL",
    hideUrl: true,
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "Azure AD Tenant ID (GUID)", type: "text", required: true },
      { key: "clientId", label: "Application (Client) ID", placeholder: "Entra ID App Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "App registration client secret", type: "password", required: true },
      { key: "subscriptionId", label: "Subscription ID", placeholder: "Azure Subscription ID (GUID)", type: "text", required: false },
    ],
  },
  azure_resource: {
    urlPlaceholder: "https://management.azure.com",
    urlLabel: "Azure Management URL",
    hideUrl: true,
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "Azure AD Tenant ID (GUID)", type: "text", required: true },
      { key: "clientId", label: "Application (Client) ID", placeholder: "Entra ID App Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", placeholder: "App registration client secret", type: "password", required: true },
      { key: "subscriptionId", label: "Subscription ID", placeholder: "Azure Subscription ID (GUID)", type: "text", required: false },
    ],
  },
  gcp_asset: {
    urlPlaceholder: "https://cloudasset.googleapis.com",
    urlLabel: "GCP Cloud Asset API URL",
    hideUrl: true,
    fields: [
      { key: "projectId", label: "GCP Project ID", placeholder: "my-gcp-project-id", type: "text", required: true },
      { key: "serviceAccountKey", label: "Service Account JSON Key", placeholder: "Paste full JSON key file contents", type: "password", required: true, helpText: "Create a service account with Cloud Asset Viewer role and download its JSON key" },
    ],
  },
  gcp_scc: {
    urlPlaceholder: "https://securitycenter.googleapis.com",
    urlLabel: "GCP Security Command Center API URL",
    hideUrl: true,
    fields: [
      { key: "projectId", label: "GCP Project / Organization ID", placeholder: "my-gcp-project-id or org-id", type: "text", required: true },
      { key: "serviceAccountKey", label: "Service Account JSON Key", placeholder: "Paste full JSON key file contents", type: "password", required: true, helpText: "Service account needs Security Center Admin Viewer role" },
    ],
  },
};

export const insertSuperadminSchema = createInsertSchema(superadmins).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertLicenseSchema = createInsertSchema(licenses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketFeedbackSchema = createInsertSchema(ticketFeedback).omit({ id: true, createdAt: true });
export const insertTicketAttachmentSchema = createInsertSchema(ticketAttachments).omit({ id: true, createdAt: true });

export const insertProjectScopeSchema = createInsertSchema(projectScope).omit({ id: true, createdAt: true });
export const insertProjectActivitySchema = createInsertSchema(projectActivities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectRaciSchema = createInsertSchema(projectRaci).omit({ id: true, createdAt: true });
export const insertProjectRiskSchema = createInsertSchema(projectRisks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertTenantUserSchema = createInsertSchema(tenantUsers).omit({ id: true, createdAt: true });
export const insertIncidentSchema = createInsertSchema(incidents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({ id: true, createdAt: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSlaDefinitionSchema = createInsertSchema(slaDefinitions).omit({ id: true, createdAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true });
export const insertShiftRosterSchema = createInsertSchema(shiftRosters).omit({ id: true, createdAt: true });
export const insertAiAgentActivityLogSchema = createInsertSchema(aiAgentActivityLog).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type TenantUser = typeof tenantUsers.$inferSelect;
export type InsertTenantUser = z.infer<typeof insertTenantUserSchema>;
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type SlaDefinition = typeof slaDefinitions.$inferSelect;
export type InsertSlaDefinition = z.infer<typeof insertSlaDefinitionSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type ShiftRoster = typeof shiftRosters.$inferSelect;
export type InsertShiftRoster = z.infer<typeof insertShiftRosterSchema>;
export type AiAgentActivityLog = typeof aiAgentActivityLog.$inferSelect;
export type InsertAiAgentActivityLog = z.infer<typeof insertAiAgentActivityLogSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Superadmin = typeof superadmins.$inferSelect;
export type InsertSuperadmin = z.infer<typeof insertSuperadminSchema>;
export type License = typeof licenses.$inferSelect;
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type TicketFeedback = typeof ticketFeedback.$inferSelect;
export type InsertTicketFeedback = z.infer<typeof insertTicketFeedbackSchema>;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type InsertTicketAttachment = z.infer<typeof insertTicketAttachmentSchema>;
export type SecurityIntegration = typeof securityIntegrations.$inferSelect;
export type InsertSecurityIntegration = z.infer<typeof insertSecurityIntegrationSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type UserAsset = typeof userAssets.$inferSelect;
export type InsertUserAsset = z.infer<typeof insertUserAssetSchema>;

export type ProjectScope = typeof projectScope.$inferSelect;
export type InsertProjectScope = z.infer<typeof insertProjectScopeSchema>;
export type ProjectActivity = typeof projectActivities.$inferSelect;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectRaci = typeof projectRaci.$inferSelect;
export type InsertProjectRaci = z.infer<typeof insertProjectRaciSchema>;
export type ProjectRisk = typeof projectRisks.$inferSelect;
export type InsertProjectRisk = z.infer<typeof insertProjectRiskSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  reportType: reportTypeEnum("report_type").default("executive_summary").notNull(),
  period: varchar("period", { length: 50 }).notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull(),
  customPrompt: text("custom_prompt"),
  recipientEmails: text("recipient_emails").array(),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;

export const riskEntityTypeEnum = pgEnum("risk_entity_type", ["asset", "user", "ip", "domain"]);

export const riskScores = pgTable("risk_scores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: riskEntityTypeEnum("entity_type").notNull(),
  entityId: integer("entity_id"),
  entityIdentifier: varchar("entity_identifier", { length: 500 }),
  overallScore: real("overall_score").notNull().default(0),
  riskLevel: varchar("risk_level", { length: 20 }).notNull().default("low"),
  pillarScores: jsonb("pillar_scores"),
  contextualFactors: jsonb("contextual_factors"),
  riskBreakdown: jsonb("risk_breakdown"),
  compoundRiskAlerts: jsonb("compound_risk_alerts"),
  previousScore: real("previous_score"),
  scoreDelta: real("score_delta"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const riskScoresRelations = relations(riskScores, ({ one }) => ({
  tenant: one(tenants, { fields: [riskScores.tenantId], references: [tenants.id] }),
}));

export const insertRiskScoreSchema = createInsertSchema(riskScores).omit({ id: true, createdAt: true, updatedAt: true });
export type RiskScore = typeof riskScores.$inferSelect;
export type InsertRiskScore = z.infer<typeof insertRiskScoreSchema>;

export const complianceAssessments = pgTable("compliance_assessments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  frameworkId: varchar("framework_id", { length: 50 }).notNull(),
  overallScore: real("overall_score").notNull().default(0),
  functionScores: jsonb("function_scores"),
  controlStatuses: jsonb("control_statuses"),
  gapAnalysis: jsonb("gap_analysis"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complianceAssessmentsRelations = relations(complianceAssessments, ({ one }) => ({
  tenant: one(tenants, { fields: [complianceAssessments.tenantId], references: [tenants.id] }),
}));

export const insertComplianceAssessmentSchema = createInsertSchema(complianceAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export type ComplianceAssessment = typeof complianceAssessments.$inferSelect;
export type InsertComplianceAssessment = z.infer<typeof insertComplianceAssessmentSchema>;

export const devicePosturePolicies = pgTable("device_posture_policies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  rules: jsonb("rules").$type<Array<{ field: string; operator: string; value: string | string[] }>>().notNull().default([]),
  enforcement: varchar("enforcement", { length: 50 }).default("all_must_pass").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const devicePosturePoliciesRelations = relations(devicePosturePolicies, ({ one }) => ({
  tenant: one(tenants, { fields: [devicePosturePolicies.tenantId], references: [tenants.id] }),
}));

export const insertDevicePosturePolicySchema = createInsertSchema(devicePosturePolicies).omit({ id: true, createdAt: true, updatedAt: true });
export type DevicePosturePolicy = typeof devicePosturePolicies.$inferSelect;
export type InsertDevicePosturePolicy = z.infer<typeof insertDevicePosturePolicySchema>;

export const cloudAppRiskScores = pgTable("cloud_app_risk_scores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  appName: varchar("app_name", { length: 500 }).notNull(),
  source: varchar("source", { length: 30 }).default("platform"),
  confidenceIndex: real("confidence_index").notNull().default(0),
  riskClassification: varchar("risk_classification", { length: 20 }).notNull().default("moderate"),
  sanctionStatus: varchar("sanction_status", { length: 50 }),
  serviceCategory: varchar("service_category", { length: 100 }),
  isAIService: boolean("is_ai_service").default(false),
  isShadowIT: boolean("is_shadow_it").default(false),
  isEnterprise: boolean("is_enterprise").default(false),
  totalUsers: integer("total_users").default(0),
  totalActivities: integer("total_activities").default(0),
  totalUploads: integer("total_uploads").default(0),
  totalDownloads: integer("total_downloads").default(0),
  countries: jsonb("countries"),
  factorScores: jsonb("factor_scores"),
  factorDetails: jsonb("factor_details"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cloudAppRiskScoresRelations = relations(cloudAppRiskScores, ({ one, many }) => ({
  tenant: one(tenants, { fields: [cloudAppRiskScores.tenantId], references: [tenants.id] }),
  attributes: many(cloudAppRiskAttributes),
}));

export const insertCloudAppRiskScoreSchema = createInsertSchema(cloudAppRiskScores).omit({ id: true, createdAt: true, updatedAt: true });
export type CloudAppRiskScore = typeof cloudAppRiskScores.$inferSelect;
export type InsertCloudAppRiskScore = z.infer<typeof insertCloudAppRiskScoreSchema>;

export const cloudAppRiskAttributes = pgTable("cloud_app_risk_attributes", {
  id: serial("id").primaryKey(),
  appScoreId: integer("app_score_id").notNull().references(() => cloudAppRiskScores.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  category: varchar("category", { length: 100 }).notNull(),
  attribute: varchar("attribute", { length: 200 }).notNull(),
  value: varchar("value", { length: 500 }),
  score: real("score").default(0),
  weight: real("weight").default(0),
  weightedScore: real("weighted_score").default(0),
  riskLevel: varchar("risk_level", { length: 20 }),
  reviewDate: varchar("review_date", { length: 30 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cloudAppRiskAttributesRelations = relations(cloudAppRiskAttributes, ({ one }) => ({
  appScore: one(cloudAppRiskScores, { fields: [cloudAppRiskAttributes.appScoreId], references: [cloudAppRiskScores.id] }),
  tenant: one(tenants, { fields: [cloudAppRiskAttributes.tenantId], references: [tenants.id] }),
}));

export const insertCloudAppRiskAttributeSchema = createInsertSchema(cloudAppRiskAttributes).omit({ id: true, createdAt: true });
export type CloudAppRiskAttribute = typeof cloudAppRiskAttributes.$inferSelect;
export type InsertCloudAppRiskAttribute = z.infer<typeof insertCloudAppRiskAttributeSchema>;

export const ingestBatchStatusEnum = pgEnum("ingest_batch_status", [
  "queued", "normalizing", "enriching", "scoring", "correlating", "complete", "failed"
]);

export const ingestChannelEnum = pgEnum("ingest_channel", ["api", "file", "connector"]);

export const ingestApiKeys = pgTable("ingest_api_keys", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  permissions: jsonb("permissions"),
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ingestApiKeysRelations = relations(ingestApiKeys, ({ one }) => ({
  tenant: one(tenants, { fields: [ingestApiKeys.tenantId], references: [tenants.id] }),
}));

export const insertIngestApiKeySchema = createInsertSchema(ingestApiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });
export type IngestApiKey = typeof ingestApiKeys.$inferSelect;
export type InsertIngestApiKey = z.infer<typeof insertIngestApiKeySchema>;

export const ingestBatches = pgTable("ingest_batches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  source: varchar("source", { length: 255 }),
  channel: ingestChannelEnum("channel").default("api").notNull(),
  status: ingestBatchStatusEnum("status").default("queued").notNull(),
  totalEvents: integer("total_events").default(0).notNull(),
  processedEvents: integer("processed_events").default(0).notNull(),
  errorCount: integer("error_count").default(0).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
});

export const ingestBatchesRelations = relations(ingestBatches, ({ one }) => ({
  tenant: one(tenants, { fields: [ingestBatches.tenantId], references: [tenants.id] }),
}));

export const insertIngestBatchSchema = createInsertSchema(ingestBatches).omit({ id: true, completedAt: true });
export type IngestBatch = typeof ingestBatches.$inferSelect;
export type InsertIngestBatch = z.infer<typeof insertIngestBatchSchema>;

export const sigmaRules = pgTable("sigma_rules", {
  id: serial("id").primaryKey(),
  ruleId: varchar("rule_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  level: varchar("level", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }),
  logsource: jsonb("logsource"),
  detection: jsonb("detection"),
  mitreTags: jsonb("mitre_tags"),
  ruleYaml: text("rule_yaml").notNull(),
  matchCount: integer("match_count").default(0).notNull(),
  lastMatchedAt: timestamp("last_matched_at"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  qualityGrade: varchar("quality_grade", { length: 5 }),
  aiSuggestion: text("ai_suggestion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSigmaRuleSchema = createInsertSchema(sigmaRules).omit({ id: true, matchCount: true, lastMatchedAt: true, createdAt: true, updatedAt: true });
export type SigmaRule = typeof sigmaRules.$inferSelect;
export type InsertSigmaRule = z.infer<typeof insertSigmaRuleSchema>;

/* ── Cyber LLM Predictive Attack Engine (Task #149) — run-oriented records ── */
export const cyberPredictions = pgTable("cyber_predictions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  predictionWindowDays: integer("prediction_window_days").default(30).notNull(),
  overallConfidence: integer("overall_confidence"),
  accuracyScore: integer("accuracy_score"),
  status: varchar("status", { length: 20 }).default("complete").notNull(),
  // Structured per-prediction rows sorted by confidence DESC
  // (attackType, confidence, timeWindow, targetAssetClass, mitreTactic,
  //  mitreTechniqueId, killChainStage, recommendedAction)
  predictions: jsonb("predictions"),
  // Per-source signal counts fed into this run
  inputSignalCounts: jsonb("input_signal_counts"),
  // Supplementary analytics payload
  vectors: jsonb("vectors"),
  riskTimeline: jsonb("risk_timeline"),
  emergingIndicators: jsonb("emerging_indicators"),
  predictedTargets: jsonb("predicted_targets"),
  narrative: text("narrative"),
  modelUsed: varchar("model_used", { length: 100 }),
  signalSummary: jsonb("signal_summary"),
  accuracyFeedback: jsonb("accuracy_feedback"),
});
export const insertCyberPredictionSchema = createInsertSchema(cyberPredictions).omit({ id: true, createdAt: true, generatedAt: true });
export type CyberPrediction = typeof cyberPredictions.$inferSelect;
export type InsertCyberPrediction = z.infer<typeof insertCyberPredictionSchema>;

export const dataRetentionPolicies = pgTable("data_retention_policies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  hotRetentionDays: integer("hot_retention_days").default(90).notNull(),
  warmRetentionDays: integer("warm_retention_days").default(365).notNull(),
  coldRetentionDays: integer("cold_retention_days").default(2555).notNull(),
  exportFormat: varchar("export_format", { length: 50 }).default("parquet").notNull(),
  partitionStrategy: varchar("partition_strategy", { length: 50 }).default("tenant_time").notNull(),
  warmConnectorId: integer("warm_connector_id"),
  coldConnectorId: integer("cold_connector_id"),
  lastExportAt: timestamp("last_export_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDataRetentionPolicySchema = createInsertSchema(dataRetentionPolicies).omit({ id: true, lastExportAt: true, createdAt: true, updatedAt: true });
export type DataRetentionPolicy = typeof dataRetentionPolicies.$inferSelect;
export type InsertDataRetentionPolicy = z.infer<typeof insertDataRetentionPolicySchema>;

export const investigationStatusEnum = pgEnum("investigation_status", ["queued", "investigating", "completed", "failed"]);
export const investigationTypeEnum = pgEnum("investigation_type", ["auto_triage", "deep_investigation", "forensic_analysis", "campaign_hunt", "manual"]);

export const aiInvestigations = pgTable("ai_investigations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  incidentId: integer("incident_id").notNull().references(() => incidents.id),
  status: investigationStatusEnum("status").default("queued").notNull(),
  investigationType: investigationTypeEnum("investigation_type").default("auto_triage").notNull(),
  findings: jsonb("findings"),
  recommendations: jsonb("recommendations"),
  executiveSummary: text("executive_summary"),
  technicalReport: text("technical_report"),
  riskScore: integer("risk_score"),
  confidenceScore: integer("confidence_score"),
  relatedIncidentIds: integer("related_incident_ids").array(),
  investigationSteps: jsonb("investigation_steps"),
  attackChain: jsonb("attack_chain"),
  iocsSummary: jsonb("iocs_summary"),
  affectedEntities: jsonb("affected_entities"),
  verdict: varchar("verdict", { length: 50 }),
  verdictReasoning: text("verdict_reasoning"),
  decisionMetrics: jsonb("decision_metrics"),
  agentPipeline: jsonb("agent_pipeline"),
  investigationPlan: jsonb("investigation_plan"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiInvestigationsRelations = relations(aiInvestigations, ({ one }) => ({
  tenant: one(tenants, { fields: [aiInvestigations.tenantId], references: [tenants.id] }),
  incident: one(incidents, { fields: [aiInvestigations.incidentId], references: [incidents.id] }),
}));

export const insertAiInvestigationSchema = createInsertSchema(aiInvestigations).omit({ id: true, completedAt: true, createdAt: true });
export type AiInvestigation = typeof aiInvestigations.$inferSelect;
export type InsertAiInvestigation = z.infer<typeof insertAiInvestigationSchema>;

export const incidentNotifications = pgTable("incident_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  incidentId: integer("incident_id").notNull().references(() => incidents.id),
  investigationId: integer("investigation_id").references(() => aiInvestigations.id),
  recipients: text("recipients").array().notNull(),
  notificationType: varchar("notification_type", { length: 50 }).default("ai_investigation_complete").notNull(),
  domain: varchar("domain", { length: 50 }),
  verdict: varchar("verdict", { length: 50 }),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  actionToken: varchar("action_token", { length: 100 }),
  actionTaken: varchar("action_taken", { length: 50 }),
  actionTakenAt: timestamp("action_taken_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncidentNotificationSchema = createInsertSchema(incidentNotifications).omit({ id: true, actionTakenAt: true, createdAt: true });
export type IncidentNotification = typeof incidentNotifications.$inferSelect;
export type InsertIncidentNotification = z.infer<typeof insertIncidentNotificationSchema>;

export const emailConfigurations = pgTable("email_configurations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  config: jsonb("config").notNull(),
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const insertEmailConfigurationSchema = createInsertSchema(emailConfigurations).omit({ id: true, createdAt: true, updatedAt: true });
export type EmailConfiguration = typeof emailConfigurations.$inferSelect;
export type InsertEmailConfiguration = z.infer<typeof insertEmailConfigurationSchema>;

export const dlqStatusEnum = pgEnum("dlq_status", ["failed", "retrying", "recovered", "abandoned"]);

export const eventDeadLetterQueue = pgTable("event_dead_letter_queue", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  rawPayload: jsonb("raw_payload"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  pipelineStage: varchar("pipeline_stage", { length: 50 }),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  status: dlqStatusEnum("status").default("failed").notNull(),
  batchId: integer("batch_id"),
  lastRetryAt: timestamp("last_retry_at"),
  recoveredAt: timestamp("recovered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEventDlqSchema = createInsertSchema(eventDeadLetterQueue).omit({ id: true, recoveredAt: true, createdAt: true });
export type EventDlqEntry = typeof eventDeadLetterQueue.$inferSelect;
export type InsertEventDlqEntry = z.infer<typeof insertEventDlqSchema>;

export const feedbackTypeEnum = pgEnum("feedback_type", ["verdict_correction", "severity_adjustment", "fp_pattern_add", "recommendation_quality", "general"]);

export const analystFeedback = pgTable("analyst_feedback", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  investigationId: integer("investigation_id").references(() => aiInvestigations.id),
  incidentId: integer("incident_id").references(() => incidents.id),
  analystUserId: varchar("analyst_user_id", { length: 255 }),
  feedbackType: feedbackTypeEnum("feedback_type").default("general").notNull(),
  verdictOverride: varchar("verdict_override", { length: 50 }),
  severityOverride: varchar("severity_override", { length: 20 }),
  originalVerdict: varchar("original_verdict", { length: 50 }),
  originalSeverity: varchar("original_severity", { length: 20 }),
  feedbackNotes: text("feedback_notes"),
  isUsedForLearning: boolean("is_used_for_learning").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnalystFeedbackSchema = createInsertSchema(analystFeedback).omit({ id: true, createdAt: true });
export type AnalystFeedback = typeof analystFeedback.$inferSelect;
export type InsertAnalystFeedback = z.infer<typeof insertAnalystFeedbackSchema>;

export const challengeCategoryEnum = pgEnum("challenge_category", [
  "incident_response", "threat_hunting", "compliance", "asset_management", "collaboration", "sla_performance"
]);
export const challengeTypeEnum = pgEnum("challenge_type", ["daily", "weekly", "monthly", "one_time"]);
export const challengeDifficultyEnum = pgEnum("challenge_difficulty", ["beginner", "intermediate", "advanced", "expert"]);
export const leaderboardPeriodEnum = pgEnum("leaderboard_period", ["daily", "weekly", "monthly", "all_time"]);

export const securityChallenges = pgTable("security_challenges", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: challengeCategoryEnum("category").notNull(),
  challengeType: challengeTypeEnum("challenge_type").notNull(),
  metric: varchar("metric", { length: 100 }).notNull(),
  targetValue: integer("target_value").notNull(),
  xpReward: integer("xp_reward").notNull(),
  badgeReward: varchar("badge_reward", { length: 100 }),
  badgeIcon: varchar("badge_icon", { length: 50 }),
  difficulty: challengeDifficultyEnum("difficulty").default("beginner").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSecurityChallengeSchema = createInsertSchema(securityChallenges).omit({ id: true, createdAt: true });
export type SecurityChallenge = typeof securityChallenges.$inferSelect;
export type InsertSecurityChallenge = z.infer<typeof insertSecurityChallengeSchema>;

export const userChallengeProgress = pgTable("user_challenge_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  challengeId: integer("challenge_id").notNull().references(() => securityChallenges.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  currentValue: integer("current_value").default(0).notNull(),
  targetValue: integer("target_value").notNull(),
  completedAt: timestamp("completed_at"),
  claimedAt: timestamp("claimed_at"),
  xpEarned: integer("xp_earned").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserChallengeProgressSchema = createInsertSchema(userChallengeProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type UserChallengeProgress = typeof userChallengeProgress.$inferSelect;
export type InsertUserChallengeProgress = z.infer<typeof insertUserChallengeProgressSchema>;

export const userGamificationProfiles = pgTable("user_gamification_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  totalXp: integer("total_xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastActivityDate: timestamp("last_activity_date"),
  badges: jsonb("badges").default([]).notNull(),
  title: varchar("title", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserGamificationProfileSchema = createInsertSchema(userGamificationProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type UserGamificationProfile = typeof userGamificationProfiles.$inferSelect;
export type InsertUserGamificationProfile = z.infer<typeof insertUserGamificationProfileSchema>;

export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  period: leaderboardPeriodEnum("period").notNull(),
  periodStart: timestamp("period_start").notNull(),
  xpEarned: integer("xp_earned").default(0).notNull(),
  challengesCompleted: integer("challenges_completed").default(0).notNull(),
  incidentsResolved: integer("incidents_resolved").default(0).notNull(),
  ticketsClosed: integer("tickets_closed").default(0).notNull(),
  rank: integer("rank").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeaderboardEntrySchema = createInsertSchema(leaderboardEntries).omit({ id: true, createdAt: true });
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type InsertLeaderboardEntry = z.infer<typeof insertLeaderboardEntrySchema>;

export const orgStakeholders = pgTable("org_stakeholders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  category: varchar("category", { length: 50 }).notNull(),
  subcategory: varchar("subcategory", { length: 100 }).notNull(),
  stakeholderName: varchar("stakeholder_name", { length: 255 }).notNull(),
  stakeholderEmail: varchar("stakeholder_email", { length: 255 }).notNull(),
  stakeholderRole: varchar("stakeholder_role", { length: 100 }).notNull(),
  stakeholderPhone: varchar("stakeholder_phone", { length: 50 }),
  stakeholderDepartment: varchar("stakeholder_department", { length: 150 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrgStakeholderSchema = createInsertSchema(orgStakeholders).omit({ id: true, createdAt: true, updatedAt: true });
export type OrgStakeholder = typeof orgStakeholders.$inferSelect;
export type InsertOrgStakeholder = z.infer<typeof insertOrgStakeholderSchema>;

export const appCategoryOverrides = pgTable("app_category_overrides", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  appName: varchar("app_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppCategoryOverrideSchema = createInsertSchema(appCategoryOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export type AppCategoryOverride = typeof appCategoryOverrides.$inferSelect;
export type InsertAppCategoryOverride = z.infer<typeof insertAppCategoryOverrideSchema>;

export const platformNotifications = pgTable("platform_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id"),
  type: varchar("type", { length: 30 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  severity: varchar("severity", { length: 20 }).default("info").notNull(),
  read: boolean("read").default(false).notNull(),
  actionUrl: varchar("action_url", { length: 500 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlatformNotificationSchema = createInsertSchema(platformNotifications).omit({ id: true, createdAt: true });
export type PlatformNotification = typeof platformNotifications.$inferSelect;
export type InsertPlatformNotification = z.infer<typeof insertPlatformNotificationSchema>;

// Task #183 — historical record of ClickHouse stalled-ingest outages so
// operators can see how often ingestion stalls and how long each outage lasted.
export const clickhouseIngestOutages = pgTable("clickhouse_ingest_outages", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  thresholdMinutes: integer("threshold_minutes").notNull(),
  sampleWindowSeconds: integer("sample_window_seconds").notNull(),
  notificationsDispatched: integer("notifications_dispatched").default(0).notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  // Task #187 — distinguish stalled-ingest outages (platform-wide) from
  // fast-path read failures (per tenant). Existing rows keep reason='stalled_ingest'.
  reason: varchar("reason", { length: 32 }).default("stalled_ingest").notNull(),
  tenantId: integer("tenant_id"),
  failureRatePercent: integer("failure_rate_percent"),
  attempts: integer("attempts"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClickhouseIngestOutageSchema = createInsertSchema(clickhouseIngestOutages).omit({ id: true, createdAt: true });
export type ClickhouseIngestOutage = typeof clickhouseIngestOutages.$inferSelect;
export type InsertClickhouseIngestOutage = z.infer<typeof insertClickhouseIngestOutageSchema>;

export const huntSessionStatusEnum = pgEnum("hunt_session_status", ["active", "paused", "completed", "archived"]);

export const huntSessions = pgTable("hunt_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  hypothesis: text("hypothesis"),
  query: jsonb("query").$type<Record<string, any>>(),
  findings: text("findings"),
  status: huntSessionStatusEnum("hunt_session_status").default("active").notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHuntSessionSchema = createInsertSchema(huntSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type HuntSession = typeof huntSessions.$inferSelect;
export type InsertHuntSession = z.infer<typeof insertHuntSessionSchema>;

export const huntTemplates = pgTable("hunt_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  nlQuery: text("nl_query").notNull(),
  resolvedFilters: jsonb("resolved_filters").$type<Record<string, any>>().default({}),
  searchDescription: text("search_description"),
  createdBy: varchar("created_by", { length: 255 }),
  isShared: boolean("is_shared").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHuntTemplateSchema = createInsertSchema(huntTemplates).omit({ id: true, createdAt: true });
export type HuntTemplate = typeof huntTemplates.$inferSelect;
export type InsertHuntTemplate = z.infer<typeof insertHuntTemplateSchema>;

export const playbookStatusEnum = pgEnum("playbook_status", ["active", "inactive", "draft"]);
export const playbookExecStatusEnum = pgEnum("playbook_exec_status", ["running", "completed", "failed", "partial"]);

export type PlaybookConditionConfig = {
  field?: string;
  operator?: "eq" | "neq" | "contains" | "in";
  value?: string | string[];
};

export type PlaybookNodeConfig = {
  actionType?: string;
  blockType?: string;
  severity?: string;
  webhookUrl?: string;
  channel?: string;
  recipients?: string;
  message?: string;
  analysisType?: string;
  storeResults?: boolean;
  condition?: PlaybookConditionConfig;
};

export type PlaybookGraphNode = {
  id: string;
  type: "trigger" | "condition" | "action" | "notification" | "ai_enrichment" | "end";
  label: string;
  x: number;
  y: number;
  config: PlaybookNodeConfig;
};

export type PlaybookGraphEdge = {
  id: string;
  from: string;
  fromPort: "default" | "true" | "false";
  to: string;
};

export type PlaybookTriggerConditions = {
  severity?: string[];
  type?: string[];
  source?: string[];
  mitreTactics?: string[];
  mitreTechniqueIds?: string[];
  iocTypes?: string[];
  assetCriticality?: string[];
};

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  triggerConditions: jsonb("trigger_conditions").$type<PlaybookTriggerConditions>().default({}),
  steps: jsonb("steps").$type<{ id: string; type: string; label: string; config: Record<string, any>; order: number }[]>().default([]),
  graphNodes: jsonb("graph_nodes").$type<PlaybookGraphNode[]>().default([]),
  graphEdges: jsonb("graph_edges").$type<PlaybookGraphEdge[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  isTemplate: boolean("is_template").default(false).notNull(),
  executionCount: integer("execution_count").default(0).notNull(),
  lastExecuted: timestamp("last_executed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlaybookSchema = createInsertSchema(playbooks).omit({ id: true, createdAt: true, updatedAt: true, executionCount: true, lastExecuted: true });
export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;

export const playbookExecutions = pgTable("playbook_executions", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").notNull().references(() => playbooks.id),
  incidentId: integer("incident_id"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  execId: varchar("exec_id", { length: 64 }).unique(),
  dryRun: boolean("dry_run").default(false).notNull(),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  stepResults: jsonb("step_results").$type<{ stepId: string; status: string; message?: string; startedAt?: string; completedAt?: string; durationMs?: number; action?: string; target?: string; apiResponse?: string; error?: string }[]>().default([]),
  triggeredBy: varchar("triggered_by", { length: 255 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertPlaybookExecutionSchema = createInsertSchema(playbookExecutions).omit({ id: true, startedAt: true });
export type PlaybookExecution = typeof playbookExecutions.$inferSelect;
export type InsertPlaybookExecution = z.infer<typeof insertPlaybookExecutionSchema>;

export const caseStatusEnum = pgEnum("case_status", ["open", "investigating", "contained", "remediated", "closed"]);
export const casePriorityEnum = pgEnum("case_priority", ["critical", "high", "medium", "low"]);

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  severity: severityEnum("severity").default("medium").notNull(),
  status: caseStatusEnum("status").default("open").notNull(),
  priority: casePriorityEnum("priority").default("medium").notNull(),
  assigneeId: varchar("assignee_id", { length: 255 }),
  createdBy: varchar("created_by", { length: 255 }),
  mitreTactics: text("mitre_tactics").array(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCaseSchema = createInsertSchema(cases).omit({ id: true, createdAt: true, updatedAt: true });
export type Case = typeof cases.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;

export const caseIncidents = pgTable("case_incidents", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  incidentId: integer("incident_id").notNull().references(() => incidents.id),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  linkedBy: varchar("linked_by", { length: 255 }),
});

export const insertCaseIncidentSchema = createInsertSchema(caseIncidents).omit({ id: true, linkedAt: true });
export type CaseIncident = typeof caseIncidents.$inferSelect;
export type InsertCaseIncident = z.infer<typeof insertCaseIncidentSchema>;

export const caseEvidence = pgTable("case_evidence", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  hash: varchar("hash", { length: 128 }),
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseEvidenceSchema = createInsertSchema(caseEvidence).omit({ id: true, createdAt: true });
export type CaseEvidence = typeof caseEvidence.$inferSelect;
export type InsertCaseEvidence = z.infer<typeof insertCaseEvidenceSchema>;

export const caseTimeline = pgTable("case_timeline", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  action: varchar("action", { length: 255 }).notNull(),
  actor: varchar("actor", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseTimelineSchema = createInsertSchema(caseTimeline).omit({ id: true, createdAt: true });
export type CaseTimeline = typeof caseTimeline.$inferSelect;
export type InsertCaseTimeline = z.infer<typeof insertCaseTimelineSchema>;

export const feedTypeEnum = pgEnum("feed_type", ["stix_taxii", "csv", "json", "api", "custom"]);

export const threatIntelFeeds = pgTable("threat_intel_feeds", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: feedTypeEnum("type").notNull(),
  url: text("url"),
  apiKey: text("api_key"),
  pollingInterval: integer("polling_interval").default(3600),
  isActive: boolean("is_active").default(true).notNull(),
  lastSync: timestamp("last_sync"),
  lastError: text("last_error"),
  iocCount: integer("ioc_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertThreatIntelFeedSchema = createInsertSchema(threatIntelFeeds).omit({ id: true, createdAt: true, updatedAt: true, lastSync: true, lastError: true, iocCount: true });
export type ThreatIntelFeed = typeof threatIntelFeeds.$inferSelect;
export type InsertThreatIntelFeed = z.infer<typeof insertThreatIntelFeedSchema>;

export const iocTypeEnum = pgEnum("ioc_type", ["ip", "domain", "hash_md5", "hash_sha1", "hash_sha256", "url", "email", "filename", "registry_key", "mutex"]);
export const iocReputationEnum = pgEnum("ioc_reputation", ["malicious", "suspicious", "clean", "unknown"]);

export const threatIntelIocs = pgTable("threat_intel_iocs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feedId: integer("feed_id").references(() => threatIntelFeeds.id),
  indicatorType: iocTypeEnum("indicator_type").notNull(),
  indicatorValue: text("indicator_value").notNull(),
  reputation: iocReputationEnum("reputation").default("unknown").notNull(),
  confidence: integer("confidence").default(50),
  source: varchar("source", { length: 255 }),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  tags: text("tags").array(),
  mitreTechniques: text("mitre_techniques").array(),
  country: varchar("country", { length: 10 }),
  context: text("context"),
  malwareFamily: varchar("malware_family", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantTypeValueSourceUniq: unique("threat_intel_iocs_tenant_type_value_source_unique").on(
    table.tenantId, table.indicatorType, table.indicatorValue, table.source
  ),
}));

export const insertThreatIntelIocSchema = createInsertSchema(threatIntelIocs).omit({ id: true, createdAt: true });
export type ThreatIntelIoc = typeof threatIntelIocs.$inferSelect;
export type InsertThreatIntelIoc = z.infer<typeof insertThreatIntelIocSchema>;

export const aiTicketTasks = pgTable("ai_ticket_tasks", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  agentName: varchar("agent_name", { length: 100 }),
  confidence: integer("confidence"),
  outputText: text("output_text"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiTicketTaskSchema = createInsertSchema(aiTicketTasks).omit({ id: true, createdAt: true });
export type AiTicketTask = typeof aiTicketTasks.$inferSelect;
export type InsertAiTicketTask = z.infer<typeof insertAiTicketTaskSchema>;

export const suppressionActionEnum = pgEnum("suppression_action", ["suppress", "deprioritize"]);

export const suppressionRules = pgTable("suppression_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  operator: varchar("operator", { length: 50 }).notNull(),
  value: text("value").notNull(),
  action: suppressionActionEnum("action").notNull().default("suppress"),
  isActive: boolean("is_active").notNull().default(true),
  hitCount: integer("hit_count").notNull().default(0),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSuppressionRuleSchema = createInsertSchema(suppressionRules).omit({ id: true, hitCount: true, createdAt: true, updatedAt: true });
export type SuppressionRule = typeof suppressionRules.$inferSelect;
export type InsertSuppressionRule = z.infer<typeof insertSuppressionRuleSchema>;

export const incidentEvidence = pgTable("incident_evidence", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidents.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  type: varchar("type", { length: 50 }).notNull().default("note"),
  value: text("value").notNull(),
  description: text("description"),
  addedBy: varchar("added_by", { length: 255 }),
  chainOfCustodyHash: varchar("chain_of_custody_hash", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncidentEvidenceSchema = createInsertSchema(incidentEvidence).omit({ id: true, chainOfCustodyHash: true, createdAt: true });
export type IncidentEvidence = typeof incidentEvidence.$inferSelect;
export type InsertIncidentEvidence = z.infer<typeof insertIncidentEvidenceSchema>;

export const migrationMarkers = pgTable("migration_markers", {
  key: text("key").primaryKey(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export const crownJewelAssets = pgTable("crown_jewel_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  assetId: varchar("asset_id", { length: 255 }).notNull(),
  assetName: varchar("asset_name", { length: 255 }).notNull(),
  criticality: varchar("criticality", { length: 50 }).default("high").notNull(),
  label: varchar("label", { length: 255 }),
  taggedBy: varchar("tagged_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCrownJewelAssetSchema = createInsertSchema(crownJewelAssets).omit({ id: true, createdAt: true });
export type CrownJewelAsset = typeof crownJewelAssets.$inferSelect;
export type InsertCrownJewelAsset = z.infer<typeof insertCrownJewelAssetSchema>;

export const assetConnections = pgTable("asset_connections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sourceAsset: varchar("source_asset", { length: 255 }).notNull(),
  targetAsset: varchar("target_asset", { length: 255 }).notNull(),
  connectionType: varchar("connection_type", { length: 100 }).notNull().default("network"),
  weight: integer("weight").default(1).notNull(),
  technique: varchar("technique", { length: 255 }),
  mitreTechnique: varchar("mitre_technique", { length: 50 }),
  metadata: jsonb("metadata"),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssetConnectionSchema = createInsertSchema(assetConnections).omit({ id: true, createdAt: true });
export type AssetConnection = typeof assetConnections.$inferSelect;
export type InsertAssetConnection = z.infer<typeof insertAssetConnectionSchema>;

export const behavioralBaselines = pgTable("behavioral_baselines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityName: varchar("entity_name", { length: 255 }).notNull(),
  dimensionKey: varchar("dimension_key", { length: 100 }).notNull(),
  baselineMean: doublePrecision("baseline_mean").default(0).notNull(),
  baselineStdDev: doublePrecision("baseline_std_dev").default(1).notNull(),
  peerGroupMean: doublePrecision("peer_group_mean").default(0).notNull(),
  peerGroupStdDev: doublePrecision("peer_group_std_dev").default(1).notNull(),
  sampleCount: integer("sample_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBehavioralBaselineSchema = createInsertSchema(behavioralBaselines).omit({ id: true, updatedAt: true });
export type BehavioralBaseline = typeof behavioralBaselines.$inferSelect;
export type InsertBehavioralBaseline = z.infer<typeof insertBehavioralBaselineSchema>;

export const behaviorAnomalies = pgTable("behavior_anomalies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityName: varchar("entity_name", { length: 255 }).notNull(),
  anomalyType: varchar("anomaly_type", { length: 100 }).notNull(),
  dimensions: jsonb("dimensions"),
  confidenceScore: integer("confidence_score").default(0).notNull(),
  markedExpected: boolean("marked_expected").default(false).notNull(),
  escalatedToIncident: boolean("escalated_to_incident").default(false).notNull(),
  escalatedIncidentId: integer("escalated_incident_id"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertBehaviorAnomalySchema = createInsertSchema(behaviorAnomalies).omit({ id: true, occurredAt: true });
export type BehaviorAnomaly = typeof behaviorAnomalies.$inferSelect;
export type InsertBehaviorAnomaly = z.infer<typeof insertBehaviorAnomalySchema>;

// ── Breach & Attack Simulation (BAS) ─────────────────────────────────────────
export const basScenarios = pgTable("bas_scenarios", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // lateral_movement, exfiltration, persistence, privilege_escalation, initial_access, defense_evasion, discovery, credential_access, impact, command_and_control
  mitreAttackIds: text("mitre_attack_ids").array().default([]),
  killChainPhases: text("kill_chain_phases").array().default([]),
  severity: text("severity").notNull().default("medium"), // low, medium, high, critical
  attackVectors: jsonb("attack_vectors").default([]), // array of {vector, technique, payload, expectedDetection}
  isBuiltIn: boolean("is_built_in").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const basRuns = pgTable("bas_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  scenarioId: integer("scenario_id").references(() => basScenarios.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  triggeredBy: text("triggered_by"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  overallScore: integer("overall_score"), // 0-100 prevention score
  detectionScore: integer("detection_score"), // 0-100 detection coverage
  preventionScore: integer("prevention_score"), // 0-100 actual blocking
  exposureScore: integer("exposure_score"), // 0-100 attack surface exposure
  results: jsonb("results").default([]), // array of step results
  aiAnalysis: text("ai_analysis"),
  recommendations: jsonb("recommendations").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBasScenarioSchema = createInsertSchema(basScenarios).omit({ id: true, createdAt: true });
export type BasScenario = typeof basScenarios.$inferSelect;
export type InsertBasScenario = z.infer<typeof insertBasScenarioSchema>;

export const insertBasRunSchema = createInsertSchema(basRuns).omit({ id: true, createdAt: true });
export type BasRun = typeof basRuns.$inferSelect;
export type InsertBasRun = z.infer<typeof insertBasRunSchema>;

// ── Predictive CVE Risk Intelligence (#77) ───────────────────────────────────
export const cveRiskScores = pgTable("cve_risk_scores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  cveId: text("cve_id").notNull(), // e.g. CVE-2024-1234
  cvssScore: text("cvss_score"), // base CVSS
  epssScore: text("epss_score"), // Exploit Prediction Scoring System
  predictedExploitRisk: integer("predicted_exploit_risk"), // 0-100 AI-predicted 30-day exploit probability
  affectedAssets: integer("affected_assets").default(0),
  patchAvailable: boolean("patch_available").default(false),
  exploitedInWild: boolean("exploited_in_wild").default(false),
  aiRationale: text("ai_rationale"),
  mitreTechniques: text("mitre_techniques").array().default([]),
  severity: text("severity"), // critical, high, medium, low
  cvssVector: text("cvss_vector"),
  publishedDate: timestamp("published_date"),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Threat actor correlation fields
  threatActorIds: jsonb("threat_actor_ids").default([]),  // array of {name, group, campaign}
  assetExposureLevel: text("asset_exposure_level").default("internal"), // internet-facing, internal, cloud
  riskTrend: jsonb("risk_trend").default([]),  // array of {date, score} for sparkline
  estimatedRiskReduction: integer("estimated_risk_reduction"), // % risk reduction if patched
  patchPriority: integer("patch_priority"), // 1-10 AI patch priority rank
});

export const insertCveRiskScoreSchema = createInsertSchema(cveRiskScores).omit({ id: true, createdAt: true });
export type CveRiskScore = typeof cveRiskScores.$inferSelect;
export type InsertCveRiskScore = z.infer<typeof insertCveRiskScoreSchema>;

// ── Federated Cross-Tenant Threat Intel (#78) ─────────────────────────────────
export const federatedThreatIndicators = pgTable("federated_threat_indicators", {
  id: serial("id").primaryKey(),
  sourceTenantId: integer("source_tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  indicatorType: text("indicator_type").notNull(), // ip, domain, hash, url, email
  indicatorValue: text("indicator_value").notNull(),
  threatType: text("threat_type"), // malware, phishing, c2, ransomware, apt
  confidence: integer("confidence").default(70), // 0-100
  severity: text("severity").default("medium"),
  tlpLevel: text("tlp_level").default("amber"), // white, green, amber, red
  tags: text("tags").array().default([]),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  expiresAt: timestamp("expires_at"),
  sharedCount: integer("shared_count").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFederatedThreatIndicatorSchema = createInsertSchema(federatedThreatIndicators).omit({ id: true, createdAt: true });
export type FederatedThreatIndicator = typeof federatedThreatIndicators.$inferSelect;
export type InsertFederatedThreatIndicator = z.infer<typeof insertFederatedThreatIndicatorSchema>;

// ── Shared Threat Intel (#78) — platform-wide anonymized IOC layer ────────────
export const sharedThreatIntel = pgTable("shared_threat_intel", {
  id: serial("id").primaryKey(),
  sourceIocValue: text("source_ioc_value").notNull(),
  iocType: text("ioc_type").notNull(), // ip, domain, hash, url, email
  reputation: text("reputation").notNull().default("malicious"), // malicious, suspicious
  confidence: integer("confidence").notNull().default(80), // 0-100
  threatType: text("threat_type"), // malware, phishing, c2, ransomware, apt
  tags: jsonb("tags").default([]), // string[]
  contributorCount: integer("contributor_count").notNull().default(1),
  matchCount: integer("match_count").notNull().default(0), // security_events matched
  propagatedAt: timestamp("propagated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // null = never expires
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertSharedThreatIntelSchema = createInsertSchema(sharedThreatIntel).omit({ id: true, createdAt: true });
export type SharedThreatIntel = typeof sharedThreatIntel.$inferSelect;
export type InsertSharedThreatIntel = z.infer<typeof insertSharedThreatIntelSchema>;

// ── Tenant Intel Nominations (#78) — approval queue before propagation ────────
export const tenantIntelNominations = pgTable("tenant_intel_nominations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  iocValue: text("ioc_value").notNull(),
  iocType: text("ioc_type").notNull(),
  confidence: integer("confidence").notNull().default(80),
  reputation: text("reputation").notNull().default("malicious"),
  threatType: text("threat_type"),
  tags: jsonb("tags").default([]),
  sourceIncidentId: integer("source_incident_id"), // if nominated from incident TP
  sourceIocId: integer("source_ioc_id"), // if nominated from IOC reputation update
  status: text("status").notNull().default("pending"), // pending, approved, rejected, propagating, propagated, failed
  nominatedBy: text("nominated_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  sharedThreatIntelId: integer("shared_threat_intel_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertTenantIntelNominationSchema = createInsertSchema(tenantIntelNominations).omit({ id: true, createdAt: true, updatedAt: true });
export type TenantIntelNomination = typeof tenantIntelNominations.$inferSelect;
export type InsertTenantIntelNomination = z.infer<typeof insertTenantIntelNominationSchema>;

// ── Platform Settings (#182) — global key/value config tunable by admins ─────
export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 255 }),
});
export type PlatformSetting = typeof platformSettings.$inferSelect;

export const clickHouseIngestMonitorSettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdMinutes: z.number().int().min(1).max(1440),
  sampleWindowSeconds: z.number().int().min(30).max(3600),
  intervalSeconds: z.number().int().min(30).max(3600),
});
export type ClickHouseIngestMonitorSettings = z.infer<typeof clickHouseIngestMonitorSettingsSchema>;

// Task #187 — settings for the per-tenant ClickHouse fast-path failure monitor.
// When the rolling failure rate over `windowMinutes` (with at least
// `minAttempts` samples) exceeds `failureRatePercent`, an alert fires for that
// tenant and an entry is written to clickhouse_ingest_outages so operators can
// correlate against the existing outage history.
export const clickHouseFastPathMonitorSettingsSchema = z.object({
  enabled: z.boolean(),
  windowMinutes: z.number().int().min(1).max(60),
  minAttempts: z.number().int().min(1).max(10000),
  failureRatePercent: z.number().int().min(1).max(100),
  intervalSeconds: z.number().int().min(30).max(3600),
  cooldownMinutes: z.number().int().min(1).max(1440),
});
export type ClickHouseFastPathMonitorSettings = z.infer<typeof clickHouseFastPathMonitorSettingsSchema>;

// ── Platform Settings Audit (#188) — record each change for review ───────────
export const platformSettingsAudit = pgTable("platform_settings_audit", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull(),
  prevValue: jsonb("prev_value"),
  newValue: jsonb("new_value").notNull(),
  changedBy: varchar("changed_by", { length: 255 }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});
export type PlatformSettingsAuditEntry = typeof platformSettingsAudit.$inferSelect;

// ── Tenant Intel Sharing Settings (#78) — opt-in/out per tenant ──────────────
export const tenantIntelSharingSettings = pgTable("tenant_intel_sharing_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  sharingEnabled: boolean("sharing_enabled").notNull().default(false),
  receivingEnabled: boolean("receiving_enabled").notNull().default(true),
  iocContributed: integer("ioc_contributed").notNull().default(0),
  iocReceived: integer("ioc_received").notNull().default(0),
  contributionScore: integer("contribution_score").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertTenantIntelSharingSettingsSchema = createInsertSchema(tenantIntelSharingSettings).omit({ id: true, createdAt: true });
export type TenantIntelSharingSettings = typeof tenantIntelSharingSettings.$inferSelect;

// ── Community Alert Notifications (#78) — per tenant, match on new shared IOC ─
export const communityAlertNotifications = pgTable("community_alert_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  sharedThreatIntelId: integer("shared_threat_intel_id").notNull(),
  iocValue: text("ioc_value").notNull(),
  iocType: text("ioc_type").notNull(),
  matchedEventCount: integer("matched_event_count").notNull().default(0),
  severity: text("severity").notNull().default("medium"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommunityAlertNotificationSchema = createInsertSchema(communityAlertNotifications).omit({ id: true, createdAt: true });
export type CommunityAlertNotification = typeof communityAlertNotifications.$inferSelect;

// ── Vulnerability Risk Scores (#77 — canonical table per task spec) ───────────
export const vulnerabilityRiskScores = pgTable("vulnerability_risk_scores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  cveId: text("cve_id").notNull(),
  // Fields populated from security_events + assets
  affectedAssets: jsonb("affected_assets").default([]), // array of {hostname, ip, assetGroup, exposureLevel}
  affectedAssetCount: integer("affected_asset_count").default(0),
  affectedAssetGroups: text("affected_asset_groups").array().default([]),
  // EPSS & risk scoring
  cvssScore: text("cvss_score"),
  epssScore: text("epss_score"), // Exploit Prediction Scoring System approximation
  exploitationProbability: integer("exploitation_probability").notNull().default(0), // 0-100 predicted 30-day exploit probability
  severity: text("severity"), // critical, high, medium, low
  // Enrichment flags
  pocAvailable: boolean("poc_available").default(false),
  exploitedInWild: boolean("exploited_in_wild").default(false),
  patchAvailable: boolean("patch_available").default(false),
  // Threat actors
  // threat_actor_names doubles as threat_actor_ids (spec alias) — API returns both fields
  threatActorNames: text("threat_actor_names").array().default([]),
  threatActorDetails: jsonb("threat_actor_details").default([]), // {name, group, campaign}[]
  // Asset exposure
  maxExposureLevel: text("max_exposure_level").default("internal"), // internet-facing, cloud, internal
  // AI outputs
  aiRationale: text("ai_rationale"),
  patchPriority: integer("patch_priority"), // 1-based rank
  estimatedRiskReduction: integer("estimated_risk_reduction"), // % reduction if patched
  // Risk trend sparkline
  riskTrend: jsonb("risk_trend").default([]), // {date: string; score: number}[]
  // Source context
  mitreTechniques: text("mitre_techniques").array().default([]),
  publishedDate: timestamp("published_date"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqTenantCve: unique("uq_vuln_risk_tenant_cve").on(table.tenantId, table.cveId),
}));

export const insertVulnerabilityRiskScoreSchema = createInsertSchema(vulnerabilityRiskScores).omit({ id: true, createdAt: true });
export type VulnerabilityRiskScore = typeof vulnerabilityRiskScores.$inferSelect;
export type InsertVulnerabilityRiskScore = z.infer<typeof insertVulnerabilityRiskScoreSchema>;

// ── AI Detection Engineering (#79) ───────────────────────────────────────────
export const aiDetectionRules = pgTable("ai_detection_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull(), // sigma, yara, kql, spl, eql
  ruleContent: text("rule_content").notNull(),
  status: text("status").default("draft").notNull(), // draft, testing, active, archived
  mitreAttackIds: text("mitre_attack_ids").array().default([]),
  killChainPhases: text("kill_chain_phases").array().default([]),
  falsePositiveRate: text("false_positive_rate"),
  truePositiveRate: text("true_positive_rate"),
  generatedFromEventIds: integer("generated_from_event_ids").array().default([]),
  generatedFromAnomalyIds: integer("generated_from_anomaly_ids").array().default([]),
  generatedFromIncidentId: integer("generated_from_incident_id"),
  aiConfidence: integer("ai_confidence").default(70), // 0-100
  testResults: jsonb("test_results"),
  tags: text("tags").array().default([]),
  severity: text("severity").default("medium"),
  generatedBy: text("generated_by").default("ai"),
  promotedToSigmaAt: timestamp("promoted_to_sigma_at"),
  promotedToSigmaRuleId: text("promoted_to_sigma_rule_id"),
  autoEnableReason: text("auto_enable_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAiDetectionRuleSchema = createInsertSchema(aiDetectionRules).omit({ id: true, createdAt: true });
export type AiDetectionRule = typeof aiDetectionRules.$inferSelect;
export type InsertAiDetectionRule = z.infer<typeof insertAiDetectionRuleSchema>;

// ── Tenant Detection Settings — Auto-Enable Configuration ────────────────────
export const tenantDetectionSettings = pgTable("tenant_detection_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  autoEnableSigmaRules: boolean("auto_enable_sigma_rules").default(false),
  minAiConfidence: integer("min_ai_confidence").default(80),
  maxFalsePositiveRate: text("max_false_positive_rate").default("low"),
  minBacktestMatchedEvents: integer("min_backtest_matched_events").default(1),
  minQualityGrade: text("min_quality_grade").default("B"),
  autoEnableFromIncidents: boolean("auto_enable_from_incidents").default(true),
  autoEnableFromGaps: boolean("auto_enable_from_gaps").default(false),
  gapGenerationBatchSize: integer("gap_generation_batch_size").default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantDetectionSettingsSchema = createInsertSchema(tenantDetectionSettings).omit({ id: true, createdAt: true });
export type TenantDetectionSetting = typeof tenantDetectionSettings.$inferSelect;

// ── Auto-Enable Audit Log ────────────────────────────────────────────────────
export const autoEnableAuditLog = pgTable("auto_enable_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  aiRuleId: integer("ai_rule_id").references(() => aiDetectionRules.id).notNull(),
  sigmaRuleId: text("sigma_rule_id"),
  action: text("action").notNull(),
  reason: text("reason"),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Enterprise Data Infrastructure — DB Connectors (#86) ─────────────────────
export const dbConnectorTypeEnum = pgEnum("db_connector_type", [
  "postgresql", "mysql", "mariadb", "mssql", "clickhouse",
  "timescaledb", "snowflake", "bigquery", "redshift", "databricks", "iceberg",
]);

export const dbConnectors = pgTable("db_connectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  connectorType: dbConnectorTypeEnum("connector_type").notNull(),
  host: text("host"),
  port: integer("port"),
  database: text("database"),
  credentialBlob: text("credential_blob"),
  sslMode: text("ssl_mode").default("prefer"),
  extraParams: jsonb("extra_params"),
  status: text("status").default("unconfigured").notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  isActive: boolean("is_active").default(true).notNull(),
  scope: text("scope").default("global").notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDbConnectorSchema = createInsertSchema(dbConnectors).omit({ id: true, createdAt: true });
export type DbConnector = typeof dbConnectors.$inferSelect;
export type InsertDbConnector = z.infer<typeof insertDbConnectorSchema>;

// ─── EDR CIS Assessments ─────────────────────────────────────────────────────

export const edrCisAssessments = pgTable("edr_cis_assessments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  edrPlatform: varchar("edr_platform", { length: 100 }).notNull(),
  osType: varchar("os_type", { length: 50 }).notNull(),
  score: integer("score").notNull(),
  findings: jsonb("findings").notNull().$type<Array<{
    id: string;
    name: string;
    status: "PASS" | "FAIL" | "WARN" | "SKIP";
    evidence: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    weight: number;
  }>>(),
  triggeredBy: varchar("triggered_by", { length: 255 }).notNull().default("system"),
  status: varchar("status", { length: 30 }).notNull().default("completed"),
  errorMessage: text("error_message"),
  runAt: timestamp("run_at").defaultNow().notNull(),
});

export const insertEdrCisAssessmentSchema = createInsertSchema(edrCisAssessments).omit({ id: true, runAt: true });
export type EdrCisAssessment = typeof edrCisAssessments.$inferSelect;
export type InsertEdrCisAssessment = z.infer<typeof insertEdrCisAssessmentSchema>;

// ─── EDR Remediation Actions ──────────────────────────────────────────────────

export const edrRemediationActions = pgTable("edr_remediation_actions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  edrPlatform: varchar("edr_platform", { length: 100 }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  commandKey: varchar("command_key", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  triggeredBy: varchar("triggered_by", { length: 255 }).notNull(),
  edrResponse: jsonb("edr_response"),
  errorMessage: text("error_message"),
  runAt: timestamp("run_at").defaultNow().notNull(),
});

export const insertEdrRemediationActionSchema = createInsertSchema(edrRemediationActions).omit({ id: true, runAt: true });
export type EdrRemediationAction = typeof edrRemediationActions.$inferSelect;
export type InsertEdrRemediationAction = z.infer<typeof insertEdrRemediationActionSchema>;

// ─── Incident Response Plans (Task #117) ──────────────────────────────────────

export const incidentResponsePlans = pgTable("incident_response_plans", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  mode: varchar("mode", { length: 20 }).notNull().default("manual"), // manual | semi_auto | full_auto
  status: varchar("status", { length: 30 }).notNull().default("ready"), // ready | in_progress | complete
  generatedBy: varchar("generated_by", { length: 255 }).notNull().default("ai"),
  actions: jsonb("actions").notNull().default([]),
  executionSummary: text("execution_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const incidentResponseActions = pgTable("incident_response_actions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => incidentResponsePlans.id, { onDelete: "cascade" }),
  incidentId: integer("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  target: varchar("target", { length: 500 }).notNull(),
  targetType: varchar("target_type", { length: 50 }), // host | ip | account | ticket | email | log
  riskLevel: varchar("risk_level", { length: 20 }).notNull().default("medium"), // low | medium | high
  rationale: text("rationale"),
  expectedImpact: text("expected_impact"),
  estimatedSeconds: integer("estimated_seconds").default(30),
  status: varchar("status", { length: 30 }).notNull().default("pending"), // pending | approved | executing | done | failed | undone
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  executedBy: varchar("executed_by", { length: 255 }),
  isReversible: boolean("is_reversible").default(true),
  undoneAt: timestamp("undone_at"),
  undoneBy: varchar("undone_by", { length: 255 }),
  executionResult: jsonb("execution_result"),
  stepOrder: integer("step_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncidentResponsePlanSchema = createInsertSchema(incidentResponsePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIncidentResponseActionSchema = createInsertSchema(incidentResponseActions).omit({ id: true, createdAt: true });
export type IncidentResponsePlan = typeof incidentResponsePlans.$inferSelect;
export type IncidentResponseAction = typeof incidentResponseActions.$inferSelect;
export type InsertIncidentResponsePlan = z.infer<typeof insertIncidentResponsePlanSchema>;
export type InsertIncidentResponseAction = z.infer<typeof insertIncidentResponseActionSchema>;

// ─── Tenant Response Action Allowlist (#117) ─────────────────────────────────

export const tenantResponseAllowlist = pgTable("tenant_response_allowlist", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  riskLevels: text("risk_levels").array().notNull().default([]),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniq: uniqueIndex("tenant_response_allowlist_uniq").on(table.tenantId, table.actionType),
}));

export const insertTenantResponseAllowlistSchema = createInsertSchema(tenantResponseAllowlist).omit({ id: true, createdAt: true, updatedAt: true });
export type TenantResponseAllowlist = typeof tenantResponseAllowlist.$inferSelect;
export type InsertTenantResponseAllowlist = z.infer<typeof insertTenantResponseAllowlistSchema>;

// ─── AI Learning Feedback (#119) ─────────────────────────────────────────────
// Captures analyst TP/FP decisions with incident context for adaptive learning

export const aiLearningFeedback = pgTable("ai_learning_feedback", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  incidentId: integer("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  analystId: varchar("analyst_id", { length: 255 }),
  // Incident features snapshot at time of decision
  severity: varchar("severity", { length: 20 }),
  sourceType: varchar("source_type", { length: 100 }),
  iocCount: integer("ioc_count").default(0),
  mitreTactic: varchar("mitre_tactic", { length: 100 }),
  assetCriticality: varchar("asset_criticality", { length: 20 }),
  aiSuggestedClassification: varchar("ai_suggested_classification", { length: 20 }), // TP | FP | unknown
  aiConfidence: integer("ai_confidence"),
  // Analyst decision
  analystVerdict: varchar("analyst_verdict", { length: 20 }).notNull(), // true_positive | false_positive | inconclusive
  // Match flag: did AI suggestion match analyst verdict?
  aiMatched: boolean("ai_matched").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiLearningFeedbackSchema = createInsertSchema(aiLearningFeedback).omit({ id: true, createdAt: true });
export type AiLearningFeedback = typeof aiLearningFeedback.$inferSelect;
export type InsertAiLearningFeedback = z.infer<typeof insertAiLearningFeedbackSchema>;

// ─── Tenant AI Context (#119) ─────────────────────────────────────────────────
// Stores accumulated learning context per tenant, prepended to AI triage prompts

export const tenantAiContext = pgTable("tenant_ai_context", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  // Few-shot example summary injected into triage prompts
  fewShotExamples: text("few_shot_examples"),
  // Rolling 30-day accuracy metric (AI suggestion matched analyst %)
  accuracyPercent: real("accuracy_percent"),
  // Total decisions captured
  totalDecisions: integer("total_decisions").default(0),
  decisionsThisWeek: integer("decisions_this_week").default(0),
  // Top misclassified source types (JSON array of {source, count})
  topMisclassified: jsonb("top_misclassified"),
  lastDigestAt: timestamp("last_digest_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTenantAiContextSchema = createInsertSchema(tenantAiContext).omit({ id: true, createdAt: true, updatedAt: true });
export type TenantAiContext = typeof tenantAiContext.$inferSelect;
export type InsertTenantAiContext = z.infer<typeof insertTenantAiContextSchema>;

// ─── Tenant Quotas (#123) ──────────────────────────────────────────────────────
// Per-tenant quota configuration — tier-based with optional overrides.
// Tier defaults: standard (50 API/s, 100 events/s, 10 GB)
//               professional (500/1000/100 GB)
//               enterprise (unlimited)

export const quotaTierEnum = pgEnum("quota_tier", ["standard", "professional", "enterprise"]);

export const tenantQuotas = pgTable("tenant_quotas", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  tier: quotaTierEnum("tier").default("standard").notNull(),
  eventsPerSecond: integer("events_per_second").default(100).notNull(),
  apiRequestsPerSecond: integer("api_requests_per_second").default(50).notNull(),
  storageGb: integer("storage_gb").default(10).notNull(),
  customEventsPerSecond: integer("custom_events_per_second"),
  customApiRequestsPerSecond: integer("custom_api_requests_per_second"),
  customStorageGb: integer("custom_storage_gb"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTenantQuotaSchema = createInsertSchema(tenantQuotas).omit({ id: true, createdAt: true, updatedAt: true });
export type TenantQuota = typeof tenantQuotas.$inferSelect;
export type InsertTenantQuota = z.infer<typeof insertTenantQuotaSchema>;

// ─── Platform Integrations (#135) ─────────────────────────────────────────────
// Platform-wide third-party service integrations managed via Admin Portal.
// API keys stored here (plain text); never returned to frontend.
// Separate from per-tenant log-source integrations (Administration → Integrations).

export const platformIntegrations = pgTable("platform_integrations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),          // slug: "malwarebazaar"
  displayName: varchar("display_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("threat_intel"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  requiresKey: boolean("requires_key").notNull().default(false),
  apiKey: text("api_key"),                                             // null = not configured
  lastTestedAt: timestamp("last_tested_at"),
  testStatus: varchar("test_status", { length: 20 }).default("untested"), // ok | error | untested
  testMessage: text("test_message"),
  extraConfig: jsonb("extra_config"),                                  // TAXII/OpenCTI URL, pollInterval, etc.
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlatformIntegrationSchema = createInsertSchema(platformIntegrations).omit({ id: true, updatedAt: true });
export type PlatformIntegration = typeof platformIntegrations.$inferSelect;
export type InsertPlatformIntegration = z.infer<typeof insertPlatformIntegrationSchema>;

// ─── Cyber Intelligence Hub — CTI Tables (#153) ────────────────────────────────
// OpenCTI-grade threat intelligence entities per tenant.
// All tables use the migration-marker pattern: seed inserts are guarded by
// an upsert-or-skip check so re-running the server never duplicates rows.

// Threat sophistication / resource levels (shared across entities)
export const ctiSophisticationEnum = pgEnum("cti_sophistication", [
  "none", "minimal", "intermediate", "advanced", "expert", "innovator", "strategic",
]);

// ─── CTI Threat Actors ────────────────────────────────────────────────────────
export const ctiThreatActors = pgTable("cti_threat_actors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  aliases: text("aliases").array(),
  threatActorTypes: text("threat_actor_types").array(), // nation-state, criminal, hacktivist…
  sophistication: ctiSophisticationEnum("sophistication").default("intermediate"),
  resourceLevel: varchar("resource_level", { length: 50 }),  // individual, club, government…
  primaryMotivation: varchar("primary_motivation", { length: 100 }),
  goals: text("goals").array(),
  roles: text("roles").array(),                              // agent, director, sponsor…
  country: varchar("country", { length: 100 }),
  firstSeen: timestamp("first_seen"),
  lastSeen: timestamp("last_seen"),
  active: boolean("active").default(true).notNull(),
  confidence: integer("confidence").default(50),             // 0–100
  description: text("description"),
  stixId: varchar("stix_id", { length: 100 }).unique(),
  tags: text("tags").array(),
  indicatorCount: integer("indicator_count").default(0),
  campaignCount: integer("campaign_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCtiThreatActorSchema = createInsertSchema(ctiThreatActors).omit({ id: true, createdAt: true, updatedAt: true });
export type CtiThreatActor = typeof ctiThreatActors.$inferSelect;
export type InsertCtiThreatActor = z.infer<typeof insertCtiThreatActorSchema>;

// ─── CTI Intrusion Sets ───────────────────────────────────────────────────────
export const ctiIntrusionSets = pgTable("cti_intrusion_sets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  aliases: text("aliases").array(),
  description: text("description"),
  primaryMotivation: varchar("primary_motivation", { length: 100 }),
  secondaryMotivations: text("secondary_motivations").array(),
  resourceLevel: varchar("resource_level", { length: 50 }),
  sophistication: ctiSophisticationEnum("sophistication").default("advanced"),
  goals: text("goals").array(),
  targetSectors: text("target_sectors").array(),             // Banking, Healthcare…
  targetCountries: text("target_countries").array(),
  ttps: text("ttps").array(),                                // MITRE technique IDs
  toolsUsed: text("tools_used").array(),
  firstSeen: timestamp("first_seen"),
  lastSeen: timestamp("last_seen"),
  active: boolean("active").default(true).notNull(),
  confidence: integer("confidence").default(50),
  stixId: varchar("stix_id", { length: 100 }).unique(),
  tags: text("tags").array(),
  campaignCount: integer("campaign_count").default(0),
  indicatorCount: integer("indicator_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCtiIntrusionSetSchema = createInsertSchema(ctiIntrusionSets).omit({ id: true, createdAt: true, updatedAt: true });
export type CtiIntrusionSet = typeof ctiIntrusionSets.$inferSelect;
export type InsertCtiIntrusionSet = z.infer<typeof insertCtiIntrusionSetSchema>;

// ─── CTI Campaigns ────────────────────────────────────────────────────────────
export const ctiCampaigns = pgTable("cti_campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  aliases: text("aliases").array(),
  description: text("description"),
  objective: text("objective"),
  firstSeen: timestamp("first_seen"),
  lastSeen: timestamp("last_seen"),
  active: boolean("active").default(true).notNull(),
  status: varchar("status", { length: 50 }).default("active"),  // active | historical | suspected
  confidence: integer("confidence").default(50),
  attribution: varchar("attribution", { length: 200 }),       // linked threat actor / group
  targetSectors: text("target_sectors").array(),
  targetRegions: text("target_regions").array(),
  ttps: text("ttps").array(),
  toolsUsed: text("tools_used").array(),
  iocCount: integer("ioc_count").default(0),
  incidentCount: integer("incident_count").default(0),
  stixId: varchar("stix_id", { length: 100 }).unique(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCtiCampaignSchema = createInsertSchema(ctiCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type CtiCampaign = typeof ctiCampaigns.$inferSelect;
export type InsertCtiCampaign = z.infer<typeof insertCtiCampaignSchema>;

// ─── CTI Malware Families ─────────────────────────────────────────────────────
export const ctiMalwareFamilies = pgTable("cti_malware_families", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  aliases: text("aliases").array(),
  malwareTypes: text("malware_types").array(),               // ransomware, trojan, worm, rat…
  description: text("description"),
  isFamily: boolean("is_family").default(true).notNull(),
  killChainPhases: text("kill_chain_phases").array(),
  capabilities: text("capabilities").array(),
  operatingSystems: text("operating_systems").array(),       // windows, linux, macos, android…
  architectures: text("architectures").array(),
  programmingLanguages: text("programming_languages").array(),
  firstSeen: timestamp("first_seen"),
  lastSeen: timestamp("last_seen"),
  active: boolean("active").default(true).notNull(),
  confidence: integer("confidence").default(70),
  cvssScore: real("cvss_score"),
  ttps: text("ttps").array(),
  iocCount: integer("ioc_count").default(0),
  sampleCount: integer("sample_count").default(0),
  stixId: varchar("stix_id", { length: 100 }).unique(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCtiMalwareFamilySchema = createInsertSchema(ctiMalwareFamilies).omit({ id: true, createdAt: true, updatedAt: true });
export type CtiMalwareFamily = typeof ctiMalwareFamilies.$inferSelect;
export type InsertCtiMalwareFamily = z.infer<typeof insertCtiMalwareFamilySchema>;

// ─── CTI Intel Reports ────────────────────────────────────────────────────────
export const ctiIntelReports = pgTable("cti_intel_reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }).notNull(),
  reportType: varchar("report_type", { length: 50 }).default("threat-report"),  // threat-report | advisory | campaign-report | malware-analysis | ttps-report
  tlpLevel: varchar("tlp_level", { length: 20 }).default("amber"),              // white | green | amber | red
  description: text("description"),
  content: text("content"),
  publishedAt: timestamp("published_at").defaultNow(),
  authors: text("authors").array(),
  labels: text("labels").array(),
  relatedActors: text("related_actors").array(),
  relatedCampaigns: text("related_campaigns").array(),
  relatedMalware: text("related_malware").array(),
  iocCount: integer("ioc_count").default(0),
  confidence: integer("confidence").default(70),
  stixId: varchar("stix_id", { length: 100 }).unique(),
  externalUrl: text("external_url"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCtiIntelReportSchema = createInsertSchema(ctiIntelReports).omit({ id: true, createdAt: true, updatedAt: true });
export type CtiIntelReport = typeof ctiIntelReports.$inferSelect;
export type InsertCtiIntelReport = z.infer<typeof insertCtiIntelReportSchema>;

  // ─── TAXII STIX IOCs — indicators polled from external TAXII servers (#154) ───
  export const taxiiStixIocs = pgTable("taxii_stix_iocs", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    indicatorType: varchar("indicator_type", { length: 50 }).notNull(),
    indicatorValue: text("indicator_value").notNull(),
    reputation: varchar("reputation", { length: 30 }).default("malicious"),
    confidence: integer("confidence").default(70),
    source: text("source").notNull(),
    tags: jsonb("tags").default([]),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    rawStix: jsonb("raw_stix"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertTaxiiStixIocSchema = createInsertSchema(taxiiStixIocs).omit({ id: true, createdAt: true, updatedAt: true });
  export type TaxiiStixIoc = typeof taxiiStixIocs.$inferSelect;
  export type InsertTaxiiStixIoc = z.infer<typeof insertTaxiiStixIocSchema>;

  // ─── TAXII Threat Actors ────────────────────────────────────────────────────
  export const taxiiThreatActors = pgTable("taxii_threat_actors", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    aliases: jsonb("aliases").default([]),
    sophistication: text("sophistication"),
    primaryMotivation: text("primary_motivation"),
    country: text("country"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    description: text("description"),
    source: text("source").notNull(),
    tags: jsonb("tags").default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertTaxiiThreatActorSchema = createInsertSchema(taxiiThreatActors).omit({ id: true, createdAt: true, updatedAt: true });
  export type TaxiiThreatActor = typeof taxiiThreatActors.$inferSelect;
  export type InsertTaxiiThreatActor = z.infer<typeof insertTaxiiThreatActorSchema>;

  // ─── TAXII Campaigns ────────────────────────────────────────────────────────
  export const taxiiCampaigns = pgTable("taxii_campaigns", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    objective: text("objective"),
    source: text("source").notNull(),
    tags: jsonb("tags").default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertTaxiiCampaignSchema = createInsertSchema(taxiiCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
  export type TaxiiCampaign = typeof taxiiCampaigns.$inferSelect;
  export type InsertTaxiiCampaign = z.infer<typeof insertTaxiiCampaignSchema>;

  // ─── TAXII Malware ──────────────────────────────────────────────────────────
  export const taxiiMalware = pgTable("taxii_malware", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    malwareTypes: jsonb("malware_types").default([]),
    description: text("description"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    killChainPhases: text("kill_chain_phases"),
    source: text("source").notNull(),
    tags: jsonb("tags").default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertTaxiiMalwareSchema = createInsertSchema(taxiiMalware).omit({ id: true, createdAt: true, updatedAt: true });
  export type TaxiiMalware = typeof taxiiMalware.$inferSelect;
  export type InsertTaxiiMalware = z.infer<typeof insertTaxiiMalwareSchema>;

  // ─── OpenCTI IOC Cache — indicators synced from OpenCTI (#154) ─────────────
  export const openctiIocCache = pgTable("opencti_ioc_cache", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    indicatorType: varchar("indicator_type", { length: 50 }).notNull(),
    indicatorValue: text("indicator_value").notNull(),
    reputation: varchar("reputation", { length: 30 }).default("malicious"),
    confidence: integer("confidence").default(70),
    score: integer("score").default(0),
    source: text("source").notNull().default("opencti"),
    labels: jsonb("labels").default([]),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertOpenctiIocCacheSchema = createInsertSchema(openctiIocCache).omit({ id: true, createdAt: true, updatedAt: true });
  export type OpenctiIocCache = typeof openctiIocCache.$inferSelect;
  export type InsertOpenctiIocCache = z.infer<typeof insertOpenctiIocCacheSchema>;

  // ─── OpenCTI Threat Actors Cache ────────────────────────────────────────────
  export const openctiThreatActors = pgTable("opencti_threat_actors_cache", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    aliases: jsonb("aliases").default([]),
    description: text("description"),
    sophistication: text("sophistication"),
    primaryMotivation: text("primary_motivation"),
    country: text("country"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    confidence: integer("confidence").default(50),
    score: integer("score").default(0),
    linkedIocCount: integer("linked_ioc_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertOpenctiThreatActorSchema = createInsertSchema(openctiThreatActors).omit({ id: true, createdAt: true, updatedAt: true });
  export type OpenctiThreatActor = typeof openctiThreatActors.$inferSelect;
  export type InsertOpenctiThreatActor = z.infer<typeof insertOpenctiThreatActorSchema>;

  // ─── OpenCTI Campaigns Cache ────────────────────────────────────────────────
  export const openctiCampaigns = pgTable("opencti_campaigns_cache", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    aliases: jsonb("aliases").default([]),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    objective: text("objective"),
    confidence: integer("confidence").default(50),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertOpenctiCampaignSchema = createInsertSchema(openctiCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
  export type OpenctiCampaign = typeof openctiCampaigns.$inferSelect;
  export type InsertOpenctiCampaign = z.infer<typeof insertOpenctiCampaignSchema>;

  // ─── OpenCTI Malware Cache ──────────────────────────────────────────────────
  export const openctiMalware = pgTable("opencti_malware_cache", {
    id: serial("id").primaryKey(),
    stixId: text("stix_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    aliases: jsonb("aliases").default([]),
    malwareTypes: jsonb("malware_types").default([]),
    killChainPhases: text("kill_chain_phases"),
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    confidence: integer("confidence").default(70),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertOpenctiMalwareSchema = createInsertSchema(openctiMalware).omit({ id: true, createdAt: true, updatedAt: true });
  export type OpenctiMalware = typeof openctiMalware.$inferSelect;
  export type InsertOpenctiMalware = z.infer<typeof insertOpenctiMalwareSchema>;

  // ─── OpenCTI IOC Context — attribution table (#154) ─────────────────────────
  // Written by the enrichment pipeline when an IOC is matched in OpenCTI;
  // links the IOC value to its threat actor / campaign / malware attribution.

  export const openctiIocContext = pgTable("opencti_ioc_context", {
    id: serial("id").primaryKey(),
    iocValue: text("ioc_value").notNull(),
    iocType: text("ioc_type").notNull(),
    stixId: text("stix_id"),
    actorName: text("actor_name"),
    actorStixId: text("actor_stix_id"),
    campaignName: text("campaign_name"),
    campaignStixId: text("campaign_stix_id"),
    malwareFamily: text("malware_family"),
    malwareStixId: text("malware_stix_id"),
    confidence: integer("confidence").default(70),
    score: integer("score").default(0),
    incidentId: integer("incident_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertOpenctiIocContextSchema = createInsertSchema(openctiIocContext).omit({ id: true, createdAt: true, updatedAt: true });
  export type OpenctiIocContext = typeof openctiIocContext.$inferSelect;
  export type InsertOpenctiIocContext = z.infer<typeof insertOpenctiIocContextSchema>;

  // ─── Universal Log Ingestion & Parsing (#157) ─────────────────────────────────
  // Log source registry, device fingerprints, and source health tracking.

  export const logSourceTypeEnum = pgEnum("log_source_type", [
    "firewall", "ids_ips", "waf", "proxy", "edr", "email_gateway",
    "database_monitor", "casb", "cloud", "ot_iot", "network_tap",
    "siem", "identity", "vulnerability_scanner", "custom",
  ]);

  export const logSourceProtocolEnum = pgEnum("log_source_protocol", [
    "syslog_udp", "syslog_tcp", "syslog_tls", "http_webhook", "cef", "leef",
    "json", "xml", "plaintext", "file_upload", "api_pull",
  ]);

  export const logSources = pgTable("log_sources", {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sourceType: logSourceTypeEnum("source_type").default("custom").notNull(),
    protocol: logSourceProtocolEnum("protocol").default("json").notNull(),
    host: varchar("host", { length: 255 }),
    port: integer("port"),
    expectedFormat: varchar("expected_format", { length: 100 }),
    tags: text("tags").array().default([]),
    fingerprintId: integer("fingerprint_id"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertLogSourceSchema = createInsertSchema(logSources).omit({ id: true, createdAt: true, updatedAt: true });
  export type LogSource = typeof logSources.$inferSelect;
  export type InsertLogSource = z.infer<typeof insertLogSourceSchema>;

  export const deviceFingerprints = pgTable("device_fingerprints", {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sourceIdentifier: varchar("source_identifier", { length: 255 }).notNull(),
    vendor: varchar("vendor", { length: 200 }),
    product: varchar("product", { length: 200 }),
    logFormat: varchar("log_format", { length: 100 }),
    eventCategory: varchar("event_category", { length: 100 }),
    detectedFields: jsonb("detected_fields").$type<string[]>().default([]),
    sampleLogLines: text("sample_log_lines").array().default([]),
    aiConfidence: integer("ai_confidence").default(0),
    aiReasoning: text("ai_reasoning"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertDeviceFingerprintSchema = createInsertSchema(deviceFingerprints).omit({ id: true, createdAt: true, updatedAt: true });
  export type DeviceFingerprint = typeof deviceFingerprints.$inferSelect;
  export type InsertDeviceFingerprint = z.infer<typeof insertDeviceFingerprintSchema>;

  export const sourceHealth = pgTable("source_health", {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id").notNull().references(() => logSources.id, { onDelete: "cascade" }),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventsPerMin: real("events_per_min").default(0),
    parseSuccessRate: real("parse_success_rate").default(100),
    lastSeen: timestamp("last_seen"),
    errorRate: real("error_rate").default(0),
    totalEventsToday: integer("total_events_today").default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

  export const insertSourceHealthSchema = createInsertSchema(sourceHealth).omit({ id: true, updatedAt: true });
  export type SourceHealth = typeof sourceHealth.$inferSelect;
  export type InsertSourceHealth = z.infer<typeof insertSourceHealthSchema>;
  
// ─── Attack Category Taxonomy ─────────────────────────────────────────────────
export const ATTACK_CATEGORIES = [
  "malware_ransomware",
  "apt_targeted",
  "phishing_social_engineering",
  "spam_bulk_email",
  "web_application_attack",
  "network_intrusion",
  "bot_automated",
  "ai_generative",
  "database_attack",
  "fileless_inmemory",
  "lateral_movement",
  "suspicious_user_behavior",
  "suspicious_network_activity",
  "cloud_infrastructure",
  "ot_iot",
] as const;

export type AttackCategory = typeof ATTACK_CATEGORIES[number];

export const ATTACK_CATEGORY_LABELS: Record<AttackCategory, string> = {
  malware_ransomware: "Malware & Ransomware",
  apt_targeted: "APT / Targeted Attacks",
  phishing_social_engineering: "Phishing & Social Engineering",
  spam_bulk_email: "Spam & Bulk Email Threats",
  web_application_attack: "Web Application Attacks",
  network_intrusion: "Network Intrusion",
  bot_automated: "BOT & Automated Attack Traffic",
  ai_generative: "AI-Generative Attacks",
  database_attack: "Database Attacks",
  fileless_inmemory: "Fileless & In-Memory Attacks",
  lateral_movement: "Lateral Movement",
  suspicious_user_behavior: "Suspicious User Behavior (UEBA)",
  suspicious_network_activity: "Suspicious Network Activity",
  cloud_infrastructure: "Cloud & Infrastructure Attacks",
  ot_iot: "OT/IoT Attacks",
};

// ─── Attack Detection Records ─────────────────────────────────────────────────
export const attackDetections = pgTable("attack_detections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventId: integer("event_id").references(() => securityEvents.id, { onDelete: "set null" }),
  incidentId: integer("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  attackCategory: varchar("attack_category", { length: 100 }).notNull(),
  subType: varchar("sub_type", { length: 200 }),
  confidence: integer("confidence").notNull().default(0),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  mitreAttackId: varchar("mitre_attack_id", { length: 50 }),
  mitreAttackIds: text("mitre_attack_ids").array().default([]),
  killChainPhase: varchar("kill_chain_phase", { length: 100 }),
  explanation: text("explanation"),
  entities: jsonb("entities").$type<{
    ips: string[];
    users: string[];
    hosts: string[];
    hashes: string[];
    domains: string[];
  }>().default({ ips: [], users: [], hosts: [], hashes: [], domains: [] }),
  signalScore: integer("signal_score").default(0),
  signals: jsonb("signals").$type<Array<{ name: string; matched: boolean; weight: number; value?: string }>>().default([]),
  behavioralDeviationScore: integer("behavioral_deviation_score").default(0),
  attackChainId: varchar("attack_chain_id", { length: 100 }),
  rawContext: jsonb("raw_context"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttackDetectionSchema = createInsertSchema(attackDetections).omit({ id: true, createdAt: true, detectedAt: true });
export type AttackDetection = typeof attackDetections.$inferSelect;
export type InsertAttackDetection = z.infer<typeof insertAttackDetectionSchema>;

// ─── Attack Chain Groups ──────────────────────────────────────────────────────
export const attackChainGroups = pgTable("attack_chain_groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  chainId: varchar("chain_id", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  attackCategories: text("attack_categories").array().default([]),
  killChainPhases: text("kill_chain_phases").array().default([]),
  sharedEntities: jsonb("shared_entities").$type<{
    ips: string[];
    users: string[];
    hosts: string[];
    hashes: string[];
  }>().default({ ips: [], users: [], hosts: [], hashes: [] }),
  eventIds: integer("event_ids").array().default([]),
  detectionIds: integer("detection_ids").array().default([]),
  incidentId: integer("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  overallConfidence: integer("overall_confidence").default(0),
  severity: varchar("severity", { length: 20 }).default("medium"),
  timeWindowMinutes: integer("time_window_minutes").default(60),
  promotedToIncident: boolean("promoted_to_incident").default(false),
  firstEventAt: timestamp("first_event_at"),
  lastEventAt: timestamp("last_event_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAttackChainGroupSchema = createInsertSchema(attackChainGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type AttackChainGroup = typeof attackChainGroups.$inferSelect;
export type InsertAttackChainGroup = z.infer<typeof insertAttackChainGroupSchema>;

// ─── Detection Feedback ───────────────────────────────────────────────────────
export const detectionFeedbackTypeEnum = pgEnum("detection_feedback_type", ["true_positive", "false_positive", "benign"]);

export const detectionFeedback = pgTable("detection_feedback", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  detectionId: integer("detection_id").references(() => attackDetections.id, { onDelete: "set null" }),
  incidentId: integer("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  analystUserId: varchar("analyst_user_id", { length: 255 }).notNull(),
  feedbackType: detectionFeedbackTypeEnum("feedback_type").notNull(),
  attackCategory: varchar("attack_category", { length: 100 }),
  originalConfidence: integer("original_confidence"),
  notes: text("notes"),
  usedForTraining: boolean("used_for_training").default(false),
  trainingWeight: real("training_weight").default(1.0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDetectionFeedbackSchema = createInsertSchema(detectionFeedback).omit({ id: true, createdAt: true });
export type DetectionFeedback = typeof detectionFeedback.$inferSelect;
export type InsertDetectionFeedback = z.infer<typeof insertDetectionFeedbackSchema>;

// ─── Per-Category Confidence Thresholds ──────────────────────────────────────
export const categoryConfidenceThresholds = pgTable("category_confidence_thresholds", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  attackCategory: varchar("attack_category", { length: 100 }).notNull(),
  minConfidenceThreshold: integer("min_confidence_threshold").default(40),
  tpCount: integer("tp_count").default(0),
  fpCount: integer("fp_count").default(0),
  benignCount: integer("benign_count").default(0),
  fewShotExamples: jsonb("few_shot_examples").$type<Array<{ event: string; category: string; confidence: number; explanation: string }>>().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantCategoryUniq: unique("category_thresholds_tenant_category_uniq").on(t.tenantId, t.attackCategory),
}));

export const insertCategoryConfidenceThresholdSchema = createInsertSchema(categoryConfidenceThresholds).omit({ id: true, updatedAt: true });
export type CategoryConfidenceThreshold = typeof categoryConfidenceThresholds.$inferSelect;

// ── Log Investigation Sessions (Task #162) ───────────────────────────────────
export const investigationSessions = pgTable("investigation_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  analystId: varchar("analyst_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sourceMode: varchar("source_mode", { length: 20 }).notNull().default("live"),
  queryParams: jsonb("query_params").$type<Record<string, any>>().default({}),
  lastRunAt: timestamp("last_run_at"),
  resultCount: integer("result_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvestigationSessionSchema = createInsertSchema(investigationSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvestigationSession = z.infer<typeof insertInvestigationSessionSchema>;
export type InvestigationSession = typeof investigationSessions.$inferSelect;

export const investigationExports = pgTable("investigation_exports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => investigationSessions.id, { onDelete: "set null" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  analystId: varchar("analyst_id", { length: 255 }).notNull(),
  exportName: varchar("export_name", { length: 255 }),
  rowCount: integer("row_count").default(0),
  fileHash: varchar("file_hash", { length: 64 }),
  s3Key: varchar("s3_key", { length: 500 }),
  queryParams: jsonb("query_params").$type<Record<string, unknown>>().default({}),
  bundleData: bytea("bundle_data"),
  exportedAt: timestamp("exported_at").defaultNow().notNull(),
});

export const insertInvestigationExportSchema = createInsertSchema(investigationExports).omit({ id: true, exportedAt: true });
export type InsertInvestigationExport = z.infer<typeof insertInvestigationExportSchema>;
export type InvestigationExport = typeof investigationExports.$inferSelect;
