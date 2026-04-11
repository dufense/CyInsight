import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldQuestion,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  Crosshair,
  Activity,
  Monitor,
  Globe,
  Mail,
  Send,
  Network,
  Cloud,
  Fingerprint,
  Search,
  ArrowLeft,
  FileSearch,
  Users,
  ArrowRight,
  Sparkles,
  Eye,
  X,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  Hash,
  Link2,
  Server,
  Layers,
  MessageSquare,
  Gauge,
  Bot,
  TrendingUp,
  BarChart3,
  CircleDot,
  RotateCcw,
  Download,
  FileText,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DOMAIN_CONFIG: Record<string, { icon: any; color: string; gradient: string; accent: string; border: string }> = {
  "Endpoint": { icon: Monitor, color: "text-blue-500", gradient: "from-blue-500/20 to-blue-600/5", accent: "bg-blue-500", border: "border-blue-500/30" },
  "Email": { icon: Mail, color: "text-purple-500", gradient: "from-purple-500/20 to-purple-600/5", accent: "bg-purple-500", border: "border-purple-500/30" },
  "Network": { icon: Network, color: "text-teal-500", gradient: "from-teal-500/20 to-teal-600/5", accent: "bg-teal-500", border: "border-teal-500/30" },
  "Web App": { icon: Globe, color: "text-orange-500", gradient: "from-orange-500/20 to-orange-600/5", accent: "bg-orange-500", border: "border-orange-500/30" },
  "Cloud": { icon: Cloud, color: "text-sky-500", gradient: "from-sky-500/20 to-sky-600/5", accent: "bg-sky-500", border: "border-sky-500/30" },
  "Identity": { icon: Fingerprint, color: "text-amber-500", gradient: "from-amber-500/20 to-amber-600/5", accent: "bg-amber-500", border: "border-amber-500/30" },
};

const PHASE_ICONS: Record<string, typeof Shield> = {
  "Reconnaissance": Globe,
  "Initial Access": Target,
  "Execution": Zap,
  "Persistence": Fingerprint,
  "Privilege Escalation": ArrowRight,
  "Defense Evasion": Shield,
  "Credential Access": Fingerprint,
  "Discovery": FileSearch,
  "Lateral Movement": Activity,
  "Collection": Monitor,
  "Command and Control": Globe,
  "Exfiltration": AlertTriangle,
  "Impact": AlertTriangle,
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const IOC_TYPE_ICONS: Record<string, typeof Hash> = {
  ip: Server,
  domain: Globe,
  url: Link2,
  hash: Hash,
  email: Mail,
  file: FileSearch,
};

const MATCH_REASON_COLORS: Record<string, string> = {
  "Same incident type": "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  "Same attack type": "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "Similar title": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  "Same category": "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "Same MITRE technique": "bg-red-500/15 text-red-700 dark:text-red-400",
  "Same MITRE tactic": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "Same Kill Chain phase": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "Shared IOC": "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  "Same entity targeted": "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  "Same detection source": "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  "Temporal proximity": "bg-green-500/15 text-green-700 dark:text-green-400",
  "Same threat actor": "bg-pink-500/15 text-pink-700 dark:text-pink-400",
};

const AGENT_PIPELINE_CONFIG: { name: string; icon: any; color: string; bgGradient: string; borderColor: string; glowColor: string; summary: (data: any) => string }[] = [
  { name: "Context Agent", icon: FileSearch, color: "text-blue-500", bgGradient: "from-blue-500/20 to-blue-600/10", borderColor: "border-blue-500/40", glowColor: "shadow-blue-500/30",
    summary: (d: any) => d?.assetContext?.length ? `${d.assetContext.length} assets, ${d.userContext?.length || 0} users, exposure: ${d.exposureLevel || "unknown"}` : "Context gathered" },
  { name: "Threat Intel Agent", icon: Target, color: "text-red-500", bgGradient: "from-red-500/20 to-red-600/10", borderColor: "border-red-500/40", glowColor: "shadow-red-500/30",
    summary: (d: any) => d?.iocs?.length ? `${d.iocs.length} IOCs (${d.maliciousCount || 0} malicious), threat: ${d.threatLevel || "unknown"}` : "Intel analyzed" },
  { name: "Behavior Agent", icon: Activity, color: "text-purple-500", bgGradient: "from-purple-500/20 to-purple-600/10", borderColor: "border-purple-500/40", glowColor: "shadow-purple-500/30",
    summary: (d: any) => d?.anomalies?.length ? `${d.anomalies.length} anomalies, max deviation: ${d.maxDeviation || 0}/100` : "No anomalies" },
  { name: "Correlation Agent", icon: Layers, color: "text-cyan-500", bgGradient: "from-cyan-500/20 to-cyan-600/10", borderColor: "border-cyan-500/40", glowColor: "shadow-cyan-500/30",
    summary: (d: any) => d?.attackStages?.length ? `${d.attackStages.length} attack stages, ${d.crossSourceCorrelation?.length || 0} cross-source correlations` : "Timeline built" },
  { name: "Risk Scoring Agent", icon: Gauge, color: "text-amber-500", bgGradient: "from-amber-500/20 to-amber-600/10", borderColor: "border-amber-500/40", glowColor: "shadow-amber-500/30",
    summary: (d: any) => d?.decisionMetrics ? `Risk: ${d.decisionMetrics.riskScore}, FP: ${d.decisionMetrics.falsePositiveLikelihood}%` : "Score computed" },
  { name: "Remediation Agent", icon: Shield, color: "text-orange-500", bgGradient: "from-orange-500/20 to-orange-600/10", borderColor: "border-orange-500/40", glowColor: "shadow-orange-500/30",
    summary: (d: any) => d?.containmentActions?.length ? `[${(d.securityDomain || "endpoint").toUpperCase()}] ${d.isRemediated ? "Proactive" : "Reactive"}: ${d.containmentActions.length} actions, ${d.remediationSteps?.length || 0} steps, ${d.signalIntelligence?.length || 0} signals` : "Actions planned" },
  { name: "Report Agent", icon: Sparkles, color: "text-emerald-500", bgGradient: "from-emerald-500/20 to-emerald-600/10", borderColor: "border-emerald-500/40", glowColor: "shadow-emerald-500/30",
    summary: (d: any) => d?.verdict ? `Verdict: ${d.verdict}, AI report generated` : "Report compiled" },
];

function CircularProgress({ value, size = 48, stroke = 4, color = "stroke-blue-500", label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/40" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${color} animate-ring-fill`}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      {label && (
        <span className="absolute text-[10px] font-bold">{label}</span>
      )}
    </div>
  );
}

