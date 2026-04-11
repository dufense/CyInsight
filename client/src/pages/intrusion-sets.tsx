import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Network, Search, RefreshCw, Activity, Globe, Target, Cpu, Shield,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { CtiIntrusionSet } from "@shared/schema";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

const sophisticationColors: Record<string, string> = {
  expert: "text-red-400 bg-red-500/10 border-red-500/20",
  advanced: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  intermediate: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  minimal: "text-green-400 bg-green-500/10 border-green-500/20",
};

function IntrusionSetDetail({ item }: { item: CtiIntrusionSet }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base">{item.name}</h3>
          {item.aliases && item.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Aliases: {item.aliases.join(", ")}</p>
          )}
        </div>
        <Badge variant="outline" className={`text-xs ${item.active ? "text-emerald-400 border-emerald-500/30" : "text-slate-400 border-slate-500/30"}`}>
          {item.active ? "Active" : "Historical"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Sophistication</span>
          <div><Badge variant="outline" className={`text-xs capitalize ${sophisticationColors[item.sophistication || ""] || ""}`}>{item.sophistication || "—"}</Badge></div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Motivation</span>
          <p className="text-sm font-medium capitalize">{item.primaryMotivation || "Unknown"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Resource Level</span>
          <p className="text-sm capitalize">{item.resourceLevel || "—"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Activity Window</span>
          <p className="text-sm">{formatDate(item.firstSeen)} – {formatDate(item.lastSeen)}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <div className="flex items-center gap-2">
          <Progress value={item.confidence || 0} className="flex-1 h-2" />
          <span className="text-xs font-semibold w-8 text-right">{item.confidence}%</span>
        </div>
      </div>
      {item.description && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Description</span>
          <p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p>
        </div>
      )}
      {item.targetSectors && item.targetSectors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Target Sectors</span>
          <div className="flex flex-wrap gap-1.5">{item.targetSectors.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div>
        </div>
      )}
      {item.targetCountries && item.targetCountries.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Target Countries</span>
          <div className="flex flex-wrap gap-1.5">{item.targetCountries.map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}</div>
        </div>
      )}
      {item.toolsUsed && item.toolsUsed.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Tools Used</span>
          <div className="flex flex-wrap gap-1.5">{item.toolsUsed.map(t => <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>)}</div>
        </div>
      )}
      {item.ttps && item.ttps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">MITRE ATT&CK TTPs</span>
          <div className="flex flex-wrap gap-1.5">{item.ttps.map(t => <Badge key={t} variant="secondary" className="text-[10px] font-mono">{t}</Badge>)}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <div className="text-center">
          <div className="text-xl font-bold text-primary">{item.campaignCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Campaigns</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-primary">{item.indicatorCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">IOC Indicators</div>
        </div>
      </div>
    </div>
  );
}

export default function IntrusionSetsPage() {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "confidence">("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<CtiIntrusionSet | null>(null);

  const { data: items = [], isLoading, refetch } = useQuery<CtiIntrusionSet[]>({
    queryKey: ["/api/cti", currentTenant?.id, "intrusion-sets"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/intrusion-sets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60_000,
  });

  const filtered = items
    .filter(i => {
      const q = search.toLowerCase();
      return !q || i.name.toLowerCase().includes(q) || (i.aliases || []).some(a => a.toLowerCase().includes(q)) || (i.description || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const cmp = sortField === "name" ? a.name.localeCompare(b.name) : (a.confidence ?? 0) - (b.confidence ?? 0);
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
            <Network className="w-5 h-5 text-orange-400" />
            <h1 className="text-xl font-bold tracking-tight">Intrusion Sets</h1>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">ATT&CK</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Named groups of behaviour, tools, and infrastructure used by threat actors</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-intrusion-sets">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Sets", value: items.length, icon: Network, color: "text-primary" },
          { label: "Active", value: items.filter(i => i.active).length, icon: Activity, color: "text-emerald-400" },
          { label: "Govt. Sponsored", value: items.filter(i => i.resourceLevel === "government").length, icon: Shield, color: "text-red-400" },
          { label: "Avg Confidence", value: items.length > 0 ? `${Math.round(items.reduce((s, i) => s + (i.confidence ?? 0), 0) / items.length)}%` : "—", icon: Target, color: "text-blue-400" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-border/40">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1"><Icon className={`w-3.5 h-3.5 ${s.color}`} /><span className="text-[10px] text-muted-foreground">{s.label}</span></div>
                <span className="text-xl font-bold" data-testid={`stat-intrusion-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{isLoading ? "—" : s.value}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search intrusion sets, aliases, descriptions…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-intrusion-sets" />
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Name <SortIcon field="name" /></TableHead>
                <TableHead>Motivation</TableHead>
                <TableHead>Sophistication</TableHead>
                <TableHead>Target Sectors</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("confidence")}>Confidence <SortIcon field="confidence" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No intrusion sets found</TableCell></TableRow>
              ) : (
                filtered.map(item => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/30 border-border/30" onClick={() => setSelected(item)} data-testid={`row-intrusion-${item.id}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{item.name}</div>
                      {item.aliases && item.aliases.length > 0 && <div className="text-[10px] text-muted-foreground">{item.aliases[0]}</div>}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{item.primaryMotivation || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] px-1 capitalize ${sophisticationColors[item.sophistication || ""] || ""}`}>{item.sophistication || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(item.targetSectors || []).slice(0, 2).map(s => <Badge key={s} variant="outline" className="text-[9px] px-1">{s}</Badge>)}
                        {(item.targetSectors || []).length > 2 && <Badge variant="outline" className="text-[9px] px-1 text-muted-foreground">+{(item.targetSectors || []).length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <Badge variant="outline" className={`text-[9px] ${item.active ? "text-emerald-400 border-emerald-500/30" : "text-slate-400 border-slate-500/30"}`}>
                        {item.active ? "Active" : "Historical"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 bg-muted rounded-full h-1.5 overflow-hidden">
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

      <div className="text-xs text-muted-foreground text-right">{filtered.length} of {items.length} intrusion sets • Click row for full profile</div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Network className="w-4 h-4 text-orange-400" />Intrusion Set Detail
            </DialogTitle>
          </DialogHeader>
          {selected && <IntrusionSetDetail item={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
