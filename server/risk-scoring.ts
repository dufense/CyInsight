import pg from "pg";
import { CRITICALITY_MULTIPLIER } from "./criticality-engine";
type Pool = pg.Pool;

export interface RiskFactor {
  name: string;
  category: string;
  score: number;
  maxScore: number;
  weight: number;
  percentage: number;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

export interface RiskScoreResult {
  overallScore: number;
  riskLevel: "severe" | "critical" | "high" | "moderate" | "low";
  factors: RiskFactor[];
  topFactors: RiskFactor[];
  categoryBreakdown: { category: string; score: number; maxScore: number; percentage: number }[];
  historicalTrend: { date: string; score: number }[];
  correlationMultiplier: number;
  decayApplied: boolean;
}

const RISK_BANDS: [number, RiskScoreResult["riskLevel"]][] = [
  [81, "severe"],
  [61, "critical"],
  [41, "high"],
  [21, "moderate"],
  [0, "low"],
];

function getRiskLevel(score: number): RiskScoreResult["riskLevel"] {
  for (const [threshold, level] of RISK_BANDS) {
    if (score >= threshold) return level;
  }
  return "low";
}

function getFactorSeverity(pct: number): RiskFactor["severity"] {
  if (pct >= 80) return "critical";
  if (pct >= 60) return "high";
  if (pct >= 40) return "medium";
  if (pct >= 20) return "low";
  return "info";
}

function timeDecay(daysSince: number, lambda: number = 0.02): number {
  return Math.exp(-lambda * daysSince);
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

function correlationMultiplier(signalCount: number): number {
  if (signalCount >= 5) return 1.5;
  if (signalCount >= 4) return 1.3;
  if (signalCount >= 3) return 1.15;
  return 1.0;
}

function buildCategoryBreakdown(factors: RiskFactor[]): RiskScoreResult["categoryBreakdown"] {
  const cats = new Map<string, { score: number; maxScore: number }>();
  for (const f of factors) {
    const existing = cats.get(f.category) || { score: 0, maxScore: 0 };
    existing.score += f.score * f.weight;
    existing.maxScore += f.maxScore * f.weight;
    cats.set(f.category, existing);
  }
  return Array.from(cats.entries()).map(([category, { score, maxScore }]) => ({
    category,
    score: Math.round(score * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
  })).sort((a, b) => b.percentage - a.percentage);
}

export async function computeHostRiskScore(pool: Pool, tenantId: number, hostName: string, childTenantIds?: number[]): Promise<RiskScoreResult> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const np = `$${allTenantIds.length + 1}`;
  const nameLower = hostName.toLowerCase().trim();
  const now = new Date();

  const assetMetaRes = await pool.query(
    `SELECT cis_score, criticality FROM assets WHERE tenant_id = $1 AND LOWER(hostname) = $2 LIMIT 1`,
    [tenantId, nameLower]
  );
  const assetMeta = assetMetaRes.rows[0] || {};

  const [evtRes, incRes] = await Promise.all([
    pool.query(
      `SELECT severity, event_type, mitre_tactic, risk_score, action, occurred_at, log_source,
              raw_payload->>'vulnerabilitySeverity' as vuln_severity,
              raw_payload->>'cveId' as cve_id,
              raw_payload->>'exploitAvailable' as exploit_available
       FROM security_events 
       WHERE tenant_id IN (${ph}) AND (LOWER(asset) = ${np} OR LOWER(target) = ${np})
       ORDER BY occurred_at DESC LIMIT 500`,
      [...allTenantIds, nameLower]
    ),
    pool.query(
      `SELECT severity, status, category, created_at, is_true_positive, confidence_score
       FROM incidents 
       WHERE tenant_id IN (${ph}) AND (LOWER(affected_assets) LIKE '%' || ${np} || '%')
       ORDER BY created_at DESC LIMIT 100`,
      [...allTenantIds, nameLower]
    ),
  ]);

  const events = evtRes.rows;
  const incidents = incRes.rows;
  const factors: RiskFactor[] = [];
  let activeSignals = 0;

  const sevWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  let threatScore = 0;
  let threatMax = 0;
  const recentEvents = events.filter(e => e.occurred_at && daysBetween(new Date(e.occurred_at), now) < 90);
  for (const evt of recentEvents) {
    const days = daysBetween(new Date(evt.occurred_at), now);
    const decay = timeDecay(days);
    threatScore += (sevWeights[evt.severity] || 3) * decay;
    threatMax += sevWeights.critical;
  }
  threatMax = Math.max(threatMax, 1);
  const threatPct = Math.min(100, (threatScore / Math.max(threatMax * 0.3, 1)) * 100);
  if (threatPct > 5) activeSignals++;
  factors.push({
    name: "Security Event Severity",
    category: "Threat Intelligence",
    score: Math.round(threatPct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(threatPct),
    description: `${recentEvents.length} events in last 90 days (${events.filter(e => e.severity === 'critical').length} critical, ${events.filter(e => e.severity === 'high').length} high)`,
    severity: getFactorSeverity(threatPct),
  });

  const incidentScore = Math.min(100, incidents.length * 12);
  const criticalIncidents = incidents.filter(i => i.severity === "critical").length;
  const truePositives = incidents.filter(i => i.is_true_positive === true).length;
  const incPct = Math.min(100, incidentScore + criticalIncidents * 15 + truePositives * 10);
  if (incPct > 5) activeSignals++;
  factors.push({
    name: "Incident History",
    category: "Threat Intelligence",
    score: Math.round(incPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(incPct),
    description: `${incidents.length} incidents (${criticalIncidents} critical, ${truePositives} confirmed true positives)`,
    severity: getFactorSeverity(incPct),
  });

  const mitreTactics = new Set(events.filter(e => e.mitre_tactic).map(e => e.mitre_tactic.split(",")[0]?.trim()));
  const advancedTactics = ["Lateral Movement", "Privilege Escalation", "Exfiltration", "Command and Control", "Impact"];
  const advancedTacticCount = advancedTactics.filter(t => mitreTactics.has(t)).length;
  const behaviorPct = Math.min(100, mitreTactics.size * 12 + advancedTacticCount * 20);
  if (behaviorPct > 5) activeSignals++;
  factors.push({
    name: "Behavioral Indicators (MITRE ATT&CK)",
    category: "Behavioral Analysis",
    score: Math.round(behaviorPct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(behaviorPct),
    description: `${mitreTactics.size} unique tactics detected${advancedTacticCount > 0 ? ` (${advancedTacticCount} advanced)` : ""}`,
    severity: getFactorSeverity(behaviorPct),
  });

  const vulnEvents = events.filter(e => e.event_type === "vulnerability" || e.cve_id);
  const criticalVulns = vulnEvents.filter(e => e.vuln_severity === "critical" || e.severity === "critical").length;
  const exploitable = vulnEvents.filter(e => e.exploit_available === "true" || e.exploit_available === "yes").length;
  const vulnPct = Math.min(100, vulnEvents.length * 8 + criticalVulns * 20 + exploitable * 25);
  if (vulnPct > 5) activeSignals++;
  factors.push({
    name: "Vulnerability Exposure",
    category: "Vulnerability",
    score: Math.round(vulnPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(vulnPct),
    description: `${vulnEvents.length} vulnerabilities (${criticalVulns} critical, ${exploitable} exploitable)`,
    severity: getFactorSeverity(vulnPct),
  });

  const logSources = new Set(events.map(e => e.log_source).filter(Boolean));
  const hasEDR = Array.from(logSources).some(s => /edr|xdr|cortex|cynet|trellix|crowdstrike|sentinel/i.test(s || ""));
  const hasVuln = Array.from(logSources).some(s => /vuln|vicarius|qualys|tenable|nessus/i.test(s || ""));
  const eventTypes = new Set(events.map(e => e.event_type));
  const hasNetworkMonitoring = eventTypes.has("network");
  let controlGapPct = 0;
  if (!hasEDR) controlGapPct += 35;
  if (!hasVuln) controlGapPct += 25;
  if (!hasNetworkMonitoring) controlGapPct += 20;
  if (logSources.size < 2) controlGapPct += 20;
  controlGapPct = Math.min(100, controlGapPct);
  if (controlGapPct > 20) activeSignals++;
  factors.push({
    name: "Security Control Coverage",
    category: "Control Gaps",
    score: Math.round(controlGapPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(controlGapPct),
    description: `${hasEDR ? "EDR active" : "No EDR"}${hasVuln ? ", Vuln scanning" : ", No vuln scanning"}${hasNetworkMonitoring ? ", Network monitored" : ""}`,
    severity: getFactorSeverity(controlGapPct),
  });

  const eventTypeCount = eventTypes.size;
  const exposurePct = Math.min(100, eventTypeCount >= 5 ? 60 : eventTypeCount >= 3 ? 40 : eventTypeCount >= 2 ? 25 : 10);
  factors.push({
    name: "Exposure & Attack Surface",
    category: "Exposure",
    score: Math.round(exposurePct),
    maxScore: 100,
    weight: 0.10,
    percentage: Math.round(exposurePct),
    description: `Seen in ${eventTypeCount} event types across ${logSources.size} sources`,
    severity: getFactorSeverity(exposurePct),
  });

  // CIS Configuration Compliance factor
  if (assetMeta.cis_score !== null && assetMeta.cis_score !== undefined) {
    const cisScore = Number(assetMeta.cis_score);
    const nonCompliance = Math.max(0, 100 - cisScore);
    const cisPct = Math.round(nonCompliance * 0.8);
    if (cisPct > 5) activeSignals++;
    factors.push({
      name: "Configuration Compliance (CIS)",
      category: "Compliance",
      score: cisPct,
      maxScore: 80,
      weight: 0.10,
      percentage: cisPct,
      description: `CIS score: ${cisScore}/100 — ${cisScore >= 70 ? "IG1 Compliant" : cisScore >= 40 ? "Partial compliance" : "Non-compliant"}`,
      severity: getFactorSeverity(cisPct),
    });
  }

  const corrMult = correlationMultiplier(activeSignals);
  let rawScore = 0;
  let totalWeight = 0;
  for (const f of factors) {
    rawScore += f.score * f.weight;
    totalWeight += f.weight;
  }
  rawScore = totalWeight > 0 ? rawScore / totalWeight : 0;
  const criticalityTier = (assetMeta.criticality || "unclassified") as keyof typeof CRITICALITY_MULTIPLIER;
  const critMult = CRITICALITY_MULTIPLIER[criticalityTier] ?? 1.0;
  // Add criticality factor as an informational entry
  if (assetMeta.criticality) {
    factors.push({
      name: "Criticality Multiplier",
      category: "Compliance",
      score: 0,
      maxScore: 0,
      weight: 0,
      percentage: 0,
      description: `Asset criticality: ${assetMeta.criticality} → ×${critMult.toFixed(2)} multiplier applied`,
      severity: "info",
    });
  }
  let finalScore = Math.min(100, Math.round(rawScore * corrMult * critMult));

  const lastEventDate = events[0]?.occurred_at ? new Date(events[0].occurred_at) : null;
  let decayApplied = false;
  if (lastEventDate) {
    const daysSince = daysBetween(lastEventDate, now);
    if (daysSince > 30) {
      finalScore = Math.round(finalScore * timeDecay(daysSince - 30, 0.01));
      decayApplied = true;
    }
  }

  const timelineMap = new Map<string, { score: number; count: number }>();
  for (const evt of events) {
    if (!evt.occurred_at) continue;
    const day = new Date(evt.occurred_at).toISOString().split("T")[0];
    const existing = timelineMap.get(day) || { score: 0, count: 0 };
    existing.score += sevWeights[evt.severity] || 3;
    existing.count++;
    timelineMap.set(day, existing);
  }
  const historicalTrend = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { score, count }]) => ({
      date,
      score: Math.min(100, Math.round(score / Math.max(count, 1) * 4)),
    }));

  return {
    overallScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    factors,
    topFactors: [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight)).slice(0, 5),
    categoryBreakdown: buildCategoryBreakdown(factors),
    historicalTrend,
    correlationMultiplier: corrMult,
    decayApplied,
  };
}

export async function computeUserRiskScore(pool: Pool, tenantId: number, userName: string, childTenantIds?: number[]): Promise<RiskScoreResult> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const np = `$${allTenantIds.length + 1}`;
  const nameLower = userName.toLowerCase().trim();
  const now = new Date();

  const [evtRes, emailEvtRes] = await Promise.all([
    pool.query(
      `SELECT severity, event_type, action, occurred_at, log_source, mitre_tactic,
              raw_payload->>'userName' as user_name,
              raw_payload->>'applicationName' as app_name,
              raw_payload->>'service' as service_name,
              raw_payload->>'action' as payload_action,
              raw_payload->>'Upload (Bytes)' as upload_bytes,
              raw_payload->>'webAction' as web_action
       FROM security_events 
       WHERE tenant_id IN (${ph}) 
       AND (raw_payload->>'userName' ILIKE ${np} OR raw_payload->>'user_name' ILIKE ${np} 
            OR LOWER(sender) LIKE '%' || ${np} || '%' OR LOWER(recipient) LIKE '%' || ${np} || '%')
       ORDER BY occurred_at DESC LIMIT 500`,
      [...allTenantIds, nameLower]
    ),
    pool.query(
      `SELECT severity, event_type, action, occurred_at,
              raw_payload->>'emailThreatType' as threat_type,
              raw_payload->>'effectiveAction' as effective_action,
              raw_payload->>'quarantined' as quarantined,
              raw_payload->>'phishingSubCategory' as phishing_sub
       FROM security_events 
       WHERE tenant_id IN (${ph}) AND event_type = 'email'
       AND (LOWER(recipient) LIKE '%' || ${np} || '%')
       ORDER BY occurred_at DESC LIMIT 200`,
      [...allTenantIds, nameLower]
    ),
  ]);

  const events = evtRes.rows;
  const emailEvents = emailEvtRes.rows;
  const factors: RiskFactor[] = [];
  let activeSignals = 0;

  const sevWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  let behaviorScore = 0;
  const recentEvents = events.filter(e => e.occurred_at && daysBetween(new Date(e.occurred_at), now) < 90);
  for (const evt of recentEvents) {
    const days = daysBetween(new Date(evt.occurred_at), now);
    behaviorScore += (sevWeights[evt.severity] || 3) * timeDecay(days);
  }
  const behaviorPct = Math.min(100, (behaviorScore / Math.max(recentEvents.length * 5, 1)) * 25);
  if (behaviorPct > 5) activeSignals++;
  factors.push({
    name: "Identity & Behavior Activity",
    category: "Behavioral Analysis",
    score: Math.round(behaviorPct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(behaviorPct),
    description: `${recentEvents.length} security events in 90 days (${events.filter(e => e.severity === 'critical').length} critical)`,
    severity: getFactorSeverity(behaviorPct),
  });

  const threatEmails = emailEvents.filter(e => e.threat_type && e.threat_type !== "Clean" && e.threat_type !== "Graymail");
  const phishingEmails = threatEmails.filter(e => e.threat_type === "Phishing" || e.phishing_sub);
  const deliveredThreats = threatEmails.filter(e => e.effective_action !== "quarantined" && e.effective_action !== "blocked" && e.quarantined !== "true");
  let emailRiskPct = Math.min(100,
    threatEmails.length * 8 +
    phishingEmails.length * 12 +
    deliveredThreats.length * 20
  );
  if (emailRiskPct > 5) activeSignals++;
  factors.push({
    name: "Email & Phishing Exposure",
    category: "Email Threat",
    score: Math.round(emailRiskPct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(emailRiskPct),
    description: `${threatEmails.length} threat emails received (${phishingEmails.length} phishing, ${deliveredThreats.length} delivered)`,
    severity: getFactorSeverity(emailRiskPct),
  });

  const cloudEvents = events.filter(e => e.event_type === "casb" || e.event_type === "sse" || e.event_type === "cloud");
  const uploads = events.filter(e => e.upload_bytes && parseInt(e.upload_bytes) > 0);
  const totalUploadMB = uploads.reduce((sum, e) => sum + (parseInt(e.upload_bytes) || 0), 0) / (1024 * 1024);
  const uniqueServices = new Set(cloudEvents.map(e => e.app_name || e.service_name).filter(Boolean));
  let cloudPct = Math.min(100,
    cloudEvents.length * 2 +
    (totalUploadMB > 100 ? 30 : totalUploadMB > 10 ? 15 : 5) +
    uniqueServices.size * 5
  );
  if (cloudPct > 10) activeSignals++;
  factors.push({
    name: "Cloud & SaaS Activity",
    category: "Exposure",
    score: Math.round(cloudPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(cloudPct),
    description: `${cloudEvents.length} cloud events, ${uniqueServices.size} services, ${Math.round(totalUploadMB)}MB uploaded`,
    severity: getFactorSeverity(cloudPct),
  });

  const mitreTactics = new Set(events.filter(e => e.mitre_tactic).map(e => e.mitre_tactic.split(",")[0]?.trim()));
  const advancedTactics = ["Credential Access", "Privilege Escalation", "Lateral Movement", "Exfiltration"];
  const advancedCount = advancedTactics.filter(t => mitreTactics.has(t)).length;
  const privilegePct = Math.min(100, advancedCount * 25 + mitreTactics.size * 8);
  if (privilegePct > 10) activeSignals++;
  factors.push({
    name: "Privilege & Access Risk",
    category: "Privilege",
    score: Math.round(privilegePct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(privilegePct),
    description: `${mitreTactics.size} MITRE tactics${advancedCount > 0 ? ` (${advancedCount} privilege-related)` : ""}`,
    severity: getFactorSeverity(privilegePct),
  });

  const logSources = new Set(events.map(e => e.log_source).filter(Boolean));
  const hasEndpointCoverage = Array.from(logSources).some(s => /edr|xdr|cortex|cynet|trellix/i.test(s || ""));
  const hasEmailCoverage = Array.from(logSources).some(s => /email|harmony|checkpoint/i.test(s || ""));
  let deviceHygienePct = 0;
  if (!hasEndpointCoverage) deviceHygienePct += 40;
  if (!hasEmailCoverage) deviceHygienePct += 30;
  if (logSources.size < 2) deviceHygienePct += 30;
  deviceHygienePct = Math.min(100, deviceHygienePct);
  if (deviceHygienePct > 20) activeSignals++;
  factors.push({
    name: "Device & Endpoint Hygiene",
    category: "Control Gaps",
    score: Math.round(deviceHygienePct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(deviceHygienePct),
    description: `${hasEndpointCoverage ? "Endpoint protected" : "No endpoint protection"}${hasEmailCoverage ? ", Email secured" : ", No email security"}`,
    severity: getFactorSeverity(deviceHygienePct),
  });

  const corrMult = correlationMultiplier(activeSignals);
  let rawScore = 0;
  let totalWeight = 0;
  for (const f of factors) {
    rawScore += f.score * f.weight;
    totalWeight += f.weight;
  }
  rawScore = totalWeight > 0 ? rawScore / totalWeight : 0;
  let finalScore = Math.min(100, Math.round(rawScore * corrMult));

  const lastEvent = events[0]?.occurred_at ? new Date(events[0].occurred_at) : null;
  let decayApplied = false;
  if (lastEvent) {
    const daysSince = daysBetween(lastEvent, now);
    if (daysSince > 30) {
      finalScore = Math.round(finalScore * timeDecay(daysSince - 30, 0.01));
      decayApplied = true;
    }
  }

  const timelineMap = new Map<string, number>();
  for (const evt of events) {
    if (!evt.occurred_at) continue;
    const day = new Date(evt.occurred_at).toISOString().split("T")[0];
    timelineMap.set(day, (timelineMap.get(day) || 0) + (sevWeights[evt.severity] || 3));
  }
  const historicalTrend = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, score]) => ({ date, score: Math.min(100, Math.round(score * 2)) }));

  return {
    overallScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    factors,
    topFactors: [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight)).slice(0, 5),
    categoryBreakdown: buildCategoryBreakdown(factors),
    historicalTrend,
    correlationMultiplier: corrMult,
    decayApplied,
  };
}

export async function computeEmailRiskScore(pool: Pool, tenantId: number, emailAddr: string, childTenantIds?: number[]): Promise<RiskScoreResult> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const np = `$${allTenantIds.length + 1}`;
  const emailLower = emailAddr.toLowerCase().trim();
  const now = new Date();

  const evtRes = await pool.query(
    `SELECT severity, event_type, action, occurred_at, log_source,
            raw_payload->>'emailThreatType' as threat_type,
            raw_payload->>'effectiveAction' as effective_action,
            raw_payload->>'quarantined' as quarantined,
            raw_payload->>'phishingSubCategory' as phishing_sub,
            raw_payload->>'spfResult' as spf_result,
            raw_payload->>'dkimResult' as dkim_result,
            raw_payload->>'dmarcResult' as dmarc_result,
            raw_payload->>'senderDomain' as sender_domain,
            raw_payload->>'subject' as subject
     FROM security_events 
     WHERE tenant_id IN (${ph}) AND (LOWER(sender) = ${np} OR LOWER(recipient) LIKE '%' || ${np} || '%')
     ORDER BY occurred_at DESC LIMIT 500`,
    [...allTenantIds, emailLower]
  );

  const events = evtRes.rows;
  const sentEvents = events.filter(e => (e.sender || "").toLowerCase().trim() === emailLower);
  const receivedEvents = events.filter(e => (e.recipient || "").toLowerCase().includes(emailLower));
  const factors: RiskFactor[] = [];
  let activeSignals = 0;

  const threatEvents = sentEvents.filter(e => e.threat_type && e.threat_type !== "Clean" && e.threat_type !== "Graymail");
  const totalSent = Math.max(sentEvents.length, 1);
  const threatRatio = threatEvents.length / totalSent;
  const reputationPct = Math.min(100, Math.round(threatRatio * 100 * 2.5));
  if (reputationPct > 5) activeSignals++;
  factors.push({
    name: "External Reputation",
    category: "Threat Intelligence",
    score: Math.round(reputationPct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(reputationPct),
    description: `${threatEvents.length}/${sentEvents.length} sent emails flagged as threats (${Math.round(threatRatio * 100)}% threat ratio)`,
    severity: getFactorSeverity(reputationPct),
  });

  const spfFail = sentEvents.filter(e => e.spf_result && (e.spf_result.toLowerCase() === "fail" || e.spf_result.toLowerCase() === "softfail")).length;
  const dkimFail = sentEvents.filter(e => e.dkim_result && e.dkim_result.toLowerCase() === "fail").length;
  const dmarcFail = sentEvents.filter(e => e.dmarc_result && e.dmarc_result.toLowerCase() === "fail").length;
  const authFailPct = Math.min(100,
    (spfFail / totalSent) * 40 * 100 +
    (dkimFail / totalSent) * 30 * 100 +
    (dmarcFail / totalSent) * 30 * 100
  );
  if (authFailPct > 10) activeSignals++;
  factors.push({
    name: "Email Authentication (SPF/DKIM/DMARC)",
    category: "Email Authentication",
    score: Math.round(authFailPct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(authFailPct),
    description: `SPF fail: ${spfFail}, DKIM fail: ${dkimFail}, DMARC fail: ${dmarcFail}`,
    severity: getFactorSeverity(authFailPct),
  });

  const phishingEvents = sentEvents.filter(e => e.threat_type === "Phishing" || e.phishing_sub);
  const malwareEvents = sentEvents.filter(e => e.threat_type === "Malware");
  const becEvents = sentEvents.filter(e => e.threat_type === "BEC");
  const spamEvents = sentEvents.filter(e => e.threat_type === "Spam");
  const contentPct = Math.min(100,
    phishingEvents.length * 20 +
    malwareEvents.length * 25 +
    becEvents.length * 30 +
    spamEvents.length * 5
  );
  if (contentPct > 5) activeSignals++;
  factors.push({
    name: "Content & Spoofing Indicators",
    category: "Content Analysis",
    score: Math.round(contentPct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(contentPct),
    description: `Phishing: ${phishingEvents.length}, Malware: ${malwareEvents.length}, BEC: ${becEvents.length}, Spam: ${spamEvents.length}`,
    severity: getFactorSeverity(contentPct),
  });

  const receivedThreats = receivedEvents.filter(e => e.threat_type && e.threat_type !== "Clean" && e.threat_type !== "Graymail");
  const deliveredThreats = receivedThreats.filter(e => e.effective_action !== "quarantined" && e.effective_action !== "blocked" && e.quarantined !== "true");
  const interactionPct = Math.min(100,
    receivedThreats.length * 5 +
    deliveredThreats.length * 15
  );
  if (interactionPct > 5) activeSignals++;
  factors.push({
    name: "User Interaction & Exposure",
    category: "Exposure",
    score: Math.round(interactionPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(interactionPct),
    description: `${receivedThreats.length} threats received, ${deliveredThreats.length} delivered to inbox`,
    severity: getFactorSeverity(interactionPct),
  });

  const domain = emailLower.split("@")[1] || "";
  const domainEvts = await pool.query(
    `SELECT COUNT(*) as cnt FROM security_events 
     WHERE tenant_id IN (${ph}) AND event_type = 'email'
     AND LOWER(sender) LIKE '%@' || ${np}
     AND raw_payload->>'emailThreatType' IS NOT NULL 
     AND raw_payload->>'emailThreatType' != 'Clean' AND raw_payload->>'emailThreatType' != 'Graymail'`,
    [...allTenantIds, domain]
  );
  const domainThreatCount = parseInt(domainEvts.rows[0]?.cnt || "0");
  const domainPct = Math.min(100, domainThreatCount * 3);
  if (domainPct > 10) activeSignals++;
  factors.push({
    name: "Domain Reputation",
    category: "Threat Intelligence",
    score: Math.round(domainPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(domainPct),
    description: `${domainThreatCount} threat emails from domain ${domain}`,
    severity: getFactorSeverity(domainPct),
  });

  const corrMult = correlationMultiplier(activeSignals);
  let rawScore = 0;
  let totalWeight = 0;
  for (const f of factors) {
    rawScore += f.score * f.weight;
    totalWeight += f.weight;
  }
  rawScore = totalWeight > 0 ? rawScore / totalWeight : 0;
  let finalScore = Math.min(100, Math.round(rawScore * corrMult));

  const lastEvent = events[0]?.occurred_at ? new Date(events[0].occurred_at) : null;
  let decayApplied = false;
  if (lastEvent) {
    const daysSince = daysBetween(lastEvent, now);
    if (daysSince > 30) {
      finalScore = Math.round(finalScore * timeDecay(daysSince - 30, 0.01));
      decayApplied = true;
    }
  }

  const sevWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  const timelineMap = new Map<string, number>();
  for (const evt of events) {
    if (!evt.occurred_at) continue;
    const day = new Date(evt.occurred_at).toISOString().split("T")[0];
    timelineMap.set(day, (timelineMap.get(day) || 0) + (sevWeights[evt.severity] || 3));
  }

  return {
    overallScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    factors,
    topFactors: [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight)).slice(0, 5),
    categoryBreakdown: buildCategoryBreakdown(factors),
    historicalTrend: Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, score]) => ({ date, score: Math.min(100, Math.round(score * 2)) })),
    correlationMultiplier: corrMult,
    decayApplied,
  };
}

export async function computeApplicationRiskScore(pool: Pool, tenantId: number, appName: string, childTenantIds?: number[]): Promise<RiskScoreResult> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const np = `$${allTenantIds.length + 1}`;
  const appLower = appName.toLowerCase().trim();
  const now = new Date();

  const [evtRes, cloudRiskRes] = await Promise.all([
    pool.query(
      `SELECT severity, event_type, action, occurred_at, log_source,
              raw_payload->>'Upload (Bytes)' as upload_bytes,
              raw_payload->>'Download (Bytes)' as download_bytes,
              raw_payload->>'userName' as user_name,
              raw_payload->>'webAction' as web_action
       FROM security_events 
       WHERE tenant_id IN (${ph}) 
       AND (raw_payload->>'applicationName' ILIKE ${np}
            OR raw_payload->>'service' ILIKE ${np}
            OR raw_payload->>'Service Name' ILIKE ${np}
            OR raw_payload->>'app_name' ILIKE ${np}
            OR raw_payload->>'Application' ILIKE ${np}
            OR raw_payload->>'Cloud Provider' ILIKE ${np})
       ORDER BY occurred_at DESC LIMIT 500`,
      [...allTenantIds, appLower]
    ),
    pool.query(
      `SELECT * FROM cloud_app_risk_scores WHERE tenant_id IN (${ph}) AND LOWER(app_name) = ${np} LIMIT 1`,
      [...allTenantIds, appLower]
    ),
  ]);

  const events = evtRes.rows;
  const cloudRisk = cloudRiskRes.rows[0];
  const factors: RiskFactor[] = [];
  let activeSignals = 0;

  if (cloudRisk && cloudRisk.factor_scores) {
    const fs = cloudRisk.factor_scores;
    const maxCI = 100;
    const ciScore = cloudRisk.confidence_index || 0;
    const ciPct = Math.round((ciScore / maxCI) * 100);
    factors.push({
      name: "Cloud Risk Classification",
      category: "Cloud Risk",
      score: ciPct,
      maxScore: 100,
      weight: 0.30,
      percentage: ciPct,
      description: `${cloudRisk.risk_classification || "Unknown"} risk (Confidence Index: ${ciScore})`,
      severity: getFactorSeverity(ciPct),
    });
    if (ciPct > 10) activeSignals++;

    if (typeof fs === "object") {
      const cloudFactors = Object.entries(fs).slice(0, 5);
      for (const [key, val] of cloudFactors) {
        const v = typeof val === "number" ? val : parseInt(String(val)) || 0;
        factors.push({
          name: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          category: "Cloud Risk",
          score: Math.round(v * 10),
          maxScore: 100,
          weight: 0.05,
          percentage: Math.round(v * 10),
          description: `Factor score: ${v}/10`,
          severity: getFactorSeverity(v * 10),
        });
      }
    }
  }

  const sevWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  const recentEvents = events.filter(e => e.occurred_at && daysBetween(new Date(e.occurred_at), now) < 90);
  let activityScore = 0;
  for (const evt of recentEvents) {
    activityScore += sevWeights[evt.severity] || 3;
  }
  const activityPct = Math.min(100, (activityScore / Math.max(recentEvents.length * 5, 1)) * 25);
  if (activityPct > 5) activeSignals++;
  factors.push({
    name: "Activity Volume & Severity",
    category: "Behavioral Analysis",
    score: Math.round(activityPct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(activityPct),
    description: `${recentEvents.length} events in 90 days (${events.filter(e => e.severity === 'critical').length} critical)`,
    severity: getFactorSeverity(activityPct),
  });

  const users = new Set(events.map(e => e.user_name).filter(Boolean));
  const totalUpload = events.reduce((s, e) => s + (parseInt(e.upload_bytes) || 0), 0) / (1024 * 1024);
  const totalDownload = events.reduce((s, e) => s + (parseInt(e.download_bytes) || 0), 0) / (1024 * 1024);
  let dataExposurePct = Math.min(100,
    users.size * 3 +
    (totalUpload > 500 ? 40 : totalUpload > 100 ? 25 : totalUpload > 10 ? 10 : 0) +
    (totalDownload > 1000 ? 20 : totalDownload > 100 ? 10 : 0)
  );
  if (dataExposurePct > 10) activeSignals++;
  factors.push({
    name: "Data Exposure & User Adoption",
    category: "Exposure",
    score: Math.round(dataExposurePct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(dataExposurePct),
    description: `${users.size} users, ${Math.round(totalUpload)}MB uploaded, ${Math.round(totalDownload)}MB downloaded`,
    severity: getFactorSeverity(dataExposurePct),
  });

  const deniedActions = events.filter(e => e.action === "blocked" || e.action === "denied" || e.web_action === "blocked");
  const deniedPct = events.length > 0 ? Math.min(100, Math.round((deniedActions.length / events.length) * 100 * 2)) : 0;
  factors.push({
    name: "Policy Violations",
    category: "Control Gaps",
    score: Math.round(deniedPct),
    maxScore: 100,
    weight: 0.15,
    percentage: Math.round(deniedPct),
    description: `${deniedActions.length}/${events.length} actions blocked/denied`,
    severity: getFactorSeverity(deniedPct),
  });

  const corrMult = correlationMultiplier(activeSignals);
  let rawScore = 0;
  let totalWeight = 0;
  for (const f of factors) {
    rawScore += f.score * f.weight;
    totalWeight += f.weight;
  }
  rawScore = totalWeight > 0 ? rawScore / totalWeight : 0;
  let finalScore = Math.min(100, Math.round(rawScore * corrMult));

  const lastEvent = events[0]?.occurred_at ? new Date(events[0].occurred_at) : null;
  let decayApplied = false;
  if (lastEvent) {
    const daysSince = daysBetween(lastEvent, now);
    if (daysSince > 30) {
      finalScore = Math.round(finalScore * timeDecay(daysSince - 30, 0.01));
      decayApplied = true;
    }
  }

  const timelineMap = new Map<string, number>();
  for (const evt of events) {
    if (!evt.occurred_at) continue;
    const day = new Date(evt.occurred_at).toISOString().split("T")[0];
    timelineMap.set(day, (timelineMap.get(day) || 0) + (sevWeights[evt.severity] || 3));
  }

  return {
    overallScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    factors,
    topFactors: [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight)).slice(0, 5),
    categoryBreakdown: buildCategoryBreakdown(factors),
    historicalTrend: Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, score]) => ({ date, score: Math.min(100, Math.round(score * 2)) })),
    correlationMultiplier: corrMult,
    decayApplied,
  };
}

