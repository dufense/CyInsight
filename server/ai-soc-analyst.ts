import { createAIClient } from "./ai-provider";
import { pool } from "./db";
import { executeAgentPipeline } from "./ai-agents/orchestrator";
import type { AgentPipelineResult, AnalystFeedbackContext } from "./ai-agents/types";

const openai = createAIClient();

interface InvestigationContext {
  incident: any;
  relatedEvents: any[];
  relatedIncidents: any[];
  entityHistory: Record<string, any[]>;
  assetInfo: any[];
  tenantName: string;
  riskIntelligence?: {
    entityRiskScores: { entity: string; score: number; level: string; type: string }[];
    cloudAppRisks: { appName: string; confidenceIndex: number; classification: string }[];
  };
}

interface InvestigationResult {
  status: "completed" | "failed";
  findings: {
    timeline: any[];
    affectedEntities: { type: string; value: string; riskLevel: string; details: string }[];
    lateralMovement: boolean;
    dataExfiltration: boolean;
    persistenceMechanisms: string[];
    attackComplexity: string;
    attackVector: string;
  };
  recommendations: {
    containmentActions: { action: string; priority: "critical" | "high" | "medium" | "low"; urgency: string }[];
    remediationSteps: { step: string; owner: string; timeline: string }[];
    preventionMeasures: string[];
  };
  executiveSummary: string;
  technicalReport: string;
  riskScore: number;
  confidenceScore: number;
  attackChain: { phase: string; description: string; evidence: string; timestamp?: string }[];
  iocsSummary: { type: string; value: string; reputation: string; context: string }[];
  relatedIncidentIds: number[];
  investigationSteps: { step: string; action: string; result: string; timestamp: string }[];
  verdict?: string;
  verdictReasoning?: string;
}

const FP_TITLE_PATTERNS = [
  /no scans in group/i,
  /scheduled task completed/i,
  /backup job (completed|failed|success)/i,
  /scan completed successfully/i,
  /update (installed|completed|available)/i,
  /license expir/i,
  /disk space (low|warning|full|threshold)/i,
  /certificate (expir|renew)/i,
  /service (restart|started|stopped) successfully/i,
  /patch (applied|installed|completed)/i,
  /health check (passed|ok|success)/i,
  /maintenance (window|completed|scheduled)/i,
  /reboot (completed|required|pending)/i,
  /agent (offline|disconnected|reconnected|unresponsive)/i,
  /policy (updated|applied|sync|changed)/i,
  /definition update/i,
  /connectivity (restored|lost|check)/i,
  /no (threats|issues|findings) (found|detected)/i,
  /test (alert|event|notification)/i,
  /informational/i,
  /device control/i,
  /usb.*(block|detect|insert|remov)/i,
  /storage device.*(detect|block|insert)/i,
  /removable media/i,
  /insertion of.*device/i,
  /endpoint (offline|inactive|dormant)/i,
  /heartbeat (lost|miss|fail|timeout)/i,
  /keepalive/i,
  /memory usage (high|threshold|warning)/i,
  /cpu usage (high|threshold|warning)/i,
  /disk (full|threshold|warning)/i,
  /password (expir|reset|change) (remind|notif|alert)/i,
  /auto.?update/i,
  /signature (update|download)/i,
  /quarantine (success|complet)/i,
  /firewall rule (update|change|modif)/i,
];

interface FPCheckResult {
  isFP: boolean;
  reason: string;
  confidence: number;
}

export async function isLikelyFalsePositive(incident: any, tenantId: number): Promise<FPCheckResult> {
  const title = (incident.title || "").toLowerCase();
  const description = (incident.description || "").toLowerCase();

  if (incident.is_true_positive === false || incident.classification === "false_positive") {
    return { isFP: true, reason: "Already classified as false positive", confidence: 100 };
  }

  for (const pattern of FP_TITLE_PATTERNS) {
    if (pattern.test(title) || pattern.test(description)) {
      return { isFP: true, reason: `Operational/maintenance alert pattern: "${title}"`, confidence: 95 };
    }
  }

  if (incident.confidence_score != null && incident.confidence_score < 15) {
    return { isFP: true, reason: `Very low confidence score (${incident.confidence_score}/100) indicates noise`, confidence: 85 };
  }

  if (incident.severity === "info") {
    return { isFP: true, reason: "Informational severity — not a security threat", confidence: 90 };
  }

  try {
    const historyResult = await pool.query(
      `SELECT ai.verdict, COUNT(*) as cnt
       FROM incidents i
       JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.title = $2 AND ai.status = 'completed'
         AND ai.completed_at >= NOW() - INTERVAL '7 days'
       GROUP BY ai.verdict`,
      [tenantId, incident.title]
    );

    if (historyResult.rows.length > 0) {
      const total = historyResult.rows.reduce((sum: number, r: any) => sum + parseInt(r.cnt), 0);
      const fpCount = historyResult.rows.find((r: any) => r.verdict === "false_positive");
      const fpNum = fpCount ? parseInt(fpCount.cnt) : 0;

      if (total >= 3 && fpNum / total >= 0.8) {
        return { isFP: true, reason: `${fpNum}/${total} identical incidents in last 7 days were false positives (${Math.round(fpNum / total * 100)}% FP rate)`, confidence: 90 };
      }
    }
  } catch {}

  return { isFP: false, reason: "", confidence: 0 };
}

function calculatePriorityScore(incident: any): number {
  let score = 0;

  if (incident.severity === "critical") score += 40;
  else if (incident.severity === "high") score += 30;
  else if (incident.severity === "medium") score += 15;
  else score += 5;

  if (incident.ioc_data) {
    const iocData = typeof incident.ioc_data === "string" ? JSON.parse(incident.ioc_data || "{}") : (incident.ioc_data || {});
    if (iocData.indicators && iocData.indicators.length > 0) score += 10;
  }

  if (incident.mitre_tactic) score += 10;

  const assetCount = (incident.affected_assets || "").split(",").filter(Boolean).length;
  if (assetCount > 1) score += 10;

  const created = new Date(incident.created_at);
  const hoursSince = (Date.now() - created.getTime()) / (1000 * 60 * 60);
  if (hoursSince < 24) score += 10;
  else if (hoursSince < 72) score += 5;

  if (incident.confidence_score && incident.confidence_score > 70) score += 10;

  return Math.min(100, score);
}

export function classifyAttackType(incident: any): string {
  const type = (incident.incident_type || incident.incidentType || "").toLowerCase();
  const title = (incident.title || "").toLowerCase();
  const category = (incident.category || "").toLowerCase();
  const source = (incident.source || "").toLowerCase();
  const desc = (incident.description || "").toLowerCase();
  const combined = `${type} ${title} ${category} ${desc}`;

  if (/ransomware|encrypt|ransom note|shadow copy|bitlocker|lockbit|blackcat|clop/i.test(combined)) return "ransomware";
  if (/malware|trojan|virus|worm|rootkit|backdoor|keylogger|spyware|adware|dropper|payload|maldoc|cobalt strike|beacon/i.test(combined)) return "malware";
  if (/phish|spear.?phish|credential.?harvest|fake.?login|spoofed|impersonat|bec|business email compromise|whaling/i.test(combined)) return "phishing";
  if (/brute.?force|credential.?stuff|password.?spray|failed.?login|account.?lock|multiple.?failed|auth.?fail|login.?attempt/i.test(combined)) return "brute_force";
  if (/sql.?inject|xss|cross.?site|csrf|rce|remote.?code|command.?inject|path.?traversal|directory.?traversal|lfi|rfi|ssrf|owasp|web.?shell/i.test(combined)) return "web_app_attack";
  if (/intrusion|lateral.?move|c2|command.?and.?control|c&c|port.?scan|network.?scan|exfiltrat|data.?leak|pivot|smb.?enum|rdp.?brute|beacon/i.test(combined)) return "network_intrusion";
  if (/cve-|exploit|vuln|zero.?day|buffer.?overflow|heap.?spray|use.?after.?free|privilege.?escalat|eternalblue|log4j|shellshock/i.test(combined)) return "vuln_exploit";
  if (/social.?engineer|vishing|smishing|pretexting|baiting|tailgating|impersonation|wire.?fraud|invoice.?fraud/i.test(combined)) return "social_engineering";

  if (source.includes("email") || source.includes("harmony email") || category.includes("email")) return "phishing";
  if (source.includes("waf") || source.includes("web") || category.includes("web")) return "web_app_attack";
  if (source.includes("firewall") || source.includes("ids") || source.includes("ips") || source.includes("ndr")) return "network_intrusion";
  if (/identity|iam|active.?directory|ldap|mfa/i.test(combined)) return "brute_force";

  return "generic";
}

