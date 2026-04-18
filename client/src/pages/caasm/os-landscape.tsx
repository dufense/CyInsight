import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Monitor, Layers, HardDrive, FileWarning, AlertTriangle, Clock, Shield, TrendingUp, Activity, FileDown, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ChartExportButton, useChartExportRef, ExpandableChartWrapper } from "@/components/ui/chart-export-button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Sector, LabelList } from "recharts";
import { ChartTypeSelector, FlexibleChart } from "@/components/ui/chart-type-selector";
import { StatCard, RichTooltip, CHART_COLORS } from "./shared";

interface OSVersion {
  name: string;
  count: number;
  avgRisk: number;
  isEOL: boolean;
  eolStatus: string;
  osFamily: string;
}

interface OSFamily {
  name: string;
  count: number;
  percentage: number;
}

function estimateCveCount(avgRisk: number, isEOL: boolean): number {
  const base = Math.round(avgRisk * 1.5);
  return isEOL ? base + Math.round(avgRisk * 0.8) : base;
}

function getKnownEolDate(name: string): Date | null {
  const lower = name.toLowerCase();
  if (lower.includes("windows 7") || lower.includes("win 7")) return new Date("2020-01-14");
  if (lower.includes("windows 8") || lower.includes("win 8")) return new Date("2023-01-10");
  if (lower.includes("windows 10") || lower.includes("win 10")) return new Date("2025-10-14");
  if (lower.includes("windows 11") || lower.includes("win 11")) return new Date("2027-10-14");
  if (lower.includes("windows server 2012")) return new Date("2023-10-10");
  if (lower.includes("windows server 2016")) return new Date("2027-01-12");
  if (lower.includes("windows server 2019")) return new Date("2029-01-09");
  if (lower.includes("windows server 2022")) return new Date("2031-10-14");
  if (lower.includes("ubuntu 18") || lower.includes("bionic")) return new Date("2023-05-31");
  if (lower.includes("ubuntu 20") || lower.includes("focal")) return new Date("2025-04-02");
  if (lower.includes("ubuntu 22") || lower.includes("jammy")) return new Date("2027-04-01");
  if (lower.includes("ubuntu 24") || lower.includes("noble")) return new Date("2029-04-01");
  if (lower.includes("centos 7")) return new Date("2024-06-30");
  if (lower.includes("centos 8")) return new Date("2021-12-31");
  if (lower.includes("rhel 7") || lower.includes("red hat 7")) return new Date("2024-06-30");
  if (lower.includes("rhel 8") || lower.includes("red hat 8")) return new Date("2029-05-31");
  if (lower.includes("rhel 9") || lower.includes("red hat 9")) return new Date("2032-05-31");
  if (lower.includes("debian 10") || lower.includes("buster")) return new Date("2024-06-30");
  if (lower.includes("debian 11") || lower.includes("bullseye")) return new Date("2026-06-30");
  if (lower.includes("debian 12") || lower.includes("bookworm")) return new Date("2028-06-30");
  if (lower.includes("macos 12") || lower.includes("monterey")) return new Date("2024-09-16");
  if (lower.includes("macos 13") || lower.includes("ventura")) return new Date("2025-09-15");
  if (lower.includes("macos 14") || lower.includes("sonoma")) return new Date("2026-09-15");
  if (lower.includes("macos 15") || lower.includes("sequoia")) return new Date("2027-09-15");
  if (lower.includes("amazon linux 2023")) return new Date("2028-03-15");
  if (lower.includes("amazon linux 2")) return new Date("2025-06-30");
  if (lower.includes("sles 15") || lower.includes("suse linux enterprise 15")) return new Date("2031-07-31");
  if (lower.includes("oracle linux 9") || lower.includes("ol9")) return new Date("2032-07-01");
  if (lower.includes("oracle linux 8") || lower.includes("ol8")) return new Date("2029-07-01");
  return null;
}

function getDaysUntilEol(date: Date): number {
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getRiskBadgeVariant(risk: number): string {
  if (risk >= 80) return "bg-red-600 text-white dark:bg-red-700";
  if (risk >= 60) return "bg-orange-500 text-white dark:bg-orange-600";
  if (risk >= 40) return "bg-yellow-500 text-white dark:bg-yellow-600";
  return "bg-green-500 text-white dark:bg-green-600";
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: any) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const displayPercent = `${(percent * 100).toFixed(0)}%`;
  const textAnchor = x > cx ? "start" : "end";

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      className="fill-foreground"
      fontSize={11}
      fontWeight={500}
    >
      {name} ({displayPercent})
    </text>
  );
}

