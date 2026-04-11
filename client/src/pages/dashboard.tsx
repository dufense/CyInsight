import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { useDashboardLayout, getWidgetCatalog } from "@/lib/dashboard-config";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  AlertTriangle, Shield, Ticket, TrendingUp, TrendingDown, Activity, ArrowUpRight,
  Mail, Monitor, Bug, Crosshair, Target, Skull, AppWindow, Globe, Cloud, Lock,
  ShieldAlert, ShieldCheck, ShieldOff, Wifi, Database, Eye, Zap, Clock, Timer,
  Server, AlertCircle, FileWarning, Ban, CheckCircle2, XCircle, Gauge, Radio,
  Network, Fingerprint, KeyRound, UserX, Users, Upload, Download, Search, Radar, HardDrive, MapPin,
  Brain, Maximize2, Minimize2, Image, FileText, X, ChevronLeft, ChevronRight, ChevronDown, Bot, Cpu, Layers, Package,
  BarChart3, LineChart as LineChartIcon, TrendingUp as AreaChartIcon, PieChart as PieChartIcon,
  RefreshCw, Settings2, RotateCcw, ChevronUp, EyeOff,
} from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { ThreatMapMini } from "@/components/threat-map/ThreatMapMini";
import { ThreatRadar as ThreatRadarFull } from "@/components/threat-map/ThreatRadar";
import { ExecutiveBriefing } from "@/components/executive-briefing";
import { AttackVectorRadar } from "@/components/attack-vector-radar";
import { DashboardCommandStrip } from "@/components/dashboard-command-strip";
import { ThreatGlobe } from "@/components/dashboard/ThreatGlobe";
import { IncidentHeatmap } from "@/components/dashboard/IncidentHeatmap";
import { LiveEventsTicker } from "@/components/dashboard/LiveEventsTicker";
import { useDashboardFilter } from "@/components/dashboard/DashboardFilterContext";
import { RiskBar, CountryFlag, AppIcon } from "@/lib/visual-helpers";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap,
  LineChart as RechartsLineChart, Line, Brush, ReferenceArea,
  RadialBarChart, RadialBar,
} from "recharts";

const C = {
  blue: "hsl(217, 91%, 55%)", green: "hsl(142, 76%, 45%)", purple: "hsl(269, 80%, 58%)",
  orange: "hsl(32, 95%, 52%)", red: "hsl(340, 82%, 52%)", teal: "hsl(180, 70%, 45%)",
  yellow: "hsl(45, 90%, 50%)", pink: "hsl(300, 60%, 50%)", lime: "hsl(120, 60%, 40%)",
  sky: "hsl(200, 80%, 60%)", indigo: "hsl(245, 72%, 55%)", amber: "hsl(38, 92%, 50%)",
  rose: "hsl(350, 89%, 60%)", emerald: "hsl(160, 84%, 39%)", cyan: "hsl(190, 95%, 39%)",
};
const PALETTE = [C.blue, C.green, C.purple, C.orange, C.red, C.teal, C.yellow, C.pink, C.lime, C.sky, C.indigo, C.amber];
const SEV: Record<string, string> = { critical: C.red, high: C.orange, medium: C.blue, low: C.green, info: "hsl(210, 10%, 50%)" };

const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" };

