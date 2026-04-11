import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Network, Star, AlertTriangle, Target, Zap, RefreshCw, Loader2,
  ChevronRight, ShieldAlert, Info, Brain, Crosshair, CheckCircle2, X, Crown
} from "lucide-react";

interface AttackNode {
  id: string;
  label: string;
  type: "device" | "user" | "service" | "network" | "crown_jewel";
  riskScore: number;
  ip?: string;
  os?: string;
  department?: string;
  isCrownJewel?: boolean;
  crownJewelLabel?: string;
}

interface AttackEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  technique?: string;
  mitreTechnique?: string;
}

interface AttackPath {
  nodes: string[];
  totalWeight: number;
  hops: number;
  techniques: string[];
}

const NODE_COLORS: Record<string, string> = {
  crown_jewel: "#f59e0b",
  device: "#3b82f6",
  user: "#8b5cf6",
  service: "#10b981",
  network: "#6b7280",
};

const NODE_RADIUS: Record<string, number> = {
  crown_jewel: 18,
  device: 12,
  user: 12,
  service: 14,
  network: 10,
};

const EDGE_COLORS: Record<string, string> = {
  lateral_movement: "#ef4444",
  credential_access: "#f97316",
  privilege_escalation: "#a855f7",
  shared_credentials: "#ec4899",
  network: "#475569",
};

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  lateral_movement: "Lateral Movement",
  credential_access: "Credential Access",
  privilege_escalation: "Privilege Escalation",
  shared_credentials: "Shared Credentials",
  network: "Network",
};

function useForceLayout(nodes: AttackNode[], edges: AttackEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!nodes.length) return;
    const pos = new Map<string, { x: number; y: number }>();

    // Initialize positions in a circle layout
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.38;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos.set(node.id, {
        x: cx + r * Math.cos(angle) * (node.isCrownJewel ? 0.6 : 1),
        y: cy + r * Math.sin(angle) * (node.isCrownJewel ? 0.6 : 1),
      });
    });

    // Simple force simulation - 60 iterations
    const nodeArr = nodes.map(n => ({ ...pos.get(n.id)!, id: n.id }));
    const adjWeight = new Map<string, Map<string, number>>();
    for (const n of nodes) adjWeight.set(n.id, new Map());
    for (const e of edges) {
      adjWeight.get(e.source)?.set(e.target, e.weight);
      adjWeight.get(e.target)?.set(e.source, e.weight);
    }

    for (let iter = 0; iter < 80; iter++) {
      const forces = new Map(nodeArr.map(n => [n.id, { x: 0, y: 0 }]));

      // Repulsion
      for (let i = 0; i < nodeArr.length; i++) {
        for (let j = i + 1; j < nodeArr.length; j++) {
          const dx = nodeArr[i].x - nodeArr[j].x;
          const dy = nodeArr[i].y - nodeArr[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const strength = 2500 / (dist * dist);
          const fx = (dx / dist) * strength;
          const fy = (dy / dist) * strength;
          forces.get(nodeArr[i].id)!.x += fx;
          forces.get(nodeArr[i].id)!.y += fy;
          forces.get(nodeArr[j].id)!.x -= fx;
          forces.get(nodeArr[j].id)!.y -= fy;
        }
      }

      // Attraction along edges
      for (const e of edges) {
        const a = nodeArr.find(n => n.id === e.source);
        const b = nodeArr.find(n => n.id === e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const targetDist = 120 + e.weight * 10;
        const strength = (dist - targetDist) * 0.03;
        const fx = (dx / dist) * strength;
        const fy = (dy / dist) * strength;
        forces.get(a.id)!.x += fx;
        forces.get(a.id)!.y += fy;
        forces.get(b.id)!.x -= fx;
        forces.get(b.id)!.y -= fy;
      }

      // Apply forces + boundary
      for (const n of nodeArr) {
        const f = forces.get(n.id)!;
        n.x = Math.max(30, Math.min(width - 30, n.x + f.x * 0.1));
        n.y = Math.max(30, Math.min(height - 30, n.y + f.y * 0.1));
      }
    }

    for (const n of nodeArr) pos.set(n.id, { x: n.x, y: n.y });
    setPositions(new Map(pos));
  }, [nodes.length, edges.length, width, height]);

  return positions;
}

