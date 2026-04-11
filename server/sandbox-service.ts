import { pool } from "./db";

export interface SandboxEnrichment {
  source: string;
  status: "hit" | "miss" | "no_key" | "disabled" | "unavailable";
  verdict?: "malicious" | "suspicious" | "clean" | "unknown" | null;
  score?: number | null;
  malwareFamily?: string | null;
  behaviors?: string[];
  mitreTechniques?: string[];
  networkIocs?: string[];
  reportUrl?: string | null;
  analyzedAt?: string | null;
  capabilities?: string[];
  error?: string | null;
}

interface IntegrationRow {
  name: string;
  enabled: boolean;
  api_key: string | null;
  requires_key: boolean;
}

const sandboxCache = new Map<string, { result: SandboxEnrichment; expiresAt: number }>();
const CACHE_TTL_MS = 20 * 60 * 1000;

function getCached(platform: string, hash: string): SandboxEnrichment | null {
  const key = `${platform}:${hash}`;
  const entry = sandboxCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.result;
  if (entry) sandboxCache.delete(key);
  return null;
}

function setCache(platform: string, hash: string, result: SandboxEnrichment): void {
  sandboxCache.set(`${platform}:${hash}`, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function loadSandboxIntegrations(): Promise<Record<string, IntegrationRow>> {
  const res = await pool.query<IntegrationRow>(
    "SELECT name, enabled, api_key, requires_key FROM platform_integrations WHERE category IN ('malware_sandbox', 'threat_intel')"
  );
  const map: Record<string, IntegrationRow> = {};
  for (const row of res.rows) map[row.name] = row;
  return map;
}

const TIMEOUT_MS = 8000;

function makeAbort(): { signal: AbortSignal; clear: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  return { signal: c.signal, clear: () => clearTimeout(t) };
}

async function queryAnyRun(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("anyrun", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch(
      `https://api.any.run/v1/analysis?query=${encodeURIComponent(hash)}&limit=1`,
      { headers: { Authorization: `API-Key ${apiKey}` }, signal }
    );
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "Any.Run", status: "no_key", error: "Invalid API key", capabilities: ["Interactive Sandbox", "Behavioral Analysis"] };
      setCache("anyrun", hash, res); return res;
    }
    if (!r.ok) {
      const res: SandboxEnrichment = { source: "Any.Run", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["Interactive Sandbox", "Behavioral Analysis"] };
      return res;
    }
    const d = await r.json() as Record<string, unknown>;
    const tasks = (d["data"] as Record<string, unknown>)?.["tasks"] as unknown[];
    if (!tasks || tasks.length === 0) {
      const res: SandboxEnrichment = { source: "Any.Run", status: "miss", capabilities: ["Interactive Sandbox", "Behavioral Analysis"] };
      setCache("anyrun", hash, res); return res;
    }
    const task = tasks[0] as Record<string, unknown>;
    const analysis = task["analysis"] as Record<string, unknown>;
    const verdictStr = (analysis?.["verdict"] as string | undefined)?.toLowerCase() ?? "unknown";
    const verdict: SandboxEnrichment["verdict"] =
      verdictStr === "malicious" ? "malicious"
      : verdictStr === "suspicious" ? "suspicious"
      : verdictStr === "no threats detected" ? "clean"
      : "unknown";
    const res: SandboxEnrichment = {
      source: "Any.Run",
      status: "hit",
      verdict,
      reportUrl: `https://app.any.run/tasks/${task["taskid"] ?? ""}`,
      analyzedAt: analysis?.["date"] as string | null ?? null,
      capabilities: ["Interactive Sandbox", "Behavioral Analysis", "Network Analysis"],
    };
    setCache("anyrun", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "Any.Run", status: "unavailable", error: msg, capabilities: ["Interactive Sandbox", "Behavioral Analysis"] };
  }
}

