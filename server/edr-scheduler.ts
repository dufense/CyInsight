/**
 * EDR Assessment Scheduler
 *
 * Runs CIS assessments on all opted-in assets every Monday at 02:00 UTC.
 * Batches of 10 assets with a 5-second delay between batches to protect
 * EDR platform performance.
 */

import { db } from "./db";
import { tenants, securityIntegrations } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { runWeeklyAssessmentsForTenant } from "./edr-assessment-engine";

const SUPPORTED_EDR_KEYS = ["cynet", "crowdstrike", "sentinelone", "ms_defender_endpoint"];

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastRunDay = -1;

async function getTenantsWithEdr(): Promise<number[]> {
  const rows = await db
    .select({ tenantId: securityIntegrations.tenantId })
    .from(securityIntegrations)
    .where(
      and(
        eq(securityIntegrations.isEnabled, true),
        inArray(securityIntegrations.platformKey, SUPPORTED_EDR_KEYS)
      )
    );
  return Array.from(new Set(rows.map(r => r.tenantId)));
}

async function runScheduledAssessments() {
  console.log("[EDR Scheduler] Starting weekly scheduled assessments...");
  const tenantIds = await getTenantsWithEdr();
  console.log(`[EDR Scheduler] ${tenantIds.length} tenants with EDR configured`);

  for (const tenantId of tenantIds) {
    try {
      await runWeeklyAssessmentsForTenant(tenantId);
    } catch (err) {
      console.error(`[EDR Scheduler] Error for tenant ${tenantId}:`, err);
    }
    // Brief pause between tenants
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("[EDR Scheduler] Weekly assessment run complete");
}

function isScheduleTime(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 1 = Monday
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  return utcDay === 1 && utcHour === 2 && utcMinute < 10;
}

export function startEdrScheduler(): void {
  if (schedulerInterval) return;

  console.log("[EDR Scheduler] Started — will run every Monday at 02:00 UTC");

  // Check every 5 minutes whether it's time to run
  schedulerInterval = setInterval(async () => {
    const now = new Date();
    const dayKey = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000)); // changes each week
    if (isScheduleTime() && lastRunDay !== dayKey) {
      lastRunDay = dayKey;
      try {
        await runScheduledAssessments();
      } catch (err) {
        console.error("[EDR Scheduler] Unhandled error in weekly run:", err);
      }
    }
  }, 5 * 60 * 1000);
}

export function stopEdrScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
