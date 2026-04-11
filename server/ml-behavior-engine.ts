import { Pool } from "pg";

const BEHAVIORAL_DIMENSIONS = [
  "eventVolume",
  "criticalEventRate",
  "distinctEventTypes",
  "distinctLogSources",
  "distinctTactics",
  "offHoursActivity",
  "temporalPatternDeviation",
  "loginDayVariance",
  "failedAuthRate",
  "privilegeEvents",
  "lateralMovement",
  "dataEgressVolume",
  "newResourceAccess",
  "geoVariety",
  "peerDeviation",
] as const;

export type BehavioralDimension = (typeof BEHAVIORAL_DIMENSIONS)[number];

export interface DimensionScore {
  key: BehavioralDimension;
  label: string;
  value: number;
  baseline: number;
  zScore: number;
  percentile: number;
  triggered: boolean;
  severity: "low" | "medium" | "high" | "critical";
}

export interface MLAnomalyResult {
  entityName: string;
  entityType: string;
  confidenceScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical" | "severe";
  triggeredDimensions: DimensionScore[];
  behavioralFingerprint: RadarPoint[];
  peerComparison: PeerComparisonResult;
  temporalAnomalies: TemporalAnomaly[];
  anomalyId?: number;
  markedExpected?: boolean;
  escalatedToIncident?: boolean;
}

export interface RadarPoint {
  dimension: string;
  current: number;
  normal: number;
}

export interface PeerComparisonResult {
  peerGroupSize: number;
  deviations: Array<{
    dimension: string;
    entityValue: number;
    peerMean: number;
    multiplier: number;
    direction: "above" | "below";
    description: string;
  }>;
  overallPeerRank: number;
}

export interface TemporalAnomaly {
  type: "off_hours" | "weekend" | "unusual_hour" | "burst" | "temporal_matrix";
  description: string;
  hour?: number;
  dayOfWeek?: number;
}

const DIMENSION_LABELS: Record<BehavioralDimension, string> = {
  eventVolume: "Event Volume",
  criticalEventRate: "Critical Event Rate",
  distinctEventTypes: "Event Type Diversity",
  distinctLogSources: "Log Source Spread",
  distinctTactics: "MITRE Tactic Count",
  offHoursActivity: "Off-Hours Activity",
  temporalPatternDeviation: "Temporal Pattern",
  loginDayVariance: "Day-of-Week Variance",
  failedAuthRate: "Failed Auth Rate",
  privilegeEvents: "Privilege Events",
  lateralMovement: "Lateral Movement",
  dataEgressVolume: "Data Egress Volume",
  newResourceAccess: "New Resource Access",
  geoVariety: "Geographic Variety",
  peerDeviation: "Peer Deviation",
};

function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev < 0.001) return 0;
  return (value - mean) / stdDev;
}

function zScoreToPercentile(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = 1 - 0.3989422803 * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? phi * 100 : (1 - phi) * 100;
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 1;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.max(0.001, Math.sqrt(variance));
}

function compositeScore(zScores: number[], weights: number[]): number {
  if (zScores.length === 0) return 0;
  const weightedSum = zScores.reduce((s, z, i) => s + Math.abs(z) * (weights[i] || 1), 0);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const rawScore = (weightedSum / totalWeight) * 15;
  return Math.round(Math.min(100, Math.max(0, rawScore)));
}

function computeTemporalPatternDeviation(
  entityEvents: Array<{ hour_of_day: string; day_of_week: string }>,
  tenantHourlyBaseline: Map<string, number>
): number {
  if (entityEvents.length === 0) return 0;
  const entityBuckets = new Map<string, number>();
  for (const e of entityEvents) {
    const key = `${e.day_of_week}-${e.hour_of_day}`;
    entityBuckets.set(key, (entityBuckets.get(key) || 0) + 1);
  }
  let totalDeviation = 0;
  let bucketCount = 0;
  for (const [key, entityCount] of entityBuckets) {
    const tenantExpected = (tenantHourlyBaseline.get(key) || 0);
    const entityFrac = entityCount / entityEvents.length;
    const tenantFrac = tenantExpected;
    totalDeviation += Math.abs(entityFrac - tenantFrac);
    bucketCount++;
  }
  return bucketCount > 0 ? totalDeviation / bucketCount : 0;
}

