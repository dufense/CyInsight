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

export interface SigmaMatchResult {
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

export interface MatcherStats {
  totalRules: number;
  enabledRules: number;
  totalMatches: number;
  avgMatchTimeMs: number;
  rulesBySource: { builtin: number; community: number; custom: number };
  rulesByCategory: Record<string, number>;
}

const MAX_MATCHES_PER_EVENT = 10;

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

export class SigmaMatcher {
  private rules: SigmaRule[] = [];
  private categoryIndex: Map<string, SigmaRule[]> = new Map();
  private anyRules: SigmaRule[] = [];
  private ruleMatchCounts: Map<string, number> = new Map();
  private totalMatches = 0;
  private totalMatchTimeMs = 0;
  private matchCount = 0;
  private sigmaRulesDir: string;
  private tenantOverrides: Map<number, Set<string>> = new Map();

  constructor(sigmaRulesDir?: string) {
    this.sigmaRulesDir = sigmaRulesDir || path.join(process.cwd(), "sigma-rules");
  }

  loadRules(): number {
    const startTime = Date.now();
    const rawRules = this.loadRulesFromDirectory(this.sigmaRulesDir);

    const deduped = new Map<string, SigmaRule>();
    for (const rule of rawRules) {
      if (!deduped.has(rule.id)) {
        deduped.set(rule.id, rule);
      }
    }
    this.rules = Array.from(deduped.values());

    this.buildCategoryIndex();

    const elapsed = Date.now() - startTime;
    const builtin = this.rules.filter(r => r.ruleSource === "builtin").length;
    const community = this.rules.filter(r => r.ruleSource === "community").length;
    const custom = this.rules.filter(r => r.ruleSource === "custom").length;
    const enabled = this.rules.filter(r => r.enabled).length;

    console.log(`[SigmaMatcher] Loaded ${this.rules.length} rules in ${elapsed}ms (${builtin} builtin, ${community} community, ${custom} custom, ${enabled} enabled)`);
    return this.rules.length;
  }

  reloadRules(): number {
    this.rules = [];
    this.categoryIndex.clear();
    this.anyRules = [];
    return this.loadRules();
  }

  setTenantOverrides(tenantId: number, disabledRuleIds: string[]): void {
    this.tenantOverrides.set(tenantId, new Set(disabledRuleIds));
  }

  removeTenantOverrides(tenantId: number): void {
    this.tenantOverrides.delete(tenantId);
  }

