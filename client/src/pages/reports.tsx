import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  FileText, Sparkles, Download, Eye, Loader2, CheckCircle2, Mail, Monitor,
  Bug, BarChart3, ShieldCheck, Crosshair, AlertTriangle, Cloud, Package,
  Map, Timer, Activity, Gauge, X, TrendingUp, TrendingDown, Minus,
  Lock, BookOpen, ListChecks, Target, ChevronRight, FileDown, Shield,
  ArrowUp, ArrowDown, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, PieChart, Pie, Cell,
} from "recharts";

const REPORT_TYPES: Record<string, { label: string; icon: any; color: string; bg: string; accent: string }> = {
  executive_summary: { label: "Executive Summary", icon: BarChart3, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", accent: "hsl(217, 91%, 55%)" },
  endpoint: { label: "Endpoint Report", icon: Monitor, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", accent: "hsl(0, 72%, 51%)" },
  email: { label: "Email Report", icon: Mail, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", accent: "hsl(271, 76%, 53%)" },
  vulnerability: { label: "Vulnerability Report", icon: Bug, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", accent: "hsl(25, 95%, 53%)" },
  compliance: { label: "Compliance Report", icon: ShieldCheck, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", accent: "hsl(142, 71%, 45%)" },
  threat_intelligence: { label: "Threat Intelligence", icon: Crosshair, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", accent: "hsl(192, 91%, 36%)" },
  incident_response: { label: "Incident Response", icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", accent: "hsl(45, 93%, 47%)" },
  cloud_security: { label: "Cloud Security", icon: Cloud, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", accent: "hsl(199, 89%, 48%)" },
  asset_inventory: { label: "Asset Inventory", icon: Package, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10", accent: "hsl(173, 80%, 36%)" },
  threat_landscape: { label: "Threat Landscape", icon: Map, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", accent: "hsl(347, 77%, 50%)" },
  sla_performance: { label: "SLA Performance", icon: Timer, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", accent: "hsl(38, 92%, 50%)" },
  soc_operations: { label: "SOC Operations", icon: Activity, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10", accent: "hsl(239, 84%, 67%)" },
  risk_posture: { label: "Risk Posture", icon: Gauge, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", accent: "hsl(160, 84%, 39%)" },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "hsl(0, 72%, 51%)",
  high: "hsl(25, 95%, 53%)",
  medium: "hsl(45, 93%, 47%)",
  low: "hsl(142, 71%, 45%)",
};

const CHART_PALETTE = [
  "hsl(217, 91%, 55%)", "hsl(142, 71%, 45%)", "hsl(271, 76%, 53%)",
  "hsl(25, 95%, 53%)", "hsl(192, 91%, 36%)", "hsl(347, 77%, 50%)",
  "hsl(45, 93%, 47%)", "hsl(199, 89%, 48%)",
];

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

function getTypeInfo(reportType: string) {
  return REPORT_TYPES[reportType] || REPORT_TYPES.executive_summary;
}

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatPeriod(period: string) {
  return period.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionHeading({ id, title, icon: Icon }: { id: string; title: string; icon?: any }) {
  return (
    <div id={id} className="scroll-mt-20">
      <div className="flex items-center gap-3 mb-4">
        {Icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <Separator className="mb-6" />
    </div>
  );
}

function FullScreenReportViewer({ report, onClose }: { report: Report; onClose: () => void }) {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState("cover");

  const typeInfo = getTypeInfo((report as any).reportType || "executive_summary");
  const TypeIcon = typeInfo.icon;
  const findings = (report.findings as any[]) || [];
  const recommendations = (report.recommendations as any[]) || [];
  const metrics = (report.metrics as any) || {};
  const keyHighlights = metrics.keyHighlights || [];
  const riskMatrix = metrics.riskMatrix || [];
  const sections = metrics.sections || [];
  const trendAnalysis = metrics.trendAnalysis || "";
  const complianceNotes = metrics.complianceNotes || "";
  const conclusion = metrics.conclusion || "";

  const topMetrics: { key: string; value: any }[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (
      typeof value === "number" || typeof value === "string"
    ) {
      if (!["keyHighlights", "riskMatrix", "trendAnalysis", "complianceNotes", "sections", "conclusion"].includes(key)) {
        topMetrics.push({ key, value });
      }
    }
  }

  const tocItems: { id: string; label: string }[] = [
    { id: "cover", label: "Cover Page" },
  ];
  if (keyHighlights.length > 0) tocItems.push({ id: "highlights", label: "Key Highlights" });
  if (report.executiveSummary) tocItems.push({ id: "executive-summary", label: "Executive Summary" });
  if (topMetrics.length > 0) tocItems.push({ id: "metrics", label: "Metrics Dashboard" });
  if (findings.length > 0) tocItems.push({ id: "findings", label: "Findings" });
  if (riskMatrix.length > 0) tocItems.push({ id: "risk-matrix", label: "Risk Matrix" });
  sections.forEach((s: any, i: number) => {
    tocItems.push({ id: `section-${i}`, label: s.title });
  });
  if (recommendations.length > 0) tocItems.push({ id: "recommendations", label: "Recommendations" });
  if (trendAnalysis) tocItems.push({ id: "trend-analysis", label: "Trend Analysis" });
  if (complianceNotes) tocItems.push({ id: "compliance", label: "Compliance Notes" });
  if (conclusion) tocItems.push({ id: "conclusion", label: "Conclusion" });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleExportPDF = useCallback(async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const el = reportRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        backgroundColor: "#ffffff",
      });
      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pxPerMm = canvas.width / pageWidthMm;
      const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);
      const totalPages = Math.ceil(canvas.height / pageHeightPx);
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const srcY = page * pageHeightPx;
        const srcH = Math.min(pageHeightPx, canvas.height - srcY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
          const pageImg = pageCanvas.toDataURL("image/png");
          const drawH = (srcH / pxPerMm);
          pdf.addImage(pageImg, "PNG", 0, 0, pageWidthMm, drawH);
        }
      }
      pdf.save(`${report.title.replace(/\s+/g, "_")}.pdf`);
      toast({ title: "PDF exported", description: "Report has been downloaded as PDF." });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    }
    setExporting(false);
  }, [report.title, toast]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const effortDots = (effort: string) => {
    const level = effort === "high" ? 3 : effort === "medium" ? 2 : 1;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3].map((d) => (
          <Circle
            key={d}
            className={`w-2 h-2 ${d <= level ? "fill-current text-foreground" : "text-muted-foreground/30"}`}
          />
        ))}
      </div>
    );
  };

  const riskColor = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    if (score >= 16) return "bg-red-500/20 dark:bg-red-500/30 text-red-700 dark:text-red-300";
    if (score >= 9) return "bg-orange-500/20 dark:bg-orange-500/30 text-orange-700 dark:text-orange-300";
    if (score >= 4) return "bg-yellow-500/20 dark:bg-yellow-500/30 text-yellow-700 dark:text-yellow-300";
    return "bg-green-500/20 dark:bg-green-500/30 text-green-700 dark:text-green-300";
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex" data-testid="report-viewer-overlay">
      <div className="w-60 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-md ${typeInfo.bg} flex items-center justify-center`}>
              <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{typeInfo.label}</p>
              <p className="text-[10px] text-muted-foreground">{formatDate(report.createdAt)}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5" data-testid="report-toc-nav">
          {tocItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                activeSection === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`toc-link-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2">
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            onClick={handleExportPDF}
            disabled={exporting}
            data-testid="button-export-pdf"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {exporting ? "Exporting..." : "Export PDF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={onClose}
            data-testid="button-close-viewer"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-background">
        <div ref={reportRef} className="max-w-4xl mx-auto">
          <div id="cover" className="scroll-mt-4 p-10 min-h-[60vh] flex flex-col justify-center relative">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 39px, ${typeInfo.accent} 39px, ${typeInfo.accent} 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, ${typeInfo.accent} 39px, ${typeInfo.accent} 40px)`,
              }}
            />
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${typeInfo.accent}15` }}
                >
                  <TypeIcon className="w-8 h-8" style={{ color: typeInfo.accent }} />
                </div>
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider">
                    {typeInfo.label}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground">{formatPeriod(report.period)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight leading-tight">{report.title}</h1>
                <p className="text-sm text-muted-foreground">
                  Prepared for {currentTenant?.name || "Organization"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Generated on {formatDate(report.createdAt)}
                </p>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Badge variant={report.status === "published" ? "default" : "secondary"}>
                  {report.status}
                </Badge>
                <Badge variant="outline">{formatPeriod(report.period)}</Badge>
              </div>

              <div className="mt-8 p-4 rounded-md bg-muted/30 border border-muted">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Confidentiality Notice
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  CONFIDENTIAL - FOR INTERNAL USE ONLY. This report contains sensitive security information.
                  Distribution is restricted to authorized personnel only.
                </p>
              </div>
            </div>
          </div>

          <div className="px-10 pb-10 space-y-10">
            {tocItems.length > 2 && (
              <div className="p-6 rounded-md bg-muted/20 border">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Table of Contents
                </h3>
                <div className="space-y-1">
                  {tocItems.filter((t) => t.id !== "cover").map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`toc-item-${item.id}`}
                    >
                      <span className="text-[10px] font-mono w-5 text-right">{i + 1}.</span>
                      <ChevronRight className="w-3 h-3" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {keyHighlights.length > 0 && (
              <div>
                <SectionHeading id="highlights" title="Key Highlights" icon={TrendingUp} />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {keyHighlights.map((h: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{h.label}</p>
                        <p className="text-2xl font-bold tracking-tight">{h.value}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {h.trend === "up" && <ArrowUp className="w-3 h-3 text-green-500" />}
                          {h.trend === "down" && <ArrowDown className="w-3 h-3 text-red-500" />}
                          {h.trend === "stable" && <Minus className="w-3 h-3 text-muted-foreground" />}
                          {h.trendDetail && (
                            <span className="text-[10px] text-muted-foreground">{h.trendDetail}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {report.executiveSummary && (
              <div>
                <SectionHeading id="executive-summary" title="Executive Summary" icon={Sparkles} />
                <div className="pl-4 border-l-2" style={{ borderColor: typeInfo.accent }}>
                  <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {report.executiveSummary}
                  </div>
                </div>
              </div>
            )}

            {topMetrics.length > 0 && (
              <div>
                <SectionHeading id="metrics" title="Metrics Dashboard" icon={BarChart3} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {topMetrics.map(({ key, value }) => (
                    <Card key={key}>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold tracking-tight">{String(value)}</p>
                        <p className="text-[10px] text-muted-foreground capitalize mt-1">
                          {key.replace(/_/g, " ")}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {findings.length > 0 && (
              <div>
                <SectionHeading id="findings" title="Findings" icon={AlertTriangle} />
                <div className="space-y-3">
                  {findings.map((finding: any, i: number) => {
                    const sevColor = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.medium;
                    return (
                      <Card key={i} data-testid={`finding-card-${i}`}>
                        <CardContent className="p-0">
                          <div className="flex">
                            <div className="w-1 rounded-l-md shrink-0" style={{ backgroundColor: sevColor }} />
                            <div className="p-4 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold">{finding.title}</h4>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase shrink-0"
                                  style={{ borderColor: sevColor, color: sevColor }}
                                >
                                  {finding.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{finding.description}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {finding.impact && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Impact: {finding.impact}
                                  </Badge>
                                )}
                                {finding.affectedSystems && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {finding.affectedSystems}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {riskMatrix.length > 0 && (
              <div>
                <SectionHeading id="risk-matrix" title="Risk Matrix" icon={Target} />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-left font-semibold text-muted-foreground border-b">Risk</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground border-b w-20">Likelihood</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground border-b w-20">Impact</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground border-b w-20">Score</th>
                        <th className="p-2 text-left font-semibold text-muted-foreground border-b">Mitigation</th>
                        <th className="p-2 text-left font-semibold text-muted-foreground border-b">Residual Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskMatrix.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-muted/50" data-testid={`risk-row-${i}`}>
                          <td className="p-2 font-medium">{r.risk}</td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold ${riskColor(r.likelihood, 1)}`}>
                              {r.likelihood}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold ${riskColor(1, r.impact)}`}>
                              {r.impact}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-7 rounded-md text-[11px] font-bold ${riskColor(r.likelihood, r.impact)}`}>
                              {r.likelihood * r.impact}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">{r.currentMitigation}</td>
                          <td className="p-2 text-muted-foreground">{r.residualRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">
                    Risk Heat Map (Likelihood vs Impact)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-[10px]">
                      <thead>
                        <tr>
                          <th className="p-1 w-20"></th>
                          {[1, 2, 3, 4, 5].map((imp) => (
                            <th key={imp} className="p-1 text-center text-muted-foreground w-16">
                              Impact {imp}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[5, 4, 3, 2, 1].map((lik) => (
                          <tr key={lik}>
                            <td className="p-1 text-muted-foreground font-medium">Likelihood {lik}</td>
                            {[1, 2, 3, 4, 5].map((imp) => {
                              const risksHere = riskMatrix.filter(
                                (r: any) => r.likelihood === lik && r.impact === imp
                              );
                              return (
                                <td key={imp} className={`p-1.5 rounded-sm ${riskColor(lik, imp)}`}>
                                  {risksHere.length > 0 && (
                                    <div className="space-y-0.5">
                                      {risksHere.map((r: any, ri: number) => (
                                        <div key={ri} className="truncate font-medium">{r.risk}</div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {sections.map((section: any, i: number) => (
              <div key={i}>
                <SectionHeading id={`section-${i}`} title={section.title} icon={FileText} />
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap mb-6">
                  {section.content}
                </div>
                {section.chartData && section.chartData.length > 0 && (
                  <div className="p-4 rounded-md bg-muted/20 border">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={section.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
                          {section.chartData.map((_: any, ci: number) => (
                            <Cell key={ci} fill={CHART_PALETTE[ci % CHART_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}

            {recommendations.length > 0 && (
              <div>
                <SectionHeading id="recommendations" title="Recommendations" icon={ListChecks} />
                <div className="space-y-3">
                  {recommendations.map((rec: any, i: number) => (
                    <Card key={i} data-testid={`recommendation-card-${i}`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                            <h4 className="text-sm font-semibold">{rec.title}</h4>
                          </div>
                          {rec.priority && (
                            <Badge
                              variant={rec.priority === "critical" || rec.priority === "high" ? "destructive" : "secondary"}
                              className="text-[10px] uppercase shrink-0"
                            >
                              {rec.priority}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-6">{rec.description}</p>
                        <div className="flex items-center gap-3 pl-6 flex-wrap">
                          {rec.effort && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground">Effort:</span>
                              {effortDots(rec.effort)}
                            </div>
                          )}
                          {rec.timeline && (
                            <Badge variant="outline" className="text-[10px]">
                              {rec.timeline}
                            </Badge>
                          )}
                          {rec.category && (
                            <Badge variant="outline" className="text-[10px]">
                              {rec.category}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {trendAnalysis && (
              <div>
                <SectionHeading id="trend-analysis" title="Trend Analysis" icon={TrendingUp} />
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {trendAnalysis}
                </div>
              </div>
            )}

            {complianceNotes && (
              <div>
                <SectionHeading id="compliance" title="Compliance Notes" icon={Shield} />
                <div className="p-5 rounded-md bg-muted/20 border">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {complianceNotes}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {conclusion && (
              <div>
                <SectionHeading id="conclusion" title="Conclusion" icon={FileText} />
                <div className="p-5 rounded-md border" style={{ borderColor: `${typeInfo.accent}30` }}>
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {conclusion}
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t text-center">
                  <p className="text-[10px] text-muted-foreground">
                    End of Report - {report.title} - Generated {formatDate(report.createdAt)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    CONFIDENTIAL - FOR INTERNAL USE ONLY
                  </p>
                </div>
              </div>
            )}

            {!conclusion && (
              <div className="pt-6 border-t text-center">
                <p className="text-[10px] text-muted-foreground">
                  End of Report - {report.title} - Generated {formatDate(report.createdAt)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { currentTenant, isMSS } = useTenant();
  const { toast } = useToast();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [selectedReportType, setSelectedReportType] = useState("executive_summary");

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/reports/generate", {
        ...data,
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", currentTenant?.id] });
      setGenerateDialogOpen(false);
      toast({ title: "Report generated", description: "AI has generated your security report and saved it to disk." });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    generateMutation.mutate({
      title: formData.get("title"),
      period: formData.get("period"),
      reportType: selectedReportType,
    });
  };

  const handleDownload = async (reportId: number) => {
    try {
      const response = await fetch(`/api/reports/download/${reportId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Download failed");
      const disposition = response.headers.get("content-disposition");
      let filename = `report_${reportId}.json`;
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  if (viewingReport) {
    return <FullScreenReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />;
  }

  const selectedTypeInfo = getTypeInfo(selectedReportType);

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Security Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- AI-powered report generation
          </p>
        </div>
        {isMSS && (
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-generate-report">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  AI Report Generator
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGenerate} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="report-title">Report Title</Label>
                  <Input
                    id="report-title"
                    name="title"
                    defaultValue={`Monthly Security Report - ${currentTenant?.name}`}
                    required
                    data-testid="input-report-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                    <SelectTrigger data-testid="select-report-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REPORT_TYPES).map(([key, info]) => {
                        const Icon = info.icon;
                        return (
                          <SelectItem key={key} value={key} data-testid={`select-item-${key}`}>
                            <span className="flex items-center gap-2">
                              <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                              {info.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Report Period</Label>
                  <Select name="period" defaultValue="last_month">
                    <SelectTrigger data-testid="select-report-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_week">Last Week</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="last_quarter">Last Quarter</SelectItem>
                      <SelectItem value="last_year">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 rounded-md bg-muted/30 border">
                  <div className="flex items-start gap-2">
                    <selectedTypeInfo.icon className={`w-4 h-4 mt-0.5 ${selectedTypeInfo.color}`} />
                    <p className="text-xs text-muted-foreground">
                      AI will analyze{" "}
                      {selectedReportType === "email"
                        ? "email security events"
                        : selectedReportType === "endpoint"
                          ? "endpoint threats and malware"
                          : selectedReportType === "vulnerability"
                            ? "vulnerability scan data"
                            : "all security data"}{" "}
                      and generate a comprehensive {selectedTypeInfo.label.toLowerCase()} saved to disk.
                    </p>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={generateMutation.isPending} data-testid="button-submit-report">
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Generating with AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Generate Report
                    </>
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No reports generated</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {isMSS
                ? "Click 'Generate Report' to create your first AI-powered security report"
                : "No reports available at this time"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const typeInfo = getTypeInfo((report as any).reportType || "executive_summary");
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={report.id} className="hover-elevate overflow-visible" data-testid={`card-report-${report.id}`}>
                <CardContent className="p-0">
                  <div
                    className="h-1.5 rounded-t-md"
                    style={{ background: `linear-gradient(90deg, ${typeInfo.accent}, ${typeInfo.accent}80)` }}
                  />
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-10 h-10 rounded-md ${typeInfo.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
                      </div>
                      <Badge variant={report.status === "published" ? "default" : "secondary"} className="text-[10px]">
                        {report.status}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-semibold line-clamp-2 leading-snug">{report.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{typeInfo.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{formatPeriod(report.period)}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(report.createdAt)}
                      </p>
                    </div>
                    {report.executiveSummary && (
                      <p className="text-[10px] text-muted-foreground line-clamp-3 leading-relaxed">
                        {report.executiveSummary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => setViewingReport(report)}
                        data-testid={`button-view-report-${report.id}`}
                      >
                        <Eye className="w-3 h-3 mr-1.5" />
                        View Report
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(report.id)}
                        data-testid={`button-download-report-${report.id}`}
                        title="Download JSON"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
