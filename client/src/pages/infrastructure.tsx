import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import type { InfrastructureLocation } from "@shared/schema";
import { CLOUD_PROVIDERS, REGIONAL_DCS, ASSET_TYPE_OPTIONS } from "@shared/schema";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import {
  Building2, Shield, Globe, Plus, Search,
  Edit2, Trash2, Server, Cloud, MapPin, Network, X, Link2, HardDrive, CheckCircle,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface TopoNode {
  id: string;
  label: string;
  type: "branch" | "network" | "system";
  infraType?: string;
  parentId?: string;
  deviceCount: number;
  cloudProvider?: string;
  isPrivate?: boolean;
  assetTypes?: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
  radius: number;
  collapsed: boolean;
}

interface TopoEdge {
  source: string;
  target: string;
  type: "branch-branch" | "branch-network" | "network-system";
}

interface TopoTooltip {
  x: number;
  y: number;
  node: TopoNode;
}

const INFRA_COLORS: Record<string, { fill: string; stroke: string; bg: string }> = {
  "on-prem": { fill: "#3b82f6", stroke: "#2563eb", bg: "rgba(59,130,246,0.12)" },
  cloud: { fill: "#a855f7", stroke: "#9333ea", bg: "rgba(168,85,247,0.12)" },
  hybrid: { fill: "#14b8a6", stroke: "#0d9488", bg: "rgba(20,184,166,0.12)" },
};

function buildGraphFromTopology(
  topologyTree: any[],
  locations: InfrastructureLocation[]
): { nodes: TopoNode[]; edges: TopoEdge[] } {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
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
    const branchRadius = Math.min(300, 120 + branchCount * 30);
    const bx = cx + branchRadius * Math.cos(angle);
    const by = cy + branchRadius * Math.sin(angle);
    const dc = item.node.deviceCount || 0;

    const branchNode: TopoNode = {
      id: item.node.id,
      label: item.node.label,
      type: "branch",
      infraType: item.infraType,
      deviceCount: dc,
      cloudProvider: item.node.cloudProvider,
      assetTypes: item.node.assetTypes,
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      radius: Math.max(28, Math.min(48, 28 + Math.sqrt(dc) * 3)),
      collapsed: false,
    };
    nodes.push(branchNode);

    const subnets = item.node.children || [];
    subnets.forEach((subnet: any, si: number) => {
      const sAngle = angle + ((si - (subnets.length - 1) / 2) * 0.35);
      const sRadius = branchRadius + 120 + si * 15;
      const sx = cx + sRadius * Math.cos(sAngle);
      const sy = cy + sRadius * Math.sin(sAngle);
      const sdc = subnet.deviceCount || 0;

      const networkNode: TopoNode = {
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
        radius: Math.max(16, Math.min(28, 16 + Math.sqrt(sdc) * 2)),
        collapsed: true,
      };
      nodes.push(networkNode);
      edges.push({ source: item.node.id, target: subnet.id, type: "branch-network" });

      const deviceTypes: Record<string, number> = {};
      (subnet.children || []).forEach((d: any) => {
        const dt = d.deviceType || d.os || "Unknown";
        deviceTypes[dt] = (deviceTypes[dt] || 0) + 1;
      });

      Object.entries(deviceTypes).forEach(([dt, count], di) => {
        const dAngle = sAngle + ((di - (Object.keys(deviceTypes).length - 1) / 2) * 0.2);
        const dRadius = sRadius + 80;
        const systemNode: TopoNode = {
          id: `${subnet.id}-sys-${di}`,
          label: `${dt} (${count})`,
          type: "system",
          infraType: item.infraType,
          parentId: subnet.id,
          deviceCount: count,
          x: cx + dRadius * Math.cos(dAngle),
          y: cy + dRadius * Math.sin(dAngle),
          vx: 0,
          vy: 0,
          radius: Math.max(10, Math.min(18, 10 + Math.sqrt(count))),
          collapsed: false,
        };
        nodes.push(systemNode);
        edges.push({ source: subnet.id, target: systemNode.id, type: "network-system" });
      });
    });
  });

  locations.forEach((loc) => {
    (loc.connectedLocationIds || []).forEach((cid) => {
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

function NetworkTopologyGraph({
  locations,
  tenantId,
}: {
  locations: InfrastructureLocation[];
  tenantId: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1000, h: 800 });
  const [tooltip, setTooltip] = useState<TopoTooltip | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, vx: 0, vy: 0 });
  const nodesRef = useRef<TopoNode[]>([]);
  const edgesRef = useRef<TopoEdge[]>([]);
  const [, forceRender] = useState(0);

  const { data: topoData } = useQuery<any>({
    queryKey: ["/api/infrastructure", tenantId, "topology"],
    queryFn: () =>
      fetch(`/api/infrastructure/${tenantId}/topology`, { credentials: "include" }).then((r) =>
        r.json()
      ),
    enabled: !!tenantId,
  });

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    nodesRef.current.forEach((n) => {
      if (n.type === "branch") {
        ids.add(n.id);
      } else if (n.type === "network") {
        const parent = nodesRef.current.find((p) => p.id === n.parentId);
        if (parent && !parent.collapsed) ids.add(n.id);
      } else if (n.type === "system") {
        const netParent = nodesRef.current.find((p) => p.id === n.parentId);
        if (netParent && !netParent.collapsed) {
          const branchParent = nodesRef.current.find((p) => p.id === netParent.parentId);
          if (branchParent && !branchParent.collapsed) ids.add(n.id);
        }
      }
    });
    return ids;
  }, [nodesRef.current, forceRender]);

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
    if (!topoData?.tree) return;
    const { nodes, edges } = buildGraphFromTopology(topoData.tree, locations);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    let tick = 0;
    const maxTicks = 150;
    const alpha = { value: 1 };

    function simulate() {
      if (tick >= maxTicks || alpha.value < 0.001) {
        forceRender((v) => v + 1);
        return;
      }
      alpha.value *= 0.97;
      const ns = nodesRef.current;
      const visible = new Set<string>();
      ns.forEach((n) => {
        if (n.type === "branch") visible.add(n.id);
        else if (n.type === "network") {
          const parent = ns.find((p) => p.id === n.parentId);
          if (parent && !parent.collapsed) visible.add(n.id);
        } else if (n.type === "system") {
          const netP = ns.find((p) => p.id === n.parentId);
          if (netP && !netP.collapsed) {
            const brP = ns.find((p) => p.id === netP.parentId);
            if (brP && !brP.collapsed) visible.add(n.id);
          }
        }
      });

      for (let i = 0; i < ns.length; i++) {
        if (!visible.has(ns[i].id)) continue;
        for (let j = i + 1; j < ns.length; j++) {
          if (!visible.has(ns[j].id)) continue;
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = ns[i].radius + ns[j].radius + 30;
          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * alpha.value * 0.3;
            const fx = dx * force;
            const fy = dy * force;
            if (!ns[i].fx) { ns[i].vx -= fx; ns[i].vy -= fy; }
            if (!ns[j].fx) { ns[j].vx += fx; ns[j].vy += fy; }
          }
        }
      }

      edgesRef.current.forEach((e) => {
        const src = ns.find((n) => n.id === e.source);
        const tgt = ns.find((n) => n.id === e.target);
        if (!src || !tgt || !visible.has(src.id) || !visible.has(tgt.id)) return;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist =
          e.type === "branch-branch" ? 200 : e.type === "branch-network" ? 120 : 80;
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
      forceRender((v) => v + 1);
      animFrameRef.current = requestAnimationFrame(simulate);
    }

    animFrameRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [topoData, locations]);

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.type === "branch" || node.type === "network") {
      node.collapsed = !node.collapsed;
      forceRender((v) => v + 1);
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId?: string) => {
      if (nodeId) {
        setDragNode(nodeId);
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (node) {
          node.fx = node.x;
          node.fy = node.y;
        }
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
        if (node) {
          node.x = x;
          node.y = y;
          node.fx = x;
          node.fy = y;
          forceRender((v) => v + 1);
        }
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
      if (node) {
        delete node.fx;
        delete node.fy;
      }
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
        w: Math.max(200, Math.min(4000, nw)),
        h: Math.max(160, Math.min(3200, nh)),
      });
    },
    [viewBox]
  );

  const zoomIn = () =>
    setViewBox((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      const nw = v.w * 0.8;
      const nh = v.h * 0.8;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });

  const zoomOut = () =>
    setViewBox((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      const nw = v.w * 1.25;
      const nh = v.h * 1.25;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });

  const resetView = () => setViewBox({ x: 0, y: 0, w: 1000, h: 800 });

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

  const getNodeColor = (node: TopoNode) => {
    const colors = INFRA_COLORS[node.infraType || "on-prem"] || INFRA_COLORS["on-prem"];
    return colors;
  };

  const nodes = nodesRef.current;
  const edgesList = edgesRef.current;

  if (!topoData?.tree || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm" data-testid="text-no-topology">
        No topology data available. Add infrastructure locations with IP ranges to generate the network graph.
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef} data-testid="network-topology-graph">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <Button size="icon" variant="outline" onClick={zoomIn} data-testid="button-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={zoomOut} data-testid="button-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={resetView} data-testid="button-reset-view">
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="absolute bottom-2 left-2 z-10 bg-card/90 backdrop-blur-sm border rounded-md p-3 text-[10px] space-y-1.5" data-testid="topology-legend">
        <div className="font-medium text-xs mb-1">Legend</div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={INFRA_COLORS["on-prem"].fill} /></svg>
            <span>On-Prem</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={INFRA_COLORS.cloud.fill} /></svg>
            <span>Cloud</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={INFRA_COLORS.hybrid.fill} /></svg>
            <span>Hybrid</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8"><circle cx="6" cy="4" r="3.5" fill="hsl(var(--foreground))" opacity="0.7" /><text x="14" y="6" fontSize="6" fill="hsl(var(--foreground))"></text></svg>
            <span>Branch (Location)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8"><circle cx="6" cy="4" r="2.5" fill="hsl(var(--foreground))" opacity="0.5" /></svg>
            <span>Network (Subnet)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8"><circle cx="6" cy="4" r="1.5" fill="hsl(var(--foreground))" opacity="0.3" /></svg>
            <span>System</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="hsl(var(--primary))" strokeWidth="2" /></svg>
            <span>Branch Link</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.3" /></svg>
            <span>Network Link</span>
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full bg-muted/20 rounded-lg border cursor-grab active:cursor-grabbing"
        style={{ height: 500 }}
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
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>

        {edgesList.map((edge) => {
          const src = nodes.find((n) => n.id === edge.source);
          const tgt = nodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;
          if (!visibleNodeIds.has(src.id) || !visibleNodeIds.has(tgt.id)) return null;

          const isHighlighted =
            hoveredNode && (connectedToHovered.has(src.id) && connectedToHovered.has(tgt.id));
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
            opacity = 0.25;
            strokeWidth = 1.2;
          } else {
            opacity = 0.15;
            dashArray = "3 3";
          }

          if (isHighlighted) {
            opacity = Math.min(1, opacity + 0.4);
            strokeWidth += 1;
          }
          if (isDimmed) opacity *= 0.3;

          return (
            <line
              key={`${edge.source}-${edge.target}`}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              opacity={opacity}
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

          let fillColor = colors.fill;
          let r = node.radius;
          let textSize = 9;
          let strokeW = 2;

          if (node.type === "network") {
            fillColor = colors.fill;
            textSize = 7;
            strokeW = 1.5;
          } else if (node.type === "system") {
            fillColor = colors.fill;
            textSize = 6;
            strokeW = 1;
          }

          const finalOpacity = isDimmed ? 0.2 : 1;
          const glowFilter = isHovered ? "url(#glow)" : "url(#shadow)";

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              style={{
                opacity: finalOpacity,
                transition: "opacity 0.2s ease",
                cursor: node.type === "branch" || node.type === "network" ? "pointer" : "default",
              }}
              onMouseEnter={(e) => handleNodeHover(node.id, e)}
              onMouseLeave={() => handleNodeHover(null)}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, node.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleNodeClick(node.id);
              }}
              data-testid={`node-${node.id}`}
            >
              <circle
                r={isHovered ? r + 3 : r}
                fill={colors.bg}
                stroke={fillColor}
                strokeWidth={strokeW}
                filter={glowFilter}
                className="transition-all duration-200"
              />

              {node.type === "branch" && (
                <>
                  {node.infraType === "cloud" ? (
                    <g transform="translate(-7,-10)">
                      <path d="M3 10c0 2.2 1.8 4 4 4h5c1.66 0 3-1.34 3-3 0-1.38-.93-2.53-2.2-2.87C12.28 6.34 10.58 5 8.5 5 6.07 5 4.06 6.76 3.5 9.09A3.99 3.99 0 0 0 3 10z"
                        fill={fillColor} opacity="0.9" />
                    </g>
                  ) : node.infraType === "hybrid" ? (
                    <g transform="translate(-7,-8)">
                      <path d="M2 8l5-6 5 6H9v5H5V8z" fill={fillColor} opacity="0.9" />
                      <circle cx="10" cy="11" r="3" fill={fillColor} opacity="0.7" />
                    </g>
                  ) : (
                    <g transform="translate(-6,-8)">
                      <rect x="0" y="0" width="12" height="4" rx="1" fill={fillColor} opacity="0.9" />
                      <rect x="0" y="5" width="12" height="4" rx="1" fill={fillColor} opacity="0.7" />
                      <rect x="0" y="10" width="12" height="4" rx="1" fill={fillColor} opacity="0.5" />
                    </g>
                  )}
                </>
              )}

              <text
                y={node.type === "branch" ? r + 14 : r + 10}
                textAnchor="middle"
                fill="hsl(var(--foreground))"
                fontSize={textSize}
                fontWeight={node.type === "branch" ? 600 : 400}
                style={{ pointerEvents: "none" }}
              >
                {node.label.length > 18 ? node.label.slice(0, 16) + "..." : node.label}
              </text>

              {node.type === "branch" && node.deviceCount > 0 && (
                <g transform={`translate(${r - 6}, ${-r + 2})`}>
                  <rect x="-4" y="-8" width={String(node.deviceCount).length * 7 + 8} height="14" rx="7" fill={fillColor} />
                  <text x={String(node.deviceCount).length * 3.5} y="2" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" style={{ pointerEvents: "none" }}>
                    {node.deviceCount}
                  </text>
                </g>
              )}

              {(node.type === "branch" || node.type === "network") && !node.collapsed && (
                <circle cx={r - 2} cy={r - 2} r="4" fill="hsl(var(--primary))" opacity="0.6">
                  <title>Click to collapse</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 bg-card border rounded-md shadow-lg p-3 text-xs max-w-[220px] pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          data-testid="topology-tooltip"
        >
          <div className="font-semibold mb-1">{tooltip.node.label}</div>
          <div className="text-muted-foreground space-y-0.5">
            <div>Type: {tooltip.node.type === "branch" ? "Location" : tooltip.node.type === "network" ? "Subnet" : "System"}</div>
            {tooltip.node.infraType && <div>Infra: {tooltip.node.infraType}</div>}
            {tooltip.node.cloudProvider && <div>Provider: {tooltip.node.cloudProvider}</div>}
            <div>Devices: {tooltip.node.deviceCount}</div>
            {tooltip.node.isPrivate !== undefined && <div>Network: {tooltip.node.isPrivate ? "Private" : "Public"}</div>}
            {tooltip.node.assetTypes && tooltip.node.assetTypes.length > 0 && (
              <div>Assets: {tooltip.node.assetTypes.join(", ")}</div>
            )}
            {(tooltip.node.type === "branch" || tooltip.node.type === "network") && (
              <div className="text-[9px] mt-1 opacity-70">Click to {tooltip.node.collapsed ? "expand" : "collapse"}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InfrastructurePage() {
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const [showDialog, setShowDialog] = useState(false);
  const [editLoc, setEditLoc] = useState<InfrastructureLocation | null>(null);
  const dashboardRef = useDashboardExportRef();

  const [formName, setFormName] = useState("");
  const [formInfraType, setFormInfraType] = useState<string>("on-prem");
  const [formCloudProvider, setFormCloudProvider] = useState<string>("");
  const [formRegionalDc, setFormRegionalDc] = useState<string>("");
  const [formPublicIps, setFormPublicIps] = useState("");
  const [formPrivateIps, setFormPrivateIps] = useState("");
  const [formAssetTypes, setFormAssetTypes] = useState<string[]>([]);
  const [formConnectedIds, setFormConnectedIds] = useState<number[]>([]);
  // Geo / office intelligence fields (power the threat map)
  const [formCity, setFormCity] = useState("");
  const [formCountryCode, setFormCountryCode] = useState("");
  const [formLatitude, setFormLatitude] = useState("");
  const [formLongitude, setFormLongitude] = useState("");
  const [formHostnameKeywords, setFormHostnameKeywords] = useState("");

  const tenantId = currentTenant?.id;

  const { data: locations = [], isLoading } = useQuery<InfrastructureLocation[]>({
    queryKey: ["/api/infrastructure", tenantId, "locations"],
    queryFn: () => fetch(`/api/infrastructure/${tenantId}/locations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/infrastructure/${tenantId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/infrastructure", tenantId, "locations"] });
      toast({ title: "Location created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/infrastructure/${tenantId}/locations/${editLoc?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/infrastructure", tenantId, "locations"] });
      toast({ title: "Location updated" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/infrastructure/${tenantId}/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/infrastructure", tenantId, "locations"] });
      toast({ title: "Location deleted" });
    },
  });

  function resetForm() {
    setShowDialog(false);
    setEditLoc(null);
    setFormName("");
    setFormInfraType("on-prem");
    setFormCloudProvider("");
    setFormRegionalDc("");
    setFormPublicIps("");
    setFormPrivateIps("");
    setFormAssetTypes([]);
    setFormConnectedIds([]);
    setFormCity("");
    setFormCountryCode("");
    setFormLatitude("");
    setFormLongitude("");
    setFormHostnameKeywords("");
  }

  function openEdit(loc: InfrastructureLocation) {
    setEditLoc(loc);
    setFormName(loc.name);
    setFormInfraType(loc.infraType);
    setFormCloudProvider(loc.cloudProvider || "");
    setFormRegionalDc(loc.regionalDc || "");
    setFormPublicIps((loc.publicIpRanges || []).join(", "));
    setFormPrivateIps((loc.privateIpRanges || []).join(", "));
    setFormAssetTypes(loc.assetTypes || []);
    setFormConnectedIds(loc.connectedLocationIds || []);
    setFormCity(loc.city || "");
    setFormCountryCode(loc.countryCode || "");
    setFormLatitude(loc.latitude != null ? String(loc.latitude) : "");
    setFormLongitude(loc.longitude != null ? String(loc.longitude) : "");
    setFormHostnameKeywords((loc.hostnameKeywords || []).join(", "));
    setShowDialog(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(formLatitude);
    const lon = parseFloat(formLongitude);
    const data = {
      name: formName,
      infraType: formInfraType,
      cloudProvider: (formInfraType === "cloud" || formInfraType === "hybrid") ? formCloudProvider || null : null,
      regionalDc: formCloudProvider === "Regional DC" ? formRegionalDc || null : null,
      publicIpRanges: formPublicIps.split(",").map(s => s.trim()).filter(Boolean),
      privateIpRanges: formPrivateIps.split(",").map(s => s.trim()).filter(Boolean),
      assetTypes: formAssetTypes,
      connectedLocationIds: formConnectedIds,
      city: formCity.trim() || null,
      countryCode: formCountryCode || null,
      latitude: isNaN(lat) ? null : lat,
      longitude: isNaN(lon) ? null : lon,
      hostnameKeywords: formHostnameKeywords.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    };
    if (editLoc) updateMutation.mutate(data);
    else createMutation.mutate(data);
  }

  function toggleAssetType(t: string) {
    setFormAssetTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function toggleConnected(id: number) {
    setFormConnectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const grouped = locations.reduce((acc: Record<string, InfrastructureLocation[]>, loc) => {
    const key = loc.infraType || "on-prem";
    if (!acc[key]) acc[key] = [];
    acc[key].push(loc);
    return acc;
  }, {});

  const infraTypeIcon = (t: string) => {
    if (t === "cloud") return <Cloud className="w-4 h-4 text-blue-500" />;
    if (t === "hybrid") return <Network className="w-4 h-4 text-purple-500" />;
    return <Server className="w-4 h-4 text-emerald-500" />;
  };

  const infraTypeLabel = (t: string) => {
    if (t === "cloud") return "Cloud";
    if (t === "hybrid") return "Hybrid";
    return "On-Premises";
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full" ref={dashboardRef}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-infrastructure-title">Infrastructure Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage infrastructure locations, IP ranges, and network topology
          </p>
        </div>
        <DashboardExportBar dashboardTitle="Infrastructure Management" containerRef={dashboardRef} />
      </div>

      <div className="flex items-center justify-between">
        {currentTenant && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs" data-testid="badge-infra-tenant">
              <Building2 className="w-3 h-3 mr-1" />
              {currentTenant.name}
            </Badge>
          </div>
        )}
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-location">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Location
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg mb-1">No Infrastructure Locations</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Define your infrastructure topology by adding locations. This data powers the network mindmap and helps with inventory planning.
            </p>
            <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-first-location">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Locations", value: locations.length, icon: MapPin, color: "text-primary" },
              { label: "IP Ranges Defined", value: locations.reduce((s, l) => s + (l.publicIpRanges?.length || 0) + (l.privateIpRanges?.length || 0), 0), icon: Network, color: "text-chart-2" },
              { label: "Connected Links", value: locations.reduce((s, l) => s + (l.connectedLocationIds?.length || 0), 0) / 2, icon: Link2, color: "text-chart-3" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold" data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{Math.round(Number(s.value))}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {Object.entries(grouped).map(([infraType, locs]) => (
            <div key={infraType}>
              <div className="flex items-center gap-2 mb-3">
                {infraTypeIcon(infraType)}
                <h3 className="font-semibold text-sm">{infraTypeLabel(infraType)}</h3>
                <Badge variant="secondary" className="text-xs">{locs.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locs.map(loc => (
                  <Card key={loc.id} className="hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {loc.name}
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)} data-testid={`button-edit-loc-${loc.id}`}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(loc.id)} data-testid={`button-delete-loc-${loc.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">{infraTypeLabel(loc.infraType)}</Badge>
                        {loc.cloudProvider && <Badge variant="secondary" className="text-[10px]">{loc.cloudProvider}</Badge>}
                        {loc.regionalDc && <Badge variant="secondary" className="text-[10px]">{loc.regionalDc}</Badge>}
                      </div>
                      {((loc.publicIpRanges?.length || 0) > 0 || (loc.privateIpRanges?.length || 0) > 0) && (
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          {(loc.publicIpRanges || []).length > 0 && (
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              <span>Public: {(loc.publicIpRanges || []).join(", ")}</span>
                            </div>
                          )}
                          {(loc.privateIpRanges || []).length > 0 && (
                            <div className="flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              <span>Private: {(loc.privateIpRanges || []).join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {(loc.city || loc.latitude != null) && (
                        <div className="text-[10px] text-blue-400/80 space-y-0.5 mt-1">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>
                              {[loc.city, loc.countryCode].filter(Boolean).join(", ")}
                              {loc.latitude != null && (
                                <span className="text-muted-foreground ml-1">
                                  ({Number(loc.latitude).toFixed(3)}, {Number(loc.longitude).toFixed(3)})
                                </span>
                              )}
                            </span>
                          </div>
                          {(loc.hostnameKeywords || []).length > 0 && (
                            <div className="text-[9px] text-muted-foreground">
                              Keywords: {(loc.hostnameKeywords || []).join(", ")}
                            </div>
                          )}
                        </div>
                      )}
                      {(loc.assetTypes || []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(loc.assetTypes || []).map(t => (
                            <Badge key={t} variant="outline" className="text-[9px] px-1.5 py-0">{t}</Badge>
                          ))}
                        </div>
                      )}
                      {(loc.connectedLocationIds || []).length > 0 && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          Connected to: {(loc.connectedLocationIds || []).map(cid => locations.find(l => l.id === cid)?.name || `#${cid}`).join(", ")}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="w-4 h-4" /> Network Topology
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-topology-info">
                Interactive - Drag, zoom, click to expand
              </Badge>
            </CardHeader>
            <CardContent>
              <NetworkTopologyGraph locations={locations} tenantId={tenantId!} />
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={v => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editLoc ? "Edit Location" : "Add Infrastructure Location"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Location Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Mumbai DC-1" required data-testid="input-loc-name" />
            </div>

            <div>
              <Label className="text-xs">Infrastructure Type</Label>
              <Select value={formInfraType} onValueChange={v => { setFormInfraType(v); setFormCloudProvider(""); setFormRegionalDc(""); }}>
                <SelectTrigger data-testid="select-infra-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on-prem">On-Premises</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="cloud">Cloud</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formInfraType === "cloud" || formInfraType === "hybrid") && (
              <div>
                <Label className="text-xs">Cloud Provider / DC Type</Label>
                <Select value={formCloudProvider} onValueChange={setFormCloudProvider}>
                  <SelectTrigger data-testid="select-cloud-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLOUD_PROVIDERS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                    <SelectItem value="Regional DC">Regional DC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formCloudProvider === "Regional DC" && (
              <div>
                <Label className="text-xs">Regional Datacenter</Label>
                <Select value={formRegionalDc} onValueChange={setFormRegionalDc}>
                  <SelectTrigger data-testid="select-regional-dc">
                    <SelectValue placeholder="Select DC" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONAL_DCS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Public IP Ranges (comma-separated CIDRs)</Label>
              <Input value={formPublicIps} onChange={e => setFormPublicIps(e.target.value)} placeholder="e.g. 203.0.113.0/24, 198.51.100.0/24" data-testid="input-public-ips" />
            </div>

            <div>
              <Label className="text-xs">Private IP Ranges (comma-separated CIDRs)</Label>
              <Input value={formPrivateIps} onChange={e => setFormPrivateIps(e.target.value)} placeholder="e.g. 10.0.0.0/16, 192.168.1.0/24" data-testid="input-private-ips" />
            </div>

            {/* ── Geo / Threat Map Intelligence ────────────────────── */}
            <div className="rounded-md border border-dashed border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
              <p className="text-[10px] text-blue-400 font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Threat Map Intelligence — powers office markers &amp; arc routing
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">City / Site Name</Label>
                  <Input
                    value={formCity}
                    onChange={e => setFormCity(e.target.value)}
                    placeholder="e.g. Nairobi"
                    data-testid="input-loc-city"
                  />
                </div>
                <div>
                  <Label className="text-xs">Country (ISO-2)</Label>
                  <Select value={formCountryCode} onValueChange={setFormCountryCode}>
                    <SelectTrigger data-testid="select-loc-country">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {[
                        ["AF","Afghanistan"],["AL","Albania"],["DZ","Algeria"],["AR","Argentina"],
                        ["AU","Australia"],["AT","Austria"],["AZ","Azerbaijan"],["BH","Bahrain"],
                        ["BD","Bangladesh"],["BE","Belgium"],["BR","Brazil"],["BG","Bulgaria"],
                        ["CM","Cameroon"],["CA","Canada"],["CL","Chile"],["CN","China"],
                        ["CO","Colombia"],["CD","D.R. Congo"],["HR","Croatia"],["CY","Cyprus"],
                        ["CZ","Czech Republic"],["DK","Denmark"],["EG","Egypt"],["ET","Ethiopia"],
                        ["FI","Finland"],["FR","France"],["GE","Georgia"],["DE","Germany"],
                        ["GH","Ghana"],["GR","Greece"],["HK","Hong Kong"],["HU","Hungary"],
                        ["IN","India"],["ID","Indonesia"],["IR","Iran"],["IQ","Iraq"],
                        ["IE","Ireland"],["IL","Israel"],["IT","Italy"],["CI","Ivory Coast"],
                        ["JP","Japan"],["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],
                        ["KW","Kuwait"],["LB","Lebanon"],["LY","Libya"],["LT","Lithuania"],
                        ["MY","Malaysia"],["MV","Maldives"],["MA","Morocco"],["MX","Mexico"],
                        ["NL","Netherlands"],["NZ","New Zealand"],["NG","Nigeria"],["NO","Norway"],
                        ["OM","Oman"],["PK","Pakistan"],["PE","Peru"],["PH","Philippines"],
                        ["PL","Poland"],["PT","Portugal"],["QA","Qatar"],["RO","Romania"],
                        ["RU","Russia"],["RW","Rwanda"],["SA","Saudi Arabia"],["SN","Senegal"],
                        ["RS","Serbia"],["SG","Singapore"],["ZA","South Africa"],["KR","South Korea"],
                        ["ES","Spain"],["LK","Sri Lanka"],["SD","Sudan"],["SE","Sweden"],
                        ["CH","Switzerland"],["SY","Syria"],["TW","Taiwan"],["TZ","Tanzania"],
                        ["TH","Thailand"],["TN","Tunisia"],["TR","Turkey"],["UG","Uganda"],
                        ["UA","Ukraine"],["AE","UAE"],["GB","United Kingdom"],["US","United States"],
                        ["UZ","Uzbekistan"],["VE","Venezuela"],["VN","Vietnam"],["YE","Yemen"],
                        ["ZM","Zambia"],["ZW","Zimbabwe"],
                      ].map(([code, name]) => (
                        <SelectItem key={code} value={code}>{name} ({code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    value={formLatitude}
                    onChange={e => setFormLatitude(e.target.value)}
                    placeholder="e.g. -1.286"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    data-testid="input-loc-latitude"
                  />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    value={formLongitude}
                    onChange={e => setFormLongitude(e.target.value)}
                    placeholder="e.g. 36.817"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    data-testid="input-loc-longitude"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Hostname Keywords (comma-separated)</Label>
                <Input
                  value={formHostnameKeywords}
                  onChange={e => setFormHostnameKeywords(e.target.value)}
                  placeholder="e.g. nrb, nbi, pkfnrb  (match hostnames like nrb-server-01)"
                  data-testid="input-loc-keywords"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Hostnames containing these keywords will route threat arcs to this office location.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-2 block">Asset Types at this Location</Label>
              <div className="flex flex-wrap gap-1.5">
                {ASSET_TYPE_OPTIONS.map(t => (
                  <Badge
                    key={t}
                    variant={formAssetTypes.includes(t) ? "default" : "outline"}
                    className="cursor-pointer text-[10px] hover:bg-primary/10 transition-colors"
                    onClick={() => toggleAssetType(t)}
                    data-testid={`badge-asset-type-${t.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {formAssetTypes.includes(t) && <CheckCircle className="w-2.5 h-2.5 mr-1" />}
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            {locations.length > 0 && (
              <div>
                <Label className="text-xs mb-2 block">Connected Locations</Label>
                <div className="flex flex-wrap gap-1.5">
                  {locations.filter(l => l.id !== editLoc?.id).map(l => (
                    <Badge
                      key={l.id}
                      variant={formConnectedIds.includes(l.id) ? "default" : "outline"}
                      className="cursor-pointer text-[10px] hover:bg-primary/10 transition-colors"
                      onClick={() => toggleConnected(l.id)}
                      data-testid={`badge-connect-${l.id}`}
                    >
                      {formConnectedIds.includes(l.id) && <Link2 className="w-2.5 h-2.5 mr-1" />}
                      {l.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-location">
                {editLoc ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
