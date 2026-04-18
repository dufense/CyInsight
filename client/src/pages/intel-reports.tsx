import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, Search, RefreshCw, Globe, Shield, Filter, Plus,
  ExternalLink, Calendar, Download, Trash2, AlertTriangle,
} from "lucide-react";
import type { CtiIntelReport } from "@shared/schema";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function esc(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  return /^https?:\/\//i.test(s) ? esc(s) : "#";
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
  "incident-report": "Incident Report",
};

const reportTypeColors: Record<string, string> = {
  "threat-report": "text-red-400 bg-red-500/10 border-red-500/20",
  "advisory": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "campaign-report": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "malware-analysis": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "ttps-report": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "incident-report": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

function exportReportPdf(item: CtiIntelReport) {
  const tlp = esc((item.tlpLevel || "amber").toUpperCase());
  const title = esc(item.title);
  const reportTypeLabel = esc(reportTypeLabels[item.reportType || ""] || item.reportType || "Report");
  const published = esc(formatDate(item.publishedAt));
  const confidence = Number(item.confidence ?? 0);
  const iocCount = Number(item.iocCount ?? 0);
  const authorsHtml = item.authors?.length
    ? `<div class="section"><div class="label">Authors</div>${item.authors.map(esc).join(", ")}</div>`
    : "";
  const descHtml = item.description
    ? `<div class="section"><div class="label">Description</div><p>${esc(item.description)}</p></div>`
    : "";
  const contentHtml = item.content
    ? `<div class="section"><div class="label">Report Content</div><div class="content">${esc(item.content)}</div></div>`
    : "";
  const actorsHtml = item.relatedActors?.length
    ? `<div class="section"><div class="label">Related Actors</div>${item.relatedActors.map(a => `<span class="badge">${esc(a)}</span>`).join("")}</div>`
    : "";
  const campaignsHtml = item.relatedCampaigns?.length
    ? `<div class="section"><div class="label">Related Campaigns</div>${item.relatedCampaigns.map(c => `<span class="badge">${esc(c)}</span>`).join("")}</div>`
    : "";
  const malwareHtml = item.relatedMalware?.length
    ? `<div class="section"><div class="label">Related Malware</div>${item.relatedMalware.map(m => `<span class="badge">${esc(m)}</span>`).join("")}</div>`
    : "";
  const urlHtml = item.externalUrl
    ? `<div class="section"><div class="label">External Reference</div><a href="${safeHref(item.externalUrl)}">${esc(item.externalUrl)}</a></div>`
    : "";
  const generated = esc(new Date().toLocaleString());

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
    .tlp { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: bold; font-size: 11px; background: #fef3c7; color: #92400e; }
    .section { margin-top: 16px; }
    .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    .content { background: #f8f8f8; padding: 12px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; margin-top: 4px; }
    .badge { display: inline-block; background: #e5e7eb; border-radius: 3px; padding: 1px 6px; font-size: 11px; margin: 2px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <span class="tlp">TLP:${tlp}</span>
    &nbsp;&nbsp;${reportTypeLabel}
    &nbsp;&nbsp;Published: ${published}
    &nbsp;&nbsp;Confidence: ${confidence}%
    &nbsp;&nbsp;IOCs: ${iocCount}
  </div>
  ${authorsHtml}
  ${descHtml}
  ${contentHtml}
  ${actorsHtml}
  ${campaignsHtml}
  ${malwareHtml}
  ${urlHtml}
  <div style="margin-top:40px; font-size:10px; color:#aaa; border-top:1px solid #ddd; padding-top:8px;">
    Generated by Cyber Command Center &bull; ${generated} &bull; TLP:${tlp}
  </div>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }
}

function ReportDetail({ item, onDelete, deleting }: { item: CtiIntelReport; onDelete: () => void; deleting: boolean }) {
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
        <Button variant="outline" size="sm" onClick={() => exportReportPdf(item)} className="h-7 text-xs shrink-0" data-testid="button-export-pdf">
          <Download className="w-3 h-3 mr-1" />Export PDF
        </Button>
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
      <div className="pt-3 border-t border-border/40">
        <Button
          variant="outline"
          size="sm"
          className="text-red-400 border-red-500/30 hover:bg-red-500/10"
          onClick={onDelete}
          disabled={deleting}
          data-testid="button-delete-report"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />{deleting ? "Deleting…" : "Delete Report"}
        </Button>
      </div>
    </div>
  );
}

interface NewReportForm {
  title: string;
  reportType: string;
  tlpLevel: string;
  description: string;
  content: string;
  authors: string;
  labels: string;
  confidence: number;
}

export default function IntelReportsPage() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTlp, setFilterTlp] = useState("all");
  const [sortField, setSortField] = useState<"title" | "publishedAt" | "confidence">("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<CtiIntelReport | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState<NewReportForm>({
    title: "", reportType: "threat-report", tlpLevel: "amber",
    description: "", content: "", authors: "", labels: "", confidence: 80,
  });

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

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", `/api/cti/${currentTenant!.id}/intel-reports`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cti", currentTenant?.id, "intel-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cti", currentTenant?.id, "stats"] });
      toast({ title: "Report created" });
      setShowCompose(false);
      setForm({ title: "", reportType: "threat-report", tlpLevel: "amber", description: "", content: "", authors: "", labels: "", confidence: 80 });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cti/${currentTenant!.id}/intel-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cti", currentTenant?.id, "intel-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cti", currentTenant?.id, "stats"] });
      setSelected(null);
      toast({ title: "Report deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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

  function handleSubmitReport() {
    createMutation.mutate({
      title: form.title,
      reportType: form.reportType,
      tlpLevel: form.tlpLevel,
      description: form.description,
      content: form.content,
      authors: form.authors ? form.authors.split(",").map(s => s.trim()).filter(Boolean) : [],
      labels: form.labels ? form.labels.split(",").map(s => s.trim()).filter(Boolean) : [],
      confidence: form.confidence,
      publishedAt: new Date().toISOString(),
      iocCount: 0,
    });
  }

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCompose(true)} data-testid="button-new-report">
            <Plus className="w-3.5 h-3.5 mr-1.5" />New Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-reports">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
        </div>
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
            <SelectItem value="incident-report">Incident Report</SelectItem>
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-6 text-[10px] text-muted-foreground hover:text-primary"
                  onClick={e => { e.stopPropagation(); exportReportPdf(item); }}
                  data-testid={`button-pdf-${item.id}`}
                >
                  <Download className="w-3 h-3 mr-1" />Export PDF
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground text-right">{filtered.length} of {items.length} reports • Click card for full detail</div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4 text-blue-400" />Intel Report</DialogTitle>
          </DialogHeader>
          {selected && (
            <ReportDetail
              item={selected}
              onDelete={() => deleteMutation.mutate(selected.id)}
              deleting={deleteMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Compose new report dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-primary" />Compose Intel Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Q3 2025 Threat Landscape Report" className="mt-1 h-8 text-sm" data-testid="input-report-title" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Report Type</Label>
                <Select value={form.reportType} onValueChange={v => setForm(f => ({ ...f, reportType: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(reportTypeLabels).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">TLP Level</Label>
                <Select value={form.tlpLevel} onValueChange={v => setForm(f => ({ ...f, tlpLevel: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">TLP:WHITE</SelectItem>
                    <SelectItem value="green">TLP:GREEN</SelectItem>
                    <SelectItem value="amber">TLP:AMBER</SelectItem>
                    <SelectItem value="red">TLP:RED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Authors (comma-separated)</Label>
              <Input value={form.authors} onChange={e => setForm(f => ({ ...f, authors: e.target.value }))} placeholder="e.g. CTI Team, Mandiant, CISA" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Confidence (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: parseInt(e.target.value) || 0 }))} className="mt-1 h-8 text-sm w-24" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Executive summary…" className="mt-1 text-sm min-h-[60px]" />
            </div>
            <div>
              <Label className="text-xs">Full Report Content</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="## Overview&#10;&#10;Detailed analysis…" className="mt-1 text-sm min-h-[100px] font-mono" />
            </div>
            <div>
              <Label className="text-xs">Labels (comma-separated)</Label>
              <Input value={form.labels} onChange={e => setForm(f => ({ ...f, labels: e.target.value }))} placeholder="e.g. ransomware, advisory, 2025" className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSubmitReport}
              disabled={createMutation.isPending || !form.title}
              data-testid="button-submit-report"
            >
              {createMutation.isPending ? "Creating…" : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
