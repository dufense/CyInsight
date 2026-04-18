/**
 * Task #197 — Periodic email digest of platform_settings_audit changes.
 *
 * The Platform Health page already shows audit history for changes to
 * platform-tunable alert thresholds, but governance / incident review is
 * easier when admins also receive a periodic email summary. This module:
 *
 *   - Periodically aggregates new `platform_settings_audit` rows since the
 *     last digest send and emails the platform on-call inbox a short summary
 *     (key, before -> after, who, when).
 *   - Sends nothing for empty periods — but still advances the persisted
 *     last-sent timestamp so subsequent digests cover the next window only.
 *   - Persists the last-sent timestamp in `platform_settings` so the schedule
 *     survives restarts.
 *
 * Settings row in platform_settings:
 *   key   = "platform_settings_audit_digest"
 *   value = { lastSentAt: ISO string | null, periodHours: number, enabled: bool }
 */

import { pool } from "./db";
import { sendPlatformOnCallEmail } from "./platform-oncall";
import { sendEmail } from "./email-service";
import type { EmailConfiguration } from "@shared/schema";

export const PLATFORM_SETTINGS_AUDIT_DIGEST_KEY = "platform_settings_audit_digest";

interface DigestState {
  lastSentAt: string | null;
  periodHours: number;
  enabled: boolean;
}

const ENV_PERIOD_HOURS = (() => {
  const raw = parseInt(process.env.PLATFORM_SETTINGS_AUDIT_DIGEST_PERIOD_HOURS || "168", 10);
  if (!Number.isFinite(raw)) return 168; // 7 days
  return Math.min(24 * 365, Math.max(1, raw));
})();

const ENV_ENABLED = process.env.PLATFORM_SETTINGS_AUDIT_DIGEST_DISABLED !== "1";

const TICK_INTERVAL_MS = Math.max(
  60_000,
  parseInt(process.env.PLATFORM_SETTINGS_AUDIT_DIGEST_TICK_SECONDS || "3600", 10) * 1000 || 3_600_000,
);

let tickTimer: NodeJS.Timeout | null = null;
let running = false;

function logInfo(msg: string): void {
  console.log(`[PlatformSettingsAuditDigest] ${msg}`);
}
function logErr(msg: string): void {
  console.error(`[PlatformSettingsAuditDigest] ${msg}`);
}

function normalizeState(raw: any): DigestState {
  const r = (raw && typeof raw === "object") ? raw : {};
  const periodHours = (() => {
    const n = typeof r.periodHours === "number" ? r.periodHours : parseInt(String(r.periodHours ?? ""), 10);
    if (!Number.isFinite(n)) return ENV_PERIOD_HOURS;
    return Math.min(24 * 365, Math.max(1, Math.round(n)));
  })();
  const lastSentAt = typeof r.lastSentAt === "string" && r.lastSentAt ? r.lastSentAt : null;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : ENV_ENABLED;
  return { lastSentAt, periodHours, enabled };
}

async function loadState(): Promise<DigestState> {
  try {
    const r = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [PLATFORM_SETTINGS_AUDIT_DIGEST_KEY],
    );
    if (r.rows[0]?.value) return normalizeState(r.rows[0].value);
  } catch (err: any) {
    logErr(`Failed to load digest state: ${err?.message || err}`);
  }
  return { lastSentAt: null, periodHours: ENV_PERIOD_HOURS, enabled: ENV_ENABLED };
}

async function saveState(state: DigestState): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [PLATFORM_SETTINGS_AUDIT_DIGEST_KEY, JSON.stringify(state), "platform_settings_audit_digest"],
    );
  } catch (err: any) {
    logErr(`Failed to persist digest state: ${err?.message || err}`);
  }
}

interface AuditRow {
  id: number;
  key: string;
  prevValue: any;
  newValue: any;
  changedBy: string | null;
  changedAt: Date;
}

