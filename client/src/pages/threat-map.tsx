import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Globe, RefreshCw, AlertTriangle, Activity, TrendingUp, Shield,
  MapPin, Target, Crosshair, ExternalLink, Flame, Zap
} from "lucide-react";
import { COUNTRY_MAP } from "@/lib/country-centroids";
import { WorldMap, SEV_COLORS } from "@/components/threat-map/WorldMap";
import type { ArcData, OfficeLocation } from "@/components/threat-map/WorldMap";
import { ThreatRadar } from "@/components/threat-map/ThreatRadar";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface ThreatMapResponse {
  arcs: ArcData[];
  totalEvents: number;
  topSources: { country: string; count: number }[];
  topTargets: { country: string; count: number }[];
  uniqueCountries: number;
  topTechnique: string;
  hours: number;
}

interface CountryDetailResponse {
  country: string;
  events: { value: string; severity: string; occurred_at: string; event_type: string }[];
  incidents: { id: number; title: string; severity: string; created_at: string }[];
  totalEvents: number;
  topTechnique: string;
}

function SevBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "border-red-500/40 text-red-400 bg-red-500/10",
    high: "border-orange-500/40 text-orange-400 bg-orange-500/10",
    medium: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
    low: "border-green-500/40 text-green-400 bg-green-500/10",
    info: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  };
  return (
    <Badge variant="outline" className={cn("text-[9px] capitalize px-1", colors[severity] || colors.low)}>
      {severity}
    </Badge>
  );
}

function CountryRow({ code, count, maxCount, rank, onClick }: {
  code: string; count: number; maxCount: number; rank: number; onClick: () => void;
}) {
  const country = COUNTRY_MAP.get(code.toUpperCase());
  return (
    <div
      className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 dark:hover:bg-white/5 rounded-md px-1.5 py-1 transition-colors group"
      onClick={onClick}
      data-testid={`country-row-${rank}`}
    >
      <span className="text-base shrink-0 w-6 text-center">{country?.flag || "🌍"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">{country?.name || code}</div>
        <div className="w-full bg-muted dark:bg-white/10 rounded-full h-1 mt-1">
          <div
            className="h-1 rounded-full transition-all duration-500"
            style={{
              width: `${Math.round((count / maxCount) * 100)}%`,
              background: "linear-gradient(90deg, #ef4444, #f97316)",
            }}
          />
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] px-1.5 border-red-500/30 text-red-400 shrink-0">
        {count.toLocaleString()}
      </Badge>
    </div>
  );
}

