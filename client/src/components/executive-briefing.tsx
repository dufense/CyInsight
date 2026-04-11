import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  RefreshCw, Bot, ShieldAlert, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, Clock, Activity, Shield, Zap,
  ChevronDown, ChevronUp, ExternalLink, Target, Crosshair, DownloadCloud
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, Tooltip
} from "recharts";

// ── Markdown renderer ──────────────────────────────────────────────────────────
function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return null;
  const lines = text.split(/\n+/);
  return (
    <span className={className}>
      {lines.map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, pi) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={pi} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
            : part
        );
        return (
          <span key={li}>
            {rendered}
            {li < lines.length - 1 && <br />}
          </span>
        );
      })}
    </span>
  );
}

// ── Composite risk score SVG gauge ─────────────────────────────────────────────
function RiskGauge({ value, size = 180, isDark = true }: { value: number; size?: number; isDark?: boolean }) {
  const cx = size / 2;
  const cy = size * 0.43;
  const r  = size * 0.38;
  const trackW = Math.max(6, size * 0.052);

  const START  = 220;
  const SWEEP  = 280;

  function pt(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }

  function arcD(fromDeg: number, sweepDeg: number, radius: number): string {
    const s  = pt(fromDeg, radius);
    const e  = pt(fromDeg - sweepDeg, radius);
    const la = sweepDeg > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${la} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const riskColor =
    value >= 75 ? "#ef4444" :
    value >= 50 ? "#f97316" :
    value >= 25 ? "#eab308" : "#22c55e";

  const riskLabel =
    value >= 75 ? "CRITICAL RISK" :
    value >= 50 ? "HIGH RISK"     :
    value >= 25 ? "ELEVATED"      :
    value >= 10 ? "MODERATE"      : "MINIMAL";

  const fillSweep  = (value / 100) * SWEEP;
  const dimSweep   = SWEEP - fillSweep;
  const dimFromDeg = START - fillSweep;

  const zones = [
    { from: START,      sweep: 70, color: "#22c55e", capA: "round" as const, capB: "butt"  as const },
    { from: START - 70, sweep: 70, color: "#eab308", capA: "butt"  as const, capB: "butt"  as const },
    { from: START -140, sweep: 70, color: "#f97316", capA: "butt"  as const, capB: "butt"  as const },
    { from: START -210, sweep: 70, color: "#ef4444", capA: "butt"  as const, capB: "round" as const },
  ];

  const ticks = [0, 25, 50, 75, 100].map(v => {
    const deg     = START - (v / 100) * SWEEP;
    const tickLen = size * 0.038;
    return {
      v,
      inner: pt(deg, r - trackW * 0.5 - 1),
      outer: pt(deg, r + trackW * 0.5 + tickLen * 0.3),
      label: pt(deg, r + trackW * 0.5 + tickLen + size * 0.038),
    };
  });

  const needleDeg  = START - fillSweep;
  const needleTip  = pt(needleDeg, r * 0.84);
  const needleTail = pt(needleDeg + 180, r * 0.15);
  const needleL    = pt(needleDeg + 90, size * 0.022);
  const needleR    = pt(needleDeg - 90, size * 0.022);

  const svgH       = size * 0.96;
  const dimColor   = isDark ? "rgba(0,0,0,0.60)"         : "rgba(160,160,160,0.60)";
  const subTxtClr  = isDark ? "rgba(255,255,255,0.38)"   : "rgba(0,0,0,0.40)";
  const tickLblClr = isDark ? "rgba(255,255,255,0.22)"   : "rgba(0,0,0,0.22)";
  const needleClr  = isDark ? "rgba(255,255,255,0.94)"   : "rgba(15,23,42,0.90)";

  return (
    <svg
      width={size}
      height={svgH}
      viewBox={`0 0 ${size} ${svgH}`}
      className="overflow-visible"
      data-testid="risk-gauge-svg"
    >
      <defs>
        <filter id="eb-hub-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="eb-needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* ── Full gradient track: 4 coloured arc segments ── */}
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcD(z.from, z.sweep, r)}
          fill="none"
          stroke={z.color}
          strokeWidth={trackW}
          strokeLinecap={i === 0 ? z.capA : i === 3 ? z.capB : "butt"}
          opacity={0.88}
        />
      ))}

      {/* ── Dim overlay for unfilled portion ── */}
      {dimSweep > 0.5 && (
        <path
          d={arcD(dimFromDeg, dimSweep, r)}
          fill="none"
          stroke={dimColor}
          strokeWidth={trackW + 1}
          strokeLinecap="butt"
        />
      )}

      {/* ── Tick marks + labels ── */}
      {ticks.map((t) => (
        <g key={t.v}>
          <line
            x1={t.inner.x.toFixed(2)} y1={t.inner.y.toFixed(2)}
            x2={t.outer.x.toFixed(2)} y2={t.outer.y.toFixed(2)}
            stroke={isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.30)"}
            strokeWidth={1.5}
          />
          <text
            x={t.label.x.toFixed(2)}
            y={(t.label.y + 3).toFixed(2)}
            textAnchor="middle"
            fontSize={size * 0.047}
            fill={tickLblClr}
            fontFamily="system-ui"
          >
            {t.v}
          </text>
        </g>
      ))}

      {/* ── Needle ── */}
      <polygon
        points={[needleTip, needleL, needleTail, needleR]
          .map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
        fill={needleClr}
        filter="url(#eb-needle-shadow)"
      />

      {/* ── Hub: glow halo → coloured ring → dark fill → white dot ── */}
      <circle cx={cx} cy={cy} r={size * 0.055} fill={riskColor} filter="url(#eb-hub-glow)" opacity={0.30} />
      <circle cx={cx} cy={cy} r={size * 0.050} fill={riskColor} />
      <circle cx={cx} cy={cy} r={size * 0.032} fill={isDark ? "#0f172a" : "#f1f5f9"} />
      <circle cx={cx} cy={cy} r={size * 0.014} fill={isDark ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.70)"} />

      {/* ── Score number ── */}
      <text
        x={cx}
        y={(cy + size * 0.265).toFixed(2)}
        textAnchor="middle"
        fontSize={size * 0.215}
        fontWeight="800"
        fill={riskColor}
        fontFamily="system-ui"
      >
        {value}
      </text>

      {/* ── /100 sub-label ── */}
      <text
        x={cx}
        y={(cy + size * 0.365).toFixed(2)}
        textAnchor="middle"
        fontSize={size * 0.063}
        fill={subTxtClr}
        fontFamily="system-ui"
        letterSpacing="1"
      >
        /100
      </text>

      {/* ── Risk label ── */}
      <text
        x={cx}
        y={(cy + size * 0.465).toFixed(2)}
        textAnchor="middle"
        fontSize={size * 0.068}
        fontWeight="700"
        fill={riskColor}
        fontFamily="system-ui"
        letterSpacing="1.5"
      >
        {riskLabel}
      </text>
    </svg>
  );
}

