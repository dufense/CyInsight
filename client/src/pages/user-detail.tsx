import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { CountryFlag, RiskBar } from "@/lib/visual-helpers";
import { AppLogo } from "@/components/app-logo";
import {
  ArrowLeft, Shield, ShieldAlert, ShieldCheck, Monitor, Globe, Server,
  Network, Clock, Activity, AlertTriangle, Bug, Eye, Zap, Users, Cpu,
  FileText, Lock, Fingerprint, Target, ChevronRight, Cloud, Bot,
  BarChart3, Mail, Upload, Download, MapPin, AppWindow, UserCheck,
  AlertCircle, CheckCircle, XCircle, Info, Key, HardDrive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const C = {
  blue: "hsl(217, 91%, 55%)", green: "hsl(142, 76%, 45%)", purple: "hsl(269, 80%, 58%)",
  orange: "hsl(32, 95%, 52%)", red: "hsl(340, 82%, 52%)", teal: "hsl(180, 70%, 45%)",
  yellow: "hsl(45, 90%, 50%)", pink: "hsl(300, 60%, 50%)", lime: "hsl(120, 60%, 40%)",
  sky: "hsl(200, 80%, 60%)", indigo: "hsl(245, 72%, 55%)", amber: "hsl(38, 92%, 50%)",
};
const PALETTE = [C.blue, C.green, C.purple, C.orange, C.red, C.teal, C.yellow, C.pink, C.lime, C.sky, C.indigo, C.amber];
const SEV: Record<string, string> = { critical: C.red, high: C.orange, medium: C.yellow, low: C.green, info: C.sky };
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

const REP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Malicious: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30" },
  Suspicious: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30" },
  Good: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", border: "border-green-500/30" },
  Unknown: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30" },
};

