import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import crypto from "crypto";

export interface SigmaRule {
  id: string;
  title: string;
  status: string;
  level: string;
  description: string;
  author: string;
  date: string;
  logsource: {
    category: string;
    product: string;
    service?: string;
  };
  detection: {
    selection: Record<string, any>;
    keywords: string[];
    condition: string;
    rawDetection?: Record<string, any>;
  };
  falsepositives: string[];
  tags: string[];
  mitre: {
    tactic: string;
    technique: string;
    technique_name: string;
  };
  filePath?: string;
  enabled: boolean;
  matchCount: number;
  lastMatchAt: string | null;
  ruleSource: "builtin" | "community" | "custom";
  precompiledKeywords?: string[];
}

export interface SigmaMatch {
  ruleId: string;
  ruleTitle: string;
  severity: string;
  mitreTactic: string;
  mitreTechnique: string;
  mitreTechniqueName: string;
  tags: string[];
  description: string;
  matchedKeywords: string[];
  confidence: number;
}

export interface SigmaMatchStats {
  totalRules: number;
  enabledRules: number;
  totalMatches: number;
  matchesByRule: Record<string, number>;
  matchesBySeverity: Record<string, number>;
  matchesByTactic: Record<string, number>;
  topRules: { ruleId: string; title: string; matches: number }[];
  rulesBySource: { builtin: number; community: number; custom: number };
  rulesByCategory: Record<string, number>;
}

export interface CorrelationPattern {
  patternName: string;
  description: string;
  events: Record<string, any>[];
  sigmaMatches: SigmaMatch[];
  severity: string;
  mitreTactic: string;
  confidence: number;
  entity?: string;
  sourceIps?: string[];
  destinationIps?: string[];
  tactics?: string[];
}

export const SIGMA_RULES_DIR = path.join(process.cwd(), "sigma-rules");
const MAX_MATCHES_PER_EVENT = 10;

let loadedRules: SigmaRule[] = [];
let ruleMatchStats: Map<string, number> = new Map();
let ruleLastMatch: Map<string, string> = new Map();
let categoryIndex: Map<string, SigmaRule[]> = new Map();
let anyRules: SigmaRule[] = [];

const EVENT_TYPE_TO_CATEGORIES: Record<string, string[]> = {
  email: ["email"],
  endpoint: ["process_creation", "file_event", "image_load", "registry_event", "file_access", "file_change", "file_delete", "file_rename", "driver_load", "dns_query", "network_connection", "pipe_created", "ps_module", "ps_script", "ps_classic_start", "sysmon"],
  identity: ["authentication"],
  cloud: ["cloud", "aws", "azure", "gcp", "m365", "okta"],
  network: ["network", "firewall", "dns", "proxy", "webserver"],
  vulnerability: ["vulnerability"],
  sse: ["cloud", "web", "proxy"],
  dlp: ["cloud", "data_loss"],
  waf: ["web", "webserver"],
  casb: ["cloud"],
};

const LOGSOURCE_TO_EVENT_TYPES: Map<string, string[]> = new Map();
for (const [eventType, categories] of Object.entries(EVENT_TYPE_TO_CATEGORIES)) {
  for (const cat of categories) {
    if (!LOGSOURCE_TO_EVENT_TYPES.has(cat)) LOGSOURCE_TO_EVENT_TYPES.set(cat, []);
    LOGSOURCE_TO_EVENT_TYPES.get(cat)!.push(eventType);
  }
}

function extractMitreFromTags(tags: string[]): { tactic: string; technique: string; technique_name: string } {
  let tactic = "";
  let technique = "";
  let technique_name = "";

  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.startsWith("attack.t") && /^attack\.t\d{4}/.test(t)) {
      technique = t.replace("attack.", "").toUpperCase();
    } else if (t.startsWith("attack.")) {
      const name = t.replace("attack.", "").replace(/_/g, " ");
      if (!tactic) tactic = name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  return { tactic, technique, technique_name };
}

function extractKeywordsFromDetection(detection: Record<string, any>): string[] {
  const keywords: string[] = [];
  if (Array.isArray(detection.keywords)) return detection.keywords;

  for (const [key, value] of Object.entries(detection)) {
    if (key === "condition" || key === "timeframe") continue;
    if (typeof value === "object" && value !== null) {
      const vals = Object.values(value);
      for (const v of vals) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string" && item.length > 2 && item.length < 200) {
              keywords.push(item.toLowerCase());
            }
          }
        } else if (typeof v === "string" && v.length > 2 && v.length < 200) {
          keywords.push(v.toLowerCase());
        }
      }
    }
  }
  return keywords;
}

