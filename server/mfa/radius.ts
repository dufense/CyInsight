import type { Express } from "express";
import crypto from "crypto";

interface RadiusConfig {
  host: string;
  port: number;
  secret: string;
}

async function sendRadiusRequest(config: RadiusConfig, username: string, password: string): Promise<boolean> {
  try {
    const { RadiusClient, packets } = await import("node-radius-client") as any;
    const client = new RadiusClient({
      host: config.host,
      hostPort: config.port || 1812,
      timeout: 5000,
    });
    const response = await client.accessRequest({
      secret: config.secret,
      attributes: [
        [packets.ATTRIBUTES["User-Name"], username],
        [packets.ATTRIBUTES["User-Password"], password],
        [packets.ATTRIBUTES["NAS-IP-Address"], "127.0.0.1"],
      ],
    });
    return response.code === "Access-Accept";
  } catch (err) {
    console.error("[RADIUS]", err);
    return false;
  }
}

export function registerRadiusRoutes(app: Express): void {
  app.post("/api/mfa/radius/verify", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

      const { passcode, host, port, secret } = req.body;
      if (!passcode || !host || !secret) {
        return res.status(400).json({ message: "passcode, host, and secret are required" });
      }

      const userId = req.user.claims.sub as string;
      const username = req.user.claims.email || userId;

      const ok = await sendRadiusRequest({ host, port: parseInt(port) || 1812, secret }, username as string, passcode);
      if (!ok) return res.status(401).json({ message: "RADIUS authentication failed" });

      res.json({ success: true, message: "RADIUS MFA verified" });
    } catch (err) {
      console.error("[RADIUS Verify]", err);
      res.status(500).json({ message: "RADIUS verification failed" });
    }
  });

  app.post("/api/mfa/radius/test", async (req: any, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

    const { host, port, secret } = req.body;
    if (!host || !secret) return res.status(400).json({ message: "host and secret are required" });

    try {
      const { RadiusClient } = await import("node-radius-client") as any;
      const client = new RadiusClient({ host, hostPort: parseInt(port) || 1812, timeout: 3000 });
      res.json({ success: true, message: `RADIUS server ${host}:${port || 1812} is reachable` });
    } catch (err) {
      res.status(400).json({ success: false, message: `Cannot reach RADIUS server: ${(err as Error).message}` });
    }
  });
}
