import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HeartPulse, Database, Server, Clock, MemoryStick, Cpu,
  Activity, Wifi, WifiOff, AlertTriangle, CheckCircle2, XCircle,
  ArrowUpDown, Gauge, Zap, RefreshCw, Cable, Building2,
  Radio, Shield, BarChart3, TrendingUp, Package, CircleDot,
  Globe, HardDrive, Archive, MapPin, ArrowLeftRight,
  Layers, GitMerge, Sliders, Boxes, ChevronDown, ChevronRight, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

interface DbConnectorHealth {
  id: number;
  name: string;
  connector_type: string;
  host: string | null;
  port: number | null;
  database: string | null;
  status: string;
  last_tested_at: string | null;
  is_active: boolean;
  scope: string;
  has_credentials?: boolean;
}

interface PlatformHealthData {
  timestamp: string;
  systemHealth: {
    uptime: number;
    nodeVersion: string;
    memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
    database: { status: string; latencyMs: number; pool: { total: number; idle: number; waiting: number } };
    cache: { entries: number; hits: number; misses: number };
  };
  dependencies: Array<{ name: string; status: string; latencyMs: number | null; details: string }>;
  performance: {
    events1h: number; events24h: number; activeSources24h: number; eventsPerHour: number;
    hourlyBuckets: Array<{ time: string; count: number; tenants: number }>;
  };
  integrations: Array<{
    id: number; tenantId: number; tenantName: string; tenantType: string;
    platformKey: string; platformName: string; category: string; status: string;
    pollingEnabled: boolean; pollingIntervalMinutes: number;
    lastPollAt: string | null; lastPollStatus: string | null; lastPollMessage: string | null;
    eventsImported: number; isEnabled: boolean;
    inactivityLevel: string | null; timeSinceLastPollMin: number | null;
  }>;
  tenantHealth: Array<{
    tenantId: number; tenantName: string; tenantType: string;
    events24h: number; incidents24h: number; activeIntegrations: number;
    lastEvent: string | null; inactive: boolean; healthStatus: string;
  }>;
  pipeline: {
    totalBatches: number; completed: number; failed: number; inProgress: number;
    totalProcessed: number; totalErrors: number; dlqCount: number;
    receiver: { totalReceived: number; httpPush: number; syslog: number; webhook: number; hec: number; errors: number; startedAt: string };
  };
  dbConnectors?: DbConnectorHealth[];
  duckdb?: { available: boolean; error: string | null };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    connected: { variant: "default", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    configured: { variant: "default", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    healthy: { variant: "default", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    standalone: { variant: "secondary", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    not_configured: { variant: "secondary", className: "bg-muted text-muted-foreground" },
    unconfigured: { variant: "secondary", className: "bg-muted text-muted-foreground" },
    warning: { variant: "secondary", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    degraded: { variant: "secondary", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    error: { variant: "destructive", className: "bg-red-500/10 text-red-500 border-red-500/20" },
    critical: { variant: "destructive", className: "bg-red-500/10 text-red-500 border-red-500/20" },
    unreachable: { variant: "destructive", className: "bg-red-500/10 text-red-500 border-red-500/20" },
    unavailable: { variant: "destructive", className: "bg-red-500/10 text-red-500 border-red-500/20" },
    disconnected: { variant: "outline", className: "bg-muted text-muted-foreground" },
    disabled: { variant: "outline", className: "bg-muted text-muted-foreground" },
    configuring: { variant: "secondary", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  };
  const c = config[status] || config.disconnected;
  return <Badge variant={c.variant} className={`${c.className} text-[11px] font-medium`} data-testid={`status-${status}`}>{status.replace(/_/g, " ")}</Badge>;
}

function HealthDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-500",
    connected: "bg-emerald-500",
    configured: "bg-emerald-500",
    warning: "bg-amber-500",
    degraded: "bg-amber-500",
    critical: "bg-red-500",
    error: "bg-red-500",
    unreachable: "bg-red-500",
    unavailable: "bg-red-500",
    disconnected: "bg-gray-400",
    not_configured: "bg-gray-400",
    unconfigured: "bg-gray-400",
  };
  const c = colors[status] || "bg-gray-400";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {(status === "healthy" || status === "connected") && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${c}`} />
    </span>
  );
}

function SystemHealthCards({ data }: { data: PlatformHealthData }) {
  const { systemHealth: sh } = data;
  const memPercent = Math.round((sh.memory.heapUsed / sh.memory.heapTotal) * 100);
  const cacheHitRate = sh.cache.hits + sh.cache.misses > 0
    ? Math.round((sh.cache.hits / (sh.cache.hits + sh.cache.misses)) * 100) : 0;

  const cards = [
    {
      title: "Uptime",
      value: formatUptime(sh.uptime),
      icon: Clock,
      detail: `Node ${sh.nodeVersion}`,
      status: sh.uptime > 300 ? "healthy" : "warning",
    },
    {
      title: "Database",
      value: `${sh.database.latencyMs}ms`,
      icon: Database,
      detail: `Pool: ${sh.database.pool.total} total, ${sh.database.pool.idle} idle`,
      status: sh.database.latencyMs < 50 ? "healthy" : sh.database.latencyMs < 200 ? "warning" : "critical",
    },
    {
      title: "Memory",
      value: `${sh.memory.heapUsed}/${sh.memory.heapTotal} MB`,
      icon: MemoryStick,
      detail: `${memPercent}% heap used • RSS: ${sh.memory.rss} MB`,
      status: memPercent < 70 ? "healthy" : memPercent < 90 ? "warning" : "critical",
    },
    {
      title: "API Cache",
      value: `${cacheHitRate}% hit rate`,
      icon: Zap,
      detail: `${sh.cache.entries} entries • ${sh.cache.hits} hits / ${sh.cache.misses} misses`,
      status: cacheHitRate > 50 ? "healthy" : cacheHitRate > 20 ? "warning" : "critical",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="system-health-cards">
      {cards.map((card) => (
        <Card key={card.title} className="relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <card.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
              </div>
              <HealthDot status={card.status} />
            </div>
            <div className="text-xl font-bold" data-testid={`metric-${card.title.toLowerCase()}`}>{card.value}</div>
            <p className="text-[11px] text-muted-foreground mt-1">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DependenciesPanel({ data }: { data: PlatformHealthData }) {
  const connectors = data.dbConnectors ?? [];
  const duckdb = data.duckdb;
  return (
    <div className="space-y-4">
      <Card data-testid="dependencies-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Cable className="w-4 h-4" />
            Dependencies
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Service</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Latency</TableHead>
                <TableHead className="text-xs">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dependencies.map((dep) => (
                <TableRow key={dep.name}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <HealthDot status={dep.status} />
                      {dep.name}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={dep.status} /></TableCell>
                  <TableCell className="text-sm">{dep.latencyMs !== null ? `${dep.latencyMs}ms` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{dep.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(duckdb || connectors.length > 0) && (
        <Card data-testid="data-infra-connectors-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Data Infrastructure Connectors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Connector</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">Scope</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Last Tested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duckdb && (
                  <TableRow data-testid="row-duckdb-engine">
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <HealthDot status={duckdb.available ? "connected" : "degraded"} />
                        DuckDB Analytics Engine
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">duckdb</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">In-memory / Parquet</TableCell>
                    <TableCell><Badge variant="default" className="text-[10px]">global</Badge></TableCell>
                    <TableCell>
                      <StatusBadge status={duckdb.available ? "connected" : "unavailable"} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {duckdb.error ? duckdb.error.slice(0, 40) : "—"}
                    </TableCell>
                  </TableRow>
                )}
                {connectors.map((c) => (
                  <TableRow key={c.id} data-testid={`row-db-connector-health-${c.id}`}>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <HealthDot status={c.status === "connected" ? "connected" : c.status === "unreachable" ? "error" : "unknown"} />
                        {c.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{c.connector_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.host ? `${c.host}${c.port ? `:${c.port}` : ""}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.scope === "global" ? "default" : "secondary"} className="text-[10px]">{c.scope}</Badge>
                    </TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.last_tested_at ? formatTimeAgo(c.last_tested_at) : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PerformanceMetrics({ data }: { data: PlatformHealthData }) {
  const { performance: perf } = data;
  const chartData = perf.hourlyBuckets.map((b) => ({
    time: new Date(b.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    events: b.count,
    tenants: b.tenants,
  }));

  return (
    <Card data-testid="performance-metrics">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Event Ingestion (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="metric-events-1h">{perf.events1h.toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground">Events (1h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="metric-events-24h">{perf.events24h.toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground">Events (24h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold" data-testid="metric-active-sources">{perf.activeSources24h}</div>
            <div className="text-[11px] text-muted-foreground">Active Sources</div>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="events" stroke="hsl(var(--primary))" fill="url(#eventGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            <Activity className="w-5 h-5 mr-2" />
            No event data in the last 24 hours
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationStatus({ data }: { data: PlatformHealthData }) {
  const [sortField, setSortField] = useState<string>("status");
  const sorted = [...data.integrations].sort((a, b) => {
    if (sortField === "status") {
      const order: Record<string, number> = { error: 0, disconnected: 1, configuring: 2, connected: 3, disabled: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    }
    if (sortField === "events") return b.eventsImported - a.eventsImported;
    if (sortField === "lastPoll") return (b.lastPollAt || "").localeCompare(a.lastPollAt || "");
    return 0;
  });

  return (
    <Card data-testid="integration-status">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Integrations & Connectors
            <Badge variant="outline" className="ml-1 text-[10px]">{data.integrations.length}</Badge>
          </CardTitle>
          <div className="flex gap-1">
            {["status", "events", "lastPoll"].map((f) => (
              <Button key={f} size="sm" variant={sortField === f ? "default" : "ghost"} className="h-6 text-[10px] px-2"
                onClick={() => setSortField(f)} data-testid={`sort-${f}`}>
                {f === "status" ? "Status" : f === "events" ? "Events" : "Last Poll"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky top-0 bg-card">Platform</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card">Tenant</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card">Status</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card">Polling</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card">Last Poll</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card text-right">Events</TableHead>
                <TableHead className="text-xs sticky top-0 bg-card">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No integrations configured</TableCell></TableRow>
              ) : sorted.map((intg) => (
                <TableRow key={intg.id} data-testid={`integration-row-${intg.id}`}
                  className={intg.inactivityLevel === "critical" ? "bg-red-500/5" : intg.inactivityLevel === "warning" ? "bg-amber-500/5" : ""}>
                  <TableCell className="font-medium text-sm">{intg.platformName}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{intg.tenantType}</Badge>
                      {intg.tenantName}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={intg.status} /></TableCell>
                  <TableCell>
                    {intg.pollingEnabled ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Every {intg.pollingIntervalMinutes}m</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(intg.lastPollAt)}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{intg.eventsImported.toLocaleString()}</TableCell>
                  <TableCell>
                    {intg.inactivityLevel === "critical" ? (
                      <div className="flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-[10px] text-red-500 font-medium">
                          {intg.timeSinceLastPollMin ? `${intg.timeSinceLastPollMin}m inactive` : "Never polled"}
                        </span>
                      </div>
                    ) : intg.inactivityLevel === "warning" ? (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[10px] text-amber-500 font-medium">{intg.timeSinceLastPollMin}m ago</span>
                      </div>
                    ) : intg.pollingEnabled ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] text-emerald-500">Active</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TenantHealthGrid({ data }: { data: PlatformHealthData }) {
  const statusIcon = (s: string) => {
    if (s === "healthy") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const statusColor = (s: string) => {
    if (s === "healthy") return "border-emerald-500/20";
    if (s === "warning") return "border-amber-500/20";
    return "border-red-500/20";
  };

  return (
    <Card data-testid="tenant-health-grid">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Per-Tenant Health (24h)
          <Badge variant="outline" className="ml-1 text-[10px]">{data.tenantHealth.length} tenants</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.tenantHealth.map((tenant) => (
            <div
              key={tenant.tenantId}
              className={`rounded-lg border-2 ${statusColor(tenant.healthStatus)} p-3 space-y-2`}
              data-testid={`tenant-health-${tenant.tenantId}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(tenant.healthStatus)}
                  <span className="font-medium text-sm truncate max-w-[140px]">{tenant.tenantName}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">{tenant.tenantType}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold">{tenant.events24h}</div>
                  <div className="text-[10px] text-muted-foreground">Events</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{tenant.incidents24h}</div>
                  <div className="text-[10px] text-muted-foreground">Incidents</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{tenant.activeIntegrations}</div>
                  <div className="text-[10px] text-muted-foreground">Connectors</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Last event: {formatTimeAgo(tenant.lastEvent)}</span>
                {tenant.inactive && (
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                    <AlertTriangle className="w-3 h-3 mr-1" />Inactive
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineStatus({ data }: { data: PlatformHealthData }) {
  const { pipeline: p } = data;
  const successRate = p.totalBatches > 0 ? Math.round((p.completed / p.totalBatches) * 100) : 100;

  const receiverChannels = [
    { name: "HTTP Push", value: p.receiver.httpPush, icon: Radio },
    { name: "Syslog", value: p.receiver.syslog, icon: Server },
    { name: "Webhook", value: p.receiver.webhook, icon: Cable },
    { name: "Splunk HEC", value: p.receiver.hec, icon: Zap },
  ];

  const barData = receiverChannels.map((c) => ({ name: c.name, value: c.value }));
  const colors = ["hsl(var(--primary))", "hsl(210, 80%, 55%)", "hsl(280, 65%, 55%)", "hsl(35, 90%, 55%)"];

  return (
    <Card data-testid="pipeline-status">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Package className="w-4 h-4" />
          Pipeline & Receiver Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline (24h)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xl font-bold">{p.totalBatches}</div>
                <div className="text-[10px] text-muted-foreground">Total Batches</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xl font-bold text-emerald-500">{successRate}%</div>
                <div className="text-[10px] text-muted-foreground">Success Rate</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xl font-bold">{p.totalProcessed.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Events Processed</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className={`text-xl font-bold ${p.failed > 0 || p.dlqCount > 0 ? "text-red-500" : ""}`}>
                  {p.failed + p.dlqCount}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Failures + DLQ
                </div>
              </div>
            </div>
            {p.inProgress > 0 && (
              <div className="flex items-center gap-2 text-xs text-blue-500">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {p.inProgress} batch(es) currently processing
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Receiver Channels
              <Badge variant="outline" className="ml-2 text-[10px]">{p.receiver.totalReceived} total</Badge>
            </h4>
            {p.receiver.totalReceived > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="space-y-2">
                {receiverChannels.map((ch) => (
                  <div key={ch.name} className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <ch.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      {ch.name}
                    </div>
                    <span className="font-mono text-sm">{ch.value}</span>
                  </div>
                ))}
              </div>
            )}
            {p.receiver.errors > 0 && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <XCircle className="w-3.5 h-3.5" />
                {p.receiver.errors} receiver error(s) since startup
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DataPlaneRegionHealth {
  regionId: string;
  name: string;
  location: string;
  cloudProvider: string;
  status: "active" | "standby" | "degraded";
  isPrimary: boolean;
  metadata?: Record<string, any>;
  tenantCount: number;
  health: {
    dbLatencyMs: number | null;
    dbConnected: boolean;
    kafkaLag: number | null;
    kafkaConnected: boolean;
    clickHouseStatus: string;
    storageConnected: boolean;
    storageUsedGB: number;
    storageCapacityGB: number;
    lastChecked: string;
  };
  connectivity: {
    managementToRegion: string;
    latencyMs: number | null;
    lastHeartbeat: string;
  };
  archival: {
    pipelineStatus: string;
    lastArchivalRun: string | null;
    pendingArchivalCount: number;
    archivedEventsTotal: number;
  };
}

interface DataPlaneHealthResponse {
  timestamp: string;
  overall: {
    totalRegions: number;
    activeRegions: number;
    degradedRegions: number;
    standbyRegions: number;
    totalTenants: number;
    assignedTenants: number;
  };
  regions: DataPlaneRegionHealth[];
}

function DataPlaneOverviewCards({ data }: { data: DataPlaneHealthResponse }) {
  const { overall } = data;
  const cards = [
    { title: "Total Regions", value: overall.totalRegions, icon: Globe, status: "healthy" as const },
    { title: "Active", value: overall.activeRegions, icon: CheckCircle2, status: overall.activeRegions === overall.totalRegions ? "healthy" as const : "warning" as const },
    { title: "Degraded", value: overall.degradedRegions, icon: AlertTriangle, status: overall.degradedRegions > 0 ? "critical" as const : "healthy" as const },
    { title: "Assigned Tenants", value: `${overall.assignedTenants}/${overall.totalTenants}`, icon: Building2, status: "healthy" as const },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="data-plane-overview-cards">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <card.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
              </div>
              <HealthDot status={card.status} />
            </div>
            <div className="text-xl font-bold" data-testid={`metric-dp-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RegionHealthCards({ data }: { data: DataPlaneHealthResponse }) {
  const regionStatusColor = (status: string) => {
    if (status === "active") return "border-emerald-500/20";
    if (status === "standby") return "border-blue-500/20";
    return "border-red-500/20";
  };

  const regionStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Active</Badge>;
    if (status === "standby") return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">Standby</Badge>;
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">Degraded</Badge>;
  };

  const latencyStatus = (ms: number | null) => {
    if (ms === null) return "disconnected";
    if (ms < 50) return "healthy";
    if (ms < 200) return "warning";
    return "critical";
  };

  return (
    <Card data-testid="region-health-cards">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Regional Data Planes
          <Badge variant="outline" className="ml-1 text-[10px]">{data.regions.length} regions</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.regions.map((region) => (
            <div
              key={region.regionId}
              className={`rounded-lg border-2 ${regionStatusColor(region.status)} p-4 space-y-3`}
              data-testid={`region-health-${region.regionId}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{region.name}</span>
                  {region.isPrimary && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">Primary</Badge>
                  )}
                </div>
                {regionStatusBadge(region.status)}
              </div>

              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {region.location} ({region.cloudProvider})
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Database className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">DB Latency</span>
                  </div>
                  <div className="text-sm font-bold flex items-center justify-center gap-1">
                    <HealthDot status={latencyStatus(region.health.dbLatencyMs)} />
                    {region.health.dbLatencyMs !== null ? `${region.health.dbLatencyMs}ms` : "N/A"}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Kafka Lag</span>
                  </div>
                  <div className="text-sm font-bold flex items-center justify-center gap-1">
                    <HealthDot status={region.health.kafkaConnected ? (region.health.kafkaLag !== null && region.health.kafkaLag < 50 ? "healthy" : "warning") : "disconnected"} />
                    {region.health.kafkaLag !== null ? region.health.kafkaLag : "N/A"}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Server className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">ClickHouse</span>
                  </div>
                  <div className="text-sm font-bold">
                    <StatusBadge status={region.health.clickHouseStatus === "green" ? "healthy" : region.health.clickHouseStatus === "yellow" ? "warning" : "disconnected"} />
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <HardDrive className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Storage</span>
                  </div>
                  <div className="text-sm font-bold">
                    {region.health.storageCapacityGB > 0
                      ? `${region.health.storageUsedGB}/${region.health.storageCapacityGB} GB`
                      : "N/A"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {region.tenantCount} tenants
                </span>
                <span className="flex items-center gap-1">
                  <Archive className="w-3 h-3" />
                  {region.archival.archivedEventsTotal.toLocaleString()} archived
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectivityMatrix({ data }: { data: DataPlaneHealthResponse }) {
  return (
    <Card data-testid="connectivity-matrix">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" />
          Management ↔ Data Plane Connectivity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Region</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Latency</TableHead>
              <TableHead className="text-xs">Last Heartbeat</TableHead>
              <TableHead className="text-xs">DB</TableHead>
              <TableHead className="text-xs">Kafka</TableHead>
              <TableHead className="text-xs">Storage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.regions.map((region) => (
              <TableRow key={region.regionId} data-testid={`connectivity-row-${region.regionId}`}>
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center gap-2">
                    <HealthDot status={region.connectivity.managementToRegion === "connected" ? "healthy" : region.connectivity.managementToRegion === "standby" ? "warning" : "disconnected"} />
                    {region.name}
                    {region.isPrimary && <Badge variant="outline" className="text-[9px] px-1 py-0">Primary</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={region.connectivity.managementToRegion} />
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {region.connectivity.latencyMs !== null ? `${region.connectivity.latencyMs}ms` : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTimeAgo(region.connectivity.lastHeartbeat)}
                </TableCell>
                <TableCell>
                  {region.health.dbConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                </TableCell>
                <TableCell>
                  {region.health.kafkaConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                </TableCell>
                <TableCell>
                  {region.health.storageConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ArchivalPipelineStatus({ data }: { data: DataPlaneHealthResponse }) {
  return (
    <Card data-testid="archival-pipeline-status">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Data Archival Pipeline Status
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Region</TableHead>
              <TableHead className="text-xs">Pipeline</TableHead>
              <TableHead className="text-xs">Last Run</TableHead>
              <TableHead className="text-xs text-right">Pending</TableHead>
              <TableHead className="text-xs text-right">Total Archived</TableHead>
              <TableHead className="text-xs text-right">Storage Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.regions.map((region) => (
              <TableRow key={region.regionId} data-testid={`archival-row-${region.regionId}`}>
                <TableCell className="font-medium text-sm">{region.name}</TableCell>
                <TableCell>
                  <Badge className={
                    region.archival.pipelineStatus === "running"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]"
                      : "bg-muted text-muted-foreground text-[10px]"
                  }>
                    {region.archival.pipelineStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTimeAgo(region.archival.lastArchivalRun)}
                </TableCell>
                <TableCell className="text-sm text-right font-mono">
                  {region.archival.pendingArchivalCount}
                </TableCell>
                <TableCell className="text-sm text-right font-mono">
                  {region.archival.archivedEventsTotal.toLocaleString()}
                </TableCell>
                <TableCell className="text-sm text-right font-mono">
                  {region.health.storageUsedGB > 0 ? `${region.health.storageUsedGB} GB` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DataPlaneHealthSection() {
  const { data, isLoading } = useQuery<DataPlaneHealthResponse>({
    queryKey: ["/api/admin/platform-health/data-planes"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="data-plane-health-loading">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4" data-testid="data-plane-health-section">
      <div className="flex items-center gap-2 pt-2">
        <Globe className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold">Data Plane Health</h3>
        <Badge variant="outline" className="text-[10px]">{data.overall.totalRegions} regions</Badge>
      </div>

      <DataPlaneOverviewCards data={data} />

      <RegionHealthCards data={data} />

      <ConnectivityMatrix data={data} />

      <ArchivalPipelineStatus data={data} />
    </div>
  );
}

export default function PlatformHealthTab() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<PlatformHealthData>({
    queryKey: ["/api/admin/platform-health"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="platform-health-loading">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-8 text-center" data-testid="platform-health-error">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Health Data</h3>
        <p className="text-muted-foreground mb-4">Unable to fetch platform health metrics.</p>
        <Button onClick={() => refetch()} data-testid="button-retry">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="platform-health-dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Platform Health Monitor</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"} • Auto-refresh 30s
          </span>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-7" data-testid="button-refresh-health">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <SystemHealthCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DependenciesPanel data={data} />
        <PerformanceMetrics data={data} />
      </div>

      <IntegrationStatus data={data} />

      <TenantHealthGrid data={data} />

      <PipelineStatus data={data} />

      <ClickHouseHealthCard />

      <ClickHouseIngestMonitorSettingsCard />
      <ClickHouseFastPathStatsCard />
      <ThreatFlowBackfillCard />
      <ClickHouseIngestOutageHistory />

      <QuotaEnginePanel />

      <FederatedIntelPanel />

      <DataPlaneHealthSection />
    </div>
  );
}

// ── ClickHouse Health Card (Task #172) ────────────────────────────────────────

interface ClickHouseHealthData {
  status: "connected" | "unreachable" | "not_enabled";
  enabled: boolean;
  version?: string | null;
  latencyMs?: number;
  activeQueries?: number | null;
  recentInsertCount?: number | null;
  recentInsertRatePerSec?: number | null;
  insertRateWindowSeconds?: number;
  error?: string | null;
  message?: string;
  checkedAt: string;
}

function ClickHouseHealthCard() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<ClickHouseHealthData>({
    queryKey: ["/api/platform/health/clickhouse"],
    refetchInterval: 30000,
  });

  const status = data?.status ?? "unreachable";
  const isNotEnabled = status === "not_enabled";
  const isConnected = status === "connected";

  const accent = isNotEnabled
    ? "text-muted-foreground"
    : isConnected
      ? "text-emerald-500"
      : "text-red-500";

  const dotStatus = isNotEnabled ? "not_configured" : isConnected ? "connected" : "unreachable";
  const badgeStatus = isNotEnabled ? "not_configured" : status;

  return (
    <Card className="border-border/40 bg-card/60" data-testid="clickhouse-health-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className={`w-4 h-4 ${accent}`} />
            <CardTitle className="text-sm font-semibold">ClickHouse OLAP</CardTitle>
            <HealthDot status={dotStatus} />
            <StatusBadge status={badgeStatus} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "—"} • Auto-refresh 30s
            </span>
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2"
              onClick={() => refetch()} data-testid="button-refresh-clickhouse-health">
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : isNotEnabled ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 text-[12px] text-muted-foreground" data-testid="clickhouse-not-enabled">
            <Boxes className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground mb-0.5">Not enabled</p>
              <p>{data?.message ?? "ClickHouse is not configured. Set CLICKHOUSE_URL and CLICKHOUSE_PASSWORD to enable the OLAP analytics tier."}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Connection</p>
                <p className={`text-xl font-bold ${isConnected ? "text-emerald-400" : "text-red-400"}`} data-testid="stat-clickhouse-status">
                  {isConnected ? "Connected" : "Unreachable"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {typeof data?.latencyMs === "number" ? `${data.latencyMs}ms ping` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Version</p>
                <p className="text-xl font-bold text-foreground font-mono" data-testid="stat-clickhouse-version">
                  {data?.version ?? "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">SELECT version()</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Active Queries</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-clickhouse-active-queries">
                  {data?.activeQueries ?? "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">system.processes</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Insert Rate</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-clickhouse-insert-rate">
                  {data?.recentInsertRatePerSec != null ? `${data.recentInsertRatePerSec}/s` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data?.recentInsertCount != null && data?.insertRateWindowSeconds
                    ? `${data.recentInsertCount.toLocaleString()} rows / last ${data.insertRateWindowSeconds}s`
                    : "no recent inserts"}
                </p>
              </div>
            </div>
            {!isConnected && data?.error && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-[11px] text-red-400" data-testid="clickhouse-error">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="break-all">{data.error}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ClickHouse Fast-Path Failure Stats (Task #187) ───────────────────────────
// Per-tenant rolling counters of CH success vs failure. When the failure rate
// is sustained, the alerter fires and an entry shows up in the Ingestion
// Outage History panel below (reason='fast_path').

interface FastPathTenantRow {
  tenantId: number;
  windowMinutes: number;
  successes: number;
  failures: number;
  attempts: number;
  failureRate: number;
  failureRatePercent: number;
  breachesThreshold: boolean;
  recentFailures: Array<{ ts: string; op: string; error: string }>;
}

interface FastPathRecentOutage {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  tenantId: number | null;
  failureRatePercent: number | null;
  attempts: number | null;
  resolved: boolean;
}

interface FastPathStatsResponse {
  settings: {
    enabled: boolean;
    windowMinutes: number;
    minAttempts: number;
    failureRatePercent: number;
    intervalSeconds: number;
    cooldownMinutes: number;
  };
  windowMinutes: number;
  generatedAt: string;
  totals: {
    successes: number;
    failures: number;
    attempts: number;
    failureRatePercent: number;
  };
  tenants: FastPathTenantRow[];
  breachingCount: number;
  recentFastPathOutages: FastPathRecentOutage[];
}

function ClickHouseFastPathStatsCard() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<FastPathStatsResponse>({
    queryKey: ["/api/admin/platform-health/clickhouse-fast-path-stats"],
    refetchInterval: 30000,
  });

  const settings = data?.settings;
  const tenants = data?.tenants ?? [];
  const totals = data?.totals;
  const recent = data?.recentFastPathOutages ?? [];

  return (
    <Card className="border-border/40 bg-card/60" data-testid="clickhouse-fast-path-stats-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-sm font-semibold">
              ClickHouse Fast-Path (PostgreSQL Fallback)
            </CardTitle>
            {settings && (
              <Badge variant="outline" className="text-[10px]" data-testid="badge-fast-path-window">
                {settings.windowMinutes}m window
              </Badge>
            )}
            {settings && (
              <Badge
                variant="outline"
                className={`text-[10px] ${settings.enabled ? "" : "text-muted-foreground"}`}
                data-testid="badge-fast-path-enabled"
              >
                {settings.enabled ? "monitor on" : "monitor off"}
              </Badge>
            )}
            {totals && (
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  totals.failureRatePercent >= (settings?.failureRatePercent ?? 50)
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : totals.failureRatePercent > 0
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                }`}
                data-testid="badge-fast-path-overall-rate"
              >
                {totals.failureRatePercent}% fail · {totals.attempts} attempts
              </Badge>
            )}
            {data && data.breachingCount > 0 && (
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]"
                data-testid="badge-fast-path-breaching"
              >
                {data.breachingCount} tenant{data.breachingCount === 1 ? "" : "s"} breaching
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "—"} • Auto-refresh 30s
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={() => refetch()}
              data-testid="button-refresh-fast-path-stats"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex items-start gap-3 p-4 text-[12px] text-muted-foreground" data-testid="fast-path-empty">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            <div>
              <p className="font-medium text-foreground mb-0.5">No fast-path activity in window</p>
              <p>
                No tenant has run an event search through the ClickHouse fast path in the last
                {" "}
                {settings?.windowMinutes ?? 10} minutes. Counters appear here as soon as searches run.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Tenant</TableHead>
                <TableHead className="text-xs">Attempts</TableHead>
                <TableHead className="text-xs">Failures</TableHead>
                <TableHead className="text-xs">Failure rate</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Recent failure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => {
                const last = t.recentFailures[t.recentFailures.length - 1];
                return (
                  <TableRow key={t.tenantId} data-testid={`row-fast-path-${t.tenantId}`}>
                    <TableCell className="text-xs font-medium" data-testid={`text-fast-path-tenant-${t.tenantId}`}>
                      {t.tenantId}
                    </TableCell>
                    <TableCell className="text-xs">{t.attempts}</TableCell>
                    <TableCell className="text-xs">{t.failures}</TableCell>
                    <TableCell className="text-xs" data-testid={`text-fast-path-rate-${t.tenantId}`}>
                      {t.failureRatePercent}%
                    </TableCell>
                    <TableCell>
                      {t.breachesThreshold ? (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]" data-testid={`status-fast-path-${t.tenantId}`}>
                          breaching
                        </Badge>
                      ) : t.failures > 0 ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]" data-testid={`status-fast-path-${t.tenantId}`}>
                          degraded
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]" data-testid={`status-fast-path-${t.tenantId}`}>
                          healthy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground max-w-[280px] truncate" title={last ? `${last.op}: ${last.error}` : ""}>
                      {last ? `${last.op}: ${last.error}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {recent.length > 0 && (
          <div className="border-t border-border/40 p-3 text-[11px] text-muted-foreground flex items-start gap-2" data-testid="fast-path-recent-outages">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">
                {recent.length} fast-path outage{recent.length === 1 ? "" : "s"} in the last 24h
              </span>
              {" — "}see <span className="text-foreground">Ingestion Outage History</span> below
              {" "}for details (latest tenant {recent[0].tenantId} at{" "}
              {new Date(recent[0].startedAt).toLocaleTimeString()},{" "}
              {recent[0].failureRatePercent ?? 0}% over {recent[0].attempts ?? 0} attempts).
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ClickHouse Threat-Flow Backfill Status (Task #210) ───────────────────────

interface ThreatFlowBackfillRun {
  updated: number;
  groups: number;
  failedGroups: number;
  durationMs: number;
  finishedAt: string;
  error?: string;
}

interface ThreatFlowRemainingEstimate {
  remainingRows: number | null;
  estimatedAt: string;
  error?: string;
}

interface ThreatFlowBackfillStatus {
  complete: boolean;
  running: boolean;
  clickhouseAvailable: boolean;
  attempts: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastRun: ThreatFlowBackfillRun | null;
  cumulativeUpdated: number;
  cumulativeGroups: number;
  cumulativeFailedGroups: number;
  remaining?: ThreatFlowRemainingEstimate;
  recentThroughput?: {
    rowsPerMinute: number;
    sampleRuns: number;
    sampleDurationMs: number;
    sampleUpdated: number;
    samples?: number[];
  } | null;
  eta?: {
    etaSeconds: number;
    rowsPerMinute: number;
    basedOnRuns: number;
  } | null;
}

// Tiny inline SVG sparkline for the threat-flow throughput history (Task #226).
// Kept local to this file rather than promoted to a shared component because
// it is the only consumer; the data-source-badge sparkline has slightly
// different sizing/styling needs and reusing it here would force both to
// converge prematurely.
function ThroughputSparkline({
  samples,
  width = 80,
  height = 18,
  className,
}: {
  samples: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!samples || samples.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        aria-hidden="true"
        className={className ?? "text-muted-foreground"}
        data-testid="sparkline-threat-flow-throughput-empty"
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.5}
        />
      </svg>
    );
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const stepX = width / (samples.length - 1);
  const points = samples
    .map((v, i) => {
      const x = i * stepX;
      const y = height - 1 - ((v - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (samples.length - 1) * stepX;
  const lastY =
    height - 1 - ((samples[samples.length - 1] - min) / range) * (height - 2);
  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      className={className ?? "text-purple-500"}
      data-testid="sparkline-threat-flow-throughput"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.75} fill="currentColor" />
    </svg>
  );
}

function formatEtaSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `<1 min`;
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `~${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `~${d}d ${remH}h` : `~${d}d`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ThreatFlowBackfillCard() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<ThreatFlowBackfillStatus>({
    queryKey: ["/api/admin/platform-health/threat-flow-backfill"],
    refetchInterval: 30000,
  });

  const status: "complete" | "running" | "pending" | "unavailable" = !data
    ? "pending"
    : !data.clickhouseAvailable
      ? "unavailable"
      : data.complete
        ? "complete"
        : data.running
          ? "running"
          : "pending";

  const statusBadge =
    status === "complete" ? (
      <Badge
        variant="outline"
        className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]"
        data-testid="badge-threat-flow-backfill-status"
      >
        complete
      </Badge>
    ) : status === "running" ? (
      <Badge
        variant="outline"
        className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]"
        data-testid="badge-threat-flow-backfill-status"
      >
        running
      </Badge>
    ) : status === "unavailable" ? (
      <Badge
        variant="outline"
        className="text-muted-foreground text-[10px]"
        data-testid="badge-threat-flow-backfill-status"
      >
        ClickHouse unavailable
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]"
        data-testid="badge-threat-flow-backfill-status"
      >
        pending — retrying every 5 min
      </Badge>
    );

  return (
    <Card className="border-border/40 bg-card/60" data-testid="threat-flow-backfill-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <History className="w-4 h-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold">
              Threat-Flow Historical Backfill
            </CardTitle>
            {statusBadge}
            {data && data.cumulativeFailedGroups > 0 && (
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]"
                data-testid="badge-threat-flow-backfill-failed-groups"
              >
                {data.cumulativeFailedGroups} failed group{data.cumulativeFailedGroups === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "—"} • Auto-refresh 30s
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={() => refetch()}
              data-testid="button-refresh-threat-flow-backfill"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">No status available.</p>
        ) : (
          <div className="space-y-3 text-[12px]">
            <p className="text-muted-foreground leading-relaxed">
              One-shot migration that backfills <span className="font-mono text-foreground">threat / action / recipient / description</span>
              {" "}on older ClickHouse <span className="font-mono text-foreground">security_events</span> rows
              so the dashboard threat-flow Sankey shows full historical detail. Re-tries every
              5 minutes until the marker row in <span className="font-mono text-foreground">ccc._migrations</span>
              {" "}is written.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div data-testid="stat-threat-flow-cumulative-updated">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rows mirrored</div>
                <div className="text-sm font-semibold text-foreground">
                  {data.cumulativeUpdated.toLocaleString()}
                </div>
              </div>
              <div data-testid="stat-threat-flow-remaining" title={data.remaining?.error ?? data.remaining?.estimatedAt ?? ""}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rows remaining (CH)</div>
                <div className="text-sm font-semibold text-foreground">
                  {data.complete
                    ? "0"
                    : data.remaining?.remainingRows == null
                      ? "—"
                      : `~${data.remaining.remainingRows.toLocaleString()}`}
                </div>
              </div>
              <div data-testid="stat-threat-flow-cumulative-groups">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mutation groups</div>
                <div className="text-sm font-semibold text-foreground">
                  {data.cumulativeGroups.toLocaleString()}
                </div>
              </div>
              <div data-testid="stat-threat-flow-attempts" title="Counters reset on restart and are scoped to this server worker">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Attempts (this worker)</div>
                <div className="text-sm font-semibold text-foreground">{data.attempts}</div>
              </div>
              <div data-testid="stat-threat-flow-last-attempt">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last attempt</div>
                <div
                  className="text-sm font-semibold text-foreground"
                  title={data.lastAttemptAt ?? ""}
                >
                  {formatRelativeTime(data.lastAttemptAt)}
                </div>
              </div>
            </div>
            {(() => {
              // Render a progress bar only while the marker is still pending.
              // Use mirrored / (mirrored + remaining) — the only inputs the
              // server can give us cheaply. When `complete` we already render
              // the green completion banner below, so a 100% bar would be
              // redundant. When CH is offline we omit the bar rather than
              // show a misleading 0%.
              if (data.complete) return null;
              const remaining = data.remaining?.remainingRows;
              if (remaining == null) {
                return (
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid="text-threat-flow-progress-unavailable"
                    >
                      Remaining-rows estimate unavailable
                      {data.remaining?.error ? ` (${data.remaining.error})` : ""}.
                    </p>
                    {data.recentThroughput?.samples && data.recentThroughput.samples.length >= 1 && (
                      <span
                        className="inline-flex items-center shrink-0"
                        title={`Per-run throughput (oldest → newest): ${data.recentThroughput.samples
                          .map((v) => `${Math.round(v).toLocaleString()} r/min`)
                          .join(" → ")}`}
                        aria-label="Recent throughput sparkline"
                      >
                        <ThroughputSparkline samples={data.recentThroughput.samples} />
                      </span>
                    )}
                  </div>
                );
              }
              const mirrored = data.cumulativeUpdated;
              const denom = mirrored + remaining;
              const pct = denom > 0 ? Math.min(100, Math.max(0, (mirrored / denom) * 100)) : 0;
              return (
                <div className="space-y-1" data-testid="threat-flow-progress">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Backfill progress —{" "}
                      <span
                        className="text-foreground font-medium"
                        data-testid="text-threat-flow-progress-pct"
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </span>
                    <span title={data.remaining?.estimatedAt ?? ""}>
                      ~{remaining.toLocaleString()} row{remaining === 1 ? "" : "s"} still empty
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  {data.eta ? (
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="text-threat-flow-eta"
                        title={`Based on ${data.eta.basedOnRuns} recent productive run${data.eta.basedOnRuns === 1 ? "" : "s"} • ${Math.round(data.eta.rowsPerMinute).toLocaleString()} rows/min`}
                      >
                        ETA{" "}
                        <span
                          className="text-foreground font-medium"
                          data-testid="text-threat-flow-eta-value"
                        >
                          {formatEtaSeconds(data.eta.etaSeconds)} remaining
                        </span>{" "}
                        at current rate (~{Math.round(data.eta.rowsPerMinute).toLocaleString()} rows/min,
                        based on {data.eta.basedOnRuns} recent run{data.eta.basedOnRuns === 1 ? "" : "s"}).
                      </p>
                      {data.recentThroughput?.samples && data.recentThroughput.samples.length >= 1 && (
                        <span
                          className="inline-flex items-center shrink-0"
                          title={`Per-run throughput (oldest → newest): ${data.recentThroughput.samples
                            .map((v) => `${Math.round(v).toLocaleString()} r/min`)
                            .join(" → ")}`}
                          aria-label="Recent throughput sparkline"
                        >
                          <ThroughputSparkline samples={data.recentThroughput.samples} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="text-threat-flow-eta-unavailable"
                      >
                        ETA unavailable — waiting for a productive run on this worker to measure
                        throughput.
                      </p>
                      {data.recentThroughput?.samples && data.recentThroughput.samples.length >= 1 && (
                        <span
                          className="inline-flex items-center shrink-0"
                          title={`Per-run throughput (oldest → newest): ${data.recentThroughput.samples
                            .map((v) => `${Math.round(v).toLocaleString()} r/min`)
                            .join(" → ")}`}
                          aria-label="Recent throughput sparkline"
                        >
                          <ThroughputSparkline samples={data.recentThroughput.samples} />
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Estimate counts CH <span className="font-mono">security_events</span> rows where
                    threat / action / recipient / description are all empty. Mirrored counter only
                    reflects this worker's runs, so the true percentage may be higher right after a
                    restart.
                  </p>
                </div>
              );
            })()}
            {data.lastRun && (
              <div
                className="rounded-md border border-border/40 bg-background/40 p-3 text-[11px] flex items-start gap-2"
                data-testid="threat-flow-last-run"
              >
                {data.lastRun.error ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                )}
                <div className="text-muted-foreground">
                  <span className="text-foreground font-medium">Last run:</span>{" "}
                  {data.lastRun.updated.toLocaleString()} row{data.lastRun.updated === 1 ? "" : "s"} /{" "}
                  {data.lastRun.groups.toLocaleString()} group{data.lastRun.groups === 1 ? "" : "s"}
                  {data.lastRun.failedGroups > 0 && (
                    <>, <span className="text-red-500">{data.lastRun.failedGroups} failed</span></>
                  )}
                  {" "}in {(data.lastRun.durationMs / 1000).toFixed(1)}s — finished{" "}
                  <span title={data.lastRun.finishedAt}>{formatRelativeTime(data.lastRun.finishedAt)}</span>
                  {data.lastRun.error && (
                    <div
                      className="mt-1 text-amber-600 dark:text-amber-400 font-mono break-all"
                      data-testid="text-threat-flow-last-error"
                    >
                      {data.lastRun.error}
                    </div>
                  )}
                </div>
              </div>
            )}
            {data.complete && data.lastSuccessAt && (
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="text-threat-flow-completed-at"
              >
                Completion marker observed{" "}
                <span title={data.lastSuccessAt}>{formatRelativeTime(data.lastSuccessAt)}</span>.
                Older rows now carry full threat-flow detail.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ClickHouse Ingest Outage History (Task #183) ─────────────────────────────

interface IngestOutage {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  thresholdMinutes: number;
  sampleWindowSeconds: number;
  notificationsDispatched: number;
  resolved: boolean;
  reason?: "stalled_ingest" | "fast_path" | string;
  tenantId?: number | null;
  failureRatePercent?: number | null;
  attempts?: number | null;
}

interface IngestOutageDailyPoint {
  day: string;
  count: number;
  totalDurationSeconds: number;
}

interface IngestOutageHistory {
  outages: IngestOutage[];
  stats: {
    last24h: { count: number; totalDurationSeconds: number };
    weekly?: {
      currentCount: number;
      previousCount: number;
      currentDurationSeconds: number;
      previousDurationSeconds: number;
    };
  };
  dailySeries?: IngestOutageDailyPoint[];
  rangeDays?: number;
}

function formatDurationSeconds(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function ClickHouseIngestOutageHistory() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<IngestOutageHistory>({
    queryKey: ["/api/admin/platform-health/clickhouse-ingest-outages"],
    refetchInterval: 60000,
  });

  const outages = data?.outages ?? [];
  const last24h = data?.stats?.last24h;
  const weekly = data?.stats?.weekly;
  const dailySeries = data?.dailySeries ?? [];
  const rangeDays = data?.rangeDays ?? 30;

  const chartData = dailySeries.map((p) => ({
    day: p.day,
    label: new Date(p.day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    count: p.count,
    downtimeMinutes: Math.round(p.totalDurationSeconds / 60),
  }));
  const totalRangeOutages = chartData.reduce((s, p) => s + p.count, 0);
  const totalRangeDowntimeSec = dailySeries.reduce((s, p) => s + p.totalDurationSeconds, 0);

  const wowCountDelta = weekly ? weekly.currentCount - weekly.previousCount : 0;
  const wowDurationDelta = weekly ? weekly.currentDurationSeconds - weekly.previousDurationSeconds : 0;
  const wowImproving = wowCountDelta < 0 || (wowCountDelta === 0 && wowDurationDelta < 0);
  const wowFlat = wowCountDelta === 0 && wowDurationDelta === 0;
  const trendColorClass = wowFlat
    ? "text-muted-foreground"
    : wowImproving
      ? "text-emerald-500"
      : "text-amber-500";
  const trendLabel = wowFlat ? "no change" : wowImproving ? "improving" : "worsening";

  return (
    <Card className="border-border/40 bg-card/60" data-testid="clickhouse-ingest-outage-history">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-sm font-semibold">Ingestion Outage History</CardTitle>
            {last24h && (
              <Badge variant="outline" className="text-[10px]" data-testid="badge-outage-24h-count">
                {last24h.count} in 24h
              </Badge>
            )}
            {last24h && last24h.totalDurationSeconds > 0 && (
              <Badge variant="outline" className="text-[10px]" data-testid="badge-outage-24h-duration">
                {formatDurationSeconds(last24h.totalDurationSeconds)} downtime
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "—"} • Auto-refresh 60s
            </span>
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2"
              onClick={() => refetch()} data-testid="button-refresh-outage-history">
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : (
          <>
            <div className="px-4 pt-3 pb-4 border-b border-border/40" data-testid="outage-trend-section">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="rounded-md border border-border/30 bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last {rangeDays} days</p>
                  <p className="text-lg font-bold leading-tight" data-testid="stat-outages-range-count">
                    {totalRangeOutages}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDurationSeconds(totalRangeDowntimeSec)} total downtime
                  </p>
                </div>
                <div className="rounded-md border border-border/30 bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">This week</p>
                  <p className="text-lg font-bold leading-tight" data-testid="stat-outages-week-count">
                    {weekly?.currentCount ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDurationSeconds(weekly?.currentDurationSeconds ?? 0)} downtime
                  </p>
                </div>
                <div className="rounded-md border border-border/30 bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Week-over-week</p>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp
                      className={`w-4 h-4 ${trendColorClass} ${wowImproving ? "rotate-180" : ""}`}
                    />
                    <p className={`text-lg font-bold leading-tight ${trendColorClass}`} data-testid="stat-outages-wow-trend">
                      {wowCountDelta > 0 ? "+" : ""}{wowCountDelta}
                    </p>
                    <span className={`text-[11px] font-medium ${trendColorClass}`} data-testid="text-outages-wow-label">
                      {trendLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    vs prev week ({weekly?.previousCount ?? 0} outages, {formatDurationSeconds(weekly?.previousDurationSeconds ?? 0)})
                  </p>
                </div>
              </div>
              <div className="h-32 w-full" data-testid="chart-outage-trend">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                      formatter={(value: number | string, name: string) => {
                        if (name === "Downtime (min)") return [`${value} min`, name];
                        return [value, name];
                      }}
                    />
                    <Bar yAxisId="left" dataKey="count" name="Outages" fill="hsl(var(--chart-1, 217 91% 60%))" radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="right" dataKey="downtimeMinutes" name="Downtime (min)" fill="hsl(var(--chart-4, 38 92% 50%))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {outages.length === 0 ? (
              <div className="flex items-start gap-3 p-4 text-[12px] text-muted-foreground" data-testid="outage-history-empty">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                <div>
                  <p className="font-medium text-foreground mb-0.5">No ingestion outages recorded</p>
                  <p>The ClickHouse stalled-ingest monitor has not raised any alerts. Past outages will appear here.</p>
                </div>
              </div>
            ) : (
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Started</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Threshold</TableHead>
                <TableHead className="text-xs">Notifications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outages.map((o) => {
                const ongoingSec = !o.resolved
                  ? Math.max(0, Math.round((Date.now() - new Date(o.startedAt).getTime()) / 1000))
                  : null;
                return (
                  <TableRow key={o.id} data-testid={`row-outage-${o.id}`}>
                    <TableCell className="text-xs">
                      <div className="font-medium" data-testid={`text-outage-started-${o.id}`}>
                        {new Date(o.startedAt).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatTimeAgo(o.startedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`text-outage-reason-${o.id}`}>
                      {o.reason === "fast_path" ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] w-fit">
                            fast-path → PG
                          </Badge>
                          {o.tenantId != null && (
                            <span className="text-[10px] text-muted-foreground">
                              tenant {o.tenantId}
                              {o.failureRatePercent != null ? ` · ${o.failureRatePercent}% fail` : ""}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-foreground/80 text-[10px]">
                          stalled ingest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`text-outage-duration-${o.id}`}>
                      {o.resolved
                        ? formatDurationSeconds(o.durationSeconds)
                        : <span className="text-amber-500">{formatDurationSeconds(ongoingSec)} (ongoing)</span>}
                    </TableCell>
                    <TableCell>
                      {o.resolved ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]" data-testid={`status-outage-${o.id}`}>
                          resolved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]" data-testid={`status-outage-${o.id}`}>
                          ongoing
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.thresholdMinutes}m / {o.sampleWindowSeconds}s window
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" data-testid={`text-outage-notifications-${o.id}`}>
                      {o.notificationsDispatched}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quota Engine & Read Replica Panel (Task #123) ─────────────────────────────

interface TenantQuotaStatus {
  tenantId: number;
  tenantName: string;
  tier: string;
  apiLimit: number;
  eventsLimit: number;
  storageGb: number;
  currentApiRate: number;
  currentEventsRate: number;
  apiThrottledCount: number;
  eventsThrottledCount: number;
  lastThrottledAt: string | null;
  isActive: boolean;
}

interface ReplicaLag {
  primary: string;
  replica: string | null;
  lagBytes: number | null;
  lagSeconds: number | null;
  replicaAvailable: boolean;
}

const TIER_COLORS: Record<string, string> = {
  standard: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  professional: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function QuotaEnginePanel() {
  const { toast } = useToast();
  const [editTenantId, setEditTenantId] = useState<number | null>(null);
  const [editTier, setEditTier] = useState<string>("standard");

  const { data: quotas, isLoading, refetch } = useQuery<TenantQuotaStatus[]>({
    queryKey: ["/api/admin/tenant-quotas"],
    refetchInterval: 30000,
  });

  const { data: replicaLag } = useQuery<ReplicaLag>({
    queryKey: ["/api/admin/replica-lag"],
    refetchInterval: 15000,
  });

  const updateQuotaMutation = useMutation({
    mutationFn: async ({ tenantId, tier }: { tenantId: number; tier: string }) => {
      const res = await apiRequest("PUT", `/api/admin/tenant-quotas/${tenantId}`, { tier });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quota tier updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenant-quotas"] });
      setEditTenantId(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const tierSummary = (quotas || []).reduce((acc, q) => {
    acc[q.tier] = (acc[q.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalThrottled = (quotas || []).reduce((sum, q) => sum + q.apiThrottledCount + q.eventsThrottledCount, 0);

  return (
    <Card className="border-border/40 bg-card/60" data-testid="quota-engine-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-violet-400" />
            <CardTitle className="text-sm font-semibold">Quota Engine & Read Replica</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {replicaLag && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <GitMerge className="w-3.5 h-3.5 text-muted-foreground" />
                {replicaLag.replicaAvailable ? (
                  <span className="text-emerald-400 font-medium">
                    Replica: {replicaLag.lagSeconds != null ? `${replicaLag.lagSeconds.toFixed(1)}s lag` : "Connected"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Replica: Not configured</span>
                )}
              </div>
            )}
            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => refetch()} data-testid="button-refresh-quotas">
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Configured Tenants</p>
            <p className="text-xl font-bold" data-testid="stat-quota-tenants">{(quotas || []).length}</p>
            <p className="text-[10px] text-muted-foreground">with quota rules</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total Throttle Events</p>
            <p className={`text-xl font-bold ${totalThrottled > 0 ? "text-amber-400" : "text-emerald-400"}`} data-testid="stat-throttle-events">
              {totalThrottled}
            </p>
            <p className="text-[10px] text-muted-foreground">API + event throttles</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Replica Status</p>
            <p className={`text-xl font-bold ${replicaLag?.replicaAvailable ? "text-emerald-400" : "text-muted-foreground"}`} data-testid="stat-replica-status">
              {replicaLag?.replicaAvailable ? "Active" : "Fallback"}
            </p>
            <p className="text-[10px] text-muted-foreground">{replicaLag?.replicaAvailable ? "reads on replica" : "reads on primary"}</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Tier Distribution</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {["standard", "professional", "enterprise"].map(t => tierSummary[t] ? (
                <Badge key={t} variant="outline" className={`text-[9px] px-1.5 py-0 ${TIER_COLORS[t]}`}>
                  {t.slice(0, 3).toUpperCase()} ×{tierSummary[t]}
                </Badge>
              ) : null)}
              {Object.keys(tierSummary).length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : !quotas || quotas.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No tenant quotas configured yet.</p>
            <p className="text-[11px] mt-1">Quotas will appear here once tenants are assigned quota tiers.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px] uppercase tracking-wide border-border/30">
                <TableHead className="h-7">Tenant</TableHead>
                <TableHead className="h-7">Tier</TableHead>
                <TableHead className="h-7">API Utilization (60s)</TableHead>
                <TableHead className="h-7">Events Utilization (60s)</TableHead>
                <TableHead className="h-7 text-right">Storage GB</TableHead>
                <TableHead className="h-7 text-right">API Throttles</TableHead>
                <TableHead className="h-7 text-right">Last Throttle</TableHead>
                <TableHead className="h-7 text-center">Status</TableHead>
                <TableHead className="h-7 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(quotas || []).map(q => {
                // Compute utilization percentages for green/yellow/red status
                const apiPct = q.apiLimit >= 999999 ? 0 : Math.min(100, Math.round((q.currentApiRate / q.apiLimit) * 100));
                const evtPct = q.eventsLimit >= 999999 ? 0 : Math.min(100, Math.round((q.currentEventsRate / q.eventsLimit) * 100));
                const getUtilColor = (pct: number) =>
                  pct >= 90 ? "text-red-400 bg-red-500/10 border-red-500/30" :
                  pct >= 60 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                              "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
                const getBarColor = (pct: number) =>
                  pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
                return (
                <TableRow key={q.tenantId} className="border-border/20 text-[11px]" data-testid={`row-quota-${q.tenantId}`}>
                  <TableCell className="py-2 font-medium">{q.tenantName}</TableCell>
                  <TableCell className="py-2">
                    {editTenantId === q.tenantId ? (
                      <div className="flex items-center gap-1.5">
                        <Select value={editTier} onValueChange={setEditTier}>
                          <SelectTrigger className="h-6 text-[10px] w-28" data-testid={`select-tier-${q.tenantId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-6 px-2 text-[10px]"
                          onClick={() => updateQuotaMutation.mutate({ tenantId: q.tenantId, tier: editTier })}
                          disabled={updateQuotaMutation.isPending}
                          data-testid={`button-save-tier-${q.tenantId}`}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                          onClick={() => setEditTenantId(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${TIER_COLORS[q.tier] || ""}`}>
                        {q.tier}
                      </Badge>
                    )}
                  </TableCell>
                  {/* API Utilization with bar */}
                  <TableCell className="py-2 min-w-[140px]">
                    {q.apiLimit >= 999999 ? (
                      <span className="text-[10px] text-muted-foreground">∞ (unlimited)</span>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] px-1 rounded border font-medium ${getUtilColor(apiPct)}`} data-testid={`api-util-${q.tenantId}`}>
                            {apiPct}%
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {q.currentApiRate}/{q.apiLimit}/s
                          </span>
                        </div>
                        <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${getBarColor(apiPct)}`} style={{ width: `${apiPct}%` }} />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  {/* Events Utilization with bar */}
                  <TableCell className="py-2 min-w-[140px]">
                    {q.eventsLimit >= 999999 ? (
                      <span className="text-[10px] text-muted-foreground">∞ (unlimited)</span>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] px-1 rounded border font-medium ${getUtilColor(evtPct)}`} data-testid={`evt-util-${q.tenantId}`}>
                            {evtPct}%
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {q.currentEventsRate}/{q.eventsLimit}/s
                          </span>
                        </div>
                        <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${getBarColor(evtPct)}`} style={{ width: `${evtPct}%` }} />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-muted-foreground">
                    {q.storageGb >= 999999 ? "∞" : q.storageGb}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    {q.apiThrottledCount > 0 ? (
                      <span className="text-amber-400 font-medium">{q.apiThrottledCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right text-muted-foreground">
                    {q.lastThrottledAt ? new Date(q.lastThrottledAt).toLocaleTimeString() : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge variant="outline" className={q.isActive
                      ? "text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "text-[9px] px-1.5 py-0 bg-muted text-muted-foreground"}>
                      {q.isActive ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                      onClick={() => { setEditTenantId(q.tenantId); setEditTier(q.tier); }}
                      data-testid={`button-edit-quota-${q.tenantId}`}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/20 text-[11px] text-muted-foreground">
          <Database className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
          <div>
            <span className="font-medium text-foreground">Read Replica Routing: </span>
            {replicaLag?.replicaAvailable
              ? `Analytics queries (SOC metrics, domain stats) route to the read replica. Primary pool handles all writes.${replicaLag.lagSeconds != null ? ` Current replication lag: ${replicaLag.lagSeconds.toFixed(2)}s.` : ""}`
              : "READ_REPLICA_URL not set — all reads use the primary pool. Set READ_REPLICA_URL to enable replica routing."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FederatedIntelPanel() {
  interface FederatedStats {
    totalSharedIOCs: number; activeSharedIOCs: number; totalMatchCount: number;
    avgContributors: number; totalAlerts: number; unreadAlerts: number;
    propagationLatencyMs: number | null; crossTenantMatchRate: number;
    tenantParticipationCount: number;
    topIOCs: Array<{ ioc_value: string; ioc_type: string; contributor_count: number; match_count: number }>;
  }

  const { data, isLoading } = useQuery<FederatedStats>({
    queryKey: ["/api/shared-intel/stats"],
    refetchInterval: 30000,
  });

  return (
    <Card className="border-border/40 bg-card/60" data-testid="federated-intel-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-sm font-semibold">Federated Threat Intelligence</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Active Shared IOCs</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-active-shared-iocs">{data.activeSharedIOCs}</p>
                <p className="text-[10px] text-muted-foreground">{data.totalSharedIOCs} total</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cross-Tenant Match Rate</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-cross-tenant-match-rate">{data.crossTenantMatchRate}%</p>
                <p className="text-[10px] text-muted-foreground">{data.totalMatchCount} total matches</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Propagation Latency</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-propagation-latency">
                  {data.propagationLatencyMs != null ? `${(data.propagationLatencyMs / 1000).toFixed(1)}s` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">avg nomination → propagation</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Participating Tenants</p>
                <p className="text-xl font-bold text-foreground" data-testid="stat-participating-tenants">{data.tenantParticipationCount}</p>
                <p className="text-[10px] text-muted-foreground">{data.avgContributors.toFixed(1)} avg contributors/IOC</p>
              </div>
            </div>
            {data.topIOCs?.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2 font-medium">Top Matched IOCs</p>
                <div className="space-y-1">
                  {data.topIOCs.slice(0, 5).map((ioc, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
                      <span className="font-mono text-foreground/80 truncate max-w-[200px]">{ioc.ioc_value}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">{ioc.ioc_type}</Badge>
                        <span className="text-muted-foreground">{ioc.contributor_count} contributors</span>
                        <span className="text-cyan-400 font-medium">{ioc.match_count} matches</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No federated intelligence data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── ClickHouse Stalled-Ingest Monitor Settings (Task #182) ────────────────────

interface IngestMonitorSettings {
  enabled: boolean;
  thresholdMinutes: number;
  sampleWindowSeconds: number;
  intervalSeconds: number;
}

interface IngestMonitorAuditEntry {
  id: number;
  prevValue: IngestMonitorSettings | null;
  newValue: IngestMonitorSettings;
  changedBy: string | null;
  changedAt: string;
}

function formatAuditTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function diffSettings(
  prev: IngestMonitorSettings | null,
  next: IngestMonitorSettings,
): Array<{ label: string; from: string; to: string }> {
  const fields: Array<{ key: keyof IngestMonitorSettings; label: string; suffix: string }> = [
    { key: "enabled", label: "Monitor", suffix: "" },
    { key: "thresholdMinutes", label: "Threshold", suffix: " min" },
    { key: "sampleWindowSeconds", label: "Sample window", suffix: "s" },
    { key: "intervalSeconds", label: "Check interval", suffix: "s" },
  ];
  const out: Array<{ label: string; from: string; to: string }> = [];
  for (const f of fields) {
    const nextVal = next[f.key];
    const prevVal = prev ? prev[f.key] : undefined;
    const fmt = (v: any) =>
      f.key === "enabled" ? (v ? "on" : "off") : `${v}${f.suffix}`;
    if (prev === null) {
      out.push({ label: f.label, from: "—", to: fmt(nextVal) });
    } else if (prevVal !== nextVal) {
      out.push({ label: f.label, from: fmt(prevVal), to: fmt(nextVal) });
    }
  }
  return out;
}

function ClickHouseIngestMonitorSettingsCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{
    settings: IngestMonitorSettings;
    recentChanges?: IngestMonitorAuditEntry[];
  }>({
    queryKey: ["/api/admin/platform/clickhouse-ingest-monitor"],
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  const [draft, setDraft] = useState<IngestMonitorSettings | null>(null);

  const current = data?.settings ?? null;
  const value = draft ?? current;

  const mutation = useMutation({
    mutationFn: async (next: IngestMonitorSettings) => {
      const res = await apiRequest("PATCH", "/api/admin/platform/clickhouse-ingest-monitor", next);
      return res.json() as Promise<{ settings: IngestMonitorSettings }>;
    },
    onSuccess: () => {
      // Refetch so the new value AND the freshly-written audit row are loaded.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/clickhouse-ingest-monitor"] });
      setDraft(null);
      toast({ title: "Settings saved", description: "Stalled-ingest monitor updated. Changes apply immediately." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const dirty = !!(draft && current && (
    draft.enabled !== current.enabled ||
    draft.thresholdMinutes !== current.thresholdMinutes ||
    draft.sampleWindowSeconds !== current.sampleWindowSeconds ||
    draft.intervalSeconds !== current.intervalSeconds
  ));

  const valid = !!value && (
    Number.isInteger(value.thresholdMinutes) && value.thresholdMinutes >= 1 && value.thresholdMinutes <= 1440 &&
    Number.isInteger(value.sampleWindowSeconds) && value.sampleWindowSeconds >= 30 && value.sampleWindowSeconds <= 3600 &&
    Number.isInteger(value.intervalSeconds) && value.intervalSeconds >= 30 && value.intervalSeconds <= 3600
  );

  function update(patch: Partial<IngestMonitorSettings>) {
    if (!value) return;
    setDraft({ ...value, ...patch });
  }

  return (
    <Card className="border-border/40 bg-card/60" data-testid="ingest-monitor-settings-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-500" />
          ClickHouse Stalled-Ingest Alert
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Tune the background monitor that emails platform admins when ClickHouse insert rate stays at zero.
          Changes take effect on the next check — no restart required.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading || !value ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
              <div>
                <Label htmlFor="ingest-monitor-enabled" className="text-sm font-medium">Monitor enabled</Label>
                <p className="text-[11px] text-muted-foreground">Disable to suppress all stalled-ingest alerts.</p>
              </div>
              <Switch
                id="ingest-monitor-enabled"
                checked={value.enabled}
                onCheckedChange={(v) => update({ enabled: v })}
                data-testid="switch-monitor-enabled"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="threshold-minutes" className="text-xs font-medium">Alert threshold (minutes)</Label>
                <Input
                  id="threshold-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={value.thresholdMinutes}
                  onChange={(e) => update({ thresholdMinutes: parseInt(e.target.value, 10) || 0 })}
                  data-testid="input-threshold-minutes"
                />
                <p className="text-[10px] text-muted-foreground">Fire alert after rate has been 0 for this many minutes (1–1440).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sample-window" className="text-xs font-medium">Sample window (seconds)</Label>
                <Input
                  id="sample-window"
                  type="number"
                  min={30}
                  max={3600}
                  value={value.sampleWindowSeconds}
                  onChange={(e) => update({ sampleWindowSeconds: parseInt(e.target.value, 10) || 0 })}
                  data-testid="input-sample-window"
                />
                <p className="text-[10px] text-muted-foreground">Window used to measure recent insert rate (30–3600).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="interval-seconds" className="text-xs font-medium">Check interval (seconds)</Label>
                <Input
                  id="interval-seconds"
                  type="number"
                  min={30}
                  max={3600}
                  value={value.intervalSeconds}
                  onChange={(e) => update({ intervalSeconds: parseInt(e.target.value, 10) || 0 })}
                  data-testid="input-interval-seconds"
                />
                <p className="text-[10px] text-muted-foreground">How often the monitor evaluates rate (30–3600).</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {dirty && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft(null)}
                  disabled={mutation.isPending}
                  data-testid="button-cancel-monitor-settings"
                >
                  Cancel
                </Button>
              )}
              {dirty && !valid && (
                <span className="text-[11px] text-red-500" data-testid="text-monitor-settings-invalid">
                  Values out of range — check the limits below each field.
                </span>
              )}
              <Button
                size="sm"
                onClick={() => draft && valid && mutation.mutate(draft)}
                disabled={!dirty || !valid || mutation.isPending}
                data-testid="button-save-monitor-settings"
              >
                {mutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>

            <div className="pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-monitor-history"
              >
                {historyOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <History className="w-3.5 h-3.5" />
                Recent changes
                {data?.recentChanges && data.recentChanges.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/80">
                    ({data.recentChanges.length})
                  </span>
                )}
              </button>

              {historyOpen && (
                <div className="mt-2" data-testid="container-monitor-history">
                  {!data?.recentChanges || data.recentChanges.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic" data-testid="text-monitor-history-empty">
                      No changes recorded yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.recentChanges.map((entry) => {
                        const diffs = diffSettings(entry.prevValue, entry.newValue);
                        return (
                          <li
                            key={entry.id}
                            className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px]"
                            data-testid={`row-monitor-history-${entry.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-muted-foreground" data-testid={`text-history-when-${entry.id}`}>
                                {formatAuditTimestamp(entry.changedAt)}
                              </span>
                              <span className="font-medium text-foreground/90" data-testid={`text-history-who-${entry.id}`}>
                                {entry.changedBy || "unknown"}
                              </span>
                            </div>
                            {diffs.length === 0 ? (
                              <span className="text-muted-foreground italic">No field changes recorded.</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {diffs.map((d, i) => (
                                  <li key={i} className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-muted-foreground">{d.label}:</span>
                                    <span className="line-through text-muted-foreground/70">{d.from}</span>
                                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground/60" />
                                    <span className="text-foreground font-medium">{d.to}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
