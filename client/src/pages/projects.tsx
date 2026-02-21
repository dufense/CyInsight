import { useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Task as ProjectTask } from "@shared/schema";
import {
  Plus,
  GripVertical,
  FolderKanban,
  CalendarDays,
  MoreVertical,
  FileText,
  Loader2,
  User,
  Clock,
  CheckCircle2,
  PauseCircle,
  BarChart3,
  ListChecks,
  Sparkles,
  ShieldAlert,
  Bot,
  Target,
  AlertTriangle,
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
import { ScrollArea } from "@/components/ui/scroll-area";

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

function getDaysAgo(dateStr: string | Date): number {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function TaskCard({ task, onMove, readOnly }: { task: ProjectTask; onMove: (id: number, status: string) => void; readOnly?: boolean }) {
  const daysAgo = getDaysAgo(task.createdAt);
  const overdue = task.status !== "done" && isOverdue(task.dueDate);

  return (
    <Card className="hover-elevate" data-testid={`card-task-${task.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-xs font-medium leading-snug">{task.title}</h4>
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${PRIORITY_COLORS[task.priority] || "bg-muted"}`} />
        </div>
        {task.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{task.description}</p>
        )}
        {task.assignedTo && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`text-task-assignee-${task.id}`}>
            <User className="w-2.5 h-2.5" />
            <span>{task.assignedTo}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{task.priority}</Badge>
          {task.dueDate && (
            <span
              className={`text-[10px] flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}
              data-testid={`text-task-duedate-${task.id}`}
            >
              <CalendarDays className="w-2.5 h-2.5" />
              {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {overdue && " (overdue)"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`text-task-age-${task.id}`}>
          <Clock className="w-2.5 h-2.5" />
          <span>Created {daysAgo === 0 ? "today" : `${daysAgo}d ago`}</span>
        </div>
        {readOnly ? (
          <Badge variant="outline" className="text-[10px]">
            {KANBAN_COLUMNS.find(col => col.id === task.status)?.label || task.status}
          </Badge>
        ) : (
          <Select
            value={task.status}
            onValueChange={(status) => onMove(task.id, status)}
          >
            <SelectTrigger className="h-6 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KANBAN_COLUMNS.map(col => (
                <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityDashboard({ projects, allTasksByProject }: { projects: Project[]; allTasksByProject: Record<number, ProjectTask[]> }) {
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === "active").length;
  const onHoldProjects = projects.filter(p => p.status === "on_hold").length;
  const completedProjects = projects.filter(p => p.status === "completed").length;

  const allTasks = Object.values(allTasksByProject).flat();
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter(t => t.status === "done").length;
  const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const stats = [
    { label: "Total Projects", value: totalProjects, icon: FolderKanban },
    { label: "Active", value: activeProjects, icon: BarChart3 },
    { label: "On Hold", value: onHoldProjects, icon: PauseCircle },
    { label: "Completed", value: completedProjects, icon: CheckCircle2 },
    { label: "Total Tasks", value: totalTasks, icon: ListChecks },
    { label: "Tasks Done", value: `${donePercent}%`, icon: CheckCircle2 },
  ];

  return (
    <div className="px-6 pb-3 space-y-3" data-testid="section-activity-dashboard">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                <stat.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {projects.length > 0 && (
        <Card data-testid="card-project-progress-overview">
          <CardContent className="p-3 space-y-2">
            <span className="text-xs font-medium">Project Progress</span>
            <div className="space-y-2">
              {projects.map((project) => {
                const projectTasks = allTasksByProject[project.id] || [];
                const total = projectTasks.length;
                const done = projectTasks.filter(t => t.status === "done").length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={project.id} className="flex items-center gap-3" data-testid={`progress-project-${project.id}`}>
                    <span className="text-[10px] text-muted-foreground w-28 shrink-0 truncate">{project.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">{done}/{total} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { currentTenant, userRole, isMSS } = useTenant();
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const isCustomer = userRole === "customer";

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({
    queryKey: ["/api/tasks", selectedProject],
    enabled: !!selectedProject,
  });

  const allTasksQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["/api/tasks", project.id],
      enabled: !!project.id,
    })),
  });

  const allTasksByProject: Record<number, ProjectTask[]> = {};
  projects.forEach((project, idx) => {
    allTasksByProject[project.id] = (allTasksQueries[idx]?.data as ProjectTask[]) || [];
  });

  const activeProject = projects.find(p => p.id === selectedProject) || projects[0];

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects", { ...data, tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setProjectDialogOpen(false);
      toast({ title: "Project created" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tasks", { ...data, projectId: activeProject?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setTaskDialogOpen(false);
      toast({ title: "Task created" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (reportType: "daily" | "weekly") => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const title = reportType === "daily"
        ? `Daily Project Status - ${dateStr}`
        : `Weekly Project Summary - ${dateStr}`;
      const res = await apiRequest("POST", "/api/reports/generate", {
        tenantId: currentTenant?.id,
        title,
        reportType: "executive_summary",
        period: reportType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setReportDialogOpen(false);
      toast({ title: "Report generated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to generate report", variant: "destructive" });
    },
  });

  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskData, setRiskData] = useState<any>(null);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [generatedTasks, setGeneratedTasks] = useState<any[]>([]);

  const riskAssessmentMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", "/api/ai/project-risk", { projectId });
      return res.json();
    },
    onSuccess: (data) => {
      setRiskData(data);
    },
    onError: () => {
      toast({ title: "Failed to assess risk", variant: "destructive" });
    },
  });

  const taskBreakdownMutation = useMutation({
    mutationFn: async ({ projectId, goal }: { projectId: number; goal: string }) => {
      const res = await apiRequest("POST", "/api/ai/task-breakdown", { projectId, goal });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedTasks(data.tasks || []);
    },
    onError: () => {
      toast({ title: "Failed to generate tasks", variant: "destructive" });
    },
  });

  const addGeneratedTaskMutation = useMutation({
    mutationFn: async (task: any) => {
      const res = await apiRequest("POST", "/api/tasks", {
        projectId: selectedProject,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: "todo",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task added" });
    },
  });

  if (!selectedProject && projects.length > 0 && !projectsLoading) {
    setSelectedProject(projects[0].id);
  }

  const handleProjectSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createProjectMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      status: formData.get("status"),
    });
  };

  const handleTaskSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dueDate = formData.get("dueDate") as string;
    const assignedTo = formData.get("assignedTo") as string;
    createTaskMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      status: formData.get("status"),
      ...(assignedTo ? { assignedTo } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-6 pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Project Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- Kanban board
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isMSS && (
            <>
              <Button
                size="sm"
                variant="secondary"
                data-testid="button-ai-risk-assessment"
                onClick={() => {
                  if (selectedProject) {
                    setRiskData(null);
                    setRiskDialogOpen(true);
                    riskAssessmentMutation.mutate(selectedProject);
                  }
                }}
              >
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                AI Risk Assessment
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="button-ai-task-breakdown"
                onClick={() => {
                  setGoalText("");
                  setGeneratedTasks([]);
                  setGoalDialogOpen(true);
                }}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                AI Task Breakdown
              </Button>
              <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary" data-testid="button-generate-report">
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Generate Report
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Project Report</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Select a report type to generate:</p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="secondary"
                        className="justify-start"
                        disabled={generateReportMutation.isPending}
                        onClick={() => generateReportMutation.mutate("daily")}
                        data-testid="button-report-daily"
                      >
                        {generateReportMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                          <CalendarDays className="w-3.5 h-3.5 mr-2" />
                        )}
                        Daily Project Status
                      </Button>
                      <Button
                        variant="secondary"
                        className="justify-start"
                        disabled={generateReportMutation.isPending}
                        onClick={() => generateReportMutation.mutate("weekly")}
                        data-testid="button-report-weekly"
                      >
                        {generateReportMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                          <BarChart3 className="w-3.5 h-3.5 mr-2" />
                        )}
                        Weekly Project Summary
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={!activeProject} data-testid="button-create-task">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTaskSubmit} className="space-y-4">
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
                            {KANBAN_COLUMNS.map(col => (
                              <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-assigned">Assigned To</Label>
                      <Input id="task-assigned" name="assignedTo" placeholder="e.g. John Doe" data-testid="input-task-assigned-to" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-due-date">Due Date</Label>
                      <Input id="task-due-date" name="dueDate" type="date" data-testid="input-task-due-date" />
                    </div>
                    <Button type="submit" className="w-full" disabled={createTaskMutation.isPending} data-testid="button-submit-task">
                      {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-create-project">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    New Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Project</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleProjectSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="project-name">Project Name</Label>
                      <Input id="project-name" name="name" required data-testid="input-project-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="project-desc">Description</Label>
                      <Textarea id="project-desc" name="description" data-testid="input-project-description" />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select name="status" defaultValue="planning">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full" disabled={createProjectMutation.isPending} data-testid="button-submit-project">
                      {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {!projectsLoading && projects.length > 0 && (
        <ActivityDashboard projects={projects} allTasksByProject={allTasksByProject} />
      )}

      {projects.length > 1 && (
        <div className="px-6 pb-3">
          <ScrollArea className="w-full">
            <div className="flex items-center gap-2">
              {projects.map((project) => (
                <Button
                  key={project.id}
                  variant={project.id === (activeProject?.id) ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setSelectedProject(project.id)}
                  data-testid={`button-project-${project.id}`}
                  className="shrink-0"
                >
                  <FolderKanban className="w-3 h-3 mr-1.5" />
                  {project.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        {projectsLoading || tasksLoading ? (
          <div className="flex gap-4 h-full">
            {KANBAN_COLUMNS.map((col) => (
              <div key={col.id} className="flex-1 min-w-[220px]">
                <Skeleton className="h-8 mb-3" />
                <Skeleton className="h-full" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FolderKanban className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No projects yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a project to get started with task management</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 h-full">
            {KANBAN_COLUMNS.map((column) => {
              const columnTasks = tasks.filter((t) => t.status === column.id);
              return (
                <div key={column.id} className="flex-1 min-w-[220px] flex flex-col">
                  <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md mb-3 ${column.color}`}>
                    <span className="text-xs font-medium">{column.label}</span>
                    <Badge variant="secondary" className="text-[10px] h-5 min-w-[20px] justify-center">
                      {columnTasks.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="space-y-2 pr-1">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onMove={(id, status) => updateTaskMutation.mutate({ id, status })}
                          readOnly={isCustomer}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              AI Risk Assessment
            </DialogTitle>
          </DialogHeader>
          {riskAssessmentMutation.isPending ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Analyzing project risks...</span>
            </div>
          ) : riskData ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={riskData.riskLevel === "critical" || riskData.riskLevel === "high" ? "destructive" : riskData.riskLevel === "medium" ? "default" : "secondary"} className="text-xs">
                    {riskData.riskLevel?.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Risk Score: {riskData.riskScore}/100</span>
                </div>
              </div>
              <p className="text-sm">{riskData.summary}</p>
              {riskData.risks?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium">Identified Risks</h4>
                  {riskData.risks.map((risk: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className={`w-3 h-3 ${risk.severity === "critical" || risk.severity === "high" ? "text-destructive" : "text-muted-foreground"}`} />
                          <span className="text-xs font-medium">{risk.title}</span>
                          <Badge variant="outline" className="text-[9px]">{risk.severity}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{risk.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {riskData.recommendations?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium">Recommendations</h4>
                  <ul className="space-y-1">
                    {riskData.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Target className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Task Breakdown
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {generatedTasks.length === 0 && (
              <>
                <Label className="text-sm">Describe a project goal</Label>
                <Textarea
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="e.g., Implement firewall rule audit for all client environments..."
                  rows={3}
                  data-testid="input-ai-goal"
                />
                <Button
                  className="w-full"
                  disabled={!goalText || !selectedProject || taskBreakdownMutation.isPending}
                  onClick={() => {
                    if (selectedProject && goalText) {
                      taskBreakdownMutation.mutate({ projectId: selectedProject, goal: goalText });
                    }
                  }}
                  data-testid="button-generate-tasks"
                >
                  {taskBreakdownMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {taskBreakdownMutation.isPending ? "Generating..." : "Generate Tasks"}
                </Button>
              </>
            )}
            {generatedTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Click "Add" to add tasks to the project board:</p>
                {generatedTasks.map((task: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{task.title}</span>
                            <Badge variant="outline" className="text-[9px]">{task.priority}</Badge>
                            {task.estimatedDays && (
                              <span className="text-[9px] text-muted-foreground">{task.estimatedDays}d</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-xs shrink-0"
                          onClick={() => addGeneratedTaskMutation.mutate(task)}
                          disabled={addGeneratedTaskMutation.isPending}
                          data-testid={`button-add-task-${i}`}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="secondary"
                  className="w-full text-xs"
                  onClick={() => {
                    generatedTasks.forEach(task => addGeneratedTaskMutation.mutate(task));
                  }}
                  data-testid="button-add-all-tasks"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add All Tasks
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
