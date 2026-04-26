import { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { MITRE_TACTICS } from "@shared/schema";
import {
  Search, Filter, X, ChevronDown, ChevronUp, ArrowUpDown,
  Shield, Activity, Database, Eye, Copy, ExternalLink,
  Monitor, Mail, Bug, Globe, Lock, Wifi, Cloud, Users,
  HardDrive, AppWindow, AlertTriangle, ChevronLeft, ChevronRight,
  Layers, CheckCircle2, Zap, Target, Clock, FileText, Loader2,
  Plus, Brain, Bot, Sparkles, XCircle, CalendarClock, Link2, Server, Trash2,
  Crosshair, Save, Play, Pause, Archive, RotateCcw, Hash, User, Network, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AdvancedSearch, MODULE_FIELDS, type SearchQuery } from "@/components/advanced-search";
import { DataSourceBadge } from "@/components/data-source-badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";

const DOMAIN_TABS = [
  { key: "overview", label: "Overview", icon: Activity, color: "text-primary" },
  { key: "endpoint", label: "Endpoint", icon: Monitor, color: "text-blue-500" },
  { key: "email", label: "Email Security", icon: Mail, color: "text-cyan-500" },
  { key: "threat_intel", label: "Threat Intel", icon: Shield, color: "text-purple-500" },
  { key: "vulnerability", label: "Vulnerability", icon: Bug, color: "text-amber-500" },
  { key: "web", label: "Web Security", icon: Globe, color: "text-green-500" },
  { key: "network", label: "Network", icon: Wifi, color: "text-orange-500" },
  { key: "cloud", label: "Cloud", icon: Cloud, color: "text-sky-500" },
  { key: "identity", label: "Identity", icon: Users, color: "text-violet-500" },
  { key: "waf", label: "WAF", icon: Shield, color: "text-rose-500" },
  { key: "dlp", label: "DLP", icon: Lock, color: "text-emerald-500" },
  { key: "database", label: "Database", icon: Database, color: "text-indigo-500" },
  { key: "hunt", label: "Hunt", icon: Crosshair, color: "text-red-500" },
] as const;

const DOMAIN_EVENT_TYPE_MAP: Record<string, string[]> = {
  endpoint: ["endpoint"],
  email: ["email"],
  threat_intel: [],
  vulnerability: ["vulnerability"],
  web: ["casb", "sse"],
  network: ["network"],
  cloud: ["cloud"],
  identity: ["identity"],
  waf: ["waf"],
  dlp: ["dlp"],
  database: ["database"],
  hunt: [],
};

const EVENT_TYPE_ICONS: Record<string, any> = {
  endpoint: Monitor, email: Mail, vulnerability: Bug, network: Wifi,
  identity: Users, cloud: Cloud, dlp: Lock, waf: Shield, database: Database,
  casb: AppWindow, sse: Globe,
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  endpoint: "Endpoint", email: "Email", vulnerability: "Vulnerability",
  network: "Network", identity: "Identity", cloud: "Cloud",
  dlp: "DLP", waf: "WAF", casb: "CASB", sse: "SSE",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  info: "bg-slate-500/10 text-slate-600 border-slate-500/30",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-chart-4/10 text-chart-4",
  medium: "bg-chart-1/10 text-chart-1",
  low: "bg-chart-2/10 text-chart-2",
  info: "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  investigating: "bg-chart-4/10 text-chart-4",
  contained: "bg-chart-1/10 text-chart-1",
  resolved: "bg-chart-2/10 text-chart-2",
  closed: "bg-muted text-muted-foreground",
};

const LOG_SOURCE_COLORS: Record<string, string> = {
  "Checkpoint HEC": "bg-rose-500",
  "checkpoint_hec": "bg-rose-500",
  "Skyhigh SSE": "bg-sky-500",
  "skyhigh_sse": "bg-sky-500",
  "Cynet 360": "bg-violet-500",
  "cynet_360": "bg-violet-500",
  "CrowdStrike": "bg-red-500",
  "crowdstrike": "bg-red-500",
  "Azure AD": "bg-blue-500",
  "azure_ad": "bg-blue-500",
  "Generic Syslog": "bg-slate-500",
  "generic_syslog": "bg-slate-500",
};

const LOG_SOURCE_DISPLAY: Record<string, string> = {
  "checkpoint_hec": "Checkpoint HEC",
  "skyhigh_sse": "Skyhigh SSE",
  "cynet_360": "Cynet 360",
  "crowdstrike": "CrowdStrike",
  "azure_ad": "Azure AD",
  "generic_syslog": "Generic Syslog",
};

const SOURCE_FIELD_LABELS: Record<string, Record<string, string>> = {
  email: {
    attacker: "Sender",
    target: "Recipient",
    asset: "Mail Gateway",
    threat: "Email Subject / Threat",
    action: "Verdict",
  },
  endpoint: {
    attacker: "Process / Hash",
    target: "Host",
    asset: "Endpoint",
    threat: "Detection Name",
    action: "Response Action",
  },
  sse: {
    attacker: "Source IP",
    target: "User",
    asset: "Service",
    threat: "Policy Violation",
    action: "Action Taken",
  },
  casb: {
    attacker: "Source IP",
    target: "User",
    asset: "Cloud App",
    threat: "Activity",
    action: "Policy Action",
  },
  network: {
    attacker: "Source IP",
    target: "Destination IP",
    asset: "Network Device",
    threat: "Alert Name",
    action: "Firewall Action",
  },
  cloud: {
    attacker: "Principal",
    target: "Resource",
    asset: "Cloud Service",
    threat: "Finding",
    action: "Status",
  },
  identity: {
    attacker: "Source",
    target: "User Account",
    asset: "Identity Provider",
    threat: "Alert",
    action: "Result",
  },
};

function getFieldLabel(eventType: string, field: string): string {
  const labels = SOURCE_FIELD_LABELS[eventType];
  if (labels && labels[field]) return labels[field];
  const defaults: Record<string, string> = {
    attacker: "Attacker",
    target: "Target",
    asset: "Asset",
    threat: "Threat",
    action: "Action",
  };
  return defaults[field] || field;
}

function getSourceDisplayName(logSource: string): string {
  return LOG_SOURCE_DISPLAY[logSource] || logSource;
}

function getSourceColor(logSource: string): string {
  const key = logSource.toLowerCase().replace(/\s+/g, "_");
  return LOG_SOURCE_COLORS[key] || LOG_SOURCE_COLORS[logSource] || "bg-muted-foreground";
}

const ACTION_CODE_LABELS: Record<string, string> = {
  "0": "Unknown",
  "1": "Detected",
  "2": "Blocked",
  "3": "Quarantined",
  "4": "Remediated",
  "5": "Allowed",
  "6": "Isolated",
  "7": "Killed",
  "8": "Deleted",
  "9": "Restored",
  "10": "Reported",
};

const EPS_REMEDIATION_CODE_LABELS: Record<string, string> = {
  "0": "No Action", "1": "Detected Only", "2": "Process Killed", "3": "File Quarantined",
  "4": "File Deleted", "5": "Network Connection Blocked", "6": "Registry Key Removed",
  "7": "Scheduled Task Removed", "8": "Service Stopped", "9": "File Restored",
  "10": "Endpoint Isolated", "11": "Memory Scan Completed", "12": "Script Blocked",
  "13": "Exploit Prevented", "14": "Ransomware Rolled Back", "15": "Credential Theft Prevented",
  "16": "Lateral Movement Blocked", "17": "USB Device Blocked", "18": "USB Device Allowed",
  "19": "MTP Device Blocked", "20": "MTP Device Allowed", "21": "CD/DVD Device Blocked",
  "22": "CD/DVD Device Allowed", "23": "Bluetooth Device Blocked", "24": "Bluetooth Device Allowed",
  "25": "WiFi Adapter Blocked", "26": "WiFi Adapter Allowed", "27": "Printer Blocked",
  "28": "Printer Allowed", "29": "Storage Device Detected (Blocked)", "30": "Storage Device Detected (Allowed)",
  "31": "Device Control Policy Applied", "32": "Device Blocked", "33": "Device Allowed",
  "34": "File Transfer Blocked", "35": "File Transfer Allowed", "36": "Shadow Copy Deleted",
  "37": "Boot Sector Protected", "38": "MBR Protected", "39": "Honeypot File Triggered",
  "40": "Decoy Document Accessed",
};

function deriveDeviceControlLabel(meta: any): string | null {
  if (!meta || !meta.isDeviceControl) return null;
  const dt = (meta.deviceType || "").toLowerCase();
  const dn = (meta.deviceName || "").toLowerCase();
  const blocked = (meta.deviceStatus || "").toLowerCase().includes("block") ||
    (meta.epsPrevention || "").toLowerCase().includes("block");
  const allowed = (meta.deviceStatus || "").toLowerCase().includes("allow") ||
    (meta.epsPrevention || "").toLowerCase().includes("allow");
  const state = blocked ? "Blocked" : allowed ? "Allowed" : "Detected";

  if (dt === "mtp" || dn.includes("mtp")) return `MTP USB Device ${state}`;
  if (dt === "usb" || dn.includes("usb") || dt === "removable") return `USB Device ${state}`;
  if (dt === "bluetooth" || dn.includes("bluetooth")) return `Bluetooth Device ${state}`;
  if (dt === "cdrom" || dt === "cd" || dt === "dvd" || dn.includes("cd") || dn.includes("dvd")) return `CD/DVD Device ${state}`;
  if (dt === "printer" || dn.includes("printer")) return `Printer ${state}`;
  if (dt === "wifi" || dt === "wireless" || dn.includes("wifi")) return `WiFi Adapter ${state}`;
  if (dt === "storage" || dn.includes("storage")) return `Storage Device ${state}`;
  if (meta.deviceName) return `${meta.deviceName} ${state}`;
  return `Device ${state}`;
}

function deriveSmartAction(event: any): string {
  if (!event) return "—";
  const action = event.action;
  const meta: any = event.rawPayload?.rawPayload?._cynetMeta ?? null;

  if (meta) {
    const deviceLabel = deriveDeviceControlLabel(meta);
    if (deviceLabel) return deviceLabel;
    if (meta.epsRemediationCode != null) {
      const fromCode = EPS_REMEDIATION_CODE_LABELS[String(meta.epsRemediationCode)];
      if (fromCode) return fromCode;
    }
  }

  if (!action) return "—";
  const trimmed = action.trim();
  const epsCodeMatch = trimmed.match(/^EPS Code (\d+)$/i);
  if (epsCodeMatch) {
    return EPS_REMEDIATION_CODE_LABELS[epsCodeMatch[1]] || trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return ACTION_CODE_LABELS[trimmed] || `Action Code ${trimmed}`;
  }
  return trimmed;
}

const PIPELINE_STAGES = ["received", "normalized", "enriched", "correlated", "stored"] as const;
const PIPELINE_COLORS: Record<string, string> = {
  received: "bg-slate-400", normalized: "bg-blue-500", enriched: "bg-violet-500",
  correlated: "bg-amber-500", stored: "bg-green-500",
};

const TIME_RANGES = [
  { label: "1H", value: "1h", hours: 1 },
  { label: "24H", value: "24h", hours: 24 },
  { label: "7D", value: "7d", hours: 168 },
  { label: "30D", value: "30d", hours: 720 },
  { label: "90D", value: "90d", hours: 2160 },
  { label: "All", value: "all", hours: 0 },
];

function PipelineStageCard({ label, count, color, icon: Icon }: { label: string; count: number; color: string; icon: any }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card" data-testid={`pipeline-stage-${label.toLowerCase()}`}>
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{count.toLocaleString()}</p>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { currentTenant, userRole, isMSS } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const urlParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const activeDomain = urlParams.get("domain") || "overview";

  const setActiveDomain = useCallback((domain: string) => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    params.set("domain", domain);
    if (domain === "overview") {
      params.delete("eventType");
    }
    setLocation(`/events?${params.toString()}`);
    if (domain === "overview") {
      setFilters(prev => ({ ...prev, eventType: "" }));
    }
  }, [location, setLocation]);

  const [timeRange, setTimeRange] = useState(urlParams.get("timeRange") || "all");
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(50);
  const [sortBy, setSortBy] = useState("occurredAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [advancedSearchQuery, setAdvancedSearchQuery] = useState<SearchQuery | null>(null);

  const [filters, setFilters] = useState({
    eventType: urlParams.get("eventType") || "",
    severity: urlParams.get("severity") || "",
    pipelineStatus: "",
    logSource: "",
    search: urlParams.get("search") || "",
    mitreTactic: "",
    mitreTechnique: "",
    country: "",
    action: "",
  });

  const getDateRange = useCallback(() => {
    const tr = TIME_RANGES.find(t => t.value === timeRange);
    if (!tr || tr.hours === 0) return {};
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - tr.hours * 3600000);
    return { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() };
  }, [timeRange]);

  const eventTypeFilter = useMemo(() => {
    if (activeDomain === "overview") return "";
    const types = DOMAIN_EVENT_TYPE_MAP[activeDomain];
    if (types && types.length > 0) return types.join(",");
    return filters.eventType;
  }, [activeDomain, filters.eventType]);

  const buildQueryParams = useCallback(() => {
    const params: Record<string, any> = {
      page: eventsPage, pageSize: eventsPageSize, sortBy, sortOrder,
      ...getDateRange(),
    };
    if (eventTypeFilter) params.eventType = eventTypeFilter;
    Object.entries(filters).forEach(([k, v]) => { if (v && k !== "eventType") params[k] = v; });
    return params;
  }, [eventsPage, eventsPageSize, sortBy, sortOrder, filters, getDateRange, eventTypeFilter]);

  const queryParamsKey = useMemo(() => JSON.stringify(buildQueryParams()), [buildQueryParams]);

  const eventsQuery = useQuery<any>({
    queryKey: ["/api/events", currentTenant?.id, queryParamsKey],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const params = new URLSearchParams();
      const qp = buildQueryParams();
      Object.entries(qp).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
      const res = await fetch(`/api/events/${currentTenant.id}?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    refetchInterval: 10000,
  });

  const statsQuery = useQuery<any>({
    queryKey: ["/api/events", currentTenant?.id, "stats"],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const res = await fetch(`/api/events/${currentTenant.id}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });

  const domainStatsQuery = useQuery<any>({
    queryKey: ["/api/security-console", currentTenant?.id, "domain-stats", timeRange],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const dr = getDateRange();
      const params = new URLSearchParams();
      if (dr.dateFrom) params.set("dateFrom", dr.dateFrom);
      if (dr.dateTo) params.set("dateTo", dr.dateTo);
      const qs = params.toString();
      const res = await fetch(`/api/security-console/${currentTenant.id}/domain-stats${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch domain stats");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });


  const timelineQuery = useQuery<{ timeline: any[]; source?: string; latencyMs?: number }>({
    queryKey: ["/api/events", currentTenant?.id, "timeline", timeRange],
    queryFn: async () => {
      if (!currentTenant?.id) return { timeline: [] };
      const dr = getDateRange();
      const params = new URLSearchParams({ interval: timeRange });
      if (dr.dateFrom) params.set("dateFrom", dr.dateFrom);
      if (dr.dateTo) params.set("dateTo", dr.dateTo);
      const res = await fetch(`/api/events/${currentTenant.id}/timeline?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timeline");
      const json = await res.json();
      // Backward compatible: older deploys returned a bare array
      if (Array.isArray(json)) return { timeline: json };
      return json;
    },
    enabled: !!currentTenant?.id && activeDomain === "overview",
  });

  const crossSourceQuery = useQuery<any>({
    queryKey: ["/api/events", currentTenant?.id, "cross-source-correlations"],
    queryFn: async () => {
      if (!currentTenant?.id) return { correlations: [], totalCorrelations: 0 };
      const res = await fetch(`/api/events/${currentTenant.id}/cross-source-correlations`, { credentials: "include" });
      if (!res.ok) return { correlations: [], totalCorrelations: 0 };
      return res.json();
    },
    enabled: !!currentTenant?.id && activeDomain === "overview",
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!currentTenant?.id) return;
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      eventSource = new EventSource(`/api/events/stream/${currentTenant.id}`);
      eventSource.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events", currentTenant.id] });
      };
      eventSource.onerror = () => {
        eventSource?.close();
        if (!stopped) retryTimer = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { stopped = true; eventSource?.close(); if (retryTimer) clearTimeout(retryTimer); };
  }, [currentTenant?.id]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortOrder("desc"); }
    setEventsPage(1);
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setEventsPage(1);
  };

  const clearFilters = () => {
    setFilters({ eventType: "", severity: "", pipelineStatus: "", logSource: "", search: "", mitreTactic: "", mitreTechnique: "", country: "", action: "" });
    setEventsPage(1);
  };

  const eventDescribeMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await apiRequest("POST", `/api/ai/enrich-event-description/${eventId}`);
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedEvent((prev: any) => prev ? { ...prev, enrichedDescription: data.enriched_description || data.enrichedDescription } : prev);
      toast({ title: "AI Description Generated" });
    },
    onError: () => { toast({ title: "Error", description: "Failed to generate AI description.", variant: "destructive" }); },
  });

  const openEventDetail = async (event: any) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    if (currentTenant?.id && event.id) {
      try {
        const res = await fetch(`/api/events/${currentTenant.id}/detail/${event.id}`, { credentials: "include" });
        if (res.ok) setSelectedEvent(await res.json());
      } catch {}
    }
  };

  const copyEventId = (id: number) => {
    navigator.clipboard.writeText(String(id));
    toast({ title: "Copied", description: `Event ID ${id} copied to clipboard` });
  };

  const [triageState, setTriageState] = useState<Record<number, "acknowledged" | "escalated" | "suppressed" | null>>({});
  const [highFidelityMode, setHighFidelityMode] = useState(true);

  const setTriage = (eventId: number, action: "acknowledged" | "escalated" | "suppressed") => {
    setTriageState(prev => ({ ...prev, [eventId]: prev[eventId] === action ? null : action }));
  };

  const [eventEnrichProgress, setEventEnrichProgress] = useState<{ enriched: number; total: number; active: boolean; currentTenant?: string }>({ enriched: 0, total: 0, active: false });
  const [correlateProgress, setCorrelateProgress] = useState<{ phase: string; active: boolean; correlated: number }>({ phase: "", active: false, correlated: 0 });

  const startEventEnrich = async () => {
    if (eventEnrichProgress.active) return;
    setEventEnrichProgress({ enriched: 0, total: 0, active: true });
    try {
      const res = await fetch("/api/ai/enrich-all-events", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Failed" })); toast({ title: "Event enrichment failed", description: err.message, variant: "destructive" }); setEventEnrichProgress(p => ({ ...p, active: false })); return; }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) { const data = await res.json(); toast({ title: "Event Enrichment Complete", description: data.message }); setEventEnrichProgress({ enriched: 0, total: 0, active: false }); return; }
      const reader = res.body?.getReader(); const decoder = new TextDecoder();
      if (!reader) { setEventEnrichProgress(p => ({ ...p, active: false })); return; }
      let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) { if (line.startsWith("data: ")) { try { const ev = JSON.parse(line.slice(6)); setEventEnrichProgress({ enriched: ev.enriched, total: ev.total, active: !ev.done, currentTenant: ev.currentTenant }); if (ev.done) { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); queryClient.invalidateQueries({ queryKey: ["/api/security-console"] }); toast({ title: "Event Enrichment Complete", description: `Enriched ${ev.enriched} of ${ev.total} events` }); } } catch {} } } }
      setEventEnrichProgress(p => ({ ...p, active: false }));
    } catch { toast({ title: "Event enrichment failed", variant: "destructive" }); setEventEnrichProgress(p => ({ ...p, active: false })); }
  };

  const startCorrelateAndEnrich = async () => {
    if (correlateProgress.active || !currentTenant?.id) return;
    setCorrelateProgress({ phase: "Correlating entities...", active: true, correlated: 0 });
    try {
      const res1 = await fetch(`/api/correlate-entities/${currentTenant.id}`, { method: "POST", credentials: "include" });
      const reader1 = res1.body?.getReader(); const decoder = new TextDecoder();
      if (reader1) { let buffer = ""; while (true) { const { done, value } = await reader1.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) { if (line.startsWith("data: ")) { try { const d = JSON.parse(line.slice(6)); if (d.type === "progress") setCorrelateProgress(p => ({ ...p, phase: d.phase || "Correlating...", correlated: d.correlated || p.correlated })); if (d.type === "complete") setCorrelateProgress(p => ({ ...p, phase: `Correlated ${d.correlated} pairs`, correlated: d.correlated })); } catch {} } } } }
      setCorrelateProgress(p => ({ ...p, phase: "Enriching assets..." }));
      const res2 = await fetch(`/api/enrich-assets/${currentTenant.id}`, { method: "POST", credentials: "include" });
      const reader2 = res2.body?.getReader();
      if (reader2) { let buffer = ""; while (true) { const { done, value } = await reader2.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) { if (line.startsWith("data: ")) { try { const d = JSON.parse(line.slice(6)); if (d.type === "progress") setCorrelateProgress(p => ({ ...p, phase: `Enriching assets... ${d.enriched}/${d.total}` })); if (d.type === "complete") setCorrelateProgress(p => ({ ...p, phase: `Complete: ${d.enriched} assets enriched` })); } catch {} } } } }
      toast({ title: "Correlation Complete", description: "User-asset links and asset enrichment updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/security-console"] });
    } catch (err: any) { toast({ title: "Error", description: err.message || "Correlation failed", variant: "destructive" }); } finally { setCorrelateProgress(p => ({ ...p, active: false })); }
  };


  const advancedSearchResults = useQuery<any>({
    queryKey: ["/api/advanced-search", "events", currentTenant?.id, advancedSearchQuery, eventsPage, eventsPageSize, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/advanced-search/events", {
        tenantId: currentTenant?.id,
        query: advancedSearchQuery,
        page: eventsPage,
        limit: eventsPageSize,
        sortBy,
        sortDir: sortOrder,
      });
      return res.json();
    },
    enabled: !!currentTenant?.id && !!advancedSearchQuery,
  });

  const connectedIntegrationsQuery = useQuery<any[]>({
    queryKey: ["/api/tenants", currentTenant?.id, "security-integrations", "connected"],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const res = await fetch(`/api/tenants/${currentTenant.id}/security-integrations`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return (all || []).filter((i: any) => i.status === "connected");
    },
    enabled: !!currentTenant?.id,
  });
  const hasConnectedIntegrations = (connectedIntegrationsQuery.data?.length ?? 1) > 0;

  const stats = statsQuery.data;
  const events = advancedSearchQuery
    ? (advancedSearchResults.data?.data || [])
    : (eventsQuery.data?.events || []);
  const eventsTotalCount = advancedSearchQuery
    ? (advancedSearchResults.data?.total || 0)
    : (eventsQuery.data?.totalCount || 0);
  const eventsTotalPages = advancedSearchQuery
    ? (advancedSearchResults.data?.totalPages || 1)
    : (eventsQuery.data?.totalPages || 1);
  const domainStats = domainStatsQuery.data;

  const timelineData = (timelineQuery.data?.timeline || []).map((p: any) => ({
    ...p, time: fmt.formatChartLabel(p.timestamp, timeRange),
  }));

  const handleAdvancedSearchApply = useCallback((query: SearchQuery) => {
    const hasRules = query.rules.length > 0;
    setAdvancedSearchQuery(hasRules ? query : null);
    setEventsPage(1);
  }, []);

  const handleAdvancedSearchClear = useCallback(() => {
    setAdvancedSearchQuery(null);
    setEventsPage(1);
  }, []);

  const activeFilterCount = Object.values(filters).filter(v => v).length;


  const renderEventsTable = () => {
    const displayEvents = highFidelityMode
      ? events.filter((e: any) => ["critical", "high", "medium"].includes(e.severity))
      : events;

    return (
      <Card data-testid="events-table-card">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" />SOC Alert Console</p>
            {highFidelityMode ? (
              <Badge variant="secondary" className="text-xs" title={`${eventsTotalCount.toLocaleString()} total events across all severities`}>
                {displayEvents.length} shown <span className="opacity-60 ml-0.5">/ {eventsTotalCount.toLocaleString()}</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">{eventsTotalCount.toLocaleString()}</Badge>
            )}
            <Badge
              variant={highFidelityMode ? "default" : "outline"}
              className="text-[10px] cursor-pointer select-none"
              onClick={() => setHighFidelityMode(m => !m)}
              data-testid="toggle-high-fidelity"
            >
              {highFidelityMode ? "Medium+ Only" : "All Severities"}
            </Badge>
          </div>
          <Select value={String(eventsPageSize)} onValueChange={v => { setEventsPageSize(Number(v)); setEventsPage(1); }}>
            <SelectTrigger className="h-8 w-20 text-xs" data-testid="select-page-size"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(eventsQuery.isLoading || (advancedSearchQuery && advancedSearchResults.isLoading)) ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label={`Timestamp (${fmt.timezoneAbbr})`} field="occurredAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label={activeDomain !== "overview" ? getFieldLabel(DOMAIN_EVENT_TYPE_MAP[activeDomain]?.[0] || "", "threat") : "Event Name"} field="threat" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Severity" field="severity" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-xs">Detected By</TableHead>
                  <TableHead className="text-xs">{activeDomain !== "overview" ? getFieldLabel(DOMAIN_EVENT_TYPE_MAP[activeDomain]?.[0] || "", "action") : "Action"}</TableHead>
                  <TableHead className="text-xs">MITRE / IOC</TableHead>
                  <TableHead className="text-xs">Triage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayEvents.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <Shield className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    {!hasConnectedIntegrations && !connectedIntegrationsQuery.isLoading ? (
                      <>
                        <p className="text-sm font-medium">No connected integrations</p>
                        <p className="text-xs mt-1 max-w-xs mx-auto">Security events will appear here once you connect at least one integration. Events are only shown from active, connected sources.</p>
                        <Link href="/integrations"><a className="inline-block mt-3 text-xs underline text-primary">Go to Integrations Settings</a></Link>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">No alerts found</p>
                        {highFidelityMode && <p className="text-xs mt-1">High-fidelity mode active — <button className="underline" onClick={() => setHighFidelityMode(false)}>show all severities</button></p>}
                      </>
                    )}
                  </TableCell></TableRow>
                ) : displayEvents.map((event: any) => {
                  const TypeIcon = EVENT_TYPE_ICONS[event.eventType] || Shield;
                  const triage = triageState[event.id] ?? null;
                  const iocCount = event.iocReputation?.length || 0;
                  return (
                    <TableRow key={event.id} className={`cursor-pointer ${triage === "suppressed" ? "opacity-40" : ""}`} onClick={() => openEventDetail(event)} data-testid={`event-row-${event.id}`}>
                      <TableCell className="text-xs whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1">
                          {fmt.formatDateTime(event.occurredAt)}
                          {event.createdAt && event.occurredAt && (() => {
                            const lag = (new Date(event.createdAt).getTime() - new Date(event.occurredAt).getTime()) / 86400000;
                            if (lag > 7) return <Badge variant="destructive" className="text-[8px] px-1 py-0 ml-1" title={`Ingested ${Math.round(lag)}d after occurrence`}>Stale</Badge>;
                            if (lag > 1) return <Badge variant="outline" className="text-[8px] px-1 py-0 ml-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" title={`Ingested ${Math.round(lag)}d after occurrence`}>{Math.round(lag)}d old</Badge>;
                            return null;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate" title={event.threat || EVENT_TYPE_LABELS[event.eventType] || event.eventType}>{event.threat || EVENT_TYPE_LABELS[event.eventType] || event.eventType}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[event.severity] || ""}`}>{event.severity}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate" title={event.logSource || ""}>{event.logSource || event.sourceType || "—"}</TableCell>
                      <TableCell className="text-xs">{deriveSmartAction(event)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {event.mitreTactic ? <Badge variant="outline" className="text-[9px] font-mono">{event.mitreTactic}</Badge> : null}
                          {iocCount > 0 && <Badge variant="secondary" className="text-[9px]">{iocCount} IOC</Badge>}
                          <Link href={`/log-intelligence/explorer?eventId=${event.id}`} onClick={e => e.stopPropagation()} className="text-[9px] text-blue-500 hover:underline whitespace-nowrap" data-testid={`link-raw-log-${event.id}`}>View Raw Log →</Link>
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {isMSS ? (
                          <div className="flex gap-1 flex-wrap" data-testid={`triage-actions-${event.id}`}>
                            <Button size="sm" variant={triage === "acknowledged" ? "default" : "outline"} className="h-6 px-1.5 text-[9px]" onClick={() => setTriage(event.id, "acknowledged")} data-testid={`btn-ack-${event.id}`} title="Acknowledge">ACK</Button>
                            <Button size="sm" variant={triage === "escalated" ? "default" : "outline"} className="h-6 px-1.5 text-[9px] border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => setTriage(event.id, "escalated")} data-testid={`btn-esc-${event.id}`} title="Escalate">ESC</Button>
                            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[9px] border-indigo-400 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950" onClick={() => { toast({ title: "Link to Incident", description: `Select an incident to link event #${event.id}` }); }} data-testid={`btn-link-${event.id}`} title="Link to Incident">LNK</Button>
                            <Button size="sm" variant={triage === "suppressed" ? "default" : "outline"} className="h-6 px-1.5 text-[9px] border-muted-foreground text-muted-foreground" onClick={() => setTriage(event.id, "suppressed")} data-testid={`btn-sup-${event.id}`} title="Suppress">SUP</Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className={`text-[9px] ${triage ? (triage === "acknowledged" ? "border-green-500 text-green-600" : triage === "escalated" ? "border-orange-500 text-orange-600" : "border-muted-foreground text-muted-foreground") : event.status === "investigating" ? "border-orange-400 text-orange-600" : event.status === "resolved" ? "border-green-500 text-green-600" : event.status === "contained" ? "border-blue-500 text-blue-600" : "border-muted-foreground/40 text-muted-foreground"}`}>
                            {triage || event.status || "open"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {eventsTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" data-testid="events-pagination">
            <span className="text-xs text-muted-foreground">Page {eventsPage} of {eventsTotalPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={eventsPage <= 1} onClick={() => setEventsPage(p => Math.max(1, p - 1))} data-testid="button-prev-page"><ChevronLeft className="w-4 h-4" /></Button>
              {Array.from({ length: Math.min(5, eventsTotalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(eventsPage - 2, eventsTotalPages - 4));
                const p = start + i;
                if (p > eventsTotalPages) return null;
                return <Button key={p} variant={p === eventsPage ? "default" : "outline"} size="sm" onClick={() => setEventsPage(p)} className="w-8 h-8 p-0 text-xs">{p}</Button>;
              })}
              <Button variant="outline" size="sm" disabled={eventsPage >= eventsTotalPages} onClick={() => setEventsPage(p => Math.min(eventsTotalPages, p + 1))} data-testid="button-next-page"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between" data-testid="events-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            SOC Alert Console
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {currentTenant?.name} — High-fidelity alert triage across all security domains
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats && stats.byLogSource && stats.byLogSource.length > 0 && (
            <div className="flex items-center gap-1.5" data-testid="header-source-stats">
              {stats.byLogSource.slice(0, 4).map((s: any) => (
                <Badge key={s.logSource} variant="outline" className="text-[10px] gap-1" data-testid={`header-source-${s.logSource}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${getSourceColor(s.logSource)}`} />
                  {getSourceDisplayName(s.logSource)}: {s.count.toLocaleString()}
                </Badge>
              ))}
            </div>
          )}
          {domainStats && (
            <>
              <Badge variant="outline" className="text-xs" data-testid="events-total-badge">{domainStats.totalEvents?.toLocaleString()} events</Badge>
              <Badge variant="outline" className="text-xs" data-testid="incidents-total-badge">{domainStats.totalIncidents?.toLocaleString()} incidents</Badge>
            </>
          )}
          <Badge variant="secondary" className="text-xs gap-1" data-testid="data-plane-indicator"><HardDrive className="w-3 h-3" />Hot Tier</Badge>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b" data-testid="domain-tab-bar">
        {DOMAIN_TABS.map(tab => {
          const isActive = activeDomain === tab.key;
          const Icon = tab.icon;
          const domainData = tab.key !== "overview" && domainStats?.domainCounts?.[tab.key];
          const totalCount = domainData ? (domainData.events + domainData.incidents) : 0;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveDomain(tab.key); setEventsPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              data-testid={`domain-tab-${tab.key}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key !== "overview" && totalCount > 0 && (
                <Badge variant={isActive ? "secondary" : "outline"} className="text-[9px] px-1 py-0 ml-0.5">{totalCount}</Badge>
              )}
              {domainData && domainData.critical > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {activeDomain === "hunt" ? (
        <HuntWorkbench tenantId={currentTenant?.id || 0} />
      ) : activeDomain === "overview" ? (
        <div className="space-y-4">
          {stats && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="pipeline-summary">
              <PipelineStageCard label="Received" count={stats.received} color="bg-slate-400" icon={Layers} />
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <PipelineStageCard label="Normalized" count={stats.normalized} color="bg-blue-500" icon={Zap} />
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <PipelineStageCard label="Enriched" count={stats.enriched} color="bg-violet-500" icon={Target} />
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <PipelineStageCard label="Correlated" count={stats.correlated} color="bg-amber-500" icon={Activity} />
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <PipelineStageCard label="Stored" count={stats.stored} color="bg-green-500" icon={Database} />
              {stats.dlqFailed > 0 && (
                <>
                  <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
                  <PipelineStageCard label="DLQ Failed" count={stats.dlqFailed} color="bg-red-500" icon={AlertTriangle} />
                </>
              )}
              {(stats.pending || 0) > 0 && (
                <>
                  <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />
                  <PipelineStageCard label="Pending" count={stats.pending} color="bg-orange-400" icon={Clock} />
                </>
              )}
            </div>
          )}

          {stats && stats.byLogSource && stats.byLogSource.length > 0 && (
            <Card data-testid="source-breakdown-bar">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Source Breakdown</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{stats.byLogSource.length} sources</Badge>
                </div>
                <div className="flex items-center gap-1 w-full h-3 rounded-full overflow-hidden mb-3" data-testid="source-breakdown-progress">
                  {stats.byLogSource.map((s: any) => {
                    const pct = stats.total > 0 ? (s.count / stats.total) * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={s.logSource}
                        className={`h-full ${getSourceColor(s.logSource)} first:rounded-l-full last:rounded-r-full`}
                        style={{ width: `${pct}%` }}
                        title={`${getSourceDisplayName(s.logSource)}: ${s.count.toLocaleString()} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {stats.byLogSource.map((s: any) => (
                    <div key={s.logSource} className="flex items-center gap-1.5" data-testid={`source-legend-${s.logSource}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${getSourceColor(s.logSource)}`} />
                      <span className="text-xs text-muted-foreground">{getSourceDisplayName(s.logSource)}</span>
                      <span className="text-xs font-semibold">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {domainStats && (
            <Card data-testid="security-funnel">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Security Operations Funnel</span>
                </div>
                <div className="flex items-center gap-0 w-full" data-testid="funnel-stages">
                  {(() => {
                    const totalEvts = domainStats.totalEvents || 0;
                    const funnelInc = domainStats.funnelIncidents ?? (domainStats.totalIncidents - domainStats.falsePositives);
                    const investigations = domainStats.investigationCount ?? 0;
                    const stages = [
                      { label: "Security Events", count: totalEvts, color: "from-blue-500 to-blue-600", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: Database },
                      { label: "Incidents", count: Math.max(0, funnelInc), color: "from-amber-500 to-orange-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
                      { label: "Investigations", count: investigations, color: "from-red-500 to-rose-600", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: Eye },
                    ];
                    return stages.map((stage, idx) => {
                      const prev = idx > 0 ? stages[idx - 1].count : 0;
                      const reductionPct = prev > 0 ? Math.round(((prev - stage.count) / prev) * 100) : 0;
                      const widthPct = totalEvts > 0 ? Math.max(15, (stage.count / totalEvts) * 100) : 33;
                      const Icon = stage.icon;
                      return (
                        <Fragment key={stage.label}>
                          {idx > 0 && (
                            <div className="flex flex-col items-center px-1 shrink-0" data-testid={`funnel-reduction-${idx}`}>
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                              {reductionPct > 0 && (
                                <span className="text-[9px] font-semibold text-red-500 whitespace-nowrap">-{reductionPct}%</span>
                              )}
                            </div>
                          )}
                          <div
                            className={`relative overflow-hidden rounded-xl border ${stage.bg} p-3 transition-all duration-700 ease-out`}
                            style={{ width: `${widthPct}%`, minWidth: "120px", animationDelay: `${idx * 200}ms` }}
                            data-testid={`funnel-stage-${idx}`}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-r ${stage.color} opacity-[0.07]`} />
                            <div className="relative">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Icon className={`w-3.5 h-3.5 ${stage.text}`} />
                                <span className="text-[10px] font-medium text-muted-foreground">{stage.label}</span>
                              </div>
                              <p className={`text-xl font-bold ${stage.text}`}>{stage.count.toLocaleString()}</p>
                            </div>
                          </div>
                        </Fragment>
                      );
                    });
                  })()}
                </div>
                {domainStats.severityBreakdown && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t" data-testid="funnel-severity-breakdown">
                    <span className="text-[10px] text-muted-foreground">Incident Severity:</span>
                    {["critical", "high", "medium", "low", "info"].map(sev => {
                      const count = domainStats.severityBreakdown[sev] || 0;
                      if (count === 0) return null;
                      return (
                        <Badge key={sev} variant="outline" className={`text-[9px] ${SEVERITY_COLORS[sev]}`} data-testid={`funnel-sev-${sev}`}>
                          {sev}: {count.toLocaleString()}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {crossSourceQuery.data?.correlations?.length > 0 && (
            <Card data-testid="cross-source-correlations">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium">Cross-Source IOC Correlations</span>
                  <div className="ml-auto flex items-center gap-2">
                    <DataSourceBadge source={crossSourceQuery.data.source} latencyMs={crossSourceQuery.data.latencyMs} />
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      {crossSourceQuery.data.totalCorrelations} correlated IOCs
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {crossSourceQuery.data.correlations.slice(0, 8).map((c: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card" data-testid={`correlation-row-${idx}`}>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{c.iocType === "ip" ? "IP" : "Target"}</Badge>
                      <span className="text-xs font-mono font-medium truncate" title={c.iocValue}>{c.iocValue}</span>
                      <div className="flex items-center gap-1 flex-wrap ml-auto">
                        {(Array.isArray(c.eventTypes) ? c.eventTypes : []).map((et: string) => {
                          const Icon = EVENT_TYPE_ICONS[et] || Shield;
                          return (
                            <Badge key={et} variant="secondary" className="text-[9px] gap-0.5">
                              <Icon className="w-2.5 h-2.5" />
                              {EVENT_TYPE_LABELS[et] || et}
                            </Badge>
                          );
                        })}
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">{c.totalHits} hits</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {domainStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3" data-testid="domain-breakdown">
              {DOMAIN_TABS.filter(t => t.key !== "overview").map(tab => {
                const d = domainStats.domainCounts?.[tab.key] || { events: 0, incidents: 0, critical: 0, high: 0 };
                const Icon = tab.icon;
                return (
                  <Card key={tab.key} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveDomain(tab.key)} data-testid={`domain-card-${tab.key}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${tab.color}`} />
                        <span className="text-xs font-medium">{tab.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-lg font-bold">{d.events + d.incidents}</p>
                          <p className="text-[10px] text-muted-foreground">{d.events} events · {d.incidents} incidents</p>
                        </div>
                      </div>
                      {(d.critical > 0 || d.high > 0) && (
                        <div className="flex gap-1 mt-1.5">
                          {d.critical > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-500/10 text-red-600">{d.critical} critical</Badge>}
                          {d.high > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-orange-500/10 text-orange-600">{d.high} high</Badge>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {domainStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="incident-stats-bar">
              <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total Incidents</p><p className="text-lg font-semibold">{domainStats.totalIncidents}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> True Positives</p><p className="text-lg font-semibold text-green-600">{domainStats.truePositives}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3 text-red-600" /> False Positives</p><p className="text-lg font-semibold text-red-600">{domainStats.falsePositives}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Unclassified</p><p className="text-lg font-semibold text-muted-foreground">{domainStats.unclassified}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Avg Confidence</p><p className="text-lg font-semibold">{domainStats.avgConfidence}%</p></CardContent></Card>
            </div>
          )}


          <div className="flex items-center gap-2 flex-wrap" data-testid="time-range-bar">
            {TIME_RANGES.map(tr => (
              <Button key={tr.value} variant={timeRange === tr.value ? "default" : "outline"} size="sm" onClick={() => { setTimeRange(tr.value); setEventsPage(1); }} data-testid={`time-range-${tr.value}`}>{tr.label}</Button>
            ))}
            <div className="flex-1" />
            <Link href="/incidents" data-testid="link-view-incidents-overview">
              <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />View Incidents</Button>
            </Link>
          </div>

          {timelineData.length > 0 && (
            <Card data-testid="events-timeline-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Event Volume Timeline
                  <span className="ml-auto"><DataSourceBadge source={timelineQuery.data?.source} latencyMs={timelineQuery.data?.latencyMs} /></span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <RechartsTooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Critical" />
                    <Area type="monotone" dataKey="high" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.5} name="High" />
                    <Area type="monotone" dataKey="medium" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.4} name="Medium" />
                    <Area type="monotone" dataKey="low" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Low" />
                    <Area type="monotone" dataKey="info" stackId="1" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} name="Info" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {renderEventsTable()}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {(() => { const tab = DOMAIN_TABS.find(t => t.key === activeDomain); const Icon = tab?.icon || Shield; return <Icon className={`w-5 h-5 ${tab?.color || "text-primary"}`} />; })()}
              <div>
                <h2 className="text-lg font-semibold">{DOMAIN_TABS.find(t => t.key === activeDomain)?.label}</h2>
                <p className="text-xs text-muted-foreground">{domainStats?.domainCounts?.[activeDomain] ? `${domainStats.domainCounts[activeDomain].events} events · ${domainStats.domainCounts[activeDomain].incidents} incidents` : "Loading..."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMSS && (
                <>
                  <Button size="sm" variant="outline" onClick={startEventEnrich} disabled={eventEnrichProgress.active} data-testid="button-enrich-events">
                    {eventEnrichProgress.active ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Events {eventEnrichProgress.enriched}/{eventEnrichProgress.total}</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />AI Enrich Events</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={startCorrelateAndEnrich} disabled={correlateProgress.active} data-testid="button-correlate-enrich">
                    {correlateProgress.active ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{correlateProgress.phase}</> : <><Zap className="w-3.5 h-3.5 mr-1.5" />Correlate & Enrich</>}
                  </Button>
                </>
              )}
              <Link href="/incidents" data-testid="link-view-incidents">
                <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5 mr-1.5" />View Incidents</Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {TIME_RANGES.map(tr => (
              <Button key={tr.value} variant={timeRange === tr.value ? "default" : "outline"} size="sm" onClick={() => { setTimeRange(tr.value); setEventsPage(1); }} data-testid={`time-range-${tr.value}`}>{tr.label}</Button>
            ))}
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search..." value={filters.search} onChange={e => updateFilter("search", e.target.value)} className="pl-8 h-9 w-[200px] text-sm" data-testid="input-search" />
            </div>
            <AdvancedSearch
              module="events"
              onApply={handleAdvancedSearchApply}
              onClear={handleAdvancedSearchClear}
            />
          </div>

          {renderEventsTable()}
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto" data-testid="event-detail-panel">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Event Detail #{selectedEvent?.id}</SheetTitle>
          </SheetHeader>
          {selectedEvent && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={SEVERITY_COLORS[selectedEvent.severity] || ""}>{selectedEvent.severity}</Badge>
                <Badge variant="outline">{EVENT_TYPE_LABELS[selectedEvent.eventType] || selectedEvent.eventType}</Badge>
                <Button variant="ghost" size="sm" onClick={() => copyEventId(selectedEvent.id)} data-testid="button-copy-event-id"><Copy className="w-3.5 h-3.5 mr-1" /> Copy ID</Button>
              </div>
              <Tabs defaultValue="overview">
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="enrichment" className="text-xs">Enrichment</TabsTrigger>
                  <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs">Raw Payload</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-3 mt-3">
                  {selectedEvent.enrichedDescription || selectedEvent.enriched_description ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3 text-blue-500" /> AI-Generated Summary</p>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => eventDescribeMutation.mutate(selectedEvent.id)} disabled={eventDescribeMutation.isPending}>{eventDescribeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Regenerate"}</Button>
                      </div>
                      <div className="text-sm border rounded-lg p-3 bg-card">
                        {((selectedEvent.enrichedDescription || selectedEvent.enriched_description) as string).split("\n").map((line: string, idx: number) => {
                          if (line.startsWith("### ")) return <h3 key={idx} className="text-sm font-semibold mt-3 mb-1">{line.replace("### ", "")}</h3>;
                          if (line.startsWith("## ")) return <h2 key={idx} className="text-sm font-bold mt-3 mb-1">{line.replace("## ", "")}</h2>;
                          if (line.startsWith("- ") || line.startsWith("* ")) return <li key={idx} className="text-sm ml-4 list-disc">{line.replace(/^[-*]\s/, "").replace(/\*\*(.*?)\*\*/g, "$1")}</li>;
                          if (line.trim() === "") return <br key={idx} />;
                          return <p key={idx} className="text-sm">{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>;
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <DetailRow label={getFieldLabel(selectedEvent.eventType, "threat")} value={selectedEvent.threat} />
                        <Button size="sm" variant="outline" onClick={() => eventDescribeMutation.mutate(selectedEvent.id)} disabled={eventDescribeMutation.isPending} data-testid="button-ai-describe-event">
                          {eventDescribeMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Describing...</> : <><FileText className="w-3.5 h-3.5 mr-1.5" />AI Describe</>}
                        </Button>
                      </div>
                      <DetailRow label="Description" value={selectedEvent.description} />
                    </>
                  )}
                  <DetailRow label={getFieldLabel(selectedEvent.eventType, "target")} value={selectedEvent.target} />
                  <DetailRow label={getFieldLabel(selectedEvent.eventType, "attacker")} value={selectedEvent.attacker} />
                  <DetailRow label={getFieldLabel(selectedEvent.eventType, "asset")} value={selectedEvent.asset} />
                  <DetailRow label={getFieldLabel(selectedEvent.eventType, "action")} value={deriveSmartAction(selectedEvent)} />
                  <DetailRow label="Log Source" value={selectedEvent.logSource || selectedEvent.sourceType} />
                  <DetailRow label="Country" value={selectedEvent.country} />
                  <DetailRow label="Risk Score" value={selectedEvent.riskScore} />
                  <DetailRow label="Occurred At" value={selectedEvent.occurredAt ? fmt.formatDateTime(selectedEvent.occurredAt) : null} />
                  <DetailRow label="Ingested At" value={selectedEvent.createdAt ? fmt.formatDateTime(selectedEvent.createdAt) : null} />
                  {selectedEvent.createdAt && selectedEvent.occurredAt && (() => {
                    const lagDays = (new Date(selectedEvent.createdAt).getTime() - new Date(selectedEvent.occurredAt).getTime()) / 86400000;
                    if (lagDays > 1) return <DetailRow label="Ingestion Lag" value={`${Math.round(lagDays)} day${Math.round(lagDays) !== 1 ? 's' : ''} ${lagDays > 7 ? '(Stale)' : ''}`} />;
                    return null;
                  })()}
                </TabsContent>
                <TabsContent value="enrichment" className="space-y-3 mt-3">
                  <DetailRow label="MITRE Tactic" value={selectedEvent.mitreTactic} />
                  <DetailRow label="MITRE Technique" value={selectedEvent.mitreTechnique} />
                  <DetailRow label="Threat Vector" value={selectedEvent.threatVector} />
                  {selectedEvent.sigmaMatches && Array.isArray(selectedEvent.sigmaMatches) && selectedEvent.sigmaMatches.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Sigma Rule Matches</p>
                      <div className="space-y-1">
                        {selectedEvent.sigmaMatches.map((m: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs border rounded p-1.5">
                            <Badge variant="outline" className="text-[9px]">{m.severity}</Badge>
                            <span className="font-mono">{m.ruleId}</span>
                            <span className="text-muted-foreground truncate">{m.ruleTitle}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="pipeline" className="space-y-3 mt-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Pipeline Progression</p>
                    {PIPELINE_STAGES.map((stage) => {
                      const tsField = stage === "received" ? "createdAt" : `${stage}At`;
                      const ts = selectedEvent[tsField];
                      const stageIdx = PIPELINE_STAGES.indexOf(stage);
                      const currentIdx = PIPELINE_STAGES.indexOf(selectedEvent.pipelineStatus || "stored");
                      const completed = stageIdx <= currentIdx;
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${completed ? PIPELINE_COLORS[stage] : "bg-muted"}`} />
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${completed ? "" : "text-muted-foreground"}`}>{stage.charAt(0).toUpperCase() + stage.slice(1)}</p>
                            {ts && <p className="text-[10px] text-muted-foreground">{fmt.formatDateTime(ts)}</p>}
                          </div>
                          {completed && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="raw" className="mt-3">
                  <ScrollArea className="h-[400px]">
                    <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedEvent.rawPayload, null, 2) || "No raw payload available"}</pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const HUNT_HYPOTHESES = [
  { name: "Lateral Movement Hunt", description: "Detect attackers moving between systems using RDP, SMB, WMI, or PsExec", query: { search: "", eventType: "endpoint,network", severity: "high,critical", mitreTactic: "Lateral Movement" } },
  { name: "C2 Beacon Detection", description: "Find periodic beaconing patterns to external IPs indicating command and control", query: { search: "", eventType: "network,endpoint", severity: "", mitreTactic: "Command and Control" } },
  { name: "Credential Harvesting", description: "Identify credential dumping, pass-the-hash, or Kerberoasting activity", query: { search: "credential OR mimikatz OR lsass OR kerberos", eventType: "endpoint,identity", severity: "", mitreTactic: "Credential Access" } },
  { name: "DNS Tunneling", description: "Detect DNS-based data exfiltration or C2 via unusually long or frequent DNS queries", query: { search: "dns OR tunnel OR subdomain", eventType: "network", severity: "", mitreTactic: "" } },
  { name: "Living-off-the-Land", description: "Hunt for abuse of legitimate tools like PowerShell, WMI, certutil, mshta", query: { search: "powershell OR wmi OR certutil OR mshta OR bitsadmin OR rundll32", eventType: "endpoint", severity: "", mitreTactic: "Execution" } },
];

const NL_QUICK_STARTS = [
  "Show all first-time logins from overseas IPs in the last 24 hours",
  "Find lateral movement activity this week",
  "Which endpoints had PowerShell execution after hours?",
  "List all critical severity events from cloud sources",
  "Show C2 beaconing attempts by confidence score",
  "Find privilege escalation attempts in the last 7 days",
];

function HuntWorkbench({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [huntSearch, setHuntSearch] = useState("");
  const [huntEventType, setHuntEventType] = useState("");
  const [huntSeverity, setHuntSeverity] = useState("");
  const [huntTimeRange, setHuntTimeRange] = useState("7d");
  const [huntMitreTactic, setHuntMitreTactic] = useState("");
  const [pivotEntity, setPivotEntity] = useState("");
  const [pivotType, setPivotType] = useState("auto");
  const [showPivot, setShowPivot] = useState(false);
  const [activeHuntTab, setActiveHuntTab] = useState<"query" | "sessions" | "hypotheses" | "templates">("query");
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionHypothesis, setNewSessionHypothesis] = useState("");
  const [showNewSession, setShowNewSession] = useState(false);
  const [nlMode, setNlMode] = useState(true);
  const [nlQuery, setNlQuery] = useState("");
  const [nlResult, setNlResult] = useState<any>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem("nlHuntHistory");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateShared, setTemplateShared] = useState(false);
  const [typeaheadSuggestions, setTypeaheadSuggestions] = useState<string[]>([]);
  const [showTypeahead, setShowTypeahead] = useState(false);
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nlInputRef = useRef<HTMLInputElement>(null);
  const fmt = useTenantDateFormatter();

  const getHuntDateRange = useCallback(() => {
    const tr = TIME_RANGES.find(t => t.value === huntTimeRange);
    if (!tr || tr.hours === 0) return {};
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - tr.hours * 3600000);
    return { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() };
  }, [huntTimeRange]);

  const huntResultsQuery = useQuery<any>({
    queryKey: ["/api/events", tenantId, "hunt", huntSearch, huntEventType, huntSeverity, huntTimeRange, huntMitreTactic],
    queryFn: async () => {
      if (!tenantId) return null;
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");
      params.set("sortBy", "occurredAt");
      params.set("sortOrder", "desc");
      if (huntSearch) params.set("search", huntSearch);
      if (huntEventType) params.set("eventType", huntEventType);
      if (huntSeverity) params.set("severity", huntSeverity);
      if (huntMitreTactic) params.set("mitreTactic", huntMitreTactic);
      const dr = getHuntDateRange();
      if (dr.dateFrom) params.set("dateFrom", dr.dateFrom);
      if (dr.dateTo) params.set("dateTo", dr.dateTo);
      const res = await fetch(`/api/events/${tenantId}?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
    enabled: !!tenantId && (!!huntSearch || !!huntEventType || !!huntSeverity || !!huntMitreTactic),
  });

  const pivotQuery = useQuery<any>({
    queryKey: ["/api/hunt", tenantId, "pivot", pivotEntity, pivotType],
    queryFn: async () => {
      if (!tenantId || !pivotEntity) return null;
      const params = new URLSearchParams();
      params.set("entity", pivotEntity);
      if (pivotType !== "auto") params.set("entityType", pivotType);
      const res = await fetch(`/api/hunt/${tenantId}/pivot?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to pivot");
      return res.json();
    },
    enabled: !!tenantId && !!pivotEntity && showPivot,
  });

  const sessionsQuery = useQuery<any[]>({
    queryKey: ["/api/hunt-sessions", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/hunt-sessions/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { name: string; hypothesis?: string; query?: any }) => {
      const res = await apiRequest("POST", `/api/hunt-sessions/${tenantId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunt-sessions", tenantId] });
      setShowNewSession(false);
      setNewSessionName("");
      setNewSessionHypothesis("");
      toast({ title: "Hunt session created" });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; findings?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/hunt-sessions/${tenantId}/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunt-sessions", tenantId] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/hunt-sessions/${tenantId}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunt-sessions", tenantId] });
      toast({ title: "Hunt session deleted" });
    },
  });

  const templatesQuery = useQuery<any[]>({
    queryKey: ["/api/hunt", tenantId, "templates"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/hunt/${tenantId}/templates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; nlQuery: string; resolvedFilters: any; searchDescription: string; isShared: boolean }) => {
      const res = await apiRequest("POST", `/api/hunt/${tenantId}/templates`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunt", tenantId, "templates"] });
      setShowSaveTemplate(false);
      setTemplateName("");
      toast({ title: "Hunt template saved" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/hunt/${tenantId}/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunt", tenantId, "templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const fetchTypeahead = (q: string) => {
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    if (!q.trim() || !tenantId) {
      setTypeaheadSuggestions([]);
      setShowTypeahead(false);
      return;
    }
    typeaheadTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hunt/${tenantId}/typeahead?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const data = await res.json();
        setTypeaheadSuggestions(data.suggestions || []);
        setShowTypeahead((data.suggestions || []).length > 0);
      } catch {
        setShowTypeahead(false);
      }
    }, 200);
  };

  const runNLQuery = async (query: string) => {
    if (!query.trim() || !tenantId) return;
    setNlLoading(true);
    setNlResult(null);
    setShowTypeahead(false);
    try {
      const res = await fetch(`/api/hunt/${tenantId}/nl-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nlQuery: query, limit: 100, explain: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Query failed");
      setNlResult(data);
      setQueryHistory(prev => {
        const next = [query, ...prev.filter(q => q !== query)].slice(0, 10);
        try { sessionStorage.setItem("nlHuntHistory", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (err: any) {
      toast({ title: "Query failed", description: err.message, variant: "destructive" });
    } finally {
      setNlLoading(false);
    }
  };

  const doPivot = (entity: string, type?: string) => {
    setPivotEntity(entity);
    if (type) setPivotType(type);
    setShowPivot(true);
  };

  const applyHypothesis = (hyp: typeof HUNT_HYPOTHESES[0]) => {
    setHuntSearch(hyp.query.search);
    setHuntEventType(hyp.query.eventType);
    setHuntSeverity(hyp.query.severity);
    setHuntMitreTactic(hyp.query.mitreTactic);
    setNlMode(false);
    setActiveHuntTab("query");
  };

  const huntEvents = huntResultsQuery.data?.events || [];

  return (
    <div className="space-y-4" data-testid="hunt-workbench">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Crosshair className="w-5 h-5 text-red-500" />
          <div>
            <h2 className="text-lg font-semibold">Threat Hunting Workbench</h2>
            <p className="text-xs text-muted-foreground">Proactive threat detection with entity pivoting and hypothesis-driven hunts</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b pb-1">
        <button onClick={() => setActiveHuntTab("query")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeHuntTab === "query" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`} data-testid="hunt-tab-query">
          <Sparkles className="w-3.5 h-3.5" />AI Hunt
        </button>
        <button onClick={() => setActiveHuntTab("templates")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeHuntTab === "templates" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`} data-testid="hunt-tab-templates">
          <FileText className="w-3.5 h-3.5" />Templates {templatesQuery.data?.length ? <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{templatesQuery.data.length}</Badge> : null}
        </button>
        <button onClick={() => setActiveHuntTab("sessions")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeHuntTab === "sessions" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`} data-testid="hunt-tab-sessions">
          <Save className="w-3.5 h-3.5" />Sessions {sessionsQuery.data?.length ? <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{sessionsQuery.data.length}</Badge> : null}
        </button>
        <button onClick={() => setActiveHuntTab("hypotheses")} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeHuntTab === "hypotheses" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`} data-testid="hunt-tab-hypotheses">
          <Brain className="w-3.5 h-3.5" />Hypotheses
        </button>
      </div>

      {activeHuntTab === "query" && (
        <div className="space-y-4">
          {/* NL Query Bar */}
          <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">AI Natural Language Hunt</span>
                  <Badge variant="secondary" className="text-[9px]">Powered by AI</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="button-hunt-history">
                    <Clock className="w-3.5 h-3.5" />History {queryHistory.length > 0 && <Badge variant="outline" className="text-[9px] px-1">{queryHistory.length}</Badge>}
                  </button>
                  <button onClick={() => setNlMode(!nlMode)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 border rounded px-2 py-1" data-testid="button-toggle-hunt-mode">
                    <Filter className="w-3 h-3" />{nlMode ? "Switch to Filters" : "Switch to AI Mode"}
                  </button>
                </div>
              </div>

              {showHistory && queryHistory.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Recent queries</p>
                  {queryHistory.map((q, i) => (
                    <button key={i} onClick={() => { setNlQuery(q); setShowHistory(false); runNLQuery(q); }} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted flex items-center gap-2" data-testid={`history-item-${i}`}>
                      <RotateCcw className="w-3 h-3 text-muted-foreground shrink-0" />{q}
                    </button>
                  ))}
                </div>
              )}

              {nlMode ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Sparkles className="absolute left-3 top-2.5 w-4 h-4 text-primary/60" />
                      <Input
                        ref={nlInputRef}
                        placeholder="Ask anything about your security events... e.g. 'Find lateral movement this week'"
                        value={nlQuery}
                        onChange={e => { setNlQuery(e.target.value); fetchTypeahead(e.target.value); }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && nlQuery.trim()) { runNLQuery(nlQuery); setShowTypeahead(false); }
                          if (e.key === "Escape") setShowTypeahead(false);
                        }}
                        onFocus={() => { if (nlQuery.trim()) fetchTypeahead(nlQuery); }}
                        onBlur={() => setTimeout(() => setShowTypeahead(false), 150)}
                        className="pl-9 text-sm"
                        data-testid="input-nl-hunt-query"
                        autoComplete="off"
                      />
                      {showTypeahead && typeaheadSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden" data-testid="typeahead-dropdown">
                          {typeaheadSuggestions.map((s, i) => (
                            <button
                              key={i}
                              className="w-full text-left text-xs px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2"
                              onMouseDown={() => { setNlQuery(s); setShowTypeahead(false); runNLQuery(s); }}
                              data-testid={`typeahead-item-${i}`}
                            >
                              <Sparkles className="w-3 h-3 text-primary/50 shrink-0" />
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button onClick={() => { runNLQuery(nlQuery); setShowTypeahead(false); }} disabled={!nlQuery.trim() || nlLoading} size="sm" className="shrink-0" data-testid="button-run-nl-query">
                      {nlLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Crosshair className="w-4 h-4 mr-1.5" />}Hunt
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NL_QUICK_STARTS.map((q, i) => (
                      <button key={i} onClick={() => { setNlQuery(q); runNLQuery(q); }} className="text-[10px] px-2 py-1 rounded-full border border-primary/30 text-muted-foreground hover:text-foreground hover:border-primary/60 hover:bg-primary/5 transition-colors" data-testid={`quick-start-${i}`}>
                        {q.length > 55 ? q.slice(0, 52) + "…" : q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Card>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                          <Input placeholder="Free-form search (IPs, hostnames, hashes, keywords...)" value={huntSearch} onChange={e => setHuntSearch(e.target.value)} className="pl-8 text-sm" data-testid="input-hunt-search" />
                        </div>
                        <Select value={huntEventType || "_all"} onValueChange={v => setHuntEventType(v === "_all" ? "" : v)}>
                          <SelectTrigger className="w-[150px]" data-testid="select-hunt-event-type"><SelectValue placeholder="Source Type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_all">All Sources</SelectItem>
                            <SelectItem value="endpoint">Endpoint</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="network">Network</SelectItem>
                            <SelectItem value="cloud">Cloud</SelectItem>
                            <SelectItem value="identity">Identity</SelectItem>
                            <SelectItem value="vulnerability">Vulnerability</SelectItem>
                            <SelectItem value="waf">WAF</SelectItem>
                            <SelectItem value="dlp">DLP</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={huntSeverity || "_all"} onValueChange={v => setHuntSeverity(v === "_all" ? "" : v)}>
                          <SelectTrigger className="w-[130px]" data-testid="select-hunt-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_all">All Severity</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={huntMitreTactic || "_all"} onValueChange={v => setHuntMitreTactic(v === "_all" ? "" : v)}>
                          <SelectTrigger className="w-[160px]" data-testid="select-hunt-mitre"><SelectValue placeholder="MITRE Tactic" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_all">All Tactics</SelectItem>
                            {MITRE_TACTICS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {TIME_RANGES.map(tr => (
                          <Button key={tr.value} variant={huntTimeRange === tr.value ? "default" : "outline"} size="sm" onClick={() => setHuntTimeRange(tr.value)} data-testid={`hunt-time-${tr.value}`}>{tr.label}</Button>
                        ))}
                        <div className="flex-1" />
                        <Button size="sm" variant="outline" onClick={() => { setShowNewSession(true); }} data-testid="button-save-hunt"><Save className="w-3.5 h-3.5 mr-1.5" />Save as Session</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          {/* NL Results */}
          {nlMode && nlResult && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground" data-testid="nl-result-summary">{nlResult.resultSummary}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={nlResult.totalCount === 0 ? "secondary" : "default"} data-testid="nl-result-count">{nlResult.totalCount} events</Badge>
                    {nlResult.resolvedFilters?.severity && <Badge variant="outline" className="text-[10px]">{nlResult.resolvedFilters.severity}</Badge>}
                    {nlResult.resolvedFilters?.mitreTactic && <Badge variant="secondary" className="text-[10px]">{nlResult.resolvedFilters.mitreTactic}</Badge>}
                    {nlResult.resolvedFilters?.eventType && <Badge variant="outline" className="text-[10px]">{nlResult.resolvedFilters.eventType}</Badge>}
                    <Button size="sm" variant="outline" onClick={() => { setShowSaveTemplate(true); setTemplateName(nlQuery.slice(0, 60)); }} data-testid="button-save-template">
                      <Save className="w-3.5 h-3.5 mr-1.5" />Save Template
                    </Button>
                  </div>
                </div>
                {nlResult.suggestions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Try also:</span>
                    {nlResult.suggestions.map((s: string, i: number) => (
                      <button key={i} onClick={() => { setNlQuery(s); runNLQuery(s); }} className="text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" data-testid={`suggestion-${i}`}>{s.slice(0, 60)}{s.length > 60 ? "…" : ""}</button>
                    ))}
                  </div>
                )}
                {showSaveTemplate && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium">Save as Hunt Template</p>
                    <div className="flex gap-2">
                      <Input placeholder="Template name..." value={templateName} onChange={e => setTemplateName(e.target.value)} className="text-sm flex-1" data-testid="input-template-name" />
                      <div className="flex items-center gap-2">
                        <Switch checked={templateShared} onCheckedChange={setTemplateShared} id="tpl-shared" data-testid="switch-template-shared" />
                        <Label htmlFor="tpl-shared" className="text-xs">Shared</Label>
                      </div>
                      <Button size="sm" onClick={() => saveTemplateMutation.mutate({ name: templateName, nlQuery, resolvedFilters: nlResult.resolvedFilters, searchDescription: nlResult.searchDescription, isShared: templateShared })} disabled={!templateName.trim() || saveTemplateMutation.isPending} data-testid="button-confirm-save-template">
                        {saveTemplateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowSaveTemplate(false)} data-testid="button-cancel-save-template"><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                )}
                {nlResult.events?.length > 0 ? (
                  <ScrollArea className="h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Severity</TableHead>
                          <TableHead className="text-xs">Threat</TableHead>
                          <TableHead className="text-xs">Asset</TableHead>
                          <TableHead className="text-xs">MITRE</TableHead>
                          <TableHead className="text-xs min-w-[180px]"><span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" />AI Explanation</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nlResult.events.map((evt: any, idx: number) => (
                          <TableRow key={`nl-${evt.id}-${idx}`} data-testid={`nl-result-row-${idx}`}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{evt.occurred_at ? fmt.formatDateTime(evt.occurred_at) : "--"}</TableCell>
                            <TableCell className="text-xs"><Badge variant="outline" className="text-[9px]">{evt.event_type}</Badge></TableCell>
                            <TableCell className="text-xs">
                              <Badge variant={evt.severity === "critical" ? "destructive" : evt.severity === "high" ? "destructive" : "secondary"} className={`text-[9px] ${evt.severity === "high" ? "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30" : ""}`}>{evt.severity}</Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate" title={evt.threat || evt.description || ""}>{evt.threat || evt.description?.slice(0, 50) || "—"}</TableCell>
                            <TableCell className="text-xs font-mono text-[10px]">{evt.asset || evt.target || "—"}</TableCell>
                            <TableCell className="text-xs">{evt.mitre_tactic ? <Badge variant="secondary" className="text-[9px]">{evt.mitre_tactic}</Badge> : "—"}</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground max-w-[220px]" data-testid={`nl-explanation-${idx}`}>
                              {evt.aiExplanation ? (
                                <span className="flex items-start gap-1">
                                  <Bot className="w-3 h-3 text-primary/60 mt-0.5 shrink-0" />
                                  <span>{evt.aiExplanation}</span>
                                </span>
                              ) : (
                                <span className="opacity-40 italic">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm" data-testid="nl-no-results">No events matched your query. Try a different search.</div>
                )}
              </CardContent>
            </Card>
          )}

          {nlMode && nlLoading && (
            <Card>
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">AI is analyzing your query and searching events...</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm">Entity Pivot</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Input placeholder="Enter IP, hostname, user, or hash to pivot..." value={pivotEntity} onChange={e => { setPivotEntity(e.target.value); setShowPivot(false); }} className="text-sm" data-testid="input-pivot-entity" />
                </div>
                <Select value={pivotType} onValueChange={v => setPivotType(v)}>
                  <SelectTrigger className="w-[130px]" data-testid="select-pivot-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="ip">IP Address</SelectItem>
                    <SelectItem value="hostname">Hostname</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="hash">Hash</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setShowPivot(true)} disabled={!pivotEntity} data-testid="button-pivot-search"><Crosshair className="w-3.5 h-3.5 mr-1.5" />Pivot</Button>
              </div>
            </CardContent>
          </Card>

          {showPivot && pivotEntity && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-red-500" />
                  Pivot Results: <span className="font-mono text-xs">{pivotEntity}</span>
                  {pivotQuery.isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {pivotQuery.data ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" data-testid="pivot-total-events">{pivotQuery.data.totalEvents} events</Badge>
                      <Badge variant="outline" data-testid="pivot-total-incidents">{pivotQuery.data.totalIncidents} incidents</Badge>
                      {Object.entries(pivotQuery.data.sourceSummary || {}).map(([src, count]) => (
                        <Badge key={src} variant="secondary" className="text-[10px]">{src}: {String(count)}</Badge>
                      ))}
                    </div>
                    <ScrollArea className="h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Time</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Source</TableHead>
                            <TableHead className="text-xs">Severity</TableHead>
                            <TableHead className="text-xs">Summary</TableHead>
                            <TableHead className="text-xs">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pivotQuery.data.timeline || []).slice(0, 100).map((item: any, idx: number) => (
                            <TableRow key={`${item.type}-${item.id}-${idx}`} data-testid={`pivot-row-${idx}`}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{item.timestamp ? fmt.formatDateTime(item.timestamp) : "--"}</TableCell>
                              <TableCell><Badge variant={item.type === "incident" ? "destructive" : "outline"} className="text-[9px]">{item.type}</Badge></TableCell>
                              <TableCell className="text-xs">{item.source || "--"}</TableCell>
                              <TableCell><Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[item.severity] || ""}`}>{item.severity || "--"}</Badge></TableCell>
                              <TableCell className="text-xs max-w-[300px] truncate">{item.summary}</TableCell>
                              <TableCell>
                                {item.logSource && (
                                  <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => doPivot(item.logSource || "", "hostname")} data-testid={`pivot-action-${idx}`}>
                                    <RotateCcw className="w-3 h-3" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!pivotQuery.data.timeline || pivotQuery.data.timeline.length === 0) && (
                            <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No results found for this entity</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                ) : pivotQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {(huntSearch || huntEventType || huntSeverity || huntMitreTactic) && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Hunt Results
                  {huntResultsQuery.isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {huntResultsQuery.data && <Badge variant="outline" className="text-[10px]" data-testid="hunt-results-count">{huntResultsQuery.data.total || huntEvents.length} results</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Time</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Severity</TableHead>
                        <TableHead className="text-xs">Threat</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Target</TableHead>
                        <TableHead className="text-xs">Pivot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {huntEvents.map((evt: any, idx: number) => (
                        <TableRow key={evt.id || idx} data-testid={`hunt-result-${idx}`}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{evt.occurredAt ? fmt.formatDateTime(evt.occurredAt) : "--"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px]">{evt.eventType || "--"}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[evt.severity] || ""}`}>{evt.severity || "--"}</Badge></TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{evt.threat || "--"}</TableCell>
                          <TableCell className="text-xs">
                            {evt.attacker || evt.sourceIp ? (
                              <button className="font-mono text-blue-500 hover:underline text-xs" onClick={() => doPivot(evt.attacker || evt.sourceIp, "ip")} data-testid={`hunt-pivot-src-${idx}`}>{evt.attacker || evt.sourceIp}</button>
                            ) : "--"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {evt.target || evt.asset ? (
                              <button className="font-mono text-blue-500 hover:underline text-xs" onClick={() => doPivot(evt.target || evt.asset, "hostname")} data-testid={`hunt-pivot-tgt-${idx}`}>{evt.target || evt.asset}</button>
                            ) : "--"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              {evt.sourceIp && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => doPivot(evt.sourceIp, "ip")} title="Pivot on source IP"><Network className="w-3 h-3" /></Button>}
                              {evt.target && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => doPivot(evt.target, "hostname")} title="Pivot on target"><Server className="w-3 h-3" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {huntEvents.length === 0 && !huntResultsQuery.isLoading && (
                        <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">No events match your hunt query</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {showNewSession && (
            <Card>
              <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Save Hunt Session</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                <Input placeholder="Session name" value={newSessionName} onChange={e => setNewSessionName(e.target.value)} data-testid="input-session-name" />
                <Textarea placeholder="Hypothesis or notes..." value={newSessionHypothesis} onChange={e => setNewSessionHypothesis(e.target.value)} className="text-sm" data-testid="input-session-hypothesis" />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => createSessionMutation.mutate({ name: newSessionName, hypothesis: newSessionHypothesis, query: { search: huntSearch, eventType: huntEventType, severity: huntSeverity, mitreTactic: huntMitreTactic, timeRange: huntTimeRange } })} disabled={!newSessionName || createSessionMutation.isPending} data-testid="button-create-session">
                    {createSessionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewSession(false)} data-testid="button-cancel-session">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeHuntTab === "templates" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{templatesQuery.data?.length || 0} saved hunt templates</p>
          </div>
          {templatesQuery.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !templatesQuery.data?.length ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
              No hunt templates yet. Run an AI hunt and save it as a template.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {templatesQuery.data.map((tpl: any) => (
                <Card key={tpl.id} className="hover-elevate" data-testid={`template-card-${tpl.id}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-medium" data-testid={`text-template-name-${tpl.id}`}>{tpl.name}</span>
                        {tpl.is_shared && <Badge variant="secondary" className="text-[9px]">Shared</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">{tpl.nl_query}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">by {tpl.created_by} · {tpl.created_at ? fmt.formatDate(tpl.created_at) : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setNlQuery(tpl.nl_query); setNlMode(true); setActiveHuntTab("query"); runNLQuery(tpl.nl_query); }} data-testid={`button-run-template-${tpl.id}`}>
                        <Play className="w-3.5 h-3.5 mr-1.5" />Run
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteTemplateMutation.mutate(tpl.id)} disabled={deleteTemplateMutation.isPending} data-testid={`button-delete-template-${tpl.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeHuntTab === "sessions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{sessionsQuery.data?.length || 0} saved sessions</p>
            <Button size="sm" onClick={() => { setShowNewSession(true); setActiveHuntTab("query"); }} data-testid="button-new-session"><Plus className="w-3.5 h-3.5 mr-1.5" />New Session</Button>
          </div>
          {sessionsQuery.isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : (sessionsQuery.data || []).length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No hunt sessions yet. Start a hunt query and save it as a session.</CardContent></Card>
          ) : (sessionsQuery.data || []).map((session: any) => (
            <Card key={session.id} data-testid={`hunt-session-${session.id}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold" data-testid={`text-session-name-${session.id}`}>{session.name}</h3>
                    <Badge variant="outline" className={`text-[9px] ${session.hunt_session_status === "active" ? "bg-green-500/10 text-green-700 dark:text-green-400" : session.hunt_session_status === "completed" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`} data-testid={`badge-session-status-${session.id}`}>{session.hunt_session_status}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { const q = session.query || {}; setHuntSearch(q.search || ""); setHuntEventType(q.eventType || ""); setHuntSeverity(q.severity || ""); setHuntMitreTactic(q.mitreTactic || ""); if (q.timeRange) setHuntTimeRange(q.timeRange); setActiveHuntTab("query"); }} title="Load query" data-testid={`button-load-session-${session.id}`}><Play className="w-3.5 h-3.5" /></Button>
                    {session.hunt_session_status === "active" && <Button variant="ghost" size="icon" onClick={() => updateSessionMutation.mutate({ id: session.id, status: "completed" })} title="Complete" data-testid={`button-complete-session-${session.id}`}><CheckCircle2 className="w-3.5 h-3.5" /></Button>}
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" data-testid={`button-delete-session-${session.id}`}><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Hunt Session?</AlertDialogTitle><AlertDialogDescription>This will permanently delete &quot;{session.name}&quot;.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteSessionMutation.mutate(session.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {session.hypothesis && <p className="text-xs text-muted-foreground">{session.hypothesis}</p>}
                {session.findings && <p className="text-xs border-t pt-2 mt-2">{session.findings}</p>}
                <p className="text-[10px] text-muted-foreground">Created {session.created_at ? fmt.formatDateTime(session.created_at) : "--"} {session.created_by ? `by ${session.created_by}` : ""}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeHuntTab === "hypotheses" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Pre-built investigation templates to guide threat hunting</p>
          {HUNT_HYPOTHESES.map((hyp, idx) => (
            <Card key={idx} className="hover-elevate" data-testid={`hypothesis-card-${idx}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="text-sm font-semibold flex items-center gap-2" data-testid={`text-hypothesis-name-${idx}`}>
                      <Target className="w-4 h-4 text-red-500" />
                      {hyp.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">{hyp.description}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {hyp.query.eventType && hyp.query.eventType.split(",").map(t => <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>)}
                      {hyp.query.mitreTactic && <Badge variant="secondary" className="text-[9px]">{hyp.query.mitreTactic}</Badge>}
                      {hyp.query.severity && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 dark:text-red-400">{hyp.query.severity}</Badge>}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => applyHypothesis(hyp)} data-testid={`button-apply-hypothesis-${idx}`}><Play className="w-3.5 h-3.5 mr-1.5" />Run Hunt</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableHeader({ label, field, sortBy, sortOrder, onSort }: { label: string; field: string; sortBy: string; sortOrder: string; onSort: (f: string) => void }) {
  return (
    <TableHead className="text-xs cursor-pointer select-none" onClick={() => onSort(field)} data-testid={`sort-header-${field}`}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? "text-primary" : "text-muted-foreground/50"}`} />
      </div>
    </TableHead>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2" data-testid={`detail-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-xs break-all">{String(value)}</span>
    </div>
  );
}