async function gatherContext(tenantId: number, incidentId: number): Promise<InvestigationContext> {
  const incResult = await pool.query(
    `SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`, [incidentId, tenantId]
  );
  const incident = incResult.rows[0];
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const entities = new Set<string>();
  if (incident.source_ip) entities.add(incident.source_ip);
  if (incident.destination_ip) entities.add(incident.destination_ip);
  if (incident.affected_assets) {
    incident.affected_assets.split(",").map((a: string) => a.trim()).filter(Boolean).forEach((a: string) => entities.add(a));
  }
  if (incident.source) entities.add(incident.source);

  const iocData = typeof incident.ioc_data === "string" ? JSON.parse(incident.ioc_data || "{}") : (incident.ioc_data || {});
  if (iocData.indicators) {
    for (const ioc of iocData.indicators) {
      if (ioc.value) entities.add(ioc.value);
    }
  }

  const entityList = [...entities].filter(Boolean).slice(0, 20);

  let relatedEvents: any[] = [];
  if (entityList.length > 0) {
    const conditions = entityList.map((_, i) => 
      `(target ILIKE $${i + 2} OR attacker ILIKE $${i + 2} OR asset ILIKE $${i + 2} OR description ILIKE $${i + 2})`
    );
    const eventResult = await pool.query(
      `SELECT id, event_type, severity, threat, target, attacker, asset, description, action, log_source, mitre_tactic, mitre_technique, occurred_at, country
       FROM security_events WHERE tenant_id = $1 AND (${conditions.join(" OR ")})
       ORDER BY occurred_at DESC LIMIT 100`,
      [tenantId, ...entityList.map(e => `%${e}%`)]
    );
    relatedEvents = eventResult.rows;
  }

  const relIncResult = await pool.query(
    `SELECT id, title, severity, status, source_ip, destination_ip, affected_assets, mitre_tactic, mitre_technique, kill_chain_phase, confidence_score, created_at
     FROM incidents WHERE tenant_id = $1 AND id != $2 AND created_at >= NOW() - INTERVAL '30 days'
     AND (source_ip = $3 OR destination_ip = $4 OR affected_assets ILIKE $5)
     ORDER BY created_at DESC LIMIT 20`,
    [tenantId, incidentId, incident.source_ip || '', incident.destination_ip || '', `%${incident.affected_assets?.split(",")[0]?.trim() || 'NOMATCH'}%`]
  );

  const entityHistory: Record<string, any[]> = {};
  for (const entity of entityList.slice(0, 5)) {
    const histResult = await pool.query(
      `SELECT event_type, severity, COUNT(*) as count, MIN(occurred_at) as first_seen, MAX(occurred_at) as last_seen
       FROM security_events WHERE tenant_id = $1 AND (target ILIKE $2 OR attacker ILIKE $2 OR asset ILIKE $2)
       GROUP BY event_type, severity ORDER BY count DESC LIMIT 10`,
      [tenantId, `%${entity}%`]
    );
    entityHistory[entity] = histResult.rows;
  }

  const assetResult = await pool.query(
    `SELECT hostname, ip_address, operating_system, last_logged_in_user, endpoint_alias, enrichment_data, status FROM assets WHERE tenant_id = $1 LIMIT 5`,
    [tenantId]
  );

  const tenantResult = await pool.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);

  let riskIntelligence: InvestigationContext["riskIntelligence"] = { entityRiskScores: [], cloudAppRisks: [] };
  try {
    if (entityList.length > 0) {
      const riskResult = await pool.query(
        `SELECT entity_identifier, overall_score, risk_level, entity_type 
         FROM risk_scores WHERE tenant_id = $1 AND entity_identifier ILIKE ANY($2)
         ORDER BY calculated_at DESC LIMIT 15`,
        [tenantId, entityList.map(e => `%${e}%`)]
      );
      const seen = new Set<string>();
      for (const r of riskResult.rows) {
        if (!seen.has(r.entity_identifier)) {
          seen.add(r.entity_identifier);
          riskIntelligence!.entityRiskScores.push({
            entity: r.entity_identifier,
            score: Math.round(r.overall_score),
            level: r.risk_level,
            type: r.entity_type,
          });
        }
      }
    }

    const source = (incident.source || "").toLowerCase();
    const isCloudRelated = /casb|sse|cloud|saas|shadow.?it|mcas|netskope|zscaler/i.test(
      `${source} ${incident.description || ""} ${incident.title || ""}`
    );
    if (isCloudRelated) {
      const cloudResult = await pool.query(
        `SELECT app_name, confidence_index, risk_classification
         FROM cloud_app_risk_scores WHERE tenant_id = $1
         ORDER BY confidence_index DESC LIMIT 5`,
        [tenantId]
      );
      riskIntelligence!.cloudAppRisks = cloudResult.rows.map((r: any) => ({
        appName: r.app_name,
        confidenceIndex: Math.round(r.confidence_index),
        classification: r.risk_classification,
      }));
    }
  } catch (err: any) {
    console.error(`[AI SOC] Risk intelligence query failed: ${err.message}`);
  }

  return {
    incident,
    relatedEvents,
    relatedIncidents: relIncResult.rows,
    entityHistory,
    assetInfo: assetResult.rows,
    tenantName: tenantResult.rows[0]?.name || "Unknown",
    riskIntelligence,
  };
}

function generateFallbackResult(context: InvestigationContext, error: string, retrySteps: any[]): InvestigationResult {
  const { incident, relatedEvents, relatedIncidents, entityHistory } = context;
  const attackType = classifyAttackType(incident);
  const entityCount = Object.keys(entityHistory).length;

  const affectedEntities: { type: string; value: string; riskLevel: string; details: string }[] = [];
  if (incident.source_ip) {
    const srcType = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(incident.source_ip) ? "email" 
      : /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(incident.source_ip) ? "ip" : "domain";
    affectedEntities.push({ type: srcType, value: incident.source_ip, riskLevel: "medium", details: srcType === "email" ? "Source email sender from incident" : "Source IP from incident" });
  }
  if (incident.destination_ip) affectedEntities.push({ type: "ip", value: incident.destination_ip, riskLevel: "medium", details: "Destination IP from incident" });
  if (incident.affected_assets) {
    incident.affected_assets.split(",").map((a: string) => a.trim()).filter(Boolean).forEach((a: string) => {
      affectedEntities.push({ type: "asset", value: a, riskLevel: "medium", details: "Listed in affected assets" });
    });
  }

  return {
    status: "completed",
    findings: {
      timeline: [{ timestamp: incident.created_at || new Date().toISOString(), event: incident.title || "Incident reported", severity: incident.severity || "medium", source: incident.source || "unknown" }],
      affectedEntities,
      lateralMovement: false,
      dataExfiltration: false,
      persistenceMechanisms: [],
      attackComplexity: "unknown",
      attackVector: attackType !== "generic" ? attackType : "unknown",
    },
    recommendations: {
      containmentActions: [{ action: "Manually review this incident — AI analysis was unavailable", priority: "high" as const, urgency: "within_1h" }],
      remediationSteps: [{ step: "Perform manual triage and investigation", owner: "SOC", timeline: "Immediate" }],
      preventionMeasures: ["Retry AI investigation once the service is restored"],
    },
    executiveSummary: `AI-powered analysis was unavailable after multiple retry attempts (${error}). This fallback report contains context data gathered from ${relatedEvents.length} related security events, ${relatedIncidents.length} related incidents, and ${entityCount} entity profiles. Manual review is recommended to complete the investigation. Incident: "${incident.title}" (Severity: ${incident.severity}).`,
    technicalReport: `Automated investigation encountered persistent failures: ${error}. Context data is available for manual analysis. Related events: ${relatedEvents.length}, Related incidents: ${relatedIncidents.length}, Entity profiles: ${entityCount}. Attack classification: ${attackType}.`,
    riskScore: incident.severity === "critical" ? 75 : incident.severity === "high" ? 60 : 40,
    confidenceScore: 20,
    attackChain: [],
    iocsSummary: [],
    relatedIncidentIds: relatedIncidents.slice(0, 5).map((i: any) => i.id).filter((id: number) => !isNaN(id)),
    investigationSteps: retrySteps,
    verdict: "inconclusive",
    verdictReasoning: `AI analysis failed after 3 attempts (${error}). Context data has been gathered but automated analysis could not be completed. Manual review is required.`,
  };
}

const RETRY_BACKOFF_MS = [2000, 5000, 10000];
const MAX_RETRIES = 3;
const AI_TIMEOUT_MS = 60000;

function isRetryableError(error: any): boolean {
  const msg = (error.message || "").toLowerCase();
  const status = error.status || error.statusCode || 0;
  if (status === 429) return true;
  if (status >= 500 && status <= 503) return true;
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("econnreset") || msg.includes("econnrefused")) return true;
  if (msg.includes("rate limit") || msg.includes("429")) return true;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("server error")) return true;
  return false;
}

function robustJsonParse(content: string): any {
  try {
    return JSON.parse(content);
  } catch (_e1) {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (_e2) {}
    }

    let cleaned = content.replace(/[\x00-\x1F\x7F]/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (_e3) {}

    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(cleaned);
    } catch (_e4) {}

    throw new Error("JSON parse failed after all cleanup attempts");
  }
}

