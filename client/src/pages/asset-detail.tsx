import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import {
  ArrowLeft, Shield, ShieldAlert, ShieldCheck, Monitor, Globe, Server, HardDrive,
  Network, Clock, Activity, AlertTriangle, Bug, Eye, Zap, Users, Cpu, Wifi,
  FileText, Lock, Fingerprint, Target, ChevronRight, Layers, Database,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
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
const SEV: Record<string, string> = { critical: C.red, high: C.orange, medium: C.blue, low: C.green };
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

function RiskGauge({ score, size = 100 }: { score: number; size?: number }) {
  const maxScore = 1000;
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

function TagList({ items, color }: { items: string[]; color?: string }) {
  if (!items || items.length === 0) return <span className="text-[10px] text-muted-foreground">None detected</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-[9px]" style={color ? { backgroundColor: `${color}15`, color, borderColor: `${color}30` } : {}}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, color }: { title: string; icon: any; children: React.ReactNode; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={color ? { color } : {}} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export default function AssetDetailPage() {
  const [, params] = useRoute("/assets/:tenantId/:assetName");
  const { currentTenant } = useTenant();
  const tenantId = params?.tenantId ? parseInt(params.tenantId) : currentTenant?.id;
  const assetName = params?.assetName ? decodeURIComponent(params.assetName) : "";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/assets", tenantId, "detail", assetName],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${tenantId}/detail/${encodeURIComponent(assetName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load asset details");
      return res.json();
    },
    enabled: !!tenantId && !!assetName,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
        </div>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Asset not found or no data available.</CardContent></Card>
      </div>
    );
  }

  const d = data;
  const sevData = [
    { name: "Critical", value: d.severityCounts.critical, color: C.red },
    { name: "High", value: d.severityCounts.high, color: C.orange },
    { name: "Medium", value: d.severityCounts.medium, color: C.blue },
    { name: "Low", value: d.severityCounts.low, color: C.green },
  ].filter(s => s.value > 0);

  const eventTypeData = d.security.eventTypes.map((et: string, i: number) => ({
    name: et,
    value: d.recentEvents.filter((e: any) => e.eventType === et).length,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: `${SEV[d.riskLevel] || C.blue}15` }}>
              <Monitor className="w-5 h-5" style={{ color: SEV[d.riskLevel] || C.blue }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-asset-name">{d.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[d.riskLevel] || C.blue}20`, color: SEV[d.riskLevel] || C.blue }}>
                  {d.riskLevel.toUpperCase()}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  First seen: {d.firstSeen ? new Date(d.firstSeen).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Last seen: {d.lastSeen ? new Date(d.lastSeen).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
                </span>
              </div>
              {d.groups && d.groups.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap" data-testid="asset-groups">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Groups:</span>
                  {d.groups.map((g: { name: string; source: string }, i: number) => {
                    const sourceColors: Record<string, string> = {
                      EDR: C.blue, AD: C.purple, "Patch Management": C.orange,
                      "Asset Management": C.teal, DLP: C.red, NDR: C.green, Scanner: C.yellow,
                    };
                    const sc = sourceColors[g.source] || C.blue;
                    return (
                      <div key={i} className="flex items-center gap-1" data-testid={`asset-group-${i}`}>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 font-medium" style={{ borderColor: `${sc}40`, color: sc, backgroundColor: `${sc}10` }}>
                          {g.source}
                        </Badge>
                        <span className="text-[11px] font-medium" data-testid={`text-group-name-${i}`}>{g.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10">
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="text-xl font-bold" data-testid="text-total-events">{d.totalEvents}</div>
              <div className="text-[10px] text-muted-foreground">Security Events</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <div className="text-xl font-bold" data-testid="text-total-incidents">{d.totalIncidents}</div>
              <div className="text-[10px] text-muted-foreground">Incidents</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <RiskGauge score={d.riskScore} size={80} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10">
              <Shield className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{d.avgRiskScore}</div>
              <div className="text-[10px] text-muted-foreground">Avg Risk Score</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="network" className="text-xs" data-testid="tab-network">Network & Identity</TabsTrigger>
          <TabsTrigger value="system" className="text-xs" data-testid="tab-system">System & Software</TabsTrigger>
          <TabsTrigger value="security" className="text-xs" data-testid="tab-security">Security Controls</TabsTrigger>
          <TabsTrigger value="vulnerabilities" className="text-xs" data-testid="tab-vulnerabilities">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs" data-testid="tab-incidents">Incidents</TabsTrigger>
          <TabsTrigger value="events" className="text-xs" data-testid="tab-events">Events</TabsTrigger>
          <TabsTrigger value="ioc" className="text-xs" data-testid="tab-ioc">IOC & Enrichment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <SectionCard title="Severity Distribution" icon={BarChart3} color={C.red}>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sevData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {sevData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Event Types" icon={Layers} color={C.blue}>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventTypeData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {eventTypeData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Quick Info" icon={FileText} color={C.teal}>
              <div className="space-y-0">
                <InfoRow label="Asset Name" value={d.name} icon={Monitor} />
                <InfoRow label="Risk Level" value={d.riskLevel} icon={ShieldAlert} />
                <InfoRow label="Max Risk Score" value={d.riskScore} icon={Target} />
                <InfoRow label="First Seen" value={d.firstSeen ? new Date(d.firstSeen).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"} icon={Clock} />
                <InfoRow label="Last Seen" value={d.lastSeen ? new Date(d.lastSeen).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"} icon={Clock} />
                <InfoRow label="Event Types" value={d.security.eventTypes.join(", ")} icon={Layers} />
                <InfoRow label="MITRE Tactics" value={d.security.mitreTactics.join(", ") || "None"} icon={Target} />
              </div>
            </SectionCard>
          </div>

          {d.severityTimeline.length > 0 && (
            <SectionCard title="Event Timeline" icon={Activity} color={C.indigo}>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.severityTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => { const d = new Date(v); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Area type="monotone" dataKey="critical" stackId="1" fill={C.red} stroke={C.red} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="high" stackId="1" fill={C.orange} stroke={C.orange} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="medium" stackId="1" fill={C.blue} stroke={C.blue} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="low" stackId="1" fill={C.green} stroke={C.green} fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="IP Addresses" icon={Globe} color={C.blue}>
              {d.network.ips.length > 0 ? (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {d.network.ips.map((ip: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                      <Network className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-mono">{ip}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No IP addresses detected</span>}
            </SectionCard>

            <SectionCard title="MAC Addresses" icon={Fingerprint} color={C.purple}>
              {d.network.macs.length > 0 ? (
                <div className="space-y-1.5">
                  {d.network.macs.map((mac: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                      <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-mono">{mac}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No MAC addresses detected</span>}
            </SectionCard>

            <SectionCard title="Protocols" icon={Layers} color={C.teal}>
              <TagList items={d.network.protocols} color={C.teal} />
            </SectionCard>

            <SectionCard title="Geolocations" icon={Globe} color={C.green}>
              <TagList items={d.network.countries} color={C.green} />
            </SectionCard>
          </div>

          <SectionCard title="Logged-In Users" icon={Users} color={C.indigo}>
            {d.system.loggedInUsers.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {d.system.loggedInUsers.map((user: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-medium">{user}</span>
                  </div>
                ))}
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No user login data available</span>}
          </SectionCard>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="Operating System" icon={Monitor} color={C.blue}>
              {d.system.os.length > 0 ? (
                <div className="space-y-1.5">
                  {d.system.os.map((os: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30">
                      <Monitor className="w-4 h-4 text-blue-500" />
                      <span className="text-[12px] font-medium">{os}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">OS information not available</span>}
            </SectionCard>

            <SectionCard title="Hardware Inventory" icon={Cpu} color={C.orange}>
              {d.system.hardware.length > 0 ? (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {d.system.hardware.map((hw: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                      <HardDrive className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[11px] font-mono">{hw}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No hardware data detected</span>}
            </SectionCard>
          </div>

          <SectionCard title="Software Inventory" icon={Database} color={C.purple}>
            {d.system.software.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                {d.system.software.map((sw: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <Database className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px]">{sw}</span>
                  </div>
                ))}
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No software data detected</span>}
          </SectionCard>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="MITRE ATT&CK Tactics" icon={Target} color={C.red}>
              <TagList items={d.security.mitreTactics} color={C.red} />
            </SectionCard>

            <SectionCard title="MITRE ATT&CK Techniques" icon={Zap} color={C.orange}>
              <TagList items={d.security.mitreTechniques} color={C.orange} />
            </SectionCard>

            <SectionCard title="Detection Sources" icon={Eye} color={C.teal}>
              <TagList items={d.security.detectionSources} color={C.teal} />
            </SectionCard>

            <SectionCard title="Log Sources" icon={Server} color={C.blue}>
              <TagList items={d.security.logSources} color={C.blue} />
            </SectionCard>
          </div>

          <SectionCard title="Security Controls Implemented" icon={ShieldCheck} color={C.green}>
            {d.security.securityControls.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {d.security.securityControls.map((ctrl: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-md bg-green-500/5 border border-green-500/10">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    <span className="text-[11px] font-medium">{ctrl}</span>
                  </div>
                ))}
              </div>
            ) : <span className="text-[11px] text-muted-foreground">No security control data available</span>}
          </SectionCard>

          <SectionCard title="Actions Taken" icon={Lock} color={C.indigo}>
            <TagList items={d.security.actions} color={C.indigo} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="vulnerabilities" className="space-y-4">
          <SectionCard title="Vulnerabilities" icon={Bug} color={C.red}>
            {d.vulnerabilities.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Vulnerability</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Status</TableHead>
                      <TableHead className="text-[10px] uppercase">Risk Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.vulnerabilities.map((v: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] font-medium max-w-[300px] truncate">{v.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[v.severity] || C.blue}20`, color: SEV[v.severity] || C.blue }}>
                            {v.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px]">{v.status}</TableCell>
                        <TableCell>
                          {v.riskScore ? (
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min((parseInt(v.riskScore) / 500) * 100, 100)} className="h-1.5 w-16" />
                              <span className="text-[10px] font-mono">{v.riskScore}</span>
                            </div>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-green-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No vulnerabilities detected for this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <SectionCard title="Related Incidents" icon={AlertTriangle} color={C.red}>
            {d.recentIncidents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Title</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Status</TableHead>
                      <TableHead className="text-[10px] uppercase">Category</TableHead>
                      <TableHead className="text-[10px] uppercase">MITRE Tactic</TableHead>
                      <TableHead className="text-[10px] uppercase">Kill Chain</TableHead>
                      <TableHead className="text-[10px] uppercase">Confidence</TableHead>
                      <TableHead className="text-[10px] uppercase">Classification</TableHead>
                      <TableHead className="text-[10px] uppercase">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentIncidents.map((inc: any, i: number) => (
                      <TableRow key={i} data-testid={`incident-row-${i}`}>
                        <TableCell className="text-[11px] font-medium max-w-[250px] truncate">{inc.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[inc.severity] || C.blue}20`, color: SEV[inc.severity] || C.blue }}>
                            {inc.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{inc.status}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px]">{inc.category || "-"}</TableCell>
                        <TableCell>
                          {inc.mitreTactic ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.red}15`, color: C.red }}>{inc.mitreTactic}</Badge> : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.killChainPhase ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.purple}15`, color: C.purple }}>{inc.killChainPhase}</Badge> : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.confidenceScore != null ? (
                            <div className="flex items-center gap-1.5">
                              <Progress value={inc.confidenceScore} className="h-1.5 w-12" />
                              <span className="text-[10px] font-mono">{inc.confidenceScore}%</span>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.classification ? (
                            <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: inc.classification === "true_positive" ? `${C.red}15` : `${C.green}15`, color: inc.classification === "true_positive" ? C.red : C.green }}>
                              {inc.classification === "true_positive" ? "TP" : inc.classification === "false_positive" ? "FP" : inc.classification}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {new Date(inc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-green-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No incidents linked to this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <SectionCard title="Recent Security Events" icon={Activity} color={C.blue}>
            {d.recentEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Type</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Threat</TableHead>
                      <TableHead className="text-[10px] uppercase">Description</TableHead>
                      <TableHead className="text-[10px] uppercase">MITRE Tactic</TableHead>
                      <TableHead className="text-[10px] uppercase">Action</TableHead>
                      <TableHead className="text-[10px] uppercase">Risk</TableHead>
                      <TableHead className="text-[10px] uppercase">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentEvents.map((evt: any, i: number) => (
                      <TableRow key={i} data-testid={`event-row-${i}`}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px]">{evt.eventType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[evt.severity] || C.blue}20`, color: SEV[evt.severity] || C.blue }}>
                            {evt.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[200px] truncate">{evt.threat || "-"}</TableCell>
                        <TableCell className="text-[11px] max-w-[250px] truncate">{evt.description || "-"}</TableCell>
                        <TableCell>
                          {evt.mitreTactic ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.red}15`, color: C.red }}>{evt.mitreTactic}</Badge> : "-"}
                        </TableCell>
                        <TableCell className="text-[11px]">{evt.action || "-"}</TableCell>
                        <TableCell>
                          {evt.riskScore ? (
                            <span className="text-[11px] font-mono font-medium" style={{ color: evt.riskScore > 300 ? C.red : evt.riskScore > 100 ? C.orange : C.green }}>{evt.riskScore}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {new Date(evt.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-blue-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No security events for this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ioc" className="space-y-4">
          <SectionCard title="IOC Indicators" icon={Fingerprint} color={C.red}>
            {d.iocIndicators.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Type</TableHead>
                      <TableHead className="text-[10px] uppercase">Value</TableHead>
                      <TableHead className="text-[10px] uppercase">Reputation</TableHead>
                      <TableHead className="text-[10px] uppercase">Country</TableHead>
                      <TableHead className="text-[10px] uppercase">Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.iocIndicators.map((ioc: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px]">{ioc.type}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono max-w-[200px] truncate">{ioc.value}</TableCell>
                        <TableCell>
                          {ioc.reputation ? (
                            <Badge variant="secondary" className="text-[9px]" style={{
                              backgroundColor: ioc.reputation === "malicious" ? `${C.red}15` : ioc.reputation === "suspicious" ? `${C.orange}15` : `${C.green}15`,
                              color: ioc.reputation === "malicious" ? C.red : ioc.reputation === "suspicious" ? C.orange : C.green,
                            }}>
                              {ioc.reputation}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px]">{ioc.country || "-"}</TableCell>
                        <TableCell className="text-[11px]">{ioc.source || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Fingerprint className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No IOC data available for this asset</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="AI Enrichment Summary" icon={Zap} color={C.amber}>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">MITRE ATT&CK Coverage</h4>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{d.security.mitreTactics.length}</span>
                  <span className="text-[11px] text-muted-foreground">tactics detected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{d.security.mitreTechniques.length}</span>
                  <span className="text-[11px] text-muted-foreground">techniques identified</span>
                </div>
                <TagList items={d.security.mitreTactics} color={C.red} />
              </div>
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detection Coverage</h4>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{d.security.logSources.length}</span>
                  <span className="text-[11px] text-muted-foreground">log sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{d.security.detectionSources.length}</span>
                  <span className="text-[11px] text-muted-foreground">detection sources</span>
                </div>
                <TagList items={d.security.logSources} color={C.blue} />
              </div>
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Risk Assessment</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Max Risk Score</span>
                    <span className="font-bold">{d.riskScore}</span>
                  </div>
                  <Progress value={Math.min((d.riskScore / 500) * 100, 100)} className="h-2" />
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Avg Risk Score</span>
                    <span className="font-bold">{d.avgRiskScore}</span>
                  </div>
                  <Progress value={Math.min((d.avgRiskScore / 500) * 100, 100)} className="h-2" />
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
