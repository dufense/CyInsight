import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { DataSourceBadge } from "@/components/data-source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield, RefreshCw, TrendingUp, TrendingDown,
  Bug, Mail, Globe, Database, Wifi, Cloud, Users, Brain,
  Activity, Zap, Network, ExternalLink, Crosshair,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer,
} from "recharts";
import type { LucideIcon } from "lucide-react";

interface AttackCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

const ATTACK_CATEGORIES: AttackCategory[] = [
  { key: "malware", label: "Malware", icon: Bug, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  { key: "ransomware", label: "Ransomware", icon: Shield, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
  { key: "apt", label: "APT", icon: Crosshair, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
  { key: "phishing", label: "Phishing", icon: Mail, color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
  { key: "spam", label: "Spam", icon: Mail, color: "text-slate-500", bg: "bg-slate-500/10 border-slate-500/20" },
  { key: "web_app", label: "Web App Attack", icon: Globe, color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { key: "network_intrusion", label: "Network Intrusion", icon: Wifi, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  { key: "bot", label: "BOT / C2", icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { key: "ai_generative", label: "AI Generative Threat", icon: Brain, color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/20" },
  { key: "database", label: "Database Attack", icon: Database, color: "text-indigo-500", bg: "bg-indigo-500/10 border-indigo-500/20" },
  { key: "fileless", label: "Fileless Attack", icon: Zap, color: "text-rose-500", bg: "bg-rose-500/10 border-rose-500/20" },
  { key: "lateral_movement", label: "Lateral Movement", icon: Network, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  { key: "ueba", label: "UEBA", icon: Users, color: "text-teal-500", bg: "bg-teal-500/10 border-teal-500/20" },
  { key: "network_anomaly", label: "Network Anomaly", icon: Wifi, color: "text-sky-500", bg: "bg-sky-500/10 border-sky-500/20" },
  { key: "cloud_ot", label: "Cloud / OT", icon: Cloud, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
];


// Exclusive eventType→category map; each backend eventType maps to at most one category.
// endpoint and vulnerability events are classified per-event via MITRE tactic below.
const EXCLUSIVE_TYPE_MAP: Record<string, string> = {
  email: "phishing",
  waf: "web_app",
  web: "web_app",
  casb: "web_app",
  network: "network_intrusion",
  database: "database",
  ot_iot: "cloud_ot",
  cloud: "cloud_ot",
  identity: "ueba",
  dlp: "ueba",
  sse: "network_intrusion",
  // endpoint and vulnerability are resolved via MITRE tactic pattern below
};

// Classify a single event into an attack category using eventType first, then MITRE tactic.
function categorizeSingleEvent(ev: SecurityEvent): string {
  const direct = EXCLUSIVE_TYPE_MAP[ev.eventType];
  if (direct) return direct;

  // endpoint / vulnerability — use MITRE tactic for specificity
  const tactic = (ev.mitreTactic ?? "").toLowerCase();
  const tech = (ev.mitreTechnique ?? "").toLowerCase();
  const threat = (ev.threat ?? "").toLowerCase();

  if (tactic.includes("lateral") || tech.includes("pass-the")) return "lateral_movement";
  if (tactic.includes("exfiltration") || tech.includes("exfil")) return "ueba";
  if (tactic.includes("command") || tactic.includes("c2") || threat.includes("botnet") || threat.includes("c2")) return "bot";
  if (tactic.includes("collection") && (tech.includes("fileless") || tech.includes("inject"))) return "fileless";
  if (tactic.includes("impact") || threat.includes("ransom")) return "ransomware";
  if (tactic.includes("persistence") || tactic.includes("privilege") || tactic.includes("defense")) return "apt";
  if (threat.includes("fileless") || tech.includes("inject") || tech.includes("reflective")) return "fileless";
  if (threat.includes("apt") || threat.includes("advanced persistent")) return "apt";
  if (threat.includes("spam")) return "spam";
  if (threat.includes("ai") || threat.includes("generative") || threat.includes("llm")) return "ai_generative";
  // default endpoint / vulnerability to malware
  return "malware";
}

interface EventTypeCount {
  type: string;
  count: number;
}

interface SeverityCount {
  severity: string;
  count: number;
}

interface EventsStatsResponse {
  eventsByType?: EventTypeCount[];
  eventsBySeverity?: SeverityCount[];
  total?: number;
  pipeline?: Record<string, number>;
  source?: string;
  latencyMs?: number;
}

interface SecurityEvent {
  id: number;
  eventType: string;
  severity: string;
  threat: string | null;
  target: string | null;
  attacker: string | null;
  asset: string | null;
  description: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  parseConfidence: number | null;
  occurredAt: string | null;
}

interface EventsListResponse {
  events: SecurityEvent[];
  totalCount: number;
  source?: string;
  latencyMs?: number;
}

interface Incident {
  id: number;
  severity?: string;
  title?: string;
  description?: string;
  attacker?: string | null;
  asset?: string | null;
  target?: string | null;
}

interface IncidentsResponse {
  incidents?: Incident[];
  total?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};


function Sparkline({ data, strokeClass }: { data: { v: number }[]; strokeClass: string }) {
  const colorMap: Record<string, string> = {
    "text-red-500": "#ef4444",
    "text-orange-500": "#f97316",
    "text-purple-500": "#a855f7",
    "text-yellow-500": "#eab308",
    "text-slate-500": "#64748b",
    "text-cyan-500": "#06b6d4",
    "text-blue-500": "#3b82f6",
    "text-emerald-500": "#10b981",
    "text-violet-500": "#8b5cf6",
    "text-indigo-500": "#6366f1",
    "text-rose-500": "#f43f5e",
    "text-amber-500": "#f59e0b",
    "text-teal-500": "#14b8a6",
    "text-sky-500": "#0ea5e9",
    "text-green-500": "#22c55e",
  };
  const stroke = colorMap[strokeClass] ?? "#6366f1";
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// MITRE-inferred categories: endpoint/vulnerability events classified per-event via categorizeSingleEvent
const MITRE_INFERRED_CATEGORIES = new Set([
  "malware", "ransomware", "apt", "fileless", "lateral_movement", "bot", "ai_generative", "spam",
]);

export default function DetectionFeedPage() {
  const { currentTenant } = useTenant();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const statsQuery = useQuery<EventsStatsResponse>({
    queryKey: ["/api/events", currentTenant?.id, "stats", "detection-feed"],
    queryFn: async () => {
      if (!currentTenant?.id) return {};
      const res = await fetch(`/api/events/${currentTenant.id}/stats`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const eventsQuery = useQuery<EventsListResponse>({
    queryKey: ["/api/events", currentTenant?.id, "detection-feed-list"],
    queryFn: async () => {
      if (!currentTenant?.id) return { events: [], totalCount: 0 };
      const res = await fetch(`/api/events/${currentTenant.id}?pageSize=100`, { credentials: "include" });
      if (!res.ok) return { events: [], totalCount: 0 };
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const incidentsQuery = useQuery<IncidentsResponse>({
    queryKey: ["/api/incidents", currentTenant?.id, "detection-feed"],
    queryFn: async () => {
      if (!currentTenant?.id) return {};
      const res = await fetch(`/api/incidents/${currentTenant.id}?limit=50`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 30000,
  });

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([
      statsQuery.refetch(),
      eventsQuery.refetch(),
    ]).finally(() => {
      setLastRefresh(new Date());
      setIsRefreshing(false);
      setCountdown(30);
    });
  }, [statsQuery, eventsQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const allEvents = eventsQuery.data?.events ?? [];

  const categoryData = ATTACK_CATEGORIES.map((cat) => {
    // Each event is classified into exactly one category via categorizeSingleEvent().
    const catEvents = allEvents.filter((e) => categorizeSingleEvent(e) === cat.key);

    const now = Date.now();
    const last24h = catEvents.filter((e) => e.occurredAt && now - new Date(e.occurredAt).getTime() < 86400000);
    const prev24h = catEvents.filter((e) => e.occurredAt && now - new Date(e.occurredAt).getTime() >= 86400000 && now - new Date(e.occurredAt).getTime() < 172800000);
    const change24h = prev24h.length > 0
      ? Math.round(((last24h.length - prev24h.length) / prev24h.length) * 100)
      : 0;

    const bucketCount = 10;
    const bucketMs = 86400000 / bucketCount;
    const sparkline: { v: number }[] = Array.from({ length: bucketCount }, (_, i) => {
      const bucketStart = now - (bucketCount - i) * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const v = catEvents.filter((e) => {
        if (!e.occurredAt) return false;
        const t = new Date(e.occurredAt).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length;
      return { v };
    });

    // Count and severity breakdown come only from real classified events (no fabricated fallback)
    const count = catEvents.length;
    const catSev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    catEvents.forEach((e) => {
      if (e.severity in catSev) catSev[e.severity]++;
    });

    return {
      ...cat,
      count,
      change24h,
      sparkline,
      detections: catEvents.slice(0, 15),
      severityDist: {
        critical: catSev.critical,
        high: catSev.high,
        medium: catSev.medium,
        low: catSev.low,
      },
    };
  });

  const selected = categoryData.find((c) => c.key === selectedCategory);
  const totalDetections = categoryData.reduce((s, c) => s + c.count, 0);
  const criticalCount = categoryData.reduce((s, c) => s + c.severityDist.critical, 0);
  const activeCategories = categoryData.filter((c) => c.count > 0).length;

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Shield}
        title="Detection Feed"
        description="Real-time detection monitoring organized by attack category with entity drill-down and incident links"
        badge="Log Intelligence"
        stats={[
          { label: "Total Detections", value: totalDetections.toLocaleString() },
          { label: "Critical", value: criticalCount, accent: criticalCount > 0 },
          { label: "Categories Active", value: activeCategories },
          { label: "Incidents (live)", value: incidentsQuery.data?.total ?? incidentsQuery.data?.incidents?.length ?? "—" },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
              {statsQuery.isFetching && <span className="ml-2 text-primary animate-pulse">syncing...</span>}
            </p>
            <DataSourceBadge
              source={eventsQuery.data?.source ?? statsQuery.data?.source}
              latencyMs={eventsQuery.data?.latencyMs ?? statsQuery.data?.latencyMs}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
            data-testid="button-refresh-feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh ({countdown}s)
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {categoryData.map((cat) => {
            const CatIcon = cat.icon;
            const isSelected = selectedCategory === cat.key;
            const trendUp = cat.change24h > 0;
            return (
              <Card
                key={cat.key}
                className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""} ${cat.bg}`}
                onClick={() => setSelectedCategory(isSelected ? null : cat.key)}
                data-testid={`card-category-${cat.key}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CatIcon className={`w-3.5 h-3.5 ${cat.color}`} />
                      <p className="text-[11px] font-semibold leading-tight">{cat.label}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 gap-0.5 ${trendUp ? "text-red-600 border-red-500/30" : "text-green-600 border-green-500/30"}`}
                    >
                      {trendUp
                        ? <TrendingUp className="w-2.5 h-2.5" />
                        : <TrendingDown className="w-2.5 h-2.5" />
                      }
                      {Math.abs(cat.change24h)}%
                    </Badge>
                  </div>

                  <p className={`text-2xl font-bold mb-1 ${cat.color}`}>{cat.count}</p>

                  <div className="mb-2">
                    <Sparkline data={cat.sparkline} strokeClass={cat.color} />
                  </div>

                  <div className="flex gap-1">
                    {cat.severityDist.critical > 0 && (
                      <span className="text-[9px] bg-red-500/10 text-red-600 px-1 rounded">C:{cat.severityDist.critical}</span>
                    )}
                    {cat.severityDist.high > 0 && (
                      <span className="text-[9px] bg-orange-500/10 text-orange-600 px-1 rounded">H:{cat.severityDist.high}</span>
                    )}
                    <span className="text-[9px] bg-yellow-500/10 text-yellow-700 px-1 rounded">M:{cat.severityDist.medium}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selected && (
          <Card className="mt-4" data-testid="panel-category-detections">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <selected.icon className={`w-4 h-4 ${selected.color}`} />
                {selected.label} — Recent Detections
                <Badge variant="outline" className="ml-auto text-xs">{selected.count} total</Badge>
                {(() => {
                  // Build the event-type filter for the Log Explorer link from the exclusive map
                  const typesForCat = Object.entries(EXCLUSIVE_TYPE_MAP)
                    .filter(([, catKey]) => catKey === selected.key)
                    .map(([evType]) => evType);
                  // MITRE-inferred categories (malware, apt, etc.) include endpoint + vulnerability
                  const isMitreInferred = MITRE_INFERRED_CATEGORIES.has(selected.key);
                  if (isMitreInferred) { typesForCat.push("endpoint", "vulnerability"); }
                  const explorerUrl = typesForCat.length > 0
                    ? `/log-intelligence/explorer?types=${encodeURIComponent(typesForCat.join(","))}`
                    : "/log-intelligence/explorer";
                  return (
                    <Link href={explorerUrl}>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 ml-2" data-testid="button-view-logs">
                        <ExternalLink className="w-3 h-3" />
                        {typesForCat.length > 0 ? `View Logs (${typesForCat.join(", ")})` : "View in Log Explorer"}
                      </Button>
                    </Link>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selected.detections.length > 0 ? (
                <div className="space-y-2">
                  {selected.detections.map((ev) => {
                    const entity = ev.attacker ?? ev.asset ?? ev.target ?? "unknown";
                    const incidents = incidentsQuery.data?.incidents ?? [];
                    // Find the best matching incident: same severity and entity mention in title/attacker/asset/target
                    const linkedIncident = incidents.find((inc) =>
                      inc.severity === ev.severity && (
                        (inc.attacker && entity !== "unknown" && inc.attacker === entity) ||
                        (inc.asset && entity !== "unknown" && inc.asset === entity) ||
                        (inc.target && entity !== "unknown" && inc.target === entity) ||
                        (inc.title && entity !== "unknown" && inc.title.toLowerCase().includes(entity.toLowerCase()))
                      )
                    ) ?? incidents.find((inc) => inc.severity === ev.severity) ?? null;
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                        data-testid={`row-detection-${ev.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[ev.severity] ?? ""}`}>
                              {ev.severity}
                            </Badge>
                            <code className="text-[11px] font-mono text-muted-foreground">{entity}</code>
                            {ev.mitreTechnique && (
                              <Badge variant="secondary" className="text-[10px]">{ev.mitreTechnique}</Badge>
                            )}
                            {ev.mitreTactic && (
                              <span className="text-[10px] text-muted-foreground">{ev.mitreTactic}</span>
                            )}
                          </div>
                          <p className="text-xs text-foreground">{ev.description ?? ev.threat ?? `Detected ${selected.label.toLowerCase()} activity`}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            {ev.parseConfidence != null && (
                              <div className="flex items-center gap-1">
                                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${ev.parseConfidence >= 80 ? "bg-green-500" : ev.parseConfidence >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${ev.parseConfidence}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono">{ev.parseConfidence}%</span>
                              </div>
                            )}
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {ev.occurredAt ? new Date(ev.occurredAt).toLocaleTimeString() : "—"}
                            </p>
                          </div>

                          {linkedIncident ? (
                            <Link href={`/incidents/${linkedIncident.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid={`button-view-incident-${ev.id}`}>
                                <ExternalLink className="w-3 h-3" />INC-{linkedIncident.id}
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-[10px] text-muted-foreground px-2" data-testid={`text-no-incident-${ev.id}`}>
                              No linked incident
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No recent events detected in this category.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