function extractSelectionFromDetection(detection: Record<string, any>): Record<string, any> {
  if (detection.selection) {
    if (typeof detection.selection === "object" && !Array.isArray(detection.selection)) {
      return detection.selection;
    }
  }
  for (const [key, value] of Object.entries(detection)) {
    if (key.startsWith("selection") && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
  }
  return {};
}

function determineRuleSource(filePath: string): "builtin" | "community" | "custom" {
  if (filePath.includes("/community/")) return "community";
  if (filePath.includes("/custom/")) return "custom";
  return "builtin";
}

export function parseRule(content: string, filePath: string): SigmaRule | null {
  try {
    const parsed = yaml.load(content) as any;
    if (!parsed || !parsed.title || !parsed.detection) return null;

    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const mitreFromTags = extractMitreFromTags(tags);
    const mitre = parsed.mitre || mitreFromTags;

    const keywords = extractKeywordsFromDetection(parsed.detection);
    const selection = extractSelectionFromDetection(parsed.detection);

    const ruleSource = determineRuleSource(filePath);

    return {
      id: parsed.id || `sigma-${crypto.createHash("md5").update(parsed.title + filePath).digest("hex").slice(0, 12)}`,
      title: parsed.title,
      status: parsed.status || "experimental",
      level: parsed.level || "medium",
      description: parsed.description || "",
      author: parsed.author || "Unknown",
      date: parsed.date || "",
      logsource: {
        category: parsed.logsource?.category || "any",
        product: parsed.logsource?.product || "any",
        service: parsed.logsource?.service,
      },
      detection: {
        selection,
        keywords,
        condition: parsed.detection?.condition || "selection",
        rawDetection: parsed.detection,
      },
      falsepositives: Array.isArray(parsed.falsepositives) ? parsed.falsepositives : [],
      tags,
      mitre: {
        tactic: mitre.tactic || "",
        technique: mitre.technique || "",
        technique_name: mitre.technique_name || "",
      },
      filePath,
      enabled: ruleSource === "builtin",
      matchCount: ruleMatchStats.get(parsed.id) || 0,
      lastMatchAt: ruleLastMatch.get(parsed.id) || null,
      ruleSource,
      precompiledKeywords: keywords.map(k => k.toLowerCase()),
    };
  } catch {
    return null;
  }
}

function loadRulesFromDirectory(dir: string): SigmaRule[] {
  const rules: SigmaRule[] = [];
  if (!fs.existsSync(dir)) return rules;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rules.push(...loadRulesFromDirectory(fullPath));
    } else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const rule = parseRule(content, fullPath);
        if (rule) rules.push(rule);
      } catch {}
    }
  }
  return rules;
}

function buildCategoryIndex(): void {
  categoryIndex.clear();
  anyRules = [];

  for (const rule of loadedRules) {
    if (!rule.enabled) continue;
    const cat = rule.logsource.category;
    if (cat === "any") {
      anyRules.push(rule);
      continue;
    }
    if (!categoryIndex.has(cat)) categoryIndex.set(cat, []);
    categoryIndex.get(cat)!.push(rule);
  }
}

export function loadSigmaRules(): SigmaRule[] {
  const startTime = Date.now();
  loadedRules = loadRulesFromDirectory(SIGMA_RULES_DIR);

  const dupeMap = new Map<string, SigmaRule>();
  for (const rule of loadedRules) {
    if (!dupeMap.has(rule.id)) {
      dupeMap.set(rule.id, rule);
    }
  }
  loadedRules = Array.from(dupeMap.values());

  buildCategoryIndex();

  const elapsed = Date.now() - startTime;
  const builtin = loadedRules.filter(r => r.ruleSource === "builtin").length;
  const community = loadedRules.filter(r => r.ruleSource === "community").length;
  const custom = loadedRules.filter(r => r.ruleSource === "custom").length;
  const enabled = loadedRules.filter(r => r.enabled).length;

  console.log(`Loaded ${loadedRules.length} Sigma rules in ${elapsed}ms (${builtin} builtin, ${community} community, ${custom} custom, ${enabled} enabled)`);
  return loadedRules;
}

export function getSigmaRules(options?: { source?: string; category?: string; enabled?: boolean; page?: number; limit?: number }): { rules: SigmaRule[]; total: number; sources: Record<string, number>; categories: Record<string, number> } {
  if (loadedRules.length === 0) loadSigmaRules();

  let filtered = loadedRules.map(r => ({
    ...r,
    matchCount: ruleMatchStats.get(r.id) || 0,
    lastMatchAt: ruleLastMatch.get(r.id) || null,
  }));

  const sources: Record<string, number> = { builtin: 0, community: 0, custom: 0 };
  const categories: Record<string, number> = {};
  for (const r of filtered) {
    sources[r.ruleSource] = (sources[r.ruleSource] || 0) + 1;
    categories[r.logsource.category] = (categories[r.logsource.category] || 0) + 1;
  }

  if (options?.source) filtered = filtered.filter(r => r.ruleSource === options.source);
  if (options?.category) filtered = filtered.filter(r => r.logsource.category === options.category);
  if (options?.enabled !== undefined) filtered = filtered.filter(r => r.enabled === options.enabled);
  if (options?.level) filtered = filtered.filter(r => r.level === options.level);
  if (options?.tactic) filtered = filtered.filter(r => (r.mitre?.tactic || "").toLowerCase().replace(/\s+/g, "_") === options.tactic);

  const total = filtered.length;
  const page = options?.page || 1;
  const limit = options?.limit || 100;
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  return { rules: paginated, total, sources, categories };
}

