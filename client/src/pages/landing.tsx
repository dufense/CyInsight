import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield,
  Lock,
  Zap,
  ChevronRight,
  User,
  KeyRound,
  ShieldCheck,
  Radar,
  Brain,
  Network,
  Globe,
  Activity,
  Eye,
  Cpu,
  Wifi,
  AlertTriangle,
  LogIn,
  Fingerprint,
  Server,
  GitBranch,
  BarChart3,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const platformStats = [
  { value: 5, label: "Data Regions", suffix: "" },
  { value: 32, label: "Integrations", suffix: "+" },
  { value: 3120, label: "Sigma Rules", suffix: "" },
  { value: 99.9, label: "Uptime SLA", suffix: "%" },
];

const THREAT_EVENTS = [
  { src: "CN", dst: "US", type: "Brute Force", sev: "HIGH", target: "Financial" },
  { src: "RU", dst: "DE", type: "Ransomware C2", sev: "CRITICAL", target: "Healthcare" },
  { src: "IR", dst: "UK", type: "Phishing Campaign", sev: "MEDIUM", target: "Government" },
  { src: "BR", dst: "JP", type: "DDoS Attack", sev: "HIGH", target: "Telecom" },
  { src: "NG", dst: "AU", type: "Credential Stuffing", sev: "MEDIUM", target: "Retail" },
  { src: "CN", dst: "FR", type: "APT Lateral Move", sev: "CRITICAL", target: "Defense" },
  { src: "RU", dst: "CA", type: "SQL Injection", sev: "HIGH", target: "Banking" },
  { src: "KP", dst: "US", type: "Supply Chain Attack", sev: "CRITICAL", target: "Tech" },
  { src: "PK", dst: "IN", type: "Spear Phishing", sev: "HIGH", target: "Energy" },
  { src: "UA", dst: "SG", type: "Cryptominer Drop", sev: "LOW", target: "Cloud" },
  { src: "TR", dst: "NL", type: "Web Shell Deploy", sev: "HIGH", target: "Education" },
  { src: "VN", dst: "US", type: "Data Exfiltration", sev: "CRITICAL", target: "Pharma" },
];

const SEV_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  CRITICAL: { text: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
  HIGH:     { text: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)" },
  MEDIUM:   { text: "#eab308", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.3)" },
  LOW:      { text: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)" },
};

