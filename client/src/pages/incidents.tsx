import { useState, useCallback, useMemo, useRef, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import type { Incident } from "@shared/schema";
import {
  Search, X, ChevronDown, ChevronRight, ChevronLeft,
  Shield, Database, AlertTriangle, Layers, CheckCircle2,
  Zap, Target, FileText, Loader2, Brain, Sparkles,
  Swords, RefreshCw, BarChart2, TrendingUp, Plus,
  Mail, Wifi, Skull, Cloud, Globe, Lock, Users, Code2,
  Ticket, ShieldAlert, Network, UserX, Server, Activity,
  GitBranch, FlaskConical, Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AIInvestigationPanel, InvestigationStatusBadge } from "@/components/ai-investigation-panel";
import { PageHero } from "@/components/page-hero";
import { QueryErrorState } from "@/components/ui/error-boundary";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell,
} from "recharts";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-chart-4/10 text-chart-4",
  medium: "bg-chart-1/10 text-chart-1",
  low: "bg-chart-2/10 text-chart-2",
  info: "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  investigating: "bg-chart-4/10 text-chart-4",
  contained: "bg-chart-1/10 text-chart-1",
  resolved: "bg-chart-2/10 text-chart-2",
  closed: "bg-muted text-muted-foreground",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const SEVERITY_FILTER_OPTIONS = [
  { label: "Crit+High", value: "critical,high", cls: "bg-red-500/10 text-red-600 border-red-500/30" },
  { label: "Critical", value: "critical", cls: "bg-red-500/10 text-red-600 border-red-500/30" },
  { label: "High", value: "high", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  { label: "Medium", value: "medium", cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30" },
  { label: "Low", value: "low", cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { label: "All", value: "all", cls: "" },
];

const STATUS_OPTIONS = ["all", "open", "investigating", "contained", "resolved", "closed"];
const CLASSIFICATION_OPTIONS = [
  { label: "All", value: "all" },
  { label: "True Positive", value: "tp" },
  { label: "False Positive", value: "fp" },
  { label: "Unclassified", value: "unclassified" },
];
const PAGE_SIZE_OPTIONS = [25, 50, 100];

type ViewMode = "table" | "analytics";

interface IocIndicator {
  type?: string;
  value?: string;
  indicator?: string;
  reputation?: string;
  country?: string;
}

interface IncidentIocData {
  indicators?: IocIndicator[];
  malwareFamily?: string;
  phishingSubtype?: string;
  phishingSubType?: string;
}

interface IncidentContextualAnalysis {
  behavioralContext?: string;
}

function getIocData(incident: Incident): IncidentIocData {
  return (incident.iocData ?? {}) as IncidentIocData;
}

function getContextualAnalysis(incident: Incident): IncidentContextualAnalysis {
  return (incident.contextualAnalysis ?? {}) as IncidentContextualAnalysis;
}

function getDaysOld(dateStr: Date | string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

type ThreatFamily = "Email" | "Malware" | "Network" | "Web" | "Cloud" | "Identity" | "DLP" | "Vulnerability" | "Multi-Stage" | "Sigma" | "Unknown";

const THREAT_FAMILY_CONFIG: Record<ThreatFamily, { Icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  Email:         { Icon: Mail,        color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-500/10 border-orange-500/30" },
  Malware:       { Icon: Skull,       color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10 border-red-500/30" },
  Network:       { Icon: Network,     color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-500/10 border-blue-500/30" },
  Web:           { Icon: Globe,       color: "text-green-600 dark:text-green-400",    bg: "bg-green-500/10 border-green-500/30" },
  Cloud:         { Icon: Cloud,       color: "text-sky-600 dark:text-sky-400",        bg: "bg-sky-500/10 border-sky-500/30" },
  Identity:      { Icon: UserX,       color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-500/10 border-violet-500/30" },
  DLP:           { Icon: Lock,        color: "text-emerald-600 dark:text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/30" },
  Vulnerability: { Icon: ShieldAlert, color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-500/10 border-amber-500/30" },
  "Multi-Stage": { Icon: GitBranch,   color: "text-purple-600 dark:text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
  Sigma:         { Icon: FlaskConical,color: "text-cyan-600 dark:text-cyan-400",      bg: "bg-cyan-500/10 border-cyan-500/30" },
  Unknown:       { Icon: AlertTriangle, color: "text-muted-foreground",               bg: "bg-muted/40 border-border" },
};

function detectThreatFamily(incident: Incident): ThreatFamily {
  const src = (incident.source || "").toLowerCase();
  const cat = (incident.category || "").toLowerCase();
  const type = (incident.incidentType || "").toLowerCase();
  const det = (incident.detectionSource || "").toLowerCase();
  const title = (incident.title || "").toLowerCase();

  if (src.includes("email") || cat === "email security" || det.includes("email") || type.includes("email")
      || title.startsWith("phishing:") || title.startsWith("spam:") || title.startsWith("bec:") || title.startsWith("suspicious:"))
    return "Email";
  if (cat.includes("malware") || type.includes("malware") || type.includes("ransomware") || type.includes("trojan") || type.includes("virus") || det.includes("edr") || det.includes("endpoint"))
    return "Malware";
  if (cat.includes("network") || src.includes("network") || det.includes("firewall") || det.includes("ids") || det.includes("ips"))
    return "Network";
  if (cat.includes("web") || src.includes("waf") || det.includes("waf"))
    return "Web";
  if (cat.includes("cloud") || src.includes("cloud") || det.includes("cloud"))
    return "Cloud";
  if (cat.includes("identity") || cat.includes("iam") || src.includes("identity") || det.includes("active directory") || det.includes("azure ad"))
    return "Identity";
  if (cat.includes("dlp") || type.includes("dlp") || cat.includes("data loss"))
    return "DLP";
  if (cat.includes("vulnerab") || type.includes("vulnerab") || det.includes("scanner"))
    return "Vulnerability";
  if (incident.sigmaMatches && Array.isArray(incident.sigmaMatches) && (incident.sigmaMatches as unknown[]).length > 0)
    return "Sigma";
  if (incident.mitreTactic && incident.killChainPhase)
    return "Multi-Stage";
  return "Unknown";
}

function getDisplaySubtype(incident: Incident): string | null {
  const ioc = getIocData(incident);
  if (ioc.phishingSubtype) return ioc.phishingSubtype;
  if (ioc.phishingSubType) return ioc.phishingSubType;
  if (ioc.malwareFamily) return ioc.malwareFamily;
  const desc = incident.description || "";
  const malwareMatch = desc.match(/Malware Family:\s*(.+?)(?:\n|$)/);
  if (malwareMatch && malwareMatch[1].trim() !== "N/A") return malwareMatch[1].trim();
  return null;
}

function resolveSmartSourceDest(incident: Incident) {
  const d = (incident.source || "").toLowerCase();
  const srcIp = incident.sourceIp || "";
  const dstIp = incident.destinationIp || "";
  const firstAsset = (incident.affectedAssets || "").split(",")[0]?.trim() || "";
  if (d.includes("endpoint") || d.includes("edr")) return { sourceLabel: "System", sourceValue: firstAsset || srcIp || "--", destLabel: "Endpoint", destValue: dstIp || firstAsset || "--" };
  if (d.includes("network")) return { sourceLabel: "Source IP", sourceValue: srcIp || firstAsset || "--", destLabel: "Target IP", destValue: dstIp || "--" };
  if (d.includes("email") || d.includes("checkpoint")) return { sourceLabel: "Sender", sourceValue: srcIp || "--", destLabel: "Recipient", destValue: dstIp || firstAsset || "--" };
  if (d.includes("waf") || d.includes("web")) return { sourceLabel: "Source IP", sourceValue: srcIp || "--", destLabel: "Target App", destValue: dstIp || firstAsset || "--" };
  if (d.includes("cloud")) return { sourceLabel: "System / IP", sourceValue: srcIp || firstAsset || "--", destLabel: "Target", destValue: dstIp || "--" };
  if (d.includes("identity") || d.includes("iam")) return { sourceLabel: "User / System", sourceValue: srcIp || firstAsset || "--", destLabel: "Target", destValue: dstIp || "--" };
  return { sourceLabel: "Source", sourceValue: srcIp || firstAsset || "--", destLabel: "Destination", destValue: dstIp || firstAsset || "--" };
}

interface ClusteredIncident {
  clusterKey: string;
  representative: Incident;
  incidents: Incident[];
  count: number;
  isCluster: boolean;
  latestDate: Date | null;
}

function CreateIncidentDialog({ tenantId, onCreated }: { tenantId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/incidents", {
        title: title.trim(),
        description: description.trim() || null,
        severity,
        status: "open",
        tenantId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Incident Created" });
      setOpen(false);
      setTitle(""); setDescription(""); setSeverity("medium");
      onCreated();
    },
    onError: () => toast({ title: "Failed to create incident", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs" data-testid="btn-create-incident">
          <Plus className="w-3.5 h-3.5" />Create Incident
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input className="mt-1" placeholder="Incident title..." value={title} onChange={e => setTitle(e.target.value)} data-testid="input-create-incident-title" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea className="mt-1 text-xs" placeholder="Describe the incident..." value={description} onChange={e => setDescription(e.target.value)} rows={3} data-testid="input-create-incident-description" />
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-create-incident-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["critical", "high", "medium", "low", "info"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} data-testid="btn-cancel-create-incident">Cancel</Button>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending} data-testid="btn-submit-create-incident">
              {createMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</> : "Create Incident"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResponsePlanBadge({ incidentId }: { incidentId: number }) {
  const { data: plan, isLoading } = useQuery<any>({
    queryKey: ["/api/incidents", incidentId, "response-plan"],
    queryFn: () => fetch(`/api/incidents/${incidentId}/response-plan`).then(r => r.ok ? r.json() : null),
    staleTime: 60000,
  });
  if (isLoading) return null;

  if (!plan) {
    return (
      <Badge variant="outline" className="text-[9px] px-1 flex items-center gap-0.5 border border-muted-foreground/30 text-muted-foreground/60" title="No response plan generated yet">
        <Cpu className="h-2.5 w-2.5" />No Plan
      </Badge>
    );
  }

  const actions: any[] = plan.actions || [];
  const doneCount = actions.filter((a: any) => a.status === "done").length;
  const totalCount = actions.length;
  const progressLabel = totalCount > 0 ? `${doneCount}/${totalCount}` : "";

  const statusConfig: Record<string, { label: string; cls: string }> = {
    ready: { label: `Plan Ready${progressLabel ? ` (${progressLabel})` : ""}`, cls: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
    in_progress: { label: `Response: ${progressLabel} steps`, cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
    complete: { label: `Contained (${progressLabel})`, cls: "bg-green-500/10 text-green-400 border-green-500/30" },
  };
  const cfg = statusConfig[plan.status] || statusConfig.ready;
  return (
    <Badge variant="outline" className={`text-[9px] px-1 flex items-center gap-0.5 border ${cfg.cls}`} title={`Autonomous Response Plan — ${plan.mode?.replace(/_/g," ") || "manual"} mode`}>
      <Cpu className="h-2.5 w-2.5" />{cfg.label}
    </Badge>
  );
}

export default function IncidentsPage() {
  const { currentTenant, isMSS } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [insightsData, setInsightsData] = useState<Record<number, { relatedEventsCount: number; insights: { riskAssessment: string; attackVector: string; mitreMappings: string[]; recommendations: string[]; priorityScore: number } }>>({});
  const [groupSimilar, setGroupSimilar] = useState(true);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const bulkAbortRef = useRef(false);
  const [detectingRuleForId, setDetectingRuleForId] = useState<number | null>(null);
  const [creatingTicketForId, setCreatingTicketForId] = useState<number | null>(null);

  interface IncidentsResponse { data: Incident[]; total: number; totalPages: number }

  const incidentsQuery = useQuery<IncidentsResponse>({
    queryKey: ["/api/security-console", currentTenant?.id, "incidents", "all", page, pageSize, severityFilter, statusFilter, classificationFilter, search],
    queryFn: async (): Promise<IncidentsResponse> => {
      if (!currentTenant?.id) return { data: [], total: 0, totalPages: 1 };
      const params = new URLSearchParams({ domain: "all", page: String(page), pageSize: String(pageSize) });
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (classificationFilter !== "all") params.set("classification", classificationFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/security-console/${currentTenant.id}/incidents?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch incidents");
      return res.json() as Promise<IncidentsResponse>;
    },
    enabled: !!currentTenant?.id,
    refetchInterval: (query) => {
      const list: Incident[] = (query.state.data as IncidentsResponse | undefined)?.data ?? [];
      return list.some(i => i.triageScore == null) ? 15000 : 60000;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (update: Partial<Incident> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/incidents/${update.id}`, update);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant?.id, "incidents"] });
      toast({ title: "Incident updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update incident.", variant: "destructive" }),
  });

  const singleEnrichMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/ai/enrich-incident/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant?.id, "incidents"] });
      toast({ title: "AI Enrichment Complete", description: "Enriched with MITRE, Kill Chain, IOCs, and confidence score." });
    },
    onError: () => toast({ title: "Enrichment Failed", variant: "destructive" }),
  });

  const singleDescribeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/ai/enrich-incident-description/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant?.id, "incidents"] });
      toast({ title: "AI Summary Generated" });
    },
    onError: () => toast({ title: "Description Failed", variant: "destructive" }),
  });

  const insightsMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/ai/incident-insights/${id}`);
      return res.json();
    },
    onSuccess: (data, id) => setInsightsData(prev => ({ ...prev, [id]: data })),
    onError: () => toast({ title: "AI Insights Failed", variant: "destructive" }),
  });

  const quickInvestigateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/ai/investigate-incident/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant?.id, "incidents"] });
      toast({ title: "AI Investigation Complete" });
    },
    onError: () => toast({ title: "Investigation Failed", variant: "destructive" }),
  });

  const handleGenerateDetectionRule = async (incident: Incident) => {
    setDetectingRuleForId(incident.id);
    try {
      const res = await apiRequest("POST", `/api/incidents/${incident.id}/generate-detection-rule`, {});
      const data = await res.json();
      if (data.ruleId) navigate(`/detection-engineering?ruleId=${data.ruleId}`);
      else navigate("/detection-engineering");
      toast({ title: "Detection Rule Generated", description: "Opening Detection Engineering..." });
    } catch {
      toast({ title: "Failed to generate detection rule", variant: "destructive" });
    } finally {
      setDetectingRuleForId(null);
    }
  };

  const handleCreateTicket = async (incident: Incident) => {
    if (!currentTenant?.id) return;
    setCreatingTicketForId(incident.id);
    try {
      const res = await apiRequest("POST", "/api/tickets", {
        tenantId: currentTenant.id,
        title: `[INC-${incident.id}] ${incident.title}`,
        description: `Incident #${incident.id}: ${incident.description || incident.title}\n\nSeverity: ${incident.severity}\nStatus: ${incident.status}\nSource: ${incident.detectionSource || incident.source || "Unknown"}`,
        priority: incident.severity === "critical" ? "critical" : incident.severity === "high" ? "high" : "medium",
        status: "open",
      });
      await res.json();
      toast({ title: "Ticket Created", description: `Ticket created for Incident #${incident.id}` });
    } catch {
      toast({ title: "Failed to create ticket", variant: "destructive" });
    } finally {
      setCreatingTicketForId(null);
    }
  };

  const handleBulkEnrich = async () => {
    if (!currentTenant?.id) return;
    setBulkEnriching(true);
    bulkAbortRef.current = false;
    setBulkProgress(0);
    setBulkTotal(0);
    const es = new EventSource(`/api/ai/enrich-incidents?tenantId=${currentTenant.id}`);
    es.onmessage = (evt) => {
      if (bulkAbortRef.current) { es.close(); setBulkEnriching(false); return; }
      try {
        const msg = JSON.parse(evt.data) as { type: string; total?: number; enriched?: number; message?: string };
        if (msg.type === "start") setBulkTotal(msg.total ?? 0);
        else if (msg.type === "progress") setBulkProgress(msg.enriched ?? 0);
        else if (msg.type === "complete") {
          setBulkEnriching(false);
          queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant.id, "incidents"] });
          toast({ title: "Bulk Enrichment Complete", description: `Enriched ${msg.enriched ?? 0} of ${msg.total ?? 0} incidents.` });
          es.close();
        } else if (msg.type === "error") {
          setBulkEnriching(false);
          toast({ title: "Bulk Enrichment Error", description: msg.message, variant: "destructive" });
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => { es.close(); setBulkEnriching(false); };
  };

  const toggleRow = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const clearFilters = () => {
    setSeverityFilter("all"); setStatusFilter("all");
    setClassificationFilter("all"); setSearch(""); setSearchInput(""); setPage(1);
  };

  const allIncidentsList: Incident[] = incidentsQuery.data?.data ?? [];
  const incidentsList: Incident[] = allIncidentsList;
  const total = incidentsQuery.data?.total ?? 0;
  const totalPages = incidentsQuery.data?.totalPages ?? 1;
  const hasActiveFilters = severityFilter !== "all" || statusFilter !== "all" || classificationFilter !== "all" || !!search;

  const normalizeTitle = (t: string) => t.replace(/\b[0-9a-fA-F]{8,}\b/g, "").replace(/\b\d{4,}\b/g, "").replace(/\s{2,}/g, " ").trim();

  const clusteredIncidents: ClusteredIncident[] = useMemo(() => {
    if (!groupSimilar) {
      return incidentsList.map(inc => ({
        clusterKey: `single-${inc.id}`, representative: inc, incidents: [inc],
        count: 1, isCluster: false, latestDate: inc.createdAt ? new Date(inc.createdAt) : null,
      }));
    }
    const WINDOW_MS = 30 * 60 * 1000;
    const keyGroups = new Map<string, Incident[]>();
    for (const inc of incidentsList) {
      const key = `${normalizeTitle(inc.title)}|||${inc.severity}`;
      const arr = keyGroups.get(key); if (arr) arr.push(inc); else keyGroups.set(key, [inc]);
    }
    const clusters: ClusteredIncident[] = [];
    for (const [, group] of Array.from(keyGroups)) {
      group.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
      let ws = 0;
      for (let i = 1; i <= group.length; i++) {
        const startTime = new Date(group[ws].createdAt!).getTime();
        const split = i === group.length || new Date(group[i].createdAt!).getTime() - startTime > WINDOW_MS;
        if (split) {
          const slice = group.slice(ws, i);
          clusters.push({
            clusterKey: `cluster-${slice[0].id}`, representative: slice[0], incidents: slice,
            count: slice.length, isCluster: slice.length > 1,
            latestDate: slice[slice.length - 1].createdAt ? new Date(slice[slice.length - 1].createdAt!) : null,
          });
          ws = i;
        }
      }
    }
    clusters.sort((a, b) => (b.latestDate?.getTime() ?? 0) - (a.latestDate?.getTime() ?? 0));
    return clusters;
  }, [incidentsList, groupSimilar]);

  const severityBreakdown = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const inc of allIncidentsList) { if (c[inc.severity] !== undefined) c[inc.severity]++; }
    return Object.entries(c).map(([name, value]) => ({ name, value })).filter(e => e.value > 0);
  }, [allIncidentsList]);

  const statusBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    for (const inc of allIncidentsList) c[inc.status] = (c[inc.status] ?? 0) + 1;
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [allIncidentsList]);

  const enrichmentStats = useMemo(() => {
    const enriched = allIncidentsList.filter(i => i.mitreTactic || i.mitreTechniqueId).length;
    const withIOCs = allIncidentsList.filter(i => getIocData(i).indicators && getIocData(i).indicators!.length > 0).length;
    const withTriage = allIncidentsList.filter(i => i.triageScore != null).length;
    const tp = allIncidentsList.filter(i => i.isTruePositive === true).length;
    const fp = allIncidentsList.filter(i => i.isTruePositive === false).length;
    const classified = tp + fp;
    const unclassified = allIncidentsList.filter(i => i.isTruePositive == null).length;
    const tpRate = classified > 0 ? Math.round((tp / classified) * 100) : 0;
    const scored = allIncidentsList.filter(i => i.confidenceScore != null);
    const avgConfidence = scored.length > 0 ? Math.round(scored.reduce((s, i) => s + (i.confidenceScore ?? 0), 0) / scored.length) : 0;
    return { enriched, withIOCs, withTriage, tp, fp, unclassified, tpRate, avgConfidence };
  }, [allIncidentsList]);

  const criticalCount = allIncidentsList.filter(i => i.severity === "critical").length;
  const highCount = allIncidentsList.filter(i => i.severity === "high").length;
  const openCount = allIncidentsList.filter(i => i.status === "open").length;

  const renderIncidentRow = (incident: Incident, isChildRow = false) => {
    const isExpanded = expandedId === incident.id;
    const insights = insightsData[incident.id];
    const isLoadingInsights = insightsMutation.isPending && insightsMutation.variables === incident.id;
    const daysOld = getDaysOld(incident.createdAt);
    const withinRetention = daysOld <= 90;

    const iocData = getIocData(incident);
    const contextData = getContextualAnalysis(incident);
    const hasMitre = !!(incident.mitreTactic || incident.mitreTechniqueId);
    const hasKillChain = !!incident.killChainPhase;
    const indicators = iocData.indicators ?? [];
    const hasIOCs = indicators.length > 0;
    const hasTriage = incident.triageScore != null;
    const hasBehavioral = !!contextData.behavioralContext;
    const enrichScore = [hasMitre, hasKillChain, hasIOCs, hasTriage, hasBehavioral].filter(Boolean).length;

    const threatFamily = detectThreatFamily(incident);
    const familyConfig = THREAT_FAMILY_CONFIG[threatFamily];
    const FamilyIcon = familyConfig.Icon;
    const subtype = getDisplaySubtype(incident);

    const smart = resolveSmartSourceDest(incident);
    const isTP = incident.isTruePositive === true;
    const isDetectingRule = detectingRuleForId === incident.id;
    const isCreatingTicket = creatingTicketForId === incident.id;

    return (
      <Fragment key={incident.id}>
        <TableRow
          data-testid={`row-incident-${incident.id}`}
          className={`cursor-pointer hover:bg-muted/30 transition-colors ${isChildRow ? "bg-muted/20 border-l-2 border-l-primary/30" : ""}`}
          onClick={() => toggleRow(incident.id)}
        >
          <TableCell className="pr-0 w-[24px]">
            <button data-testid={`btn-expand-${incident.id}`} onClick={e => { e.stopPropagation(); toggleRow(incident.id); }} className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted/40">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          </TableCell>

          <TableCell onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={`text-[9px] px-1 py-0 font-medium border ${familyConfig.bg} ${familyConfig.color} flex items-center gap-0.5`} data-testid={`badge-threat-family-${incident.id}`}>
                  <FamilyIcon className="w-2.5 h-2.5" />{threatFamily}
                </Badge>
                {subtype && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30">{subtype}</Badge>}
                <span className="text-xs font-medium truncate max-w-[260px]" data-testid={`text-name-${incident.id}`}>{incident.title}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">#{incident.id}</span>
            </div>
          </TableCell>

          <TableCell data-testid={`text-date-${incident.id}`}>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{incident.createdAt ? fmt.formatRelative(incident.createdAt) : "--"}</span>
              <span className={`text-[9px] font-mono ${withinRetention ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {daysOld}d {withinRetention ? "✓" : "⚠"}
              </span>
            </div>
          </TableCell>

          <TableCell onClick={e => e.stopPropagation()}>
            <Badge variant="outline" className={`text-[10px] cursor-pointer hover:opacity-80 font-semibold ${SEVERITY_STYLES[incident.severity]}`}
              data-testid={`badge-severity-${incident.id}`}
              onClick={() => setSeverityFilter(incident.severity)}>
              {incident.severity}
            </Badge>
          </TableCell>

          <TableCell onClick={e => e.stopPropagation()}>
            <Badge variant="outline" className={`text-[10px] cursor-pointer hover:opacity-80 ${STATUS_STYLES[incident.status]}`}
              data-testid={`badge-status-${incident.id}`}
              onClick={() => setStatusFilter(incident.status)}>
              {incident.status}
            </Badge>
          </TableCell>

          <TableCell data-testid={`text-detected-by-${incident.id}`}>
            <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
              {incident.detectionSource || incident.source || "--"}
            </span>
          </TableCell>

          <TableCell data-testid={`text-action-taken-${incident.id}`}>
            <span className="text-xs text-muted-foreground truncate max-w-[90px] block">
              {incident.actionTaken || "--"}
            </span>
          </TableCell>

          <TableCell data-testid={`badge-triage-${incident.id}`} onClick={e => e.stopPropagation()}>
            {hasTriage ? (
              <Badge variant="outline" className={`text-[10px] font-mono font-bold px-1.5 ${
                incident.triageScore! >= 80 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                : incident.triageScore! >= 60 ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                : incident.triageScore! >= 30 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                : "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
              }`}>{incident.triageScore}</Badge>
            ) : <span className="text-[10px] text-muted-foreground animate-pulse">—</span>}
          </TableCell>

          <TableCell data-testid={`enrichment-status-${incident.id}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-0.5 flex-wrap">
              {hasMitre ? (
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 font-mono" title={`${incident.mitreTactic} / ${incident.mitreTechniqueId}`}>
                  {incident.mitreTechniqueId || incident.mitreTactic?.slice(0, 4) || "ATT"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-muted/40 text-muted-foreground/60 border-muted-foreground/20">ATT</Badge>
              )}
              {hasKillChain && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30" title={incident.killChainPhase ?? ""}>KC</Badge>}
              {hasIOCs && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30">{indicators.length} IOC</Badge>}
              {incident.confidenceScore != null && (
                <Badge variant="outline" className={`text-[8px] px-1 py-0 font-mono ${
                  incident.confidenceScore >= 75 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                  : incident.confidenceScore >= 50 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                  : "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                }`} title={`Confidence: ${incident.confidenceScore}%`}>
                  {incident.confidenceScore}%
                </Badge>
              )}
              <span className="text-[8px] text-muted-foreground/60 ml-0.5">{enrichScore}/5</span>
            </div>
          </TableCell>

          <TableCell data-testid={`badge-classification-${incident.id}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              {isMSS ? (
                <>
                  <Button variant={incident.isTruePositive === true ? "default" : "outline"} size="sm"
                    className={`h-5 px-1.5 text-[10px] ${incident.isTruePositive === true ? "bg-green-600 hover:bg-green-700 text-white" : "text-green-700 dark:text-green-400 hover:bg-green-500/20"}`}
                    onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: incident.isTruePositive === true ? null : true, classification: incident.isTruePositive === true ? null : "true_positive" })}
                    data-testid={`btn-tp-quick-${incident.id}`}>TP</Button>
                  <Button variant={incident.isTruePositive === false ? "default" : "outline"} size="sm"
                    className={`h-5 px-1.5 text-[10px] ${incident.isTruePositive === false ? "bg-red-600 hover:bg-red-700 text-white" : "text-red-700 dark:text-red-400 hover:bg-red-500/20"}`}
                    onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: incident.isTruePositive === false ? null : false, classification: incident.isTruePositive === false ? null : "false_positive" })}
                    data-testid={`btn-fp-quick-${incident.id}`}>FP</Button>
                  <div className="border-l pl-1 ml-0.5 flex items-center gap-0.5">
                    <InvestigationStatusBadge tenantId={currentTenant?.id || 0} incidentId={incident.id} />
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                      onClick={e => { e.stopPropagation(); quickInvestigateMutation.mutate(incident.id); }}
                      disabled={quickInvestigateMutation.isPending && quickInvestigateMutation.variables === incident.id}
                      title="AI Investigate" data-testid={`btn-quick-investigate-${incident.id}`}>
                      {quickInvestigateMutation.isPending && quickInvestigateMutation.variables === incident.id
                        ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                    </Button>
                    <Link href={`/incident-war-room/${incident.id}`} onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Open War Room" data-testid={`btn-war-room-${incident.id}`}>
                        <Swords className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  {incident.isTruePositive === true ? <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400">TP</Badge>
                  : incident.isTruePositive === false ? <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 dark:text-red-400">FP</Badge>
                  : <span className="text-[10px] text-muted-foreground">--</span>}
                  {currentTenant?.id && <InvestigationStatusBadge tenantId={currentTenant.id} incidentId={incident.id} />}
                  {incident.isTruePositive === true && <ResponsePlanBadge incidentId={incident.id} />}
                </>
              )}
            </div>
          </TableCell>
        </TableRow>

        {isExpanded && (
          <TableRow key={`expanded-${incident.id}`} data-testid={`expanded-incident-${incident.id}`}>
            <TableCell colSpan={10} className="p-0">
              <div className="p-4 space-y-4 bg-muted/30 border-l-2 border-primary/30">
                {currentTenant?.id && <AIInvestigationPanel incidentId={incident.id} tenantId={currentTenant.id} isMSS={isMSS} />}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {incident.mitreTactic && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Target className="w-3 h-3 text-green-500" /> MITRE ATT&CK</p>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">{incident.mitreTactic}</Badge>
                          {incident.mitreTechniqueId && <Badge variant="outline" className="text-[10px] font-mono bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">{incident.mitreTechniqueId}</Badge>}
                          {incident.mitreTechnique && <Badge variant="outline" className="text-[10px] bg-muted/60">{incident.mitreTechnique}</Badge>}
                        </div>
                      </div>
                    )}
                    {incident.killChainPhase && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Layers className="w-3 h-3 text-purple-500" /> Kill Chain Phase</p>
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30">{incident.killChainPhase}</Badge>
                      </div>
                    )}
                    {incident.confidenceScore != null && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-blue-500" /> Confidence Score</p>
                        <div className="flex items-center gap-2">
                          <Progress value={incident.confidenceScore} className="h-2 flex-1" />
                          <span className="text-xs font-mono font-bold">{incident.confidenceScore}%</span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/40 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">{smart.sourceLabel}</p>
                        <p className="text-xs font-mono truncate">{smart.sourceValue}</p>
                      </div>
                      <div className="bg-muted/40 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">{smart.destLabel}</p>
                        <p className="text-xs font-mono truncate">{smart.destValue}</p>
                      </div>
                    </div>
                    {incident.affectedAssets && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Affected Assets</p>
                        <div className="flex flex-wrap gap-1">
                          {incident.affectedAssets.split(",").map((a, i) => <Badge key={i} variant="outline" className="text-[10px]">{a.trim()}</Badge>)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {incident.description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Description</p>
                        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-4">{incident.description}</p>
                      </div>
                    )}
                    {incident.enrichedDescription && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" /> AI Summary</p>
                        <p className="text-xs leading-relaxed line-clamp-5" data-testid={`text-enriched-description-${incident.id}`}>{incident.enrichedDescription}</p>
                      </div>
                    )}
                    {hasBehavioral && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Activity className="w-3 h-3 text-blue-500" /> Behavioral Context</p>
                        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-4">{contextData.behavioralContext}</p>
                      </div>
                    )}
                    {hasIOCs && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Shield className="w-3 h-3 text-orange-500" /> IOC Reputation Panel ({indicators.length})</p>
                        <div className="space-y-1">
                          {indicators.slice(0, 5).map((ioc, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px] bg-muted/40 rounded px-2 py-1" data-testid={`ioc-row-${incident.id}-${idx}`}>
                              <Badge variant="outline" className="text-[8px] px-1 py-0 flex-shrink-0">{ioc.type || "IOC"}</Badge>
                              <span className="font-mono flex-1 truncate">{ioc.value || ioc.indicator}</span>
                              {ioc.reputation && (
                                <Badge variant="outline" className={`text-[8px] px-1 py-0 flex-shrink-0 ${
                                  ioc.reputation === "malicious" ? "bg-red-500/10 text-red-600 border-red-500/30"
                                  : ioc.reputation === "suspicious" ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                  : "bg-green-500/10 text-green-600 border-green-500/30"
                                }`}>{ioc.reputation}</Badge>
                              )}
                              {ioc.country && (
                                <span className="text-[9px] text-muted-foreground font-mono flex-shrink-0">{ioc.country}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {incident.recommendation && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{incident.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Family-Specific Content Panels */}
                {threatFamily === "Email" && (incident.sourceIp || incident.destinationIp || incident.affectedAssets) && (
                  <div className="border rounded-lg bg-orange-500/5 border-orange-500/20 p-3" data-testid={`panel-email-${incident.id}`}>
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />Email Threat Metadata
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="bg-background/50 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Sender IP / From</p>
                        <p className="text-xs font-mono truncate">{incident.sourceIp || "—"}</p>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Recipient / To</p>
                        <p className="text-xs font-mono truncate">{incident.destinationIp || incident.affectedAssets?.split(",")[0]?.trim() || "—"}</p>
                      </div>
                      {getIocData(incident).phishingSubtype && (
                        <div className="bg-background/50 rounded p-2">
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Phishing Type</p>
                          <p className="text-xs">{getIocData(incident).phishingSubtype}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {threatFamily === "Network" && (incident.sourceIp || incident.destinationIp) && (
                  <div className="border rounded-lg bg-blue-500/5 border-blue-500/20 p-3" data-testid={`panel-network-${incident.id}`}>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5" />Network Flow
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="bg-background/50 rounded p-2 flex-1 min-w-[100px]">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Source IP</p>
                        <p className="text-xs font-mono">{incident.sourceIp || "—"}</p>
                      </div>
                      <div className="text-muted-foreground">→</div>
                      <div className="bg-background/50 rounded p-2 flex-1 min-w-[100px]">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Destination IP</p>
                        <p className="text-xs font-mono">{incident.destinationIp || "—"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {threatFamily === "Multi-Stage" && incident.killChainPhase && (
                  <div className="border rounded-lg bg-purple-500/5 border-purple-500/20 p-3" data-testid={`panel-multistage-${incident.id}`}>
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5" />Kill Chain Progression
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {["Reconnaissance","Weaponization","Delivery","Exploitation","Installation","C2","Actions on Objective"].map((phase, idx) => {
                        const current = incident.killChainPhase?.toLowerCase();
                        const isActive = current && (phase.toLowerCase().includes(current) || current.includes(phase.toLowerCase().split(" ")[0].toLowerCase()));
                        return (
                          <div key={idx} className="flex items-center gap-1">
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0.5 ${isActive ? "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/40 font-bold" : "text-muted-foreground/50"}`}>
                              {phase}
                            </Badge>
                            {idx < 6 && <span className="text-muted-foreground/30 text-[10px]">›</span>}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Current Phase: <span className="font-semibold text-purple-600 dark:text-purple-400">{incident.killChainPhase}</span></p>
                  </div>
                )}

                {threatFamily === "Sigma" && (
                  <div className="border rounded-lg bg-cyan-500/5 border-cyan-500/20 p-3" data-testid={`panel-sigma-${incident.id}`}>
                    <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 mb-2 flex items-center gap-1.5">
                      <FlaskConical className="w-3.5 h-3.5" />Sigma Rule Detection
                    </p>
                    <div className="space-y-1">
                      {(incident.sigmaMatches as Array<{ rule?: string; name?: string; severity?: string; tags?: string[] }> | null)?.slice(0, 5).map((sigma, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[10px] bg-background/50 rounded px-2 py-1">
                          <Server className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                          <span className="font-mono flex-1 truncate">{sigma.rule || sigma.name || `Sigma Rule #${idx + 1}`}</span>
                          {sigma.severity && <Badge variant="outline" className="text-[8px] px-1 py-0">{sigma.severity}</Badge>}
                        </div>
                      ))}
                      {(!incident.sigmaMatches || (incident.sigmaMatches as unknown[]).length === 0) && (
                        <p className="text-xs text-muted-foreground">No Sigma rule details available.</p>
                      )}
                    </div>
                  </div>
                )}

                {threatFamily === "Malware" && (
                  <div className="border rounded-lg bg-red-500/5 border-red-500/20 p-3" data-testid={`panel-malware-${incident.id}`}>
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                      <Skull className="w-3.5 h-3.5" />Malware Intelligence
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-background/50 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Malware Family</p>
                        <p className="text-xs font-mono">{getIocData(incident).malwareFamily || incident.category || "Unknown"}</p>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Affected System</p>
                        <p className="text-xs font-mono truncate">{incident.affectedAssets?.split(",")[0]?.trim() || incident.destinationIp || "—"}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
                  <Link href={`/incident-war-room/${incident.id}`} onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="default" className="bg-red-700 hover:bg-red-800 text-white" data-testid={`button-open-war-room-detail-${incident.id}`}>
                      <Swords className="w-3.5 h-3.5 mr-1.5" />Open War Room
                    </Button>
                  </Link>
                  {isMSS && incident.status === "open" && (
                    <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
                      onClick={e => { e.stopPropagation(); updateMutation.mutate({ id: incident.id, status: "investigating" }); }}
                      data-testid={`button-escalate-${incident.id}`}>
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />Escalate
                    </Button>
                  )}
                  {isMSS && (
                    <Button size="sm" variant="outline"
                      onClick={e => { e.stopPropagation(); handleCreateTicket(incident); }}
                      disabled={isCreatingTicket}
                      data-testid={`button-create-ticket-${incident.id}`}>
                      {isCreatingTicket ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</> : <><Ticket className="w-3.5 h-3.5 mr-1.5" />Create Ticket</>}
                    </Button>
                  )}
                  {isMSS && (
                    <Button size="sm" variant="outline"
                      onClick={e => { e.stopPropagation(); singleEnrichMutation.mutate(incident.id); }}
                      disabled={singleEnrichMutation.isPending && singleEnrichMutation.variables === incident.id}
                      data-testid={`button-ai-enrich-${incident.id}`}>
                      {singleEnrichMutation.isPending && singleEnrichMutation.variables === incident.id
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enriching...</>
                        : <><Zap className="w-3.5 h-3.5 mr-1.5" />AI Enrich</>}
                    </Button>
                  )}
                  {isMSS && (
                    <Button size="sm" variant="outline"
                      onClick={e => { e.stopPropagation(); singleDescribeMutation.mutate(incident.id); }}
                      disabled={singleDescribeMutation.isPending && singleDescribeMutation.variables === incident.id}
                      data-testid={`button-ai-describe-${incident.id}`}>
                      {singleDescribeMutation.isPending && singleDescribeMutation.variables === incident.id
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Describing...</>
                        : <><FileText className="w-3.5 h-3.5 mr-1.5" />AI Describe</>}
                    </Button>
                  )}
                  {!insights && (
                    <Button size="sm" variant="outline"
                      onClick={e => { e.stopPropagation(); insightsMutation.mutate(incident.id); }}
                      disabled={isLoadingInsights}
                      data-testid={`button-ai-insights-${incident.id}`}>
                      {isLoadingInsights
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing...</>
                        : <><Brain className="w-3.5 h-3.5 mr-1.5" />Get AI Insights</>}
                    </Button>
                  )}
                  {isMSS && isTP && (
                    <Button size="sm" variant="outline"
                      className="border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
                      onClick={e => { e.stopPropagation(); handleGenerateDetectionRule(incident); }}
                      disabled={isDetectingRule}
                      data-testid={`button-generate-detection-rule-${incident.id}`}>
                      {isDetectingRule
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-purple-500" />Generating...</>
                        : <><Code2 className="w-3.5 h-3.5 mr-1.5 text-purple-500" />Generate Detection Rule</>}
                    </Button>
                  )}
                </div>

                {insights && (
                  <div className="space-y-4 border-t pt-4" data-testid={`ai-insights-${incident.id}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-chart-1" />
                      <span className="text-sm font-semibold">AI Insights</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{insights.relatedEventsCount} related events</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div><p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Shield className="w-3 h-3" /> Risk Assessment</p><p className="text-sm">{insights.insights.riskAssessment}</p></div>
                        <div><p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Attack Vector</p><p className="text-sm">{insights.insights.attackVector}</p></div>
                        <div><p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> MITRE Mappings</p><div className="flex flex-wrap gap-1">{insights.insights.mitreMappings.map((m, idx) => <Badge key={idx} variant="outline" className="text-[10px]">{m}</Badge>)}</div></div>
                      </div>
                      <div className="space-y-3">
                        <div><p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p><ol className="list-decimal list-inside space-y-1">{insights.insights.recommendations.map((r, idx) => <li key={idx} className="text-sm">{r}</li>)}</ol></div>
                        <div><p className="text-xs font-medium text-muted-foreground mb-1">Priority Score</p>
                          <Badge variant="outline" className={`text-[10px] ${insights.insights.priorityScore >= 80 ? "bg-destructive/10 text-destructive" : insights.insights.priorityScore >= 60 ? "bg-chart-4/10 text-chart-4" : "bg-chart-2/10 text-chart-2"}`}>
                            {insights.insights.priorityScore}/100
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-full">
      <PageHero
        icon={AlertTriangle}
        iconColor="text-red-500"
        title="Incidents"
        description="Intelligent incident management console with AI enrichment, threat-family detection, MITRE ATT&CK mapping, and automated triage scoring."
        badge="AI-Enhanced"
        cyberAccent
        stats={[
          { label: "Total", value: total.toLocaleString() },
          { label: "Critical", value: criticalCount, accent: criticalCount > 0 },
          { label: "High", value: highCount },
          { label: "Open", value: openCount, accent: openCount > 0 },
          { label: "TP Rate", value: enrichmentStats.tpRate > 0 ? `${enrichmentStats.tpRate}%` : "—" },
          { label: "Avg Confidence", value: enrichmentStats.avgConfidence > 0 ? `${enrichmentStats.avgConfidence}%` : "—" },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
              <Button size="sm" variant={viewMode === "table" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs"
                onClick={() => setViewMode("table")} data-testid="btn-view-table">
                <Database className="w-3.5 h-3.5" /> Table
              </Button>
              <Button size="sm" variant={viewMode === "analytics" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs"
                onClick={() => setViewMode("analytics")} data-testid="btn-view-analytics">
                <BarChart2 className="w-3.5 h-3.5" /> Analytics
              </Button>
            </div>
            {isMSS && currentTenant?.id && (
              <CreateIncidentDialog tenantId={currentTenant.id}
                onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant.id, "incidents"] })} />
            )}
            {isMSS && (
              <Button size="sm" variant="outline" onClick={handleBulkEnrich} disabled={bulkEnriching}
                className="h-8 gap-1.5 text-xs" data-testid="btn-bulk-enrich">
                {bulkEnriching
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enriching {bulkProgress}/{bulkTotal}</>
                  : <><Sparkles className="w-3.5 h-3.5" />Bulk AI Enrich All</>}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/security-console", currentTenant?.id, "incidents"] })}
              title="Refresh" data-testid="btn-refresh-incidents">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {/* TP/FP/Unclassified Stats Bar */}
      {allIncidentsList.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="px-4 py-2.5">
            <div className="flex items-center gap-6 flex-wrap" data-testid="stats-bar">
              <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wide">Page Stats</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 font-mono px-2">
                  TP: {enrichmentStats.tp}
                </Badge>
                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30 font-mono px-2">
                  FP: {enrichmentStats.fp}
                </Badge>
                <Badge variant="outline" className="text-xs bg-muted/40 text-muted-foreground font-mono px-2">
                  Unclassified: {enrichmentStats.unclassified}
                </Badge>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>TP Rate:</span>
                <span className={`font-mono font-semibold ${enrichmentStats.tpRate >= 70 ? "text-green-600 dark:text-green-400" : enrichmentStats.tpRate >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                  {enrichmentStats.tpRate > 0 ? `${enrichmentStats.tpRate}%` : "—"}
                </span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Brain className="w-3.5 h-3.5 text-primary" />
                <span>Avg Confidence:</span>
                <span className="font-mono font-semibold">{enrichmentStats.avgConfidence > 0 ? `${enrichmentStats.avgConfidence}%` : "—"}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span>MITRE Mapped:</span>
                <span className="font-mono font-semibold">{enrichmentStats.enriched}/{allIncidentsList.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {bulkEnriching && bulkTotal > 0 && (
        <Card className="border-primary/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Bulk AI Enrichment in Progress</span>
                  <span className="text-muted-foreground">{bulkProgress}/{bulkTotal}</span>
                </div>
                <Progress value={bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0} className="h-1.5" />
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => { bulkAbortRef.current = true; setBulkEnriching(false); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "analytics" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" />Severity Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={220}>
                <RechartsPieChart>
                  <Pie data={severityBreakdown} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name" label={({ name, percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                    {severityBreakdown.map((entry, idx) => <Cell key={idx} fill={SEVERITY_COLORS[entry.name] ?? "#6b7280"} />)}
                  </Pie>
                  <RechartsTooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {severityBreakdown.map(e => (
                  <div key={e.name} className="flex items-center gap-1 text-[10px]">
                    <div className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[e.name] }} />
                    <span className="capitalize">{e.name} ({e.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" />Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusBreakdown} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Enrichment Coverage</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {[
                { label: "MITRE Mapped", value: enrichmentStats.enriched, color: "bg-blue-500" },
                { label: "With IOCs", value: enrichmentStats.withIOCs, color: "bg-orange-500" },
                { label: "Triage Scored", value: enrichmentStats.withTriage, color: "bg-purple-500" },
                { label: "True Positives", value: enrichmentStats.tp, color: "bg-green-500" },
                { label: "False Positives", value: enrichmentStats.fp, color: "bg-red-500" },
              ].map(stat => (
                <div key={stat.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="font-mono font-semibold">{stat.value}<span className="text-muted-foreground font-normal">/{allIncidentsList.length}</span></span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${stat.color} transition-all`} style={{ width: `${allIncidentsList.length > 0 ? (stat.value / allIncidentsList.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-primary" />Classification Quality</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{enrichmentStats.tp}</p>
                  <p className="text-[9px] text-muted-foreground font-medium">True Pos.</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{enrichmentStats.fp}</p>
                  <p className="text-[9px] text-muted-foreground font-medium">False Pos.</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-lg font-bold text-muted-foreground">{enrichmentStats.unclassified}</p>
                  <p className="text-[9px] text-muted-foreground font-medium">Unclassified</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">TP Rate</span>
                  <span className={`font-mono font-semibold ${enrichmentStats.tpRate >= 70 ? "text-green-600 dark:text-green-400" : enrichmentStats.tpRate >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>{enrichmentStats.tpRate}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${enrichmentStats.tpRate >= 70 ? "bg-green-500" : enrichmentStats.tpRate >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${enrichmentStats.tpRate}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Avg Confidence</span>
                  <span className="font-mono font-semibold">{enrichmentStats.avgConfidence}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${enrichmentStats.avgConfidence}%` }} />
                </div>
              </div>
              <div className="pt-1 border-t">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Enrichment Score</span>
                  <Badge variant="outline" className={`text-[9px] font-mono ${enrichmentStats.enriched / Math.max(allIncidentsList.length, 1) >= 0.7 ? "border-green-500/40 text-green-600" : enrichmentStats.enriched / Math.max(allIncidentsList.length, 1) >= 0.4 ? "border-yellow-500/40 text-yellow-600" : "border-red-500/40 text-red-500"}`}>
                    {allIncidentsList.length > 0 ? Math.round((enrichmentStats.enriched / allIncidentsList.length) * 100) : 0}% enriched
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-2 px-4 py-3 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 border rounded-lg p-0.5" data-testid="severity-filter-bar">
              {SEVERITY_FILTER_OPTIONS.map(opt => (
                <Button key={opt.value} variant={severityFilter === opt.value ? "default" : "ghost"} size="sm"
                  className={`h-6 text-[10px] px-2 ${severityFilter === opt.value ? "" : opt.cls}`}
                  onClick={() => { setSeverityFilter(opt.value); setPage(1); }}
                  data-testid={`severity-filter-${opt.value}`}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search incidents..." className="pl-8 h-8 w-48 text-xs" value={searchInput}
                  onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                  data-testid="input-incident-search" />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={classificationFilter} onValueChange={v => { setClassificationFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-classification-filter"><SelectValue placeholder="Classification" /></SelectTrigger>
                <SelectContent>{CLASSIFICATION_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground"
                  onClick={clearFilters} data-testid="btn-clear-filters">
                  <X className="w-3.5 h-3.5" />Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={groupSimilar} onCheckedChange={setGroupSimilar} id="group-similar-incidents" data-testid="switch-group-similar" />
                <label htmlFor="group-similar-incidents" className="cursor-pointer select-none flex items-center gap-1">
                  <Layers className="w-3 h-3" />Group Similar
                  {groupSimilar && clusteredIncidents.some(c => c.isCluster) && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{clusteredIncidents.filter(c => c.isCluster).length} clusters</Badge>
                  )}
                </label>
              </div>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-page-size"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
              </Select>
              <Badge variant="secondary" className="text-xs" data-testid="text-total-incidents">{total.toLocaleString()} total</Badge>
            </div>
          </div>
        </div>

        {incidentsQuery.isLoading ? (
          <CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent>
        ) : incidentsQuery.isError ? (
          <CardContent className="p-4">
            <QueryErrorState moduleName="Incidents" onRetry={() => incidentsQuery.refetch()} />
          </CardContent>
        ) : incidentsList.length === 0 ? (
          <CardContent className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No incidents found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasActiveFilters ? "Try adjusting your filters." : "No incidents match the current criteria."}
            </p>
            {hasActiveFilters && <Button size="sm" variant="outline" className="mt-3" onClick={clearFilters}>Clear filters</Button>}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[24px]" />
                  <TableHead className="min-w-[280px]">Name</TableHead>
                  <TableHead className="w-[100px]">Date/Time</TableHead>
                  <TableHead className="w-[90px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[110px]">Detected By</TableHead>
                  <TableHead className="w-[100px]">Action Taken</TableHead>
                  <TableHead className="w-[70px]">Triage</TableHead>
                  <TableHead className="w-[160px]">Enrichment</TableHead>
                  <TableHead className="min-w-[160px]">Classification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusteredIncidents.map(({ clusterKey, representative, incidents: clusterIncs, count, isCluster }) => {
                  if (!isCluster) return <Fragment key={clusterKey}>{renderIncidentRow(representative)}</Fragment>;
                  const clusterExpanded = expandedClusters.has(clusterKey);
                  const tpCount = clusterIncs.filter(i => i.isTruePositive === true).length;
                  const fpCount = clusterIncs.filter(i => i.isTruePositive === false).length;
                  const familyCfg = THREAT_FAMILY_CONFIG[detectThreatFamily(representative)];
                  const FIcon = familyCfg.Icon;
                  return (
                    <Fragment key={clusterKey}>
                      <TableRow
                        className="cursor-pointer bg-primary/[0.03] hover:bg-primary/[0.06] border-l-2 border-l-primary/50 transition-colors"
                        data-testid={`cluster-row-${clusterKey}`}
                        onClick={() => setExpandedClusters(prev => { const n = new Set(prev); n.has(clusterKey) ? n.delete(clusterKey) : n.add(clusterKey); return n; })}
                      >
                        <TableCell className="pr-0">
                          {clusterExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-primary" />}
                        </TableCell>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 border ${familyCfg.bg} ${familyCfg.color} flex items-center gap-0.5`}>
                                <FIcon className="w-2.5 h-2.5" />{detectThreatFamily(representative)}
                              </Badge>
                              <span className="text-xs font-medium">{representative.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Layers className="w-3 h-3 text-primary" />
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold">x{count}</Badge>
                              {tpCount > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-700">{tpCount} TP</Badge>}
                              {fpCount > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-500/10 text-red-700">{fpCount} FP</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell colSpan={4}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[representative.severity]}`}>{representative.severity}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[representative.status]}`}>{representative.status}</Badge>
                            <span className="text-xs text-muted-foreground ml-auto">{representative.detectionSource || representative.source || "--"}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {clusterExpanded && clusterIncs.map(child => renderIncidentRow(child, true))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} incidents</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPage(1)} disabled={page === 1} data-testid="btn-page-first">«</Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="btn-page-prev"><ChevronLeft className="w-3.5 h-3.5" /></Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pn = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                if (pn > totalPages) return null;
                return (
                  <Button key={pn} size="sm" variant={pn === page ? "default" : "outline"} className="h-7 w-7 p-0 text-xs"
                    onClick={() => setPage(pn)} data-testid={`btn-page-${pn}`}>{pn}</Button>
                );
              })}
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="btn-page-next"><ChevronRight className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setPage(totalPages)} disabled={page === totalPages} data-testid="btn-page-last">»</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
