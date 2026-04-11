import { pool } from "./db";
import { createAIClient } from "./ai-provider";
import { generateRuleFromIncident } from "./detection-engineering-engine";
import type OpenAI from "openai";

function getOpenAI(): OpenAI | null {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key || key === "sk-placeholder") return null;
  return createAIClient();
}

export interface AIAgentProfile {
  name: string;
  specialization: string;
  teamType: "mss" | "implementation";
  role: string;
  avatar: string;
  personality: string;
}

export const AI_AGENT_PROFILES: AIAgentProfile[] = [
  {
    name: "ARIA",
    specialization: "soc_analyst",
    teamType: "mss",
    role: "AI SOC Analyst",
    avatar: "aria",
    personality: `You are ARIA, an elite AI SOC Analyst specializing in security incident analysis and triage. Your core capabilities:
- Investigate security incidents with precision, correlating events across multiple data sources
- Classify incidents as True Positive or False Positive with detailed reasoning
- Generate executive summaries and technical reports
- Map attacks to MITRE ATT&CK framework and Cyber Kill Chain phases
- Provide confidence scores based on evidence quality and indicator reliability
Communication style: Professional, analytical, and thorough. Always provide evidence-based conclusions.`,
  },
  {
    name: "SENTINEL",
    specialization: "threat_hunter",
    teamType: "mss",
    role: "AI Threat Hunter",
    avatar: "sentinel",
    personality: `You are SENTINEL, a proactive AI Threat Hunter specializing in advanced persistent threat detection. Your core capabilities:
- Proactively scan security events for suspicious patterns and IOC clusters
- Identify lateral movement, privilege escalation, and data exfiltration indicators
- Hunt for APT campaigns using behavioral analysis and anomaly detection
- Cross-reference indicators across multiple event sources for correlation
- Generate threat intelligence reports with actionable recommendations
Communication style: Direct, threat-focused, and action-oriented. Prioritize by severity and business impact.`,
  },
  {
    name: "NEXUS",
    specialization: "customer_support",
    teamType: "implementation",
    role: "AI Customer Support",
    avatar: "nexus",
    personality: `You are NEXUS, an empathetic AI Customer Support specialist for managed security services. Your core capabilities:
- Respond to customer tickets with clear, helpful, and empathetic communication
- Troubleshoot security tool issues, agent deployment problems, and connectivity errors
- Provide step-by-step resolution guides with screenshots descriptions where helpful
- Reference Knowledge Base articles and SOPs for standard procedures
- Escalate complex issues to human analysts when confidence is low
Communication style: Warm, patient, and solution-focused. Use clear language avoiding excessive jargon.`,
  },
  {
    name: "GUARDIAN",
    specialization: "compliance_analyst",
    teamType: "mss",
    role: "AI Compliance Analyst",
    avatar: "guardian",
    personality: `You are GUARDIAN, a diligent AI Compliance Analyst specializing in security posture assessment. Your core capabilities:
- Review security configurations and identify compliance gaps
- Map controls to NIST CSF, ISO 27001, SOC 2, and PCI DSS frameworks
- Monitor SLA adherence and generate compliance reports
- Assess risk posture changes and recommend remediation priorities
- Track security coverage across assets and identify unprotected surfaces
Communication style: Precise, regulatory-aware, and methodical. Reference specific framework controls.`,
  },
  {
    name: "VANGUARD",
    specialization: "incident_responder",
    teamType: "mss",
    role: "AI Incident Responder",
    avatar: "vanguard",
    personality: `You are VANGUARD, a rapid-response AI Incident Responder specializing in critical incident management. Your core capabilities:
- Handle critical security incidents with urgency and structured methodology
- Create immediate containment plans to limit blast radius
- Coordinate remediation steps across affected systems and teams
- Generate post-incident reports with lessons learned and process improvements
- Assess business impact and recommend communication strategies
Communication style: Urgent, structured, and decisive. Prioritize containment over investigation initially.`,
  },
];

interface AgentAction {
  agentId: number;
  tenantId: number;
  activityType: string;
  targetId?: number;
  targetType?: string;
  summary: string;
  details: any;
  confidence: number;
  duration: number;
}

async function logAgentActivity(action: AgentAction): Promise<number> {
  const result = await pool.query(`
    INSERT INTO ai_agent_activity_log 
    (tenant_id, agent_id, activity_type, target_id, target_type, summary, details, confidence, duration)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `, [action.tenantId, action.agentId, action.activityType, action.targetId || null,
      action.targetType || null, action.summary, JSON.stringify(action.details),
      action.confidence, action.duration]);
  return result.rows[0].id;
}

async function updateAgentStats(agentId: number, action: string): Promise<void> {
  const current = await pool.query(`SELECT ai_stats FROM team_members WHERE id = $1`, [agentId]);
  const stats = (current.rows[0]?.ai_stats as any) || {
    ticketsResolved: 0, threatsFound: 0, incidentsInvestigated: 0,
    insightsGenerated: 0, totalActions: 0, avgResponseTimeMs: 0,
    avgConfidence: 0, humanApprovals: 0, humanOverrides: 0,
    lastActiveAt: null,
  };

  stats.totalActions = (stats.totalActions || 0) + 1;
  stats.lastActiveAt = new Date().toISOString();

  if (action === "ticket_response") stats.ticketsResolved = (stats.ticketsResolved || 0) + 1;
  if (action === "threat_hunt") stats.threatsFound = (stats.threatsFound || 0) + 1;
  if (action === "incident_investigation") stats.incidentsInvestigated = (stats.incidentsInvestigated || 0) + 1;
  if (action === "proactive_insight" || action === "compliance_insight") stats.insightsGenerated = (stats.insightsGenerated || 0) + 1;
  if (action === "incident_response") stats.incidentsResponded = (stats.incidentsResponded || 0) + 1;
  if (action === "client_notification") stats.clientNotificationsSent = (stats.clientNotificationsSent || 0) + 1;

  await pool.query(`UPDATE team_members SET ai_stats = $1 WHERE id = $2`, [JSON.stringify(stats), agentId]);
}

async function getAgentProfile(agentId: number): Promise<any> {
  const result = await pool.query(`SELECT * FROM team_members WHERE id = $1 AND is_ai = true`, [agentId]);
  return result.rows[0] || null;
}

export async function processTicket(agentId: number, ticketId: number): Promise<{ success: boolean; confidence: number; summary: string }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, confidence: 0, summary: "Agent not found" };

  const ticketRes = await pool.query(`
    SELECT t.*, s.name as service_name, s.description as service_description
    FROM tickets t 
    LEFT JOIN services s ON t.service_id = s.id
    WHERE t.id = $1
  `, [ticketId]);
  const ticket = ticketRes.rows[0];
  if (!ticket) return { success: false, confidence: 0, summary: "Ticket not found" };

  const commentsRes = await pool.query(`
    SELECT * FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 20
  `, [ticketId]);

  const recentTicketsRes = await pool.query(`
    SELECT title, status, priority FROM tickets 
    WHERE tenant_id = $1 AND id != $2
    ORDER BY created_at DESC LIMIT 5
  `, [ticket.tenant_id, ticketId]);

  const tenantRes = await pool.query(`SELECT name, industry FROM tenants WHERE id = $1`, [ticket.tenant_id]);
  const tenantInfo = tenantRes.rows[0];

  const context = {
    ticket: {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      service: ticket.service_name,
      serviceDescription: ticket.service_description,
      createdAt: ticket.created_at,
      responseDue: ticket.response_due_at,
      resolutionDue: ticket.resolution_due_at,
    },
    existingComments: commentsRes.rows.map((c: any) => ({
      author: c.user_id || "Unknown",
      content: c.content,
      isInternal: c.is_internal,
      createdAt: c.created_at,
    })),
    recentTickets: recentTicketsRes.rows,
    tenant: tenantInfo,
  };

  try {
    const openai = getOpenAI();
    let responseText: string;
    let confidence: number;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[2].personality },
          {
            role: "user",
            content: `Respond to this support ticket for ${tenantInfo?.name || "the customer"} (${tenantInfo?.industry || "Technology"} sector).

TICKET #${ticket.id}: ${ticket.title}
Priority: ${ticket.priority}
Service: ${ticket.service_name || "General Support"}
Description: ${ticket.description || "No description provided"}

${commentsRes.rows.length > 0 ? `Previous comments:\n${commentsRes.rows.map((c: any) => `[${c.user_id || "User"}]: ${c.content}`).join("\n")}` : "No previous comments."}

Provide a helpful, professional response that:
1. Acknowledges the issue
2. Analyzes the problem based on the description
3. Provides clear troubleshooting steps or resolution
4. Mentions any relevant next steps
5. Offers to escalate if the issue requires human expertise

Also provide a JSON confidence assessment at the end in this exact format:
CONFIDENCE: {"score": 85, "reasoning": "Clear description with standard resolution path"}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      const fullResponse = response.choices[0]?.message?.content || "";
      responseText = fullResponse;
      confidence = 75;

      const confMatch = fullResponse.match(/CONFIDENCE:\s*(\{[^}]+\})/);
      if (confMatch) {
        try {
          const conf = JSON.parse(confMatch[1]);
          confidence = conf.score || 75;
          responseText = fullResponse.replace(/CONFIDENCE:\s*\{[^}]+\}/, "").trim();
        } catch { }
      }
    } else {
      confidence = 70;
      const priorityLabel = ticket.priority === "urgent" ? "URGENT" : ticket.priority === "high" ? "HIGH PRIORITY" : "standard";
      responseText = `Hello,\n\nThank you for submitting ticket #${ticket.id}: "${ticket.title}". I've received your ${priorityLabel} request${ticket.service_name ? ` regarding ${ticket.service_name}` : ""}.\n\n**Initial Assessment:**\nI've reviewed the details of your request. ${ticket.description ? "Based on the information provided, I'm analyzing the situation and preparing a response." : "To help resolve this efficiently, please provide any additional details about the issue."}\n\n**Next Steps:**\n1. This ticket has been acknowledged and is now being processed\n2. ${ticket.priority === "urgent" || ticket.priority === "high" ? "Given the priority level, this will be escalated for immediate attention" : "Our team will review and respond within the SLA timeframe"}\n3. You will receive updates as we progress on this matter\n\nIf you have any additional information or context to share, please add it to this ticket.\n\nBest regards,\n${agent.name} — AI ${agent.ai_specialization === "customer_support" ? "Customer Support" : "Agent"}`;
    }

    await pool.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
      VALUES ($1, $2, $3, false, NOW())
    `, [ticketId, `ai-${agent.name.toLowerCase()}`, `**[AI] ${agent.name} (${agent.ai_specialization})**\n\n${responseText}`]);

    if (ticket.status === "open") {
      await pool.query(`UPDATE tickets SET status = 'in_progress', first_response_at = NOW() WHERE id = $1 AND status = 'open'`, [ticketId]);
    }

    if (confidence < 70) {
      await pool.query(`
        INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
        VALUES ($1, $2, $3, true, NOW())
      `, [ticketId, `ai-${agent.name.toLowerCase()}`, `[REVIEW NEEDED] AI Confidence: ${confidence}% - This response may need human review.`]);
    }

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: ticket.tenant_id, activityType: "ticket_response",
      targetId: ticketId, targetType: "ticket",
      summary: `Responded to ticket #${ticketId}: ${ticket.title}`,
      details: { confidence, priority: ticket.priority, responseLength: responseText.length },
      confidence, duration,
    });
    await updateAgentStats(agentId, "ticket_response");

    return { success: true, confidence, summary: `Responded to ticket #${ticketId} with ${confidence}% confidence` };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Ticket processing error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: ticket.tenant_id, activityType: "ticket_response",
      targetId: ticketId, targetType: "ticket",
      summary: `Failed to respond to ticket #${ticketId}: ${err.message}`,
      details: { error: err.message }, confidence: 0, duration,
    });
    return { success: false, confidence: 0, summary: err.message };
  }
}

