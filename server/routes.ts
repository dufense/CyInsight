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
  insertTicketFeedbackSchema,
  insertTicketAttachmentSchema,
} from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";
import multer from "multer";
import XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";

const upload = multer({ dest: "/tmp/uploads/", limits: { fileSize: 200 * 1024 * 1024 } });
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
  const mssRoles = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
  const isMSS = mssRoles.includes(tenantUser.role);
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
      const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
      return adminRoles.includes(access.role);
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

  app.delete("/api/tenant-admin/tenants/:id", isSuperAdminOrPlatformAdmin, async (req: any, res) => {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (!isAdmin) return res.status(403).json({ message: "Forbidden" });
      const id = parseInt(req.params.id);
      await storage.deleteTenant(id);
      res.json({ message: "Tenant deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete tenant" });
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

      const mssRolesCheck = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
      const assignedRoles = tenantUser.assignedRoles || [tenantUser.role];
      const hasMultipleRoles = assignedRoles.length > 1;
      const canSwitchRoles = hasMultipleRoles || tenantUser.role === "platform_admin" || req.session?.canSwitchRoles === true || req.session?.isSuperAdmin === true;
      res.json({
        role: tenantUser.role,
        tenantId: tenantUser.tenantId,
        isPlatformAdmin: tenantUser.role === "platform_admin",
        isMSS: mssRolesCheck.includes(tenantUser.role),
        isAdmin: ["platform_admin", "mss_admin", "soc_manager"].includes(tenantUser.role),
        canSwitchRoles,
        assignedRoles,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.put("/api/user/role", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { role } = req.body;
      const validRoles = ["platform_admin", "mss_admin", "mss_analyst", "customer", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const tenantUser = await storage.getTenantUserByUserId(userId);
      if (!tenantUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const isSuperAdminSession = req.session?.isSuperAdmin === true;
      const assignedRoles = tenantUser.assignedRoles || [tenantUser.role];
      const hasMultipleRoles = assignedRoles.length > 1;
      const canSwitchRoles = hasMultipleRoles || isSuperAdminSession || tenantUser.role === "platform_admin" || req.session?.canSwitchRoles === true;
      if (!canSwitchRoles) {
        return res.status(403).json({ message: "You need multiple assigned roles to switch" });
      }
      if (tenantUser.role === "platform_admin" || isSuperAdminSession) {
        req.session.canSwitchRoles = true;
      }
      if (hasMultipleRoles && !assignedRoles.includes(role) && !isSuperAdminSession && !req.session?.canSwitchRoles) {
        return res.status(403).json({ message: "You can only switch to your assigned roles" });
      }
      const updated = await storage.updateTenantUser(tenantUser.id, { role });
      const mssRolesCheck = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
      const updatedAssignedRoles = updated.assignedRoles || assignedRoles;
      res.json({
        role: updated.role,
        tenantId: updated.tenantId,
        isPlatformAdmin: updated.role === "platform_admin",
        isMSS: mssRolesCheck.includes(updated.role),
        isAdmin: ["platform_admin", "mss_admin", "soc_manager"].includes(updated.role),
        canSwitchRoles: true,
        assignedRoles: updatedAssignedRoles,
      });
    } catch (error) {
      console.error("Error switching role:", error);
      res.status(500).json({ message: "Failed to switch role" });
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

  app.get("/api/tickets/:id/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      await assertTenantAccess(req, ticket.tenantId);
      const feedback = await storage.getTicketFeedback(ticketId);
      res.json(feedback);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch feedback" });
    }
  });

  app.post("/api/tickets/:id/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const access = await assertTenantAccess(req, ticket.tenantId);

      if (ticket.status !== "closed" && ticket.status !== "resolved") {
        return res.status(400).json({ message: "Feedback can only be submitted for closed or resolved tickets" });
      }

      const existing = await storage.getTicketFeedbackByUser(ticketId, access.userId);
      if (existing) {
        return res.status(400).json({ message: "You have already submitted feedback for this ticket" });
      }

      const validated = insertTicketFeedbackSchema.parse({
        ...req.body,
        ticketId,
        userId: access.userId,
      });
      const feedback = await storage.createTicketFeedback(validated);
      res.status(201).json(feedback);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(error.status || 500).json({ message: error.message || "Failed to submit feedback" });
    }
  });

  app.get("/api/tickets/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      await assertTenantAccess(req, ticket.tenantId);
      const attachments = await storage.getTicketAttachments(ticketId);
      res.json(attachments);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch attachments" });
    }
  });

  app.post("/api/tickets/:id/attachments", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const access = await assertTenantAccess(req, ticket.tenantId);

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const destPath = path.join(UPLOADS_DIR, `ticket_${ticketId}_${Date.now()}_${req.file.originalname}`);
      fs.renameSync(req.file.path, destPath);

      const attachment = await storage.createTicketAttachment({
        ticketId,
        fileName: req.file.originalname,
        filePath: destPath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: access.userId,
      });
      res.status(201).json(attachment);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to upload attachment" });
    }
  });

  app.get("/api/attachments/download/:attachmentId", isAuthenticated, async (req: any, res) => {
    try {
      const attachmentId = parseInt(req.params.attachmentId);
      const ticketId = parseInt(req.query.ticketId as string);
      if (!ticketId) return res.status(400).json({ message: "ticketId query param required" });

      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      await assertTenantAccess(req, ticket.tenantId);

      const attachments = await storage.getTicketAttachments(ticketId);
      const att = attachments.find(a => a.id === attachmentId);
      if (!att) return res.status(404).json({ message: "Attachment not found" });

      if (fs.existsSync(att.filePath)) {
        res.download(att.filePath, att.fileName);
      } else {
        res.status(404).json({ message: "File not found" });
      }
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to download attachment" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      if (!access.isMSS || access.role === "customer") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantIdFilter = req.query.tenantId ? parseInt(req.query.tenantId) : null;
      if (tenantIdFilter) {
        await assertTenantAccess(req, tenantIdFilter);
        const users = await storage.getTenantUsersByTenant(tenantIdFilter);
        return res.json(users);
      }
      if (access.isPlatformAdmin) {
        const users = await storage.getAllTenantUsers();
        return res.json(users);
      }
      if (access.tenantId) {
        const userTenant = await storage.getTenant(access.tenantId);
        if (userTenant && userTenant.type === "mssp") {
          const children = await storage.getChildTenants(userTenant.id);
          const allTenantIds = [userTenant.id, ...children.map(c => c.id)];
          const allUsers: any[] = [];
          for (const tid of allTenantIds) {
            const tusers = await storage.getTenantUsersByTenant(tid);
            allUsers.push(...tusers);
          }
          return res.json(allUsers);
        }
        const users = await storage.getTenantUsersByTenant(access.tenantId);
        return res.json(users);
      }
      res.json([]);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
      if (!adminRoles.includes(access.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId, tenantId, role, assignedRoles } = req.body;
      if (!userId || !tenantId || !role) {
        return res.status(400).json({ message: "userId, tenantId, and role are required" });
      }

      await assertTenantAccess(req, tenantId);

      const existing = await storage.getTenantUser(userId, tenantId);
      if (existing) {
        return res.status(400).json({ message: "User already exists in this tenant" });
      }

      const roles = assignedRoles && assignedRoles.length > 0 ? assignedRoles : [role];
      const tu = await storage.createTenantUser({ userId, tenantId, role, assignedRoles: roles });
      res.status(201).json(tu);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
      if (!adminRoles.includes(access.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      const { role, assignedRoles } = req.body;
      const updateData: any = {};
      if (role) updateData.role = role;
      if (assignedRoles) updateData.assignedRoles = assignedRoles;
      const updated = await storage.updateTenantUser(id, updateData);
      res.json(updated);
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
      if (!adminRoles.includes(access.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      await storage.deleteTenantUser(id);
      res.json({ message: "User deleted" });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to delete user" });
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
      } else if (rType === "asset_inventory") {
        const assetMap: Record<string, { count: number; severities: string[]; types: string[] }> = {};
        for (const evt of securityEventsList) {
          const assets = [evt.asset, evt.target].filter(Boolean);
          for (const a of assets) {
            if (!a) continue;
            a.split(",").forEach(name => {
              const key = name.trim().toLowerCase();
              if (key.length < 2) return;
              if (!assetMap[key]) assetMap[key] = { count: 0, severities: [], types: [] };
              assetMap[key].count++;
              assetMap[key].severities.push(evt.severity);
              assetMap[key].types.push(evt.eventType);
            });
          }
        }
        const topAssets = Object.entries(assetMap).sort((a, b) => b[1].count - a[1].count).slice(0, 50);
        promptContext = `Asset Inventory Data:\nTotal unique assets: ${Object.keys(assetMap).length}\nTotal security events: ${securityEventsList.length}\nTotal incidents: ${incidentsList.length}\n\nTop 50 Assets by Event Count:\n${JSON.stringify(topAssets.map(([name, data]) => ({
          name, eventCount: data.count,
          criticalEvents: data.severities.filter(s => s === "critical").length,
          highEvents: data.severities.filter(s => s === "high").length,
          eventTypes: Array.from(new Set(data.types)),
        })), null, 2)}\n\nIncident affected assets summary:\n${JSON.stringify(incidentsList.slice(0, 30).filter(i => i.affectedAssets).map(i => ({ title: i.title, assets: i.affectedAssets, severity: i.severity })), null, 2)}`;
      } else if (rType === "threat_landscape") {
        const tactics: Record<string, number> = {};
        const techniques: Record<string, number> = {};
        const vectors: Record<string, number> = {};
        for (const evt of securityEventsList) {
          if (evt.mitreTactic) { const t = evt.mitreTactic.split(",")[0]?.trim(); if (t) tactics[t] = (tactics[t] || 0) + 1; }
          if (evt.mitreTechnique) { const t = evt.mitreTechnique.split(",")[0]?.trim(); if (t) techniques[t] = (techniques[t] || 0) + 1; }
          if (evt.threatVector) vectors[evt.threatVector] = (vectors[evt.threatVector] || 0) + 1;
        }
        promptContext = `Threat Landscape Analysis:\nTotal events: ${securityEventsList.length}\nTotal incidents: ${incidentsList.length}\nCritical incidents: ${incidentsList.filter(i => i.severity === "critical").length}\n\nMITRE ATT&CK Tactics (top 20):\n${JSON.stringify(Object.entries(tactics).sort((a, b) => b[1] - a[1]).slice(0, 20), null, 2)}\n\nMITRE Techniques (top 20):\n${JSON.stringify(Object.entries(techniques).sort((a, b) => b[1] - a[1]).slice(0, 20), null, 2)}\n\nThreat Vectors:\n${JSON.stringify(Object.entries(vectors).sort((a, b) => b[1] - a[1]), null, 2)}\n\nEvent Type Distribution:\n${JSON.stringify(securityEventsList.reduce((acc: any, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; }, {}), null, 2)}\n\nTop threats:\n${JSON.stringify(securityEventsList.slice(0, 30).map(e => ({ threat: e.threat, severity: e.severity, tactic: e.mitreTactic, technique: e.mitreTechnique, country: e.country })), null, 2)}`;
      } else if (rType === "sla_performance") {
        const servicesList = await storage.getServices(tenantId);
        let slasList: any[] = [];
        for (const svc of servicesList) {
          const defs = await storage.getSlaDefinitions(svc.id);
          slasList.push(...defs);
        }
        const ticketSlaData = ticketsList.map(t => ({
          title: t.title, priority: t.priority, status: t.status,
          slaBreached: t.slaBreached, serviceId: t.serviceId,
          createdAt: t.createdAt, resolvedAt: t.resolvedAt,
          firstResponseAt: t.firstResponseAt,
        }));
        promptContext = `SLA Performance Report:\nServices (${servicesList.length}):\n${JSON.stringify(servicesList.map(s => ({ name: s.name, type: s.serviceType, status: s.status })), null, 2)}\n\nSLA Definitions (${slasList.length}):\n${JSON.stringify(slasList.map(s => ({ name: s.name, priority: s.priority, responseTimeMin: s.responseTimeMinutes, resolutionTimeMin: s.resolutionTimeMinutes, uptime: s.uptimePercentage })), null, 2)}\n\nTicket SLA Data (${ticketsList.length} total):\nBreached: ${ticketsList.filter(t => t.slaBreached).length}\nResolved: ${ticketsList.filter(t => t.status === "resolved" || t.status === "closed").length}\nOpen: ${ticketsList.filter(t => t.status === "open").length}\n\nRecent tickets:\n${JSON.stringify(ticketSlaData.slice(0, 30), null, 2)}`;
      } else if (rType === "soc_operations") {
        const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
        incidentsList.forEach(i => { if (sevCounts[i.severity as keyof typeof sevCounts] !== undefined) sevCounts[i.severity as keyof typeof sevCounts]++; });
        const openInc = incidentsList.filter(i => i.status === "open" || i.status === "investigating").length;
        const resolvedInc = incidentsList.filter(i => i.status === "resolved" || i.status === "closed").length;
        promptContext = `SOC Operations Report:\nTotal Incidents: ${incidentsList.length}\nOpen/Investigating: ${openInc}\nResolved/Closed: ${resolvedInc}\nSeverity: Critical=${sevCounts.critical}, High=${sevCounts.high}, Medium=${sevCounts.medium}, Low=${sevCounts.low}\n\nTickets: Total=${ticketsList.length}, Open=${ticketsList.filter(t => t.status === "open").length}, In Progress=${ticketsList.filter(t => t.status === "in_progress").length}\nSLA Breached: ${ticketsList.filter(t => t.slaBreached).length}\n\nSecurity Events: ${securityEventsList.length} total\nEvent Types: ${JSON.stringify(securityEventsList.reduce((acc: any, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; }, {}))}\n\nRecent Critical Incidents:\n${JSON.stringify(incidentsList.filter(i => i.severity === "critical").slice(0, 15).map(i => ({ title: i.title, status: i.status, assets: i.affectedAssets, source: i.source })), null, 2)}\n\nTop Threats:\n${JSON.stringify(securityEventsList.slice(0, 20).map(e => ({ threat: e.threat, severity: e.severity, type: e.eventType })), null, 2)}`;
      } else if (rType === "risk_posture") {
        const riskScores = securityEventsList.filter(e => e.riskScore).map(e => e.riskScore!);
        const avgRisk = riskScores.length > 0 ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length) : 0;
        const maxRisk = riskScores.length > 0 ? Math.max(...riskScores) : 0;
        promptContext = `Risk Posture Assessment:\nTotal Events: ${securityEventsList.length}\nTotal Incidents: ${incidentsList.length}\nCritical Incidents: ${incidentsList.filter(i => i.severity === "critical").length}\nHigh Incidents: ${incidentsList.filter(i => i.severity === "high").length}\n\nRisk Scores: Average=${avgRisk}, Maximum=${maxRisk}, Events with scores=${riskScores.length}\n\nEvent Distribution: ${JSON.stringify(securityEventsList.reduce((acc: any, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; }, {}))}\n\nMITRE Coverage:\n${JSON.stringify(securityEventsList.filter(e => e.mitreTactic).slice(0, 30).map(e => ({ threat: e.threat, tactic: e.mitreTactic, technique: e.mitreTechnique, riskScore: e.riskScore, severity: e.severity })), null, 2)}\n\nOpen Risk Items:\n${JSON.stringify(incidentsList.filter(i => i.status === "open").slice(0, 20).map(i => ({ title: i.title, severity: i.severity, assets: i.affectedAssets, category: i.category })), null, 2)}`;
      } else {
        const incidentSummary = incidentsList.slice(0, 20).map(i => ({ title: i.title, severity: i.severity, status: i.status, category: i.category, source: i.source }));
        promptContext = `Incidents (${incidentsList.length} total):\n${JSON.stringify(incidentSummary, null, 2)}\n\nTickets: ${ticketsList.length} total, ${ticketsList.filter(t => t.status === "open").length} open\n\nSecurity Events: ${securityEventsList.length} total (Email: ${securityEventsList.filter(e => e.eventType === "email").length}, Endpoint: ${securityEventsList.filter(e => e.eventType === "endpoint").length}, Vulnerability: ${securityEventsList.filter(e => e.eventType === "vulnerability").length})`;
      }

      const reportLabels: Record<string, string> = {
        executive_summary: "Executive Summary", endpoint: "Endpoint Security", email: "Email Security",
        vulnerability: "Vulnerability Assessment", compliance: "Compliance & Governance",
        threat_intelligence: "Threat Intelligence", incident_response: "Incident Response",
        cloud_security: "Cloud Security", asset_inventory: "Asset Inventory",
        threat_landscape: "Threat Landscape", sla_performance: "SLA Performance",
        soc_operations: "SOC Operations", risk_posture: "Risk Posture",
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

      const parseSpreadsheet = (filePath: string): any[] => {
        const workbook = XLSX.readFile(filePath);
        const allRows: any[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          if (!rawData || rawData.length === 0) continue;

          let headerRowIdx = 0;
          for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
            if (!row || row.length <= 2) continue;
            const cellCount = row.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== "").length;
            if (cellCount >= 3) {
              headerRowIdx = i;
              break;
            }
          }

          const headers = rawData[headerRowIdx].map((h: any) => String(h || "").trim());
          for (let i = headerRowIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;
            const obj: any = {};
            headers.forEach((h: string, idx: number) => {
              if (h && row[idx] !== undefined && row[idx] !== null) {
                obj[h] = row[idx];
              }
            });
            if (Object.keys(obj).length > 0) allRows.push(obj);
          }
        }
        return allRows;
      }

      const cleanStr = (s: any): string => String(s || "").replace(/\u00A0/g, " ").trim();

      const isVerticalFormat = (filePath: string): boolean => {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (!rawData || rawData.length < 3) return false;
        const firstCell = cleanStr(rawData[0]?.[0]).toLowerCase();
        return firstCell.includes("incident details") || firstCell.includes("severity");
      }

      const parseVerticalFormat = (filePath: string): any[] => {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const incidents: any[] = [];
        let current: any = {};

        for (const row of rawData) {
          const key = cleanStr(row?.[0]).toLowerCase();
          const value = row?.[1] !== undefined ? cleanStr(row[1]) : "";

          if (key.includes("incident details") && Object.keys(current).length > 1) {
            incidents.push(current);
            current = {};
            continue;
          }
          if (key.includes("severity")) current.severity = value;
          else if (key.includes("alert id")) current.alertId = value;
          else if (key.includes("incident name")) current.title = value;
          else if (key.includes("description")) {
            current.description = (current.description ? current.description + "\n" : "") + value;
          }
          else if (key.includes("host name")) current.hostName = value;
          else if (key.includes("host ip") || key.includes("targeted host ip")) current.hostIp = value;
          else if (key.includes("operating system")) current.os = value;
          else if (key.includes("user")) current.user = value;
          else if (key.includes("scan group")) current.scanGroup = value;
          else if (key.includes("recommend")) current.recommendation = value;
          else if (key.includes("action required")) current.action = value;
          else if (key.includes("process path")) current.processPath = value;
          else if (key.includes("command line") || key.includes("cmdline")) current.commandLine = value;
          else if (key.includes("virus total")) current.virusTotal = value;
          else if (key.includes("auto remediation")) current.autoRemediation = value;
          else if (!key && value && current.description) {
            current.description += "\n" + value;
          }
        }
        if (Object.keys(current).length > 1) incidents.push(current);
        return incidents;
      }

      if (ext === ".csv" || ext === ".tsv") {
        const workbook = XLSX.readFile(savedPath, { type: "file" });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json(sheet);
          rows.push(...sheetRows);
        }
      } else if (ext === ".xlsx" || ext === ".xls") {
        if (isVerticalFormat(savedPath)) {
          rows = parseVerticalFormat(savedPath);
        } else {
          rows = parseSpreadsheet(savedPath);
        }
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
        return res.status(400).json({ message: "Unsupported file format. Use .csv, .xlsx, .xls, .tsv, or .pdf" });
      }

      const detectedColumns = rows.length > 0 ? Object.keys(rows[0]) : [];

      const validSeverities = ["critical", "high", "medium", "low", "info"];
      const validEventTypes = ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud"];

      const getField = (row: any, ...keys: string[]): string => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
            return String(row[k]).trim();
          }
        }
        return "";
      }

      const parseSeverity = (val: string): "critical" | "high" | "medium" | "low" | "info" => {
        const v = val.toLowerCase().trim();
        if (validSeverities.includes(v)) return v as any;
        if (v.includes("crit")) return "critical";
        if (v.includes("hi")) return "high";
        if (v.includes("lo")) return "low";
        if (v.includes("info")) return "info";
        return "medium";
      }

      const parseIncidentStatus = (val: string): "open" | "investigating" | "resolved" | "closed" => {
        const v = val.toLowerCase().trim();
        if (v.includes("closed") || v.includes("resolved") || v.includes("complete")) return "resolved";
        if (v.includes("progress") || v.includes("investigating") || v.includes("active")) return "investigating";
        if (v.includes("open") || v.includes("new") || v.includes("pending")) return "open";
        return "open";
      }

      const detectEventType = (row: any): "email" | "endpoint" | "vulnerability" | "casb" | "waf" | "dlp" | "sse" | "network" | "identity" | "cloud" => {
        const explicit = getField(row, "eventType", "event_type", "Event Type", "Category", "Alert Category").toLowerCase();
        if (validEventTypes.includes(explicit)) return explicit as any;

        const desc = (getField(row, "Case Description", "description", "Description", "Incident Name", "title", "Alert Name", "Rule Name") + " " +
                      getField(row, "MITRE ATT&CK Tactic", "mitreTactic", "Tactic") + " " +
                      getField(row, "MITRE ATT&CK Technique", "mitreTechnique", "Technique") + " " +
                      getField(row, "Source", "source", "Alert Source", "Detection Source")).toLowerCase();
        if (desc.includes("email") || desc.includes("phish") || desc.includes("spam") || desc.includes("mimecast") || desc.includes("o365") || desc.includes("exchange")) return "email";
        if (desc.includes("cloud") || desc.includes("aws") || desc.includes("azure") || desc.includes("gcp") || desc.includes("s3") || desc.includes("ec2") || desc.includes("lambda")) return "cloud";
        if (desc.includes("waf") || desc.includes("web shell") || desc.includes("web application") || desc.includes("sql inject") || desc.includes("xss")) return "waf";
        if (desc.includes("casb") || desc.includes("shadow it") || desc.includes("saas")) return "casb";
        if (desc.includes("identity") || desc.includes("valid accounts") || desc.includes("credential") || desc.includes("login") || desc.includes("console") || desc.includes("brute") || desc.includes("ntlm")) return "identity";
        if (desc.includes("network") || desc.includes("ssh") || desc.includes("tunnel") || desc.includes("protocol") || desc.includes("lateral") || desc.includes("port scan") || desc.includes("firewall") || desc.includes("ids") || desc.includes("ips")) return "network";
        if (desc.includes("vulnerability") || desc.includes("cve-") || desc.includes("log4") || desc.includes("patch") || desc.includes("exploit")) return "vulnerability";
        if (desc.includes("dlp") || desc.includes("data loss") || desc.includes("data leak") || desc.includes("exfiltrat")) return "dlp";
        if (desc.includes("sse") || desc.includes("zero trust") || desc.includes("sase")) return "sse";
        return "endpoint";
      }

      const isValidDate = (d: Date): boolean => {
        if (isNaN(d.getTime())) return false;
        const year = d.getFullYear();
        return year >= 2000 && year <= 2100;
      };

      const parseExcelDate = (val: any): Date => {
        if (!val) return new Date();
        if (typeof val === "number") {
          if (val > 0 && val < 200000) {
            const d = new Date((val - 25569) * 86400000);
            if (isValidDate(d)) return d;
          }
          return new Date();
        }
        const s = String(val).trim();
        const parsed = new Date(s);
        if (isValidDate(parsed)) return parsed;
        const match = s.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\s+([\d:]+)/i);
        if (match) {
          const d = new Date(`${match[1]} ${match[2]}, ${match[3]} ${match[4]}`);
          if (isValidDate(d)) return d;
        }
        return new Date();
      }

      const extractAssets = (row: any): string => {
        const parts: string[] = [];
        const assetNames = getField(row, "Asset Names", "Asset IDs", "Hosts Windows", "Hosts Linux", "hostName", "Host Name", "Hostname", "hostname", "Computer Name", "Device Name", "Device", "Endpoint");
        if (assetNames) {
          const cleaned = assetNames.replace(/[\[\]']/g, "").split(",").map((s: string) => s.trim()).filter(Boolean);
          parts.push(...cleaned);
        }
        const hostRisk = getField(row, "Host/Risk");
        if (hostRisk) {
          const hostMatch = hostRisk.match(/^([^/]+)/);
          if (hostMatch) parts.push(hostMatch[1]);
        }
        return parts.join(", ").substring(0, 500) || "";
      }

      const extractMitre = (row: any, field: string): string => {
        const val = getField(row, field, field.replace("MITRE ATT&CK ", ""));
        if (!val) return "";
        return val.replace(/[\[\]']/g, "").split(",").map((s: string) => s.trim()).filter(Boolean).join(", ").substring(0, 200);
      }

      const buildRawPayload = (row: any): any => {
        const payload: any = {};
        for (const [key, value] of Object.entries(row)) {
          if (value !== null && value !== undefined && String(value).trim() !== "") {
            payload[key] = value;
          }
        }
        return Object.keys(payload).length > 0 ? payload : null;
      }

      let incidentsCreated = 0;
      let eventsCreated = 0;
      let skippedRows = 0;

      const batchSize = 500;
      for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
        const chunk = rows.slice(batchStart, batchStart + batchSize);
        const incidentBatch: any[] = [];
        const eventBatch: any[] = [];

        for (const row of chunk) {
          const title = getField(row, "Incident Name", "title", "Case Description", "threat", "Threat", "Alert Name", "Rule Name", "Event Name", "Subject")
                        .substring(0, 500);
          if (!title) { skippedRows++; continue; }

          const severity = parseSeverity(getField(row, "Severity", "severity", "Risk Level", "Priority", "Alert Severity"));
          const description = getField(row, "Case Description", "description", "Description", "details", "Detail", "Summary", "Alert Description", "Message")
                              .substring(0, 2000) || title;
          const statusRaw = getField(row, "Status", "status", "State", "Alert Status", "Resolution Status");
          const status = parseIncidentStatus(statusRaw);
          const assets = extractAssets(row);
          const assignee = getField(row, "Assignee", "assignedTo", "assigned_to", "user", "User", "Owner", "Analyst", "Handler");
          const recommendation = getField(row, "Recommendation", "recommendation", "Recommended Response", "Remediation", "Fix", "Solution");
          const source = getField(row, "Scan Group Name", "scanGroup", "Case Domain", "logSource", "Source", "Detection Source", "Alert Source", "Product") || "Import";
          const category = getField(row, "MITRE ATT&CK Tactic", "mitreTactic", "category", "Category", "Tactic") || null;
          const dateRaw = getField(row, "Last Updated", "First Seen", "Last Seen", "occurredAt", "occurred_at", "date", "timestamp", "Date", "Timestamp", "Created", "Detection Time", "Event Time");
          const occurredAt = parseExcelDate(dateRaw);

          incidentBatch.push({
            tenantId: tid,
            title,
            description,
            severity,
            status,
            source: source.substring(0, 100),
            category: category ? category.substring(0, 100) : null,
            affectedAssets: assets || null,
            recommendation: recommendation ? recommendation.substring(0, 2000) : null,
            assignedTo: assignee ? assignee.substring(0, 255) : null,
            resolvedAt: status === "resolved" ? occurredAt : null,
          });

          const eventType = detectEventType(row);
          const mitreTactic = extractMitre(row, "MITRE ATT&CK Tactic");
          const mitreTechnique = extractMitre(row, "MITRE ATT&CK Technique");
          const riskScoreRaw = getField(row, "Total Risk", "Score", "riskScore", "risk_score", "Risk Score", "Severity Score", "CVSS");
          const riskScore = riskScoreRaw ? parseInt(riskScoreRaw) || null : null;
          const logSource = getField(row, "Scan Group Name", "scanGroup", "logSource", "Tags", "Log Source", "Data Source");
          const hostIp = getField(row, "Host Ip", "hostIp", "Targeted Host IP", "Source IP", "Destination IP", "IP Address", "IP");
          const comments = getField(row, "Comments", "Resolution Reason", "Notes", "Remarks");
          const senderVal = getField(row, "Sender", "sender", "From", "Source Email", "Source User");
          const recipientVal = getField(row, "Recipient", "recipient", "To", "Target Email", "Destination User");
          const protocolVal = getField(row, "Protocol", "protocol", "Network Protocol", "Transport");
          const countryVal = getField(row, "Asset Regions", "country", "Country", "Region", "Geo Location", "Location");
          const threatVectorVal = getField(row, "Threat Vector", "threatVector", "Attack Vector", "Vector", "Kill Chain Phase");
          const appVal = getField(row, "app", "App", "Business Application Names", "Application", "Service Name");

          eventBatch.push({
            tenantId: tid,
            eventType,
            severity,
            threat: title.substring(0, 500),
            target: (assets || hostIp).substring(0, 500) || null,
            attacker: getField(row, "Attacker", "attacker", "Source IP", "Threat Actor", "Adversary").substring(0, 500) || null,
            asset: assets ? assets.split(",")[0]?.trim().substring(0, 500) : null,
            app: appVal.substring(0, 255) || null,
            description: (description + (comments ? "\n" + comments : "")).substring(0, 2000),
            threatVector: threatVectorVal.substring(0, 200) || null,
            mitreTactic: mitreTactic.substring(0, 200) || null,
            mitreTechnique: mitreTechnique.substring(0, 200) || null,
            action: getField(row, "Auto-Remediation", "autoRemediation", "action", "Action Required", "Action Taken", "Response Action", "Remediation Action").substring(0, 100) || null,
            sourceType: getField(row, "Asset Types", "sourceType", "Source Type", "Device Type", "Endpoint Type").substring(0, 100) || null,
            logSource: logSource.substring(0, 200) || null,
            sender: senderVal.substring(0, 500) || null,
            recipient: recipientVal.substring(0, 500) || null,
            protocol: protocolVal.substring(0, 50) || null,
            country: countryVal.substring(0, 100) || null,
            riskScore,
            rawPayload: buildRawPayload(row),
            occurredAt,
          });
        }

        for (const inc of incidentBatch) {
          try {
            await storage.createIncident(inc);
            incidentsCreated++;
          } catch (e) {
            skippedRows++;
          }
        }

        for (let i = 0; i < eventBatch.length; i += 100) {
          const evtChunk = eventBatch.slice(i, i + 100);
          try {
            await storage.createSecurityEvents(evtChunk);
            eventsCreated += evtChunk.length;
          } catch (e) {
            for (const evt of evtChunk) {
              try {
                await storage.createSecurityEvents([evt]);
                eventsCreated++;
              } catch (e2) {
                // skip invalid event row
              }
            }
          }
        }
      }

      res.json({
        message: `Imported ${incidentsCreated} incidents and ${eventsCreated} security events`,
        incidentsCreated,
        eventsCreated,
        imported: incidentsCreated + eventsCreated,
        total: rows.length,
        skipped: skippedRows,
        columnsDetected: detectedColumns,
      });
    } catch (error: any) {
      console.error("Import error:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to import data" });
    }
  });

  app.post("/api/ai/incident-insights", isAuthenticated, async (req: any, res) => {
    try {
      const { incidentId } = req.body;
      if (!incidentId) return res.status(400).json({ message: "incidentId is required" });
      const incident = await storage.getIncident(incidentId);
      if (!incident) return res.status(404).json({ message: "Incident not found" });
      await assertTenantAccess(req, incident.tenantId);

      const relatedEvents = (await storage.getSecurityEvents(incident.tenantId))
        .filter(e => {
          const assets = (incident.affectedAssets || "").toLowerCase();
          return (e.asset && assets.includes(e.asset.toLowerCase())) ||
                 (e.target && assets.includes(e.target.toLowerCase())) ||
                 (e.threat && incident.title.toLowerCase().includes(e.threat.toLowerCase()));
        }).slice(0, 20);

      const prompt = `You are a senior SOC analyst. Analyze this security incident and provide actionable intelligence.

Incident:
- Title: ${incident.title}
- Severity: ${incident.severity}
- Status: ${incident.status}
- Category: ${incident.category || "unknown"}
- Source: ${incident.source || "unknown"}
- Affected Assets: ${incident.affectedAssets || "unknown"}
- Description: ${(incident.description || "").substring(0, 500)}
- Created: ${incident.createdAt.toISOString()}
${incident.recommendation ? `- Recommendation: ${incident.recommendation.substring(0, 300)}` : ""}

Related Security Events (${relatedEvents.length}):
${JSON.stringify(relatedEvents.map(e => ({
  threat: e.threat, severity: e.severity, eventType: e.eventType,
  mitreTactic: e.mitreTactic, mitreTechnique: e.mitreTechnique,
  action: e.action, asset: e.asset, riskScore: e.riskScore
})), null, 2)}

Provide a JSON response with:
{
  "riskAssessment": "High/Medium/Low with brief explanation",
  "attackVector": "How the attack likely occurred",
  "mitreMappings": ["Relevant MITRE ATT&CK tactics and techniques"],
  "impactAnalysis": "Potential business impact",
  "recommendations": ["List of 3-5 specific remediation steps"],
  "predictions": ["2-3 predictions about what could happen next if not addressed"],
  "relatedThreats": ["Similar threat patterns to watch for"],
  "priorityScore": 1-100
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const insights = JSON.parse(response.choices[0]?.message?.content || "{}");
      res.json({ insights, relatedEventsCount: relatedEvents.length });
    } catch (error: any) {
      console.error("AI incident insights error:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate insights" });
    }
  });

  app.get("/api/ai/threat-analysis/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);

      const events = await storage.getSecurityEvents(tenantId);
      const incidents = await storage.getIncidents(tenantId);

      const cleanLabel = (label: string): string => {
        let cleaned = label.replace(/^\[?'?/, "").replace(/'?\]?$/, "").trim();
        cleaned = cleaned.replace(/^TA\d{4}\s*-\s*/, "");
        cleaned = cleaned.replace(/^T\d{4}(\.\d+)?\s*-\s*/, "");
        return cleaned || label;
      };

      const tacticCounts: Record<string, number> = {};
      const techniqueCounts: Record<string, number> = {};
      const assetTargetCounts: Record<string, number> = {};
      const threatCounts: Record<string, number> = {};
      const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
      const eventTypeCounts: Record<string, number> = {};
      const attackTimeline: Record<string, number> = {};

      events.forEach(e => {
        if (e.mitreTactic) {
          const tactics = e.mitreTactic.split(",").map((t: string) => cleanLabel(t.trim()));
          tactics.forEach((t: string) => { if (t.length > 2) tacticCounts[t] = (tacticCounts[t] || 0) + 1; });
        }
        if (e.mitreTechnique) {
          const techs = e.mitreTechnique.split(",").map((t: string) => cleanLabel(t.trim()));
          techs.forEach((t: string) => { if (t.length > 2) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1; });
        }
        if (e.asset) assetTargetCounts[e.asset] = (assetTargetCounts[e.asset] || 0) + 1;
        if (e.target) assetTargetCounts[e.target] = (assetTargetCounts[e.target] || 0) + 1;
        if (e.threat) threatCounts[e.threat] = (threatCounts[e.threat] || 0) + 1;
        if (e.severity) severityCounts[e.severity] = (severityCounts[e.severity] || 0) + 1;
        if (e.eventType) eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] || 0) + 1;
        const day = e.occurredAt.toISOString().split("T")[0];
        attackTimeline[day] = (attackTimeline[day] || 0) + 1;
      });

      incidents.forEach(i => {
        if (i.affectedAssets) {
          i.affectedAssets.split(",").forEach(a => {
            const asset = a.trim();
            if (asset) assetTargetCounts[asset] = (assetTargetCounts[asset] || 0) + 1;
          });
        }
        if (i.category) {
          const cat = cleanLabel(i.category);
          tacticCounts[cat] = (tacticCounts[cat] || 0) + 1;
        }
      });

      const topN = (map: Record<string, number>, n: number) =>
        Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

      const repeatedThreats = topN(threatCounts, 15);
      const mostTargetedSystems = topN(assetTargetCounts, 20);
      const topTactics = topN(tacticCounts, 15);
      const topTechniques = topN(techniqueCounts, 15);
      const attacksByLayer = Object.entries(eventTypeCounts).map(([layer, count]) => ({ layer, count })).sort((a, b) => b.count - a.count);

      const timelineSorted = Object.entries(attackTimeline).sort((a, b) => a[0].localeCompare(b[0]));
      const dailyTrend = timelineSorted.slice(-30).map(([date, count]) => ({ date: date.substring(5), count }));

      const criticalIncidents = incidents.filter(i => i.severity === "critical").length;
      const highIncidents = incidents.filter(i => i.severity === "high").length;
      const openIncidents = incidents.filter(i => i.status === "open" || i.status === "investigating").length;

      const keyObservations = [];
      if (criticalIncidents > 0) keyObservations.push({ type: "critical", message: `${criticalIncidents} critical incidents require immediate attention`, severity: "critical" });
      if (openIncidents > 5) keyObservations.push({ type: "warning", message: `${openIncidents} incidents remain open/investigating`, severity: "high" });
      if (repeatedThreats.length > 0 && repeatedThreats[0].count > 5) keyObservations.push({ type: "pattern", message: `"${repeatedThreats[0].name}" is the most recurring threat with ${repeatedThreats[0].count} occurrences`, severity: "high" });
      if (mostTargetedSystems.length > 0) keyObservations.push({ type: "target", message: `"${mostTargetedSystems[0].name}" is the most targeted system with ${mostTargetedSystems[0].count} events`, severity: "medium" });
      if (topTactics.length > 0) keyObservations.push({ type: "tactic", message: `"${topTactics[0].name}" is the most used attack tactic (${topTactics[0].count} events)`, severity: "medium" });
      const totalEventsLast7 = timelineSorted.slice(-7).reduce((s, [, c]) => s + c, 0);
      const totalEventsPrev7 = timelineSorted.slice(-14, -7).reduce((s, [, c]) => s + c, 0);
      if (totalEventsLast7 > totalEventsPrev7 * 1.2 && totalEventsPrev7 > 0) {
        keyObservations.push({ type: "trend", message: `Attack volume increased ${Math.round(((totalEventsLast7 - totalEventsPrev7) / totalEventsPrev7) * 100)}% in the last 7 days`, severity: "high" });
      }

      res.json({
        summary: {
          totalEvents: events.length,
          totalIncidents: incidents.length,
          criticalIncidents,
          highIncidents,
          openIncidents,
          avgRiskScore: events.length > 0 ? Math.round(events.filter(e => e.riskScore).reduce((s, e) => s + (e.riskScore || 0), 0) / Math.max(1, events.filter(e => e.riskScore).length)) : 0,
        },
        keyObservations,
        repeatedThreats,
        mostTargetedSystems,
        topTactics,
        topTechniques,
        attacksByLayer,
        severityDistribution: severityCounts,
        dailyTrend,
      });
    } catch (error: any) {
      console.error("Threat analysis error:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to generate threat analysis" });
    }
  });

  app.post("/api/ai/enrich-events", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getUserTenantAccess(req);
      assertMSSRole(access);
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ message: "tenantId is required" });
      await assertTenantAccess(req, tenantId);

      const events = await storage.getSecurityEvents(tenantId);
      const unenriched = events.filter(e => !e.threatVector && !e.mitreTactic);
      if (unenriched.length === 0) {
        return res.json({ message: "All events already enriched", enriched: 0 });
      }

      const sampleSize = Math.min(50, unenriched.length);
      const sample = unenriched.slice(0, sampleSize);

      const prompt = `You are a senior SOC analyst. Analyze these ${sampleSize} security events and enrich each with:
- mitreTactic: MITRE ATT&CK tactic (e.g., "TA0001 - Initial Access")
- mitreTechnique: MITRE ATT&CK technique (e.g., "T1566 - Phishing")
- threatVector: attack vector category (e.g., "email", "web", "network", "insider", "supply_chain", "physical", "social_engineering")
- riskScore: numeric 1-100 risk score based on severity and impact
- enrichedEventType: refined event type if the current one seems wrong

Events to analyze:
${JSON.stringify(sample.map(e => ({ id: e.id, eventType: e.eventType, threat: e.threat, severity: e.severity, description: e.description?.substring(0, 300), asset: e.asset, target: e.target })), null, 2)}

Return JSON: { "enrichments": [{ "id": number, "mitreTactic": string, "mitreTechnique": string, "threatVector": string, "riskScore": number }] }`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      let enrichedCount = 0;

      if (result.enrichments && Array.isArray(result.enrichments)) {
        for (const enrichment of result.enrichments) {
          try {
            const existing = events.find(e => e.id === enrichment.id);
            if (existing) {
              await storage.updateSecurityEvent(existing.id, {
                mitreTactic: enrichment.mitreTactic || existing.mitreTactic,
                mitreTechnique: enrichment.mitreTechnique || existing.mitreTechnique,
                threatVector: enrichment.threatVector || existing.threatVector,
                riskScore: enrichment.riskScore || existing.riskScore,
              });
              enrichedCount++;
            }
          } catch (e) {
            // skip individual failures
          }
        }
      }

      res.json({
        message: `Enriched ${enrichedCount} events with AI-powered threat intelligence`,
        enriched: enrichedCount,
        totalUnenriched: unenriched.length,
        remaining: unenriched.length - enrichedCount,
      });
    } catch (error: any) {
      console.error("AI enrichment error:", error);
      res.status(error.status || 500).json({ message: error.message || "Failed to enrich events" });
    }
  });

  app.get("/api/assets/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      await assertTenantAccess(req, tenantId);

      const events = await storage.getSecurityEvents(tenantId);
      const incidents = await storage.getIncidents(tenantId);

      const assetMap: Record<string, {
        name: string; eventCount: number; incidentCount: number;
        criticalCount: number; highCount: number; mediumCount: number; lowCount: number;
        eventTypes: Set<string>; firstSeen: Date; lastSeen: Date;
        riskScore: number; mitreTactics: Set<string>;
        logSources: Set<string>; ips: Set<string>;
      }> = {};

      const addAsset = (name: string, severity: string, eventType: string, date: Date, riskScore: number | null, mitreTactic: string | null, logSource: string | null, ip: string | null, isIncident: boolean) => {
        const key = name.toLowerCase().trim();
        if (!key || key.length < 2) return;
        if (!assetMap[key]) {
          assetMap[key] = {
            name, eventCount: 0, incidentCount: 0,
            criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
            eventTypes: new Set(), firstSeen: date, lastSeen: date,
            riskScore: 0, mitreTactics: new Set(),
            logSources: new Set(), ips: new Set(),
          };
        }
        const a = assetMap[key];
        if (isIncident) a.incidentCount++; else a.eventCount++;
        if (severity === "critical") a.criticalCount++;
        else if (severity === "high") a.highCount++;
        else if (severity === "medium") a.mediumCount++;
        else a.lowCount++;
        a.eventTypes.add(eventType);
        if (date < a.firstSeen) a.firstSeen = date;
        if (date > a.lastSeen) a.lastSeen = date;
        if (riskScore && riskScore > a.riskScore) a.riskScore = riskScore;
        if (mitreTactic) a.mitreTactics.add(mitreTactic.split(",")[0]?.trim());
        if (logSource) a.logSources.add(logSource.split(",")[0]?.trim());
        if (ip) a.ips.add(ip);
      };

      for (const evt of events) {
        if (evt.asset) {
          evt.asset.split(",").forEach(a => addAsset(a.trim(), evt.severity, evt.eventType, evt.occurredAt, evt.riskScore, evt.mitreTactic, evt.logSource, evt.target, false));
        }
        if (evt.target && evt.target !== evt.asset) {
          addAsset(evt.target, evt.severity, evt.eventType, evt.occurredAt, evt.riskScore, evt.mitreTactic, evt.logSource, evt.target, false);
        }
      }

      for (const inc of incidents) {
        if (inc.affectedAssets) {
          inc.affectedAssets.split(",").forEach(a => addAsset(a.trim(), inc.severity, inc.category || "incident", inc.createdAt, null, inc.category, inc.source, null, true));
        }
      }

      const assets = Object.values(assetMap)
        .map(a => ({
          ...a,
          totalEvents: a.eventCount + a.incidentCount,
          riskLevel: a.criticalCount > 0 ? "critical" : a.highCount > 2 ? "high" : a.mediumCount > 5 ? "medium" : "low",
          eventTypes: Array.from(a.eventTypes),
          mitreTactics: Array.from(a.mitreTactics),
          logSources: Array.from(a.logSources),
          ips: Array.from(a.ips),
        }))
        .sort((a, b) => b.totalEvents - a.totalEvents);

      const summary = {
        totalAssets: assets.length,
        criticalAssets: assets.filter(a => a.riskLevel === "critical").length,
        highRiskAssets: assets.filter(a => a.riskLevel === "high").length,
        mediumRiskAssets: assets.filter(a => a.riskLevel === "medium").length,
        lowRiskAssets: assets.filter(a => a.riskLevel === "low").length,
        topAssetsByEvents: assets.slice(0, 20),
        assetsByEventType: {} as Record<string, number>,
        riskDistribution: [
          { name: "Critical", value: assets.filter(a => a.riskLevel === "critical").length },
          { name: "High", value: assets.filter(a => a.riskLevel === "high").length },
          { name: "Medium", value: assets.filter(a => a.riskLevel === "medium").length },
          { name: "Low", value: assets.filter(a => a.riskLevel === "low").length },
        ],
      };

      const eventTypeCounts: Record<string, Set<string>> = {};
      for (const a of assets) {
        for (const et of a.eventTypes) {
          if (!eventTypeCounts[et]) eventTypeCounts[et] = new Set();
          eventTypeCounts[et].add(a.name);
        }
      }
      for (const [et, names] of Object.entries(eventTypeCounts)) {
        summary.assetsByEventType[et] = names.size;
      }

      res.json({ assets: assets.slice(0, 200), summary });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message || "Failed to fetch assets" });
    }
  });

  return httpServer;
}
