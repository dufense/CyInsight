import {
  tenants, tenantUsers, incidents, tickets, ticketComments,
  projects, tasks, reports, securityEvents,
  services, slaDefinitions, teamMembers, shiftRosters, documents,
  superadmins, licenses, ticketFeedback, ticketAttachments,
  securityIntegrations, assets,
  type Tenant, type InsertTenant,
  type TenantUser, type InsertTenantUser,
  type Incident, type InsertIncident,
  type Ticket, type InsertTicket,
  type TicketComment, type InsertTicketComment,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Report, type InsertReport,
  type SecurityEvent, type InsertSecurityEvent,
  type Service, type InsertService,
  type SlaDefinition, type InsertSlaDefinition,
  type TeamMember, type InsertTeamMember,
  type ShiftRoster, type InsertShiftRoster,
  type Document, type InsertDocument,
  type Superadmin, type InsertSuperadmin,
  type License, type InsertLicense,
  type TicketFeedback, type InsertTicketFeedback,
  type TicketAttachment, type InsertTicketAttachment,
  type SecurityIntegration, type InsertSecurityIntegration,
  type Asset, type InsertAsset,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  getMSSPs(): Promise<Tenant[]>;
  getChildTenants(parentId: number): Promise<Tenant[]>;
  getMSSPWithChildren(msspId: number): Promise<{ mssp: Tenant; children: Tenant[] } | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;

  getTenantUser(userId: string, tenantId: number): Promise<TenantUser | undefined>;
  getTenantUserByUserId(userId: string): Promise<TenantUser | undefined>;
  getAllTenantUsers(): Promise<TenantUser[]>;
  createTenantUser(data: InsertTenantUser): Promise<TenantUser>;

  getIncidents(tenantId: number): Promise<Incident[]>;
  getIncident(id: number): Promise<Incident | undefined>;
  createIncident(data: InsertIncident): Promise<Incident>;
  updateIncident(id: number, data: Partial<InsertIncident>): Promise<Incident>;

  getTickets(tenantId: number): Promise<Ticket[]>;
  getTicket(id: number): Promise<Ticket | undefined>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, data: Partial<InsertTicket>): Promise<Ticket>;

  getTicketComments(ticketId: number): Promise<TicketComment[]>;
  createTicketComment(data: InsertTicketComment): Promise<TicketComment>;

  getProjects(tenantId: number): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project>;

  getTasks(projectId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task>;

  getReports(tenantId: number): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(data: InsertReport): Promise<Report>;
  updateReport(id: number, data: Partial<InsertReport>): Promise<Report>;

  getSecurityEvents(tenantId: number): Promise<SecurityEvent[]>;
  getSecurityEventsByType(tenantId: number, eventType: string): Promise<SecurityEvent[]>;
  createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent>;
  createSecurityEvents(data: InsertSecurityEvent[]): Promise<SecurityEvent[]>;
  updateSecurityEvent(id: number, data: Partial<InsertSecurityEvent>): Promise<SecurityEvent>;

  getDashboardStats(tenantId: number): Promise<any>;
  getEnhancedDashboardStats(tenantId: number): Promise<any>;

  getServices(tenantId: number): Promise<Service[]>;
  getService(id: number): Promise<Service | undefined>;
  createService(data: InsertService): Promise<Service>;
  updateService(id: number, data: Partial<InsertService>): Promise<Service>;

  getSlaDefinitions(serviceId: number): Promise<SlaDefinition[]>;
  getSlaDefinition(id: number): Promise<SlaDefinition | undefined>;
  createSlaDefinition(data: InsertSlaDefinition): Promise<SlaDefinition>;
  updateSlaDefinition(id: number, data: Partial<InsertSlaDefinition>): Promise<SlaDefinition>;
  deleteSlaDefinition(id: number): Promise<void>;

  getTeamMembers(tenantId: number): Promise<TeamMember[]>;
  getTeamMembersByType(tenantId: number, teamType: string): Promise<TeamMember[]>;
  getTeamMember(id: number): Promise<TeamMember | undefined>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, data: Partial<InsertTeamMember>): Promise<TeamMember>;

  getShiftRosters(tenantId: number): Promise<ShiftRoster[]>;
  getShiftRostersByDate(tenantId: number, startDate: Date, endDate: Date): Promise<ShiftRoster[]>;
  createShiftRoster(data: InsertShiftRoster): Promise<ShiftRoster>;
  updateShiftRoster(id: number, data: Partial<InsertShiftRoster>): Promise<ShiftRoster>;
  deleteShiftRoster(id: number): Promise<void>;

  getDocuments(tenantId: number): Promise<Document[]>;
  getDocumentsByCategory(tenantId: number, category: string): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  getSuperadminByUsername(username: string): Promise<Superadmin | undefined>;
  createSuperadmin(data: InsertSuperadmin): Promise<Superadmin>;
  updateSuperadminLastLogin(id: number): Promise<void>;

  getLicenses(): Promise<License[]>;
  getLicensesByTenant(tenantId: number): Promise<License[]>;
  getLicense(id: number): Promise<License | undefined>;
  createLicense(data: InsertLicense): Promise<License>;
  updateLicense(id: number, data: Partial<InsertLicense>): Promise<License>;
  deleteLicense(id: number): Promise<void>;

  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: number): Promise<void>;
  getTenantUsersByTenant(tenantId: number): Promise<TenantUser[]>;
  updateTenantUser(id: number, data: Partial<InsertTenantUser>): Promise<TenantUser>;
  deleteTenantUser(id: number): Promise<void>;

  getTicketFeedback(ticketId: number): Promise<TicketFeedback[]>;
  getTicketFeedbackByUser(ticketId: number, userId: string): Promise<TicketFeedback | undefined>;
  createTicketFeedback(data: InsertTicketFeedback): Promise<TicketFeedback>;

  getTicketAttachments(ticketId: number): Promise<TicketAttachment[]>;
  createTicketAttachment(data: InsertTicketAttachment): Promise<TicketAttachment>;
  deleteTicketAttachment(id: number): Promise<void>;

  getSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]>;
  getSecurityIntegration(id: number): Promise<SecurityIntegration | undefined>;
  createSecurityIntegration(data: InsertSecurityIntegration): Promise<SecurityIntegration>;
  updateSecurityIntegration(id: number, data: Partial<InsertSecurityIntegration>): Promise<SecurityIntegration>;
  deleteSecurityIntegration(id: number): Promise<void>;

  getAssets(tenantId: number): Promise<Asset[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(data: InsertAsset): Promise<Asset>;
  createAssets(data: InsertAsset[]): Promise<Asset[]>;
  updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset>;
  getAssetsByHostnames(tenantId: number, hostnames: string[]): Promise<Asset[]>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getMSSPs(): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.type, "mssp")).orderBy(tenants.name);
  }

  async getChildTenants(parentId: number): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.parentId, parentId)).orderBy(tenants.name);
  }

  async getMSSPWithChildren(msspId: number): Promise<{ mssp: Tenant; children: Tenant[] } | undefined> {
    const mssp = await this.getTenant(msspId);
    if (!mssp || mssp.type !== "mssp") return undefined;
    const children = await this.getChildTenants(msspId);
    return { mssp, children };
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async getTenantUser(userId: string, tenantId: number): Promise<TenantUser | undefined> {
    const [tu] = await db.select().from(tenantUsers)
      .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)));
    return tu;
  }

  async getTenantUserByUserId(userId: string): Promise<TenantUser | undefined> {
    const [tu] = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, userId));
    return tu;
  }

  async getAllTenantUsers(): Promise<TenantUser[]> {
    return db.select().from(tenantUsers);
  }

  async createTenantUser(data: InsertTenantUser): Promise<TenantUser> {
    const [tu] = await db.insert(tenantUsers).values(data).returning();
    return tu;
  }

  async getIncidents(tenantId: number): Promise<Incident[]> {
    return db.select().from(incidents)
      .where(eq(incidents.tenantId, tenantId))
      .orderBy(desc(incidents.createdAt));
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, id));
    return inc;
  }

  async createIncident(data: InsertIncident): Promise<Incident> {
    const [inc] = await db.insert(incidents).values(data).returning();
    return inc;
  }

  async updateIncident(id: number, data: Partial<InsertIncident>): Promise<Incident> {
    const [inc] = await db.update(incidents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    return inc;
  }

  async getTickets(tenantId: number): Promise<Ticket[]> {
    return db.select().from(tickets)
      .where(eq(tickets.tenantId, tenantId))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async createTicket(data: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(data).returning();
    return ticket;
  }

  async updateTicket(id: number, data: Partial<InsertTicket>): Promise<Ticket> {
    const [ticket] = await db.update(tickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return ticket;
  }

  async getTicketComments(ticketId: number): Promise<TicketComment[]> {
    return db.select().from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(ticketComments.createdAt);
  }

  async createTicketComment(data: InsertTicketComment): Promise<TicketComment> {
    const [comment] = await db.insert(ticketComments).values(data).returning();
    return comment;
  }

  async getProjects(tenantId: number): Promise<Project[]> {
    return db.select().from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project> {
    const [project] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async getTasks(projectId: number): Promise<Task[]> {
    return db.select().from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(tasks.createdAt);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task> {
    const [task] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async getReports(tenantId: number): Promise<Report[]> {
    return db.select().from(reports)
      .where(eq(reports.tenantId, tenantId))
      .orderBy(desc(reports.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }

  async updateReport(id: number, data: Partial<InsertReport>): Promise<Report> {
    const [report] = await db.update(reports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async getSecurityEvents(tenantId: number): Promise<SecurityEvent[]> {
    return db.select().from(securityEvents)
      .where(eq(securityEvents.tenantId, tenantId))
      .orderBy(desc(securityEvents.occurredAt));
  }

  async getSecurityEventsByType(tenantId: number, eventType: string): Promise<SecurityEvent[]> {
    return db.select().from(securityEvents)
      .where(and(eq(securityEvents.tenantId, tenantId), eq(securityEvents.eventType, eventType as any)))
      .orderBy(desc(securityEvents.occurredAt));
  }

  async createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent> {
    const [event] = await db.insert(securityEvents).values(data).returning();
    return event;
  }

  async createSecurityEvents(data: InsertSecurityEvent[]): Promise<SecurityEvent[]> {
    if (data.length === 0) return [];
    return db.insert(securityEvents).values(data).returning();
  }

  async updateSecurityEvent(id: number, data: Partial<InsertSecurityEvent>): Promise<SecurityEvent> {
    const [event] = await db.update(securityEvents).set(data).where(eq(securityEvents.id, id)).returning();
    return event;
  }

  async getDashboardStats(tenantId: number): Promise<any> {
    const allIncidents = await this.getIncidents(tenantId);
    const allTickets = await this.getTickets(tenantId);

    const totalIncidents = allIncidents.length;
    const openIncidents = allIncidents.filter(i => i.status === "open" || i.status === "investigating").length;
    const resolvedIncidents = allIncidents.filter(i => i.status === "resolved" || i.status === "closed").length;
    const criticalIncidents = allIncidents.filter(i => i.severity === "critical").length;
    const totalTickets = allTickets.length;
    const openTickets = allTickets.filter(t => t.status === "open" || t.status === "in_progress").length;

    const severityMap: Record<string, number> = {};
    const categoryMap: Record<string, number> = {};
    allIncidents.forEach(inc => {
      severityMap[inc.severity] = (severityMap[inc.severity] || 0) + 1;
      if (inc.category) {
        categoryMap[inc.category] = (categoryMap[inc.category] || 0) + 1;
      }
    });

    const severityBreakdown = Object.entries(severityMap).map(([name, value]) => ({ name, value }));
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const incidentTrend = months.map((month, idx) => {
      const total = Math.max(5, Math.floor(totalIncidents / 6) + Math.floor(Math.random() * 8) - 3);
      const resolved = Math.floor(total * (0.5 + Math.random() * 0.4));
      return { month, incidents: total, resolved };
    });

    const recentIncidents = allIncidents.slice(0, 5).map(inc => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      status: inc.status,
      createdAt: inc.createdAt.toISOString(),
    }));

    return {
      totalIncidents,
      openIncidents,
      resolvedIncidents,
      criticalIncidents,
      totalTickets,
      openTickets,
      incidentTrend,
      severityBreakdown,
      categoryBreakdown,
      recentIncidents,
    };
  }

  async getIncidentsForTenants(tenantIds: number[]): Promise<Incident[]> {
    if (tenantIds.length === 0) return [];
    if (tenantIds.length === 1) return this.getIncidents(tenantIds[0]);
    return db.select().from(incidents)
      .where(inArray(incidents.tenantId, tenantIds))
      .orderBy(desc(incidents.createdAt));
  }

  async getSecurityEventsForTenants(tenantIds: number[]): Promise<SecurityEvent[]> {
    if (tenantIds.length === 0) return [];
    if (tenantIds.length === 1) return this.getSecurityEvents(tenantIds[0]);
    return db.select().from(securityEvents)
      .where(inArray(securityEvents.tenantId, tenantIds))
      .orderBy(desc(securityEvents.occurredAt));
  }

  async getTicketsForTenants(tenantIds: number[]): Promise<Ticket[]> {
    if (tenantIds.length === 0) return [];
    if (tenantIds.length === 1) return this.getTickets(tenantIds[0]);
    return db.select().from(tickets)
      .where(inArray(tickets.tenantId, tenantIds))
      .orderBy(desc(tickets.createdAt));
  }

  async getEnhancedDashboardStats(tenantId: number): Promise<any> {
    const tenant = await this.getTenant(tenantId);
    let tenantIds = [tenantId];
    if (tenant && tenant.type === "mssp") {
      const children = await this.getChildTenants(tenantId);
      if (children.length > 0) {
        tenantIds = [tenantId, ...children.map(c => c.id)];
      }
    }

    const allEvents = await this.getSecurityEventsForTenants(tenantIds);
    const allIncidents = await this.getIncidentsForTenants(tenantIds);
    const allTickets = await this.getTicketsForTenants(tenantIds);

    const totalIncidents = allIncidents.length;
    const openIncidents = allIncidents.filter(i => i.status === "open" || i.status === "investigating").length;
    const resolvedIncidents = allIncidents.filter(i => i.status === "resolved" || i.status === "closed").length;
    const criticalIncidents = allIncidents.filter(i => i.severity === "critical").length;
    const totalTickets = allTickets.length;
    const openTickets = allTickets.filter(t => t.status === "open" || t.status === "in_progress").length;
    const totalEvents = allEvents.length;

    const topN = (map: Record<string, number>, n = 10) =>
      Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

    const cleanSingleTactic = (raw: string): string => {
      let t = raw.replace(/^\[?'?/, "").replace(/'?\]?$/, "").trim();
      t = t.replace(/^TA\d{4}\s*-\s*/, "");
      t = t.replace(/^T\d{4}(\.\d+)?\s*-\s*/, "");
      t = t.replace(/['\[\]]/g, "").trim();
      if (t.length > 35) t = t.substring(0, 35);
      return t;
    };

    const splitAndClean = (raw: string): string[] => {
      if (!raw) return [];
      const parts = raw.replace(/^\[/, "").replace(/\]$/, "").split(/[,']/).map(p => p.trim()).filter(p => p.length > 2);
      const cleaned: string[] = [];
      for (const p of parts) {
        const c = cleanSingleTactic(p);
        if (c.length > 2 && !c.match(/^TA\d{4}$/) && !c.match(/^T\d{4}/)) cleaned.push(c);
      }
      return cleaned.length > 0 ? cleaned : [cleanSingleTactic(raw)].filter(c => c.length > 2);
    };

    const countBy = (items: any[], key: string) => {
      const m: Record<string, number> = {};
      items.forEach(i => { const v = i[key]; if (v) m[v] = (m[v] || 0) + 1; });
      return m;
    };

    const countByCleanSplit = (items: any[], key: string) => {
      const m: Record<string, number> = {};
      items.forEach(i => {
        const v = i[key];
        if (!v) return;
        const labels = splitAndClean(v);
        labels.forEach(l => { m[l] = (m[l] || 0) + 1; });
      });
      return m;
    };

    const severityBreakdown = Object.entries(countBy(allIncidents, "severity")).map(([name, value]) => ({ name, value }));
    const categoryBreakdown = topN(countByCleanSplit(allIncidents, "category"), 10).map(({ name, count }) => ({ category: name, count }));

    const eventsByType = Object.entries(countBy(allEvents, "eventType")).map(([type, count]) => ({ type, count }));
    const eventsBySeverity = Object.entries(countBy(allEvents, "severity")).map(([name, value]) => ({ name, value }));

    const threatMap = countBy(allEvents, "threat");
    const targetMap = countBy(allEvents, "target");
    const attackerMap = countBy(allEvents, "attacker");
    const appMap = countBy(allEvents, "app");

    const topThreats = topN(threatMap);
    const topTargets = topN(targetMap);
    const topAttackers = topN(attackerMap);
    const topVulnerableApps = topN(appMap);

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthNames[d.getMonth()]);
    }

    const eventTrendMap: Record<string, Record<string, number>> = {};
    months.forEach(m => { eventTrendMap[m] = { email: 0, endpoint: 0, vulnerability: 0, casb: 0, waf: 0, dlp: 0, sse: 0, network: 0, identity: 0, cloud: 0 }; });
    allEvents.forEach(ev => {
      const m = monthNames[ev.occurredAt.getMonth()];
      if (eventTrendMap[m]) eventTrendMap[m][ev.eventType] = (eventTrendMap[m][ev.eventType] || 0) + 1;
    });
    const eventTrend = months.map(month => {
      const c = eventTrendMap[month];
      return { month, ...c, total: Object.values(c).reduce((s, v) => s + v, 0) };
    });

    const incidentTrendMap: Record<string, { incidents: number; resolved: number }> = {};
    months.forEach(m => { incidentTrendMap[m] = { incidents: 0, resolved: 0 }; });
    allIncidents.forEach(inc => {
      const m = monthNames[inc.createdAt.getMonth()];
      if (incidentTrendMap[m]) {
        incidentTrendMap[m].incidents++;
        if (inc.status === "resolved" || inc.status === "closed") {
          incidentTrendMap[m].resolved++;
        }
      }
    });
    const incidentTrend = months.map(month => ({
      month,
      incidents: incidentTrendMap[month].incidents,
      resolved: incidentTrendMap[month].resolved,
    }));

    const recentIncidents = allIncidents.slice(0, 5).map(inc => ({
      id: inc.id, title: inc.title, severity: inc.severity, status: inc.status, createdAt: inc.createdAt.toISOString(),
    }));

    const vulnEvents = allEvents.filter(e => e.eventType === "vulnerability");
    const vulnerabilitySeverity = Object.entries(countBy(vulnEvents, "severity")).map(([name, value]) => ({ name, value }));

    const avgRiskScore = allEvents.length > 0
      ? Math.round(allEvents.reduce((s, e) => s + (e.riskScore || 0), 0) / allEvents.filter(e => e.riskScore).length)
      : 0;
    const criticalEvents = allEvents.filter(e => e.severity === "critical").length;
    const blockedEvents = allEvents.filter(e => {
      const a = (e.action || "").toLowerCase();
      if (a.includes("no auto-remediation") || a.includes("no remediation") || a === "no action") return false;
      return a.includes("remediat") || a.includes("blocked") || a.includes("quarantin") || a.includes("isolat") || a.includes("dropped");
    }).length;

    let mttrHours = 0;
    if (resolvedIncidents > 0) {
      const resolvedIncs = allIncidents.filter(i => (i.status === "resolved" || i.status === "closed") && i.resolvedAt);
      if (resolvedIncs.length > 0) {
        const totalMs = resolvedIncs.reduce((sum, i) => {
          const created = new Date(i.createdAt).getTime();
          const resolved = new Date(i.resolvedAt!).getTime();
          return sum + Math.max(0, resolved - created);
        }, 0);
        mttrHours = Math.round(totalMs / resolvedIncs.length / 3600000);
      }
    }
    const mttdMinutes = allEvents.length > 0 ? Math.round(allEvents.reduce((sum, e) => {
      const occurred = new Date(e.occurredAt).getTime();
      const created = new Date(e.createdAt!).getTime();
      return sum + Math.max(0, created - occurred);
    }, 0) / allEvents.length / 60000) : 0;

    const threatVectorMap = countBy(allEvents, "threatVector");
    const incidentsByThreatVector = topN(threatVectorMap, 12);

    const mitreMap = countByCleanSplit(allEvents, "mitreTactic");
    const mitreTactics = Object.entries(mitreMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const mitreTechMap = countByCleanSplit(allEvents, "mitreTechnique");
    const topMitreTechniques = topN(mitreTechMap, 10);

    const actionMap = countBy(allEvents, "action");
    const incidentsByAction = Object.entries(actionMap).map(([name, value]) => ({ name, value }));

    const emailEvents = allEvents.filter(e => e.eventType === "email");
    const emailByThreat = topN(countBy(emailEvents, "threat"), 10);
    const topSenders = topN(countBy(emailEvents, "sender"), 10);
    const topRecipients = topN(countBy(emailEvents, "recipient"), 10);
    const emailActionMap = countBy(emailEvents, "action");
    const emailActions = Object.entries(emailActionMap).map(([name, value]) => ({ name, value }));
    const emailSeverity = Object.entries(countBy(emailEvents, "severity")).map(([name, value]) => ({ name, value }));
    const emailThreatVectors = topN(countBy(emailEvents, "threatVector"), 6);

    const cleanLogSource = (items: any[]) => {
      const m: Record<string, number> = {};
      items.forEach(i => {
        let v = i.logSource;
        if (!v) return;
        if (v.startsWith("[{") || v.startsWith("['{") || v.startsWith("[{'")) {
          const tagMatch = v.match(/tag_name['"]\s*:\s*['"]([^'"]+)/);
          v = tagMatch ? tagMatch[1].replace(/^(DS|DT|DOM|EG):/, "").trim() : "Unknown Source";
        }
        if (v.length > 40) v = v.substring(0, 40);
        m[v] = (m[v] || 0) + 1;
      });
      return m;
    };

    const endpointEvents = allEvents;
    const endpointByThreat = topN(countBy(endpointEvents, "threat"), 10);
    const endpointActions = Object.entries(countBy(endpointEvents, "action")).map(([name, value]) => ({ name, value }));
    const topInfectedHosts = topN(countBy(endpointEvents, "target"), 10);
    const endpointLogSources = topN(cleanLogSource(endpointEvents), 6);
    const endpointThreatVectors = topN(countBy(endpointEvents, "threatVector"), 8);
    const isAutoRemediated = (a: string) => {
      const al = a.toLowerCase();
      if (al.includes("no auto-remediation") || al.includes("no remediation")) return false;
      return al === "auto-remediation applied" || al.includes("auto remediat");
    };
    const isRemediated = (a: string) => {
      const al = a.toLowerCase();
      if (al.includes("no auto-remediation") || al.includes("no remediation") || al === "no action") return false;
      return al.includes("remediat") || al.includes("blocked") || al.includes("quarantin") || al.includes("clean") || al.includes("drop") || al.includes("isolat");
    };
    const autoRemediatedCount = allEvents.filter(e => isAutoRemediated(e.action || "")).length;
    const manualRemediatedCount = allEvents.filter(e => {
      const a = e.action || "";
      return isRemediated(a) && !isAutoRemediated(a);
    }).length;
    const remediatedCount = autoRemediatedCount + manualRemediatedCount;
    const noRemediationCount = allEvents.length - remediatedCount;
    const autoRemediationPct = remediatedCount > 0 ? Math.round((autoRemediatedCount / remediatedCount) * 100) : 0;

    const casbEvents = allEvents.filter(e => e.eventType === "casb");
    const wafEvents = allEvents.filter(e => e.eventType === "waf");
    const dlpEvents = allEvents.filter(e => e.eventType === "dlp");
    const sseEvents = allEvents.filter(e => e.eventType === "sse");
    const networkEvents = allEvents.filter(e => e.eventType === "network");
    const identityEvents = allEvents.filter(e => e.eventType === "identity");
    const cloudEvents = allEvents.filter(e => e.eventType === "cloud");

    const casbApps = topN(countBy(casbEvents, "app"), 10);
    const casbActions = Object.entries(countBy(casbEvents, "action")).map(([name, value]) => ({ name, value }));

    const wafAttackTypes = topN(countBy(wafEvents, "threat"), 10);
    const wafActions = Object.entries(countBy(wafEvents, "action")).map(([name, value]) => ({ name, value }));
    const wafTargets = topN(countBy(wafEvents, "target"), 6);

    const dlpByThreat = topN(countBy(dlpEvents, "threat"), 6);
    const dlpActions = Object.entries(countBy(dlpEvents, "action")).map(([name, value]) => ({ name, value }));

    const networkByThreat = topN(countBy(networkEvents, "threat"), 10);
    const networkProtocols = Object.entries(countBy(networkEvents, "protocol")).map(([name, value]) => ({ name, value }));

    const identityByThreat = topN(countBy(identityEvents, "threat"), 10);
    const identityActions = Object.entries(countBy(identityEvents, "action")).map(([name, value]) => ({ name, value }));

    const cloudByThreat = topN(countBy(cloudEvents, "threat"), 10);
    const cloudApps = topN(countBy(cloudEvents, "app"), 6);

    const logSourceMap = cleanLogSource(allEvents);
    const topLogSources = topN(logSourceMap, 15);
    const sourceTypeMap = countBy(allEvents, "sourceType");
    const sourceTypes = Object.entries(sourceTypeMap).map(([name, value]) => ({ name, value }));

    const logTrendMap: Record<string, number> = {};
    months.forEach(m => { logTrendMap[m] = 0; });
    allEvents.forEach(ev => {
      const m = monthNames[ev.occurredAt.getMonth()];
      if (logTrendMap[m] !== undefined) logTrendMap[m]++;
    });
    const logIngestionTrend = months.map(month => ({ month, events: logTrendMap[month] }));

    const countryMap = countBy(allEvents.filter(e => e.country), "country");
    const topCountries = topN(countryMap, 10);

    let complianceScore = 0;
    if (totalIncidents === 0 && totalEvents === 0) {
      complianceScore = 0;
    } else {
      const resolutionRate = totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 50;
      const criticalPenalty = totalIncidents > 0 ? Math.min(30, (criticalIncidents / totalIncidents) * 100) : 0;
      const openPenalty = totalIncidents > 0 ? Math.min(20, (openIncidents / totalIncidents) * 60) : 0;
      const eventSeverityPenalty = totalEvents > 0 ? Math.min(15, (criticalEvents / totalEvents) * 50) : 0;
      complianceScore = Math.round(Math.max(0, Math.min(100,
        resolutionRate * 0.5 + 50 - criticalPenalty - openPenalty - eventSeverityPenalty
      )));
    }

    return {
      totalIncidents, openIncidents, resolvedIncidents, criticalIncidents,
      totalTickets, openTickets, totalEvents, avgRiskScore, criticalEvents, blockedEvents,
      mttrHours, mttdMinutes, complianceScore,
      incidentTrend, severityBreakdown, categoryBreakdown, recentIncidents,
      eventsByType, eventsBySeverity, eventTrend,
      topThreats, topTargets, topAttackers, topVulnerableApps, vulnerabilitySeverity,
      incidentsByThreatVector, mitreTactics, topMitreTechniques, incidentsByAction,
      emailByThreat, topSenders, topRecipients, emailActions, emailSeverity, emailThreatVectors, emailTotal: emailEvents.length,
      endpointByThreat, endpointActions, topInfectedHosts, endpointLogSources, endpointThreatVectors, endpointTotal: endpointEvents.length,
      remediatedCount, noRemediationCount, autoRemediatedCount, manualRemediatedCount, autoRemediationPct,
      casbApps, casbActions, casbTotal: casbEvents.length,
      wafAttackTypes, wafActions, wafTargets, wafTotal: wafEvents.length,
      dlpByThreat, dlpActions, dlpTotal: dlpEvents.length,
      sseTotal: sseEvents.length,
      networkByThreat, networkProtocols, networkTotal: networkEvents.length,
      identityByThreat, identityActions, identityTotal: identityEvents.length,
      cloudByThreat, cloudApps, cloudTotal: cloudEvents.length,
      topLogSources, sourceTypes, logIngestionTrend, topCountries,
    };
  }

  async getServices(tenantId: number): Promise<Service[]> {
    return db.select().from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(desc(services.createdAt));
  }

  async getService(id: number): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service;
  }

  async createService(data: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(data).returning();
    return service;
  }

  async updateService(id: number, data: Partial<InsertService>): Promise<Service> {
    const [service] = await db.update(services)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async getSlaDefinitions(serviceId: number): Promise<SlaDefinition[]> {
    return db.select().from(slaDefinitions)
      .where(eq(slaDefinitions.serviceId, serviceId))
      .orderBy(slaDefinitions.priority);
  }

  async getSlaDefinition(id: number): Promise<SlaDefinition | undefined> {
    const [sla] = await db.select().from(slaDefinitions).where(eq(slaDefinitions.id, id));
    return sla;
  }

  async createSlaDefinition(data: InsertSlaDefinition): Promise<SlaDefinition> {
    const [sla] = await db.insert(slaDefinitions).values(data).returning();
    return sla;
  }

  async updateSlaDefinition(id: number, data: Partial<InsertSlaDefinition>): Promise<SlaDefinition> {
    const [sla] = await db.update(slaDefinitions)
      .set(data)
      .where(eq(slaDefinitions.id, id))
      .returning();
    return sla;
  }

  async deleteSlaDefinition(id: number): Promise<void> {
    await db.delete(slaDefinitions).where(eq(slaDefinitions.id, id));
  }

  async getTeamMembers(tenantId: number): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(eq(teamMembers.tenantId, tenantId))
      .orderBy(teamMembers.name);
  }

  async getTeamMembersByType(tenantId: number, teamType: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.teamType, teamType as any)))
      .orderBy(teamMembers.name);
  }

  async getTeamMember(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async updateTeamMember(id: number, data: Partial<InsertTeamMember>): Promise<TeamMember> {
    const [member] = await db.update(teamMembers)
      .set(data)
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async getShiftRosters(tenantId: number): Promise<ShiftRoster[]> {
    return db.select().from(shiftRosters)
      .where(eq(shiftRosters.tenantId, tenantId))
      .orderBy(desc(shiftRosters.shiftDate));
  }

  async getShiftRostersByDate(tenantId: number, startDate: Date, endDate: Date): Promise<ShiftRoster[]> {
    return db.select().from(shiftRosters)
      .where(and(
        eq(shiftRosters.tenantId, tenantId),
        gte(shiftRosters.shiftDate, startDate),
        lte(shiftRosters.shiftDate, endDate)
      ))
      .orderBy(shiftRosters.shiftDate);
  }

  async createShiftRoster(data: InsertShiftRoster): Promise<ShiftRoster> {
    const [shift] = await db.insert(shiftRosters).values(data).returning();
    return shift;
  }

  async updateShiftRoster(id: number, data: Partial<InsertShiftRoster>): Promise<ShiftRoster> {
    const [shift] = await db.update(shiftRosters)
      .set(data)
      .where(eq(shiftRosters.id, id))
      .returning();
    return shift;
  }

  async deleteShiftRoster(id: number): Promise<void> {
    await db.delete(shiftRosters).where(eq(shiftRosters.id, id));
  }

  async getDocuments(tenantId: number): Promise<Document[]> {
    return db.select().from(documents)
      .where(eq(documents.tenantId, tenantId))
      .orderBy(desc(documents.updatedAt));
  }

  async getDocumentsByCategory(tenantId: number, category: string): Promise<Document[]> {
    return db.select().from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.category, category as any)))
      .orderBy(desc(documents.updatedAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
    const [doc] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return doc;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getSuperadminByUsername(username: string): Promise<Superadmin | undefined> {
    const [admin] = await db.select().from(superadmins).where(eq(superadmins.username, username));
    return admin;
  }

  async createSuperadmin(data: InsertSuperadmin): Promise<Superadmin> {
    const [admin] = await db.insert(superadmins).values(data).returning();
    return admin;
  }

  async updateSuperadminLastLogin(id: number): Promise<void> {
    await db.update(superadmins).set({ lastLoginAt: new Date() }).where(eq(superadmins.id, id));
  }

  async getLicenses(): Promise<License[]> {
    return db.select().from(licenses).orderBy(desc(licenses.createdAt));
  }

  async getLicensesByTenant(tenantId: number): Promise<License[]> {
    return db.select().from(licenses).where(eq(licenses.tenantId, tenantId)).orderBy(desc(licenses.createdAt));
  }

  async getLicense(id: number): Promise<License | undefined> {
    const [license] = await db.select().from(licenses).where(eq(licenses.id, id));
    return license;
  }

  async createLicense(data: InsertLicense): Promise<License> {
    const [license] = await db.insert(licenses).values(data).returning();
    return license;
  }

  async updateLicense(id: number, data: Partial<InsertLicense>): Promise<License> {
    const [license] = await db.update(licenses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(licenses.id, id))
      .returning();
    return license;
  }

  async deleteLicense(id: number): Promise<void> {
    await db.delete(licenses).where(eq(licenses.id, id));
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [tenant] = await db.update(tenants)
      .set(data)
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  }

  async deleteTenant(id: number): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getTenantUsersByTenant(tenantId: number): Promise<TenantUser[]> {
    return db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId)).orderBy(tenantUsers.createdAt);
  }

  async updateTenantUser(id: number, data: Partial<InsertTenantUser>): Promise<TenantUser> {
    const [tu] = await db.update(tenantUsers)
      .set(data)
      .where(eq(tenantUsers.id, id))
      .returning();
    return tu;
  }

  async deleteTenantUser(id: number): Promise<void> {
    await db.delete(tenantUsers).where(eq(tenantUsers.id, id));
  }

  async getTicketFeedback(ticketId: number): Promise<TicketFeedback[]> {
    return db.select().from(ticketFeedback).where(eq(ticketFeedback.ticketId, ticketId)).orderBy(desc(ticketFeedback.createdAt));
  }

  async getTicketFeedbackByUser(ticketId: number, userId: string): Promise<TicketFeedback | undefined> {
    const [fb] = await db.select().from(ticketFeedback).where(and(eq(ticketFeedback.ticketId, ticketId), eq(ticketFeedback.userId, userId)));
    return fb;
  }

  async createTicketFeedback(data: InsertTicketFeedback): Promise<TicketFeedback> {
    const [fb] = await db.insert(ticketFeedback).values(data).returning();
    return fb;
  }

  async getTicketAttachments(ticketId: number): Promise<TicketAttachment[]> {
    return db.select().from(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId)).orderBy(desc(ticketAttachments.createdAt));
  }

  async createTicketAttachment(data: InsertTicketAttachment): Promise<TicketAttachment> {
    const [att] = await db.insert(ticketAttachments).values(data).returning();
    return att;
  }

  async deleteTicketAttachment(id: number): Promise<void> {
    await db.delete(ticketAttachments).where(eq(ticketAttachments.id, id));
  }

  async getSecurityIntegrations(tenantId: number): Promise<SecurityIntegration[]> {
    return db.select().from(securityIntegrations).where(eq(securityIntegrations.tenantId, tenantId)).orderBy(securityIntegrations.platformName);
  }

  async getSecurityIntegration(id: number): Promise<SecurityIntegration | undefined> {
    const [integration] = await db.select().from(securityIntegrations).where(eq(securityIntegrations.id, id));
    return integration;
  }

  async createSecurityIntegration(data: InsertSecurityIntegration): Promise<SecurityIntegration> {
    const [integration] = await db.insert(securityIntegrations).values(data).returning();
    return integration;
  }

  async updateSecurityIntegration(id: number, data: Partial<InsertSecurityIntegration>): Promise<SecurityIntegration> {
    const [integration] = await db.update(securityIntegrations).set(data).where(eq(securityIntegrations.id, id)).returning();
    return integration;
  }

  async deleteSecurityIntegration(id: number): Promise<void> {
    await db.delete(securityIntegrations).where(eq(securityIntegrations.id, id));
  }

  async getAssets(tenantId: number): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.tenantId, tenantId)).orderBy(assets.hostname);
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    return asset;
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values(data).returning();
    return asset;
  }

  async createAssets(data: InsertAsset[]): Promise<Asset[]> {
    if (data.length === 0) return [];
    const batchSize = 500;
    const results: Asset[] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const inserted = await db.insert(assets).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
  }

  async updateAsset(id: number, data: Partial<InsertAsset>): Promise<Asset> {
    const [asset] = await db.update(assets).set({ ...data, updatedAt: new Date() }).where(eq(assets.id, id)).returning();
    return asset;
  }

  async getAssetsByHostnames(tenantId: number, hostnames: string[]): Promise<Asset[]> {
    if (hostnames.length === 0) return [];
    return db.select().from(assets).where(and(eq(assets.tenantId, tenantId), inArray(assets.hostname, hostnames)));
  }
}

export const storage = new DatabaseStorage();
