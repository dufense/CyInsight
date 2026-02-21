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
  insertServiceSchema,
  insertSlaDefinitionSchema,
  insertTeamMemberSchema,
  insertShiftRosterSchema,
  insertDocumentSchema,
  insertLicenseSchema,
} from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";

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
  isPlatformAdmin: boolean;
}> {
  const userId = req.user?.claims?.sub;
  if (!userId) throw new Error("No user ID");

  const tenantUser = await storage.getTenantUserByUserId(userId);
  if (!tenantUser) {
    return { userId, role: "customer", tenantId: null, isMSS: false, isPlatformAdmin: false };
  }

  const isPlatformAdmin = tenantUser.role === "platform_admin";
  const isMSS = isPlatformAdmin || tenantUser.role === "mss_admin" || tenantUser.role === "mss_analyst";
  return { userId, role: tenantUser.role, tenantId: tenantUser.tenantId, isMSS, isPlatformAdmin };
}

async function assertTenantAccess(req: any, tenantId: number): Promise<{
  userId: string;
  role: string;
  isMSS: boolean;
  isPlatformAdmin: boolean;
}> {
  const access = await getUserTenantAccess(req);

  if (access.isPlatformAdmin) {
    return { userId: access.userId, role: access.role, isMSS: true, isPlatformAdmin: true };
  }

  if (access.isMSS) {
    const userTenant = access.tenantId ? await storage.getTenant(access.tenantId) : null;
    if (userTenant && userTenant.type === "mssp") {
      const children = await storage.getChildTenants(userTenant.id);
      const childIds = children.map(c => c.id);
      if (tenantId === userTenant.id || childIds.includes(tenantId)) {
        return { userId: access.userId, role: access.role, isMSS: true, isPlatformAdmin: false };
      }
    }
    if (access.tenantId === tenantId) {
      return { userId: access.userId, role: access.role, isMSS: true, isPlatformAdmin: false };
    }
    throw Object.assign(new Error("Forbidden: no access to this tenant"), { status: 403 });
  }

  if (access.tenantId !== tenantId) {
    throw Object.assign(new Error("Forbidden: no access to this tenant"), { status: 403 });
  }

  return { userId: access.userId, role: access.role, isMSS: false, isPlatformAdmin: false };
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

  async function seedSuperadmin() {
    const existing = await storage.getSuperadminByUsername("admin");
    if (!existing) {
      const defaultPassword = process.env.SUPERADMIN_DEFAULT_PASSWORD || "Admin@123";
      const hash = await bcrypt.hash(defaultPassword, 12);
      await storage.createSuperadmin({
        username: "admin",
        passwordHash: hash,
        displayName: "Super Administrator",
        isActive: true,
      });
      console.log("Superadmin seeded (change default password after first login)");
    }
  }
  seedSuperadmin().catch(console.error);

  app.post("/api/superadmin/login", async (req: any, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const admin = await storage.getSuperadminByUsername(username);
      if (!admin || !admin.isActive) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      await storage.updateSuperadminLastLogin(admin.id);
      (req.session as any).superadminId = admin.id;
      (req.session as any).isSuperAdmin = true;
      res.json({ id: admin.id, username: admin.username, displayName: admin.displayName });
    } catch (error) {
      console.error("Superadmin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/superadmin/session", (req: any, res) => {
    if (req.session?.isSuperAdmin) {
      res.json({ authenticated: true, superadminId: req.session.superadminId });
    } else {
      res.json({ authenticated: false });
    }
  });

  app.post("/api/superadmin/logout", (req: any, res) => {
    if (req.session) {
      delete req.session.isSuperAdmin;
      delete req.session.superadminId;
    }
    res.json({ success: true });
  });

  function isSuperAdmin(req: any, res: any, next: any) {
    if (req.session?.isSuperAdmin) {
      return next();
    }
    return res.status(401).json({ message: "Superadmin access required" });
  }

  function isSuperAdminOrPlatformAdmin(req: any, res: any, next: any) {
    if (req.session?.isSuperAdmin) {
      return next();
    }
    if (req.user?.claims?.sub) {
      return next();
    }
    return res.status(401).json({ message: "Admin access required" });
  }

  async function assertAdminAccess(req: any): Promise<boolean> {
    if (req.session?.isSuperAdmin) return true;
    if (req.user?.claims?.sub) {
      const access = await getUserTenantAccess(req);
      return access.isPlatformAdmin;
    }
    return false;
  }

  app.get("/api/tenant-admin/tenants", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const allTenants = await storage.getTenants();
      res.json(allTenants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.post("/api/tenant-admin/tenants", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { type, parentId } = req.body;
      if (type === "customer" && parentId) {
        const parent = await storage.getTenant(parentId);
        if (!parent || parent.type !== "mssp") {
          return res.status(400).json({ message: "Customer tenants must have an MSSP parent" });
        }
      }
      if (type === "customer" && !parentId) {
        return res.status(400).json({ message: "Customer tenants require a parent MSSP" });
      }
      const tenant = await storage.createTenant(req.body);
      res.json(tenant);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create tenant" });
    }
  });

  app.patch("/api/tenant-admin/tenants/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const tenant = await storage.updateTenant(parseInt(req.params.id), req.body);
      res.json(tenant);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update tenant" });
    }
  });

  app.get("/api/tenant-admin/tenant-users", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const allUsers = await storage.getAllTenantUsers();
      const allTenants = await storage.getTenants();
      const enriched = allUsers.map(u => ({
        ...u,
        tenantName: allTenants.find(t => t.id === u.tenantId)?.name || "Unknown",
        tenantType: allTenants.find(t => t.id === u.tenantId)?.type || "unknown",
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenant users" });
    }
  });

  app.post("/api/tenant-admin/tenant-users", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const tu = await storage.createTenantUser(req.body);
      res.json(tu);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create tenant user" });
    }
  });

  app.patch("/api/tenant-admin/tenant-users/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const tu = await storage.updateTenantUser(parseInt(req.params.id), req.body);
      res.json(tu);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update tenant user" });
    }
  });

  app.delete("/api/tenant-admin/tenant-users/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteTenantUser(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete tenant user" });
    }
  });

  app.get("/api/tenant-admin/licenses", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const allLicenses = await storage.getLicenses();
      const allTenants = await storage.getTenants();
      const enriched = allLicenses.map(l => ({
        ...l,
        tenantName: allTenants.find(t => t.id === l.tenantId)?.name || "Unknown",
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch licenses" });
    }
  });

  app.post("/api/tenant-admin/licenses", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const data = {
        ...req.body,
        startDate: new Date(req.body.startDate),
        expiresAt: new Date(req.body.expiresAt),
      };
      const license = await storage.createLicense(data);
      res.json(license);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create license" });
    }
  });

  app.patch("/api/tenant-admin/licenses/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const data = { ...req.body };
      if (data.startDate) data.startDate = new Date(data.startDate);
      if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);
      const license = await storage.updateLicense(parseInt(req.params.id), data);
      res.json(license);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update license" });
    }
  });

  app.delete("/api/tenant-admin/licenses/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteLicense(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete license" });
    }
  });

  app.get("/api/tenant-admin/stats", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const allTenants = await storage.getTenants();
      const allUsers = await storage.getAllTenantUsers();
      const allLicenses = await storage.getLicenses();
      const mssps = allTenants.filter(t => t.type === "mssp");
      const customers = allTenants.filter(t => t.type === "customer");
      const activeLicenses = allLicenses.filter(l => l.status === "active");
      res.json({
        totalTenants: allTenants.length,
        totalMSSPs: mssps.length,
        totalCustomers: customers.length,
        totalUsers: allUsers.length,
        totalLicenses: allLicenses.length,
        activeLicenses: activeLicenses.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let tenantUser = await storage.getTenantUserByUserId(userId);

      if (!tenantUser) {
        const existingUsers = await storage.getAllTenantUsers();
        const mssps = await storage.getMSSPs();

        if (existingUsers.length === 0) {
          if (mssps.length === 0) {
            const mssp = await storage.createTenant({
              name: "SecureOps MSSP",
              slug: "secureops-mssp",
              type: "mssp",
              industry: "Cybersecurity",
              contactEmail: req.user.claims.email || "",
            });
            tenantUser = await storage.createTenantUser({
              userId,
              tenantId: mssp.id,
              role: "platform_admin",
            });
          } else {
            tenantUser = await storage.createTenantUser({
              userId,
              tenantId: mssps[0].id,
              role: "platform_admin",
            });
          }
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

      res.json({ role: tenantUser.role, tenantId: tenantUser.tenantId, isPlatformAdmin: tenantUser.role === "platform_admin" });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      if (access.isPlatformAdmin) {
        const allTenants = await storage.getTenants();
        return res.json(allTenants);
      }
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

      if (access.isPlatformAdmin) {
        const mssps = await storage.getMSSPs();
        const result = [];
        for (const mssp of mssps) {
          const children = await storage.getChildTenants(mssp.id);
          result.push({ ...mssp, children });
        }
        return res.json(result);
      }

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

  app.post("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { name, slug, type, parentId, industry, contactEmail } = req.body;
      if (!name || !slug) return res.status(400).json({ message: "Name and slug are required" });
      if (type === "mssp" && !access.isPlatformAdmin) {
        throw Object.assign(new Error("Only platform admins can create MSSP tenants"), { status: 403 });
      }
      const tenant = await storage.createTenant({
        name, slug, type: type || "customer", parentId: parentId || access.tenantId, industry, contactEmail,
      });
      res.status(201).json(tenant);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to create tenant" });
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
      } else if (rType === "compliance") {
        const allSummary = securityEventsList.slice(0, 20).map(e => ({ threat: e.threat, severity: e.severity, action: e.action, mitreTactic: e.mitreTactic }));
        promptContext = `Compliance-relevant events (${securityEventsList.length} total):\n${JSON.stringify(allSummary, null, 2)}\n\nIncidents: ${incidentsList.length} total, ${incidentsList.filter(i => i.severity === "critical").length} critical\nOpen tickets: ${ticketsList.filter(t => t.status === "open").length}`;
      } else if (rType === "threat_intelligence") {
        const threatEvents = securityEventsList.slice(0, 30).map(e => ({ threat: e.threat, threatVector: e.threatVector, mitreTactic: e.mitreTactic, mitreTechnique: e.mitreTechnique, severity: e.severity, country: e.country }));
        promptContext = `Threat Intelligence Events (${securityEventsList.length} total):\n${JSON.stringify(threatEvents, null, 2)}`;
      } else if (rType === "incident_response") {
        const irData = incidentsList.slice(0, 25).map(i => ({ title: i.title, severity: i.severity, status: i.status, category: i.category, affectedAssets: i.affectedAssets, source: i.source }));
        promptContext = `Incident Response Data (${incidentsList.length} incidents):\n${JSON.stringify(irData, null, 2)}\n\nEvent breakdown: ${securityEventsList.length} total events`;
      } else if (rType === "cloud_security") {
        const cloudEvents = securityEventsList.filter(e => ["cloud", "casb", "sse"].includes(e.eventType));
        promptContext = `Cloud Security Events (${cloudEvents.length} total):\n${JSON.stringify(cloudEvents.slice(0, 30).map(e => ({ threat: e.threat, app: e.app, severity: e.severity, action: e.action, description: e.description })), null, 2)}`;
      } else {
        const incidentSummary = incidentsList.slice(0, 20).map(i => ({ title: i.title, severity: i.severity, status: i.status, category: i.category, source: i.source }));
        promptContext = `Incidents (${incidentsList.length} total):\n${JSON.stringify(incidentSummary, null, 2)}\n\nTickets: ${ticketsList.length} total, ${ticketsList.filter(t => t.status === "open").length} open\n\nSecurity Events: ${securityEventsList.length} total (Email: ${securityEventsList.filter(e => e.eventType === "email").length}, Endpoint: ${securityEventsList.filter(e => e.eventType === "endpoint").length}, Vulnerability: ${securityEventsList.filter(e => e.eventType === "vulnerability").length})`;
      }

      const reportLabels: Record<string, string> = {
        executive_summary: "Executive Summary", endpoint: "Endpoint Security", email: "Email Security",
        vulnerability: "Vulnerability Assessment", compliance: "Compliance & Governance",
        threat_intelligence: "Threat Intelligence", incident_response: "Incident Response",
        cloud_security: "Cloud Security",
      };
      const reportTypeLabel = reportLabels[rType] || "Executive Summary";

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

  // Services & SLA routes
  app.get("/api/services/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const servicesList = await storage.getServices(tenantId);
      res.json(servicesList);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch services" });
    }
  });

  app.post("/api/services", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const validated = insertServiceSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);
      const service = await storage.createService(validated);
      res.status(201).json(service);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(error.status || 500).json({ message: error.message || "Failed to create service" });
    }
  });

  app.patch("/api/services/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getService(id);
      if (!existing) return res.status(404).json({ message: "Service not found" });
      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);
      const service = await storage.updateService(id, req.body);
      res.json(service);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update service" });
    }
  });

  app.get("/api/sla-definitions/:serviceId", isAuthenticated, async (req: any, res) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      const service = await storage.getService(serviceId);
      if (!service) return res.status(404).json({ message: "Service not found" });
      await assertTenantAccess(req, service.tenantId);
      const slas = await storage.getSlaDefinitions(serviceId);
      res.json(slas);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch SLA definitions" });
    }
  });

  app.post("/api/sla-definitions", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const validated = insertSlaDefinitionSchema.parse(req.body);
      const service = await storage.getService(validated.serviceId);
      if (!service) return res.status(404).json({ message: "Service not found" });
      await assertTenantAccess(req, service.tenantId);
      const sla = await storage.createSlaDefinition(validated);
      res.status(201).json(sla);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(error.status || 500).json({ message: error.message || "Failed to create SLA definition" });
    }
  });

  app.delete("/api/sla-definitions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const id = parseInt(req.params.id);
      const sla = await storage.getSlaDefinition(id);
      if (!sla) return res.status(404).json({ message: "SLA definition not found" });
      const service = await storage.getService(sla.serviceId);
      if (service) await assertTenantAccess(req, service.tenantId);
      await storage.deleteSlaDefinition(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to delete SLA definition" });
    }
  });

  // Team Members routes
  app.get("/api/team-members/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const teamType = req.query.teamType as string | undefined;
      const members = teamType
        ? await storage.getTeamMembersByType(tenantId, teamType)
        : await storage.getTeamMembers(tenantId);
      res.json(members);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch team members" });
    }
  });

  app.post("/api/team-members", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const validated = insertTeamMemberSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);
      const member = await storage.createTeamMember(validated);
      res.status(201).json(member);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(error.status || 500).json({ message: error.message || "Failed to create team member" });
    }
  });

  app.patch("/api/team-members/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getTeamMember(id);
      if (!existing) return res.status(404).json({ message: "Team member not found" });
      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);
      const member = await storage.updateTeamMember(id, req.body);
      res.json(member);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update team member" });
    }
  });

  // Shift Roster routes
  app.get("/api/shift-rosters/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);
      const { startDate, endDate } = req.query;
      const shifts = startDate && endDate
        ? await storage.getShiftRostersByDate(tenantId, new Date(startDate), new Date(endDate))
        : await storage.getShiftRosters(tenantId);
      res.json(shifts);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch shift rosters" });
    }
  });

  app.post("/api/shift-rosters", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const validated = insertShiftRosterSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);
      const shift = await storage.createShiftRoster(validated);
      res.status(201).json(shift);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(error.status || 500).json({ message: error.message || "Failed to create shift roster" });
    }
  });

  app.patch("/api/shift-rosters/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getShiftRosters(0);
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const shift = await storage.updateShiftRoster(id, req.body);
      res.json(shift);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update shift roster" });
    }
  });

  app.delete("/api/shift-rosters/:id", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      await storage.deleteShiftRoster(parseInt(req.params.id));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to delete shift roster" });
    }
  });

  // Documents / Knowledge Base routes
  app.get("/api/documents/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      const category = req.query.category as string | undefined;
      let docs = category
        ? await storage.getDocumentsByCategory(tenantId, category)
        : await storage.getDocuments(tenantId);
      if (!access.isMSS) {
        docs = docs.filter(d => d.customerVisible && d.status === "published");
      }
      res.json(docs);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/detail/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const access = await assertTenantAccess(req, doc.tenantId);
      if (!access.isMSS && (!doc.customerVisible || doc.status !== "published")) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(doc);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch document" });
    }
  });

  app.post("/api/documents", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const validated = insertDocumentSchema.parse(req.body);
      await assertTenantAccess(req, validated.tenantId);
      const doc = await storage.createDocument({ ...validated, createdBy: access.userId });
      res.status(201).json(doc);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(error.status || 500).json({ message: error.message || "Failed to create document" });
    }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getDocument(id);
      if (!existing) return res.status(404).json({ message: "Document not found" });
      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);
      const doc = await storage.updateDocument(id, { ...req.body, updatedBy: access.userId });
      res.json(doc);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getDocument(id);
      if (!existing) return res.status(404).json({ message: "Document not found" });
      const access = await assertTenantAccess(req, existing.tenantId);
      assertMSSRole(access);
      await storage.deleteDocument(id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to delete document" });
    }
  });

  // AI: Generate document content
  app.post("/api/ai/generate-document", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { tenantId, title, category, context } = req.body;
      if (!tenantId || !title || !category) return res.status(400).json({ message: "tenantId, title, and category are required" });
      await assertTenantAccess(req, tenantId);

      const tenant = await storage.getTenant(tenantId);
      const categoryLabels: Record<string, string> = {
        knowledge_transfer: "Knowledge Transfer Document",
        implementation: "Implementation Guide",
        sop: "Standard Operating Procedure (SOP)",
        runbook: "Runbook",
        policy: "Security Policy",
        architecture: "Architecture Document",
        training: "Training Material",
        other: "General Document",
      };
      const categoryLabel = categoryLabels[category] || "Document";

      const prompt = `You are a senior cybersecurity professional creating a ${categoryLabel} for ${tenant?.name || "the client"}.

Document Title: "${title}"
${context ? `Additional Context: ${context}` : ""}

Generate a comprehensive, professional ${categoryLabel} in Markdown format. Include:
- Executive overview
- Detailed sections with clear headings
- Step-by-step procedures where applicable
- Best practices and recommendations
- Relevant security considerations

The document should be production-ready, professional, and suitable for enterprise MSSP clients. Use proper Markdown formatting with headers, lists, tables where appropriate.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || "";
      res.json({ content });
    } catch (error: any) {
      console.error("Error generating document:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate document" });
    }
  });

  // AI: Ticket auto-categorize and priority suggestion
  app.post("/api/ai/ticket-suggest", isAuthenticated, async (req: any, res) => {
    try {
      const { title, description } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });

      const prompt = `You are an MSSP security operations expert. Analyze this support ticket and suggest categorization and priority.

Title: "${title}"
${description ? `Description: "${description}"` : ""}

Respond in JSON with:
{
  "suggestedPriority": "urgent|high|medium|low",
  "suggestedCategory": "general|incident|access|configuration|billing",
  "reasoning": "brief explanation",
  "suggestedResponse": "a professional initial response acknowledging the ticket and outlining next steps (2-3 sentences)"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Error with AI ticket suggestion:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to get AI suggestions" });
    }
  });

  // AI: Generate ticket response
  app.post("/api/ai/ticket-response", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { ticketId } = req.body;
      if (!ticketId) return res.status(400).json({ message: "ticketId is required" });

      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      await assertTenantAccess(req, ticket.tenantId);

      const comments = await storage.getTicketComments(ticketId);
      const commentsText = comments.map(c => `[${c.isInternal ? "Internal" : "Reply"}]: ${c.content}`).join("\n");

      const prompt = `You are a senior MSSP security operations analyst responding to a support ticket.

Ticket Title: "${ticket.title}"
Priority: ${ticket.priority}
Category: ${ticket.category || "general"}
Status: ${ticket.status}
Description: "${ticket.description || ""}"
${commentsText ? `\nConversation History:\n${commentsText}` : ""}

Generate a professional, helpful response that:
1. Acknowledges the issue clearly
2. Provides actionable next steps or resolution
3. Maintains a professional security operations tone
4. Is concise but thorough (3-5 sentences)

Respond with just the response text, no JSON wrapping.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "";
      res.json({ response: content });
    } catch (error: any) {
      console.error("Error generating ticket response:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate response" });
    }
  });

  // AI: Project risk assessment
  app.post("/api/ai/project-risk", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      await assertTenantAccess(req, project.tenantId);

      const projectTasks = await storage.getTasks(projectId);
      const totalTasks = projectTasks.length;
      const doneTasks = projectTasks.filter(t => t.status === "done").length;
      const overdueTasks = projectTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
      const urgentTasks = projectTasks.filter(t => t.priority === "urgent" || t.priority === "high").length;

      const prompt = `You are a project management expert for an MSSP. Analyze this project and provide a risk assessment.

Project: "${project.name}"
Status: ${project.status}
Description: "${project.description || "N/A"}"
Start Date: ${project.startDate || "Not set"}
End Date: ${project.endDate || "Not set"}

Task Metrics:
- Total Tasks: ${totalTasks}
- Completed: ${doneTasks} (${totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%)
- Overdue: ${overdueTasks}
- High/Urgent Priority: ${urgentTasks}

Task Details: ${JSON.stringify(projectTasks.slice(0, 20).map(t => ({ title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, assignedTo: t.assignedTo })))}

Respond in JSON with:
{
  "riskLevel": "low|medium|high|critical",
  "riskScore": 0-100,
  "summary": "2-3 sentence risk summary",
  "risks": [{"title": "risk name", "description": "brief description", "severity": "low|medium|high|critical"}],
  "recommendations": ["actionable recommendation 1", "recommendation 2", "recommendation 3"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Error with project risk assessment:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to assess project risk" });
    }
  });

  // AI: Generate task breakdown from goal
  app.post("/api/ai/task-breakdown", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { projectId, goal } = req.body;
      if (!projectId || !goal) return res.status(400).json({ message: "projectId and goal are required" });

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      await assertTenantAccess(req, project.tenantId);

      const prompt = `You are an MSSP project management expert. Break down this goal into actionable tasks for the project "${project.name}".

Goal: "${goal}"

Generate a list of tasks with proper priorities and estimated effort. Respond in JSON:
{
  "tasks": [
    {
      "title": "concise task title",
      "description": "brief task description",
      "priority": "urgent|high|medium|low",
      "estimatedDays": 1-14
    }
  ]
}

Generate 3-8 specific, actionable tasks. Each task should be completable by one person.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Error with task breakdown:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate task breakdown" });
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
