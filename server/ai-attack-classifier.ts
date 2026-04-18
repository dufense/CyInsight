import { createAIClient, getDefaultModel } from "./ai-provider";
import { pool } from "./db";
import type { AttackCategory } from "@shared/schema";
import { ATTACK_CATEGORIES, ATTACK_CATEGORY_LABELS } from "@shared/schema";
import { runAllExtractors, mergeEntities } from "./signal-extractors";
import type { ExtractorResult } from "./signal-extractors";

export interface AttackClassificationResult {
  attackCategory: AttackCategory;
  subType: string;
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
  mitreAttackId: string;
  mitreAttackIds: string[];
  killChainPhase: string;
  explanation: string;
  entities: {
    ips: string[];
    users: string[];
    hosts: string[];
    hashes: string[];
    domains: string[];
  };
  signals: Array<{ name: string; matched: boolean; weight: number; value?: string }>;
  signalScore: number;
  behavioralDeviationScore: number;
}

const CATEGORY_MITRE_MAP: Record<AttackCategory, { defaultId: string; ids: string[]; killChainPhase: string }> = {
  malware_ransomware: { defaultId: "T1486", ids: ["T1486", "T1059", "T1547", "T1490"], killChainPhase: "exploitation" },
  apt_targeted: { defaultId: "T1566", ids: ["T1566", "T1078", "T1021", "T1027", "T1055"], killChainPhase: "installation" },
  phishing_social_engineering: { defaultId: "T1566", ids: ["T1566", "T1598", "T1534"], killChainPhase: "delivery" },
  spam_bulk_email: { defaultId: "T1566", ids: ["T1566"], killChainPhase: "delivery" },
  web_application_attack: { defaultId: "T1190", ids: ["T1190", "T1059.007", "T1203"], killChainPhase: "exploitation" },
  network_intrusion: { defaultId: "T1046", ids: ["T1046", "T1595", "T1571", "T1572"], killChainPhase: "reconnaissance" },
  bot_automated: { defaultId: "T1110", ids: ["T1110", "T1078", "T1136"], killChainPhase: "exploitation" },
  ai_generative: { defaultId: "T1566", ids: ["T1566", "T1059"], killChainPhase: "delivery" },
  database_attack: { defaultId: "T1005", ids: ["T1005", "T1078", "T1059.001"], killChainPhase: "actions_on_objectives" },
  fileless_inmemory: { defaultId: "T1055", ids: ["T1055", "T1059.001", "T1218", "T1027"], killChainPhase: "exploitation" },
  lateral_movement: { defaultId: "T1021", ids: ["T1021", "T1550", "T1091", "T1570"], killChainPhase: "lateral_movement" },
  suspicious_user_behavior: { defaultId: "T1078", ids: ["T1078", "T1087", "T1213"], killChainPhase: "actions_on_objectives" },
  suspicious_network_activity: { defaultId: "T1071", ids: ["T1071", "T1041", "T1572"], killChainPhase: "command_and_control" },
  cloud_infrastructure: { defaultId: "T1078", ids: ["T1078", "T1548", "T1190", "T1619"], killChainPhase: "exploitation" },
  ot_iot: { defaultId: "T0819", ids: ["T0819", "T0867", "T0874"], killChainPhase: "exploitation" },
};

