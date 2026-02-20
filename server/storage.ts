import {
  tenants, tenantUsers, incidents, tickets, ticketComments,
  projects, tasks, reports, securityEvents,
  type Tenant, type InsertTenant,
  type TenantUser, type InsertTenantUser,
  type Incident, type InsertIncident,
  type Ticket, type InsertTicket,
  type TicketComment, type InsertTicketComment,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Report, type InsertReport,
  type SecurityEvent, type InsertSecurityEvent,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql } from "drizzle-orm";

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

    const severityMap: Record<string, number> = {};
    const categoryMap: Record<string, number> = {};
    allIncidents.forEach(inc => {
      severityMap[inc.severity] = (severityMap[inc.severity] || 0) + 1;
      if (inc.category) categoryMap[inc.category] = (categoryMap[inc.category] || 0) + 1;
    });
    const severityBreakdown = Object.entries(severityMap).map(([name, value]) => ({ name, value }));
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const eventTypeMap: Record<string, number> = {};
    const eventSeverityMap: Record<string, number> = {};
    allEvents.forEach(ev => {
      eventTypeMap[ev.eventType] = (eventTypeMap[ev.eventType] || 0) + 1;
      eventSeverityMap[ev.severity] = (eventSeverityMap[ev.severity] || 0) + 1;
    });
    const eventsByType = Object.entries(eventTypeMap).map(([type, count]) => ({ type, count }));
    const eventsBySeverity = Object.entries(eventSeverityMap).map(([name, value]) => ({ name, value }));

    const threatMap: Record<string, number> = {};
    const targetMap: Record<string, number> = {};
    const attackerMap: Record<string, number> = {};
    const appMap: Record<string, number> = {};

    allEvents.forEach(ev => {
      if (ev.threat) threatMap[ev.threat] = (threatMap[ev.threat] || 0) + 1;
      if (ev.target) targetMap[ev.target] = (targetMap[ev.target] || 0) + 1;
      if (ev.attacker) attackerMap[ev.attacker] = (attackerMap[ev.attacker] || 0) + 1;
      if (ev.app) appMap[ev.app] = (appMap[ev.app] || 0) + 1;
    });

    const topThreats = Object.entries(threatMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topTargets = Object.entries(targetMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topAttackers = Object.entries(attackerMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topVulnerableApps = Object.entries(appMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const trendData: Record<string, { email: number; endpoint: number; vulnerability: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthNames[d.getMonth()];
      trendData[key] = { email: 0, endpoint: 0, vulnerability: 0 };
    }
    allEvents.forEach(ev => {
      const m = monthNames[ev.occurredAt.getMonth()];
      if (trendData[m]) {
        trendData[m][ev.eventType as keyof typeof trendData[string]] += 1;
      }
    });
    const eventTrend = Object.entries(trendData).map(([month, counts]) => ({
      month,
      ...counts,
      total: counts.email + counts.endpoint + counts.vulnerability,
    }));

    const incidentTrend = Object.entries(trendData).map(([month]) => {
      const total = Math.max(3, Math.floor(totalIncidents / 6) + Math.floor(Math.random() * 6) - 2);
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

    const vulnEvents = allEvents.filter(e => e.eventType === "vulnerability");
    const vulnSeverityMap: Record<string, number> = {};
    vulnEvents.forEach(v => {
      vulnSeverityMap[v.severity] = (vulnSeverityMap[v.severity] || 0) + 1;
    });
    const vulnerabilitySeverity = Object.entries(vulnSeverityMap).map(([name, value]) => ({ name, value }));

    return {
      totalIncidents,
      openIncidents,
      resolvedIncidents,
      criticalIncidents,
      totalTickets,
      openTickets,
      totalEvents,
      incidentTrend,
      severityBreakdown,
      categoryBreakdown,
      recentIncidents,
      eventsByType,
      eventsBySeverity,
      eventTrend,
      topThreats,
      topTargets,
      topAttackers,
      topVulnerableApps,
      vulnerabilitySeverity,
    };
  }
}

export const storage = new DatabaseStorage();
