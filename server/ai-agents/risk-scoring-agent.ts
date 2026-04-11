import type { AgentInput, AgentOutput, DecisionMetrics, BlastRadiusEstimate, RiskBreakdown } from "./types";

// Operational / maintenance titles that indicate a false positive — no real threat
const FP_TITLE_PATTERNS_RS = [
  /no scans in group/i,
  /scheduled task completed/i,
  /backup job (completed|failed|success)/i,
  /scan completed successfully/i,
  /update (installed|completed|available)/i,
  /license expir/i,
  /disk space (low|warning|full)/i,
  /certificate (expir|renew)/i,
  /service (restart|started|stopped) successfully/i,
  /patch (applied|installed|completed)/i,
  /health check (passed|ok|success)/i,
  /maintenance (window|completed|scheduled)/i,
  /reboot (completed|required|pending)/i,
  /agent (offline|disconnected|reconnected|unresponsive)/i,
  /heartbeat (lost|miss|fail|timeout)/i,
  /keepalive/i,
  /no (threats|issues|findings) (found|detected)/i,
  /test (alert|event|notification)/i,
  /connectivity (restored|lost|check)/i,
  /signature (update|download)/i,
  /quarantine (success|complet)/i,
];

function isFPTitle(title: string): boolean {
  return FP_TITLE_PATTERNS_RS.some(p => p.test(title || ""));
}

