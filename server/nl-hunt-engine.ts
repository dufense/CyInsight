import { createAIClient, getDefaultModel } from "./ai-provider";

export interface NLHuntResult {
  naturalLanguageSummary: string;
  resolvedFilters: {
    eventType?: string;
    severity?: string;
    mitreTactic?: string;
    timeRange?: string;
    keyword?: string;
    asset?: string;
    attacker?: string;
    country?: string;
    logSource?: string;
  };
  searchDescription: string;
  suggestions: string[];
}

// ── Strict allow-lists — nothing else is ever accepted ──────────────────────
const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const ALLOWED_EVENT_TYPES = new Set([
  "endpoint", "network", "identity", "cloud", "email",
  "vulnerability", "waf", "dlp", "firewall",
]);
const ALLOWED_MITRE_TACTICS = new Set([
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
  "Reconnaissance", "Resource Development",
]);
const ALLOWED_TIME_RANGES = new Set(["24h", "7d", "30d", "90d"]);
const TIME_INTERVAL_MAP: Record<string, string> = {
  "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days",
};

// ── Build safe parameterized query from structured filters ───────────────────
// Returns { clauses: string[], params: any[] } — clauses use $N placeholders
export function buildSafeQuery(
  filters: NLHuntResult["resolvedFilters"],
  baseParamIndex: number
): { clauses: string[]; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  let pIdx = baseParamIndex;

  // severity
  if (filters.severity) {
    const parts = filters.severity.split(",").map(s => s.trim().toLowerCase()).filter(s => ALLOWED_SEVERITIES.has(s));
    if (parts.length === 1) {
      clauses.push(`severity = $${pIdx++}`);
      params.push(parts[0]);
    } else if (parts.length > 1) {
      const holders = parts.map(() => `$${pIdx++}`).join(", ");
      clauses.push(`severity IN (${holders})`);
      params.push(...parts);
    }
  }

  // eventType
  if (filters.eventType) {
    const et = filters.eventType.toLowerCase().trim();
    if (ALLOWED_EVENT_TYPES.has(et)) {
      clauses.push(`event_type = $${pIdx++}`);
      params.push(et);
    }
  }

  // mitreTactic
  if (filters.mitreTactic) {
    const tac = [...ALLOWED_MITRE_TACTICS].find(
      t => t.toLowerCase() === filters.mitreTactic!.toLowerCase()
    );
    if (tac) {
      clauses.push(`mitre_tactic ILIKE $${pIdx++}`);
      params.push(`%${tac}%`);
    }
  }

  // timeRange — never user-supplied in params, just a literal INTERVAL from allow-list
  if (filters.timeRange && ALLOWED_TIME_RANGES.has(filters.timeRange)) {
    const interval = TIME_INTERVAL_MAP[filters.timeRange];
    clauses.push(`occurred_at >= NOW() - INTERVAL '${interval}'`);
  }

  // keyword — parameterized ILIKE
  if (filters.keyword) {
    const kw = String(filters.keyword).slice(0, 100);
    const kIdx1 = pIdx++; const kIdx2 = pIdx++; const kIdx3 = pIdx++;
    clauses.push(`(description ILIKE $${kIdx1} OR threat ILIKE $${kIdx2} OR target ILIKE $${kIdx3})`);
    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
  }

  // asset
  if (filters.asset) {
    const aIdx1 = pIdx++; const aIdx2 = pIdx++;
    clauses.push(`(asset ILIKE $${aIdx1} OR target ILIKE $${aIdx2})`);
    const a = String(filters.asset).slice(0, 100);
    params.push(`%${a}%`, `%${a}%`);
  }

  // attacker
  if (filters.attacker) {
    clauses.push(`attacker ILIKE $${pIdx++}`);
    params.push(`%${String(filters.attacker).slice(0, 100)}%`);
  }

  // country
  if (filters.country) {
    clauses.push(`country ILIKE $${pIdx++}`);
    params.push(`%${String(filters.country).slice(0, 100)}%`);
  }

  // logSource
  if (filters.logSource) {
    clauses.push(`log_source ILIKE $${pIdx++}`);
    params.push(`%${String(filters.logSource).slice(0, 100)}%`);
  }

  return { clauses, params };
}

