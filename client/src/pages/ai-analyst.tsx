import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
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
  Activity,
  Monitor,
  Globe,
  Mail,
  Network,
  Cloud,
  Fingerprint,
  Search,
  Play,
  ArrowUpCircle,
  TrendingUp,
  Eye,
  BarChart3,
  ShieldCheck,
  ShieldX,
  ShieldQuestion,
  RotateCcw,
  Layers,
  ChevronDown,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DOMAIN_CONFIG: Record<string, { icon: any; color: string; gradient: string; glowColor: string }> = {
  "Endpoint": { icon: Monitor, color: "text-blue-500", gradient: "from-blue-500/20 to-blue-600/5", glowColor: "shadow-blue-500/20" },
  "Email": { icon: Mail, color: "text-cyan-500", gradient: "from-cyan-500/20 to-cyan-600/5", glowColor: "shadow-cyan-500/20" },
  "Network": { icon: Network, color: "text-purple-500", gradient: "from-purple-500/20 to-purple-600/5", glowColor: "shadow-purple-500/20" },
  "Web App": { icon: Globe, color: "text-orange-500", gradient: "from-orange-500/20 to-orange-600/5", glowColor: "shadow-orange-500/20" },
  "Cloud": { icon: Cloud, color: "text-emerald-500", gradient: "from-emerald-500/20 to-emerald-600/5", glowColor: "shadow-emerald-500/20" },
  "Identity": { icon: Fingerprint, color: "text-rose-500", gradient: "from-rose-500/20 to-rose-600/5", glowColor: "shadow-rose-500/20" },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-white",
  low: "bg-blue-500 text-white",
};

const VERDICT_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  true_positive: { icon: ShieldX, color: "text-red-500", bg: "bg-red-500/10", label: "True Positive" },
  false_positive: { icon: ShieldCheck, color: "text-green-500", bg: "bg-green-500/10", label: "False Positive" },
  inconclusive: { icon: ShieldQuestion, color: "text-amber-500", bg: "bg-amber-500/10", label: "Inconclusive" },
};

function CircularProgress({ value, size = 48, stroke = 4, color = "stroke-blue-500" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/40" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
        className={`${color} animate-ring-fill`}
        style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
    </svg>
  );
}

