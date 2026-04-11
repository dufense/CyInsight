import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaSecret: varchar("mfa_secret", { length: 255 }),
  ssoProvider: varchar("sso_provider", { length: 50 }),
  ssoExternalId: varchar("sso_external_id", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const ssoProviderEnum = pgEnum("sso_provider_type", [
  "entra_id",
  "google",
  "okta",
  "generic_oidc",
  "saml_miniorange",
  "saml_rsa",
  "saml_generic",
]);

export const tenantSsoConfigs = pgTable("tenant_sso_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  provider: ssoProviderEnum("provider").notNull(),
  displayName: varchar("display_name", { length: 100 }),
  enabled: boolean("enabled").default(true).notNull(),
  enforceSsoOnly: boolean("enforce_sso_only").default(false).notNull(),
  config: jsonb("config").notNull().$type<Record<string, string>>(),
  allowedDomains: text("allowed_domains").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TenantSsoConfig = typeof tenantSsoConfigs.$inferSelect;
export type InsertTenantSsoConfig = typeof tenantSsoConfigs.$inferInsert;

export const mfaDeviceTypeEnum = pgEnum("mfa_device_type", [
  "totp",
  "sms",
  "webauthn",
  "radius",
]);

export const userMfaDevices = pgTable("user_mfa_devices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: mfaDeviceTypeEnum("type").notNull(),
  label: varchar("label", { length: 100 }),
  credential: jsonb("credential").$type<Record<string, unknown>>(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserMfaDevice = typeof userMfaDevices.$inferSelect;
export type InsertUserMfaDevice = typeof userMfaDevices.$inferInsert;
