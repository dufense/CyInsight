import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Target, ChevronDown,
  ChevronRight, Download, Brain, BookOpen, Loader2, ExternalLink,
  FileSearch, Crosshair, TrendingUp, Lock
} from "lucide-react";
import { MITRE_TACTICS, getTacticColor, ALL_TECHNIQUES, TOTAL_TECHNIQUE_COUNT, type MitreTechnique } from "@/lib/mitre-attack-data";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Link } from "wouter";

interface CoverageEntry {
  count: number;
  lastSeen: string;
  tactic: string;
  technique: string;
  confidence: number;
  ruleCount: number;
}

type CoverageStatus = "high" | "partial" | "sigma" | "none";

function getCoverageStatus(entry: CoverageEntry | undefined): CoverageStatus {
  if (!entry) return "none";
  if (entry.count > 0) {
    const daysSince = entry.lastSeen ? (Date.now() - new Date(entry.lastSeen).getTime()) / 86400000 : 999;
    return daysSince <= 30 ? "high" : "partial";
  }
  if (entry.ruleCount > 0) return "sigma";
  return "none";
}

function coverageColor(status: CoverageStatus): string {
  switch (status) {
    case "high":    return "bg-emerald-500/80 border-emerald-400/50 hover:bg-emerald-500 text-white";
    case "partial": return "bg-emerald-800/50 border-emerald-700/40 hover:bg-emerald-800/70 text-emerald-100";
    case "sigma":   return "bg-amber-700/40 border-amber-600/30 hover:bg-amber-700/60 text-amber-100";
    case "none":    return "bg-red-950/60 border-red-900/30 hover:bg-red-900/50 dark:bg-red-950/40 text-red-300";
  }
}

function coverageLabel(status: CoverageStatus) {
  switch (status) {
    case "high":    return "Detected (recent)";
    case "partial": return "Detected (stale)";
    case "sigma":   return "Rule exists";
    case "none":    return "No Coverage";
  }
}

function coverageBadgeColor(status: CoverageStatus) {
  switch (status) {
    case "high":    return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
    case "partial": return "border-emerald-700/40 text-emerald-600 bg-emerald-700/10";
    case "sigma":   return "border-amber-500/40 text-amber-400 bg-amber-500/10";
    case "none":    return "border-red-600/40 text-red-400 bg-red-600/10";
  }
}

