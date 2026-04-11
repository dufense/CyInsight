import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export interface RadarSector {
  vector: string;
  label: string;
  count: number;
  dominantSeverity: string;
  topSubType?: string | null;
}

const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  info:     "#3b82f6",
  none:     "#475569",
};

// 14×14 coordinate space — lucide-inspired, stroke-only paths.
// Each icon is centered at (7, 7) and drawn with strokeWidth 1.5, strokeLinecap/Join round.
const SECTOR_SVG_PATHS: Record<string, string> = {
  // Envelope body + fold line showing incoming message
  email:
    "M 1 4 H 13 V 12 H 1 Z M 1 4 L 7 8.5 L 13 4",

  // Monitor bezel + stand + alert triangle inside screen
  endpoint:
    "M 1 2 H 13 V 9 H 1 Z M 6 11 H 8 M 7 9 V 11 " +
    "M 5.5 7 L 7 4.5 L 8.5 7 Z M 7 5.2 V 6.1",

  // Hub node (diamond) + two child nodes (diamond) connected by lines
  network:
    "M 7 0.5 L 8.5 2 L 7 3.5 L 5.5 2 Z " +
    "M 7 3.5 L 3.5 7.5 M 7 3.5 L 10.5 7.5 " +
    "M 3.5 7.5 L 5 9 L 3.5 10.5 L 2 9 Z " +
    "M 10.5 7.5 L 12 9 L 10.5 10.5 L 9 9 Z",

  // Globe outline + equator + two meridian curves
  web:
    "M 7 1 A 6 6 0 0 1 13 7 A 6 6 0 0 1 7 13 A 6 6 0 0 1 1 7 A 6 6 0 0 1 7 1 Z " +
    "M 1 7 H 13 " +
    "M 7 1 C 4.5 4 4.5 10 7 13 " +
    "M 7 1 C 9.5 4 9.5 10 7 13",

  // Code brackets < and > plus forward slash
  web_app:
    "M 4.5 3.5 L 1.5 7 L 4.5 10.5 " +
    "M 9.5 3.5 L 12.5 7 L 9.5 10.5 " +
    "M 7.5 2.5 L 6.5 11.5",

  // Cloud silhouette (4-arc bumpy top, flat bottom)
  cloud:
    "M 2 11.5 A 2.5 2.5 0 0 1 2 6.5 " +
    "A 2 2 0 0 1 5 4.5 " +
    "A 3.5 3.5 0 0 1 12 7 " +
    "A 2.5 2.5 0 0 1 11.5 11.5 Z",

  // Key: circle head + horizontal shaft + two teeth
  identity:
    "M 1 5.5 A 3 3 0 1 0 7 5.5 " +
    "M 7 5.5 H 13 " +
    "M 11 5.5 V 7.5 " +
    "M 9 5.5 V 8.5",

  // Database cylinder (ellipse top cap, straight sides, data warning inside)
  data:
    "M 2 5 A 5 1.5 0 0 1 12 5 L 12 11 A 5 1.5 0 0 1 2 11 Z " +
    "M 2 5 A 5 1.5 0 0 0 12 5 " +
    "M 7 7 V 9 M 7 9.8 V 10.2",

  // Shield outline + exclamation mark (line + dot)
  vulnerability:
    "M 7 1 L 13 3.5 L 13 7.5 C 13 10.5 10.5 12.5 7 14 C 3.5 12.5 1 10.5 1 7.5 L 1 3.5 Z " +
    "M 7 5 V 8.5 M 7 10 V 10.5",

  // Circuit chip: outer square + I/O pins + inner register block
  ai:
    "M 4 4 H 10 V 10 H 4 Z " +
    "M 6 4 V 2 M 8 4 V 2 " +
    "M 6 10 V 12 M 8 10 V 12 " +
    "M 4 6 H 2 M 4 8 H 2 " +
    "M 10 6 H 12 M 10 8 H 12 " +
    "M 5.5 6.5 H 8.5 V 7.5 H 5.5 Z",
};

