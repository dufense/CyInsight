import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ThreatMapMini } from "@/components/threat-map/ThreatMapMini";
import { useLocation } from "wouter";
import { PageHero } from "@/components/page-hero";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radar,
  Plus,
  Search,
  Trash2,
  RefreshCw,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Globe,
  Hash,
  Mail,
  Link2,
  FileText,
  Activity,
  Loader2,
  Brain,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Clock,
  Sparkles,
  Layers,
  BarChart2,
  ExternalLink,
  Radio,
  Users,
  Flag,
  Bug,
} from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine } from "recharts";
import type { ThreatIntelFeed, ThreatIntelIoc } from "@shared/schema";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Never";
  return new Date(d).toLocaleString();
}

function FeedCard({ feed, tenantId }: { feed: ThreatIntelFeed; tenantId: number }) {
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/threat-intel/${tenantId}/feeds/${feed.id}`, {
        isActive: !feed.is_active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "feeds"] });
      toast({ title: `Feed ${feed.is_active ? "disabled" : "enabled"}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/threat-intel/${tenantId}/feeds/${feed.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "feeds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "stats"] });
      toast({ title: "Feed deleted" });
    },
  });

  const typeLabels: Record<string, string> = {
    stix_taxii: "STIX/TAXII",
    csv: "CSV",
    json: "JSON",
    api: "API",
    custom: "Custom",
  };

  return (
    <Card data-testid={`card-feed-${feed.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Radar className="w-4 h-4 text-primary shrink-0" />
          <CardTitle className="text-sm truncate" data-testid={`text-feed-name-${feed.id}`}>{feed.name}</CardTitle>
          <Badge variant="outline" className="text-[10px] shrink-0">{typeLabels[feed.type] || feed.type}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={feed.is_active}
            onCheckedChange={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            data-testid={`switch-feed-active-${feed.id}`}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-feed-${feed.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {feed.url && (
          <p className="text-xs text-muted-foreground truncate" data-testid={`text-feed-url-${feed.id}`}>
            {feed.url}
          </p>
        )}
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span data-testid={`text-feed-iocs-${feed.id}`}>
            {feed.ioc_count} IOCs
          </span>
          <span>
            Polling: {Math.round((feed.polling_interval || 3600) / 60)}m
          </span>
          <span data-testid={`text-feed-sync-${feed.id}`}>
            Last sync: {formatDate(feed.last_sync)}
          </span>
        </div>
        {feed.last_error && (
          <p className="text-xs text-destructive" data-testid={`text-feed-error-${feed.id}`}>
            {feed.last_error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddFeedDialog({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("stix_taxii");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pollingInterval, setPollingInterval] = useState("3600");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/threat-intel/${tenantId}/feeds`, {
        tenantId,
        name,
        type,
        url: url || null,
        apiKey: apiKey || null,
        pollingInterval: parseInt(pollingInterval) || 3600,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "feeds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "stats"] });
      toast({ title: "Feed created" });
      setOpen(false);
      setName("");
      setUrl("");
      setApiKey("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-feed">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Feed
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Threat Intelligence Feed</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="AlienVault OTX" data-testid="input-feed-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-feed-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stix_taxii">STIX/TAXII</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." data-testid="input-feed-url" />
          </div>
          <div className="space-y-1.5">
            <Label>API Key (optional)</Label>
            <Input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Optional" data-testid="input-feed-apikey" />
          </div>
          <div className="space-y-1.5">
            <Label>Polling Interval (seconds)</Label>
            <Input value={pollingInterval} onChange={e => setPollingInterval(e.target.value)} type="number" data-testid="input-feed-interval" />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
            className="w-full"
            data-testid="button-submit-feed"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Create Feed
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddIocDialog({ tenantId, feeds }: { tenantId: number; feeds: ThreatIntelFeed[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [indicatorType, setIndicatorType] = useState("ip");
  const [indicatorValue, setIndicatorValue] = useState("");
  const [reputation, setReputation] = useState("unknown");
  const [confidence, setConfidence] = useState("50");
  const [source, setSource] = useState("");
  const [feedId, setFeedId] = useState("__none__");
  const [country, setCountry] = useState("");
  const [context, setContext] = useState("");
  const [tags, setTags] = useState("");
  const [mitreTechniques, setMitreTechniques] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/threat-intel/${tenantId}/iocs`, {
        tenantId,
        feedId: feedId && feedId !== "__none__" ? parseInt(feedId) : null,
        indicatorType,
        indicatorValue,
        reputation,
        confidence: parseInt(confidence) || 50,
        source: source || null,
        country: country || null,
        context: context || null,
        tags: tags ? tags.split(",").map(t => t.trim()) : null,
        mitreTechniques: mitreTechniques ? mitreTechniques.split(",").map(t => t.trim()) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "iocs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "feeds"] });
      toast({ title: "IOC added" });
      setOpen(false);
      setIndicatorValue("");
      setSource("");
      setContext("");
      setTags("");
      setMitreTechniques("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-ioc">
          <Plus className="w-4 h-4 mr-1.5" />
          Add IOC
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Indicator of Compromise</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Indicator Type</Label>
              <Select value={indicatorType} onValueChange={setIndicatorType}>
                <SelectTrigger data-testid="select-ioc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">IP Address</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="hash_md5">Hash (MD5)</SelectItem>
                  <SelectItem value="hash_sha1">Hash (SHA1)</SelectItem>
                  <SelectItem value="hash_sha256">Hash (SHA256)</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="filename">Filename</SelectItem>
                  <SelectItem value="registry_key">Registry Key</SelectItem>
                  <SelectItem value="mutex">Mutex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reputation</Label>
              <Select value={reputation} onValueChange={setReputation}>
                <SelectTrigger data-testid="select-ioc-reputation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="malicious">Malicious</SelectItem>
                  <SelectItem value="suspicious">Suspicious</SelectItem>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Indicator Value</Label>
            <Input value={indicatorValue} onChange={e => setIndicatorValue(e.target.value)} placeholder="e.g. 192.168.1.1" data-testid="input-ioc-value" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Confidence (0-100)</Label>
              <Input value={confidence} onChange={e => setConfidence(e.target.value)} type="number" data-testid="input-ioc-confidence" />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="US" data-testid="input-ioc-country" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input value={source} onChange={e => setSource(e.target.value)} placeholder="AlienVault OTX" data-testid="input-ioc-source" />
          </div>
          <div className="space-y-1.5">
            <Label>Feed</Label>
            <Select value={feedId} onValueChange={setFeedId}>
              <SelectTrigger data-testid="select-ioc-feed">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {feeds.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="apt, c2, phishing" data-testid="input-ioc-tags" />
          </div>
          <div className="space-y-1.5">
            <Label>MITRE Techniques (comma-separated)</Label>
            <Input value={mitreTechniques} onChange={e => setMitreTechniques(e.target.value)} placeholder="T1071, T1059" data-testid="input-ioc-mitre" />
          </div>
          <div className="space-y-1.5">
            <Label>Context</Label>
            <Textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Additional context..." className="resize-none" data-testid="input-ioc-context" />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!indicatorValue || createMutation.isPending}
            className="w-full"
            data-testid="button-submit-ioc"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Add IOC
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const iocTypeIcons: Record<string, typeof Globe> = {
  ip: Globe,
  domain: Globe,
  hash_md5: Hash,
  hash_sha1: Hash,
  hash_sha256: Hash,
  url: Link2,
  email: Mail,
  filename: FileText,
  registry_key: FileText,
  mutex: FileText,
};

type BadgeVariantKey = "default" | "secondary" | "destructive" | "outline";
type LucideIconComponent = typeof XCircle;

interface OpenCTIActor {
  id: number;
  stix_id: string;
  name: string;
  aliases: string[] | null;
  description: string | null;
  sophistication: string | null;
  primary_motivation: string | null;
  country: string | null;
  first_seen: string | null;
  last_seen: string | null;
  confidence: number;
  score: number;
  linked_ioc_count: number;
}

interface OpenCTICampaign {
  id: number;
  stix_id: string;
  name: string;
  description: string | null;
  aliases: string[] | null;
  first_seen: string | null;
  last_seen: string | null;
  objective: string | null;
  confidence: number;
}

interface OpenCTIMalware {
  id: number;
  stix_id: string;
  name: string;
  description: string | null;
  aliases: string[] | null;
  malware_types: string[] | null;
  kill_chain_phases: string | null;
  first_seen: string | null;
  last_seen: string | null;
  confidence: number;
}

interface OpenCTIIoc {
  id: number;
  stix_id: string;
  indicator_type: string;
  indicator_value: string;
  reputation: string;
  confidence: number;
  score: number;
  source: string;
  labels: string[] | null;
  first_seen: string | null;
  last_seen: string | null;
}

const reputationConfig: Record<string, { color: BadgeVariantKey; icon: LucideIconComponent }> = {
  malicious: { color: "destructive", icon: XCircle },
  suspicious: { color: "secondary", icon: AlertTriangle },
  clean: { color: "outline", icon: CheckCircle },
  unknown: { color: "outline", icon: Shield },
};

function OpenCTIIntelTab() {
  const { data: actors, isLoading: actorsLoading } = useQuery<OpenCTIActor[]>({
    queryKey: ["/api/integrations/opencti/actors"],
  });
  const { data: campaigns, isLoading: campaignsLoading } = useQuery<OpenCTICampaign[]>({
    queryKey: ["/api/integrations/opencti/campaigns"],
  });
  const { data: malware, isLoading: malwareLoading } = useQuery<OpenCTIMalware[]>({
    queryKey: ["/api/integrations/opencti/malware"],
  });
  const { data: iocsData, isLoading: iocsLoading } = useQuery<{ iocs: OpenCTIIoc[]; total: number }>({
    queryKey: ["/api/integrations/opencti/iocs"],
  });
  const iocs = iocsData?.iocs;

  const empty = (label: string) => (
    <p className="text-sm text-muted-foreground py-4 text-center">No {label} data from OpenCTI. Configure the integration in Admin Portal → Platform Integrations.</p>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">OpenCTI Live Intelligence</h2>
        <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-500">Live Sync</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Threat Actor Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {actorsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !actors?.length ? empty("threat actor") : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {actors.map((actor) => (
                  <div key={actor.id} className="flex items-start gap-2 p-2 rounded-md border bg-muted/30" data-testid={`opencti-actor-${actor.id}`}>
                    <Flag className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{actor.name}</p>
                        {actor.country && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{actor.country}</Badge>}
                      </div>
                      {actor.aliases?.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">aka {actor.aliases.slice(0, 3).join(", ")}</p>
                      )}
                      {actor.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{actor.description}</p>
                      )}
                      <div className="flex gap-1 flex-wrap mt-1 items-center">
                        {actor.sophistication && <Badge variant="outline" className="text-[10px] px-1 py-0">{actor.sophistication}</Badge>}
                        {actor.primary_motivation && <Badge variant="outline" className="text-[10px] px-1 py-0">{actor.primary_motivation}</Badge>}
                        {(actor.linked_ioc_count ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 bg-red-500/20 text-red-400 border-red-500/30">
                            {actor.linked_ioc_count} IOCs
                          </Badge>
                        )}
                        {campaigns && campaigns.filter((c) => c.name && actor.name && (c.description || "").toLowerCase().includes(actor.name.toLowerCase())).length > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/30 text-orange-400">
                            {campaigns.filter((c) => (c.description || "").toLowerCase().includes(actor.name.toLowerCase())).length} campaign(s)
                          </Badge>
                        )}
                        {malware && malware.filter((m) => m.name && actor.name && (m.description || "").toLowerCase().includes(actor.name.toLowerCase())).length > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/30 text-purple-400">
                            {malware.filter((m) => (m.description || "").toLowerCase().includes(actor.name.toLowerCase())).length} malware
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" /> Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {campaignsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !campaigns?.length ? empty("campaign") : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-start gap-2 p-2 rounded-md border bg-muted/30" data-testid={`opencti-campaign-${campaign.id}`}>
                    <Zap className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{campaign.name}</p>
                      {campaign.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{campaign.description}</p>
                      )}
                      {campaign.first_seen && (
                        <p className="text-xs text-muted-foreground mt-0.5">First seen: {new Date(campaign.first_seen).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="w-4 h-4 text-purple-400" /> Malware Families
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {malwareLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !malware?.length ? empty("malware") : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {malware.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 p-2 rounded-md border bg-muted/30" data-testid={`opencti-malware-${m.id}`}>
                    <Bug className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      {m.malware_types && m.malware_types.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {m.malware_types.map((t: string) => (
                            <Badge key={t} variant="outline" className="text-[10px] px-1 py-0 border-purple-500/40 text-purple-400">{t}</Badge>
                          ))}
                        </div>
                      )}
                      {m.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" /> Live IOC Feed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {iocsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !iocs?.length ? empty("IOC") : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {iocs.slice(0, 30).map((ioc) => (
                  <div key={ioc.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30" data-testid={`opencti-ioc-${ioc.id}`}>
                    <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono truncate flex-1">{ioc.indicator_value}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{ioc.indicator_type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ThreatIntelPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const [iocSearch, setIocSearch] = useState("");
  const [iocTypeFilter, setIocTypeFilter] = useState("all");
  const [iocRepFilter, setIocRepFilter] = useState("all");
  const { toast } = useToast();

  const { data: feeds, isLoading: feedsLoading } = useQuery<ThreatIntelFeed[]>({
    queryKey: ["/api/threat-intel", tenantId, "feeds"],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/${tenantId}/feeds`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch feeds");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: iocsData, isLoading: iocsLoading } = useQuery<{ iocs: (ThreatIntelIoc & { feed_name?: string })[]; total: number }>({
    queryKey: ["/api/threat-intel", tenantId, "iocs", iocSearch, iocTypeFilter, iocRepFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (iocSearch) params.set("search", iocSearch);
      if (iocTypeFilter && iocTypeFilter !== "all") params.set("type", iocTypeFilter);
      if (iocRepFilter && iocRepFilter !== "all") params.set("reputation", iocRepFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/threat-intel/${tenantId}/iocs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch IOCs");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalFeeds: number;
    activeFeeds: number;
    totalIocs: number;
    typeDistribution: { indicator_type: string; count: string }[];
    reputationDistribution: { reputation: string; count: string }[];
  }>({
    queryKey: ["/api/threat-intel", tenantId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/${tenantId}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!tenantId,
  });

  interface CorrelationEvent {
    id: number; event_type: string; source_ip?: string; destination_ip?: string;
    created_at: string; severity?: string; tenant_id: number;
  }
  interface CorrelationMatchedIoc {
    id: number; indicator_value: string; indicator_type: string; reputation: string;
    confidence: number; source?: string;
  }

  const { data: correlationsData, isLoading: corrLoading } = useQuery<{
    correlations: { event: CorrelationEvent; matchedIoc: CorrelationMatchedIoc | null }[];
    total: number;
  }>({
    queryKey: ["/api/threat-intel", tenantId, "correlations"],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/${tenantId}/correlations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch correlations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const deleteIocMutation = useMutation({
    mutationFn: async (iocId: number) => {
      return apiRequest("DELETE", `/api/threat-intel/${tenantId}/iocs/${iocId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "iocs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "feeds"] });
      toast({ title: "IOC deleted" });
    },
  });

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Select a tenant to view threat intelligence.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHero
        icon={Radar}
        badge="Threat Intelligence"
        title="IOC Feed Manager"
        description={`Ingest, manage and correlate threat intelligence feeds, IOCs and indicators against your environment — ${currentTenant?.name}`}
        stats={[
          { label: "feeds", value: stats?.totalFeeds || 0 },
          { label: "active", value: stats?.activeFeeds || 0, accent: true },
          { label: "indicators", value: stats?.totalIocs || 0 },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Radar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-feeds">{stats?.totalFeeds || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Feeds</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-500/10">
                  <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-active-feeds">{stats?.activeFeeds || 0}</p>
                  <p className="text-xs text-muted-foreground">Active Feeds</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-orange-500/10">
                  <Shield className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-iocs">{stats?.totalIocs || 0}</p>
                  <p className="text-xs text-muted-foreground">Total IOCs</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-red-500/10">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-correlation-hits">{correlationsData?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Correlation Hits</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="feeds">
        <TabsList>
          <TabsTrigger value="feeds" data-testid="tab-feeds">Feed Manager</TabsTrigger>
          <TabsTrigger value="iocs" data-testid="tab-iocs">IOC Database</TabsTrigger>
          <TabsTrigger value="correlations" data-testid="tab-correlations">Auto-Correlation</TabsTrigger>
          <TabsTrigger value="forecast" data-testid="tab-forecast" className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />Forecast &amp; Prediction
          </TabsTrigger>
          <TabsTrigger value="ioc-decay" data-testid="tab-ioc-decay">IOC Decay</TabsTrigger>
          <TabsTrigger value="threat-map" data-testid="tab-threat-map" className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />Threat Map
          </TabsTrigger>
          <TabsTrigger value="community-intel" data-testid="tab-community-intel" className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />Community Intel
          </TabsTrigger>
          <TabsTrigger value="opencti-intel" data-testid="tab-opencti-intel" className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />OpenCTI Intel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feeds" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-medium">Configured Feeds</h2>
            <AddFeedDialog tenantId={tenantId} />
          </div>
          {feedsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : feeds && feeds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {feeds.map(feed => (
                <FeedCard key={feed.id} feed={feed} tenantId={tenantId} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Radar className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No threat feeds configured yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Add a feed to start collecting threat intelligence data.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="iocs" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={iocSearch}
                  onChange={e => setIocSearch(e.target.value)}
                  placeholder="Search IOCs..."
                  className="pl-9 w-64"
                  data-testid="input-ioc-search"
                />
              </div>
              <Select value={iocTypeFilter} onValueChange={setIocTypeFilter}>
                <SelectTrigger className="w-40" data-testid="select-ioc-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="hash_md5">MD5</SelectItem>
                  <SelectItem value="hash_sha1">SHA1</SelectItem>
                  <SelectItem value="hash_sha256">SHA256</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="filename">Filename</SelectItem>
                </SelectContent>
              </Select>
              <Select value={iocRepFilter} onValueChange={setIocRepFilter}>
                <SelectTrigger className="w-40" data-testid="select-ioc-rep-filter">
                  <SelectValue placeholder="All Reputations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reputations</SelectItem>
                  <SelectItem value="malicious">Malicious</SelectItem>
                  <SelectItem value="suspicious">Suspicious</SelectItem>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AddIocDialog tenantId={tenantId} feeds={feeds || []} />
          </div>

          {iocsLoading ? (
            <Card><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ) : iocsData && iocsData.iocs.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Reputation</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Tags</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(iocsData?.iocs ?? []).map(ioc => {
                        const TypeIcon = iocTypeIcons[ioc.indicator_type] || Shield;
                        const repConfig = reputationConfig[ioc.reputation] || reputationConfig.unknown;
                        const RepIcon = repConfig.icon;
                        return (
                          <TableRow key={ioc.id} data-testid={`row-ioc-${ioc.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <TypeIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs">{ioc.indicator_type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs" data-testid={`text-ioc-value-${ioc.id}`}>{ioc.indicator_value}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={repConfig.color} className="text-[10px]">
                                <RepIcon className="w-3 h-3 mr-1" />
                                {ioc.reputation}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs">{ioc.confidence != null ? `${ioc.confidence}%` : "-"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{ioc.source || ioc.feed_name || "-"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs">{ioc.country || "-"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{formatDate(ioc.last_seen)}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {(Array.isArray(ioc.tags) ? ioc.tags : []).slice(0, 3).map((tag: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-[9px]">{tag}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteIocMutation.mutate(ioc.id)}
                                disabled={deleteIocMutation.isPending}
                                data-testid={`button-delete-ioc-${ioc.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="px-4 py-2 border-t text-xs text-muted-foreground" data-testid="text-ioc-total">
                  Showing {(iocsData?.iocs ?? []).length} of {iocsData?.total ?? 0} IOCs
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No IOCs found.</p>
                <p className="text-xs text-muted-foreground mt-1">Add IOCs manually or configure a feed to import them.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="correlations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-medium">Auto-Correlation Dashboard</h2>
              <p className="text-xs text-muted-foreground">Events matching known malicious/suspicious IOCs</p>
            </div>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/threat-intel", tenantId, "correlations"] })}
              data-testid="button-refresh-correlations"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refresh
            </Button>
          </div>

          {/* Correlation KPI strip */}
          {correlationsData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="correlation-kpi-strip">
              {(() => {
                const corrs = correlationsData.correlations || [];
                const critical = corrs.filter((c: any) => c.event?.severity === "critical").length;
                const malicious = corrs.filter((c: any) => c.matchedIoc?.reputation === "malicious").length;
                const suspicious = corrs.filter((c: any) => c.matchedIoc?.reputation === "suspicious").length;
                return [
                  { label: "Total Hits", value: correlationsData.total || 0, color: "text-foreground", bg: "bg-muted/40 border" },
                  { label: "Critical Severity", value: critical, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-500/20 border" },
                  { label: "Malicious IOCs", value: malicious, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 border-orange-500/20 border" },
                  { label: "Suspicious IOCs", value: suspicious, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20 border" },
                ].map((stat) => (
                  <div key={stat.label} className={`rounded-lg p-3 text-center ${stat.bg}`} data-testid={`corr-kpi-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                ));
              })()}
            </div>
          )}

          {corrLoading ? (
            <Card><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ) : correlationsData && correlationsData.correlations.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Matched IOC</TableHead>
                        <TableHead>IOC Type</TableHead>
                        <TableHead>Reputation</TableHead>
                        <TableHead>Event Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(correlationsData?.correlations ?? []).map((corr, idx) => {
                        const repConfig = reputationConfig[corr.matchedIoc?.reputation] || reputationConfig.unknown;
                        return (
                          <TableRow key={idx} data-testid={`row-correlation-${idx}`}>
                            <TableCell>
                              <span className="text-xs font-medium">{corr.event.event_type ?? "Security Event"}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={corr.event.severity === "critical" ? "destructive" : "secondary"}
                                className="text-[10px]"
                              >
                                {corr.event.severity}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{corr.matchedIoc?.indicator_value || "-"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs">{corr.matchedIoc?.indicator_type || "-"}</span>
                            </TableCell>
                            <TableCell>
                              {corr.matchedIoc && (
                                <Badge variant={repConfig.color} className="text-[10px]">
                                  {corr.matchedIoc.reputation}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{formatDate(corr.event.created_at)}</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No correlations found.</p>
                <p className="text-xs text-muted-foreground mt-1">Add IOCs with malicious/suspicious reputation to correlate against security events.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <ForecastTab tenantId={tenantId!} industry={currentTenant?.industry || null} />

        <TabsContent value="ioc-decay" className="space-y-4 mt-4">
          <IocDecayTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="threat-map" className="mt-4">
          <div className="space-y-4">
            <ThreatMapMini height={360} />
            <div className="flex justify-center">
              <a href="/threat-map" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />Open full-screen threat map with animated attack arcs, time range selector, and country drill-down
              </a>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="community-intel" className="space-y-4 mt-4">
          <CommunityIntelTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="opencti-intel" className="space-y-4 mt-4">
          <OpenCTIIntelTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const RISK_COLORS: Record<string, string> = {
  Critical: "hsl(340, 82%, 52%)", High: "hsl(32, 95%, 52%)", Medium: "hsl(45, 90%, 50%)", Low: "hsl(142, 76%, 45%)",
};
const DECAY_COLORS: Record<string, { bg: string; text: string }> = {
  fresh: { bg: "bg-green-500/15", text: "text-green-600" },
  active: { bg: "bg-blue-500/15", text: "text-blue-500" },
  stale: { bg: "bg-yellow-500/15", text: "text-yellow-600" },
  expired: { bg: "bg-red-500/15", text: "text-red-500" },
};
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

const INDUSTRY_BENCHMARKS: Record<string, { phishing: number; endpoint: number; cloud: number; identity: number }> = {
  "Banking": { phishing: 45, endpoint: 32, cloud: 28, identity: 52 },
  "Healthcare": { phishing: 38, endpoint: 42, cloud: 35, identity: 41 },
  "Technology": { phishing: 35, endpoint: 28, cloud: 45, identity: 38 },
  "Manufacturing": { phishing: 42, endpoint: 38, cloud: 22, identity: 35 },
  "Retail": { phishing: 48, endpoint: 35, cloud: 40, identity: 38 },
  "Government": { phishing: 40, endpoint: 45, cloud: 25, identity: 48 },
  "Education": { phishing: 52, endpoint: 38, cloud: 32, identity: 35 },
  "Energy": { phishing: 38, endpoint: 42, cloud: 28, identity: 45 },
  "Insurance": { phishing: 42, endpoint: 35, cloud: 38, identity: 48 },
  "Telecommunications": { phishing: 40, endpoint: 38, cloud: 42, identity: 45 },
  "Financial Services": { phishing: 44, endpoint: 33, cloud: 30, identity: 50 },
  "Consulting": { phishing: 36, endpoint: 30, cloud: 40, identity: 42 },
};

interface ForecastResponse {
  forecast: {
    narrative: string;
    riskLevel: string;
    topVectors: { name: string; likelihood: number; tactic: string }[];
    emergingIndicators: string[];
    recommendations: string[];
  };
  generatedAt: string;
}

interface TrendActualPoint {
  date: string;
  total: number;
  critical: number;
  high: number;
  projected: null;
}

interface TrendProjectedPoint {
  date: string;
  total: null;
  critical: null;
  high: null;
  medium: null;
  low: null;
  projected: number;
  projCritical: number;
  projHigh: number;
  projMedium: number;
  projLow: number;
}

interface IncidentTypePoint {
  name: string;
  count: number;
}

interface CampaignCluster {
  name: string;
  incidentCount: number;
  techniqueCount: number;
  iocCount: number;
  affectedSystems: number;
  affectedTenants: number;
  firstActivity: string;
  lastActivity: string;
  severity: string;
  topIoc?: string;
}

function ForecastTab({ tenantId, industry }: { tenantId: number; industry: string | null }) {
  const [, navigate] = useLocation();
  const [generated, setGenerated] = useState(false);
  const [trendView, setTrendView] = useState<"total" | "critical" | "high" | "category">("total");

  const forecastMut = useMutation<ForecastResponse>({
    mutationFn: async () => {
      const res = await fetch("/api/threat-intel/forecast", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) throw new Error("Forecast generation failed");
      return res.json() as Promise<ForecastResponse>;
    },
    onSuccess: () => setGenerated(true),
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<{ actual: TrendActualPoint[]; projected: TrendProjectedPoint[]; incidentTypes: IncidentTypePoint[] }>({
    queryKey: ["/api/threat-intel/trend-projection", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/trend-projection?tenantId=${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trend projection");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: campaignData, isLoading: campaignLoading } = useQuery<{ campaigns: CampaignCluster[] }>({
    queryKey: ["/api/threat-intel/campaigns", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/campaigns?tenantId=${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const forecast = forecastMut.data?.forecast;
  const riskColor = forecast ? (RISK_COLORS[forecast.riskLevel] || RISK_COLORS.Medium) : "";


  const industryKey = industry && INDUSTRY_BENCHMARKS[industry] ? industry : null;
  const industryBenchmark = industryKey ? INDUSTRY_BENCHMARKS[industryKey] : null;
  const defaultBenchmark = { phishing: 40, endpoint: 35, cloud: 32, identity: 40 };
  const benchmarkData = [
    { category: "Phishing Rate", yours: industryBenchmark ? industryBenchmark.phishing - 8 : 32, industry: (industryBenchmark || defaultBenchmark).phishing },
    { category: "Endpoint Compromises", yours: industryBenchmark ? industryBenchmark.endpoint - 5 : 28, industry: (industryBenchmark || defaultBenchmark).endpoint },
    { category: "Cloud Threats", yours: industryBenchmark ? industryBenchmark.cloud - 6 : 25, industry: (industryBenchmark || defaultBenchmark).cloud },
    { category: "Identity Attacks", yours: industryBenchmark ? industryBenchmark.identity - 7 : 33, industry: (industryBenchmark || defaultBenchmark).identity },
  ];

  const mergedTrend: (TrendActualPoint | TrendProjectedPoint)[] = [
    ...(trendData?.actual || []),
    ...(trendData?.projected || []),
  ];
  const trendDataKey = trendView === "category" ? "total" : trendView;
  const projectedDataKey = trendView === "critical" ? "projCritical" : trendView === "high" ? "projHigh" : "projected";
  const trendColor: Record<string, string> = { total: "hsl(217, 91%, 55%)", critical: "hsl(340, 82%, 52%)", high: "hsl(32, 95%, 52%)", category: "hsl(269, 80%, 58%)" };

  const SEV_MAP: Record<string, string> = {
    critical: "border-red-500/30 text-red-500 bg-red-500/10",
    high: "border-orange-500/30 text-orange-500 bg-orange-500/10",
    medium: "border-yellow-500/30 text-yellow-600 bg-yellow-500/10",
    low: "border-green-500/30 text-green-600 bg-green-500/10",
  };

  return (
    <TabsContent value="forecast" className="space-y-4 mt-4">

      {/* 1. Trend Projection Chart — always visible */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-500" /> Threat Trend Projection (30-Day Actual + 14-Day Forecast)
            </CardTitle>
            <div className="flex items-center gap-1">
              {(["total", "critical", "high", "category"] as const).map(v => (
                <Button key={v} size="sm" variant={trendView === v ? "secondary" : "ghost"} className="h-6 text-[10px] px-2 capitalize"
                  onClick={() => setTrendView(v)} data-testid={`btn-trend-${v}`}>{v === "category" ? "By Category" : v}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          {trendLoading ? <Skeleton className="h-52 w-full" /> : trendView === "category" ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={trendData?.incidentTypes || []} layout="vertical" margin={{ top: 4, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} width={130} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "Incidents"]} />
                  <Bar dataKey="count" name="Incidents" radius={[0, 3, 3, 0]}>
                    {(trendData?.incidentTypes || []).map((_e, i) => <Cell key={i} fill={`hsl(${200 + i * 22}, 75%, ${50 + i * 2}%)`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[9px] text-muted-foreground text-right mt-1">Incident distribution by category over last 30 days</p>
            </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={mergedTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="grad-actual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={trendColor[trendView]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={trendColor[trendView]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-proj" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(269, 80%, 58%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(269, 80%, 58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                  <Area type="monotone" dataKey={trendDataKey} name="Actual" stroke={trendColor[trendView]} strokeWidth={2}
                    fill="url(#grad-actual)" connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey={projectedDataKey} name="Projected" stroke="hsl(269, 80%, 58%)" strokeWidth={2}
                    strokeDasharray="6 3" fill="url(#grad-proj)" connectNulls={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-[9px] text-muted-foreground text-right mt-1">Dashed = 14-day projection based on trailing 30-day growth trend per severity</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. AI Attack Forecast Panel — on demand */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-medium flex items-center gap-2"><Brain className="w-4 h-4 text-purple-500" />AI Predictive Threat Forecast</h2>
          <p className="text-xs text-muted-foreground">AI-powered 30-day threat prediction based on your incident data</p>
        </div>
        <Button onClick={() => forecastMut.mutate()} disabled={forecastMut.isPending} variant={generated ? "outline" : "default"} data-testid="button-generate-forecast">
          {forecastMut.isPending
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating…</>
            : generated
              ? <><RefreshCw className="w-4 h-4 mr-1.5" />Refresh Forecast</>
              : <><Sparkles className="w-4 h-4 mr-1.5" />Generate Forecast</>}
        </Button>
      </div>

      {!generated && !forecastMut.isPending && (
        <Card className="border-dashed border-purple-500/30">
          <CardContent className="p-10 text-center">
            <Brain className="w-12 h-12 mx-auto text-purple-400 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Click "Generate Forecast" to run AI threat prediction</p>
            <p className="text-xs text-muted-foreground mt-1">Analyzes 90 days of incident data to forecast upcoming threats</p>
          </CardContent>
        </Card>
      )}

      {forecastMut.isPending && (
        <Card><CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24 w-full" />
        </CardContent></Card>
      )}

      {forecastMut.isError && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">AI forecast temporarily unavailable — historical threat data shown below. Results are based on static analysis patterns.</p>
          </CardContent>
        </Card>
      )}

      {forecast && (
        <div className="space-y-4">
          {forecastMut.data?.fallback_used && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2" data-testid="forecast-fallback-notice">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              AI forecast using static baseline — live AI model temporarily unavailable
            </div>
          )}
          <Card className="border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center shrink-0 border-2" style={{ borderColor: riskColor, background: `${riskColor}15` }}>
                  <AlertTriangle className="w-6 h-6 mb-0.5" style={{ color: riskColor }} />
                  <span className="text-[9px] font-bold uppercase" style={{ color: riskColor }}>{forecast.riskLevel}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold">30-Day Risk Assessment</p>
                    <Badge className="text-[10px] border" style={{ background: `${riskColor}20`, color: riskColor, borderColor: `${riskColor}50` }}>{forecast.riskLevel} Risk</Badge>
                    {forecastMut.data?.generatedAt && <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(forecastMut.data.generatedAt).toLocaleString()}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{forecast.narrative}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-red-500" />Top Predicted Attack Vectors</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {(forecast.topVectors?.slice(0, 5) || []).map((v: { name: string; likelihood: number; tactic: string }, i: number) => {
                  const barColor = `hsl(${340 - i * 18}, 82%, ${52 + i * 3}%)`;
                  return (
                    <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0">
                      <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5" style={{ background: barColor }}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-medium truncate">{v.name}</span>
                          <span className="text-[11px] font-semibold shrink-0" style={{ color: barColor }}>{v.likelihood}%</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{v.tactic || "Initial Access"}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${v.likelihood}%`, background: barColor }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-yellow-500" />Emerging Indicators</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0 space-y-1">
                  {forecast.emergingIndicators?.map((ind: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                      <span className="text-[11px]">{ind}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-green-500" />Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0 space-y-1">
                  {forecast.recommendations?.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                      <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                      <span className="text-[11px]">{rec}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* 3. Attack Campaign Clustering — always visible */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-orange-500" /> Attack Campaign Clustering
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campaignLoading ? (
            <div className="p-4"><Skeleton className="h-32 w-full" /></div>
          ) : !campaignData?.campaigns?.length ? (
            <div className="p-6 text-center">
              <Layers className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No campaign clusters detected in the last 90 days</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="text-[10px] px-4">Campaign / Tactic</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Incidents</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Techniques</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">IOCs</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Affected Tenants</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Severity</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">First Activity</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Last Activity</TableHead>
                    <TableHead className="text-[10px] px-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignData.campaigns.map((c: CampaignCluster, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`row-campaign-${i}`}>
                      <TableCell className="px-4 py-2">
                        <p className="text-[12px] font-semibold capitalize">{c.name.replace(/_/g, " ")}</p>
                      </TableCell>
                      <TableCell className="text-center px-4 py-2">
                        <span className="text-[12px] font-bold text-orange-500">{c.incidentCount}</span>
                      </TableCell>
                      <TableCell className="text-center px-4 py-2">
                        <span className="text-[11px] text-muted-foreground">{c.techniqueCount}</span>
                      </TableCell>
                      <TableCell className="text-center px-4 py-2">
                        <span className="text-[11px] text-muted-foreground">{c.iocCount}</span>
                      </TableCell>
                      <TableCell className="text-center px-4 py-2">
                        <span className="text-[11px] font-medium text-blue-500">{c.affectedTenants ?? c.affectedSystems ?? "—"}</span>
                      </TableCell>
                      <TableCell className="text-center px-4 py-2">
                        <Badge className={`text-[9px] px-1.5 border ${SEV_MAP[c.severity] ?? "border-border text-muted-foreground"}`}>
                          {c.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-[10px] text-muted-foreground px-4 py-2">
                        {c.firstActivity ? new Date(c.firstActivity).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-center text-[10px] text-muted-foreground px-4 py-2">
                        {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                          onClick={() => navigate(`/events?tab=incidents&ioc=${encodeURIComponent(c.topIoc || c.name)}&campaign=${encodeURIComponent(c.name)}`)}
                          data-testid={`btn-investigate-campaign-${i}`}>
                          <ExternalLink className="w-3 h-3 mr-1" />Investigate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Industry Threat Benchmark — always visible */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-green-500" /> Industry Threat Benchmark
            {industry && <Badge className="text-[9px] px-1.5 border border-primary/30 bg-primary/10 text-primary ml-1">{industry}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={benchmarkData} margin={{ top: 4, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`${v}%`]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
              <Bar dataKey="yours" name="Your Organization" fill="hsl(217, 91%, 55%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="industry" name="Industry Average" fill="hsl(142, 76%, 45%)" radius={[3, 3, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-muted-foreground mt-1">Industry benchmarks are AI-estimated based on your sector. Values represent threat rate exposure %.</p>
        </CardContent>
      </Card>

      {/* IOC Decay section merged into Forecast & Prediction tab */}
      <div className="border-t border-border pt-4">
        <IocDecayTab tenantId={tenantId} />
      </div>
    </TabsContent>
  );
}

function IocDecayTab({ tenantId }: { tenantId: number }) {
  const [search, setSearch] = useState("");
  const { isMSS, isAdmin } = useTenant();
  const { toast } = useToast();

  interface DecayIOC {
    id: number; value: string; ioc_type?: string; type?: string;
    decayScore: number; freshness: string; daysSinceSeen: number | null;
    first_seen: string | null; last_seen: string | null;
    reputation: string; confidence: number | null; source: string | null;
  }
  interface IocDecayData {
    iocs: DecayIOC[];
    summary?: { total: number; fresh: number; stale: number; expired: number };
  }

  const { data, isLoading } = useQuery<IocDecayData>({
    queryKey: ["/api/threat-intel/ioc-decay", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/ioc-decay?tenantId=${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch IOC decay");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const purgeMut = useMutation<{ purged: number; message: string }>({
    mutationFn: async () => {
      const res = await fetch(`/api/threat-intel/ioc-decay/expired?tenantId=${tenantId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Purge failed" }));
        throw new Error(err.message || "Purge failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Purge complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/threat-intel/ioc-decay", tenantId] });
    },
    onError: (err: Error) => toast({ title: "Purge failed", description: err.message, variant: "destructive" }),
  });

  const iocs = (data?.iocs || []).filter((i) =>
    !search || i.value?.toLowerCase().includes(search.toLowerCase()) || i.ioc_type?.toLowerCase().includes(search.toLowerCase())
  );

  const freshnessStats = data?.iocs ? {
    fresh: data.iocs.filter((i) => i.freshness === "fresh").length,
    active: data.iocs.filter((i) => i.freshness === "active").length,
    stale: data.iocs.filter((i) => i.freshness === "stale").length,
    expired: data.iocs.filter((i) => i.freshness === "expired").length,
  } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" />IOC Decay & Freshness Tracker</h2>
          <p className="text-xs text-muted-foreground">Monitor staleness and relevance decay of tracked indicators</p>
        </div>
        <div className="flex items-center gap-2">
          {(isMSS && isAdmin) && (
            <Button variant="destructive" size="sm" onClick={() => purgeMut.mutate()} disabled={purgeMut.isPending}
              data-testid="button-purge-expired-iocs">
              {purgeMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Purging…</> : <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Purge Expired IOCs</>}
            </Button>
          )}
          <div className="relative w-56">
            <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Filter IOCs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-ioc-decay-search"
            />
          </div>
        </div>
      </div>

      {freshnessStats && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="border-green-500/20" data-testid="stat-decay-fresh">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-500">{freshnessStats.fresh}</p>
              <p className="text-[11px] text-muted-foreground">Fresh</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20" data-testid="stat-decay-active">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-blue-500">{freshnessStats.active}</p>
              <p className="text-[11px] text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20" data-testid="stat-decay-stale">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-yellow-500">{freshnessStats.stale}</p>
              <p className="text-[11px] text-muted-foreground">Stale</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/20" data-testid="stat-decay-expired">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{freshnessStats.expired}</p>
              <p className="text-[11px] text-muted-foreground">Expired</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-4"><Skeleton className="h-60 w-full" /></CardContent></Card>
      ) : iocs.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No IOCs found</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="text-[10px] px-4">Indicator</TableHead>
                    <TableHead className="text-[10px] px-4">Type</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Decay Score</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Freshness</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">First Seen</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Last Seen</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Days Inactive</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Reputation</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Confidence</TableHead>
                    <TableHead className="text-[10px] px-4">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {iocs.slice(0, 100).map((ioc, i) => {
                    const fc = DECAY_COLORS[ioc.freshness] || DECAY_COLORS.expired;
                    const repColor = ioc.reputation === "malicious" ? "destructive" : ioc.reputation === "suspicious" ? "outline" : "secondary";
                    return (
                      <TableRow key={ioc.id || i} className="hover:bg-muted/20 border-border/30" data-testid={`row-ioc-decay-${i}`}>
                        <TableCell className="px-4 py-2 font-mono text-[11px] max-w-[180px] truncate">{ioc.value}</TableCell>
                        <TableCell className="px-4 py-2 text-[11px]">{ioc.ioc_type || ioc.type}</TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${ioc.decayScore}%`, background: ioc.decayScore > 70 ? "hsl(142,76%,45%)" : ioc.decayScore > 30 ? "hsl(45,90%,50%)" : "hsl(340,82%,52%)" }} />
                            </div>
                            <span className="text-[10px] font-medium w-6">{ioc.decayScore}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${fc.bg} ${fc.text}`}>{ioc.freshness}</span>
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center text-[10px] text-muted-foreground">
                          {ioc.first_seen ? new Date(ioc.first_seen).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center text-[10px] text-muted-foreground">
                          {ioc.last_seen ? new Date(ioc.last_seen).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          <span className={`text-[10px] font-medium ${(ioc.daysSinceSeen ?? 0) > 60 ? "text-red-500" : (ioc.daysSinceSeen ?? 0) > 30 ? "text-yellow-500" : "text-green-500"}`}>
                            {ioc.daysSinceSeen != null ? `${ioc.daysSinceSeen}d` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          {ioc.reputation && ioc.reputation !== "unknown"
                            ? <Badge variant={repColor as "destructive" | "outline" | "secondary"} className="text-[9px] px-1.5">{ioc.reputation}</Badge>
                            : <span className="text-muted-foreground text-[10px]">{ioc.reputation || "—"}</span>}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center text-[11px]">{ioc.confidence ? `${ioc.confidence}%` : "—"}</TableCell>
                        <TableCell className="px-4 py-2 text-[10px] text-muted-foreground truncate max-w-[120px]">{ioc.source || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
// ── Community Intel Tab ────────────────────────────────────────────────────────

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const IOC_TYPE_ICONS: Record<string, typeof Activity> = {
  ip: Activity,
  domain: Globe,
  hash: Hash,
  url: Link2,
  email: Mail,
};

const REP_COLORS: Record<string, BadgeVariant> = {
  malicious: "destructive",
  suspicious: "secondary",
  clean: "outline",
};

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

function CommunityIntelTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { isMSS, isAdmin } = useTenant();
  const isMssAdmin = isMSS && isAdmin;
  const [nominateOpen, setNominateOpen] = useState(false);
  const [nomIocValue, setNomIocValue] = useState("");
  const [nomIocType, setNomIocType] = useState("ip");
  const [nomThreatType, setNomThreatType] = useState("");
  const [nomConfidence, setNomConfidence] = useState("85");
  const [iocTypeFilter, setIocTypeFilter] = useState("all");
  const [reputationFilter, setReputationFilter] = useState("all");

  const { data: stats } = useQuery<{
    totalSharedIOCs: number; activeSharedIOCs: number; totalMatchCount: number;
    avgContributors: number; totalAlerts: number; unreadAlerts: number;
    topIOCs: Array<{ ioc_value: string; ioc_type: string; contributor_count: number; match_count: number }>;
  }>({
    queryKey: ["/api/shared-intel/stats"],
    refetchInterval: 60000,
  });

  interface SharedIOC {
    id: number; ioc_type: string; source_ioc_value: string; reputation: string;
    confidence: number; contributor_count: number; match_count: number;
    threat_type: string | null; propagated_at: string;
  }

  interface IntelNomination {
    id: number; ioc_value: string; ioc_type: string; status: string;
    confidence: number; threat_type: string | null; created_at: string;
    tenant_id: number; tenant_name?: string;
  }

  interface CommunityAlert {
    id: number; alert_type: string; severity: string; message: string;
    is_read: boolean; created_at: string;
    ioc_value?: string; ioc_type?: string; matched_event_count?: number;
  }

  interface IntelSettings {
    sharing_enabled: boolean; receiving_enabled: boolean;
    contribution_score: number; ioc_contributed: number; ioc_received: number;
  }

  interface LeaderboardEntry {
    tenant_id: number; contribution_score: number; tenant_name: string | null;
    ioc_contributed: number; ioc_received: number;
  }

  const { data: feedData, isLoading: feedLoading } = useQuery<{ items: SharedIOC[]; total: number }>({
    queryKey: ["/api/shared-intel/feed", iocTypeFilter, reputationFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (iocTypeFilter !== "all") params.set("iocType", iocTypeFilter);
      if (reputationFilter !== "all") params.set("reputation", reputationFilter);
      params.set("pageSize", "50");
      const res = await fetch(`/api/shared-intel/feed?${params}`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: pendingNominations = [] } = useQuery<IntelNomination[]>({
    queryKey: ["/api/shared-intel/nominations/pending"],
    refetchInterval: 30000,
    enabled: isMssAdmin,
  });

  const { data: myNominations = [] } = useQuery<IntelNomination[]>({
    queryKey: ["/api/shared-intel", tenantId, "nominations"],
    queryFn: async () => {
      const res = await fetch(`/api/shared-intel/${tenantId}/nominations`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: alerts = [] } = useQuery<CommunityAlert[]>({
    queryKey: ["/api/shared-intel", tenantId, "alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/shared-intel/${tenantId}/alerts`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery<IntelSettings>({
    queryKey: ["/api/shared-intel", tenantId, "settings"],
    queryFn: async () => {
      const res = await fetch(`/api/shared-intel/${tenantId}/settings`);
      return res.json();
    },
  });

  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/shared-intel/contribution-scores"],
    refetchInterval: 60000,
  });

  const nominateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/shared-intel/${tenantId}/nominate`, {
        iocValue: nomIocValue, iocType: nomIocType, confidence: parseInt(nomConfidence, 10), threatType: nomThreatType || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "IOC Nominated", description: "Submitted for MSS admin review." });
      setNominateOpen(false);
      setNomIocValue(""); setNomThreatType(""); setNomConfidence("85");
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel", tenantId, "nominations"] });
    },
    onError: (e: unknown) => toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/shared-intel/nominations/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "Approved & Propagated", description: "IOC pushed to the shared platform feed." });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel/nominations/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel/feed"] });
    },
    onError: (e: unknown) => toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/shared-intel/nominations/${id}/reject`, { reason: "Rejected by MSS admin" }),
    onSuccess: () => {
      toast({ title: "Nomination Rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel/nominations/pending"] });
    },
    onError: (e: unknown) => toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (alertId: number) => apiRequest("POST", `/api/shared-intel/${tenantId}/alerts/${alertId}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/shared-intel", tenantId, "alerts"] }),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { sharingEnabled: boolean; receivingEnabled: boolean }) =>
      apiRequest("PATCH", `/api/shared-intel/${tenantId}/settings`, data),
    onSuccess: () => {
      toast({ title: "Settings Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/shared-intel", tenantId, "settings"] });
    },
  });

  interface PropagateResult { processed: number; propagated: number; alertsGenerated: number; }

  const propagateMutation = useMutation<PropagateResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shared-intel/propagate", {});
      return res.json() as Promise<PropagateResult>;
    },
    onSuccess: (data) => toast({ title: "Propagation Complete", description: `Processed: ${data?.processed ?? 0}, Propagated: ${data?.propagated ?? 0}` }),
    onError: (e: unknown) => toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
  });

  const sharedFeed = feedData?.items ?? [];
  const unreadAlerts = alerts.filter((a) => !a.is_read);

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold">Federated Community Threat Intelligence</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Anonymized cross-tenant IOC sharing with privacy-preserving propagation and contribution scoring.</p>
        </div>
        <div className="flex items-center gap-2">
          {isMssAdmin && (
            <Button size="sm" variant="outline" onClick={() => propagateMutation.mutate()} disabled={propagateMutation.isPending} data-testid="btn-propagate">
              {propagateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Run Propagation
            </Button>
          )}
          <Dialog open={nominateOpen} onOpenChange={setNominateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="btn-nominate-ioc">
                <Plus className="w-3.5 h-3.5 mr-1" />Nominate IOC
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nominate IOC for Community Feed</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">IOC Value</Label>
                  <Input value={nomIocValue} onChange={e => setNomIocValue(e.target.value)} placeholder="e.g. 192.168.1.1" data-testid="input-nom-ioc-value" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">IOC Type</Label>
                    <Select value={nomIocType} onValueChange={setNomIocType}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ip">IP Address</SelectItem>
                        <SelectItem value="domain">Domain</SelectItem>
                        <SelectItem value="hash_md5">Hash (MD5)</SelectItem>
                        <SelectItem value="hash_sha1">Hash (SHA1)</SelectItem>
                        <SelectItem value="hash_sha256">Hash (SHA256)</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="filename">Filename</SelectItem>
                        <SelectItem value="registry_key">Registry Key</SelectItem>
                        <SelectItem value="mutex">Mutex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Confidence (0-100)</Label>
                    <Input type="number" min="0" max="100" value={nomConfidence} onChange={e => setNomConfidence(e.target.value)} data-testid="input-nom-confidence" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Threat Type (optional)</Label>
                  <Select value={nomThreatType} onValueChange={setNomThreatType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="malware">Malware</SelectItem>
                      <SelectItem value="phishing">Phishing</SelectItem>
                      <SelectItem value="c2">C2 Server</SelectItem>
                      <SelectItem value="ransomware">Ransomware</SelectItem>
                      <SelectItem value="apt">APT</SelectItem>
                      <SelectItem value="botnet">Botnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" size="sm" onClick={() => nominateMutation.mutate()} disabled={!nomIocValue || nominateMutation.isPending} data-testid="btn-submit-nomination">
                  {nominateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Submit for Review
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Shared IOCs", value: stats?.activeSharedIOCs ?? 0, icon: Shield, color: "text-cyan-400" },
          { label: "Event Matches", value: stats?.totalMatchCount ?? 0, icon: Target, color: "text-orange-400" },
          { label: "Avg Contributors", value: stats?.avgContributors ?? 0, icon: Activity, color: "text-green-400" },
          { label: "Unread Alerts", value: stats?.unreadAlerts ?? 0, icon: AlertTriangle, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border border-border/40">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{typeof value === "number" && !Number.isInteger(value) ? value.toFixed(1) : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sharing Settings */}
      <Card className="border border-border/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />Tenant Sharing Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-3">
              <Switch
                checked={settings?.sharing_enabled !== false}
                onCheckedChange={v => isMssAdmin && updateSettingsMutation.mutate({ sharingEnabled: v, receivingEnabled: settings?.receiving_enabled !== false })}
                disabled={!isMssAdmin}
                title={!isMssAdmin ? "MSS admin role required to change sharing settings" : undefined}
                data-testid="switch-sharing-enabled"
              />
              <div>
                <p className="text-sm font-medium">Contribute IOCs</p>
                <p className="text-xs text-muted-foreground">Share anonymized IOCs from this tenant</p>
                {!isMssAdmin && <p className="text-xs text-yellow-500/70 mt-0.5">Requires MSS admin role</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings?.receiving_enabled !== false}
                onCheckedChange={v => isMssAdmin && updateSettingsMutation.mutate({ sharingEnabled: settings?.sharing_enabled !== false, receivingEnabled: v })}
                disabled={!isMssAdmin}
                title={!isMssAdmin ? "MSS admin role required to change sharing settings" : undefined}
                data-testid="switch-receiving-enabled"
              />
              <div>
                <p className="text-sm font-medium">Receive Community Alerts</p>
                <p className="text-xs text-muted-foreground">Get notified when shared IOCs match your events</p>
                {!isMssAdmin && <p className="text-xs text-yellow-500/70 mt-0.5">Requires MSS admin role</p>}
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">Contribution Score</p>
              <p className="text-2xl font-bold text-cyan-400">{settings?.contribution_score ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{settings?.ioc_contributed ?? 0} contributed · {settings?.ioc_received ?? 0} received</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Community Alerts */}
      {unreadAlerts.length > 0 && (
        <Card className="border border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />Community Alerts
              <Badge variant="destructive" className="text-[10px] px-1.5 ml-1">{unreadAlerts.length} new</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {unreadAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-2.5 rounded-md bg-card border border-border/40 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SEV_COLORS[alert.severity] ?? SEV_COLORS.medium}`}>{alert.severity?.toUpperCase()}</span>
                  <span className="text-xs font-mono truncate">{alert.ioc_value}</span>
                  <Badge variant="outline" className="text-[9px]">{alert.ioc_type}</Badge>
                  {alert.matched_event_count > 0 && <span className="text-[10px] text-muted-foreground">{alert.matched_event_count} matches in your events</span>}
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2 shrink-0" onClick={() => markReadMutation.mutate(alert.id)} data-testid={`btn-mark-read-${alert.id}`}>
                  <CheckCircle className="w-3 h-3 mr-1" />Dismiss
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Shared Intel Feed */}
        <div className="xl:col-span-2 space-y-3">
          <Card className="border border-border/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />Platform Shared Feed
                  <Badge variant="outline" className="text-[9px]">{feedData?.total ?? 0} IOCs</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={iocTypeFilter} onValueChange={setIocTypeFilter}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="ip">IP</SelectItem>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="hash_md5">Hash MD5</SelectItem>
                      <SelectItem value="hash_sha1">Hash SHA1</SelectItem>
                      <SelectItem value="hash_sha256">Hash SHA256</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="filename">Filename</SelectItem>
                      <SelectItem value="registry_key">Registry Key</SelectItem>
                      <SelectItem value="mutex">Mutex</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={reputationFilter} onValueChange={setReputationFilter}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reputations</SelectItem>
                      <SelectItem value="malicious">Malicious</SelectItem>
                      <SelectItem value="suspicious">Suspicious</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {feedLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : sharedFeed.length === 0 ? (
                <div className="p-8 text-center">
                  <Layers className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground">No shared IOCs yet. Nominate IOCs to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="text-[10px] px-4">IOC Value</TableHead>
                        <TableHead className="text-[10px] px-4">Type</TableHead>
                        <TableHead className="text-[10px] px-4">Reputation</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Confidence</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Contributors</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Matches</TableHead>
                        <TableHead className="text-[10px] px-4">Threat Type</TableHead>
                        <TableHead className="text-[10px] px-4">Propagated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sharedFeed.map((ioc) => {
                        const Icon = IOC_TYPE_ICONS[ioc.ioc_type] ?? FileText;
                        return (
                          <TableRow key={ioc.id} className="border-border/30 text-[11px]" data-testid={`row-shared-ioc-${ioc.id}`}>
                            <TableCell className="px-4 py-2 font-mono max-w-[200px] truncate">
                              <div className="flex items-center gap-1.5">
                                <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                                {ioc.source_ioc_value}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-2">
                              <Badge variant="outline" className="text-[9px]">{ioc.ioc_type}</Badge>
                            </TableCell>
                            <TableCell className="px-4 py-2">
                              <Badge variant={REP_COLORS[ioc.reputation] ?? "outline"} className="text-[9px]">{ioc.reputation}</Badge>
                            </TableCell>
                            <TableCell className="px-4 py-2 text-center">{ioc.confidence}%</TableCell>
                            <TableCell className="px-4 py-2 text-center">
                              <span className="inline-flex items-center gap-1">
                                <Activity className="w-3 h-3 text-cyan-400" />{ioc.contributor_count}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-2 text-center">{ioc.match_count}</TableCell>
                            <TableCell className="px-4 py-2 text-muted-foreground">{ioc.threat_type ?? "—"}</TableCell>
                            <TableCell className="px-4 py-2 text-muted-foreground text-[10px]">
                              {new Date(ioc.propagated_at).toLocaleDateString()}
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

          {/* My Nominations */}
          <Card className="border border-border/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />My Nominations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {myNominations.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">No nominations yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="text-[10px] px-4">IOC</TableHead>
                        <TableHead className="text-[10px] px-4">Type</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Confidence</TableHead>
                        <TableHead className="text-[10px] px-4 text-center">Status</TableHead>
                        <TableHead className="text-[10px] px-4">Submitted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myNominations.slice(0, 20).map((n) => (
                        <TableRow key={n.id} className="border-border/30 text-[11px]" data-testid={`row-nomination-${n.id}`}>
                          <TableCell className="px-4 py-2 font-mono truncate max-w-[180px]">{n.ioc_value}</TableCell>
                          <TableCell className="px-4 py-2"><Badge variant="outline" className="text-[9px]">{n.ioc_type}</Badge></TableCell>
                          <TableCell className="px-4 py-2 text-center">{n.confidence}%</TableCell>
                          <TableCell className="px-4 py-2 text-center">
                            <Badge variant={n.status === "approved" ? "outline" : n.status === "rejected" ? "destructive" : "secondary"} className="text-[9px]">
                              {n.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-2 text-muted-foreground text-[10px]">{new Date(n.created_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Approval Queue + Leaderboard */}
        <div className="space-y-3">
          {/* MSS Admin Approval Queue — gated to MSS admin users only */}
          {isMssAdmin && <Card className="border border-border/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />Approval Queue
                {pendingNominations.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{pendingNominations.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {pendingNominations.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  <CheckCircle className="w-6 h-6 mx-auto text-green-400 mb-2" />All nominations reviewed
                </div>
              ) : (
                pendingNominations.slice(0, 8).map((nom) => (
                  <div key={nom.id} className="p-2.5 rounded-md bg-muted/30 border border-border/30 space-y-1.5" data-testid={`card-pending-nom-${nom.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-medium truncate max-w-[140px]">{nom.ioc_value}</span>
                      <Badge variant="outline" className="text-[9px]">{nom.ioc_type}</Badge>
                      <span className="text-[9px] text-muted-foreground ml-auto">{nom.confidence}% conf</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">From: {nom.tenant_name}</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-6 text-[10px] px-2 flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => approveMutation.mutate(nom.id)}
                        disabled={approveMutation.isPending}
                        data-testid={`btn-approve-nom-${nom.id}`}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2 flex-1"
                        onClick={() => rejectMutation.mutate(nom.id)}
                        disabled={rejectMutation.isPending}
                        data-testid={`btn-reject-nom-${nom.id}`}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>}

          {/* Contribution Leaderboard */}
          <Card className="border border-border/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />Contribution Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No contributions yet.</p>
              ) : (
                leaderboard.slice(0, 8).map((t, i) => (
                  <div key={t.tenant_id} className="flex items-center gap-2 py-1.5" data-testid={`row-leaderboard-${t.tenant_id}`}>
                    <span className={`text-[11px] font-bold w-5 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-400" : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{t.tenant_name}</p>
                      <p className="text-[9px] text-muted-foreground">{t.ioc_contributed} contributed · {t.ioc_received} received</p>
                    </div>
                    <span className="text-sm font-bold text-cyan-400">{t.contribution_score}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Top Matched IOCs */}
          {stats?.topIOCs && stats.topIOCs.length > 0 && (
            <Card className="border border-border/40">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />Top Matched IOCs
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {stats.topIOCs.map((ioc, i) => (
                  <div key={i} className="space-y-0.5" data-testid={`row-top-ioc-${i}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono truncate max-w-[160px]">{ioc.ioc_value}</span>
                      <span className="text-[10px] text-muted-foreground">{ioc.match_count} hits</span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-1">
                      <div
                        className="bg-cyan-500 h-1 rounded-full"
                        style={{ width: `${Math.min(100, (ioc.match_count / (stats.topIOCs[0]?.match_count || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
