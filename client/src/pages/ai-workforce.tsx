import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bot, Shield, Search, MessageSquare, ShieldCheck, Zap,
  Activity, Clock, Target, Brain, TrendingUp, CheckCircle2,
  XCircle, AlertTriangle, RefreshCw, Loader2, Rocket,
  ThumbsUp, ThumbsDown, Eye, ChevronRight, Users, BarChart3,
  Percent, Timer, UserCheck, FileText, Calendar, ChevronLeft, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const AGENT_ICONS: Record<string, any> = {
  soc_analyst: Shield,
  threat_hunter: Search,
  customer_support: MessageSquare,
  compliance_analyst: ShieldCheck,
  incident_responder: Zap,
};

const AGENT_COLORS: Record<string, string> = {
  soc_analyst: "#3b82f6",
  threat_hunter: "#ef4444",
  customer_support: "#22c55e",
  compliance_analyst: "#a855f7",
  incident_responder: "#f59e0b",
};

const ACTIVITY_LABELS: Record<string, string> = {
  ticket_response: "Ticket Response",
  threat_hunt: "Threat Hunt",
  incident_investigation: "Investigation",
  incident_response: "Incident Response",
  client_notification: "Client Notification",
  compliance_insight: "Compliance Insight",
  proactive_insight: "Intelligence Brief",
  daily_summary: "Daily Summary",
};

const SOD_DOMAINS: Record<string, { label: string; description: string; escalatesTo: string | null; schedule: string }> = {
  soc_analyst: { label: "L1 Triage & Investigation", description: "Alert triage, TP/FP classification, MITRE mapping", escalatesTo: "SENTINEL / VANGUARD", schedule: "24×7" },
  threat_hunter: { label: "Threat Hunting", description: "Proactive threat hunting, IOC discovery", escalatesTo: "VANGUARD", schedule: "24×7" },
  incident_responder: { label: "Incident Response", description: "Containment, remediation, response plans", escalatesTo: "NEXUS", schedule: "24×7" },
  compliance_analyst: { label: "Compliance & Posture", description: "Compliance assessment, framework mapping, SLA adherence", escalatesTo: null, schedule: "Business Hours" },
  customer_support: { label: "Client Communications", description: "Client notifications, ticket resolution", escalatesTo: "Human SOC", schedule: "Business Hours" },
};

const PIPELINE_STAGES = [
  { key: "soc_analyst", name: "ARIA", role: "Triage" },
  { key: "threat_hunter", name: "SENTINEL", role: "Hunt" },
  { key: "incident_responder", name: "VANGUARD", role: "Respond" },
  { key: "compliance_analyst", name: "GUARDIAN", role: "Comply" },
  { key: "customer_support", name: "NEXUS", role: "Notify" },
];

const CHART_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#a855f7", "#06b6d4"];

