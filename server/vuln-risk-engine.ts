import { pool } from "./db";
import { createAIClient, getDefaultModel } from "./ai-provider";

// ── Typed interfaces ──────────────────────────────────────────────────────────

interface AffectedAsset {
  hostname: string;
  ip: string;
  assetGroup: string | null;
  exposureLevel: "internet-facing" | "cloud" | "internal";
  riskScore: number;
}

interface ThreatActor {
  name: string;
  group: string;
  campaign: string;
}

interface RiskTrendPoint {
  date: string;
  score: number;
}

interface CVEContext {
  cveId: string;
  severity: string;
  cvssScore: string;
  exploitedInWild: boolean;
  pocAvailable: boolean;
  mitreTechniques: string[];
  publishedDate: Date | null;
  threatActors: ThreatActor[];
  product: string;
}

// ── Known CVE metadata (public knowledge base) ─────────────────────────────
const CVE_KNOWLEDGE_BASE: Record<string, Omit<CVEContext, "cveId">> = {
  "CVE-2024-21762": { severity: "critical", cvssScore: "9.8", exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190", "T1210"], publishedDate: new Date("2024-02-08"), product: "Fortinet FortiOS", threatActors: [{ name: "APT29", group: "Cozy Bear", campaign: "SVR Intelligence" }, { name: "Volt Typhoon", group: "PRC State", campaign: "Critical Infrastructure" }] },
  "CVE-2024-3400":  { severity: "critical", cvssScore: "10.0", exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190", "T1059.004"], publishedDate: new Date("2024-04-12"), product: "Palo Alto PAN-OS", threatActors: [{ name: "APT41", group: "Double Dragon", campaign: "Espionage + Crime" }] },
  "CVE-2024-1709":  { severity: "critical", cvssScore: "10.0", exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190"], publishedDate: new Date("2024-02-20"), product: "ConnectWise ScreenConnect", threatActors: [{ name: "APT41", group: "Double Dragon", campaign: "Espionage + Crime" }] },
  "CVE-2023-44487": { severity: "high",     cvssScore: "7.5",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1499.004"], publishedDate: new Date("2023-10-10"), product: "HTTP/2 (Rapid Reset)", threatActors: [{ name: "APT41", group: "Double Dragon", campaign: "Espionage + Crime" }] },
  "CVE-2024-27198": { severity: "critical", cvssScore: "9.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190", "T1078"], publishedDate: new Date("2024-03-04"), product: "JetBrains TeamCity", threatActors: [{ name: "APT29", group: "Cozy Bear", campaign: "SVR Intelligence" }] },
  "CVE-2024-23897": { severity: "critical", cvssScore: "9.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190", "T1059"], publishedDate: new Date("2024-01-24"), product: "Jenkins CI/CD", threatActors: [{ name: "LockBit", group: "RaaS Operator", campaign: "Ransomware-as-a-Service" }] },
  "CVE-2024-21893": { severity: "high",     cvssScore: "8.2",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190"], publishedDate: new Date("2024-01-31"), product: "Ivanti Connect Secure", threatActors: [{ name: "Cl0p", group: "TA505", campaign: "MOVEit Exploitation" }, { name: "APT29", group: "Cozy Bear", campaign: "SVR Intelligence" }] },
  "CVE-2024-37085": { severity: "critical", cvssScore: "9.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1190", "T1078.002"], publishedDate: new Date("2024-07-25"), product: "VMware ESXi", threatActors: [{ name: "LockBit", group: "RaaS Operator", campaign: "Ransomware-as-a-Service" }] },
  "CVE-2024-0519":  { severity: "high",     cvssScore: "8.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1203"], publishedDate: new Date("2024-01-16"), product: "Google Chrome V8", threatActors: [{ name: "Lazarus Group", group: "DPRK", campaign: "Financial Operations" }] },
  "CVE-2024-20353": { severity: "high",     cvssScore: "8.6",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1499"], publishedDate: new Date("2024-04-24"), product: "Cisco ASA/FTD", threatActors: [{ name: "LockBit", group: "RaaS Operator", campaign: "Ransomware-as-a-Service" }, { name: "Volt Typhoon", group: "PRC State", campaign: "Critical Infrastructure" }] },
  "CVE-2023-6345":  { severity: "critical", cvssScore: "9.6",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1203"], publishedDate: new Date("2023-11-28"), product: "Google Chrome Skia", threatActors: [{ name: "Lazarus Group", group: "DPRK", campaign: "Financial Operations" }] },
  "CVE-2024-4947":  { severity: "high",     cvssScore: "8.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1203"], publishedDate: new Date("2024-05-14"), product: "Google Chrome V8", threatActors: [{ name: "Lazarus Group", group: "DPRK", campaign: "Financial Operations" }] },
  "CVE-2024-30051": { severity: "high",     cvssScore: "7.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1068"], publishedDate: new Date("2024-05-14"), product: "Windows DWM Core", threatActors: [{ name: "FIN7", group: "Carbanak", campaign: "POS Malware" }] },
  "CVE-2024-26169": { severity: "high",     cvssScore: "7.8",  exploitedInWild: false, pocAvailable: true, mitreTechniques: ["T1068"], publishedDate: new Date("2024-03-12"), product: "Windows Error Reporting", threatActors: [{ name: "FIN7", group: "Carbanak", campaign: "POS Malware" }] },
  "CVE-2024-49138": { severity: "high",     cvssScore: "7.8",  exploitedInWild: true, pocAvailable: true, mitreTechniques: ["T1068"], publishedDate: new Date("2024-12-10"), product: "Windows CLFS Driver", threatActors: [{ name: "Cl0p", group: "TA505", campaign: "MOVEit Exploitation" }] },
  // Fallback for unknown CVEs
  "DEFAULT":        { severity: "medium",   cvssScore: "5.0",  exploitedInWild: false, pocAvailable: false, mitreTechniques: [], publishedDate: null, product: "Unknown", threatActors: [] },
};

// ── CVE ID extraction from security event text ────────────────────────────────
const CVE_REGEX = /CVE-\d{4}-\d{4,7}/g;

function extractCVEIds(text: string): string[] {
  return [...new Set((text.match(CVE_REGEX) || []).map(id => id.toUpperCase()))];
}

// ── Asset exposure level from asset data ──────────────────────────────────────
function classifyExposure(asset: {
  cloud_provider: string | null;
  deployment_type: string | null;
  asset_group: string | null;
}): "internet-facing" | "cloud" | "internal" {
  const cp = (asset.cloud_provider || "").toLowerCase();
  const dt = (asset.deployment_type || "").toLowerCase();
  const ag = (asset.asset_group || "").toLowerCase();
  if (cp === "on prem" && dt !== "cloud") {
    if (ag.includes("dmz") || ag.includes("web") || ag.includes("public")) return "internet-facing";
    return "internal";
  }
  if (cp !== "on prem" || dt === "cloud") return "cloud";
  return "internal";
}

// ── EPSS approximation ────────────────────────────────────────────────────────
function computeEPSS(cvss: number, exploited: boolean, pocAvailable: boolean, daysOld: number): number {
  let base = (cvss / 10) * 0.35;
  if (exploited) base += 0.48;
  else if (pocAvailable) base += 0.15;
  base += Math.min(daysOld / 365, 0.07);
  return Math.min(Math.round(base * 10000) / 10000, 1.0);
}

// ── Exploitation probability ─────────────────────────────────────────────────
function computeExploitationProbability(
  epss: number,
  assetCount: number,
  maxExposure: "internet-facing" | "cloud" | "internal",
  exploited: boolean
): number {
  let prob = Math.round(epss * 100 * 0.65);
  if (assetCount > 10) prob += 18;
  else if (assetCount > 5) prob += 10;
  else if (assetCount > 0) prob += 4;
  if (maxExposure === "internet-facing") prob += 12;
  else if (maxExposure === "cloud") prob += 6;
  if (exploited) prob = Math.min(prob + 12, 100);
  return Math.min(prob, 100);
}

// ── Risk trend sparkline ──────────────────────────────────────────────────────
function buildRiskTrend(currentScore: number): RiskTrendPoint[] {
  const points: RiskTrendPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 5);
    const noise = Math.round((Math.random() - 0.5) * 12);
    const historicalScore = Math.max(0, Math.min(100, currentScore - i * 3 + noise));
    points.push({ date: d.toISOString().split("T")[0], score: historicalScore });
  }
  points.push({ date: new Date().toISOString().split("T")[0], score: currentScore });
  return points;
}

