import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Incident } from "@shared/schema";
import { MITRE_TACTICS, KILL_CHAIN_PHASES } from "@shared/schema";
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Brain,
  Sparkles,
  Clock,
  Loader2,
  Shield,
  Target,
  Zap,
  Eye,
  CheckCircle2,
  XCircle,
  X,
  Activity,
  CalendarClock,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

function getTypeBadgeBySeverity(severity: string, isFalsePositive?: boolean | null): string {
  if (isFalsePositive === false) return "bg-green-600 text-white dark:bg-green-700";
  switch (severity) {
    case "critical": return "bg-red-800 text-white dark:bg-red-900";
    case "high": return "bg-red-600 text-white dark:bg-red-700";
    case "medium": return "bg-orange-500 text-white dark:bg-orange-600";
    case "low": return "bg-blue-500 text-white dark:bg-blue-600";
    case "info": return "bg-green-500 text-white dark:bg-green-600";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatRelativeTime(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatTimestamp(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const formatted = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const relative = formatRelativeTime(dateStr);
  return `${formatted} (${relative})`;
}

function getPriorityScoreColor(score: number): string {
  if (score >= 80) return "bg-destructive/10 text-destructive";
  if (score >= 60) return "bg-chart-4/10 text-chart-4";
  if (score >= 40) return "bg-chart-1/10 text-chart-1";
  return "bg-chart-2/10 text-chart-2";
}

function getDaysOld(dateStr: string | Date): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

interface AIInsights {
  riskAssessment: string;
  attackVector: string;
  mitreMappings: string[];
  impactAnalysis: string;
  recommendations: string[];
  predictions: string[];
  relatedThreats: string[];
  priorityScore: number;
}

interface AIInsightsResponse {
  insights: AIInsights;
  relatedEventsCount: number;
}

export default function IncidentsPage() {
  const { currentTenant, userRole, isMSS } = useTenant();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [insightsData, setInsightsData] = useState<Record<number, AIInsightsResponse>>({});

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ["/api/incidents", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/incidents", { ...data, tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      setDialogOpen(false);
      toast({ title: "Incident created", description: "New incident has been logged." });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/enrich-incidents", { tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({ title: "AI Enrichment Complete", description: data.message });
    },
    onError: () => {
      toast({ title: "Enrichment failed", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/incidents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({ title: "Incident updated" });
    },
  });

  const insightsMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const res = await apiRequest("POST", "/api/ai/incident-insights", { incidentId });
      return res.json() as Promise<AIInsightsResponse>;
    },
    onSuccess: (data, incidentId) => {
      setInsightsData((prev) => ({ ...prev, [incidentId]: data }));
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to fetch AI insights.", variant: "destructive" });
    },
  });

  const singleEnrichMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const res = await apiRequest("POST", `/api/ai/enrich-incident/${incidentId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents", currentTenant?.id] });
      toast({ title: "Enriched", description: "Incident enriched with MITRE, Kill Chain, detection source, and IOC data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to enrich incident.", variant: "destructive" });
    },
  });

  const filtered = incidents.filter((inc) => {
    const matchesSearch = !search || inc.title.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = severityFilter === "all" || inc.severity === severityFilter;
    const matchesStatus = statusFilter === "all" || inc.status === statusFilter;
    const matchesType = typeFilter === "all" || (inc.incidentType || inc.category || "General") === typeFilter;
    const matchesName = nameFilter === "all" || inc.title === nameFilter;
    const matchesAction = actionFilter === "all" || (inc.actionTaken || "") === actionFilter;
    return matchesSearch && matchesSeverity && matchesStatus && matchesType && matchesName && matchesAction;
  });

  const activeFilterCount = [typeFilter, nameFilter, actionFilter].filter(f => f !== "all").length;

  const clearAllFilters = () => {
    setSeverityFilter("all");
    setStatusFilter("all");
    setTypeFilter("all");
    setNameFilter("all");
    setActionFilter("all");
    setSearch("");
  };

  const stats = {
    total: incidents.length,
    truePositives: incidents.filter((i) => i.isTruePositive === true).length,
    falsePositives: incidents.filter((i) => i.isTruePositive === false).length,
    unclassified: incidents.filter((i) => i.isTruePositive === null || i.isTruePositive === undefined).length,
    avgConfidence: incidents.filter((i) => i.confidenceScore != null).length > 0
      ? Math.round(
          incidents.filter((i) => i.confidenceScore != null).reduce((sum, i) => sum + (i.confidenceScore ?? 0), 0) /
            incidents.filter((i) => i.confidenceScore != null).length
        )
      : 0,
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const mitreTactic = formData.get("mitreTactic") as string;
    const killChainPhase = formData.get("killChainPhase") as string;
    const classification = formData.get("classification") as string;
    createMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      severity: formData.get("severity"),
      source: formData.get("source"),
      category: formData.get("category"),
      mitreTactic: mitreTactic && mitreTactic !== "_none" ? mitreTactic : undefined,
      mitreTechniqueId: formData.get("mitreTechniqueId") || undefined,
      mitreTechnique: formData.get("mitreTechniqueName") || undefined,
      killChainPhase: killChainPhase && killChainPhase !== "_none" ? killChainPhase : undefined,
      classification: classification && classification !== "_none" ? classification : undefined,
      isTruePositive: classification === "true_positive" ? true : classification === "false_positive" ? false : undefined,
    });
  };

  const toggleRow = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Incident Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- {incidents.length} total incidents
          </p>
        </div>
        {isMSS && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => enrichMutation.mutate()}
              disabled={enrichMutation.isPending}
              data-testid="button-bulk-enrich"
            >
              {enrichMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enriching...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" />AI Enrich All</>
              )}
            </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-incident">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Incident
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Incident</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required data-testid="input-incident-title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" data-testid="input-incident-description" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select name="severity" defaultValue="medium">
                      <SelectTrigger data-testid="select-severity"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select name="category" defaultValue="malware">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="malware">Malware</SelectItem>
                        <SelectItem value="phishing">Phishing</SelectItem>
                        <SelectItem value="intrusion">Intrusion</SelectItem>
                        <SelectItem value="data_breach">Data Breach</SelectItem>
                        <SelectItem value="ddos">DDoS</SelectItem>
                        <SelectItem value="insider_threat">Insider Threat</SelectItem>
                        <SelectItem value="vulnerability">Vulnerability</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" name="source" placeholder="e.g., SIEM, EDR, Firewall" data-testid="input-incident-source" />
                </div>

                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Framework Enrichment (Optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>MITRE Tactic</Label>
                      <Select name="mitreTactic" defaultValue="_none">
                        <SelectTrigger data-testid="select-create-mitre-tactic"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {MITRE_TACTICS.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Kill Chain Phase</Label>
                      <Select name="killChainPhase" defaultValue="_none">
                        <SelectTrigger data-testid="select-create-kill-chain"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {KILL_CHAIN_PHASES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="mitreTechniqueId">Technique ID</Label>
                      <Input id="mitreTechniqueId" name="mitreTechniqueId" placeholder="e.g., T1566.001" data-testid="input-create-technique-id" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mitreTechniqueName">Technique Name</Label>
                      <Input id="mitreTechniqueName" name="mitreTechniqueName" placeholder="e.g., Spearphishing" data-testid="input-create-technique-name" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Classification</Label>
                    <Select name="classification" defaultValue="_none">
                      <SelectTrigger data-testid="select-create-classification"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Unclassified</SelectItem>
                        <SelectItem value="true_positive">True Positive</SelectItem>
                        <SelectItem value="false_positive">False Positive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-incident">
                  {createMutation.isPending ? "Creating..." : "Create Incident"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="incident-stats-bar">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="text-lg font-semibold" data-testid="stat-total">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> True Positives</p>
            <p className="text-lg font-semibold text-green-600" data-testid="stat-true-positives">{stats.truePositives}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3 text-red-600" /> False Positives</p>
            <p className="text-lg font-semibold text-red-600" data-testid="stat-false-positives">{stats.falsePositives}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Unclassified</p>
            <p className="text-lg font-semibold text-muted-foreground" data-testid="stat-unclassified">{stats.unclassified}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Avg Confidence</p>
            <p className="text-lg font-semibold" data-testid="stat-avg-confidence">{stats.avgConfidence}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-incidents"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="w-3 h-3 mr-1.5" />
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="contained">Contained</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(activeFilterCount > 0 || severityFilter !== "all" || statusFilter !== "all") && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="active-filters-bar">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {typeFilter !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1 pr-1" data-testid="filter-chip-type">
              Type: {typeFilter}
              <button onClick={() => setTypeFilter("all")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          {nameFilter !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1 pr-1" data-testid="filter-chip-name">
              Name: {nameFilter.length > 30 ? nameFilter.substring(0, 30) + "..." : nameFilter}
              <button onClick={() => setNameFilter("all")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          {severityFilter !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1 pr-1" data-testid="filter-chip-severity">
              Severity: {severityFilter}
              <button onClick={() => setSeverityFilter("all")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1 pr-1" data-testid="filter-chip-status">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          {actionFilter !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1 pr-1" data-testid="filter-chip-action">
              Action: {actionFilter.length > 30 ? actionFilter.substring(0, 30) + "..." : actionFilter}
              <button onClick={() => setActionFilter("all")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearAllFilters} data-testid="button-clear-filters">
            Clear all
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {incidents.length} incidents</span>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6"><Skeleton className="h-64" /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No incidents found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try adjusting your search or filters" : "No incidents have been recorded yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead className="w-[50px]">ID</TableHead>
                  <TableHead className="w-[90px]">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px]">Source</TableHead>
                  <TableHead className="w-[120px]">Destination</TableHead>
                  <TableHead className="w-[90px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[90px]">Classification</TableHead>
                  <TableHead className="w-[110px]">Action Taken</TableHead>
                  <TableHead className="w-[100px]">Frameworks</TableHead>
                  {isMSS && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((incident) => {
                  const isExpanded = expandedId === incident.id;
                  const insights = insightsData[incident.id];
                  const isLoadingInsights = insightsMutation.isPending && insightsMutation.variables === incident.id;
                  const daysOld = getDaysOld(incident.createdAt);
                  const withinRetention = daysOld <= 90;

                  return (
                    <Fragment key={incident.id}>
                      <TableRow
                        data-testid={`row-incident-${incident.id}`}
                        className="cursor-pointer"
                        onClick={() => toggleRow(incident.id)}
                      >
                        <TableCell className="pr-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">#{incident.id}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Badge
                            className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity border-0 ${getTypeBadgeBySeverity(incident.severity, incident.isTruePositive)}`}
                            data-testid={`badge-type-${incident.id}`}
                            onClick={() => setTypeFilter(incident.incidentType || incident.category || "General")}
                          >
                            {incident.incidentType || incident.category || "General"}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <span
                            className="text-xs font-medium cursor-pointer hover:underline hover:text-primary transition-colors"
                            data-testid={`text-name-${incident.id}`}
                            onClick={() => setNameFilter(incident.title)}
                          >
                            {incident.title}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-source-${incident.id}`}>
                          {incident.sourceIp || incident.source || "--"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {incident.destinationIp ? (
                            <span
                              className="text-xs font-mono cursor-pointer hover:underline text-primary transition-colors"
                              data-testid={`text-dest-${incident.id}`}
                              onClick={() => setLocation(`/assets/${currentTenant?.id}/${encodeURIComponent(incident.destinationIp!)}`)}
                            >
                              {incident.destinationIp}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono" data-testid={`text-dest-${incident.id}`}>--</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Badge
                            variant="outline"
                            className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${SEVERITY_STYLES[incident.severity]}`}
                            data-testid={`badge-severity-${incident.id}`}
                            onClick={() => setSeverityFilter(incident.severity)}
                          >
                            {incident.severity}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Badge
                            variant="outline"
                            className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${STATUS_STYLES[incident.status]}`}
                            data-testid={`badge-status-${incident.id}`}
                            onClick={() => setStatusFilter(incident.status)}
                          >
                            {incident.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`badge-classification-${incident.id}`}>
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            {isMSS ? (
                              <>
                                <Button
                                  variant={incident.isTruePositive === true ? "default" : "outline"}
                                  size="sm"
                                  className={`h-5 px-1.5 text-[10px] ${incident.isTruePositive === true ? "bg-green-600 hover:bg-green-700 text-white" : "text-green-700 dark:text-green-400 hover:bg-green-500/20"}`}
                                  onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: incident.isTruePositive === true ? null : true, classification: incident.isTruePositive === true ? null : "true_positive" })}
                                  data-testid={`btn-tp-quick-${incident.id}`}
                                >
                                  TP
                                </Button>
                                <Button
                                  variant={incident.isTruePositive === false ? "default" : "outline"}
                                  size="sm"
                                  className={`h-5 px-1.5 text-[10px] ${incident.isTruePositive === false ? "bg-red-600 hover:bg-red-700 text-white" : "text-red-700 dark:text-red-400 hover:bg-red-500/20"}`}
                                  onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: incident.isTruePositive === false ? null : false, classification: incident.isTruePositive === false ? null : "false_positive" })}
                                  data-testid={`btn-fp-quick-${incident.id}`}
                                >
                                  FP
                                </Button>
                              </>
                            ) : (
                              <>
                                {incident.isTruePositive === true ? (
                                  <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400">TP</Badge>
                                ) : incident.isTruePositive === false ? (
                                  <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 dark:text-red-400">FP</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">--</span>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {incident.actionTaken ? (
                            <span
                              className="text-xs text-muted-foreground cursor-pointer hover:underline hover:text-primary transition-colors"
                              data-testid={`text-action-${incident.id}`}
                              onClick={() => setActionFilter(incident.actionTaken!)}
                            >
                              {incident.actionTaken}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground" data-testid={`text-action-${incident.id}`}>--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {incident.mitreTactic && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-700 dark:text-green-400" data-testid={`badge-mitre-${incident.id}`}>
                                    MITRE
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{incident.mitreTactic}{incident.mitreTechniqueId ? ` (${incident.mitreTechniqueId})` : ""}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {incident.killChainPhase && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-400" data-testid={`badge-lmkc-${incident.id}`}>
                                    LMKC
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{incident.killChainPhase}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {!incident.mitreTactic && !incident.killChainPhase && (
                              <span className="text-[10px] text-muted-foreground">--</span>
                            )}
                          </div>
                        </TableCell>
                        {isMSS && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={incident.status}
                              onValueChange={(status) => updateMutation.mutate({ id: incident.id, status })}
                            >
                              <SelectTrigger className="h-7 text-[10px] w-[80px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="investigating">Investigating</SelectItem>
                                <SelectItem value="contained">Contained</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`expanded-${incident.id}`} data-testid={`expanded-incident-${incident.id}`}>
                          <TableCell colSpan={isMSS ? 12 : 11} className="p-0">
                            <div className="p-4 space-y-4 bg-muted/30">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                      <Eye className="w-3 h-3" /> Description
                                    </p>
                                    <p className="text-sm" data-testid={`text-description-${incident.id}`}>
                                      {incident.description || "No description provided"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Affected Assets</p>
                                    <p className="text-sm" data-testid={`text-assets-${incident.id}`}>
                                      {incident.affectedAssets || "None specified"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Category</p>
                                    <p className="text-sm capitalize" data-testid={`text-category-${incident.id}`}>
                                      {incident.category || "--"}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Event Source</p>
                                    <p className="text-sm" data-testid={`text-eventsource-${incident.id}`}>
                                      {incident.source || "--"}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Source IP</p>
                                      <p className="text-sm font-mono">{incident.sourceIp || "--"}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Destination IP</p>
                                      <p className="text-sm font-mono">{incident.destinationIp || "--"}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                                    <p className="text-sm" data-testid={`text-recommendation-${incident.id}`}>
                                      {incident.recommendation || "No recommendation yet"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                <Card data-testid={`panel-mitre-${incident.id}`}>
                                  <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs flex items-center gap-1.5">
                                      <Shield className="w-3.5 h-3.5 text-green-600" />
                                      MITRE ATT&CK
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-0 space-y-2">
                                    {incident.mitreTactic ? (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400" data-testid={`text-mitre-tactic-${incident.id}`}>
                                            {incident.mitreTactic}
                                          </Badge>
                                          {incident.mitreTechniqueId && (
                                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400" data-testid={`text-mitre-technique-id-${incident.id}`}>
                                              {incident.mitreTechniqueId}
                                            </Badge>
                                          )}
                                        </div>
                                        {incident.mitreTechnique && (
                                          <p className="text-xs text-muted-foreground" data-testid={`text-mitre-technique-${incident.id}`}>
                                            {incident.mitreTechnique}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Not enriched</p>
                                    )}
                                    {isMSS && (
                                      <div className="space-y-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                                        <Select
                                          value={incident.mitreTactic || "_none"}
                                          onValueChange={(val) => updateMutation.mutate({ id: incident.id, mitreTactic: val === "_none" ? null : val })}
                                        >
                                          <SelectTrigger className="h-7 text-[10px]" data-testid={`select-mitre-tactic-${incident.id}`}>
                                            <SelectValue placeholder="Set tactic" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="_none">None</SelectItem>
                                            {MITRE_TACTICS.map((t) => (
                                              <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Input
                                          className="h-7 text-[10px]"
                                          placeholder="Technique ID (e.g., T1566)"
                                          defaultValue={incident.mitreTechniqueId || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== (incident.mitreTechniqueId || "")) {
                                              updateMutation.mutate({ id: incident.id, mitreTechniqueId: e.target.value || null });
                                            }
                                          }}
                                          data-testid={`input-mitre-technique-id-${incident.id}`}
                                        />
                                        <Input
                                          className="h-7 text-[10px]"
                                          placeholder="Technique name"
                                          defaultValue={incident.mitreTechnique || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== (incident.mitreTechnique || "")) {
                                              updateMutation.mutate({ id: incident.id, mitreTechnique: e.target.value || null });
                                            }
                                          }}
                                          data-testid={`input-mitre-technique-${incident.id}`}
                                        />
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>

                                <Card data-testid={`panel-killchain-${incident.id}`}>
                                  <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs flex items-center gap-1.5">
                                      <Target className="w-3.5 h-3.5 text-blue-600" />
                                      Kill Chain Phase
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-0 space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                      {KILL_CHAIN_PHASES.map((phase) => {
                                        const isActive = incident.killChainPhase === phase;
                                        return (
                                          <Badge
                                            key={phase}
                                            variant="outline"
                                            className={`text-[9px] ${
                                              isActive
                                                ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40"
                                                : "text-muted-foreground/50"
                                            }`}
                                            data-testid={`badge-kc-phase-${phase.replace(/\s+/g, "-").toLowerCase()}-${incident.id}`}
                                          >
                                            {phase}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                    {!incident.killChainPhase && (
                                      <p className="text-xs text-muted-foreground">Not enriched</p>
                                    )}
                                    {isMSS && (
                                      <div className="pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                                        <Select
                                          value={incident.killChainPhase || "_none"}
                                          onValueChange={(val) => updateMutation.mutate({ id: incident.id, killChainPhase: val === "_none" ? null : val })}
                                        >
                                          <SelectTrigger className="h-7 text-[10px]" data-testid={`select-kill-chain-${incident.id}`}>
                                            <SelectValue placeholder="Set phase" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="_none">None</SelectItem>
                                            {KILL_CHAIN_PHASES.map((p) => (
                                              <SelectItem key={p} value={p}>{p}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>

                                <Card data-testid={`panel-classification-${incident.id}`}>
                                  <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Classification
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-0 space-y-3">
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      {isMSS ? (
                                        <>
                                          <Button
                                            size="sm"
                                            variant={incident.isTruePositive === true ? "default" : "outline"}
                                            className={`text-[10px] ${incident.isTruePositive === true ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                                            onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: true, classification: "true_positive" })}
                                            data-testid={`button-tp-${incident.id}`}
                                          >
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            True Positive
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant={incident.isTruePositive === false ? "default" : "outline"}
                                            className={`text-[10px] ${incident.isTruePositive === false ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                                            onClick={() => updateMutation.mutate({ id: incident.id, isTruePositive: false, classification: "false_positive" })}
                                            data-testid={`button-fp-${incident.id}`}
                                          >
                                            <XCircle className="w-3 h-3 mr-1" />
                                            False Positive
                                          </Button>
                                        </>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] ${
                                            incident.isTruePositive === true
                                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                              : incident.isTruePositive === false
                                              ? "bg-red-500/10 text-red-700 dark:text-red-400"
                                              : "text-muted-foreground"
                                          }`}
                                        >
                                          {incident.isTruePositive === true ? "True Positive" : incident.isTruePositive === false ? "False Positive" : "Unclassified"}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground">Confidence Score: {incident.confidenceScore ?? "N/A"}{incident.confidenceScore != null ? "%" : ""}</p>
                                      {incident.confidenceScore != null && (
                                        <Progress value={incident.confidenceScore} className="h-2" data-testid={`progress-confidence-${incident.id}`} />
                                      )}
                                      {isMSS && (
                                        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                          <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            className="h-7 text-[10px] w-20"
                                            placeholder="0-100"
                                            defaultValue={incident.confidenceScore ?? ""}
                                            onBlur={(e) => {
                                              const val = parseInt(e.target.value);
                                              if (!isNaN(val) && val >= 0 && val <= 100 && val !== incident.confidenceScore) {
                                                updateMutation.mutate({ id: incident.id, confidenceScore: val });
                                              }
                                            }}
                                            data-testid={`input-confidence-${incident.id}`}
                                          />
                                          <span className="text-[10px] text-muted-foreground">%</span>
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card data-testid={`panel-retention-${incident.id}`}>
                                  <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs flex items-center gap-1.5">
                                      <CalendarClock className="w-3.5 h-3.5" />
                                      90-Day Retention
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-0 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] ${
                                          withinRetention
                                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                            : "bg-red-500/10 text-red-700 dark:text-red-400"
                                        }`}
                                        data-testid={`badge-retention-${incident.id}`}
                                      >
                                        {daysOld} day{daysOld !== 1 ? "s" : ""} old
                                      </Badge>
                                    </div>
                                    <p className={`text-xs ${withinRetention ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid={`text-retention-status-${incident.id}`}>
                                      {withinRetention ? "Within 90-day retention" : "Beyond 90-day retention"}
                                    </p>
                                    <Progress value={Math.min((daysOld / 90) * 100, 100)} className="h-1.5" />
                                  </CardContent>
                                </Card>

                                <Card data-testid={`panel-detection-source-${incident.id}`}>
                                  <CardHeader className="p-3 pb-2">
                                    <CardTitle className="text-xs flex items-center gap-1.5">
                                      <Search className="w-3.5 h-3.5 text-purple-600" />
                                      Detection Source
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-0 space-y-2">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">Tool:</span>
                                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400" data-testid={`text-detection-source-${incident.id}`}>
                                          {incident.detectionSource || incident.source || "Unknown"}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">Type:</span>
                                        <span className="text-xs">{incident.incidentType || incident.category || "General"}</span>
                                      </div>
                                      {incident.sourceIp && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-muted-foreground">Source IP:</span>
                                          <span className="text-xs font-mono">{incident.sourceIp}</span>
                                        </div>
                                      )}
                                      {incident.destinationIp && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-muted-foreground">Dest IP:</span>
                                          <span className="text-xs font-mono">{incident.destinationIp}</span>
                                        </div>
                                      )}
                                      {incident.actionTaken && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-muted-foreground">Action:</span>
                                          <Badge variant="outline" className="text-[10px]">{incident.actionTaken}</Badge>
                                        </div>
                                      )}
                                    </div>
                                    {isMSS && (
                                      <div className="space-y-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                          className="h-7 text-[10px]"
                                          placeholder="Detection source tool"
                                          defaultValue={incident.detectionSource || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== (incident.detectionSource || "")) {
                                              updateMutation.mutate({ id: incident.id, detectionSource: e.target.value || null });
                                            }
                                          }}
                                          data-testid={`input-detection-source-${incident.id}`}
                                        />
                                        <Input
                                          className="h-7 text-[10px]"
                                          placeholder="Action taken"
                                          defaultValue={incident.actionTaken || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== (incident.actionTaken || "")) {
                                              updateMutation.mutate({ id: incident.id, actionTaken: e.target.value || null });
                                            }
                                          }}
                                          data-testid={`input-action-taken-${incident.id}`}
                                        />
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>

                                {incident.iocData && (
                                  <Card data-testid={`panel-ioc-${incident.id}`}>
                                    <CardHeader className="p-3 pb-2">
                                      <CardTitle className="text-xs flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-orange-600" />
                                        IOC Reputation
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                      <div className="space-y-1.5">
                                        {(typeof incident.iocData === "object" && (incident.iocData as any)?.indicators ? (incident.iocData as any).indicators : []).map((ioc: any, idx: number) => (
                                          <div key={idx} className="flex items-center gap-2 text-[10px]">
                                            <Badge
                                              variant="outline"
                                              className={`text-[9px] ${ioc.reputation === "malicious" ? "bg-red-500/10 text-red-700 dark:text-red-400" : ioc.reputation === "suspicious" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}
                                            >
                                              {ioc.reputation || "unknown"}
                                            </Badge>
                                            <span className="font-mono truncate max-w-[180px]">{ioc.value}</span>
                                            <span className="text-muted-foreground">{ioc.type}</span>
                                            {ioc.country && <span className="text-muted-foreground">({ioc.country})</span>}
                                          </div>
                                        ))}
                                        {(!incident.iocData || !(incident.iocData as any)?.indicators?.length) && (
                                          <p className="text-[10px] text-muted-foreground">No indicators found</p>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </div>

                              <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
                                {isMSS && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      singleEnrichMutation.mutate(incident.id);
                                    }}
                                    disabled={singleEnrichMutation.isPending && singleEnrichMutation.variables === incident.id}
                                    data-testid={`button-ai-enrich-${incident.id}`}
                                  >
                                    {singleEnrichMutation.isPending && singleEnrichMutation.variables === incident.id ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        Enriching...
                                      </>
                                    ) : (
                                      <>
                                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                                        AI Enrich
                                      </>
                                    )}
                                  </Button>
                                )}
                                {!insights && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      insightsMutation.mutate(incident.id);
                                    }}
                                    disabled={isLoadingInsights}
                                    data-testid={`button-ai-insights-${incident.id}`}
                                  >
                                    {isLoadingInsights ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        Analyzing...
                                      </>
                                    ) : (
                                      <>
                                        <Brain className="w-3.5 h-3.5 mr-1.5" />
                                        Get AI Insights
                                      </>
                                    )}
                                  </Button>
                                )}

                                {insights && (
                                  <div className="space-y-4" data-testid={`ai-insights-${incident.id}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                      <Sparkles className="w-4 h-4 text-chart-1" />
                                      <span className="text-sm font-semibold">AI Insights</span>
                                      <Badge variant="outline" className="text-[10px] ml-auto">
                                        {insights.relatedEventsCount} related events
                                      </Badge>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-3">
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                            <Shield className="w-3 h-3" /> Risk Assessment
                                          </p>
                                          <p className="text-sm" data-testid={`text-risk-assessment-${incident.id}`}>
                                            {insights.insights.riskAssessment}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                            <Target className="w-3 h-3" /> Attack Vector
                                          </p>
                                          <p className="text-sm" data-testid={`text-attack-vector-${incident.id}`}>
                                            {insights.insights.attackVector}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                            <Zap className="w-3 h-3" /> MITRE Mappings
                                          </p>
                                          <div className="flex flex-wrap gap-1" data-testid={`mitre-mappings-${incident.id}`}>
                                            {insights.insights.mitreMappings.map((mapping, idx) => (
                                              <Badge key={idx} variant="outline" className="text-[10px]">
                                                {mapping}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Impact Analysis</p>
                                          <p className="text-sm" data-testid={`text-impact-analysis-${incident.id}`}>
                                            {insights.insights.impactAnalysis}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                                          <ol className="list-decimal list-inside space-y-1" data-testid={`list-recommendations-${incident.id}`}>
                                            {insights.insights.recommendations.map((rec, idx) => (
                                              <li key={idx} className="text-sm">{rec}</li>
                                            ))}
                                          </ol>
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Predictions</p>
                                          <ol className="list-decimal list-inside space-y-1" data-testid={`list-predictions-${incident.id}`}>
                                            {insights.insights.predictions.map((pred, idx) => (
                                              <li key={idx} className="text-sm">{pred}</li>
                                            ))}
                                          </ol>
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Priority Score</p>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] ${getPriorityScoreColor(insights.insights.priorityScore)}`}
                                            data-testid={`badge-priority-score-${incident.id}`}
                                          >
                                            {insights.insights.priorityScore}/100
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
