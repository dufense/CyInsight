import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Search, Loader2, ArrowUpRight, ArrowRightLeft, Trash2, Anchor, CheckCircle2, HelpCircle, Clock, AlertTriangle, Calendar, Shield, Scale } from "lucide-react";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";

const TIMELINE_COLORS: Record<string, string> = {
  "Immediate": "#ef4444",
  "< 1 Year": "#f59e0b",
  "> 2 Years": "#3b82f6",
  "Under Review": "#8b5cf6",
};

const TIMELINE_ICONS: Record<string, any> = {
  "Immediate": AlertTriangle,
  "< 1 Year": Clock,
  "> 2 Years": Calendar,
  "Under Review": HelpCircle,
};

const STRATEGY_COLORS: Record<string, string> = {
  Rehost: "#3b82f6",
  Replatform: "#8b5cf6",
  Retire: "#ef4444",
  Retain: "#f59e0b",
  Completed: "#22c55e",
  Unknown: "#94a3b8",
};

const STRATEGY_ICONS: Record<string, any> = {
  Rehost: ArrowUpRight,
  Replatform: ArrowRightLeft,
  Retire: Trash2,
  Retain: Anchor,
  Completed: CheckCircle2,
  Unknown: HelpCircle,
};

interface MigrationInventoryProps {
  tenantId: number;
}

