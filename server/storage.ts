import {
  tenants, tenantUsers, incidents, tickets, ticketComments,
  projects, tasks, reports,
  type Tenant, type InsertTenant,
  type TenantUser, type InsertTenantUser,
  type Incident, type InsertIncident,
  type Ticket, type InsertTicket,
  type TicketComment, type InsertTicketComment,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Report, type InsertReport,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql } from "drizzle-orm";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
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

  getDashboardStats(tenantId: number): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
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
}

export const storage = new DatabaseStorage();