async function runAIAnalysis(context: InvestigationContext, retrySteps?: any[]): Promise<InvestigationResult> {
  const { incident, relatedEvents, relatedIncidents, entityHistory } = context;

  const attackType = classifyAttackType(incident);

  const incidentDate = incident.created_at
    ? new Date(incident.created_at).toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
    : "Unknown date";
  const todayDate = new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  const incidentSummary = {
    id: incident.id,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    type: incident.incident_type,
    classifiedAttackType: attackType,
    source: incident.source,
    sourceIp: incident.source_ip,
    destinationIp: incident.destination_ip,
    affectedAssets: incident.affected_assets,
    mitreTactic: incident.mitre_tactic,
    mitreTechnique: incident.mitre_technique,
    killChainPhase: incident.kill_chain_phase,
    description: incident.description,
    enrichedDescription: incident.enriched_description,
    iocData: incident.ioc_data,
    contextualAnalysis: incident.contextual_analysis,
    threatNarrative: incident.threat_narrative,
    incidentDate: incidentDate,
    createdAt: incident.created_at,
  };

  const eventsContext = relatedEvents.slice(0, 50).map(e => ({
    type: e.event_type, severity: e.severity, threat: e.threat,
    target: e.target, attacker: e.attacker, asset: e.asset,
    action: e.action, logSource: e.log_source,
    mitre: e.mitre_tactic, occurredAt: e.occurred_at,
  }));

  const relatedIncSummary = relatedIncidents.map(i => ({
    id: i.id, title: i.title, severity: i.severity, status: i.status,
    sourceIp: i.source_ip, mitre: i.mitre_tactic, createdAt: i.created_at,
  }));

  const prompt = `You are an elite AI SOC Analyst performing an autonomous investigation on a security incident. Think like a human security analyst: look at the full picture, correlate data points, and determine if this is a real threat or noise.

CURRENT DATE: ${todayDate}
INCIDENT DATE: ${incidentDate}

CRITICAL DATE & QUALITY RULES:
- Use the EXACT incident date "${incidentDate}" in your executive summary and timeline. NEVER default to "January 1" or any placeholder date.
- Each investigation MUST be uniquely tailored to this specific incident. Reference the actual sender addresses, recipient emails, subject lines, IOC data, domain names, IP addresses, and detection details from the incident data below.
- NEVER produce generic boilerplate text. Every sentence must reference specific evidence from this incident.
- The executiveSummary must mention the actual date, actual threat actors/senders, actual targets/recipients, and the specific action taken.

CRITICAL ANALYSIS RULES:
- If the incident title contains operational/IT terms like "No Scans", "backup", "update", "maintenance", "health check", "license" — it is almost certainly a FALSE POSITIVE
- Look at the actual threat indicators: Are there real malicious IPs, hashes, domains, or suspicious behaviors?
- Consider the source and context: EDR alerts about actual malware execution are high confidence; generic monitoring alerts are low confidence
- A true positive MUST have concrete evidence of malicious activity, not just an alert title
- If evidence is weak or purely informational, classify as false_positive with clear reasoning

INCIDENT UNDER INVESTIGATION:
${JSON.stringify(incidentSummary, null, 2)}

RELATED SECURITY EVENTS (${relatedEvents.length} total, showing top 50):
${JSON.stringify(eventsContext, null, 2)}

RELATED INCIDENTS IN LAST 30 DAYS:
${JSON.stringify(relatedIncSummary, null, 2)}

ENTITY HISTORY (behavioral baseline):
${JSON.stringify(entityHistory, null, 2)}

INVESTIGATION TASKS:
1. TRIAGE: Classify the incident - is this a true threat, false positive, or requires more data? Be critical and think like a human analyst.
2. SCOPE: Identify ALL affected entities (IPs, users, assets, domains) and their risk levels
3. ATTACK CHAIN: Map the full attack progression using MITRE ATT&CK framework (only if true positive)
4. LATERAL MOVEMENT: Determine if the attacker moved laterally across systems
5. DATA EXFILTRATION: Assess if any data was or could be exfiltrated
6. PERSISTENCE: Identify any persistence mechanisms established
7. CAMPAIGN DETECTION: Determine if this is part of a larger campaign (link related incidents)
8. CONTAINMENT: Provide specific, prioritized containment actions
9. REMEDIATION: Provide step-by-step remediation plan
10. PREVENTION: Recommend measures to prevent recurrence

Return a JSON object with this exact structure:
{
  "findings": {
    "timeline": [{"timestamp": "ISO date or relative", "event": "description", "severity": "critical|high|medium|low", "source": "log source"}],
    "affectedEntities": [{"type": "ip|user|asset|domain|email", "value": "...", "riskLevel": "critical|high|medium|low", "details": "why this entity is relevant"}],
    "lateralMovement": true/false,
    "dataExfiltration": true/false,
    "persistenceMechanisms": ["list of identified persistence mechanisms"],
    "attackComplexity": "sophisticated|moderate|basic|automated",
    "attackVector": "description of the primary attack vector"
  },
  "recommendations": {
    "containmentActions": [{"action": "specific action", "priority": "critical|high|medium|low", "urgency": "immediate|within_1h|within_24h|within_week"}],
    "remediationSteps": [{"step": "specific step", "owner": "SOC|IT|Management|CISO", "timeline": "timeframe"}],
    "preventionMeasures": ["specific prevention measures"]
  },
  "executiveSummary": "2-3 paragraph executive summary suitable for CISO briefing",
  "technicalReport": "Detailed technical analysis with IOCs, TTPs, and forensic evidence",
  "riskScore": 0-100,
  "confidenceScore": 0-100,
  "attackChain": [{"phase": "MITRE tactic or kill chain phase", "description": "what happened", "evidence": "supporting evidence from logs"}],
  "iocsSummary": [{"type": "ip|domain|hash|url|email", "value": "...", "reputation": "malicious|suspicious|clean", "context": "where/how this IOC was observed"}],
  "relatedIncidentIds": [list of related incident IDs that are part of the same campaign],
  "campaignName": "if part of campaign, suggest a name",
  "threatActorProfile": "assessment of threat actor sophistication and likely motivation",
  "verdict": "true_positive OR false_positive OR inconclusive",
  "verdictReasoning": "2-3 sentence justification for the verdict determination based on evidence strength, IOC reputation, behavioral analysis, and threat correlation",
  "attackType": "${attackType}",
  "emailTemplateType": "malware|phishing|brute_force|ransomware|network_intrusion|web_app_attack|vuln_exploit|social_engineering|generic"
}`;

  let lastError: any = null;
  const steps = retrySteps || [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const backoffMs = RETRY_BACKOFF_MS[attempt - 2] || 10000;
        console.log(`[AI SOC] Retry attempt ${attempt}/${MAX_RETRIES}, waiting ${backoffMs}ms...`);
        steps.push({ step: "ai_retry", action: `Retry attempt ${attempt}/${MAX_RETRIES}`, result: `Waiting ${backoffMs}ms before retry (previous error: ${lastError?.message || "unknown"})`, timestamp: new Date().toISOString() });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);
      let response;
      try {
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 4000,
        }, { signal: abortController.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      const content = response.choices[0]?.message?.content || "{}";
      let analysis: any;
      try {
        analysis = robustJsonParse(content);
      } catch (parseErr: any) {
        console.error(`[AI SOC] JSON parse error on attempt ${attempt}:`, parseErr.message);
        if (attempt < MAX_RETRIES) {
          lastError = parseErr;
          continue;
        }
        throw parseErr;
      }

      const riskScore = typeof analysis.riskScore === "number" ? analysis.riskScore : parseInt(analysis.riskScore) || 50;
      const confidenceScore = typeof analysis.confidenceScore === "number" ? analysis.confidenceScore : parseInt(analysis.confidenceScore) || 50;

      return {
        status: "completed",
        findings: {
          timeline: analysis.findings?.timeline || [],
          affectedEntities: analysis.findings?.affectedEntities || [],
          lateralMovement: analysis.findings?.lateralMovement || false,
          dataExfiltration: analysis.findings?.dataExfiltration || false,
          persistenceMechanisms: analysis.findings?.persistenceMechanisms || [],
          attackComplexity: analysis.findings?.attackComplexity || "unknown",
          attackVector: analysis.findings?.attackVector || "unknown",
        },
        recommendations: {
          containmentActions: analysis.recommendations?.containmentActions || [],
          remediationSteps: analysis.recommendations?.remediationSteps || [],
          preventionMeasures: analysis.recommendations?.preventionMeasures || [],
        },
        executiveSummary: analysis.executiveSummary || "Investigation completed but no summary generated.",
        technicalReport: analysis.technicalReport || "No technical details available.",
        riskScore: Math.min(100, Math.max(0, riskScore)),
        confidenceScore: Math.min(100, Math.max(0, confidenceScore)),
        attackChain: analysis.attackChain || [],
        iocsSummary: analysis.iocsSummary || [],
        relatedIncidentIds: (analysis.relatedIncidentIds || []).map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)),
        investigationSteps: steps,
        verdict: analysis.verdict || "inconclusive",
        verdictReasoning: analysis.verdictReasoning || "Verdict could not be determined.",
      };
    } catch (error: any) {
      lastError = error;
      console.error(`[AI SOC] AI analysis error (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

      if (!isRetryableError(error) && !(error.message || "").includes("JSON parse")) {
        console.error("[AI SOC] Non-retryable error, failing immediately");
        steps.push({ step: "ai_error", action: `Non-retryable error on attempt ${attempt}`, result: error.message, timestamp: new Date().toISOString() });
        break;
      }

      if (attempt === MAX_RETRIES) {
        console.error(`[AI SOC] All ${MAX_RETRIES} retry attempts exhausted`);
        steps.push({ step: "ai_exhausted", action: `All ${MAX_RETRIES} attempts failed`, result: error.message, timestamp: new Date().toISOString() });
      }
    }
  }

  return generateFallbackResult(context, lastError?.message || "AI analysis failed after all retries", steps);
}

export async function investigateIncident(
  tenantId: number,
  incidentId: number,
  investigationType: string = "auto_triage"
): Promise<{ investigationId: number; result: InvestigationResult }> {
  try {
    const stuckCleanup = await pool.query(
      `UPDATE ai_investigations SET status = 'failed', 
        investigation_steps = investigation_steps || $1::jsonb,
        completed_at = NOW()
       WHERE tenant_id = $2 AND status IN ('queued', 'investigating') 
        AND started_at < NOW() - INTERVAL '10 minutes'
       RETURNING id, incident_id`,
      [JSON.stringify([{ step: "timeout_cleanup", action: "Auto-cleanup of stuck investigation", result: "Investigation was stuck for >10 minutes and was marked as failed", timestamp: new Date().toISOString() }]), tenantId]
    );
    if (stuckCleanup.rows.length > 0) {
      console.log(`[AI SOC] Cleaned up ${stuckCleanup.rows.length} stuck investigations: ${stuckCleanup.rows.map((r: any) => r.id).join(", ")}`);
    }
  } catch (cleanupErr: any) {
    console.error(`[AI SOC] Stuck investigation cleanup error: ${cleanupErr.message}`);
  }

  const existing = await pool.query(
    `SELECT id, status FROM ai_investigations WHERE incident_id = $1 AND tenant_id = $2 AND status IN ('queued', 'investigating') LIMIT 1`,
    [incidentId, tenantId]
  );
  if (existing.rows.length > 0) {
    throw new Error(`Investigation already in progress (ID: ${existing.rows[0].id})`);
  }

  const insertResult = await pool.query(
    `INSERT INTO ai_investigations (tenant_id, incident_id, status, investigation_type, started_at, investigation_steps)
     VALUES ($1, $2, 'investigating', $3, NOW(), $4) RETURNING id`,
    [tenantId, incidentId, investigationType, JSON.stringify([
      { step: "initialization", action: "Starting investigation", result: "Investigation queued", timestamp: new Date().toISOString() }
    ])]
  );
  const investigationId = insertResult.rows[0].id;

  const steps: any[] = [
    { step: "initialization", action: "Starting investigation", result: "Investigation initiated", timestamp: new Date().toISOString() }
  ];

  try {
    steps.push({ step: "context_gathering", action: "Collecting incident data, related events, and entity history", result: "Gathering context...", timestamp: new Date().toISOString() });
    await pool.query(`UPDATE ai_investigations SET investigation_steps = $1 WHERE id = $2`, [JSON.stringify(steps), investigationId]);

    const context = await gatherContext(tenantId, incidentId);
    steps[steps.length - 1].result = `Gathered: ${context.relatedEvents.length} events, ${context.relatedIncidents.length} related incidents, ${Object.keys(context.entityHistory).length} entity profiles`;

    steps.push({ step: "fp_screening", action: "Screening for false positive patterns", result: "Screening...", timestamp: new Date().toISOString() });
    await pool.query(`UPDATE ai_investigations SET investigation_steps = $1 WHERE id = $2`, [JSON.stringify(steps), investigationId]);

    const fpCheck = await isLikelyFalsePositive(context.incident, tenantId);
    if (fpCheck.isFP && fpCheck.confidence >= 80) {
      steps[steps.length - 1].result = `Likely false positive detected: ${fpCheck.reason}`;
      steps.push({ step: "auto_classification", action: "Auto-classifying as false positive", result: fpCheck.reason, timestamp: new Date().toISOString() });

      const autoResult: InvestigationResult = {
        status: "completed",
        findings: {
          timeline: [],
          affectedEntities: [],
          lateralMovement: false,
          dataExfiltration: false,
          persistenceMechanisms: [],
          attackComplexity: "none",
          attackVector: "N/A - False Positive",
        },
        recommendations: {
          containmentActions: [],
          remediationSteps: [{ step: "No action required — this is an operational alert, not a security threat.", owner: "SOC", timeline: "N/A" }],
          preventionMeasures: ["Consider tuning detection rules to suppress this alert pattern", "Add to false positive suppression list"],
        },
        executiveSummary: `This incident was automatically classified as a false positive. ${fpCheck.reason}. No security threat was identified and no remediation action is required.`,
        technicalReport: `Automated FP screening identified this as a non-security operational alert. Pattern: ${fpCheck.reason}. Confidence: ${fpCheck.confidence}%.`,
        riskScore: 0,
        confidenceScore: fpCheck.confidence,
        attackChain: [],
        iocsSummary: [],
        relatedIncidentIds: [],
        investigationSteps: steps,
        verdict: "false_positive",
        verdictReasoning: fpCheck.reason,
      };

      await pool.query(
        `UPDATE ai_investigations SET
          status = 'completed', findings = $1, recommendations = $2,
          executive_summary = $3, technical_report = $4, risk_score = $5,
          confidence_score = $6, investigation_steps = $7,
          verdict = $8, verdict_reasoning = $9, completed_at = NOW()
         WHERE id = $10`,
        [
          JSON.stringify(autoResult.findings),
          JSON.stringify(autoResult.recommendations),
          autoResult.executiveSummary,
          autoResult.technicalReport,
          autoResult.riskScore,
          autoResult.confidenceScore,
          JSON.stringify(steps),
          "false_positive",
          fpCheck.reason,
          investigationId,
        ]
      );

      await pool.query(
        `UPDATE incidents SET classification = 'false_positive', is_true_positive = false WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId]
      );

      return { investigationId, result: autoResult };
    }

    steps[steps.length - 1].result = fpCheck.isFP ? `Possible FP (${fpCheck.reason}), proceeding with AI analysis` : "Not a false positive, proceeding with AI analysis";

    steps.push({ step: "agent_pipeline", action: "Launching multi-agent investigation pipeline", result: "Starting agents...", timestamp: new Date().toISOString() });
    await pool.query(`UPDATE ai_investigations SET investigation_steps = $1 WHERE id = $2`, [JSON.stringify(steps), investigationId]);

    let feedbackHistory: AnalystFeedbackContext[] = [];
    try {
      const fbResult = await pool.query(
        `SELECT af.verdict_override, af.original_verdict, af.feedback_notes, af.severity_override,
                i.incident_type
         FROM analyst_feedback af
         JOIN incidents i ON i.id = af.incident_id
         WHERE af.tenant_id = $1 AND af.verdict_override IS NOT NULL
           AND i.incident_type = $2
         ORDER BY af.created_at DESC LIMIT 10`,
        [tenantId, context.incident.incident_type || ""]
      );
      feedbackHistory = fbResult.rows.map((r: any) => ({
        incidentType: r.incident_type || "",
        originalVerdict: r.original_verdict || "",
        correctedVerdict: r.verdict_override || "",
        notes: r.feedback_notes || "",
        severity: r.severity_override || "",
      }));
    } catch {}

    const attackType = classifyAttackType(context.incident);

    const pipelineResult: AgentPipelineResult = await executeAgentPipeline(
      tenantId,
      incidentId,
      context.incident,
      context.relatedEvents,
      context.relatedIncidents,
      context.entityHistory,
      context.assetInfo,
      context.tenantName,
      attackType,
      feedbackHistory,
      async (agentStep) => {
        steps.push(agentStep);
        await pool.query(`UPDATE ai_investigations SET investigation_steps = $1 WHERE id = $2`, [JSON.stringify(steps), investigationId]);
      },
    );

    const reportData = pipelineResult.agentMessages.find(m => m.agentName === "Report Agent")?.output?.data || {};
    const correlationData = pipelineResult.agentMessages.find(m => m.agentName === "Correlation Agent")?.output?.data || {};
    const threatIntelData = pipelineResult.agentMessages.find(m => m.agentName === "Threat Intel Agent")?.output?.data || {};
    const remediationData = pipelineResult.agentMessages.find(m => m.agentName === "Remediation Agent")?.output?.data || {};
    const behaviorData = pipelineResult.agentMessages.find(m => m.agentName === "Behavior Agent")?.output?.data || {};

    const result: InvestigationResult = {
      status: "completed",
      findings: {
        timeline: correlationData.timeline || [],
        affectedEntities: (correlationData.relatedIncidentCorrelation || []).map((r: any) => ({
          type: "incident", value: r.title, riskLevel: r.severity, details: `Incident #${r.incidentId}`,
        })),
        lateralMovement: correlationData.hasLateralMovement || behaviorData.lateralMovementIndicators > 0,
        dataExfiltration: behaviorData.dataExfiltrationRisk || false,
        persistenceMechanisms: (correlationData.attackStages || []).filter((s: any) => s.stage === "Persistence").flatMap((s: any) => s.events.map((e: any) => e.event)),
        attackComplexity: (correlationData.attackStages || []).length >= 4 ? "sophisticated" : (correlationData.attackStages || []).length >= 2 ? "moderate" : "basic",
        attackVector: reportData.attackType || attackType,
      },
      recommendations: {
        containmentActions: (remediationData.containmentActions || []).map((a: any) => ({
          action: a.action, priority: a.priority, urgency: a.urgency,
        })),
        remediationSteps: (remediationData.remediationSteps || []).map((s: any) => ({
          step: s.step, owner: s.owner, timeline: s.timeline,
        })),
        preventionMeasures: remediationData.preventionMeasures || [],
        signalIntelligence: remediationData.signalIntelligence || [],
        actionState: remediationData.actionState || "none",
        actionTaken: remediationData.actionTaken || "",
        securityDomain: remediationData.securityDomain || "endpoint",
        isRemediated: remediationData.isRemediated || false,
        recommendationFocus: remediationData.recommendationFocus || "reactive",
        soarReadyCount: remediationData.soarReadyCount || 0,
      },
      executiveSummary: reportData.executiveSummary || `Multi-agent investigation completed for "${context.incident.title}".`,
      technicalReport: reportData.technicalReport || "See agent pipeline for details.",
      riskScore: pipelineResult.decisionMetrics.riskScore,
      confidenceScore: pipelineResult.decisionMetrics.confidenceScore,
      attackChain: (correlationData.attackStages || []).map((s: any) => ({
        phase: s.stage,
        description: summarizeAttackPhase(s.stage, s.events),
        evidence: `${s.events.length} events, confidence: ${s.confidence}%`,
      })),
      iocsSummary: (threatIntelData.iocs || []).filter((i: any) => i.reputation !== "clean").map((i: any) => ({
        type: i.type, value: i.value, reputation: i.reputation, context: i.context,
      })),
      relatedIncidentIds: (correlationData.relatedIncidentCorrelation || []).map((r: any) => r.incidentId).filter(Boolean),
      investigationSteps: steps,
      verdict: reportData.verdict || "inconclusive",
      verdictReasoning: reportData.verdictReasoning || "Verdict determined by multi-agent analysis pipeline.",
    };

    // ── POST-PIPELINE FP SAFETY NET ────────────────────────────────────────────
    // If pipeline produced "inconclusive" but the title clearly matches an
    // operational FP pattern, override the verdict. This handles cases where
    // the Risk Scoring Agent ran before the FP title override was in place.
    const fpTitleCheck = await isLikelyFalsePositive(context.incident, tenantId);
    if (result.verdict === "inconclusive" && fpTitleCheck.isFP && fpTitleCheck.confidence >= 85) {
      result.verdict = "false_positive";
      result.riskScore = 0;
      result.verdictReasoning = `Post-pipeline FP override: ${fpTitleCheck.reason}. The incident title indicates an operational/monitoring alert with no security threat indicators.`;
      result.executiveSummary = `This investigation has been reclassified as a false positive. The alert "${context.incident.title}" is an operational monitoring notification from ${context.incident.source || "the detection source"}, not a security threat. No remediation action is required. ${fpTitleCheck.reason}.`;
      steps.push({ step: "fp_override", action: "Post-pipeline FP override applied", result: fpTitleCheck.reason, timestamp: new Date().toISOString() });
      result.investigationSteps = steps;
      await pool.query(
        `UPDATE incidents SET classification = 'false_positive', is_true_positive = false WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId]
      );
    }
    // ── END POST-PIPELINE FP SAFETY NET ───────────────────────────────────────

    steps.push({
      step: "pipeline_complete",
      action: `Multi-agent pipeline completed (${pipelineResult.agentCount} agents, ${pipelineResult.totalDuration}ms)`,
      result: `Risk=${result.riskScore}, Confidence=${result.confidenceScore}, Verdict=${result.verdict}`,
      timestamp: new Date().toISOString(),
    });
    result.investigationSteps = steps;

    await pool.query(
      `UPDATE ai_investigations SET
        status = 'completed', findings = $1, recommendations = $2,
        executive_summary = $3, technical_report = $4, risk_score = $5,
        confidence_score = $6, related_incident_ids = $7, investigation_steps = $8,
        attack_chain = $9, iocs_summary = $10, affected_entities = $11,
        verdict = $12, verdict_reasoning = $13,
        decision_metrics = $14, agent_pipeline = $15, investigation_plan = $16,
        completed_at = NOW()
       WHERE id = $17`,
      [
        JSON.stringify(result.findings),
        JSON.stringify(result.recommendations),
        result.executiveSummary,
        result.technicalReport,
        result.riskScore,
        result.confidenceScore,
        result.relatedIncidentIds.length > 0 ? result.relatedIncidentIds : null,
        JSON.stringify(result.investigationSteps),
        JSON.stringify(result.attackChain),
        JSON.stringify(result.iocsSummary),
        JSON.stringify(result.findings.affectedEntities),
        result.verdict || "inconclusive",
        result.verdictReasoning || null,
        JSON.stringify(pipelineResult.decisionMetrics),
        JSON.stringify(pipelineResult.agentMessages.map(m => ({
          agentName: m.agentName,
          status: m.output.status,
          duration: m.output.duration,
          confidence: m.output.confidence,
          reasoning: m.output.reasoning,
          evidenceRefs: m.output.evidenceRefs,
          data: m.output.data,
          startedAt: m.startedAt,
          completedAt: m.completedAt,
        }))),
        JSON.stringify(pipelineResult.plan),
        investigationId,
      ]
    );

    if (result.verdict === "false_positive") {
      await pool.query(
        `UPDATE incidents SET classification = 'false_positive', is_true_positive = false WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId]
      );
    } else if (result.verdict === "true_positive") {
      await pool.query(
        `UPDATE incidents SET classification = 'true_positive', is_true_positive = true WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId]
      );
    }

    if (result.verdict === "true_positive" || result.verdict === "inconclusive") {
      try {
        const { generateNotificationEmail } = await import("./notification-templates");
        const tenantResult = await pool.query(`SELECT name, timezone FROM tenants WHERE id = $1`, [tenantId]);
        const tenantInfo = tenantResult.rows[0] || { name: "Unknown", timezone: "UTC" };
        const domain = classifySecurityDomain(context.incident);
        const baseUrl = process.env.APP_BASE_URL || process.env.BASE_URL || "http://localhost:5000";

        const emailContent = generateNotificationEmail({
          incident: context.incident,
          investigation: {
            ...result,
            riskScore: result.riskScore,
            confidenceScore: result.confidenceScore,
            verdictReasoning: result.verdictReasoning,
          },
          tenant: tenantInfo,
          actionToken: "draft-preview",
          baseUrl,
          domain,
        });

        await pool.query(
          `INSERT INTO incident_notifications (tenant_id, incident_id, investigation_id, recipients, notification_type, domain, verdict, email_subject, email_body, status, created_at)
           VALUES ($1, $2, $3, $4, 'auto_generated', $5, $6, $7, $8, 'draft', NOW())`,
          [
            tenantId, incidentId, investigationId,
            [], domain.toLowerCase().replace(/\s+/g, "_"),
            result.verdict, emailContent.subject, emailContent.html,
          ]
        );
        console.log(`[AI SOC] Auto-generated email draft for investigation ${investigationId}`);
      } catch (emailErr: any) {
        console.error(`[AI SOC] Failed to auto-generate email draft: ${emailErr.message}`);
      }
    }

    return { investigationId, result };
  } catch (error: any) {
    console.error(`[AI SOC] Investigation failed for incident ${incidentId}:`, error.message);
    steps.push({ step: "error", action: "Investigation failed", result: error.message, timestamp: new Date().toISOString() });
    await pool.query(
      `UPDATE ai_investigations SET status = 'failed', investigation_steps = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify(steps), investigationId]
    );
    throw error;
  }
}

