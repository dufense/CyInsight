import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const tenantTypeEnum = pgEnum("tenant_type", ["mssp", "customer"]);
export const roleEnum = pgEnum("user_role", ["platform_admin", "mss_admin", "mss_analyst", "customer"]);
export const severityEnum = pgEnum("severity", ["critical", "high", "medium", "low", "info"]);
export const incidentStatusEnum = pgEnum("incident_status", ["open", "investigating", "contained", "resolved", "closed"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "waiting", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["urgent", "high", "medium", "low"]);
export const projectStatusEnum = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "cancelled"]);
export const taskStatusEnum = pgEnum("task_status", ["backlog", "todo", "in_progress", "review", "done"]);
export const eventTypeEnum = pgEnum("event_type", ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud"]);
export const reportTypeEnum = pgEnum("report_type", ["executive_summary", "endpoint", "email", "vulnerability", "compliance", "threat_intelligence", "incident_response", "cloud_security"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
