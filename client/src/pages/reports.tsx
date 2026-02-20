import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Report } from "@shared/schema";
import {
  FileText,
  Sparkles,
  Download,
  Eye,
  Loader2,
  CheckCircle2,
  Mail,
  Monitor,
  Bug,
  BarChart3,
  ShieldCheck,
  Crosshair,
  AlertTriangle,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const REPORT_TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  executive_summary: { label: "Executive Summary", icon: BarChart3, color: "text-blue-500" },
  endpoint: { label: "Endpoint Report", icon: Monitor, color: "text-red-500" },
  email: { label: "Email Report", icon: Mail, color: "text-purple-500" },
  vulnerability: { label: "Vulnerability Report", icon: Bug, color: "text-orange-500" },
  compliance: { label: "Compliance Report", icon: ShieldCheck, color: "text-green-500" },
  threat_intelligence: { label: "Threat Intelligence", icon: Crosshair, color: "text-cyan-500" },
  incident_response: { label: "Incident Response", icon: AlertTriangle, color: "text-yellow-500" },
  cloud_security: { label: "Cloud Security", icon: Cloud, color: "text-sky-500" },
};

function ReportViewer({ report }: { report: Report }) {
  const findings = (report.findings as any[]) || [];
  const recommendations = (report.recommendations as any[]) || [];
  const metrics = (report.metrics as any) || {};
  const typeInfo = REPORT_TYPE_LABELS[(report as any).reportType || "executive_summary"];

  return (
    <ScrollArea className="h-[70vh]">
      <div className="space-y-6 pr-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{report.period}</Badge>
            <Badge variant={report.status === "published" ? "default" : "secondary"}>
              {report.status}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {typeInfo && <typeInfo.icon className={`w-3 h-3 ${typeInfo.color}`} />}
              {typeInfo?.label || "Executive Summary"}
            </Badge>
          </div>
          <h2 className="text-lg font-semibold">{report.title}</h2>
        </div>

        {report.executiveSummary && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Executive Summary
            </h3>
            <div className="text-xs leading-relaxed text-muted-foreground bg-muted/30 rounded-md p-4 whitespace-pre-wrap">
              {report.executiveSummary}
            </div>
          </div>
        )}

        {metrics && Object.keys(metrics).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Key Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(metrics).map(([key, value]) => (
                <div key={key} className="p-3 rounded-md bg-muted/30 text-center">
                  <div className="text-lg font-bold">{String(value)}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {findings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Findings</h3>
            <div className="space-y-2">
              {findings.map((finding: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        finding.severity === "critical" ? "bg-destructive" :
                        finding.severity === "high" ? "bg-chart-4" :
                        finding.severity === "medium" ? "bg-chart-1" :
                        "bg-chart-2"
                      }`} />
                      <div className="space-y-1">
                        <p className="text-xs font-medium">{finding.title}</p>
                        <p className="text-[10px] text-muted-foreground">{finding.description}</p>
                        {finding.severity && (
                          <Badge variant="outline" className="text-[10px]">{finding.severity}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recommendations</h3>
            <div className="space-y-2">
              {recommendations.map((rec: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/30">
                  <CheckCircle2 className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">{rec.title}</p>
                    <p className="text-[10px] text-muted-foreground">{rec.description}</p>
                    {rec.priority && (
                      <Badge variant="secondary" className="text-[10px] mt-1">{rec.priority}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default function ReportsPage() {
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [selectedReportType, setSelectedReportType] = useState("executive_summary");

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";

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

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Security Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- AI-powered report generation
          </p>
        </div>
        {isMSS && (
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-generate-report">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Report Generator
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGenerate} className="space-y-4">
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
                    <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="executive_summary">
                        <span className="flex items-center gap-2">
                          <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                          Executive Summary
                        </span>
                      </SelectItem>
                      <SelectItem value="endpoint">
                        <span className="flex items-center gap-2">
                          <Monitor className="w-3.5 h-3.5 text-red-500" />
                          Endpoint Report
                        </span>
                      </SelectItem>
                      <SelectItem value="email">
                        <span className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-purple-500" />
                          Email Report
                        </span>
                      </SelectItem>
                      <SelectItem value="vulnerability">
                        <span className="flex items-center gap-2">
                          <Bug className="w-3.5 h-3.5 text-orange-500" />
                          Vulnerability Report
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Report Period</Label>
                  <Select name="period" defaultValue="last_month">
                    <SelectTrigger data-testid="select-report-period"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_week">Last Week</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="last_quarter">Last Quarter</SelectItem>
                      <SelectItem value="last_year">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
                  <p className="text-xs text-muted-foreground">
                    AI will analyze {selectedReportType === "email" ? "email security events" : selectedReportType === "endpoint" ? "endpoint threats and malware" : selectedReportType === "vulnerability" ? "vulnerability scan data" : "all security data"} and generate a comprehensive report saved to disk.
                  </p>
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-32" /></CardContent></Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No reports generated</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isMSS ? "Click 'Generate Report' to create your first AI-powered security report" : "No reports available at this time"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const typeInfo = REPORT_TYPE_LABELS[(report as any).reportType || "executive_summary"];
            const TypeIcon = typeInfo?.icon || FileText;
            return (
              <Card key={report.id} className="hover-elevate" data-testid={`card-report-${report.id}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                      <TypeIcon className={`w-4 h-4 ${typeInfo?.color || "text-primary"}`} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={report.status === "published" ? "default" : "secondary"} className="text-[10px]">
                        {report.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium line-clamp-2">{report.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{typeInfo?.label || "Executive"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{report.period}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {report.executiveSummary && (
                    <p className="text-[10px] text-muted-foreground line-clamp-3">{report.executiveSummary}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setViewingReport(report)}
                      data-testid={`button-view-report-${report.id}`}
                    >
                      <Eye className="w-3 h-3 mr-1.5" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(report.id)}
                      data-testid={`button-download-report-${report.id}`}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewingReport} onOpenChange={() => setViewingReport(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Security Report
            </DialogTitle>
          </DialogHeader>
          {viewingReport && <ReportViewer report={viewingReport} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