const CATEGORY_DEFINITIONS = `
ATTACK CATEGORY DEFINITIONS (use these to classify the event):

1. malware_ransomware: File hash IOC matches, mass file encryption/rename, shadow copy deletion, entropy spikes, C2 beacon patterns, dropper behavior, known ransomware families (Ryuk, Conti, LockBit).

2. apt_targeted: Low-and-slow attack patterns, multi-stage kill chain correlation, custom implant signatures, living-off-the-land (LOtL) abuse (certutil, regsvr32, wmic), long dwell time, APT group mentions (APT28, APT29, Lazarus).

3. phishing_social_engineering: Suspicious sender domains, lookalike/typosquat domains, credential harvesting URLs, BEC patterns (wire transfer fraud, CEO fraud), spear-phishing indicators, DKIM/SPF/DMARC failures with suspicious content.

4. spam_bulk_email: High email volume anomalies, bulk/unsolicited email headers, DKIM/SPF failures combined with spam content markers.

5. web_application_attack: SQL injection (union select, or 1=1), XSS (<script>, onerror=), SSRF (169.254.169.254, metadata endpoints), path traversal (../), command injection, RFI/LFI, IDOR, API abuse, deserialization, OWASP Top 10 patterns.

6. network_intrusion: Port scans (nmap, masscan), service enumeration, banner grabbing, CVE exploit traffic, DNS tunneling (iodine, dnscat), ICMP tunneling, covert channels, IDS/IPS alerts.

7. bot_automated: Credential stuffing, account takeover brute force, web scraping, distributed scanner patterns, headless browser fingerprints (puppeteer, selenium), rate anomaly/429 responses.

8. ai_generative: Prompt injection in logs, LLM jailbreak patterns, AI model exfiltration, synthetic deepfake content used in attacks, automated AI-powered phishing at scale.

9. database_attack: Unusual query patterns (bulk SELECT, dump), privilege escalation in DB logs, mass data extraction, stored procedure abuse (xp_cmdshell), authentication anomalies on DB ports (1433, 3306, 5432).

10. fileless_inmemory: PowerShell encoded commands (-EncodedCommand, IEX), WScript/CScript abuse, process injection (CreateRemoteThread, reflective DLL), LOtL tool misuse (certutil, regsvr32, mshta, rundll32), suspicious parent-child process trees.

11. lateral_movement: Internal port scan patterns, PsExec/WMI/SMB spread, pass-the-hash/pass-the-ticket (NTLM relay, Kerberoasting), unusual service creation across hosts, RDP/SSH lateral hop chains.

12. suspicious_user_behavior: Impossible travel, off-hours access, access to sensitive resources outside normal pattern, privilege creep, bulk download anomalies, account sharing (concurrent sessions from different locations).

13. suspicious_network_activity: Unusual outbound connections, beaconing (periodic intervals), data exfiltration volume spikes, non-standard ports, Tor/VPN exit node traffic, long connection durations.

14. cloud_infrastructure: Cloud misconfiguration exploitation (open S3 buckets), API key abuse, IAM privilege escalation (role assumption), resource hijacking for crypto-mining (XMRig, Monero), cloud metadata service SSRF (169.254.169.254).

15. ot_iot: Unusual Modbus/DNP3/BACnet protocol commands, firmware update anomalies, unauthorized IoT device behavior, physical-cyber event correlation, SCADA/ICS attacks, PLC/HMI attacks.
`;

async function getFewShotExamples(tenantId: number, topCategory: AttackCategory): Promise<string> {
  try {
    const res = await pool.query(
      `SELECT few_shot_examples FROM category_confidence_thresholds 
       WHERE tenant_id = $1 AND attack_category = $2 LIMIT 1`,
      [tenantId, topCategory]
    );
    const examples = res.rows[0]?.few_shot_examples;
    if (!Array.isArray(examples) || examples.length === 0) return "";
    const formatted = examples.slice(0, 3).map((ex: any, i: number) =>
      `Example ${i + 1}: Event: "${ex.event}" → Category: ${ex.category}, Confidence: ${ex.confidence}%, Explanation: ${ex.explanation}`
    ).join("\n");
    return `\nFEW-SHOT EXAMPLES FROM CONFIRMED ANALYST DECISIONS:\n${formatted}\n`;
  } catch {
    return "";
  }
}

async function getConfidenceThreshold(tenantId: number, category: AttackCategory): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT min_confidence_threshold FROM category_confidence_thresholds WHERE tenant_id = $1 AND attack_category = $2`,
      [tenantId, category]
    );
    return res.rows[0]?.min_confidence_threshold ?? 40;
  } catch {
    return 40;
  }
}

function buildFallbackResult(topExtractor: ExtractorResult, behavioralScore: number): AttackClassificationResult {
  const cat = topExtractor.category;
  const mitre = CATEGORY_MITRE_MAP[cat];
  const signalScore = topExtractor.signalScore;
  const confidence = Math.min(85, Math.max(10, Math.round(signalScore * 0.7 + behavioralScore * 0.3)));
  const severity: AttackClassificationResult["severity"] =
    confidence >= 80 ? "critical" : confidence >= 60 ? "high" : confidence >= 40 ? "medium" : "low";

  return {
    attackCategory: cat,
    subType: topExtractor.subTypeHints[0] || cat,
    confidence,
    severity,
    mitreAttackId: mitre.defaultId,
    mitreAttackIds: mitre.ids,
    killChainPhase: mitre.killChainPhase,
    explanation: `Rule-based classification: ${ATTACK_CATEGORY_LABELS[cat]}. Signal score: ${signalScore}/100. Matched signals: ${topExtractor.signals.filter(s => s.matched).map(s => s.name).join(", ") || "none"}.`,
    entities: topExtractor.entities,
    signals: topExtractor.signals,
    signalScore,
    behavioralDeviationScore: behavioralScore,
  };
}

export async function classifyAttack(
  event: Record<string, any>,
  tenantId: number,
  behavioralDeviationScore = 0
): Promise<AttackClassificationResult> {
  const extractorResults = runAllExtractors(event);
  const mergedEntities = mergeEntities(extractorResults);
  const topExtractor = extractorResults[0];

  const topSignalResults = extractorResults.slice(0, 5).filter(r => r.signalScore >= 10);
  const fewShot = await getFewShotExamples(tenantId, topExtractor.category).catch(() => "");

  const signalContext = topSignalResults.map(r => {
    const matched = r.signals.filter(s => s.matched).map(s => s.name).join(", ");
    return `- ${ATTACK_CATEGORY_LABELS[r.category]}: score=${r.signalScore}, matched=[${matched || "none"}]`;
  }).join("\n");

  const eventSummary = {
    eventType: event.eventType || event.event_type,
    severity: event.severity,
    threat: event.threat,
    description: (event.description || event.enrichedDescription || "").substring(0, 500),
    mitreTactic: event.mitreTactic || event.mitre_tactic,
    mitreTechnique: event.mitreTechnique || event.mitre_technique,
    source: event.logSource || event.log_source || event.sourceType,
    attacker: event.attacker,
    target: event.target,
    asset: event.asset,
    action: event.action,
  };

  const prompt = `You are an expert security analyst specializing in attack classification. Analyze this security event and classify it into one of 15 attack categories.

