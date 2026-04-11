import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Shield, AlertTriangle, Network, Target, Server, User, Globe,
  Clock, Layers, ChevronRight, ZoomIn, ZoomOut, FileText, Loader2,
  Filter, ChevronLeft, Brain, Activity, TrendingUp, Copy, Check,
  BarChart2, Eye, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", info: "#3b82f6"
};

const KILL_CHAIN: Array<{ key: string; label: string; color: string }> = [
  { key: "reconnaissance", label: "Recon", color: "#6366f1" },
  { key: "weaponization", label: "Weaponize", color: "#8b5cf6" },
  { key: "delivery", label: "Delivery", color: "#ec4899" },
  { key: "exploitation", label: "Exploit", color: "#f97316" },
  { key: "installation", label: "Install", color: "#eab308" },
  { key: "command_and_control", label: "C2", color: "#06b6d4" },
  { key: "actions_on_objectives", label: "Actions", color: "#ef4444" },
];

const KC_COLOR: Record<string, string> = Object.fromEntries(KILL_CHAIN.map(k => [k.key, k.color]));

interface GraphNode {
  id: string;
  label: string;
  type: "attacker" | "asset" | "user" | "ioc";
  severity?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  eventId?: number;
}

function nodeColor(node: Pick<GraphNode, "type">) {
  switch (node.type) {
    case "attacker": return "#ef4444";
    case "asset": return "#3b82f6";
    case "user": return "#10b981";
    case "ioc": return "#f59e0b";
    default: return "#64748b";
  }
}

function nodeIcon(type: GraphNode["type"]) {
  switch (type) {
    case "attacker": return "⚡";
    case "asset": return "🖥";
    case "user": return "👤";
    case "ioc": return "🔴";
  }
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const color = value >= 75 ? "#22c55e" : value >= 50 ? "#eab308" : "#f97316";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={40} cy={40} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={7} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round" strokeDashoffset={circ / 4}
          style={{ transition: "stroke-dasharray 0.8s ease" }} transform="rotate(-90 40 40)" />
        <text x={40} y={40} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={16} fontWeight="700">
          {value}
        </text>
        <text x={40} y={55} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>
          / 100
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground">AI Confidence</span>
    </div>
  );
}

function KillChainProgress({ phase }: { phase: string }) {
  const norm = (phase || "").toLowerCase().replace(/ /g, "_");
  const idx = KILL_CHAIN.findIndex(k => k.key === norm || k.label.toLowerCase() === phase?.toLowerCase());
  const activeIdx = idx >= 0 ? idx : 0;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium">Kill Chain Phase</div>
      <div className="flex items-center gap-0.5">
        {KILL_CHAIN.map((k, i) => (
          <div key={k.key} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={cn("h-1.5 w-full rounded-full transition-all duration-500", i <= activeIdx ? "opacity-100" : "opacity-20")}
              style={{ background: i <= activeIdx ? k.color : "#334155" }}
            />
            {i === activeIdx && (
              <div className="text-[8px] whitespace-nowrap font-semibold" style={{ color: k.color }}>
                {k.label}
              </div>
            )}
          </div>
        ))}
      </div>
      {activeIdx >= 0 && (
        <div className="text-xs font-semibold capitalize" style={{ color: KILL_CHAIN[activeIdx]?.color }}>
          {KILL_CHAIN[activeIdx]?.label} — Phase {activeIdx + 1}/{KILL_CHAIN.length}
        </div>
      )}
    </div>
  );
}