function summarizeAttackPhase(stage: string, events: any[]): string {
  if (!events || events.length === 0) return stage;

  const cleanText = (raw: string): string => {
    if (!raw) return "";
    let text = raw;
    try { text = decodeURIComponent(text); } catch {}
    try { text = decodeURIComponent(text); } catch {}

    text = text
      .replace(/\b[a-f0-9]{32,}\b/gi, "")
      .replace(/master_ref_id%3D[^\s&]+/gi, "")
      .replace(/master_ref_id=[^\s&]+/gi, "")
      .replace(/batch_name[=%3D][^\s&,]+/gi, "")
      .replace(/activity_type[=%3D][^\s&,]+/gi, "")
      .replace(/activity_name[=%3D][^\s&,]+/gi, "")
      .replace(/febnotify[^\s,]*/gi, "")
      .replace(/\bRef:\s*[A-Fa-f0-9-]{20,}/g, "")
      .replace(/\b\d{10,}\b/g, "")
      .replace(/_\d{3}X__\d+/g, "")
      .replace(/[=%]3D/g, "=")
      .replace(/[=%]26/g, "&")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*[&]\s*/g, " ")
      .trim();
    return text;
  };

  const emails = new Set<string>();
  const subjects = new Set<string>();
  const ips = new Set<string>();
  const actions = new Set<string>();
  const sources = new Set<string>();
  const hosts = new Set<string>();

  for (const evt of events) {
    const raw = evt.event || "";
    const cleaned = cleanText(raw);

    const emailMatches = cleaned.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g);
    if (emailMatches) emailMatches.forEach(e => emails.add(e.toLowerCase()));

    const ipMatches = cleaned.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
    if (ipMatches) ipMatches.forEach(ip => ips.add(ip));

    const subjectMatch = raw.match(/(?:subject[:\s]*|")\s*([^"]{5,80})/i);
    if (subjectMatch) subjects.add(subjectMatch[1].trim());

    if (/quarantined/i.test(raw)) actions.add("quarantined");
    if (/blocked/i.test(raw)) actions.add("blocked");
    if (/detected/i.test(raw)) actions.add("detected");
    if (/isolated/i.test(raw)) actions.add("isolated");
    if (/delivered/i.test(raw)) actions.add("delivered");

    if (evt.source) sources.add(evt.source);

    const hostMatch = cleaned.match(/(?:host|hostname|machine|endpoint)[:\s=]+([A-Za-z0-9_-]{3,30})/i);
    if (hostMatch) hosts.add(hostMatch[1]);
  }

  const parts: string[] = [];

  const emailArr = Array.from(emails);
  const senderEmails: string[] = [];
  const recipientEmails: string[] = [];
  for (const evt of events) {
    const raw = evt.event || "";
    const recipMatch = raw.match(/(?:recipient|to|target)[:\s=]+\s*([\w.+-]+@[\w.-]+)/i);
    const senderMatch = raw.match(/(?:sender|from)[:\s=]+\s*([\w.+-]+@[\w.-]+)/i);
    if (recipMatch) recipientEmails.push(recipMatch[1].toLowerCase());
    if (senderMatch) senderEmails.push(senderMatch[1].toLowerCase());
  }
  if (senderEmails.length === 0 && recipientEmails.length === 0 && emailArr.length > 0) {
    const domainCounts: Record<string, number> = {};
    emailArr.forEach(e => { const d = e.split("@")[1]; domainCounts[d] = (domainCounts[d] || 0) + 1; });
    const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
    const orgDomain = sortedDomains[0]?.[0];
    emailArr.forEach(e => {
      if (e.split("@")[1] === orgDomain) recipientEmails.push(e);
      else senderEmails.push(e);
    });
  }
  const uniqueSenders = [...new Set(senderEmails)];
  const uniqueRecipients = [...new Set(recipientEmails)];

  if (stage === "Initial Access" || stage === "Execution") {
    if (uniqueSenders.length > 0 || events.some(e => /phish|email|mail/i.test(e.event || ""))) {
      const senders = uniqueSenders.length > 0 ? uniqueSenders.slice(0, 2).join(", ") : "external sender";
      const recipients = uniqueRecipients.length > 0 ? `targeting ${uniqueRecipients.slice(0, 2).join(", ")}` : "";
      const subjectStr = subjects.size > 0 ? ` with subject "${Array.from(subjects)[0]}"` : "";
      const actionStr = actions.size > 0 ? ` — ${Array.from(actions).join(", ")}` : "";
      parts.push(`${events.length > 1 ? events.length + " p" : "P"}hishing email${events.length > 1 ? "s" : ""} from ${senders} ${recipients}${subjectStr}${actionStr}`);
    } else if (ips.size > 0) {
      parts.push(`${events.length} event${events.length > 1 ? "s" : ""} detected from ${Array.from(ips).slice(0, 3).join(", ")}${actions.size > 0 ? " — " + Array.from(actions).join(", ") : ""}`);
    } else {
      parts.push(`${events.length} ${stage.toLowerCase()} event${events.length > 1 ? "s" : ""} detected${actions.size > 0 ? " — " + Array.from(actions).join(", ") : ""}`);
    }
  } else if (stage === "Command & Control" || stage === "Exfiltration") {
    if (ips.size > 0) {
      parts.push(`Suspicious communication detected with ${Array.from(ips).slice(0, 3).join(", ")}${events.length > 1 ? ` across ${events.length} events` : ""}`);
    } else if (emails.size > 0) {
      parts.push(`${stage} activity involving ${Array.from(emails).slice(0, 2).join(", ")}${events.length > 1 ? ` (${events.length} events)` : ""}`);
    } else {
      parts.push(`${events.length} ${stage.toLowerCase()} event${events.length > 1 ? "s" : ""} identified`);
    }
    if (actions.size > 0) parts[parts.length - 1] += ` — ${Array.from(actions).join(", ")}`;
  } else if (stage === "Lateral Movement") {
    if (hosts.size > 0) {
      parts.push(`Lateral movement detected across ${Array.from(hosts).slice(0, 3).join(", ")}${ips.size > 0 ? ` from ${Array.from(ips)[0]}` : ""}`);
    } else {
      parts.push(`${events.length} lateral movement indicator${events.length > 1 ? "s" : ""} detected`);
    }
  } else if (stage === "Reconnaissance" || stage === "Discovery") {
    if (ips.size > 0) {
      parts.push(`Scanning/reconnaissance activity from ${Array.from(ips).slice(0, 3).join(", ")} — ${events.length} events`);
    } else {
      parts.push(`${events.length} reconnaissance/discovery event${events.length > 1 ? "s" : ""} detected`);
    }
  } else {
    if (ips.size > 0 || emails.size > 0 || hosts.size > 0) {
      const entities = [...Array.from(ips).slice(0, 2), ...Array.from(emails).slice(0, 2), ...Array.from(hosts).slice(0, 2)];
      parts.push(`${events.length} ${stage.toLowerCase()} event${events.length > 1 ? "s" : ""} involving ${entities.join(", ")}${actions.size > 0 ? " — " + Array.from(actions).join(", ") : ""}`);
    } else {
      parts.push(`${events.length} ${stage.toLowerCase()} event${events.length > 1 ? "s" : ""} detected${actions.size > 0 ? " — " + Array.from(actions).join(", ") : ""}`);
    }
  }

  if (sources.size > 0) {
    const srcList = Array.from(sources).filter(s => s !== "unknown" && s !== "detection").slice(0, 2);
    if (srcList.length > 0) parts.push(`Source: ${srcList.join(", ")}`);
  }

  return parts.join(". ").replace(/\.\./g, ".").replace(/\s{2,}/g, " ").trim();
}

