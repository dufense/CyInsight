import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie, Cell, AreaChart, Area,
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Shield, Users, Monitor, Network, TrendingUp, TrendingDown,
  Cpu, Wifi, ChevronDown, ChevronUp, ExternalLink, Star, Globe,
  AlertTriangle, Layers, Activity, Lock,
} from "lucide-react";

// ─── Domain types ──────────────────────────────────────────────────────────────
interface RiskyUser {
  username: string;
  isPrivileged: boolean;
  riskScore: number;
  riskyIncidents: number;
  failedLogins: number;
  anomalyEvents: number;
  maxSeverity: string;
  lastIncidentAt: string | null;
}

interface PrivilegedRiskEntry {
  username: string;
  riskScore: number;
}

interface AtRiskDevice {
  hostname: string;
  ipAddress: string | null;
  operatingSystem: string;
  lastSeen: string | null;
  vulnerabilityCount: number;
  riskLevel: string;
  riskScore: number;
  trustScore: number;
  edrStatus: string;
}

interface NetworkSegment {
  segment: string;
  incidentCount: number;
  maxSeverity: string;
  lastSeen: string | null;
}

interface DeviceTrustBreakdown {
  trusted: number;
  atRisk: number;
  unmanaged: number;
  compromised: number;
}

interface NetworkExposure {
  lateralMovement: number;
  c2Detected: number;
  networkThreats: number;
  totalAssets: number;
  eolDevices: number;
  publicExposedAssets: number;
  openCriticalPorts: number;
  externalExposureScore: number;
}

interface AnomalyPoint {
  day: string;
  identity: number;
  device: number;
  network: number;
}

interface ZeroTrustPosture {
  overallScore: number;
  identityScore: number;
  deviceScore: number;
  networkScore: number;
  scoreTrend: number;
  topRiskyUsers: RiskyUser[];
  privilegedRiskSummary: PrivilegedRiskEntry[];
  atRiskDevices: AtRiskDevice[];
  deviceTrustBreakdown: DeviceTrustBreakdown;
  networkExposure: NetworkExposure;
  topRiskySegments: NetworkSegment[];
  anomalyTimeline: AnomalyPoint[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  green: "hsl(142, 76%, 45%)", yellow: "hsl(45, 90%, 50%)", red: "hsl(340, 82%, 52%)",
  blue: "hsl(217, 91%, 55%)", purple: "hsl(269, 80%, 58%)", orange: "hsl(32, 95%, 52%)",
};
const tooltipStyle = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: "6px", fontSize: "11px",
};

function scoreColor(score: number) {
  return score >= 80 ? C.green : score >= 60 ? C.yellow : C.red;
}

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const data = [{ name: label, value: score, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div style={{ width: 120, height: 120 }}>
        <RadialBarChart width={120} height={120} cx={60} cy={60} innerRadius={36} outerRadius={52} startAngle={90} endAngle={-270} data={data}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={4} />
          <text x={60} y={58} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" fontSize={18} fontWeight={700}>{score}</text>
          <text x={60} y={72} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={9}>/100</text>
        </RadialBarChart>
      </div>
      <span className="text-[11px] text-muted-foreground font-medium mt-0.5">{label}</span>
      <span className="text-[9px] font-medium mt-0.5" style={{ color }}>{score >= 80 ? "Healthy" : score >= 60 ? "Moderate" : "At Risk"}</span>
    </div>
  );
}

const SEV_COLORS: Record<string, string> = { critical: C.red, high: C.orange, medium: C.yellow, low: C.green };

function edrBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "protected") return "border-green-500/30 text-green-600 bg-green-500/10";
  if (s === "alert" || s === "at risk") return "border-red-500/30 text-red-500 bg-red-500/10";
  if (s === "partial") return "border-yellow-500/30 text-yellow-600 bg-yellow-500/10";
  return "border-border text-muted-foreground";
}

