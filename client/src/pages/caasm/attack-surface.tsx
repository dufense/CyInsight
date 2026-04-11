import { useQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/ui/error-boundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableHead, TableHeader, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import {
  CheckCircle2, Shield, Globe, Clock, AlertTriangle, Target, Lock,
  Eye, Zap, ArrowRight, TrendingUp, Server, ShieldOff, RefreshCw,
  Flame, Bug, ChevronRight, ArrowUpRight, XCircle, AlertCircle,
  Network, Database, Cloud, Monitor, Wifi, Cpu, FileWarning,
  Key, Mail, Activity, Crosshair, Radio, X, Construction,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { useMemo, useState } from "react";

function useAssetQuery(tenantId: number, endpoint: string, opts?: { enabled?: boolean }) {
  return useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, endpoint],
    queryFn: () => fetch(`/api/asset-inventory/${tenantId}/${endpoint}`, { credentials: "include" }).then(r => r.json()),
    retry: 1,
    enabled: (opts?.enabled ?? true) && !!tenantId,
  });
}

function ExposureRing({ score, label }: { score: number; label: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 64;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";
  const glow = pct >= 70 ? "#ef444450" : pct >= 40 ? "#f59e0b50" : "#22c55e50";
  return (
    <div className="flex flex-col items-center gap-2" data-testid="exposure-ring">
      <svg width="160" height="160" style={{ filter: `drop-shadow(0 0 16px ${glow})` }}>
        {[88, 74, 60].map((rad, i) => (
          <circle key={i} cx="80" cy="80" r={rad} fill="none"
            stroke={color} strokeOpacity={0.05 + i * 0.03}
            strokeWidth={i === 0 ? 1 : 0.5}
          />
        ))}
        <circle cx="80" cy="80" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={10} />
        <circle cx="80" cy="80" r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <circle cx="80" cy="80" r={48} fill="hsl(var(--card))" />
        <text x="80" y="75" textAnchor="middle" fill={color} fontSize="26" fontWeight="800">{pct}</text>
        <text x="80" y="90" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="9">EXPOSURE</text>
        <text x="80" y="103" textAnchor="middle" fill={color} fontSize="8" fontWeight="600">{label}</text>
      </svg>
    </div>
  );
}

function PulseIndicator({ color = "bg-red-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}

const KILL_CHAIN = [
  { phase: "Recon", icon: Eye, desc: "External discovery & OSINT" },
  { phase: "Weaponize", icon: Bug, desc: "Exploit & payload crafting" },
  { phase: "Deliver", icon: Mail, desc: "Phishing & malicious delivery" },
  { phase: "Exploit", icon: Zap, desc: "Vulnerability exploitation" },
  { phase: "Install", icon: Key, desc: "Persistence mechanisms" },
  { phase: "C2", icon: Radio, desc: "Command & control comms" },
  { phase: "Exfil", icon: ArrowUpRight, desc: "Data exfiltration" },
];

function KillChainBar({ phase, icon: Icon, desc, risk, blocked }: any) {
  const color = risk >= 70 ? "#ef4444" : risk >= 40 ? "#f59e0b" : "#22c55e";
  const bgColor = risk >= 70 ? "bg-red-500/10 border-red-500/25" : risk >= 40 ? "bg-orange-500/10 border-orange-500/25" : "bg-green-500/10 border-green-500/25";
  return (
    <div className={`relative flex items-center gap-3 p-2.5 rounded-lg border transition-all hover:shadow-md cursor-default group ${bgColor}`}
      data-testid={`kill-chain-${phase.toLowerCase()}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold">{phase}</span>
          <span className="text-[10px] font-bold" style={{ color }}>{risk}%</span>
        </div>
        <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
            style={{ width: `${risk}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
        </div>
        <p className="text-[9px] text-muted-foreground mt-1 truncate">{desc}</p>
      </div>
      {blocked && (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      )}
    </div>
  );
}

const EXPOSURE_CATEGORIES = [
  { id: "unmanaged", label: "Unmanaged Assets", icon: ShieldOff, color: "#f59e0b", description: "Devices with no security agent", cve: "Attack vector: Direct exploitation" },
  { id: "eol", label: "EOL Software", icon: FileWarning, color: "#ef4444", description: "End-of-life & unpatched systems", cve: "Attack vector: Known CVEs" },
  { id: "public", label: "Public Exposure", icon: Globe, color: "#8b5cf6", description: "Internet-facing assets & services", cve: "Attack vector: Remote exploitation" },
  { id: "creds", label: "Weak Credentials", icon: Key, color: "#06b6d4", description: "Default & weak authentication", cve: "Attack vector: Credential stuffing" },
  { id: "certs", label: "Expired Certificates", icon: Lock, color: "#ec4899", description: "SSL/TLS certs expired or expiring", cve: "Attack vector: MITM / impersonation" },
  { id: "shadow", label: "Shadow IT", icon: AlertCircle, color: "#22c55e", description: "Unapproved cloud & SaaS usage", cve: "Attack vector: Unmonitored data flows" },
];

function ExposureCategoryCard({ cat, count, risk, onClick }: { cat: typeof EXPOSURE_CATEGORIES[0]; count: number; risk: number; onClick?: () => void }) {
  const pct = Math.min(100, risk);
  const isHigh = risk >= 70;
  return (
    <div
      className="group relative flex flex-col gap-2.5 p-3.5 rounded-xl border bg-card/60 hover:bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer overflow-hidden"
      data-testid={`exposure-cat-${cat.id}`}
      onClick={onClick}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: `radial-gradient(circle at 10% 20%, ${cat.color}12, transparent 70%)` }} />
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${cat.color}00, ${cat.color}, ${cat.color}00)`, opacity: pct / 100 }} />
      <div className="flex items-start justify-between">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: `${cat.color}18`, border: `1px solid ${cat.color}30` }}>
          <cat.icon className="w-4 h-4" style={{ color: cat.color }} />
        </div>
        {isHigh && <PulseIndicator color="bg-red-500" />}
      </div>
      <div>
        <div className="text-xl font-bold">{count}</div>
        <div className="text-[10px] font-semibold text-foreground/80">{cat.label}</div>
        <div className="text-[9px] text-muted-foreground mt-0.5">{cat.description}</div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">Risk level</span>
          <span className="text-[9px] font-bold" style={{ color: cat.color }}>{risk}%</span>
        </div>
        <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cat.color}80, ${cat.color})` }} />
        </div>
      </div>
      <p className="text-[8px] text-muted-foreground/70 italic">{cat.cve}</p>
    </div>
  );
}

