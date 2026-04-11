import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, AlertTriangle } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface VectorNode {
  vector: string;
  tabKey: string;
  count: number;
  criticalCount: number;
  topThreat: string;
}

interface AttackVectorRadarProps {
  data: VectorNode[];
  onTabChange?: (tab: string) => void;
}

const VECTOR_ICONS: Record<string, string> = {
  "Email":         "✉",
  "Endpoint":      "💻",
  "Network":       "🌐",
  "Web":           "🔗",
  "Web App":       "⚙",
  "Cloud":         "☁",
  "Identity":      "🪪",
  "Data":          "🗄",
  "Vulnerability": "⚠",
  "AI":            "🤖",
};

function nodeColor(criticalCount: number, count: number): { fill: string; glow: string; ring: string; label: string } {
  if (count === 0) return { fill: "#475569", glow: "rgba(71,85,105,0)", ring: "#334155", label: "None" };
  const ratio = criticalCount / count;
  if (ratio >= 0.4) return { fill: "#ef4444", glow: "rgba(239,68,68,0.45)", ring: "#ef4444", label: "Critical" };
  if (ratio >= 0.15) return { fill: "#f97316", glow: "rgba(249,115,22,0.40)", ring: "#f97316", label: "High" };
  if (criticalCount > 0) return { fill: "#eab308", glow: "rgba(234,179,8,0.35)", ring: "#eab308", label: "Medium" };
  return { fill: "#22c55e", glow: "rgba(34,197,94,0.30)", ring: "#22c55e", label: "Low" };
}