export function getSigmaRule(ruleId: string): SigmaRule | undefined {
  if (loadedRules.length === 0) loadSigmaRules();
  const r = loadedRules.find(r => r.id === ruleId);
  if (r) {
    r.matchCount = ruleMatchStats.get(r.id) || 0;
    r.lastMatchAt = ruleLastMatch.get(r.id) || null;
  }
  return r;
}

export function toggleSigmaRule(ruleId: string, enabled: boolean): SigmaRule | undefined {
  const rule = loadedRules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = enabled;
    buildCategoryIndex();
    syncRuleToDb(rule).catch(() => {});
  }
  return rule;
}

export function bulkToggleRules(ruleIds: string[], enabled: boolean): number {
  let count = 0;
  for (const id of ruleIds) {
    const rule = loadedRules.find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      count++;
    }
  }
  if (count > 0) buildCategoryIndex();
  scheduleBulkDbSync();
  return count;
}

export function bulkToggleBySource(source: string, enabled: boolean): number {
  let count = 0;
  for (const rule of loadedRules) {
    if (rule.ruleSource === source) {
      rule.enabled = enabled;
      count++;
    }
  }
  if (count > 0) buildCategoryIndex();
  scheduleBulkDbSync();
  return count;
}

export function bulkToggleByCategory(category: string, enabled: boolean): number {
  let count = 0;
  for (const rule of loadedRules) {
    if (rule.logsource.category === category) {
      rule.enabled = enabled;
      count++;
    }
  }
  if (count > 0) buildCategoryIndex();
  scheduleBulkDbSync();
  return count;
}

