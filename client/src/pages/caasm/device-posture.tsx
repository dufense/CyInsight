import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QueryErrorState } from "@/components/ui/error-boundary";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, ShieldCheck, ShieldX, Plus, Trash2, Pencil, Loader2,
  CheckCircle2, XCircle, AlertTriangle, ClipboardCheck, ChevronDown, ChevronUp,
  BarChart3,
} from "lucide-react";

const RULE_FIELDS = [
  { value: "status", label: "Device Status", type: "select", options: ["active", "inactive", "decommissioned", "quarantined"] },
  { value: "os_family", label: "OS Family", type: "select", options: ["Windows", "Linux", "AIX", "VIOS", "macOS", "Solaris", "BSD", "VMware", "Other"] },
  { value: "operating_system", label: "Operating System", type: "text" },
  { value: "eol_status", label: "EOL Status", type: "select", options: ["active", "approaching", "ended"] },
  { value: "eos_status", label: "EOS Status", type: "select", options: ["active", "approaching", "ended"] },
  { value: "risk_level", label: "Risk Level", type: "select", options: ["low", "medium", "high", "critical"] },
  { value: "device_health", label: "Device Health", type: "text" },
  { value: "has_edr", label: "Has EDR/Endpoint Security", type: "select", options: ["yes", "no"] },
  { value: "last_seen_days", label: "Last Seen (Days)", type: "number" },
  { value: "vulnerability_count", label: "Vulnerability Count", type: "number" },
];

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does Not Contain" },
  { value: "in", label: "In (comma-separated)" },
  { value: "not_in", label: "Not In" },
  { value: "less_than", label: "Less Than" },
  { value: "greater_than", label: "Greater Than" },
];

interface Rule {
  field: string;
  operator: string;
  value: string | string[];
}

interface Policy {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  rules: Rule[];
  enforcement: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PolicyResult {
  policyId: number;
  policyName: string;
  description: string | null;
  rulesCount: number;
  compliant: number;
  nonCompliant: number;
  total: number;
  complianceRate: number;
  failingDevices: Array<{
    id: number;
    hostname: string;
    ipAddress: string;
    osFamily: string;
    operatingSystem: string;
    status: string;
    cisScore: number | null;
    criticality: string | null;
    failedRules: string[];
    failedCount: number;
  }>;
}

interface AssessmentResult {
  summary: {
    totalDevices: number;
    compliant: number;
    nonCompliant: number;
    complianceRate: number;
    activePolicies: number;
  };
  policies: PolicyResult[];
}

export default function DevicePostureTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [expandedPolicy, setExpandedPolicy] = useState<number | null>(null);

