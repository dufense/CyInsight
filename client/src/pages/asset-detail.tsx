import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { lookupEOL } from "@/lib/eol-lookup";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Shield, ShieldAlert, ShieldCheck, Monitor, Globe, Server, HardDrive,
  Network, Clock, Activity, AlertTriangle, Bug, Eye, Zap, Users, Cpu, Wifi,
  FileText, Lock, Fingerprint, Target, ChevronRight, Layers, Database, Cloud,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
  MemoryStick, Box, Wrench, HeartPulse, User, Package, Printer, Key,
  Coffee, Terminal, GitBranch, Archive, Palette, Video, MessageSquare,
  UserCheck, RefreshCw, Download, Upload, CheckCircle2, XCircle, Search, Link2,
  Play, Power, PowerOff, Cpu as CpuIcon, ShieldOff, Trash2,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  SiGoogle, SiGooglechrome, SiAdobe, SiFirefox,
  SiJavascript, SiPython, SiNodedotjs, SiGit, SiDocker, SiVmware,
  SiCisco, SiSlack, SiZoom, SiDropbox, SiIntel,
  SiMysql, SiPostgresql, SiOracle, SiMongodb,
  SiSublimetext, SiJetbrains, SiVscodium,
  SiTrendmicro, SiKaspersky, SiNorton, SiMalwarebytes, SiBitdefender,
  SiFortinet, SiSplunk,
  SiTeamviewer, SiAnydesk, SiWireguard, SiOpenvpn, SiCloudflare,
  SiVeeam, SiOkta,
  SiWireshark, Si7Zip,
} from "react-icons/si";
import type { IconType } from "react-icons";
import { RiskBar, CountryFlag } from "@/lib/visual-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";

const C = {
  blue: "hsl(217, 91%, 55%)", green: "hsl(142, 76%, 45%)", purple: "hsl(269, 80%, 58%)",
  orange: "hsl(32, 95%, 52%)", red: "hsl(340, 82%, 52%)", teal: "hsl(180, 70%, 45%)",
  yellow: "hsl(45, 90%, 50%)", pink: "hsl(300, 60%, 50%)", lime: "hsl(120, 60%, 40%)",
  sky: "hsl(200, 80%, 60%)", indigo: "hsl(245, 72%, 55%)", amber: "hsl(38, 92%, 50%)",
};

type AnyIcon = LucideIcon | IconType;
const SW_ICON_MAP: Array<{ pattern: RegExp; icon: AnyIcon; color: string }> = [
  { pattern: /crowdstrike|falcon/i, icon: ShieldCheck, color: "#E01E26" },
  { pattern: /trend\s*micro|apex\s*one|officescan|deep\s*security/i, icon: SiTrendmicro, color: "#D71920" },
  { pattern: /sophos|intercept\s*x/i, icon: Shield, color: "#2D5FF5" },
  { pattern: /kaspersky/i, icon: SiKaspersky, color: "#006D5C" },
  { pattern: /symantec|norton|broadcom/i, icon: SiNorton, color: "#FDB511" },
  { pattern: /bitdefender/i, icon: SiBitdefender, color: "#ED1C24" },
  { pattern: /malwarebytes/i, icon: SiMalwarebytes, color: "#0A6BC3" },
  { pattern: /palo\s*alto|cortex/i, icon: ShieldAlert, color: "#FA582D" },
  { pattern: /fortinac|forti[\-\s]?nac|forticlient|fortigate|fortinet|fortisiem|forti/i, icon: SiFortinet, color: "#EE3124" },
  { pattern: /cynet\s*eps|cynet/i, icon: ShieldCheck, color: "#00A4EF" },
  { pattern: /sentinel\s*one/i, icon: Shield, color: "#6C2CFF" },
  { pattern: /deceptive\s*bytes/i, icon: Shield, color: "#FF6B00" },
  { pattern: /trellix|mcafee|fireeye/i, icon: Shield, color: "#C8102E" },
  { pattern: /eset|nod32/i, icon: Shield, color: "#00AEEF" },
  { pattern: /check\s*point|harmony|sandblast/i, icon: Shield, color: "#E2001A" },
  { pattern: /carbon\s*black/i, icon: Shield, color: "#2E3440" },
  { pattern: /microsoft\s*defender|windows\s*defender/i, icon: Shield, color: "#0078D4" },
  { pattern: /skyhigh|mcafee\s*client\s*proxy|swg\s*client/i, icon: SiCloudflare, color: "#00A4EF" },
  { pattern: /zscaler/i, icon: Globe, color: "#0090D1" },
  { pattern: /netskope/i, icon: Globe, color: "#00BFB2" },
  { pattern: /cisco\s*ise|anyconnect|cisco|webex/i, icon: SiCisco, color: "#1BA0D7" },
  { pattern: /teamviewer/i, icon: SiTeamviewer, color: "#004680" },
  { pattern: /anydesk/i, icon: SiAnydesk, color: "#EF443B" },
  { pattern: /logmein|resolve/i, icon: Monitor, color: "#00A98F" },
  { pattern: /splashtop/i, icon: Monitor, color: "#FF8225" },
  { pattern: /forescout|counteract/i, icon: Network, color: "#1C3F94" },
  { pattern: /splunk/i, icon: SiSplunk, color: "#000000" },
  { pattern: /wazuh/i, icon: Activity, color: "#3AAFA9" },
  { pattern: /wireshark|npcap/i, icon: SiWireshark, color: "#1679A7" },
  { pattern: /nessus|tenable/i, icon: Bug, color: "#00A1DE" },
  { pattern: /qualys/i, icon: Bug, color: "#ED1C24" },
  { pattern: /rapid7|nexpose/i, icon: Bug, color: "#FF6600" },
  { pattern: /vicarius|vrx/i, icon: Bug, color: "#6B21A8" },
  { pattern: /veeam/i, icon: SiVeeam, color: "#00B336" },
  { pattern: /acronis/i, icon: HardDrive, color: "#003366" },
  { pattern: /cyberark/i, icon: Fingerprint, color: "#00B4D8" },
  { pattern: /okta/i, icon: SiOkta, color: "#007DC1" },
  { pattern: /mimecast/i, icon: Lock, color: "#1A1A2E" },
  { pattern: /proofpoint/i, icon: Lock, color: "#F7941D" },
  { pattern: /nxlog/i, icon: Activity, color: "#FF6600" },
  { pattern: /google\s*chrome/i, icon: SiGooglechrome, color: "#4285F4" },
  { pattern: /google|gmail/i, icon: SiGoogle, color: "#4285F4" },
  { pattern: /firefox|mozilla/i, icon: SiFirefox, color: "#FF7139" },
  { pattern: /microsoft|\.net|visual\s*c\+\+|msxml|office|outlook|teams|onedrive|edge|sql\s*server|windows|ssms|powershell/i, icon: Monitor, color: "#0078D4" },
  { pattern: /adobe|acrobat|photoshop|illustrator|premiere|creative\s*cloud/i, icon: SiAdobe, color: "#FF0000" },
  { pattern: /visual\s*studio\s*code|vscode/i, icon: SiVscodium, color: "#007ACC" },
  { pattern: /visual\s*studio/i, icon: Terminal, color: "#5C2D91" },
  { pattern: /sublime/i, icon: SiSublimetext, color: "#FF9800" },
  { pattern: /intellij|jetbrains|pycharm|webstorm|rider|datagrip/i, icon: SiJetbrains, color: "#000000" },
  { pattern: /notepad\+\+/i, icon: FileText, color: "#90E59A" },
  { pattern: /java\b/i, icon: SiJavascript, color: "#ED8B00" },
  { pattern: /python/i, icon: SiPython, color: "#3776AB" },
  { pattern: /node|npm/i, icon: SiNodedotjs, color: "#339933" },
  { pattern: /docker/i, icon: SiDocker, color: "#2496ED" },
  { pattern: /git\b/i, icon: SiGit, color: "#F05032" },
  { pattern: /vmware|vsphere/i, icon: SiVmware, color: "#607078" },
  { pattern: /citrix/i, icon: Server, color: "#452170" },
  { pattern: /zoom/i, icon: SiZoom, color: "#2D8CFF" },
  { pattern: /slack/i, icon: SiSlack, color: "#4A154B" },
  { pattern: /mysql/i, icon: SiMysql, color: "#4479A1" },
  { pattern: /postgres/i, icon: SiPostgresql, color: "#336791" },
  { pattern: /oracle/i, icon: SiOracle, color: "#F80000" },
  { pattern: /mongodb/i, icon: SiMongodb, color: "#47A248" },
  { pattern: /sql|database/i, icon: Database, color: "#00758F" },
  { pattern: /dropbox/i, icon: SiDropbox, color: "#0061FF" },
  { pattern: /7[\-\s]?zip/i, icon: Si7Zip, color: "#4F9E3E" },
  { pattern: /winrar|winzip|peazip/i, icon: Archive, color: "#6D2A8C" },
  { pattern: /wireguard/i, icon: SiWireguard, color: "#88171A" },
  { pattern: /openvpn/i, icon: SiOpenvpn, color: "#EA7E20" },
  { pattern: /vpn/i, icon: Key, color: "#2F80ED" },
  { pattern: /azure|cloud/i, icon: Cloud, color: "#0089D6" },
  { pattern: /quickbooks|intuit/i, icon: BarChart3, color: "#2CA01C" },
  { pattern: /nitro|pdf|foxit/i, icon: FileText, color: "#8BC53F" },
  { pattern: /expert\s*pdf/i, icon: FileText, color: "#D4380D" },
  { pattern: /printer|print\s*driver|hp\s*laserjet|canon|epson|xerox|iprojection/i, icon: Printer, color: "#0096D6" },
  { pattern: /intel\s*management|chipset/i, icon: SiIntel, color: "#0071C5" },
  { pattern: /backup|carbonite|datto/i, icon: HardDrive, color: "#00B336" },
  { pattern: /definition\s*update|update\s*for|security\s*update|hotfix|service\s*pack|kb\d/i, icon: Archive, color: "#737373" },
  { pattern: /runtime|redistribut/i, icon: Cpu, color: "#6B7280" },
  { pattern: /driver/i, icon: Cpu, color: "#0071C5" },
];

function getSoftwareIcon(name: string): { Icon: AnyIcon; color: string } {
  for (const entry of SW_ICON_MAP) {
    if (entry.pattern.test(name)) return { Icon: entry.icon, color: entry.color };
  }
  return { Icon: Package, color: "#6B7280" };
}
const PALETTE = [C.blue, C.green, C.purple, C.orange, C.red, C.teal, C.yellow, C.pink, C.lime, C.sky, C.indigo, C.amber];
const SEV: Record<string, string> = { critical: C.red, high: C.orange, medium: C.blue, low: C.green };
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

