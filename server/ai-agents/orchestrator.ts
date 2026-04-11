import type { AgentInput, AgentOutput, AgentMessage, InvestigationPlan, InvestigationStep, AdaptiveRule, AgentPipelineResult, DecisionMetrics, AnalystFeedbackContext } from "./types";
import { executeContextAgent } from "./context-agent";
import { executeThreatIntelAgent } from "./threat-intel-agent";
import { executeBehaviorAgent } from "./behavior-agent";
import { executeCorrelationAgent } from "./correlation-agent";
import { executeRiskScoringAgent } from "./risk-scoring-agent";
import { executeRemediationAgent } from "./remediation-agent";
import { executeReportAgent } from "./report-agent";
import { pool } from "../db";

const AGENT_REGISTRY: Record<string, (input: AgentInput) => Promise<AgentOutput>> = {
  "Context Agent": executeContextAgent,
  "Threat Intel Agent": executeThreatIntelAgent,
  "Behavior Agent": executeBehaviorAgent,
  "Correlation Agent": executeCorrelationAgent,
  "Risk Scoring Agent": executeRiskScoringAgent,
  "Remediation Agent": executeRemediationAgent,
  "Report Agent": executeReportAgent,
};

export function planInvestigation(incident: any, attackType: string, severity: string, feedbackHistory?: AnalystFeedbackContext[]): InvestigationPlan {
  const steps: InvestigationStep[] = [];
  const parallelGroups: string[][] = [];
  const adaptiveRules: AdaptiveRule[] = [];

  steps.push({
    agent: "Context Agent",
    priority: "critical",
    reason: "Must gather asset context, user profiles, entity history, and exposure data before any analysis",
    estimatedDuration: 2000,
    skippable: false,
  });

  const isEmailThreat = attackType === "phishing" || attackType === "social_engineering" || (incident.source || "").toLowerCase().includes("email");
  const isEndpointThreat = attackType === "malware" || attackType === "ransomware";
  const isNetworkThreat = attackType === "network_intrusion" || attackType === "brute_force";
  const isWebThreat = attackType === "web_app_attack" || attackType === "vuln_exploit";

  steps.push({
    agent: "Threat Intel Agent",
    priority: isEmailThreat || isEndpointThreat ? "critical" : "high",
    reason: isEmailThreat ? "Email threats require IOC enrichment for sender/domain reputation" :
            isEndpointThreat ? "Malware requires hash/domain/IP reputation analysis" :
            "IOC enrichment provides threat context for all incident types",
    estimatedDuration: 3000,
    skippable: false,
  });

  steps.push({
    agent: "Behavior Agent",
    priority: isNetworkThreat || isEndpointThreat ? "critical" : "high",
    reason: isNetworkThreat ? "Network threats require behavioral baseline comparison for anomaly detection" :
            isEndpointThreat ? "Endpoint threats need UEBA analysis for lateral movement detection" :
            "Behavioral analysis provides anomaly context for all incidents",
    estimatedDuration: 4000,
    skippable: severity === "low" || severity === "info",
  });

  parallelGroups.push(["Threat Intel Agent", "Behavior Agent"]);

  steps.push({
    agent: "Correlation Agent",
    priority: severity === "critical" || severity === "high" ? "critical" : "medium",
    reason: "Cross-source correlation and timeline reconstruction requires context + threat intel data",
    estimatedDuration: 3000,
    skippable: false,
  });

  steps.push({
    agent: "Risk Scoring Agent",
    priority: "critical",
    reason: "Multi-factor risk scoring uses all previous agent outputs for accurate scoring",
    estimatedDuration: 500,
    skippable: false,
  });

  steps.push({
    agent: "Remediation Agent",
    priority: severity === "critical" ? "critical" : "high",
    reason: "Remediation recommendations depend on risk score and identified threats",
    estimatedDuration: 500,
    skippable: false,
  });

  steps.push({
    agent: "Report Agent",
    priority: "high",
    reason: "Final report synthesizes all agent findings into executive and technical reports with AI",
    estimatedDuration: 8000,
    skippable: false,
  });

  adaptiveRules.push({
    condition: "Context Agent finds critical asset (assetCriticality === 'critical')",
    action: "Escalate Behavior Agent priority to critical and expand analysis scope",
    targetAgent: "Behavior Agent",
  });

  adaptiveRules.push({
    condition: "Threat Intel Agent finds known campaign (knownCampaign !== null)",
    action: "Expand Correlation Agent to search for campaign-related indicators across tenant",
    targetAgent: "Correlation Agent",
  });

  adaptiveRules.push({
    condition: "Behavior Agent detects lateral movement (lateralMovementIndicators > 3)",
    action: "Escalate risk scoring and add immediate containment recommendations",
    targetAgent: "Risk Scoring Agent",
  });

  if (feedbackHistory && feedbackHistory.length > 0) {
    const fpOverrides = feedbackHistory.filter(f => f.correctedVerdict === "false_positive").length;
    const totalFeedback = feedbackHistory.length;
    if (fpOverrides / totalFeedback > 0.7) {
      adaptiveRules.push({
        condition: `Historical feedback: ${fpOverrides}/${totalFeedback} similar incidents marked as FP by analysts`,
        action: "Increase FP likelihood weight in risk scoring — analysts frequently override this type",
        targetAgent: "Risk Scoring Agent",
      });
    }
  }

  const estimatedDuration = steps.reduce((sum, s) => sum + s.estimatedDuration, 0) - 
    (parallelGroups.length > 0 ? Math.min(...parallelGroups[0].map(name => steps.find(s => s.agent === name)?.estimatedDuration || 0)) : 0);

  return {
    incidentType: incident.incident_type || "unknown",
    attackType,
    severity,
    steps,
    parallelGroups,
    adaptiveRules,
    estimatedDuration,
  };
}

