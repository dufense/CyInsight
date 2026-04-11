import type { Express } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const OTP_EXPIRY_MS = 5 * 60 * 1000;

function generateOtp(): string {
  return (Math.floor(100000 + crypto.randomInt(900000))).toString();
}

async function sendSmsViaSns(phone: string, message: string): Promise<boolean> {
  try {
    const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns") as any;
    const region = process.env.AWS_REGION || process.env.AI_REGION || "us-east-1";
    const client = new SNSClient({ region });
    await client.send(new PublishCommand({
      PhoneNumber: phone,
      Message: message,
    }));
    return true;
  } catch (err) {
    console.error("[SMS OTP] SNS send failed:", err);
    return false;
  }
}

async function sendSms(phone: string, message: string): Promise<boolean> {
  const snsKey = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_REGION;
  if (snsKey) {
    const ok = await sendSmsViaSns(phone, message);
    if (ok) return true;
  }
  console.warn(`[SMS OTP] Would send to ${phone}: ${message}`);
  return true;
}

export function registerSmsOtpRoutes(app: Express): void {
  app.post("/api/mfa/sms/send", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() && !req.session.pendingSmsUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const phone = req.body.phone || req.session.pendingSmsPhone;
      if (!phone) return res.status(400).json({ message: "Phone number required" });

      const otp = generateOtp();
      const hash = await bcrypt.hash(otp, 6);
      const expiry = Date.now() + OTP_EXPIRY_MS;

      req.session.smsOtp = { hash, expiry, phone };
      await sendSms(phone, `Cyber Command Center: Your verification code is ${otp}. Valid for 5 minutes.`);

      res.json({ success: true, message: "OTP sent", maskedPhone: `***${phone.slice(-4)}` });
    } catch (err) {
      console.error("[SMS OTP Send]", err);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/mfa/sms/verify", async (req: any, res) => {
    try {
      const { code } = req.body;
      const otpData = req.session.smsOtp;
      if (!otpData) return res.status(400).json({ message: "No OTP session found" });
      if (Date.now() > otpData.expiry) {
        delete req.session.smsOtp;
        return res.status(400).json({ message: "OTP has expired" });
      }
      const valid = await bcrypt.compare(code, otpData.hash);
      if (!valid) return res.status(401).json({ message: "Invalid code" });
      delete req.session.smsOtp;
      res.json({ success: true, message: "OTP verified successfully" });
    } catch (err) {
      console.error("[SMS OTP Verify]", err);
      res.status(500).json({ message: "OTP verification failed" });
    }
  });
}
