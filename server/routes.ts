import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import {
  insertIncidentSchema,
  insertTicketSchema,
  insertProjectSchema,
  insertTaskSchema,
  insertTicketCommentSchema,
} from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function getUserTenantAccess(req: any): Promise<{
  userId: string;
  role: string;
  tenantId: number | null;
  isMSS: boolean;
}> {
  const userId = req.user?.claims?.sub;
  if (!userId) throw new Error("No user ID");

  const tenantUser = await storage.getTenantUserByUserId(userId);
  if (!tenantUser) {
    return { userId, role: "customer", tenantId: null, isMSS: false };
  }

  const isMSS = tenantUser.role === "mss_admin" || tenantUser.role === "mss_analyst";
  return { userId, role: tenantUser.role, tenantId: tenantUser.tenantId, isMSS };
}

async function assertTenantAccess(req: any, tenantId: number): Promise<{
  userId: string;
  role: string;
  isMSS: boolean;
}> {
  const access = await getUserTenantAccess(req);

  if (access.isMSS) {
    const userTenant = access.tenantId ? await storage.getTenant(access.tenantId) : null;
    if (userTenant && userTenant.type === "mssp") {
      const children = await storage.getChildTenants(userTenant.id);
      const childIds = children.map(c => c.id);
      if (tenantId === userTenant.id || childIds.includes(tenantId)) {
        return { userId: access.userId, role: access.role, isMSS: true };
      }
    }
    if (access.tenantId === tenantId) {
      return { userId: access.userId, role: access.role, isMSS: true };
    }
    throw Object.assign(new Error("Forbidden: no access to this tenant"), { status: 403 });
  }

  if (access.tenantId !== tenantId) {
    throw Object.assign(new Error("Forbidden: no access to this tenant"), { status: 403 });
  }

  return { userId: access.userId, role: access.role, isMSS: false };
}

