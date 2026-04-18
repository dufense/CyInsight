/**
 * TAXII 2.1 Client Service
 *
 * Implements the TAXII 2.1 REST protocol for fetching STIX 2.1 threat intelligence.
 * Supports Discovery, API Root listing, Collection enumeration, and Objects fetch
 * with added_after pagination for incremental polling.
 * Auth: HTTP Basic and Bearer token.
 * Config loaded from platform_integrations table (name starts with 'taxii_').
 */

import { pool } from "./db";

const TAXII_TIMEOUT_MS = 15000;
const TAXII_MEDIA_TYPE = "application/taxii+json;version=2.1";
const STIX_MEDIA_TYPE = "application/stix+json;version=2.1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaxiiServerConfig {
  id: number;
  name: string;
  displayName: string;
  url: string;
  authType: "basic" | "bearer" | "none";
  username?: string;
  password?: string;
  bearerToken?: string;
  collectionIds: string[];
  pollIntervalHours: number;
  lastSyncedAt: string | null;
  enabled: boolean;
  status: string;
  objectCount: number;
}

export interface TaxiiDiscovery {
  title: string;
  description?: string;
  contact?: string;
  api_roots?: string[];
}

export interface TaxiiApiRoot {
  title: string;
  versions: string[];
  max_content_length: number;
}

export interface TaxiiCollection {
  id: string;
  title: string;
  description?: string;
  can_read: boolean;
  can_write: boolean;
  media_types?: string[];
}

export interface TaxiiObjectsResponse {
  more: boolean;
  next?: string;
  objects?: unknown[];
}

export interface StixBundle {
  type: "bundle";
  id: string;
  spec_version: "2.1";
  objects: StixObject[];
}

export interface StixObject {
  type: string;
  id: string;
  spec_version?: string;
  created?: string;
  modified?: string;
  name?: string;
  description?: string;
  pattern?: string;
  pattern_type?: string;
  valid_from?: string;
  valid_until?: string;
  labels?: string[];
  confidence?: number;
  aliases?: string[];
  sophistication?: string;
  resource_level?: string;
  primary_motivation?: string;
  country?: string;
  first_seen?: string;
  last_seen?: string;
  kill_chain_phases?: Array<{ kill_chain_name: string; phase_name: string }>;
  external_references?: Array<{ source_name: string; external_id?: string; url?: string }>;
  [key: string]: unknown;
}

export interface TaxiiPollResult {
  serverName: string;
  collectionId: string;
  objectsFetched: number;
  iocCount: number;
  actorCount: number;
  campaignCount: number;
  malwareCount: number;
  errors: string[];
  syncedAt: string;
}

// ── Auth header builder ───────────────────────────────────────────────────────

