import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Network, Crosshair, Bug, FileText, Globe, Shield, TrendingUp,
  BarChart3, Download, Brain, ChevronRight, Activity, AlertTriangle, Zap,
} from "lucide-react";
import { RadarChart, Radar as RadarShape, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";

interface CtiStats {
  threatActors: number;
  activeActors: number;
  intrusionSets: number;
  campaigns: number;
  activeCampaigns: number;
  malwareFamilies: number;
  intelReports: number;
  totalIocs: number;
  avgConfidence: number;
}

const hubModules = [
  { title: "Threat Actors", desc: "Nation-state & criminal actor profiles", icon: Users, url: "/threat-actors", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", stat: "threatActors", activeStat: "activeActors", badge: "STIX 2.1" },
  { title: "Intrusion Sets", desc: "Named attack groupings & campaigns", icon: Network, url: "/intrusion-sets", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", stat: "intrusionSets", badge: "ATT&CK" },
  { title: "CTI Campaigns", desc: "Active & historical threat campaigns", icon: Crosshair, url: "/cti-campaigns", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", stat: "campaigns", activeStat: "activeCampaigns", badge: "Live" },
  { title: "Malware Families", desc: "Malware & tool tracking database", icon: Bug, url: "/malware-families", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", stat: "malwareFamilies", badge: "TTP" },
  { title: "Intel Reports", desc: "Structured threat intelligence reports", icon: FileText, url: "/intel-reports", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", stat: "intelReports", badge: "TLP" },
  { title: "IOC Indicators", desc: "IP, domain, URL, hash indicators", icon: Globe, url: "/threat-intel", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", badge: "Feed" },
  { title: "Attack Patterns", desc: "MITRE ATT&CK technique coverage", icon: Shield, url: "/mitre-coverage", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", badge: "MITRE" },
  { title: "STIX Observables", desc: "STIX 2.1 bundle export & exploration", icon: BarChart3, url: "/stix-observables", color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20", badge: "Export" },
  { title: "Global Threat Map", desc: "Geo-visualisation of active threats", icon: Globe, url: "/threat-map", color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/20", badge: "Geo" },
  { title: "Predictive Engine", desc: "AI 30-day attack vector forecasting", icon: Brain, url: "/cyber-llm", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", badge: "AI" },
  { title: "Federated Intel", desc: "Cross-tenant IOC propagation engine", icon: Activity, url: "/federated-intel", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20", badge: "Multi-tenant" },
];

const radarData = [
  { subject: "Actors", value: 85 },
  { subject: "Campaigns", value: 72 },
  { subject: "Malware", value: 90 },
  { subject: "IOCs", value: 65 },
  { subject: "Reports", value: 78 },
  { subject: "Coverage", value: 60 },
];

export default function CyberIntelPage() {
  const { currentTenant } = useTenant();
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<CtiStats>({
    queryKey: ["/api/cti", currentTenant?.id, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load CTI stats");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60_000,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Cyber Intelligence Hub</h1>
            <Badge className="text-[9px] px-1.5 py-0 bg-cyan-500/15 text-cyan-400 border-cyan-500/30">STIX 2.1</Badge>
          </div>
          <p className="text-sm text-muted-foreground">OpenCTI-grade threat intelligence — actors, campaigns, malware & structured reports</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/stix-observables")} data-testid="button-stix-export">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          STIX Export
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: "Threat Actors", value: stats?.threatActors, active: stats?.activeActors, icon: Users, color: "text-red-400" },
          { label: "Campaigns", value: stats?.campaigns, active: stats?.activeCampaigns, icon: Crosshair, color: "text-yellow-400" },
          { label: "Malware Families", value: stats?.malwareFamilies, icon: Bug, color: "text-purple-400" },
          { label: "Intel Reports", value: stats?.intelReports, icon: FileText, color: "text-blue-400" },
          { label: "Total IOCs", value: stats?.totalIocs?.toLocaleString(), icon: Globe, color: "text-cyan-400" },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="border-border/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                  <span className="text-[11px] text-muted-foreground font-medium truncate">{kpi.label}</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-7 w-14" />
                ) : (
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-bold" data-testid={`stat-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>{kpi.value ?? 0}</span>
                    {kpi.active !== undefined && (
                      <Badge variant="outline" className="text-[9px] mb-0.5 text-emerald-400 border-emerald-500/30 px-1">
                        {kpi.active} active
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Intelligence coverage radar */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Intelligence Coverage
            </CardTitle>
            <CardDescription className="text-xs">Multi-domain CTI breadth score</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <RadarShape dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                <Tooltip formatter={(v) => [`${v}%`, "Score"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-xs text-muted-foreground">Avg confidence</span>
              <span className="text-sm font-semibold text-primary">{isLoading ? "—" : `${stats?.avgConfidence ?? 0}%`}</span>
            </div>
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card className="border-border/40 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Quick Navigation
            </CardTitle>
            <CardDescription className="text-xs">Jump directly to any intelligence module</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hubModules.slice(0, 6).map(mod => {
                const Icon = mod.icon;
                return (
                  <button
                    key={mod.url}
                    onClick={() => navigate(mod.url)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-muted/50 ${mod.bg}`}
                    data-testid={`link-${mod.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${mod.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">{mod.title}</span>
                        <Badge className="text-[8px] px-1 py-0 h-3.5 shrink-0 bg-muted text-muted-foreground border-0">{mod.badge}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{mod.desc}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full module grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {hubModules.map(mod => {
            const Icon = mod.icon;
            const statVal = mod.stat ? (stats as any)?.[mod.stat] : null;
            return (
              <Card
                key={mod.url}
                className={`border cursor-pointer hover:shadow-md transition-all group ${mod.bg}`}
                onClick={() => navigate(mod.url)}
                data-testid={`card-module-${mod.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg bg-background/50`}>
                      <Icon className={`w-4 h-4 ${mod.color}`} />
                    </div>
                    <Badge className="text-[8px] px-1.5 py-0 h-4 bg-background/60 text-muted-foreground border-0 font-medium">{mod.badge}</Badge>
                  </div>
                  <h3 className="text-sm font-semibold mb-0.5 group-hover:text-primary transition-colors">{mod.title}</h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{mod.desc}</p>
                  {statVal !== undefined && statVal !== null && (
                    <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className={`text-sm font-bold ${mod.color}`}>{statVal}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Threat landscape summary */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Platform CTI Standards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "STIX 2.1", desc: "Structured Threat Information eXpression", color: "text-cyan-400" },
              { label: "TAXII 2.1", desc: "Trusted Automated eXchange of Intelligence", color: "text-blue-400" },
              { label: "MITRE ATT&CK", desc: "Adversarial Tactics, Techniques & Common Knowledge", color: "text-green-400" },
              { label: "Kill Chain", desc: "Lockheed Martin Cyber Kill Chain phases", color: "text-orange-400" },
            ].map(s => (
              <div key={s.label} className="space-y-1">
                <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>
                <p className="text-[10px] text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
