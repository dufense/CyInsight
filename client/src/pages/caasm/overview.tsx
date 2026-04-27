import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { QueryErrorState } from "@/components/ui/error-boundary";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  HardDrive, AlertTriangle, ShieldOff, Activity,
  TrendingUp, TrendingDown, Shield, Zap, Server, Monitor, Cloud,
  ArrowRight, ShieldCheck, RefreshCw, Loader2, Target,
  Database, Wifi, Layers, Flame, ChevronRight, Crosshair, Radio, Radar,
  BarChart3, AlertCircle, Cpu, Users,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar as RadarEl, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ── Helpers ─────────────────────────────────────────────────────────────────

function useApi<T>(path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: async () => {
      const r = await fetch(path, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled,
    retry: 1,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

function AnimatedCounter({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = null;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);
  return <span>{display.toLocaleString()}</span>;
}

function PostureRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  const glow = pct >= 80 ? "#22c55e40" : pct >= 60 ? "#f59e0b40" : "#ef444440";
  const label = pct >= 80 ? "STRONG" : pct >= 60 ? "MODERATE" : "CRITICAL";
  const cx = size / 2; const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ filter: `drop-shadow(0 0 12px ${glow})` }} data-testid="posture-ring">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={size * 0.075} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.075}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
      <circle cx={cx} cy={cy} r={r * 0.65} fill="hsl(var(--card))" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize={size * 0.2} fontWeight="700">{pct}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={size * 0.065}>/ 100</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill={color} fontSize={size * 0.065} fontWeight="600">{label}</text>
    </svg>
  );
}

function PulseIndicator({ color = "bg-green-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/15 text-red-500 border-red-500/30",
    high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    medium: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    low: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    info: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  const s = severity?.toLowerCase() || "low";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${styles[s] || styles.low}`}>
      {s}
    </span>
  );
}

function RiskScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-red-500 bg-red-500/10 border-red-500/30" :
    score >= 60 ? "text-orange-500 bg-orange-500/10 border-orange-500/30" :
    score >= 40 ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" :
    "text-green-500 bg-green-500/10 border-green-500/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${color}`}>{Math.round(score)}</span>
  );
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "recently";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Single primary color — all categories use the same hsl(var(--primary)) accent
const PRIMARY_COLOR = "hsl(217, 91%, 55%)";

function mapDeviceCategory(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("server") || t.includes("virtual machine") || t.includes("esxi") || t.includes("hypervisor"))
    return { label: "Servers", icon: Server, color: PRIMARY_COLOR };
  if (t.includes("workstation") || t.includes("laptop") || t.includes("desktop") || t.includes("endpoint"))
    return { label: "Workstations", icon: Monitor, color: PRIMARY_COLOR };
  if (t.includes("cloud") || t.includes("container") || t.includes("lambda") || t.includes("serverless"))
    return { label: "Cloud Assets", icon: Cloud, color: PRIMARY_COLOR };
  if (t.includes("iot") || t.includes("ot") || t.includes("sensor") || t.includes("appliance") || t.includes("printer") || t.includes("camera"))
    return { label: "IoT Devices", icon: Wifi, color: PRIMARY_COLOR };
  if (t.includes("mobile") || t.includes("phone") || t.includes("tablet"))
    return { label: "Mobile", icon: Cpu, color: PRIMARY_COLOR };
  if (t.includes("database") || t.includes("db"))
    return { label: "Databases", icon: Database, color: PRIMARY_COLOR };
  if (t.includes("network") || t.includes("firewall") || t.includes("switch") || t.includes("router"))
    return { label: "Network", icon: HardDrive, color: PRIMARY_COLOR };
  return { label: type || "Other", icon: HardDrive, color: PRIMARY_COLOR };
}

const COVERAGE_DOMAINS = ["Endpoint", "Network", "Cloud", "Email", "Identity", "Data"];

