import type { Express } from "express";
import { db } from "../db";
import { userMfaDevices } from "@shared/models/auth";
import { eq, and } from "drizzle-orm";

type RP_NAME = string;
const RP_NAME: RP_NAME = "Cyber Command Center";
const RP_ID_MAP = new Map<string, string>();

function getRpId(req: any): string {
  const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost";
  return host.split(":")[0];
}

export function registerWebAuthnRoutes(app: Express): void {
  app.get("/api/mfa/webauthn/register-options", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const userId = req.user.claims.sub as string;
      const userEmail = req.user.claims.email as string;

      const { generateRegistrationOptions } = await import("@simplewebauthn/server") as any;
      const rpId = getRpId(req);

      const existing = await db.select().from(userMfaDevices).where(
        and(eq(userMfaDevices.userId, userId), eq(userMfaDevices.type, "webauthn"))
      );
      const excludeCredentials = existing.map((d) => ({
        id: (d.credential as any)?.credentialId,
        type: "public-key",
      })).filter((c) => c.id);

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpId,
        userID: Buffer.from(userId),
        userName: userEmail || userId,
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });

      req.session.webauthnChallenge = options.challenge;
      req.session.webauthnRpId = rpId;
      res.json(options);
    } catch (err) {
      console.error("[WebAuthn Register Options]", err);
      res.status(500).json({ message: "Failed to generate registration options" });
    }
  });

  app.post("/api/mfa/webauthn/register", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const userId = req.user.claims.sub as string;
      const { credential, label } = req.body;

      const { verifyRegistrationResponse } = await import("@simplewebauthn/server") as any;
      const expectedChallenge = req.session.webauthnChallenge;
      const rpId = req.session.webauthnRpId || getRpId(req);
      const proto = req.headers["x-forwarded-proto"] || req.protocol;

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: `${proto}://${req.headers["x-forwarded-host"] || req.get("host")}`,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ message: "WebAuthn registration verification failed" });
      }

      delete req.session.webauthnChallenge;
      delete req.session.webauthnRpId;

      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
      await db.insert(userMfaDevices).values({
        userId,
        type: "webauthn",
        label: label || "Security Key",
        credential: {
          credentialId: Buffer.from(credentialID).toString("base64url"),
          publicKey: Buffer.from(credentialPublicKey).toString("base64"),
          counter,
          rpId,
        },
      });

      res.json({ success: true, message: "Security key registered successfully" });
    } catch (err) {
      console.error("[WebAuthn Register]", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.get("/api/mfa/webauthn/auth-options", async (req: any, res) => {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ message: "userId required" });

      const { generateAuthenticationOptions } = await import("@simplewebauthn/server") as any;
      const rpId = getRpId(req);

      const devices = await db.select().from(userMfaDevices).where(
        and(eq(userMfaDevices.userId, userId as string), eq(userMfaDevices.type, "webauthn"))
      );

      const allowCredentials = devices.map((d) => ({
        id: (d.credential as any)?.credentialId,
        type: "public-key",
      })).filter((c) => c.id);

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials,
        userVerification: "preferred",
      });

      req.session.webauthnAuthChallenge = options.challenge;
      req.session.webauthnAuthUserId = userId;
      req.session.webauthnAuthRpId = rpId;
      res.json(options);
    } catch (err) {
      console.error("[WebAuthn Auth Options]", err);
      res.status(500).json({ message: "Failed to generate auth options" });
    }
  });

  app.post("/api/mfa/webauthn/auth", async (req: any, res) => {
    try {
      const { credential } = req.body;
      const userId = req.session.webauthnAuthUserId;
      if (!userId) return res.status(400).json({ message: "No authentication session found" });

      const { verifyAuthenticationResponse } = await import("@simplewebauthn/server") as any;

      const devices = await db.select().from(userMfaDevices).where(
        and(eq(userMfaDevices.userId, userId), eq(userMfaDevices.type, "webauthn"))
      );

      const credId = credential.id;
      const device = devices.find((d) => (d.credential as any)?.credentialId === credId);
      if (!device) return res.status(400).json({ message: "Credential not found" });

      const credData = device.credential as any;
      const rpId = req.session.webauthnAuthRpId || getRpId(req);
      const proto = req.headers["x-forwarded-proto"] || req.protocol;

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: req.session.webauthnAuthChallenge,
        expectedOrigin: `${proto}://${req.headers["x-forwarded-host"] || req.get("host")}`,
        expectedRPID: rpId,
        authenticator: {
          credentialID: Buffer.from(credData.credentialId, "base64url"),
          credentialPublicKey: Buffer.from(credData.publicKey, "base64"),
          counter: credData.counter,
        },
      });

      if (!verification.verified) return res.status(401).json({ message: "WebAuthn verification failed" });

      await db.update(userMfaDevices)
        .set({ lastUsedAt: new Date(), credential: { ...credData, counter: verification.authenticationInfo.newCounter } })
        .where(eq(userMfaDevices.id, device.id));

      delete req.session.webauthnAuthChallenge;
      delete req.session.webauthnAuthUserId;
      delete req.session.webauthnAuthRpId;

      res.json({ success: true, userId });
    } catch (err) {
      console.error("[WebAuthn Auth]", err);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
}