export async function computeDomainRiskScore(pool: Pool, tenantId: number, domainName: string, childTenantIds?: number[]): Promise<RiskScoreResult> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const np = `$${allTenantIds.length + 1}`;
  const domainLower = domainName.toLowerCase().trim();
  const now = new Date();

  const evtRes = await pool.query(
    `SELECT severity, event_type, action, occurred_at, log_source,
            raw_payload->>'emailThreatType' as threat_type,
            raw_payload->>'spfResult' as spf_result,
            raw_payload->>'dkimResult' as dkim_result,
            raw_payload->>'dmarcResult' as dmarc_result,
            raw_payload->>'phishingSubCategory' as phishing_sub,
            sender, recipient
     FROM security_events 
     WHERE tenant_id IN (${ph}) AND event_type = 'email'
     AND (LOWER(sender) LIKE '%@' || ${np} OR LOWER(recipient) LIKE '%@' || ${np})
     ORDER BY occurred_at DESC LIMIT 500`,
    [...allTenantIds, domainLower]
  );

  const events = evtRes.rows;
  const sentFromDomain = events.filter(e => (e.sender || "").toLowerCase().includes(`@${domainLower}`));
  const factors: RiskFactor[] = [];
  let activeSignals = 0;

  const threatsSent = sentFromDomain.filter(e => e.threat_type && e.threat_type !== "Clean" && e.threat_type !== "Graymail");
  const totalSent = Math.max(sentFromDomain.length, 1);
  const threatRatio = threatsSent.length / totalSent;
  const domainRepPct = Math.min(100, Math.round(threatRatio * 100 * 3));
  if (domainRepPct > 5) activeSignals++;
  factors.push({
    name: "Domain Threat Intelligence",
    category: "Threat Intelligence",
    score: domainRepPct,
    maxScore: 100,
    weight: 0.30,
    percentage: domainRepPct,
    description: `${threatsSent.length}/${sentFromDomain.length} emails flagged as threats (${Math.round(threatRatio * 100)}%)`,
    severity: getFactorSeverity(domainRepPct),
  });

  const spfFails = sentFromDomain.filter(e => e.spf_result && (e.spf_result.toLowerCase() === "fail" || e.spf_result.toLowerCase() === "softfail")).length;
  const dkimFails = sentFromDomain.filter(e => e.dkim_result && e.dkim_result.toLowerCase() === "fail").length;
  const dmarcFails = sentFromDomain.filter(e => e.dmarc_result && e.dmarc_result.toLowerCase() === "fail").length;
  const authPct = Math.min(100,
    (spfFails / totalSent) * 120 +
    (dkimFails / totalSent) * 100 +
    (dmarcFails / totalSent) * 100
  );
  if (authPct > 10) activeSignals++;
  factors.push({
    name: "Email Authentication Health",
    category: "Email Authentication",
    score: Math.round(authPct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(authPct),
    description: `SPF fail: ${spfFails}, DKIM fail: ${dkimFails}, DMARC fail: ${dmarcFails} out of ${sentFromDomain.length}`,
    severity: getFactorSeverity(authPct),
  });

  const phishingFromDomain = sentFromDomain.filter(e => e.threat_type === "Phishing" || e.phishing_sub);
  const becFromDomain = sentFromDomain.filter(e => e.threat_type === "BEC");
  const malwareFromDomain = sentFromDomain.filter(e => e.threat_type === "Malware");
  const abusePct = Math.min(100,
    phishingFromDomain.length * 15 +
    becFromDomain.length * 25 +
    malwareFromDomain.length * 20
  );
  if (abusePct > 5) activeSignals++;
  factors.push({
    name: "Brand Abuse & Impersonation",
    category: "Content Analysis",
    score: Math.round(abusePct),
    maxScore: 100,
    weight: 0.25,
    percentage: Math.round(abusePct),
    description: `Phishing: ${phishingFromDomain.length}, BEC: ${becFromDomain.length}, Malware: ${malwareFromDomain.length}`,
    severity: getFactorSeverity(abusePct),
  });

  const uniqueSenders = new Set(sentFromDomain.map(e => (e.sender || "").toLowerCase()).filter(Boolean));
  const uniqueRecipients = new Set(events.filter(e => (e.recipient || "").toLowerCase().includes(`@${domainLower}`)).map(e => e.recipient).filter(Boolean));
  const infraPct = Math.min(100,
    uniqueSenders.size * 5 +
    (events.length > 100 ? 30 : events.length > 50 ? 20 : events.length > 10 ? 10 : 0)
  );
  factors.push({
    name: "Infrastructure & Volume Analysis",
    category: "Exposure",
    score: Math.round(infraPct),
    maxScore: 100,
    weight: 0.20,
    percentage: Math.round(infraPct),
    description: `${uniqueSenders.size} senders, ${uniqueRecipients.size} recipients, ${events.length} total emails`,
    severity: getFactorSeverity(infraPct),
  });

  const corrMult = correlationMultiplier(activeSignals);
  let rawScore = 0;
  let totalWeight = 0;
  for (const f of factors) {
    rawScore += f.score * f.weight;
    totalWeight += f.weight;
  }
  rawScore = totalWeight > 0 ? rawScore / totalWeight : 0;
  let finalScore = Math.min(100, Math.round(rawScore * corrMult));

  const lastEvent = events[0]?.occurred_at ? new Date(events[0].occurred_at) : null;
  let decayApplied = false;
  if (lastEvent) {
    const daysSince = daysBetween(lastEvent, now);
    if (daysSince > 30) {
      finalScore = Math.round(finalScore * timeDecay(daysSince - 30, 0.01));
      decayApplied = true;
    }
  }

  const timelineMap = new Map<string, number>();
  const sevWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  for (const evt of events) {
    if (!evt.occurred_at) continue;
    const day = new Date(evt.occurred_at).toISOString().split("T")[0];
    timelineMap.set(day, (timelineMap.get(day) || 0) + (sevWeights[evt.severity] || 3));
  }

  return {
    overallScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    factors,
    topFactors: [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight)).slice(0, 5),
    categoryBreakdown: buildCategoryBreakdown(factors),
    historicalTrend: Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, score]) => ({ date, score: Math.min(100, Math.round(score * 2)) })),
    correlationMultiplier: corrMult,
    decayApplied,
  };
}

