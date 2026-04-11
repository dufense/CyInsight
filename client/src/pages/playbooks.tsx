import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHero } from "@/components/page-hero";
import { useTenant } from "@/lib/tenant-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Play,
  Plus,
  Trash2,
  Edit,
  Zap,
  ChevronDown,
  ChevronUp,
  Mail,
  ShieldBan,
  Ban,
  Ticket,
  UserCheck,
  Brain,
  AlertTriangle,
  Eye,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  BookTemplate,
  GripVertical,
  Workflow,
  Loader2,
  CheckCircle,
} from "lucide-react";
import type { Playbook, PlaybookExecution } from "@shared/schema";

const STEP_TYPES = [
  { value: "notify", label: "Notify", icon: Mail, color: "text-blue-500" },
  { value: "isolate_asset", label: "Isolate Asset", icon: ShieldBan, color: "text-red-500" },
  { value: "block_ioc", label: "Block IOC", icon: Ban, color: "text-orange-500" },
  { value: "create_ticket", label: "Create Ticket", icon: Ticket, color: "text-purple-500" },
  { value: "assign_agent", label: "Assign to Agent", icon: UserCheck, color: "text-cyan-500" },
  { value: "run_ai_analysis", label: "Run AI Analysis", icon: Brain, color: "text-emerald-500" },
  { value: "update_severity", label: "Update Severity", icon: AlertTriangle, color: "text-yellow-500" },
  { value: "add_watchlist", label: "Add to Watchlist", icon: Eye, color: "text-indigo-500" },
  { value: "custom_webhook", label: "Custom Webhook", icon: Webhook, color: "text-pink-500" },
];

function getStepMeta(type: string) {
  return STEP_TYPES.find((s) => s.value === type) || STEP_TYPES[0];
}

function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleString();
}

type PlaybookStep = { id: string; type: string; label: string; config: Record<string, any>; order: number };

