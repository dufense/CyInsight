/**
 * Task #187 — Per-tenant ClickHouse fast-path failure alerter.
 *
 * Periodically inspects the rolling counters published by
 * `clickhouse-fast-path-stats.ts`. When a tenant's CH read failure rate is
 * sustained above the configured threshold (with enough attempts to be
 * statistically meaningful) we:
 *
 *   1. Insert a `clickhouse_ingest_outages` row with reason='fast_path' and
 *      tenant_id set, so the existing Ingestion Outage History panel surfaces
 *      it next to stalled-ingest outages.
 *   2. Emit a critical platform_notification for the tenant linking to
 *      /platform-health (where the outage history lives).
 *
 * Recovery is detected when the failure rate drops back under the threshold;
 * we then mark the outage row resolved with the duration. A cooldown prevents
 * re-firing for the same tenant immediately after recovery.
 */

import { pool } from "./db";
import type { ClickHouseFastPathMonitorSettings } from "@shared/schema";
import { getChFastPathStatsCluster } from "./clickhouse-fast-path-stats";
import { getPlatformHealthUrl, sendPlatformOnCallEmail } from "./platform-oncall";

export const CLICKHOUSE_FAST_PATH_MONITOR_SETTINGS_KEY = "clickhouse_fast_path_monitor";

const ENV_DEFAULTS: ClickHouseFastPathMonitorSettings = {
  enabled: process.env.CLICKHOUSE_FAST_PATH_MONITOR_DISABLED !== "1",
  windowMinutes: clampInt(process.env.CLICKHOUSE_FAST_PATH_WINDOW_MIN, 1, 60, 10),
  minAttempts: clampInt(process.env.CLICKHOUSE_FAST_PATH_MIN_ATTEMPTS, 1, 10000, 20),
  failureRatePercent: clampInt(process.env.CLICKHOUSE_FAST_PATH_FAILURE_PERCENT, 1, 100, 50),
  intervalSeconds: clampInt(process.env.CLICKHOUSE_FAST_PATH_INTERVAL_SECONDS, 30, 3600, 60),
  cooldownMinutes: clampInt(process.env.CLICKHOUSE_FAST_PATH_COOLDOWN_MIN, 1, 1440, 30),
};

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

interface ActiveOutage {
  rowId: number | null;
  startedAt: number;
  alertCooldownUntil: number;
}

const activeOutages = new Map<number, ActiveOutage>();
let monitorRunning = false;
let scheduledTimer: NodeJS.Timeout | null = null;
let currentIntervalSeconds = ENV_DEFAULTS.intervalSeconds;

function logInfo(msg: string): void {
  console.log(`[ClickHouseFastPathMonitor] ${msg}`);
}
function logErr(msg: string): void {
  console.error(`[ClickHouseFastPathMonitor] ${msg}`);
}

function normalizeSettings(raw: any): ClickHouseFastPathMonitorSettings {
  const r = (raw && typeof raw === "object") ? raw : {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : ENV_DEFAULTS.enabled,
    windowMinutes: clampInt(r.windowMinutes, 1, 60, ENV_DEFAULTS.windowMinutes),
    minAttempts: clampInt(r.minAttempts, 1, 10000, ENV_DEFAULTS.minAttempts),
    failureRatePercent: clampInt(r.failureRatePercent, 1, 100, ENV_DEFAULTS.failureRatePercent),
    intervalSeconds: clampInt(r.intervalSeconds, 30, 3600, ENV_DEFAULTS.intervalSeconds),
    cooldownMinutes: clampInt(r.cooldownMinutes, 1, 1440, ENV_DEFAULTS.cooldownMinutes),
  };
}

export async function getClickHouseFastPathMonitorSettings(): Promise<ClickHouseFastPathMonitorSettings> {
  try {
    const r = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [CLICKHOUSE_FAST_PATH_MONITOR_SETTINGS_KEY],
    );
    if (r.rows[0]?.value) return normalizeSettings(r.rows[0].value);
  } catch (err: any) {
    logErr(`Failed to load settings from DB, using env defaults: ${err.message}`);
  }
  return { ...ENV_DEFAULTS };
}

