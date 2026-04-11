/**
 * Threat Feed Service — Open-Source IOC Enrichment
 *
 * Integrates the following freely available threat intelligence feeds:
 *   - MalwareBazaar (abuse.ch) — hash lookups, API key now required (Auth-Key header)
 *   - URLhaus (abuse.ch)       — URL/domain lookups, no API key required
 *   - Feodo Tracker (abuse.ch) — C2 IP blocklist, cached in memory at startup
 *   - AlienVault OTX           — hash/IP/domain/URL, API key from platform_integrations DB
 *   - VirusTotal Community     — hash/IP/domain, API key from platform_integrations DB
 *
 * All calls use a 2-second timeout and fail silently. Non-blocking by design.
 * API keys are stored in and read from the platform_integrations PostgreSQL table.
 * No environment variables are used for integration keys.
 */

import { pool } from "./db";

const FEED_TIMEOUT_MS = 8000;

// ── In-memory result cache (prevents quota exhaustion on repeated lookups) ─────
interface CacheEntry { result: FeedEnrichment; expiresAt: number; }
const feedCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const CACHE_MAX_SIZE = 2000;

function getCached(key: string): FeedEnrichment | null {
  const entry = feedCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { feedCache.delete(key); return null; }
  return entry.result;
}

function setCache(key: string, result: FeedEnrichment): void {
  if (feedCache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry
    const oldestKey = feedCache.keys().next().value;
    if (oldestKey) feedCache.delete(oldestKey);
  }
  feedCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

export interface VTVendorResult {
  engineName: string;
  category: string;
  result: string | null;
}

export interface FeedEnrichment {
  feedName: string;
  status: "hit" | "miss" | "unavailable" | "skipped" | "no_key";
  malwareFamily?: string | null;
  tags?: string[];
  firstSeen?: string | null;
  lastSeen?: string | null;
  country?: string | null;
  confidence?: number | null;
  detections?: number | null;
  totalEngines?: number | null;
  threatType?: string | null;
  additionalContext?: string | null;
  vtVendorResults?: VTVendorResult[];
  vtThreatLabel?: string | null;
  vtThreatCategories?: string[];
  vtFamilyNames?: string[];
  vtFileTags?: string[];
  vtFileNames?: string[];
  vtFileSize?: number | null;
  vtLastAnalysisDate?: number | null;
}

export interface FeedSource {
  name: string;
  status: "hit" | "miss" | "unavailable" | "skipped" | "no_key" | "disabled";
  hitCount?: number;
  requiresKey: boolean;
  keyConfigured: boolean;
}

export interface IOCFeedResult {
  value: string;
  type: string;
  enrichments: FeedEnrichment[];
}

export interface BulkFeedResult {
  iocResults: IOCFeedResult[];
  feedSources: FeedSource[];
  verdictEscalation: boolean;
  escalationReason?: string;
}

// ── Feodo Tracker blocklist (cached in memory) ────────────────────────────────
let feodoIpSet: Set<string> | null = null;
let feodoLoadedAt: number | null = null;
const FEODO_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function getFeodoBlocklist(): Promise<Set<string>> {
  const now = Date.now();
  if (feodoIpSet && feodoLoadedAt && now - feodoLoadedAt < FEODO_CACHE_TTL_MS) {
    return feodoIpSet;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const res = await fetch("https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data: unknown = await res.json();
      if (Array.isArray(data)) {
        feodoIpSet = new Set(
          data
            .filter((e: unknown) => typeof e === "object" && e !== null && "ip_address" in (e as Record<string, unknown>))
            .map((e: unknown) => String((e as Record<string, unknown>)["ip_address"]))
        );
        feodoLoadedAt = now;
        return feodoIpSet;
      }
    }
  } catch {
    // silently ignore
  }
  return feodoIpSet ?? new Set();
}

// Pre-load Feodo blocklist at startup (best effort, non-blocking)
getFeodoBlocklist().catch(() => {});

// ── Per-feed lookup functions ─────────────────────────────────────────────────

async function queryMalwareBazaar(hash: string, apiKey: string | null): Promise<FeedEnrichment> {
  const feed: FeedEnrichment = { feedName: "MalwareBazaar", status: "unavailable" };
  const cacheKey = `mb:${hash.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (apiKey) headers["Auth-Key"] = apiKey;
    const res = await fetch("https://mb-api.abuse.ch/api/v1/", {
      method: "POST",
      headers,
      body: `query=get_info&hash=${encodeURIComponent(hash)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 401 || res.status === 403) {
      // MB now requires API authentication — key not configured or invalid
      return { ...feed, status: "no_key" };
    }
    if (!res.ok) return { ...feed, status: "unavailable" };
    const data: unknown = await res.json();
    if (
      typeof data === "object" && data !== null &&
      "query_status" in (data as Record<string, unknown>)
    ) {
      const d = data as Record<string, unknown>;
      if (d["query_status"] === "ok" && Array.isArray(d["data"]) && d["data"].length > 0) {
        const entry = (d["data"] as Record<string, unknown>[])[0];
        const result: FeedEnrichment = {
          feedName: "MalwareBazaar",
          status: "hit",
          malwareFamily: typeof entry["signature"] === "string" ? entry["signature"] : null,
          tags: Array.isArray(entry["tags"]) ? (entry["tags"] as string[]) : [],
          firstSeen: typeof entry["first_seen"] === "string" ? entry["first_seen"] : null,
          country: typeof entry["origin_country"] === "string" ? entry["origin_country"] : null,
          threatType: typeof entry["file_type"] === "string" ? entry["file_type"] : null,
          additionalContext: `${typeof entry["file_name"] === "string" ? `File: ${entry["file_name"]}` : ""}${typeof entry["file_size"] === "number" ? ` Size: ${entry["file_size"]} bytes` : ""}`.trim() || null,
        };
        setCache(cacheKey, result);
        return result;
      } else if (d["query_status"] === "no_results") {
        const miss: FeedEnrichment = { ...feed, status: "miss" };
        setCache(cacheKey, miss);
        return miss;
      }
    }
    return { ...feed, status: "miss" };
  } catch {
    return { ...feed, status: "unavailable" };
  }
}

