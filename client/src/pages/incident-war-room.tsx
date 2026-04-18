import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState, TabErrorBoundary } from "@/components/ui/error-boundary";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Shield, AlertTriangle, Activity, BookOpen, FileSearch, Clock, User,
  MapPin, Hash, Link2, Terminal, Swords, ArrowLeft, Plus, Trash2,
  CheckCircle, XCircle, Target, Fingerprint, Network, ChevronRight, ChevronLeft,
  Brain, Send, Loader2, Bot, Zap, FileText, HelpCircle, Lightbulb,
  Play, Download, PenLine, ChevronDown, ChevronUp, WifiOff, Eye, CheckCircle2, Code,
  RotateCcw, AlertCircle, Cpu, RefreshCw, Lock, Wifi, BellRing, Camera, Ticket, Settings, ShieldCheck,
  Globe, Bug, Server, Copy, Upload, ExternalLink, Layers, PlusCircle, Radio, Flag,
} from "lucide-react";
import { Tooltip as ShadTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts";

const SEV_COLORS: Record<string, string> = {
  critical: "hsl(340,82%,52%)", high: "hsl(32,95%,52%)", medium: "hsl(45,90%,50%)", low: "hsl(142,76%,45%)",
};
const EVIDENCE_TYPES = ["ioc", "ip", "domain", "hash", "url", "log", "screenshot", "note", "timeline_event"];
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export default function IncidentWarRoom() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const incidentId = parseInt(params.id || "0");
  const { isMSS } = useTenant();
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [ariaOpen, setAriaOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem("war-room-aria-open") !== "false"; } catch { return true; }
  });

  const toggleAria = useCallback(() => {
    setAriaOpen(prev => {
      const next = !prev;
      try { sessionStorage.setItem("war-room-aria-open", String(next)); } catch {}
      return next;
    });
  }, []);

  const scrollActiveTabIntoView = useCallback(() => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    active?.scrollIntoView({ inline: "nearest", behavior: "smooth", block: "nearest" });
  }, []);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/incidents", incidentId, "war-room"],
    queryFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/war-room`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load war room");
      return res.json();
    },
    enabled: !!incidentId,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!isLoading) {
      setTimeout(scrollActiveTabIntoView, 50);
    }
  }, [isLoading, scrollActiveTabIntoView]);

  const incident = data?.incident;
  const sevColor = incident ? (SEV_COLORS[incident.severity?.toLowerCase()] || SEV_COLORS.medium) : "#888";

  const liveStats = incident ? [
    { label: "Severity", value: incident.severity?.toUpperCase() || "—" },
    { label: "Status", value: incident.status || "—" },
    { label: "Events", value: String(data?.relatedEvents?.length || 0) },
    { label: "Evidence", value: String(data?.evidence?.length || 0) },
  ] : undefined;

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Button variant="ghost" size="sm" onClick={() => navigate("/incidents")} className="text-muted-foreground hover:text-foreground -ml-1" data-testid="button-back-to-incidents">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />Incidents
        </Button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">War Room</span>
      </div>

      <PageHero
        icon={Swords}
        title={isLoading ? "Loading War Room…" : `War Room — ${incident?.title || `INC-${incidentId}`}`}
        description="Live investigation command console — timeline, evidence, and playbooks"
        badge="ACTIVE INVESTIGATION"
        stats={liveStats}
      />

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : isError ? (
        <QueryErrorState moduleName="Incident War Room" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "war-room"] })} />
      ) : !data ? (
        <Card><CardContent className="p-10 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Incident not found</p>
        </CardContent></Card>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Left Panel — Incident Metadata Sidebar */}
          <div className="w-72 shrink-0 space-y-3">
            <TabErrorBoundary moduleName="Incident Details">
              <IncidentMetaSidebar incident={incident} sevColor={sevColor} />
            </TabErrorBoundary>
          </div>

          {/* Center Panel — Investigation Workspace */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <TabErrorBoundary moduleName="Incident Header">
                  <IncidentHeader incident={incident} sevColor={sevColor} />
                </TabErrorBoundary>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAria}
                className="shrink-0 flex items-center gap-1.5 text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground mt-0.5"
                data-testid="button-toggle-aria"
                title={ariaOpen ? "Hide ARIA panel" : "Show ARIA panel"}
              >
                <Bot className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">ARIA</span>
                {ariaOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
              </Button>
            </div>
            <div className="mt-4">
              <Tabs defaultValue="timeline" onValueChange={() => setTimeout(scrollActiveTabIntoView, 30)}>
                <div className="relative w-full">
                  <div
                    ref={tabsScrollRef}
                    className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]"
                  >
                    <TabsList className="w-max">
                      <TabsTrigger value="timeline" data-testid="tab-war-room-timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="evidence" data-testid="tab-war-room-evidence">Evidence Locker</TabsTrigger>
                      <TabsTrigger value="playbooks" data-testid="tab-war-room-playbooks">Matched Playbooks</TabsTrigger>
                      <TabsTrigger value="intelligence" data-testid="tab-war-room-intel">Threat Intel</TabsTrigger>
                      <TabsTrigger value="response" data-testid="tab-war-room-response" className="flex items-center gap-1">
                        <Cpu className="h-3.5 w-3.5" />
                        Auto Response
                      </TabsTrigger>
                      <TabsTrigger value="entity-graph" data-testid="tab-war-room-entity-graph" className="flex items-center gap-1">
                        <Network className="h-3.5 w-3.5" />
                        Entity Graph
                      </TabsTrigger>
                      <TabsTrigger value="malware" data-testid="tab-war-room-malware" className="flex items-center gap-1">
                        <Bug className="h-3.5 w-3.5" />
                        Malware Analysis
                      </TabsTrigger>
                      <TabsTrigger value="historical-context" data-testid="tab-war-room-historical" className="flex items-center gap-1">
                        <FileSearch className="h-3.5 w-3.5" />
                        Historical Context
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-muted to-transparent rounded-l-md" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-muted to-transparent rounded-r-md" />
                </div>
                <TabsContent value="timeline" className="mt-4">
                  <TabErrorBoundary moduleName="Timeline">
                    <TimelineTab events={data.relatedEvents ?? []} incidentId={incidentId} incident={incident} responseActions={data.responseActions ?? []} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="evidence" className="mt-4">
                  <TabErrorBoundary moduleName="Evidence Locker">
                    <EvidenceTab incidentId={incidentId} initialEvidence={data.evidence ?? []} incident={incident} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="playbooks" className="mt-4">
                  <TabErrorBoundary moduleName="Matched Playbooks">
                    <PlaybooksTab playbooks={data.playbooks ?? []} incident={incident} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="intelligence" className="mt-4">
                  <TabErrorBoundary moduleName="Threat Intel">
                    <IntelTab incident={incident} events={data.relatedEvents ?? []} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="response" className="mt-4">
                  <TabErrorBoundary moduleName="Auto Response">
                    <ResponseTab incidentId={incidentId} incident={incident} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="entity-graph" className="mt-4">
                  <TabErrorBoundary moduleName="Entity Graph">
                    <EntityGraphTab incidentId={incidentId} incident={incident} isMSS={isMSS} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="malware" className="mt-4">
                  <TabErrorBoundary moduleName="Malware Analysis">
                    <MalwareTab incidentId={incidentId} incident={incident} isMSS={isMSS} />
                  </TabErrorBoundary>
                </TabsContent>
                <TabsContent value="historical-context" className="mt-4">
                  <TabErrorBoundary moduleName="Historical Context">
                    <HistoricalContextTab incident={incident} incidentId={incidentId} />
                  </TabErrorBoundary>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Right Panel — AI Investigation Assistant (kept mounted to preserve chat history) */}
          <div className={`w-80 shrink-0 ${!ariaOpen ? "hidden" : ""}`}>
            <TabErrorBoundary moduleName="ARIA AI Assistant">
              <AIAssistantPanel incident={incident} events={data.relatedEvents ?? []} playbooks={data.playbooks ?? []} />
            </TabErrorBoundary>
          </div>
        </div>
      )}

      {/* Floating "Ask ARIA" pill — visible when ARIA panel is hidden and incident is loaded */}
      {!ariaOpen && data && (
        <button
          onClick={() => {
            setAriaOpen(true);
            try { sessionStorage.setItem("war-room-aria-open", "true"); } catch {}
          }}
          data-testid="button-floating-aria"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-4 py-2 shadow-lg shadow-purple-900/40 transition-colors"
        >
          <Bot className="w-3.5 h-3.5" />
          Ask ARIA
        </button>
      )}
    </div>
  );
}

function IncidentHeader({ incident, sevColor }: { incident: any; sevColor: string }) {
  return (
    <Card className="border-border/50" style={{ borderLeftColor: sevColor, borderLeftWidth: "3px" }}>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{incident.title}</h2>
              <Badge className="text-[10px] border" style={{ background: `${sevColor}20`, color: sevColor, borderColor: `${sevColor}50` }}>{incident.severity?.toUpperCase()}</Badge>
              <Badge variant="outline" className="text-[10px]">{incident.status}</Badge>
              {incident.incident_type && <Badge variant="secondary" className="text-[10px]">{incident.incident_type}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{incident.description || "No description"}</p>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Created {timeAgo(incident.created_at)}</span>
              {incident.assigned_to && <span className="flex items-center gap-1"><User className="w-3 h-3" />Assigned: {incident.assigned_to}</span>}
              {incident.source_ip && <span className="flex items-center gap-1"><Network className="w-3 h-3" />Src: {incident.source_ip}</span>}
              {incident.destination_ip && <span className="flex items-center gap-1"><Target className="w-3 h-3" />Dst: {incident.destination_ip}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {incident.mitre_tactic && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-red-400 font-medium">MITRE Tactic</p>
                <p className="text-xs font-semibold text-red-500">{incident.mitre_tactic}</p>
              </div>
            )}
            {incident.mitre_technique_id && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-md px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-orange-400 font-medium">Technique</p>
                <p className="text-xs font-semibold text-orange-500">{incident.mitre_technique_id}</p>
              </div>
            )}
            {incident.confidence_score != null && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-blue-400 font-medium">Confidence</p>
                <p className="text-xl font-bold text-blue-500">{incident.confidence_score}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IncidentMetaSidebar({ incident, sevColor }: { incident: any; sevColor: string }) {
  const iocList = incident?.ioc_data ? (Array.isArray(incident.ioc_data) ? incident.ioc_data : []) : [];
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [escalatedSeverity, setEscalatedSeverity] = useState<string | null>(null);
  const [localClassification, setLocalClassification] = useState<string | null>(incident?.classification || null);

  function triggerAction(label: string) {
    setActionFeedback(label);
    setTimeout(() => setActionFeedback(null), 2500);
  }

  const escalateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/incidents/${incident.id}/escalate`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setEscalatedSeverity(data.severity);
      triggerAction(`Severity escalated → ${data.severity}`);
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
    },
    onError: () => triggerAction("Escalation failed"),
  });

  const classifyMut = useMutation({
    mutationFn: async (classification: string | null) => {
      const res = await apiRequest("POST", `/api/incidents/${incident.id}/classify`, { classification });
      return res.json();
    },
    onSuccess: (data: any) => {
      setLocalClassification(data.classification);
      triggerAction(data.classification === "true_positive" ? "Closed as True Positive" : data.classification === "false_positive" ? "Closed as False Positive" : "Classification cleared");
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
    },
    onError: () => triggerAction("Classification failed"),
  });
  return (
    <div className="space-y-3">
      {/* Severity + Status */}
      <Card className="border-border/50" style={{ borderLeftColor: sevColor, borderLeftWidth: "3px" }}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-[10px] border" style={{ background: `${sevColor}20`, color: sevColor, borderColor: `${sevColor}50` }}>{incident.severity?.toUpperCase()}</Badge>
            <Badge variant="outline" className="text-[10px]">{incident.status}</Badge>
            {incident.classification && <Badge variant="secondary" className="text-[10px]">{incident.classification}</Badge>}
          </div>
          {incident.confidence_score != null && (
            <div>
              <p className="text-[9px] text-muted-foreground mb-1">Confidence</p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${incident.confidence_score}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{incident.confidence_score}/100</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MITRE Mapping */}
      {(incident.mitre_tactic || incident.mitre_technique_id || incident.kill_chain_phase) && (
        <Card>
          <CardHeader className="pb-1 px-3 pt-2">
            <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground">MITRE ATT&CK</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1.5">
            {incident.mitre_tactic && (
              <div>
                <p className="text-[9px] text-muted-foreground">Tactic</p>
                <Badge className="text-[9px] bg-red-500/10 text-red-500 border-red-500/20 border px-1.5">{incident.mitre_tactic}</Badge>
              </div>
            )}
            {incident.mitre_technique_id && (
              <div>
                <p className="text-[9px] text-muted-foreground">Technique</p>
                <code className="text-[10px] text-orange-500">{incident.mitre_technique_id}</code>
                {incident.mitre_technique_name && <p className="text-[9px] text-muted-foreground">{incident.mitre_technique_name}</p>}
              </div>
            )}
            {incident.kill_chain_phase && (
              <div>
                <p className="text-[9px] text-muted-foreground">Kill Chain</p>
                <Badge variant="outline" className="text-[9px] px-1.5">{incident.kill_chain_phase}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analyst & Assignment */}
      <Card>
        <CardHeader className="pb-1 px-3 pt-2">
          <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignment</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 space-y-1">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px]">{incident.assigned_to || "Unassigned"}</span>
          </div>
          {incident.source_ip && (
            <div className="flex items-center gap-2">
              <Network className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-mono">{incident.source_ip}</span>
            </div>
          )}
          {incident.destination_ip && (
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-mono">{incident.destination_ip}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-[10px]">{formatDate(incident.created_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-1 px-3 pt-2">
          <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            Quick Actions
            {actionFeedback && <span className="text-[9px] text-green-500 font-normal">✓ {actionFeedback}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 space-y-1.5">
          {/* Severity Escalation */}
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">Escalate Severity</p>
            <Select value={escalatedSeverity || incident.severity || ""} onValueChange={(val) => { setEscalatedSeverity(val); triggerAction(`Severity → ${val}`); }}>
              <SelectTrigger className="h-7 text-[10px]" data-testid="select-severity-escalation">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px] justify-start" onClick={() => triggerAction("Host Isolated")} data-testid="btn-isolate-host">
            <Shield className="w-3 h-3 mr-1.5 text-orange-500" />Isolate Host
          </Button>
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px] justify-start" onClick={() => triggerAction("IOC Blocked")} data-testid="btn-block-ioc">
            <XCircle className="w-3 h-3 mr-1.5 text-red-500" />Block IOC
          </Button>
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px] justify-start" onClick={() => escalateMut.mutate()} disabled={escalateMut.isPending} data-testid="btn-escalate">
            {escalateMut.isPending ? <span className="animate-spin mr-1.5">⟳</span> : <AlertTriangle className="w-3 h-3 mr-1.5 text-yellow-500" />}
            {escalatedSeverity ? `Escalated → ${escalatedSeverity}` : "Escalate Severity"}
          </Button>
          <Button
            variant="outline" size="sm"
            className={`w-full h-7 text-[10px] justify-start ${localClassification === "true_positive" ? "border-green-500/40 text-green-600 bg-green-500/5" : ""}`}
            onClick={() => classifyMut.mutate(localClassification === "true_positive" ? null : "true_positive")}
            disabled={classifyMut.isPending}
            data-testid="btn-close-tp">
            <CheckCircle className="w-3 h-3 mr-1.5 text-green-500" />
            {localClassification === "true_positive" ? "✓ True Positive" : "Close as TP"}
          </Button>
          <Button
            variant="outline" size="sm"
            className={`w-full h-7 text-[10px] justify-start ${localClassification === "false_positive" ? "border-red-500/40 text-red-600 bg-red-500/5" : ""}`}
            onClick={() => classifyMut.mutate(localClassification === "false_positive" ? null : "false_positive")}
            disabled={classifyMut.isPending}
            data-testid="btn-close-fp">
            <XCircle className="w-3 h-3 mr-1.5 text-red-500" />
            {localClassification === "false_positive" ? "✓ False Positive" : "Close as FP"}
          </Button>
          {localClassification === "true_positive" && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20">
              <Code className="w-3 h-3 text-purple-500 shrink-0" />
              <span className="text-[9px] text-purple-600">Detection rule auto-drafted in Timeline tab</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IOC List */}
      {iocList.length > 0 && (
        <Card>
          <CardHeader className="pb-1 px-3 pt-2">
            <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground">IOCs ({iocList.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1">
            {iocList.slice(0, 8).map((ioc: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 border-b border-border/20 last:border-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ioc.reputation === "malicious" ? "bg-red-500" : ioc.reputation === "suspicious" ? "bg-yellow-500" : "bg-green-500"}`} />
                <span className="text-[9px] font-mono truncate">{ioc.value || ioc.indicator_value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type AIMessage = { role: "user" | "assistant"; content: string };
const QUICK_PROMPTS = [
  { label: "What happened?", icon: HelpCircle },
  { label: "What should I do next?", icon: Lightbulb },
  { label: "Who else was affected?", icon: Network },
  { label: "Generate timeline summary", icon: FileText },
  { label: "Write IR report", icon: FileSearch },
];

function AIAssistantPanel({ incident, events, playbooks: matchedPlaybooks = [] }: { incident: any; events: any[]; playbooks?: any[] }) {
  const { currentTenant } = useTenant();
  const tenantId = incident?.tenant_id || currentTenant?.id;

  // Fetch all available tenant playbooks for SOAR recommendations
  const { data: allPlaybooks = [] } = useQuery<any[]>({
    queryKey: ["/api/playbooks", tenantId],
    queryFn: () => fetch(`/api/playbooks/${tenantId}`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  });

  // Prefer matched playbooks, fall back to all available playbooks
  const playbooks = matchedPlaybooks.length > 0 ? matchedPlaybooks : allPlaybooks;

  const [messages, setMessages] = useState<AIMessage[]>([{
    role: "assistant",
    content: `I'm ARIA, your AI investigation assistant. I have full context on this incident:\n\n**${incident?.title || "Incident"}** — ${incident?.severity?.toUpperCase()} severity, ${incident?.status}.\n\nHow can I help with your investigation?`,
  }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [soarLaunching, setSoarLaunching] = useState<number | null>(null);
  const [soarSuccess, setSoarSuccess] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const launchPlaybook = async (pb: any) => {
    const tenantId = incident?.tenant_id || currentTenant?.id;
    if (!tenantId) return;
    setSoarLaunching(pb.id);
    try {
      const res = await fetch(`/api/playbooks/${tenantId}/${pb.id}/execute`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: incident?.id, dryRun: false }),
      });
      if (res.ok) { setSoarSuccess(pb.id); setTimeout(() => setSoarSuccess(null), 3000); }
    } catch { /* ignore */ } finally { setSoarLaunching(null); }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const incidentContext = incident ? `
Incident: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Type: ${incident.incident_type || "Unknown"}
Description: ${incident.description || "No description"}
Source IP: ${incident.source_ip || "Unknown"}
Destination IP: ${incident.destination_ip || "Unknown"}
MITRE Tactic: ${incident.mitre_tactic || "Unknown"}
MITRE Technique: ${incident.mitre_technique_id || "Unknown"}
Kill Chain Phase: ${incident.kill_chain_phase || "Unknown"}
Confidence: ${incident.confidence_score ?? "Unknown"}
Related Events: ${events?.length || 0} events
`.trim() : "";

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: AIMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          systemPrompt: `You are ARIA, an expert cybersecurity AI analyst investigating an active security incident. Provide concise, actionable analysis. Incident context:\n${incidentContext}`,
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json();
      setIsOffline(false);
      setConsecutiveFailures(0);
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || data.message || "I'm analyzing the situation..." }]);
    } catch {
      const newFailures = consecutiveFailures + 1;
      setConsecutiveFailures(newFailures);
      if (newFailures >= 2) setIsOffline(true);
      setMessages(prev => [...prev, { role: "assistant", content: "AI service is temporarily unavailable. Please review incident data manually or try again in a moment." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-purple-500/20 sticky top-4" style={{ height: "calc(100vh - 200px)" }}>
      <CardHeader className="pb-2 px-4 pt-3 border-b border-border/40">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-purple-500" />AI Investigation Assistant
          </CardTitle>
          {isOffline ? (
            <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5" data-testid="badge-ai-offline">
              <WifiOff className="w-2.5 h-2.5" />Offline
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online
            </span>
          )}
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5">ARIA — Incident-aware AI analyst</p>
      </CardHeader>
      <CardContent className="p-0 flex flex-col h-[calc(100%-80px)]">
        {isOffline && (
          <div className="mx-3 mt-2 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2" data-testid="banner-ai-offline">
            <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">AI Assistant offline</p>
              <p className="text-[9px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">Enter your question manually — responses will resume when AI services are restored.</p>
              <button className="text-[9px] text-amber-600 dark:text-amber-400 underline mt-1" onClick={() => { setIsOffline(false); setConsecutiveFailures(0); }} data-testid="btn-retry-ai">Retry connection</button>
            </div>
          </div>
        )}
        {/* Quick Prompts */}
        <div className="px-3 py-2 border-b border-border/30 space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Quick Actions</p>
          <div className="flex flex-wrap gap-1">
            {QUICK_PROMPTS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => sendMessage(label)}
                disabled={isOffline}
                className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`btn-ai-quick-${label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <Icon className="w-2.5 h-2.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* SOAR-Ready Playbook Recommendations */}
        {playbooks && playbooks.length > 0 && (
          <div className="px-3 py-2 border-b border-border/30 space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-green-500" />SOAR-Ready Actions
            </p>
            {playbooks.slice(0, 2).map((pb: any) => (
              <div key={pb.id} className="flex items-center justify-between gap-2 bg-green-500/5 border border-green-500/15 rounded px-2 py-1" data-testid={`soar-recommendation-${pb.id}`}>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium truncate">{pb.name}</p>
                  <p className="text-[9px] text-muted-foreground">{(pb.steps || []).length} steps</p>
                </div>
                <button
                  onClick={() => launchPlaybook(pb)}
                  disabled={soarLaunching === pb.id}
                  className="shrink-0 flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                  data-testid={`button-execute-now-${pb.id}`}
                >
                  {soarSuccess === pb.id ? <><CheckCircle2 className="w-2.5 h-2.5" />Launched</> :
                    soarLaunching === pb.id ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />Running…</> :
                    <><Zap className="w-2.5 h-2.5" />Execute Now</>}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${msg.role === "assistant" ? "bg-purple-500/20" : "bg-blue-500/20"}`}>
                {msg.role === "assistant" ? <Bot className="w-3 h-3 text-purple-500" /> : <User className="w-3 h-3 text-blue-500" />}
              </div>
              <div className={`text-[10px] leading-relaxed rounded-lg px-2.5 py-1.5 max-w-[85%] whitespace-pre-wrap ${msg.role === "assistant" ? "bg-muted text-foreground" : "bg-blue-500/15 text-blue-100"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2">
              <div className="shrink-0 w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Bot className="w-3 h-3 text-purple-500" />
              </div>
              <div className="bg-muted rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                <span className="text-[10px] text-muted-foreground">Analyzing…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-2 border-t border-border/30">
          <div className="flex gap-1.5">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage(input))}
              placeholder="Ask ARIA about this incident…"
              className="text-[11px] h-7 flex-1"
              disabled={isLoading}
              data-testid="input-ai-chat"
            />
            <Button size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} data-testid="btn-ai-send">
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Kill-chain phase ordering for milestone-style timeline
const KC_ORDER = [
  "Reconnaissance", "Weaponization", "Delivery", "Exploitation",
  "Installation", "Command and Control", "Actions on Objectives",
];
const KC_SHORT: Record<string, string> = {
  "Reconnaissance": "Recon", "Weaponization": "Weapon", "Delivery": "Delivery",
  "Exploitation": "Exploit", "Installation": "Install",
  "Command and Control": "C2", "Actions on Objectives": "Actions",
};

function TimelineTab({ events, incidentId, incident, responseActions = [] }: { events: any[]; incidentId: number; incident: any; responseActions?: any[] }) {
  const [, navigate] = useLocation();
  const [observations, setObservations] = useState<Array<{ text: string; ts: Date }>>([]);
  const [obsText, setObsText] = useState("");
  const [showObsForm, setShowObsForm] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [manuallyGenerated, setManuallyGenerated] = useState(false);

  const isTP = incident?.classification === "true_positive";

  // Query existing detection rules drafted from this incident (auto-surfaced for TP incidents)
  const { data: existingRulesData, refetch: refetchRules } = useQuery<{ rules: any[] }>({
    queryKey: ["/api/incidents", incidentId, "detection-rules"],
    queryFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/detection-rules`, { credentials: "include" });
      return res.json();
    },
    enabled: isTP,
    staleTime: 15000,
  });
  const existingRule = existingRulesData?.rules?.[0] ?? null;
  const hasDraft = !!existingRule || manuallyGenerated;

  const generateRuleMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/generate-detection-rule`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setManuallyGenerated(true);
      const ruleId = data?.id ? `?ruleId=${data.id}` : "";
      navigate(`/detection-engineering${ruleId}`);
    },
  });

  const chartData = events.reduce((acc: any[], ev: any) => {
    const hour = new Date(ev.occurred_at).toLocaleTimeString("en", { hour: "2-digit", hour12: false });
    const existing = acc.find(d => d.hour === hour);
    if (existing) { existing.count++; } else { acc.push({ hour, count: 1 }); }
    return acc;
  }, []).sort((a: any, b: any) => a.hour.localeCompare(b.hour));

  // Group events by kill-chain / MITRE tactic for milestone view
  const milestoneGroups: Record<string, any[]> = {};
  for (const ev of events) {
    const phase = ev.mitre_tactic || "Unknown";
    if (!milestoneGroups[phase]) milestoneGroups[phase] = [];
    milestoneGroups[phase].push(ev);
  }

  // Sort groups by kill-chain order then alpha
  const sortedPhases = Object.keys(milestoneGroups).sort((a, b) => {
    const ia = KC_ORDER.indexOf(a);
    const ib = KC_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  function addObservation() {
    if (!obsText.trim()) return;
    setObservations(prev => [...prev, { text: obsText.trim(), ts: new Date() }]);
    setObsText("");
    setShowObsForm(false);
  }

  async function exportTimeline() {
    setExportBusy(true);
    try {
      // Fetch server-rendered print-quality HTML report with full evidence + correlated events
      const res = await fetch(`/api/incidents/${incidentId}/timeline-pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const html = await res.text();
      // Open in new window and trigger browser print dialog (browser print-to-PDF)
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 800);
      } else {
        // Fallback: download as HTML file
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `war-room-timeline-${incidentId}.html`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Timeline export failed:", err);
    }
    setTimeout(() => setExportBusy(false), 1000);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-500" />Attack Timeline</h3>
          <p className="text-xs text-muted-foreground">Correlated events ±4h grouped by MITRE kill-chain phase</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowObsForm(v => !v)} data-testid="button-add-observation">
            <PenLine className="w-3.5 h-3.5 mr-1.5" />Add Observation
          </Button>
          <Button size="sm" variant="outline" onClick={exportTimeline} disabled={exportBusy} data-testid="button-export-timeline">
            {exportBusy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Export PDF
          </Button>
          {isTP && (
            hasDraft ? (
              <Button
                size="sm"
                variant="outline"
                className="border-purple-500/40 text-purple-600 bg-purple-500/5 hover:bg-purple-500/10"
                onClick={() => navigate(existingRule?.id ? `/detection-engineering?ruleId=${existingRule.id}` : "/detection-engineering")}
                data-testid="button-view-detection-rule">
                <Code className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
                {existingRule ? `View Draft: ${existingRule.name?.substring(0, 25)}…` : "View Draft Rule"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-purple-500/30 hover:border-purple-500/60"
                onClick={() => generateRuleMut.mutate()}
                disabled={generateRuleMut.isPending}
                data-testid="button-generate-detection-rule">
                {generateRuleMut.isPending
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-purple-500" />
                  : <Code className="w-3.5 h-3.5 mr-1.5 text-purple-500" />}
                {generateRuleMut.isPending ? "Generating…" : "Generate Detection Rule"}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Add Observation Form */}
      {showObsForm && (
        <Card className="border-cyan-500/30">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Manual Observation</p>
            <Textarea
              className="text-xs min-h-[60px] resize-none"
              placeholder="Record your observation or analysis note..."
              value={obsText}
              onChange={e => setObsText(e.target.value)}
              data-testid="textarea-observation"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={addObservation} disabled={!obsText.trim()} data-testid="button-save-observation">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowObsForm(false); setObsText(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Observations */}
      {observations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Your Observations</p>
          {observations.map((obs, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-md" data-testid={`observation-${i}`}>
              <PenLine className="w-3 h-3 text-cyan-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px]">{obs.text}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{obs.ts.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event Volume Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event Volume by Hour</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="warGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(185,100%,42%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(185,100%,42%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name="Events" stroke="hsl(185,100%,42%)" strokeWidth={1.5} fill="url(#warGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Milestone-style MITRE phase timeline */}
      {events.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No correlated events found in the ±4h window</p>
          <p className="text-xs text-muted-foreground mt-1">Events are correlated by source/destination IP and asset matching</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {/* Phase quick-nav strip */}
          {sortedPhases.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pb-1 border-b border-border/40">
              {sortedPhases.map((phase) => (
                <button
                  key={phase}
                  className="text-[9px] px-2 py-0.5 rounded-full border border-border/60 hover:border-cyan-500/60 hover:text-cyan-500 text-muted-foreground transition-colors"
                  onClick={() => document.getElementById(`phase-${phase}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  data-testid={`btn-jump-phase-${phase.replace(/\s+/g, "-")}`}
                >
                  {phase}
                </button>
              ))}
            </div>
          )}
          {sortedPhases.map((phase, pi) => (
            <div key={phase} id={`phase-${phase}`}>
              <TimelinePhaseGroup phase={phase} events={milestoneGroups[phase]} index={pi} total={sortedPhases.length} />
            </div>
          ))}
        </div>
      )}

      {/* Autonomous Response Action Audit Trail */}
      {responseActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            Response Action Audit Trail ({responseActions.length})
          </p>
          {responseActions.map((action: any, idx: number) => {
            const statusColor = action.status === "completed" ? "text-emerald-400" : action.status === "failed" ? "text-red-400" : action.status === "blocked" ? "text-orange-400" : action.status === "undone" ? "text-cyan-400" : "text-yellow-400";
            const statusDot = action.status === "completed" ? "bg-emerald-400" : action.status === "failed" ? "bg-red-400" : action.status === "blocked" ? "bg-orange-400" : action.status === "undone" ? "bg-cyan-400" : "bg-yellow-400";
            return (
              <div key={action.id ?? idx} className="flex items-start gap-2.5 px-3 py-2 bg-muted/30 border border-border/50 rounded-md" data-testid={`response-action-timeline-${action.id ?? idx}`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${statusDot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium capitalize">{(action.action_type || "").replace(/_/g, " ")}</span>
                    <span className={`text-[10px] font-medium capitalize ${statusColor}`}>{action.status}</span>
                    {action.risk_level && <span className="text-[9px] bg-muted rounded px-1 py-0.5 capitalize">{action.risk_level} risk</span>}
                  </div>
                  {action.target && <span className="text-[9px] font-mono bg-muted rounded px-1 py-0.5 max-w-[200px] truncate inline-block mt-0.5">{action.target}</span>}
                  {action.rationale && <p className="text-[10px] text-muted-foreground mt-0.5">{action.rationale}</p>}
                  {action.execution_result && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">
                      {typeof action.execution_result === "string"
                        ? (() => { try { return JSON.parse(action.execution_result)?.message || action.execution_result; } catch { return action.execution_result; } })()
                        : (action.execution_result as any)?.message || JSON.stringify(action.execution_result)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {action.executed_by && <span className="text-[9px] text-muted-foreground">Actor: <span className="text-foreground/70">{action.executed_by}</span></span>}
                    {action.executed_at && <span className="text-[9px] text-muted-foreground">{new Date(action.executed_at).toLocaleString()}</span>}
                    {action.plan_mode && <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded px-1">{action.plan_mode}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelinePhaseGroup({ phase, events, index, total }: { phase: string; events: any[]; index: number; total: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const phaseColor = KC_ORDER.includes(phase)
    ? `hsl(${200 + KC_ORDER.indexOf(phase) * 20}, 80%, 55%)`
    : "hsl(220,60%,55%)";

  return (
    <div className="relative">
      {/* Vertical connector line */}
      {index < total - 1 && (
        <div className="absolute left-[18px] top-9 bottom-0 w-px bg-border/60 -mb-3 z-0" />
      )}
      <div className="relative z-10">
        <button
          className="w-full flex items-center gap-3 text-left hover:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors"
          onClick={() => setExpanded(v => !v)}
          data-testid={`phase-header-${index}`}
        >
          <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-bold"
            style={{ borderColor: phaseColor, background: `${phaseColor}15`, color: phaseColor }}>
            {(KC_SHORT[phase] || phase).slice(0, 3).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{phase}</p>
            <p className="text-[10px] text-muted-foreground">{events.length} event{events.length !== 1 ? "s" : ""}</p>
          </div>
          <Badge variant="outline" className="text-[9px] shrink-0 mr-1" style={{ color: phaseColor, borderColor: `${phaseColor}50` }}>
            {events.length}
          </Badge>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="ml-12 mt-1 space-y-1 mb-2">
            {events.map((ev: any, i: number) => {
              const sc = SEV_COLORS[ev.severity?.toLowerCase()] || "#888";
              return (
                <div key={ev.id || i} className="flex items-start gap-2 p-2 rounded-md bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors" data-testid={`timeline-event-${index}-${i}`}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: sc }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{formatDate(ev.occurred_at)}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded font-medium" style={{ background: `${sc}20`, color: sc }}>{ev.severity}</span>
                      <span className="text-[11px] font-medium truncate">{ev.event_type}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {(ev.threat || ev.threat_vector) && <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{ev.threat || ev.threat_vector}</span>}
                      {ev.attacker && <span className="text-[10px] font-mono text-red-400">{ev.attacker}</span>}
                      {ev.target && <span className="text-[10px] font-mono text-orange-400">{ev.target}</span>}
                      {ev.mitre_technique && <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/30 text-orange-500">{ev.mitre_technique}</Badge>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceTab({ incidentId, initialEvidence, incident }: { incidentId: number; initialEvidence: any[]; incident?: any }) {
  const [, navigate] = useLocation();
  const [evidenceType, setEvidenceType] = useState("ioc");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: evidence = initialEvidence, refetch } = useQuery<any[]>({
    queryKey: ["/api/incidents", incidentId, "evidence"],
    queryFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/evidence`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load evidence");
      return res.json();
    },
    initialData: initialEvidence,
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/evidence`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: evidenceType, value, description }),
      });
      if (!res.ok) throw new Error("Failed to add evidence");
      return res.json();
    },
    onSuccess: () => {
      setValue(""); setDescription(""); setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "evidence"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (evidenceId: number) => {
      const res = await fetch(`/api/incidents/${incidentId}/evidence/${evidenceId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete evidence");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "evidence"] }),
  });

  const EVIDENCE_ICONS: Record<string, any> = {
    ioc: Target, ip: Network, domain: Link2, hash: Hash, url: Link2, log: FileSearch, note: BookOpen,
    screenshot: FileSearch, timeline_event: Clock,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2"><Fingerprint className="w-4 h-4 text-cyan-500" />Evidence Locker</h3>
          <p className="text-xs text-muted-foreground">Chain-of-custody tracked artefacts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const sourceIp = incident?.source_ip || incident?.affected_assets;
              const query = sourceIp ? `?nodeId=${encodeURIComponent(sourceIp)}` : "";
              navigate(`/attack-paths${query}`);
            }}
            data-testid="button-show-attack-paths"
          >
            <Network className="w-3.5 h-3.5 mr-1.5" /> Show Attack Paths
          </Button>
          <Button size="sm" onClick={() => setAdding(a => !a)} data-testid="button-add-evidence">
            <Plus className="w-3.5 h-3.5 mr-1.5" />{adding ? "Cancel" : "Add Evidence"}
          </Button>
        </div>
      </div>

      {adding && (
        <Card className="border-cyan-500/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Evidence Type</label>
                <Select value={evidenceType} onValueChange={setEvidenceType}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-evidence-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Value / Indicator</label>
                <input
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  placeholder="e.g. 192.168.1.1, malware.exe, SHA256..."
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  data-testid="input-evidence-value"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">Notes</label>
              <Textarea
                className="text-xs min-h-[60px] resize-none"
                placeholder="Analysis notes, context, observations..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                data-testid="textarea-evidence-description"
              />
            </div>
            <Button size="sm" onClick={() => addMut.mutate()} disabled={!value || addMut.isPending} data-testid="button-submit-evidence">
              {addMut.isPending ? "Saving…" : "Save Evidence"}
            </Button>
          </CardContent>
        </Card>
      )}

      {evidence.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <Fingerprint className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No evidence logged yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add IOCs, logs, hashes, or notes to build your investigation record</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {evidence.map((ev: any, i: number) => {
            const Icon = EVIDENCE_ICONS[ev.type] || FileSearch;
            return (
              <Card key={ev.id || i} className="border-border/40 hover:border-border/80 transition-colors" data-testid={`card-evidence-${i}`}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-cyan-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[9px] px-1.5">{ev.type}</Badge>
                      <span className="font-mono text-[11px] text-foreground/90 truncate">{ev.value}</span>
                    </div>
                    {ev.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(ev.created_at)}</span>
                      {ev.added_by && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ev.added_by}</span>}
                      {ev.chain_of_custody_hash && <span className="flex items-center gap-1 font-mono opacity-60"><Hash className="w-3 h-3" />{ev.chain_of_custody_hash.slice(0, 12)}…</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                    onClick={() => deleteMut.mutate(ev.id)} data-testid={`button-delete-evidence-${i}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PlaybookExecState = {
  execId: string;
  status: "running" | "completed" | "failed" | "partial";
  steps: any[];
  dryRun: boolean;
  startedAt: string;
  completedAt?: string;
};

function PlaybooksTab({ playbooks, incident }: { playbooks: any[]; incident: any }) {
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const [execStates, setExecStates] = useState<Record<number, PlaybookExecState>>({});
  const [dryRun, setDryRun] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const sseRefs = useRef<Record<number, EventSource>>({});

  const subscribeToExecution = useCallback((pbIndex: number, execId: string, tenantId: number, playbookId: number) => {
    if (sseRefs.current[pbIndex]) { sseRefs.current[pbIndex].close(); delete sseRefs.current[pbIndex]; }
    const es = new EventSource(`/api/playbooks/${tenantId}/${playbookId}/execution-stream/${execId}`);
    sseRefs.current[pbIndex] = es;
    es.onmessage = (event) => {
      try {
        const state: PlaybookExecState = JSON.parse(event.data);
        setExecStates(prev => ({ ...prev, [pbIndex]: state }));
        if (state.status !== "running") { es.close(); delete sseRefs.current[pbIndex]; }
      } catch { /* malformed event */ }
    };
    es.onerror = () => { es.close(); delete sseRefs.current[pbIndex]; };
  }, []);

  useEffect(() => {
    return () => { Object.values(sseRefs.current).forEach(es => es.close()); };
  }, []);

  async function executePlaybook(pb: any, pbIndex: number) {
    const tenantId = incident?.tenant_id || currentTenant?.id;
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/playbooks/${tenantId}/${pb.id}/execute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: incident?.id, dryRun }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const initialState: PlaybookExecState = {
        execId: data.execId,
        status: "running",
        steps: (pb.steps || []).map((s: any) => ({ stepId: s.id, stepLabel: s.label, stepType: s.type, status: "pending", message: "Waiting…", dryRun })),
        dryRun,
        startedAt: new Date().toISOString(),
      };
      setExecStates(prev => ({ ...prev, [pbIndex]: initialState }));
      subscribeToExecution(pbIndex, data.execId, tenantId, pb.id);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2"><BookOpen className="w-4 h-4 text-green-500" />Matched Response Playbooks</h3>
          <p className="text-xs text-muted-foreground">Response procedures matched to this incident's MITRE tactics and type</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDryRun(d => !d)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${dryRun ? "bg-blue-500/10 border-blue-500/30 text-blue-600" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}
            data-testid="toggle-dry-run"
          >
            <Eye className="w-3 h-3" />{dryRun ? "Dry Run ON" : "Dry Run"}
          </button>
          <Button size="sm" variant="outline" className="shrink-0 h-7 text-[10px]" onClick={() => navigate("/playbooks")} data-testid="button-open-playbook-library">
            <BookOpen className="w-3 h-3 mr-1.5" />Full Library
          </Button>
        </div>
      </div>
      {dryRun && (
        <div className="flex items-center gap-2 text-[11px] text-blue-600 bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-2">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span><strong>Dry Run mode</strong> — steps will simulate execution without making real API calls or changes</span>
        </div>
      )}
      {playbooks.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No matched playbooks found</p>
          <p className="text-xs text-muted-foreground mt-1">Playbooks are matched by incident type and MITRE tactic. Enrich the incident first to improve matching.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {playbooks.map((pb: any, i: number) => {
            const exec = execStates[i];
            const steps: any[] = Array.isArray(pb.steps) ? pb.steps : [];
            const totalSteps = steps.length;
            const completedSteps = exec ? exec.steps.filter((s: any) => s.status === "success" || s.status === "failed").length : 0;
            const progress = exec && totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
            const isRunning = exec?.status === "running";
            const isDone = exec?.status === "completed" || exec?.status === "partial" || exec?.status === "failed";
            const hasFailures = exec?.steps?.some((s: any) => s.status === "failed");
            const isExpanded = expandedSteps[i] ?? false;

            return (
              <Card key={pb.id || i} className={`transition-colors ${isDone && !hasFailures ? "border-green-500/40" : isDone && hasFailures ? "border-yellow-500/40" : isRunning ? "border-blue-500/40" : "border-green-500/20 hover:border-green-500/40"}`} data-testid={`card-playbook-${i}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${isDone && !hasFailures ? "bg-green-500/20 border-green-500/40" : isDone && hasFailures ? "bg-yellow-500/20 border-yellow-500/40" : isRunning ? "bg-blue-500/20 border-blue-500/40" : "bg-green-500/10 border-green-500/20"}`}>
                      {isDone && !hasFailures ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : isDone && hasFailures ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /> : isRunning ? <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" /> : <BookOpen className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{pb.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{pb.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDone ? (
                        <>
                          <Badge className={`text-[9px] border ${hasFailures ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" : "bg-green-500/10 text-green-600 border-green-500/30"}`}>
                            {exec?.dryRun ? "Dry Run " : ""}{hasFailures ? "Partial" : "Completed"}
                          </Badge>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setExpandedSteps(p => ({ ...p, [i]: !p[i] }))} data-testid={`button-expand-steps-${i}`}>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </Button>
                        </>
                      ) : isRunning ? (
                        <Badge className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/30 border">Executing…</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] border-green-500/30 text-green-600 hover:bg-green-500/10"
                          onClick={() => executePlaybook(pb, i)}
                          data-testid={`button-execute-playbook-${i}`}>
                          <Play className="w-3 h-3 mr-1" />{dryRun ? "Dry Run" : "Execute"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar during execution */}
                  {exec && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, background: isDone && !hasFailures ? "hsl(142,76%,45%)" : isRunning ? "hsl(210,90%,55%)" : "hsl(45,90%,50%)" }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {isDone ? `${completedSteps}/${totalSteps} steps done${exec.dryRun ? " (dry run)" : ""}` : `Executing step ${completedSteps + 1} of ${totalSteps}…`}
                      </p>
                    </div>
                  )}

                  {/* Steps details — always show during execution, toggle after */}
                  {(isRunning || (isDone && isExpanded)) && exec && (
                    <div className="bg-muted/30 rounded-md p-2 space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Step Details</p>
                      {exec.steps.map((step: any, si: number) => {
                        const isSuccess = step.status === "success";
                        const isFailed = step.status === "failed";
                        const isActive = step.status === "running";
                        const isPending = step.status === "pending";
                        return (
                          <div key={si} className={`rounded px-2 py-1.5 text-[11px] border transition-colors ${isActive ? "bg-blue-500/10 border-blue-500/20" : isSuccess ? "bg-green-500/10 border-green-500/20" : isFailed ? "bg-red-500/10 border-red-500/20" : "bg-muted/30 border-border/30"}`} data-testid={`step-${i}-${si}`}>
                            <div className="flex items-center gap-1.5">
                              {isActive ? <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" /> : isSuccess ? <CheckCircle className="w-3 h-3 text-green-500 shrink-0" /> : isFailed ? <XCircle className="w-3 h-3 text-red-500 shrink-0" /> : <Clock className="w-3 h-3 text-muted-foreground shrink-0" />}
                              <span className={`font-medium ${isActive ? "text-blue-600" : isSuccess ? "text-green-700 dark:text-green-400" : isFailed ? "text-red-600" : "text-muted-foreground"}`}>{step.stepLabel || step.stepType}</span>
                              {step.durationMs && <span className="ml-auto text-[10px] text-muted-foreground">{step.durationMs}ms</span>}
                              {isFailed && exec?.execId && exec.status !== "running" && (
                                <button
                                  className="ml-1 text-[9px] text-red-600 border border-red-500/30 rounded px-1.5 py-0.5 hover:bg-red-500/10 transition-colors"
                                  data-testid={`button-retry-step-${i}-${si}`}
                                  onClick={async () => {
                                    const tenantId = incident?.tenant_id || currentTenant?.id;
                                    if (!tenantId || !exec?.execId) return;
                                    await fetch(`/api/playbooks/${tenantId}/executions/${exec.execId}/retry-step`, {
                                      method: "POST", credentials: "include",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ stepId: step.stepId }),
                                    });
                                    subscribeToExecution(i, exec.execId, tenantId, pb.id);
                                  }}
                                >Retry</button>
                              )}
                            </div>
                            {step.message && !isPending && <p className="mt-0.5 text-[10px] text-muted-foreground pl-4.5">{step.message}</p>}
                            {step.error && <p className="mt-0.5 text-[10px] text-red-500 pl-4.5">Error: {step.error}</p>}
                            {(step.action || step.target) && (
                              <p className="mt-0.5 text-[9px] text-muted-foreground/70 pl-4.5 font-mono">
                                {step.action && <span className="mr-2">action: {step.action}</span>}
                                {step.target && <span>target: {step.target}</span>}
                              </p>
                            )}
                            {(step.startedAt || step.completedAt) && (
                              <p className="mt-0.5 text-[9px] text-muted-foreground/60 pl-4.5">
                                {step.startedAt && <span className="mr-2">started: {new Date(step.startedAt).toLocaleTimeString()}</span>}
                                {step.completedAt && <span>done: {new Date(step.completedAt).toLocaleTimeString()}</span>}
                              </p>
                            )}
                            {step.apiResponse && (isSuccess || isFailed) && (
                              <details className="mt-0.5 pl-4.5">
                                <summary className="text-[9px] text-blue-500 cursor-pointer hover:underline">API Response</summary>
                                <pre className="text-[8px] font-mono text-muted-foreground bg-black/20 rounded p-1 mt-0.5 overflow-x-auto max-h-20 whitespace-pre-wrap break-all">{(() => { try { return JSON.stringify(JSON.parse(step.apiResponse), null, 2); } catch { return step.apiResponse; } })()}</pre>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pre-execution step list */}
                  {!exec && steps.length > 0 && (
                    <div className="bg-muted/30 rounded-md p-2 space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Steps ({steps.length})</p>
                      {steps.map((step: any, si: number) => (
                        <div key={si} className="flex items-start gap-1.5" data-testid={`step-${i}-${si}`}>
                          <span className="text-[9px] font-mono w-4 shrink-0 mt-0.5">{si + 1}.</span>
                          <span className="text-[11px]">{step.label || step.type}</span>
                        </div>
                      ))}
                    </div>
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

function IntelTab({ incident, events }: { incident: any; events: any[] }) {
  const uniqueAttackers = [...new Set(events.map((e: any) => e.attacker).filter(Boolean))];
  const uniqueTargets = [...new Set(events.map((e: any) => e.target).filter(Boolean))];
  const tactics = [...new Set(events.map((e: any) => e.mitre_tactic).filter(Boolean))];
  const sources = [...new Set(events.map((e: any) => e.source_type).filter(Boolean))];
  const countries = [...new Set(events.map((e: any) => e.country).filter(Boolean))];

  const iocList = incident?.ioc_data ? (Array.isArray(incident.ioc_data) ? incident.ioc_data : []) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Network className="w-3.5 h-3.5 text-red-500" />Threat Actors</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-1">
            {uniqueAttackers.length === 0 ? <p className="text-[11px] text-muted-foreground">No actor IPs extracted</p> :
              uniqueAttackers.slice(0, 10).map((a: string, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="font-mono text-[11px]">{a}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-orange-500" />Targeted Assets</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-1">
            {uniqueTargets.length === 0 ? <p className="text-[11px] text-muted-foreground">No targets identified</p> :
              uniqueTargets.slice(0, 10).map((t: string, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="font-mono text-[11px]">{t}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-500" />Geo / Context</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            {countries.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Countries</p>
                <div className="flex flex-wrap gap-1">{countries.slice(0, 8).map((c: string, i: number) => <Badge key={i} variant="secondary" className="text-[9px] px-1.5">{c}</Badge>)}</div>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Data Sources</p>
                <div className="flex flex-wrap gap-1">{sources.slice(0, 8).map((s: string, i: number) => <Badge key={i} variant="outline" className="text-[9px] px-1.5">{s}</Badge>)}</div>
              </div>
            )}
            {tactics.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">MITRE Tactics</p>
                <div className="flex flex-wrap gap-1">{tactics.slice(0, 6).map((t: string, i: number) => <Badge key={i} className="text-[9px] px-1.5 bg-red-500/10 text-red-500 border-red-500/20 border">{t}</Badge>)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {iocList.length > 0 && (
        <Card>
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IOC Reputation Panel</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="text-[10px] px-4">Type</TableHead>
                    <TableHead className="text-[10px] px-4">Indicator</TableHead>
                    <TableHead className="text-[10px] px-4 text-center">Reputation</TableHead>
                    <TableHead className="text-[10px] px-4">Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {iocList.map((ioc: any, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`row-ioc-${i}`}>
                      <TableCell className="px-4 py-2 text-[11px]">{ioc.type || ioc.indicator_type}</TableCell>
                      <TableCell className="px-4 py-2 font-mono text-[11px]">{ioc.value || ioc.indicator_value}</TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <Badge className={`text-[9px] px-1.5 ${ioc.reputation === "malicious" ? "bg-red-500/15 text-red-500 border-red-500/30 border" : ioc.reputation === "suspicious" ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30 border" : "bg-green-500/15 text-green-600 border-green-500/30 border"}`}>{ioc.reputation || "unknown"}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-[11px] text-muted-foreground">{ioc.country || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <OpenCTIAttributionPanel incidentId={incident?.id} />
    </div>
  );
}

function OpenCTIAttributionPanel({ incidentId }: { incidentId?: number }) {
  const { data: contexts, isLoading } = useQuery<Array<{
    id: number;
    ioc_value: string;
    ioc_type: string;
    stix_id?: string;
    actor_name?: string;
    campaign_name?: string;
    malware_family?: string;
    confidence: number;
    score: number;
  }>>({
    queryKey: [`/api/integrations/opencti/ioc-context?incidentId=${incidentId}`],
    enabled: !!incidentId,
  });

  if (!incidentId) return null;
  if (!isLoading && (!contexts || contexts.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-blue-400" />
          OpenCTI Attribution
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {isLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="space-y-2">
            {contexts!.map((ctx, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center p-2 rounded-md border bg-muted/20 text-[11px]" data-testid={`opencti-context-${ctx.id}`}>
                <span className="font-mono text-muted-foreground truncate max-w-[140px]">{ctx.ioc_value}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">{ctx.ioc_type}</Badge>
                {ctx.actor_name && (
                  <span className="flex items-center gap-1 text-red-400">
                    <Flag className="w-3 h-3" />{ctx.actor_name}
                  </span>
                )}
                {ctx.campaign_name && (
                  <span className="flex items-center gap-1 text-orange-400">
                    <Zap className="w-3 h-3" />{ctx.campaign_name}
                  </span>
                )}
                {ctx.malware_family && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <Bug className="w-3 h-3" />{ctx.malware_family}
                  </span>
                )}
                <span className="ml-auto text-muted-foreground">score:{ctx.score}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Autonomous Response Engine Tab (#117) ────────────────────────────────────

const ACTION_ICONS: Record<string, any> = {
  host_isolation: Lock,
  ip_block: Wifi,
  account_disable: User,
  ticket_escalation: Ticket,
  notification: BellRing,
  evidence_snapshot: Camera,
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-500/15 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ACTION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-400",
  executing: "bg-yellow-500/15 text-yellow-400",
  done: "bg-green-500/15 text-green-400",
  failed: "bg-red-500/15 text-red-400",
  undone: "bg-purple-500/15 text-purple-400",
  blocked: "bg-orange-500/15 text-orange-400",
};

function UndoWindow({ executedAt }: { executedAt: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => {
      const elapsed = Date.now() - new Date(executedAt).getTime();
      const left = Math.max(0, 15 * 60 * 1000 - elapsed);
      setRemaining(left);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [executedAt]);
  if (remaining <= 0) return <span className="text-xs text-muted-foreground">Undo window expired</span>;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return <span className="text-xs text-purple-400">{mins}m {secs}s to undo</span>;
}

const ALL_ACTION_TYPES = ["host_isolation","ip_block","account_disable","ticket_escalation","notification","evidence_snapshot"] as const;
const ACTION_LABELS: Record<string, string> = {
  host_isolation: "Host Isolation",
  ip_block: "IP Block",
  account_disable: "Account Disable",
  ticket_escalation: "Ticket Escalation",
  notification: "Notification",
  evidence_snapshot: "Evidence Snapshot",
};

function AllowlistPanel({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { data: allowlist = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "response-allowlist"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/response-allowlist`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Failed to load allowlist" }));
        throw new Error(err?.message || "Failed to load allowlist");
      }
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const allowlistMap = new Map((allowlist || []).map((a: any) => [a.action_type, a]));
  const hasAllowlist = allowlist.length > 0;

  const toggleMutation = useMutation({
    mutationFn: async ({ actionType, enable }: { actionType: string; enable: boolean }) => {
      if (enable) {
        return apiRequest("PUT", `/api/tenants/${tenantId}/response-allowlist/${actionType}`, { riskLevels: ["low","medium","high"], requiresApproval: false });
      } else {
        return apiRequest("DELETE", `/api/tenants/${tenantId}/response-allowlist/${actionType}`);
      }
    },
    onSuccess: () => { refetch(); },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ actionType, requiresApproval }: { actionType: string; requiresApproval: boolean }) =>
      apiRequest("PUT", `/api/tenants/${tenantId}/response-allowlist/${actionType}`, {
        riskLevels: allowlistMap.get(actionType)?.risk_levels || ["low","medium","high"],
        requiresApproval
      }),
    onSuccess: () => refetch(),
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="border-border/40 bg-muted/20">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Tenant Action Allowlist
          </CardTitle>
          <Badge variant="outline" className="text-[9px]">{hasAllowlist ? `${allowlist.length} types configured` : "All types allowed (default)"}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Configure which response actions are permitted for this tenant. Actions not in the allowlist will be blocked at execution time.</p>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_ACTION_TYPES.map(type => {
            const ActionIcon = ACTION_ICONS[type] || Shield;
            const isAllowed = !hasAllowlist || allowlistMap.has(type);
            const requiresApproval = allowlistMap.get(type)?.requires_approval ?? false;
            return (
              <div key={type} className={`flex items-center justify-between p-2 rounded border text-[10px] ${isAllowed ? "border-green-500/20 bg-green-950/10" : "border-border/30 bg-muted/30 opacity-60"}`}>
                <div className="flex items-center gap-1.5">
                  <ActionIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{ACTION_LABELS[type]}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isAllowed && (
                    <button
                      className={`text-[9px] px-1 rounded border ${requiresApproval ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-green-500/10 text-green-400 border-green-500/30"}`}
                      onClick={() => approvalMutation.mutate({ actionType: type, requiresApproval: !requiresApproval })}
                      title={requiresApproval ? "Requires approval (click to auto-approve)" : "Auto-approved (click to require approval)"}
                    >
                      {requiresApproval ? "Manual" : "Auto"}
                    </button>
                  )}
                  <button
                    className={`text-[9px] px-1 rounded border ${isAllowed ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-green-500/10 text-green-400 border-green-500/30"}`}
                    onClick={() => toggleMutation.mutate({ actionType: type, enable: !isAllowed })}
                    disabled={toggleMutation.isPending}
                  >
                    {isAllowed ? "Block" : "Allow"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResponseTab({ incidentId, incident }: { incidentId: number; incident: any }) {
  const { toast } = useToast();
  const { currentTenant, isMSS } = useTenant();
  const isTP = incident?.classification === "true_positive" || incident?.is_true_positive === true;
  const [showAllowlist, setShowAllowlist] = useState(false);

  const { data: plan, isLoading: planLoading, refetch: refetchPlan } = useQuery<any>({
    queryKey: ["/api/incidents", incidentId, "response-plan"],
    queryFn: async () => {
      const r = await fetch(`/api/incidents/${incidentId}/response-plan`, { credentials: "include" });
      if (!r.ok) {
        if (r.status === 404) return null;
        const err = await r.json().catch(() => ({ message: "Failed to load response plan" }));
        throw new Error(err?.message || "Failed to load response plan");
      }
      const data = await r.json();
      return (data && Array.isArray(data.actions)) ? data : null;
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/incidents/${incidentId}/response-plan`),
    onSuccess: () => { refetchPlan(); toast({ title: "Response plan generated", description: "AI has built a step-by-step response plan." }); },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message || "Could not build response plan.", variant: "destructive" }),
  });

  const modeMutation = useMutation<{ success: boolean; mode: string; autoExecuted: Array<{ actionId: number; success: boolean; message: string }> }, Error, string>({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("PATCH", `/api/incidents/${incidentId}/response-plan/mode`, { mode });
      return res.json();
    },
    onSuccess: (data) => {
      refetchPlan();
      queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "war-room"] });
      const autoExecuted = data?.autoExecuted ?? [];
      if (autoExecuted.length > 0) {
        const successCount = autoExecuted.filter((r) => r.success).length;
        toast({
          title: `Full-Auto activated — ${successCount}/${autoExecuted.length} low-risk actions executed`,
          description: "Medium and high-risk actions remain queued for manual analyst approval."
        });
      } else {
        toast({ title: "Execution mode updated" });
      }
    },
    onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const executeMutation = useMutation<{ results: Array<{ actionId: number; success: boolean; message: string }> }, Error, number | undefined>({
    mutationFn: async (actionId?: number) => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/response-plan/execute`, { actionId: actionId ?? null });
      return res.json();
    },
    onSuccess: (data) => {
      refetchPlan();
      queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "war-room"] });
      const results = data?.results ?? [];
      const successCount = results.filter((r) => r.success).length;
      toast({ title: `${successCount}/${results.length} actions completed`, description: "Execution results recorded in evidence locker." });
    },
    onError: (err) => toast({ title: "Execution failed", description: err.message, variant: "destructive" }),
  });

  const undoMutation = useMutation<{ success: boolean; message: string }, Error, number>({
    mutationFn: async (actionId: number) => {
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/response-plan/undo/${actionId}`);
      return res.json();
    },
    onSuccess: (data) => {
      refetchPlan();
      queryClient.invalidateQueries({ queryKey: ["/api/incidents", incidentId, "war-room"] });
      toast({ title: data?.success ? "Action reversed" : "Undo failed", description: data?.message, variant: data?.success ? "default" : "destructive" });
    },
    onError: (err) => toast({ title: "Undo failed", description: err.message, variant: "destructive" }),
  });

  if (!isTP) {
    return (
      <Card className="border-dashed border-yellow-500/40">
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-yellow-500/60" />
          <p className="text-sm font-medium text-muted-foreground">Autonomous Response requires a confirmed True Positive</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Classify this incident as TP on the Incidents page to unlock the response engine.</p>
        </CardContent>
      </Card>
    );
  }

  const actions: any[] = plan?.actions || [];
  const mode = plan?.mode || "manual";
  const planStatus = plan?.status || "ready";
  const pendingCount = actions.filter((a: any) => a.status === "pending").length;
  const doneCount = actions.filter((a: any) => a.status === "done").length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header Card */}
        <Card className="border-border/50 bg-gradient-to-r from-blue-950/20 to-purple-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/15 border border-blue-500/30">
                  <Cpu className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-sm">Autonomous Response Engine</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">AI-generated containment & eradication plan</p>
                </div>
              </div>
              {plan && (
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs capitalize ${planStatus === "complete" ? "bg-green-500/15 text-green-400 border-green-500/30 border" : planStatus === "in_progress" ? "bg-blue-500/15 text-blue-400 border-blue-500/30 border" : "bg-muted text-muted-foreground border"}`}>
                    {planStatus.replace("_", " ")}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>

          {plan?.execution_summary && (
            <CardContent className="pt-0">
              <div className="bg-muted/40 rounded-md p-3 border border-border/40">
                <p className="text-xs text-muted-foreground leading-relaxed">{plan.execution_summary}</p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* No plan yet */}
        {!plan && !planLoading && (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-12 text-center">
              <div className="p-3 rounded-full bg-blue-500/10 w-fit mx-auto mb-4">
                <Brain className="h-8 w-8 text-blue-400" />
              </div>
              <p className="text-sm font-medium mb-1">No response plan generated yet</p>
              <p className="text-xs text-muted-foreground mb-4">AI will analyze this incident and build a prioritized containment plan with Manual, Semi-Auto, or Full-Auto execution modes.</p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="btn-generate-response-plan"
              >
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                Generate AI Response Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {planLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        )}

        {plan && (
          <>
            {/* Mode Selector + Bulk Execute */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-muted-foreground font-medium">Execution Mode:</span>
                <div className="flex gap-1">
                  {(["manual", "semi_auto", "full_auto"] as const).map(m => (
                    <Button
                      key={m}
                      size="sm"
                      variant={mode === m ? "default" : "outline"}
                      className={`text-xs h-7 px-3 ${mode === m ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                      onClick={() => modeMutation.mutate(m)}
                      disabled={modeMutation.isPending || planStatus === "complete"}
                      data-testid={`btn-mode-${m}`}
                    >
                      {m === "manual" ? "Manual" : m === "semi_auto" ? "Semi-Auto" : "Full Auto"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {pendingCount > 0 && mode === "full_auto" && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-xs h-7"
                    onClick={() => executeMutation.mutate(undefined)}
                    disabled={executeMutation.isPending}
                    data-testid="btn-execute-all"
                  >
                    {executeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                    Execute All ({pendingCount})
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => refetchPlan()} data-testid="btn-refresh-plan">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round((doneCount / actions.length) * 100)}%` }} />
                </div>
                <span>{doneCount}/{actions.length} steps complete</span>
                {isMSS && currentTenant && (
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors flex items-center gap-1"
                    onClick={() => setShowAllowlist(v => !v)}
                    data-testid="btn-toggle-allowlist"
                  >
                    <Settings className="h-2.5 w-2.5" />
                    {showAllowlist ? "Hide" : "Allowlist"}
                  </button>
                )}
              </div>
            )}

            {/* Allowlist Config Panel */}
            {showAllowlist && isMSS && currentTenant && (
              <AllowlistPanel tenantId={currentTenant.id} />
            )}

            {/* Actions List */}
            <div className="space-y-2">
              {actions.map((action: any, idx: number) => {
                const Icon = ACTION_ICONS[action.action_type] || Shield;
                const isDone = action.status === "done";
                const isFailed = action.status === "failed";
                const isPending = action.status === "pending";
                const isUndone = action.status === "undone";
                const isBlocked = action.status === "blocked";

                return (
                  <Card
                    key={action.id}
                    className={`border transition-all ${isDone ? "border-green-500/30 bg-green-950/5" : isFailed ? "border-red-500/30 bg-red-950/5" : isUndone ? "border-purple-500/30 bg-purple-950/5" : isBlocked ? "border-orange-500/30 bg-orange-950/5 opacity-70" : "border-border/50"}`}
                    data-testid={`action-card-${action.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Step number + icon */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? "bg-green-500/20 text-green-400" : isFailed ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"}`}>
                            {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : isFailed ? <XCircle className="h-3.5 w-3.5" /> : action.step_order}
                          </div>
                        </div>

                        {/* Action info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">{action.action_type.replace(/_/g, " ").toUpperCase()}</span>
                            <Badge variant="outline" className={`text-[9px] px-1.5 border ${RISK_COLORS[action.risk_level] || RISK_COLORS.medium}`}>
                              {action.risk_level} risk
                            </Badge>
                            <Badge className={`text-[9px] px-1.5 ${ACTION_STATUS_COLORS[action.status] || "bg-muted text-muted-foreground"}`}>
                              {action.status}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1 mb-1">
                            <Target className="h-3 w-3 text-muted-foreground/60" />
                            <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded font-mono text-blue-300 truncate">{action.target}</code>
                          </div>

                          {action.rationale && <p className="text-[11px] text-muted-foreground leading-relaxed mb-1">{action.rationale}</p>}
                          {action.expected_impact && <p className="text-[10px] text-muted-foreground/70">{action.expected_impact}</p>}
                          {action.estimated_seconds && (
                            <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              Est. {action.estimated_seconds < 60 ? `${action.estimated_seconds}s` : `${Math.round(action.estimated_seconds / 60)}m`}
                            </p>
                          )}

                          {action.execution_result?.message && (
                            <div className={`mt-1.5 text-[10px] px-2 py-1 rounded ${isDone ? "bg-green-950/30 text-green-400" : "bg-red-950/30 text-red-400"}`}>
                              {action.execution_result.message}
                            </div>
                          )}

                          {isDone && action.is_reversible && action.executed_at && (
                            <div className="mt-1">
                              <UndoWindow executedAt={action.executed_at} />
                            </div>
                          )}

                          {action.executed_by && (
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                              by {action.executed_by} · {action.executed_at ? new Date(action.executed_at).toLocaleTimeString() : ""}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {isPending && !isBlocked && (mode === "semi_auto" || mode === "full_auto") && (
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[10px] bg-blue-600 hover:bg-blue-700"
                              onClick={() => executeMutation.mutate(action.id)}
                              disabled={executeMutation.isPending}
                              data-testid={`btn-execute-action-${action.id}`}
                            >
                              <Play className="h-3 w-3 mr-1" /> Run
                            </Button>
                          )}
                          {isDone && action.is_reversible && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                              onClick={() => undoMutation.mutate(action.id)}
                              disabled={undoMutation.isPending}
                              data-testid={`btn-undo-action-${action.id}`}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Undo
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Audit Trail Note */}
            <p className="text-[10px] text-muted-foreground/50 text-center">
              All actions are logged in the incident timeline. Undo window: 15 minutes after execution.
            </p>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── Entity Intelligence Graph Tab ─────────────────────────────────────────

type NodeRisk = "malicious" | "suspicious" | "enriched" | "clean" | "unknown";
type EntityNodeType = "host" | "user" | "ip" | "domain" | "hash" | "process" | "email" | "application";
type EdgeRelation = string;

/** Minimal shape of an incident row returned by the incidents API for graph historical correlation */
interface IncidentSummary {
  id: number;
  title: string | null;
  severity: "critical" | "high" | "medium" | "low" | "info" | null;
  status: string | null;
}

/** Minimal shape of a ticket row returned by the tickets API for graph historical correlation */
interface TicketSummary {
  id: number;
  title: string | null;
  subject: string | null;
  priority: "critical" | "high" | "medium" | "low" | null;
}

/** Opaque metadata bag attached to graph nodes (keys from enrichment; values are strings/numbers/booleans) */
type NodeMetadata = Record<string, string | number | boolean | null>;

interface GraphNode {
  id: string;
  label: string;
  type: EntityNodeType;
  risk: NodeRisk;
  riskScore: number;
  degree: number;
  isInitialAccess: boolean;
  isHighImpact: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  killChainPhase: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  country: string | null;
  metadata: NodeMetadata;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  killChainPhase: string | null;
  mitreTactic: string | null;
  timestamp: string | null;
  severity: string | null;
  eventType: string | null;
  weight: number;
}

interface AttackPathStep {
  nodeId: string;
  nodeLabel: string;
  nodeType: EntityNodeType;
  edgeRelation: string | null;
  killChainPhase: string | null;
  mitreTactic: string | null;
  timestamp: string | null;
}

interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attackPath: AttackPathStep[];
  initialAccessNodeId: string | null;
  highImpactNodeId: string | null;
  blastRadius: {
    affectedUsers: number;
    affectedHosts: number;
    affectedApplications: number;
    affectedIPs: number;
    totalEntities: number;
  };
  builtAt: string;
}

const NODE_RISK_COLORS: Record<NodeRisk, string> = {
  malicious: "#ef4444",
  suspicious: "#f97316",
  enriched: "#eab308",
  clean: "#3b82f6",
  unknown: "#6b7280",
};

const NODE_TYPE_ICON: Record<EntityNodeType, string> = {
  host: "🖥",
  user: "👤",
  ip: "🌐",
  domain: "🔗",
  hash: "#",
  process: "⚙",
  email: "✉",
  application: "📦",
};

function EntityNodeIcon({ type, size = 14 }: { type: EntityNodeType; size?: number }) {
  const icons: Record<EntityNodeType, any> = {
    host: Cpu,
    user: User,
    ip: Network,
    domain: Link2,
    hash: Hash,
    process: Terminal,
    email: BellRing,
    application: FileText,
  };
  const Icon = icons[type] || Hash;
  return <Icon style={{ width: size, height: size }} />;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function useForceSimulation(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!nodes.length) return;

    const simNodes: SimNode[] = nodes.map((n, i) => ({
      ...n,
      x: width / 2 + Math.cos((2 * Math.PI * i) / nodes.length) * (Math.min(width, height) * 0.35),
      y: height / 2 + Math.sin((2 * Math.PI * i) / nodes.length) * (Math.min(width, height) * 0.35),
      vx: 0,
      vy: 0,
    }));

    const nodeById = new Map(simNodes.map(n => [n.id, n]));

    let alpha = 1.0;
    const ALPHA_DECAY = 0.02;
    const REPULSION = 4000;
    const LINK_DIST = 150;
    const LINK_STRENGTH = 0.15;
    const CENTER_STRENGTH = 0.005;

    function tick() {
      if (alpha < 0.001) {
        const pos = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]));
        setPositions(pos);
        return;
      }

      // Repulsion (node-node)
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const force = (REPULSION * alpha) / dist2;
          const fx = dx * force;
          const fy = dy * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Attraction (linked nodes)
      for (const edge of edges) {
        const src = nodeById.get(edge.source);
        const tgt = nodeById.get(edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = (dist - LINK_DIST) * LINK_STRENGTH * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // Center gravity
      for (const n of simNodes) {
        n.vx += (width / 2 - n.x) * CENTER_STRENGTH * alpha;
        n.vy += (height / 2 - n.y) * CENTER_STRENGTH * alpha;
      }

      // Apply velocities with damping
      for (const n of simNodes) {
        n.vx *= 0.8;
        n.vy *= 0.8;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp within bounds
        n.x = Math.max(40, Math.min(width - 40, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      }

      alpha -= ALPHA_DECAY;
      const pos = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]));
      setPositions(pos);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [nodes.map(n => n.id).join(","), edges.length, width, height]);

  return positions;
}

function EntityGraphTab({ incidentId, incident, isMSS = false }: { incidentId: number; incident: any; isMSS?: boolean }) {
  const { data: graph, isLoading, error, refetch } = useQuery<EntityGraph>({
    queryKey: ["/api/incidents", incidentId, "entity-graph"],
    queryFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/entity-graph`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load entity graph");
      return res.json();
    },
    enabled: !!incidentId,
    staleTime: 5 * 60 * 1000,
  });

  const tenantId = incident?.tenant_id;

  // Declare node-panel state early so it can be referenced in queries below
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodePanelTab, setNodePanelTab] = useState<"overview" | "threat-intel" | "historical" | "caasm">("overview");

  // Fetch related incidents for Historical tab (when node is selected)
  const { data: relatedIncidents } = useQuery<IncidentSummary[]>({
    queryKey: ["/api/incidents", tenantId, "entity-related", selectedNode?.label],
    queryFn: async (): Promise<IncidentSummary[]> => {
      if (!tenantId || !selectedNode?.label) return [];
      const res = await fetch(`/api/incidents/${tenantId}?limit=5&entitySearch=${encodeURIComponent(selectedNode.label)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      return (data as IncidentSummary[]).filter(i => i.id !== incidentId).slice(0, 5);
    },
    enabled: !!tenantId && !!selectedNode && nodePanelTab === "historical",
    staleTime: 2 * 60 * 1000,
  });

  // Fetch related tickets for Historical tab
  const { data: relatedTickets } = useQuery<TicketSummary[]>({
    queryKey: ["/api/tickets", tenantId, "entity-related", selectedNode?.label],
    queryFn: async (): Promise<TicketSummary[]> => {
      if (!tenantId || !selectedNode?.label) return [];
      const res = await fetch(`/api/tickets/${tenantId}?limit=5&entitySearch=${encodeURIComponent(selectedNode.label)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      return (data as TicketSummary[]).slice(0, 5);
    },
    enabled: !!tenantId && !!selectedNode && nodePanelTab === "historical",
    staleTime: 2 * 60 * 1000,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAttackPath, setShowAttackPath] = useState(false);
  const [scrubberIdx, setScrubberIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vbx: number; vby: number } | null>(null);

  const W = 720;
  const H = 480;

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const simPositions = useForceSimulation(nodes, edges, W, H);

  // Merge manual drag positions with simulation
  const positions = useMemo(() => {
    const merged = new Map(simPositions);
    manualPositions.forEach((pos, id) => merged.set(id, pos));
    return merged;
  }, [simPositions, manualPositions]);

  // Graph editing mode state (declare before allNodes/allEdges so they can use these)
  const [editMode, setEditMode] = useState<"none" | "add-node" | "add-edge" | "delete">("none");
  const [addEdgeFrom, setAddEdgeFrom] = useState<string | null>(null);
  const [customNodes, setCustomNodes] = useState<GraphNode[]>([]);
  const [customEdges, setCustomEdges] = useState<GraphEdge[]>([]);
  const [deletedNodeIds, setDeletedNodeIds] = useState<Set<string>>(new Set());
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<Set<string>>(new Set());

  // Merge graph with customizations (before visibleEdges)
  const allNodes = useMemo(() => {
    const base = (nodes as GraphNode[]).filter(n => !deletedNodeIds.has(n.id));
    return [...base, ...customNodes];
  }, [nodes, customNodes, deletedNodeIds]);

  const allEdges = useMemo(() => {
    const base = edges.filter(e => !deletedEdgeIds.has(e.id) && !deletedNodeIds.has(e.source) && !deletedNodeIds.has(e.target));
    return [...base, ...customEdges];
  }, [edges, customEdges, deletedEdgeIds, deletedNodeIds]);

  // Filter edges and compute fade-in opacity by scrubber position
  const { visibleEdges, edgeScrubberOpacity } = useMemo(() => {
    if (scrubberIdx === null) {
      const opacities = new Map<string, number>();
      for (const e of allEdges) opacities.set(e.id, 1);
      return { visibleEdges: allEdges, edgeScrubberOpacity: opacities };
    }
    const sortedTimestamps = allEdges
      .map(e => e.timestamp)
      .filter(Boolean)
      .sort() as string[];
    if (!sortedTimestamps.length) {
      const opacities = new Map<string, number>();
      for (const e of allEdges) opacities.set(e.id, 1);
      return { visibleEdges: allEdges, edgeScrubberOpacity: opacities };
    }
    const cutoff = sortedTimestamps[Math.min(scrubberIdx, sortedTimestamps.length - 1)];
    const cutoffMs = new Date(cutoff).getTime();
    // Fade window: edges within 10 minutes of the cutoff get graduated opacity (fade-in effect)
    const FADE_WINDOW_MS = 10 * 60 * 1000;
    const visible = allEdges.filter(e => !e.timestamp || e.timestamp <= cutoff);
    const opacities = new Map<string, number>();
    for (const e of visible) {
      if (!e.timestamp) {
        opacities.set(e.id, 0.15); // edges without timestamps are dimmed during scrub
      } else {
        const diff = cutoffMs - new Date(e.timestamp).getTime();
        // Fully visible: 1.0; just appeared (within fade window): 0.3–1.0
        const fade = diff <= FADE_WINDOW_MS ? 0.3 + 0.7 * (1 - diff / FADE_WINDOW_MS) : 1;
        opacities.set(e.id, Math.min(1, Math.max(0.3, fade)));
      }
    }
    return { visibleEdges: visible, edgeScrubberOpacity: opacities };
  }, [allEdges, scrubberIdx]);

  // Attack path node set
  const attackPathNodeIds = useMemo(() => new Set(graph?.attackPath?.map(s => s.nodeId) ?? []), [graph]);

  // Attack path EXACT edge set (consecutive node-pairs only — fixes approximate highlighting)
  const attackPathEdgeIds = useMemo(() => {
    const path = graph?.attackPath ?? [];
    const set = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      set.add(`${path[i].nodeId}::${path[i + 1].nodeId}`);
      set.add(`${path[i + 1].nodeId}::${path[i].nodeId}`);
    }
    return set;
  }, [graph]);

  // Node size: base + degree scaling
  function nodeRadius(n: GraphNode): number {
    // Sizing combines degree-centrality (connectivity) with risk score (threat signal).
    // isInitialAccess / isHighImpact nodes get a larger baseline so they stand out.
    const base = n.isInitialAccess || n.isHighImpact ? 18 : 14;
    const degreeBonus = n.degree * 1.2;
    const riskBonus = n.riskScore ? (n.riskScore / 100) * 4 : 0; // up to +4px at riskScore=100
    return Math.min(base + degreeBonus + riskBonus, 30);
  }

  function getSvgCoords(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    const svgX = (clientX - rect.left) / viewBox.scale + viewBox.x;
    const svgY = (clientY - rect.top) / viewBox.scale + viewBox.y;
    return { x: svgX, y: svgY };
  }

  function handleNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    setDragging(nodeId);
  }

  function handleSvgMouseMove(e: React.MouseEvent) {
    if (dragging) {
      const { x, y } = getSvgCoords(e.clientX, e.clientY);
      setManualPositions(prev => new Map(prev).set(dragging, { x, y }));
    } else if (isPanning && panStart.current) {
      const dx = (e.clientX - panStart.current.x) / viewBox.scale;
      const dy = (e.clientY - panStart.current.y) / viewBox.scale;
      setViewBox(v => ({ ...v, x: panStart.current!.vbx - dx, y: panStart.current!.vby - dy }));
    }
  }

  function handleSvgMouseUp(e: React.MouseEvent) {
    if (dragging) {
      setDragging(null);
    } else if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
  }

  function handleSvgMouseDown(e: React.MouseEvent) {
    if (e.button === 0 && !dragging) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y };
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewBox(v => {
      const newScale = Math.max(0.3, Math.min(3, v.scale * factor));
      return { ...v, scale: newScale };
    });
  }

  function exportPNG() {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `incident-${incidentId}-entity-graph.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  const [embedStatus, setEmbedStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  function embedInReport() {
    const svg = svgRef.current;
    if (!svg) return;
    setEmbedStatus("loading");
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setEmbedStatus("error"); return; }
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngDataUrl = canvas.toDataURL("image/png");
      URL.revokeObjectURL(url);
      try {
        const resp = await fetch(`/api/incidents/${incidentId}/entity-graph-snapshot`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pngDataUrl }),
        });
        if (!resp.ok) throw new Error("Failed to save snapshot");
        setEmbedStatus("success");
        setTimeout(() => setEmbedStatus("idle"), 3000);
      } catch (_e) {
        setEmbedStatus("error");
        setTimeout(() => setEmbedStatus("idle"), 3000);
      }
    };
    img.onerror = () => { setEmbedStatus("error"); setTimeout(() => setEmbedStatus("idle"), 3000); };
    img.src = url;
  }

  function handleNodeEditClick(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (editMode === "delete") {
      setDeletedNodeIds(prev => new Set([...prev, nodeId]));
      if (selectedNode?.id === nodeId) setSelectedNode(null);
    } else if (editMode === "add-edge") {
      if (!addEdgeFrom) {
        setAddEdgeFrom(nodeId);
      } else if (addEdgeFrom !== nodeId) {
        const newEdge: GraphEdge = {
          id: `custom-${Date.now()}`,
          source: addEdgeFrom,
          target: nodeId,
          relation: "manual_link",
          killChainPhase: null,
          mitreTactic: null,
          timestamp: null,
          severity: null,
          eventType: null,
          weight: 1,
        };
        setCustomEdges(prev => [...prev, newEdge]);
        setAddEdgeFrom(null);
      }
    } else {
      setSelectedNode(allNodes.find(n => n.id === nodeId) ?? null);
    }
  }

  function handleAddCustomNode() {
    const label = prompt("Enter entity value (IP, hostname, user, domain, hash, etc.):");
    if (!label?.trim()) return;
    const type = label.includes("@") ? "email"
      : /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(label) ? "ip"
      : label.includes(".") ? "domain"
      : "host";
    const newNode: GraphNode = {
      id: `custom::${label.toLowerCase()}`,
      type,
      label: label.trim(),
      risk: "unknown",
      riskScore: 0,
      degree: 0,
      isInitialAccess: false,
      isHighImpact: false,
      firstSeen: null,
      lastSeen: null,
      killChainPhase: null,
      mitreTactic: null,
      mitreTechnique: null,
      country: null,
      metadata: { source: "manual" },
    };
    setCustomNodes(prev => [...prev, newNode]);
    setManualPositions(prev => new Map(prev).set(newNode.id, { x: W / 2 + Math.random() * 60 - 30, y: H / 2 + Math.random() * 60 - 30 }));
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  if (error || !graph) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Failed to build entity graph</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (nodes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Network className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No entity relationships found</p>
          <p className="text-xs text-muted-foreground mt-1">The graph auto-populates from correlated security events. Ensure the incident has related events in the Timeline tab.</p>
        </CardContent>
      </Card>
    );
  }

  const sortedEdgeTimestamps = edges.map(e => e.timestamp).filter(Boolean).sort() as string[];

  return (
    <div className="space-y-3">
      {/* Blast Radius Card */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Entities", val: graph.blastRadius.totalEntities, icon: Network, color: "text-cyan-400" },
          { label: "Users", val: graph.blastRadius.affectedUsers, icon: User, color: "text-blue-400" },
          { label: "Hosts", val: graph.blastRadius.affectedHosts, icon: Cpu, color: "text-purple-400" },
          { label: "IPs", val: graph.blastRadius.affectedIPs, icon: Globe, color: "text-orange-400" },
          { label: "Applications", val: graph.blastRadius.affectedApplications, icon: FileText, color: "text-green-400" },
        ].map(item => (
          <Card key={item.label} className="border-border/50 bg-muted/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <item.icon className={`w-3 h-3 ${item.color}`} />
              </div>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={showAttackPath ? "default" : "outline"}
          onClick={() => setShowAttackPath(v => !v)}
          className={showAttackPath ? "bg-orange-500/20 border-orange-500/40 text-orange-400 hover:bg-orange-500/30" : ""}
          data-testid="button-toggle-attack-path"
        >
          <Zap className="w-3.5 h-3.5 mr-1" />
          {showAttackPath ? "Hide" : "Show"} Attack Path
        </Button>

        {/* Graph editing controls — restricted to MSS users only */}
        {isMSS && (
          <div className="flex items-center gap-1 border border-border/50 rounded-md px-1.5 py-0.5">
            <span className="text-[9px] text-muted-foreground mr-1">Edit:</span>
            <Button
              size="sm" variant="ghost"
              className={`h-6 px-2 text-[10px] ${editMode === "add-node" ? "bg-green-500/20 text-green-400" : ""}`}
              onClick={() => { setEditMode(editMode === "add-node" ? "none" : "add-node"); if (editMode !== "add-node") handleAddCustomNode(); }}
              data-testid="button-add-node"
              title="Add custom node"
            >
              <Plus className="w-3 h-3 mr-0.5" />Node
            </Button>
            <Button
              size="sm" variant="ghost"
              className={`h-6 px-2 text-[10px] ${editMode === "add-edge" ? "bg-cyan-500/20 text-cyan-400" : ""}`}
              onClick={() => { setEditMode(editMode === "add-edge" ? "none" : "add-edge"); setAddEdgeFrom(null); }}
              data-testid="button-add-edge"
              title="Draw edge between nodes"
            >
              <Link2 className="w-3 h-3 mr-0.5" />Edge
            </Button>
            <Button
              size="sm" variant="ghost"
              className={`h-6 px-2 text-[10px] ${editMode === "delete" ? "bg-red-500/20 text-red-400" : ""}`}
              onClick={() => setEditMode(editMode === "delete" ? "none" : "delete")}
              data-testid="button-delete-node"
              title="Click node to delete"
            >
              <Trash2 className="w-3 h-3 mr-0.5" />Del
            </Button>
            {(customNodes.length > 0 || customEdges.length > 0 || deletedNodeIds.size > 0) && (
              <Button
                size="sm" variant="ghost"
                className="h-6 px-2 text-[10px] text-muted-foreground"
                onClick={() => { setCustomNodes([]); setCustomEdges([]); setDeletedNodeIds(new Set()); setDeletedEdgeIds(new Set()); setEditMode("none"); }}
                data-testid="button-reset-edits"
                title="Reset graph edits"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
        {isMSS && editMode === "add-edge" && (
          <span className="text-[10px] text-cyan-400 animate-pulse">
            {addEdgeFrom ? "Click target node" : "Click source node"}
          </span>
        )}
        {isMSS && editMode === "delete" && (
          <span className="text-[10px] text-red-400 animate-pulse">Click node to remove</span>
        )}

        <Button size="sm" variant="outline" onClick={() => { setManualPositions(new Map()); setViewBox({ x: 0, y: 0, scale: 1 }); }} data-testid="button-reset-graph">
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Reset Layout
        </Button>
        <Button size="sm" variant="outline" onClick={exportPNG} data-testid="button-export-graph">
          <Download className="w-3.5 h-3.5 mr-1" />Export PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={embedInReport}
          disabled={embedStatus === "loading"}
          className={
            embedStatus === "success" ? "border-green-500/50 text-green-400" :
            embedStatus === "error" ? "border-red-500/50 text-red-400" : ""
          }
          data-testid="button-embed-in-report"
          title="Save graph snapshot for inclusion in AI-generated IR report PDF"
        >
          <FileText className="w-3.5 h-3.5 mr-1" />
          {embedStatus === "loading" ? "Saving…" : embedStatus === "success" ? "Saved to Report!" : embedStatus === "error" ? "Failed" : "Embed in Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setViewBox(v => ({ ...v, scale: Math.min(v.scale * 1.2, 3) }))} data-testid="button-zoom-in">
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setViewBox(v => ({ ...v, scale: Math.max(v.scale * 0.8, 0.3) }))} data-testid="button-zoom-out">
          <span className="text-sm font-bold">−</span>
        </Button>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          {(["malicious", "suspicious", "enriched", "clean", "unknown"] as NodeRisk[]).map(r => (
            <span key={r} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: NODE_RISK_COLORS[r] }} />
              <span className="capitalize text-muted-foreground">{r}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Graph + Detail Panel */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div
            ref={containerRef}
            className="border border-border/50 rounded-lg bg-muted/10 overflow-hidden relative"
            style={{ height: H }}
          >
            <svg
              ref={svgRef}
              width="100%"
              height={H}
              viewBox={`${viewBox.x} ${viewBox.y} ${W / viewBox.scale} ${H / viewBox.scale}`}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseDown={handleSvgMouseDown}
              onMouseLeave={handleSvgMouseUp}
              onWheel={handleWheel}
              style={{ cursor: dragging ? "grabbing" : isPanning ? "grabbing" : "grab", userSelect: "none" }}
              data-testid="entity-graph-svg"
            >
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="hsl(var(--muted-foreground) / 0.4)" />
                </marker>
                <marker id="arrow-attack" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#f97316" />
                </marker>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Edges */}
              {visibleEdges.map(edge => {
                const src = positions.get(edge.source);
                const tgt = positions.get(edge.target);
                if (!src || !tgt) return null;
                const isAttackPathEdge = showAttackPath && attackPathEdgeIds.has(`${edge.source}::${edge.target}`);
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const srcNode = allNodes.find(n => n.id === edge.source);
                const tgtNode = allNodes.find(n => n.id === edge.target);
                const srcR = srcNode ? nodeRadius(srcNode) : 14;
                const tgtR = tgtNode ? nodeRadius(tgtNode) : 14;
                const x1 = src.x + (dx / dist) * srcR;
                const y1 = src.y + (dy / dist) * srcR;
                const x2 = tgt.x - (dx / dist) * (tgtR + 6);
                const y2 = tgt.y - (dy / dist) * (tgtR + 6);

                return (
                  <g key={edge.id}>
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isAttackPathEdge ? "#f97316" : "hsl(var(--muted-foreground) / 0.25)"}
                      strokeWidth={isAttackPathEdge ? 2.5 : Math.max(0.5, edge.weight * 0.4)}
                      markerEnd={isAttackPathEdge ? "url(#arrow-attack)" : "url(#arrow)"}
                      strokeDasharray={isAttackPathEdge ? undefined : edge.weight < 2 ? "4 4" : undefined}
                      opacity={edgeScrubberOpacity.get(edge.id) ?? 1}
                    />
                    {/* Edge label (relation) on hover area */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth={10}
                    />
                    {isAttackPathEdge && edge.killChainPhase && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 5}
                        fontSize={8}
                        fill="#f97316"
                        textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {edge.killChainPhase}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {allNodes.map(node => {
                const pos = positions.get(node.id);
                if (!pos) return null;
                const r = nodeRadius(node);
                const color = NODE_RISK_COLORS[node.risk];
                const isSelected = selectedNode?.id === node.id;
                const isInAttackPath = showAttackPath && attackPathNodeIds.has(node.id);
                const isEdgeSource = editMode === "add-edge" && addEdgeFrom === node.id;
                const isDeleteMode = editMode === "delete";

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x},${pos.y})`}
                    onMouseDown={e => {
                      // Drag is only active in normal "none" mode — other modes use click
                      if (editMode === "none") handleNodeMouseDown(e, node.id);
                    }}
                    onClick={e => handleNodeEditClick(e, node.id)}
                    style={{ cursor: isDeleteMode ? "not-allowed" : isEdgeSource ? "crosshair" : "pointer" }}
                    data-testid={`graph-node-${node.id}`}
                  >
                    {/* Glow ring for selected / attack path / edge-source */}
                    {(isSelected || isInAttackPath || isEdgeSource) && (
                      <circle r={r + 5} fill="none"
                        stroke={isEdgeSource ? "#22d3ee" : isSelected ? "#06b6d4" : "#f97316"}
                        strokeWidth={isEdgeSource ? 3 : 2} opacity={0.8}
                        filter={isSelected ? "url(#glow)" : undefined} />
                    )}
                    {/* Delete mode X indicator */}
                    {isDeleteMode && (
                      <text fontSize={r * 0.6} textAnchor="middle" dominantBaseline="central" fill="#ef4444" style={{ pointerEvents: "none" }}>✕</text>
                    )}
                    {/* Initial access star ring */}
                    {node.isInitialAccess && (
                      <circle r={r + 8} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />
                    )}
                    {/* High impact ring */}
                    {node.isHighImpact && !node.isInitialAccess && (
                      <circle r={r + 8} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="3 3" />
                    )}
                    {/* Node circle */}
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity={0.15}
                      stroke={color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    >
                      {/* Native SVG tooltip shown on hover (accessible, works without JS) */}
                      <title>
                        {[
                          `${node.type.toUpperCase()}: ${node.label}`,
                          `Risk: ${node.risk}${node.riskScore ? ` (score ${node.riskScore})` : ""}`,
                          node.killChainPhase ? `Kill Chain: ${node.killChainPhase}` : null,
                          node.mitreTactic ? `MITRE Tactic: ${node.mitreTactic}` : null,
                          node.firstSeen ? `First Seen: ${new Date(node.firstSeen).toLocaleDateString()}` : null,
                          node.country ? `Country: ${node.country}` : null,
                          node.isInitialAccess ? "⚠ Initial Access" : null,
                          node.isHighImpact ? "🎯 High Impact Target" : null,
                        ].filter(Boolean).join("\n")}
                      </title>
                    </circle>
                    {/* Node type icon text */}
                    <text fontSize={r * 0.85} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: "none" }}>
                      {NODE_TYPE_ICON[node.type] || "?"}
                    </text>
                    {/* Node label */}
                    <text
                      y={r + 11}
                      fontSize={9}
                      textAnchor="middle"
                      fill="hsl(var(--foreground) / 0.8)"
                      style={{ pointerEvents: "none" }}
                    >
                      {node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label}
                    </text>
                    {/* Risk indicator dot */}
                    <circle cx={r - 3} cy={-(r - 3)} r={4} fill={color} />
                  </g>
                );
              })}
            </svg>

            {/* Zoom hint */}
            <div className="absolute bottom-2 right-2 text-[9px] text-muted-foreground">
              Scroll to zoom · Drag to pan · Click node for details
            </div>
          </div>

          {/* Timeline Scrubber */}
          {sortedEdgeTimestamps.length > 1 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                  <Play className="w-3 h-3" />Attack Timeline Scrubber
                </p>
                {scrubberIdx !== null && (
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => setScrubberIdx(null)}>
                    Show All
                  </Button>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={sortedEdgeTimestamps.length - 1}
                value={scrubberIdx ?? sortedEdgeTimestamps.length - 1}
                onChange={e => setScrubberIdx(parseInt(e.target.value))}
                className="w-full h-1.5 accent-cyan-500"
                data-testid="input-timeline-scrubber"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{new Date(sortedEdgeTimestamps[0]).toLocaleString()}</span>
                {scrubberIdx !== null && <span className="text-cyan-400 font-medium">Showing {visibleEdges.length}/{edges.length} events</span>}
                <span>{new Date(sortedEdgeTimestamps[sortedEdgeTimestamps.length - 1]).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Attack Path Steps */}
          {showAttackPath && graph.attackPath.length > 0 && (
            <Card className="mt-3 border-orange-500/30">
              <CardHeader className="pb-1 px-4 pt-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Attack Path — {graph.attackPath.length} hops
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-start gap-2 flex-wrap">
                  {graph.attackPath.map((step, idx) => (
                    <div key={step.nodeId} className="flex items-center gap-1">
                      <div
                        className="flex flex-col items-center p-1.5 rounded-md border border-orange-500/30 bg-orange-500/5 min-w-[70px] cursor-pointer hover:border-orange-500/60 transition-colors"
                        onClick={() => setSelectedNode(nodes.find(n => n.id === step.nodeId) ?? null)}
                        data-testid={`attack-path-step-${idx}`}
                      >
                        <EntityNodeIcon type={step.nodeType} size={12} />
                        <span className="text-[8px] font-medium mt-0.5 text-center leading-tight max-w-[60px] truncate">
                          {step.nodeLabel}
                        </span>
                        {step.killChainPhase && (
                          <span className="text-[7px] text-orange-400 mt-0.5 text-center">{step.killChainPhase}</span>
                        )}
                      </div>
                      {idx < graph.attackPath.length - 1 && (
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] text-muted-foreground">{step.edgeRelation?.replace(/_/g, " ") || "→"}</span>
                          <ChevronRight className="w-3 h-3 text-orange-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Node Detail Side Panel — 4-tab design */}
        {selectedNode && (
          <div className="w-72 shrink-0">
            <Card className="border-cyan-500/30">
              {/* Header */}
              <CardHeader className="pb-2 px-3 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: NODE_RISK_COLORS[selectedNode.risk] }} />
                    <CardTitle className="text-xs font-semibold capitalize truncate">{selectedNode.type} Entity</CardTitle>
                  </div>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => setSelectedNode(null)}>
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <EntityNodeIcon type={selectedNode.type} size={14} />
                  <p className="text-xs font-mono break-all">{selectedNode.label}</p>
                </div>
                {/* Flags */}
                <div className="flex gap-1 flex-wrap mt-1">
                  {selectedNode.isInitialAccess && (
                    <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400 px-1 py-0">Initial Access</Badge>
                  )}
                  {selectedNode.isHighImpact && (
                    <Badge variant="outline" className="text-[9px] border-purple-500/40 text-purple-400 px-1 py-0">High Impact</Badge>
                  )}
                  {attackPathNodeIds.has(selectedNode.id) && (
                    <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-400 px-1 py-0">On Attack Path</Badge>
                  )}
                  {selectedNode.id.startsWith("custom::") && (
                    <Badge variant="outline" className="text-[9px] border-green-500/40 text-green-400 px-1 py-0">Manually Added</Badge>
                  )}
                </div>
              </CardHeader>

              {/* Tab bar */}
              <div className="flex border-b border-border/50 px-3">
                {(["overview", "threat-intel", "historical", "caasm"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setNodePanelTab(tab)}
                    className={`text-[9px] uppercase tracking-wider px-2 py-1.5 border-b-2 transition-colors capitalize ${
                      nodePanelTab === tab
                        ? "border-cyan-500 text-cyan-400"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`node-panel-tab-${tab}`}
                  >
                    {tab === "threat-intel" ? "Threat Intel" : tab === "caasm" ? "CAASM" : tab}
                  </button>
                ))}
              </div>

              <CardContent className="px-3 pb-3 pt-3 space-y-2.5 max-h-96 overflow-y-auto">
                {/* === OVERVIEW TAB === */}
                {nodePanelTab === "overview" && (
                  <>
                    {/* Risk score bar */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">Risk Score</span>
                        <span className="font-medium" style={{ color: NODE_RISK_COLORS[selectedNode.risk] }}>{selectedNode.riskScore}/100</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${selectedNode.riskScore}%`, background: NODE_RISK_COLORS[selectedNode.risk] }} />
                      </div>
                    </div>

                    {/* Risk + Connections */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Risk</span>
                        <Badge variant="outline" className="text-[9px] capitalize w-fit" style={{ borderColor: NODE_RISK_COLORS[selectedNode.risk], color: NODE_RISK_COLORS[selectedNode.risk] }}>
                          {selectedNode.risk}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Connections</span>
                        <span className="text-sm font-bold text-foreground">{selectedNode.degree}</span>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="space-y-0.5">
                      {selectedNode.firstSeen && (
                        <div className="flex justify-between text-[9px]">
                          <span className="text-muted-foreground">First seen</span>
                          <span className="font-mono">{new Date(selectedNode.firstSeen).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedNode.lastSeen && selectedNode.lastSeen !== selectedNode.firstSeen && (
                        <div className="flex justify-between text-[9px]">
                          <span className="text-muted-foreground">Last seen</span>
                          <span className="font-mono">{new Date(selectedNode.lastSeen).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Country */}
                    {selectedNode.country && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Country</span>
                        <span className="font-medium flex items-center gap-1"><Globe className="w-3 h-3" />{selectedNode.country}</span>
                      </div>
                    )}

                    {/* Relationships */}
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Relationships ({allEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length})</p>
                      {allEdges
                        .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                        .slice(0, 6)
                        .map(e => {
                          const isSource = e.source === selectedNode.id;
                          const otherId = isSource ? e.target : e.source;
                          const other = allNodes.find(n => n.id === otherId);
                          return (
                            <div key={e.id} className="flex items-center gap-1 text-[9px] bg-muted/20 rounded px-1.5 py-0.5" data-testid={`edge-detail-${e.id}`}>
                              {isSource ? <ArrowLeft className="w-2.5 h-2.5 text-orange-400 rotate-180 flex-shrink-0" /> : <ArrowLeft className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
                              <span className="text-muted-foreground">{e.relation.replace(/_/g, " ")}</span>
                              <span className="font-mono truncate flex-1">{other?.label ?? otherId}</span>
                              {e.id.startsWith("custom-") && (
                                <button className="text-red-400 hover:text-red-300" onClick={() => setDeletedEdgeIds(prev => new Set([...prev, e.id]))} title="Remove edge">✕</button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}

                {/* === THREAT INTEL TAB === */}
                {nodePanelTab === "threat-intel" && (
                  <>
                    {/* MITRE ATT&CK */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">MITRE ATT&CK</p>
                      {selectedNode.mitreTactic ? (
                        <div className="bg-muted/20 rounded p-2 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Tactic</span>
                            <span className="font-medium capitalize">{selectedNode.mitreTactic}</span>
                          </div>
                          {selectedNode.mitreTechnique && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-muted-foreground">Technique</span>
                              <Badge variant="outline" className="text-[9px] border-yellow-500/40 text-yellow-400 font-mono px-1 py-0">{selectedNode.mitreTechnique}</Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No MITRE mapping available</p>
                      )}
                    </div>

                    {/* Kill Chain Phase */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Kill Chain Phase</p>
                      {selectedNode.killChainPhase ? (
                        <Badge variant="outline" className="text-[9px] border-cyan-500/40 text-cyan-400">{selectedNode.killChainPhase}</Badge>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No Kill Chain mapping</p>
                      )}
                    </div>

                    {/* IOC Context */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">IOC Context</p>
                      <div className="bg-muted/20 rounded p-2 space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type</span>
                          <span className="capitalize font-medium">{selectedNode.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Indicator</span>
                          <span className="font-mono truncate max-w-[100px]">{selectedNode.label}</span>
                        </div>
                        {selectedNode.country && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Geo</span>
                            <span>{selectedNode.country}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Propagation */}
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Cross-Incident Propagation</p>
                      <p className="text-[10px] text-muted-foreground">Seen in <span className="text-foreground font-medium">1</span> incident(s). Check Threat Intel feed for further propagation history.</p>
                    </div>
                  </>
                )}

                {/* === HISTORICAL TAB === */}
                {nodePanelTab === "historical" && (
                  <>
                    {/* Related Incidents — real data fetched from incidents API */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        Related Incidents ({(relatedIncidents?.length ?? 0) + 1})
                      </p>
                      <div className="space-y-1">
                        {/* Always show current incident */}
                        <div className="flex items-center gap-2 text-[10px] bg-muted/20 rounded px-2 py-1">
                          <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                          <span className="flex-1 truncate">Incident #{incidentId} (current)</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-red-500/40 text-red-400">Active</Badge>
                        </div>
                        {/* Live-fetched related incidents */}
                        {relatedIncidents && relatedIncidents.length > 0 ? relatedIncidents.map((inc: IncidentSummary) => (
                          <div key={inc.id} className="flex items-center gap-2 text-[10px] bg-muted/20 rounded px-2 py-1">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.severity === "critical" ? "bg-red-500" : inc.severity === "high" ? "bg-orange-400" : "bg-yellow-400"}`} />
                            <span className="flex-1 truncate">#{inc.id}: {inc.title || "Untitled"}</span>
                            <span className="text-muted-foreground capitalize text-[8px]">{inc.status}</span>
                          </div>
                        )) : relatedIncidents?.length === 0 ? (
                          <p className="text-[9px] text-muted-foreground italic">No other incidents contain this indicator in their correlated events.</p>
                        ) : (
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Searching incidents…</div>
                        )}
                      </div>
                    </div>

                    {/* Open Tickets — real data fetched from tickets API */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        Open Tickets ({relatedTickets?.length ?? 0})
                      </p>
                      {relatedTickets && relatedTickets.length > 0 ? (
                        <div className="space-y-1">
                          {relatedTickets.map((ticket: TicketSummary) => (
                            <div key={ticket.id} className="flex items-center gap-2 text-[10px] bg-muted/20 rounded px-2 py-1">
                              <Ticket className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="flex-1 truncate">#{ticket.id}: {ticket.title || ticket.subject || "Untitled"}</span>
                              <Badge variant="outline" className={`text-[8px] px-1 py-0 ${ticket.priority === "critical" ? "border-red-500/40 text-red-400" : ticket.priority === "high" ? "border-orange-500/40 text-orange-400" : "border-border/40 text-muted-foreground"}`}>
                                {ticket.priority || "medium"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : relatedTickets?.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic">
                          No open tickets matched for <span className="font-mono text-foreground">{selectedNode.label}</span>. You can search directly in the Ticketing module.
                        </p>
                      ) : (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Searching tickets…</div>
                      )}
                    </div>

                    {/* Timeline from node metadata */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Entity Timeline</p>
                      <div className="space-y-1">
                        {selectedNode.firstSeen && (
                          <div className="flex items-center gap-2 text-[9px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            <span className="text-muted-foreground">First observed</span>
                            <span className="ml-auto font-mono">{new Date(selectedNode.firstSeen).toLocaleDateString()}</span>
                          </div>
                        )}
                        {selectedNode.lastSeen && (
                          <div className="flex items-center gap-2 text-[9px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                            <span className="text-muted-foreground">Last observed</span>
                            <span className="ml-auto font-mono">{new Date(selectedNode.lastSeen).toLocaleDateString()}</span>
                          </div>
                        )}
                        {!selectedNode.firstSeen && !selectedNode.lastSeen && (
                          <p className="text-[9px] text-muted-foreground italic">No timestamp data available for this entity from correlated events.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* === CAASM TAB === */}
                {nodePanelTab === "caasm" && (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Asset Linkage</p>
                      {selectedNode.type === "host" || selectedNode.type === "ip" ? (
                        <div className="bg-muted/20 rounded p-2 space-y-1.5 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Identifier</span>
                            <span className="font-mono">{selectedNode.label}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Entity Type</span>
                            <span className="capitalize">{selectedNode.type}</span>
                          </div>
                          <button
                            className="text-[9px] text-cyan-400 hover:text-cyan-300 underline mt-1 block"
                            onClick={() => window.open(`/caasm?search=${encodeURIComponent(selectedNode.label)}`, "_blank")}
                            data-testid="link-caasm-asset"
                          >
                            Open in CAASM Asset Explorer →
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">CAASM asset linking is available for host and IP entity types. This {selectedNode.type} entity is not directly mapped to a CAASM asset.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">CIS Score</p>
                      {selectedNode.type === "host" ? (
                        <div className="bg-muted/20 rounded p-2 text-[10px]">
                          <p className="text-muted-foreground">CIS benchmark score for this host is available in the CAASM module. Navigate to Asset Detail → CIS Benchmark Assessment tab for the full compliance posture.</p>
                          <button
                            className="text-[9px] text-cyan-400 hover:text-cyan-300 underline mt-1 block"
                            onClick={() => window.open(`/caasm`, "_blank")}
                            data-testid="link-caasm-cis"
                          >
                            View CIS Assessment in CAASM →
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">CIS scoring is applicable to host entities only.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Criticality</p>
                      <div className="bg-muted/20 rounded p-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Calculated Criticality</span>
                          <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-400 px-1 py-0">
                            {selectedNode.riskScore >= 70 ? "Critical" : selectedNode.riskScore >= 40 ? "High" : "Medium"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MalwareTab Component ─────────────────────────────────────────────────────
interface MalwareAnalysisResult {
  language: string;
  verdict: "malicious" | "suspicious" | "likely_benign" | "benign";
  confidence: number;
  summary: string;
  annotations: Array<{ line: number; code: string; severity: string; description: string; category: string }>;
  iocs: Array<{ type: string; value: string; context: string; severity: string }>;
  evasionTechniques: Array<{ name: string; description: string; severity: string }>;
  mitreMappings: Array<{ tacticId: string; tacticName: string; techniqueId: string; techniqueName: string; confidence: number }>;
  riskScore: number;
  analysisMethod: "ai" | "rule_based";
}

const MAL_SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-950/50 border-red-800",
  high: "text-orange-400 bg-orange-950/50 border-orange-800",
  medium: "text-yellow-400 bg-yellow-950/50 border-yellow-800",
  low: "text-blue-400 bg-blue-950/50 border-blue-800",
  info: "text-gray-400 bg-gray-900/50 border-gray-700",
};
const MAL_VERDICT: Record<string, { color: string; label: string }> = {
  malicious: { color: "text-red-400", label: "MALICIOUS" },
  suspicious: { color: "text-orange-400", label: "SUSPICIOUS" },
  likely_benign: { color: "text-yellow-400", label: "LIKELY BENIGN" },
  benign: { color: "text-green-400", label: "BENIGN" },
};

function MalwareTab({ incidentId, incident, isMSS }: { incidentId: number; incident: any; isMSS: boolean }) {
  const { toast } = useToast();
  const [script, setScript] = useState("");
  const [language, setLanguage] = useState("auto");
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("annotations");
  const [prePopulated, setPrePopulated] = useState(false);

  // Pre-populate script from incident evidence (script/payload/code/hash/attachment evidence types)
  interface EvidenceItem { id: number; type: string; value: string; description?: string; }
  const { data: evidenceRaw } = useQuery<EvidenceItem[]>({
    queryKey: ["/api/incidents", incidentId, "evidence"],
  });
  const evidenceItems: EvidenceItem[] = Array.isArray(evidenceRaw) ? evidenceRaw : [];

  useEffect(() => {
    if (prePopulated || !evidenceItems.length || script.trim()) return;
    // Priority order: prefer actual script/payload content, then hashes/attachments
    const SCRIPT_TYPES = ["script", "payload", "code", "malware_sample", "raw_payload", "shellcode", "hex_payload", "binary"];
    const HASH_TYPES = ["file_hash", "hash", "sha256", "md5", "sha1", "ioc"];
    const ATTACHMENT_TYPES = ["attachment", "file", "sample"];
    const scriptEvidence =
      evidenceItems.find(e => SCRIPT_TYPES.includes(e.type?.toLowerCase?.() ?? "") && e.value) ??
      evidenceItems.find(e => ATTACHMENT_TYPES.includes(e.type?.toLowerCase?.() ?? "") && e.value) ??
      evidenceItems.find(e => HASH_TYPES.includes(e.type?.toLowerCase?.() ?? "") && e.value);
    if (scriptEvidence?.value) {
      setScript(scriptEvidence.value);
      setPrePopulated(true);
    } else if (incident?.raw_payload) {
      // Fallback: pre-fill from incident raw_payload field
      setScript(incident.raw_payload);
      setPrePopulated(true);
    }
  }, [evidenceItems, incident, prePopulated, script]);

  const analyzeMutation = useMutation<MalwareAnalysisResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/malware/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: script, language, incidentId }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Analysis failed");
      return res.json();
    },
  });

  const result = analyzeMutation.data;
  const lines = script.split("\n");
  const annotationsByLine = result
    ? result.annotations.reduce<Record<number, typeof result.annotations>>((acc, a) => {
        acc[a.line] = [...(acc[a.line] ?? []), a];
        return acc;
      }, {})
    : {};

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScript(ev.target?.result as string ?? "");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const lines = [
      `MALWARE ANALYSIS REPORT — Incident #${incidentId}`,
      `Generated: ${new Date().toISOString()}`,
      `Incident: ${incident?.title ?? "Unknown"}`,
      ``,
      `VERDICT: ${result.verdict.toUpperCase()} | Risk Score: ${result.riskScore}/100 | Confidence: ${result.confidence}%`,
      `Language: ${result.language} | Method: ${result.analysisMethod}`,
      ``,
      `SUMMARY`,
      result.summary,
      ``,
      `LINE ANNOTATIONS (${result.annotations.length})`,
      ...result.annotations.map(a => `  Line ${a.line} [${a.severity}] ${a.description}`),
      ``,
      `EXTRACTED IOCs (${result.iocs.length})`,
      ...result.iocs.map(i => `  [${i.type}] ${i.value} — ${i.context}`),
      ``,
      `MITRE ATT&CK MAPPINGS (${result.mitreMappings.length})`,
      ...result.mitreMappings.map(m => `  ${m.techniqueId} ${m.techniqueName} (${m.tacticName})`),
      ``,
      `EVASION TECHNIQUES (${result.evasionTechniques.length})`,
      ...result.evasionTechniques.map(e => `  [${e.severity}] ${e.name} — ${e.description}`),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `malware-analysis-incident-${incidentId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save analysis to backend as a malware report attached to the incident
  const addToReportMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No analysis result");
      const res = await apiRequest("POST", `/api/incidents/${incidentId}/malware-report`, {
        verdict: result.verdict,
        riskScore: result.riskScore,
        confidence: result.confidence,
        language: result.language,
        analysisMethod: result.analysisMethod,
        summary: result.summary,
        annotations: result.annotations,
        iocs: result.iocs,
        mitreMappings: result.mitreMappings,
        evasionTechniques: result.evasionTechniques,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report saved", description: "Malware analysis report added to this incident." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save report.", variant: "destructive" });
    },
  });

  const verdictCfg = result ? MAL_VERDICT[result.verdict] ?? MAL_VERDICT.suspicious : null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="text-sm border border-[hsl(var(--border))] rounded-md px-3 py-1.5 bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          data-testid="malware-tab-language-select"
        >
          {[["auto","Auto-detect"],["powershell","PowerShell"],["bash","Bash"],["python","Python"],["javascript","JavaScript"],["vbscript","VBScript"],["batch","Batch"]].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))] transition-colors">
          <Upload className="h-3.5 w-3.5" /> Upload
          <input type="file" className="hidden" accept=".ps1,.sh,.py,.js,.vbs,.bat,.txt" onChange={handleFileUpload} />
        </label>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => analyzeMutation.mutate()}
          disabled={!script.trim() || analyzeMutation.isPending}
          data-testid="malware-tab-analyze-button"
        >
          {analyzeMutation.isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analyzing…</> : <><Bug className="h-3.5 w-3.5 mr-1.5" />Analyze</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Code editor */}
        <Card className="border border-[hsl(var(--border))]">
          <CardHeader className="pb-2 border-b border-[hsl(var(--border))]">
            <CardTitle className="text-sm flex items-center gap-2">
              <Code className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
              Script / Payload
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {result && script ? (
              <div className="font-mono text-xs overflow-auto max-h-[50vh]">
                {lines.map((codeLine, idx) => {
                  const lineNum = idx + 1;
                  const anns = annotationsByLine[lineNum] ?? [];
                  const worst = anns[0]?.severity;
                  const isHL = highlightedLine === lineNum;
                  return (
                    <div key={lineNum}>
                      <div
                        className={`flex gap-2 px-3 py-0.5 border-l-2 cursor-pointer transition-colors ${isHL ? "bg-[hsl(var(--accent))/30] border-l-[hsl(var(--primary))]" : anns.some(a => a.severity === "critical" || a.severity === "high") ? "border-l-red-600 hover:bg-red-950/20" : anns.length > 0 ? "border-l-yellow-600 hover:bg-yellow-950/20" : "border-l-transparent hover:bg-[hsl(var(--muted)/30)]"}`}
                        onClick={() => setHighlightedLine(isHL ? null : lineNum)}
                      >
                        <span className="text-[hsl(var(--muted-foreground))] w-6 text-right shrink-0 select-none">{lineNum}</span>
                        <span className={`flex-1 whitespace-pre-wrap break-all ${worst === "critical" ? "text-red-300" : worst === "high" ? "text-orange-300" : "text-[hsl(var(--foreground))]"}`}>{codeLine || " "}</span>
                        {anns.length > 0 && <span className={`text-[9px] px-1 rounded border shrink-0 self-center ${MAL_SEV[worst] ?? ""}`}>{worst?.toUpperCase()}</span>}
                      </div>
                      {isHL && anns.length > 0 && (
                        <div className="mx-8 mb-1 space-y-1">
                          {anns.map((ann, i) => (
                            <div key={i} className={`px-3 py-1.5 rounded border text-xs ${MAL_SEV[ann.severity]}`}>
                              <div className="font-semibold">{ann.category}</div>
                              <div className="opacity-90 mt-0.5">{ann.description}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="Paste suspicious script or payload here…"
                className="font-mono text-xs min-h-[50vh] resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent"
                data-testid="malware-tab-script-textarea"
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-3">
          {result ? (
            <>
              {/* Verdict */}
              <Card className={`border ${result.verdict === "malicious" ? "border-red-800 bg-red-950/20" : result.verdict === "suspicious" ? "border-orange-800 bg-orange-950/20" : "border-green-800 bg-green-950/20"}`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-xl font-bold ${verdictCfg?.color}`}>{verdictCfg?.label}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{result.language} · {result.analysisMethod === "ai" ? "AI-Powered" : "Rule-Based"} · Confidence {result.confidence}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-[hsl(var(--foreground))]">{result.riskScore}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Risk / 100</p>
                    </div>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">{result.summary}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{result.annotations.length} flags</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{result.iocs.length} IOCs</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{result.mitreMappings.length} ATT&CK</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{result.evasionTechniques.length} evasion</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <a
                      href="/malware-analysis"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Full Analysis Page
                    </a>
                    <button
                      onClick={() => addToReportMutation.mutate()}
                      disabled={addToReportMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-50"
                      data-testid="malware-tab-add-to-report"
                    >
                      {addToReportMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <PlusCircle className="h-3 w-3" />}
                      {addToReportMutation.isSuccess ? "Saved!" : "Add to Report"}
                    </button>
                    <button
                      onClick={handleDownloadReport}
                      className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                      data-testid="malware-tab-download-report"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Detail Tabs */}
              <Card className="border border-[hsl(var(--border))]">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full rounded-none border-b border-[hsl(var(--border))] bg-transparent px-3 gap-1 justify-start h-9">
                    <TabsTrigger value="annotations" className="text-xs">Annotations ({result.annotations.length})</TabsTrigger>
                    <TabsTrigger value="iocs" className="text-xs">IOCs ({result.iocs.length})</TabsTrigger>
                    <TabsTrigger value="mitre" className="text-xs">ATT&CK ({result.mitreMappings.length})</TabsTrigger>
                    <TabsTrigger value="evasion" className="text-xs">Evasion ({result.evasionTechniques.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="annotations" className="p-0 max-h-[36vh] overflow-auto">
                    {result.annotations.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] p-3">None found.</p>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {result.annotations.map((ann, i) => (
                          <div key={i} className="px-3 py-2 cursor-pointer hover:bg-[hsl(var(--muted)/20)]" onClick={() => setHighlightedLine(ann.line === highlightedLine ? null : ann.line)}>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] px-1 rounded border ${MAL_SEV[ann.severity]}`}>{ann.severity.toUpperCase()}</span>
                              <span className="text-xs font-medium">{ann.category}</span>
                              <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">L{ann.line}</span>
                            </div>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{ann.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="iocs" className="p-0 max-h-[36vh] overflow-auto">
                    {result.iocs.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] p-3">None found.</p>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {result.iocs.map((ioc, i) => (
                          <div key={i} className="px-3 py-2 flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <code className="text-xs font-mono text-[hsl(var(--foreground))] break-all">{ioc.value}</code>
                                <span className={`text-[9px] px-1 rounded border ${MAL_SEV[ioc.severity]}`}>{ioc.severity}</span>
                                <span className="text-[9px] px-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{ioc.type}</span>
                              </div>
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">{ioc.context}</p>
                            </div>
                            <button onClick={() => navigator.clipboard.writeText(ioc.value)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mt-0.5">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="mitre" className="p-0 max-h-[36vh] overflow-auto">
                    {result.mitreMappings.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] p-3">None found.</p>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {result.mitreMappings.map((m, i) => (
                          <div key={i} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold">{m.techniqueName}</p>
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">{m.tacticName}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[9px] px-1 rounded border border-[hsl(var(--border))] font-mono">{m.techniqueId}</span>
                                <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{m.confidence}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="evasion" className="p-0 max-h-[36vh] overflow-auto">
                    {result.evasionTechniques.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] p-3">None found.</p>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {result.evasionTechniques.map((t, i) => (
                          <div key={i} className="px-3 py-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Zap className={`h-3 w-3 ${MAL_SEV[t.severity]?.split(" ")[0]}`} />
                              <span className="text-xs font-semibold">{t.name}</span>
                              <span className={`ml-auto text-[9px] px-1 rounded border ${MAL_SEV[t.severity]}`}>{t.severity}</span>
                            </div>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{t.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </Card>
            </>
          ) : analyzeMutation.isPending ? (
            <Card className="border border-[hsl(var(--border))]">
              <CardContent className="pt-4 space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-dashed border-[hsl(var(--border))]">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-[hsl(var(--muted-foreground))]">
                <Bug className="h-10 w-10 opacity-30" />
                <div className="text-center">
                  <p className="text-sm font-medium">AI Malware Analyzer</p>
                  <p className="text-xs mt-1">Paste a suspicious script and click Analyze to get line-by-line annotations, IOC extraction, and MITRE ATT&CK mapping.</p>
                  {!isMSS && <p className="text-xs mt-2 text-yellow-500">View-only mode — analysis available to MSS analysts.</p>}
                </div>
                <a href="/malware-analysis" target="_blank" className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline mt-1">
                  <ExternalLink className="h-3 w-3" />Open Full Analysis Page
                </a>
              </CardContent>
            </Card>
          )}
          {analyzeMutation.isError && (
            <p className="text-xs text-red-400 mt-1">{analyzeMutation.error?.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Historical Context Tab (Task #162) ───────────────────────────────────────
function HistoricalContextTab({ incident, incidentId }: { incident: any; incidentId: number }) {
  const [, navigate] = useLocation();
  const [results, setResults] = useState<any[]>([]);
  const [hotRows, setHotRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pollingQueryId, setPollingQueryId] = useState<string | null>(null);
  const [coldStatus, setColdStatus] = useState<string>("RUNNING");
  const { currentTenant } = useTenant();
  const { toast } = useToast();

  const iocList: string[] = [];
  if (incident?.source_ip) iocList.push(incident.source_ip);
  if (incident?.destination_ip) iocList.push(incident.destination_ip);
  if (incident?.ioc_data && Array.isArray(incident.ioc_data)) {
    incident.ioc_data.slice(0, 5).forEach((ioc: any) => {
      if (ioc?.value) iocList.push(ioc.value);
    });
  }

  const searchQuery = iocList.slice(0, 3).join(" OR ") || incident?.title || "";
  // Full-archive query params — no date restriction so cold-tier scans the entire archive
  const incidentQueryParams = {
    search: searchQuery,
    entityFilter: incident?.source_ip || incident?.destination_ip || "",
    severity: incident?.severity ? [incident.severity] : [],
    sourceMode: "both",
    // Intentionally omit startDate/endDate to query full archive
  };

  // Poll cold-tier when queryId is returned from the initial query
  useEffect(() => {
    if (!pollingQueryId || !currentTenant?.id) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const statusRes = await fetch(`/api/log-investigation/query/status/${pollingQueryId}`, { credentials: "include" });
        if (!statusRes.ok) return;
        const status = await statusRes.json();
        if (cancelled) return;
        setColdStatus(status.status);
        if (status.status === "SUCCEEDED" && status.result) {
          // Merge cold-tier rows with hot-tier rows captured from initial response
          const coldRows: any[] = status.result.rows ?? [];
          const seenIds = new Set<number>();
          const merged: any[] = [];
          for (const row of [...hotRows, ...coldRows]) {
            if (!seenIds.has(row.id)) {
              seenIds.add(row.id);
              merged.push(row);
            }
          }
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setResults(merged.slice(0, 20));
          setPollingQueryId(null);
          setIsLoading(false);
        } else if (status.status === "FAILED") {
          setPollingQueryId(null);
          setIsLoading(false);
          toast({ title: "Cold-tier query failed", description: "Historical archive query returned no data", variant: "destructive" });
        } else {
          timeoutId = setTimeout(poll, 5000);
        }
      } catch {
        if (!cancelled) timeoutId = setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [pollingQueryId, currentTenant?.id]);

  const runHistoricalQuery = async () => {
    if (!currentTenant?.id) return;
    setIsLoading(true);
    setHasQueried(true);
    setPollingQueryId(null);
    setHotRows([]);
    setResults([]);
    setColdStatus("RUNNING");
    try {
      const sessionRes = await fetch("/api/log-investigation/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: currentTenant.id,
          name: `Historical Context: ${incident?.title || `INC-${incidentId}`}`,
          description: `Auto-generated from War Room for incident ${incidentId}. IOCs: ${iocList.slice(0, 5).join(", ")}`,
          sourceMode: "both",
          queryParams: incidentQueryParams,
        }),
      });
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setSessionId(session.id);
      }
      const queryRes = await fetch("/api/log-investigation/query", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: currentTenant.id,
          ...incidentQueryParams,
          pageSize: 20,
          page: 1,
        }),
      });
      if (queryRes.ok) {
        const data = await queryRes.json();
        const initialRows: any[] = (data.rows ?? []).slice(0, 20);
        if (data.queryId) {
          // Cold-tier async: save hot rows and start polling
          setHotRows(initialRows);
          setResults(initialRows); // show hot rows immediately while cold runs
          setPollingQueryId(data.queryId);
          // isLoading stays true until polling completes
        } else {
          setResults(initialRows.slice(0, 20));
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
      setIsLoading(false);
    }
  };

  const openInConsole = () => navigate(sessionId ? `/log-investigation?session=${sessionId}` : `/log-investigation`);

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Historical Archive Context</p>
              <p className="text-xs text-muted-foreground">Query both hot and cold log tiers for IOCs and entities extracted from this incident</p>
              {iocList.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {iocList.map((ioc, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-mono">{ioc}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={runHistoricalQuery} disabled={isLoading} data-testid="button-historical-query">
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search Archives
              </Button>
              {hasQueried && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInConsole} data-testid="button-open-in-console">
                  <ExternalLink className="w-3.5 h-3.5" />Open in Console
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {isLoading && results.length === 0 && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}
      {pollingQueryId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1" data-testid="status-cold-polling">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
          <span>Fetching cold archive… status: <span className="font-mono">{coldStatus}</span> — hot-tier results shown below, updating when archive returns</span>
        </div>
      )}
      {hasQueried && !isLoading && !pollingQueryId && results.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileSearch className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No historical log events found matching incident IOCs</p>
          </CardContent>
        </Card>
      )}
      {results.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="px-4 py-2.5 border-b border-border/50">
            <CardTitle className="text-sm">
              {pollingQueryId ? `${results.length} hot-tier events (cold archive loading…)` : `Top ${results.length} Correlated Historical Events`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Timestamp</TableHead>
                  <TableHead className="text-[11px]">Source</TableHead>
                  <TableHead className="text-[11px]">Event Type</TableHead>
                  <TableHead className="text-[11px]">Severity</TableHead>
                  <TableHead className="text-[11px]">MITRE Tactic</TableHead>
                  <TableHead className="text-[11px]">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row: any, i: number) => (
                  <TableRow key={row.id ?? i} data-testid={`row-historical-${row.id ?? i}`}>
                    <TableCell className="text-[11px] font-mono whitespace-nowrap">{new Date(row.timestamp).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{row.source || "—"}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{row.event_type?.replace(/_/g, " ") || "—"}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{row.severity || "—"}</Badge></TableCell>
                    <TableCell className="text-[11px]">{row.mitre_tactic || "—"}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate">{row.description || row.raw_log?.substring(0, 60) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {hasQueried && !isLoading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={openInConsole} data-testid="button-view-full-investigation">
            <ExternalLink className="w-3.5 h-3.5" />
            View Full Investigation in Log Console
            {sessionId && <Badge variant="outline" className="text-[9px] ml-1">Session pre-loaded</Badge>}
          </Button>
        </div>
      )}
    </div>
  );
}
