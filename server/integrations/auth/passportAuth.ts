import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import RedisStore from "connect-redis";
import { authStorage } from "./storage";
import bcrypt from "bcryptjs";
import { users, tenantSsoConfigs } from "@shared/models/auth";
import { db, pool } from "../../db";
import { eq, and } from "drizzle-orm";
import { getRedisClient } from "../../cache";

export function getSession() {
  const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
  const sessionTtlSec = sessionTtlMs / 1000;

  let sessionStore: session.Store;

  // Decision based on REDIS_URL config (not connection readiness at call time)
  // so that the Redis store is always chosen when Redis is configured, even if
  // the async connection hasn't fully established yet at startup.
  if (process.env.REDIS_URL) {
    const redisClient = getRedisClient();
    if (redisClient) {
      sessionStore = new RedisStore({
        client: redisClient,
        prefix: "ccc:sess:",
        ttl: sessionTtlSec,
        // connect-redis handles Redis errors internally; sessions degrade
        // gracefully (are not persisted) when Redis is temporarily unavailable.
      });
      console.log("[Session] Using Redis session store (connect-redis)");
    } else {
      // Fallback: Redis URL set but client failed to initialise
      const PgStore = connectPg(session);
      sessionStore = new PgStore({ pool, createTableIfMissing: true, ttl: sessionTtlSec, tableName: "sessions" });
      console.warn("[Session] Redis URL set but client unavailable — using PostgreSQL session store");
    }
  } else {
    const PgStore = connectPg(session);
    sessionStore = new PgStore({ pool, createTableIfMissing: true, ttl: sessionTtlSec, tableName: "sessions" });
  }

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: sessionTtlMs,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password, mfaToken } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const [user] = await db.select().from(users).where(eq(users.username, username));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.ssoProvider && !user.passwordHash) {
        return res.status(401).json({
          message: "This account uses SSO login. Please sign in with your identity provider.",
          ssoRequired: true,
          ssoProvider: user.ssoProvider,
        });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.mfaEnabled && user.mfaSecret) {
        if (!mfaToken) {
          return res.status(200).json({ requireMfa: true, mfaType: "totp", message: "MFA verification required" });
        }
        // Native crypto TOTP verification (no otplib)
        const isMfaValid = (() => {
          const { createHmac } = require("crypto");
          const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          const s = user.mfaSecret.replace(/=+$/, "").toUpperCase();
          let bits = 0, val = 0; const out: number[] = [];
          for (const c of s) { const idx = alpha.indexOf(c); if (idx < 0) continue; val = (val << 5) | idx; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
          const key = Buffer.from(out);
          const now = Math.floor(Date.now() / 30000);
          return [-1, 0, 1].some(delta => {
            const t = now + delta; const time = Buffer.alloc(8); time.writeBigUInt64BE(BigInt(t));
            const hmac = createHmac("sha1", key).update(time).digest();
            const offset = hmac[19] & 0xf;
            const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset+1] << 16 | hmac[offset+2] << 8 | hmac[offset+3]) % 1000000;
            return String(code).padStart(6, "0") === String(mfaToken);
          });
        })();
        if (!isMfaValid) {
          return res.status(401).json({ message: "Invalid MFA code" });
        }
      }

      const { tenantUsers: tenantUsersTable } = await import("@shared/schema");
      if (user.email) {
        const userTenantEntries = await db.select().from(tenantUsersTable).where(eq(tenantUsersTable.userId, user.id));
        if (userTenantEntries.length > 0) {
          const { tenants: tenantsTable } = await import("@shared/schema");
          for (const tu of userTenantEntries) {
            const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tu.tenantId));
            if (tenant && (tenant as any).allowedEmailDomains && (tenant as any).allowedEmailDomains.length > 0) {
              const emailDomain = user.email.split("@")[1]?.toLowerCase();
              const allowed = (tenant as any).allowedEmailDomains.some((d: string) => d.toLowerCase() === emailDomain);
              if (!allowed) {
                return res.status(403).json({ message: `Access denied. Your email domain is not authorized for ${tenant.name}. Allowed domains: ${(tenant as any).allowedEmailDomains.join(", ")}` });
              }
            }
          }
        }
      }

      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
        },
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        authMethod: "password",
      };

      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        return res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });

  app.get("/api/auth/sso-check", async (req, res) => {
    try {
      const { email } = req.query as { email: string };
      if (!email || !email.includes("@")) return res.json({ hasSSO: false });

      const domain = email.split("@")[1]?.toLowerCase();
      const configs = await db.select().from(tenantSsoConfigs).where(eq(tenantSsoConfigs.enabled, true));
      const match = configs.find((cfg) => {
        if (!cfg.allowedDomains || cfg.allowedDomains.length === 0) return false;
        return cfg.allowedDomains.some((d) => d.toLowerCase() === domain);
      });

      if (!match) return res.json({ hasSSO: false });

      const providerLabels: Record<string, string> = {
        entra_id: "Microsoft",
        google: "Google",
        okta: "Okta",
        generic_oidc: "SSO",
        saml_miniorange: "miniOrange",
        saml_rsa: "RSA SecurID",
        saml_generic: "SSO",
      };

      const isOidc = ["entra_id", "google", "okta", "generic_oidc"].includes(match.provider);
      res.json({
        hasSSO: true,
        provider: match.provider,
        displayName: match.displayName || providerLabels[match.provider] || "SSO",
        tenantId: match.tenantId,
        loginUrl: isOidc
          ? `/auth/sso/oidc/login?tenantId=${match.tenantId}`
          : `/auth/sso/saml/login?tenantId=${match.tenantId}`,
      });
    } catch (err) {
      console.error("[SSO Check]", err);
      res.json({ hasSSO: false });
    }
  });

  const { registerOidcRoutes } = await import("../../sso/oidc-strategies");
  const { registerSamlRoutes } = await import("../../sso/saml-strategies");
  const { registerWebAuthnRoutes } = await import("../../mfa/webauthn");
  const { registerSmsOtpRoutes } = await import("../../mfa/sms-otp");
  const { registerRadiusRoutes } = await import("../../mfa/radius");

  registerOidcRoutes(app);
  registerSamlRoutes(app);
  registerWebAuthnRoutes(app);
  registerSmsOtpRoutes(app);
  registerRadiusRoutes(app);
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (user.expires_at && now > user.expires_at) {
    return res.status(401).json({ message: "Session expired" });
  }

  return next();
};
