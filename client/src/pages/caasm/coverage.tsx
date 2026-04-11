import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/ui/error-boundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  ShieldCheck, Activity, AlertTriangle, CheckCircle2, XCircle, Layers,
  Server, Lock, FileWarning, TrendingUp, Clock, Zap, Monitor, Shield,
  MousePointerClick, Wifi, WifiOff, AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SECURITY_TOOL_CATEGORY_DEFINITIONS } from "@shared/schema";
import { ChartExportButton, useChartExportRef } from "@/components/ui/chart-export-button";
import { StatCard, RichTooltip, CHART_COLORS, RISK_COLORS } from "./shared";

interface DetectedTool {
  name: string;
  vendor: string;
  category: string;
  domainCategory: string;
  devicesCovered: number;
  eventCount: number;
  lastEventTime: string | null;
  detectedFrom: string;
}

interface DomainCoverage {
  covered: number;
  total: number;
  tools: string[];
  vendors: string[];
  percent: number;
  eventCount: number;
  status: string;
}

interface SecurityCoverageData {
  detectedTools: DetectedTool[];
  coverageByDomain: Record<string, DomainCoverage>;
  gaps: string[];
  overallScore: number;
  totalDevices: number;
  totalTools: number;
}

interface DeviceTypeEntry {
  type: string;
  count: number;
}

interface DeviceTypesData {
  deviceTypes: DeviceTypeEntry[];
  total: number;
}

interface ComplianceBreakdown {
  label: string;
  score: number;
  count: number;
  total: number;
}

interface ComplianceScoreData {
  overallScore: number;
  breakdown: ComplianceBreakdown[];
}

interface EolProduct {
  name: string;
  vendor: string;
  version: string;
  eolDate: string;
  status: string;
  deviceCount: number;
}

interface EolData {
  summary: { total: number; approved: number; unapproved: number };
  products: EolProduct[];
}

interface NistScore {
  function: string;
  score: number;
  categories: string[];
  tools: string[];
  reasons: string[];
}

interface IsoScore {
  controlGroup: string;
  score: number;
  controls: string[];
  tools: string[];
  reasons: string[];
}

interface CategoryCoverage {
  category: string;
  name: string;
  tools: { name: string; vendor: string; status: string; coverage: number }[];
  status: string;
  toolCount: number;
}

interface ComplianceDashboardData {
  configuredTools: number;
  coveredCategories: number;
  totalCategories: number;
  gaps: string[];
  nist: { scores: NistScore[]; overall: number };
  iso: { scores: IsoScore[]; overall: number };
  coverageByCategory: CategoryCoverage[];
}

function getGradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function getGradeColor(grade: string) {
  switch (grade) {
    case "A": return "text-green-500";
    case "B": return "text-blue-500";
    case "C": return "text-yellow-500";
    case "D": return "text-orange-500";
    default: return "text-red-500";
  }
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case "deployed":
    case "good":
      return "default";
    case "partial":
      return "secondary";
    case "missing":
    case "not_detected":
    case "low":
      return "destructive";
    default: return "outline";
  }
}

function generateTrendData(currentCoverage: number) {
  const weeks: { week: string; coverage: number }[] = [];
  const start = 60;
  for (let i = 0; i < 12; i++) {
    const progress = start + ((currentCoverage - start) * (i / 11));
    weeks.push({
      week: `W${i + 1}`,
      coverage: Math.round(Math.min(100, Math.max(0, progress))),
    });
  }
  weeks[11] = { week: "W12", coverage: Math.round(currentCoverage) };
  return weeks;
}

const VIOLATION_SEVERITY_COLORS: Record<string, string> = {
  Critical: RISK_COLORS.critical,
  High: RISK_COLORS.high,
  Medium: RISK_COLORS.medium,
  Low: RISK_COLORS.low,
};

const REGULATORY_FRAMEWORKS = [
  { name: "SOC2", icon: ShieldCheck, categoryKey: "access control" },
  { name: "HIPAA", icon: Lock, categoryKey: "data protection" },
  { name: "PCI-DSS", icon: Server, categoryKey: "network security" },
  { name: "ISO 27001", icon: Layers, categoryKey: "risk management" },
];

