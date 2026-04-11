import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Bell, AlertTriangle, Info, AlertCircle, FileText, Shield,
  Check, CheckCheck, Trash2, ExternalLink, Clock, Tag, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

function timeAgo(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isToday(date: string | Date): boolean {
  const d = new Date(date);
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
}

interface NotificationItem {
  id: number;
  tenantId: number;
  type: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

// Severity config for visual treatment
const SEVERITY_CONFIG: Record<string, {
  leftBar: string;
  iconBg: string;
  iconColor: string;
  dotColor: string;
  rowBg: string;
  pulseDot: boolean;
}> = {
  critical: {
    leftBar: "bg-red-500",
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    dotColor: "bg-red-500",
    rowBg: "bg-red-500/5",
    pulseDot: true,
  },
  warning: {
    leftBar: "bg-amber-500",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    dotColor: "bg-amber-500",
    rowBg: "bg-amber-500/5",
    pulseDot: false,
  },
  info: {
    leftBar: "bg-blue-500",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    dotColor: "bg-blue-500",
    rowBg: "",
    pulseDot: false,
  },
  low: {
    leftBar: "bg-slate-400",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    dotColor: "bg-slate-400",
    rowBg: "",
    pulseDot: false,
  },
};

function getTypeIcon(type: string, className: string) {
  switch (type) {
    case "incident": return <Shield className={className} />;
    case "report": return <FileText className={className} />;
    case "sla": return <Clock className={className} />;
    case "ticket": return <Tag className={className} />;
    case "event": return <Activity className={className} />;
    default: return <Info className={className} />;
  }
}

function NotificationRow({
  n,
  onMarkRead,
  onDelete,
}: {
  n: NotificationItem;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const sev = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info;

  return (
    <div
      className={`relative flex items-stretch overflow-hidden transition-colors hover:bg-muted/40 ${!n.read ? sev.rowBg : ""}`}
      data-testid={`notification-item-${n.id}`}
    >
      {/* Severity left bar */}
      <div className={`w-1 shrink-0 ${sev.leftBar}`} />

      <div className="flex-1 flex items-start gap-3 px-3 py-3 min-w-0">
        {/* Type icon badge */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${sev.iconBg}`}>
          {getTypeIcon(n.type, `w-4 h-4 ${sev.iconColor}`)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[12px] font-semibold text-foreground truncate">{n.title}</span>
              {!n.read && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${sev.dotColor} ${sev.pulseDot ? "animate-pulse" : ""}`} />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{timeAgo(n.createdAt)}</span>
          </div>

          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{n.message}</p>

          <div className="flex items-center gap-2 mt-1.5">
            <Badge
              variant="outline"
              className={`text-[9px] h-4 px-1.5 border-0 font-semibold uppercase tracking-wide ${sev.iconBg} ${sev.iconColor}`}
            >
              {n.severity}
            </Badge>
            <Badge variant="outline" className="text-[9px] h-4 gap-0.5 px-1.5 text-muted-foreground">
              {n.type}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {n.actionUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.location.href = n.actionUrl!;
                if (!n.read) onMarkRead(n.id);
              }}
              data-testid={`notification-action-${n.id}`}
              title="Go to item"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
          {!n.read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onMarkRead(n.id)}
              data-testid={`notification-read-${n.id}`}
              title="Mark as read"
            >
              <Check className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(n.id)}
            data-testid={`notification-delete-${n.id}`}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b border-border">
      <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[9px] text-muted-foreground/60">({count})</span>
    </div>
  );
}

export function NotificationCenter({ tenantId }: { tenantId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ notifications: NotificationItem[]; unreadCount: number }>({
    queryKey: ["/api/notifications", tenantId],
    refetchInterval: 30000,
    enabled: !!tenantId,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", tenantId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/notifications/${tenantId}/read-all`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", tenantId] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", tenantId] }),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const todayItems = notifications.filter(n => isToday(n.createdAt));
  const earlierItems = notifications.filter(n => !isToday(n.createdAt));

  const criticalCount = notifications.filter(n => n.severity === "critical" && !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="btn-notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${criticalCount > 0 ? "bg-red-500 animate-pulse" : "bg-primary"}`}
              data-testid="notification-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[420px] p-0 shadow-xl" align="end" data-testid="notification-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Badge
                className={`text-[10px] h-5 min-w-5 px-1.5 font-bold ${criticalCount > 0 ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"}`}
                data-testid="notification-header-badge"
              >
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="btn-mark-all-read"
              >
                <CheckCheck className="w-3 h-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Critical banner if any */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold text-red-500">
              {criticalCount} critical alert{criticalCount !== 1 ? "s" : ""} require immediate attention
            </span>
          </div>
        )}

        <ScrollArea className="max-h-[480px]">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center" data-testid="notification-empty">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-muted-foreground opacity-50" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">All clear</p>
              <p className="text-[12px] text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div>
              {todayItems.length > 0 && (
                <>
                  <GroupLabel label="Today" count={todayItems.length} />
                  <div className="divide-y divide-border/50">
                    {todayItems.map(n => (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        onMarkRead={id => markReadMutation.mutate(id)}
                        onDelete={id => deleteMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </>
              )}
              {earlierItems.length > 0 && (
                <>
                  <GroupLabel label="Earlier" count={earlierItems.length} />
                  <div className="divide-y divide-border/50">
                    {earlierItems.map(n => (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        onMarkRead={id => markReadMutation.mutate(id)}
                        onDelete={id => deleteMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2.5 bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{notifications.length} total · {unreadCount} unread</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
