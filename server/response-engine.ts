import { createAIClient, getDefaultModel } from "./ai-provider";
import { pool } from "./db";

export interface ResponseAction {
  stepOrder: number;
  actionType: "host_isolation" | "ip_block" | "account_disable" | "ticket_escalation" | "notification" | "evidence_snapshot";
  target: string;
  targetType: "host" | "ip" | "account" | "ticket" | "email" | "log";
  riskLevel: "low" | "medium" | "high";
  rationale: string;
  expectedImpact: string;
  estimatedSeconds: number;
  isReversible: boolean;
}

export interface ResponsePlan {
  actions: ResponseAction[];
  executiveSummary: string;
  recommendedMode: "manual" | "semi_auto" | "full_auto";
}

export async function buildResponsePlan(incidentId: number): Promise<ResponsePlan> {
  // Fetch incident context
  const incidentRes = await pool.query(
    `SELECT i.*, t.name as tenant_name
     FROM incidents i
     JOIN tenants t ON t.id = i.tenant_id
     WHERE i.id = $1 LIMIT 1`,
    [incidentId]
  );
  if (!incidentRes.rows.length) throw new Error("Incident not found");
  const inc = incidentRes.rows[0];

  // Fetch related assets (use correct column names: hostname, endpoint_type)
  const assetRes = await pool.query(
    `SELECT hostname, ip_address, endpoint_type, criticality FROM assets
     WHERE tenant_id = $1 AND (hostname ILIKE $2 OR ip_address = $3) LIMIT 5`,
    [inc.tenant_id, `%${inc.affected_assets || ""}%`, inc.source_ip || ""]
  );

  // Fetch playbook matches
  const playbookRes = await pool.query(
    `SELECT name, trigger_conditions FROM playbooks
     WHERE tenant_id = $1 AND is_active = true LIMIT 5`,
    [inc.tenant_id]
  );

  // Fetch available security integrations (use correct column names: platform_key, platform_name, is_enabled)
  const integrationRes = await pool.query(
    `SELECT platform_key, platform_name, status FROM security_integrations
     WHERE tenant_id = $1 AND is_enabled = true LIMIT 10`,
    [inc.tenant_id]
  );

  const iocSummary = (() => {
    try {
      const raw = inc.ioc_data;
      if (!raw) return "none";
      const arr = Array.isArray(raw) ? raw : (raw.indicators || []);
      return arr.slice(0, 5).map((i: any) => `${i.type || "ioc"}:${i.value || i.indicator_value}`).join(", ") || "none";
    } catch { return "none"; }
  })();

  const availableIntegrations = integrationRes.rows.map(r => `${r.platform_key} (${r.platform_name})`).join(", ") || "none";
  const affectedAssets = assetRes.rows.map(r => `${r.hostname} (${r.endpoint_type || "unknown type"}, ${r.criticality || "normal"} criticality, IP: ${r.ip_address || "unknown"})`).join("; ") || inc.affected_assets || "unknown";

  const prompt = `You are an autonomous SOC response coordinator. A True Positive security incident requires an immediate, ordered response plan.

Incident details:
- Title: ${inc.title}
- Severity: ${inc.severity}
- Type: ${inc.incident_type || "unknown"}
- MITRE Tactic: ${inc.mitre_tactic || "unknown"} / Technique: ${inc.mitre_technique_id || "unknown"}
- Kill Chain Phase: ${inc.kill_chain_phase || "unknown"}
- Attacker: ${inc.attacker || "unknown"} → Target: ${inc.target || "unknown"}
- Source IP: ${inc.source_ip || "unknown"} → Destination IP: ${inc.destination_ip || "unknown"}
- IOCs: ${iocSummary}
- Affected assets: ${affectedAssets}
- Available integrations: ${availableIntegrations}
- Confidence: ${inc.confidence_score || 50}%

Generate a prioritized response plan. Action types allowed: host_isolation, ip_block, account_disable, ticket_escalation, notification, evidence_snapshot.
Target types: host, ip, account, ticket, email, log.

Return ONLY valid JSON:
{
  "executiveSummary": "2-3 sentence summary of the threat and response approach",
  "recommendedMode": "semi_auto",
  "actions": [
    {
      "stepOrder": 1,
      "actionType": "evidence_snapshot",
      "target": "incident-${incidentId}-logs",
      "targetType": "log",
      "riskLevel": "low",
      "rationale": "Preserve forensic evidence before any containment action",
      "expectedImpact": "Immutable log snapshot created for forensic analysis",
      "estimatedSeconds": 10,
      "isReversible": false
    }
  ]
}

Rules:
- Always start with evidence_snapshot (low risk, non-reversible)
- Host isolation is high risk and reversible
- IP blocks are medium risk and reversible
- Account disable is medium risk and reversible
- ticket_escalation is low risk and non-reversible
- notification is low risk and non-reversible
- Include 4-7 actions total, ordered by urgency
- Use actual values from incident for targets (IPs, hostnames, usernames)
- recommendedMode: use "full_auto" only if all actions are low/medium risk; "semi_auto" if any high risk; "manual" if severity is critical`;

  const client = createAIClient();
  const model = getDefaultModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 1500,
    temperature: 0.2,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

  return {
    executiveSummary: result.executiveSummary || "AI response plan generated.",
    recommendedMode: result.recommendedMode || "semi_auto",
    actions: (result.actions || []).map((a: any, i: number) => ({
      stepOrder: a.stepOrder ?? i + 1,
      actionType: a.actionType || "notification",
      target: a.target || "unknown",
      targetType: a.targetType || "host",
      riskLevel: a.riskLevel || "medium",
      rationale: a.rationale || "",
      expectedImpact: a.expectedImpact || "",
      estimatedSeconds: a.estimatedSeconds ?? 30,
      isReversible: a.isReversible ?? true,
    })),
  };
}
