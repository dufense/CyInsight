import { pool } from "../db";
import type { AgentInput, AgentOutput } from "./types";

export async function executeContextAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident, relatedEvents, relatedIncidents, entityHistory, assetInfo } = input;

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

    let assetCriticality = "medium";
    let assetContext: any[] = [];
    try {
      const entityArr = Array.from(entities);
      if (entityArr.length > 0) {
        const assetResult = await pool.query(
          `SELECT hostname, ip_address, operating_system, last_logged_in_user, 
                  endpoint_alias, status, enrichment_data, risk_score, incident_count
           FROM assets WHERE tenant_id = $1 
           AND (hostname ILIKE ANY($2) OR ip_address = ANY($3) OR endpoint_alias ILIKE ANY($2))
           LIMIT 10`,
          [input.tenantId, entityArr.map(e => `%${e}%`), entityArr]
        );
        assetContext = assetResult.rows;
      }

      const maxRisk = Math.max(...assetContext.map(a => a.risk_score || 0), 0);
      const hasServer = assetContext.some(a => (a.operating_system || "").toLowerCase().includes("server"));
      if (maxRisk > 80 || hasServer) assetCriticality = "critical";
      else if (maxRisk > 60) assetCriticality = "high";
      else if (maxRisk > 30) assetCriticality = "medium";
      else assetCriticality = "low";

      if (assetContext.length > 0) evidenceRefs.push(`${assetContext.length} matching assets found`);
    } catch (err: any) {
      console.error(`[Context Agent] Asset query failed: ${err.message}`);
    }

    let userContext: any[] = [];
    try {
      const entityArr = Array.from(entities);
      if (entityArr.length > 0) {
        const userResult = await pool.query(
          `SELECT user_name, email, department, risk_level, risk_score, 
                  total_requests, denied_requests, user_status
           FROM user_assets WHERE tenant_id = $1 
           AND (user_name ILIKE ANY($2) OR email ILIKE ANY($2))
           LIMIT 10`,
          [input.tenantId, entityArr.map(e => `%${e}%`)]
        );
        userContext = userResult.rows;
      }
      if (userContext.length > 0) evidenceRefs.push(`${userContext.length} user profiles matched`);
    } catch (err: any) {
      console.error(`[Context Agent] User query failed: ${err.message}`);
    }

    let pastIncidentCount = 0;
    let pastIncidentSeverities: Record<string, number> = {};
    for (const ri of relatedIncidents) {
      pastIncidentCount++;
      pastIncidentSeverities[ri.severity] = (pastIncidentSeverities[ri.severity] || 0) + 1;
    }
    if (pastIncidentCount > 0) evidenceRefs.push(`${pastIncidentCount} related incidents in last 30 days`);

    const entityProfiles: Record<string, any> = {};
    for (const [entity, history] of Object.entries(entityHistory)) {
      const totalEvents = history.reduce((sum: number, h: any) => sum + parseInt(h.count || "0"), 0);
      const eventTypes = history.map((h: any) => h.event_type);
      const severities = history.map((h: any) => h.severity);
      entityProfiles[entity] = {
        totalEvents,
        eventTypes: Array.from(new Set(eventTypes)),
        severities: Array.from(new Set(severities)),
        firstSeen: history[0]?.first_seen,
        lastSeen: history[0]?.last_seen,
      };
    }

    let riskIntelligence: {
      entityRiskScores: { entity: string; score: number; level: string; type: string }[];
      cloudAppRisks: { appName: string; confidenceIndex: number; classification: string; isShadowIT: boolean; isAIService: boolean }[];
      domainAuthStatus: { domain: string; spfPass: boolean; dkimPass: boolean; dmarcPass: boolean }[];
    } = { entityRiskScores: [], cloudAppRisks: [], domainAuthStatus: [] };

    try {
      const entityArr = Array.from(entities).slice(0, 10);
      if (entityArr.length > 0) {
        const riskResult = await pool.query(
          `SELECT entity_identifier, overall_score, risk_level, entity_type 
           FROM risk_scores WHERE tenant_id = $1 
           AND entity_identifier ILIKE ANY($2)
           ORDER BY calculated_at DESC LIMIT 20`,
          [input.tenantId, entityArr.map(e => `%${e}%`)]
        );
        const seen = new Set<string>();
        for (const r of riskResult.rows) {
          if (!seen.has(r.entity_identifier)) {
            seen.add(r.entity_identifier);
            riskIntelligence.entityRiskScores.push({
              entity: r.entity_identifier,
              score: Math.round(r.overall_score),
              level: r.risk_level,
              type: r.entity_type,
            });
          }
        }
        if (riskIntelligence.entityRiskScores.length > 0) {
          evidenceRefs.push(`${riskIntelligence.entityRiskScores.length} entity risk scores found`);
        }
      }
    } catch (err: any) {
      console.error(`[Context Agent] Risk scores query failed: ${err.message}`);
    }

    try {
      const source = (incident.source || "").toLowerCase();
      const isCloudRelated = /casb|sse|cloud|saas|shadow.?it|mcas|defender.*cloud|prisma|netskope|zscaler/i.test(
        `${source} ${incident.description || ""} ${incident.title || ""}`
      );
      if (isCloudRelated) {
        const cloudResult = await pool.query(
          `SELECT app_name, confidence_index, risk_classification, is_shadow_it, is_ai_service, sanction_status
           FROM cloud_app_risk_scores WHERE tenant_id = $1
           ORDER BY confidence_index DESC LIMIT 10`,
          [input.tenantId]
        );
        riskIntelligence.cloudAppRisks = cloudResult.rows.map((r: any) => ({
          appName: r.app_name,
          confidenceIndex: Math.round(r.confidence_index),
          classification: r.risk_classification,
          isShadowIT: r.is_shadow_it || false,
          isAIService: r.is_ai_service || false,
        }));
        if (riskIntelligence.cloudAppRisks.length > 0) {
          evidenceRefs.push(`${riskIntelligence.cloudAppRisks.length} cloud app risk profiles found`);
        }
      }
    } catch (err: any) {
      console.error(`[Context Agent] Cloud app risk query failed: ${err.message}`);
    }

    try {
      const domains = Array.from(entities).filter(e => e.includes(".") && !e.includes("@") && !/^\d+\.\d+\.\d+\.\d+$/.test(e)).slice(0, 5);
      const emailDomains = Array.from(entities).filter(e => e.includes("@")).map(e => e.split("@")[1]).filter(Boolean);
      const allDomains = Array.from(new Set([...domains, ...emailDomains])).slice(0, 5);
      for (const domain of allDomains) {
        const authResult = await pool.query(
          `SELECT 
            COUNT(*) FILTER (WHERE raw_payload->>'spfResult' = 'pass') as spf_pass,
            COUNT(*) FILTER (WHERE raw_payload->>'spfResult' IS NOT NULL AND raw_payload->>'spfResult' != 'pass') as spf_fail,
            COUNT(*) FILTER (WHERE raw_payload->>'dkimResult' = 'pass') as dkim_pass,
            COUNT(*) FILTER (WHERE raw_payload->>'dkimResult' IS NOT NULL AND raw_payload->>'dkimResult' != 'pass') as dkim_fail,
            COUNT(*) FILTER (WHERE raw_payload->>'dmarcResult' = 'pass') as dmarc_pass,
            COUNT(*) FILTER (WHERE raw_payload->>'dmarcResult' IS NOT NULL AND raw_payload->>'dmarcResult' != 'pass') as dmarc_fail
          FROM security_events 
          WHERE tenant_id = $1 AND (raw_payload->>'senderDomain' ILIKE $2 OR raw_payload->>'sender' ILIKE $3)`,
          [input.tenantId, domain, `%@${domain}`]
        );
        const r = authResult.rows[0];
        if (r && (parseInt(r.spf_pass) + parseInt(r.spf_fail) > 0 || parseInt(r.dkim_pass) + parseInt(r.dkim_fail) > 0)) {
          riskIntelligence.domainAuthStatus.push({
            domain,
            spfPass: parseInt(r.spf_pass) > parseInt(r.spf_fail),
            dkimPass: parseInt(r.dkim_pass) > parseInt(r.dkim_fail),
            dmarcPass: parseInt(r.dmarc_pass) > parseInt(r.dmarc_fail),
          });
        }
      }
      if (riskIntelligence.domainAuthStatus.length > 0) {
        evidenceRefs.push(`Email auth data for ${riskIntelligence.domainAuthStatus.length} domains`);
      }
    } catch (err: any) {
      console.error(`[Context Agent] Domain auth query failed: ${err.message}`);
    }

    let exposureLevel = "medium";
    const hasExternalIP = Array.from(entities).some(e => {
      const parts = e.split(".");
      if (parts.length !== 4) return false;
      const first = parseInt(parts[0]);
      return !(first === 10 || first === 127 || (first === 172 && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) || (first === 192 && parseInt(parts[1]) === 168));
    });
    if (hasExternalIP) exposureLevel = "high";
    if (incident.severity === "critical" && hasExternalIP) exposureLevel = "critical";

    evidenceRefs.push(`${relatedEvents.length} related security events`);
    evidenceRefs.push(`${Object.keys(entityHistory).length} entity profiles analyzed`);

    const confidence = Math.min(100, 
      (assetContext.length > 0 ? 25 : 10) +
      (userContext.length > 0 ? 20 : 5) +
      (relatedEvents.length > 10 ? 25 : relatedEvents.length > 0 ? 15 : 5) +
      (pastIncidentCount > 0 ? 15 : 5) +
      (Object.keys(entityHistory).length > 0 ? 15 : 5)
    );

    return {
      agentName: "Context Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence,
      reasoning: `Gathered context for incident "${incident.title}": ${assetContext.length} assets (criticality: ${assetCriticality}), ${userContext.length} user profiles, ${relatedEvents.length} related events, ${pastIncidentCount} related incidents, ${Object.keys(entityHistory).length} entity histories. Exposure level: ${exposureLevel}.`,
      evidenceRefs,
      data: {
        entities: Array.from(entities),
        assetContext,
        assetCriticality,
        userContext,
        pastIncidentCount,
        pastIncidentSeverities,
        entityProfiles,
        exposureLevel,
        iocData,
        riskIntelligence,
      },
    };
  } catch (error: any) {
    return {
      agentName: "Context Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Context gathering failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}