const SEASONAL_FACTORS = [1.0, 0.97, 0.98, 1.0, 1.02, 1.01];
function generateTrendData(families: OSFamily[]) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  return months.map((month, i) => {
    const entry: Record<string, string | number> = { month };
    families.forEach((f) => {
      entry[f.name] = Math.round((f.count / 12) * SEASONAL_FACTORS[i]);
    });
    return entry;
  });
}

const FAMILY_COLORS: Record<string, string> = {
  'Windows': '#3b82f6',
  'Windows Server': '#2563eb',
  'Linux': '#f59e0b',
  'macOS': '#8b5cf6',
  'AIX': '#06b6d4',
  'VMware': '#6b7280',
  'HP-UX': '#ec4899',
  'Solaris': '#ef4444',
  'BSD': '#14b8a6',
  'Unknown': '#9ca3af',
  'Other': '#a1a1aa',
};

const STATUS_COLORS: Record<string, string> = {
  'active': '#22c55e',
  'inactive': '#f59e0b',
  'decommissioned': '#ef4444',
  'quarantined': '#a855f7',
};

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(amount * 255));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(amount * 255));
  const b = Math.min(255, (num & 0xff) + Math.round(amount * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(amount * 255));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(amount * 255));
  const b = Math.max(0, (num & 0xff) - Math.round(amount * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

interface SunburstFilter {
  family?: string;
  version?: string;
  status?: string;
  label: string;
}

interface SunburstFamily {
  name: string;
  count: number;
  versions: { name: string; count: number; statuses: { status: string; count: number }[] }[];
}

function SunburstTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-2.5 text-xs z-50">
      <p className="font-semibold mb-1">{data.name || data.label}</p>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: data.fill || payload[0]?.color }} />
        <span className="text-muted-foreground">Devices:</span>
        <span className="font-semibold">{data.value?.toLocaleString()}</span>
      </div>
      {data.percentage !== undefined && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full opacity-0" />
          <span className="text-muted-foreground">Share:</span>
          <span className="font-semibold">{data.percentage}%</span>
        </div>
      )}
      {data.ringLabel && (
        <p className="text-muted-foreground mt-1 text-[10px]">{data.ringLabel}</p>
      )}
    </div>
  );
}

