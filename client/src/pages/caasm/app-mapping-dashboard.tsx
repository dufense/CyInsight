import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  AppWindow, Server, Users, Search, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, Shield, Monitor, HardDrive, Activity,
  Clock, CheckCircle2, XCircle, Layers, ArrowRight,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ChartExportButton, useChartExportRef, ExpandableChartWrapper } from "@/components/ui/chart-export-button";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#22c55e",
};

const DECOM_COLORS: Record<string, string> = {
  decommissioned: "#ef4444",
  planned: "#f59e0b",
  powered_off: "#94a3b8",
  under_review: "#8b5cf6",
  active: "#22c55e",
  none: "#22c55e",
};

interface Application {
  name: string;
  category: string;
  serverCount: number;
  servers: string[];
  environments: string[];
  owners: string[];
  osDistribution: Record<string, number>;
  envDistribution: Record<string, number>;
  dcDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  hmcs: string[];
  frames: string[];
  riskSummary: { critical: number; high: number; medium: number; low: number };
  decomStatus: Record<string, number>;
}

interface ViewData {
  label: string;
  totalApps: number;
  totalServers: number;
  categoryBreakdown: Record<string, number>;
  envMatrix: Record<string, Record<string, number>>;
  osVersions: Record<string, number>;
  riskSummary: { critical: number; high: number; medium: number; low: number };
  topOwners: Array<{ name: string; count: number }>;
  applications: Application[];
  crossPlatform?: Array<{ name: string; platforms: string[]; serverCount: number }>;
  migrationStatus?: Record<string, number>;
  patchingStatus?: Record<string, number>;
  monitoringCoverage?: { monitored: number; unmonitored: number };
  supportGroups?: Record<string, number>;
}

interface DashboardData {
  enterpriseBusiness: ViewData;
  aix: ViewData;
  linux: ViewData;
  windows: ViewData;
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    Enterprise: "bg-blue-600 text-white dark:bg-blue-700",
    Business: "bg-green-600 text-white dark:bg-green-700",
    InfoSec: "bg-red-600 text-white dark:bg-red-700",
    "IT Operations": "bg-slate-500 text-white dark:bg-slate-600",
  };
  return (
    <Badge className={`${map[category] || "bg-muted text-muted-foreground"} text-[10px]`}>
      {category}
    </Badge>
  );
}

