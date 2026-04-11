import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ShieldAlert, Play, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Eye, Lock, Swords, Target, TrendingDown, TrendingUp,
  ChevronDown, ChevronRight, Bot, Crosshair, Clock, BarChart2, Zap
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  lateral_movement: "Lateral Movement",
  exfiltration: "Exfiltration",
  persistence: "Persistence",
  privilege_escalation: "Privilege Escalation",
  initial_access: "Initial Access",
  defense_evasion: "Defense Evasion",
  discovery: "Discovery",
  credential_access: "Credential Access",
  impact: "Impact",
  command_and_control: "C2",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/30",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

const OUTCOME_COLORS: Record<string, string> = {
  blocked: "text-green-500",
  detected: "text-blue-500",
  partial: "text-yellow-500",
  missed: "text-red-500",
};

const OUTCOME_ICONS: Record<string, any> = {
  blocked: Lock,
  detected: Eye,
  partial: AlertTriangle,
  missed: XCircle,
};

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const color = score >= 75 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-red-500";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative flex items-center justify-center rounded-full border-4 ${score >= 75 ? "border-green-500/30 bg-green-500/5" : score >= 50 ? "border-yellow-500/30 bg-yellow-500/5" : "border-red-500/30 bg-red-500/5"}`} style={{ width: size, height: size }}>
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
      </div>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function RunResultsPanel({ run }: { run: any }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const results = (run.results || []) as any[];
  const recommendations = (run.recommendations || []) as any[];

  return (
    <div className="space-y-4">
      {/* Score Summary */}
      <div className="flex items-center justify-around gap-4 py-2">
        <ScoreRing score={run.overallScore ?? 0} label="Overall" />
        <ScoreRing score={run.detectionScore ?? 0} label="Detection" />
        <ScoreRing score={run.preventionScore ?? 0} label="Prevention" />
        <ScoreRing score={100 - (run.exposureScore ?? 100)} label="Resilience" />
      </div>

      {/* AI Analysis */}
      {run.aiAnalysis && (
        <div className="bg-muted/40 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">AI Analysis</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{run.aiAnalysis}</p>
        </div>
      )}

      {/* Step Results */}
      {results.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Attack Steps ({results.length})</p>
          <div className="space-y-1.5">
            {results.map((step: any, idx: number) => {
              const OutcomeIcon = OUTCOME_ICONS[step.outcome] || XCircle;
              const isExpanded = expanded === idx;
              return (
                <div key={idx} className="border rounded-lg overflow-hidden" data-testid={`step-result-${idx}`}>
                  <button className="w-full flex items-center gap-2 p-2 hover:bg-muted/40 transition-colors" onClick={() => setExpanded(isExpanded ? null : idx)}>
                    <OutcomeIcon className={`w-3.5 h-3.5 shrink-0 ${OUTCOME_COLORS[step.outcome]}`} />
                    <span className="text-xs font-medium flex-1 text-left">{step.technique}</span>
                    <Badge variant="outline" className={`text-[9px] ${OUTCOME_COLORS[step.outcome]}`}>{step.outcome}</Badge>
                    {step.detectedBy && <span className="text-[9px] text-muted-foreground">{step.detectedBy}</span>}
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-2 pt-0 bg-muted/20 border-t space-y-1">
                      <p className="text-[10px] text-muted-foreground"><span className="font-medium">Vector:</span> {step.vector}</p>
                      <p className="text-[10px] font-mono text-muted-foreground bg-background/50 rounded px-1.5 py-0.5">{step.payload}</p>
                      <p className="text-[10px] text-muted-foreground"><span className="font-medium">Expected Control:</span> {step.expectedDetection}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground">Risk Score:</span>
                        <Progress value={step.riskScore} className="h-1 flex-1 max-w-[80px]" />
                        <span className="text-[9px] font-medium">{step.riskScore}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Recommendations</p>
          <div className="space-y-1.5">
            {recommendations.map((rec: any, i: number) => (
              <div key={i} className="border rounded-lg p-2.5" data-testid={`recommendation-${i}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[9px] ${rec.priority === "critical" ? "text-red-500 border-red-500/30" : rec.priority === "high" ? "text-orange-500 border-orange-500/30" : "text-yellow-500 border-yellow-500/30"}`}>{rec.priority}</Badge>
                  <span className="text-xs font-medium">{rec.control}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{rec.action}</p>
                {rec.rationale && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{rec.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BASPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [selectedScenario, setSelectedScenario] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("scenarios");
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());

  const tenantId = currentTenant?.id;

  const scenariosQuery = useQuery<any[]>({
    queryKey: ["/api/bas", tenantId, "scenarios"],
    queryFn: () => apiRequest("GET", `/api/bas/${tenantId}/scenarios`).then(r => r.json()),
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const runsQuery = useQuery<any[]>({
    queryKey: ["/api/bas", tenantId, "runs"],
    queryFn: () => apiRequest("GET", `/api/bas/${tenantId}/runs`).then(r => r.json()),
    enabled: !!tenantId,
    refetchInterval: 5000, // poll to catch running→completed
  });

  const dashboardQuery = useQuery<any>({
    queryKey: ["/api/bas", tenantId, "dashboard"],
    queryFn: () => apiRequest("GET", `/api/bas/${tenantId}/dashboard`).then(r => r.json()),
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const runMutation = useMutation({
    mutationFn: (scenarioId: number) =>
      apiRequest("POST", `/api/bas/${tenantId}/run`, { scenarioId }).then(r => r.json()),
    onSuccess: (data) => {
      setRunningIds(prev => new Set([...prev, data.runId]));
      toast({ title: "BAS simulation started", description: "Results will appear in the Runs tab" });
      queryClient.invalidateQueries({ queryKey: ["/api/bas", tenantId, "runs"] });
      setActiveTab("runs");
    },
    onError: (e: any) => {
      toast({ title: "Failed to start simulation", description: e.message, variant: "destructive" });
    },
  });

  const dashboard = dashboardQuery.data;

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/30 text-[9px]"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Completed</Badge>;
    if (status === "running") return <Badge variant="default" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[9px] animate-pulse"><RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" />Running</Badge>;
    if (status === "failed") return <Badge variant="destructive" className="text-[9px]"><XCircle className="w-2.5 h-2.5 mr-1" />Failed</Badge>;
    return <Badge variant="secondary" className="text-[9px]"><Clock className="w-2.5 h-2.5 mr-1" />Pending</Badge>;
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Swords}
        title="Breach & Attack Simulation"
        description="Continuously validate security controls with automated attack simulations mapped to MITRE ATT&CK"
        badge="BAS Engine"
        stats={[
          { label: "Scenarios", value: dashboard?.totalScenarios ?? "—" },
          { label: "Runs", value: dashboard?.totalRuns ?? "—" },
          { label: "Overall Score", value: dashboard?.avgOverallScore ? `${dashboard.avgOverallScore}%` : "—" },
          { label: "Detection Rate", value: dashboard?.avgDetectionScore ? `${dashboard.avgDetectionScore}%` : "—" },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* KPI Strip */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Overall Score", value: dashboard.avgOverallScore, icon: Target, color: "text-primary" },
              { label: "Detection Rate", value: dashboard.avgDetectionScore, icon: Eye, color: "text-blue-500" },
              { label: "Prevention Rate", value: dashboard.avgPreventionScore, icon: Lock, color: "text-green-500" },
              { label: "Exposure Rate", value: dashboard.avgExposureScore, icon: ShieldAlert, color: "text-red-500" },
            ].map(kpi => (
              <Card key={kpi.label} data-testid={`kpi-${kpi.label.toLowerCase().replace(/ /g, "-")}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value ?? 0}<span className="text-xs font-normal text-muted-foreground">%</span></p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="scenarios" data-testid="tab-scenarios">
              <Shield className="w-3.5 h-3.5 mr-1.5" />Scenarios
              {scenariosQuery.data?.length ? <Badge variant="secondary" className="ml-1.5 text-[9px] px-1">{scenariosQuery.data.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-runs">
              <Play className="w-3.5 h-3.5 mr-1.5" />Simulation Runs
              {runsQuery.data?.length ? <Badge variant="secondary" className="ml-1.5 text-[9px] px-1">{runsQuery.data.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="coverage" data-testid="tab-coverage">
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />Coverage Map
            </TabsTrigger>
          </TabsList>

          {/* ── Scenarios Tab ─────────────────────────────────────────────── */}
          <TabsContent value="scenarios">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {scenariosQuery.isLoading ? (
                [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full" />)
              ) : (scenariosQuery.data || []).map((scenario: any) => (
                <Card key={scenario.id} className={`cursor-pointer transition-all hover:border-primary/40 ${selectedScenario?.id === scenario.id ? "border-primary/60 bg-primary/5" : ""}`}
                  onClick={() => setSelectedScenario(selectedScenario?.id === scenario.id ? null : scenario)}
                  data-testid={`scenario-card-${scenario.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold" data-testid={`text-scenario-name-${scenario.id}`}>{scenario.name}</span>
                          {scenario.isBuiltIn && <Badge variant="secondary" className="text-[9px]">Built-in</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{scenario.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[scenario.severity]}`}>{scenario.severity}</Badge>
                        <Badge variant="secondary" className="text-[9px]">{CATEGORY_LABELS[scenario.category] || scenario.category}</Badge>
                      </div>
                    </div>

                    {/* MITRE IDs */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(scenario.mitreAttackIds || []).map((id: string) => (
                        <Badge key={id} variant="outline" className="text-[9px] font-mono">{id}</Badge>
                      ))}
                    </div>

                    {/* Attack vectors preview */}
                    <div className="space-y-1 mb-3">
                      {(scenario.attackVectors || []).map((v: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Crosshair className="w-2.5 h-2.5 shrink-0" />
                          <span className="font-medium text-foreground">{v.technique}</span>
                          <span>→ {v.expectedDetection}</span>
                        </div>
                      ))}
                    </div>

                    <Button size="sm" className="w-full" variant="outline"
                      onClick={(e) => { e.stopPropagation(); runMutation.mutate(scenario.id); }}
                      disabled={runMutation.isPending}
                      data-testid={`button-run-scenario-${scenario.id}`}>
                      <Play className="w-3.5 h-3.5 mr-1.5" />Run Simulation
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Runs Tab ──────────────────────────────────────────────────── */}
          <TabsContent value="runs">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Runs List */}
              <div className="lg:col-span-1 space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">Recent Simulations</p>
                {runsQuery.isLoading ? (
                  [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)
                ) : !(runsQuery.data?.length) ? (
                  <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">
                    No simulations yet. Run a scenario to get started.
                  </CardContent></Card>
                ) : (
                  <ScrollArea className="h-[500px] pr-2">
                    <div className="space-y-2">
                      {runsQuery.data!.map((run: any) => (
                        <Card key={run.id} className={`cursor-pointer transition-all hover:border-primary/40 ${selectedRun?.id === run.id ? "border-primary/60 bg-primary/5" : ""}`}
                          onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                          data-testid={`run-card-${run.id}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium truncate flex-1">{run.scenarioName || "—"}</span>
                              {getStatusBadge(run.status)}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <Badge variant="secondary" className="text-[9px]">{CATEGORY_LABELS[run.scenarioCategory] || run.scenarioCategory || "—"}</Badge>
                              {run.status === "completed" && (
                                <span className="flex items-center gap-1 text-primary font-medium">
                                  <Zap className="w-2.5 h-2.5" />{run.overallScore}%
                                </span>
                              )}
                            </div>
                            {run.status === "completed" && (
                              <div className="mt-2 grid grid-cols-3 gap-1 text-[9px]">
                                <div className="text-center"><div className="font-medium text-green-500">{run.preventionScore}%</div><div className="text-muted-foreground">Prevent</div></div>
                                <div className="text-center"><div className="font-medium text-blue-500">{run.detectionScore}%</div><div className="text-muted-foreground">Detect</div></div>
                                <div className="text-center"><div className="font-medium text-red-500">{run.exposureScore}%</div><div className="text-muted-foreground">Exposed</div></div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* Run Detail */}
              <div className="lg:col-span-2">
                {!selectedRun ? (
                  <Card className="h-full flex items-center justify-center">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <Swords className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Select a simulation run to view detailed results</p>
                    </CardContent>
                  </Card>
                ) : selectedRun.status !== "completed" ? (
                  <Card>
                    <CardContent className="p-8 flex flex-col items-center gap-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {selectedRun.status === "running" ? "Simulation in progress..." : "Simulation pending..."}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm">{selectedRun.scenarioName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">by {selectedRun.triggeredBy} · {selectedRun.completedAt ? new Date(selectedRun.completedAt).toLocaleString() : ""}</p>
                      </div>
                      {getStatusBadge(selectedRun.status)}
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <ScrollArea className="h-[500px]">
                        <RunResultsPanel run={selectedRun} />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Coverage Map Tab ──────────────────────────────────────────── */}
          <TabsContent value="coverage">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Coverage */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />Coverage by Attack Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                  {dashboardQuery.isLoading ? (
                    [1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)
                  ) : !(dashboard?.categoryBreakdown?.length) ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Run simulations to see coverage data</p>
                  ) : dashboard.categoryBreakdown.map((cat: any) => (
                    <div key={cat.category} data-testid={`coverage-${cat.category}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{CATEGORY_LABELS[cat.category] || cat.category}</span>
                        <span className="text-muted-foreground">{cat.runs} runs · <span className={cat.avgScore >= 75 ? "text-green-500" : cat.avgScore >= 50 ? "text-yellow-500" : "text-red-500"}>{cat.avgScore}%</span></span>
                      </div>
                      <Progress value={cat.avgScore} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* MITRE ATT&CK Heatmap */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-red-500" />MITRE ATT&CK Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {scenariosQuery.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <div className="grid grid-cols-4 gap-1">
                      {["Reconnaissance", "Initial Access", "Execution", "Persistence", "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection", "C2", "Exfiltration", "Impact", "Resource Dev"].map((tactic) => {
                        const covered = (scenariosQuery.data || []).some((s: any) =>
                          (s.killChainPhases || []).some((p: string) => tactic.toLowerCase().replace(/ /g, "_").includes(p.toLowerCase().replace(/ /g, "_")))
                          || s.category === tactic.toLowerCase().replace(/ /g, "_")
                        );
                        return (
                          <div key={tactic} className={`text-center p-1.5 rounded text-[9px] leading-tight ${covered ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted/40 text-muted-foreground border border-border"}`} data-testid={`mitre-${tactic.toLowerCase().replace(/ /g, "-")}`}>
                            {tactic}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-3">
                    <span className="inline-block w-2.5 h-2.5 rounded bg-primary/20 border border-primary/30 mr-1" />Covered
                    <span className="inline-block w-2.5 h-2.5 rounded bg-muted/40 border border-border ml-3 mr-1" />Not covered
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
