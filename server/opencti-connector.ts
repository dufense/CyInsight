/**
 * OpenCTI Connector Service
 *
 * Typed GraphQL client for OpenCTI's API, plus a SSE live stream listener.
 * Provides: IOC reputation lookup, threat actor search, campaign list,
 * malware family lookup, health check, and live stream subscription.
 * Credentials loaded exclusively from platform_integrations table.
 */

import { pool } from "./db";
import { crossPopulateThreatIntelIocs } from "./taxii-client";

const OPENCTI_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour IOC context cache

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpenCTIConfig {
  url: string;
  apiToken: string;
  syncEnabled: boolean;
  liveStreamEnabled: boolean;
  lastSyncedAt: string | null;
  iocCount: number;
}

export interface OpenCTIIndicator {
  id: string;
  name: string;
  pattern: string;
  pattern_type: string;
  valid_from: string;
  confidence: number;
  x_opencti_score: number;
  labels: string[];
  created_at: string;
  modified: string;
}

export interface OpenCTIThreatActor {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  sophistication: string;
  resource_level: string;
  primary_motivation: string;
  country: string;
  first_seen: string;
  last_seen: string;
  confidence: number;
  x_opencti_score: number;
}

export interface OpenCTICampaign {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  first_seen: string;
  last_seen: string;
  objective: string;
  confidence: number;
}

export interface OpenCTIMalware {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  malware_types: string[];
  kill_chain_phases: Array<{ kill_chain_name: string; phase_name: string }>;
  first_seen: string;
  last_seen: string;
  confidence: number;
}

