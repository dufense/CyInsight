import { useState, useMemo, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { DataSourceBadge } from "@/components/data-source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Filter, ChevronDown, ChevronRight, X, Database,
  FileText, AlertTriangle, Clock, Brain, Eye, Copy, Sliders,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";

interface SecurityEvent {
  id: number;
  tenantId: number;
  eventType: string;
  severity: string;
  threat: string | null;
  target: string | null;
  attacker: string | null;
  asset: string | null;
  description: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  action: string | null;
  sourceType: string | null;
  logSource: string | null;
  parseConfidence: number | null;
  needsReview: boolean | null;
  aiReasoning: string | null;
  rawLog: string | null;
  rawPayload: Record<string, unknown> | null;
  occurredAt: string | null;
  createdAt: string;
}

interface EventsResponse {
  events: SecurityEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages?: number;
  source?: string;
  latencyMs?: number;
}

interface EventStatsResponse {
  total: number;
  byType?: Record<string, number>;
  bySeverity?: Record<string, number>;
  source?: string;
  latencyMs?: number;
}


const SEVERITIES = ["critical", "high", "medium", "low", "info"];

const MITRE_TACTICS = [
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

const TIME_RANGES = [
  { label: "1 Hour", value: "1h", ms: 3600000 },
  { label: "24 Hours", value: "24h", ms: 86400000 },
  { label: "7 Days", value: "7d", ms: 604800000 },
  { label: "30 Days", value: "30d", ms: 2592000000 },
  { label: "All Time", value: "all", ms: 0 },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  info: "bg-slate-500/10 text-slate-600 border-slate-500/30",
};

function normalizeEvent(ev: SecurityEvent) {
  return {
    id: ev.id,
    timestamp: ev.occurredAt ?? ev.createdAt,
    source: ev.logSource ?? ev.sourceType ?? "unknown",
    category: ev.eventType?.replace(/_/g, " ") ?? "unknown",
    severity: ev.severity,
    mitreTactic: ev.mitreTactic ?? "",
    mitreTechnique: ev.mitreTechnique ?? "",
    confidence: ev.parseConfidence ?? 0,
    entity: ev.attacker ?? ev.asset ?? ev.target ?? "unknown",
    rawLog: ev.rawLog ?? JSON.stringify(ev.rawPayload ?? {}, null, 2),
    parsedFields: ev.rawPayload ?? {
      threat: ev.threat,
      target: ev.target,
      action: ev.action,
      attacker: ev.attacker,
      asset: ev.asset,
    },
    aiExplanation: ev.aiReasoning ?? ev.description ?? "No AI explanation available.",
    indicators: [ev.attacker, ev.asset, ev.mitreTechnique].filter(Boolean) as string[],
    needsReview: ev.needsReview ?? false,
  };
}

type NormalizedEvent = ReturnType<typeof normalizeEvent>;

function FilterChip({
  label, onRemove,
}: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20">
      {label}
      <button onClick={onRemove} className="hover:text-destructive" data-testid={`chip-remove-${label}`}>
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

export default function LogExplorerPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const searchStr = useSearch();

  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState("24h");
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [severityFilters, setSeverityFilters] = useState<string[]>([]);
  const [mitreFilters, setMitreFilters] = useState<string[]>([]);
  const [mitreTechniqueFilters, setMitreTechniqueFilters] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Apply pre-filters from query params (e.g. ?types=network,endpoint from Detection Feed)
  useEffect(() => {
    if (!searchStr) return;
    const params = new URLSearchParams(searchStr);
    const typesParam = params.get("types");
    if (typesParam) {
      const types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (types.length > 0) setCategoryFilters(types);
    }
  }, [searchStr]);

  const eventsQuery = useQuery<EventsResponse>({
    queryKey: ["/api/events", currentTenant?.id, "log-explorer", timeRange],
    queryFn: async () => {
      if (!currentTenant?.id) {
        return { events: [], totalCount: 0, page: 1, pageSize: 200 };
      }
      const res = await fetch(`/api/events/${currentTenant.id}?pageSize=200`, { credentials: "include" });
      if (!res.ok) return { events: [], totalCount: 0, page: 1, pageSize: 200 };
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 30000,
  });

  const statsQuery = useQuery<EventStatsResponse>({
    queryKey: ["/api/events", currentTenant?.id, "stats"],
    queryFn: async () => {
      if (!currentTenant?.id) return { total: 0 };
      const res = await fetch(`/api/events/${currentTenant.id}/stats`, { credentials: "include" });
      if (!res.ok) return { total: 0 };
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60000,
  });

  const allEvents: NormalizedEvent[] = useMemo(() => {
    return (eventsQuery.data?.events ?? []).map(normalizeEvent);
  }, [eventsQuery.data]);

  const filtered: NormalizedEvent[] = useMemo(() => {
    const rangeOpt = TIME_RANGES.find((t) => t.value === timeRange);
    const cutoff = rangeOpt && rangeOpt.ms > 0 ? Date.now() - rangeOpt.ms : 0;
    return allEvents.filter((ev) => {
      if (cutoff > 0 && new Date(ev.timestamp).getTime() < cutoff) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !ev.rawLog.toLowerCase().includes(q) &&
          !ev.source.toLowerCase().includes(q) &&
          !ev.category.toLowerCase().includes(q) &&
          !ev.entity.toLowerCase().includes(q)
        ) return false;
      }
      if (sourceFilters.length > 0 && !sourceFilters.includes(ev.source)) return false;
      if (categoryFilters.length > 0 && !categoryFilters.includes(ev.category)) return false;
      if (severityFilters.length > 0 && !severityFilters.includes(ev.severity)) return false;
      if (mitreFilters.length > 0 && !mitreFilters.includes(ev.mitreTactic)) return false;
      if (mitreTechniqueFilters.length > 0 && !mitreTechniqueFilters.includes(ev.mitreTechnique)) return false;
      if (entityFilter && !ev.entity.toLowerCase().includes(entityFilter.toLowerCase())) return false;
      if (ev.confidence < minConfidence) return false;
      return true;
    });
  }, [allEvents, search, timeRange, sourceFilters, categoryFilters, severityFilters, mitreFilters, mitreTechniqueFilters, entityFilter, minConfidence]);

  const clearFilters = () => {
    setSearch("");
    setSourceFilters([]);
    setCategoryFilters([]);
    setSeverityFilters([]);
    setMitreFilters([]);
    setMitreTechniqueFilters([]);
    setEntityFilter("");
    setMinConfidence(0);
    setTimeRange("24h");
  };

  const toggleFilter = <T extends string>(
    set: T[], setFn: (v: T[]) => void, value: T,
  ) => {
    setFn(set.includes(value) ? set.filter((v) => v !== value) : [...set, value]);
  };

  const hasFilters = search || sourceFilters.length > 0 || categoryFilters.length > 0 ||
    severityFilters.length > 0 || mitreFilters.length > 0 || mitreTechniqueFilters.length > 0 || entityFilter || minConfidence > 0;

  const copyLog = (rawLog: string) => {
    navigator.clipboard.writeText(rawLog);
    toast({ title: "Copied", description: "Log copied to clipboard" });
  };

  const uniqueSources = useMemo(
    () => [...new Set(allEvents.map((e) => e.source))].filter(Boolean),
    [allEvents],
  );

  const uniqueTechniques = useMemo(
    () => [...new Set(allEvents.map((e) => e.mitreTechnique).filter(Boolean))].sort(),
    [allEvents],
  );

  const uniqueCategories = useMemo(
    () => [...new Set(allEvents.map((e) => e.category).filter(Boolean))].sort(),
    [allEvents],
  );

  const avgConfidence = filtered.length > 0
    ? Math.round(filtered.reduce((s, l) => s + l.confidence, 0) / filtered.length)
    : 0;

  const isLoading = eventsQuery.isLoading;

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Database}
        title="Log Explorer"
        description="Full-text search and exploration of ingested logs from all sources with AI-parsed structured fields"
        badge="Log Intelligence"
        stats={[
          { label: "Total Events", value: statsQuery.data?.total ?? eventsQuery.data?.totalCount ?? 0 },
          { label: "Filtered", value: filtered.length },
          { label: "Avg Confidence", value: `${avgConfidence}%` },
          { label: "Sources", value: uniqueSources.length },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-end">
          <DataSourceBadge
            source={eventsQuery.data?.source ?? statsQuery.data?.source}
            latencyMs={eventsQuery.data?.latencyMs ?? statsQuery.data?.latencyMs}
            samplesKey="log-explorer"
            sampleId={eventsQuery.dataUpdatedAt || statsQuery.dataUpdatedAt}
          />
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search logs by content, source, category, or entity..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
                data-testid="input-log-search"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />

              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-time-range">
                  <Clock className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value="_" onValueChange={(v) => toggleFilter(severityFilters, setSeverityFilters, v)}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-severity-filter">
                  <SelectValue placeholder="+ Severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {severityFilters.includes(s) ? "✓ " : ""}{s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value="_" onValueChange={(v) => toggleFilter(mitreFilters, setMitreFilters, v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-mitre-tactic-filter">
                  <SelectValue placeholder="+ MITRE Tactic" />
                </SelectTrigger>
                <SelectContent>
                  {MITRE_TACTICS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {mitreFilters.includes(t) ? "✓ " : ""}{t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {uniqueTechniques.length > 0 && (
                <Select value="_" onValueChange={(v) => toggleFilter(mitreTechniqueFilters, setMitreTechniqueFilters, v)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-mitre-technique-filter">
                    <SelectValue placeholder="+ MITRE Technique" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueTechniques.map((t) => (
                      <SelectItem key={t} value={t}>
                        {mitreTechniqueFilters.includes(t) ? "✓ " : ""}{t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value="_" onValueChange={(v) => toggleFilter(sourceFilters, setSourceFilters, v)}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-source-filter">
                  <SelectValue placeholder="+ Source" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueSources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sourceFilters.includes(s) ? "✓ " : ""}{s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {uniqueCategories.length > 0 && (
                <Select value="_" onValueChange={(v) => toggleFilter(categoryFilters, setCategoryFilters, v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-category-filter">
                    <SelectValue placeholder="+ Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryFilters.includes(c) ? "✓ " : ""}{c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1" data-testid="button-clear-filters">
                  <X className="w-3 h-3" />Clear all
                </Button>
              )}

              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} results</span>
            </div>

            {(sourceFilters.length > 0 || categoryFilters.length > 0 || severityFilters.length > 0 || mitreFilters.length > 0 || mitreTechniqueFilters.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {severityFilters.map((f) => (
                  <FilterChip key={f} label={`Severity: ${f}`} onRemove={() => toggleFilter(severityFilters, setSeverityFilters, f)} />
                ))}
                {mitreFilters.map((f) => (
                  <FilterChip key={f} label={`Tactic: ${f}`} onRemove={() => toggleFilter(mitreFilters, setMitreFilters, f)} />
                ))}
                {mitreTechniqueFilters.map((f) => (
                  <FilterChip key={f} label={`Technique: ${f}`} onRemove={() => toggleFilter(mitreTechniqueFilters, setMitreTechniqueFilters, f)} />
                ))}
                {sourceFilters.map((f) => (
                  <FilterChip key={f} label={`Source: ${f}`} onRemove={() => toggleFilter(sourceFilters, setSourceFilters, f)} />
                ))}
                {categoryFilters.map((f) => (
                  <FilterChip key={f} label={`Category: ${f.replace(/_/g, " ")}`} onRemove={() => toggleFilter(categoryFilters, setCategoryFilters, f)} />
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-border/40">
              <div className="flex items-center gap-2 min-w-[200px]">
                <Input
                  placeholder="Filter by entity (IP/user/host)..."
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-entity-filter"
                />
              </div>

              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Min Confidence:</span>
                <div className="w-28">
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[minConfidence]}
                    onValueChange={([v]) => setMinConfidence(v)}
                    data-testid="slider-confidence"
                  />
                </div>
                <span className="text-xs font-mono w-8">{minConfidence}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
                <p className="text-sm">Loading events...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="text-[11px]">Timestamp</TableHead>
                      <TableHead className="text-[11px]">Source</TableHead>
                      <TableHead className="text-[11px]">Type</TableHead>
                      <TableHead className="text-[11px]">Severity</TableHead>
                      <TableHead className="text-[11px]">Entity</TableHead>
                      <TableHead className="text-[11px]">MITRE Tactic</TableHead>
                      <TableHead className="text-[11px]">Confidence</TableHead>
                      <TableHead className="text-[11px]">Raw Log Preview</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 100).map((ev) => (
                      <Fragment key={ev.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpandedRow(expandedRow === ev.id ? null : ev.id)}
                          data-testid={`row-log-${ev.id}`}
                        >
                          <TableCell className="py-2">
                            {expandedRow === ev.id
                              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                            {new Date(ev.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{ev.source}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] capitalize">{ev.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[ev.severity] ?? ""}`}>
                              {ev.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[11px] font-mono">{ev.entity}</TableCell>
                          <TableCell className="text-[11px]">{ev.mitreTactic}</TableCell>
                          <TableCell>
                            {ev.confidence > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${ev.confidence >= 80 ? "bg-green-500" : ev.confidence >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${ev.confidence}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono">{ev.confidence}%</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground max-w-[260px] truncate">
                            {ev.rawLog.substring(0, 70)}...
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => { e.stopPropagation(); copyLog(ev.rawLog); }}
                              data-testid={`button-copy-log-${ev.id}`}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {expandedRow === ev.id && (
                          <TableRow key={`expanded-${ev.id}`}>
                            <TableCell colSpan={10} className="p-0">
                              <div className="p-4 bg-muted/20 border-t space-y-3">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                      <FileText className="w-3 h-3" />Raw Log
                                    </p>
                                    <ScrollArea className="h-[110px]">
                                      <pre className="text-[11px] font-mono bg-background rounded-lg border p-3 whitespace-pre-wrap leading-relaxed">
                                        {ev.rawLog}
                                      </pre>
                                    </ScrollArea>
                                  </div>

                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                      <Database className="w-3 h-3" />Parsed Fields
                                    </p>
                                    <ScrollArea className="h-[110px]">
                                      <pre className="text-[11px] font-mono bg-background rounded-lg border p-3 whitespace-pre-wrap leading-relaxed">
                                        {JSON.stringify(ev.parsedFields, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                      <Brain className="w-3 h-3" />AI Explanation
                                    </p>
                                    <p className="text-xs text-foreground leading-relaxed bg-background rounded-lg border p-3">
                                      {ev.aiExplanation}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />Detected Indicators
                                    </p>
                                    <div className="flex flex-wrap gap-1 bg-background rounded-lg border p-3">
                                      {ev.indicators.length > 0
                                        ? ev.indicators.map((ind, idx) => (
                                            <Badge key={idx} variant="destructive" className="text-[10px]">{ind}</Badge>
                                          ))
                                        : <span className="text-xs text-muted-foreground">No indicators detected</span>
                                      }
                                      {ev.mitreTechnique && (
                                        <Badge variant="outline" className="text-[10px]">{ev.mitreTechnique}</Badge>
                                      )}
                                      {ev.needsReview && (
                                        <Badge variant="secondary" className="text-[10px] text-yellow-600">Needs Review</Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No logs match the current filters.</p>
              </div>
            )}
            {filtered.length > 100 && (
              <div className="p-3 text-center text-xs text-muted-foreground border-t">
                Showing 100 of {filtered.length} results. Refine your filters to see more specific results.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
