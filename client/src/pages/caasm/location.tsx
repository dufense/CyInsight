import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MapPin, Server, AlertTriangle, Building2, ChevronDown, ChevronRight,
  Globe, Shield, Cloud, Activity, Network, Zap
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ScatterChart, Scatter, ZAxis, Legend
} from "recharts";
import { StatCard, RichTooltip, CHART_COLORS } from "./shared";

interface LocationData {
  location: string;
  count: number;
  avgRisk: number;
  topOs: string;
  subnetCount: number;
  critical: number;
  regions: string[];
}

const REGION_COORDS: Record<string, { x: number; y: number; label: string }> = {
  "us-east": { x: 250, y: 180, label: "US East" },
  "us-west": { x: 130, y: 180, label: "US West" },
  "us-central": { x: 190, y: 170, label: "US Central" },
  "ca-central": { x: 220, y: 140, label: "Canada" },
  "eu-west": { x: 430, y: 140, label: "EU West" },
  "eu-central": { x: 470, y: 145, label: "EU Central" },
  "eu-north": { x: 460, y: 110, label: "EU North" },
  "uk-south": { x: 420, y: 135, label: "UK South" },
  "ap-southeast": { x: 700, y: 260, label: "AP Southeast" },
  "ap-south": { x: 620, y: 220, label: "AP South" },
  "ap-northeast": { x: 740, y: 170, label: "AP Northeast" },
  "ap-east": { x: 710, y: 200, label: "AP East" },
  "me-south": { x: 550, y: 210, label: "Middle East" },
  "af-south": { x: 480, y: 320, label: "Africa South" },
  "sa-east": { x: 300, y: 330, label: "SA East" },
};

function matchRegionCoord(region: string): { x: number; y: number; label: string } | null {
  const r = region.toLowerCase();
  for (const [key, coords] of Object.entries(REGION_COORDS)) {
    if (r.includes(key)) return coords;
  }
  if (r.includes("virginia") || r.includes("ohio") || r.includes("n. virginia")) return REGION_COORDS["us-east"];
  if (r.includes("oregon") || r.includes("california")) return REGION_COORDS["us-west"];
  if (r.includes("ireland") || r.includes("paris") || r.includes("frankfurt")) return REGION_COORDS["eu-west"];
  if (r.includes("london")) return REGION_COORDS["uk-south"];
  if (r.includes("mumbai") || r.includes("india")) return REGION_COORDS["ap-south"];
  if (r.includes("singapore")) return REGION_COORDS["ap-southeast"];
  if (r.includes("tokyo") || r.includes("seoul") || r.includes("japan")) return REGION_COORDS["ap-northeast"];
  if (r.includes("sydney") || r.includes("australia")) return REGION_COORDS["ap-southeast"];
  if (r.includes("bahrain") || r.includes("dubai")) return REGION_COORDS["me-south"];
  if (r.includes("cape") || r.includes("johannesburg") || r.includes("africa")) return REGION_COORDS["af-south"];
  if (r.includes("sao") || r.includes("brazil")) return REGION_COORDS["sa-east"];
  return null;
}

function getCloudProvider(region: string): string | null {
  const r = region.toLowerCase();
  if (r.includes("aws") || r.match(/^(us|eu|ap|me|af|sa|ca)-(east|west|central|south|north|southeast|northeast)/)) return "aws";
  if (r.includes("azure") || r.includes("eastus") || r.includes("westeurope") || r.includes("centralindia")) return "azure";
  if (r.includes("gcp") || r.includes("gcloud") || r.includes("us-central1") || r.includes("europe-west")) return "gcp";
  return null;
}

function getComplianceBadges(location: string, regions: string[]): { label: string; color: string }[] {
  const badges: { label: string; color: string }[] = [];
  const combined = (location + " " + regions.join(" ")).toLowerCase();
  if (combined.includes("eu") || combined.includes("europe") || combined.includes("ireland") || combined.includes("frankfurt") || combined.includes("paris") || combined.includes("london")) {
    badges.push({ label: "GDPR", color: "bg-blue-600 text-white dark:bg-blue-700" });
  }
  if (combined.includes("us-west") || combined.includes("california") || combined.includes("us-ca")) {
    badges.push({ label: "CCPA", color: "bg-purple-600 text-white dark:bg-purple-700" });
  }
  if (combined.includes("india") || combined.includes("mumbai") || combined.includes("ap-south")) {
    badges.push({ label: "DPDP", color: "bg-orange-600 text-white dark:bg-orange-700" });
  }
  if (badges.length === 0) {
    badges.push({ label: "Compliant", color: "bg-green-600 text-white dark:bg-green-700" });
  }
  return badges;
}