async function queryHybridAnalysis(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("hybrid_analysis", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch("https://www.hybrid-analysis.com/api/v2/search/hash", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Falcon Sandbox" },
      body: new URLSearchParams({ hash }).toString(),
      signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "Hybrid Analysis", status: "no_key", error: "Invalid API key", capabilities: ["AI Analysis", "MITRE ATT&CK Mapping"] };
      setCache("hybrid_analysis", hash, res); return res;
    }
    if (!r.ok) return { source: "Hybrid Analysis", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["AI Analysis", "MITRE ATT&CK Mapping"] };
    const items = await r.json() as unknown[];
    if (!Array.isArray(items) || items.length === 0) {
      const res: SandboxEnrichment = { source: "Hybrid Analysis", status: "miss", capabilities: ["AI Analysis", "MITRE ATT&CK Mapping"] };
      setCache("hybrid_analysis", hash, res); return res;
    }
    const item = items[0] as Record<string, unknown>;
    const rawVerdict = (item["verdict"] as string | null)?.toLowerCase() ?? "no verdict";
    const verdict: SandboxEnrichment["verdict"] =
      rawVerdict === "malicious" ? "malicious"
      : rawVerdict === "suspicious" ? "suspicious"
      : rawVerdict === "no verdict" || rawVerdict === "whitelisted" ? "clean"
      : "unknown";
    const threatScore = typeof item["threat_score"] === "number" ? item["threat_score"] as number : null;
    const behaviors = (item["classification_tags"] as string[] | null) ?? [];
    const mitre = (item["mitre_attcks"] as Record<string, unknown>[] | null)
      ?.map(t => `${t["technique_id"] ?? ""} ${t["technique"] ?? ""}`.trim())
      .filter(Boolean) ?? [];
    const res: SandboxEnrichment = {
      source: "Hybrid Analysis",
      status: "hit",
      verdict,
      score: threatScore,
      malwareFamily: item["vx_family"] as string | null ?? null,
      behaviors,
      mitreTechniques: mitre,
      analyzedAt: item["analysis_start_time"] as string | null ?? null,
      capabilities: ["AI Analysis", "MITRE ATT&CK Mapping", "Behavioral Analysis"],
    };
    setCache("hybrid_analysis", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "Hybrid Analysis", status: "unavailable", error: msg, capabilities: ["AI Analysis", "MITRE ATT&CK Mapping"] };
  }
}

async function queryJoeSandbox(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("joe_sandbox", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch("https://jbxcloud.joesecurity.org/api/v2/submission/search", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ apikey: apiKey, q: hash }).toString(),
      signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "Joe Sandbox", status: "no_key", error: "Invalid API key", capabilities: ["AI Analysis", "Code Analysis"] };
      setCache("joe_sandbox", hash, res); return res;
    }
    if (!r.ok) return { source: "Joe Sandbox", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["AI Analysis", "Code Analysis"] };
    const d = await r.json() as Record<string, unknown>;
    const data = d["data"] as Record<string, unknown>;
    const items = data?.["items"] as unknown[] | null;
    if (!items || items.length === 0) {
      const res: SandboxEnrichment = { source: "Joe Sandbox", status: "miss", capabilities: ["AI Analysis", "Code Analysis"] };
      setCache("joe_sandbox", hash, res); return res;
    }
    const item = items[0] as Record<string, unknown>;
    const detection = (item["detection"] as string | null)?.toLowerCase() ?? "unknown";
    const verdict: SandboxEnrichment["verdict"] =
      detection === "malicious" ? "malicious"
      : detection === "suspicious" ? "suspicious"
      : detection === "clean" ? "clean"
      : "unknown";
    const res: SandboxEnrichment = {
      source: "Joe Sandbox",
      status: "hit",
      verdict,
      score: typeof item["score"] === "number" ? item["score"] as number : null,
      malwareFamily: item["classification"] as string | null ?? null,
      reportUrl: item["webid"] ? `https://jbxcloud.joesecurity.org/analysis/${item["webid"]}/0/html` : null,
      analyzedAt: item["time"] as string | null ?? null,
      capabilities: ["AI Analysis", "Code Analysis", "Network Analysis"],
    };
    setCache("joe_sandbox", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "Joe Sandbox", status: "unavailable", error: msg, capabilities: ["AI Analysis", "Code Analysis"] };
  }
}