export async function computeEntityMLScore(
  pool: Pool,
  tenantId: number,
  allTenantIds: number[],
  entityType: string,
  entityName: string,
  options: { preserveTimestamp?: boolean } = {}
): Promise<MLAnomalyResult> {
  const ph = allTenantIds.map((_, i) => `$${i + 1}`).join(",");
  const nameLower = entityName.toLowerCase().trim();

  let whereClause = "";
  if (entityType === "devices") {
    whereClause = `LOWER(asset) = $${allTenantIds.length + 1}`;
  } else if (entityType === "users") {
    whereClause = `(LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name', sender)) = $${allTenantIds.length + 1})`;
  } else if (entityType === "ips") {
    whereClause = `(raw_payload->>'sourceIp' = $${allTenantIds.length + 1} OR raw_payload->>'destinationIp' = $${allTenantIds.length + 1} OR raw_payload->>'attackerIp' = $${allTenantIds.length + 1})`;
  } else {
    whereClause = `(event_type = 'email' AND LOWER(sender) LIKE '%@' || $${allTenantIds.length + 1})`;
  }

  // Scoring window: last 7 days (recent behaviour only, distinct from baseline window)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Peer context / temporal baseline: last 30 days (broad peer context)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let peerGroupByField: string;
  let peerWhereClause: string;
  if (entityType === "devices") {
    peerGroupByField = "LOWER(asset)";
    peerWhereClause = "asset IS NOT NULL AND LENGTH(asset) > 1";
  } else if (entityType === "users") {
    peerGroupByField = "LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name', sender))";
    peerWhereClause = "(raw_payload->>'userName' IS NOT NULL OR raw_payload->>'user_name' IS NOT NULL OR sender IS NOT NULL)";
  } else if (entityType === "ips") {
    peerGroupByField = "COALESCE(NULLIF(raw_payload->>'sourceIp',''), raw_payload->>'attackerIp')";
    peerWhereClause = "(raw_payload->>'sourceIp' IS NOT NULL OR raw_payload->>'attackerIp' IS NOT NULL)";
  } else {
    peerGroupByField = "LOWER(SUBSTRING(sender FROM '@(.+)$'))";
    peerWhereClause = "event_type = 'email' AND sender IS NOT NULL AND sender LIKE '%@%'";
  }

  const [eventsRes, peerEventsRes, storedBaselineRes, storedAnomalyRes, tenantTemporalRes] = await Promise.all([
    pool.query(
      `SELECT severity, event_type, mitre_tactic, log_source, occurred_at, action,
              COALESCE(raw_payload->>'sourceIp', raw_payload->>'src_ip') as src_ip,
              COALESCE(raw_payload->>'destinationIp', raw_payload->>'dst_ip') as dst_ip,
              EXTRACT(HOUR FROM occurred_at)::text as hour_of_day,
              EXTRACT(DOW FROM occurred_at)::text as day_of_week
       FROM security_events
       WHERE tenant_id IN (${ph}) AND ${whereClause}
         AND occurred_at >= $${allTenantIds.length + 2}
       ORDER BY occurred_at DESC LIMIT 500`,
      [...allTenantIds, nameLower, sevenDaysAgo]
    ),
    pool.query(
      `SELECT ${peerGroupByField} as entity_name,
              COUNT(*) as evt_count,
              COUNT(CASE WHEN severity IN ('critical','high') THEN 1 END) as critical_count,
              COUNT(DISTINCT event_type) as event_types,
              COUNT(DISTINCT log_source) as log_sources,
              COUNT(DISTINCT mitre_tactic) as tactics,
              COUNT(CASE WHEN EXTRACT(HOUR FROM occurred_at) < 6 OR EXTRACT(HOUR FROM occurred_at) >= 22 THEN 1 END) as off_hours,
              COALESCE(STDDEV(EXTRACT(DOW FROM occurred_at)), 0) as day_variance
       FROM security_events
       WHERE tenant_id IN (${ph}) AND ${peerWhereClause}
         AND occurred_at >= $${allTenantIds.length + 1}
       GROUP BY ${peerGroupByField}
       HAVING COUNT(*) >= 5 AND ${peerGroupByField} IS NOT NULL AND LENGTH(${peerGroupByField}) > 0`,
      [...allTenantIds, thirtyDaysAgo]
    ),
    pool.query(
      `SELECT dimension_key, baseline_mean, baseline_std_dev, peer_group_mean, peer_group_std_dev, sample_count
       FROM behavioral_baselines
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_name = $3`,
      [tenantId, entityType, nameLower]
    ),
    pool.query(
      `SELECT id, confidence_score, marked_expected, escalated_to_incident, dimensions
       FROM behavior_anomalies
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_name = $3
       ORDER BY occurred_at DESC LIMIT 1`,
      [tenantId, entityType, nameLower]
    ),
    pool.query(
      `SELECT EXTRACT(DOW FROM occurred_at)::text as dow,
              EXTRACT(HOUR FROM occurred_at)::text as hour,
              COUNT(*)::float as cnt
       FROM security_events
       WHERE tenant_id IN (${ph}) AND occurred_at >= $${allTenantIds.length + 1}
       GROUP BY dow, hour`,
      [...allTenantIds, thirtyDaysAgo]
    ),
  ]);

  const events = eventsRes.rows;
  const peerEntities = peerEventsRes.rows;
  const storedBaselines = storedBaselineRes.rows;
  const latestAnomaly = storedAnomalyRes.rows[0] || null;

  const tenantHourlyBaseline = new Map<string, number>();
  const tenantTotalEvents = tenantTemporalRes.rows.reduce((s: number, r: any) => s + parseFloat(r.cnt), 0);
  if (tenantTotalEvents > 0) {
    for (const r of tenantTemporalRes.rows) {
      tenantHourlyBaseline.set(`${r.dow}-${r.hour}`, parseFloat(r.cnt) / tenantTotalEvents);
    }
  }

  // Scoring window is 7 days; normalize all count-based dimensions to per-day rates
  // so they are directly comparable to baseline values (also stored as per-day rates).
  const SCORING_DAYS = 7;
  const totalEvents = events.length;
  const criticalEvents = events.filter((e: any) => e.severity === "critical" || e.severity === "high").length;
  const distinctEventTypes = new Set(events.map((e: any) => e.event_type).filter(Boolean)).size;
  const distinctLogSources = new Set(events.map((e: any) => e.log_source).filter(Boolean)).size;
  const distinctTactics = new Set(events.filter((e: any) => e.mitre_tactic).flatMap((e: any) => e.mitre_tactic.split(",").map((t: string) => t.trim())).filter(Boolean)).size;
  const offHoursCount = events.filter((e: any) => {
    const h = parseInt(e.hour_of_day);
    return h < 6 || h >= 22;
  }).length;
  const failedAuthCount = events.filter((e: any) => e.action === "failed" || e.event_type === "failed_auth").length;
  const privilegeCount = events.filter((e: any) => e.event_type === "privilege_escalation" || (e.mitre_tactic && e.mitre_tactic.includes("Privilege"))).length;
  const lateralCount = events.filter((e: any) => e.event_type === "lateral_movement" || (e.mitre_tactic && e.mitre_tactic.includes("Lateral"))).length;
  const distinctDstIps = new Set(events.map((e: any) => e.dst_ip).filter(Boolean)).size;
  const dayVariance = computeStdDev(events.map((e: any) => parseInt(e.day_of_week || "1")), 3);
  const temporalDeviation = computeTemporalPatternDeviation(events, tenantHourlyBaseline);

  const entityDimensions: Record<BehavioralDimension, number> = {
    // Per-day rates (comparable to 30-day baseline per-day rates)
    eventVolume: totalEvents / SCORING_DAYS,
    criticalEventRate: totalEvents > 0 ? criticalEvents / totalEvents : 0,
    distinctEventTypes: distinctEventTypes / SCORING_DAYS,
    distinctLogSources: distinctLogSources / SCORING_DAYS,
    distinctTactics: distinctTactics / SCORING_DAYS,
    offHoursActivity: totalEvents > 0 ? offHoursCount / totalEvents : 0,
    temporalPatternDeviation: temporalDeviation,
    loginDayVariance: dayVariance,
    failedAuthRate: totalEvents > 0 ? failedAuthCount / totalEvents : 0,
    privilegeEvents: privilegeCount / SCORING_DAYS,
    lateralMovement: lateralCount / SCORING_DAYS,
    dataEgressVolume: distinctDstIps / SCORING_DAYS,
    newResourceAccess: (distinctEventTypes + distinctLogSources) / SCORING_DAYS,
    geoVariety: distinctDstIps / SCORING_DAYS,
    peerDeviation: 0,
  };

  const peerValues = Object.fromEntries(
    BEHAVIORAL_DIMENSIONS.map(dim => [dim, [] as number[]])
  ) as Record<BehavioralDimension, number[]>;

  for (const peer of peerEntities) {
    const evtCount = parseInt(peer.evt_count) || 0;
    const critCount = parseInt(peer.critical_count) || 0;
    const evtTypes = parseInt(peer.event_types) || 0;
    const logSrc = parseInt(peer.log_sources) || 0;
    const tactics = parseInt(peer.tactics) || 0;
    const offH = parseInt(peer.off_hours) || 0;
    const dayVar = parseFloat(peer.day_variance) || 0;

    // Normalize to per-day rates (same unit as scoring entity dimensions)
    peerValues.eventVolume.push(evtCount / SCORING_DAYS);
    peerValues.criticalEventRate.push(evtCount > 0 ? critCount / evtCount : 0);
    peerValues.distinctEventTypes.push(evtTypes / SCORING_DAYS);
    peerValues.distinctLogSources.push(logSrc / SCORING_DAYS);
    peerValues.distinctTactics.push(tactics / SCORING_DAYS);
    peerValues.offHoursActivity.push(evtCount > 0 ? offH / evtCount : 0);
    peerValues.loginDayVariance.push(dayVar);
  }

  const baselineMap: Record<string, { mean: number; stdDev: number; peerMean: number; peerStdDev: number }> = {};
  for (const row of storedBaselines) {
    baselineMap[row.dimension_key] = {
      mean: parseFloat(row.baseline_mean) || 0,
      stdDev: parseFloat(row.baseline_std_dev) || 1,
      peerMean: parseFloat(row.peer_group_mean) || 0,
      peerStdDev: parseFloat(row.peer_group_std_dev) || 1,
    };
  }

  const DIMENSION_WEIGHTS: Record<BehavioralDimension, number> = {
    eventVolume: 1.0,
    criticalEventRate: 2.0,
    distinctEventTypes: 0.8,
    distinctLogSources: 0.6,
    distinctTactics: 1.5,
    offHoursActivity: 1.8,
    temporalPatternDeviation: 1.6,
    loginDayVariance: 0.6,
    failedAuthRate: 2.5,
    privilegeEvents: 2.0,
    lateralMovement: 3.0,
    dataEgressVolume: 1.5,
    newResourceAccess: 0.8,
    geoVariety: 1.0,
    peerDeviation: 1.8,
  };

  const dimensionScores: DimensionScore[] = [];
  const zScoresArray: number[] = [];
  const weightsArray: number[] = [];

  for (const dim of BEHAVIORAL_DIMENSIONS) {
    if (dim === "peerDeviation") continue;
    const val = entityDimensions[dim];

    let baseline: { mean: number; stdDev: number; peerMean: number; peerStdDev: number };

    // temporalPatternDeviation/peerDeviation are always computed from live peer values (no stored baseline)
    const isDynamicDim = dim === "temporalPatternDeviation" || dim === "peerDeviation";

    if (!isDynamicDim && baselineMap[dim]) {
      baseline = baselineMap[dim];
    } else {
      const pVals = peerValues[dim]?.length > 0 ? peerValues[dim] : [val || 0];
      const mean = pVals.reduce((s, v) => s + v, 0) / pVals.length;
      const stdDev = computeStdDev(pVals, mean);
      baseline = { mean: mean * 0.8, stdDev: Math.max(stdDev, 0.001), peerMean: mean, peerStdDev: stdDev };
    }

    const z = zScore(val, baseline.mean, baseline.stdDev);
    const percentile = zScoreToPercentile(z);
    const triggered = Math.abs(z) >= 1.5;
    const severity: DimensionScore["severity"] =
      Math.abs(z) >= 3 ? "critical" :
      Math.abs(z) >= 2.5 ? "high" :
      Math.abs(z) >= 1.5 ? "medium" : "low";

    zScoresArray.push(z);
    weightsArray.push(DIMENSION_WEIGHTS[dim]);

    dimensionScores.push({
      key: dim,
      label: DIMENSION_LABELS[dim],
      value: Math.round(val * 100) / 100,
      baseline: Math.round(baseline.mean * 100) / 100,
      zScore: Math.round(z * 100) / 100,
      percentile: Math.round(percentile),
      triggered,
      severity,
    });
  }

  const meanAbsZ = zScoresArray.length > 0 ? zScoresArray.reduce((s, z) => s + Math.abs(z), 0) / zScoresArray.length : 0;
  const peerDeviationValue = Math.round(meanAbsZ * 100) / 100;

  const peerDeviationPeerMean = peerEntities.length > 0 ? 0.5 : 0;
  const peerDeviationStdDev = 0.8;
  const peerDevZ = zScore(peerDeviationValue, peerDeviationPeerMean, peerDeviationStdDev);
  const peerDevPercentile = zScoreToPercentile(peerDevZ);
  const peerDevTriggered = Math.abs(peerDevZ) >= 1.5;
  const peerDevSeverity: DimensionScore["severity"] =
    Math.abs(peerDevZ) >= 3 ? "critical" :
    Math.abs(peerDevZ) >= 2.5 ? "high" :
    Math.abs(peerDevZ) >= 1.5 ? "medium" : "low";

  zScoresArray.push(peerDevZ);
  weightsArray.push(DIMENSION_WEIGHTS.peerDeviation);
  dimensionScores.push({
    key: "peerDeviation",
    label: DIMENSION_LABELS.peerDeviation,
    value: peerDeviationValue,
    baseline: Math.round(peerDeviationPeerMean * 100) / 100,
    zScore: Math.round(peerDevZ * 100) / 100,
    percentile: Math.round(peerDevPercentile),
    triggered: peerDevTriggered,
    severity: peerDevSeverity,
  });

  const confidence = compositeScore(zScoresArray, weightsArray);

  const riskLevel: MLAnomalyResult["riskLevel"] =
    confidence >= 85 ? "severe" :
    confidence >= 70 ? "critical" :
    confidence >= 50 ? "high" :
    confidence >= 30 ? "moderate" : "low";

  const radarDimensions: BehavioralDimension[] = [
    "eventVolume", "criticalEventRate", "distinctTactics",
    "offHoursActivity", "failedAuthRate", "privilegeEvents",
    "lateralMovement", "dataEgressVolume",
  ];

  const behavioralFingerprint: RadarPoint[] = radarDimensions.map(dim => {
    const ds = dimensionScores.find(d => d.key === dim);
    const maxVal = Math.max(ds?.value || 0, ds?.baseline || 1, 1);
    return {
      dimension: DIMENSION_LABELS[dim],
      current: Math.round(((ds?.value || 0) / maxVal) * 100),
      normal: Math.round(((ds?.baseline || 0) / maxVal) * 100),
    };
  });

  const peerDeviations = dimensionScores
    .filter(d => d.key !== "peerDeviation" && peerValues[d.key]?.length > 0)
    .map(d => {
      const peerMean = baselineMap[d.key]?.peerMean || (peerValues[d.key].length > 0 ? peerValues[d.key].reduce((s, v) => s + v, 0) / peerValues[d.key].length : 0);
      const multiplier = peerMean > 0 ? Math.round((d.value / peerMean) * 10) / 10 : 1;
      const direction: "above" | "below" = d.value >= peerMean ? "above" : "below";
      const desc = multiplier >= 2
        ? `${multiplier}× more than peers`
        : multiplier <= 0.5
        ? `${Math.round((1 / (multiplier || 0.01)) * 10) / 10}× less than peers`
        : "similar to peers";
      return { dimension: d.label, entityValue: d.value, peerMean: Math.round(peerMean * 100) / 100, multiplier, direction, description: desc };
    })
    .filter(d => d.multiplier > 1.5 || d.multiplier < 0.5)
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))
    .slice(0, 5);

  // Peer rank: % of same-cohort peers this entity exceeds by event volume
  const entityEventVolumePerDay = entityDimensions.eventVolume;
  const peerRankArr = [...peerValues.eventVolume].sort((a, b) => a - b);
  const peersBelow = peerRankArr.filter(v => v < entityEventVolumePerDay).length;
  const overallPeerRank = peerRankArr.length > 0 ? Math.round((peersBelow / peerRankArr.length) * 100) : 50;

  const temporalAnomalies: TemporalAnomaly[] = [];
  if (offHoursCount > 0 && totalEvents > 0 && offHoursCount / totalEvents > 0.3) {
    temporalAnomalies.push({ type: "off_hours", description: `${Math.round((offHoursCount / totalEvents) * 100)}% of activity outside business hours (6am-10pm)` });
  }
  const weekendEvents = events.filter((e: any) => { const d = parseInt(e.day_of_week); return d === 0 || d === 6; }).length;
  if (weekendEvents > 5 && totalEvents > 0 && weekendEvents / totalEvents > 0.4) {
    temporalAnomalies.push({ type: "weekend", description: `${weekendEvents} events on weekends (${Math.round((weekendEvents / totalEvents) * 100)}% of total)` });
  }
  if (temporalDeviation > 0.05 && totalEvents >= 10) {
    temporalAnomalies.push({ type: "temporal_matrix", description: `Activity pattern deviates ${Math.round(temporalDeviation * 100)}% from tenant-wide hour×day baseline` });
  }
  const avgLoginHour = totalEvents > 0 ? events.reduce((s: number, e: any) => s + parseInt(e.hour_of_day || "12"), 0) / totalEvents : 12;
  if (avgLoginHour < 4 || avgLoginHour > 22) {
    temporalAnomalies.push({ type: "unusual_hour", description: `Average activity time ${Math.round(avgLoginHour)}:00 — unusual for this entity type`, hour: Math.round(avgLoginHour) });
  }

  const triggeredDimensions = dimensionScores.filter(d => d.triggered).sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  const peerComparison: PeerComparisonResult = {
    peerGroupSize: peerEntities.length,
    deviations: peerDeviations,
    overallPeerRank,
  };

  const savedAnomaly = await upsertAnomalyAndGetId(pool, tenantId, entityType, entityName, confidence, riskLevel, triggeredDimensions, latestAnomaly, options.preserveTimestamp);

  return {
    entityName,
    entityType,
    confidenceScore: confidence,
    riskLevel,
    triggeredDimensions,
    behavioralFingerprint,
    peerComparison,
    temporalAnomalies,
    anomalyId: savedAnomaly?.id ?? latestAnomaly?.id,
    markedExpected: savedAnomaly?.marked_expected ?? latestAnomaly?.marked_expected ?? false,
    escalatedToIncident: savedAnomaly?.escalated_to_incident ?? latestAnomaly?.escalated_to_incident ?? false,
  };
}