export interface OpenCTIIocContext {
  iocValue: string;
  iocType: string;
  stixId?: string;
  actorName?: string;
  actorStixId?: string;
  campaignName?: string;
  campaignStixId?: string;
  malwareFamily?: string;
  malwareStixId?: string;
  confidence?: number;
  score?: number;
  source: "opencti";
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry<T> { data: T; expiresAt: number }
const iocContextCache = new Map<string, CacheEntry<OpenCTIIocContext | null>>();

function getCachedIocContext(key: string): OpenCTIIocContext | null | undefined {
  const entry = iocContextCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { iocContextCache.delete(key); return undefined; }
  return entry.data;
}

function setCachedIocContext(key: string, value: OpenCTIIocContext | null): void {
  if (iocContextCache.size > 5000) {
    const firstKey = iocContextCache.keys().next().value;
    if (firstKey) iocContextCache.delete(firstKey);
  }
  iocContextCache.set(key, { data: value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Load OpenCTI config from platform_integrations ────────────────────────────

export async function loadOpenCTIConfig(): Promise<OpenCTIConfig | null> {
  try {
    const res = await pool.query<{
      api_key: string | null;
      enabled: boolean;
      extra_config: string | null;
      last_tested_at: string | null;
    }>(
      `SELECT api_key, enabled, extra_config, last_tested_at
       FROM platform_integrations
       WHERE name = 'opencti'
       LIMIT 1`
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (!row.enabled) return null;

    let extra: Record<string, unknown> = {};
    try {
      if (row.extra_config) {
        extra = typeof row.extra_config === "string" ? JSON.parse(row.extra_config) : row.extra_config;
      }
    } catch (parseErr: unknown) {
      console.warn("[OpenCTI] Failed to parse extra_config JSON:", parseErr instanceof Error ? parseErr.message : String(parseErr));
    }

    const url = String(extra.url || "");
    const apiToken = row.api_key || "";
    if (!url || !apiToken) return null;

    return {
      url: url.replace(/\/$/, ""),
      apiToken,
      syncEnabled: extra.syncEnabled !== false,
      liveStreamEnabled: extra.liveStreamEnabled === true,
      lastSyncedAt: row.last_tested_at,
      iocCount: typeof extra.iocCount === "number" ? extra.iocCount : 0,
    };
  } catch (err: unknown) {
    console.error("[OpenCTI] Failed to load config:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── GraphQL client ────────────────────────────────────────────────────────────

async function gqlQuery<T = unknown>(
  config: OpenCTIConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENCTI_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.url}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[OpenCTI] GraphQL request failed: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { data?: T; errors?: unknown[] };
    if (json.errors) {
      console.warn("[OpenCTI] GraphQL errors:", JSON.stringify(json.errors).slice(0, 200));
      return null;
    }
    return json.data || null;
  } catch (err: unknown) {
    console.warn("[OpenCTI] GraphQL fetch error:", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── API methods ───────────────────────────────────────────────────────────────

export async function testOpenCTIConnection(config: OpenCTIConfig): Promise<{
  success: boolean;
  message: string;
  version?: string;
}> {
  const data = await gqlQuery<{ about: { version: string } }>(config, `
    query {
      about {
        version
      }
    }
  `);

  if (!data?.about) {
    return { success: false, message: "Failed to connect to OpenCTI — check URL and API token" };
  }

  return {
    success: true,
    message: `Connected to OpenCTI ${data.about.version}`,
    version: data.about.version,
  };
}

export async function fetchOpenCTIIndicators(
  config: OpenCTIConfig,
  limit = 100,
  after?: string
): Promise<{ indicators: OpenCTIIndicator[]; hasNextPage: boolean; endCursor?: string }> {
  const data = await gqlQuery<{
    indicators: {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: Array<{ node: OpenCTIIndicator }>;
    };
  }>(config, `
    query GetIndicators($first: Int, $after: ID) {
      indicators(first: $first, after: $after, orderBy: created_at, orderMode: desc) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id name pattern pattern_type valid_from confidence x_opencti_score
            labels { value }
            created_at modified
          }
        }
      }
    }
  `, { first: limit, after });

  if (!data?.indicators) return { indicators: [], hasNextPage: false };

  const indicators = data.indicators.edges.map(e => {
    const rawLabels = e.node.labels;
    const labels: string[] = Array.isArray(rawLabels)
      ? rawLabels.map((l: unknown) => (typeof l === "object" && l !== null && "value" in l ? String((l as { value: unknown }).value) : String(l)))
      : [];
    return { ...e.node, labels };
  });

  return {
    indicators,
    hasNextPage: data.indicators.pageInfo.hasNextPage,
    endCursor: data.indicators.pageInfo.endCursor,
  };
}

// Internal typed shapes for relationship resolution
interface IndicatorRelationEdge {
  node: {
    to: {
      __typename: string;
      id: string;
      name: string;
    };
  };
}

export async function lookupOpenCTIIOC(
  config: OpenCTIConfig,
  iocValue: string,
  iocType: string
): Promise<OpenCTIIocContext | null> {
  const cacheKey = `${iocType}:${iocValue.toLowerCase()}`;
  const cached = getCachedIocContext(cacheKey);
  if (cached !== undefined) return cached;

  // Step 1: search for matching indicator
  const searchData = await gqlQuery<{
    indicators: { edges: Array<{ node: { id: string; name: string; confidence: number; x_opencti_score: number } }> };
  }>(config, `
    query SearchIOC($filters: FilterGroup) {
      indicators(first: 1, filters: $filters) {
        edges {
          node { id name confidence x_opencti_score }
        }
      }
    }
  `, {
    filters: {
      mode: "and",
      filters: [{ key: "value", values: [iocValue], mode: "or", operator: "eq" }],
      filterGroups: [],
    },
  });

  if (!searchData?.indicators?.edges?.length) {
    setCachedIocContext(cacheKey, null);
    return null;
  }

  const indicator = searchData.indicators.edges[0].node;

  // Step 2: resolve relationships to actor/campaign/malware
  const relData = await gqlQuery<{
    indicator: {
      indicatorOf: { edges: IndicatorRelationEdge[] };
    };
  }>(config, `
    query GetIndicatorRelationships($id: String!) {
      indicator(id: $id) {
        indicatorOf {
          edges {
            node {
              to {
                __typename
                id
                name
              }
            }
          }
        }
      }
    }
  `, { id: indicator.id });

  const context: OpenCTIIocContext = {
    iocValue,
    iocType,
    stixId: indicator.id,
    confidence: indicator.confidence,
    score: indicator.x_opencti_score,
    source: "opencti",
  };

  // Assign first match for each attribution type from relationships
  if (relData?.indicator?.indicatorOf?.edges) {
    for (const edge of relData.indicator.indicatorOf.edges) {
      const to = edge.node?.to;
      if (!to) continue;
      const typeName = to.__typename?.toLowerCase() ?? "";
      if (!context.actorName && typeName.includes("threat") && typeName.includes("actor")) {
        context.actorName = to.name;
        context.actorStixId = to.id;
      } else if (!context.campaignName && typeName === "campaign") {
        context.campaignName = to.name;
        context.campaignStixId = to.id;
      } else if (!context.malwareFamily && typeName === "malware") {
        context.malwareFamily = to.name;
        context.malwareStixId = to.id;
      }
    }
  }

  setCachedIocContext(cacheKey, context);
  return context;
}

export async function fetchOpenCTIThreatActors(
  config: OpenCTIConfig,
  limit = 50
): Promise<OpenCTIThreatActor[]> {
  const data = await gqlQuery<{
    threatActors: { edges: Array<{ node: OpenCTIThreatActor }> };
  }>(config, `
    query GetThreatActors($first: Int) {
      threatActors(first: $first, orderBy: modified, orderMode: desc) {
        edges {
          node {
            id name aliases description sophistication resource_level
            primary_motivation confidence x_opencti_score
            first_seen last_seen
            countries { edges { node { name } } }
          }
        }
      }
    }
  `, { first: limit });

  if (!data?.threatActors) return [];
  return data.threatActors.edges.map(e => {
    const nodeCountries = (e.node as { countries?: { edges: Array<{ node: { name: string } }> } }).countries;
    const country = nodeCountries?.edges?.[0]?.node?.name || "";
    return {
      ...e.node,
      country,
      aliases: Array.isArray(e.node.aliases) ? e.node.aliases : [],
    };
  });
}

export async function fetchOpenCTICampaigns(
  config: OpenCTIConfig,
  limit = 50
): Promise<OpenCTICampaign[]> {
  const data = await gqlQuery<{
    campaigns: { edges: Array<{ node: OpenCTICampaign }> };
  }>(config, `
    query GetCampaigns($first: Int) {
      campaigns(first: $first, orderBy: modified, orderMode: desc) {
        edges {
          node {
            id name description aliases first_seen last_seen objective confidence
          }
        }
      }
    }
  `, { first: limit });

  if (!data?.campaigns) return [];
  return data.campaigns.edges.map(e => ({
    ...e.node,
    aliases: Array.isArray(e.node.aliases) ? e.node.aliases : [],
  }));
}

export async function fetchOpenCTIMalware(
  config: OpenCTIConfig,
  limit = 50
): Promise<OpenCTIMalware[]> {
  const data = await gqlQuery<{
    malwares: { edges: Array<{ node: OpenCTIMalware }> };
  }>(config, `
    query GetMalware($first: Int) {
      malwares(first: $first, orderBy: modified, orderMode: desc) {
        edges {
          node {
            id name aliases description malware_types
            kill_chain_phases { kill_chain_name phase_name }
            first_seen last_seen confidence
          }
        }
      }
    }
  `, { first: limit });

  if (!data?.malwares) return [];
  return data.malwares.edges.map(e => ({
    ...e.node,
    aliases: Array.isArray(e.node.aliases) ? e.node.aliases : [],
    malware_types: Array.isArray(e.node.malware_types) ? e.node.malware_types : [],
    kill_chain_phases: Array.isArray(e.node.kill_chain_phases) ? e.node.kill_chain_phases : [],
  }));
}

// ── Background sync ───────────────────────────────────────────────────────────

export async function runOpenCTISync(config: OpenCTIConfig): Promise<{
  success: boolean;
  iocCount: number;
  actorCount: number;
  campaignCount: number;
  malwareCount: number;
  message: string;
}> {
  let iocCount = 0;
  let actorCount = 0;
  let campaignCount = 0;
  let malwareCount = 0;

  try {
    // Ensure opencti tables exist
    await ensureOpenCTITables();

    // Sync indicators (paginated, up to 1000)
    let hasMore = true;
    let cursor: string | undefined;
    let page = 0;

    while (hasMore && page < 10) {
      const result = await fetchOpenCTIIndicators(config, 100, cursor);

      for (const indicator of result.indicators) {
        try {
          const labels = Array.isArray(indicator.labels) ? indicator.labels : [];
          const iocType = inferIocTypeFromPattern(indicator.pattern, indicator.pattern_type);
          const iocValue = extractValueFromPattern(indicator.pattern);
          if (!iocType || !iocValue) continue;

          const reputation = (indicator.x_opencti_score || 0) >= 70 ? "malicious"
            : (indicator.x_opencti_score || 0) >= 40 ? "suspicious"
            : "unknown";

          await pool.query(
            `INSERT INTO opencti_ioc_cache (stix_id, indicator_type, indicator_value, reputation, confidence, score, source, labels, first_seen, last_seen)
             VALUES ($1, $2::ioc_type, $3, $4::ioc_reputation, $5, $6, 'opencti', $7, $8, $9)
             ON CONFLICT (stix_id) DO UPDATE SET
               indicator_value = EXCLUDED.indicator_value,
               reputation = EXCLUDED.reputation,
               confidence = GREATEST(opencti_ioc_cache.confidence, EXCLUDED.confidence),
               score = EXCLUDED.score,
               labels = EXCLUDED.labels,
               last_seen = COALESCE(EXCLUDED.last_seen, opencti_ioc_cache.last_seen),
               updated_at = NOW()`,
            [
              indicator.id,
              iocType,
              iocValue,
              reputation,
              indicator.confidence || 70,
              indicator.x_opencti_score || 0,
              JSON.stringify(labels),
              indicator.valid_from || null,
              indicator.modified || null,
            ]
          );
          // Also cross-populate canonical threat_intel_iocs for all tenants
          await crossPopulateThreatIntelIocs({
            stixId: indicator.id,
            indicatorType: iocType,
            indicatorValue: iocValue,
            reputation,
            confidence: indicator.confidence || 70,
            source: "opencti",
          });
          iocCount++;
        } catch (upsertErr: unknown) {
          console.warn("[OpenCTI] IOC upsert failed:", upsertErr instanceof Error ? upsertErr.message : String(upsertErr));
        }
      }

      hasMore = result.hasNextPage;
      cursor = result.endCursor;
      page++;
    }

    // Sync threat actors
    const actors = await fetchOpenCTIThreatActors(config, 100);
    for (const actor of actors) {
      try {
        await pool.query(
          `INSERT INTO opencti_threat_actors_cache (stix_id, name, aliases, description, sophistication, primary_motivation, country, first_seen, last_seen, confidence, score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             aliases = EXCLUDED.aliases,
             description = COALESCE(EXCLUDED.description, opencti_threat_actors_cache.description),
             sophistication = COALESCE(EXCLUDED.sophistication, opencti_threat_actors_cache.sophistication),
             primary_motivation = COALESCE(EXCLUDED.primary_motivation, opencti_threat_actors_cache.primary_motivation),
             country = COALESCE(EXCLUDED.country, opencti_threat_actors_cache.country),
             last_seen = COALESCE(EXCLUDED.last_seen, opencti_threat_actors_cache.last_seen),
             confidence = GREATEST(opencti_threat_actors_cache.confidence, EXCLUDED.confidence),
             updated_at = NOW()`,
          [
            actor.id,
            actor.name,
            JSON.stringify(actor.aliases || []),
            actor.description || null,
            actor.sophistication || null,
            actor.primary_motivation || null,
            actor.country || null,
            actor.first_seen || null,
            actor.last_seen || null,
            actor.confidence || 50,
            actor.x_opencti_score || 0,
          ]
        );
        actorCount++;
      } catch (upsertErr: unknown) {
        console.warn(`[OpenCTI] Threat actor upsert failed (stix_id=${actor.id}):`, upsertErr instanceof Error ? upsertErr.message : String(upsertErr));
      }
    }

    // Sync campaigns
    const campaigns = await fetchOpenCTICampaigns(config, 100);
    for (const campaign of campaigns) {
      try {
        await pool.query(
          `INSERT INTO opencti_campaigns_cache (stix_id, name, description, aliases, first_seen, last_seen, objective, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             description = COALESCE(EXCLUDED.description, opencti_campaigns_cache.description),
             aliases = EXCLUDED.aliases,
             last_seen = COALESCE(EXCLUDED.last_seen, opencti_campaigns_cache.last_seen),
             objective = COALESCE(EXCLUDED.objective, opencti_campaigns_cache.objective),
             confidence = GREATEST(opencti_campaigns_cache.confidence, EXCLUDED.confidence),
             updated_at = NOW()`,
          [
            campaign.id,
            campaign.name,
            campaign.description || null,
            JSON.stringify(campaign.aliases || []),
            campaign.first_seen || null,
            campaign.last_seen || null,
            campaign.objective || null,
            campaign.confidence || 50,
          ]
        );
        campaignCount++;
      } catch (upsertErr: unknown) {
        console.warn(`[OpenCTI] Campaign upsert failed (stix_id=${campaign.id}):`, upsertErr instanceof Error ? upsertErr.message : String(upsertErr));
      }
    }

    // Sync malware
    const malware = await fetchOpenCTIMalware(config, 100);
    for (const m of malware) {
      try {
        const killChain = m.kill_chain_phases.map(k => k.phase_name).join(", ");
        await pool.query(
          `INSERT INTO opencti_malware_cache (stix_id, name, description, aliases, malware_types, kill_chain_phases, first_seen, last_seen, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (stix_id) DO UPDATE SET
             name = EXCLUDED.name,
             description = COALESCE(EXCLUDED.description, opencti_malware_cache.description),
             aliases = EXCLUDED.aliases,
             malware_types = EXCLUDED.malware_types,
             kill_chain_phases = COALESCE(EXCLUDED.kill_chain_phases, opencti_malware_cache.kill_chain_phases),
             last_seen = COALESCE(EXCLUDED.last_seen, opencti_malware_cache.last_seen),
             confidence = GREATEST(opencti_malware_cache.confidence, EXCLUDED.confidence),
             updated_at = NOW()`,
          [
            m.id,
            m.name,
            m.description || null,
            JSON.stringify(m.aliases || []),
            JSON.stringify(m.malware_types || []),
            killChain || null,
            m.first_seen || null,
            m.last_seen || null,
            m.confidence || 70,
          ]
        );
        malwareCount++;
      } catch (upsertErr: unknown) {
        console.warn(`[OpenCTI] Malware upsert failed (stix_id=${m.id}):`, upsertErr instanceof Error ? upsertErr.message : String(upsertErr));
      }
    }

    // Update config metadata
    await pool.query(
      `UPDATE platform_integrations SET
         last_tested_at = NOW(),
         test_status = 'ok',
         extra_config = jsonb_set(
           jsonb_set(
             COALESCE(extra_config::jsonb, '{}'::jsonb),
             '{lastSyncedAt}',
             to_jsonb(NOW()::text)
           ),
           '{iocCount}',
           to_jsonb($2::int)
         )
       WHERE name = 'opencti'`,
      [1, iocCount]
    );

    console.log(`[OpenCTI] Sync complete: ${iocCount} IOCs, ${actorCount} actors, ${campaignCount} campaigns, ${malwareCount} malware`);

    return {
      success: true,
      iocCount,
      actorCount,
      campaignCount,
      malwareCount,
      message: `Synced ${iocCount} IOCs, ${actorCount} actors, ${campaignCount} campaigns, ${malwareCount} malware families`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OpenCTI] Sync error:", msg);
    return { success: false, iocCount, actorCount, campaignCount, malwareCount, message: msg };
  }
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

function inferIocTypeFromPattern(pattern: string, patternType?: string): string | null {
  if (!pattern) return null;
  if (/\[ipv4-addr/i.test(pattern)) return "ip";
  if (/\[domain-name/i.test(pattern)) return "domain";
  if (/\[url:/i.test(pattern)) return "url";
  if (/file:hashes\.'MD5'/i.test(pattern)) return "hash_md5";
  if (/file:hashes\.'SHA-256'/i.test(pattern)) return "hash_sha256";
  if (/file:hashes\.'SHA-1'/i.test(pattern)) return "hash_sha1";
  if (/\[email-addr/i.test(pattern)) return "email";
  return null;
}

function extractValueFromPattern(pattern: string): string | null {
  const match = pattern.match(/'([^']+)'\s*(?:\]|$)/);
  return match ? match[1] : null;
}

// ── OpenCTI tables: created via migrations/0019_add_taxii_opencti.sql ────────
// Schema is defined in shared/schema.ts (openctiIocCache, openctiThreatActors, etc.)
export async function ensureOpenCTITables(): Promise<void> {
  // Tables are created by the Drizzle migration (0019_add_taxii_opencti.sql).
  // This is a no-op kept for interface compatibility — no runtime DDL needed.
}

// ── Live stream state ─────────────────────────────────────────────────────────

interface StreamState {
  active: boolean;
  lastEventId: string | null;
  lastEventTime: string | null;
  eventsPerMinute: number;
  recentEvents: number;
  minuteStart: number;
  abortController: AbortController | null;
  reconnectTimer: NodeJS.Timeout | null;
}

const streamState: StreamState = {
  active: false,
  lastEventId: null,
  lastEventTime: null,
  eventsPerMinute: 0,
  recentEvents: 0,
  minuteStart: Date.now(),
  abortController: null,
  reconnectTimer: null,
};

export function getStreamStatus(): {
  active: boolean;
  lastEventId: string | null;
  lastEventTime: string | null;
  eventsPerMinute: number;
} {
  // Rolling 1-minute window: reset bucket when window expires
  const elapsed = (Date.now() - streamState.minuteStart) / 60000;
  if (elapsed >= 1) {
    streamState.eventsPerMinute = Math.round(streamState.recentEvents / elapsed);
    streamState.recentEvents = 0;
    streamState.minuteStart = Date.now();
  } else if (elapsed > 0) {
    streamState.eventsPerMinute = Math.round(streamState.recentEvents / elapsed);
  }

  return {
    active: streamState.active,
    lastEventId: streamState.lastEventId,
    lastEventTime: streamState.lastEventTime,
    eventsPerMinute: streamState.eventsPerMinute,
  };
}

export function stopLiveStream(): void {
  if (streamState.abortController) {
    streamState.abortController.abort();
    streamState.abortController = null;
  }
  if (streamState.reconnectTimer) {
    clearTimeout(streamState.reconnectTimer);
    streamState.reconnectTimer = null;
  }
  streamState.active = false;
  console.log("[OpenCTI] Live stream stopped");
}

export async function startLiveStream(config: OpenCTIConfig): Promise<void> {
  if (streamState.active) return;

  await ensureOpenCTITables();
  console.log("[OpenCTI] Starting live stream...");
  connectStream(config);
}

function connectStream(config: OpenCTIConfig): void {
  const controller = new AbortController();
  streamState.abortController = controller;
  streamState.active = true;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiToken}`,
    Accept: "text/event-stream",
  };

  if (streamState.lastEventId) {
    headers["Last-Event-ID"] = streamState.lastEventId;
  }

  const streamUrl = `${config.url}/stream`;

  fetch(streamUrl, { headers, signal: controller.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`Stream connection failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let streamDone = false;
      while (!controller.signal.aborted && !streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventData = "";
        let eventId: string | null = null;

        for (const line of lines) {
          if (line.startsWith("id:")) {
            eventId = line.slice(3).trim();
          } else if (line.startsWith("data:")) {
            eventData += line.slice(5).trim();
          } else if (line === "") {
            if (eventData) {
              if (eventId) {
                streamState.lastEventId = eventId;
                streamState.lastEventTime = new Date().toISOString();
              }
              streamState.recentEvents++;
              processStreamEvent(eventData).catch((evtErr: unknown) => {
                console.warn("[OpenCTI] Stream event processing failed:", evtErr instanceof Error ? evtErr.message : String(evtErr));
              });
              eventData = "";
              eventId = null;
            }
          }
        }
      }
      // Stream ended cleanly (server closed connection) — reconnect unless aborted
      if (streamDone && !controller.signal.aborted) {
        console.warn("[OpenCTI] Stream closed by server — reconnecting in 30s");
        streamState.active = false;
        scheduleReconnect(config);
      }
    })
    .catch((err) => {
      if (!controller.signal.aborted) {
        console.warn(`[OpenCTI] Stream error: ${err.message} — reconnecting in 30s`);
        streamState.active = false;
        scheduleReconnect(config);
      }
    });
}

function scheduleReconnect(config: OpenCTIConfig): void {
  if (streamState.reconnectTimer) return;
  streamState.reconnectTimer = setTimeout(() => {
    streamState.reconnectTimer = null;
    if (!streamState.active) {
      connectStream(config);
    }
  }, 30000);
}

async function processStreamEvent(data: string): Promise<void> {
  try {
    const event = JSON.parse(data) as {
      id?: string;
      type?: string;
      data?: { type?: string; id?: string; x_opencti_event_version?: string; [key: string]: unknown };
      event?: string;
    };

    const stixObj = event.data;
    if (!stixObj || !stixObj.id || !stixObj.type) return;

    const eventType = (event.type || event.event || "create").toLowerCase();

    if (eventType === "delete") {
      await handleStreamDelete(stixObj);
      return;
    }

    // Handle create/update
    switch (stixObj.type) {
      case "indicator":
        await handleStreamIndicator(stixObj, eventType);
        break;
      case "threat-actor":
        await handleStreamThreatActor(stixObj, eventType);
        break;
      case "campaign":
        await handleStreamCampaign(stixObj, eventType);
        break;
      case "malware":
        await handleStreamMalware(stixObj, eventType);
        break;
    }
  } catch (parseErr: unknown) {
    console.warn("[OpenCTI] Stream event parse error:", parseErr instanceof Error ? parseErr.message : String(parseErr));
  }
}

async function handleStreamDelete(obj: Record<string, unknown>): Promise<void> {
  const id = String(obj.id || "");
  if (!id) return;
  await pool.query(`DELETE FROM opencti_ioc_cache WHERE stix_id = $1`, [id]).catch((e: unknown) => { console.warn("[OpenCTI] Delete ioc_cache failed:", e instanceof Error ? e.message : String(e)); });
  await pool.query(`DELETE FROM opencti_threat_actors_cache WHERE stix_id = $1`, [id]).catch((e: unknown) => { console.warn("[OpenCTI] Delete actors_cache failed:", e instanceof Error ? e.message : String(e)); });
  await pool.query(`DELETE FROM opencti_campaigns_cache WHERE stix_id = $1`, [id]).catch((e: unknown) => { console.warn("[OpenCTI] Delete campaigns_cache failed:", e instanceof Error ? e.message : String(e)); });
  await pool.query(`DELETE FROM opencti_malware_cache WHERE stix_id = $1`, [id]).catch((e: unknown) => { console.warn("[OpenCTI] Delete malware_cache failed:", e instanceof Error ? e.message : String(e)); });
}

async function handleStreamIndicator(obj: Record<string, unknown>, _eventType: string): Promise<void> {
  const pattern = String(obj.pattern || "");
  const iocType = inferIocTypeFromPattern(pattern);
  const iocValue = extractValueFromPattern(pattern);
  if (!iocType || !iocValue) return;

  const score = Number(obj.x_opencti_score || 0);
  const reputation = score >= 70 ? "malicious" : score >= 40 ? "suspicious" : "unknown";

  await pool.query(
    `INSERT INTO opencti_ioc_cache (stix_id, indicator_type, indicator_value, reputation, confidence, score, source, labels)
     VALUES ($1, $2::ioc_type, $3, $4::ioc_reputation, $5, $6, 'opencti', $7)
     ON CONFLICT (stix_id) DO UPDATE SET
       indicator_value = EXCLUDED.indicator_value,
       reputation = EXCLUDED.reputation,
       confidence = GREATEST(opencti_ioc_cache.confidence, EXCLUDED.confidence),
       score = EXCLUDED.score,
       updated_at = NOW()`,
    [
      obj.id, iocType, iocValue, reputation,
      Number(obj.confidence || 70), score,
      JSON.stringify(Array.isArray(obj.labels) ? obj.labels : []),
    ]
  ).catch((e: unknown) => { console.warn("[OpenCTI] upsert failed:", e instanceof Error ? e.message : String(e)); });
  // Cross-populate canonical threat_intel_iocs for all tenants
  await crossPopulateThreatIntelIocs({
    stixId: String(obj.id || ""),
    indicatorType: iocType,
    indicatorValue: iocValue,
    reputation,
    confidence: Number(obj.confidence || 70),
    source: "opencti",
  });
}

async function handleStreamThreatActor(obj: Record<string, unknown>, _eventType: string): Promise<void> {
  await pool.query(
    `INSERT INTO opencti_threat_actors_cache (stix_id, name, aliases, description, sophistication, primary_motivation, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (stix_id) DO UPDATE SET
       name = EXCLUDED.name, aliases = EXCLUDED.aliases,
       description = COALESCE(EXCLUDED.description, opencti_threat_actors_cache.description),
       sophistication = COALESCE(EXCLUDED.sophistication, opencti_threat_actors_cache.sophistication),
       primary_motivation = COALESCE(EXCLUDED.primary_motivation, opencti_threat_actors_cache.primary_motivation),
       confidence = GREATEST(opencti_threat_actors_cache.confidence, EXCLUDED.confidence),
       updated_at = NOW()`,
    [
      obj.id, String(obj.name || "Unknown"),
      JSON.stringify(Array.isArray(obj.aliases) ? obj.aliases : []),
      obj.description || null, obj.sophistication || null,
      obj.primary_motivation || null,
      Number(obj.confidence || 50),
    ]
  ).catch((e: unknown) => { console.warn("[OpenCTI] upsert failed:", e instanceof Error ? e.message : String(e)); });
}

async function handleStreamCampaign(obj: Record<string, unknown>, _eventType: string): Promise<void> {
  await pool.query(
    `INSERT INTO opencti_campaigns_cache (stix_id, name, description, first_seen, last_seen, objective, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (stix_id) DO UPDATE SET
       name = EXCLUDED.name,
       description = COALESCE(EXCLUDED.description, opencti_campaigns_cache.description),
       last_seen = COALESCE(EXCLUDED.last_seen, opencti_campaigns_cache.last_seen),
       objective = COALESCE(EXCLUDED.objective, opencti_campaigns_cache.objective),
       updated_at = NOW()`,
    [
      obj.id, String(obj.name || "Unknown"), obj.description || null,
      obj.first_seen || null, obj.last_seen || null,
      typeof obj.objective === "string" ? obj.objective : null,
      Number(obj.confidence || 50),
    ]
  ).catch((e: Error) => console.warn("[OpenCTI] Stream campaign upsert:", e.message));
}

async function handleStreamMalware(obj: Record<string, unknown>, _eventType: string): Promise<void> {
  const rawKillChain = obj.kill_chain_phases;
  const killChain = Array.isArray(rawKillChain)
    ? rawKillChain.map((k: unknown) => {
        if (typeof k === "object" && k !== null && "phase_name" in k) return String((k as { phase_name: unknown }).phase_name);
        return String(k);
      }).join(", ")
    : null;
  const malwareTypes = Array.isArray(obj.malware_types) ? obj.malware_types : [];

  await pool.query(
    `INSERT INTO opencti_malware_cache (stix_id, name, description, aliases, malware_types, kill_chain_phases, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (stix_id) DO UPDATE SET
       name = EXCLUDED.name,
       description = COALESCE(EXCLUDED.description, opencti_malware_cache.description),
       aliases = EXCLUDED.aliases,
       malware_types = EXCLUDED.malware_types,
       kill_chain_phases = COALESCE(EXCLUDED.kill_chain_phases, opencti_malware_cache.kill_chain_phases),
       updated_at = NOW()`,
    [
      obj.id, String(obj.name || "Unknown"), obj.description || null,
      JSON.stringify(Array.isArray(obj.aliases) ? obj.aliases : []),
      JSON.stringify(malwareTypes),
      killChain,
      Number(obj.confidence || 70),
    ]
  ).catch((e: Error) => console.warn("[OpenCTI] Stream malware upsert:", e.message));
}
