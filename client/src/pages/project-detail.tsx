import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  Project,
  Task as ProjectTask,
  ProjectScope,
  ProjectActivity,
  ProjectRaci,
  ProjectRisk,
  ActivityLog,
  TeamMember,
} from "@shared/schema";
import {
  ArrowLeft,
  Plus,
  CalendarDays,
  Clock,
  CheckCircle2,
  Loader2,
  User,
  BarChart3,
  ListChecks,
  Target,
  AlertTriangle,
  Shield,
  FileText,
  Trash2,
  Edit,
  Activity,
  Users,
  ClipboardList,
  Sparkles,
  ChevronRight,
  GripVertical,
  FolderKanban,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const KANBAN_COLUMNS = [
  { id: "backlog", label: "Backlog", color: "bg-muted" },
  { id: "todo", label: "To Do", color: "bg-chart-1/10" },
  { id: "in_progress", label: "In Progress", color: "bg-chart-4/10" },
  { id: "review", label: "Review", color: "bg-chart-3/10" },
  { id: "done", label: "Done", color: "bg-chart-2/10" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-chart-4",
  medium: "bg-chart-1",
  low: "bg-chart-2",
};

const STATUS_STYLES: Record<string, string> = {
  planning: "bg-chart-1/10 text-chart-1",
  active: "bg-chart-2/10 text-chart-2",
  on_hold: "bg-chart-4/10 text-chart-4",
  completed: "bg-chart-2/10 text-chart-2",
  cancelled: "bg-destructive/10 text-destructive",
};

const ACTIVITY_STATUS_STYLES: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-chart-4/10 text-chart-4",
  completed: "bg-chart-2/10 text-chart-2",
  delayed: "bg-destructive/10 text-destructive",
  blocked: "bg-destructive/10 text-destructive",
};

const RISK_STATUS_STYLES: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  mitigating: "bg-chart-4/10 text-chart-4",
  accepted: "bg-chart-1/10 text-chart-1",
  closed: "bg-chart-2/10 text-chart-2",
};

const PROBABILITY_MAP: Record<string, number> = {
  very_low: 1, low: 2, medium: 3, high: 4, very_high: 5,
};
const IMPACT_MAP: Record<string, number> = {
  negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5,
};

const PROBABILITY_STYLES: Record<string, string> = {
  very_low: "bg-chart-2/10 text-chart-2",
  low: "bg-chart-2/10 text-chart-2",
  medium: "bg-chart-1/10 text-chart-1",
  high: "bg-chart-4/10 text-chart-4",
  very_high: "bg-destructive/10 text-destructive",
};

const IMPACT_STYLES: Record<string, string> = {
  negligible: "bg-chart-2/10 text-chart-2",
  minor: "bg-chart-2/10 text-chart-2",
  moderate: "bg-chart-1/10 text-chart-1",
  major: "bg-chart-4/10 text-chart-4",
  severe: "bg-destructive/10 text-destructive",
};

