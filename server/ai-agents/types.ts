export interface AgentInput {
  tenantId: number;
  incidentId: number;
  incident: any;
  relatedEvents: any[];
  relatedIncidents: any[];
  entityHistory: Record<string, any[]>;
  assetInfo: any[];
  tenantName: string;
  previousAgentOutputs?: Record<string, AgentOutput>;
  analystFeedback?: AnalystFeedbackContext[];
}

export interface AgentOutput {
  agentName: string;
  status: "completed" | "skipped" | "failed";
  duration: number;
  confidence: number;
  reasoning: string;
  evidenceRefs: string[];
  data: any;
}

export interface AgentMessage {
  agentName: string;
  input: Partial<AgentInput>;
  output: AgentOutput;
  startedAt: string;
  completedAt: string;
}

export interface InvestigationPlan {
  incidentType: string;
  attackType: string;
  severity: string;
  steps: InvestigationStep[];
  parallelGroups: string[][];
  adaptiveRules: AdaptiveRule[];
  estimatedDuration: number;
}

export interface InvestigationStep {
  agent: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  estimatedDuration: number;
  skippable: boolean;
}

export interface AdaptiveRule {
  condition: string;
  action: string;
  targetAgent: string;
}

export interface DecisionMetrics {
  riskScore: number;
  confidenceScore: number;
  falsePositiveLikelihood: number;
  blastRadius: BlastRadiusEstimate;
  slaRecommendation: SLARecommendation;
  automationEligibility: AutomationEligibility;
  riskBreakdown: RiskBreakdown;
}

export interface BlastRadiusEstimate {
  affectedSystems: number;
  affectedUsers: number;
  dataAtRisk: string;
  businessImpact: "critical" | "high" | "medium" | "low" | "none";
}

export interface SLARecommendation {
  responseTime: string;
  resolutionTime: string;
  escalationLevel: string;
}

export interface AutomationEligibility {
  eligible: boolean;
  reason: string;
  suggestedActions: string[];
  requiresApproval: boolean;
}

export interface RiskBreakdown {
  severityFactor: { weight: number; score: number; raw: string };
  assetCriticalityFactor: { weight: number; score: number; raw: string };
  threatConfidenceFactor: { weight: number; score: number; raw: string };
  exposureFactor: { weight: number; score: number; raw: string };
  mitigationStrength: { weight: number; score: number; raw: string };
}

export interface BehavioralAnomaly {
  entity: string;
  entityType: "user" | "host" | "ip";
  baselineMetrics: Record<string, any>;
  currentActivity: Record<string, any>;
  deviationScore: number;
  anomalyType: string;
  significance: "critical" | "high" | "medium" | "low";
  details: string;
}

export interface AnalystFeedbackContext {
  incidentType: string;
  originalVerdict: string;
  correctedVerdict: string;
  notes: string;
  severity: string;
}

export interface AgentPipelineResult {
  plan: InvestigationPlan;
  agentMessages: AgentMessage[];
  decisionMetrics: DecisionMetrics;
  totalDuration: number;
  agentCount: number;
  parallelExecutions: number;
}

export type SecurityAgent = {
  name: string;
  description: string;
  execute: (input: AgentInput) => Promise<AgentOutput>;
};
