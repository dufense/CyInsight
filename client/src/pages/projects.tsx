import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

function TaskCard({ task, onMove }: { task: ProjectTask; onMove: (id: number, status: string) => void }) {
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
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-[10px]">{task.priority}</Badge>
          {task.dueDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-2.5 h-2.5" />
              {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
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
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({
    queryKey: ["/api/tasks", selectedProject],
    enabled: !!selectedProject,
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
    createTaskMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      status: formData.get("status"),
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
        <div className="flex items-center gap-2">
          {isMSS && (
            <>
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
    </div>
  );
}