function buildAuthHeaders(cfg: TaxiiServerConfig): Record<string, string> {
  if (cfg.authType === "bearer" && cfg.bearerToken) {
    return { Authorization: `Bearer ${cfg.bearerToken}` };
  }
  if (cfg.authType === "basic" && cfg.username && cfg.password) {
    const encoded = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function taxiiFetch(url: string, cfg: TaxiiServerConfig, extraHeaders?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAXII_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: `${TAXII_MEDIA_TYPE}, ${STIX_MEDIA_TYPE}, application/json`,
        ...buildAuthHeaders(cfg),
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── TAXII protocol methods ────────────────────────────────────────────────────

export async function taxiiDiscover(cfg: TaxiiServerConfig): Promise<TaxiiDiscovery | null> {
  try {
    const base = cfg.url.replace(/\/$/, "");
    // If the configured URL already ends with /taxii2 or /taxii2/, use it directly;
    // otherwise append /taxii2/ to form the TAXII 2.1 discovery endpoint.
    const url = /\/taxii2\/?$/.test(base) ? base + "/" : base + "/taxii2/";
    const res = await taxiiFetch(url, cfg);
    if (!res.ok) {
      console.warn(`[TAXII] Discovery failed for ${cfg.displayName}: HTTP ${res.status}`);
      return null;
    }
    return await res.json() as TaxiiDiscovery;
  } catch (err: unknown) {
    console.warn(`[TAXII] Discovery error for ${cfg.displayName}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function taxiiGetApiRoot(cfg: TaxiiServerConfig, apiRootUrl: string): Promise<TaxiiApiRoot | null> {
  try {
    const res = await taxiiFetch(apiRootUrl, cfg);
    if (!res.ok) {
      console.warn(`[TAXII] API root fetch failed for ${cfg.displayName}: HTTP ${res.status}`);
      return null;
    }
    return await res.json() as TaxiiApiRoot;
  } catch (err: unknown) {
    console.warn(`[TAXII] API root error for ${cfg.displayName}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function taxiiGetCollections(cfg: TaxiiServerConfig, apiRootUrl: string): Promise<TaxiiCollection[]> {
  try {
    const url = apiRootUrl.replace(/\/$/, "") + "/collections/";
    const res = await taxiiFetch(url, cfg);
    if (!res.ok) {
      console.warn(`[TAXII] Collections fetch failed for ${cfg.displayName}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as { collections?: TaxiiCollection[] };
    return data.collections || [];
  } catch (err: unknown) {
    console.warn(`[TAXII] Collections error for ${cfg.displayName}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function taxiiGetObjects(
  cfg: TaxiiServerConfig,
  apiRootUrl: string,
  collectionId: string,
  addedAfter?: string,
  next?: string
): Promise<TaxiiObjectsResponse> {
  try {
    let url: string;
    if (next) {
      // Some servers return full next URL
      url = next.startsWith("http") ? next : apiRootUrl.replace(/\/$/, "") + next;
    } else {
      url = `${apiRootUrl.replace(/\/$/, "")}/collections/${collectionId}/objects/`;
      if (addedAfter) {
        url += `?added_after=${encodeURIComponent(addedAfter)}`;
      }
    }
    const res = await taxiiFetch(url, cfg);
    if (!res.ok) {
      console.warn(`[TAXII] Objects fetch failed for ${cfg.displayName} collection ${collectionId}: HTTP ${res.status}`);
      return { more: false, objects: [] };
    }
    const data = await res.json() as TaxiiObjectsResponse;
    return data;
  } catch (err: unknown) {
    console.warn(`[TAXII] Objects error for ${cfg.displayName} collection ${collectionId}:`, err instanceof Error ? err.message : String(err));
    return { more: false, objects: [] };
  }
}

// ── Load TAXII server configs from platform_integrations ─────────────────────

export async function loadTaxiiServerConfigs(): Promise<TaxiiServerConfig[]> {
  try {
    const res = await pool.query<{
      id: number;
      name: string;
      display_name: string;
      enabled: boolean;
      api_key: string | null;
      test_status: string | null;
      last_tested_at: string | null;
      extra_config: string | null;
    }>(
      `SELECT id, name, display_name, enabled, api_key, test_status, last_tested_at, extra_config
       FROM platform_integrations
       WHERE name LIKE 'taxii_%'
       ORDER BY id`
    );

    return res.rows.map(row => {
      let extra: Record<string, unknown> = {};
      try {
        if (row.extra_config) {
          extra = typeof row.extra_config === "string" ? JSON.parse(row.extra_config) : row.extra_config;
        }
      } catch (parseErr: unknown) {
        console.warn(`[TAXII] Failed to parse extra_config for row ${row.id}:`, parseErr instanceof Error ? parseErr.message : String(parseErr));
      }

      return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        url: String(extra.url || ""),
        authType: (extra.authType as "basic" | "bearer" | "none") || "none",
        username: extra.username ? String(extra.username) : undefined,
        password: extra.password ? String(extra.password) : undefined,
        bearerToken: row.api_key || undefined,
        collectionIds: Array.isArray(extra.collectionIds) ? (extra.collectionIds as string[]) : [],
        pollIntervalHours: typeof extra.pollIntervalHours === "number" ? extra.pollIntervalHours : 6,
        lastSyncedAt: (extra.lastSyncedAt as string | undefined) || null,
        enabled: row.enabled,
        status: row.test_status || "untested",
        objectCount: typeof extra.objectCount === "number" ? extra.objectCount : 0,
      };
    });
  } catch (err: unknown) {
    console.error("[TAXII] Failed to load server configs:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ── Normalize STIX IOC indicators to our schema ───────────────────────────────

function extractIocFromIndicator(obj: StixObject): { type: string; value: string } | null {
  if (obj.type !== "indicator" || !obj.pattern) return null;
  const pattern = String(obj.pattern);

  // IPv4
  const ipMatch = pattern.match(/\[ipv4-addr:value\s*=\s*'([^']+)'/i);
  if (ipMatch) return { type: "ip", value: ipMatch[1] };

  // Domain
  const domainMatch = pattern.match(/\[domain-name:value\s*=\s*'([^']+)'/i);
  if (domainMatch) return { type: "domain", value: domainMatch[1] };

  // URL
  const urlMatch = pattern.match(/\[url:value\s*=\s*'([^']+)'/i);
  if (urlMatch) return { type: "url", value: urlMatch[1] };

  // File hash
  const md5Match = pattern.match(/file:hashes\.'MD5'\s*=\s*'([^']+)'/i);
  if (md5Match) return { type: "hash_md5", value: md5Match[1] };

  const sha256Match = pattern.match(/file:hashes\.'SHA-256'\s*=\s*'([^']+)'/i);
  if (sha256Match) return { type: "hash_sha256", value: sha256Match[1] };

  const sha1Match = pattern.match(/file:hashes\.'SHA-1'\s*=\s*'([^']+)'/i);
  if (sha1Match) return { type: "hash_sha1", value: sha1Match[1] };

  // Email
  const emailMatch = pattern.match(/\[email-addr:value\s*=\s*'([^']+)'/i);
  if (emailMatch) return { type: "email", value: emailMatch[1] };

  return null;
}

// ── Cross-populate canonical threat_intel_iocs table ─────────────────────────
// Called after TAXII/OpenCTI ingestion to ensure indicators are visible via the
// standard threat intel feed API, tagged with their source (e.g. "taxii:mitre-atlas").

export async function crossPopulateThreatIntelIocs(params: {
  stixId: string;
  indicatorType: string;
  indicatorValue: string;
  reputation: string;
  confidence: number;
  source: string;
  context?: string;
}): Promise<void> {
  try {
    // Get all active tenant IDs to cross-populate
    const tenants = await pool.query<{ id: number }>(
      `SELECT id FROM tenants WHERE is_active = true OR is_active IS NULL LIMIT 100`
    );
    if (tenants.rows.length === 0) return;

    const validTypes = ["ip", "domain", "url", "hash_md5", "hash_sha256", "hash_sha1", "email", "file"];
    const iocType = validTypes.includes(params.indicatorType) ? params.indicatorType : "domain";

    for (const tenant of tenants.rows) {
      await pool.query(
        `INSERT INTO threat_intel_iocs (tenant_id, indicator_type, indicator_value, reputation, confidence, source, context)
         VALUES ($1, $2::ioc_type, $3, $4::ioc_reputation, $5, $6, $7)
         ON CONFLICT (tenant_id, indicator_type, indicator_value, source) DO UPDATE SET
           confidence = GREATEST(threat_intel_iocs.confidence, EXCLUDED.confidence),
           reputation = EXCLUDED.reputation,
           context = COALESCE(EXCLUDED.context, threat_intel_iocs.context)`,
        [
          tenant.id,
          iocType,
          params.indicatorValue,
          params.reputation,
          params.confidence,
          params.source,
          params.context || null,
        ]
      );
    }
  } catch (err: unknown) {
    console.warn("[ThreatIntel] Cross-populate warning:", err instanceof Error ? err.message : String(err));
  }
}

// ── Upsert STIX objects into local tables ─────────────────────────────────────

async function upsertStixObjects(objects: StixObject[], sourceTag: string): Promise<{
  iocCount: number;
  actorCount: number;
  campaignCount: number;
  malwareCount: number;
}> {
  let iocCount = 0;
  let actorCount = 0;
  let campaignCount = 0;
  let malwareCount = 0;

  for (const obj of objects) {
    try {
      if (obj.type === "indicator") {
        const extracted = extractIocFromIndicator(obj);
        if (!extracted) continue;

        const labels = Array.isArray(obj.labels) ? obj.labels : [];
        const reputation = labels.some(l => String(l).includes("malicious")) ? "malicious"
          : labels.some(l => String(l).includes("suspicious")) ? "suspicious"
          : "malicious";

        const confidence = typeof obj.confidence === "number" ? Math.min(100, obj.confidence) : 70;
        const tags: string[] = [...labels].slice(0, 10);

        await pool.query(
          `INSERT INTO taxii_stix_iocs (stix_id, indicator_type, indicator_value, reputation, confidence, source, tags, first_seen, last_seen, raw_stix)
           VALUES ($1, $2::ioc_type, $3, $4::ioc_reputation, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (stix_id) DO UPDATE SET
             indicator_value = EXCLUDED.indicator_value,
             reputation = EXCLUDED.reputation,
             confidence = GREATEST(taxii_stix_iocs.confidence, EXCLUDED.confidence),
             source = EXCLUDED.source,
             tags = EXCLUDED.tags,
             last_seen = COALESCE(EXCLUDED.last_seen, taxii_stix_iocs.last_seen),
             updated_at = NOW()`,
          [
            obj.id,
            extracted.type,
            extracted.value,
            reputation,
            confidence,
            sourceTag,
            JSON.stringify(tags),
            obj.valid_from || obj.created || null,
            obj.valid_until || obj.modified || null,
            JSON.stringify(obj),
          ]
        );
        // Also cross-populate canonical threat_intel_iocs for all tenants
        await crossPopulateThreatIntelIocs({
          stixId: obj.id,
          indicatorType: extracted.type,
          indicatorValue: extracted.value,
          reputation,
          confidence,
          source: sourceTag,
        });
        iocCount++;
      } else if (obj.type === "threat-actor") {
        await pool.query(
          `INSERT INTO taxii_threat_actors (stix_id, name, aliases, sophistication, primary_motivation, country, first_seen, last_seen, description, source, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             aliases = EXCLUDED.aliases,
             sophistication = COALESCE(EXCLUDED.sophistication, taxii_threat_actors.sophistication),
             primary_motivation = COALESCE(EXCLUDED.primary_motivation, taxii_threat_actors.primary_motivation),
             country = COALESCE(EXCLUDED.country, taxii_threat_actors.country),
             last_seen = COALESCE(EXCLUDED.last_seen, taxii_threat_actors.last_seen),
             description = COALESCE(EXCLUDED.description, taxii_threat_actors.description),
             updated_at = NOW()`,
          [
            obj.id,
            obj.name || "Unknown Actor",
            JSON.stringify(Array.isArray(obj.aliases) ? obj.aliases : []),
            obj.sophistication || null,
            obj.primary_motivation || null,
            obj.country || null,
            obj.first_seen || obj.created || null,
            obj.last_seen || obj.modified || null,
            obj.description || null,
            sourceTag,
            JSON.stringify(Array.isArray(obj.labels) ? obj.labels : []),
          ]
        );
        actorCount++;
      } else if (obj.type === "campaign") {
        await pool.query(
          `INSERT INTO taxii_campaigns (stix_id, name, description, first_seen, last_seen, objective, source, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             description = COALESCE(EXCLUDED.description, taxii_campaigns.description),
             last_seen = COALESCE(EXCLUDED.last_seen, taxii_campaigns.last_seen),
             objective = COALESCE(EXCLUDED.objective, taxii_campaigns.objective),
             updated_at = NOW()`,
          [
            obj.id,
            obj.name || "Unknown Campaign",
            obj.description || null,
            obj.first_seen || obj.created || null,
            obj.last_seen || obj.modified || null,
            typeof obj.objective === "string" ? obj.objective : null,
            sourceTag,
            JSON.stringify(Array.isArray(obj.labels) ? obj.labels : []),
          ]
        );
        campaignCount++;
      } else if (obj.type === "malware") {
        const rawKcp = obj.kill_chain_phases;
        const killChain = Array.isArray(rawKcp)
          ? rawKcp.map((kcp: unknown) => {
              if (typeof kcp === "object" && kcp !== null && "phase_name" in kcp) {
                return String((kcp as { phase_name: unknown }).phase_name);
              }
              return String(kcp);
            }).join(", ")
          : null;
        const malwareTypes = Array.isArray(obj.malware_types) ? obj.malware_types : [];

        await pool.query(
          `INSERT INTO taxii_malware (stix_id, name, malware_types, description, first_seen, last_seen, kill_chain_phases, source, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             malware_types = COALESCE(EXCLUDED.malware_types, taxii_malware.malware_types),
             description = COALESCE(EXCLUDED.description, taxii_malware.description),
             last_seen = COALESCE(EXCLUDED.last_seen, taxii_malware.last_seen),
             kill_chain_phases = COALESCE(EXCLUDED.kill_chain_phases, taxii_malware.kill_chain_phases),
             updated_at = NOW()`,
          [
            obj.id,
            obj.name || "Unknown Malware",
            JSON.stringify(malwareTypes),
            obj.description || null,
            obj.first_seen || obj.created || null,
            obj.last_seen || obj.modified || null,
            killChain,
            sourceTag,
            JSON.stringify(Array.isArray(obj.labels) ? obj.labels : []),
          ]
        );
        malwareCount++;
      }
    } catch (err: unknown) {
      console.warn(`[TAXII] Failed to upsert STIX object ${String(obj.id)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { iocCount, actorCount, campaignCount, malwareCount };
}

// ── Main poll function ────────────────────────────────────────────────────────

export async function pollTaxiiServer(cfg: TaxiiServerConfig): Promise<TaxiiPollResult[]> {
  if (!cfg.enabled || !cfg.url) return [];

  const results: TaxiiPollResult[] = [];
  const sourceTag = `taxii:${cfg.displayName || cfg.name}`;

  // Discover API roots
  const discovery = await taxiiDiscover(cfg);
  if (!discovery) {
    console.warn(`[TAXII] Discovery failed for ${cfg.displayName}`);
    return [];
  }

  // Determine API root URLs to use
  let apiRootUrls: string[] = [];
  if (discovery.api_roots && discovery.api_roots.length > 0) {
    apiRootUrls = discovery.api_roots;
  } else {
    // Fall back to configured URL as API root
    apiRootUrls = [cfg.url.replace(/\/$/, "") + "/"];
  }

  for (const apiRootUrl of apiRootUrls.slice(0, 3)) {
    // Enumerate collections or use configured collection IDs
    let collectionIds = cfg.collectionIds;

    if (collectionIds.length === 0) {
      // Auto-discover collections
      const collections = await taxiiGetCollections(cfg, apiRootUrl);
      collectionIds = collections.filter(c => c.can_read).map(c => c.id);
    }

    for (const collectionId of collectionIds.slice(0, 10)) {
      const result: TaxiiPollResult = {
        serverName: cfg.displayName,
        collectionId,
        objectsFetched: 0,
        iocCount: 0,
        actorCount: 0,
        campaignCount: 0,
        malwareCount: 0,
        errors: [],
        syncedAt: new Date().toISOString(),
      };

      try {
        let addedAfter = cfg.lastSyncedAt || undefined;
        let nextCursor: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 50;

        do {
          const response = await taxiiGetObjects(cfg, apiRootUrl, collectionId, addedAfter, nextCursor);
          const objects = (response.objects || []) as StixObject[];

          if (objects.length > 0) {
            const counts = await upsertStixObjects(objects, sourceTag);
            result.objectsFetched += objects.length;
            result.iocCount += counts.iocCount;
            result.actorCount += counts.actorCount;
            result.campaignCount += counts.campaignCount;
            result.malwareCount += counts.malwareCount;
          }

          nextCursor = response.more ? response.next : undefined;
          pageCount++;
        } while (nextCursor && pageCount < MAX_PAGES);

        // Update sync cursor in extra_config only — NOT last_tested_at to avoid
        // conflating the test-connection timestamp with the incremental sync cursor
        await pool.query(
          `UPDATE platform_integrations SET
             test_status = 'ok',
             extra_config = COALESCE(extra_config::jsonb, '{}'::jsonb)
               || jsonb_build_object(
                    'lastSyncedAt', NOW()::text,
                    'objectCount', COALESCE((extra_config::jsonb->>'objectCount')::int, 0) + $2
                  )
           WHERE id = $1`,
          [cfg.id, result.iocCount]
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
        console.error(`[TAXII] Poll error for ${cfg.displayName}/${collectionId}: ${msg}`);
      }

      results.push(result);
    }
  }

  return results;
}

// ── TAXII tables: created via migrations/0019_add_taxii_opencti.sql ──────────
// Schema is defined in shared/schema.ts (taxiiStixIocs, taxiiThreatActors, etc.)
export async function ensureTaxiiTables(): Promise<void> {
  // Tables are created by the Drizzle migration (0019_add_taxii_opencti.sql).
  // This is a no-op kept for interface compatibility — no runtime DDL needed.
}

// ── Test connection ───────────────────────────────────────────────────────────

export async function testTaxiiConnection(cfg: TaxiiServerConfig): Promise<{
  success: boolean;
  message: string;
  apiRoots?: string[];
  collectionsFound?: number;
}> {
  const discovery = await taxiiDiscover(cfg);
  if (!discovery) {
    return { success: false, message: "Failed to connect to TAXII server — check URL and credentials" };
  }

  const apiRoots = discovery.api_roots || [];
  let collectionsFound = 0;

  for (const apiRoot of apiRoots.slice(0, 2)) {
    const collections = await taxiiGetCollections(cfg, apiRoot);
    collectionsFound += collections.length;
  }

  return {
    success: true,
    message: `Connected to "${discovery.title}" — ${apiRoots.length} API root(s), ${collectionsFound} collection(s) found`,
    apiRoots,
    collectionsFound,
  };
}
