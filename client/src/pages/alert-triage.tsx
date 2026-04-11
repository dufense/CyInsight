import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHero } from "@/components/page-hero";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { QueryErrorState } from "@/components/ui/error-boundary";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Filter, ShieldAlert, Zap, CheckCircle, XCircle, TrendingDown,
  TrendingUp, Plus, Trash2, RefreshCw, Brain, Target, AlertTriangle,
  Clock, Layers, Eye, BrainCircuit, BadgeCheck, Lightbulb, Settings2, Timer,
} from "lucide-react";
import type { SuppressionRule } from "@shared/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TriageStats {
  totalIncidents: number;
  autoClassified: number;
  noiseSuppressed: number;
  suppressedToday: number;
  fidelityScore: number | null;
  noiseRatio: number;
  mttd: number | null;
  scoreBands: Array<{ band: string; count: number }>;
  dailyTrend: Array<{ day: string; total: number; auto_classified: number; suppressed: number }>;
}

interface SourceFidelityRow {
  source: string;
  total: number;
  tp: number;
  fp: number;
  suppressed: number;
  avgConfidence: number | null;
  tpRate: number | null;
}

interface AlertCluster {
  incident_type: string | null;
  detection_source: string | null;
  kill_chain_phase: string | null;
  mitre_technique: string | null;
  count: number;
  avg_confidence: number | null;
  tp_count: number;
  fp_count: number;
  top_ioc: string | null;
}

