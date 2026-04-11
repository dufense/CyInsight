import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Users, Search, Filter, RefreshCw, Globe, Calendar, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Flag, Target, Cpu, Activity,
} from "lucide-react";
import type { CtiThreatActor } from "@shared/schema";

const sophisticationColors: Record<string, string> = {
  expert: "text-red-400 bg-red-500/10 border-red-500/20",
  advanced: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  intermediate: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  minimal: "text-green-400 bg-green-500/10 border-green-500/20",
  none: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  innovator: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  strategic: "text-violet-400 bg-violet-500/10 border-violet-500/20",
};

const motivationColors: Record<string, string> = {
  espionage: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  financial: "text-green-400 bg-green-500/10 border-green-500/20",
  disruption: "text-red-400 bg-red-500/10 border-red-500/20",
  ideology: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  notoriety: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function ActorDetail({ actor }: { actor: CtiThreatActor }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base">{actor.name}</h3>
          {actor.aliases && actor.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Also known as: {actor.aliases.join(", ")}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant="outline" className={`text-xs ${actor.active ? "text-emerald-400 border-emerald-500/30" : "text-slate-400 border-slate-500/30"}`}>
            {actor.active ? "Active" : "Inactive"}
          </Badge>
          {actor.stixId && (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">STIX 2.1</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Sophistication</span>
          <div>
            <Badge variant="outline" className={`text-xs capitalize ${sophisticationColors[actor.sophistication || "intermediate"] || ""}`}>
              {actor.sophistication || "Unknown"}
            </Badge>
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Primary Motivation</span>
          <div>
            <Badge variant="outline" className={`text-xs capitalize ${motivationColors[actor.primaryMotivation || ""] || "text-muted-foreground"}`}>
              {actor.primaryMotivation || "Unknown"}
            </Badge>
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Country of Origin</span>
          <span className="text-sm font-medium">{actor.country || "Unknown"}</span>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Resource Level</span>
          <span className="text-sm font-medium capitalize">{actor.resourceLevel || "Unknown"}</span>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">First Seen</span>
          <span className="text-sm">{formatDate(actor.firstSeen)}</span>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Last Seen</span>
          <span className="text-sm">{formatDate(actor.lastSeen)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Confidence Score</span>
        <div className="flex items-center gap-2">
          <Progress value={actor.confidence || 0} className="flex-1 h-2" />
          <span className="text-xs font-semibold w-8 text-right">{actor.confidence}%</span>
        </div>
      </div>

      {actor.description && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Description</span>
          <p className="text-sm text-foreground/80 leading-relaxed">{actor.description}</p>
        </div>
      )}

      {actor.goals && actor.goals.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Goals</span>
          <div className="flex flex-wrap gap-1.5">
            {actor.goals.map(g => (
              <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
            ))}
          </div>
        </div>
      )}

      {actor.threatActorTypes && actor.threatActorTypes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Actor Types</span>
          <div className="flex flex-wrap gap-1.5">
            {actor.threatActorTypes.map(t => (
              <Badge key={t} variant="secondary" className="text-xs capitalize">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {actor.tags && actor.tags.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {actor.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] text-muted-foreground">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <div className="text-center">
          <div className="text-xl font-bold text-primary">{actor.indicatorCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">IOC Indicators</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-primary">{actor.campaignCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Campaigns</div>
        </div>
      </div>
    </div>
  );
}

export default function ThreatActorsPage() {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortField, setSortField] = useState<"name" | "confidence" | "lastSeen">("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<CtiThreatActor | null>(null);

  const { data: actors = [], isLoading, refetch } = useQuery<CtiThreatActor[]>({
    queryKey: ["/api/cti", currentTenant?.id, "threat-actors"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/threat-actors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60_000,
  });

  const filtered = actors
    .filter(a => {
      const q = search.toLowerCase();
      const matchQ = !q || a.name.toLowerCase().includes(q) || (a.aliases || []).some(al => al.toLowerCase().includes(q)) || (a.country || "").toLowerCase().includes(q);
      const matchF = filter === "all" || (filter === "active" && a.active) || (filter === "inactive" && !a.active) || (filter === "nation-state" && (a.threatActorTypes || []).includes("nation-state")) || (filter === "criminal" && (a.threatActorTypes || []).includes("criminal"));
      return matchQ && matchF;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "confidence") cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
      else if (sortField === "lastSeen") cmp = new Date(a.lastSeen ?? 0).getTime() - new Date(b.lastSeen ?? 0).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-red-400" />
            <h1 className="text-xl font-bold tracking-tight">Threat Actors</h1>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">STIX 2.1</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Nation-state APTs, criminal organisations, and hacktivists tracked per tenant</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Actors", value: actors.length, icon: Users, color: "text-primary" },
          { label: "Active", value: actors.filter(a => a.active).length, icon: Activity, color: "text-emerald-400" },
          { label: "Nation-State", value: actors.filter(a => (a.threatActorTypes || []).includes("nation-state")).length, icon: Flag, color: "text-red-400" },
          { label: "Criminal", value: actors.filter(a => (a.threatActorTypes || []).includes("criminal")).length, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Avg Confidence", value: actors.length > 0 ? `${Math.round(actors.reduce((s, a) => s + (a.confidence ?? 0), 0) / actors.length)}%` : "—", icon: Target, color: "text-blue-400" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-border/40">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                </div>
                <span className="text-xl font-bold" data-testid={`stat-actor-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{isLoading ? "—" : s.value}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search actors, aliases, countries…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-actors" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44" data-testid="select-filter-actors">
            <Filter className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actors</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="nation-state">Nation-State</SelectItem>
            <SelectItem value="criminal">Criminal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                  Name <SortIcon field="name" />
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Sophistication</TableHead>
                <TableHead>Motivation</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastSeen")}>
                  Last Seen <SortIcon field="lastSeen" />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("confidence")}>
                  Confidence <SortIcon field="confidence" />
                </TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">No threat actors found</TableCell>
                </TableRow>
              ) : (
                filtered.map(actor => (
                  <TableRow
                    key={actor.id}
                    className="cursor-pointer hover:bg-muted/30 border-border/30"
                    onClick={() => setSelected(actor)}
                    data-testid={`row-actor-${actor.id}`}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{actor.name}</div>
                        {actor.aliases && actor.aliases.length > 0 && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{actor.aliases.slice(0, 2).join(", ")}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(actor.threatActorTypes || []).slice(0, 2).map(t => (
                          <Badge key={t} variant="outline" className="text-[9px] px-1 capitalize">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] px-1 capitalize ${sophisticationColors[actor.sophistication || ""] || ""}`}>
                        {actor.sophistication || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] px-1 capitalize ${motivationColors[actor.primaryMotivation || ""] || "text-muted-foreground"}`}>
                        {actor.primaryMotivation || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{actor.country || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(actor.lastSeen)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${actor.confidence ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{actor.confidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${actor.active ? "text-emerald-400 border-emerald-500/30" : "text-slate-400 border-slate-500/30"}`}>
                        {actor.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-right">{filtered.length} of {actors.length} actors • Click row for full profile</div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-red-400" />
              Threat Actor Profile
            </DialogTitle>
          </DialogHeader>
          {selected && <ActorDetail actor={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
