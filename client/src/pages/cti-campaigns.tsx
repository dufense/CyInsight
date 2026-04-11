import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Crosshair, Search, RefreshCw, Activity, Globe, Target, Shield,
  ChevronDown, ChevronUp, Filter, AlertTriangle, Calendar, Users,
} from "lucide-react";
import type { CtiCampaign } from "@shared/schema";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

const statusColors: Record<string, string> = {
  active: "text-red-400 bg-red-500/10 border-red-500/20",
  historical: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  suspected: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};

function CampaignDetail({ item }: { item: CtiCampaign }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base">{item.name}</h3>
          {item.aliases && item.aliases.length > 0 && <p className="text-xs text-muted-foreground">Aliases: {item.aliases.join(", ")}</p>}
        </div>
        <Badge variant="outline" className={`text-xs capitalize ${statusColors[item.status || ""] || ""}`}>{item.status || "—"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Attribution</span><p className="text-sm font-medium">{item.attribution || "Unattributed"}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Active Window</span><p className="text-sm">{formatDate(item.firstSeen)} – {item.active ? "Ongoing" : formatDate(item.lastSeen)}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">IOC Count</span><p className="text-xl font-bold text-primary">{item.iocCount ?? 0}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Linked Incidents</span><p className="text-xl font-bold text-primary">{item.incidentCount ?? 0}</p></div>
      </div>
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <div className="flex items-center gap-2">
          <Progress value={item.confidence || 0} className="flex-1 h-2" />
          <span className="text-xs font-semibold w-8 text-right">{item.confidence}%</span>
        </div>
      </div>
      {item.description && <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Description</span><p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p></div>}
      {item.objective && <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Objective</span><p className="text-sm text-foreground/80">{item.objective}</p></div>}
      {item.targetSectors && item.targetSectors.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Target Sectors</span>
          <div className="flex flex-wrap gap-1.5">{item.targetSectors.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div>
        </div>
      )}
      {item.targetRegions && item.targetRegions.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Target Regions</span>
          <div className="flex flex-wrap gap-1.5">{item.targetRegions.map(r => <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>)}</div>
        </div>
      )}
      {item.toolsUsed && item.toolsUsed.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Tools Used</span>
          <div className="flex flex-wrap gap-1.5">{item.toolsUsed.map(t => <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>)}</div>
        </div>
      )}
      {item.ttps && item.ttps.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">ATT&CK TTPs</span>
          <div className="flex flex-wrap gap-1.5">{item.ttps.map(t => <Badge key={t} variant="secondary" className="text-[10px] font-mono">{t}</Badge>)}</div>
        </div>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Tags</span>
          <div className="flex flex-wrap gap-1.5">{item.tags.map(tag => <Badge key={tag} variant="outline" className="text-[10px] text-muted-foreground">{tag}</Badge>)}</div>
        </div>
      )}
    </div>
  );
}

export default function CtiCampaignsPage() {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState<"name" | "confidence" | "iocCount">("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<CtiCampaign | null>(null);

  const { data: items = [], isLoading, refetch } = useQuery<CtiCampaign[]>({
    queryKey: ["/api/cti", currentTenant?.id, "campaigns"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/campaigns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60_000,
  });

  const filtered = items
    .filter(i => {
      const q = search.toLowerCase();
      const matchQ = !q || i.name.toLowerCase().includes(q) || (i.attribution || "").toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q);
      const matchF = filterStatus === "all" || i.status === filterStatus;
      return matchQ && matchF;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "confidence") cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
      else if (sortField === "iocCount") cmp = (a.iocCount ?? 0) - (b.iocCount ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };
  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField !== field ? null : sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crosshair className="w-5 h-5 text-yellow-400" />
            <h1 className="text-xl font-bold tracking-tight">CTI Campaigns</h1>
            <Badge className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/30">
              {items.filter(i => i.active).length} Active
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Active and historical threat campaigns with attribution and targeting data</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-campaigns">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Campaigns", value: items.length, icon: Crosshair, color: "text-primary" },
          { label: "Active", value: items.filter(i => i.active).length, icon: AlertTriangle, color: "text-red-400" },
          { label: "Total IOCs", value: items.reduce((s, i) => s + (i.iocCount ?? 0), 0), icon: Globe, color: "text-cyan-400" },
          { label: "Linked Incidents", value: items.reduce((s, i) => s + (i.incidentCount ?? 0), 0), icon: Shield, color: "text-orange-400" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-border/40">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1"><Icon className={`w-3.5 h-3.5 ${s.color}`} /><span className="text-[10px] text-muted-foreground">{s.label}</span></div>
                <span className="text-xl font-bold" data-testid={`stat-campaign-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{isLoading ? "—" : s.value}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search campaigns, attribution…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-campaigns" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40" data-testid="select-filter-campaigns">
            <Filter className="w-3.5 h-3.5 mr-1.5 shrink-0" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="historical">Historical</SelectItem>
            <SelectItem value="suspected">Suspected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>Campaign <SortIcon field="name" /></TableHead>
                <TableHead>Attribution</TableHead>
                <TableHead>Target Sectors</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("iocCount")}>IOCs <SortIcon field="iocCount" /></TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("confidence")}>Confidence <SortIcon field="confidence" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No campaigns found</TableCell></TableRow>
              ) : (
                filtered.map(item => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/30 border-border/30" onClick={() => setSelected(item)} data-testid={`row-campaign-${item.id}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{item.name}</div>
                      {item.objective && <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{item.objective}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{item.attribution || "Unattributed"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(item.targetSectors || []).slice(0, 2).map(s => <Badge key={s} variant="outline" className="text-[9px] px-1">{s}</Badge>)}
                        {(item.targetSectors || []).length > 2 && <Badge variant="outline" className="text-[9px] px-1 text-muted-foreground">+{(item.targetSectors || []).length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.iocCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.firstSeen)} – {item.active ? "Now" : formatDate(item.lastSeen)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] capitalize ${statusColors[item.status || ""] || ""}`}>{item.status || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-10 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${item.confidence ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{item.confidence}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="text-xs text-muted-foreground text-right">{filtered.length} of {items.length} campaigns • Click row for full detail</div>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Crosshair className="w-4 h-4 text-yellow-400" />Campaign Detail
            </DialogTitle>
          </DialogHeader>
          {selected && <CampaignDetail item={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
