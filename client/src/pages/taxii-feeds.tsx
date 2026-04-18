import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rss,
  Plus,
  RefreshCw,
  TestTube,
  PlayCircle,
  Trash2,
  Settings,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Shield,
  Database,
  Radio,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

interface TaxiiServer {
  id: number;
  name: string;
  displayName: string;
  url: string;
  authType: "basic" | "bearer" | "none";
  username?: string;
  collectionIds: string[];
  pollIntervalHours: number;
  lastSyncedAt: string | null;
  enabled: boolean;
  status: string;
  objectCount: number;
}

interface TaxiiServerPayload {
  displayName: string;
  url: string;
  authType: "none" | "basic" | "bearer";
  username?: string;
  password?: string;
  bearerToken?: string;
  collectionIds: string[];
  pollIntervalHours: number;
  enabled: boolean;
}

const PRESET_SERVERS = [
  {
    displayName: "CISA AIS",
    url: "https://ais.cisa.dhs.gov/taxii2",
    authType: "basic" as const,
    description: "CISA Automated Indicator Sharing (AIS) — US-CERT threat indicators",
  },
  {
    displayName: "Anomali LIMO",
    url: "https://limo.anomali.com/api/v1/taxii2",
    authType: "bearer" as const,
    description: "Anomali LIMO — Free threat intelligence sharing platform",
  },
  {
    displayName: "MISP TAXII",
    url: "https://your-misp-instance.com/taxii2",
    authType: "bearer" as const,
    description: "MISP Threat Sharing Platform — configure your own instance URL",
  },
  {
    displayName: "Cyware CTIX",
    url: "https://your-ctix-instance.com/taxii",
    authType: "bearer" as const,
    description: "Cyware Collaborative Threat Intelligence Exchange",
  },
];

function statusBadge(status: string, enabled: boolean) {
  if (!enabled) return <Badge variant="outline" className="text-[9px] text-muted-foreground">Disabled</Badge>;
  if (status === "ok") return <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Connected</Badge>;
  if (status === "error") return <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30 bg-red-500/10"><XCircle className="w-2.5 h-2.5 mr-0.5" />Error</Badge>;
  return <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30 bg-amber-500/10"><Clock className="w-2.5 h-2.5 mr-0.5" />Untested</Badge>;
}

