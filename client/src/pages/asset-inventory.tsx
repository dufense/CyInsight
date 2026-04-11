import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Monitor,
  Users,
  Network,
  Package,
  Globe,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Shield,
  Laptop,
  Server,
  Activity,
  Link2,
  Info,
  ExternalLink,
  Mail,
  Briefcase,
  Download,
  Upload,
  BarChart3,
  HardDrive,
  Cpu,
  MemoryStick,
  ShieldCheck,
  AlertCircle,
  Cloud,
  Bug,
  KeyRound,
  FileText,
  Wrench,
  Code,
  MessageSquare,
  Brain,
  CheckCircle2,
  Sparkles,
  Loader2,
  Copy,
  Trash2,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { lookupEOL } from "@/lib/eol-lookup";
import { AppIcon } from "@/lib/visual-helpers";
import { AdvancedSearch, MODULE_FIELDS, type SearchQuery } from "@/components/advanced-search";

interface SummaryData {
  devices: number;
  users: number;
  ips: number;
  software: number;
  domains: number;
  anomalies: number;
  riskDistribution: Record<string, number>;
}

interface VicariusEnrichmentData {
  vicariusAssetId?: string;
  vTags?: string[];
  vulnerabilities?: Array<{
    cveId?: string | null;
    cvssScore?: number | null;
    severity?: string | null;
    title?: string | null;
    patchAvailable?: boolean;
    publishedDate?: string | null;
  }>;
  missingPatches?: Array<{
    patchId?: string | null;
    title?: string | null;
    severity?: string | null;
    cvssScore?: number | null;
    kb?: string | null;
  }>;
  totalVulnerabilities?: number;
  criticalCount?: number;
  highCount?: number;
  missingPatchCount?: number;
}

interface DeviceRow {
  id: number;
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
  user: string;
  status: string;
  lastSeen: string;
  incidentCount: number;
  vulnerabilityCount: number;
  endpointType: string;
  agentVersion: string;
  contentVersion: string;
  preventionPolicy: string;
  extensionsPolicy: string;
  deviceHealth: string;
  processor: string;
  totalPhysicalMemory: string;
  storageInfo: string;
  systemModel: string;
  systemManufacturer: string;
  biosSerialNumber: string;
  softwareInventory: Array<{ name: string; version?: string; category?: string; source?: string }>;
  endpointGroup: string;
  cloudProvider: string;
  cloudRegion: string;
  tags: any;
  riskScore: number;
  riskLevel: string;
  pillarScores: any;
  riskBreakdown: any;
  scoreDelta: number;
  previousScore: number;
  profileCompleteness: number;
  enrichmentData?: VicariusEnrichmentData;
}

interface UserRow {
  id: number;
  userName: string;
  email: string;
  department: string;
  title: string;
  status: string;
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  isolatedRequests: number;
  sitesVisited: number;
  totalBytesMB: number;
  downloadedBytesMB: number;
  uploadedBytesMB: number;
  lastActivity: string;
  riskScore: number;
  riskLevel: string;
  pillarScores: any;
  riskBreakdown: any;
  scoreDelta: number;
  previousScore: number;
  deviceCount: number;
  urlCategories: string;
  applicationNames: string;
  topSites: any;
  linkedAssetIds: any;
  accountType?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface IPRow {
  ipAddress: string;
  ipType: string;
  deviceCount: number;
  userCount: number;
  lastSeen: string;
  activeDeviceCount: number;
  anomalyFlag: boolean;
  hostnames: string[];
}

interface SoftwareRow {
  name: string;
  category: string;
  source: string;
  deviceCount: number;
  versionCount?: number;
  activityTypes: string[];
  vendor?: string;
  version?: string;
  riskScore?: number;
}

interface VersionDetail {
  version: string;
  deviceCount: number;
  hostnames: string[];
}

interface DomainRow {
  domain: string;
  userCount: number;
  category: string;
  totalRequests: number;
}

interface AnomalyData {
  anomalies: Array<{
    type: string;
    severity: string;
    description: string;
    ipAddress?: string;
    userName?: string;
    deviceCount: number;
    entities: { hostnames?: string[]; users?: string[]; ips?: string[] };
    firstSeen: string;
    lastSeen: string;
  }>;
  total: number;
  summary: {
    sharedIPs: number;
    multiDeviceUsers: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
}

interface CorrelationData {
  entityType: string;
  entityId: string;
  device?: any;
  user?: any;
  relatedDevices: any[];
  relatedUsers: any[];
  relatedIPs: any[];
  relatedSoftware: any[];
}

function riskBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  switch (level?.toLowerCase()) {
    case "critical": return "destructive";
    case "high": return "destructive";
    case "medium": return "default";
    case "low": return "secondary";
    default: return "outline";
  }
}

function riskScoreColor(score: number): string {
  if (score >= 80) return "text-red-600 dark:text-red-400";
  if (score >= 60) return "text-orange-600 dark:text-orange-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function riskGradient(score: number): string {
  if (score >= 80) return "from-red-500 to-red-600";
  if (score >= 60) return "from-orange-400 to-orange-600";
  if (score >= 40) return "from-yellow-400 to-yellow-500";
  return "from-green-400 to-green-500";
}

function RiskScoreBar({ score, level }: { score: number; level: string }) {
  const w = Math.min(100, Math.max(0, score || 0));
  return (
    <div className="flex items-center gap-2 min-w-[120px]" data-testid="risk-score-bar">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${riskGradient(score || 0)} animate-progress-fill`}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-7 text-right ${riskScoreColor(score || 0)}`}>{score || 0}</span>
    </div>
  );
}

function StatusWithPulse({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const isActive = s === "active";
  const isCritical = s === "critical";
  const isDecom = s === "decommissioned";
  return (
    <div className="flex items-center gap-1.5">
      {(isActive || isCritical || isDecom) && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-green-500" : isDecom ? "bg-red-500" : "bg-red-500"} ${isDecom ? "" : "animate-pulse-dot"}`} />
      )}
      <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
    </div>
  );
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case "active": return "default";
    case "inactive": return "secondary";
    case "decommissioned": return "destructive";
    case "offline": return "outline";
    default: return "outline";
  }
}

function SortHeader({ label, field, currentSort, currentOrder, onSort }: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: string;
  onSort: (field: string) => void;
}) {
  const isActive = currentSort === field;
  return (
    <TableHead
      className="cursor-pointer select-none hover-elevate"
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}

function PillarScoreBar({ label, score }: { label: string; score: number }) {
  const w = Math.min(100, Math.max(0, score));
  const color = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-500" : score >= 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2" data-testid={`pillar-${label}`}>
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{score}</span>
    </div>
  );
}

