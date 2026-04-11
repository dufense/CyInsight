import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Search, RefreshCw, Globe, Shield, Filter, ChevronDown,
  ExternalLink, Calendar, Users, Tag, BookOpen, AlertTriangle,
} from "lucide-react";
import type { CtiIntelReport } from "@shared/schema";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const tlpColors: Record<string, string> = {
  white: "text-white bg-white/10 border-white/30",
  green: "text-green-400 bg-green-500/10 border-green-500/30",
  amber: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  red: "text-red-400 bg-red-500/10 border-red-500/30",
};

const reportTypeLabels: Record<string, string> = {
  "threat-report": "Threat Report",
  "advisory": "Advisory",
  "campaign-report": "Campaign Report",
  "malware-analysis": "Malware Analysis",
  "ttps-report": "TTPs Report",
};

const reportTypeColors: Record<string, string> = {
  "threat-report": "text-red-400 bg-red-500/10 border-red-500/20",
  "advisory": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "campaign-report": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "malware-analysis": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "ttps-report": "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

function ReportDetail({ item }: { item: CtiIntelReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-snug">{item.title}</h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge variant="outline" className={`text-[9px] uppercase px-1.5 ${tlpColors[item.tlpLevel || "amber"] || ""}`}>TLP:{(item.tlpLevel || "amber").toUpperCase()}</Badge>
            <Badge variant="outline" className={`text-[9px] px-1.5 ${reportTypeColors[item.reportType || ""] || ""}`}>{reportTypeLabels[item.reportType || ""] || item.reportType}</Badge>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Published</span><p className="text-sm">{formatDate(item.publishedAt)}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Authors</span><p className="text-sm">{(item.authors || []).join(", ") || "—"}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">IOC Count</span><p className="text-xl font-bold text-primary">{item.iocCount ?? 0}</p></div>
        <div className="space-y-1"><span className="text-xs text-muted-foreground">Confidence</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Progress value={item.confidence || 0} className="flex-1 h-1.5" />
            <span className="text-xs font-semibold">{item.confidence}%</span>
          </div>
        </div>
      </div>
      {item.description && <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Description</span><p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p></div>}
      {item.content && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Content Preview</span>
          <div className="bg-muted/30 rounded-md p-3 text-xs text-foreground/70 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">{item.content}</div>
        </div>
      )}
      {item.relatedActors && item.relatedActors.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Related Actors</span>
          <div className="flex flex-wrap gap-1.5">{item.relatedActors.map(a => <Badge key={a} variant="outline" className="text-xs">{a}</Badge>)}</div>
        </div>
      )}
      {item.relatedCampaigns && item.relatedCampaigns.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Related Campaigns</span>
          <div className="flex flex-wrap gap-1.5">{item.relatedCampaigns.map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}</div>
        </div>
      )}
      {item.relatedMalware && item.relatedMalware.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Related Malware</span>
          <div className="flex flex-wrap gap-1.5">{item.relatedMalware.map(m => <Badge key={m} variant="outline" className="text-xs text-purple-400 border-purple-500/30">{m}</Badge>)}</div>
        </div>
      )}
      {item.labels && item.labels.length > 0 && (
        <div className="space-y-1.5"><span className="text-xs text-muted-foreground">Labels</span>
          <div className="flex flex-wrap gap-1.5">{item.labels.map(l => <Badge key={l} variant="outline" className="text-[10px] text-muted-foreground">{l}</Badge>)}</div>
        </div>
      )}
      {item.externalUrl && (
        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
          <ExternalLink className="w-3 h-3" />View external source
        </a>
      )}
    </div>
  );
}

