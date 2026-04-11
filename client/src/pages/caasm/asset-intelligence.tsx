import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar as RadarEl,
} from "recharts";
import {
  Monitor, HardDrive, Cpu, MapPin, Users, Shield, RefreshCw, ChevronRight,
  CheckCircle, AlertTriangle, XCircle, Layers, Server, Clock, FileText, BarChart2,
} from "lucide-react";

const PRIMARY = "hsl(var(--primary))";
const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.75)",
  "hsl(var(--primary) / 0.55)",
  "hsl(var(--primary) / 0.40)",
  "hsl(var(--primary) / 0.28)",
  "#06b6d4","#8b5cf6","#f59e0b","#10b981","#ef4444",
  "#3b82f6","#ec4899","#a3e635","#f97316","#6366f1",
  "#14b8a6","#f43f5e","#84cc16","#fb923c","#a855f7",
];

function SectionHeader({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border border-border/60 bg-card/70 backdrop-blur-sm ${className}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-4 py-3 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || "hsl(var(--primary))" }}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const WarrantyStat = ({ stats }: { stats: { name: string; count: number }[] }) => {
  const colorMap: Record<string, string> = { active: "#10b981", expiring_soon: "#f59e0b", expired: "#ef4444", unknown: "#6b7280" };
  const labelMap: Record<string, string> = { active: "Active", expiring_soon: "Expiring Soon", expired: "Expired", unknown: "Unknown" };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.name} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: colorMap[s.name] + "40" }}>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorMap[s.name] }} />
          <div>
            <div className="text-xs text-muted-foreground">{labelMap[s.name] || s.name}</div>
            <div className="text-xl font-bold" style={{ color: colorMap[s.name] }}>{s.count}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