export function classifySecurityDomain(incident: any): string {
  const source = (incident.source || "").toLowerCase();
  const category = (incident.category || "").toLowerCase();
  const type = (incident.incident_type || incident.incidentType || "").toLowerCase();
  const title = (incident.title || "").toLowerCase();

  if (source.includes("email") || source.includes("harmony email") || category.includes("email") || type.includes("phish") || type.includes("spam") || type.includes("bec") || title.includes("phishing") || title.includes("spam")) return "Email";
  if (source.includes("endpoint") || source.includes("edr") || source.includes("cynet") || category.includes("endpoint") || type.includes("malware") || type.includes("ransomware") || title.includes("endpoint")) return "Endpoint";
  if (source.includes("network") || source.includes("firewall") || source.includes("ids") || source.includes("ips") || category.includes("network") || type.includes("intrusion") || type.includes("ddos")) return "Network";
  if (source.includes("waf") || source.includes("web") || category.includes("web") || type.includes("injection") || type.includes("xss") || type.includes("csrf")) return "Web App";
  if (source.includes("cloud") || source.includes("aws") || source.includes("azure") || source.includes("gcp") || source.includes("casb") || source.includes("sse") || category.includes("cloud") || category.includes("casb")) return "Cloud";
  if (source.includes("identity") || source.includes("iam") || source.includes("active directory") || source.includes("ldap") || category.includes("identity") || type.includes("credential") || type.includes("brute") || type.includes("unauthorized")) return "Identity";

  return "Endpoint";
}

