import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHero } from "@/components/page-hero";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  Bot,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Target,
  RefreshCw,
  Ticket,
  FolderKanban,
  FileText,
  Shield,
  ShieldCheck,
} from "lucide-react";

const TicketsPage = lazy(() => import("@/pages/tickets"));
const CasesPage = lazy(() => import("@/pages/cases"));

const STEP_ICONS: Record<string, any> = {
  accepted: CheckCircle2,
  categorized: Target,
  assigned: Bot,
  working: Brain,
  retry: RefreshCw,
  report_generated: FileText,
  resolved: CheckCircle2,
  escalated: ArrowUpRight,
  error: AlertTriangle,
};

const AGENT_AVATARS: Record<string, { icon: any; color: string; label: string }> = {
  ARIA: { icon: Brain, color: "text-blue-500 bg-blue-500/10", label: "SOC Analyst" },
  VANGUARD: { icon: Shield, color: "text-red-500 bg-red-500/10", label: "Incident Responder" },
  SENTINEL: { icon: Target, color: "text-amber-500 bg-amber-500/10", label: "Threat Hunter" },
  GUARDIAN: { icon: ShieldCheck, color: "text-green-500 bg-green-500/10", label: "Compliance" },
  NEXUS: { icon: Zap, color: "text-purple-500 bg-purple-500/10", label: "Customer Support" },
};

const STEP_COLORS: Record<string, string> = {
  completed: "text-green-500",
  in_progress: "text-blue-500",
  failed: "text-red-500",
  pending: "text-muted-foreground",
};