async function upsertAnomalyAndGetId(
  pool: Pool,
  tenantId: number,
  entityType: string,
  entityName: string,
  confidenceScore: number,
  riskLevel: string,
  dimensions: DimensionScore[],
  existing: any,
  preserveTimestamp = false
): Promise<{ id: number; marked_expected: boolean; escalated_to_incident: boolean } | null> {
  if (confidenceScore < 5) return null;
  const scoreInt = Math.round(confidenceScore);
  const dimPayload = dimensions.map(d => ({ key: d.key, label: d.label, zScore: d.zScore, severity: d.severity }));
  if (existing) {
    const tsClause = preserveTimestamp ? "" : ", occurred_at = NOW()";
    await pool.query(
      `UPDATE behavior_anomalies SET confidence_score = $1, dimensions = $2, anomaly_type = $3${tsClause} WHERE id = $4`,
      [scoreInt, JSON.stringify(dimPayload), riskLevel, existing.id]
    );
    return { id: existing.id, marked_expected: existing.marked_expected, escalated_to_incident: existing.escalated_to_incident };
  } else {
    const res = await pool.query(
      `INSERT INTO behavior_anomalies (tenant_id, entity_type, entity_name, anomaly_type, dimensions, confidence_score, marked_expected, escalated_to_incident, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, false, NOW())
       RETURNING id, marked_expected, escalated_to_incident`,
      [tenantId, entityType, entityName.toLowerCase(), riskLevel, JSON.stringify(dimPayload), scoreInt]
    );
    return res.rows[0] || null;
  }
}

