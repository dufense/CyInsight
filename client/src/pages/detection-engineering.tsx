import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Code2, Bot, Plus, Play, Archive, CheckCircle2, AlertTriangle,
  Loader2, Zap, Shield, Search, Copy, ChevronDown, ChevronRight, FileCode,
  Settings, Sparkles
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/30",
  testing: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  draft: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/30",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

const RULE_TYPES = ["sigma", "kql", "spl", "eql", "yara"];

export default function DetectionEngineeringPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ ruleType: "sigma", technique: "", threatDescription: "" });
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const tenantId = currentTenant?.id;

  // Auto-expand a specific rule when navigated here with ?ruleId=X (e.g., from War Room)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ruleId = params.get("ruleId");
    if (ruleId) {
      setExpanded(parseInt(ruleId));
    }
  }, []);

  const rulesQuery = useQuery<any[]>({
    queryKey: ["/api/detection-rules", tenantId, { statusFilter, ruleTypeFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (ruleTypeFilter) params.set("ruleType", ruleTypeFilter);
      return apiRequest("GET", `/api/detection-rules/${tenantId}${params.toString() ? "?" + params : ""}`).then(r => r.json());
    },
    enabled: !!tenantId,
    refetchInterval: 10000,
  });

  const generateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/detection-rules/${tenantId}/generate`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Detection rule generated" });
      queryClient.invalidateQueries({ queryKey: ["/api/detection-rules", tenantId] });
      setShowGenerate(false);
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const autoGenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/detection-rules/${tenantId}/auto-generate`, {}).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Auto-generation started", description: "Generating 5 rules from recent threats" });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/detection-rules", tenantId] }), 5000);
    },
    onError: (e: any) => toast({ title: "Auto-gen failed", description: e.message, variant: "destructive" }),
  });

  const fromAnomaliesMutation = useMutation({
    mutationFn: (ruleType: string) => apiRequest("POST", `/api/detection-rules/${tenantId}/generate-from-anomalies`, { ruleType }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Rule generated from behavioral anomalies" });
      queryClient.invalidateQueries({ queryKey: ["/api/detection-rules", tenantId] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ ruleId, status }: { ruleId: number; status: string }) =>
      apiRequest("PATCH", `/api/detection-rules/${tenantId}/${ruleId}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/detection-rules", tenantId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (ruleId: number) => apiRequest("DELETE", `/api/detection-rules/${tenantId}/${ruleId}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/detection-rules", tenantId] });
    },
  });

  // [NEW] Tenant detection settings
  const settingsQuery = useQuery<any>({
    queryKey: ["/api/tenant-detection-settings", tenantId],
    queryFn: () => apiRequest("GET", `/api/tenant-detection-settings/${tenantId}`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const settingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/tenant-detection-settings/${tenantId}`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-detection-settings", tenantId] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const copyRule = (rule: any) => {
    navigator.clipboard.writeText(rule.ruleContent);
    setCopiedId(rule.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const rules = (rulesQuery.data || []).filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: rulesQuery.data?.length ?? 0,
    active: rulesQuery.data?.filter(r => r.status === "active").length ?? 0,
    draft: rulesQuery.data?.filter(r => r.status === "draft").length ?? 0,
    testing: rulesQuery.data?.filter(r => r.status === "testing").length ?? 0,
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Code2}
        title="AI Detection Engineering"
        description="Automatically generate Sigma, KQL, SPL, EQL, and YARA rules from threat intelligence and behavioral anomalies"
        badge="AI Rules"
        stats={[
          { label: "Total Rules", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Draft", value: stats.draft },
          { label: "Testing", value: stats.testing },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* Action Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowGenerate(true)} data-testid="button-generate-rule">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Generate Rule
          </Button>
          <Button size="sm" variant="outline" onClick={() => autoGenerateMutation.mutate()} disabled={autoGenerateMutation.isPending} data-testid="button-auto-generate">
            {autoGenerateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}Auto-Generate (5 Rules)
          </Button>
          <Button size="sm" variant="outline" onClick={() => fromAnomaliesMutation.mutate("sigma")} disabled={fromAnomaliesMutation.isPending} data-testid="button-generate-from-anomalies">
            {fromAnomaliesMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Bot className="w-3.5 h-3.5 mr-1.5" />}From Anomalies
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-3.5 h-3.5 mr-1.5" />Auto-Enable Settings
          </Button>
        </div>

        {/* [NEW] Auto-Enable Settings Panel */}
        {showSettings && (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Auto-Enable Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Auto-Enable Sigma Rules</Label>
                      <input
                        type="checkbox"
                        checked={settingsQuery.data?.auto_enable_sigma_rules || false}
                        onChange={e => settingsMutation.mutate({ auto_enable_sigma_rules: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">From Incidents</Label>
                      <input
                        type="checkbox"
                        checked={settingsQuery.data?.auto_enable_from_incidents || false}
                        onChange={e => settingsMutation.mutate({ auto_enable_from_incidents: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">From Gap Analysis</Label>
                      <input
                        type="checkbox"
                        checked={settingsQuery.data?.auto_enable_from_gaps || false}
                        onChange={e => settingsMutation.mutate({ auto_enable_from_gaps: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Min AI Confidence ({settingsQuery.data?.min_ai_confidence || 80})</Label>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={settingsQuery.data?.min_ai_confidence || 80}
                        onChange={e => settingsMutation.mutate({ min_ai_confidence: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max FP Rate</Label>
                      <Select
                        value={settingsQuery.data?.max_false_positive_rate || "low"}
                        onValueChange={v => settingsMutation.mutate({ max_false_positive_rate: v })}
                      >
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Min Backtest Matches</Label>
                      <Input
                        type="number" min="0" max="100"
                        value={settingsQuery.data?.min_backtest_matched_events || 1}
                        onChange={e => settingsMutation.mutate({ min_backtest_matched_events: parseInt(e.target.value) })}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search rules..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-sm" data-testid="input-rule-search" />
          </div>
          <Select value={statusFilter || "_all"} onValueChange={v => setStatusFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[120px]" data-testid="select-rule-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ruleTypeFilter || "_all"} onValueChange={v => setRuleTypeFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[120px]" data-testid="select-rule-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Types</SelectItem>
              {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Rules List */}
        {rulesQuery.isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Code2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No detection rules yet. Generate your first rule using AI.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rules.map((rule: any) => (
              <Card key={rule.id} className="overflow-hidden" data-testid={`rule-card-${rule.id}`}>
                <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors" onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}>
                  <FileCode className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</span>
                      <Badge variant="outline" className="text-[9px] font-mono">{rule.ruleType?.toUpperCase()}</Badge>
                      <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[rule.status] || ""}`}>{rule.status}</Badge>
                      {rule.severity && <Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[rule.severity] || ""}`}>{rule.severity}</Badge>}
                      {rule.promoted_to_sigma_rule_id && (
                        <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-500 border-purple-500/30">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />Runtime
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{rule.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">AI {rule.aiConfidence}% conf</span>
                    {expanded === rule.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                </button>
                {expanded === rule.id && (
                  <div className="border-t p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                      {(rule.mitreAttackIds || []).map((id: string) => <Badge key={id} variant="secondary" className="text-[9px] font-mono">{id}</Badge>)}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button size="sm" variant="ghost" onClick={() => copyRule(rule)} data-testid={`button-copy-rule-${rule.id}`}>
                        {copiedId === rule.id ? <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                        {copiedId === rule.id ? "Copied!" : "Copy"}
                      </Button>
                      {rule.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ ruleId: rule.id, status: "testing" })} data-testid={`button-promote-testing-${rule.id}`}>
                          <Play className="w-3.5 h-3.5 mr-1.5" />Test
                        </Button>
                      )}
                      {rule.status === "testing" && (
                        <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ ruleId: rule.id, status: "active" })} className="text-green-600 border-green-500/30" data-testid={`button-activate-${rule.id}`}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Activate
                        </Button>
                      )}
                      {rule.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={() => archiveMutation.mutate(rule.id)} data-testid={`button-archive-${rule.id}`}>
                          <Archive className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />Archive
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[200px] bg-background rounded-lg border p-3">
                      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed text-foreground" data-testid={`text-rule-content-${rule.id}`}>{rule.ruleContent}</pre>
                    </ScrollArea>
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                      <div>FP Rate: <span className="text-foreground font-medium">{rule.falsePositiveRate || "—"}</span></div>
                      <div>TP Rate: <span className="text-foreground font-medium">{rule.truePositiveRate || "—"}</span></div>
                      <div>Generated: <span className="text-foreground font-medium">{rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : "—"}</span></div>
                    </div>
                    {rule.testResults?.backtest && (
                      <div className="text-[10px] text-muted-foreground bg-background rounded p-2 border">
                        <span className="font-medium">Backtest (30d):</span> {rule.testResults.backtest.matchedEvents} events across {rule.testResults.backtest.matchedDays} days
                        {rule.testResults.backtest.estimatedCoverage && ` · Coverage: ${rule.testResults.backtest.estimatedCoverage}`}
                      </div>
                    )}
                    {rule.auto_enable_reason && (
                      <div className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/20 rounded p-2 border border-purple-200 dark:border-purple-800">
                        <Sparkles className="w-3 h-3 inline mr-1" />
                        {rule.auto_enable_reason.startsWith("auto:") ? "Auto-enabled" : "Enabled"}: {rule.auto_enable_reason}
                        {rule.promoted_to_sigma_rule_id && ` · Sigma ID: ${rule.promoted_to_sigma_rule_id}`}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generate Rule Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md" data-testid="dialog-generate-rule">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="w-4 h-4" />Generate Detection Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Rule Type</Label>
              <Select value={genForm.ruleType} onValueChange={v => setGenForm(f => ({ ...f, ruleType: v }))}>
                <SelectTrigger data-testid="select-gen-rule-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">MITRE Technique (optional)</Label>
              <Input value={genForm.technique} onChange={e => setGenForm(f => ({ ...f, technique: e.target.value }))} placeholder="e.g. T1059.001 - PowerShell" data-testid="input-gen-technique" />
            </div>
            <div>
              <Label className="text-xs">Threat Description</Label>
              <Input value={genForm.threatDescription} onChange={e => setGenForm(f => ({ ...f, threatDescription: e.target.value }))} placeholder="Describe the threat to detect..." data-testid="input-gen-description" />
            </div>
            <Button className="w-full" onClick={() => generateMutation.mutate(genForm)} disabled={generateMutation.isPending} data-testid="button-confirm-generate">
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bot className="w-4 h-4 mr-2" />}Generate with AI
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