interface SuggestedSuppression {
  name: string;
  field: string;
  operator: string;
  value: string;
  reason: string;
  fpCount: number;
  avgConfidence: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SCORE_BAND_COLORS: Record<string, string> = {
  "Unscored": "#6b7280",
  "0-19 (Noise)": "#ef4444",
  "20-39 (Low)": "#f97316",
  "40-59 (Medium)": "#facc15",
  "60-79 (High)": "#84cc16",
  "80-100 (Critical)": "#22c55e",
};

const MSS_ROLES = ["platform_admin", "mss_admin", "mss_analyst", "soc_manager", "security_analyst", "security_engineer"];

const FIELDS = [
  { value: "detection_source", label: "Detection Source" },
  { value: "incident_type", label: "Incident Type" },
  { value: "kill_chain_phase", label: "Kill Chain Phase" },
  { value: "mitre_technique", label: "MITRE Technique" },
  { value: "severity", label: "Severity" },
];

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "not_equals", label: "Not Equals" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SuppressionFormData {
  name: string;
  field: string;
  operator: string;
  value: string;
  action: "suppress" | "deprioritize";
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}

function StatCard({ label, value, sub, icon: Icon, color = "text-primary", trend, loading }: StatCardProps) {
  return (
    <Card className="border-border dark:border-white/10">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
            <div className={`p-2 rounded-lg bg-primary/10 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        )}
        {trend && !loading && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : null}
            <span>{trend === "up" ? "Improving" : trend === "down" ? "Degrading" : "Stable"} vs last 7d</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FidelityLabel({ rate }: { rate: number | null }) {
  if (rate === null) return <Badge variant="outline" className="text-xs">No data</Badge>;
  if (rate >= 75) return <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 text-xs">{rate}% TP</Badge>;
  if (rate >= 50) return <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 text-xs">{rate}% TP</Badge>;
  return <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 text-xs">{rate}% TP</Badge>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlertTriagePage() {
  const { currentTenant, isMSS: tenantIsMSS, userRole } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;

  // Use tenant context for role — it reads from /api/user/profile which includes isMSS flag
  const isMSS = tenantIsMSS || MSS_ROLES.includes(userRole ?? "");

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SuppressionRule | null>(null);
  const [form, setForm] = useState<SuppressionFormData>({
    name: "", field: "detection_source", operator: "equals", value: "", action: "suppress",
  });

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<TriageStats>({
    queryKey: ["/api/alert-triage/stats", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/alert-triage/stats?tenantId=${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch triage stats");
      return r.json() as Promise<TriageStats>;
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const { data: clusters, isLoading: clustersLoading, isError: clustersError } = useQuery<AlertCluster[]>({
    queryKey: ["/api/alert-triage/clusters", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/alert-triage/clusters?tenantId=${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch clusters");
      return r.json() as Promise<AlertCluster[]>;
    },
    enabled: !!tenantId,
  });

  const { data: sourceFidelity, isLoading: sourceLoading, isError: sourceError } = useQuery<SourceFidelityRow[]>({
    queryKey: ["/api/alert-triage/source-fidelity", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/alert-triage/source-fidelity?tenantId=${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch source fidelity");
      return r.json() as Promise<SourceFidelityRow[]>;
    },
    enabled: !!tenantId,
  });

  const { data: suggestions, isLoading: suggestionsLoading, isError: suggestionsError } = useQuery<SuggestedSuppression[]>({
    queryKey: ["/api/alert-triage/suggested-suppressions", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/alert-triage/suggested-suppressions?tenantId=${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch suggestions");
      return r.json() as Promise<SuggestedSuppression[]>;
    },
    enabled: !!tenantId,
  });

  const { data: rules, isLoading: rulesLoading, isError: rulesError } = useQuery<SuppressionRule[]>({
    queryKey: ["/api/suppression-rules", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/suppression-rules?tenantId=${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch suppression rules");
      return r.json() as Promise<SuppressionRule[]>;
    },
    enabled: !!tenantId,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: SuppressionFormData & { tenantId: number }) =>
      apiRequest("POST", "/api/suppression-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] });
      setRuleDialogOpen(false);
      setEditingRule(null);
      setForm({ name: "", field: "detection_source", operator: "equals", value: "", action: "suppress" });
      toast({ title: "Rule created", description: "Suppression rule is now active." });
    },
    onError: () => toast({ title: "Error", description: "Failed to create rule.", variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, ...data }: SuppressionFormData & { id: number; tenantId: number }) =>
      apiRequest("PUT", `/api/suppression-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] });
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast({ title: "Rule updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update rule.", variant: "destructive" }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ rule, isActive }: { rule: SuppressionRule; isActive: boolean }) =>
      apiRequest("PUT", `/api/suppression-rules/${rule.id}`, { tenantId: rule.tenantId, isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/suppression-rules/${id}?tenantId=${tenantId}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] });
      toast({ title: "Rule deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete rule.", variant: "destructive" }),
  });

  const backfillDetectionSourceMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/incidents/backfill-detection-source", { tenantId }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/source-fidelity", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/stats", tenantId] });
      toast({ title: "Detection sources fixed", description: data.message || `Updated ${data.updated} incidents` });
    },
    onError: () => toast({ title: "Error", description: "Failed to backfill detection sources.", variant: "destructive" }),
  });

  // One-click rule creation from AI suggestion
  const oneClickSuggestionMutation = useMutation({
    mutationFn: (s: SuggestedSuppression) =>
      apiRequest("POST", "/api/suppression-rules", { tenantId, name: s.name, field: s.field, operator: s.operator, value: s.value, action: "suppress" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] });
      toast({ title: "Rule created", description: "AI suggestion applied as suppression rule." });
    },
    onError: () => toast({ title: "Error", description: "Failed to apply suggestion.", variant: "destructive" }),
  });

  function openCreate() {
    setEditingRule(null);
    setForm({ name: "", field: "detection_source", operator: "equals", value: "", action: "suppress" });
    setRuleDialogOpen(true);
  }

  function openEdit(rule: SuppressionRule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      action: rule.action as "suppress" | "deprioritize",
    });
    setRuleDialogOpen(true);
  }

  function handleSaveRule() {
    if (!form.name || !form.value || !tenantId) return;
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, tenantId, ...form });
    } else {
      createRuleMutation.mutate({ tenantId, ...form });
    }
  }

  const noiseRatio = stats?.noiseRatio ?? 0;
  const fidelityScore = stats?.fidelityScore;
  const suppressedToday = stats?.suppressedToday ?? 0;
  const mttd = stats?.mttd;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <PageHero
        icon={BrainCircuit}
        iconColor="text-cyan-500"
        title="AI Alert Triage Center"
        description="Intelligent noise reduction and alert fidelity management powered by autonomous AI scoring"
        cyberAccent
        badge="AI-POWERED"
        stats={[
          { label: "Total Alerts (30d)", value: statsLoading ? "…" : (stats?.totalIncidents ?? 0), cyber: true },
          { label: "Auto-Classified", value: statsLoading ? "…" : (stats?.autoClassified ?? 0) },
          { label: "Suppressed Today", value: statsLoading ? "…" : suppressedToday, accent: suppressedToday > 10 },
          { label: "Noise Ratio", value: statsLoading ? "…" : `${noiseRatio}%`, accent: noiseRatio > 30 },
          { label: "Fidelity Score", value: statsLoading ? "…" : fidelityScore !== null && fidelityScore !== undefined ? `${fidelityScore}%` : "N/A" },
          { label: "Active Rules", value: rulesLoading ? "…" : (rules?.filter(r => r.isActive).length ?? 0) },
        ]}
      />

      {/* Stat Cards — 6 cards: core KPIs including Fidelity Score and MTTD */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Incidents (30d)"
          value={stats?.totalIncidents ?? 0}
          sub="Last 30 days"
          icon={Layers}
          loading={statsLoading}
        />
        <StatCard
          label="Auto-Classified"
          value={stats?.autoClassified ?? 0}
          sub={`${stats?.totalIncidents ? Math.round(((stats?.autoClassified ?? 0) / stats.totalIncidents) * 100) : 0}% coverage`}
          icon={Brain}
          color="text-cyan-500"
          loading={statsLoading}
        />
        <StatCard
          label="Suppressed Today"
          value={suppressedToday}
          sub="Noise filtered (24h)"
          icon={Filter}
          color={suppressedToday > 10 ? "text-red-500" : "text-green-500"}
          loading={statsLoading}
        />
        <StatCard
          label="Noise Ratio (30d)"
          value={`${noiseRatio}%`}
          sub="False or suppressed alerts"
          icon={ShieldAlert}
          color={noiseRatio > 40 ? "text-red-500" : noiseRatio > 20 ? "text-yellow-500" : "text-green-500"}
          loading={statsLoading}
        />
        <StatCard
          label="Fidelity Score"
          value={fidelityScore !== null && fidelityScore !== undefined ? `${fidelityScore}%` : "N/A"}
          sub="True positive rate"
          icon={BadgeCheck}
          color={fidelityScore !== null && fidelityScore !== undefined ? (fidelityScore >= 75 ? "text-green-500" : fidelityScore >= 50 ? "text-yellow-500" : "text-red-500") : "text-muted-foreground"}
          loading={statsLoading}
        />
        <StatCard
          label="Avg MTTD (minutes)"
          value={mttd !== null && mttd !== undefined ? `${mttd}m` : "N/A"}
          sub="Mean time to detect"
          icon={Timer}
          color={mttd !== null && mttd !== undefined ? (mttd <= 30 ? "text-green-500" : mttd <= 120 ? "text-yellow-500" : "text-red-500") : "text-muted-foreground"}
          loading={statsLoading}
        />
      </div>

      {/* Alert Fidelity Heatmap + Daily Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border dark:border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Alert Triage Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : statsError ? (
              <QueryErrorState moduleName="Triage Stats" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/stats", tenantId] })} />
            ) : stats?.scoreBands?.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.scoreBands} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="band" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.scoreBands.map((entry, i) => (
                      <Cell key={i} fill={SCORE_BAND_COLORS[entry.band] || "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                No triage data available. Run AI enrichment to score alerts.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border dark:border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-primary" />
              Daily Alert Volume & Noise (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : statsError ? (
              <QueryErrorState moduleName="Alert Trend" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/stats", tenantId] })} />
            ) : stats?.dailyTrend?.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.dailyTrend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="auto_classified" name="Auto-Classified" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="suppressed" name="Suppressed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No trend data available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source Fidelity Breakdown */}
      <Card className="border-border dark:border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Alert Source Fidelity Breakdown
            <div className="ml-auto flex items-center gap-2">
              {isMSS && sourceFidelity?.some(s => s.source === "Unknown") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => backfillDetectionSourceMutation.mutate()}
                  disabled={backfillDetectionSourceMutation.isPending}
                  data-testid="button-fix-unknown-sources"
                >
                  <RefreshCw className={`w-3 h-3 ${backfillDetectionSourceMutation.isPending ? "animate-spin" : ""}`} />
                  {backfillDetectionSourceMutation.isPending ? "Fixing…" : "Fix Unknown Sources"}
                </Button>
              )}
              <Badge variant="outline" className="text-xs">Last 30 days</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sourceError ? (
            <QueryErrorState moduleName="Source Fidelity" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/source-fidelity", tenantId] })} />
          ) : sourceFidelity?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border dark:border-white/10">
                    <TableHead className="text-xs">Detection Source</TableHead>
                    <TableHead className="text-xs text-center">Total</TableHead>
                    <TableHead className="text-xs text-center">True Positives</TableHead>
                    <TableHead className="text-xs text-center">False Positives</TableHead>
                    <TableHead className="text-xs text-center">Suppressed</TableHead>
                    <TableHead className="text-xs text-center">Avg Confidence</TableHead>
                    <TableHead className="text-xs text-center">Fidelity</TableHead>
                    <TableHead className="text-xs text-right">TP/FP Bar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceFidelity.map((s) => (
                    <TableRow key={s.source} className="border-border/40 dark:border-white/5 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{s.source}</TableCell>
                      <TableCell className="text-center text-sm">{s.total}</TableCell>
                      <TableCell className="text-center text-sm text-green-600 dark:text-green-400">{s.tp}</TableCell>
                      <TableCell className="text-center text-sm text-red-600 dark:text-red-400">{s.fp}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{s.suppressed}</TableCell>
                      <TableCell className="text-center text-sm">
                        {s.avgConfidence !== null ? (
                          <span className="flex items-center justify-center gap-1">
                            {s.avgConfidence}%
                            <Progress value={s.avgConfidence} className="w-12 h-1.5" />
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <FidelityLabel rate={s.tpRate} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5 h-3">
                          {s.tpRate !== null && (
                            <>
                              <div className="bg-green-500 rounded-sm" style={{ width: `${s.tpRate}%`, maxWidth: "60px" }} />
                              <div className="bg-red-400 rounded-sm" style={{ width: `${100 - s.tpRate}%`, maxWidth: "60px" }} />
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No source fidelity data. Incidents need classification data to populate this view.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Clusters + AI Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clustering Panel */}
        <Card className="border-border dark:border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Alert Clusters (Grouped Patterns)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clustersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : clustersError ? (
              <QueryErrorState moduleName="Alert Clusters" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/clusters", tenantId] })} />
            ) : clusters?.length ? (
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {clusters.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border dark:border-white/10 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.incident_type || "Unknown Type"}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.detection_source && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">{c.detection_source}</Badge>
                          )}
                          {c.kill_chain_phase && c.kill_chain_phase !== "Unknown" && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-primary">{c.kill_chain_phase}</Badge>
                          )}
                          {c.mitre_technique && c.mitre_technique !== "Unknown" && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-orange-500/30 text-orange-500">{c.mitre_technique}</Badge>
                          )}
                          {c.top_ioc && (
                            <Badge className="text-xs px-1.5 py-0 bg-red-500/10 text-red-500 border-red-500/20 border">
                              IOC: {c.top_ioc}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{c.count}</p>
                        <p className="text-xs text-muted-foreground">events</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {c.avg_confidence !== null && <span>Avg conf: <strong>{c.avg_confidence}%</strong></span>}
                      {c.tp_count > 0 && <span className="text-green-500">✓ {c.tp_count} TP</span>}
                      {c.fp_count > 0 && <span className="text-red-500">✗ {c.fp_count} FP</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No alert clusters yet. Clusters appear when 2+ incidents share the same type and kill chain phase.
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Suggested Suppressions */}
        <Card className="border-border dark:border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              AI Suggested Suppressions
              <Badge className="ml-auto bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 text-xs">
                Auto-computed from FP patterns
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suggestionsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : suggestionsError ? (
              <QueryErrorState moduleName="Suppression Suggestions" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/alert-triage/suggested-suppressions", tenantId] })} />
            ) : suggestions?.length ? (
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {suggestions.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 dark:border-yellow-500/10 dark:bg-yellow-500/5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                        <div className="flex gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span className="text-red-500 font-medium">{s.fpCount} FPs detected</span>
                          {s.avgConfidence && <span>• Avg confidence: {s.avgConfidence}%</span>}
                        </div>
                      </div>
                      {isMSS && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => oneClickSuggestionMutation.mutate(s)}
                            disabled={oneClickSuggestionMutation.isPending}
                            data-testid={`button-quick-add-suggestion-${i}`}
                            title="One-click: create rule immediately"
                          >
                            {oneClickSuggestionMutation.isPending ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3 mr-1" />
                            )}
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setEditingRule(null);
                              setForm({ name: s.name, field: s.field, operator: s.operator, value: s.value, action: "suppress" });
                              setRuleDialogOpen(true);
                            }}
                            data-testid={`button-customize-suggestion-${i}`}
                            title="Open in editor to customize before saving"
                          >
                            <Settings2 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No suppression suggestions yet. The AI will suggest rules once FP patterns are identified (2+ FPs with same source/type).
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Suppression Rule Manager */}
      <Card className="border-border dark:border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Suppression Rule Manager
              <Badge variant="outline" className="text-xs ml-1">
                {rules?.filter(r => r.isActive).length ?? 0} active / {rules?.length ?? 0} total
              </Badge>
            </CardTitle>
            {isMSS && (
              <Button size="sm" onClick={openCreate} data-testid="button-create-rule">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Rule
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rulesError ? (
            <QueryErrorState moduleName="Suppression Rules" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/suppression-rules", tenantId] })} />
          ) : rules?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border dark:border-white/10">
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Condition</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs text-center">Hits</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    {isMSS && <TableHead className="text-xs text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} className="border-border/40 dark:border-white/5 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <code className="text-xs bg-muted rounded px-1.5 py-0.5">
                          {rule.field} {rule.operator} "{rule.value}"
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${rule.action === "suppress" ? "border-red-500/40 text-red-500" : "border-yellow-500/40 text-yellow-500"}`}
                        >
                          {rule.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{rule.hitCount ?? 0}</TableCell>
                      <TableCell className="text-center">
                        {isMSS ? (
                          <Switch
                            checked={rule.isActive ?? false}
                            onCheckedChange={(checked) => toggleRuleMutation.mutate({ rule, isActive: checked })}
                            data-testid={`switch-rule-${rule.id}`}
                          />
                        ) : (
                          <Badge variant="outline" className={`text-xs ${rule.isActive ? "border-green-500/40 text-green-500" : "border-muted text-muted-foreground"}`}>
                            {rule.isActive ? "Active" : "Disabled"}
                          </Badge>
                        )}
                      </TableCell>
                      {isMSS && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(rule)}
                              data-testid={`button-edit-rule-${rule.id}`}
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                              data-testid={`button-delete-rule-${rule.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No suppression rules yet.
              {isMSS && (
                <span> <button className="text-primary hover:underline" onClick={openCreate}>Create the first rule</button> or use AI suggestions above.</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Suppression Rule" : "Create Suppression Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rule Name</Label>
              <Input
                placeholder="e.g., Suppress low-confidence SIEM alerts"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-rule-name"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Field</Label>
                <Select value={form.field} onValueChange={(v) => setForm(f => ({ ...f, field: v }))}>
                  <SelectTrigger data-testid="select-rule-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Operator</Label>
                <Select value={form.operator} onValueChange={(v) => setForm(f => ({ ...f, operator: v }))}>
                  <SelectTrigger data-testid="select-rule-operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Value</Label>
                <Input
                  placeholder="e.g., SIEM"
                  value={form.value}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  data-testid="input-rule-value"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={form.action} onValueChange={(v) => setForm(f => ({ ...f, action: v as "suppress" | "deprioritize" }))}>
                <SelectTrigger data-testid="select-rule-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suppress">Suppress (hide from queue)</SelectItem>
                  <SelectItem value="deprioritize">Deprioritize (lower severity)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveRule}
              disabled={!form.name || !form.value || createRuleMutation.isPending || updateRuleMutation.isPending}
              data-testid="button-save-rule"
            >
              {createRuleMutation.isPending || updateRuleMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