${CATEGORY_DEFINITIONS}

SECURITY EVENT:
${JSON.stringify(eventSummary, null, 2)}

ENTITY CONTEXT:
- Source IPs: ${mergedEntities.ips.join(", ") || "none"}
- Users: ${mergedEntities.users.join(", ") || "none"}
- Hosts: ${mergedEntities.hosts.join(", ") || "none"}
- Hashes: ${mergedEntities.hashes.join(", ") || "none"}
- Domains: ${mergedEntities.domains.join(", ") || "none"}

RULE-BASED PRE-SCORING (use as hints, your analysis may differ):
${signalContext || "No strong signals detected"}

BEHAVIORAL DEVIATION SCORE: ${behavioralDeviationScore}/100 (0=normal, 100=highly anomalous)
${fewShot}

Respond ONLY with this JSON (no markdown, no explanation outside JSON):
{
  "attackCategory": "<one of: ${ATTACK_CATEGORIES.join("|")}>",
  "subType": "<specific attack sub-type e.g. ransomware|credential_stuffing|sqli|etc>",
  "confidence": <integer 0-100>,
  "severity": "<critical|high|medium|low>",
  "mitreAttackId": "<primary MITRE ATT&CK technique ID e.g. T1486>",
  "mitreAttackIds": ["<T1xxx>", "<T1xxx>"],
  "killChainPhase": "<reconnaissance|weaponization|delivery|exploitation|installation|command_and_control|actions_on_objectives|lateral_movement>",
  "explanation": "<2-3 sentences explaining why this category was chosen, key evidence, and risk implication>"
}`;

  let aiResult: any = null;

  try {
    const ai = createAIClient();
    const response = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    aiResult = JSON.parse(raw);
  } catch (err) {
    console.warn("[AttackClassifier] AI call failed, using rule-based fallback:", (err as Error).message);
    return buildFallbackResult(topExtractor, behavioralDeviationScore);
  }

  const category = (ATTACK_CATEGORIES as readonly string[]).includes(aiResult.attackCategory)
    ? (aiResult.attackCategory as AttackCategory)
    : topExtractor.category;

  const mitre = CATEGORY_MITRE_MAP[category];
  const confidence = Math.max(0, Math.min(100, parseInt(aiResult.confidence) || topExtractor.signalScore));
  const severity: AttackClassificationResult["severity"] = ["critical", "high", "medium", "low"].includes(aiResult.severity)
    ? aiResult.severity as AttackClassificationResult["severity"]
    : confidence >= 80 ? "critical" : confidence >= 60 ? "high" : confidence >= 40 ? "medium" : "low";

  const extractorForCategory = extractorResults.find(r => r.category === category) || topExtractor;

  return {
    attackCategory: category,
    subType: aiResult.subType || extractorForCategory.subTypeHints[0] || category,
    confidence,
    severity,
    mitreAttackId: aiResult.mitreAttackId || mitre.defaultId,
    mitreAttackIds: Array.isArray(aiResult.mitreAttackIds) && aiResult.mitreAttackIds.length > 0
      ? aiResult.mitreAttackIds : mitre.ids,
    killChainPhase: aiResult.killChainPhase || mitre.killChainPhase,
    explanation: aiResult.explanation || `Classified as ${ATTACK_CATEGORY_LABELS[category]} with ${confidence}% confidence.`,
    entities: mergedEntities,
    signals: extractorForCategory.signals,
    signalScore: extractorForCategory.signalScore,
    behavioralDeviationScore,
  };
}

export async function classifyBatch(
  events: Array<{ event: Record<string, any>; tenantId: number; behavioralScore?: number }>,
  concurrency = 5
): Promise<AttackClassificationResult[]> {
  const results: AttackClassificationResult[] = [];
  for (let i = 0; i < events.length; i += concurrency) {
    const batch = events.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ event, tenantId, behavioralScore = 0 }) =>
        classifyAttack(event, tenantId, behavioralScore).catch(err => {
          console.error("[AttackClassifier] Batch item error:", err.message);
          return buildFallbackResult(runAllExtractors(event)[0], behavioralScore);
        })
      )
    );
    results.push(...batchResults);
  }
  return results;
}
