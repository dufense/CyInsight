import { pool } from "./db";
import { getClickHouseClient, isClickHouseEnabled } from "./clickhouse-client";
import { sendEmail } from "./email-service";
import type { ClickHouseIngestMonitorSettings } from "@shared/schema";

export const CLICKHOUSE_INGEST_MONITOR_SETTINGS_KEY = "clickhouse_ingest_monitor";

const ENV_DEFAULTS: ClickHouseIngestMonitorSettings = {
  enabled: process.env.CLICKHOUSE_INGEST_MONITOR_DISABLED !== "1",
  thresholdMinutes: Math.max(
    1,
    parseInt(process.env.CLICKHOUSE_INSERT_ZERO_ALERT_MINUTES || "10", 10) || 10,
  ),
  sampleWindowSeconds: Math.max(
    30,
    parseInt(process.env.CLICKHOUSE_INSERT_ZERO_SAMPLE_WINDOW_SECONDS || "60", 10) || 60,
  ),
  intervalSeconds: Math.max(
    30,
    parseInt(process.env.CLICKHOUSE_INGEST_MONITOR_INTERVAL_SECONDS || "60", 10) || 60,
  ),
};

let monitorRunning = false;
let zeroStreakStartedAt: number | null = null;
let alertFiredAt: number | null = null;
let scheduledTimer: NodeJS.Timeout | null = null;
let currentIntervalSeconds = ENV_DEFAULTS.intervalSeconds;

function logInfo(msg: string): void {
  console.log(`[ClickHouseIngestMonitor] ${msg}`);
}

function logErr(msg: string): void {
  console.error(`[ClickHouseIngestMonitor] ${msg}`);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeSettings(raw: any): ClickHouseIngestMonitorSettings {
  const r = (raw && typeof raw === "object") ? raw : {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : ENV_DEFAULTS.enabled,
    thresholdMinutes: clamp(r.thresholdMinutes, 1, 1440, ENV_DEFAULTS.thresholdMinutes),
    sampleWindowSeconds: clamp(r.sampleWindowSeconds, 30, 3600, ENV_DEFAULTS.sampleWindowSeconds),
    intervalSeconds: clamp(r.intervalSeconds, 30, 3600, ENV_DEFAULTS.intervalSeconds),
  };
}

export async function getClickHouseIngestMonitorSettings(): Promise<ClickHouseIngestMonitorSettings> {
  try {
    const r = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [CLICKHOUSE_INGEST_MONITOR_SETTINGS_KEY],
    );
    if (r.rows[0]?.value) return normalizeSettings(r.rows[0].value);
  } catch (err: any) {
    logErr(`Failed to load settings from DB, using env defaults: ${err.message}`);
  }
  return { ...ENV_DEFAULTS };
}

export async function setClickHouseIngestMonitorSettings(
  next: ClickHouseIngestMonitorSettings,
  updatedBy?: string | null,
): Promise<ClickHouseIngestMonitorSettings> {
  const normalized = normalizeSettings(next);
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [CLICKHOUSE_INGEST_MONITOR_SETTINGS_KEY, JSON.stringify(normalized), updatedBy || null],
  );
  // If interval changed, reschedule the periodic timer (or just track it so the
  // first scheduled interval after startup uses the new value).
  if (normalized.intervalSeconds !== currentIntervalSeconds) {
    currentIntervalSeconds = normalized.intervalSeconds;
    if (scheduledTimer) {
      clearInterval(scheduledTimer);
      scheduledTimer = setInterval(() => {
        checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
      }, currentIntervalSeconds * 1000);
      logInfo(`Reschedule: interval=${currentIntervalSeconds}s`);
    } else {
      logInfo(`Interval updated to ${currentIntervalSeconds}s (will apply on next scheduled tick).`);
    }
  }
  // Reset streak so a longer threshold doesn't immediately trigger / re-trigger.
  zeroStreakStartedAt = null;
  alertFiredAt = null;
  return normalized;
}