export async function searchEntities(pool: Pool, tenantId: number, query: string, childTenantIds?: number[]): Promise<any> {
  const allTenantIds = childTenantIds ? [tenantId, ...childTenantIds] : [tenantId];
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const searchParam = `$${allTenantIds.length + 1}`;
  const searchLower = `%${query.toLowerCase().trim()}%`;

  const [hostRes, userRes, emailRes, appRes] = await Promise.all([
    pool.query(
      `SELECT DISTINCT LOWER(asset) as name, 'host' as entity_type, COUNT(*) as event_count,
              MAX(severity) as max_severity, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events 
       WHERE tenant_id IN (${ph}) AND LOWER(asset) LIKE ${searchParam} AND asset IS NOT NULL AND LENGTH(asset) > 1
       GROUP BY LOWER(asset)
       ORDER BY event_count DESC LIMIT 20`,
      [...allTenantIds, searchLower]
    ),
    pool.query(
      `SELECT DISTINCT LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name')) as name,
              'user' as entity_type, COUNT(*) as event_count,
              MAX(severity) as max_severity, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events 
       WHERE tenant_id IN (${ph}) 
       AND (raw_payload->>'userName' ILIKE ${searchParam} OR raw_payload->>'user_name' ILIKE ${searchParam})
       AND COALESCE(raw_payload->>'userName', raw_payload->>'user_name') IS NOT NULL
       GROUP BY LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name'))
       ORDER BY event_count DESC LIMIT 20`,
      [...allTenantIds, searchLower]
    ),
    pool.query(
      `SELECT DISTINCT LOWER(sender) as name, 'email' as entity_type, COUNT(*) as event_count,
              MAX(severity) as max_severity, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events 
       WHERE tenant_id IN (${ph}) AND event_type = 'email' AND LOWER(sender) LIKE ${searchParam} AND sender IS NOT NULL
       GROUP BY LOWER(sender)
       UNION
       SELECT DISTINCT LOWER(recipient) as name, 'email' as entity_type, COUNT(*) as event_count,
              MAX(severity) as max_severity, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events 
       WHERE tenant_id IN (${ph}) AND event_type = 'email' AND LOWER(recipient) LIKE ${searchParam} AND recipient IS NOT NULL
       GROUP BY LOWER(recipient)
       ORDER BY event_count DESC LIMIT 20`,
      [...allTenantIds, searchLower]
    ),
    pool.query(
      `SELECT DISTINCT COALESCE(raw_payload->>'applicationName', raw_payload->>'service', raw_payload->>'Service Name') as name,
              'application' as entity_type, COUNT(*) as event_count,
              MAX(severity) as max_severity, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events 
       WHERE tenant_id IN (${ph}) 
       AND (raw_payload->>'applicationName' ILIKE ${searchParam}
            OR raw_payload->>'service' ILIKE ${searchParam}
            OR raw_payload->>'Service Name' ILIKE ${searchParam})
       GROUP BY COALESCE(raw_payload->>'applicationName', raw_payload->>'service', raw_payload->>'Service Name')
       HAVING COALESCE(raw_payload->>'applicationName', raw_payload->>'service', raw_payload->>'Service Name') IS NOT NULL
       ORDER BY event_count DESC LIMIT 20`,
      [...allTenantIds, searchLower]
    ),
  ]);

  const results = [
    ...hostRes.rows.filter(r => r.name),
    ...userRes.rows.filter(r => r.name),
    ...emailRes.rows.filter(r => r.name && r.name.includes("@")),
    ...appRes.rows.filter(r => r.name),
  ];

  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const key = `${r.entity_type}:${r.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => parseInt(b.event_count) - parseInt(a.event_count)).slice(0, 50);
}
