import { useMemo, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getColor(density: number, max: number): string {
  if (max === 0 || density === 0) return "rgba(30,40,60,0.4)";
  const ratio = Math.min(density / max, 1);
  if (ratio < 0.25) return `rgba(59,130,246,${0.15 + ratio * 0.6})`;
  if (ratio < 0.5) return `rgba(245,158,11,${0.3 + ratio * 0.5})`;
  if (ratio < 0.75) return `rgba(249,115,22,${0.5 + ratio * 0.3})`;
  return `rgba(239,68,68,${0.6 + ratio * 0.4})`;
}

function getBorderColor(density: number, max: number): string {
  if (max === 0 || density === 0) return "rgba(255,255,255,0.03)";
  const ratio = density / max;
  if (ratio < 0.25) return "rgba(59,130,246,0.2)";
  if (ratio < 0.5) return "rgba(245,158,11,0.3)";
  if (ratio < 0.75) return "rgba(249,115,22,0.4)";
  return "rgba(239,68,68,0.6)";
}

interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface IncidentHeatmapProps {
  eventsTimeline?: Array<{
    time: string;
    count?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  }>;
  incidents?: Array<{ createdAt?: string; severity?: string }>;
}

export function IncidentHeatmap({ eventsTimeline, incidents }: IncidentHeatmapProps) {
  const [hovered, setHovered] = useState<{ day: number; hour: number } | null>(null);

  const { grid, sevGrid, hasData } = useMemo(() => {
    const countGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const sevBreakdown: SeverityBreakdown[][] = Array.from(
      { length: 7 },
      () => Array.from({ length: 24 }, () => ({ critical: 0, high: 0, medium: 0, low: 0 }))
    );
    let populated = false;

    if (eventsTimeline && eventsTimeline.length > 0) {
      for (const evt of eventsTimeline) {
        let dt: Date;
        try {
          dt = new Date(evt.time);
          if (isNaN(dt.getTime())) continue;
        } catch {
          continue;
        }
        const day = (dt.getUTCDay() + 6) % 7;
        const hour = dt.getUTCHours();
        const crit = evt.critical ?? 0;
        const high = evt.high ?? 0;
        const med = evt.medium ?? 0;
        const low = evt.low ?? 0;
        const breakdownSum = crit + high + med + low;
        const total = breakdownSum > 0 ? breakdownSum : (evt.count ?? 0);
        if (total === 0) continue;
        countGrid[day][hour] += total;
        sevBreakdown[day][hour].critical += crit;
        sevBreakdown[day][hour].high += high;
        sevBreakdown[day][hour].medium += med;
        sevBreakdown[day][hour].low += low;
        populated = true;
      }
    }

    if (incidents && incidents.length > 0) {
      for (const inc of incidents) {
        let dt: Date;
        try {
          dt = new Date(inc.createdAt ?? "");
          if (isNaN(dt.getTime())) continue;
        } catch {
          continue;
        }
        const day = (dt.getUTCDay() + 6) % 7;
        const hour = dt.getUTCHours();
        const sev = (inc.severity ?? "").toLowerCase();
        const weight = sev === "critical" ? 5 : sev === "high" ? 3 : sev === "medium" ? 2 : 1;
        countGrid[day][hour] += weight;
        if (sev === "critical") sevBreakdown[day][hour].critical += 1;
        else if (sev === "high") sevBreakdown[day][hour].high += 1;
        else if (sev === "medium") sevBreakdown[day][hour].medium += 1;
        else sevBreakdown[day][hour].low += 1;
        populated = true;
      }
    }

    return { grid: countGrid, sevGrid: sevBreakdown, hasData: populated };
  }, [eventsTimeline, incidents]);

  const maxCount = useMemo(
    () => Math.max(...grid.flat(), 1),
    [grid]
  );

  const peakHour = useMemo(() => {
    let maxH = 0, maxVal = 0;
    for (let h = 0; h < 24; h++) {
      const sum = grid.reduce((a, row) => a + row[h], 0);
      if (sum > maxVal) { maxVal = sum; maxH = h; }
    }
    return maxH;
  }, [grid]);

  const peakDay = useMemo(() => {
    let maxD = 0, maxVal = 0;
    for (let d = 0; d < 7; d++) {
      const sum = grid[d].reduce((a, b) => a + b, 0);
      if (sum > maxVal) { maxVal = sum; maxD = d; }
    }
    return DAYS[maxD];
  }, [grid]);

  const hoveredCell = hovered ? { count: grid[hovered.day][hovered.hour], sev: sevGrid[hovered.day][hovered.hour] } : null;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">No incident data available</p>
        <p className="text-[10px] text-muted-foreground/60">Heatmap populates as events are ingested</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] text-white/40 font-medium">
        <span className="uppercase tracking-widest">Hour of Day (UTC)</span>
        <div className="flex items-center gap-3">
          {hasData && (
            <span>Peak: <span className="text-orange-400 font-bold">{peakDay} {peakHour.toString().padStart(2, "0")}:00</span></span>
          )}
          <div className="flex items-center gap-1.5">
            <span>Low</span>
            <div className="flex gap-0.5">
              {["rgba(59,130,246,0.3)", "rgba(245,158,11,0.5)", "rgba(249,115,22,0.7)", "rgba(239,68,68,0.9)"].map((c, i) => (
                <div key={i} className="w-3 h-2.5 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col justify-around pt-1">
          {DAYS.map((d) => (
            <div key={d} className="text-[9px] text-white/30 font-mono w-7 leading-none">{d}</div>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex gap-px mb-1">
            {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
              <div key={h} className="flex-1 text-[8px] text-white/20 font-mono text-center">{h.toString().padStart(2, "0")}</div>
            ))}
          </div>
          <div className="flex flex-col gap-px">
            {DAYS.map((day, di) => (
              <div key={day} className="flex gap-px">
                {HOURS.map((hour) => {
                  const count = grid[di][hour];
                  const isHovered = hovered?.day === di && hovered?.hour === hour;
                  return (
                    <div
                      key={hour}
                      className="flex-1 rounded-[2px] cursor-pointer transition-all duration-100"
                      style={{
                        height: "14px",
                        background: getColor(count, maxCount),
                        border: `1px solid ${isHovered ? "#ffffff44" : getBorderColor(count, maxCount)}`,
                        transform: isHovered ? "scale(1.3)" : "scale(1)",
                        zIndex: isHovered ? 10 : 0,
                        position: "relative",
                      }}
                      onMouseEnter={() => setHovered({ day: di, hour })}
                      onMouseLeave={() => setHovered(null)}
                      data-testid={`heatmap-cell-${di}-${hour}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hovered && hoveredCell && (
        <div className="flex items-center gap-3 text-[10px] py-1.5 px-3 rounded-lg border border-white/10 bg-white/[0.03] flex-wrap">
          <span className="text-white/50 font-mono">{DAYS[hovered.day]} {hovered.hour.toString().padStart(2, "0")}:00</span>
          <span className="font-mono font-bold text-white">{hoveredCell.count} events</span>
          {hoveredCell.sev.critical > 0 && <span className="text-red-400">C:{hoveredCell.sev.critical}</span>}
          {hoveredCell.sev.high > 0 && <span className="text-orange-400">H:{hoveredCell.sev.high}</span>}
          {hoveredCell.sev.medium > 0 && <span className="text-yellow-400">M:{hoveredCell.sev.medium}</span>}
          {hoveredCell.sev.low > 0 && <span className="text-green-400">L:{hoveredCell.sev.low}</span>}
        </div>
      )}
    </div>
  );
}