export async function refreshBaselines(pool: Pool, tenantId: number): Promise<void> {
  // Baseline window: rolling last 30 days of events per task spec
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const entityTypeConfigs = [
    {
      type: "devices",
      groupByField: "LOWER(asset)",
      condition: "asset IS NOT NULL AND LENGTH(asset) > 1",
    },
    {
      type: "users",
      groupByField: "LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name', sender))",
      condition: "(raw_payload->>'userName' IS NOT NULL OR raw_payload->>'user_name' IS NOT NULL OR sender IS NOT NULL)",
    },
    {
      type: "ips",
      groupByField: "COALESCE(raw_payload->>'sourceIp', raw_payload->>'attackerIp')",
      condition: "(raw_payload->>'sourceIp' IS NOT NULL OR raw_payload->>'attackerIp' IS NOT NULL)",
    },
    {
      type: "domains",
      groupByField: "LOWER(REGEXP_REPLACE(COALESCE(raw_payload->>'sender_domain', SPLIT_PART(COALESCE(sender,''), '@', 2)), '^\\s*$', 'unknown'))",
      condition: "(raw_payload->>'sender_domain' IS NOT NULL OR (sender IS NOT NULL AND sender LIKE '%@%'))",
    },
  ];

  for (const config of entityTypeConfigs) {
    try {
      const peersRes = await pool.query(
        // Full 15-dimension baseline aggregation (all count dimensions normalized per-day later)
        `SELECT ${config.groupByField} as entity_name,
                COUNT(*) as evt_count,
                COUNT(CASE WHEN severity IN ('critical','high') THEN 1 END) as critical_count,
                COUNT(DISTINCT event_type) as event_types,
                COUNT(DISTINCT log_source) as log_sources,
                COUNT(DISTINCT mitre_tactic) as tactics,
                COUNT(CASE WHEN EXTRACT(HOUR FROM occurred_at) < 6 OR EXTRACT(HOUR FROM occurred_at) >= 22 THEN 1 END) as off_hours,
                COALESCE(STDDEV(EXTRACT(DOW FROM occurred_at)), 0) as day_variance,
                COUNT(CASE WHEN event_type = 'privilege_escalation' OR (mitre_tactic ILIKE '%privilege%') THEN 1 END) as priv_count,
                COUNT(CASE WHEN event_type = 'lateral_movement' OR (mitre_tactic ILIKE '%lateral%') THEN 1 END) as lateral_count,
                COUNT(DISTINCT NULLIF(COALESCE(raw_payload->>'destinationIp', raw_payload->>'dst_ip', ''), '')) FILTER (WHERE COALESCE(raw_payload->>'destinationIp', raw_payload->>'dst_ip') IS NOT NULL) as dst_ips,
                COUNT(CASE WHEN action = 'failed' OR event_type = 'failed_auth' THEN 1 END) as failed_auth_count
         FROM security_events
         WHERE tenant_id = $1 AND ${config.condition}
           AND occurred_at >= $2
         GROUP BY ${config.groupByField}
         HAVING COUNT(*) >= 3 AND ${config.groupByField} IS NOT NULL AND LENGTH(${config.groupByField}) > 0`,
        [tenantId, thirtyDaysAgo]
      );

      if (peersRes.rows.length < 2) continue;

      // 13 persistable dimensions; temporalPatternDeviation/peerDeviation are computed live at scoring time
      const BASELINE_DAYS = 30;
      const dimExtractors: Record<string, (r: any) => number> = {
        eventVolume: r => (parseInt(r.evt_count) || 0) / BASELINE_DAYS,
        distinctEventTypes: r => (parseInt(r.event_types) || 0) / BASELINE_DAYS,
        distinctLogSources: r => (parseInt(r.log_sources) || 0) / BASELINE_DAYS,
        distinctTactics: r => (parseInt(r.tactics) || 0) / BASELINE_DAYS,
        privilegeEvents: r => (parseInt(r.priv_count) || 0) / BASELINE_DAYS,
        lateralMovement: r => (parseInt(r.lateral_count) || 0) / BASELINE_DAYS,
        dataEgressVolume: r => (parseInt(r.dst_ips) || 0) / BASELINE_DAYS,
        newResourceAccess: r => ((parseInt(r.event_types) || 0) + (parseInt(r.log_sources) || 0)) / BASELINE_DAYS,
        geoVariety: r => (parseInt(r.dst_ips) || 0) / BASELINE_DAYS,
        criticalEventRate: r => parseInt(r.evt_count) > 0 ? (parseInt(r.critical_count) / parseInt(r.evt_count)) : 0,
        offHoursActivity: r => parseInt(r.evt_count) > 0 ? (parseInt(r.off_hours) / parseInt(r.evt_count)) : 0,
        failedAuthRate: r => parseInt(r.evt_count) > 0 ? (parseInt(r.failed_auth_count) / parseInt(r.evt_count)) : 0,
        loginDayVariance: r => parseFloat(r.day_variance) || 0,
      };

      for (const [dimKey, extractor] of Object.entries(dimExtractors)) {
        const values = peersRes.rows.map(extractor);
        const peerMean = values.reduce((s, v) => s + v, 0) / values.length;
        const peerStdDev = computeStdDev(values, peerMean);

        for (const row of peersRes.rows) {
          const entityVal = extractor(row);
          const entityName = (row.entity_name || "").trim();
          if (!entityName) continue;

          await pool.query(
            `INSERT INTO behavioral_baselines (tenant_id, entity_type, entity_name, dimension_key, baseline_mean, baseline_std_dev, peer_group_mean, peer_group_std_dev, sample_count, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (tenant_id, entity_type, entity_name, dimension_key) DO UPDATE SET
               baseline_mean = EXCLUDED.baseline_mean,
               baseline_std_dev = EXCLUDED.baseline_std_dev,
               peer_group_mean = EXCLUDED.peer_group_mean,
               peer_group_std_dev = EXCLUDED.peer_group_std_dev,
               sample_count = EXCLUDED.sample_count,
               updated_at = NOW()`,
            [tenantId, config.type, entityName, dimKey, entityVal, peerStdDev, peerMean, peerStdDev, values.length]
          ).catch((e: any) => console.warn(`[ML Baseline] Upsert warn (${config.type}/${dimKey}): ${e.message}`));
        }
      }
    } catch (err: any) {
      console.error(`[ML Baseline] Refresh error for tenant ${tenantId} type ${config.type}:`, err.message);
    }
  }
}

