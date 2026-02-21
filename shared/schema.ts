import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
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
export const eventTypeEnum = pgEnum("event_type", ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud"]);
export const reportTypeEnum = pgEnum("report_type", ["executive_summary", "endpoint", "email", "vulnerability", "compliance", "threat_intelligence", "incident_response", "cloud_security", "asset_inventory", "threat_landscape", "sla_performance", "soc_operations", "risk_posture"]);

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: tenantTypeEnum("type").default("customer").notNull(),
  parentId: integer("parent_id"),
  logoUrl: text("logo_url"),
  industry: varchar("industry", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 255 }),
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
  resolvedAt: timestamp("resolved_at"),
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
  resolvedAt: timestamp("resolved_at"),
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
  "network_security", "endpoint_security", "siem", "soar", "other"
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
});

export const securityIntegrationsRelations = relations(securityIntegrations, ({ one }) => ({
  tenant: one(tenants, { fields: [securityIntegrations.tenantId], references: [tenants.id] }),
}));

export const insertSecurityIntegrationSchema = createInsertSchema(securityIntegrations).omit({ id: true, createdAt: true, updatedAt: true, lastPollAt: true, lastPollStatus: true, lastPollMessage: true, eventsImported: true });

export const SECURITY_PLATFORMS = [
  { key: "crowdstrike", name: "CrowdStrike Falcon", category: "edr_xdr", authType: "oauth2", description: "Endpoint detection and response platform with threat intelligence" },
  { key: "palo_alto_cortex", name: "Palo Alto Cortex XDR", category: "edr_xdr", authType: "api_key", description: "Extended detection and response across endpoints, network, and cloud" },
  { key: "checkpoint_hec", name: "Check Point Harmony Email", category: "email_security", authType: "api_key", description: "Email and collaboration security platform" },
  { key: "cynet", name: "Cynet 360", category: "edr_xdr", authType: "api_key", description: "Autonomous breach protection platform" },
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
  { key: "active_directory", name: "Microsoft Active Directory", category: "directory_services", authType: "ldap", description: "On-premises directory service for identity management" },
  { key: "azure_ad", name: "Microsoft Entra ID (Azure AD)", category: "directory_services", authType: "oauth2", description: "Cloud-based identity and access management" },
  { key: "jamf", name: "JAMF Pro", category: "directory_services", authType: "api_key", description: "Apple device management and security" },
] as const;

export const INTEGRATION_CATEGORIES = [
  { key: "edr_xdr", name: "EDR / XDR", description: "Endpoint Detection & Response / Extended Detection & Response" },
  { key: "sse_casb", name: "SSE / CASB", description: "Security Service Edge / Cloud Access Security Broker" },
  { key: "dlp", name: "DLP", description: "Data Loss Prevention" },
  { key: "email_security", name: "Email Security", description: "Email Threat Protection & Filtering" },
  { key: "waf", name: "WAF", description: "Web Application Firewall" },
  { key: "tip_easm", name: "TIP & EASM", description: "Threat Intelligence Platform & External Attack Surface Management" },
  { key: "vulnerability_management", name: "Vulnerability Management", description: "Vulnerability Assessment & Remediation" },
  { key: "directory_services", name: "Directory Services", description: "Identity & Access Management" },
  { key: "network_security", name: "Network Security", description: "Network Detection, Response & Gateway" },
  { key: "endpoint_security", name: "Endpoint Security", description: "Endpoint Protection & Management" },
  { key: "siem", name: "SIEM", description: "Security Information & Event Management" },
  { key: "soar", name: "SOAR", description: "Security Orchestration, Automation & Response" },
  { key: "other", name: "Other", description: "Other Security Solutions" },
] as const;

export const insertSuperadminSchema = createInsertSchema(superadmins).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertLicenseSchema = createInsertSchema(licenses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTicketFeedbackSchema = createInsertSchema(ticketFeedback).omit({ id: true, createdAt: true });
export const insertTicketAttachmentSchema = createInsertSchema(ticketAttachments).omit({ id: true, createdAt: true });

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
