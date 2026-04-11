import { createAIClient } from "../ai-provider";
import type { AgentInput, AgentOutput } from "./types";

const openai = createAIClient();

export async function executeReportAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const threatIntelData = input.previousAgentOutputs?.["Threat Intel Agent"]?.data || {};
    const behaviorData = input.previousAgentOutputs?.["Behavior Agent"]?.data || {};
    const correlationData = input.previousAgentOutputs?.["Correlation Agent"]?.data || {};
    const riskData = input.previousAgentOutputs?.["Risk Scoring Agent"]?.data || {};
    const remediationData = input.previousAgentOutputs?.["Remediation Agent"]?.data || {};
    const decisionMetrics = riskData.decisionMetrics || {};

    const agentSummaries = Object.entries(input.previousAgentOutputs || {}).map(([name, output]) => ({
      agent: name,
      confidence: output.confidence,
      reasoning: output.reasoning,
      status: output.status,
    }));

    const iocDetails = (threatIntelData.iocs || []).slice(0, 15).map((ioc: any) =>
      `- ${ioc.type}: \`${ioc.value}\` — Reputation: ${ioc.reputation}${ioc.context ? ` (${ioc.context})` : ""}`
    ).join("\n") || "No IOCs identified.";

    const timelineEntries = (correlationData.timeline || []).slice(0, 10).map((t: any) =>
      `- [${t.timestamp || "N/A"}] ${t.event} (severity: ${t.severity}, source: ${t.source})`
    ).join("\n") || "No timeline data available.";

    const attackStageNames = (correlationData.attackStages || []).map((s: any) => s.stage).join(", ") || "None detected";

    const anomalyDetails = (behaviorData.anomalies || []).slice(0, 5).map((a: any) =>
      `- ${a.type || a.category || "Anomaly"}: ${a.description || a.detail || "Behavioral deviation detected"} (deviation: ${a.deviation || "N/A"})`
    ).join("\n") || "No behavioral anomalies detected.";

    const entityDetails = (contextData.assetContext || []).slice(0, 5).map((a: any) =>
      `- ${a.hostname || a.ip_address || "Unknown asset"} (OS: ${a.operating_system || "N/A"}, Risk: ${a.risk_score || "N/A"})`
    ).join("\n") || "No asset context available.";

    const containmentDetails = (remediationData.containmentActions || []).slice(0, 5).map((a: any) =>
      `- [${a.priority || "medium"}] ${a.action}`
    ).join("\n") || "No containment actions recommended.";

    const incidentDateFormatted = incident.created_at
      ? new Date(incident.created_at).toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
      : "Unknown date";
    const todayFormatted = new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

    const prompt = `You are a Senior Incident Response Analyst at a top-tier cybersecurity firm (comparable to CrowdStrike, Mandiant, or Group-IB). Generate a professional incident investigation report.

CURRENT DATE: ${todayFormatted}
INCIDENT DATE: ${incidentDateFormatted}

CRITICAL FORMATTING RULES:
1. Write the technicalReport as a PROFESSIONAL NARRATIVE using Markdown formatting with ## section headers
2. NEVER return raw JSON, data structures, or code blocks as the report content
3. Write in past tense, third person, using precise incident response terminology
4. Reference specific evidence, IOCs, and timestamps throughout
5. The report must read like a published CrowdStrike Intelligence Report or Mandiant APT report
6. Use the EXACT incident date "${incidentDateFormatted}" — NEVER use placeholder dates like "January 1" or generic dates
7. Each report must be uniquely tailored: reference the actual sender, recipient, subject line, IOC values, domain names, and detection specifics from this incident. No generic boilerplate.

INCIDENT UNDER INVESTIGATION:
- Title: ${incident.title || "Unknown"}
- Severity: ${incident.severity || "medium"}
- Type: ${incident.incident_type || "Unknown"}
- Source: ${incident.source || "Unknown"}
- Category: ${incident.category || "N/A"}
- Description: ${incident.description || "N/A"}
- Incident Date: ${incidentDateFormatted}
- MITRE ATT&CK: ${incident.mitre_tactic || "N/A"} / ${incident.mitre_technique || "N/A"}
- Affected Assets: ${incident.affected_assets || "N/A"}
- Source IP: ${incident.source_ip || "N/A"}
- Destination IP: ${incident.destination_ip || "N/A"}
- Action Taken: ${incident.action_taken || "None"}
- Detection Source: ${incident.detection_source || incident.source || "N/A"}

RISK ASSESSMENT (from Risk Scoring Agent):
- Overall Risk Score: ${decisionMetrics.riskScore || "N/A"}/100
- Investigation Confidence: ${decisionMetrics.confidenceScore || "N/A"}/100
- False Positive Likelihood: ${decisionMetrics.falsePositiveLikelihood || "N/A"}%
- Blast Radius: ${JSON.stringify(decisionMetrics.blastRadius || {})}

ATTACK STAGES IDENTIFIED: ${attackStageNames}

INDICATORS OF COMPROMISE:
${iocDetails}

TIMELINE OF EVENTS:
${timelineEntries}

BEHAVIORAL ANALYSIS:
${anomalyDetails}

AFFECTED ASSETS & ENTITIES:
${entityDetails}

CONTAINMENT & RESPONSE:
${containmentDetails}
- Security Domain: ${remediationData.securityDomain || "N/A"}
- Action State: ${remediationData.actionState || "N/A"}
- SOAR-Ready Actions: ${remediationData.soarReadyCount || 0}

AGENT ANALYSIS CONSENSUS:
${agentSummaries.map(a => `- ${a.agent}: ${a.status} (confidence: ${a.confidence}%) — ${a.reasoning}`).join("\n")}

VERDICT RULES (apply in order — first match wins):
1. MANDATORY FALSE POSITIVE: If the incident title contains operational/monitoring keywords such as "No Scans In Group", "No Scans", "backup", "health check", "heartbeat", "agent offline", "agent disconnected", "connectivity restored", "scheduled task", "update installed", "maintenance", "signature update", "scan completed", "quarantine success", "test alert" → verdict MUST be "false_positive". These are not security threats. Do NOT classify these as inconclusive.
2. FALSE POSITIVE: If FP likelihood ≥ 70% AND there are zero malicious IOCs AND zero confirmed attack stages → verdict = "false_positive"
3. TRUE POSITIVE: If there are confirmed malicious IOCs AND at least one attack stage is identified AND risk score ≥ 40 → verdict = "true_positive"
4. INCONCLUSIVE: Only use this when evidence exists but is genuinely ambiguous — there are some threat indicators but not enough to confirm a real attack. Do NOT default to inconclusive for operational alerts or alerts with no threat evidence.

REQUIRED OUTPUT (JSON with string fields, NOT nested JSON):
{
  "executiveSummary": "Write 2-3 paragraphs suitable for a CISO briefing. Cover: what happened, business impact, current status, and recommended next steps. Use professional language.",
  "technicalReport": "Write a FULL Markdown-formatted technical report with these sections:\\n\\n## Incident Overview\\nDate, classification, severity, detection source summary.\\n\\n## Threat Analysis\\nAttack vector analysis, TTPs mapped to MITRE ATT&CK framework, threat actor assessment.\\n\\n## Timeline of Activity\\nChronological narrative describing the attack progression (NOT raw logs).\\n\\n## Indicators of Compromise\\nList specific IPs, domains, hashes, email addresses with context.\\n\\n## Impact Assessment\\nAffected systems, users, data exposure, business impact analysis.\\n\\n## Forensic Evidence\\nKey evidence points, detection confidence, correlation findings.\\n\\n## Recommendations\\nImmediate actions and long-term security posture improvements.",
  "verdict": "true_positive|false_positive|inconclusive",
  "verdictReasoning": "3-4 sentence evidence-based explanation of the verdict",
  "attackType": "malware|phishing|brute_force|ransomware|network_intrusion|web_app_attack|vuln_exploit|social_engineering|generic",
  "threatActorProfile": "Assessment of attacker sophistication, motivation, and potential attribution",
  "campaignName": "Suggested campaign name if applicable, null otherwise",
  "keyEvidencePoints": ["top 5 specific evidence points that drove the verdict"]
}`;

    let result: any = {};
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 60000);
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 4000,
        }, { signal: abortController.signal });
        const content = response.choices[0]?.message?.content || "{}";
        result = JSON.parse(content);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (aiError: any) {
      console.error(`[Report Agent] AI generation failed: ${aiError.message}`);
      result = generateFallbackReport(incident, agentSummaries, decisionMetrics, threatIntelData, correlationData, behaviorData, remediationData);
    }

    const executiveSummary = result.executiveSummary || generateFallbackSummary(incident, decisionMetrics, agentSummaries);
    let technicalReport = result.technicalReport || "Technical analysis completed via multi-agent pipeline. See individual agent findings for details.";
    technicalReport = sanitizeTechnicalReport(technicalReport, incident, decisionMetrics, threatIntelData, correlationData, remediationData);

    const verdict = result.verdict || determineVerdict(decisionMetrics);
    const verdictReasoning = result.verdictReasoning || "Verdict determined by multi-agent consensus analysis.";

    evidenceRefs.push("AI-generated executive summary and technical report");
    if (result.keyEvidencePoints) {
      for (const point of result.keyEvidencePoints) {
        evidenceRefs.push(point);
      }
    }

    return {
      agentName: "Report Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence: Math.min(100, (result.executiveSummary ? 40 : 20) + (result.verdict ? 30 : 10) + (result.technicalReport ? 20 : 10) + 10),
      reasoning: `Generated investigation report with ${verdict} verdict. Executive summary and technical report produced. ${result.keyEvidencePoints?.length || 0} key evidence points identified. Attack type: ${result.attackType || "generic"}.`,
      evidenceRefs,
      data: {
        executiveSummary,
        technicalReport,
        verdict,
        verdictReasoning,
        attackType: result.attackType || "generic",
        threatActorProfile: result.threatActorProfile || "Unknown",
        campaignName: result.campaignName || null,
        keyEvidencePoints: result.keyEvidencePoints || [],
      },
    };
  } catch (error: any) {
    return {
      agentName: "Report Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Report generation failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}

function sanitizeTechnicalReport(
  report: string,
  incident: any,
  decisionMetrics: any,
  threatIntelData: any,
  correlationData: any,
  remediationData: any,
): string {
  if (!report) return "";
  let cleaned = report.trim();

  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    try {
      const parsed = JSON.parse(cleaned);
      cleaned = convertJsonToNarrative(parsed, incident, decisionMetrics, threatIntelData, correlationData, remediationData);
    } catch {
      cleaned = cleaned
        .replace(/[{}\[\]"]/g, "")
        .replace(/,\s*/g, "\n")
        .replace(/:\s*/g, ": ");
    }
  }

  try { cleaned = decodeURIComponent(cleaned); } catch {}

  cleaned = cleaned
    .replace(/\b[a-f0-9]{32,}\b/gi, (match) => `\`${match.slice(0, 12)}...\``)
    .replace(/\\n/g, "\n");

  return cleaned;
}

function convertJsonToNarrative(
  data: any,
  incident: any,
  decisionMetrics: any,
  threatIntelData: any,
  correlationData: any,
  remediationData: any,
): string {
  const sections: string[] = [];

  sections.push("## Incident Overview");
  if (data.incidentDetails) {
    const d = data.incidentDetails;
    sections.push(`On ${d.date || "the date of detection"}, the security operations center identified a ${incident.severity || "medium"}-severity ${incident.incident_type || "security"} incident: "${incident.title || "Unknown"}". ${d.sender ? `The incident originated from ${d.sender}` : ""}${d.subject ? ` with subject line "${d.subject}"` : ""}. ${d.totalEmails ? `A total of ${d.totalEmails} email(s) were observed` : ""}${d.quarantined ? `, ${d.quarantined} quarantined` : ""}${d.delivered ? `, ${d.delivered} delivered` : ""}.`);
  } else {
    sections.push(`A ${incident.severity || "medium"}-severity ${incident.incident_type || "security"} incident was detected: "${incident.title || "Unknown"}". The investigation was conducted using a multi-agent analysis pipeline with ${decisionMetrics.riskScore || "N/A"}/100 risk score and ${decisionMetrics.confidenceScore || "N/A"}/100 confidence.`);
  }

  sections.push("\n## Threat Analysis");
  if (data.attackStages) {
    sections.push(`The attack progression followed ${Array.isArray(data.attackStages) ? data.attackStages.length : 0} identified stage(s): ${Array.isArray(data.attackStages) ? data.attackStages.join(", ") : data.attackStages}. ${data.mitreTTPs ? `MITRE ATT&CK mapping indicates ${Array.isArray(data.mitreTTPs) ? data.mitreTTPs.join(", ") : data.mitreTTPs}.` : `MITRE ATT&CK tactic: ${incident.mitre_tactic || "Not mapped"}.`}`);
  } else {
    sections.push(`Attack vector analysis indicates ${incident.incident_type || "unknown"} type activity. ${incident.mitre_tactic ? `MITRE ATT&CK mapping: ${incident.mitre_tactic}${incident.mitre_technique ? ` / ${incident.mitre_technique}` : ""}.` : ""}`);
  }

  sections.push("\n## Timeline of Activity");
  if (data.timeline && Array.isArray(data.timeline)) {
    for (const entry of data.timeline.slice(0, 8)) {
      const ts = entry.timestamp ? `[${new Date(entry.timestamp).toLocaleString()}]` : "";
      sections.push(`- ${ts} ${entry.event || entry.description || "Event recorded"}`);
    }
  } else {
    sections.push("Timeline reconstruction was performed through correlation of security events and log sources. Refer to the Attack Chain visualization for the chronological progression of observed activity.");
  }

  sections.push("\n## Indicators of Compromise");
  if (data.iocSummary || data.forensicEvidence) {
    const iocs = data.iocSummary || {};
    sections.push(`Analysis identified ${iocs.malicious || 0} malicious and ${iocs.suspicious || 0} suspicious indicators.`);
    if (data.forensicEvidence) {
      const fe = data.forensicEvidence;
      if (fe.senderEmail) sections.push(`- Sender: \`${fe.senderEmail}\``);
      if (fe.subject) sections.push(`- Subject: "${fe.subject}"`);
      if (fe.detectionReasons && Array.isArray(fe.detectionReasons)) {
        sections.push(`- Detection reasons: ${fe.detectionReasons.join("; ")}`);
      }
    }
  } else {
    const iocs = threatIntelData.iocs || [];
    if (iocs.length > 0) {
      sections.push(`${iocs.filter((i: any) => i.reputation === "malicious").length} malicious and ${iocs.filter((i: any) => i.reputation === "suspicious").length} suspicious indicators were identified:`);
      for (const ioc of iocs.filter((i: any) => i.reputation !== "clean").slice(0, 8)) {
        sections.push(`- ${ioc.type}: \`${ioc.value}\` — ${ioc.reputation}${ioc.context ? ` (${ioc.context})` : ""}`);
      }
    } else {
      sections.push("No significant indicators of compromise were identified during this investigation.");
    }
  }

  sections.push("\n## Impact Assessment");
  sections.push(`Risk score: ${decisionMetrics.riskScore || "N/A"}/100. ${incident.affected_assets ? `Affected assets: ${incident.affected_assets}.` : ""} ${decisionMetrics.blastRadius ? `Blast radius assessment: ${decisionMetrics.blastRadius.affectedSystems || 0} system(s), ${decisionMetrics.blastRadius.affectedUsers || 0} user(s) potentially impacted.` : ""}`);

  sections.push("\n## Forensic Evidence");
  const confidence = decisionMetrics.confidenceScore || decisionMetrics.confidence;
  sections.push(`Detection confidence: ${confidence || "N/A"}/100. ${decisionMetrics.falsePositiveLikelihood != null ? `False positive likelihood: ${decisionMetrics.falsePositiveLikelihood}%.` : ""} ${correlationData?.attackStages?.length ? `${correlationData.attackStages.length} attack stage(s) correlated across available event data.` : "Evidence correlated from available security event sources."}`);

  sections.push("\n## Recommendations");
  if (remediationData.containmentActions?.length > 0) {
    for (const action of remediationData.containmentActions.slice(0, 5)) {
      sections.push(`- [${(action.priority || "medium").toUpperCase()}] ${action.action}`);
    }
  } else {
    sections.push("Refer to the Recommended Actions section for detailed containment and remediation guidance.");
  }

  return sections.join("\n");
}

function generateFallbackSummary(incident: any, decisionMetrics: any, agentSummaries: any[]): string {
  const completedAgents = agentSummaries.filter(a => a.status === "completed").length;
  return `The multi-agent investigation pipeline analyzed incident "${incident.title}" (Severity: ${incident.severity}) using ${completedAgents} specialized analysis agents. The overall risk assessment yielded a score of ${decisionMetrics.riskScore || "N/A"}/100 with ${decisionMetrics.confidenceScore || "N/A"}/100 confidence. ${decisionMetrics.falsePositiveLikelihood > 70 ? "Analysis indicates a high probability of false positive classification. The alert patterns are consistent with benign operational activity and may warrant tuning of detection rules to reduce analyst fatigue." : "Further review by a senior analyst is recommended to validate findings and determine appropriate response actions."}`;
}

const FP_TITLE_KEYWORDS = ["no scans in group","no scans","scheduled task completed","backup job","health check","heartbeat","agent offline","agent disconnected","connectivity restored","update installed","maintenance window","signature update","scan completed","quarantine success","test alert","keepalive","reboot completed","patch applied"];

function generateFallbackReport(incident: any, agentSummaries: any[], decisionMetrics: any, threatIntelData: any, correlationData: any, behaviorData: any, remediationData: any): any {
  const fpLikelihood = decisionMetrics.falsePositiveLikelihood || 50;
  const riskScore = decisionMetrics.riskScore || 50;
  const titleLower = (incident.title || "").toLowerCase();
  const isFPByTitle = FP_TITLE_KEYWORDS.some(kw => titleLower.includes(kw));
  const verdict = isFPByTitle || (riskScore === 0 && fpLikelihood >= 90) || fpLikelihood >= 70 ? "false_positive" : riskScore > 60 ? "true_positive" : "inconclusive";
  const completedAgents = agentSummaries.filter(a => a.status === "completed").length;

  const attackStages = (correlationData.attackStages || []).map((s: any) => s.stage);
  const maliciousCount = threatIntelData.maliciousCount || 0;
  const suspiciousCount = threatIntelData.suspiciousCount || 0;
  const anomalyCount = (behaviorData.anomalies || []).length;

  const iocSection = (threatIntelData.iocs || []).filter((i: any) => i.reputation !== "clean").slice(0, 8).map((ioc: any) =>
    `- ${ioc.type}: \`${ioc.value}\` — ${ioc.reputation}${ioc.context ? ` (${ioc.context})` : ""}`
  ).join("\n") || "No significant IOCs identified.";

  const containmentSection = (remediationData.containmentActions || []).slice(0, 5).map((a: any) =>
    `- [${(a.priority || "medium").toUpperCase()}] ${a.action}`
  ).join("\n") || "Refer to the Recommended Actions section for guidance.";

  const technicalReport = `## Incident Overview

On the date of detection, the security operations center identified a ${incident.severity || "medium"}-severity incident: "${incident.title || "Unknown"}". The investigation was conducted using a ${completedAgents}-agent automated analysis pipeline. Overall risk assessment: ${riskScore}/100 with ${decisionMetrics.confidenceScore || "N/A"}% confidence.

## Threat Analysis

${attackStages.length > 0 ? `The correlation engine identified ${attackStages.length} distinct attack stage(s): ${attackStages.join(", ")}. This attack progression ${attackStages.length >= 3 ? "indicates a sophisticated, multi-phase intrusion attempt" : "suggests targeted activity requiring further analysis"}.` : "No distinct attack stages were identified through automated correlation."} ${incident.mitre_tactic ? `MITRE ATT&CK mapping: ${incident.mitre_tactic}${incident.mitre_technique ? ` / ${incident.mitre_technique}` : ""}.` : ""}

## Timeline of Activity

The automated analysis pipeline reconstructed the event timeline through correlation of security events across available log sources. ${attackStages.length > 0 ? `Activity progressed through ${attackStages.join(" → ")} stages.` : "Refer to the Attack Chain visualization for chronological event progression."}

## Indicators of Compromise

Analysis identified ${maliciousCount} malicious and ${suspiciousCount} suspicious indicators:
${iocSection}

## Impact Assessment

Risk score: ${riskScore}/100. False positive likelihood: ${fpLikelihood}%. ${incident.affected_assets ? `Affected assets: ${incident.affected_assets}.` : ""} ${anomalyCount > 0 ? `${anomalyCount} behavioral anomalies were detected during UEBA analysis.` : "No significant behavioral anomalies were observed."}

## Recommendations

${containmentSection}`;

  return {
    executiveSummary: generateFallbackSummary(incident, decisionMetrics, agentSummaries),
    technicalReport,
    verdict,
    verdictReasoning: `Verdict determined by automated multi-agent analysis. Risk score: ${riskScore}/100, false positive likelihood: ${fpLikelihood}%. ${verdict === "false_positive" ? "Low risk indicators combined with high false positive probability suggest this alert represents benign operational activity." : verdict === "true_positive" ? "Elevated risk indicators with corroborating threat intelligence suggest genuine malicious activity requiring response." : "Available evidence is insufficient for definitive classification. Manual review by a senior analyst is recommended."}`,
    attackType: "generic",
    keyEvidencePoints: [
      `Risk score: ${riskScore}/100`,
      `${maliciousCount} malicious IOCs identified`,
      `${attackStages.length} attack stages detected`,
      `${anomalyCount} behavioral anomalies observed`,
      `${completedAgents} analysis agents completed successfully`,
    ],
  };
}

function determineVerdict(decisionMetrics: any): string {
  const fpLikelihood = decisionMetrics.falsePositiveLikelihood || 50;
  const riskScore = decisionMetrics.riskScore || 50;
  // riskScore = 0 means FP title override was applied by Risk Scoring Agent
  if (riskScore === 0 && fpLikelihood >= 90) return "false_positive";
  // High FP likelihood with no substantial threat evidence
  if (fpLikelihood >= 70) return "false_positive";
  if (riskScore > 60) return "true_positive";
  return "inconclusive";
}