export default function IntelReportsPage() {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTlp, setFilterTlp] = useState("all");
  const [sortField, setSortField] = useState<"title" | "publishedAt" | "confidence">("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<CtiIntelReport | null>(null);

  const { data: items = [], isLoading, refetch } = useQuery<CtiIntelReport[]>({
    queryKey: ["/api/cti", currentTenant?.id, "intel-reports"],
    queryFn: async () => {
      const res = await fetch(`/api/cti/${currentTenant!.id}/intel-reports`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60_000,
  });

  const filtered = items
    .filter(i => {
      const q = search.toLowerCase();
      const matchQ = !q || i.title.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q) || (i.labels || []).some(l => l.toLowerCase().includes(q));
      const matchT = filterType === "all" || i.reportType === filterType;
      const matchTlp = filterTlp === "all" || i.tlpLevel === filterTlp;
      return matchQ && matchT && matchTlp;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = a.title.localeCompare(b.title);
      else if (sortField === "publishedAt") cmp = new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime();
      else if (sortField === "confidence") cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (f: typeof sortField) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">Intel Reports</h1>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">TLP Classified</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Structured threat intelligence reports — advisories, campaign analyses, and malware deep-dives</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-reports">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Reports", value: items.length, icon: FileText, color: "text-primary" },
          { label: "Advisories", value: items.filter(i => i.reportType === "advisory").length, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Total IOCs", value: items.reduce((s, i) => s + (i.iocCount ?? 0), 0), icon: Globe, color: "text-cyan-400" },
          { label: "TLP:RED", value: items.filter(i => i.tlpLevel === "red").length, icon: Shield, color: "text-red-400" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-border/40">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1"><Icon className={`w-3.5 h-3.5 ${s.color}`} /><span className="text-[10px] text-muted-foreground">{s.label}</span></div>
                <span className="text-xl font-bold" data-testid={`stat-report-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{isLoading ? "—" : s.value}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search reports, descriptions, labels…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-reports" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-full sm:w-44" data-testid="select-filter-report-type">
            <Filter className="w-3.5 h-3.5 mr-1.5 shrink-0" /><SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="threat-report">Threat Report</SelectItem>
            <SelectItem value="advisory">Advisory</SelectItem>
            <SelectItem value="campaign-report">Campaign Report</SelectItem>
            <SelectItem value="malware-analysis">Malware Analysis</SelectItem>
            <SelectItem value="ttps-report">TTPs Report</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTlp} onValueChange={setFilterTlp}>
          <SelectTrigger className="h-9 w-full sm:w-32" data-testid="select-filter-tlp">
            <SelectValue placeholder="TLP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All TLP</SelectItem>
            <SelectItem value="white">TLP:WHITE</SelectItem>
            <SelectItem value="green">TLP:GREEN</SelectItem>
            <SelectItem value="amber">TLP:AMBER</SelectItem>
            <SelectItem value="red">TLP:RED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="border-border/40"><CardContent className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>)
        ) : filtered.length === 0 ? (
          <div className="col-span-3 text-center text-muted-foreground py-16">No intel reports found</div>
        ) : (
          filtered.map(item => (
            <Card
              key={item.id}
              className="border-border/40 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
              onClick={() => setSelected(item)}
              data-testid={`card-report-${item.id}`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] uppercase px-1.5 ${tlpColors[item.tlpLevel || "amber"] || ""}`}>TLP:{(item.tlpLevel || "amber").toUpperCase()}</Badge>
                    <Badge variant="outline" className={`text-[9px] px-1.5 ${reportTypeColors[item.reportType || ""] || ""}`}>{reportTypeLabels[item.reportType || ""] || item.reportType}</Badge>
                  </div>
                </div>
                <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">{item.title}</h3>
                {item.description && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(item.publishedAt)}</div>
                  <div className="flex items-center gap-2">
                    <span>{item.iocCount ?? 0} IOCs</span>
                    <span className="text-primary font-medium">{item.confidence}% conf.</span>
                  </div>
                </div>
                {item.labels && item.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.labels.slice(0, 3).map(l => <Badge key={l} variant="outline" className="text-[9px] px-1 text-muted-foreground">{l}</Badge>)}
                    {item.labels.length > 3 && <Badge variant="outline" className="text-[9px] px-1 text-muted-foreground">+{item.labels.length - 3}</Badge>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground text-right">{filtered.length} of {items.length} reports • Click card for full detail</div>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4 text-blue-400" />Intel Report</DialogTitle>
          </DialogHeader>
          {selected && <ReportDetail item={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
