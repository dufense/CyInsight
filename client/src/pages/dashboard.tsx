import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import {
  AlertTriangle, Shield, Ticket, TrendingUp, TrendingDown, Activity, ArrowUpRight,
  Mail, Monitor, Bug, Crosshair, Target, Skull, AppWindow, Globe, Cloud, Lock,
  ShieldAlert, ShieldCheck, ShieldOff, Wifi, Database, Eye, Zap, Clock, Timer,
  Server, AlertCircle, FileWarning, Ban, CheckCircle2, XCircle, Gauge, Radio,
  Network, Fingerprint, KeyRound, UserX, Upload, Download, Search, Radar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap,
} from "recharts";

const C = {
  blue: "hsl(217, 91%, 55%)", green: "hsl(142, 76%, 45%)", purple: "hsl(269, 80%, 58%)",
  orange: "hsl(32, 95%, 52%)", red: "hsl(340, 82%, 52%)", teal: "hsl(180, 70%, 45%)",
  yellow: "hsl(45, 90%, 50%)", pink: "hsl(300, 60%, 50%)", lime: "hsl(120, 60%, 40%)",
  sky: "hsl(200, 80%, 60%)", indigo: "hsl(245, 72%, 55%)", amber: "hsl(38, 92%, 50%)",
  rose: "hsl(350, 89%, 60%)", emerald: "hsl(160, 84%, 39%)", cyan: "hsl(190, 95%, 39%)",
};
const PALETTE = [C.blue, C.green, C.purple, C.orange, C.red, C.teal, C.yellow, C.pink, C.lime, C.sky, C.indigo, C.amber];
const SEV: Record<string, string> = { critical: C.red, high: C.orange, medium: C.blue, low: C.green, info: "hsl(210, 10%, 50%)" };

const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

const THREAT_ICONS: Record<string, any> = {
  Ransomware: Skull, Phishing: Mail, Malware: Bug, "Social Engineering": Fingerprint,
  "C2": Radio, "Credential Theft": KeyRound, Trojan: ShieldOff, Rootkit: ShieldAlert,
  "Web Attack": Globe, "Cloud Misuse": Cloud, "Data Loss": Upload, "Identity Attack": UserX,
  Spam: Ban, "Network Intrusion": Network, Vulnerability: FileWarning, Fileless: Eye,
  Cryptojacking: Zap, Spyware: Search, PUP: AlertCircle, "Cloud Misconfiguration": Cloud,
  "Lateral Movement": ArrowUpRight, Reconnaissance: Radar, "Web Security": Globe,
};

function getThreatIcon(vector: string) {
  return THREAT_ICONS[vector] || ShieldAlert;
}