/* ── Full-Viewport Geodesic Background Mesh ── */
function BackgroundMesh() {
  const W = 1920;
  const H = 1080;
  const COLS = 9;
  const ROWS = 5;
  const CONNECT_DIST = 260;

  type MNode = { x: number; y: number; accent: boolean };
  const nodes: MNode[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ox = row % 2 === 0 ? 0 : (W / COLS) * 0.5;
      const x = (col / (COLS - 1)) * (W * 0.9) + W * 0.05 + ox;
      const y = (row / (ROWS - 1)) * (H * 0.85) + H * 0.075;
      const accent = (row * COLS + col) % 7 === 0;
      nodes.push({ x, y, accent });
    }
  }

  const edges: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < CONNECT_DIST) {
        edges.push([i, j]);
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.18 }}
    >
      <defs>
        <filter id="meshNodeGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g style={{ animation: "mesh-drift 18s ease-in-out infinite alternate", transformOrigin: "960px 540px" }}>
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x} y1={nodes[a].y}
            x2={nodes[b].x} y2={nodes[b].y}
            stroke={i % 5 === 0 ? "#06b6d4" : "#3b82f6"}
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
        ))}
        {nodes.map((node, i) => (
          <g key={i}>
            {node.accent && (
              <circle
                cx={node.x} cy={node.y} r={7}
                fill="none" stroke="#06b6d4" strokeWidth="0.8" strokeOpacity="0.5"
                style={{
                  animation: `mesh-pulse ${2.5 + (i % 4) * 0.5}s ease-in-out infinite alternate`,
                  animationDelay: `${(i % 7) * 0.4}s`,
                }}
              />
            )}
            <circle
              cx={node.x} cy={node.y}
              r={node.accent ? 3.5 : 2}
              fill={node.accent ? "#06b6d4" : "#60a5fa"}
              fillOpacity={node.accent ? 0.85 : 0.45}
              filter={node.accent ? "url(#meshNodeGlow)" : undefined}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

function useCountUp(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (target === 0) { setCount(0); return; }
    let startTime: number;
    const isFloat = target % 1 !== 0;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = isFloat ? parseFloat((ease * target).toFixed(1)) : Math.floor(ease * target);
      setCount(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

function StatItem({ stat, started }: { stat: typeof platformStats[0]; started: boolean }) {
  const count = useCountUp(stat.value, 2000, started);
  return (
    <div className="text-center group">
      <div
        className="text-2xl font-black tracking-tight tabular-nums"
        style={{ color: "#fff", textShadow: "0 0 20px rgba(59,130,246,0.5)" }}
        data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {stat.value % 1 !== 0 ? count.toFixed(1) : count.toLocaleString()}{stat.suffix}
      </div>
      <div className="text-[10px] text-blue-400/60 font-semibold tracking-widest uppercase mt-1">{stat.label}</div>
    </div>
  );
}

/* ── Rotating Cyber Network Orb ── */
function CyberOrb() {
  const svgRef = useRef<SVGSVGElement>(null);
  const R = 220;
  const cx = 260;
  const cy = 260;

  const rings = [
    { lat: -60, n: 6 },
    { lat: -30, n: 10 },
    { lat: 0,   n: 12 },
    { lat: 30,  n: 10 },
    { lat: 60,  n: 6  },
  ];

  type Node = { x: number; y: number; z: number; r: number };
  const nodes: Node[] = [];
  nodes.push({ x: cx, y: cy - R, z: 0, r: 4 });
  nodes.push({ x: cx, y: cy + R, z: 0, r: 4 });
  for (const ring of rings) {
    const phi = (ring.lat * Math.PI) / 180;
    const rr = Math.cos(phi) * R;
    const y0 = cy - Math.sin(phi) * R;
    for (let i = 0; i < ring.n; i++) {
      const theta = (i / ring.n) * Math.PI * 2;
      nodes.push({ x: cx + Math.cos(theta) * rr, y: y0, z: Math.sin(theta) * rr, r: 2.5 });
    }
  }

  const edges: [number, number][] = [];
  let offset = 2;
  for (let ri = 0; ri < rings.length; ri++) {
    const n = rings[ri].n;
    for (let i = 0; i < n; i++) {
      edges.push([offset + i, offset + (i + 1) % n]);
    }
    if (ri < rings.length - 1) {
      const nextOff = offset + n;
      const nextN = rings[ri + 1].n;
      for (let i = 0; i < Math.min(n, nextN); i++) {
        edges.push([offset + i, nextOff + Math.round((i / n) * nextN) % nextN]);
      }
    }
    offset += n;
  }
  for (let i = 0; i < rings[0].n; i++) edges.push([0, 2 + i]);
  for (let i = 0; i < rings[rings.length - 1].n; i++) edges.push([1, 2 + rings.slice(0, -1).reduce((s, r) => s + r.n, 0) + i]);

  const pulseNodes = [5, 12, 19, 27, 34];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 520 520"
      className="w-full h-full pointer-events-none select-none"
      style={{ filter: "drop-shadow(0 0 60px rgba(59,130,246,0.15))" }}
    >
      <defs>
        <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.06" />
          <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={R + 20} fill="url(#orbGlow)" />

      <g style={{ animation: "orb-spin 28s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x} y1={nodes[a].y}
            x2={nodes[b].x} y2={nodes[b].y}
            stroke="#3b82f6"
            strokeWidth="0.6"
            strokeOpacity="0.22"
          />
        ))}

        {nodes.map((node, i) => {
          const isPulse = pulseNodes.includes(i);
          const isLarge = i === 0 || i === 1;
          return (
            <g key={i} filter={isPulse ? "url(#nodeGlow)" : undefined}>
              {isPulse && (
                <circle
                  cx={node.x} cy={node.y}
                  r={node.r + 6}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  style={{ animation: `orb-pulse ${2 + (i % 3)}s ease-in-out infinite alternate`, animationDelay: `${i * 0.3}s` }}
                />
              )}
              <circle
                cx={node.x} cy={node.y}
                r={node.r}
                fill={isPulse ? "#06b6d4" : isLarge ? "#3b82f6" : "#60a5fa"}
                fillOpacity={isPulse ? 0.9 : 0.55}
                style={isPulse ? { animation: `orb-pulse ${2 + (i % 3)}s ease-in-out infinite alternate`, animationDelay: `${i * 0.3}s` } : undefined}
              />
            </g>
          );
        })}
      </g>

      <g style={{ animation: "orb-spin-slow 45s linear infinite reverse", transformOrigin: `${cx}px ${cy}px`, opacity: 0.12 }}>
        <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.28} fill="none" stroke="#06b6d4" strokeWidth="0.8" />
        <ellipse cx={cx} cy={cy} rx={R * 0.85} ry={R * 0.22} fill="none" stroke="#3b82f6" strokeWidth="0.6" />
        <ellipse cx={cx} cy={cy} rx={R * 0.55} ry={R * 0.15} fill="none" stroke="#818cf8" strokeWidth="0.5" />
      </g>
    </svg>
  );
}

/* ── Live Threat Feed ── */
type FeedEntry = { evt: typeof THREAT_EVENTS[0]; ts: number; id: number };

function useElapsed(ts: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - ts) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ts]);
  return elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;
}