export async function getAnalystOverview(tenantId: number): Promise<any> {
  const [invStats, domainStats, riskDist, recentInv, queueCount] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) as cnt FROM ai_investigations WHERE tenant_id = $1 GROUP BY status`, [tenantId]),
    pool.query(
      `SELECT i.source, i.category, i.incident_type, COUNT(ai.id) as investigated,
              COUNT(CASE WHEN ai.id IS NULL THEN 1 END) as uninvestigated
       FROM incidents i
       LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.severity IN ('critical', 'high')
       GROUP BY i.source, i.category, i.incident_type`, [tenantId]
    ),
    pool.query(
      `SELECT risk_score, COUNT(*) as cnt FROM ai_investigations WHERE tenant_id = $1 AND status = 'completed' AND risk_score IS NOT NULL
       GROUP BY risk_score ORDER BY risk_score`, [tenantId]
    ),
    pool.query(
      `SELECT ai.id, ai.incident_id, ai.status, ai.investigation_type, ai.risk_score, ai.confidence_score,
              ai.executive_summary, ai.verdict, ai.verdict_reasoning, ai.created_at, ai.completed_at,
              i.title as incident_title, i.severity as incident_severity, i.source as incident_source,
              i.category as incident_category, i.incident_type
       FROM ai_investigations ai
       JOIN incidents i ON i.id = ai.incident_id
       WHERE ai.tenant_id = $1
         AND (ai.verdict IS NULL OR ai.verdict != 'false_positive')
         AND i.title NOT ILIKE '%no scans in group%'
         AND i.title NOT ILIKE '%scheduled task completed%'
         AND i.title NOT ILIKE '%backup job%'
         AND i.title NOT ILIKE '%health check%'
         AND i.title NOT ILIKE '%heartbeat%'
         AND i.title NOT ILIKE '%agent offline%'
         AND i.title NOT ILIKE '%agent disconnected%'
         AND i.title NOT ILIKE '%connectivity restored%'
         AND i.title NOT ILIKE '%signature update%'
         AND i.title NOT ILIKE '%definition update%'
       ORDER BY ai.created_at DESC LIMIT 20`, [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*) as cnt FROM incidents i
       LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.severity IN ('critical', 'high') AND ai.id IS NULL`, [tenantId]
    ),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalInv = 0;
  for (const row of invStats.rows) { statusCounts[row.status] = parseInt(row.cnt); totalInv += parseInt(row.cnt); }

  const avgRiskResult = await pool.query(
    `SELECT COALESCE(AVG(risk_score), 0) as avg_risk FROM ai_investigations WHERE tenant_id = $1 AND status = 'completed'`, [tenantId]
  );

  const domainBreakdown: Record<string, { critical: number; high: number; investigated: number; total: number }> = {
    "Endpoint": { critical: 0, high: 0, investigated: 0, total: 0 },
    "Email": { critical: 0, high: 0, investigated: 0, total: 0 },
    "Network": { critical: 0, high: 0, investigated: 0, total: 0 },
    "Web App": { critical: 0, high: 0, investigated: 0, total: 0 },
    "Cloud": { critical: 0, high: 0, investigated: 0, total: 0 },
    "Identity": { critical: 0, high: 0, investigated: 0, total: 0 },
  };

  for (const row of domainStats.rows) {
    const domain = classifySecurityDomain(row);
    if (!domainBreakdown[domain]) domainBreakdown[domain] = { critical: 0, high: 0, investigated: 0, total: 0 };
    const total = parseInt(row.investigated) + parseInt(row.uninvestigated);
    domainBreakdown[domain].total += total;
    domainBreakdown[domain].investigated += parseInt(row.investigated);
  }

  const recentInvestigations = recentInv.rows.map(r => ({
    ...r,
    domain: classifySecurityDomain(r),
  }));

  return {
    totalInvestigations: totalInv,
    completed: statusCounts["completed"] || 0,
    inProgress: (statusCounts["investigating"] || 0) + (statusCounts["queued"] || 0),
    failed: statusCounts["failed"] || 0,
    avgRiskScore: Math.round(parseFloat(avgRiskResult.rows[0]?.avg_risk || "0")),
    queueSize: parseInt(queueCount.rows[0]?.cnt || "0"),
    domainBreakdown,
    recentInvestigations,
  };
}

export async function getInvestigationQueue(tenantId: number): Promise<any> {
  const criticalHigh = await pool.query(
    `SELECT i.id, i.title, i.severity, i.status, i.source, i.category, i.incident_type,
            i.source_ip, i.destination_ip, i.affected_assets, i.mitre_tactic, i.created_at,
            i.confidence_score, i.is_true_positive, i.classification
     FROM incidents i
     LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.severity IN ('critical', 'high') AND ai.id IS NULL
       AND (i.classification IS NULL OR i.classification != 'false_positive')
       AND (i.is_true_positive IS NULL OR i.is_true_positive != false)
     ORDER BY CASE WHEN i.severity = 'critical' THEN 0 ELSE 1 END, i.created_at DESC
     LIMIT 100`, [tenantId]
  );

  const recurrence = await pool.query(
    `SELECT i.source, i.category, i.incident_type, i.mitre_tactic, i.severity, COUNT(*) as cnt,
            MAX(i.created_at) as latest, MIN(i.created_at) as earliest
     FROM incidents i
     LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.severity IN ('low', 'medium') AND ai.id IS NULL
     GROUP BY i.source, i.category, i.incident_type, i.mitre_tactic, i.severity
     HAVING COUNT(*) >= 5
     ORDER BY COUNT(*) DESC LIMIT 20`, [tenantId]
  );

  const domainQueue: Record<string, any[]> = {
    "Endpoint": [], "Email": [], "Network": [], "Web App": [], "Cloud": [], "Identity": [],
  };

  let suppressedFP = 0;
  for (const inc of criticalHigh.rows) {
    const fpCheck = await isLikelyFalsePositive(inc, tenantId);
    if (fpCheck.isFP && fpCheck.confidence >= 80) {
      suppressedFP++;
      continue;
    }
    const domain = classifySecurityDomain(inc);
    if (!domainQueue[domain]) domainQueue[domain] = [];
    domainQueue[domain].push({ ...inc, domain });
  }

  const totalQueued = criticalHigh.rows.length - suppressedFP;

  return {
    domainQueue,
    totalQueued,
    suppressedFP,
    recurringLowMedium: recurrence.rows.map(r => ({
      ...r,
      cnt: parseInt(r.cnt),
      domain: classifySecurityDomain(r),
    })),
  };
}

// Derive a normalised "vector" for domain-aware matching.
// Returns one of: "endpoint" | "email" | "network" | "web" | "cloud" | "identity" | "unknown"
function resolveVector(incident: any): string {
  const src = (incident.source || "").toLowerCase();
  const cat = (incident.category || "").toLowerCase();
  const type = (incident.incident_type || incident.incidentType || "").toLowerCase();
  const title = (incident.title || incident.incident_title || "").toLowerCase();

  if (/email|harmony email|proofpoint|mimecast|office365.*mail|exchange|spam|phish|bec/i.test(src + " " + cat + " " + type + " " + title)) return "email";
  if (/endpoint|edr|cynet|crowdstrike|sentinel.?one|carbon.?black|defender.?endpoint|malware|ransomware/i.test(src + " " + cat + " " + type)) return "endpoint";
  if (/firewall|ids|ips|ndr|network|intrusion|ddos/i.test(src + " " + cat + " " + type)) return "network";
  if (/waf|web.?app|appsec|injection|xss|csrf|owasp/i.test(src + " " + cat + " " + type)) return "web";
  if (/cloud|aws|azure|gcp|casb|sse|saas/i.test(src + " " + cat + " " + type)) return "cloud";
  if (/identity|iam|active.?directory|ldap|okta|entra|brute|credential/i.test(src + " " + cat + " " + type)) return "identity";
  return "unknown";
}