function CorrelationPanel({ tenantId, entityType, entityId, onClose }: {
  tenantId: number;
  entityType: string;
  entityId: string;
  onClose: () => void;
}) {
  const { formatDateTimeShort } = useTenantDateFormatter();

  const { data, isLoading } = useQuery<CorrelationData>({
    queryKey: ["/api/asset-inventory", tenantId, "correlations", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/correlations?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`);
      if (!res.ok) throw new Error("Failed to load correlations");
      return res.json();
    },
    enabled: !!tenantId && !!entityId,
  });

  return (
    <Card className="border-l-0 rounded-l-none" data-testid="panel-correlation">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm">Entity Correlations</CardTitle>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-correlation">
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : data ? (
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-4 pr-3">
              {data.device && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Device Info</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Hostname</span><span className="font-medium">{data.device.hostname}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span>{data.device.ipAddress}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">OS</span><span>{data.device.os}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={statusBadgeVariant(data.device.status)}>{data.device.status}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Last Seen</span><span className="text-xs">{formatDateTimeShort(data.device.lastSeen)}</span></div>
                  </div>
                </div>
              )}

              {data.user && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">User Info</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span className="font-medium">{data.user.userName}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-xs">{data.user.email || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span>{data.user.department || "—"}</span></div>
                  </div>
                </div>
              )}

              {data.relatedDevices.length > 0 && (
                <div>
                  <Separator className="mb-3" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Related Devices ({data.relatedDevices.length})
                  </h4>
                  <div className="space-y-2">
                    {data.relatedDevices.map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50" data-testid={`correlation-device-${i}`}>
                        <div className="flex items-center gap-2">
                          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{d.hostname}</span>
                        </div>
                        <Badge variant={statusBadgeVariant(d.status)}>{d.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.relatedUsers.length > 0 && (
                <div>
                  <Separator className="mb-3" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Related Users ({data.relatedUsers.length})
                  </h4>
                  <div className="space-y-2">
                    {data.relatedUsers.map((u: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50" data-testid={`correlation-user-${i}`}>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{u.userName}</span>
                            {u.email && <span className="text-xs text-muted-foreground ml-2">{u.email}</span>}
                          </div>
                        </div>
                        {u.riskScore != null && <span className={`text-xs font-medium ${riskScoreColor(u.riskScore)}`}>{u.riskScore}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.relatedIPs.length > 0 && (
                <div>
                  <Separator className="mb-3" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Related IPs ({data.relatedIPs.length})
                  </h4>
                  <div className="space-y-1">
                    {data.relatedIPs.map((ip: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-1.5" data-testid={`correlation-ip-${i}`}>
                        <Network className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs">{ip.ipAddress}</span>
                        {ip.relation && <Badge variant="outline">{ip.relation}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.relatedSoftware && data.relatedSoftware.length > 0 && (
                <div>
                  <Separator className="mb-3" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Installed Software ({data.relatedSoftware.length})
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {data.relatedSoftware.map((sw: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5" data-testid={`correlation-sw-${i}`}>
                        <div className="flex items-center gap-2">
                          <Package className="w-3 h-3 text-muted-foreground" />
                          <span>{sw.name}</span>
                        </div>
                        {sw.category && <span className="text-muted-foreground">{sw.category}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">No correlation data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Vicarius Vulnerability Enrichment Panel
// ---------------------------------------------------------------------------

function severityBadgeVariant(severity?: string | null): "destructive" | "secondary" | "default" | "outline" {
  const s = (severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "default";
  return "secondary";
}

function cvssColor(score?: number | null): string {
  if (!score) return "text-muted-foreground";
  if (score >= 9) return "text-red-600 dark:text-red-400 font-semibold";
  if (score >= 7) return "text-orange-600 dark:text-orange-400 font-semibold";
  if (score >= 4) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function VicariusEnrichmentPanel({ enrichmentData, deviceId }: { enrichmentData: VicariusEnrichmentData; deviceId: number }) {
  const [open, setOpen] = useState(false);
  const [showAllVulns, setShowAllVulns] = useState(false);
  const [showAllPatches, setShowAllPatches] = useState(false);

  const vulns = enrichmentData.vulnerabilities || [];
  const patches = enrichmentData.missingPatches || [];
  const vTags = enrichmentData.vTags || [];
  const total = enrichmentData.totalVulnerabilities ?? vulns.length;
  const critical = enrichmentData.criticalCount ?? 0;
  const high = enrichmentData.highCount ?? 0;
  const missingPatchCount = enrichmentData.missingPatchCount ?? patches.length;

  const displayVulns = showAllVulns ? vulns : vulns.slice(0, 10);
  const displayPatches = showAllPatches ? patches : patches.slice(0, 10);

  return (
    <div className="space-y-2" data-testid={`vicarius-panel-${deviceId}`}>
      {/* Collapsible header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between group"
        data-testid={`button-vic-collapse-${deviceId}`}
      >
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Bug className="w-3.5 h-3.5 text-rose-500" /> Vicarius vRx — Vulnerability Intelligence
          <span className="text-[9px] normal-case font-normal ml-1 text-rose-600 dark:text-rose-400">
            {critical > 0 && `${critical} critical`}
            {critical > 0 && high > 0 && " · "}
            {high > 0 && `${high} high`}
            {total > 0 && critical === 0 && high === 0 && `${total} vulns`}
          </span>
        </h4>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="space-y-3 pt-1">
          {/* Summary KPI strip */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-2.5 py-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-bold text-rose-700 dark:text-rose-300" data-testid={`text-vic-total-${deviceId}`}>{total}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2.5 py-1">
              <Shield className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="text-xs text-muted-foreground">Critical</span>
              <span className="text-sm font-bold text-red-700 dark:text-red-300" data-testid={`text-vic-critical-${deviceId}`}>{critical}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-2.5 py-1">
              <Info className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span className="text-xs text-muted-foreground">High</span>
              <span className="text-sm font-bold text-orange-700 dark:text-orange-300" data-testid={`text-vic-high-${deviceId}`}>{high}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1">
              <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-muted-foreground">Patches</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300" data-testid={`text-vic-patches-${deviceId}`}>{missingPatchCount}</span>
            </div>
            {vTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">vTags:</span>
                {vTags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 border-violet-400/40 text-violet-600 dark:text-violet-400" data-testid={`badge-vtag-${deviceId}-${i}`}>{tag}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* CVE Table */}
          {vulns.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">Top CVEs</p>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">CVE ID</th>
                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">CVSS</th>
                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Severity</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Title</th>
                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Patch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayVulns.map((v, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-2 py-1.5 font-mono text-[10px] text-blue-600 dark:text-blue-400" data-testid={`text-cve-id-${deviceId}-${i}`}>{v.cveId || "—"}</td>
                        <td className={`px-2 py-1.5 text-center font-mono ${cvssColor(v.cvssScore)}`} data-testid={`text-cvss-${deviceId}-${i}`}>{v.cvssScore?.toFixed(1) ?? "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {v.severity ? (
                            <Badge variant={severityBadgeVariant(v.severity)} className="text-[9px] px-1.5 py-0" data-testid={`badge-severity-${deviceId}-${i}`}>
                              {v.severity}
                            </Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px] hidden md:table-cell" data-testid={`text-cve-title-${deviceId}-${i}`}>{v.title || "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {v.patchAvailable ? (
                            <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-green-600">Yes</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">No</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vulns.length > 10 && (
                <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs text-muted-foreground" onClick={() => setShowAllVulns(!showAllVulns)} data-testid={`button-vulns-expand-${deviceId}`}>
                  {showAllVulns ? "Show less" : `Show all ${vulns.length} CVEs`}
                </Button>
              )}
            </div>
          )}

          {/* Missing Patches */}
          {patches.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">Missing Patches</p>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Title</th>
                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Severity</th>
                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">CVSS</th>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground hidden md:table-cell">KB Article</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPatches.map((p, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]" data-testid={`text-patch-title-${deviceId}-${i}`}>{p.title || "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {p.severity ? (
                            <Badge variant={severityBadgeVariant(p.severity)} className="text-[9px] px-1.5 py-0" data-testid={`badge-patch-sev-${deviceId}-${i}`}>
                              {p.severity}
                            </Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-2 py-1.5 text-center font-mono ${cvssColor(p.cvssScore)}`} data-testid={`text-patch-cvss-${deviceId}-${i}`}>{p.cvssScore?.toFixed(1) ?? "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-blue-600 dark:text-blue-400 hidden md:table-cell" data-testid={`text-patch-kb-${deviceId}-${i}`}>{p.kb || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {patches.length > 10 && (
                <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs text-muted-foreground" onClick={() => setShowAllPatches(!showAllPatches)} data-testid={`button-patches-expand-${deviceId}`}>
                  {showAllPatches ? "Show less" : `Show all ${patches.length} patches`}
                </Button>
              )}
            </div>
          )}

          {vulns.length === 0 && patches.length === 0 && (
            <p className="text-xs text-muted-foreground italic" data-testid={`text-vic-empty-${deviceId}`}>No vulnerabilities or missing patches found for this asset.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceTab({ tenantId }: { tenantId: number }) {
  const { formatDateTimeShort } = useTenantDateFormatter();
  const { isMSS } = useTenant();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [syncingAssetId, setSyncingAssetId] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<number, { synced: boolean; count: number; total?: number; error?: string }>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");
  const [osFilter, setOsFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("hostname");
  const [sortOrder, setSortOrder] = useState("asc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [correlationEntity, setCorrelationEntity] = useState<{ type: string; id: string } | null>(null);
  const [advancedSearchQuery, setAdvancedSearchQuery] = useState<SearchQuery | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (riskLevel !== "all") p.set("riskLevel", riskLevel);
    if (osFilter) p.set("os", osFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (criticalityFilter !== "all") p.set("criticality", criticalityFilter);
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [page, pageSize, debouncedSearch, riskLevel, osFilter, statusFilter, criticalityFilter, sortBy, sortOrder]);

  const { data, isLoading } = useQuery<PaginatedResponse<DeviceRow>>({
    queryKey: ["/api/asset-inventory", tenantId, "devices", page, pageSize, debouncedSearch, riskLevel, osFilter, statusFilter, criticalityFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/devices?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch devices");
      return res.json();
    },
    enabled: !!tenantId && !advancedSearchQuery,
  });

  const advancedSearchResults = useQuery<any>({
    queryKey: ["/api/advanced-search", "assets", tenantId, advancedSearchQuery, page, pageSize, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/advanced-search/assets", {
        tenantId,
        query: advancedSearchQuery,
        page,
        limit: pageSize,
        sortBy,
        sortDir: sortOrder,
      });
      return res.json();
    },
    enabled: !!tenantId && !!advancedSearchQuery,
  });

  const handleAdvancedSearchApply = useCallback((query: SearchQuery) => {
    const hasRules = query.rules.length > 0;
    setAdvancedSearchQuery(hasRules ? query : null);
    setPage(1);
  }, []);

  const handleAdvancedSearchClear = useCallback(() => {
    setAdvancedSearchQuery(null);
    setPage(1);
  }, []);

  const activeData = advancedSearchQuery ? advancedSearchResults.data : data;
  const activeLoading = advancedSearchQuery ? advancedSearchResults.isLoading : isLoading;

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  return (
    <div className="flex gap-0" data-testid="tab-device-content">
      <div className={`flex-1 min-w-0 ${correlationEntity ? "pr-0" : ""}`}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search hostname, IP, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-device-search"
            />
          </div>
          <Select value={riskLevel} onValueChange={(v) => { setRiskLevel(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-device-risk">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px]" data-testid="select-device-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="decommissioned">Decommissioned</SelectItem>
              <SelectItem value="decom_planned">Decom Planned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={criticalityFilter} onValueChange={(v) => { setCriticalityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-device-criticality">
              <SelectValue placeholder="Criticality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criticality</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="unclassified">Unclassified</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="OS filter..."
            value={osFilter}
            onChange={(e) => { setOsFilter(e.target.value); setPage(1); }}
            className="w-[140px]"
            data-testid="input-device-os"
          />
          <AdvancedSearch
            module="assets"
            onApply={handleAdvancedSearchApply}
            onClear={handleAdvancedSearchClear}
          />
        </div>

        {activeLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <SortHeader label="Hostname" field="hostname" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="IP Address" field="ip_address" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="OS" field="operating_system" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>User</TableHead>
                    <TableHead>Criticality</TableHead>
                    <SortHeader label="CIS" field="cis_score" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Risk Score" field="risk_score" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Status" field="status" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Last Seen" field="last_seen" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Incidents" field="incident_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Vulns" field="vulnerability_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="text-center">Profile</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activeData?.data || []).map((device: any) => (
                    <>
                      <TableRow
                        key={device.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setCorrelationEntity({ type: "device", id: String(device.id) })}
                        data-testid={`row-device-${device.id}`}
                      >
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setExpandedRow(expandedRow === device.id ? null : device.id); }}
                            data-testid={`button-expand-${device.id}`}
                          >
                            <Info className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-hostname-${device.id}`}>
                          <Link
                            href={`/assets/${tenantId}/${encodeURIComponent(device.hostname)}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-device-detail-${device.id}`}
                          >
                            {device.hostname}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-ip-${device.id}`}>{device.ipAddress || "—"}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-os-${device.id}`}>{device.operatingSystem || "—"}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-user-${device.id}`}>{(device.user && !/^\d+$/.test(device.user)) ? device.user : "—"}</TableCell>
                        <TableCell data-testid={`badge-criticality-${device.id}`}>
                          {device.criticality ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                              style={{
                                color: device.criticality === "critical" ? "#ef4444" : device.criticality === "high" ? "#f97316" : device.criticality === "medium" ? "#3b82f6" : device.criticality === "low" ? "#22c55e" : "#6b7280",
                                backgroundColor: device.criticality === "critical" ? "#ef444415" : device.criticality === "high" ? "#f9731615" : device.criticality === "medium" ? "#3b82f615" : device.criticality === "low" ? "#22c55e15" : "#6b728015",
                                border: `1px solid ${device.criticality === "critical" ? "#ef444440" : device.criticality === "high" ? "#f9731640" : device.criticality === "medium" ? "#3b82f640" : device.criticality === "low" ? "#22c55e40" : "#6b728040"}`,
                              }}>
                              {device.criticality}
                            </span>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </TableCell>
                        <TableCell data-testid={`text-cis-${device.id}`}>
                          {device.cisScore != null ? (
                            <span className="text-[11px] font-semibold" style={{ color: device.cisScore >= 70 ? "#22c55e" : device.cisScore >= 40 ? "#f59e0b" : "#ef4444" }}>
                              {device.cisScore}
                            </span>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </TableCell>
                        <TableCell data-testid={`text-riskscore-${device.id}`}>
                          <RiskScoreBar score={device.riskScore} level={device.riskLevel} />
                        </TableCell>
                        <TableCell data-testid={`badge-status-${device.id}`}><StatusWithPulse status={device.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-lastseen-${device.id}`}>{formatDateTimeShort(device.lastSeen)}</TableCell>
                        <TableCell className="text-center" data-testid={`text-incidents-${device.id}`}>{device.incidentCount}</TableCell>
                        <TableCell className="text-center" data-testid={`text-vulns-${device.id}`}>{device.vulnerabilityCount}</TableCell>
                        <TableCell className="text-center" data-testid={`text-profile-${device.id}`}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <Progress value={device.profileCompleteness || 0} className="w-12 h-1.5" />
                            <span className={`text-xs font-medium ${(device.profileCompleteness || 0) >= 90 ? "text-green-600" : (device.profileCompleteness || 0) >= 70 ? "text-yellow-600" : "text-orange-600"}`}>
                              {device.profileCompleteness || 0}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRow === device.id && (
                        <TableRow key={`expand-${device.id}`}>
                          <TableCell colSpan={11} className="bg-muted/30 p-4">
                            <div className="space-y-4" data-testid={`expanded-${device.id}`}>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5" /> Hardware Info
                                  </h4>
                                  <div className="space-y-1.5 text-sm">
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Processor</span><span className="text-xs text-right truncate" data-testid={`text-processor-${device.id}`}>{device.processor || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">RAM</span><span className="text-xs" data-testid={`text-ram-${device.id}`}>{device.totalPhysicalMemory || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Storage</span><span className="text-xs text-right truncate" data-testid={`text-storage-${device.id}`}>{device.storageInfo || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Model</span><span className="text-xs text-right truncate" data-testid={`text-model-${device.id}`}>{device.systemModel || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Manufacturer</span><span className="text-xs" data-testid={`text-manufacturer-${device.id}`}>{device.systemManufacturer || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">BIOS Serial</span><span className="text-xs font-mono" data-testid={`text-bios-${device.id}`}>{device.biosSerialNumber || "—"}</span></div>
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Security Coverage
                                  </h4>
                                  <div className="space-y-1.5 text-sm">
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Agent Version</span><span className="text-xs" data-testid={`text-agent-${device.id}`}>{device.agentVersion || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Content Version</span><span className="text-xs" data-testid={`text-content-${device.id}`}>{device.contentVersion || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Prevention Policy</span><span className="text-xs truncate" data-testid={`text-prevention-${device.id}`}>{device.preventionPolicy || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Extensions Policy</span><span className="text-xs truncate" data-testid={`text-extensions-${device.id}`}>{device.extensionsPolicy || "—"}</span></div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-muted-foreground shrink-0">Device Health</span>
                                      {device.deviceHealth ? (
                                        <Badge variant={device.deviceHealth.toLowerCase() === "healthy" ? "default" : device.deviceHealth.toLowerCase() === "warning" ? "outline" : "destructive"} data-testid={`badge-health-${device.id}`}>
                                          {device.deviceHealth}
                                        </Badge>
                                      ) : <span className="text-xs">—</span>}
                                    </div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Endpoint Type</span><span className="text-xs">{device.endpointType || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Group</span><span className="text-xs">{device.endpointGroup || "—"}</span></div>
                                    {device.cloudProvider && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Cloud</span><span className="text-xs">{device.cloudProvider} / {device.cloudRegion}</span></div>}
                                    {Array.isArray(device.sourcePlatforms) && device.sourcePlatforms.length > 0 && (
                                      <div className="pt-1">
                                        <div className="text-muted-foreground text-[10px] mb-1">Sync Sources</div>
                                        <div className="flex flex-wrap gap-1">
                                          {(device.sourcePlatforms as string[]).map((p: string) => (
                                            <Badge key={p} variant="outline" className="text-[9px] px-1.5 py-0 font-mono border-blue-500/30 text-blue-600 dark:text-blue-400" data-testid={`badge-sourceplat-${device.id}-${p}`}>{p}</Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5" /> Incidents & Risk
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-muted-foreground shrink-0">Incidents</span>
                                      <Badge variant={device.incidentCount > 0 ? "destructive" : "secondary"} data-testid={`badge-incidents-${device.id}`}>{device.incidentCount}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-muted-foreground shrink-0">Vulnerabilities</span>
                                      <Badge variant={device.vulnerabilityCount > 5 ? "destructive" : device.vulnerabilityCount > 0 ? "default" : "secondary"} data-testid={`badge-vulns-${device.id}`}>{device.vulnerabilityCount}</Badge>
                                    </div>
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-muted-foreground shrink-0">Risk Score</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className={`font-semibold ${riskScoreColor(device.riskScore)}`} data-testid={`text-risk-expanded-${device.id}`}>{device.riskScore}</span>
                                          <Badge variant={riskBadgeVariant(device.riskLevel)}>{device.riskLevel}</Badge>
                                        </div>
                                      </div>
                                      <Progress value={device.riskScore} className="h-2" data-testid={`progress-risk-${device.id}`} />
                                    </div>
                                    {device.scoreDelta != null && device.scoreDelta !== 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Score Change</span>
                                        <span className={device.scoreDelta > 0 ? "text-red-500 dark:text-red-400" : "text-green-500 dark:text-green-400"}>
                                          {device.scoreDelta > 0 ? "+" : ""}{device.scoreDelta} (from {device.previousScore})
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Risk Pillar Breakdown</h4>
                                  {device.pillarScores ? (
                                    <div className="space-y-2">
                                      {Object.entries(device.pillarScores as Record<string, number>).map(([key, val]) => (
                                        <PillarScoreBar key={key} label={key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} score={val} />
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No pillar scores available</p>
                                  )}
                                </div>
                              </div>

                              {/* Vicarius Vulnerability Enrichment Panel */}
                              {device.enrichmentData?.vulnerabilities && (
                                <>
                                  <Separator />
                                  <VicariusEnrichmentPanel enrichmentData={device.enrichmentData} deviceId={device.id} />
                                </>
                              )}

                              <Separator />

                              <div>
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Package className="w-3.5 h-3.5" /> Software Inventory
                                    {device.softwareInventory && Array.isArray(device.softwareInventory) && (
                                      <Badge variant="secondary">{device.softwareInventory.length}</Badge>
                                    )}
                                  </h4>
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {syncStatus[device.id] && (
                                      <span className="text-[10px] text-muted-foreground" data-testid={`text-sync-status-${device.id}`}>
                                        {syncStatus[device.id].error
                                          ? <span className="text-red-500">{syncStatus[device.id].error}</span>
                                          : syncStatus[device.id].count > 0
                                            ? <span className="text-green-600">+{syncStatus[device.id].count} added{syncStatus[device.id].total ? ` (${syncStatus[device.id].total} total)` : ''}</span>
                                            : <span className="text-muted-foreground">{syncStatus[device.id].total ? `${syncStatus[device.id].total} items current` : 'Already up to date'}</span>}
                                      </span>
                                    )}
                                    {isMSS && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] px-2 gap-1"
                                        disabled={syncingAssetId === device.id}
                                        data-testid={`button-sync-software-${device.id}`}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setSyncingAssetId(device.id);
                                          try {
                                            const res = await apiRequest("POST", `/api/assets/${device.id}/refresh-software`);
                                            const result = await res.json();
                                            const totalAdded = (result.addedFromEvents || 0) + (result.addedFromCynet || 0);
                                            setSyncStatus(prev => ({ ...prev, [device.id]: { synced: true, count: totalAdded, total: result.totalSoftware || 0 } }));
                                            queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory", tenantId, "devices"] });
                                          } catch (err: any) {
                                            setSyncStatus(prev => ({ ...prev, [device.id]: { synced: false, count: 0, error: err.message || "Sync failed" } }));
                                          } finally {
                                            setSyncingAssetId(null);
                                          }
                                        }}
                                      >
                                        {syncingAssetId === device.id ? (
                                          <><RefreshCw className="w-2.5 h-2.5 animate-spin" />Syncing…</>
                                        ) : (
                                          <><RefreshCw className="w-2.5 h-2.5" />Sync Tools</>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {(() => {
                                  const inv = Array.isArray(device.softwareInventory) ? device.softwareInventory : [];
                                  const SENTINEL_NAMES = ["cyneteps", "fortinac", "sentinel agent", "crowdstrike falcon sensor", "microsoft defender antivirus", "windows security health service"];
                                  const isSentinelOnly = inv.length > 0 && inv.every((sw: any) => SENTINEL_NAMES.some(s => (sw.name || "").toLowerCase().includes(s)));
                                  const hasRealSoftware = inv.length > 0 && !isSentinelOnly;
                                  return hasRealSoftware ? null : (
                                    <p className="text-xs text-muted-foreground" data-testid={`text-no-software-${device.id}`}>
                                      {isSentinelOnly
                                        ? <>Only security agent detected. No additional software data available. {isMSS && <span>Use <b>Sync Security Tools</b> to fetch the full inventory.</span>}</>
                                        : <>No software inventory data available. {isMSS && <span>Use <b>Sync Security Tools</b> to pull the latest inventory.</span>}</>
                                      }
                                    </p>
                                  );
                                })()}
                                {device.softwareInventory && Array.isArray(device.softwareInventory) && (() => {
                                  const inv = device.softwareInventory;
                                  const SENTINEL_NAMES = ["cyneteps", "fortinac", "sentinel agent", "crowdstrike falcon sensor", "microsoft defender antivirus", "windows security health service"];
                                  const isSentinelOnly = inv.length > 0 && inv.every((sw: any) => SENTINEL_NAMES.some(s => (sw.name || "").toLowerCase().includes(s)));
                                  return inv.length > 0 && !isSentinelOnly;
                                })() ? (
                                  <ScrollArea className="h-48" data-testid={`software-list-${device.id}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-3">
                                      {device.softwareInventory.map((sw: any, idx: number) => {
                                        const eolInfo = lookupEOL(sw.name || "", sw.version || "");
                                        return (
                                          <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/50 gap-2" data-testid={`software-item-${device.id}-${idx}`}>
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                              <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                                              <span className="truncate font-medium">{sw.name}</span>
                                              {sw.version && <span className="text-muted-foreground shrink-0">{sw.version}</span>}
                                            </div>
                                            {eolInfo && (
                                              <Badge
                                                variant={eolInfo.eolStatus === "ended" ? "destructive" : eolInfo.eolStatus === "approaching" ? "outline" : "secondary"}
                                                className={eolInfo.eolStatus === "approaching" ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" : ""}
                                                data-testid={`badge-eol-sw-${device.id}-${idx}`}
                                              >
                                                {eolInfo.eolStatus === "ended" ? "EOL" : eolInfo.eolStatus === "approaching" ? "EOL Soon" : "Supported"}
                                              </Badge>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </ScrollArea>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {(activeData?.data || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No devices found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground" data-testid="text-device-count">
                Showing {((activeData?.page || 1) - 1) * (activeData?.pageSize || 50) + 1}–{Math.min((activeData?.page || 1) * (activeData?.pageSize || 50), activeData?.total || 0)} of {activeData?.total || 0}
              </span>
              <div className="flex items-center gap-2">
                <Button
                 
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-device-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {activeData?.page || 1} of {activeData?.totalPages || 1}</span>
                <Button
                 
                  variant="outline"
                  disabled={page >= (activeData?.totalPages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-device-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {correlationEntity && (
        <div className="w-80 shrink-0 border-l ml-0">
          <CorrelationPanel
            tenantId={tenantId}
            entityType={correlationEntity.type}
            entityId={correlationEntity.id}
            onClose={() => setCorrelationEntity(null)}
          />
        </div>
      )}
    </div>
  );
}

function UserTab({ tenantId }: { tenantId: number }) {
  const { formatDateTimeShort } = useTenantDateFormatter();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("user_name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [expandedUserRow, setExpandedUserRow] = useState<number | null>(null);
  const [correlationEntity, setCorrelationEntity] = useState<{ type: string; id: string } | null>(null);
  const [advancedSearchQuery, setAdvancedSearchQuery] = useState<SearchQuery | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (riskLevel !== "all") p.set("riskLevel", riskLevel);
    if (departmentFilter) p.set("department", departmentFilter);
    if (accountTypeFilter !== "all") p.set("accountType", accountTypeFilter);
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [page, pageSize, debouncedSearch, riskLevel, departmentFilter, accountTypeFilter, sortBy, sortOrder]);

  const { data: accountTypeDistribution } = useQuery<Record<string, number>>({
    queryKey: ["/api/asset-inventory", tenantId, "user-type-distribution"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/user-type-distribution`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data, isLoading } = useQuery<PaginatedResponse<UserRow>>({
    queryKey: ["/api/asset-inventory", tenantId, "users", page, pageSize, debouncedSearch, riskLevel, departmentFilter, accountTypeFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/users?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!tenantId && !advancedSearchQuery,
  });

  const advancedSearchResults = useQuery<any>({
    queryKey: ["/api/advanced-search", "users", tenantId, advancedSearchQuery, page, pageSize, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/advanced-search/users", {
        tenantId,
        query: advancedSearchQuery,
        page,
        limit: pageSize,
        sortBy,
        sortDir: sortOrder,
      });
      return res.json();
    },
    enabled: !!tenantId && !!advancedSearchQuery,
  });

  const handleAdvancedSearchApply = useCallback((query: SearchQuery) => {
    const hasRules = query.rules.length > 0;
    setAdvancedSearchQuery(hasRules ? query : null);
    setPage(1);
  }, []);

  const handleAdvancedSearchClear = useCallback(() => {
    setAdvancedSearchQuery(null);
    setPage(1);
  }, []);

  const activeData = advancedSearchQuery ? advancedSearchResults.data : data;
  const activeLoading = advancedSearchQuery ? advancedSearchResults.isLoading : isLoading;

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  return (
    <div className="flex gap-0" data-testid="tab-user-content">
      <div className={`flex-1 min-w-0`}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search username, email, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-user-search"
            />
          </div>
          <Select value={riskLevel} onValueChange={(v) => { setRiskLevel(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-user-risk">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Department..."
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            className="w-[140px]"
            data-testid="input-user-department"
          />
          <Select value={accountTypeFilter} onValueChange={(v) => { setAccountTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]" data-testid="select-user-account-type">
              <SelectValue placeholder="Account Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Domain">Domain</SelectItem>
              <SelectItem value="Local">Local</SelectItem>
              <SelectItem value="Service">Service</SelectItem>
              <SelectItem value="System Built-in">System Built-in</SelectItem>
              <SelectItem value="Cloud">Cloud</SelectItem>
              <SelectItem value="Guest">Guest</SelectItem>
              <SelectItem value="Unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <AdvancedSearch
            module="users"
            onApply={handleAdvancedSearchApply}
            onClear={handleAdvancedSearchClear}
          />
        </div>

        {accountTypeDistribution && Object.keys(accountTypeDistribution).length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="user-type-distribution">
            {Object.entries(accountTypeDistribution).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const typeColors: Record<string, string> = {
                "Domain": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                "Local": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                "Service": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
                "System Built-in": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
                "Cloud": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
                "Guest": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                "Unknown": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
              };
              return (
                <Badge
                  key={type}
                  variant="outline"
                  className={`text-[10px] cursor-pointer ${typeColors[type] || ''} ${accountTypeFilter === type ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setAccountTypeFilter(accountTypeFilter === type ? "all" : type)}
                  data-testid={`badge-type-${type.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {type}: {count}
                </Badge>
              );
            })}
          </div>
        )}

        {activeLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <SortHeader label="Username" field="user_name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Email" field="email" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Department" field="department" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Risk Score" field="risk_score" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Type</TableHead>
                    <TableHead>Devices</TableHead>
                    <SortHeader label="Web Requests" field="total_requests" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Risk Level</TableHead>
                    <SortHeader label="Last Activity" field="last_activity" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activeData?.data || []).map((user: any) => (
                    <>
                      <TableRow
                        key={user.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setCorrelationEntity({ type: "user", id: user.userName })}
                        data-testid={`row-user-${user.id}`}
                      >
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setExpandedUserRow(expandedUserRow === user.id ? null : user.id); }}
                            data-testid={`button-expand-user-${user.id}`}
                          >
                            <Info className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-username-${user.id}`}>
                          <Link
                            href={`/users/${tenantId}/${encodeURIComponent(user.userName)}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-user-detail-${user.id}`}
                          >
                            {user.userName}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs" data-testid={`text-email-${user.id}`}>{user.email || "—"}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-dept-${user.id}`}>{user.department || "—"}</TableCell>
                        <TableCell data-testid={`text-user-riskscore-${user.id}`}>
                          <RiskScoreBar score={user.riskScore} level={user.riskLevel} />
                        </TableCell>
                        <TableCell data-testid={`text-accounttype-${user.id}`}>
                          {(() => {
                            const at = user.accountType || "Unknown";
                            const atColors: Record<string, string> = {
                              "Domain": "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
                              "Local": "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
                              "Service": "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
                              "System Built-in": "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
                              "Cloud": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
                              "Guest": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
                            };
                            return <Badge variant="outline" className={`text-[9px] ${atColors[at] || 'bg-muted text-muted-foreground'}`}>{at}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className="text-center" data-testid={`text-devicecount-${user.id}`}>{user.deviceCount || 0}</TableCell>
                        <TableCell className="text-center" data-testid={`text-requests-${user.id}`}>{(user.totalRequests || 0).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={riskBadgeVariant(user.riskLevel)} data-testid={`badge-risk-${user.id}`}>{user.riskLevel}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-lastactivity-${user.id}`}>{formatDateTimeShort(user.lastActivity)}</TableCell>
                      </TableRow>
                      {expandedUserRow === user.id && (
                        <TableRow key={`expand-user-${user.id}`}>
                          <TableCell colSpan={10} className="bg-muted/30 p-4">
                            <div className="space-y-4" data-testid={`expanded-user-${user.id}`}>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contact Info</h4>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />Email</span><span className="text-xs truncate max-w-[200px]">{user.email || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" />Department</span><span>{user.department || "—"}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />Title</span><span className="text-xs">{user.title || "—"}</span></div>
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Risk Score</h4>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                      <span className={`text-2xl font-bold ${riskScoreColor(user.riskScore)}`}>{user.riskScore}</span>
                                      <Badge variant={riskBadgeVariant(user.riskLevel)}>{user.riskLevel}</Badge>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${user.riskScore >= 80 ? "bg-red-500" : user.riskScore >= 60 ? "bg-orange-500" : user.riskScore >= 40 ? "bg-yellow-500" : "bg-green-500"}`}
                                        style={{ width: `${Math.min(100, user.riskScore)}%` }}
                                      />
                                    </div>
                                    {user.scoreDelta != null && user.scoreDelta !== 0 && (
                                      <span className={`text-xs ${user.scoreDelta > 0 ? "text-red-500" : "text-green-500"}`}>
                                        {user.scoreDelta > 0 ? "+" : ""}{user.scoreDelta} from {user.previousScore}
                                      </span>
                                    )}
                                  </div>
                                  {user.pillarScores && (
                                    <div className="mt-3 space-y-1.5">
                                      {Object.entries(user.pillarScores as Record<string, number>).map(([key, val]) => (
                                        <PillarScoreBar key={key} label={key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} score={val} />
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Data Transfer</h4>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between gap-2">
                                      <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="w-3 h-3" />Total</span>
                                      <span className="font-medium">{(user.totalBytesMB || 0).toLocaleString()} MB</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-muted-foreground flex items-center gap-1"><Download className="w-3 h-3" />Downloaded</span>
                                      <span>{(user.downloadedBytesMB || 0).toLocaleString()} MB</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-muted-foreground flex items-center gap-1"><Upload className="w-3 h-3" />Uploaded</span>
                                      <span>{(user.uploadedBytesMB || 0).toLocaleString()} MB</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {[
                                  { label: "Total Requests", value: user.totalRequests, icon: BarChart3 },
                                  { label: "Allowed", value: user.allowedRequests, icon: Shield },
                                  { label: "Denied", value: user.deniedRequests, icon: AlertTriangle },
                                  { label: "Isolated", value: user.isolatedRequests, icon: Network },
                                  { label: "Sites Visited", value: user.sitesVisited, icon: Globe },
                                ].map((metric) => (
                                  <Card key={metric.label} data-testid={`metric-${metric.label.toLowerCase().replace(/\s/g, "-")}`}>
                                    <CardContent className="p-3 flex items-center gap-2">
                                      <metric.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <div>
                                        <p className="text-sm font-semibold">{(metric.value || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-muted-foreground">{metric.label}</p>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Applications Used {typeof user.applicationNames === "string" && user.applicationNames ? `(${user.applicationNames.split(",").filter(Boolean).length})` : ""}
                                  </h4>
                                  {typeof user.applicationNames === "string" && user.applicationNames ? (
                                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                      {user.applicationNames.split(",").map((app: string, i: number) => (
                                        app.trim() && <Badge key={i} variant="secondary" data-testid={`badge-app-${i}`}>{app.trim()}</Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No application data available</p>
                                  )}
                                </div>

                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Top Domains {Array.isArray(user.topSites) ? `(${user.topSites.length})` : ""}
                                  </h4>
                                  {Array.isArray(user.topSites) && user.topSites.length > 0 ? (
                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                      {user.topSites.map((site: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 text-xs p-1" data-testid={`domain-entry-${i}`}>
                                          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                                          <span className="truncate">{typeof site === "string" ? site : site?.domain || site?.url || JSON.stringify(site)}</span>
                                          {typeof site === "object" && site?.count != null && (
                                            <Badge variant="outline" className="ml-auto shrink-0">{site.count}</Badge>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No domain data available</p>
                                  )}
                                </div>
                              </div>

                              {Array.isArray(user.linkedAssetIds) && user.linkedAssetIds.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Linked Devices ({user.linkedAssetIds.length})
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {user.linkedAssetIds.map((asset: any, i: number) => (
                                      <div key={i} className="flex items-center gap-1.5 text-xs p-1.5 rounded-md bg-muted/50" data-testid={`linked-device-${i}`}>
                                        <Monitor className="w-3 h-3 text-muted-foreground" />
                                        <span className="font-medium">{typeof asset === "string" ? asset : asset?.hostname || asset?.id || JSON.stringify(asset)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {(activeData?.data || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No users found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground" data-testid="text-user-count">
                Showing {((activeData?.page || 1) - 1) * (activeData?.pageSize || 50) + 1}–{Math.min((activeData?.page || 1) * (activeData?.pageSize || 50), activeData?.total || 0)} of {activeData?.total || 0}
              </span>
              <div className="flex items-center gap-2">
                <Button
                 
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-user-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {activeData?.page || 1} of {activeData?.totalPages || 1}</span>
                <Button
                 
                  variant="outline"
                  disabled={page >= (activeData?.totalPages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-user-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {correlationEntity && (
        <div className="w-80 shrink-0 border-l ml-0">
          <CorrelationPanel
            tenantId={tenantId}
            entityType={correlationEntity.type}
            entityId={correlationEntity.id}
            onClose={() => setCorrelationEntity(null)}
          />
        </div>
      )}
    </div>
  );
}

function IPTab({ tenantId }: { tenantId: number }) {
  const { formatDateTimeShort } = useTenantDateFormatter();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [sortBy, setSortBy] = useState("device_count");
  const [sortOrder, setSortOrder] = useState("desc");
  const [correlationEntity, setCorrelationEntity] = useState<{ type: string; id: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (anomalyOnly) p.set("anomalyOnly", "true");
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [page, pageSize, debouncedSearch, anomalyOnly, sortBy, sortOrder]);

  const { data, isLoading } = useQuery<PaginatedResponse<IPRow>>({
    queryKey: ["/api/asset-inventory", tenantId, "ips", page, pageSize, debouncedSearch, anomalyOnly, sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/ips?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch IPs");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: anomalyData } = useQuery<AnomalyData>({
    queryKey: ["/api/asset-inventory", tenantId, "anomalies"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/anomalies`);
      if (!res.ok) throw new Error("Failed to fetch anomalies");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="flex gap-0" data-testid="tab-ip-content">
      <div className={`flex-1 min-w-0`}>
        {anomalyData && anomalyData.summary.sharedIPs > 0 && (
          <Card className="mb-4 border-orange-400" data-testid="card-anomaly-summary">
            <CardContent className="flex items-center gap-3 p-3 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-sm">
                <span className="font-medium">{anomalyData.summary.sharedIPs} shared IP anomalies</span> detected
                {anomalyData.summary.highSeverity > 0 && (
                  <Badge variant="destructive" className="ml-2">{anomalyData.summary.highSeverity} high</Badge>
                )}
                {anomalyData.summary.mediumSeverity > 0 && (
                  <Badge variant="default" className="ml-1">{anomalyData.summary.mediumSeverity} medium</Badge>
                )}
              </span>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search IP address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-ip-search"
            />
          </div>
          <Button
            variant={anomalyOnly ? "default" : "outline"}
            onClick={() => { setAnomalyOnly(!anomalyOnly); setPage(1); }}
            data-testid="button-toggle-anomaly"
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            {anomalyOnly ? "Show All" : "Anomalies Only"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="IP Address" field="ip_address" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Type</TableHead>
                    <SortHeader label="Devices" field="device_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Users" field="user_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Last Seen" field="last_seen" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Anomaly</TableHead>
                    <TableHead>Hostnames</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((ip) => (
                    <TableRow
                      key={ip.ipAddress}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setCorrelationEntity({ type: "ip", id: ip.ipAddress })}
                      data-testid={`row-ip-${ip.ipAddress}`}
                    >
                      <TableCell className="font-mono text-xs font-medium" data-testid={`text-ipaddr-${ip.ipAddress}`}>{ip.ipAddress}</TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-iptype-${ip.ipAddress}`}>{ip.ipType}</Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-ipdevices-${ip.ipAddress}`}>{ip.deviceCount}</TableCell>
                      <TableCell className="text-center" data-testid={`text-ipusers-${ip.ipAddress}`}>{ip.userCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-iplastseen-${ip.ipAddress}`}>{formatDateTimeShort(ip.lastSeen)}</TableCell>
                      <TableCell data-testid={`cell-ipanomaly-${ip.ipAddress}`}>
                        {ip.anomalyFlag ? (
                          <Badge variant="destructive" data-testid={`badge-anomaly-${ip.ipAddress}`}>
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {ip.activeDeviceCount} active
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]" data-testid={`text-iphosts-${ip.ipAddress}`}>
                        <div className="truncate">
                          {ip.hostnames?.slice(0, 3).join(", ")}
                          {ip.hostnames?.length > 3 && <span className="text-muted-foreground"> +{ip.hostnames.length - 3}</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No IPs found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground" data-testid="text-ip-count">
                Showing {((data?.page || 1) - 1) * (data?.pageSize || 50) + 1}–{Math.min((data?.page || 1) * (data?.pageSize || 50), data?.total || 0)} of {data?.total || 0}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-ip-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {data?.page || 1} of {data?.totalPages || 1}</span>
                <Button
                  variant="outline"
                  disabled={page >= (data?.totalPages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-ip-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {correlationEntity && (
        <div className="w-80 shrink-0 border-l ml-0">
          <CorrelationPanel
            tenantId={tenantId}
            entityType={correlationEntity.type}
            entityId={correlationEntity.id}
            onClose={() => setCorrelationEntity(null)}
          />
        </div>
      )}
    </div>
  );
}

function SoftwareTab({ tenantId }: { tenantId: number }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("device_count");
  const [sortOrder, setSortOrder] = useState("desc");
  const [correlationEntity, setCorrelationEntity] = useState<{ type: string; id: string } | null>(null);
  const [eolFilterOnly, setEolFilterOnly] = useState(false);
  const [expandedSoftware, setExpandedSoftware] = useState<string | null>(null);
  const [groupByVersion, setGroupByVersion] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const { isMSS } = useTenant();
  const { toast } = useToast();

  const syncSoftwareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/assets/${tenantId}/sync-software`);
      return res.json();
    },
    onSuccess: (_data: any) => {
      setLastSyncedAt(new Date().toISOString());
      setSyncMessage("Security tool inventory sync complete.");
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory", tenantId, "software"] });
      toast({ title: "Security Tools Sync", description: "Security tool inventory has been refreshed.", duration: 4000 });
    },
    onError: (err: any) => {
      toast({ title: "Sync Failed", description: err.message || "Failed to sync security tool data.", variant: "destructive" });
    },
  });

  const { data: versionDetail } = useQuery<{ softwareName: string; totalVersions: number; totalDevices: number; versions: VersionDetail[] }>({
    queryKey: ["/api/asset-inventory", tenantId, "software-versions", expandedSoftware],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/software-versions/${encodeURIComponent(expandedSoftware!)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!expandedSoftware,
  });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [page, pageSize, debouncedSearch, sortBy, sortOrder]);

  const { data, isLoading } = useQuery<PaginatedResponse<SoftwareRow>>({
    queryKey: ["/api/asset-inventory", tenantId, "software", page, pageSize, debouncedSearch, sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/software?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch software");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="flex gap-0" data-testid="tab-software-content">
      <div className={`flex-1 min-w-0`}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search software name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-software-search"
            />
          </div>
          <Button
            variant={eolFilterOnly ? "default" : "outline"}
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => { setEolFilterOnly(!eolFilterOnly); setPage(1); }}
            data-testid="button-eol-filter"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {eolFilterOnly ? "Showing EOL/EOS Only" : "Show EOL/EOS Only"}
          </Button>
          {isMSS && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              disabled={syncSoftwareMutation.isPending}
              onClick={() => syncSoftwareMutation.mutate()}
              data-testid="button-sync-security-tools"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncSoftwareMutation.isPending ? "animate-spin" : ""}`} />
              {syncSoftwareMutation.isPending ? "Syncing..." : "Sync Security Tools"}
            </Button>
          )}
        </div>
        {(lastSyncedAt || syncMessage) && (
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground" data-testid="text-sync-status">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>{syncMessage}</span>
            {lastSyncedAt && (
              <span className="text-muted-foreground/60">· Last synced {new Date(lastSyncedAt).toLocaleTimeString()}</span>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Software Name" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Vendor</TableHead>
                    <TableHead>Version</TableHead>
                    <SortHeader label="Category" field="category" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="text-center">Risk</TableHead>
                    <TableHead className="text-center">EOL/EOS</TableHead>
                    <TableHead>Source</TableHead>
                    <SortHeader label="Devices" field="device_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const SENTINEL_NAMES = ["cyneteps", "fortinac", "sentinel agent", "crowdstrike falcon sensor", "microsoft defender antivirus", "windows security health service"];
                    const rows = data?.data || [];
                    const isSentinelOnly = rows.length > 0 && rows.every((sw: SoftwareRow) => SENTINEL_NAMES.some(s => (sw.name || "").toLowerCase().includes(s)));
                    const filtered = eolFilterOnly ? rows.filter(sw => {
                      const eol = lookupEOL(sw.name, "");
                      return eol && (eol.eolStatus === "ended" || eol.eosStatus === "ended" || eol.eolStatus === "approaching" || eol.eosStatus === "approaching");
                    }) : rows;
                    if (filtered.length === 0 || isSentinelOnly) return (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm font-medium">{eolFilterOnly ? "No EOL/EOS software found." : isSentinelOnly ? "Only security agents detected. No additional software data available." : "No software inventory data available."}</p>
                          {!eolFilterOnly && <p className="text-xs mt-1 max-w-xs mx-auto">Use the <strong>Sync Security Tools</strong> button above to pull the latest software inventory, or expand a device row and use "Sync Tools" for per-device refresh.</p>}
                        </TableCell>
                      </TableRow>
                    );
                    const categoryColors: Record<string, string> = {
                      "Endpoint Security": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800",
                      "EDR/XDR": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800",
                      "Email Security": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800",
                      "Cloud Security": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800",
                      "SIEM": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-800",
                      "Network Access Control": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-800",
                      "Vulnerability Management": "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800",
                      "Identity & Access": "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border-violet-200 dark:border-violet-800",
                      "Browser": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800",
                      "Productivity": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200 border-fuchsia-200 dark:border-fuchsia-800",
                      "Backup": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
                      "Remote Access": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800",
                      "Utility": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
                      "Development": "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200 border-lime-200 dark:border-lime-800",
                      "Virtualization": "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800",
                    };
                    const categoryIcons: Record<string, any> = {
                      "Endpoint Security": Shield, "EDR/XDR": ShieldCheck, "Email Security": Mail,
                      "Cloud Security": Cloud, "SIEM": Activity, "Network Access Control": Network,
                      "Vulnerability Management": Bug, "Identity & Access": KeyRound, "Browser": Globe,
                      "Productivity": FileText, "Backup": HardDrive, "Remote Access": Monitor,
                      "Utility": Wrench, "Development": Code, "Virtualization": Server,
                      "Messaging": MessageSquare, "Generative AI": Brain, "Web Security": Globe,
                    };
                    return filtered.flatMap((sw, idx) => {
                      const eol = lookupEOL(sw.name, "");
                      const CatIcon = categoryIcons[sw.category] || Package;
                      const catColor = categoryColors[sw.category] || "bg-muted text-muted-foreground";
                      const isExpanded = expandedSoftware === sw.name;
                      const rows = [
                    <TableRow
                      key={`${sw.name}-${idx}`}
                      className={`cursor-pointer hover-elevate ${isExpanded ? 'bg-muted/50' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSoftware(isExpanded ? null : sw.name);
                      }}
                      data-testid={`row-software-${idx}`}
                    >
                      <TableCell className="font-medium text-xs" data-testid={`text-swname-${idx}`}>
                        <div className="flex items-center gap-2">
                          <AppIcon name={sw.vendor || sw.name} className="w-4 h-4 shrink-0" />
                          {sw.name}
                          {(sw.versionCount || 0) > 1 && (
                            <Badge variant="secondary" className="text-[9px] ml-1" data-testid={`badge-versions-${idx}`}>
                              {sw.versionCount} versions
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-swvendor-${idx}`}>{sw.vendor || '—'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground" data-testid={`text-swversion-${idx}`}>{sw.version && sw.version !== 'Unknown' ? sw.version : '—'}</TableCell>
                      <TableCell data-testid={`text-swcategory-${idx}`}>
                        <Badge variant="outline" className={`text-[9px] ${catColor}`}>{sw.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-swrisk-${idx}`}>
                        {(() => {
                          const risk = sw.riskScore ?? 0;
                          const color = risk <= 20 ? "bg-green-500" : risk <= 40 ? "bg-emerald-400" : risk <= 55 ? "bg-yellow-500" : risk <= 75 ? "bg-orange-500" : "bg-red-500";
                          const label = risk <= 20 ? "Low" : risk <= 40 ? "Medium" : risk <= 55 ? "Elevated" : risk <= 75 ? "High" : "Critical";
                          return (
                            <div className="flex items-center gap-1.5 justify-center" title={`Risk: ${risk}/100 (${label})`}>
                              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${color}`} style={{ width: `${risk}%` }} />
                              </div>
                              <span className={`text-[10px] font-medium ${risk <= 20 ? "text-green-600 dark:text-green-400" : risk <= 40 ? "text-emerald-600 dark:text-emerald-400" : risk <= 55 ? "text-yellow-600 dark:text-yellow-400" : risk <= 75 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"}`}>{risk}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-sweol-${idx}`}>
                        {eol ? (
                          eol.eolStatus === "ended" || eol.eosStatus === "ended" ? (
                            <Badge variant="destructive" className="text-[9px]">EOL</Badge>
                          ) : eol.eolStatus === "approaching" || eol.eosStatus === "approaching" ? (
                            <Badge className="text-[9px] bg-yellow-500 text-white">Approaching</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">Supported</Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-swsource-${idx}`}>{sw.source}</TableCell>
                      <TableCell className="text-center font-medium" data-testid={`text-swdevices-${idx}`}>{sw.deviceCount.toLocaleString()}</TableCell>
                    </TableRow>
                      ];
                      if (isExpanded && versionDetail) {
                        rows.push(
                          <TableRow key={`${sw.name}-versions`} className="bg-muted/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="px-6 py-3 space-y-2" data-testid={`panel-version-detail-${idx}`}>
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                                  <Package className="w-3.5 h-3.5" />
                                  Version Distribution — {versionDetail.totalVersions} version{versionDetail.totalVersions !== 1 ? 's' : ''} across {versionDetail.totalDevices} device{versionDetail.totalDevices !== 1 ? 's' : ''}
                                </div>
                                <div className="grid gap-1.5">
                                  {versionDetail.versions.map((v, vi) => (
                                    <div key={vi} className="flex items-center gap-3 text-xs py-1 px-2 rounded bg-background border">
                                      <span className="font-mono font-medium min-w-[120px]" data-testid={`text-ver-${vi}`}>{v.version && v.version !== 'Unknown' ? v.version : 'N/A'}</span>
                                      <div className="flex-1">
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-primary rounded-full transition-all"
                                            style={{ width: `${Math.max(5, (v.deviceCount / versionDetail.totalDevices) * 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                      <span className="font-medium text-muted-foreground min-w-[60px] text-right" data-testid={`text-vercount-${vi}`}>
                                        {v.deviceCount} device{v.deviceCount !== 1 ? 's' : ''}
                                      </span>
                                      {v.hostnames.length > 0 && (
                                        <span className="text-muted-foreground text-[10px] max-w-[200px] truncate" title={v.hostnames.join(', ')}>
                                          {v.hostnames.slice(0, 3).join(', ')}{v.hostnames.length > 3 ? ` +${v.hostnames.length - 3} more` : ''}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      return rows;
                    });
                  })()}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground" data-testid="text-software-count">
                Showing {((data?.page || 1) - 1) * (data?.pageSize || 50) + 1}–{Math.min((data?.page || 1) * (data?.pageSize || 50), data?.total || 0)} of {data?.total || 0}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-software-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {data?.page || 1} of {data?.totalPages || 1}</span>
                <Button
                  variant="outline"
                  disabled={page >= (data?.totalPages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-software-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {correlationEntity && (
        <div className="w-80 shrink-0 border-l ml-0">
          <CorrelationPanel
            tenantId={tenantId}
            entityType={correlationEntity.type}
            entityId={correlationEntity.id}
            onClose={() => setCorrelationEntity(null)}
          />
        </div>
      )}
    </div>
  );
}

function DomainTab({ tenantId }: { tenantId: number }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("user_count");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedDomain, setSelectedDomain] = useState<DomainRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [page, pageSize, debouncedSearch, sortBy, sortOrder]);

  const { data, isLoading } = useQuery<PaginatedResponse<DomainRow>>({
    queryKey: ["/api/asset-inventory", tenantId, "domains", page, pageSize, debouncedSearch, sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/domains?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch domains");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="flex gap-0" data-testid="tab-domain-content">
      <div className={`flex-1 min-w-0`}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-domain-search"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Domain" field="domain" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortHeader label="Users" field="user_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead>Category</TableHead>
                    <SortHeader label="Requests" field="total_requests" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((d, idx) => (
                    <TableRow
                      key={`${d.domain}-${idx}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSelectedDomain(d)}
                      data-testid={`row-domain-${idx}`}
                    >
                      <TableCell className="font-medium text-xs" data-testid={`text-domainname-${idx}`}>
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {d.domain}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium" data-testid={`text-domainusers-${idx}`}>{d.userCount}</TableCell>
                      <TableCell data-testid={`text-domaincategory-${idx}`}>
                        {d.category ? (
                          <Badge variant="outline">{d.category}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-domainrequests-${idx}`}>{d.totalRequests?.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No domains found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground" data-testid="text-domain-count">
                Showing {((data?.page || 1) - 1) * (data?.pageSize || 50) + 1}–{Math.min((data?.page || 1) * (data?.pageSize || 50), data?.total || 0)} of {data?.total || 0}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-domain-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">Page {data?.page || 1} of {data?.totalPages || 1}</span>
                <Button
                  variant="outline"
                  disabled={page >= (data?.totalPages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-domain-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <WebDomainDetailSheet
        domain={selectedDomain}
        tenantId={tenantId}
        onClose={() => setSelectedDomain(null)}
      />
    </div>
  );
}

function Sparkline({ data, color = "hsl(var(--primary))", height = 32, width = 200 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - (v / max) * (height - 4)}`).join(" ");
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function WebDomainDetailSheet({ domain, tenantId, onClose }: { domain: DomainRow | null; tenantId: number; onClose: () => void }) {
  const fmt = useTenantDateFormatter();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "web-domain-detail", domain?.domain],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/web-domain-detail/${encodeURIComponent(domain!.domain)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!domain && !!tenantId,
  });

  if (!domain) return null;

  const riskColor = (score: number) => score >= 70 ? "text-red-500" : score >= 40 ? "text-orange-500" : "text-green-500";

  return (
    <Sheet open={!!domain} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto" data-testid="web-domain-detail-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain.domain)}&sz=32`} alt="" className="w-6 h-6 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span data-testid="text-web-domain-name">{domain.domain}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Users</p>
              <p className="text-lg font-bold" data-testid="text-wd-user-count">{domain.userCount}</p>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Requests</p>
              <p className="text-lg font-bold" data-testid="text-wd-requests">{domain.totalRequests?.toLocaleString()}</p>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Category</p>
              <Badge variant="outline" className="mt-1" data-testid="badge-wd-category">{domain.category || "Unknown"}</Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data ? (
            <>
              {data.cloudRisk && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Cloud App Risk</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border rounded-lg p-2.5">
                        <span className="text-[10px] text-muted-foreground">Risk Score</span>
                        <div className={`text-lg font-bold ${riskColor(data.cloudRisk.riskScore || 0)}`}>{data.cloudRisk.riskScore ?? "—"}</div>
                      </div>
                      <div className="border rounded-lg p-2.5">
                        <span className="text-[10px] text-muted-foreground">Status</span>
                        <div className="mt-1">
                          <Badge variant={data.cloudRisk.isSanctioned ? "secondary" : "destructive"} className="text-[10px]">
                            {data.cloudRisk.isSanctioned ? "Sanctioned" : "Unsanctioned"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {data.eventStats?.eventCount > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Security Events</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border rounded-lg p-2.5">
                        <span className="text-[10px] text-muted-foreground">Total Events</span>
                        <div className="text-sm font-bold" data-testid="text-wd-events">{data.eventStats.eventCount}</div>
                      </div>
                      <div className="border rounded-lg p-2.5">
                        <span className="text-[10px] text-muted-foreground">High Severity</span>
                        <div className={`text-sm font-bold ${data.eventStats.highSevCount > 0 ? "text-red-500" : ""}`} data-testid="text-wd-highsev">{data.eventStats.highSevCount}</div>
                      </div>
                    </div>
                    {data.eventStats.firstSeen && (
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                        <span>First seen: {fmt.formatDateTimeShort(data.eventStats.firstSeen)}</span>
                        <span>Last seen: {fmt.formatDateTimeShort(data.eventStats.lastSeen)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {data.users?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Users ({data.users.length})</h4>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-1.5">
                        {data.users.map((u: any, i: number) => (
                          <div key={u.id || i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm" data-testid={`wd-user-${i}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium truncate">{u.userName}</p>
                                {u.department && <p className="text-[9px] text-muted-foreground">{u.department}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {u.riskScore != null && u.riskScore > 0 && (
                                <span className={`text-[10px] font-bold ${riskColor(u.riskScore)}`}>{u.riskScore}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground">{(u.totalRequests || 0).toLocaleString()} req</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No detailed data available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DomainDetailSheet({ domain: d, tenantId, onClose, authBadge }: { domain: any; tenantId: number; onClose: () => void; authBadge: (s: string) => JSX.Element }) {
  const { data: detail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "email-domain-detail", d?.domain],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/email-domain-detail/${encodeURIComponent(d.domain)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!d && !!tenantId,
  });

  const { data: dnsData, isLoading: dnsLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "email-domain-dns", d?.domain],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/email-domain-dns/${encodeURIComponent(d.domain)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!d && !!tenantId,
  });

  if (!d) return null;

  const totalClassified = d.maliciousCount + d.suspiciousCount + (d.cleanCount || 0);
  const malPct = totalClassified > 0 ? Math.round((d.maliciousCount / totalClassified) * 100) : 0;
  const susPct = totalClassified > 0 ? Math.round((d.suspiciousCount / totalClassified) * 100) : 0;
  const cleanPct = totalClassified > 0 ? Math.round(((d.cleanCount || 0) / totalClassified) * 100) : 0;
  const timeline = detail?.timeline || [];
  const linkedIncidents = detail?.linkedIncidents || [];
  const authHistory = detail?.authHistory || [];
  const recentEvents = detail?.recentEvents || [];
  const targetedRecipients = detail?.targetedRecipients || [];

  const dnsBadge = (status: string) => {
    if (status === "pass") return <Badge className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-600 border-green-300" data-testid="badge-dns-pass">Configured</Badge>;
    return <Badge className="text-[9px] px-1.5 py-0 bg-red-500/20 text-red-600 border-red-300" data-testid="badge-dns-missing">Not Found</Badge>;
  };

  return (
    <Sheet open={!!d} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto" data-testid="domain-detail-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d.domain)}&sz=32`} alt="" className="w-6 h-6 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span data-testid="text-domain-detail-name">{d.domain}</span>
            {dnsData?.securityGrade && (
              <Badge className={`text-[10px] ml-auto ${dnsData.securityGrade === "A" ? "bg-green-500 text-white" : dnsData.securityGrade === "B" ? "bg-blue-500 text-white" : dnsData.securityGrade === "C" ? "bg-yellow-500 text-white" : "bg-red-500 text-white"}`} data-testid="badge-security-grade">Grade {dnsData.securityGrade}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
              <div className="flex items-center gap-2">
                <Progress value={d.riskScore} className="h-2 flex-1" />
                <span className="text-sm font-bold">{d.riskScore}/100</span>
              </div>
            </div>
            <Badge className={`text-[10px] ${d.riskLevel === "critical" ? "bg-red-500 text-white" : d.riskLevel === "high" ? "bg-orange-500 text-white" : d.riskLevel === "medium" ? "bg-yellow-500 text-white" : "bg-green-500 text-white"}`}>{d.riskLevel}</Badge>
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Domain Security (Live DNS)</div>
            {dnsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : dnsData ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="border rounded-lg p-2.5" data-testid="dns-spf-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold">SPF</span>
                      {dnsBadge(dnsData.spf?.status)}
                    </div>
                    {dnsData.spf?.record && <div className="text-[8px] text-muted-foreground font-mono break-all leading-tight mt-1">{dnsData.spf.record.substring(0, 80)}...</div>}
                  </div>
                  <div className="border rounded-lg p-2.5" data-testid="dns-dkim-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold">DKIM</span>
                      {dnsBadge(dnsData.dkim?.status)}
                    </div>
                    {dnsData.dkim?.selector && <div className="text-[8px] text-muted-foreground mt-1">Selector: {dnsData.dkim.selector}</div>}
                  </div>
                  <div className="border rounded-lg p-2.5" data-testid="dns-dmarc-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold">DMARC</span>
                      {dnsBadge(dnsData.dmarc?.status)}
                    </div>
                    {dnsData.dmarc?.policy && <div className="text-[8px] text-muted-foreground mt-1">Policy: <span className="font-medium">{dnsData.dmarc.policy}</span></div>}
                    {dnsData.dmarc?.record && <div className="text-[8px] text-muted-foreground font-mono break-all leading-tight mt-0.5">{dnsData.dmarc.record.substring(0, 80)}...</div>}
                  </div>
                  <div className="border rounded-lg p-2.5" data-testid="dns-dnssec-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold">DNSSEC</span>
                      {dnsBadge(dnsData.dnssec?.status)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">DNS lookup unavailable</p>
            )}
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Domain Reputation</div>
            {dnsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : dnsData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Progress value={dnsData.reputationScore} className="h-2.5 flex-1" />
                      <span className="text-sm font-bold">{dnsData.reputationScore}/100</span>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${dnsData.reputationLevel === "malicious" ? "bg-red-500 text-white" : dnsData.reputationLevel === "suspicious" ? "bg-yellow-500 text-white" : "bg-green-500 text-white"}`} data-testid="badge-reputation-level">{dnsData.reputationLevel}</Badge>
                </div>
                <div className="space-y-1.5">
                  {dnsData.blocklists?.map((bl: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-1.5 rounded-md bg-muted/30" data-testid={`row-blocklist-${i}`}>
                      <span className="text-[10px] font-medium">{bl.name}</span>
                      {bl.listed ? (
                        <Badge variant="destructive" className="text-[8px] px-1.5 py-0">Listed</Badge>
                      ) : (
                        <Badge className="text-[8px] px-1.5 py-0 bg-green-500/20 text-green-600 border-green-300">Clean</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Reputation data unavailable</p>
            )}
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2">30-Day Event Timeline</div>
            {detailLoading ? <Skeleton className="h-8 w-full" /> : timeline.length > 0 ? (
              <div className="space-y-1">
                <Sparkline data={timeline.map((t: any) => t.total)} color="hsl(var(--primary))" width={380} height={36} />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>{timeline[0]?.day}</span>
                  <span>{timeline[timeline.length - 1]?.day}</span>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-red-500">Malicious: {timeline.reduce((s: number, t: any) => s + t.malicious, 0)}</span>
                  <span className="text-yellow-500">Suspicious: {timeline.reduce((s: number, t: any) => s + t.suspicious, 0)}</span>
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">No recent activity</p>}
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Event Classification</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-red-500">{d.maliciousCount}</div>
                <div className="text-[10px] text-muted-foreground">Malicious ({malPct}%)</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-yellow-500">{d.suspiciousCount}</div>
                <div className="text-[10px] text-muted-foreground">Suspicious ({susPct}%)</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-500">{d.cleanCount || 0}</div>
                <div className="text-[10px] text-muted-foreground">Clean ({cleanPct}%)</div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Email Authentication (Observed)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">SPF</div>
                {authBadge(dnsData?.spf?.status || d.spfStatus)}
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">DKIM</div>
                {authBadge(dnsData?.dkim?.status || d.dkimStatus)}
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">DMARC</div>
                {authBadge(dnsData?.dmarc?.status || d.dmarcStatus)}
              </div>
            </div>
          </div>

          {authHistory.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2">Auth History (30 Days)</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="w-10 text-muted-foreground">SPF</span>
                    <Sparkline data={authHistory.map((h: any) => h.spfPass)} color="#22c55e" width={140} height={20} />
                    <span className="text-green-500">{authHistory.reduce((s: number, h: any) => s + h.spfPass, 0)} pass</span>
                    <span className="text-red-500">{authHistory.reduce((s: number, h: any) => s + h.spfFail, 0)} fail</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="w-10 text-muted-foreground">DKIM</span>
                    <Sparkline data={authHistory.map((h: any) => h.dkimPass)} color="#22c55e" width={140} height={20} />
                    <span className="text-green-500">{authHistory.reduce((s: number, h: any) => s + h.dkimPass, 0)} pass</span>
                    <span className="text-red-500">{authHistory.reduce((s: number, h: any) => s + h.dkimFail, 0)} fail</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="w-10 text-muted-foreground">DMARC</span>
                    <Sparkline data={authHistory.map((h: any) => h.dmarcPass)} color="#22c55e" width={140} height={20} />
                    <span className="text-green-500">{authHistory.reduce((s: number, h: any) => s + h.dmarcPass, 0)} pass</span>
                    <span className="text-red-500">{authHistory.reduce((s: number, h: any) => s + h.dmarcFail, 0)} fail</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Statistics</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                <span className="text-[11px] text-muted-foreground">Total Events</span>
                <span className="text-[11px] font-bold">{d.eventCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                <span className="text-[11px] text-muted-foreground">Recipients Targeted</span>
                <span className="text-[11px] font-bold">{d.recipientsTargeted || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                <span className="text-[11px] text-muted-foreground">Last Seen</span>
                <span className="text-[11px] font-bold">{d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : "N/A"}</span>
              </div>
            </div>
          </div>

          {linkedIncidents.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3">Linked Incidents ({linkedIncidents.length})</div>
                <div className="space-y-2">
                  {linkedIncidents.map((inc: any) => (
                    <a key={inc.id} href={`/events?domain=overview&incidentId=${inc.id}`} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors group" data-testid={`link-domain-incident-${inc.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate group-hover:text-primary">{inc.title}</div>
                        <div className="text-[9px] text-muted-foreground">{inc.occurredAt ? new Date(inc.occurredAt).toLocaleDateString() : ""}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className={`text-[9px] ${inc.severity === "critical" ? "border-red-500 text-red-500" : inc.severity === "high" ? "border-orange-500 text-orange-500" : "border-yellow-500 text-yellow-500"}`}>{inc.severity}</Badge>
                        <Badge variant="outline" className="text-[9px]">{inc.status}</Badge>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          {targetedRecipients.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2">Targeted Recipients ({targetedRecipients.length})</div>
                <ScrollArea className="h-[120px]">
                  <div className="space-y-1">
                    {targetedRecipients.map((r: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 text-[11px]" data-testid={`text-recipient-${i}`}>
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{r}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          {recentEvents.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2">Recent Events ({recentEvents.length})</div>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1.5">
                    {recentEvents.map((evt: any, i: number) => (
                      <div key={evt.id || i} className="border rounded-lg p-2.5 space-y-1" data-testid={`card-event-${i}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[8px] px-1.5 py-0 ${evt.severity === "critical" ? "bg-red-600 text-white" : evt.severity === "high" ? "bg-orange-500 text-white" : evt.severity === "medium" ? "bg-yellow-500 text-white" : "bg-green-500 text-white"}`}>{evt.severity}</Badge>
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0">{evt.threatType}</Badge>
                          </div>
                          <span className="text-[9px] text-muted-foreground">{evt.occurredAt ? new Date(evt.occurredAt).toLocaleDateString() : ""}</span>
                        </div>
                        {evt.subject && <div className="text-[10px] truncate text-foreground">{evt.subject}</div>}
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span className="truncate max-w-[180px]">{evt.recipient || "—"}</span>
                          {evt.action && <Badge variant="outline" className="text-[8px] px-1 py-0">{evt.action}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          <Separator />

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3">Risk Breakdown</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Malicious Events Impact</span>
                <span className="font-medium">{Math.min(Math.round((d.maliciousCount / Math.max(d.eventCount, 1)) * 60), 60)}/60</span>
              </div>
              <Progress value={Math.min(Math.round((d.maliciousCount / Math.max(d.eventCount, 1)) * 100), 100)} className="h-1.5" />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Suspicious Events Impact</span>
                <span className="font-medium">{Math.min(Math.round((d.suspiciousCount / Math.max(d.eventCount, 1)) * 20), 20)}/20</span>
              </div>
              <Progress value={Math.min(Math.round((d.suspiciousCount / Math.max(d.eventCount, 1)) * 100), 100)} className="h-1.5" />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Auth Failure Penalty</span>
                <span className="font-medium">{(d.dmarcStatus === "fail" || d.dmarcStatus === "none" ? 10 : 0) + (d.spfStatus === "fail" || d.spfStatus === "softfail" ? 5 : 0) + (d.dkimStatus === "fail" ? 5 : 0)}/20</span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface EmailDomainRow {
  domain: string;
  eventCount: number;
  maliciousCount: number;
  suspiciousCount: number;
  cleanCount: number;
  recipientsTargeted: number;
  lastSeen: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  riskScore: number;
  riskLevel: string;
}

function EmailDomainsTab({ tenantId }: { tenantId: number }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("eventCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedDomain, setSelectedDomain] = useState<any>(null);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ domains: EmailDomainRow[]; total: number; summary: any }>({
    queryKey: ["/api/asset-inventory", tenantId, "email-domains"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/email-domains`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch email domains");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const filteredDomains = (data?.domains || [])
    .filter(d => !debouncedSearch || d.domain.toLowerCase().includes(debouncedSearch.toLowerCase()))
    .sort((a: any, b: any) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

  const totalPages = Math.ceil(filteredDomains.length / pageSize);
  const paged = filteredDomains.slice((page - 1) * pageSize, page * pageSize);

  const riskColor = (level: string) => {
    switch (level) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      default: return "bg-green-500 text-white";
    }
  };

  const authBadge = (status: string | null | undefined) => {
    const s = (status || "").trim().toLowerCase();
    if (s === "pass" || s === "configured") return <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">{s === "configured" ? "Configured" : "Pass"}</Badge>;
    if (s === "not_found") return <Badge variant="outline" className="text-[9px] text-orange-500 border-orange-300">Not Found</Badge>;
    if (s === "fail" || s === "softfail") return <Badge variant="destructive" className="text-[9px]">{s === "softfail" ? "SoftFail" : "Fail"}</Badge>;
    if (s === "none" || s === "bestguesspass") return <Badge className="text-[9px] bg-yellow-500 text-white">{s}</Badge>;
    if (s === "neutral" || s === "temperror" || s === "permerror") return <Badge variant="outline" className="text-[9px] text-orange-500 border-orange-300">{s}</Badge>;
    return <Badge variant="outline" className="text-[9px] text-muted-foreground border-muted-foreground/30">Unknown</Badge>;
  };

  return (
    <div data-testid="tab-email-domains-content">
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Domains</p>
            <p className="text-lg font-bold">{data.summary.totalDomains}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-red-500">Critical Risk</p>
            <p className="text-lg font-bold text-red-500">{data.summary.criticalDomains}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-orange-500">High Risk</p>
            <p className="text-lg font-bold text-orange-500">{data.summary.highRiskDomains}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-green-500">Low Risk</p>
            <p className="text-lg font-bold text-green-500">{data.summary.lowRiskDomains}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search email domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-email-domain-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Domain" field="domain" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortHeader label="Events" field="eventCount" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-center">Malicious</TableHead>
                  <TableHead className="text-center">Suspicious</TableHead>
                  <SortHeader label="Risk Score" field="riskScore" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-center">SPF</TableHead>
                  <TableHead className="text-center">DKIM</TableHead>
                  <TableHead className="text-center">DMARC</TableHead>
                  <TableHead className="text-center">Risk Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((d, idx) => (
                  <TableRow key={d.domain} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedDomain(d)} data-testid={`row-email-domain-${idx}`}>
                    <TableCell className="font-medium text-xs" data-testid={`text-emaildomain-${idx}`}>
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d.domain)}&sz=16`}
                          alt=""
                          className="w-4 h-4 shrink-0 rounded-sm"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        {d.domain}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs" data-testid={`text-emailevents-${idx}`}>{d.eventCount.toLocaleString()}</TableCell>
                    <TableCell className="text-center text-xs">
                      {d.maliciousCount > 0 ? <span className="text-red-500 font-medium">{d.maliciousCount}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {d.suspiciousCount > 0 ? <span className="text-yellow-600 font-medium">{d.suspiciousCount}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-emailrisk-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Progress value={d.riskScore} className="h-1.5 flex-1" />
                        <span className="text-xs font-medium w-6 text-right">{d.riskScore}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{authBadge(d.spfStatus)}</TableCell>
                    <TableCell className="text-center">{authBadge(d.dkimStatus)}</TableCell>
                    <TableCell className="text-center">{authBadge(d.dmarcStatus)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-[9px] ${riskColor(d.riskLevel)}`}>{d.riskLevel}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {paged.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No email domains found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground" data-testid="text-emaildomain-count">
              Showing {filteredDomains.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredDomains.length)} of {filteredDomains.length}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-emaildomain-prev">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Page {page} of {totalPages || 1}</span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-emaildomain-next">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <DomainDetailSheet domain={selectedDomain} tenantId={tenantId} onClose={() => setSelectedDomain(null)} authBadge={authBadge} />
    </div>
  );
}

function SummaryBar({ summary, isLoading }: { summary: SummaryData | undefined; isLoading: boolean }) {
  const stats = [
    { label: "Devices", value: summary?.devices || 0, icon: Monitor, key: "device" },
    { label: "Users", value: summary?.users || 0, icon: Users, key: "user" },
    { label: "IPs", value: summary?.ips || 0, icon: Network, key: "ip" },
    { label: "Software", value: summary?.software || 0, icon: Package, key: "software" },
    { label: "Domains", value: summary?.domains || 0, icon: Globe, key: "domain" },
    { label: "Anomalies", value: summary?.anomalies || 0, icon: AlertTriangle, key: "anomaly" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="summary-bar">
      {stats.map((s, idx) => (
        <Card key={s.key} className={`animate-fade-in-up stagger-${idx + 1}`} data-testid={`stat-${s.key}`}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-md bg-muted">
              <s.icon className={`w-4 h-4 ${s.key === "anomaly" && (summary?.anomalies || 0) > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-lg font-semibold" data-testid={`value-${s.key}`}>{s.value.toLocaleString()}</p>
              )}
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const DUPLICATE_TYPES = [
  { value: "assets", label: "Assets (Hostname)", icon: Monitor },
  { value: "ips", label: "IP Addresses", icon: Network },
  { value: "users", label: "Users", icon: Users },
  { value: "domains", label: "Domains/Groups", icon: Globe },
  { value: "events", label: "Security Events", icon: Shield },
  { value: "investigations", label: "Investigations", icon: Search },
] as const;

function DuplicateFinderTab({ tenantId }: { tenantId: number }) {
  const [dupType, setDupType] = useState("assets");
  const { toast } = useToast();

  const { data: dupData, isLoading, error: dupError } = useQuery<{
    type: string;
    count: number;
    duplicates: any[];
  }>({
    queryKey: ['/api/admin/duplicates', tenantId, dupType],
    queryFn: async () => {
      const res = await fetch(`/api/admin/duplicates/${tenantId}?type=${dupType}`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("Access denied. Admin privileges required.");
        throw new Error("Failed to fetch duplicates");
      }
      return res.json();
    },
    enabled: !!tenantId,
    retry: false,
  });

  const dedupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/dedup-assets/${tenantId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Dedup Complete", description: `Removed ${data.deleted} duplicates. ${data.remaining} assets remaining.` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/duplicates', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets', tenantId] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={dupType} onValueChange={setDupType}>
          <SelectTrigger className="w-[220px]" data-testid="select-dup-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {DUPLICATE_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} data-testid={`option-dup-${t.value}`}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {dupType === "assets" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => dedupMutation.mutate()}
            disabled={dedupMutation.isPending || !dupData?.duplicates?.length}
            data-testid="button-dedup-assets"
          >
            {dedupMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
            Remove Duplicates
          </Button>
        )}
        {dupData && (
          <Badge variant={dupData.count > 0 ? "destructive" : "default"} data-testid="badge-dup-count">
            {dupData.count} duplicate group{dupData.count !== 1 ? "s" : ""} found
          </Badge>
        )}
      </div>

      {dupError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-yellow-500 mb-3" />
            <p className="text-muted-foreground" data-testid="text-dup-error">{(dupError as Error).message}</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !dupData?.duplicates?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-duplicates">No duplicates found for {DUPLICATE_TYPES.find(t => t.value === dupType)?.label}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IDs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dupData.duplicates.map((dup: any, idx: number) => {
                const key = dup.hostname || dup.ip_address || dup.user_name || dup.domain || dup.dedup_hash || dup.event_name || `group-${idx}`;
                const details = dup.ip_addresses?.join(", ") || dup.hostnames?.join(", ") || dup.operating_systems?.join(", ") || dup.title || dup.event_name || "";
                const sources = dup.sources?.join(", ") || dup.severity || "";
                return (
                  <TableRow key={idx} data-testid={`row-dup-${idx}`}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate" data-testid={`text-dup-key-${idx}`}>
                      {key}
                    </TableCell>
                    <TableCell data-testid={`text-dup-count-${idx}`}>
                      <Badge variant="destructive">{dup.count}x</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" data-testid={`text-dup-details-${idx}`}>
                      {details}{sources ? ` (${sources})` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" data-testid={`text-dup-ids-${idx}`}>
                      {(dup.ids || []).slice(0, 5).join(", ")}{dup.ids?.length > 5 ? `... +${dup.ids.length - 5}` : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ExportInventoryButton({ tenantId }: { tenantId: number }) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/asset-inventory/${tenantId}/export-excel`, { credentials: "include" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Asset_Inventory_${tenantId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: "Asset inventory downloaded successfully." });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message || "Could not export inventory.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      disabled={exporting}
      data-testid="btn-export-inventory"
    >
      {exporting ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5 mr-1.5" />
      )}
      {exporting ? "Exporting..." : "Download Inventory"}
    </Button>
  );
}

export default function AssetInventoryPage({ embedded }: { embedded?: boolean } = {}) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const validTabs = ["device", "user", "ip", "software", "domain", "email-domains", "duplicates"];
  const [activeTab, setActiveTab] = useState(() => {
    if (embedded) return "device";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") || "device";
    return validTabs.includes(tab) ? tab : "device";
  });

  useEffect(() => {
    if (embedded) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab, embedded]);

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ["/api/asset-inventory", tenantId, "summary"],
    enabled: !!tenantId,
  });

  const { data: completenessData } = useQuery<{ totalAssets: number; averageCompleteness: number; completeProfiles: number; distribution: { full: number; high: number; medium: number; low: number } }>({
    queryKey: ["/api/assets", tenantId, "profile-completeness"],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${tenantId}/profile-completeness`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { toast } = useToast();
  const completeProfilesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/complete-asset-profiles/${tenantId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Profile Completion Done", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-inventory"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]" data-testid="no-tenant">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">Select a tenant to view asset inventory.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-asset-inventory">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Asset Inventory</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unified view of devices, users, IPs, software, and domains across your environment.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {completenessData && (
            <div className="flex items-center gap-2" data-testid="profile-completeness-header">
              <div className="flex items-center gap-1.5 text-xs">
                <CheckCircle2 className={`w-4 h-4 ${completenessData.averageCompleteness >= 90 ? "text-green-500" : completenessData.averageCompleteness >= 70 ? "text-yellow-500" : "text-orange-500"}`} />
                <span className="text-muted-foreground">Profile:</span>
                <span className="font-semibold" data-testid="text-avg-completeness">{completenessData.averageCompleteness}%</span>
              </div>
              <Progress value={completenessData.averageCompleteness} className="w-20 h-2" />
            </div>
          )}
          {completenessData && completenessData.averageCompleteness < 95 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => completeProfilesMutation.mutate()}
              disabled={completeProfilesMutation.isPending}
              data-testid="button-complete-profiles"
            >
              {completeProfilesMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              Complete Profiles
            </Button>
          )}
          {summary?.riskDistribution && (
            <div className="flex items-center gap-2" data-testid="risk-distribution">
              {["critical", "high", "medium", "low"].map((level) => (
                summary.riskDistribution[level] ? (
                  <Badge key={level} variant={riskBadgeVariant(level)} data-testid={`badge-dist-${level}`}>
                    {level}: {summary.riskDistribution[level]}
                  </Badge>
                ) : null
              ))}
            </div>
          )}
          <ExportInventoryButton tenantId={tenantId} />
        </div>
      </div>

      <SummaryBar summary={summary} isLoading={summaryLoading} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-inventory">
          <TabsTrigger value="device" data-testid="tab-device">
            <Monitor className="w-4 h-4 mr-1.5" />
            Device
          </TabsTrigger>
          <TabsTrigger value="user" data-testid="tab-user">
            <Users className="w-4 h-4 mr-1.5" />
            User
          </TabsTrigger>
          <TabsTrigger value="ip" data-testid="tab-ip">
            <Network className="w-4 h-4 mr-1.5" />
            IP
          </TabsTrigger>
          <TabsTrigger value="software" data-testid="tab-software">
            <Package className="w-4 h-4 mr-1.5" />
            Software
          </TabsTrigger>
          <TabsTrigger value="domain" data-testid="tab-domain">
            <Globe className="w-4 h-4 mr-1.5" />
            Cloud App
          </TabsTrigger>
          <TabsTrigger value="email-domains" data-testid="tab-email-domains">
            <Mail className="w-4 h-4 mr-1.5" />
            Email Domains
          </TabsTrigger>
          <TabsTrigger value="duplicates" data-testid="tab-duplicates">
            <Copy className="w-4 h-4 mr-1.5" />
            Duplicates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="device" className="mt-4 animate-tab-fade-in">
          <DeviceTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="user" className="mt-4 animate-tab-fade-in">
          <UserTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="ip" className="mt-4 animate-tab-fade-in">
          <IPTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="software" className="mt-4 animate-tab-fade-in">
          <SoftwareTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="domain" className="mt-4 animate-tab-fade-in">
          <DomainTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="email-domains" className="mt-4 animate-tab-fade-in">
          <EmailDomainsTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="duplicates" className="mt-4 animate-tab-fade-in">
          <DuplicateFinderTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