function formatTimeAgo(date: string | null): string {
  if (!date) return "Never";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AIWorkforcePage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;
  const [activeTab, setActiveTab] = useState("overview");
  const dashboardRef = useDashboardExportRef();

  const { data: agents = [], isLoading: agentsLoading } = useQuery<any[]>({
    queryKey: ["/api/ai-agents", tenantId],
    queryFn: () => fetch(`/api/ai-agents/${tenantId}`).then(r => r.json()),
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const { data: performance, isLoading: perfLoading } = useQuery<any>({
    queryKey: ["/api/ai-agents", tenantId, "performance"],
    queryFn: () => fetch(`/api/ai-agents/${tenantId}/performance`).then(r => r.json()),
    enabled: !!tenantId && agents.length > 0,
    refetchInterval: 30000,
  });

  const { data: activityData } = useQuery<any>({
    queryKey: ["/api/ai-agents", tenantId, "activity"],
    queryFn: () => fetch(`/api/ai-agents/${tenantId}/activity?pageSize=50`).then(r => r.json()),
    enabled: !!tenantId && agents.length > 0,
    refetchInterval: 15000,
  });

  const provisionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ai-agents/provision/${tenantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "AI Workforce Deployed", description: "5 AI agents have been provisioned and are now active." });
    },
    onError: (err: any) => toast({ title: "Deployment Failed", description: err.message, variant: "destructive" }),
  });

  const triggerMutation = useMutation({
    mutationFn: ({ agentId, action, targetId }: { agentId: number; action: string; targetId?: number }) =>
      apiRequest("POST", `/api/ai-agents/${agentId}/trigger`, { action, targetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Action Triggered", description: "AI agent task initiated successfully." });
    },
    onError: (err: any) => toast({ title: "Action Failed", description: err.message, variant: "destructive" }),
  });

  const { data: dailySummaries = [], isLoading: summariesLoading } = useQuery<any[]>({
    queryKey: ["/api/ai-workforce", tenantId, "daily-summaries"],
    queryFn: () => fetch(`/api/ai-workforce/${tenantId}/daily-summaries`).then(r => r.json()),
    enabled: !!tenantId && agents.length > 0,
    refetchInterval: 60000,
  });

  const generateSummaryMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ai-workforce/${tenantId}/daily-summary`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-workforce", tenantId, "daily-summaries"] });
      toast({ title: "Daily Summary Generated", description: "ARIA has produced a new daily SOC summary report." });
    },
    onError: (err: any) => toast({ title: "Generation Failed", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ activityId, approved, feedback }: { activityId: number; approved: boolean; feedback?: string }) =>
      apiRequest("POST", `/api/ai-agents/activity/${activityId}/review`, { approved, feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] });
      toast({ title: "Review Submitted" });
    },
  });

  const totalStats = performance?.totalStats || {};
  const activities = activityData?.data || [];

  if (!tenantId) {
    return (
      <div className="p-6 flex items-center justify-center h-[60vh]" data-testid="ai-workforce-no-tenant">
        <p className="text-muted-foreground">Select a tenant to view AI Workforce</p>
      </div>
    );
  }

  if (agentsLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-[60vh]" data-testid="ai-workforce-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-[60vh]" data-testid="ai-workforce-empty">
        <Card className="max-w-lg text-center">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Deploy AI Workforce</h2>
              <p className="text-muted-foreground">
                Activate 5 autonomous AI agents that work 24/7 alongside your human analysts.
                They'll auto-respond to tickets, hunt threats, investigate incidents, and generate intelligence reports.
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {["ARIA", "SENTINEL", "NEXUS", "GUARDIAN", "VANGUARD"].map((name, i) => {
                const specs = ["soc_analyst", "threat_hunter", "customer_support", "compliance_analyst", "incident_responder"];
                const Icon = AGENT_ICONS[specs[i]];
                return (
                  <div key={name} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: AGENT_COLORS[specs[i]] + "20" }}>
                      <Icon className="w-4 h-4" style={{ color: AGENT_COLORS[specs[i]] }} />
                    </div>
                    <span className="font-medium">{name}</span>
                  </div>
                );
              })}
            </div>
            <Button
              size="lg"
              onClick={() => provisionMutation.mutate()}
              disabled={provisionMutation.isPending}
              data-testid="button-deploy-ai-workforce"
            >
              {provisionMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              Deploy AI Workforce
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="ai-workforce-page" ref={dashboardRef}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            AI Workforce Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agents.length} autonomous AI agents operating 24/7
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardExportBar dashboardTitle="AI Workforce Command Center" containerRef={dashboardRef} />
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ai-agents"] })} data-testid="button-refresh-workforce">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Bot} label="Active Agents" value={agents.filter((a: any) => a.isActive).length} color="text-blue-500" testId="stat-active-agents" />
        <StatCard icon={MessageSquare} label="Tickets Resolved" value={totalStats.ticketsResolved || 0} color="text-green-500" testId="stat-tickets-resolved" />
        <StatCard icon={Search} label="Threats Detected" value={totalStats.threatsFound || 0} color="text-red-500" testId="stat-threats-detected" />
        <StatCard icon={Shield} label="Investigations" value={totalStats.incidentsInvestigated || 0} color="text-purple-500" testId="stat-investigations" />
        <StatCard icon={Brain} label="Intel Reports" value={totalStats.insightsGenerated || 0} color="text-amber-500" testId="stat-intel-reports" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Agent Overview</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity Feed</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
          <TabsTrigger value="effectiveness" data-testid="tab-effectiveness">Effectiveness</TabsTrigger>
          <TabsTrigger value="daily-summary" data-testid="tab-daily-summary">Daily Summary</TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review">Human Review</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <SOCPipeline agents={agents} activities={activities} />
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent: any) => (
              <AgentCard key={agent.id} agent={agent} onTrigger={(action: string) => triggerMutation.mutate({ agentId: agent.id, action })} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityFeed activities={activities} />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <PerformanceView performance={performance} agents={agents} />
        </TabsContent>

        <TabsContent value="effectiveness" className="mt-4">
          <EffectivenessView tenantId={tenantId} agents={agents} />
        </TabsContent>

        <TabsContent value="daily-summary" className="mt-4">
          <DailySummaryView
            summaries={dailySummaries}
            isLoading={summariesLoading}
            onGenerate={() => generateSummaryMutation.mutate()}
            isGenerating={generateSummaryMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <ReviewQueue activities={activities.filter((a: any) => !a.humanReviewed)} onReview={(id: number, approved: boolean, feedback?: string) => reviewMutation.mutate({ activityId: id, approved, feedback })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, testId }: { icon: any; label: string; value: number | string; color: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent, onTrigger }: { agent: any; onTrigger: (action: string) => void }) {
  const Icon = AGENT_ICONS[agent.specialization] || Bot;
  const color = AGENT_COLORS[agent.specialization] || "#666";
  const stats = agent.stats || {};
  const isProcessing = agent.status === "processing";

  const actionMap: Record<string, string> = {
    soc_analyst: "investigate",
    threat_hunter: "hunt",
    customer_support: "respond",
    compliance_analyst: "insight",
    incident_responder: "respond",
  };

  const actionLabels: Record<string, string> = {
    soc_analyst: "Investigate",
    threat_hunter: "Hunt Threats",
    customer_support: "Respond to Tickets",
    compliance_analyst: "Assess Compliance",
    incident_responder: "Respond to Incident",
  };

  const sodDomain = SOD_DOMAINS[agent.specialization];

  return (
    <Card className="relative overflow-hidden" data-testid={`agent-card-${agent.name}`}>
      {isProcessing && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center relative" style={{ backgroundColor: color + "20" }}>
              <Icon className="w-5 h-5" style={{ color }} />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${agent.isActive ? "bg-green-500" : "bg-gray-400"}`} />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{agent.role}</p>
            </div>
          </div>
          <Badge variant={isProcessing ? "default" : agent.isActive ? "secondary" : "outline"} className="text-xs" data-testid={`status-${agent.name}`}>
            {isProcessing ? "Processing" : agent.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sodDomain && (
          <div className="rounded-lg border p-2.5 space-y-1.5" data-testid={`sod-domain-${agent.name}`}>
            <div className="flex items-center justify-between">
              <Badge className="text-xs font-semibold" style={{ backgroundColor: color + "20", color, border: `1px solid ${color}40` }}>
                {sodDomain.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-medium">{sodDomain.schedule}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{sodDomain.description}</p>
            {sodDomain.escalatesTo && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ChevronRight className="w-3 h-3" />
                <span>Escalates to <span className="font-semibold text-foreground">{sodDomain.escalatesTo}</span></span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="font-bold text-lg">{agent.actionsToday}</p>
            <p className="text-muted-foreground">Actions Today</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="font-bold text-lg">{stats.totalActions || 0}</p>
            <p className="text-muted-foreground">Total Actions</p>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          {agent.specialization === "customer_support" && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Tickets Resolved</span><span className="font-medium">{stats.ticketsResolved || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Notifications Sent</span><span className="font-medium">{stats.clientNotificationsSent || 0}</span></div>
            </>
          )}
          {agent.specialization === "threat_hunter" && (
            <div className="flex justify-between"><span className="text-muted-foreground">Threats Found</span><span className="font-medium">{stats.threatsFound || 0}</span></div>
          )}
          {agent.specialization === "soc_analyst" && (
            <div className="flex justify-between"><span className="text-muted-foreground">Incidents Triaged</span><span className="font-medium">{stats.incidentsInvestigated || 0}</span></div>
          )}
          {agent.specialization === "incident_responder" && (
            <div className="flex justify-between"><span className="text-muted-foreground">Incidents Responded</span><span className="font-medium">{stats.incidentsResponded || 0}</span></div>
          )}
          {agent.specialization === "compliance_analyst" && (
            <div className="flex justify-between"><span className="text-muted-foreground">Compliance Insights</span><span className="font-medium">{stats.insightsGenerated || 0}</span></div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Active</span>
            <span className="font-medium">{formatTimeAgo(stats.lastActiveAt || agent.lastActionAt)}</span>
          </div>
        </div>

        {agent.lastActionType && (
          <div className="text-xs bg-muted/30 rounded px-2 py-1.5 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Last:</span>
            <span>{ACTIVITY_LABELS[agent.lastActionType] || agent.lastActionType}</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onTrigger(actionMap[agent.specialization] || "insight")}
          data-testid={`trigger-${agent.name}`}
        >
          <Zap className="w-3 h-3 mr-1" /> {actionLabels[agent.specialization] || "Trigger Action"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SOCPipeline({ agents, activities }: { agents: any[]; activities: any[] }) {
  const agentMap = new Map(agents.map((a: any) => [a.specialization, a]));
  const activityCounts: Record<string, number> = {};
  for (const a of activities) {
    const spec = a.agentSpecialization;
    activityCounts[spec] = (activityCounts[spec] || 0) + 1;
  }

  return (
    <Card data-testid="soc-pipeline">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Autonomous SOC Pipeline — Separation of Duties
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Each agent operates in its exclusive domain. Incidents cascade through the pipeline automatically.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          <div className="flex-shrink-0 flex flex-col items-center gap-1 px-2">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">Event</span>
          </div>
          {PIPELINE_STAGES.map((stage, idx) => {
            const agent = agentMap.get(stage.key);
            const color = AGENT_COLORS[stage.key] || "#666";
            const AgentIcon = AGENT_ICONS[stage.key] || Bot;
            const isActive = agent?.isActive;
            const isProcessing = agent?.status === "processing";
            const count = activityCounts[stage.key] || 0;
            return (
              <div key={stage.key} className="flex items-center gap-0" data-testid={`pipeline-stage-${stage.name}`}>
                <div className="flex-shrink-0 flex items-center">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1 px-2 min-w-[72px]">
                  <div className="relative">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isProcessing ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                      style={{ backgroundColor: color + "20" }}
                    >
                      <AgentIcon className="w-5 h-5" style={{ color }} />
                    </div>
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
                    )}
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color }}>{stage.name}</span>
                  <span className="text-[10px] text-muted-foreground">{stage.role}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{count}</Badge>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-0">
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
            <div className="flex-shrink-0 flex flex-col items-center gap-1 px-2">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">Human SOC</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ activities }: { activities: any[] }) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No activity yet. AI agents will start operating autonomously.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5" /> Live Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="space-y-3">
            {activities.map((activity: any) => {
              const color = AGENT_COLORS[activity.agentSpecialization] || "#666";
              const Icon = AGENT_ICONS[activity.agentSpecialization] || Bot;
              return (
                <div key={activity.id} className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`activity-${activity.id}`}>
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{activity.agentName}</span>
                      <Badge variant="outline" className="text-xs">{ACTIVITY_LABELS[activity.activityType] || activity.activityType}</Badge>
                      {activity.confidence > 0 && (
                        <Badge variant={activity.confidence >= 80 ? "default" : activity.confidence >= 60 ? "secondary" : "destructive"} className="text-xs">
                          {activity.confidence}% confidence
                        </Badge>
                      )}
                      {activity.humanReviewed && (
                        <Badge variant={activity.humanOverride ? "destructive" : "default"} className="text-xs">
                          {activity.humanOverride ? "Overridden" : "Approved"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">{activity.summary}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeAgo(activity.createdAt)}</span>
                      {activity.duration > 0 && <span>{formatDuration(activity.duration)}</span>}
                      {activity.targetId && <span>{activity.targetType} #{activity.targetId}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function PerformanceView({ performance, agents }: { performance: any; agents: any[] }) {
  if (!performance) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Performance data loading...</p>
        </CardContent>
      </Card>
    );
  }

  const typeData = (performance.typeBreakdown || []).map((t: any) => ({
    name: ACTIVITY_LABELS[t.activity_type] || t.activity_type,
    count: t.count,
    avgConfidence: t.avg_confidence,
    reviewed: t.reviewed,
    overridden: t.overridden,
  }));

  const dailyData = performance.activityByDay || [];
  const dayMap = new Map<string, any>();
  for (const d of dailyData) {
    const day = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!dayMap.has(day)) dayMap.set(day, { day });
    dayMap.get(day)[d.activity_type] = d.count;
  }
  const chartData = Array.from(dayMap.values());

  const agentPerf = agents.map((a: any) => ({
    name: a.name,
    actions: a.stats?.totalActions || 0,
    fill: AGENT_COLORS[a.specialization] || "#666",
  }));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Activity Over Time</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="incident_investigation" name="Triage (ARIA)" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} stackId="1" />
                <Area type="monotone" dataKey="threat_hunt" name="Hunt (SENTINEL)" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} stackId="1" />
                <Area type="monotone" dataKey="incident_response" name="Response (VANGUARD)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} stackId="1" />
                <Area type="monotone" dataKey="compliance_insight" name="Compliance (GUARDIAN)" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} stackId="1" />
                <Area type="monotone" dataKey="ticket_response" name="Tickets (NEXUS)" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} stackId="1" />
                <Area type="monotone" dataKey="client_notification" name="Notifications (NEXUS)" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Actions by Type</CardTitle></CardHeader>
        <CardContent>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" name="Actions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reviewed" name="Reviewed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Agent Workload Distribution</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={agentPerf} dataKey="actions" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {agentPerf.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {(performance.recentActivity || []).map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                  <Badge variant="outline" className="text-xs whitespace-nowrap">{a.agentName}</Badge>
                  <span className="truncate flex-1">{a.summary}</span>
                  {a.confidence > 0 && <span className="text-xs text-muted-foreground">{a.confidence}%</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function EffectivenessView({ tenantId, agents }: { tenantId: number; agents: any[] }) {
  const [timeRange, setTimeRange] = useState("all");

  const { data: effectiveness, isLoading } = useQuery<any>({
    queryKey: ["/api/ai-workforce", tenantId, "effectiveness", timeRange],
    queryFn: () => fetch(`/api/ai-workforce/${tenantId}/effectiveness?range=${timeRange}`).then(r => r.json()),
    enabled: !!tenantId && agents.length > 0,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading effectiveness metrics...</p>
        </CardContent>
      </Card>
    );
  }

  const agentData = effectiveness?.agents || [];
  const trendData = (effectiveness?.trend || []).map((t: any) => ({
    ...t,
    day: new Date(t.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
  const agentNames: string[] = effectiveness?.agentNames || [];

  const totalActions = agentData.reduce((s: number, a: any) => s + a.totalActions, 0);
  const avgSuccessRate = agentData.length > 0
    ? Math.round(agentData.reduce((s: number, a: any) => s + a.successRate, 0) / agentData.length)
    : 0;
  const avgConfidence = agentData.length > 0
    ? Math.round(agentData.reduce((s: number, a: any) => s + a.avgConfidence, 0) / agentData.length)
    : 0;
  const avgOverrideRate = agentData.length > 0
    ? Math.round(agentData.reduce((s: number, a: any) => s + a.overrideRate, 0) / agentData.length)
    : 0;

  const pieData = agentData.flatMap((a: any) =>
    Object.entries(a.typeBreakdown || {}).map(([type, count]) => ({
      name: ACTIVITY_LABELS[type] || type,
      value: count as number,
    }))
  );
  const aggregatedPie = Object.values(
    pieData.reduce((acc: Record<string, { name: string; value: number }>, item: any) => {
      acc[item.name] = acc[item.name] || { name: item.name, value: 0 };
      acc[item.name].value += item.value;
      return acc;
    }, {} as Record<string, { name: string; value: number }>)
  );

  return (
    <div className="space-y-4" data-testid="effectiveness-view">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Agent Effectiveness Metrics
        </h3>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[160px]" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="eff-stat-total">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-blue-500"><Activity className="w-4 h-4" /></div>
            <div><p className="text-2xl font-bold">{totalActions}</p><p className="text-xs text-muted-foreground">Total Actions</p></div>
          </CardContent>
        </Card>
        <Card data-testid="eff-stat-success">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-green-500"><Percent className="w-4 h-4" /></div>
            <div><p className="text-2xl font-bold">{avgSuccessRate}%</p><p className="text-xs text-muted-foreground">Avg Success Rate</p></div>
          </CardContent>
        </Card>
        <Card data-testid="eff-stat-confidence">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-purple-500"><Target className="w-4 h-4" /></div>
            <div><p className="text-2xl font-bold">{avgConfidence}%</p><p className="text-xs text-muted-foreground">Avg Confidence</p></div>
          </CardContent>
        </Card>
        <Card data-testid="eff-stat-override">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-amber-500"><UserCheck className="w-4 h-4" /></div>
            <div><p className="text-2xl font-bold">{avgOverrideRate}%</p><p className="text-xs text-muted-foreground">Override Rate</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Effectiveness Trend (30d)</CardTitle></CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis domain={[0, 100]} className="text-xs" />
                  <Tooltip />
                  <Legend />
                  {agentNames.map((name: string, i: number) => (
                    <Line key={name} type="monotone" dataKey={`${name}_confidence`} name={`${name} Confidence`} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No trend data available yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Actions by Type</CardTitle></CardHeader>
          <CardContent>
            {aggregatedPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={aggregatedPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {aggregatedPie.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No data available yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Agent Comparison</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="agent-comparison-table">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Agent</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">SOD Domain</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Total</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Today</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Success Rate</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Avg Confidence</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Avg Duration</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Reviewed</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground text-right">Override Rate</th>
                </tr>
              </thead>
              <tbody>
                {agentData.map((agent: any) => {
                  const Icon = AGENT_ICONS[agent.specialization] || Bot;
                  const color = AGENT_COLORS[agent.specialization] || "#666";
                  return (
                    <tr key={agent.agentId} className="border-b last:border-0" data-testid={`eff-row-${agent.name}`}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                            <Icon className="w-3.5 h-3.5" style={{ color }} />
                          </div>
                          <div>
                            <p className="font-medium">{agent.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{(agent.specialization || "").replace(/_/g, " ")}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap" style={{ borderColor: color + "60", color }}>
                          {SOD_DOMAINS[agent.specialization]?.label || "—"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-medium">{agent.totalActions}</td>
                      <td className="py-3 px-3 text-right">{agent.actionsToday}</td>
                      <td className="py-3 px-3 text-right">
                        <Badge variant={agent.successRate >= 80 ? "default" : agent.successRate >= 60 ? "secondary" : "destructive"} className="text-xs">
                          {agent.successRate}%
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">{agent.avgConfidence}%</td>
                      <td className="py-3 px-3 text-right">{formatDuration(agent.avgDuration)}</td>
                      <td className="py-3 px-3 text-right">{agent.reviewedCount}</td>
                      <td className="py-3 px-3 text-right">
                        <Badge variant={agent.overrideRate <= 10 ? "default" : agent.overrideRate <= 25 ? "secondary" : "destructive"} className="text-xs">
                          {agent.overrideRate}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {agentData.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">No agent data available yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DailySummaryView({ summaries, isLoading, onGenerate, isGenerating }: {
  summaries: any[];
  isLoading: boolean;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, Math.max(0, summaries.length - 1));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading daily summaries...</p>
        </CardContent>
      </Card>
    );
  }

  const selected = summaries.length > 0 ? summaries[safeIdx] : null;
  const report = (typeof selected?.details === "string" ? JSON.parse(selected.details) : selected?.details)?.report || selected?.report || {};

  const RISK_COLORS: Record<string, string> = {
    low: "text-green-600 dark:text-green-400",
    moderate: "text-yellow-600 dark:text-yellow-400",
    elevated: "text-orange-600 dark:text-orange-400",
    high: "text-red-600 dark:text-red-400",
    critical: "text-red-700 dark:text-red-300",
  };

  const TREND_ICONS: Record<string, string> = {
    improving: "text-green-600 dark:text-green-400",
    stable: "text-yellow-600 dark:text-yellow-400",
    degrading: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="space-y-4" data-testid="daily-summary-view">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Daily SOC Summary Reports</h3>
          {summaries.length > 0 && (
            <Badge variant="secondary" className="text-xs">{summaries.length} report{summaries.length !== 1 ? "s" : ""}</Badge>
          )}
        </div>
        <Button
          onClick={onGenerate}
          disabled={isGenerating}
          data-testid="button-generate-summary"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {isGenerating ? "Generating..." : "Generate Now"}
        </Button>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-lg font-semibold mb-1">No Daily Summaries Yet</h3>
              <p className="text-muted-foreground text-sm">
                ARIA will automatically generate a daily SOC summary every 24 hours.
                You can also generate one manually using the button above.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-[280px_1fr] gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Report History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-1">
                  {summaries.map((s: any, idx: number) => {
                    const date = new Date(s.createdAt);
                    const isSelected = idx === safeIdx;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedIdx(idx)}
                        className={`w-full text-left p-2 rounded-md text-sm transition-colors ${isSelected ? "bg-primary/10 border border-primary/20" : "hover-elevate"}`}
                        data-testid={`summary-item-${s.id}`}
                      >
                        <div className="font-medium">
                          {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} by {s.agentName}
                        </div>
                        {s.report?.securityPosture?.overallRisk && (
                          <Badge variant="outline" className={`text-xs mt-1 ${RISK_COLORS[s.report.securityPosture.overallRisk] || ""}`}>
                            {s.report.securityPosture.overallRisk} risk
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Daily SOC Summary
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected ? new Date(selected.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
                    {selected ? " at " + new Date(selected.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={safeIdx >= summaries.length - 1}
                    onClick={() => setSelectedIdx(prev => Math.min(prev + 1, summaries.length - 1))}
                    data-testid="button-prev-summary"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={safeIdx <= 0}
                    onClick={() => setSelectedIdx(prev => Math.max(prev - 1, 0))}
                    data-testid="button-next-summary"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div>
                  {/* Cinematic header strip */}
                  <div className="relative px-5 py-4 overflow-hidden border-b border-border"
                    style={{ background: "linear-gradient(135deg, hsl(222 47% 11%) 0%, hsl(230 40% 8%) 100%)" }}>
                    <div className="absolute inset-0 opacity-[0.03]"
                      style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 20px,rgba(255,255,255,1) 20px,rgba(255,255,255,1) 21px),repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(255,255,255,1) 20px,rgba(255,255,255,1) 21px)" }}
                    />
                    <div className="relative flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="w-4 h-4 text-blue-400" />
                          <span className="text-xs font-bold text-white tracking-wider uppercase">Daily SOC Summary</span>
                        </div>
                        <p className="text-[11px] text-white/50">
                          {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Today"}
                          <span className="mx-2 opacity-40">·</span>
                          <span className="opacity-60">Generated by {report.generatedBy || "ARIA AI"}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {report.securityPosture?.overallRisk && (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            report.securityPosture.overallRisk === "critical" ? "bg-red-500/20 text-red-400 border-red-500/40" :
                            report.securityPosture.overallRisk === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/40" :
                            report.securityPosture.overallRisk === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" :
                            "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          }`}>
                            {report.securityPosture.overallRisk} risk
                          </span>
                        )}
                        <span className="text-[10px] text-white/30 tabular-nums">
                          {selected.confidence}% confidence
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0 divide-y divide-border">
                    {/* Executive Summary — highlighted callout */}
                    {report.executiveSummary && (
                      <section className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-0.5 h-4 rounded-full bg-blue-500" />
                          <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Executive Summary</span>
                        </div>
                        <div className="px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <p className="text-sm leading-relaxed text-foreground">{report.executiveSummary}</p>
                        </div>
                      </section>
                    )}

                    {/* Security Posture — KPI tiles */}
                    {report.securityPosture && (
                      <section className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-0.5 h-4 rounded-full bg-violet-500" />
                          <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Security Posture</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            {
                              label: "Overall Risk",
                              value: report.securityPosture.overallRisk || "N/A",
                              color: report.securityPosture.overallRisk === "critical" ? "#ef4444" :
                                     report.securityPosture.overallRisk === "high" ? "#f97316" :
                                     report.securityPosture.overallRisk === "medium" ? "#eab308" : "#22c55e",
                              borderColor: report.securityPosture.overallRisk === "critical" ? "border-red-500/40" :
                                           report.securityPosture.overallRisk === "high" ? "border-orange-500/40" :
                                           report.securityPosture.overallRisk === "medium" ? "border-yellow-500/40" : "border-emerald-500/40",
                            },
                            {
                              label: "Trend",
                              value: report.securityPosture.trend || "N/A",
                              color: report.securityPosture.trend === "improving" ? "#22c55e" : report.securityPosture.trend === "degrading" ? "#ef4444" : "#eab308",
                              borderColor: report.securityPosture.trend === "improving" ? "border-emerald-500/40" : report.securityPosture.trend === "degrading" ? "border-red-500/40" : "border-yellow-500/40",
                            },
                            {
                              label: "Resolution Rate",
                              value: typeof report.securityPosture.resolutionRate === "number" && !isNaN(report.securityPosture.resolutionRate)
                                ? `${Math.round(report.securityPosture.resolutionRate)}%`
                                : "N/A",
                              color: typeof report.securityPosture.resolutionRate === "number" && !isNaN(report.securityPosture.resolutionRate) && report.securityPosture.resolutionRate >= 80 ? "#22c55e" : "#f97316",
                              borderColor: "border-border",
                            },
                            {
                              label: "MTTR",
                              value: report.securityPosture.meanTimeToRespond || "N/A",
                              color: "#60a5fa",
                              borderColor: "border-blue-500/30",
                            },
                          ].map(kpi => (
                            <div key={kpi.label} className={`rounded-lg p-3 bg-muted/30 border-l-2 border ${kpi.borderColor} text-center`}>
                              <p className="text-lg font-bold capitalize" style={{ color: kpi.color }}>{kpi.value}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
                            </div>
                          ))}
                        </div>
                        {report.securityPosture.incidentsByServerity && (
                          <div className="grid grid-cols-4 gap-2 mt-2">
                            {(["critical", "high", "medium", "low"] as const).map(sev => {
                              const sevColors: Record<string, { bg: string; text: string }> = {
                                critical: { bg: "bg-red-500/10", text: "text-red-500" },
                                high: { bg: "bg-orange-500/10", text: "text-orange-500" },
                                medium: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400" },
                                low: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
                              };
                              return (
                                <div key={sev} className={`${sevColors[sev].bg} rounded-md p-2 text-center`}>
                                  <p className={`text-base font-bold ${sevColors[sev].text}`}>{report.securityPosture.incidentsByServerity[sev] ?? 0}</p>
                                  <p className="text-[10px] text-muted-foreground capitalize">{sev}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}

                  {report.keyThreats && report.keyThreats.length > 0 && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-red-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Key Threats ({report.keyThreats.length})</span>
                      </div>
                      <div className="space-y-2">
                        {report.keyThreats.map((threat: any, i: number) => {
                          const sevBars: Record<string, string> = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-emerald-500" };
                          const sevText: Record<string, string> = { critical: "text-red-500", high: "text-orange-500", medium: "text-yellow-600 dark:text-yellow-400", low: "text-emerald-600 dark:text-emerald-400" };
                          const sevBg: Record<string, string> = { critical: "bg-red-500/10 border-red-500/20", high: "bg-orange-500/10 border-orange-500/20", medium: "bg-yellow-500/10 border-yellow-500/20", low: "bg-emerald-500/10 border-emerald-500/20" };
                          return (
                            <div key={i} className={`flex items-stretch rounded-lg overflow-hidden border ${sevBg[threat.severity] || "bg-muted/30 border-border"}`}>
                              <div className={`w-1 shrink-0 ${sevBars[threat.severity] || "bg-slate-400"}`} />
                              <div className="flex-1 p-3">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-semibold text-sm text-foreground">{threat.title}</span>
                                  {threat.mitreId && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300 dark:bg-slate-700/80 font-mono border border-slate-600/40">
                                      {threat.mitreId}
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-bold uppercase tracking-wide ${sevText[threat.severity] || "text-muted-foreground"}`}>{threat.severity}</span>
                                  {threat.count && <span className="text-[10px] text-muted-foreground ml-auto">{threat.count} incident{threat.count !== 1 ? "s" : ""}</span>}
                                </div>
                                <p className="text-[12px] text-muted-foreground leading-relaxed">{threat.description}</p>
                                {threat.affectedSystems && (
                                  <p className="text-[11px] text-muted-foreground/70 mt-1">Affected: {threat.affectedSystems}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {report.aiPerformance && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-violet-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">AI Agent Performance</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
                        {[
                          { label: "Total Actions", value: report.aiPerformance.totalActions ?? 0, color: "text-violet-500" },
                          { label: "Tickets Resolved", value: report.aiPerformance.ticketsResolved ?? 0, color: "text-emerald-500" },
                          { label: "Investigations", value: report.aiPerformance.investigationsCompleted ?? 0, color: "text-blue-500" },
                          { label: "Threat Hunts", value: report.aiPerformance.threatsHunted ?? 0, color: "text-orange-500" },
                          { label: "Avg Confidence", value: report.aiPerformance.averageConfidence ? `${Math.round(report.aiPerformance.averageConfidence)}%` : "N/A", color: "text-cyan-500" },
                        ].map((m) => (
                          <div key={m.label} className="rounded-lg bg-muted/20 border border-border p-2 text-center">
                            <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      {report.aiPerformance.summary && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic">{report.aiPerformance.summary}</p>
                      )}
                    </section>
                  )}

                  {report.unresolvedCritical && report.unresolvedCritical.length > 0 && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-red-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Unresolved Critical Items ({report.unresolvedCritical.length})</span>
                      </div>
                      <div className="space-y-2">
                        {report.unresolvedCritical.map((item: any, i: number) => (
                          <div key={i} className="flex items-stretch rounded-lg overflow-hidden border border-red-500/20">
                            <div className="w-1 shrink-0 bg-red-500" />
                            <div className="flex-1 p-3">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-sm text-foreground">{item.title}</span>
                                <span className="text-[9px] font-bold uppercase text-red-500 tracking-wide">{item.severity}</span>
                                {item.age && <span className="text-[10px] text-muted-foreground ml-auto">{item.age}</span>}
                              </div>
                              {item.recommendation && (
                                <p className="text-[12px] text-muted-foreground">{item.recommendation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {report.recommendations && report.recommendations.length > 0 && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-emerald-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Recommendations</span>
                      </div>
                      <div className="space-y-2">
                        {report.recommendations.map((rec: any, i: number) => {
                          const pLabel = rec.priority === "immediate" ? "P1" : rec.priority === "short_term" ? "P2" : rec.priority === "medium_term" ? "P3" : `P${Math.min(i + 1, 5)}`;
                          const pColors: Record<string, { bg: string; text: string; border: string }> = {
                            P1: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/40" },
                            P2: { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/40" },
                            P3: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-500/40" },
                            P4: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/40" },
                            P5: { bg: "bg-slate-500/10", text: "text-muted-foreground", border: "border-border" },
                          };
                          const pc = pColors[pLabel] || pColors.P5;
                          return (
                            <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border hover:bg-muted/40 transition-colors">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded self-start mt-0.5 shrink-0 border ${pc.bg} ${pc.text} ${pc.border}`}>
                                {pLabel}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-foreground">{rec.action}</p>
                                {rec.rationale && <p className="text-[11px] text-muted-foreground mt-1">{rec.rationale}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {report.riskTrendAnalysis && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-amber-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Risk Trend Analysis</span>
                      </div>
                      <div className="px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-sm leading-relaxed text-foreground">{report.riskTrendAnalysis}</p>
                      </div>
                    </section>
                  )}

                  {report.nextDayFocus && report.nextDayFocus.length > 0 && (
                    <section className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-0.5 h-4 rounded-full bg-blue-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">Next 24-Hour Focus</span>
                      </div>
                      <ul className="space-y-1.5">
                        {report.nextDayFocus.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[9px] font-bold text-blue-500">{i + 1}</span>
                            </div>
                            <span className="text-sm text-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  </div>{/* end divide-y sections */}

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-border bg-muted/10 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] text-muted-foreground">Generated by {report.generatedBy || "ARIA"} · {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground">{selected.confidence}% confidence · {formatDuration(selected.duration)}</span>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReviewQueue({ activities, onReview }: { activities: any[]; onReview: (id: number, approved: boolean, feedback?: string) => void }) {
  const [feedbackMap, setFeedbackMap] = useState<Record<number, string>>({});

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-muted-foreground">All AI actions have been reviewed. Great work!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{activities.length} AI actions pending human review</p>
      {activities.slice(0, 20).map((activity: any) => {
        const Icon = AGENT_ICONS[activity.agentSpecialization] || Bot;
        const color = AGENT_COLORS[activity.agentSpecialization] || "#666";
        return (
          <Card key={activity.id} data-testid={`review-${activity.id}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{activity.agentName}</span>
                    <Badge variant="outline" className="text-xs">{ACTIVITY_LABELS[activity.activityType] || activity.activityType}</Badge>
                    {activity.confidence > 0 && (
                      <Badge variant={activity.confidence >= 80 ? "default" : "secondary"} className="text-xs">{activity.confidence}%</Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{formatTimeAgo(activity.createdAt)}</span>
                  </div>
                  <p className="text-sm">{activity.summary}</p>
                  {activity.targetId && (
                    <p className="text-xs text-muted-foreground">
                      Target: {activity.targetType} #{activity.targetId}
                    </p>
                  )}
                  <Textarea
                    placeholder="Optional feedback..."
                    className="h-16 text-xs"
                    value={feedbackMap[activity.id] || ""}
                    onChange={(e) => setFeedbackMap(prev => ({ ...prev, [activity.id]: e.target.value }))}
                    data-testid={`feedback-${activity.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onReview(activity.id, true, feedbackMap[activity.id])}
                      data-testid={`approve-${activity.id}`}
                    >
                      <ThumbsUp className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onReview(activity.id, false, feedbackMap[activity.id])}
                      data-testid={`override-${activity.id}`}
                    >
                      <ThumbsDown className="w-3 h-3 mr-1" /> Override
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