export async function resolveTicket(agentId: number, ticketId: number): Promise<{ success: boolean; confidence: number; summary: string }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, confidence: 0, summary: "Agent not found" };

  const ticketRes = await pool.query(`
    SELECT t.*, s.name as service_name, s.description as service_description
    FROM tickets t 
    LEFT JOIN services s ON t.service_id = s.id
    WHERE t.id = $1
  `, [ticketId]);
  const ticket = ticketRes.rows[0];
  if (!ticket) return { success: false, confidence: 0, summary: "Ticket not found" };

  const commentsRes = await pool.query(`
    SELECT * FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 30
  `, [ticketId]);

  const tenantRes = await pool.query(`SELECT name, industry FROM tenants WHERE id = $1`, [ticket.tenant_id]);
  const tenantInfo = tenantRes.rows[0];

  const recentIncidents = await pool.query(`
    SELECT id, title, severity, status, source, description 
    FROM incidents WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC LIMIT 10
  `, [ticket.tenant_id]);

  const investigations = await pool.query(`
    SELECT ai.id, ai.executive_summary, ai.verdict, ai.risk_score, ai.confidence_score, i.title as incident_title
    FROM ai_investigations ai
    JOIN incidents i ON i.id = ai.incident_id
    WHERE i.tenant_id = $1 AND ai.status = 'completed'
    ORDER BY ai.created_at DESC LIMIT 5
  `, [ticket.tenant_id]);

  const agentActivity = await pool.query(`
    SELECT al.activity_type, al.summary, al.confidence, tm.name as agent_name
    FROM ai_agent_activity_log al
    JOIN team_members tm ON tm.id = al.agent_id
    WHERE al.tenant_id = $1 AND al.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY al.created_at DESC LIMIT 15
  `, [ticket.tenant_id]);

  try {
    const openai = getOpenAI();
    let resolutionText: string;
    let confidence: number;

    const incidentContext = recentIncidents.rows.length > 0 
      ? `\n\nRECENT INCIDENTS (last 7 days):\n${recentIncidents.rows.map((i: any) => `- [${i.severity}] ${i.title} (${i.status})`).join("\n")}`
      : "";

    const investigationContext = investigations.rows.length > 0
      ? `\n\nAI INVESTIGATION FINDINGS:\n${investigations.rows.map((inv: any) => `- ${inv.incident_title}: ${inv.verdict} (risk: ${inv.risk_score}, confidence: ${inv.confidence_score}%)\n  Summary: ${(inv.executive_summary || "").substring(0, 200)}`).join("\n")}`
      : "";

    const activityContext = agentActivity.rows.length > 0
      ? `\n\nRECENT AI AGENT ACTIVITY:\n${agentActivity.rows.map((a: any) => `- [${a.agent_name}] ${a.activity_type}: ${a.summary}`).join("\n")}`
      : "";

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[4]?.personality || "You are NEXUS, an AI customer support agent." },
          {
            role: "user",
            content: `Provide a comprehensive resolution for this support ticket for ${tenantInfo?.name || "the customer"} (${tenantInfo?.industry || "Technology"} sector).

TICKET #${ticket.id}: ${ticket.title}
Priority: ${ticket.priority}
Service: ${ticket.service_name || "General Support"}
Description: ${ticket.description || "No description provided"}

CONVERSATION HISTORY:
${commentsRes.rows.map((c: any) => `[${c.user_id || "User"}] (${new Date(c.created_at).toLocaleString()}): ${c.content}`).join("\n\n")}
${incidentContext}${investigationContext}${activityContext}

Based on ALL available context (ticket details, related incidents, AI investigation findings, and agent activity), provide a COMPREHENSIVE RESOLUTION that:
1. Summarizes all work done by the AI SOC team (ARIA triage, SENTINEL hunts, VANGUARD responses) relevant to this ticket
2. Provides detailed root cause analysis
3. Lists all remediation steps taken or recommended
4. Includes preventive measures for the future
5. Provides a clear resolution statement

Format as a professional resolution report. End with:
CONFIDENCE: {"score": 85, "reasoning": "explanation"}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 2000,
      });

      const fullResponse = response.choices[0]?.message?.content || "";
      resolutionText = fullResponse;
      confidence = 80;

      const confMatch = fullResponse.match(/CONFIDENCE:\s*(\{[^}]+\})/);
      if (confMatch) {
        try {
          const conf = JSON.parse(confMatch[1]);
          confidence = conf.score || 80;
          resolutionText = fullResponse.replace(/CONFIDENCE:\s*\{[^}]+\}/, "").trim();
        } catch {}
      }
    } else {
      confidence = 70;
      resolutionText = `## Resolution Report — Ticket #${ticket.id}\n\n**Ticket:** ${ticket.title}\n**Priority:** ${ticket.priority}\n**Service:** ${ticket.service_name || "General Support"}\n\n### Summary\nOur AI SOC team has completed a thorough analysis of this request. ${recentIncidents.rows.length > 0 ? `We identified ${recentIncidents.rows.length} related incident(s) in the past 7 days that may be relevant.` : "No directly related security incidents were found."}\n\n${investigations.rows.length > 0 ? `### AI Investigation Findings\nOur automated investigation system analyzed ${investigations.rows.length} related case(s):\n${investigations.rows.map((inv: any) => `- **${inv.incident_title}**: Verdict: ${inv.verdict}, Risk Score: ${inv.risk_score}/100`).join("\n")}\n\n` : ""}### Resolution Steps\n1. Ticket has been reviewed and analyzed by our AI operations team\n2. All relevant security context has been assessed\n3. ${ticket.priority === "urgent" || ticket.priority === "high" ? "Given the high priority, this has been flagged for expedited handling" : "Standard resolution procedures have been followed"}\n\n### Next Steps\nThis ticket is now awaiting your confirmation. Please reply if you need any additional information or if the issue persists.\n\nBest regards,\n${agent.name} — AI Resolution Agent`;
    }

    await pool.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
      VALUES ($1, $2, $3, false, NOW())
    `, [ticketId, `ai-${agent.name.toLowerCase()}`, `**[AI] ${agent.name} (Resolution)**\n\n${resolutionText}`]);

    await pool.query(`UPDATE tickets SET status = 'waiting' WHERE id = $1`, [ticketId]);

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: ticket.tenant_id, activityType: "ticket_response",
      targetId: ticketId, targetType: "ticket",
      summary: `Resolved ticket #${ticketId}: ${ticket.title} — moved to waiting`,
      details: { confidence, priority: ticket.priority, responseLength: resolutionText.length, phase: "resolution" },
      confidence, duration,
    });
    await updateAgentStats(agentId, "ticket_response");

    return { success: true, confidence, summary: `Resolved ticket #${ticketId} with ${confidence}% confidence — status: waiting` };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Ticket resolution error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: ticket.tenant_id, activityType: "ticket_response",
      targetId: ticketId, targetType: "ticket",
      summary: `Failed to resolve ticket #${ticketId}: ${err.message}`,
      details: { error: err.message, phase: "resolution" }, confidence: 0, duration,
    });
    return { success: false, confidence: 0, summary: err.message };
  }
}