export default function ZeroTrustPage() {
  const { currentTenant } = useTenant();
  const [, navigate] = useLocation();
  const [expandedSection, setExpandedSection] = useState<string | null>("identity");
  const [timelineFilter, setTimelineFilter] = useState<"all" | "identity" | "device" | "network">("all");

  const { data: posture, isLoading } = useQuery<ZeroTrustPosture>({
    queryKey: ["/api/zero-trust/posture", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/zero-trust/posture?tenantId=${currentTenant!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Zero Trust posture");
      return res.json() as Promise<ZeroTrustPosture>;
    },
    enabled: !!currentTenant?.id,
    staleTime: 2 * 60 * 1000,
  });

  const toggle = (section: string) => setExpandedSection(s => s === section ? null : section);

  const pieColors = [C.green, C.yellow, C.orange, C.red];
  const devicePieData = posture ? [
    { name: "Trusted", value: posture.deviceTrustBreakdown.trusted },
    { name: "At Risk", value: posture.deviceTrustBreakdown.atRisk },
    { name: "Unmanaged", value: posture.deviceTrustBreakdown.unmanaged },
    { name: "Compromised", value: posture.deviceTrustBreakdown.compromised },
  ] : [];

  const privilegedRiskData: { name: string; riskScore: number }[] = posture?.privilegedRiskSummary?.map((u) => ({
    name: u.username?.length > 12 ? u.username.substring(0, 12) + "…" : u.username,
    riskScore: u.riskScore,
  })) || [];

  const liveStats = posture ? [
    { label: "ZT Score", value: `${posture.overallScore}` },
    { label: "Identity Risk", value: `${100 - posture.identityScore}%` },
    { label: "Device Trust", value: `${posture.deviceScore}%` },
    { label: "Exposed Assets", value: `${posture.networkExposure?.publicExposedAssets ?? 0}` },
  ] : undefined;

  const riskLevelBadge = (rl: string) => {
    const cls: Record<string, string> = {
      critical: "border-red-500/30 text-red-500 bg-red-500/10",
      high: "border-orange-500/30 text-orange-500 bg-orange-500/10",
      medium: "border-yellow-500/30 text-yellow-600 bg-yellow-500/10",
      low: "border-green-500/30 text-green-600 bg-green-500/10",
    };
    return <Badge className={`text-[9px] px-1.5 border ${cls[rl] ?? cls.low}`}>{rl}</Badge>;
  };

  const scoreClasses = (s: number) =>
    s >= 80 ? "border-green-500/30 text-green-600 bg-green-500/10" :
    s >= 60 ? "border-yellow-500/30 text-yellow-600 bg-yellow-500/10" :
    "border-red-500/30 text-red-500 bg-red-500/10";

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <PageHero
        icon={Shield}
        title="Zero Trust Posture Center"
        description="Continuous verification across Identity, Device, and Network pillars"
        badge="ZERO TRUST"
        stats={liveStats}
      />

      {/* Overall Score */}
      <Card className="border-primary/20" data-testid="zt-overall-score">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {isLoading ? (
              <div className="flex gap-8">{[1,2,3,4].map(i => <Skeleton key={i} className="w-24 h-24 rounded-full" />)}</div>
            ) : posture ? (
              <>
                <div className="flex flex-col items-center">
                  <div style={{ width: 140, height: 140 }}>
                    <RadialBarChart width={140} height={140} cx={70} cy={70} innerRadius={40} outerRadius={62} startAngle={90} endAngle={-270}
                      data={[{ name: "Score", value: posture.overallScore, fill: scoreColor(posture.overallScore) }]}>
                      <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                      <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={4} />
                      <text x={70} y={68} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" fontSize={24} fontWeight={700}>{posture.overallScore}</text>
                      <text x={70} y={84} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>/100</text>
                    </RadialBarChart>
                  </div>
                  <p className="text-sm font-semibold mt-1">Overall ZT Score</p>
                  <Badge className={`mt-1 text-[10px] border ${scoreClasses(posture.overallScore)}`}>
                    {posture.overallScore >= 80 ? "Healthy" : posture.overallScore >= 60 ? "Moderate Risk" : "High Risk"}
                  </Badge>
                  {posture.scoreTrend !== 0 && (
                    <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${posture.scoreTrend > 0 ? "text-green-500" : "text-red-500"}`}>
                      {posture.scoreTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {posture.scoreTrend > 0 ? "↑ Improving" : "↓ Worsening"} vs 7d ago
                    </div>
                  )}
                </div>
                <div className="flex gap-8">
                  <ScoreGauge score={posture.identityScore} label="Identity" color={scoreColor(posture.identityScore)} />
                  <ScoreGauge score={posture.deviceScore} label="Device" color={scoreColor(posture.deviceScore)} />
                  <ScoreGauge score={posture.networkScore} label="Network" color={scoreColor(posture.networkScore)} />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {[
                    { label: "Lateral Movement Incidents", value: posture.networkExposure.lateralMovement, icon: Network, color: C.red },
                    { label: "C2 Communication Detected", value: posture.networkExposure.c2Detected, icon: Wifi, color: C.orange },
                    { label: "EOL Devices", value: posture.networkExposure.eolDevices, icon: Cpu, color: C.yellow },
                    { label: "Publicly Exposed Assets", value: posture.networkExposure.publicExposedAssets, icon: Globe, color: C.purple },
                  ].map((m) => (
                    <div key={m.label} className="bg-muted/30 border border-border/40 rounded-lg p-3 flex items-start gap-2">
                      <m.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: m.color }} />
                      <div>
                        <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Identity Risk Pillar */}
      <Card className="border-border/50" data-testid="zt-identity-pillar">
        <CardHeader className="pb-2 px-4 pt-3 cursor-pointer" onClick={() => toggle("identity")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <CardTitle className="text-sm font-semibold">Identity Risk Pillar</CardTitle>
              {posture && <Badge className={`text-[10px] border ${scoreClasses(posture.identityScore)}`}>Score: {posture.identityScore}</Badge>}
            </div>
            {expandedSection === "identity" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expandedSection === "identity" && (
          <CardContent className="p-0">
            {isLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
              !posture?.topRiskyUsers?.length ? <p className="text-sm text-muted-foreground p-4 text-center">No high-risk users detected</p> : (
              <div className="space-y-4">
                {/* High-Risk Users Table */}
                <div className="overflow-auto">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 pt-3 pb-1">Top Risky Users</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="text-[10px] px-4">User</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Privileged</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Risk Score</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Risky Incidents</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Failed Logins</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Anomaly Events</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Max Severity</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Last Incident</TableHead>
                        <TableHead className="text-[10px] px-4"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posture.topRiskyUsers.map((u: RiskyUser, i: number) => (
                        <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`zt-user-row-${i}`}>
                          <TableCell className="px-4 py-2">
                            <span className="text-[12px] font-medium">{u.username}</span>
                          </TableCell>
                          <TableCell className="text-center px-4 py-2">
                            {u.isPrivileged ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                <span className="text-[10px] text-yellow-600 font-medium">Yes</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center px-4 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${u.riskScore}%`, background: scoreColor(100 - u.riskScore) }} />
                              </div>
                              <span className="text-[11px] font-medium">{u.riskScore}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-[11px] px-4 py-2">{u.riskyIncidents}</TableCell>
                          <TableCell className="text-center px-4 py-2">
                            <span className={`text-[11px] font-medium ${u.failedLogins > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                              {u.failedLogins}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-[11px] px-4 py-2">{u.anomalyEvents}</TableCell>
                          <TableCell className="text-center px-4 py-2">
                            {(() => {
                              const sevMap: Record<string, string> = {
                                critical: "border-red-500/30 text-red-500 bg-red-500/10",
                                high: "border-orange-500/30 text-orange-500 bg-orange-500/10",
                                medium: "border-yellow-500/30 text-yellow-600 bg-yellow-500/10",
                                low: "border-green-500/30 text-green-600 bg-green-500/10",
                              };
                              return (
                                <Badge className={`text-[9px] px-1.5 border ${sevMap[u.maxSeverity] ?? "border-border text-muted-foreground"}`}>
                                  {u.maxSeverity}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-center text-[10px] text-muted-foreground px-4 py-2">
                            {u.lastIncidentAt ? new Date(u.lastIncidentAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => navigate(`/users/${currentTenant?.id}/${encodeURIComponent(u.username)}`)}
                              data-testid={`btn-view-profile-${i}`}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Privileged Account Risk Chart */}
                {privilegedRiskData.length > 0 && (
                  <div className="px-4 pb-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500" /> Privileged Account Risk Scores
                    </p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={privilegedRiskData} margin={{ top: 4, right: 10, bottom: 0, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "Risk Score"]} />
                        <Bar dataKey="riskScore" name="Risk Score" radius={[3, 3, 0, 0]}>
                          {privilegedRiskData.map((_entry, i: number) => (
                            <Cell key={i} fill={scoreColor(100 - privilegedRiskData[i].riskScore)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Device Trust Pillar */}
      <Card className="border-border/50" data-testid="zt-device-pillar">
        <CardHeader className="pb-2 px-4 pt-3 cursor-pointer" onClick={() => toggle("device")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-500" />
              <CardTitle className="text-sm font-semibold">Device Trust Pillar</CardTitle>
              {posture && <Badge className={`text-[10px] border ${scoreClasses(posture.deviceScore)}`}>Score: {posture.deviceScore}</Badge>}
            </div>
            {expandedSection === "device" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expandedSection === "device" && (
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : posture ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Donut Chart */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Device Trust Distribution</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={devicePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                          {devicePieData.map((_entry, i: number) => <Cell key={i} fill={pieColors[i]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Device Risk Summary */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Device Risk Summary</p>
                    {[
                      { label: "EOL Devices", value: posture.networkExposure.eolDevices, color: C.red, desc: "Running end-of-life OS" },
                      { label: "At-Risk Devices", value: posture.deviceTrustBreakdown.atRisk, color: C.orange, desc: "High/critical risk level" },
                      { label: "Unmanaged Devices", value: posture.deviceTrustBreakdown.unmanaged, color: C.yellow, desc: "Not yet assessed" },
                      { label: "Total Assets", value: posture.networkExposure.totalAssets, color: C.blue, desc: "In inventory" },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                        <div>
                          <p className="text-[12px] font-medium">{m.label}</p>
                          <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                        </div>
                        <span className="text-lg font-bold" style={{ color: m.color }}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* At-Risk Devices Table — includes EDR status and trust score */}
                {posture.atRiskDevices?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-orange-500" /> At-Risk Devices
                    </p>
                    <div className="overflow-auto rounded-md border border-border/40">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="text-[10px] px-3">Hostname</TableHead>
                            <TableHead className="text-[10px] px-3">IP Address</TableHead>
                            <TableHead className="text-[10px] px-3">Operating System</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Vulns</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">EDR Status</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Trust Score</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Risk Level</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Last Seen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {posture.atRiskDevices.map((d: AtRiskDevice, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`zt-device-row-${i}`}>
                              <TableCell className="px-3 py-2 text-[12px] font-medium font-mono">{d.hostname}</TableCell>
                              <TableCell className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{d.ipAddress || "—"}</TableCell>
                              <TableCell className="px-3 py-2 text-[11px]">{d.operatingSystem}</TableCell>
                              <TableCell className="text-center px-3 py-2">
                                <span className={`text-[11px] font-medium ${(d.vulnerabilityCount || 0) > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                  {d.vulnerabilityCount || 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-center px-3 py-2">
                                <Badge className={`text-[9px] px-1.5 border ${edrBadgeClass(d.edrStatus)}`}>
                                  {d.edrStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${d.trustScore}%`, background: scoreColor(d.trustScore) }} />
                                  </div>
                                  <span className="text-[11px] font-medium">{d.trustScore}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center px-3 py-2">{riskLevelBadge(d.riskLevel)}</TableCell>
                              <TableCell className="text-center text-[10px] text-muted-foreground px-3 py-2">
                                {d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        )}
      </Card>

      {/* Network Exposure Pillar */}
      <Card className="border-border/50" data-testid="zt-network-pillar">
        <CardHeader className="pb-2 px-4 pt-3 cursor-pointer" onClick={() => toggle("network")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-sm font-semibold">Network Exposure Pillar</CardTitle>
              {posture && <Badge className={`text-[10px] border ${scoreClasses(posture.networkScore)}`}>Score: {posture.networkScore}</Badge>}
            </div>
            {expandedSection === "network" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expandedSection === "network" && (
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : posture ? (
              <div className="space-y-4">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Lateral Movement", value: posture.networkExposure.lateralMovement, icon: Network, color: C.red, desc: "Incidents (30d)" },
                    { label: "C2 Communication", value: posture.networkExposure.c2Detected, icon: Wifi, color: C.orange, desc: "Detected (30d)" },
                    { label: "Network Threats", value: posture.networkExposure.networkThreats, icon: Shield, color: C.yellow, desc: "Scans/Intrusions (30d)" },
                    {
                      label: "External Exposure",
                      value: `${posture.networkExposure.publicExposedAssets} assets / ${posture.networkExposure.openCriticalPorts} open port sources`,
                      icon: Globe,
                      color: C.purple,
                      desc: `Exposure Score: ${posture.networkExposure.externalExposureScore}/100`,
                    },
                  ].map((m) => (
                    <div key={m.label} className="bg-muted/30 border border-border/40 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${m.color}20` }}>
                        <m.icon className="w-4 h-4" style={{ color: m.color }} />
                      </div>
                      <div>
                        <p className="text-base font-bold leading-tight" style={{ color: m.color }}>{m.value}</p>
                        <p className="text-[10px] font-medium leading-tight">{m.label}</p>
                        <p className="text-[9px] text-muted-foreground">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* External Exposure Score bar */}
                {posture.networkExposure.externalExposureScore > 0 && (
                  <div className="bg-muted/20 border border-border/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 text-[10px] font-medium">
                        <Lock className="w-3 h-3 text-purple-500" />
                        External Exposure Score
                      </div>
                      <span className="text-[11px] font-bold" style={{ color: scoreColor(100 - posture.networkExposure.externalExposureScore) }}>
                        {posture.networkExposure.externalExposureScore}/100
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${posture.networkExposure.externalExposureScore}%`,
                          background: scoreColor(100 - posture.networkExposure.externalExposureScore),
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {posture.networkExposure.publicExposedAssets} assets with public IPs + {posture.networkExposure.openCriticalPorts} external port-scan sources
                    </p>
                  </div>
                )}

                {/* Top Risky Network Segments */}
                {posture.topRiskySegments?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-orange-500" /> Top Risky Network Segments
                    </p>
                    <div className="overflow-auto rounded-md border border-border/40">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="text-[10px] px-3">Segment (/24)</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Incidents (30d)</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Max Severity</TableHead>
                            <TableHead className="text-[10px] px-3 text-center">Last Seen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {posture.topRiskySegments.map((s: NetworkSegment, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`zt-segment-row-${i}`}>
                              <TableCell className="px-3 py-2 text-[12px] font-mono font-medium">{s.segment}</TableCell>
                              <TableCell className="text-center px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden" style={{ width: "48px" }}>
                                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, (s.incidentCount / (posture.topRiskySegments[0]?.incidentCount || 1)) * 100)}%` }} />
                                  </div>
                                  <span className="text-[11px] font-semibold">{s.incidentCount}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center px-3 py-2">{riskLevelBadge(s.maxSeverity)}</TableCell>
                              <TableCell className="text-center text-[10px] text-muted-foreground px-3 py-2">
                                {s.lastSeen ? new Date(s.lastSeen).toLocaleDateString() : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        )}
      </Card>

      {/* Anomaly Timeline with pillar filter */}
      <Card className="border-border/50" data-testid="zt-anomaly-timeline">
        <CardHeader className="pb-1 px-4 pt-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3" /> 30-Day Access Anomaly Timeline
            </CardTitle>
            <div className="flex items-center gap-1">
              {(["all", "identity", "device", "network"] as const).map((f) => (
                <Button
                  key={f}
                  variant={timelineFilter === f ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-[10px] px-2 capitalize"
                  onClick={() => setTimelineFilter(f)}
                  data-testid={`btn-timeline-filter-${f}`}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-1 pb-3 px-2">
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={posture?.anomalyTimeline || []} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  {["identity", "device", "network"].map((k, idx) => (
                    <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={[C.blue, C.purple, C.orange][idx]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={[C.blue, C.purple, C.orange][idx]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                {(timelineFilter === "all" || timelineFilter === "identity") && (
                  <Area type="monotone" dataKey="identity" name="Identity" stroke={C.blue} strokeWidth={1.5} fill="url(#grad-identity)" />
                )}
                {(timelineFilter === "all" || timelineFilter === "device") && (
                  <Area type="monotone" dataKey="device" name="Device" stroke={C.purple} strokeWidth={1.5} fill="url(#grad-device)" />
                )}
                {(timelineFilter === "all" || timelineFilter === "network") && (
                  <Area type="monotone" dataKey="network" name="Network" stroke={C.orange} strokeWidth={1.5} fill="url(#grad-network)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
