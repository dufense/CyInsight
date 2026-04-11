import type { Express } from "express";
import { db } from "../db";
import { users, tenantSsoConfigs } from "@shared/models/auth";
import { eq, and } from "drizzle-orm";
import passport from "passport";
import { Strategy as SamlStrategy } from "@node-saml/passport-saml";

const registeredStrategies = new Set<string>();

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

async function jitProvisionUser(email: string, firstName: string, lastName: string, provider: string, externalId: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (!existing.ssoExternalId) {
      await db.update(users).set({ ssoProvider: provider, ssoExternalId: externalId, updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
    return existing;
  }
  const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase() + "_sso";
  const [created] = await db.insert(users).values({
    email, username, firstName, lastName, ssoProvider: provider, ssoExternalId: externalId, mfaEnabled: false,
  }).returning();
  return created;
}

function buildSessionUser(user: any) {
  return {
    claims: { sub: user.id, email: user.email, first_name: user.firstName, last_name: user.lastName },
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    authMethod: "sso",
    ssoProvider: user.ssoProvider,
  };
}

async function ensureSamlStrategy(cfg: any, callbackUrl: string): Promise<string> {
  const strategyName = `saml_tenant_${cfg.tenantId}`;
  if (registeredStrategies.has(strategyName)) return strategyName;

  const config = cfg.config as Record<string, string>;
  const strategy = new SamlStrategy(
    {
      callbackUrl,
      entryPoint: config.idpSsoUrl,
      issuer: config.spEntityId || `urn:cyber-command-center:tenant:${cfg.tenantId}`,
      cert: config.idpCertificate,
      signatureAlgorithm: "sha256",
      wantAuthnResponseSigned: false,
    },
    async (profile: any, done: any) => {
      try {
        const email = profile.email || profile.nameID || profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"];
        const firstName = profile.firstName || profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] || "";
        const lastName = profile.lastName || profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"] || "";
        const user = await jitProvisionUser(email, firstName, lastName, cfg.provider, profile.nameID);
        done(null, user);
      } catch (err) {
        done(err);
      }
    },
    async (_profile: any, done: any) => done(null, false)
  );

  passport.use(strategyName, strategy);
  registeredStrategies.add(strategyName);
  return strategyName;
}

export function registerSamlRoutes(app: Express): void {
  app.get("/auth/sso/saml/login", async (req: any, res, next) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId) return res.status(400).send("tenantId required");

      const [cfg] = await db.select().from(tenantSsoConfigs).where(
        and(eq(tenantSsoConfigs.tenantId, parseInt(tenantId as string)), eq(tenantSsoConfigs.enabled, true))
      );
      if (!cfg) return res.status(404).send("No SAML SSO configured for this tenant");

      const isSaml = cfg.provider.startsWith("saml_");
      if (!isSaml) return res.status(400).send("Tenant SSO is not SAML");

      const baseUrl = getBaseUrl(req);
      const callbackUrl = `${baseUrl}/auth/sso/saml/callback?tenantId=${tenantId}`;
      const strategyName = await ensureSamlStrategy(cfg, callbackUrl);

      (req as any).__samlTenantId = tenantId;
      passport.authenticate(strategyName)(req, res, next);
    } catch (err) {
      console.error("[SAML Login]", err);
      res.status(500).send("SAML initialization failed");
    }
  });

  app.post("/auth/sso/saml/callback", async (req: any, res, next) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId) return res.status(400).send("tenantId required");

      const [cfg] = await db.select().from(tenantSsoConfigs).where(
        and(eq(tenantSsoConfigs.tenantId, parseInt(tenantId as string)), eq(tenantSsoConfigs.enabled, true))
      );
      if (!cfg) return res.redirect(`/?ssoError=no_config`);

      const baseUrl = getBaseUrl(req);
      const callbackUrl = `${baseUrl}/auth/sso/saml/callback?tenantId=${tenantId}`;
      const strategyName = await ensureSamlStrategy(cfg, callbackUrl);

      passport.authenticate(strategyName, { session: false }, async (err: any, samlUser: any) => {
        if (err || !samlUser) {
          console.error("[SAML Callback]", err);
          return res.redirect(`/?ssoError=saml_failed`);
        }

        if (cfg.allowedDomains && cfg.allowedDomains.length > 0) {
          const domain = samlUser.email?.split("@")[1]?.toLowerCase();
          if (!cfg.allowedDomains.some((d: string) => d.toLowerCase() === domain)) {
            return res.redirect(`/?ssoError=domain_not_allowed`);
          }
        }

        const user = await jitProvisionUser(samlUser.email, samlUser.firstName, samlUser.lastName, cfg.provider, samlUser.id);
        await new Promise<void>((resolve, reject) => {
          req.login(buildSessionUser(user), (e: Error) => (e ? reject(e) : resolve()));
        });
        res.redirect("/dashboard");
      })(req, res, next);
    } catch (err) {
      console.error("[SAML Callback]", err);
      res.redirect(`/?ssoError=callback_failed`);
    }
  });

  app.get("/auth/sso/metadata/:tenantSlug", async (req: any, res) => {
    try {
      const { tenantSlug } = req.params;
      const tenantId = parseInt(tenantSlug);
      if (isNaN(tenantId)) return res.status(400).send("Invalid tenantId");

      const [cfg] = await db.select().from(tenantSsoConfigs).where(
        and(eq(tenantSsoConfigs.tenantId, tenantId), eq(tenantSsoConfigs.enabled, true))
      );
      if (!cfg || !cfg.provider.startsWith("saml_")) return res.status(404).send("No SAML config found");

      const baseUrl = getBaseUrl(req);
      const callbackUrl = `${baseUrl}/auth/sso/saml/callback?tenantId=${tenantId}`;
      const config = cfg.config as Record<string, string>;
      const entityId = config.spEntityId || `urn:cyber-command-center:tenant:${tenantId}`;

      const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${callbackUrl}" index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

      res.set("Content-Type", "application/xml");
      res.send(metadata);
    } catch (err) {
      res.status(500).send("Failed to generate metadata");
    }
  });
}
