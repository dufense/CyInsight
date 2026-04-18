/**
 * Task #194 — Platform-level on-call recipient list.
 *
 * Both the stalled-ingest monitor and the ClickHouse fast-path monitor want to
 * page a single on-call inbox whenever the platform is degraded, regardless of
 * which tenant is affected and regardless of whether that tenant has an email
 * configuration of its own.
 *
 * Recipients are read from two sources and merged (deduplicated):
 *   1. The `PLATFORM_ONCALL_EMAILS` environment variable (comma/semicolon
 *      separated). Useful for bootstrapping before the DB row exists and for
 *      single-tenant deployments.
 *   2. The `platform_oncall` row in `platform_settings`, value shape:
 *        { "emails": ["a@x.com", "b@x.com"] }
 *      so admins can update the list at runtime without a redeploy.
 *
 * Sending uses any active `email_configurations` row as transport — preferring
 * the default config of the lowest-numbered tenant (typically the platform
 * tenant) — so on-call mail goes out even when the affected tenant has no
 * email plumbing of its own.
 */

import { pool } from "./db";
import { sendEmail } from "./email-service";
import type { EmailConfiguration } from "@shared/schema";

export const PLATFORM_ONCALL_SETTINGS_KEY = "platform_oncall";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function logInfo(msg: string): void {
  console.log(`[PlatformOnCall] ${msg}`);
}
function logErr(msg: string): void {
  console.error(`[PlatformOnCall] ${msg}`);
}

function parseList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(v => String(v ?? "").trim()).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function dedupeEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = v.toLowerCase();
    if (!EMAIL_RE.test(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export async function getPlatformOnCallEmails(): Promise<string[]> {
  const fromEnv = parseList(process.env.PLATFORM_ONCALL_EMAILS);
  let fromDb: string[] = [];
  try {
    const r = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [PLATFORM_ONCALL_SETTINGS_KEY],
    );
    const v = r.rows[0]?.value;
    if (v && typeof v === "object") {
      fromDb = parseList((v as any).emails);
    }
  } catch (err: any) {
    logErr(`Failed to load platform on-call list from DB: ${err?.message || err}`);
  }
  return dedupeEmails([...fromEnv, ...fromDb]);
}

async function pickTransportConfig(): Promise<EmailConfiguration | null> {
  try {
    const r = await pool.query(
      `SELECT * FROM email_configurations
        WHERE is_active = true
        ORDER BY tenant_id ASC, is_default DESC, id ASC
        LIMIT 1`,
    );
    return (r.rows[0] as EmailConfiguration | undefined) || null;
  } catch (err: any) {
    logErr(`Failed to load transport config: ${err?.message || err}`);
    return null;
  }
}

export interface PlatformOnCallEmailOptions {
  subject: string;
  html: string;
}

export interface PlatformOnCallEmailResult {
  attempted: boolean;
  recipients: number;
  success: boolean;
  reason?: string;
}

export async function sendPlatformOnCallEmail(
  opts: PlatformOnCallEmailOptions,
): Promise<PlatformOnCallEmailResult> {
  const recipients = await getPlatformOnCallEmails();
  if (recipients.length === 0) {
    return { attempted: false, recipients: 0, success: false, reason: "no_recipients_configured" };
  }
  const cfg = await pickTransportConfig();
  if (!cfg) {
    logErr(
      `On-call list has ${recipients.length} address(es) but no active email_configurations ` +
      `row exists to use as transport — alert will not be delivered.`,
    );
    return {
      attempted: false,
      recipients: recipients.length,
      success: false,
      reason: "no_transport_config",
    };
  }
  try {
    const result = await sendEmail(cfg, {
      to: recipients,
      subject: opts.subject,
      html: opts.html,
    });
    if (result.success) {
      logInfo(`Sent on-call alert to ${recipients.length} recipient(s) via ${cfg.provider}.`);
      return { attempted: true, recipients: recipients.length, success: true };
    }
    logErr(`On-call email send failed: ${result.error}`);
    return {
      attempted: true,
      recipients: recipients.length,
      success: false,
      reason: result.error,
    };
  } catch (err: any) {
    logErr(`On-call email dispatch error: ${err?.message || err}`);
    return {
      attempted: true,
      recipients: recipients.length,
      success: false,
      reason: err?.message || String(err),
    };
  }
}

export function getPlatformHealthUrl(): string {
  const base = (process.env.APP_BASE_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/platform-health` : "/platform-health";
}