// ─── Radar geometry ──────────────────────────────────────────────────────────
const CX      = 175;
const CY      = 175;
const R_INNER = 38;
const R_MID   = 76;
const R_OUTER = 114;
const R_LABEL = 148;
const SWEEP_R = R_OUTER;

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function sweepArcPath(sweepDeg: number): string {
  const start = polarToXY(0, SWEEP_R);
  const end   = polarToXY(sweepDeg, SWEEP_R);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${SWEEP_R} ${SWEEP_R} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

interface ThreatRadarSvgProps {
  sectors: RadarSector[];
  isDark: boolean;
}

function ThreatRadarSvg({ sectors, isDark }: ThreatRadarSvgProps) {
  const maxCount = Math.max(...sectors.map(s => s.count), 1);

  const ringStroke    = isDark ? "rgba(34,197,94,0.15)"  : "rgba(37,99,235,0.18)";
  const dividerStroke = isDark ? "rgba(34,197,94,0.10)"  : "rgba(37,99,235,0.12)";
  const sweepColor    = isDark ? "#22c55e"                : "#2563eb";
  const labelColor    = isDark ? "#94a3b8"                : "#334155";
  const labelBold     = isDark ? "#e2e8f0"                : "#0f172a";

  return (
    <svg viewBox="0 0 350 350" width="100%" height="100%" style={{ overflow: "visible" }}>
      <style>{`
        @keyframes radarSweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .radar-sweep-group {
          transform-origin: ${CX}px ${CY}px;
          animation: radarSweep 4s linear infinite;
        }
      `}</style>

      <defs>
        <radialGradient id="discGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={isDark ? "#0a1a2a" : "#eff6ff"} />
          <stop offset="100%" stopColor={isDark ? "#020b14" : "#dbeafe"} />
        </radialGradient>
        <radialGradient id="sweepGrad" cx="0%" cy="50%" r="100%" gradientUnits="userSpaceOnUse"
          x1={CX} y1={CY} x2={CX} y2={CY - SWEEP_R}>
          <stop offset="0%"   stopColor={sweepColor} stopOpacity="0.0" />
          <stop offset="60%"  stopColor={sweepColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={sweepColor} stopOpacity="0.55" />
        </radialGradient>
        <filter id="blipGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
        <filter id="sweepGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
        <clipPath id="discClip">
          <circle cx={CX} cy={CY} r={R_OUTER} />
        </clipPath>
      </defs>

      {/* Background disc */}
      <circle cx={CX} cy={CY} r={R_OUTER + 2} fill="url(#discGrad)" stroke={ringStroke} strokeWidth="1" />

      {/* Concentric rings */}
      {[R_INNER, R_MID, R_OUTER].map(r => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke={ringStroke} strokeWidth="1"
          strokeDasharray={r === R_OUTER ? "none" : "3 4"} />
      ))}

      {/* Sector dividers */}
      {sectors.map((_, i) => {
        const pt = polarToXY(i * 36, R_OUTER);
        return (
          <line key={i} x1={CX} y1={CY} x2={pt.x} y2={pt.y}
            stroke={dividerStroke} strokeWidth="1" strokeDasharray="2 4" />
        );
      })}

      {/* Rotating sweep beam */}
      <g className="radar-sweep-group">
        <path d={sweepArcPath(32)} fill={sweepColor} opacity="0.08" filter="url(#sweepGlow)" clipPath="url(#discClip)" />
        <path d={sweepArcPath(32)} fill="url(#sweepGrad)" opacity="0.5" clipPath="url(#discClip)" />
        <line x1={CX} y1={CY}
          x2={polarToXY(32, SWEEP_R).x} y2={polarToXY(32, SWEEP_R).y}
          stroke={sweepColor} strokeWidth="1.5" opacity="0.8"
          filter="url(#sweepGlow)" clipPath="url(#discClip)" />
      </g>

      {/* Blips + SVG icons + labels */}
      {sectors.map((sector, i) => {
        const angleDeg = i * 36;
        const norm = sector.count > 0 ? Math.sqrt(sector.count / maxCount) : 0;
        const blipR  = R_INNER + (R_OUTER - R_INNER) * norm;
        const blipPos  = polarToXY(angleDeg, blipR);
        const labelPos = polarToXY(angleDeg, R_LABEL);
        const color    = SEV_COLOR[sector.dominantSeverity] || SEV_COLOR.none;
        const hasData  = sector.count > 0;
        const dotR     = hasData ? Math.max(4, 4 + norm * 6) : 0;

        // Text anchor
        const normalizedAngle = ((angleDeg % 360) + 360) % 360;
        const anchor = normalizedAngle > 180 + 20 ? "end"
                     : normalizedAngle > 180 - 20 ? "middle"
                     : normalizedAngle > 20 ? "start"
                     : "middle";

        // Top-half sectors have labels in upper portion of SVG, bottom-half in lower.
        // For top-half: put text ABOVE the icon (smaller y = further from disc).
        // For bottom-half: put text BELOW the icon (larger y = further from disc).
        const isTopHalf = normalizedAngle > 250 || normalizedAngle < 110;
        const textY  = isTopHalf ? labelPos.y - 20 : labelPos.y + 20;
        const countY = isTopHalf ? labelPos.y - 9  : labelPos.y + 29;
        const stY    = isTopHalf ? labelPos.y + 9  : labelPos.y + 40;

        const iconPath = SECTOR_SVG_PATHS[sector.vector] || "";
        const iconStroke = hasData ? color : (isDark ? "#475569" : "#94a3b8");

        return (
          <g key={sector.vector}>
            {/* ── Blip dot with severity ring ─────────────────────── */}
            {hasData && (
              <g filter="url(#blipGlow)">
                {/* Outer severity ring */}
                <circle cx={blipPos.x} cy={blipPos.y} r={dotR + 7}
                  fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
                {/* Glow halo */}
                <circle cx={blipPos.x} cy={blipPos.y} r={dotR + 4} fill={color} opacity="0.18" />
                {/* Core dot with pulse */}
                <circle cx={blipPos.x} cy={blipPos.y} r={dotR} fill={color} opacity="0.9">
                  <animate attributeName="opacity" values="0.9;0.5;0.9"
                    dur={`${1.8 + (i % 4) * 0.35}s`} repeatCount="indefinite" />
                  <animate attributeName="r" values={`${dotR};${dotR * 1.35};${dotR}`}
                    dur={`${1.8 + (i % 4) * 0.35}s`} repeatCount="indefinite" />
                </circle>
              </g>
            )}
            {/* Ghost dot for empty sector */}
            {!hasData && (
              <circle cx={polarToXY(angleDeg, R_INNER).x} cy={polarToXY(angleDeg, R_INNER).y}
                r={2.5} fill={isDark ? "#1e3a5a" : "#bfdbfe"} opacity="0.6" />
            )}

            {/* ── SVG icon at label position ───────────────────────── */}
            <g transform={`translate(${labelPos.x - 7}, ${labelPos.y - 7})`}>
              {/* Severity-tinted background ring */}
              <circle cx="7" cy="7" r="9"
                fill={color} fillOpacity={hasData ? 0.10 : 0.03}
                stroke={color} strokeWidth="0.8" strokeOpacity={hasData ? 0.40 : 0.12}
              />
              {/* Icon path */}
              {iconPath && (
                <path
                  d={iconPath}
                  stroke={iconStroke}
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>

            {/* ── Label text (offset away from disc) ──────────────── */}
            <text
              x={labelPos.x} y={textY}
              textAnchor={anchor}
              fontSize="9"
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
              fill={hasData ? labelBold : labelColor}
              letterSpacing="0.5"
            >
              {sector.label.toUpperCase()}
            </text>

            {/* ── Count bubble ─────────────────────────────────────── */}
            {hasData && (
              <text
                x={labelPos.x} y={countY}
                textAnchor={anchor}
                fontSize="9.5"
                fontFamily="system-ui, sans-serif"
                fontWeight="700"
                fill={color}
              >
                {sector.count.toLocaleString()}
              </text>
            )}

            {/* ── Sub-type annotation ──────────────────────────────── */}
            {hasData && sector.topSubType && (
              <text
                x={labelPos.x} y={stY}
                textAnchor={anchor}
                fontSize="7.5"
                fontFamily="system-ui, sans-serif"
                fontStyle="italic"
                fill={color}
                fillOpacity="0.80"
              >
                [{sector.topSubType}]
              </text>
            )}
          </g>
        );
      })}

      {/* Center crosshair */}
      <circle cx={CX} cy={CY} r={5} fill={sweepColor} opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={CX} cy={CY} r={2} fill={isDark ? "#fff" : "#1e40af"} />
    </svg>
  );
}

// ─── Shared data hook ─────────────────────────────────────────────────────────
interface RadarResponse {
  sectors: RadarSector[];
  windowDays: number;
  fallbackUsed: boolean;
}

function useThreatRadarData(refetchInterval = 30000) {
  const { currentTenant } = useTenant();
  return useQuery<RadarResponse>({
    queryKey: ["/api/threat-radar", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/threat-radar/${currentTenant?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch radar data");
      const body = await res.json();
      // Handle both old array format and new object format
      if (Array.isArray(body)) return { sectors: body, windowDays: 30, fallbackUsed: false };
      return body as RadarResponse;
    },
    enabled: !!currentTenant?.id,
    refetchInterval,
  });
}

// ─── Compact dashboard widget (card-sized, self-contained) ───────────────────
export function ThreatRadarWidget() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { data, isLoading } = useThreatRadarData(60000);

  const sectors = data?.sectors || [];
  const windowDays = data?.windowDays || 30;
  const fallbackUsed = data?.fallbackUsed || false;
  const totalEvents = sectors.reduce((s, x) => s + x.count, 0);
  const topSector = sectors.reduce(
    (a, b) => (b.count > a.count ? b : a),
    { count: 0, label: "—", dominantSeverity: "none", vector: "" } as RadarSector
  );
  const activeSectors = sectors.filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-2 h-full" data-testid="threat-radar-widget">
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Skeleton className="w-36 h-36 rounded-full" />
        </div>
      ) : (
        <>
          {/* Compact SVG */}
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <ThreatRadarSvg sectors={sectors} isDark={isDark} />
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className={`rounded-md p-1.5 text-center ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-100 border border-slate-200"}`}>
              <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
                Threats ({windowDays}d){fallbackUsed && <span className="text-amber-500" title="Using 90-day window (no 30-day data)">*</span>}
              </div>
              <div className="text-lg font-bold tabular-nums"
                style={{ color: SEV_COLOR[topSector.dominantSeverity] || "#64748b" }}>
                {totalEvents.toLocaleString()}
              </div>
            </div>
            <div className={`rounded-md p-1.5 text-center ${isDark ? "bg-white/5 border border-white/10" : "bg-slate-100 border border-slate-200"}`}>
              <div className="text-[9px] text-muted-foreground">Top Vector</div>
              <div className="text-xs font-bold truncate mt-0.5">{topSector.label || "—"}</div>
              {topSector.dominantSeverity !== "none" && (
                <Badge variant="outline" className="text-[8px] px-1 mt-0.5"
                  style={{ borderColor: `${SEV_COLOR[topSector.dominantSeverity]}60`, color: SEV_COLOR[topSector.dominantSeverity] }}>
                  {topSector.dominantSeverity}
                </Badge>
              )}
            </div>
          </div>

          {/* Mini legend */}
          {activeSectors.length > 0 ? (
            <div className={`rounded-md border px-1.5 py-1 ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {activeSectors.slice(0, 6).map(s => {
                  const col = SEV_COLOR[s.dominantSeverity] || SEV_COLOR.none;
                  return (
                    <div key={s.vector} className="flex items-center gap-1 min-w-0 py-px">
                      <svg width="9" height="9" viewBox="0 0 14 14" className="shrink-0" style={{ overflow: "visible" }}>
                        <circle cx="7" cy="7" r="7" fill={col} fillOpacity="0.12" stroke={col} strokeWidth="0.8" strokeOpacity="0.35" />
                        <path d={SECTOR_SVG_PATHS[s.vector] || ""} stroke={col} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[9px] text-muted-foreground truncate flex-1 leading-none">{s.label}</span>
                      <span className="text-[9px] font-bold tabular-nums shrink-0" style={{ color: col }}>{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground text-center py-1">No threats detected</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Full-page component ───────────────────────────────────────────────────────
export function ThreatRadar({ refetchInterval = 30000 }: { refetchInterval?: number }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { data, isLoading } = useThreatRadarData(refetchInterval);

  const sectors = data?.sectors || [];
  const windowDays = data?.windowDays || 30;
  const fallbackUsed = data?.fallbackUsed || false;
  const topSector = sectors.reduce(
    (a, b) => (b.count > a.count ? b : a),
    { count: 0, label: "—", dominantSeverity: "none", vector: "" }
  );
  const totalEvents = sectors.reduce((s, x) => s + x.count, 0);
  const activeSectors = sectors.filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-3 h-full">
      {isLoading ? (
        <div className="flex items-center justify-center flex-1 min-h-[260px]">
          <Skeleton className="w-56 h-56 rounded-full" />
        </div>
      ) : (
        <>
          {/* Radar SVG */}
          <div className="flex-1 flex items-center justify-center min-h-0" style={{ minHeight: 240 }}>
            <ThreatRadarSvg sectors={sectors} isDark={isDark} />
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className={`rounded-lg p-2 text-center ${isDark ? "bg-white/5" : "bg-slate-100"} border ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Threats ({windowDays}d){fallbackUsed && <span className="text-amber-500 text-[9px]" title="Using 90-day window (no 30-day data)">▲ fallback</span>}
              </div>
              <div className="text-xl font-bold tabular-nums mt-0.5"
                style={{ color: SEV_COLOR[topSector.dominantSeverity] || "#64748b" }}>
                {totalEvents.toLocaleString()}
              </div>
            </div>
            <div className={`rounded-lg p-2 text-center ${isDark ? "bg-white/5" : "bg-slate-100"} border ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className="text-xs text-muted-foreground">Top Vector</div>
              <div className="text-sm font-bold mt-0.5 truncate">{topSector.label || "—"}</div>
              {topSector.dominantSeverity !== "none" && (
                <Badge variant="outline" className="text-[9px] px-1 mt-0.5"
                  style={{ borderColor: `${SEV_COLOR[topSector.dominantSeverity]}60`, color: SEV_COLOR[topSector.dominantSeverity] }}>
                  {topSector.dominantSeverity}
                </Badge>
              )}
            </div>
          </div>

          {/* Legend strip — icons + labels + counts */}
          {activeSectors.length > 0 ? (
            <div className={`rounded-lg border px-2 py-1.5 ${isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {activeSectors.slice(0, 10).map(s => {
                  const col = SEV_COLOR[s.dominantSeverity] || SEV_COLOR.none;
                  return (
                    <div key={s.vector} className="flex items-center gap-1.5 min-w-0 py-0.5">
                      {/* Mini SVG icon */}
                      <svg width="11" height="11" viewBox="0 0 14 14" className="shrink-0" style={{ overflow: "visible" }}>
                        <circle cx="7" cy="7" r="7.5" fill={col} fillOpacity="0.10" stroke={col} strokeWidth="0.8" strokeOpacity="0.35" />
                        <path
                          d={SECTOR_SVG_PATHS[s.vector] || ""}
                          stroke={col} fill="none" strokeWidth="1.6"
                          strokeLinecap="round" strokeLinejoin="round"
                        />
                      </svg>
                      {/* Label */}
                      <span className="text-[10px] text-muted-foreground truncate flex-1 leading-none">
                        {s.label}
                        {s.topSubType && (
                          <span className="ml-1 italic" style={{ color: col, opacity: 0.85 }}>
                            [{s.topSubType}]
                          </span>
                        )}
                      </span>
                      {/* Count */}
                      <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: col }}>
                        {s.count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No threats detected in last 30 days</p>
          )}
        </>
      )}
    </div>
  );
}
