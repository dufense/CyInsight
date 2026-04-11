import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { IngestBatch, IngestApiKey, SecurityIntegration } from "@shared/schema";
import { PipelineHealthTab as PipelineHealthTabContent } from "@/components/pipeline-health";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import {
  Activity,
  Key,
  Plug,
  BarChart3,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Shield,
  Zap,
  ArrowUpRight,
  Eye,
  EyeOff,
  Search,
  Database,
  FileText,
  Server,
  Wifi,
  WifiOff,
  TrendingUp,
  BookOpen,
  ToggleLeft,
  ToggleRight,
  Target,
  Monitor,
  Mail,
  Globe,
  Lock,
  AppWindow,
  Users,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const C = {
  blue: "hsl(217, 91%, 55%)",
  green: "hsl(142, 76%, 45%)",
  purple: "hsl(269, 80%, 58%)",
  orange: "hsl(32, 95%, 52%)",
  red: "hsl(340, 82%, 52%)",
  teal: "hsl(180, 70%, 45%)",
  yellow: "hsl(45, 90%, 50%)",
};
const PALETTE = [C.blue, C.green, C.purple, C.orange, C.red, C.teal, C.yellow];
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

const BATCH_STATUS_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  queued: { color: "text-muted-foreground", icon: Clock, label: "Queued" },
  normalizing: { color: "text-blue-600 dark:text-blue-400", icon: Loader2, label: "Normalizing" },
  enriching: { color: "text-purple-600 dark:text-purple-400", icon: Loader2, label: "Enriching" },
  scoring: { color: "text-orange-600 dark:text-orange-400", icon: Loader2, label: "Scoring" },
  correlating: { color: "text-teal-600 dark:text-teal-400", icon: Loader2, label: "Correlating" },
  complete: { color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, label: "Complete" },
  failed: { color: "text-destructive", icon: XCircle, label: "Failed" },
};