function HBarChart({ data, label = "count" }: { data: { name: string; count: number }[]; label?: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 12).map((d, i) => (
        <div key={d.name} className="flex items-center gap-2 text-sm">
          <div className="w-36 truncate text-xs text-muted-foreground text-right flex-shrink-0" title={d.name}>{d.name}</div>
          <div className="flex-1 bg-muted/30 rounded-full overflow-hidden h-5 relative">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.count / max) * 100}%`, background: PALETTE[i % PALETTE.length] }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-foreground">{d.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── OS REPORTS TAB ─────────────────────────────────────────────────────────
function OSReportsTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Assets" value={data.total} sub="across all platforms" />
        <StatCard label="OS Families" value={data.byOSFamily?.length || 0} sub="distinct OS variants" />
        <StatCard label="Device Types" value={data.byDeviceType?.length || 0} sub="endpoint types" />
        <StatCard label="Manufacturers" value={data.byManufacturer?.length || 0} sub="hardware vendors" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Assets by OS Family">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.byOSFamily?.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" name="Assets" radius={[0, 4, 4, 0]}>
                {data.byOSFamily?.slice(0, 10).map((_: any, i: number) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="OS Distribution Pie">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.byOSFamily?.slice(0, 8)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {data.byOSFamily?.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Device Model Distribution">
          <HBarChart data={data.byModel || []} />
        </ChartCard>
        <ChartCard title="Device Type Breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byDeviceType?.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]}>
                {data.byDeviceType?.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ─── HARDWARE PROFILE TAB ────────────────────────────────────────────────────
function HardwareProfileTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Processor Family Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.byProcessorFamily?.slice(0, 8)} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90}>
                {data.byProcessorFamily?.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Memory Size Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byMemorySize}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]} fill={PRIMARY} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Memory Type">
          <HBarChart data={data.byMemoryType?.filter((d: any) => d.name !== "Unknown") || []} />
        </ChartCard>
        <ChartCard title="Manufacturer Breakdown">
          <HBarChart data={data.byManufacturer || []} />
        </ChartCard>
      </div>

      <ChartCard title="Warranty Status Overview">
        <div className="space-y-4">
          <WarrantyStat stats={data.warrantyStats || []} />
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.warrantyStats?.map((s: any) => ({
              name: { active: "Active", expiring_soon: "Expiring Soon", expired: "Expired", unknown: "Unknown" }[s.name] || s.name,
              count: s.count,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]}>
                {(data.warrantyStats || []).map((s: any) => (
                  <Cell key={s.name} fill={{ active: "#10b981", expiring_soon: "#f59e0b", expired: "#ef4444", unknown: "#6b7280" }[s.name] || PRIMARY} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

// ─── LOCATION & GROUP TAB ───────────────────────────────────────────────────
function LocationGroupTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Assets by Location">
          {(data.byLocation?.filter((d: any) => d.name !== "Unknown").length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.byLocation?.filter((d: any) => d.name !== "Unknown").slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" name="Assets" radius={[0, 4, 4, 0]}>
                  {data.byLocation?.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <MapPin className="w-8 h-8 opacity-30" />
              <p className="text-sm">No location data — assign locations to assets via Asset Explorer</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Assets by Group / Endpoint Group">
          <HBarChart data={data.byGroup?.filter((d: any) => d.name !== "Unknown").slice(0, 12) || []} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Deployment Type">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.byDeploymentType?.filter((d: any) => d.name !== "Unknown")} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {(data.byDeploymentType || []).map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cloud Provider Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byCloudProvider?.filter((d: any) => d.name !== "Unknown").slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]} fill={PRIMARY} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ─── USER MAP TAB ────────────────────────────────────────────────────────────
function UserMapTab({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "user-asset-map"],
    queryFn: () => fetch(`/api/asset-inventory/${tenantId}/user-asset-map`).then(r => r.json()),
    enabled: !!tenantId,
  });

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const riskColor = (r: string) => ({ critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981" }[r?.toLowerCase()] || "#6b7280");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Mapped Users" value={data?.totalUsers || 0} sub="with assigned assets" />
        <StatCard label="Mapped Assets" value={data?.totalMapped || 0} sub="assigned to users" />
        <StatCard label="Unmapped Assets" value={data?.totalUnmapped || 0} sub="no user assigned" color="#f59e0b" />
      </div>

      {(data?.totalUnmapped || 0) > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-muted-foreground"><span className="text-amber-500 font-medium">{data?.totalUnmapped} assets</span> have no user assignment. Use Asset Explorer to link users via the User field.</span>
        </div>
      )}

      <div className="space-y-3">
        {(data?.users || []).slice(0, 30).map((u: any) => (
          <Card key={u.user} className="border-border/50 bg-card/60">
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-primary">
                    {u.user.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{u.user}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">{u.assetCount} asset{u.assetCount !== 1 ? "s" : ""}</Badge>
                  <div className="flex gap-1">
                    {u.assets.slice(0, 3).map((a: any) => (
                      <div key={a.id} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: riskColor(a.riskLevel) + "50", color: riskColor(a.riskLevel) }}>
                        {a.hostname}
                      </div>
                    ))}
                    {u.assets.length > 3 && <span className="text-xs text-muted-foreground">+{u.assets.length - 3}</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(data?.users || []).length === 0 && (
          <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm">No user-asset mappings found. Ensure assets have the User or Last Logged-In User fields populated.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CONTROL COVERAGE TAB ───────────────────────────────────────────────────
function ControlCoverageTab({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "control-coverage"],
    queryFn: () => fetch(`/api/asset-inventory/${tenantId}/control-coverage`).then(r => r.json()),
    enabled: !!tenantId,
  });

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const pctColor = (pct: number) => pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Security Integrations" value={data?.integrationCount || 0} sub="active connectors" />
        <StatCard label="Control Categories" value={data?.coverage?.length || 0} sub="domains assessed" />
        <StatCard label="Avg Coverage" value={`${Math.round((data?.coverage || []).reduce((s: number, c: any) => s + c.percentage, 0) / Math.max((data?.coverage?.length || 1), 1))}%`} sub="across all categories" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Coverage by Security Control Category">
          <div className="space-y-3">
            {(data?.coverage || []).map((c: any) => (
              <div key={c.category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.category}</span>
                  <span className="font-medium" style={{ color: pctColor(c.percentage) }}>{c.percentage}%</span>
                </div>
                <Progress value={c.percentage} className="h-2" style={{ "--progress-color": pctColor(c.percentage) } as any} />
                {c.tools.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {c.tools.slice(0, 3).map((t: string) => <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Coverage Radar">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data?.coverage || []}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <RadarEl name="Coverage %" dataKey="percentage" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.25} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Assets with Lowest Coverage Score (Highest Risk)">
        <div className="space-y-2">
          {(data?.assetsWithControls || []).slice(0, 10).map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/30 last:border-0">
              <div className="w-5 h-5 rounded flex-shrink-0" style={{ background: pctColor(a.coverageScore) + "20", border: `1px solid ${pctColor(a.coverageScore)}40` }}>
                <Shield className="w-3 h-3 m-1" style={{ color: pctColor(a.coverageScore) }} />
              </div>
              <span className="font-mono text-xs flex-1 truncate">{a.hostname}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">{a.os}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${a.coverageScore}%`, background: pctColor(a.coverageScore) }} />
                </div>
                <span className="text-xs font-medium w-8 text-right" style={{ color: pctColor(a.coverageScore) }}>{a.coverageScore}%</span>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function AssetIntelligenceTab() {
  const { selectedTenant } = useTenant();
  const tenantId = selectedTenant?.id || 0;
  const [activeSection, setActiveSection] = useState("os");

  const { data: reportData, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "intelligence-reports"],
    queryFn: () => fetch(`/api/asset-inventory/${tenantId}/intelligence-reports`).then(r => r.json()),
    enabled: !!tenantId,
    staleTime: 60000,
  });

  if (!tenantId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <BarChart2 className="w-10 h-10 opacity-30" />
        <p>Select a tenant to view Asset Intelligence reports</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Asset Intelligence & Reporting</h2>
          <p className="text-sm text-muted-foreground">Visualize, correlate, and report on your full asset inventory</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-reports">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
        </Button>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/40 p-1 rounded-lg">
          {[
            { id: "os", label: "OS & Device Reports", icon: Monitor },
            { id: "hardware", label: "Hardware Profile", icon: Cpu },
            { id: "location", label: "Location & Groups", icon: MapPin },
            { id: "users", label: "User Map", icon: Users },
            { id: "controls", label: "Control Coverage", icon: Shield },
          ].map(t => (
            <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5 text-xs" data-testid={`tab-intelligence-${t.id}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="os" className="mt-5">
          {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div> : <OSReportsTab data={reportData || {}} />}
        </TabsContent>

        <TabsContent value="hardware" className="mt-5">
          {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div> : <HardwareProfileTab data={reportData || {}} />}
        </TabsContent>

        <TabsContent value="location" className="mt-5">
          {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div> : <LocationGroupTab data={reportData || {}} />}
        </TabsContent>

        <TabsContent value="users" className="mt-5">
          <UserMapTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="controls" className="mt-5">
          <ControlCoverageTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