function TacticPills({ tacticCoverage }: { tacticCoverage: { tactic: { id: string; name: string; shortName: string }; detected: number; total: number; pct: number; sigmaOnly: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tacticCoverage.map(({ tactic, detected, total, pct, sigmaOnly }) => {
        const color = getTacticColor(tactic.name);
        const barColor = pct >= 50 ? "#10b981" : pct >= 20 ? "#f59e0b" : "#ef4444";
        return (
          <TooltipProvider key={tactic.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col rounded-lg border border-border dark:border-white/10 px-2.5 py-1.5 min-w-[80px] cursor-default"
                  style={{ background: `${color}08` }}>
                  <div className="text-[9px] font-semibold uppercase tracking-wide mb-1 truncate" style={{ color }}>{tactic.shortName}</div>
                  <div className="w-full bg-muted dark:bg-white/10 rounded-full h-1 mb-1">
                    <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="text-[9px] text-muted-foreground">{detected}/{total}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold" style={{ color }}>{tactic.name}</div>
                  <div>{detected} detected · {sigmaOnly} sigma-only · {total - detected - sigmaOnly} no coverage</div>
                  <div className="font-bold">{pct}% covered</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

function TechniqueDetailSheet({
  technique, entry, days, tenantId, open, onClose,
}: {
  technique: MitreTechnique | null;
  entry: CoverageEntry | undefined;
  days: string;
  tenantId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [recFetched, setRecFetched] = useState(false);

  const status = getCoverageStatus(entry);

  const incidentsQuery = useQuery({
    queryKey: ["/api/mitre/technique-incidents", tenantId, technique?.id, days],
    queryFn: async () => {
      const res = await fetch(`/api/mitre/technique-incidents?tenantId=${tenantId}&techniqueId=${technique?.id}&days=${days}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ incidents: any[]; sigmaRules: any[] }>;
    },
    enabled: open && !!technique && !!tenantId,
  });

  const recommendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mitre/recommend", {
        techniqueId: technique?.id,
        techniqueName: technique?.name,
        tactic: entry?.tactic || "",
        description: technique?.description,
        incidentCount: entry?.count || 0,
      });
      return res.json() as Promise<{ recommendation: string }>;
    },
  });

  if (!technique) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:w-[520px] overflow-y-auto">
        <SheetHeader className="pb-3 border-b border-border dark:border-white/10">
          <SheetTitle className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />
            <span className="font-mono text-primary">{technique.id}</span>
          </SheetTitle>
          <div>
            <h3 className="font-semibold text-base">{technique.name}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", coverageBadgeColor(status))}>
                {coverageLabel(status)}
              </Badge>
              {entry?.tactic && (
                <Badge variant="outline" className="text-xs">{entry.tactic}</Badge>
              )}
              <Badge variant="outline" className="text-xs">Rank #{technique.prevalenceRank}</Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" />Technique Description
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{technique.description}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 dark:bg-white/5 rounded-xl p-3 border border-border dark:border-white/10 text-center">
              <div className="text-2xl font-bold text-primary">{entry?.count || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Incidents</div>
            </div>
            <div className="bg-muted/30 dark:bg-white/5 rounded-xl p-3 border border-border dark:border-white/10 text-center">
              <div className="text-2xl font-bold text-amber-400">{entry?.ruleCount || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Sigma Rules</div>
            </div>
            <div className="bg-muted/30 dark:bg-white/5 rounded-xl p-3 border border-border dark:border-white/10 text-center">
              <div className="text-2xl font-bold text-cyan-400">{entry?.confidence || 0}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Avg Confidence</div>
            </div>
          </div>

          {entry?.lastSeen && (
            <div className="text-xs text-muted-foreground">
              Last detected: <span className="font-medium text-foreground">{new Date(entry.lastSeen).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
            </div>
          )}

          {incidentsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              {(incidentsQuery.data?.incidents || []).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Shield className="w-3 h-3" />Matching Incidents ({incidentsQuery.data?.incidents.length})
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {incidentsQuery.data?.incidents.map((inc: any) => (
                      <Link key={inc.id} href={`/incidents/${inc.id}/canvas`} onClick={onClose}>
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted/50 dark:hover:bg-white/10 cursor-pointer transition-colors text-xs">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: inc.severity === "critical" ? "#ef4444" : inc.severity === "high" ? "#f97316" : "#eab308" }} />
                          <span className="flex-1 truncate font-medium">{inc.title}</span>
                          <span className="text-muted-foreground shrink-0">{new Date(inc.created_at).toLocaleDateString()}</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {(incidentsQuery.data?.sigmaRules || []).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileSearch className="w-3 h-3" />Sigma Rules ({incidentsQuery.data?.sigmaRules.length})
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {incidentsQuery.data?.sigmaRules.map((rule: any) => (
                      <div key={rule.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-xs">
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{rule.title}</div>
                          <div className="text-muted-foreground">{rule.rule_id} · {rule.level} · {rule.match_count} matches</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {status === "none" && !entry?.ruleCount && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <div className="flex items-center gap-2 text-sm text-red-400 font-medium mb-1">
                <XCircle className="w-4 h-4" />No Detection Coverage
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No incidents or Sigma rules map to this technique. This is a blind spot. Consider adding detection logic for prevalence rank #{technique.prevalenceRank}.
              </p>
            </div>
          )}

          <div className="border-t border-border dark:border-white/10 pt-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Brain className="w-3 h-3" />AI Detection Recommendation
            </div>
            {recommendMutation.data ? (
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3">
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{recommendMutation.data.recommendation}</p>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 h-8 text-xs"
                disabled={recommendMutation.isPending}
                onClick={() => { if (!recFetched) { setRecFetched(true); recommendMutation.mutate(); } }}
                data-testid="button-ai-recommend"
              >
                {recommendMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing technique…</>
                ) : (
                  <><Brain className="w-3.5 h-3.5" />Generate AI Recommendation</>
                )}
              </Button>
            )}
            {recommendMutation.error && (
              <p className="text-xs text-red-400 mt-1.5">Failed to generate recommendation. Try again.</p>
            )}
          </div>

          {technique.subTechniques && technique.subTechniques.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Sub-techniques ({technique.subTechniques.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {technique.subTechniques.map(sub => (
                  <Badge key={sub.id} variant="outline" className="text-[10px] font-mono">{sub.id} · {sub.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function MitreCoveragePage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || 0;
  const [days, setDays] = useState("90");
  const [selectedTechnique, setSelectedTechnique] = useState<MitreTechnique | null>(null);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("matrix");
  const [gapSort, setGapSort] = useState<"prevalence" | "tactic">("prevalence");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/mitre/coverage", tenantId, days],
    queryFn: async () => {
      const res = await fetch(`/api/mitre/coverage?tenantId=${tenantId}&days=${days}`);
      return res.json() as Promise<{ covered: Record<string, CoverageEntry>; days: number }>;
    },
    enabled: !!tenantId,
  });

  const covered = data?.covered || {};

  const detectedIds = new Set(Object.entries(covered).filter(([, e]) => e.count > 0).map(([id]) => id));
  const sigmaOnlyIds = new Set(Object.entries(covered).filter(([, e]) => e.count === 0 && e.ruleCount > 0).map(([id]) => id));
  const coveredCount = detectedIds.size;
  const sigmaCount = sigmaOnlyIds.size;
  const coveragePercent = Math.round((coveredCount / TOTAL_TECHNIQUE_COUNT) * 100);

  const tacticCoverage = MITRE_TACTICS.map(t => {
    const total = t.techniques.length;
    const detected = t.techniques.filter(tech => detectedIds.has(tech.id)).length;
    const sigmaOnly = t.techniques.filter(tech => sigmaOnlyIds.has(tech.id)).length;
    return { tactic: t, detected, total, pct: Math.round((detected / total) * 100), sigmaOnly };
  });

  const gapTechniques = ALL_TECHNIQUES
    .filter(t => !detectedIds.has(t.id))
    .sort((a, b) => gapSort === "prevalence" ? a.prevalenceRank - b.prevalenceRank : a.prevalenceRank - b.prevalenceRank)
    .slice(0, 40);

  const pieData = [
    { name: "Detected (recent)", value: ALL_TECHNIQUES.filter(t => { const e = covered[t.id]; return e && e.count > 0 && getCoverageStatus(e) === "high"; }).length, color: "#10b981" },
    { name: "Detected (stale)", value: ALL_TECHNIQUES.filter(t => { const e = covered[t.id]; return e && e.count > 0 && getCoverageStatus(e) === "partial"; }).length, color: "#059669" },
    { name: "Sigma rule only", value: sigmaCount, color: "#d97706" },
    { name: "No Coverage", value: ALL_TECHNIQUES.filter(t => !covered[t.id]).length, color: "#7f1d1d" },
  ].filter(d => d.value > 0);

  function handleExport() {
    const rows = [["Technique ID", "Technique Name", "Tactic", "Coverage Status", "Incident Count", "Rule Count", "Last Seen", "Avg Confidence"]];
    for (const t of ALL_TECHNIQUES) {
      const entry = covered[t.id];
      const status = getCoverageStatus(entry);
      rows.push([
        t.id, t.name,
        entry?.tactic || "",
        coverageLabel(status),
        entry ? String(entry.count) : "0",
        entry ? String(entry.ruleCount) : "0",
        entry?.lastSeen ? new Date(entry.lastSeen).toLocaleDateString() : "",
        entry ? String(entry.confidence) + "%" : "",
      ]);
    }
    const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitre-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <PageHero
          icon={Shield}
          title="MITRE ATT&CK Coverage"
          description="Visualize detection coverage across the MITRE ATT&CK Enterprise matrix v14"
          badge="ATT&CK v14"
          stats={[
            { label: "Techniques Covered", value: `${coveredCount}/${TOTAL_TECHNIQUE_COUNT}` },
            { label: "Coverage", value: `${coveragePercent}%` },
            { label: "Sigma Rules Active", value: sigmaCount > 0 ? `+${sigmaCount}` : "—" },
            { label: "Window", value: `${days}d` },
          ]}
        />

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { color: "bg-emerald-500", label: "Detected (recent)" },
                { color: "bg-emerald-800/70", label: "Detected (stale)" },
                { color: "bg-amber-700/60", label: "Sigma rule only" },
                { color: "bg-red-950/80 border border-red-900/40", label: "No Coverage" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={cn("w-3 h-3 rounded-sm", color)} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-mitre-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-1.5 text-xs" data-testid="button-export-coverage">
                <Download className="w-3.5 h-3.5" />Export CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 space-y-3">
              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">Coverage Score</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {coveredCount} of {TOTAL_TECHNIQUE_COUNT} techniques with incident data · {sigmaCount} with Sigma rules only
                      </p>
                    </div>
                    <span className={cn("text-3xl font-bold tabular-nums", coveragePercent >= 50 ? "text-emerald-400" : coveragePercent >= 25 ? "text-amber-400" : "text-red-400")}>
                      {isLoading ? "—" : `${coveragePercent}%`}
                    </span>
                  </div>
                  <Progress value={coveragePercent} className="h-2 mt-2" />
                </CardHeader>
              </Card>

              <Card className="border-border dark:border-white/10">
                <CardContent className="p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Coverage by Tactic</div>
                  {isLoading ? (
                    <div className="flex gap-2 flex-wrap">
                      {Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-14 w-20" />)}
                    </div>
                  ) : (
                    <TacticPills tacticCoverage={tacticCoverage} />
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border dark:border-white/10">
              <CardContent className="p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Coverage Breakdown</div>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={58}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => [`${v} techniques`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="text-muted-foreground truncate flex-1">{d.name}</span>
                      <span className="font-semibold tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8">
              <TabsTrigger value="matrix" className="text-xs h-7">ATT&CK Matrix</TabsTrigger>
              <TabsTrigger value="tactics" className="text-xs h-7">By Tactic</TabsTrigger>
              <TabsTrigger value="gaps" className="text-xs h-7">
                Gap Analysis <span className="ml-1 rounded bg-red-500/20 text-red-400 px-1 text-[9px]">{gapTechniques.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="matrix" className="mt-3">
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-1.5 min-w-max">
                  {MITRE_TACTICS.map(tactic => {
                    const tc = tacticCoverage.find(t => t.tactic.id === tactic.id);
                    const tacticColor = getTacticColor(tactic.name);
                    return (
                      <div key={tactic.id} className="flex flex-col w-[130px] shrink-0">
                        <div
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-1.5 rounded-t-lg mb-1 text-center"
                          style={{
                            background: `${tacticColor}18`,
                            color: tacticColor,
                            borderBottom: `2px solid ${tacticColor}40`,
                          }}
                        >
                          {tactic.shortName}
                          {tc && (
                            <div className="text-[8px] font-normal opacity-60 mt-0.5">
                              {tc.detected}/{tc.total} · {tc.pct}%
                            </div>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          {isLoading
                            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded" />)
                            : tactic.techniques.map(tech => {
                              const entry = covered[tech.id];
                              const status = getCoverageStatus(entry);
                              const hasSubs = (tech.subTechniques?.length || 0) > 0;
                              const isExpanded = expandedSubs.has(tech.id);
                              return (
                                <div key={tech.id}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          "text-[9px] px-1.5 py-1.5 rounded border cursor-pointer transition-all duration-150 relative",
                                          coverageColor(status)
                                        )}
                                        onClick={() => setSelectedTechnique(tech)}
                                        data-testid={`mitre-cell-${tech.id}`}
                                      >
                                        <div className="flex items-start gap-1">
                                          {hasSubs && (
                                            <button
                                              className="shrink-0 mt-0.5 opacity-70 hover:opacity-100"
                                              onClick={e => {
                                                e.stopPropagation();
                                                setExpandedSubs(prev => {
                                                  const n = new Set(prev);
                                                  n.has(tech.id) ? n.delete(tech.id) : n.add(tech.id);
                                                  return n;
                                                });
                                              }}
                                            >
                                              {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                            </button>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="truncate font-medium leading-tight">{tech.name}</div>
                                            <div className="flex items-center justify-between mt-0.5 opacity-70">
                                              <span>{tech.id}</span>
                                              {entry?.ruleCount ? <span>{entry.ruleCount}σ</span> : null}
                                            </div>
                                          </div>
                                        </div>
                                        {entry?.count ? (
                                          <div className="absolute top-0.5 right-0.5 text-[8px] font-bold opacity-80">
                                            {entry.count}
                                          </div>
                                        ) : null}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[220px]">
                                      <div className="space-y-1 text-xs">
                                        <div className="font-semibold">{tech.id} · {tech.name}</div>
                                        <div className="text-muted-foreground">{tech.description.slice(0, 100)}…</div>
                                        <div className="flex gap-3 pt-1 border-t border-border">
                                          <div><span className="text-muted-foreground">Incidents: </span><span className="font-medium">{entry?.count || 0}</span></div>
                                          <div><span className="text-muted-foreground">Rules: </span><span className="font-medium">{entry?.ruleCount || 0}</span></div>
                                        </div>
                                        {entry?.lastSeen && (
                                          <div className="text-muted-foreground">Last seen: {new Date(entry.lastSeen).toLocaleDateString()}</div>
                                        )}
                                        <div className={cn("text-[10px] font-semibold", coverageBadgeColor(status))}>{coverageLabel(status)}</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>

                                  {hasSubs && isExpanded && tech.subTechniques?.map(sub => {
                                    const subEntry = covered[sub.id];
                                    const subStatus = getCoverageStatus(subEntry);
                                    return (
                                      <Tooltip key={sub.id}>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={cn("text-[9px] px-1.5 py-1 rounded border cursor-pointer ml-3 mt-0.5 transition-all duration-150",
                                              coverageColor(subStatus))}
                                            onClick={() => setSelectedTechnique({ ...tech, id: sub.id, name: sub.name })}
                                            data-testid={`mitre-cell-${sub.id}`}
                                          >
                                            <div className="truncate">{sub.name}</div>
                                            <div className="opacity-70">{sub.id}</div>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                          <div className="text-xs">
                                            <div className="font-semibold">{sub.id} · {sub.name}</div>
                                            <div>Incidents: {subEntry?.count || 0} · Rules: {subEntry?.ruleCount || 0}</div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tactics" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {tacticCoverage.map(({ tactic, detected, total, pct, sigmaOnly }) => {
                  const color = getTacticColor(tactic.name);
                  return (
                    <Card key={tactic.id} className="border-border dark:border-white/10">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-semibold text-sm" style={{ color }}>{tactic.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{detected} detected · {sigmaOnly} sigma · {total - detected - sigmaOnly} blind</div>
                          </div>
                          <span className={cn("text-xl font-bold tabular-nums", pct >= 50 ? "text-emerald-400" : pct >= 20 ? "text-amber-400" : "text-red-400")}>
                            {pct}%
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="mt-2 flex flex-col gap-0.5">
                          {tactic.techniques.slice(0, 4).map(tech => {
                            const entry = covered[tech.id];
                            const s = getCoverageStatus(entry);
                            return (
                              <div key={tech.id} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-muted/30 rounded px-1 py-0.5"
                                onClick={() => setSelectedTechnique(tech)}>
                                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", s === "high" ? "bg-emerald-400" : s === "partial" ? "bg-emerald-700" : s === "sigma" ? "bg-amber-500" : "bg-red-800")} />
                                <span className="truncate text-muted-foreground">{tech.name}</span>
                              </div>
                            );
                          })}
                          {tactic.techniques.length > 4 && (
                            <div className="text-[10px] text-muted-foreground pl-2.5">+{tactic.techniques.length - 4} more techniques</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="gaps" className="mt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  {gapTechniques.length} highest-priority uncovered techniques, ranked by prevalence in the wild.
                </p>
                <Select value={gapSort} onValueChange={(v) => setGapSort(v as typeof gapSort)}>
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prevalence">By Prevalence</SelectItem>
                    <SelectItem value="tactic">By Tactic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Card className="border-border dark:border-white/10">
                <CardContent className="p-0">
                  <div className="divide-y divide-border dark:divide-white/5">
                    {gapTechniques.map((tech, i) => {
                      const entry = covered[tech.id];
                      const hasSigma = (entry?.ruleCount || 0) > 0;
                      return (
                        <div
                          key={tech.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => { setSelectedTechnique(tech); }}
                          data-testid={`gap-technique-${i}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-muted/50 dark:bg-white/5 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                            {tech.prevalenceRank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{tech.id}</span>
                              <span className="font-medium text-sm">{tech.name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{tech.description.slice(0, 90)}…</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasSigma ? (
                              <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
                                {entry?.ruleCount} Sigma rule{(entry?.ruleCount || 0) > 1 ? "s" : ""}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400">No Coverage</Badge>
                            )}
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1"
                              onClick={e => { e.stopPropagation(); setSelectedTechnique(tech); }}>
                              <TrendingUp className="w-3 h-3" />Details
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {gapTechniques.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        <p className="text-sm">Excellent! All high-priority techniques have coverage.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <TechniqueDetailSheet
          technique={selectedTechnique}
          entry={selectedTechnique ? covered[selectedTechnique.id] : undefined}
          days={days}
          tenantId={tenantId}
          open={!!selectedTechnique}
          onClose={() => setSelectedTechnique(null)}
        />
      </div>
    </TooltipProvider>
  );
}