// Build SQL conditions that scope to the same security domain (vector)
function buildDomainConditions(vector: string, paramIdx: number): { clause: string; params: string[] } {
  switch (vector) {
    case "email":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1} OR i.incident_type ILIKE $${paramIdx + 2})`, params: ["%email%", "%email%", "%phish%"] };
    case "endpoint":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1} OR i.source ILIKE $${paramIdx + 2} OR i.source ILIKE $${paramIdx + 3})`, params: ["%endpoint%", "%endpoint%", "%edr%", "%malware%"] };
    case "network":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1})`, params: ["%network%", "%network%"] };
    case "web":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1})`, params: ["%web%", "%web%"] };
    case "cloud":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1})`, params: ["%cloud%", "%cloud%"] };
    case "identity":
      return { clause: `(i.source ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx + 1})`, params: ["%identity%", "%identity%"] };
    default:
      return { clause: "", params: [] };
  }
}

export async function threatHunt(tenantId: number, investigationId: number): Promise<any> {
  const inv = await pool.query(
    `SELECT ai.*, i.title as incident_title, i.source_ip, i.destination_ip, i.affected_assets,
            i.mitre_tactic, i.mitre_technique_id, i.mitre_technique, i.kill_chain_phase,
            i.source, i.category, i.incident_type, i.description, i.ioc_data
     FROM ai_investigations ai
     JOIN incidents i ON i.id = ai.incident_id
     WHERE ai.id = $1 AND ai.tenant_id = $2`, [investigationId, tenantId]
  );
  if (inv.rows.length === 0) throw new Error("Investigation not found");
  const investigation = inv.rows[0];

  const attackType = classifyAttackType(investigation);
  const iocs = investigation.iocs_summary || [];
  const iocValues = iocs.map((i: any) => i.value).filter(Boolean).slice(0, 10);
  const mitreTactic = investigation.mitre_tactic;
  const mitreTechnique = investigation.mitre_technique || investigation.mitre_technique_id;
  const killChainPhase = investigation.kill_chain_phase;
  const incidentType = investigation.incident_type;
  const entities = (investigation.affected_entities || []).map((e: any) => e.value).filter(Boolean).slice(0, 10);
  const sourceIncident = investigation.source;

  // Resolve the domain/vector of the source investigation
  const sourceVector = resolveVector({
    source: sourceIncident,
    category: investigation.category,
    incident_type: incidentType,
    incident_title: investigation.incident_title,
  });

  const conditions: string[] = [];
  const params: any[] = [tenantId, investigation.incident_id];
  let paramIdx = 3;

  // IOC-based conditions (high-confidence, domain-agnostic — shared IPs/hashes span domains)
  if (iocValues.length > 0) {
    const iocConds = iocValues.map((_: any, i: number) => {
      return `(i.source_ip = $${paramIdx + i} OR i.destination_ip = $${paramIdx + i} OR i.affected_assets ILIKE $${paramIdx + i + iocValues.length})`;
    });
    conditions.push(`(${iocConds.join(" OR ")})`);
    params.push(...iocValues);
    params.push(...iocValues.map((v: string) => `%${v}%`));
    paramIdx += iocValues.length * 2;
  }

  // Entity-based conditions (shared assets/IPs — domain-agnostic)
  if (entities.length > 0) {
    const entConds = entities.map((_: any, i: number) => {
      return `(i.affected_assets ILIKE $${paramIdx + i} OR i.source_ip = $${paramIdx + entities.length + i} OR i.destination_ip = $${paramIdx + entities.length + i})`;
    });
    conditions.push(`(${entConds.join(" OR ")})`);
    params.push(...entities.map((v: string) => `%${v}%`));
    params.push(...entities);
    paramIdx += entities.length * 2;
  }

  // MITRE technique/tactic (important signal, but only within same domain — enforced in scoring)
  if (mitreTechnique) {
    conditions.push(`(i.mitre_technique = $${paramIdx} OR i.mitre_technique_id = $${paramIdx})`);
    params.push(mitreTechnique);
    paramIdx++;
  }

  if (mitreTactic) {
    conditions.push(`i.mitre_tactic = $${paramIdx}`);
    params.push(mitreTactic);
    paramIdx++;
  }

  if (killChainPhase) {
    conditions.push(`i.kill_chain_phase = $${paramIdx}`);
    params.push(killChainPhase);
    paramIdx++;
  }

  // Same detection source is a strong domain-specific signal
  if (sourceIncident) {
    conditions.push(`i.source = $${paramIdx}`);
    params.push(sourceIncident);
    paramIdx++;
  }

  // incident_type only used as a condition when combined with domain filter —
  // do NOT add it alone as it is too broad (both email and endpoint can be "malware")

  if (conditions.length === 0) {
    return { similar: [], huntedBy: "no_indicators", totalMatches: 0 };
  }

  // Build domain restriction clause — scope SQL to same vector when known
  let domainClause = "";
  const domainConditions = buildDomainConditions(sourceVector, paramIdx);
  if (domainConditions.clause) {
    domainClause = `AND (${domainConditions.clause})`;
    params.push(...domainConditions.params);
    paramIdx += domainConditions.params.length;
  }

  const similar = await pool.query(
    `SELECT i.id, i.title, i.severity, i.status, i.source, i.category, i.incident_type,
            i.source_ip, i.destination_ip, i.affected_assets, i.mitre_tactic, i.mitre_technique,
            i.mitre_technique_id, i.kill_chain_phase, i.created_at, i.confidence_score,
            ai.id as investigation_id, ai.status as inv_status, ai.risk_score, ai.verdict
     FROM incidents i
     LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.id != $2 ${domainClause} AND (${conditions.join(" OR ")})
     ORDER BY i.created_at DESC LIMIT 100`, params
  );

  const results = similar.rows.map((row: any) => {
    const matchReasons: string[] = [];
    let score = 0;
    let hasStrongSignal = false;

    // ── Domain / vector match check ────────────────────────────────────────
    const rowVector = resolveVector(row);
    const domainMatch = sourceVector === "unknown" || rowVector === "unknown" || rowVector === sourceVector;

    // If domains differ, this is a cross-domain result — heavy penalty and no strong signal
    if (!domainMatch) {
      return {
        ...row,
        domain: classifySecurityDomain(row),
        matchReasons: [`Cross-domain result suppressed (source: ${sourceVector}, match: ${rowVector})`],
        matchScore: 0,
        attackType: classifyAttackType(row),
        hasStrongSignal: false,
        domainMismatch: true,
      };
    }

    // ── Source match (same detection tool = very high confidence) ───────────
    if (sourceIncident && row.source === sourceIncident) {
      matchReasons.push(`Same detection source: ${sourceIncident}`);
      score += 20;
      hasStrongSignal = true;
    }

    // ── Incident type match — only awarded within same domain ────────────────
    if (incidentType && row.incident_type === incidentType) {
      matchReasons.push(`Same incident type: ${incidentType}`);
      score += domainMatch ? 25 : 5; // Generic without domain = low value
    }

    // ── Attack classification ────────────────────────────────────────────────
    const rowAttackType = classifyAttackType(row);
    if (rowAttackType === attackType && attackType !== "generic" && domainMatch) {
      matchReasons.push(`Same attack classification: ${attackType}`);
      score += 25;
      hasStrongSignal = true;
    }

    // ── Title similarity ─────────────────────────────────────────────────────
    const titleWords = (investigation.incident_title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w: string) => w.length > 3);
    const rowTitleWords = (row.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w: string) => w.length > 3);
    if (titleWords.length > 0 && rowTitleWords.length > 0) {
      const shared = titleWords.filter((w: string) => rowTitleWords.includes(w)).length;
      const similarity = shared / Math.max(titleWords.length, rowTitleWords.length);
      if (similarity >= 0.45) {
        matchReasons.push(`Title similarity: ${Math.round(similarity * 100)}%`);
        score += 20;
        if (domainMatch) hasStrongSignal = true;
      }
    }

    if (investigation.category && row.category === investigation.category) {
      matchReasons.push(`Same category: ${investigation.category}`);
      score += 10;
    }

    // ── MITRE technique (strong signal only when domain matches) ─────────────
    if (mitreTechnique && (row.mitre_technique === mitreTechnique || row.mitre_technique_id === mitreTechnique)) {
      matchReasons.push(`Same MITRE technique: ${mitreTechnique}`);
      score += domainMatch ? 30 : 10;
      if (domainMatch) hasStrongSignal = true;
    }

    if (mitreTactic && row.mitre_tactic === mitreTactic) {
      matchReasons.push(`Same MITRE tactic: ${mitreTactic}`);
      score += 8;
    }

    if (killChainPhase && row.kill_chain_phase === killChainPhase) {
      matchReasons.push(`Same Kill Chain phase: ${killChainPhase}`);
      score += 8;
    }

    // ── IOC / Entity matching (highest signal — domain-agnostic) ────────────
    for (const iocVal of iocValues) {
      if (row.source_ip === iocVal || row.destination_ip === iocVal) {
        matchReasons.push(`Shared IOC (exact): ${iocVal}`);
        score += 35;
        hasStrongSignal = true;
      } else if ((row.affected_assets || "").includes(iocVal)) {
        matchReasons.push(`Shared IOC (in assets): ${iocVal}`);
        score += 20;
        hasStrongSignal = true;
      }
    }

    for (const ent of entities) {
      if (row.source_ip === ent || row.destination_ip === ent) {
        matchReasons.push(`Same entity targeted: ${ent}`);
        score += 20;
        hasStrongSignal = true;
      } else if ((row.affected_assets || "").includes(ent)) {
        matchReasons.push(`Same asset affected: ${ent}`);
        score += 12;
      }
    }

    // ── Temporal proximity ───────────────────────────────────────────────────
    const rowTime = new Date(row.created_at).getTime();
    const incTime = new Date(investigation.created_at).getTime();
    const hoursDiff = Math.abs(rowTime - incTime) / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      matchReasons.push("Within 24 hours");
      score += 8;
    } else if (hoursDiff < 72) {
      matchReasons.push("Within 72 hours");
      score += 4;
    }

    return {
      ...row,
      domain: classifySecurityDomain(row),
      matchReasons: [...new Set(matchReasons)],
      matchScore: Math.min(100, score),
      attackType: rowAttackType,
      hasStrongSignal,
      domainMismatch: false,
      sourceVector,
      rowVector,
    };
  });

  // Require BOTH: minimum score threshold AND strong signal AND no domain mismatch
  const filtered = results.filter((r: any) => r.matchScore >= 45 && r.hasStrongSignal && !r.domainMismatch);
  filtered.sort((a: any, b: any) => b.matchScore - a.matchScore);

  const groupMap = new Map<string, any>();
  for (const item of filtered) {
    const normalizedTitle = (item.title || "").toLowerCase().trim();
    const itemDomainKey = classifySecurityDomain(item).toLowerCase();
    const groupKey = `${normalizedTitle}|${item.incident_type || ""}|${itemDomainKey}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        ...item,
        occurrenceCount: 1,
        targetTimeline: [],
        matchReasons: [...(item.matchReasons || [])],
      });
    } else {
      const group = groupMap.get(groupKey)!;
      group.occurrenceCount += 1;
      if (item.matchScore > group.matchScore) {
        const savedTimeline = group.targetTimeline;
        const savedCount = group.occurrenceCount;
        const savedReasons = group.matchReasons;
        Object.assign(group, item);
        group.targetTimeline = savedTimeline;
        group.occurrenceCount = savedCount;
        group.matchReasons = savedReasons;
      }
      for (const reason of (item.matchReasons || [])) {
        if (!group.matchReasons.includes(reason)) {
          group.matchReasons.push(reason);
        }
      }
    }

    const group = groupMap.get(groupKey)!;
    const itemDomain = classifySecurityDomain(item);
    const isEmailDomain = itemDomain === "Email" || (item.source || "").toLowerCase().includes("email") || (item.category || "").toLowerCase().includes("email");
    let target: string;
    if (isEmailDomain) {
      target = item.destination_ip || item.affected_assets?.split(",")[0]?.trim() || item.source_ip || "Unknown recipient";
    } else {
      // Try primary fields first, then fall back to parsing entity from description/title
      const primaryTarget = item.affected_assets?.split(",")[0]?.trim() || item.source_ip || item.destination_ip;
      if (primaryTarget && primaryTarget !== "unknown") {
        target = primaryTarget;
      } else {
        // Parse entity from description: Entity "hostname" triggered ...
        const descMatch = (item.description || "").match(/Entity "([^"]+)"/);
        // Parse entity from title suffix after em-dash: [Sigma] Multi-Stage Attack — ENTITY
        const titleMatch = (item.title || "").match(/—\s*(.+)$/);
        // Try iocData affectedEntities
        const iocEntity = Array.isArray(item.ioc_data?.affectedEntities) && item.ioc_data.affectedEntities[0]?.entity;
        const fallbackTarget = descMatch?.[1] || titleMatch?.[1]?.trim() || iocEntity || null;
        target = (fallbackTarget && fallbackTarget !== "unknown") ? fallbackTarget : (isEmailDomain ? "Unknown recipient" : "Unknown host");
      }
    }
    group.targetTimeline.push({
      target,
      timestamp: item.created_at,
      severity: item.severity,
      incidentId: item.id,
    });
  }

  const allGroups = Array.from(groupMap.values());
  for (const group of allGroups) {
    group.targetTimeline.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  const grouped = allGroups;
  grouped.sort((a: any, b: any) => b.matchScore - a.matchScore);

  return {
    similar: grouped.slice(0, 30),
    huntedBy: "ttps_iocs_patterns",
    totalMatches: filtered.length,
    groupedMatches: grouped.length,
    sourceInvestigation: {
      id: investigation.id,
      incidentId: investigation.incident_id,
      title: investigation.incident_title,
      attackType,
      mitreTactic,
      mitreTechnique,
      killChainPhase,
      incidentType,
      sourceVector,
    },
  };
}

export async function escalateRecurring(tenantId: number, source: string, category: string, incidentType: string): Promise<number> {
  const result = await pool.query(
    `SELECT i.id FROM incidents i
     LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.severity IN ('low', 'medium') AND ai.id IS NULL
       AND ($2::text IS NULL OR i.source = $2)
       AND ($3::text IS NULL OR i.category = $3)
       AND ($4::text IS NULL OR i.incident_type = $4)
     ORDER BY i.created_at DESC LIMIT 5`,
    [tenantId, source || null, category || null, incidentType || null]
  );

  let count = 0;
  for (const row of result.rows) {
    try {
      await investigateIncident(tenantId, row.id, "auto_triage");
      count++;
    } catch (err: any) {
      console.error(`[AI SOC] Escalation investigation failed for incident ${row.id}: ${err.message}`);
    }
  }
  return count;
}

