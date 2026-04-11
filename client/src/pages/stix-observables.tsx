import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Download, RefreshCw, Shield, Users, Network, Crosshair, Bug,
  FileText, CheckCircle, AlertTriangle, Globe, Copy, ExternalLink,
} from "lucide-react";

interface StixBundle {
  type: string;
  id: string;
  spec_version: string;
  objects: StixObject[];
}

interface StixObject {
  type: string;
  id: string;
  name: string;
  spec_version: string;
  created: string;
  modified: string;
  description?: string;
  confidence?: number;
  [key: string]: unknown;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  "threat-actor": Users,
  "intrusion-set": Network,
  "campaign": Crosshair,
  "malware": Bug,
  "report": FileText,
};

const typeColors: Record<string, string> = {
  "threat-actor": "text-red-400 bg-red-500/10 border-red-500/20",
  "intrusion-set": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "campaign": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "malware": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "report": "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function StixObservablesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: bundle, isLoading, refetch } = useQuery<StixBundle>({
    queryKey: ["/api/cti", currentTenant?.id, "stix-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/stix-bundle`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load STIX bundle");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 120_000,
  });

  const handleDownload = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stix-bundle-tenant-${currentTenant?.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "STIX Bundle Downloaded", description: `${bundle.objects.length} objects exported as STIX 2.1 JSON` });
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: "Copied", description: id });
  };

  const typeCounts = bundle?.objects.reduce<Record<string, number>>((acc, obj) => {
    acc[obj.type] = (acc[obj.type] || 0) + 1;
    return acc;
  }, {}) ?? {};

  const byType = (type: string) => (bundle?.objects ?? []).filter(o => o.type === type);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight">STIX Observables</h1>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">STIX 2.1</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Structured Threat Information eXpression — explore and export your full STIX 2.1 bundle</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-stix">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!bundle} data-testid="button-download-stix">
            <Download className="w-3.5 h-3.5 mr-1.5" />Export JSON
          </Button>
        </div>
      </div>

      {/* Bundle metadata */}
      {isLoading ? (
        <Card className="border-border/40"><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
      ) : bundle ? (
        <Card className="border-border/40 bg-indigo-500/5 border-indigo-500/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bundle ID</span>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-mono truncate max-w-[160px]">{bundle.id}</p>
                  <button onClick={() => handleCopyId(bundle.id)} className="shrink-0" data-testid="button-copy-bundle-id"><Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" /></button>
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spec Version</span>
                <p className="text-sm font-semibold">STIX {bundle.spec_version}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Objects</span>
                <p className="text-2xl font-bold text-indigo-400">{bundle.objects.length}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Object Types</span>
                <p className="text-2xl font-bold text-indigo-400">{Object.keys(typeCounts).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Type breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(typeCounts).map(([type, count]) => {
          const Icon = typeIcons[type] || Shield;
          return (
            <Card key={type} className={`border cursor-pointer hover:shadow-md transition-all ${typeColors[type] || "border-border/40"}`} onClick={() => setActiveTab(type)}>
              <CardContent className="p-3 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${typeColors[type]?.split(" ")[0] || "text-muted-foreground"}`} />
                <div className="text-xl font-bold">{count}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{type.replace("-", " ")}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
          {Object.keys(typeCounts).map(type => (
            <TabsTrigger key={type} value={type} className="text-xs h-7 capitalize">{type.replace("-", " ")}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bundle Structure</CardTitle>
              <CardDescription className="text-xs">STIX 2.1 object distribution across all entity types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(typeCounts).map(([type, count]) => {
                  const Icon = typeIcons[type] || Shield;
                  const pct = Math.round((count / (bundle?.objects.length || 1)) * 100);
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${typeColors[type]?.split(" ")[0] || "text-muted-foreground"}`} />
                      <span className="text-xs w-28 capitalize">{type.replace("-", " ")}</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${typeColors[type]?.split(" ")[0]?.replace("text-", "bg-") || "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{count}</span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  STIX 2.1 bundle ready for TAXII 2.1 ingestion
                </div>
                <Button size="sm" variant="outline" onClick={handleDownload} data-testid="button-download-stix-overview">
                  <Download className="w-3 h-3 mr-1" />Download
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {Object.keys(typeCounts).map(type => (
          <TabsContent key={type} value={type} className="mt-4">
            <div className="space-y-3">
              {byType(type).map(obj => {
                const Icon = typeIcons[type] || Shield;
                return (
                  <Card key={obj.id} className="border-border/40" data-testid={`card-stix-${obj.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${typeColors[type]?.split(" ")[0] || "text-muted-foreground"}`} />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm">{obj.name}</h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              <code className="text-[9px] text-muted-foreground font-mono truncate max-w-[220px]">{obj.id}</code>
                              <button onClick={() => handleCopyId(obj.id)} data-testid={`button-copy-${obj.id}`}><Copy className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" /></button>
                            </div>
                            {obj.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{obj.description}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[9px] capitalize ${typeColors[type] || ""}`}>{type.replace("-", " ")}</Badge>
                          {obj.confidence !== undefined && (
                            <Badge variant="outline" className="text-[9px]">{obj.confidence}% conf.</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30 text-[10px] text-muted-foreground">
                        <span>Created: {formatDate(obj.created as string)}</span>
                        <span>Modified: {formatDate(obj.modified as string)}</span>
                        <span className="text-[9px] text-emerald-400 flex items-center gap-0.5 ml-auto">
                          <CheckCircle className="w-2.5 h-2.5" />STIX 2.1
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {!isLoading && !bundle && (
        <Card className="border-border/40">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No STIX bundle available. Seed CTI data first by visiting the Threat Actors or Campaigns pages.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