function getRiskColor(avgRisk: number): string {
  if (avgRisk >= 80) return "#dc2626";
  if (avgRisk >= 60) return "#ef4444";
  if (avgRisk >= 40) return "#f97316";
  if (avgRisk >= 20) return "#eab308";
  return "#22c55e";
}

function getProviderBadgeStyle(provider: string): string {
  switch (provider) {
    case "aws": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "azure": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "gcp": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default: return "bg-muted text-muted-foreground";
  }
}

function WorldMapSVG({ locations }: { locations: LocationData[] }) {
  const [hoveredLoc, setHoveredLoc] = useState<string | null>(null);
  const maxCount = Math.max(...locations.map(l => l.count), 1);

  const markers: { x: number; y: number; loc: LocationData; label: string }[] = [];
  const seen = new Set<string>();

  for (const loc of locations) {
    for (const region of loc.regions) {
      const coord = matchRegionCoord(region);
      if (coord) {
        const key = `${coord.x}-${coord.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          markers.push({ x: coord.x, y: coord.y, loc, label: coord.label });
        }
      }
    }
    if (markers.length === 0 || !loc.regions.some(r => matchRegionCoord(r))) {
      const coord = matchRegionCoord(loc.location);
      if (coord) {
        const key = `${coord.x}-${coord.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          markers.push({ x: coord.x, y: coord.y, loc, label: coord.label });
        }
      }
    }
  }

  return (
    <svg viewBox="0 0 850 420" className="w-full h-full" data-testid="region-map-svg">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" opacity="0.4" />
        </pattern>
        <radialGradient id="glow-green" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-yellow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#eab308" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-orange" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-red" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="850" height="420" fill="hsl(var(--card))" rx="8" />
      <rect width="850" height="420" fill="url(#grid)" rx="8" />

      <ellipse cx="220" cy="200" rx="140" ry="120" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <ellipse cx="460" cy="200" rx="100" ry="130" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <ellipse cx="620" cy="230" rx="60" ry="80" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <ellipse cx="700" cy="220" rx="80" ry="100" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <ellipse cx="480" cy="310" rx="50" ry="60" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <ellipse cx="300" cy="330" rx="50" ry="50" fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />

      <text x="220" y="100" textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" opacity="0.5">Americas</text>
      <text x="460" y="80" textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" opacity="0.5">Europe / Africa</text>
      <text x="700" y="110" textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" opacity="0.5">Asia Pacific</text>

      {markers.map((m, i) => {
        const radius = 6 + (m.loc.count / maxCount) * 18;
        const color = getRiskColor(m.loc.avgRisk);
        const glowId = m.loc.avgRisk >= 60 ? "glow-red" : m.loc.avgRisk >= 40 ? "glow-orange" : m.loc.avgRisk >= 20 ? "glow-yellow" : "glow-green";
        const isHovered = hoveredLoc === m.loc.location;
        return (
          <g key={i}
            onMouseEnter={() => setHoveredLoc(m.loc.location)}
            onMouseLeave={() => setHoveredLoc(null)}
            style={{ cursor: "pointer" }}
            data-testid={`map-marker-${m.loc.location.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <circle cx={m.x} cy={m.y} r={radius + 12} fill={`url(#${glowId})`}>
              <animate attributeName="r" values={`${radius + 8};${radius + 16};${radius + 8}`} dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx={m.x} cy={m.y} r={radius + 4} fill={color} opacity="0.15">
              <animate attributeName="r" values={`${radius + 2};${radius + 8};${radius + 2}`} dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx={m.x} cy={m.y} r={radius} fill={color} opacity="0.85" stroke="white" strokeWidth="2" />
            <text x={m.x} y={m.y + radius + 14} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))" fontWeight="500">
              {m.label}
            </text>
            {isHovered && (
              <g>
                <rect x={m.x - 70} y={m.y - radius - 55} width="140" height="45" rx="6"
                  fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth="1" />
                <text x={m.x} y={m.y - radius - 38} textAnchor="middle" fontSize="10" fontWeight="600" fill="hsl(var(--foreground))">
                  {m.loc.location}
                </text>
                <text x={m.x} y={m.y - radius - 22} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">
                  {m.loc.count} assets | Risk: {m.loc.avgRisk}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LatencyHeatmap({ locations }: { locations: LocationData[] }) {
  const locs = locations.slice(0, 8);

  function getLatency(a: string, b: string): number {
    if (a === b) return 0;
    const combined = (a + b).toLowerCase();
    if (combined.includes("us") && combined.includes("eu")) return 85;
    if (combined.includes("us") && combined.includes("ap")) return 160;
    if (combined.includes("eu") && combined.includes("ap")) return 140;
    if (combined.includes("us") && combined.includes("af")) return 180;
    if (combined.includes("eu") && combined.includes("af")) return 100;
    if ((combined.includes("us") && combined.includes("sa")) || (combined.includes("us") && combined.includes("brazil"))) return 120;
    return 50 + Math.abs(a.length - b.length) * 15 + ((a.charCodeAt(0) + b.charCodeAt(0)) % 80);
  }

  function getLatencyColor(ms: number): string {
    if (ms === 0) return "hsl(var(--muted))";
    if (ms < 60) return "#22c55e";
    if (ms < 120) return "#eab308";
    if (ms < 160) return "#f97316";
    return "#ef4444";
  }

  return (
    <div className="overflow-x-auto" data-testid="latency-heatmap">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-1.5 text-left text-muted-foreground font-medium">From / To</th>
            {locs.map(l => (
              <th key={l.location} className="p-1.5 text-center text-muted-foreground font-medium max-w-[80px] truncate">
                {l.location.length > 10 ? l.location.slice(0, 10) + "..." : l.location}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {locs.map((row) => (
            <tr key={row.location}>
              <td className="p-1.5 font-medium truncate max-w-[100px]">{row.location}</td>
              {locs.map((col) => {
                const ms = getLatency(row.location, col.location);
                return (
                  <td key={col.location} className="p-1">
                    <div
                      className="w-full h-8 rounded-md flex items-center justify-center text-[10px] font-mono font-semibold"
                      style={{
                        backgroundColor: getLatencyColor(ms),
                        color: ms === 0 ? "hsl(var(--muted-foreground))" : "#fff",
                        opacity: ms === 0 ? 0.5 : 0.85,
                      }}
                    >
                      {ms === 0 ? "-" : `${ms}ms`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LocationTab({ tenantId }: { tenantId: number }) {
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null);

  const { data, isLoading, isError: locationError, refetch: refetchLocation } = useQuery<{ locations: LocationData[] }>({
    queryKey: ["/api/asset-inventory", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/asset-inventory/${tenantId}/locations`);
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
    retry: 1,
  });

  const locations = data?.locations ?? [];
  const totalAssets = locations.reduce((s, l) => s + l.count, 0);
  const highestRisk = locations.length ? locations.reduce((a, b) => a.avgRisk > b.avgRisk ? a : b) : null;
  const mostAssets = locations.length ? locations.reduce((a, b) => a.count > b.count ? a : b) : null;

  const providerCounts: Record<string, number> = {};
  locations.forEach(loc => {
    loc.regions.forEach(r => {
      const p = getCloudProvider(r);
      if (p) providerCounts[p] = (providerCounts[p] || 0) + 1;
    });
  });

  const scatterData = locations.map(l => ({
    x: l.count,
    y: l.avgRisk,
    z: l.critical,
    name: l.location,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="location-loading">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="location-error">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">Unable to load location data. Please try again.</p>
        <Button onClick={() => { refetchLocation(); }} size="sm" data-testid="location-retry">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="location-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Locations" value={locations.length} icon={MapPin} color="bg-blue-600" subtitle="Unique sites" />
        <StatCard title="Total Assets" value={totalAssets.toLocaleString()} icon={Server} color="bg-emerald-600" subtitle="Across all locations" />
        <StatCard title="Highest Risk" value={highestRisk ? highestRisk.location : "N/A"} icon={AlertTriangle} color="bg-red-600"
          subtitle={highestRisk ? `Avg Risk: ${highestRisk.avgRisk}` : undefined} />
        <StatCard title="Most Assets" value={mostAssets ? mostAssets.location : "N/A"} icon={Building2} color="bg-purple-600"
          subtitle={mostAssets ? `${mostAssets.count.toLocaleString()} assets` : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="provider-summary-badges">
        <span className="text-xs text-muted-foreground font-medium">Cloud Providers:</span>
        {Object.entries(providerCounts).map(([provider, count]) => (
          <Badge key={provider} variant="secondary" className={`text-[10px] ${getProviderBadgeStyle(provider)}`}
            data-testid={`provider-badge-${provider}`}>
            <Cloud className="w-3 h-3 mr-1" />
            {provider.toUpperCase()} ({count} region{count > 1 ? "s" : ""})
          </Badge>
        ))}
        {Object.keys(providerCounts).length === 0 && (
          <Badge variant="secondary" className="text-[10px]">No cloud regions detected</Badge>
        )}
      </div>

      <Card data-testid="region-map-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4" /> Interactive Region Map
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="h-[320px]">
            <WorldMapSVG locations={locations} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="assets-by-location-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Assets by Location</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locations} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="location" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip content={<RichTooltip />} />
                  <Bar dataKey="count" name="Assets" radius={[0, 4, 4, 0]}>
                    {locations.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="risk-by-location-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Risk by Location</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locations} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="location" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip content={<RichTooltip />} />
                  <Bar dataKey="avgRisk" name="Avg Risk" radius={[0, 4, 4, 0]}>
                    {locations.map((loc, i) => (
                      <Cell key={i} fill={getRiskColor(loc.avgRisk)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="regional-growth-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" /> Regional Asset Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locations} margin={{ left: 10, right: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="location" tick={{ fontSize: 9 }} interval={0} height={60} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<RichTooltip />} />
                  <Bar dataKey="count" name="Assets" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="subnetCount" name="Subnets" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="geo-risk-correlation-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4" /> Geo-Risk Correlation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 10, right: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="x" name="Assets" tick={{ fontSize: 10 }} label={{ value: "Asset Count", position: "insideBottom", offset: -5, fontSize: 10 }} />
                  <YAxis dataKey="y" name="Avg Risk" tick={{ fontSize: 10 }} label={{ value: "Avg Risk", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <ZAxis dataKey="z" range={[40, 400]} name="Critical" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-2.5 text-xs">
                          <p className="font-semibold mb-1">{d.name}</p>
                          <p className="text-muted-foreground">Assets: {d.x}</p>
                          <p className="text-muted-foreground">Avg Risk: {d.y}</p>
                          <p className="text-muted-foreground">Critical: {d.z}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} name="Locations">
                    {scatterData.map((entry, i) => (
                      <Cell key={i} fill={getRiskColor(entry.y)} opacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="latency-heatmap-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-4 h-4" /> Inter-Location Latency Heatmap (Simulated)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {locations.length > 0 ? (
            <LatencyHeatmap locations={locations} />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No location data available</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="location-detail-table">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold">Location Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground"></th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Assets</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Avg Risk</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Top OS</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Subnets</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Critical</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Cloud Region</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => {
                  const isExpanded = expandedLoc === loc.location;
                  const complianceBadges = getComplianceBadges(loc.location, loc.regions);
                  const providerSet = new Set<string>();
                  loc.regions.forEach(r => { const p = getCloudProvider(r); if (p) providerSet.add(p); });
                  const providers = Array.from(providerSet);

                  return (
                    <Fragment key={loc.location}>
                      <tr
                        className="border-b hover-elevate cursor-pointer transition-colors"
                        onClick={() => setExpandedLoc(isExpanded ? null : loc.location)}
                        data-testid={`location-row-${loc.location.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <td className="p-3">
                          <Button size="icon" variant="ghost" data-testid={`expand-btn-${loc.location.toLowerCase().replace(/\s+/g, '-')}`}>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </Button>
                        </td>
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            {loc.location}
                            {providers.map(p => (
                              <Badge key={p} variant="secondary" className={`text-[9px] py-0 px-1.5 ${getProviderBadgeStyle(p)}`}>
                                {p.toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">{loc.count.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Progress value={loc.avgRisk} className="w-12 h-1.5" />
                            <span className="font-mono font-semibold" style={{ color: getRiskColor(loc.avgRisk) }}>
                              {loc.avgRisk}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">{loc.topOs}</td>
                        <td className="p-3 text-right font-mono">{loc.subnetCount}</td>
                        <td className="p-3 text-right">
                          <span className={`font-mono font-semibold ${loc.critical > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {loc.critical}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {loc.regions.slice(0, 2).map(r => (
                              <Badge key={r} variant="outline" className="text-[9px] py-0 px-1.5">{r}</Badge>
                            ))}
                            {loc.regions.length > 2 && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5">+{loc.regions.length - 2}</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b" data-testid={`location-expanded-${loc.location.toLowerCase().replace(/\s+/g, '-')}`}>
                          <td colSpan={8} className="p-4 bg-muted/20">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">Compliance</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {complianceBadges.map(b => (
                                    <Badge key={b.label} className={`text-[10px] ${b.color}`}>
                                      <Shield className="w-3 h-3 mr-1" />{b.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">All Regions</p>
                                <div className="flex flex-wrap gap-1">
                                  {loc.regions.map(r => (
                                    <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">Risk Overview</p>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Risk Score</span>
                                    <span className="font-mono font-semibold" style={{ color: getRiskColor(loc.avgRisk) }}>{loc.avgRisk}/100</span>
                                  </div>
                                  <Progress value={loc.avgRisk} className="h-2" />
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Critical Assets</span>
                                    <span className="font-mono font-semibold text-red-500">{loc.critical}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Asset Density</span>
                                    <span className="font-mono font-semibold">{loc.count} / {loc.subnetCount} subnets</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No location data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