export default function TaxiiFeedsPage() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editServer, setEditServer] = useState<TaxiiServer | null>(null);
  const [expandedServer, setExpandedServer] = useState<number | null>(null);

  // Form state
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formAuthType, setFormAuthType] = useState<"none" | "basic" | "bearer">("none");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formBearerToken, setFormBearerToken] = useState("");
  const [formCollections, setFormCollections] = useState("");
  const [formPollInterval, setFormPollInterval] = useState("6");
  const [formEnabled, setFormEnabled] = useState(true);

  const { data: servers = [], isLoading, refetch } = useQuery<TaxiiServer[]>({
    queryKey: ["/api/integrations/taxii/servers"],
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: TaxiiServerPayload) => {
      const res = await apiRequest("POST", "/api/integrations/taxii/servers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      toast({ title: "TAXII Server Added", description: "Feed server configured. First poll scheduled." });
      setAddOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TaxiiServerPayload> }) => {
      const res = await apiRequest("PATCH", `/api/integrations/taxii/servers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      toast({ title: "Updated", description: "TAXII server updated." });
      setEditServer(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/integrations/taxii/servers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      toast({ title: "Deleted", description: "TAXII server removed." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/integrations/taxii/servers/${id}/test`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      if (data.success) {
        toast({ title: "Connected", description: data.message });
      } else {
        toast({ title: "Connection Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pollMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/integrations/taxii/servers/${id}/poll`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      toast({
        title: "Poll Complete",
        description: `Fetched ${data.totals?.iocCount || 0} IOCs, ${data.totals?.actorCount || 0} actors, ${data.totals?.campaignCount || 0} campaigns.`,
      });
    },
    onError: (e: Error) => toast({ title: "Poll Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setFormDisplayName("");
    setFormUrl("");
    setFormAuthType("none");
    setFormUsername("");
    setFormPassword("");
    setFormBearerToken("");
    setFormCollections("");
    setFormPollInterval("6");
    setFormEnabled(true);
  }

  function applyPreset(preset: typeof PRESET_SERVERS[0]) {
    setFormDisplayName(preset.displayName);
    setFormUrl(preset.url);
    setFormAuthType(preset.authType);
  }

  function buildFormData() {
    return {
      displayName: formDisplayName,
      url: formUrl,
      authType: formAuthType,
      username: formAuthType === "basic" ? formUsername : undefined,
      password: formAuthType === "basic" ? formPassword : undefined,
      bearerToken: formAuthType === "bearer" ? formBearerToken : undefined,
      collectionIds: formCollections.split(",").map(s => s.trim()).filter(Boolean),
      pollIntervalHours: parseInt(formPollInterval, 10) || 6,
      enabled: formEnabled,
    };
  }

  function openEdit(server: TaxiiServer) {
    setEditServer(server);
    setFormDisplayName(server.displayName);
    setFormUrl(server.url);
    setFormAuthType(server.authType || "none");
    setFormUsername(server.username || "");
    setFormPassword("");
    setFormBearerToken("");
    setFormCollections(server.collectionIds?.join(", ") || "");
    setFormPollInterval(String(server.pollIntervalHours || 6));
    setFormEnabled(server.enabled);
  }

  const totalIocs = servers.reduce((a, s) => a + (s.objectCount || 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Rss className="w-5 h-5 text-teal-400" />
            <h1 className="text-xl font-bold tracking-tight">TAXII 2.1 Feeds</h1>
            <Badge className="text-[9px] px-1.5 py-0 bg-teal-500/15 text-teal-400 border-teal-500/30">TAXII 2.1</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Configure external TAXII servers for automated STIX 2.1 threat intelligence ingestion. Supports CISA AIS, Anomali LIMO, MISP, and custom TAXII 2.1 endpoints.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-feeds">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setAddOpen(true); }} data-testid="button-add-taxii-server">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add TAXII Server
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Rss className="w-3.5 h-3.5 text-teal-400" /><span className="text-[10px] text-muted-foreground">Feed Servers</span></div>
            <span className="text-xl font-bold" data-testid="stat-server-count">{servers.length}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] text-muted-foreground">Connected</span></div>
            <span className="text-xl font-bold text-emerald-400" data-testid="stat-connected">{servers.filter(s => s.status === "ok" && s.enabled).length}</span>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Database className="w-3.5 h-3.5 text-indigo-400" /><span className="text-[10px] text-muted-foreground">IOCs Ingested</span></div>
            <span className="text-xl font-bold" data-testid="stat-iocs-ingested">{totalIocs.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Activity className="w-3.5 h-3.5 text-violet-400" /><span className="text-[10px] text-muted-foreground">Active Feeds</span></div>
            <span className="text-xl font-bold" data-testid="stat-active">{servers.filter(s => s.enabled).length}</span>
          </CardContent>
        </Card>
      </div>

      {/* Preset quick-add cards */}
      {servers.length === 0 && !isLoading && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">Quick-start with a preset TAXII server:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PRESET_SERVERS.map(preset => (
              <Card
                key={preset.displayName}
                className="border-border/40 hover:border-teal-500/30 transition-colors cursor-pointer"
                onClick={() => { applyPreset(preset); setAddOpen(true); }}
                data-testid={`card-preset-${preset.displayName.toLowerCase().replace(/\s/g, "-")}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shield className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-medium">{preset.displayName}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{preset.description}</p>
                  <Badge variant="outline" className="text-[9px] mt-2">{preset.authType}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Server list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : servers.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="p-10 text-center">
            <Rss className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No TAXII Servers Configured</p>
            <p className="text-xs text-muted-foreground mb-4">Add a TAXII 2.1 server to start ingesting STIX threat intelligence automatically.</p>
            <Button size="sm" onClick={() => { resetForm(); setAddOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add First Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map(server => {
            const isExpanded = expandedServer === server.id;
            return (
              <Card key={server.id} className="border-border/40" data-testid={`card-taxii-server-${server.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Rss className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{server.displayName}</span>
                        {statusBadge(server.status, server.enabled)}
                        <Badge variant="outline" className="text-[9px]">{server.authType}</Badge>
                        {server.objectCount > 0 && (
                          <Badge variant="outline" className="text-[9px] text-indigo-400 border-indigo-500/30">
                            <Database className="w-2.5 h-2.5 mr-0.5" />{server.objectCount} IOCs
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{server.url}</p>
                      {server.lastSyncedAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />Last sync: {new Date(server.lastSyncedAt).toLocaleString()}
                        </p>
                      )}
                      {isExpanded && (
                        <div className="mt-2 space-y-1 text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                          <div>Poll interval: every {server.pollIntervalHours} hour{server.pollIntervalHours !== 1 ? "s" : ""}</div>
                          {server.collectionIds?.length > 0 && (
                            <div>Collections: {server.collectionIds.join(", ")}</div>
                          )}
                          {server.username && <div>Username: {server.username}</div>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                        data-testid={`button-expand-${server.id}`}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => testMutation.mutate(server.id)}
                        disabled={testMutation.isPending}
                        data-testid={`button-test-${server.id}`}
                      >
                        {testMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3 mr-1" />}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => pollMutation.mutate(server.id)}
                        disabled={pollMutation.isPending || !server.enabled}
                        data-testid={`button-poll-${server.id}`}
                      >
                        {pollMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
                        Poll
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(server)}
                        data-testid={`button-edit-${server.id}`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(server.id)}
                        data-testid={`button-delete-${server.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={addOpen || !!editServer} onOpenChange={(open) => { if (!open) { setAddOpen(false); setEditServer(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editServer ? "Edit TAXII Server" : "Add TAXII Server"}</DialogTitle>
            <DialogDescription>Configure a TAXII 2.1 server to poll for STIX threat intelligence automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editServer && (
              <div>
                <Label className="text-xs text-muted-foreground">Quick Presets</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {PRESET_SERVERS.map(p => (
                    <Badge
                      key={p.displayName}
                      variant="outline"
                      className="text-[9px] cursor-pointer hover:bg-accent"
                      onClick={() => applyPreset(p)}
                      data-testid={`badge-preset-${p.displayName.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {p.displayName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="taxii-name" className="text-xs">Display Name *</Label>
              <Input
                id="taxii-name"
                value={formDisplayName}
                onChange={e => setFormDisplayName(e.target.value)}
                placeholder="e.g. CISA AIS"
                className="h-8 text-sm"
                data-testid="input-taxii-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taxii-url" className="text-xs">TAXII Server URL *</Label>
              <Input
                id="taxii-url"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                placeholder="https://example.com/taxii2"
                className="h-8 text-sm font-mono"
                data-testid="input-taxii-url"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Authentication</Label>
              <Select value={formAuthType} onValueChange={v => setFormAuthType(v as "none" | "basic" | "bearer")}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (public)</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">HTTP Basic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formAuthType === "bearer" && (
              <div className="space-y-1.5">
                <Label htmlFor="bearer-token" className="text-xs">Bearer Token / API Key</Label>
                <Input
                  id="bearer-token"
                  type="password"
                  value={formBearerToken}
                  onChange={e => setFormBearerToken(e.target.value)}
                  placeholder="Token stored securely in DB"
                  className="h-8 text-sm"
                  data-testid="input-bearer-token"
                />
              </div>
            )}

            {formAuthType === "basic" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs">Username</Label>
                  <Input id="username" value={formUsername} onChange={e => setFormUsername(e.target.value)} className="h-8 text-sm" data-testid="input-taxii-username" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">Password</Label>
                  <Input id="password" type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} className="h-8 text-sm" data-testid="input-taxii-password" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="collections" className="text-xs">Collection IDs (comma-separated, leave blank for auto-discovery)</Label>
              <Input
                id="collections"
                value={formCollections}
                onChange={e => setFormCollections(e.target.value)}
                placeholder="collection-id-1, collection-id-2"
                className="h-8 text-sm font-mono"
                data-testid="input-taxii-collections"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Poll Interval (hours)</Label>
              <Select value={formPollInterval} onValueChange={setFormPollInterval}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-poll-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Every 1 hour</SelectItem>
                  <SelectItem value="3">Every 3 hours</SelectItem>
                  <SelectItem value="6">Every 6 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="taxii-enabled"
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
                data-testid="switch-taxii-enabled"
              />
              <Label htmlFor="taxii-enabled" className="text-xs">Enable polling</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); setEditServer(null); }}>Cancel</Button>
            <Button
              size="sm"
              disabled={createMutation.isPending || updateMutation.isPending || !formDisplayName || !formUrl}
              onClick={() => {
                const data = buildFormData();
                if (editServer) {
                  updateMutation.mutate({ id: editServer.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              data-testid="button-save-taxii-server"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              {editServer ? "Save Changes" : "Add Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
