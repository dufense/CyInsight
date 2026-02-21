import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Incident } from "@shared/schema";
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
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [insightsData, setInsightsData] = useState<Record<number, AIInsightsResponse>>({});

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";

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

  const filtered = incidents.filter((inc) => {
    const matchesSearch = !search || inc.title.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = severityFilter === "all" || inc.severity === severityFilter;
    const matchesStatus = statusFilter === "all" || inc.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      severity: formData.get("severity"),
      source: formData.get("source"),
      category: formData.get("category"),
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-incident">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Incident
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-incident">
                  {createMutation.isPending ? "Creating..." : "Create Incident"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px]">Source</TableHead>
                  <TableHead className="w-[180px]">Time</TableHead>
                  {isMSS && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((incident) => {
                  const isExpanded = expandedId === incident.id;
                  const insights = insightsData[incident.id];
                  const isLoadingInsights = insightsMutation.isPending && insightsMutation.variables === incident.id;

                  return (
                    <>
                      <TableRow
                        key={incident.id}
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
                        <TableCell>
                          <span className="text-xs font-medium">{incident.title}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[incident.severity]}`} data-testid={`badge-severity-${incident.id}`}>
                            {incident.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[incident.status]}`} data-testid={`badge-status-${incident.id}`}>
                            {incident.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{incident.source || "--"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-time-${incident.id}`}>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(incident.createdAt)}
                          </div>
                        </TableCell>
                        {isMSS && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={incident.status}
                              onValueChange={(status) => updateMutation.mutate({ id: incident.id, status })}
                            >
                              <SelectTrigger className="h-7 text-[10px] w-[100px]">
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
                          <TableCell colSpan={isMSS ? 8 : 7} className="p-0">
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
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Source</p>
                                    <p className="text-sm" data-testid={`text-source-${incident.id}`}>
                                      {incident.source || "--"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                                    <p className="text-sm" data-testid={`text-recommendation-${incident.id}`}>
                                      {incident.recommendation || "No recommendation yet"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="border-t pt-4">
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
                    </>
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
