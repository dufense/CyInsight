import { storage } from "./storage";
import { db, pool } from "./db";
import { assets, securityIntegrations } from "@shared/schema";
import type { SecurityIntegration } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getConnector } from "./connectors/base-connector";
import type { AssetRecord } from "./connectors/base-connector";
import { assignCriticality } from "./criticality-engine";
import { computeCisScore } from "./cis-scoring";
import { correlateUsersForTenant } from "./user-asset-correlator";

const ASSET_SYNC_CATEGORIES = new Set([
  "edr_xdr",
  "endpoint_security",
  "dlp",
  "patch_mgmt",
  "vulnerability_management",
]);

export function categorySupportsAssetSync(category: string): boolean {
  return ASSET_SYNC_CATEGORIES.has(category);
}

export async function upsertAssets(
  tenantId: number,
  records: AssetRecord[],
  platformKey: string
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0;
  let skipped = 0;

  const validRecords = records.filter(r => r.hostname && r.hostname.trim());

  for (const rec of validRecords) {
    try {
      const hostname = rec.hostname.trim();

      // Tenant-scoped lookup using and() to ensure both predicates are applied
      const [existing] = await db
        .select({ id: assets.id, sourcePlatforms: assets.sourcePlatforms })
        .from(assets)
        .where(
          and(
            eq(assets.tenantId, tenantId),
            sql`lower(${assets.hostname}) = lower(${hostname})`
          )
        );

      const mergedPlatforms = Array.from(
        new Set([...(existing?.sourcePlatforms || []), platformKey])
      );

      const softwareInventory = rec.softwareInventory?.length
        ? rec.softwareInventory
        : undefined;

      if (existing) {
        await db
          .update(assets)
          .set({
            ipAddress: rec.ipAddress ?? undefined,
            macAddress: rec.macAddress ?? undefined,
            operatingSystem: rec.operatingSystem ?? undefined,
            agentVersion: rec.agentVersion ?? undefined,
            user: rec.user ?? undefined,
            endpointGroup: rec.endpointGroup ?? undefined,
            endpointType: rec.endpointType ?? undefined,
            tags: rec.tags ?? undefined,
            lastSeen: rec.lastSeen ?? undefined,
            status: rec.status ?? "active",
            riskLevel: rec.riskLevel ?? undefined,
            riskScore: rec.riskScore !== undefined ? Math.min(100, rec.riskScore) : undefined,
            deviceHealth: rec.deviceHealth ?? undefined,
            lastLoggedInUser: rec.lastLoggedInUser ?? undefined,
            processor: rec.processor ?? undefined,
            totalPhysicalMemory: rec.totalPhysicalMemory ?? undefined,
            systemModel: rec.systemModel ?? undefined,
            systemManufacturer: rec.systemManufacturer ?? undefined,
            biosSerialNumber: rec.biosSerialNumber ?? undefined,
            assetLocation: rec.assetLocation ?? undefined,
            assetSite: rec.assetSite ?? undefined,
            assetGroup: rec.assetGroup ?? undefined,
            cloudProvider: rec.cloudProvider ?? undefined,
            cloudRegion: rec.cloudRegion ?? undefined,
            cloudInstanceId: rec.cloudInstanceId ?? undefined,
            source: rec.source ?? "connector",
            sourcePlatforms: mergedPlatforms,
            enrichmentData: rec.enrichmentData ?? undefined,
            ...(softwareInventory ? { softwareInventory } : {}),
            ...(rec.edrHostId ? { edrHostId: rec.edrHostId, edrPlatform: rec.edrPlatform ?? platformKey } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(assets.id, existing.id),
              eq(assets.tenantId, tenantId)
            )
          );
      } else {
        await db.insert(assets).values({
          tenantId,
          hostname,
          ipAddress: rec.ipAddress ?? null,
          macAddress: rec.macAddress ?? null,
          operatingSystem: rec.operatingSystem ?? null,
          agentVersion: rec.agentVersion ?? null,
          user: rec.user ?? null,
          endpointGroup: rec.endpointGroup ?? null,
          endpointType: rec.endpointType ?? null,
          tags: rec.tags ?? null,
          lastSeen: rec.lastSeen ?? null,
          status: rec.status ?? "active",
          riskLevel: rec.riskLevel ?? null,
          riskScore: rec.riskScore !== undefined ? Math.min(100, rec.riskScore) : null,
          deviceHealth: rec.deviceHealth ?? null,
          lastLoggedInUser: rec.lastLoggedInUser ?? null,
          processor: rec.processor ?? null,
          totalPhysicalMemory: rec.totalPhysicalMemory ?? null,
          systemModel: rec.systemModel ?? null,
          systemManufacturer: rec.systemManufacturer ?? null,
          biosSerialNumber: rec.biosSerialNumber ?? null,
          assetLocation: rec.assetLocation ?? null,
          assetSite: rec.assetSite ?? null,
          assetGroup: rec.assetGroup ?? null,
          cloudProvider: rec.cloudProvider ?? null,
          cloudRegion: rec.cloudRegion ?? null,
          cloudInstanceId: rec.cloudInstanceId ?? null,
          source: rec.source ?? "connector",
          sourcePlatforms: mergedPlatforms,
          enrichmentData: rec.enrichmentData ?? null,
          softwareInventory: softwareInventory ?? null,
          edrHostId: rec.edrHostId ?? null,
          edrPlatform: rec.edrPlatform ?? null,
        });
      }
      upserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AssetSync] Failed to upsert asset ${rec.hostname}: ${msg}`);
      skipped++;
    }
  }

  return { upserted, skipped };
}

async function postUpsertEnrichment(tenantId: number, records: AssetRecord[]): Promise<void> {
  try {
    for (const rec of records) {
      if (!rec.hostname?.trim()) continue;
      const hostname = rec.hostname.trim();
      try {
        const [existing] = await db
          .select({
            id: assets.id,
            criticality: assets.criticality,
            agentVersion: assets.agentVersion,
            softwareInventory: assets.softwareInventory,
            vulnerabilityCount: assets.vulnerabilityCount,
            controlsCoverage: assets.controlsCoverage,
            preventionPolicy: assets.preventionPolicy,
            eolFindings: assets.eolFindings,
            lastSeen: assets.lastSeen,
            primaryUserId: assets.primaryUserId,
            primaryUserEmail: assets.primaryUserEmail,
            ipAddress: assets.ipAddress,
            endpointType: assets.endpointType,
            deviceHealth: assets.deviceHealth,
          })
          .from(assets)
          .where(and(eq(assets.tenantId, tenantId), sql`lower(${assets.hostname}) = lower(${hostname})`));

        if (!existing) continue;

        const updates: Partial<typeof assets.$inferInsert> = { updatedAt: new Date() };

        if (!existing.criticality) {
          const tier = assignCriticality({
            hostname: rec.hostname,
            endpointType: rec.endpointType,
            endpointGroup: rec.endpointGroup,
            tags: rec.tags,
          });
          updates.criticality = tier;
        }

        const cisResult = computeCisScore({
          agentVersion: existing.agentVersion,
          softwareInventory: existing.softwareInventory as any[] | null,
          vulnerabilityCount: existing.vulnerabilityCount,
          controlsCoverage: existing.controlsCoverage as any[] | null,
          preventionPolicy: existing.preventionPolicy,
          eolFindings: existing.eolFindings as any[] | null,
          lastSeen: existing.lastSeen,
          primaryUserId: existing.primaryUserId,
          primaryUserEmail: existing.primaryUserEmail,
          ipAddress: existing.ipAddress,
          endpointType: existing.endpointType,
          deviceHealth: existing.deviceHealth,
        });
        updates.cisScore = cisResult.score;
        updates.cisBenchmark = cisResult.benchmark;

        await db.update(assets)
          .set(updates)
          .where(and(eq(assets.id, existing.id), eq(assets.tenantId, tenantId)));
      } catch (err: unknown) {
        console.warn(`[PostUpsert] Enrichment failed for ${hostname}:`, err instanceof Error ? err.message : String(err));
      }
    }

    correlateUsersForTenant(tenantId, pool).catch(err =>
      console.warn("[PostUpsert] User correlation error:", err instanceof Error ? err.message : String(err))
    );
  } catch (err: unknown) {
    console.warn("[PostUpsert] Enrichment batch error:", err instanceof Error ? err.message : String(err));
  }
}

export async function syncAssetsForIntegration(integrationId: number): Promise<{
  success: boolean;
  assetsUpserted: number;
  message: string;
}> {
  let integration: SecurityIntegration | undefined;
  try {
    integration = await storage.getSecurityIntegration(integrationId);
    if (!integration) {
      return { success: false, assetsUpserted: 0, message: "Integration not found" };
    }

    if (!categorySupportsAssetSync(integration.category)) {
      return { success: false, assetsUpserted: 0, message: `Category '${integration.category}' does not support asset sync` };
    }

    if (integration.status !== "connected") {
      return { success: false, assetsUpserted: 0, message: "Integration not connected" };
    }

    await storage.updateAssetSyncStatus(integrationId, "syncing", "Asset sync in progress…");

    const connector = getConnector(integration);
    if (!connector || typeof connector.pullAssets !== "function") {
      await storage.updateAssetSyncStatus(
        integrationId,
        "unsupported",
        `Asset sync not implemented for ${integration.platformKey}`,
        new Date()
      );
      return { success: false, assetsUpserted: 0, message: `Asset sync not implemented for ${integration.platformKey}` };
    }

    const result = await connector.pullAssets!();
    const { upserted, skipped } = await upsertAssets(integration.tenantId, result.assets, integration.platformKey);

    postUpsertEnrichment(integration.tenantId, result.assets).catch(err =>
      console.warn("[AssetSync] Post-upsert enrichment error:", err instanceof Error ? err.message : String(err))
    );

    const message = `Synced ${upserted} assets from ${integration.platformName}${skipped > 0 ? `, ${skipped} skipped` : ""}`;
    await storage.updateAssetSyncStatus(integrationId, "success", message, new Date());

    console.log(`[AssetSync] Integration ${integrationId} (${integration.platformKey}): ${message}`);
    return { success: true, assetsUpserted: upserted, message };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const fullMsg = `Asset sync failed: ${errMsg}`;
    console.error(`[AssetSync] Integration ${integrationId}: ${fullMsg}`);
    if (integration) {
      await storage.updateAssetSyncStatus(integrationId, "error", fullMsg, new Date()).catch(() => {});
    }
    return { success: false, assetsUpserted: 0, message: fullMsg };
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function startAssetSyncScheduler(): void {
  if (schedulerInterval) return;
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

  const runScheduledSync = async () => {
    try {
      const allIntegrations = await db
        .select()
        .from(securityIntegrations)
        .where(
          and(
            eq(securityIntegrations.status, "connected"),
            isNull(securityIntegrations.deletedAt)
          )
        );

      const eligible = allIntegrations.filter((i: SecurityIntegration) => {
        if (!categorySupportsAssetSync(i.category)) return false;
        if (!i.isEnabled) return false;
        if (i.lastAssetSyncAt && Date.now() - i.lastAssetSyncAt.getTime() < SYNC_COOLDOWN_MS) return false;
        return true;
      });

      for (const integration of eligible) {
        syncAssetsForIntegration(integration.id).catch(err =>
          console.error(`[AssetSync Scheduler] Integration ${integration.id} error:`,
            err instanceof Error ? err.message : String(err))
        );
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err: unknown) {
      console.error("[AssetSync Scheduler] Error:", err instanceof Error ? err.message : String(err));
    }
  };

  schedulerInterval = setInterval(runScheduledSync, CHECK_INTERVAL_MS);
  setTimeout(runScheduledSync, 30000);
  console.log("[AssetSync] Scheduler started (24h sync cycle, first run in 30s)");
}