function KPICards({ view }: { view: ViewData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="kpi-cards">
      <Card data-testid="stat-total-apps">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Apps</p>
              <p className="text-2xl font-bold mt-1">{view.totalApps}</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500">
              <AppWindow className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card data-testid="stat-total-servers">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Servers</p>
              <p className="text-2xl font-bold mt-1">{view.totalServers}</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-500">
              <Server className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
      {Object.entries(view.categoryBreakdown || {}).slice(0, 2).map(([cat, count]) => (
        <Card key={cat} data-testid={`stat-category-${cat.toLowerCase()}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{cat}</p>
                <p className="text-2xl font-bold mt-1">{count}</p>
              </div>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500">
                <Layers className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Card data-testid="stat-risk-critical">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Critical Risk</p>
              <p className="text-2xl font-bold mt-1 text-red-500">{view.riskSummary?.critical || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-500">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card data-testid="stat-risk-high">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">High Risk</p>
              <p className="text-2xl font-bold mt-1 text-orange-500">{view.riskSummary?.high || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-500">
              <Shield className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationTable({ view, tabKey }: { view: ViewData; tabKey: string }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "serverCount" | "category">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const isOsTab = tabKey === "aix" || tabKey === "linux" || tabKey === "windows";
  const [showAllCategories, setShowAllCategories] = useState(isOsTab);
  const [displayLimit, setDisplayLimit] = useState(100);

  useEffect(() => { setDisplayLimit(100); }, [search, showAllCategories, sortField, sortDir]);

  const filtered = useMemo(() => {
    let apps = view.applications || [];
    if (!showAllCategories) {
      apps = apps.filter(a => a.category === "Enterprise" || a.category === "Business");
    }
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.owners.some(o => o.toLowerCase().includes(q))
      );
    }
    apps = [...apps].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "serverCount") cmp = a.serverCount - b.serverCount;
      else if (sortField === "category") cmp = a.category.localeCompare(b.category);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return apps;
  }, [view.applications, search, sortField, sortDir, showAllCategories]);

  const handleSort = (field: "name" | "serverCount" | "category") => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronRight className="w-3 h-3 inline ml-0.5 -rotate-90" />;
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm">Applications ({filtered.length})</CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch
              id={`cat-toggle-${tabKey}`}
              checked={showAllCategories}
              onCheckedChange={setShowAllCategories}
              data-testid={`toggle-all-categories-${tabKey}`}
            />
            <Label htmlFor={`cat-toggle-${tabKey}`} className="text-xs text-muted-foreground cursor-pointer">
              All Categories
            </Label>
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search apps, owners..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
              data-testid={`input-search-${tabKey}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("name")} data-testid={`sort-name-${tabKey}`}>
                  Name <SortIcon field="name" />
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("category")} data-testid={`sort-category-${tabKey}`}>
                  Category <SortIcon field="category" />
                </TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("serverCount")} data-testid={`sort-servers-${tabKey}`}>
                  Servers <SortIcon field="serverCount" />
                </TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Environments</TableHead>
                <TableHead className="text-xs">Owners</TableHead>
                {tabKey === "aix" && <TableHead className="text-xs">HMC/Frames</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, displayLimit).map((app) => (
                <Fragment key={app.name}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandedApp(expandedApp === app.name ? null : app.name)}
                    data-testid={`row-app-${app.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-1">
                        {expandedApp === app.name ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {app.name}
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryBadge(app.category)}</TableCell>
                    <TableCell className="text-xs font-mono">{app.serverCount}</TableCell>
                    <TableCell>
                      {(() => {
                        const ds = app.decomStatus || {};
                        const sdm = app.serverDecomMap || {};
                        const decomServers = Object.values(sdm).filter(v => v === "decommissioned").length;
                        const plannedServers = Object.values(sdm).filter(v => v === "planned").length;
                        const totalServers = app.serverCount || app.servers?.length || 0;
                        if (decomServers > 0 && decomServers === totalServers) {
                          return <Badge className="bg-red-500 text-white text-[10px]" data-testid="badge-decommissioned">Decommissioned</Badge>;
                        }
                        if (decomServers > 0 || plannedServers > 0) {
                          return <Badge className="bg-amber-500 text-white text-[10px]" data-testid="badge-decom-planned">Decom Planned ({decomServers + plannedServers}/{totalServers})</Badge>;
                        }
                        return <Badge className="bg-green-500 text-white text-[10px]" data-testid="badge-active">Active</Badge>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {app.environments.slice(0, 3).map(env => (
                          <Badge key={env} variant="outline" className="text-[10px]">{env}</Badge>
                        ))}
                        {app.environments.length > 3 && (
                          <Badge variant="secondary" className="text-[10px]">+{app.environments.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {app.owners.slice(0, 2).join(", ")}
                      {app.owners.length > 2 && ` +${app.owners.length - 2}`}
                    </TableCell>
                    {tabKey === "aix" && (
                      <TableCell className="text-xs text-muted-foreground">
                        {app.hmcs?.length || 0} HMC / {app.frames?.length || 0} Frame
                      </TableCell>
                    )}
                  </TableRow>
                  {expandedApp === app.name && (
                    <TableRow key={`${app.name}-expanded`}>
                      <TableCell colSpan={tabKey === "aix" ? 7 : 6} className="bg-muted/30 dark:bg-muted/10">
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">Servers ({app.servers.length})</p>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {app.servers.map(s => {
                                  const sdm = app.serverDecomMap || {};
                                  const serverStatus = sdm[s];
                                  return (
                                    <span key={s} className="inline-flex items-center gap-1">
                                      <Badge variant="outline" className="text-[10px] font-mono">{s}</Badge>
                                      {serverStatus === "decommissioned" && <Badge className="bg-red-500 text-white text-[9px] px-1" data-testid={`badge-srv-decom-${s}`}>Decom</Badge>}
                                      {serverStatus === "planned" && <Badge className="bg-amber-500 text-white text-[9px] px-1" data-testid={`badge-srv-planned-${s}`}>Planned</Badge>}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">Risk Summary</p>
                              <div className="flex gap-2">
                                {Object.entries(app.riskSummary || {}).map(([level, count]) => (
                                  <div key={level} className="text-center">
                                    <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: RISK_COLORS[level] || "#666" }}>
                                      {count}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{level}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">All Owners</p>
                              <div className="flex flex-wrap gap-1">
                                {app.owners.map(o => (
                                  <Badge key={o} variant="secondary" className="text-[10px]">{o}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          {tabKey === "aix" && (app.hmcs?.length > 0 || app.frames?.length > 0) && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium mb-1">HMC Associations</p>
                                <div className="flex flex-wrap gap-1">
                                  {(app.hmcs || []).map(h => (
                                    <Badge key={h} variant="outline" className="text-[10px]">{h}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium mb-1">Frame Associations</p>
                                <div className="flex flex-wrap gap-1">
                                  {(app.frames || []).map(f => (
                                    <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {filtered.length > displayLimit && (
            <button
              onClick={() => setDisplayLimit(prev => prev + 100)}
              className="w-full text-xs text-primary hover:underline text-center py-2"
              data-testid={`btn-load-more-${tabKey}`}
            >
              Showing {displayLimit} of {filtered.length} — Load More
            </button>
          )}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No applications match your search</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartsSection({ view }: { view: ViewData }) {
  const categoryData = useMemo(() =>
    Object.entries(view.categoryBreakdown || {}).map(([name, value]) => ({ name, value })),
    [view.categoryBreakdown]
  );

  const envMatrixData = useMemo(() => {
    const matrix = view.envMatrix || {};
    const allCategories = new Set<string>();
    Object.values(matrix).forEach(cats => {
      Object.keys(cats).forEach(c => allCategories.add(c));
    });
    return {
      data: Object.entries(matrix).map(([env, cats]) => ({ name: env, ...cats })),
      categories: Array.from(allCategories),
    };
  }, [view.envMatrix]);

  const osData = useMemo(() =>
    Object.entries(view.osVersions || {})
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    [view.osVersions]
  );

  const risk = view.riskSummary || { critical: 0, high: 0, medium: 0, low: 0 };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">App Distribution by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {categoryData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Environment Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {envMatrixData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={envMatrixData.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                {envMatrixData.categories.map((cat, idx) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[idx % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">OS Version Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {osData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={osData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Risk Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Critical", count: risk.critical, color: "bg-red-500 dark:bg-red-600", textColor: "text-white" },
              { label: "High", count: risk.high, color: "bg-orange-500 dark:bg-orange-600", textColor: "text-white" },
              { label: "Medium", count: risk.medium, color: "bg-yellow-500 dark:bg-yellow-600", textColor: "text-white" },
              { label: "Low", count: risk.low, color: "bg-green-500 dark:bg-green-600", textColor: "text-white" },
            ].map(r => (
              <div key={r.label} className={`${r.color} ${r.textColor} rounded-md p-4 text-center`} data-testid={`risk-card-${r.label.toLowerCase()}`}>
                <p className="text-2xl font-bold">{r.count}</p>
                <p className="text-xs opacity-90">{r.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TopOwnersPanel({ owners }: { owners: Array<{ name: string; count: number }> }) {
  if (!owners?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" /> Top Owners
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {owners.slice(0, 10).map((owner, idx) => (
            <div key={owner.name} className="flex items-center justify-between text-xs" data-testid={`owner-${idx}`}>
              <span className="truncate">{owner.name}</span>
              <Badge variant="secondary" className="text-[10px]">{owner.count} apps</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CrossPlatformPanel({ data }: { data: Array<{ name: string; platforms: string[]; serverCount: number }> }) {
  if (!data?.length) return null;

  const platformColors: Record<string, string> = {
    AIX: "bg-blue-600 text-white dark:bg-blue-700",
    Linux: "bg-green-600 text-white dark:bg-green-700",
    Windows: "bg-purple-600 text-white dark:bg-purple-700",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="w-4 h-4" /> Cross-Platform Correlation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {data.map((app, idx) => (
            <div key={app.name} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" data-testid={`cross-platform-${idx}`}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{app.name}</p>
                <div className="flex gap-1 mt-0.5">
                  {app.platforms.map(p => (
                    <Badge key={p} className={`${platformColors[p] || "bg-muted text-muted-foreground"} text-[9px]`}>{p}</Badge>
                  ))}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{app.serverCount} servers</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DecomTimeline({ applications }: { applications: Application[] }) {
  const decomBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach(app => {
      Object.entries(app.decomStatus || {}).forEach(([status, count]) => {
        counts[status] = (counts[status] || 0) + count;
      });
    });
    return counts;
  }, [applications]);

  if (Object.keys(decomBreakdown).length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> Decommission Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(decomBreakdown).map(([status, count]) => (
            <div
              key={status}
              className="rounded-md p-3 text-center text-white"
              style={{ backgroundColor: DECOM_COLORS[status] || "#666" }}
              data-testid={`decom-${status}`}
            >
              <p className="text-xl font-bold">{count}</p>
              <p className="text-[10px] opacity-90 capitalize">{status.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DCComparison({ applications }: { applications: Application[] }) {
  const dcData = useMemo(() => {
    const dcs: Record<string, { servers: number; apps: Set<string> }> = {};
    applications.forEach(app => {
      Object.entries(app.dcDistribution || {}).forEach(([dc, count]) => {
        if (!dcs[dc]) dcs[dc] = { servers: 0, apps: new Set() };
        dcs[dc].servers += count;
        dcs[dc].apps.add(app.name);
      });
    });
    return Object.entries(dcs).map(([name, data]) => ({
      name, servers: data.servers, apps: data.apps.size,
    }));
  }, [applications]);

  if (dcData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4" /> Datacenter Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {dcData.map(dc => (
            <Card key={dc.name} data-testid={`dc-card-${dc.name}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs font-semibold">{dc.name}</p>
                <p className="text-lg font-bold mt-1">{dc.servers}</p>
                <p className="text-[10px] text-muted-foreground">servers</p>
                <p className="text-[10px] text-muted-foreground">{dc.apps} apps</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LinuxExtras({ view }: { view: ViewData }) {
  const migrationData = useMemo(() =>
    Object.entries(view.migrationStatus || {}).map(([name, value]) => ({ name, value })),
    [view.migrationStatus]
  );

  const patchingData = useMemo(() =>
    Object.entries(view.patchingStatus || {}).map(([name, value]) => ({ name, value })),
    [view.patchingStatus]
  );

  const monitoring = view.monitoringCoverage || { monitored: 0, unmonitored: 0 };
  const monitoringData = [
    { name: "Monitored", value: monitoring.monitored },
    { name: "Unmonitored", value: monitoring.unmonitored },
  ];

  const supportData = useMemo(() =>
    Object.entries(view.supportGroups || {}).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    [view.supportGroups]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {migrationData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" /> Migration Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {migrationData.map(item => {
              const total = migrationData.reduce((s, d) => s + d.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.name} data-testid={`migration-${item.name}`}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize">{item.name.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{item.value} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {patchingData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> Patching Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {patchingData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs py-1" data-testid={`patching-${item.name}`}>
                <div className="flex items-center gap-2">
                  {item.name.toLowerCase().includes("patched") || item.name.toLowerCase().includes("compliant") ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className="capitalize">{item.name.replace(/_/g, " ")}</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">{item.value}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(monitoring.monitored > 0 || monitoring.unmonitored > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monitoring Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={monitoringData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {supportData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Support Group Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={supportData.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WindowsExtras({ view }: { view: ViewData }) {
  const osVersions = useMemo(() =>
    Object.entries(view.osVersions || {})
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const yearA = parseInt(a.name.match(/\d{4}/)?.[0] || "0");
        const yearB = parseInt(b.name.match(/\d{4}/)?.[0] || "0");
        return yearA - yearB;
      }),
    [view.osVersions]
  );

  if (osVersions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="w-4 h-4" /> OS Version Upgrade Path
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 overflow-x-auto py-4">
          {osVersions.map((os, idx) => (
            <div key={os.name} className="flex items-center gap-2 shrink-0">
              <div className="text-center">
                <div className="w-16 h-16 rounded-md flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                  {os.value}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 max-w-[80px] truncate">{os.name}</p>
              </div>
              {idx < osVersions.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const DECOM_NODE_COLORS: Record<string, string> = {
  "decom:Decommissioned": "#ef4444",
  "decom:Planned < 1 Year": "#f59e0b",
  "decom:Planned 1-2 Years": "#8b5cf6",
  "decom:Planned > 2 Years": "#3b82f6",
  "decom:Active": "#22c55e",
};

const SANKEY_LAYER_COLORS: Record<string, string[]> = {
  app: ["#06b6d4", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6", "#a855f7", "#f97316", "#84cc16", "#e879f9", "#22d3ee"],
  os: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"],
  decom: ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"],
  srv: ["#94a3b8", "#64748b", "#78716c", "#a1a1aa", "#9ca3af", "#6b7280"],
  hmc: ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7"],
  frame: ["#f97316", "#f59e0b", "#eab308", "#84cc16"],
  application: ["#06b6d4", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"],
  server: ["#94a3b8", "#64748b", "#78716c"],
};

function OSSankeyDiagram({ data }: { data: any }) {
  const { nodes, links, layerOrder, layerLabels, hasHmcData } = data;

  if (!nodes?.length || !links?.length) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground">No flow data available for this OS</p>
      </div>
    );
  }

  const serverCount = nodes.filter((n: any) => n.layer === "srv" || n.layer === "server").length;
  const width = 1400;
  const height = Math.max(350, Math.min(1500, Math.max(serverCount * 14, nodes.length * 10)));
  const leftPad = 220;
  const rightPad = 180;
  const topPad = 40;
  const bottomPad = 40;
  const padding = topPad;
  const nodeWidth = 18;
  const nodePadding = serverCount > 50 ? 2 : 4;

  const layers: Record<string, number[]> = {};
  nodes.forEach((n: any, i: number) => {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(i);
  });

  const activeLayerOrder = (layerOrder || ["app", "os", "srv"]).filter((l: string) => layers[l]?.length > 0);

  const layerX: Record<string, number> = {};
  const usableWidth = width - leftPad - rightPad - nodeWidth;
  activeLayerOrder.forEach((layer: string, i: number) => {
    layerX[layer] = leftPad + (usableWidth / Math.max(1, activeLayerOrder.length - 1)) * i;
  });

  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  links.forEach((l: any) => {
    outgoing.set(l.source, (outgoing.get(l.source) || 0) + l.value);
    incoming.set(l.target, (incoming.get(l.target) || 0) + l.value);
  });

  const nodeHeights = nodes.map((_: any, i: number) => Math.max(outgoing.get(i) || 0, incoming.get(i) || 0));

  const layerPositions: Record<number, { x: number; y: number; h: number }> = {};
  for (const layer of activeLayerOrder) {
    const nodeIndices = layers[layer] || [];
    const totalValue = nodeIndices.reduce((s: number, i: number) => s + nodeHeights[i], 0);
    const availableHeight = height - topPad - bottomPad - (nodeIndices.length - 1) * nodePadding;
    const scale = totalValue > 0 ? availableHeight / totalValue : 1;
    let currentY = topPad;
    for (const idx of nodeIndices) {
      const h = Math.max(4, nodeHeights[idx] * scale);
      layerPositions[idx] = { x: layerX[layer], y: currentY, h };
      currentY += h + nodePadding;
    }
  }

  const sourceOffsets = new Map<number, number>();
  const targetOffsets = new Map<number, number>();
  const sortedLinks = [...links].sort((a: any, b: any) => (layerPositions[a.target]?.y || 0) - (layerPositions[b.target]?.y || 0));
  const totalFlowValue = links.reduce((s: number, l: any) => s + l.value, 0);

  const getNodeColor = (idx: number): string => {
    const node = nodes[idx];
    if (node.layer === "decom") {
      const nodeKey = `decom:${node.name}`;
      if (DECOM_NODE_COLORS[nodeKey]) return DECOM_NODE_COLORS[nodeKey];
    }
    const layerNodes = layers[node.layer] || [];
    const posInLayer = layerNodes.indexOf(idx);
    const colors = SANKEY_LAYER_COLORS[node.layer] || COLORS;
    return colors[posInLayer % colors.length];
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 600 }}>
        <defs>
          {sortedLinks.map((link: any, i: number) => (
            <linearGradient key={`grad-os-${i}`} id={`os-link-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={getNodeColor(link.source)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={getNodeColor(link.target)} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {sortedLinks.map((link: any, i: number) => {
          const srcPos = layerPositions[link.source];
          const tgtPos = layerPositions[link.target];
          if (!srcPos || !tgtPos) return null;
          const srcTotal = outgoing.get(link.source) || 1;
          const tgtTotal = incoming.get(link.target) || 1;
          const srcOffset = sourceOffsets.get(link.source) || 0;
          const tgtOffset = targetOffsets.get(link.target) || 0;
          const srcBandH = (link.value / srcTotal) * srcPos.h;
          const tgtBandH = (link.value / tgtTotal) * tgtPos.h;
          const x0 = srcPos.x + nodeWidth;
          const y0 = srcPos.y + srcOffset;
          const x1 = tgtPos.x;
          const y1 = tgtPos.y + tgtOffset;
          sourceOffsets.set(link.source, srcOffset + srcBandH);
          targetOffsets.set(link.target, tgtOffset + tgtBandH);
          const midX = (x0 + x1) / 2;

          return (
            <g key={`os-link-${i}`}>
              <path
                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tgtBandH} C${midX},${y1 + tgtBandH} ${midX},${y0 + srcBandH} ${x0},${y0 + srcBandH} Z`}
                fill={`url(#os-link-grad-${i})`}
                opacity={0.6}
              >
                <title>{`${nodes[link.source].name} → ${nodes[link.target].name}: ${link.value}`}</title>
              </path>
            </g>
          );
        })}

        {nodes.map((node: any, idx: number) => {
          const pos = layerPositions[idx];
          if (!pos) return null;
          const color = getNodeColor(idx);
          const isLeftLayer = node.layer === activeLayerOrder[0];
          const isRightLayer = node.layer === activeLayerOrder[activeLayerOrder.length - 1];
          const isSmallLayer = node.layer === "srv" || node.layer === "server";

          return (
            <g key={`os-node-${idx}`}>
              <rect x={pos.x} y={pos.y} width={nodeWidth} height={pos.h} fill={color} rx={3} ry={3}>
                <title>{`${node.name}: ${Math.max(outgoing.get(idx) || 0, incoming.get(idx) || 0)}`}</title>
              </rect>
              {pos.h > (isSmallLayer ? 6 : 10) && (() => {
                const maxChars = isRightLayer ? 35 : isLeftLayer ? 40 : 30;
                const displayName = node.name.length > maxChars ? node.name.substring(0, maxChars) + "..." : node.name;
                return (
                  <text
                    x={isLeftLayer ? pos.x - 4 : pos.x + nodeWidth + 4}
                    y={pos.y + pos.h / 2}
                    textAnchor={isLeftLayer ? "end" : "start"}
                    dominantBaseline="middle"
                    className={`fill-foreground ${isSmallLayer ? "text-[8px]" : "text-[10px]"}`}
                    style={{ cursor: node.name.length > maxChars ? 'default' : undefined }}
                  >
                    {displayName}
                    <title>{node.name}</title>
                  </text>
                );
              })()}
            </g>
          );
        })}

        {activeLayerOrder.map((layer: string) => {
          const x = layerX[layer] + nodeWidth / 2;
          const label = layerLabels?.[layer] || layer.toUpperCase();
          return (
            <text key={`os-label-${layer}`} x={x} y={topPad - 16} textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function OSSankeySection({ tenantId, osKey, title }: { tenantId: number; osKey: string; title: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/applications", tenantId, "sankey-data-by-os", osKey],
    queryFn: async () => {
      const r = await fetch(`/api/applications/${tenantId}/sankey-data-by-os?os=${osKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: !!tenantId,
    retry: 1,
  });

  return (
    <Card data-testid={`os-sankey-${osKey}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowRight className="w-4 h-4" />
          {title}
          {data?.hasHmcData && (
            <Badge className="bg-blue-600 text-white text-[9px]">HMC → Frame → App → Server</Badge>
          )}
        </CardTitle>
        <ExpandableChartWrapper title={title} actions={<ChartExportButton title={title} chartRef={chartRef} />} contentRef={chartRef} />
      </CardHeader>
      <CardContent>
        <div ref={chartRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.nodes?.length > 0 ? (
            <OSSankeyDiagram data={data} />
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-muted-foreground">No flow mapping data for this OS environment</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ViewTab({ view, tabKey, tenantId }: { view: ViewData; tabKey: string; tenantId: number }) {
  const osKeyMap: Record<string, string> = { aix: "aix", linux: "linux", windows: "windows" };
  const osTitleMap: Record<string, string> = {
    aix: "AIX Application → Server Flow",
    linux: "Linux Application → Status → Server Flow",
    windows: "Windows Application → Status → Server Flow",
  };

  return (
    <div className="space-y-6">
      <KPICards view={view} />
      <ApplicationTable view={view} tabKey={tabKey} />

      {osKeyMap[tabKey] && (
        <OSSankeySection tenantId={tenantId} osKey={osKeyMap[tabKey]} title={osTitleMap[tabKey]} />
      )}

      <ChartsSection view={view} />

      {tabKey === "enterprise" && view.crossPlatform && view.crossPlatform.length > 0 && (
        <CrossPlatformPanel data={view.crossPlatform} />
      )}

      {tabKey === "aix" && (
        <>
          <DecomTimeline applications={view.applications || []} />
          <DCComparison applications={view.applications || []} />
        </>
      )}

      {tabKey === "linux" && <LinuxExtras view={view} />}

      {tabKey === "windows" && <WindowsExtras view={view} />}

      <TopOwnersPanel owners={view.topOwners} />
    </div>
  );
}

export default function AppMappingDashboard({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/applications", tenantId, "mapping-dashboard"],
    queryFn: async () => {
      const r = await fetch(`/api/applications/${tenantId}/mapping-dashboard`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text().catch(() => "Failed to load"));
      return r.json();
    },
    enabled: !!tenantId,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="app-mapping-loading">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading application mapping dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="app-mapping-empty">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <AppWindow className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          No application data available. Import asset data to see application mappings.
        </p>
      </div>
    );
  }

  const hasAnyData = data.enterpriseBusiness?.totalApps > 0 || data.aix?.totalApps > 0 || data.linux?.totalApps > 0 || data.windows?.totalApps > 0;

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="app-mapping-empty">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <AppWindow className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          No application data available. Import asset data to see application mappings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="app-mapping-dashboard">
      <Tabs defaultValue="enterprise" className="w-full">
        <TabsList className="w-full justify-start flex-wrap gap-1" data-testid="mapping-tabs">
          <TabsTrigger value="enterprise" data-testid="tab-enterprise">Enterprise & Business</TabsTrigger>
          <TabsTrigger value="aix" data-testid="tab-aix">AIX Environment</TabsTrigger>
          <TabsTrigger value="linux" data-testid="tab-linux">Linux Environment</TabsTrigger>
          <TabsTrigger value="windows" data-testid="tab-windows">Windows Environment</TabsTrigger>
        </TabsList>

        <TabsContent value="enterprise" className="mt-4">
          {data.enterpriseBusiness ? (
            <ViewTab view={data.enterpriseBusiness} tabKey="enterprise" tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No enterprise & business data available</p>
          )}
        </TabsContent>

        <TabsContent value="aix" className="mt-4">
          {data.aix ? (
            <ViewTab view={data.aix} tabKey="aix" tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No AIX environment data available</p>
          )}
        </TabsContent>

        <TabsContent value="linux" className="mt-4">
          {data.linux ? (
            <ViewTab view={data.linux} tabKey="linux" tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No Linux environment data available</p>
          )}
        </TabsContent>

        <TabsContent value="windows" className="mt-4">
          {data.windows ? (
            <ViewTab view={data.windows} tabKey="windows" tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No Windows environment data available</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