export default function AttackPathsPage() {
  const { currentTenant, isMSS } = useTenant();
  const tenantId = currentTenant?.id;
  const { toast } = useToast();

  const [selectedNode, setSelectedNode] = useState<AttackNode | null>(null);
  const [highlightPath, setHighlightPath] = useState<Set<string>>(new Set());
  const [graphKey, setGraphKey] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 900, h: 500 });
  const [showQuickAddCJ, setShowQuickAddCJ] = useState(false);
  const [quickCJForm, setQuickCJForm] = useState({ name: "", ip: "", criticality: "high" });

  useEffect(() => {
    const update = () => {
      if (svgRef.current) {
        const rect = svgRef.current.parentElement?.getBoundingClientRect();
        if (rect) setSvgSize({ w: rect.width, h: Math.max(480, Math.min(600, rect.height)) });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { data: graphData, isLoading: graphLoading, refetch: refetchGraph } = useQuery<{
    nodes: AttackNode[]; edges: AttackEdge[]; crownJewelIds: string[]; builtAt: number;
  }>({
    queryKey: ["/api/attack-paths", tenantId, "graph", graphKey],
    queryFn: () => apiRequest("GET", `/api/attack-paths/${tenantId}/graph`).then(r => r.json()),
    enabled: !!tenantId,
    staleTime: 4 * 60 * 1000,
  });

  const { data: nodePathData, isLoading: pathLoading } = useQuery<{
    paths: AttackPath[]; blastRadius: { reachable: number; crownJewelsReachable: number; reachableIds: string[] };
  }>({
    queryKey: ["/api/attack-paths", tenantId, "paths", selectedNode?.id],
    queryFn: () => apiRequest("GET", `/api/attack-paths/${tenantId}/paths/${encodeURIComponent(selectedNode!.id)}`).then(r => r.json()),
    enabled: !!tenantId && !!selectedNode,
  });

  const { data: crownJewels = [], refetch: refetchCJ } = useQuery<any[]>({
    queryKey: ["/api/attack-paths", tenantId, "crown-jewels"],
    queryFn: () => apiRequest("GET", `/api/attack-paths/${tenantId}/crown-jewels`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const narrativeMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/attack-paths/${tenantId}/narrative`, body).then(r => r.json()),
  });

  const tagCrownJewelMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/attack-paths/${tenantId}/crown-jewels`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attack-paths", tenantId] });
      toast({ title: "Crown jewel tagged", description: "Attack paths will recalculate" });
    },
  });

  const removeCrownJewelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/attack-paths/${tenantId}/crown-jewels/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attack-paths", tenantId] });
      toast({ title: "Crown jewel removed" });
    },
  });

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const positions = useForceLayout(nodes, edges, svgSize.w, svgSize.h);

  // Highlight path edges when paths are selected
  useEffect(() => {
    if (!nodePathData?.paths?.length) { setHighlightPath(new Set()); return; }
    const ids = new Set<string>();
    for (const path of nodePathData.paths) {
      for (const id of path.nodes) ids.add(id);
    }
    setHighlightPath(ids);
  }, [nodePathData]);

  const handleNodeClick = useCallback((node: AttackNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    narrativeMutation.reset();
  }, []);

  const generateNarrative = () => {
    if (!selectedNode || !nodePathData) return;
    narrativeMutation.mutate({
      nodeId: selectedNode.id,
      nodeName: selectedNode.label,
      paths: nodePathData.paths,
      blastRadius: nodePathData.blastRadius,
    });
  };

  const tagAsCrownJewel = (node: AttackNode) => {
    tagCrownJewelMutation.mutate({
      assetId: node.id,
      assetName: node.label,
      criticality: node.riskScore > 70 ? "critical" : "high",
      label: node.label,
    });
  };

  const isEdgeHighlighted = (edge: AttackEdge) =>
    highlightPath.has(edge.source) && highlightPath.has(edge.target);

  const riskBadgeColor = (score: number) =>
    score >= 80 ? "bg-red-500/20 text-red-400 border-red-500/30" :
    score >= 60 ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
    score >= 40 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-green-500/20 text-green-400 border-green-500/30";

  const crownJewelCount = nodes.filter(n => n.isCrownJewel).length;
  const avgRisk = nodes.length ? Math.round(nodes.reduce((s, n) => s + n.riskScore, 0) / nodes.length) : 0;
  const criticalPaths = nodePathData?.paths?.filter(p => p.hops <= 2).length || 0;

  return (
    <div className="flex flex-col h-full">
      <PageHero
        icon={Network}
        title="Attack Path Prediction"
        description="Graph-based lateral movement analysis — visualise how far an attacker can move from any compromised node"
        badge="PREDICTIVE"
        stats={[
          { label: "Nodes", value: nodes.length.toString() },
          { label: "Crown Jewels", value: crownJewelCount.toString() },
          { label: "Avg Risk", value: avgRisk.toString() },
          { label: "Edge Paths", value: edges.length.toString() },
        ]}
      />

      <div className="flex flex-1 gap-4 p-4 min-h-0">
        {/* Main graph */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Graph controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { setGraphKey(k => k + 1); refetchGraph(); }} data-testid="button-refresh-graph">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Graph
            </Button>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {[
                { color: NODE_COLORS.crown_jewel, label: "Crown Jewel" },
                { color: NODE_COLORS.device, label: "Device" },
                { color: NODE_COLORS.user, label: "User" },
                { color: NODE_COLORS.service, label: "Service" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Graph canvas */}
          <Card className="flex-1 overflow-hidden relative">
            <CardContent className="p-0 h-full relative">
              {graphLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
              {!graphLoading && nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Network className="w-12 h-12 opacity-30" />
                  <p className="text-sm">No assets found. Import or scan assets to build the graph.</p>
                </div>
              )}
              <div className="w-full h-full" style={{ minHeight: 460 }}>
                <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${svgSize.w} ${svgSize.h}`} className="w-full h-full" data-testid="attack-graph-svg">
                  <defs>
                    <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 z" fill="#475569" />
                    </marker>
                    <marker id="arrow-highlight" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 z" fill="#f59e0b" />
                    </marker>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  {/* Edges */}
                  {edges.map((edge, i) => {
                    const s = positions.get(edge.source);
                    const t = positions.get(edge.target);
                    if (!s || !t) return null;
                    const highlighted = isEdgeHighlighted(edge);
                    const color = highlighted ? "#f59e0b" : (EDGE_COLORS[edge.type] || "#475569");
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = dx / len;
                    const ny = dy / len;
                    const sr = NODE_RADIUS[nodes.find(n => n.id === edge.source)?.type || "device"] + 2;
                    const tr = NODE_RADIUS[nodes.find(n => n.id === edge.target)?.type || "device"] + 8;
                    return (
                      <line
                        key={i}
                        x1={s.x + nx * sr}
                        y1={s.y + ny * sr}
                        x2={t.x - nx * tr}
                        y2={t.y - ny * tr}
                        stroke={color}
                        strokeWidth={highlighted ? 2.5 : 1}
                        strokeOpacity={highlighted ? 0.9 : 0.35}
                        markerEnd={highlighted ? "url(#arrow-highlight)" : "url(#arrow)"}
                        strokeDasharray={edge.type === "shared_credentials" ? "4,3" : undefined}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map(node => {
                    const pos = positions.get(node.id);
                    if (!pos) return null;
                    const r = NODE_RADIUS[node.type] || 12;
                    const color = NODE_COLORS[node.type] || "#3b82f6";
                    const isSelected = selectedNode?.id === node.id;
                    const isInPath = highlightPath.has(node.id);
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x},${pos.y})`}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleNodeClick(node)}
                        data-testid={`node-${node.id}`}
                      >
                        {/* Glow ring for selected/path */}
                        {(isSelected || isInPath) && (
                          <circle r={r + 6} fill="none" stroke={isSelected ? "#fff" : "#f59e0b"} strokeWidth={isSelected ? 2 : 1.5} strokeOpacity={0.6} filter="url(#glow)" />
                        )}
                        <circle
                          r={r}
                          fill={color}
                          fillOpacity={isSelected ? 1 : 0.85}
                          stroke={isSelected ? "#fff" : color}
                          strokeWidth={isSelected ? 2.5 : 1}
                        />
                        {/* Crown icon for crown jewels */}
                        {node.isCrownJewel && (
                          <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.85} fill="#1a1a1a">👑</text>
                        )}
                        {/* Risk indicator */}
                        {node.riskScore >= 70 && !node.isCrownJewel && (
                          <circle r={4} fill="#ef4444" cx={r * 0.7} cy={-r * 0.7} />
                        )}
                        {/* Label */}
                        <text
                          y={r + 14}
                          textAnchor="middle"
                          fontSize={10}
                          fill="currentColor"
                          className="fill-foreground"
                          style={{ userSelect: "none" }}
                        >
                          {node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Edge legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <div className="w-6 h-0.5" style={{ backgroundColor: color, opacity: 0.8 }} />
                {CONNECTION_TYPE_LABELS[type] || type}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* Selected Node Detail */}
          {selectedNode ? (
            <Card data-testid="node-detail-panel">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      {selectedNode.isCrownJewel ? <Crown className="w-3.5 h-3.5 text-amber-500" /> : <Target className="w-3.5 h-3.5 text-primary" />}
                      {selectedNode.label}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{selectedNode.ip || selectedNode.type}</p>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground mt-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={`text-[10px] ${riskBadgeColor(selectedNode.riskScore)}`}>
                    Risk: {selectedNode.riskScore}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 capitalize">
                    {selectedNode.type.replace("_", " ")}
                  </Badge>
                  {selectedNode.os && <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50">{selectedNode.os}</Badge>}
                  {selectedNode.isCrownJewel && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Crown Jewel</Badge>}
                </div>

                {/* Blast Radius */}
                {pathLoading ? (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Calculating paths...
                  </div>
                ) : nodePathData && (
                  <>
                    <div className="bg-muted/40 rounded-md p-2.5 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Blast Radius (2 hops)</p>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Reachable assets</span>
                        <span className={`font-bold ${nodePathData.blastRadius.reachable > 20 ? "text-red-400" : nodePathData.blastRadius.reachable > 10 ? "text-orange-400" : "text-yellow-400"}`}>
                          {nodePathData.blastRadius.reachable}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Crown jewels at risk</span>
                        <span className={`font-bold ${nodePathData.blastRadius.crownJewelsReachable > 0 ? "text-red-400" : "text-green-400"}`}>
                          {nodePathData.blastRadius.crownJewelsReachable}
                        </span>
                      </div>
                    </div>

                    {/* Attack Paths */}
                    {nodePathData.paths.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                          <Crosshair className="w-3 h-3" /> Attack Paths to Crown Jewels
                        </p>
                        {nodePathData.paths.map((path, i) => (
                          <div key={i} className="bg-red-500/5 border border-red-500/15 rounded p-2 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-red-400 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Path {i + 1}
                              </span>
                              <span className="text-muted-foreground">{path.hops} hop{path.hops !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {path.nodes.map((nodeId, ni) => (
                                <span key={ni} className="flex items-center gap-0.5 text-[10px]">
                                  <span className="font-mono bg-muted/50 px-1 rounded">{nodes.find(n => n.id === nodeId)?.label || nodeId}</span>
                                  {ni < path.nodes.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
                                </span>
                              ))}
                            </div>
                            {path.techniques.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-0.5">
                                {path.techniques.slice(0, 2).map((t, ti) => (
                                  <Badge key={ti} variant="outline" className="text-[9px] py-0 text-orange-400 border-orange-500/20 bg-orange-500/5">{t}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {nodePathData.paths.length === 0 && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-green-500/10 rounded p-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        No direct paths to crown jewels identified.
                      </div>
                    )}

                    {/* AI Narrative */}
                    <div className="space-y-1.5">
                      <Button size="sm" variant="outline" className="w-full text-[11px] h-7" onClick={generateNarrative} disabled={narrativeMutation.isPending} data-testid="button-generate-narrative">
                        {narrativeMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Brain className="w-3 h-3 mr-1.5" />}
                        AI Threat Narrative
                      </Button>
                      {narrativeMutation.data?.narrative && (
                        <div className="bg-primary/5 border border-primary/15 rounded p-2.5 text-[11px] text-muted-foreground leading-relaxed" data-testid="narrative-text">
                          {narrativeMutation.data.narrative}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Actions */}
                {isMSS && !selectedNode.isCrownJewel && (
                  <Button size="sm" variant="outline" className="w-full text-[11px] h-7 border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={() => tagAsCrownJewel(selectedNode)} disabled={tagCrownJewelMutation.isPending} data-testid="button-tag-crown-jewel">
                    <Crown className="w-3 h-3 mr-1.5" /> Tag as Crown Jewel
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <Target className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-[12px] text-muted-foreground">Click any node to analyse attack paths</p>
              </CardContent>
            </Card>
          )}

          {/* Crown Jewels Panel */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500" /> Crown Jewel Assets
                </CardTitle>
                {isMSS && (
                  <button
                    onClick={() => setShowQuickAddCJ(v => !v)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                    data-testid="button-add-crown-jewel"
                  >
                    {showQuickAddCJ ? "Cancel" : "+ Add"}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {showQuickAddCJ && isMSS && (
                <div className="space-y-1.5 border border-amber-500/20 rounded p-2 bg-amber-500/5">
                  <Input
                    placeholder="Asset name (e.g. Finance DB)"
                    className="h-7 text-[11px]"
                    value={quickCJForm.name}
                    onChange={e => setQuickCJForm(f => ({ ...f, name: e.target.value }))}
                    data-testid="input-cj-name"
                  />
                  <Input
                    placeholder="IP / Hostname (used as ID)"
                    className="h-7 text-[11px]"
                    value={quickCJForm.ip}
                    onChange={e => setQuickCJForm(f => ({ ...f, ip: e.target.value }))}
                    data-testid="input-cj-ip"
                  />
                  <Select value={quickCJForm.criticality} onValueChange={v => setQuickCJForm(f => ({ ...f, criticality: v }))}>
                    <SelectTrigger className="h-7 text-[11px]" data-testid="select-cj-criticality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="w-full h-7 text-[11px]"
                    disabled={!quickCJForm.name || !quickCJForm.ip || tagCrownJewelMutation.isPending}
                    onClick={() => {
                      tagCrownJewelMutation.mutate(
                        { assetId: quickCJForm.ip, assetName: quickCJForm.name, criticality: quickCJForm.criticality },
                        { onSuccess: () => { setQuickCJForm({ name: "", ip: "", criticality: "high" }); setShowQuickAddCJ(false); } }
                      );
                    }}
                    data-testid="button-submit-crown-jewel"
                  >
                    {tagCrownJewelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Crown Jewel"}
                  </Button>
                </div>
              )}
              {crownJewels.length === 0 && !showQuickAddCJ ? (
                <p className="text-[11px] text-muted-foreground">No crown jewels tagged yet. Click "+ Add" or select a node in the graph to tag it.</p>
              ) : (
                <div className="space-y-1.5" data-testid="crown-jewels-list">
                  {crownJewels.map((cj: any) => (
                    <div key={cj.id} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/15 rounded px-2 py-1.5" data-testid={`crown-jewel-${cj.id}`}>
                      <div>
                        <p className="text-[11px] font-medium">{cj.asset_name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{cj.criticality}</p>
                      </div>
                      {isMSS && (
                        <button onClick={() => removeCrownJewelMutation.mutate(cj.id)} className="text-muted-foreground hover:text-red-400 transition-colors" data-testid={`button-remove-cj-${cj.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Graph stats */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Graph Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 grid grid-cols-2 gap-2">
              {[
                { label: "Total Nodes", value: nodes.length },
                { label: "Total Edges", value: edges.length },
                { label: "Crown Jewels", value: crownJewelCount },
                { label: "High Risk Nodes", value: nodes.filter(n => n.riskScore >= 70).length },
                { label: "Lateral Movement", value: edges.filter(e => e.type === "lateral_movement").length },
                { label: "Cred. Access", value: edges.filter(e => e.type === "credential_access").length },
              ].map(stat => (
                <div key={stat.label} className="bg-muted/30 rounded p-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-base font-bold mt-0.5">{stat.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
