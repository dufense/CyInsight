import type { Express } from "express";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { tenantSsoConfigs } from "@shared/models/auth";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

interface OidcCallbackUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  ssoProvider: string;
  ssoExternalId: string;
}

async function discoverAndBuildClient(issuer: string, clientId: string, clientSecret: string, redirectUri: string) {
  const { Issuer } = await import("openid-client") as any;
  const discovered = await Issuer.discover(issuer);
  return new discovered.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ["code"],
  });
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

async function jitProvisionUser(email: string, firstName: string, lastName: string, provider: string, externalId: string): Promise<OidcCallbackUser> {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (!existing.ssoExternalId) {
      await db.update(users).set({ ssoProvider: provider, ssoExternalId: externalId, updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
    return { id: existing.id, email: existing.email!, firstName: existing.firstName ?? undefined, lastName: existing.lastName ?? undefined, ssoProvider: provider, ssoExternalId: externalId };
  }
  const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase() + "_sso";
  const [created] = await db.insert(users).values({
    email,
    username,
    firstName,
    lastName,
    ssoProvider: provider,
    ssoExternalId: externalId,
    mfaEnabled: false,
  }).returning();
  return { id: created.id, email: created.email!, firstName: created.firstName ?? undefined, lastName: created.lastName ?? undefined, ssoProvider: provider, ssoExternalId: externalId };
}

function buildSessionUser(user: OidcCallbackUser) {
  return {
    claims: {
      sub: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
    },
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    authMethod: "sso",
    ssoProvider: user.ssoProvider,
  };
}

const stateStore = new Map<string, { tenantId: number; provider: string; nonce?: string; redirectTo?: string }>();

export function registerOidcRoutes(app: Express): void {
  app.get("/auth/sso/oidc/login", async (req: any, res) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId) return res.status(400).send("tenantId required");

      const [cfg] = await db.select().from(tenantSsoConfigs).where(
        and(eq(tenantSsoConfigs.tenantId, parseInt(tenantId)), eq(tenantSsoConfigs.enabled, true))
      );
      if (!cfg) return res.status(404).send("No SSO configured for this tenant");

      const isOidc = ["entra_id", "google", "okta", "generic_oidc"].includes(cfg.provider);
      if (!isOidc) return res.status(400).send("Tenant SSO is not OIDC");

      const config = cfg.config as Record<string, string>;
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/auth/sso/oidc/callback`;

      let issuer: string;
      if (cfg.provider === "entra_id") {
        issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
      } else if (cfg.provider === "google") {
        issuer = "https://accounts.google.com";
      } else if (cfg.provider === "okta") {
        issuer = `https://${config.oktaDomain}/oauth2/default`;
      } else {
        issuer = config.discoveryUrl;
      }

      const client = await discoverAndBuildClient(issuer, config.clientId, config.clientSecret, redirectUri);
      const state = crypto.randomBytes(16).toString("hex");
      const nonce = crypto.randomBytes(16).toString("hex");
      stateStore.set(state, { tenantId: parseInt(tenantId), provider: cfg.provider, nonce });
      setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);

      const url = client.authorizationUrl({ scope: "openid email profile", state, nonce });
      res.redirect(url);
    } catch (err) {
      console.error("[OIDC Login]", err);
      res.status(500).send("SSO initialization failed");
    }
  });

  app.get("/auth/sso/oidc/callback", async (req: any, res) => {
    try {
      const { state } = req.query;
      const meta = stateStore.get(state as string);
      if (!meta) return res.status(400).send("Invalid or expired SSO state");
      stateStore.delete(state as string);

      const [cfg] = await db.select().from(tenantSsoConfigs).where(
        and(eq(tenantSsoConfigs.tenantId, meta.tenantId), eq(tenantSsoConfigs.enabled, true))
      );
      if (!cfg) return res.status(404).send("SSO config not found");

      const config = cfg.config as Record<string, string>;
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/auth/sso/oidc/callback`;

      let issuer: string;
      if (cfg.provider === "entra_id") {
        issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
      } else if (cfg.provider === "google") {
        issuer = "https://accounts.google.com";
      } else if (cfg.provider === "okta") {
        issuer = `https://${config.oktaDomain}/oauth2/default`;
      } else {
        issuer = config.discoveryUrl;
      }

      const client = await discoverAndBuildClient(issuer, config.clientId, config.clientSecret, redirectUri);
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(redirectUri, params, { state: state as string, nonce: meta.nonce });
      const claims = tokenSet.claims();

      const email = claims.email as string;
      const firstName = (claims.given_name ?? claims.name ?? email.split("@")[0]) as string;
      const lastName = (claims.family_name ?? "") as string;
      const sub = claims.sub;

      if (cfg.allowedDomains && cfg.allowedDomains.length > 0) {
        const domain = email.split("@")[1]?.toLowerCase();
        if (!cfg.allowedDomains.some((d) => d.toLowerCase() === domain)) {
          return res.redirect(`/?ssoError=domain_not_allowed`);
        }
      }

      const user = await jitProvisionUser(email, firstName, lastName, cfg.provider, sub);

      await new Promise<void>((resolve, reject) => {
        req.login(buildSessionUser(user), (err: Error) => (err ? reject(err) : resolve()));
      });
      res.redirect("/dashboard");
    } catch (err) {
      console.error("[OIDC Callback]", err);
      res.redirect(`/?ssoError=callback_failed`);
    }
  });
}
