import { db, pool } from "./db";
import { aiDetectionRules, securityEvents, behaviorAnomalies } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { createAIClient, getDefaultModel } from "./ai-provider";

const RULE_TYPES = ["sigma", "yara", "kql", "spl", "eql"] as const;

// ── Template generators for different rule types ──────────────────────────────
function generateSigmaTemplate(name: string, technique: string, conditions: string[]): string {
  return `title: ${name}
id: ${crypto.randomUUID()}
status: experimental
description: AI-generated detection rule for ${technique}
author: Cyber Command Center AI
date: ${new Date().toISOString().split('T')[0]}
tags:
  - attack.${technique.toLowerCase().replace(/ /g, '_')}
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ${conditions.map(c => `    ${c}`).join('\n')}
  condition: selection
falsepositives:
  - Legitimate administrative activity
  - Software deployment tools
level: high
`;
}

function generateKQLTemplate(name: string, technique: string, conditions: string[]): string {
  return `// ${name}
// Generated: ${new Date().toISOString()}
// MITRE: ${technique}
//
SecurityEvent
| where TimeGenerated >= ago(24h)
| where ${conditions.join('\n    or ')}
| project TimeGenerated, Account, Computer, EventID, CommandLine
| order by TimeGenerated desc
`;
}

function generateSPLTemplate(name: string, technique: string, conditions: string[]): string {
  return `\`\`\`
| index=security sourcetype=WinEventLog:Security
| where ${conditions.join(' OR ')}
| table _time, user, src_ip, dest_ip, process_name, command_line
| stats count by user, src_ip, process_name
| where count > 5
| sort -count
\`\`\`
`;
}

function generateEQLTemplate(name: string, technique: string, conditions: string[]): string {
  return `sequence by host.name with maxspan=5m
  [process where ${conditions[0] || 'process.name : "cmd.exe"'}]
  [network where destination.port in (443, 4444, 8080, 8443)]
  [file where file.extension in (".exe", ".dll", ".ps1")]
`;
}

// ── AI Rule Generator ─────────────────────────────────────────────────────────
export async function generateDetectionRule(
  tenantId: number,
  ruleType: string,
  context: { technique?: string; eventIds?: number[]; anomalyIds?: number[]; threatDescription?: string }
): Promise<typeof aiDetectionRules.$inferSelect> {
  const client = createAIClient();
  const model = getDefaultModel();

  const { technique = "Unknown Technique", threatDescription = "" } = context;

  const prompt = `You are a detection engineering expert. Generate a ${ruleType.toUpperCase()} detection rule for:

Threat: ${threatDescription || technique}
MITRE ATT&CK Technique: ${technique}
Rule Type: ${ruleType}

Return JSON with this exact structure:
{
  "name": "Descriptive rule name (max 80 chars)",
  "description": "2-3 sentence explanation of what this detects and why",
  "ruleContent": "The complete ${ruleType} rule content as a string",
  "mitreAttackIds": ["T1xxx", "T1xxx"],
  "killChainPhases": ["exploitation", "lateral_movement"],
  "severity": "critical|high|medium|low",
  "falsePositiveRate": "low|medium|high",
  "truePositiveRate": "high|medium|low",
  "tags": ["tag1", "tag2"],
  "aiConfidence": 75
}

For the ruleContent, produce a real, syntactically valid ${ruleType} rule, not placeholder text.`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.2,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");

    const insertValues: typeof aiDetectionRules.$inferInsert = {
      tenantId,
      name: parsed.name || `AI-Generated ${ruleType.toUpperCase()} Rule`,
      description: parsed.description || `Detects ${technique}`,
      ruleType,
      ruleContent: parsed.ruleContent || generateFallbackRule(ruleType, technique),
      status: "draft",
      mitreAttackIds: parsed.mitreAttackIds || [],
      killChainPhases: parsed.killChainPhases || [],
      falsePositiveRate: parsed.falsePositiveRate || "medium",
      truePositiveRate: parsed.truePositiveRate || "medium",
      aiConfidence: parsed.aiConfidence || 70,
      tags: parsed.tags || [],
      severity: parsed.severity || "medium",
      generatedFromEventIds: context.eventIds || [],
      generatedFromAnomalyIds: context.anomalyIds || [],
      generatedBy: "ai",
    };
    const [rule] = await db.insert(aiDetectionRules).values(insertValues).returning();

    return rule;
  } catch (e) {
    // Fallback with template
    const fallbackValues: typeof aiDetectionRules.$inferInsert = {
      tenantId,
      name: `AI ${ruleType.toUpperCase()} Rule: ${technique}`,
      description: `Detects ${threatDescription || technique} activity based on behavioral patterns.`,
      ruleType,
      ruleContent: generateFallbackRule(ruleType, technique),
      status: "draft",
      mitreAttackIds: [],
      killChainPhases: [],
      aiConfidence: 60,
      severity: "medium",
      generatedBy: "ai",
    };
    const [rule] = await db.insert(aiDetectionRules).values(fallbackValues).returning();
    return rule;
  }
}

