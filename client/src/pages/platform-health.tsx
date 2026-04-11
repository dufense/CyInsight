import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HeartPulse, Database, Server, Clock, MemoryStick, Cpu,
  Activity, Wifi, WifiOff, AlertTriangle, CheckCircle2, XCircle,
  ArrowUpDown, Gauge, Zap, RefreshCw, Cable, Building2,
  Radio, Shield, BarChart3, TrendingUp, Package, CircleDot,
  Globe, HardDrive, Archive, MapPin, ArrowLeftRight,
  Layers, GitMerge, Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    openSearchStatus: string;
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
                    <span className="text-[10px] text-muted-foreground">OpenSearch</span>
                  </div>
                  <div className="text-sm font-bold">
                    <StatusBadge status={region.health.openSearchStatus === "green" ? "healthy" : region.health.openSearchStatus === "yellow" ? "warning" : "disconnected"} />
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

      <QuotaEnginePanel />

      <FederatedIntelPanel />

      <DataPlaneHealthSection />
    </div>
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
