import { useMemo, useEffect, useRef } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id?: number | string;
  severity?: string;
  type?: string;
  source?: string;
  createdAt?: string;
  time?: string;
  description?: string;
}

const SEV_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.35)", label: "CRIT" },
  high:     { color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.30)", label: "HIGH" },
  medium:   { color: "#eab308", bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.30)", label: "MED" },
  low:      { color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.25)", label: "LOW" },
  info:     { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", label: "INFO" },
};

function getSev(raw?: string) {
  return SEV_CONFIG[(raw ?? "").toLowerCase()] ?? SEV_CONFIG.info;
}

function timeLabel(raw?: string): string {
  if (!raw) return "now";
  try {
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return "now";
    const diff = (Date.now() - dt.getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "now";
  }
}

interface LiveEventsTickerProps {
  events: LiveEvent[];
  eventsTimeline?: Array<{ time: string; count?: number; critical?: number; high?: number }>;
  className?: string;
}

function EventPill({ evt }: { evt: LiveEvent }) {
  const sev = getSev(evt.severity);
  const ts = timeLabel(evt.createdAt ?? evt.time);
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 text-[10px] border"
      style={{ background: sev.bg, borderColor: sev.border, color: sev.color }}
    >
      <span className="font-black font-mono w-7 text-center text-[9px]">{sev.label}</span>
      <span className="text-foreground/80 whitespace-nowrap max-w-[140px] overflow-hidden text-ellipsis" style={{ color: "hsl(var(--foreground) / 0.85)" }}>
        {evt.type ?? evt.description ?? "Security event"}
      </span>
      {evt.source && (
        <span className="text-muted-foreground/60 whitespace-nowrap border-l border-current/20 pl-1.5">
          {evt.source}
        </span>
      )}
      <span className="text-muted-foreground/50 font-mono whitespace-nowrap border-l border-current/20 pl-1.5">{ts}</span>
    </div>
  );
}

export function LiveEventsTicker({ events, eventsTimeline, className }: LiveEventsTickerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  const sparklineData = useMemo(() => {
    if (!eventsTimeline || eventsTimeline.length === 0) return [];
    return eventsTimeline.slice(-30).map((d, i) => ({
      i,
      v: (d.count ?? 0) + (d.critical ?? 0) * 2 + (d.high ?? 0),
    }));
  }, [eventsTimeline]);

  const recentEvents = useMemo(() => events.slice(0, 30), [events]);
  const totalEvents = events.length;
  const critCount = events.filter(e => (e.severity ?? "").toLowerCase() === "critical").length;
  const highCount = events.filter(e => (e.severity ?? "").toLowerCase() === "high").length;

  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let pos = 0;
    let raf: number;
    const speed = 0.5;
    const step = () => {
      if (!pausedRef.current) {
        pos += speed;
        const half = el.scrollWidth / 2;
        if (pos >= half) pos = 0;
        el.style.transform = `translateX(-${pos}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [recentEvents]);

  const pillSet = recentEvents.length === 0
    ? [{ id: "__empty", severity: "info", type: "Waiting for live events...", source: undefined }]
    : recentEvents;

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="live-events-ticker">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping shrink-0" />
          <span className="text-[10px] font-black text-red-400 tracking-[0.15em] uppercase">Live Feed</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="font-mono">{totalEvents} events</span>
          {critCount > 0 && <span className="text-red-400 font-bold">{critCount} critical</span>}
          {highCount > 0 && <span className="text-orange-400 font-bold">{highCount} high</span>}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground/40 font-mono">
          <span className="animate-pulse">●</span>
          <span>STREAMING 5s</span>
        </div>
      </div>

      {sparklineData.length > 0 && (
        <div className="h-8 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="liveGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#liveGrad2)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Horizontal scrolling ticker tape */}
      <div
        className="relative overflow-hidden rounded-lg border border-red-500/15 bg-red-500/[0.02]"
        style={{ height: "38px" }}
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        <div className="absolute inset-0 flex items-center">
          <div
            ref={tickerRef}
            className="flex items-center gap-2 will-change-transform"
            style={{ whiteSpace: "nowrap" }}
          >
            {pillSet.map((evt, idx) => (
              <EventPill key={`a-${evt.id ?? idx}`} evt={evt} />
            ))}
            <div className="w-6 shrink-0" />
            {pillSet.map((evt, idx) => (
              <EventPill key={`b-${evt.id ?? idx}`} evt={evt} />
            ))}
          </div>
        </div>
        <div
          className="absolute inset-y-0 left-0 w-8 pointer-events-none z-10"
          style={{ background: "linear-gradient(to right, hsl(var(--card)), transparent)" }}
        />
        <div
          className="absolute inset-y-0 right-0 w-8 pointer-events-none z-10"
          style={{ background: "linear-gradient(to left, hsl(var(--card)), transparent)" }}
        />
      </div>
    </div>
  );
}