export async function setClickHouseFastPathMonitorSettings(
  next: ClickHouseFastPathMonitorSettings,
  updatedBy?: string | null,
): Promise<ClickHouseFastPathMonitorSettings> {
  const normalized = normalizeSettings(next);
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [CLICKHOUSE_FAST_PATH_MONITOR_SETTINGS_KEY, JSON.stringify(normalized), updatedBy || null],
  );
  if (normalized.intervalSeconds !== currentIntervalSeconds) {
    currentIntervalSeconds = normalized.intervalSeconds;
    if (scheduledTimer) {
      clearInterval(scheduledTimer);
      scheduledTimer = setInterval(() => {
        checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
      }, currentIntervalSeconds * 1000);
      logInfo(`Reschedule: interval=${currentIntervalSeconds}s`);
    }
  }
  return normalized;
}

async function listAdminEmailsForTenant(tenantId: number): Promise<string[]> {
  try {
    const r = await pool.query(
      `SELECT DISTINCT u.email
         FROM tenant_users tu
         JOIN users u ON u.id::text = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.role IN ('platform_admin', 'mss_admin')
          AND u.email IS NOT NULL`,
      [tenantId],
    );
    return r.rows.map((row: any) => row.email).filter(Boolean);
  } catch {
    return [];
  }
}