async function queryHatchingTriage(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("hatching_triage", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch(`https://tria.ge/api/v0/search?query=${encodeURIComponent(hash)}&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "Hatching Triage", status: "no_key", error: "Invalid API key", capabilities: ["High-Throughput Sandbox", "YARA/Suricata"] };
      setCache("hatching_triage", hash, res); return res;
    }
    if (!r.ok) return { source: "Hatching Triage", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["High-Throughput Sandbox", "YARA/Suricata"] };
    const d = await r.json() as Record<string, unknown>;
    const items = d["data"] as unknown[] | null;
    if (!items || items.length === 0) {
      const res: SandboxEnrichment = { source: "Hatching Triage", status: "miss", capabilities: ["High-Throughput Sandbox", "YARA/Suricata"] };
      setCache("hatching_triage", hash, res); return res;
    }
    const item = items[0] as Record<string, unknown>;
    const scoreNum = typeof item["score"] === "number" ? item["score"] as number : null;
    const verdict: SandboxEnrichment["verdict"] =
      scoreNum !== null && scoreNum >= 8 ? "malicious"
      : scoreNum !== null && scoreNum >= 5 ? "suspicious"
      : scoreNum !== null ? "clean"
      : "unknown";
    const tags = (item["tags"] as string[] | null) ?? [];
    const families = (item["families"] as string[] | null) ?? [];
    const res: SandboxEnrichment = {
      source: "Hatching Triage",
      status: "hit",
      verdict,
      score: scoreNum !== null ? Math.round(scoreNum * 10) : null,
      malwareFamily: families[0] ?? null,
      behaviors: tags,
      reportUrl: item["id"] ? `https://tria.ge/${item["id"]}` : null,
      analyzedAt: item["completed"] as string | null ?? null,
      capabilities: ["High-Throughput Sandbox", "YARA/Suricata", "Behavioral Analysis"],
    };
    setCache("hatching_triage", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "Hatching Triage", status: "unavailable", error: msg, capabilities: ["High-Throughput Sandbox", "YARA/Suricata"] };
  }
}

async function queryIntezerAnalyze(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("intezer_analyze", hash);
  if (cached) return cached;
  const { signal: sig1, clear: clr1 } = makeAbort();
  try {
    const tokenRes = await fetch("https://analyze.intezer.com/api/v2-0/get-access-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
      signal: sig1,
    });
    clr1();
    if (tokenRes.status === 401 || tokenRes.status === 403) {
      const res: SandboxEnrichment = { source: "Intezer Analyze", status: "no_key", error: "Invalid API key", capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
      setCache("intezer_analyze", hash, res); return res;
    }
    if (!tokenRes.ok) return { source: "Intezer Analyze", status: "unavailable", error: `Auth HTTP ${tokenRes.status}`, capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    const jwt = tokenData["result"] as string;
    const { signal: sig2, clear: clr2 } = makeAbort();
    const r = await fetch(`https://analyze.intezer.com/api/v2-0/files/${encodeURIComponent(hash)}`, {
      headers: { Authorization: `Bearer ${jwt}` }, signal: sig2,
    });
    clr2();
    if (r.status === 404) {
      const res: SandboxEnrichment = { source: "Intezer Analyze", status: "miss", capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
      setCache("intezer_analyze", hash, res); return res;
    }
    if (!r.ok) return { source: "Intezer Analyze", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
    const d = await r.json() as Record<string, unknown>;
    const result = d["result"] as Record<string, unknown> | null;
    if (!result) {
      const res: SandboxEnrichment = { source: "Intezer Analyze", status: "miss", capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
      setCache("intezer_analyze", hash, res); return res;
    }
    const verdict: SandboxEnrichment["verdict"] =
      result["verdict"] === "malicious" ? "malicious"
      : result["verdict"] === "suspicious" ? "suspicious"
      : result["verdict"] === "trusted" || result["verdict"] === "goodware" ? "clean"
      : "unknown";
    const families = (result["families"] as Record<string, unknown>[] | null)
      ?.map(f => f["name"] as string).filter(Boolean) ?? [];
    const res: SandboxEnrichment = {
      source: "Intezer Analyze",
      status: "hit",
      verdict,
      malwareFamily: families[0] ?? null,
      reportUrl: result["analysis_url"] as string | null ?? null,
      analyzedAt: result["creation_time"] as string | null ?? null,
      capabilities: ["Gene-Based Analysis", "Code Reuse Detection", "Threat Actor Attribution"],
    };
    setCache("intezer_analyze", hash, res); return res;
  } catch (e: any) {
    clr1();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "Intezer Analyze", status: "unavailable", error: msg, capabilities: ["Gene-Based Analysis", "Code Reuse Detection"] };
  }
}

async function queryVMRay(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("vmray", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch(`https://eu.cloud.vmray.com/api/v1/samples/md5/${encodeURIComponent(hash)}`, {
      headers: { Authorization: `api_key ${apiKey}` }, signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "VMRay", status: "no_key", error: "Invalid API key", capabilities: ["Agentless Sandbox", "VTI Scoring"] };
      setCache("vmray", hash, res); return res;
    }
    if (r.status === 404) {
      const res: SandboxEnrichment = { source: "VMRay", status: "miss", capabilities: ["Agentless Sandbox", "VTI Scoring"] };
      setCache("vmray", hash, res); return res;
    }
    if (!r.ok) return { source: "VMRay", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["Agentless Sandbox", "VTI Scoring"] };
    const d = await r.json() as Record<string, unknown>;
    const items = d["data"] as Record<string, unknown>[] | null;
    if (!items || items.length === 0) {
      const res: SandboxEnrichment = { source: "VMRay", status: "miss", capabilities: ["Agentless Sandbox", "VTI Scoring"] };
      setCache("vmray", hash, res); return res;
    }
    const item = items[0];
    const vtiLevel = item["sample_vti_score"] as number | null ?? null;
    const verdict: SandboxEnrichment["verdict"] =
      vtiLevel !== null && vtiLevel >= 75 ? "malicious"
      : vtiLevel !== null && vtiLevel >= 40 ? "suspicious"
      : vtiLevel !== null ? "clean"
      : "unknown";
    const classArray = item["sample_classifications"] as string[] | null;
    const res: SandboxEnrichment = {
      source: "VMRay",
      status: "hit",
      verdict,
      score: vtiLevel,
      malwareFamily: classArray ? classArray.join(", ") : null,
      reportUrl: item["sample_webif_url"] as string | null ?? null,
      analyzedAt: item["sample_created_at"] as string | null ?? null,
      capabilities: ["Agentless Sandbox", "VTI Scoring", "Evasion-Resistant"],
    };
    setCache("vmray", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "VMRay", status: "unavailable", error: msg, capabilities: ["Agentless Sandbox", "VTI Scoring"] };
  }
}

// ── TI Connector query functions (hash-only lookups) ─────────────────────────

async function queryThreatFox(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("threatfox", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["API-KEY"] = apiKey;
    const r = await fetch("https://threatfox-api.abuse.ch/api/v1/", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "search_ioc", search_term: hash }),
      signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "ThreatFox", status: "no_key", error: "Invalid API key", capabilities: ["Hash Reputation", "Malware Tagging"] };
      setCache("threatfox", hash, res); return res;
    }
    if (!r.ok) return { source: "ThreatFox", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["Hash Reputation", "Malware Tagging"] };
    const d = await r.json() as Record<string, unknown>;
    if (d["query_status"] !== "ok" || !d["data"]) {
      const res: SandboxEnrichment = { source: "ThreatFox", status: "miss", capabilities: ["Hash Reputation", "Malware Tagging"] };
      setCache("threatfox", hash, res); return res;
    }
    const items = d["data"] as Record<string, unknown>[];
    if (items.length === 0) {
      const res: SandboxEnrichment = { source: "ThreatFox", status: "miss", capabilities: ["Hash Reputation", "Malware Tagging"] };
      setCache("threatfox", hash, res); return res;
    }
    const item = items[0];
    const tags = (item["tags"] as string[] | null) ?? [];
    const res: SandboxEnrichment = {
      source: "ThreatFox",
      status: "hit",
      verdict: "malicious",
      malwareFamily: item["malware"] as string | null ?? null,
      behaviors: tags,
      reportUrl: item["reference"] as string | null ?? null,
      analyzedAt: item["first_seen"] as string | null ?? null,
      capabilities: ["Hash Reputation", "Malware Tagging", "IOC Feed"],
    };
    setCache("threatfox", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "ThreatFox", status: "unavailable", error: msg, capabilities: ["Hash Reputation", "Malware Tagging"] };
  }
}

