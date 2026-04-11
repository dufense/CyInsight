import { useEffect, useRef, useState } from "react";
import {
  ShieldAlert, Activity, Zap, Clock, Bot,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
} from "recharts";

interface CommandStripProps {
  stats: {
    criticalEvents?: number;
    openIncidents?: number;
    eventsPerHour?: number;
    slaBreachCount?: number;
    avgRiskScore?: number;
    severityCounts?: { critical?: number; high?: number; medium?: number; low?: number };
  } | null;
  lastUpdated?: Date;
  liveMode?: boolean;
  onToggleLive?: () => void;
}

type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function computeThreatLevel(
  critical = 0, high = 0, slaBreaches = 0, riskScore = 0
): ThreatLevel {
  if (critical >= 3 || riskScore >= 80 || slaBreaches >= 5) return "CRITICAL";
  if (critical >= 1 || high >= 5 || riskScore >= 60 || slaBreaches >= 2) return "HIGH";
  if (high >= 1 || riskScore >= 40 || slaBreaches >= 1) return "MEDIUM";
  return "LOW";
}

const THREAT_CONFIG: Record<ThreatLevel, {
  color: string; bg: string; border: string; label: string; filledSegments: number; radialColor: string; score: number;
}> = {
  LOW: {
    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25",
    label: "LOW", filledSegments: 1, radialColor: "#10b981", score: 15,
  },
  MEDIUM: {
    color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/25",
    label: "MEDIUM", filledSegments: 3, radialColor: "#eab308", score: 45,
  },
  HIGH: {
    color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/25",
    label: "HIGH", filledSegments: 4, radialColor: "#f97316", score: 72,
  },
  CRITICAL: {
    color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25",
    label: "CRITICAL", filledSegments: 5, radialColor: "#ef4444", score: 96,
  },
};

const SEGMENT_COLORS = [
  "#10b981", "#84cc16", "#eab308", "#f97316", "#991b1b",
];

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (target === from) return;
    let start: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