function normalizeInvTitle(title: string): string {
  return title
    .replace(/\b[0-9a-fA-F]{8,}\b/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractDomainFromInvTitle(title: string): string | null {
  const match = title.match(/from\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  return match ? match[1] : null;
}

function generateInvClusterTitle(investigations: any[]): { title: string; summary: string } {
  const first = investigations[0];
  const incTitle = (first.incident_title || "").toLowerCase();
  const count = investigations.length;
  const domain = extractDomainFromInvTitle(first.incident_title || "");

  if (incTitle.includes("phishing") || incTitle.includes("email") || incTitle.includes("spam") || incTitle.includes("mail")) {
    const domainPart = domain ? ` - ${domain}` : "";
    const verdicts = investigations.reduce((acc: Record<string, number>, inv: any) => {
      const v = inv.verdict || "pending";
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
    const verdictParts: string[] = [];
    if (verdicts.true_positive) verdictParts.push(`${verdicts.true_positive} TP`);
    if (verdicts.false_positive) verdictParts.push(`${verdicts.false_positive} FP`);
    if (verdicts.inconclusive) verdictParts.push(`${verdicts.inconclusive} Inconclusive`);
    return {
      title: `Phishing Campaign${domainPart} (${count} investigations)`,
      summary: verdictParts.length > 0 ? verdictParts.join(", ") : `${count} investigations`,
    };
  }

  if (incTitle.includes("malware") || incTitle.includes("trojan") || incTitle.includes("ransomware") || incTitle.includes("virus")) {
    return {
      title: `Malware Investigation Cluster (${count} investigations)`,
      summary: `${count} related malware detections analyzed`,
    };
  }

  if (incTitle.includes("brute force") || incTitle.includes("login") || incTitle.includes("authentication")) {
    return {
      title: `Brute Force / Auth Attack Cluster (${count} investigations)`,
      summary: `${count} related authentication events analyzed`,
    };
  }

  const category = first.attack_type || first.incident_category || "Security";
  return {
    title: `${category} Investigation Cluster (${count} investigations)`,
    summary: `${count} related investigations`,
  };
}

interface InvCluster {
  id: string;
  investigations: any[];
  isCluster: boolean;
  clusterTitle: string;
  clusterSummary: string;
  avgRiskScore: number;
  verdictCounts: Record<string, number>;
  timeRange: { start: string; end: string };
}

function getInvTimestamp(inv: any): number {
  const ts = inv.completed_at || inv.created_at;
  if (!ts) return Date.now();
  const t = new Date(ts).getTime();
  return isNaN(t) ? Date.now() : t;
}

function clusterInvestigations(investigations: any[]): InvCluster[] {
  const keyGroups = new Map<string, any[]>();

  for (const inv of investigations) {
    const title = inv.incident_title || `Incident ${inv.incident_id}`;
    const severity = inv.incident_severity || "unknown";
    const key = `${normalizeInvTitle(title)}|||${severity}`;
    const arr = keyGroups.get(key);
    if (arr) arr.push(inv);
    else keyGroups.set(key, [inv]);
  }

  const result: InvCluster[] = [];

  for (const [, group] of Array.from(keyGroups)) {
    group.sort((a: any, b: any) => getInvTimestamp(a) - getInvTimestamp(b));

    const WINDOW = 60 * 60 * 1000;
    let windowStart = 0;

    for (let i = 0; i < group.length; i++) {
      const time = getInvTimestamp(group[i]);
      const startTime = getInvTimestamp(group[windowStart]);

      if (time - startTime > WINDOW && i > windowStart) {
        const slice = group.slice(windowStart, i);
        result.push(buildCluster(slice));
        windowStart = i;
      }
    }
    const slice = group.slice(windowStart);
    result.push(buildCluster(slice));
  }

  result.sort((a, b) => {
    const ta = new Date(b.timeRange.end).getTime();
    const tb = new Date(a.timeRange.end).getTime();
    return ta - tb;
  });

  return result;
}

function buildCluster(invs: any[]): InvCluster {
  const verdictCounts: Record<string, number> = {};
  let riskSum = 0;
  let riskCount = 0;

  for (const inv of invs) {
    const v = inv.verdict || "pending";
    verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    if (inv.risk_score != null) {
      riskSum += inv.risk_score;
      riskCount++;
    }
  }

  const times = invs.map((inv: any) => getInvTimestamp(inv));
  const minTime = times.length > 0 ? new Date(Math.min(...times)).toISOString() : "";
  const maxTime = times.length > 0 ? new Date(Math.max(...times)).toISOString() : "";

  const isCluster = invs.length > 1;
  const { title, summary } = isCluster
    ? generateInvClusterTitle(invs)
    : { title: "", summary: "" };

  return {
    id: `inv-cluster-${invs[0].id}`,
    investigations: invs,
    isCluster,
    clusterTitle: title,
    clusterSummary: summary,
    avgRiskScore: riskCount > 0 ? Math.round(riskSum / riskCount) : 0,
    verdictCounts,
    timeRange: { start: minTime, end: maxTime },
  };
}

function getInvestigationDisplayName(inv: any): string {
  const title = inv.incident_title || "";
  if (!title) return `Investigation #${inv.id}`;
  const cleaned = title.length > 80 ? title.substring(0, 77) + "..." : title;
  return `INV-${inv.id}: ${cleaned}`;
}

export default function AIAnalystPage() {
  const { currentTenant } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedForReinvestigate, setSelectedForReinvestigate] = useState<Set<number>>(new Set());
  const [groupSimilarInv, setGroupSimilarInv] = useState(true);
  const [expandedInvClusters, setExpandedInvClusters] = useState<Set<string>>(new Set());
  const tenantId = currentTenant?.id;
  const dashboardRef = useDashboardExportRef();

  const overviewQuery = useQuery<any>({
    queryKey: ["/api/ai-analyst", tenantId, "overview"],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/ai-analyst/${tenantId}/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 15000,
  });

  const queueQuery = useQuery<any>({
    queryKey: ["/api/ai-analyst", tenantId, "queue"],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/ai-analyst/${tenantId}/queue`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
    enabled: !!tenantId && activeTab === "queue",
    staleTime: 15000,
  });

  const completedQuery = useQuery<any[]>({
    queryKey: ["/api/investigations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/investigations/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch investigations");
      return res.json();
    },
    enabled: !!tenantId && activeTab === "completed",
    staleTime: 15000,
  });

  const investigateQueueMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-analyst/${tenantId}/investigate-queue`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId] });
      toast({ title: "Investigations queued", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Failed to queue investigations", description: error.message, variant: "destructive" });
    },
  });

  const investigateSingleMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/investigate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId] });
      toast({ title: "Investigation started" });
    },
    onError: (error: any) => {
      toast({ title: "Investigation failed", description: error.message, variant: "destructive" });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (params: { source: string; category: string; incidentType: string }) => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-analyst/${tenantId}/escalate`, params);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId] });
      toast({ title: "Incidents escalated", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Escalation failed", description: error.message, variant: "destructive" });
    },
  });

  const reinvestigateMutation = useMutation({
    mutationFn: async (incidentIds: number[]) => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-analyst/${tenantId}/reinvestigate`, { incidentIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId] });
      setSelectedForReinvestigate(new Set());
      toast({ title: "Re-investigation started", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Re-investigation failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleReinvestigateSelection = (incidentId: number) => {
    setSelectedForReinvestigate(prev => {
      const next = new Set(prev);
      if (next.has(incidentId)) next.delete(incidentId);
      else next.add(incidentId);
      return next;
    });
  };

  const overview = overviewQuery.data;

  const clusteredInvestigations = useMemo(() => {
    if (!completedQuery.data || completedQuery.data.length === 0) return [];
    return clusterInvestigations(completedQuery.data);
  }, [completedQuery.data]);

  const renderInvestigationCard = (inv: any, idx: number, isChild?: boolean) => {
    const verdictCfg = VERDICT_CONFIG[inv.verdict] || null;
    const VerdictIcon = verdictCfg?.icon || CheckCircle2;
    const displayName = getInvestigationDisplayName(inv);
    return (
      <Card
        key={inv.id}
        className={`hover-elevate transition-all duration-200 cursor-pointer animate-fade-in-up ${selectedForReinvestigate.has(inv.incident_id) ? "ring-1 ring-purple-500/50" : ""} ${isChild ? "bg-muted/20" : ""}`}
        style={{ animationDelay: `${idx * 0.03}s` }}
        onClick={() => navigate(`/ai-analyst/${inv.id}`)}
        data-testid={`completed-inv-${inv.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); toggleReinvestigateSelection(inv.incident_id); }}
              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${selectedForReinvestigate.has(inv.incident_id) ? "bg-purple-500 border-purple-500" : "border-muted-foreground/30 hover:border-purple-400"}`}
              data-testid={`checkbox-reinvestigate-${inv.id}`}
            >
              {selectedForReinvestigate.has(inv.incident_id) && <CheckCircle2 className="w-3 h-3 text-white" />}
            </button>
            <div className={`w-9 h-9 rounded-md flex items-center justify-center ${verdictCfg?.bg || "bg-muted"}`}>
              <VerdictIcon className={`w-4 h-4 ${verdictCfg?.color || "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid={`text-inv-name-${inv.id}`}>{displayName}</p>
              <p className="text-[10px] text-muted-foreground">Incident #{inv.incident_id}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <Badge variant="outline" className="text-[9px]">{inv.investigation_type}</Badge>
                {verdictCfg && (
                  <Badge variant="outline" className={`text-[9px] ${verdictCfg.bg} ${verdictCfg.color}`}>
                    {verdictCfg.label}
                  </Badge>
                )}
                {inv.incident_severity && (
                  <Badge className={`text-[9px] ${SEVERITY_STYLES[inv.incident_severity] || ""}`}>{inv.incident_severity}</Badge>
                )}
                {inv.attack_type && (
                  <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-700 dark:text-purple-400">{inv.attack_type}</Badge>
                )}
              </div>
              {inv.executive_summary && (
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{inv.executive_summary}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {inv.risk_score != null && (
                <div className="flex flex-col items-center">
                  <CircularProgress value={inv.risk_score} size={36} stroke={3} color={inv.risk_score >= 70 ? "stroke-red-500" : inv.risk_score >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                  <span className={`text-[9px] font-bold mt-0.5 ${inv.risk_score >= 70 ? "text-red-500" : inv.risk_score >= 40 ? "text-orange-500" : "text-green-500"}`}>{inv.risk_score}</span>
                </div>
              )}
              <Button size="sm" variant="ghost" data-testid={`button-view-detail-${inv.id}`}>
                <Eye className="w-3.5 h-3.5 mr-1" /> View
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a tenant to view AI Analyst</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 overflow-y-auto h-full" data-testid="ai-analyst-page" ref={dashboardRef}>
      <div className="relative rounded-md bg-gradient-to-r from-purple-600/10 via-blue-600/10 to-cyan-600/10 dark:from-purple-500/15 dark:via-blue-500/15 dark:to-cyan-500/15 p-5 animate-fade-in-up">
        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-purple-500/5 to-transparent animate-shimmer pointer-events-none" />
        <div className="flex items-center justify-between gap-4 relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-md bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center animate-pulse-glow">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-ai-analyst-title">AI SOC Analyst</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentTenant?.name} — Autonomous Incident Response & Threat Hunting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DashboardExportBar dashboardTitle="AI SOC Analyst" containerRef={dashboardRef} />
            {overview && overview.queueSize > 0 && (
              <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400" data-testid="badge-queue-size">
                {overview.queueSize} awaiting
              </Badge>
            )}
            <Button
              size="sm"
              onClick={() => investigateQueueMutation.mutate()}
              disabled={investigateQueueMutation.isPending}
              data-testid="button-auto-investigate-all"
            >
              {investigateQueueMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Investigating...</>
              ) : (
                <><Play className="w-3.5 h-3.5 mr-1.5" /> Auto-Investigate Critical</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-ai-analyst">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Queue
            {overview && overview.queueSize > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">{overview.queueSize}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {overviewQuery.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : overviewQuery.isError ? (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load overview data</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => overviewQuery.refetch()} data-testid="button-retry-overview">Retry</Button>
              </CardContent>
            </Card>
          ) : overview ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="stats-row">
                {[
                  { label: "Total Investigations", value: overview.totalInvestigations, icon: Brain, gradient: "from-purple-500/15 to-purple-600/5", color: "text-purple-500", testId: "stat-total" },
                  { label: "Completed", value: overview.completed, icon: CheckCircle2, gradient: "from-green-500/15 to-green-600/5", color: "text-green-500", testId: "stat-completed" },
                  { label: "In Progress", value: overview.inProgress, icon: Loader2, gradient: "from-blue-500/15 to-blue-600/5", color: "text-blue-500", testId: "stat-in-progress" },
                  { label: "Failed", value: overview.failed, icon: AlertTriangle, gradient: "from-red-500/15 to-red-600/5", color: "text-red-500", testId: "stat-failed" },
                  { label: "Avg Risk Score", value: overview.avgRiskScore, icon: Target, gradient: "from-orange-500/15 to-orange-600/5", color: "text-orange-500", testId: "stat-avg-risk", isRisk: true },
                ].map((stat, i) => {
                  const StatIcon = stat.icon;
                  return (
                    <Card key={stat.testId} className={`animate-fade-in-up stagger-${i + 1} bg-gradient-to-br ${stat.gradient}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-md bg-background/60 dark:bg-background/40 flex items-center justify-center glass-card`}>
                            <StatIcon className={`w-4 h-4 ${stat.color}`} />
                          </div>
                          {stat.isRisk && (
                            <CircularProgress value={stat.value} size={36} stroke={3} color={stat.value >= 70 ? "stroke-red-500" : stat.value >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                          )}
                        </div>
                        <p className="text-2xl font-bold" data-testid={stat.testId}>{stat.value}</p>
                        <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{stat.label}</p>
                        {stat.isRisk && <Progress value={stat.value} className="h-1 mt-2" />}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-500" /> Domain Risk Heatmap
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="domain-heatmap">
                  {Object.entries(DOMAIN_CONFIG).map(([domain, config]) => {
                    const stats = overview.domainBreakdown?.[domain] || { critical: 0, high: 0, investigated: 0, total: 0 };
                    const DomainIcon = config.icon;
                    const coverage = stats.total > 0 ? Math.round((stats.investigated / stats.total) * 100) : 0;
                    const riskLevel = stats.total >= 10 ? "critical" : stats.total >= 5 ? "high" : stats.total >= 1 ? "medium" : "low";
                    const heatIntensity = riskLevel === "critical" ? "border-red-500/40" :
                      riskLevel === "high" ? "border-orange-500/40" :
                      riskLevel === "medium" ? "border-yellow-500/30" : "border-green-500/20";
                    return (
                      <Tooltip key={domain}>
                        <TooltipTrigger asChild>
                          <Card className={`hover-elevate transition-all duration-200 bg-gradient-to-br ${config.gradient} ${heatIntensity}`} data-testid={`domain-card-${domain.toLowerCase().replace(" ", "-")}`}>
                            <CardContent className="p-3 text-center">
                              <div className={`w-10 h-10 rounded-md mx-auto mb-2 flex items-center justify-center bg-background/50 dark:bg-background/30 glass-card`}>
                                <DomainIcon className={`w-5 h-5 ${config.color}`} />
                              </div>
                              <p className="text-xs font-semibold">{domain}</p>
                              <p className="text-xl font-bold mt-1">{stats.total}</p>
                              <p className="text-[9px] text-muted-foreground">incidents</p>
                              <div className="mt-2">
                                <div className="flex items-center justify-between gap-1 text-[9px] mb-0.5">
                                  <span className="text-muted-foreground">Coverage</span>
                                  <span className="font-medium">{coverage}%</span>
                                </div>
                                <Progress value={coverage} className="h-1" />
                              </div>
                              <Badge className={`text-[8px] mt-2 ${
                                riskLevel === "critical" ? "bg-red-600" :
                                riskLevel === "high" ? "bg-orange-500" :
                                riskLevel === "medium" ? "bg-yellow-500" : "bg-green-500"
                              } text-white`}>{riskLevel}</Badge>
                            </CardContent>
                          </Card>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          <p className="font-semibold">{domain} Domain</p>
                          <p>Critical: {stats.critical} | High: {stats.high}</p>
                          <p>Investigation Coverage: {coverage}%</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {overview.recentInvestigations && overview.recentInvestigations.length > 0 && (
                <div className="animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" /> Recent Investigations
                  </h3>
                  <div className="space-y-2" data-testid="recent-investigations">
                    {overview.recentInvestigations.map((inv: any) => {
                      const domainCfg = DOMAIN_CONFIG[inv.domain] || DOMAIN_CONFIG["Endpoint"];
                      const DIcon = domainCfg.icon;
                      const verdictCfg = VERDICT_CONFIG[inv.verdict] || null;
                      return (
                        <Card key={inv.id} className="hover-elevate transition-all duration-200 cursor-pointer" onClick={() => navigate(`/ai-analyst/${inv.id}`)} data-testid={`investigation-row-${inv.id}`}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-md flex items-center justify-center bg-gradient-to-br ${domainCfg.gradient}`}>
                              <DIcon className={`w-4 h-4 ${domainCfg.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{inv.incident_title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <Badge variant="outline" className="text-[9px]">{inv.domain}</Badge>
                                <Badge variant="outline" className={`text-[9px] ${
                                  inv.status === "completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                                  inv.status === "investigating" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                                  inv.status === "failed" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                                  "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                                }`}>
                                  {inv.status === "investigating" && <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />}
                                  {inv.status}
                                </Badge>
                                <Badge className={`text-[9px] ${SEVERITY_STYLES[inv.incident_severity] || ""}`}>
                                  {inv.incident_severity}
                                </Badge>
                                {verdictCfg && (
                                  <Badge variant="outline" className={`text-[9px] ${verdictCfg.bg} ${verdictCfg.color}`}>
                                    {verdictCfg.label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {inv.risk_score != null && (
                                <div className="flex items-center gap-1.5">
                                  <CircularProgress value={inv.risk_score} size={32} stroke={3} color={inv.risk_score >= 70 ? "stroke-red-500" : inv.risk_score >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                                  <span className={`text-xs font-bold ${inv.risk_score >= 70 ? "text-red-500" : inv.risk_score >= 40 ? "text-orange-500" : "text-green-500"}`}>{inv.risk_score}</span>
                                </div>
                              )}
                              <p className="text-[9px] text-muted-foreground mt-1">
                                {inv.completed_at ? fmt.formatDate(inv.completed_at) : "In progress"}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
          )}
        </TabsContent>

        <TabsContent value="queue" className="space-y-6 mt-4">
          {queueQuery.isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : queueQuery.data ? (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    {queueQuery.data.totalQueued} critical/high incidents awaiting investigation
                  </p>
                </div>
                {queueQuery.data.suppressedFpCount > 0 && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {queueQuery.data.suppressedFpCount} FP alerts filtered
                  </Badge>
                )}
                <Button
                  size="sm"
                  onClick={() => investigateQueueMutation.mutate()}
                  disabled={investigateQueueMutation.isPending || queueQuery.data.totalQueued === 0}
                  data-testid="button-investigate-all-queue"
                >
                  {investigateQueueMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing...</>
                  ) : (
                    <><Zap className="w-3.5 h-3.5 mr-1.5" /> Auto-Investigate All ({queueQuery.data.totalQueued})</>
                  )}
                </Button>
              </div>

              {Object.entries(queueQuery.data.domainQueue as Record<string, any[]>).map(([domain, incidents]) => {
                if (incidents.length === 0) return null;
                const domainCfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG["Endpoint"];
                const DIcon = domainCfg.icon;
                return (
                  <Card key={domain} className="animate-fade-in-up" data-testid={`queue-domain-${domain.toLowerCase().replace(" ", "-")}`}>
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br ${domainCfg.gradient}`}>
                          <DIcon className={`w-3.5 h-3.5 ${domainCfg.color}`} />
                        </div>
                        {domain} ({incidents.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="space-y-1.5">
                        {incidents.slice(0, 10).map((inc: any) => {
                          const severityBorder = inc.severity === "critical" ? "border-l-red-500" :
                            inc.severity === "high" ? "border-l-orange-500" :
                            inc.severity === "medium" ? "border-l-yellow-500" : "border-l-blue-500";
                          return (
                            <div key={inc.id} className={`flex items-center gap-2 p-2 rounded-md border-l-[3px] ${severityBorder} bg-muted/20 hover-elevate transition-all duration-200`} data-testid={`queue-incident-${inc.id}`}>
                              <Badge className={`text-[9px] ${SEVERITY_STYLES[inc.severity]}`}>{inc.severity}</Badge>
                              <span className="text-xs flex-1 truncate">{inc.title}</span>
                              <span className="text-[9px] text-muted-foreground">{fmt.formatDate(inc.created_at)}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); investigateSingleMutation.mutate(inc.id); }}
                                disabled={investigateSingleMutation.isPending && investigateSingleMutation.variables === inc.id}
                                data-testid={`button-investigate-queue-${inc.id}`}
                              >
                                {investigateSingleMutation.isPending && investigateSingleMutation.variables === inc.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Brain className="w-3 h-3 mr-1" /> Investigate</>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                        {incidents.length > 10 && (
                          <p className="text-[10px] text-muted-foreground text-center pt-1">
                            +{incidents.length - 10} more incidents
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {queueQuery.data.recurringLowMedium && queueQuery.data.recurringLowMedium.length > 0 && (
                <Card className="bg-gradient-to-r from-yellow-500/5 to-orange-500/5 animate-fade-in-up">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-yellow-600" />
                      Recurring Low/Medium — Smart Escalation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-[10px] text-muted-foreground mb-3">
                      These low/medium severity patterns appear 5+ times and may warrant investigation.
                    </p>
                    <div className="space-y-1.5">
                      {queueQuery.data.recurringLowMedium.map((group: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md border hover-elevate transition-all duration-200" data-testid={`recurring-group-${i}`}>
                          <Badge className={`text-[9px] ${SEVERITY_STYLES[group.severity] || ""}`}>{group.severity}</Badge>
                          <Badge variant="outline" className="text-[9px]">{group.domain}</Badge>
                          <span className="text-xs flex-1 truncate">
                            {group.source || group.category || group.incident_type || "Unknown"} — {group.mitre_tactic || "N/A"}
                          </span>
                          <Badge variant="secondary" className="text-[9px]">{group.cnt}x</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => escalateMutation.mutate({ source: group.source, category: group.category, incidentType: group.incident_type })}
                            disabled={escalateMutation.isPending}
                            data-testid={`button-escalate-${i}`}
                          >
                            <ArrowUpCircle className="w-3 h-3 mr-1" /> Escalate
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No queue data</p>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 mt-4">
          {completedQuery.data && completedQuery.data.length > 0 && selectedForReinvestigate.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-md border bg-gradient-to-r from-purple-500/5 to-blue-500/5 animate-fade-in-up">
              <Badge variant="outline" className="text-xs">{selectedForReinvestigate.size} selected</Badge>
              <Button
                size="sm"
                onClick={() => reinvestigateMutation.mutate(Array.from(selectedForReinvestigate))}
                disabled={reinvestigateMutation.isPending}
                data-testid="button-bulk-reinvestigate"
              >
                {reinvestigateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                Re-Investigate Selected ({selectedForReinvestigate.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedForReinvestigate(new Set())} data-testid="button-clear-selection">Clear</Button>
            </div>
          )}
          {completedQuery.data && completedQuery.data.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Group Similar</span>
                <Switch
                  checked={groupSimilarInv}
                  onCheckedChange={setGroupSimilarInv}
                  data-testid="switch-group-similar-inv"
                />
              </div>
              {groupSimilarInv && (() => {
                const clusterCount = clusteredInvestigations.filter(c => c.isCluster).length;
                return clusterCount > 0 ? (
                  <Badge variant="outline" className="text-[9px]" data-testid="badge-inv-cluster-count">
                    {clusterCount} cluster{clusterCount !== 1 ? "s" : ""}
                  </Badge>
                ) : null;
              })()}
            </div>
          )}
          {completedQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : completedQuery.data && completedQuery.data.length > 0 ? (
            <div className="space-y-2" data-testid="completed-list">
              {groupSimilarInv ? (
                clusteredInvestigations.map((cluster, cidx) => {
                  if (!cluster.isCluster) {
                    const inv = cluster.investigations[0];
                    return renderInvestigationCard(inv, cidx);
                  }
                  const isExpanded = expandedInvClusters.has(cluster.id);
                  const avgRisk = cluster.avgRiskScore;
                  return (
                    <div key={cluster.id} data-testid={`inv-cluster-${cluster.id}`}>
                      <div
                        className="border-l-[3px] border-l-purple-500/60 rounded-md animate-fade-in-up"
                        style={{ animationDelay: `${cidx * 0.03}s` }}
                      >
                      <Card
                        className="cursor-pointer hover-elevate transition-all duration-200 rounded-l-none"
                        onClick={() => {
                          setExpandedInvClusters(prev => {
                            const next = new Set(prev);
                            if (next.has(cluster.id)) next.delete(cluster.id);
                            else next.add(cluster.id);
                            return next;
                          });
                        }}
                        data-testid={`inv-cluster-row-${cluster.id}`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-md flex items-center justify-center bg-purple-500/10">
                              <Layers className="w-4 h-4 text-purple-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate" data-testid={`text-inv-cluster-title-${cluster.id}`}>
                                  {cluster.clusterTitle}
                                </p>
                                <Badge variant="secondary" className="text-[9px] flex-shrink-0" data-testid={`badge-inv-cluster-size-${cluster.id}`}>
                                  x{cluster.investigations.length}
                                </Badge>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {cluster.investigations[0]?.incident_severity && (
                                  <Badge className={`text-[9px] ${SEVERITY_STYLES[cluster.investigations[0].incident_severity] || ""}`}>
                                    {cluster.investigations[0].incident_severity}
                                  </Badge>
                                )}
                                {cluster.investigations[0]?.attack_type && (
                                  <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-700 dark:text-purple-400">
                                    {cluster.investigations[0].attack_type}
                                  </Badge>
                                )}
                                {Object.entries(cluster.verdictCounts).map(([v, count]) => {
                                  const cfg = VERDICT_CONFIG[v];
                                  return cfg ? (
                                    <Badge key={v} variant="outline" className={`text-[9px] ${cfg.bg} ${cfg.color}`}>
                                      {count} {cfg.label}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{cluster.clusterSummary}</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {avgRisk > 0 && (
                                <div className="flex flex-col items-center">
                                  <CircularProgress value={avgRisk} size={36} stroke={3} color={avgRisk >= 70 ? "stroke-red-500" : avgRisk >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                                  <span className={`text-[9px] font-bold mt-0.5 ${avgRisk >= 70 ? "text-red-500" : avgRisk >= 40 ? "text-orange-500" : "text-green-500"}`}>
                                    {avgRisk}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      </div>
                      {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-l-purple-500/20 pl-2">
                          {cluster.investigations.map((inv: any, idx: number) => renderInvestigationCard(inv, idx, true))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                completedQuery.data.map((inv: any, idx: number) => renderInvestigationCard(inv, idx))
              )}
            </div>
          ) : (
            <div className="text-center py-12 animate-fade-in-up">
              <div className="w-16 h-16 rounded-md bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center mx-auto mb-3">
                <Brain className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No completed investigations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Use the Investigation Queue tab to start investigating incidents</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