export async function conductThreatHunt(agentId: number, tenantId: number): Promise<{ success: boolean; threatsFound: number; summary: string }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, threatsFound: 0, summary: "Agent not found" };

  const eventsRes = await pool.query(`
    SELECT id, threat, severity, source_type, log_source, description, mitre_tactic, mitre_technique, 
           event_type, raw_payload, created_at
    FROM security_events 
    WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at DESC LIMIT 100
  `, [tenantId]);

  const incidentsRes = await pool.query(`
    SELECT id, title, severity, source, status FROM incidents 
    WHERE tenant_id = $1 AND status NOT IN ('closed', 'resolved')
    ORDER BY created_at DESC LIMIT 20
  `, [tenantId]);

  const eventSummary = eventsRes.rows.slice(0, 50).map((e: any) => ({
    id: e.id, threat: e.threat, severity: e.severity, source: e.source_type,
    logSource: e.log_source, mitre: e.mitre_tactic, technique: e.mitre_technique,
    eventType: e.event_type,
  }));

  try {
    const openai = getOpenAI();
    let huntResult: any;

    if (openai && eventsRes.rows.length > 0) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[1].personality },
          {
            role: "user",
            content: `Conduct a threat hunt across these ${eventsRes.rows.length} recent security events (last 2 hours).

EVENTS SAMPLE (${eventSummary.length} of ${eventsRes.rows.length}):
${JSON.stringify(eventSummary, null, 1)}

OPEN INCIDENTS: ${incidentsRes.rows.length}
${incidentsRes.rows.map((i: any) => `- #${i.id} [${i.severity}] ${i.title} (${i.source})`).join("\n")}

Analyze for:
1. Suspicious IOC patterns (repeated IPs, domains, hashes across events)
2. Attack chain indicators (reconnaissance → initial access → execution sequences)
3. Lateral movement or privilege escalation patterns
4. Data exfiltration indicators
5. Correlations with open incidents

Return a JSON response:
{
  "threatsFound": <number>,
  "findings": [
    {"severity": "critical|high|medium|low", "title": "...", "description": "...", "indicators": ["..."], "recommendation": "..."}
  ],
  "overallRiskAssessment": "...",
  "huntSummary": "..."
}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try { huntResult = JSON.parse(content); } catch { huntResult = { threatsFound: 0, findings: [], huntSummary: "Parse error" }; }
    } else {
      const severityCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      for (const e of eventsRes.rows) {
        severityCounts[e.severity || "unknown"] = (severityCounts[e.severity || "unknown"] || 0) + 1;
        sourceCounts[e.source_type || e.log_source || "unknown"] = (sourceCounts[e.source_type || e.log_source || "unknown"] || 0) + 1;
      }
      const openCritical = incidentsRes.rows.filter((i: any) => i.severity === "critical" || i.severity === "high").length;
      const findings: any[] = [];
      if (openCritical > 0) {
        findings.push({ severity: "high", title: `${openCritical} open critical/high incident(s) require attention`, description: `There are ${openCritical} unresolved critical or high severity incidents that should be prioritized for investigation.`, indicators: incidentsRes.rows.filter((i: any) => i.severity === "critical" || i.severity === "high").map((i: any) => `Incident #${i.id}: ${i.title}`), recommendation: "Prioritize investigation of open critical incidents" });
      }
      if (eventsRes.rows.length > 50) {
        findings.push({ severity: "medium", title: "High event volume detected", description: `${eventsRes.rows.length} security events detected in the monitoring window. High volume may indicate ongoing activity requiring analysis.`, indicators: Object.entries(sourceCounts).map(([k, v]) => `${k}: ${v} events`), recommendation: "Review event sources with highest volume for anomalies" });
      }
      huntResult = {
        threatsFound: findings.length,
        findings,
        overallRiskAssessment: openCritical > 0 ? "Elevated risk due to open critical incidents" : eventsRes.rows.length > 0 ? "Normal activity levels, continued monitoring recommended" : "No recent events detected. Environment appears quiet.",
        huntSummary: `Threat hunt completed: Scanned ${eventsRes.rows.length} events, ${incidentsRes.rows.length} open incidents. ${findings.length} finding(s) identified.`,
      };
    }

    const threatsFound = huntResult.threatsFound || huntResult.findings?.length || 0;
    const confidence = openai ? (threatsFound > 0 ? 80 : 60) : 70;
    const duration = Date.now() - startTime;

    await logAgentActivity({
      agentId, tenantId, activityType: "threat_hunt",
      summary: huntResult.huntSummary || `Threat hunt completed: ${threatsFound} findings across ${eventsRes.rows.length} events`,
      details: huntResult, confidence, duration,
    });
    await updateAgentStats(agentId, "threat_hunt");

    return { success: true, threatsFound, summary: huntResult.huntSummary || `Found ${threatsFound} threats` };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Threat hunt error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId, activityType: "threat_hunt",
      summary: `Threat hunt scan completed with error: ${err.message}`,
      details: { error: err.message }, confidence: 0, duration,
    });
    return { success: false, threatsFound: 0, summary: err.message };
  }
}