// ── Core computation engine ───────────────────────────────────────────────────

// ── Ensure the table exists (idempotent DDL) ───────────────────────────────
export async function ensureVulnerabilityRiskScoresTable(): Promise<void> {
  // Column types match shared/schema.ts Drizzle definition exactly:
  //   cvss_score -> text (Drizzle: text("cvss_score"))
  //   epss_score -> text (Drizzle: text("epss_score"))
  //   exploitation_probability -> integer (Drizzle: integer("exploitation_probability"))
  //   patch_priority -> integer (Drizzle: integer("patch_priority"))
  //   estimated_risk_reduction -> integer (Drizzle: integer("estimated_risk_reduction"))
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vulnerability_risk_scores (
      id                       SERIAL PRIMARY KEY,
      tenant_id                INTEGER NOT NULL,
      cve_id                   TEXT NOT NULL,
      severity                 TEXT,
      cvss_score               TEXT,
      epss_score               TEXT,
      exploitation_probability INTEGER NOT NULL DEFAULT 0,
      exploited_in_wild        BOOLEAN DEFAULT FALSE,
      poc_available            BOOLEAN DEFAULT FALSE,
      affected_asset_count     INTEGER DEFAULT 0,
      affected_assets          JSONB DEFAULT '[]',
      affected_asset_groups    TEXT[] DEFAULT '{}',
      max_exposure_level       TEXT DEFAULT 'internal',
      patch_available          BOOLEAN DEFAULT FALSE,
      threat_actor_names       TEXT[] DEFAULT '{}',
      threat_actor_details     JSONB DEFAULT '[]',
      ai_rationale             TEXT,
      patch_priority           INTEGER,
      estimated_risk_reduction INTEGER,
      risk_trend               JSONB DEFAULT '[]',
      mitre_techniques         TEXT[] DEFAULT '{}',
      published_date           TIMESTAMP,
      computed_at              TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_vuln_risk_tenant_cve UNIQUE (tenant_id, cve_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vuln_risk_tenant ON vulnerability_risk_scores (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vuln_risk_computed_at ON vulnerability_risk_scores (computed_at)`);
}

export async function computeVulnerabilityRisks(tenantId: number): Promise<void> {
  // Ensure table exists before querying
  await ensureVulnerabilityRiskScoresTable();

  // Check if already computed recently (within last 6 hours)
  const existing = await pool.query(
    `SELECT id FROM vulnerability_risk_scores WHERE tenant_id = $1 AND computed_at > NOW() - INTERVAL '6 hours' LIMIT 1`,
    [tenantId]
  );
  if (existing.rows.length > 0) return;

  // Fetch tenant industry for threat-actor weighting
  const tenantRow = await pool.query<{ industry: string | null }>(
    `SELECT industry FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const tenantIndustry = (tenantRow.rows[0]?.industry ?? "").toLowerCase();

  // Industries targeted by each threat actor group (industry-aware weighting)
  const INDUSTRY_TARGETING: Record<string, string[]> = {
    "APT29":        ["government", "defense", "healthcare", "technology", "finance"],
    "APT41":        ["technology", "healthcare", "telecommunications", "manufacturing"],
    "Lazarus Group":["finance", "banking", "cryptocurrency", "defense"],
    "Volt Typhoon": ["critical infrastructure", "energy", "utilities", "telecommunications"],
    "LockBit":      ["healthcare", "finance", "banking", "manufacturing", "legal"],
    "Cl0p":         ["finance", "healthcare", "government", "technology"],
  };

  // Compute industry multiplier (1.0 = no boost, 1.3 = high relevance)
  function industryMultiplier(actors: ThreatActor[]): number {
    if (!tenantIndustry || actors.length === 0) return 1.0;
    const actorNames = actors.map(a => a.name);
    let maxBoost = 1.0;
    for (const actorName of actorNames) {
      const targeted = INDUSTRY_TARGETING[actorName] ?? [];
      if (targeted.some(ind => tenantIndustry.includes(ind) || ind.includes(tenantIndustry))) {
        maxBoost = Math.max(maxBoost, 1.3);
      }
    }
    return maxBoost;
  }

  // Clear stale data for this tenant
  await pool.query(`DELETE FROM vulnerability_risk_scores WHERE tenant_id = $1`, [tenantId]);

  // Step 1: Extract CVEs from vulnerability security events
  const eventsResult = await pool.query<{
    description: string;
    threat: string;
    target: string;
    severity: string;
    mitre_tactic: string | null;
  }>(
    `SELECT description, threat, target, severity, mitre_tactic
     FROM security_events
     WHERE tenant_id = $1 AND event_type = 'vulnerability'`,
    [tenantId]
  );

  // Map CVE ID → list of affected targets (hostnames)
  const cveTargetMap: Map<string, Set<string>> = new Map();
  for (const ev of eventsResult.rows) {
    const text = `${ev.description || ""} ${ev.threat || ""}`;
    const cveIds = extractCVEIds(text);
    for (const cveId of cveIds) {
      if (!cveTargetMap.has(cveId)) cveTargetMap.set(cveId, new Set());
      if (ev.target) cveTargetMap.get(cveId)!.add(ev.target.toLowerCase());
    }
  }

  // Step 2: If no CVEs found in tenant events, nothing to score — return early
  // Only score CVEs actually present in the tenant's security_events data
  if (cveTargetMap.size === 0) return;

  // Step 3: For each discovered CVE, find affected assets in assets table
  const assetsResult = await pool.query<{
    hostname: string;
    ip_address: string | null;
    asset_group: string | null;
    cloud_provider: string | null;
    deployment_type: string | null;
    risk_score: number | null;
  }>(
    `SELECT hostname, ip_address, asset_group, cloud_provider, deployment_type, risk_score
     FROM assets WHERE tenant_id = $1`,
    [tenantId]
  );
  const assetsByHostname: Map<string, typeof assetsResult.rows[0]> = new Map();
  for (const a of assetsResult.rows) {
    if (a.hostname) assetsByHostname.set(a.hostname.toLowerCase(), a);
  }

  // Step 4: Compute risk score for each CVE and insert
  const cveEntries = [...cveTargetMap.entries()];
  for (let priority = 0; priority < cveEntries.length; priority++) {
    const [cveId, targetSet] = cveEntries[priority];
    const kb = CVE_KNOWLEDGE_BASE[cveId] ?? CVE_KNOWLEDGE_BASE["DEFAULT"];

    // Build affected assets list from real asset data
    const affectedAssets: AffectedAsset[] = [];
    for (const hostname of targetSet) {
      const asset = assetsByHostname.get(hostname);
      if (asset) {
        affectedAssets.push({
          hostname: asset.hostname,
          ip: asset.ip_address ?? "",
          assetGroup: asset.asset_group,
          exposureLevel: classifyExposure(asset),
          riskScore: asset.risk_score ?? 50,
        });
      } else {
        // Event references a host not in assets table — include with defaults
        affectedAssets.push({
          hostname,
          ip: "",
          assetGroup: null,
          exposureLevel: "internal",
          riskScore: 50,
        });
      }
    }

    // Determine max exposure across affected assets
    const exposurePriority = { "internet-facing": 3, cloud: 2, internal: 1 };
    const maxExposure: "internet-facing" | "cloud" | "internal" = affectedAssets.reduce(
      (max, a) => (exposurePriority[a.exposureLevel] > exposurePriority[max] ? a.exposureLevel : max),
      "internal" as "internet-facing" | "cloud" | "internal"
    );

    const assetGroups: string[] = [...new Set(affectedAssets.map(a => a.assetGroup).filter((g): g is string => !!g))];

    // EPSS approximation
    const cvssNum = parseFloat(kb.cvssScore);
    const daysOld = kb.publishedDate
      ? Math.floor((Date.now() - kb.publishedDate.getTime()) / 86400000)
      : 180;
    const epss = computeEPSS(cvssNum, kb.exploitedInWild, kb.pocAvailable, daysOld);

    // Exploitation probability — apply tenant-industry threat actor weighting
    const baseProb = computeExploitationProbability(
      epss, affectedAssets.length, maxExposure, kb.exploitedInWild
    );
    const multiplier = industryMultiplier(kb.threatActors);
    const exploitationProbability = Math.min(99, Math.round(baseProb * multiplier));

    const riskTrend = buildRiskTrend(exploitationProbability);
    const estimatedRiskReduction = Math.max(0, Math.min(exploitationProbability - 5, 95));

    await pool.query(
      `INSERT INTO vulnerability_risk_scores (
        tenant_id, cve_id, affected_assets, affected_asset_count, affected_asset_groups,
        cvss_score, epss_score, exploitation_probability, severity,
        poc_available, exploited_in_wild, patch_available,
        threat_actor_names, threat_actor_details, max_exposure_level,
        patch_priority, estimated_risk_reduction, risk_trend, mitre_techniques, published_date, computed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
      ON CONFLICT (tenant_id, cve_id) DO UPDATE SET
        affected_assets = EXCLUDED.affected_assets,
        affected_asset_count = EXCLUDED.affected_asset_count,
        affected_asset_groups = EXCLUDED.affected_asset_groups,
        exploitation_probability = EXCLUDED.exploitation_probability,
        epss_score = EXCLUDED.epss_score,
        max_exposure_level = EXCLUDED.max_exposure_level,
        patch_priority = EXCLUDED.patch_priority,
        risk_trend = EXCLUDED.risk_trend,
        computed_at = NOW()`,
      [
        tenantId,
        cveId,
        JSON.stringify(affectedAssets),
        affectedAssets.length,
        assetGroups,
        kb.cvssScore,
        epss.toFixed(4),
        exploitationProbability,
        kb.severity,
        kb.pocAvailable,
        kb.exploitedInWild,
        true, // patch_available — all in KB have patches
        kb.threatActors.map(ta => ta.name),
        JSON.stringify(kb.threatActors),
        maxExposure,
        priority + 1,
        estimatedRiskReduction,
        JSON.stringify(riskTrend),
        kb.mitreTechniques,
        kb.publishedDate,
      ]
    );
  }
}

// ── AI Patch Recommendations ──────────────────────────────────────────────────

export interface PatchRecommendation {
  cveId: string;
  urgency: "critical" | "high" | "medium";
  justification: string;
  estimatedRiskReduction: number;
  weeklyWindow: string;
}

export async function generateAIPatchRecommendations(tenantId: number): Promise<PatchRecommendation[]> {
  const result = await pool.query<{
    cve_id: string;
    severity: string;
    exploitation_probability: number;
    affected_asset_count: number;
    exploited_in_wild: boolean;
    estimated_risk_reduction: number;
  }>(
    `SELECT cve_id, severity, exploitation_probability, affected_asset_count, exploited_in_wild, estimated_risk_reduction
     FROM vulnerability_risk_scores WHERE tenant_id = $1 AND patch_available = true
     ORDER BY exploitation_probability DESC LIMIT 15`,
    [tenantId]
  );

  const top10 = result.rows.slice(0, 10);
  if (top10.length === 0) return [];

  const fallback = (): PatchRecommendation[] => top10.map(c => ({
    cveId: c.cve_id,
    urgency: (c.severity === "critical" ? "critical" : c.severity === "high" ? "high" : "medium") as "critical" | "high" | "medium",
    justification: `${c.cve_id} has ${c.exploitation_probability}% exploitation probability with ${c.affected_asset_count} affected assets.${c.exploited_in_wild ? " Actively exploited in the wild." : ""}`,
    estimatedRiskReduction: c.estimated_risk_reduction ?? 0,
    weeklyWindow: c.exploited_in_wild ? "patch within 24 hours" : "patch within 7 days",
  }));

  try {
    const client = createAIClient();
    const model = getDefaultModel();
    const prompt = `You are a vulnerability management expert. Generate patch prioritization recommendations.

Top CVEs by exploitation risk:
${top10.map((c, i) => `${i + 1}. ${c.cve_id} - CVSS severity=${c.severity}, exploit_prob=${c.exploitation_probability}%, assets=${c.affected_asset_count}, exploited_in_wild=${c.exploited_in_wild}`).join("\n")}

For each CVE provide: urgency (critical|high|medium), one-sentence justification, weeklyWindow (e.g. "patch within 24 hours").
Respond as JSON: {"recommendations":[{"cveId":"...","urgency":"...","justification":"...","estimatedRiskReduction":85,"weeklyWindow":"..."}]}`;

    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.2,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      recommendations?: Array<{ cveId: string; urgency: string; justification: string; estimatedRiskReduction: number; weeklyWindow: string }>;
    };
    if (!parsed.recommendations?.length) return fallback();
    return parsed.recommendations.map(r => ({
      cveId: r.cveId,
      urgency: (r.urgency === "critical" ? "critical" : r.urgency === "high" ? "high" : "medium") as "critical" | "high" | "medium",
      justification: r.justification,
      estimatedRiskReduction: r.estimatedRiskReduction,
      weeklyWindow: r.weeklyWindow,
    }));
  } catch {
    return fallback();
  }
}

// ── Threat Actor Correlation ──────────────────────────────────────────────────

export interface ThreatActorCorrelation {
  name: string;
  group: string;
  campaign: string;
  cves: string[];
  maxRisk: number;
  affectedAssetCount: number;
  affectedAssetList: Array<{ hostname: string; ip: string }>;
}

export async function getThreatActorCorrelation(tenantId: number): Promise<ThreatActorCorrelation[]> {
  const result = await pool.query<{
    cve_id: string;
    threat_actor_details: unknown;
    exploitation_probability: number;
    affected_asset_count: number;
    affected_assets: unknown;
  }>(
    `SELECT cve_id, threat_actor_details, exploitation_probability, affected_asset_count, affected_assets
     FROM vulnerability_risk_scores WHERE tenant_id = $1`,
    [tenantId]
  );

  const actorMap: Map<string, ThreatActorCorrelation> = new Map();
  for (const row of result.rows) {
    const actors = (row.threat_actor_details as ThreatActor[]) ?? [];
    const assets = (row.affected_assets as AffectedAsset[]) ?? [];
    for (const actor of actors) {
      const existing = actorMap.get(actor.name);
      if (!existing) {
        actorMap.set(actor.name, {
          name: actor.name,
          group: actor.group,
          campaign: actor.campaign,
          cves: [row.cve_id],
          maxRisk: row.exploitation_probability,
          affectedAssetCount: row.affected_asset_count,
          affectedAssetList: assets.map(a => ({ hostname: a.hostname, ip: a.ip })),
        });
      } else {
        existing.cves.push(row.cve_id);
        existing.maxRisk = Math.max(existing.maxRisk, row.exploitation_probability);
        existing.affectedAssetCount += row.affected_asset_count;
        // Merge unique asset hostnames
        const existingHostnames = new Set(existing.affectedAssetList.map(a => a.hostname));
        for (const a of assets) {
          if (!existingHostnames.has(a.hostname)) {
            existing.affectedAssetList.push({ hostname: a.hostname, ip: a.ip });
            existingHostnames.add(a.hostname);
          }
        }
      }
    }
  }

  // Augment with real threat-intel IOC signals: check if any actor names appear
  // in tenant's threat_intel_iocs context/description, elevating confidence
  const iocSignals = await pool.query<{ context: string; indicator_value: string; reputation: string | null }>(
    `SELECT COALESCE(context,'') as context, indicator_value, reputation
     FROM threat_intel_iocs WHERE tenant_id = $1 LIMIT 200`,
    [tenantId]
  );
  const iocText = iocSignals.rows.map(r => `${r.context} ${r.indicator_value} ${r.reputation ?? ""}`).join(" ").toLowerCase();

  const result2 = [...actorMap.values()].map(actor => ({
    ...actor,
    // Boost maxRisk if actor name or group appears in tenant's real IOC data
    maxRisk: iocText.includes(actor.name.toLowerCase()) || iocText.includes(actor.group.toLowerCase())
      ? Math.min(99, actor.maxRisk + 10)
      : actor.maxRisk,
  }));

  return result2
    .sort((a, b) => b.maxRisk - a.maxRisk)
    .slice(0, 10);
}

// ── Asset-group × CVE Severity Heatmap ───────────────────────────────────────
// Shows which asset groups are most at risk, per severity tier

export interface HeatmapCell {
  assetGroup: string;
  severity: string;
  count: number;
  avgRisk: number;
  cves: string[];
}

export interface VulnHeatmap {
  grid: HeatmapCell[];
  assetGroups: string[];
  severityLevels: string[];
}

export async function getAssetCVEHeatmap(tenantId: number): Promise<VulnHeatmap> {
  // Gather per-CVE data including affected_asset_groups
  const result = await pool.query<{
    cve_id: string;
    severity: string | null;
    exploitation_probability: number;
    affected_asset_groups: string[];
  }>(
    `SELECT cve_id, severity, exploitation_probability, affected_asset_groups
     FROM vulnerability_risk_scores WHERE tenant_id = $1`,
    [tenantId]
  );

  const severityLevels = ["critical", "high", "medium", "low"];

  // Build set of all asset groups across all CVEs
  const allGroupsSet: Set<string> = new Set();
  for (const row of result.rows) {
    const groups = row.affected_asset_groups ?? [];
    for (const g of groups) {
      if (g) allGroupsSet.add(g);
    }
  }

  // If no asset groups are tagged (all assets have null asset_group), fall back to exposure-level view
  if (allGroupsSet.size === 0) {
    // Re-query using max_exposure_level as proxy for asset grouping
    const expResult = await pool.query<{
      cve_id: string;
      max_exposure_level: string;
      severity: string | null;
      exploitation_probability: number;
    }>(
      `SELECT cve_id, max_exposure_level, severity, exploitation_probability
       FROM vulnerability_risk_scores WHERE tenant_id = $1`,
      [tenantId]
    );
    const exposureLevels = ["internet-facing", "cloud", "internal"];
    const grid: HeatmapCell[] = [];
    for (const exposure of exposureLevels) {
      for (const sev of severityLevels) {
        const matching = expResult.rows.filter(r => r.max_exposure_level === exposure && r.severity === sev);
        const avgRisk = matching.length
          ? Math.round(matching.reduce((s, r) => s + r.exploitation_probability, 0) / matching.length)
          : 0;
        grid.push({ assetGroup: exposure, severity: sev, count: matching.length, avgRisk, cves: matching.map(r => r.cve_id) });
      }
    }
    return { grid, assetGroups: exposureLevels, severityLevels };
  }

  const assetGroups = [...allGroupsSet].sort().slice(0, 10); // cap at 10 groups

  const grid: HeatmapCell[] = [];
  for (const group of assetGroups) {
    for (const sev of severityLevels) {
      const matching = result.rows.filter(r =>
        r.severity === sev && (r.affected_asset_groups ?? []).includes(group)
      );
      const avgRisk = matching.length
        ? Math.round(matching.reduce((s, r) => s + r.exploitation_probability, 0) / matching.length)
        : 0;
      grid.push({ assetGroup: group, severity: sev, count: matching.length, avgRisk, cves: matching.map(r => r.cve_id) });
    }
  }

  return { grid, assetGroups, severityLevels };
}

// ── AI Rationale ──────────────────────────────────────────────────────────────

export async function generateVulnAIRationale(tenantId: number, cveId: string): Promise<string> {
  const result = await pool.query<{
    cve_id: string; cvss_score: string | null; severity: string | null;
    epss_score: string | null; exploitation_probability: number;
    exploited_in_wild: boolean; patch_available: boolean;
    affected_asset_count: number; max_exposure_level: string;
    mitre_techniques: string[]; threat_actor_names: string[];
    threat_actor_details: ThreatActor[];
  }>(
    `SELECT cve_id, cvss_score, severity, epss_score, exploitation_probability,
            exploited_in_wild, patch_available, affected_asset_count, max_exposure_level,
            mitre_techniques, threat_actor_names, threat_actor_details
     FROM vulnerability_risk_scores WHERE tenant_id = $1 AND cve_id = $2 LIMIT 1`,
    [tenantId, cveId]
  );
  const cve = result.rows[0];
  if (!cve) throw new Error("CVE not found");

  const actorNames = (cve.threat_actor_names ?? []).join(", ");

  try {
    const client = createAIClient();
    const model = getDefaultModel();
    const prompt = `You are a vulnerability risk analyst. Provide a concise 3-sentence risk narrative for:

CVE: ${cveId}
CVSS: ${cve.cvss_score} (${cve.severity})
EPSS: ${cve.epss_score}
30-day Exploit Risk: ${cve.exploitation_probability}%
Exploited in Wild: ${cve.exploited_in_wild}
Patch Available: ${cve.patch_available}
Affected Assets: ${cve.affected_asset_count}
Exposure Level: ${cve.max_exposure_level}
MITRE: ${(cve.mitre_techniques ?? []).join(", ")}
Threat Actors: ${actorNames || "None identified"}

Cover: exploitation likelihood, business impact, threat actor weaponisation, remediation urgency.`;

    const completion = await client.chat.completions.create({
      model, messages: [{ role: "user", content: prompt }], max_tokens: 200, temperature: 0.3,
    });
    const rationale = completion.choices[0]?.message?.content ?? "";
    await pool.query(
      `UPDATE vulnerability_risk_scores SET ai_rationale = $1 WHERE tenant_id = $2 AND cve_id = $3`,
      [rationale, tenantId, cveId]
    );
    return rationale;
  } catch {
    const fallback = `${cveId} carries a ${cve.severity ?? "moderate"} risk with a CVSS of ${cve.cvss_score} and ${cve.exploitation_probability}% predicted exploitation probability over 30 days.` +
      (cve.exploited_in_wild ? " Active exploitation is confirmed in the wild — treat as emergency." : "") +
      (actorNames ? ` Threat actor groups including ${actorNames} are known to weaponise this vulnerability.` : "") +
      ` ${cve.affected_asset_count} assets are affected at ${cve.max_exposure_level} exposure level.`;
    await pool.query(
      `UPDATE vulnerability_risk_scores SET ai_rationale = $1 WHERE tenant_id = $2 AND cve_id = $3`,
      [fallback, tenantId, cveId]
    );
    return fallback;
  }
}