function RenderMarkdownReport({ content }: { content: string }) {
  if (!content) return null;

  let text = content;
  try { text = decodeURIComponent(text); } catch {}
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      text = JSON.stringify(parsed, null, 2);
    } catch {}
  }

  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-1.5 pl-4 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed text-muted-foreground flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const renderInlineMarkdown = (line: string) => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = line;
    let idx = 0;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/`([^`]+)`/);
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

      let firstMatch: { type: string; match: RegExpMatchArray; index: number } | null = null;

      if (codeMatch?.index !== undefined) {
        firstMatch = { type: "code", match: codeMatch, index: codeMatch.index };
      }
      if (boldMatch?.index !== undefined && (!firstMatch || boldMatch.index < firstMatch.index)) {
        firstMatch = { type: "bold", match: boldMatch, index: boldMatch.index };
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      if (firstMatch.type === "code") {
        parts.push(
          <code key={idx++} className="px-1.5 py-0.5 bg-muted/50 dark:bg-muted/30 rounded text-[11px] font-mono text-orange-600 dark:text-orange-400">
            {firstMatch.match[1]}
          </code>
        );
      } else {
        parts.push(
          <strong key={idx++} className="font-semibold text-foreground">
            {firstMatch.match[1]}
          </strong>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
    }

    return <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-foreground mt-5 mb-2 pb-1.5 border-b border-border/40 flex items-center gap-2 first:mt-0">
          <span className="w-1 h-4 bg-primary rounded-full" />
          {trimmed.replace("## ", "")}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={key++} className="text-xs font-semibold text-foreground mt-3 mb-1.5">
          {trimmed.replace("### ", "")}
        </h4>
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-base font-bold text-foreground mt-4 mb-2 pb-2 border-b border-border/60 first:mt-0">
          {trimmed.replace("# ", "")}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch) {
      listItems.push(numberedMatch[1]);
      continue;
    }

    flushList();
    elements.push(
      <p key={key++} className="text-xs leading-relaxed text-muted-foreground my-1.5">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className="space-y-0" data-testid="rendered-technical-report">{elements}</div>;
}

function classifyDomainFrontend(inv: any): string {
  const source = (inv.incident_source || inv.source || "").toLowerCase();
  const category = (inv.incident_category || inv.category || "").toLowerCase();
  if (source.includes("email") || category.includes("email")) return "Email";
  if (source.includes("endpoint") || source.includes("cynet") || source.includes("edr")) return "Endpoint";
  if (source.includes("network") || source.includes("firewall")) return "Network";
  if (source.includes("waf") || source.includes("web") || category.includes("web")) return "Web App";
  if (source.includes("cloud") || source.includes("casb") || source.includes("sse")) return "Cloud";
  if (source.includes("identity") || source.includes("iam")) return "Identity";
  return "Endpoint";
}

function getMatchReasonColor(reason: string): string {
  for (const [key, val] of Object.entries(MATCH_REASON_COLORS)) {
    if (reason.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return "bg-muted text-muted-foreground";
}

export default function AIAnalystDetailPage({ params }: { params: { id: string } }) {
  const { currentTenant } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showReport, setShowReport] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showFpDialog, setShowFpDialog] = useState(false);
  const [expandedHuntItems, setExpandedHuntItems] = useState<Set<number>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackVerdict, setFeedbackVerdict] = useState<string>("");
  const [feedbackSeverity, setFeedbackSeverity] = useState<string>("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackType, setFeedbackType] = useState("general");
  const [showPipelineDetail, setShowPipelineDetail] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const tenantId = currentTenant?.id;
  const tenantBrandColor = (currentTenant as any)?.brandColor || "#3b82f6";
  const investigationId = parseInt(params.id);

  const invQuery = useQuery<any>({
    queryKey: ["/api/investigations", tenantId, investigationId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/investigations/${tenantId}/${investigationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Investigation not found");
      return res.json();
    },
    enabled: !!tenantId && !isNaN(investigationId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "investigating" || data.status === "queued")) return 5000;
      return false;
    },
  });

  const threatHuntQuery = useQuery<any>({
    queryKey: ["/api/ai-analyst", tenantId, "threat-hunt", investigationId],
    enabled: false,
  });

  const huntMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const res = await fetch(`/api/ai-analyst/${tenantId}/threat-hunt/${investigationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Threat hunt failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/ai-analyst", tenantId, "threat-hunt", investigationId], data);
      toast({ title: "Threat hunt complete", description: `Found ${data.totalMatches} similar incidents` });
    },
    onError: (error: any) => {
      toast({ title: "Threat hunt failed", description: error.message, variant: "destructive" });
    },
  });

  const huntData = queryClient.getQueryData<any>(["/api/ai-analyst", tenantId, "threat-hunt", investigationId]);

  const notificationsQuery = useQuery<any[]>({
    queryKey: ["/api/ai-investigations", tenantId, investigationId, "notifications"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/ai-investigations/${tenantId}/${investigationId}/notifications`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && !isNaN(investigationId),
  });

  const verdictMutation = useMutation({
    mutationFn: async (data: { regenerate?: boolean; verdict?: string; verdictReasoning?: string }) => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-investigations/${tenantId}/${investigationId}/verdict`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, investigationId] });
      toast({ title: "Verdict updated" });
    },
    onError: (error: any) => {
      toast({ title: "Verdict update failed", description: error.message, variant: "destructive" });
    },
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (recipientList: string[]) => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-investigations/${tenantId}/${investigationId}/send-notification`, { recipients: recipientList });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-investigations", tenantId, investigationId, "notifications"] });
      setRecipients([]);
      setRecipientInput("");
      toast({
        title: data.sendResult?.success ? "Notification sent" : "Notification saved (email delivery pending)",
        description: data.sendResult?.success ? `Sent to ${data.notification.recipients?.length || 0} recipients` : data.sendResult?.error || "Configure email provider in Integrations",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send notification", description: error.message, variant: "destructive" });
    },
  });

  const closeIncidentMutation = useMutation({
    mutationFn: async () => {
      if (!invQuery.data?.incident_id) throw new Error("No incident");
      const res = await apiRequest("POST", `/api/incidents/${invQuery.data.incident_id}/close`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, investigationId] });
      toast({ title: "Incident closed" });
      setShowCloseDialog(false);
    },
  });

  const fpMutation = useMutation({
    mutationFn: async () => {
      if (!invQuery.data?.incident_id) throw new Error("No incident");
      const res = await apiRequest("POST", `/api/incidents/${invQuery.data.incident_id}/false-positive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, investigationId] });
      toast({ title: "Incident marked as false positive" });
      setShowFpDialog(false);
    },
  });

  const feedbackQuery = useQuery<any[]>({
    queryKey: ["/api/ai-analyst", tenantId, "feedback", investigationId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/ai-analyst/${tenantId}/feedback/${investigationId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && !isNaN(investigationId),
  });

  const feedbackMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!tenantId) throw new Error("No tenant");
      const res = await apiRequest("POST", `/api/ai-analyst/${tenantId}/feedback`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId, "feedback", investigationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, investigationId] });
      setShowFeedbackForm(false);
      setFeedbackVerdict("");
      setFeedbackSeverity("");
      setFeedbackNotes("");
      setFeedbackType("general");
      toast({ title: "Feedback submitted", description: "Your feedback will improve future investigations" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit feedback", description: error.message, variant: "destructive" });
    },
  });

  const reinvestigateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !invQuery.data?.incident_id) throw new Error("No tenant or incident");
      const res = await apiRequest("POST", `/api/ai-analyst/${tenantId}/reinvestigate`, { incidentIds: [invQuery.data.incident_id] });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId, investigationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/investigations", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-analyst", tenantId] });
      toast({ title: "Re-investigation started", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Re-investigation failed", description: error.message, variant: "destructive" });
    },
  });

  const submitFeedback = () => {
    feedbackMutation.mutate({
      investigationId,
      incidentId: invQuery.data?.incident_id,
      feedbackType,
      verdictOverride: feedbackVerdict || undefined,
      severityOverride: feedbackSeverity || undefined,
      feedbackNotes: feedbackNotes || undefined,
    });
  };

  const toggleAgentExpand = (agentName: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  };

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipients.includes(email)) {
      setRecipients([...recipients, email]);
      setRecipientInput("");
    }
  };

  const loadPreview = async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/ai-investigations/${tenantId}/${investigationId}/notification-preview`, { credentials: "include" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        throw new Error(errData.message || `Preview failed (${res.status})`);
      }
      const data = await res.json();
      setPreviewHtml(data.html);
      setShowPreview(true);
    } catch (err: any) {
      toast({ title: "Failed to load preview", description: err?.message || "Unknown error generating email preview", variant: "destructive" });
    }
  };

  if (!tenantId || isNaN(investigationId)) {
    return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Invalid investigation</p></div>;
  }

  if (invQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (invQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" data-testid="investigation-error">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <p className="font-semibold">Failed to load investigation</p>
        <p className="text-sm text-muted-foreground">{(invQuery.error as any)?.message || "An error occurred while loading this investigation."}</p>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => invQuery.refetch()} data-testid="investigation-retry">
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/ai-analyst")} data-testid="investigation-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to AI Analyst
          </Button>
        </div>
      </div>
    );
  }

  const inv = invQuery.data;

  const pipelineAgents = Array.isArray(inv?.agent_pipeline) ? inv.agent_pipeline : [];
  const pipelineMap: Record<string, any> = {};
  for (const agent of pipelineAgents) {
    if (agent && agent.agentName) pipelineMap[agent.agentName] = agent;
  }
  const completedAgentNames = new Set(pipelineAgents.filter((a: any) => a?.agentName && (a?.output?.status === "completed" || a?.output?.status === "skipped")).map((a: any) => a.agentName));

  if (!inv) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Investigation not found</p>
        <Button variant="outline" onClick={() => navigate("/ai-analyst")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to AI Analyst
        </Button>
      </div>
    );
  }

  const domain = classifyDomainFrontend(inv);
  const domainCfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG["Endpoint"];
  const DomainIcon = domainCfg.icon;
  const findings = inv.findings || {};
  const recommendations = inv.recommendations || {};
  const attackChain = inv.attack_chain || [];
  const iocsSummary = inv.iocs_summary || [];
  const affectedEntities = inv.affected_entities || findings.affectedEntities || [];
  const containmentActions = recommendations.containmentActions || [];
  const remediationSteps = recommendations.remediationSteps || [];
  const preventionMeasures = recommendations.preventionMeasures || [];
  const signalIntelligence = recommendations.signalIntelligence || [];
  const actionState = recommendations.actionState || "none";
  const actionTakenLabel = recommendations.actionTaken || inv.action_taken || "None";
  const securityDomain = recommendations.securityDomain || "endpoint";
  const recommendationFocus = recommendations.recommendationFocus || "reactive";
  const isRemediated = recommendations.isRemediated || false;
  const steps = inv.investigation_steps || [];

  const verdictGradient = inv.verdict === "true_positive" ? "from-red-500/10 via-red-600/5 to-transparent" :
    inv.verdict === "false_positive" ? "from-green-500/10 via-green-600/5 to-transparent" :
    "from-amber-500/10 via-amber-600/5 to-transparent";

  return (
    <div className="space-y-6 p-4 md:p-6 overflow-y-auto h-full" data-testid="ai-analyst-detail-page">
      <div className="flex items-center gap-2 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => navigate("/ai-analyst")} data-testid="button-back-analyst">
          <ArrowLeft className="w-4 h-4 mr-1" /> AI Analyst
        </Button>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Investigation #{inv.id}</span>
      </div>

      <div className="relative rounded-md bg-gradient-to-r from-slate-900/5 via-indigo-900/8 to-slate-900/5 dark:from-slate-100/5 dark:via-indigo-100/8 dark:to-slate-100/5 p-5 border border-border/40 animate-fade-in-up" style={{ borderTopColor: tenantBrandColor, borderTopWidth: '3px' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-md flex items-center justify-center bg-gradient-to-br ${domainCfg.gradient}`}>
              <DomainIcon className={`w-6 h-6 ${domainCfg.color}`} />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-investigation-title">
                {inv.incident_title || `Incident #${inv.incident_id}`}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[9px]">{domain}</Badge>
                <Badge variant="outline" className={`text-[9px] ${
                  inv.status === "completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                  inv.status === "investigating" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                  inv.status === "failed" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                  "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                }`}>
                  {inv.status === "investigating" && <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />}
                  {inv.status}
                </Badge>
                <Badge variant="outline" className="text-[9px]">{inv.investigation_type}</Badge>
                {inv.incident_severity && (
                  <Badge className={`text-[9px] ${
                    inv.incident_severity === "critical" ? "bg-red-600" :
                    inv.incident_severity === "high" ? "bg-orange-500" :
                    "bg-yellow-500"
                  } text-white`}>{inv.incident_severity}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {inv.risk_score != null && (
              <div className="flex flex-col items-center">
                <CircularProgress value={inv.risk_score} size={52} stroke={4} label={`${inv.risk_score}`} color={inv.risk_score >= 70 ? "stroke-red-500" : inv.risk_score >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="badge-detail-risk">Risk</p>
              </div>
            )}
            {inv.confidence_score != null && (
              <div className="flex flex-col items-center">
                <CircularProgress value={inv.confidence_score} size={52} stroke={4} label={`${inv.confidence_score}%`} color="stroke-blue-500" />
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="badge-detail-confidence">Confidence</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Duration</p>
              <span className="text-xs font-medium">
                {inv.started_at && inv.completed_at
                  ? `${Math.round((new Date(inv.completed_at).getTime() - new Date(inv.started_at).getTime()) / 1000)}s`
                  : "—"}
              </span>
            </div>
            {inv.status === "completed" && (
              <div className="flex gap-1.5 ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="button-export-report">
                      <Download className="w-3.5 h-3.5 mr-1" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/ai-investigations/${tenantId}/${inv.id}/export-pdf`;
                        a.download = `IR-Report-${inv.id}.pdf`;
                        a.click();
                      }}
                      data-testid="button-export-pdf"
                    >
                      <FileText className="w-4 h-4 mr-2 text-red-500" /> Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/ai-investigations/${tenantId}/${inv.id}/export-docx`;
                        a.download = `IR-Report-${inv.id}.docx`;
                        a.click();
                      }}
                      data-testid="button-export-docx"
                    >
                      <FileDown className="w-4 h-4 mr-2 text-blue-500" /> Download Word
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" onClick={() => setShowCloseDialog(true)} data-testid="button-close-incident">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowFpDialog(true)} data-testid="button-false-positive">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> FP
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="animate-fade-scale-in" data-testid="card-agent-pipeline-visual">
        <button
          className="w-full flex items-center gap-3 p-3 rounded-md border bg-gradient-to-r from-purple-600/8 via-indigo-600/6 to-blue-600/8 dark:from-purple-500/12 dark:via-indigo-500/10 dark:to-blue-500/12 hover-elevate transition-all duration-200"
          onClick={() => setShowPipeline(!showPipeline)}
          data-testid="button-toggle-pipeline"
        >
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold">Agent Pipeline</span>
            <Badge variant="outline" className="text-[9px]">{completedAgentNames.size}/7 agents</Badge>
            {inv.status === "investigating" && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
            {pipelineAgents.length > 0 && (
              <Badge variant="outline" className="text-[9px]">
                {Math.round(pipelineAgents.reduce((s: number, a: any) => s + (a.output?.duration || 0), 0) / 1000)}s
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(inv.status === "completed" || inv.status === "failed") && (
              <Button size="sm" variant="outline" className="text-[10px]" onClick={(e) => { e.stopPropagation(); reinvestigateMutation.mutate(); }} disabled={reinvestigateMutation.isPending} data-testid="button-reinvestigate">
                {reinvestigateMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                Re-Investigate
              </Button>
            )}
            {showPipeline ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>
        {showPipeline && (
          <Card className="mt-2 animate-fade-in-up border-purple-500/20 dark:border-purple-400/15">
            <CardContent className="p-4">
              <div className="space-y-0" data-testid="pipeline-visualization">
                {AGENT_PIPELINE_CONFIG.map((agentCfg, i) => {
                  const agentData = pipelineMap[agentCfg.name];
                  const output = agentData?.output || {};
                  const confidence = output.confidence || 0;
                  const status = output.status || (inv.status === "investigating" ? (completedAgentNames.has(agentCfg.name) ? "completed" : (i <= completedAgentNames.size ? "running" : "pending")) : "pending");
                  const isCompleted = status === "completed" || status === "skipped";
                  const isFailed = status === "failed";
                  const isRunning = status === "running" && inv.status === "investigating";
                  const isPending = !isCompleted && !isFailed && !isRunning;
                  const isExpanded = expandedAgents.has(agentCfg.name);
                  const AgentIcon = agentCfg.icon;
                  const isParallelStart = agentCfg.name === "Threat Intel Agent";
                  const isParallelEnd = agentCfg.name === "Behavior Agent";
                  const isParallel = isParallelStart || isParallelEnd;

                  return (
                    <div key={agentCfg.name} className={`relative ${isParallelEnd ? "mt-0" : ""}`}>
                      {i > 0 && !isParallelEnd && (
                        <div className="flex justify-center py-1">
                          <svg width="2" height="16" className="text-muted-foreground/30">
                            <line x1="1" y1="0" x2="1" y2="16" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className={isCompleted || isRunning ? "animate-connector-dash" : ""} />
                          </svg>
                        </div>
                      )}
                      {isParallelStart && (
                        <div className="flex items-center gap-1 px-2 mb-1">
                          <div className="flex-1 h-px bg-muted-foreground/20" />
                          <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold">parallel execution</span>
                          <div className="flex-1 h-px bg-muted-foreground/20" />
                        </div>
                      )}
                      <div className={`flex ${isParallel ? "pl-4" : ""}`}>
                        {isParallel && (
                          <div className="w-1 rounded-full mr-3 flex-shrink-0" style={{ background: isCompleted ? "linear-gradient(to bottom, rgba(99,102,241,0.4), rgba(168,85,247,0.4))" : "rgba(148,163,184,0.15)" }} />
                        )}
                        <div className={`flex-1 rounded-lg border transition-all duration-300 ${
                          isCompleted ? `${agentCfg.borderColor} bg-gradient-to-r ${agentCfg.bgGradient}` :
                          isFailed ? "border-red-500/50 bg-gradient-to-r from-red-500/10 to-red-600/5" :
                          isRunning ? `${agentCfg.borderColor} bg-gradient-to-r ${agentCfg.bgGradient} ${agentCfg.glowColor} shadow-md animate-node-pulse` :
                          "border-muted/40 bg-muted/5 opacity-50"
                        }`}
                        data-testid={`pipeline-agent-${agentCfg.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <button
                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-background/20 transition-colors rounded-lg"
                            onClick={() => toggleAgentExpand(agentCfg.name)}
                            data-testid={`button-expand-pipeline-${i}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isCompleted ? `bg-gradient-to-br ${agentCfg.bgGradient}` :
                              isFailed ? "bg-red-500/20" :
                              isRunning ? `bg-gradient-to-br ${agentCfg.bgGradient}` :
                              "bg-muted/20"
                            }`}>
                              {isRunning ? (
                                <Loader2 className={`w-4 h-4 ${agentCfg.color} animate-spin`} />
                              ) : (
                                <AgentIcon className={`w-4 h-4 ${isCompleted ? agentCfg.color : isFailed ? "text-red-500" : "text-muted-foreground/50"}`} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isPending ? "text-muted-foreground/50" : ""}`}>{agentCfg.name}</span>
                                {isCompleted && <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />}
                                {isFailed && <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                                {isRunning && <Badge variant="outline" className="text-[7px] bg-blue-500/10 text-blue-600 dark:text-blue-400 animate-pulse">RUNNING</Badge>}
                              </div>
                              {(isCompleted || isFailed) && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                  {isFailed ? (output.reasoning || "Agent failed") : agentCfg.summary(output.data || {})}
                                </p>
                              )}
                            </div>
                            {isCompleted && confidence > 0 && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <div className="w-16 h-2 rounded-full bg-muted/50 overflow-hidden">
                                  <div className={`h-full rounded-full animate-progress-fill ${
                                    confidence >= 80 ? "bg-gradient-to-r from-green-500 to-emerald-400" :
                                    confidence >= 50 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                                    "bg-gradient-to-r from-orange-500 to-red-400"
                                  }`} style={{ width: `${confidence}%` }} />
                                </div>
                                <span className={`text-[10px] font-bold w-8 text-right ${
                                  confidence >= 80 ? "text-green-500" : confidence >= 50 ? "text-yellow-500" : "text-orange-500"
                                }`}>{confidence}%</span>
                              </div>
                            )}
                            {isCompleted && output.duration != null && (
                              <span className="text-[9px] text-muted-foreground flex-shrink-0 w-10 text-right">
                                {output.duration > 1000 ? `${(output.duration / 1000).toFixed(1)}s` : `${output.duration}ms`}
                              </span>
                            )}
                            {(isCompleted || isFailed) && (
                              isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                          </button>
                          {isExpanded && (isCompleted || isFailed) && (
                            <div className="px-3 pb-3 border-t border-dashed space-y-2 animate-fade-in-up">
                              {output.reasoning && (
                                <div className="mt-2">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Reasoning</p>
                                  <p className="text-xs leading-relaxed text-muted-foreground">{output.reasoning}</p>
                                </div>
                              )}
                              {output.evidenceRefs && output.evidenceRefs.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Evidence</p>
                                  <div className="space-y-1">
                                    {output.evidenceRefs.map((ref: string, j: number) => (
                                      <div key={j} className="flex items-start gap-1.5 text-[10px]">
                                        <CircleDot className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-muted-foreground">{ref}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {agentData?.startedAt && agentData?.completedAt && (
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>{new Date(agentData.startedAt).toLocaleTimeString()} → {new Date(agentData.completedAt).toLocaleTimeString()}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {isParallelEnd && (
                        <div className="flex items-center gap-1 px-2 mt-1">
                          <div className="flex-1 h-px bg-muted-foreground/20" />
                          <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold">merge</span>
                          <div className="flex-1 h-px bg-muted-foreground/20" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {inv.investigation_plan && (
                <div className="mt-3 pt-3 border-t">
                  <button className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => setShowPipelineDetail(!showPipelineDetail)} data-testid="button-toggle-plan">
                    <BarChart3 className="w-3 h-3" />
                    Investigation Plan
                    {showPipelineDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {showPipelineDetail && (
                    <div className="mt-2 space-y-2 animate-fade-in-up">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[8px]">Type: {inv.investigation_plan.incidentType}</Badge>
                        <Badge variant="outline" className="text-[8px]">Attack: {inv.investigation_plan.attackType}</Badge>
                        <Badge variant="outline" className="text-[8px]">Severity: {inv.investigation_plan.severity}</Badge>
                      </div>
                      {inv.investigation_plan.adaptiveRules?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Adaptive Rules</p>
                          {inv.investigation_plan.adaptiveRules.map((rule: any, i: number) => (
                            <div key={i} className="text-[10px] text-muted-foreground mb-1 p-1.5 rounded bg-muted/20">
                              <span className="font-medium">{rule.targetAgent}:</span> {rule.action}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {inv.status === "completed" && (
        <Card className={`bg-gradient-to-r ${verdictGradient} animate-fade-in-up`} data-testid="card-ai-verdict">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {inv.verdict === "true_positive" ? (
                  <div className="w-11 h-11 rounded-md bg-gradient-to-br from-red-500/30 to-red-600/10 flex items-center justify-center">
                    <ShieldX className="w-5 h-5 text-red-500" />
                  </div>
                ) : inv.verdict === "false_positive" ? (
                  <div className="w-11 h-11 rounded-md bg-gradient-to-br from-green-500/30 to-green-600/10 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-md bg-gradient-to-br from-amber-500/30 to-amber-600/10 flex items-center justify-center">
                    <ShieldQuestion className="w-5 h-5 text-amber-500" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">AI Verdict</span>
                    <Badge className={`text-[9px] ${
                      inv.verdict === "true_positive" ? "bg-red-600 text-white" :
                      inv.verdict === "false_positive" ? "bg-green-600 text-white" :
                      "bg-amber-500 text-white"
                    }`} data-testid="badge-verdict">
                      {inv.verdict === "true_positive" ? "True Positive" : inv.verdict === "false_positive" ? "False Positive" : "Inconclusive"}
                    </Badge>
                  </div>
                  {inv.confidence_score != null && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-muted-foreground">Confidence</span>
                      <div className="w-24 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-progress-fill" style={{ width: `${inv.confidence_score}%` }} />
                      </div>
                      <span className="text-[10px] font-medium">{inv.confidence_score}%</span>
                    </div>
                  )}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => verdictMutation.mutate({ regenerate: true })} disabled={verdictMutation.isPending} data-testid="button-regenerate-verdict">
                {verdictMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Regenerate
              </Button>
            </div>
            {inv.verdict_reasoning && (
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed" data-testid="text-verdict-reasoning">{inv.verdict_reasoning}</p>
            )}
          </CardContent>
        </Card>
      )}

      {inv.executive_summary && (
        <Card className={`animate-fade-in-up border-l-2 ${domainCfg.border}`} style={{ animationDelay: "0.1s" }}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${domainCfg.color}`} />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm leading-relaxed" data-testid="text-detail-summary">{inv.executive_summary}</p>
          </CardContent>
        </Card>
      )}

      {inv.decision_metrics && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.13s" }} data-testid="card-decision-metrics">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="w-4 h-4 text-indigo-500" />
              Decision Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-3 rounded-md bg-background/60 border">
                <CircularProgress value={inv.decision_metrics.riskScore || 0} size={44} stroke={4}
                  label={`${inv.decision_metrics.riskScore || 0}`}
                  color={inv.decision_metrics.riskScore >= 70 ? "stroke-red-500" : inv.decision_metrics.riskScore >= 40 ? "stroke-orange-500" : "stroke-green-500"} />
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="metric-risk">Risk Score</p>
              </div>
              <div className="text-center p-3 rounded-md bg-background/60 border">
                <CircularProgress value={inv.decision_metrics.confidenceScore || 0} size={44} stroke={4}
                  label={`${inv.decision_metrics.confidenceScore || 0}%`} color="stroke-blue-500" />
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="metric-confidence">Confidence</p>
              </div>
              <div className="text-center p-3 rounded-md bg-background/60 border">
                <CircularProgress value={inv.decision_metrics.falsePositiveLikelihood || 0} size={44} stroke={4}
                  label={`${inv.decision_metrics.falsePositiveLikelihood || 0}%`}
                  color={inv.decision_metrics.falsePositiveLikelihood >= 70 ? "stroke-green-500" : "stroke-amber-500"} />
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="metric-fp">FP Likelihood</p>
              </div>
              <div className="text-center p-3 rounded-md bg-background/60 border">
                <div className="flex items-center justify-center h-11">
                  <span className={`text-lg font-bold ${inv.decision_metrics.blastRadius?.businessImpact === "critical" ? "text-red-500" : inv.decision_metrics.blastRadius?.businessImpact === "high" ? "text-orange-500" : inv.decision_metrics.blastRadius?.businessImpact === "medium" ? "text-yellow-500" : "text-green-500"}`}>
                    {inv.decision_metrics.blastRadius?.affectedSystems || 0}
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground uppercase mt-1" data-testid="metric-blast">Blast Radius</p>
              </div>
            </div>

            {inv.decision_metrics.riskBreakdown && typeof inv.decision_metrics.riskBreakdown === "object" && (
              <div className="space-y-1.5 mb-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Risk Breakdown</p>
                {Object.entries(inv.decision_metrics.riskBreakdown).map(([key, rawFactor]) => {
                  const factor = rawFactor && typeof rawFactor === "object" ? rawFactor as { weight?: number; score?: number; raw?: string } : null;
                  if (!factor || typeof factor.score !== "number") return null;
                  const score = factor.score ?? 0;
                  const weight = factor.weight ?? 1;
                  return (
                    <div key={key} className="flex items-center gap-2 text-[10px]">
                      <span className="w-28 text-muted-foreground capitalize">{key.replace(/Factor$/, "").replace(/([A-Z])/g, " $1").trim()}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div className={`h-full rounded-full ${score >= 70 ? "bg-red-500" : score >= 40 ? "bg-orange-500" : "bg-green-500"}`} style={{ width: `${score}%` }} />
                      </div>
                      <span className="font-medium w-6 text-right">{score}</span>
                      <span className="text-muted-foreground w-6 text-right">×{weight}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {inv.decision_metrics.blastRadius && (
                <div className="p-2.5 rounded-md border bg-background/40">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Blast Radius</p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Systems</span><span className="font-medium">{inv.decision_metrics.blastRadius.affectedSystems}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Users</span><span className="font-medium">{inv.decision_metrics.blastRadius.affectedUsers}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Impact</span>
                      <Badge variant="outline" className={`text-[8px] ${inv.decision_metrics.blastRadius.businessImpact === "critical" ? "bg-red-500/15 text-red-700 dark:text-red-400" : inv.decision_metrics.blastRadius.businessImpact === "high" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"}`}>{inv.decision_metrics.blastRadius.businessImpact}</Badge>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">{inv.decision_metrics.blastRadius.dataAtRisk}</p>
                  </div>
                </div>
              )}

              {inv.decision_metrics.slaRecommendation && (
                <div className="p-2.5 rounded-md border bg-background/40">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">SLA Recommendation</p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Response</span><span className="font-medium">{inv.decision_metrics.slaRecommendation.responseTime}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Resolution</span><span className="font-medium">{inv.decision_metrics.slaRecommendation.resolutionTime}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Escalation</span><span className="font-medium">{inv.decision_metrics.slaRecommendation.escalationLevel}</span></div>
                  </div>
                </div>
              )}

              {inv.decision_metrics.automationEligibility && (
                <div className="p-2.5 rounded-md border bg-background/40">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Automation</p>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full ${inv.decision_metrics.automationEligibility.eligible ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-[10px] font-medium">{inv.decision_metrics.automationEligibility.eligible ? "Eligible" : "Not Eligible"}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mb-1">{inv.decision_metrics.automationEligibility.reason}</p>
                  {inv.decision_metrics.automationEligibility.suggestedActions?.length > 0 && (
                    <div className="space-y-0.5">
                      {inv.decision_metrics.automationEligibility.suggestedActions.map((action: string, i: number) => (
                        <div key={i} className="text-[9px] flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-amber-500" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {attackChain.length > 0 && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" />
              Attack Chain ({attackChain.length} phases)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="relative">
              {attackChain.map((phase: any, i: number) => {
                const PhaseIcon = PHASE_ICONS[phase.phase] || Shield;
                const isFirst = i === 0;
                const isLast = i === attackChain.length - 1;
                const phaseGradient = isFirst ? "from-red-500 to-red-600" :
                  isLast ? "from-purple-500 to-purple-600" : "from-blue-500 to-blue-600";
                return (
                  <div key={i} className="flex gap-3 mb-4 last:mb-0 animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }} data-testid={`detail-chain-${i}`}>
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-md flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${phaseGradient}`}>
                        <PhaseIcon className="w-4 h-4" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 mt-1 bg-gradient-to-b from-blue-500/40 to-purple-500/20" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{phase.phase}</span>
                        {phase.timestamp && <span className="text-[10px] text-muted-foreground">{phase.timestamp}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                      {phase.evidence && (
                        <p className="text-[10px] font-mono bg-muted/30 dark:bg-muted/20 px-2 py-1 rounded-md mt-1.5 text-muted-foreground">{phase.evidence}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {iocsSummary.length > 0 && (
          <Card className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crosshair className={`w-4 h-4 ${domainCfg.color}`} />
                IOCs Discovered ({iocsSummary.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {iocsSummary.map((ioc: any, i: number) => {
                  const IocIcon = IOC_TYPE_ICONS[ioc.type?.toLowerCase()] || Hash;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md border hover-elevate transition-all duration-200" data-testid={`detail-ioc-${i}`}>
                      <Badge variant="outline" className={`text-[8px] flex-shrink-0 mt-0.5 ${
                        ioc.reputation === "malicious" ? "bg-red-500/15 text-red-700 dark:text-red-400" :
                        ioc.reputation === "suspicious" ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" :
                        "bg-green-500/15 text-green-700 dark:text-green-400"
                      }`}>{ioc.reputation}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <IocIcon className="w-3 h-3 text-muted-foreground" />
                            <Badge variant="outline" className="text-[8px]">{ioc.type}</Badge>
                          </div>
                          <span className="font-mono truncate">{ioc.value}</span>
                        </div>
                        {ioc.context && <p className="text-[10px] text-muted-foreground mt-0.5">{ioc.context}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {affectedEntities.length > 0 && (
          <Card className="animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className={`w-4 h-4 ${domainCfg.color}`} />
                Affected Entities ({affectedEntities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {affectedEntities.map((entity: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-md border hover-elevate transition-all duration-200" data-testid={`detail-entity-${i}`}>
                    <Badge variant="outline" className={`text-[8px] ${
                      entity.riskLevel === "critical" || entity.riskLevel === "high" ? "bg-red-500/15 text-red-700 dark:text-red-400" :
                      entity.riskLevel === "medium" ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" :
                      "bg-green-500/15 text-green-700 dark:text-green-400"
                    }`}>{entity.riskLevel}</Badge>
                    <Badge variant="outline" className="text-[8px]">{entity.type}</Badge>
                    <span className="font-mono truncate flex-1">{entity.value}</span>
                    {entity.details && <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{entity.details}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {(findings.lateralMovement || findings.dataExfiltration) && (
        <div className="flex flex-wrap gap-2 animate-fade-in-up">
          {findings.lateralMovement && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">Lateral Movement Detected</span>
            </div>
          )}
          {findings.dataExfiltration && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">Potential Data Exfiltration</span>
            </div>
          )}
        </div>
      )}

      {(containmentActions.length > 0 || remediationSteps.length > 0 || signalIntelligence.length > 0) && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className={`w-4 h-4 ${domainCfg.color}`} />
              Recommended Actions
              <Badge variant="outline" className="text-[9px] ml-auto capitalize">{securityDomain.replace("_", " ")} Domain</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                isRemediated ? "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30" :
                actionState === "partial" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30" :
                "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
              }`} data-testid="action-status-badge">
                {isRemediated ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {isRemediated ? "Control Action Applied" : actionState === "partial" ? "Partially Addressed" : "No Action Taken"}
              </div>
              {actionTakenLabel && actionTakenLabel !== "None" && (
                <Badge variant="secondary" className="text-[9px]">{actionTakenLabel}</Badge>
              )}
              <Badge variant="outline" className={`text-[9px] ${recommendationFocus === "proactive" ? "border-green-500/50 text-green-600" : "border-red-500/50 text-red-600"}`}>
                {recommendationFocus === "proactive" ? "Proactive Focus" : "Immediate Response Required"}
              </Badge>
            </div>

            {signalIntelligence.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Signal Intelligence — IOC Signals Detected</p>
                <div className="space-y-1">
                  {signalIntelligence.map((signal: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-md text-xs border ${
                      signal.risk === "critical" ? "bg-red-500/5 border-red-500/20" :
                      signal.risk === "high" ? "bg-orange-500/5 border-orange-500/20" :
                      "bg-amber-500/5 border-amber-500/20"
                    }`} data-testid={`signal-intel-${i}`}>
                      <Badge variant="outline" className={`text-[7px] flex-shrink-0 mt-0.5 ${
                        signal.risk === "critical" ? "border-red-500 text-red-600" :
                        signal.risk === "high" ? "border-orange-500 text-orange-600" :
                        "border-amber-500 text-amber-600"
                      }`}>{signal.risk}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[7px]">{signal.type}</Badge>
                          <code className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded truncate max-w-[200px]">{signal.value}</code>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{signal.context}</p>
                        <p className="text-[10px] font-medium mt-0.5">{signal.recommendation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {containmentActions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                  {isRemediated ? "Verification & Follow-Up" : "Containment"}
                </p>
                <div className="space-y-1.5">
                  {containmentActions.map((action: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 p-2.5 rounded-md text-xs ${
                      action.alreadyApplied ? "bg-green-500/10 border border-green-500/20" :
                      PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.medium
                    }`} data-testid={`detail-action-${i}`}>
                      <Badge variant="outline" className={`text-[8px] flex-shrink-0 mt-0.5 ${action.alreadyApplied ? "border-green-500 text-green-600" : ""}`}>
                        {action.alreadyApplied ? "applied" : action.priority}
                      </Badge>
                      <div className="flex-1">
                        <span className="font-medium">{action.action}</span>
                        {action.urgency && <span className="text-muted-foreground ml-1">({action.urgency})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {remediationSteps.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                  {isRemediated ? "Post-Incident Actions" : "Remediation Steps"}
                </p>
                <div className="space-y-1">
                  {remediationSteps.map((step: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
                      <span className="flex-1">{step.step || step}</span>
                      {step.owner && <Badge variant="outline" className="text-[8px]">{step.owner}</Badge>}
                      {step.timeline && <span className="text-[10px] text-muted-foreground">{step.timeline}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {preventionMeasures.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                  {isRemediated ? "Proactive Defense & Awareness" : "Prevention"}
                </p>
                <ul className="space-y-1">
                  {preventionMeasures.map((m: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="animate-fade-in-up" style={{ animationDelay: "0.35s" }}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className={`w-4 h-4 ${domainCfg.color}`} />
            Threat Hunting
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center gap-3 mb-3">
            <Button
              size="sm"
              onClick={() => huntMutation.mutate()}
              disabled={huntMutation.isPending}
              data-testid="button-threat-hunt"
            >
              {huntMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Hunting...</>
              ) : (
                <><Crosshair className="w-3.5 h-3.5 mr-1.5" /> Hunt for Similar Threats</>
              )}
            </Button>
            {huntData && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {huntData.totalMatches} matches found
                </Badge>
                {huntData.sourceInvestigation?.sourceVector && huntData.sourceInvestigation.sourceVector !== "unknown" && (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    Domain: {huntData.sourceInvestigation.sourceVector}
                  </Badge>
                )}
                {huntData.totalMatches > 0 && (
                  <span className="text-[10px] text-muted-foreground">Same-domain threats only · cross-domain results suppressed</span>
                )}
              </div>
            )}
          </div>

          {huntData && huntData.similar && huntData.similar.length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="threat-hunt-results">
              {huntData.similar.map((match: any, i: number) => {
                const isExpanded = expandedHuntItems.has(i);
                const hasTimeline = match.targetTimeline && match.targetTimeline.length > 1;
                const vectorColor: Record<string, string> = {
                  endpoint: "border-orange-500/40 text-orange-600 dark:text-orange-400",
                  email: "border-blue-500/40 text-blue-600 dark:text-blue-400",
                  network: "border-purple-500/40 text-purple-600 dark:text-purple-400",
                  web: "border-cyan-500/40 text-cyan-600 dark:text-cyan-400",
                  cloud: "border-sky-500/40 text-sky-600 dark:text-sky-400",
                  identity: "border-pink-500/40 text-pink-600 dark:text-pink-400",
                };
                const domainClass = vectorColor[match.rowVector || ""] || "";
                return (
                <div key={i} className="p-3 rounded-md border hover-elevate transition-all duration-200 animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }} data-testid={`hunt-result-${i}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`text-[8px] ${
                      match.severity === "critical" ? "bg-red-600" :
                      match.severity === "high" ? "bg-orange-500" :
                      match.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"
                    } text-white`}>{match.severity}</Badge>
                    <Badge variant="outline" className={`text-[8px] ${domainClass}`}>
                      {match.rowVector || match.domain}
                    </Badge>
                    {match.source && (
                      <Badge variant="outline" className="text-[8px] text-muted-foreground max-w-[120px] truncate">{match.source}</Badge>
                    )}
                    {match.occurrenceCount > 1 && (
                      <Badge variant="secondary" className="text-[8px]" data-testid={`badge-occurrence-${i}`}>
                        <Layers className="w-2.5 h-2.5 mr-0.5" />
                        {match.occurrenceCount} occurrences
                      </Badge>
                    )}
                    <span className="text-xs flex-1 truncate font-medium">{match.title}</span>
                    {match.inv_status && (
                      <Badge variant="outline" className={`text-[8px] ${match.inv_status === "completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" : ""}`}>
                        {match.inv_status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-muted-foreground w-12 flex-shrink-0">Match</span>
                    <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div className={`h-full rounded-full animate-progress-fill ${
                        match.matchScore >= 80 ? "bg-gradient-to-r from-red-500 to-orange-500" :
                        match.matchScore >= 60 ? "bg-gradient-to-r from-orange-500 to-yellow-500" :
                        "bg-gradient-to-r from-blue-500 to-cyan-500"
                      }`} style={{ width: `${match.matchScore}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold w-8 text-right ${
                      match.matchScore >= 80 ? "text-red-500" :
                      match.matchScore >= 60 ? "text-orange-500" :
                      "text-blue-500"
                    }`}>{match.matchScore}%</span>
                  </div>
                  {match.matchReasons && match.matchReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {match.matchReasons.map((reason: string, j: number) => (
                        <Badge key={j} variant="outline" className={`text-[7px] ${getMatchReasonColor(reason)}`}>{reason}</Badge>
                      ))}
                    </div>
                  )}
                  {hasTimeline && (
                    <div className="mt-2">
                      <button
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-200"
                        onClick={() => {
                          const next = new Set(expandedHuntItems);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          setExpandedHuntItems(next);
                        }}
                        data-testid={`button-toggle-timeline-${i}`}
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Target Timeline ({match.targetTimeline.length} targets)
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 pl-3 border-l-2 border-muted space-y-1" data-testid={`timeline-${i}`}>
                          {match.targetTimeline.map((entry: any, k: number) => (
                            <div key={k} className="flex items-center gap-2 text-[10px]" data-testid={`timeline-entry-${i}-${k}`}>
                              <Badge className={`text-[7px] flex-shrink-0 ${
                                entry.severity === "critical" ? "bg-red-600" :
                                entry.severity === "high" ? "bg-orange-500" :
                                entry.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"
                              } text-white`}>{entry.severity}</Badge>
                              <span className="font-mono truncate flex-1">{entry.target}</span>
                              <span className="text-muted-foreground flex-shrink-0">{entry.timestamp ? fmt.formatDateTime(entry.timestamp) : "—"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {huntData && huntData.similar && huntData.similar.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">No similar threats found in the current dataset.</p>
          )}
        </CardContent>
      </Card>

      {inv.technical_report && (
        <div className="animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => setShowReport(!showReport)}
            data-testid="button-toggle-detail-report"
          >
            <ChevronRight className={`w-3.5 h-3.5 mr-1 transition-transform duration-200 ${showReport ? "rotate-90" : ""}`} />
            {showReport ? "Hide" : "Show"} Full Technical Report
          </Button>
          {showReport && (
            <div className="mt-3 p-5 bg-card border border-border/50 rounded-lg max-h-[600px] overflow-y-auto animate-fade-in-up shadow-sm" data-testid="text-detail-report">
              <RenderMarkdownReport content={inv.technical_report} />
            </div>
          )}
        </div>
      )}

      {steps.length > 0 && (
        <details className="text-xs animate-fade-in-up" style={{ animationDelay: "0.45s" }}>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium transition-colors duration-200" data-testid="toggle-audit-trail">
            Investigation Audit Trail ({steps.length} steps)
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l-2 border-muted">
            {steps.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-1" data-testid={`audit-step-${i}`}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{step.step}:</span>{" "}
                  <span className="text-muted-foreground">{step.action}</span>
                  {step.result && <p className="text-muted-foreground/70 mt-0.5">{step.result}</p>}
                  {step.timestamp && <p className="text-[9px] text-muted-foreground/50">{fmt.formatDateTime(step.timestamp)}</p>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {inv.status === "completed" && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.5s" }} data-testid="card-send-notification">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className={`w-4 h-4 ${domainCfg.color}`} />
              Send Notification
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter email address..."
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                data-testid="input-recipient-email"
              />
              <Button size="icon" variant="outline" onClick={addRecipient} data-testid="button-add-recipient">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] pl-2 pr-1 gap-1">
                    {r}
                    <button onClick={() => setRecipients(recipients.filter((_, j) => j !== i))} className="hover:text-destructive" data-testid={`button-remove-recipient-${i}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadPreview} className="text-xs" data-testid="button-preview-email">
                <Eye className="w-3.5 h-3.5 mr-1" /> Preview Email
              </Button>
              <Button
                size="sm"
                onClick={() => sendNotificationMutation.mutate(recipients)}
                disabled={recipients.length === 0 || sendNotificationMutation.isPending}
                className="text-xs"
                data-testid="button-send-notification"
              >
                {sendNotificationMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-3.5 h-3.5 mr-1" /> Send Notification</>
                )}
              </Button>
            </div>

            {(notificationsQuery.data || []).length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Notification History</p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {(notificationsQuery.data || []).map((notif: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-md border" data-testid={`notification-history-${i}`}>
                      <Badge variant="outline" className={`text-[8px] ${notif.status === "sent" ? "bg-green-500/10 text-green-700 dark:text-green-400" : notif.status === "draft" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                        {notif.status}
                      </Badge>
                      <Badge variant="outline" className="text-[8px]">{notif.domain}</Badge>
                      <span className="text-muted-foreground truncate flex-1">{(notif.recipients || []).join(", ") || "No recipients"}</span>
                      {notif.action_taken && <Badge variant="secondary" className="text-[8px]">{notif.action_taken}</Badge>}
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">{notif.sent_at ? fmt.formatDateTime(notif.sent_at) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {inv.status === "completed" && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "0.45s" }} data-testid="card-analyst-feedback">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className={`w-4 h-4 ${domainCfg.color}`} />
              Analyst Feedback
              {(feedbackQuery.data || []).length > 0 && (
                <Badge variant="outline" className="text-[9px]">{feedbackQuery.data?.length} submitted</Badge>
              )}
              {!showFeedbackForm && (
                <Button size="sm" variant="outline" className="ml-auto text-[10px] h-6" onClick={() => setShowFeedbackForm(true)} data-testid="button-provide-feedback">
                  <Plus className="w-3 h-3 mr-1" /> Provide Feedback
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {showFeedbackForm && (
              <div className="space-y-3 p-3 rounded-md border bg-muted/10 mb-3 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Feedback Type</label>
                    <Select value={feedbackType} onValueChange={setFeedbackType}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-feedback-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="verdict_correction">Verdict Correction</SelectItem>
                        <SelectItem value="severity_adjustment">Severity Adjustment</SelectItem>
                        <SelectItem value="fp_pattern_add">FP Pattern Add</SelectItem>
                        <SelectItem value="recommendation_quality">Recommendation Quality</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Override Verdict</label>
                    <Select value={feedbackVerdict} onValueChange={setFeedbackVerdict}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-verdict-override">
                        <SelectValue placeholder="No override" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agree">Agree with AI</SelectItem>
                        <SelectItem value="true_positive">True Positive</SelectItem>
                        <SelectItem value="false_positive">False Positive</SelectItem>
                        <SelectItem value="inconclusive">Inconclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Override Severity</label>
                    <Select value={feedbackSeverity} onValueChange={setFeedbackSeverity}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-severity-override">
                        <SelectValue placeholder="No override" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Notes</label>
                  <Textarea
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="Why do you agree or disagree with the AI's analysis?"
                    className="text-xs min-h-[60px]"
                    data-testid="textarea-feedback-notes"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowFeedbackForm(false)} data-testid="button-cancel-feedback">Cancel</Button>
                  <Button size="sm" className="text-xs h-7" onClick={submitFeedback} disabled={feedbackMutation.isPending} data-testid="button-submit-feedback">
                    {feedbackMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                    Submit Feedback
                  </Button>
                </div>
              </div>
            )}

            {(feedbackQuery.data || []).length > 0 && (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {(feedbackQuery.data || []).map((fb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2.5 rounded-md border" data-testid={`feedback-entry-${i}`}>
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-[8px]">{fb.feedback_type}</Badge>
                        {fb.verdict_override && (
                          <Badge className={`text-[8px] ${fb.verdict_override === "true_positive" ? "bg-red-600 text-white" : fb.verdict_override === "false_positive" ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>
                            → {fb.verdict_override.replace("_", " ")}
                          </Badge>
                        )}
                        {fb.severity_override && (
                          <Badge variant="outline" className="text-[8px]">Severity → {fb.severity_override}</Badge>
                        )}
                        <span className="text-[9px] text-muted-foreground ml-auto">{fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ""}</span>
                      </div>
                      {fb.feedback_notes && <p className="text-[10px] text-muted-foreground">{fb.feedback_notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(feedbackQuery.data || []).length === 0 && !showFeedbackForm && (
              <p className="text-xs text-muted-foreground">No feedback submitted yet. Your feedback helps improve AI accuracy.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>Preview of the notification email that will be sent</DialogDescription>
          </DialogHeader>
          <div className="border rounded-md p-1">
            <iframe srcDoc={previewHtml} className="w-full min-h-[500px] border-0" title="Email Preview" data-testid="iframe-email-preview" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Incident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close incident #{inv.incident_id}? This will mark the incident as resolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeIncidentMutation.mutate()} data-testid="button-confirm-close">
              {closeIncidentMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Close Incident
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFpDialog} onOpenChange={setShowFpDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report False Positive</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark incident #{inv.incident_id} as a false positive? This will close the incident and update its classification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => fpMutation.mutate()} data-testid="button-confirm-fp">
              {fpMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Mark as False Positive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