function ThreatLevelTile({ level }: { level: ThreatLevel }) {
  const cfg = THREAT_CONFIG[level];
  const isCritical = level === "CRITICAL";
  const [filled, setFilled] = useState(false);
  const [animScore, setAnimScore] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 120);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let raf: number;
    let start: number;
    const target = cfg.score;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 900, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setAnimScore(Math.round(ease * target));
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [cfg.score]);

  const radialData = [{ value: animScore, fill: cfg.radialColor }];

  return (
    <div
      data-testid="threat-level-tile"
      className={cn(
        "flex flex-col gap-0 px-3 py-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden",
        cfg.bg, cfg.border,
        isCritical && "severity-pulse-red"
      )}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 50%, ${cfg.radialColor}08 0%, transparent 70%)`,
        }}
      />
      <div className="flex items-center gap-1.5 mb-1">
        <ShieldAlert className={cn("w-3 h-3 shrink-0", cfg.color)} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Threat Level</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-[52px] h-[52px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="70%"
              innerRadius="55%" outerRadius="90%"
              startAngle={180} endAngle={0}
              data={[{ value: 100, fill: "hsl(var(--muted) / 0.3)" }, ...radialData]}
              barSize={5}
            >
              <RadialBar dataKey="value" cornerRadius={3} background={false} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-end justify-center pb-0.5">
            <span className={cn("text-[11px] font-black tabular-nums leading-none", cfg.color)}>{animScore}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <div className={cn("text-xs font-bold tracking-widest leading-none", cfg.color)}>{cfg.label}</div>
          <div className="flex gap-0.5 h-1">
            {SEGMENT_COLORS.map((segColor, i) => {
              const shouldFill = filled && i < cfg.filledSegments;
              return (
                <div
                  key={i}
                  className="h-full flex-1 rounded-full transition-all duration-500"
                  style={{
                    background: shouldFill ? segColor : "hsl(var(--muted-foreground) / 0.15)",
                    opacity: shouldFill ? 1 : 0.35,
                    transform: shouldFill ? "scaleY(1)" : "scaleY(0.5)",
                    transitionDelay: shouldFill ? `${i * 90}ms` : "0ms",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  pulse,
  accentColor,
  className,
}: {
  icon: React.ElementType; label: string; value: number; sub?: string;
  accent?: boolean; pulse?: boolean; accentColor?: string; className?: string;
}) {
  const displayed = useCountUp(value);
  const isAlert = accent && value > 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden",
        isAlert
          ? `bg-red-500/[0.08] border-red-500/20 ${pulse ? "severity-pulse-red" : ""}`
          : "bg-card/40 border-border/40 hover:border-border/60",
        className
      )}
    >
      {isAlert && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.06) 0%, transparent 70%)" }}
        />
      )}
      <div className="flex items-center gap-1.5">
        {isAlert && pulse ? (
          <div className="relative w-3.5 h-3.5 shrink-0">
            <div className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: accentColor || "#ef4444" }} />
            <Icon className="relative w-3.5 h-3.5" style={{ color: accentColor || "#ef4444" }} />
          </div>
        ) : (
          <Icon className={cn("w-3.5 h-3.5 shrink-0", isAlert ? "text-red-400" : "text-muted-foreground/70")} />
        )}
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className={cn(
        "text-xl font-black tabular-nums leading-none",
        isAlert ? "text-red-400" : "text-foreground"
      )}>
        {displayed.toLocaleString()}
        {sub && <span className="text-[9px] font-normal text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function SLATile({ value }: { value: number }) {
  const displayed = useCountUp(value);
  const isBreached = value > 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden",
        isBreached
          ? "bg-amber-500/[0.08] border-amber-500/20 severity-pulse-yellow"
          : "bg-card/40 border-border/40 hover:border-border/60"
      )}
    >
      {isBreached && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 70%)" }} />
      )}
      <div className="flex items-center gap-1.5">
        <Clock className={cn("w-3.5 h-3.5 shrink-0", isBreached ? "text-amber-400" : "text-muted-foreground/70")} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">SLA Breaches</span>
      </div>
      <div className={cn("text-xl font-black tabular-nums leading-none", isBreached ? "text-amber-400" : "text-foreground")}>
        {displayed}
        <span className="text-[9px] font-normal text-muted-foreground ml-1">open</span>
      </div>
    </div>
  );
}

function ARIATile() {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border bg-emerald-500/[0.05] border-emerald-500/20 transition-all duration-300 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.07) 0%, transparent 70%)", opacity: pulse ? 1 : 0.3 }}
      />
      <div className="flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">ARIA AI</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-2.5 h-2.5 shrink-0">
          <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
          <div className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="text-sm font-black text-emerald-400 leading-none">Active</span>
      </div>
    </div>
  );
}

export function DashboardCommandStrip({ stats, lastUpdated, liveMode, onToggleLive }: CommandStripProps) {
  const s = stats;
  const criticalCount = s?.severityCounts?.critical ?? (s?.criticalEvents ?? 0);
  const highCount = s?.severityCounts?.high ?? 0;
  const openIncidents = s?.openIncidents ?? 0;
  const eventsPerHour = s?.eventsPerHour ?? 0;
  const slaBreaches = s?.slaBreachCount ?? 0;
  const riskScore = s?.avgRiskScore ?? 0;

  const threatLevel = computeThreatLevel(criticalCount, highCount, slaBreaches, riskScore);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const minutesAgo = lastUpdated
    ? Math.round((now.getTime() - lastUpdated.getTime()) / 60000)
    : null;
  const updatedText = minutesAgo === null
    ? "Awaiting data"
    : minutesAgo === 0
      ? "Just updated"
      : `Updated ${minutesAgo}m ago`;

  return (
    <div
      className="w-full rounded-xl mb-5 overflow-hidden animate-fade-in command-strip-cinematic"
      style={{ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      data-testid="dashboard-command-strip"
    >
      <div
        className="h-[1px] w-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, hsl(217 91% 58% / 0.6) 25%, hsl(var(--cyber) / 0.5) 60%, transparent 100%)",
        }}
      />

      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">Command Center Status</span>
          </div>
          <div className="flex items-center gap-3">
            {onToggleLive && (
              <button
                onClick={onToggleLive}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all duration-300",
                  liveMode
                    ? "bg-red-500/15 border-red-500/40 text-red-400 animate-live-neon"
                    : "bg-muted/30 border-border/40 text-muted-foreground hover:border-border/60 hover:text-foreground"
                )}
                data-testid="button-live-mode-toggle-strip"
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", liveMode ? "bg-red-400 animate-ping" : "bg-muted-foreground")} />
                {liveMode ? "LIVE" : "AUTO"}
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <RefreshCw className="w-2.5 h-2.5 text-muted-foreground/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] text-muted-foreground/70 font-medium" data-testid="command-strip-updated">{updatedText}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <ThreatLevelTile level={threatLevel} />
          <MetricTile
            icon={AlertTriangle}
            label="Active Incidents"
            value={openIncidents}
            accent
            pulse={criticalCount > 0}
            accentColor="#ef4444"
          />
          <MetricTile
            icon={Zap}
            label="Events / hr"
            value={eventsPerHour}
            sub="/hr"
          />
          <SLATile value={slaBreaches} />
          <ARIATile />
        </div>
      </div>

      <div
        className="h-[1px] w-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.1) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
