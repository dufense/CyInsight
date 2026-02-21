import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { tenantUsers, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  try {
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash("Admin@123", 12);
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
    }
  } catch (error) {
    console.error("Error seeding superadmin:", error);
  }
}

export async function seedSecurityEvents() {
}