async function queryURLhaus(urlOrDomain: string): Promise<FeedEnrichment> {
  const feed: FeedEnrichment = { feedName: "URLhaus", status: "unavailable" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const body = urlOrDomain.startsWith("http")
      ? `url=${encodeURIComponent(urlOrDomain)}`
      : `host=${encodeURIComponent(urlOrDomain)}`;
    const endpoint = urlOrDomain.startsWith("http")
      ? "https://urlhaus-api.abuse.ch/v1/url/"
      : "https://urlhaus-api.abuse.ch/v1/host/";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ...feed, status: "unavailable" };
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      if (d["query_status"] === "is_listed") {
        return {
          feedName: "URLhaus",
          status: "hit",
          malwareFamily: typeof d["url_type"] === "string" ? d["url_type"] : null,
          firstSeen: typeof d["date_added"] === "string" ? d["date_added"] : null,
          threatType: typeof d["threat"] === "string" ? d["threat"] : null,
          additionalContext: typeof d["tags"] === "string" ? d["tags"] : null,
        };
      } else if (d["query_status"] === "not_listed" || d["query_status"] === "no_results") {
        return { ...feed, status: "miss" };
      }
    }
    return { ...feed, status: "miss" };
  } catch {
    return { ...feed, status: "unavailable" };
  }
}