function FeedRow({ entry, i, entering }: { entry: FeedEntry; i: number; entering: number | null }) {
  const col = SEV_COLORS[entry.evt.sev];
  const isNew = i === 0 && entering !== null;
  const elapsed = useElapsed(entry.ts);
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2"
      style={{
        background: i === 0 ? col.bg : "rgba(255,255,255,0.02)",
        border: `1px solid ${i === 0 ? col.border : "rgba(255,255,255,0.05)"}`,
        opacity: isNew ? 0 : 1 - i * 0.15,
        transform: isNew ? "translateY(-8px)" : "translateY(0)",
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: col.text }} />
      <div className="flex items-center gap-1 text-[11px] font-mono shrink-0">
        <span className="text-white/70 font-bold">{entry.evt.src}</span>
        <span className="text-white/20">→</span>
        <span className="text-white/70 font-bold">{entry.evt.dst}</span>
      </div>
      <span className="text-[11px] text-white/55 flex-1 truncate">{entry.evt.type}</span>
      <span className="text-[10px] text-white/25 font-mono shrink-0">{elapsed}</span>
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{ color: col.text, background: col.bg, border: `1px solid ${col.border}` }}
      >
        {entry.evt.sev}
      </span>
    </div>
  );
}

function LiveThreatFeed() {
  const [visible, setVisible] = useState<FeedEntry[]>([]);
  const [entering, setEntering] = useState<number | null>(null);
  const indexRef = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const initial: FeedEntry[] = THREAT_EVENTS.slice(0, 4).map((evt, i) => ({
      evt,
      ts: now - (4 - i) * 2400,
      id: idRef.current++,
    }));
    setVisible(initial);
    indexRef.current = 4;

    const interval = setInterval(() => {
      const next: FeedEntry = {
        evt: THREAT_EVENTS[indexRef.current % THREAT_EVENTS.length],
        ts: Date.now(),
        id: idRef.current++,
      };
      indexRef.current++;
      setEntering(next.id);
      setVisible(prev => [next, ...prev.slice(0, 3)]);
      setTimeout(() => setEntering(null), 600);
    }, 2400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
          <span className="relative rounded-full w-2 h-2 bg-red-400" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Live Threat Feed</span>
        <span className="text-[10px] text-white/25 ml-auto font-mono">{new Date().toLocaleTimeString()}</span>
      </div>
      <div className="space-y-1.5 overflow-hidden" style={{ maxHeight: "190px" }}>
        {visible.map((entry, i) => (
          <FeedRow key={entry.id} entry={entry} i={i} entering={entering} />
        ))}
      </div>
    </div>
  );
}