function RichTooltipContent({ active, payload, label, metricContext }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div className="bg-card border rounded-md shadow-lg p-2.5 min-w-[160px]" style={{ fontSize: "11px" }}>
      {label && <p className="font-semibold text-xs mb-1.5 border-b pb-1 text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-muted-foreground">{String(p.name || p.dataKey || "")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold font-mono">{typeof p.value === "number" ? p.value.toLocaleString() : typeof p.value === "object" ? JSON.stringify(p.value) : String(p.value ?? "")}</span>
            {total > 0 && payload.length > 1 && typeof p.value === "number" && (
              <span className="text-[9px] text-muted-foreground">({((p.value / total) * 100).toFixed(1)}%)</span>
            )}
          </div>
        </div>
      ))}
      {payload.length > 1 && total > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t">
          <span className="text-muted-foreground font-medium">Total</span>
          <span className="font-bold font-mono">{total.toLocaleString()}</span>
        </div>
      )}
      {metricContext && (
        <div className="pt-1.5 mt-1.5 border-t space-y-0.5">
          {Object.entries(metricContext).map(([k, v]: [string, any]) => (
            <div key={k} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const THREAT_ICONS: Record<string, any> = {
  Ransomware: Skull, Phishing: Mail, Malware: Bug, "Social Engineering": Fingerprint,
  "C2": Radio, "Credential Theft": KeyRound, Trojan: ShieldOff, Rootkit: ShieldAlert,
  "Web Attack": Globe, "Cloud Misuse": Cloud, "Data Loss": Upload, "Identity Attack": UserX,
  Spam: Ban, "Network Intrusion": Network, Vulnerability: FileWarning, Fileless: Eye,
  Cryptojacking: Zap, Spyware: Search, PUP: AlertCircle, "Cloud Misconfiguration": Cloud,
  "Lateral Movement": ArrowUpRight, Reconnaissance: Radar, "Web Security": Globe,
};

function getThreatIcon(vector: string) {
  return THREAT_ICONS[vector] || ShieldAlert;
}

function useCountUp(end: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (end === prev.current) return;
    const start = prev.current;
    prev.current = end;
    const diff = end - start;
    if (diff === 0) { setVal(end); return; }
    const startTime = performance.now();
    let raf: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(start + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);
  return val;
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <span className={className}>{display.toLocaleString()}</span>;
}

function RiskGauge({ score, label, size = 120 }: { score: number; label: string; size?: number }) {
  const color = score >= 80 ? C.red : score >= 60 ? C.orange : score >= 40 ? C.yellow : C.green;
  const r = size / 2 - 10;
  const circumference = Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 15} viewBox={`0 0 ${size} ${size / 2 + 15}`}>
        <path d={`M 10 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2 + 5}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round" />
        <path d={`M 10 ${size / 2 + 5} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2 + 5}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="animate-gauge-fill" />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={color}
          fontSize="22" fontWeight="700">{score}</text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, color, trend, onClick, "data-testid": testId }: {
  title: string; value: string | number; sub?: string; icon: any; color?: string; trend?: "up" | "down";
  onClick?: () => void; "data-testid"?: string;
}) {
  const c = color || C.blue;
  return (
    <Card
      className={`relative overflow-visible border-0 shadow-sm transition-shadow group animate-fade-in-up ${onClick ? "cursor-pointer hover-elevate" : ""}`}
      onClick={onClick}
      data-testid={testId}
    >
      <div className="absolute inset-0 opacity-[0.04] rounded-md" style={{ background: `linear-gradient(135deg, ${c} 0%, transparent 60%)` }} />
      <div className="absolute top-0 left-0 w-1 h-full rounded-r-full" style={{ backgroundColor: c }} />
      <CardContent className="p-4 relative">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight">
              {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
            </p>
            {sub && (
              <div className="flex items-center gap-1">
                {trend === "up" && <TrendingUp className="w-3 h-3 text-chart-2" />}
                {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className="text-[10px] text-muted-foreground">{sub}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl shadow-sm group-hover:scale-105 transition-transform" style={{ backgroundColor: `${c}15` }}>
            <Icon className="w-5 h-5" style={{ color: c }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Top10({ title, data, icon: Icon, showBar = true, onItemClick }: {
  title: string; data: { name: string; count: number }[]; icon: any; showBar?: boolean;
  onItemClick?: (item: { name: string; count: number }) => void;
}) {
  const max = data.length > 0 ? data[0].count : 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
          <Icon className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No data</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((item, idx) => {
              const TIcon = getThreatIcon(item.name);
              return (
                <div key={idx}
                  className={`flex items-center gap-2 ${onItemClick ? "cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 transition-colors" : ""}`}
                  onClick={onItemClick ? () => onItemClick(item) : undefined}
                  data-testid={`top10-row-${idx}`}>
                  <span className="text-[10px] text-muted-foreground w-4 text-right font-mono">{idx + 1}</span>
                  <TIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] truncate">{item.name}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0 h-5">{item.count}</Badge>
                    </div>
                    {showBar && (
                      <div className="w-full bg-muted/30 rounded-full h-1 mt-0.5">
                        <div className="h-1 rounded-full transition-all duration-500"
                          style={{ width: `${(item.count / max) * 100}%`, backgroundColor: PALETTE[idx % PALETTE.length] }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniPie({ data, colors }: { data: { name: string; value: number }[]; colors?: Record<string, string> }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value"
          animationBegin={0} animationDuration={800}
          onMouseEnter={(_, idx) => setActiveIndex(idx)}
          onMouseLeave={() => setActiveIndex(null)}>
          {data.map((e, i) => (
            <Cell key={e.name} fill={colors?.[e.name] || PALETTE[i % PALETTE.length]}
              opacity={activeIndex === null || activeIndex === i ? 1 : 0.4}
              stroke={activeIndex === i ? "hsl(var(--foreground))" : "none"}
              strokeWidth={activeIndex === i ? 2 : 0} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: string) => [`${value}`, name]} />
        <Legend wrapperStyle={{ fontSize: "10px" }} formatter={(v) => <span className="capitalize text-[10px]">{typeof v === "object" ? String(v) : v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DomainInsightsPanel({ insights, domainKey, onDrilldown }: { insights: Record<string, any>; domainKey: string | string[]; onDrilldown?: (filterType: string, filterValue: string, label: string, domain?: string) => void }) {
  const keys = Array.isArray(domainKey) ? domainKey : [domainKey];
  const domainScope = keys[0];
  const merged = { topThreats: [] as any[], topAttackers: [] as any[], topTargets: [] as any[] };
  keys.forEach(k => {
    const di = insights[k];
    if (!di) return;
    (di.topThreats || []).forEach((t: any) => {
      const existing = merged.topThreats.find((x: any) => x.name === t.name);
      if (existing) existing.count += t.count;
      else merged.topThreats.push({ ...t });
    });
    (di.topAttackers || []).forEach((t: any) => {
      const existing = merged.topAttackers.find((x: any) => x.name === t.name);
      if (existing) existing.count += t.count;
      else merged.topAttackers.push({ ...t });
    });
    (di.topTargets || []).forEach((t: any) => {
      const existing = merged.topTargets.find((x: any) => x.name === t.name);
      if (existing) existing.count += t.count;
      else merged.topTargets.push({ ...t });
    });
  });
  merged.topThreats.sort((a, b) => b.count - a.count);
  merged.topAttackers.sort((a, b) => b.count - a.count);
  merged.topTargets.sort((a, b) => b.count - a.count);
  const topThreats = merged.topThreats.slice(0, 10);
  const topAttackers = merged.topAttackers.slice(0, 10);
  const topTargets = merged.topTargets.slice(0, 10);
  const hasData = topThreats.length > 0 || topAttackers.length > 0 || topTargets.length > 0;
  if (!hasData) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid={`domain-insights-${keys[0]}`}>
      <Top10 title="Top Threats" data={topThreats} icon={Skull}
        onItemClick={onDrilldown ? (item) => onDrilldown("threat", item.name, `Threat: ${item.name}`, domainScope) : undefined} />
      <Top10 title="Top Attackers" data={topAttackers} icon={Crosshair}
        onItemClick={onDrilldown ? (item) => onDrilldown("attacker", item.name, `Attacker: ${item.name}`, domainScope) : undefined} />
      <Top10 title="Top Targets" data={topTargets} icon={Target}
        onItemClick={onDrilldown ? (item) => onDrilldown("target", item.name, `Target: ${item.name}`, domainScope) : undefined} />
    </div>
  );
}

function WidgetWrapper({ 
  widgetId, title, children, layout, className 
}: { 
  widgetId: string; title: string; children: ReactNode; 
  layout: ReturnType<typeof useDashboardLayout>; className?: string;
}) {
  if (!layout.isVisible(widgetId)) return null;
  const collapsed = layout.isCollapsed(widgetId);
  const size = layout.getSize(widgetId);
  return (
    <div className={`${className || ""} ${size === "expanded" ? "col-span-full" : ""}`} data-testid={`widget-${widgetId}`}>
      <div className="relative group/widget">
        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 invisible group-hover/widget:visible" data-testid={`widget-controls-${widgetId}`}>
          <button
            onClick={() => layout.toggleCollapsed(widgetId)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm"
            title={collapsed ? "Expand" : "Collapse"}
            data-testid={`widget-collapse-${widgetId}`}
          >
            {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
          <button
            onClick={() => layout.toggleSize(widgetId)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm"
            title={size === "compact" ? "Expand widget" : "Compact widget"}
            data-testid={`widget-resize-${widgetId}`}
          >
            {size === "compact" ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => layout.toggleVisibility(widgetId)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm"
            title="Hide widget"
            data-testid={`widget-hide-${widgetId}`}
          >
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
        {collapsed ? (
          <Card className="cursor-pointer" onClick={() => layout.toggleCollapsed(widgetId)}>
            <CardContent className="p-3 flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
            </CardContent>
          </Card>
        ) : children}
      </div>
    </div>
  );
}

function WidgetPickerDialog({ dashboardMode, layout }: { dashboardMode: string; layout: ReturnType<typeof useDashboardLayout> }) {
  const widgets = getWidgetCatalog(dashboardMode);
  const categories = [...new Set(widgets.map(w => w.category))];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-[10px]" data-testid="button-customize-dashboard">
          <Settings2 className="w-3.5 h-3.5" />
          Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-widget-picker">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Customize Dashboard
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
              <div className="space-y-1.5">
                {widgets.filter(w => w.category === cat).map(w => (
                  <div key={w.id} className="flex items-center justify-between gap-3 p-2 rounded-md border bg-card" data-testid={`widget-toggle-${w.id}`}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{w.title}</p>
                      <p className="text-[9px] text-muted-foreground">Default: {w.defaultSize}</p>
                    </div>
                    <Switch
                      checked={layout.isVisible(w.id)}
                      onCheckedChange={() => layout.toggleVisibility(w.id)}
                      data-testid={`switch-widget-${w.id}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <p className="text-[10px] text-muted-foreground">
            {widgets.filter(w => layout.isVisible(w.id)).length} / {widgets.length} widgets visible
          </p>
          <Button variant="ghost" size="sm" className="gap-1.5 text-[10px]" onClick={() => layout.resetToDefault()} data-testid="button-reset-layout">
            <RotateCcw className="w-3 h-3" />
            Reset to Default
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}
      </div>
      <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
    </div>
  );
}

const CHART_TYPE_OPTIONS = [
  { value: "bar", icon: BarChart3, label: "Bar" },
  { value: "line", icon: LineChartIcon, label: "Line" },
  { value: "area", icon: AreaChartIcon, label: "Area" },
  { value: "pie", icon: PieChartIcon, label: "Pie" },
];

function ChartTypeSelector({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {CHART_TYPE_OPTIONS.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`p-1 rounded ${active === t.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          data-testid={`chart-type-${t.value}`}>
          <t.icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// ExpandableCard is imported from @/components/ui/expandable-card

interface SeriesConfig {
  dataKey: string;
  name?: string;
  color: string;
  gradientId?: string;
  opacity?: number;
}

function FlexChart({
  data,
  chartType,
  dataKey = "value",
  nameKey = "name",
  height = 250,
  colors,
  layout = "horizontal",
  series,
  xAxisAngle,
  xAxisHeight,
  yAxisWidth,
  onItemClick,
  showBrush = false,
  activeFilter,
}: {
  data: any[];
  chartType: string;
  dataKey?: string;
  nameKey?: string;
  height?: number;
  colors?: Record<string, string>;
  layout?: "horizontal" | "vertical";
  series?: SeriesConfig[];
  xAxisAngle?: number;
  xAxisHeight?: number;
  yAxisWidth?: number;
  onItemClick?: (item: any) => void;
  showBrush?: boolean;
  activeFilter?: string | null;
}) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = (key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const legendClick = (e: any) => {
    if (e?.dataKey) toggleSeries(e.dataKey);
    else if (e?.value) toggleSeries(e.value);
  };

  const stripObjects = (items: any[]) => items.map(d => {
    const safe: Record<string, any> = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") safe[k] = v;
    }
    return safe;
  });

  const resolvedData = data.map(d => {
    const val = d[dataKey] !== undefined ? d[dataKey] : d.count !== undefined ? d.count : d.value;
    const safe: Record<string, any> = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") safe[k] = v;
    }
    safe[dataKey] = val;
    return safe;
  });

  const safeData = stripObjects(data);

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={resolvedData} cx="50%" cy="50%" innerRadius={Math.max(height / 5, 30)} outerRadius={Math.max(height / 3, 55)}
            paddingAngle={3} dataKey={dataKey} nameKey={nameKey}
            animationBegin={0} animationDuration={800}
            onClick={onItemClick ? (_, idx) => onItemClick(resolvedData[idx]) : undefined}
            style={onItemClick ? { cursor: "pointer" } : undefined}>
            {resolvedData.map((e, i) => {
              const isActivePie = activeFilter ? (e[nameKey] === activeFilter || e.name === activeFilter) : true;
              return (
                <Cell key={e[nameKey] || i}
                  fill={colors?.[e[nameKey]] || PALETTE[i % PALETTE.length]}
                  opacity={activeFilter && !isActivePie ? 0.3 : 1}
                  className={onItemClick ? "cursor-pointer" : ""}
                />
              );
            })}
          </Pie>
          <Tooltip content={<RichTooltipContent />} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    if (series && series.length > 0) {
      const lineBrushHeight = showBrush && data.length > 6 ? height + 40 : height;
      return (
        <ResponsiveContainer width="100%" height={lineBrushHeight}>
          <RechartsLineChart data={safeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
              angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<RichTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
              formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
            {series.map(s => !hiddenSeries.has(s.dataKey) && (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name || s.dataKey}
                stroke={s.color} strokeWidth={2} dot={false} animationDuration={800} />
            ))}
            {showBrush && safeData.length > 6 && (
              <Brush dataKey={nameKey} height={20} stroke="hsl(var(--primary))" fill="hsl(var(--muted))" travellerWidth={8} />
            )}
          </RechartsLineChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={resolvedData} layout={layout === "vertical" ? "vertical" : "horizontal"}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey={nameKey} type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={yAxisWidth || 90} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            </>
          )}
          <Tooltip content={<RichTooltipContent />} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
          <Line type="monotone" dataKey={dataKey} stroke={PALETTE[0]} strokeWidth={2} dot={false} animationDuration={800} />
        </RechartsLineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    if (series && series.length > 0) {
      const brushHeight = showBrush && data.length > 6 ? height + 40 : height;
      return (
        <ResponsiveContainer width="100%" height={brushHeight}>
          <AreaChart data={safeData}>
            <defs>
              {series.map(s => (
                <linearGradient key={s.dataKey} id={s.gradientId || `g_${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
              angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<RichTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
              formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
            {series.map(s => !hiddenSeries.has(s.dataKey) && (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name || s.dataKey}
                stroke={s.color} fill={`url(#${s.gradientId || `g_${s.dataKey}`})`} strokeWidth={2}
                animationDuration={800} opacity={s.opacity ?? 1} />
            ))}
            {showBrush && safeData.length > 6 && (
              <Brush dataKey={nameKey} height={20} stroke="hsl(var(--primary))" fill="hsl(var(--muted))" travellerWidth={8} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    {
      const singleBrushHeight = showBrush && resolvedData.length > 6 ? height + 40 : height;
      return (
        <ResponsiveContainer width="100%" height={singleBrushHeight}>
          <AreaChart data={resolvedData}>
            <defs>
              <linearGradient id={`gFlex_${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PALETTE[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
              angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<RichTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
              formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
            <Area type="monotone" dataKey={dataKey} stroke={PALETTE[0]} fill={`url(#gFlex_${dataKey})`} strokeWidth={2}
              animationDuration={800} />
            {showBrush && resolvedData.length > 6 && (
              <Brush dataKey={nameKey} height={20} stroke="hsl(var(--primary))" fill="hsl(var(--muted))" travellerWidth={8} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
  }

  if (series && series.length > 0) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={safeData} layout={layout === "vertical" ? "vertical" : "horizontal"}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey={nameKey} type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={yAxisWidth || 90} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            </>
          )}
          <Tooltip content={<RichTooltipContent />} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
          {series.map(s => !hiddenSeries.has(s.dataKey) && (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name || s.dataKey}
              fill={s.color} radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              barSize={14} animationDuration={800}
              onClick={onItemClick ? (data: any) => onItemClick(data) : undefined}
              style={onItemClick ? { cursor: "pointer" } : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={resolvedData} layout={layout === "vertical" ? "vertical" : "horizontal"}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        {layout === "vertical" ? (
          <>
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis dataKey={nameKey} type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={yAxisWidth || 90} />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
              angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          </>
        )}
        <Tooltip content={<RichTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
          formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{typeof v === "object" ? String(v) : v}</span>} />
        <Bar dataKey={dataKey} name="Events" radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          barSize={layout === "vertical" ? 14 : 28} animationDuration={800}
          onClick={onItemClick ? (data: any) => onItemClick(data) : undefined}
          style={onItemClick ? { cursor: "pointer" } : undefined}>
          {resolvedData.map((e, i) => {
            const isActive = activeFilter ? e[nameKey] === activeFilter : true;
            return (
              <Cell key={e[nameKey] || i}
                fill={colors?.[e[nameKey]] || PALETTE[i % PALETTE.length]}
                opacity={activeFilter && !isActive ? 0.3 : 1}
                className={onItemClick ? "cursor-pointer" : ""}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ThreatFlowNode {
  name: string;
  layer: string;
  count?: number;
}

interface ThreatFlowLink {
  source: number;
  target: number;
  value: number;
}

interface ThreatFlowData {
  nodes: ThreatFlowNode[];
  links: ThreatFlowLink[];
  columns?: string[];
  layerOrder?: string[];
}

const ACTION_COLORS: Record<string, string> = {
  blocked: "hsl(217, 91%, 55%)",
  allowed: "hsl(142, 76%, 45%)",
  quarantined: "hsl(269, 80%, 58%)",
  detected: "hsl(32, 95%, 52%)",
  dropped: "hsl(340, 82%, 52%)",
  denied: "hsl(350, 89%, 60%)",
  encrypted: "hsl(180, 70%, 45%)",
  logged: "hsl(200, 80%, 60%)",
  alerted: "hsl(38, 92%, 50%)",
  cleaned: "hsl(160, 84%, 39%)",
  flagged: "hsl(245, 72%, 55%)",
  contained: "hsl(300, 60%, 50%)",
  isolated: "hsl(190, 95%, 39%)",
  remediated: "hsl(120, 60%, 40%)",
};

const TARGET_COLORS: Record<string, string> = {
  system: "hsl(220, 70%, 55%)",
  mailbox: "hsl(280, 60%, 55%)",
  "web application": "hsl(170, 70%, 45%)",
  unknown: "hsl(210, 10%, 50%)",
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "hsl(340, 65%, 55%)",
  web: "hsl(200, 80%, 50%)",
  usb: "hsl(30, 80%, 55%)",
  cloud: "hsl(220, 70%, 55%)",
  network: "hsl(160, 60%, 45%)",
};

function ThreatFlowDiagram({ data }: { data: ThreatFlowData }) {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);

  const { nodes, links, columns, layerOrder: dataLayerOrder } = data;

  if (!nodes.length || !links.length) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="threat-flow-empty">
        <p className="text-sm text-muted-foreground">No threat flow data available</p>
      </div>
    );
  }

  const layers: Record<string, number[]> = {};
  nodes.forEach((n, i) => {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(i);
  });

  const defaultLayerOrder = ["threat", "severity", "target", "action"];
  const layerOrder = dataLayerOrder || defaultLayerOrder;
  const activeLayerOrder = layerOrder.filter(l => layers[l]?.length > 0);

  const columnLabels = columns || ["Threat Type", "Severity", "Target", "Action"];

  const threatCount = (layers["threat"] || []).length;
  const layerCount = activeLayerOrder.length;
  const width = layerCount >= 5 ? 1100 : 900;
  const height = Math.max(350, Math.min(800, threatCount * 35 + 80));
  const padding = 45;
  const nodeWidth = 16;
  const nodePadding = 4;

  const layerX: Record<string, number> = {};
  const usableWidth = width - padding * 2 - nodeWidth;
  activeLayerOrder.forEach((layer, i) => {
    layerX[layer] = padding + (usableWidth / Math.max(1, activeLayerOrder.length - 1)) * i;
  });

  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  links.forEach(l => {
    outgoing.set(l.source, (outgoing.get(l.source) || 0) + l.value);
    incoming.set(l.target, (incoming.get(l.target) || 0) + l.value);
  });

  const nodeHeights = nodes.map((_, i) => Math.max(outgoing.get(i) || 0, incoming.get(i) || 0));

  const layerPositions: Record<number, { x: number; y: number; h: number }> = {};

  for (const layer of activeLayerOrder) {
    const nodeIndices = layers[layer] || [];
    const totalValue = nodeIndices.reduce((s, i) => s + nodeHeights[i], 0);
    const availableHeight = height - padding * 2 - (nodeIndices.length - 1) * nodePadding;
    const scale = totalValue > 0 ? availableHeight / totalValue : 1;

    let currentY = padding;
    for (const idx of nodeIndices) {
      const h = Math.max(6, nodeHeights[idx] * scale);
      layerPositions[idx] = { x: layerX[layer], y: currentY, h };
      currentY += h + nodePadding;
    }
  }

  const getNodeColor = (idx: number): string => {
    const node = nodes[idx];
    if (node.layer === "severity") {
      const key = node.name.toLowerCase();
      return SEV[key] || "hsl(210, 10%, 50%)";
    }
    if (node.layer === "action") {
      const key = node.name.toLowerCase();
      return ACTION_COLORS[key] || PALETTE[(layers["action"] || []).indexOf(idx) % PALETTE.length];
    }
    if (node.layer === "target") {
      const key = node.name.toLowerCase();
      return TARGET_COLORS[key] || PALETTE[(layers["target"] || []).indexOf(idx) % PALETTE.length];
    }
    if (node.layer === "channel") {
      const key = node.name.toLowerCase();
      return CHANNEL_COLORS[key] || PALETTE[(layers["channel"] || []).indexOf(idx) % PALETTE.length];
    }
    if (node.layer === "source") {
      const posInLayer = (layers["source"] || []).indexOf(idx);
      return PALETTE[(posInLayer + 5) % PALETTE.length];
    }
    const posInLayer = (layers["threat"] || []).indexOf(idx);
    return PALETTE[posInLayer % PALETTE.length];
  };

  const sourceOffsets = new Map<number, number>();
  const targetOffsets = new Map<number, number>();

  const sortedLinks = [...links].sort((a, b) => {
    const ay = layerPositions[a.target]?.y || 0;
    const by = layerPositions[b.target]?.y || 0;
    return ay - by;
  });

  const totalFlowValue = links.reduce((s, l) => s + l.value, 0);

  const connectedToNode = (linkIdx: number, nodeIdx: number) => {
    const l = sortedLinks[linkIdx];
    return l.source === nodeIdx || l.target === nodeIdx;
  };

  // Fixed-point expansion: grow nodeSet via the ORIGINAL links array until no new
  // nodes are discovered, then map matched links back to sortedLinks indices for
  // linkSet. Using `links` (not `sortedLinks`) avoids any index drift caused by
  // the in-place sourceOffsets/targetOffsets mutations that happen during render.
  const getReachableChain = (anchorIdx: number): { nodeSet: Set<number>; linkSet: Set<number> } => {
    const nodeSet = new Set<number>([anchorIdx]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of links) {
        const srcIn = nodeSet.has(l.source);
        const tgtIn = nodeSet.has(l.target);
        if (srcIn && !tgtIn) { nodeSet.add(l.target); changed = true; }
        if (tgtIn && !srcIn) { nodeSet.add(l.source); changed = true; }
      }
    }
    const linkSet = new Set<number>();
    sortedLinks.forEach((l, si) => {
      if (nodeSet.has(l.source) && nodeSet.has(l.target)) linkSet.add(si);
    });
    return { nodeSet, linkSet };
  };

  const chain = selectedNode !== null ? getReachableChain(selectedNode) : null;

  const layerLabelMap: Record<string, string> = {};
  activeLayerOrder.forEach((layer, i) => {
    layerLabelMap[layer] = columnLabels[layerOrder.indexOf(layer)] || layer.charAt(0).toUpperCase() + layer.slice(1);
  });

  return (
    <div className="overflow-x-auto" data-testid="threat-flow-diagram">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 500 }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedNode(null); }}>
        <defs>
          {sortedLinks.map((link, i) => (
            <linearGradient key={`tf-grad-${i}`} id={`tf-link-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={getNodeColor(link.source)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={getNodeColor(link.target)} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {sortedLinks.map((link, i) => {
          const srcPos = layerPositions[link.source];
          const tgtPos = layerPositions[link.target];
          if (!srcPos || !tgtPos) return null;

          const srcTotal = outgoing.get(link.source) || 1;
          const tgtTotal = incoming.get(link.target) || 1;

          const srcOffset = sourceOffsets.get(link.source) || 0;
          const tgtOffset = targetOffsets.get(link.target) || 0;

          const srcBandH = (link.value / srcTotal) * srcPos.h;
          const tgtBandH = (link.value / tgtTotal) * tgtPos.h;

          const x0 = srcPos.x + nodeWidth;
          const y0 = srcPos.y + srcOffset;
          const x1 = tgtPos.x;
          const y1 = tgtPos.y + tgtOffset;

          sourceOffsets.set(link.source, srcOffset + srcBandH);
          targetOffsets.set(link.target, tgtOffset + tgtBandH);

          const midX = (x0 + x1) / 2;
          const pct = totalFlowValue > 0 ? ((link.value / totalFlowValue) * 100) : 0;

          const isHighlighted = chain
            ? chain.linkSet.has(i)
            : hoveredLink === i || (hoveredNode !== null && connectedToNode(i, hoveredNode));
          const isDimmed = chain
            ? !chain.linkSet.has(i)
            : (hoveredLink !== null && hoveredLink !== i && hoveredNode === null) ||
              (hoveredNode !== null && !connectedToNode(i, hoveredNode));

          return (
            <g key={`tf-link-${i}`}>
              <path
                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tgtBandH} C${midX},${y1 + tgtBandH} ${midX},${y0 + srcBandH} ${x0},${y0 + srcBandH} Z`}
                fill={`url(#tf-link-grad-${i})`}
                className="transition-opacity duration-200"
                opacity={isDimmed ? 0.15 : isHighlighted ? 0.85 : 0.55}
                onMouseEnter={() => setHoveredLink(i)}
                onMouseLeave={() => setHoveredLink(null)}
                style={{ cursor: "pointer" }}
              >
                <title>{`${nodes[link.source].name} \u2192 ${nodes[link.target].name}: ${link.value.toLocaleString()} events (${pct.toFixed(1)}%)`}</title>
              </path>
              {srcBandH > 12 && tgtBandH > 12 && pct >= 3 && (
                <text
                  x={midX}
                  y={(y0 + srcBandH / 2 + y1 + tgtBandH / 2) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[9px] font-medium pointer-events-none"
                  opacity={isDimmed ? 0.2 : 0.7}
                >
                  {pct.toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node, idx) => {
          const pos = layerPositions[idx];
          if (!pos) return null;
          const color = getNodeColor(idx);
          const isLeftLayer = node.layer === activeLayerOrder[0];
          const isRightLayer = node.layer === activeLayerOrder[activeLayerOrder.length - 1];
          const nodeVal = Math.max(outgoing.get(idx) || 0, incoming.get(idx) || 0);

          const isSelected = selectedNode === idx;
          const isDimmed = chain
            ? !chain.nodeSet.has(idx)
            : hoveredNode !== null && hoveredNode !== idx &&
              !sortedLinks.some(l => (l.source === hoveredNode && l.target === idx) || (l.target === hoveredNode && l.source === idx));

          return (
            <g key={`tf-node-${idx}`}
              onMouseEnter={() => setHoveredNode(idx)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={(e) => { e.stopPropagation(); setSelectedNode(prev => prev === idx ? null : idx); }}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={pos.h}
                fill={color}
                rx={3}
                ry={3}
                className="transition-opacity duration-200"
                opacity={isDimmed ? 0.3 : 1}
              >
                <title>{`${node.name}: ${nodeVal.toLocaleString()} events`}</title>
              </rect>
              {isSelected && (
                <rect
                  x={pos.x - 3}
                  y={pos.y - 3}
                  width={nodeWidth + 6}
                  height={pos.h + 6}
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  strokeDasharray="3 2"
                  rx={5}
                  ry={5}
                  className="pointer-events-none"
                />
              )}
              {(pos.h > 10 || isRightLayer) && (
                <text
                  x={isLeftLayer ? pos.x - 4 : pos.x + nodeWidth + 4}
                  y={pos.y + pos.h / 2}
                  textAnchor={isLeftLayer ? "end" : "start"}
                  dominantBaseline="middle"
                  className={`fill-foreground pointer-events-none text-[10px] transition-opacity duration-200`}
                  opacity={isDimmed ? 0.3 : 1}
                >
                  {isRightLayer
                    ? (node.name.length > 18 ? node.name.substring(0, 18) + "…" : node.name)
                    : (node.name.length > 28 ? node.name.substring(0, 28) + "..." : node.name)}
                  {node.layer === "threat" && node.count ? ` (${node.count})` : ""}
                </text>
              )}
            </g>
          );
        })}

        {activeLayerOrder.map((layer) => {
          const x = layerX[layer] + nodeWidth / 2;
          return (
            <text
              key={`tf-label-${layer}`}
              x={x}
              y={padding - 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider"
            >
              {layerLabelMap[layer] || layer}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

const DOMAIN_FLOW_TITLES: Record<string, string> = {
  email: "Threat Type → Severity → Target → Action",
  endpoint: "Threat Type → Severity → Target → Action",
  dlp: "Threat Type → Channel → Severity → Source → Action",
  waf: "Attack Type → Severity → Target → Action",
  web: "Attack Type → Severity → Target → Action",
  network: "Attack Type → Severity → Target → Action",
  identity: "Attack Type → Severity → Target → Action",
  cloud: "Attack Type → Severity → Target → Action",
  vulnerability: "Threat Type → Severity → Target → Action",
};

function EmailSenderDomainRiskCard({ tenantId }: { tenantId: number }) {
  const [, navigate] = useLocation();
  const [sortCol, setSortCol] = useState<string>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "email-domains"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/email-domains`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const rawDomains = data?.domains || [];
  const sorted = [...rawDomains].sort((a: any, b: any) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  });
  const domains = sorted.slice(0, 10);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortIcon = (col: string) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const authBadge = (status: string) => {
    if (status === "pass") return <Badge className="text-[8px] px-1 py-0 bg-green-500/20 text-green-600 border-green-300">Pass</Badge>;
    if (status === "fail" || status === "softfail") return <Badge className="text-[8px] px-1 py-0 bg-red-500/20 text-red-600 border-red-300">Fail</Badge>;
    return <Badge className="text-[8px] px-1 py-0 bg-gray-500/20 text-gray-500 border-gray-300">N/A</Badge>;
  };

  if (isLoading) return <Card className="p-4"><Skeleton className="h-48 w-full" /></Card>;
  if (!domains.length) return null;

  const cols = [
    { key: "domain", label: "Domain", align: "left" as const },
    { key: "riskScore", label: "Risk", align: "center" as const },
    { key: "eventCount", label: "Events", align: "center" as const },
    { key: "maliciousCount", label: "Malicious", align: "center" as const },
    { key: "suspiciousCount", label: "Suspicious", align: "center" as const },
    { key: "quarantinedCount", label: "Quarantined", align: "center" as const },
    { key: "recipientsTargeted", label: "Recipients", align: "center" as const },
    { key: "spfStatus", label: "SPF", align: "center" as const },
    { key: "dkimStatus", label: "DKIM", align: "center" as const },
    { key: "dmarcStatus", label: "DMARC", align: "center" as const },
    { key: "lastSeen", label: "Last Seen", align: "center" as const },
  ];

  return (
    <ExpandableCard title="Sender Domain Risk Intelligence" data-testid="card-email-domain-risk">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="table-email-domain-risk">
          <thead>
            <tr className="border-b text-muted-foreground">
              {cols.map(c => (
                <th key={c.key} className={`${c.align === "left" ? "text-left" : "text-center"} p-2 font-medium cursor-pointer hover:text-foreground select-none transition-colors`} onClick={() => toggleSort(c.key)} data-testid={`th-sort-${c.key}`}>
                  {c.label}{sortIcon(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domains.map((d: any, idx: number) => (
              <tr
                key={d.domain}
                className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/asset-inventory?tab=email-domains`)}
                data-testid={`row-domain-risk-${idx}`}
              >
                <td className="p-2 font-medium">
                  <div className="flex items-center gap-1.5">
                    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d.domain)}&sz=16`} alt="" className="w-3.5 h-3.5 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="truncate max-w-[120px]">{d.domain}</span>
                  </div>
                </td>
                <td className="p-2 text-center">
                  <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${d.riskScore >= 75 ? "bg-red-500" : d.riskScore >= 50 ? "bg-orange-500" : d.riskScore >= 25 ? "bg-yellow-500" : "bg-green-500"}`}>{d.riskScore}</span>
                </td>
                <td className="p-2 text-center font-medium">{d.eventCount}</td>
                <td className="p-2 text-center">{d.maliciousCount > 0 ? <span className="text-red-600 font-bold">{d.maliciousCount}</span> : <span className="text-muted-foreground">0</span>}</td>
                <td className="p-2 text-center">{d.suspiciousCount > 0 ? <span className="text-orange-600 font-medium">{d.suspiciousCount}</span> : <span className="text-muted-foreground">0</span>}</td>
                <td className="p-2 text-center">{d.quarantinedCount > 0 ? <span className="text-blue-600 font-medium">{d.quarantinedCount}</span> : <span className="text-muted-foreground">0</span>}</td>
                <td className="p-2 text-center font-medium">{d.recipientsTargeted}</td>
                <td className="p-2 text-center">{authBadge(d.spfStatus)}</td>
                <td className="p-2 text-center">{authBadge(d.dkimStatus)}</td>
                <td className="p-2 text-center">{authBadge(d.dmarcStatus)}</td>
                <td className="p-2 text-center text-muted-foreground">{d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.summary && (
        <div className="flex gap-3 mt-3 px-2 text-[10px]">
          <span className="text-muted-foreground">Total: <span className="font-medium text-foreground">{data.summary.totalDomains}</span></span>
          {data.summary.criticalDomains > 0 && <span className="text-red-500">Critical: {data.summary.criticalDomains}</span>}
          {data.summary.highRiskDomains > 0 && <span className="text-orange-500">High: {data.summary.highRiskDomains}</span>}
          {data.summary.mediumRiskDomains > 0 && <span className="text-yellow-600">Medium: {data.summary.mediumRiskDomains}</span>}
        </div>
      )}
    </ExpandableCard>
  );
}

function ThreatFlowSection({ tenantId, domain, title }: { tenantId: number; domain: string; title?: string }) {
  const { data, isLoading } = useQuery<ThreatFlowData>({
    queryKey: ["/api/dashboard", tenantId, "threat-flow", domain],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/${tenantId}/threat-flow/${domain}`, { credentials: "include" });
      if (!res.ok) return { nodes: [], links: [] };
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });

  const displayTitle = title || DOMAIN_FLOW_TITLES[domain] || "Threat Type → Severity → Target → Action";

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider">{displayTitle}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`threat-flow-card-${domain}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider">{displayTitle}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data?.nodes?.length ? (
          <ThreatFlowDiagram data={data} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid={`threat-flow-empty-${domain}`}>
            <Network className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No threat flow data available</p>
            <p className="text-xs mt-1 opacity-70">Security events will populate this diagram when detected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AI Learning Stats Card ───────────────────────────────────────────────────
function AiLearningCard({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery<{
    decisionsThisWeek: number;
    totalDecisions: number;
    accuracyPercent: number | null;
    topMisclassified: Array<{ source: string; count: number }>;
    lastDigestAt: string | null;
    fewShotExamples: string | null;
  }>({
    queryKey: ["/api/ai-learning/stats", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ai-learning/stats/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000,
    enabled: !!tenantId,
  });

  const { data: trend } = useQuery<Array<{ day: string; total: number; matched: number; accuracy: number | null }>>({
    queryKey: ["/api/ai-learning/trend", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/ai-learning/trend/${tenantId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 300_000,
    enabled: !!tenantId,
  });

  const accuracy = data?.accuracyPercent;
  const accColor = accuracy === null ? "text-muted-foreground" : accuracy >= 80 ? "text-green-400" : accuracy >= 60 ? "text-yellow-400" : "text-red-400";
  const hasTrendData = trend && trend.some(d => d.total > 0);

  return (
    <Card className="border border-border hover:shadow-lg transition-shadow" data-testid="ai-learning-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Adaptive AI Learning Loop
          <Badge variant="outline" className="text-[10px] ml-auto">AI</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/30 rounded-lg p-2">
                <p className={`text-xl font-bold ${accColor}`}>{accuracy !== null ? `${accuracy}%` : "–"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">AI Accuracy</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-xl font-bold text-foreground">{data?.decisionsThisWeek ?? 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Decisions / 7d</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-xl font-bold text-foreground">{data?.totalDecisions ?? 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Total Training</p>
              </div>
            </div>

            {/* 30-Day Accuracy Trend Sparkline */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">30-Day AI Accuracy Trend</p>
              {hasTrendData ? (
                <ResponsiveContainer width="100%" height={52}>
                  <AreaChart data={trend?.filter(d => d.accuracy !== null)} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="learningGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={false} axisLine={false} tickLine={false} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ fontSize: 10, padding: "4px 8px", background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => [`${v}%`, "Accuracy"]}
                      labelFormatter={(l: string) => l.slice(5)}
                    />
                    <Area type="monotone" dataKey="accuracy" stroke="hsl(var(--primary))" fill="url(#learningGradient)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-12 flex items-center justify-center text-[10px] text-muted-foreground bg-muted/20 rounded">
                  No decisions yet — classifying incidents generates training data
                </div>
              )}
            </div>

            {accuracy !== null && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Model Accuracy (30d)</span>
                  <span className={accColor}>{accuracy}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${accuracy >= 80 ? "bg-green-500" : accuracy >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
              </div>
            )}
            {data?.topMisclassified && data.topMisclassified.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Top Misclassified Sources</p>
                <div className="space-y-1">
                  {data.topMisclassified.slice(0, 3).map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">{m.source}</span>
                      <Badge variant="outline" className="text-[9px] py-0">{m.count} errors</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <p className="text-[10px] text-muted-foreground">
                {data?.lastDigestAt
                  ? `Last digest ${new Date(data.lastDigestAt).toLocaleDateString()}`
                  : "Digest runs nightly at 02:00 UTC"}
              </p>
              {data?.totalDecisions === 0 && (
                <Badge variant="outline" className="text-[9px] text-yellow-500 border-yellow-500/40">Collecting data…</Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const fmt = useTenantDateFormatter();
  const qc = useQueryClient();
  const [timeRange, setTimeRange] = useState("all");
  const [liveMode, setLiveMode] = useState(false);
  const [location] = useLocation();
  const getTabFromUrl = useCallback(() => {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    return sp.get("tab") || "overview";
  }, []);
  const [activeTab, setActiveTab] = useState(getTabFromUrl);
  const [overviewMode, setOverviewMode] = useState("executive");
  const widgetLayout = useDashboardLayout(overviewMode);
  useEffect(() => {
    if (location === "/dashboard") {
      setActiveTab(getTabFromUrl());
    }
  }, [location, getTabFromUrl]);
  useEffect(() => {
    const onPop = () => setActiveTab(getTabFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [getTabFromUrl]);
  const changeTab = useCallback((tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, []);
  const { data: stats, isLoading, dataUpdatedAt } = useQuery<any>({
    queryKey: ["/api/dashboard", currentTenant?.id, timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/${currentTenant!.id}?timeRange=${timeRange}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    enabled: !!currentTenant,
    refetchInterval: liveMode ? 5000 : 60000,
  });
  const { data: assetsData, isLoading: assetsLoading } = useQuery<any>({
    queryKey: ["/api/assets", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: threatAnalysis, isLoading: threatLoading } = useQuery<any>({
    queryKey: ["/api/ai/threat-analysis", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: userAssetsData, isLoading: userAssetsLoading } = useQuery<any>({
    queryKey: ["/api/user-assets", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: webSecData } = useQuery<any>({
    queryKey: ["/api/web-security", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: dsData } = useQuery<any>({
    queryKey: ["/api/data-security", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: swAnalytics, isLoading: swAnalyticsLoading } = useQuery<any>({
    queryKey: ["/api/assets/software-analytics", currentTenant?.id],
    queryFn: async () => {
      const tid = currentTenant?.id;
      const url = tid ? `/api/assets/software-analytics?tenantId=${tid}` : "/api/assets/software-analytics";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });
  const { data: domainDistData } = useQuery<any>({
    queryKey: ["/api/assets", currentTenant?.id, "domain-distribution"],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${currentTenant!.id}/domain-distribution`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });
  const { data: cloudRiskData } = useQuery<any>({
    queryKey: ["/api/cloud-risk/dashboard", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/cloud-risk/dashboard/${currentTenant!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });
  const { data: cloudRiskScores } = useQuery<any>({
    queryKey: ["/api/cloud-risk/scores", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/cloud-risk/scores/${currentTenant!.id}?limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
  });

  const { data: securityCoverage } = useQuery<any>({
    queryKey: ["/api/asset-inventory", currentTenant?.id, "security-coverage"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${currentTenant!.id}/security-coverage`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id && overviewMode === "ciso",
  });
  const { data: cisoStats } = useQuery<any>({
    queryKey: ["/api/dashboard", currentTenant?.id, "ciso-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/${currentTenant!.id}/ciso-stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id && (overviewMode === "ciso" || overviewMode === "executive"),
  });

  const [chartTypes, setChartTypes] = useState<Record<string, string>>({});
  const [reclassifying, setReclassifying] = useState(false);
  const [assetPage, setAssetPage] = useState(0);
  const [assetPageSize, setAssetPageSize] = useState(25);
  const [assetFilter, setAssetFilter] = useState<{ type: string; value: string } | null>(null);
  const [userPage, setUserPage] = useState(0);
  const [userPageSize, setUserPageSize] = useState(25);
  const [userFilter, setUserFilter] = useState<{ type: string; value: string } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [swView, setSwView] = useState<string | null>(null);
  const [swPage, setSwPage] = useState(0);
  const swPageSize = 25;
  const [swInventoryExpanded, setSwInventoryExpanded] = useState<string | null>(null);
  const [swInventoryPage, setSwInventoryPage] = useState(0);
  const [swInventorySearch, setSwInventorySearch] = useState("");
  const swInventoryPageSize = 20;

  const [cisoFilter, setCisoFilter] = useState<{type: string; value: string; label: string} | null>(null);
  const { filter: execFilter, toggleFilter: toggleExecFilter, clearFilter: clearExecFilter, dimOpacity } = useDashboardFilter();
  const [socFilter, setSocFilter] = useState<{type: string; value: string; label: string} | null>(null);
  const [drilldown, setDrilldown] = useState<{ open: boolean; filterType: string; filterValue: string; label: string; domain?: string } | null>(null);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [briefingRefreshKey, setBriefingRefreshKey] = useState(0);
  const { data: briefingData, isLoading: briefingLoading, refetch: refetchBriefing } = useQuery<any>({
    queryKey: ["/api/dashboard/briefing", currentTenant?.id, timeRange, briefingRefreshKey],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/briefing?tenantId=${currentTenant!.id}&timeRange=${timeRange}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: socMetrics, isLoading: socMetricsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/soc-metrics", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/soc-metrics?tenantId=${currentTenant!.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentTenant?.id && activeTab === "overview",
    staleTime: 3 * 60 * 1000,
  });

  const { data: drilldownData, isLoading: drilldownLoading } = useQuery<any>({
    queryKey: ["/api/drilldown", currentTenant?.id, drilldown?.filterType, drilldown?.filterValue, drilldown?.domain],
    queryFn: async () => {
      let url = `/api/drilldown/${currentTenant?.id}?filterType=${encodeURIComponent(drilldown!.filterType)}&filterValue=${encodeURIComponent(drilldown!.filterValue)}`;
      if (drilldown?.domain) url += `&domain=${encodeURIComponent(drilldown.domain)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drill-down data");
      return res.json();
    },
    enabled: !!drilldown?.open && !!currentTenant?.id,
  });

  const openDrilldown = useCallback((filterType: string, filterValue: string, label: string, domain?: string) => {
    setDrilldown({ open: true, filterType, filterValue, label, domain });
  }, []);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrilldown(null); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [liveFeedOpen, setLiveFeedOpen] = useState(false);
  const [liveFeedConnected, setLiveFeedConnected] = useState(false);
  const [liveSessionCount, setLiveSessionCount] = useState(0);
  const liveFeedRef = useRef<HTMLDivElement>(null);
  const [liveFeedPaused, setLiveFeedPaused] = useState(false);

  useEffect(() => {
    if (!currentTenant?.id) return;
    let eventSource: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      eventSource = new EventSource(`/api/events/stream/${currentTenant.id}`);
      eventSource.onopen = () => { setLiveFeedConnected(true); retryCount = 0; };
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "initial" && data.events) {
            setLiveEvents(prev => [...data.events, ...prev].slice(0, 100));
          } else if (data.type === "event" && data.event) {
            setLiveEvents(prev => [data.event, ...prev].slice(0, 100));
            setLiveSessionCount(c => c + 1);
          }
        } catch {}
      };
      eventSource.onerror = () => {
        setLiveFeedConnected(false);
        eventSource?.close();
        retryCount++;
        if (retryCount > 10) return;
        const delay = Math.min(5000 * Math.pow(1.5, retryCount - 1), 60000);
        retryTimer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => { stopped = true; eventSource?.close(); if (retryTimer) clearTimeout(retryTimer); setLiveFeedConnected(false); };
  }, [currentTenant?.id]);

  useEffect(() => {
    if (!liveFeedPaused && liveFeedRef.current) {
      liveFeedRef.current.scrollTop = 0;
    }
  }, [liveEvents, liveFeedPaused]);

  const ct = (id: string, fallback: string) => chartTypes[id] || fallback;
  const setCt = (id: string, val: string) => setChartTypes(prev => ({ ...prev, [id]: val }));

  const dashboardRef = useDashboardExportRef();

  if (isLoading || !stats) return <DashboardSkeleton />;

  const s = {
    totalIncidents: 0, openIncidents: 0, resolvedIncidents: 0, criticalIncidents: 0,
    totalTickets: 0, openTickets: 0, totalEvents: 0, avgRiskScore: 0, criticalEvents: 0,
    blockedEvents: 0, complianceScore: 0,
    mitreTacticsDistribution: [] as any[], killChainDistribution: [] as any[], attackVectorDistribution: [] as any[],
    mitreMatrix: [] as any[], killChainFull: [] as any[],
    incidentTrend: [] as any[], severityBreakdown: [] as any[], categoryBreakdown: [] as any[],
    recentIncidents: [] as any[], eventsByType: [] as any[], eventsBySeverity: [] as any[],
    eventTrend: [] as any[], topThreats: [] as any[], topTargets: [] as any[],
    topAttackers: [] as any[], topVulnerableApps: [] as any[], vulnerabilitySeverity: [] as any[],
    topTargetsEndpoint: [] as any[], topTargetsEmail: [] as any[],
    topWebUrls: [] as any[], topWebCategories: [] as any[],
    incidentsByDomain: {} as Record<string, number>,
    eventsByDomain: {} as Record<string, number>,
    sevHeatmapByControl: [] as any[], actionHeatmapByControl: [] as any[], overviewSevTrend: [] as any[],
    topVulnAssets: [] as any[], riskDistribution: [] as any[],
    incidentsByThreatVector: [] as any[], mitreTactics: [] as any[], topMitreTechniques: [] as any[],
    incidentsByAction: [] as any[], emailByThreat: [] as any[], topSenders: [] as any[],
    topRecipients: [] as any[], emailActions: [] as any[], emailSeverity: [] as any[],
    emailThreatVectors: [] as any[], emailTotal: 0, incidentByType: [] as any[], endpointByThreat: [] as any[],
    endpointActions: [] as any[], topInfectedHosts: [] as any[], endpointLogSources: [] as any[],
    endpointThreatVectors: [] as any[], endpointTotal: 0,
    endpointIncidentByType: [] as any[], emailIncidentByType: [] as any[], networkIncidentByType: [] as any[],
    identityIncidentByType: [] as any[], cloudIncidentByType: [] as any[], webAppIncidentByType: [] as any[], dlpIncidentByType: [] as any[],
    casbApps: [] as any[],
    casbActions: [] as any[], casbTotal: 0, wafAttackTypes: [] as any[], wafActions: [] as any[],
    wafTargets: [] as any[], wafTotal: 0, dlpByThreat: [] as any[], dlpActions: [] as any[],
    dlpTotal: 0, sseTotal: 0, networkByThreat: [] as any[], networkProtocols: [] as any[],
    networkTotal: 0, identityByThreat: [] as any[], identityActions: [] as any[],
    identityTotal: 0, cloudByThreat: [] as any[], cloudApps: [] as any[], cloudTotal: 0,
    topLogSources: [] as any[], sourceTypes: [] as any[], logIngestionTrend: [] as any[],
    topCountries: [] as any[],
    endpointRemediation: null as any, sseRemediation: null as any, emailRemediation: null as any,
    networkRemediation: null as any, dlpRemediation: null as any, vulnRemediation: null as any,
    allEventRemediation: null as any,
    newAlerts: { today: 0, thisWeek: 0, thisMonth: 0, todayChange: 0, weekChange: 0, monthChange: 0 } as any,
    domainInsights: {} as Record<string, any>,
    eventsTimeline: [] as any[],
    ...stats,
  };

  return (
    <div className="space-y-5 p-4 md:p-6 overflow-y-auto h-full" ref={dashboardRef}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-dashboard-title">
              Cyber Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{currentTenant?.name} &mdash; Real-time threat intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DashboardExportBar dashboardTitle="Cyber Command Center" containerRef={dashboardRef} />
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5" data-testid="time-range-filter">
            {(["1h", "24h", "7d", "30d", "90d", "all"] as const).map((tr) => (
              <Button
                key={tr}
                size="sm"
                variant={timeRange === tr ? "default" : "ghost"}
                className={`h-6 px-2 text-[10px] font-medium ${timeRange === tr ? "" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setTimeRange(tr)}
                data-testid={`time-range-${tr}`}
              >
                {tr === "all" ? "All" : tr.toUpperCase()}
              </Button>
            ))}
          </div>
          <Badge variant="outline" className="gap-1.5 text-[10px] cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setLiveFeedOpen(!liveFeedOpen)} data-testid="live-feed-toggle">
            <span className={`w-1.5 h-1.5 rounded-full ${liveFeedConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            LIVE
            {liveSessionCount > 0 && <span className="ml-0.5 font-mono">+{liveSessionCount}</span>}
          </Badge>
          <button
            onClick={() => setLiveMode(m => !m)}
            data-testid="button-live-mode-toggle"
            className={`h-6 px-2.5 text-[10px] font-black tracking-widest rounded border transition-all duration-200 flex items-center gap-1.5 ${liveMode ? "bg-red-500 border-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-muted/50 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {liveMode && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />}
            {liveMode ? "LIVE" : "AUTO"}
          </button>
          <Badge variant="secondary" className="text-[10px] font-mono">{s.totalEvents} events</Badge>
        </div>
      </div>

      <DashboardCommandStrip
        stats={stats ? {
          criticalEvents: s.criticalEvents,
          openIncidents: s.openIncidents,
          eventsPerHour: Math.round((s.totalEvents || 0) / 24),
          slaBreachCount: stats.slaBreachCount ?? 0,
          avgRiskScore: s.avgRiskScore,
          severityCounts: stats.severityCounts,
        } : null}
        lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
        liveMode={liveMode}
        onToggleLive={() => setLiveMode(m => !m)}
      />


      {activeTab === "overview" && overviewMode === "executive" && (() => {
        const threatLevelColors: Record<string, string> = {
          Critical: "bg-red-500/15 text-red-500 border-red-500/30",
          High: "bg-orange-500/15 text-orange-500 border-orange-500/30",
          Medium: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
          Low: "bg-green-500/15 text-green-600 border-green-500/30",
        };
        const tl = briefingData?.threatLevel || "Medium";
        const tlClass = threatLevelColors[tl] || threatLevelColors.Medium;
        return (
          <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden" data-testid="ai-briefing-card">
            <CardContent className="p-0">
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-border/40">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold">Executive Intelligence Briefing</span>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary px-1.5 shrink-0">ARIA AI</Badge>
                  {briefingData?.threatLevel && (
                    <Badge className={`text-[10px] px-1.5 border shrink-0 ${tlClass}`}>{tl} Threat Level</Badge>
                  )}
                  {briefingData?.fallback_used && (
                    <Badge variant="outline" className="text-[10px] px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 shrink-0" data-testid="badge-briefing-cached">AI briefing using cached data</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground hidden sm:block">{briefingData?.generatedAt ? new Date(briefingData.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => { setBriefingRefreshKey(k => k + 1); }} data-testid="btn-refresh-briefing">
                    <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                  </Button>
                </div>
              </div>

              {briefingLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" />
                </div>
              ) : briefingData ? (
                <div className="p-4 space-y-3">
                  {/* Threat Scorecard */}
                  {briefingData.metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="briefing-scorecard">
                      {[
                        { label: "Active Threats", value: briefingData.metrics.activeThreats, color: C.red },
                        { label: "New IOCs (24h)", value: briefingData.metrics.newIOCs24h, color: C.orange },
                        { label: "Coverage %", value: `${briefingData.metrics.coveragePercent}%`, color: C.green },
                        { label: "Avg Response", value: `${briefingData.metrics.avgResponseTimeMin}m`, color: C.blue },
                        { label: "SLA Health", value: `${briefingData.metrics.slaHealth}%`, color: briefingData.metrics.slaHealth >= 90 ? C.green : briefingData.metrics.slaHealth >= 70 ? C.orange : C.red },
                      ].map((m) => (
                        <div key={m.label} className="bg-muted/30 border border-border/40 rounded-md px-2.5 py-1.5 flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">{m.label}</span>
                          <span className="text-base font-bold" style={{ color: m.color }}>{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary text — renders **bold** markdown and line breaks */}
                  <div>
                    <p className={`text-sm text-muted-foreground leading-relaxed ${briefingExpanded ? "" : "line-clamp-2"}`}>
                      {briefingData.summary?.split(/\n+/).map((line: string, li: number) => (
                        <span key={li}>
                          {li > 0 && <br />}
                          {line.split(/(\*\*[^*]+\*\*)/).map((part: string, i: number) =>
                            part.startsWith("**") && part.endsWith("**")
                              ? <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
                              : part
                          )}
                        </span>
                      ))}
                    </p>
                    {briefingData.summary && briefingData.summary.length > 200 && (
                      <button className="text-[11px] text-primary mt-0.5" onClick={() => setBriefingExpanded(e => !e)} data-testid="btn-briefing-expand">
                        {briefingExpanded ? "Show less" : "Read full briefing →"}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Top Threats */}
                    {briefingData.topThreats && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Top Threats</p>
                        <div className="space-y-1.5">
                          {briefingData.topThreats.map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: SEV[t.severity] || C.blue, color: "white" }}>{i+1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium truncate">{t.name}</p>
                                <p className="text-[9px] text-muted-foreground">{t.tactic}</p>
                              </div>
                              <Badge className={`text-[8px] px-1 border ${threatLevelColors[t.severity === "critical" ? "Critical" : t.severity === "high" ? "High" : t.severity === "medium" ? "Medium" : "Low"] || ""}`}>{t.severity}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Recommendations */}
                    {briefingData.recommendations && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Recommendations</p>
                        <div className="space-y-1">
                          {briefingData.recommendations.slice(0, 4).map((r: string, i: number) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                              <p className="text-[11px] text-muted-foreground leading-snug">{r}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Week-over-Week Sparklines */}
                    {briefingData.weekOverWeek && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Week-over-Week</p>
                        <div className="space-y-2" data-testid="wow-sparklines">
                          {[
                            {
                              label: "Incidents",
                              thisVal: briefingData.weekOverWeek?.incidents?.thisWeek ?? 0,
                              lastVal: briefingData.weekOverWeek?.incidents?.lastWeek ?? 0,
                              thisDaily: briefingData.weekOverWeek?.incidents?.thisWeekDaily ?? [],
                              lastDaily: briefingData.weekOverWeek?.incidents?.lastWeekDaily ?? [],
                            },
                            {
                              label: "Events",
                              thisVal: briefingData.weekOverWeek?.events?.thisWeek ?? 0,
                              lastVal: briefingData.weekOverWeek?.events?.lastWeek ?? 0,
                              thisDaily: briefingData.weekOverWeek?.events?.thisWeekDaily ?? [],
                              lastDaily: briefingData.weekOverWeek?.events?.lastWeekDaily ?? [],
                            },
                            {
                              label: "Confidence",
                              thisVal: briefingData.weekOverWeek?.avgConfidence?.thisWeek ?? 0,
                              lastVal: briefingData.weekOverWeek?.avgConfidence?.lastWeek ?? 0,
                              thisDaily: briefingData.weekOverWeek?.avgConfidence?.thisWeekDaily ?? [],
                              lastDaily: briefingData.weekOverWeek?.avgConfidence?.lastWeekDaily ?? [],
                              suffix: "%",
                            },
                          ].map((w) => {
                            const delta = w.thisVal - w.lastVal;
                            const pct = w.lastVal > 0 ? Math.round((delta / w.lastVal) * 100) : 0;
                            const isGood = w.label === "Confidence" ? delta >= 0 : delta <= 0;
                            const sparkData = w.thisDaily.map((v: number, i: number) => ({ i, curr: v, prev: w.lastDaily[i] ?? 0 }));
                            return (
                              <div key={w.label} className="flex items-center gap-2" data-testid={`sparkline-${w.label.toLowerCase()}`}>
                                <span className="text-[10px] text-muted-foreground w-16 shrink-0">{w.label}</span>
                                <div className="flex-1 h-8">
                                  <ResponsiveContainer width="100%" height={32}>
                                    <RechartsLineChart data={sparkData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                                      <Line type="monotone" dataKey="prev" stroke="#6b7280" strokeWidth={1} dot={false} strokeDasharray="3 2" />
                                      <Line type="monotone" dataKey="curr" stroke={isGood ? "#22c55e" : "#ef4444"} strokeWidth={1.5} dot={false} />
                                    </RechartsLineChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[11px] font-semibold">{w.thisVal}{w.suffix || ""}</span>
                                  <span className={`text-[10px] ${isGood ? "text-green-500" : "text-red-500"}`}>{delta >= 0 ? "+" : ""}{pct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })()}

      {activeTab === "overview" && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Total Incidents" value={s.totalIncidents} sub={`${s.openIncidents} open`} icon={AlertTriangle} color={C.red} />
        <MetricCard title="Critical Alerts" value={s.criticalEvents} icon={ShieldAlert} color={C.orange} />
        <MetricCard title="Remediated" value={s.remediatedCount || 0} icon={ShieldCheck} color={C.green} />
        <MetricCard title="Risk Score" value={s.avgRiskScore} sub="/100" icon={Gauge} color={s.avgRiskScore >= 70 ? C.red : C.orange} />
        <MetricCard title="MITRE Tactics" value={s.mitreTacticsDistribution?.length || 0} sub="ATT&CK Coverage" icon={Shield} color={C.blue} />
        <MetricCard title="Kill Chain" value={s.killChainDistribution?.length || 0} sub="Phases Detected" icon={Crosshair} color={C.purple} />
      </div>
      )}

      {activeTab === "overview" && s.newAlerts && (s.newAlerts.today > 0 || s.newAlerts.thisWeek > 0 || s.newAlerts.thisMonth > 0) && (
        <div className="grid grid-cols-3 gap-3" data-testid="new-alerts-trend">
          {[
            { label: "New Events Today", value: s.newAlerts.today, change: s.newAlerts.todayChange, sub: "vs yesterday" },
            { label: "Events This Week", value: s.newAlerts.thisWeek, change: s.newAlerts.weekChange, sub: "vs last week" },
            { label: "Events This Month", value: s.newAlerts.thisMonth, change: s.newAlerts.monthChange, sub: "vs last month" },
          ].map((item) => (
            <Card key={item.label} className="border-l-4" style={{ borderLeftColor: item.change > 0 ? C.red : item.change < 0 ? C.green : C.blue }}>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{item.label}</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-2xl font-bold">{item.value}</p>
                  <div className="flex items-center gap-1">
                    {item.change > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                    ) : item.change < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-chart-2" />
                    ) : null}
                    <span className={`text-[11px] font-medium ${item.change > 0 ? "text-destructive" : item.change < 0 ? "text-chart-2" : "text-muted-foreground"}`}>
                      {item.change > 0 ? "+" : ""}{item.change}%
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">{item.sub}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "overview" && (socMetrics || socMetricsLoading) && (() => {
        const timeMetrics = [
          { key: "mttd", label: "MTTD", title: "Mean Time to Detect", icon: Radar, color: C.blue },
          { key: "mtti", label: "MTTI", title: "Mean Time to Investigate", icon: Clock, color: C.teal },
          { key: "mttr", label: "MTTR", title: "Mean Time to Respond", icon: Clock, color: C.orange },
          { key: "mttc", label: "MTTC", title: "Mean Time to Contain", icon: Shield, color: C.purple },
          { key: "slaCompliance", label: "SLA", title: "SLA Compliance Rate", icon: CheckCircle2, color: C.green },
        ];
        const ao = socMetrics?.aiOverride ?? { rate: 0, total: 0, overridden: 0 };
        const gaugeData = [{ name: "override", value: ao.rate, fill: ao.rate > 30 ? C.red : ao.rate > 15 ? C.orange : C.green }];
        const statusColors: Record<string, string> = {
          open: C.blue, investigating: C.teal, awaiting_response: C.orange,
          resolved: C.green, closed: "#64748b",
        };
        const statusLabels: Record<string, string> = {
          open: "Open", investigating: "Investigating", awaiting_response: "Awaiting Response",
          resolved: "Resolved", closed: "Closed",
        };
        const statusKeys = Object.keys(statusColors);

        return (
          <div className="space-y-3" data-testid="soc-metrics-panel">
            {/* MTTD / MTTI / MTTR / MTTC / SLA row — five metric KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {timeMetrics.map((m) => {
                const data = socMetrics?.[m.key];
                const val = data?.value ?? null;
                const prev = data?.prev ?? 0;
                const unit = data?.unit ?? "";
                const delta = val != null ? val - prev : 0;
                const isGood = m.key === "slaCompliance" ? delta >= 0 : delta <= 0;
                const pct = prev > 0 ? Math.round(Math.abs(delta / prev) * 100) : 0;
                return (
                  <Card key={m.key} className="border-border/50" data-testid={`soc-metric-${m.key}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{m.title}</span>
                        <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      {socMetricsLoading ? (
                        <Skeleton className="h-7 w-16 mt-1" />
                      ) : val == null ? (
                        <div>
                          <span className="text-2xl font-bold text-muted-foreground">—</span>
                          <p className="text-[9px] text-muted-foreground mt-0.5">Accumulating data</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold" style={{ color: m.color }}>{val}<span className="text-sm font-normal text-muted-foreground ml-0.5">{unit}</span></span>
                            {m.key !== "mtti" && (
                              <div className="flex items-center gap-0.5 mb-0.5">
                                {delta !== 0 && (
                                  delta > 0
                                    ? <TrendingUp className={`w-3 h-3 ${isGood ? "text-green-500" : "text-red-500"}`} />
                                    : <TrendingDown className={`w-3 h-3 ${isGood ? "text-green-500" : "text-red-500"}`} />
                                )}
                                <span className={`text-[10px] ${isGood ? "text-green-500" : "text-red-500"}`}>{delta >= 0 ? "+" : ""}{pct}%</span>
                              </div>
                            )}
                          </div>
                          {m.key === "mtti" && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] text-muted-foreground">p50:{data?.p50 ?? "—"}m · p90:{data?.p90 ?? "—"}m</span>
                              {data?.peakHour && <span className="text-[9px] text-teal-500">Peak:{data.peakHour}</span>}
                            </div>
                          )}
                          {m.key !== "mtti" && <p className="text-[9px] text-muted-foreground mt-0.5">vs prior 7 days</p>}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* AI Override Rate gauge + MTTR Trend + Analyst Leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* AI Override Rate */}
              <Card className="border-border/50" data-testid="ai-override-rate-card">
                <CardHeader className="pb-0 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Override Rate</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-1">
                  {socMetricsLoading ? (
                    <Skeleton className="h-[100px] w-full" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="relative w-[90px] h-[90px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="100%"
                            startAngle={90} endAngle={-270} data={[{ name: "bg", value: 100, fill: "hsl(var(--border))" }, ...gaugeData]}>
                            <RadialBar dataKey="value" background={false} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold" style={{ color: gaugeData[0].fill }}>{ao.rate}%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <p className="text-[10px] text-muted-foreground">AI Triaged</p>
                          <p className="text-base font-semibold">{ao.total}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Analyst Overrides</p>
                          <p className="text-base font-semibold" style={{ color: ao.overridden > 0 ? C.orange : C.green }}>{ao.overridden}</p>
                        </div>
                        {/* Trend arrow vs prior 30d */}
                        {ao.prev != null && (
                          <div className="flex items-center gap-1">
                            {ao.rate > ao.prev
                              ? <TrendingUp className="w-3 h-3 text-red-500" />
                              : ao.rate < ao.prev
                              ? <TrendingDown className="w-3 h-3 text-green-500" />
                              : null}
                            <span className={`text-[9px] ${ao.rate > ao.prev ? "text-red-500" : ao.rate < ao.prev ? "text-green-500" : "text-muted-foreground"}`}>
                              {ao.rate === ao.prev ? "Stable" : `${ao.rate > ao.prev ? "+" : ""}${ao.rate - ao.prev}pp vs prior 30d`}
                            </span>
                          </div>
                        )}
                        {ao.prev == null && <p className="text-[9px] text-muted-foreground">last 30 days</p>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* MTTR 30-day trend */}
              <Card className="border-border/50" data-testid="mttr-trend-chart">
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MTTR 30-Day Trend</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 pt-0">
                  {socMetricsLoading ? (
                    <Skeleton className="h-[100px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart data={socMetrics?.trend || []} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                        <defs>
                          <linearGradient id="mttrGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C.orange} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={C.orange} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${Math.round(v)} min`, "MTTR"]} />
                        <Area type="monotone" dataKey="mttr" stroke={C.orange} strokeWidth={2} fill="url(#mttrGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Analyst Leaderboard */}
              <Card className="border-border/50" data-testid="analyst-leaderboard">
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analyst Performance (7d)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {socMetricsLoading ? (
                    <div className="p-3 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div>
                  ) : !socMetrics?.analysts?.length ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">No analyst data available</p>
                  ) : (
                    <div className="overflow-auto max-h-[130px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="text-[9px] px-3 py-1.5">Analyst</TableHead>
                            <TableHead className="text-[9px] px-3 py-1.5 text-center">Resolved</TableHead>
                            <TableHead className="text-[9px] px-3 py-1.5 text-center">MTTR</TableHead>
                            <TableHead className="text-[9px] px-3 py-1.5 text-center">TP Rate</TableHead>
                            <TableHead className="text-[9px] px-3 py-1.5 text-center">Queue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {socMetrics.analysts.slice(0, 5).map((a: any, i: number) => {
                            const tierColor = a.tier === "top" ? C.green : a.tier === "average" ? C.orange : C.red;
                            return (
                              <TableRow key={i} className="hover:bg-muted/20 border-border/30" data-testid={`analyst-row-${i}`}>
                                <TableCell className="px-3 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tierColor }} />
                                    <span className="text-[11px] font-medium truncate max-w-[100px]">{a.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center text-[11px] px-3 py-1.5">{a.incidentsResolved7d}</TableCell>
                                <TableCell className="text-center text-[11px] px-3 py-1.5">{a.avgMttr}m</TableCell>
                                <TableCell className="text-center px-3 py-1.5">
                                  <span className="text-[11px] font-medium" style={{ color: a.tpRate >= 80 ? C.green : a.tpRate >= 60 ? C.orange : C.red }}>{a.tpRate}%</span>
                                </TableCell>
                                <TableCell className="text-center text-[11px] px-3 py-1.5">{a.openQueue}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Flagged Users (bar) + Top Flagged Hosts (donut) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="border-border/50" data-testid="top-flagged-users-chart">
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Flagged Users (30d)</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 pt-0">
                  {socMetricsLoading ? (
                    <Skeleton className="h-[120px] w-full" />
                  ) : !socMetrics?.topFlaggedUsers?.length ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">No user-attributed events in last 30 days</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={socMetrics.topFlaggedUsers} layout="vertical" margin={{ top: 2, right: 20, bottom: 2, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, "Events"]} />
                        <Bar dataKey="count" fill={C.blue} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50" data-testid="top-flagged-hosts-chart">
                <CardHeader className="pb-1 px-4 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Flagged Hosts (30d)</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 pt-0">
                  {socMetricsLoading ? (
                    <Skeleton className="h-[120px] w-full" />
                  ) : !socMetrics?.topFlaggedHosts?.length ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">No host data in last 30 days</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <ResponsiveContainer width={110} height={110}>
                        <PieChart>
                          <Pie data={socMetrics.topFlaggedHosts} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={50}>
                            {socMetrics.topFlaggedHosts.map((_: any, idx: number) => (
                              <Cell key={idx} fill={[C.orange, C.red, C.purple, C.blue, C.teal][idx % 5]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [v, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1">
                        {socMetrics.topFlaggedHosts.map((h: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5" data-testid={`top-host-${idx}`}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: [C.orange, C.red, C.purple, C.blue, C.teal][idx % 5] }} />
                            <span className="text-[10px] font-mono truncate max-w-[110px]">{h.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{h.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Investigations by Status — 30-day stacked area */}
            <Card className="border-border/50" data-testid="investigations-by-status-chart">
              <CardHeader className="pb-1 px-4 pt-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Investigations by Status — 30-Day</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 pt-0">
                {socMetricsLoading ? (
                  <Skeleton className="h-[130px] w-full" />
                ) : !socMetrics?.investigationsByStatusSeries?.length ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">No incident data for last 30 days</p>
                ) : (
                  <ResponsiveContainer width="100%" height={130}>
                    <AreaChart data={socMetrics.investigationsByStatusSeries} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                      <defs>
                        {statusKeys.map((s) => (
                          <linearGradient key={s} id={`sg-${s}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={statusColors[s]} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={statusColors[s]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 9, paddingTop: 4 }} />
                      {statusKeys.map((s) => (
                        <Area key={s} type="monotone" dataKey={s} name={statusLabels[s]} stackId="1"
                          stroke={statusColors[s]} strokeWidth={1.5} fill={`url(#sg-${s})`} dot={false} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {activeTab === "overview" && currentTenant?.id && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AiLearningCard tenantId={currentTenant.id} />
        </div>
      )}

      {activeTab === "overview" && (s.totalIncidents > 0 || s.totalEvents > 0) && (() => {
        const domainConfig: { key: string; label: string; icon: any; color: string }[] = [
          { key: "Endpoint", label: "Endpoint", icon: Monitor, color: "#3b82f6" },
          { key: "DLP", label: "DLP", icon: Lock, color: "#14b8a6" },
          { key: "Email", label: "Email", icon: Mail, color: "#f59e0b" },
          { key: "Web", label: "Web", icon: Globe, color: "#06b6d4" },
          { key: "Web App", label: "Web App", icon: AppWindow, color: "#f97316" },
          { key: "Identity", label: "Identity", icon: Users, color: "#ec4899" },
          { key: "Database", label: "Database", icon: Database, color: "#8b5cf6" },
          { key: "Network", label: "Network", icon: Network, color: "#6366f1" },
        ];
        const totalEvts = Object.values(s.eventsByDomain || {}).reduce((a: number, b: number) => a + b, 0);
        const totalIncs = Object.values(s.incidentsByDomain || {}).reduce((a: number, b: number) => a + b, 0);
        return (
          <Card data-testid="card-incident-formula">
            <CardContent className="p-4">
              <Tabs defaultValue="events" data-testid="tabs-domain-breakdown">
                <div className="flex items-center gap-2 mb-3">
                  <TabsList className="h-7">
                    <TabsTrigger value="events" className="text-[10px] h-6 px-2" data-testid="tab-events-breakdown">
                      <Activity className="w-3 h-3 mr-1" />Security Events
                    </TabsTrigger>
                    <TabsTrigger value="incidents" className="text-[10px] h-6 px-2" data-testid="tab-incidents-breakdown">
                      <AlertTriangle className="w-3 h-3 mr-1" />Incidents
                    </TabsTrigger>
                  </TabsList>
                  <span className="text-[10px] text-muted-foreground ml-auto font-mono hidden sm:inline">
                    Total = {domainConfig.map(d => d.label).join(" + ")}
                  </span>
                </div>
                <TabsContent value="events" className="mt-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-[10px] font-mono">{totalEvts.toLocaleString()} events</Badge>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {domainConfig.map(d => {
                      const Ico = d.icon;
                      const count = (s.eventsByDomain || {})[d.key] || 0;
                      const tabKey = ({ "Endpoint": "endpoint", "DLP": "data_security", "Email": "email", "Web": "web", "Web App": "webapp", "Identity": "identity", "Database": "data_security", "Network": "network" } as Record<string, string>)[d.key];
                      return (
                        <div key={d.key} className="flex flex-col items-center gap-1 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          data-testid={`badge-event-domain-${d.key}`}
                          onClick={() => { if (tabKey) changeTab(tabKey); }}
                          title={`View ${d.label} tab`}>
                          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${d.color}15` }}>
                            <Ico className="w-4 h-4" style={{ color: d.color }} />
                          </div>
                          <span className="text-sm font-bold font-mono" style={{ color: d.color }}>{count.toLocaleString()}</span>
                          <span className="text-[9px] text-muted-foreground text-center leading-tight">{d.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="incidents" className="mt-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-[10px] font-mono">{totalIncs.toLocaleString()} incidents</Badge>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {domainConfig.map(d => {
                      const Ico = d.icon;
                      const count = (s.incidentsByDomain || {})[d.key] || 0;
                      const tabKey = ({ "Endpoint": "endpoint", "DLP": "data_security", "Email": "email", "Web": "web", "Web App": "webapp", "Identity": "identity", "Database": "data_security", "Network": "network" } as Record<string, string>)[d.key];
                      return (
                        <div key={d.key} className="flex flex-col items-center gap-1 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          data-testid={`badge-incident-domain-${d.key}`}
                          onClick={() => { if (tabKey) changeTab(tabKey); }}
                          title={`View ${d.label} incidents`}>
                          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${d.color}15` }}>
                            <Ico className="w-4 h-4" style={{ color: d.color }} />
                          </div>
                          <span className="text-sm font-bold font-mono" style={{ color: d.color }}>{count.toLocaleString()}</span>
                          <span className="text-[9px] text-muted-foreground text-center leading-tight">{d.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        );
      })()}

      {activeTab === "overview" && overviewMode === "executive" && cisoStats?.attackVectorRadar && (
        <AttackVectorRadar
          data={cisoStats.attackVectorRadar}
          onTabChange={(tab) => { changeTab(tab); }}
        />
      )}

      <div data-testid="dashboard-tabs">

        {activeTab === "overview" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="soc-tab-content">
          <div className="flex items-center gap-2 mb-1" data-testid="overview-mode-selector">
            {[
              { id: "executive", label: "Executive Summary" },
              { id: "ciso", label: "CISO Dashboard" },
              { id: "soc_ops", label: "SOC Operations" },
              { id: "threat_landscape", label: "Threat Landscape" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setOverviewMode(mode.id)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${overviewMode === mode.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                data-testid={`overview-mode-${mode.id}`}
              >
                {mode.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <WidgetPickerDialog dashboardMode={overviewMode} layout={widgetLayout} />
              {widgetLayout.hasCustomizations() && (
                <Button variant="ghost" size="sm" className="gap-1 text-[10px] text-muted-foreground" onClick={() => widgetLayout.resetToDefault()} data-testid="button-reset-dashboard">
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {overviewMode === "executive" && (
          <>
          {/* Quick severity cross-filter buttons — always visible */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-medium">Filter:</span>
            {(["critical","high","medium","low"] as const).map((sev) => {
              const sevColors: Record<string,string> = { critical: "border-red-500/40 text-red-400 hover:bg-red-500/15", high: "border-orange-500/40 text-orange-400 hover:bg-orange-500/15", medium: "border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/15", low: "border-green-500/40 text-green-400 hover:bg-green-500/15" };
              const isActive = execFilter?.value === sev;
              return (
                <button
                  key={sev}
                  data-testid={`filter-severity-${sev}`}
                  onClick={() => toggleExecFilter({ type: "severity", value: sev, label: `Severity: ${sev.charAt(0).toUpperCase() + sev.slice(1)}` })}
                  className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border transition-all duration-200 ${sevColors[sev]} ${isActive ? "opacity-100 ring-1 ring-current/50" : "opacity-60 hover:opacity-100"}`}
                >
                  {sev}
                </button>
              );
            })}
            {execFilter && (
              <button
                data-testid="exec-filter-clear"
                onClick={() => clearExecFilter()}
                className="px-2 py-0.5 text-[10px] text-muted-foreground border border-border/40 rounded-full hover:bg-muted/50 transition-all ml-1"
              >
                ✕ clear
              </button>
            )}
          </div>
          {execFilter && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.06] backdrop-blur-sm shadow-[0_0_12px_0_rgba(59,130,246,0.12)]"
              data-testid="exec-filter-breadcrumb"
            >
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <Shield className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span className="text-xs font-bold text-blue-300 tracking-wide">Cross-filter:</span>
              <span className="text-xs font-medium text-blue-200 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">{execFilter.label}</span>
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300" onClick={() => clearExecFilter()}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* LIVE mode streaming ticker */}
          {liveMode && (
            <Card className="relative overflow-hidden border-red-500/20 bg-red-500/[0.03] animate-card-enter">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
                  <span className="text-red-400 font-black">LIVE</span>
                  <span className="text-muted-foreground">— Real-Time Event Stream</span>
                  <span className="ml-auto text-[9px] font-mono text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded border border-border/40">5s polling</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-1">
                <LiveEventsTicker
                  events={liveEvents ?? []}
                  eventsTimeline={s.eventsTimeline}
                />
              </CardContent>
            </Card>
          )}

          {/* Globe + Heatmap cinematic row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-card-enter-1">
            {/* Threat Globe */}
            <Card data-testid="threat-globe-card" className={`relative overflow-hidden globe-card-bg animate-card-enter-1 ${liveMode ? "border-red-500/40 shadow-[0_0_16px_rgba(239,68,68,0.15)] transition-all duration-500" : "border-blue-500/15 dark:border-blue-500/10"}`}>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                  <span className="text-muted-foreground">Global Threat Activity</span>
                  <span className="ml-auto text-[9px] font-mono text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">LIVE TRACKING</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 pt-0">
                <ThreatGlobe height={180} threatStats={{ critical: s.criticalEvents ?? s.severityCounts?.critical ?? 0, high: s.severityCounts?.high ?? 0, medium: s.severityCounts?.medium ?? 0, low: s.severityCounts?.low ?? 0 }} />
                <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
                  {[
                    { label: "CRITICAL", color: "#ef4444" },
                    { label: "HIGH", color: "#f97316" },
                    { label: "MEDIUM", color: "#eab308" },
                    { label: "LOW", color: "#22c55e" },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                      <span className="text-[9px] text-muted-foreground font-mono">{label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Incident Heatmap */}
            <Card className={`relative overflow-hidden animate-card-enter-2 ${liveMode ? "border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.12)]" : "border-border/40"}`}>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <span className="text-muted-foreground">Incident Activity Heatmap</span>
                  {liveMode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />}
                  <span className="ml-auto text-[9px] font-mono text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded border border-border/40">7d × 24h</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-1">
                <IncidentHeatmap eventsTimeline={s.eventsTimeline} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <WidgetWrapper widgetId="exec_security_posture" title="Security Posture" layout={widgetLayout}>
            <Card className="lg:col-span-1 animate-card-enter-3">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Security Posture</CardTitle></CardHeader>
              <CardContent className="pt-0 flex flex-col items-center gap-4">
                <RiskGauge score={s.avgRiskScore} label="Overall Risk Score" size={140} />
                <RiskGauge score={s.complianceScore} label="Compliance Score" size={140} />
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  {([
                    { key: "critical" as const, label: "Critical", bg: "bg-red-500/10", hover: "hover:bg-red-500/20", ring: "ring-red-500/50", text: "text-red-500", value: s.criticalEvents ?? s.severityCounts?.critical ?? 0 },
                    { key: "high" as const, label: "High", bg: "bg-orange-500/10", hover: "hover:bg-orange-500/20", ring: "ring-orange-500/50", text: "text-orange-500", value: s.severityCounts?.high ?? 0 },
                    { key: "medium" as const, label: "Medium", bg: "bg-yellow-500/10", hover: "hover:bg-yellow-500/20", ring: "ring-yellow-500/50", text: "text-yellow-500", value: s.severityCounts?.medium ?? 0 },
                    { key: "low" as const, label: "Low", bg: "bg-green-500/10", hover: "hover:bg-green-500/20", ring: "ring-green-500/50", text: "text-green-500", value: s.severityCounts?.low ?? 0 },
                  ]).map(({ key, label, bg, hover, ring, text, value }) => (
                    <div
                      key={key}
                      className={`p-2 rounded-md ${bg} text-center cursor-pointer transition-all ${hover} ${execFilter?.value === key ? `ring-1 ${ring}` : ""}`}
                      style={{ opacity: dimOpacity("severity", key) }}
                      onClick={() => toggleExecFilter({ type: "severity", value: key, label: `Severity: ${label}` })}
                      data-testid={`posture-${key}-tile`}
                      title={`Click to filter by ${label}`}
                    >
                      <p className={`text-base font-bold ${text}`}>{typeof value === "number" ? value.toLocaleString() : 0}</p>
                      <p className="text-[9px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="p-2 rounded-md bg-green-500/5 text-center border border-green-500/10 mt-1">
                  <p className="text-base font-bold text-green-400">{(s.allEventRemediation?.remediated || s.remediatedCount || 0).toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">Remediated</p>
                </div>
              </CardContent>
            </Card>
            </WidgetWrapper>

            <WidgetWrapper widgetId="exec_incident_trend" title="Incident Trend" layout={widgetLayout} className="lg:col-span-3">
            <ExpandableCard title="Incident Trend" className={`lg:col-span-3 animate-card-enter-4 ${liveMode ? "border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.1)]" : ""}`}
              headerExtra={
                <div className="flex items-center gap-2">
                  {execFilter?.type === "severity" && (
                    <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/25">
                      filtered: {execFilter.value}
                    </span>
                  )}
                  <ChartTypeSelector active={ct("incidentTrend", "area")} onChange={(v) => setCt("incidentTrend", v)} />
                </div>
              }>
              <FlexChart
                data={s.incidentTrend?.filter((d: any) => {
                  if (!execFilter?.type || execFilter.type !== "severity") return true;
                  const v = execFilter.value;
                  if (v === "critical") return (d.critical ?? 0) > 0;
                  if (v === "high") return (d.high ?? 0) > 0;
                  if (v === "medium") return (d.medium ?? 0) > 0;
                  if (v === "low") return (d.low ?? 0) > 0;
                  return true;
                })}
                chartType={ct("incidentTrend", "area")}
                nameKey="month"
                dataKey="incidents"
                height={280}
                showBrush
                onItemClick={(item) => {
                  const sev = item?.severity || item?.name?.toLowerCase();
                  if (sev && ["critical","high","medium","low"].includes(sev)) {
                    toggleExecFilter({ type: "severity", value: sev, label: `Severity: ${sev.charAt(0).toUpperCase() + sev.slice(1)}` });
                  }
                }}
                series={[
                  { dataKey: "incidents", name: "Incidents", color: C.red, gradientId: "gInc", opacity: execFilter?.type === "severity" && execFilter.value !== "critical" ? 0.35 : 1 },
                  { dataKey: "resolved", name: "Resolved", color: C.green, gradientId: "gRes", opacity: execFilter?.type === "severity" ? 0.35 : 1 },
                ]}
              />
            </ExpandableCard>
            </WidgetWrapper>

          </div>

          <WidgetWrapper widgetId="exec_events_timeline" title="Events Timeline" layout={widgetLayout}>
          {s.eventsTimeline && s.eventsTimeline.length > 0 && (
            <Card data-testid="events-timeline-chart" className={liveMode ? "border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.12)] transition-all duration-500" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  Events Timeline
                  {liveMode && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Event volume by severity over time</p>
              </CardHeader>
              <CardContent className="pt-0">
                {(() => {
                  const timelineData = s.eventsTimeline.map((d: any) => ({
                    ...d,
                    label: (() => {
                      try {
                        const dt = new Date(d.time);
                        return fmt.formatChartLabel(dt, timeRange);
                      } catch { return d.time; }
                    })(),
                  }));
                  const showTimelineBrush = timelineData.length > 8;
                  return (
                    <ResponsiveContainer width="100%" height={showTimelineBrush ? 310 : 260}>
                      <AreaChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip content={<RichTooltipContent />} />
                        <Area type="monotone" dataKey="critical" stackId="1" stroke={SEV.critical} fill={SEV.critical} fillOpacity={0.6} name="Critical"
                          opacity={dimOpacity("severity", "critical")}
                          onClick={() => toggleExecFilter({ type: "severity", value: "critical", label: "Severity: Critical" })} style={{ cursor: "pointer" }} />
                        <Area type="monotone" dataKey="high" stackId="1" stroke={SEV.high} fill={SEV.high} fillOpacity={0.5} name="High"
                          opacity={dimOpacity("severity", "high")}
                          onClick={() => toggleExecFilter({ type: "severity", value: "high", label: "Severity: High" })} style={{ cursor: "pointer" }} />
                        <Area type="monotone" dataKey="medium" stackId="1" stroke={SEV.medium} fill={SEV.medium} fillOpacity={0.4} name="Medium"
                          opacity={dimOpacity("severity", "medium")}
                          onClick={() => toggleExecFilter({ type: "severity", value: "medium", label: "Severity: Medium" })} style={{ cursor: "pointer" }} />
                        <Area type="monotone" dataKey="low" stackId="1" stroke={SEV.low} fill={SEV.low} fillOpacity={0.3} name="Low"
                          opacity={dimOpacity("severity", "low")}
                          onClick={() => toggleExecFilter({ type: "severity", value: "low", label: "Severity: Low" })} style={{ cursor: "pointer" }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", cursor: "pointer" }}
                          onClick={(e: any) => {
                            const val = e?.value?.toLowerCase();
                            if (val) toggleExecFilter({ type: "severity", value: val, label: `Severity: ${e.value}` });
                          }}
                          formatter={(v) => <span className={`capitalize text-[10px] cursor-pointer ${execFilter?.type === "severity" && execFilter.value !== String(v).toLowerCase() ? "opacity-40" : ""}`}>{typeof v === "object" ? String(v) : v}</span>} />
                        {showTimelineBrush && (
                          <Brush dataKey="label" height={20} stroke="hsl(var(--primary))" fill="hsl(var(--muted))" travellerWidth={8} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          )}
          </WidgetWrapper>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WidgetWrapper widgetId="exec_new_alerts" title="New Alerts" layout={widgetLayout}>
            <Card style={{ opacity: execFilter ? 0.65 : 1, transition: "opacity 0.25s ease" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">New Alerts</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Today", value: s.newAlerts?.today || 0, change: s.newAlerts?.todayChange },
                    { label: "This Week", value: s.newAlerts?.thisWeek || 0, change: s.newAlerts?.weekChange },
                    { label: "This Month", value: s.newAlerts?.thisMonth || 0, change: s.newAlerts?.monthChange },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-2xl font-bold">{item.value.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
                      {item.change !== undefined && item.change !== 0 && (
                        <div className="flex items-center justify-center gap-0.5 mt-1">
                          {item.change > 0 ? <TrendingUp className="w-3 h-3 text-red-500" /> : <TrendingDown className="w-3 h-3 text-green-500" />}
                          <span className={`text-[9px] ${item.change > 0 ? "text-red-500" : "text-green-500"}`}>{item.change > 0 ? "+" : ""}{item.change}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </WidgetWrapper>

            <WidgetWrapper widgetId="exec_recent_incidents" title="Recent Incidents" layout={widgetLayout}>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Recent Incidents</CardTitle>
                <a href="/events?domain=overview" className="text-[10px] text-primary flex items-center gap-0.5" data-testid="link-view-all-incidents">View All <ArrowUpRight className="w-3 h-3" /></a>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {s.recentIncidents.slice(0, 5).map((inc: any) => {
                    const d = new Date(inc.createdAt);
                    const now = new Date();
                    const diffMs = now.getTime() - d.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHrs = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);
                    const timeAgo = diffMins < 60 ? `${diffMins}m ago` : diffHrs < 24 ? `${diffHrs}h ago` : `${diffDays}d ago`;
                    const incOpacity = execFilter?.type === "severity" ? (inc.severity?.toLowerCase() === execFilter.value ? 1 : 0.3) : 1;
                    return (
                      <a key={inc.id} href={`/events?domain=overview&incidentId=${inc.id}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30 border-l-2 cursor-pointer hover:bg-muted/50 transition-all no-underline" style={{ borderLeftColor: SEV[inc.severity] || C.blue, opacity: incOpacity, transition: "opacity 0.25s ease" }} data-testid={`exec-incident-${inc.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: SEV[inc.severity] }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium truncate">{inc.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[9px] h-4 px-1" style={{ borderColor: SEV[inc.severity], color: SEV[inc.severity] }}>{inc.severity}</Badge>
                              <span className="text-[9px] text-muted-foreground">{timeAgo}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant={inc.status === "open" ? "destructive" : "secondary"} className="text-[9px] shrink-0">{inc.status}</Badge>
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            </WidgetWrapper>
            <WidgetWrapper widgetId="exec_threat_map" title="Global Threat Map" layout={widgetLayout} className="lg:col-span-2">
              <ThreatMapMini height={300} />
            </WidgetWrapper>
          </div>

          </>
          )}

          {overviewMode === "ciso" && (
          <>
          {cisoFilter && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30" data-testid="ciso-filter-breadcrumb">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Active Filter:</span>
              <Badge variant="secondary" className="text-[10px]">{cisoFilter.label}</Badge>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => setCisoFilter(null)} data-testid="ciso-filter-clear">
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          <WidgetWrapper widgetId="ciso_risk_gauges" title="CISO KPI Metrics" layout={widgetLayout}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard title="Total Assets" value={cisoStats?.attackSurface?.total_assets || 0} icon={Monitor} color="#3b82f6" data-testid="metric-ciso-assets" />
            <MetricCard title="Active Threats" value={cisoStats?.kris?.incidents7d || 0} sub="Last 7 days" icon={AlertTriangle} color="#ef4444" data-testid="metric-ciso-threats" />
            <MetricCard title="Unresolved Critical" value={cisoStats?.kris?.unresolvedCritical || 0} icon={ShieldAlert} color="#dc2626" data-testid="metric-ciso-critical" />
            <MetricCard title="Security Tools" value={securityCoverage?.totalTools || 0} icon={ShieldCheck} color="#22c55e" data-testid="metric-ciso-tools" />
            <MetricCard title="Avg Risk Score" value={parseFloat(cisoStats?.attackSurface?.avg_risk_score || 0).toFixed(1)} icon={Target} color="#f59e0b" data-testid="metric-ciso-risk" />
            <MetricCard title="Avg Response" value={`${(cisoStats?.kris?.avgResponseHours || 0).toFixed(0)}h`} sub="Mean Time" icon={Clock} color="#8b5cf6" data-testid="metric-ciso-mttr" />
          </div>
          </WidgetWrapper>

          {/* Executive Intelligence Briefing — directly after CISO KPI strip */}
          <WidgetWrapper widgetId="ciso_exec_briefing" title="Executive Intelligence Briefing" layout={widgetLayout}>
          <div data-testid="ciso-exec-briefing-section">
            <ExecutiveBriefing
              data={briefingData}
              loading={briefingLoading}
              onRefresh={() => setBriefingRefreshKey(k => k + 1)}
              timeRange={timeRange}
              tenantId={currentTenant?.id}
            />
          </div>
          </WidgetWrapper>

          <div>
            <WidgetWrapper widgetId="ciso_compliance_radar" title="NIST CSF Coverage" layout={widgetLayout}>
            <Card data-testid="ciso-nist-radar" className={cisoFilter && cisoFilter.type !== 'nist' ? 'border-blue-200 dark:border-blue-800' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <Shield className="w-4 h-4 text-blue-500" />
                  NIST CSF 2.0 Security Coverage
                  {cisoFilter && cisoFilter.type !== 'nist' && <Badge variant="secondary" className="text-[8px] ml-1">Filtered</Badge>}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">NIST CSF Engine — event-based tool detection mapping, optionally merged with saved control assessment</p>
              </CardHeader>
              <CardContent className="pt-0">
                {cisoStats?.nistCoverage && Object.keys(cisoStats.nistCoverage).length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Radar chart */}
                    <div>
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={Object.entries(cisoStats.nistCoverage).map(([fn, info]: [string, any]) => ({ function: fn, score: info.score, fullMark: 100 }))}>
                          <PolarGrid strokeDasharray="3 3" />
                          <PolarAngleAxis dataKey="function" tick={{ fontSize: 10, fill: "currentColor" }} onClick={(e: any) => { if (e?.value) setCisoFilter({ type: 'nist', value: e.value, label: `NIST: ${e.value}` }); }} style={{ cursor: 'pointer' }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                          <RechartsRadar name="Coverage" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} />
                          <Tooltip formatter={(v: any) => [`${v}%`, "Coverage"]} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Right: Per-function detail cards */}
                    <div className="grid grid-cols-2 gap-2 content-start">
                      {Object.entries(cisoStats.nistCoverage).map(([fn, info]: [string, any]) => {
                        const scoreColor = info.score >= 70 ? "text-green-600 dark:text-green-400" : info.score >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
                        const borderColor = info.score >= 70 ? "border-green-500/30" : info.score >= 40 ? "border-yellow-500/30" : "border-red-500/30";
                        const bgColor = info.score >= 70 ? "bg-green-500/5" : info.score >= 40 ? "bg-yellow-500/5" : "bg-red-500/5";
                        const isActive = cisoFilter?.type === 'nist' && cisoFilter?.value === fn;
                        const toolDetails = info.toolDetails || [];
                        return (
                          <div key={fn} className={`group relative p-3 rounded-lg border ${borderColor} ${bgColor} cursor-pointer hover:shadow-md transition-all ${isActive ? 'ring-2 ring-blue-500' : ''}`}
                            onClick={() => setCisoFilter({ type: 'nist', value: fn, label: `NIST: ${fn}` })}
                            data-testid={`nist-function-${fn.toLowerCase()}`}>
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <p className="text-[10px] font-semibold leading-tight">{fn}</p>
                              <p className={`text-sm font-bold shrink-0 ${scoreColor}`}>{info.score}%</p>
                            </div>
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-1.5">
                              <div className="h-full rounded-full transition-all" style={{ width: `${info.score}%`, background: info.score >= 70 ? "#22c55e" : info.score >= 40 ? "#eab308" : "#ef4444" }} />
                            </div>
                            <p className="text-[9px] text-muted-foreground">{info.tools?.length || 0} tool{(info.tools?.length || 0) !== 1 ? "s" : ""} contributing</p>
                            {toolDetails.length > 0 && (
                              <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block w-60 p-2 rounded-md shadow-lg border bg-popover text-popover-foreground text-left">
                                <p className="text-[9px] font-bold mb-1 border-b pb-1">{fn} — Contributing Tools</p>
                                {toolDetails.map((td: any, i: number) => (
                                  <div key={i} className="text-[8px] py-0.5 border-b last:border-0 border-dashed">
                                    <span className="font-semibold">{td.name}</span>
                                    <span className="text-muted-foreground ml-1">({td.weight}%)</span>
                                    <p className="text-muted-foreground">{td.reason}</p>
                                    <p className="text-blue-500 text-[7px]">via {td.source}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : !cisoStats ? (
                  <Skeleton className="h-64" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <Shield className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground font-medium">NIST CSF coverage data not yet available</p>
                    <p className="text-xs text-muted-foreground/70">Security events will be mapped to framework functions as data is ingested and tools are configured.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            </WidgetWrapper>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WidgetWrapper widgetId="ciso_coverage_matrix" title="Threat Vector Distribution" layout={widgetLayout}>
            <Card data-testid="ciso-threat-vectors" className={cisoFilter && cisoFilter.type !== 'threat_vector' ? 'border-blue-200 dark:border-blue-800' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <Crosshair className="w-4 h-4 text-red-500" />
                  Threat Vector Distribution
                  {cisoFilter && cisoFilter.type !== 'threat_vector' && <Badge variant="secondary" className="text-[8px] ml-1">Filtered</Badge>}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Attack vectors by event volume and severity</p>
              </CardHeader>
              <CardContent className="pt-0">
                {cisoStats?.threatVectors?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={cisoFilter?.type === 'threat_vector' ? cisoStats.threatVectors.filter((v: any) => v.vector === cisoFilter.value) : cisoStats.threatVectors} layout="vertical" margin={{ left: 70, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="vector" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={<RichTooltipContent />} />
                      <Bar dataKey="count" name="Total Events" fill="#3b82f6" radius={[0, 4, 4, 0]} cursor="pointer"
                        onClick={(data: any) => { if (data?.vector) setCisoFilter({ type: 'threat_vector', value: data.vector, label: `Threat: ${data.vector}` }); }} />
                      <Bar dataKey="criticalCount" name="Critical/High" fill="#ef4444" radius={[0, 4, 4, 0]} cursor="pointer"
                        onClick={(data: any) => { if (data?.vector) setCisoFilter({ type: 'threat_vector', value: data.vector, label: `Threat: ${data.vector}` }); }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Skeleton className="h-64" />}
              </CardContent>
            </Card>
            </WidgetWrapper>

            <WidgetWrapper widgetId="ciso_sla_compliance" title="MITRE ATT&CK Heatmap" layout={widgetLayout}>
            <Card data-testid="ciso-mitre-heatmap" className={cisoFilter && cisoFilter.type !== 'mitre_tactic' ? 'border-blue-200 dark:border-blue-800' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <Target className="w-4 h-4 text-purple-500" />
                  MITRE ATT&CK Tactic Heatmap
                  {cisoFilter && cisoFilter.type !== 'mitre_tactic' && <Badge variant="secondary" className="text-[8px] ml-1">Filtered</Badge>}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Event distribution across MITRE ATT&CK tactics</p>
              </CardHeader>
              <CardContent className="pt-0">
                {cisoStats?.mitreTactics?.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {(cisoFilter?.type === 'mitre_tactic' ? cisoStats.mitreTactics.filter((t: any) => t.tactic === cisoFilter.value) : cisoStats.mitreTactics).map((t: any) => {
                      const maxCount = Math.max(...cisoStats.mitreTactics.map((x: any) => x.count));
                      const intensity = Math.max(0.15, t.count / maxCount);
                      const critRatio = t.count > 0 ? t.criticalCount / t.count : 0;
                      const bgColor = critRatio > 0.3 ? `rgba(239,68,68,${intensity})` : `rgba(59,130,246,${intensity})`;
                      const isActive = cisoFilter?.type === 'mitre_tactic' && cisoFilter?.value === t.tactic;
                      return (
                        <div key={t.tactic}
                          className={`p-2 rounded-lg border cursor-pointer hover:shadow-md transition-all ${isActive ? 'ring-2 ring-blue-500' : ''}`}
                          style={{ backgroundColor: bgColor }}
                          onClick={() => setCisoFilter({ type: 'mitre_tactic', value: t.tactic, label: `MITRE: ${t.tactic}` })}
                          onDoubleClick={() => openDrilldown('mitre_tactic', t.tactic, `MITRE: ${t.tactic}`)}
                          data-testid={`mitre-tactic-${t.tactic.replace(/\s+/g,'-').toLowerCase()}`}>
                          <p className="text-[9px] font-semibold truncate">{t.tactic}</p>
                          <p className="text-lg font-bold">{t.count.toLocaleString()}</p>
                          <p className="text-[8px] text-muted-foreground">{t.criticalCount} critical/high</p>
                        </div>
                      );
                    })}
                  </div>
                ) : <Skeleton className="h-48" />}
              </CardContent>
            </Card>
            </WidgetWrapper>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card data-testid="ciso-top-attackers" className={cisoFilter ? 'border-blue-200 dark:border-blue-800' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <Skull className="w-4 h-4 text-red-500" />
                  Top Threat Actors / Attackers
                  {cisoFilter && <Badge variant="secondary" className="text-[8px] ml-1">Filtered</Badge>}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Most active attack sources by event volume</p>
              </CardHeader>
              <CardContent className="pt-0">
                {cisoStats?.topAttackers?.length > 0 ? (
                  <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
                    {cisoStats.topAttackers.slice(0, 15).map((a: any, i: number) => {
                      const maxCount = cisoStats.topAttackers[0]?.count || 1;
                      const pct = (a.count / maxCount) * 100;
                      return (
                        <div key={i} className="group hover:bg-muted/40 rounded-md p-1.5 transition-colors cursor-pointer" data-testid={`attacker-row-${i}`}
                          onClick={() => setCisoFilter({ type: 'attacker', value: a.attacker, label: `Attacker: ${a.attacker}` })}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium truncate max-w-[180px]">{a.attacker}</span>
                            <div className="flex items-center gap-1.5">
                              {a.critical > 0 && <Badge variant="destructive" className="text-[8px] px-1 py-0">{a.critical} crit</Badge>}
                              {a.high > 0 && <Badge className="text-[8px] px-1 py-0 bg-orange-500">{a.high} high</Badge>}
                              <span className="text-xs font-mono font-semibold">{a.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-muted/50 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all bg-gradient-to-r from-red-500 to-orange-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <Skeleton className="h-48" />}
              </CardContent>
            </Card>

            {securityCoverage && (
            <Card data-testid="ciso-security-coverage" className={`${cisoFilter && cisoFilter.type !== 'coverage_domain' ? 'border-blue-200 dark:border-blue-800' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  Security Coverage Score
                  {cisoFilter && cisoFilter.type !== 'coverage_domain' && <Badge variant="secondary" className="text-[8px] ml-1">Filtered</Badge>}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">{securityCoverage.totalTools} security tools across {Object.keys(securityCoverage.coverageByDomain || {}).length} domains</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col items-center mb-4">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Covered', value: securityCoverage.overallScore || 0 },
                          { name: 'Gap', value: 100 - (securityCoverage.overallScore || 0) },
                        ]}
                        cx="50%" cy="50%" innerRadius={55} outerRadius={75} startAngle={90} endAngle={-270}
                        paddingAngle={2} dataKey="value" animationDuration={800}>
                        <Cell fill="#22c55e" />
                        <Cell fill="hsl(var(--muted))" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-[108px] mb-[40px]">
                    <p className="text-3xl font-bold" style={{ color: (securityCoverage.overallScore || 0) >= 70 ? '#22c55e' : (securityCoverage.overallScore || 0) >= 40 ? '#f59e0b' : '#ef4444' }}>
                      {securityCoverage.overallScore}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">Overall Score</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(securityCoverage.coverageByDomain || {}).map(([domain, info]: [string, any]) => {
                    const pct = info.percent || 0;
                    const barColor = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
                    const hasCoverage = info.tools?.length > 0;
                    const isActive = cisoFilter?.type === 'coverage_domain' && cisoFilter?.value === domain;
                    return (
                      <div key={domain}
                        className={`flex items-center gap-2 cursor-pointer rounded-md p-1 -mx-1 hover:bg-muted/40 transition-colors ${isActive ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''}`}
                        onClick={() => setCisoFilter({ type: 'coverage_domain', value: domain, label: `Domain: ${domain}` })}
                        data-testid={`coverage-domain-${domain.replace(/\s+/g,'-').toLowerCase()}`}>
                        <span className="text-[9px] w-28 truncate font-medium">{domain}</span>
                        <div className="flex-1 bg-muted/50 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full transition-all animate-gauge-fill" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                        </div>
                        <span className="text-[9px] font-mono w-8 text-right font-semibold" style={{ color: barColor }}>{pct}%</span>
                        {!hasCoverage && <Badge variant="destructive" className="text-[7px] px-1 py-0 shrink-0">No Coverage</Badge>}
                        {hasCoverage && <span className="text-[8px] text-muted-foreground w-16 truncate shrink-0">{info.tools?.[0]}</span>}
                      </div>
                    );
                  })}
                </div>
                {securityCoverage.gaps?.length > 0 && (
                  <div className="mt-4 p-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                    <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {securityCoverage.gaps.length} Coverage Gap{securityCoverage.gaps.length > 1 ? 's' : ''} Detected
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {securityCoverage.gaps.map((g: string, i: number) => (
                        <Badge key={i} variant="destructive" className="text-[8px]">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </div>
          </>
          )}

          {overviewMode === "soc_ops" && (
          <>
          {socFilter && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30" data-testid="soc-filter-breadcrumb">
              <Shield className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Cross-filter active: {socFilter.label}</span>
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => setSocFilter(null)} data-testid="soc-filter-clear">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <WidgetWrapper widgetId="soc_severity_heatmap" title="Severity by Domain" layout={widgetLayout}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                Severity Distribution by Security Domain
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">Events and incidents classified across security domains</p>
            </CardHeader>
            <CardContent className="pt-0">
              {s.sevHeatmapByControl.length > 0 ? (
                <div className="overflow-x-auto" data-testid="severity-heatmap-by-control">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Security Domain</th>
                        <th className="text-center py-2 px-3 font-semibold text-red-500">Critical</th>
                        <th className="text-center py-2 px-3 font-semibold text-orange-500">High</th>
                        <th className="text-center py-2 px-3 font-semibold text-blue-500">Medium</th>
                        <th className="text-center py-2 px-3 font-semibold text-green-500">Low</th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Info</th>
                        <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.sevHeatmapByControl.map((row: any) => {
                        const domainIcons: Record<string, any> = {
                          "Endpoint": Monitor, "Email": Mail, "Network": Network, "Web": Globe,
                          "Cloud": Cloud, "Identity": Users, "Data": Database, "Web App": AppWindow,
                        };
                        const domainColors: Record<string, string> = {
                          "Endpoint": "#3b82f6", "Email": "#f59e0b", "Network": "#8b5cf6", "Web": "#06b6d4",
                          "Cloud": "#6366f1", "Identity": "#ec4899", "Data": "#14b8a6", "Web App": "#f97316",
                        };
                        const Ico = domainIcons[row.type] || Shield;
                        const color = domainColors[row.type] || "#6b7280";
                        const total = (row.critical || 0) + (row.high || 0) + (row.medium || 0) + (row.low || 0) + (row.info || 0);
                        return (
                          <tr key={row.type} className={`border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${socFilter?.type === "domain" && socFilter.value !== row.type ? "opacity-40" : ""}`} data-testid={`sev-heatmap-row-${row.type}`}
                            onClick={() => {
                              if (socFilter?.type === "domain" && socFilter.value === row.type) {
                                setSocFilter(null);
                              } else {
                                setSocFilter({ type: "domain", value: row.type, label: `Domain: ${row.type}` });
                                openDrilldown("event_type", row.type, `Security Domain: ${row.type}`);
                              }
                            }}>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                                  <Ico className="w-3.5 h-3.5" style={{ color }} />
                                </div>
                                <span className="font-semibold text-[11px]">{row.type}</span>
                              </div>
                            </td>
                            {["critical", "high", "medium", "low", "info"].map(sev => {
                              const val = row[sev] || 0;
                              const globalMax = Math.max(...s.sevHeatmapByControl.map((r: any) => r[sev] || 0), 1);
                              const intensity = val / globalMax;
                              const bg = sev === "critical" ? `rgba(239,68,68,${intensity * 0.45})`
                                : sev === "high" ? `rgba(249,115,22,${intensity * 0.45})`
                                : sev === "medium" ? `rgba(59,130,246,${intensity * 0.4})`
                                : sev === "low" ? `rgba(34,197,94,${intensity * 0.4})`
                                : `rgba(156,163,175,${intensity * 0.3})`;
                              return (
                                <td key={sev} className="text-center py-2.5 px-3" style={{ backgroundColor: val > 0 ? bg : "transparent" }}>
                                  <span className="font-semibold">{val > 0 ? val.toLocaleString() : "—"}</span>
                                </td>
                              );
                            })}
                            <td className="text-center py-2.5 px-3 font-bold" style={{ color }}>{total.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
            </CardContent>
          </Card>
          </WidgetWrapper>

          {/* ── Severity Trend + Distribution (SOC Ops continued) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WidgetWrapper widgetId="soc_severity_trend" title="Severity Trend" layout={widgetLayout} className="md:col-span-2">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Severity Trend</CardTitle>
                <ChartTypeSelector active={ct("overviewSevTrend", "area")} onChange={(v) => setCt("overviewSevTrend", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.overviewSevTrend}
                  chartType={ct("overviewSevTrend", "area")}
                  nameKey="month"
                  height={250}
                  showBrush
                  series={(() => {
                    const sev = socFilter?.type === "severity" ? socFilter.value?.toLowerCase() : null;
                    return [
                      { dataKey: "critical", name: "Critical", color: C.red, opacity: sev && sev !== "critical" ? 0.2 : 1 },
                      { dataKey: "high", name: "High", color: C.orange, opacity: sev && sev !== "high" ? 0.2 : 1 },
                      { dataKey: "medium", name: "Medium", color: C.blue, opacity: sev && sev !== "medium" ? 0.2 : 1 },
                      { dataKey: "low", name: "Low", color: C.green, opacity: sev && sev !== "low" ? 0.2 : 1 },
                    ];
                  })()}
                />
              </CardContent>
            </Card>
            </WidgetWrapper>
            <WidgetWrapper widgetId="soc_severity_dist" title="Event Severity Distribution" layout={widgetLayout} className="md:col-span-2">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Event Severity Distribution</CardTitle>
                <ChartTypeSelector active={ct("overviewSevDist", "bar")} onChange={(v) => setCt("overviewSevDist", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.eventsBySeverity}
                  chartType={ct("overviewSevDist", "bar")}
                  dataKey="value"
                  height={250}
                  colors={SEV}
                  activeFilter={socFilter?.type === "severity" ? socFilter.value : null}
                  onItemClick={(item) => {
                    const val = item.name || item.severity;
                    if (socFilter?.type === "severity" && socFilter.value === val) {
                      setSocFilter(null);
                    } else {
                      setSocFilter({ type: "severity", value: val, label: `Severity: ${val}` });
                      openDrilldown("severity", val, `Severity: ${val}`);
                    }
                  }}
                />
              </CardContent>
            </Card>
            </WidgetWrapper>
          </div>

          <WidgetWrapper widgetId="soc_log_metrics" title="Log & Event Metrics" layout={widgetLayout}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard title="Total Events" value={s.totalEvents} icon={Database} color={C.blue} />
              <MetricCard title="Log Sources" value={(s.topLogSources || []).length} icon={Server} color={C.green} />
              <MetricCard title="Source Types" value={(s.sourceTypes || []).length} icon={Wifi} color={C.purple} />
              <MetricCard title="Avg EPS" value={Math.round(s.totalEvents / 120 * 10) / 10} sub="events/sec" icon={Activity} color={C.orange} />
            </div>
            {/* Alert Velocity Indicator */}
            <Card data-testid="soc-alert-velocity" className="border border-orange-500/20 bg-orange-500/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Alert Velocity</span>
                  <span className="ml-auto text-[9px] text-muted-foreground">Real-time ingestion rate</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Today", value: s.newAlerts?.today || 0, change: s.newAlerts?.todayChange, color: (s.newAlerts?.todayChange || 0) > 20 ? "#ef4444" : (s.newAlerts?.todayChange || 0) > 5 ? "#f59e0b" : "#22c55e" },
                    { label: "This Week", value: s.newAlerts?.thisWeek || 0, change: s.newAlerts?.weekChange, color: (s.newAlerts?.weekChange || 0) > 20 ? "#ef4444" : (s.newAlerts?.weekChange || 0) > 5 ? "#f59e0b" : "#22c55e" },
                    { label: "This Month", value: s.newAlerts?.thisMonth || 0, change: s.newAlerts?.monthChange, color: (s.newAlerts?.monthChange || 0) > 20 ? "#ef4444" : (s.newAlerts?.monthChange || 0) > 5 ? "#f59e0b" : "#22c55e" },
                  ].map(item => (
                    <div key={item.label} className="text-center p-2 rounded-md bg-card border">
                      <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>{item.value.toLocaleString()}</div>
                      <div className="text-[9px] text-muted-foreground">{item.label}</div>
                      {item.change !== undefined && item.change !== 0 && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                          {item.change > 0
                            ? <TrendingUp className="w-2.5 h-2.5 text-red-500" />
                            : <TrendingDown className="w-2.5 h-2.5 text-green-500" />}
                          <span className={`text-[8px] ${item.change > 0 ? "text-red-500" : "text-green-500"}`}>
                            {item.change > 0 ? "+" : ""}{item.change}%
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          </WidgetWrapper>
          </>
          )}

          {overviewMode === "threat_landscape" && (
          <>
          <WidgetWrapper widgetId="threat_mitre_matrix" title="MITRE ATT&CK Tactics" layout={widgetLayout}>
          <Card data-testid="mitre-matrix-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    MITRE ATT&CK Tactics
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-1">Triggered tactics and techniques based on security incidents</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {s.mitreMatrix?.filter((t: any) => t.totalCount > 0).length || 0} / {s.mitreMatrix?.length || 12} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${s.mitreMatrix?.length || 12}, minmax(110px, 1fr))`, minWidth: "1200px" }}>
                  {(s.mitreMatrix || []).map((col: any) => {
                    const hasData = col.totalCount > 0;
                    const bgColor = hasData
                      ? col.totalCount >= 50 ? "bg-red-500/20 dark:bg-red-500/30" 
                      : col.totalCount >= 20 ? "bg-orange-500/15 dark:bg-orange-500/25" 
                      : col.totalCount >= 5 ? "bg-yellow-500/10 dark:bg-yellow-500/20" 
                      : "bg-green-500/10 dark:bg-green-500/15"
                      : "bg-muted/30";
                    return (
                      <div key={col.tactic} className="border-r last:border-r-0 border-border" data-testid={`mitre-tactic-${col.tactic}`}>
                        <div
                          className={`p-2 text-center border-b border-border ${bgColor} ${hasData ? "cursor-pointer hover:ring-2 hover:ring-primary/40 hover:brightness-110 transition-all" : ""}`}
                          onClick={() => hasData && openDrilldown("mitre_tactic", col.tactic, `MITRE Tactic: ${col.tactic}`)}
                          data-testid={`mitre-tactic-click-${col.tactic}`}
                        >
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground truncate" title={col.tactic}>{col.tactic}</p>
                          <p className="text-2xl font-bold mt-1" style={{ color: hasData ? (col.totalCount >= 50 ? C.red : col.totalCount >= 20 ? C.orange : col.totalCount >= 5 ? C.yellow : C.green) : "hsl(var(--muted-foreground))" }}>
                            {col.totalCount}
                          </p>
                          {col.change !== 0 ? (
                            <div className="flex items-center justify-center gap-0.5 mt-1">
                              {col.change > 0 ? (
                                <TrendingUp className="w-3 h-3 text-red-500" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-green-500" />
                              )}
                              <span className={`text-[9px] font-medium ${col.change > 0 ? "text-red-500" : "text-green-500"}`}>
                                {col.change > 0 ? "+" : ""}{col.change} vs prev month
                              </span>
                            </div>
                          ) : (
                            <p className="text-[9px] text-muted-foreground mt-1">No change</p>
                          )}
                          {hasData && <p className="text-[8px] text-primary mt-1 underline">Click to drill down</p>}
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                          {col.techniques.length > 0 ? col.techniques.map((tech: any) => (
                            <div
                              key={tech.name}
                              className={`px-2 py-1.5 border-b last:border-b-0 border-border/50 text-[10px] transition-colors ${
                                tech.count > 0 ? "bg-amber-500/10 dark:bg-amber-500/15 hover:bg-amber-500/20 cursor-pointer" : "hover:bg-muted/50"
                              }`}
                              data-testid={`mitre-technique-${tech.name}`}
                              onClick={() => tech.count > 0 && openDrilldown("mitre_technique", tech.name, `MITRE Technique: ${tech.name}`)}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className={`truncate ${tech.count > 0 ? "font-medium" : "text-muted-foreground"}`} title={tech.name}>
                                  {tech.name}
                                </span>
                                {tech.count > 0 && (
                                  <Badge variant="secondary" className="text-[8px] px-1 py-0 h-4 shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                    {tech.count}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )) : (
                            <div className="px-2 py-3 text-[10px] text-muted-foreground text-center italic">
                              No techniques detected
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
          </WidgetWrapper>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="threat-landscape-radar-killchain-row">
          <WidgetWrapper widgetId="threat_kill_chain" title="Cyber Kill Chain" layout={widgetLayout}>
          <Card data-testid="killchain-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-purple-500" />
                    Lockheed Martin Cyber Kill Chain
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-1">Attack progression through 7 phases with month-over-month comparison</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {(s.killChainFull || []).filter((p: any) => p.value > 0).length} / 7 Phases Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const phases = s.killChainFull?.length > 0 ? s.killChainFull : [
                  { name: "Reconnaissance", key: "reconnaissance", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Weaponization", key: "weaponization", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Delivery", key: "delivery", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Exploitation", key: "exploitation", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Installation", key: "installation", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Command & Control", key: "command_and_control", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                  { name: "Actions on Objectives", key: "actions_on_objectives", value: 0, currentMonth: 0, previousMonth: 0, change: 0 },
                ];
                const kcIcons = [Search, Cpu, Mail, Zap, Download, Radio, Target];
                const kcColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#dc2626"];
                const kcDescriptions = [
                  "Harvesting email addresses, conference information, etc.",
                  "Coupling exploit with backdoor into deliverable payload",
                  "Delivering weaponized bundle via email, web, USB, etc.",
                  "Exploiting a vulnerability to execute code on victim's system",
                  "Installing malware on the asset",
                  "Command channel for remote manipulation of victim",
                  "With 'Hands on Keyboard' access, intruders accomplish goals",
                ];
                const maxValue = Math.max(...phases.map((p: any) => p.value), 1);
                return (
                  <div className="space-y-1">
                    <div className="relative flex items-center justify-between px-4 mb-6">
                      <div className="absolute top-1/2 left-8 right-8 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 rounded-full -translate-y-1/2 opacity-30" />
                      {phases.map((phase: any, idx: number) => {
                        const Ico = kcIcons[idx];
                        const hasData = phase.value > 0;
                        return (
                          <div
                            key={phase.name}
                            className={`relative flex flex-col items-center z-10 ${hasData ? "cursor-pointer" : ""}`}
                            style={{ width: `${100 / 7}%` }}
                            onClick={() => hasData && openDrilldown("kill_chain_phase", phase.key || phase.name.toLowerCase().replace(/[\s&]+/g, "_"), `Kill Chain: ${phase.name}`)}
                          >
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                                hasData ? "border-current shadow-lg hover:scale-110" : "border-muted bg-muted/50"
                              }`}
                              style={hasData ? { borderColor: kcColors[idx], backgroundColor: `${kcColors[idx]}20` } : {}}
                              data-testid={`killchain-icon-${idx}`}
                            >
                              <Ico className="w-5 h-5" style={{ color: hasData ? kcColors[idx] : "hsl(var(--muted-foreground))" }} />
                            </div>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-1" style={{ backgroundColor: kcColors[idx] }}>
                              {idx + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {phases.map((phase: any, idx: number) => {
                        const hasData = phase.value > 0;
                        const pct = (phase.value / maxValue) * 100;
                        return (
                          <div
                            key={phase.name}
                            className={`rounded-lg p-3 border transition-all ${hasData ? "bg-card cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md" : "bg-muted/20 border-muted"}`}
                            data-testid={`killchain-phase-${idx}`}
                            onClick={() => hasData && openDrilldown("kill_chain_phase", phase.key || phase.name.toLowerCase().replace(/[\s&]+/g, "_"), `Kill Chain: ${phase.name}`)}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-center truncate" title={phase.name}
                              style={{ color: hasData ? kcColors[idx] : "hsl(var(--muted-foreground))" }}>
                              {phase.name}
                            </p>
                            <p className="text-2xl font-bold text-center mt-1">{phase.value}</p>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: kcColors[idx] }} />
                            </div>
                            {phase.change !== 0 ? (
                              <div className="flex items-center justify-center gap-0.5 mt-2">
                                {phase.change > 0 ? (
                                  <TrendingUp className="w-3 h-3 text-red-500" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 text-green-500" />
                                )}
                                <span className={`text-[9px] font-medium ${phase.change > 0 ? "text-red-500" : "text-green-500"}`}>
                                  {phase.change > 0 ? "+" : ""}{phase.change}
                                </span>
                              </div>
                            ) : (
                              <p className="text-[9px] text-muted-foreground text-center mt-2">--</p>
                            )}
                            <p className="text-[8px] text-muted-foreground text-center mt-1.5 leading-tight line-clamp-2">{kcDescriptions[idx]}</p>
                            {hasData && <p className="text-[8px] text-primary text-center mt-1 underline">Click to view</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          </WidgetWrapper>

          <WidgetWrapper widgetId="threat_attack_radar" title="Attack Vector Radar" layout={widgetLayout}>
          <Card data-testid="threat-attack-radar-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-red-500" />
                Attack Vector Radar
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active threat surface by vector (30d / 90d fallback)</p>
            </CardHeader>
            <CardContent className="pt-0">
              <ThreatRadarFull refetchInterval={60000} />
            </CardContent>
          </Card>
          </WidgetWrapper>

          </div>{/* end threat-landscape-radar-killchain-row grid */}

          <Card data-testid="threat-intel-summary-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                Threat Intelligence Summary
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cross-vector attack pattern analysis</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Top MITRE Tactics", value: s.mitreMatrix?.filter((t: any) => t.totalCount > 0).length || 0, icon: Shield, color: "#3b82f6", sub: "active tactics" },
                  { label: "Kill Chain Stages", value: s.killChainData?.filter((kc: any) => Object.values(kc).some((v: any) => typeof v === 'number' && v > 0)).length || 0, icon: Layers, color: "#8b5cf6", sub: "triggered stages" },
                  { label: "Critical Incidents", value: s.criticalEvents || 0, icon: ShieldAlert, color: "#ef4444", sub: "severity critical" },
                  { label: "Total Events (30d)", value: (s.totalEvents || 0).toLocaleString(), icon: Activity, color: "#22c55e", sub: "all sources" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-muted/30 transition-colors">
                    <div className="p-1.5 rounded-md" style={{ backgroundColor: `${item.color}15` }}>
                      <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.label}</p>
                      <p className="text-[9px] text-muted-foreground">{item.sub}</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </>
          )}


        </div>
        )}

        {activeTab === "threat_intel" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="threat-intel-tab-content">
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <div className="animate-card-enter-1"><Top10 title="Top Threats" data={s.topThreats} icon={Skull}
              onItemClick={(item) => openDrilldown("threat", item.name, `Threat: ${item.name}`)} /></div>
            <div className="animate-card-enter-2"><Top10 title="Top Attackers" data={s.topAttackers} icon={Crosshair}
              onItemClick={(item) => openDrilldown("attacker", item.name, `Attacker: ${item.name}`)} /></div>
            <div className="animate-card-enter-3"><Top10 title="Top Cloud Applications" data={s.topVulnerableApps} icon={Cloud}
              onItemClick={(item) => openDrilldown("app", item.name, `Application: ${item.name}`)} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="animate-card-enter-4"><Top10 title="Top Targets — Web URLs" data={s.topWebUrls} icon={Globe}
              onItemClick={(item) => openDrilldown("target", item.name, `Target: ${item.name}`)} /></div>
            <div className="animate-card-enter-5"><Top10 title="Top Targets — Web Categories" data={s.topWebCategories} icon={Layers}
              onItemClick={(item) => openDrilldown("target", item.name, `Category: ${item.name}`)} /></div>
            <div className="animate-card-enter-6"><Top10 title="Top Targets — Endpoints" data={s.topTargetsEndpoint} icon={Monitor}
              onItemClick={(item) => openDrilldown("target", item.name, `Endpoint: ${item.name}`)} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Incidents by Threat Vector</CardTitle>
                <ChartTypeSelector active={ct("threatVector", "bar")} onChange={(v) => setCt("threatVector", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.incidentsByThreatVector}
                  chartType={ct("threatVector", "bar")}
                  dataKey="count"
                  height={300}
                  layout="vertical"
                  yAxisWidth={120}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">MITRE ATT&CK Tactics</CardTitle>
                <ChartTypeSelector active={ct("mitreTactics", "bar")} onChange={(v) => setCt("mitreTactics", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                {ct("mitreTactics", "bar") === "bar" ? (
                  <FlexChart
                    data={s.mitreTactics}
                    chartType="bar"
                    dataKey="value"
                    height={300}
                  />
                ) : (
                  <FlexChart
                    data={s.mitreTactics}
                    chartType={ct("mitreTactics", "bar")}
                    dataKey="value"
                    height={300}
                  />
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Top10 title="MITRE ATT&CK Techniques" data={s.topMitreTechniques} icon={Shield}
              onItemClick={(item) => openDrilldown("mitre_technique", item.name, `MITRE Technique: ${item.name}`)} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Incidents by Action Taken</CardTitle>
                <ChartTypeSelector active={ct("actionTaken", "bar")} onChange={(v) => setCt("actionTaken", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.incidentsByAction}
                  chartType={ct("actionTaken", "bar")}
                  dataKey="value"
                  height={250}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider">Attack Origin Countries</CardTitle>
              <ChartTypeSelector active={ct("attackOrigin", "bar")} onChange={(v) => setCt("attackOrigin", v)} />
            </CardHeader>
            <CardContent className="pt-0">
              <FlexChart
                data={s.topCountries}
                chartType={ct("attackOrigin", "bar")}
                dataKey="count"
                height={250}
                xAxisAngle={-30}
                xAxisHeight={60}
              />
            </CardContent>
          </Card>
        </div>
        )}

        {activeTab === "email" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="email-tab-content">
          <div className="flex items-center justify-end gap-2 mb-1">
            <Button
              size="sm"
              variant="outline"
              data-testid="btn-reclassify-emails"
              disabled={reclassifying}
              onClick={async () => {
                if (!currentTenant?.id) return;
                const confirmed = window.confirm(
                  "This will reclassify all email events and regenerate email incidents.\n\n" +
                  "Existing incidents with matching signatures will be updated (not duplicated).\n" +
                  "Stale incidents that no longer match any events will be removed.\n\n" +
                  "Continue?"
                );
                if (!confirmed) return;
                setReclassifying(true);
                try {
                  const resp = await fetch(`/api/email/reclassify/${currentTenant.id}`, { method: "POST", credentials: "include" });
                  const data = await resp.json();
                  if (resp.ok) {
                    qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
                    qc.invalidateQueries({ queryKey: ["/api/incidents"] });
                    alert(`Reclassified ${data.reclassified} emails.\nNew incidents: ${data.incidentsCreated}\nUpdated incidents: ${data.incidentsUpdated || 0}\nStale removed: ${data.staleRemoved || 0}\nTotal groups: ${data.incidentGroups}`);
                  } else {
                    alert(data.message || "Reclassification failed");
                  }
                } catch (e: any) {
                  alert("Error: " + e.message);
                } finally {
                  setReclassifying(false);
                }
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reclassifying ? "animate-spin" : ""}`} />
              {reclassifying ? "Reclassifying..." : "Reclassify & Regenerate Incidents"}
            </Button>
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="Email Events" value={s.emailTotal} icon={Mail} color={C.purple} />
            <MetricCard title="Spam" value={(s.emailThreatTypes || []).find((t: any) => t.name === "Spam")?.value || 0} icon={Ban} color={C.yellow} />
            <MetricCard title="Phishing" value={(s.emailThreatTypes || []).find((t: any) => t.name === "Phishing")?.value || 0} icon={Skull} color={C.red} />
            <MetricCard title="Malware" value={(s.emailThreatTypes || []).find((t: any) => t.name === "Malware")?.value || 0} icon={Bug} color="#dc2626" />
            <MetricCard title="BEC" value={(s.emailThreatTypes || []).find((t: any) => t.name === "BEC")?.value || 0} icon={AlertTriangle} color="#b91c1c" />
            <MetricCard title="Suspicious" value={(s.emailThreatTypes || []).find((t: any) => t.name === "Suspicious")?.value || 0} icon={ShieldAlert} color={C.orange} />
            <MetricCard title="Quarantined" value={s.emailQuarantinedCount || (s.emailActions || []).find((a: any) => a.name === "quarantined")?.value || 0} icon={ShieldCheck} color={C.teal} />
            <MetricCard title="Quarantine Rate" value={`${s.emailQuarantineRate || 0}%`} icon={Gauge} color={C.blue} />
          </div>
          {(s.emailThreatTypes || []).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ExpandableCard title="Threat Type Classification"
                headerExtra={<ChartTypeSelector active={ct("emailThreatType", "pie")} onChange={(v) => setCt("emailThreatType", v)} />}>
                <FlexChart
                  data={s.emailThreatTypes}
                  chartType={ct("emailThreatType", "pie")}
                  dataKey="value"
                  height={250}
                  colors={{ "Phishing": C.red, "Malware": "#dc2626", "BEC": "#b91c1c", "Spam": C.yellow, "Suspicious": C.orange, "Clean": C.green, "Auth Failure": C.purple, "Graymail": "#9ca3af" }}
                />
              </ExpandableCard>
              <ExpandableCard title="Phishing Sub-Categories"
                headerExtra={<ChartTypeSelector active={ct("phishSubtype", "pie")} onChange={(v) => setCt("phishSubtype", v)} />}>
                <FlexChart
                  data={s.emailPhishingSubtypes || []}
                  chartType={ct("phishSubtype", "pie")}
                  dataKey="value"
                  height={250}
                  colors={{
                    "Credential Harvesting Phishing": "#dc2626", "Business Email Compromise (BEC)": "#b91c1c",
                    "Spear Phishing": "#e11d48", "Whaling": "#9f1239", "Invoice / Payment Phishing": "#ea580c",
                    "Attachment-Based Phishing": "#7c3aed", "Link-Based Phishing": "#0891b2",
                    "Account Suspension Phishing": "#d97706", "Clone Phishing": "#059669",
                    "Credential Harvesting": "#dc2626", "BEC / Impersonation": "#b91c1c",
                    "Brand Impersonation": "#ea580c", "Malware Delivery": "#7c3aed",
                    "Domain Spoofing": "#0891b2", "Generic Phishing": "#6b7280"
                  }}
                />
              </ExpandableCard>
              <Top10 title="Top Sender Domains" data={s.emailTopSenderDomains || []} icon={Globe}
                onItemClick={(item) => openDrilldown("source", item.name, `Sender Domain: ${item.name}`, "email")} />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="Email Auth Failures (SPF/DKIM/DMARC)"
              headerExtra={<ChartTypeSelector active={ct("emailAuth", "bar")} onChange={(v) => setCt("emailAuth", v)} />}>
              <FlexChart
                data={s.emailAuthResults || []}
                chartType={ct("emailAuth", "bar")}
                dataKey="value"
                height={220}
                colors={{ "SPF Fail": C.red, "DKIM Fail": C.orange, "DMARC Fail": C.purple }}
              />
            </ExpandableCard>
            <Top10 title="Top Malicious Senders" data={s.topSenders} icon={Upload}
              onItemClick={(item) => openDrilldown("attacker", item.name, `Sender: ${item.name}`, "email")} />
            <Top10 title="Top Targeted Recipients" data={s.topRecipients} icon={Download}
              onItemClick={(item) => openDrilldown("target", item.name, `Recipient: ${item.name}`, "email")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Action Distribution</CardTitle>
                <ChartTypeSelector active={ct("emailActions", "pie")} onChange={(v) => setCt("emailActions", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.emailActions}
                  chartType={ct("emailActions", "pie")}
                  dataKey="value"
                  height={220}
                  colors={{ blocked: C.red, quarantined: C.orange, delivered: C.green, allowed: C.green, monitored: C.blue, sandboxed: C.purple, stripped: C.yellow }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Severity Distribution</CardTitle>
                <ChartTypeSelector active={ct("emailSeverity", "pie")} onChange={(v) => setCt("emailSeverity", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.emailSeverity}
                  chartType={ct("emailSeverity", "pie")}
                  dataKey="value"
                  height={220}
                  colors={SEV}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Threat Vectors</CardTitle>
              <ChartTypeSelector active={ct("emailThreatVectors", "bar")} onChange={(v) => setCt("emailThreatVectors", v)} />
            </CardHeader>
            <CardContent className="pt-0">
              <FlexChart
                data={s.emailThreatVectors}
                chartType={ct("emailThreatVectors", "bar")}
                dataKey="count"
                height={220}
              />
            </CardContent>
          </Card>
          {(s.emailUserRiskList || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Email Recipients — Risk & Threat Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-auto max-h-[500px]">
                  <table className="w-full text-xs" data-testid="table-email-user-risk">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b">
                        <th className="text-left p-2 font-semibold">Email Address</th>
                        <th className="text-center p-2 font-semibold w-[70px]">Risk Score</th>
                        <th className="text-center p-2 font-semibold w-[60px]">Total</th>
                        <th className="text-center p-2 font-semibold w-[55px]">Spam</th>
                        <th className="text-center p-2 font-semibold w-[55px]">Phishing</th>
                        <th className="text-center p-2 font-semibold w-[55px]">Malware</th>
                        <th className="text-center p-2 font-semibold w-[55px]">BEC</th>
                        <th className="text-center p-2 font-semibold w-[65px]">Suspicious</th>
                        <th className="text-center p-2 font-semibold w-[55px]">Clean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.emailUserRiskList || []).map((u: any, idx: number) => (
                        <tr key={u.email} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-email-user-${idx}`}>
                          <td className="p-2 font-mono text-[11px]">
                            <span
                              className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={() => navigate(`/entity-profile/${currentTenant?.id}/email/${encodeURIComponent(u.email)}`)}
                              data-testid={`link-email-${idx}`}
                            >{u.email}</span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${u.riskScore >= 70 ? "bg-red-500" : u.riskScore >= 40 ? "bg-orange-500" : u.riskScore >= 20 ? "bg-yellow-500" : "bg-green-500"}`}>{u.riskScore}</span>
                          </td>
                          <td className="p-2 text-center font-medium">{u.total}</td>
                          <td className="p-2 text-center">{u.spam > 0 ? <span className="text-yellow-600 font-medium">{u.spam}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-center">{u.phishing > 0 ? <span className="text-red-600 font-bold">{u.phishing}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-center">{u.malware > 0 ? <span className="text-red-700 font-bold">{u.malware}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-center">{u.bec > 0 ? <span className="text-rose-600 font-bold">{u.bec}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-center">{u.suspicious > 0 ? <span className="text-orange-600 font-medium">{u.suspicious}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-2 text-center">{u.clean > 0 ? <span className="text-green-600">{u.clean}</span> : <span className="text-muted-foreground">0</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {currentTenant?.id && <EmailSenderDomainRiskCard tenantId={currentTenant.id} />}
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="email" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="email" onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "endpoint" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="endpoint-tab-content">
          {/* Endpoint Hero Banner */}
          <div className={`relative overflow-hidden rounded-xl border bg-primary/5 dark:bg-gradient-to-r dark:from-blue-950/60 dark:via-slate-900/80 dark:to-slate-900 p-4 animate-card-enter-1 ${liveMode ? "domain-live-ring" : ""}`}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-8 right-1/4 w-32 h-32 bg-blue-500/8 rounded-full blur-2xl" />
              <div className="absolute top-2 right-4 w-20 h-20 bg-purple-500/6 rounded-full blur-xl" />
            </div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0">
                {(() => {
                  const rate = s.endpointRemediation?.rate || 0;
                  const r = 36; const circ = 2 * Math.PI * r;
                  const color = rate >= 80 ? "#22c55e" : rate >= 60 ? "#f59e0b" : "#ef4444";
                  return (
                    <svg width="90" height="90" style={{ filter: `drop-shadow(0 0 8px ${color}50)` }}>
                      <circle cx="45" cy="45" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                      <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="6"
                        strokeDasharray={circ} strokeDashoffset={circ - (rate / 100) * circ}
                        strokeLinecap="round" transform="rotate(-90 45 45)"
                        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
                      <text x="45" y="41" textAnchor="middle" fill={color} fontSize="15" fontWeight="800">{rate}%</text>
                      <text x="45" y="54" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="7">Remediated</text>
                    </svg>
                  );
                })()}
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Events", value: s.endpointRemediation?.total || s.endpointTotal || 0, color: "#ef4444", icon: Monitor },
                  { label: "Remediated", value: s.endpointRemediation?.remediated || 0, color: "#22c55e", icon: ShieldCheck },
                  { label: "Auto-Remediation", value: `${s.endpointRemediation?.autoPct || 0}%`, color: "#3b82f6", icon: Zap },
                  { label: "Unresolved", value: s.endpointRemediation?.none || 0, color: "#f59e0b", icon: ShieldOff },
                ].map((m) => (
                  <div key={m.label} className="bg-muted/50 rounded-lg p-2.5 border">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{m.label}</div>
                    <div className="text-lg font-bold" style={{ color: m.color }}>
                      {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1 shrink-0" data-testid="endpoint-timeline-selector">
                {([
                  { label: "1H", value: "1h" },
                  { label: "24H", value: "24h" },
                  { label: "7D", value: "7d" },
                  { label: "30D", value: "30d" },
                  { label: "90D", value: "90d" },
                  { label: "All", value: "all" },
                ] as const).map(t => (
                  <button key={t.value} data-testid={`timeline-${t.label}`}
                    onClick={() => setTimeRange(t.value)}
                    className={`px-2 py-1 text-[9px] font-medium rounded transition-colors ${timeRange === t.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                  >{t.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Threat Types" data={s.endpointIncidentByType?.length ? s.endpointIncidentByType : s.endpointByThreat} icon={Bug}
              onItemClick={(item) => openDrilldown("threat", item.name, `Threat: ${item.name}`, "endpoint")} />
            <Top10 title="Top Infected Hosts" data={s.topInfectedHosts} icon={Monitor}
              onItemClick={(item) => openDrilldown("target", item.name, `Host: ${item.name}`, "endpoint")} />
            <Card data-testid="threat-vectors-enhanced">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-red-500 to-orange-500" />
                  Threat Vectors
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-2.5">
                  {(s.endpointThreatVectors || []).map((item: any, idx: number) => {
                    const TIcon = getThreatIcon(item.name);
                    const maxCount = Math.max(...(s.endpointThreatVectors || []).map((i: any) => i.count), 1);
                    const pct = Math.round((item.count / maxCount) * 100);
                    const color = PALETTE[idx % PALETTE.length];
                    return (
                      <div key={idx} className="group cursor-pointer" onClick={() => openDrilldown("threat", item.name, `Vector: ${item.name}`, "endpoint")}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex items-center justify-center w-5 h-5 rounded shrink-0" style={{ backgroundColor: `${color}20` }}>
                            <TIcon className="w-3 h-3" style={{ color }} />
                          </div>
                          <span className="text-[11px] font-medium flex-1 truncate">{item.name}</span>
                          <span className="text-[10px] font-bold font-mono shrink-0" style={{ color }}>{item.count}</span>
                        </div>
                        <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden ml-7">
                          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 group-hover:opacity-80"
                            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}70, ${color})` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExpandableCard title="EDR Action Distribution"
              headerExtra={<ChartTypeSelector active={ct("edrActions", "pie")} onChange={(v) => setCt("edrActions", v)} />}>
              <FlexChart
                data={s.endpointActions}
                chartType={ct("edrActions", "pie")}
                dataKey="value"
                height={250}
                colors={{ "Auto-Remediation Applied": C.green, "No Auto-Remediation": C.orange, blocked: C.green, quarantined: C.orange, isolated: C.purple, alerted: C.blue }}
              />
            </ExpandableCard>
            <ExpandableCard title="EDR Platforms"
              headerExtra={<ChartTypeSelector active={ct("edrPlatforms", "pie")} onChange={(v) => setCt("edrPlatforms", v)} />}>
              <FlexChart
                data={s.endpointLogSources.map((src: any) => ({ name: src.name, value: src.count }))}
                chartType={ct("edrPlatforms", "pie")}
                dataKey="value"
                height={250}
              />
            </ExpandableCard>
          </div>
          <ExpandableCard title="Top 20 Assets by Event Count"
            headerExtra={<ChartTypeSelector active={ct("topAssets", "bar")} onChange={(v) => setCt("topAssets", v)} />}>
            <FlexChart
              data={(assetsData?.summary?.topAssetsByEvents || []).slice(0, 20)}
              chartType={ct("topAssets", "bar")}
              dataKey="totalEvents"
              height={300}
              layout="vertical"
              yAxisWidth={120}
            />
          </ExpandableCard>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="endpoint" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="endpoint" onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "data_security" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="dlp-tab-content">
          {(() => {
            const ds = { channelBreakdown: [] as any[], stateBreakdown: [] as any[], topOffenders: [] as any[],
              severityBreakdown: [] as any[], dlpTrend: [] as any[], recentIncidents: [] as any[],
              totalDlpIncidents: 0, ...dsData };
            return (<>
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="DLP Events" value={s.dlpTotal} icon={Lock} color={C.red} />
            <MetricCard title="Policies Triggered" value={s.dlpUniquePolicies || 0} icon={FileText} color={C.purple} />
            <MetricCard title="Data Matches" value={s.dlpTotalMatchCount || 0} icon={Search} color={C.orange} />
            <MetricCard title="Blocked" value={s.dlpBlockedCount || 0} icon={Ban} color={C.red} />
            <MetricCard title="Monitored" value={s.dlpMonitoredCount || 0} icon={Eye} color={C.blue} />
            <MetricCard title="Encrypted" value={s.dlpEncryptedCount || 0} icon={Lock} color={C.green} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="Events by Channel"
              headerExtra={<ChartTypeSelector active={ct("dlpChannel", "pie")} onChange={(v) => setCt("dlpChannel", v)} />}>
              <FlexChart
                data={ds.channelBreakdown}
                chartType={ct("dlpChannel", "pie")}
                dataKey="value"
                height={250}
                colors={{ "Web DLP": C.blue, "Email DLP": C.orange, "Endpoint DLP": C.purple, "CASB/SWG": C.teal }}
              />
            </ExpandableCard>
            <ExpandableCard title="Incidents by Data State"
              headerExtra={<ChartTypeSelector active={ct("dlpState", "pie")} onChange={(v) => setCt("dlpState", v)} />}>
              <FlexChart
                data={ds.stateBreakdown}
                chartType={ct("dlpState", "pie")}
                dataKey="value"
                height={250}
                colors={{ "In Motion": C.blue, "At Rest": C.green, "In Use": C.orange, "In Cloud": C.purple }}
              />
            </ExpandableCard>
            <ExpandableCard title="Data Classification Breakdown"
              headerExtra={<ChartTypeSelector active={ct("dlpClassify", "pie")} onChange={(v) => setCt("dlpClassify", v)} />}>
              <FlexChart
                data={s.dlpClassifications || []}
                chartType={ct("dlpClassify", "pie")}
                dataKey="value"
                height={250}
                colors={{ "PII": C.red, "PHI": C.orange, "PCI": C.purple, "Confidential": "#b91c1c", "Internal": C.blue, "Public": C.green }}
              />
            </ExpandableCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExpandableCard title="DLP Severity Trend"
              headerExtra={<ChartTypeSelector active={ct("dlpSevTrend", "area")} onChange={(v) => setCt("dlpSevTrend", v)} />}>
              <FlexChart
                data={ds.dlpTrend}
                chartType={ct("dlpSevTrend", "area")}
                nameKey="month"
                height={250}
                series={[
                  { dataKey: "critical", name: "Critical", color: C.red },
                  { dataKey: "high", name: "High", color: C.orange },
                  { dataKey: "medium", name: "Medium", color: C.blue },
                  { dataKey: "low", name: "Low", color: C.green },
                ]}
              />
            </ExpandableCard>
            <ExpandableCard title="Action Distribution"
              headerExtra={<ChartTypeSelector active={ct("dlpActionDist", "pie")} onChange={(v) => setCt("dlpActionDist", v)} />}>
              <FlexChart
                data={s.dlpActions || []}
                chartType={ct("dlpActionDist", "pie")}
                dataKey="value"
                height={250}
                colors={{ Blocked: C.red, Monitored: C.blue, Encrypted: C.green, Allowed: C.yellow, Quarantined: C.orange, blocked: C.red, monitored: C.blue, encrypted: C.green, allowed: C.yellow, quarantined: C.orange }}
              />
            </ExpandableCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="Policy Violation Distribution"
              headerExtra={<ChartTypeSelector active={ct("dlpPolicies", "bar")} onChange={(v) => setCt("dlpPolicies", v)} />}>
              <FlexChart
                data={s.dlpTopPolicies || []}
                chartType={ct("dlpPolicies", "bar")}
                dataKey="count"
                height={250}
                layout="vertical"
                yAxisWidth={120}
              />
            </ExpandableCard>
            <ExpandableCard title="Incident Type Distribution"
              headerExtra={<ChartTypeSelector active={ct("dlpIncType", "pie")} onChange={(v) => setCt("dlpIncType", v)} />}>
              <FlexChart
                data={s.dlpIncidentTypes || []}
                chartType={ct("dlpIncType", "pie")}
                dataKey="value"
                height={250}
              />
            </ExpandableCard>
            <ExpandableCard title="Severity Distribution"
              headerExtra={<ChartTypeSelector active={ct("dlpSevDist", "bar")} onChange={(v) => setCt("dlpSevDist", v)} />}>
              <FlexChart
                data={ds.severityBreakdown}
                chartType={ct("dlpSevDist", "bar")}
                dataKey="value"
                height={250}
                colors={{ critical: C.red, high: C.orange, medium: C.blue, low: C.green, info: "hsl(210, 10%, 50%)" }}
              />
            </ExpandableCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Top Offenders" data={ds.topOffenders} icon={Users}
              onItemClick={(item) => openDrilldown("attacker", item.name, `Offender: ${item.name}`, "dlp")} />
            <Top10 title="Top Cloud Services" data={s.dlpTopServices || []} icon={Cloud}
              onItemClick={(item) => openDrilldown("app", item.name, `Service: ${item.name}`, "dlp")} />
            <Top10 title="Top Users by Violations" data={s.dlpTopUsers || []} icon={Users}
              onItemClick={(item) => openDrilldown("attacker", item.name, `User: ${item.name}`, "dlp")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Top DLP Policies" data={s.dlpTopPolicies || []} icon={FileText}
              onItemClick={(item) => openDrilldown("threat", item.name, `Policy: ${item.name}`, "dlp")} />
            <Top10 title="Top Exfiltration Destinations" data={s.dlpTopDestinations || []} icon={Upload}
              onItemClick={(item) => openDrilldown("target", item.name, `Destination: ${item.name}`, "dlp")} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Recent DLP Incidents</CardTitle>
                <Link href="/events?domain=dlp" className="text-[10px] text-primary flex items-center gap-0.5" data-testid="link-dlp-incidents">
                  View All <ArrowUpRight className="w-3 h-3" />
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {ds.recentIncidents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No DLP incidents found</p>
                ) : (
                  <div className="space-y-1.5">
                    {ds.recentIncidents.map((inc: any) => {
                      const d = new Date(inc.createdAt);
                      const diffMs = Date.now() - d.getTime();
                      const diffHrs = Math.floor(diffMs / 3600000);
                      const diffDays = Math.floor(diffMs / 86400000);
                      const timeAgo = diffHrs < 24 ? `${diffHrs}h ago` : `${diffDays}d ago`;
                      const sevColor: Record<string, string> = { critical: C.red, high: C.orange, medium: C.blue, low: C.green };
                      return (
                        <a key={inc.id} href={`/events?domain=overview&incidentId=${inc.id}`}
                          className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30 border-l-2 cursor-pointer hover:bg-muted/50 transition-colors no-underline"
                          style={{ borderLeftColor: sevColor[inc.severity] || C.blue }}
                          data-testid={`dlp-incident-row-${inc.id}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Lock className="w-3 h-3 shrink-0" style={{ color: sevColor[inc.severity] }} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium truncate">{inc.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-[9px] h-4 px-1" style={{ borderColor: sevColor[inc.severity], color: sevColor[inc.severity] }}>{inc.severity}</Badge>
                                <span className="text-[9px] text-muted-foreground font-mono">({timeAgo})</span>
                              </div>
                            </div>
                          </div>
                          <Badge variant={inc.status === "open" ? "destructive" : "secondary"} className="text-[9px] shrink-0">{inc.status}</Badge>
                        </a>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {ds.channelBreakdown.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ds.channelBreakdown.map((ch: any) => {
                const chIcons: Record<string, any> = { "Web DLP": Globe, "Email DLP": Mail, "Endpoint DLP": Monitor, "CASB/SWG": Cloud };
                const chColors: Record<string, string> = { "Web DLP": C.blue, "Email DLP": C.orange, "Endpoint DLP": C.purple, "CASB/SWG": C.teal };
                return <MetricCard key={ch.name} title={ch.name} value={ch.value} icon={chIcons[ch.name] || Shield} color={chColors[ch.name] || C.blue} />;
              })}
            </div>
          )}
            </>);
          })()}
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="dlp" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey={["dlp", "casb", "sse"]} onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "webapp" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="webapp-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="WAF Events" value={s.wafTotal} icon={Globe} color={C.red} />
            <MetricCard title="OWASP Top 10 Attacks" value={(() => {
              const owaspPatterns = /sql injection|xss|cross-site|injection|broken auth|sensitive data|xxe|broken access|security misconfig|insecure deserialization|insufficient logging|ssrf/i;
              return (s.wafAttackTypes || []).filter((a: any) => owaspPatterns.test(a.name)).reduce((sum: number, a: any) => sum + (a.count || 0), 0);
            })()} icon={ShieldAlert} color={C.orange} />
            <MetricCard title="Bot Attacks" value={(() => {
              const botPatterns = /bot|crawler|scraper|spider|automation/i;
              return (s.wafAttackTypes || []).filter((a: any) => botPatterns.test(a.name)).reduce((sum: number, a: any) => sum + (a.count || 0), 0);
            })()} icon={Brain} color={C.purple} />
            <MetricCard title="DDoS Events" value={(() => {
              const ddosPatterns = /ddos|flood|slowloris|syn flood|udp flood|volumetric/i;
              return (s.wafAttackTypes || []).filter((a: any) => ddosPatterns.test(a.name)).reduce((sum: number, a: any) => sum + (a.count || 0), 0);
            })()} icon={Zap} color={C.red} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="OWASP Top 10 Categories" data={(() => {
              const owaspMap: Record<string, string> = {
                "SQL Injection": "A03:Injection", "XSS": "A07:XSS", "Cross-Site Scripting": "A07:XSS",
                "Injection": "A03:Injection", "Broken Authentication": "A07:Auth Failure",
                "Sensitive Data Exposure": "A02:Crypto Failure", "XXE": "A05:Misconfig",
                "Broken Access Control": "A01:Access Control", "Security Misconfiguration": "A05:Misconfig",
                "Insecure Deserialization": "A08:Integrity Failure", "SSRF": "A10:SSRF",
                "Insufficient Logging": "A09:Logging Failure",
              };
              const categories: Record<string, number> = {};
              (s.wafAttackTypes || []).forEach((a: any) => {
                const cat = owaspMap[a.name];
                if (cat) categories[cat] = (categories[cat] || 0) + (a.count || 0);
              });
              const result = Object.entries(categories).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
              if (result.length === 0) {
                return [
                  { name: "A01:Access Control", count: 0 }, { name: "A02:Crypto Failure", count: 0 },
                  { name: "A03:Injection", count: 0 }, { name: "A05:Misconfig", count: 0 },
                  { name: "A07:XSS", count: 0 }, { name: "A07:Auth Failure", count: 0 },
                  { name: "A08:Integrity Failure", count: 0 }, { name: "A09:Logging Failure", count: 0 },
                  { name: "A10:SSRF", count: 0 },
                ];
              }
              return result;
            })()} icon={ShieldAlert} />
            <Top10 title="Application Bot Activity" data={(() => {
              const botPatterns = /bot|crawler|scraper|spider|automation/i;
              const filtered = (s.wafAttackTypes || []).filter((a: any) => botPatterns.test(a.name));
              if (filtered.length > 0) return filtered;
              return [
                { name: "Scraper Bots", count: 0 }, { name: "Credential Stuffing Bots", count: 0 },
                { name: "Spam Bots", count: 0 }, { name: "DDoS Bots", count: 0 },
                { name: "Click Fraud Bots", count: 0 }, { name: "Content Scrapers", count: 0 },
              ];
            })()} icon={Brain} />
            <Top10 title="App DDoS Attacks" data={(() => {
              const ddosPatterns = /ddos|flood|slowloris|syn flood|udp flood|volumetric/i;
              const filtered = (s.wafAttackTypes || []).filter((a: any) => ddosPatterns.test(a.name));
              if (filtered.length > 0) return filtered;
              return [
                { name: "HTTP Flood", count: 0 }, { name: "Slowloris", count: 0 },
                { name: "SYN Flood", count: 0 }, { name: "UDP Flood", count: 0 },
                { name: "DNS Amplification", count: 0 }, { name: "Volumetric Attack", count: 0 },
              ];
            })()} icon={Zap} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Action Distribution</CardTitle>
                <ChartTypeSelector active={ct("webappWafActions", "pie")} onChange={(v) => setCt("webappWafActions", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.wafActions}
                  chartType={ct("webappWafActions", "pie")}
                  dataKey="value"
                  height={220}
                  colors={{ blocked: C.red, allowed: C.green, challenged: C.orange, logged: C.blue }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Protected Applications</CardTitle>
                <ChartTypeSelector active={ct("webappTargets", "bar")} onChange={(v) => setCt("webappTargets", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.wafTargets}
                  chartType={ct("webappTargets", "bar")}
                  dataKey="count"
                  height={220}
                />
              </CardContent>
            </Card>
          </div>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="waf" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="waf" onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "web" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="web-tab-content">
          {webSecData?.dataMode === "cloud_activity" ? (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
              <MetricCard title="SSE Events" value={webSecData?.summary?.totalEvents || s.sseTotal} icon={ShieldCheck} color={C.teal} />
              <MetricCard title="Cloud Services" value={webSecData?.summary?.totalServices || 0} icon={Cloud} color={C.purple} />
              <MetricCard title="Total Activities" value={webSecData?.summary?.totalActivities || 0} icon={Activity} color={C.blue} />
              <MetricCard title="AI Services" value={webSecData?.summary?.totalAIServices || 0} icon={Bot} color={C.orange} />
              <MetricCard title="Shadow IT" value={webSecData?.summary?.totalShadowIT || 0} icon={AppWindow} color={C.red} />
            </div>
          ) : (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
              <MetricCard title="SSE Events" value={s.sseTotal} icon={ShieldCheck} color={C.teal} />
              <MetricCard title="CASB Events" value={s.casbTotal} icon={Cloud} color={C.purple} />
              <MetricCard title="DLP Events" value={s.dlpTotal} icon={Lock} color={C.orange} />
              <MetricCard title="Cloud Events" value={s.cloudTotal} icon={Cloud} color={C.blue} />
              <MetricCard title="Shadow IT" value={webSecData?.summary?.totalShadowIT || 0} icon={AppWindow} color={C.red} />
            </div>
          )}

          {webSecData?.dataMode === "cloud_activity" && webSecData?.summary && (
            <>
              <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-full bg-teal-100 dark:bg-teal-900 p-2">
                      <Cloud className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-800 dark:text-teal-200">SSE — Cloud Access Security (SWG + CASB + RBI + Shadow IT)</p>
                      <p className="text-xs text-teal-600 dark:text-teal-400">
                        Monitoring <strong>{(webSecData.summary.totalServices || 0).toLocaleString()}</strong> cloud services
                        across <strong>{(webSecData.summary.totalUsers || 0).toLocaleString()}</strong> users.
                        Total: <strong>{(webSecData.summary.totalActivities || 0).toLocaleString()}</strong> activities,
                        <strong> {(webSecData.summary.totalShadowIT || 0)}</strong> Shadow IT apps,
                        <strong> {(webSecData.summary.totalAIServices || 0)}</strong> AI services detected,
                        <strong> {(webSecData.summary.totalCountries || 0)}</strong> countries.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Total Activities</p>
                      <p className="text-sm font-bold">{(webSecData.summary.totalActivities || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Uploads</p>
                      <p className="text-sm font-bold text-orange-600">{(webSecData.summary.totalUploads || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Downloads</p>
                      <p className="text-sm font-bold text-blue-600">{(webSecData.summary.totalDownloads || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Logins</p>
                      <p className="text-sm font-bold text-green-600">{(webSecData.summary.totalLogins || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Cloud Services</p>
                      <p className="text-sm font-bold text-teal-600">{(webSecData.summary.totalServices || 0)}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Shadow IT</p>
                      <p className="text-sm font-bold text-red-600">{(webSecData.summary.totalShadowIT || 0)}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">AI Services</p>
                      <p className="text-sm font-bold text-purple-600">{(webSecData.summary.totalAIServices || 0)}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Users</p>
                      <p className="text-sm font-bold text-blue-600">{(webSecData.summary.totalUsers || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ExpandableCard title="Activity Type Distribution"
                  headerExtra={<ChartTypeSelector active={ct("cloudActType", "pie")} onChange={(v) => setCt("cloudActType", v)} />}>
                  <FlexChart
                    data={webSecData.activityTypeDistribution || []}
                    chartType={ct("cloudActType", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ upload: C.orange, download: C.blue, login: C.green, "upload-photo": C.purple }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Sanction Status"
                  headerExtra={<ChartTypeSelector active={ct("cloudSanction", "pie")} onChange={(v) => setCt("cloudSanction", v)} />}>
                  <FlexChart
                    data={webSecData.sanctionDistribution || []}
                    chartType={ct("cloudSanction", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ Sanctioned: C.green, Unsanctioned: C.red }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Service Category Distribution"
                  headerExtra={<ChartTypeSelector active={ct("cloudCatDist", "bar")} onChange={(v) => setCt("cloudCatDist", v)} />}>
                  <FlexChart
                    data={(webSecData.categoryDistribution || []).slice(0, 12)}
                    chartType={ct("cloudCatDist", "bar")}
                    dataKey="value"
                    height={250}
                    layout="vertical"
                    yAxisWidth={160}
                  />
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top Cloud Services (by Activity)"
                  headerExtra={<ChartTypeSelector active={ct("topCloudSvc", "bar")} onChange={(v) => setCt("topCloudSvc", v)} />}>
                  <FlexChart
                    data={(webSecData.topServices || []).slice(0, 15).map((s: any) => ({ name: s.name?.substring(0, 35), value: s.activities }))}
                    chartType={ct("topCloudSvc", "bar")}
                    dataKey="value"
                    height={320}
                    layout="vertical"
                    yAxisWidth={180}
                  />
                </ExpandableCard>

                <ExpandableCard title="Geographic Distribution"
                  headerExtra={<ChartTypeSelector active={ct("cloudGeo", "bar")} onChange={(v) => setCt("cloudGeo", v)} />}>
                  <FlexChart
                    data={(webSecData.countryDistribution || []).slice(0, 15).map((c: any) => ({ name: c.name, value: c.value }))}
                    chartType={ct("cloudGeo", "bar")}
                    dataKey="value"
                    height={320}
                  />
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Shadow IT Applications" icon={AlertTriangle}>
                  {(webSecData.shadowITApps || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">Application</TableHead>
                            <TableHead className="text-[10px] uppercase">Category</TableHead>
                            <TableHead className="text-[10px] uppercase">Activities</TableHead>
                            <TableHead className="text-[10px] uppercase">Users</TableHead>
                            <TableHead className="text-[10px] uppercase">Uploads</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.shadowITApps || []).slice(0, 15).map((app: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-shadow-it-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/application/${encodeURIComponent(app.name)}`)}>
                              <TableCell className="text-[11px] font-medium">
                                <div className="flex items-center gap-2">
                                  <AppLogo name={app.name} size={16} fallbackIcon="app" fallbackColor="text-red-500" />
                                  <span className="text-blue-600 dark:text-blue-400 hover:underline">{app.name}</span>
                                </div>
                              </TableCell>
                              <TableCell><Badge variant="outline" className="text-[9px]">{app.category}</Badge></TableCell>
                              <TableCell className="text-[11px] font-mono">{(app.activities || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono">{app.users || 0}</TableCell>
                              <TableCell className="text-[11px] font-mono text-orange-600">{(app.uploads || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No Shadow IT applications detected</div>
                  )}
                </ExpandableCard>

                <ExpandableCard title="AI / Generative AI Services" icon={Bot}>
                  {(webSecData.aiApps || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">AI Service</TableHead>
                            <TableHead className="text-[10px] uppercase">Activities</TableHead>
                            <TableHead className="text-[10px] uppercase">Users</TableHead>
                            <TableHead className="text-[10px] uppercase">Uploads</TableHead>
                            <TableHead className="text-[10px] uppercase">Downloads</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.aiApps || []).slice(0, 15).map((app: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-ai-service-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/application/${encodeURIComponent(app.name)}`)}>
                              <TableCell className="text-[11px] font-medium">
                                <div className="flex items-center gap-2">
                                  <AppLogo name={app.name} size={16} fallbackIcon="bot" fallbackColor="text-purple-500" />
                                  <span className="text-blue-600 dark:text-blue-400 hover:underline">{app.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-[11px] font-mono">{(app.activities || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono">{app.users || 0}</TableCell>
                              <TableCell className="text-[11px] font-mono text-orange-600">{(app.uploads || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono text-blue-600">{(app.downloads || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No AI service activity detected</div>
                  )}
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top Users by Activity" icon={Users}>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] uppercase">User</TableHead>
                          <TableHead className="text-[10px] uppercase">Activities</TableHead>
                          <TableHead className="text-[10px] uppercase">Services</TableHead>
                          <TableHead className="text-[10px] uppercase">Uploads</TableHead>
                          <TableHead className="text-[10px] uppercase">AI Services</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(webSecData.topUsers || []).slice(0, 15).map((u: any, idx: number) => (
                          <TableRow key={idx} data-testid={`row-cloud-user-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/${u.user?.includes("@") ? "email" : "user"}/${encodeURIComponent(u.user)}`)}>
                            <TableCell className="text-[11px] font-mono max-w-[180px] truncate text-blue-600 dark:text-blue-400 hover:underline">{u.user}</TableCell>
                            <TableCell className="text-[11px] font-mono">{(u.activities || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-[11px] font-mono">{u.services || 0}</TableCell>
                            <TableCell className="text-[11px] font-mono text-orange-600">{(u.uploads || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-[11px] font-mono text-purple-600">{u.aiServices || 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ExpandableCard>

                <ExpandableCard title="Top Data Uploaders (Exfiltration Risk)" icon={Upload}>
                  {(webSecData.topUploaders || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">User</TableHead>
                            <TableHead className="text-[10px] uppercase">Uploads</TableHead>
                            <TableHead className="text-[10px] uppercase">Services</TableHead>
                            <TableHead className="text-[10px] uppercase">Countries</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.topUploaders || []).slice(0, 15).map((u: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-uploader-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/${u.user?.includes("@") ? "email" : "user"}/${encodeURIComponent(u.user)}`)}>
                              <TableCell className="text-[11px] font-mono max-w-[180px] truncate text-blue-600 dark:text-blue-400 hover:underline">{u.user}</TableCell>
                              <TableCell className="text-[11px] font-mono text-orange-600 font-semibold">{(u.uploads || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono">{u.services || 0}</TableCell>
                              <TableCell className="text-[11px] font-mono">{u.countries || ""}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No upload activity detected</div>
                  )}
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top AI Service Users" icon={Brain}>
                  {(webSecData.topAIUsers || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">User</TableHead>
                            <TableHead className="text-[10px] uppercase">AI Services</TableHead>
                            <TableHead className="text-[10px] uppercase">Total Activities</TableHead>
                            <TableHead className="text-[10px] uppercase">Uploads</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.topAIUsers || []).slice(0, 15).map((u: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-ai-user-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/${u.user?.includes("@") ? "email" : "user"}/${encodeURIComponent(u.user)}`)}>
                              <TableCell className="text-[11px] font-mono max-w-[180px] truncate text-blue-600 dark:text-blue-400 hover:underline">{u.user}</TableCell>
                              <TableCell className="text-[11px] font-mono text-purple-600 font-semibold">{u.aiServices || 0}</TableCell>
                              <TableCell className="text-[11px] font-mono">{(u.activities || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono text-orange-600">{(u.uploads || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No AI service users detected</div>
                  )}
                </ExpandableCard>

                <ExpandableCard title="Sanctioned vs Unsanctioned Services"
                  headerExtra={<ChartTypeSelector active={ct("cloudSvcSanction", "bar")} onChange={(v) => setCt("cloudSvcSanction", v)} />}>
                  <FlexChart
                    data={[
                      ...(webSecData.sanctionedApps || []).slice(0, 8).map((a: any) => ({ name: a.name?.substring(0, 25), Sanctioned: a.activities, Unsanctioned: 0 })),
                      ...(webSecData.unsanctionedApps || []).slice(0, 8).map((a: any) => ({ name: a.name?.substring(0, 25), Sanctioned: 0, Unsanctioned: a.activities })),
                    ].sort((a, b) => (b.Sanctioned + b.Unsanctioned) - (a.Sanctioned + a.Unsanctioned)).slice(0, 12)}
                    chartType={ct("cloudSvcSanction", "bar")}
                    dataKey="Sanctioned"
                    height={320}
                    layout="vertical"
                    yAxisWidth={160}
                  />
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Activity Timeline"
                  headerExtra={<ChartTypeSelector active={ct("cloudTimeline", "area")} onChange={(v) => setCt("cloudTimeline", v)} />}>
                  <FlexChart
                    data={(webSecData.activityTimeline || []).map((t: any) => ({ name: t.time?.substring(5) || t.time, value: t.activities }))}
                    chartType={ct("cloudTimeline", "area")}
                    dataKey="value"
                    height={280}
                    colors={{ value: C.teal }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Data Exfiltration Risk">
                  <div className="flex flex-col items-center justify-center gap-4 py-4">
                    <RiskGauge score={Math.min(100, Math.round((webSecData.summary.uploadPercentage || 0) * 2))} label="Upload Risk" size={140} />
                    <div className="grid grid-cols-3 gap-4 w-full text-center mt-2">
                      <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 p-3">
                        <Upload className="h-4 w-4 mx-auto text-orange-600 mb-1" />
                        <p className="text-[10px] text-muted-foreground uppercase">Uploads</p>
                        <p className="text-lg font-bold text-orange-600">{(webSecData.summary.totalUploads || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 p-3">
                        <Download className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                        <p className="text-[10px] text-muted-foreground uppercase">Downloads</p>
                        <p className="text-lg font-bold text-blue-600">{(webSecData.summary.totalDownloads || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-3">
                        <AlertTriangle className="h-4 w-4 mx-auto text-red-600 mb-1" />
                        <p className="text-[10px] text-muted-foreground uppercase">Upload %</p>
                        <p className="text-lg font-bold text-red-600">{webSecData.summary.uploadPercentage || 0}%</p>
                      </div>
                    </div>
                  </div>
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top Users by Activity" icon={Users}>
                  {(webSecData.topUsers || []).length > 0 ? (
                    <FlexChart
                      data={(webSecData.topUsers || []).slice(0, 12).map((u: any) => ({ name: u.user?.substring(0, 20), value: u.activities }))}
                      chartType={ct("cloudTopUsersChart", "bar")}
                      dataKey="value"
                      height={300}
                      layout="vertical"
                      yAxisWidth={140}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No user activity data</div>
                  )}
                </ExpandableCard>

                <ExpandableCard title="Top Uploaders (Data Exfil Risk)" icon={Upload}>
                  {(webSecData.topUploaders || []).length > 0 ? (
                    <FlexChart
                      data={(webSecData.topUploaders || []).slice(0, 12).map((u: any) => ({ name: u.user?.substring(0, 20), value: u.uploads }))}
                      chartType={ct("cloudTopUploadersChart", "bar")}
                      dataKey="value"
                      height={300}
                      layout="vertical"
                      yAxisWidth={140}
                      colors={{ value: C.orange }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No upload activity detected</div>
                  )}
                </ExpandableCard>
              </div>
            </>
          )}

          {webSecData?.dataMode === "swg" && (webSecData?.summary?.totalTrafficRecords > 0 || webSecData?.summary?.totalUserRecords > 0) && (
            <>
              <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-full bg-teal-100 dark:bg-teal-900 p-2">
                      <Globe className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-800 dark:text-teal-200">SWG — Secure Web Gateway Traffic</p>
                      <p className="text-xs text-teal-600 dark:text-teal-400">
                        <strong>Source:</strong> Users / Systems &nbsp;→&nbsp; <strong>Destination:</strong> Websites / Web Applications.
                        Tracking <strong>{(webSecData.summary.totalUniqueSites || 0).toLocaleString()}</strong> web destinations
                        and <strong>{(webSecData.summary.totalUniqueUsers || 0).toLocaleString()}</strong> user sources.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Total Requests</p>
                      <p className="text-sm font-bold">{(webSecData.summary.totalRequests || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Allowed</p>
                      <p className="text-sm font-bold text-green-600">{(webSecData.summary.totalAllowed || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Denied</p>
                      <p className="text-sm font-bold text-red-600">{(webSecData.summary.totalDenied || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Bandwidth</p>
                      <p className="text-sm font-bold">{(webSecData.summary.totalBandwidthMB || 0).toLocaleString()} MB</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Unique Users</p>
                      <p className="text-sm font-bold text-blue-600">{(webSecData.summary.totalUniqueUsers || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">AI Apps</p>
                      <p className="text-sm font-bold text-purple-600">{(webSecData.summary.totalAiApps || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ExpandableCard title="Site Reputation Distribution"
                  headerExtra={<ChartTypeSelector active={ct("webRepDist", "pie")} onChange={(v) => setCt("webRepDist", v)} />}>
                  <FlexChart
                    data={webSecData.reputationDistribution || []}
                    chartType={ct("webRepDist", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ "Minimal Risk": C.green, "Low Risk": C.teal, Unverified: C.yellow, "Medium Risk": C.orange, "High Risk": C.red }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Web Requests by Action"
                  headerExtra={<ChartTypeSelector active={ct("webActionDist", "pie")} onChange={(v) => setCt("webActionDist", v)} />}>
                  <FlexChart
                    data={webSecData.actionDistribution || []}
                    chartType={ct("webActionDist", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ Allowed: C.green, Denied: C.red, Isolated: C.orange }}
                  />
                </ExpandableCard>

                <ExpandableCard title="URL Category Distribution"
                  headerExtra={<ChartTypeSelector active={ct("webCatDist", "bar")} onChange={(v) => setCt("webCatDist", v)} />}>
                  <FlexChart
                    data={(webSecData.categoryDistribution || []).slice(0, 12)}
                    chartType={ct("webCatDist", "bar")}
                    dataKey="value"
                    height={250}
                    layout="vertical"
                    yAxisWidth={160}
                  />
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top URLs / Destinations (by Requests)"
                  headerExtra={<ChartTypeSelector active={ct("topWebSites", "bar")} onChange={(v) => setCt("topWebSites", v)} />}>
                  <FlexChart
                    data={(webSecData.topSites || []).slice(0, 15).map((s: any) => ({ name: s.site?.substring(0, 35), value: s.requests }))}
                    chartType={ct("topWebSites", "bar")}
                    dataKey="value"
                    height={320}
                    layout="vertical"
                    yAxisWidth={180}
                  />
                </ExpandableCard>

                <ExpandableCard title="Web Requests by Users (Top Sources)"
                  headerExtra={<ChartTypeSelector active={ct("topWebUsers", "bar")} onChange={(v) => setCt("topWebUsers", v)} />}>
                  <FlexChart
                    data={(webSecData.topUsers || []).slice(0, 15).map((u: any) => ({ name: u.user?.substring(0, 30), value: u.requests }))}
                    chartType={ct("topWebUsers", "bar")}
                    dataKey="value"
                    height={320}
                    layout="vertical"
                    yAxisWidth={140}
                  />
                </ExpandableCard>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ExpandableCard title="Top AI Apps by Requests" icon={Bot}>
                  {(webSecData.topAiAppsByRequests || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">AI Application</TableHead>
                            <TableHead className="text-[10px] uppercase">Requests</TableHead>
                            <TableHead className="text-[10px] uppercase">Users</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.topAiAppsByRequests || []).slice(0, 15).map((app: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-ai-app-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/application/${encodeURIComponent(app.name)}`)}>
                              <TableCell className="text-[11px] font-medium">
                                <div className="flex items-center gap-2">
                                  <AppLogo name={app.name} size={16} fallbackIcon="bot" fallbackColor="text-purple-500" />
                                  <span className="text-blue-600 dark:text-blue-400 hover:underline">{app.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-[11px] font-mono">{(app.requests || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-[11px] font-mono">{app.users || 0}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No AI application activity detected</div>
                  )}
                </ExpandableCard>

                <ExpandableCard title="Top AI Apps by Users" icon={Users}>
                  {(webSecData.topAiAppsByUsers || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">AI Application</TableHead>
                            <TableHead className="text-[10px] uppercase">Users</TableHead>
                            <TableHead className="text-[10px] uppercase">Requests</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(webSecData.topAiAppsByUsers || []).slice(0, 15).map((app: any, idx: number) => (
                            <TableRow key={idx} data-testid={`row-ai-app-users-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entity-profile/${currentTenant?.id}/application/${encodeURIComponent(app.name)}`)}>
                              <TableCell className="text-[11px] font-medium">
                                <div className="flex items-center gap-2">
                                  <AppLogo name={app.name} size={16} fallbackIcon="bot" fallbackColor="text-purple-500" />
                                  <span className="text-blue-600 dark:text-blue-400 hover:underline">{app.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-[11px] font-mono font-semibold">{app.users || 0}</TableCell>
                              <TableCell className="text-[11px] font-mono">{(app.requests || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No AI application activity detected</div>
                  )}
                </ExpandableCard>
              </div>
            </>
          )}

          {webSecData?.dataMode !== "cloud_activity" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Top10 title="DLP Violations" data={s.dlpByThreat} icon={Lock}
                  onItemClick={(item) => openDrilldown("threat", item.name, `DLP Violation: ${item.name}`, "dlp")} />
                <Top10 title="Cloud Misconfigurations" data={s.cloudByThreat} icon={Cloud}
                  onItemClick={(item) => openDrilldown("threat", item.name, `Cloud Misconfiguration: ${item.name}`, "cloud")} />
                <Top10 title="Cloud Services" data={s.cloudApps} icon={Server}
                  onItemClick={(item) => openDrilldown("app", item.name, `Cloud Service: ${item.name}`)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider">CASB Actions</CardTitle>
                    <ChartTypeSelector active={ct("casbActions", "pie")} onChange={(v) => setCt("casbActions", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={s.casbActions}
                      chartType={ct("casbActions", "pie")}
                      dataKey="value"
                      height={220}
                      colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider">DLP Actions</CardTitle>
                    <ChartTypeSelector active={ct("dlpActions", "pie")} onChange={(v) => setCt("dlpActions", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={s.dlpActions}
                      chartType={ct("dlpActions", "pie")}
                      dataKey="value"
                      height={220}
                      colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="web" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="cloud" onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "network" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="network-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="Network Events" value={s.networkTotal} icon={Network} color={C.blue} />
            <MetricCard title="Identity Events" value={s.identityTotal} icon={Fingerprint} color={C.purple} />
            <MetricCard title="IDS/IPS Alerts" value={s.networkTotal} icon={ShieldAlert} color={C.red} />
            <MetricCard title="Auth Failures" value={(s.identityByThreat || []).reduce((s: number, t: any) => s + t.count, 0)} icon={KeyRound} color={C.orange} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Network Threats" data={s.networkByThreat} icon={Network}
              onItemClick={(item) => openDrilldown("threat", item.name, `Network Threat: ${item.name}`, "network")} />
            <Top10 title="Identity Threats" data={s.identityByThreat} icon={Fingerprint}
              onItemClick={(item) => openDrilldown("threat", item.name, `Identity Threat: ${item.name}`, "identity")} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Network Protocols</CardTitle>
                <ChartTypeSelector active={ct("networkProtocols", "pie")} onChange={(v) => setCt("networkProtocols", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.networkProtocols}
                  chartType={ct("networkProtocols", "pie")}
                  dataKey="value"
                  height={220}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Identity Action Distribution</CardTitle>
                <ChartTypeSelector active={ct("identityActions", "pie")} onChange={(v) => setCt("identityActions", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.identityActions}
                  chartType={ct("identityActions", "pie")}
                  dataKey="value"
                  height={220}
                  colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Attack Origin Countries</CardTitle>
                <ChartTypeSelector active={ct("networkCountries", "bar")} onChange={(v) => setCt("networkCountries", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={(s.topCountries || []).slice(0, 8)}
                  chartType={ct("networkCountries", "bar")}
                  dataKey="count"
                  height={220}
                  xAxisAngle={-20}
                  xAxisHeight={50}
                />
              </CardContent>
            </Card>
          </div>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="network" />}
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="identity" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey={["network", "identity"]} onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "identity" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="identity-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="Identity Events" value={s.identityTotal} icon={Fingerprint} color={C.purple} />
            <MetricCard title="Auth Failures" value={(s.identityByThreat || []).reduce((acc: number, t: any) => acc + t.count, 0)} icon={KeyRound} color={C.orange} />
            <MetricCard title="Identity Threats" value={(s.identityByThreat || []).length} icon={UserX} color={C.red} />
            <MetricCard title="Identity Actions" value={(s.identityActions || []).reduce((acc: number, a: any) => acc + (a.value || 0), 0)} icon={Users} color={C.blue} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Identity Threats" data={s.identityByThreat} icon={Fingerprint}
              onItemClick={(item) => openDrilldown("threat", item.name, `Identity Threat: ${item.name}`, "identity")} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Identity Action Distribution</CardTitle>
                <ChartTypeSelector active={ct("identityActions", "pie")} onChange={(v) => setCt("identityActions", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.identityActions}
                  chartType={ct("identityActions", "pie")}
                  dataKey="value"
                  height={220}
                  colors={{ blocked: C.green, alerted: C.orange, logged: C.blue }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Identity Attack Origins</CardTitle>
                <ChartTypeSelector active={ct("identityCountries", "bar")} onChange={(v) => setCt("identityCountries", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={(s.topCountries || []).slice(0, 8)}
                  chartType={ct("identityCountries", "bar")}
                  dataKey="count"
                  height={220}
                  xAxisAngle={-20}
                  xAxisHeight={50}
                />
              </CardContent>
            </Card>
          </div>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="identity" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="identity" onDrilldown={openDrilldown} />
        </div>
        )}

        {activeTab === "cloud_security" && (() => {
          const apps = cloudRiskScores?.scores || [];
          const trusted = apps.filter((a: any) => a.riskClassification === "trusted");
          const moderate = apps.filter((a: any) => a.riskClassification === "moderate");
          const risky = apps.filter((a: any) => a.riskClassification === "risky");
          const shadowIT = apps.filter((a: any) => a.isShadowIt);
          const avgCI = apps.length > 0 ? Math.round(apps.reduce((sum: number, a: any) => sum + (a.confidenceIndex || 0), 0) / apps.length) : 0;
          const riskDist = [
            { name: "Trusted", value: trusted.length, fill: C.green },
            { name: "Moderate", value: moderate.length, fill: C.yellow },
            { name: "Risky", value: risky.length, fill: C.red },
          ].filter(d => d.value > 0);
          const catMap: Record<string, number> = {};
          apps.forEach((a: any) => { const c = a.serviceCategory || "Other"; catMap[c] = (catMap[c] || 0) + 1; });
          const catDist = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
          return (
        <div className="space-y-4 animate-tab-fade-in" data-testid="cloud-security-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="Total Cloud Apps" value={apps.length} icon={Cloud} color={C.blue} />
            <MetricCard title="Trusted" value={trusted.length} icon={ShieldCheck} color={C.green} />
            <MetricCard title="Moderate Risk" value={moderate.length} icon={AlertCircle} color={C.yellow} />
            <MetricCard title="Risky" value={risky.length} icon={AlertTriangle} color={C.red} />
            <MetricCard title="Shadow IT" value={shadowIT.length} icon={AppWindow} color={C.orange} />
            <MetricCard title="Avg Confidence" value={avgCI} sub="/100" icon={Gauge} color={C.teal} />
          </div>
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2"><Cloud className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Cloud Application Security Posture</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Monitoring <strong>{apps.length}</strong> cloud applications. <strong>{trusted.length}</strong> trusted, <strong>{moderate.length}</strong> moderate, <strong>{risky.length}</strong> risky. <strong>{shadowIT.length}</strong> shadow IT detected.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="Risk Classification" headerExtra={<ChartTypeSelector active={ct("cloudRiskClass", "pie")} onChange={(v) => setCt("cloudRiskClass", v)} />}>
              <FlexChart data={riskDist} chartType={ct("cloudRiskClass", "pie")} dataKey="value" height={220} colors={{ Trusted: C.green, Moderate: C.yellow, Risky: C.red }} />
            </ExpandableCard>
            <ExpandableCard title="Service Categories" headerExtra={<ChartTypeSelector active={ct("cloudCatDist", "bar")} onChange={(v) => setCt("cloudCatDist", v)} />}>
              <FlexChart data={catDist} chartType={ct("cloudCatDist", "bar")} dataKey="value" height={220} />
            </ExpandableCard>
            <ExpandableCard title="Confidence Score Distribution" headerExtra={<ChartTypeSelector active={ct("cloudCIDist", "bar")} onChange={(v) => setCt("cloudCIDist", v)} />}>
              <FlexChart data={[
                { name: "0-20", value: apps.filter((a: any) => (a.confidenceIndex || 0) <= 20).length },
                { name: "21-40", value: apps.filter((a: any) => (a.confidenceIndex || 0) > 20 && (a.confidenceIndex || 0) <= 40).length },
                { name: "41-60", value: apps.filter((a: any) => (a.confidenceIndex || 0) > 40 && (a.confidenceIndex || 0) <= 60).length },
                { name: "61-80", value: apps.filter((a: any) => (a.confidenceIndex || 0) > 60 && (a.confidenceIndex || 0) <= 80).length },
                { name: "81-100", value: apps.filter((a: any) => (a.confidenceIndex || 0) > 80).length },
              ].filter(d => d.value > 0)} chartType={ct("cloudCIDist", "bar")} dataKey="value" height={220} />
            </ExpandableCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Risky Cloud Applications</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-[10px]">Application</TableHead><TableHead className="text-[10px]">Category</TableHead><TableHead className="text-[10px]">CI Score</TableHead><TableHead className="text-[10px]">Risk</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {risky.slice(0, 15).map((app: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{app.appName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{app.serviceCategory || "—"}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[9px]">{app.confidenceIndex}</Badge></TableCell>
                        <TableCell><Badge className="text-[9px] bg-red-500/10 text-red-600 border-red-500/30">Risky</Badge></TableCell>
                      </TableRow>
                    ))}
                    {risky.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-8">No risky applications detected</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Shadow IT Applications</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-[10px]">Application</TableHead><TableHead className="text-[10px]">Category</TableHead><TableHead className="text-[10px]">CI Score</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {shadowIT.slice(0, 15).map((app: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{app.appName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{app.serviceCategory || "—"}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[9px]">{app.confidenceIndex}</Badge></TableCell>
                        <TableCell><Badge className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/30">Shadow IT</Badge></TableCell>
                      </TableRow>
                    ))}
                    {shadowIT.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-8">No shadow IT applications detected</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="cloud" />}
        </div>
          );
        })()}

        {activeTab === "ai_security" && (() => {
          const allApps = cloudRiskScores?.scores || [];
          const aiApps = allApps.filter((a: any) => a.isAiService);
          const aiRisky = aiApps.filter((a: any) => a.riskClassification === "risky");
          const aiModerate = aiApps.filter((a: any) => a.riskClassification === "moderate");
          const aiTrusted = aiApps.filter((a: any) => a.riskClassification === "trusted");
          const aiShadow = aiApps.filter((a: any) => a.isShadowIt);
          const avgAICI = aiApps.length > 0 ? Math.round(aiApps.reduce((sum: number, a: any) => sum + (a.confidenceIndex || 0), 0) / aiApps.length) : 0;
          const aiCatMap: Record<string, number> = {};
          aiApps.forEach((a: any) => { const c = a.serviceCategory || "AI/ML"; aiCatMap[c] = (aiCatMap[c] || 0) + 1; });
          const aiCatDist = Object.entries(aiCatMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
          const webAIApps = webSecData?.aiApps || [];
          const topAIUsers = webSecData?.topAIUsers || [];
          return (
        <div className="space-y-4 animate-tab-fade-in" data-testid="ai-security-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="AI Services Detected" value={aiApps.length} icon={Bot} color={C.purple} />
            <MetricCard title="Risky AI Apps" value={aiRisky.length} icon={AlertTriangle} color={C.red} />
            <MetricCard title="Moderate Risk" value={aiModerate.length} icon={AlertCircle} color={C.yellow} />
            <MetricCard title="Trusted AI" value={aiTrusted.length} icon={ShieldCheck} color={C.green} />
            <MetricCard title="Shadow AI" value={aiShadow.length} icon={Eye} color={C.orange} />
            <MetricCard title="Avg AI Confidence" value={avgAICI} sub="/100" icon={Gauge} color={C.teal} />
          </div>
          <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-purple-100 dark:bg-purple-900 p-2"><Bot className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">AI Security Governance</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    Tracking <strong>{aiApps.length}</strong> AI/ML services across the organization.
                    <strong> {aiRisky.length}</strong> risky AI apps, <strong>{aiShadow.length}</strong> unapproved shadow AI tools detected.
                    {webAIApps.length > 0 && <> <strong>{webAIApps.length}</strong> actively used AI services monitored via SSE.</>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="AI App Risk Classification" headerExtra={<ChartTypeSelector active={ct("aiRiskClass", "pie")} onChange={(v) => setCt("aiRiskClass", v)} />}>
              <FlexChart data={[
                { name: "Trusted", value: aiTrusted.length, fill: C.green },
                { name: "Moderate", value: aiModerate.length, fill: C.yellow },
                { name: "Risky", value: aiRisky.length, fill: C.red },
              ].filter(d => d.value > 0)} chartType={ct("aiRiskClass", "pie")} dataKey="value" height={220} colors={{ Trusted: C.green, Moderate: C.yellow, Risky: C.red }} />
            </ExpandableCard>
            <ExpandableCard title="AI Service Categories" headerExtra={<ChartTypeSelector active={ct("aiCatDist", "bar")} onChange={(v) => setCt("aiCatDist", v)} />}>
              <FlexChart data={aiCatDist} chartType={ct("aiCatDist", "bar")} dataKey="value" height={220} />
            </ExpandableCard>
            <ExpandableCard title="AI Confidence Score Spread" headerExtra={<ChartTypeSelector active={ct("aiCIDist", "bar")} onChange={(v) => setCt("aiCIDist", v)} />}>
              <FlexChart data={[
                { name: "Critical (0-30)", value: aiApps.filter((a: any) => (a.confidenceIndex || 0) <= 30).length },
                { name: "Low (31-50)", value: aiApps.filter((a: any) => (a.confidenceIndex || 0) > 30 && (a.confidenceIndex || 0) <= 50).length },
                { name: "Medium (51-70)", value: aiApps.filter((a: any) => (a.confidenceIndex || 0) > 50 && (a.confidenceIndex || 0) <= 70).length },
                { name: "High (71-100)", value: aiApps.filter((a: any) => (a.confidenceIndex || 0) > 70).length },
              ].filter(d => d.value > 0)} chartType={ct("aiCIDist", "bar")} dataKey="value" height={220} colors={{ "Critical (0-30)": C.red, "Low (31-50)": C.orange, "Medium (51-70)": C.yellow, "High (71-100)": C.green }} />
            </ExpandableCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">AI Services Inventory</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-[10px]">AI Service</TableHead><TableHead className="text-[10px]">Category</TableHead><TableHead className="text-[10px]">CI Score</TableHead><TableHead className="text-[10px]">Risk</TableHead><TableHead className="text-[10px]">Shadow</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {aiApps.sort((a: any, b: any) => (a.confidenceIndex || 0) - (b.confidenceIndex || 0)).slice(0, 20).map((app: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{app.appName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{app.serviceCategory || "AI/ML"}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${app.confidenceIndex || 0}%`, background: (app.confidenceIndex || 0) > 70 ? C.green : (app.confidenceIndex || 0) > 50 ? C.yellow : C.red }} />
                            </div>
                            <span className="text-[10px]">{app.confidenceIndex}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${app.riskClassification === "risky" ? "bg-red-500/10 text-red-600" : app.riskClassification === "moderate" ? "bg-yellow-500/10 text-yellow-700" : "bg-green-500/10 text-green-600"}`}>
                            {app.riskClassification}
                          </Badge>
                        </TableCell>
                        <TableCell>{app.isShadowIt ? <Badge className="text-[9px] bg-orange-500/10 text-orange-600">Yes</Badge> : <span className="text-[10px] text-muted-foreground">No</span>}</TableCell>
                      </TableRow>
                    ))}
                    {aiApps.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-8">No AI services detected</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Top AI Users</CardTitle></CardHeader>
              <CardContent className="pt-0">
                {topAIUsers.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-[10px]">User</TableHead><TableHead className="text-[10px]">AI Activities</TableHead><TableHead className="text-[10px]">AI Apps Used</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {topAIUsers.slice(0, 15).map((u: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs font-medium">{u.user}</TableCell>
                          <TableCell className="text-xs">{(u.activities || u.aiActivities || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{u.aiApps || u.apps || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">AI user activity data available when SSE monitoring is active</p>
                  </div>
                )}
                {webAIApps.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active AI Applications (SSE)</p>
                    <div className="flex flex-wrap gap-1">
                      {webAIApps.slice(0, 20).map((app: any, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-[9px]">{app.name} ({app.activities})</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
          );
        })()}

        {activeTab === "vulnerability" && (
        <div className="space-y-4 animate-tab-fade-in" data-testid="vuln-tab-content">
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-card-enter-1 p-2 -m-2 ${liveMode ? "domain-live-ring" : ""}`}>
            <MetricCard title="Total Vulnerabilities" value={s.vulnTotal || 0} icon={Bug} color={C.red} />
            <MetricCard title="Unique CVEs" value={s.vulnUniqueCves || 0} icon={Fingerprint} color={C.purple} />
            <MetricCard title="CISA KEV" value={s.vulnKevCount || 0} sub="Known Exploited" icon={AlertTriangle} color={C.red} />
            <MetricCard title="Avg CVSS" value={s.vulnAvgCvss || "0"} sub={`Exploit: ${s.vulnAvgExploit || "0"}`} icon={Gauge} color={C.orange} />
            <MetricCard title="Patch Available" value={s.vulnPatchAvailCount || 0} icon={CheckCircle2} color={C.green} />
            <MetricCard title="No Patch" value={s.vulnNoPatchCount || 0} icon={XCircle} color={C.red} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ExpandableCard title="CVE Severity Distribution"
              headerExtra={<ChartTypeSelector active={ct("vulnSevDist", "pie")} onChange={(v) => setCt("vulnSevDist", v)} />}>
              <FlexChart
                data={s.vulnSeverityDist?.length > 0 ? s.vulnSeverityDist : s.vulnerabilitySeverity}
                chartType={ct("vulnSevDist", "pie")}
                dataKey="value"
                height={220}
                colors={SEV}
              />
            </ExpandableCard>
            <ExpandableCard title="CVSS Score Distribution"
              headerExtra={<ChartTypeSelector active={ct("vulnCvss", "bar")} onChange={(v) => setCt("vulnCvss", v)} />}>
              <FlexChart
                data={s.vulnCvssDistribution?.length > 0 ? s.vulnCvssDistribution : []}
                chartType={ct("vulnCvss", "bar")}
                dataKey="value"
                height={220}
                colors={{ "Critical (9-10)": C.red, "High (7-8.9)": C.orange, "Medium (4-6.9)": C.blue, "Low (0-3.9)": C.green }}
              />
            </ExpandableCard>
            <ExpandableCard title="Patch Availability"
              headerExtra={<ChartTypeSelector active={ct("vulnPatch", "pie")} onChange={(v) => setCt("vulnPatch", v)} />}>
              <FlexChart
                data={s.vulnPatchStatus?.length > 0 ? s.vulnPatchStatus : []}
                chartType={ct("vulnPatch", "pie")}
                dataKey="value"
                height={220}
                colors={{ "Patch Available": C.green, "No Patch": C.red }}
              />
            </ExpandableCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Top10 title="Top Affected Products" data={s.vulnTopProducts || s.topVulnerableApps} icon={Layers}
              onItemClick={(item) => openDrilldown("app", item.name, `Product: ${item.name}`)} />
            <Top10 title="Top Vulnerable Endpoints" data={s.vulnTopEndpoints || []} icon={Monitor}
              onItemClick={(item) => openDrilldown("target", item.name, `Endpoint: ${item.name}`, "vulnerability")} />
            <ExpandableCard title="Vulnerability Aging"
              headerExtra={<ChartTypeSelector active={ct("vulnAge", "bar")} onChange={(v) => setCt("vulnAge", v)} />}>
              <FlexChart
                data={s.vulnAging || []}
                chartType={ct("vulnAge", "bar")}
                dataKey="value"
                height={220}
                colors={{ "0-30 days": C.green, "31-60 days": C.blue, "61-90 days": C.orange, "90+ days": C.red }}
              />
            </ExpandableCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Top10 title="Top Publishers" data={s.vulnTopPublishers || []} icon={FileText}
              onItemClick={(item) => openDrilldown("source", item.name, `Publisher: ${item.name}`)} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Top Vulnerable Assets</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {s.topVulnAssets.length > 0 ? (
                  <div className="overflow-x-auto" data-testid="top-vuln-assets">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-semibold text-muted-foreground">#</th>
                          <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Asset</th>
                          <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Total</th>
                          <th className="text-center py-2 px-3 font-semibold text-red-500">Critical</th>
                          <th className="text-center py-2 px-3 font-semibold text-orange-500">High</th>
                          <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.topVulnAssets.map((a: any, i: number) => {
                          const riskPct = Math.min(100, ((a.critical * 3 + a.high * 2 + (a.total - a.critical - a.high)) / (a.total * 3)) * 100);
                          const riskColor = riskPct > 66 ? C.red : riskPct > 33 ? C.orange : C.green;
                          return (
                            <tr key={a.name} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 px-3 font-medium">{a.name}</td>
                              <td className="text-center py-2 px-3">{a.total}</td>
                              <td className="text-center py-2 px-3">{a.critical > 0 ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{a.critical}</Badge> : "—"}</td>
                              <td className="text-center py-2 px-3">{a.high > 0 ? <Badge className="text-[10px] px-1.5 py-0 bg-orange-500">{a.high}</Badge> : "—"}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${riskPct}%`, backgroundColor: riskColor }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">{Math.round(riskPct)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
              </CardContent>
            </Card>
          </div>
          {currentTenant?.id && <ThreatFlowSection tenantId={currentTenant.id} domain="vulnerability" />}
          <DomainInsightsPanel insights={s.domainInsights} domainKey="vulnerability" onDrilldown={openDrilldown} />
        </div>
        )}
        {activeTab === "threat_intel" && (
        <div className="space-y-4 mt-6" data-testid="tab-content-analysis">
          {threatLoading ? (
            <div className="space-y-4">
              <Card><CardContent className="p-5"><Skeleton className="h-40" /></CardContent></Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
                <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
              </div>
              <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
            </div>
          ) : (
            <>
              <Card data-testid="card-key-observations">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                    <Brain className="w-4 h-4" />
                    Key Observations
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {(threatAnalysis?.keyObservations || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">No observations available</p>
                  ) : (
                    <div className="space-y-2">
                      {(threatAnalysis?.keyObservations || []).map((obs: any, idx: number) => {
                        const sevColor = obs.severity === "critical" ? C.red : obs.severity === "high" ? C.orange : C.yellow;
                        const ObsIcon = getThreatIcon(obs.type);
                        return (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/30"
                            style={{ borderLeft: `4px solid ${sevColor}` }}
                            data-testid={`observation-row-${idx}`}>
                            <ObsIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: sevColor }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px]">{obs.message}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px] h-4 px-1" style={{ borderColor: sevColor, color: sevColor }}>{obs.severity}</Badge>
                                <span className="text-[9px] text-muted-foreground capitalize">{obs.type}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="card-repeated-attacks">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <Target className="w-4 h-4" />
                      Repeated Attack Patterns
                    </CardTitle>
                    <ChartTypeSelector active={ct("repeatedAttacks", "bar")} onChange={(v) => setCt("repeatedAttacks", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={(threatAnalysis?.repeatedThreats || []).slice(0, 10)}
                      chartType={ct("repeatedAttacks", "bar")}
                      dataKey="count"
                      height={300}
                      layout="vertical"
                      yAxisWidth={120}
                    />
                  </CardContent>
                </Card>

                <Card data-testid="card-targeted-systems">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <Monitor className="w-4 h-4" />
                      Most Targeted Systems
                    </CardTitle>
                    <ChartTypeSelector active={ct("targetedSystems", "bar")} onChange={(v) => setCt("targetedSystems", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={(threatAnalysis?.mostTargetedSystems || []).slice(0, 10)}
                      chartType={ct("targetedSystems", "bar")}
                      dataKey="count"
                      height={300}
                      layout="vertical"
                      yAxisWidth={120}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="card-top-techniques">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <Shield className="w-4 h-4" />
                      Top Attack Techniques (MITRE)
                    </CardTitle>
                    <ChartTypeSelector active={ct("topTechniques", "bar")} onChange={(v) => setCt("topTechniques", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={(threatAnalysis?.topTechniques || []).slice(0, 10)}
                      chartType={ct("topTechniques", "bar")}
                      dataKey="count"
                      height={300}
                      layout="vertical"
                      yAxisWidth={140}
                    />
                  </CardContent>
                </Card>

                <Card data-testid="card-tactics-distribution">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <Crosshair className="w-4 h-4" />
                      Attack Tactics Distribution
                    </CardTitle>
                    <ChartTypeSelector active={ct("tacticsDistribution", "pie")} onChange={(v) => setCt("tacticsDistribution", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={(threatAnalysis?.topTactics || []).slice(0, 8).map((t: any) => ({ name: t.name, value: t.count }))}
                      chartType={ct("tacticsDistribution", "pie")}
                      dataKey="value"
                      height={220}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card data-testid="card-attack-trend">
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                    <Activity className="w-4 h-4" />
                    Attack Volume Trend
                  </CardTitle>
                  <ChartTypeSelector active={ct("attackTrend", "area")} onChange={(v) => setCt("attackTrend", v)} />
                </CardHeader>
                <CardContent className="pt-0">
                  <FlexChart
                    data={threatAnalysis?.dailyTrend || []}
                    chartType={ct("attackTrend", "area")}
                    nameKey="date"
                    dataKey="count"
                    height={280}
                    series={[{ dataKey: "count", name: "Attacks", color: C.purple, gradientId: "gThreatTrend" }]}
                  />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="card-attacks-by-layer">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <Server className="w-4 h-4" />
                      Attacks by Security Layer
                    </CardTitle>
                    <ChartTypeSelector active={ct("attacksByLayer", "bar")} onChange={(v) => setCt("attacksByLayer", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={threatAnalysis?.attacksByLayer || []}
                      chartType={ct("attacksByLayer", "bar")}
                      nameKey="layer"
                      dataKey="count"
                      height={250}
                    />
                  </CardContent>
                </Card>

                <Card data-testid="card-severity-distribution">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4" />
                      Severity Distribution
                    </CardTitle>
                    <ChartTypeSelector active={ct("severityDistribution", "pie")} onChange={(v) => setCt("severityDistribution", v)} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <FlexChart
                      data={threatAnalysis?.severityDistribution ? [
                        { name: "critical", value: threatAnalysis.severityDistribution.critical || 0 },
                        { name: "high", value: threatAnalysis.severityDistribution.high || 0 },
                        { name: "medium", value: threatAnalysis.severityDistribution.medium || 0 },
                        { name: "low", value: threatAnalysis.severityDistribution.low || 0 },
                      ] : []}
                      chartType={ct("severityDistribution", "pie")}
                      dataKey="value"
                      height={220}
                      colors={SEV}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
        )}

      </div>

      {liveFeedOpen && (
        <div className="fixed bottom-0 right-4 w-96 max-h-96 z-40 bg-card border rounded-t-xl shadow-2xl flex flex-col" data-testid="live-feed-panel">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 rounded-t-xl">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Live Event Feed</span>
              <span className={`w-1.5 h-1.5 rounded-full ${liveFeedConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            </div>
            <div className="flex items-center gap-1">
              {liveSessionCount > 0 && (
                <Badge variant="secondary" className="text-[9px] font-mono h-4 px-1.5">{liveSessionCount} this session</Badge>
              )}
              <Button variant="ghost" size="sm" className="px-1"
                onClick={() => setLiveFeedPaused(!liveFeedPaused)} data-testid="live-feed-pause">
                {liveFeedPaused ? <Activity className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
              </Button>
              <Button variant="ghost" size="sm" className="px-1"
                onClick={() => setLiveFeedOpen(false)} data-testid="live-feed-close">
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div ref={liveFeedRef} className="flex-1 overflow-y-auto p-2 space-y-1"
            onMouseEnter={() => setLiveFeedPaused(true)} onMouseLeave={() => setLiveFeedPaused(false)}>
            {liveEvents.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                <Radio className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p>Waiting for events...</p>
                <p className="text-[10px] mt-1">Events will appear here as they are ingested</p>
              </div>
            ) : (
              liveEvents.map((evt, idx) => {
                const sevColor = evt.severity === "critical" ? "text-red-500" :
                  evt.severity === "high" ? "text-orange-500" :
                  evt.severity === "medium" ? "text-yellow-500" :
                  evt.severity === "low" ? "text-blue-500" : "text-muted-foreground";
                const sevBg = evt.severity === "critical" ? "bg-red-500/10 border-red-500/20" :
                  evt.severity === "high" ? "bg-orange-500/10 border-orange-500/20" :
                  evt.severity === "medium" ? "bg-yellow-500/10 border-yellow-500/20" :
                  evt.severity === "low" ? "bg-blue-500/10 border-blue-500/20" : "bg-muted/30 border-muted";
                return (
                  <div key={`${evt.id}-${idx}`} className={`rounded border px-2 py-1.5 ${sevBg} transition-all duration-300`}
                    data-testid={`live-event-${evt.id}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sevColor.replace("text-", "bg-")}`} />
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono shrink-0">{evt.eventType}</Badge>
                      <span className={`text-[9px] font-semibold uppercase ${sevColor}`}>{evt.severity}</span>
                      <span className="text-[8px] text-muted-foreground ml-auto font-mono">
                        {evt.occurredAt ? fmt.formatTime(evt.occurredAt) : "now"}
                      </span>
                    </div>
                    {evt.threat && <p className="text-[10px] mt-0.5 truncate font-medium">{evt.threat}</p>}
                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                      {evt.target && <span className="truncate">→ {evt.target}</span>}
                      {evt.attacker && <span className="truncate">← {evt.attacker}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {drilldown?.open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12" data-testid="drilldown-overlay">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDrilldown} />
          <div className="relative w-full max-w-5xl max-h-[80vh] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4" data-testid="drilldown-modal">
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2" data-testid="drilldown-title">
                  <Shield className="w-4 h-4 text-primary" />
                  {drilldown.label}
                </h3>
                {drilldownData && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {drilldownData.totalIncidents} incident{drilldownData.totalIncidents !== 1 ? "s" : ""} &middot; {drilldownData.totalEvents} event{drilldownData.totalEvents !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={closeDrilldown} data-testid="drilldown-close">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drilldownLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : drilldownData ? (
                <div className="space-y-4">
                  {drilldownData.totalIncidents > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Incidents ({drilldownData.totalIncidents})
                      </h4>
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="text-[10px] font-semibold w-12">ID</TableHead>
                              <TableHead className="text-[10px] font-semibold">Title</TableHead>
                              <TableHead className="text-[10px] font-semibold w-20">Severity</TableHead>
                              <TableHead className="text-[10px] font-semibold w-20">Status</TableHead>
                              <TableHead className="text-[10px] font-semibold w-32">MITRE Tactic</TableHead>
                              <TableHead className="text-[10px] font-semibold w-32">Kill Chain</TableHead>
                              <TableHead className="text-[10px] font-semibold w-28">Date</TableHead>
                              <TableHead className="text-[10px] font-semibold w-16">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {drilldownData.incidents.map((item: any) => (
                              <TableRow key={`inc-${item.id}`} className="hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/events?domain=overview&incidentId=${item.id}`)} data-testid={`drilldown-incident-${item.id}`}>
                                <TableCell className="text-[10px] font-mono">#{item.id}</TableCell>
                                <TableCell className="text-[10px] font-medium max-w-[300px] truncate" title={item.title}>{item.title}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px] h-5 px-1.5" style={{ borderColor: SEV[item.severity], color: SEV[item.severity] }}>
                                    {item.severity}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={item.status === "open" ? "destructive" : "secondary"} className="text-[9px] h-5 px-1.5">
                                    {item.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground truncate">{item.mitreTactic || "—"}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground truncate">{item.killChainPhase || "—"}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground">{item.createdAt ? fmt.formatDate(item.createdAt) : "—"}</TableCell>
                                <TableCell>
                                  <Link href={`/events?domain=overview&incidentId=${item.id}`}>
                                    <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2" data-testid={`drilldown-view-incident-${item.id}`}>
                                      <Eye className="w-3 h-3 mr-1" /> View
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                  {drilldownData.totalEvents > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5" />
                        Security Events ({drilldownData.totalEvents})
                      </h4>
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="text-[10px] font-semibold w-12">ID</TableHead>
                              <TableHead className="text-[10px] font-semibold">Description</TableHead>
                              <TableHead className="text-[10px] font-semibold w-20">Severity</TableHead>
                              <TableHead className="text-[10px] font-semibold w-24">Type</TableHead>
                              <TableHead className="text-[10px] font-semibold w-32">MITRE Tactic</TableHead>
                              <TableHead className="text-[10px] font-semibold w-24">Source</TableHead>
                              <TableHead className="text-[10px] font-semibold w-28">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {drilldownData.events.map((item: any) => (
                              <TableRow key={`ev-${item.id}`} className="hover:bg-muted/20" data-testid={`drilldown-event-${item.id}`}>
                                <TableCell className="text-[10px] font-mono">#{item.id}</TableCell>
                                <TableCell className="text-[10px] font-medium max-w-[300px] truncate" title={item.title}>{item.title}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px] h-5 px-1.5" style={{ borderColor: SEV[item.severity], color: SEV[item.severity] }}>
                                    {item.severity}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{item.category}</Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground truncate">{item.mitreTactic || "—"}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground truncate">{item.source || "—"}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground">{item.createdAt ? fmt.formatDate(item.createdAt) : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                  {drilldownData.totalIncidents === 0 && drilldownData.totalEvents === 0 && (
                    <div className="text-center py-12">
                      <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No matching events or incidents found for this filter.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">Loading drill-down data...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