async function queryFeodoTracker(ip: string): Promise<FeedEnrichment> {
  const feed: FeedEnrichment = { feedName: "Feodo Tracker", status: "unavailable" };
  try {
    const blocklist = await getFeodoBlocklist();
    if (blocklist.size === 0) return { ...feed, status: "unavailable" };
    return blocklist.has(ip)
      ? { feedName: "Feodo Tracker", status: "hit", threatType: "C2 Botnet IP", malwareFamily: "Botnet C2 Infrastructure" }
      : { ...feed, status: "miss" };
  } catch {
    return { ...feed, status: "unavailable" };
  }
}

async function queryAlienVaultOTX(iocValue: string, iocType: string, apiKey: string | null): Promise<FeedEnrichment> {
  const feed: FeedEnrichment = { feedName: "AlienVault OTX", status: "unavailable" };
  if (!apiKey) return { feedName: "AlienVault OTX", status: "skipped" }; // no key configured in DB

  try {
    // Map our IOC types to OTX indicator types
    const typeMap: Record<string, string> = {
      hash: "file",
      ip: "IPv4",
      domain: "domain",
      url: "url",
    };
    const otxType = typeMap[iocType];
    if (!otxType) return { ...feed, status: "miss" };

    // Hash needs SHA256/MD5 section
    const section = iocType === "hash" ? "analysis" : "general";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/${otxType}/${encodeURIComponent(iocValue)}/${section}`, {
      headers: { "X-OTX-API-KEY": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ...feed, status: res.status === 404 ? "miss" : "unavailable" };
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      const pulseCount = typeof d["pulse_info"] === "object" && d["pulse_info"] !== null
        ? (d["pulse_info"] as Record<string, unknown>)["count"]
        : 0;
      const count = Number(pulseCount) || 0;
      if (count > 0) {
        const pulseInfo = d["pulse_info"] as Record<string, unknown>;
        const pulses = Array.isArray(pulseInfo["pulses"]) ? pulseInfo["pulses"] as Record<string, unknown>[] : [];
        const firstPulse = pulses[0];
        return {
          feedName: "AlienVault OTX",
          status: "hit",
          malwareFamily: firstPulse && typeof firstPulse["name"] === "string" ? firstPulse["name"] : null,
          tags: firstPulse && Array.isArray(firstPulse["tags"]) ? (firstPulse["tags"] as string[]) : [],
          confidence: Math.min(100, count * 10),
          additionalContext: `${count} threat pulse(s) found`,
        };
      }
      return { ...feed, status: "miss" };
    }
    return { ...feed, status: "miss" };
  } catch {
    return { ...feed, status: "unavailable" };
  }
}

async function queryVirusTotal(iocValue: string, iocType: string, apiKey: string | null): Promise<FeedEnrichment> {
  const feed: FeedEnrichment = { feedName: "VirusTotal", status: "unavailable" };
  if (!apiKey) return { feedName: "VirusTotal", status: "skipped" }; // no key configured in DB

  const cacheKey = `vt:${iocType}:${iocValue.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const typePathMap: Record<string, string> = {
      hash: "files",
      ip: "ip_addresses",
      domain: "domains",
      url: "urls",
    };
    const vtPath = typePathMap[iocType];
    if (!vtPath) return { ...feed, status: "miss" };

    // VirusTotal URL lookups require base64url encoding
    const lookupValue = iocType === "url"
      ? Buffer.from(iocValue).toString("base64url")
      : encodeURIComponent(iocValue);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const res = await fetch(`https://www.virustotal.com/api/v3/${vtPath}/${lookupValue}`, {
      headers: { "x-apikey": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 404) {
      const miss: FeedEnrichment = { ...feed, status: "miss" };
      setCache(cacheKey, miss);
      return miss;
    }
    if (res.status === 401 || res.status === 403) {
      // Invalid or expired API key
      return { ...feed, status: "no_key" };
    }
    if (res.status === 429) {
      // Quota exceeded — don't cache so the next request retries
      return { ...feed, status: "unavailable", additionalContext: "Rate limit — retry in 60s" };
    }
    if (!res.ok) return { ...feed, status: "unavailable" };
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      const attrs = d["data"] && typeof d["data"] === "object"
        ? (d["data"] as Record<string, unknown>)["attributes"]
        : null;
      if (attrs && typeof attrs === "object") {
        const a = attrs as Record<string, unknown>;
        const stats = a["last_analysis_stats"] as Record<string, number> | null;
        const malicious = stats?.["malicious"] ?? 0;
        const total = stats
          ? Object.values(stats).reduce((s, v) => s + (v as number), 0)
          : 0;
        if (total > 0) {
          const isHit = malicious > 0;

          // Per-vendor detection results (malicious + suspicious only, max 30)
          const lastResults = a["last_analysis_results"] as Record<string, Record<string, string>> | null;
          const vtVendorResults: VTVendorResult[] = lastResults
            ? Object.entries(lastResults)
                .filter(([, v]) => v.category === "malicious" || v.category === "suspicious")
                .map(([engineName, v]) => ({ engineName, category: v.category, result: v.result || null }))
                .sort((a, b) => (a.category === "malicious" ? -1 : 1) - (b.category === "malicious" ? -1 : 1))
                .slice(0, 30)
            : [];

          // Popular threat classification
          const ptc = a["popular_threat_classification"] as Record<string, unknown> | null;
          const vtThreatLabel = typeof ptc?.["suggested_threat_label"] === "string"
            ? ptc["suggested_threat_label"] as string
            : null;
          const rawCategories = ptc?.["popular_threat_category"];
          const vtThreatCategories: string[] = Array.isArray(rawCategories)
            ? (rawCategories as Array<Record<string, unknown>>).map(c => String(c["value"] ?? "")).filter(Boolean)
            : [];
          const rawFamilyNames = ptc?.["popular_threat_name"];
          const vtFamilyNames: string[] = Array.isArray(rawFamilyNames)
            ? (rawFamilyNames as Array<Record<string, unknown>>).map(f => String(f["value"] ?? "")).filter(Boolean)
            : [];

          // File metadata
          const rawTags = a["tags"];
          const vtFileTags: string[] = Array.isArray(rawTags)
            ? (rawTags as unknown[]).map(String).slice(0, 12)
            : [];
          const rawNames = a["names"];
          const vtFileNames: string[] = Array.isArray(rawNames)
            ? (rawNames as unknown[]).map(String).slice(0, 3)
            : [];
          const vtFileSize = typeof a["size"] === "number" ? a["size"] as number : null;
          const vtLastAnalysisDate = typeof a["last_analysis_date"] === "number"
            ? a["last_analysis_date"] as number
            : null;

          // malwareFamily: prefer vtThreatLabel or first vtFamilyName
          const resolvedFamily = vtThreatLabel
            ?? vtFamilyNames[0]
            ?? (typeof a["popular_threat_name"] === "string" ? a["popular_threat_name"] as string : null);

          const vtResult: FeedEnrichment = {
            feedName: "VirusTotal",
            status: isHit ? "hit" : "miss",
            detections: malicious,
            totalEngines: total,
            confidence: isHit ? Math.round((malicious / total) * 100) : 0,
            malwareFamily: resolvedFamily,
            additionalContext: `${malicious}/${total} engines flagged`,
            country: typeof a["country"] === "string" ? a["country"] as string : null,
            vtVendorResults,
            vtThreatLabel,
            vtThreatCategories,
            vtFamilyNames,
            vtFileTags,
            vtFileNames,
            vtFileSize,
            vtLastAnalysisDate,
          };
          setCache(cacheKey, vtResult);
          return vtResult;
        }
      }
    }
    const miss: FeedEnrichment = { ...feed, status: "miss" };
    setCache(cacheKey, miss);
    return miss;
  } catch {
    return { ...feed, status: "unavailable" };
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SimpleIOC {
  type: string;
  value: string;
}

// ── DB-backed integration config loader ──────────────────────────────────────
// Reads enabled flag and API keys from platform_integrations table.
// Returns null for any field if the table doesn't exist yet (e.g. first boot before migration).
interface IntegrationConfig {
  enabled: boolean;
  apiKey: string | null;
}
async function loadIntegrationConfigs(): Promise<Record<string, IntegrationConfig>> {
  try {
    const res = await pool.query<{ name: string; enabled: boolean; api_key: string | null }>(
      "SELECT name, enabled, api_key FROM platform_integrations"
    );
    const map: Record<string, IntegrationConfig> = {};
    for (const row of res.rows) {
      map[row.name] = { enabled: row.enabled, apiKey: row.api_key };
    }
    return map;
  } catch {
    // Table may not exist yet on first boot before migration completes
    return {};
  }
}

export async function enrichIOCsFromPublicFeeds(
  iocs: SimpleIOC[]
): Promise<BulkFeedResult> {
  // Load integration config from DB (keys + enabled flags)
  const configs = await loadIntegrationConfigs();

  const cfg = (slug: string): IntegrationConfig =>
    configs[slug] ?? { enabled: true, apiKey: null };

  const otxCfg    = cfg("alienvault_otx");
  const vtCfg     = cfg("virustotal");
  const mbCfg     = cfg("malwarebazaar");
  const uhEnabled  = cfg("urlhaus").enabled;
  const ftEnabled  = cfg("feodo_tracker").enabled;
  const OTX_KEY   = otxCfg.enabled ? otxCfg.apiKey : null;
  const VT_KEY    = vtCfg.enabled  ? vtCfg.apiKey  : null;
  // MalwareBazaar now requires an API key (changed policy — returns 401 without auth)
  const MB_KEY    = mbCfg.enabled  ? mbCfg.apiKey  : null;

  const feedSourceMap: Record<string, FeedSource> = {
    MalwareBazaar:    { name: "MalwareBazaar",  status: mbCfg.enabled ? (MB_KEY ? "skipped" : "no_key") : "disabled", hitCount: 0, requiresKey: true,  keyConfigured: !!MB_KEY },
    URLhaus:          { name: "URLhaus",          status: uhEnabled ? "skipped" : "disabled", hitCount: 0, requiresKey: false, keyConfigured: true },
    "Feodo Tracker":  { name: "Feodo Tracker",    status: ftEnabled ? "skipped" : "disabled", hitCount: 0, requiresKey: false, keyConfigured: true },
    "AlienVault OTX": { name: "AlienVault OTX",   status: otxCfg.enabled ? (OTX_KEY ? "skipped" : "no_key") : "disabled", hitCount: 0, requiresKey: true,  keyConfigured: !!OTX_KEY },
    VirusTotal:       { name: "VirusTotal",        status: vtCfg.enabled  ? (VT_KEY  ? "skipped" : "no_key") : "disabled", hitCount: 0, requiresKey: true,  keyConfigured: !!VT_KEY  },
  };

  // Deduplicate IOCs by type+value
  const seen = new Set<string>();
  const uniqueIocs = iocs.filter(ioc => {
    const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build all lookup promises concurrently across all IOCs (fanout), capped at 20 IOCs
  type TaggedEnrichment = { typeValueKey: string; enrichment: FeedEnrichment };

  const allPromises: Promise<TaggedEnrichment>[] = [];

  for (const ioc of uniqueIocs.slice(0, 20)) {
    const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
    const wrap = (p: Promise<FeedEnrichment>): Promise<TaggedEnrichment> =>
      p.then(enrichment => ({ typeValueKey: key, enrichment }));

    if (ioc.type === "hash") {
      if (mbCfg.enabled && MB_KEY) allPromises.push(wrap(queryMalwareBazaar(ioc.value, MB_KEY)));
      if (VT_KEY)     allPromises.push(wrap(queryVirusTotal(ioc.value, "hash", VT_KEY)));
      if (OTX_KEY)    allPromises.push(wrap(queryAlienVaultOTX(ioc.value, "hash", OTX_KEY)));
    } else if (ioc.type === "ip") {
      if (ftEnabled)  allPromises.push(wrap(queryFeodoTracker(ioc.value)));
      if (VT_KEY)     allPromises.push(wrap(queryVirusTotal(ioc.value, "ip", VT_KEY)));
      if (OTX_KEY)    allPromises.push(wrap(queryAlienVaultOTX(ioc.value, "ip", OTX_KEY)));
    } else if (ioc.type === "domain") {
      if (uhEnabled)  allPromises.push(wrap(queryURLhaus(ioc.value)));
      if (VT_KEY)     allPromises.push(wrap(queryVirusTotal(ioc.value, "domain", VT_KEY)));
      if (OTX_KEY)    allPromises.push(wrap(queryAlienVaultOTX(ioc.value, "domain", OTX_KEY)));
    } else if (ioc.type === "url" || ioc.type === "phishing_url") {
      if (uhEnabled)  allPromises.push(wrap(queryURLhaus(ioc.value)));
      if (VT_KEY)     allPromises.push(wrap(queryVirusTotal(ioc.value, "url", VT_KEY)));
      if (OTX_KEY)    allPromises.push(wrap(queryAlienVaultOTX(ioc.value, "url", OTX_KEY)));
    }
    // other IOC types: no supported feed dispatchers, skip
  }

  // Wait for all lookups concurrently — each has its own per-call 2s timeout, so the
  // overall wall-clock time is bounded by max(any single feed timeout), not the sum.
  const settled = await Promise.allSettled(allPromises);

  // Group enrichments back by (type,value) key
  const enrichMap = new Map<string, FeedEnrichment[]>();
  for (const result of settled) {
    if (result.status === "fulfilled") {
      const { typeValueKey, enrichment } = result.value;
      if (!enrichMap.has(typeValueKey)) enrichMap.set(typeValueKey, []);
      enrichMap.get(typeValueKey)!.push(enrichment);
    }
  }

  // Build iocResults list and aggregate feed source stats
  const escalationReasons: string[] = [];
  const iocResults: IOCFeedResult[] = [];

  for (const ioc of uniqueIocs.slice(0, 20)) {
    const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
    const enrichments = enrichMap.get(key) ?? [];
    if (enrichments.length === 0) continue;
    iocResults.push({ value: ioc.value, type: ioc.type, enrichments });

    for (const enr of enrichments) {
      const src = feedSourceMap[enr.feedName];
      if (!src) continue;
      if (enr.status === "hit") {
        src.status = "hit";
        src.hitCount = (src.hitCount ?? 0) + 1;
        if (enr.malwareFamily) escalationReasons.push(`${enr.feedName}: ${enr.malwareFamily}`);
      } else if (enr.status === "miss" && (src.status === "skipped" || src.status === "no_key")) {
        // Only upgrade from skipped → miss for feeds that were actually queried (key-less feeds)
        if (!src.requiresKey || src.keyConfigured) src.status = "miss";
      } else if (enr.status === "no_key") {
        // Feed returned auth failure at runtime — reflect accurate key status
        if (src.status === "skipped") src.status = "no_key";
      } else if (enr.status === "unavailable" && src.status === "skipped") {
        src.status = "unavailable";
      }
    }
  }

  // Verdict escalation: any confirmed feed hit is sufficient evidence
  const feedsWithHits = Object.values(feedSourceMap).filter(s => (s.hitCount ?? 0) > 0);
  const verdictEscalation = feedsWithHits.length >= 1;

  return {
    iocResults,
    feedSources: Object.values(feedSourceMap),
    verdictEscalation,
    escalationReason: escalationReasons.length > 0
      ? escalationReasons.slice(0, 3).join("; ")
      : undefined,
  };
}