function buildCoverageFromLogSources(logSources: any[]): Array<{ domain: string; coverage: number; target: number }> {
  const domainMap: Record<string, number> = {
    Endpoint: 0, Network: 0, Cloud: 0, Email: 0, Identity: 0, Data: 0,
  };
  const total = logSources.reduce((s: number, l: any) => s + (l.event_count || l.eventCount || 0), 0) || 1;
  for (const ls of logSources) {
    const src = (ls.source_type || ls.log_source || "").toLowerCase();
    const count = ls.event_count || ls.eventCount || 0;
    if (src.includes("endpoint") || src.includes("edr") || src.includes("av") || src.includes("antivirus")) domainMap.Endpoint += count;
    else if (src.includes("network") || src.includes("firewall") || src.includes("ids") || src.includes("ips")) domainMap.Network += count;
    else if (src.includes("cloud") || src.includes("cspm") || src.includes("aws") || src.includes("azure") || src.includes("gcp")) domainMap.Cloud += count;
    else if (src.includes("email") || src.includes("mail")) domainMap.Email += count;
    else if (src.includes("identity") || src.includes("auth") || src.includes("iam") || src.includes("sso") || src.includes("casb")) domainMap.Identity += count;
    else if (src.includes("dlp") || src.includes("data") || src.includes("database")) domainMap.Data += count;
  }
  return COVERAGE_DOMAINS.map(d => ({
    domain: d,
    coverage: Math.min(100, Math.round((domainMap[d] / total) * 400)),
    target: d === "Email" ? 98 : d === "Identity" ? 95 : 90,
  }));
}

function generateThreatTimeline(incidents: any[]): Array<{ date: string; critical: number; high: number; medium: number }> {
  const days: Record<string, { critical: number; high: number; medium: number }> = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    days[key] = { critical: 0, high: 0, medium: 0 };
  }
  for (const inc of incidents) {
    const d = new Date(inc.createdAt || inc.created_at || inc.occurredAt || inc.occurred_at || now);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!(key in days)) continue;
    const sev = (inc.severity || "").toLowerCase();
    if (sev === "critical") days[key].critical++;
    else if (sev === "high") days[key].high++;
    else if (sev === "medium" || sev === "moderate") days[key].medium++;
  }
  return Object.entries(days).map(([date, v]) => ({ date, ...v }));
}

const CRITICALITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#22c55e",
  unclassified: "#6b7280",
};