function AttackTimeline({ events, onSelectPhase, selectedPhase }: {
  events: any[];
  onSelectPhase: (phase: string | null) => void;
  selectedPhase: string | null;
}) {
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = [...events].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const phaseGroups = KILL_CHAIN.map(kc => ({
    ...kc,
    events: sorted.filter(e => {
      const et = (e.mitre_tactic || e.threat_vector || "").toLowerCase().replace(/ /g, "_");
      return et.includes(kc.key.split("_")[0]) || et === kc.key;
    })
  })).filter(g => g.events.length > 0);

  if (!sorted.length) return (
    <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
      No timeline events for this incident.
    </div>
  );

  const minT = new Date(sorted[0].occurred_at).getTime();
  const maxT = new Date(sorted[sorted.length - 1].occurred_at).getTime();
  const range = maxT - minT || 1;
  const W = Math.max(800, sorted.length * 60);
  const ROW_H = 44;
  const LABEL_W = 90;

  const pct = (t: number) => ((t - minT) / range) * (W - LABEL_W - 40) + LABEL_W + 20;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Button variant={selectedPhase === null ? "default" : "outline"} size="sm" className="h-5 text-[10px] px-2"
          onClick={() => onSelectPhase(null)}>All</Button>
        {phaseGroups.map(g => (
          <Button key={g.key} variant={selectedPhase === g.key ? "default" : "outline"} size="sm"
            className="h-5 text-[10px] px-2" style={selectedPhase === g.key ? { background: g.color, borderColor: g.color } : { borderColor: `${g.color}50`, color: g.color }}
            onClick={() => onSelectPhase(selectedPhase === g.key ? null : g.key)}>
            {g.label} ({g.events.length})
          </Button>
        ))}
      </div>
      <div ref={containerRef} className="overflow-x-auto rounded-xl border border-border dark:border-white/10 bg-slate-50 dark:bg-[hsl(222,14%,5%)]">
        <svg width={W} height={phaseGroups.length * ROW_H + 28} style={{ display: "block" }}>
          <line x1={LABEL_W} y1={phaseGroups.length * ROW_H} x2={W - 10} y2={phaseGroups.length * ROW_H}
            stroke="#334155" strokeWidth={1} />
          {[0, 0.25, 0.5, 0.75, 1].map(p => {
            const t = minT + p * range;
            const x = pct(t);
            return (
              <g key={p}>
                <line x1={x} y1={0} x2={x} y2={phaseGroups.length * ROW_H + 5} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="3 3" />
                <text x={x} y={phaseGroups.length * ROW_H + 20} textAnchor="middle" fill="#64748b" fontSize={8}>
                  {new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </text>
              </g>
            );
          })}
          {phaseGroups.map((g, ri) => {
            const y = ri * ROW_H + ROW_H / 2;
            return (
              <g key={g.key}>
                <rect x={0} y={ri * ROW_H} width={LABEL_W - 4} height={ROW_H - 1} fill={`${g.color}10`} />
                <text x={6} y={y + 1} dominantBaseline="middle" fill={g.color} fontSize={9} fontWeight="600">
                  {g.label}
                </text>
                <line x1={LABEL_W} y1={y} x2={W - 10} y2={y} stroke={`${g.color}15`} strokeWidth={ROW_H - 6} />
                {g.events.map((ev, ei) => {
                  const x = pct(new Date(ev.occurred_at).getTime());
                  const isExp = expandedEvent === ev.id;
                  return (
                    <g key={`${g.key}-${ei}`} style={{ cursor: "pointer" }} onClick={() => setExpandedEvent(isExp ? null : ev.id)}>
                      <circle cx={x} cy={y} r={isExp ? 10 : 7}
                        fill={SEV_COLORS[ev.severity] || "#64748b"}
                        stroke={isExp ? "white" : "transparent"} strokeWidth={1.5}
                        opacity={0.9} />
                      <title>{ev.event_type} — {new Date(ev.occurred_at).toLocaleTimeString()}</title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {expandedEvent !== null && (() => {
        const ev = sorted.find(e => e.id === expandedEvent);
        if (!ev) return null;
        return (
          <div className="rounded-xl border border-border dark:border-white/10 bg-card p-3 text-xs space-y-1.5 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{ev.event_type}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExpandedEvent(null)}><X className="w-3 h-3" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
              {ev.attacker && <div><span className="text-foreground font-medium">Attacker: </span>{ev.attacker}</div>}
              {ev.target && <div><span className="text-foreground font-medium">Target: </span>{ev.target}</div>}
              {ev.asset && <div><span className="text-foreground font-medium">Asset: </span>{ev.asset}</div>}
              {ev.source_type && <div><span className="text-foreground font-medium">Source: </span>{ev.source_type}</div>}
              {ev.country && <div><span className="text-foreground font-medium">Country: </span>{ev.country}</div>}
              {ev.mitre_tactic && <div><span className="text-foreground font-medium">Tactic: </span>{ev.mitre_tactic}</div>}
            </div>
            {ev.description && <div className="text-muted-foreground border-t border-border pt-1.5 leading-relaxed">{ev.description.slice(0, 200)}</div>}
          </div>
        );
      })()}
    </div>
  );
}

function EntityGraph({ nodes, edges, onNodeClick, activeNodeId }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (nodeId: string | null) => void;
  activeNodeId: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const W = 700, H = 400;

  useEffect(() => {
    if (!nodes.length) return;
    const posMap = new Map<string, { x: number; y: number }>();
    const attackers = nodes.filter(n => n.type === "attacker");
    const assets = nodes.filter(n => n.type === "asset");
    const iocs = nodes.filter(n => n.type === "ioc");
    const users = nodes.filter(n => n.type === "user");

    const spacing = (arr: GraphNode[]) => Math.max(90, Math.min(200, (W - 120) / Math.max(arr.length, 1)));
    const placeRow = (arr: GraphNode[], y: number, xStart: number, gap: number) => {
      arr.forEach((n, i) => posMap.set(n.id, { x: xStart + i * gap, y }));
    };

    placeRow(attackers, 70, 80, spacing(attackers));
    placeRow(assets, 210, 70, spacing(assets));
    placeRow(iocs, 330, 110, spacing(iocs));
    placeRow(users, 210, W - 90 - users.length * 100, 100);
    nodes.forEach(n => { if (!posMap.has(n.id)) posMap.set(n.id, { x: W / 2, y: H / 2 }); });
    setPositions(posMap);
  }, [nodes]);

  const visibleEdges = edges.slice(0, 60);

  return (
    <div className="relative rounded-xl border border-border dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-[hsl(222,14%,5%)]">
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} data-testid="button-zoom-in"><ZoomIn className="w-3.5 h-3.5" /></Button>
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} data-testid="button-zoom-out"><ZoomOut className="w-3.5 h-3.5" /></Button>
        {activeNodeId && (
          <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={() => onNodeClick(null)}>
            <X className="w-3 h-3" />Clear
          </Button>
        )}
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={440}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onMouseDown={e => { setIsDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }}
        onMouseMove={e => { if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        data-testid="entity-graph-svg"
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#475569" />
          </marker>
          {["attacker", "asset", "user", "ioc"].map(type => (
            <filter key={type} id={`glow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {visibleEdges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2 - 35;
            const isActive = activeNodeId === edge.from || activeNodeId === edge.to;
            return (
              <g key={i}>
                <path
                  d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={isActive ? "#94a3b8" : "#334155"}
                  strokeWidth={isActive ? 2 : 1.2}
                  strokeDasharray={isActive ? "none" : "5 3"}
                  markerEnd="url(#arrow)"
                  opacity={isActive ? 0.9 : 0.4}
                />
                {edge.label && (
                  <text x={mx} y={my - 4} fill="#64748b" fontSize={8} textAnchor="middle">{edge.label.slice(0, 14)}</text>
                )}
              </g>
            );
          })}

          {nodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const color = nodeColor(node);
            const isHovered = hoveredNode === node.id;
            const isActive = activeNodeId === node.id;
            const r = isActive ? 24 : isHovered ? 21 : 17;
            return (
              <g key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onNodeClick(activeNodeId === node.id ? null : node.id)}
                style={{ cursor: "pointer" }}
                data-testid={`graph-node-${node.id.replace(/[^a-z0-9]/gi, "-")}`}
              >
                <circle cx={pos.x} cy={pos.y} r={r + 8} fill={`${color}${isActive ? "25" : "10"}`} />
                {isActive && <circle cx={pos.x} cy={pos.y} r={r + 14} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />}
                <circle cx={pos.x} cy={pos.y} r={r} fill={`${color}35`} stroke={color} strokeWidth={isActive ? 2 : 1.5}
                  filter={(isHovered || isActive) ? `url(#glow-${node.type})` : undefined}
                  style={{ transition: "r 0.15s ease, stroke-width 0.15s ease" }} />
                <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13}>
                  {nodeIcon(node.type)}
                </text>
                <text x={pos.x} y={pos.y + r + 14} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={9} fontWeight="500">
                  {node.label.slice(0, 18)}
                </text>
                {(isHovered || isActive) && (
                  <>
                    <rect x={pos.x - 60} y={pos.y - 46} width={120} height={24} rx={5}
                      fill="hsl(var(--card))" stroke={color} strokeWidth={1} opacity={0.95} />
                    <text x={pos.x} y={pos.y - 32} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight="600">
                      {node.label.slice(0, 18)}
                    </text>
                    <text x={pos.x} y={pos.y - 20} textAnchor="middle" fill={color} fontSize={8} fontWeight="500">
                      {node.type.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>

        {nodes.length === 0 && (
          <text x="50%" y="50%" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={13}>
            No entity graph data available
          </text>
        )}
      </svg>

      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 bg-background/80 dark:bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5">
        {[
          { type: "attacker", label: "Threat Actor" },
          { type: "asset", label: "Asset" },
          { type: "user", label: "User" },
          { type: "ioc", label: "IOC" },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: nodeColor({ type } as GraphNode) }} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <span className="text-[10px] text-muted-foreground border-l border-border pl-2">Click node to filter evidence</span>
      </div>
    </div>
  );
}

function EvidenceLocker({ events, activePhase, activeNodeId, nodes }: {
  events: any[];
  activePhase: string | null;
  activeNodeId: string | null;
  nodes: GraphNode[];
}) {
  const [page, setPage] = useState(0);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const PAGE_SIZE = 25;

  const activeNode = activeNodeId ? nodes.find(n => n.id === activeNodeId) : null;

  const filtered = events.filter(ev => {
    if (activePhase) {
      const et = (ev.mitre_tactic || ev.threat_vector || "").toLowerCase().replace(/ /g, "_");
      if (!et.includes(activePhase.split("_")[0]) && et !== activePhase) return false;
    }
    if (activeNode) {
      const label = activeNode.label;
      return ev.attacker === label || ev.target === label || ev.asset === label;
    }
    return true;
  });

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const copyRow = (ev: any) => {
    navigator.clipboard.writeText(JSON.stringify(ev, null, 2)).catch(() => {});
    setCopiedId(ev.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {filtered.length} events
            {activeNode && <span className="ml-1 text-primary">· filtered by <span className="font-semibold">{activeNode.label}</span></span>}
            {activePhase && !activeNode && <span className="ml-1 text-primary">· filtered by <span className="font-semibold capitalize">{activePhase.replace(/_/g, " ")}</span></span>}
          </div>
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground">{page + 1}/{pages}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border dark:border-white/10 overflow-hidden">
        <table className="w-full text-xs" data-testid="evidence-locker-table">
          <thead>
            <tr className="border-b border-border dark:border-white/10 bg-muted/50 dark:bg-white/5">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phase</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Destination</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sev</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {paged.map((ev, i) => {
              const kcKey = (ev.mitre_tactic || "").toLowerCase().replace(/ /g, "_");
              const kc = KILL_CHAIN.find(k => k.key === kcKey || k.key.includes(kcKey.split("_")[0]));
              const isExp = expanded === ev.id;
              return (
                <>
                  <tr
                    key={ev.id}
                    className={cn("border-b border-border/40 dark:border-white/5 hover:bg-muted/30 dark:hover:bg-white/5 transition-colors cursor-pointer", isExp && "bg-muted/50 dark:bg-white/5")}
                    onClick={() => setExpanded(isExp ? null : ev.id)}
                    data-testid={`evidence-row-${ev.id}`}
                  >
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">
                      {new Date(ev.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="px-3 py-1.5">
                      {kc ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: `${kc.color}20`, color: kc.color, border: `1px solid ${kc.color}30` }}>
                          {kc.label}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[100px] truncate">{ev.attacker || "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[100px] truncate">{ev.target || ev.asset || "—"}</td>
                    <td className="px-3 py-1.5 font-medium truncate max-w-[160px]">{ev.event_type}</td>
                    <td className="px-3 py-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLORS[ev.severity] || "#64748b" }} />
                    </td>
                    <td className="px-3 py-1.5 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground" onClick={() => copyRow(ev)} data-testid={`btn-copy-event-${ev.id}`}>
                        {copiedId === ev.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </td>
                  </tr>
                  {isExp && (
                    <tr key={`${ev.id}-detail`} className="bg-muted/30 dark:bg-white/3">
                      <td colSpan={7} className="px-4 py-2">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {ev.description && <div className="col-span-3 text-muted-foreground leading-relaxed">{ev.description.slice(0, 300)}</div>}
                          {ev.mitre_tactic && <div><span className="text-muted-foreground">MITRE Tactic: </span><span className="font-medium">{ev.mitre_tactic}</span></div>}
                          {ev.mitre_technique && <div><span className="text-muted-foreground">Technique: </span><span className="font-medium">{ev.mitre_technique}</span></div>}
                          {ev.source_type && <div><span className="text-muted-foreground">Source Type: </span><span className="font-medium">{ev.source_type}</span></div>}
                          {ev.country && <div><span className="text-muted-foreground">Country: </span><span className="font-medium">{ev.country}</span></div>}
                          {ev.action && <div><span className="text-muted-foreground">Action: </span><span className="font-medium">{ev.action}</span></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No events match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportModal({ open, onClose, incident, events }: {
  open: boolean;
  onClose: () => void;
  incident: any;
  events: any[];
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/copilot/query", {
        question: `Generate a detailed incident investigation report for incident "${incident?.title}" (ID: ${incident?.id}). 
Severity: ${incident?.severity}. Status: ${incident?.status}.
MITRE Tactic: ${incident?.mitre_tactic || "Unknown"}. Technique: ${incident?.mitre_technique_id} ${incident?.mitre_technique || ""}.
Kill Chain Phase: ${incident?.kill_chain_phase || "Unknown"}.
Confidence Score: ${incident?.confidence_score || "N/A"}%.
Classification: ${incident?.classification || "Unclassified"}.
Source IP: ${incident?.source_ip || "Unknown"}. Destination IP: ${incident?.destination_ip || "Unknown"}.
Related Events: ${events.length} events captured.
AI Narrative: ${incident?.threat_narrative || "Not available"}.

Write a professional incident investigation report with:
1. Executive Summary (2-3 sentences)
2. Attack Timeline & Progression  
3. MITRE ATT&CK Mapping
4. Affected Assets & Impact
5. Indicators of Compromise
6. Root Cause Analysis
7. Recommended Response Actions (5-7 specific steps)
8. Lessons Learned

Format with clear section headers. Be concise and actionable.`,
        tenantId: incident?.tenant_id,
      });
      return res.json();
    },
  });

  const report = (generateMutation.data as any)?.answer || "";

  const copyReport = () => {
    navigator.clipboard.writeText(report).catch(() => {});
    setCopied(true);
    toast({ title: "Report copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Investigation Report — {incident?.title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {!generateMutation.data && !generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <Brain className="w-10 h-10 text-primary/40" />
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                ARIA will analyze this incident and generate a professional investigation report using live incident data.
              </p>
              <Button onClick={() => generateMutation.mutate()} className="gap-2">
                <Brain className="w-4 h-4" />
                Generate with ARIA
              </Button>
            </div>
          )}
          {generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">ARIA is analyzing incident data…</p>
            </div>
          )}
          {report && (
            <div className="flex flex-col gap-3 h-full">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={copyReport}>
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy Report"}
                </Button>
              </div>
              <ScrollArea className="flex-1 rounded-xl border border-border dark:border-white/10 bg-muted/30 p-4">
                <div className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground/90">{report}</div>
              </ScrollArea>
            </div>
          )}
          {generateMutation.error && (
            <div className="flex items-center gap-2 text-sm text-red-400 py-4">
              <AlertTriangle className="w-4 h-4" />
              Failed to generate report. Please try again.
              <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()}>Retry</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function IncidentCanvasPage() {
  const [, params] = useRoute("/incidents/:id/canvas");
  const incidentId = params?.id;

  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/incidents", incidentId, "graph"],
    queryFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/graph`);
      if (!res.ok) throw new Error("Failed to load incident graph");
      return res.json();
    },
    enabled: !!incidentId,
  });

  const incident = data?.incident;
  const nodes: GraphNode[] = data?.nodes || [];
  const edges: GraphEdge[] = data?.edges || [];
  const timeline: any[] = data?.timeline || [];
  const iocs: any[] = (incident?.ioc_data as any[]) || [];

  const recommendations: string[] = (() => {
    try {
      const rd = incident?.response_actions || incident?.enrichment_data;
      if (typeof rd === "object" && rd?.recommendations) return rd.recommendations.slice(0, 5);
      if (typeof rd === "string") {
        const parsed = JSON.parse(rd);
        if (parsed?.recommendations) return parsed.recommendations.slice(0, 5);
      }
    } catch { /* ignore */ }
    return [];
  })();

  if (!incidentId) return <div className="p-8 text-muted-foreground">No incident ID provided.</div>;

  const sevColor = SEV_COLORS[incident?.severity] || "#64748b";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background dark:bg-[hsl(222,14%,6%)]" data-testid="incident-canvas-page">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-border dark:border-white/10 shrink-0"
        style={{ background: "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 100%)" }}
      >
        <Link href="/events?domain=overview">
          <Button variant="ghost" size="sm" className="gap-1.5 h-8" data-testid="button-back-to-incidents">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Button>
        </Link>
        <div className="h-5 w-px bg-border dark:bg-white/15" />

        {isLoading ? (
          <Skeleton className="h-6 w-72" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">{incident?.title || `Incident #${incidentId}`}</span>
            {incident?.severity && (
              <Badge variant="outline" className="text-xs capitalize shrink-0" style={{ color: sevColor, borderColor: `${sevColor}40` }}>
                {incident.severity}
              </Badge>
            )}
            {incident?.status && (
              <Badge variant="outline" className="text-xs capitalize shrink-0">{incident.status}</Badge>
            )}
            {incident?.classification && (
              <Badge variant="outline" className={cn("text-xs capitalize shrink-0", {
                "border-green-500/30 text-green-400": incident.classification === "true_positive",
                "border-red-500/30 text-red-400": incident.classification === "false_positive",
              })}>
                {incident.classification.replace("_", " ")}
              </Badge>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">Investigation Canvas</span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setReportOpen(true)}
            disabled={isLoading || !incident}
            data-testid="button-generate-report"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-h-full p-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 space-y-4">
              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Attack Timeline
                    {timeline.length > 0 && <span className="text-xs text-muted-foreground font-normal">({timeline.length} events)</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <AttackTimeline events={timeline} onSelectPhase={setSelectedPhase} selectedPhase={selectedPhase} />
                  )}
                </CardContent>
              </Card>

              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Network className="w-4 h-4 text-primary" />
                    Entity Relationship Graph
                    {nodes.length > 0 && <span className="text-xs text-muted-foreground font-normal">({nodes.length} nodes, {edges.length} edges)</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <Skeleton className="h-[440px] w-full rounded-xl" />
                  ) : (
                    <EntityGraph nodes={nodes} edges={edges} onNodeClick={setActiveNodeId} activeNodeId={activeNodeId} />
                  )}
                </CardContent>
              </Card>

              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    Evidence Locker
                    {(selectedPhase || activeNodeId) && <Filter className="w-3 h-3 text-primary" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <EvidenceLocker events={timeline} activePhase={selectedPhase} activeNodeId={activeNodeId} nodes={nodes} />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    Incident Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : incident ? (
                    <>
                      {incident.confidence_score != null && (
                        <div className="flex justify-center">
                          <ConfidenceRing value={incident.confidence_score} />
                        </div>
                      )}

                      {incident.kill_chain_phase && (
                        <KillChainProgress phase={incident.kill_chain_phase} />
                      )}

                      {incident.mitre_tactic && (
                        <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                          <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-wide mb-0.5">MITRE Tactic</div>
                          <div className="text-sm font-semibold">{incident.mitre_tactic}</div>
                          {incident.mitre_technique_id && (
                            <div className="text-xs text-muted-foreground mt-0.5">{incident.mitre_technique_id} · {incident.mitre_technique}</div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {incident.classification && (
                          <div className={cn("flex-1 p-2 rounded-lg border text-center", {
                            "bg-green-500/10 border-green-500/20": incident.classification === "true_positive",
                            "bg-red-500/10 border-red-500/20": incident.classification === "false_positive",
                            "bg-muted/30 border-border": !incident.classification,
                          })}>
                            <div className="text-[10px] text-muted-foreground">Classification</div>
                            <div className={cn("text-xs font-semibold capitalize mt-0.5", {
                              "text-green-400": incident.classification === "true_positive",
                              "text-red-400": incident.classification === "false_positive",
                            })}>
                              {incident.classification.replace("_", " ")}
                            </div>
                          </div>
                        )}
                        {incident.source_ip && (
                          <div className="flex-1 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="text-[10px] text-red-400 font-semibold">Attacker IP</div>
                            <div className="text-xs font-mono mt-0.5 truncate">{incident.source_ip}</div>
                          </div>
                        )}
                      </div>

                      {incident.threat_narrative && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            <Activity className="w-3 h-3" />AI Attack Narrative
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/80 bg-muted/30 dark:bg-white/5 p-2.5 rounded-lg border border-border dark:border-white/10">
                            {incident.threat_narrative.slice(0, 350)}{incident.threat_narrative.length > 350 ? "…" : ""}
                          </p>
                        </div>
                      )}

                      {recommendations.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3" />Response Recommendations
                          </div>
                          <div className="space-y-1">
                            {recommendations.map((rec, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs bg-blue-500/5 border border-blue-500/15 rounded-lg px-2.5 py-1.5">
                                <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{i + 1}</div>
                                <span className="text-foreground/80 leading-relaxed">{rec}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">No intelligence data available</div>
                  )}
                </CardContent>
              </Card>

              {iocs.length > 0 && (
                <Card className="border-border dark:border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      IOC Reputation ({iocs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-56 overflow-y-auto">
                      {iocs.slice(0, 15).map((ioc, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 dark:border-white/5 last:border-0 text-xs">
                          <div className={cn("w-2 h-2 rounded-full shrink-0", {
                            "bg-red-500": ioc.reputation === "malicious",
                            "bg-amber-500": ioc.reputation === "suspicious",
                            "bg-green-500": ioc.reputation === "clean",
                          })} />
                          <span className="text-[10px] text-muted-foreground shrink-0 capitalize">{ioc.indicator_type || ioc.type || "ioc"}</span>
                          <span className="font-mono truncate flex-1">{ioc.value}</span>
                          <Badge variant="outline" className={cn("text-[9px] px-1 shrink-0", {
                            "border-red-500/30 text-red-400 bg-red-500/5": ioc.reputation === "malicious",
                            "border-amber-500/30 text-amber-400 bg-amber-500/5": ioc.reputation === "suspicious",
                            "border-green-500/30 text-green-400 bg-green-500/5": ioc.reputation === "clean",
                          })}>
                            {ioc.reputation || "unknown"}
                          </Badge>
                          {ioc.country && <span className="text-[9px] text-muted-foreground shrink-0">{ioc.country}</span>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-cyan-400" />
                    Incident Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Related Events", value: timeline.length, icon: Eye },
                    { label: "Entity Nodes", value: nodes.length },
                    { label: "Attack Paths", value: edges.length },
                    { label: "IOC Indicators", value: iocs.length },
                    { label: "Source IP", value: incident?.source_ip || "—", mono: true },
                    { label: "Destination", value: incident?.destination_ip || "—", mono: true },
                    { label: "Detected", value: incident?.created_at ? new Date(incident.created_at).toLocaleDateString() : "—" },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("font-semibold", mono && "font-mono text-[10px]")}>{String(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {incident && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          incident={incident}
          events={timeline}
        />
      )}
    </div>
  );
}