function RiskGauge({ score, size = 100 }: { score: number; size?: number }) {
  const maxScore = 100;
  const pct = Math.min((score / maxScore) * 100, 100);
  const color = pct >= 70 ? C.red : pct >= 40 ? C.orange : pct >= 20 ? C.yellow : C.green;
  const r = (size - 10) / 2;
  const circumference = Math.PI * r;
  const dashOffset = circumference - (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={`M 5 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 5} ${size / 2 + 5}`} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round" />
        <path d={`M 5 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 5} ${size / 2 + 5}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
      </svg>
      <div className="text-2xl font-bold -mt-4" style={{ color }}>{score}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">Risk Score</div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | number | null | undefined; icon?: any }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <span className="text-[11px] text-muted-foreground min-w-[90px]">{label}</span>
      <span className="text-[11px] font-medium break-all">{String(value)}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, color, children }: { title: string; icon: any; color: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">{children}</CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TagList({ items, color }: { items: string[]; color: string }) {
  if (!items || items.length === 0) return <span className="text-[11px] text-muted-foreground">None detected</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="outline" className="text-[9px] font-medium" style={{ borderColor: `${color}40`, color, backgroundColor: `${color}08` }}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

export default function UserDetailPage() {
  const [, params] = useRoute("/users/:tenantId/:userName");
  const { currentTenant } = useTenant();
  const fmt = useTenantDateFormatter();
  const tenantId = params?.tenantId ? parseInt(params.tenantId) : currentTenant?.id;
  const userName = params?.userName ? decodeURIComponent(params.userName) : "";

  const { data: d, isLoading, error } = useQuery<any>({
    queryKey: ["/api/users", tenantId, "detail", userName],
    queryFn: () => fetch(`/api/users/${tenantId}/detail/${encodeURIComponent(userName)}`).then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    enabled: !!tenantId && !!userName,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="p-6">
        <Link href="/dashboard" className="text-sm text-blue-500 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <Card><CardContent className="p-8 text-center"><AlertTriangle className="w-8 h-8 text-orange-500 mx-auto mb-2" /><p className="text-sm text-muted-foreground">User not found or access denied</p></CardContent></Card>
      </div>
    );
  }

  const repStyle = REP_COLORS[d.reputation] || REP_COLORS.Unknown;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="btn-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: C.blue }} />
              <h1 className="text-xl font-bold" data-testid="text-username">{d.userName}</h1>
              <Badge className={`text-[10px] ${repStyle.bg} ${repStyle.text} ${repStyle.border}`} variant="outline" data-testid="badge-reputation">
                {d.reputation}
              </Badge>
              <Badge variant={d.userStatus === "active" ? "default" : "secondary"} className="text-[10px]" data-testid="badge-status">
                {d.userStatus}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-1">
              {d.email && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{d.email}</span>}
              {d.department && <span className="text-[11px] text-muted-foreground">{d.department}</span>}
              {d.source && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Server className="w-3 h-3" />{d.source}</span>}
              {d.lastActivity && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{fmt.formatDate(d.lastActivity)}</span>}
            </div>
          </div>
        </div>
        <RiskGauge score={d.riskScore} size={90} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <MetricCard title="Total Requests" value={d.stats.totalRequests} icon={Activity} color={C.blue} />
        <MetricCard title="Allowed" value={d.stats.allowedRequests} icon={CheckCircle} color={C.green} />
        <MetricCard title="Denied" value={d.stats.deniedRequests} icon={XCircle} color={C.red} />
        <MetricCard title="Services Used" value={d.stats.serviceCount} icon={Cloud} color={C.purple} />
        <MetricCard title="Uploads" value={d.stats.uploads} icon={Upload} color={C.orange} />
        <MetricCard title="Downloads" value={d.stats.downloads} icon={Download} color={C.teal} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="text-[11px]" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="activities" className="text-[11px]" data-testid="tab-activities">Activities</TabsTrigger>
          <TabsTrigger value="applications" className="text-[11px]" data-testid="tab-applications">Applications</TabsTrigger>
          <TabsTrigger value="incidents" className="text-[11px]" data-testid="tab-incidents">Incidents ({d.incidents.length})</TabsTrigger>
          <TabsTrigger value="devices" className="text-[11px]" data-testid="tab-devices">Devices ({(d.linkedAssets?.length || 0) + d.devices.length + (d.loggedInDevices?.length || 0)})</TabsTrigger>
          {d.cloudApps?.length > 0 && <TabsTrigger value="cloudapps" className="text-[11px]" data-testid="tab-cloudapps">Cloud Apps ({d.cloudApps.length})</TabsTrigger>}
          {d.loginHistory?.length > 0 && <TabsTrigger value="logins" className="text-[11px]" data-testid="tab-logins">Login History ({d.loginHistory.length})</TabsTrigger>}
          <TabsTrigger value="risk" className="text-[11px]" data-testid="tab-risk">Risk Score</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="User Profile" icon={UserCheck} color={C.blue}>
              <div className="space-y-0.5">
                <InfoRow label="Username" value={d.userName} icon={Users} />
                <InfoRow label="Email" value={d.email} icon={Mail} />
                <InfoRow label="Department" value={d.department} icon={Server} />
                <InfoRow label="Title" value={d.title} icon={Fingerprint} />
                <div className="flex items-start gap-2 py-1.5 border-b border-border/30">
                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-[11px] text-muted-foreground min-w-[90px]">Risk Level</span>
                  <RiskBar level={d.riskLevel} score={d.riskScore} />
                </div>
                <InfoRow label="Sites Visited" value={d.stats.sitesVisited} icon={Globe} />
                {d.countries && d.countries.length > 0 && (
                  <div className="flex items-start gap-2 py-1.5 border-b border-border/30">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-[11px] text-muted-foreground min-w-[90px]">Countries</span>
                    <CountryFlag code={d.countries.join(",")} showName />
                  </div>
                )}
                <InfoRow label="Source" value={d.source} icon={Server} />
              </div>
            </SectionCard>

            <SectionCard title="Event Severity Breakdown" icon={ShieldAlert} color={C.orange}>
              {d.eventSummary.total > 0 ? (
                <div className="space-y-3">
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={Object.entries(d.eventSummary.severity).filter(([, v]) => (v as number) > 0).map(([name, value]) => ({ name, value }))}
                          cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value">
                          {Object.entries(d.eventSummary.severity).filter(([, v]) => (v as number) > 0).map(([name], i) => (
                            <Cell key={i} fill={SEV[name] || PALETTE[i]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center text-[11px] text-muted-foreground">{d.eventSummary.total} total events</div>
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No events detected</span>}
            </SectionCard>

            <SectionCard title="Event Types" icon={BarChart3} color={C.purple}>
              {d.eventSummary.total > 0 ? (
                <div className="space-y-2">
                  {[
                    { label: "Web/SWG", count: d.eventSummary.web, color: C.teal, icon: Globe },
                    { label: "Cloud/CASB", count: d.eventSummary.casb, color: C.purple, icon: Cloud },
                    { label: "Endpoint", count: d.eventSummary.endpoint, color: C.blue, icon: Monitor },
                    { label: "Email", count: d.eventSummary.email, color: C.orange, icon: Mail },
                    { label: "DLP", count: d.eventSummary.dlp, color: C.red, icon: Lock },
                    { label: "Network", count: d.eventSummary.network, color: C.green, icon: Network },
                  ].filter(e => e.count > 0).map((e, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <e.icon className="w-3.5 h-3.5" style={{ color: e.color }} />
                      <span className="text-[11px] min-w-[70px]">{e.label}</span>
                      <div className="flex-1"><Progress value={(e.count / d.eventSummary.total) * 100} className="h-2" /></div>
                      <span className="text-[11px] font-bold min-w-[30px] text-right">{e.count}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No events</span>}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="AI / GenAI Services Used" icon={Bot} color={C.purple}>
              {d.aiApps.length > 0 ? (
                <div className="space-y-2">
                  {d.aiApps.map((app: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-md bg-purple-500/5 border border-purple-500/10">
                      <div className="flex items-center gap-2">
                        <AppLogo name={app.name} size={14} fallbackIcon="bot" fallbackColor="text-purple-500" />
                        <span className="text-[11px] font-medium">{app.name}</span>
                      </div>
                      {app.category && <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-600 border-purple-500/30">{app.category}</Badge>}
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No AI services detected</span>}
            </SectionCard>

            <SectionCard title="Shadow IT Applications" icon={AppWindow} color={C.red}>
              {d.shadowITApps.length > 0 ? (
                <div className="space-y-2">
                  {d.shadowITApps.map((app: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-md bg-red-500/5 border border-red-500/10">
                      <div className="flex items-center gap-2">
                        <AppLogo name={app.name} size={14} fallbackIcon="bot" fallbackColor="text-purple-500" />
                        <span className="text-[11px] font-medium">{app.name}</span>
                      </div>
                      {app.category && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30">{app.category}</Badge>}
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No Shadow IT detected</span>}
            </SectionCard>
          </div>

          {d.suspiciousActivities.length > 0 && (
            <SectionCard title="Suspicious / High-Risk Activities" icon={AlertTriangle} color={C.orange}>
              <div className="space-y-1.5">
                {d.suspiciousActivities.slice(0, 10).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/10">
                    <Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[a.severity], color: SEV[a.severity] }}>{a.severity}</Badge>
                    <span className="text-[11px] flex-1">{a.title}</span>
                    {a.date && <span className="text-[10px] text-muted-foreground">{a.date}</span>}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          {d.eventTimeline.length > 0 && (
            <SectionCard title="Activity Timeline" icon={Activity} color={C.blue}>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.eventTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
                    <Area type="monotone" dataKey="casb" stackId="1" stroke={C.purple} fill={C.purple} fillOpacity={0.3} name="Cloud/CASB" />
                    <Area type="monotone" dataKey="web" stackId="1" stroke={C.teal} fill={C.teal} fillOpacity={0.3} name="Web/SWG" />
                    <Area type="monotone" dataKey="endpoint" stackId="1" stroke={C.blue} fill={C.blue} fillOpacity={0.3} name="Endpoint" />
                    <Area type="monotone" dataKey="email" stackId="1" stroke={C.orange} fill={C.orange} fillOpacity={0.3} name="Email" />
                    <Area type="monotone" dataKey="dlp" stackId="1" stroke={C.red} fill={C.red} fillOpacity={0.3} name="DLP" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          <SectionCard title="Action Distribution" icon={Shield} color={C.green}>
            {d.actionDistribution.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.actionDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill={C.blue} radius={[0, 4, 4, 0]}>
                      {d.actionDistribution.map((_: any, i: number) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No action data</span>}
          </SectionCard>

          {d.casbEvents.length > 0 && (
            <SectionCard title="Cloud / CASB Activities" icon={Cloud} color={C.purple}>
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Service</TableHead>
                      <TableHead className="text-[10px]">Activity</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.casbEvents.map((evt: any) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-[11px] font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <AppLogo name={evt.target || ""} size={14} />
                            {evt.target || "--"}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[300px] truncate">{evt.threat || "--"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[evt.severity], color: SEV[evt.severity] }}>{evt.severity}</Badge></TableCell>
                        <TableCell className="text-[11px]">{evt.action || "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {d.webEvents.length > 0 && (
            <SectionCard title="Web / SWG Activities" icon={Globe} color={C.teal}>
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Activity</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.webEvents.map((evt: any) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-[11px] max-w-[400px] truncate">{evt.threat || evt.description || "--"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[evt.severity], color: SEV[evt.severity] }}>{evt.severity}</Badge></TableCell>
                        <TableCell className="text-[11px]">{evt.action || "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {d.endpointEvents.length > 0 && (
            <SectionCard title="Endpoint Activities" icon={Monitor} color={C.blue}>
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Threat</TableHead>
                      <TableHead className="text-[10px]">Asset</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.endpointEvents.map((evt: any) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-[11px] max-w-[300px] truncate">{evt.threat || "--"}</TableCell>
                        <TableCell className="text-[11px]">
                          {evt.asset ? (
                            <Link href={`/assets/${tenantId}/${encodeURIComponent(evt.asset)}`} className="text-blue-500 hover:underline">
                              {evt.asset}
                            </Link>
                          ) : "--"}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[evt.severity], color: SEV[evt.severity] }}>{evt.severity}</Badge></TableCell>
                        <TableCell className="text-[11px]">{evt.action || "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {d.emailEvents.length > 0 && (
            <SectionCard title="Email Activities" icon={Mail} color={C.orange}>
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Threat</TableHead>
                      <TableHead className="text-[10px]">Sender</TableHead>
                      <TableHead className="text-[10px]">Recipient</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.emailEvents.map((evt: any) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-[11px] max-w-[300px] truncate">{evt.threat || "--"}</TableCell>
                        <TableCell className="text-[11px]">{evt.sender || "--"}</TableCell>
                        <TableCell className="text-[11px]">{evt.recipient || "--"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[evt.severity], color: SEV[evt.severity] }}>{evt.severity}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {d.dlpEvents.length > 0 && (
            <SectionCard title="DLP Activities" icon={Lock} color={C.red}>
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Policy/Threat</TableHead>
                      <TableHead className="text-[10px]">Target</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.dlpEvents.map((evt: any) => (
                      <TableRow key={evt.id}>
                        <TableCell className="text-[11px] max-w-[300px] truncate">{evt.threat || "--"}</TableCell>
                        <TableCell className="text-[11px]">{evt.target || "--"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[evt.severity], color: SEV[evt.severity] }}>{evt.severity}</Badge></TableCell>
                        <TableCell className="text-[11px]">{evt.action || "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <SectionCard title="All Applications / Services Used" icon={AppWindow} color={C.blue}>
            {d.topSites.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {d.topSites.map((site: string, i: number) => {
                  const isAI = d.aiApps.some((a: any) => a.name === site);
                  const isShadow = d.shadowITApps.some((a: any) => a.name === site);
                  return (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-md border ${isShadow ? "bg-red-500/5 border-red-500/20" : isAI ? "bg-purple-500/5 border-purple-500/20" : "bg-muted/30 border-border/50"}`}>
                      <AppLogo name={site} size={14} />
                      <span className="text-[11px] font-medium truncate">{site}</span>
                      {isAI && <Badge variant="outline" className="text-[8px] bg-purple-500/10 text-purple-600 border-purple-500/30 shrink-0">AI</Badge>}
                      {isShadow && <Badge variant="outline" className="text-[8px] bg-red-500/10 text-red-600 border-red-500/30 shrink-0">Shadow IT</Badge>}
                    </div>
                  );
                })}
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No application data available</span>}
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="AI / GenAI Services" icon={Bot} color={C.purple}>
              {d.aiApps.length > 0 ? (
                <div className="space-y-2">
                  {d.aiApps.map((app: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-purple-500/5 border border-purple-500/10">
                      <div className="flex items-center gap-2">
                        <AppLogo name={app.name} size={16} />
                        <span className="text-[11px] font-semibold">{app.name}</span>
                      </div>
                      {app.category && <Badge variant="outline" className="text-[9px]">{app.category}</Badge>}
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No AI service usage detected</span>}
            </SectionCard>

            <SectionCard title="Shadow IT / Unsanctioned Apps" icon={AlertCircle} color={C.red}>
              {d.shadowITApps.length > 0 ? (
                <div className="space-y-2">
                  {d.shadowITApps.map((app: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-red-500/5 border border-red-500/10">
                      <div className="flex items-center gap-2">
                        <AppLogo name={app.name} size={16} />
                        <span className="text-[11px] font-semibold">{app.name}</span>
                      </div>
                      {app.category && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30">{app.category}</Badge>}
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No Shadow IT detected</span>}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <SectionCard title="Related Incidents" icon={ShieldAlert} color={C.red}>
            {d.incidents.length > 0 ? (
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">ID</TableHead>
                      <TableHead className="text-[10px]">Title</TableHead>
                      <TableHead className="text-[10px]">Severity</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                      <TableHead className="text-[10px]">Affected Assets</TableHead>
                      <TableHead className="text-[10px]">Action</TableHead>
                      <TableHead className="text-[10px]">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.incidents.map((inc: any) => (
                      <TableRow key={inc.id}>
                        <TableCell className="text-[11px] font-mono">#{inc.id}</TableCell>
                        <TableCell className="text-[11px] max-w-[250px] truncate font-medium">{inc.title}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]" style={{ borderColor: SEV[inc.severity], color: SEV[inc.severity] }}>{inc.severity}</Badge></TableCell>
                        <TableCell><Badge variant={inc.status === "resolved" ? "secondary" : "default"} className="text-[9px]">{inc.status}</Badge></TableCell>
                        <TableCell className="text-[11px]">
                          {inc.affectedAssets ? (
                            <Link href={`/assets/${tenantId}/${encodeURIComponent(inc.affectedAssets)}`} className="text-blue-500 hover:underline">
                              {inc.affectedAssets}
                            </Link>
                          ) : "--"}
                        </TableCell>
                        <TableCell className="text-[11px]">{inc.actionTaken || "--"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{inc.createdAt ? fmt.formatDate(inc.createdAt) : "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No incidents associated with this user</span>}
          </SectionCard>
        </TabsContent>

        <TabsContent value="devices" className="space-y-4">
          {d.linkedAssets && d.linkedAssets.length > 0 && (
            <SectionCard title="Correlated Assets (via Event Data)" icon={Monitor} color={C.blue}>
              <div className="text-[10px] text-muted-foreground mb-2">Devices linked through Cynet User/Risk and Skyhigh SSE activity correlation</div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Hostname</TableHead>
                      <TableHead className="text-[10px]">IP Address</TableHead>
                      <TableHead className="text-[10px]">OS</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                      <TableHead className="text-[10px]">Risk Score</TableHead>
                      <TableHead className="text-[10px]">Agent</TableHead>
                      <TableHead className="text-[10px]">Group</TableHead>
                      <TableHead className="text-[10px]">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.linkedAssets.map((asset: any, i: number) => (
                      <TableRow key={i} data-testid={`row-linked-asset-${i}`}>
                        <TableCell className="text-[11px] font-medium">
                          <Link href={`/assets/${tenantId}/${encodeURIComponent(asset.hostname)}`} className="text-blue-500 hover:underline">
                            {asset.hostname}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{asset.ipAddress || "--"}</TableCell>
                        <TableCell className="text-[11px]">{asset.operatingSystem || "--"}</TableCell>
                        <TableCell><Badge variant={asset.status === "active" ? "default" : "secondary"} className="text-[9px]">{asset.status || "--"}</Badge></TableCell>
                        <TableCell className="text-[11px]">
                          {asset.riskScore != null ? <RiskBar level={asset.riskScore > 70 ? "high" : asset.riskScore > 40 ? "medium" : "low"} score={asset.riskScore} compact /> : "--"}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{asset.agentVersion || "--"}</TableCell>
                        <TableCell className="text-[10px]">{asset.endpointGroup || "--"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{asset.lastSeen ? fmt.formatDate(asset.lastSeen) : "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {d.loggedInDevices && d.loggedInDevices.length > 0 && (
            <SectionCard title="Logged-in Workstations" icon={Monitor} color={C.green}>
              <div className="text-[10px] text-muted-foreground mb-2">Devices where this user was the last logged-in user, sourced from endpoint agent (Cynet)</div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Hostname</TableHead>
                      <TableHead className="text-[10px]">IP Address</TableHead>
                      <TableHead className="text-[10px]">OS</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                      <TableHead className="text-[10px]">Risk Score</TableHead>
                      <TableHead className="text-[10px]">Agent</TableHead>
                      <TableHead className="text-[10px]">Group</TableHead>
                      <TableHead className="text-[10px]">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.loggedInDevices.map((asset: any, i: number) => (
                      <TableRow key={i} data-testid={`row-loggedin-device-${i}`}>
                        <TableCell className="text-[11px] font-medium">
                          <Link href={`/assets/${tenantId}/${encodeURIComponent(asset.hostname)}`} className="text-blue-500 hover:underline">
                            {asset.hostname}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{asset.ipAddress || "--"}</TableCell>
                        <TableCell className="text-[11px]">{asset.operatingSystem || "--"}</TableCell>
                        <TableCell><Badge variant={asset.status === "active" ? "default" : "secondary"} className="text-[9px]">{asset.status || "--"}</Badge></TableCell>
                        <TableCell className="text-[11px]">
                          {asset.riskScore != null ? <RiskBar level={asset.riskScore > 70 ? "high" : asset.riskScore > 40 ? "medium" : "low"} score={asset.riskScore} compact /> : "--"}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{asset.agentVersion || "--"}</TableCell>
                        <TableCell className="text-[10px]">{asset.endpointGroup || "--"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{asset.lastSeen ? fmt.formatDate(asset.lastSeen) : "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          <SectionCard title="Associated Devices (via Incidents)" icon={Monitor} color={C.teal}>
            {d.devices.length > 0 ? (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Hostname</TableHead>
                      <TableHead className="text-[10px]">IP Address</TableHead>
                      <TableHead className="text-[10px]">OS</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                      <TableHead className="text-[10px]">Risk Score</TableHead>
                      <TableHead className="text-[10px]">Agent Version</TableHead>
                      <TableHead className="text-[10px]">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.devices.map((dev: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] font-medium">
                          <Link href={`/assets/${tenantId}/${encodeURIComponent(dev.hostname)}`} className="text-blue-500 hover:underline" data-testid={`link-device-${i}`}>
                            {dev.hostname}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{dev.ip_address || "--"}</TableCell>
                        <TableCell className="text-[11px]">{dev.operating_system || "--"}</TableCell>
                        <TableCell><Badge variant={dev.status === "active" ? "default" : "secondary"} className="text-[9px]">{dev.status || "--"}</Badge></TableCell>
                        <TableCell className="text-[11px]">
                          {dev.risk_score != null ? <RiskBar level={dev.risk_level || (dev.risk_score > 70 ? "high" : dev.risk_score > 40 ? "medium" : "low")} score={dev.risk_score} compact /> : "--"}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{dev.agent_version || "--"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{dev.last_seen ? fmt.formatDate(dev.last_seen) : "--"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No device associations found from incidents</span>}
          </SectionCard>
        </TabsContent>

        {d.cloudApps?.length > 0 && (
          <TabsContent value="cloudapps" className="space-y-4">
            <SectionCard title="Cloud Application Usage" icon={Cloud} color={C.purple}>
              <div className="text-[10px] text-muted-foreground mb-2">
                Applications accessed by this user, discovered via Skyhigh SSE event correlation
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Application</TableHead>
                      <TableHead className="text-[10px]">Category</TableHead>
                      <TableHead className="text-[10px] text-right">Events</TableHead>
                      <TableHead className="text-[10px] text-right">Download (MB)</TableHead>
                      <TableHead className="text-[10px] text-right">Upload (MB)</TableHead>
                      <TableHead className="text-[10px]">Activity Types</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.cloudApps.map((app: any, i: number) => (
                      <TableRow key={i} data-testid={`row-cloud-app-${i}`}>
                        <TableCell className="text-[11px] font-medium">
                          <div className="flex items-center gap-1.5">
                            <Cloud className="w-3 h-3 text-purple-500" />
                            {app.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          {app.category ? <Badge variant="secondary" className="text-[8px] px-1 py-0">{app.category}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{app.totalActivity}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{app.downloadBytes > 0 ? (app.downloadBytes / 1048576).toFixed(1) : "—"}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{app.uploadBytes > 0 ? (app.uploadBytes / 1048576).toFixed(1) : "—"}</TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex flex-wrap gap-0.5">
                            {app.activityTypes?.slice(0, 4).map((t: string, j: number) => (
                              <Badge key={j} variant="outline" className="text-[8px] px-1 py-0">{t}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </TabsContent>
        )}

        {d.loginHistory?.length > 0 && (
          <TabsContent value="logins" className="space-y-4">
            <SectionCard title="Login History" icon={Key} color={C.green}>
              <div className="text-[10px] text-muted-foreground mb-2">
                Login events from Skyhigh SSE activity stream
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Timestamp</TableHead>
                      <TableHead className="text-[10px]">Service</TableHead>
                      <TableHead className="text-[10px]">Source IP</TableHead>
                      <TableHead className="text-[10px]">Country</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.loginHistory.map((login: any, i: number) => (
                      <TableRow key={i} data-testid={`row-login-${i}`}>
                        <TableCell className="text-[10px] font-mono">{login.timestamp ? fmt.formatDateTime(login.timestamp) : "—"}</TableCell>
                        <TableCell className="text-[11px] font-medium">{login.service || "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{login.ip || "—"}</TableCell>
                        <TableCell className="text-[10px]">{login.country || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </TabsContent>
        )}

        <TabsContent value="risk" className="space-y-4">
          <UserRiskTab tenantId={tenantId!} userId={d.id} userName={d.userName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserRiskTab({ tenantId, userId, userName }: { tenantId: number; userId: number; userName: string }) {
  const { data: riskData, isLoading } = useQuery<any>({
    queryKey: ["/api/risk/entity", tenantId, "user", userId],
    queryFn: async () => {
      const res = await fetch(`/api/risk/entity/${tenantId}/user/${userId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId && !!userId,
  });

  if (isLoading) return <Skeleton className="h-64" />;

  if (!riskData) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground" data-testid="risk-empty-state">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No risk score calculated yet for this user.</p>
          <p className="text-xs mt-1">Navigate to CAASM &gt; Risk Intelligence to run risk calculations.</p>
        </CardContent>
      </Card>
    );
  }

  const pillarLabels: Record<string, string> = {
    assetRisk: "Associated Asset Risk",
    incidentInvolvement: "Incident History",
    behavioralRisk: "Behavioral Analysis",
    complianceViolations: "Compliance",
    contextualFactors: "Contextual Factors",
  };
  const pillarColors: Record<string, string> = {
    assetRisk: C.blue, incidentInvolvement: C.orange, behavioralRisk: C.purple, complianceViolations: C.teal, contextualFactors: C.red,
  };
  const pillars = riskData.pillarScores || {};
  const alerts = riskData.compoundRiskAlerts || [];
  const lvl = riskData.riskLevel || "low";
  const lvlColor = lvl === "critical" ? C.red : lvl === "high" ? C.orange : lvl === "medium" ? C.yellow : C.green;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Overall Risk Score" icon={Shield} color={lvlColor}>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold" style={{ color: lvlColor }} data-testid="text-risk-overall-score">
                {riskData.overallScore?.toFixed(1)}
              </span>
              <Badge className="mt-1 text-[10px]" style={{ backgroundColor: `${lvlColor}20`, color: lvlColor, border: `1px solid ${lvlColor}40` }} data-testid="badge-risk-level">
                {lvl.toUpperCase()}
              </Badge>
            </div>
            <div className="flex-1 space-y-2">
              {Object.entries(pillars).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">{pillarLabels[key] || key}</span>
                    <span className="font-medium" style={{ color: pillarColors[key] || C.blue }}>{String(val)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Number(val), 100)}%`, backgroundColor: pillarColors[key] || C.blue }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Compound Risk Alerts" icon={AlertTriangle} color={C.red}>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No compound risk alerts detected.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {alerts.map((alert: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50" data-testid={`risk-alert-${i}`}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: lvlColor }} />
                  <div>
                    <span className="text-[11px] font-medium">{alert}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {riskData.riskBreakdown && (
        <SectionCard title="Risk Breakdown Details" icon={Target} color={C.indigo}>
          <div className="grid md:grid-cols-3 gap-4 text-xs">
            {riskData.riskBreakdown.behavioral && (
              <div className="space-y-1" data-testid="risk-breakdown-behavioral">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Behavioral</h4>
                <p>Shadow IT Services: <span className="font-medium">{riskData.riskBreakdown.behavioral.shadowItCount || 0}</span></p>
                <p>AI Services Used: <span className="font-medium">{riskData.riskBreakdown.behavioral.aiServiceCount || 0}</span></p>
                <p>High Upload Users: <span className="font-medium">{riskData.riskBreakdown.behavioral.highUpload ? "Yes" : "No"}</span></p>
              </div>
            )}
            {riskData.riskBreakdown.incidents && (
              <div className="space-y-1" data-testid="risk-breakdown-incidents">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Incidents</h4>
                <p>Total: <span className="font-medium">{riskData.riskBreakdown.incidents.total}</span></p>
                <p>Critical: <span className="font-medium text-red-500">{riskData.riskBreakdown.incidents.critical}</span></p>
              </div>
            )}
            {riskData.riskBreakdown.assetRisk && (
              <div className="space-y-1" data-testid="risk-breakdown-asset">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><Monitor className="w-3 h-3" /> Associated Assets</h4>
                <p>Devices: <span className="font-medium">{riskData.riskBreakdown.assetRisk.deviceCount || 0}</span></p>
                <p>Avg Asset Risk: <span className="font-medium">{riskData.riskBreakdown.assetRisk.avgDeviceRisk?.toFixed(1) || "N/A"}</span></p>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