function CisCriticalityPanel({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { isMSS } = useTenant();

  const { data: cisStats, isLoading: cisLoading, refetch: refetchCis } = useQuery<any>({
    queryKey: ["/api/assets", tenantId, "cis-stats"],
    queryFn: async () => {
      const r = await fetch(`/api/assets/${tenantId}/cis-stats`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!tenantId,
    staleTime: 60000,
  });

  const autoCorrelateMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/assets/${tenantId}/correlate-users`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      toast({ title: "User-Asset Correlation Complete", description: `${data.matched ?? 0} of ${data.checked ?? 0} assets matched` });
    },
    onError: () => toast({ title: "Correlation failed", variant: "destructive" }),
  });

  const autoCritMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/assets/${tenantId}/auto-assign-criticality`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      refetchCis();
      toast({ title: "Criticality Assigned", description: `${data.total ?? 0} assets processed, ${data.counts ? Object.values(data.counts).reduce((a: number, b: any) => a + Number(b), 0) : 0} updated` });
    },
    onError: () => toast({ title: "Auto-assign failed", variant: "destructive" }),
  });

  const critDist: { name: string; value: number; fill: string }[] = useMemo(() => {
    if (!cisStats?.criticalityDistribution) return [];
    return Object.entries(cisStats.criticalityDistribution as Record<string, number>)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v, fill: CRITICALITY_COLORS[k] ?? "#6b7280" }));
  }, [cisStats]);

  const avgCis = cisStats?.avgCisScore ?? null;
  const cisColor = avgCis !== null ? (avgCis >= 70 ? "#22c55e" : avgCis >= 40 ? "#f59e0b" : "#ef4444") : "#6b7280";
  const hasData = cisStats && (critDist.length > 0 || avgCis !== null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="cis-criticality-panel">
      {/* CIS Compliance KPI */}
      <Card className="border-border/40 bg-card/60">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[11px] uppercase tracking-wider flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Avg CIS Score</span>
            <Button size="sm" variant="ghost" className="h-6 text-[9px] px-2" onClick={() => refetchCis()} data-testid="btn-refresh-cis">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {cisLoading ? (
            <div className="h-20 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold" style={{ color: cisColor }} data-testid="text-avg-cis">{avgCis !== null ? Math.round(avgCis) : "—"}</span>
                {avgCis !== null && <span className="text-sm text-muted-foreground mb-1">/ 100</span>}
              </div>
              {avgCis !== null && (
                <>
                  <Progress value={avgCis} className="h-2" style={{ "--progress-background": cisColor } as any} />
                  <Badge className="w-fit text-[9px]" style={{ backgroundColor: `${cisColor}20`, color: cisColor, borderColor: `${cisColor}40` }}>
                    {avgCis >= 70 ? "Compliant" : avgCis >= 40 ? "Partially Compliant" : "Non-Compliant"}
                  </Badge>
                </>
              )}
              {cisStats?.scoredAssets !== undefined && (
                <div className="text-[10px] text-muted-foreground">{cisStats.scoredAssets} assets scored · {cisStats.unscoredAssets ?? 0} pending</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criticality Distribution Donut */}
      <Card className="border-border/40 bg-card/60">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[11px] uppercase tracking-wider flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Criticality Distribution</span>
            {isMSS && (
              <Button size="sm" variant="ghost" className="h-6 text-[9px] px-2" onClick={() => autoCritMut.mutate()} disabled={autoCritMut.isPending} data-testid="btn-auto-criticality">
                {autoCritMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {cisLoading ? (
            <div className="h-24 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : critDist.length === 0 ? (
            <div className="h-24 flex flex-col items-center justify-center gap-2">
              <div className="text-[11px] text-muted-foreground">No criticality data</div>
              {isMSS && (
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => autoCritMut.mutate()} disabled={autoCritMut.isPending} data-testid="btn-run-criticality">
                  <Zap className="w-3 h-3 mr-1" /> Auto-Assign Criticality
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ResponsiveContainer width={80} height={80}>
                <PieChart>
                  <Pie data={critDist} cx="50%" cy="50%" innerRadius={22} outerRadius={38} dataKey="value" strokeWidth={1}>
                    {(critDist ?? []).map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1">
                {(critDist ?? []).map((e) => (
                  <div key={e.name} className="flex items-center justify-between" data-testid={`criticality-row-${e.name.toLowerCase()}`}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: e.fill }} />
                      <span className="text-[10px]">{e.name}</span>
                    </div>
                    <span className="text-[10px] font-medium">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User-Asset Correlation */}
      <Card className="border-border/40 bg-card/60">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-3.5 h-3.5" /> User-Asset Mapping
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-3">
          {cisLoading ? (
            <div className="h-20 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/40 rounded-lg p-2 text-center">
                  <div className="text-xl font-bold text-blue-500" data-testid="text-mapped-assets">{cisStats?.mappedAssets ?? "—"}</div>
                  <div className="text-[9px] text-muted-foreground">Mapped Assets</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-2 text-center">
                  <div className="text-xl font-bold text-purple-500" data-testid="text-unmapped-assets">{cisStats?.unmappedAssets ?? "—"}</div>
                  <div className="text-[9px] text-muted-foreground">Unmapped</div>
                </div>
              </div>
              {(cisStats?.mappedAssets ?? 0) > 0 && (
                <Progress value={cisStats?.mappedAssets / Math.max((cisStats?.mappedAssets ?? 0) + (cisStats?.unmappedAssets ?? 1), 1) * 100} className="h-1.5" />
              )}
              {isMSS && (
                <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" onClick={() => autoCorrelateMut.mutate()} disabled={autoCorrelateMut.isPending} data-testid="btn-auto-correlate-users">
                  {autoCorrelateMut.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Users className="w-3 h-3 mr-1.5" />}
                  Auto-Correlate Users
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OverviewTab({ tenantId, onNavigate }: { tenantId: number; summary?: any; onNavigate?: (tab: string) => void }) {
  const [now] = useState(new Date());

  const base = `/api/asset-inventory/${tenantId}`;

  const { data: summaryData, isLoading: loadSummary, isError: summaryError, refetch } = useApi<any>(`${base}/summary`, !!tenantId);
  const { data: deviceTypes } = useApi<any>(`${base}/device-types`, !!tenantId);
  const { data: riskByCategory } = useApi<any>(`${base}/risk-by-category`, !!tenantId);
  const { data: attackSurface } = useApi<any>(`${base}/attack-surface-score`, !!tenantId);
  const { data: unmanaged } = useApi<any>(`${base}/unmanaged-assets`, !!tenantId);
  const { data: securityCoverage } = useApi<any>(`${base}/security-coverage`, !!tenantId);
  const { data: dashData } = useApi<any>(`/api/dashboard/${tenantId}`, !!tenantId);
  const { data: incidentsResp } = useApi<any>(`/api/incidents/${tenantId}?page=1&pageSize=50`, !!tenantId);
  const { data: devicesResp } = useApi<any>(`${base}/devices?sortBy=risk_score&sortOrder=desc&pageSize=8`, !!tenantId);

  const incidents: any[] = useMemo(() => {
    if (!incidentsResp) return [];
    if (Array.isArray(incidentsResp)) return incidentsResp;
    if (incidentsResp.data) return incidentsResp.data;
    return [];
  }, [incidentsResp]);

  const topDevices: any[] = useMemo(() => {
    if (!devicesResp) return [];
    if (Array.isArray(devicesResp)) return devicesResp;
    if (devicesResp.data) return devicesResp.data;
    return [];
  }, [devicesResp]);

  const totalAssets = summaryData?.devices || deviceTypes?.total || 0;
  const unmanagedCount = unmanaged?.unmanagedCount || 0;
  const managedCount = unmanaged?.managedCount || 0;
  const exposureScore = attackSurface?.exposureScore || 0;
  const postureScore = Math.max(0, 100 - exposureScore);
  const totalIncidents = dashData?.totalIncidents || dashData?.total_incidents || incidents.length || 0;
  const criticalAlerts = dashData?.criticalAlerts || dashData?.critical_alerts || incidents.filter(i => (i.severity || "").toLowerCase() === "critical").length || 0;

  // Build asset category cards from real device-types + risk-by-category
  const assetCategories = useMemo(() => {
    const types: any[] = deviceTypes?.deviceTypes || [];
    const byCategory: Record<string, { count: number; critical: number; color: string; icon: any }> = {};

    for (const dt of types) {
      const mapped = mapDeviceCategory(dt.type);
      const lbl = mapped.label;
      const rbc = riskByCategory || {};
      const categoryKey = Object.keys(rbc).find(k => lbl.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(lbl.split(" ")[0].toLowerCase()));
      const highRiskCount = categoryKey ? (rbc[categoryKey]?.highRiskCount || 0) : 0;
      if (!byCategory[lbl]) {
        byCategory[lbl] = { count: 0, critical: 0, color: mapped.color, icon: mapped.icon };
      }
      byCategory[lbl].count += dt.count;
      byCategory[lbl].critical = Math.max(byCategory[lbl].critical, highRiskCount);
    }

    // Also map riskByCategory directly for categories not in device-types
    if (riskByCategory && Object.keys(byCategory).length === 0) {
      const colorMap: Record<string, string> = {
        Servers: "#3b82f6", Endpoints: "#8b5cf6", Cloud: "#06b6d4",
        IoT: "#f59e0b", Unknown: "#64748b", Other: "#64748b",
      };
      const iconMap: Record<string, any> = {
        Servers: Server, Endpoints: Monitor, Cloud: Cloud, IoT: Wifi,
        Unknown: HardDrive, Other: HardDrive,
      };
      for (const [cat, data] of Object.entries(riskByCategory as Record<string, any>)) {
        if (cat === "Unknown" || cat === "Other") continue;
        byCategory[cat] = {
          count: data.count,
          critical: data.highRiskCount,
          color: colorMap[cat] || "#64748b",
          icon: iconMap[cat] || HardDrive,
        };
      }
    }

    return Object.entries(byCategory)
      .filter(([, v]) => v.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);
  }, [deviceTypes, riskByCategory]);

  // Coverage radar from real log sources
  const coverageData = useMemo(() => {
    const logSources = securityCoverage?.logSources || securityCoverage?.sources || [];
    if (logSources.length > 0) return buildCoverageFromLogSources(logSources);
    const covered = securityCoverage?.overallCoverage || securityCoverage?.overall_coverage || 0;
    return COVERAGE_DOMAINS.map(d => ({
      domain: d,
      coverage: Math.min(100, Math.max(0, covered)),
      target: d === "Email" ? 98 : 90,
    }));
  }, [securityCoverage]);

  // Threat timeline from real incidents
  const timelineData = useMemo(() => generateThreatTimeline(incidents), [incidents]);

  // Live threat feed: real incidents sorted newest first
  const liveFeed = useMemo(() => {
    return [...incidents]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
      .slice(0, 8)
      .map(inc => ({
        title: inc.title || inc.description || "Security incident detected",
        severity: inc.severity || "medium",
        source: inc.logSource || inc.log_source || inc.source || inc.eventSource || "SIEM",
        time: timeAgo(inc.createdAt || inc.created_at || ""),
      }));
  }, [incidents]);

  // Top at-risk assets from real device data
  const topRisks = useMemo(() => {
    return topDevices
      .filter(d => d.hostname || d.ip_address)
      .slice(0, 6)
      .map(d => {
        const rawScore = d.riskScore || d.risk_score || d.overallScore || 0;
        const score = rawScore > 100 ? Math.round(rawScore * 100 / 1000) : rawScore;
        return {
          asset: d.hostname || d.ip_address || "Unknown",
          type: d.endpointType || d.endpoint_type || "Asset",
          risk: score,
          findings: (d.incidentCount || d.incident_count || 0) + (d.vulnerabilityCount || d.vulnerability_count || 0),
          os: d.operatingSystem || d.operating_system || "–",
        };
      })
      .sort((a, b) => b.risk - a.risk);
  }, [topDevices]);

  // Exposure metrics from real data
  const eolCount = summaryData?.eolCount || 0;
  const coverageGap = Math.max(0, 100 - (securityCoverage?.overallCoverage || securityCoverage?.coveragePercent || 80));

  if (loadSummary) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="overview-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="absolute inset-0 blur-md bg-primary/30 animate-pulse rounded-full" />
          </div>
          <p className="text-sm text-muted-foreground">Loading Cyber Asset Intelligence...</p>
        </div>
      </div>
    );
  }

  if (summaryError) {
    return <QueryErrorState moduleName="Cyber Asset Intelligence" onRetry={refetch} />;
  }

  return (
    <div className="space-y-5 animate-fade-in-up" data-testid="caasm-overview">

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border bg-card dark:bg-gradient-to-br dark:from-slate-900 dark:via-blue-950 dark:to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl" />
          <svg className="absolute right-4 top-4 opacity-5" width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="100" cy="100" r="55" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="100" cy="100" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
            <line x1="100" y1="20" x2="100" y2="180" stroke="currentColor" strokeWidth="0.5" />
            <line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </div>
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
          <div className="flex-shrink-0">
            <PostureRing score={postureScore} size={140} />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1">
                <PulseIndicator color="bg-green-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-300">Live Monitoring</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{now.toLocaleTimeString()}</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Cyber Asset Intelligence</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Real-time posture, exposure & threat surface visibility</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Assets", value: totalAssets, icon: HardDrive, color: "text-blue-500 dark:text-blue-300" },
                { label: "Unmanaged", value: unmanagedCount, icon: ShieldOff, color: "text-orange-500 dark:text-orange-300" },
                { label: "Active Incidents", value: totalIncidents, icon: AlertTriangle, color: "text-red-500 dark:text-red-300" },
                { label: "Critical Alerts", value: criticalAlerts, icon: Flame, color: "text-rose-500 dark:text-rose-300" },
              ].map((m) => (
                <div key={m.label} className="bg-muted/50 rounded-xl p-2.5 border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{m.label}</span>
                  </div>
                  <div className={`text-xl font-bold ${m.color}`}>
                    <AnimatedCounter value={m.value} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <Button size="sm" variant="outline"
              onClick={() => refetch()} data-testid="button-refresh-overview">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            {onNavigate && (
              <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white border-0"
                onClick={() => onNavigate("attack")} data-testid="button-view-attack-surface">
                <Target className="w-3.5 h-3.5 mr-1.5" /> Attack Surface
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Asset Category Cards — from real device-type API */}
      {assetCategories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Asset Inventory Breakdown</h3>
            <Badge variant="secondary" className="text-[9px]">{totalAssets.toLocaleString()} total</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(assetCategories ?? []).map(([label, cat]) => (
              <div key={label}
                className="group relative flex flex-col gap-2 p-3 rounded-xl border bg-card/50 hover:bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer overflow-hidden"
                data-testid={`asset-card-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 10% 50%, ${cat.color}15, transparent 70%)` }} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ backgroundColor: `${cat.color}20` }}>
                    <cat.icon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                  </div>
                  {cat.critical > 0 && (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xl font-bold tracking-tight">{cat.count.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
                </div>
                {cat.critical > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] font-semibold text-red-500">{cat.critical} HIGH/CRIT</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* If no device types data, show summary data */}
      {assetCategories.length === 0 && totalAssets > 0 && (
        <div className="p-4 rounded-xl border bg-muted/20">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Asset Inventory</h3>
            <Badge variant="secondary" className="text-[9px]">{totalAssets.toLocaleString()} assets discovered</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Devices", value: summaryData?.devices || 0, icon: Monitor, color: "#3b82f6" },
              { label: "Users", value: summaryData?.users || 0, icon: HardDrive, color: "#8b5cf6" },
              { label: "IPs Tracked", value: summaryData?.ips || 0, icon: Shield, color: "#06b6d4" },
              { label: "Software", value: summaryData?.software || 0, icon: Database, color: "#f59e0b" },
            ].map(m => (
              <div key={m.label} className="bg-card p-3 rounded-lg border">
                <div className="text-xl font-bold">{m.value.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Threat Activity Timeline — real incidents */}
        <Card className="lg:col-span-2" data-testid="threat-timeline-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-red-500" />
              </div>
              <CardTitle className="text-sm">Incident Activity — Last 14 Days</CardTitle>
            </div>
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              {[["#ef4444", "Critical"], ["#f59e0b", "High"], ["#3b82f6", "Medium"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 rounded" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {timelineData.some(d => d.critical > 0 || d.high > 0 || d.medium > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={timelineData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="tg-crit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tg-high" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tg-med" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="url(#tg-crit)" strokeWidth={2} dot={false} name="Critical" />
                  <Area type="monotone" dataKey="high" stroke="#f59e0b" fill="url(#tg-high)" strokeWidth={1.5} dot={false} name="High" />
                  <Area type="monotone" dataKey="medium" stroke="#3b82f6" fill="url(#tg-med)" strokeWidth={1.5} dot={false} name="Medium" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                <Shield className="w-5 h-5 mr-2 text-green-500" />
                No incidents in the last 14 days
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Threat Feed — real incidents */}
        <Card data-testid="live-threat-feed">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <Radio className="w-3.5 h-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm">Live Threat Feed</CardTitle>
            </div>
            <PulseIndicator color="bg-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1 max-h-[240px] overflow-y-auto">
            {liveFeed.length === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                No recent incidents
              </div>
            ) : (
              (liveFeed ?? []).map((ev, i) => (
                <div key={i}
                  className={`flex items-start gap-2.5 p-2 rounded-lg transition-all ${i < 3 ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/30"}`}
                  data-testid={`live-event-${i}`}
                >
                  <SeverityBadge severity={ev.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{ev.title}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{ev.source} · {ev.time}</p>
                  </div>
                  {i < 3 && <PulseIndicator color="bg-primary" />}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Security Coverage Radar — from real log sources */}
        <Card data-testid="security-coverage-radar">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                <Radar className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-sm">Telemetry Coverage</CardTitle>
                <p className="text-[9px] text-muted-foreground mt-0.5">Estimated deployment coverage by security domain · inferred from detected tools &amp; telemetry signals</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-primary rounded" />Actual</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-primary/30 rounded border border-primary/40" />Target</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={coverageData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <RadarEl dataKey="coverage" fill={PRIMARY_COLOR} fillOpacity={0.2} stroke={PRIMARY_COLOR} strokeWidth={2} name="Current" />
                <RadarEl dataKey="target" fill={PRIMARY_COLOR} fillOpacity={0.05} stroke={PRIMARY_COLOR} strokeWidth={1.5} strokeDasharray="3 3" name="Target" opacity={0.4} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: string) => [`${Math.round(Number(v))}%`, name]} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-1.5 mt-1 px-2">
              {(coverageData ?? []).map((d) => (
                <div key={d.domain} className="text-center">
                  <div className="text-[10px] text-muted-foreground">{d.domain}</div>
                  <div className={`text-xs font-bold ${d.coverage >= d.target * 0.9 ? "text-green-500" : d.coverage >= d.target * 0.7 ? "text-yellow-500" : "text-red-500"}`}>
                    {Math.round(d.coverage)}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Risk Distribution from real riskDistribution */}
        <Card data-testid="risk-distribution-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <CardTitle className="text-sm">Risk Distribution</CardTitle>
            </div>
            <Badge variant="outline" className="text-[9px]">{totalAssets} assets</Badge>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {(() => {
              const dist = summaryData?.riskDistribution || {};
              const total = Object.values(dist).reduce((s: number, v: any) => s + (Number(v) || 0), 0) || totalAssets || 1;
              const levels = [
                { key: "critical", label: "Critical", color: "#ef4444" },
                { key: "high", label: "High", color: "#f59e0b" },
                { key: "medium", label: "Medium", color: "#3b82f6" },
                { key: "low", label: "Low", color: "#22c55e" },
              ];
              return levels.map(lv => {
                const count = Number(dist[lv.key] || dist[lv.key.toUpperCase()] || 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={lv.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium capitalize">{lv.label}</span>
                      <span className="text-[10px] font-bold" style={{ color: lv.color }}>{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="relative h-2 bg-muted/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${lv.color}80, ${lv.color})` }} />
                    </div>
                  </div>
                );
              });
            })()}
            <div className="pt-2 border-t">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 rounded-lg p-2">
                  <div className="text-[9px] text-muted-foreground">Anomalies</div>
                  <div className="text-sm font-bold">{summaryData?.anomalies || 0}</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-2">
                  <div className="text-[9px] text-muted-foreground">Unmanaged</div>
                  <div className="text-sm font-bold text-orange-500">{unmanagedCount}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top At-Risk Assets — from real device data */}
        <Card data-testid="top-risk-assets">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center">
                <Crosshair className="w-3.5 h-3.5 text-red-500" />
              </div>
              <CardTitle className="text-sm">Top At-Risk Assets</CardTitle>
            </div>
            <Badge variant="destructive" className="text-[9px]">
              {(topRisks ?? []).filter(r => r.risk >= 70).length} High+
            </Badge>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1">
            {(topRisks ?? []).length === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                No high-risk assets found
              </div>
            ) : (
              (topRisks ?? []).map((asset, i) => (
                <div key={i}
                  className="group flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer border border-transparent hover:border-border"
                  data-testid={`risk-asset-${i}`}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-muted-foreground">#{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">{asset.asset}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{asset.type}{asset.os && asset.os !== "–" ? ` · ${asset.os}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <RiskScoreBadge score={asset.risk} />
                    {asset.findings > 0 && <span className="text-[9px] text-muted-foreground">{asset.findings} findings</span>}
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* CIS Compliance + Criticality Distribution + User-Asset Correlation */}
      <CisCriticalityPanel tenantId={tenantId} />

      {/* Exposure Summary Bar — real data */}
      <div className="relative overflow-hidden rounded-xl border bg-muted/40 dark:bg-gradient-to-r dark:from-slate-900/60 dark:to-blue-950/40 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center border border-red-500/20">
              <Target className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="text-sm font-bold">Exposure Summary</div>
              <div className="text-[10px] text-muted-foreground">{totalAssets} assets · {totalIncidents} incidents</div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Unmanaged Assets", value: unmanagedCount, max: Math.max(totalAssets, 1), color: "#f59e0b" },
              { label: "Exposure Score", value: exposureScore, max: 100, color: "#ef4444" },
              { label: "Coverage Gap", value: Math.round(coverageGap), max: 100, color: "#8b5cf6" },
              { label: "Anomalies", value: summaryData?.anomalies || 0, max: Math.max(summaryData?.anomalies || 1, 10), color: "#06b6d4" },
            ].map((bar) => (
              <div key={bar.label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground font-medium">{bar.label}</span>
                  <span className="text-[9px] font-bold" style={{ color: bar.color }}>{bar.value}</span>
                </div>
                <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, bar.max > 0 ? (bar.value / bar.max) * 100 : 0)}%`, background: `linear-gradient(90deg, ${bar.color}99, ${bar.color})` }} />
                </div>
              </div>
            ))}
          </div>
          {onNavigate && (
            <Button size="sm" variant="outline" className="shrink-0"
              onClick={() => { onNavigate("attack"); window.history.replaceState({}, "", "/caasm?tab=attack"); }} data-testid="button-explore-exposure">
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Explore
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