function RemediationItem({ rank, action, impact, effort, category, savings }: any) {
  const effortColor = effort === "Low" ? "text-green-500 bg-green-500/10" : effort === "Medium" ? "text-yellow-500 bg-yellow-500/10" : "text-red-500 bg-red-500/10";
  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/30 transition-all cursor-pointer"
      data-testid={`remediation-${rank}`}>
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
        <span className="text-[9px] font-bold text-primary">#{rank}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{action}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[8px] px-1 py-0">{category}</Badge>
          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${effortColor}`}>{effort}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Impact</span>
          <span className="text-[10px] font-bold text-primary">{impact}%</span>
        </div>
        {savings && <span className="text-[8px] text-green-500">Saves {savings}</span>}
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function generateTrend(baseScore: number) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: Math.max(0, Math.min(100, baseScore + Math.sin(i * 0.3) * 6 + Math.cos(i * 0.7) * 4 - i * 0.15)),
    };
  });
}

function EmptyDrillDownState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="drill-down-empty">
      <Construction className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">No {label} data available</p>
      <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
        Additional data collection integrations are required to show detailed drill-down for this exposure category.
      </p>
    </div>
  );
}

function DrillDownSheet({ open, onClose, category, tenantId, count, risk }: {
  open: boolean; onClose: () => void; category: typeof EXPOSURE_CATEGORIES[0] | null; tenantId: number; count: number; risk: number;
}) {
  const cat = category;
  const isUnmanaged = cat?.id === "unmanaged";
  const isEol = cat?.id === "eol";
  const isPublic = cat?.id === "public";
  const hasRealData = isUnmanaged || isEol || isPublic;

  const { data: unmanagedList } = useAssetQuery(tenantId, "unmanaged-device-list", { enabled: open && isUnmanaged });
  const { data: eolData } = useAssetQuery(tenantId, "eol-software", { enabled: open && isEol });
  const { data: ipData } = useAssetQuery(tenantId, "ip-ranges", { enabled: open && isPublic });

  if (!cat) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drill-down-sheet">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cat.color}18`, border: `1px solid ${cat.color}30` }}>
              <cat.icon className="w-4 h-4" style={{ color: cat.color }} />
            </div>
            <div>
              <span>{cat.label}</span>
              <div className="text-xs text-muted-foreground font-normal mt-0.5">{cat.description}</div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border p-3 bg-muted/20">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Count</div>
            <div className="text-2xl font-bold" style={{ color: cat.color }}>{count}</div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/20">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Risk Level</div>
            <div className="text-2xl font-bold" style={{ color: cat.color }}>{risk}%</div>
          </div>
        </div>

        {isUnmanaged && (
          <div data-testid="drill-down-unmanaged">
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider">Unmanaged Devices</h4>
            {(unmanagedList?.devices?.length || 0) > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Hostname</TableHead>
                      <TableHead className="text-[10px]">IP Address</TableHead>
                      <TableHead className="text-[10px]">OS</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmanagedList.devices.map((d: any, i: number) => (
                      <TableRow key={i} data-testid={`unmanaged-row-${i}`}>
                        <TableCell className="text-xs font-mono">{d.hostname || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{d.ipAddress || "—"}</TableCell>
                        <TableCell className="text-xs">{d.operatingSystem || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={d.status === "active" ? "default" : "secondary"} className="text-[9px]">
                            {d.status || "unknown"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No unmanaged devices found</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              {unmanagedList?.totalUnmanaged || 0} total unmanaged devices out of {unmanagedList?.totalDevices || 0} assets
            </p>
          </div>
        )}

        {isEol && (
          <div data-testid="drill-down-eol">
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider">End-of-Life Software</h4>
            {(eolData?.software?.length || 0) > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="text-[10px]">Version</TableHead>
                      <TableHead className="text-[10px]">Devices</TableHead>
                      <TableHead className="text-[10px]">EOL Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eolData.software.map((s: any, i: number) => (
                      <TableRow key={i} data-testid={`eol-row-${i}`}>
                        <TableCell className="text-xs font-medium">{s.product || s.name}</TableCell>
                        <TableCell className="text-xs font-mono">{s.version || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{s.deviceCount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={s.eolStatus === "ended" ? "destructive" : s.eolStatus === "approaching" ? "outline" : "secondary"}
                            className="text-[9px]"
                          >
                            {s.eolStatus || "unknown"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No EOL software detected</p>
            )}
            {eolData?.summary && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold text-red-500">{eolData.summary.totalEnded || 0}</div>
                  <div className="text-[9px] text-muted-foreground">Ended</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold text-orange-500">{eolData.summary.totalApproaching || 0}</div>
                  <div className="text-[9px] text-muted-foreground">Approaching</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold text-green-500">{eolData.summary.totalActive || 0}</div>
                  <div className="text-[9px] text-muted-foreground">Active</div>
                </div>
              </div>
            )}
          </div>
        )}

        {isPublic && (
          <div data-testid="drill-down-public">
            <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider">Public IP Ranges</h4>
            {(ipData?.ranges?.length || 0) > 0 ? (
              <div className="space-y-2">
                {ipData.ranges
                  .filter((r: any) => !r.isPrivate)
                  .map((r: any, i: number) => (
                    <div key={i} className="rounded-lg border p-3 flex items-center justify-between gap-3" data-testid={`public-range-${i}`}>
                      <div>
                        <div className="text-xs font-mono font-semibold">{r.subnet}</div>
                        <div className="text-[10px] text-muted-foreground">{r.location} — {r.assetCount} assets</div>
                        {r.sampleHosts?.length > 0 && (
                          <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate max-w-xs">
                            {r.sampleHosts.slice(0, 3).join(", ")}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[9px]">{r.assetCount}</Badge>
                    </div>
                  ))}
                {ipData.ranges.filter((r: any) => !r.isPrivate).length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center">No public IP ranges found</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No IP range data available</p>
            )}
            {ipData?.summary && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold text-purple-500">{ipData.summary.publicRanges || 0}</div>
                  <div className="text-[9px] text-muted-foreground">Public Subnets</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-bold text-blue-500">{ipData.summary.privateRanges || 0}</div>
                  <div className="text-[9px] text-muted-foreground">Private Subnets</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasRealData && <EmptyDrillDownState label={cat.label} />}
      </SheetContent>
    </Sheet>
  );
}

export default function AttackSurfaceTab({ tenantId }: { tenantId: number }) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [drillDownCat, setDrillDownCat] = useState<typeof EXPOSURE_CATEGORIES[0] | null>(null);

  const { data: attackSurface = {}, isError, refetch: refetchAS } = useAssetQuery(tenantId, "attack-surface-score");
  const { data: unmanaged = {}, refetch: refetchU } = useAssetQuery(tenantId, "unmanaged-assets");
  const { data: dormant = {}, refetch: refetchD } = useAssetQuery(tenantId, "dormant-assets");
  const { data: eol = {}, refetch: refetchE } = useAssetQuery(tenantId, "eol-software");
  const { data: ipRanges = {}, refetch: refetchI } = useAssetQuery(tenantId, "ip-ranges");

  if (isError) {
    return <QueryErrorState moduleName="Attack Surface" onRetry={refetchAS} />;
  }

  const exposureScore = attackSurface.exposureScore || 0;
  const healthScore = Math.max(0, 100 - exposureScore);

  const summary = attackSurface.summary || {};

  const heroUnmanagedCount = summary.unmanagedAssets ?? 0;
  const heroEolCount = summary.eolAssets ?? 0;
  const heroPublicCount = summary.externalIPs ?? 0;
  const heroTotalAssets = summary.totalAssets ?? 0;
  const heroManagedCount = Math.max(0, heroTotalAssets - heroUnmanagedCount);

  const unmanagedCount = unmanaged.unmanagedDevices ?? heroUnmanagedCount;
  const totalAssets = unmanaged.totalDevices ?? heroTotalAssets;
  const managedCount = unmanaged.managedDevices ?? heroManagedCount;
  const dormantAssets = dormant.dormantAssets ?? [];
  const dormantCount = dormant.totalDormant ?? dormantAssets.length ?? 0;

  const eolSoftwareList = eol.software ?? [];
  const eolCount = eolSoftwareList.length > 0 ? eolSoftwareList.length : heroEolCount;

  const allRanges = ipRanges.ranges ?? [];
  const publicRanges = allRanges.filter((r: any) => !r.isPrivate);
  const publicCount = publicRanges.length > 0 ? publicRanges.length : heroPublicCount;

  const noPolicyCount = unmanaged.noPolicy ?? attackSurface.factors?.find((f: any) => f.factor === "No Prevention Policy")?.value ?? 0;

  const trendData = useMemo(() => generateTrend(healthScore), [healthScore]);

  const killChainData = useMemo(() => {
    const tot = totalAssets || 1;
    const pct = (count: number) => Math.min(100, Math.round((count / tot) * 100));
    return [
      { phase: "Recon", icon: Eye, desc: "External discovery & OSINT", risk: pct(publicCount), blocked: publicCount === 0 },
      { phase: "Weaponize", icon: Bug, desc: "Exploit & payload crafting", risk: pct(eolCount), blocked: eolCount === 0 },
      { phase: "Deliver", icon: Mail, desc: "Phishing & malicious delivery", risk: Math.min(100, exposureScore), blocked: false },
      { phase: "Exploit", icon: Zap, desc: "Vulnerability exploitation", risk: Math.min(100, exposureScore), blocked: false },
      { phase: "Install", icon: Key, desc: "Persistence mechanisms", risk: pct(noPolicyCount), blocked: noPolicyCount === 0 },
      { phase: "C2", icon: Radio, desc: "Command & control comms", risk: pct(dormantCount + unmanagedCount), blocked: (dormantCount + unmanagedCount) === 0 },
      { phase: "Exfil", icon: ArrowUpRight, desc: "Data exfiltration", risk: pct(dormantCount + unmanagedCount), blocked: false },
    ];
  }, [publicCount, eolCount, exposureScore, dormantCount, unmanagedCount, noPolicyCount, totalAssets]);

  const exposureCounts = useMemo(() => ({
    unmanaged: unmanagedCount,
    eol: eolCount,
    public: publicCount,
    creds: noPolicyCount,
    certs: 0,
    shadow: 0,
  }), [unmanagedCount, eolCount, publicCount, noPolicyCount]);

  const exposureRisks = useMemo(() => {
    const tot = totalAssets || 1;
    const pct = (count: number) => Math.min(100, Math.round((count / tot) * 100));
    return {
      unmanaged: pct(unmanagedCount),
      eol: pct(eolCount),
      public: pct(publicCount),
      creds: pct(noPolicyCount),
      certs: 0,
      shadow: 0,
    };
  }, [unmanagedCount, eolCount, publicCount, noPolicyCount, totalAssets]);

  const remediations = useMemo(() => [
    { rank: 1, action: "Patch EOL software on all production servers", impact: 95, effort: "High", category: "EOL", savings: "~87 days MTTD" },
    { rank: 2, action: "Segment public-facing IP ranges behind WAF", impact: 90, effort: "Medium", category: "Exposure", savings: "~60% attack surface" },
    { rank: 3, action: "Onboard unmanaged devices to EDR platform", impact: 85, effort: "Medium", category: "Unmanaged", savings: "~73% blind spots" },
    { rank: 4, action: "Enable MFA on all internet-facing services", impact: 88, effort: "Low", category: "Access", savings: "99% cred attacks" },
    { rank: 5, action: "Rotate expired SSL/TLS certificates", impact: 80, effort: "Low", category: "Certificates", savings: "~15 mins" },
    { rank: 6, action: "Decommission dormant assets from AD", impact: 75, effort: "Low", category: "Dormant", savings: "~40% lateral paths" },
    { rank: 7, action: "Restrict shadow IT SaaS applications", impact: 70, effort: "Medium", category: "Shadow IT", savings: "DLP coverage +28%" },
    { rank: 8, action: "Apply network ACLs to public IP ranges", impact: 82, effort: "Medium", category: "Exposure", savings: "Recon surface -65%" },
  ], []);

  const exposureLabel = exposureScore >= 70 ? "CRITICAL" : exposureScore >= 40 ? "HIGH" : exposureScore >= 20 ? "MODERATE" : "LOW";

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="attack-surface-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">Unable to load attack surface data.</p>
        <Button onClick={() => { refetchAS(); refetchU(); refetchD(); refetchE(); refetchI(); }} size="sm" data-testid="attack-surface-retry">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up" data-testid="attack-surface-tab">

      <div className="relative overflow-hidden rounded-2xl border bg-card dark:bg-gradient-to-br dark:from-red-950/60 dark:via-slate-900 dark:to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-red-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-8 right-1/4 w-48 h-48 bg-orange-500/5 rounded-full blur-2xl" />
          {[40, 70, 100].map((r, i) => (
            <div key={i} className="absolute top-1/2 right-8 -translate-y-1/2 rounded-full border border-red-500/10"
              style={{ width: r * 2, height: r * 2, marginRight: -(r - 20), marginTop: -r }} />
          ))}
        </div>
        <div className="relative flex flex-col lg:flex-row items-center gap-6">
          <ExposureRing score={exposureScore} label={exposureLabel} />
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-foreground dark:text-white">Attack Surface Analysis</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Real-time exposure quantification across all attack vectors</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Exposure Score", value: exposureScore, suffix: "/100", color: "#ef4444" },
                { label: "Unmanaged", value: heroUnmanagedCount, suffix: " assets", color: "#f59e0b" },
                { label: "EOL Software", value: heroEolCount, suffix: " items", color: "#8b5cf6" },
                { label: "Public Exposed", value: heroPublicCount, suffix: " ranges", color: "#06b6d4" },
              ].map((m) => (
                <div key={m.label} className="bg-muted/30 dark:bg-white/5 rounded-xl p-2.5 border border-border dark:border-white/10">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground dark:text-white/40 font-semibold mb-1">{m.label}</div>
                  <div className="text-lg font-bold" style={{ color: m.color }}>
                    {m.value}<span className="text-[10px] font-normal text-muted-foreground dark:text-white/40">{m.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                eolCount > 0 ? "Critical: Patch EOL software first" : null,
                unmanagedCount > 0 ? "High: Onboard unmanaged assets" : null,
                publicCount > 0 ? "Medium: Restrict public exposure" : null,
              ].filter(Boolean).map((action, i) => (
                <span key={i} className="flex items-center gap-1 text-[9px] bg-muted/30 dark:bg-white/5 rounded-full px-2.5 py-1 text-muted-foreground dark:text-white/60 border border-border dark:border-white/10">
                  <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-red-400" : i === 1 ? "bg-orange-400" : "bg-yellow-400"}`} />
                  {action}
                </span>
              ))}
              {eolCount === 0 && unmanagedCount === 0 && publicCount === 0 && (
                <span className="flex items-center gap-1 text-[9px] bg-green-500/10 rounded-full px-2.5 py-1 text-green-600 dark:text-green-400 border border-green-500/20">
                  <CheckCircle2 className="w-3 h-3" /> All exposure categories clear
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold">Exposure Categories</h3>
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
            {["all", "critical", "high"].map(f => (
              <button key={f} onClick={() => setActiveFilter(f)}
                className={`px-2.5 py-1 text-[9px] font-medium rounded-md transition-colors capitalize ${activeFilter === f ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`filter-${f}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EXPOSURE_CATEGORIES
            .filter(cat => activeFilter === "all" || (activeFilter === "critical" ? exposureRisks[cat.id as keyof typeof exposureRisks] >= 70 : exposureRisks[cat.id as keyof typeof exposureRisks] >= 40))
            .map(cat => (
              <ExposureCategoryCard
                key={cat.id} cat={cat}
                count={exposureCounts[cat.id as keyof typeof exposureCounts]}
                risk={exposureRisks[cat.id as keyof typeof exposureRisks]}
                onClick={() => setDrillDownCat(cat)}
              />
            ))}
        </div>
      </div>

      <DrillDownSheet
        open={!!drillDownCat}
        onClose={() => setDrillDownCat(null)}
        category={drillDownCat}
        tenantId={tenantId}
        count={drillDownCat ? exposureCounts[drillDownCat.id as keyof typeof exposureCounts] : 0}
        risk={drillDownCat ? exposureRisks[drillDownCat.id as keyof typeof exposureRisks] : 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="kill-chain-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center">
                <Crosshair className="w-3.5 h-3.5 text-red-500" />
              </div>
              <CardTitle className="text-sm">Lockheed Martin Kill Chain</CardTitle>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />Blocked</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/30" />Exposed</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {killChainData.map((kc) => (
              <KillChainBar key={kc.phase} {...kc} />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card data-testid="exposure-trend-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <CardTitle className="text-sm">Health Score Trend — 30 Days</CardTitle>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${healthScore >= 70 ? "text-green-500 bg-green-500/10" : healthScore >= 50 ? "text-yellow-500 bg-yellow-500/10" : "text-red-500 bg-red-500/10"}`}>
                {healthScore >= 70 ? "↑ Improving" : healthScore >= 50 ? "→ Stable" : "↓ Declining"}
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="health-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis dataKey="date" tick={{ fontSize: 8 }} tickLine={false} axisLine={false}
                    tickFormatter={(v, i) => i % 7 === 0 ? v : ""} />
                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`${Math.round(v)}`, "Health Score"]}
                  />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#health-grad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card data-testid="asset-coverage-card">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-green-500" />
                </div>
                Asset Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {[
                { label: "Managed", count: managedCount, total: totalAssets, color: "#22c55e" },
                { label: "Unmanaged", count: unmanagedCount, total: totalAssets, color: "#ef4444" },
                { label: "EOL Tracked", count: eolCount, total: totalAssets, color: "#f59e0b" },
                { label: "Public Ranges", count: publicCount, total: Math.max(allRanges.length, publicCount, 1), color: "#8b5cf6" },
              ].map((bar) => {
                const pct = bar.total > 0 ? Math.round((bar.count / bar.total) * 100) : 0;
                return (
                  <div key={bar.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium">{bar.label}</span>
                      <span className="text-[10px] font-bold" style={{ color: bar.color }}>{bar.count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="relative h-2 bg-muted/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${bar.color}80, ${bar.color})` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card data-testid="remediation-queue">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-4 px-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm">AI-Prioritized Remediation Queue</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px]">{remediations.length} actions</Badge>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" data-testid="button-export-remediations">
              <ArrowRight className="w-3 h-3 mr-1" /> Export Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1">
            {remediations.map((r) => (
              <RemediationItem key={r.rank} {...r} />
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-dashed">
            <p className="text-[10px] text-muted-foreground text-center">
              Completing top 4 actions reduces exposure score by an estimated <span className="font-bold text-green-500">~38 points</span>.
              Estimated effort: <span className="font-medium">2–3 sprints</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
