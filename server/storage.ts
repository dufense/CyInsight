import {
  tenants, tenantUsers, incidents, tickets, ticketComments,
  projects, tasks, reports, securityEvents,
  services, slaDefinitions, teamMembers, shiftRosters,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, gte, lte } from "drizzle-orm";

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

  async getEnhancedDashboardStats(tenantId: number): Promise<any> {
    const allEvents = await this.getSecurityEvents(tenantId);
    const allIncidents = await this.getIncidents(tenantId);
    const allTickets = await this.getTickets(tenantId);

    const totalIncidents = allIncidents.length;
    const openIncidents = allIncidents.filter(i => i.status === "open" || i.status === "investigating").length;
    const resolvedIncidents = allIncidents.filter(i => i.status === "resolved" || i.status === "closed").length;
    const criticalIncidents = allIncidents.filter(i => i.severity === "critical").length;
    const totalTickets = allTickets.length;
    const openTickets = allTickets.filter(t => t.status === "open" || t.status === "in_progress").length;
    const totalEvents = allEvents.length;

    const topN = (map: Record<string, number>, n = 10) =>
      Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

    const countBy = (items: any[], key: string) => {
      const m: Record<string, number> = {};
      items.forEach(i => { const v = i[key]; if (v) m[v] = (m[v] || 0) + 1; });
      return m;
    };

    const severityBreakdown = Object.entries(countBy(allIncidents, "severity")).map(([name, value]) => ({ name, value }));
    const categoryBreakdown = topN(countBy(allIncidents, "category"), 8).map(({ name, count }) => ({ category: name, count }));

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

    const incidentTrend = months.map(month => {
      const total = Math.max(3, Math.floor(totalIncidents / 6) + Math.floor(Math.random() * 6) - 2);
      const resolved = Math.floor(total * (0.5 + Math.random() * 0.4));
      return { month, incidents: total, resolved };
    });

    const recentIncidents = allIncidents.slice(0, 5).map(inc => ({
      id: inc.id, title: inc.title, severity: inc.severity, status: inc.status, createdAt: inc.createdAt.toISOString(),
    }));

    const vulnEvents = allEvents.filter(e => e.eventType === "vulnerability");
    const vulnerabilitySeverity = Object.entries(countBy(vulnEvents, "severity")).map(([name, value]) => ({ name, value }));

    const avgRiskScore = allEvents.length > 0
      ? Math.round(allEvents.reduce((s, e) => s + (e.riskScore || 0), 0) / allEvents.filter(e => e.riskScore).length)
      : 0;
    const criticalEvents = allEvents.filter(e => e.severity === "critical").length;
    const blockedEvents = allEvents.filter(e => e.action === "blocked" || e.action === "dropped").length;

    const mttrHours = resolvedIncidents > 0 ? Math.round(2.4 + Math.random() * 6) : 0;
    const mttdMinutes = allEvents.length > 0 ? Math.round(8 + Math.random() * 25) : 0;

    const threatVectorMap = countBy(allEvents, "threatVector");
    const incidentsByThreatVector = topN(threatVectorMap, 12);

    const mitreMap = countBy(allEvents, "mitreTactic");
    const mitreTactics = Object.entries(mitreMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const mitreTechMap = countBy(allEvents, "mitreTechnique");
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

    const endpointEvents = allEvents.filter(e => e.eventType === "endpoint");
    const endpointByThreat = topN(countBy(endpointEvents, "threat"), 10);
    const endpointActions = Object.entries(countBy(endpointEvents, "action")).map(([name, value]) => ({ name, value }));
    const topInfectedHosts = topN(countBy(endpointEvents, "target"), 10);
    const endpointLogSources = topN(countBy(endpointEvents, "logSource"), 6);
    const endpointThreatVectors = topN(countBy(endpointEvents, "threatVector"), 8);

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

    const logSourceMap = countBy(allEvents, "logSource");
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

    const complianceScore = Math.min(100, Math.max(40, 100 - Math.floor(criticalEvents * 1.5 + openIncidents * 2)));

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
}

export const storage = new DatabaseStorage();