function RiskGauge({ score, label, size = 120 }: { score: number; label: string; size?: number }) {
  const color = score >= 80 ? C.red : score >= 60 ? C.orange : score >= 40 ? C.yellow : C.green;
  const r = size / 2 - 10;
  const circumference = Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 15} viewBox={`0 0 ${size} ${size / 2 + 15}`}>
        <path d={`M 10 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2 + 5}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round" />
        <path d={`M 10 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2 + 5}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000" />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={color}
          fontSize="22" fontWeight="700">{score}</text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, color, trend }: {
  title: string; value: string | number; sub?: string; icon: any; color?: string; trend?: "up" | "down";
}) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: color || C.blue }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {sub && (
              <div className="flex items-center gap-1">
                {trend === "up" && <TrendingUp className="w-3 h-3 text-chart-2" />}
                {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className="text-[10px] text-muted-foreground">{sub}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: `${color || C.blue}20` }}>
            <Icon className="w-5 h-5" style={{ color: color || C.blue }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Top10({ title, data, icon: Icon, showBar = true }: {
  title: string; data: { name: string; count: number }[]; icon: any; showBar?: boolean;
}) {
  const max = data.length > 0 ? data[0].count : 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
          <Icon className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No data</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((item, idx) => {
              const TIcon = getThreatIcon(item.name);
              return (
                <div key={idx} className="flex items-center gap-2" data-testid={`top10-row-${idx}`}>
                  <span className="text-[10px] text-muted-foreground w-4 text-right font-mono">{idx + 1}</span>
                  <TIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] truncate">{item.name}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0 h-5">{item.count}</Badge>
                    </div>
                    {showBar && (
                      <div className="w-full bg-muted/30 rounded-full h-1 mt-0.5">
                        <div className="h-1 rounded-full transition-all duration-500"
                          style={{ width: `${(item.count / max) * 100}%`, backgroundColor: PALETTE[idx % PALETTE.length] }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniPie({ data, colors }: { data: { name: string; value: number }[]; colors?: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
          {data.map((e, i) => <Cell key={e.name} fill={colors?.[e.name] || PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: "10px" }} formatter={(v) => <span className="capitalize text-[10px]">{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}
      </div>
      <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
    </div>
  );
}

export default function DashboardPage() {
  const { currentTenant } = useTenant();
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard", currentTenant?.id],
    enabled: !!currentTenant,
  });

  if (isLoading || !stats) return <DashboardSkeleton />;

  const s = {
    totalIncidents: 0, openIncidents: 0, resolvedIncidents: 0, criticalIncidents: 0,
    totalTickets: 0, openTickets: 0, totalEvents: 0, avgRiskScore: 0, criticalEvents: 0,
    blockedEvents: 0, mttrHours: 0, mttdMinutes: 0, complianceScore: 0,
    incidentTrend: [] as any[], severityBreakdown: [] as any[], categoryBreakdown: [] as any[],
    recentIncidents: [] as any[], eventsByType: [] as any[], eventsBySeverity: [] as any[],
    eventTrend: [] as any[], topThreats: [] as any[], topTargets: [] as any[],
    topAttackers: [] as any[], topVulnerableApps: [] as any[], vulnerabilitySeverity: [] as any[],
    incidentsByThreatVector: [] as any[], mitreTactics: [] as any[], topMitreTechniques: [] as any[],
    incidentsByAction: [] as any[], emailByThreat: [] as any[], topSenders: [] as any[],
    topRecipients: [] as any[], emailActions: [] as any[], emailSeverity: [] as any[],
    emailThreatVectors: [] as any[], emailTotal: 0, endpointByThreat: [] as any[],
    endpointActions: [] as any[], topInfectedHosts: [] as any[], endpointLogSources: [] as any[],
    endpointThreatVectors: [] as any[], endpointTotal: 0, casbApps: [] as any[],
    casbActions: [] as any[], casbTotal: 0, wafAttackTypes: [] as any[], wafActions: [] as any[],
    wafTargets: [] as any[], wafTotal: 0, dlpByThreat: [] as any[], dlpActions: [] as any[],
    dlpTotal: 0, sseTotal: 0, networkByThreat: [] as any[], networkProtocols: [] as any[],
    networkTotal: 0, identityByThreat: [] as any[], identityActions: [] as any[],
    identityTotal: 0, cloudByThreat: [] as any[], cloudApps: [] as any[], cloudTotal: 0,
    topLogSources: [] as any[], sourceTypes: [] as any[], logIngestionTrend: [] as any[],
    topCountries: [] as any[], ...stats,
  };

  return (
    <div className="space-y-5 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Security Operations Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{currentTenant?.name} &mdash; Real-time threat intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono">{s.totalEvents} events</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Total Incidents" value={s.totalIncidents} sub={`${s.openIncidents} open`} icon={AlertTriangle} color={C.red} />
        <MetricCard title="Critical Alerts" value={s.criticalEvents} icon={ShieldAlert} color={C.orange} />
        <MetricCard title="Events Blocked" value={s.blockedEvents} icon={Ban} color={C.green} />
        <MetricCard title="Risk Score" value={s.avgRiskScore} sub="/100" icon={Gauge} color={s.avgRiskScore >= 70 ? C.red : C.orange} />
        <MetricCard title="MTTR" value={`${s.mttrHours}h`} sub="Mean Time to Resolve" icon={Timer} color={C.blue} />
        <MetricCard title="MTTD" value={`${s.mttdMinutes}m`} sub="Mean Time to Detect" icon={Clock} color={C.purple} />
      </div>

      <Tabs defaultValue="soc" data-testid="dashboard-tabs">
        <div className="overflow-x-auto">
          <TabsList className="mb-4 w-auto inline-flex">
            <TabsTrigger value="soc" data-testid="tab-soc" className="text-xs">SOC Overview</TabsTrigger>
            <TabsTrigger value="threats" data-testid="tab-threats" className="text-xs">Threat Intel</TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email" className="text-xs">Email Security</TabsTrigger>
            <TabsTrigger value="endpoint" data-testid="tab-endpoint" className="text-xs">Endpoint</TabsTrigger>
            <TabsTrigger value="cloud" data-testid="tab-cloud" className="text-xs">Cloud & WAF</TabsTrigger>
            <TabsTrigger value="network" data-testid="tab-network" className="text-xs">Network & Identity</TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs" className="text-xs">Log Sources</TabsTrigger>
            <TabsTrigger value="vuln" data-testid="tab-vuln" className="text-xs">Vulnerabilities</TabsTrigger>
          </TabsList>
        </div>

        {/* SOC Overview */}
        <TabsContent value="soc" className="space-y-4">
          <div className="grid lg:grid-cols-4 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Security Posture</CardTitle></CardHeader>
              <CardContent className="pt-0 flex flex-col items-center gap-4">
                <RiskGauge score={s.avgRiskScore} label="Overall Risk Score" size={140} />
                <RiskGauge score={s.complianceScore} label="Compliance Score" size={140} />
                <div className="grid grid-cols-2 gap-2 w-full">
                  <div className="p-2 rounded-md bg-red-500/10 text-center">
                    <p className="text-lg font-bold text-red-500">{s.criticalEvents}</p>
                    <p className="text-[9px] text-muted-foreground">Critical</p>
                  </div>
                  <div className="p-2 rounded-md bg-green-500/10 text-center">
                    <p className="text-lg font-bold text-green-500">{s.blockedEvents}</p>
                    <p className="text-[9px] text-muted-foreground">Blocked</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Incident Trend</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={s.incidentTrend}>
                    <defs>
                      <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.red} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="incidents" stroke={C.red} fill="url(#gInc)" strokeWidth={2} />
                    <Area type="monotone" dataKey="resolved" stroke={C.green} fill="url(#gRes)" strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Events by Category</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.eventsByType.map((e: any) => ({ name: e.type, value: e.count }))} />
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Incidents by Category</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={s.categoryBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="category" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={90} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                      {s.categoryBreakdown.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Recent Incidents</CardTitle>
                <a href="/incidents" className="text-[10px] text-primary flex items-center gap-0.5">View All <ArrowUpRight className="w-3 h-3" /></a>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {s.recentIncidents.map((inc: any) => (
                    <div key={inc.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 border-l-2"
                      style={{ borderLeftColor: SEV[inc.severity] || C.blue }}
                      data-testid={`incident-row-${inc.id}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: SEV[inc.severity] }} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate">{inc.title}</p>
                          <p className="text-[9px] text-muted-foreground">{new Date(inc.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Badge variant={inc.status === "open" ? "destructive" : "secondary"} className="text-[9px] shrink-0">{inc.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Threat Intelligence */}
        <TabsContent value="threats" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Top Threats" data={s.topThreats} icon={Skull} />
            <Top10 title="Top Targets" data={s.topTargets} icon={Target} />
            <Top10 title="Top Attackers" data={s.topAttackers} icon={Crosshair} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Incidents by Threat Vector</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={s.incidentsByThreatVector} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={120} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                      {(s.incidentsByThreatVector || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">MITRE ATT&CK Tactics</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={s.mitreTactics}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <PolarRadiusAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsRadar name="Events" dataKey="value" stroke={C.purple} fill={C.purple} fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Top10 title="MITRE ATT&CK Techniques" data={s.topMitreTechniques} icon={Shield} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Incidents by Action Taken</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={s.incidentsByAction}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Events" radius={[4, 4, 0, 0]} barSize={28}>
                      {(s.incidentsByAction || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Attack Origin Countries</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={s.topCountries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} barSize={24}>
                    {(s.topCountries || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Security */}
        <TabsContent value="email" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Email Events" value={s.emailTotal} icon={Mail} color={C.purple} />
            <MetricCard title="Blocked" value={(s.emailActions || []).find((a: any) => a.name === "blocked")?.value || 0} icon={Ban} color={C.red} />
            <MetricCard title="Quarantined" value={(s.emailActions || []).find((a: any) => a.name === "quarantined")?.value || 0} icon={ShieldAlert} color={C.orange} />
            <MetricCard title="Delivered" value={(s.emailActions || []).find((a: any) => a.name === "delivered")?.value || 0} icon={CheckCircle2} color={C.green} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Email Threats by Type" data={s.emailByThreat} icon={Mail} />
            <Top10 title="Top Malicious Senders" data={s.topSenders} icon={Upload} />
            <Top10 title="Top Targeted Recipients" data={s.topRecipients} icon={Download} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Action Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.emailActions} colors={{ blocked: C.red, quarantined: C.orange, delivered: C.green, sandboxed: C.purple, stripped: C.yellow }} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Severity Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.emailSeverity} colors={SEV} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Threat Vectors</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={s.emailThreatVectors}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} barSize={32}>
                    {(s.emailThreatVectors || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoint Protection */}
        <TabsContent value="endpoint" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Endpoint Events" value={s.endpointTotal} icon={Monitor} color={C.red} />
            <MetricCard title="Blocked" value={(s.endpointActions || []).find((a: any) => a.name === "blocked")?.value || 0} icon={Ban} color={C.green} />
            <MetricCard title="Quarantined" value={(s.endpointActions || []).find((a: any) => a.name === "quarantined")?.value || 0} icon={ShieldAlert} color={C.orange} />
            <MetricCard title="Isolated" value={(s.endpointActions || []).find((a: any) => a.name === "isolated")?.value || 0} icon={XCircle} color={C.purple} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Malware Families" data={s.endpointByThreat} icon={Bug} />
            <Top10 title="Top Infected Hosts" data={s.topInfectedHosts} icon={Monitor} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Threat Vectors</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {(s.endpointThreatVectors || []).map((item: any, idx: number) => {
                    const TIcon = getThreatIcon(item.name);
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30 border-l-2"
                        style={{ borderLeftColor: PALETTE[idx % PALETTE.length] }}>
                        <TIcon className="w-4 h-4 shrink-0" style={{ color: PALETTE[idx % PALETTE.length] }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium">{item.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-mono">{item.count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">EDR Action Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.endpointActions} colors={{ blocked: C.green, quarantined: C.orange, isolated: C.purple, alerted: C.blue }} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">EDR Platforms</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.endpointLogSources.map((s: any) => ({ name: s.name, value: s.count }))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cloud & WAF */}
        <TabsContent value="cloud" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard title="WAF Events" value={s.wafTotal} icon={Globe} color={C.red} />
            <MetricCard title="CASB Events" value={s.casbTotal} icon={Cloud} color={C.purple} />
            <MetricCard title="DLP Events" value={s.dlpTotal} icon={Lock} color={C.orange} />
            <MetricCard title="SSE Events" value={s.sseTotal} icon={ShieldCheck} color={C.teal} />
            <MetricCard title="Cloud Events" value={s.cloudTotal} icon={Cloud} color={C.blue} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="WAF Attack Types" data={s.wafAttackTypes} icon={Globe} />
            <Top10 title="Shadow IT / CASB Apps" data={s.casbApps} icon={AppWindow} />
            <Top10 title="DLP Violations" data={s.dlpByThreat} icon={Lock} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Cloud Misconfigurations" data={s.cloudByThreat} icon={Cloud} />
            <Top10 title="Cloud Services" data={s.cloudApps} icon={Server} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Action Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.wafActions} colors={{ blocked: C.green, dropped: C.red, alerted: C.orange, logged: C.blue }} />
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Protected Targets</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={s.wafTargets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Attacks" radius={[4, 4, 0, 0]} barSize={28}>
                      {(s.wafTargets || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">CASB Actions</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.casbActions} colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Network & Identity */}
        <TabsContent value="network" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Network Events" value={s.networkTotal} icon={Network} color={C.blue} />
            <MetricCard title="Identity Events" value={s.identityTotal} icon={Fingerprint} color={C.purple} />
            <MetricCard title="IDS/IPS Alerts" value={s.networkTotal} icon={ShieldAlert} color={C.red} />
            <MetricCard title="Auth Failures" value={(s.identityByThreat || []).reduce((s: number, t: any) => s + t.count, 0)} icon={KeyRound} color={C.orange} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Network Threats" data={s.networkByThreat} icon={Network} />
            <Top10 title="Identity Threats" data={s.identityByThreat} icon={Fingerprint} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Network Protocols</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.networkProtocols} />
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Identity Action Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.identityActions} colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Attack Origin Countries</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(s.topCountries || []).slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} barSize={24}>
                      {(s.topCountries || []).slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Log & Event Sources */}
        <TabsContent value="logs" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Total Events" value={s.totalEvents} icon={Database} color={C.blue} />
            <MetricCard title="Log Sources" value={(s.topLogSources || []).length} icon={Server} color={C.green} />
            <MetricCard title="Source Types" value={(s.sourceTypes || []).length} icon={Wifi} color={C.purple} />
            <MetricCard title="Avg EPS" value={Math.round(s.totalEvents / 120 * 10) / 10} sub="events/sec" icon={Activity} color={C.orange} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Event Ingestion Trend</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={s.logIngestionTrend}>
                  <defs>
                    <linearGradient id="gLog" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.blue} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="events" stroke={C.blue} fill="url(#gLog)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Top Log Sources</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {(s.topLogSources || []).map((src: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-muted/20">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                      <span className="text-[11px] flex-1 truncate">{src.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-mono h-5">{src.count}</Badge>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Source Type Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.sourceTypes} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vulnerabilities */}
        <TabsContent value="vuln" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Top10 title="Top Vulnerable Applications" data={s.topVulnerableApps} icon={AppWindow} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Vulnerability Severity</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <MiniPie data={s.vulnerabilitySeverity} colors={SEV} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Event Severity Distribution</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={s.eventsBySeverity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Events" radius={[4, 4, 0, 0]} barSize={32}>
                    {(s.eventsBySeverity || []).map((e: any) => <Cell key={e.name} fill={SEV[e.name] || C.blue} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