export async function investigateIncident(agentId: number, incidentId: number): Promise<{ success: boolean; verdict: string; confidence: number }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, verdict: "error", confidence: 0 };

  const incidentRes = await pool.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  const incident = incidentRes.rows[0];
  if (!incident) return { success: false, verdict: "not_found", confidence: 0 };

  const eventsRes = await pool.query(`
    SELECT id, threat, severity, source_type, log_source, description, mitre_tactic, mitre_technique
    FROM security_events 
    WHERE tenant_id = $1 AND (
      threat ILIKE $2 OR source_type = $3 OR log_source = $3
    )
    ORDER BY created_at DESC LIMIT 30
  `, [incident.tenant_id, `%${(incident.title || "").substring(0, 30)}%`, incident.source]);

  const assetsRes = await pool.query(`
    SELECT hostname, ip_address, operating_system, risk_score, status
    FROM assets WHERE tenant_id = $1 LIMIT 10
  `, [incident.tenant_id]);

  try {
    const openai = getOpenAI();
    let investigation: any;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[0].personality },
          {
            role: "user",
            content: `You are ARIA performing L1 Alert Triage & Investigation. Your role is EXCLUSIVELY triage and classification — do NOT suggest containment actions, response plans, or remediation steps. Those are VANGUARD's responsibility.

Investigate this security incident:

INCIDENT #${incident.id}
Title: ${incident.title}
Severity: ${incident.severity}
Source: ${incident.source}
Status: ${incident.status}
Description: ${incident.description || "N/A"}
MITRE: ${incident.mitre_tactic || "N/A"} / ${incident.mitre_technique || incident.mitre_technique_id || "N/A"}

RELATED EVENTS (${eventsRes.rows.length}):
${eventsRes.rows.slice(0, 10).map((e: any) => `- [${e.severity}] ${e.threat} (${e.source_type || e.log_source})`).join("\n")}

AFFECTED ASSETS: ${assetsRes.rows.slice(0, 5).map((a: any) => `${a.hostname} (${a.ip_address})`).join(", ")}

Provide TRIAGE findings as JSON (focus on classification, evidence correlation, and MITRE mapping — NOT containment or response):
{
  "verdict": "true_positive|false_positive|inconclusive",
  "confidence": <0-100>,
  "executiveSummary": "...",
  "triageClassification": "true_positive|false_positive|benign|suspicious|inconclusive",
  "evidenceCorrelation": "...",
  "mitreMappings": [{"tactic": "...", "technique": "...", "subtechnique": "..."}],
  "attackChain": [{"phase": "...", "description": "..."}],
  "affectedEntities": ["..."],
  "escalationRecommendation": "escalate_to_vanguard|escalate_to_sentinel|no_escalation",
  "escalationReason": "...",
  "iocsSummary": [{"type": "ip|domain|hash|email", "value": "...", "reputation": "malicious|suspicious|clean"}]
}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try { investigation = JSON.parse(content); } catch { investigation = { verdict: "inconclusive", confidence: 50, executiveSummary: "Parse error" }; }
    } else {
      const isCritical = incident.severity === "critical" || incident.severity === "high";
      const confidence = eventsRes.rows.length > 5 ? 65 : 55;
      const escalation = isCritical ? "escalate_to_vanguard" : eventsRes.rows.length > 10 ? "escalate_to_sentinel" : "no_escalation";
      investigation = {
        verdict: "inconclusive",
        confidence,
        executiveSummary: `L1 Triage of ${incident.severity} severity incident "${incident.title}" from ${incident.source || "unknown source"}. ${eventsRes.rows.length} related security events correlated. ${assetsRes.rows.length} assets in scope. ${isCritical ? "Escalation to VANGUARD recommended for containment and response." : "Standard triage completed — no immediate escalation required."}`,
        triageClassification: isCritical ? "suspicious" : "inconclusive",
        evidenceCorrelation: `${eventsRes.rows.length} events correlated from ${incident.source || "unknown"} source`,
        mitreMappings: incident.mitre_tactic ? [{ tactic: incident.mitre_tactic, technique: incident.mitre_technique || "Unknown", subtechnique: "N/A" }] : [],
        attackChain: [{ phase: "Detection", description: `Incident detected from ${incident.source || "security monitoring"} with ${incident.severity} severity` }],
        affectedEntities: assetsRes.rows.slice(0, 5).map((a: any) => a.hostname || a.ip_address),
        escalationRecommendation: escalation,
        escalationReason: isCritical ? "Critical/high severity requires VANGUARD incident response" : "Standard severity — continued monitoring",
        iocsSummary: [],
      };
    }

    const existingInv = await pool.query(`SELECT id FROM ai_investigations WHERE incident_id = $1`, [incidentId]);
    if (existingInv.rows.length === 0) {
      await pool.query(`
        INSERT INTO ai_investigations (incident_id, tenant_id, findings, recommendations, attack_chain,
          executive_summary, risk_score, confidence_score, verdict, verdict_reasoning, iocs_summary, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', NOW())
      `, [
        incidentId, incident.tenant_id,
        JSON.stringify(investigation), JSON.stringify(investigation.recommendations || []),
        JSON.stringify(investigation.attackChain || []),
        investigation.executiveSummary || "Investigation completed by AI agent",
        investigation.confidence || 50, investigation.confidence || 50,
        investigation.verdict || "inconclusive",
        `AI Agent ${agent.name} investigation`,
        JSON.stringify(investigation.iocsSummary || []),
      ]);
    }

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: incident.tenant_id, activityType: "incident_investigation",
      targetId: incidentId, targetType: "incident",
      summary: `Investigated incident #${incidentId}: ${incident.title} — Verdict: ${investigation.verdict} (${investigation.confidence}%)`,
      details: investigation, confidence: investigation.confidence || 50, duration,
    });
    await updateAgentStats(agentId, "incident_investigation");

    // Auto-draft a detection rule when the AI agent confirms a True Positive (non-blocking)
    if (investigation.verdict === "true_positive") {
      setImmediate(async () => {
        try {
          await generateRuleFromIncident(incident.tenant_id, incidentId, `ai-agent-${agentId}`);
        } catch (e: any) {
          console.warn(`[DetectionEngine] Orchestrator auto-draft failed for incident ${incidentId}:`, e.message);
        }
      });
    }

    return { success: true, verdict: investigation.verdict, confidence: investigation.confidence || 50 };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Investigation error:`, err.message);
    return { success: false, verdict: "error", confidence: 0 };
  }
}

export async function generateProactiveInsight(agentId: number, tenantId: number): Promise<{ success: boolean; summary: string }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, summary: "Agent not found" };

  const statsRes = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as new_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity IN ('critical', 'high') AND status NOT IN ('closed', 'resolved')) as open_critical,
      (SELECT COUNT(*) FROM security_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as new_events,
      (SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status IN ('open', 'in_progress')) as open_tickets,
      (SELECT COUNT(*) FROM assets WHERE tenant_id = $1) as total_assets
  `, [tenantId]);

  const stats = statsRes.rows[0];

  try {
    const openai = getOpenAI();
    let insight: any;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[3].personality },
          {
            role: "user",
            content: `You are GUARDIAN performing a Compliance & Posture Assessment. Your role is EXCLUSIVELY compliance posture, framework mapping, and SLA adherence — NOT incident investigation or threat hunting.

Generate a compliance-focused security posture briefing based on current metrics:

- New incidents (24h): ${stats.new_incidents}
- Open critical/high incidents: ${stats.open_critical}
- New security events (24h): ${stats.new_events}
- Open tickets: ${stats.open_tickets}
- Total monitored assets: ${stats.total_assets}

Provide a compliance-focused assessment with:
1. Compliance posture assessment (NIST CSF, ISO 27001, SOC 2 alignment)
2. SLA adherence status and risk areas
3. Framework control gaps identified
4. Recommended compliance remediation actions
5. Risk trend indicator (improving/stable/degrading)

Return as JSON: {"summary": "...", "riskTrend": "improving|stable|degrading", "priorityActions": ["..."], "threatPosture": "low|moderate|elevated|high|critical", "complianceFrameworks": ["NIST CSF", "ISO 27001"], "slaStatus": "compliant|at_risk|breached", "controlGaps": ["..."]}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try { insight = JSON.parse(content); } catch { insight = { summary: "Insight generation completed", riskTrend: "stable" }; }
    } else {
      const openCritical = parseInt(stats.open_critical) || 0;
      const newIncidents = parseInt(stats.new_incidents) || 0;
      const newEvents = parseInt(stats.new_events) || 0;
      const openTickets = parseInt(stats.open_tickets) || 0;
      const totalAssets = parseInt(stats.total_assets) || 0;

      let threatPosture: string;
      const priorityActions: string[] = [];

      if (openCritical > 5) { threatPosture = "critical"; priorityActions.push("Immediately investigate and triage all critical/high incidents"); }
      else if (openCritical > 2) { threatPosture = "high"; priorityActions.push("Prioritize resolution of open critical/high severity incidents"); }
      else if (openCritical > 0) { threatPosture = "elevated"; priorityActions.push("Monitor open critical incidents and prepare response plans"); }
      else if (newIncidents > 10) { threatPosture = "moderate"; priorityActions.push("Review new incidents for emerging threat patterns"); }
      else { threatPosture = "low"; priorityActions.push("Continue routine monitoring and threat hunting activities"); }

      if (openTickets > 0) priorityActions.push(`Address ${openTickets} open support ticket(s) to maintain SLA compliance`);
      if (totalAssets > 0) priorityActions.push(`Ensure continuous monitoring coverage across ${totalAssets} managed assets`);
      if (newEvents > 100) priorityActions.push("Analyze high event volume for potential false positive tuning opportunities");

      const riskTrend = openCritical > 3 ? "degrading" : openCritical > 0 ? "stable" : "improving";
      const slaStatus = openCritical > 3 ? "breached" : openCritical > 0 ? "at_risk" : "compliant";
      insight = {
        summary: `Compliance posture: ${threatPosture.toUpperCase()}. ${newIncidents} new incident(s) in 24h, ${openCritical} open critical/high. ${newEvents} security events processed. ${totalAssets} assets under monitoring. SLA status: ${slaStatus}.`,
        riskTrend,
        priorityActions,
        threatPosture,
        complianceFrameworks: ["NIST CSF", "ISO 27001", "SOC 2"],
        slaStatus,
        controlGaps: openCritical > 0 ? ["Incident response SLA at risk due to open critical incidents"] : [],
      };
    }

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId, activityType: "compliance_insight",
      summary: insight.summary || "Compliance posture assessment generated",
      details: insight, confidence: openai ? 85 : 75, duration,
    });
    await updateAgentStats(agentId, "compliance_insight");

    return { success: true, summary: insight.summary };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Insight error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId, activityType: "compliance_insight",
      summary: `Compliance insight scan completed with error: ${err.message}`,
      details: { error: err.message }, confidence: 0, duration,
    });
    return { success: false, summary: err.message };
  }
}

export async function respondToIncident(agentId: number, incidentId: number): Promise<{ success: boolean; summary: string; confidence: number }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, summary: "Agent not found", confidence: 0 };

  const incidentRes = await pool.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  const incident = incidentRes.rows[0];
  if (!incident) return { success: false, summary: "Incident not found", confidence: 0 };

  const investigationRes = await pool.query(`
    SELECT * FROM ai_investigations WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [incidentId]);
  const ariaFindings = investigationRes.rows[0];
  if (!ariaFindings) return { success: false, summary: "No ARIA investigation found — cannot respond without triage", confidence: 0 };

  const assetsRes = await pool.query(`
    SELECT hostname, ip_address, operating_system, risk_score, status
    FROM assets WHERE tenant_id = $1 LIMIT 10
  `, [incident.tenant_id]);

  try {
    const openai = getOpenAI();
    let response_plan: any;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[4].personality },
          {
            role: "user",
            content: `You are VANGUARD performing Incident Response & Containment. ARIA has already triaged this incident. Your role is EXCLUSIVELY containment, response actions, and remediation — NOT re-investigation or classification.

INCIDENT #${incident.id}
Title: ${incident.title}
Severity: ${incident.severity}
Source: ${incident.source}
Status: ${incident.status}

ARIA'S TRIAGE FINDINGS:
Verdict: ${ariaFindings.verdict || "inconclusive"}
Confidence: ${ariaFindings.confidence_score || 50}%
Executive Summary: ${ariaFindings.executive_summary || "N/A"}
Attack Chain: ${JSON.stringify(ariaFindings.attack_chain || [])}
IOCs: ${JSON.stringify(ariaFindings.iocs_summary || [])}

AFFECTED ASSETS: ${assetsRes.rows.slice(0, 5).map((a: any) => `${a.hostname} (${a.ip_address}, ${a.operating_system || "Unknown OS"})`).join(", ")}

Generate an incident response plan as JSON:
{
  "containmentActions": [{"action": "...", "urgency": "immediate|within_1h|within_4h", "target": "...", "status": "recommended"}],
  "endpointIsolation": [{"hostname": "...", "ip": "...", "isolationMethod": "network|process|full", "reason": "..."}],
  "networkBlocks": [{"type": "ip|domain|url", "value": "...", "direction": "inbound|outbound|both", "reason": "..."}],
  "credentialResets": [{"account": "...", "reason": "...", "priority": "immediate|scheduled"}],
  "firewallRules": [{"action": "block|allow", "source": "...", "destination": "...", "port": "...", "reason": "..."}],
  "blastRadius": {"affectedSystems": 0, "affectedUsers": 0, "dataAtRisk": "...", "businessImpact": "low|medium|high|critical"},
  "remediationTimeline": [{"phase": "...", "duration": "...", "actions": ["..."]}],
  "executiveSummary": "...",
  "confidence": <0-100>
}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try { response_plan = JSON.parse(content); } catch { response_plan = { executiveSummary: "Response plan generation completed", confidence: 50, containmentActions: [] }; }
    } else {
      const isCritical = incident.severity === "critical" || incident.severity === "high";
      const affectedHosts = assetsRes.rows.slice(0, 5);

      response_plan = {
        containmentActions: [
          { action: isCritical ? "Isolate affected endpoints from network" : "Monitor affected endpoints for further activity", urgency: isCritical ? "immediate" : "within_4h", target: affectedHosts.map((a: any) => a.hostname).join(", ") || "TBD", status: "recommended" },
          { action: "Block identified malicious indicators at perimeter", urgency: "within_1h", target: "Firewall/Proxy", status: "recommended" },
          { action: "Review and reset potentially compromised credentials", urgency: isCritical ? "immediate" : "within_4h", target: "Active Directory", status: "recommended" },
        ],
        endpointIsolation: affectedHosts.slice(0, 3).map((a: any) => ({
          hostname: a.hostname || "Unknown", ip: a.ip_address || "Unknown",
          isolationMethod: isCritical ? "full" : "network", reason: `Part of incident #${incidentId} blast radius`,
        })),
        networkBlocks: (ariaFindings.iocs_summary || []).filter((ioc: any) => ioc.type === "ip" || ioc.type === "domain").slice(0, 5).map((ioc: any) => ({
          type: ioc.type, value: ioc.value, direction: "both", reason: `IOC identified in ARIA triage — ${ioc.reputation || "suspicious"}`,
        })),
        credentialResets: isCritical ? [{ account: "Affected service accounts", reason: "Potential credential compromise in critical incident", priority: "immediate" }] : [],
        firewallRules: [],
        blastRadius: {
          affectedSystems: affectedHosts.length,
          affectedUsers: 0,
          dataAtRisk: isCritical ? "Potentially sensitive data at risk" : "No confirmed data exposure",
          businessImpact: isCritical ? "high" : "medium",
        },
        remediationTimeline: [
          { phase: "Containment", duration: isCritical ? "0-2 hours" : "0-4 hours", actions: ["Isolate endpoints", "Block IOCs"] },
          { phase: "Eradication", duration: "2-24 hours", actions: ["Remove malware", "Patch vulnerabilities"] },
          { phase: "Recovery", duration: "1-3 days", actions: ["Restore services", "Verify integrity"] },
        ],
        executiveSummary: `VANGUARD Incident Response for ${incident.severity} severity incident "${incident.title}". ${affectedHosts.length} systems in blast radius. ${isCritical ? "Immediate containment actions recommended." : "Standard response procedures initiated."} Based on ARIA's triage (verdict: ${ariaFindings.verdict || "inconclusive"}, confidence: ${ariaFindings.confidence_score || 50}%).`,
        confidence: isCritical ? 70 : 65,
      };
    }

    const confidence = response_plan.confidence || 65;

    await pool.query(`
      UPDATE ai_investigations 
      SET findings = jsonb_set(
            jsonb_set(COALESCE(findings, '{}')::jsonb, '{response_plan}', $1::jsonb),
            '{vanguard_response}', $2::jsonb)
      WHERE incident_id = $3
    `, [
      JSON.stringify(response_plan),
      JSON.stringify({ respondedAt: new Date().toISOString(), agentId, confidence }),
      incidentId,
    ]);

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: incident.tenant_id, activityType: "incident_response",
      targetId: incidentId, targetType: "incident",
      summary: `Incident response plan for #${incidentId}: ${incident.title} — ${(response_plan.containmentActions || []).length} containment actions, blast radius: ${response_plan.blastRadius?.affectedSystems || 0} systems`,
      details: response_plan, confidence, duration,
    });
    await updateAgentStats(agentId, "incident_response");

    return { success: true, summary: response_plan.executiveSummary || `Response plan generated for incident #${incidentId}`, confidence };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Incident response error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: incident.tenant_id, activityType: "incident_response",
      targetId: incidentId, targetType: "incident",
      summary: `Failed to generate response plan for incident #${incidentId}: ${err.message}`,
      details: { error: err.message }, confidence: 0, duration,
    });
    return { success: false, summary: err.message, confidence: 0 };
  }
}