function StrategyDashboard({ assets, strategy }: { assets: any[]; strategy: string }) {
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");
  const [infraFilter, setInfraFilter] = useState("all");

  const Icon = STRATEGY_ICONS[strategy] || HelpCircle;
  const color = STRATEGY_COLORS[strategy] || "#94a3b8";

  const envBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => { const e = a.environment || "Unknown"; map[e] = (map[e] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assets]);

  const osBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const os = a.operatingSystem || "Unknown";
      const family = os.match(/windows/i) ? "Windows" : os.match(/rhel|red\s*hat/i) ? "RHEL" : os.match(/suse|sles/i) ? "SUSE" : os.match(/aix/i) ? "AIX" : os.match(/centos/i) ? "CentOS" : os.match(/ubuntu/i) ? "Ubuntu" : os.match(/linux/i) ? "Linux" : os.match(/debian/i) ? "Debian" : os === "Unknown" ? "Unknown" : "Other";
      map[family] = (map[family] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assets]);

  const infraBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const infra = a.infrastructureType || a.datacenterName ? "On-Prem" : "Unknown";
      const resolved = a.infrastructureType || infra;
      map[resolved] = (map[resolved] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assets]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => { const s = a.status || "unknown"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assets]);

  const envs = useMemo(() => [...new Set(assets.map(a => a.environment))].filter(Boolean).sort(), [assets]);
  const osFamilies = useMemo(() => osBreakdown.map(o => o.name).filter(n => n !== "Unknown"), [osBreakdown]);
  const infraTypes = useMemo(() => infraBreakdown.map(i => i.name).filter(n => n !== "Unknown"), [infraBreakdown]);

  const filtered = useMemo(() => assets.filter(a => {
    if (search) {
      const s = search.toLowerCase();
      if (!a.hostname?.toLowerCase().includes(s) && !a.applicationName?.toLowerCase()?.includes(s) && !a.ipAddress?.toLowerCase()?.includes(s)) return false;
    }
    if (envFilter !== "all" && a.environment !== envFilter) return false;
    if (osFilter !== "all") {
      const os = a.operatingSystem || "";
      const family = os.match(/windows/i) ? "Windows" : os.match(/rhel|red\s*hat/i) ? "RHEL" : os.match(/suse|sles/i) ? "SUSE" : os.match(/aix/i) ? "AIX" : os.match(/centos/i) ? "CentOS" : os.match(/ubuntu/i) ? "Ubuntu" : os.match(/linux/i) ? "Linux" : os.match(/debian/i) ? "Debian" : "Other";
      if (family !== osFilter) return false;
    }
    if (infraFilter !== "all") {
      const infra = a.infrastructureType || (a.datacenterName ? "On-Prem" : "Unknown");
      if (infra !== infraFilter) return false;
    }
    return true;
  }), [assets, search, envFilter, osFilter, infraFilter]);

  const OS_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
  const ENV_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#f97316"];
  const STATUS_COLOR_MAP: Record<string, string> = { active: "#22c55e", operational: "#22c55e", running: "#22c55e", decommissioned: "#ef4444", inactive: "#f59e0b", unknown: "#94a3b8" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid={`card-strategy-total-${strategy}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: color + "15" }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold">{assets.length}</p>
              <p className="text-[10px] text-muted-foreground">Total {strategy}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid={`card-strategy-envs-${strategy}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent/30">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{envBreakdown.length}</p>
              <p className="text-[10px] text-muted-foreground">Environments</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid={`card-strategy-os-${strategy}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent/30">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{osBreakdown.filter(o => o.name !== "Unknown").length}</p>
              <p className="text-[10px] text-muted-foreground">OS Families</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid={`card-strategy-infra-${strategy}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent/30">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{infraBreakdown.filter(i => i.name !== "Unknown").length}</p>
              <p className="text-[10px] text-muted-foreground">Infra Types</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">OS Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {osBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={osBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {osBreakdown.map((_, idx) => (
                      <Cell key={idx} fill={OS_COLORS[idx % OS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Environment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {envBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={envBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {envBreakdown.map((_, idx) => (
                      <Cell key={idx} fill={ENV_COLORS[idx % ENV_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Infrastructure & Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Infrastructure</p>
              <div className="space-y-1.5">
                {infraBreakdown.map(i => (
                  <div key={i.name} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate">{i.name}</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                      <div className="flex-1 h-2 rounded-full bg-accent/30">
                        <div className="h-full rounded-full" style={{ width: `${(i.value / assets.length) * 100}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{i.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Status</p>
              <div className="space-y-1.5">
                {statusBreakdown.map(s => (
                  <div key={s.name} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate capitalize">{s.name}</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                      <div className="flex-1 h-2 rounded-full bg-accent/30">
                        <div className="h-full rounded-full" style={{ width: `${(s.value / assets.length) * 100}%`, backgroundColor: STATUS_COLOR_MAP[s.name.toLowerCase()] || "#94a3b8" }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>{strategy} Assets</span>
            <Badge variant="outline">{filtered.length} assets</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search hostname, app, IP..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid={`input-search-${strategy}`} />
            </div>
            <Select value={envFilter} onValueChange={setEnvFilter}>
              <SelectTrigger className="w-36" data-testid={`select-env-${strategy}`}>
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                {envs.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={osFilter} onValueChange={setOsFilter}>
              <SelectTrigger className="w-32" data-testid={`select-os-${strategy}`}>
                <SelectValue placeholder="OS Family" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All OS</SelectItem>
                {osFamilies.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={infraFilter} onValueChange={setInfraFilter}>
              <SelectTrigger className="w-32" data-testid={`select-infra-${strategy}`}>
                <SelectValue placeholder="Infra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Infra</SelectItem>
                {infraTypes.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Hostname</TableHead>
                  <TableHead className="text-xs">IP Address</TableHead>
                  <TableHead className="text-xs">OS</TableHead>
                  <TableHead className="text-xs">Datacenter</TableHead>
                  <TableHead className="text-xs">Cluster</TableHead>
                  <TableHead className="text-xs">Environment</TableHead>
                  <TableHead className="text-xs">Application</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs">Memory (GB)</TableHead>
                  <TableHead className="text-xs">vCPU</TableHead>
                  <TableHead className="text-xs">Storage (GB)</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Migration</TableHead>
                  <TableHead className="text-xs">Patching</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((a: any) => (
                  <TableRow key={a.id} data-testid={`row-migration-${a.id}`}>
                    <TableCell className="text-xs font-medium">{a.hostname}</TableCell>
                    <TableCell className="text-xs font-mono">{a.ipAddress || "-"}</TableCell>
                    <TableCell className="text-xs">{a.operatingSystem || "-"}</TableCell>
                    <TableCell className="text-xs">{a.datacenterName || "-"}</TableCell>
                    <TableCell className="text-xs">{a.clusterName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{a.environment}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.applicationName || "-"}</TableCell>
                    <TableCell className="text-xs">{a.applicationOwner || "-"}</TableCell>
                    <TableCell className="text-xs text-right">{a.memoryGB != null ? a.memoryGB : "-"}</TableCell>
                    <TableCell className="text-xs text-right">{a.vCPUcount != null ? a.vCPUcount : "-"}</TableCell>
                    <TableCell className="text-xs text-right">{a.totalVmdkSizeGB != null ? a.totalVmdkSizeGB : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]" style={{ color: a.status === "active" ? "#22c55e" : a.status === "decommissioned" ? "#ef4444" : "#f59e0b" }}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: (STRATEGY_COLORS[a.migrationStatus] || "#94a3b8") + "20", color: STRATEGY_COLORS[a.migrationStatus] || "#94a3b8" }} className="text-[10px]">
                        {a.migrationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.patchingStatus || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 100 && <p className="text-xs text-muted-foreground text-center py-2">Showing first 100 of {filtered.length} assets</p>}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No assets found with "{strategy}" migration strategy</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DecommissionPlanTab({ decommission }: { decommission: any }) {
  const [search, setSearch] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [legalFilter, setLegalFilter] = useState("all");

  const groups = decommission?.groups || {};
  const summary = decommission?.summary || [];
  const totalWithPlan = decommission?.totalWithDecomPlan || 0;

  const allAssets = useMemo(() => {
    const result: any[] = [];
    for (const [timeline, items] of Object.entries(groups)) {
      for (const item of (items as any[])) {
        result.push({ ...item, decommissionTimeline: timeline });
      }
    }
    return result;
  }, [groups]);

  const filtered = useMemo(() => {
    return allAssets.filter(a => {
      if (search) {
        const s = search.toLowerCase();
        if (!a.hostname?.toLowerCase().includes(s) && !a.applicationName?.toLowerCase()?.includes(s) && !a.datacenterName?.toLowerCase()?.includes(s)) return false;
      }
      if (timelineFilter !== "all" && a.decommissionTimeline !== timelineFilter) return false;
      if (reviewFilter !== "all" && a.reviewStatus !== reviewFilter) return false;
      if (legalFilter === "yes" && !a.legalRequirement) return false;
      if (legalFilter === "no" && a.legalRequirement) return false;
      return true;
    });
  }, [allAssets, search, timelineFilter, reviewFilter, legalFilter]);

  const reviewStatuses = useMemo(() => Array.from(new Set(allAssets.map(a => a.reviewStatus).filter(Boolean))).sort(), [allAssets]);

  const pieData = summary.filter((s: any) => s.count > 0);

  const timelines = ["Immediate", "< 1 Year", "> 2 Years", "Under Review"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {timelines.map(tl => {
          const Icon = TIMELINE_ICONS[tl] || Clock;
          const count = groups[tl]?.length || 0;
          return (
            <Card key={tl} className={`cursor-pointer transition-colors ${timelineFilter === tl ? "ring-2 ring-primary" : ""}`} onClick={() => setTimelineFilter(timelineFilter === tl ? "all" : tl)} data-testid={`card-decom-timeline-${tl}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: (TIMELINE_COLORS[tl] || "#94a3b8") + "15" }}>
                  <Icon className="w-5 h-5" style={{ color: TIMELINE_COLORS[tl] }} />
                </div>
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-[10px] text-muted-foreground">{tl}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Decommission Timeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData.map((s: any) => ({ name: s.timeline, value: s.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((s: any, idx: number) => (
                      <Cell key={idx} fill={TIMELINE_COLORS[s.timeline] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No decommission plan data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Assets by Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pieData.map((s: any) => ({ timeline: s.timeline, count: s.count }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timeline" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pieData.map((s: any, idx: number) => (
                      <Cell key={idx} fill={TIMELINE_COLORS[s.timeline] || "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No decommission plan data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>Decommission Plan Details</span>
            <Badge variant="outline" className="text-xs" data-testid="text-decom-total">{totalWithPlan} assets with decom plan</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search hostname, app, datacenter..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-search-decom" />
            </div>
            <Select value={timelineFilter} onValueChange={setTimelineFilter}>
              <SelectTrigger className="w-36" data-testid="select-decom-timeline">
                <SelectValue placeholder="Timeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Timelines</SelectItem>
                {timelines.map(tl => <SelectItem key={tl} value={tl}>{tl}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reviewFilter} onValueChange={setReviewFilter}>
              <SelectTrigger className="w-40" data-testid="select-decom-review">
                <SelectValue placeholder="Review Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Review Status</SelectItem>
                {reviewStatuses.map(rs => <SelectItem key={rs} value={rs}>{rs}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={legalFilter} onValueChange={setLegalFilter}>
              <SelectTrigger className="w-36" data-testid="select-decom-legal">
                <SelectValue placeholder="Legal Hold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">Legal Hold</SelectItem>
                <SelectItem value="no">No Legal Hold</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">{filtered.length} results</Badge>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Hostname</TableHead>
                  <TableHead className="text-xs">Datacenter</TableHead>
                  <TableHead className="text-xs">Cluster</TableHead>
                  <TableHead className="text-xs">OS</TableHead>
                  <TableHead className="text-xs">Application</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs">Timeline</TableHead>
                  <TableHead className="text-xs">Review Status</TableHead>
                  <TableHead className="text-xs">Legal Hold</TableHead>
                  <TableHead className="text-xs">Server Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((a: any) => (
                  <TableRow key={a.id} data-testid={`row-decom-${a.id}`}>
                    <TableCell className="text-xs font-medium">{a.hostname}</TableCell>
                    <TableCell className="text-xs">{a.datacenterName || "-"}</TableCell>
                    <TableCell className="text-xs">{a.clusterName || "-"}</TableCell>
                    <TableCell className="text-xs">{a.operatingSystem || "-"}</TableCell>
                    <TableCell className="text-xs">{a.applicationName || "-"}</TableCell>
                    <TableCell className="text-xs">{a.applicationOwner || "-"}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: (TIMELINE_COLORS[a.decommissionTimeline] || "#94a3b8") + "20", color: TIMELINE_COLORS[a.decommissionTimeline] || "#94a3b8" }} className="text-[10px]">
                        {a.decommissionTimeline}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.reviewStatus || "-"}</TableCell>
                    <TableCell>
                      {a.legalRequirement ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <Scale className="w-3 h-3 mr-1" />
                          Legal Hold
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{a.serverType || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]" style={{ color: a.status === "active" ? "#22c55e" : a.status === "decommissioned" ? "#ef4444" : "#f59e0b" }}>
                        {a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 100 && <p className="text-xs text-muted-foreground text-center py-2">Showing first 100 of {filtered.length} assets</p>}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No assets found with decommission plans</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MigrationInventory({ tenantId }: MigrationInventoryProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const dashboardRef = useDashboardExportRef();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "migration-inventory"],
  });

  const excelExport = useCallback(() => {
    if (!data?.strategies) return null;
    const sheets: { sheetName: string; data: Record<string, any>[] }[] = [];

    sheets.push({
      sheetName: "Summary",
      data: (data.summary || []).map((s: any) => ({
        Strategy: s.strategy,
        "Asset Count": s.count,
      })),
    });

    for (const [strategy, assets] of Object.entries(data.strategies)) {
      if ((assets as any[]).length === 0) continue;
      sheets.push({
        sheetName: strategy.substring(0, 31),
        data: (assets as any[]).map(a => ({
          Hostname: a.hostname,
          "IP Address": a.ipAddress,
          "Operating System": a.operatingSystem,
          Environment: a.environment,
          Application: a.applicationName,
          Owner: a.applicationOwner,
          Status: a.status,
          "Migration Status": a.migrationStatus,
          "Patching Status": a.patchingStatus,
        })),
      });
    }

    if (data?.decommission?.groups) {
      const decomAssets: any[] = [];
      for (const [timeline, items] of Object.entries(data.decommission.groups)) {
        for (const item of (items as any[])) {
          decomAssets.push({ ...(item as any), decommissionTimeline: timeline });
        }
      }
      if (decomAssets.length > 0) {
        sheets.push({
          sheetName: "Decommission Plan",
          data: decomAssets.map((a: any) => ({
            Hostname: a.hostname,
            Datacenter: a.datacenterName,
            Cluster: a.clusterName,
            "IP Address": a.ipAddress,
            "Operating System": a.operatingSystem,
            Application: a.applicationName,
            Owner: a.applicationOwner,
            Timeline: a.decommissionTimeline,
            "Review Status": a.reviewStatus,
            "Legal Hold": a.legalRequirement ? "Yes" : "No",
            "Server Type": a.serverType,
            Status: a.status,
            "Memory GB": a.memoryGB,
            vCPU: a.vCPUcount,
            "Storage GB": a.totalVmdkSizeGB,
          })),
        });
      }
    }

    return sheets;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const strategies = ["Rehost", "Replatform", "Retire", "Retain", "Completed"];
  const pieData = strategies.map(s => ({
    name: s,
    value: data?.strategies?.[s]?.length || 0,
  })).filter(d => d.value > 0);

  return (
    <div className="space-y-4" ref={dashboardRef} data-testid="migration-inventory">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs" data-testid="text-total-assets">{data?.totalAssets || 0} total assets</Badge>
          <Badge variant="secondary" className="text-xs" data-testid="text-with-migration">{data?.withMigrationStatus || 0} with migration status</Badge>
        </div>
        <DashboardExportBar dashboardTitle="Migration Inventory" containerRef={dashboardRef} onExcelExport={excelExport} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {strategies.map(s => {
          const Icon = STRATEGY_ICONS[s] || HelpCircle;
          const count = data?.strategies?.[s]?.length || 0;
          return (
            <Card key={s} className={`cursor-pointer hover:bg-accent/50 transition-colors ${activeTab === s.toLowerCase() ? "ring-2 ring-primary" : ""}`} onClick={() => setActiveTab(s.toLowerCase())} data-testid={`card-strategy-${s}`}>
              <CardContent className="p-3 text-center">
                <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: STRATEGY_COLORS[s] }} />
                <p className="text-xl font-bold">{count}</p>
                <p className="text-[10px] text-muted-foreground">{s}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className={`cursor-pointer hover:bg-accent/50 transition-colors ${activeTab === "overview" ? "ring-2 ring-primary" : ""}`} onClick={() => setActiveTab("overview")} data-testid="card-strategy-overview">
          <CardContent className="p-3 text-center">
            <HelpCircle className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xl font-bold">{data?.strategies?.Unknown?.length || 0}</p>
            <p className="text-[10px] text-muted-foreground">Unclassified</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1" data-testid="migration-tabs">
          <TabsTrigger value="overview" data-testid="tab-migration-overview">Overview</TabsTrigger>
          {strategies.map(s => (
            <TabsTrigger key={s} value={s.toLowerCase()} data-testid={`tab-migration-${s.toLowerCase()}`}>{s}</TabsTrigger>
          ))}
          <TabsTrigger value="decommission-plan" data-testid="tab-migration-decommission-plan">Decommission Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Migration Strategy Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((d, idx) => (
                        <Cell key={idx} fill={STRATEGY_COLORS[d.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Environment × Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data?.summary?.filter((s: any) => s.count > 0) || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="strategy" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(data?.summary || []).map((s: any, idx: number) => (
                        <Cell key={idx} fill={STRATEGY_COLORS[s.strategy] || "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Strategy Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.summary?.filter((s: any) => s.count > 0).map((s: any) => {
                  const Icon = STRATEGY_ICONS[s.strategy] || HelpCircle;
                  return (
                    <div key={s.strategy} className="flex items-start gap-3 p-3 rounded-lg border">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: (STRATEGY_COLORS[s.strategy] || "#94a3b8") + "15" }}>
                        <Icon className="w-5 h-5" style={{ color: STRATEGY_COLORS[s.strategy] || "#94a3b8" }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">{s.strategy}</h4>
                          <Badge variant="outline">{s.count} assets</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.envBreakdown?.map((e: any) => (
                            <Badge key={e.name} variant="secondary" className="text-[10px]">
                              {e.name}: {e.value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {strategies.map(s => (
          <TabsContent key={s} value={s.toLowerCase()} className="mt-4">
            <StrategyDashboard assets={data?.strategies?.[s] || []} strategy={s} />
          </TabsContent>
        ))}

        <TabsContent value="decommission-plan" className="mt-4">
          <DecommissionPlanTab decommission={data?.decommission} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