function generateFallbackRule(ruleType: string, technique: string): string {
  const conds = [`EventID = 4688`, `CommandLine contains "powershell"`];
  switch (ruleType) {
    case "sigma": return generateSigmaTemplate(`Detect ${technique}`, technique, conds);
    case "kql": return generateKQLTemplate(`Detect ${technique}`, technique, conds);
    case "spl": return generateSPLTemplate(`Detect ${technique}`, technique, conds);
    case "eql": return generateEQLTemplate(`Detect ${technique}`, technique, conds);
    default: return `// ${ruleType.toUpperCase()} Rule: ${technique}\n// Auto-generated placeholder\n${conds.join('\n')}`;
  }
}

// ── Rule from Anomaly ─────────────────────────────────────────────────────────
export async function generateRuleFromAnomalies(tenantId: number, ruleType: string): Promise<typeof aiDetectionRules.$inferSelect> {
  // Get recent high-confidence anomalies
  const anomalies = await db.select().from(behaviorAnomalies)
    .where(and(eq(behaviorAnomalies.tenantId, tenantId)))
    .orderBy(desc(behaviorAnomalies.occurredAt))
    .limit(5);

  const techniques = anomalies.map(a => a.anomalyType).join(", ");
  const threatDesc = anomalies.length
    ? `Behavioral anomalies detected: ${techniques}. Entities: ${anomalies.map(a => a.entityName).join(", ")}`
    : "Behavioral anomaly pattern";

  return generateDetectionRule(tenantId, ruleType, {
    technique: anomalies[0]?.anomalyType || "Suspicious Behavior",
    anomalyIds: anomalies.map(a => a.id),
    threatDescription: threatDesc,
  });
}

// ── Bulk auto-generate from events ───────────────────────────────────────────
export async function autoGenerateRules(tenantId: number): Promise<number> {
  const TECHNIQUES = [
    { technique: "T1078 - Valid Accounts", desc: "Unusual account usage patterns from new locations or times" },
    { technique: "T1059.001 - PowerShell", desc: "Obfuscated PowerShell execution with encoded commands" },
    { technique: "T1027 - Obfuscated Files", desc: "Binary padding or encoding to evade static detection" },
    { technique: "T1055 - Process Injection", desc: "Code injection into legitimate processes" },
    { technique: "T1486 - Data Encrypted for Impact", desc: "Mass file encryption indicative of ransomware" },
  ];

  let count = 0;
  for (const { technique, desc } of TECHNIQUES) {
    try {
      await generateDetectionRule(tenantId, RULE_TYPES[count % RULE_TYPES.length], {
        technique,
        threatDescription: desc,
      });
      count++;
    } catch (e) {
      console.error("[DetectionEngine] Failed to generate rule:", e);
    }
  }
  return count;
}

// Concurrency lock: tracks in-progress incident rule generation to prevent duplicate AI calls
const _incidentRuleGenerating = new Set<string>();

