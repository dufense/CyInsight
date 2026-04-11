import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, TrendingUp, ExternalLink, Activity } from "lucide-react";
import { COUNTRY_MAP } from "@/lib/country-centroids";
import { WorldMap, SEV_COLORS } from "@/components/threat-map/WorldMap";
import type { ArcData } from "@/components/threat-map/WorldMap";
import { Link } from "wouter";

interface ThreatMapResponse {
  arcs: ArcData[];
  totalEvents: number;
  topSources: { country: string; count: number }[];
  topTargets?: { country: string; count: number }[];
  uniqueCountries: number;
  hours: number;
}

export function ThreatMapMini({ height = 280 }: { height?: number }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 600, height });

  useEffect(() => {
    const update = () => {
      if (mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        setMapSize({ width: Math.max(rect.width, 300), height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (mapRef.current) ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [height]);

  const { data, isLoading } = useQuery<ThreatMapResponse>({
    queryKey: ["/api/threat-map/arcs", tenantId, "168"],
    queryFn: async () => {
      const res = await fetch(`/api/threat-map/arcs?tenantId=${tenantId}&hours=168`, { credentials: "include" });
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const arcs = data?.arcs || [];
  const topSources = (data?.topSources || []).slice(0, 5);
  const maxCount = topSources[0]?.count || 1;

  return (
    <Card className="border-border dark:border-white/10 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Global Threat Map
            {!isLoading && (
              <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 bg-red-500/5 ml-1 animate-pulse">
                LIVE
              </Badge>
            )}
          </CardTitle>
          <Link href="/threat-map">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground" data-testid="link-threat-map-full">
              <ExternalLink className="w-3 h-3" />Full Map
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={mapRef}
          className="relative w-full overflow-hidden"
          style={{
            height,
            background: "linear-gradient(135deg, hsl(222,33%,5%) 0%, hsl(222,33%,8%) 100%)",
          }}
          data-testid="threat-map-mini-container"
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary animate-pulse" />
            </div>
          ) : (
            <WorldMap
              arcs={arcs}
              width={mapSize.width}
              height={height}
              mini
              targetCountry="US"
            />
          )}

          {/* Severity pills overlay */}
          <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded px-2 py-1">
            {Object.entries(SEV_COLORS).slice(0, 4).map(([sev, color]) => {
              const cnt = arcs.filter(a => a.severity === sev).reduce((s, a) => s + a.count, 0);
              return cnt > 0 ? (
                <div key={sev} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[9px] text-muted-foreground">{cnt.toLocaleString()}</span>
                </div>
              ) : null;
            })}
          </div>

          {/* Events count */}
          <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded px-2 py-0.5">
            <span className="text-[10px] text-muted-foreground">
              <span className="text-red-400 font-medium tabular-nums">{(data?.totalEvents || 0).toLocaleString()}</span> events / 7d
            </span>
          </div>
        </div>

        {/* Top sources mini list */}
        {topSources.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border dark:border-white/5">
            <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />Top Attack Sources
            </div>
            <div className="space-y-1">
              {topSources.map((src, i) => {
                const country = COUNTRY_MAP.get(src.country.toUpperCase());
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm shrink-0">{country?.flag || "🌍"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="w-full bg-muted dark:bg-white/10 rounded-full h-1">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${Math.round((src.count / maxCount) * 100)}%`,
                            background: "linear-gradient(90deg, #ef4444, #f97316)",
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{src.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