export async function notifyClient(agentId: number, incidentId: number): Promise<{ success: boolean; summary: string }> {
  const startTime = Date.now();
  const agent = await getAgentProfile(agentId);
  if (!agent) return { success: false, summary: "Agent not found" };

  const incidentRes = await pool.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  const incident = incidentRes.rows[0];
  if (!incident) return { success: false, summary: "Incident not found" };

  const investigationRes = await pool.query(`
    SELECT * FROM ai_investigations WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [incidentId]);
  const investigation = investigationRes.rows[0];
  if (!investigation) return { success: false, summary: "No investigation record found" };

  const tenantRes = await pool.query(`SELECT name, industry FROM tenants WHERE id = $1`, [incident.tenant_id]);
  const tenantInfo = tenantRes.rows[0];

  const responsePlan = (investigation.findings as any)?.response_plan;
  const vanguardPipeline = (investigation.findings as any)?.vanguard_response || (investigation.agent_pipeline as any)?.vanguard_response;

  try {
    const openai = getOpenAI();
    let notification: any;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: agent.ai_model || "gpt-4o-mini",
        messages: [
          { role: "system", content: agent.ai_personality || AI_AGENT_PROFILES[2].personality },
          {
            role: "user",
            content: `You are NEXUS generating a Client Notification. Create a professional, non-technical summary of a security incident for executive stakeholders at ${tenantInfo?.name || "the customer"}.

INCIDENT #${incident.id}
Title: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}

ARIA'S INVESTIGATION:
Verdict: ${investigation.verdict || "inconclusive"}
Summary: ${investigation.executive_summary || "N/A"}

VANGUARD'S RESPONSE:
${responsePlan ? `Actions Taken: ${JSON.stringify(responsePlan.containmentActions || []).substring(0, 500)}
Business Impact: ${responsePlan.blastRadius?.businessImpact || "N/A"}
Remediation Timeline: ${JSON.stringify(responsePlan.remediationTimeline || []).substring(0, 300)}` : "Response plan pending"}

Generate a client notification as JSON:
{
  "subject": "Security Incident Notification — ...",
  "notificationBody": "Professional, non-technical client-facing summary (3-5 paragraphs)",
  "incidentSummary": "1-2 sentence executive overview",
  "responseActionsTaken": ["Plain-language description of what was done"],
  "currentStatus": "contained|investigating|resolved|monitoring",
  "nextSteps": ["What the client can expect next"],
  "estimatedResolution": "...",
  "clientActionRequired": true/false,
  "clientActions": ["Actions the client needs to take, if any"],
  "confidence": <0-100>
}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      try { notification = JSON.parse(content); } catch { notification = { subject: "Security Incident Update", notificationBody: "Notification generated", confidence: 50 }; }
    } else {
      const isCritical = incident.severity === "critical" || incident.severity === "high";
      const actionsCount = responsePlan?.containmentActions?.length || 0;

      notification = {
        subject: `Security Incident Notification — ${incident.severity.toUpperCase()} Severity: ${incident.title}`,
        notificationBody: `Dear ${tenantInfo?.name || "Valued Customer"},\n\nWe are writing to inform you of a security incident that has been detected and is being actively managed by our Security Operations Center.\n\n**Incident Overview:**\nA ${incident.severity} severity security event, "${incident.title}", was detected through our monitoring systems. Our AI-powered SOC team has completed initial analysis and response procedures.\n\n**Actions Taken:**\nOur team has performed ${actionsCount} containment action(s) to limit any potential impact. ${responsePlan ? `The estimated business impact is ${responsePlan.blastRadius?.businessImpact || "under assessment"}.` : "Response actions are in progress."}\n\n**Current Status:**\nThe incident is currently ${isCritical ? "under active containment" : "being monitored"}. Our team continues to monitor the situation and will provide updates as needed.\n\n**Next Steps:**\nWe will continue to monitor this situation and provide regular updates. ${isCritical ? "Our team is available for an immediate briefing call if required." : "No immediate action is required from your side."}\n\nBest regards,\nSecureOps Security Operations Center`,
        incidentSummary: `A ${incident.severity} severity incident "${incident.title}" was detected, investigated by ARIA, and response actions were ${responsePlan ? "executed" : "planned"} by VANGUARD.`,
        responseActionsTaken: responsePlan?.containmentActions?.map((a: any) => a.action) || ["Incident has been triaged and prioritized for response"],
        currentStatus: responsePlan ? "contained" : "investigating",
        nextSteps: [
          "Continued monitoring of affected systems",
          isCritical ? "Scheduled follow-up briefing within 24 hours" : "Summary report will be provided at next reporting cycle",
          "Post-incident review and lessons learned",
        ],
        estimatedResolution: isCritical ? "Within 24-48 hours" : "Within standard SLA timeframe",
        clientActionRequired: false,
        clientActions: [],
        confidence: 70,
      };
    }

    const confidence = notification.confidence || 70;

    await pool.query(`
      UPDATE ai_investigations 
      SET findings = jsonb_set(COALESCE(findings, '{}')::jsonb, '{nexus_notification}', $1::jsonb)
      WHERE incident_id = $2
    `, [
      JSON.stringify({ notifiedAt: new Date().toISOString(), agentId, subject: notification.subject, confidence }),
      incidentId,
    ]);

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: incident.tenant_id, activityType: "client_notification",
      targetId: incidentId, targetType: "incident",
      summary: `Client notification for incident #${incidentId}: ${notification.subject || incident.title}`,
      details: notification, confidence, duration,
    });
    await updateAgentStats(agentId, "client_notification");

    return { success: true, summary: notification.incidentSummary || `Client notification sent for incident #${incidentId}` };
  } catch (err: any) {
    console.error(`[AIAgent ${agent.name}] Client notification error:`, err.message);
    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId, tenantId: incident.tenant_id, activityType: "client_notification",
      targetId: incidentId, targetType: "incident",
      summary: `Failed to generate client notification for incident #${incidentId}: ${err.message}`,
      details: { error: err.message }, confidence: 0, duration,
    });
    return { success: false, summary: err.message };
  }
}