async function loadAuditWindow(sinceIso: string, untilIso: string): Promise<AuditRow[]> {
  // NOTE: deliberately let errors propagate. The caller MUST distinguish a
  // genuinely empty window (advance lastSentAt) from a query failure (do not
  // advance, retry next tick) — otherwise transient DB errors would silently
  // skip audit rows forever.
  // The upper bound (`<= untilIso`) is what we'll persist as the new
  // checkpoint, eliminating drift at window boundaries.
  const r = await pool.query(
    `SELECT id, key, prev_value, new_value, changed_by, changed_at
       FROM platform_settings_audit
      WHERE changed_at > $1 AND changed_at <= $2
      ORDER BY changed_at ASC, id ASC`,
    [sinceIso, untilIso],
  );
  return r.rows.map((row: any) => ({
    id: Number(row.id),
    key: String(row.key),
    prevValue: row.prev_value,
    newValue: row.new_value,
    changedBy: row.changed_by ?? null,
    changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
  }));
}

/**
 * Resolve the email recipients for the digest. Combines the platform on-call
 * list (configurable, used by other platform-wide alerts) with all
 * platform_admin / mss_admin users across tenants — the latter is what the
 * task description explicitly asks for ("email platform admins"). Result is
 * deduplicated and lowercased.
 */
