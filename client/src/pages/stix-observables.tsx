import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Download, RefreshCw, Shield, Globe, Copy, Search, GitBranch,
  Link2, Server, Hash, Mail, AlertTriangle, CheckCircle2, HelpCircle,
  Network, Bug, Clock, Tag, Flame, FileWarning, Radio, Rss, Database,
  CalendarRange, X,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface IOCRecord {
  id: number;
  indicator_type: string;
  indicator_value: string;
  reputation: string;
  confidence: number | null;
  country: string | null;
  source: string | null;
  tags: string[] | null;
  mitre_techniques: string[] | null;
  context: string | null;
  feed_name: string | null;
  last_seen?: string | null;
  first_seen?: string | null;
}

interface IOCResponse {
  data: IOCRecord[];
  total: number;
  page: number;
  pages: number;
}

interface StixBundle {
  type: string;
  id: string;
  spec_version: string;
  objects: unknown[];
}

interface IOCIncidentRel {
  indicator_value: string;
  indicator_type: string;
  reputation: string;
  incident_count: number;
  incidents: { id: number; title: string; severity: string; status: string }[];
}

interface IOCRelResponse {
  relationships: IOCIncidentRel[];
  total: number;
}

interface TaxiiIoc {
  id: number;
  stix_id: string;
  indicator_type: string;
  indicator_value: string;
  reputation: string;
  confidence: number | null;
  source: string;
  tags: string[] | null;
  first_seen: string | null;
  last_seen: string | null;
  updated_at: string;
}

interface TaxiiIocResponse {
  iocs: TaxiiIoc[];
  total: number;
  sources?: Array<{ source: string; count: string }>;
}

interface OpenCTIIoc {
  id: number;
  stix_id: string;
  indicator_type: string;
  indicator_value: string;
  reputation: string;
  confidence: number | null;
  score: number | null;
  source: string;
  labels: string[] | null;
  first_seen: string | null;
  last_seen: string | null;
  updated_at: string;
}

interface StreamStatus {
  active: boolean;
  lastEventId: string | null;
  lastEventTime: string | null;
  eventsPerMinute: number;
}

type RepFilter = "all" | "malicious" | "suspicious" | "clean";

type CombinedIocEntry = (IOCRecord & { sourceType?: string }) | (TaxiiIoc & { sourceType: string });
type TypeFilter = "all" | "ip" | "domain" | "url" | "hash" | "email" | "cve";
type SourceFilter = "all" | "local" | "taxii" | "opencti";

const typeIcons: Record<string, typeof Server> = {
  ip: Server,
  domain: Globe,
  url: Link2,
  hash: Hash,
  hash_md5: Hash,
  hash_sha256: Hash,
  hash_sha1: Hash,
  email: Mail,
  cve: AlertTriangle,
};