  matchEvent(event: Record<string, any>, tenantId?: number): SigmaMatchResult[] {
    const start = performance.now();
    const matches: SigmaMatchResult[] = [];
    const eventType = event.eventType || event.event_type || "";
    const tenantDisabled = tenantId ? this.tenantOverrides.get(tenantId) : undefined;

    const candidateRules = this.getRulesForEventType(eventType);
    const searchText = this.buildSearchText(event);

    for (const rule of candidateRules) {
      if (matches.length >= MAX_MATCHES_PER_EVENT) break;
      if (tenantDisabled && tenantDisabled.has(rule.id)) continue;

      const selectionMatch = this.matchesSelection(event, rule.detection.selection);
      const keywords = rule.precompiledKeywords || rule.detection.keywords.map(k => k.toLowerCase());
      const matchedKeywords = this.matchesKeywords(searchText, keywords);

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
        const confidence = this.calculateMatchConfidence(rule, matchedKeywords);
        this.ruleMatchCounts.set(rule.id, (this.ruleMatchCounts.get(rule.id) || 0) + 1);
        this.totalMatches++;

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

    const elapsed = performance.now() - start;
    this.totalMatchTimeMs += elapsed;
    this.matchCount++;

    return matches;
  }

  matchBatch(events: Record<string, any>[], tenantId?: number): Map<number, SigmaMatchResult[]> {
    const results = new Map<number, SigmaMatchResult[]>();
    for (let i = 0; i < events.length; i++) {
      const matches = this.matchEvent(events[i], tenantId);
      if (matches.length > 0) {
        results.set(i, matches);
      }
    }
    return results;
  }

  getStats(): MatcherStats {
    const rulesBySource = { builtin: 0, community: 0, custom: 0 };
    const rulesByCategory: Record<string, number> = {};

    for (const rule of this.rules) {
      rulesBySource[rule.ruleSource]++;
      rulesByCategory[rule.logsource.category] = (rulesByCategory[rule.logsource.category] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      enabledRules: this.rules.filter(r => r.enabled).length,
      totalMatches: this.totalMatches,
      avgMatchTimeMs: this.matchCount > 0 ? this.totalMatchTimeMs / this.matchCount : 0,
      rulesBySource,
      rulesByCategory,
    };
  }

  getRuleCount(): number {
    return this.rules.length;
  }

  private buildCategoryIndex(): void {
    this.categoryIndex.clear();
    this.anyRules = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const cat = rule.logsource.category;
      if (cat === "any") {
        this.anyRules.push(rule);
        continue;
      }
      if (!this.categoryIndex.has(cat)) this.categoryIndex.set(cat, []);
      this.categoryIndex.get(cat)!.push(rule);
    }
  }

  private getRulesForEventType(eventType: string): SigmaRule[] {
    const categories = EVENT_TYPE_TO_CATEGORIES[eventType] || [];
    const rules: SigmaRule[] = [...this.anyRules];
    const seen = new Set<string>(this.anyRules.map(r => r.id));

    for (const cat of categories) {
      const catRules = this.categoryIndex.get(cat) || [];
      for (const r of catRules) {
        if (!seen.has(r.id)) {
          rules.push(r);
          seen.add(r.id);
        }
      }
    }

    return rules;
  }

  private matchesSelection(event: Record<string, any>, selection: Record<string, any>): boolean {
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

  private matchesKeywords(searchText: string, precompiledKeywords: string[]): string[] {
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

  private buildSearchText(event: Record<string, any>): string {
    const fields = [
      event.threat, event.description, event.title, event.action,
      event.asset, event.target, event.attacker, event.sender,
      event.recipient, event.app, event.sourceType, event.logSource,
      event.mitreTactic, event.mitreTechnique,
    ];

    const rawPayload = event.rawPayload || event.raw_payload;
    if (rawPayload && typeof rawPayload === "object") {
      const payloadVals = Object.values(rawPayload);
      for (const v of payloadVals) {
        if (typeof v === "string" && v.length < 500) fields.push(v);
      }
    }

    return fields.filter(Boolean).join(" ").toLowerCase();
  }

  private calculateMatchConfidence(rule: SigmaRule, matchedKeywords: string[]): number {
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
    const keywordRatio = totalKeywords > 0 ? matchedKeywords.length / totalKeywords : 0;
    confidence += Math.round(keywordRatio * 30);

    if (rule.mitre.tactic) confidence += 5;
    if (rule.mitre.technique) confidence += 5;
    if (rule.status === "stable") confidence += 5;

    return Math.min(100, Math.max(0, confidence));
  }

  private loadRulesFromDirectory(dir: string): SigmaRule[] {
    const rules: SigmaRule[] = [];
    if (!fs.existsSync(dir)) return rules;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        rules.push(...this.loadRulesFromDirectory(fullPath));
      } else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const rule = this.parseRule(content, fullPath);
          if (rule) rules.push(rule);
        } catch {}
      }
    }
    return rules;
  }

  private parseRule(content: string, filePath: string): SigmaRule | null {
    try {
      const parsed = yaml.load(content) as any;
      if (!parsed || !parsed.title || !parsed.detection) return null;

      const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      const mitreFromTags = this.extractMitreFromTags(tags);
      const mitre = parsed.mitre || mitreFromTags;

      const keywords = this.extractKeywordsFromDetection(parsed.detection);
      const selection = this.extractSelectionFromDetection(parsed.detection);

      const ruleSource = this.determineRuleSource(filePath);

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
        matchCount: 0,
        lastMatchAt: null,
        ruleSource,
        precompiledKeywords: keywords.map(k => k.toLowerCase()),
      };
    } catch {
      return null;
    }
  }

  private extractMitreFromTags(tags: string[]): { tactic: string; technique: string; technique_name: string } {
    let tactic = "";
    let technique = "";
    const technique_name = "";

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

  private extractKeywordsFromDetection(detection: Record<string, any>): string[] {
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

  private extractSelectionFromDetection(detection: Record<string, any>): Record<string, any> {
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

  private determineRuleSource(filePath: string): "builtin" | "community" | "custom" {
    if (filePath.includes("/community/")) return "community";
    if (filePath.includes("/custom/")) return "custom";
    return "builtin";
  }
}