function RiskGauge({ score, size = 100 }: { score: number; size?: number }) {
  const clampedScore = Math.min(100, Math.max(0, score ?? 0));
  const maxScore = 100;
  const pct = Math.min((clampedScore / maxScore) * 100, 100);
  const color = pct >= 80 ? C.red : pct >= 60 ? C.orange : pct >= 40 ? C.yellow : pct >= 20 ? C.blue : C.green;
  const r = (size - 10) / 2;
  const circumference = Math.PI * r;
  const dashOffset = circumference - (pct / 100) * circumference;
  const label = pct >= 80 ? "Critical" : pct >= 60 ? "High" : pct >= 40 ? "Medium" : pct >= 20 ? "Low" : "Minimal";
  return (
    <div className="flex flex-col items-center" data-testid="risk-gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={`M 5 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 5} ${size / 2 + 5}`} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round" />
        <path d={`M 5 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 5} ${size / 2 + 5}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
      </svg>
      <div className="text-2xl font-bold -mt-4" style={{ color }}>{clampedScore}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label} Risk</div>
    </div>
  );
}

function PillarBar({ name, score, weight, details }: { name: string; score: number; weight: number; details?: any }) {
  const color = score >= 80 ? C.red : score >= 60 ? C.orange : score >= 40 ? C.yellow : score >= 20 ? C.blue : C.green;
  const description = (() => {
    if (!details) return "";
    if (name.includes("Security Tool")) {
      return `${details.coveredCategories || 0} of ${details.totalCategories || 13} categories covered`;
    }
    if (name.includes("Vulnerability")) {
      const parts = [];
      if (details.eolSoftwareCount > 0) parts.push(`${details.eolSoftwareCount} EOL`);
      if (details.vulnerabilityCount > 0) parts.push(`${details.vulnerabilityCount} CVEs`);
      return parts.length > 0 ? parts.join(", ") : "No vulnerabilities detected";
    }
    if (name.includes("Incident")) {
      return `${details.total || 0} incidents (${details.critical || 0} critical, ${details.high || 0} high)`;
    }
    if (name.includes("Compliance")) {
      const factors = details.factors || [];
      return factors.length > 0 ? `${factors.length} controls met` : "No compliance factors met";
    }
    if (name.includes("Contextual")) {
      const parts = [];
      if (details.isServer) parts.push("Server");
      if (details.cloudExposed) parts.push("Cloud");
      if (details.staleAsset) parts.push("Stale");
      if (details.inactiveAsset) parts.push("Inactive");
      return parts.length > 0 ? parts.join(", ") : "Standard context";
    }
    return "";
  })();

  return (
    <div className="space-y-1" data-testid={`pillar-${name.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-medium">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{weight}%</span>
          <span className="text-[11px] font-bold" style={{ color }}>{Math.round(score)}/100</span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(score, 100)}%`, backgroundColor: color }} />
      </div>
      {description && <div className="text-[10px] text-muted-foreground">{description}</div>}
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | number | null | undefined; icon?: any }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <span className="text-[11px] text-muted-foreground min-w-[90px]">{label}</span>
      <span className="text-[11px] font-medium break-all">{String(value)}</span>
    </div>
  );
}

function TagList({ items, color }: { items: string[]; color?: string }) {
  if (!items || items.length === 0) return <span className="text-[10px] text-muted-foreground">None detected</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-[9px]" style={color ? { backgroundColor: `${color}15`, color, borderColor: `${color}30` } : {}}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, color }: { title: string; icon: any; children: React.ReactNode; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={color ? { color } : {}} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

// ─── CIS Score Gauge Card ─────────────────────────────────────────────────────
function CisScoreCard({ tenantId, assetId, cisScore: initialScore, cisBenchmark }: {
  tenantId: number; assetId: number | null; cisScore: number | null; cisBenchmark: string | null;
}) {
  const { toast } = useToast();
  const [localScore, setLocalScore] = useState<number | null>(initialScore);
  const [localBenchmark, setLocalBenchmark] = useState<string | null>(cisBenchmark);
  const [controls, setControls] = useState<Array<{ id: string; name: string; passed: boolean; score: number; evidence?: string }>>([]);
  const [showControls, setShowControls] = useState(false);

  const computeMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/assets/${tenantId}/${assetId}/compute-cis`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setLocalScore(data.cisScore ?? localScore);
      setLocalBenchmark(data.cisBenchmark ?? localBenchmark);
      if (Array.isArray(data.controls)) {
        setControls(data.controls.map((c: any) => ({
          id: c.id,
          name: c.name,
          passed: c.passed ?? c.pass ?? false,
          score: c.score ?? (c.passed ?? c.pass ? 100 : 0),
          evidence: c.evidence,
        })));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      toast({ title: "CIS score computed", description: `Score: ${data.cisScore}` });
    },
    onError: () => toast({ title: "Failed to compute CIS score", variant: "destructive" }),
  });

  const score = localScore ?? 0;
  const scoreColor = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "Compliant" : score >= 40 ? "Partial" : "Non-Compliant";
  const passedCount = controls.filter(c => c.passed).length;

  return (
    <Card className="border-border/40 bg-card/60" data-testid="card-cis-score">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
          <Shield className="w-3.5 h-3.5" /> CIS Score
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col items-center gap-3">
        {localScore === null ? (
          <div className="text-center space-y-2">
            <div className="text-[11px] text-muted-foreground">No CIS score computed yet</div>
            {assetId && (
              <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => computeMut.mutate()} disabled={computeMut.isPending} data-testid="btn-compute-cis">
                {computeMut.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Shield className="w-3 h-3 mr-1" />}
                Compute Score
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                <circle cx="60" cy="60" r="48" fill="none" stroke={scoreColor} strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={`${(score / 100) * 301.6} 301.6`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color: scoreColor }}>{score}</span>
                <span className="text-[9px] text-muted-foreground uppercase">/ 100</span>
              </div>
            </div>
            <Badge className="text-[9px] px-2 py-0.5" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor, borderColor: `${scoreColor}40` }} data-testid="badge-cis-label">
              {label}
            </Badge>
            {localBenchmark && <div className="text-[9px] text-muted-foreground text-center">{localBenchmark}</div>}
            {controls.length > 0 && (
              <div className="w-full space-y-1.5">
                <button
                  className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowControls(v => !v)}
                  data-testid="btn-toggle-cis-controls"
                >
                  <span>{passedCount}/{controls.length} controls passed</span>
                  <span>{showControls ? "▲" : "▼"}</span>
                </button>
                {showControls && (
                  <div className="space-y-1 max-h-40 overflow-y-auto" data-testid="list-cis-controls">
                    {controls.map((c, i) => (
                      <div key={i} className="flex flex-col gap-0.5 py-0.5" data-testid={`cis-control-${c.id}`}>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span style={{ color: c.passed ? "#22c55e" : "#ef4444" }}>{c.passed ? "✓" : "✗"}</span>
                          <span className="flex-1 truncate text-muted-foreground">{c.id}: {c.name}</span>
                          <span className="font-mono text-[9px]" style={{ color: c.passed ? "#22c55e" : "#ef4444" }}>{c.passed ? "Pass" : "Fail"}</span>
                        </div>
                        {c.evidence && (
                          <div className="text-[9px] text-muted-foreground pl-5 truncate">{c.evidence}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {assetId && (
              <Button size="sm" variant="ghost" className="text-[10px] h-6 text-muted-foreground hover:text-foreground" onClick={() => computeMut.mutate()} disabled={computeMut.isPending} data-testid="btn-recompute-cis">
                <RefreshCw className={`w-3 h-3 mr-1 ${computeMut.isPending ? "animate-spin" : ""}`} /> Recompute
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Criticality Badge Card ───────────────────────────────────────────────────
const CRITICALITY_OPTIONS = ["critical", "high", "medium", "low", "unclassified"] as const;
const CRITICALITY_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#3b82f6", low: "#22c55e", unclassified: "#6b7280",
};

function CriticalityCard({ tenantId, assetId, criticality: initialVal, isMSS, assetName }: {
  tenantId: number; assetId: number | null; criticality: string | null; isMSS: boolean; assetName: string;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(initialVal ?? "unclassified");
  const [editing, setEditing] = useState(false);

  const patchMut = useMutation({
    mutationFn: (newVal: string) => apiRequest("PATCH", `/api/assets/${tenantId}/${assetId}/criticality`, { criticality: newVal }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      toast({ title: "Criticality updated" });
    },
    onError: () => toast({ title: "Failed to update criticality", variant: "destructive" }),
  });

  const color = CRITICALITY_COLOR[value] ?? "#6b7280";

  return (
    <Card className="border-border/40 bg-card/60" data-testid="card-criticality">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5" /> Asset Criticality
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `2px solid ${color}40` }}>
          <AlertTriangle className="w-7 h-7" style={{ color }} />
        </div>
        {editing && isMSS && assetId ? (
          <div className="w-full space-y-2">
            <Select value={value} onValueChange={v => setValue(v)}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="select-criticality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRITICALITY_OPTIONS.map(o => (
                  <SelectItem key={o} value={o} className="text-[11px]">{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-[10px]" onClick={() => patchMut.mutate(value)} disabled={patchMut.isPending} data-testid="btn-save-criticality">
                Save
              </Button>
              <Button size="sm" variant="ghost" className="flex-1 h-7 text-[10px]" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <Badge className="text-[11px] px-3 py-1 capitalize" style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }} data-testid="badge-criticality-value">
              {value}
            </Badge>
            {isMSS && assetId && (
              <Button size="sm" variant="ghost" className="text-[10px] h-6 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} data-testid="btn-edit-criticality">
                Edit Criticality
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Assigned User Card ───────────────────────────────────────────────────────
function AssignedUserCard({ tenantId, assetId, primaryUserEmail: initialEmail, primaryUserId: initialId, linkedUserIds: initialLinkedIds, isMSS, assetName }: {
  tenantId: number; assetId: number | null; primaryUserEmail: string | null; primaryUserId: number | null; linkedUserIds?: string[]; isMSS: boolean; assetName: string;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [userId, setUserId] = useState<number | null>(initialId);
  const [linkedUserIds, setLinkedUserIds] = useState<string[]>(initialLinkedIds ?? []);
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState("");

  const { data: users, isLoading: loadingUsers } = useQuery<any[]>({
    queryKey: ["/api/user-assets", tenantId, "list"],
    queryFn: async () => {
      const res = await fetch(`/api/user-assets/${tenantId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showDialog,
  });

  const { data: assignedUserRecord } = useQuery<any>({
    queryKey: ["/api/user-assets", tenantId, "record", userId],
    queryFn: async () => {
      const res = await fetch(`/api/user-assets/${tenantId}`, { credentials: "include" });
      if (!res.ok) return null;
      const all = await res.json();
      return all.find((u: any) => u.id === userId || String(u.id) === String(userId)) ?? null;
    },
    enabled: !!userId,
  });

  const assignMut = useMutation({
    mutationFn: (u: any) => apiRequest("POST", `/api/assets/${tenantId}/${assetId}/assign-user`, {
      userId: u.id,
      email: u.email || null,
      displayName: u.userName || u.username || u.email || null,
    }),
    onSuccess: async (res: any, u: any) => {
      const data = await res.json();
      setEmail(data.primaryUserEmail ?? u.email ?? null);
      const resolvedUserId = data.primaryUserId ?? u.id;
      setUserId(resolvedUserId);
      const uidStr = String(resolvedUserId);
      setLinkedUserIds(prev => prev.includes(uidStr) ? prev : [...prev, uidStr]);
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-assets", tenantId, "record"] });
      toast({ title: "User assigned to asset" });
    },
    onError: () => toast({ title: "Failed to assign user", variant: "destructive" }),
  });

  const unassignMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/assets/${tenantId}/${assetId}/unassign-user`),
    onSuccess: () => {
      if (userId) setLinkedUserIds(prev => prev.filter(uid => uid !== String(userId)));
      setEmail(null);
      setUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      toast({ title: "User unassigned" });
    },
    onError: () => toast({ title: "Failed to unassign user", variant: "destructive" }),
  });

  const autoCorrelateMut = useMutation({
    mutationFn: () => assetId
      ? apiRequest("POST", `/api/assets/${tenantId}/${assetId}/correlate-user`)
      : apiRequest("POST", `/api/assets/${tenantId}/correlate-users`),
    onSuccess: async (res: any) => {
      const data = await res.json();
      if (data.email) setEmail(data.email);
      if (data.userId) {
        const resolvedId = parseInt(String(data.userId)) || null;
        setUserId(resolvedId);
        if (resolvedId) {
          const uidStr = String(resolvedId);
          setLinkedUserIds(prev => prev.includes(uidStr) ? prev : [...prev, uidStr]);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId] });
      const msg = data.matched ? `Matched: ${data.email}` : "No match found for this asset";
      toast({ title: "Auto-detection complete", description: msg });
    },
    onError: () => toast({ title: "Auto-detection failed", variant: "destructive" }),
  });

  const filtered = (users ?? []).filter((u: any) =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.userName?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = assignedUserRecord
    ? ([assignedUserRecord.firstName, assignedUserRecord.lastName].filter(Boolean).join(" ") ||
       assignedUserRecord.userName || assignedUserRecord.username || null)
    : null;
  const department = assignedUserRecord?.department ?? null;
  const title = assignedUserRecord?.title ?? null;

  return (
    <>
      <Card className="border-border/40 bg-card/60" data-testid="card-assigned-user">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3.5 h-3.5" /> Assigned User
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-muted/40 border border-border/40">
            <User className="w-7 h-7 text-muted-foreground" />
          </div>
          {email ? (
            <>
              {displayName && (
                <div className="text-[12px] font-semibold text-center" data-testid="text-assigned-name">{displayName}</div>
              )}
              <div className="text-[11px] text-muted-foreground text-center truncate max-w-full" data-testid="text-assigned-email">{email}</div>
              {(title || department) && (
                <div className="text-[10px] text-muted-foreground text-center" data-testid="text-assigned-dept">
                  {[title, department].filter(Boolean).join(" · ")}
                </div>
              )}
              <Badge variant="outline" className="text-[9px]" style={{ color: "#22c55e", borderColor: "#22c55e40", backgroundColor: "#22c55e10" }}>
                <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Assigned
              </Badge>
              {isMSS && assetId && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-[10px] h-6 text-muted-foreground hover:text-foreground" onClick={() => setShowDialog(true)} data-testid="btn-change-user">
                    Change
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[10px] h-6 text-red-400 hover:text-red-500" onClick={() => unassignMut.mutate()} disabled={unassignMut.isPending} data-testid="btn-unassign-user">
                    <XCircle className="w-3 h-3 mr-1" /> Unassign
                  </Button>
                </div>
              )}
              {linkedUserIds.length > 1 && (
                <div className="w-full mt-1" data-testid="linked-users-section">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Linked Users</div>
                  <div className="flex flex-wrap gap-1" data-testid="list-linked-users">
                    {linkedUserIds.map((uid) => (
                      <Badge key={uid} variant="secondary" className="text-[9px] px-1.5 py-0" data-testid={`chip-linked-user-${uid}`}>
                        <Link2 className="w-2.5 h-2.5 mr-1" />User {uid}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground text-center">No user assigned</div>
              {isMSS && assetId && (
                <div className="flex gap-2 flex-wrap justify-center">
                  <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => setShowDialog(true)} data-testid="btn-assign-user">
                    <UserCheck className="w-3 h-3 mr-1" /> Assign User
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[10px] h-7 text-muted-foreground" onClick={() => autoCorrelateMut.mutate()} disabled={autoCorrelateMut.isPending} data-testid="btn-auto-correlate-asset">
                    <RefreshCw className={`w-3 h-3 mr-1 ${autoCorrelateMut.isPending ? "animate-spin" : ""}`} /> Auto-Detect
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Assign User to {assetName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-[12px]" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-user-search" />
            </div>
            {loadingUsers ? (
              <div className="text-center text-[11px] text-muted-foreground py-4">Loading users…</div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filtered.length === 0 ? (
                  <div className="text-center text-[11px] text-muted-foreground py-4">No users found</div>
                ) : filtered.map((u: any) => (
                  <button key={u.id} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-left transition-colors" onClick={() => assignMut.mutate(u)} disabled={assignMut.isPending} data-testid={`btn-select-user-${u.id}`}>
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[11px] font-medium">{u.userName || u.username || u.email}</div>
                      {u.email && (u.userName || u.username) && <div className="text-[10px] text-muted-foreground">{u.email}</div>}
                      {u.department && <div className="text-[9px] text-muted-foreground/70">{u.department}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AssetDetailPage() {
  const [, params] = useRoute("/assets/:tenantId/:assetName");
  const { currentTenant, isMSS } = useTenant();
  const fmt = useTenantDateFormatter();
  const tenantId = params?.tenantId ? parseInt(params.tenantId) : currentTenant?.id;
  const assetName = params?.assetName ? decodeURIComponent(params.assetName) : "";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/assets", tenantId, "detail", assetName],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${tenantId}/detail/${encodeURIComponent(assetName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load asset details");
      return res.json();
    },
    enabled: !!tenantId && !!assetName,
  });

  const assetDbId = data?.id;
  const { data: telemetry } = useQuery<any>({
    queryKey: ["/api/assets", tenantId, "device-telemetry", assetDbId],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${tenantId}/device-telemetry/${assetDbId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId && !!assetDbId,
  });

  const refreshSoftwareMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("POST", `/api/assets/${assetId}/refresh-software`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId, "detail", assetName] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId, "device-telemetry", assetDbId] });
    },
  });

  const syncAssetMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("POST", `/api/assets/${assetId}/sync`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId, "detail", assetName] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", tenantId, "device-telemetry", assetDbId] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
        </div>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Asset not found or no data available.</CardContent></Card>
      </div>
    );
  }

  const d = data;
  const sevData = [
    { name: "Critical", value: d.severityCounts.critical, color: C.red },
    { name: "High", value: d.severityCounts.high, color: C.orange },
    { name: "Medium", value: d.severityCounts.medium, color: C.blue },
    { name: "Low", value: d.severityCounts.low, color: C.green },
  ].filter(s => s.value > 0);

  const eventTypeData = (d.security?.eventTypes ?? []).map((et: string, i: number) => ({
    name: et,
    value: (d.recentEvents ?? []).filter((e: any) => e.eventType === et).length,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: `${SEV[d.riskLevel] || C.blue}15` }}>
              <Monitor className="w-5 h-5" style={{ color: SEV[d.riskLevel] || C.blue }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-asset-name">{d.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <RiskBar level={d.riskLevel} score={d.riskScore} />
                <span className="text-[11px] text-muted-foreground">
                  First seen: {d.firstSeen ? fmt.formatDate(d.firstSeen) : "N/A"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Last seen: {d.lastSeen ? fmt.formatDate(d.lastSeen) : "N/A"}
                </span>
              </div>
              {d.groups && d.groups.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap" data-testid="asset-groups">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Groups:</span>
                  {d.groups.map((g: { name: string; source: string }, i: number) => {
                    const sourceColors: Record<string, string> = {
                      EDR: C.blue, AD: C.purple, "Patch Management": C.orange,
                      "Asset Management": C.teal, DLP: C.red, NDR: C.green, Scanner: C.yellow,
                    };
                    const sc = sourceColors[g.source] || C.blue;
                    return (
                      <div key={i} className="flex items-center gap-1" data-testid={`asset-group-${i}`}>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 font-medium" style={{ borderColor: `${sc}40`, color: sc, backgroundColor: `${sc}10` }}>
                          {g.source}
                        </Badge>
                        <span className="text-[11px] font-medium" data-testid={`text-group-name-${i}`}>{g.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        {isMSS && assetDbId && (
          <Button
            variant="outline"
            size="sm"
            data-testid="button-sync-asset"
            onClick={() => syncAssetMutation.mutate(assetDbId)}
            disabled={syncAssetMutation.isPending}
            className="shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncAssetMutation.isPending ? "animate-spin" : ""}`} />
            {syncAssetMutation.isPending ? "Syncing…" : "Sync Asset"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10">
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="text-xl font-bold" data-testid="text-total-events">{d.totalEvents}</div>
              <div className="text-[10px] text-muted-foreground">Security Events</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <div className="text-xl font-bold" data-testid="text-total-incidents">{d.totalIncidents}</div>
              <div className="text-[10px] text-muted-foreground">Incidents</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <RiskGauge score={d.riskScore} size={80} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10">
              <Shield className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{d.enrichmentRiskScore > 0 ? Math.min(100, d.enrichmentRiskScore) : Math.min(100, d.avgRiskScore)}</div>
              <div className="text-[10px] text-muted-foreground">{d.enrichmentRiskScore > 0 ? "Max Event Risk" : "Avg Risk Score"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="network" className="text-xs" data-testid="tab-network">Network & Identity</TabsTrigger>
          <TabsTrigger value="system" className="text-xs" data-testid="tab-system">System & Software</TabsTrigger>
          <TabsTrigger value="security" className="text-xs" data-testid="tab-security">Security Controls</TabsTrigger>
          <TabsTrigger value="vulnerabilities" className="text-xs" data-testid="tab-vulnerabilities">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs" data-testid="tab-incidents">Incidents</TabsTrigger>
          <TabsTrigger value="events" className="text-xs" data-testid="tab-events">Events</TabsTrigger>
          <TabsTrigger value="ioc" className="text-xs" data-testid="tab-ioc">IOC & Enrichment</TabsTrigger>
          <TabsTrigger value="risk" className="text-xs" data-testid="tab-risk">Risk Score</TabsTrigger>
          <TabsTrigger value="warranty" className="text-xs" data-testid="tab-warranty">Warranty & License</TabsTrigger>
          <TabsTrigger value="edr" className="text-xs" data-testid="tab-edr">CIS Benchmark Assessment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <SectionCard title="Severity Distribution" icon={BarChart3} color={C.red}>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sevData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {sevData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Event Types" icon={Layers} color={C.blue}>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventTypeData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {eventTypeData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Quick Info" icon={FileText} color={C.teal}>
              <div className="space-y-0">
                <InfoRow label="Asset Name" value={d.name} icon={Monitor} />
                <div className="flex items-start gap-2 py-1.5 border-b border-border/30">
                  <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-[11px] text-muted-foreground min-w-[100px]">Risk Level</span>
                  <RiskBar level={d.riskLevel} score={d.riskScore} />
                </div>
                <InfoRow label="Risk Score" value={`${d.riskScore}/100`} icon={Shield} />
                {d.enrichmentRiskScore > 0 && <InfoRow label="Event Risk" value={d.enrichmentRiskScore} icon={Target} />}
                <InfoRow label="Operating System" value={telemetry?.operatingSystem || d.assetMetadata?.operatingSystem || d.system?.os?.[0]} icon={Monitor} />
                <InfoRow label="Endpoint Group" value={telemetry?.endpointGroup || d.assetMetadata?.endpointGroup} icon={Layers} />
                <InfoRow label="Agent Version" value={telemetry?.agentVersion || d.assetMetadata?.agentVersion} icon={Shield} />
                <InfoRow label="First Seen" value={d.firstSeen ? fmt.formatDate(d.firstSeen) : "N/A"} icon={Clock} />
                <InfoRow label="Last Seen" value={d.lastSeen ? fmt.formatDate(d.lastSeen) : "N/A"} icon={Clock} />
                <InfoRow label="Deployment Type" value={d.deploymentType || "On Prem"} icon={Cloud} />
                <InfoRow label="Event Types" value={(d.security?.eventTypes ?? []).join(", ")} icon={Layers} />
                <InfoRow label="MITRE Tactics" value={(d.security?.mitreTactics ?? []).join(", ") || "None"} icon={Target} />
                {telemetry?.securitySources?.length > 0 && (
                  <InfoRow label="Security Sources" value={telemetry.securitySources.slice(0, 5).join(", ")} icon={ShieldAlert} />
                )}
              </div>
            </SectionCard>
          </div>

          {d.compositeRisk && (
            <SectionCard title="Risk Score Breakdown" icon={ShieldAlert} color={C.orange}>
              <div className="grid md:grid-cols-[1fr_2fr] gap-6">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RiskGauge score={d.riskScore ?? 0} size={120} />
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-risk-level" style={{
                    borderColor: d.riskLevel === "critical" ? `${C.red}50` : d.riskLevel === "high" ? `${C.orange}50` : d.riskLevel === "medium" ? `${C.yellow}50` : `${C.green}50`,
                    color: d.riskLevel === "critical" ? C.red : d.riskLevel === "high" ? C.orange : d.riskLevel === "medium" ? C.yellow : C.green,
                    backgroundColor: d.riskLevel === "critical" ? `${C.red}10` : d.riskLevel === "high" ? `${C.orange}10` : d.riskLevel === "medium" ? `${C.yellow}10` : `${C.green}10`,
                  }}>
                    {(d.riskLevel || d.compositeRisk.riskLevel).toUpperCase()} RISK
                  </Badge>
                  {d.enrichmentRiskScore > 0 && (
                    <div className="text-[10px] text-muted-foreground text-center mt-1">
                      Event Risk: {d.enrichmentRiskScore}
                    </div>
                  )}
                  {d.storedRiskScore !== null && d.storedRiskScore !== undefined && (
                    <div className="text-[10px] text-muted-foreground text-center mt-0.5">
                      Sensor Score: {d.storedRiskScore}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {d.compositeRisk.pillars.map((p: any) => (
                    <PillarBar key={p.key} name={p.name} score={p.score} weight={p.weight} details={p.details} />
                  ))}
                </div>
              </div>
              {d.compositeRisk.compoundAlerts && d.compositeRisk.compoundAlerts.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" style={{ color: C.orange }} /> Compound Risk Alerts
                  </div>
                  {d.compositeRisk.compoundAlerts.map((alert: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/20" data-testid={`compound-alert-${i}`}>
                      <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.orange }} />
                      <span className="text-[11px]">{alert}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {d.severityTimeline.length > 0 && (
            <SectionCard title="Event Timeline" icon={Activity} color={C.indigo}>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.severityTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => fmt.formatChartLabel(v)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Area type="monotone" dataKey="critical" stackId="1" fill={C.red} stroke={C.red} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="high" stackId="1" fill={C.orange} stroke={C.orange} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="medium" stackId="1" fill={C.blue} stroke={C.blue} fillOpacity={0.6} />
                    <Area type="monotone" dataKey="low" stackId="1" fill={C.green} stroke={C.green} fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {/* CIS Score + Criticality + Assigned User row */}
          <div className="grid md:grid-cols-3 gap-4">
            <CisScoreCard tenantId={tenantId!} assetId={d.id} cisScore={d.cisScore} cisBenchmark={d.cisBenchmark} />
            <CriticalityCard tenantId={tenantId!} assetId={d.id} criticality={d.criticality} isMSS={isMSS} assetName={assetName} />
            <AssignedUserCard tenantId={tenantId!} assetId={d.id} primaryUserEmail={d.primaryUserEmail} primaryUserId={d.primaryUserId} linkedUserIds={d.linkedUserIds ?? []} isMSS={isMSS} assetName={assetName} />
          </div>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="IP Addresses" icon={Globe} color={C.blue}>
              {(() => {
                const allIps = Array.from(new Set([...(telemetry?.ipAddresses || []), ...(d.network.ips || [])]));
                return allIps.length > 0 ? (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {allIps.map((ip: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                        <Network className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-mono">{ip}</span>
                        {telemetry?.ipAddresses?.includes(ip) && !d.network.ips?.includes(ip) && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">Asset Record</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <span className="text-[11px] text-muted-foreground">No IP addresses detected</span>;
              })()}
            </SectionCard>

            <SectionCard title="MAC Addresses" icon={Fingerprint} color={C.purple}>
              {(() => {
                const allMacs = Array.from(new Set([...(telemetry?.macAddresses || []), ...(d.network.macs || [])]));
                return allMacs.length > 0 ? (
                  <div className="space-y-1.5">
                    {allMacs.map((mac: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                        <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-mono">{mac}</span>
                        {telemetry?.macAddresses?.includes(mac) && !d.network.macs?.includes(mac) && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">Asset Record</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <span className="text-[11px] text-muted-foreground">No MAC addresses detected</span>;
              })()}
            </SectionCard>

            <SectionCard title="Protocols" icon={Layers} color={C.teal}>
              <TagList items={d.network.protocols} color={C.teal} />
            </SectionCard>

            <SectionCard title="Geolocations" icon={Globe} color={C.green}>
              <TagList items={d.network.countries} color={C.green} />
            </SectionCard>
          </div>

          <SectionCard title="Logged-In Users" icon={Users} color={C.indigo}>
            {(telemetry?.lastLoginUser || telemetry?.lastLoginAt) && (
              <div className="mb-3 p-2.5 rounded-lg border bg-muted/20 space-y-1">
                <InfoRow label="Last Login User" value={telemetry.lastLoginUser || d.assetMetadata?.lastLoggedInUser} icon={User} />
                {telemetry.lastLoginAt && (
                  <InfoRow label="Last Login Time" value={fmt.formatDateTime(telemetry.lastLoginAt)} icon={Clock} />
                )}
              </div>
            )}
            {(() => {
              const allUsers = Array.from(new Set([...(telemetry?.loggedInUsers || []), ...(d.system.loggedInUsers || [])]));
              const linkedUserNames = new Set((d.linkedUsers || []).map((u: any) => (u.userName || "").toLowerCase()));
              return allUsers.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {allUsers.map((user: string, i: number) => {
                    const hasProfile = linkedUserNames.has(user.toLowerCase());
                    return (
                    <Link key={i} href={`/users/${tenantId}/${encodeURIComponent(user)}`}>
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors" data-testid={`link-user-${i}`}>
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[11px] font-medium text-primary hover:underline truncate">{user}</span>
                        <div className="flex items-center gap-0.5 ml-auto shrink-0">
                          {telemetry?.loggedInUsers?.includes(user) && !d.system.loggedInUsers?.includes(user) && (
                            <Badge variant="outline" className="text-[7px] px-1 py-0">Asset Record</Badge>
                          )}
                          {!hasProfile && (
                            <Badge variant="outline" className="text-[7px] px-1 py-0 text-muted-foreground border-dashed" title="No user profile found in the system">No profile</Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No user login data available</span>;
            })()}
          </SectionCard>

          {d.linkedUsers && d.linkedUsers.length > 0 && (
            <SectionCard title="Linked User Profiles" icon={UserCheck} color={C.blue}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {d.linkedUsers.map((u: any, i: number) => (
                  <Link key={i} href={`/users/${tenantId}/${encodeURIComponent(u.userName)}`}>
                    <div className="p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer transition-colors space-y-2" data-testid={`card-linked-user-${i}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-500" />
                          <span className="text-[12px] font-semibold text-primary hover:underline">{u.userName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {u.accountType && (
                            <Badge variant="outline" className="text-[7px] px-1 py-0 capitalize">{u.accountType}</Badge>
                          )}
                          {u.riskLevel && (
                            <Badge variant={u.riskLevel === "high" || u.riskLevel === "critical" ? "destructive" : u.riskLevel === "medium" ? "default" : "secondary"} className="text-[8px] px-1.5 py-0 capitalize">
                              {u.riskLevel}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {u.email && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                      {(u.department || u.title) && (
                        <div className="text-[10px] text-muted-foreground">
                          {[u.title, u.department].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        {u.loginCount > 0 && <span className="flex items-center gap-1"><Key className="w-3 h-3" /> {u.loginCount} logins</span>}
                        {u.serviceCount > 0 && <span className="flex items-center gap-1"><Cloud className="w-3 h-3" /> {u.serviceCount} apps</span>}
                        {u.totalRequests > 0 && <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {u.totalRequests} req</span>}
                        {u.deniedRequests > 0 && <span className="flex items-center gap-1 text-red-500"><Shield className="w-3 h-3" /> {u.deniedRequests} denied</span>}
                        {u.downloadedBytesMB > 0 && <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {u.downloadedBytesMB.toFixed(0)} MB ↓</span>}
                        {u.uploadedBytesMB > 0 && <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> {u.uploadedBytesMB.toFixed(0)} MB ↑</span>}
                      </div>
                      {u.lastActivity && (
                        <div className="text-[9px] text-muted-foreground/60">Last active: {new Date(u.lastActivity).toLocaleDateString()}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}

          {d.loginHistory && d.loginHistory.length > 0 && (
            <SectionCard title="Login Activity" icon={Key} color={C.green}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">Time</TableHead>
                    <TableHead className="text-[10px] h-8">User</TableHead>
                    <TableHead className="text-[10px] h-8">Source IP</TableHead>
                    <TableHead className="text-[10px] h-8">Country</TableHead>
                    <TableHead className="text-[10px] h-8">Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.loginHistory.slice(0, 20).map((login: any, i: number) => (
                    <TableRow key={i} data-testid={`row-login-${i}`}>
                      <TableCell className="text-[10px] py-1.5 font-mono">{login.timestamp ? fmt.formatDateTime(login.timestamp) : "—"}</TableCell>
                      <TableCell className="text-[10px] py-1.5 font-medium">{login.userName || "—"}</TableCell>
                      <TableCell className="text-[10px] py-1.5 font-mono">{login.ip || "—"}</TableCell>
                      <TableCell className="text-[10px] py-1.5">{login.country || "—"}</TableCell>
                      <TableCell className="text-[10px] py-1.5">{login.service || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}

          {d.cloudApplications && d.cloudApplications.length > 0 && (
            <SectionCard title="Cloud Applications" icon={Cloud} color={C.sky}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                {d.cloudApplications.map((app: any, i: number) => (
                  <div key={i} className="p-2 rounded-md border bg-card" data-testid={`card-cloud-app-${i}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Cloud className="w-3 h-3 text-sky-500" />
                      <span className="text-[11px] font-medium truncate">{app.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                      {app.category && <Badge variant="secondary" className="text-[8px] px-1 py-0">{app.category}</Badge>}
                      <span>{app.totalActivity} events</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {d.emailSecurity && d.emailSecurity.total > 0 && (
            <SectionCard title="Email Security" icon={Lock} color={C.red}>
              <div className="flex gap-4 flex-wrap">
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <div className="text-lg font-bold">{d.emailSecurity.total}</div>
                  <div className="text-[10px] text-muted-foreground">Total Email Threats</div>
                </div>
                {Object.entries(d.emailSecurity.bySeverity || {}).map(([sev, count]: [string, any]) => (
                  <div key={sev} className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-lg font-bold" style={{ color: SEV[sev] || C.blue }}>{count}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{sev}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          {d.enrichmentData && (
            <SectionCard title="Security Enrichment Data" icon={ShieldCheck} color={C.teal}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {d.enrichmentData.securitySource && (
                  <div className="space-y-1" data-testid="enrichment-source">
                    <div className="text-[10px] text-muted-foreground">Source</div>
                    <Badge variant="secondary" className="text-[10px]">{d.enrichmentData.securitySource}</Badge>
                  </div>
                )}
                {d.enrichmentData.avProduct && (
                  <div className="space-y-1" data-testid="enrichment-av-product">
                    <div className="text-[10px] text-muted-foreground">AV Product</div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" style={{ color: C.green }} />
                      <span className="text-[11px] font-medium">{d.enrichmentData.avProduct}</span>
                    </div>
                  </div>
                )}
                {d.enrichmentData.avStatus && (
                  <div className="space-y-1" data-testid="enrichment-av-status">
                    <div className="text-[10px] text-muted-foreground">AV Status</div>
                    <Badge variant={d.enrichmentData.avStatus === "active" || d.enrichmentData.avStatus === "enabled" ? "secondary" : "destructive"} className="text-[10px]">
                      {d.enrichmentData.avStatus}
                    </Badge>
                  </div>
                )}
                {d.enrichmentData.avVersion && (
                  <div className="space-y-1" data-testid="enrichment-av-version">
                    <div className="text-[10px] text-muted-foreground">AV Version</div>
                    <span className="text-[11px] font-mono">{d.enrichmentData.avVersion}</span>
                  </div>
                )}
                {d.enrichmentData.maxRiskScore > 0 && (
                  <div className="space-y-1" data-testid="enrichment-max-risk">
                    <div className="text-[10px] text-muted-foreground">Max Risk Score</div>
                    <div className="text-sm font-bold" style={{ color: d.enrichmentData.maxRiskScore >= 70 ? C.red : d.enrichmentData.maxRiskScore >= 40 ? C.orange : C.green }}>{d.enrichmentData.maxRiskScore}</div>
                  </div>
                )}
                {d.enrichmentData.scanGroups?.length > 0 && (
                  <div className="space-y-1" data-testid="enrichment-scan-groups">
                    <div className="text-[10px] text-muted-foreground">Scan Groups</div>
                    <div className="flex flex-wrap gap-1">
                      {d.enrichmentData.scanGroups.map((g: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {d.enrichmentData.epsActions?.length > 0 && (
                  <div className="space-y-1" data-testid="enrichment-eps-actions">
                    <div className="text-[10px] text-muted-foreground">EPS Actions</div>
                    <div className="flex flex-wrap gap-1">
                      {d.enrichmentData.epsActions.map((a: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {d.enrichmentData.loggedInUsers?.length > 0 && (
                  <div className="space-y-1" data-testid="enrichment-logged-in-users">
                    <div className="text-[10px] text-muted-foreground">Logged-in Users (from enrichment)</div>
                    <div className="flex flex-wrap gap-1">
                      {d.enrichmentData.loggedInUsers.map((u: string, i: number) => (
                        <Link key={i} href={`/users/${tenantId}/${encodeURIComponent(u)}`}>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 cursor-pointer hover:bg-muted" data-testid={`link-enrichment-user-${i}`}>{u}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.enrichmentData.enrichedAt && (
                  <div className="space-y-1" data-testid="enrichment-timestamp">
                    <div className="text-[10px] text-muted-foreground">Enriched At</div>
                    <div className="text-[10px]">{fmt.formatDateTime(d.enrichmentData.enrichedAt)}</div>
                  </div>
                )}
              </div>
              {d.enrichmentData.cynetIncidents?.length > 0 && (
                <div className="mt-3 pt-3 border-t" data-testid="enrichment-cynet-incidents">
                  <div className="text-[10px] text-muted-foreground mb-2">Recent Cynet Incidents</div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.enrichmentData.cynetIncidents.slice(0, 10).map((inc: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0.5">{inc}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="Operating System" icon={Monitor} color={C.blue}>
              {d.system.os.length > 0 || d.assetMetadata?.operatingSystem ? (
                <div className="space-y-1.5">
                  {d.system.os.map((os: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30" data-testid={`text-os-${i}`}>
                      <Monitor className="w-4 h-4 text-blue-500" />
                      <span className="text-[12px] font-medium">{os}</span>
                    </div>
                  ))}
                  {d.system.os.length === 0 && d.assetMetadata?.operatingSystem && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30" data-testid="text-os-metadata">
                      <Monitor className="w-4 h-4 text-blue-500" />
                      <span className="text-[12px] font-medium">{d.assetMetadata.operatingSystem}</span>
                    </div>
                  )}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">OS information not available</span>}
            </SectionCard>

            <SectionCard title="Hardware & Device Info" icon={Cpu} color={C.orange}>
              {(d.hardwareSpecs && Object.values(d.hardwareSpecs).some((v: any) => v)) || d.assetMetadata || telemetry?.hardwareProfile ? (
                <div className="space-y-0">
                  <InfoRow label="Domain/Group" value={d.assetMetadata?.endpointGroup} icon={Network} />
                  <InfoRow label="Agent Version" value={d.assetMetadata?.agentVersion} icon={GitBranch} />
                  <InfoRow label="Deployment Type" value={d.assetMetadata?.deploymentType || d.deploymentType} icon={Cloud} />
                  <InfoRow label="Source" value={d.assetMetadata?.source} icon={Server} />
                  {d.rawAsset?.sourcePlatforms?.length > 0 && (
                    <div className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                      <Database className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-muted-foreground mb-1">Sync Sources</div>
                        <div className="flex flex-wrap gap-1">
                          {(d.rawAsset.sourcePlatforms as string[]).map((platform: string) => (
                            <Badge key={platform} variant="outline" className="text-[9px] px-1.5 py-0 font-mono border-blue-500/30 text-blue-600 dark:text-blue-400">
                              {platform}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <InfoRow label="Prevention Policy" value={d.assetMetadata?.preventionPolicy} icon={ShieldCheck} />
                  <InfoRow label="Content Version" value={d.assetMetadata?.contentVersion} icon={Package} />
                  <InfoRow label="Serial Number" value={telemetry?.hardwareProfile?.biosSerialNumber || d.hardwareSpecs?.biosSerialNumber} icon={Fingerprint} />
                  <InfoRow label="Processor" value={telemetry?.hardwareProfile?.processor || d.hardwareSpecs?.processor} icon={Cpu} />
                  <InfoRow label="Memory (RAM)" value={telemetry?.hardwareProfile?.totalPhysicalMemory || d.hardwareSpecs?.totalPhysicalMemory} icon={MemoryStick} />
                  <InfoRow label="Storage" value={telemetry?.hardwareProfile?.storageInfo || d.hardwareSpecs?.storageInfo} icon={HardDrive} />
                  <InfoRow label="Model" value={telemetry?.hardwareProfile?.systemModel || d.hardwareSpecs?.systemModel} icon={Box} />
                  <InfoRow label="Manufacturer" value={telemetry?.hardwareProfile?.systemManufacturer || d.hardwareSpecs?.systemManufacturer} icon={Wrench} />
                  <InfoRow label="Device Health" value={telemetry?.hardwareProfile?.deviceHealth || d.hardwareSpecs?.deviceHealth} icon={HeartPulse} />
                </div>
              ) : d.system.hardware.length > 0 ? (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {d.system.hardware.map((hw: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                      <HardDrive className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[11px] font-mono">{hw}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No hardware data available</span>}
            </SectionCard>
          </div>

          {d.cloudApplications && d.cloudApplications.length > 0 && (
            <SectionCard title="Cloud Software (via User Correlation)" icon={Cloud} color={C.sky}>
              <div className="text-[10px] text-muted-foreground mb-2">
                Applications discovered through correlated user activity on this device
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">Application</TableHead>
                    <TableHead className="text-[10px] h-8">Category</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Activity</TableHead>
                    <TableHead className="text-[10px] h-8">Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.cloudApplications.slice(0, 30).map((app: any, i: number) => (
                    <TableRow key={i} data-testid={`row-cloud-sw-${i}`}>
                      <TableCell className="text-[11px] py-1.5 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3 h-3 text-sky-500" />
                          {app.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] py-1.5">
                        {app.category ? <Badge variant="secondary" className="text-[8px] px-1 py-0">{app.category}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] py-1.5 text-right font-mono">{app.totalActivity}</TableCell>
                      <TableCell className="text-[10px] py-1.5">
                        {app.users?.length > 0 ? app.users.slice(0, 3).join(", ") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}

          <SectionCard title="Software Inventory" icon={Package} color={C.purple}>
            {((() => {
                const SENTINEL_NAMES = ["cyneteps", "fortinac", "sentinel agent", "crowdstrike falcon sensor", "microsoft defender antivirus", "windows security health service"];
                const inv = Array.isArray(d.softwareInventory) ? d.softwareInventory : [];
                const telInv = telemetry?.softwareInventory || [];
                const combined = [...inv, ...telInv];
                if (combined.length === 0) return false;
                const isSentinelOnly = combined.every((sw: any) => SENTINEL_NAMES.some(s => (sw.name || "").toLowerCase().includes(s)));
                return !isSentinelOnly;
              })()) ? (
              (() => {
                const seen = new Set<string>();
                const rawSw = [...(telemetry?.softwareInventory || []), ...(Array.isArray(d.softwareInventory) ? d.softwareInventory : [])];
                const uniqueSw = rawSw.filter((sw: any) => {
                  const key = `${(sw.name || '').toLowerCase()}||${(sw.version || '').toLowerCase()}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });

                // Partition into cloud-app (Skyhigh SSE only) vs traditional/installed/security-agents
                // Security tools (CynetEPS, FortiNAC, etc.) have 'category' but are NOT cloud apps
                // Only activityTypes or Skyhigh source = cloud app
                const isCloudApp = (sw: any) => !!(sw.activityTypes || (typeof sw.source === "string" && sw.source.toLowerCase().includes("skyhigh")));
                const cloudApps = uniqueSw.filter(isCloudApp);
                const installedApps = uniqueSw.filter((sw: any) => !isCloudApp(sw));

                return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {installedApps.length > 0 && `${installedApps.length} installed`}
                    {installedApps.length > 0 && cloudApps.length > 0 && " · "}
                    {cloudApps.length > 0 && `${cloudApps.length} cloud apps`}
                  </span>
                  {isMSS && d.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={refreshSoftwareMutation.isPending}
                      onClick={() => refreshSoftwareMutation.mutate(d.id)}
                      data-testid="button-refresh-software"
                    >
                      <RefreshCw className={`w-3 h-3 ${refreshSoftwareMutation.isPending ? "animate-spin" : ""}`} />
                      {refreshSoftwareMutation.isPending ? "Refreshing..." : "Refresh"}
                    </Button>
                  )}
                </div>

                {/* Traditional / Observed installed software */}
                {installedApps.length > 0 && (
                  <div>
                    {cloudApps.length > 0 && <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Installed / Observed</p>}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-8">Application</TableHead>
                          <TableHead className="text-[10px] h-8">Version</TableHead>
                          <TableHead className="text-[10px] h-8 text-center">EOL / EOS</TableHead>
                          <TableHead className="text-[10px] h-8">Install Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installedApps.map((sw: any, i: number) => {
                          const { Icon: SwIcon, color: swColor } = getSoftwareIcon(sw.name || '');
                          const eolInfo = lookupEOL(sw.name || '', sw.version || '');
                          return (
                          <TableRow key={i} data-testid={`row-software-${i}`}>
                            <TableCell className="text-[11px] py-1.5 font-medium">
                              <div className="flex items-center gap-2">
                                <SwIcon className="w-3.5 h-3.5 shrink-0" style={{ color: swColor }} />
                                {sw.name}
                                {sw.source === "asset_record" && (
                                  <Badge variant="outline" className="text-[7px] px-1 py-0 text-primary/70 border-primary/30" title="Sourced from asset metadata">Asset</Badge>
                                )}
                                {sw.source === "detected" && (
                                  <Badge variant="outline" className="text-[7px] px-1 py-0 text-green-600 border-green-300" title="Detected security agent">Agent</Badge>
                                )}
                                {(sw.source === "event_telemetry" || sw.source === "observed:cynet_events") && (
                                  <Badge variant="outline" className="text-[7px] px-1 py-0 text-muted-foreground" title="Observed via security telemetry">Observed</Badge>
                                )}
                                {sw.category && sw.source !== "asset_record" && (
                                  <Badge variant="secondary" className="text-[7px] px-1 py-0">{sw.category}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 font-mono text-muted-foreground">{sw.version || "—"}</TableCell>
                            <TableCell className="text-center py-1.5">
                              {eolInfo ? (
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {eolInfo.eolStatus === "ended" ? (
                                    <Badge variant="destructive" className="text-[8px] px-1.5 py-0" title={`EOL: ${eolInfo.eolDate}${eolInfo.successor ? ` → ${eolInfo.successor}` : ''}`}>EOL</Badge>
                                  ) : eolInfo.eolStatus === "approaching" ? (
                                    <Badge className="text-[8px] px-1.5 py-0 bg-amber-500/20 text-amber-600 border-amber-300" title={`EOL: ${eolInfo.eolDate}`}>EOL Soon</Badge>
                                  ) : null}
                                  {eolInfo.eosStatus === "ended" ? (
                                    <Badge className="text-[8px] px-1.5 py-0 bg-orange-500/20 text-orange-600 border-orange-300" title={`EOS: ${eolInfo.eosDate}`}>EOS</Badge>
                                  ) : eolInfo.eosStatus === "approaching" ? (
                                    <Badge className="text-[8px] px-1.5 py-0 bg-yellow-500/20 text-yellow-600 border-yellow-300" title={`EOS: ${eolInfo.eosDate}`}>EOS Soon</Badge>
                                  ) : null}
                                  {eolInfo.eolStatus === "active" && eolInfo.eosStatus === "active" && (
                                    <Badge className="text-[8px] px-1.5 py-0 bg-green-500/20 text-green-600 border-green-300">OK</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[9px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 text-muted-foreground">{sw.installDate || "—"}</TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Cloud applications (Skyhigh SSE format) */}
                {cloudApps.length > 0 && (
                  <div>
                    {installedApps.length > 0 && <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 mt-2">Cloud Applications</p>}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-8">Application</TableHead>
                          <TableHead className="text-[10px] h-8">Category</TableHead>
                          <TableHead className="text-[10px] h-8">Activity Types</TableHead>
                          <TableHead className="text-[10px] h-8 text-right">Total Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cloudApps.map((sw: any, i: number) => {
                          const { Icon: SwIcon, color: swColor } = getSoftwareIcon(sw.name || '');
                          const actTypes: string[] = Array.isArray(sw.activityTypes) ? sw.activityTypes : [];
                          return (
                          <TableRow key={i} data-testid={`row-cloudapp-${i}`}>
                            <TableCell className="text-[11px] py-1.5 font-medium">
                              <div className="flex items-center gap-2">
                                <SwIcon className="w-3.5 h-3.5 shrink-0" style={{ color: swColor }} />
                                {sw.name}
                                <Badge variant="outline" className="text-[7px] px-1 py-0 text-blue-500 border-blue-300" title="Cloud application activity from SSE">Cloud App</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 text-muted-foreground capitalize">{sw.category || "—"}</TableCell>
                            <TableCell className="text-[11px] py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {actTypes.length > 0 ? actTypes.map((a: string, j: number) => (
                                  <Badge key={j} variant="secondary" className="text-[7px] px-1 py-0 capitalize">{a}</Badge>
                                )) : <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 text-right font-mono text-muted-foreground">{sw.totalActivity ? sw.totalActivity.toLocaleString() : "—"}</TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
                );
              })()
            ) : d.system.software.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                {d.system.software.map((sw: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <Database className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px]">{sw}</span>
                  </div>
                ))}
              </div>
            ) : d.enrichmentData?.cloudApplications?.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground mb-2">Cloud applications discovered via enrichment</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                  {d.enrichmentData.cloudApplications.map((app: any, i: number) => (
                    <div key={i} className="p-2 rounded-md border bg-card" data-testid={`card-enrichment-app-${i}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Cloud className="w-3 h-3 text-sky-500" />
                        <span className="text-[11px] font-medium truncate">{app.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                        {app.category && <Badge variant="secondary" className="text-[8px] px-1 py-0">{app.category}</Badge>}
                        {app.totalActivity > 0 && <span>{app.totalActivity} events</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="w-4 h-4 opacity-40" />
                    <span className="text-[11px]" data-testid="text-no-software-detail">
                      {(() => {
                        const SENTINEL_NAMES = ["cyneteps", "fortinac", "sentinel agent", "crowdstrike falcon sensor", "microsoft defender antivirus", "windows security health service"];
                        const inv = [...(Array.isArray(d.softwareInventory) ? d.softwareInventory : []), ...(telemetry?.softwareInventory || [])];
                        const isSentinelOnly = inv.length > 0 && inv.every((sw: any) => SENTINEL_NAMES.some(s => (sw.name || "").toLowerCase().includes(s)));
                        return isSentinelOnly
                          ? `Only security agent detected. No additional software data returned by Cynet API.${isMSS ? " Click Refresh to fetch the full inventory." : ""}`
                          : `No software inventory data available.${isMSS ? " Click Refresh to fetch from connected sources." : ""}`;
                      })()}
                    </span>
                  </div>
                  {isMSS && d.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={refreshSoftwareMutation.isPending}
                      onClick={() => refreshSoftwareMutation.mutate(d.id)}
                      data-testid="button-refresh-software-empty"
                    >
                      <RefreshCw className={`w-3 h-3 ${refreshSoftwareMutation.isPending ? "animate-spin" : ""}`} />
                      {refreshSoftwareMutation.isPending ? "Scanning..." : "Refresh"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="MITRE ATT&CK Tactics" icon={Target} color={C.red}>
              <TagList items={d.security?.mitreTactics ?? []} color={C.red} />
            </SectionCard>

            <SectionCard title="MITRE ATT&CK Techniques" icon={Zap} color={C.orange}>
              <TagList items={d.security?.mitreTechniques ?? []} color={C.orange} />
            </SectionCard>

            <SectionCard title="Detection Sources" icon={Eye} color={C.teal}>
              <TagList items={d.security?.detectionSources ?? []} color={C.teal} />
            </SectionCard>

            <SectionCard title="Log Sources" icon={Server} color={C.blue}>
              <TagList items={d.security?.logSources ?? []} color={C.blue} />
            </SectionCard>
          </div>

          <SectionCard title="Security Controls Implemented" icon={ShieldCheck} color={C.green}>
            {(() => {
              const toolControls = (d.securityToolsCoverage || []).map((tool: any) => {
                const parts = [tool.tool];
                if (tool.version) parts.push(`v${tool.version}`);
                if (tool.status) parts.push(`(${tool.status})`);
                if (tool.details) parts.push(`| ${tool.details}`);
                return parts.join(' ');
              });
              const allControls = [...toolControls, ...(d.security?.securityControls ?? [])];
              return allControls.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allControls.map((ctrl: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-md bg-green-500/5 border border-green-500/10">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      <span className="text-[11px] font-medium text-foreground">{ctrl}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[11px] text-muted-foreground">No security control data available</span>;
            })()}
          </SectionCard>

          <SectionCard title="Actions Taken" icon={Lock} color={C.indigo}>
            <TagList items={d.security?.actions ?? []} color={C.indigo} />
          </SectionCard>

          {/* EDR Endpoint Actions embedded in Security Controls tab */}
          <EdrActionsPanel assetId={d?.id} asset={d} tenantId={tenantId!} />
        </TabsContent>

        <TabsContent value="vulnerabilities" className="space-y-4">
          <SectionCard title="Vulnerabilities" icon={Bug} color={C.red}>
            {d.vulnerabilities.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Vulnerability</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Status</TableHead>
                      <TableHead className="text-[10px] uppercase">Risk Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.vulnerabilities.map((v: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] font-medium max-w-[300px] truncate">{v.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[v.severity] || C.blue}20`, color: SEV[v.severity] || C.blue }}>
                            {v.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px]">{v.status}</TableCell>
                        <TableCell>
                          {v.riskScore ? (
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(parseInt(v.riskScore), 100)} className="h-1.5 w-16" />
                              <span className="text-[10px] font-mono">{Math.min(parseInt(v.riskScore), 100)}</span>
                            </div>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-green-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No vulnerabilities detected for this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <SectionCard title="Related Incidents" icon={AlertTriangle} color={C.red}>
            {d.recentIncidents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Title</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Status</TableHead>
                      <TableHead className="text-[10px] uppercase">Category</TableHead>
                      <TableHead className="text-[10px] uppercase">MITRE Tactic</TableHead>
                      <TableHead className="text-[10px] uppercase">Kill Chain</TableHead>
                      <TableHead className="text-[10px] uppercase">Confidence</TableHead>
                      <TableHead className="text-[10px] uppercase">Classification</TableHead>
                      <TableHead className="text-[10px] uppercase">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentIncidents.map((inc: any, i: number) => (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.href = `/events?domain=overview&incidentId=${inc.id}`} data-testid={`incident-row-${i}`}>
                        <TableCell className="text-[11px] font-medium max-w-[250px] truncate">{inc.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[inc.severity] || C.blue}20`, color: SEV[inc.severity] || C.blue }}>
                            {inc.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{inc.status}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px]">{inc.category || "-"}</TableCell>
                        <TableCell>
                          {inc.mitreTactic ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.red}15`, color: C.red }}>{inc.mitreTactic}</Badge> : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.killChainPhase ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.purple}15`, color: C.purple }}>{inc.killChainPhase}</Badge> : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.confidenceScore != null ? (
                            <div className="flex items-center gap-1.5">
                              <Progress value={inc.confidenceScore} className="h-1.5 w-12" />
                              <span className="text-[10px] font-mono">{inc.confidenceScore}%</span>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {inc.classification ? (
                            <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: inc.classification === "true_positive" ? `${C.red}15` : `${C.green}15`, color: inc.classification === "true_positive" ? C.red : C.green }}>
                              {inc.classification === "true_positive" ? "TP" : inc.classification === "false_positive" ? "FP" : inc.classification}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {fmt.formatDate(inc.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-green-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No incidents linked to this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <SectionCard title="Recent Security Events" icon={Activity} color={C.blue}>
            {(d.recentEvents?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Type</TableHead>
                      <TableHead className="text-[10px] uppercase">Severity</TableHead>
                      <TableHead className="text-[10px] uppercase">Threat</TableHead>
                      <TableHead className="text-[10px] uppercase">Description</TableHead>
                      <TableHead className="text-[10px] uppercase">MITRE Tactic</TableHead>
                      <TableHead className="text-[10px] uppercase">Action</TableHead>
                      <TableHead className="text-[10px] uppercase">Risk</TableHead>
                      <TableHead className="text-[10px] uppercase">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d.recentEvents ?? []).map((evt: any, i: number) => (
                      <TableRow key={i} data-testid={`event-row-${i}`}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px]">{evt.eventType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: `${SEV[evt.severity] || C.blue}20`, color: SEV[evt.severity] || C.blue }}>
                            {evt.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[200px] truncate">{evt.threat || "-"}</TableCell>
                        <TableCell className="text-[11px] max-w-[250px] truncate">{evt.description || "-"}</TableCell>
                        <TableCell>
                          {evt.mitreTactic ? <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${C.red}15`, color: C.red }}>{evt.mitreTactic}</Badge> : "-"}
                        </TableCell>
                        <TableCell className="text-[11px]">{evt.action || "-"}</TableCell>
                        <TableCell>
                          {evt.riskScore ? (
                            <span className="text-[11px] font-mono font-medium" style={{ color: evt.riskScore > 300 ? C.red : evt.riskScore > 100 ? C.orange : C.green }}>{evt.riskScore}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {fmt.formatDate(evt.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-blue-500/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No security events for this asset</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ioc" className="space-y-4">
          <SectionCard title="IOC Indicators" icon={Fingerprint} color={C.red}>
            {d.iocIndicators.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Type</TableHead>
                      <TableHead className="text-[10px] uppercase">Value</TableHead>
                      <TableHead className="text-[10px] uppercase">Reputation</TableHead>
                      <TableHead className="text-[10px] uppercase">Country</TableHead>
                      <TableHead className="text-[10px] uppercase">Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.iocIndicators.map((ioc: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px]">{ioc.type}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono max-w-[200px] truncate">{ioc.value}</TableCell>
                        <TableCell>
                          {ioc.reputation ? (
                            <Badge variant="secondary" className="text-[9px]" style={{
                              backgroundColor: ioc.reputation === "malicious" ? `${C.red}15` : ioc.reputation === "suspicious" ? `${C.orange}15` : `${C.green}15`,
                              color: ioc.reputation === "malicious" ? C.red : ioc.reputation === "suspicious" ? C.orange : C.green,
                            }}>
                              {ioc.reputation}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-[11px]">
                          {ioc.country ? <CountryFlag code={ioc.country} showName /> : "-"}
                        </TableCell>
                        <TableCell className="text-[11px]">{ioc.source || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Fingerprint className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No IOC data available for this asset</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="AI Enrichment Summary" icon={Zap} color={C.amber}>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">MITRE ATT&CK Coverage</h4>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{(d.security?.mitreTactics ?? []).length}</span>
                  <span className="text-[11px] text-muted-foreground">tactics detected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{(d.security?.mitreTechniques ?? []).length}</span>
                  <span className="text-[11px] text-muted-foreground">techniques identified</span>
                </div>
                <TagList items={d.security?.mitreTactics ?? []} color={C.red} />
              </div>
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detection Coverage</h4>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{(d.security?.logSources ?? []).length}</span>
                  <span className="text-[11px] text-muted-foreground">log sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{(d.security?.detectionSources ?? []).length}</span>
                  <span className="text-[11px] text-muted-foreground">detection sources</span>
                </div>
                <TagList items={d.security?.logSources ?? []} color={C.blue} />
              </div>
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Risk Assessment</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Risk Score</span>
                    <span className="font-bold">{d.riskScore}/100</span>
                  </div>
                  <Progress value={Math.min(d.riskScore, 100)} className="h-2" />
                  {d.enrichmentRiskScore > 0 && (
                    <>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Max Event Risk</span>
                        <span className="font-bold">{d.enrichmentRiskScore}</span>
                      </div>
                      <Progress value={Math.min((d.enrichmentRiskScore / 500) * 100, 100)} className="h-2" />
                    </>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <RiskIntelligenceTab tenantId={tenantId!} assetId={d.id} assetName={d.name} cisScore={d.cisScore ?? null} criticality={d.criticality ?? null} />
        </TabsContent>

        {/* ─── WARRANTY & LICENSE TAB ────────────────────────────────── */}
        <TabsContent value="warranty" className="space-y-4">
          <WarrantyLicensePanel assetId={d?.id} asset={d} />
        </TabsContent>

        {/* ─── EDR ASSESSMENT TAB ─────────────────────────────────────── */}
        <TabsContent value="edr" className="space-y-4">
          <EdrAssessmentPanel assetId={d?.id} asset={d} tenantId={tenantId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RiskIntelligenceTab({ tenantId, assetId, assetName, cisScore, criticality }: { tenantId: number; assetId: number; assetName: string; cisScore: number | null; criticality: string | null }) {
  const { data: riskData, isLoading } = useQuery<any>({
    queryKey: ["/api/risk/entity", tenantId, "asset", assetId],
    queryFn: async () => {
      const res = await fetch(`/api/risk/entity/${tenantId}/asset/${assetId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId && !!assetId,
  });

  if (isLoading) return <Skeleton className="h-64" />;

  if (!riskData) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground" data-testid="risk-empty-state">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No risk score calculated yet for this asset.</p>
          <p className="text-xs mt-1">Navigate to CAASM &gt; Risk Intelligence to run risk calculations.</p>
        </CardContent>
      </Card>
    );
  }

  const pillarLabels: Record<string, string> = {
    securityToolCoverage: "Security Tool Coverage",
    vulnerabilityPatch: "Vulnerability & Patch",
    incidentHistory: "Incident History",
    compliancePosture: "Compliance",
    contextualFactors: "Contextual Factors",
  };
  const pillarColors: Record<string, string> = {
    securityToolCoverage: C.blue, vulnerabilityPatch: C.red, incidentHistory: C.orange, compliancePosture: C.purple, contextualFactors: C.teal,
  };
  const pillars = riskData.pillarScores || {};
  const alerts = riskData.compoundRiskAlerts || [];
  const lvl = riskData.riskLevel || "low";
  const lvlColor = lvl === "critical" ? C.red : lvl === "high" ? C.orange : lvl === "medium" ? C.yellow : C.green;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Overall Risk Score" icon={Shield} color={lvlColor}>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold" style={{ color: lvlColor }} data-testid="text-risk-overall-score">
                {riskData.overallScore?.toFixed(1)}
              </span>
              <Badge className="mt-1 text-[10px]" style={{ backgroundColor: `${lvlColor}20`, color: lvlColor, border: `1px solid ${lvlColor}40` }} data-testid="badge-risk-level">
                {lvl.toUpperCase()}
              </Badge>
            </div>
            <div className="flex-1 space-y-2">
              {Object.entries(pillars).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">{pillarLabels[key] || key}</span>
                    <span className="font-medium" style={{ color: pillarColors[key] || C.blue }}>{String(val)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Number(val), 100)}%`, backgroundColor: pillarColors[key] || C.blue }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Compound Risk Alerts" icon={AlertTriangle} color={C.red}>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No compound risk alerts detected.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {alerts.map((alert: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50" data-testid={`risk-alert-${i}`}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: lvlColor }} />
                  <div>
                    <span className="text-[11px] font-medium">{alert}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {(cisScore !== null || criticality) && (
        <SectionCard title="CIS Compliance & Criticality" icon={Shield} color={C.teal}>
          <div className="grid grid-cols-2 gap-4">
            {cisScore !== null && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CIS Score</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: cisScore >= 70 ? "#22c55e" : cisScore >= 40 ? "#f59e0b" : "#ef4444" }} data-testid="risk-cis-score">{cisScore}</span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                  <div className="h-full rounded-full" style={{ width: `${cisScore}%`, backgroundColor: cisScore >= 70 ? "#22c55e" : cisScore >= 40 ? "#f59e0b" : "#ef4444" }} />
                </div>
                <div className="text-[10px] text-muted-foreground">{cisScore >= 70 ? "Compliant — meets CIS Controls v8 targets" : cisScore >= 40 ? "Partial — some CIS controls need attention" : "Non-Compliant — critical CIS gaps detected"}</div>
              </div>
            )}
            {criticality && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset Criticality</div>
                <Badge className="text-[10px] px-2 py-0.5" style={{ backgroundColor: `${CRITICALITY_COLOR[criticality] ?? "#6b7280"}20`, color: CRITICALITY_COLOR[criticality] ?? "#6b7280", borderColor: `${CRITICALITY_COLOR[criticality] ?? "#6b7280"}40` }} data-testid="risk-criticality-badge">
                  {criticality.toUpperCase()}
                </Badge>
                <div className="text-[10px] text-muted-foreground">
                  {criticality === "critical" ? "Highest risk multiplier applied to this asset's score" :
                   criticality === "high" ? "Elevated risk multiplier — prioritize remediation" :
                   criticality === "medium" ? "Standard risk weighting for this asset" :
                   criticality === "low" ? "Reduced risk weighting — lower priority" :
                   "No criticality assigned — default weighting applied"}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ─── Risk Factor Table ──────────────────────────────────────────── */}
      <SectionCard title="Risk Factor Breakdown" icon={BarChart3} color={C.blue}>
        <div className="overflow-x-auto" data-testid="risk-factor-table">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-1.5 pr-4 text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Factor</th>
                <th className="text-right py-1.5 pr-4 text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Value</th>
                <th className="text-right py-1.5 pr-4 text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Weight</th>
                <th className="text-right py-1.5 text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {Object.entries(pillars).map(([key, val]) => {
                const numVal = Number(val);
                const statusColor = numVal >= 70 ? "#22c55e" : numVal >= 40 ? "#f59e0b" : "#ef4444";
                const weights: Record<string, string> = {
                  securityToolCoverage: "25%", vulnerabilityPatch: "30%", incidentHistory: "20%",
                  compliancePosture: "15%", contextualFactors: "10%",
                };
                return (
                  <tr key={key} data-testid={`risk-factor-${key}`}>
                    <td className="py-1.5 pr-4 text-foreground font-medium">{pillarLabels[key] || key}</td>
                    <td className="text-right py-1.5 pr-4 font-mono" style={{ color: statusColor }}>{numVal.toFixed(1)}</td>
                    <td className="text-right py-1.5 pr-4 text-muted-foreground">{weights[key] || "—"}</td>
                    <td className="text-right py-1.5">
                      <Badge className="text-[9px] px-1.5 py-0" style={{ backgroundColor: `${statusColor}20`, color: statusColor, borderColor: `${statusColor}40` }}>
                        {numVal >= 70 ? "Good" : numVal >= 40 ? "Fair" : "Poor"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {/* CIS Compliance factor row — explicit */}
              {cisScore !== null && (
                <tr className="bg-teal-500/5" data-testid="risk-factor-cis">
                  <td className="py-1.5 pr-4 font-medium" style={{ color: "#14b8a6" }}>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3 h-3" />
                      Configuration Compliance (CIS)
                    </div>
                  </td>
                  <td className="text-right py-1.5 pr-4 font-mono" style={{ color: cisScore >= 70 ? "#22c55e" : cisScore >= 40 ? "#f59e0b" : "#ef4444" }}>{cisScore}</td>
                  <td className="text-right py-1.5 pr-4 text-muted-foreground">15%</td>
                  <td className="text-right py-1.5">
                    <Badge className="text-[9px] px-1.5 py-0" style={{ backgroundColor: `${cisScore >= 70 ? "#22c55e" : cisScore >= 40 ? "#f59e0b" : "#ef4444"}20`, color: cisScore >= 70 ? "#22c55e" : cisScore >= 40 ? "#f59e0b" : "#ef4444" }}>
                      {cisScore >= 70 ? "Compliant" : cisScore >= 40 ? "Partial" : "Non-Compliant"}
                    </Badge>
                  </td>
                </tr>
              )}
              {/* Criticality Multiplier row — explicit */}
              {criticality && (
                <tr className="bg-orange-500/5" data-testid="risk-factor-criticality-multiplier">
                  <td className="py-1.5 pr-4 font-medium" style={{ color: "#f97316" }}>
                    <div className="flex items-center gap-1.5">
                      <Target className="w-3 h-3" />
                      Criticality Multiplier
                    </div>
                  </td>
                  <td className="text-right py-1.5 pr-4 font-mono" style={{ color: CRITICALITY_COLOR[criticality] ?? "#6b7280" }}>
                    ×{criticality === "critical" ? "1.25" : criticality === "high" ? "1.10" : criticality === "medium" ? "1.00" : criticality === "low" ? "0.90" : "1.00"}
                  </td>
                  <td className="text-right py-1.5 pr-4 text-muted-foreground">—</td>
                  <td className="text-right py-1.5">
                    <Badge className="text-[9px] px-1.5 py-0" style={{ backgroundColor: `${CRITICALITY_COLOR[criticality] ?? "#6b7280"}20`, color: CRITICALITY_COLOR[criticality] ?? "#6b7280" }}>
                      {criticality.toUpperCase()}
                    </Badge>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mini trend sparkline — risk score trend using current/previous scores */}
        {riskData.overallScore != null && (
          <div className="mt-4 pt-4 border-t border-border/30" data-testid="risk-trend-sparkline">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Score Trend</span>
              <span className="text-[10px] text-muted-foreground">
                Current: <span className="font-mono font-medium text-foreground">{riskData.overallScore?.toFixed(1)}</span>
                {riskData.previousScore != null && (
                  <span className={`ml-1.5 font-medium ${riskData.scoreDelta > 0 ? "text-red-400" : riskData.scoreDelta < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                    {riskData.scoreDelta > 0 ? `↑+${riskData.scoreDelta?.toFixed(1)}` : riskData.scoreDelta < 0 ? `↓${riskData.scoreDelta?.toFixed(1)}` : "→0"}
                  </span>
                )}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={(() => {
                const current = riskData.overallScore ?? 50;
                const previous = riskData.previousScore ?? current;
                const delta = current - previous;
                // Build a monotone trend from previousScore → currentScore using linear interpolation
                return [
                  { label: "Prev", score: Math.round(previous) },
                  { label: "Mid", score: Math.round(previous + delta * 0.33) },
                  { label: "Late", score: Math.round(previous + delta * 0.67) },
                  { label: "Now", score: Math.round(current) },
                ];
              })()} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <Line type="monotone" dataKey="score" stroke={C.blue} strokeWidth={1.5} dot={{ r: 3, fill: C.blue }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "4px", fontSize: "10px", padding: "4px 8px" }}
                  formatter={(v: any) => [v, "Risk Score"]}
                  labelFormatter={(l: any) => l}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {riskData.riskBreakdown && (
        <SectionCard title="Risk Breakdown Details" icon={Target} color={C.indigo}>
          <div className="grid md:grid-cols-3 gap-4 text-xs">
            {riskData.riskBreakdown.vulnerability && (
              <div className="space-y-1" data-testid="risk-breakdown-vuln">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><Bug className="w-3 h-3" /> Vulnerability</h4>
                <p>EOL Software: <span className="font-medium">{riskData.riskBreakdown.vulnerability.eolSoftwareCount}</span></p>
                <p>EOS Approaching: <span className="font-medium">{riskData.riskBreakdown.vulnerability.eosApproachingCount}</span></p>
                <p>OS EOL Status: <Badge variant="outline" className="text-[9px] ml-1">{riskData.riskBreakdown.vulnerability.osEolStatus}</Badge></p>
              </div>
            )}
            {riskData.riskBreakdown.incidents && (
              <div className="space-y-1" data-testid="risk-breakdown-incidents">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Incidents</h4>
                <p>Total: <span className="font-medium">{riskData.riskBreakdown.incidents.total}</span></p>
                <p>Critical: <span className="font-medium text-red-500">{riskData.riskBreakdown.incidents.critical}</span></p>
                <p>True Positives: <span className="font-medium">{riskData.riskBreakdown.incidents.truePositives}</span></p>
              </div>
            )}
            {riskData.riskBreakdown.toolCoverage && (
              <div className="space-y-1" data-testid="risk-breakdown-tools">
                <h4 className="font-medium text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Tool Coverage</h4>
                <p>Covered: <span className="font-medium">{riskData.riskBreakdown.toolCoverage.coveredCategories}/{riskData.riskBreakdown.toolCoverage.totalCategories}</span></p>
                <p>Coverage: <span className="font-medium">{((riskData.riskBreakdown.toolCoverage.coveredCategories / Math.max(riskData.riskBreakdown.toolCoverage.totalCategories, 1)) * 100).toFixed(0)}%</span></p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

    </div>
  );
}

// ─── WARRANTY & LICENSE PANEL ────────────────────────────────────────────────
function WarrantyLicensePanel({ assetId, asset }: { assetId: number; asset: any }) {
  const queryClient = useQueryClient();
  const [lookupResult, setLookupResult] = useState<any>(null);

  const lookupMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/assets/${assetId}/warranty-lookup`, {}),
    onSuccess: async (data) => {
      const result = await data.json();
      setLookupResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
    },
  });

  const warrantyStatus = asset?.warrantyStatus || lookupResult?.warrantyStatus;
  const warrantyExpiry = asset?.warrantyExpiry ? new Date(asset.warrantyExpiry) : lookupResult?.warrantyExpiry ? new Date(lookupResult.warrantyExpiry) : null;
  const licenseExpiry = asset?.licenseExpiry ? new Date(asset.licenseExpiry) : lookupResult?.licenseExpiry ? new Date(lookupResult.licenseExpiry) : null;
  const purchaseDate = asset?.purchaseDate ? new Date(asset.purchaseDate) : lookupResult?.purchaseDate ? new Date(lookupResult.purchaseDate) : null;
  const now = new Date();

  const warrantyDaysLeft = warrantyExpiry ? Math.floor((warrantyExpiry.getTime() - now.getTime()) / 86400000) : null;
  const licenseDaysLeft = licenseExpiry ? Math.floor((licenseExpiry.getTime() - now.getTime()) / 86400000) : null;

  const wColor = warrantyStatus === "active" ? "#10b981" : warrantyStatus === "expiring_soon" ? "#f59e0b" : warrantyStatus === "expired" ? "#ef4444" : "#6b7280";
  const lColor = !licenseExpiry ? "#6b7280" : (licenseDaysLeft || 0) < 0 ? "#ef4444" : (licenseDaysLeft || 0) < 90 ? "#f59e0b" : "#10b981";

  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <div className="space-y-4">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Serial: <span className="font-mono text-foreground">{asset?.biosSerialNumber || "—"}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{asset?.systemManufacturer || "Unknown Manufacturer"} · {asset?.systemModel || "Unknown Model"}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => lookupMutation.mutate()}
          disabled={lookupMutation.isPending}
          data-testid="btn-warranty-lookup"
          className="flex items-center gap-2"
        >
          {lookupMutation.isPending ? (
            <><span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Looking up…</>
          ) : (
            <><Key className="w-4 h-4" /> Lookup Warranty & License</>
          )}
        </Button>
      </div>

      {lookupResult && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
          Retrieved from <span className="text-foreground font-medium mx-1">{lookupResult.lookupSource}</span> at {new Date(lookupResult.lookupTimestamp).toLocaleTimeString()}
        </div>
      )}

      {/* Warranty info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Warranty Status
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: wColor }} />
              <span className="text-lg font-bold capitalize" style={{ color: wColor }}>
                {warrantyStatus ? warrantyStatus.replace("_", " ") : "Unknown"}
              </span>
              {warrantyDaysLeft !== null && warrantyDaysLeft > 0 && (
                <Badge variant="outline" style={{ borderColor: wColor + "40", color: wColor }} className="text-xs">
                  {warrantyDaysLeft}d remaining
                </Badge>
              )}
              {warrantyDaysLeft !== null && warrantyDaysLeft <= 0 && (
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-500">
                  Expired {Math.abs(warrantyDaysLeft)}d ago
                </Badge>
              )}
            </div>
            {warrantyDaysLeft !== null && (
              <Progress value={Math.max(0, Math.min(100, (warrantyDaysLeft / 1095) * 100))} className="h-1.5" />
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Purchase Date</div>
                <div className="font-medium">{fmt(purchaseDate)}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Expiry Date</div>
                <div className="font-medium">{fmt(warrantyExpiry)}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Warranty Type</div>
                <div className="font-medium">{lookupResult?.warrantyType || asset?.warrantyContractId || "—"}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Support Level</div>
                <div className="font-medium">{lookupResult?.supportLevel || "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> License Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: lColor }} />
              <span className="text-lg font-bold" style={{ color: lColor }}>
                {!licenseExpiry ? "Unknown" : (licenseDaysLeft || 0) < 0 ? "Expired" : (licenseDaysLeft || 0) < 90 ? "Expiring Soon" : "Active"}
              </span>
              {licenseDaysLeft !== null && licenseDaysLeft > 0 && (
                <Badge variant="outline" style={{ borderColor: lColor + "40", color: lColor }} className="text-xs">
                  {licenseDaysLeft}d remaining
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">License Key</div>
                <div className="font-mono text-[10px] truncate">{asset?.licenseKey || lookupResult?.licenseKey || "—"}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">License Expiry</div>
                <div className="font-medium">{fmt(licenseExpiry)}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">License Status</div>
                <div className="font-medium capitalize">{asset?.licenseStatus || lookupResult?.licenseStatus || "—"}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">Source</div>
                <div className="font-medium">{lookupResult?.lookupSource || "Manual"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User & Location correlation */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> User & Location Assignment</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Primary User</div>
              <div className="font-medium">{(() => {
                const candidates = [
                  asset?.assetMetadata?.lastLoggedInUser,
                  asset?.hardwareSpecs?.lastLoggedInUser,
                  asset?.linkedUsers?.[0]?.userName,
                  asset?.system?.loggedInUsers?.[0],
                ].filter((u: any) => u && typeof u === "string" && !/^\d+$/.test(u));
                return candidates[0] || "—";
              })()}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">User Email</div>
              <div className="font-medium truncate">{asset?.linkedUsers?.[0]?.email || asset?.primaryUserEmail || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Location</div>
              <div className="font-medium">{asset?.assetLocation || asset?.cloudRegion || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Asset Group</div>
              <div className="font-medium">{asset?.assetGroup || asset?.endpointGroup || "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hardware specs */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4 text-primary" /> Hardware Specifications</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Processor</div>
              <div className="font-medium">{asset?.processor || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Processor Cores</div>
              <div className="font-medium">{asset?.processorCores || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Memory</div>
              <div className="font-medium">{asset?.totalPhysicalMemory || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Memory Type</div>
              <div className="font-medium">{asset?.memoryType || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Serial Number</div>
              <div className="font-mono text-[10px]">{asset?.biosSerialNumber || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Site</div>
              <div className="font-medium">{asset?.assetSite || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Building</div>
              <div className="font-medium">{asset?.assetBuilding || "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-muted-foreground">Storage</div>
              <div className="font-medium">{asset?.storageInfo ? JSON.stringify(asset.storageInfo).slice(0, 40) + "…" : "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── EDR ASSESSMENT PANEL ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PASS: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  FAIL: { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",         icon: XCircle },
  WARN: { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: AlertTriangle },
  SKIP: { color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/20",     icon: Eye },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low:      "bg-blue-500/10 text-blue-400 border-blue-500/30",
  info:     "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

const EDR_PLATFORM_LABELS: Record<string, string> = {
  cynet:                 "Cynet 360",
  crowdstrike:           "CrowdStrike Falcon",
  sentinelone:           "SentinelOne Singularity",
  ms_defender_endpoint:  "MS Defender for Endpoint",
};

const PRESET_COMMANDS = [
  { key: "clear_temp_files",      label: "Clear Temp Files",          icon: Trash2,     description: "Remove temp files to eliminate persistence" },
  { key: "run_av_scan",           label: "Run AV Scan",               icon: Shield,     description: "Trigger a quick antivirus scan" },
  { key: "kill_process",          label: "Kill Suspicious Processes",  icon: XCircle,    description: "Terminate commonly-misused processes" },
  { key: "flush_dns",             label: "Flush DNS Cache",            icon: RefreshCw,  description: "Clear potentially poisoned DNS cache" },
  { key: "disable_local_account", label: "Disable Local Account",      icon: UserCheck,  description: "Lock the last-seen local user account" },
];

function EdrActionsPanel({ assetId, asset, tenantId }: { assetId: number; asset: any; tenantId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isMSS } = useTenant();

  const actionsQuery = useQuery<any[]>({
    queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-actions"],
    queryFn: () => fetch(`/api/caasm/assets/${tenantId}/${assetId}/edr-actions`).then(r => r.json()),
    enabled: !!assetId,
  });

  const [unisolateDialogOpen, setUnisolateDialogOpen] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<string>(PRESET_COMMANDS[0].key);

  const isolateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/caasm/assets/${tenantId}/${assetId}/edr-isolate`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: data.success ? "Host Isolated" : "Isolation Failed", description: data.message, variant: data.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-actions"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unisolateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/caasm/assets/${tenantId}/${assetId}/edr-unisolate`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: data.success ? "Isolation Lifted" : "Unisolate Failed", description: data.message, variant: data.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-actions"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const commandMutation = useMutation({
    mutationFn: (commandKey: string) => apiRequest("POST", `/api/caasm/assets/${tenantId}/${assetId}/edr-remediate`, { commandKey }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: data.success ? "Command Sent" : "Command Failed", description: data.success ? data.message?.slice(0, 120) : data.message, variant: data.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-actions"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const actions: any[] = actionsQuery.data ?? [];

  if (!isMSS) {
    return (
      <Card className="border-slate-700/50 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-400" />
            Endpoint Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground">
            <Shield className="h-4 w-4 shrink-0 text-slate-500" />
            Endpoint isolation and remediation actions are restricted to MSS team members.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Isolation Controls ───────────────────────────────────── */}
      <Card className="border-slate-700/50 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-400" />
            Endpoint Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Network Isolation — immediately cut or restore network access</p>
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!asset?.edrHostId || isolateMutation.isPending}
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
                    data-testid="button-isolate-host"
                  >
                    {isolateMutation.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <PowerOff className="h-3 w-3 mr-1" />}
                    Isolate Host
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Isolate this endpoint?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cut the host's network access via the EDR platform. The host will be quarantined and unable to reach the network until unisolated. This action is logged.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => isolateMutation.mutate()} className="bg-red-600 hover:bg-red-700">
                      Isolate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={unisolateDialogOpen} onOpenChange={setUnisolateDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!asset?.edrHostId || unisolateMutation.isPending}
                    className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                    data-testid="button-unisolate-host"
                  >
                    {unisolateMutation.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Power className="h-3 w-3 mr-1" />}
                    Lift Isolation
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Lift network isolation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restore full network access to the host via the EDR platform. Ensure the threat has been fully remediated before lifting isolation. This action is logged.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { setUnisolateDialogOpen(false); unisolateMutation.mutate(); }}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      Lift Isolation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Preset command picker + execute */}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Select a pre-approved remediation command, then click Execute to run it on the endpoint.</p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Select value={selectedCommand} onValueChange={setSelectedCommand}>
                  <SelectTrigger className="h-9 text-xs bg-slate-900 border-slate-600" data-testid="select-preset-command">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_COMMANDS.map(cmd => {
                      const CmdIcon = cmd.icon;
                      return (
                        <SelectItem key={cmd.key} value={cmd.key}>
                          <div className="flex items-center gap-2">
                            <CmdIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <div>
                              <span className="font-medium">{cmd.label}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">— {cmd.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={!asset?.edrHostId || commandMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
                onClick={() => commandMutation.mutate(selectedCommand)}
                data-testid="button-execute-command"
              >
                {commandMutation.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                Execute
              </Button>
            </div>
            {selectedCommand && (() => {
              const cmd = PRESET_COMMANDS.find(c => c.key === selectedCommand);
              return cmd ? (
                <p className="text-[10px] text-muted-foreground px-1">{cmd.description}</p>
              ) : null;
            })()}
          </div>
        </CardContent>
      </Card>

      {/* ── Action History ─────────────────────────────────────── */}
      {actions.length > 0 && (
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-400" />
              Action History
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">Last 5 actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/40 hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 pl-4">Date</TableHead>
                  <TableHead className="text-[10px] h-7">Action</TableHead>
                  <TableHead className="text-[10px] h-7">Platform</TableHead>
                  <TableHead className="text-[10px] h-7">Status</TableHead>
                  <TableHead className="text-[10px] h-7">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.slice(0, 5).map((a: any) => (
                  <TableRow key={a.id} className="border-slate-700/30 hover:bg-slate-800/30" data-testid={`row-action-${a.id}`}>
                    <TableCell className="py-1.5 pl-4 text-[10px] font-mono">{new Date(a.runAt).toLocaleString()}</TableCell>
                    <TableCell className="py-1.5 text-[10px]">
                      {a.actionType === "run_command" ? (a.commandKey ?? "run_command") : a.actionType}
                    </TableCell>
                    <TableCell className="py-1.5 text-[10px]">{EDR_PLATFORM_LABELS[a.edrPlatform] ?? a.edrPlatform}</TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant="outline" className={a.status === "success" ? "border-emerald-500/40 text-emerald-400 text-[10px]" : "border-red-500/40 text-red-400 text-[10px]"}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-[10px] text-muted-foreground">{a.triggeredBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EdrAssessmentPanel({ assetId, asset, tenantId }: { assetId: number; asset: any; tenantId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isMSS } = useTenant();
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);
  const [edrHostId, setEdrHostId] = useState<string>(asset?.edrHostId ?? "");
  const [editingHostId, setEditingHostId] = useState(false);

  const scheduleQuery = useQuery({
    queryKey: ["/api/tenants", tenantId, "edr-schedule"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/edr-schedule`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId && isMSS,
  });

  const scheduleMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; dayOfWeek?: number; hourUtc?: number }) =>
      apiRequest("PUT", `/api/tenants/${tenantId}/edr-schedule`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "edr-schedule"] });
    },
    onError: (e: Error) => toast({ title: "Schedule save failed", description: e.message, variant: "destructive" }),
  });

  const assessmentsQuery = useQuery({
    queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-assessments"],
    queryFn: async () => {
      const res = await fetch(`/api/caasm/assets/${tenantId}/${assetId}/edr-assessments`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!assetId,
  });

  const assessMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/caasm/assets/${tenantId}/${assetId}/edr-assess`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: data.success ? "Assessment Complete" : "Assessment Failed", description: data.message, variant: data.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["/api/caasm/assets", tenantId, assetId, "edr-assessments"] });
      qc.invalidateQueries({ queryKey: ["/api/assets", assetId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: { edrHostId?: string; edrPlatform?: string }) =>
      apiRequest("PATCH", `/api/caasm/assets/${tenantId}/${assetId}/edr-settings`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/assets", assetId] }),
    onError: (e: Error) => toast({ title: "Save Failed", description: e.message, variant: "destructive" }),
  });

  const assessments: any[] = assessmentsQuery.data ?? [];
  const latest = assessments[0];
  const platform = asset?.edrPlatform ?? latest?.edrPlatform;
  const platformLabel = platform ? (EDR_PLATFORM_LABELS[platform] ?? platform) : null;

  const tenantSchedule = scheduleQuery.data?.edrSchedule;
  const hasTenantEdrIntegration = scheduleQuery.data?.hasEdrIntegration ?? false;
  const connectedPlatformKey = scheduleQuery.data?.connectedPlatform ?? null;
  const connectedPlatformLabel = connectedPlatformKey ? (EDR_PLATFORM_LABELS[connectedPlatformKey] ?? connectedPlatformKey) : null;

  function handleScheduleToggle(checked: boolean) {
    setScheduleEnabled(checked);
    scheduleMutation.mutate({ enabled: checked });
  }

  function saveHostId() {
    settingsMutation.mutate({ edrHostId });
    setEditingHostId(false);
  }

  const scoreColor = !latest ? "#6b7280" : latest.score >= 80 ? "#10b981" : latest.score >= 60 ? "#f59e0b" : "#ef4444";

  // True "no integration" = asset not mapped AND tenant has no connected EDR integration at all
  // For non-MSS users the schedule query is disabled so we rely on asset-level fields only
  const assetMapped = !!asset?.edrHostId;
  const hasNoEdrIntegration = !assetMapped && (isMSS ? !hasTenantEdrIntegration : !platform);
  const hasIntegrationButNoHostId = !assetMapped && isMSS && hasTenantEdrIntegration;

  return (
    <div className="space-y-4">

      {/* ── No CIS Benchmark source at all ─────────────────────── */}
      {hasNoEdrIntegration && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Shield className="h-10 w-10 text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-300">No CIS Benchmark Source Configured</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
              Connect a supported EDR platform (Cynet 360, CrowdStrike Falcon, SentinelOne, or Microsoft Defender for Endpoint) in the Integrations settings, then sync assets to populate the Host ID automatically.
            </p>
          </div>
          {isMSS && (
            <p className="text-[11px] text-blue-400">
              You can also set the Host ID manually below.
            </p>
          )}
        </div>
      )}

      {/* ── Integration connected but asset not yet mapped ──────── */}
      {hasIntegrationButNoHostId && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Shield className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-300">
              {connectedPlatformLabel ? `${connectedPlatformLabel} connected` : "CIS Benchmark source connected"} — assign a Host ID to enable assessments
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              The integration is active at the tenant level. Set the Host ID below to link this asset and run CIS Benchmark Assessments.
            </p>
          </div>
        </div>
      )}

      {/* ── Benchmark Configuration ────────────────────────────── */}
      <Card className="border-slate-700/50 bg-slate-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-400" />
            Benchmark Configuration
            {platformLabel && (
              <Badge variant="outline" className="ml-2 text-[10px] border-blue-500/40 text-blue-300">
                {platformLabel}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Host ID */}
          <div className="flex items-center gap-3">
            <Label className="text-[11px] text-muted-foreground min-w-[100px]">Host ID</Label>
            {isMSS && editingHostId ? (
              <div className="flex gap-2 flex-1">
                <Input
                  value={edrHostId}
                  onChange={e => setEdrHostId(e.target.value)}
                  className="h-7 text-xs font-mono"
                  placeholder="e.g. device-uuid-from-edr"
                  data-testid="input-edr-host-id"
                />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={saveHostId} data-testid="button-save-host-id">Save</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingHostId(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-300">{asset?.edrHostId ?? "—"}</span>
                {isMSS && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setEditingHostId(true)} data-testid="button-edit-host-id">Edit</Button>
                )}
              </div>
            )}
          </div>

          {/* Schedule toggle — MSS only, tenant-level */}
          <div className="flex items-center gap-3">
            <Label className="text-[11px] text-muted-foreground min-w-[100px]">Weekly Schedule</Label>
            {isMSS ? (
              <Switch
                checked={tenantSchedule?.enabled ?? scheduleEnabled}
                onCheckedChange={handleScheduleToggle}
                disabled={scheduleMutation.isPending}
                data-testid="switch-edr-schedule"
              />
            ) : (
              <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                {(tenantSchedule?.enabled ?? false) ? "Enabled" : "Disabled"}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {(tenantSchedule?.enabled ?? scheduleEnabled) ? "Weekly CIS assessment enabled (Mondays 02:00 UTC)" : "Scheduled assessment off"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Score + Run Assessment ──────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-slate-700/50 bg-slate-900/50 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-400" />
              CIS Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <div className="space-y-3">
                {/* Circular gauge */}
                <div className="relative flex items-center justify-center py-2">
                  <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90" aria-label={`CIS score ${latest.score}`}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={scoreColor}
                      strokeWidth="10"
                      strokeDasharray={`${(latest.score / 100) * 263.9} 263.9`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 0.6s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold leading-none" style={{ color: scoreColor }}>{latest.score}</span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] justify-center">
                  {["PASS","FAIL","WARN","SKIP"].map(s => {
                    const count = latest.findings?.filter((f: any) => f.status === s).length ?? 0;
                    const cfg = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
                    return count > 0 ? (
                      <Badge key={s} variant="outline" className={`${cfg.bg} ${cfg.color} border`}>
                        {count} {s}
                      </Badge>
                    ) : null;
                  })}
                </div>
                <div className="text-[10px] text-muted-foreground text-center">
                  Last run: {new Date(latest.runAt).toLocaleString()}
                </div>
                {/* Last-5 trend */}
                {assessments.length > 1 && (
                  <div className="pt-2 border-t border-slate-700/40">
                    <p className="text-[10px] text-muted-foreground mb-1">Trend (last {Math.min(assessments.length, 5)} runs)</p>
                    <div className="flex items-end gap-1 h-8">
                      {assessments.slice(0, 5).reverse().map((a: any, i: number) => {
                        const barColor = a.score >= 80 ? "#10b981" : a.score >= 60 ? "#f59e0b" : "#ef4444";
                        return (
                          <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(a.score, 4)}%`, backgroundColor: barColor, minHeight: "3px" }} title={`Score: ${a.score}`} />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground py-4 text-center">No assessments yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4 text-green-400" />
              On-Demand Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Runs 13 CIS Controls v8 benchmark checks on the endpoint via the configured remote command API. Results are stored and the asset CIS score is updated.
            </p>
            {!asset?.edrHostId && (
              <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Set a Host ID above before running an assessment.
              </div>
            )}
            {!isMSS && (
              <div className="flex items-center gap-2 p-2 rounded bg-slate-800 border border-slate-700 text-[11px] text-muted-foreground">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                On-demand assessments can only be triggered by MSS team members.
              </div>
            )}
            <Button
              onClick={() => assessMutation.mutate()}
              disabled={assessMutation.isPending || !asset?.edrHostId || !isMSS}
              className="bg-green-600 hover:bg-green-700 text-white text-xs disabled:opacity-40"
              data-testid="button-run-assessment"
            >
              {assessMutation.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Running…</> : <><Play className="h-3 w-3 mr-1" />Run CIS Benchmark Assessment</>}
            </Button>
            {assessMutation.isPending && (
              <p className="text-[10px] text-muted-foreground animate-pulse">Connecting and executing CIS benchmark script… this may take 30–120 seconds.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Findings Table ─────────────────────────────────────── */}
      {latest?.findings?.length > 0 && (
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              Latest Assessment Findings
              <Badge variant="outline" className="text-[10px] border-slate-600 ml-auto">
                {latest.findings.filter((f: any) => f.status === "PASS").length} / {latest.findings.length} passed
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/40 hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 pl-4">Control</TableHead>
                  <TableHead className="text-[10px] h-7">Severity</TableHead>
                  <TableHead className="text-[10px] h-7">Status</TableHead>
                  <TableHead className="text-[10px] h-7">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.findings.map((f: any) => {
                  const cfg = STATUS_CONFIG[f.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.WARN;
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={f.id} className="border-slate-700/30 hover:bg-slate-800/30" data-testid={`row-edr-finding-${f.id}`}>
                      <TableCell className="py-1.5 pl-4">
                        <div className="text-[11px] font-medium">{f.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{f.id}</div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[10px] capitalize border ${SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.medium}`}>
                          {f.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className={`flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
                          <StatusIcon className="h-3 w-3 shrink-0" />
                          {f.status}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground max-w-[300px] truncate">
                        {f.evidence || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Assessment History ─────────────────────────────────── */}
      {assessments.length > 1 && (
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              Assessment History
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">Last 5 runs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/40 hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 pl-4">Date</TableHead>
                  <TableHead className="text-[10px] h-7">Platform</TableHead>
                  <TableHead className="text-[10px] h-7">Score</TableHead>
                  <TableHead className="text-[10px] h-7">Status</TableHead>
                  <TableHead className="text-[10px] h-7">Triggered By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.slice(0, 5).map((a: any) => (
                  <TableRow key={a.id} className="border-slate-700/30 hover:bg-slate-800/30" data-testid={`row-assessment-${a.id}`}>
                    <TableCell className="py-1.5 pl-4 text-[10px] font-mono">{new Date(a.runAt).toLocaleString()}</TableCell>
                    <TableCell className="py-1.5 text-[10px]">{EDR_PLATFORM_LABELS[a.edrPlatform] ?? a.edrPlatform}</TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-sm font-bold" style={{ color: a.score >= 80 ? "#10b981" : a.score >= 60 ? "#f59e0b" : "#ef4444" }}>{a.score}</span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant="outline" className={a.status === "completed" ? "border-emerald-500/40 text-emerald-400 text-[10px]" : "border-red-500/40 text-red-400 text-[10px]"}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-[10px] text-muted-foreground">{a.triggeredBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