/* ── Threat Ticker ── */
function ThreatTicker() {
  const items = [...THREAT_EVENTS, ...THREAT_EVENTS];
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-blue-500/10 bg-[#03060f]/90 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center">
        <div className="flex items-center gap-2 px-4 py-2 border-r border-white/[0.05] shrink-0">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-red-400">LIVE</span>
        </div>
        <div className="overflow-hidden flex-1">
          <div
            className="flex gap-8 whitespace-nowrap"
            style={{ animation: reducedMotion ? "none" : "threat-scroll 32s linear infinite" }}
          >
            {items.map((evt, i) => {
              const col = SEV_COLORS[evt.sev];
              return (
                <div key={i} className="inline-flex items-center gap-2 py-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: col.text }} />
                  <span className="text-[10px] font-mono text-white/50">
                    <span className="text-white/80 font-semibold">{evt.src}</span>
                    <span className="text-white/20 mx-1">→</span>
                    <span className="text-white/80 font-semibold">{evt.dst}</span>
                  </span>
                  <span className="text-[10px] text-white/40">{evt.type}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: col.text, background: col.bg }}>
                    {evt.sev}
                  </span>
                  <span className="w-px h-3 bg-white/[0.06] mx-2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Scan Line ── */
function ScanLine() {
  return (
    <div
      className="absolute left-0 right-0 h-px pointer-events-none z-20"
      style={{
        background: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.4) 30%, rgba(59,130,246,0.6) 50%, rgba(6,182,212,0.4) 70%, transparent 100%)",
        boxShadow: "0 0 12px rgba(59,130,246,0.4)",
        animation: "scan-sweep 6s ease-in-out infinite",
      }}
    />
  );
}

/* ── Main Page ── */
export default function LandingPage() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [statsStarted, setStatsStarted] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const [ssoInfo, setSsoInfo] = useState<{ hasSSO: boolean; provider?: string; displayName?: string; tenantId?: number; loginUrl?: string } | null>(null);
  const [ssoCheckTimeout, setSsoCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [cardVisible, setCardVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStatsStarted(true), 400);
    const t2 = setTimeout(() => setCardVisible(true), 150);
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsStarted(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => { clearTimeout(t1); clearTimeout(t2); observer.disconnect(); };
  }, []);

  const checkSso = useCallback(async (value: string) => {
    if (!value.includes("@")) { setSsoInfo(null); return; }
    try {
      const res = await fetch(`/api/auth/sso-check?email=${encodeURIComponent(value)}`);
      const data = await res.json();
      setSsoInfo(data);
    } catch { setSsoInfo(null); }
  }, []);

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (ssoCheckTimeout) clearTimeout(ssoCheckTimeout);
    const t = setTimeout(() => checkSso(value), 500);
    setSsoCheckTimeout(t);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, mfaToken: mfaRequired ? mfaToken : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.message || "Invalid credentials", variant: "destructive" });
        return;
      }
      if (data.requireMfa) {
        setMfaRequired(true);
        toast({ title: "MFA Required", description: "Enter your authenticator code to continue" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      window.location.href = "/";
    } catch {
      toast({ title: "Login failed", description: "Connection error", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white overflow-hidden landing-page" style={{ background: "#03060f" }}>

      {/* ── Deep space base gradient ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(17,24,60,0.8) 0%, transparent 70%), radial-gradient(ellipse 60% 80% at 80% 60%, rgba(6,18,46,0.5) 0%, transparent 60%), #03060f",
      }} />

      {/* ── Full-viewport geodesic mesh (primary animated background) ── */}
      <BackgroundMesh />

      {/* ── Grid overlay ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `linear-gradient(rgba(59,130,246,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.025) 1px, transparent 1px)`,
        backgroundSize: "80px 80px",
      }} />

      {/* ── Hex-grid texture ── */}
      <div className="fixed inset-0 z-0 pointer-events-none animate-hex-drift" style={{
        opacity: 0.012,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104'%3E%3Cpath d='M30 2L58 17v30L30 62 2 47V17z' fill='none' stroke='%2300d4ff' stroke-width='0.8'/%3E%3Cpath d='M30 62L58 77v25L30 116 2 101V77z' fill='none' stroke='%2300d4ff' stroke-width='0.8'/%3E%3C/svg%3E")`,
        backgroundSize: "60px 104px",
      }} />

      {/* ── Ambient glow orbs ── */}
      <div className="fixed z-0 pointer-events-none" style={{
        top: "-15%", left: "-10%", width: "55%", height: "60%",
        background: "radial-gradient(ellipse at center, rgba(59,130,246,0.055) 0%, transparent 65%)",
        filter: "blur(2px)",
        animation: "orb-breathe 8s ease-in-out infinite",
      }} />
      <div className="fixed z-0 pointer-events-none" style={{
        bottom: "-20%", right: "-10%", width: "50%", height: "55%",
        background: "radial-gradient(ellipse at center, rgba(6,182,212,0.04) 0%, transparent 65%)",
        filter: "blur(2px)",
        animation: "orb-breathe 10s ease-in-out infinite reverse",
      }} />
      <div className="fixed z-0 pointer-events-none" style={{
        top: "30%", left: "40%", width: "30%", height: "40%",
        background: "radial-gradient(ellipse at center, rgba(99,102,241,0.03) 0%, transparent 70%)",
        animation: "orb-breathe 12s ease-in-out infinite",
        animationDelay: "4s",
      }} />

      {/* ── Scan line ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <ScanLine />
      </div>

      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.05] backdrop-blur-xl" style={{ background: "rgba(3,6,15,0.75)" }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
              <Shield className="w-[18px] h-[18px] text-white" />
              <div className="absolute inset-0 rounded-lg animate-pulse" style={{ background: "rgba(59,130,246,0.15)" }} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white leading-none" data-testid="text-brand-name">Cyber Command Center</span>
              <span className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: "rgba(96,165,250,0.7)" }}>MSSP Platform</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#capabilities" className="text-[11px] text-white/40 hover:text-white/80 transition-colors tracking-widest uppercase">Capabilities</a>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] text-emerald-400/80 font-medium tracking-wide">All Systems Operational</span>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-20 min-h-screen flex items-center overflow-hidden">

        {/* CyberOrb centrepiece — large, centered behind content */}
        <div
          className="absolute z-0 pointer-events-none"
          style={{
            right: "-5%", top: "50%",
            transform: "translateY(-50%)",
            width: "560px", height: "560px",
            opacity: 0.55,
          }}
        >
          <CyberOrb />
        </div>

        {/* Inner glow behind orb */}
        <div className="absolute z-0 pointer-events-none" style={{
          right: "5%", top: "50%", transform: "translateY(-50%)",
          width: "480px", height: "480px",
          background: "radial-gradient(ellipse at center, rgba(59,130,246,0.08) 0%, transparent 65%)",
        }} />

        <div className="max-w-7xl mx-auto w-full px-6">
          <div className="grid lg:grid-cols-2 gap-14 items-center py-16">

            {/* ── Left panel ── */}
            <div className="space-y-7 relative z-10 order-2 lg:order-1">

              {/* Badge */}
              <div className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 backdrop-blur-sm" style={{
                border: "1px solid rgba(59,130,246,0.2)",
                background: "rgba(59,130,246,0.06)",
              }}>
                <div className="relative w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  <div className="relative w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs text-blue-300/90 font-medium tracking-wide">Autonomous AI-Powered SOC Platform</span>
              </div>

              {/* Headline */}
              <div className="space-y-2">
                <h1 className="font-black tracking-tight leading-[1.04]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)" }}>
                  <span className="block">
                    <span
                      className="text-white"
                      style={{ textShadow: "0 0 40px rgba(255,255,255,0.12)" }}
                    >
                      Cyber{" "}
                    </span>
                    <span
                      className="bg-clip-text text-transparent"
                      style={{
                        backgroundImage: "linear-gradient(135deg, #60a5fa 0%, #06b6d4 50%, #3b82f6 100%)",
                        filter: "drop-shadow(0 0 28px rgba(59,130,246,0.55))",
                      }}
                    >
                      Command
                    </span>
                  </span>
                  <span
                    className="block text-white font-black"
                    style={{ textShadow: "0 0 30px rgba(255,255,255,0.10)" }}
                  >
                    Center
                  </span>
                </h1>
                <p className="text-sm text-white/55 leading-relaxed max-w-md pt-1">
                  The enterprise platform for Managed Security Service Providers.
                  Orchestrate operations, detect threats with AI, and protect your
                  clients across multi-cloud and on-premise environments.
                </p>
              </div>

              {/* Capability pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { icon: Server, label: "Multi-Tenant", color: "rgba(6,182,212," },
                  { icon: Brain, label: "AI-Powered", color: "rgba(59,130,246," },
                  { icon: Globe, label: "Cloud-Agnostic", color: "rgba(34,197,94," },
                  { icon: Shield, label: "Zero Trust", color: "rgba(139,92,246," },
                ].map(({ icon: Icon, label, color }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    style={{
                      background: `${color}0.07)`,
                      border: `1px solid ${color}0.2)`,
                    }}
                  >
                    <Icon className="w-3 h-3" style={{ color: `${color}0.9)` }} />
                    <span className="text-[11px] font-medium" style={{ color: `${color}0.8)` }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Live threat feed */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(6,10,22,0.7)",
                  border: "1px solid rgba(59,130,246,0.12)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <LiveThreatFeed />
              </div>

              {/* Stats */}
              <div
                ref={statsRef}
                className="grid grid-cols-4 gap-1 rounded-xl p-4"
                style={{
                  background: "rgba(6,10,22,0.6)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {platformStats.map((stat, i) => (
                  <div key={stat.label} className="relative">
                    {i < platformStats.length - 1 && (
                      <div className="absolute right-0 top-1/4 h-1/2 w-px bg-white/[0.07]" />
                    )}
                    <StatItem stat={stat} started={statsStarted} />
                  </div>
                ))}
              </div>

              {/* ARIA branding */}
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400/50" />
                <span className="text-[11px] text-white/25 tracking-wider">Powered by</span>
                <span
                  className="text-[11px] font-black tracking-widest"
                  style={{ color: "rgba(6,182,212,0.7)", textShadow: "0 0 10px rgba(6,182,212,0.3)" }}
                >
                  ARIA AI
                </span>
                <span className="text-white/18 text-[11px]">— Autonomous Response Intelligence Agent</span>
              </div>
            </div>

            {/* ── Right panel: Login card ── */}
            <div className="relative flex justify-center lg:justify-end z-10 order-1 lg:order-2">
              <div
                className="relative w-full max-w-[420px]"
                style={{
                  opacity: cardVisible ? 1 : 0,
                  transform: cardVisible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
                  transition: "all 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Multi-layer glow behind card */}
                <div className="absolute -inset-8 pointer-events-none" style={{
                  background: "radial-gradient(ellipse at center, rgba(59,130,246,0.12) 0%, transparent 65%)",
                  filter: "blur(8px)",
                  animation: "orb-breathe 6s ease-in-out infinite",
                }} />
                <div className="absolute -inset-4 pointer-events-none" style={{
                  background: "radial-gradient(ellipse at center, rgba(6,182,212,0.06) 0%, transparent 70%)",
                }} />

                {/* Gradient border */}
                <div className="absolute -inset-px rounded-2xl pointer-events-none" style={{
                  background: "linear-gradient(135deg, rgba(59,130,246,0.35) 0%, rgba(6,182,212,0.15) 50%, rgba(99,102,241,0.1) 100%)",
                  borderRadius: "16px",
                }} />

                {/* Card */}
                <div
                  className="relative rounded-2xl p-8 animate-cyber-border-glow"
                  style={{
                    background: "linear-gradient(160deg, rgba(8,14,32,0.95) 0%, rgba(4,8,20,0.98) 100%)",
                    backdropFilter: "blur(32px)",
                    WebkitBackdropFilter: "blur(32px)",
                    border: "1px solid rgba(59,130,246,0.15)",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.05), 0 0 80px rgba(59,130,246,0.06)",
                  }}
                >
                  {/* Sweep shimmer */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div
                      className="absolute inset-y-0 w-[120px] animate-sweep-gradient-loop"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.035) 50%, transparent)" }}
                    />
                  </div>

                  {/* Top accent bar */}
                  <div className="absolute top-0 left-8 right-8 h-px" style={{
                    background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.5) 30%, rgba(6,182,212,0.6) 50%, rgba(59,130,246,0.5) 70%, transparent)",
                    boxShadow: "0 0 12px rgba(59,130,246,0.3)",
                  }} />

                  {/* Header */}
                  <div className="flex items-center gap-3 mb-8">
                    <div
                      className="flex items-center justify-center w-12 h-12 rounded-xl shadow-lg"
                      style={{
                        background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
                        boxShadow: "0 8px 24px rgba(59,130,246,0.35), 0 0 0 1px rgba(59,130,246,0.2)",
                      }}
                    >
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white leading-none" data-testid="text-sign-in-title">Sign In</h2>
                      <p className="text-xs text-white/35 mt-1">Access your command center</p>
                    </div>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="login-username" className="text-[11px] text-white/45 font-semibold tracking-widest uppercase">
                        Username or Email
                      </Label>
                      <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400/60 transition-colors" />
                        <Input
                          id="login-username"
                          value={username}
                          onChange={e => handleUsernameChange(e.target.value)}
                          placeholder="Enter username or email"
                          className="pl-11 h-12 rounded-xl text-white placeholder:text-white/18 transition-all"
                          style={{
                            background: "rgba(255,255,255,0.035)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                          required
                          disabled={mfaRequired}
                          data-testid="input-username"
                        />
                      </div>
                      {ssoInfo?.hasSSO && !mfaRequired && (
                        <div className="pt-1">
                          <Button
                            type="button"
                            className="w-full h-10 text-white font-medium rounded-xl flex items-center gap-2 justify-center transition-all"
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                            }}
                            onClick={() => { window.location.href = ssoInfo.loginUrl!; }}
                            data-testid="button-sso-login"
                          >
                            <LogIn className="w-4 h-4 text-cyan-400" />
                            Sign in with {ssoInfo.displayName}
                          </Button>
                          <p className="text-[11px] text-white/25 text-center mt-1.5">Or sign in below with local credentials</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-[11px] text-white/45 font-semibold tracking-widest uppercase">
                        Password
                      </Label>
                      <div className="relative group">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400/60 transition-colors" />
                        <Input
                          id="login-password"
                          type="password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="pl-11 h-12 rounded-xl text-white placeholder:text-white/18 transition-all"
                          style={{
                            background: "rgba(255,255,255,0.035)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                          required
                          disabled={mfaRequired}
                          data-testid="input-password"
                        />
                      </div>
                    </div>

                    {mfaRequired && (
                      <div className="space-y-2">
                        <Label htmlFor="login-mfa" className="text-[11px] text-white/45 font-semibold tracking-widest uppercase flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                          Authenticator Code
                        </Label>
                        <Input
                          id="login-mfa"
                          value={mfaToken}
                          onChange={e => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="000000"
                          maxLength={6}
                          className="text-center tracking-[0.5em] text-lg font-mono h-12 rounded-xl text-white placeholder:text-white/15"
                          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
                          autoFocus
                          required
                          data-testid="input-mfa-token"
                        />
                        <p className="text-[11px] text-white/30 text-center">Enter the 6-digit code from your authenticator app</p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-12 text-white font-bold rounded-xl border-0 relative overflow-hidden transition-all duration-200 group"
                      style={{
                        background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #06b6d4 100%)",
                        boxShadow: "0 4px 24px rgba(59,130,246,0.35), 0 0 0 1px rgba(59,130,246,0.2)",
                      }}
                      disabled={loginLoading}
                      data-testid="button-login-submit"
                    >
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0891b2 100%)" }}
                      />
                      <span className="relative flex items-center justify-center gap-2">
                        {loginLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Authenticating...
                          </>
                        ) : mfaRequired ? (
                          <>Verify & Sign In</>
                        ) : (
                          <>
                            Sign In
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </span>
                    </Button>

                    {mfaRequired && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-sm text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                        onClick={() => { setMfaRequired(false); setMfaToken(""); }}
                        data-testid="button-back-to-login"
                      >
                        Back to login
                      </Button>
                    )}
                  </form>

                  <div className="mt-6 pt-5 border-t border-white/[0.05] flex items-center justify-center gap-3">
                    {[
                      { icon: Lock, label: "TLS Encrypted", color: "text-emerald-400/50" },
                      { icon: ShieldCheck, label: "MFA Protected", color: "text-blue-400/50" },
                      { icon: Wifi, label: "E2E Secure", color: "text-cyan-400/50" },
                    ].flatMap(({ icon: Icon, label, color }, i) => [
                      ...(i > 0 ? [<div key={`sep-${label}`} className="w-px h-3 bg-white/[0.07]" />] : []),
                      <div key={label} className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${color}`} />
                        <span className="text-[10px] text-white/25 tracking-wide">{label}</span>
                      </div>,
                    ])}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section id="capabilities" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-14 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span className="text-[11px] text-white/50 font-semibold tracking-widest uppercase">Platform Capabilities</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight" data-testid="text-capabilities-heading">
              Enterprise-Grade Security Operations
            </h2>
            <p className="text-sm text-white/45 max-w-2xl mx-auto leading-relaxed">
              A unified command center built for MSSPs to detect, investigate, and respond to threats
              across your entire client base with AI-powered automation.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Radar, title: "Threat Detection & Response", description: "Real-time monitoring with AI-powered correlation across endpoints, networks, and cloud." },
              { icon: Brain, title: "AI SOC Analyst", description: "Seven specialized AI agents providing autonomous investigation and response recommendations." },
              { icon: Network, title: "Multi-Plane Architecture", description: "Distributed data planes across 5 global regions with management plane orchestration." },
              { icon: Eye, title: "CAASM & Attack Surface", description: "Complete asset inventory with risk scoring and continuous attack surface monitoring." },
              { icon: Globe, title: "Cloud-Agnostic Deployment", description: "Deploy on AWS, Azure, GCP, or on-premises with Kubernetes and Docker Compose." },
              { icon: Activity, title: "SOAR Playbooks", description: "Automated response workflows with pre-built playbook templates for rapid containment." },
              { icon: BarChart3, title: "Executive Reporting", description: "44 AI-generated report templates across 9 groups with professional PDF output." },
              { icon: Layers, title: "Federated Threat Intel", description: "Cross-tenant IOC propagation with contribution scoring and auto-nomination engine." },
              { icon: GitBranch, title: "Detection Engineering", description: "3,120 Sigma rules with source-aware normalization and AI-assisted rule generation." },
            ].map((cap, i) => (
              <div
                key={i}
                className="group relative rounded-xl p-5 transition-all duration-300 cursor-default"
                style={{
                  background: "rgba(8,12,26,0.6)",
                  border: "1px solid rgba(255,255,255,0.055)",
                  backdropFilter: "blur(10px)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.22)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.05)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(59,130,246,0.08)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.055)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(8,12,26,0.6)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "";
                }}
                data-testid={`card-capability-${i}`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-all duration-300"
                    style={{
                      background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(6,182,212,0.08))",
                      border: "1px solid rgba(59,130,246,0.12)",
                    }}
                  >
                    <cap.icon className="w-4.5 h-4.5 text-blue-400" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-sm font-semibold text-white/90">{cap.title}</h3>
                    <p className="text-xs text-white/45 leading-relaxed">{cap.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative border-t border-white/[0.04] py-8 px-6 pb-16">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.7), rgba(6,182,212,0.7))" }}>
              <Shield className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs text-white/35 font-medium" data-testid="text-footer-brand">Cyber Command Center</span>
          </div>
          <p className="text-[11px] text-white/25">&copy; 2026 Cyber Command Center. All rights reserved.</p>
        </div>
      </footer>

      <ThreatTicker />

      <style>{`
        @keyframes threat-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes orb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orb-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orb-pulse {
          0% { opacity: 0.3; r: 3; }
          100% { opacity: 0.9; r: 6; }
        }
        @keyframes orb-breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
        @keyframes scan-sweep {
          0% { top: 10%; opacity: 0; }
          5% { opacity: 1; }
          85% { opacity: 0.6; }
          95% { top: 90%; opacity: 0; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes mesh-drift {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-18px, 10px) scale(1.015); }
          66% { transform: translate(12px, -8px) scale(0.99); }
          100% { transform: translate(-6px, 14px) scale(1.01); }
        }
        @keyframes mesh-pulse {
          0% { opacity: 0.25; }
          100% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