export default function ThreatMapPage() {
  const { currentTenant } = useTenant();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const tenantId = currentTenant?.id;
  const [hours, setHours] = useState("720");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 900, height: 480 });
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      if (mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        setMapSize({ width: Math.max(rect.width, 600), height: Math.max(rect.height, 300) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (mapRef.current) ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, []);

  const { data, isLoading, refetch } = useQuery<ThreatMapResponse>({
    queryKey: ["/api/threat-map/arcs", tenantId, hours],
    queryFn: async () => {
      const res = await fetch(`/api/threat-map/arcs?tenantId=${tenantId}&hours=${hours}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const { data: offices = [] } = useQuery<OfficeLocation[]>({
    queryKey: ["/api/threat-map/offices", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/threat-map/offices?tenantId=${tenantId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const { data: countryDetail, isLoading: detailLoading } = useQuery<CountryDetailResponse>({
    queryKey: ["/api/threat-map/country", selectedCountry, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/threat-map/country/${selectedCountry}?tenantId=${tenantId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedCountry && !!tenantId,
  });

  const arcs = data?.arcs || [];
  const topSources = data?.topSources || [];
  const topTargets = data?.topTargets || [];
  const maxSourceCount = topSources[0]?.count || 1;
  const maxTargetCount = topTargets[0]?.count || 1;

  const hoveredCountryData = hoveredCountry ? COUNTRY_MAP.get(hoveredCountry.toUpperCase()) : null;
  const hoveredCount = arcs.filter(a => a.from === hoveredCountry).reduce((s, a) => s + a.count, 0);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <PageHero
          icon={Globe}
          title="Global Threat Intelligence Map"
          description="Real-time geographic attack flow visualization across your organization's threat landscape"
          badge="LIVE"
          stats={[
            { label: "Events", value: data?.totalEvents?.toLocaleString() ?? "—" },
            { label: "Attacker Countries", value: String(data?.uniqueCountries ?? new Set(arcs.map(a => a.from)).size) },
            { label: "Top Technique", value: data?.topTechnique || "—" },
            { label: "Window", value: `${hours}h` },
          ]}
        />

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-muted-foreground">Live threat feed</span>
              {hoveredCountry && hoveredCountryData && (
                <div className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10 text-xs">
                  <span>{hoveredCountryData.flag}</span>
                  <span className="font-medium">{hoveredCountryData.name}</span>
                  {hoveredCount > 0 && <span className="text-muted-foreground">· {hoveredCount.toLocaleString()} events</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-threat-map-hours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 1 hour</SelectItem>
                  <SelectItem value="6">Last 6 hours</SelectItem>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                  <SelectItem value="168">Last 7 days</SelectItem>
                  <SelectItem value="720">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-xs" data-testid="button-refresh-threat-map">
                <RefreshCw className="w-3.5 h-3.5" />Refresh
              </Button>
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Stats sidebar */}
            <div className="lg:order-first space-y-3">
              {/* Summary card */}
              <Card className="border-border dark:border-white/10 bg-gradient-to-br from-background to-red-950/5">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-red-500" />Total Events
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-red-400">
                    {isLoading ? <Skeleton className="h-8 w-20 inline-block" /> : (data?.totalEvents || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">in last {hours}h</div>
                  <div className="mt-2.5 space-y-1.5">
                    {["critical", "high", "medium", "low"].map(sev => {
                      const cnt = arcs.filter(a => a.severity === sev).reduce((s, a) => s + a.count, 0);
                      return cnt > 0 ? (
                        <div key={sev} className="flex items-center gap-2 text-xs">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLORS[sev] }} />
                          <span className="capitalize text-muted-foreground">{sev}</span>
                          <span className="ml-auto font-medium tabular-nums">{cnt.toLocaleString()}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top Sources */}
              <Card className="border-border dark:border-white/10">
                <CardHeader className="pb-1.5 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-red-500" />Top Attackers
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-0.5">
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />) :
                    topSources.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No data</p>
                    ) : topSources.slice(0, 7).map((src, i) => (
                      <CountryRow key={src.country} code={src.country} count={src.count} maxCount={maxSourceCount} rank={i}
                        onClick={() => setSelectedCountry(src.country.toUpperCase())} />
                    ))}
                </CardContent>
              </Card>

              {/* Top Targets */}
              {topTargets.length > 0 && (
                <Card className="border-border dark:border-white/10">
                  <CardHeader className="pb-1.5 pt-3 px-3">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-blue-500" />Top Targeted
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-0.5">
                    {topTargets.slice(0, 5).map((t, i) => (
                      <CountryRow key={t.country} code={t.country} count={t.count} maxCount={maxTargetCount} rank={i}
                        onClick={() => setSelectedCountry(t.country.toUpperCase())} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Map */}
            <div className="lg:col-span-3">
              <Card className="overflow-hidden border-border dark:border-white/10">
                <CardContent className="p-0">
                  <div
                    ref={mapRef}
                    className="relative w-full rounded-lg overflow-hidden"
                    style={{
                      height: "480px",
                      background: isDark
                        ? "linear-gradient(135deg, hsl(222,33%,6%) 0%, hsl(222,33%,9%) 100%)"
                        : "linear-gradient(135deg, hsl(210,40%,88%) 0%, hsl(210,35%,82%) 100%)",
                    }}
                    data-testid="threat-map-container"
                  >
                    {isLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-muted-foreground text-sm flex items-center gap-2">
                          <Activity className="w-4 h-4 animate-pulse text-primary" />
                          Loading threat data...
                        </div>
                      </div>
                    ) : (
                      <WorldMap
                        arcs={arcs}
                        width={mapSize.width}
                        height={mapSize.height}
                        onCountryHover={setHoveredCountry}
                        onCountryClick={code => setSelectedCountry(code)}
                        targetCountry={offices[0]?.countryCode || "US"}
                        offices={offices}
                      />
                    )}

                    {/* Severity legend */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
                      {Object.entries(SEV_COLORS).slice(0, 4).map(([sev, color]) => (
                        <div key={sev} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-[9px] text-muted-foreground capitalize">{sev}</span>
                        </div>
                      ))}
                    </div>

                    {/* Protected network / office indicator */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-[10px] text-blue-300 font-medium">
                        {offices.length > 0 ? `${offices.length} Protected Offices` : "Protected Network"}
                      </span>
                    </div>

                    {/* Empty-state prompt when no geo-enabled offices configured */}
                    {offices.length === 0 && (
                      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-lg pointer-events-none">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-[11px] text-blue-200/90 leading-tight">
                          Add office locations in <span className="font-semibold text-blue-300">My Organization → Infrastructure</span> to enable office-aware arc routing
                        </span>
                      </div>
                    )}

                    {/* Live counter */}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                      <Zap className="w-3 h-3 text-yellow-400 animate-pulse" />
                      <span className="text-[10px] text-yellow-300 font-medium tabular-nums">
                        {arcs.length} active flows
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attack severity breakdown row */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                {["critical", "high", "medium", "low"].map(sev => {
                  const cnt = arcs.filter(a => a.severity === sev).reduce((s, a) => s + a.count, 0);
                  const srcCount = new Set(arcs.filter(a => a.severity === sev).map(a => a.from)).size;
                  return (
                    <Card key={sev} className="border-border dark:border-white/10" style={{ borderLeftColor: SEV_COLORS[sev], borderLeftWidth: 2 }}>
                      <CardContent className="p-2.5">
                        <div className="text-[10px] text-muted-foreground capitalize mb-0.5">{sev}</div>
                        <div className="text-lg font-bold tabular-nums" style={{ color: SEV_COLORS[sev] }}>
                          {isLoading ? "—" : cnt.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{srcCount} countries</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Threat Radar row */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <Card className="border-border dark:border-white/10 h-full">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                    Attack Vector Radar
                    <Badge variant="outline" className="text-[9px] px-1.5 ml-auto border-green-500/30 text-green-400">30d</Badge>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Live distribution across 10 attack surface sectors
                  </p>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <ThreatRadar />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Card className="border-border dark:border-white/10 h-full">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    Sector Intelligence
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Attack surface coverage across all monitored security domains (last 30 days)
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { key: "email",         label: "Email",         icon: "✉",  desc: "Phishing, BEC, spam" },
                      { key: "endpoint",      label: "Endpoint",      icon: "⬡",  desc: "Malware, ransomware, EDR" },
                      { key: "network",       label: "Network",       icon: "⟡",  desc: "DDoS, lateral movement" },
                      { key: "web",           label: "Web (SWG)",     icon: "🌐", desc: "Proxy, malicious URLs" },
                      { key: "web_app",       label: "Web App",       icon: "</>" ,desc: "SQLi, XSS, CSRF, WAF" },
                      { key: "cloud",         label: "Cloud",         icon: "☁",  desc: "CASB, misconfig, shadow IT" },
                      { key: "identity",      label: "Identity",      icon: "◉",  desc: "Credential abuse, MFA" },
                      { key: "data",          label: "Data (DLP)",    icon: "⏃",  desc: "Exfiltration, exposure" },
                      { key: "vulnerability", label: "Vulnerability", icon: "⚠",  desc: "CVE exploitation, scanning" },
                      { key: "ai",            label: "AI Threats",    icon: "◈",  desc: "Prompt injection, model poisoning" },
                    ].map(sector => (
                      <div key={sector.key}
                        className="rounded-lg p-2.5 border border-border dark:border-white/10 bg-muted/20 dark:bg-white/3 hover:bg-muted/40 dark:hover:bg-white/6 transition-colors text-center">
                        <div className="text-xl mb-1">{sector.icon}</div>
                        <div className="text-[10px] font-semibold truncate">{sector.label}</div>
                        <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{sector.desc}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Country detail sheet */}
      <Sheet open={!!selectedCountry} onOpenChange={() => setSelectedCountry(null)}>
        <SheetContent className="w-[420px] sm:w-[460px] overflow-y-auto">
          <SheetHeader className="pb-3 border-b border-border dark:border-white/10">
            <SheetTitle className="flex items-center gap-2">
              {selectedCountry && (() => {
                const c = COUNTRY_MAP.get(selectedCountry.toUpperCase());
                return c ? (
                  <>
                    <span className="text-2xl">{c.flag}</span>
                    <span>{c.name}</span>
                  </>
                ) : <><MapPin className="w-4 h-4" />{selectedCountry}</>;
              })()}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {detailLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : countryDetail ? (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/30 dark:bg-white/5 rounded-xl p-3 border border-border dark:border-white/10 text-center">
                    <div className="text-2xl font-bold text-red-400">{countryDetail.totalEvents || countryDetail.events?.length || 0}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Recent Events</div>
                  </div>
                  <div className="bg-muted/30 dark:bg-white/5 rounded-xl p-3 border border-border dark:border-white/10 text-center">
                    <div className="text-2xl font-bold text-orange-400">{countryDetail.incidents?.length || 0}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Incidents</div>
                  </div>
                </div>
                {countryDetail.topTechnique && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 dark:bg-white/5 border border-border dark:border-white/10">
                    <Crosshair className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <div className="text-xs"><span className="text-muted-foreground">Top technique: </span><span className="font-medium">{countryDetail.topTechnique}</span></div>
                  </div>
                )}

                {/* Recent events */}
                {(countryDetail.events || []).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Activity className="w-3 h-3" />Recent Events ({countryDetail.events.length})
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {countryDetail.events.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 dark:bg-white/5 border border-border dark:border-white/10 text-xs">
                          <SevBadge severity={e.severity} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{e.event_type}</div>
                            {e.value && <div className="text-muted-foreground font-mono text-[10px] truncate mt-0.5">{e.value}</div>}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(e.occurred_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked incidents */}
                {(countryDetail.incidents || []).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" />Linked Incidents ({countryDetail.incidents.length})
                    </div>
                    <div className="space-y-1.5">
                      {countryDetail.incidents.map((inc) => (
                        <Link key={inc.id} href={`/incidents/${inc.id}/canvas`} onClick={() => setSelectedCountry(null)}>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted/40 dark:hover:bg-white/10 cursor-pointer transition-colors text-xs">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: inc.severity === "critical" ? "#ef4444" : inc.severity === "high" ? "#f97316" : "#eab308" }} />
                            <span className="flex-1 truncate font-medium">{inc.title}</span>
                            <span className="text-muted-foreground shrink-0 text-[10px]">{new Date(inc.created_at).toLocaleDateString()}</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {!countryDetail.events?.length && !countryDetail.incidents?.length && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No recent activity from this country</p>
                  </div>
                )}

                {/* Filter shortcut */}
                <Link href={`/incidents?search=${COUNTRY_MAP.get(selectedCountry.toUpperCase())?.name || selectedCountry}`}
                  onClick={() => setSelectedCountry(null)}>
                  <Button variant="outline" size="sm" className="w-full gap-2 h-8 text-xs mt-2">
                    <Shield className="w-3.5 h-3.5" />View Incidents from this Country
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
