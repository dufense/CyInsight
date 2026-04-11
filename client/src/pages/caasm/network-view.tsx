import { useState, useMemo, useCallback, useRef, useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Network, Globe, Shield, Layers, ArrowLeft, ExternalLink,
  AlertTriangle, CheckCircle, XCircle, Monitor, Wifi, Lock, Unlock,
  Activity, Search, ChevronRight, ChevronDown, Server, Cloud, MapPin,
  HardDrive, Cpu, GitBranch, Building2, Laptop, ZoomIn, ZoomOut, Maximize2
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import { StatCard, RichTooltip, CHART_COLORS } from "./shared";

function getEntitiesArray(a: any): string[] {
  if (Array.isArray(a?.entities)) return a.entities;
  if (a?.entities && typeof a.entities === "object") {
    return [
      ...(Array.isArray(a.entities.hostnames) ? a.entities.hostnames : []),
      ...(Array.isArray(a.entities.users) ? a.entities.users : []),
      ...(Array.isArray(a.entities.ips) ? a.entities.ips : []),
    ];
  }
  return [];
}

interface TreeNode {
  id: string;
  label: string;
  type: "infraType" | "location" | "subnet" | "device";
  children?: TreeNode[];
  deviceCount?: number;
  ip?: string;
  os?: string;
  status?: string;
  deviceType?: string;
  isPrivate?: boolean;
  cloudProvider?: string;
  regionalDc?: string;
  auto?: boolean;
  infraType?: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: "branch" | "network";
  infraType?: string;
  parentId?: string;
  deviceCount: number;
  subnetCount?: number;
  cloudProvider?: string;
  isPrivate?: boolean;
  assetTypes?: string[];
  ipRanges?: string[];
  connectedTo?: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
  radius: number;
  collapsed: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "branch-branch" | "branch-network";
}

interface GraphTooltip {
  x: number;
  y: number;
  node: GraphNode;
}

const GRAPH_COLORS: Record<string, { fill: string; stroke: string; bg: string }> = {
  "on-prem": { fill: "#3b82f6", stroke: "#2563eb", bg: "rgba(59,130,246,0.12)" },
  cloud: { fill: "#a855f7", stroke: "#9333ea", bg: "rgba(168,85,247,0.12)" },
  hybrid: { fill: "#14b8a6", stroke: "#0d9488", bg: "rgba(20,184,166,0.12)" },
};

function buildNetworkGraph(
  topologyTree: any[],
  locations: any[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const cx = 500;
  const cy = 400;

  const allLocations: { node: any; infraType: string }[] = [];
  topologyTree.forEach((typeNode) => {
    (typeNode.children || []).forEach((loc: any) => {
      allLocations.push({ node: loc, infraType: typeNode.infraType || "on-prem" });
    });
  });

  const branchCount = allLocations.length;
  allLocations.forEach((item, i) => {
    const angle = (2 * Math.PI * i) / Math.max(branchCount, 1) - Math.PI / 2;
    const branchRadius = Math.min(350, 160 + branchCount * 30);
    const bx = cx + branchRadius * Math.cos(angle);
    const by = cy + branchRadius * Math.sin(angle);
    const dc = item.node.deviceCount || 0;
    const subnets = item.node.children || [];

    const locMeta = locations.find((l: any) => `loc-${l.id}` === item.node.id);
    const ipRanges = locMeta
      ? [...(locMeta.privateIpRanges || []), ...(locMeta.publicIpRanges || [])]
      : [...(item.node.privateIpRanges || []), ...(item.node.publicIpRanges || [])];

    const branchNode: GraphNode = {
      id: item.node.id,
      label: item.node.label,
      type: "branch",
      infraType: item.infraType,
      deviceCount: dc,
      subnetCount: subnets.length,
      cloudProvider: item.node.cloudProvider,
      assetTypes: item.node.assetTypes,
      ipRanges,
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      radius: Math.max(36, Math.min(56, 36 + Math.sqrt(dc) * 2.5)),
      collapsed: false,
    };
    nodes.push(branchNode);

    subnets.forEach((subnet: any, si: number) => {
      const sAngle = angle + ((si - (subnets.length - 1) / 2) * 0.35);
      const sRadius = branchRadius + 120 + si * 14;
      const sx = cx + sRadius * Math.cos(sAngle);
      const sy = cy + sRadius * Math.sin(sAngle);
      const sdc = subnet.deviceCount || 0;

      const networkNode: GraphNode = {
        id: subnet.id,
        label: subnet.label,
        type: "network",
        infraType: item.infraType,
        parentId: item.node.id,
        deviceCount: sdc,
        isPrivate: subnet.isPrivate,
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        radius: Math.max(18, Math.min(32, 18 + Math.sqrt(sdc) * 2)),
        collapsed: false,
      };
      nodes.push(networkNode);
      edges.push({ source: item.node.id, target: subnet.id, type: "branch-network" });
    });
  });

  locations.forEach((loc: any) => {
    (loc.connectedLocationIds || []).forEach((cid: number) => {
      const srcId = `loc-${loc.id}`;
      const tgtId = `loc-${cid}`;
      if (nodes.find((n) => n.id === srcId) && nodes.find((n) => n.id === tgtId)) {
        if (!edges.find((e) => (e.source === srcId && e.target === tgtId) || (e.source === tgtId && e.target === srcId))) {
          edges.push({ source: srcId, target: tgtId, type: "branch-branch" });
        }
      }
    });
  });

  return { nodes, edges };
}

function NetworkForceGraph({ tenantId, onSubnetSelect }: { tenantId: number; onSubnetSelect: (subnet: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1100, h: 800 });
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, vx: 0, vy: 0 });
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const [renderTick, setRenderTick] = useState(0);

  const { data: topologyData, isLoading } = useQuery<any>({
    queryKey: ["/api/infrastructure", tenantId, "topology"],
    queryFn: async () => { const r = await fetch(`/api/infrastructure/${tenantId}/topology`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
  });

  const tree = topologyData?.tree || [];
  const infraLocations = topologyData?.locations || [];
  const totalLocations = topologyData?.totalLocations || 0;
  const totalSubnets = topologyData?.totalSubnets || 0;
  const totalDevices = topologyData?.totalDevices || 0;

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    nodesRef.current.forEach((n) => {
      if (n.type === "branch") {
        ids.add(n.id);
      } else if (n.type === "network") {
        const parent = nodesRef.current.find((p) => p.id === n.parentId);
        if (parent && !parent.collapsed) ids.add(n.id);
      }
    });
    return ids;
  }, [renderTick]);

  const connectedToHovered = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const connected = new Set<string>();
    connected.add(hoveredNode);
    edgesRef.current.forEach((e) => {
      if (e.source === hoveredNode) connected.add(e.target);
      if (e.target === hoveredNode) connected.add(e.source);
    });
    return connected;
  }, [hoveredNode]);

  useEffect(() => {
    if (!tree.length) return;
    const { nodes, edges } = buildNetworkGraph(tree, infraLocations);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    const visibleCount = nodes.filter((n) => {
      if (n.type === "branch") return true;
      if (n.type === "network") {
        const parent = nodes.find((p) => p.id === n.parentId);
        return parent && !parent.collapsed;
      }
      return false;
    }).length;

    if (visibleCount > 200) {
      setRenderTick((v) => v + 1);
      return;
    }

    let tick = 0;
    const maxTicks = 80;
    const alpha = { value: 1 };
    const startTime = performance.now();
    const TIMEOUT_MS = 3000;

    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    function simulate() {
      if (tick >= maxTicks || alpha.value < 0.001 || (performance.now() - startTime) > TIMEOUT_MS) {
        setRenderTick((v) => v + 1);
        return;
      }
      alpha.value *= 0.97;
      const ns = nodesRef.current;
      const visible = new Set<string>();
      ns.forEach((n) => {
        if (n.type === "branch") visible.add(n.id);
        else if (n.type === "network") {
          const parent = nodeMap.get(n.parentId || "");
          if (parent && !parent.collapsed) visible.add(n.id);
        }
      });

      const CELL_SIZE = 120;
      const grid = new Map<string, GraphNode[]>();
      for (let i = 0; i < ns.length; i++) {
        if (!visible.has(ns[i].id)) continue;
        const cx = Math.floor(ns[i].x / CELL_SIZE);
        const cy = Math.floor(ns[i].y / CELL_SIZE);
        const key = `${cx},${cy}`;
        let cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(ns[i]);
      }

      grid.forEach((cell, key) => {
        const [cx, cy] = key.split(",").map(Number);
        const neighbors: GraphNode[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nKey = `${cx + dx},${cy + dy}`;
            const nCell = grid.get(nKey);
            if (nCell) neighbors.push(...nCell);
          }
        }
        for (let i = 0; i < cell.length; i++) {
          for (let j = 0; j < neighbors.length; j++) {
            if (cell[i].id >= neighbors[j].id) continue;
            const ddx = neighbors[j].x - cell[i].x;
            const ddy = neighbors[j].y - cell[i].y;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            const minDist = cell[i].radius + neighbors[j].radius + 35;
            if (dist < minDist) {
              const force = ((minDist - dist) / dist) * alpha.value * 0.3;
              const fx = ddx * force;
              const fy = ddy * force;
              if (!cell[i].fx) { cell[i].vx -= fx; cell[i].vy -= fy; }
              if (!neighbors[j].fx) { neighbors[j].vx += fx; neighbors[j].vy += fy; }
            }
          }
        }
      });

      edgesRef.current.forEach((e) => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt || !visible.has(src.id) || !visible.has(tgt.id)) return;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = e.type === "branch-branch" ? 250 : 160;
        const force = ((dist - targetDist) / dist) * alpha.value * 0.05;
        const fx = dx * force;
        const fy = dy * force;
        if (!src.fx) { src.vx += fx; src.vy += fy; }
        if (!tgt.fx) { tgt.vx -= fx; tgt.vy -= fy; }
      });

      ns.forEach((n) => {
        if (n.fx !== undefined) return;
        n.vx *= 0.8;
        n.vy *= 0.8;
        n.x += n.vx;
        n.y += n.vy;
      });

      tick++;
      if (tick % 5 === 0 || tick >= maxTicks) {
        setRenderTick((v) => v + 1);
      }
      animFrameRef.current = requestAnimationFrame(simulate);
    }

    animFrameRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [tree, infraLocations]);

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.type === "branch") {
      node.collapsed = !node.collapsed;
      setRenderTick((v) => v + 1);
    } else if (node.type === "network") {
      onSubnetSelect(node.label);
    }
  }, [onSubnetSelect]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId?: string) => {
      if (nodeId) {
        setDragNode(nodeId);
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (node) { node.fx = node.x; node.fy = node.y; }
      } else {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y });
      }
    },
    [viewBox]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragNode) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = viewBox.w / rect.width;
        const scaleY = viewBox.h / rect.height;
        const x = viewBox.x + (e.clientX - rect.left) * scaleX;
        const y = viewBox.y + (e.clientY - rect.top) * scaleY;
        const node = nodesRef.current.find((n) => n.id === dragNode);
        if (node) { node.x = x; node.y = y; node.fx = x; node.fy = y; setRenderTick((v) => v + 1); }
      } else if (isPanning) {
        const dx = (e.clientX - panStart.x) * (viewBox.w / (containerRef.current?.clientWidth || 1000));
        const dy = (e.clientY - panStart.y) * (viewBox.h / (containerRef.current?.clientHeight || 800));
        setViewBox((v) => ({ ...v, x: panStart.vx - dx, y: panStart.vy - dy }));
      }
    },
    [dragNode, isPanning, panStart, viewBox]
  );

  const handleMouseUp = useCallback(() => {
    if (dragNode) {
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) { delete node.fx; delete node.fy; }
    }
    setDragNode(null);
    setIsPanning(false);
  }, [dragNode]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
      const my = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;
      const nw = viewBox.w * factor;
      const nh = viewBox.h * factor;
      setViewBox({
        x: mx - (mx - viewBox.x) * factor,
        y: my - (my - viewBox.y) * factor,
        w: Math.max(200, Math.min(5000, nw)),
        h: Math.max(160, Math.min(4000, nh)),
      });
    },
    [viewBox]
  );

  const zoomIn = () => setViewBox((v) => { const cx2 = v.x + v.w / 2; const cy2 = v.y + v.h / 2; const nw = v.w * 0.8; const nh = v.h * 0.8; return { x: cx2 - nw / 2, y: cy2 - nh / 2, w: nw, h: nh }; });
  const zoomOut = () => setViewBox((v) => { const cx2 = v.x + v.w / 2; const cy2 = v.y + v.h / 2; const nw = v.w * 1.25; const nh = v.h * 1.25; return { x: cx2 - nw / 2, y: cy2 - nh / 2, w: nw, h: nh }; });
  const resetView = () => setViewBox({ x: 0, y: 0, w: 1100, h: 800 });

  const handleNodeHover = useCallback(
    (nodeId: string | null, e?: React.MouseEvent) => {
      setHoveredNode(nodeId);
      if (nodeId && e) {
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (node) setTooltip({ x: e.clientX, y: e.clientY, node });
      } else {
        setTooltip(null);
      }
    },
    []
  );

  const getNodeColor = (node: GraphNode) => GRAPH_COLORS[node.infraType || "on-prem"] || GRAPH_COLORS["on-prem"];

  if (isLoading) {
    return <Skeleton className="h-[550px]" />;
  }

  const nodes = nodesRef.current;
  const edgesList = edgesRef.current;

  if (!tree.length || nodes.length === 0) {
    return (
      <Card data-testid="mindmap-empty">
        <CardContent className="p-8 text-center">
          <Network className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-lg mb-1">No Network Topology Available</h3>
          <p className="text-sm text-muted-foreground">
            Add infrastructure locations in Infrastructure page with IP ranges, or import assets with IP addresses to auto-generate the topology.
          </p>
        </CardContent>
      </Card>
    );
  }

  const branchLinks = edgesList.filter(e => e.type === "branch-branch").length;

  return (
    <Card data-testid="network-force-graph-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            Network Topology Map
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{totalLocations} locations</span>
            <span>{totalSubnets} subnets</span>
            <span>{totalDevices} devices</span>
            {branchLinks > 0 && <span>{branchLinks} links</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative" ref={containerRef} data-testid="network-topology-graph">
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={zoomIn} data-testid="button-zoom-in">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={zoomOut} data-testid="button-zoom-out">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={resetView} data-testid="button-reset-view">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="absolute bottom-2 left-2 z-10 bg-card/90 backdrop-blur-sm border rounded-md p-2.5 text-[10px] space-y-1" data-testid="topology-legend">
            <div className="font-medium text-xs mb-1">Legend</div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={GRAPH_COLORS["on-prem"].fill} /></svg>
                <span>On-Prem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={GRAPH_COLORS.cloud.fill} /></svg>
                <span>Cloud</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={GRAPH_COLORS.hybrid.fill} /></svg>
                <span>Hybrid</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg>
                <span>Connectivity Link</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.2" strokeDasharray="4 2" /></svg>
                <span>Subnet Link</span>
              </div>
            </div>
          </div>

          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="w-full bg-muted/20 rounded-lg border cursor-grab active:cursor-grabbing"
            style={{ height: 550 }}
            onMouseDown={(e) => {
              if ((e.target as Element).tagName === "svg" || (e.target as Element).tagName === "rect") {
                handleMouseDown(e);
              }
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            data-testid="svg-topology"
          >
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" />

            <defs>
              <filter id="netglow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="netshadow">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
              </filter>
            </defs>

            {edgesList.map((edge) => {
              const src = nodes.find((n: GraphNode) => n.id === edge.source);
              const tgt = nodes.find((n: GraphNode) => n.id === edge.target);
              if (!src || !tgt) return null;
              if (!visibleNodeIds.has(src.id) || !visibleNodeIds.has(tgt.id)) return null;

              const isHighlighted = hoveredNode && (connectedToHovered.has(src.id) && connectedToHovered.has(tgt.id));
              const isDimmed = hoveredNode && !isHighlighted;

              let strokeColor = "hsl(var(--foreground))";
              let strokeWidth = 1;
              let opacity = 0.15;
              let dashArray = "";

              if (edge.type === "branch-branch") {
                strokeColor = "hsl(var(--primary))";
                strokeWidth = 2.5;
                opacity = 0.7;
              } else if (edge.type === "branch-network") {
                opacity = 0.2;
                strokeWidth = 1;
                dashArray = "4 2";
              }

              if (isHighlighted) { opacity = Math.min(1, opacity + 0.4); strokeWidth += 1; }
              if (isDimmed) opacity *= 0.3;

              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity}
                  strokeDasharray={dashArray}
                  className="transition-opacity duration-200"
                />
              );
            })}

            {nodes.map((node) => {
              if (!visibleNodeIds.has(node.id)) return null;
              const colors = getNodeColor(node);
              const isHovered = hoveredNode === node.id;
              const isConnected = connectedToHovered.has(node.id);
              const isDimmed = hoveredNode && !isConnected;

              let r = node.radius;
              let textSize = node.type === "branch" ? 10 : 7.5;
              let strokeW = node.type === "branch" ? 2.5 : 1.5;

              const finalOpacity = isDimmed ? 0.2 : 1;
              const glowFilter = isHovered ? "url(#netglow)" : "url(#netshadow)";

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ opacity: finalOpacity, transition: "opacity 0.2s ease", cursor: "pointer" }}
                  onMouseEnter={(e) => handleNodeHover(node.id, e)}
                  onMouseLeave={() => handleNodeHover(null)}
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, node.id); }}
                  onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                  data-testid={`node-${node.id}`}
                >
                  <circle
                    r={isHovered ? r + 3 : r}
                    fill={colors.bg}
                    stroke={colors.fill}
                    strokeWidth={strokeW}
                    filter={glowFilter}
                    className="transition-all duration-200"
                  />

                  {node.type === "branch" && (
                    node.infraType === "cloud" ? (
                      <g transform="translate(-7,-10)">
                        <path d="M3 10c0 2.2 1.8 4 4 4h5c1.66 0 3-1.34 3-3 0-1.38-.93-2.53-2.2-2.87C12.28 6.34 10.58 5 8.5 5 6.07 5 4.06 6.76 3.5 9.09A3.99 3.99 0 0 0 3 10z"
                          fill={colors.fill} opacity="0.9" />
                      </g>
                    ) : node.infraType === "hybrid" ? (
                      <g transform="translate(-7,-8)">
                        <path d="M2 8l5-6 5 6H9v5H5V8z" fill={colors.fill} opacity="0.9" />
                        <circle cx="10" cy="11" r="3" fill={colors.fill} opacity="0.7" />
                      </g>
                    ) : (
                      <g transform="translate(-6,-8)">
                        <rect x="0" y="0" width="12" height="4" rx="1" fill={colors.fill} opacity="0.9" />
                        <rect x="0" y="5" width="12" height="4" rx="1" fill={colors.fill} opacity="0.7" />
                        <rect x="0" y="10" width="12" height="4" rx="1" fill={colors.fill} opacity="0.5" />
                      </g>
                    )
                  )}

                  {node.type === "branch" && (
                    <text
                      y={r + 15}
                      textAnchor="middle"
                      fill="hsl(var(--foreground))"
                      fontSize={textSize}
                      fontWeight={600}
                      style={{ pointerEvents: "none" }}
                    >
                      {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                    </text>
                  )}

                  {node.type === "branch" && (
                    <text
                      y={r + 26}
                      textAnchor="middle"
                      fill="hsl(var(--muted-foreground))"
                      fontSize={7.5}
                      style={{ pointerEvents: "none" }}
                    >
                      {node.deviceCount} devices · {node.subnetCount || 0} subnets
                    </text>
                  )}

                  {node.type === "network" && (
                    <>
                      <text
                        y={r + 12}
                        textAnchor="middle"
                        fill="hsl(var(--foreground))"
                        fontSize={textSize}
                        fontWeight={500}
                        style={{ pointerEvents: "none" }}
                      >
                        {node.label}
                      </text>
                      <text
                        y={r + 22}
                        textAnchor="middle"
                        fill="hsl(var(--muted-foreground))"
                        fontSize={6}
                        style={{ pointerEvents: "none" }}
                      >
                        {node.deviceCount} devices
                      </text>
                    </>
                  )}

                  {node.type === "branch" && node.deviceCount > 0 && (
                    <g transform={`translate(${r - 6}, ${-r + 2})`}>
                      <rect x="-4" y="-8" width={String(node.deviceCount).length * 7 + 8} height="14" rx="7" fill={colors.fill} />
                      <text x={String(node.deviceCount).length * 3.5} y="2" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" style={{ pointerEvents: "none" }}>
                        {node.deviceCount}
                      </text>
                    </g>
                  )}

                  {node.type === "branch" && !node.collapsed && (
                    <circle cx={r - 2} cy={r - 2} r="4" fill="hsl(var(--primary))" opacity="0.5" />
                  )}
                </g>
              );
            })}
          </svg>

          {tooltip && (
            <div
              className="fixed z-50 bg-card border rounded-md shadow-lg p-3 text-xs max-w-[240px] pointer-events-none"
              style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
              data-testid="topology-tooltip"
            >
              <div className="font-semibold mb-1">{tooltip.node.label}</div>
              <div className="text-muted-foreground space-y-0.5">
                <div>Type: {tooltip.node.type === "branch" ? "Location" : "Subnet"}</div>
                {tooltip.node.infraType && <div>Infra: {tooltip.node.infraType}</div>}
                {tooltip.node.cloudProvider && <div>Provider: {tooltip.node.cloudProvider}</div>}
                <div>Devices: {tooltip.node.deviceCount}</div>
                {tooltip.node.type === "branch" && <div>Subnets: {tooltip.node.subnetCount || 0}</div>}
                {tooltip.node.isPrivate !== undefined && <div>Network: {tooltip.node.isPrivate ? "Private" : "Public"}</div>}
                {tooltip.node.ipRanges && tooltip.node.ipRanges.length > 0 && (
                  <div>IP Ranges: {tooltip.node.ipRanges.join(", ")}</div>
                )}
                {tooltip.node.assetTypes && tooltip.node.assetTypes.length > 0 && (
                  <div>Assets: {tooltip.node.assetTypes.join(", ")}</div>
                )}
                <div className="text-[9px] mt-1 opacity-70">
                  {tooltip.node.type === "branch"
                    ? `Click to ${tooltip.node.collapsed ? "expand" : "collapse"} subnets · Drag to move`
                    : "Click to view subnet details · Drag to move"}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface HierarchyNode {
  id: string;
  label: string;
  type: string;
  deviceCount?: number;
  children?: HierarchyNode[];
  isPrivate?: boolean;
}

function HierarchyTreeNode({ node, depth }: {
  node: HierarchyNode;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = (node.children?.length || 0) > 0;

  const nodeIcon = () => {
    switch (node.type) {
      case "org":
        return <Building2 className="w-4 h-4 text-primary" />;
      case "location":
        return <MapPin className="w-4 h-4 text-orange-500" />;
      case "os":
        return <Laptop className="w-3.5 h-3.5 text-blue-500" />;
      case "subnet":
        return node.isPrivate ? <Shield className="w-3.5 h-3.5 text-green-500" /> : <Globe className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <HardDrive className="w-3.5 h-3.5" />;
    }
  };

  const osColor = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("windows")) return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    if (l.includes("linux")) return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
    if (l.includes("aix")) return "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
    if (l.includes("macos")) return "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30";
    if (l.includes("vmware") || l.includes("esxi")) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="select-none" data-testid={`hierarchy-node-${node.id}`}>
      <div
        className="flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/60 transition-colors group"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => { if (hasChildren) setExpanded(!expanded); }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {nodeIcon()}
        <span className={`text-sm ${depth === 0 ? "font-semibold" : "font-medium"} truncate`}>
          {node.label}
        </span>
        {node.type === "os" && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${osColor(node.label)}`}>
            {node.deviceCount} assets
          </span>
        )}
        {node.type === "subnet" && (
          <span className="text-[10px] font-mono text-muted-foreground ml-1">
            {node.deviceCount} assets
          </span>
        )}
        {(node.type === "org" || node.type === "location") && (node.deviceCount ?? 0) > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">
            {node.deviceCount}
          </Badge>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="relative">
          <div className="absolute top-0 bottom-0 border-l border-border/50" style={{ left: `${depth * 24 + 16}px` }} />
          {node.children!.map(child => (
            <HierarchyTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DCOSTree({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/infrastructure", tenantId, "dc-os-tree"],
    queryFn: async () => { const r = await fetch(`/api/infrastructure/${tenantId}/dc-os-tree`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const tree = data?.tree;
  if (!tree || !tree.children?.length) {
    return (
      <Card data-testid="dc-os-tree-empty">
        <CardContent className="p-8 text-center">
          <Laptop className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-lg mb-1">No DC & OS Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Import assets with IP addresses and OS information to generate the DC & OS hierarchy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="dc-os-tree-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Laptop className="w-4 h-4 text-primary" />
            Assets by DC & OS
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{tree.children?.length || 0} locations</span>
            <span>{tree.deviceCount || 0} total assets</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg max-h-[500px] overflow-y-auto bg-muted/5 py-1" data-testid="dc-os-tree">
          <HierarchyTreeNode node={tree} depth={0} />
        </div>
      </CardContent>
    </Card>
  );
}

function DCNetworkTree({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/infrastructure", tenantId, "dc-network-tree"],
    queryFn: async () => { const r = await fetch(`/api/infrastructure/${tenantId}/dc-network-tree`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const tree = data?.tree;
  if (!tree || !tree.children?.length) {
    return (
      <Card data-testid="dc-network-tree-empty">
        <CardContent className="p-8 text-center">
          <Network className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-lg mb-1">No DC & Network Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Import assets with IP addresses to generate the DC & Network Range hierarchy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="dc-network-tree-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            Assets by DC & Network Range
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{tree.children?.length || 0} locations</span>
            <span>{tree.deviceCount || 0} total assets</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg max-h-[500px] overflow-y-auto bg-muted/5 py-1" data-testid="dc-network-tree">
          <HierarchyTreeNode node={tree} depth={0} />
        </div>
      </CardContent>
    </Card>
  );
}

const GRID_PAGE_SIZE = 50;

export default function NetworkViewTab({ tenantId }: { tenantId: number }) {
  const [selectedSubnet, setSelectedSubnet] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"mindmap" | "dc-os" | "dc-network" | "grid">("mindmap");
  const [gridPage, setGridPage] = useState(0);

  const { data: ipData, isLoading: ipLoading, isError: ipError, refetch: refetchIp } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "ip-ranges"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/ip-ranges`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: anomalyData, isLoading: anomalyLoading, isError: anomalyError, refetch: refetchAnomaly } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "anomalies"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/anomalies`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: segmentData, isLoading: segmentLoading, isError: segmentError, refetch: refetchSegment } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "network-segmentation"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/network-segmentation`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!tenantId,
    retry: 1,
  });

  const subnetPrefix = (() => { try { return selectedSubnet?.range?.split(".")?.slice(0, 3)?.join(".") || ""; } catch { return ""; } })();

  const { data: drillDownData, isLoading: drillLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "devices", subnetPrefix],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/devices?pageSize=50&search=${encodeURIComponent(subnetPrefix)}`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    enabled: !!selectedSubnet && !!subnetPrefix,
  });

  const ranges = Array.isArray(ipData?.ranges) ? ipData.ranges : [];
  const summary = (ipData && typeof ipData === "object" && !Array.isArray(ipData)) ? (ipData.summary || {}) : {};
  const anomalies = Array.isArray(anomalyData?.anomalies) ? anomalyData.anomalies : (Array.isArray(anomalyData) ? anomalyData : []);
  const segments = Array.isArray(segmentData?.segments) ? segmentData.segments : (Array.isArray(segmentData) ? segmentData : []);

  const sharedIpAnomalies = useMemo(() => {
    try {
      return anomalies.filter((a: any) => a?.type === "shared_ip" || a?.type === "duplicate_ip");
    } catch { return []; }
  }, [anomalies]);

  const rogueDevices = useMemo(() => {
    try {
      const knownHosts = new Set<string>();
      ranges.forEach((r: any) => {
        const hosts = Array.isArray(r?.hosts) ? r.hosts : (Array.isArray(r?.sampleHosts) ? r.sampleHosts : []);
        hosts.forEach((h: string) => { if (h) knownHosts.add(String(h).toLowerCase()); });
      });
      const rogue: any[] = [];
      anomalies.forEach((a: any) => {
        const entities = getEntitiesArray(a);
        entities.forEach((e: string) => {
          if (e && !knownHosts.has(String(e).toLowerCase())) {
            rogue.push({ hostname: e, ipAddress: a?.ipAddress, severity: a?.severity, type: a?.type });
          }
        });
      });
      return rogue;
    } catch { return []; }
  }, [anomalies, ranges]);

  const exposureData = useMemo(() => {
    try {
      return [
        { name: "Private", value: Number(summary?.privateRanges) || 0, color: CHART_COLORS[3] },
        { name: "Public", value: Number(summary?.publicRanges) || 0, color: CHART_COLORS[5] },
      ];
    } catch { return [{ name: "Private", value: 0, color: CHART_COLORS[3] }, { name: "Public", value: 0, color: CHART_COLORS[5] }]; }
  }, [summary]);

  const topSubnetsByDensity = useMemo(() => {
    try {
      return [...ranges]
        .sort((a: any, b: any) => (Number(b?.assetCount) || Number(b?.deviceCount) || 0) - (Number(a?.assetCount) || Number(a?.deviceCount) || 0))
        .slice(0, 8)
        .map((r: any) => ({
          subnet: r?.range || r?.subnet || "Unknown",
          devices: Number(r?.assetCount) || Number(r?.deviceCount) || 0,
        }));
    } catch { return []; }
  }, [ranges]);

  const segmentHealthScores = useMemo(() => {
    try {
      if (!segments.length) return [];
      if (anomalies.length > 500 || segments.length > 200) {
        return segments.slice(0, 200).map((seg: any) => ({
          ...seg,
          healthScore: 50,
          anomalyCount: 0,
          compliant: true,
        }));
      }
      return segments.map((seg: any) => {
        const segDevices = Array.isArray(seg?.devices) ? seg.devices : (Array.isArray(seg?.assets) ? seg.assets : []);
        const segDeviceSet = new Set(
          segDevices.map((d: any) =>
            String(typeof d === "string" ? d : d?.hostname || "").toLowerCase()
          )
        );
        const segAnomalyCount = anomalies.filter((a: any) => {
          const entities = getEntitiesArray(a);
          return entities.some((e: string) => segDeviceSet.has(String(e || "").toLowerCase()));
        }).length;
        const assetCount = Number(seg?.deviceCount) || Number(seg?.assetCount) || segDevices.length || 0;
        const density = assetCount > 0 ? assetCount / 254 : 0;
        let score = 100 - (segAnomalyCount * 15) - (density > 0.8 ? 20 : density > 0.5 ? 10 : 0);
        score = Math.max(0, Math.min(100, score));
        const hasSharedIp = sharedIpAnomalies.some((a: any) => {
          const entities = getEntitiesArray(a);
          return entities.some((e: string) => segDeviceSet.has(String(e || "").toLowerCase()));
        });
        return { ...seg, healthScore: score, anomalyCount: segAnomalyCount, compliant: !hasSharedIp };
      });
    } catch { return []; }
  }, [segments, anomalies, sharedIpAnomalies]);

  const subnetRiskGrid = useMemo(() => {
    try {
      return ranges.map((r: any) => {
        const count = Number(r?.assetCount) || Number(r?.deviceCount) || 0;
        const utilization = Math.min(100, Math.round((count / 254) * 100));
        const rangePrefix = r?.range?.split(".")?.slice(0, 3)?.join(".") || "---";
        const relatedAnomalies = anomalies.filter((a: any) =>
          a?.ipAddress && String(a.ipAddress).startsWith(rangePrefix)
        ).length;
        let risk = 0;
        if (relatedAnomalies > 2) risk = 3;
        else if (relatedAnomalies > 0) risk = 2;
        else if (utilization > 80) risk = 1;
        return { ...r, utilization, relatedAnomalies, risk };
      });
    } catch { return []; }
  }, [ranges, anomalies]);

  const commonPorts = useMemo(() => {
    const portMap: Record<string, { port: number; protocol: string; risk: string }> = {
      "SSH (22)": { port: 22, protocol: "TCP", risk: "medium" },
      "HTTP (80)": { port: 80, protocol: "TCP", risk: "high" },
      "HTTPS (443)": { port: 443, protocol: "TCP", risk: "low" },
      "RDP (3389)": { port: 3389, protocol: "TCP", risk: "critical" },
      "SMB (445)": { port: 445, protocol: "TCP", risk: "high" },
      "DNS (53)": { port: 53, protocol: "UDP", risk: "medium" },
      "SMTP (25)": { port: 25, protocol: "TCP", risk: "medium" },
      "MySQL (3306)": { port: 3306, protocol: "TCP", risk: "high" },
    };
    const RISK_EXPOSURE_FRACTIONS: Record<string, number> = {
      critical: 0.25,
      high: 0.15,
      medium: 0.08,
      low: 0.03,
    };
    return Object.entries(portMap).map(([name, info]) => ({
      name,
      ...info,
      exposed: Math.floor(ranges.length * (RISK_EXPOSURE_FRACTIONS[info.risk] ?? 0.05)),
    }));
  }, [ranges]);

  const portRiskColor = (risk: string) => {
    if (risk === "critical") return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    if (risk === "high") return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
    if (risk === "medium") return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30";
  };

  function getHealthBadge(score: number) {
    if (score >= 80) return <Badge className="bg-green-600 text-white dark:bg-green-700" data-testid="badge-health-good">Healthy</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-500 text-white dark:bg-yellow-600" data-testid="badge-health-warning">Warning</Badge>;
    return <Badge className="bg-red-600 text-white dark:bg-red-700" data-testid="badge-health-critical">Critical</Badge>;
  }

  function getRiskIntensity(risk: number) {
    if (risk >= 3) return "bg-red-500/30 border-red-500/50 dark:bg-red-900/40";
    if (risk >= 2) return "bg-yellow-500/20 border-yellow-500/40 dark:bg-yellow-900/30";
    if (risk >= 1) return "bg-orange-500/15 border-orange-400/30 dark:bg-orange-900/20";
    return "bg-green-500/10 border-green-500/30 dark:bg-green-900/20";
  }

  const isLoading = ipLoading || anomalyLoading || segmentLoading;
  const hasError = ipError || anomalyError || segmentError;

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="network-view-loading">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="network-view-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">Unable to load network view data. Please try again.</p>
        <Button onClick={() => { refetchIp(); refetchAnomaly(); refetchSegment(); }} size="sm" data-testid="network-view-retry">
          Retry
        </Button>
      </div>
    );
  }

  if (selectedSubnet) {
    const safeDD = drillDownData && typeof drillDownData === "object" ? drillDownData : {};
    const devices = Array.isArray(safeDD.devices) ? safeDD.devices : (Array.isArray(safeDD.data) ? safeDD.data : (Array.isArray(drillDownData) ? drillDownData : []));
    return (
      <div className="space-y-4" data-testid="subnet-drilldown">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedSubnet(null)} data-testid="button-back-to-overview">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-lg">Subnet: <span className="font-mono">{selectedSubnet.range || selectedSubnet.subnet}</span></h3>
            <p className="text-xs text-muted-foreground">
              {selectedSubnet.assetCount || selectedSubnet.deviceCount || 0} devices found
            </p>
          </div>
          <Badge className={selectedSubnet.isPrivate !== false ? "bg-blue-600 text-white dark:bg-blue-700" : "bg-orange-500 text-white dark:bg-orange-600"}>
            {selectedSubnet.isPrivate !== false ? "Private" : "Public"}
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Devices in Subnet</CardTitle>
          </CardHeader>
          <CardContent>
            {drillLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : devices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d: any, idx: number) => (
                    <TableRow key={idx} data-testid={`row-device-${idx}`}>
                      <TableCell className="font-mono text-xs">{d.hostname || d.name || "Unknown"}</TableCell>
                      <TableCell className="font-mono text-xs">{d.ipAddress || d.ip || "-"}</TableCell>
                      <TableCell className="text-xs">{d.os || d.operatingSystem || "-"}</TableCell>
                      <TableCell>
                        <Link href={`/assets/${tenantId}/${encodeURIComponent(d.hostname || d.name || "")}`}>
                          <Button variant="ghost" size="icon" data-testid={`link-device-${idx}`}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No devices found in this subnet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="network-view">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Subnets" value={ranges.length} icon={Network} color="bg-blue-600" subtitle={`${summary.privateRanges || 0} private, ${summary.publicRanges || 0} public`} />
        <StatCard title="Total Assets" value={summary.totalAssetsWithIP || 0} icon={Monitor} color="bg-green-600" subtitle="With IP addresses" />
        <StatCard title="Shared IPs" value={sharedIpAnomalies.length} icon={AlertTriangle} color="bg-orange-500" subtitle="IP anomalies detected" />
        <StatCard title="Segments" value={segments.length} icon={Layers} color="bg-purple-600" subtitle={`${segmentHealthScores.filter((s: any) => s.compliant).length} compliant`} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={viewMode === "mindmap" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("mindmap")}
          data-testid="button-view-mindmap"
        >
          <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Topology Mindmap
        </Button>
        <Button
          variant={viewMode === "dc-os" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("dc-os")}
          data-testid="button-view-dc-os"
        >
          <Laptop className="w-3.5 h-3.5 mr-1.5" /> Assets by DC & OS
        </Button>
        <Button
          variant={viewMode === "dc-network" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("dc-network")}
          data-testid="button-view-dc-network"
        >
          <Network className="w-3.5 h-3.5 mr-1.5" /> Assets by DC & Network
        </Button>
        <Button
          variant={viewMode === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("grid")}
          data-testid="button-view-grid"
        >
          <Layers className="w-3.5 h-3.5 mr-1.5" /> Grid View
        </Button>
      </div>

      {viewMode === "mindmap" && (
        <NetworkForceGraph
          tenantId={tenantId}
          onSubnetSelect={(subnet) => {
            const matchedRange = ranges.find((r: any) => (r.range || r.subnet || "") === subnet);
            if (matchedRange) setSelectedSubnet(matchedRange);
          }}
        />
      )}

      {viewMode === "dc-os" && (
        <DCOSTree tenantId={tenantId} />
      )}

      {viewMode === "dc-network" && (
        <DCNetworkTree tenantId={tenantId} />
      )}

      {viewMode === "grid" && (<>
      <Card data-testid="card-port-exposure-badges">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Port Exposure Overview
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">Common ports detected across subnets with risk classification</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {commonPorts.map((p) => (
              <div key={p.name} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${portRiskColor(p.risk)}`}
                data-testid={`port-badge-${p.port}`}>
                <span className="font-mono font-semibold">{p.name}</span>
                <span className="text-[10px] opacity-70">{p.protocol}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{p.exposed} subnets</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="card-port-exposure">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Port Exposure Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={exposureData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {exposureData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<RichTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-1 text-xs">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-green-500" />
                <span>{summary.privateRanges || 0} Private</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Unlock className="w-3 h-3 text-red-500" />
                <span>{summary.publicRanges || 0} Public</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="card-dns-density">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Top Subnets by Device Density
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSubnetsByDensity} margin={{ left: 0, right: 10 }}>
                <XAxis dataKey="subnet" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip content={<RichTooltip />} />
                <Bar dataKey="devices" name="Devices" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-topology-grid">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            Visual Topology Grid
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">Color intensity represents risk level per subnet</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {subnetRiskGrid.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE).map((r: any, idx: number) => (
              <div
                key={gridPage * GRID_PAGE_SIZE + idx}
                className={`p-2 rounded-md border cursor-pointer transition-all hover:shadow-sm ${getRiskIntensity(r.risk)}`}
                onClick={() => setSelectedSubnet(r)}
                data-testid={`topology-cell-${gridPage * GRID_PAGE_SIZE + idx}`}
              >
                <p className="font-mono text-[8px] leading-tight font-semibold break-all" title={r.range || r.subnet}>{r.range || r.subnet}</p>
                <p className="text-[10px] font-bold text-center text-foreground">{r.assetCount || r.deviceCount || 0}</p>
                <div className="mt-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.utilization}%`,
                      backgroundColor: r.risk >= 3 ? "#ef4444" : r.risk >= 2 ? "#eab308" : r.risk >= 1 ? "#f97316" : "#22c55e"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {subnetRiskGrid.length > GRID_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" disabled={gridPage === 0} onClick={() => setGridPage((p) => p - 1)} data-testid="button-grid-prev">Previous</Button>
              <span className="text-xs text-muted-foreground">
                Page {gridPage + 1} of {Math.ceil(subnetRiskGrid.length / GRID_PAGE_SIZE)} ({subnetRiskGrid.length} subnets)
              </span>
              <Button variant="outline" size="sm" disabled={(gridPage + 1) * GRID_PAGE_SIZE >= subnetRiskGrid.length} onClick={() => setGridPage((p) => p + 1)} data-testid="button-grid-next">Next</Button>
            </div>
          )}
          {subnetRiskGrid.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No subnet data available.</p>
          )}
          <div className="flex items-center justify-end gap-3 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-green-500/30" /> Low</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-orange-500/30" /> Elevated</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-yellow-500/30" /> Medium</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/30" /> High</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-subnet-overview">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="w-4 h-4" />
            Subnet Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subnetRiskGrid.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE).map((r: any, idx: number) => {
              const utilization = r.utilization;
              const hosts = Array.isArray(r.hosts) ? r.hosts : Array.isArray(r.sampleHosts) ? r.sampleHosts : [];
              return (
                <div
                  key={idx}
                  className="border rounded-md p-3 cursor-pointer hover-elevate transition-all"
                  onClick={() => setSelectedSubnet(r)}
                  data-testid={`subnet-card-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{r.range || r.subnet}</span>
                    <Badge className={r.isPrivate !== false ? "bg-blue-600 text-white dark:bg-blue-700" : "bg-orange-500 text-white dark:bg-orange-600"}>
                      {r.isPrivate !== false ? "Private" : "Public"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.assetCount || r.deviceCount || 0} assets
                  </p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>Utilization</span>
                      <span>{utilization}%</span>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${utilization}%`,
                          backgroundColor: utilization > 80 ? "#ef4444" : utilization > 50 ? "#eab308" : "#22c55e"
                        }}
                      />
                    </div>
                  </div>
                  {hosts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {hosts.slice(0, 3).map((h: any, hi: number) => (
                        <span key={hi} className="text-[9px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">{typeof h === "string" ? h : h?.hostname || h?.name || h?.ip || String(h)}</span>
                      ))}
                      {hosts.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{hosts.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {ranges.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No subnets discovered yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-segmentation">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Network Segmentation & Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {segmentHealthScores.length > 0 ? (
              <div className="space-y-3">
                {segmentHealthScores.map((seg: any, idx: number) => (
                  <div key={idx} className="border rounded-md p-3" data-testid={`segment-${idx}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{seg.name || seg.segment || `Segment ${idx + 1}`}</span>
                      <div className="flex items-center gap-2">
                        {getHealthBadge(seg.healthScore)}
                        {seg.compliant ? (
                          <Badge className="bg-green-600 text-white dark:bg-green-700" data-testid={`compliance-pass-${idx}`}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Compliant
                          </Badge>
                        ) : (
                          <Badge className="bg-red-600 text-white dark:bg-red-700" data-testid={`compliance-fail-${idx}`}>
                            <XCircle className="w-3 h-3 mr-1" /> Non-Compliant
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Health: {seg.healthScore}/100</span>
                      <span>Anomalies: {seg.anomalyCount}</span>
                      <span>Devices: {seg.deviceCount || seg.assetCount || (seg.devices || seg.assets || []).length || 0}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${seg.healthScore}%`,
                          backgroundColor: seg.healthScore >= 80 ? "#22c55e" : seg.healthScore >= 50 ? "#eab308" : "#ef4444"
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No segmentation data available.</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-rogue-devices">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" />
              Rogue Device Detection
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">Devices in anomalies not found in known inventory</p>
          </CardHeader>
          <CardContent>
            {rogueDevices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rogueDevices.slice(0, 20).map((d, idx) => (
                    <TableRow key={idx} data-testid={`rogue-device-${idx}`}>
                      <TableCell className="font-mono text-xs">{d.hostname}</TableCell>
                      <TableCell className="font-mono text-xs">{d.ipAddress || "-"}</TableCell>
                      <TableCell>
                        <Badge className={
                          d.severity === "critical" ? "bg-red-600 text-white dark:bg-red-700" :
                          d.severity === "high" ? "bg-orange-500 text-white dark:bg-orange-600" :
                          d.severity === "medium" ? "bg-yellow-500 text-white dark:bg-yellow-600" :
                          "bg-muted text-muted-foreground"
                        }>
                          {d.severity || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.type?.replace(/_/g, " ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
                <p className="text-sm">No rogue devices detected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-ip-anomalies">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            IP Anomalies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sharedIpAnomalies.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Device Count</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Entities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sharedIpAnomalies.map((a: any, idx: number) => (
                  <TableRow key={idx} data-testid={`anomaly-row-${idx}`}>
                    <TableCell className="font-mono text-xs">{a.ipAddress}</TableCell>
                    <TableCell className="text-xs">{a.deviceCount}</TableCell>
                    <TableCell>
                      <Badge className={
                        a.severity === "critical" ? "bg-red-600 text-white dark:bg-red-700" :
                        a.severity === "high" ? "bg-orange-500 text-white dark:bg-orange-600" :
                        a.severity === "medium" ? "bg-yellow-500 text-white dark:bg-yellow-600" :
                        "bg-muted text-muted-foreground"
                      }>
                        {a.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getEntitiesArray(a).slice(0, 4).map((e: string, ei: number) => (
                          <Link key={ei} href={`/assets/${tenantId}/${encodeURIComponent(e)}`}>
                            <span className="text-[10px] font-mono text-primary underline cursor-pointer" data-testid={`anomaly-entity-${idx}-${ei}`}>{e}</span>
                          </Link>
                        ))}
                        {getEntitiesArray(a).length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{getEntitiesArray(a).length - 4} more</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
              <p className="text-sm">No IP anomalies detected</p>
            </div>
          )}
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}