// ── AI-powered NL to structured filter translation ───────────────────────────
export async function translateNLToHunt(
  nlQuery: string,
  tenantId: number,
  allTenantIds: number[]
): Promise<NLHuntResult> {
  const client = createAIClient();
  const model = getDefaultModel();

  const systemPrompt = `You are a threat hunting query translator for a SIEM platform.
Convert the user's natural language security question into ONLY structured filter values.
Do NOT produce any SQL. Return ONLY JSON with this exact shape:

{
  "searchDescription": "brief description of what is being searched",
  "resolvedFilters": {
    "eventType": one of [endpoint|network|identity|cloud|email|vulnerability|waf|dlp|firewall] or null,
    "severity": one or more of [critical|high|medium|low|info] comma-separated, or null,
    "mitreTactic": exact tactic name from MITRE ATT&CK or null,
    "timeRange": one of [24h|7d|30d|90d] or null,
    "keyword": keyword to search in description/threat/target or null,
    "asset": asset or hostname to match or null,
    "attacker": attacker IP or name or null,
    "country": country name or null,
    "logSource": log source name or null
  },
  "naturalLanguageSummary": "Searching for X matching Y in the last Z",
  "suggestions": ["alternative query 1", "alternative query 2", "alternative query 3"]
}

Important: Only use these exact severity values: critical, high, medium, low, info.
MITRE tactics: Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion,
Credential Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, Impact.`;

  const userPrompt = `Translate this threat hunting query into structured filters: "${nlQuery}"`;

  let aiResponse: any = null;
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    aiResponse = JSON.parse(content);
  } catch (err: any) {
    console.error("[NL Hunt] AI translation failed:", err.message);
    return buildFallbackResult(nlQuery);
  }

  const resolvedFilters = aiResponse.resolvedFilters || {};

  return {
    naturalLanguageSummary: aiResponse.naturalLanguageSummary || `Searching for events matching: ${nlQuery}`,
    resolvedFilters: {
      eventType: resolvedFilters.eventType || undefined,
      severity: resolvedFilters.severity || undefined,
      mitreTactic: resolvedFilters.mitreTactic || undefined,
      timeRange: resolvedFilters.timeRange || "7d",
      keyword: resolvedFilters.keyword || undefined,
      asset: resolvedFilters.asset || undefined,
      attacker: resolvedFilters.attacker || undefined,
      country: resolvedFilters.country || undefined,
      logSource: resolvedFilters.logSource || undefined,
    },
    searchDescription: aiResponse.searchDescription || nlQuery,
    suggestions: Array.isArray(aiResponse.suggestions) ? aiResponse.suggestions.slice(0, 3) : [],
  };
}

// ── Fallback when AI is unavailable ─────────────────────────────────────────
function buildFallbackResult(nlQuery: string): NLHuntResult {
  const lower = nlQuery.toLowerCase();
  const filters: NLHuntResult["resolvedFilters"] = { timeRange: "7d" };

  if (lower.includes("critical")) filters.severity = "critical";
  else if (lower.includes("high")) filters.severity = "high";
  if (lower.includes("lateral movement")) filters.mitreTactic = "Lateral Movement";
  if (lower.includes("privilege escalation")) filters.mitreTactic = "Privilege Escalation";
  if (lower.includes("24 hour") || lower.includes("last day")) filters.timeRange = "24h";
  else if (lower.includes("this week") || lower.includes("last week")) filters.timeRange = "7d";
  if (lower.includes("powershell")) filters.keyword = "powershell";
  if (lower.includes("endpoint")) filters.eventType = "endpoint";
  if (lower.includes("network")) filters.eventType = "network";
  if (lower.includes("identity")) filters.eventType = "identity";

  return {
    naturalLanguageSummary: `Searching for events matching: ${nlQuery}`,
    resolvedFilters: filters,
    searchDescription: nlQuery,
    suggestions: [
      "Show all critical events in the last 24 hours",
      "Find lateral movement activity this week",
      "Which endpoints had PowerShell execution after hours?",
    ],
  };
}

// ── Per-event AI explanation ─────────────────────────────────────────────────
export async function generateEventExplanation(
  event: any,
  nlQuery: string
): Promise<string> {
  try {
    const client = createAIClient();
    const model = getDefaultModel();
    const prompt = `Given the threat hunting query "${nlQuery}", explain in ONE sentence (max 20 words) why this security event is relevant:
Event: type=${event.event_type}, severity=${event.severity}, threat=${event.threat || "N/A"}, mitre=${event.mitre_tactic || "N/A"}, description=${(event.description || "").slice(0, 100)}
Reply with just the explanation sentence, no prefix.`;

    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 60,
    });
    return completion.choices[0]?.message?.content?.trim() || "Matched hunt criteria.";
  } catch {
    return "Matched hunt criteria based on event characteristics.";
  }
}

// ── Typeahead / autocomplete suggestions ────────────────────────────────────
const BASE_TEMPLATES = [
  "Show all critical events in the last 24 hours",
  "Find lateral movement activity this week",
  "Which endpoints had PowerShell execution after hours?",
  "Show me identity threats from China in the last 7 days",
  "Find failed login attempts in the last 24 hours",
  "Credential access events from external IPs",
  "Show ransomware related activity",
  "Network anomalies with high risk score",
  "Privilege escalation events this week",
  "Cloud exfiltration attempts in the last 30 days",
  "Endpoint malware detections last 7 days",
  "Email phishing events this week",
  "Command and control connections in the last 24 hours",
  "Critical vulnerability alerts from last month",
  "Firewall blocks from critical sources this week",
];

// Build dimension-aware suggestions from tenant event data
export function buildContextSuggestions(
  eventTypes: string[],
  tactics: string[],
  logSources: string[]
): string[] {
  const extra: string[] = [];
  for (const et of eventTypes.slice(0, 3)) {
    extra.push(`Show ${et} events from the last 24 hours with high severity`);
    extra.push(`Find critical ${et} events this week`);
  }
  for (const tac of tactics.slice(0, 3)) {
    extra.push(`Show ${tac} activity this week`);
    extra.push(`Find ${tac} attempts in the last 24 hours`);
  }
  for (const src of logSources.slice(0, 2)) {
    extra.push(`Show critical events from ${src} log source`);
  }
  return extra;
}

export function getTypeaheadSuggestions(
  partial: string,
  contextTemplates?: string[]
): string[] {
  const allTemplates = [...BASE_TEMPLATES, ...(contextTemplates || [])];
  if (!partial || partial.trim().length < 2) return allTemplates.slice(0, 5);
  const lower = partial.toLowerCase();
  return allTemplates.filter(t => t.toLowerCase().includes(lower)).slice(0, 6);
}