function PlaybookStepEditor({
  steps,
  onChange,
}: {
  steps: PlaybookStep[];
  onChange: (s: PlaybookStep[]) => void;
}) {
  const addStep = (type: string) => {
    const meta = getStepMeta(type);
    const newStep: PlaybookStep = {
      id: `s${Date.now()}`,
      type,
      label: meta.label,
      config: {},
      order: steps.length + 1,
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (id: string) => {
    onChange(steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const arr = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange(arr.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateLabel = (id: string, label: string) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium">Steps ({steps.length})</p>
        <Select onValueChange={addStep}>
          <SelectTrigger className="w-48" data-testid="select-add-step">
            <SelectValue placeholder="Add a step..." />
          </SelectTrigger>
          <SelectContent>
            {STEP_TYPES.map((st) => (
              <SelectItem key={st.value} value={st.value} data-testid={`option-step-${st.value}`}>
                <span className="flex items-center gap-2">
                  <st.icon className={`w-3.5 h-3.5 ${st.color}`} />
                  {st.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {steps.length === 0 && (
        <div className="border border-dashed rounded-md p-6 text-center text-muted-foreground text-sm">
          No steps added yet. Use the dropdown above to add actions.
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, idx) => {
          const meta = getStepMeta(step.type);
          const StepIcon = meta.icon;
          return (
            <div
              key={step.id}
              className="flex items-center gap-2 border rounded-md p-2"
              data-testid={`step-item-${step.id}`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <Badge variant="outline" className="shrink-0 text-xs gap-1">
                <StepIcon className={`w-3 h-3 ${meta.color}`} />
                {meta.label}
              </Badge>
              <Input
                value={step.label}
                onChange={(e) => updateLabel(step.id, e.target.value)}
                className="flex-1 text-sm"
                data-testid={`input-step-label-${step.id}`}
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveStep(idx, -1)}
                  disabled={idx === 0}
                  data-testid={`button-move-up-${step.id}`}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === steps.length - 1}
                  data-testid={`button-move-down-${step.id}`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeStep(step.id)}
                  data-testid={`button-remove-step-${step.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlaybookEditorDialog({
  open,
  onOpenChange,
  playbook,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playbook?: any;
  tenantId: number;
}) {
  const { toast } = useToast();
  const isEdit = !!playbook;
  const [name, setName] = useState(playbook?.name || "");
  const [description, setDescription] = useState(playbook?.description || "");
  const [isActive, setIsActive] = useState(playbook?.is_active !== false);
  const [triggerSeverities, setTriggerSeverities] = useState<string[]>(playbook?.trigger_conditions?.severity || []);
  const [triggerTypes, setTriggerTypes] = useState<string[]>(playbook?.trigger_conditions?.type || []);
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook?.steps || []);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        return apiRequest("PATCH", `/api/playbooks/${tenantId}/${playbook.id}`, data);
      }
      return apiRequest("POST", `/api/playbooks/${tenantId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks", tenantId] });
      toast({ title: isEdit ? "Playbook updated" : "Playbook created" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name,
      description,
      isActive,
      triggerConditions: { severity: triggerSeverities, type: triggerTypes },
      steps,
    });
  };

  const toggleSeverity = (s: string) => {
    setTriggerSeverities((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-editor-title">
            {isEdit ? "Edit Playbook" : "Create Playbook"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playbook name"
              data-testid="input-playbook-name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this playbook's purpose..."
              rows={3}
              data-testid="input-playbook-description"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-playbook-active" />
            <span className="text-sm">Active</span>
          </div>
          <div>
            <label className="text-sm font-medium">Trigger Severities</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {["critical", "high", "medium", "low"].map((s) => (
                <Badge
                  key={s}
                  variant={triggerSeverities.includes(s) ? "default" : "outline"}
                  className="cursor-pointer toggle-elevate"
                  onClick={() => toggleSeverity(s)}
                  data-testid={`badge-severity-${s}`}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Trigger Types (comma-separated)</label>
            <Input
              value={triggerTypes.join(", ")}
              onChange={(e) =>
                setTriggerTypes(
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                )
              }
              placeholder="Phishing, Malware, Ransomware"
              data-testid="input-trigger-types"
            />
          </div>
          <PlaybookStepEditor steps={steps} onChange={setSteps} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-playbook">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-playbook">
            {createMutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlaybookCard({
  playbook,
  tenantId,
  onEdit,
}: {
  playbook: any;
  tenantId: number;
  onEdit: (p: any) => void;
}) {
  const { toast } = useToast();
  const steps = (playbook.steps || []) as PlaybookStep[];
  const triggers = playbook.trigger_conditions || {};

  const toggleMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/playbooks/${tenantId}/${playbook.id}`, {
        isActive: !playbook.is_active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks", tenantId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/playbooks/${tenantId}/${playbook.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks", tenantId] });
      toast({ title: "Playbook deleted" });
    },
  });

  const [execDialogOpen, setExecDialogOpen] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [liveExec, setLiveExec] = useState<any>(null);
  const sseRef = useRef<EventSource | null>(null);

  const stopSSE = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
  }, []);

  useEffect(() => () => stopSSE(), [stopSSE]);

  async function startExecution() {
    try {
      const res = await fetch(`/api/playbooks/${tenantId}/${playbook.id}/execute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) { toast({ title: "Execution failed", variant: "destructive" }); return; }
      const data = await res.json();
      const initSteps = (playbook.steps || []).map((s: any) => ({ stepId: s.id, stepLabel: s.label, stepType: s.type, status: "pending", message: "Waiting…", dryRun }));
      setLiveExec({ execId: data.execId, status: "running", steps: initSteps, dryRun });
      stopSSE();

      // Subscribe via SSE for real-time step progress (DB-backed: survives process restart)
      const es = new EventSource(`/api/playbooks/${tenantId}/${playbook.id}/execution-stream/${data.execId}`);
      sseRef.current = es;
      es.onmessage = (e) => {
        try {
          const state = JSON.parse(e.data);
          setLiveExec(state);
          if (state.status !== "running") {
            stopSSE();
            queryClient.invalidateQueries({ queryKey: ["/api/playbooks", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["/api/playbook-executions", tenantId] });
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => stopSSE();
    } catch { toast({ title: "Failed to start execution", variant: "destructive" }); }
  }

  return (
    <>
    <Dialog open={execDialogOpen} onOpenChange={(o) => { setExecDialogOpen(o); if (!o) { stopSSE(); setLiveExec(null); } }}>
      <DialogContent className="max-w-lg" data-testid={`dialog-exec-${playbook.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Play className="w-4 h-4 text-green-500" />Execute Playbook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!liveExec ? (
            <>
              <div className="bg-muted/40 rounded-lg p-3 border">
                <p className="text-sm font-medium">{playbook.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{(playbook.steps || []).length} steps will be executed</p>
              </div>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-blue-500" />Dry Run Mode</p>
                  <p className="text-xs text-muted-foreground">Simulate all steps without making real API calls</p>
                </div>
                <Switch checked={dryRun} onCheckedChange={setDryRun} data-testid={`switch-dry-run-${playbook.id}`} />
              </div>
              {dryRun && (
                <div className="text-[11px] text-blue-600 bg-blue-500/10 border border-blue-500/20 rounded px-3 py-2">
                  Dry run will show exactly what each step would do — no endpoints will be called, no assets modified.
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setExecDialogOpen(false)}>Cancel</Button>
                <Button onClick={startExecution} data-testid={`button-confirm-execute-${playbook.id}`} className={dryRun ? "bg-blue-600 hover:bg-blue-700" : ""}>
                  <Play className="w-3.5 h-3.5 mr-1.5" />{dryRun ? "Start Dry Run" : "Execute Now"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {liveExec.status === "running" ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" /> : liveExec.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                <span className="text-sm font-medium capitalize">{liveExec.status === "running" ? "Executing…" : liveExec.status}</span>
                {liveExec.dryRun && <Badge variant="secondary" className="text-[10px]">Dry Run</Badge>}
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {(liveExec.steps || []).map((step: any, si: number) => (
                  <div key={si} className={`rounded px-2.5 py-2 text-[11px] border ${step.status === "running" ? "bg-blue-500/10 border-blue-500/20" : step.status === "success" ? "bg-green-500/10 border-green-500/20" : step.status === "failed" ? "bg-red-500/10 border-red-500/20" : "bg-muted/30 border-border/30"}`} data-testid={`live-step-${si}`}>
                    <div className="flex items-center gap-1.5">
                      {step.status === "running" ? <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" /> : step.status === "success" ? <CheckCircle className="w-3 h-3 text-green-500 shrink-0" /> : step.status === "failed" ? <XCircle className="w-3 h-3 text-red-500 shrink-0" /> : <Clock className="w-3 h-3 text-muted-foreground shrink-0" />}
                      <span className="font-medium">{step.stepLabel || step.stepType}</span>
                      {step.durationMs && <span className="ml-auto text-muted-foreground">{step.durationMs}ms</span>}
                    </div>
                    {step.message && step.status !== "pending" && <p className="mt-0.5 text-muted-foreground pl-4">{step.message}</p>}
                    {step.error && <p className="mt-0.5 text-red-500 pl-4">✗ {step.error}</p>}
                    {(step.action || step.target) && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70 pl-4 font-mono">
                        {step.action && <span className="mr-2">action: {step.action}</span>}
                        {step.target && <span>target: {step.target}</span>}
                      </p>
                    )}
                    {(step.startedAt || step.completedAt) && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60 pl-4">
                        {step.startedAt && <span className="mr-2">started: {new Date(step.startedAt).toLocaleTimeString()}</span>}
                        {step.completedAt && <span>done: {new Date(step.completedAt).toLocaleTimeString()}</span>}
                      </p>
                    )}
                    {step.apiResponse && (step.status === "success" || step.status === "failed") && (
                      <details className="mt-0.5 pl-4">
                        <summary className="text-[9px] text-blue-500 cursor-pointer hover:underline">API Response</summary>
                        <pre className="text-[9px] font-mono text-muted-foreground bg-black/20 rounded p-1 mt-0.5 overflow-x-auto max-h-24 whitespace-pre-wrap break-all">{(() => { try { return JSON.stringify(JSON.parse(step.apiResponse), null, 2); } catch { return step.apiResponse; } })()}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              {liveExec.status !== "running" && (
                <DialogFooter>
                  <Button onClick={() => { setExecDialogOpen(false); stopSSE(); setLiveExec(null); }}>Close</Button>
                </DialogFooter>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <Card data-testid={`card-playbook-${playbook.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base" data-testid={`text-playbook-name-${playbook.id}`}>
              {playbook.name}
            </CardTitle>
            <Badge
              variant={playbook.is_active ? "default" : "secondary"}
              data-testid={`badge-playbook-status-${playbook.id}`}
            >
              {playbook.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {playbook.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playbook.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { setLiveExec(null); setExecDialogOpen(true); }}
            data-testid={`button-execute-${playbook.id}`}
          >
            <Play className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onEdit(playbook)} data-testid={`button-edit-${playbook.id}`}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-${playbook.id}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {triggers.severity?.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground">Triggers:</span>
            {triggers.severity.map((s: string) => (
              <Badge key={s} variant="outline" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        )}
        {triggers.type?.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground">Types:</span>
            {triggers.type.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {steps.slice(0, 5).map((step) => {
            const meta = getStepMeta(step.type);
            const StepIcon = meta.icon;
            return (
              <Badge key={step.id} variant="secondary" className="text-xs gap-1">
                <StepIcon className={`w-3 h-3 ${meta.color}`} />
                {step.label}
              </Badge>
            );
          })}
          {steps.length > 5 && (
            <Badge variant="secondary" className="text-xs">
              +{steps.length - 5} more
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span>{steps.length} steps</span>
            <span>Executed {playbook.execution_count || 0} times</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={playbook.is_active}
              onCheckedChange={() => toggleMutation.mutate()}
              data-testid={`switch-toggle-${playbook.id}`}
            />
          </div>
        </div>
        {playbook.last_executed && (
          <p className="text-xs text-muted-foreground">
            Last run: {formatDate(playbook.last_executed)}
          </p>
        )}
      </CardContent>
    </Card>
    </>
  );
}

function ExecutionHistoryTab({ tenantId }: { tenantId: number }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: executions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/playbook-executions", tenantId],
    enabled: !!tenantId,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!executions?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No execution history yet</p>
        <p className="text-xs mt-1">Run a playbook to see execution logs here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {executions.map((exec: any) => {
        const stepResults = (exec.step_results || []) as any[];
        const successCount = stepResults.filter((r: any) => r.status === "success").length;
        const failCount = stepResults.filter((r: any) => r.status === "failed").length;
        const isExpanded = expandedId === exec.id;
        const hasDryRun = stepResults.some((s: any) => s.dryRun);
        const totalDuration = stepResults.reduce((sum: number, s: any) => sum + (s.durationMs || 0), 0);
        return (
          <div key={exec.id} className="border rounded-lg overflow-hidden" data-testid={`row-execution-${exec.id}`}>
            <div
              className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : exec.id)}
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${exec.status === "completed" ? "bg-green-500/10" : exec.status === "failed" ? "bg-red-500/10" : exec.status === "partial" ? "bg-yellow-500/10" : "bg-muted"}`}>
                {exec.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : exec.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-500" /> : exec.status === "partial" ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /> : <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" data-testid={`text-exec-playbook-${exec.id}`}>{exec.playbook_name || `Playbook #${exec.playbook_id}`}</span>
                  <Badge variant={exec.status === "completed" ? "default" : exec.status === "failed" ? "destructive" : "secondary"} className="text-[10px]" data-testid={`badge-exec-status-${exec.id}`}>
                    {exec.status}
                  </Badge>
                  {hasDryRun && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">Dry Run</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                  <span className="text-green-600">{successCount} passed</span>
                  {failCount > 0 && <span className="text-destructive">{failCount} failed</span>}
                  {totalDuration > 0 && <span>{(totalDuration / 1000).toFixed(1)}s total</span>}
                  <span>by {exec.triggered_by || "system"}</span>
                  <span>{formatDate(exec.started_at)}</span>
                </div>
              </div>
              {stepResults.length > 0 && (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              )}
            </div>
            {isExpanded && stepResults.length > 0 && (
              <div className="border-t bg-muted/20 p-3 space-y-1.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Execution Audit Log</p>
                {stepResults.map((step: any, si: number) => (
                  <div key={si} className={`rounded px-2.5 py-2 text-[11px] border ${step.status === "success" ? "bg-green-500/5 border-green-500/20" : step.status === "failed" ? "bg-red-500/5 border-red-500/20" : "bg-muted/30 border-border/30"}`} data-testid={`audit-step-${exec.id}-${si}`}>
                    <div className="flex items-center gap-1.5">
                      {step.status === "success" ? <CheckCircle className="w-3 h-3 text-green-500 shrink-0" /> : step.status === "failed" ? <XCircle className="w-3 h-3 text-red-500 shrink-0" /> : <Clock className="w-3 h-3 text-muted-foreground shrink-0" />}
                      <span className="font-medium">{step.stepLabel || step.stepType || `Step ${si + 1}`}</span>
                      {step.action && step.target && <span className="text-muted-foreground">→ {step.action} on <span className="font-mono text-[10px]">{step.target}</span></span>}
                      {step.durationMs && <span className="ml-auto text-muted-foreground font-mono">{step.durationMs}ms</span>}
                    </div>
                    {step.message && <p className="mt-0.5 text-muted-foreground pl-4">{step.message}</p>}
                    {step.error && <p className="mt-0.5 text-red-500 pl-4">✗ {step.error}</p>}
                    {step.startedAt && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground pl-4 font-mono">{new Date(step.startedAt).toLocaleTimeString()} → {step.completedAt ? new Date(step.completedAt).toLocaleTimeString() : "…"}</p>
                    )}
                    {step.apiResponse && (
                      <details className="mt-0.5 pl-4">
                        <summary className="text-[9px] text-blue-500 cursor-pointer hover:underline">API Response</summary>
                        <pre className="text-[9px] font-mono text-muted-foreground bg-black/20 rounded p-1 mt-0.5 overflow-x-auto max-h-24 whitespace-pre-wrap break-all">{(() => { try { return JSON.stringify(JSON.parse(step.apiResponse), null, 2); } catch { return step.apiResponse; } })()}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PlaybooksPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: playbooks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/playbooks", tenantId],
    enabled: !!tenantId,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/playbooks/${tenantId}/seed-templates`, {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks", tenantId] });
      toast({ title: "Templates loaded" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = (p: any) => {
    setEditingPlaybook(p);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingPlaybook(null);
    setEditorOpen(true);
  };

  const filtered = (playbooks || []).filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === "active" && !p.is_active) return false;
    if (filterStatus === "inactive" && p.is_active) return false;
    return true;
  });

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <p className="text-muted-foreground text-sm">Select an organization to view playbooks.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHero
        icon={Workflow}
        badge="SOAR"
        title="Playbook Studio"
        description={`Design and automate security response workflows. ${playbooks?.length || 0} playbooks configured across ${currentTenant?.name}`}
        stats={[
          { label: "total", value: playbooks?.length || 0 },
          { label: "active", value: playbooks?.filter((p: any) => p.isActive).length || 0, accent: true },
        ]}
      />
      <div className="flex items-center justify-end gap-2">
          {(!playbooks || playbooks.length === 0) && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-templates"
            >
              <BookTemplate className="w-4 h-4 mr-1.5" />
              Load Templates
            </Button>
          )}
          <Button onClick={handleCreate} data-testid="button-create-playbook">
            <Plus className="w-4 h-4 mr-1.5" />
            New Playbook
          </Button>
        </div>

      <Tabs defaultValue="library">
        <TabsList data-testid="tabs-playbooks">
          <TabsTrigger value="library" data-testid="tab-library">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Library
          </TabsTrigger>
          <TabsTrigger value="executions" data-testid="tab-executions">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Execution History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search playbooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
              data-testid="input-search-playbooks"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36" data-testid="select-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs" data-testid="badge-playbook-count">
              {filtered.length} playbook{filtered.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Workflow className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">No playbooks found</p>
              <p className="text-xs mt-1">Create a new playbook or load pre-built templates to get started</p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-templates-empty"
              >
                <BookTemplate className="w-4 h-4 mr-1.5" />
                Load Templates
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((p: any) => (
                <PlaybookCard key={p.id} playbook={p} tenantId={tenantId} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          <ExecutionHistoryTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>

      {editorOpen && (
        <PlaybookEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          playbook={editingPlaybook}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