async function resolveAdminRecipients(): Promise<string[]> {
  const out = new Set<string>();
  // Platform admins / MSS admins across all tenants — same query the
  // ClickHouse ingest monitor uses to find admin recipients.
  try {
    const r = await pool.query(
      `SELECT DISTINCT LOWER(u.email) AS email
         FROM tenant_users tu
         JOIN users u ON u.id::text = tu.user_id
        WHERE tu.role IN ('platform_admin', 'mss_admin')
          AND u.email IS NOT NULL`,
    );
    for (const row of r.rows) {
      const e = String(row.email || "").trim();
      if (e) out.add(e);
    }
  } catch (err: any) {
    logErr(`Failed to load admin recipients: ${err?.message || err}`);
  }
  return Array.from(out);
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
    logErr(`Failed to load email transport config: ${err?.message || err}`);
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function diffFields(prev: any, next: any): Array<{ field: string; before: string; after: string }> {
  const out: Array<{ field: string; before: string; after: string }> = [];
  const keys = new Set<string>();
  if (prev && typeof prev === "object") for (const k of Object.keys(prev)) keys.add(k);
  if (next && typeof next === "object") for (const k of Object.keys(next)) keys.add(k);
  // If we couldn't introspect (non-object payloads), fall back to a single
  // whole-value diff so the email still has *something* useful.
  if (keys.size === 0) {
    return [{
      field: "value",
      before: prev === null || prev === undefined ? "—" : JSON.stringify(prev),
      after: next === null || next === undefined ? "—" : JSON.stringify(next),
    }];
  }
  for (const k of Array.from(keys).sort()) {
    const a = prev && typeof prev === "object" ? prev[k] : undefined;
    const b = next && typeof next === "object" ? next[k] : undefined;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({
      field: k,
      before: a === undefined ? "—" : typeof a === "object" ? JSON.stringify(a) : String(a),
      after: b === undefined ? "—" : typeof b === "object" ? JSON.stringify(b) : String(b),
    });
  }
  return out;
}

export function renderDigestHtml(opts: {
  rows: AuditRow[];
  windowStart: Date;
  windowEnd: Date;
  periodHours: number;
}): string {
  const rowHtml = opts.rows.map(row => {
    const diffs = diffFields(row.prevValue, row.newValue);
    const diffHtml = diffs.length === 0
      ? `<em style="color:#9ca3af;">no field-level diff</em>`
      : diffs.map(d =>
          `<div style="padding:2px 0;font-size:13px;color:#1f2937;">` +
          `<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">${escapeHtml(d.field)}</code>: ` +
          `<span style="color:#dc2626;text-decoration:line-through;">${escapeHtml(d.before)}</span> ` +
          `→ <span style="color:#059669;font-weight:600;">${escapeHtml(d.after)}</span>` +
          `</div>`,
        ).join("");
    const who = row.changedBy ? escapeHtml(row.changedBy) : `<em style="color:#9ca3af;">unknown</em>`;
    return `
      <tr>
        <td style="padding:10px 12px;border-top:1px solid #e5e7eb;vertical-align:top;font-size:13px;color:#111827;">
          <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">${escapeHtml(row.key)}</code>
        </td>
        <td style="padding:10px 12px;border-top:1px solid #e5e7eb;vertical-align:top;">
          ${diffHtml}
        </td>
        <td style="padding:10px 12px;border-top:1px solid #e5e7eb;vertical-align:top;font-size:13px;color:#374151;white-space:nowrap;">
          ${who}
        </td>
        <td style="padding:10px 12px;border-top:1px solid #e5e7eb;vertical-align:top;font-size:12px;color:#6b7280;white-space:nowrap;">
          ${escapeHtml(row.changedAt.toISOString())}
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;">
      <div style="background:#1e40af;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Platform Settings Change Digest</h2>
        <div style="margin-top:4px;font-size:12px;opacity:0.85;">
          ${escapeHtml(opts.windowStart.toISOString())} → ${escapeHtml(opts.windowEnd.toISOString())}
          (${opts.periodHours}h window)
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:16px 0 0 0;border-radius:0 0 8px 8px;">
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 16px 12px 16px;">
          The following <strong>${opts.rows.length}</strong> change${opts.rows.length === 1 ? "" : "s"} were made to platform-tunable alert thresholds in the last period.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Setting</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Change</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Who</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">When (UTC)</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
        <p style="margin:14px 16px 16px 16px;font-size:12px;color:#9ca3af;">
          Open the Platform Health dashboard for the full audit trail.
        </p>
      </div>
    </div>`;
}

export interface DigestRunResult {
  ran: boolean;
  reason?: string;
  rowCount: number;
  windowStart?: string;
  windowEnd?: string;
  emailSent?: boolean;
  emailSkippedReason?: string;
}

/**
 * Run a single digest evaluation. Exported for tests and manual triggers.
 * If `force` is true, send even if the period hasn't elapsed (still no-op
 * when there are zero rows).
 */
export async function runPlatformSettingsAuditDigestOnce(
  opts: { force?: boolean; now?: Date } = {},
): Promise<DigestRunResult> {
  const now = opts.now ?? new Date();
  const state = await loadState();

  if (!state.enabled) {
    return { ran: false, reason: "disabled", rowCount: 0 };
  }

  const periodMs = state.periodHours * 60 * 60 * 1000;
  const lastSent = state.lastSentAt ? new Date(state.lastSentAt) : null;

  // Bootstrap: if there's no last-sent timestamp, anchor it to "now" so the
  // first real digest covers the next full period rather than every audit row
  // that has ever existed.
  if (!lastSent) {
    const next: DigestState = { ...state, lastSentAt: now.toISOString() };
    await saveState(next);
    logInfo(`Bootstrapped lastSentAt to ${next.lastSentAt} — first digest in ${state.periodHours}h.`);
    return { ran: false, reason: "bootstrap", rowCount: 0 };
  }

  const elapsedMs = now.getTime() - lastSent.getTime();
  if (!opts.force && elapsedMs < periodMs) {
    return { ran: false, reason: "period_not_elapsed", rowCount: 0 };
  }

  // Load audit rows. If the query fails (transient DB error), bail out
  // WITHOUT advancing lastSentAt so the same window is retried on the next
  // tick — otherwise a single DB blip would silently drop changes from the
  // digest forever.
  const windowStart = lastSent;
  const windowEnd = now;
  let rows: AuditRow[];
  try {
    rows = await loadAuditWindow(windowStart.toISOString(), windowEnd.toISOString());
  } catch (err: any) {
    logErr(`Failed to load audit rows; will retry next tick: ${err?.message || err}`);
    return { ran: false, reason: "audit_query_failed", rowCount: 0 };
  }

  // Empty window: deliberately send nothing, but advance lastSentAt so
  // subsequent digests cover only the next window.
  if (rows.length === 0) {
    const nextState: DigestState = { ...state, lastSentAt: windowEnd.toISOString() };
    await saveState(nextState);
    logInfo(`No audit rows in window ${windowStart.toISOString()} → ${windowEnd.toISOString()} — skipping send.`);
    return {
      ran: true,
      rowCount: 0,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  const html = renderDigestHtml({
    rows,
    windowStart,
    windowEnd,
    periodHours: state.periodHours,
  });
  const subject = `[SecureOps] Platform settings change digest (${rows.length} change${rows.length === 1 ? "" : "s"})`;

  // Deliver to BOTH the platform on-call list (existing platform-wide alert
  // pattern) AND every platform_admin / mss_admin user — the latter is what
  // the task explicitly calls for. Each delivery channel is tracked
  // separately so we only consider the run "delivered" when at least one
  // channel actually succeeded.
  let onCallSucceeded = false;
  let onCallReason: string | undefined;
  try {
    const onCallResult = await sendPlatformOnCallEmail({ subject, html });
    onCallSucceeded = onCallResult.success;
    if (!onCallResult.attempted) {
      onCallReason = onCallResult.reason || "not_attempted";
    } else if (!onCallResult.success) {
      onCallReason = onCallResult.reason || "send_failed";
      logErr(`Digest on-call email send failed: ${onCallReason}`);
    } else {
      logInfo(`Digest emailed to ${onCallResult.recipients} on-call recipient(s).`);
    }
  } catch (err: any) {
    onCallReason = err?.message || String(err);
    logErr(`Digest on-call email dispatch error: ${onCallReason}`);
  }

  let adminSucceeded = false;
  let adminReason: string | undefined;
  let adminRecipientsCount = 0;
  try {
    const admins = await resolveAdminRecipients();
    adminRecipientsCount = admins.length;
    if (admins.length === 0) {
      adminReason = "no_admin_recipients";
    } else {
      const cfg = await pickTransportConfig();
      if (!cfg) {
        adminReason = "no_transport_config";
        logErr(`Digest has ${admins.length} admin recipient(s) but no active email_configurations row.`);
      } else {
        const sendResult = await sendEmail(cfg, { to: admins, subject, html });
        adminSucceeded = sendResult.success;
        if (sendResult.success) {
          logInfo(`Digest emailed to ${admins.length} platform admin(s) via ${cfg.provider}.`);
        } else {
          adminReason = sendResult.error || "send_failed";
          logErr(`Digest admin email send failed: ${adminReason}`);
        }
      }
    }
  } catch (err: any) {
    adminReason = err?.message || String(err);
    logErr(`Digest admin email dispatch error: ${adminReason}`);
  }

  const anyDelivered = onCallSucceeded || adminSucceeded;
  // Critical: only advance lastSentAt when at least one delivery channel
  // succeeded. Otherwise leave the checkpoint where it was so the next tick
  // re-attempts delivery and these audit rows are not silently lost.
  if (anyDelivered) {
    const nextState: DigestState = { ...state, lastSentAt: windowEnd.toISOString() };
    await saveState(nextState);
  } else {
    logErr(
      `Digest send failed on all channels (on-call: ${onCallReason || "n/a"}, ` +
      `admins: ${adminReason || "n/a"}). Leaving lastSentAt unchanged so the ` +
      `next tick will retry this window.`,
    );
  }

  const skippedReason = anyDelivered
    ? undefined
    : `oncall=${onCallReason || "n/a"}; admins=${adminReason || "n/a"}`;

  return {
    ran: true,
    rowCount: rows.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    emailSent: anyDelivered,
    emailSkippedReason: skippedReason,
  };
}

export function startPlatformSettingsAuditDigest(): void {
  if (running) return;
  running = true;
  logInfo(
    `Starting (period=${ENV_PERIOD_HOURS}h, tick=${Math.round(TICK_INTERVAL_MS / 1000)}s, ` +
    `enabled=${ENV_ENABLED} — DB overrides applied per tick)`,
  );
  // Stagger first run so we don't pile onto startup work.
  setTimeout(() => {
    runPlatformSettingsAuditDigestOnce().catch(err =>
      logErr(`Initial run error: ${err?.message || err}`),
    );
    tickTimer = setInterval(() => {
      runPlatformSettingsAuditDigestOnce().catch(err =>
        logErr(`Scheduled run error: ${err?.message || err}`),
      );
    }, TICK_INTERVAL_MS);
  }, 120_000);
}

// Test-only hook for resetting internal state.
export function __resetPlatformSettingsAuditDigestForTests(): void {
  running = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
