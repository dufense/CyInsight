import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Server, Plus, Wifi, WifiOff, AlertTriangle,
  TrendingUp, Zap, RefreshCw, Eye, Fingerprint, LucideIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface SourceHealth {
  id: number;
  sourceId: number;
  tenantId: number;
  eventsPerMin: number;
  parseSuccessRate: number;
  lastSeen: string | null;
  errorRate: number;
  totalEventsToday: number;
  updatedAt: string;
}

interface LogSource {
  id: number;
  tenantId: number;
  name: string;
  sourceType: string;
  protocol: string;
  host: string;
  port: number;
  expectedFormat: string | null;
  tags: string[] | null;
  fingerprintId: number | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  health: SourceHealth | null;
}

interface DeviceFingerprint {
  id: number;
  sourceId: number;
  tenantId: number;
  vendor: string | null;
  product: string | null;
  logFormat: string | null;
  eventCategory: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  detectedFields: string[] | null;
}

interface NewLogSourcePayload {
  name: string;
  sourceType: string;
  protocol: string;
  host: string;
  port: number;
  tags: string[];
}

const SOURCE_TYPES = [
  "firewall", "ids_ips", "waf", "proxy", "edr", "email_gateway",
  "database_monitor", "casb", "cloud", "ot_iot", "network_tap",
  "siem", "identity", "vulnerability_scanner", "custom",
] as const;

const PROTOCOLS = [
  "syslog_udp", "syslog_tcp", "syslog_tls", "http_webhook", "cef", "leef",
  "json", "xml", "plaintext", "file_upload", "api_pull",
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  online: { label: "Online", color: "text-green-600 bg-green-500/10 border-green-500/30", icon: Wifi },
  offline: { label: "Offline", color: "text-red-600 bg-red-500/10 border-red-500/30", icon: WifiOff },
  degraded: { label: "Degraded", color: "text-yellow-600 bg-yellow-500/10 border-yellow-500/30", icon: AlertTriangle },
};


function getSourceStatus(source: LogSource): "online" | "degraded" | "offline" {
  if (!source.isActive) return "offline";
  const h = source.health;
  if (!h) return "offline";
  const lastSeenMs = h.lastSeen ? Date.now() - new Date(h.lastSeen).getTime() : Infinity;
  if (lastSeenMs > 5 * 60 * 1000) return "offline";
  if (h.parseSuccessRate < 85 || h.errorRate > 5) return "degraded";
  return "online";
}