function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function BatchStatusBadge({ status }: { status: string }) {
  const style = BATCH_STATUS_STYLES[status] || BATCH_STATUS_STYLES.queued;
  const Icon = style.icon;
  const isActive = ["normalizing", "enriching", "scoring", "correlating"].includes(status);
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${style.color}`} data-testid={`badge-status-${status}`}>
      <Icon className={`w-3 h-3 ${isActive ? "animate-spin" : ""}`} />
      {style.label}
    </Badge>
  );
}

function RiskGauge({ value, label, size = 100 }: { value: number; label: string; size?: number }) {
  const color = value >= 80 ? C.red : value >= 60 ? C.orange : value >= 40 ? C.yellow : C.green;
  const r = size / 2 - 8;
  const circumference = Math.PI * r;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={color} fontSize="18" fontWeight="700">
          {value}%
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

const TIME_RANGE_OPTIONS = [
  { key: "1h", label: "1 Hr", ms: 60 * 60 * 1000 },
  { key: "24h", label: "24 Hr", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7 Days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30 Days", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "90d", label: "90 Days", ms: 90 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", ms: 0 },
] as const;

function PipelineMonitorTab({ tenantId }: { tenantId: number }) {
  const fmt = useTenantDateFormatter();
  const [timeRange, setTimeRange] = useState<string>("24h");

  const { data: batches = [], isLoading } = useQuery<IngestBatch[]>({
    queryKey: ["/api/ingest-batches", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ingest-batches/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch batches");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: !!tenantId,
  });

  const filteredBatches = batches.filter((b) => {
    if (timeRange === "all") return true;
    const rangeOpt = TIME_RANGE_OPTIONS.find((r) => r.key === timeRange);
    if (!rangeOpt || !rangeOpt.ms) return true;
    const cutoff = Date.now() - rangeOpt.ms;
    const batchTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return batchTime >= cutoff;
  });

  const activeBatches = filteredBatches.filter((b) =>
    ["normalizing", "enriching", "scoring", "correlating", "queued"].includes(b.status)
  );
  const totalEvents = filteredBatches.reduce((sum, b) => sum + (b.totalEvents || 0), 0);
  const totalErrors = filteredBatches.reduce((sum, b) => sum + (b.errorCount || 0), 0);

  const sourceData = filteredBatches.reduce(
    (acc, b) => {
      const src = b.source || "Unknown";
      acc[src] = (acc[src] || 0) + (b.totalEvents || 0);
      return acc;
    },
    {} as Record<string, number>
  );
  const sourceChartData = Object.entries(sourceData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const timelineData = filteredBatches
    .filter((b) => b.startedAt)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((b) => ({
      name: fmt.formatChartLabel(b.startedAt, timeRange),
      events: b.totalEvents || 0,
      processed: b.processedEvents || 0,
      errors: b.errorCount || 0,
    }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Time Range:</span>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5" data-testid="time-range-filter">
            {TIME_RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                variant={timeRange === opt.key ? "default" : "ghost"}
                size="sm"
                className={`h-7 px-3 text-[11px] font-medium ${timeRange === opt.key ? "" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setTimeRange(opt.key)}
                data-testid={`btn-time-range-${opt.key}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {filteredBatches.length} of {batches.length} batches
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-stat-total-batches">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{filteredBatches.length}</p>
              <p className="text-xs text-muted-foreground">Total Batches</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-total-events">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalEvents.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-active-batches">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Loader2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeBatches.length}</p>
              <p className="text-xs text-muted-foreground">Active Pipelines</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-error-count">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalErrors}</p>
              <p className="text-xs text-muted-foreground">Total Errors</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Events Ingested Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">No batch data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.blue} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke={C.blue}
                    fill="url(#gEvents)"
                    strokeWidth={2}
                    animationDuration={800}
                  />
                  <Area
                    type="monotone"
                    dataKey="processed"
                    stroke={C.green}
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Events by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sourceChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sourceChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {sourceChartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: "10px" }}
                    formatter={(v) => <span className="capitalize text-[10px]">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Recent Batches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredBatches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No ingestion batches in the selected time range. Try expanding the range or push data via the API.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">ID</TableHead>
                    <TableHead className="text-[10px]">Source</TableHead>
                    <TableHead className="text-[10px]">Channel</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Progress</TableHead>
                    <TableHead className="text-[10px]">Events</TableHead>
                    <TableHead className="text-[10px]">Errors</TableHead>
                    <TableHead className="text-[10px]">Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.slice(0, 50).map((batch) => {
                    const progress =
                      batch.totalEvents > 0
                        ? Math.round((batch.processedEvents / batch.totalEvents) * 100)
                        : 0;
                    return (
                      <TableRow key={batch.id} data-testid={`row-batch-${batch.id}`}>
                        <TableCell className="text-xs font-mono">#{batch.id}</TableCell>
                        <TableCell className="text-xs">{batch.source || "Unknown"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {batch.channel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <BatchStatusBadge status={batch.status} />
                        </TableCell>
                        <TableCell className="min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                              {progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {batch.processedEvents}/{batch.totalEvents}
                        </TableCell>
                        <TableCell>
                          {batch.errorCount > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {batch.errorCount}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(batch.startedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysTab({ tenantId }: { tenantId: number }) {
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const { data: apiKeys = [], isLoading } = useQuery<
    {
      id: number;
      name: string;
      keyPrefix: string;
      isActive: boolean;
      lastUsedAt: string | null;
      createdAt: string;
      permissions: any;
    }[]
  >({
    queryKey: ["/api/ingest-keys", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ingest-keys/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/ingest-keys/${tenantId}`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingest-keys", tenantId] });
      setNewKey(data.key);
      setShowKey(true);
      toast({ title: "API Key Created", description: `Key "${data.name}" created successfully.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/ingest-keys/${tenantId}/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingest-keys", tenantId] });
      toast({ title: "Key Revoked", description: "API key has been revoked." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!keyName.trim()) return;
    createMutation.mutate(keyName.trim());
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: "Copied", description: "API key copied to clipboard." });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold" data-testid="text-api-keys-title">Ingest API Keys</h3>
          <p className="text-xs text-muted-foreground">
            Manage API keys for external data ingestion via POST /api/v1/ingest/:tenantId
          </p>
        </div>
        <Button
          onClick={() => {
            setKeyName("");
            setNewKey(null);
            setCreateDialogOpen(true);
          }}
          data-testid="button-create-api-key"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {newKey && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">New API Key Created</p>
                <p className="text-[10px] text-muted-foreground">
                  Copy this key now. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="text-xs bg-muted px-3 py-1.5 rounded font-mono flex-1 break-all"
                    data-testid="text-new-api-key"
                  >
                    {showKey ? newKey : "••••••••••••••••••••••••••••••••"}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowKey(!showKey)}
                    data-testid="button-toggle-key-visibility"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopyKey(newKey)}
                    data-testid="button-copy-key"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {apiKeys.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">No API Keys</p>
              <p className="text-xs text-muted-foreground">
                Create an API key to start pushing data from external tools.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Key Prefix</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Last Used</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                    <TableCell className="text-xs font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                        {key.keyPrefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={key.isActive ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {key.isActive ? "Active" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {formatTimeAgo(key.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {fmt.formatDate(key.createdAt)}
                    </TableCell>
                    <TableCell>
                      {key.isActive && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(key.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-xs font-semibold mb-2">API Usage Example</p>
          <pre className="text-[10px] bg-muted rounded p-3 overflow-x-auto font-mono whitespace-pre-wrap">
{`curl -X POST https://your-domain/api/v1/ingest/${tenantId} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '[{"eventType":"endpoint","severity":"high","threat":"Malware detected","target":"workstation-01"}]'`}
          </pre>
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-api-key">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for pushing data to the ingestion pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="key-name" className="text-xs">
                Key Name
              </Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., CrowdStrike Integration"
                data-testid="input-key-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!keyName.trim() || createMutation.isPending}
              data-testid="button-confirm-create-key"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConnectorsTab({ tenantId }: { tenantId: number }) {
  const { data: integrations = [], isLoading } = useQuery<SecurityIntegration[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch integrations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  const connected = integrations.filter((i) => i.status === "connected");
  const withPolling = integrations.filter((i) => i.pollingEnabled);
  const totalEventsImported = integrations.reduce((sum, i) => sum + (i.eventsImported || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-connector-total">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Plug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{integrations.length}</p>
              <p className="text-xs text-muted-foreground">Total Connectors</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-connector-connected">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{connected.length}</p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-connector-polling">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{withPolling.length}</p>
              <p className="text-xs text-muted-foreground">Auto-Polling</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-connector-events">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalEventsImported.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Events Imported</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {integrations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">No Connectors Configured</p>
            <p className="text-xs text-muted-foreground">
              Go to Security Integrations to add connectors.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {integrations.map((integration) => {
            const isConnected = integration.status === "connected";
            const isError = integration.status === "error";
            return (
              <Card key={integration.id} data-testid={`card-connector-${integration.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium truncate">{integration.platformName}</h4>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {integration.category}
                      </p>
                    </div>
                    <Badge
                      variant={isConnected ? "default" : isError ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {isConnected ? (
                        <Wifi className="w-3 h-3 mr-1" />
                      ) : isError ? (
                        <XCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <WifiOff className="w-3 h-3 mr-1" />
                      )}
                      {integration.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        Events
                      </p>
                      <p className="text-sm font-semibold">
                        {(integration.eventsImported || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        Last Poll
                      </p>
                      <p className="text-sm font-semibold">
                        {formatTimeAgo(integration.lastPollAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {integration.pollingEnabled && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <RefreshCw className="w-3 h-3" />
                        Every {integration.pollingIntervalMinutes}m
                      </Badge>
                    )}
                    {integration.lastPollStatus && (
                      <Badge
                        variant={
                          integration.lastPollStatus === "success"
                            ? "default"
                            : integration.lastPollStatus === "error"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {integration.lastPollStatus}
                      </Badge>
                    )}
                  </div>

                  {integration.lastPollMessage && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {integration.lastPollMessage}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DataQualityTab({ tenantId }: { tenantId: number }) {
  const { data: batches = [] } = useQuery<IngestBatch[]>({
    queryKey: ["/api/ingest-batches", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ingest-batches/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch batches");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: integrations = [] } = useQuery<SecurityIntegration[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  const totalBatches = batches.length;
  const completedBatches = batches.filter((b) => b.status === "complete").length;
  const errorBatches = batches.filter((b) => b.status === "failed").length;
  const totalEvents = batches.reduce((sum, b) => sum + (b.totalEvents || 0), 0);
  const processedEvents = batches.reduce((sum, b) => sum + (b.processedEvents || 0), 0);
  const errorEvents = batches.reduce((sum, b) => sum + (b.errorCount || 0), 0);

  const normalizationRate = totalEvents > 0 ? Math.round((processedEvents / totalEvents) * 100) : 100;
  const successRate = totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 100;
  const errorRate = totalEvents > 0 ? Math.round((errorEvents / totalEvents) * 100) : 0;

  const connectorCoverage = integrations.length > 0
    ? Math.round((integrations.filter((i) => i.status === "connected").length / integrations.length) * 100)
    : 0;

  const channelCounts = batches.reduce(
    (acc, b) => {
      const ch = b.channel || "api";
      if (!acc[ch]) acc[ch] = { total: 0, processed: 0, errors: 0 };
      acc[ch].total += b.totalEvents || 0;
      acc[ch].processed += b.processedEvents || 0;
      acc[ch].errors += b.errorCount || 0;
      return acc;
    },
    {} as Record<string, { total: number; processed: number; errors: number }>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-quality-normalization">
          <CardContent className="p-4 flex flex-col items-center">
            <RiskGauge value={normalizationRate} label="Normalization Rate" />
          </CardContent>
        </Card>
        <Card data-testid="card-quality-success">
          <CardContent className="p-4 flex flex-col items-center">
            <RiskGauge value={successRate} label="Batch Success Rate" />
          </CardContent>
        </Card>
        <Card data-testid="card-quality-enrichment">
          <CardContent className="p-4 flex flex-col items-center">
            <RiskGauge
              value={totalEvents > 0 ? Math.round(((processedEvents - errorEvents) / totalEvents) * 100) : 100}
              label="Enrichment Success"
            />
          </CardContent>
        </Card>
        <Card data-testid="card-quality-connector">
          <CardContent className="p-4 flex flex-col items-center">
            <RiskGauge value={connectorCoverage} label="Connector Health" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Quality by Channel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(channelCounts).length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No data available</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(channelCounts).map(([channel, data]) => {
                  const rate = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
                  return (
                    <div key={channel} className="space-y-1" data-testid={`quality-channel-${channel}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {channel}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {data.total.toLocaleString()} events
                          </span>
                        </div>
                        <span className="text-[10px] font-mono">{rate}%</span>
                      </div>
                      <Progress value={rate} className="h-1.5" />
                      {data.errors > 0 && (
                        <p className="text-[10px] text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {data.errors} events with errors
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Quality Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errorRate > 10 && (
                <div
                  className="flex items-start gap-2 p-2.5 rounded bg-destructive/5 border border-destructive/20"
                  data-testid="alert-high-error-rate"
                >
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">High Error Rate</p>
                    <p className="text-[10px] text-muted-foreground">
                      {errorRate}% of events have errors. Check data format and source configuration.
                    </p>
                  </div>
                </div>
              )}
              {connectorCoverage < 50 && integrations.length > 0 && (
                <div
                  className="flex items-start gap-2 p-2.5 rounded bg-amber-500/5 border border-amber-500/20"
                  data-testid="alert-low-connector-health"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Low Connector Health</p>
                    <p className="text-[10px] text-muted-foreground">
                      Only {connectorCoverage}% of connectors are connected. Check integration settings.
                    </p>
                  </div>
                </div>
              )}
              {errorBatches > 0 && (
                <div
                  className="flex items-start gap-2 p-2.5 rounded bg-amber-500/5 border border-amber-500/20"
                  data-testid="alert-failed-batches"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Failed Batches</p>
                    <p className="text-[10px] text-muted-foreground">
                      {errorBatches} batch(es) failed processing. Review source data for issues.
                    </p>
                  </div>
                </div>
              )}
              {errorRate <= 10 && connectorCoverage >= 50 && errorBatches === 0 && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">All Systems Healthy</p>
                    <p className="text-[10px] text-muted-foreground">
                      No data quality issues detected. All metrics within normal range.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SigmaRuleData {
  id: string;
  title: string;
  status: string;
  level: string;
  description: string;
  author: string;
  logsource: { category: string; product: string };
  detection: { selection: Record<string, any>; keywords: string[]; condition: string };
  mitre: { tactic: string; technique: string; technique_name: string };
  tags: string[];
  enabled: boolean;
  matchCount: number;
  lastMatchAt: string | null;
}

interface SigmaStatsData {
  totalRules: number;
  enabledRules: number;
  totalMatches: number;
  matchesBySeverity: Record<string, number>;
  matchesByTactic: Record<string, number>;
  topRules: { ruleId: string; title: string; matches: number }[];
  rulesBySource?: { builtin: number; community: number; custom: number };
  rulesByCategory?: Record<string, number>;
}

interface SigmaRulesResponse {
  rules: SigmaRuleData[];
  total: number;
  sources: Record<string, number>;
  categories: Record<string, number>;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  informational: "bg-muted text-muted-foreground",
};

const MITRE_TACTICS = [
  "initial_access", "execution", "persistence", "privilege_escalation",
  "defense_evasion", "credential_access", "discovery", "lateral_movement",
  "collection", "command_and_control", "exfiltration", "impact",
  "resource_development", "reconnaissance",
];

function CreateRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("medium");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("any");
  const [product, setProduct] = useState("any");
  const [keywords, setKeywords] = useState("");
  const [condition, setCondition] = useState("selection AND keywords");
  const [mitreTactic, setMitreTactic] = useState("");
  const [mitreId, setMitreId] = useState("");
  const [mitreName, setMitreName] = useState("");
  const [tags, setTags] = useState("");
  const [falsePositives, setFalsePositives] = useState("");

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/sigma-rules", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules/stats"] });
      toast({ title: "Rule Created", description: `Custom rule "${title}" created successfully.` });
      onOpenChange(false);
      setTitle(""); setDescription(""); setKeywords(""); setMitreId(""); setMitreName(""); setTags(""); setFalsePositives("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) { toast({ title: "Validation", description: "Title is required.", variant: "destructive" }); return; }
    if (!keywords.trim()) { toast({ title: "Validation", description: "At least one detection keyword is required.", variant: "destructive" }); return; }
    createMutation.mutate({
      title: title.trim(),
      level,
      description: description.trim(),
      logsource: { category, product },
      detection: {
        selection: {},
        keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
        condition,
      },
      mitre: mitreTactic && mitreTactic !== "none" ? { tactic: mitreTactic, technique: mitreId.trim(), technique_name: mitreName.trim() } : undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      falsepositives: falsePositives.split("\n").map(f => f.trim()).filter(Boolean),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-create-sigma-rule">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Custom Sigma Rule
          </DialogTitle>
          <DialogDescription>
            Define a custom detection rule. Rules use keyword matching against security event data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Suspicious PowerShell Execution" data-testid="input-rule-title" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Severity Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger data-testid="select-rule-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="informational">Informational</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what this rule detects..." rows={2} data-testid="input-rule-description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Log Source Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-rule-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["any", "process_creation", "file_event", "registry_event", "network_connection", "dns_query", "image_load", "firewall", "proxy", "webserver", "antivirus", "sysmon", "authentication", "cloud"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Product</Label>
              <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g., windows, linux, any" data-testid="input-rule-product" />
            </div>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider">Detection</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Keywords * (comma-separated)</Label>
              <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g., powershell, -enc, bypass, invoke-expression" data-testid="input-rule-keywords" />
              <p className="text-[10px] text-muted-foreground">Events matching ANY of these keywords will trigger the rule.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condition</Label>
              <Input value={condition} onChange={e => setCondition(e.target.value)} data-testid="input-rule-condition" />
              <p className="text-[10px] text-muted-foreground">Default: "selection AND keywords". Use "selection OR keywords" for broader matching.</p>
            </div>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider">MITRE ATT&CK Mapping (Optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tactic</Label>
                <Select value={mitreTactic} onValueChange={setMitreTactic}>
                  <SelectTrigger data-testid="select-rule-mitre-tactic"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {MITRE_TACTICS.map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Technique ID</Label>
                <Input value={mitreId} onChange={e => setMitreId(e.target.value)} placeholder="e.g., T1059.001" data-testid="input-rule-mitre-id" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Technique Name</Label>
                <Input value={mitreName} onChange={e => setMitreName(e.target.value)} placeholder="e.g., PowerShell" data-testid="input-rule-mitre-name" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g., attack.execution, attack.t1059" data-testid="input-rule-tags" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">False Positives (one per line)</Label>
              <Textarea value={falsePositives} onChange={e => setFalsePositives(e.target.value)} placeholder="e.g., Legitimate admin scripts" rows={2} data-testid="input-rule-fp" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-rule">Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-rule">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SigmaRulesTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tacticFilter, setTacticFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const RULES_PER_PAGE = 50;

  const queryParams = new URLSearchParams();
  if (sourceFilter !== "all") queryParams.set("source", sourceFilter);
  if (levelFilter !== "all") queryParams.set("level", levelFilter);
  if (categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (statusFilter !== "all") queryParams.set("enabled", statusFilter === "enabled" ? "true" : "false");
  if (tacticFilter !== "all") queryParams.set("tactic", tacticFilter);
  queryParams.set("page", String(page));
  queryParams.set("limit", String(RULES_PER_PAGE));

  const { data: rulesData, isLoading } = useQuery<SigmaRulesResponse>({
    queryKey: ["/api/sigma-rules", sourceFilter, levelFilter, categoryFilter, statusFilter, tacticFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/sigma-rules?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sigma rules");
      return res.json();
    },
  });

  const rules = rulesData?.rules || [];
  const totalRules = rulesData?.total || 0;
  const totalPages = Math.ceil(totalRules / RULES_PER_PAGE);

  const { data: stats } = useQuery<SigmaStatsData>({
    queryKey: ["/api/sigma-rules/stats"],
    queryFn: async () => {
      const res = await fetch("/api/sigma-rules/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/sigma-rules/${ruleId}/toggle`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ source, enabled }: { source: string; enabled: boolean }) => {
      await apiRequest("POST", "/api/sigma-rules/bulk-toggle", { source, enabled });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules/stats"] });
      toast({ title: "Success", description: `${vars.source} rules ${vars.enabled ? "enabled" : "disabled"}` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const hasActiveFilters = sourceFilter !== "all" || levelFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all" || tacticFilter !== "all" || searchTerm !== "";
  const clearAllFilters = () => {
    setSourceFilter("all"); setLevelFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); setTacticFilter("all"); setSearchTerm(""); setPage(1);
  };

  const filteredRules = rules.filter(r => {
    if (searchTerm && !(
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.mitre?.tactic || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.mitre?.technique || "").toLowerCase().includes(searchTerm.toLowerCase())
    )) return false;
    return true;
  });

  const tacticData = stats?.matchesByTactic
    ? Object.entries(stats.matchesByTactic)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  const severityData = stats?.matchesBySeverity
    ? Object.entries(stats.matchesBySeverity)
        .map(([name, value]) => ({ name, value }))
    : [];

  const { data: dashboardData } = useQuery<any>({
    queryKey: ["/api/dashboard", tenantId],
  });
  const incidentsByDomain: Record<string, number> = dashboardData?.incidentsByDomain || {};
  const eventsByDomain: Record<string, number> = dashboardData?.eventsByDomain || {};
  const domainConfig = [
    { key: "Endpoint", label: "Endpoint", icon: Monitor, color: "#3b82f6" },
    { key: "DLP", label: "DLP", icon: Lock, color: "#14b8a6" },
    { key: "Email", label: "Email", icon: Mail, color: "#f59e0b" },
    { key: "Web", label: "Web", icon: Globe, color: "#06b6d4" },
    { key: "Web App", label: "Web App", icon: AppWindow, color: "#f97316" },
    { key: "Identity", label: "Identity", icon: Users, color: "#ec4899" },
    { key: "Database", label: "Database", icon: Database, color: "#8b5cf6" },
    { key: "Network", label: "Network", icon: Network, color: "#6366f1" },
  ];
  const totalDomainIncidents = Object.values(incidentsByDomain).reduce((a, b) => a + b, 0);
  const totalDomainEvents = Object.values(eventsByDomain).reduce((a, b) => a + b, 0);
  const availableCategories = Object.keys(rulesData?.categories || {}).sort();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(totalDomainEvents > 0 || totalDomainIncidents > 0) && (
        <Card data-testid="card-sigma-incident-formula">
          <CardContent className="p-4">
            <Tabs defaultValue="events" data-testid="tabs-sigma-domain-breakdown">
              <div className="flex items-center gap-2 mb-3">
                <TabsList className="h-7">
                  <TabsTrigger value="events" className="text-[10px] h-6 px-2" data-testid="tab-sigma-events-breakdown">
                    <Activity className="w-3 h-3 mr-1" />Security Events
                  </TabsTrigger>
                  <TabsTrigger value="incidents" className="text-[10px] h-6 px-2" data-testid="tab-sigma-incidents-breakdown">
                    <AlertTriangle className="w-3 h-3 mr-1" />Incidents
                  </TabsTrigger>
                </TabsList>
                <span className="text-[10px] text-muted-foreground ml-auto font-mono hidden sm:inline">
                  Total = {domainConfig.map(d => d.label).join(" + ")}
                </span>
              </div>
              <TabsContent value="events" className="mt-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-[10px] font-mono">{totalDomainEvents.toLocaleString()} events</Badge>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {domainConfig.map(d => {
                    const Ico = d.icon;
                    const count = eventsByDomain[d.key] || 0;
                    return (
                      <div key={d.key} className="flex flex-col items-center gap-1 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors" data-testid={`badge-sigma-event-domain-${d.key}`}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${d.color}15` }}>
                          <Ico className="w-4 h-4" style={{ color: d.color }} />
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color: d.color }}>{count.toLocaleString()}</span>
                        <span className="text-[9px] text-muted-foreground text-center leading-tight">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="incidents" className="mt-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-[10px] font-mono">{totalDomainIncidents.toLocaleString()} incidents</Badge>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {domainConfig.map(d => {
                    const Ico = d.icon;
                    const count = incidentsByDomain[d.key] || 0;
                    return (
                      <div key={d.key} className="flex flex-col items-center gap-1 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors" data-testid={`badge-sigma-domain-${d.key}`}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${d.color}15` }}>
                          <Ico className="w-4 h-4" style={{ color: d.color }} />
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color: d.color }}>{count.toLocaleString()}</span>
                        <span className="text-[9px] text-muted-foreground text-center leading-tight">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-sigma-total-rules">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-sigma-total-rules">{stats?.totalRules || rules.length}</p>
              <p className="text-xs text-muted-foreground">Total Rules</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-sigma-enabled-rules">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-sigma-enabled-rules">{stats?.enabledRules || rules.filter(r => r.enabled).length}</p>
              <p className="text-xs text-muted-foreground">Enabled</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-sigma-total-matches">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-sigma-total-matches">{stats?.totalMatches || 0}</p>
              <p className="text-xs text-muted-foreground">Total Matches</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-sigma-top-rule">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.topRules?.[0]?.matches || 0}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                {stats?.topRules?.[0]?.title || "Top Rule Hits"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(tacticData.length > 0 || severityData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tacticData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Matches by MITRE Tactic
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={tacticData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                      {tacticData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} formatter={(v) => <span className="text-[10px]">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {severityData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Matches by Severity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={severityData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                      {severityData.map((entry, i) => {
                        const sColor = entry.name === "critical" ? C.red : entry.name === "high" ? C.orange : entry.name === "medium" ? C.yellow : C.blue;
                        return <Cell key={i} fill={sColor} />;
                      })}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} formatter={(v) => <span className="capitalize text-[10px]">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {stats?.rulesBySource && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setSourceFilter("builtin"); setPage(1); }} data-testid="card-sigma-builtin">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.rulesBySource.builtin}</p>
              <p className="text-[10px] text-muted-foreground">Built-in Rules</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setSourceFilter("community"); setPage(1); }} data-testid="card-sigma-community">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.rulesBySource.community}</p>
              <p className="text-[10px] text-muted-foreground">Community (SigmaHQ)</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setSourceFilter("custom"); setPage(1); }} data-testid="card-sigma-custom">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{stats.rulesBySource.custom}</p>
              <p className="text-[10px] text-muted-foreground">Custom Rules</p>
            </CardContent>
          </Card>
        </div>
      )}

      <CreateRuleDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Sigma Detection Rules
              <span className="text-muted-foreground font-normal">({totalRules} rules)</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" className="text-[10px] h-7" data-testid="button-create-rule" onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />Create Rule
              </Button>
              {sourceFilter === "community" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="text-[10px] h-7" data-testid="button-enable-community"
                    onClick={() => bulkToggleMutation.mutate({ source: "community", enabled: true })}
                    disabled={bulkToggleMutation.isPending}>
                    Enable All
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-7" data-testid="button-disable-community"
                    onClick={() => bulkToggleMutation.mutate({ source: "community", enabled: false })}
                    disabled={bulkToggleMutation.isPending}>
                    Disable All
                  </Button>
                </div>
              )}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search rules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 text-xs w-48"
                  data-testid="input-sigma-search"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px] h-7 text-[10px]" data-testid="select-filter-level">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="informational">Informational</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-7 text-[10px]" data-testid="select-filter-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px] h-7 text-[10px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tacticFilter} onValueChange={v => { setTacticFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-7 text-[10px]" data-testid="select-filter-tactic">
                <SelectValue placeholder="MITRE Tactic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tactics</SelectItem>
                {MITRE_TACTICS.map(t => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" className="text-[10px] h-7 text-muted-foreground" onClick={clearAllFilters} data-testid="button-clear-filters">
                <XCircle className="w-3 h-3 mr-1" />Clear Filters
              </Button>
            )}
            {hasActiveFilters && (
              <div className="flex gap-1 flex-wrap">
                {sourceFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px] capitalize">{sourceFilter}
                    <button onClick={() => { setSourceFilter("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {levelFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px] capitalize">{levelFilter}
                    <button onClick={() => { setLevelFilter("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {categoryFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px]">{categoryFilter}
                    <button onClick={() => { setCategoryFilter("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px] capitalize">{statusFilter}
                    <button onClick={() => { setStatusFilter("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {tacticFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px]">{tacticFilter.replace(/_/g, " ")}
                    <button onClick={() => { setTacticFilter("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredRules.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              {searchTerm ? "No rules match your search." : "No Sigma rules loaded."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Rule</TableHead>
                    <TableHead className="text-[10px]">Severity</TableHead>
                    <TableHead className="text-[10px]">MITRE Tactic</TableHead>
                    <TableHead className="text-[10px]">Technique</TableHead>
                    <TableHead className="text-[10px]">Category</TableHead>
                    <TableHead className="text-[10px]">Matches</TableHead>
                    <TableHead className="text-[10px]">Last Match</TableHead>
                    <TableHead className="text-[10px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules.map((rule) => (
                    <TableRow key={rule.id} data-testid={`row-sigma-rule-${rule.id}`}>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleMutation.mutate({ ruleId: rule.id, enabled: !rule.enabled })}
                          data-testid={`button-toggle-rule-${rule.id}`}
                        >
                          {rule.enabled ? (
                            <ToggleRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium" data-testid={`text-rule-title-${rule.id}`}>{rule.title}</p>
                          <p className="text-[10px] text-muted-foreground max-w-[300px] truncate">{rule.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${SEVERITY_STYLES[rule.level] || ""}`}
                          data-testid={`badge-severity-${rule.id}`}
                        >
                          {rule.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{rule.mitre?.tactic || "-"}</TableCell>
                      <TableCell>
                        {rule.mitre?.technique ? (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {rule.mitre.technique}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {rule.logsource.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono font-medium" data-testid={`text-match-count-${rule.id}`}>
                          {rule.matchCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {rule.lastMatchAt ? formatTimeAgo(rule.lastMatchAt) : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {rule.tags.map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">
                              {tag.replace("attack.", "")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-[10px] text-muted-foreground">
                Page {page} of {totalPages} ({totalRules} rules)
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="text-[10px] h-7" disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))} data-testid="button-sigma-prev-page">
                  Previous
                </Button>
                <Button size="sm" variant="outline" className="text-[10px] h-7" disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)} data-testid="button-sigma-next-page">
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {stats?.topRules && stats.topRules.some(r => r.matches > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top Matching Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topRules.filter(r => r.matches > 0).map((r, i) => (
                <div key={r.ruleId} className="flex items-center justify-between gap-4 p-2 rounded hover-elevate" data-testid={`row-top-rule-${i}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                    <span className="text-xs font-medium truncate">{r.title}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {r.matches} matches
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function IngestionDashboard() {
  const { currentTenant, isMSS } = useTenant();
  const tenantId = currentTenant?.id;
  const dashboardRef = useDashboardExportRef();

  if (!currentTenant || !tenantId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Select a tenant to view the ingestion dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="ingestion-dashboard-page" ref={dashboardRef}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Zap className="w-6 h-6" />
            Data Ingestion
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor data pipelines, manage API keys, and track data quality for {currentTenant.name}
          </p>
        </div>
        <DashboardExportBar dashboardTitle="Data Ingestion Dashboard" containerRef={dashboardRef} />
      </div>

      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList data-testid="tabs-ingestion">
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">
            <Activity className="w-4 h-4 mr-1.5" />
            Pipeline Monitor
          </TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">
            <Key className="w-4 h-4 mr-1.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="connectors" data-testid="tab-connectors">
            <Plug className="w-4 h-4 mr-1.5" />
            Connectors
          </TabsTrigger>
          <TabsTrigger value="quality" data-testid="tab-quality">
            <Shield className="w-4 h-4 mr-1.5" />
            Data Quality
          </TabsTrigger>
          <TabsTrigger value="sigma" data-testid="tab-sigma">
            <BookOpen className="w-4 h-4 mr-1.5" />
            Sigma Rules
          </TabsTrigger>
          <TabsTrigger value="microservices" data-testid="tab-microservices">
            <Server className="w-4 h-4 mr-1.5" />
            Pipeline Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineMonitorTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="connectors" className="mt-4">
          <ConnectorsTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="quality" className="mt-4">
          <DataQualityTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="sigma" className="mt-4">
          <SigmaRulesTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="microservices" className="mt-4">
          <PipelineHealthTabContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