  const { data: policies, isLoading: policiesLoading, isError: policiesError, refetch: refetchPolicies } = useQuery<Policy[]>({
    queryKey: ["/api/device-posture", tenantId, "policies"],
    queryFn: async () => {
      const res = await fetch(`/api/device-posture/${tenantId}/policies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch policies");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: assessment, isLoading: assessmentLoading, isError: assessmentError, refetch: refetchAssessment } = useQuery<AssessmentResult>({
    queryKey: ["/api/device-posture", tenantId, "assess"],
    queryFn: async () => {
      const res = await fetch(`/api/device-posture/${tenantId}/assess`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to run assessment");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (policyId: number) => {
      await apiRequest("DELETE", `/api/device-posture/${tenantId}/policies/${policyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-posture", tenantId] });
      toast({ title: "Policy deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const summary = assessment?.summary;

  const { data: cisStats } = useQuery<any>({
    queryKey: ["/api/assets", tenantId, "cis-stats"],
    queryFn: async () => {
      const r = await fetch(`/api/assets/${tenantId}/cis-stats`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!tenantId,
    staleTime: 60000,
  });

  if (policiesError || assessmentError) {
    return (
      <QueryErrorState
        moduleName="Device Posture"
        onRetry={() => { refetchPolicies(); refetchAssessment(); }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="device-posture-tab">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card data-testid="card-total-devices">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Devices</p>
                <p className="text-2xl font-bold" data-testid="text-total-devices">{summary?.totalDevices ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-compliant">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Compliant</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-compliant">{summary?.compliant ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-non-compliant">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ShieldX className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Non-Compliant</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-non-compliant">{summary?.nonCompliant ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-compliance-rate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Compliance Rate</p>
                <p className="text-2xl font-bold" data-testid="text-compliance-rate">{summary?.complianceRate ?? 0}%</p>
              </div>
            </div>
            <Progress value={summary?.complianceRate ?? 0} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card data-testid="card-avg-cis">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg CIS Score</p>
                {cisStats?.avgCisScore != null ? (
                  <>
                    <p className="text-2xl font-bold" style={{ color: cisStats.avgCisScore >= 70 ? "#22c55e" : cisStats.avgCisScore >= 40 ? "#f59e0b" : "#ef4444" }} data-testid="text-avg-cis-posture">
                      {Math.round(cisStats.avgCisScore)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{cisStats.scoredAssets ?? 0} scored</p>
                  </>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">—</p>
                )}
              </div>
            </div>
            {cisStats?.avgCisScore != null && (
              <Progress value={cisStats.avgCisScore} className="mt-2 h-2" />
            )}
            {/* CIS bucket breakdown: red / amber / green */}
            {(cisStats?.redAssets != null || cisStats?.amberAssets != null || cisStats?.greenAssets != null) && (
              <div className="flex items-center gap-2 mt-2 text-[10px]" data-testid="cis-bucket-breakdown">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">&lt;40:</span>
                  <span className="font-mono font-medium text-red-400" data-testid="cis-bucket-red">{cisStats.redAssets ?? 0}</span>
                </span>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">40–69:</span>
                  <span className="font-mono font-medium text-amber-400" data-testid="cis-bucket-amber">{cisStats.amberAssets ?? 0}</span>
                </span>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">≥70:</span>
                  <span className="font-mono font-medium text-green-400" data-testid="cis-bucket-green">{cisStats.greenAssets ?? 0}</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {assessment && assessment.policies.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compliance by Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assessment.policies.map((pr) => (
                <Card key={pr.policyId} className="border" data-testid={`card-policy-result-${pr.policyId}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm truncate">{pr.policyName}</span>
                      <Badge variant={pr.complianceRate >= 90 ? "default" : pr.complianceRate >= 70 ? "secondary" : "destructive"}>
                        {pr.complianceRate}%
                      </Badge>
                    </div>
                    <Progress
                      value={pr.complianceRate}
                      className={`h-2 mb-2 ${pr.complianceRate >= 90 ? "[&>div]:bg-green-500" : pr.complianceRate >= 70 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                    />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />{pr.compliant} pass</span>
                      <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" />{pr.nonCompliant} fail</span>
                      <span>{pr.rulesCount} rule{pr.rulesCount !== 1 ? "s" : ""}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Posture Policies</CardTitle>
            <Button size="sm" onClick={() => { setEditingPolicy(null); setShowPolicyDialog(true); }} data-testid="btn-create-policy">
              <Plus className="w-4 h-4 mr-1" /> Create Policy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {policiesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !policies || policies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="empty-policies">
              <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No policies defined yet. Create your first compliance policy to start assessing device posture.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Name</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Enforcement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id} data-testid={`row-policy-${p.id}`}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{p.name}</span>
                        {p.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{(p.rules ?? []).length} rule{(p.rules ?? []).length !== 1 ? "s" : ""}</Badge></TableCell>
                    <TableCell className="text-sm capitalize">{(p.enforcement ?? "").replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingPolicy(p); setShowPolicyDialog(true); }} data-testid={`btn-edit-policy-${p.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteMutation.mutate(p.id)} data-testid={`btn-delete-policy-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {assessment && assessment.policies.some(p => p.nonCompliant > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Non-Compliant Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assessment.policies.filter(p => p.nonCompliant > 0).map((pr) => (
              <div key={pr.policyId} className="mb-4 last:mb-0">
                <button
                  className="flex items-center gap-2 w-full text-left text-sm font-medium py-2 hover:text-primary transition-colors"
                  onClick={() => setExpandedPolicy(expandedPolicy === pr.policyId ? null : pr.policyId)}
                  data-testid={`btn-expand-policy-${pr.policyId}`}
                >
                  {expandedPolicy === pr.policyId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {pr.policyName}
                  <Badge variant="destructive" className="ml-2">{pr.nonCompliant} failing</Badge>
                </button>
                {expandedPolicy === pr.policyId && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hostname</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>OS</TableHead>
                        <TableHead>CIS Score</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Failed Rules</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pr.failingDevices.slice(0, 50).map((d) => {
                        const cisColor = d.cisScore !== null
                          ? (d.cisScore >= 70 ? "#22c55e" : d.cisScore >= 40 ? "#f59e0b" : "#ef4444")
                          : "#6b7280";
                        return (
                          <TableRow key={d.id} data-testid={`row-failing-${d.id}`}>
                            <TableCell className="font-medium text-sm">{d.hostname}</TableCell>
                            <TableCell className="text-sm">{d.ipAddress || "—"}</TableCell>
                            <TableCell className="text-sm">{d.osFamily}</TableCell>
                            <TableCell>
                              {d.cisScore !== null ? (
                                <span className="text-sm font-medium" style={{ color: cisColor }} data-testid={`cis-score-${d.id}`}>
                                  {d.cisScore}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={d.status === "active" ? "default" : "secondary"} className="capitalize">{d.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {d.failedRules.map((r, i) => (
                                  <Badge key={i} variant="destructive" className="text-[10px] font-normal">{r}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <PolicyDialog
        open={showPolicyDialog}
        onClose={() => { setShowPolicyDialog(false); setEditingPolicy(null); }}
        policy={editingPolicy}
        tenantId={tenantId}
      />
    </div>
  );
}

function PolicyDialog({ open, onClose, policy, tenantId }: {
  open: boolean;
  onClose: () => void;
  policy: Policy | null;
  tenantId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!policy;

  const [name, setName] = useState(policy?.name || "");
  const [description, setDescription] = useState(policy?.description || "");
  const [rules, setRules] = useState<Rule[]>(policy?.rules || [{ field: "status", operator: "equals", value: "active" }]);
  const [isActive, setIsActive] = useState(policy?.is_active !== false);

  useEffect(() => {
    if (open) {
      if (policy) {
        setName(policy.name);
        setDescription(policy.description || "");
        setRules(policy.rules.length > 0 ? [...policy.rules] : [{ field: "status", operator: "equals", value: "active" }]);
        setIsActive(policy.is_active);
      } else {
        setName("");
        setDescription("");
        setRules([{ field: "status", operator: "equals", value: "active" }]);
        setIsActive(true);
      }
    }
  }, [open, policy]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, description, rules, enforcement: "all_must_pass", isActive };
      if (isEdit) {
        await apiRequest("PATCH", `/api/device-posture/${tenantId}/policies/${policy!.id}`, body);
      } else {
        await apiRequest("POST", `/api/device-posture/${tenantId}/policies`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-posture", tenantId] });
      toast({ title: isEdit ? "Policy updated" : "Policy created" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addRule = () => setRules([...rules, { field: "status", operator: "equals", value: "" }]);
  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));
  const updateRule = (idx: number, key: keyof Rule, val: string | string[]) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], [key]: val };
    setRules(updated);
  };

  const fieldDef = (field: string) => RULE_FIELDS.find(f => f.value === field);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Policy" : "Create Compliance Policy"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Policy Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Active Devices with EDR" data-testid="input-policy-name" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the compliance criteria..." rows={2} data-testid="input-policy-description" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Rules (all must pass for compliance)</Label>
              <Button size="sm" variant="outline" onClick={addRule} data-testid="btn-add-rule">
                <Plus className="w-3 h-3 mr-1" /> Add Rule
              </Button>
            </div>
            <div className="space-y-3">
              {rules.map((rule, idx) => {
                const fd = fieldDef(rule.field);
                return (
                  <div key={idx} className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30" data-testid={`rule-row-${idx}`}>
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <Select value={rule.field} onValueChange={(v) => updateRule(idx, "field", v)}>
                        <SelectTrigger data-testid={`select-field-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RULE_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rule.operator} onValueChange={(v) => updateRule(idx, "operator", v)}>
                        <SelectTrigger data-testid={`select-operator-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {fd?.type === "select" ? (
                        <Select value={String(rule.value)} onValueChange={(v) => updateRule(idx, "value", v)}>
                          <SelectTrigger data-testid={`select-value-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {fd.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={String(rule.value)}
                          onChange={(e) => updateRule(idx, "value", e.target.value)}
                          placeholder={fd?.type === "number" ? "e.g., 30" : "Value..."}
                          data-testid={`input-value-${idx}`}
                        />
                      )}
                    </div>
                    {rules.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 mt-0.5 text-red-400" onClick={() => removeRule(idx)} data-testid={`btn-remove-rule-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label>Active</Label>
            <Select value={isActive ? "true" : "false"} onValueChange={(v) => setIsActive(v === "true")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!name || rules.length === 0 || saveMutation.isPending} data-testid="btn-save-policy">
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isEdit ? "Update Policy" : "Create Policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