export async function syncRuleToDb(rule: SigmaRule): Promise<void> {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO sigma_rules (rule_id, title, description, status, level, category, logsource, detection, mitre_tags, rule_yaml, match_count, last_matched_at, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (rule_id) DO UPDATE SET
         is_enabled = $13, match_count = $11, last_matched_at = $12, updated_at = NOW()`,
      [rule.id, rule.title, rule.description, rule.status, rule.level,
       rule.logsource.category, JSON.stringify(rule.logsource), JSON.stringify(rule.detection),
       JSON.stringify(rule.mitre), "",
       rule.matchCount, rule.lastMatchAt ? new Date(rule.lastMatchAt) : null, rule.enabled]
    ).catch(() => {});
  } catch {}
}

export async function syncAllRulesToDb(): Promise<void> {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sigma_rules_rule_id ON sigma_rules (rule_id)`
    ).catch(() => {});

    const dbResult = await pool.query(`SELECT rule_id, is_enabled, match_count, last_matched_at FROM sigma_rules`);
    const dbState = new Map<string, { enabled: boolean; matchCount: number; lastMatchAt: string | null }>();
    for (const row of dbResult.rows) {
      dbState.set(row.rule_id, {
        enabled: row.is_enabled,
        matchCount: row.match_count || 0,
        lastMatchAt: row.last_matched_at ? new Date(row.last_matched_at).toISOString() : null,
      });
    }

    const newRules: SigmaRule[] = [];
    for (const rule of loadedRules) {
      const saved = dbState.get(rule.id);
      if (saved) {
        rule.enabled = saved.enabled;
        rule.matchCount = saved.matchCount;
        rule.lastMatchAt = saved.lastMatchAt;
        ruleMatchStats.set(rule.id, saved.matchCount);
        if (saved.lastMatchAt) ruleLastMatch.set(rule.id, saved.lastMatchAt);
      } else {
        newRules.push(rule);
      }
    }

    if (newRules.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < newRules.length; i += BATCH_SIZE) {
        const batch = newRules.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const rule of batch) {
          placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`);
          values.push(
            rule.id, rule.title, rule.description || "", rule.status, rule.level,
            rule.logsource.category, JSON.stringify(rule.logsource), JSON.stringify(rule.detection),
            JSON.stringify(rule.mitre), "",
            0, null, rule.enabled
          );
          paramIdx += 13;
        }

        await pool.query(
          `INSERT INTO sigma_rules (rule_id, title, description, status, level, category, logsource, detection, mitre_tags, rule_yaml, match_count, last_matched_at, is_enabled)
           VALUES ${placeholders.join(", ")}
           ON CONFLICT (rule_id) DO NOTHING`,
          values
        ).catch(() => {});
      }
      console.log(`[Sigma] Bulk synced ${newRules.length} new rules to DB`);
    }

    buildCategoryIndex();
  } catch (e: any) {
    console.error("[Sigma] DB sync error:", e.message);
  }
}

let dbSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDbSync(): void {
  if (dbSyncTimer) return;
  dbSyncTimer = setTimeout(async () => {
    dbSyncTimer = null;
    const dirtyRules = loadedRules.filter(r => (ruleMatchStats.get(r.id) || 0) > r.matchCount);
    for (const rule of dirtyRules) {
      rule.matchCount = ruleMatchStats.get(rule.id) || 0;
      rule.lastMatchAt = ruleLastMatch.get(rule.id) || null;
      await syncRuleToDb(rule);
    }
  }, 30000);
}

let bulkSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBulkDbSync(): void {
  if (bulkSyncTimer) return;
  bulkSyncTimer = setTimeout(async () => {
    bulkSyncTimer = null;
    try {
      const { pool } = await import("./db");
      const BATCH_SIZE = 200;
      for (let i = 0; i < loadedRules.length; i += BATCH_SIZE) {
        const batch = loadedRules.slice(i, i + BATCH_SIZE);
        for (const rule of batch) {
          await pool.query(
            `UPDATE sigma_rules SET is_enabled = $2, match_count = $3, last_matched_at = $4, updated_at = NOW() WHERE rule_id = $1`,
            [rule.id, rule.enabled, ruleMatchStats.get(rule.id) || 0, rule.lastMatchAt ? new Date(rule.lastMatchAt) : null]
          ).catch(() => {});
        }
      }
    } catch {}
  }, 5000);
}

const ENDPOINT_ONLY_PRODUCTS = new Set([
  "windows", "linux", "macos", "unix", "sysmon", "auditd",
  "powershell", "wmi", "cmdline", "process", "endpoint",
  "crowdstrike", "carbon_black", "sentinel_one", "cylance",
  "cynet", "defender", "tanium",
]);

const EMAIL_INCOMPATIBLE_CATEGORIES = new Set([
  "process_creation", "file_event", "image_load", "registry_event",
  "file_access", "file_change", "file_delete", "file_rename",
  "driver_load", "pipe_created", "ps_module", "ps_script",
  "ps_classic_start", "sysmon",
]);

function getRulesForEventType(eventType: string): SigmaRule[] {
  const categories = EVENT_TYPE_TO_CATEGORIES[eventType] || [];
  const isEmailEvent = eventType === "email";

  const filteredAnyRules = isEmailEvent
    ? anyRules.filter(r => {
        const prod = (r.logsource.product || "").toLowerCase();
        const cat = (r.logsource.category || "").toLowerCase();
        if (EMAIL_INCOMPATIBLE_CATEGORIES.has(cat)) return false;
        for (const epProd of ENDPOINT_ONLY_PRODUCTS) {
          if (prod.includes(epProd)) return false;
        }
        return true;
      })
    : anyRules;

  const rules: SigmaRule[] = [...filteredAnyRules];
  const seen = new Set<string>(filteredAnyRules.map(r => r.id));

  for (const cat of categories) {
    const catRules = categoryIndex.get(cat) || [];
    for (const r of catRules) {
      if (!seen.has(r.id)) {
        rules.push(r);
        seen.add(r.id);
      }
    }
  }

  return rules;
}

function matchesSelection(event: Record<string, any>, selection: Record<string, any>): boolean {
  if (!selection || Object.keys(selection).length === 0) return true;

  for (const [field, expected] of Object.entries(selection)) {
    const eventValue = event[field] || "";
    if (Array.isArray(expected)) {
      if (!expected.some(v => String(eventValue).toLowerCase().includes(String(v).toLowerCase()))) {
        return false;
      }
    } else if (typeof expected === "string") {
      if (expected.includes("*")) {
        const pattern = expected.toLowerCase().replace(/\*/g, ".*");
        try {
          if (!new RegExp(`^${pattern}$`, "i").test(String(eventValue))) return false;
        } catch {
          if (!String(eventValue).toLowerCase().includes(expected.replace(/\*/g, "").toLowerCase())) return false;
        }
      } else {
        if (String(eventValue).toLowerCase() !== String(expected).toLowerCase()) return false;
      }
    } else {
      if (String(eventValue).toLowerCase() !== String(expected).toLowerCase()) return false;
    }
  }
  return true;
}

function matchesKeywords(searchText: string, precompiledKeywords: string[]): string[] {
  if (precompiledKeywords.length === 0) return [];

  const matched: string[] = [];
  for (const keyword of precompiledKeywords) {
    if (keyword.includes("*")) {
      const pattern = keyword.replace(/\*/g, ".*");
      try {
        if (new RegExp(pattern, "i").test(searchText)) matched.push(keyword);
      } catch {
        if (searchText.includes(keyword.replace(/\*/g, ""))) matched.push(keyword);
      }
    } else {
      if (searchText.includes(keyword)) matched.push(keyword);
    }
  }

  return matched;
}

let searchTextCache: WeakMap<Record<string, any>, string> = new WeakMap();

function buildSearchText(event: Record<string, any>): string {
  const cached = searchTextCache.get(event);
  if (cached) return cached;

  const fields = [
    event.threat, event.description, event.title, event.action,
    event.asset, event.target, event.attacker, event.sender,
    event.recipient, event.app, event.sourceType, event.logSource,
    event.mitreTactic, event.mitreTechnique,
    // Process/script content fields used by malware analysis synthetic events
    event.commandLine, event.scriptBlockText, event.rawContent,
    // Additional IOC/network fields for broader keyword coverage
    event.queryName, event.destinationHostname, event.url, event.uri,
    event.targetObject, event.details, event.image, event.targetFilename,
  ];

  const rawPayload = event.rawPayload || event.raw_payload;
  if (rawPayload && typeof rawPayload === "object") {
    const payloadVals = Object.values(rawPayload);
    for (const v of payloadVals) {
      if (typeof v === "string" && v.length < 500) fields.push(v);
    }
  }

  const text = fields.filter(Boolean).join(" ").toLowerCase();
  searchTextCache.set(event, text);
  return text;
}

function calculateMatchConfidence(rule: SigmaRule, matchedKeywords: string[]): number {
  let confidence = 30;

  const levelBonus: Record<string, number> = {
    critical: 25,
    high: 20,
    medium: 15,
    low: 10,
    informational: 5,
  };
  confidence += levelBonus[rule.level] || 10;

  const totalKeywords = rule.precompiledKeywords?.length || rule.detection.keywords.length;
  const keywordRatio = totalKeywords > 0
    ? matchedKeywords.length / totalKeywords
    : 0;
  confidence += Math.round(keywordRatio * 30);

  if (rule.mitre.tactic) confidence += 5;
  if (rule.mitre.technique) confidence += 5;
  if (rule.status === "stable") confidence += 5;

  return Math.min(100, Math.max(0, confidence));
}

/**
 * Returns every enabled rule regardless of event type/category.
 * Used by matchMalwareContent() to ensure comprehensive coverage when
 * scanning content that could trigger rules across any log source.
 */
function getAllActiveRules(): SigmaRule[] {
  const all: SigmaRule[] = [...anyRules];
  const seen = new Set<string>(anyRules.map(r => r.id));
  for (const rules of categoryIndex.values()) {
    for (const r of rules) {
      if (!seen.has(r.id)) {
        all.push(r);
        seen.add(r.id);
      }
    }
  }
  return all;
}

/**
 * Core matching loop — shared by matchEvent() and matchMalwareContent().
 * Evaluates candidateRules against the synthetic event, updating match stats,
 * and returns up to maxMatches results sorted by order of candidate rules
 * (highest-priority rules first per getRulesForEventType ordering).
 */
function runSigmaMatchLoop(
  event: Record<string, any>,
  candidateRules: SigmaRule[],
  maxMatches: number,
): SigmaMatch[] {
  const matches: SigmaMatch[] = [];
  const searchText = buildSearchText(event);

  for (const rule of candidateRules) {
    if (matches.length >= maxMatches) break;

    const selectionMatch = matchesSelection(event, rule.detection.selection);

    const keywords = rule.precompiledKeywords || rule.detection.keywords.map(k => k.toLowerCase());
    const matchedKeywords = matchesKeywords(searchText, keywords);

    const condition = rule.detection.condition.toLowerCase();
    let conditionMet = false;

    const hasSelection = Object.keys(rule.detection.selection).length > 0;
    const hasKeywords = keywords.length > 0;

    if (hasSelection && hasKeywords) {
      if (condition.includes(" or ")) {
        conditionMet = selectionMatch || matchedKeywords.length > 0;
      } else {
        conditionMet = selectionMatch && matchedKeywords.length > 0;
      }
    } else if (hasSelection) {
      conditionMet = selectionMatch;
    } else if (hasKeywords) {
      conditionMet = matchedKeywords.length > 0;
    }

    if (conditionMet) {
      const confidence = calculateMatchConfidence(rule, matchedKeywords);

      ruleMatchStats.set(rule.id, (ruleMatchStats.get(rule.id) || 0) + 1);
      ruleLastMatch.set(rule.id, new Date().toISOString());
      scheduleDbSync();

      matches.push({
        ruleId: rule.id,
        ruleTitle: rule.title,
        severity: rule.level,
        mitreTactic: rule.mitre.tactic,
        mitreTechnique: rule.mitre.technique,
        mitreTechniqueName: rule.mitre.technique_name,
        tags: rule.tags,
        description: rule.description,
        matchedKeywords,
        confidence,
      });
    }
  }

  return matches;
}

export function matchEvent(event: Record<string, any>): SigmaMatch[] {
  if (loadedRules.length === 0) loadSigmaRules();

  const eventType = event.eventType || event.event_type || "";
  const candidateRules = getRulesForEventType(eventType);

  return runSigmaMatchLoop(event, candidateRules, MAX_MATCHES_PER_EVENT);
}

export function matchEvents(events: Record<string, any>[]): Map<number, SigmaMatch[]> {
  const results = new Map<number, SigmaMatch[]>();

  for (let i = 0; i < events.length; i++) {
    const matches = matchEvent(events[i]);
    if (matches.length > 0) {
      results.set(i, matches);
    }
  }

  return results;
}

export function detectCorrelationPatterns(
  events: Record<string, any>[],
  sigmaResults: Map<number, SigmaMatch[]>
): CorrelationPattern[] {
  const patterns: CorrelationPattern[] = [];

  const bruteForceEvents: Record<string, any>[] = [];
  const lateralMovementEvents: Record<string, any>[] = [];
  const multiStageAttackMap = new Map<string, { events: Record<string, any>[]; tactics: Set<string>; matches: SigmaMatch[] }>();

  Array.from(sigmaResults.entries()).forEach(([index, matches]) => {
    const event = events[index];
    if (!event) return;

    for (const match of matches) {
      if (match.ruleId === "sigma-auth-001" || match.ruleId === "sigma-auth-003") {
        bruteForceEvents.push(event);
      }
      if (match.ruleId === "sigma-network-003") {
        lateralMovementEvents.push(event);
      }

      const entityKey = event.asset || event.target || event.attacker || event.sender || "unknown";
      if (!multiStageAttackMap.has(entityKey)) {
        multiStageAttackMap.set(entityKey, { events: [], tactics: new Set(), matches: [] });
      }
      const entry = multiStageAttackMap.get(entityKey)!;
      entry.events.push(event);
      if (match.mitreTactic) entry.tactics.add(match.mitreTactic);
      entry.matches.push(match);
    }
  });

  if (bruteForceEvents.length >= 3) {
    const sourceMap = new Map<string, number>();
    for (const evt of bruteForceEvents) {
      const src = evt.attacker || evt.sourceIp || evt.source_ip || "unknown";
      sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
    }
    Array.from(sourceMap.entries()).forEach(([source, count]) => {
      if (count >= 3) {
        const bfEvents = bruteForceEvents.filter(e => (e.attacker || e.sourceIp || e.source_ip) === source);
        const destIps = [...new Set(bfEvents.map(e => e.target || e.destination_ip || e.destinationIp).filter(Boolean))];
        patterns.push({
          patternName: "Brute Force Campaign",
          description: `${count} failed authentication attempts detected from ${source}`,
          events: bfEvents,
          sigmaMatches: [],
          severity: "high",
          mitreTactic: "Credential Access",
          confidence: Math.min(95, 60 + count * 5),
          entity: source !== "unknown" ? source : undefined,
          sourceIps: source !== "unknown" ? [source] : [],
          destinationIps: destIps,
          tactics: ["Credential Access"],
        });
      }
    });
  }

  if (lateralMovementEvents.length >= 2) {
    const lmSourceIps = [...new Set(lateralMovementEvents.map(e => e.attacker || e.sourceIp || e.source_ip).filter((v: string) => v && v !== "unknown"))];
    const lmDestIps = [...new Set(lateralMovementEvents.map(e => e.target || e.destination_ip || e.destinationIp).filter((v: string) => v && v !== "unknown"))];
    const lmAssets = [...new Set(lateralMovementEvents.map(e => e.asset).filter((v: string) => v && v !== "unknown"))];
    const lmEntity = lmAssets[0] || lmSourceIps[0] || undefined;
    patterns.push({
      patternName: "Lateral Movement Chain",
      description: `${lateralMovementEvents.length} lateral movement indicators detected across multiple assets`,
      events: lateralMovementEvents,
      sigmaMatches: [],
      severity: "critical",
      mitreTactic: "Lateral Movement",
      confidence: Math.min(90, 50 + lateralMovementEvents.length * 10),
      entity: lmEntity,
      sourceIps: lmSourceIps,
      destinationIps: lmDestIps,
      tactics: ["Lateral Movement"],
    });
  }

  Array.from(multiStageAttackMap.entries()).forEach(([entity, data]) => {
    if (data.tactics.size >= 3) {
      const tacticList = Array.from(data.tactics);
      const msSourceIps = [...new Set(data.events.map(e => e.attacker || e.sourceIp || e.source_ip).filter((v: string) => v && v !== "unknown"))];
      const msDestIps = [...new Set(data.events.map(e => e.target || e.destination_ip || e.destinationIp).filter((v: string) => v && v !== "unknown"))];
      patterns.push({
        patternName: "Multi-Stage Attack",
        description: `Entity "${entity}" triggered ${data.tactics.size} different MITRE ATT&CK tactics: ${tacticList.join(", ")}`,
        events: data.events,
        sigmaMatches: data.matches,
        severity: "critical",
        mitreTactic: "Multiple",
        confidence: Math.min(95, 50 + data.tactics.size * 15),
        entity: entity !== "unknown" ? entity : undefined,
        sourceIps: msSourceIps,
        destinationIps: msDestIps,
        tactics: tacticList,
      });
    }
  });

  return patterns;
}

export function getSigmaStats(): SigmaMatchStats {
  if (loadedRules.length === 0) loadSigmaRules();

  const matchesByRule: Record<string, number> = {};
  const matchesBySeverity: Record<string, number> = {};
  const matchesByTactic: Record<string, number> = {};
  const rulesBySource = { builtin: 0, community: 0, custom: 0 };
  const rulesByCategory: Record<string, number> = {};
  let totalMatches = 0;

  for (const rule of loadedRules) {
    const count = ruleMatchStats.get(rule.id) || 0;
    matchesByRule[rule.id] = count;
    totalMatches += count;

    matchesBySeverity[rule.level] = (matchesBySeverity[rule.level] || 0) + count;
    if (rule.mitre.tactic) {
      matchesByTactic[rule.mitre.tactic] = (matchesByTactic[rule.mitre.tactic] || 0) + count;
    }

    rulesBySource[rule.ruleSource]++;
    rulesByCategory[rule.logsource.category] = (rulesByCategory[rule.logsource.category] || 0) + 1;
  }

  const topRules = loadedRules
    .map(r => ({
      ruleId: r.id,
      title: r.title,
      matches: ruleMatchStats.get(r.id) || 0,
    }))
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 10);

  return {
    totalRules: loadedRules.length,
    enabledRules: loadedRules.filter(r => r.enabled).length,
    totalMatches,
    matchesByRule,
    matchesBySeverity,
    matchesByTactic,
    topRules,
    rulesBySource,
    rulesByCategory,
  };
}

export function createSigmaRule(ruleData: {
  title: string;
  level: string;
  description: string;
  logsource: { category: string; product: string };
  detection: { selection: Record<string, any>; keywords: string[]; condition: string };
  mitre: { tactic: string; technique: string; technique_name: string };
  tags?: string[];
  falsepositives?: string[];
  tenantId?: number;
}): SigmaRule {
  const id = `sigma-custom-${crypto.randomUUID().slice(0, 8)}`;

  const yamlContent = yaml.dump({
    title: ruleData.title,
    id,
    status: "experimental",
    level: ruleData.level,
    description: ruleData.description,
    author: "SecureOps Custom",
    date: new Date().toISOString().split("T")[0].replace(/-/g, "/"),
    logsource: ruleData.logsource,
    detection: ruleData.detection,
    falsepositives: ruleData.falsepositives || [],
    tags: ruleData.tags || [],
    mitre: ruleData.mitre,
  });

  let customDir = path.join(SIGMA_RULES_DIR, "custom");
  if (ruleData.tenantId) {
    customDir = path.join(customDir, `tenant-${ruleData.tenantId}`);
  }
  if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

  const fileName = `${id}.yml`;
  const filePath = path.join(customDir, fileName);
  fs.writeFileSync(filePath, yamlContent, "utf-8");

  const rule = parseRule(yamlContent, filePath);
  if (rule) {
    loadedRules.push(rule);
    buildCategoryIndex();
    return rule;
  }

  throw new Error("Failed to parse created rule");
}

export function updateSigmaRule(ruleId: string, updates: Partial<{
  title: string;
  level: string;
  description: string;
  enabled: boolean;
  detection: { selection: Record<string, any>; keywords: string[]; condition: string };
  mitre: { tactic: string; technique: string; technique_name: string };
}>): SigmaRule | null {
  const ruleIndex = loadedRules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) return null;

  const rule = loadedRules[ruleIndex];

  if (updates.title !== undefined) rule.title = updates.title;
  if (updates.level !== undefined) rule.level = updates.level;
  if (updates.description !== undefined) rule.description = updates.description;
  if (updates.enabled !== undefined) {
    rule.enabled = updates.enabled;
    buildCategoryIndex();
  }
  if (updates.detection !== undefined) {
    rule.detection = updates.detection;
    rule.precompiledKeywords = (updates.detection.keywords || []).map(k => k.toLowerCase());
  }
  if (updates.mitre !== undefined) rule.mitre = updates.mitre;

  if (rule.filePath && rule.filePath.includes("/custom/") && fs.existsSync(rule.filePath)) {
    try {
      const yamlContent = yaml.dump({
        title: rule.title,
        id: rule.id,
        status: rule.status,
        level: rule.level,
        description: rule.description,
        author: rule.author,
        date: rule.date,
        logsource: rule.logsource,
        detection: rule.detection,
        falsepositives: rule.falsepositives,
        tags: rule.tags,
        mitre: rule.mitre,
      });
      fs.writeFileSync(rule.filePath, yamlContent, "utf-8");
    } catch {}
  }

  return rule;
}

export function deleteSigmaRule(ruleId: string): boolean {
  const ruleIndex = loadedRules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) return false;

  const rule = loadedRules[ruleIndex];

  if (rule.filePath && rule.filePath.includes("/custom/") && fs.existsSync(rule.filePath)) {
    try {
      fs.unlinkSync(rule.filePath);
    } catch {}
  }

  loadedRules.splice(ruleIndex, 1);
  ruleMatchStats.delete(ruleId);
  ruleLastMatch.delete(ruleId);
  buildCategoryIndex();
  return true;
}

loadSigmaRules();
syncAllRulesToDb().catch(() => {});

// ── Malware-content sigma matching ────────────────────────────────────────────

/**
 * Match raw malware content and extracted IOCs against Sigma rules by delegating
 * through the canonical matchEvent() engine. Returns up to 20 SigmaMatch entries,
 * never throws. Used by the /api/malware/analyze pipeline to surface relevant
 * detection rules in the "Matched Detection Rules" UI panel.
 *
 * A synthetic event is constructed from the script content and extracted IOCs so
 * that both keyword-based and selection-based Sigma rules fire correctly.
 *
 * Uses getAllActiveRules() to scan against the full rule corpus (anyRules +
 * every category-specific rule), giving comprehensive detection coverage for
 * malware content that may match network, endpoint, identity, or other categories.
 * Uses runSigmaMatchLoop() — the same inner engine used by matchEvent() — to
 * ensure rule semantics and match stats are updated consistently.
 * Returns up to 20 matches (vs the per-event cap of 10 used in matchEvent).
 */
export function matchMalwareContent(
  rawContent: string,
  iocs: Array<{ type: string; value: string; context?: string }>
): SigmaMatch[] {
  try {
    if (loadedRules.length === 0) loadSigmaRules();

    // Build a synthetic event populated with IOC-specific fields so that
    // selection-based Sigma rules (e.g., CommandLine, Image, Hashes) can match.
    const iocText = iocs.map(i => i.value).join(" ");

    const syntheticEvent: Record<string, any> = {
      // Raw content fields — matched by keyword/selection-based rules.
      // buildSearchText() now indexes commandLine, scriptBlockText, rawContent
      // directly, so keyword rules fire on script/file content.
      commandLine: rawContent.slice(0, 8192),
      scriptBlockText: rawContent.slice(0, 8192),
      // description includes both raw content and IOC values as a fallback
      // for rules that match on the description field
      description: `${rawContent.slice(0, 4096)} ${iocText}`.trimEnd(),
      // Truncated content for search-text fallback
      rawContent: rawContent.slice(0, 4096),
    };

    // Populate named IOC fields so per-field selection rules fire correctly
    for (const ioc of iocs) {
      const v = String(ioc.value);
      switch (ioc.type) {
        case "ip":
          syntheticEvent.sourceIp = v;
          syntheticEvent.destinationIp = v;
          syntheticEvent.destinationIpAddr = v;
          break;
        case "domain":
          syntheticEvent.domain = v;
          syntheticEvent.destinationHostname = v;
          syntheticEvent.queryName = v;
          break;
        case "hash":
          syntheticEvent.hashes = v;
          syntheticEvent.sha256 = v;
          syntheticEvent.md5 = v;
          break;
        case "url":
          syntheticEvent.url = v;
          syntheticEvent.uri = v;
          break;
        case "filepath":
          syntheticEvent.image = v;
          syntheticEvent.targetFilename = v;
          syntheticEvent.parentImage = v;
          break;
        case "registry":
          syntheticEvent.targetObject = v;
          syntheticEvent.details = v;
          break;
      }
    }

    // Run against ALL active rules (anyRules + every category-specific rule) using
    // the canonical inner loop — same semantics as matchEvent(), but with a larger
    // corpus and a 20-match ceiling appropriate for content-level analysis.
    const candidateRules = getAllActiveRules();
    return runSigmaMatchLoop(syntheticEvent, candidateRules, 20);
  } catch {
    return [];
  }
}
