import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Shield,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  Crosshair,
  Fingerprint,
  Activity,
  FileSearch,
  Users,
  Monitor,
  Globe,
  ArrowRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Investigation {
  id: number;
  tenant_id: number;
  incident_id: number;
  status: string;
  investigation_type: string;
  findings: any;
  recommendations: any;
  executive_summary: string;
  technical_report: string;
  risk_score: number;
  confidence_score: number;
  attack_chain: any[];
  iocs_summary: any[];
  related_incident_ids: number[];
  investigation_steps: any[];
  started_at: string;
  completed_at: string;
  created_at: string;
}

const PHASE_ICONS: Record<string, typeof Shield> = {
  "Reconnaissance": Globe,
  "Initial Access": Target,
  "Execution": Zap,
  "Persistence": Fingerprint,
  "Privilege Escalation": ArrowRight,
  "Defense Evasion": Shield,
  "Credential Access": Fingerprint,
  "Discovery": FileSearch,
  "Lateral Movement": Activity,
  "Collection": Monitor,
  "Command and Control": Globe,
  "Exfiltration": AlertTriangle,
  "Impact": AlertTriangle,
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
};

const STATUS_STYLES: Record<string, { bg: string; icon: typeof CheckCircle2 }> = {
  completed: { bg: "bg-green-500/10 text-green-700 dark:text-green-400", icon: CheckCircle2 },
  investigating: { bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: Loader2 },
  queued: { bg: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", icon: Clock },
  failed: { bg: "bg-red-500/10 text-red-700 dark:text-red-400", icon: AlertTriangle },
};

export function InvestigationStatusBadge({ tenantId, incidentId }: { tenantId: number; incidentId: number }) {
  const { data: investigation } = useQuery<Investigation | null>({
    queryKey: ["/api/investigations", tenantId, "incident", incidentId],
    queryFn: async () => {
      const res = await fetch(`/api/investigations/${tenantId}/incident/${incidentId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  if (!investigation) return null;

  const statusDef = STATUS_STYLES[investigation.status] || STATUS_STYLES.queued;
  const StatusIcon = statusDef.icon;

  return (
    <Badge variant="outline" className={`text-[9px] gap-1 ${statusDef.bg}`} data-testid={`badge-investigation-status-${incidentId}`}>
      <StatusIcon className={`w-2.5 h-2.5 ${investigation.status === "investigating" ? "animate-spin" : ""}`} />
      {investigation.status === "completed" ? "Investigated" : investigation.status}
    </Badge>
  );
}

export function AIInvestigationPanel({ incidentId, tenantId, isMSS }: { incidentId: number; tenantId: number; isMSS: boolean }) {
  const { toast } = useToast();
  const [showFullReport, setShowFullReport] = useState(false);

  const { data: investigation, isLoading } = useQuery<Investigation | null>({
    queryKey: ["/api/investigations", tenantId, "incident", incidentId],
    queryFn: async () => {
      const res = await fetch(`/api/investigations/${tenantId}/incident/${incidentId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 15000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "investigating" || data.status === "queued")) return 5000;
      return false;
    },
  });

  const investigateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/investigate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, "incident", incidentId] });
      toast({ title: "Investigation started", description: "AI SOC Analyst is investigating this incident..." });
    },
    onError: (error: any) => {
      toast({ title: "Investigation failed", description: error.message, variant: "destructive" });
    },
  });

  const forensicMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/investigate/forensic`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, "incident", incidentId] });
      toast({ title: "Forensic analysis started", description: "Deep forensic analysis in progress..." });
    },
    onError: (error: any) => {
      toast({ title: "Forensic analysis failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Checking investigation status...</span>
      </div>
    );
  }

  if (!investigation) {
    if (!isMSS) return null;
    return (
      <div className="border-t pt-4" data-testid={`panel-investigation-trigger-${incidentId}`}>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="default"
            onClick={(e) => { e.stopPropagation(); investigateMutation.mutate(); }}
            disabled={investigateMutation.isPending}
            data-testid={`button-investigate-${incidentId}`}
          >
            {investigateMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Investigating...</>
            ) : (
              <><Brain className="w-3.5 h-3.5 mr-1.5" /> AI Investigate</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); forensicMutation.mutate(); }}
            disabled={forensicMutation.isPending}
            data-testid={`button-forensic-${incidentId}`}
          >
            {forensicMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analyzing...</>
            ) : (
              <><Crosshair className="w-3.5 h-3.5 mr-1.5" /> Deep Forensic Analysis</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (investigation.status === "investigating" || investigation.status === "queued") {
    return (
      <div className="border-t pt-4" data-testid={`panel-investigation-progress-${incidentId}`}>
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <Brain className="w-5 h-5 text-blue-600" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI SOC Analyst — {investigation.status === "queued" ? "Queued" : "Investigating"}</p>
                <p className="text-[10px] text-muted-foreground">Autonomous investigation in progress...</p>
              </div>
            </div>
            {investigation.investigation_steps && investigation.investigation_steps.length > 0 && (
              <div className="space-y-1.5">
                {investigation.investigation_steps.map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                    <span className="font-medium">{step.step}</span>
                    <span className="text-muted-foreground truncate">{step.result?.substring(0, 80)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-[10px] text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  <span>Processing next step...</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const findings = investigation.findings || {};
  const recommendations = investigation.recommendations || {};
  const attackChain = investigation.attack_chain || [];
  const iocsSummary = investigation.iocs_summary || [];
  const affectedEntities = findings.affectedEntities || [];
  const containmentActions = recommendations.containmentActions || [];
  const remediationSteps = recommendations.remediationSteps || [];
  const preventionMeasures = recommendations.preventionMeasures || [];

  return (
    <div className="border-t pt-4 space-y-4" data-testid={`panel-investigation-results-${incidentId}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold">AI SOC Analyst Report</span>
          <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Completed
          </Badge>
          <Badge variant="outline" className="text-[9px]">
            {investigation.investigation_type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Risk Score</p>
            <Badge className={`text-[10px] ${investigation.risk_score >= 70 ? "bg-red-600" : investigation.risk_score >= 40 ? "bg-orange-600" : "bg-green-600"} text-white`} data-testid={`badge-risk-score-${incidentId}`}>
              {investigation.risk_score}/100
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Confidence</p>
            <Badge variant="outline" className="text-[10px]" data-testid={`badge-inv-confidence-${incidentId}`}>
              {investigation.confidence_score}%
            </Badge>
          </div>
          <Link href={`/ai-analyst/${investigation.id}`} onClick={(e: any) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" data-testid={`button-view-ai-analyst-${incidentId}`}>
              <ExternalLink className="w-3 h-3 mr-1" /> View in AI Analyst
            </Button>
          </Link>
        </div>
      </div>

      {investigation.executive_summary && (
        <Card className="bg-gradient-to-r from-purple-500/5 to-blue-500/5 border-purple-500/20">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-xs leading-relaxed" data-testid={`text-executive-summary-${incidentId}`}>
              {investigation.executive_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {attackChain.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-red-600" />
              Attack Chain
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="relative">
              {attackChain.map((phase: any, i: number) => {
                const PhaseIcon = PHASE_ICONS[phase.phase] || Shield;
                return (
                  <div key={i} className="flex gap-3 mb-3 last:mb-0" data-testid={`attack-chain-step-${incidentId}-${i}`}>
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
                        i === 0 ? "bg-red-600" : i === attackChain.length - 1 ? "bg-purple-600" : "bg-blue-600"
                      }`}>
                        <PhaseIcon className="w-3.5 h-3.5" />
                      </div>
                      {i < attackChain.length - 1 && <div className="w-0.5 h-full bg-muted-foreground/20 mt-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{phase.phase}</span>
                        {phase.timestamp && (
                          <span className="text-[9px] text-muted-foreground">{phase.timestamp}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{phase.description}</p>
                      {phase.evidence && (
                        <p className="text-[9px] font-mono bg-muted/50 px-2 py-1 rounded mt-1 text-muted-foreground">{phase.evidence}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {iocsSummary.length > 0 && (
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-orange-600" />
                IOCs Discovered ({iocsSummary.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {iocsSummary.map((ioc: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]" data-testid={`ioc-item-${incidentId}-${i}`}>
                    <Badge variant="outline" className={`text-[8px] ${
                      ioc.reputation === "malicious" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                      ioc.reputation === "suspicious" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                      "bg-green-500/10 text-green-700 dark:text-green-400"
                    }`}>
                      {ioc.reputation || "unknown"}
                    </Badge>
                    <span className="font-mono truncate max-w-[150px]">{ioc.value}</span>
                    <Badge variant="outline" className="text-[8px]">{ioc.type}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {affectedEntities.length > 0 && (
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Affected Entities ({affectedEntities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {affectedEntities.map((entity: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]" data-testid={`entity-item-${incidentId}-${i}`}>
                    <Badge variant="outline" className={`text-[8px] ${
                      entity.riskLevel === "critical" || entity.riskLevel === "high" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                      entity.riskLevel === "medium" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                      "bg-green-500/10 text-green-700 dark:text-green-400"
                    }`}>
                      {entity.riskLevel}
                    </Badge>
                    <Badge variant="outline" className="text-[8px]">{entity.type}</Badge>
                    <span className="font-mono truncate max-w-[150px]">{entity.value}</span>
                    {entity.details && <span className="text-muted-foreground truncate">{entity.details}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {containmentActions.length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-orange-600" />
              Recommended Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="space-y-2">
              <div>
                <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1.5">Containment</p>
                <div className="space-y-1.5">
                  {containmentActions.map((action: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded border text-[10px] ${PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.medium}`} data-testid={`action-containment-${incidentId}-${i}`}>
                      <Badge variant="outline" className="text-[8px] flex-shrink-0 mt-0.5">{action.priority}</Badge>
                      <div className="flex-1">
                        <span className="font-medium">{action.action}</span>
                        {action.urgency && <span className="text-muted-foreground ml-1">({action.urgency})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {remediationSteps.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1.5">Remediation</p>
                  <div className="space-y-1">
                    {remediationSteps.map((step: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]" data-testid={`action-remediation-${incidentId}-${i}`}>
                        <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold flex-shrink-0">{i + 1}</span>
                        <span>{step.step || step}</span>
                        {step.owner && <Badge variant="outline" className="text-[8px]">{step.owner}</Badge>}
                        {step.timeline && <span className="text-muted-foreground">{step.timeline}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {preventionMeasures.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1.5">Prevention</p>
                  <ul className="space-y-0.5">
                    {preventionMeasures.map((measure: string, i: number) => (
                      <li key={i} className="text-[10px] flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                        {measure}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {findings.lateralMovement && (
        <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-400">Lateral Movement Detected</span>
        </div>
      )}

      {findings.dataExfiltration && (
        <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-400">Potential Data Exfiltration Detected</span>
        </div>
      )}

      {investigation.technical_report && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="text-[10px] text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); setShowFullReport(!showFullReport); }}
            data-testid={`button-toggle-report-${incidentId}`}
          >
            <ChevronRight className={`w-3 h-3 mr-1 transition-transform ${showFullReport ? "rotate-90" : ""}`} />
            {showFullReport ? "Hide" : "Show"} Full Technical Report
          </Button>
          {showFullReport && (
            <div className="mt-2 p-3 bg-muted/30 rounded text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto" data-testid={`text-technical-report-${incidentId}`}>
              {investigation.technical_report}
            </div>
          )}
        </div>
      )}

      {investigation.investigation_steps && investigation.investigation_steps.length > 0 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
            Investigation Steps ({investigation.investigation_steps.length} steps)
          </summary>
          <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
            {investigation.investigation_steps.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{step.step}:</span>{" "}
                  <span className="text-muted-foreground">{step.action}</span>
                  {step.result && <p className="text-muted-foreground/70 mt-0.5">{step.result}</p>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {isMSS && investigation.status === "completed" && (
        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); forensicMutation.mutate(); }}
            disabled={forensicMutation.isPending}
            data-testid={`button-forensic-rerun-${incidentId}`}
          >
            {forensicMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analyzing...</>
            ) : (
              <><Crosshair className="w-3.5 h-3.5 mr-1.5" /> Run Deep Forensic Analysis</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); investigateMutation.mutate(); }}
            disabled={investigateMutation.isPending}
            data-testid={`button-reinvestigate-${incidentId}`}
          >
            {investigateMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Re-investigating...</>
            ) : (
              <><Brain className="w-3.5 h-3.5 mr-1.5" /> Re-investigate</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
