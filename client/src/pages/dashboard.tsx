import { useState, useRef, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  AlertTriangle, Shield, Ticket, TrendingUp, TrendingDown, Activity, ArrowUpRight,
  Mail, Monitor, Bug, Crosshair, Target, Skull, AppWindow, Globe, Cloud, Lock,
  ShieldAlert, ShieldCheck, ShieldOff, Wifi, Database, Eye, Zap, Clock, Timer,
  Server, AlertCircle, FileWarning, Ban, CheckCircle2, XCircle, Gauge, Radio,
  Network, Fingerprint, KeyRound, UserX, Upload, Download, Search, Radar, HardDrive,
  Brain, Maximize2, Minimize2, Image, FileText, X, ChevronLeft, ChevronRight,
  BarChart3, LineChart as LineChartIcon, TrendingUp as AreaChartIcon, PieChart as PieChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap,
  LineChart as RechartsLineChart, Line,
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
          className="transition-all duration-1000" />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={color}
          fontSize="22" fontWeight="700">{score}</text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, color, trend }: {
  title: string; value: string | number; sub?: string; icon: any; color?: string; trend?: "up" | "down";
}) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: color || C.blue }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {sub && (
              <div className="flex items-center gap-1">
                {trend === "up" && <TrendingUp className="w-3 h-3 text-chart-2" />}
                {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className="text-[10px] text-muted-foreground">{sub}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: `${color || C.blue}20` }}>
            <Icon className="w-5 h-5" style={{ color: color || C.blue }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Top10({ title, data, icon: Icon, showBar = true }: {
  title: string; data: { name: string; count: number }[]; icon: any; showBar?: boolean;
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
                <div key={idx} className="flex items-center gap-2" data-testid={`top10-row-${idx}`}>
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
        <Legend wrapperStyle={{ fontSize: "10px" }} formatter={(v) => <span className="capitalize text-[10px]">{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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

function ExpandableCard({ title, children, className, headerExtra, icon: HeaderIcon }: { title: string; children: ReactNode; className?: string; headerExtra?: ReactNode; icon?: any }) {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const exportAs = useCallback(async (type: "png" | "pdf") => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
        scale: 2,
        useCORS: true,
      });
      if (type === "png") {
        const link = document.createElement("a");
        link.download = `${title.replace(/\s+/g, "_")}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save(`${title.replace(/\s+/g, "_")}.pdf`);
      }
    } catch (e) { console.error("Export failed:", e); }
    setExporting(false);
  }, [title]);

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="expanded-overlay" onClick={() => setExpanded(false)}>
        <div className="bg-card border rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[95vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider">{title}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => exportAs("png")} disabled={exporting} data-testid="export-png" className="h-7 text-[10px] gap-1">
                <Image className="w-3.5 h-3.5" /> PNG
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportAs("pdf")} disabled={exporting} data-testid="export-pdf" className="h-7 text-[10px] gap-1">
                <FileText className="w-3.5 h-3.5" /> PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} data-testid="close-expanded" className="h-7">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div ref={contentRef} className="p-6">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          {HeaderIcon && <HeaderIcon className="w-4 h-4" />}
          {title}
        </CardTitle>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button onClick={() => exportAs("png")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as PNG">
            <Image className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => exportAs("pdf")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as PDF">
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(true)} data-testid="expand-card" className="p-1 rounded text-muted-foreground hover:text-foreground" title="Expand">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0" ref={contentRef}>{children}</CardContent>
    </Card>
  );
}

interface SeriesConfig {
  dataKey: string;
  name?: string;
  color: string;
  gradientId?: string;
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

  const resolvedData = data.map(d => {
    const val = d[dataKey] !== undefined ? d[dataKey] : d.count !== undefined ? d.count : d.value;
    return { ...d, [dataKey]: val };
  });

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={resolvedData} cx="50%" cy="50%" innerRadius={Math.max(height / 5, 30)} outerRadius={Math.max(height / 3, 55)}
            paddingAngle={3} dataKey={dataKey} nameKey={nameKey}
            animationBegin={0} animationDuration={800}
            onClick={onItemClick ? (_, idx) => onItemClick(resolvedData[idx]) : undefined}
            style={onItemClick ? { cursor: "pointer" } : undefined}>
            {resolvedData.map((e, i) => (
              <Cell key={e[nameKey] || i} fill={colors?.[e[nameKey]] || PALETTE[i % PALETTE.length]} className={onItemClick ? "cursor-pointer" : ""} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    if (series && series.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <RechartsLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
              angle={xAxisAngle} textAnchor={xAxisAngle ? "end" : "middle"} height={xAxisHeight} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
              formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
            {series.map(s => !hiddenSeries.has(s.dataKey) && (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name || s.dataKey}
                stroke={s.color} strokeWidth={2} dot={false} animationDuration={800} />
            ))}
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
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
          <Line type="monotone" dataKey={dataKey} stroke={PALETTE[0]} strokeWidth={2} dot={false} animationDuration={800} />
        </RechartsLineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    if (series && series.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
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
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
              formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
            {series.map(s => !hiddenSeries.has(s.dataKey) && (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name || s.dataKey}
                stroke={s.color} fill={`url(#${s.gradientId || `g_${s.dataKey}`})`} strokeWidth={2}
                animationDuration={800} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
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
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
          <Area type="monotone" dataKey={dataKey} stroke={PALETTE[0]} fill={`url(#gFlex_${dataKey})`} strokeWidth={2}
            animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (series && series.length > 0) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={layout === "vertical" ? "vertical" : "horizontal"}>
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
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
            formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
          {series.map(s => !hiddenSeries.has(s.dataKey) && (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name || s.dataKey}
              fill={s.color} radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              barSize={14} animationDuration={800} />
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
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: "10px" }} onClick={legendClick}
          formatter={(v) => <span className="capitalize text-[10px] cursor-pointer">{v}</span>} />
        <Bar dataKey={dataKey} name="Events" radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          barSize={layout === "vertical" ? 14 : 28} animationDuration={800}
          onClick={onItemClick ? (data: any) => onItemClick(data) : undefined}
          style={onItemClick ? { cursor: "pointer" } : undefined}>
          {resolvedData.map((e, i) => (
            <Cell key={e[nameKey] || i} fill={colors?.[e[nameKey]] || PALETTE[i % PALETTE.length]} className={onItemClick ? "cursor-pointer" : ""} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard", currentTenant?.id],
    enabled: !!currentTenant,
  });
  const { data: assetsData, isLoading: assetsLoading } = useQuery<any>({
    queryKey: ["/api/assets", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const { data: threatAnalysis, isLoading: threatLoading } = useQuery<any>({
    queryKey: ["/api/ai/threat-analysis", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const [chartTypes, setChartTypes] = useState<Record<string, string>>({});
  const [endpointTimeline, setEndpointTimeline] = useState<string>("90D");
  const [assetPage, setAssetPage] = useState(0);
  const [assetPageSize, setAssetPageSize] = useState(25);
  const [assetFilter, setAssetFilter] = useState<{ type: string; value: string } | null>(null);

  const ct = (id: string, fallback: string) => chartTypes[id] || fallback;
  const setCt = (id: string, val: string) => setChartTypes(prev => ({ ...prev, [id]: val }));

  if (isLoading || !stats) return <DashboardSkeleton />;

  const s = {
    totalIncidents: 0, openIncidents: 0, resolvedIncidents: 0, criticalIncidents: 0,
    totalTickets: 0, openTickets: 0, totalEvents: 0, avgRiskScore: 0, criticalEvents: 0,
    blockedEvents: 0, mttrHours: 0, mttdMinutes: 0, complianceScore: 0,
    incidentTrend: [] as any[], severityBreakdown: [] as any[], categoryBreakdown: [] as any[],
    recentIncidents: [] as any[], eventsByType: [] as any[], eventsBySeverity: [] as any[],
    eventTrend: [] as any[], topThreats: [] as any[], topTargets: [] as any[],
    topAttackers: [] as any[], topVulnerableApps: [] as any[], vulnerabilitySeverity: [] as any[],
    incidentsByThreatVector: [] as any[], mitreTactics: [] as any[], topMitreTechniques: [] as any[],
    incidentsByAction: [] as any[], emailByThreat: [] as any[], topSenders: [] as any[],
    topRecipients: [] as any[], emailActions: [] as any[], emailSeverity: [] as any[],
    emailThreatVectors: [] as any[], emailTotal: 0, endpointByThreat: [] as any[],
    endpointActions: [] as any[], topInfectedHosts: [] as any[], endpointLogSources: [] as any[],
    endpointThreatVectors: [] as any[], endpointTotal: 0, casbApps: [] as any[],
    casbActions: [] as any[], casbTotal: 0, wafAttackTypes: [] as any[], wafActions: [] as any[],
    wafTargets: [] as any[], wafTotal: 0, dlpByThreat: [] as any[], dlpActions: [] as any[],
    dlpTotal: 0, sseTotal: 0, networkByThreat: [] as any[], networkProtocols: [] as any[],
    networkTotal: 0, identityByThreat: [] as any[], identityActions: [] as any[],
    identityTotal: 0, cloudByThreat: [] as any[], cloudApps: [] as any[], cloudTotal: 0,
    topLogSources: [] as any[], sourceTypes: [] as any[], logIngestionTrend: [] as any[],
    topCountries: [] as any[], ...stats,
  };

  return (
    <div className="space-y-5 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Security Operations Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{currentTenant?.name} &mdash; Real-time threat intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono">{s.totalEvents} events</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Total Incidents" value={s.totalIncidents} sub={`${s.openIncidents} open`} icon={AlertTriangle} color={C.red} />
        <MetricCard title="Critical Alerts" value={s.criticalEvents} icon={ShieldAlert} color={C.orange} />
        <MetricCard title="Remediated" value={s.blockedEvents} icon={ShieldCheck} color={C.green} />
        <MetricCard title="Risk Score" value={s.avgRiskScore} sub="/100" icon={Gauge} color={s.avgRiskScore >= 70 ? C.red : C.orange} />
        <MetricCard title="MTTR" value={`${s.mttrHours}h`} sub="Mean Time to Resolve" icon={Timer} color={C.blue} />
        <MetricCard title="MTTD" value={`${s.mttdMinutes}m`} sub="Mean Time to Detect" icon={Clock} color={C.purple} />
      </div>

      <Tabs defaultValue="soc" data-testid="dashboard-tabs">
        <div className="overflow-x-auto">
          <TabsList className="mb-4 w-auto inline-flex">
            <TabsTrigger value="soc" data-testid="tab-soc" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="assets" data-testid="tab-assets" className="text-xs">Asset Inventory</TabsTrigger>
            <TabsTrigger value="vuln" data-testid="tab-vuln" className="text-xs">Vulnerability</TabsTrigger>
            <TabsTrigger value="threats" data-testid="tab-threats" className="text-xs">Threat Intel</TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email" className="text-xs">Email Security</TabsTrigger>
            <TabsTrigger value="cloud" data-testid="tab-cloud" className="text-xs">Web Security</TabsTrigger>
            <TabsTrigger value="network" data-testid="tab-network" className="text-xs">Network</TabsTrigger>
            <TabsTrigger value="endpoint" data-testid="tab-endpoint" className="text-xs">Endpoint</TabsTrigger>
            <TabsTrigger value="webapp" data-testid="tab-webapp" className="text-xs">Web App</TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs" className="text-xs">Log Sources</TabsTrigger>
            <TabsTrigger value="analysis" data-testid="tab-analysis" className="text-xs">Threat Analysis</TabsTrigger>
          </TabsList>
        </div>

        {/* SOC Overview */}
        <TabsContent value="soc" className="space-y-4">
          <div className="grid lg:grid-cols-4 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Security Posture</CardTitle></CardHeader>
              <CardContent className="pt-0 flex flex-col items-center gap-4">
                <RiskGauge score={s.avgRiskScore} label="Overall Risk Score" size={140} />
                <RiskGauge score={s.complianceScore} label="Compliance Score" size={140} />
                <div className="grid grid-cols-2 gap-2 w-full">
                  <div className="p-2 rounded-md bg-red-500/10 text-center">
                    <p className="text-lg font-bold text-red-500">{s.criticalEvents}</p>
                    <p className="text-[9px] text-muted-foreground">Critical</p>
                  </div>
                  <div className="p-2 rounded-md bg-green-500/10 text-center">
                    <p className="text-lg font-bold text-green-500">{s.blockedEvents}</p>
                    <p className="text-[9px] text-muted-foreground">Remediated</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ExpandableCard title="Incident Trend" className="lg:col-span-2"
              headerExtra={<ChartTypeSelector active={ct("incidentTrend", "area")} onChange={(v) => setCt("incidentTrend", v)} />}>
              <FlexChart
                data={s.incidentTrend}
                chartType={ct("incidentTrend", "area")}
                nameKey="month"
                dataKey="incidents"
                height={280}
                series={[
                  { dataKey: "incidents", name: "Incidents", color: C.red, gradientId: "gInc" },
                  { dataKey: "resolved", name: "Resolved", color: C.green, gradientId: "gRes" },
                ]}
              />
            </ExpandableCard>

            <ExpandableCard title="Events by Category"
              headerExtra={<ChartTypeSelector active={ct("eventsByCategory", "pie")} onChange={(v) => setCt("eventsByCategory", v)} />}>
              <FlexChart
                data={s.eventsByType.map((e: any) => ({ name: e.type, value: e.count }))}
                chartType={ct("eventsByCategory", "pie")}
                dataKey="value"
                height={220}
              />
            </ExpandableCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ExpandableCard title="Incidents by Category"
              headerExtra={<ChartTypeSelector active={ct("categoryBreakdown", "bar")} onChange={(v) => setCt("categoryBreakdown", v)} />}>
              <FlexChart
                data={s.categoryBreakdown}
                chartType={ct("categoryBreakdown", "bar")}
                dataKey="count"
                nameKey="category"
                height={220}
                layout="vertical"
                yAxisWidth={90}
              />
            </ExpandableCard>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Recent Incidents</CardTitle>
                <a href="/incidents" className="text-[10px] text-primary flex items-center gap-0.5">View All <ArrowUpRight className="w-3 h-3" /></a>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {s.recentIncidents.map((inc: any) => {
                    const d = new Date(inc.createdAt);
                    const now = new Date();
                    const diffMs = now.getTime() - d.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHrs = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);
                    const timeAgo = diffMins < 60 ? `${diffMins}m ago` : diffHrs < 24 ? `${diffHrs}h ago` : `${diffDays}d ago`;
                    const timeStr = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
                    return (
                      <div key={inc.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 border-l-2"
                        style={{ borderLeftColor: SEV[inc.severity] || C.blue }}
                        data-testid={`incident-row-${inc.id}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: SEV[inc.severity] }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium truncate">{inc.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${SEV[inc.severity] ? "" : ""}`} style={{ borderColor: SEV[inc.severity], color: SEV[inc.severity] }}>{inc.severity}</Badge>
                              <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />{timeStr}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-mono">({timeAgo})</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant={inc.status === "open" ? "destructive" : "secondary"} className="text-[9px] shrink-0">{inc.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <ExpandableCard title="Risk Distribution"
            headerExtra={<ChartTypeSelector active={ct("riskDistribution", "pie")} onChange={(v) => setCt("riskDistribution", v)} />}>
            <FlexChart
              data={assetsData?.summary?.riskDistribution || []}
              chartType={ct("riskDistribution", "pie")}
              dataKey="value"
              height={220}
              colors={{ Critical: C.red, High: C.orange, Medium: C.yellow, Low: C.green }}
            />
          </ExpandableCard>
        </TabsContent>

        {/* Threat Intelligence */}
        <TabsContent value="threats" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Top Threats" data={s.topThreats} icon={Skull} />
            <Top10 title="Top Targets" data={s.topTargets} icon={Target} />
            <Top10 title="Top Attackers" data={s.topAttackers} icon={Crosshair} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
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
          <div className="grid lg:grid-cols-2 gap-4">
            <Top10 title="MITRE ATT&CK Techniques" data={s.topMitreTechniques} icon={Shield} />
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
        </TabsContent>

        {/* Email Security */}
        <TabsContent value="email" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Email Events" value={s.emailTotal} icon={Mail} color={C.purple} />
            <MetricCard title="Blocked" value={(s.emailActions || []).find((a: any) => a.name === "blocked")?.value || 0} icon={Ban} color={C.red} />
            <MetricCard title="Quarantined" value={(s.emailActions || []).find((a: any) => a.name === "quarantined")?.value || 0} icon={ShieldAlert} color={C.orange} />
            <MetricCard title="Delivered" value={(s.emailActions || []).find((a: any) => a.name === "delivered")?.value || 0} icon={CheckCircle2} color={C.green} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Email Threats by Type" data={s.emailByThreat} icon={Mail} />
            <Top10 title="Top Malicious Senders" data={s.topSenders} icon={Upload} />
            <Top10 title="Top Targeted Recipients" data={s.topRecipients} icon={Download} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
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
                  colors={{ blocked: C.red, quarantined: C.orange, delivered: C.green, sandboxed: C.purple, stripped: C.yellow }}
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
        </TabsContent>

        {/* Endpoint Protection */}
        <TabsContent value="endpoint" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1">
              <MetricCard title="Endpoint Events" value={s.endpointTotal} icon={Monitor} color={C.red} />
              <MetricCard title="Remediated" value={s.remediatedCount || 0} sub={`Auto: ${s.autoRemediatedCount || 0} | Manual: ${s.manualRemediatedCount || 0}`} icon={ShieldCheck} color={C.green} />
              <MetricCard title="No Remediation" value={s.noRemediationCount || 0} icon={ShieldOff} color={C.orange} />
              <MetricCard title="Remediation Rate" value={`${s.endpointTotal > 0 ? Math.round(((s.remediatedCount || 0) / s.endpointTotal) * 100) : 0}%`} icon={Gauge} color={C.blue} />
              <MetricCard title="Auto-Remediation" value={`${s.autoRemediationPct || 0}%`} sub={`${s.autoRemediatedCount || 0} of ${s.remediatedCount || 0}`} icon={Zap} color={C.teal} />
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30" data-testid="endpoint-timeline-selector">
              {(["24H", "7D", "15D", "30D", "60D", "90D"] as const).map(t => (
                <button key={t} data-testid={`timeline-${t}`}
                  onClick={() => setEndpointTimeline(t)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${endpointTimeline === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >{t}</button>
              ))}
            </div>
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Malware Families" data={s.endpointByThreat} icon={Bug} />
            <Top10 title="Top Infected Hosts" data={s.topInfectedHosts} icon={Monitor} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Threat Vectors</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {(s.endpointThreatVectors || []).map((item: any, idx: number) => {
                    const TIcon = getThreatIcon(item.name);
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30 border-l-2"
                        style={{ borderLeftColor: PALETTE[idx % PALETTE.length] }}>
                        <TIcon className="w-4 h-4 shrink-0" style={{ color: PALETTE[idx % PALETTE.length] }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium">{item.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-mono">{item.count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <ExpandableCard title="EDR Action Distribution"
              headerExtra={<ChartTypeSelector active={ct("edrActions", "pie")} onChange={(v) => setCt("edrActions", v)} />}>
              <FlexChart
                data={s.endpointActions}
                chartType={ct("edrActions", "pie")}
                dataKey="value"
                height={220}
                colors={{ "Auto-Remediation Applied": C.green, "No Auto-Remediation": C.orange, blocked: C.green, quarantined: C.orange, isolated: C.purple, alerted: C.blue }}
              />
            </ExpandableCard>
            <ExpandableCard title="EDR Platforms"
              headerExtra={<ChartTypeSelector active={ct("edrPlatforms", "pie")} onChange={(v) => setCt("edrPlatforms", v)} />}>
              <FlexChart
                data={s.endpointLogSources.map((src: any) => ({ name: src.name, value: src.count }))}
                chartType={ct("edrPlatforms", "pie")}
                dataKey="value"
                height={220}
              />
            </ExpandableCard>
          </div>
          <ExpandableCard title="Top 20 Assets by Event Count"
            headerExtra={<ChartTypeSelector active={ct("topAssets", "bar")} onChange={(v) => setCt("topAssets", v)} />}>
            <FlexChart
              data={(assetsData?.summary?.topAssetsByEvents || []).slice(0, 20)}
              chartType={ct("topAssets", "bar")}
              dataKey="count"
              height={300}
              layout="vertical"
              yAxisWidth={120}
            />
          </ExpandableCard>
        </TabsContent>

        {/* Web App (WAF) */}
        <TabsContent value="webapp" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div className="grid lg:grid-cols-3 gap-4">
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
          <div className="grid lg:grid-cols-2 gap-4">
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
        </TabsContent>

        {/* Cloud & WAF */}
        <TabsContent value="cloud" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard title="WAF Events" value={s.wafTotal} icon={Globe} color={C.red} />
            <MetricCard title="CASB Events" value={s.casbTotal} icon={Cloud} color={C.purple} />
            <MetricCard title="DLP Events" value={s.dlpTotal} icon={Lock} color={C.orange} />
            <MetricCard title="SSE Events" value={s.sseTotal} icon={ShieldCheck} color={C.teal} />
            <MetricCard title="Cloud Events" value={s.cloudTotal} icon={Cloud} color={C.blue} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="WAF Attack Types" data={s.wafAttackTypes} icon={Globe} />
            <Top10 title="Shadow IT / CASB Apps" data={s.casbApps} icon={AppWindow} />
            <Top10 title="DLP Violations" data={s.dlpByThreat} icon={Lock} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Cloud Misconfigurations" data={s.cloudByThreat} icon={Cloud} />
            <Top10 title="Cloud Services" data={s.cloudApps} icon={Server} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Action Distribution</CardTitle>
                <ChartTypeSelector active={ct("wafActions", "pie")} onChange={(v) => setCt("wafActions", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.wafActions}
                  chartType={ct("wafActions", "pie")}
                  dataKey="value"
                  height={220}
                  colors={{ blocked: C.green, dropped: C.red, alerted: C.orange, logged: C.blue }}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">WAF Protected Targets</CardTitle>
                <ChartTypeSelector active={ct("wafTargets", "bar")} onChange={(v) => setCt("wafTargets", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.wafTargets}
                  chartType={ct("wafTargets", "bar")}
                  dataKey="count"
                  height={220}
                />
              </CardContent>
            </Card>
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
          </div>
        </TabsContent>

        {/* Network & Identity */}
        <TabsContent value="network" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Network Events" value={s.networkTotal} icon={Network} color={C.blue} />
            <MetricCard title="Identity Events" value={s.identityTotal} icon={Fingerprint} color={C.purple} />
            <MetricCard title="IDS/IPS Alerts" value={s.networkTotal} icon={ShieldAlert} color={C.red} />
            <MetricCard title="Auth Failures" value={(s.identityByThreat || []).reduce((s: number, t: any) => s + t.count, 0)} icon={KeyRound} color={C.orange} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10 title="Network Threats" data={s.networkByThreat} icon={Network} />
            <Top10 title="Identity Threats" data={s.identityByThreat} icon={Fingerprint} />
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
          <div className="grid lg:grid-cols-2 gap-4">
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
        </TabsContent>

        {/* Log & Event Sources */}
        <TabsContent value="logs" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title="Total Events" value={s.totalEvents} icon={Database} color={C.blue} />
            <MetricCard title="Log Sources" value={(s.topLogSources || []).length} icon={Server} color={C.green} />
            <MetricCard title="Source Types" value={(s.sourceTypes || []).length} icon={Wifi} color={C.purple} />
            <MetricCard title="Avg EPS" value={Math.round(s.totalEvents / 120 * 10) / 10} sub="events/sec" icon={Activity} color={C.orange} />
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider">Event Ingestion Trend</CardTitle>
              <ChartTypeSelector active={ct("logIngestion", "area")} onChange={(v) => setCt("logIngestion", v)} />
            </CardHeader>
            <CardContent className="pt-0">
              <FlexChart
                data={s.logIngestionTrend}
                chartType={ct("logIngestion", "area")}
                nameKey="month"
                dataKey="events"
                height={250}
                series={[{ dataKey: "events", name: "Events", color: C.blue, gradientId: "gLog" }]}
              />
            </CardContent>
          </Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-wider">Top Log Sources</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {(s.topLogSources || []).map((src: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-muted/20">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                      <span className="text-[11px] flex-1 truncate">{src.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-mono h-5">{src.count}</Badge>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Source Type Distribution</CardTitle>
                <ChartTypeSelector active={ct("sourceTypes", "pie")} onChange={(v) => setCt("sourceTypes", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.sourceTypes}
                  chartType={ct("sourceTypes", "pie")}
                  dataKey="value"
                  height={220}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vulnerabilities */}
        <TabsContent value="vuln" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Top10 title="Top Vulnerable Applications" data={s.topVulnerableApps} icon={AppWindow} />
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">Vulnerability Severity</CardTitle>
                <ChartTypeSelector active={ct("vulnSeverity", "pie")} onChange={(v) => setCt("vulnSeverity", v)} />
              </CardHeader>
              <CardContent className="pt-0">
                <FlexChart
                  data={s.vulnerabilitySeverity}
                  chartType={ct("vulnSeverity", "pie")}
                  dataKey="value"
                  height={220}
                  colors={SEV}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider">Event Severity Distribution</CardTitle>
              <ChartTypeSelector active={ct("eventSeverity", "bar")} onChange={(v) => setCt("eventSeverity", v)} />
            </CardHeader>
            <CardContent className="pt-0">
              <FlexChart
                data={s.eventsBySeverity}
                chartType={ct("eventSeverity", "bar")}
                dataKey="value"
                height={250}
                colors={SEV}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Asset Inventory */}
        <TabsContent value="assets" className="space-y-4">
          {assetsLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}
              </div>
              <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="cursor-pointer" onClick={() => { setAssetFilter(null); setAssetPage(0); }} data-testid="metric-total-inventory">
                  <MetricCard title="Total Inventory" value={assetsData?.summary?.totalInventory || assetsData?.summary?.totalAssets || 0} icon={HardDrive} color={C.blue} />
                </div>
                <div className="cursor-pointer" onClick={() => { setAssetFilter({ type: "hasEvents", value: "yes" }); setAssetPage(0); }} data-testid="metric-with-incidents">
                  <MetricCard title="With Incidents" value={assetsData?.summary?.assetsWithEvents || 0} icon={ShieldAlert} color={C.red} />
                </div>
                <div className="cursor-pointer" onClick={() => { setAssetFilter({ type: "hasEvents", value: "no" }); setAssetPage(0); }} data-testid="metric-clean-assets">
                  <MetricCard title="Clean Assets" value={assetsData?.summary?.assetsWithoutEvents || 0} icon={Shield} color={C.green} />
                </div>
                <div data-testid="metric-coverage">
                  <MetricCard title="Coverage" value={`${assetsData?.summary?.coveragePercent || 0}%`} icon={Target} color={C.purple} />
                </div>
                <div className="cursor-pointer" onClick={() => { setAssetFilter({ type: "risk", value: "critical" }); setAssetPage(0); }} data-testid="metric-critical-risk">
                  <MetricCard title="Critical Risk" value={assetsData?.summary?.criticalAssets || 0} icon={AlertTriangle} color={C.orange} />
                </div>
              </div>

              {(assetsData?.summary?.totalInventory > 0) && (
                <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2">
                      <Radar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Asset Coverage Insight
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Out of <strong>{assetsData.summary.totalInventory.toLocaleString()}</strong> systems in inventory, 
                        security incidents were observed on <strong>{assetsData.summary.assetsWithEvents.toLocaleString()}</strong> systems 
                        ({assetsData.summary.coveragePercent}% coverage). 
                        <strong> {(assetsData.summary.totalInventory - assetsData.summary.assetsWithEvents).toLocaleString()}</strong> systems have no recorded security events.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {assetFilter && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
                  <span className="text-xs text-primary font-medium">
                    Filtered by {assetFilter.type}: <strong>{assetFilter.value}</strong>
                  </span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setAssetFilter(null); setAssetPage(0); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-4">
                <ExpandableCard title="Assets by Group"
                  headerExtra={<ChartTypeSelector active={ct("assetsByGroup", "bar")} onChange={(v) => setCt("assetsByGroup", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.assetsByGroup || []}
                    chartType={ct("assetsByGroup", "bar")}
                    dataKey="value"
                    height={250}
                    layout="vertical"
                    yAxisWidth={140}
                    onItemClick={(item) => { setAssetFilter({ type: "group", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Assets by Type"
                  headerExtra={<ChartTypeSelector active={ct("assetsByType", "pie")} onChange={(v) => setCt("assetsByType", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.assetsByType || []}
                    chartType={ct("assetsByType", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ Endpoint: C.blue, Server: C.purple }}
                    onItemClick={(item) => { setAssetFilter({ type: "type", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Assets by OS"
                  headerExtra={<ChartTypeSelector active={ct("assetsByOS", "pie")} onChange={(v) => setCt("assetsByOS", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.assetsByOS || []}
                    chartType={ct("assetsByOS", "pie")}
                    dataKey="value"
                    height={250}
                    colors={{ Windows: C.blue, Linux: C.green, macOS: C.purple, Unknown: C.yellow }}
                    onItemClick={(item) => { setAssetFilter({ type: "os", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <ExpandableCard title="Agent Version Distribution"
                  headerExtra={<ChartTypeSelector active={ct("agentVersionDist", "bar")} onChange={(v) => setCt("agentVersionDist", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.agentVersionDist || []}
                    chartType={ct("agentVersionDist", "bar")}
                    dataKey="value"
                    height={220}
                    onItemClick={(item) => { setAssetFilter({ type: "agentVersion", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Prevention Policy Distribution"
                  headerExtra={<ChartTypeSelector active={ct("policyDist", "bar")} onChange={(v) => setCt("policyDist", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.policyDist || []}
                    chartType={ct("policyDist", "bar")}
                    dataKey="value"
                    height={220}
                    layout="vertical"
                    yAxisWidth={180}
                    onItemClick={(item) => { setAssetFilter({ type: "policy", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>

                <ExpandableCard title="Cloud Provider Distribution"
                  headerExtra={<ChartTypeSelector active={ct("cloudDist", "pie")} onChange={(v) => setCt("cloudDist", v)} />}>
                  <FlexChart
                    data={assetsData?.summary?.cloudDist || []}
                    chartType={ct("cloudDist", "pie")}
                    dataKey="value"
                    height={220}
                    onItemClick={(item) => { setAssetFilter({ type: "cloud", value: item.name }); setAssetPage(0); }}
                  />
                </ExpandableCard>
              </div>

              <ExpandableCard title={assetFilter ? `Asset Inventory — Filtered by ${assetFilter.type}: ${assetFilter.value}` : "Asset Inventory"}>
                {(() => {
                  const rawAssets = assetsData?.assets || [];
                  const allAssets = assetFilter ? rawAssets.filter((a: any) => {
                    const fv = assetFilter.value.toLowerCase();
                    switch (assetFilter.type) {
                      case "group": return (a.groups || []).some((g: string) => g.toLowerCase() === fv) || (a.endpointGroup || "").toLowerCase() === fv;
                      case "type": return (a.assetType || "").toLowerCase() === fv;
                      case "os": {
                        const osArr = a.os || [];
                        const opSys = a.operatingSystem || "";
                        return osArr.some((o: string) => {
                          const on = o.toLowerCase();
                          if (fv === "windows") return on.includes("windows");
                          if (fv === "linux") return on.includes("linux") || on.includes("ubuntu") || on.includes("centos") || on.includes("rhel");
                          if (fv === "macos") return on.includes("mac") || on.includes("macos");
                          return on === fv;
                        }) || (() => {
                          const ops = opSys.toLowerCase();
                          if (fv === "windows") return ops.includes("windows");
                          if (fv === "linux") return ops.includes("linux") || ops.includes("ubuntu") || ops.includes("centos");
                          if (fv === "macos") return ops.includes("mac");
                          return ops === fv;
                        })();
                      }
                      case "risk": return (a.riskLevel || "").toLowerCase() === fv;
                      case "agentVersion": return (a.agentVersion || "").toLowerCase() === fv;
                      case "policy": return (a.preventionPolicy || "").toLowerCase() === fv;
                      case "cloud": return (a.cloudProvider || "").toLowerCase() === fv;
                      case "hasEvents": return fv === "yes" ? (a.eventCount > 0 || a.incidentCount > 0) : (a.eventCount === 0 && a.incidentCount === 0);
                      default: return true;
                    }
                  }) : rawAssets;
                  const totalAssets = allAssets.length;
                  const totalPages = Math.ceil(totalAssets / assetPageSize);
                  const pagedAssets = allAssets.slice(assetPage * assetPageSize, (assetPage + 1) * assetPageSize);
                  return (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px] uppercase">Hostname</TableHead>
                              <TableHead className="text-[10px] uppercase">Type</TableHead>
                              <TableHead className="text-[10px] uppercase">OS</TableHead>
                              <TableHead className="text-[10px] uppercase">IP Address</TableHead>
                              <TableHead className="text-[10px] uppercase">Events</TableHead>
                              <TableHead className="text-[10px] uppercase">Incidents</TableHead>
                              <TableHead className="text-[10px] uppercase">Risk</TableHead>
                              <TableHead className="text-[10px] uppercase">Group</TableHead>
                              <TableHead className="text-[10px] uppercase">Last Seen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedAssets.map((asset: any, idx: number) => (
                              <TableRow key={idx} data-testid={`asset-row-${idx}`} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/assets/${currentTenant?.id}/${encodeURIComponent(asset.name)}`)}>
                                <TableCell className="text-[11px] font-medium text-primary hover:underline">{asset.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px]">{asset.assetType || asset.endpointType || "Endpoint"}</Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground max-w-[120px] truncate">{asset.operatingSystem || (asset.os && asset.os[0]) || "-"}</TableCell>
                                <TableCell className="text-[10px] font-mono text-muted-foreground">{(asset.ips && asset.ips[0]) || "-"}</TableCell>
                                <TableCell className="text-[11px] font-mono">{asset.eventCount}</TableCell>
                                <TableCell className="text-[11px] font-mono">{asset.incidentCount}</TableCell>
                                <TableCell>
                                  {(asset.eventCount > 0 || asset.incidentCount > 0) ? (
                                    <Badge variant="secondary" className="text-[10px]"
                                      style={{ backgroundColor: `${SEV[asset.riskLevel] || C.blue}20`, color: SEV[asset.riskLevel] || C.blue }}>
                                      {asset.riskLevel}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] text-green-600">Clean</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground max-w-[120px] truncate">{asset.endpointGroup || (asset.groups && asset.groups[0]) || "-"}</TableCell>
                                <TableCell className="text-[11px] text-muted-foreground">
                                  {asset.lastSeen ? new Date(asset.lastSeen).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Showing {assetPage * assetPageSize + 1}-{Math.min((assetPage + 1) * assetPageSize, totalAssets)} of {totalAssets}</span>
                          <select value={assetPageSize} onChange={e => { setAssetPageSize(Number(e.target.value)); setAssetPage(0); }}
                            className="text-[10px] h-6 px-1 rounded border bg-background" data-testid="asset-page-size">
                            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} per page</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" disabled={assetPage === 0} onClick={() => setAssetPage(p => p - 1)}
                            className="h-7 w-7 p-0" data-testid="asset-page-prev">
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let pg = i;
                            if (totalPages > 7) {
                              if (assetPage < 4) pg = i;
                              else if (assetPage > totalPages - 4) pg = totalPages - 7 + i;
                              else pg = assetPage - 3 + i;
                            }
                            return (
                              <Button key={pg} variant={pg === assetPage ? "default" : "outline"} size="sm"
                                onClick={() => setAssetPage(pg)} className="h-7 w-7 p-0 text-[10px]" data-testid={`asset-page-${pg}`}>
                                {pg + 1}
                              </Button>
                            );
                          })}
                          <Button variant="outline" size="sm" disabled={assetPage >= totalPages - 1} onClick={() => setAssetPage(p => p + 1)}
                            className="h-7 w-7 p-0" data-testid="asset-page-next">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </ExpandableCard>
            </>
          )}
        </TabsContent>

        {/* Threat Analysis */}
        <TabsContent value="analysis" className="space-y-4" data-testid="tab-content-analysis">
          {threatLoading ? (
            <div className="space-y-4">
              <Card><CardContent className="p-5"><Skeleton className="h-40" /></CardContent></Card>
              <div className="grid lg:grid-cols-2 gap-4">
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

              <div className="grid lg:grid-cols-2 gap-4">
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

              <div className="grid lg:grid-cols-2 gap-4">
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

              <div className="grid lg:grid-cols-2 gap-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