export async function generateDailySummary(tenantId: number): Promise<{ success: boolean; summary: any }> {
  const startTime = Date.now();

  const ariaRes = await pool.query(`
    SELECT id, name, ai_personality, ai_model FROM team_members 
    WHERE tenant_id = $1 AND is_ai = true AND ai_specialization = 'soc_analyst' LIMIT 1
  `, [tenantId]);
  const aria = ariaRes.rows[0];
  if (!aria) return { success: false, summary: { error: "No SOC analyst agent found" } };

  const statsRes = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as new_incidents_24h,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity = 'critical' AND created_at > NOW() - INTERVAL '24 hours') as critical_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity = 'high' AND created_at > NOW() - INTERVAL '24 hours') as high_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity = 'medium' AND created_at > NOW() - INTERVAL '24 hours') as medium_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity = 'low' AND created_at > NOW() - INTERVAL '24 hours') as low_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND status IN ('closed', 'resolved') AND created_at > NOW() - INTERVAL '24 hours') as resolved_incidents,
      (SELECT COUNT(*) FROM incidents WHERE tenant_id = $1 AND severity IN ('critical', 'high') AND status NOT IN ('closed', 'resolved')) as open_critical_high,
      (SELECT COUNT(*) FROM security_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as events_24h,
      (SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status IN ('open', 'in_progress')) as open_tickets,
      (SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status = 'resolved' AND created_at > NOW() - INTERVAL '24 hours') as resolved_tickets,
      (SELECT COUNT(*) FROM assets WHERE tenant_id = $1) as total_assets,
      (SELECT COUNT(*) FROM assets WHERE tenant_id = $1 AND risk_level IN ('critical', 'high')) as high_risk_assets
  `, [tenantId]);
  const stats = statsRes.rows[0];

  const agentActivityRes = await pool.query(`
    SELECT activity_type, COUNT(*) as count, AVG(confidence) as avg_confidence
    FROM ai_agent_activity_log 
    WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY activity_type
  `, [tenantId]);

  const recentIncidentsRes = await pool.query(`
    SELECT id, title, severity, status, source, created_at
    FROM incidents WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 15
  `, [tenantId]);

  const topThreatsRes = await pool.query(`
    SELECT threat, severity, COUNT(*) as count
    FROM security_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY threat, severity ORDER BY count DESC LIMIT 10
  `, [tenantId]);

  const tenantRes = await pool.query(`SELECT name, industry FROM tenants WHERE id = $1`, [tenantId]);
  const tenantInfo = tenantRes.rows[0];

  try {
    const openai = getOpenAI();

    const agentActivity = agentActivityRes.rows.map((r: any) => ({
      type: r.activity_type, count: parseInt(r.count), avgConfidence: Math.round(parseFloat(r.avg_confidence || "0")),
    }));

    let report: any;

    if (openai) {
    const response = await openai.chat.completions.create({
      model: aria.ai_model || "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are ARIA, the lead AI SOC Analyst. Generate a comprehensive Daily SOC Summary Report for executive and analyst consumption. Be thorough, data-driven, and actionable.` },
        {
          role: "user",
          content: `Generate a Daily SOC Summary Report for ${tenantInfo?.name || "the organization"} (${tenantInfo?.industry || "Technology"}).

METRICS (Last 24 Hours):
- New Incidents: ${stats.new_incidents_24h} (Critical: ${stats.critical_incidents}, High: ${stats.high_incidents}, Medium: ${stats.medium_incidents}, Low: ${stats.low_incidents})
- Resolved Incidents: ${stats.resolved_incidents}
- Open Critical/High: ${stats.open_critical_high}
- Security Events: ${stats.events_24h}
- Open Tickets: ${stats.open_tickets}, Resolved Tickets: ${stats.resolved_tickets}
- Total Assets: ${stats.total_assets}, High-Risk Assets: ${stats.high_risk_assets}

AI AGENT ACTIVITY (24h):
${agentActivity.map((a: any) => `- ${a.type}: ${a.count} actions (avg confidence: ${a.avgConfidence}%)`).join("\n") || "No activity"}

RECENT INCIDENTS:
${recentIncidentsRes.rows.map((i: any) => `- [${i.severity}] ${i.title} (${i.source || "Unknown"}) - ${i.status}`).join("\n") || "None"}

TOP THREATS:
${topThreatsRes.rows.map((t: any) => `- ${t.threat} [${t.severity}]: ${t.count} events`).join("\n") || "None"}

Generate a JSON report:
{
  "reportDate": "YYYY-MM-DD",
  "executiveSummary": "2-3 sentence high-level overview",
  "securityPosture": {
    "overallRisk": "low|moderate|elevated|high|critical",
    "trend": "improving|stable|degrading",
    "incidentsByServerity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
    "resolutionRate": 0,
    "meanTimeToRespond": "estimated"
  },
  "keyThreats": [
    {"title": "...", "severity": "critical|high|medium|low", "description": "...", "status": "active|contained|resolved", "affectedSystems": "..."}
  ],
  "aiPerformance": {
    "totalActions": 0,
    "ticketsResolved": 0,
    "investigationsCompleted": 0,
    "threatsHunted": 0,
    "insightsGenerated": 0,
    "averageConfidence": 0,
    "summary": "..."
  },
  "unresolvedCritical": [
    {"title": "...", "severity": "...", "age": "...", "recommendation": "..."}
  ],
  "recommendations": [
    {"priority": "immediate|short_term|long_term", "action": "...", "rationale": "..."}
  ],
  "riskTrendAnalysis": "Paragraph analyzing the risk trend over the past period",
  "nextDayFocus": ["Action item 1", "Action item 2"]
}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

      const content = response.choices[0]?.message?.content || "{}";
      try { report = JSON.parse(content); } catch { report = { executiveSummary: "Report generation completed", securityPosture: { overallRisk: "moderate", trend: "stable" } }; }
    } else {
      const newInc = parseInt(stats.new_incidents_24h) || 0;
      const critInc = parseInt(stats.critical_incidents) || 0;
      const highInc = parseInt(stats.high_incidents) || 0;
      const medInc = parseInt(stats.medium_incidents) || 0;
      const lowInc = parseInt(stats.low_incidents) || 0;
      const resolvedInc = parseInt(stats.resolved_incidents) || 0;
      const openCritHigh = parseInt(stats.open_critical_high) || 0;
      const events = parseInt(stats.events_24h) || 0;
      const openTix = parseInt(stats.open_tickets) || 0;
      const resolvedTix = parseInt(stats.resolved_tickets) || 0;
      const totalAssets = parseInt(stats.total_assets) || 0;
      const highRiskAssets = parseInt(stats.high_risk_assets) || 0;
      const resolutionRate = newInc > 0 ? Math.round((resolvedInc / newInc) * 100) : 100;

      let overallRisk: string;
      if (critInc > 3 || openCritHigh > 5) overallRisk = "critical";
      else if (critInc > 0 || openCritHigh > 2) overallRisk = "high";
      else if (highInc > 2 || openCritHigh > 0) overallRisk = "elevated";
      else if (newInc > 5) overallRisk = "moderate";
      else overallRisk = "low";

      const trend = openCritHigh > 3 ? "degrading" : openCritHigh > 0 ? "stable" : "improving";

      const totalActions = agentActivity.reduce((sum: number, a: any) => sum + a.count, 0);
      const avgConf = agentActivity.length > 0 ? Math.round(agentActivity.reduce((sum: number, a: any) => sum + a.avgConfidence, 0) / agentActivity.length) : 0;

      report = {
        executiveSummary: `Daily SOC Summary for ${tenantInfo?.name || "organization"}: ${newInc} incident(s) detected in the last 24 hours (${critInc} critical, ${highInc} high, ${medInc} medium, ${lowInc} low). ${resolvedInc} incident(s) resolved. ${events} security events processed across ${totalAssets} monitored assets. Overall risk level: ${overallRisk.toUpperCase()}.`,
        securityPosture: {
          overallRisk,
          trend,
          incidentsBySeverity: { critical: critInc, high: highInc, medium: medInc, low: lowInc },
          resolutionRate: resolutionRate + "%",
          meanTimeToRespond: "Automated",
        },
        keyThreats: recentIncidentsRes.rows.filter((i: any) => i.severity === "critical" || i.severity === "high").slice(0, 5).map((i: any) => ({
          title: i.title, severity: i.severity, description: `Incident from ${i.source || "unknown source"}`, status: i.status === "closed" || i.status === "resolved" ? "resolved" : "active", affectedSystems: "Under investigation",
        })),
        aiPerformance: {
          totalActions,
          ticketsResolved: agentActivity.find((a: any) => a.type === "ticket_response")?.count || 0,
          investigationsCompleted: agentActivity.find((a: any) => a.type === "incident_investigation")?.count || 0,
          threatsHunted: agentActivity.find((a: any) => a.type === "threat_hunt")?.count || 0,
          insightsGenerated: (agentActivity.find((a: any) => a.type === "proactive_insight")?.count || 0) + (agentActivity.find((a: any) => a.type === "compliance_insight")?.count || 0),
          averageConfidence: avgConf,
          summary: `${totalActions} total AI actions performed with ${avgConf}% average confidence.`,
        },
        unresolvedCritical: recentIncidentsRes.rows.filter((i: any) => (i.severity === "critical" || i.severity === "high") && i.status !== "closed" && i.status !== "resolved").map((i: any) => ({
          title: i.title, severity: i.severity, age: "Within 24h", recommendation: "Prioritize investigation and containment",
        })),
        recommendations: [
          ...(openCritHigh > 0 ? [{ priority: "immediate", action: `Investigate ${openCritHigh} open critical/high incident(s)`, rationale: "Unresolved high-severity incidents pose active risk" }] : []),
          ...(openTix > 0 ? [{ priority: "short_term", action: `Address ${openTix} open ticket(s)`, rationale: "Maintain SLA compliance and customer satisfaction" }] : []),
          ...(highRiskAssets > 0 ? [{ priority: "short_term", action: `Review ${highRiskAssets} high-risk asset(s) for remediation`, rationale: "Reduce attack surface exposure" }] : []),
          { priority: "long_term", action: "Continue proactive threat hunting and monitoring", rationale: "Maintain security posture and early threat detection" },
        ],
        riskTrendAnalysis: `Risk trend is ${trend}. ${openCritHigh > 0 ? `${openCritHigh} open critical/high incidents require immediate attention.` : "No critical/high incidents are currently open."} ${events > 0 ? `${events} security events were processed in the last 24 hours.` : "No security events detected in the monitoring period."} ${resolutionRate >= 80 ? "Incident resolution rate is healthy." : "Incident resolution rate needs improvement."}`,
        nextDayFocus: [
          ...(openCritHigh > 0 ? [`Resolve ${openCritHigh} open critical/high incident(s)`] : []),
          "Continue automated threat hunting across all data sources",
          "Monitor for emerging threat patterns and indicators",
          ...(openTix > 0 ? [`Process ${openTix} open support ticket(s)`] : []),
        ],
      };
    }

    report.reportDate = report.reportDate || new Date().toISOString().split("T")[0];
    report.generatedAt = new Date().toISOString();
    report.generatedBy = "ARIA";
    report.tenantId = tenantId;
    report.tenantName = tenantInfo?.name || "Unknown";

    const duration = Date.now() - startTime;
    await logAgentActivity({
      agentId: aria.id, tenantId, activityType: "daily_summary",
      summary: `Daily SOC Summary: ${report.securityPosture?.overallRisk || "moderate"} risk, ${stats.new_incidents_24h} incidents, ${stats.events_24h} events`,
      details: report, confidence: openai ? 90 : 75, duration,
    });
    await updateAgentStats(aria.id, "daily_summary");

    return { success: true, summary: report };
  } catch (err: any) {
    console.error(`[AIAgent ARIA] Daily summary error:`, err.message);
    return { success: false, summary: { error: err.message } };
  }
}

export async function provisionAIAgents(tenantId: number): Promise<{ agents: any[]; shiftsCreated: number }> {
  const agents: any[] = [];
  let shiftsCreated = 0;

  const existing = await pool.query(`SELECT id, ai_specialization FROM team_members WHERE tenant_id = $1 AND is_ai = true`, [tenantId]);
  const existingSpecs = new Set(existing.rows.map((r: any) => r.ai_specialization));

  for (const profile of AI_AGENT_PROFILES) {
    if (existingSpecs.has(profile.specialization)) {
      agents.push(existing.rows.find((r: any) => r.ai_specialization === profile.specialization));
      continue;
    }

    const result = await pool.query(`
      INSERT INTO team_members (tenant_id, name, email, role, team_type, phone, is_active, is_ai, ai_specialization, ai_personality, ai_model, ai_avatar, ai_stats)
      VALUES ($1, $2, $3, $4, $5, $6, true, true, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      tenantId, profile.name, `${profile.name.toLowerCase()}@ai.secureops.local`,
      profile.role, profile.teamType, null,
      profile.specialization, profile.personality, "gpt-4o-mini", profile.avatar,
      JSON.stringify({
        ticketsResolved: 0, threatsFound: 0, incidentsInvestigated: 0,
        insightsGenerated: 0, totalActions: 0, avgResponseTimeMs: 0,
        avgConfidence: 0, humanApprovals: 0, humanOverrides: 0,
        lastActiveAt: null, provisionedAt: new Date().toISOString(),
      }),
    ]);

    const agentRow = result.rows[0];
    agents.push(agentRow);

    const today = new Date();
    for (let d = 0; d < 90; d++) {
      const shiftDate = new Date(today);
      shiftDate.setDate(today.getDate() + d);
      await pool.query(`
        INSERT INTO shift_rosters (tenant_id, team_member_id, shift_date, start_time, end_time, shift_type, notes)
        VALUES ($1, $2, $3, '00:00', '23:59', 'ai_24x7', $4)
        ON CONFLICT DO NOTHING
      `, [tenantId, agentRow.id, shiftDate, `AI Agent ${profile.name} - 24/7 Autonomous Operations`]);
      shiftsCreated++;
    }
  }

  console.log(`[AIWorkforce] Provisioned ${agents.length} AI agents for tenant ${tenantId} with ${shiftsCreated} shift entries`);
  return { agents, shiftsCreated };
}