export async function startBaselineRefreshJob(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS behavioral_baselines_unique
        ON behavioral_baselines (tenant_id, entity_type, entity_name, dimension_key)
    `).catch((e: any) => console.warn("[ML Baseline] Index creation skipped (already exists?):", e.message));
  } catch (e: any) { console.warn("[ML Baseline] Index init error:", e.message); }

  try {
    const tenantRes = await pool.query(`SELECT id FROM tenants LIMIT 500`);
    for (const t of tenantRes.rows) {
      await refreshBaselines(pool, t.id).catch((e: any) =>
        console.error(`[ML Baseline] Tenant ${t.id} startup refresh error:`, e.message));
    }
    console.log(`[ML Baseline] Initial baseline refresh complete for ${tenantRes.rows.length} tenants`);
  } catch (err: any) {
    console.error("[ML Baseline] Startup refresh error:", err.message);
  }

  setInterval(async () => {
    try {
      const tenantRes = await pool.query(`SELECT id FROM tenants LIMIT 500`);
      for (const t of tenantRes.rows) {
        await refreshBaselines(pool, t.id).catch((e: any) =>
          console.error(`[ML Baseline] Tenant ${t.id} periodic refresh error:`, e.message));
      }
    } catch (err: any) {
      console.error("[ML Baseline] Periodic refresh error:", err.message);
    }
  }, 6 * 60 * 60 * 1000);
}

async function scoreAllEntitiesForTenant(pool: Pool, tenantId: number): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const entityTypeConfigs = [
    {
      type: "devices",
      groupByField: "LOWER(asset)",
      condition: "asset IS NOT NULL AND LENGTH(asset) > 1",
    },
    {
      type: "users",
      groupByField: "LOWER(COALESCE(raw_payload->>'userName', raw_payload->>'user_name', sender))",
      condition: "(raw_payload->>'userName' IS NOT NULL OR raw_payload->>'user_name' IS NOT NULL OR sender IS NOT NULL)",
    },
    {
      type: "ips",
      groupByField: "COALESCE(NULLIF(raw_payload->>'sourceIp',''), raw_payload->>'attackerIp')",
      condition: "(raw_payload->>'sourceIp' IS NOT NULL OR raw_payload->>'attackerIp' IS NOT NULL)",
    },
    {
      type: "domains",
      groupByField: "LOWER(REGEXP_REPLACE(COALESCE(raw_payload->>'sender_domain', SPLIT_PART(COALESCE(sender,''), '@', 2)), '^\\s*$', 'unknown'))",
      condition: "(raw_payload->>'sender_domain' IS NOT NULL OR (sender IS NOT NULL AND sender LIKE '%@%'))",
    },
  ];

  for (const config of entityTypeConfigs) {
    try {
      const entityRes = await pool.query(
        `SELECT ${config.groupByField} as entity_name, COUNT(*) as evt_count
         FROM security_events
         WHERE tenant_id = $1 AND ${config.condition}
           AND occurred_at >= $2
         GROUP BY ${config.groupByField}
         HAVING COUNT(*) >= 3 AND ${config.groupByField} IS NOT NULL AND LENGTH(${config.groupByField}) > 0
         LIMIT 100`,
        [tenantId, sevenDaysAgo]
      );

      for (const row of entityRes.rows) {
        const entityName = (row.entity_name || "").trim();
        if (!entityName) continue;
        try {
          await computeEntityMLScore(pool, tenantId, [tenantId], config.type, entityName);
        } catch (e: any) {
          console.warn(`[ML Scoring] Entity ${config.type}/${entityName} (tenant ${tenantId}) error: ${e.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[ML Scoring] Tenant ${tenantId} ${config.type} error:`, err.message);
    }
  }
}

export async function startEntityScoringJob(pool: Pool): Promise<void> {
  const runScoringRound = async () => {
    try {
      const tenantRes = await pool.query(`SELECT id FROM tenants LIMIT 500`);
      for (const t of tenantRes.rows) {
        await scoreAllEntitiesForTenant(pool, t.id).catch((e: any) =>
          console.error(`[ML Scoring] Tenant ${t.id} scoring error:`, e.message));
      }
      console.log(`[ML Scoring] Proactive entity scoring complete for ${tenantRes.rows.length} tenants`);
    } catch (err: any) {
      console.error("[ML Scoring] Job error:", err.message);
    }
  };

  // Run initial scoring pass after baselines are ready (staggered 30s after startup)
  setTimeout(runScoringRound, 30_000);

  // Run every 6 hours to keep anomaly inventory fresh
  setInterval(runScoringRound, 6 * 60 * 60 * 1000);
}