// ── Micro sparkline ────────────────────────────────────────────────────────────
function MicroSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── KPI metric pill ────────────────────────────────────────────────────────────
function KpiPill({
  label, value, sub, color, trend, trendDir, isDark
}: {
  label: string; value: string | number; sub?: string;
  color: string; trend?: string; trendDir?: "up" | "down" | "flat";
  isDark?: boolean;
}) {
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const trendColor = trendDir === "flat" ? "text-muted-foreground" : trendDir === "up" ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-muted/40 dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted/60 dark:hover:bg-white/8 transition-colors">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium leading-none">{label}</span>
      <div className="flex items-end gap-1.5 mt-0.5">
        <span className="text-xl font-bold leading-none" style={{ color }}>{value}</span>
        {sub && <span className="text-[9px] text-muted-foreground mb-0.5">{sub}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-0.5 ${trendColor}`}>
          <TrendIcon className="w-2.5 h-2.5" />
          <span className="text-[9px] font-medium">{trend}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface BriefingData {
  summary?: string;
  threatLevel?: string;
  compositeRiskScore?: number;
  fallback_used?: boolean;
  generatedAt?: string;
  periodLabel?: string;
  timeRange?: string;
  sections?: { situation?: string; keyFindings?: string[] };
  metrics?: {
    activeThreats: number; newIOCs24h: number; coveragePercent: number;
    avgResponseTimeMin: number; slaHealth: number; avgConfidence?: number;
    mttdMin?: number; mttcMin?: number; totalIncidents?: number; highSev?: number;
  };
  topThreats?: Array<{ name: string; severity: string; tactic: string }>;
  recommendations?: string[];
  weekOverWeek?: {
    incidents: { thisWeek: number; lastWeek: number; thisWeekDaily: number[]; lastWeekDaily: number[] };
    events: { thisWeek: number; lastWeek: number; thisWeekDaily: number[]; lastWeekDaily: number[] };
    avgConfidence: { thisWeek: number; lastWeek: number; thisWeekDaily: number[]; lastWeekDaily: number[] };
  };
}

export function ExecutiveBriefing({
  data, loading, onRefresh, timeRange, tenantId
}: {
  data: BriefingData | null | undefined;
  loading: boolean;
  onRefresh: () => void;
  timeRange?: string;
  tenantId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(300);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect dark/light mode
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleExportPDF = async () => {
    if (!tenantId || pdfExporting) return;
    setPdfExporting(true);
    try {
      const tr = timeRange || data?.timeRange || "all";
      const url = `/api/dashboard/briefing/pdf?tenantId=${tenantId}&timeRange=${tr}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("PDF export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().substring(0, 10);
      a.download = `Executive_Briefing_${date}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("PDF export error:", e);
    } finally {
      setPdfExporting(false);
    }
  };

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setAutoRefreshCountdown(c => {
        if (c <= 1) { onRefresh(); return 300; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [onRefresh]);

  const tl = data?.threatLevel || "Low";
  const score = data?.compositeRiskScore ?? 0;
  const activePeriodLabel = data?.periodLabel || (timeRange === "1h" ? "Last 1 Hour" : timeRange === "24h" ? "Last 24 Hours" : timeRange === "7d" ? "Last 7 Days" : timeRange === "30d" ? "Last 30 Days" : timeRange === "90d" ? "Last 90 Days" : "Last 30 Days");

  const tlConfig: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    Critical: { bg: "bg-red-500/15", text: "text-red-500 dark:text-red-400", border: "border-red-500/40", dot: "bg-red-500" },
    High:     { bg: "bg-orange-500/15", text: "text-orange-500 dark:text-orange-400", border: "border-orange-500/40", dot: "bg-orange-500" },
    Medium:   { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-500/40", dot: "bg-yellow-500" },
    Low:      { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/40", dot: "bg-emerald-500" },
  };
  const tlc = tlConfig[tl] || tlConfig.Low;

  const m = data?.metrics;
  const wow = data?.weekOverWeek;

  const genTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  const wowRows = wow ? [
    {
      label: "Incidents",
      thisVal: wow.incidents.thisWeek,
      lastVal: wow.incidents.lastWeek,
      daily: wow.incidents.thisWeekDaily,
      higherIsBad: true,
    },
    {
      label: "Events",
      thisVal: wow.events.thisWeek,
      lastVal: wow.events.lastWeek,
      daily: wow.events.thisWeekDaily,
      higherIsBad: true,
    },
    {
      label: "Confidence",
      thisVal: wow.avgConfidence.thisWeek,
      lastVal: wow.avgConfidence.lastWeek,
      daily: wow.avgConfidence.thisWeekDaily,
      higherIsBad: false,
      suffix: "%",
    },
  ] : [];

  const severityColors: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e"
  };

  const recPriorities = ["P1", "P2", "P3", "P4", "P5"];
  const recColors = ["#ef4444", "#f97316", "#eab308", "#60a5fa", "#a78bfa"];

  // Dynamic classes based on theme
  const containerBg = isDark
    ? "linear-gradient(160deg, hsl(220 40% 8%) 0%, hsl(230 35% 6%) 60%, hsl(240 30% 5%) 100%)"
    : undefined;
  const headerBg = isDark
    ? "linear-gradient(90deg, hsl(230 60% 12% / 0.9) 0%, hsl(240 50% 10% / 0.5) 100%)"
    : undefined;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className={`rounded-xl shadow-2xl ${
        isDark
          ? "border border-white/10"
          : "border border-border bg-card"
      }`}
      style={isDark ? { background: containerBg } : undefined}
      data-testid="executive-briefing"
    >
      {/* ── CINEMATIC HEADER ──────────────────────────────────────────────────── */}
      <div
        className={`relative px-5 py-4 rounded-t-xl ${isDark ? "border-b border-white/8" : "border-b border-border bg-muted/20"}`}
        style={isDark ? { background: headerBg, overflow: "clip" } : undefined}
      >
        {isDark && (
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 23px,rgba(255,255,255,0.8) 23px,rgba(255,255,255,0.8) 24px),repeating-linear-gradient(90deg,transparent,transparent 23px,rgba(255,255,255,0.8) 23px,rgba(255,255,255,0.8) 24px)" }}
          />
        )}

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-blue-500/30 bg-blue-500/15 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
            <Bot className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground tracking-wide">EXECUTIVE INTELLIGENCE BRIEFING</span>
              <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30 font-semibold tracking-wider" data-testid="badge-aria">
                ARIA AI
              </Badge>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider ${tlc.bg} ${tlc.text} ${tlc.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${tlc.dot} animate-pulse`} />
                {tl.toUpperCase()} THREAT
              </div>
              {data?.fallback_used && (
                <Badge variant="outline" className="text-[9px] px-1.5 border-amber-500/40 text-amber-500 dark:text-amber-400" data-testid="badge-cached">
                  Cached
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {genTime && <span className="ml-2 opacity-60">· Generated {genTime}</span>}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10 text-[9px] text-muted-foreground font-medium tracking-wide">
              <Clock className="w-2.5 h-2.5" />
              {activePeriodLabel}
            </div>
            <span className="text-[10px] text-muted-foreground hidden lg:block tabular-nums opacity-70">
              Auto-refresh {Math.floor(autoRefreshCountdown / 60)}:{String(autoRefreshCountdown % 60).padStart(2, "0")}
            </span>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground border border-border dark:border-white/10"
              onClick={handleExportPDF}
              disabled={pdfExporting || !tenantId}
              data-testid="btn-export-briefing-pdf"
              title="Export as branded PDF"
            >
              <DownloadCloud className={`w-3 h-3 mr-1 ${pdfExporting ? "animate-bounce" : ""}`} />
              {pdfExporting ? "Exporting…" : "PDF"}
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground border border-border dark:border-white/10"
              onClick={onRefresh}
              data-testid="btn-refresh-briefing"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-5 gap-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          <div className="grid grid-cols-3 gap-4 mt-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        </div>
      ) : data ? (
        <>
          {/* ── KPI STRIP ────────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-0">
            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-[0.12em] mb-2 ml-0.5">Key Metrics · {activePeriodLabel}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="kpi-strip">
              <KpiPill
                label="Active Incidents"
                value={m?.activeThreats ?? 0}
                color={m?.activeThreats ? "#ef4444" : "#22c55e"}
                trend={m?.activeThreats ? "Needs attention" : "Clear"}
                trendDir={m?.activeThreats ? "down" : "flat"}
                isDark={isDark}
              />
              <KpiPill
                label={`New (${data?.periodLabel?.replace("Last ", "") || "Period"})`}
                value={m?.newIOCs24h ?? 0}
                color={m?.newIOCs24h ? "#f97316" : "#22c55e"}
                trend={m?.newIOCs24h ? "Emerging" : "Stable"}
                trendDir={m?.newIOCs24h ? "up" : "flat"}
                isDark={isDark}
              />
              <KpiPill
                label="Detection Coverage"
                value={`${m?.coveragePercent ?? 87}%`}
                color={m?.coveragePercent >= 85 ? "#22c55e" : m?.coveragePercent >= 70 ? "#eab308" : "#ef4444"}
                trend="MITRE mapped"
                trendDir="flat"
                isDark={isDark}
              />
              <KpiPill
                label="Mean Time to Respond"
                value={`${m?.avgResponseTimeMin ?? 45}m`}
                sub="MTTR"
                color={m?.avgResponseTimeMin < 60 ? "#22c55e" : m?.avgResponseTimeMin < 120 ? "#eab308" : "#ef4444"}
                trend={m?.mttdMin ? `MTTD ${m.mttdMin}m` : undefined}
                trendDir="flat"
                isDark={isDark}
              />
              <KpiPill
                label="SLA Compliance"
                value={`${m?.slaHealth ?? 100}%`}
                color={m?.slaHealth >= 90 ? "#22c55e" : m?.slaHealth >= 70 ? "#eab308" : "#ef4444"}
                trend={m?.slaHealth >= 95 ? "On track" : "Review needed"}
                trendDir={m?.slaHealth >= 95 ? "flat" : "down"}
                isDark={isDark}
              />
            </div>
          </div>

          {/* ── THREE COLUMN BODY ─────────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-0 divide-y lg:divide-y-0 lg:divide-x ${isDark ? "divide-white/8" : "divide-border"} px-0 mt-4`}>

            {/* LEFT: Risk gauge */}
            <div className="flex flex-col items-center gap-3 px-5 py-4">
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold self-start">Composite Risk Score</p>
              <RiskGauge value={score} size={180} isDark={isDark} />

              <div className="w-full space-y-2 mt-1">
                {[
                  { label: "AI Confidence", value: `${m?.avgConfidence ?? 72}%`, color: "#60a5fa" },
                  { label: "Total Incidents", value: m?.totalIncidents ?? 0, color: "#a78bfa" },
                  { label: "Critical / High", value: `${m?.highSev ?? 0} events`, color: "#f97316" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                    <span className="text-[11px] font-semibold" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>

              <div className={`w-full mt-1 px-2.5 py-2 rounded-lg border text-[10px] leading-snug ${tlc.bg} ${tlc.border} ${tlc.text}`}>
                {tl === "Critical" && "Immediate escalation required. Multiple high-severity incidents active."}
                {tl === "High" && "Elevated activity detected. Analyst response required within SLA window."}
                {tl === "Medium" && "Moderate risk indicators present. Monitor and validate open incidents."}
                {tl === "Low" && "No critical threats detected. Posture within acceptable parameters."}
              </div>
            </div>

            {/* CENTER: AI Narrative */}
            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Situation */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                  <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold shrink-0">Situation</span>
                  <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                </div>
                <div className={`text-[12px] text-muted-foreground leading-relaxed ${expanded ? "" : "line-clamp-4"}`}>
                  <MarkdownText text={data.sections?.situation || data.summary || ""} />
                </div>
                {(data.sections?.situation || data.summary || "").length > 300 && (
                  <button
                    className="mt-1.5 text-[10px] text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 flex items-center gap-1"
                    onClick={() => setExpanded(e => !e)}
                    data-testid="btn-briefing-expand"
                  >
                    {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read full briefing</>}
                  </button>
                )}
              </div>

              {/* Key Findings */}
              {data.sections?.keyFindings && data.sections.keyFindings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                    <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold shrink-0">Key Findings</span>
                    <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                  </div>
                  <ul className="space-y-1.5">
                    {data.sections.keyFindings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-1.5 shrink-0" />
                        <span className="text-[11px] text-muted-foreground leading-snug">
                          <MarkdownText text={f} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Top Threats */}
              {data.topThreats && data.topThreats.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                    <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold shrink-0">Top Threats</span>
                    <div className={`h-px flex-1 ${isDark ? "bg-white/8" : "bg-border"}`} />
                  </div>
                  <div className="space-y-1.5">
                    {data.topThreats.map((t, i) => (
                      <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${isDark ? "bg-white/5" : "bg-muted/40"} border border-border dark:border-white/8`}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: severityColors[t.severity] || "#eab308" }} />
                        <span className="text-[11px] font-medium text-foreground flex-1 truncate">{t.name}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{t.tactic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: WoW + Recommendations */}
            <div className="flex flex-col gap-4 px-5 py-4">

              {/* Week-over-week */}
              {wowRows.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-3">Week-over-Week</p>
                  <div className="space-y-3">
                    {wowRows.map((row) => {
                      const delta = row.thisVal - row.lastVal;
                      const isBad = row.higherIsBad ? delta > 0 : delta < 0;
                      const color = delta === 0 ? "#94a3b8" : isBad ? "#ef4444" : "#22c55e";
                      const deltaStr = `${delta > 0 ? "+" : ""}${row.suffix ? row.thisVal + row.suffix : row.thisVal}`;
                      return (
                        <div key={row.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">{row.label}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold" style={{ color }}>{deltaStr}</span>
                              {delta !== 0 && (
                                <span className="text-[9px]" style={{ color }}>
                                  {delta > 0 ? "↑" : "↓"} {Math.abs(Math.round((delta / Math.max(1, row.lastVal)) * 100))}%
                                </span>
                              )}
                            </div>
                          </div>
                          <MicroSparkline data={row.daily} color={color} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {data.recommendations && data.recommendations.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">Recommendations</p>
                  <div className="space-y-1.5">
                    {data.recommendations.slice(0, 5).map((rec, i) => (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-white/3" : "bg-muted/30"} border border-border dark:border-white/6`}>
                        <span
                          className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 mt-0.5"
                          style={{ background: `${recColors[i]}20`, color: recColors[i], border: `1px solid ${recColors[i]}40` }}
                        >
                          {recPriorities[i]}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className={`mt-auto pt-3 border-t ${isDark ? "border-white/8" : "border-border"}`}>
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">Quick Links</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Incidents", href: "/incidents", icon: ShieldAlert },
                    { label: "Threats", href: "/threat-intel", icon: Target },
                    { label: "Events", href: "/events", icon: Activity },
                    { label: "CAASM", href: "/caasm", icon: Crosshair },
                  ].map(({ label, href, icon: Icon }) => (
                    <Link key={label} href={href}>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium border ${isDark ? "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"} transition-colors cursor-pointer`}>
                        <Icon className="w-2.5 h-2.5" />
                        {label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="p-10 text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">No briefing data available.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>Generate Briefing</Button>
        </div>
      )}
    </div>
  );
}