// ── Generate Detection Rule from a specific confirmed TP Incident ────────────
export async function generateRuleFromIncident(
  tenantId: number,
  incidentId: number,
  analystUserId?: string
): Promise<typeof aiDetectionRules.$inferSelect> {
  const lockKey = `${tenantId}:${incidentId}`;
  if (_incidentRuleGenerating.has(lockKey)) {
    // Another call is already running — wait for it to finish and return the idempotent result
    await new Promise(resolve => setTimeout(resolve, 3000));
    const latestRes = await pool.query(
      `SELECT * FROM ai_detection_rules WHERE tenant_id = $1 AND generated_from_incident_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, incidentId]
    );
    if (latestRes.rows.length > 0) return latestRes.rows[0] as typeof aiDetectionRules.$inferSelect;
  }
  _incidentRuleGenerating.add(lockKey);
  // Fetch incident details
  const incRes = await pool.query(
    `SELECT id, title, description, severity, category, threat_type, mitre_tactic, mitre_technique_id, mitre_technique,
            kill_chain_phase, confidence_score, attacker, target, source_ip, destination_ip, classification, created_at
     FROM incidents WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [incidentId, tenantId]
  );
  if (!incRes.rows.length) {
    _incidentRuleGenerating.delete(lockKey);
    throw new Error("Incident not found");
  }
  const incident = incRes.rows[0];

  // Idempotency: return latest draft if one already exists for this incident
  const existingRes = await pool.query(
    `SELECT * FROM ai_detection_rules
     WHERE tenant_id = $1 AND generated_from_incident_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, incidentId]
  );
  if (existingRes.rows.length > 0) {
    _incidentRuleGenerating.delete(lockKey);
    return existingRes.rows[0] as typeof aiDetectionRules.$inferSelect;
  }

  // Fetch incident-correlated raw events: same logic as War Room (±4h window + IP/IOC matching)
  const timeStart = new Date(new Date(incident.created_at || Date.now()).getTime() - 4 * 3600000);
  const timeEnd = new Date(new Date(incident.created_at || Date.now()).getTime() + 4 * 3600000);
  const srcIp = incident.source_ip || null;
  const dstIp = incident.destination_ip || null;

  // Build correlated events query with same logic as war-room timeline
  const corrParams: (string | null | Date)[] = [tenantId, timeStart, timeEnd, srcIp ? `%${srcIp}%` : null, dstIp ? `%${dstIp}%` : null];
  const corrClauses: string[] = [];
  if (srcIp) corrClauses.push(`(attacker ILIKE $4 OR target ILIKE $4)`);
  if (dstIp) corrClauses.push(`(attacker ILIKE $5 OR target ILIKE $5)`);
  // Also include events by event_type matching threat_type
  const threatType = incident.threat_type || incident.category;
  if (threatType) {
    corrParams.push(`%${threatType}%`);
    corrClauses.push(`event_type ILIKE $${corrParams.length}`);
  }
  // Include attacker/target from incident metadata
  if (incident.attacker) {
    corrParams.push(`%${incident.attacker}%`);
    corrClauses.push(`attacker ILIKE $${corrParams.length}`);
  }
  if (incident.target) {
    corrParams.push(`%${incident.target}%`);
    corrClauses.push(`target ILIKE $${corrParams.length}`);
  }
  const whereClause = corrClauses.length > 0 ? corrClauses.join(" OR ") : "TRUE";
  const eventsRes = await pool.query(
    `SELECT id, event_type, severity, threat, target, attacker, asset, description,
            threat_vector, mitre_tactic, mitre_technique, action, source_type, occurred_at
     FROM security_events
     WHERE tenant_id = $1 AND occurred_at BETWEEN $2 AND $3
       AND (${whereClause})
     ORDER BY occurred_at ASC LIMIT 50`,
    corrParams
  );
  // Fallback: if no correlated events found, use recent tenant events for baseline signal
  let events = eventsRes.rows;
  if (events.length === 0) {
    const fallbackRes = await pool.query(
      `SELECT id, event_type, severity, threat, target, attacker, asset, description, mitre_tactic, mitre_technique, occurred_at
       FROM security_events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 10`,
      [tenantId]
    );
    events = fallbackRes.rows;
  }

  // Backtest: use the same correlation predicates over the past 30 days to estimate rule coverage
  const backtestParams: (string | null)[] = [tenantId, srcIp ? `%${srcIp}%` : null, dstIp ? `%${dstIp}%` : null];
  const backtestClauses: string[] = [];
  if (srcIp) backtestClauses.push(`(attacker ILIKE $2 OR target ILIKE $2)`);
  if (dstIp) backtestClauses.push(`(attacker ILIKE $3 OR target ILIKE $3)`);
  if (threatType) {
    backtestParams.push(`%${threatType}%`);
    backtestClauses.push(`event_type ILIKE $${backtestParams.length}`);
  }
  if (incident.attacker) {
    backtestParams.push(`%${incident.attacker}%`);
    backtestClauses.push(`attacker ILIKE $${backtestParams.length}`);
  }
  if (incident.target) {
    backtestParams.push(`%${incident.target}%`);
    backtestClauses.push(`target ILIKE $${backtestParams.length}`);
  }
  const backtestWhere = backtestClauses.length > 0 ? backtestClauses.join(" OR ") : "TRUE";
  const backtestRes = await pool.query(
    `SELECT COUNT(*) as matched_events,
            COUNT(DISTINCT DATE(occurred_at)) as matched_days
     FROM security_events
     WHERE tenant_id = $1
       AND occurred_at >= NOW() - INTERVAL '30 days'
       AND (${backtestWhere})`,
    backtestParams
  );
  const backtestMatchedEvents = parseInt(backtestRes.rows[0]?.matched_events ?? "0");
  const backtestMatchedDays = parseInt(backtestRes.rows[0]?.matched_days ?? "0");

  const ruleType: typeof RULE_TYPES[number] = "sigma";
  const technique = incident.mitre_technique || incident.threat_type || incident.category || "Unknown Technique";
  const techniqueId = incident.mitre_technique_id || "";

  const eventSummary = events.slice(0, 5).map((e: any) =>
    `- ${e.event_type}: ${e.description || e.threat || e.attacker || ""} → ${e.target || e.asset || ""}`
  ).join("\n");

  const prompt = `You are a senior Detection Engineer. A confirmed True Positive incident requires an automated detection rule.

INCIDENT:
- Title: ${incident.title}
- Severity: ${incident.severity}
- Category: ${incident.category || "Unknown"}
- Threat: ${incident.threat_type || "Unknown"}
- MITRE Tactic: ${incident.mitre_tactic || "Unknown"}
- MITRE Technique: ${techniqueId} ${technique}
- Kill Chain Phase: ${incident.kill_chain_phase || "Unknown"}
- Confidence: ${incident.confidence_score ?? 80}%
- Description: ${incident.description || "No description"}
- Source IP: ${incident.source_ip || "Unknown"}, Target: ${incident.target || incident.destination_ip || "Unknown"}

RELATED EVENTS (last 30 days, ${events.length} total):
${eventSummary || "No related events available"}

BACKTEST ESTIMATE (30-day look-back):
- Events matching threat pattern: ${backtestMatchedEvents}
- Days with activity: ${backtestMatchedDays} of 30

Generate a production-ready Sigma detection rule that would detect this threat pattern. Include:
1. Appropriate detection logic based on event fields
2. MITRE ATT&CK tagging
3. Proper false positive notes
4. Tuning recommendations

Return JSON only:
{
  "name": "rule name",
  "description": "what this detects",
  "ruleContent": "complete Sigma YAML rule",
  "falsePositiveRateEstimate": "low|medium|high",
  "truePositiveRateEstimate": "low|medium|high",
  "aiConfidence": 85,
  "tags": ["${techniqueId || "attack.discovery"}"],
  "severity": "${incident.severity || "medium"}"
}`;

  const aiClient = createAIClient();
  const model = getDefaultModel();
  const completion = await aiClient.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(completion.choices[0].message.content || "{}") as Record<string, unknown>;
  } catch { /* use defaults */ }

  const name = (parsed.name as string) || `Auto-Rule: ${incident.title.substring(0, 60)}`;
  const description = (parsed.description as string) || `Auto-generated Sigma rule from confirmed TP incident #${incidentId}: ${incident.title}`;
  const ruleContent = (parsed.ruleContent as string) || generateSigmaTemplate(name, techniqueId || technique, [incident.description || "generic"]);
  const aiConfidence = Math.max(0, Math.min(100, (parsed.aiConfidence as number) ?? incident.confidence_score ?? 75));
  const ruleSeverity = (parsed.severity as string) || incident.severity || "medium";
  const ruleTagsList = Array.isArray(parsed.tags) ? (parsed.tags as string[]) : (techniqueId ? [techniqueId] : ["attack.discovery"]);

  const testResults = {
    backtest: {
      windowDays: 30,
      matchedEvents: backtestMatchedEvents,
      matchedDays: backtestMatchedDays,
      estimatedCoverage: backtestMatchedDays > 0 ? `${Math.round((backtestMatchedDays / 30) * 100)}%` : "0%",
    },
    falsePositiveEstimate: (parsed.falsePositiveRateEstimate as string) || "low",
    truePositiveEstimate: (parsed.truePositiveRateEstimate as string) || "high",
    generatedAt: new Date().toISOString(),
  };

  const insertValues: typeof aiDetectionRules.$inferInsert = {
    tenantId,
    name,
    description,
    ruleType,
    ruleContent,
    status: "draft",
    mitreAttackIds: techniqueId ? [techniqueId] : [],
    killChainPhases: incident.kill_chain_phase ? [incident.kill_chain_phase] : [],
    falsePositiveRate: (parsed.falsePositiveRateEstimate as string) || "low",
    truePositiveRate: (parsed.truePositiveRateEstimate as string) || "high",
    aiConfidence,
    tags: ruleTagsList,
    severity: ruleSeverity,
    generatedBy: analystUserId || "system",
    generatedFromEventIds: events.slice(0, 10).map((e: { id: number }) => e.id),
    generatedFromIncidentId: incidentId,
    testResults,
  };

  const [rule] = await db.insert(aiDetectionRules).values(insertValues).returning();

  _incidentRuleGenerating.delete(lockKey);
  return rule;
}