function OSSunburstChart({ tenantId }: { tenantId: number }) {
  const sunburstExportRef = useChartExportRef();
  const [drillFilter, setDrillFilter] = useState<SunburstFilter | null>(null);
  const [drillPage, setDrillPage] = useState(1);

  const { data: sunburstData, isLoading } = useQuery<{ total: number; families: SunburstFamily[] }>({
    queryKey: ["/api/asset-inventory", tenantId, "os-sunburst"],
    queryFn: async () => {
      const r = await fetch(`/api/asset-inventory/${tenantId}/os-sunburst`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load sunburst data");
      return r.json();
    },
    retry: 1,
  });

  const queryParams = drillFilter
    ? new URLSearchParams({
        ...(drillFilter.family ? { family: drillFilter.family } : {}),
        ...(drillFilter.version ? { version: drillFilter.version } : {}),
        ...(drillFilter.status ? { status: drillFilter.status } : {}),
        page: String(drillPage),
        pageSize: '50',
      }).toString()
    : '';

  const { data: drillData, isLoading: drillLoading } = useQuery<{
    assets: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    queryKey: ["/api/asset-inventory", tenantId, "os-sunburst/assets", queryParams],
    queryFn: async () => {
      const r = await fetch(`/api/asset-inventory/${tenantId}/os-sunburst/assets?${queryParams}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load assets");
      return r.json();
    },
    enabled: !!drillFilter,
    retry: 1,
  });

  const handleDrill = useCallback((filter: SunburstFilter) => {
    setDrillFilter(filter);
    setDrillPage(1);
  }, []);

  const closeDrill = useCallback(() => {
    setDrillFilter(null);
    setDrillPage(1);
  }, []);

  if (isLoading || !sunburstData) {
    return (
      <Card data-testid="sunburst-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">OS Distribution Sunburst</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px]">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const { total, families } = sunburstData;

  const innerData = families.map(f => ({
    name: f.name,
    value: f.count,
    percentage: total > 0 ? Math.round((f.count / total) * 100) : 0,
    fill: FAMILY_COLORS[f.name] || CHART_COLORS[families.indexOf(f) % CHART_COLORS.length],
    ringLabel: 'OS Family — click to drill down',
  }));

  const middleData: any[] = [];
  families.forEach(f => {
    const baseColor = FAMILY_COLORS[f.name] || CHART_COLORS[families.indexOf(f) % CHART_COLORS.length];
    f.versions.forEach((v, vi) => {
      const shade = vi % 2 === 0 ? lightenColor(baseColor, 0.08 * vi) : darkenColor(baseColor, 0.06 * vi);
      middleData.push({
        name: v.name,
        value: v.count,
        family: f.name,
        percentage: total > 0 ? Math.round((v.count / total) * 100) : 0,
        fill: shade,
        ringLabel: `OS Version (${f.name}) — click to drill down`,
      });
    });
  });

  const outerData: any[] = [];
  families.forEach(f => {
    f.versions.forEach(v => {
      v.statuses.forEach(s => {
        outerData.push({
          name: `${v.name} — ${s.status}`,
          label: `${v.name} — ${s.status}`,
          value: s.count,
          family: f.name,
          version: v.name,
          status: s.status,
          percentage: total > 0 ? Math.round((s.count / total) * 100) : 0,
          fill: STATUS_COLORS[s.status] || '#9ca3af',
          ringLabel: `Status (${v.name}) — click to drill down`,
        });
      });
    });
  });

  return (
    <Card data-testid="sunburst-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">OS Distribution Sunburst</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Inner: OS Family · Middle: OS Version · Outer: Status — Click any segment to drill down
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
              </div>
            ))}
            <ChartExportButton title="OS Distribution Sunburst" chartRef={sunburstExportRef} />
          </div>
        </div>
      </CardHeader>
      <CardContent ref={sunburstExportRef}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="h-[440px] relative" data-testid="sunburst-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={innerData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={80}
                    onClick={(entry) => handleDrill({ family: entry.name, label: `${entry.name} (${entry.value.toLocaleString()} devices)` })}
                    style={{ cursor: 'pointer' }}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {innerData.map((d, i) => (
                      <Cell key={i} fill={d.fill} data-testid={`sunburst-family-${d.name}`} />
                    ))}
                  </Pie>
                  <Pie
                    data={middleData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={85}
                    outerRadius={140}
                    onClick={(entry) => handleDrill({ family: entry.family, version: entry.name, label: `${entry.name} (${entry.value.toLocaleString()} devices)` })}
                    style={{ cursor: 'pointer' }}
                    stroke="hsl(var(--background))"
                    strokeWidth={1}
                  >
                    {middleData.map((d, i) => (
                      <Cell key={i} fill={d.fill} data-testid={`sunburst-version-${i}`} />
                    ))}
                  </Pie>
                  <Pie
                    data={outerData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={145}
                    outerRadius={190}
                    onClick={(entry) => handleDrill({ family: entry.family, version: entry.version, status: entry.status, label: `${entry.version} — ${entry.status} (${entry.value.toLocaleString()} devices)` })}
                    style={{ cursor: 'pointer' }}
                    stroke="hsl(var(--background))"
                    strokeWidth={0.5}
                  >
                    {outerData.map((d, i) => (
                      <Cell key={i} fill={d.fill} data-testid={`sunburst-status-${i}`} />
                    ))}
                  </Pie>
                  <Tooltip content={<SunburstTooltip />} />
                  <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" className="fill-foreground" fontSize={28} fontWeight={700}>
                    {total.toLocaleString()}
                  </text>
                  <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize={11}>
                    Assets
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">OS Family Summary</h4>
            {families.map((f, i) => {
              const color = FAMILY_COLORS[f.name] || CHART_COLORS[i % CHART_COLORS.length];
              const pct = total > 0 ? Math.round((f.count / total) * 100) : 0;
              return (
                <button
                  key={f.name}
                  className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleDrill({ family: f.name, label: `${f.name} (${f.count.toLocaleString()} devices)` })}
                  data-testid={`sunburst-legend-${f.name}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                    <span className="text-xs font-medium">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{f.count.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {drillFilter && (
          <div className="mt-6 border-t pt-4" data-testid="sunburst-drilldown">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">{drillFilter.label}</h4>
              </div>
              <Button variant="ghost" size="sm" onClick={closeDrill} data-testid="sunburst-drilldown-close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {drillLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hostname</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Operating System</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Risk Score</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(drillData?.assets || []).map((asset: any) => (
                        <TableRow
                          key={asset.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => window.open(`/caasm?tab=devices&search=${encodeURIComponent(asset.hostname)}`, '_self')}
                          data-testid={`sunburst-asset-${asset.id}`}
                        >
                          <TableCell className="text-xs font-medium text-primary">{asset.hostname || '—'}</TableCell>
                          <TableCell className="text-xs font-mono">{asset.ip_address || '—'}</TableCell>
                          <TableCell className="text-xs">{asset.operating_system || 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${
                              asset.status === 'active' ? 'bg-green-600 text-white' :
                              asset.status === 'inactive' ? 'bg-yellow-500 text-white' :
                              asset.status === 'decommissioned' ? 'bg-red-600 text-white' :
                              'bg-gray-500 text-white'
                            }`}>
                              {asset.status || 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 bg-muted rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    asset.risk_score >= 80 ? 'bg-red-500' :
                                    asset.risk_score >= 60 ? 'bg-orange-500' :
                                    asset.risk_score >= 40 ? 'bg-yellow-500' :
                                    'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(100, asset.risk_score)}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono">{asset.risk_score}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {asset.last_seen ? new Date(asset.last_seen).toLocaleDateString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!drillData?.assets || drillData.assets.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                            No assets found for this filter
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {drillData && drillData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">
                      Showing {((drillPage - 1) * drillData.pageSize) + 1}–{Math.min(drillPage * drillData.pageSize, drillData.total)} of {drillData.total.toLocaleString()} assets
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={drillPage <= 1}
                        onClick={() => setDrillPage(p => p - 1)}
                        data-testid="drilldown-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-xs px-2">Page {drillPage} of {drillData.totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={drillPage >= drillData.totalPages}
                        onClick={() => setDrillPage(p => p + 1)}
                        data-testid="drilldown-next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const OS_SANKEY_COLORS: Record<string, string[]> = {
  family: ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"],
  version: ["#60a5fa", "#f87171", "#4ade80", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6", "#94a3b8", "#2dd4bf", "#fb923c"],
};

function OSSankey({ data }: { data: any }) {
  const { nodes, links, layerOrder, layerLabels } = data;

  if (!nodes?.length || !links?.length) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground">No OS flow data available</p>
      </div>
    );
  }

  const versionCount = nodes.filter((n: any) => n.layer === "version").length;
  const width = 1200;
  const height = Math.max(300, Math.min(1200, versionCount * 26));
  const leftPad = 180;
  const rightPad = 200;
  const topPad = 40;
  const bottomPad = 30;
  const nodeWidth = 18;
  const nodePadding = 4;

  const layers: Record<string, number[]> = {};
  nodes.forEach((n: any, i: number) => {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(i);
  });

  const activeLayerOrder = (layerOrder || ["family", "version"]).filter((l: string) => layers[l]?.length > 0);

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
    const colors = OS_SANKEY_COLORS[node.layer] || CHART_COLORS;
    return colors[posInLayer % colors.length];
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 600 }}>
        <defs>
          {sortedLinks.map((link: any, i: number) => (
            <linearGradient key={`og-${i}`} id={`os-sk-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
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
              key={`osl-${i}`}
              d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + tgtBandH} C${midX},${y1 + tgtBandH} ${midX},${y0 + srcBandH} ${x0},${y0 + srcBandH} Z`}
              fill={`url(#os-sk-grad-${i})`}
              opacity={0.6}
            >
              <title>{`${nodes[link.source].name} → ${nodes[link.target].name}: ${link.value} active devices`}</title>
            </path>
          );
        })}

        {nodes.map((node: any, idx: number) => {
          const pos = layerPositions[idx];
          if (!pos) return null;
          const color = getNodeColor(idx);
          const isLeft = node.layer === activeLayerOrder[0];
          const maxChars = isLeft ? 28 : 35;
          const displayName = node.name.length > maxChars ? node.name.substring(0, maxChars) + "..." : node.name;
          const val = Math.max(outgoing.get(idx) || 0, incoming.get(idx) || 0);
          return (
            <g key={`osn-${idx}`}>
              <rect x={pos.x} y={pos.y} width={nodeWidth} height={pos.h} fill={color} rx={3} ry={3}>
                <title>{`${node.name}: ${val} active devices`}</title>
              </rect>
              {pos.h > 8 && (
                <text
                  x={isLeft ? pos.x - 4 : pos.x + nodeWidth + 4}
                  y={pos.y + pos.h / 2}
                  textAnchor={isLeft ? "end" : "start"}
                  dominantBaseline="middle"
                  className="fill-foreground text-[10px]"
                >
                  {displayName} ({val})
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
            <text key={`oslbl-${layer}`} x={x} y={topPad - 16} textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function OSLandscapeTab({ tenantId }: { tenantId: number }) {
  const familyDistRef = useChartExportRef();
  const topVersionsRef = useChartExportRef();
  const familyTrendRef = useChartExportRef();
  const versionMatrixRef = useChartExportRef();
  const statusDistRef = useChartExportRef();
  const activeByOsRef = useChartExportRef();
  const osSankeyRef = useChartExportRef();

  const [chartTypes, setChartTypes] = useState<Record<string, string>>({});
  const ct = (id: string, def: string) => chartTypes[id] || def;
  const setCt = (id: string, type: string) => setChartTypes(prev => ({ ...prev, [id]: type }));

  const { data: osData, isLoading: osLoading, isError: osError, refetch: refetchOs } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "os-landscape"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/os-landscape`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    retry: 1,
  });

  const { data: osSankeyData, isLoading: osSankeyLoading } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "os-sankey"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/os-sankey`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    retry: 1,
  });

  const { data: eolData, isLoading: eolLoading, isError: eolError, refetch: refetchEol } = useQuery<any>({
    queryKey: ["/api/asset-inventory", tenantId, "eol-software"],
    queryFn: async () => { const r = await fetch(`/api/asset-inventory/${tenantId}/eol-software`, { credentials: "include" }); if (!r.ok) throw new Error(await r.text().catch(() => "Failed")); return r.json(); },
    retry: 1,
  });

  if (osLoading || eolLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="os-landscape-loading">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (osError || eolError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="os-landscape-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">Unable to load OS Landscape data. Please try again.</p>
        <Button onClick={() => { refetchOs(); refetchEol(); }} size="sm" data-testid="os-landscape-retry">
          Retry
        </Button>
      </div>
    );
  }

  const versions: OSVersion[] = (osData?.versions || []).map((v: any) => ({
    name: v.osVersion,
    count: v.deviceCount,
    avgRisk: v.avgRisk,
    isEOL: v.eolStatus === "ended",
    eolStatus: v.eolStatus,
    osFamily: v.osFamily,
  }));

  const families: OSFamily[] = (osData?.familyDistribution || []).map((f: any) => ({
    name: f.family,
    count: f.count,
    percentage: f.percentage ?? f.percent ?? 0,
  }));

  const totalDevices = versions.reduce((sum, v) => sum + v.count, 0);
  const eolSummary = eolData?.summary || { totalEolProducts: 0, totalAffectedDevices: 0 };

  const supportedDevices = versions.filter(v => !v.isEOL).reduce((s, v) => s + v.count, 0);
  const patchCompliance = totalDevices > 0 ? Math.round((supportedDevices / totalDevices) * 100) : 0;

  const migrationItems = versions
    .map(v => ({ ...v, eolDate: getKnownEolDate(v.name), daysLeft: getKnownEolDate(v.name) ? getDaysUntilEol(getKnownEolDate(v.name)!) : null }))
    .filter(v => v.eolDate && v.daysLeft !== null && v.daysLeft > -365 * 3)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const linuxVersions = versions.filter(v => {
    const fam = v.osFamily?.toLowerCase() || "";
    return fam.includes("linux") || fam.includes("ubuntu") || fam.includes("centos") || fam.includes("rhel") || fam.includes("debian") || fam.includes("red hat") || fam.includes("suse");
  });

  const hardeningScores = families
    .filter(f => f.name !== "Unknown")
    .map(f => {
      const familyVersions = versions.filter(v => v.osFamily === f.name);
      const totalCount = familyVersions.reduce((s, v) => s + v.count, 0);
      const weightedScore = totalCount > 0
        ? familyVersions.reduce((s, v) => s + (100 - v.avgRisk) * v.count, 0) / totalCount
        : 0;
      return { family: f.name, score: Math.round(weightedScore), devices: totalCount };
    });

  const modernCount = versions.filter(v => !v.isEOL).reduce((s, v) => s + v.count, 0);
  const legacyCount = totalDevices - modernCount;
  const modernPct = totalDevices > 0 ? Math.round((modernCount / totalDevices) * 100) : 0;

  const statusDistribution: Array<{ name: string; value: number; color?: string }> = osData?.statusDistribution || [];

  const activeByOsMap: Record<string, number> = {};
  (osData?.versions || []).forEach((v: any) => {
    const family = v.osFamily || "Unknown";
    activeByOsMap[family] = (activeByOsMap[family] || 0) + (v.activeCount || 0);
  });
  const activeByOsData = Object.entries(activeByOsMap)
    .map(([name, value]) => ({ name, value, color: FAMILY_COLORS[name] }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const trendData = generateTrendData(families);

  const top10Versions = [...versions].sort((a, b) => b.count - a.count).slice(0, 10);

  const timelineItems = versions
    .map(v => ({ name: v.name, eolDate: getKnownEolDate(v.name), isEOL: v.isEOL }))
    .filter(v => v.eolDate !== null)
    .sort((a, b) => a.eolDate!.getTime() - b.eolDate!.getTime());

  const timelineMinDate = timelineItems.length > 0 ? timelineItems[0].eolDate!.getTime() : Date.now();
  const timelineMaxDate = timelineItems.length > 0 ? timelineItems[timelineItems.length - 1].eolDate!.getTime() : Date.now();
  const timelineRange = timelineMaxDate - timelineMinDate || 1;

  return (
    <div className="space-y-6" data-testid="os-landscape-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="OS Versions" value={versions.length} icon={Monitor} color="bg-blue-600" subtitle="Distinct versions detected" />
        <StatCard title="OS Families" value={families.length} icon={Layers} color="bg-purple-600" subtitle="Platform families" />
        <StatCard title="Total Devices" value={totalDevices.toLocaleString()} icon={HardDrive} color="bg-cyan-600" subtitle="Across all OS versions" />
        <StatCard title="EOL Software" value={eolSummary.totalEolProducts} icon={FileWarning} color="bg-red-600" subtitle={`${eolSummary.totalAffectedDevices} affected devices`} />
      </div>

      <OSSunburstChart tenantId={tenantId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="status-distribution-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Device Status Distribution</CardTitle>
            <ExpandableChartWrapper title="Device Status Distribution" actions={
              <>
                <ChartTypeSelector active={ct("statusDist", "donut")} onChange={(v) => setCt("statusDist", v)} />
                <ChartExportButton title="Device Status Distribution" chartRef={statusDistRef} />
              </>
            }>
              <FlexibleChart data={statusDistribution} chartType={ct("statusDist", "donut")} height={500} />
            </ExpandableChartWrapper>
          </CardHeader>
          <CardContent ref={statusDistRef}>
            <FlexibleChart data={statusDistribution} chartType={ct("statusDist", "donut")} height={280} />
          </CardContent>
        </Card>

        <Card data-testid="active-by-os-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Devices by OS</CardTitle>
            <ExpandableChartWrapper title="Active Devices by OS" actions={
              <>
                <ChartTypeSelector active={ct("activeByOs", "bar")} onChange={(v) => setCt("activeByOs", v)} />
                <ChartExportButton title="Active Devices by OS" chartRef={activeByOsRef} />
              </>
            }>
              <FlexibleChart data={activeByOsData} chartType={ct("activeByOs", "bar")} height={500} colors={FAMILY_COLORS} />
            </ExpandableChartWrapper>
          </CardHeader>
          <CardContent ref={activeByOsRef}>
            <FlexibleChart data={activeByOsData} chartType={ct("activeByOs", "bar")} height={280} colors={FAMILY_COLORS} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="patch-compliance-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patch Compliance</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-2xl font-bold" data-testid="text-patch-compliance">{patchCompliance}%</div>
              <div className={`px-2 py-0.5 rounded text-[10px] font-semibold ${patchCompliance >= 90 ? "bg-green-500/15 text-green-600 dark:text-green-400" : patchCompliance >= 70 ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                {patchCompliance >= 90 ? "Excellent" : patchCompliance >= 70 ? "Acceptable" : "Critical"}
              </div>
            </div>
            <Progress value={patchCompliance} className="h-2" />
            <p className="text-xs text-muted-foreground">{supportedDevices.toLocaleString()} of {totalDevices.toLocaleString()} devices on supported versions</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {families.filter(f => f.name !== "Unknown").slice(0, 4).map(f => {
                const fVersions = versions.filter(v => v.osFamily === f.name);
                const fSupported = fVersions.filter(v => !v.isEOL).reduce((s, v) => s + v.count, 0);
                const fTotal = fVersions.reduce((s, v) => s + v.count, 0);
                const fPct = fTotal > 0 ? Math.round((fSupported / fTotal) * 100) : 0;
                return (
                  <div key={f.name} className="text-[10px]" data-testid={`patch-family-${f.name}`}>
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="truncate text-muted-foreground">{f.name}</span>
                      <span className="font-mono font-semibold">{fPct}%</span>
                    </div>
                    <Progress value={fPct} className="h-1" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="modern-vs-legacy-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modern vs Legacy OS</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground">Modern</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-modern-count">{modernCount.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Legacy</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="text-legacy-count">{legacyCount.toLocaleString()}</p>
              </div>
            </div>
            <Progress value={modernPct} className="h-2" />
            <p className="text-xs text-muted-foreground">{modernPct}% running modern, supported OS</p>
          </CardContent>
        </Card>

        <Card data-testid="os-hardening-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OS Hardening Scores</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hardeningScores.map((h) => (
                <div key={h.family} className="flex items-center gap-2" data-testid={`hardening-${h.family}`}>
                  <span className="text-xs w-20 truncate" title={h.family}>{h.family}</span>
                  <div className="flex-1">
                    <Progress value={h.score} className="h-1.5" />
                  </div>
                  <span className="text-xs font-mono font-semibold w-8 text-right">{h.score}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="os-family-distribution-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OS Family Distribution</CardTitle>
            <ExpandableChartWrapper title="OS Family Distribution" actions={
              <>
                <ChartTypeSelector active={ct("familyDist", "pie")} onChange={(v) => setCt("familyDist", v)} />
                <ChartExportButton title="OS Family Distribution" chartRef={familyDistRef} />
              </>
            }>
              <FlexibleChart data={families.map(f => ({ name: f.name, value: f.count }))} chartType={ct("familyDist", "pie")} height={500} colorArray={CHART_COLORS} />
            </ExpandableChartWrapper>
          </CardHeader>
          <CardContent ref={familyDistRef}>
            {ct("familyDist", "pie") === "pie" ? (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={families} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={renderPieLabel} labelLine>
                      {families.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<RichTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <FlexibleChart
                data={families.map(f => ({ name: f.name, value: f.count }))}
                chartType={ct("familyDist", "pie")}
                height={340}
                colorArray={CHART_COLORS}
              />
            )}
          </CardContent>
        </Card>

        <Card data-testid="top-os-versions-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top OS Versions</CardTitle>
            <ExpandableChartWrapper title="Top OS Versions" actions={
              <>
                <ChartTypeSelector active={ct("topVersions", "bar")} onChange={(v) => setCt("topVersions", v)} />
                <ChartExportButton title="Top OS Versions" chartRef={topVersionsRef} />
              </>
            }>
              <FlexibleChart data={top10Versions.map((v, i) => ({ name: v.name, value: v.count, color: v.isEOL ? "#ef4444" : CHART_COLORS[i % CHART_COLORS.length] }))} chartType={ct("topVersions", "bar")} height={500} />
            </ExpandableChartWrapper>
          </CardHeader>
          <CardContent ref={topVersionsRef}>
            {ct("topVersions", "bar") === "bar" ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top10Versions} layout="vertical" margin={{ left: 100, right: 40, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={95} />
                    <Tooltip content={<RichTooltip />} />
                    <Bar dataKey="count" name="Devices" radius={[0, 4, 4, 0]}>
                      {top10Versions.map((v, i) => (
                        <Cell key={i} fill={v.isEOL ? "#ef4444" : CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                      <LabelList dataKey="count" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <FlexibleChart
                data={top10Versions.map((v, i) => ({ name: v.name, value: v.count, color: v.isEOL ? "#ef4444" : CHART_COLORS[i % CHART_COLORS.length] }))}
                chartType={ct("topVersions", "bar")}
                height={280}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="os-family-trend-chart">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">OS Family Trend</CardTitle>
          <ExpandableChartWrapper title="OS Family Trend" actions={
            <ChartExportButton title="OS Family Trend" chartRef={familyTrendRef} />
          }>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<RichTooltip />} />
                  {families.map((f, i) => (
                    <Area key={f.name} type="monotone" dataKey={f.name} stackId="1" fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ExpandableChartWrapper>
        </CardHeader>
        <CardContent ref={familyTrendRef}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<RichTooltip />} />
                {families.map((f, i) => (
                  <Area key={f.name} type="monotone" dataKey={f.name} stackId="1" fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {migrationItems.length > 0 && (
        <Card data-testid="eol-migration-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OS Migration Tracking</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {migrationItems.slice(0, 8).map((item, i) => {
                const days = item.daysLeft!;
                const isPast = days < 0;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 flex-wrap p-2 rounded-md bg-muted/30" data-testid={`migration-item-${i}`}>
                    <div className="flex items-center gap-2">
                      {isPast ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> : <Clock className="w-3.5 h-3.5 text-yellow-500" />}
                      <span className="text-xs font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{item.eolDate!.toLocaleDateString()}</span>
                      <Badge className={`text-[10px] ${isPast ? "bg-red-600 text-white dark:bg-red-700" : days < 180 ? "bg-yellow-500 text-white dark:bg-yellow-600" : "bg-green-500 text-white dark:bg-green-600"}`}>
                        {isPast ? `EOL ${Math.abs(days)}d ago` : `${days}d remaining`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{item.count} devices</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {timelineItems.length > 0 && (
        <Card data-testid="eol-timeline-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">EOL Countdown Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-24 mt-4">
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-muted-foreground/20" />
              <div
                className="absolute top-1/2 w-0.5 h-4 -translate-y-1/2 bg-primary"
                style={{ left: `${Math.max(0, Math.min(100, ((Date.now() - timelineMinDate) / timelineRange) * 100))}%` }}
                data-testid="timeline-now-marker"
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-primary font-semibold whitespace-nowrap">Now</span>
              </div>
              {timelineItems.map((item, i) => {
                const pct = ((item.eolDate!.getTime() - timelineMinDate) / timelineRange) * 100;
                const isPast = item.eolDate!.getTime() < Date.now();
                return (
                  <div
                    key={i}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${Math.max(1, Math.min(99, pct))}%`, top: i % 2 === 0 ? "0" : "55%" }}
                    data-testid={`timeline-marker-${i}`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${isPast ? "bg-red-500" : "bg-green-500"}`} />
                    <span className="text-[8px] text-muted-foreground mt-0.5 whitespace-nowrap max-w-[80px] truncate" title={item.name}>
                      {item.name.length > 12 ? item.name.slice(0, 12) + "..." : item.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="os-version-matrix">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">OS Version Matrix</CardTitle>
          <ExpandableChartWrapper title="OS Version Matrix" actions={
            <ChartExportButton title="OS Version Matrix" chartRef={versionMatrixRef} />
          }>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operating System</TableHead>
                    <TableHead className="text-right">Devices</TableHead>
                    <TableHead className="text-right">% of Fleet</TableHead>
                    <TableHead className="text-right">Avg Risk</TableHead>
                    <TableHead className="text-right">CVE Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v, i) => {
                    const fleetPct = totalDevices > 0 ? ((v.count / totalDevices) * 100).toFixed(1) : "0.0";
                    const cveEstimate = estimateCveCount(v.avgRisk, v.isEOL);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">{v.name}</TableCell>
                        <TableCell className="text-right text-xs">{v.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs">{fleetPct}%</TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-[10px] ${getRiskBadgeVariant(v.avgRisk)}`}>{v.avgRisk.toFixed(0)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-xs font-mono font-semibold ${cveEstimate > 100 ? "text-red-600 dark:text-red-400" : cveEstimate > 50 ? "text-orange-500" : "text-muted-foreground"}`}>
                            ~{cveEstimate}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${v.isEOL ? "bg-red-600 text-white dark:bg-red-700" : "bg-green-600 text-white dark:bg-green-700"}`}>
                            {v.isEOL ? "EOL" : "Supported"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-20">
                            <Progress value={parseFloat(fleetPct)} className="h-1.5" />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </ExpandableChartWrapper>
        </CardHeader>
        <CardContent ref={versionMatrixRef}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operating System</TableHead>
                  <TableHead className="text-right">Devices</TableHead>
                  <TableHead className="text-right">% of Fleet</TableHead>
                  <TableHead className="text-right">Avg Risk</TableHead>
                  <TableHead className="text-right">CVE Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v, i) => {
                  const fleetPct = totalDevices > 0 ? ((v.count / totalDevices) * 100).toFixed(1) : "0.0";
                  const cveEstimate = estimateCveCount(v.avgRisk, v.isEOL);
                  return (
                    <TableRow key={i} data-testid={`os-row-${i}`}>
                      <TableCell className="font-medium text-xs">{v.name}</TableCell>
                      <TableCell className="text-right text-xs">{v.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs">{fleetPct}%</TableCell>
                      <TableCell className="text-right">
                        <Badge className={`text-[10px] ${getRiskBadgeVariant(v.avgRisk)}`}>{v.avgRisk.toFixed(0)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-xs font-mono font-semibold ${cveEstimate > 100 ? "text-red-600 dark:text-red-400" : cveEstimate > 50 ? "text-orange-500" : "text-muted-foreground"}`} data-testid={`cve-risk-${i}`}>
                          ~{cveEstimate}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${v.isEOL ? "bg-red-600 text-white dark:bg-red-700" : "bg-green-600 text-white dark:bg-green-700"}`}>
                          {v.isEOL ? "EOL" : "Supported"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="w-20">
                          <Progress value={parseFloat(fleetPct)} className="h-1.5" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="os-sankey-card">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" /> Active Devices by OS — Family → Version Flow
          </CardTitle>
          <ExpandableChartWrapper title="Active Devices by OS Sankey" actions={
            <ChartExportButton chartRef={osSankeyRef} title="Active Devices by OS Sankey" />
          }>
            {osSankeyData && osSankeyData.nodes?.length > 0 ? (
              <OSSankey data={osSankeyData} />
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-muted-foreground">No OS flow data available</p>
              </div>
            )}
          </ExpandableChartWrapper>
        </CardHeader>
        <CardContent>
          <div ref={osSankeyRef}>
            {osSankeyLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : osSankeyData && osSankeyData.nodes?.length > 0 ? (
              <OSSankey data={osSankeyData} />
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-muted-foreground">No OS flow data available</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-6 mt-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} />
              <span className="text-muted-foreground">OS Family</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ background: "#06b6d4" }} />
              <span className="text-muted-foreground">OS Version</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {linuxVersions.length > 0 && (
        <Card data-testid="linux-kernel-table">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Linux Kernel/Build Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linux Version</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-right">Devices</TableHead>
                    <TableHead className="text-right">Avg Risk</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linuxVersions.map((v, i) => (
                    <TableRow key={i} data-testid={`linux-row-${i}`}>
                      <TableCell className="text-xs font-medium">{v.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.osFamily}</TableCell>
                      <TableCell className="text-right text-xs">{v.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={`text-[10px] ${getRiskBadgeVariant(v.avgRisk)}`}>{v.avgRisk.toFixed(0)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${v.isEOL ? "bg-red-600 text-white dark:bg-red-700" : "bg-green-600 text-white dark:bg-green-700"}`}>
                          {v.isEOL ? "EOL" : "Supported"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
