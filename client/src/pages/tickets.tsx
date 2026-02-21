import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Ticket, Service } from "@shared/schema";
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3,
  ShieldAlert,
  Activity,
  Timer,
  Sparkles,
  Send,
  Bot,
  Star,
  Paperclip,
  Download,
  Upload,
  MessageCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-chart-4/10 text-chart-4",
  medium: "bg-chart-1/10 text-chart-1",
  low: "bg-chart-2/10 text-chart-2",
};

const STATUS_ICONS: Record<string, any> = {
  open: AlertCircle,
  in_progress: Loader2,
  waiting: Clock,
  resolved: CheckCircle2,
  closed: CheckCircle2,
};

function timeAgo(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function PriorityDonutChart({ tickets }: { tickets: Ticket[] }) {
  const counts = useMemo(() => {
    const c = { urgent: 0, high: 0, medium: 0, low: 0 };
    tickets.forEach((t) => {
      if (t.priority in c) c[t.priority as keyof typeof c]++;
    });
    return c;
  }, [tickets]);

  const total = tickets.length || 1;
  const segments = [
    { key: "urgent", color: "hsl(var(--destructive))", count: counts.urgent },
    { key: "high", color: "hsl(var(--chart-4))", count: counts.high },
    { key: "medium", color: "hsl(var(--chart-1))", count: counts.medium },
    { key: "low", color: "hsl(var(--chart-2))", count: counts.low },
  ];

  let cumulative = 0;
  const gradientParts: string[] = [];
  segments.forEach((seg) => {
    const pct = (seg.count / total) * 100;
    if (pct > 0) {
      gradientParts.push(`${seg.color} ${cumulative}% ${cumulative + pct}%`);
      cumulative += pct;
    }
  });

  const gradient = gradientParts.length > 0
    ? `conic-gradient(${gradientParts.join(", ")})`
    : "conic-gradient(hsl(var(--muted)) 0% 100%)";

  return (
    <div className="flex items-center gap-4" data-testid="chart-priority-donut">
      <div
        className="w-16 h-16 rounded-full shrink-0"
        style={{
          background: gradient,
          mask: "radial-gradient(farthest-side, transparent 60%, black 61%)",
          WebkitMask: "radial-gradient(farthest-side, transparent 60%, black 61%)",
        }}
      />
      <div className="space-y-1">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="capitalize text-muted-foreground">{seg.key}</span>
            <span className="font-medium">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityDashboard({ tickets, services }: { tickets: Ticket[]; services: Service[] }) {
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const waiting = tickets.filter((t) => t.status === "waiting").length;
    const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

    const respondedTickets = tickets.filter((t) => t.firstResponseAt && t.createdAt);
    let avgResponseMs = 0;
    if (respondedTickets.length > 0) {
      const totalMs = respondedTickets.reduce((sum, t) => {
        return sum + (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime());
      }, 0);
      avgResponseMs = totalMs / respondedTickets.length;
    }
    const avgResponseHours = Math.round(avgResponseMs / 3600000 * 10) / 10;

    const ticketsWithSlaData = tickets.filter((t) => t.slaBreached !== null && t.slaBreached !== undefined);
    const slaCompliant = ticketsWithSlaData.filter((t) => !t.slaBreached).length;
    const slaTotal = ticketsWithSlaData.length;
    const slaPct = slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 100) : 100;

    return { total, open, inProgress, waiting, resolved, avgResponseHours, slaPct, slaTotal };
  }, [tickets]);

  const statCards = [
    { label: "Total Tickets", value: stats.total, icon: BarChart3, color: "text-foreground" },
    { label: "Open", value: stats.open, icon: AlertCircle, color: "text-destructive" },
    { label: "In Progress", value: stats.inProgress, icon: Loader2, color: "text-chart-4" },
    { label: "Waiting", value: stats.waiting, icon: Clock, color: "text-chart-1" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-chart-2" },
    { label: "Avg Response", value: `${stats.avgResponseHours}h`, icon: Timer, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4" data-testid="section-activity-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-lg font-semibold mt-1">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card data-testid="card-priority-distribution">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Priority Distribution</p>
            <PriorityDonutChart tickets={tickets} />
          </CardContent>
        </Card>
        <Card data-testid="card-sla-compliance">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">SLA Compliance</p>
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={stats.slaPct >= 90 ? "hsl(var(--chart-2))" : stats.slaPct >= 70 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))"}
                    strokeWidth="3"
                    strokeDasharray={`${stats.slaPct}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold">{stats.slaPct}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {stats.slaPct >= 90 ? "On Track" : stats.slaPct >= 70 ? "Needs Attention" : "Critical"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.slaTotal > 0
                    ? `${stats.slaTotal - Math.round((stats.slaPct / 100) * stats.slaTotal)} of ${stats.slaTotal} tickets breached SLA`
                    : "No SLA data available"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  isMSS,
  onStatusChange,
  services,
  onAiResponse,
  onClick,
}: {
  ticket: Ticket;
  isMSS: boolean;
  onStatusChange: (id: number, status: string) => void;
  services: Service[];
  onAiResponse?: (ticketId: number) => void;
  onClick?: () => void;
}) {
  const Icon = STATUS_ICONS[ticket.status] || AlertCircle;
  const serviceName = ticket.serviceId
    ? services.find((s) => s.id === ticket.serviceId)?.name
    : null;

  return (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid={`card-ticket-${ticket.id}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${
              ticket.status === "open" ? "bg-destructive/10" :
              ticket.status === "in_progress" ? "bg-chart-4/10" :
              "bg-chart-2/10"
            }`}>
              <Icon className={`w-4 h-4 ${
                ticket.status === "open" ? "text-destructive" :
                ticket.status === "in_progress" ? "text-chart-4" :
                "text-chart-2"
              }`} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground">TKT-{String(ticket.id).padStart(4, "0")}</span>
                <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[ticket.priority]}`}>
                  {ticket.priority}
                </Badge>
                {ticket.slaBreached && (
                  <Badge variant="destructive" className="text-[10px]" data-testid={`badge-sla-breached-${ticket.id}`}>
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    SLA Breached
                  </Badge>
                )}
                {serviceName && (
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-service-${ticket.id}`}>
                    {serviceName}
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-medium truncate">{ticket.title}</h3>
              {ticket.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
              )}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
                {ticket.category && (
                  <Badge variant="secondary" className="text-[10px]">{ticket.category}</Badge>
                )}
                {ticket.firstResponseAt && (
                  <span className="text-[10px] text-muted-foreground" data-testid={`text-first-response-${ticket.id}`}>
                    First Response: {timeAgo(ticket.firstResponseAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {isMSS && (
            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                title="AI Response"
                onClick={() => onAiResponse?.(ticket.id)}
                data-testid={`button-ai-response-${ticket.id}`}
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
              </Button>
              <Select
                value={ticket.status}
                onValueChange={(status) => onStatusChange(ticket.id, status)}
              >
                <SelectTrigger className="h-7 text-[10px] w-[110px]" data-testid={`select-status-${ticket.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function deriveSentiment(rating: number): string {
  if (rating <= 2) return "negative";
  if (rating === 3) return "neutral";
  return "positive";
}

function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  services,
}: {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newComment, setNewComment] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");

  const serviceName = ticket.serviceId
    ? services.find((s) => s.id === ticket.serviceId)?.name
    : null;

  const { data: comments = [], isLoading: commentsLoading } = useQuery<any[]>({
    queryKey: ["/api/tickets", ticket.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: open,
  });

  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/tickets", ticket.id, "attachments"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch attachments");
      return res.json();
    },
    enabled: open,
  });

  const isFeedbackVisible = ticket.status === "closed" || ticket.status === "resolved";

  const { data: existingFeedback, isLoading: feedbackLoading } = useQuery<any>({
    queryKey: ["/api/tickets", ticket.id, "feedback"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticket.id}/feedback`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch feedback");
      }
      return res.json();
    },
    enabled: open && isFeedbackVisible,
  });

  const postCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/tickets/${ticket.id}/comments`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id, "comments"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id, "attachments"] });
      toast({ title: "File uploaded" });
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: { rating: number; sentiment: string; comments: string }) => {
      const res = await apiRequest("POST", `/api/tickets/${ticket.id}/feedback`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id, "feedback"] });
      setFeedbackRating(0);
      setFeedbackComment("");
      toast({ title: "Feedback submitted", description: "Thank you for your feedback." });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAttachmentMutation.mutate(file);
      e.target.value = "";
    }
  };

  const StatusIcon = STATUS_ICONS[ticket.status] || AlertCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid={`dialog-ticket-detail-${ticket.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">TKT-{String(ticket.id).padStart(4, "0")}</span>
            <span>{ticket.title}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[ticket.priority]}`} data-testid={`badge-detail-priority-${ticket.id}`}>
                  {ticket.priority}
                </Badge>
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-detail-status-${ticket.id}`}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {ticket.status.replace("_", " ")}
                </Badge>
                {serviceName && (
                  <Badge variant="secondary" className="text-[10px]">{serviceName}</Badge>
                )}
                {ticket.slaBreached && (
                  <Badge variant="destructive" className="text-[10px]">
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    SLA Breached
                  </Badge>
                )}
              </div>
              {ticket.description && (
                <p className="text-sm text-muted-foreground" data-testid={`text-detail-description-${ticket.id}`}>{ticket.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span data-testid={`text-detail-created-${ticket.id}`}>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
                {ticket.updatedAt && <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>}
                {ticket.firstResponseAt && <span>First Response: {timeAgo(ticket.firstResponseAt)}</span>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Comments</h3>
              </div>
              {commentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((comment: any, idx: number) => (
                    <Card key={comment.id || idx} data-testid={`card-comment-${comment.id || idx}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{comment.authorName || comment.author || "User"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{comment.content || comment.text || comment.body}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="text-sm flex-1"
                  data-testid={`textarea-new-comment-${ticket.id}`}
                />
                <Button
                  size="sm"
                  disabled={!newComment.trim() || postCommentMutation.isPending}
                  onClick={() => postCommentMutation.mutate(newComment.trim())}
                  data-testid={`button-post-comment-${ticket.id}`}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Attachments</h3>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    data-testid={`input-file-upload-${ticket.id}`}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={uploadAttachmentMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid={`button-upload-attachment-${ticket.id}`}
                  >
                    {uploadAttachmentMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Upload
                  </Button>
                </div>
              </div>
              {attachmentsLoading ? (
                <Skeleton className="h-10" />
              ) : attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attachments.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att: any, idx: number) => (
                    <div
                      key={att.id || idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border"
                      data-testid={`attachment-item-${att.id || idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs truncate">{att.filename || att.name || `File ${idx + 1}`}</span>
                      </div>
                      <a
                        href={att.url || att.downloadUrl || `/api/tickets/${ticket.id}/attachments/${att.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-download-attachment-${att.id || idx}`}
                      >
                        <Button variant="ghost" size="icon">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isFeedbackVisible && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Customer Feedback</h3>
                </div>
                {feedbackLoading ? (
                  <Skeleton className="h-16" />
                ) : existingFeedback && existingFeedback.rating ? (
                  <Card data-testid={`card-existing-feedback-${ticket.id}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${star <= existingFeedback.rating ? "text-chart-1 fill-chart-1" : "text-muted-foreground"}`}
                            data-testid={`star-existing-${ticket.id}-${star}`}
                          />
                        ))}
                        <Badge variant="secondary" className="ml-2 text-[10px]">{existingFeedback.sentiment}</Badge>
                      </div>
                      {existingFeedback.comments && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-existing-feedback-comment-${ticket.id}`}>{existingFeedback.comments}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">Feedback already submitted</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1" data-testid={`rating-stars-${ticket.id}`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-0.5"
                          data-testid={`button-star-${ticket.id}-${star}`}
                        >
                          <Star
                            className={`w-5 h-5 transition-colors ${star <= feedbackRating ? "text-chart-1 fill-chart-1" : "text-muted-foreground"}`}
                          />
                        </button>
                      ))}
                      {feedbackRating > 0 && (
                        <span className="text-xs text-muted-foreground ml-2">{deriveSentiment(feedbackRating)}</span>
                      )}
                    </div>
                    <Textarea
                      placeholder="Share your feedback..."
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      rows={2}
                      className="text-sm"
                      data-testid={`textarea-feedback-${ticket.id}`}
                    />
                    <Button
                      size="sm"
                      disabled={feedbackRating === 0 || submitFeedbackMutation.isPending}
                      onClick={() =>
                        submitFeedbackMutation.mutate({
                          rating: feedbackRating,
                          sentiment: deriveSentiment(feedbackRating),
                          comments: feedbackComment,
                        })
                      }
                      data-testid={`button-submit-feedback-${ticket.id}`}
                    >
                      {submitFeedbackMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Submit Feedback
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function TicketsPage() {
  const { currentTenant, userRole, isMSS } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("open");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [createServiceId, setCreateServiceId] = useState<string>("");
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiResponseDialogOpen, setAiResponseDialogOpen] = useState(false);
  const [aiResponseTicketId, setAiResponseTicketId] = useState<number | null>(null);
  const [aiResponseText, setAiResponseText] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tickets", { ...data, tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setDialogOpen(false);
      setCreateServiceId("");
      setAiSuggestion(null);
      toast({ title: "Ticket created", description: "Your support ticket has been submitted." });
    },
  });

  const aiSuggestMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await apiRequest("POST", "/api/ai/ticket-suggest", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAiSuggestion(data);
    },
  });

  const aiResponseMutation = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await apiRequest("POST", "/api/ai/ticket-response", { ticketId });
      return res.json();
    },
    onSuccess: (data) => {
      setAiResponseText(data.response || "");
    },
  });

  const submitCommentMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: number; content: string }) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/comments`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setAiResponseDialogOpen(false);
      setAiResponseText("");
      setAiResponseTicketId(null);
      toast({ title: "Response sent" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/tickets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    },
  });

  const filteredByService = serviceFilter === "all"
    ? tickets
    : tickets.filter((t) => t.serviceId === parseInt(serviceFilter));

  const filteredByTab = filteredByService.filter((t) => {
    if (activeTab === "open") return t.status === "open" || t.status === "in_progress";
    if (activeTab === "waiting") return t.status === "waiting";
    if (activeTab === "resolved") return t.status === "resolved" || t.status === "closed";
    return true;
  });

  const filtered = filteredByTab.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = filteredByService.filter(t => t.status === "open" || t.status === "in_progress").length;
  const waitingCount = filteredByService.filter(t => t.status === "waiting").length;
  const resolvedCount = filteredByService.filter(t => t.status === "resolved" || t.status === "closed").length;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload: any = {
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      category: formData.get("category"),
    };
    if (createServiceId && createServiceId !== "none") {
      payload.serviceId = parseInt(createServiceId);
    }
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Support Tickets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- {tickets.length} total tickets
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-create-ticket">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-title">Subject</Label>
                <Input id="ticket-title" name="title" required data-testid="input-ticket-title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-desc">Description</Label>
                <Textarea id="ticket-desc" name="description" rows={4} data-testid="input-ticket-description" />
              </div>

              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">AI Smart Suggestions</span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      disabled={aiSuggestMutation.isPending}
                      onClick={() => {
                        const form = document.querySelector("form");
                        const title = (form?.querySelector('[name="title"]') as HTMLInputElement)?.value || "";
                        const desc = (form?.querySelector('[name="description"]') as HTMLTextAreaElement)?.value || "";
                        if (title) aiSuggestMutation.mutate({ title, description: desc });
                      }}
                      data-testid="button-ai-suggest"
                    >
                      {aiSuggestMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      {aiSuggestMutation.isPending ? "Analyzing..." : "Analyze"}
                    </Button>
                  </div>
                  {aiSuggestion && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Suggested Priority:</span>
                        <Badge variant="outline" className={PRIORITY_STYLES[aiSuggestion.suggestedPriority] || ""}>{aiSuggestion.suggestedPriority}</Badge>
                        <span className="text-muted-foreground">Category:</span>
                        <Badge variant="outline">{aiSuggestion.suggestedCategory}</Badge>
                      </div>
                      {aiSuggestion.reasoning && (
                        <p className="text-[10px] text-muted-foreground"><Bot className="w-3 h-3 inline mr-1" />{aiSuggestion.reasoning}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue={aiSuggestion?.suggestedPriority || "medium"} key={aiSuggestion?.suggestedPriority || "default"}>
                    <SelectTrigger data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue={aiSuggestion?.suggestedCategory || "general"} key={aiSuggestion?.suggestedCategory || "default"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="incident">Incident</SelectItem>
                      <SelectItem value="access">Access Request</SelectItem>
                      <SelectItem value="configuration">Configuration</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Service (Optional)</Label>
                <Select value={createServiceId} onValueChange={setCreateServiceId}>
                  <SelectTrigger data-testid="select-ticket-service">
                    <SelectValue placeholder="No service linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No service linked</SelectItem>
                    {services.map((svc) => (
                      <SelectItem key={svc.id} value={String(svc.id)}>
                        {svc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-ticket">
                {createMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ActivityDashboard tickets={tickets} services={services} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-service-filter">
            <SelectValue placeholder="All Services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {services.map((svc) => (
              <SelectItem key={svc.id} value={String(svc.id)}>
                {svc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open">
            Open ({openCount})
          </TabsTrigger>
          <TabsTrigger value="waiting" data-testid="tab-waiting">
            Waiting ({waitingCount})
          </TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">
            Resolved ({resolvedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No tickets found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search ? "Try adjusting your search" : `No ${activeTab} tickets at the moment`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isMSS={isMSS}
                  onStatusChange={(id, status) => updateMutation.mutate({ id, status })}
                  services={services}
                  onAiResponse={(ticketId) => {
                    setAiResponseTicketId(ticketId);
                    setAiResponseText("");
                    setAiResponseDialogOpen(true);
                    aiResponseMutation.mutate(ticketId);
                  }}
                  onClick={() => setDetailTicket(ticket)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={aiResponseDialogOpen} onOpenChange={setAiResponseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              AI-Generated Response
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {aiResponseMutation.isPending ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
                <span className="text-sm text-muted-foreground">Generating response...</span>
              </div>
            ) : (
              <>
                <Textarea
                  value={aiResponseText}
                  onChange={(e) => setAiResponseText(e.target.value)}
                  rows={6}
                  className="text-sm"
                  data-testid="textarea-ai-response"
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={!aiResponseText || submitCommentMutation.isPending}
                    onClick={() => {
                      if (aiResponseTicketId && aiResponseText) {
                        submitCommentMutation.mutate({ ticketId: aiResponseTicketId, content: aiResponseText });
                      }
                    }}
                    data-testid="button-send-ai-response"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {submitCommentMutation.isPending ? "Sending..." : "Send Response"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={aiResponseMutation.isPending}
                    onClick={() => {
                      if (aiResponseTicketId) aiResponseMutation.mutate(aiResponseTicketId);
                    }}
                    data-testid="button-regenerate-response"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {detailTicket && (
        <TicketDetailDialog
          ticket={detailTicket}
          open={!!detailTicket}
          onOpenChange={(open) => { if (!open) setDetailTicket(null); }}
          services={services}
        />
      )}
    </div>
  );
}