async function queryGreyNoise(hash: string, _apiKey: string): Promise<SandboxEnrichment> {
  // GreyNoise does not support hash lookups — always returns miss
  return { source: "GreyNoise", status: "miss", capabilities: ["IP Noise Analysis", "Context Lookup"] };
}

async function queryShodan(hash: string, _apiKey: string): Promise<SandboxEnrichment> {
  // Shodan does not support hash lookups natively — always returns miss for hash
  return { source: "Shodan", status: "miss", capabilities: ["Banner Search", "CVE Lookup"] };
}

async function queryURLScanIO(hash: string, apiKey: string): Promise<SandboxEnrichment> {
  const cached = getCached("urlscan_io", hash);
  if (cached) return cached;
  const { signal, clear } = makeAbort();
  try {
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=hash:${encodeURIComponent(hash)}&size=1`, {
      headers: { "API-Key": apiKey },
      signal,
    });
    clear();
    if (r.status === 401 || r.status === 403) {
      const res: SandboxEnrichment = { source: "URLScan.io", status: "no_key", error: "Invalid API key", capabilities: ["URL Scanning", "Screenshot Analysis"] };
      setCache("urlscan_io", hash, res); return res;
    }
    if (!r.ok) return { source: "URLScan.io", status: "unavailable", error: `HTTP ${r.status}`, capabilities: ["URL Scanning", "Screenshot Analysis"] };
    const d = await r.json() as Record<string, unknown>;
    const results = d["results"] as unknown[] | null;
    if (!results || results.length === 0) {
      const res: SandboxEnrichment = { source: "URLScan.io", status: "miss", capabilities: ["URL Scanning", "Screenshot Analysis"] };
      setCache("urlscan_io", hash, res); return res;
    }
    const item = results[0] as Record<string, unknown>;
    const task = item["task"] as Record<string, unknown> | null;
    const page = item["page"] as Record<string, unknown> | null;
    const res: SandboxEnrichment = {
      source: "URLScan.io",
      status: "hit",
      verdict: "suspicious",
      malwareFamily: null,
      networkIocs: page?.["url"] ? [page["url"] as string] : [],
      reportUrl: task?.["reportURL"] as string | null ?? null,
      analyzedAt: task?.["time"] as string | null ?? null,
      capabilities: ["URL Scanning", "Screenshot Analysis", "DOM Analysis"],
    };
    setCache("urlscan_io", hash, res); return res;
  } catch (e: any) {
    clear();
    const msg = e?.name === "AbortError" ? "Timed out" : (e?.message ?? "Connection failed");
    return { source: "URLScan.io", status: "unavailable", error: msg, capabilities: ["URL Scanning", "Screenshot Analysis"] };
  }
}

const SANDBOX_DEFS: Array<{
  name: string;
  label: string;
  capabilities: string[];
  fn: (hash: string, key: string) => Promise<SandboxEnrichment>;
}> = [
  // Malware Sandboxes
  { name: "anyrun", label: "Any.Run", capabilities: ["Interactive Sandbox", "Behavioral Analysis", "Network Analysis"], fn: queryAnyRun },
  { name: "hybrid_analysis", label: "Hybrid Analysis", capabilities: ["AI Analysis", "MITRE ATT&CK Mapping", "Behavioral Analysis"], fn: queryHybridAnalysis },
  { name: "joe_sandbox", label: "Joe Sandbox", capabilities: ["AI Analysis", "Code Analysis", "Network Analysis"], fn: queryJoeSandbox },
  { name: "hatching_triage", label: "Hatching Triage", capabilities: ["High-Throughput Sandbox", "YARA/Suricata", "Behavioral Analysis"], fn: queryHatchingTriage },
  { name: "intezer_analyze", label: "Intezer Analyze", capabilities: ["Gene-Based Analysis", "Code Reuse Detection", "Threat Actor Attribution"], fn: queryIntezerAnalyze },
  { name: "vmray", label: "VMRay", capabilities: ["Agentless Sandbox", "VTI Scoring", "Evasion-Resistant"], fn: queryVMRay },
  // Threat Intelligence Connectors (hash-capable)
  { name: "threatfox", label: "ThreatFox", capabilities: ["Hash Reputation", "Malware Tagging", "IOC Feed"], fn: queryThreatFox },
  { name: "greynoise", label: "GreyNoise", capabilities: ["IP Noise Analysis", "Context Lookup"], fn: queryGreyNoise },
  { name: "shodan", label: "Shodan", capabilities: ["Banner Search", "CVE Lookup"], fn: queryShodan },
  { name: "urlscan_io", label: "URLScan.io", capabilities: ["URL Scanning", "Screenshot Analysis", "DOM Analysis"], fn: queryURLScanIO },
];

export async function enrichHashWithSandboxes(hash: string): Promise<SandboxEnrichment[]> {
  const integrations = await loadSandboxIntegrations();
  const isEnabled = (name: string) => integrations[name]?.enabled ?? false;
  const getKey = (name: string) => integrations[name]?.api_key ?? null;
  const requiresKey = (name: string) => integrations[name]?.requires_key ?? true;

  const settled = await Promise.allSettled(
    SANDBOX_DEFS.map(async (def): Promise<SandboxEnrichment> => {
      if (!isEnabled(def.name)) return { source: def.label, status: "disabled", capabilities: def.capabilities };
      const key = getKey(def.name);
      // Only block on missing key when the integration actually requires one
      if (!key && requiresKey(def.name)) return { source: def.label, status: "no_key", capabilities: def.capabilities };
      return def.fn(hash, key ?? "");
    })
  );

  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { source: SANDBOX_DEFS[i].label, status: "unavailable" as const, error: r.reason?.message ?? "Unknown error", capabilities: SANDBOX_DEFS[i].capabilities };
  });
}
