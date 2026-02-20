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
  insertSecurityEventSchema,
} from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const upload = multer({ dest: "/tmp/uploads/" });
const REPORTS_DIR = path.join(process.cwd(), "data", "reports");
const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
      const stats = await storage.getEnhancedDashboardStats(tenantId);
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

      const { tenantId, title, period, reportType } = req.body;
      if (!tenantId) return res.status(400).json({ message: "tenantId is required" });

      await assertTenantAccess(req, tenantId);

      const incidentsList = await storage.getIncidents(tenantId);
      const ticketsList = await storage.getTickets(tenantId);
      const securityEventsList = await storage.getSecurityEvents(tenantId);
      const tenant = await storage.getTenant(tenantId);

      const rType = reportType || "executive_summary";

      let promptContext = "";
      if (rType === "email") {
        const emailEvents = securityEventsList.filter(e => e.eventType === "email");
        promptContext = `Email Security Events (${emailEvents.length} total):\n${JSON.stringify(emailEvents.slice(0, 30).map(e => ({ threat: e.threat, target: e.target, attacker: e.attacker, severity: e.severity, description: e.description })), null, 2)}`;
      } else if (rType === "endpoint") {
        const endpointEvents = securityEventsList.filter(e => e.eventType === "endpoint");
        promptContext = `Endpoint Security Events (${endpointEvents.length} total):\n${JSON.stringify(endpointEvents.slice(0, 30).map(e => ({ threat: e.threat, target: e.target, attacker: e.attacker, asset: e.asset, severity: e.severity, description: e.description })), null, 2)}`;
      } else if (rType === "vulnerability") {
        const vulnEvents = securityEventsList.filter(e => e.eventType === "vulnerability");
        promptContext = `Vulnerability Events (${vulnEvents.length} total):\n${JSON.stringify(vulnEvents.slice(0, 30).map(e => ({ threat: e.threat, target: e.target, app: e.app, severity: e.severity, description: e.description })), null, 2)}`;
      } else {
        const incidentSummary = incidentsList.slice(0, 20).map(i => ({ title: i.title, severity: i.severity, status: i.status, category: i.category, source: i.source }));
        promptContext = `Incidents (${incidentsList.length} total):\n${JSON.stringify(incidentSummary, null, 2)}\n\nTickets: ${ticketsList.length} total, ${ticketsList.filter(t => t.status === "open").length} open\n\nSecurity Events: ${securityEventsList.length} total (Email: ${securityEventsList.filter(e => e.eventType === "email").length}, Endpoint: ${securityEventsList.filter(e => e.eventType === "endpoint").length}, Vulnerability: ${securityEventsList.filter(e => e.eventType === "vulnerability").length})`;
      }

      const reportTypeLabel = rType === "executive_summary" ? "Executive Summary" : rType === "endpoint" ? "Endpoint Security" : rType === "email" ? "Email Security" : "Vulnerability Assessment";

      const prompt = `You are a senior cybersecurity analyst preparing a ${reportTypeLabel} report for ${tenant?.name || "the client"}.

Based on the following security data, generate a comprehensive ${reportTypeLabel} report:

${promptContext}

Generate a JSON response with:
1. "executiveSummary": A 3-4 paragraph professional executive summary specific to ${reportTypeLabel}
2. "findings": An array of 4-6 key findings, each with "title", "description", "severity" (critical/high/medium/low)
3. "recommendations": An array of 4-6 actionable recommendations, each with "title", "description", "priority" (high/medium/low)
4. "metrics": An object with key metrics relevant to ${reportTypeLabel}

Be specific and professional. Reference actual data patterns and threats.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
      });

      const reportData = JSON.parse(response.choices[0]?.message?.content || "{}");

      const reportTitle = title || `${reportTypeLabel} Report - ${tenant?.name}`;
      const fileName = `${reportTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.json`;
      const filePath = path.join(REPORTS_DIR, fileName);
      fs.writeFileSync(filePath, JSON.stringify({
        title: reportTitle,
        type: rType,
        tenant: tenant?.name,
        period: period || "last_month",
        generatedAt: new Date().toISOString(),
        ...reportData,
      }, null, 2));

      const report = await storage.createReport({
        tenantId,
        title: reportTitle,
        reportType: rType,
        period: period || "last_month",
        executiveSummary: reportData.executiveSummary || "",
        findings: reportData.findings || [],
        recommendations: reportData.recommendations || [],
        metrics: reportData.metrics || {},
        status: "published",
        filePath,
        fileName,
        generatedBy: access.userId,
      });

      res.status(201).json(report);
    } catch (error: any) {
      console.error("Error generating report:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate report" });
    }
  });

  app.get("/api/reports/download/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ message: "Report not found" });

      await assertTenantAccess(req, report.tenantId);

      if (!report.filePath || !fs.existsSync(report.filePath)) {
        const fallbackContent = JSON.stringify({
          title: report.title,
          type: report.reportType,
          period: report.period,
          executiveSummary: report.executiveSummary,
          findings: report.findings,
          recommendations: report.recommendations,
          metrics: report.metrics,
          generatedAt: report.createdAt,
        }, null, 2);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${report.fileName || "report.json"}"`);
        return res.send(fallbackContent);
      }

      res.setHeader("Content-Disposition", `attachment; filename="${report.fileName || "report.json"}"`);
      res.sendFile(report.filePath);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to download report" });
    }
  });

  app.get("/api/security-events/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const eventType = req.query.eventType as string | undefined;
      const events = eventType
        ? await storage.getSecurityEventsByType(tenantId, eventType)
        : await storage.getSecurityEvents(tenantId);
      res.json(events);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch security events" });
    }
  });

  app.post("/api/import", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);

      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ message: "tenantId is required" });
      const tid = parseInt(tenantId);
      await assertTenantAccess(req, tid);

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const originalName = req.file.originalname || "";
      const ext = path.extname(originalName).toLowerCase();

      const savedPath = path.join(UPLOADS_DIR, `${Date.now()}_${originalName}`);
      fs.copyFileSync(req.file.path, savedPath);
      fs.unlinkSync(req.file.path);

      let rows: any[] = [];

      if (ext === ".csv") {
        const workbook = XLSX.readFile(savedPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      } else if (ext === ".xlsx" || ext === ".xls") {
        const workbook = XLSX.readFile(savedPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      } else if (ext === ".pdf") {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const buffer = fs.readFileSync(savedPath);
        const pdfData = await pdfParse(buffer);
        const lines = pdfData.text.split("\n").filter((l: string) => l.trim());

        rows = lines.map((line: string) => {
          const parts = line.split(/[,\t|]/).map((p: string) => p.trim());
          return {
            eventType: parts[0] || "endpoint",
            threat: parts[1] || line.substring(0, 100),
            target: parts[2] || "",
            attacker: parts[3] || "",
            severity: parts[4] || "medium",
            description: line,
          };
        });
      } else {
        return res.status(400).json({ message: "Unsupported file format. Use .csv, .xlsx, .xls, or .pdf" });
      }

      const validEventTypes = ["email", "endpoint", "vulnerability"];
      const validSeverities = ["critical", "high", "medium", "low", "info"];

      const events = rows.map((row: any) => {
        const eventType = validEventTypes.includes(String(row.eventType || row.event_type || "").toLowerCase())
          ? String(row.eventType || row.event_type || "endpoint").toLowerCase()
          : "endpoint";
        const severity = validSeverities.includes(String(row.severity || "").toLowerCase())
          ? String(row.severity || "medium").toLowerCase()
          : "medium";

        return {
          tenantId: tid,
          eventType: eventType as "email" | "endpoint" | "vulnerability",
          severity: severity as "critical" | "high" | "medium" | "low" | "info",
          threat: String(row.threat || row.Threat || row.threat_name || "").substring(0, 500) || null,
          target: String(row.target || row.Target || row.recipient || row.system || "").substring(0, 500) || null,
          attacker: String(row.attacker || row.Attacker || row.sender || row.source_ip || "").substring(0, 500) || null,
          asset: String(row.asset || row.Asset || row.hostname || "").substring(0, 500) || null,
          app: String(row.app || row.App || row.application || "").substring(0, 255) || null,
          description: String(row.description || row.Description || row.details || "").substring(0, 2000) || null,
          occurredAt: row.occurredAt || row.occurred_at || row.date || row.timestamp ? new Date(row.occurredAt || row.occurred_at || row.date || row.timestamp) : new Date(),
        };
      }).filter((e: any) => e.threat || e.target || e.description);

      let imported = 0;
      if (events.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < events.length; i += batchSize) {
          const batch = events.slice(i, i + batchSize);
          await storage.createSecurityEvents(batch);
          imported += batch.length;
        }
      }

      res.json({
        message: `Successfully imported ${imported} security events`,
        imported,
        total: rows.length,
        skipped: rows.length - imported,
        fileSaved: savedPath,
      });
    } catch (error: any) {
      console.error("Import error:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to import data" });
    }
  });

  return httpServer;
}