export async function autoInvestigateCriticalIncidents(tenantId: number, limit: number = 100): Promise<number> {
  const result = await pool.query(
    `SELECT i.id, i.title, i.severity, i.source, i.category, i.incident_type,
            i.source_ip, i.destination_ip, i.affected_assets, i.mitre_tactic,
            i.confidence_score, i.is_true_positive, i.classification, i.description,
            i.ioc_data, i.created_at
     FROM incidents i
     LEFT JOIN ai_investigations ai ON ai.incident_id = i.id AND ai.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1
       AND i.severity IN ('critical', 'high')
       AND ai.id IS NULL
       AND (i.classification IS NULL OR i.classification != 'false_positive')
       AND (i.is_true_positive IS NULL OR i.is_true_positive != false)
     ORDER BY i.created_at DESC LIMIT $2`,
    [tenantId, Math.min(limit, 200)]
  );

  const incidents = result.rows;
  const scored = [];
  const skippedFP: { id: number; title: string; reason: string }[] = [];

  for (const inc of incidents) {
    const fpCheck = await isLikelyFalsePositive(inc, tenantId);
    if (fpCheck.isFP && fpCheck.confidence >= 85) {
      skippedFP.push({ id: inc.id, title: inc.title, reason: fpCheck.reason });
      await pool.query(
        `UPDATE incidents SET classification = 'false_positive', is_true_positive = false WHERE id = $1 AND tenant_id = $2`,
        [inc.id, tenantId]
      );
      continue;
    }
    scored.push({ ...inc, priorityScore: calculatePriorityScore(inc) });
  }

  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  const toInvestigate = scored.slice(0, Math.min(100, scored.length));

  let investigated = 0;
  const batchSize = 15;

  for (let i = 0; i < toInvestigate.length; i += batchSize) {
    const batch = toInvestigate.slice(i, i + batchSize);
    const promises = batch.map(async (inc) => {
      try {
        await investigateIncident(tenantId, inc.id, "auto_triage");
        return { success: true, id: inc.id };
      } catch (err: any) {
        console.error(`[AI SOC] Auto-investigation failed for incident ${inc.id}: ${err.message}`);
        return { success: false, id: inc.id, error: err.message };
      }
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) investigated++;
    }
  }

  if (skippedFP.length > 0) {
    console.log(`[AI SOC] Auto-classified ${skippedFP.length} incidents as FP: ${skippedFP.map(s => `#${s.id} (${s.reason})`).join(", ")}`);
  }

  return investigated;
}

export async function runForensicAnalysis(
  tenantId: number,
  incidentId: number
): Promise<{ investigationId: number; result: InvestigationResult }> {
  return investigateIncident(tenantId, incidentId, "forensic_analysis");
}

export async function detectCampaigns(tenantId: number): Promise<any[]> {
  const investigations = await pool.query(
    `SELECT ai.*, i.title as incident_title, i.severity as incident_severity
     FROM ai_investigations ai
     JOIN incidents i ON i.id = ai.incident_id
     WHERE ai.tenant_id = $1 AND ai.status = 'completed'
       AND ai.related_incident_ids IS NOT NULL AND array_length(ai.related_incident_ids, 1) > 0
     ORDER BY ai.completed_at DESC LIMIT 50`,
    [tenantId]
  );

  const campaignMap = new Map<string, any>();
  for (const inv of investigations.rows) {
    const key = (inv.related_incident_ids || []).sort().join(",");
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        incidentIds: [inv.incident_id, ...(inv.related_incident_ids || [])],
        investigations: [],
        maxRiskScore: 0,
        severity: inv.incident_severity,
      });
    }
    const campaign = campaignMap.get(key)!;
    campaign.investigations.push({
      id: inv.id,
      incidentId: inv.incident_id,
      incidentTitle: inv.incident_title,
      riskScore: inv.risk_score,
      findings: inv.findings,
    });
    campaign.maxRiskScore = Math.max(campaign.maxRiskScore, inv.risk_score || 0);
  }

  return [...campaignMap.values()];
}

let schedulerRunning = false;

export async function runInvestigationScheduler(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;

  try {
    const tenantResult = await pool.query(
      `SELECT DISTINCT t.id, t.name FROM tenants t
       INNER JOIN incidents i ON i.tenant_id = t.id
       WHERE i.severity IN ('critical', 'high')
         AND NOT EXISTS (SELECT 1 FROM ai_investigations ai WHERE ai.incident_id = i.id AND ai.tenant_id = t.id)
         AND (i.classification IS NULL OR i.classification != 'false_positive')
         AND (i.is_true_positive IS NULL OR i.is_true_positive != false)
       LIMIT 10`
    );

    const tenants = tenantResult.rows;
    if (tenants.length === 0) {
      schedulerRunning = false;
      return;
    }

    console.log(`[AI Scheduler] Found ${tenants.length} tenant(s) with uninvestigated incidents: ${tenants.map((t: any) => t.name).join(", ")}`);

    const concurrency = 3;
    for (let i = 0; i < tenants.length; i += concurrency) {
      const batch = tenants.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (tenant: any) => {
          try {
            const count = await autoInvestigateCriticalIncidents(tenant.id, 100);
            if (count > 0) {
              console.log(`[AI Scheduler] Tenant "${tenant.name}": investigated ${count} incidents`);
            }
            return { tenantId: tenant.id, name: tenant.name, count };
          } catch (err: any) {
            console.error(`[AI Scheduler] Tenant "${tenant.name}" failed: ${err.message}`);
            return { tenantId: tenant.id, name: tenant.name, count: 0, error: err.message };
          }
        })
      );

      const totalInvestigated = results.reduce((sum, r) =>
        sum + (r.status === "fulfilled" ? r.value.count : 0), 0);
      if (totalInvestigated > 0) {
        console.log(`[AI Scheduler] Batch complete: ${totalInvestigated} investigations across ${batch.length} tenants`);
      }
    }
  } catch (err: any) {
    console.error(`[AI Scheduler] Scheduler cycle error: ${err.message}`);
  } finally {
    schedulerRunning = false;
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

let schedulerReady = false;
export function markSchedulerReady() { schedulerReady = true; }

export function startInvestigationScheduler(intervalMs: number = 180000): void {
  if (schedulerInterval) return;
  console.log(`[AI Scheduler] Starting auto-investigation scheduler (every ${intervalMs / 1000}s)`);
  schedulerInterval = setInterval(() => {
    if (!schedulerReady) return;
    runInvestigationScheduler().catch(err => console.error(`[AI Scheduler] Unhandled error: ${err.message}`));
  }, intervalMs);

  const startupCheck = setInterval(() => {
    if (schedulerReady) {
      clearInterval(startupCheck);
      setTimeout(async () => {
        // Retroactively fix FP-pattern investigations that slipped through as "inconclusive"
        try {
          const fpPatternSQL = `
            UPDATE ai_investigations ai
            SET verdict = 'false_positive',
                verdict_reasoning = 'Retroactively classified as false positive: operational/monitoring alert with no security threat indicators.'
            FROM incidents i
            WHERE ai.incident_id = i.id
              AND (ai.verdict = 'inconclusive' OR ai.verdict IS NULL)
              AND (
                i.title ILIKE '%no scans in group%'
                OR i.title ILIKE '%scheduled task completed%'
                OR i.title ILIKE '%backup job%'
                OR i.title ILIKE '%health check%'
                OR i.title ILIKE '%heartbeat%'
                OR i.title ILIKE '%agent offline%'
                OR i.title ILIKE '%agent disconnected%'
                OR i.title ILIKE '%connectivity restored%'
                OR i.title ILIKE '%signature update%'
                OR i.title ILIKE '%definition update%'
                OR i.title ILIKE '%no threats found%'
                OR i.title ILIKE '%scan completed successfully%'
                OR i.title ILIKE '%update installed%'
                OR i.title ILIKE '%quarantine success%'
              )
            RETURNING ai.id`;
          const fixResult = await pool.query(fpPatternSQL);
          if (fixResult.rows.length > 0) {
            console.log(`[AI Scheduler] Retroactively fixed ${fixResult.rows.length} FP-pattern investigations as false_positive`);
          }

          // Also update the incidents themselves
          await pool.query(`
            UPDATE incidents SET classification = 'false_positive', is_true_positive = false
            WHERE (
              title ILIKE '%no scans in group%'
              OR title ILIKE '%scheduled task completed%'
              OR title ILIKE '%backup job%'
              OR title ILIKE '%heartbeat%'
              OR title ILIKE '%agent offline%'
              OR title ILIKE '%connectivity restored%'
              OR title ILIKE '%no threats found%'
              OR title ILIKE '%scan completed successfully%'
            )
            AND (classification IS NULL OR classification != 'false_positive')`);
        } catch (err: any) {
          console.error(`[AI Scheduler] FP retroactive fix error: ${err.message}`);
        }

        console.log("[AI Scheduler] Running startup sweep for uninvestigated incidents...");
        runInvestigationScheduler().catch(err => console.error(`[AI Scheduler] Startup sweep error: ${err.message}`));
      }, 45_000);
    }
  }, 10000);
}

export async function generateVerdict(investigationId: number): Promise<{ verdict: string; verdictReasoning: string }> {
  const invResult = await pool.query(
    `SELECT * FROM ai_investigations WHERE id = $1`,
    [investigationId]
  );
  const investigation = invResult.rows[0];
  if (!investigation) throw new Error(`Investigation ${investigationId} not found`);
  if (investigation.status !== "completed") throw new Error("Investigation must be completed before generating verdict");

  const incResult = await pool.query(
    `SELECT * FROM incidents WHERE id = $1`,
    [investigation.incident_id]
  );
  const incident = incResult.rows[0];

  const prompt = `You are an expert SOC analyst reviewing a completed investigation. Based on all evidence, determine the verdict. Think critically like a human analyst — operational alerts, maintenance notifications, and routine system messages are FALSE POSITIVES.

INCIDENT:
- Title: ${incident?.title || "Unknown"}
- Severity: ${incident?.severity || "Unknown"}
- Type: ${incident?.incident_type || "Unknown"}
- Source: ${incident?.source || "Unknown"}

INVESTIGATION FINDINGS:
- Executive Summary: ${investigation.executive_summary || "N/A"}
- Risk Score: ${investigation.risk_score}/100
- Confidence Score: ${investigation.confidence_score}/100
- Attack Chain: ${JSON.stringify(investigation.attack_chain || [])}
- IOCs: ${JSON.stringify(investigation.iocs_summary || [])}
- Affected Entities: ${JSON.stringify(investigation.affected_entities || [])}
- Lateral Movement: ${(investigation.findings as any)?.lateralMovement || false}
- Data Exfiltration: ${(investigation.findings as any)?.dataExfiltration || false}

Return a JSON object:
{
  "verdict": "true_positive" OR "false_positive" OR "inconclusive",
  "verdictReasoning": "2-3 sentence justification based on evidence strength, IOC reputation, behavioral patterns, and threat correlation"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const result = JSON.parse(content);
  const verdict = result.verdict || "inconclusive";
  const verdictReasoning = result.verdictReasoning || "Unable to determine verdict.";

  await pool.query(
    `UPDATE ai_investigations SET verdict = $1, verdict_reasoning = $2 WHERE id = $3`,
    [verdict, verdictReasoning, investigationId]
  );

  return { verdict, verdictReasoning };
}