const CATEGORY_AGENT_MAP: Record<string, string[]> = {
  "security_incident": ["ARIA", "VANGUARD"],
  "active_threat": ["VANGUARD", "ARIA"],
  "threat_hunt": ["SENTINEL"],
  "compliance": ["GUARDIAN"],
  "access_issue": ["NEXUS"],
  "service_request": ["NEXUS"],
  "general": ["NEXUS"],
};

async function logPipelineStep(
  ticketId: number, tenantId: number, stepName: string, status: string,
  agentName?: string, confidence?: number, outputText?: string, errorMessage?: string
) {
  await pool.query(`
    INSERT INTO ai_ticket_tasks (ticket_id, tenant_id, step_name, status, agent_name, confidence, output_text, error_message, started_at, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), ${status === "completed" || status === "failed" ? "NOW()" : "NULL"})
  `, [ticketId, tenantId, stepName, status, agentName || null, confidence ?? null, outputText || null, errorMessage || null]);
}

async function categorizeTicket(ticket: any): Promise<{ category: string; confidence: number }> {
  const openai = getOpenAI();
  const title = (ticket.title || "").toLowerCase();
  const desc = (ticket.description || "").toLowerCase();
  const combined = `${title} ${desc}`;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a ticket categorization agent. Categorize the ticket into exactly one category. Respond with JSON only: {\"category\": \"...\", \"confidence\": 0-100}" },
          { role: "user", content: `Categorize this support ticket:\nTitle: ${ticket.title}\nDescription: ${ticket.description || "N/A"}\nPriority: ${ticket.priority}\n\nCategories: security_incident, active_threat, threat_hunt, compliance, access_issue, service_request, general` }
        ],
        temperature: 0.3,
        max_tokens: 100,
      });
      const text = response.choices[0]?.message?.content || "";
      const match = text.match(/\{[^}]+\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return { category: parsed.category || "general", confidence: parsed.confidence || 70 };
      }
    } catch {}
  }

  if (combined.includes("breach") || combined.includes("malware") || combined.includes("ransomware") || combined.includes("intrusion")) {
    return { category: "security_incident", confidence: 80 };
  }
  if (combined.includes("threat") || combined.includes("attack") || combined.includes("exploit")) {
    return { category: "active_threat", confidence: 75 };
  }
  if (combined.includes("hunt") || combined.includes("ioc") || combined.includes("indicator")) {
    return { category: "threat_hunt", confidence: 75 };
  }
  if (combined.includes("compliance") || combined.includes("audit") || combined.includes("regulation") || combined.includes("gdpr") || combined.includes("pci")) {
    return { category: "compliance", confidence: 80 };
  }
  if (combined.includes("access") || combined.includes("password") || combined.includes("login") || combined.includes("mfa") || combined.includes("permission")) {
    return { category: "access_issue", confidence: 80 };
  }
  if (combined.includes("install") || combined.includes("configure") || combined.includes("setup") || combined.includes("deploy")) {
    return { category: "service_request", confidence: 75 };
  }
  return { category: "general", confidence: 65 };
}

