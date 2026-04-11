import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import {
  Server, Users, Globe, Mail, Search, Shield, Activity, AlertTriangle,
  TrendingUp, Target, Zap, BarChart3, ChevronRight, Loader2,
  ArrowUpDown, Filter, X, Brain, CheckCircle, ArrowUpRight, Users2, Clock,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend, AreaChart, Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const RISK_COLORS: Record<string, string> = {
  severe: "#9333ea",
  critical: "#ef4444",
  high: "#f97316",
  moderate: "#eab308",
  low: "#22c55e",
};

const RISK_BADGE_CLASSES: Record<string, string> = {
  severe: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  moderate: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

const ENTITY_TABS = [
  { id: "devices", label: "Devices", icon: Server },
  { id: "users", label: "Users", icon: Users },
  { id: "ips", label: "IPs", icon: Globe },
  { id: "domains", label: "Domains", icon: Mail },
] as const;

type EntityType = typeof ENTITY_TABS[number]["id"];

function RiskGauge({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 81 ? "#9333ea" : score >= 61 ? "#ef4444" : score >= 41 ? "#f97316" : score >= 21 ? "#eab308" : "#22c55e";

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }} data-testid="risk-gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 8 ${size / 2 + 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 2}`}
          fill="none" stroke="currentColor" strokeWidth="8"
          className="text-muted/30" strokeLinecap="round"
        />
        <path
          d={`M 8 ${size / 2 + 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 2}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="text-2xl font-bold" style={{ color }} data-testid="text-risk-score-value">{score}</span>
      </div>
    </div>
  );
}

function EntityListSkeleton() {
  return (
    <div className="space-y-4" data-testid="behavior-analytics-loading">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96" />
    </div>
  );
}

function RankedAnomaliesPanel({ tenantId, entityType, onSelect }: { tenantId: number; entityType: EntityType; onSelect: (e: any) => void }) {
  const { data: rankedData, isLoading } = useQuery<any>({
    queryKey: ["/api/behavior-analytics", tenantId, entityType, "ranked"],
    queryFn: () => fetch(`/api/behavior-analytics/${tenantId}/${entityType}/ranked?limit=10`).then(r => r.ok ? r.json() : { anomalies: [], peerCohort: null }),
    staleTime: 2 * 60 * 1000,
    enabled: !!tenantId,
  });

  if (isLoading) return <div className="rounded-lg border p-3 text-xs text-muted-foreground animate-pulse h-24" />;
  const anomalies: any[] = rankedData?.anomalies || [];
  const peerCohort = rankedData?.peerCohort;
  if (anomalies.length === 0) return null;

  const RISK_CLR: Record<string, string> = { severe: "#a855f7", critical: "#ef4444", high: "#f97316", moderate: "#eab308", low: "#22c55e" };

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="ranked-anomalies-panel">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">ML Composite Ranking — Top Anomalies</h3>
        <Badge variant="outline" className="text-[9px] text-primary border-primary/40 ml-auto">Severity × Confidence × Recency</Badge>
      </div>
      {peerCohort && (
        <p className="text-[10px] text-muted-foreground mb-3">
          Peer cohort: {peerCohort.description} — {peerCohort.size} anomalies in scope
        </p>
      )}
      <div className="space-y-1.5">
        {anomalies.slice(0, 8).map((r: any) => (
          <div
            key={r.entityName}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 transition-colors"
            onClick={() => onSelect({ name: r.entityName, riskLevel: r.riskLevel, eventCount: 0 })}
            data-testid={`ranked-anomaly-${r.rank}`}
          >
            <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">#{r.rank}</span>
            <span className="text-xs font-medium flex-1 truncate">{r.entityName}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold" style={{ color: RISK_CLR[r.riskLevel] || "#888" }}>
                {r.riskLevel?.toUpperCase()}
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0" data-testid={`composite-score-${r.rank}`}>
                {r.compositeRankScore}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskDistributionChart({ entities }: { entities: any[] }) {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = { severe: 0, critical: 0, high: 0, moderate: 0, low: 0 };
    for (const e of entities) {
      const level = e.riskLevel || "low";
      if (counts[level] !== undefined) counts[level]++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, fill: RISK_COLORS[name] || "#94a3b8" }));
  }, [entities]);

  if (distribution.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Risk Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={distribution} dataKey="value" nameKey="name"
              cx="50%" cy="50%" outerRadius={70} innerRadius={40}
              paddingAngle={2}
            >
              {distribution.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          {distribution.map(d => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span>{d.name}: {d.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopRiskiestEntities({ entities, entityType, onSelect }: { entities: any[]; entityType: EntityType; onSelect: (e: any) => void }) {
  const top10 = useMemo(() =>
    [...entities].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 10),
    [entities]
  );

  if (top10.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="w-4 h-4" />
          Top 10 Riskiest Entities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top10.map((entity, i) => {
          const color = RISK_COLORS[entity.riskLevel] || RISK_COLORS.low;
          return (
            <button
              key={entity.name}
              onClick={() => onSelect(entity)}
              className="w-full flex items-center gap-3 rounded-md p-2 text-left hover-elevate"
              data-testid={`top-entity-${i}`}
            >
              <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{entity.name}</p>
                <p className="text-[10px] text-muted-foreground">{entity.eventCount} events</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-16">
                  <Progress value={entity.riskScore || 0} className="h-1.5" />
                </div>
                <span className="text-xs font-bold w-7 text-right" style={{ color }}>{entity.riskScore}</span>
              </div>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SummaryCards({ entities }: { entities: any[] }) {
  const total = entities.length;
  const severeOrCritical = entities.filter(e => e.riskLevel === "severe" || e.riskLevel === "critical").length;
  const high = entities.filter(e => e.riskLevel === "high").length;
  const avgScore = total > 0 ? Math.round(entities.reduce((s, e) => s + (e.riskScore || 0), 0) / total) : 0;
  const totalEvents = entities.reduce((s, e) => s + (e.eventCount || 0), 0);

  const cards = [
    { label: "Total Entities", value: total, icon: Shield },
    { label: "Critical / Severe", value: severeOrCritical, icon: AlertTriangle, color: severeOrCritical > 0 ? "text-red-500" : undefined },
    { label: "High Risk", value: high, icon: TrendingUp, color: high > 0 ? "text-orange-500" : undefined },
    { label: "Avg Risk Score", value: avgScore, icon: Zap },
    { label: "Total Events", value: totalEvents.toLocaleString(), icon: Activity },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</span>
            </div>
            <div className={`text-xl font-bold ${c.color || ""}`} data-testid={`text-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
              {c.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EntityTable({ entities, entityType, onSelect }: { entities: any[]; entityType: EntityType; onSelect: (e: any) => void }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = entities;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name?.toLowerCase().includes(q));
    }
    if (riskFilter !== "all") {
      list = list.filter(e => e.riskLevel === riskFilter);
    }
    list = [...list].sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [entities, search, sortBy, sortDir, riskFilter]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold">Entity List</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 w-48 text-xs"
                data-testid="input-entity-search"
              />
            </div>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-32 h-9 text-xs" data-testid="select-risk-filter">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="All Risks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            {(search || riskFilter !== "all") && (
              <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setRiskFilter("all"); }} data-testid="button-clear-filters">
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("name")}>
                  <span className="flex items-center gap-1">Entity Name <ArrowUpDown className="w-3 h-3" /></span>
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("riskScore")}>
                  <span className="flex items-center gap-1">Risk Score <ArrowUpDown className="w-3 h-3" /></span>
                </TableHead>
                <TableHead className="text-xs">Risk Level</TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("mlConfidenceScore")}>
                  <span className="flex items-center gap-1">ML Confidence <ArrowUpDown className="w-3 h-3" /></span>
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("eventCount")}>
                  <span className="flex items-center gap-1">Events <ArrowUpDown className="w-3 h-3" /></span>
                </TableHead>
                <TableHead className="text-xs">Last Activity</TableHead>
                <TableHead className="text-xs">Top Threat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No entities found
                  </TableCell>
                </TableRow>
              ) : filtered.slice(0, 100).map((entity, i) => {
                const color = RISK_COLORS[entity.riskLevel] || RISK_COLORS.low;
                return (
                  <TableRow
                    key={entity.name}
                    className="cursor-pointer hover-elevate"
                    onClick={() => onSelect(entity)}
                    data-testid={`row-entity-${i}`}
                  >
                    <TableCell className="text-xs font-medium max-w-[200px] truncate">{entity.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20">
                          <Progress value={entity.riskScore || 0} className="h-1.5" />
                        </div>
                        <span className="text-xs font-bold w-7" style={{ color }}>{entity.riskScore}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] ${RISK_BADGE_CLASSES[entity.riskLevel] || ""}`} data-testid={`badge-risk-${i}`}>
                        {entity.riskLevel?.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entity.mlConfidenceScore != null ? (
                        <div className="flex items-center gap-1">
                          <div className="w-14">
                            <Progress
                              value={entity.mlConfidenceScore}
                              className="h-1.5"
                              style={{ ["--progress-color" as string]: entity.mlConfidenceScore >= 70 ? "#ef4444" : entity.mlConfidenceScore >= 40 ? "#f97316" : "#22c55e" }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground">{entity.mlConfidenceScore}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{entity.eventCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entity.lastActivity || "N/A"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{entity.topThreat || "N/A"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 100 && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">Showing 100 of {filtered.length} entities</p>
        )}
      </CardContent>
    </Card>
  );
}

const DIMENSION_SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-muted/50 text-muted-foreground border-border",
};

function MLConfidencePanel({ mlData, tenantId, entityType, entityName, isMSS, onActionComplete }: {
  mlData: any;
  tenantId: number;
  entityType: string;
  entityName: string;
  isMSS: boolean;
  onActionComplete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch real per-day sparkline data for this entity
  const { data: sparklineData } = useQuery<any>({
    queryKey: ["/api/behavior-analytics", tenantId, entityType, entityName, "sparklines"],
    queryFn: () => fetch(`/api/behavior-analytics/${tenantId}/${entityType}/${encodeURIComponent(entityName)}/sparklines`).then(r => r.ok ? r.json() : { days: [] }),
    staleTime: 5 * 60 * 1000,
    enabled: !!tenantId && !!entityType && !!entityName,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      if (!mlData?.anomalyId) return;
      return apiRequest("PATCH", `/api/behavior-analytics/${tenantId}/anomaly/${mlData.anomalyId}`, { [field]: value });
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Anomaly status updated" });
      onActionComplete();
    },
    onError: () => toast({ title: "Error", description: "Failed to update anomaly", variant: "destructive" }),
  });

  const confidence = mlData?.confidenceScore ?? 0;
  const riskLevel = mlData?.riskLevel ?? "low";
  const color = RISK_COLORS[riskLevel] || RISK_COLORS.low;

  return (
    <div className="space-y-4">
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-500" />
            ML Confidence Score
            <Badge variant="outline" className="ml-auto text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              UEBA 2.0
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(confidence / 100) * 201} 201`}
                  style={{ transition: "stroke-dasharray 1s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold" style={{ color }} data-testid="text-ml-confidence">{confidence}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`text-[10px] ${
                  riskLevel === "severe" ? "bg-purple-500 text-white" :
                  riskLevel === "critical" ? "bg-red-500 text-white" :
                  riskLevel === "high" ? "bg-orange-500 text-white" :
                  riskLevel === "moderate" ? "bg-yellow-500 text-white" : "bg-green-500 text-white"
                }`} data-testid="badge-ml-risk-level">
                  {riskLevel.toUpperCase()}
                </Badge>
                {mlData?.markedExpected && (
                  <Badge variant="outline" className="text-[9px] text-green-600 border-green-500/20">
                    <CheckCircle className="w-2.5 h-2.5 mr-1" /> Expected
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {mlData?.triggeredDimensions?.length || 0} of 15 behavioral dimensions triggered
              </p>
              {mlData?.temporalAnomalies?.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-yellow-500" />
                  <p className="text-[10px] text-yellow-600 dark:text-yellow-400">
                    {mlData.temporalAnomalies[0].description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {isMSS && mlData?.anomalyId && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-[11px] text-green-600 border-green-500/30 hover:bg-green-500/10"
                onClick={() => actionMutation.mutate({ field: "markedExpected", value: !mlData.markedExpected })}
                disabled={actionMutation.isPending}
                data-testid="button-mark-expected"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                {mlData.markedExpected ? "Unmark Expected" : "Mark Expected"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-[11px] text-red-600 border-red-500/30 hover:bg-red-500/10"
                onClick={() => actionMutation.mutate({ field: "escalatedToIncident", value: !mlData.escalatedToIncident })}
                disabled={actionMutation.isPending}
                data-testid="button-escalate-incident"
              >
                <ArrowUpRight className="w-3 h-3 mr-1" />
                {mlData.escalatedToIncident ? "Deescalate" : "Escalate to Incident"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {mlData?.triggeredDimensions?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              Triggered Dimensions ({mlData.triggeredDimensions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5 mb-3" data-testid="dimension-chips">
              {mlData.triggeredDimensions.map((d: any, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-[10px] ${DIMENSION_SEVERITY_CLASSES[d.severity] || ""}`}
                  data-testid={`chip-dimension-${i}`}
                >
                  {d.label}
                  <span className="ml-1 font-mono opacity-70">z={d.zScore > 0 ? "+" : ""}{d.zScore}</span>
                </Badge>
              ))}
            </div>
            {mlData.triggeredDimensions.length > 5 && (
              <p className="text-[10px] text-muted-foreground mb-2">
                Showing top 5 of {mlData.triggeredDimensions.length} triggered dimensions
              </p>
            )}
            <div className="space-y-3">
              {mlData.triggeredDimensions.slice(0, 5).map((d: any, i: number) => {
                // Complete 15-dimension field map from API sparkline payload
                const dimFieldMap: Record<string, string> = {
                  eventVolume: "totalEvents",
                  criticalEventRate: "criticalEvents",
                  offHoursActivity: "offHoursEvents",
                  privilegeEvents: "privilegeEvents",
                  lateralMovement: "lateralEvents",
                  failedAuthRate: "failedAuthEvents",
                  distinctEventTypes: "distinctEventTypes",
                  distinctLogSources: "distinctLogSources",
                  distinctTactics: "distinctTactics",
                  dataEgressVolume: "dataEgressVolume",
                  geoVariety: "geoVariety",
                  newResourceAccess: "newResourceAccess",
                  // loginDayVariance, temporalPatternDeviation, peerDeviation
                  // are statistical — fall back to totalEvents for sparkline shape
                  loginDayVariance: "totalEvents",
                  temporalPatternDeviation: "totalEvents",
                  peerDeviation: "totalEvents",
                };
                const sparkField = dimFieldMap[d.key] || "totalEvents";
                const days: any[] = sparklineData?.days || [];
                // Use real per-day data if available, otherwise fall back to 2-point baseline/current line
                const sparkData = days.length >= 2
                  ? days.map((day: any) => ({ v: day[sparkField] || 0, base: sparklineData?.peerDailyAvg?.[sparkField] || 0 }))
                  : [{ v: parseFloat(d.baseline) || 0, base: parseFloat(d.baseline) || 0 }, { v: parseFloat(d.value) || 0, base: parseFloat(d.baseline) || 0 }];
                const dimColor = d.severity === "critical" ? "#ef4444" : d.severity === "high" ? "#f97316" : "#f59e0b";
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium truncate flex-1">{d.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        z={d.zScore > 0 ? "+" : ""}{d.zScore}σ
                      </span>
                      <span className="text-[10px] font-bold w-12 text-right" style={{ color: dimColor }}>
                        {d.percentile}%ile
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Progress value={d.percentile} className="h-1" />
                      </div>
                      <div className="w-16 h-6 shrink-0" data-testid={`sparkline-dim-${i}`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sparkData} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
                            <defs>
                              <linearGradient id={`sparkGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={dimColor} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={dimColor} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="v" stroke={dimColor} strokeWidth={1.5} fill={`url(#sparkGrad${i})`} dot={false} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {mlData?.behavioralFingerprint?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
              Behavioral Fingerprint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={mlData.behavioralFingerprint} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <PolarGrid className="opacity-30" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 8 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} tickCount={3} />
                <Radar name="Current" dataKey="current" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} strokeWidth={2} />
                <Radar name="Normal" dataKey="normal" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={1.5} strokeDasharray="4 2" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-center text-muted-foreground mt-1">
              Red = current behavior · Green = normal baseline
            </p>
          </CardContent>
        </Card>
      )}

      {mlData?.peerComparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Users2 className="w-3.5 h-3.5 text-cyan-500" />
              Peer Group Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3 p-2 rounded-md bg-muted/40">
              <div className="text-center">
                <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400" data-testid="text-peer-rank">
                  {mlData.peerComparison.overallPeerRank}%
                </p>
                <p className="text-[10px] text-muted-foreground">Peer Rank</p>
              </div>
              <div className="flex-1">
                <Progress value={mlData.peerComparison.overallPeerRank} className="h-2" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">{mlData.peerComparison.peerGroupSize}</p>
                <p className="text-[10px] text-muted-foreground">Peer Size</p>
              </div>
            </div>
            {mlData.peerComparison.deviations?.length > 0 ? (
              <div className="space-y-2" data-testid="peer-deviations">
                {mlData.peerComparison.deviations.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded-md bg-muted/30" data-testid={`peer-deviation-${i}`}>
                    <ArrowUpRight className={`w-3 h-3 shrink-0 ${d.direction === "above" ? "text-red-500" : "text-green-500"}`} />
                    <span className="font-medium truncate flex-1">{d.dimension}</span>
                    <span className={`shrink-0 font-bold ${d.direction === "above" && d.multiplier > 2 ? "text-red-500" : "text-muted-foreground"}`}>
                      {d.description}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center py-2">Behavior is within peer norms</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EntityDetailPanel({ entity, tenantId, entityType, onClose, isMSS }: {
  entity: any;
  tenantId: number;
  entityType: EntityType;
  onClose: () => void;
  isMSS: boolean;
}) {
  const fmt = useTenantDateFormatter();
  const queryClient = useQueryClient();

  const riskEntityType = entityType === "devices" ? "host" : entityType === "users" ? "user" : entityType === "domains" ? "domain" : null;

  const { data: riskData, isLoading: riskLoading } = useQuery<any>({
    queryKey: ["/api/entity-risk", tenantId, riskEntityType, entity.name],
    queryFn: async () => {
      const res = await fetch(`/api/entity-risk/${tenantId}/${riskEntityType}/${encodeURIComponent(entity.name)}`);
      if (!res.ok) throw new Error("Failed to fetch risk score");
      return res.json();
    },
    enabled: !!riskEntityType,
    staleTime: 60000,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/behavior-analytics", tenantId, entityType, entity.name],
    queryFn: async () => {
      const res = await fetch(`/api/behavior-analytics/${tenantId}/${entityType}/${encodeURIComponent(entity.name)}`);
      if (!res.ok) throw new Error("Failed to fetch detail");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: mlData, isLoading: mlLoading, refetch: refetchML } = useQuery<any>({
    queryKey: ["/api/behavior-analytics/ml", tenantId, entityType, entity.name],
    queryFn: async () => {
      const res = await fetch(`/api/behavior-analytics/${tenantId}/${entityType}/${encodeURIComponent(entity.name)}/ml`);
      if (!res.ok) throw new Error("Failed to fetch ML data");
      return res.json();
    },
    staleTime: 120000,
  });

  const isLoading = riskLoading || detailLoading;

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="entity-detail-panel">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            {entityType === "devices" ? <Server className="w-4 h-4" /> :
             entityType === "users" ? <Users className="w-4 h-4" /> :
             entityType === "ips" ? <Globe className="w-4 h-4" /> :
             <Mail className="w-4 h-4" />}
            {entity.name}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {(riskData || entity) && (
              <>
                <div className="flex items-center gap-4">
                  <RiskGauge score={riskData?.overallScore ?? entity.riskScore ?? 0} size={100} />
                  <div>
                    <Badge className={`${
                      (riskData?.riskLevel || entity.riskLevel) === "severe" ? "bg-purple-500" :
                      (riskData?.riskLevel || entity.riskLevel) === "critical" ? "bg-red-500" :
                      (riskData?.riskLevel || entity.riskLevel) === "high" ? "bg-orange-500" :
                      (riskData?.riskLevel || entity.riskLevel) === "moderate" ? "bg-yellow-500" : "bg-green-500"
                    } text-white text-xs`} data-testid="badge-detail-risk">
                      {(riskData?.riskLevel || entity.riskLevel)?.toUpperCase()}
                    </Badge>
                    {riskData?.correlationMultiplier > 1 && (
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-500" />
                        Correlation: {riskData.correlationMultiplier}x
                      </div>
                    )}
                  </div>
                </div>

                {riskData?.topFactors?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-2">
                        <Target className="w-3.5 h-3.5" /> Factor Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {riskData.topFactors.map((f: any, i: number) => (
                        <div key={i} className="space-y-1" data-testid={`detail-factor-${i}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate flex-1">{f.name}</span>
                            <span className="text-[11px] font-bold w-8 text-right">{f.percentage}%</span>
                          </div>
                          <Progress value={f.percentage} className="h-1.5" />
                          <p className="text-[10px] text-muted-foreground">{f.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {riskData?.historicalTrend?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" /> Behavior Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={riskData.historicalTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {riskData?.categoryBreakdown?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold flex items-center gap-2">
                        <BarChart3 className="w-3.5 h-3.5" /> Category Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {riskData.categoryBreakdown.map((cat: any, i: number) => (
                        <div key={i} className="space-y-1" data-testid={`detail-category-${i}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium">{cat.category}</span>
                            <span className="text-[11px] font-bold">{cat.percentage}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                cat.percentage >= 70 ? "bg-red-500" :
                                cat.percentage >= 40 ? "bg-orange-500" :
                                cat.percentage >= 20 ? "bg-yellow-500" : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(100, cat.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {mlLoading ? (
              <Skeleton className="h-48" />
            ) : mlData ? (
              <MLConfidencePanel
                mlData={mlData}
                tenantId={tenantId}
                entityType={entityType}
                entityName={entity.name || ""}
                isMSS={isMSS}
                onActionComplete={() => refetchML()}
              />
            ) : null}

            {detailData?.recentEvents?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" /> Recent Activity ({detailData.recentEvents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {detailData.recentEvents.map((evt: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] p-2 rounded-md bg-muted/40" data-testid={`activity-event-${i}`}>
                        <Badge variant="outline" className={`text-[9px] shrink-0 ${
                          evt.severity === "critical" ? "text-red-500 border-red-200" :
                          evt.severity === "high" ? "text-orange-500 border-orange-200" :
                          evt.severity === "medium" ? "text-yellow-600 border-yellow-200" :
                          "text-blue-500 border-blue-200"
                        }`}>
                          {evt.severity}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{evt.title || evt.event_type}</p>
                          <p className="text-muted-foreground">{evt.occurred_at ? fmt.formatDate(evt.occurred_at) : "N/A"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {detailData?.relatedEntities?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Related Entities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {detailData.relatedEntities.map((re: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`related-entity-${i}`}>
                        {re.type}: {re.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {detailData?.mitreTactics?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> MITRE ATT&CK Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {detailData.mitreTactics.map((t: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]" data-testid={`mitre-tactic-${i}`}>
                        {t}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {detailData?.anomalies?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> Anomaly Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {detailData.anomalies.map((a: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/10" data-testid={`anomaly-${i}`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] font-medium">{a.title}</p>
                          <p className="text-[10px] text-muted-foreground">{a.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function BehaviorAnalyticsPage() {
  const { currentTenant, isMSS } = useTenant();
  const tenantId = currentTenant?.id;
  const [activeTab, setActiveTab] = useState<EntityType>("devices");
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const dashboardRef = useDashboardExportRef();

  const { data: entities, isLoading } = useQuery<any[]>({
    queryKey: ["/api/behavior-analytics", tenantId, activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/behavior-analytics/${tenantId}/${activeTab}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 60000,
  });

  const entityList = entities || [];

  return (
    <div className="p-6 space-y-4" data-testid="behavior-analytics-page" ref={dashboardRef}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Behavior Analytics</h1>
          <p className="text-sm text-muted-foreground">User & Entity Behavior Analytics (UEBA 2.0) — ML-powered statistical anomaly detection</p>
        </div>
        <DashboardExportBar dashboardTitle="Behavior Analytics" containerRef={dashboardRef} />
      </div>

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as EntityType); setSelectedEntity(null); }}>
        <TabsList data-testid="tabs-entity-type">
          {ENTITY_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} data-testid={`tab-${tab.id}`}>
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ENTITY_TABS.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            {isLoading ? (
              <EntityListSkeleton />
            ) : (
              <div className="space-y-4">
                <SummaryCards entities={entityList} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <RiskDistributionChart entities={entityList} />
                  <TopRiskiestEntities entities={entityList} entityType={activeTab} onSelect={setSelectedEntity} />
                  {tenantId && <RankedAnomaliesPanel tenantId={tenantId} entityType={activeTab} onSelect={setSelectedEntity} />}
                </div>

                <EntityTable entities={entityList} entityType={activeTab} onSelect={setSelectedEntity} />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selectedEntity && tenantId && (
        <EntityDetailPanel
          entity={selectedEntity}
          tenantId={tenantId}
          entityType={activeTab}
          onClose={() => setSelectedEntity(null)}
          isMSS={isMSS}
        />
      )}
    </div>
  );
}
