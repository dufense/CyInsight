import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AppWindow, Server, Users, Shield, AlertTriangle, Search,
  ChevronRight, Layers, Package, Activity, HardDrive, Monitor,
  Zap, Archive, RefreshCw, Loader2, Network, Database, Clock,
  CheckCircle2, XCircle, ArrowRight, BarChart3, Globe, Settings2,
  LayoutDashboard, Trash2, HelpCircle,
} from "lucide-react";
import { StatCard, RichTooltip, CHART_COLORS, RISK_COLORS } from "./shared";
import { ChartExportButton, useChartExportRef, ExpandableChartWrapper } from "@/components/ui/chart-export-button";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";

const AppMappingDashboard = lazy(() => import("@/pages/caasm/app-mapping-dashboard"));

interface SankeyNode {
  name: string;
  layer: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const LAYER_COLORS: Record<string, string[]> = {
  application: ["#06b6d4", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6", "#a855f7", "#f97316", "#84cc16", "#e879f9", "#22d3ee", "#fb923c", "#4ade80", "#3b82f6", "#10b981", "#8b5cf6"],
  os: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#a855f7", "#06b6d4"],
  server: ["#94a3b8", "#64748b", "#78716c", "#a1a1aa", "#9ca3af", "#6b7280", "#71717a", "#737373"],
};

function AlluvialDiagram({ data }: { data: SankeyData }) {
  const { nodes, links } = data;

  if (!nodes.length || !links.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">No flow data available</p>
      </div>
    );
  }

  const serverCount = nodes.filter(n => n.layer === "server").length;
  const width = 1200;
  const height = Math.max(400, Math.min(2500, Math.max(serverCount * 18, nodes.length * 14)));
  const leftPad = 180;
  const rightPad = 180;
  const topPad = 40;
  const bottomPad = 40;
  const nodeWidth = 18;
  const nodePadding = serverCount > 50 ? 2 : 4;

  const layers: Record<string, number[]> = {};
  nodes.forEach((n, i) => {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(i);
  });

  const layerOrder = ["application", "os", "server"];
  const activeLayerOrder = layerOrder.filter(l => layers[l]?.length > 0);

  const layerX: Record<string, number> = {};
  const usableWidth = width - leftPad - rightPad - nodeWidth;
  activeLayerOrder.forEach((layer, i) => {
    layerX[layer] = leftPad + (usableWidth / Math.max(1, activeLayerOrder.length - 1)) * i;
  });

  const nodeValues = new Array(nodes.length).fill(0);
  links.forEach(l => {
    nodeValues[l.source] = Math.max(nodeValues[l.source], nodeValues[l.source] || 0);
    nodeValues[l.target] = Math.max(nodeValues[l.target], nodeValues[l.target] || 0);
  });

  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  links.forEach(l => {
    outgoing.set(l.source, (outgoing.get(l.source) || 0) + l.value);
    incoming.set(l.target, (incoming.get(l.target) || 0) + l.value);
  });

  const nodeHeights = nodes.map((_, i) => Math.max(outgoing.get(i) || 0, incoming.get(i) || 0));

  const layerPositions: Record<number, { x: number; y: number; h: number }> = {};

  for (const layer of activeLayerOrder) {
    const nodeIndices = layers[layer] || [];
    const totalValue = nodeIndices.reduce((s, i) => s + nodeHeights[i], 0);
    const availableHeight = height - topPad - bottomPad - (nodeIndices.length - 1) * nodePadding;
    const scale = totalValue > 0 ? availableHeight / totalValue : 1;

    let currentY = topPad;
    for (const idx of nodeIndices) {
      const h = Math.max(4, nodeHeights[idx] * scale);
      layerPositions[idx] = {
        x: layerX[layer],
        y: currentY,
        h,
      };
      currentY += h + nodePadding;
    }
  }

  const sourceOffsets = new Map<number, number>();
  const targetOffsets = new Map<number, number>();

  const sortedLinks = [...links].sort((a, b) => {
    const ay = layerPositions[a.target]?.y || 0;
    const by = layerPositions[b.target]?.y || 0;
    return ay - by;
  });

  const totalFlowValue = links.reduce((s, l) => s + l.value, 0);

  const getNodeColor = (idx: number): string => {
    const node = nodes[idx];
    const layerNodes = layers[node.layer] || [];
    const posInLayer = layerNodes.indexOf(idx);
    const colors = LAYER_COLORS[node.layer] || CHART_COLORS;
    return colors[posInLayer % colors.length];
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 600 }}>
        <defs>
          {sortedLinks.map((link, i) => (
            <linearGradient key={`grad-${i}`} id={`link-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={getNodeColor(link.source)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={getNodeColor(link.target)} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {sortedLinks.map((link, i) => {
          const srcPos = layerPositions[link.source];
          const tgtPos = layerPositions[link.target];
          if (!srcPos || !tgtPos) return null;

          const srcTotal = outgoing.get(link.source) || 1;
          const tgtTotal = incoming.get(link.target) || 1;

          const srcOffset = sourceOffsets.get(link.source) || 0;
          const tgtOffset = targetOffsets.get(link.target) || 0;

          const srcBandH = (link.value / srcTotal) * srcPos.h;
          const tgtBandH = (link.value / tgtTotal) * tgtPos.h;

          const x0 = srcPos.x + nodeWidth;
          const y0 = srcPos.y + srcOffset;
          const x1 = tgtPos.x;
          const y1 = tgtPos.y + tgtOffset;

          sourceOffsets.set(link.source, srcOffset + srcBandH);
          targetOffsets.set(link.target, tgtOffset + tgtBandH);

          const midX = (x0 + x1) / 2;

          const pct = totalFlowValue > 0 ? Math.round((link.value / totalFlowValue) * 100) : 0;

          return (
            <g key={`link-${i}`}>
              <path
                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tgtBandH} C${midX},${y1 + tgtBandH} ${midX},${y0 + srcBandH} ${x0},${y0 + srcBandH} Z`}
                fill={`url(#link-grad-${i})`}
                className="transition-opacity duration-200"
                opacity={0.6}
              >
                <title>{`${nodes[link.source].name} → ${nodes[link.target].name}: ${link.value} server${link.value !== 1 ? "s" : ""} (${pct}%)`}</title>
              </path>
              {srcBandH > 12 && tgtBandH > 12 && pct >= 3 && (
                <text
                  x={midX}
                  y={(y0 + srcBandH / 2 + y1 + tgtBandH / 2) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[9px] font-medium pointer-events-none"
                  opacity={0.7}
                >
                  {pct}%
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node, idx) => {
          const pos = layerPositions[idx];
          if (!pos) return null;
          const color = getNodeColor(idx);
          const isLeftLayer = node.layer === activeLayerOrder[0];
          const isRightLayer = node.layer === activeLayerOrder[activeLayerOrder.length - 1];

          return (
            <g key={`node-${idx}`}>
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={pos.h}
                fill={color}
                rx={3}
                ry={3}
                className="transition-opacity duration-200"
              >
                <title>{node.layer === "server" ? node.name : `${node.name}: ${Math.max(outgoing.get(idx) || 0, incoming.get(idx) || 0)} servers`}</title>
              </rect>
              {pos.h > (node.layer === "server" ? 6 : 10) && (
                <text
                  x={isLeftLayer ? pos.x - 4 : isRightLayer ? pos.x + nodeWidth + 4 : pos.x + nodeWidth + 4}
                  y={pos.y + pos.h / 2}
                  textAnchor={isLeftLayer ? "end" : "start"}
                  dominantBaseline="middle"
                  className={`fill-foreground pointer-events-none ${node.layer === "server" ? "text-[8px]" : "text-[10px]"}`}
                >
                  {node.layer === "server"
                    ? (node.name.length > 30 ? node.name.substring(0, 30) + "..." : node.name)
                    : (node.name.length > 35 ? node.name.substring(0, 35) + "..." : node.name)}
                </text>
              )}
            </g>
          );
        })}

        {activeLayerOrder.map((layer, i) => {
          const x = layerX[layer] + nodeWidth / 2;
          const labels: Record<string, string> = { application: "Application", os: "Operating System", server: "Servers" };
          return (
            <text
              key={`label-${layer}`}
              x={x}
              y={topPad - 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider"
            >
              {labels[layer] || layer}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface AppMapping {
  name: string;
  category: "Enterprise" | "Business" | "InfoSec" | "IT Operations" | "Unknown";
  confidence: number;
  servers: string[];
  owners: string[];
  supportGroups: string[];
  environments: string[];
  locations: string[];
  distributionLists: string[];
  monitoringTools: string[];
  serverCount: number;
  riskSummary?: {
    eolCount: number;
    unpatchedCount: number;
    highRiskCount: number;
  };
}

interface StakeholderView {
  name: string;
  role: "owner" | "manager" | "support_group" | "distribution_list";
  applications: string[];
  serverCount: number;
  environments: string[];
}

interface AppSummary {
  totalApplications: number;
  enterpriseCount: number;
  businessCount: number;
  infosecCount: number;
  unknownCount: number;
  totalServers: number;
  environmentBreakdown: Record<string, number>;
  topStakeholders: Array<{ name: string; applications: number; servers: number }>;
  riskDistribution: Record<string, number>;
  totalStakeholders: number;
}

interface WorkloadClassification {
  hostname: string;
  recommendation: "Rehost" | "Replatform" | "Retain" | "Retire";
  confidence: number;
  reasons: string[];
  quickWin: boolean;
}

interface AssessmentOverview {
  totalAssets: number;
  platformBreakdown: Record<string, number>;
  eolHeatmap: Array<{ product: string; version: string; status: string; count: number; eolDate: string | null }>;
  workloadSuitability: { rehost: number; replatform: number; retain: number; retire: number; quickWins: number };
  quickWinCandidates: WorkloadClassification[];
  licenseBaseline: Record<string, number>;
  networkSummary: { subnetCount: number; subnets: string[]; totalNICs: number };
  bcPosture: { drServers: number; backupTools: string[]; monitoredAssets: number; unmonitoredAssets: number };
  dependencyMap: Array<{ application: string; category: string; serverCount: number; servers: string[]; environments: string[]; owners: string[] }>;
  applications: AppMapping[];
  workloadClassifications: WorkloadClassification[];
}

const SUMMARY_SANKEY_COLORS: Record<string, string[]> = {
  category: ["#3b82f6", "#22c55e", "#ef4444", "#64748b", "#a855f7"],
  app: ["#06b6d4", "#0ea5e9", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#6366f1"],
};

function AppSummarySankey({ data }: { data: SankeyData }) {
  const { nodes, links, layerOrder, layerLabels } = data as any;

  if (!nodes?.length || !links?.length) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground">No summary data available</p>
      </div>
    );
  }

  const appCount = nodes.filter((n: any) => n.layer === "app").length;
  const width = 1200;
  const height = Math.max(300, Math.min(1200, appCount * 24));
  const leftPad = 200;
  const rightPad = 220;
  const topPad = 40;
  const bottomPad = 30;
  const nodeWidth = 18;
  const nodePadding = 4;

  const layers: Record<string, number[]> = {};
  nodes.forEach((n: any, i: number) => {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(i);
  });

  const activeLayerOrder = (layerOrder || ["category", "app"]).filter((l: string) => layers[l]?.length > 0);

  const layerX: Record<string, number> = {};
  const usableWidth = width - leftPad - rightPad - nodeWidth;
  activeLayerOrder.forEach((layer: string, i: number) => {
    layerX[layer] = leftPad + (usableWidth / Math.max(1, activeLayerOrder.length - 1)) * i;
  });

  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  links.forEach((l: any) => {
    outgoing.set(l.source, (outgoing.get(l.source) || 0) + l.value);
    incoming.set(l.target, (incoming.get(l.target) || 0) + l.value);
  });

  const nodeHeights = nodes.map((_: any, i: number) => Math.max(outgoing.get(i) || 0, incoming.get(i) || 0));

  const layerPositions: Record<number, { x: number; y: number; h: number }> = {};
  for (const layer of activeLayerOrder) {
    const nodeIndices = layers[layer] || [];
    const totalValue = nodeIndices.reduce((s: number, i: number) => s + nodeHeights[i], 0);
    const availableHeight = height - topPad - bottomPad - (nodeIndices.length - 1) * nodePadding;
    const scale = totalValue > 0 ? availableHeight / totalValue : 1;
    let currentY = topPad;
    for (const idx of nodeIndices) {
      const h = Math.max(4, nodeHeights[idx] * scale);
      layerPositions[idx] = { x: layerX[layer], y: currentY, h };
      currentY += h + nodePadding;
    }
  }

  const sourceOffsets = new Map<number, number>();
  const targetOffsets = new Map<number, number>();
  const sortedLinks = [...links].sort((a: any, b: any) => (layerPositions[a.target]?.y || 0) - (layerPositions[b.target]?.y || 0));

  const getNodeColor = (idx: number): string => {
    const node = nodes[idx];
    const layerNodes = layers[node.layer] || [];
    const posInLayer = layerNodes.indexOf(idx);
    const colors = SUMMARY_SANKEY_COLORS[node.layer] || CHART_COLORS;
    return colors[posInLayer % colors.length];
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 600 }}>
        <defs>
          {sortedLinks.map((link: any, i: number) => (
            <linearGradient key={`sg-${i}`} id={`sum-link-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={getNodeColor(link.source)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={getNodeColor(link.target)} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {sortedLinks.map((link: any, i: number) => {
          const srcPos = layerPositions[link.source];
          const tgtPos = layerPositions[link.target];
          if (!srcPos || !tgtPos) return null;
          const srcTotal = outgoing.get(link.source) || 1;
          const tgtTotal = incoming.get(link.target) || 1;
          const srcOffset = sourceOffsets.get(link.source) || 0;
          const tgtOffset = targetOffsets.get(link.target) || 0;
          const srcBandH = (link.value / srcTotal) * srcPos.h;
          const tgtBandH = (link.value / tgtTotal) * tgtPos.h;
          const x0 = srcPos.x + nodeWidth;
          const y0 = srcPos.y + srcOffset;
          const x1 = tgtPos.x;
          const y1 = tgtPos.y + tgtOffset;
          sourceOffsets.set(link.source, srcOffset + srcBandH);
          targetOffsets.set(link.target, tgtOffset + tgtBandH);
          const midX = (x0 + x1) / 2;
          return (
            <path
              key={`sl-${i}`}
              d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tgtBandH} C${midX},${y1 + tgtBandH} ${midX},${y0 + srcBandH} ${x0},${y0 + srcBandH} Z`}
              fill={`url(#sum-link-grad-${i})`}
              opacity={0.6}
            >
              <title>{`${nodes[link.source].name} → ${nodes[link.target].name}: ${link.value} servers`}</title>
            </path>
          );
        })}

        {nodes.map((node: any, idx: number) => {
          const pos = layerPositions[idx];
          if (!pos) return null;
          const color = getNodeColor(idx);
          const isLeft = node.layer === activeLayerOrder[0];
          const maxChars = isLeft ? 30 : 40;
          const displayName = node.name.length > maxChars ? node.name.substring(0, maxChars) + "..." : node.name;
          return (
            <g key={`sn-${idx}`}>
              <rect x={pos.x} y={pos.y} width={nodeWidth} height={pos.h} fill={color} rx={3} ry={3}>
                <title>{`${node.name}: ${Math.max(outgoing.get(idx) || 0, incoming.get(idx) || 0)} servers`}</title>
              </rect>
              {pos.h > 8 && (
                <text
                  x={isLeft ? pos.x - 4 : pos.x + nodeWidth + 4}
                  y={pos.y + pos.h / 2}
                  textAnchor={isLeft ? "end" : "start"}
                  dominantBaseline="middle"
                  className="fill-foreground text-[10px]"
                >
                  {displayName}
                  <title>{node.name}</title>
                </text>
              )}
            </g>
          );
        })}

        {activeLayerOrder.map((layer: string) => {
          const x = layerX[layer] + nodeWidth / 2;
          const label = layerLabels?.[layer] || layer.toUpperCase();
          return (
            <text key={`slbl-${layer}`} x={x} y={topPad - 16} textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

const APP_CATEGORIES = ["Business", "Enterprise", "InfoSec", "IT Operations", "Unknown"] as const;

function getCategoryBadge(category: string) {
  if (category === "Enterprise") return <Badge className="bg-blue-600 text-white dark:bg-blue-700 text-[10px]" data-testid={`badge-category-enterprise`}>Enterprise</Badge>;
  if (category === "Business") return <Badge className="bg-green-600 text-white dark:bg-green-700 text-[10px]" data-testid={`badge-category-business`}>Business</Badge>;
  if (category === "InfoSec") return <Badge className="bg-red-600 text-white dark:bg-red-700 text-[10px]" data-testid={`badge-category-infosec`}>InfoSec</Badge>;
  if (category === "IT Operations") return <Badge className="bg-slate-500 text-white dark:bg-slate-600 text-[10px]" data-testid={`badge-category-itops`}>IT Operations</Badge>;
  return <Badge variant="secondary" className="text-[10px]" data-testid={`badge-category-unknown`}>Unknown</Badge>;
}

function CategoryEditDropdown({ appName, currentCategory, tenantId, onClose }: {
  appName: string;
  currentCategory: string;
  tenantId: number;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async (category: string) => {
      await apiRequest("POST", `/api/applications/${tenantId}/category-overrides`, {
        appName,
        category,
      });
    },
    onSuccess: () => {
      globalQueryClient.invalidateQueries({ queryKey: ["/api/applications", tenantId] });
      globalQueryClient.invalidateQueries({ queryKey: ["/api/applications", tenantId, "summary"] });
      onClose();
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={dropdownRef} className="absolute z-50 mt-1 bg-popover border rounded-md shadow-lg p-1 min-w-[140px]" data-testid="category-edit-dropdown">
      {APP_CATEGORIES.map((cat) => (
        <button
          key={cat}
          className={`w-full text-left px-2 py-1.5 text-xs rounded-sm hover-elevate flex items-center gap-2 ${cat === currentCategory ? "font-semibold" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (cat !== currentCategory) {
              mutation.mutate(cat);
            } else {
              onClose();
            }
          }}
          disabled={mutation.isPending}
          data-testid={`category-option-${cat.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {getCategoryBadge(cat)}
          {cat === currentCategory && <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto" />}
        </button>
      ))}
      {mutation.isPending && (
        <div className="flex items-center justify-center py-1">
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function getWorkloadBadge(rec: string) {
  const map: Record<string, { color: string; icon: any }> = {
    Rehost: { color: "bg-blue-600 text-white dark:bg-blue-700", icon: RefreshCw },
    Replatform: { color: "bg-orange-500 text-white dark:bg-orange-600", icon: Layers },
    Retain: { color: "bg-purple-600 text-white dark:bg-purple-700", icon: Archive },
    Retire: { color: "bg-red-600 text-white dark:bg-red-700", icon: XCircle },
  };
  const cfg = map[rec] || { color: "bg-muted text-muted-foreground", icon: Activity };
  return <Badge className={`${cfg.color} text-[10px]`}>{rec}</Badge>;
}

function getEolStatusColor(status: string) {
  if (status === "ended") return "bg-red-500/80 dark:bg-red-600/80";
  if (status === "approaching") return "bg-yellow-500/80 dark:bg-yellow-600/80";
  return "bg-green-500/80 dark:bg-green-600/80";
}

function getEolStatusText(status: string) {
  if (status === "ended") return "End of Life";
  if (status === "approaching") return "Approaching EOL";
  return "Active";
}

function getRoleBadge(role: string) {
  const map: Record<string, string> = {
    owner: "bg-blue-600 text-white dark:bg-blue-700",
    support_group: "bg-purple-600 text-white dark:bg-purple-700",
    distribution_list: "bg-cyan-600 text-white dark:bg-cyan-700",
    manager: "bg-orange-500 text-white dark:bg-orange-600",
  };
  return <Badge className={`${map[role] || "bg-muted text-muted-foreground"} text-[10px]`}>{role.replace(/_/g, " ")}</Badge>;
}

const DECOM_BUCKET_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  decommissioned: { label: "Decommissioned", color: "text-red-500", bgColor: "bg-red-500", icon: XCircle },
  planned_lt_1yr: { label: "Planned < 1 Year", color: "text-amber-500", bgColor: "bg-amber-500", icon: Clock },
  planned_gt_1yr: { label: "Planned 1-2+ Years", color: "text-yellow-500", bgColor: "bg-yellow-500", icon: Clock },
  under_review: { label: "Under Review", color: "text-purple-500", bgColor: "bg-purple-500", icon: Search },
  planned_unknown: { label: "Planned (Timeline TBD)", color: "text-blue-500", bgColor: "bg-blue-500", icon: AlertTriangle },
};

function getDecomBadge(bucket: string) {
  const cfg = DECOM_BUCKET_CONFIG[bucket];
  if (!cfg) return <Badge variant="secondary" className="text-[10px]">{bucket}</Badge>;
  return <Badge className={`${cfg.bgColor} text-white text-[10px]`}>{cfg.label}</Badge>;
}

function DecommissionedDashboard({ data }: { data: any }) {
  const [searchFilter, setSearchFilter] = useState("");
  const [activeBucket, setActiveBucket] = useState<string>("all");

  const summary = data?.summary || {};
  const devices = data?.devices || {};

  const allDevices = useMemo(() => {
    const result: Array<any & { bucket: string }> = [];
    for (const [bucket, list] of Object.entries(devices)) {
      if (Array.isArray(list)) {
        for (const d of list) {
          result.push({ ...d, bucket });
        }
      }
    }
    return result;
  }, [devices]);

  const filtered = useMemo(() => {
    let items = activeBucket === "all" ? allDevices : allDevices.filter(d => d.bucket === activeBucket);
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      items = items.filter(d =>
        d.hostname?.toLowerCase().includes(q) ||
        d.applicationName?.toLowerCase().includes(q) ||
        d.owner?.toLowerCase().includes(q) ||
        d.operatingSystem?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allDevices, activeBucket, searchFilter]);

  const chartData = useMemo(() =>
    Object.entries(DECOM_BUCKET_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      value: summary[key] || 0,
      fill: key === "decommissioned" ? "#ef4444"
        : key === "planned_lt_1yr" ? "#f59e0b"
        : key === "planned_gt_1yr" ? "#eab308"
        : key === "under_review" ? "#8b5cf6"
        : "#3b82f6",
    })).filter(d => d.value > 0),
    [summary]
  );

  return (
    <div className="space-y-6" data-testid="decommissioned-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="decom-summary-cards">
        <Card className="cursor-pointer border-2 border-transparent hover:border-primary/30 transition-colors"
          onClick={() => setActiveBucket("all")}
          data-testid="decom-card-total">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{summary.total || 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
          </CardContent>
        </Card>
        {Object.entries(DECOM_BUCKET_CONFIG).map(([key, cfg]) => (
          <Card key={key}
            className={`cursor-pointer border-2 transition-colors ${activeBucket === key ? "border-primary" : "border-transparent hover:border-primary/30"}`}
            onClick={() => setActiveBucket(activeBucket === key ? "all" : key)}
            data-testid={`decom-card-${key}`}>
            <CardContent className="p-4 text-center">
              <div className={`w-8 h-8 rounded-full ${cfg.bgColor} flex items-center justify-center mx-auto mb-1`}>
                <cfg.icon className="w-4 h-4 text-white" />
              </div>
              <p className="text-2xl font-bold">{summary[key] || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{cfg.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Timeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={75}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {chartData.map((d, idx) => (
                      <Cell key={idx} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No data</div>
            )}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {chartData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-[10px]">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                  <span className="text-muted-foreground">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Decommission Timeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, idx) => (
                      <Cell key={idx} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Decommissioned Devices ({filtered.length})
            {activeBucket !== "all" && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                {DECOM_BUCKET_CONFIG[activeBucket]?.label || activeBucket}
              </Badge>
            )}
          </CardTitle>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search hostname, app, owner..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="pl-8"
              data-testid="input-search-decom"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Hostname</TableHead>
                  <TableHead className="text-xs">OS</TableHead>
                  <TableHead className="text-xs">Application</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Timeline</TableHead>
                  <TableHead className="text-xs">Datacenter</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((device, idx) => (
                  <TableRow key={`${device.hostname}-${idx}`} data-testid={`row-decom-${idx}`}>
                    <TableCell className="text-xs font-mono font-medium">{device.hostname}</TableCell>
                    <TableCell className="text-xs">{device.operatingSystem || "Unknown"}</TableCell>
                    <TableCell className="text-xs">{device.applicationName}</TableCell>
                    <TableCell>{getDecomBadge(device.bucket)}</TableCell>
                    <TableCell className="text-xs">{device.timeline}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{device.datacenter}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{device.owner}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 200 && (
              <p className="text-xs text-muted-foreground text-center py-2">Showing first 200 of {filtered.length} devices</p>
            )}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No decommissioned devices found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplicationInventoryTab({ tenantId }: { tenantId: number }) {
  const [mainTab, setMainTab] = useState("applications");
  const [appFilter, setAppFilter] = useState("");
  const [appViewMode, setAppViewMode] = useState<"application" | "stakeholder" | "category">("application");
  const [selectedApp, setSelectedApp] = useState<AppMapping | null>(null);
  const [editingCategoryApp, setEditingCategoryApp] = useState<string | null>(null);
  const [showAllSankeyCategories, setShowAllSankeyCategories] = useState(false);
  const { isAdmin } = useTenant();

  const sankeyCategories = showAllSankeyCategories
    ? "Business,Enterprise,InfoSec,IT Operations,Unknown"
    : "Business,Enterprise";

  const safeFetch = async (url: string) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) {
      const text = await r.text().catch(() => "Unknown error");
      throw new Error(text);
    }
    return r.json();
  };

  const { data: applications, isLoading: appsLoading, error: appsError } = useQuery<AppMapping[]>({
    queryKey: ["/api/applications", tenantId],
    queryFn: () => safeFetch(`/api/applications/${tenantId}`),
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useQuery<AppSummary>({
    queryKey: ["/api/applications", tenantId, "summary"],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/summary`),
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: stakeholders, isLoading: stakeholdersLoading, isError: stakeholdersError, refetch: refetchStakeholders } = useQuery<StakeholderView[]>({
    queryKey: ["/api/applications", tenantId, "stakeholders"],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/stakeholders`),
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: assessment, isLoading: assessmentLoading, isError: assessmentError, refetch: refetchAssessment } = useQuery<AssessmentOverview>({
    queryKey: ["/api/assessment", tenantId, "overview"],
    queryFn: () => safeFetch(`/api/assessment/${tenantId}/overview`),
    enabled: !!tenantId && mainTab === "assessment",
    retry: 1,
  });

  const { data: appServers } = useQuery<any[]>({
    queryKey: ["/api/applications", tenantId, selectedApp?.name, "servers"],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/${encodeURIComponent(selectedApp!.name)}/servers`),
    enabled: !!tenantId && !!selectedApp,
    retry: 1,
  });

  const { data: sankeyData, isLoading: sankeyLoading, isError: sankeyError, refetch: refetchSankey } = useQuery<SankeyData>({
    queryKey: ["/api/applications", tenantId, "sankey-data", sankeyCategories],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/sankey-data?categories=${encodeURIComponent(sankeyCategories)}`),
    enabled: !!tenantId,
    retry: 1,
  });

  const { data: appSummarySankeyData, isLoading: appSummarySankeyLoading } = useQuery<SankeyData>({
    queryKey: ["/api/applications", tenantId, "app-summary-sankey"],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/app-summary-sankey`),
    enabled: !!tenantId && mainTab === "sankey",
    retry: 1,
  });

  const appSummarySankeyRef = useChartExportRef();
  const sankeyDiagramRef = useChartExportRef();

  const { data: decomData, isLoading: decomLoading } = useQuery<any>({
    queryKey: ["/api/applications", tenantId, "decommissioned"],
    queryFn: () => safeFetch(`/api/applications/${tenantId}/decommissioned`),
    enabled: !!tenantId && mainTab === "decommissioned",
    retry: 1,
  });

  const filteredApps = useMemo(() => {
    if (!applications) return [];
    if (!appFilter) return applications;
    const q = appFilter.toLowerCase();
    return applications.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.owners.some(o => o.toLowerCase().includes(q))
    );
  }, [applications, appFilter]);

  const enterpriseApps = useMemo(() => filteredApps.filter(a => a.category === "Enterprise"), [filteredApps]);
  const businessApps = useMemo(() => filteredApps.filter(a => a.category === "Business"), [filteredApps]);
  const infosecApps = useMemo(() => filteredApps.filter(a => a.category === "InfoSec"), [filteredApps]);
  const itOpsApps = useMemo(() => filteredApps.filter(a => a.category === "IT Operations"), [filteredApps]);

  const isLoading = appsLoading || summaryLoading;

  const criticalError = appsError;

  if (criticalError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="app-inventory-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">Unable to load application inventory data. Please try again.</p>
        <Button onClick={() => { refetchSummary(); refetchStakeholders(); refetchAssessment(); refetchSankey(); }} size="sm" data-testid="app-inventory-retry">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="app-inventory-loading">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading application inventory...</p>
        </div>
      </div>
    );
  }

  const safeSummary = summary || { totalApplications: 0, enterpriseCount: 0, businessCount: 0, infosecCount: 0, itOpsCount: 0, unknownCount: 0, totalServers: 0, totalStakeholders: 0, riskDistribution: {}, environmentBreakdown: {}, topStakeholders: [] };

  const riskData = [
    { name: "Critical", value: safeSummary.riskDistribution?.critical || 0, color: RISK_COLORS.critical },
    { name: "High", value: safeSummary.riskDistribution?.high || 0, color: RISK_COLORS.high },
    { name: "Medium", value: safeSummary.riskDistribution?.medium || 0, color: RISK_COLORS.medium },
    { name: "Low", value: Math.max(0, safeSummary.riskDistribution?.low || 0), color: RISK_COLORS.low },
  ];

  const envData = Object.entries(safeSummary.environmentBreakdown || {}).map(([name, value]) => ({ name, count: value as number }));

  return (
    <div className="space-y-6" data-testid="application-inventory-tab">
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-3" data-testid="app-summary-cards">
        <StatCard title="Total Apps" value={safeSummary.totalApplications} icon={AppWindow} color="bg-blue-500" subtitle="Discovered applications" />
        <StatCard title="Enterprise" value={safeSummary.enterpriseCount} icon={Shield} color="bg-blue-600" subtitle="Infrastructure apps" />
        <StatCard title="Business" value={safeSummary.businessCount} icon={Package} color="bg-green-600" subtitle="Business applications" />
        <StatCard title="InfoSec" value={safeSummary.infosecCount} icon={Zap} color="bg-red-600" subtitle="Security tools" />
        <StatCard title="IT Operations" value={safeSummary.itOpsCount ?? 0} icon={Settings2} color="bg-slate-500" subtitle="IT Ops tools" />
        <StatCard title="Unknown" value={safeSummary.unknownCount ?? 0} icon={HelpCircle} color="bg-gray-400" subtitle="Uncategorized" />
        <StatCard title="Total Servers" value={safeSummary.totalServers} icon={Server} color="bg-purple-500" subtitle="Mapped servers" />
        <StatCard title="Stakeholders" value={safeSummary.totalStakeholders} icon={Users} color="bg-cyan-500" subtitle="Identified owners" />
        <StatCard title="Risk Alerts" value={(safeSummary.riskDistribution?.critical || 0) + (safeSummary.riskDistribution?.high || 0)} icon={AlertTriangle} color="bg-red-500" subtitle="Critical + High" />
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} data-testid="app-main-tabs">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="applications" data-testid="tab-applications">
            <AppWindow className="w-3.5 h-3.5 mr-1" />Application Inventory
          </TabsTrigger>
          <TabsTrigger value="sankey" data-testid="tab-sankey">
            <ArrowRight className="w-3.5 h-3.5 mr-1" />App-Server Mapping
          </TabsTrigger>
          <TabsTrigger value="app-mapping" data-testid="tab-app-mapping">
            <LayoutDashboard className="w-3.5 h-3.5 mr-1" />App Mapping
          </TabsTrigger>
          <TabsTrigger value="decommissioned" data-testid="tab-decommissioned">
            <Trash2 className="w-3.5 h-3.5 mr-1" />Decommissioned
          </TabsTrigger>
          <TabsTrigger value="assessment" data-testid="tab-assessment">
            <BarChart3 className="w-3.5 h-3.5 mr-1" />Infrastructure Assessment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4 mt-4">
          <div className="flex items-center gap-3 flex-wrap" data-testid="app-controls">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search applications, owners..."
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
                className="pl-9"
                data-testid="input-app-search"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant={appViewMode === "application" ? "default" : "outline"} onClick={() => setAppViewMode("application")} data-testid="button-view-by-app">
                <AppWindow className="w-3.5 h-3.5 mr-1" />By App
              </Button>
              <Button size="sm" variant={appViewMode === "stakeholder" ? "default" : "outline"} onClick={() => setAppViewMode("stakeholder")} data-testid="button-view-by-stakeholder">
                <Users className="w-3.5 h-3.5 mr-1" />By Stakeholder
              </Button>
              <Button size="sm" variant={appViewMode === "category" ? "default" : "outline"} onClick={() => setAppViewMode("category")} data-testid="button-view-by-category">
                <Layers className="w-3.5 h-3.5 mr-1" />By Category
              </Button>
            </div>
          </div>

          {appViewMode === "application" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card data-testid="app-table-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AppWindow className="w-4 h-4" /> Applications ({filteredApps.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Application</TableHead>
                            <TableHead className="text-xs">Category</TableHead>
                            <TableHead className="text-xs">Servers</TableHead>
                            <TableHead className="text-xs">Environment</TableHead>
                            <TableHead className="text-xs">Owner</TableHead>
                            <TableHead className="text-xs">Risk</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredApps.map((app, i) => (
                            <TableRow
                              key={i}
                              className="cursor-pointer"
                              onClick={() => setSelectedApp(app)}
                              data-testid={`app-row-${i}`}
                            >
                              <TableCell className="text-xs font-medium max-w-[200px] truncate">{app.name}</TableCell>
                              <TableCell>
                                <div className="relative">
                                  {isAdmin ? (
                                    <div
                                      className="cursor-pointer inline-block"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCategoryApp(editingCategoryApp === app.name ? null : app.name);
                                      }}
                                      data-testid={`category-edit-trigger-${i}`}
                                    >
                                      {getCategoryBadge(app.category)}
                                    </div>
                                  ) : (
                                    getCategoryBadge(app.category)
                                  )}
                                  {editingCategoryApp === app.name && (
                                    <CategoryEditDropdown
                                      appName={app.name}
                                      currentCategory={app.category}
                                      tenantId={tenantId}
                                      onClose={() => setEditingCategoryApp(null)}
                                    />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{app.serverCount}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {app.environments.slice(0, 2).map((env, j) => (
                                    <Badge key={j} variant="outline" className="text-[10px]">{env}</Badge>
                                  ))}
                                  {app.environments.length > 2 && <Badge variant="outline" className="text-[10px]">+{app.environments.length - 2}</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{app.owners[0] || "-"}</TableCell>
                              <TableCell>
                                {app.riskSummary && (app.riskSummary.highRiskCount > 0 || app.riskSummary.eolCount > 0) ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    {app.riskSummary.highRiskCount + app.riskSummary.eolCount}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">OK</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredApps.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No applications found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {selectedApp ? (
                  <Card data-testid="app-detail-panel">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AppWindow className="w-4 h-4" />
                        <span className="truncate">{selectedApp.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getCategoryBadge(selectedApp.category)}
                        <Badge variant="outline" className="text-[10px]">{selectedApp.confidence}% confidence</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">Servers</span>
                          <span className="font-medium">{selectedApp.serverCount}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">Environments</span>
                          <span className="font-medium">{selectedApp.environments.join(", ") || "-"}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Owners: </span>
                          <span className="font-medium">{selectedApp.owners.join(", ") || "-"}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Support Groups: </span>
                          <span className="font-medium">{selectedApp.supportGroups.join(", ") || "-"}</span>
                        </div>
                        {selectedApp.monitoringTools.length > 0 && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Monitoring: </span>
                            <span className="font-medium">{selectedApp.monitoringTools.join(", ")}</span>
                          </div>
                        )}
                        {selectedApp.riskSummary && (
                          <div className="space-y-1 pt-2 border-t">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Risk Summary</p>
                            <div className="flex items-center gap-3 text-xs">
                              <span>EOL: <strong>{selectedApp.riskSummary.eolCount}</strong></span>
                              <span>Unpatched: <strong>{selectedApp.riskSummary.unpatchedCount}</strong></span>
                              <span>High Risk: <strong>{selectedApp.riskSummary.highRiskCount}</strong></span>
                            </div>
                          </div>
                        )}
                      </div>

                      {appServers && appServers.length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Server List</p>
                          <div className="max-h-[200px] overflow-y-auto space-y-1">
                            {appServers.map((srv: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs p-1.5 rounded bg-muted/30" data-testid={`server-item-${i}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <Server className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="truncate font-medium">{srv.hostname}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge variant="outline" className="text-[9px]">{srv.operatingSystem?.split(" ").slice(0, 2).join(" ") || "N/A"}</Badge>
                                  {srv.riskLevel && (
                                    <Badge className={`text-[9px] ${srv.riskLevel === "critical" || srv.riskLevel === "high" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}>
                                      {srv.riskLevel}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button size="sm" variant="outline" className="w-full" onClick={() => setSelectedApp(null)} data-testid="button-close-detail">
                        Close Detail
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <Card data-testid="risk-distribution-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Risk Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie data={riskData.filter(d => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                              {riskData.filter(d => d.value > 0).map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip content={<RichTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex items-center justify-center gap-3 flex-wrap mt-1">
                          {riskData.map(r => (
                            <div key={r.name} className="flex items-center gap-1 text-[10px]">
                              <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                              <span className="text-muted-foreground">{r.name}</span>
                              <span className="font-medium">{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {envData.length > 0 && (
                      <Card data-testid="env-breakdown-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Environment Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {envData.slice(0, 6).map((env, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground truncate">{env.name}</span>
                                <span className="font-medium">{env.count} servers</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {appViewMode === "stakeholder" && (
            <Card data-testid="stakeholder-view-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" /> Stakeholder Responsibility Matrix
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stakeholdersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Stakeholder</TableHead>
                          <TableHead className="text-xs">Role</TableHead>
                          <TableHead className="text-xs">Applications</TableHead>
                          <TableHead className="text-xs">Servers</TableHead>
                          <TableHead className="text-xs">Environments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(stakeholders || []).map((sh, i) => (
                          <TableRow key={i} data-testid={`stakeholder-row-${i}`}>
                            <TableCell className="text-xs font-medium truncate max-w-[180px]">{sh.name}</TableCell>
                            <TableCell>{getRoleBadge(sh.role)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {sh.applications.slice(0, 2).map((a, j) => (
                                  <Badge key={j} variant="outline" className="text-[10px] max-w-[100px] truncate">{a}</Badge>
                                ))}
                                {sh.applications.length > 2 && <Badge variant="outline" className="text-[10px]">+{sh.applications.length - 2}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{sh.serverCount}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {sh.environments.slice(0, 2).map((e, j) => (
                                  <Badge key={j} variant="outline" className="text-[10px]">{e}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!stakeholders || stakeholders.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No stakeholder data available
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {appViewMode === "category" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card data-testid="enterprise-apps-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" /> Enterprise Applications ({enterpriseApps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {enterpriseApps.map((app, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedApp(app); setAppViewMode("application"); }}
                        data-testid={`enterprise-app-${i}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{app.name}</p>
                          <p className="text-[10px] text-muted-foreground">{app.serverCount} servers {app.owners[0] ? `· ${app.owners[0]}` : ""}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {enterpriseApps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No enterprise applications found</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="business-apps-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-green-500" /> Business Applications ({businessApps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {businessApps.map((app, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedApp(app); setAppViewMode("application"); }}
                        data-testid={`business-app-${i}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{app.name}</p>
                          <p className="text-[10px] text-muted-foreground">{app.serverCount} servers {app.owners[0] ? `· ${app.owners[0]}` : ""}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {businessApps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No business applications found</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="infosec-apps-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-red-500" /> InfoSec Applications ({infosecApps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {infosecApps.map((app, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedApp(app); setAppViewMode("application"); }}
                        data-testid={`infosec-app-${i}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{app.name}</p>
                          <p className="text-[10px] text-muted-foreground">{app.serverCount} servers {app.owners[0] ? `· ${app.owners[0]}` : ""}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {infosecApps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No InfoSec applications found</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="itops-apps-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-slate-500" /> IT Operations ({itOpsApps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {itOpsApps.map((app, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedApp(app); setAppViewMode("application"); }}
                        data-testid={`itops-app-${i}`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{app.name}</p>
                          <p className="text-[10px] text-muted-foreground">{app.serverCount} servers {app.owners[0] ? `· ${app.owners[0]}` : ""}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {itOpsApps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No IT Operations applications found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sankey" className="space-y-4 mt-4">
          <Card data-testid="sankey-diagram-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="w-4 h-4" /> Application → OS → Server Mapping
                {!showAllSankeyCategories && (
                  <Badge variant="outline" className="text-[10px] ml-1">Business & Enterprise only</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <label htmlFor="show-all-categories" className="text-xs text-muted-foreground cursor-pointer" data-testid="label-show-all-categories">
                  Show All Categories
                </label>
                <Switch
                  id="show-all-categories"
                  checked={showAllSankeyCategories}
                  onCheckedChange={setShowAllSankeyCategories}
                  data-testid="switch-show-all-categories"
                />
                <ExpandableChartWrapper title="Application → OS → Server Mapping" actions={<ChartExportButton chartRef={sankeyDiagramRef} title="Application OS Server Mapping" />}>
                  {sankeyData && sankeyData.nodes?.length > 0 && <AlluvialDiagram data={sankeyData} />}
                </ExpandableChartWrapper>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={sankeyDiagramRef}>
              {sankeyLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading flow diagram...</p>
                  </div>
                </div>
              ) : sankeyData && sankeyData.nodes?.length > 0 ? (
                <div data-testid="sankey-diagram">
                  <AlluvialDiagram data={sankeyData} />
                  <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ background: "#06b6d4" }} />
                      <span className="text-muted-foreground">Application</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ background: "#ef4444" }} />
                      <span className="text-muted-foreground">Operating System</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ background: "#94a3b8" }} />
                      <span className="text-muted-foreground">Server</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-2">
                    <Network className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No application mapping data available</p>
                    <p className="text-xs text-muted-foreground">Import infrastructure data to generate the flow diagram</p>
                  </div>
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="app-summary-sankey-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4" /> App Inventory Summary — Category → Application
              </CardTitle>
              <ExpandableChartWrapper title="App Inventory Summary — Category → Application" actions={<ChartExportButton chartRef={appSummarySankeyRef} title="App Inventory Summary Sankey" />}>
                {appSummarySankeyData && appSummarySankeyData.nodes?.length > 0 && <AppSummarySankey data={appSummarySankeyData} />}
              </ExpandableChartWrapper>
            </CardHeader>
            <CardContent>
              <div ref={appSummarySankeyRef}>
                {appSummarySankeyLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : appSummarySankeyData && appSummarySankeyData.nodes?.length > 0 ? (
                  <AppSummarySankey data={appSummarySankeyData} />
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <div className="text-center space-y-2">
                      <Network className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No application summary data available</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-6 mt-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} />
                  <span className="text-muted-foreground">Category</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ background: "#06b6d4" }} />
                  <span className="text-muted-foreground">Application</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="app-mapping" className="mt-4">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading app mapping dashboard...</p>
              </div>
            </div>
          }>
            <AppMappingDashboard tenantId={tenantId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="decommissioned" className="space-y-4 mt-4">
          {decomLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="decom-loading">
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading decommissioned devices...</p>
              </div>
            </div>
          ) : decomData ? (
            <DecommissionedDashboard data={decomData} />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-2">
                <Trash2 className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No decommissioned device data available</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assessment" className="space-y-4 mt-4">
          {assessmentLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="assessment-loading">
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading infrastructure assessment...</p>
              </div>
            </div>
          ) : assessment ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="assessment-summary-cards">
                <StatCard title="Total Assets" value={assessment.totalAssets} icon={HardDrive} color="bg-blue-500" />
                <StatCard title="EOL Items" value={assessment.eolHeatmap?.length || 0} icon={AlertTriangle} color="bg-red-500" />
                <StatCard title="Quick Wins" value={assessment.workloadSuitability?.quickWins || 0} icon={Zap} color="bg-green-500" />
                <StatCard title="Subnets" value={assessment.networkSummary?.subnetCount || 0} icon={Network} color="bg-purple-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card data-testid="platform-breakdown-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Monitor className="w-4 h-4" /> Platform Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(assessment.platformBreakdown || {}).length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={Object.entries(assessment.platformBreakdown).map(([name, count]) => ({ name: name.length > 18 ? name.substring(0, 18) + "..." : name, count }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<RichTooltip />} />
                          <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]}>
                            {Object.entries(assessment.platformBreakdown).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-8">No platform data available</p>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="workload-suitability-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Workload Suitability
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {assessment.workloadSuitability ? (() => {
                      const ws = assessment.workloadSuitability;
                      const wData = [
                        { name: "Rehost", value: ws.rehost, color: "#3b82f6" },
                        { name: "Replatform", value: ws.replatform, color: "#f97316" },
                        { name: "Retain", value: ws.retain, color: "#8b5cf6" },
                        { name: "Retire", value: ws.retire, color: "#ef4444" },
                      ].filter(d => d.value > 0);
                      const total = ws.rehost + ws.replatform + ws.retain + ws.retire;
                      return (
                        <div className="space-y-4">
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie data={wData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                                {wData.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip content={<RichTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Rehost", count: ws.rehost, color: "bg-blue-500", pct: total > 0 ? Math.round((ws.rehost / total) * 100) : 0 },
                              { label: "Replatform", count: ws.replatform, color: "bg-orange-500", pct: total > 0 ? Math.round((ws.replatform / total) * 100) : 0 },
                              { label: "Retain", count: ws.retain, color: "bg-purple-500", pct: total > 0 ? Math.round((ws.retain / total) * 100) : 0 },
                              { label: "Retire", count: ws.retire, color: "bg-red-500", pct: total > 0 ? Math.round((ws.retire / total) * 100) : 0 },
                            ].map(item => (
                              <div key={item.label} className="flex items-center gap-2 text-xs">
                                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                                <span className="text-muted-foreground">{item.label}</span>
                                <span className="font-medium">{item.count}</span>
                                <span className="text-[10px] text-muted-foreground">({item.pct}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : (
                      <p className="text-xs text-muted-foreground text-center py-8">No workload data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {assessment.eolHeatmap && assessment.eolHeatmap.length > 0 && (
                <Card data-testid="eol-heatmap-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> EOL Risk Heatmap
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))` }}>
                      {assessment.eolHeatmap.map((item, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-md ${getEolStatusColor(item.status)} text-white`}
                          data-testid={`eol-item-${i}`}
                        >
                          <p className="text-xs font-medium truncate">{item.product}</p>
                          <p className="text-[10px] opacity-90">{item.version && item.version !== 'Unknown' ? item.version : 'N/A'}</p>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[10px] font-medium">{getEolStatusText(item.status)}</span>
                            <span className="text-[10px]">{item.count} server{item.count !== 1 ? "s" : ""}</span>
                          </div>
                          {item.eolDate && <p className="text-[9px] opacity-75 mt-0.5">EOL: {item.eolDate}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {assessment.quickWinCandidates && assessment.quickWinCandidates.length > 0 && (
                <Card data-testid="quick-wins-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-500" /> Quick-Win Migration Candidates ({assessment.quickWinCandidates.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Hostname</TableHead>
                          <TableHead className="text-xs">Recommendation</TableHead>
                          <TableHead className="text-xs">Confidence</TableHead>
                          <TableHead className="text-xs">Reasons</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessment.quickWinCandidates.slice(0, 20).map((qw, i) => (
                          <TableRow key={i} data-testid={`quickwin-row-${i}`}>
                            <TableCell className="text-xs font-medium">{qw.hostname}</TableCell>
                            <TableCell>{getWorkloadBadge(qw.recommendation)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Progress value={qw.confidence} className="w-16 h-1.5" />
                                <span className="text-[10px] text-muted-foreground">{qw.confidence}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">{qw.reasons.join("; ")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {assessment.dependencyMap && assessment.dependencyMap.length > 0 && (
                <Card data-testid="dependency-map-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Application Dependency Map
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {assessment.dependencyMap.slice(0, 15).map((dep, i) => (
                        <div key={i} className="p-3 rounded bg-muted/30" data-testid={`dependency-item-${i}`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-medium truncate">{dep.application}</span>
                              {getCategoryBadge(dep.category)}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">{dep.serverCount} servers</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {dep.servers.slice(0, 5).map((srv, j) => (
                              <Badge key={j} variant="secondary" className="text-[9px]">{srv}</Badge>
                            ))}
                            {dep.servers.length > 5 && <Badge variant="secondary" className="text-[9px]">+{dep.servers.length - 5} more</Badge>}
                          </div>
                          {dep.owners.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">Owner: {dep.owners.join(", ")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="license-baseline-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="w-4 h-4" /> License Baseline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(assessment.licenseBaseline || {}).slice(0, 10).map(([os, count], i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs" data-testid={`license-item-${i}`}>
                          <span className="text-muted-foreground truncate">{os}</span>
                          <span className="font-medium shrink-0">{count as number}</span>
                        </div>
                      ))}
                      {Object.keys(assessment.licenseBaseline || {}).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No license data</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="network-summary-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Network className="w-4 h-4" /> Network Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Subnets Detected</span>
                      <span className="font-medium">{assessment.networkSummary?.subnetCount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Total NICs</span>
                      <span className="font-medium">{assessment.networkSummary?.totalNICs || 0}</span>
                    </div>
                    {assessment.networkSummary?.subnets && assessment.networkSummary.subnets.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-[10px] text-muted-foreground mb-1">Top Subnets</p>
                        <div className="flex flex-wrap gap-1">
                          {assessment.networkSummary.subnets.slice(0, 8).map((subnet, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">{subnet}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="bc-posture-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" /> BC Posture
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">DR Servers</span>
                      <span className="font-medium">{assessment.bcPosture?.drServers || 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Monitored</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{assessment.bcPosture?.monitoredAssets || 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Unmonitored</span>
                      <span className="font-medium text-red-600 dark:text-red-400">{assessment.bcPosture?.unmonitoredAssets || 0}</span>
                    </div>
                    {assessment.bcPosture?.backupTools && assessment.bcPosture.backupTools.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-[10px] text-muted-foreground mb-1">Backup Tools</p>
                        <div className="flex flex-wrap gap-1">
                          {assessment.bcPosture.backupTools.map((tool, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">{tool}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {assessment.discoveryFindings && (
                <Card data-testid="discovery-findings-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Search className="w-4 h-4" /> Discovery Findings & Visibility
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{assessment.discoveryFindings.totalDiscovered}</p>
                        <p className="text-[10px] text-muted-foreground">Total Discovered</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold text-green-600">{assessment.discoveryFindings.coverageScore}%</p>
                        <p className="text-[10px] text-muted-foreground">Monitoring Coverage</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{Object.keys(assessment.discoveryFindings.sourceBreakdown || {}).length}</p>
                        <p className="text-[10px] text-muted-foreground">Data Sources</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/30">
                        <p className="text-lg font-bold">{Object.keys(assessment.discoveryFindings.monitoringTools || {}).length}</p>
                        <p className="text-[10px] text-muted-foreground">Monitoring Tools</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium mb-2">Discovery Sources</p>
                        <div className="space-y-1.5">
                          {Object.entries(assessment.discoveryFindings.sourceBreakdown || {}).map(([source, count], i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate">{source}</span>
                              <span className="font-medium">{count as number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-2">Visibility Gaps</p>
                        <div className="space-y-1.5">
                          {assessment.discoveryFindings.visibilityGaps && Object.entries(assessment.discoveryFindings.visibilityGaps).map(([gap, count], i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{gap.replace(/([A-Z])/g, ' $1').replace(/^no /i, 'No ').trim()}</span>
                              <span className={`font-medium ${(count as number) > 0 ? 'text-amber-600' : 'text-green-600'}`}>{count as number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {assessment.workloadClassifications && assessment.workloadClassifications.length > 0 && (
                <Card data-testid="workload-detail-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Workload Classification Detail
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Hostname</TableHead>
                            <TableHead className="text-xs">Recommendation</TableHead>
                            <TableHead className="text-xs">Confidence</TableHead>
                            <TableHead className="text-xs">Quick Win</TableHead>
                            <TableHead className="text-xs">Reasons</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assessment.workloadClassifications.slice(0, 50).map((wc, i) => (
                            <TableRow key={i} data-testid={`workload-row-${i}`}>
                              <TableCell className="text-xs font-medium">{wc.hostname}</TableCell>
                              <TableCell>{getWorkloadBadge(wc.recommendation)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Progress value={wc.confidence} className="w-12 h-1.5" />
                                  <span className="text-[10px]">{wc.confidence}%</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {wc.quickWin ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">{wc.reasons.join("; ")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-2">
                <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No assessment data available</p>
                <p className="text-xs text-muted-foreground">Import infrastructure data to generate the assessment</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