export async function runTicketPipeline(ticketId: number, tenantId: number): Promise<{
  success: boolean; escalated: boolean; confidence: number; summary: string;
}> {
  const ESCALATION_THRESHOLD = 65;
  const MAX_ATTEMPTS = 2;

  try {
    await pool.query(`UPDATE tickets SET ai_handled = true, ai_pipeline_status = 'running', ai_escalated = false, ai_confidence = NULL, ai_agent_name = NULL WHERE id = $1`, [ticketId]);

    const ticketRes = await pool.query(`
      SELECT t.*, s.name as service_name FROM tickets t LEFT JOIN services s ON t.service_id = s.id WHERE t.id = $1
    `, [ticketId]);
    const ticket = ticketRes.rows[0];
    if (!ticket) {
      return { success: false, escalated: false, confidence: 0, summary: "Ticket not found" };
    }

    await logPipelineStep(ticketId, tenantId, "accepted", "completed", undefined, undefined, "Ticket accepted into AI pipeline");

    const catResult = await categorizeTicket(ticket);
    const category = catResult.category;
    const catConfidence = catResult.confidence;
    await pool.query(`UPDATE tickets SET category = $1 WHERE id = $2 AND (category IS NULL OR category = '')`, [category, ticketId]);
    await logPipelineStep(ticketId, tenantId, "categorized", "completed", undefined, catConfidence, `Category: ${category} (${catConfidence}% confidence)`);

    if (ticket.priority === "urgent" || category === "active_threat") {
      const urgentReason = ticket.priority === "urgent" ? "Urgent priority" : "Active threat detected";
      const handoffReport = `AI Immediate Escalation Report — TKT-${String(ticketId).padStart(4, "0")}\n` +
        `Category: ${category} | Priority: ${ticket.priority}\n` +
        `Escalation Reason: ${urgentReason} — requires immediate human attention.\n` +
        `Ticket: ${ticket.title}\n` +
        `Description: ${(ticket.description || "").substring(0, 500)}\n` +
        `Recommended Next Actions: Assign senior analyst. Initiate incident response if active threat confirmed.`;
      await logPipelineStep(ticketId, tenantId, "report_generated", "completed", undefined, catConfidence, handoffReport);

      await pool.query(`UPDATE tickets SET ai_escalated = true, ai_pipeline_status = 'escalated', ai_confidence = $1 WHERE id = $2`, [catConfidence, ticketId]);
      await logPipelineStep(ticketId, tenantId, "escalated", "completed", undefined, catConfidence,
        `${urgentReason} - escalated to human analyst`
      );

      const onShiftRes = await pool.query(`
        SELECT tm.name FROM team_members tm
        JOIN shift_rosters sr ON sr.team_member_id = tm.id
        WHERE tm.tenant_id = $1 AND tm.is_active = true AND tm.is_ai = false
        AND sr.shift_date = CURRENT_DATE
        ORDER BY RANDOM() LIMIT 1
      `, [tenantId]);
      const humanName = onShiftRes.rows[0]?.name || null;
      if (humanName) {
        await pool.query(`UPDATE tickets SET assigned_to = $1 WHERE id = $2`, [humanName, ticketId]);
      }

      try {
        await pool.query(
          `INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
           VALUES ($1, $2, $3, true, NOW())`,
          [ticketId, "AI Pipeline", handoffReport]
        );
      } catch (commentErr: any) {
        console.warn(`[AIPipeline] Failed to insert escalation comment for ticket #${ticketId}:`, commentErr.message);
      }

      return { success: true, escalated: true, confidence: catConfidence, summary: `Escalated: ${urgentReason.toLowerCase()}` };
    }

    const agentNames = CATEGORY_AGENT_MAP[category] || CATEGORY_AGENT_MAP["general"];
    const agentRes = await pool.query(
      `SELECT id, name FROM team_members WHERE tenant_id = $1 AND is_ai = true AND is_active = true AND name = ANY($2) LIMIT 1`,
      [tenantId, agentNames]
    );
    let agentId: number;
    let agentName: string;

    if (agentRes.rows.length > 0) {
      agentId = agentRes.rows[0].id;
      agentName = agentRes.rows[0].name;
    } else {
      const fallbackRes = await pool.query(
        `SELECT id, name FROM team_members WHERE tenant_id = $1 AND is_ai = true AND is_active = true LIMIT 1`,
        [tenantId]
      );
      if (fallbackRes.rows.length === 0) {
        await pool.query(`UPDATE tickets SET ai_pipeline_status = 'failed' WHERE id = $1`, [ticketId]);
        await logPipelineStep(ticketId, tenantId, "assigned", "failed", undefined, undefined, undefined, "No AI agents available for this tenant");
        return { success: false, escalated: false, confidence: 0, summary: "No AI agents available" };
      }
      agentId = fallbackRes.rows[0].id;
      agentName = fallbackRes.rows[0].name;
    }

    await pool.query(`UPDATE tickets SET ai_agent_name = $1, assigned_to = $1 WHERE id = $2`, [agentName, ticketId]);
    await logPipelineStep(ticketId, tenantId, "assigned", "completed", agentName, undefined, `Assigned to AI agent: ${agentName}`);

    let bestConfidence = 0;
    let bestSummary = "";
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      await logPipelineStep(ticketId, tenantId, "working", "in_progress", agentName, undefined, `Attempt ${attempts} of ${MAX_ATTEMPTS}`);

      const result = await processTicket(agentId, ticketId);
      bestConfidence = Math.max(bestConfidence, result.confidence);
      bestSummary = result.summary;

      await logPipelineStep(ticketId, tenantId, "working", "completed", agentName, result.confidence, `Attempt ${attempts}: ${result.summary}`);

      if (result.confidence >= ESCALATION_THRESHOLD) break;

      if (attempts < MAX_ATTEMPTS) {
        await logPipelineStep(ticketId, tenantId, "retry", "completed", agentName, result.confidence, `Confidence ${result.confidence}% below threshold ${ESCALATION_THRESHOLD}%, retrying...`);
      }
    }

    await pool.query(`UPDATE tickets SET ai_confidence = $1 WHERE id = $2`, [bestConfidence, ticketId]);

    if (bestConfidence < ESCALATION_THRESHOLD) {
      const reportText = `AI Escalation Handoff Report — TKT-${String(ticketId).padStart(4, "0")}\n` +
        `Category: ${category} | Agent: ${agentName} | Attempts: ${attempts}\n` +
        `Final Confidence: ${bestConfidence}% (threshold: ${ESCALATION_THRESHOLD}%)\n` +
        `Reason: Confidence below threshold after ${attempts} attempt(s).\n` +
        `AI Summary: ${bestSummary}\n` +
        `Recommended Next Actions: Manual investigation required. Review AI analysis output and verify with additional context.`;
      await logPipelineStep(ticketId, tenantId, "report_generated", "completed", agentName, bestConfidence, reportText);

      await pool.query(`UPDATE tickets SET ai_escalated = true, ai_pipeline_status = 'escalated' WHERE id = $1`, [ticketId]);
      await logPipelineStep(ticketId, tenantId, "escalated", "completed", agentName, bestConfidence,
        `Confidence ${bestConfidence}% below ${ESCALATION_THRESHOLD}% after ${attempts} attempts. Escalated to human analyst.`
      );

      const onShiftRes = await pool.query(`
        SELECT tm.name FROM team_members tm
        JOIN shift_rosters sr ON sr.team_member_id = tm.id
        WHERE tm.tenant_id = $1 AND tm.is_active = true AND tm.is_ai = false
        AND sr.shift_date = CURRENT_DATE
        ORDER BY RANDOM() LIMIT 1
      `, [tenantId]);
      const humanName = onShiftRes.rows[0]?.name || null;
      if (humanName) {
        await pool.query(`UPDATE tickets SET assigned_to = $1 WHERE id = $2`, [humanName, ticketId]);
      }

      try {
        await pool.query(
          `INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
           VALUES ($1, $2, $3, true, NOW())`,
          [ticketId, `ai-${agentName.toLowerCase()}`, reportText]
        );
      } catch (commentErr: any) {
        console.warn(`[AIPipeline] Failed to insert escalation comment for ticket #${ticketId}:`, commentErr.message);
      }

      return { success: true, escalated: true, confidence: bestConfidence, summary: `Escalated after ${attempts} attempts (confidence: ${bestConfidence}%)` };
    }

    const resolveReport = `AI Resolution Report — TKT-${String(ticketId).padStart(4, "0")}\n` +
      `Category: ${category} | Agent: ${agentName} | Attempts: ${attempts}\n` +
      `Final Confidence: ${bestConfidence}%\n` +
      `Resolution Summary: ${bestSummary}`;
    await logPipelineStep(ticketId, tenantId, "report_generated", "completed", agentName, bestConfidence, resolveReport);

    await pool.query(`UPDATE tickets SET ai_pipeline_status = 'completed', status = 'resolved', resolved_at = NOW() WHERE id = $1`, [ticketId]);
    await logPipelineStep(ticketId, tenantId, "resolved", "completed", agentName, bestConfidence, `Resolved with ${bestConfidence}% confidence`);

    try {
      await pool.query(
        `INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, created_at)
         VALUES ($1, $2, $3, false, NOW())`,
        [ticketId, `ai-${agentName.toLowerCase()}`, resolveReport]
      );
    } catch (commentErr: any) {
      console.warn(`[AIPipeline] Failed to insert resolution comment for ticket #${ticketId}:`, commentErr.message);
    }

    return { success: true, escalated: false, confidence: bestConfidence, summary: `Resolved by ${agentName} with ${bestConfidence}% confidence` };

  } catch (err: any) {
    console.error(`[AIPipeline] Ticket #${ticketId} pipeline error:`, err.message);
    await pool.query(`UPDATE tickets SET ai_pipeline_status = 'failed' WHERE id = $1`, [ticketId]);
    await logPipelineStep(ticketId, tenantId, "error", "failed", undefined, 0, undefined, err.message);
    return { success: false, escalated: false, confidence: 0, summary: err.message };
  }
}