const typeColors: Record<string, string> = {
  ip: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  domain: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  url: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  hash: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  hash_md5: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  hash_sha256: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  hash_sha1: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  email: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  cve: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const repColors: Record<string, string> = {
  malicious: "text-red-400 bg-red-500/10 border-red-500/30",
  suspicious: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  clean: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  unknown: "text-muted-foreground bg-muted border-border/40",
};

const repIcons: Record<string, typeof AlertTriangle> = {
  malicious: AlertTriangle,
  suspicious: Clock,
  clean: CheckCircle2,
  unknown: HelpCircle,
};

function sourceLabel(source: string): string {
  if (!source) return "Unknown";
  if (source === "opencti") return "OpenCTI";
  if (source.startsWith("taxii:")) return source.slice(6).replace(/_/g, " ");
  return source;
}

function sourceBadgeClass(source: string): string {
  if (source === "opencti") return "text-violet-400 bg-violet-500/10 border-violet-500/30";
  if (source?.startsWith("taxii:")) return "text-teal-400 bg-teal-500/10 border-teal-500/30";
  return "text-blue-400 bg-blue-500/10 border-blue-500/20";
}

function sourceIcon(source: string) {
  if (source === "opencti") return Radio;
  if (source?.startsWith("taxii:")) return Rss;
  return Database;
}

const CHART_COLORS = ["#22d3ee", "#818cf8", "#6366f1", "#8b5cf6", "#ec4899", "#fb923c"];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StixObservablesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("browser");
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [stixTab, setStixTab] = useState<"local" | "taxii" | "opencti">("local");

  // Local IOCs (existing threat-intel IOCs)
  const { data: iocData, isLoading, refetch } = useQuery<IOCResponse>({
    queryKey: ["/api/threat-intel", currentTenant?.id, "iocs", typeFilter, repFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: "30" });
      if (typeFilter !== "all" && typeFilter !== "hash") params.set("type", typeFilter);
      if (repFilter !== "all") params.set("reputation", repFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/threat-intel/${currentTenant!.id}/iocs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load IOC observables");
      return res.json();
    },
    enabled: !!currentTenant?.id && (sourceFilter === "all" || sourceFilter === "local"),
    staleTime: 60_000,
  });

  const { data: allIocs = [] } = useQuery<IOCRecord[]>({
    queryKey: ["/api/threat-intel", currentTenant?.id, "iocs-all"],
    queryFn: async () => {
      const res = await fetch(`/api/threat-intel/${currentTenant!.id}/iocs?limit=500`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!currentTenant?.id,
    staleTime: 120_000,
  });

  // TAXII IOCs
  const { data: taxiiIocData, isLoading: taxiiLoading, refetch: refetchTaxii } = useQuery<TaxiiIocResponse>({
    queryKey: ["/api/integrations/stix/iocs", sourceFilter, typeFilter, search, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (sourceFilter !== "all" && sourceFilter !== "local") params.set("source", sourceFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/integrations/stix/iocs?${params}`, { credentials: "include" });
      if (!res.ok) return { iocs: [], total: 0 };
      return res.json();
    },
    enabled: sourceFilter === "all" || sourceFilter === "taxii" || sourceFilter === "opencti",
    staleTime: 120_000,
  });

  // OpenCTI stream status
  const { data: streamStatus } = useQuery<StreamStatus>({
    queryKey: ["/api/integrations/opencti/stream-status"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/opencti/stream-status", { credentials: "include" });
      if (!res.ok) return { active: false, lastEventId: null, lastEventTime: null, eventsPerMinute: 0 };
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: stixBundle } = useQuery<StixBundle>({
    queryKey: ["/api/cti", currentTenant?.id, "stix-export"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/stix/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load STIX bundle");
      return res.json();
    },
    enabled: !!currentTenant?.id && activeTab === "stix",
    staleTime: 300_000,
  });

  const { data: iocRelData } = useQuery<IOCRelResponse>({
    queryKey: ["/api/cti", currentTenant?.id, "ioc-relationships"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/ioc-relationships`, { credentials: "include" });
      if (!res.ok) return { relationships: [], total: 0 };
      return res.json();
    },
    enabled: !!currentTenant?.id && activeTab === "incidents",
    staleTime: 120_000,
  });

  const iocs = iocData?.data ?? [];
  const total = iocData?.total ?? 0;
  const pages = iocData?.pages ?? 1;

  const taxiiIocs = taxiiIocData?.iocs ?? [];
  const taxiiSources = taxiiIocData?.sources ?? [];

  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ioc of allIocs) {
      const t = (ioc.indicator_type || "unknown").toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    }
    // Add TAXII/OpenCTI counts
    for (const ioc of taxiiIocs) {
      const t = (ioc.indicator_type || "unknown").toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
  }, [allIocs, taxiiIocs]);

  const repDist = useMemo(() => ({
    malicious: allIocs.filter(i => i.reputation === "malicious").length
      + taxiiIocs.filter(i => i.reputation === "malicious").length,
    suspicious: allIocs.filter(i => i.reputation === "suspicious").length
      + taxiiIocs.filter(i => i.reputation === "suspicious").length,
    clean: allIocs.filter(i => i.reputation === "clean").length,
  }), [allIocs, taxiiIocs]);

  const relationships = useMemo(() => {
    const rels: { ioc: string; type: string; technique: string; source: string }[] = [];
    for (const ioc of allIocs) {
      if (ioc.mitre_techniques && ioc.mitre_techniques.length > 0) {
        for (const t of ioc.mitre_techniques.slice(0, 2)) {
          rels.push({ ioc: ioc.indicator_value, type: ioc.indicator_type, technique: t, source: ioc.source || ioc.feed_name || "—" });
        }
      }
    }
    return rels.slice(0, 40);
  }, [allIocs]);

  // Combined IOCs for "all" source view
  const combinedIocs: CombinedIocEntry[] = useMemo(() => {
    if (sourceFilter === "local") return iocs.map(i => ({ ...i, sourceType: "local" }));
    if (sourceFilter === "all") {
      const locals = iocs.map(i => ({ ...i, sourceType: "local" }));
      const external = taxiiIocs.map(i => ({ ...i, sourceType: i.source === "opencti" ? "opencti" : "taxii" }));
      return [...locals, ...external];
    }
    // For taxii/opencti: server already filtered by source, tag appropriately
    return taxiiIocs.map(i => ({ ...i, sourceType: i.source === "opencti" ? "opencti" : "taxii" }));
  }, [sourceFilter, iocs, taxiiIocs]);

  function handleDownloadStix() {
    if (!stixBundle) return;
    const blob = new Blob([JSON.stringify(stixBundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stix-bundle-tenant-${currentTenant?.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "STIX Bundle Downloaded", description: `${(stixBundle.objects || []).length} objects exported` });
  }

  function copyValue(v: string) {
    navigator.clipboard.writeText(v);
    toast({ title: "Copied", description: v.slice(0, 60) });
  }

  function clearDateFilters() {
    setDateFrom("");
    setDateTo("");
  }

  const totalIocCount = (total || allIocs.length) + (taxiiIocData?.total || 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight">STIX Observables</h1>
            <Badge className="text-[9px] px-1.5 py-0 bg-indigo-500/15 text-indigo-400 border-indigo-500/30">STIX 2.1</Badge>
            {streamStatus?.active && (
              <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">IOC observable browser — local, TAXII, and OpenCTI indicators with source badges, filters, and relationship overlays</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchTaxii(); }} data-testid="button-refresh-stix">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => { setActiveTab("stix"); }} variant="outline" data-testid="button-stix-export-tab">
            <Download className="w-3.5 h-3.5 mr-1.5" />STIX Export
          </Button>
        </div>
      </div>

      {/* Stream status bar */}
      {streamStatus?.active && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400" data-testid="status-opencti-stream">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>OpenCTI live stream active</span>
          {streamStatus.eventsPerMinute > 0 && <span className="text-muted-foreground">· {streamStatus.eventsPerMinute} events/min</span>}
          {streamStatus.lastEventTime && <span className="text-muted-foreground">· Last: {formatDate(streamStatus.lastEventTime)}</span>}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Globe className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] text-muted-foreground">Total IOCs</span></div>
            <span className="text-xl font-bold" data-testid="stat-total-iocs">{isLoading ? "—" : totalIocCount.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /><span className="text-[10px] text-muted-foreground">Malicious</span></div>
            <span className="text-xl font-bold text-red-400" data-testid="stat-malicious">{isLoading ? "—" : repDist.malicious}</span>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-amber-400" /><span className="text-[10px] text-muted-foreground">Suspicious</span></div>
            <span className="text-xl font-bold text-amber-400" data-testid="stat-suspicious">{isLoading ? "—" : repDist.suspicious}</span>
          </CardContent>
        </Card>
        <Card className="border-teal-500/20 bg-teal-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1"><Rss className="w-3.5 h-3.5 text-teal-400" /><span className="text-[10px] text-muted-foreground">TAXII Sources</span></div>
            <span className="text-xl font-bold text-teal-400" data-testid="stat-taxii-sources">{taxiiSources.length}</span>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="browser" className="text-xs h-7">IOC Browser</TabsTrigger>
          <TabsTrigger value="distribution" className="text-xs h-7">Type Distribution</TabsTrigger>
          <TabsTrigger value="relationships" className="text-xs h-7">
            <GitBranch className="w-3 h-3 mr-1" />ATT&CK
          </TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs h-7">
            <Flame className="w-3 h-3 mr-1" />Incidents
          </TabsTrigger>
          <TabsTrigger value="stix" className="text-xs h-7">
            <Download className="w-3 h-3 mr-1" />STIX Export
          </TabsTrigger>
        </TabsList>

        {/* IOC Browser */}
        <TabsContent value="browser" className="mt-4 space-y-4">
          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search indicators (IP, domain, hash, URL…)"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-9 text-sm"
                data-testid="input-ioc-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v as TypeFilter); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-36" data-testid="select-type-filter">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ip">IP Address</SelectItem>
                <SelectItem value="domain">Domain</SelectItem>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="hash">File Hash</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="cve">CVE</SelectItem>
              </SelectContent>
            </Select>
            <Select value={repFilter} onValueChange={v => { setRepFilter(v as RepFilter); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-36" data-testid="select-rep-filter">
                <SelectValue placeholder="Reputation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reputations</SelectItem>
                <SelectItem value="malicious">Malicious</SelectItem>
                <SelectItem value="suspicious">Suspicious</SelectItem>
                <SelectItem value="clean">Clean</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v as SourceFilter); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-32" data-testid="select-source-filter">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="local">Local TI</SelectItem>
                <SelectItem value="taxii">TAXII Feeds</SelectItem>
                <SelectItem value="opencti">OpenCTI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">First seen:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-7 text-xs px-2 rounded border border-border bg-background text-foreground"
              data-testid="input-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-7 text-xs px-2 rounded border border-border bg-background text-foreground"
              data-testid="input-date-to"
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearDateFilters} data-testid="button-clear-dates">
                <X className="w-3 h-3 mr-1" />Clear
              </Button>
            )}
          </div>

          {/* Source badges summary */}
          {taxiiSources.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Sources:</span>
              {taxiiSources.map(s => {
                const SrcIcon = sourceIcon(s.source);
                return (
                  <Badge
                    key={s.source}
                    variant="outline"
                    className={`text-[9px] px-1.5 gap-1 cursor-pointer ${sourceBadgeClass(s.source)}`}
                    onClick={() => setSourceFilter(s.source === "opencti" ? "opencti" : "taxii")}
                    data-testid={`badge-source-${s.source}`}
                  >
                    <SrcIcon className="w-2.5 h-2.5" />{sourceLabel(s.source)} ({s.count})
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {sourceFilter === "local" ? `${total.toLocaleString()} local observables` : `${combinedIocs.length.toLocaleString()} observables`}
            {sourceFilter === "all" && taxiiIocData?.total ? ` (${taxiiIocData.total} from feeds)` : ""}
            {sourceFilter === "local" ? ` • Page ${page} of ${pages}` : ""}
          </div>

          <div className="space-y-2">
            {(isLoading || taxiiLoading) && combinedIocs.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="border-border/40"><CardContent className="p-3"><Skeleton className="h-10 w-full" /></CardContent></Card>
              ))
            ) : combinedIocs.length === 0 ? (
              <Card className="border-border/40">
                <CardContent className="p-10 text-center">
                  <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No IOC observables found. Try adjusting filters or configure TAXII feeds.</p>
                </CardContent>
              </Card>
            ) : (
              combinedIocs.slice(0, 50).map((ioc, idx) => {
                const itype = (ioc.indicator_type || "").toLowerCase();
                const TypeIcon = typeIcons[itype] || Globe;
                const RepIcon = repIcons[ioc.reputation || ""] || HelpCircle;
                const typeColor = typeColors[itype] || "text-muted-foreground bg-muted border-border/40";
                const repColor = repColors[ioc.reputation || ""] || "text-muted-foreground";
                const src = ioc.source || ioc.feed_name || "";
                const SrcIcon = sourceIcon(src);
                return (
                  <Card key={`${ioc.id || idx}-${src}`} className="border-border/40 hover:border-primary/20 transition-colors" data-testid={`card-ioc-${ioc.id || idx}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <TypeIcon className={`w-4 h-4 shrink-0 mt-0.5 ${typeColor.split(" ")[0]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm font-mono font-medium truncate max-w-[280px]">{ioc.indicator_value}</code>
                            <Badge variant="outline" className={`text-[9px] uppercase px-1.5 ${typeColor}`}>{ioc.indicator_type}</Badge>
                            <Badge variant="outline" className={`text-[9px] capitalize px-1.5 ${repColor}`}>
                              <RepIcon className="w-2.5 h-2.5 mr-0.5" />{ioc.reputation}
                            </Badge>
                            {src && (
                              <Badge variant="outline" className={`text-[9px] px-1.5 gap-1 ${sourceBadgeClass(src)}`}>
                                <SrcIcon className="w-2.5 h-2.5" />
                                {sourceLabel(src)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                            {ioc.country && <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />{ioc.country}</span>}
                            {ioc.confidence !== null && ioc.confidence !== undefined && <span>Confidence: {ioc.confidence}%</span>}
                            {ioc.score !== undefined && ioc.score !== null && <span>Score: {ioc.score}</span>}
                            {(ioc.feed_name && !src) && <span className="flex items-center gap-0.5"><Network className="w-2.5 h-2.5" />{ioc.feed_name}</span>}
                            {(ioc.last_seen || ioc.updated_at) && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />Seen: {formatDate(ioc.last_seen || ioc.updated_at)}
                              </span>
                            )}
                            {ioc.first_seen && <span className="flex items-center gap-0.5"><CalendarRange className="w-2.5 h-2.5" />From: {formatDate(ioc.first_seen)}</span>}
                          </div>
                          {ioc.mitre_techniques && ioc.mitre_techniques.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              <Bug className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                              {ioc.mitre_techniques.slice(0, 4).map((t: string) => (
                                <Badge key={t} variant="outline" className="text-[8px] px-1 font-mono text-emerald-400 border-emerald-500/30">{t}</Badge>
                              ))}
                            </div>
                          )}
                          {(ioc.tags && ioc.tags.length > 0) && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Tag className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                              {(Array.isArray(ioc.tags) ? ioc.tags : (() => { try { return typeof ioc.tags === "string" ? JSON.parse(ioc.tags) : []; } catch { return []; } })()).slice(0, 5).map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-[8px] px-1 text-muted-foreground">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {(ioc.labels && ioc.labels.length > 0) && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Tag className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                              {(Array.isArray(ioc.labels) ? ioc.labels : (() => { try { return typeof ioc.labels === "string" ? JSON.parse(ioc.labels) : []; } catch { return []; } })()).slice(0, 5).map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-[8px] px-1 text-muted-foreground">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => copyValue(ioc.indicator_value)}
                          className="shrink-0 p-1"
                          data-testid={`button-copy-ioc-${ioc.id || idx}`}
                          title="Copy value"
                        >
                          <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {sourceFilter === "local" && pages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">Previous</Button>
              <span className="text-xs text-muted-foreground py-2">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} data-testid="button-next-page">Next</Button>
            </div>
          )}
        </TabsContent>

        {/* Type Distribution */}
        <TabsContent value="distribution" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">IOC Type Distribution</CardTitle>
                <CardDescription className="text-xs">Breakdown of observable types across all feeds (local + TAXII + OpenCTI)</CardDescription>
              </CardHeader>
              <CardContent>
                {typeDist.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-10">No data yet — ingest IOCs or configure TAXII feeds</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={typeDist} barSize={20} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="type" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {typeDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reputation Breakdown</CardTitle>
                <CardDescription className="text-xs">IOC reputation classification across all sources</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {[
                  { label: "Malicious", count: repDist.malicious, color: "bg-red-500", textColor: "text-red-400" },
                  { label: "Suspicious", count: repDist.suspicious, color: "bg-amber-500", textColor: "text-amber-400" },
                  { label: "Clean", count: repDist.clean, color: "bg-emerald-500", textColor: "text-emerald-400" },
                ].map(r => {
                  const totalAll = repDist.malicious + repDist.suspicious + repDist.clean;
                  const pct = totalAll > 0 ? Math.round((r.count / totalAll) * 100) : 0;
                  return (
                    <div key={r.label} className="space-y-1" data-testid={`rep-bar-${r.label.toLowerCase()}`}>
                      <div className="flex justify-between text-xs">
                        <span className={r.textColor}>{r.label}</span>
                        <span className="text-muted-foreground">{r.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 text-xs text-muted-foreground">Total: {(allIocs.length + taxiiIocs.length).toLocaleString()} observables across all sources</div>
                {taxiiSources.length > 0 && (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground mb-2">Feed Breakdown</p>
                    {taxiiSources.map(s => (
                      <div key={s.source} className="flex items-center justify-between text-[10px] py-0.5">
                        <Badge variant="outline" className={`text-[9px] px-1.5 gap-1 ${sourceBadgeClass(s.source)}`}>
                          {sourceLabel(s.source)}
                        </Badge>
                        <span className="text-muted-foreground">{parseInt(s.count).toLocaleString()} IOCs</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ATT&CK Relationships */}
        <TabsContent value="relationships" className="mt-4">
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />IOC → MITRE ATT&CK Relationships
              </CardTitle>
              <CardDescription className="text-xs">Indicators linked to ATT&CK techniques via threat intelligence enrichment</CardDescription>
            </CardHeader>
            <CardContent>
              {relationships.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No ATT&CK technique mappings found. Enrich IOCs with MITRE techniques via the AI enrichment pipeline.</p>
              ) : (
                <div className="space-y-2">
                  {relationships.map((rel, i) => {
                    const TypeIcon = typeIcons[rel.type?.toLowerCase() || ""] || Globe;
                    const typeColor = typeColors[rel.type?.toLowerCase() || ""] || "text-muted-foreground";
                    return (
                      <div key={i} className="flex items-center gap-2 p-2.5 rounded border border-border/40 text-xs" data-testid={`row-rel-${i}`}>
                        <TypeIcon className={`w-3.5 h-3.5 shrink-0 ${typeColor.split(" ")[0]}`} />
                        <code className="font-mono font-medium truncate max-w-[160px]">{rel.ioc}</code>
                        <span className="text-muted-foreground shrink-0">→</span>
                        <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/30 shrink-0">{rel.technique}</Badge>
                        <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">{rel.source}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incident References */}
        <TabsContent value="incidents" className="mt-4">
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary" />IOC → Incident References
              </CardTitle>
              <CardDescription className="text-xs">Indicators observed in active security incidents</CardDescription>
            </CardHeader>
            <CardContent>
              {!iocRelData || iocRelData.relationships.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No incident–IOC relationships found. This populates automatically when IOCs are observed in incidents.</p>
              ) : (
                <div className="space-y-2">
                  {iocRelData.relationships.map((rel, i) => {
                    const TypeIcon = typeIcons[rel.indicator_type?.toLowerCase() || ""] || Globe;
                    const repColor = repColors[rel.reputation || ""] || "text-muted-foreground";
                    return (
                      <div key={i} className="p-2.5 rounded border border-border/40 text-xs space-y-1.5" data-testid={`row-ioc-incident-${i}`}>
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-3.5 h-3.5 shrink-0" />
                          <code className="font-mono font-medium truncate max-w-[200px]">{rel.indicator_value}</code>
                          <Badge variant="outline" className={`text-[9px] capitalize ${repColor}`}>{rel.reputation}</Badge>
                          <Badge variant="outline" className="text-[9px] ml-auto">{rel.incident_count} incident{rel.incident_count !== 1 ? "s" : ""}</Badge>
                        </div>
                        <div className="pl-5 flex flex-wrap gap-1">
                          {rel.incidents.slice(0, 3).map(inc => (
                            <Badge key={inc.id} variant="outline" className="text-[9px] px-1.5">{inc.title}</Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* STIX 2.1 Export */}
        <TabsContent value="stix" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["local", "taxii", "opencti"] as const).map(t => (
                <Button key={t} size="sm" variant={stixTab === t ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setStixTab(t)}>
                  {t === "local" ? "Local Bundle" : t === "taxii" ? "TAXII Feed" : "OpenCTI"}
                </Button>
              ))}
            </div>
            {stixTab === "local" && (
              <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={handleDownloadStix} disabled={!stixBundle} data-testid="button-download-stix">
                <Download className="w-3 h-3 mr-1" />Download
              </Button>
            )}
          </div>

          {stixTab === "local" && (
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-primary" />STIX 2.1 Bundle Preview
                </CardTitle>
                <CardDescription className="text-xs">Local STIX bundle for tenant {currentTenant?.id} — includes IOCs, threat actors, campaigns, and malware</CardDescription>
              </CardHeader>
              <CardContent>
                {!stixBundle ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Shield className="w-8 h-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading STIX bundle…</p>
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 mb-3">
                      <Badge variant="outline" className="text-xs">{stixBundle.spec_version}</Badge>
                      <Badge variant="outline" className="text-xs">{(stixBundle.objects || []).length} objects</Badge>
                      <Badge variant="outline" className="text-xs">{stixBundle.id?.slice(0, 30)}…</Badge>
                    </div>
                    <pre className="text-[10px] font-mono bg-muted rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap break-words border border-border/40">
                      {JSON.stringify({ ...stixBundle, objects: (stixBundle.objects || []).slice(0, 5) }, null, 2)}
                      {(stixBundle.objects || []).length > 5 ? `\n\n... ${(stixBundle.objects || []).length - 5} more objects` : ""}
                    </pre>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {stixTab === "taxii" && (
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Rss className="w-4 h-4 text-teal-400" />TAXII Feed IOCs
                </CardTitle>
                <CardDescription className="text-xs">STIX 2.1 indicators collected from configured TAXII servers</CardDescription>
              </CardHeader>
              <CardContent>
                {taxiiIocs.filter(i => i.source !== "opencti").length === 0 ? (
                  <div className="text-center py-8">
                    <Rss className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No TAXII IOCs ingested yet. Configure TAXII feeds in the Integrations page.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {taxiiIocs.filter(i => i.source !== "opencti").slice(0, 20).map((ioc, i) => {
                      const SrcIcon = sourceIcon(ioc.source);
                      return (
                        <div key={i} className="flex items-center gap-2 p-2 rounded border border-border/40 text-xs">
                          <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <code className="font-mono truncate max-w-[200px] flex-1">{ioc.indicator_value}</code>
                          <Badge variant="outline" className={`text-[9px] uppercase ${typeColors[ioc.indicator_type] || ""}`}>{ioc.indicator_type}</Badge>
                          <Badge variant="outline" className={`text-[9px] gap-1 ${sourceBadgeClass(ioc.source)}`}>
                            <SrcIcon className="w-2.5 h-2.5" />{sourceLabel(ioc.source)}
                          </Badge>
                          <span className="text-muted-foreground shrink-0">{formatDate(ioc.updated_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {stixTab === "opencti" && (
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Radio className="w-4 h-4 text-violet-400" />OpenCTI IOCs
                    </CardTitle>
                    <CardDescription className="text-xs">Indicators synced from OpenCTI platform</CardDescription>
                  </div>
                  {streamStatus?.active && (
                    <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {taxiiIocs.filter(i => i.source === "opencti").length === 0 ? (
                  <div className="text-center py-8">
                    <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No OpenCTI IOCs synced yet. Configure OpenCTI in the Integrations page.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {taxiiIocs.filter(i => i.source === "opencti").slice(0, 20).map((ioc, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border border-border/40 text-xs">
                        <Radio className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <code className="font-mono truncate max-w-[200px] flex-1">{ioc.indicator_value}</code>
                        <Badge variant="outline" className={`text-[9px] uppercase ${typeColors[ioc.indicator_type] || ""}`}>{ioc.indicator_type}</Badge>
                        <Badge variant="outline" className={`text-[9px] ${repColors[ioc.reputation] || ""}`}>{ioc.reputation}</Badge>
                        <span className="text-muted-foreground shrink-0">{formatDate(ioc.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