export default function LogSourceManagementPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSource, setSelectedSource] = useState<LogSource | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [form, setForm] = useState<NewLogSourcePayload & { tagsRaw: string }>({
    name: "", sourceType: "firewall", protocol: "syslog_udp", host: "", port: 514, tags: [], tagsRaw: "",
  });

  const sourcesQuery = useQuery<LogSource[]>({
    queryKey: ["/api/log-sources", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const res = await fetch(`/api/log-sources/${currentTenant.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 30000,
  });

  const fingerprintQuery = useQuery<DeviceFingerprint | null>({
    queryKey: ["/api/log-sources", currentTenant?.id, selectedSource?.id, "fingerprint"],
    queryFn: async () => {
      if (!currentTenant?.id || !selectedSource?.id) return null;
      const res = await fetch(
        `/api/log-sources/${currentTenant.id}/${selectedSource.id}/fingerprint`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentTenant?.id && !!selectedSource?.id,
    staleTime: 120000,
  });

  interface TrendBucket {
    hour: string;
    count: number;
    errors: number;
  }

  interface SourceTrend {
    sourceId: number;
    sourceType: string;
    eventTypesQueried: string[];
    buckets: TrendBucket[];
    degraded?: boolean;
    queryError?: string;
  }

  const sourceTrendQuery = useQuery<SourceTrend | null>({
    queryKey: ["/api/log-sources", currentTenant?.id, selectedSource?.id, "trend"],
    queryFn: async () => {
      if (!currentTenant?.id || !selectedSource?.id) return null;
      const res = await fetch(
        `/api/log-sources/${currentTenant.id}/${selectedSource.id}/trend`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentTenant?.id && !!selectedSource?.id,
    staleTime: 60000,
  });

  const addSourceMutation = useMutation<LogSource, Error, NewLogSourcePayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/log-sources/${currentTenant?.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to add source");
      }
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/log-sources", currentTenant?.id] });
      toast({ title: "Source added", description: `${created.name} has been registered.` });
      setShowAdd(false);
      setForm({ name: "", sourceType: "firewall", protocol: "syslog_udp", host: "", port: 514, tags: [], tagsRaw: "" });
    },
    onError: (err) => {
      toast({ title: "Failed to add source", description: err.message, variant: "destructive" });
    },
  });

  const sources = sourcesQuery.data ?? [];
  const onlineCount = sources.filter((s) => getSourceStatus(s) === "online").length;
  const degradedCount = sources.filter((s) => getSourceStatus(s) === "degraded").length;
  const offlineCount = sources.filter((s) => getSourceStatus(s) === "offline").length;
  const totalRate = sources.reduce((s, src) => s + (src.health?.eventsPerMin ?? 0), 0);

  const handleAdd = () => {
    if (!form.name || !form.host) {
      toast({ title: "Validation error", description: "Name and host are required.", variant: "destructive" });
      return;
    }
    addSourceMutation.mutate({
      name: form.name,
      sourceType: form.sourceType,
      protocol: form.protocol,
      host: form.host,
      port: form.port,
      tags: form.tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };

  const testConnection = async (source: LogSource) => {
    setTestingId(source.id);
    try {
      const res = await fetch(`/api/log-sources/${currentTenant?.id}/${source.id}/health`, {
        credentials: "include",
      });
      const status = getSourceStatus(source);
      const success = res.ok && status !== "offline";
      toast({
        title: success ? "Connection healthy" : "Connection issue",
        description: success
          ? `${source.name} is responding normally.`
          : `${source.name} — ${res.ok ? "degraded performance detected" : "could not reach endpoint"}.`,
        variant: success ? "default" : "destructive",
      });
    } catch {
      toast({
        title: "Connection test failed",
        description: `Could not reach ${source.host}:${source.port}`,
        variant: "destructive",
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Server}
        title="Source Management"
        description="Manage and monitor all registered log sources with real-time health indicators and ingestion metrics"
        badge="Log Intelligence"
        stats={[
          { label: "Total Sources", value: sources.length },
          { label: "Online", value: onlineCount },
          { label: "Degraded", value: degradedCount, accent: degradedCount > 0 },
          { label: "Ingestion Rate", value: `${Math.round(totalRate).toLocaleString()}/min` },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {offlineCount > 0 && (
              <Badge variant="destructive" className="text-xs">{offlineCount} Offline</Badge>
            )}
            {degradedCount > 0 && (
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs">{degradedCount} Degraded</Badge>
            )}
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-source">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add Source
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {sourcesQuery.isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
                <p className="text-sm">Loading log sources...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Source</TableHead>
                      <TableHead className="text-[11px]">Type / Protocol</TableHead>
                      <TableHead className="text-[11px]">Status</TableHead>
                      <TableHead className="text-[11px]">Events/min</TableHead>
                      <TableHead className="text-[11px]">Parse Success</TableHead>
                      <TableHead className="text-[11px]">Last Seen</TableHead>
                      <TableHead className="text-[11px]">Error Rate</TableHead>
                      <TableHead className="text-[11px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sources.map((src) => {
                      const status = getSourceStatus(src);
                      const statusCfg = STATUS_CONFIG[status];
                      const StatusIcon = statusCfg.icon;
                      const isOffline = status === "offline";
                      return (
                        <TableRow key={src.id} data-testid={`row-source-${src.id}`}>
                          <TableCell>
                            <div>
                              <p className="text-xs font-medium">{src.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{src.host}:{src.port}</p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {(src.tags ?? []).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="secondary" className="text-[10px]">{src.sourceType}</Badge>
                              <Badge variant="outline" className="text-[10px] ml-1">{src.protocol}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.color}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {isOffline ? "—" : `${Math.round(src.health?.eventsPerMin ?? 0).toLocaleString()}`}
                          </TableCell>
                          <TableCell>
                            {isOffline || !src.health ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${src.health.parseSuccessRate >= 95 ? "bg-green-500" : src.health.parseSuccessRate >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${src.health.parseSuccessRate}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono">{src.health.parseSuccessRate.toFixed(1)}%</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {src.health?.lastSeen
                              ? (() => {
                                const diff = Date.now() - new Date(src.health.lastSeen).getTime();
                                const sec = Math.floor(diff / 1000);
                                if (sec < 60) return `${sec}s ago`;
                                const min = Math.floor(sec / 60);
                                if (min < 60) return `${min}m ago`;
                                return `${Math.floor(min / 60)}h ago`;
                              })()
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            {src.health && src.health.errorRate > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">{src.health.errorRate.toFixed(1)}%</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">0%</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => testConnection(src)}
                                disabled={testingId === src.id}
                                data-testid={`button-test-connection-${src.id}`}
                              >
                                {testingId === src.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Zap className="w-3 h-3 mr-1" />
                                )}
                                Test
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => setSelectedSource(src)}
                                data-testid={`button-view-source-${src.id}`}
                              >
                                <Eye className="w-3 h-3 mr-1" />Details
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {!sourcesQuery.isLoading && sources.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Server className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No log sources configured.</p>
                <Button size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Add First Source
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" data-testid="dialog-add-source">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="w-4 h-4" />Add Log Source
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Source Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Checkpoint Firewall"
                data-testid="input-source-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.sourceType} onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}>
                  <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm((f) => ({ ...f, protocol: v }))}>
                  <SelectTrigger data-testid="select-source-protocol"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Host / IP</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="e.g. 192.168.1.1 or syslog.corp.com"
                data-testid="input-source-host"
              />
            </div>
            <div>
              <Label className="text-xs">Port</Label>
              <Input
                value={form.port}
                type="number"
                onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value) || 514 }))}
                placeholder="514"
                data-testid="input-source-port"
              />
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                value={form.tagsRaw}
                onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))}
                placeholder="firewall, perimeter, critical"
                data-testid="input-source-tags"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addSourceMutation.isPending} data-testid="button-confirm-add-source">
              {addSourceMutation.isPending ? "Adding..." : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        {selectedSource && (
          <DialogContent className="max-w-2xl" data-testid="dialog-source-detail">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="w-4 h-4" />{selectedSource.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/30 border" data-testid="panel-fingerprint">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2 flex items-center gap-1">
                  <Fingerprint className="w-3 h-3" />AI-Generated Device Fingerprint
                </p>
                {fingerprintQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Analyzing device fingerprint...</p>
                ) : fingerprintQuery.data ? (
                  <div className="space-y-2">
                    <code className="text-[11px] font-mono bg-background rounded p-2 block border">
                      {[
                        fingerprintQuery.data.vendor,
                        fingerprintQuery.data.product,
                        fingerprintQuery.data.logFormat,
                        fingerprintQuery.data.eventCategory,
                      ].filter(Boolean).join("-").toUpperCase() || `FP-${selectedSource.id}-${selectedSource.sourceType.toUpperCase()}`}
                    </code>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {fingerprintQuery.data.vendor && (
                        <div><span className="text-muted-foreground">Vendor: </span><span>{fingerprintQuery.data.vendor}</span></div>
                      )}
                      {fingerprintQuery.data.product && (
                        <div><span className="text-muted-foreground">Product: </span><span>{fingerprintQuery.data.product}</span></div>
                      )}
                      {fingerprintQuery.data.logFormat && (
                        <div><span className="text-muted-foreground">Format: </span><span>{fingerprintQuery.data.logFormat}</span></div>
                      )}
                      {fingerprintQuery.data.aiConfidence != null && (
                        <div><span className="text-muted-foreground">AI Confidence: </span><span className="font-mono">{fingerprintQuery.data.aiConfidence}%</span></div>
                      )}
                    </div>
                    {fingerprintQuery.data.aiReasoning && (
                      <p className="text-[10px] text-muted-foreground italic">{fingerprintQuery.data.aiReasoning}</p>
                    )}
                    {(fingerprintQuery.data.detectedFields?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(fingerprintQuery.data.detectedFields ?? []).slice(0, 8).map((f) => (
                          <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <code className="text-[11px] font-mono bg-background rounded p-2 block border">
                      {`${selectedSource.sourceType.toUpperCase()}-${selectedSource.protocol}-${selectedSource.host.replace(/\./g, "-").toUpperCase()}`}
                      {selectedSource.fingerprintId ? ` [FP#${selectedSource.fingerprintId}]` : " [PENDING]"}
                    </code>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedSource.fingerprintId
                        ? `Fingerprint ID ${selectedSource.fingerprintId} assigned — detailed analysis loading.`
                        : "No AI fingerprint detected yet. Fingerprint will be generated after the first log events are ingested."}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Connection Details</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type:</span> <span>{selectedSource.sourceType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Protocol:</span> <span>{selectedSource.protocol}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Host:</span> <span className="font-mono">{selectedSource.host}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Port:</span> <span className="font-mono">{selectedSource.port}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Active:</span> <span>{selectedSource.isActive ? "Yes" : "No"}</span></div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Health Summary</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Events/min:</span> <span className="font-mono">{Math.round(selectedSource.health?.eventsPerMin ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Parse Success:</span> <span className="font-mono">{(selectedSource.health?.parseSuccessRate ?? 0).toFixed(1)}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Error Rate:</span> <span className="font-mono">{(selectedSource.health?.errorRate ?? 0).toFixed(1)}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Events Today:</span> <span className="font-mono">{(selectedSource.health?.totalEventsToday ?? 0).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />Current Ingestion Metrics (Live)
                </p>
                {selectedSource.health ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <p className="text-lg font-bold font-mono">{Math.round(selectedSource.health.eventsPerMin ?? 0)}</p>
                      <p className="text-[10px] text-muted-foreground">Events / min (live)</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <p className="text-lg font-bold font-mono">{(selectedSource.health.totalEventsToday ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Events today</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-baseline gap-1">
                        <p className={`text-lg font-bold font-mono ${(selectedSource.health.parseSuccessRate ?? 0) >= 90 ? "text-green-600" : "text-yellow-600"}`}>
                          {(selectedSource.health.parseSuccessRate ?? 0).toFixed(1)}%
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Parse success rate</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <p className={`text-lg font-bold font-mono ${(selectedSource.health.errorRate ?? 0) > 5 ? "text-red-600" : "text-green-600"}`}>
                        {(selectedSource.health.errorRate ?? 0).toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Error rate</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Run "Test Connection" to load real health metrics for this source.</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold">{Math.round(selectedSource.health?.eventsPerMin ?? 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Events/min</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold">{(selectedSource.health?.parseSuccessRate ?? 0).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Parse Success</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className={`text-lg font-bold ${(selectedSource.health?.errorRate ?? 0) > 0 ? "text-destructive" : "text-green-500"}`}>
                      {(selectedSource.health?.errorRate ?? 0).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">Error Rate</p>
                  </CardContent>
                </Card>
              </div>

              {sourceTrendQuery.isLoading && (
                <p className="text-[10px] text-muted-foreground animate-pulse">Loading ingestion trend...</p>
              )}
              {sourceTrendQuery.data && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Ingestion Rate — Last 24h ({sourceTrendQuery.data.sourceType})
                      {sourceTrendQuery.data.eventTypesQueried?.length > 0 && (
                        <span className="text-[9px] normal-case ml-1">
                          [{sourceTrendQuery.data.eventTypesQueried.join(", ")}]
                        </span>
                      )}
                    </p>
                    {sourceTrendQuery.data.degraded && (
                      <Badge variant="outline" className="text-[9px] text-yellow-600 border-yellow-500/30">
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" />Trend data unavailable
                      </Badge>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={sourceTrendQuery.data.buckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 9 }}
                        stroke="hsl(var(--muted-foreground))"
                        interval={3}
                      />
                      <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          fontSize: "11px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="Events"
                        stroke="hsl(217 91% 55%)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="errors"
                        name="Errors"
                        stroke="hsl(0 84% 60%)"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
