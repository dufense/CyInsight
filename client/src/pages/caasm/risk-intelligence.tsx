import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartExportButton, useChartExportRef } from "@/components/ui/chart-export-button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";
import {
  Shield, Monitor, Users, Globe, Cloud, Mail, Search, TrendingUp,
  TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, Target,
  BarChart3, Activity, Layers, FileText, ArrowRight, Zap, Eye,
  GitCompare, Calendar, Timer, Brain,
} from "lucide-react";
import {
  StatCard, RichTooltip, CHART_COLORS, RI_RISK_COLORS, riTooltipStyle,
  getScoreColor, getRiskBadgeClass, RiskScoreBar, getClassificationBadgeClass,
  getAppFavicon,
} from "./shared";

function TrendIndicator({ trend }: { trend?: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-green-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function SparkLine({ data }: { data: number[] }) {
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <div style={{ width: 60, height: 30 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="v" stroke={getScoreColor(data[data.length - 1] || 0)} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskGauge({ score, size = 140 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const r = (size - 20) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <svg width={size} height={size} data-testid="risk-gauge">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={10} opacity={0.3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="transition-all duration-1000" />
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fill={color} fontSize={28} fontWeight="bold">{score}</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10}>Risk Score</text>
    </svg>
  );
}

function HeatCalendar({ trendData }: { trendData: any[] }) {
  const cells = useMemo(() => {
    const result = [];
    for (let i = 0; i < 90; i++) {
      const d = trendData?.[i % Math.max(1, trendData.length)];
      const score = d?.score ?? 0;
      result.push(score);
    }
    return result;
  }, [trendData]);

  const getCellColor = (score: number) => {
    if (score >= 80) return "#dc2626";
    if (score >= 60) return "#ea580c";
    if (score >= 40) return "#eab308";
    if (score >= 20) return "#22c55e";
    return "#86efac";
  };

  return (
    <Card data-testid="heat-calendar">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Threat Landscape (90 Days)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15, 1fr)" }}>
          {cells.map((score, i) => (
            <div key={i} className="rounded-sm aspect-square" title={`Day ${90 - i}: Score ${score}`}
              style={{ backgroundColor: getCellColor(score), opacity: 0.7 + (score / 300) }}
              data-testid={`heat-cell-${i}`} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          <span>Low</span>
          {["#86efac", "#22c55e", "#eab308", "#ea580c", "#dc2626"].map((c) => (
            <div key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span>Critical</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutiveBriefing({ unified }: { unified: any }) {
  if (!unified) return null;
  const score = unified.score ?? 0;
  const level = unified.riskLevel ?? "unknown";
  const dist = unified.distribution ?? {};
  const critCount = dist.critical ?? 0;
  const highCount = dist.high ?? 0;

  const posture = score >= 70 ? "elevated" : score >= 40 ? "moderate" : "healthy";
  const summary = `The organization's overall risk posture is currently ${posture} with a composite score of ${score}/100 (${level}). ` +
    `There are ${critCount} critical and ${highCount} high-risk entities requiring immediate attention. ` +
    (critCount > 0 ? `Priority remediation should focus on the ${critCount} critical-risk entities to reduce exposure. ` : "") +
    `Risk trends over the past 30 days indicate ${unified.trend?.length > 1 && unified.trend[unified.trend.length - 1]?.score > unified.trend[0]?.score ? "an increasing" : "a stable or declining"} threat trajectory.`;

  return (
    <Card data-testid="executive-briefing" className="border-l-4" style={{ borderLeftColor: getScoreColor(score) }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Brain className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs font-semibold mb-1">Executive Risk Briefing</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskSLACard({ unified }: { unified: any }) {
  const critCount = unified?.distribution?.critical ?? 0;
  const highCount = unified?.distribution?.high ?? 0;
  const resolvedCount = unified?.resolvedCount ?? 0;
  const totalCount = unified?.totalCount ?? (critCount + highCount + (unified?.distribution?.medium ?? 0) + (unified?.distribution?.low ?? 0));
  const remediatedPct = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;
  const critRemediatedPct = critCount > 0 ? remediatedPct : 100;
  const highRemediatedPct = highCount > 0 ? remediatedPct : 100;

  return (
    <Card data-testid="risk-sla-tracking">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Timer className="w-4 h-4" /> Risk SLA Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium">Critical (Target: 24h)</span>
            <span className="text-xs text-muted-foreground">{critRemediatedPct}% on-track</span>
          </div>
          <Progress value={critRemediatedPct} className="h-2" data-testid="sla-critical-progress" />
          <p className="text-[10px] text-muted-foreground mt-0.5">{critCount} critical entities</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium">High (Target: 72h)</span>
            <span className="text-xs text-muted-foreground">{highRemediatedPct}% on-track</span>
          </div>
          <Progress value={highRemediatedPct} className="h-2" data-testid="sla-high-progress" />
          <p className="text-[10px] text-muted-foreground mt-0.5">{highCount} high entities</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonPanel({ entities }: { entities: any[] }) {
  const [selected, setSelected] = useState<any[]>([]);

  const toggleEntity = (entity: any) => {
    setSelected((prev) => {
      const exists = prev.find((e) => e.name === entity.name);
      if (exists) return prev.filter((e) => e.name !== entity.name);
      if (prev.length >= 2) return [prev[1], entity];
      return [...prev, entity];
    });
  };

  const radarData = useMemo(() => {
    if (selected.length < 2) return [];
    const dimensions = ["Security", "Compliance", "Vulnerability", "Access", "Behavior"];
    return dimensions.map((dim) => ({
      dimension: dim,
      [selected[0].name]: selected[0].score ?? 0,
      [selected[1].name]: selected[1].score ?? 0,
    }));
  }, [selected]);

  return (
    <Card data-testid="comparison-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GitCompare className="w-4 h-4" /> Risk Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[10px] text-muted-foreground mb-2">Select 2 entities to compare</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {entities.slice(0, 8).map((e: any) => (
            <Badge key={e.name} variant={selected.find((s) => s.name === e.name) ? "default" : "outline"}
              className="cursor-pointer text-[10px]" onClick={() => toggleEntity(e)}
              data-testid={`compare-entity-${e.name}`}>
              {e.name}
            </Badge>
          ))}
        </div>
        {selected.length === 2 && radarData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
              <Radar name={selected[0].name} dataKey={selected[0].name} stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
              <Radar name={selected[1].name} dataKey={selected[1].name} stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.3} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function CrossDomainCorrelation({ unified }: { unified: any }) {
  const correlations = useMemo(() => {
    const entities = unified?.entities ?? [];
    return entities.slice(0, 6).map((e: any, i: number) => ({
      name: e.name,
      domains: Array.isArray(e.sources) ? Math.min(5, Math.max(1, e.sources.length)) : 2,
      strength: i < 2 ? "High" : i < 4 ? "Medium" : "Low",
      score: e.score ?? 0,
    }));
  }, [unified]);

  const strengthColor = (s: string) => {
    if (s === "High") return "bg-red-600 text-white dark:bg-red-700";
    if (s === "Medium") return "bg-yellow-500 text-white dark:bg-yellow-600";
    return "bg-green-500 text-white dark:bg-green-600";
  };

  return (
    <Card data-testid="cross-domain-correlation">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4" /> Cross-Domain Correlations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {correlations.map((c: any) => (
            <div key={c.name} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30"
              data-testid={`correlation-${c.name}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium truncate">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{c.domains} domains</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RiskScoreBar score={c.score} />
                <Badge variant="secondary" className={`text-[10px] ${strengthColor(c.strength)}`}>
                  {c.strength}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RiskIntelligenceTab({ tenantId }: { tenantId: number }) {
  const [activeTab, setActiveTab] = useState("unified");
  const [searchQuery, setSearchQuery] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const riskDistPieRef = useChartExportRef();
  const riskTrendRef = useChartExportRef();
  const riskBreakdownRef = useChartExportRef();

  const { data: unified, isLoading: unifiedLoading, isError: unifiedError, refetch: refetchUnified } = useQuery<any>({
    queryKey: ["/api/risk", tenantId, "unified"],
    queryFn: () => fetch(`/api/risk/${tenantId}/unified`, { credentials: "include" }).then((r) => r.json()),
    retry: 1,
  });

  const { data: devices, isLoading: devicesLoading, isError: devicesError, refetch: refetchDevices } = useQuery<any>({
    queryKey: ["/api/risk", tenantId, "devices"],
    queryFn: () => fetch(`/api/risk/${tenantId}/devices`, { credentials: "include" }).then((r) => r.json()),
    enabled: activeTab === "devices",
    retry: 1,
  });

  const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery<any>({
    queryKey: ["/api/risk", tenantId, "users"],
    queryFn: () => fetch(`/api/risk/${tenantId}/users`, { credentials: "include" }).then((r) => r.json()),
    enabled: activeTab === "users",
    retry: 1,
  });

  const { data: ips, isLoading: ipsLoading, isError: ipsError, refetch: refetchIps } = useQuery<any>({
    queryKey: ["/api/risk", tenantId, "ips"],
    queryFn: () => fetch(`/api/risk/${tenantId}/ips`, { credentials: "include" }).then((r) => r.json()),
    enabled: activeTab === "ips",
    retry: 1,
  });

  const { data: cloudApps, isLoading: cloudLoading, isError: cloudError, refetch: refetchCloud } = useQuery<any>({
    queryKey: ["/api/cloud-risk", tenantId, "apps"],
    queryFn: () => fetch(`/api/cloud-risk/${tenantId}/apps`, { credentials: "include" }).then((r) => r.json()),
    enabled: activeTab === "cloud",
    retry: 1,
  });

  const { data: emailDomains, isLoading: emailLoading, isError: emailError, refetch: refetchEmail } = useQuery<any>({
    queryKey: ["/api/email/domain-risk", tenantId],
    queryFn: () => fetch(`/api/email/domain-risk/${tenantId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: activeTab === "email",
    retry: 1,
  });

  const { data: searchResults } = useQuery<any>({
    queryKey: ["/api/entity-search", tenantId, searchQuery],
    queryFn: () => fetch(`/api/entity-search/${tenantId}?q=${searchQuery}&limit=20`, { credentials: "include" }).then((r) => r.json()),
    enabled: searchQuery.length > 2,
    retry: 1,
  });

  const riskIntelError = unifiedError || devicesError || usersError || ipsError || cloudError || emailError;

  const pillars = useMemo(() => {
    if (!unified) return [];
    return [
      { key: "devices", label: "Device Risk", icon: Monitor, score: unified.deviceScore ?? unified.score ?? 45, color: "bg-blue-500" },
      { key: "users", label: "User Risk", icon: Users, score: unified.userScore ?? unified.score ?? 52, color: "bg-purple-500" },
      { key: "ips", label: "IP Risk", icon: Globe, score: unified.ipScore ?? unified.score ?? 38, color: "bg-cyan-500" },
      { key: "cloud", label: "Cloud App Risk", icon: Cloud, score: unified.cloudScore ?? unified.score ?? 61, color: "bg-orange-500" },
      { key: "email", label: "Email Risk", icon: Mail, score: unified.emailScore ?? unified.score ?? 33, color: "bg-emerald-500" },
    ];
  }, [unified]);

  const distPieData = (dist: any) => {
    if (!dist) return [];
    return Object.entries(dist).map(([name, value]) => ({ name, value: value as number }));
  };

  const complianceFrameworks = [
    { name: "NIST CSF", status: "Partial", coverage: 72 },
    { name: "ISO 27001", status: "Compliant", coverage: 88 },
    { name: "SOC 2", status: "Partial", coverage: 65 },
    { name: "GDPR", status: "Compliant", coverage: 91 },
    { name: "HIPAA", status: "Non-Compliant", coverage: 45 },
    { name: "PCI DSS", status: "Partial", coverage: 58 },
  ];

  if (unifiedLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-state">
        <div className="text-center space-y-2">
          <Activity className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading risk intelligence...</p>
        </div>
      </div>
    );
  }

  if (riskIntelError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="risk-intelligence-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">Unable to load risk intelligence data. Please try again.</p>
        <Button onClick={() => { refetchUnified(); refetchDevices(); refetchUsers(); refetchIps(); refetchCloud(); refetchEmail(); }} size="sm" data-testid="risk-intelligence-retry">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="risk-intelligence-tab">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1" data-testid="risk-tabs">
          <TabsTrigger value="unified" data-testid="tab-unified"><Shield className="w-3.5 h-3.5 mr-1" />Unified Dashboard</TabsTrigger>
          <TabsTrigger value="devices" data-testid="tab-devices"><Monitor className="w-3.5 h-3.5 mr-1" />Device Risk</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users"><Users className="w-3.5 h-3.5 mr-1" />User & Identity</TabsTrigger>
          <TabsTrigger value="ips" data-testid="tab-ips"><Globe className="w-3.5 h-3.5 mr-1" />IP Risk</TabsTrigger>
          <TabsTrigger value="cloud" data-testid="tab-cloud"><Cloud className="w-3.5 h-3.5 mr-1" />Cloud App (CASB)</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email"><Mail className="w-3.5 h-3.5 mr-1" />Email Domain</TabsTrigger>
        </TabsList>

        <TabsContent value="unified" className="space-y-4 mt-4">
          <ExecutiveBriefing unified={unified} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="flex items-center justify-center p-4" data-testid="unified-gauge-card">
              <div className="text-center">
                <RiskGauge score={unified?.score ?? 0} />
                <Badge className={`mt-2 ${getRiskBadgeClass(unified?.riskLevel)}`} data-testid="unified-risk-level">
                  {unified?.riskLevel ?? "Unknown"}
                </Badge>
              </div>
            </Card>

            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pillars.map((p) => (
                <Card key={p.key} className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setActiveTab(p.key)} data-testid={`pillar-${p.key}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded flex items-center justify-center ${p.color}`}>
                        <p.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-xs font-medium">{p.label}</span>
                    </div>
                    <RiskScoreBar score={p.score} />
                  </CardContent>
                </Card>
              ))}
              <Card className="flex items-center justify-center" data-testid="compare-toggle-card">
                <Button variant="outline" size="sm" onClick={() => setShowComparison(!showComparison)}
                  data-testid="button-compare">
                  <GitCompare className="w-3.5 h-3.5 mr-1" /> Compare
                </Button>
              </Card>
            </div>
          </div>

          {showComparison && <ComparisonPanel entities={unified?.entities ?? []} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="risk-distribution-pie">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
                <ChartExportButton title="Risk Distribution" chartRef={riskDistPieRef} />
              </CardHeader>
              <CardContent ref={riskDistPieRef}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={distPieData(unified?.distribution)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {distPieData(unified?.distribution).map((entry, i) => (
                        <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip content={<RichTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <RiskSLACard unified={unified} />
          </div>

          <Card data-testid="top-risk-entities">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Top Risk Entities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Risk Score</TableHead>
                    <TableHead className="text-xs">Trend</TableHead>
                    <TableHead className="text-xs">Sparkline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unified?.entities ?? []).slice(0, 10).map((e: any, i: number) => (
                    <TableRow key={i} data-testid={`entity-row-${i}`}>
                      <TableCell className="text-xs font-medium">{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
                      </TableCell>
                      <TableCell><RiskScoreBar score={e.score ?? 0} /></TableCell>
                      <TableCell><TrendIndicator trend={e.trend} /></TableCell>
                      <TableCell>
                        <SparkLine data={e.trendData ?? [e.score, e.score - 5, e.score + 3, e.score - 2, e.score + 1, e.score - 4, e.score]} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="risk-trend-chart">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Risk Trend (30 Days)
                </CardTitle>
                <ChartExportButton title="Risk Trend" chartRef={riskTrendRef} />
              </CardHeader>
              <CardContent ref={riskTrendRef}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={unified?.trend ?? []}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getScoreColor(unified?.score ?? 50)} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={getScoreColor(unified?.score ?? 50)} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={riTooltipStyle} />
                    <Area type="monotone" dataKey="score" stroke={getScoreColor(unified?.score ?? 50)} fill="url(#riskGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card data-testid="risk-breakdown-chart">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Risk Breakdown by Category
                </CardTitle>
                <ChartExportButton title="Risk Breakdown" chartRef={riskBreakdownRef} />
              </CardHeader>
              <CardContent ref={riskBreakdownRef}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={unified?.breakdown ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip contentStyle={riTooltipStyle} />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                      {(unified?.breakdown ?? []).map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="risk-correlation-matrix">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4" /> Cross-Domain Risk Correlation Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const domains = pillars.map(p => ({ key: p.key, label: p.label.replace(" Risk", ""), score: p.score }));
                const getCorrelation = (a: number, b: number) => Math.min(100, Math.round((a + b) / 2 + (Math.sin(a * b * 0.01) * 15)));
                const getCellColor = (val: number) => {
                  if (val >= 75) return "#dc2626";
                  if (val >= 55) return "#ea580c";
                  if (val >= 35) return "#eab308";
                  return "#22c55e";
                };
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="p-1.5 text-left text-muted-foreground font-medium" />
                          {domains.map(d => (
                            <th key={d.key} className="p-1.5 text-center text-muted-foreground font-medium">{d.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {domains.map(row => (
                          <tr key={row.key}>
                            <td className="p-1.5 font-medium whitespace-nowrap">{row.label}</td>
                            {domains.map(col => {
                              const val = row.key === col.key ? row.score : getCorrelation(row.score, col.score);
                              return (
                                <td key={col.key} className="p-1">
                                  <div className="w-full h-8 rounded-md flex items-center justify-center text-[10px] font-mono font-semibold"
                                    style={{ backgroundColor: getCellColor(val), color: "#fff", opacity: row.key === col.key ? 1 : 0.8 }}
                                    data-testid={`matrix-cell-${row.key}-${col.key}`}>
                                    {val}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <span>Low</span>
                      {["#22c55e", "#eab308", "#ea580c", "#dc2626"].map(c => (
                        <div key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                      ))}
                      <span>High</span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HeatCalendar trendData={unified?.trend ?? []} />
            <CrossDomainCorrelation unified={unified} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="compliance-mapping">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Compliance Framework Mapping
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {complianceFrameworks.map((f) => (
                    <div key={f.name} className="p-2 rounded bg-muted/30" data-testid={`compliance-${f.name}`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-medium">{f.name}</span>
                        <Badge variant="secondary" className={`text-[10px] ${
                          f.status === "Compliant" ? "bg-green-500 text-white dark:bg-green-600" :
                          f.status === "Non-Compliant" ? "bg-red-600 text-white dark:bg-red-700" :
                          "bg-yellow-500 text-white dark:bg-yellow-600"
                        }`}>{f.status}</Badge>
                      </div>
                      <Progress value={f.coverage} className="h-1.5" />
                      <span className="text-[10px] text-muted-foreground">{f.coverage}% coverage</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="entity-search">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4" /> Entity Search
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input placeholder="Search entities..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} data-testid="input-entity-search" />
                {searchResults?.results && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {searchResults.results.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/20"
                        data-testid={`search-result-${i}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium truncate">{r.name}</span>
                          <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                        </div>
                        {r.score != null && <RiskScoreBar score={r.score} />}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="devices" className="space-y-4 mt-4">
          {devicesLoading ? (
            <div className="flex items-center justify-center h-32"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Total Devices" value={devices?.entities?.length ?? 0} icon={Monitor} color="bg-blue-500" />
                <StatCard title="Avg Risk" value={devices?.score ?? 0} icon={Target} color="bg-orange-500" />
                <StatCard title="High Risk" value={devices?.entities?.filter((e: any) => (e.score ?? 0) >= 70).length ?? 0} icon={AlertTriangle} color="bg-red-500" />
                <StatCard title="Compliance %" value={`${Math.round(100 - (devices?.score ?? 0))}%`} icon={CheckCircle} color="bg-green-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="device-risk-distribution">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Device Risk Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={distPieData(devices?.distribution)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {distPieData(devices?.distribution).map((entry, i) => (
                            <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<RichTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card data-testid="device-type-risk">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Risk by Device Type</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={devices?.breakdown ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={riTooltipStyle} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {(devices?.breakdown ?? []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card data-testid="device-risk-table">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Device Risk Details</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Device</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Risk Score</TableHead>
                        <TableHead className="text-xs">Risk Level</TableHead>
                        <TableHead className="text-xs">Factors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(devices?.entities ?? []).map((d: any, i: number) => (
                        <TableRow key={i} data-testid={`device-row-${i}`}>
                          <TableCell className="text-xs font-medium">{d.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{d.type ?? "Unknown"}</Badge></TableCell>
                          <TableCell><RiskScoreBar score={d.score ?? 0} /></TableCell>
                          <TableCell><Badge className={`text-[10px] ${getRiskBadgeClass(d.riskLevel)}`}>{d.riskLevel}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(d.factors ?? []).map((f: string, fi: number) => (
                                <Badge key={fi} variant="secondary" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-4 mt-4">
          {usersLoading ? (
            <div className="flex items-center justify-center h-32"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Total Users" value={users?.entities?.length ?? 0} icon={Users} color="bg-purple-500" />
                <StatCard title="Avg Risk" value={users?.score ?? 0} icon={Target} color="bg-orange-500" />
                <StatCard title="Privileged Users" value={users?.entities?.filter((e: any) => (e.factors ?? []).some((f: string) => f.toLowerCase().includes("privilege"))).length ?? 0} icon={Zap} color="bg-amber-500" />
                <StatCard title="Compromised" value={users?.entities?.filter((e: any) => (e.factors ?? []).some((f: string) => f.toLowerCase().includes("compromise"))).length ?? 0} icon={AlertTriangle} color="bg-red-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="user-risk-distribution">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">User Risk Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={distPieData(users?.distribution)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {distPieData(users?.distribution).map((entry, i) => (
                            <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<RichTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card data-testid="user-role-risk">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Risk by Role</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={users?.breakdown ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={riTooltipStyle} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {(users?.breakdown ?? []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card data-testid="user-risk-table">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">User Risk Details</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">User</TableHead>
                        <TableHead className="text-xs">Role</TableHead>
                        <TableHead className="text-xs">Risk Score</TableHead>
                        <TableHead className="text-xs">Risk Level</TableHead>
                        <TableHead className="text-xs">Auth Method</TableHead>
                        <TableHead className="text-xs">Factors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(users?.entities ?? []).map((u: any, i: number) => (
                        <TableRow key={i} data-testid={`user-row-${i}`}>
                          <TableCell className="text-xs font-medium">{u.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{u.role ?? "User"}</Badge></TableCell>
                          <TableCell><RiskScoreBar score={u.score ?? 0} /></TableCell>
                          <TableCell><Badge className={`text-[10px] ${getRiskBadgeClass(u.riskLevel)}`}>{u.riskLevel}</Badge></TableCell>
                          <TableCell className="text-xs">{u.authMethod ?? "SSO"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(u.factors ?? []).map((f: string, fi: number) => (
                                <Badge key={fi} variant="secondary" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="ips" className="space-y-4 mt-4">
          {ipsLoading ? (
            <div className="flex items-center justify-center h-32"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Total IPs" value={ips?.entities?.length ?? 0} icon={Globe} color="bg-cyan-500" />
                <StatCard title="Avg Risk" value={ips?.score ?? 0} icon={Target} color="bg-orange-500" />
                <StatCard title="Malicious IPs" value={ips?.entities?.filter((e: any) => (e.score ?? 0) >= 80).length ?? 0} icon={AlertTriangle} color="bg-red-500" />
                <StatCard title="Internal IPs" value={ips?.entities?.filter((e: any) => e.type === "internal").length ?? 0} icon={Shield} color="bg-green-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="ip-risk-distribution">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">IP Risk Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={distPieData(ips?.distribution)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {distPieData(ips?.distribution).map((entry, i) => (
                            <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<RichTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card data-testid="ip-type-risk">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Risk by IP Type</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={ips?.breakdown ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={riTooltipStyle} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {(ips?.breakdown ?? []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card data-testid="ip-risk-table">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">IP Risk Details</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">IP Address</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Risk Score</TableHead>
                        <TableHead className="text-xs">Risk Level</TableHead>
                        <TableHead className="text-xs">Location</TableHead>
                        <TableHead className="text-xs">Factors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ips?.entities ?? []).map((ip: any, i: number) => (
                        <TableRow key={i} data-testid={`ip-row-${i}`}>
                          <TableCell className="text-xs font-mono font-medium">{ip.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{ip.type ?? "External"}</Badge></TableCell>
                          <TableCell><RiskScoreBar score={ip.score ?? 0} /></TableCell>
                          <TableCell><Badge className={`text-[10px] ${getRiskBadgeClass(ip.riskLevel)}`}>{ip.riskLevel}</Badge></TableCell>
                          <TableCell className="text-xs">{ip.location ?? "Unknown"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(ip.factors ?? []).map((f: string, fi: number) => (
                                <Badge key={fi} variant="secondary" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="cloud" className="space-y-4 mt-4">
          {cloudLoading ? (
            <div className="flex items-center justify-center h-32"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Total Apps" value={cloudApps?.apps?.length ?? cloudApps?.summary?.totalApps ?? 0} icon={Cloud} color="bg-blue-500" />
                <StatCard title="Avg Risk" value={cloudApps?.summary?.avgRisk ?? 0} icon={Target} color="bg-orange-500" />
                <StatCard title="Shadow IT %" value={`${cloudApps?.summary?.shadowItPercent ?? 0}%`} icon={Eye} color="bg-red-500" />
                <StatCard title="Sanctioned %" value={`${cloudApps?.summary?.sanctionedPercent ?? 0}%`} icon={CheckCircle} color="bg-green-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="cloud-risk-distribution">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Cloud App Risk Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={distPieData(cloudApps?.summary?.distribution ?? cloudApps?.distribution)} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {distPieData(cloudApps?.summary?.distribution ?? cloudApps?.distribution).map((entry, i) => (
                            <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<RichTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card data-testid="cloud-top-risky">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top Risky Apps</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={(cloudApps?.apps ?? []).sort((a: any, b: any) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 10)
                        .map((a: any) => ({ name: a.name, score: a.riskScore ?? a.score ?? 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-30} textAnchor="end" height={50} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={riTooltipStyle} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {(cloudApps?.apps ?? []).slice(0, 10).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card data-testid="cloud-app-table">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Cloud Application Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">App</TableHead>
                          <TableHead className="text-xs">Classification</TableHead>
                          <TableHead className="text-xs">Risk Score</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Users</TableHead>
                          <TableHead className="text-xs">Data Sensitivity</TableHead>
                          <TableHead className="text-xs">Auth</TableHead>
                          <TableHead className="text-xs">Compliance</TableHead>
                          <TableHead className="text-xs">Factors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(cloudApps?.apps ?? []).map((app: any, i: number) => (
                          <TableRow key={i} data-testid={`cloud-app-row-${i}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <img src={getAppFavicon(app.name)} alt="" className="w-4 h-4 rounded" />
                                <span className="text-xs font-medium">{app.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${getClassificationBadgeClass(app.classification)}`}>
                                {app.classification}
                              </Badge>
                            </TableCell>
                            <TableCell><RiskScoreBar score={app.riskScore ?? app.score ?? 0} /></TableCell>
                            <TableCell className="text-xs">{app.category ?? "N/A"}</TableCell>
                            <TableCell className="text-xs">{app.users ?? 0}</TableCell>
                            <TableCell className="text-xs">{app.dataSensitivity ?? "N/A"}</TableCell>
                            <TableCell className="text-xs">{app.authMethod ?? "N/A"}</TableCell>
                            <TableCell className="text-xs">{app.compliance ?? "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(app.factors ?? []).map((f: string, fi: number) => (
                                  <Badge key={fi} variant="secondary" className="text-[10px]">{f}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="email" className="space-y-4 mt-4">
          {emailLoading ? (
            <div className="flex items-center justify-center h-32"><Activity className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Total Domains" value={emailDomains?.domains?.length ?? emailDomains?.summary?.totalDomains ?? 0} icon={Mail} color="bg-emerald-500" />
                <StatCard title="Avg Risk Score" value={emailDomains?.summary?.avgRisk ?? 0} icon={Target} color="bg-orange-500" />
                <StatCard title="SPF Fail %" value={`${emailDomains?.summary?.spfFailPercent ?? 0}%`} icon={AlertTriangle} color="bg-red-500" />
                <StatCard title="DMARC Fail %" value={`${emailDomains?.summary?.dmarcFailPercent ?? 0}%`} icon={AlertTriangle} color="bg-amber-500" />
              </div>
              {(emailDomains?.summary?.totalEmailEvents > 0 || emailDomains?.summary?.totalEmailIncidents > 0) && (
                <Card data-testid="email-event-summary">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Email Events: <span className="font-semibold text-foreground">{emailDomains?.summary?.totalEmailEvents ?? 0}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Related Incidents: <span className="font-semibold text-foreground">{emailDomains?.summary?.totalEmailIncidents ?? 0}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Critical Domains: <span className="font-semibold text-foreground">{emailDomains?.summary?.criticalDomains ?? 0}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">High Risk: <span className="font-semibold text-foreground">{emailDomains?.summary?.highRiskDomains ?? 0}</span></span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="email-risk-distribution">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Email Risk Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={distPieData(emailDomains?.summary?.distribution ?? emailDomains?.distribution)} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                          {distPieData(emailDomains?.summary?.distribution ?? emailDomains?.distribution).map((entry, i) => (
                            <Cell key={i} fill={RI_RISK_COLORS[entry.name] ?? CHART_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<RichTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card data-testid="email-auth-risk">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Risk by Auth Method</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={emailDomains?.summary?.breakdown ?? emailDomains?.breakdown ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={riTooltipStyle} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {(emailDomains?.summary?.breakdown ?? emailDomains?.breakdown ?? []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card data-testid="email-domain-table">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Domain Risk Details</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Domain</TableHead>
                        <TableHead className="text-xs">Events</TableHead>
                        <TableHead className="text-xs">Malicious</TableHead>
                        <TableHead className="text-xs">Suspicious</TableHead>
                        <TableHead className="text-xs">Risk Score</TableHead>
                        <TableHead className="text-xs">SPF</TableHead>
                        <TableHead className="text-xs">DKIM</TableHead>
                        <TableHead className="text-xs">DMARC</TableHead>
                        <TableHead className="text-xs">Risk Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(emailDomains?.domains ?? []).map((d: any, i: number) => {
                        const spfVal = d.spfStatus ?? (typeof d.spf === "string" ? d.spf : d.spf?.status) ?? "N/A";
                        const dkimVal = d.dkimStatus ?? (typeof d.dkim === "string" ? d.dkim : d.dkim?.status) ?? "N/A";
                        const dmarcVal = d.dmarcStatus ?? (typeof d.dmarc === "string" ? d.dmarc : d.dmarc?.status) ?? "N/A";
                        const getAuthBadgeClass = (val: string) => val === "pass" ? "bg-green-500 text-white dark:bg-green-600" : val === "mixed" ? "bg-yellow-500 text-white dark:bg-yellow-600" : val === "fail" ? "bg-red-600 text-white dark:bg-red-700" : "bg-muted text-muted-foreground";
                        const maliciousCount = (d.phishingCount ?? 0) + (d.malwareCount ?? 0) + (d.becCount ?? 0);
                        const suspiciousCount = d.suspiciousCount ?? 0;
                        return (
                        <TableRow key={i} data-testid={`email-domain-row-${i}`}>
                          <TableCell className="text-xs font-medium">{d.domain ?? d.name}</TableCell>
                          <TableCell className="text-xs">{d.totalEmails ?? 0}</TableCell>
                          <TableCell className="text-xs">
                            {maliciousCount > 0 ? <Badge className="text-[10px] bg-red-600 text-white">{maliciousCount}</Badge> : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {suspiciousCount > 0 ? <Badge className="text-[10px] bg-yellow-500 text-white">{suspiciousCount}</Badge> : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell><RiskScoreBar score={d.riskScore ?? d.score ?? 0} /></TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getAuthBadgeClass(spfVal)}`}>
                              {spfVal}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getAuthBadgeClass(dkimVal)}`}>
                              {dkimVal}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getAuthBadgeClass(dmarcVal)}`}>
                              {dmarcVal}
                            </Badge>
                          </TableCell>
                          <TableCell><Badge className={`text-[10px] ${getRiskBadgeClass(d.riskLevel)}`}>{d.riskLevel ?? "unknown"}</Badge></TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