function assertMSSRole(access: { role: string; isMSS: boolean }) {
  if (!access.isMSS) {
    throw Object.assign(new Error("Forbidden: MSS role required"), { status: 403 });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let tenantUser = await storage.getTenantUserByUserId(userId);

      if (!tenantUser) {
        const existingUsers = await storage.getAllTenantUsers();
        const mssps = await storage.getMSSPs();

        if (existingUsers.length === 0 && mssps.length > 0) {
          tenantUser = await storage.createTenantUser({
            userId,
            tenantId: mssps[0].id,
            role: "mss_admin",
          });
        } else if (mssps.length > 0) {
          tenantUser = await storage.createTenantUser({
            userId,
            tenantId: mssps[0].id,
            role: "customer",
          });
        } else {
          return res.json({ role: "customer", tenantId: null });
        }
      }

      res.json({ role: tenantUser.role, tenantId: tenantUser.tenantId });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      if (access.isMSS && access.tenantId) {
        const userTenant = await storage.getTenant(access.tenantId);
        if (userTenant && userTenant.type === "mssp") {
          const children = await storage.getChildTenants(userTenant.id);
          return res.json([userTenant, ...children]);
        }
        return res.json(userTenant ? [userTenant] : []);
      }
      if (access.tenantId) {
        const tenant = await storage.getTenant(access.tenantId);
        return res.json(tenant ? [tenant] : []);
      }
      return res.json([]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.get("/api/tenants/hierarchy", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      if (!access.isMSS || !access.tenantId) {
        if (access.tenantId) {
          const tenant = await storage.getTenant(access.tenantId);
          return res.json(tenant ? [{ ...tenant, children: [] }] : []);
        }
        return res.json([]);
      }

      const userTenant = await storage.getTenant(access.tenantId);
      if (!userTenant) return res.json([]);

      if (userTenant.type === "mssp") {
        const children = await storage.getChildTenants(userTenant.id);
        return res.json([{ ...userTenant, children }]);
      }

      return res.json([{ ...userTenant, children: [] }]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenant hierarchy" });
    }
  });

  app.get("/api/dashboard/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const stats = await storage.getDashboardStats(tenantId);
      res.json(stats);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch dashboard" });
    }
  });

  app.get("/api/incidents/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const incidentsList = await storage.getIncidents(tenantId);
      res.json(incidentsList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch incidents" });
    }
  });

  app.post("/api/incidents", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);

      const validated = insertIncidentSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);

      const incident = await storage.createIncident(validated);
      res.status(201).json(incident);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to create incident" });
    }
  });

  app.patch("/api/incidents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getIncident(id);
      if (!existing) return res.status(404).json({ message: "Incident not found" });

      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);

      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });

      const incident = await storage.updateIncident(id, { status });
      res.json(incident);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update incident" });
    }
  });

  app.get("/api/tickets/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const ticketsList = await storage.getTickets(tenantId);
      res.json(ticketsList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch tickets" });
    }
  });

  app.post("/api/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      const tenantId = req.body.tenantId;
      await assertTenantAccess(req, tenantId);

      const validated = insertTicketSchema.parse({
        ...req.body,
        tenantId,
        createdBy: access.userId,
      });

      const ticket = await storage.createTicket(validated);
      res.status(201).json(ticket);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to create ticket" });
    }
  });

  app.patch("/api/tickets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getTicket(id);
      if (!existing) return res.status(404).json({ message: "Ticket not found" });

      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);

      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });

      const ticket = await storage.updateTicket(id, { status });
      res.json(ticket);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update ticket" });
    }
  });

  app.get("/api/tickets/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await storage.getTicket(id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      await assertTenantAccess(req, ticket.tenantId);
      const comments = await storage.getTicketComments(id);
      res.json(comments);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch comments" });
    }
  });

  app.post("/api/tickets/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const access = await assertTenantAccess(req, ticket.tenantId);

      const validated = insertTicketCommentSchema.parse({
        ...req.body,
        ticketId,
        userId: access.userId,
      });

      const comment = await storage.createTicketComment(validated);
      res.status(201).json(comment);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to create comment" });
    }
  });

  app.get("/api/projects/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const projectsList = await storage.getProjects(tenantId);
      res.json(projectsList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);

      const validated = insertProjectSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);

      const project = await storage.createProject(validated);
      res.status(201).json(project);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProject(id);
      if (!existing) return res.status(404).json({ message: "Project not found" });

      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);

      const project = await storage.updateProject(id, req.body);
      res.json(project);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update project" });
    }
  });

  app.get("/api/tasks/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      await assertTenantAccess(req, project.tenantId);
      const tasksList = await storage.getTasks(projectId);
      res.json(tasksList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);

      const validated = insertTaskSchema.parse(req.body);
      const project = await storage.getProject(validated.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      await assertTenantAccess(req, project.tenantId);

      const task = await storage.createTask(validated);
      res.status(201).json(task);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getTask(id);
      if (!existing) return res.status(404).json({ message: "Task not found" });

      const project = await storage.getProject(existing.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const access = await assertTenantAccess(req, project.tenantId);
      assertMSSRole(access);

      const { status, priority } = req.body;
      const task = await storage.updateTask(id, { ...(status && { status }), ...(priority && { priority }) });
      res.json(task);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update task" });
    }
  });

  app.get("/api/reports/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const reportsList = await storage.getReports(tenantId);
      res.json(reportsList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch reports" });
    }
  });

  app.post("/api/reports/generate", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);

      const { tenantId, title, period } = req.body;
      if (!tenantId) return res.status(400).json({ message: "tenantId is required" });

      await assertTenantAccess(req, tenantId);

      const incidentsList = await storage.getIncidents(tenantId);
      const ticketsList = await storage.getTickets(tenantId);
      const tenant = await storage.getTenant(tenantId);

      const incidentSummary = incidentsList.slice(0, 20).map(i => ({
        title: i.title,
        severity: i.severity,
        status: i.status,
        category: i.category,
        source: i.source,
      }));

      const prompt = `You are a senior cybersecurity analyst preparing a monthly security report for ${tenant?.name || "the client"}.

Based on the following security data, generate a comprehensive report:

Incidents (${incidentsList.length} total):
${JSON.stringify(incidentSummary, null, 2)}

Tickets: ${ticketsList.length} total, ${ticketsList.filter(t => t.status === "open").length} open

Generate a JSON response with:
1. "executiveSummary": A 3-4 paragraph professional executive summary
2. "findings": An array of 4-6 key findings, each with "title", "description", "severity" (critical/high/medium/low)
3. "recommendations": An array of 4-6 actionable recommendations, each with "title", "description", "priority" (high/medium/low)
4. "metrics": An object with key metrics like "total_incidents", "critical_count", "resolution_rate", "avg_response_time", "threat_score"

Be specific and professional. Reference actual incident categories and patterns.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
      });

      const reportData = JSON.parse(response.choices[0]?.message?.content || "{}");

      const report = await storage.createReport({
        tenantId,
        title: title || `Monthly Security Report - ${tenant?.name}`,
        period: period || "last_month",
        executiveSummary: reportData.executiveSummary || "",
        findings: reportData.findings || [],
        recommendations: reportData.recommendations || [],
        metrics: reportData.metrics || {},
        status: "published",
        generatedBy: access.userId,
      });

      res.status(201).json(report);
    } catch (error: any) {
      console.error("Error generating report:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate report" });
    }
  });

  return httpServer;
}