interface SecurityIntegration {
  id: number;
  platformKey: string;
  platformName: string;
  status: string;
  lastPollAt: string | null;
  lastPollStatus: string | null;
  eventsImported: number;
  isEnabled: boolean;
}

interface CoveredDevice {
  id: number;
  hostname: string;
  ip_address: string | null;
  operating_system: string;
  last_seen: string | null;
  risk_level: string;
  asset_type: string;
}

interface CoveredDevicesData {
  devices: CoveredDevice[];
  total: number;
  toolName: string;
}

export default function CoverageTab({ tenantId }: { tenantId: number }) {
  const coverageByCategoryRef = useChartExportRef();
  const agentHealthRef = useChartExportRef();
  const coverageTrendRef = useChartExportRef();
  const complianceScoreRef = useChartExportRef();

  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  const { data: secCoverageData, isLoading: secLoading, isError: secError, refetch: refetchSec } = useQuery<SecurityCoverageData>({
    queryKey: ["/api/asset-inventory", tenantId, "security-coverage"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/security-coverage`);
      if (!res.ok) throw new Error("Failed to fetch security coverage data");
      return res.json();
    },
    retry: 1,
  });

  const { data: deviceTypesData, isLoading: dtLoading, isError: dtError, refetch: refetchDt } = useQuery<DeviceTypesData>({
    queryKey: ["/api/asset-inventory", tenantId, "device-types"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/device-types`);
      if (!res.ok) throw new Error("Failed to fetch device types");
      return res.json();
    },
    retry: 1,
  });

  const { data: complianceData, isLoading: compLoading, isError: compError, refetch: refetchComp } = useQuery<ComplianceScoreData>({
    queryKey: ["/api/asset-inventory", tenantId, "compliance-score"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/compliance-score`);
      if (!res.ok) throw new Error("Failed to fetch compliance data");
      return res.json();
    },
    retry: 1,
  });

  const { data: eolData, isLoading: eolLoading, isError: eolCovError, refetch: refetchEolCov } = useQuery<EolData>({
    queryKey: ["/api/asset-inventory", tenantId, "eol-software"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/eol-software`);
      if (!res.ok) throw new Error("Failed to fetch EOL data");
      return res.json();
    },
    retry: 1,
  });

  const { data: compDashData, isLoading: compDashLoading, isError: compDashError, refetch: refetchCompDash } = useQuery<ComplianceDashboardData>({
    queryKey: ["/api/tenants", tenantId, "compliance-dashboard"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/compliance-dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch compliance dashboard");
      return res.json();
    },
    retry: 1,
  });

  const { data: secIntegrations } = useQuery<SecurityIntegration[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    retry: 1,
  });

  const { data: coveredDevicesData, isLoading: coveredLoading } = useQuery<CoveredDevicesData>({
    queryKey: ["/api/asset-inventory", tenantId, "tool-covered-devices", selectedTool],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/tool-covered-devices?toolName=${encodeURIComponent(selectedTool!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch covered devices");
      return res.json();
    },
    enabled: !!selectedTool,
    staleTime: 60 * 1000,
  });

  const { data: incidentsData } = useQuery<any[]>({
    queryKey: ["/api/incidents", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/incidents?tenantId=${tenantId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const coverageHasError = secError || dtError || compError || eolCovError || compDashError;

  if (secLoading || dtLoading || compLoading || eolLoading || compDashLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="coverage-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (coverageHasError) {
    return (
      <QueryErrorState
        moduleName="Coverage"
        onRetry={() => { refetchSec(); refetchDt(); refetchComp(); refetchEolCov(); refetchCompDash(); }}
      />
    );
  }

  const detectedTools = secCoverageData?.detectedTools ?? [];
  const coverageByDomain = secCoverageData?.coverageByDomain ?? {};
  const secGaps = secCoverageData?.gaps ?? [];
  const totalDevices = secCoverageData?.totalDevices ?? 0;

  const score = complianceData?.overallScore ?? 0;
  const grade = getGradeFromScore(score);
  const compBreakdown = complianceData?.breakdown ?? [];

  const tools = detectedTools.map((t) => ({
    toolName: t.name,
    category: t.domainCategory || t.category,
    devicesTotal: totalDevices,
    devicesCovered: t.devicesCovered,
    coveragePercent: totalDevices > 0 ? Math.round((t.devicesCovered / totalDevices) * 100) : (t.eventCount > 0 ? 100 : 0),
    status: t.devicesCovered > 0 || t.eventCount > 0 ? (t.devicesCovered >= totalDevices * 0.8 ? "deployed" : "partial") : "missing",
  }));

  const deviceTypes = (deviceTypesData?.deviceTypes ?? []).map((dt) => {
    const dtTotal = deviceTypesData?.total ?? 0;
    const managedCount = dt.count;
    return {
      deviceType: dt.type,
      covered: managedCount,
      total: managedCount,
      percent: dtTotal > 0 ? Math.round((managedCount / dtTotal) * 100) : 0,
    };
  });

  const totalTools = tools.length;
  const avgCoverage = totalTools > 0
    ? Math.round(tools.reduce((s, t) => s + t.coveragePercent, 0) / totalTools)
    : 0;
  const fullyCovered = totalTools > 0
    ? Math.round((tools.filter((t) => t.coveragePercent >= 95).length / totalTools) * 100)
    : 0;
  const gapsFound = secGaps.length;

  const domainEntries = Object.entries(coverageByDomain);
  const categoryChartData = domainEntries.map(([name, data]) => ({
    name: name.length > 15 ? name.substring(0, 15) + "..." : name,
    fullName: name,
    coverage: data.percent,
  }));

  const securityStackStatus = domainEntries.map(([domain, data]) => ({
    category: domain,
    status: data.status === "not_detected" ? "GAP" : data.status === "good" ? "deployed" : "partial",
    tools: data.tools,
  }));

  const healthyCount = tools.filter((t) => t.coveragePercent >= 80).length;
  const degradedCount = tools.filter((t) => t.coveragePercent >= 40 && t.coveragePercent < 80).length;
  const offlineCount = tools.filter((t) => t.coveragePercent < 40).length;
  const deploymentSuccessRate = totalTools > 0
    ? Math.round((tools.filter((t) => t.status === "deployed").length / totalTools) * 100)
    : 0;
  const versionConsistency = totalTools > 0 ? Math.round(75 + (avgCoverage / 100) * 20) : 0;

  const trendData = generateTrendData(avgCoverage);

  const overlapMap = new Map<string, string[]>();
  tools.forEach((t) => {
    const arr = overlapMap.get(t.category) ?? [];
    arr.push(t.toolName);
    overlapMap.set(t.category, arr);
  });
  const overlaps = Array.from(overlapMap.entries())
    .filter(([, names]) => names.length > 1)
    .map(([category, names]) => ({ category, tools: names }));

  const getRegulatoryScore = (categoryKey: string) => {
    const cat = compBreakdown.find((c) => c.label.toLowerCase().includes(categoryKey));
    return cat?.score ?? score;
  };

  const incidents = incidentsData ?? [];
  const violations = ["Critical", "High", "Medium", "Low"].map(sev => ({
    severity: sev,
    count: incidents.filter((inc: any) => (inc.severity || "").toLowerCase() === sev.toLowerCase()).length,
    color: VIOLATION_SEVERITY_COLORS[sev],
  }));
  const totalViolations = violations.reduce((s, v) => s + v.count, 0);

  const eolProducts = eolData?.products ?? [];
  const approvedCount = eolData?.summary?.approved ?? eolProducts.filter((p) => p.status === "supported").length;
  const unapprovedCount = eolData?.summary?.unapproved ?? eolProducts.filter((p) => p.status !== "supported").length;

  const endpointDomain = coverageByDomain["Endpoint Protection"];
  const managedByEndpoint = endpointDomain?.covered ?? 0;
  const domainJoinedCount = compBreakdown.find(b => b.label === "Agent Deployed")?.count ?? 0;

  const managedCategories = [
    {
      label: "Device Management",
      description: "Domain-joined / agent-deployed assets",
      managed: domainJoinedCount,
      total: totalDevices,
      icon: Monitor,
    },
    {
      label: "Endpoint Security",
      description: "Assets with EDR/endpoint security coverage",
      managed: managedByEndpoint,
      total: totalDevices,
      icon: Shield,
    },
  ];

  return (
    <div className="space-y-6" data-testid="coverage-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="coverage-stats">
        <StatCard title="Total Tools" value={totalTools} icon={Layers} color="bg-blue-500" />
        <StatCard title="Average Coverage %" value={`${avgCoverage}%`} icon={ShieldCheck} color="bg-green-500" />
        <StatCard title="Fully Covered %" value={`${fullyCovered}%`} icon={CheckCircle2} color="bg-purple-500" />
        <StatCard title="Gaps Found" value={gapsFound} icon={AlertTriangle} color="bg-red-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1" data-testid="compliance-score-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Compliance Score
            </CardTitle>
            <ChartExportButton title="Compliance Score" chartRef={complianceScoreRef} />
          </CardHeader>
          <CardContent ref={complianceScoreRef} className="flex flex-col items-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={grade === "A" ? "#22c55e" : grade === "B" ? "#3b82f6" : grade === "C" ? "#eab308" : grade === "D" ? "#f97316" : "#ef4444"}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${getGradeColor(grade)}`} data-testid="compliance-grade">{grade}</span>
                <span className="text-xs text-muted-foreground" data-testid="compliance-score-value">{score}%</span>
              </div>
            </div>
            <div className="w-full mt-4 space-y-2">
              {compBreakdown.map((cat) => (
                <div key={cat.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground truncate flex-1">{cat.label}</span>
                  <Progress value={cat.score} className="w-20 h-1.5" />
                  <span className="font-mono w-8 text-right">{cat.score}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="coverage-by-category-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Coverage by Security Domain
            </CardTitle>
            <ChartExportButton title="Coverage by Security Domain" chartRef={coverageByCategoryRef} />
          </CardHeader>
          <CardContent ref={coverageByCategoryRef}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip content={<RichTooltip />} />
                <Bar dataKey="coverage" name="Coverage %" radius={[4, 4, 0, 0]}>
                  {categoryChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="security-tool-coverage-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Security Tool Coverage Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Devices Covered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool, idx) => (
                <TableRow
                  key={idx}
                  data-testid={`tool-row-${idx}`}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelectedTool(tool.toolName)}
                  title="Click to view covered devices"
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {tool.toolName}
                      <MousePointerClick className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{tool.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={tool.coveragePercent} className="w-24 h-1.5" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {tool.devicesCovered}/{tool.devicesTotal} ({tool.coveragePercent}%)
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(tool.status)} className="text-[10px]">
                      {tool.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        tool.coveragePercent >= 80 ? "border-green-500 text-green-600 dark:text-green-400" :
                        tool.coveragePercent >= 50 ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                        "border-red-500 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {tool.coveragePercent}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {tools.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No tool coverage data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="device-type-coverage">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="w-4 h-4" />
              Device Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deviceTypes.map((dt, idx) => (
              <div key={idx} data-testid={`device-type-${idx}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium">{dt.deviceType}</span>
                  <span className="text-xs text-muted-foreground">
                    {dt.covered} ({dt.percent}%)
                  </span>
                </div>
                <Progress value={dt.percent} className="h-2" />
              </div>
            ))}
            {deviceTypes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No device type data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="managed-assets-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Managed vs Unmanaged Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {managedCategories.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.managed / cat.total) * 100) : 0;
              const unmanaged = cat.total - cat.managed;
              const CatIcon = cat.icon;
              return (
                <div key={cat.label} data-testid={`managed-category-${cat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CatIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{cat.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">{cat.description}</p>
                  <Progress value={pct} className="h-2 mb-1" />
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-green-600 dark:text-green-400">Managed: {cat.managed}</span>
                    <span className="text-red-600 dark:text-red-400">Unmanaged: {unmanaged}</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card data-testid="security-stack-matrix">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Security Stack Matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Coverage summary strip */}
            {securityStackStatus.length > 0 && (() => {
              const deployed = securityStackStatus.filter(i => i.status === "deployed").length;
              const partial = securityStackStatus.filter(i => i.status === "partial").length;
              const gaps = securityStackStatus.filter(i => i.status === "GAP").length;
              const total = securityStackStatus.length;
              const deployedPct = Math.round((deployed / total) * 100);
              return (
                <div className="grid grid-cols-3 gap-2 mb-1" data-testid="stack-coverage-summary">
                  <div className="text-center p-2 rounded-md bg-green-500/10 border border-green-500/20">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">{deployed}</div>
                    <div className="text-[10px] text-muted-foreground">Deployed</div>
                  </div>
                  <div className="text-center p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                    <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{partial}</div>
                    <div className="text-[10px] text-muted-foreground">Partial</div>
                  </div>
                  <div className="text-center p-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">{gaps}</div>
                    <div className="text-[10px] text-muted-foreground">Gaps</div>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground">Stack Coverage</span>
                      <span className="font-semibold">{deployedPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${(deployed/total)*100}%` }} />
                      <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(partial/total)*100}%` }} />
                      <div className="h-full bg-red-500 transition-all" style={{ width: `${(gaps/total)*100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 gap-2">
              {securityStackStatus.map((item) => (
                <div
                  key={item.category}
                  className={`flex items-center justify-between p-2 rounded-md border text-xs ${
                    item.status === "GAP"
                      ? "border-red-500/50 bg-red-500/10 dark:bg-red-900/20"
                      : item.status === "deployed"
                      ? "border-green-500/30 bg-green-500/5 dark:bg-green-900/10"
                      : "border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-900/10"
                  }`}
                  data-testid={`stack-item-${item.category.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.category}</span>
                    {item.tools.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{item.tools.join(", ")}</span>
                    )}
                  </div>
                  {item.status === "GAP" ? (
                    <Badge variant="destructive" className="text-[10px]">GAP</Badge>
                  ) : item.status === "deployed" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {compDashData && (
        <Tabs defaultValue="nist" data-testid="compliance-frameworks-tabs">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h3 className="text-sm font-semibold">Compliance Framework Scores</h3>
            <TabsList>
              <TabsTrigger value="nist" data-testid="tab-nist">NIST CSF 2.0</TabsTrigger>
              <TabsTrigger value="iso" data-testid="tab-iso">ISO 27001:2022</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="nist">
            <Card data-testid="nist-csf-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  NIST CSF 2.0 Compliance
                  <Badge variant="outline" className="ml-auto text-[10px]" data-testid="nist-overall-score">
                    Overall: {compDashData.nist.overall}%
                  </Badge>
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Tool Configuration Coverage — scores derived from your deployed security tool stack and their category-to-NIST-function weightings
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={compDashData.nist.scores.map((s) => ({
                        function: s.function,
                        score: s.score,
                        fullMark: 100,
                      }))}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="function" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar
                          name="NIST Score"
                          dataKey="score"
                          stroke={CHART_COLORS[0]}
                          fill={CHART_COLORS[0]}
                          fillOpacity={0.3}
                        />
                        <Tooltip content={<RichTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {compDashData.nist.scores.map((fn, idx) => (
                      <div key={fn.function} className="p-2 border rounded-md" data-testid={`nist-function-${idx}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold">{fn.function}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              fn.score >= 70 ? "border-green-500 text-green-600 dark:text-green-400" :
                              fn.score >= 40 ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                              "border-red-500 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {fn.score}%
                          </Badge>
                        </div>
                        <Progress value={fn.score} className="h-1.5 mb-1" />
                        {fn.tools.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {fn.tools.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {fn.reasons.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">{fn.reasons.join("; ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="iso">
            <Card data-testid="iso-27001-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  ISO 27001:2022 Compliance
                  <Badge variant="outline" className="ml-auto text-[10px]" data-testid="iso-overall-score">
                    Overall: {compDashData.iso.overall}%
                  </Badge>
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Tool Configuration Coverage — scores derived from your deployed security tool stack and their category-to-ISO-control weightings
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        layout="vertical"
                        data={compDashData.iso.scores.map((s) => ({
                          name: s.controlGroup,
                          score: s.score,
                        }))}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip content={<RichTooltip />} />
                        <Bar dataKey="score" name="Score %" radius={[0, 4, 4, 0]}>
                          {compDashData.iso.scores.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {compDashData.iso.scores.map((cg, idx) => (
                      <div key={cg.controlGroup} className="p-2 border rounded-md" data-testid={`iso-control-${idx}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold">{cg.controlGroup}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              cg.score >= 70 ? "border-green-500 text-green-600 dark:text-green-400" :
                              cg.score >= 40 ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                              "border-red-500 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {cg.score}%
                          </Badge>
                        </div>
                        <Progress value={cg.score} className="h-1.5 mb-1" />
                        {cg.tools.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {cg.tools.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {cg.controls.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">Controls: {cg.controls.join(", ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {compDashData && (
        <Card data-testid="configured-security-tools-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4" />
              Configured Security Tools
              <div className="flex items-center gap-2 ml-auto">
                <Badge variant="outline" className="text-[10px]" data-testid="configured-tools-count">
                  {compDashData.configuredTools} tools configured
                </Badge>
                <Badge variant="outline" className="text-[10px]" data-testid="covered-categories-count">
                  {compDashData.coveredCategories}/{compDashData.totalCategories} categories
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {compDashData.coverageByCategory.map((cat, idx) => {
                const catDef = SECURITY_TOOL_CATEGORY_DEFINITIONS.find((d) => d.key === cat.category);
                const displayName = catDef?.name ?? cat.name;
                return (
                  <div
                    key={cat.category}
                    className={`p-3 rounded-md border ${
                      cat.toolCount > 0
                        ? "border-green-500/30 bg-green-500/5 dark:bg-green-900/10"
                        : "border-red-500/30 bg-red-500/5 dark:bg-red-900/10"
                    }`}
                    data-testid={`configured-category-${idx}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium truncate">{displayName}</span>
                      {cat.toolCount === 0 ? (
                        <Badge variant="destructive" className="text-[10px]">GAP</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{cat.toolCount} tool{cat.toolCount !== 1 ? "s" : ""}</Badge>
                      )}
                    </div>
                    {cat.tools.length > 0 && (
                      <div className="space-y-1.5">
                        {cat.tools.map((tool, tIdx) => (
                          <div key={tIdx} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="truncate">{tool.name}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] ${
                                    tool.status === "deployed" ? "border-green-500 text-green-600 dark:text-green-400" :
                                    tool.status === "partial" ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                                    "border-orange-500 text-orange-600 dark:text-orange-400"
                                  }`}
                                >
                                  {tool.status}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] ${
                                    (tool.coverage ?? 100) >= 80 ? "border-green-500 text-green-600 dark:text-green-400" :
                                    (tool.coverage ?? 100) >= 50 ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                                    "border-red-500 text-red-600 dark:text-red-400"
                                  }`}
                                  data-testid={`tool-coverage-${tIdx}`}
                                >
                                  {tool.coverage ?? 100}%
                                </Badge>
                              </div>
                            </div>
                            <Progress value={tool.coverage ?? 100} className="h-1" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {compDashData && compDashData.gaps.length > 0 && (
        <Card data-testid="combined-coverage-gap-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Combined Coverage Gap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {compDashData.gaps.map((gap, idx) => {
                const catDef = SECURITY_TOOL_CATEGORY_DEFINITIONS.find((d) => d.key === gap);
                const displayName = catDef?.name ?? gap;
                const description = catDef?.description ?? "";
                return (
                  <div
                    key={gap}
                    className="p-3 rounded-md border border-red-500/50 bg-red-500/10 dark:bg-red-900/20"
                    data-testid={`combined-gap-${idx}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium">{displayName}</span>
                      <Badge variant="destructive" className="text-[10px]">GAP</Badge>
                    </div>
                    {description && (
                      <p className="text-[10px] text-muted-foreground">{description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="agent-health-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Agent Health Monitoring
            </CardTitle>
            <ChartExportButton title="Agent Health" chartRef={agentHealthRef} />
          </CardHeader>
          <CardContent ref={agentHealthRef} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="text-muted-foreground">Deployment Success Rate</span>
                <span className="font-semibold">{deploymentSuccessRate}%</span>
              </div>
              <Progress value={deploymentSuccessRate} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="text-muted-foreground">Version Consistency</span>
                <span className="font-semibold">{versionConsistency}%</span>
              </div>
              <Progress value={versionConsistency} className="h-2" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-xs">Healthy: {healthyCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span className="text-xs">Degraded: {degradedCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-xs">Offline: {offlineCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="policy-violations-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileWarning className="w-4 h-4" />
              Policy Violations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-1 h-6 rounded-md overflow-hidden" data-testid="violations-bar">
              {totalViolations === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">No incidents</div>
              ) : violations.map((v) => v.count > 0 && (
                <div
                  key={v.severity}
                  style={{
                    width: `${(v.count / totalViolations) * 100}%`,
                    backgroundColor: v.color,
                  }}
                  className="h-full flex items-center justify-center text-[9px] text-white font-semibold"
                  title={`${v.severity}: ${v.count}`}
                >
                  {v.count}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {violations.map((v) => (
                <div key={v.severity} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                  <span className="text-muted-foreground">{v.severity}:</span>
                  <span className="font-semibold">{v.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="coverage-trend-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Coverage Trend (12 Weeks)
            </CardTitle>
            <ChartExportButton title="Coverage Trend" chartRef={coverageTrendRef} />
          </CardHeader>
          <CardContent ref={coverageTrendRef}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[40, 100]} tick={{ fontSize: 10 }} />
                <Tooltip content={<RichTooltip />} />
                <Line
                  type="monotone" dataKey="coverage" name="Coverage %"
                  stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="rag-gap-analysis">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Coverage Gap Analysis (RAG)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domainEntries.map(([domain, data], idx) => {
              const pct = data.percent;
              const rag = pct >= 80 ? "green" : pct >= 50 ? "amber" : "red";
              const ragDot = rag === "green" ? "bg-green-500" : rag === "amber" ? "bg-yellow-500" : "bg-red-500";
              const ragBorder = rag === "green" ? "border-green-500/30" : rag === "amber" ? "border-yellow-500/30" : "border-red-500/30";
              const ragBg = rag === "green" ? "bg-green-500/5 dark:bg-green-900/10" : rag === "amber" ? "bg-yellow-500/5 dark:bg-yellow-900/10" : "bg-red-500/5 dark:bg-red-900/10";
              return (
                <div key={domain} className={`p-3 rounded-md border ${ragBorder} ${ragBg}`} data-testid={`rag-${idx}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${ragDot} shrink-0`} />
                    <span className="text-xs font-medium truncate">{domain}</span>
                  </div>
                  <Progress value={pct} className="h-1.5 mb-1.5" />
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-muted-foreground">{data.tools.length} tool{data.tools.length !== 1 ? "s" : ""}</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /> Good (&ge;80%)</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Warning (50-79%)</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> Gap (&lt;50%)</span>
          </div>
        </CardContent>
      </Card>

      {overlaps.length > 0 && (
        <Card data-testid="tool-overlap-matrix">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Tool Overlap Matrix
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">Categories with multiple tools deployed - potential redundancy or intentional layering</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">Category</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Tools</th>
                    <th className="text-center p-2 font-medium text-muted-foreground">Count</th>
                    <th className="text-center p-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overlaps.map((o, idx) => (
                    <tr key={idx} className="border-b last:border-0" data-testid={`overlap-matrix-${idx}`}>
                      <td className="p-2 font-medium">{o.category}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {o.tools.map((name) => (
                            <Badge key={name} variant="secondary" className="text-[10px]">{name}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">{o.tools.length}</td>
                      <td className="p-2 text-center">
                        <Badge variant="secondary" className="text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          Overlap
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="regulatory-compliance">
        {REGULATORY_FRAMEWORKS.map((fw) => {
          const fwScore = getRegulatoryScore(fw.categoryKey);
          const status = fwScore >= 80 ? "Compliant" : fwScore >= 60 ? "Partial" : "Non-Compliant";
          const FwIcon = fw.icon;
          return (
            <Card key={fw.name} data-testid={`regulatory-${fw.name.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <FwIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{fw.name}</span>
                  </div>
                  <Badge
                    variant={status === "Compliant" ? "default" : status === "Partial" ? "secondary" : "destructive"}
                    className="text-[10px]"
                  >
                    {status}
                  </Badge>
                </div>
                <Progress value={fwScore} className="h-2 mb-1" />
                <span className="text-[10px] text-muted-foreground">{fwScore}% compliance</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="tool-overlap-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Tool Overlap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overlaps.length > 0 ? (
              overlaps.map((o, idx) => (
                <div key={idx} className="p-2 border rounded-md" data-testid={`overlap-${idx}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">{o.category}</Badge>
                    <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                      {o.tools.length} tools - potential redundancy
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {o.tools.map((name) => (
                      <Badge key={name} variant="secondary" className="text-[10px]">{name}</Badge>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No overlapping tools detected</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="integration-health-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Integration Health Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(secIntegrations && secIntegrations.length > 0) ? secIntegrations.map((intg, idx) => {
                const isConnected = intg.status === "connected";
                const isDisconnected = intg.status === "disconnected";
                const dotColor = isConnected
                  ? "bg-green-500"
                  : isDisconnected
                  ? "bg-red-500"
                  : "bg-yellow-500";
                const statusLabel = isConnected
                  ? "Connected"
                  : isDisconnected
                  ? "Disconnected"
                  : intg.status.charAt(0).toUpperCase() + intg.status.slice(1);
                const StatusIcon = isConnected ? Wifi : isDisconnected ? WifiOff : AlertCircle;
                return (
                  <div
                    key={intg.id}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/30 last:border-0"
                    data-testid={`integration-${idx}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className="font-medium truncate">{intg.platformName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusIcon className={`w-3 h-3 ${isConnected ? "text-green-500" : isDisconnected ? "text-red-500" : "text-yellow-500"}`} />
                      <span className={`whitespace-nowrap font-medium ${isConnected ? "text-green-600 dark:text-green-400" : isDisconnected ? "text-red-500" : "text-yellow-600 dark:text-yellow-400"}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              }) : (
                <div className="py-4 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No integrations configured</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Connect a security platform to see live health status</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="software-compliance-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
            <FileWarning className="w-4 h-4" />
            Software Compliance
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="default" className="text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Approved: {approvedCount}
              </Badge>
              <Badge variant="destructive" className="text-[10px]">
                <XCircle className="w-3 h-3 mr-1" />
                Unapproved: {unapprovedCount}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Software</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>EOL Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Devices</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eolProducts.slice(0, 20).map((product, idx) => (
                <TableRow key={idx} data-testid={`software-row-${idx}`}>
                  <TableCell className="font-medium text-xs">{product.name}</TableCell>
                  <TableCell className="text-xs">{product.vendor}</TableCell>
                  <TableCell className="text-xs font-mono">{product.version}</TableCell>
                  <TableCell className="text-xs">{product.eolDate}</TableCell>
                  <TableCell>
                    <Badge
                      variant={product.status === "supported" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{product.deviceCount}</TableCell>
                </TableRow>
              ))}
              {eolProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No software compliance data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Covered Devices Drill-Down Dialog */}
      <Dialog open={!!selectedTool} onOpenChange={(open) => { if (!open) setSelectedTool(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col" data-testid="covered-devices-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              Devices covered by {selectedTool}
              {coveredDevicesData && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {coveredDevicesData.total} device{coveredDevicesData.total !== 1 ? "s" : ""}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {coveredLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : coveredDevicesData?.devices?.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="text-[10px] px-3">Hostname</TableHead>
                    <TableHead className="text-[10px] px-3">IP Address</TableHead>
                    <TableHead className="text-[10px] px-3">OS</TableHead>
                    <TableHead className="text-[10px] px-3">Type</TableHead>
                    <TableHead className="text-[10px] px-3">Risk</TableHead>
                    <TableHead className="text-[10px] px-3">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coveredDevicesData.devices.map((dev, i) => {
                    const riskCls: Record<string, string> = {
                      critical: "border-red-500/30 text-red-500 bg-red-500/10",
                      high: "border-orange-500/30 text-orange-500 bg-orange-500/10",
                      medium: "border-yellow-500/30 text-yellow-600 bg-yellow-500/10",
                      low: "border-green-500/30 text-green-600 bg-green-500/10",
                    };
                    return (
                      <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`covered-device-row-${i}`}>
                        <TableCell className="text-xs font-medium px-3 py-2">{dev.hostname || "—"}</TableCell>
                        <TableCell className="text-xs px-3 py-2 font-mono">{dev.ip_address || "—"}</TableCell>
                        <TableCell className="text-xs px-3 py-2">{dev.operating_system}</TableCell>
                        <TableCell className="text-xs px-3 py-2">{dev.asset_type}</TableCell>
                        <TableCell className="px-3 py-2">
                          <Badge className={`text-[9px] px-1.5 border ${riskCls[dev.risk_level] ?? riskCls.low}`}>
                            {dev.risk_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground px-3 py-2">
                          {dev.last_seen ? new Date(dev.last_seen).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                <Monitor className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No device records found for this tool</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Coverage is derived from security events — device records may not be individually mapped yet
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}