export function AIJourneyTimeline({ steps }: { steps: any[] }) {
  if (!steps || steps.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No pipeline steps recorded yet.</p>;
  }

  return (
    <div className="space-y-1 pl-2" data-testid="ai-journey-timeline">
      {steps.map((step: any, idx: number) => {
        const StepIcon = STEP_ICONS[step.step_name] || Activity;
        const colorClass = STEP_COLORS[step.status] || "text-muted-foreground";
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id || idx} className="flex gap-3 relative" data-testid={`ai-step-${step.step_name}-${idx}`}>
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                step.status === "completed" ? "bg-green-500/10" :
                step.status === "in_progress" ? "bg-blue-500/10" :
                step.status === "failed" ? "bg-red-500/10" : "bg-muted"
              }`}>
                <StepIcon className={`w-3.5 h-3.5 ${colorClass}`} />
              </div>
              {!isLast && <div className="w-px h-full bg-border min-h-[16px]" />}
            </div>
            <div className="pb-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium capitalize">{step.step_name.replace(/_/g, " ")}</span>
                <Badge variant="outline" className={`text-[9px] ${
                  step.status === "completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                  step.status === "in_progress" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                  step.status === "failed" ? "bg-red-500/10 text-red-700 dark:text-red-400" : ""
                }`}>
                  {step.status}
                </Badge>
                {step.agent_name && (() => {
                  const avatar = AGENT_AVATARS[step.agent_name];
                  const AvatarIcon = avatar?.icon || Bot;
                  return (
                    <Badge variant="secondary" className={`text-[9px] ${avatar?.color || ""}`}>
                      <AvatarIcon className="w-2.5 h-2.5 mr-0.5" />
                      {step.agent_name}{avatar ? ` · ${avatar.label}` : ""}
                    </Badge>
                  );
                })()}
                {step.confidence != null && (
                  <span className="text-[9px] text-muted-foreground">{step.confidence}% confidence</span>
                )}
              </div>
              {step.output_text && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{step.output_text}</p>
              )}
              {step.error_message && (
                <p className="text-[11px] text-red-500 mt-0.5">{step.error_message}</p>
              )}
              {step.completed_at && (
                <span className="text-[9px] text-muted-foreground/60">
                  {new Date(step.completed_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AITicketRow({ ticket, onRerun }: { ticket: any; onRerun: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg" data-testid={`ai-ticket-row-${ticket.id}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground">TKT-{String(ticket.id).padStart(4, "0")}</span>
            <span className="text-sm font-medium truncate">{ticket.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {ticket.category && <Badge variant="secondary" className="text-[9px]">{ticket.category}</Badge>}
            <Badge variant="outline" className={`text-[9px] ${
              ticket.ai_pipeline_status === "completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
              ticket.ai_pipeline_status === "running" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
              ticket.ai_pipeline_status === "escalated" ? "bg-orange-500/10 text-orange-700 dark:text-orange-400" :
              ticket.ai_pipeline_status === "failed" ? "bg-red-500/10 text-red-700 dark:text-red-400" : ""
            }`}>
              {ticket.ai_pipeline_status || "pending"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {ticket.ai_agent_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Bot className="w-3 h-3" />
              <span>{ticket.ai_agent_name}</span>
            </div>
          )}
          {ticket.ai_confidence != null && (
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <Progress value={ticket.ai_confidence} className="h-1.5 flex-1" />
              <span className="text-[10px] font-mono text-muted-foreground">{ticket.ai_confidence}%</span>
            </div>
          )}
          {ticket.ai_escalated && (
            <Badge variant="destructive" className="text-[9px]">
              <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
              Escalated
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onRerun(ticket.id); }}
            title="Re-run AI pipeline"
            data-testid={`button-rerun-ai-${ticket.id}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 border-t bg-muted/10">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold py-2">AI Journey</p>
          <AIJourneyTimeline steps={ticket.steps || []} />
        </div>
      )}
    </div>
  );
}

function AIActivityTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/ai-activity", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ai-activity/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch AI activity");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const rerunMutation = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/ai-run`);
      return res.json();
    },
    onSuccess: (result) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: result.escalated ? "AI Pipeline: Escalated" : "AI Pipeline: Completed", description: result.summary });
    },
    onError: (err: any) => {
      toast({ title: "Pipeline failed", description: err.message, variant: "destructive" });
    },
  });

  const stats = data?.stats || {};
  const tickets = data?.tickets || [];

  const statCards = [
    { label: "Active Pipelines", value: stats.activePipelines || 0, icon: Loader2, color: "text-blue-500" },
    { label: "Resolved Today", value: stats.resolvedToday || 0, icon: CheckCircle2, color: "text-green-500" },
    { label: "Avg Confidence", value: `${stats.avgConfidence || 0}%`, icon: Brain, color: "text-purple-500" },
    { label: "Escalation Rate", value: `${stats.escalationRate || 0}%`, icon: ArrowUpRight, color: "text-orange-500" },
    { label: "Total AI Handled", value: stats.totalAiHandled || 0, icon: Bot, color: "text-primary" },
    { label: "Escalated Today", value: stats.escalatedToday || 0, icon: AlertTriangle, color: "text-destructive" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="section-ai-activity">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Agentic AI Pipeline Activity</h3>
          <p className="text-xs text-muted-foreground">Autonomous ticket lifecycle powered by AI agents</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-ai-activity">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} data-testid={`stat-ai-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-lg font-semibold mt-1">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-ai-tickets">No AI-handled tickets yet. Create a ticket and the AI pipeline will activate automatically.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket: any) => (
            <AITicketRow key={ticket.id} ticket={ticket} onRerun={(id) => rerunMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export default function OperationsCenter() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get("tab") || "tickets";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="page-operations-center">
      <PageHero
        icon={Zap}
        badge="Command"
        title="Operations Center"
        description="Unified ticket management, case investigation, and autonomous AI-powered service lifecycle"
        stats={[]}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full max-w-md grid-cols-3" data-testid="tabs-operations">
          <TabsTrigger value="tickets" data-testid="tab-tickets">
            <Ticket className="w-3.5 h-3.5 mr-1.5" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">
            <FolderKanban className="w-3.5 h-3.5 mr-1.5" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="ai-activity" data-testid="tab-ai-activity">
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            AI Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <Suspense fallback={<PageLoader />}>
            <TicketsPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="cases">
          <Suspense fallback={<PageLoader />}>
            <CasesPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="ai-activity">
          <AIActivityTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
