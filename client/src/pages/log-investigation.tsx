import { useState, useEffect, useCallback, Fragment } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FlaskConical, Search, Save, Trash2, Play, Download, ChevronRight,
  ChevronDown, AlertTriangle, Database, Clock, X, Shield, ExternalLink,
  FileJson, Archive, RefreshCw, Plus, Eye,
} from "lucide-react";

type SourceMode = "live" | "offline" | "both";

const SEVERITIES = ["critical", "high", "medium", "low", "info"];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  info: "bg-slate-500/10 text-slate-600 border-slate-500/30",
};

const EVENT_TYPES = ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud", "web", "database", "ot_iot"];
const SOURCE_TYPES = ["firewall", "edr", "siem", "ids", "waf", "dlp", "cloud_trail", "proxy", "dns", "email_gateway", "endpoint", "identity_provider"];

/** Format a Date as "YYYY-MM-DDTHH:MM" in local time (for datetime-local inputs). */
function toLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface QueryParams {
  startDate?: string;
  endDate?: string;
  severity?: string[];
  sourceType?: string[];
  eventType?: string;
  search?: string;
  entityFilter?: string;
}

interface ResultRow {
  id: number;
  timestamp: string;
  source: string;
  event_type: string;
  severity: string;
  mitre_tactic: string | null;
  threat: string | null;
  target: string | null;
  raw_log: string | null;
  raw_payload: Record<string, unknown> | null;
  description: string | null;
  ai_reasoning: string | null;
  parse_confidence: number | null;
  incident_id?: number | null;
  attacker?: string | null;
}

interface QueryResult {
  rows: ResultRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  queryId?: string;
  tier: string;
  sourceMode: SourceMode;
}