const RACI_COLORS: Record<string, string> = {
  responsible: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accountable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  consulted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  informed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const RACI_LABELS: Record<string, string> = {
  responsible: "R",
  accountable: "A",
  consulted: "C",
  informed: "I",
};

const RACI_CYCLE = ["responsible", "accountable", "consulted", "informed"] as const;


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

function OverviewTab({
  project,
  tasks,
  scopeItems,
  risks,
}: {
  project: Project;
  tasks: ProjectTask[];
  scopeItems: ProjectScope[];
  risks: ProjectRisk[];
}) {
  const fmt = useTenantDateFormatter();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const openRisks = risks.filter((r) => r.status === "open" || r.status === "mitigating").length;

  const now = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  let timelinePct = 0;
  if (start && end && end > start) {
    timelinePct = Math.min(100, Math.max(0, Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)));
  }

  const stats = [
    { label: "Total Tasks", value: totalTasks, icon: ListChecks },
    { label: "Completed", value: doneTasks, icon: CheckCircle2 },
    { label: "In Progress", value: inProgressTasks, icon: Loader2 },
    { label: "Completion", value: `${pct}%`, icon: BarChart3 },
    { label: "Open Risks", value: openRisks, icon: AlertTriangle },
    { label: "Scope Items", value: scopeItems.length, icon: Target },
  ];

  return (
    <div className="space-y-6" data-testid="tab-overview">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
                <stat.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-project-info">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-1">
                  <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[project.status] || ""}`} data-testid="badge-project-status">
                    {project.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Owner</span>
                <p className="mt-1 text-sm">{project.ownerId || "Unassigned"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Start Date</span>
                <p className="mt-1 text-sm">{fmt.formatDate(project.startDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">End Date</span>
                <p className="mt-1 text-sm">{fmt.formatDate(project.endDate)}</p>
              </div>
            </div>
            {project.description && (
              <div>
                <span className="text-xs text-muted-foreground">Description</span>
                <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-project-progress">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Task Completion</span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {start && end && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Timeline</span>
                  <span className="font-medium">{timelinePct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${timelinePct > pct + 20 ? "bg-destructive" : "bg-chart-4"}`}
                    style={{ width: `${timelinePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                  <span>{fmt.formatDate(project.startDate)}</span>
                  <span>{fmt.formatDate(project.endDate)}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-1">
              {KANBAN_COLUMNS.map((col) => {
                const count = tasks.filter((t) => t.status === col.id).length;
                return (
                  <div key={col.id} className="text-center">
                    <p className="text-lg font-semibold">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{col.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScopeTab({
  projectId,
  scopeItems,
  isMSS,
}: {
  projectId: number;
  scopeItems: ProjectScope[];
  isMSS: boolean;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProjectScope | null>(null);
  const [scopeType, setScopeType] = useState<"inclusion" | "exclusion">("inclusion");

  const inclusions = scopeItems.filter((s) => s.scopeType === "inclusion");
  const exclusions = scopeItems.filter((s) => s.scopeType === "exclusion");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/project-scope", { ...data, projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-scope", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Scope item created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/project-scope/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-scope", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Scope item updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-scope/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-scope", projectId] });
      toast({ title: "Scope item deleted" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      scopeType: fd.get("scopeType") as string,
      sortOrder: 0,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const renderColumn = (title: string, items: ProjectScope[], type: "inclusion" | "exclusion") => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
        </div>
        {isMSS && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditItem(null); setScopeType(type); setDialogOpen(true); }}
            data-testid={`button-add-scope-${type}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No {type}s defined</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} data-testid={`card-scope-${item.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    )}
                  </div>
                  {isMSS && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditItem(item); setScopeType(item.scopeType as "inclusion" | "exclusion"); setDialogOpen(true); }}
                        data-testid={`button-edit-scope-${item.id}`}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(item.id)}
                        data-testid={`button-delete-scope-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="tab-scope">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderColumn("Inclusions", inclusions, "inclusion")}
        {renderColumn("Exclusions", exclusions, "exclusion")}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Scope Item" : "Add Scope Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scope-title">Title</Label>
              <Input id="scope-title" name="title" required defaultValue={editItem?.title || ""} data-testid="input-scope-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-desc">Description</Label>
              <Textarea id="scope-desc" name="description" defaultValue={editItem?.description || ""} data-testid="input-scope-description" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="scopeType" defaultValue={editItem?.scopeType || scopeType}>
                <SelectTrigger data-testid="select-scope-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inclusion">Inclusion</SelectItem>
                  <SelectItem value="exclusion">Exclusion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-scope">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editItem ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivitiesTab({
  projectId,
  activities,
  activityLogs,
  isMSS,
}: {
  projectId: number;
  activities: ProjectActivity[];
  activityLogs: ActivityLog[];
  isMSS: boolean;
}) {
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProjectActivity | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/project-activities", { ...data, projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Activity created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/project-activities/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Activity updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-activities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities", projectId] });
      toast({ title: "Activity deleted" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startDate = fd.get("startDate") as string;
    const endDate = fd.get("endDate") as string;
    const payload = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      status: fd.get("status") as string,
      percentComplete: parseInt(fd.get("percentComplete") as string) || 0,
      assignedTo: fd.get("assignedTo") as string || undefined,
      ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
      ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
      sortOrder: 0,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-6" data-testid="tab-activities">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Activities ({activities.length})</h3>
        {isMSS && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditItem(null); setDialogOpen(true); }}
            data-testid="button-add-activity"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Activity
          </Button>
        )}
      </div>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No activities defined yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activities.map((act) => (
            <Card key={act.id} data-testid={`card-activity-${act.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{act.title}</p>
                      <Badge variant="secondary" className={`text-[10px] ${ACTIVITY_STATUS_STYLES[act.status] || ""}`}>
                        {act.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {act.description && (
                      <p className="text-xs text-muted-foreground">{act.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{act.percentComplete || 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${act.percentComplete || 0}%` }} />
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
                      {act.assignedTo && (
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{act.assignedTo}</span>
                      )}
                      {act.startDate && (
                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Start: {fmt.formatDate(act.startDate)}</span>
                      )}
                      {act.endDate && (
                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />End: {fmt.formatDate(act.endDate)}</span>
                      )}
                    </div>
                  </div>
                  {isMSS && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditItem(act); setDialogOpen(true); }}
                        data-testid={`button-edit-activity-${act.id}`}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(act.id)}
                        data-testid={`button-delete-activity-${act.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activityLogs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Recent Activity Log</h3>
          <Card>
            <CardContent className="p-3">
              <div className="space-y-2">
                {activityLogs.slice(0, 20).map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs" data-testid={`log-entry-${log.id}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm">{log.description}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt.formatRelative(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Activity" : "Add Activity"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="act-title">Title</Label>
              <Input id="act-title" name="title" required defaultValue={editItem?.title || ""} data-testid="input-activity-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-desc">Description</Label>
              <Textarea id="act-desc" name="description" defaultValue={editItem?.description || ""} data-testid="input-activity-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue={editItem?.status || "not_started"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="act-pct">% Complete</Label>
                <Input id="act-pct" name="percentComplete" type="number" min="0" max="100" defaultValue={editItem?.percentComplete || 0} data-testid="input-activity-percent" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-assigned">Assigned To</Label>
              <Input id="act-assigned" name="assignedTo" defaultValue={editItem?.assignedTo || ""} data-testid="input-activity-assigned" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="act-start">Start Date</Label>
                <Input id="act-start" name="startDate" type="date" defaultValue={editItem?.startDate ? new Date(editItem.startDate).toISOString().split("T")[0] : ""} data-testid="input-activity-start" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="act-end">End Date</Label>
                <Input id="act-end" name="endDate" type="date" defaultValue={editItem?.endDate ? new Date(editItem.endDate).toISOString().split("T")[0] : ""} data-testid="input-activity-end" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-activity">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editItem ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RaciTab({
  projectId,
  activities,
  raciEntries,
  teamMembers,
  isMSS,
}: {
  projectId: number;
  activities: ProjectActivity[];
  raciEntries: ProjectRaci[];
  teamMembers: TeamMember[];
  isMSS: boolean;
}) {
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { activityId: number; teamMemberId: number; raciType: string }) => {
      const res = await apiRequest("POST", "/api/project-raci", { ...data, projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-raci", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-raci/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-raci", projectId] });
    },
  });

  const getRaci = (activityId: number, memberId: number) => {
    return raciEntries.find((r) => r.activityId === activityId && r.teamMemberId === memberId);
  };

  const handleCellClick = (activityId: number, memberId: number) => {
    if (!isMSS) return;
    const current = getRaci(activityId, memberId);
    if (!current) {
      createMutation.mutate({ activityId, teamMemberId: memberId, raciType: "responsible" });
    } else {
      const idx = RACI_CYCLE.indexOf(current.raciType as typeof RACI_CYCLE[number]);
      if (idx < RACI_CYCLE.length - 1) {
        deleteMutation.mutate(current.id);
        createMutation.mutate({ activityId, teamMemberId: memberId, raciType: RACI_CYCLE[idx + 1] });
      } else {
        deleteMutation.mutate(current.id);
      }
    }
  };

  if (activities.length === 0 || teamMembers.length === 0) {
    return (
      <div data-testid="tab-raci">
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {activities.length === 0 ? "Add activities first to create a RACI matrix" : "No team members found"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="tab-raci">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs text-muted-foreground">Legend:</span>
        {RACI_CYCLE.map((type) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium ${RACI_COLORS[type]}`}>
              {RACI_LABELS[type]}
            </span>
            <span className="text-xs text-muted-foreground capitalize">{type}</span>
          </div>
        ))}
        {isMSS && <span className="text-[10px] text-muted-foreground ml-auto">Click cells to cycle R → A → C → I → clear</span>}
      </div>

      <ScrollArea className="w-full">
        <div className="min-w-[600px]">
          <div className="grid" style={{ gridTemplateColumns: `200px repeat(${teamMembers.length}, minmax(80px, 1fr))` }}>
            <div className="p-2 text-xs font-medium text-muted-foreground border-b">Activity</div>
            {teamMembers.map((m) => (
              <div key={m.id} className="p-2 text-xs font-medium text-center border-b truncate" title={m.name}>
                {m.name.split(" ")[0]}
              </div>
            ))}

            {activities.map((act) => (
              <>
                <div key={`act-${act.id}`} className="p-2 text-xs border-b flex items-center gap-1">
                  <span className="truncate">{act.title}</span>
                </div>
                {teamMembers.map((m) => {
                  const raci = getRaci(act.id, m.id);
                  return (
                    <div
                      key={`${act.id}-${m.id}`}
                      className={`p-2 text-center border-b ${isMSS ? "cursor-pointer hover-elevate" : ""}`}
                      onClick={() => handleCellClick(act.id, m.id)}
                      data-testid={`raci-cell-${act.id}-${m.id}`}
                    >
                      {raci && (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold ${RACI_COLORS[raci.raciType] || ""}`}>
                          {RACI_LABELS[raci.raciType] || "?"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function RiskRegisterTab({
  projectId,
  risks,
  isMSS,
}: {
  projectId: number;
  risks: ProjectRisk[];
  isMSS: boolean;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProjectRisk | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/project-risks", { ...data, projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-risks", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Risk created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/project-risks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-risks", projectId] });
      setDialogOpen(false);
      setEditItem(null);
      toast({ title: "Risk updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-risks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-risks", projectId] });
      toast({ title: "Risk deleted" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      probability: fd.get("probability") as string,
      impact: fd.get("impact") as string,
      status: fd.get("status") as string,
      mitigation: fd.get("mitigation") as string,
      owner: fd.get("owner") as string,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const calcRiskScore = (prob: string, impact: string) => {
    return (PROBABILITY_MAP[prob] || 3) * (IMPACT_MAP[impact] || 3) * 4;
  };

  const getRiskScoreColor = (score: number) => {
    if (score >= 60) return "text-destructive";
    if (score >= 36) return "text-chart-4";
    if (score >= 16) return "text-chart-1";
    return "text-chart-2";
  };

  return (
    <div className="space-y-4" data-testid="tab-risks">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Risk Register ({risks.length})</h3>
        {isMSS && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditItem(null); setDialogOpen(true); }}
            data-testid="button-add-risk"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Risk
          </Button>
        )}
      </div>

      {risks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No risks identified yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {risks.map((risk) => {
            const score = calcRiskScore(risk.probability, risk.impact);
            return (
              <Card key={risk.id} data-testid={`card-risk-${risk.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{risk.title}</p>
                        <Badge variant="secondary" className={`text-[10px] ${RISK_STATUS_STYLES[risk.status] || ""}`}>
                          {risk.status}
                        </Badge>
                      </div>
                      {risk.description && (
                        <p className="text-xs text-muted-foreground">{risk.description}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Probability:</span>
                          <Badge variant="outline" className={`text-[10px] ${PROBABILITY_STYLES[risk.probability] || ""}`}>
                            {risk.probability.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Impact:</span>
                          <Badge variant="outline" className={`text-[10px] ${IMPACT_STYLES[risk.impact] || ""}`}>
                            {risk.impact}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Score:</span>
                          <span className={`text-sm font-bold ${getRiskScoreColor(score)}`}>{score}</span>
                        </div>
                      </div>
                      {risk.mitigation && (
                        <div>
                          <span className="text-[10px] text-muted-foreground">Mitigation:</span>
                          <p className="text-xs mt-0.5">{risk.mitigation}</p>
                        </div>
                      )}
                      {risk.owner && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" />Owner: {risk.owner}
                        </span>
                      )}
                    </div>
                    {isMSS && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditItem(risk); setDialogOpen(true); }}
                          data-testid={`button-edit-risk-${risk.id}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(risk.id)}
                          data-testid={`button-delete-risk-${risk.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Risk" : "Add Risk"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="risk-title">Title</Label>
              <Input id="risk-title" name="title" required defaultValue={editItem?.title || ""} data-testid="input-risk-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk-desc">Description</Label>
              <Textarea id="risk-desc" name="description" defaultValue={editItem?.description || ""} data-testid="input-risk-description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Probability</Label>
                <Select name="probability" defaultValue={editItem?.probability || "medium"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="very_low">Very Low</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="very_high">Very High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Impact</Label>
                <Select name="impact" defaultValue={editItem?.impact || "moderate"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="negligible">Negligible</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue={editItem?.status || "open"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="mitigating">Mitigating</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk-mitigation">Mitigation Plan</Label>
              <Textarea id="risk-mitigation" name="mitigation" defaultValue={editItem?.mitigation || ""} data-testid="input-risk-mitigation" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk-owner">Owner</Label>
              <Input id="risk-owner" name="owner" defaultValue={editItem?.owner || ""} data-testid="input-risk-owner" />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-risk">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editItem ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TasksTab({
  projectId,
  tasks,
  isMSS,
}: {
  projectId: number;
  tasks: ProjectTask[];
  isMSS: boolean;
}) {
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tasks", { ...data, projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", projectId] });
      setDialogOpen(false);
      toast({ title: "Task created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", projectId] });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dueDate = fd.get("dueDate") as string;
    createMutation.mutate({
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      priority: fd.get("priority") as string,
      status: fd.get("status") as string,
      assignedTo: fd.get("assignedTo") as string || undefined,
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    });
  };

  return (
    <div className="space-y-4" data-testid="tab-tasks">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Tasks ({tasks.length})</h3>
        {isMSS && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            data-testid="button-add-task"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Task
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tasks yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="space-y-2">
                <div className={`rounded-md p-2 ${col.color}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{col.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => {
                    const overdue = task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <Card key={task.id} className="hover-elevate" data-testid={`card-task-${task.id}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-medium leading-snug">{task.title}</h4>
                            <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${PRIORITY_COLORS[task.priority] || "bg-muted"}`} />
                          </div>
                          {task.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-2">{task.description}</p>
                          )}
                          {task.assignedTo && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="w-2.5 h-2.5" />
                              <span>{task.assignedTo}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{task.priority}</Badge>
                            {task.dueDate && (
                              <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                <CalendarDays className="w-2.5 h-2.5" />
                                {fmt.formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                          {!isMSS ? (
                            <Badge variant="outline" className="text-[10px]">
                              {KANBAN_COLUMNS.find((c) => c.id === task.status)?.label || task.status}
                            </Badge>
                          ) : (
                            <Select
                              value={task.status}
                              onValueChange={(status) => updateMutation.mutate({ id: task.id, status })}
                            >
                              <SelectTrigger className="h-6 text-[10px]" data-testid={`select-task-status-${task.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {KANBAN_COLUMNS.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" name="title" required data-testid="input-task-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea id="task-desc" name="description" data-testid="input-task-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue="backlog">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KANBAN_COLUMNS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assigned">Assigned To</Label>
              <Input id="task-assigned" name="assignedTo" data-testid="input-task-assigned" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date</Label>
              <Input id="task-due" name="dueDate" type="date" data-testid="input-task-due" />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-task">
              {createMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");

  const generateMutation = useMutation({
    mutationFn: async (reportType: "daily" | "executive") => {
      const res = await apiRequest("POST", "/api/ai/project-report", { projectId, reportType });
      return res.json();
    },
    onSuccess: (data: any) => {
      setReportContent(data.report || data.content || JSON.stringify(data, null, 2));
      setReportTitle(data.title || "Generated Report");
      toast({ title: "Report generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate report", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6" data-testid="tab-reports">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={() => { setReportContent(null); generateMutation.mutate("daily"); }}
          disabled={generateMutation.isPending}
          data-testid="button-generate-daily-report"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <CalendarDays className="w-3.5 h-3.5 mr-2" />
          )}
          Generate Daily Report
        </Button>
        <Button
          variant="outline"
          onClick={() => { setReportContent(null); generateMutation.mutate("executive"); }}
          disabled={generateMutation.isPending}
          data-testid="button-generate-executive-report"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 mr-2" />
          )}
          Generate Executive Summary
        </Button>
      </div>

      {generateMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Generating report with AI...</p>
          </CardContent>
        </Card>
      )}

      {reportContent && (
        <Card data-testid="card-report-output">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{reportTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm" data-testid="text-report-content">
              {reportContent}
            </div>
          </CardContent>
        </Card>
      )}

      {!generateMutation.isPending && !reportContent && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Select a report type to generate</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/projects/:id");
  const projectId = params?.id ? parseInt(params.id) : null;
  const { currentTenant, isMSS } = useTenant();
  const fmt = useTenantDateFormatter();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", currentTenant?.id],
    enabled: !!currentTenant && !!projectId,
    select: (data: any) => Array.isArray(data) ? data.find((p: Project) => p.id === projectId) : undefined,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({
    queryKey: ["/api/tasks", projectId],
    enabled: !!projectId,
  });

  const { data: scopeItems = [] } = useQuery<ProjectScope[]>({
    queryKey: ["/api/project-scope", projectId],
    enabled: !!projectId,
  });

  const { data: activities = [] } = useQuery<ProjectActivity[]>({
    queryKey: ["/api/project-activities", projectId],
    enabled: !!projectId,
  });

  const { data: raciEntries = [] } = useQuery<ProjectRaci[]>({
    queryKey: ["/api/project-raci", projectId],
    enabled: !!projectId,
  });

  const { data: risks = [] } = useQuery<ProjectRisk[]>({
    queryKey: ["/api/project-risks", projectId],
    enabled: !!projectId,
  });

  const { data: logs = [] } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs", projectId],
    enabled: !!projectId,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members", currentTenant?.id],
    enabled: !!currentTenant,
  });

  if (!projectId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Invalid project ID</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/projects")} data-testid="button-back-projects">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (projectLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-3 w-full max-w-md" />
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Project not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/projects")} data-testid="button-back-projects-notfound">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-6 pb-4 space-y-3 border-b shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="icon" variant="ghost" onClick={() => navigate("/projects")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-project-name">{project.name}</h1>
              <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[project.status] || ""}`} data-testid="badge-header-status">
                {project.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentTenant?.name} — {fmt.formatDate(project.startDate)} to {fmt.formatDate(project.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-semibold">{progressPct}%</p>
            </div>
            <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4" data-testid="tabs-project-detail">
              <TabsTrigger value="overview" data-testid="tab-trigger-overview">Overview</TabsTrigger>
              <TabsTrigger value="scope" data-testid="tab-trigger-scope">Scope</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-trigger-activities">Activities</TabsTrigger>
              <TabsTrigger value="raci" data-testid="tab-trigger-raci">RACI</TabsTrigger>
              <TabsTrigger value="risks" data-testid="tab-trigger-risks">Risks</TabsTrigger>
              <TabsTrigger value="tasks" data-testid="tab-trigger-tasks">Tasks</TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-trigger-reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab project={project} tasks={tasks} scopeItems={scopeItems} risks={risks} />
            </TabsContent>

            <TabsContent value="scope">
              <ScopeTab projectId={projectId} scopeItems={scopeItems} isMSS={isMSS} />
            </TabsContent>

            <TabsContent value="activities">
              <ActivitiesTab projectId={projectId} activities={activities} activityLogs={logs} isMSS={isMSS} />
            </TabsContent>

            <TabsContent value="raci">
              <RaciTab projectId={projectId} activities={activities} raciEntries={raciEntries} teamMembers={teamMembers} isMSS={isMSS} />
            </TabsContent>

            <TabsContent value="risks">
              <RiskRegisterTab projectId={projectId} risks={risks} isMSS={isMSS} />
            </TabsContent>

            <TabsContent value="tasks">
              <TasksTab projectId={projectId} tasks={tasks} isMSS={isMSS} />
            </TabsContent>

            <TabsContent value="reports">
              <ReportsTab projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
