import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { tenantUsers, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Safety guard: seed functions must never run in production.
 * Callers must set SEED_ALLOWED=true to proceed.
 * These are developer-only tools for local setup / dev environments.
 */
function assertSeedAllowed(fnName: string): void {
  if (process.env.SEED_ALLOWED !== "true") {
    throw new Error(
      `[SEED BLOCKED] ${fnName}() refused to run — SEED_ALLOWED is not set to 'true'. ` +
      `Seed scripts must only be executed intentionally in non-production environments. ` +
      `Set SEED_ALLOWED=true to proceed.`
    );
  }
}

// ============================================================
// SAFETY CONTRACT — DO NOT REMOVE OR BYPASS
// ============================================================
// Seed scripts MUST NEVER delete rows from security_integrations.
// That table stores live API credentials (api_base_url, config_json,
// auth tokens) that are irreplaceable without admin intervention.
// Any INSERT into security_integrations must use:
//   ON CONFLICT (tenant_id, platform_key) DO UPDATE SET
//   only non-credential fields: events_imported, last_poll_at,
//   last_poll_status, last_poll_message.
// ============================================================

/** Runtime guard: call this before executing any raw SQL in this module.
 *  Throws if the statement would delete or truncate security_integrations,
 *  preventing accidental destruction of live connector credentials. */
export function assertNotDestructiveIntegrationQuery(sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();
  if (
    normalized.includes("delete") && normalized.includes("security_integrations") ||
    normalized.includes("truncate") && normalized.includes("security_integrations")
  ) {
    throw new Error(
      "[SAFETY ABORT] Seed script attempted to DELETE/TRUNCATE security_integrations. " +
      "This is forbidden — integration credentials must never be destroyed by seed scripts."
    );
  }
}

export async function seedDatabase() {
  assertSeedAllowed("seedDatabase");
  try {
    const passwordHash = await bcrypt.hash("Admin@123", 12);
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
    if (!existingAdmin) {
      const [adminUser] = await db.insert(users).values({
        id: "superadmin-001",
        email: "admin@secureops.local",
        username: "admin",
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
      }).returning();

      const allTenants = await db.select().from(tenants);
      const msspTenant = allTenants.find(t => t.type === "mssp");

      if (msspTenant) {
        const [existingTenantUser] = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, adminUser.id));
        if (!existingTenantUser) {
          await db.insert(tenantUsers).values({
            userId: adminUser.id,
            tenantId: msspTenant.id,
            role: "platform_admin",
            assignedRoles: ["platform_admin", "mss_admin", "mss_analyst", "soc_manager", "security_engineer", "security_analyst", "service_desk", "customer"],
          });
        }
      }

      console.log("Superadmin user created: admin / Admin@123");
    } else {
      await db.update(users).set({ passwordHash }).where(eq(users.username, "admin"));
    }
  } catch (error) {
    console.error("Error seeding superadmin:", error);
  }
}

export async function seedSecurityEvents() {
  assertSeedAllowed("seedSecurityEvents");
}