interface Session {
  id: number;
  name: string;
  description?: string;
  source_mode: SourceMode;
  query_params: QueryParams;
  result_count: number;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

interface ExportRecord {
  id: number;
  export_name: string;
  row_count: number;
  file_hash: string;
  s3_key: string;
  exported_at: string;
  analyst_id: string;
}

const HOT_RETENTION_MS = 90 * 86_400_000;

function TierBadge({ sourceMode, tier, startDate }: { sourceMode: SourceMode; tier?: string; startDate?: string }) {
  // Server-confirmed tier takes precedence over pre-query inference
  const effectiveTier = tier ?? (() => {
    if (sourceMode === "both") return "hot+cold";
    if (sourceMode === "offline") return "cold";
    // Live: if startDate is beyond hot retention window, warn it will be cold
    if (startDate) {
      const start = new Date(startDate);
      const cutoff = new Date(Date.now() - HOT_RETENTION_MS);
      if (start < cutoff) return "cold";
    }
    return "hot";
  })();

  if (effectiveTier === "hot+cold") {
    return (
      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 border text-[10px]">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1 animate-pulse" />
        Hot+Cold
      </Badge>
    );
  }
  if (effectiveTier === "cold") {
    return (
      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 border text-[10px]">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
        Cold (Offline)
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-500/10 text-green-400 border-green-500/30 border text-[10px]">
      <div className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />
      Hot (Live)
    </Badge>
  );
}

function SourceSelector({ value, onChange }: { value: SourceMode; onChange: (v: SourceMode) => void }) {
  const options: { value: SourceMode; label: string; desc: string }[] = [
    { value: "live", label: "Live (Hot)", desc: "Last 90 days — ClickHouse fast tier" },
    { value: "offline", label: "Offline (Cold)", desc: "90+ days — S3/Athena archive tier" },
    { value: "both", label: "Both", desc: "Full archive — Hot + Cold tiers" },
  ];
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.desc}
          data-testid={`source-mode-${opt.value}`}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SaveSessionModal({
  onSave,
  isPending,
}: {
  onSave: (name: string, description: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-save-session">
          <Save className="w-3.5 h-3.5" />
          Save Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save Investigation Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Session Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ransomware IOC Hunt 2026-04"
              data-testid="input-session-name"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you investigating?"
              rows={3}
              data-testid="input-session-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!name.trim() || isPending}
            onClick={() => { onSave(name.trim(), description.trim()); setOpen(false); }}
            data-testid="button-confirm-save-session"
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportModal({
  onExport,
  isPending,
}: {
  onExport: (exportName: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [exportName, setExportName] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-export-evidence">
          <Download className="w-3.5 h-3.5" />
          Export Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Chain-of-Custody Export
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-3 bg-muted/50 rounded-md text-xs space-y-1">
            <p className="text-muted-foreground">The server will re-run the session query and produce a signed gzipped bundle containing:</p>
            <ul className="list-disc ml-4 space-y-0.5 text-muted-foreground">
              <li>All matching rows (server-fetched, up to 10,000)</li>
              <li>SHA-256 hash for integrity verification</li>
              <li>Analyst username &amp; timestamp</li>
              <li>Tenant, session ID &amp; query parameters</li>
            </ul>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Export Label</label>
            <Input
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="e.g. Ransomware Investigation Q1-2026"
              data-testid="input-export-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => { onExport(exportName.trim() || `Export ${new Date().toLocaleDateString()}`); setOpen(false); }}
            data-testid="button-confirm-export"
          >
            {isPending ? "Exporting…" : "Generate Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDrawer({ row, onClose }: { row: ResultRow; onClose: () => void }) {
  const rawData = row.raw_payload ?? (row.raw_log ? { raw_log: row.raw_log } : {});
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-background border-l border-border z-50 flex flex-col shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <p className="text-sm font-semibold">Event Detail</p>
          <p className="text-[11px] text-muted-foreground font-mono">#{row.id}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-detail-drawer">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Timestamp</p>
              <p className="font-mono">{new Date(row.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Severity</p>
              <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[row.severity] ?? ""}`}>
                {row.severity}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Source</p>
              <p className="font-mono">{row.source || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Event Type</p>
              <p className="font-mono">{row.event_type || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">MITRE Tactic</p>
              <p>{row.mitre_tactic || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Threat/Target</p>
              <p className="font-mono text-[10px]">{row.threat || row.target || "—"}</p>
            </div>
          </div>
          {row.description && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Description</p>
              <p className="text-xs">{row.description}</p>
            </div>
          )}
          {row.ai_reasoning && (
            <div className="p-2 rounded-md bg-purple-500/5 border border-purple-500/20">
              <p className="text-[10px] text-purple-400 mb-1 font-medium">AI Analysis</p>
              <p className="text-xs">{row.ai_reasoning}</p>
            </div>
          )}
          {row.incident_id && (
            <div className="p-2 rounded-md bg-muted/40 border border-border/40">
              <p className="text-[10px] text-muted-foreground mb-1 font-medium">Related Incident</p>
              <a
                href={`/incident-war-room/${row.incident_id}`}
                className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline"
                data-testid={`link-incident-${row.incident_id}`}
              >
                <ExternalLink className="w-3 h-3" />
                View Incident #{row.incident_id} in War Room
              </a>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Raw Event JSON</p>
            <pre className="text-[10px] font-mono p-2 rounded-md bg-muted/50 overflow-x-auto max-h-48 overflow-y-auto border border-border/50">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default function LogInvestigationPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [sourceMode, setSourceMode] = useState<SourceMode>("live");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [severity, setSeverity] = useState<string[]>([]);
  const [sourceType, setSourceType] = useState<string>("");
  const [eventType, setEventType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasQueried, setHasQueried] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [hotRows, setHotRows] = useState<ResultRow[]>([]); // retained for both-mode merge with cold results
  const [isQueryPending, setIsQueryPending] = useState(false);
  const [pollingQueryId, setPollingQueryId] = useState<string | null>(null);
  const [coldProgress, setColdProgress] = useState(0);
  const [coldTimedOut, setColdTimedOut] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [detailRow, setDetailRow] = useState<ResultRow | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [lastExport, setLastExport] = useState<{ id: number; fileHash: string; s3Key: string; rowCount: number; exportName: string } | null>(null);

  const tenantId = currentTenant?.id;

  // URL sync: auto-load session from ?session=ID
  useEffect(() => {
    if (!searchStr || !tenantId) return;
    const params = new URLSearchParams(searchStr);
    const sessionId = params.get("session");
    if (sessionId) {
      fetch(`/api/log-investigation/session/${sessionId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((s: Session) => {
          setActiveSession(s);
          const qp = s.query_params || {};
          // Reset ALL filter state to defaults first to prevent stale filter leakage
          // across sessions (forensic integrity requirement).
          setSourceMode((s.source_mode as SourceMode) ?? "live");
          setStartDate(qp.startDate ?? "");
          setEndDate(qp.endDate ?? "");
          setSeverity(Array.isArray(qp.severity) ? qp.severity : []);
          setSourceType(Array.isArray(qp.sourceType) ? (qp.sourceType[0] ?? "") : (qp.sourceType ?? ""));
          setEventType(qp.eventType ?? "");
          setSearch(qp.search ?? "");
          setEntityFilter(qp.entityFilter ?? "");
        })
        .catch(() => {});
    }
  }, [searchStr, tenantId]);

  // Sessions list
  const sessionsQuery = useQuery<Session[]>({
    queryKey: ["/api/log-investigation/sessions", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/log-investigation/sessions/${tenantId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 30000,
  });

  // Exports list
  const exportsQuery = useQuery<ExportRecord[]>({
    queryKey: ["/api/log-investigation/exports", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/log-investigation/exports/${tenantId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 30000,
  });

  // Polling for cold-tier queries
  const pollQuery = useQuery({
    queryKey: ["/api/log-investigation/query/status", pollingQueryId],
    queryFn: async () => {
      const res = await fetch(`/api/log-investigation/query/status/${pollingQueryId}`, { credentials: "include" });
      return res.json() as Promise<{ queryId: string; status: string; progress: number; result?: QueryResult; error?: string }>;
    },
    enabled: !!pollingQueryId,
    refetchInterval: pollingQueryId ? 5000 : false,
  });

  useEffect(() => {
    if (!pollQuery.data) return;
    const { status, progress, result, error } = pollQuery.data;
    setColdProgress(progress ?? 0);
    if (status === "SUCCEEDED") {
      setPollingQueryId(null);
      setIsQueryPending(false);
      if (result) {
        // Server-side merge is done for both-mode in the status endpoint.
        // The result already contains the globally sorted, paginated, and deduplicated
        // rows with accurate total and totalPages — just use it directly.
        setQueryResult(result);
        setPage(result.page ?? 1);
      }
    } else if (status === "FAILED" || status === "CANCELLED") {
      setPollingQueryId(null);
      setIsQueryPending(false);
      toast({
        title: "Cold-tier query failed",
        description: error ?? "The archive query did not complete. Hot-tier results (if any) are shown above.",
        variant: "destructive",
      });
    }
  }, [pollQuery.data, toast]);

  // Timeout banner after 5 minutes
  useEffect(() => {
    if (!pollingQueryId) { setColdTimedOut(false); return; }
    const timer = setTimeout(() => {
      setColdTimedOut(true);
      setPollingQueryId(null);
      setIsQueryPending(false);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [pollingQueryId]);

  const buildQueryParams = useCallback((): QueryParams => ({
    // Convert timezone-naive datetime-local strings to unambiguous UTC ISO strings.
    // datetime-local gives "YYYY-MM-DDTHH:MM" (browser local time).
    // toISOString() gives "YYYY-MM-DDTHH:MM:SS.sssZ" (UTC).
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    endDate: endDate ? new Date(endDate).toISOString() : undefined,
    severity: severity.length > 0 ? severity : undefined,
    sourceType: sourceType ? [sourceType] : undefined,
    eventType: eventType || undefined,
    search: search || undefined,
    entityFilter: entityFilter || undefined,
  }), [startDate, endDate, severity, sourceType, eventType, search, entityFilter]);

  const runQuery = useCallback(async (p = 1) => {
    if (!tenantId) return;
    setIsQueryPending(true);
    setHasQueried(true);
    setColdTimedOut(false);
    setPollingQueryId(null);
    setPage(p);
    try {
      const res = await apiRequest("POST", "/api/log-investigation/query", {
        tenantId,
        sourceMode,
        ...buildQueryParams(),
        page: p,
        pageSize: 50,
        sessionId: activeSession?.id ?? null,
      });
      const data: QueryResult = await res.json();
      setQueryResult(data);
      // For "both" mode, save the hot-tier rows immediately so they can be merged
      // with cold-tier rows when Athena polling completes.
      if (data.queryId && sourceMode === "both") {
        setHotRows(data.rows ?? []);
        setPollingQueryId(data.queryId);
      } else if (data.queryId) {
        setHotRows([]);
        setPollingQueryId(data.queryId);
      } else {
        setHotRows([]);
        setIsQueryPending(false);
      }
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
      setIsQueryPending(false);
    }
  }, [tenantId, sourceMode, buildQueryParams, toast, activeSession]);

  const saveSessionMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/log-investigation/sessions", {
        tenantId,
        name,
        description,
        sourceMode,
        queryParams: buildQueryParams(),
      });
      return res.json() as Promise<Session>;
    },
    onSuccess: (session) => {
      setActiveSession(session);
      qc.invalidateQueries({ queryKey: ["/api/log-investigation/sessions", tenantId] });
      navigate(`/log-investigation?session=${session.id}`);
      toast({ title: "Session saved", description: `"${session.name}" saved successfully` });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await apiRequest("DELETE", `/api/log-investigation/session/${sessionId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/log-investigation/sessions", tenantId] });
      if (activeSession) setActiveSession(null);
      toast({ title: "Session deleted" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (exportName: string) => {
      const res = await apiRequest("POST", `/api/log-investigation/export/${activeSession?.id ?? 0}`, {
        exportName,
        tenantId,
      });
      return res.json() as Promise<{ export: ExportRecord; fileHash: string; s3Key: string; rowCount: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/log-investigation/exports", tenantId] });
      setLastExport({
        id: data.export?.id,
        fileHash: data.fileHash,
        s3Key: data.s3Key,
        rowCount: data.rowCount ?? 0,
        exportName: data.export?.export_name ?? "Export",
      });
      toast({
        title: "Evidence exported",
        description: `${data.rowCount ?? "?"} rows · SHA-256: ${data.fileHash?.slice(0, 16)}…`,
      });
    },
    onError: (err: any) => toast({ title: "Export failed", description: err.message, variant: "destructive" }),
  });

  const resumeSession = (session: Session) => {
    setActiveSession(session);
    const qp = session.query_params || {};
    // Reset ALL filter state to defaults first to prevent stale filter leakage
    // across sessions (forensic integrity requirement).
    setSourceMode((session.source_mode as SourceMode) ?? "live");
    setStartDate(qp.startDate ?? "");
    setEndDate(qp.endDate ?? "");
    setSeverity(Array.isArray(qp.severity) ? qp.severity : []);
    setSourceType(Array.isArray(qp.sourceType) ? (qp.sourceType[0] ?? "") : (qp.sourceType ?? ""));
    setEventType(qp.eventType ?? "");
    setSearch(qp.search ?? "");
    setEntityFilter(qp.entityFilter ?? "");
    navigate(`/log-investigation?session=${session.id}`);
  };

  const isColdQuery = sourceMode === "offline" || (sourceMode === "both" && !!pollingQueryId);
  const rows = queryResult?.rows ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={FlaskConical}
        title="Log Investigation Console"
        description="Deep forensic log investigation spanning live hot-tier and offline cold-tier archives with chain-of-custody export"
        badge="Forensic"
        stats={[
          { label: "Source Mode", value: sourceMode === "live" ? "Live (Hot)" : sourceMode === "offline" ? "Offline (Cold)" : "Hot+Cold" },
          { label: "Results", value: queryResult?.total ?? 0 },
          { label: "Sessions", value: sessionsQuery.data?.length ?? 0 },
          { label: "Exports", value: exportsQuery.data?.length ?? 0 },
        ]}
      />

      <div className="flex flex-1 gap-4 p-4">
        {/* Left Panel — Sessions */}
        <div className="w-60 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Sessions</p>
            <Badge variant="outline" className="text-[10px]">{sessionsQuery.data?.length ?? 0}</Badge>
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-1.5 pr-1">
              {sessionsQuery.isLoading && [1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              {!sessionsQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  <Database className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  No saved sessions yet
                </div>
              )}
              {sessionsQuery.data?.map((session) => (
                <Card
                  key={session.id}
                  className={`border-border/50 cursor-pointer transition-colors hover:border-primary/30 ${activeSession?.id === session.id ? "border-primary/50 bg-primary/5" : ""}`}
                  data-testid={`card-session-${session.id}`}
                >
                  <CardContent className="p-2.5">
                    <p className="text-[11px] font-medium leading-tight truncate">{session.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge className={`text-[8px] px-1 py-0 h-3.5 ${session.source_mode === "offline" ? "bg-amber-500/10 text-amber-500" : session.source_mode === "both" ? "bg-blue-500/10 text-blue-500" : "bg-green-500/10 text-green-500"}`}>
                        {session.source_mode}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground ml-auto">{session.result_count} rows</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2 flex-1"
                        onClick={() => resumeSession(session)}
                        data-testid={`button-resume-session-${session.id}`}
                      >
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteSessionMutation.mutate(session.id)}
                        data-testid={`button-delete-session-${session.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {/* Evidence Locker */}
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Archive className="w-3.5 h-3.5" />
              Evidence Locker
            </p>
            <div className="space-y-1.5">
              {lastExport && (
                <div className="p-2 rounded-md bg-green-500/5 border border-green-500/20" data-testid="card-last-export">
                  <p className="text-[10px] font-medium text-green-400 truncate">{lastExport.exportName}</p>
                  <p className="text-[9px] text-muted-foreground">{lastExport.rowCount} rows · SHA-256: {lastExport.fileHash?.slice(0, 10)}…</p>
                  <a
                    href={`/api/log-investigation/download/${lastExport.id}`}
                    download
                    className="inline-flex items-center gap-1 text-[9px] text-green-400 hover:underline mt-0.5"
                    data-testid="link-download-export"
                  >
                    <Download className="w-2.5 h-2.5" />Download .json.gz bundle
                  </a>
                </div>
              )}
              {exportsQuery.data?.slice(0, 5).map((exp) => (
                <div key={exp.id} className="p-2 rounded-md bg-muted/30 border border-border/30" data-testid={`card-export-${exp.id}`}>
                  <p className="text-[10px] font-medium truncate">{exp.export_name || `Export #${exp.id}`}</p>
                  <p className="text-[9px] text-muted-foreground">{exp.row_count} rows · {new Date(exp.exported_at).toLocaleDateString()}</p>
                  <p className="text-[9px] text-muted-foreground/80 truncate" data-testid={`text-analyst-${exp.id}`}>Analyst: {exp.analyst_id}</p>
                  <p className="text-[9px] font-mono text-muted-foreground/70 truncate">{exp.file_hash?.slice(0, 12)}…</p>
                  <a
                    href={`/api/log-investigation/download/${exp.id}`}
                    download
                    className="inline-flex items-center gap-1 text-[9px] text-[hsl(var(--primary))] hover:underline"
                    data-testid={`link-download-export-${exp.id}`}
                  >
                    <Download className="w-2.5 h-2.5" />Download
                  </a>
                </div>
              ))}
              {(exportsQuery.data?.length ?? 0) === 0 && !lastExport && (
                <p className="text-[10px] text-muted-foreground text-center py-2">No exports yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Main Panel */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Source Selector */}
          <Card className="border-border/50">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">Data Source Tier</p>
                  <SourceSelector value={sourceMode} onChange={setSourceMode} />
                </div>
                <div className="flex items-center gap-2 self-end">
                  <TierBadge sourceMode={sourceMode} tier={queryResult?.tier} startDate={startDate} />
                </div>
              </div>

              {/* Date Range */}
              {sourceMode === "live" && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                  Live mode: date range limited to last 90 days (hot-tier retention window)
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Start Date</label>
                  <Input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs"
                    min={sourceMode === "live" ? toLocalDateTime(new Date(Date.now() - 90 * 86400000)) : undefined}
                    max={toLocalDateTime(new Date())}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">End Date</label>
                  <Input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs"
                    min={sourceMode === "live" ? toLocalDateTime(new Date(Date.now() - 90 * 86400000)) : undefined}
                    max={toLocalDateTime(new Date())}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              {/* Filters Row */}
              <div className="flex flex-wrap gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 min-w-[120px] justify-between" data-testid="select-severity">
                      {severity.length === 0 ? "+ Severity" : `Severity (${severity.length})`}
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="start">
                    <div className="space-y-1">
                      {SEVERITIES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                          <Checkbox
                            checked={severity.includes(s)}
                            onCheckedChange={(checked) =>
                              setSeverity(prev => checked ? [...prev, s] : prev.filter(x => x !== s))
                            }
                            data-testid={`check-severity-${s}`}
                          />
                          <span className="capitalize">{s}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Select value={eventType || "_"} onValueChange={(v) => setEventType(v === "_" ? "" : v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-event-type">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">All Types</SelectItem>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sourceType || "_"} onValueChange={(v) => setSourceType(v === "_" ? "" : v)}>
                  <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-source-type">
                    <SelectValue placeholder="Source Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">All Sources</SelectItem>
                    {SOURCE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Free-text search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                    data-testid="input-search"
                  />
                </div>

                <div className="relative min-w-[160px]">
                  <Input
                    placeholder="IP / user / host / hash…"
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-entity-filter"
                  />
                </div>

                {severity.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    {severity.map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="text-[10px] cursor-pointer"
                        onClick={() => setSeverity((prev) => prev.filter((x) => x !== s))}
                        data-testid={`chip-severity-${s}`}
                      >
                        {s} <X className="w-2.5 h-2.5 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Row */}
              <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => runQuery(1)}
                  disabled={isQueryPending || !tenantId}
                  data-testid="button-run-query"
                >
                  {isQueryPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run Query
                </Button>
                <SaveSessionModal
                  onSave={(name, desc) => saveSessionMutation.mutate({ name, description: desc })}
                  isPending={saveSessionMutation.isPending}
                />
                {hasQueried && !activeSession && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => toast({ title: "Save session first", description: "Save your investigation session before exporting evidence", variant: "destructive" })}
                    data-testid="button-export-requires-session"
                  >
                    <Download className="w-3 h-3 mr-1" />Export
                  </Button>
                )}
                {hasQueried && activeSession && (
                  <ExportModal
                    onExport={(name) => exportMutation.mutate(name)}
                    isPending={exportMutation.isPending}
                  />
                )}
                {activeSession && (
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    Session: {activeSession.name}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cold-tier progress */}
          {isColdQuery && pollingQueryId && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Archive className="w-4 h-4 text-amber-400 animate-pulse" />
                  <p className="text-sm font-medium text-amber-400">Searching archived logs…</p>
                  <Badge className="ml-auto bg-amber-500/10 text-amber-400 border-amber-500/30 border text-[10px]">
                    {coldProgress}%
                  </Badge>
                </div>
                <Progress value={coldProgress} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">Query ID: {pollingQueryId}</p>
              </CardContent>
            </Card>
          )}

          {coldTimedOut && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">Cold-tier query timed out after 5 minutes. Try narrowing your date range.</p>
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          <Card className="border-border/50">
            <CardHeader className="px-4 py-2.5 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  Results
                  {queryResult && (
                    <span className="ml-2 text-muted-foreground font-normal text-xs">
                      {queryResult.total.toLocaleString()} total · Page {queryResult.page} of {queryResult.totalPages}
                    </span>
                  )}
                </CardTitle>
                {queryResult && <TierBadge sourceMode={queryResult.sourceMode} tier={queryResult.tier} />}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!hasQueried && (
                <div className="py-16 text-center text-muted-foreground">
                  <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Configure your query filters above and click Run Query</p>
                </div>
              )}
              {hasQueried && isQueryPending && !pollingQueryId && (
                <div className="py-12 text-center text-muted-foreground">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40" />
                  <p className="text-sm">Querying…</p>
                </div>
              )}
              {hasQueried && !isQueryPending && rows.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No results found for the current filters</p>
                </div>
              )}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead className="text-[11px]">Timestamp</TableHead>
                        <TableHead className="text-[11px]">Source</TableHead>
                        <TableHead className="text-[11px]">Event Type</TableHead>
                        <TableHead className="text-[11px]">Severity</TableHead>
                        <TableHead className="text-[11px]">MITRE Tactic</TableHead>
                        <TableHead className="text-[11px]">Threat/Target</TableHead>
                        <TableHead className="text-[11px]">Raw Log</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <Fragment key={row.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => setDetailRow(row)}
                            data-testid={`row-result-${row.id}`}
                          >
                            <TableCell className="py-2" onClick={(e) => { e.stopPropagation(); setExpandedRow(expandedRow === row.id ? null : row.id); }}>
                              {expandedRow === row.id
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              }
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                              {new Date(row.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{row.source}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px] capitalize">{row.event_type?.replace(/_/g, " ") || "—"}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[row.severity] ?? ""}`}>
                                {row.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px]">{row.mitre_tactic || "—"}</TableCell>
                            <TableCell className="text-[11px] font-mono max-w-[160px] truncate">
                              {row.threat || row.target || "—"}
                            </TableCell>
                            <TableCell className="text-[11px] font-mono text-muted-foreground max-w-[200px] truncate">
                              {(row.raw_log || "").substring(0, 60)}{row.raw_log && row.raw_log.length > 60 ? "…" : ""}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); setExpandedRow(expandedRow === row.id ? null : row.id); }}
                                data-testid={`button-view-detail-${row.id}`}
                                title="Toggle inline details"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expandedRow === row.id && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/20 px-4 py-3">
                                <div className="space-y-2">
                                  {row.description && (
                                    <p className="text-xs text-muted-foreground">{row.description}</p>
                                  )}
                                  {row.raw_log && (
                                    <pre className="text-[10px] font-mono p-2 rounded-md bg-muted/50 overflow-x-auto max-h-32 overflow-y-auto border border-border/50">
                                      {row.raw_log}
                                    </pre>
                                  )}
                                  {row.ai_reasoning && (
                                    <div className="p-2 rounded-md bg-purple-500/5 border border-purple-500/20">
                                      <p className="text-[10px] text-purple-400 font-medium">AI Analysis</p>
                                      <p className="text-xs">{row.ai_reasoning}</p>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {queryResult && queryResult.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-3 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isQueryPending}
                    onClick={() => runQuery(page - 1)}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {queryResult.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= queryResult.totalPages || isQueryPending}
                    onClick={() => runQuery(page + 1)}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Drawer */}
      {detailRow && <DetailDrawer row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  );
}