export function AttackVectorRadar({ data, onTabChange }: AttackVectorRadarProps) {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const isDark = theme !== "light";

  const SIZE = 320;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const ORBIT_R = 116;
  const GRID_RINGS = [38, 62, 90, 116];
  const n = data.length || 10;

  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const totalCritical = data.reduce((s, d) => s + d.criticalCount, 0);
  const topVector = data.length > 0
    ? data.reduce((a, b) => (b.count > a.count ? b : a))
    : { vector: "–", count: 0, criticalCount: 0, topThreat: "", tabKey: "" };
  const topVectorColor = nodeColor(topVector.criticalCount, topVector.count);

  const maxCount = Math.max(...data.map(d => d.count), 1);

  const nodes = data.map((d, i) => {
    const angleDeg = -90 + (i / n) * 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = CX + ORBIT_R * Math.cos(angleRad);
    const y = CY + ORBIT_R * Math.sin(angleRad);
    const col = nodeColor(d.criticalCount, d.count);
    const blobR = d.count > 0 ? Math.max(7, Math.min(20, 7 + 13 * (d.count / maxCount))) : 6;
    return { ...d, x, y, col, blobR, angleDeg, angleRad };
  });

  function handleClick(node: typeof nodes[0]) {
    if (onTabChange) {
      onTabChange(node.tabKey);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setLocation(`/dashboard?tab=${node.tabKey}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function truncateTopThreat(threat: string): string {
    if (!threat || threat === "None") return "";
    const cleaned = threat.replace(/^(email|endpoint|network|web|waf|dlp|cloud|identity|vulnerability|casb|sse)\s*/i, "");
    return cleaned.length > 14 ? cleaned.slice(0, 13) + "…" : cleaned;
  }

  const containerBg = isDark
    ? "linear-gradient(160deg, hsl(220 40% 8%) 0%, hsl(230 35% 6%) 60%, hsl(240 30% 5%) 100%)"
    : undefined;
  const headerBg = isDark
    ? "linear-gradient(90deg, hsl(230 60% 12% / 0.9) 0%, hsl(240 50% 10% / 0.5) 100%)"
    : undefined;
  const labelClr    = isDark ? "rgba(255,255,255,0.80)" : "rgba(15,23,42,0.85)";
  const subLabelClr = isDark ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.40)";
  const emptyCount  = isDark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.25)";
  const ringStroke  = isDark ? "rgba(6,182,212,0.12)"   : "rgba(6,182,212,0.20)";
  const spokeEmpty  = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.08)";
  const sweepFill   = isDark ? "rgba(6,182,212,0.07)"   : "rgba(6,182,212,0.06)";
  const statPanelBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const statBorder  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";
  const statLabel   = isDark ? "rgba(255,255,255,0.40)" : "rgba(15,23,42,0.45)";
  const statValue   = isDark ? "#ffffff"                : "#0f172a";

  return (
    <div
      className={`rounded-xl overflow-hidden ${isDark ? "border border-white/10" : "border border-border bg-card"}`}
      style={isDark ? { background: containerBg } : undefined}
      data-testid="attack-vector-radar"
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${isDark ? "border-b border-white/8" : "border-b border-border"}`}
        style={isDark ? { background: headerBg } : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg border border-cyan-500/30 bg-cyan-500/15 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div>
            <span className={`text-xs font-bold tracking-wide ${isDark ? "text-white" : "text-foreground"}`}>ATTACK VECTOR RADAR</span>
            <p className={`text-[9px] font-medium tracking-wider mt-0.5 ${isDark ? "text-white/40" : "text-muted-foreground"}`}>30-day threat surface · Live</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className={`text-[9px] font-medium ${isDark ? "text-white/40" : "text-muted-foreground"}`}>SCANNING</span>
        </div>
      </div>

      {/* SVG Radar */}
      <div className="flex flex-col items-center py-3 px-2">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ overflow: "visible", maxWidth: "100%" }}
        >
          <defs>
            <radialGradient id="avr-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(6,182,212,0.08)" />
              <stop offset="100%" stopColor="rgba(6,182,212,0)" />
            </radialGradient>
            <radialGradient id="avr-hub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </radialGradient>
            {nodes.map((node, i) => (
              <radialGradient key={`ng-${i}`} id={`avr-node-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={node.col.fill} stopOpacity="0.9" />
                <stop offset="100%" stopColor={node.col.fill} stopOpacity="0.2" />
              </radialGradient>
            ))}
            <filter id="avr-glow-node">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="avr-glow-hub">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <style>{`
              @keyframes avr-sweep {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
              @keyframes avr-pulse {
                0%, 100% { opacity: 0.6; }
                50%       { opacity: 1.0; }
              }
              .avr-sweep-group {
                transform-origin: ${CX}px ${CY}px;
                animation: avr-sweep 4s linear infinite;
              }
              .avr-hub-pulse {
                animation: avr-pulse 2s ease-in-out infinite;
              }
            `}</style>
          </defs>

          {/* Background fill */}
          <circle cx={CX} cy={CY} r={ORBIT_R + 10} fill="url(#avr-bg)" />

          {/* Grid rings */}
          {GRID_RINGS.map((r) => (
            <circle
              key={r}
              cx={CX} cy={CY} r={r}
              fill="none"
              stroke={ringStroke}
              strokeWidth={1}
              strokeDasharray={r < 90 ? "3 4" : "2 3"}
            />
          ))}

          {/* Radial grid lines */}
          {Array.from({ length: n }).map((_, i) => {
            const angleDeg = -90 + (i / n) * 360;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x2 = CX + (ORBIT_R + 8) * Math.cos(angleRad);
            const y2 = CY + (ORBIT_R + 8) * Math.sin(angleRad);
            return (
              <line key={i} x1={CX} y1={CY} x2={x2} y2={y2}
                stroke={ringStroke} strokeWidth={1} />
            );
          })}

          {/* Rotating sweep */}
          <g className="avr-sweep-group">
            <path
              d={`M ${CX} ${CY} L ${CX} ${CY - ORBIT_R - 8} A ${ORBIT_R + 8} ${ORBIT_R + 8} 0 0 1 ${(CX + (ORBIT_R + 8) * Math.cos(((-90 + 40) * Math.PI) / 180)).toFixed(2)} ${(CY + (ORBIT_R + 8) * Math.sin(((-90 + 40) * Math.PI) / 180)).toFixed(2)} Z`}
              fill={sweepFill}
            />
            <line
              x1={CX} y1={CY}
              x2={CX} y2={CY - ORBIT_R - 8}
              stroke="rgba(6,182,212,0.6)"
              strokeWidth={1.5}
            />
          </g>

          {/* Spoke lines */}
          {nodes.map((node, i) => (
            <line
              key={`spoke-${i}`}
              x1={CX} y1={CY}
              x2={node.x} y2={node.y}
              stroke={node.count > 0 ? node.col.ring : spokeEmpty}
              strokeWidth={node.count > 0 ? 1 : 0.5}
              strokeOpacity={0.35}
              strokeDasharray="2 3"
            />
          ))}

          {/* Node blobs */}
          {nodes.map((node, i) => {
            const labelR = ORBIT_R + 22;
            const lx = CX + labelR * Math.cos(node.angleRad);
            const ly = CY + labelR * Math.sin(node.angleRad);
            const anchor = node.x < CX - 5 ? "end" : node.x > CX + 5 ? "start" : "middle";
            const topThreatStr = truncateTopThreat(node.topThreat);
            return (
              <g key={`node-${i}`}
                style={{ cursor: "pointer" }}
                onClick={() => handleClick(node)}
                data-testid={`radar-node-${node.tabKey}`}
              >
                {node.count > 0 && (
                  <circle
                    cx={node.x} cy={node.y}
                    r={node.blobR + 5}
                    fill={node.col.glow}
                    filter="url(#avr-glow-node)"
                  />
                )}
                <circle
                  cx={node.x} cy={node.y}
                  r={node.blobR}
                  fill={`url(#avr-node-${i})`}
                  stroke={node.col.ring}
                  strokeWidth={1.5}
                  strokeOpacity={0.8}
                />
                {node.criticalCount > 0 && (
                  <circle
                    cx={node.x} cy={node.y}
                    r={node.blobR}
                    fill="none"
                    stroke={node.col.ring}
                    strokeWidth={2}
                    strokeOpacity={0.5}
                    strokeDasharray="2 2"
                    className="avr-hub-pulse"
                  />
                )}
                {/* Icon */}
                <text
                  x={node.x} y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={node.blobR * 0.85}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {VECTOR_ICONS[node.vector] || "•"}
                </text>

                {/* Label row: vector name */}
                <text
                  x={lx} y={ly - 5}
                  textAnchor={anchor}
                  dominantBaseline="auto"
                  fontSize={8.5}
                  fontWeight="600"
                  fill={labelClr}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {node.vector}
                </text>
                {/* Count */}
                <text
                  x={lx} y={ly + 6}
                  textAnchor={anchor}
                  dominantBaseline="auto"
                  fontSize={8}
                  fontWeight="700"
                  fill={node.count > 0 ? node.col.fill : emptyCount}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {node.count > 0 ? node.count.toLocaleString() : "—"}
                </text>
                {/* Top threat sub-label */}
                {topThreatStr && (
                  <text
                    x={lx} y={ly + 17}
                    textAnchor={anchor}
                    dominantBaseline="auto"
                    fontSize={7}
                    fill={subLabelClr}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    [{topThreatStr}]
                  </text>
                )}
              </g>
            );
          })}

          {/* Hub center */}
          <circle cx={CX} cy={CY} r={20} fill="url(#avr-hub)" filter="url(#avr-glow-hub)" />
          <circle cx={CX} cy={CY} r={14} fill="rgba(6,182,212,0.12)" stroke="rgba(6,182,212,0.40)" strokeWidth={1.5} />
          <circle cx={CX} cy={CY} r={4} fill="rgba(6,182,212,0.9)" className="avr-hub-pulse" />
          <text
            x={CX} y={CY + 22}
            textAnchor="middle"
            fontSize={7}
            fill="rgba(6,182,212,0.55)"
            fontWeight="600"
            letterSpacing="1"
            style={{ userSelect: "none" }}
          >
            SOC
          </text>
        </svg>
      </div>

      {/* Bottom stats strip */}
      <div className="px-4 pb-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border" style={{ background: statPanelBg, borderColor: statBorder }}>
          <p className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: statLabel }}>Total Events (30d)</p>
          <p className="text-xl font-bold leading-none mt-0.5" style={{ color: statValue }}>{totalCount.toLocaleString()}</p>
        </div>
        <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border" style={{ background: statPanelBg, borderColor: statBorder }}>
          <p className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: statLabel }}>Top Vector</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-sm font-bold leading-none" style={{ color: topVector.count > 0 ? topVectorColor.fill : "#64748b" }}>
              {topVector.vector}
            </span>
            {topVector.count > 0 && (
              <Badge className="text-[9px] px-1.5 py-0 border font-semibold"
                style={{
                  background: `${topVectorColor.glow}`,
                  borderColor: topVectorColor.ring,
                  color: topVectorColor.fill,
                }}
              >
                {topVectorColor.label}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border" style={{ background: statPanelBg, borderColor: statBorder }}>
          <p className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: statLabel }}>Critical / High</p>
          <div className="flex items-center gap-1 mt-0.5">
            {totalCritical > 0
              ? <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              : <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
            }
            <span className="text-sm font-bold" style={{ color: totalCritical > 0 ? "#ef4444" : "#22c55e" }}>
              {totalCritical.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