export async function executeAgentPipeline(
  tenantId: number,
  incidentId: number,
  incident: any,
  relatedEvents: any[],
  relatedIncidents: any[],
  entityHistory: Record<string, any[]>,
  assetInfo: any[],
  tenantName: string,
  attackType: string,
  feedbackHistory?: AnalystFeedbackContext[],
  onStepUpdate?: (step: any) => Promise<void>,
): Promise<AgentPipelineResult> {
  const pipelineStart = Date.now();
  const agentMessages: AgentMessage[] = [];
  const agentOutputs: Record<string, AgentOutput> = {};

  const plan = planInvestigation(incident, attackType, incident.severity || "medium", feedbackHistory);

  const baseInput: AgentInput = {
    tenantId,
    incidentId,
    incident,
    relatedEvents,
    relatedIncidents,
    entityHistory,
    assetInfo,
    tenantName,
    previousAgentOutputs: agentOutputs,
    analystFeedback: feedbackHistory,
  };

  async function runAgent(agentName: string): Promise<void> {
    const step = plan.steps.find(s => s.agent === agentName);
    if (step?.skippable && (incident.severity === "low" || incident.severity === "info")) {
      agentOutputs[agentName] = {
        agentName,
        status: "skipped",
        duration: 0,
        confidence: 0,
        reasoning: `Skipped for ${incident.severity} severity incident`,
        evidenceRefs: [],
        data: {},
      };
      return;
    }

    const executor = AGENT_REGISTRY[agentName];
    if (!executor) {
      agentOutputs[agentName] = {
        agentName,
        status: "failed",
        duration: 0,
        confidence: 0,
        reasoning: `Agent "${agentName}" not found in registry`,
        evidenceRefs: [],
        data: {},
      };
      return;
    }

    const agentStart = new Date().toISOString();
    try {
      const input: AgentInput = { ...baseInput, previousAgentOutputs: { ...agentOutputs } };
      const AGENT_TIMEOUT = 30000;
      const output = await Promise.race([
        executor(input),
        new Promise<AgentOutput>((_, reject) => setTimeout(() => reject(new Error(`Agent timed out after ${AGENT_TIMEOUT / 1000}s`)), AGENT_TIMEOUT)),
      ]);
      agentOutputs[agentName] = output;

      agentMessages.push({
        agentName,
        input: { tenantId, incidentId },
        output,
        startedAt: agentStart,
        completedAt: new Date().toISOString(),
      });

      if (onStepUpdate) {
        await onStepUpdate({
          step: `agent_${agentName.toLowerCase().replace(/\s+/g, "_")}`,
          action: `${agentName}: ${output.status}`,
          result: output.reasoning.substring(0, 200),
          timestamp: new Date().toISOString(),
          agentName,
          confidence: output.confidence,
          duration: output.duration,
        });
      }
    } catch (error: any) {
      agentOutputs[agentName] = {
        agentName,
        status: "failed",
        duration: Date.now() - new Date(agentStart).getTime(),
        confidence: 0,
        reasoning: `Agent execution error: ${error.message}`,
        evidenceRefs: [],
        data: {},
      };

      agentMessages.push({
        agentName,
        input: { tenantId, incidentId },
        output: agentOutputs[agentName],
        startedAt: agentStart,
        completedAt: new Date().toISOString(),
      });
    }
  }

  await runAgent("Context Agent");

  await Promise.all([
    runAgent("Threat Intel Agent"),
    runAgent("Behavior Agent"),
  ]);

  await runAgent("Correlation Agent");

  await runAgent("Risk Scoring Agent");

  await runAgent("Remediation Agent");

  await runAgent("Report Agent");

  const riskData = agentOutputs["Risk Scoring Agent"]?.data?.decisionMetrics;
  const reportData = agentOutputs["Report Agent"]?.data;

  const decisionMetrics: DecisionMetrics = riskData || {
    riskScore: 50,
    confidenceScore: 50,
    falsePositiveLikelihood: 50,
    blastRadius: { affectedSystems: 1, affectedUsers: 1, dataAtRisk: "Unknown", businessImpact: "medium" as const },
    slaRecommendation: { responseTime: "4 hours", resolutionTime: "24 hours", escalationLevel: "Analyst" },
    automationEligibility: { eligible: false, reason: "Default — requires review", suggestedActions: [], requiresApproval: true },
    riskBreakdown: {
      severityFactor: { weight: 0.30, score: 50, raw: "medium" },
      assetCriticalityFactor: { weight: 0.25, score: 50, raw: "medium" },
      threatConfidenceFactor: { weight: 0.25, score: 50, raw: "unknown" },
      exposureFactor: { weight: 0.20, score: 50, raw: "medium" },
      mitigationStrength: { weight: 0.10, score: 0, raw: "none" },
    },
  };

  if (reportData?.verdict) {
    decisionMetrics.riskScore = riskData?.riskScore ?? decisionMetrics.riskScore;
    decisionMetrics.confidenceScore = riskData?.confidenceScore ?? decisionMetrics.confidenceScore;
  }

  const parallelExecutions = plan.parallelGroups.length;

  return {
    plan,
    agentMessages,
    decisionMetrics,
    totalDuration: Date.now() - pipelineStart,
    agentCount: agentMessages.length,
    parallelExecutions,
  };
}