function renderAlertHtml(opts: {
  startedAt: Date;
  durationMinutes: number;
  thresholdMinutes: number;
  windowSeconds: number;
}): string {
  const startedIso = opts.startedAt.toISOString();
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
      <div style="background:#dc2626;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">ClickHouse Ingestion Stalled</h2>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="color:#1f2937;font-size:14px;line-height:1.6;margin:0 0 12px 0;">
          ClickHouse is reachable, but no rows have been inserted into
          <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">security_events_distributed</code>
          for at least <strong>${opts.durationMinutes} minute${opts.durationMinutes === 1 ? "" : "s"}</strong>.
          This usually means the ingestion pipeline has stopped silently.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;margin:8px 0 16px 0;">
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Insert rate (per sec, last ${opts.windowSeconds}s)</td><td style="padding:3px 0;color:#111827;font-size:13px;font-weight:600;">0</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Zero-rate streak started</td><td style="padding:3px 0;color:#111827;font-size:13px;">${startedIso}</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">Alert threshold</td><td style="padding:3px 0;color:#111827;font-size:13px;">${opts.thresholdMinutes} minutes</td></tr>
          <tr><td style="padding:3px 0;color:#6b7280;font-size:13px;">ClickHouse status</td><td style="padding:3px 0;color:#111827;font-size:13px;">connected</td></tr>
        </table>
        <p style="color:#374151;font-size:13px;line-height:1.6;margin:0 0 8px 0;">Suggested checks:</p>
        <ul style="color:#374151;font-size:13px;line-height:1.6;margin:0 0 12px 18px;padding:0;">
          <li>Verify the ingest workers / Kafka consumers are running.</li>
          <li>Confirm upstream collectors are still forwarding events.</li>
          <li>Check ClickHouse <code>system.errors</code> for write failures.</li>
        </ul>
        <p style="margin:14px 0 0 0;font-size:12px;color:#9ca3af;">Open the Platform Health dashboard for live status.</p>
      </div>
    </div>`;
}

async function listAdminTenants(): Promise<Array<{ tenantId: number; admins: Array<{ email: string }> }>> {
  try {
    const result = await pool.query(
      `SELECT tu.tenant_id AS "tenantId",
              COALESCE(json_agg(DISTINCT jsonb_build_object('email', u.email))
                       FILTER (WHERE u.email IS NOT NULL), '[]') AS admins
         FROM tenant_users tu
         LEFT JOIN users u ON u.id::text = tu.user_id
        WHERE tu.role IN ('platform_admin', 'mss_admin')
        GROUP BY tu.tenant_id`,
    );
    return result.rows.map((r: any) => ({
      tenantId: Number(r.tenantId),
      admins: Array.isArray(r.admins) ? r.admins.filter((a: any) => a && a.email) : [],
    }));
  } catch (err: any) {
    logErr(`Failed to load admin tenants: ${err.message}`);
    return [];
  }
}

async function getTenantEmailConfig(tenantId: number): Promise<any | null> {
  try {
    const r = await pool.query(
      `SELECT * FROM email_configurations WHERE tenant_id = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1`,
      [tenantId],
    );
    return r.rows[0] || null;
  } catch {
    return null;
  }
}

async function fireAlert(
  durationMinutes: number,
  startedAt: Date,
  settings: ClickHouseIngestMonitorSettings,
): Promise<boolean> {
  const title = "ClickHouse ingestion stalled";
  const message = `ClickHouse is reachable but no events have been inserted for ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}. Investigate the ingestion pipeline.`;
  const html = renderAlertHtml({
    startedAt,
    durationMinutes,
    thresholdMinutes: settings.thresholdMinutes,
    windowSeconds: settings.sampleWindowSeconds,
  });

  const adminTenants = await listAdminTenants();
  if (adminTenants.length === 0) {
    logInfo("No platform_admin / mss_admin recipients found; skipping notification dispatch.");
    return false;
  }

  let notifInserted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const { tenantId, admins } of adminTenants) {
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
            source: "clickhouse_ingest_monitor",
            zeroStreakStartedAt: startedAt.toISOString(),
            zeroStreakMinutes: durationMinutes,
            thresholdMinutes: settings.thresholdMinutes,
            sampleWindowSeconds: settings.sampleWindowSeconds,
          }),
        ],
      );
      notifInserted++;
    } catch (err: any) {
      logErr(`Failed to insert notification for tenant ${tenantId}: ${err.message}`);
    }

    if (admins.length === 0) continue;
    const cfg = await getTenantEmailConfig(tenantId);
    if (!cfg) continue;
    try {
      const sendResult = await sendEmail(cfg, {
        to: admins.map(a => a.email),
        subject: `[SecureOps] ${title}`,
        html,
      });
      if (sendResult.success) emailsSent++;
      else {
        emailsFailed++;
        logErr(`Email send failed for tenant ${tenantId}: ${sendResult.error}`);
      }
    } catch (err: any) {
      emailsFailed++;
      logErr(`Email dispatch error for tenant ${tenantId}: ${err.message}`);
    }
  }

  logInfo(`Alert dispatched: notifications=${notifInserted}, emailsSent=${emailsSent}, emailsFailed=${emailsFailed}`);
  return notifInserted > 0;
}

async function checkOnce(): Promise<void> {
  const settings = await getClickHouseIngestMonitorSettings();

  if (!settings.enabled) {
    if (zeroStreakStartedAt !== null || alertFiredAt !== null) {
      zeroStreakStartedAt = null;
      alertFiredAt = null;
    }
    return;
  }

  if (!isClickHouseEnabled()) {
    if (zeroStreakStartedAt !== null || alertFiredAt !== null) {
      zeroStreakStartedAt = null;
      alertFiredAt = null;
    }
    return;
  }
  const client = getClickHouseClient();
  if (!client) {
    zeroStreakStartedAt = null;
    alertFiredAt = null;
    return;
  }

  let connected = false;
  try {
    const health = await client.healthCheck();
    connected = health.status === "connected";
  } catch {
    connected = false;
  }

  if (!connected) {
    zeroStreakStartedAt = null;
    alertFiredAt = null;
    return;
  }

  let rate: number | null = null;
  try {
    const stats = await client.queryOpsStats(settings.sampleWindowSeconds);
    rate = stats.recentInsertRatePerSec;
  } catch {
    rate = null;
  }

  if (rate === null) return;

  if (rate > 0) {
    if (zeroStreakStartedAt !== null || alertFiredAt !== null) {
      logInfo(`Insert rate recovered (${rate}/s) — clearing zero-rate streak.`);
    }
    zeroStreakStartedAt = null;
    alertFiredAt = null;
    return;
  }

  const now = Date.now();
  if (zeroStreakStartedAt === null) {
    zeroStreakStartedAt = now;
    logInfo(`Insert rate at 0 — starting zero-rate streak (threshold ${settings.thresholdMinutes} min).`);
    return;
  }

  if (alertFiredAt !== null) return;

  const elapsedMin = (now - zeroStreakStartedAt) / 60_000;
  if (elapsedMin >= settings.thresholdMinutes) {
    const durationMinutes = Math.round(elapsedMin);
    logInfo(`Zero-rate streak reached ${durationMinutes} min — firing alert.`);
    let dispatched = false;
    try {
      dispatched = await fireAlert(durationMinutes, new Date(zeroStreakStartedAt), settings);
    } catch (err: any) {
      logErr(`fireAlert failed: ${err.message}`);
    }
    if (dispatched) {
      alertFiredAt = now;
    } else {
      logInfo("Alert dispatch failed; will retry on next check.");
    }
  }
}

export function startClickHouseIngestMonitor(): void {
  if (monitorRunning) return;
  monitorRunning = true;
  currentIntervalSeconds = ENV_DEFAULTS.intervalSeconds;
  logInfo(
    `Starting (env interval=${currentIntervalSeconds}s, threshold=${ENV_DEFAULTS.thresholdMinutes}min, window=${ENV_DEFAULTS.sampleWindowSeconds}s — DB overrides applied per check)`,
  );
  // Stagger first run so we don't pile onto startup work.
  setTimeout(async () => {
    // Honor persisted intervalSeconds from the start so a redeploy doesn't
    // revert back to the env default for the periodic timer.
    try {
      const persisted = await getClickHouseIngestMonitorSettings();
      if (persisted.intervalSeconds !== currentIntervalSeconds) {
        currentIntervalSeconds = persisted.intervalSeconds;
        logInfo(`Applied persisted interval: ${currentIntervalSeconds}s`);
      }
    } catch (err: any) {
      logErr(`Could not load persisted interval, using env default: ${err?.message || err}`);
    }
    checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
    scheduledTimer = setInterval(() => {
      checkOnce().catch(err => logErr(`checkOnce error: ${err?.message || err}`));
    }, currentIntervalSeconds * 1000);
  }, 90_000);
}

// Test-only hook for resetting internal state.
export function __resetClickHouseIngestMonitorForTests(): void {
  zeroStreakStartedAt = null;
  alertFiredAt = null;
  monitorRunning = false;
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}