async function dispatchFastPathAlert(
  tenantId: number,
  failureRatePercent: number,
  attempts: number,
  windowMinutes: number,
  recentFailures: Array<{ ts: string; op: string; error: string }>,
): Promise<{ outageRowId: number | null; notifications: number }> {
  const startedAt = new Date();
  let outageRowId: number | null = null;
  try {
    const ins = await pool.query(
      `INSERT INTO clickhouse_ingest_outages
         (started_at, threshold_minutes, sample_window_seconds,
          notifications_dispatched, resolved, reason, tenant_id,
          failure_rate_percent, attempts)
       VALUES ($1, $2, $3, 0, false, 'fast_path', $4, $5, $6)
       RETURNING id`,
      [startedAt, windowMinutes, windowMinutes * 60, tenantId, failureRatePercent, attempts],
    );
    outageRowId = Number(ins.rows[0]?.id ?? null) || null;
  } catch (err: any) {
    logErr(`Failed to insert fast_path outage row for tenant ${tenantId}: ${err.message}`);
  }

  const title = "ClickHouse fast-path failing — falling back to PostgreSQL";
  const message =
    `Tenant ${tenantId}: ${failureRatePercent}% of recent ClickHouse event reads ` +
    `failed (${attempts} attempts in the last ${windowMinutes}m). Searches are ` +
    `silently falling back to PostgreSQL. Investigate ClickHouse connectivity ` +
    `before query latency degrades further.`;

  let notifications = 0;
  try {
    await pool.query(
      `INSERT INTO platform_notifications
         (tenant_id, user_id, type, title, message, severity, action_url, metadata)
       VALUES ($1, NULL, 'platform_alert', $2, $3, 'critical', '/platform-health', $4)`,
      [
        tenantId,
        title,
        message,
        JSON.stringify({
          source: "clickhouse_fast_path_monitor",
          tenantId,
          failureRatePercent,
          attempts,
          windowMinutes,
          outageRowId,
          recentFailures: recentFailures.slice(-5),
        }),
      ],
    );
    notifications++;
  } catch (err: any) {
    logErr(`Failed to insert notification for tenant ${tenantId}: ${err.message}`);
  }

  if (notifications > 0 && outageRowId !== null) {
    try {
      await pool.query(
        `UPDATE clickhouse_ingest_outages SET notifications_dispatched = $1 WHERE id = $2`,
        [notifications, outageRowId],
      );
    } catch { /* non-fatal */ }
  }

  const healthUrl = getPlatformHealthUrl();
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const recentRows = recentFailures.slice(-5).map(f => {
    const ts = esc(String(f.ts || ""));
    const op = esc(String(f.op || ""));
    const errText = esc(String(f.error || ""));
    return `<tr>
      <td style="padding:3px 8px;color:#6b7280;font-size:12px;white-space:nowrap;">${ts}</td>
      <td style="padding:3px 8px;color:#111827;font-size:12px;">${op}</td>
      <td style="padding:3px 8px;color:#b91c1c;font-size:12px;">${errText}</td>
    </tr>`;
  }).join("");
  const recentTable = recentRows
    ? `<table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:8px 0 16px 0;">
         <tr><th align="left" style="padding:6px 8px;color:#374151;font-size:12px;">When</th><th align="left" style="padding:6px 8px;color:#374151;font-size:12px;">Op</th><th align="left" style="padding:6px 8px;color:#374151;font-size:12px;">Error</th></tr>
         ${recentRows}
       </table>`
    : `<p style="color:#6b7280;font-size:12px;margin:8px 0 16px 0;">No recent failure samples were captured.</p>`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
      <div style="background:#dc2626;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">${title}</h2>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="color:#1f2937;font-size:14px;line-height:1.6;margin:0 0 12px 0;">${message}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;margin:8px 0 16px 0;">
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Tenant</td><td style="padding:3px 0;color:#111827;font-size:13px;font-weight:600;">${tenantId}</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Failure rate</td><td style="padding:3px 0;color:#111827;font-size:13px;font-weight:600;">${failureRatePercent}%</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Attempts in window</td><td style="padding:3px 0;color:#111827;font-size:13px;">${attempts}</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Window</td><td style="padding:3px 0;color:#111827;font-size:13px;">${windowMinutes} min</td></tr>
        </table>
        <p style="color:#374151;font-size:13px;margin:0 0 6px 0;">Recent failed operations:</p>
        ${recentTable}
        <p style="margin:14px 0 0 0;font-size:13px;">
          <a href="${healthUrl}" style="color:#2563eb;text-decoration:none;font-weight:600;">Open Platform Health →</a>
        </p>
      </div>
    </div>`;

  // Always page platform on-call so degraded tenants without their own email
  // config still surface to operators.
  try {
    await sendPlatformOnCallEmail({
      subject: `[SecureOps] ${title} — tenant ${tenantId}`,
      html,
    });
  } catch (err: any) {
    logErr(`Platform on-call email dispatch failed for tenant ${tenantId}: ${err?.message || err}`);
  }

  // Best-effort: also notify the tenant's own admins via their email config.
  const admins = await listAdminEmailsForTenant(tenantId);
  if (admins.length > 0) {
    try {
      const cfgR = await pool.query(
        `SELECT * FROM email_configurations WHERE tenant_id = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1`,
        [tenantId],
      );
      const cfg = cfgR.rows[0];
      if (cfg) {
        const { sendEmail } = await import("./email-service");
        await sendEmail(cfg, {
          to: admins,
          subject: `[SecureOps] ${title}`,
          html,
        }).catch(() => undefined);
      }
    } catch { /* non-fatal */ }
  }

  return { outageRowId, notifications };
}

async function resolveFastPathOutage(tenantId: number, active: ActiveOutage): Promise<void> {
  if (active.rowId === null) return;
  const endedAt = new Date();
  const durationSec = Math.max(0, Math.round((endedAt.getTime() - active.startedAt) / 1000));
  try {
    await pool.query(
      `UPDATE clickhouse_ingest_outages
          SET ended_at = $1, duration_seconds = $2, resolved = true
        WHERE id = $3`,
      [endedAt, durationSec, active.rowId],
    );
    logInfo(`Tenant ${tenantId} fast-path outage ${active.rowId} resolved (${durationSec}s).`);
  } catch (err: any) {
    logErr(`Failed to mark fast_path outage ${active.rowId} resolved: ${err.message}`);
  }
}

async function checkOnce(): Promise<void> {
  const settings = await getClickHouseFastPathMonitorSettings();
  if (!settings.enabled) {
    if (activeOutages.size > 0) {
      // Auto-resolve outstanding outages so disabling the monitor doesn't leave
      // dangling 'ongoing' rows in the history table.
      for (const [tenantId, active] of Array.from(activeOutages.entries())) {
        await resolveFastPathOutage(tenantId, active);
        activeOutages.delete(tenantId);
      }
    }
    return;
  }

  const snap = await getChFastPathStatsCluster(settings.windowMinutes);
  const now = Date.now();
  const seen = new Set<number>();

  for (const t of snap.tenants) {
    seen.add(t.tenantId);
    const ratePercent = Math.round(t.failureRate * 100);
    const breaches =
      t.attempts >= settings.minAttempts && ratePercent >= settings.failureRatePercent;
    const entry = activeOutages.get(t.tenantId);
    const isOngoing = entry !== undefined && entry.rowId !== null;
    const inCooldown = entry !== undefined && entry.rowId === null && entry.alertCooldownUntil > now;

    if (breaches) {
      if (isOngoing) continue;        // already alerting on a live outage
      if (inCooldown) continue;       // recently recovered — wait out cooldown before re-firing
      // Cooldown expired (or never existed) — clear stale marker, fire fresh alert.
      if (entry) activeOutages.delete(t.tenantId);
      logInfo(
        `Tenant ${t.tenantId}: failure rate ${ratePercent}% over ${t.attempts} attempts ` +
        `(>= ${settings.failureRatePercent}%) — firing alert.`,
      );
      try {
        const { outageRowId } = await dispatchFastPathAlert(
          t.tenantId, ratePercent, t.attempts, settings.windowMinutes, t.recentFailures,
        );
        activeOutages.set(t.tenantId, {
          rowId: outageRowId,
          startedAt: now,
          alertCooldownUntil: now + settings.cooldownMinutes * 60_000,
        });
      } catch (err: any) {
        logErr(`dispatchFastPathAlert failed for tenant ${t.tenantId}: ${err.message}`);
      }
    } else if (isOngoing && t.attempts >= Math.max(1, Math.floor(settings.minAttempts / 2))) {
      // Recovery: rate dropped below threshold with enough samples to trust it.
      logInfo(`Tenant ${t.tenantId} fast-path recovered (${ratePercent}% over ${t.attempts}).`);
      await resolveFastPathOutage(t.tenantId, entry!);
      // Keep cooldown so we don't re-fire instantly on noise. Will be re-armed
      // automatically once cooldown expires (see breach branch above + cleanup).
      activeOutages.set(t.tenantId, {
        rowId: null,
        startedAt: 0,
        alertCooldownUntil: now + settings.cooldownMinutes * 60_000,
      });
    } else if (entry && entry.rowId === null && entry.alertCooldownUntil <= now) {
      // Cooldown expired and tenant is currently healthy — drop the marker so
      // the map doesn't grow unbounded on tenants with continuous traffic.
      activeOutages.delete(t.tenantId);
    }
  }

  // Tenants that disappear from the snapshot (no traffic) are treated as
  // recovered too — there's nothing to alert on. Also expire stale cooldown
  // markers so the map doesn't leak.
  for (const [tenantId, entry] of Array.from(activeOutages.entries())) {
    if (seen.has(tenantId)) continue;
    if (entry.rowId !== null) {
      await resolveFastPathOutage(tenantId, entry);
      activeOutages.set(tenantId, {
        rowId: null,
        startedAt: 0,
        alertCooldownUntil: now + settings.cooldownMinutes * 60_000,
      });
    } else if (entry.alertCooldownUntil <= now) {
      activeOutages.delete(tenantId);
    }
  }
}

/**
 * On startup, resolve any unresolved fast-path outage rows that are clearly
 * stale (older than 2× the longest plausible cooldown). After a process
 * restart, in-memory `activeOutages` is empty, so without this we'd leave
 * orphaned rows marked unresolved forever.
 */
async function reconcileStaleOutagesOnStartup(): Promise<void> {
  try {
    const r = await pool.query(
      `UPDATE clickhouse_ingest_outages
          SET resolved = true,
              ended_at = NOW(),
              duration_seconds = COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)
        WHERE reason = 'fast_path'
          AND resolved = false
          AND started_at < NOW() - INTERVAL '6 hours'
        RETURNING id`,
    );
    if (r.rowCount && r.rowCount > 0) {
      logInfo(`Reconciled ${r.rowCount} stale unresolved fast-path outage row(s) on startup.`);
    }
  } catch (err: any) {
    logErr(`Startup reconciliation failed: ${err?.message || err}`);
  }
}

export function startClickHouseFastPathMonitor(): void {
  if (monitorRunning) return;
  monitorRunning = true;
  currentIntervalSeconds = ENV_DEFAULTS.intervalSeconds;
  logInfo(
    `Starting (env interval=${currentIntervalSeconds}s, window=${ENV_DEFAULTS.windowMinutes}m, ` +
    `minAttempts=${ENV_DEFAULTS.minAttempts}, failureRate>=${ENV_DEFAULTS.failureRatePercent}%, ` +
    `cooldown=${ENV_DEFAULTS.cooldownMinutes}m — DB overrides applied per check)`,
  );
  setTimeout(async () => {
    await reconcileStaleOutagesOnStartup();
    try {
      const persisted = await getClickHouseFastPathMonitorSettings();
      if (persisted.intervalSeconds !== currentIntervalSeconds) {
        currentIntervalSeconds = persisted.intervalSeconds;
        logInfo(`Applied persisted interval: ${currentIntervalSeconds}s`);
      }
    } catch (err: any) {
      logErr(`Could not load persisted interval: ${err?.message || err}`);
    }
    checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
    scheduledTimer = setInterval(() => {
      checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
    }, currentIntervalSeconds * 1000);
  }, 120_000);
}

export function __resetClickHouseFastPathMonitorForTests(): void {
  activeOutages.clear();
  monitorRunning = false;
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}