export async function executeRiskScoringAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const evidenceRefs: string[] = [];

  try {
    const { incident } = input;
    const contextData = input.previousAgentOutputs?.["Context Agent"]?.data || {};
    const threatIntelData = input.previousAgentOutputs?.["Threat Intel Agent"]?.data || {};
    const behaviorData = input.previousAgentOutputs?.["Behavior Agent"]?.data || {};
    const correlationData = input.previousAgentOutputs?.["Correlation Agent"]?.data || {};

    // ── FP TITLE OVERRIDE ─────────────────────────────────────────────────────
    // If the incident title matches a known operational/monitoring pattern,
    // override risk/FP scores BEFORE running the normal formula.
    // This prevents severity-inflation from raising risk on benign alerts.
    if (isFPTitle(incident.title || "")) {
      evidenceRefs.push(`FP title pattern matched: "${incident.title}" — overriding risk score to 0`);
      const blastRadius = { affectedSystems: 0, affectedUsers: 0, dataAtRisk: "None", businessImpact: "none" as const };
      const decisionMetrics: DecisionMetrics = {
        riskScore: 0,
        confidenceScore: 95,
        falsePositiveLikelihood: 98,
        blastRadius,
        slaRecommendation: { responseTime: "N/A", resolutionTime: "N/A", escalationLevel: "Auto-close" },
        automationEligibility: { eligible: true, reason: "Operational alert — auto-close as false positive", suggestedActions: ["Auto-close as false positive", "Add to FP suppression list"], requiresApproval: false },
        riskBreakdown: {
          severityFactor: { weight: 0, score: 0, raw: "overridden — FP title pattern" },
          assetCriticalityFactor: { weight: 0, score: 0, raw: "N/A" },
          threatConfidenceFactor: { weight: 0, score: 0, raw: "No threat evidence" },
          exposureFactor: { weight: 0, score: 0, raw: "N/A" },
          mitigationStrength: { weight: 0, score: 0, raw: "N/A" },
        },
      };
      return {
        agentName: "Risk Scoring Agent",
        status: "completed",
        duration: Date.now() - startTime,
        confidence: 95,
        reasoning: `FP title override applied: "${incident.title}" matches operational alert pattern. Risk score forced to 0, FP likelihood 98%. No threat evidence warrants investigation.`,
        evidenceRefs,
        data: { decisionMetrics },
      };
    }
    // ── END FP TITLE OVERRIDE ──────────────────────────────────────────────────

    const severityScores: Record<string, number> = { critical: 95, high: 75, medium: 45, low: 20, info: 5 };
    const severityScore = severityScores[incident.severity] || 50;

    const criticalityMap: Record<string, number> = { critical: 95, high: 75, medium: 50, low: 25 };
    const assetCriticality = contextData.assetCriticality || "medium";
    const assetCriticalityScore = criticalityMap[assetCriticality] || 50;

    const maliciousIOCs = threatIntelData.maliciousCount || 0;
    const crossSourceIOCs = threatIntelData.crossSourceCount || 0;
    const knownCampaign = threatIntelData.knownCampaign;
    let threatConfidenceScore = 30;
    if (maliciousIOCs > 0) threatConfidenceScore += maliciousIOCs * 10;
    if (crossSourceIOCs > 0) threatConfidenceScore += crossSourceIOCs * 15;
    if (knownCampaign) threatConfidenceScore += 25;
    threatConfidenceScore = Math.min(100, threatConfidenceScore);

    const exposureMap: Record<string, number> = { critical: 95, high: 75, medium: 50, low: 25 };
    const exposureLevel = contextData.exposureLevel || "medium";
    const exposureScore = exposureMap[exposureLevel] || 50;

    let mitigationScore = 0;
    const assetContext = contextData.assetContext || [];
    if (assetContext.length > 0) {
      const hasEDR = assetContext.some((a: any) => (a.enrichment_data?.tools || []).includes("EDR"));
      const hasAV = assetContext.some((a: any) => (a.enrichment_data?.tools || []).includes("AV"));
      if (hasEDR) mitigationScore += 20;
      if (hasAV) mitigationScore += 15;
    }
    if (incident.status === "contained") mitigationScore += 30;

    const riskBreakdown: RiskBreakdown = {
      severityFactor: { weight: 0.30, score: severityScore, raw: incident.severity || "medium" },
      assetCriticalityFactor: { weight: 0.25, score: assetCriticalityScore, raw: assetCriticality },
      threatConfidenceFactor: { weight: 0.25, score: threatConfidenceScore, raw: `${maliciousIOCs} malicious IOCs, ${crossSourceIOCs} cross-source` },
      exposureFactor: { weight: 0.20, score: exposureScore, raw: exposureLevel },
      mitigationStrength: { weight: 0.10, score: mitigationScore, raw: `${mitigationScore}/65 mitigation controls` },
    };

    const rawRisk = (
      severityScore * 0.30 +
      assetCriticalityScore * 0.25 +
      threatConfidenceScore * 0.25 +
      exposureScore * 0.20
    ) - (mitigationScore * 0.10);

    const riskScore = Math.min(100, Math.max(0, Math.round(rawRisk)));
    evidenceRefs.push(`Risk formula: (${severityScore}×0.30 + ${assetCriticalityScore}×0.25 + ${threatConfidenceScore}×0.25 + ${exposureScore}×0.20) - ${mitigationScore}×0.10 = ${riskScore}`);

    const anomalies = behaviorData.anomalies || [];
    const maxDeviation = behaviorData.maxDeviation || 0;
    const attackStages = correlationData.attackStages || [];
    const isMultiStage = correlationData.isMultiStage || false;

    let confidenceScore = 50;
    if (maliciousIOCs > 0) confidenceScore += 15;
    if (maxDeviation > 60) confidenceScore += 10;
    if (attackStages.length >= 2) confidenceScore += 10;
    if (isMultiStage) confidenceScore += 10;
    if (knownCampaign) confidenceScore += 10;
    if (crossSourceIOCs > 0) confidenceScore += 10;
    if (contextData.pastIncidentCount > 3) confidenceScore += 5;
    confidenceScore = Math.min(100, confidenceScore);

    let fpLikelihood = 50;
    if (incident.severity === "info") fpLikelihood += 30;
    if (maliciousIOCs === 0 && (threatIntelData.suspiciousCount || 0) === 0) fpLikelihood += 20;
    if (anomalies.length === 0) fpLikelihood += 10;
    if (attackStages.length === 0) fpLikelihood += 10;
    if (maliciousIOCs > 0) fpLikelihood -= 25;
    if (isMultiStage) fpLikelihood -= 20;
    if (maxDeviation > 60) fpLikelihood -= 15;
    if (knownCampaign) fpLikelihood -= 20;
    fpLikelihood = Math.min(100, Math.max(0, fpLikelihood));

    const affectedEntities = correlationData.relatedIncidentCorrelation || [];
    const affectedAssets = (incident.affected_assets || "").split(",").filter(Boolean).length;
    const blastRadius: BlastRadiusEstimate = {
      affectedSystems: Math.max(affectedAssets, assetContext.length, 1),
      affectedUsers: (contextData.userContext || []).length || 1,
      dataAtRisk: behaviorData.dataExfiltrationRisk ? "Potential data exfiltration detected" : "No data exfiltration indicators",
      businessImpact: riskScore > 80 ? "critical" : riskScore > 60 ? "high" : riskScore > 40 ? "medium" : riskScore > 20 ? "low" : "none",
    };

    const slaRecommendation = {
      responseTime: riskScore > 80 ? "15 minutes" : riskScore > 60 ? "1 hour" : riskScore > 40 ? "4 hours" : "24 hours",
      resolutionTime: riskScore > 80 ? "4 hours" : riskScore > 60 ? "24 hours" : riskScore > 40 ? "72 hours" : "1 week",
      escalationLevel: riskScore > 80 ? "CISO + SOC Lead" : riskScore > 60 ? "SOC Lead" : riskScore > 40 ? "Senior Analyst" : "Tier 1 Analyst",
    };

    const automationEligibility = {
      eligible: fpLikelihood > 80 && riskScore < 20,
      reason: fpLikelihood > 80 && riskScore < 20
        ? "High FP likelihood with low risk — safe for auto-closure"
        : riskScore > 60
          ? "Risk score too high for automated response"
          : "Requires human analyst review",
      suggestedActions: fpLikelihood > 80 ? ["Auto-close as false positive", "Add to FP suppression list"] :
        riskScore > 80 ? ["Isolate affected hosts", "Disable compromised accounts", "Block malicious IPs"] :
        riskScore > 60 ? ["Monitor closely", "Prepare containment plan"] :
        ["Continue monitoring", "Review in next shift"],
      requiresApproval: riskScore > 40 || fpLikelihood < 70,
    };

    const decisionMetrics: DecisionMetrics = {
      riskScore,
      confidenceScore,
      falsePositiveLikelihood: fpLikelihood,
      blastRadius,
      slaRecommendation,
      automationEligibility,
      riskBreakdown,
    };

    evidenceRefs.push(`Confidence: ${confidenceScore}%, FP likelihood: ${fpLikelihood}%, Blast radius: ${blastRadius.affectedSystems} systems`);

    return {
      agentName: "Risk Scoring Agent",
      status: "completed",
      duration: Date.now() - startTime,
      confidence: confidenceScore,
      reasoning: `Computed risk score ${riskScore}/100 using multi-factor formula. Severity (${incident.severity}): ${severityScore}, Asset criticality (${assetCriticality}): ${assetCriticalityScore}, Threat confidence: ${threatConfidenceScore}, Exposure (${exposureLevel}): ${exposureScore}, Mitigation: -${mitigationScore}. FP likelihood: ${fpLikelihood}%. Blast radius: ${blastRadius.affectedSystems} systems, ${blastRadius.affectedUsers} users. Business impact: ${blastRadius.businessImpact}. SLA: respond within ${slaRecommendation.responseTime}. Automation ${automationEligibility.eligible ? "eligible" : "not eligible"}: ${automationEligibility.reason}.`,
      evidenceRefs,
      data: { decisionMetrics },
    };
  } catch (error: any) {
    return {
      agentName: "Risk Scoring Agent",
      status: "failed",
      duration: Date.now() - startTime,
      confidence: 0,
      reasoning: `Risk scoring failed: ${error.message}`,
      evidenceRefs,
      data: {},
    };
  }
}
