import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Globe2, ShieldAlert, Search, Plus, Share2, Eye, AlertTriangle,
  CheckCircle2, Loader2, Network, Link, Hash, Mail, Server
} from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  ip: Network, domain: Globe2, hash: Hash, url: Link, email: Mail,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/30",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

const TLP_COLORS: Record<string, string> = {
  white: "text-white border-white/30 bg-white/10",
  green: "text-green-500 border-green-500/30 bg-green-500/10",
  amber: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  red: "text-red-500 border-red-500/30 bg-red-500/10",
};

export default function FederatedIntelPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [form, setForm] = useState({
    indicatorType: "ip", indicatorValue: "", threatType: "malware",
    confidence: 75, severity: "high", tlpLevel: "amber",
  });

  const tenantId = currentTenant?.id;

  const dashboardQuery = useQuery<any>({
    queryKey: ["/api/federated-intel", tenantId, "dashboard"],
    queryFn: () => apiRequest("GET", `/api/federated-intel/${tenantId}/dashboard`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const indicatorsQuery = useQuery<any[]>({
    queryKey: ["/api/federated-intel", tenantId, { typeFilter, severityFilter }],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: "100" });
      if (typeFilter) params.set("type", typeFilter);
      if (severityFilter) params.set("severity", severityFilter);
      return apiRequest("GET", `/api/federated-intel/${tenantId}?${params}`).then(r => r.json());
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const shareMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/federated-intel/${tenantId}`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Indicator shared to federation" });
      queryClient.invalidateQueries({ queryKey: ["/api/federated-intel", tenantId] });
      setShowShare(false);
    },
    onError: (e: any) => toast({ title: "Failed to share", description: e.message, variant: "destructive" }),
  });

  const dashboard = dashboardQuery.data;
  const indicators = (indicatorsQuery.data || []).filter(ind =>
    !search || ind.indicatorValue.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Share2}
        title="Federated Cross-Tenant Threat Intelligence"
        description="Share and consume threat indicators across the MSSP federation with TLP-aware controls"
        badge="Federated Intel"
        stats={[
          { label: "Total Indicators", value: dashboard?.total ?? "—" },
          { label: "Critical", value: dashboard?.critical ?? "—" },
          { label: "High Confidence", value: dashboard?.highConfidence ?? "—" },
          { label: "Shared", value: indicators.filter(i => i.sharedCount > 0).length ?? "—" },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* KPI strip */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(dashboard.byType || {}).slice(0, 4).map(([type, count]) => {
              const Icon = TYPE_ICONS[type] || Server;
              return (
                <Card key={type} data-testid={`kpi-type-${type}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted"><Icon className="w-4 h-4 text-primary" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground capitalize">{type}</p>
                      <p className="text-2xl font-bold text-primary">{count as number}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search indicators..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-sm" data-testid="input-indicator-search" />
          </div>
          <Select value={typeFilter || "_all"} onValueChange={v => setTypeFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[130px]" data-testid="select-indicator-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Types</SelectItem>
              <SelectItem value="ip">IP Address</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="hash">File Hash</SelectItem>
              <SelectItem value="url">URL</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter || "_all"} onValueChange={v => setSeverityFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[130px]" data-testid="select-indicator-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowShare(true)} data-testid="button-share-indicator">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Share Indicator
          </Button>
        </div>

        {/* Indicators Table */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-primary" />Federation Indicators ({indicators.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {indicatorsQuery.isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : indicators.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No indicators yet. Share the first one from your threat investigations.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {indicators.map((ind: any) => {
                    const Icon = TYPE_ICONS[ind.indicatorType] || Server;
                    return (
                      <div key={ind.id} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/40 transition-colors" data-testid={`indicator-row-${ind.id}`}>
                        <div className="p-1.5 rounded bg-muted shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{ind.indicatorValue}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{ind.threatType || "unknown"}</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{ind.lastSeen ? new Date(ind.lastSeen).toLocaleDateString() : ""}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[ind.severity] || ""}`}>{ind.severity}</Badge>
                          <Badge variant="outline" className={`text-[9px] ${TLP_COLORS[ind.tlpLevel] || ""}`}>TLP:{ind.tlpLevel?.toUpperCase()}</Badge>
                          <span className="text-[10px] text-muted-foreground">{ind.confidence}% conf</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Share Indicator Dialog */}
      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent className="max-w-md" data-testid="dialog-share-indicator">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 className="w-4 h-4" />Share Threat Indicator</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Indicator Type</Label>
              <Select value={form.indicatorType} onValueChange={v => setForm(f => ({ ...f, indicatorType: v }))}>
                <SelectTrigger data-testid="select-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">IP Address</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="hash">File Hash</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Indicator Value</Label>
              <Input value={form.indicatorValue} onChange={e => setForm(f => ({ ...f, indicatorValue: e.target.value }))} placeholder="e.g. 192.168.1.100 or evil.com" data-testid="input-indicator-value" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Threat Type</Label>
                <Select value={form.threatType} onValueChange={v => setForm(f => ({ ...f, threatType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="malware">Malware</SelectItem>
                    <SelectItem value="phishing">Phishing</SelectItem>
                    <SelectItem value="c2">C2</SelectItem>
                    <SelectItem value="ransomware">Ransomware</SelectItem>
                    <SelectItem value="apt">APT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">TLP Classification</Label>
              <Select value={form.tlpLevel} onValueChange={v => setForm(f => ({ ...f, tlpLevel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="white">TLP:WHITE - Public</SelectItem>
                  <SelectItem value="green">TLP:GREEN - Community</SelectItem>
                  <SelectItem value="amber">TLP:AMBER - Limited</SelectItem>
                  <SelectItem value="red">TLP:RED - Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => shareMutation.mutate(form)} disabled={!form.indicatorValue.trim() || shareMutation.isPending} data-testid="button-confirm-share">
              {shareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}Share to Federation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
