import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHero } from "@/components/page-hero";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  FolderKanban,
  AlertTriangle,
  Clock,
  Shield,
  FileText,
  Link2,
  Unlink,
  ChevronLeft,
  Trash2,
  Pencil,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  investigating: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  contained: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  remediated: "bg-green-500/10 text-green-700 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  low: "bg-green-500/10 text-green-700 dark:text-green-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  low: "bg-green-500/10 text-green-700 dark:text-green-400",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const createCaseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "investigating", "contained", "remediated", "closed"]),
});

function CasesList({ tenantId, onSelectCase }: { tenantId: number; onSelectCase: (id: number) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (searchQuery) queryParams.set("search", searchQuery);

  const { data: casesData, isLoading } = useQuery<any>({
    queryKey: ["/api/cases", tenantId, statusFilter, searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${tenantId}?${queryParams.toString()}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/cases", tenantId, "stats", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${tenantId}/stats/summary`, { credentials: "include" });
      return res.json();
    },
  });

  const form = useForm({
    resolver: zodResolver(createCaseSchema),
    defaultValues: { title: "", description: "", severity: "medium" as const, priority: "medium" as const, status: "open" as const },
  });

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof createCaseSchema>) => {
      const res = await apiRequest("POST", `/api/cases/${tenantId}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId] });
      setCreateOpen(false);
      form.reset();
      toast({ title: "Case created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create case", description: err.message, variant: "destructive" });
    },
  });

  const cases = casesData?.cases || [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <PageHero
          icon={FolderKanban}
          badge="Investigation"
          title="Case Management"
          description="Group related incidents into cases, track evidence, manage investigation lifecycle and chain of custody"
          stats={[
            { label: "total cases", value: casesData?.total ?? "—" },
            { label: "open", value: stats?.open ?? casesData?.cases?.filter((c: any) => c.status === "open").length ?? "—", accent: true },
            { label: "investigating", value: stats?.investigating ?? casesData?.cases?.filter((c: any) => c.status === "investigating").length ?? "—" },
          ]}
        />
        <div className="flex items-center justify-end gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-case">
                <Plus className="w-4 h-4 mr-1.5" />
                New Case
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Case</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input {...field} placeholder="Case title" data-testid="input-case-title" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} placeholder="Describe the investigation..." data-testid="input-case-description" /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="severity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Severity</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger data-testid="select-case-severity"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priority" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger data-testid="select-case-priority"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger data-testid="select-case-status"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="investigating">Investigating</SelectItem>
                          <SelectItem value="contained">Contained</SelectItem>
                          <SelectItem value="remediated">Remediated</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-case">
                  {createMutation.isPending ? "Creating..." : "Create Case"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Cases</p>
            <p className="text-2xl font-bold" data-testid="text-total-cases">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Open</p>
            <p className="text-2xl font-bold text-blue-600" data-testid="text-open-cases">{stats?.open_count || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Investigating</p>
            <p className="text-2xl font-bold text-yellow-600" data-testid="text-investigating-cases">{stats?.investigating_count || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Critical/High</p>
            <p className="text-2xl font-bold text-red-600" data-testid="text-critical-cases">{parseInt(stats?.critical_count || "0") + parseInt(stats?.high_count || "0")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-cases"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="contained">Contained</SelectItem>
            <SelectItem value="remediated">Remediated</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-cases">No cases found. Create your first case to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map((c: any) => (
            <Card
              key={c.id}
              className="cursor-pointer hover-elevate"
              onClick={() => onSelectCase(c.id)}
              data-testid={`card-case-${c.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate" data-testid={`text-case-title-${c.id}`}>{c.title}</span>
                      <Badge variant="outline" className={STATUS_COLORS[c.status] || ""} data-testid={`badge-status-${c.id}`}>
                        {c.status}
                      </Badge>
                      <Badge variant="outline" className={SEVERITY_COLORS[c.severity] || ""} data-testid={`badge-severity-${c.id}`}>
                        {c.severity}
                      </Badge>
                      <Badge variant="outline" className={PRIORITY_COLORS[c.priority] || ""}>
                        {c.priority}
                      </Badge>
                    </div>
                    {c.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {c.incident_count || 0} incidents
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {c.evidence_count || 0} evidence
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CaseDetail({ tenantId, caseId, onBack }: { tenantId: number; caseId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [linkIncidentId, setLinkIncidentId] = useState("");
  const [timelineAction, setTimelineAction] = useState("");
  const [timelineDetails, setTimelineDetails] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");

  const { data: caseData, isLoading } = useQuery<any>({
    queryKey: ["/api/cases", tenantId, "detail", caseId],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${tenantId}/detail/${caseId}`, { credentials: "include" });
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiRequest("PATCH", `/api/cases/${tenantId}/${caseId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId, "detail", caseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId] });
      toast({ title: "Case updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/cases/${tenantId}/${caseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId] });
      toast({ title: "Case deleted" });
      onBack();
    },
  });

  const linkIncidentMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      await apiRequest("POST", `/api/cases/${tenantId}/${caseId}/incidents`, { incidentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId, "detail", caseId] });
      setLinkIncidentId("");
      toast({ title: "Incident linked" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to link incident", description: err.message, variant: "destructive" });
    },
  });

  const unlinkIncidentMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      await apiRequest("DELETE", `/api/cases/${tenantId}/${caseId}/incidents/${incidentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId, "detail", caseId] });
      toast({ title: "Incident unlinked" });
    },
  });

  const addTimelineMutation = useMutation({
    mutationFn: async (data: { action: string; details: string }) => {
      const res = await apiRequest("POST", `/api/cases/${tenantId}/${caseId}/timeline`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId, "detail", caseId] });
      setTimelineAction("");
      setTimelineDetails("");
      toast({ title: "Timeline entry added" });
    },
  });

  const addEvidenceMutation = useMutation({
    mutationFn: async (data: { fileName: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/cases/${tenantId}/${caseId}/evidence`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", tenantId, "detail", caseId] });
      setEvidenceName("");
      setEvidenceNotes("");
      toast({ title: "Evidence added" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caseData || caseData.message) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Case not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-cases">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-case-detail-title">{caseData.title}</h1>
            <p className="text-xs text-muted-foreground">Case #{caseData.id} - Created {formatDate(caseData.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={caseData.status} onValueChange={(v) => updateMutation.mutate({ status: v })}>
            <SelectTrigger className="w-[140px]" data-testid="select-update-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="contained">Contained</SelectItem>
              <SelectItem value="remediated">Remediated</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this case?")) deleteMutation.mutate(); }} data-testid="button-delete-case">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={STATUS_COLORS[caseData.status] || ""}>{caseData.status}</Badge>
        <Badge variant="outline" className={SEVERITY_COLORS[caseData.severity] || ""}>{caseData.severity}</Badge>
        <Badge variant="outline" className={PRIORITY_COLORS[caseData.priority] || ""}>{caseData.priority} priority</Badge>
        {caseData.assignee_id && <Badge variant="outline">Assigned: {caseData.assignee_id}</Badge>}
      </div>

      {caseData.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm" data-testid="text-case-description">{caseData.description}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="incidents">
        <TabsList>
          <TabsTrigger value="incidents" data-testid="tab-incidents">
            Incidents ({caseData.incidents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            Timeline ({caseData.timeline?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-evidence">
            Evidence ({caseData.evidence?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incidents" className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Incident ID to link..."
              value={linkIncidentId}
              onChange={(e) => setLinkIncidentId(e.target.value)}
              className="w-48"
              data-testid="input-link-incident"
            />
            <Button
              size="sm"
              onClick={() => { const id = parseInt(linkIncidentId); if (id) linkIncidentMutation.mutate(id); }}
              disabled={!linkIncidentId || linkIncidentMutation.isPending}
              data-testid="button-link-incident"
            >
              <Link2 className="w-3.5 h-3.5 mr-1" />
              Link
            </Button>
          </div>

          {(caseData.incidents?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-incidents">No incidents linked yet</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Linked</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caseData.incidents.map((inc: any) => (
                  <TableRow key={inc.id} data-testid={`row-incident-${inc.incident_id}`}>
                    <TableCell className="font-mono text-xs">#{inc.incident_id}</TableCell>
                    <TableCell className="font-medium max-w-[300px] truncate">{inc.incident_title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SEVERITY_COLORS[inc.incident_severity] || ""}>{inc.incident_severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{inc.incident_status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inc.incident_source || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(inc.linked_at)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => unlinkIncidentMutation.mutate(inc.incident_id)}
                        data-testid={`button-unlink-${inc.incident_id}`}
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Action (e.g. Analyst Note)"
              value={timelineAction}
              onChange={(e) => setTimelineAction(e.target.value)}
              className="w-48"
              data-testid="input-timeline-action"
            />
            <Input
              placeholder="Details..."
              value={timelineDetails}
              onChange={(e) => setTimelineDetails(e.target.value)}
              className="flex-1"
              data-testid="input-timeline-details"
            />
            <Button
              size="sm"
              onClick={() => { if (timelineAction) addTimelineMutation.mutate({ action: timelineAction, details: timelineDetails }); }}
              disabled={!timelineAction || addTimelineMutation.isPending}
              data-testid="button-add-timeline"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {(caseData.timeline?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <Clock className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-timeline">No timeline entries yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {caseData.timeline.map((entry: any) => (
                <Card key={entry.id} data-testid={`card-timeline-${entry.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{entry.action}</p>
                        {entry.details && <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          by {entry.actor || "System"} at {formatDate(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Evidence file name..."
              value={evidenceName}
              onChange={(e) => setEvidenceName(e.target.value)}
              className="w-48"
              data-testid="input-evidence-name"
            />
            <Input
              placeholder="Notes..."
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              className="flex-1"
              data-testid="input-evidence-notes"
            />
            <Button
              size="sm"
              onClick={() => { if (evidenceName) addEvidenceMutation.mutate({ fileName: evidenceName, notes: evidenceNotes }); }}
              disabled={!evidenceName || addEvidenceMutation.isPending}
              data-testid="button-add-evidence"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {(caseData.evidence?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-evidence">No evidence items yet</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caseData.evidence.map((ev: any) => (
                  <TableRow key={ev.id} data-testid={`row-evidence-${ev.id}`}>
                    <TableCell className="font-medium">{ev.file_name}</TableCell>
                    <TableCell className="text-xs">{ev.file_type || "-"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{ev.hash || "-"}</TableCell>
                    <TableCell className="text-xs">{ev.uploaded_by || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{ev.notes || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(ev.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CasesPageWrapper() {
  const { currentTenant } = useTenant();
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);

  if (!currentTenant?.id) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a tenant to view cases</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {selectedCaseId ? (
        <CaseDetail tenantId={currentTenant.id} caseId={selectedCaseId} onBack={() => setSelectedCaseId(null)} />
      ) : (
        <CasesList tenantId={currentTenant.id} onSelectCase={setSelectedCaseId} />
      )}
    </div>
  );
}
