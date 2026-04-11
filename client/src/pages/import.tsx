import { useState, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  File,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  Brain,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ACCEPTED_FORMATS = [".csv", ".xlsx", ".xls", ".tsv", ".pdf"];

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv") return FileSpreadsheet;
  if (ext === "xlsx" || ext === "xls") return FileSpreadsheet;
  if (ext === "pdf") return FileText;
  return File;
}

export default function ImportPage() {
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    total: number;
    skipped: number;
    message: string;
    incidentsCreated?: number;
    eventsCreated?: number;
    columnsDetected?: string[];
    aiEnriched?: number;
    duplicatesSkipped?: number;
    importType?: string;
    assetsCreated?: number;
    assetsUpdated?: number;
    totalRows?: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{
    enriched: number;
    remaining: number;
    message?: string;
  } | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ aiEnriched: number; aiTotal: number; active: boolean }>({ aiEnriched: 0, aiTotal: 0, active: false });
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    fileName: string;
    totalRows: number;
    columnsDetected: string[];
    sampleData: any[];
    aiAnalysis: {
      dataType: string;
      confidence: number;
      vendor: string;
      description: string;
      columnMapping: Record<string, string>;
      suggestedEnrichments: string[];
      importRoute: string;
      warnings: string[];
    };
  } | null>(null);

  const handleSmartAnalyze = async () => {
    if (!file || !currentTenant) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tenantId", String(currentTenant.id));
      const response = await fetch("/api/ai/smart-import-analyze", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Analysis failed");
      }
      const data = await response.json();
      setAiAnalysis(data);
      toast({ title: "AI Analysis Complete", description: `Detected: ${data.aiAnalysis.dataType} (${data.aiAnalysis.confidence}% confidence)` });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/enrich-events", {
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setEnrichResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/security-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "Enrichment complete",
        description: data.message || `${data.enriched} events enriched`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Enrichment failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleFile = useCallback((f: File) => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_FORMATS.includes(ext)) {
      toast({
        title: "Unsupported format",
        description: "Please upload a CSV, Excel (.xlsx/.xls), or PDF file.",
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    setResult(null);
    setAiAnalysis(null);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file || !currentTenant) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tenantId", String(currentTenant.id));

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import failed");
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        setEnrichProgress({ aiEnriched: 0, aiTotal: 0, active: true });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) { setUploading(false); return; }

        let buffer = "";
        let lastData: any = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const ev = JSON.parse(line.slice(6));
                lastData = ev;
                setEnrichProgress({ aiEnriched: ev.aiEnriched || 0, aiTotal: ev.aiTotal || 0, active: !ev.done });
                if (ev.done) {
                  setResult({
                    imported: ev.imported || 0,
                    total: ev.total || 0,
                    skipped: ev.skipped || 0,
                    message: `Imported ${ev.incidentsCreated || 0} incidents and ${ev.eventsCreated || 0} events. AI enriched ${ev.aiEnriched || 0} incidents.${ev.duplicatesSkipped ? ` ${ev.duplicatesSkipped} duplicates skipped.` : ""}`,
                    incidentsCreated: ev.incidentsCreated,
                    eventsCreated: ev.eventsCreated,
                    columnsDetected: ev.columnsDetected,
                    aiEnriched: ev.aiEnriched,
                    duplicatesSkipped: ev.duplicatesSkipped || 0,
                  });
                }
              } catch {}
            }
          }
        }
        setEnrichProgress(p => ({ ...p, active: false }));
        if (!result && lastData) {
          setResult({
            imported: lastData.imported || 0,
            total: lastData.total || 0,
            skipped: lastData.skipped || 0,
            message: `Imported ${lastData.incidentsCreated || 0} incidents and ${lastData.eventsCreated || 0} events. AI enriched ${lastData.aiEnriched || 0} incidents.${lastData.duplicatesSkipped ? ` ${lastData.duplicatesSkipped} duplicates skipped.` : ""}`,
            incidentsCreated: lastData.incidentsCreated,
            eventsCreated: lastData.eventsCreated,
            columnsDetected: lastData.columnsDetected,
            aiEnriched: lastData.aiEnriched,
            duplicatesSkipped: lastData.duplicatesSkipped || 0,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/security-events"] });
        toast({
          title: "Import & Enrichment Complete",
          description: lastData ? `Imported ${lastData.incidentsCreated || 0} incidents, ${lastData.eventsCreated || 0} events. AI enriched ${lastData.aiEnriched || 0} incidents.` : "Import complete",
        });
      } else {
        const data = await response.json();
        if (data.importType === "inventory") {
          setResult({
            imported: data.assetsCreated || 0,
            total: data.totalRows || 0,
            skipped: 0,
            message: data.message,
            importType: "inventory",
            assetsCreated: data.assetsCreated,
            assetsUpdated: data.assetsUpdated,
            totalRows: data.totalRows,
            columnsDetected: data.detectedColumns,
          });
        } else {
          setResult(data);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/security-events"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        toast({
          title: data.importType === "inventory" ? "Asset Inventory Imported" : "Import successful",
          description: data.message,
        });
      }
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setEnrichProgress(p => ({ ...p, active: false }));
    }
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {currentTenant?.name} -- Import security events from CSV, Excel, or PDF
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
              data-testid="dropzone-import"
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Drop file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports CSV, TSV, Excel (.xlsx/.xls), and PDF formats
              </p>
              <input
                id="file-input"
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                data-testid="input-file-import"
              />
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30" data-testid="selected-file-info">
                {(() => {
                  const Icon = getFileIcon(file.name);
                  return <Icon className="w-5 h-5 text-primary shrink-0" />;
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSmartAnalyze}
                    disabled={analyzing || uploading}
                    data-testid="button-smart-analyze"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="w-3.5 h-3.5 mr-1.5" />
                        AI Analyze
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={uploading}
                    data-testid="button-upload"
                  >
                    {uploading ? (
                      enrichProgress.active ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          AI Enriching {enrichProgress.aiEnriched}/{enrichProgress.aiTotal}...
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Importing...
                        </>
                      )
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {aiAnalysis && (
              <div className="p-4 rounded-md bg-indigo-500/10 border border-indigo-500/20 space-y-3" data-testid="ai-analysis-result">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">AI Analysis Result</p>
                      <Badge variant="secondary" className="text-[10px]">{aiAnalysis.aiAnalysis.confidence}% confidence</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{aiAnalysis.aiAnalysis.description}</p>

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="p-2.5 rounded-md bg-background border">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Data Type</p>
                        <p className="text-xs font-semibold">{aiAnalysis.aiAnalysis.dataType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-background border">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Vendor</p>
                        <p className="text-xs font-semibold">{aiAnalysis.aiAnalysis.vendor}</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-background border">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Import Route</p>
                        <p className="text-xs font-semibold capitalize">{aiAnalysis.aiAnalysis.importRoute}</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-background border">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total Rows</p>
                        <p className="text-xs font-semibold">{aiAnalysis.totalRows.toLocaleString()}</p>
                      </div>
                    </div>

                    {Object.keys(aiAnalysis.aiAnalysis.columnMapping || {}).filter(k => aiAnalysis.aiAnalysis.columnMapping[k]).length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">Column Mapping:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(aiAnalysis.aiAnalysis.columnMapping)
                            .filter(([, v]) => v)
                            .map(([field, col]) => (
                              <div key={field} className="text-[10px] flex items-center gap-1">
                                <span className="text-muted-foreground">{field.replace(/_column$/, "").replace(/_/g, " ")}:</span>
                                <code className="bg-muted px-1 rounded text-primary">{col}</code>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {aiAnalysis.aiAnalysis.suggestedEnrichments?.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className="text-[10px] text-muted-foreground">Enrichments:</span>
                        {aiAnalysis.aiAnalysis.suggestedEnrichments.map(e => (
                          <Badge key={e} variant="outline" className="text-[9px] bg-indigo-500/5">{e}</Badge>
                        ))}
                      </div>
                    )}

                    {aiAnalysis.aiAnalysis.warnings?.length > 0 && (
                      <div className="mt-1">
                        {aiAnalysis.aiAnalysis.warnings.map((w, i) => (
                          <p key={i} className="text-[10px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />{w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="p-4 rounded-md bg-chart-2/10 border border-chart-2/20" data-testid="import-result">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-chart-2 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{result.message}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {result.importType === "inventory" ? (
                        <>
                          <Badge variant="secondary" className="text-[10px]">
                            {result.assetsCreated || 0} new assets
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {result.assetsUpdated || 0} updated
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {result.totalRows || 0} total rows
                          </Badge>
                        </>
                      ) : (
                        <>
                          {result.incidentsCreated !== undefined && (
                            <Badge variant="secondary" className="text-[10px]">
                              {result.incidentsCreated} incidents
                            </Badge>
                          )}
                          {result.eventsCreated !== undefined && (
                            <Badge variant="secondary" className="text-[10px]">
                              {result.eventsCreated} security events
                            </Badge>
                          )}
                          {result.skipped > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {result.skipped} skipped
                            </Badge>
                          )}
                          {(result.duplicatesSkipped ?? 0) > 0 && (
                            <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
                              {result.duplicatesSkipped} duplicates skipped
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                    {result.columnsDetected && result.columnsDetected.length > 0 && (
                      <div className="mt-2" data-testid="columns-detected">
                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">Columns Detected:</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {result.columnsDetected.map((col) => (
                            <Badge key={col} variant="outline" className="text-[10px]">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {result && result.importType !== "inventory" && (
              <div className="p-4 rounded-md bg-primary/5 border border-primary/10" data-testid="ai-enrich-section">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary shrink-0" />
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-medium">AI Enrichment</p>
                    <p className="text-[10px] text-muted-foreground">
                      Use AI to automatically enrich imported security events with severity classification, MITRE ATT&CK mapping, and actionable recommendations.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => enrichMutation.mutate()}
                      disabled={enrichMutation.isPending}
                      data-testid="button-enrich"
                    >
                      {enrichMutation.isPending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Enriching...
                        </>
                      ) : (
                        <>
                          <Brain className="w-3.5 h-3.5 mr-1.5" />
                          Enrich with AI
                        </>
                      )}
                    </Button>
                    {enrichResult && (
                      <div className="mt-2 p-3 rounded-md bg-chart-2/10 border border-chart-2/20" data-testid="enrich-result">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {enrichResult.enriched} enriched
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {enrichResult.remaining} remaining
                          </Badge>
                        </div>
                        {enrichResult.message && (
                          <p className="text-[10px] text-muted-foreground mt-1">{enrichResult.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="w-4 h-4" />
              File Format Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-chart-2" />
                  <span className="text-xs font-medium">Asset Inventory (CAASM)</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Auto-detects XDR agent inventory exports (Palo Alto Cortex, CrowdStrike, etc.):
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { col: "Endpoint Name", desc: "Hostname / device name" },
                    { col: "IP Address", desc: "IPv4 endpoint address" },
                    { col: "Mac Address", desc: "Hardware MAC address" },
                    { col: "Operating System", desc: "OS name and version" },
                    { col: "Agent Version", desc: "XDR agent version" },
                    { col: "Endpoint Type", desc: "Workstation / Server" },
                    { col: "Prevention Policy", desc: "Assigned security policy" },
                    { col: "Deployment Type", desc: "On Prem / AWS / Azure / GCP" },
                    { col: "Cloud Provider", desc: "Cloud platform name" },
                  ].map(({ col, desc }) => (
                    <div key={col} className="text-[10px]">
                      <code className="bg-muted px-1 rounded text-primary">{col}</code>
                      <span className="text-muted-foreground ml-1">- {desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium">Security Incidents / Events</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Auto-detects columns from XDR, SIEM, and other security platforms:
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { col: "Incident Name", desc: "Alert title / threat name" },
                    { col: "Severity", desc: "critical, high, medium, low" },
                    { col: "Status", desc: "Open, In Progress, Resolved, Closed" },
                    { col: "Case Description", desc: "Detailed incident description" },
                    { col: "Asset Names / Host", desc: "Affected endpoints or hosts" },
                    { col: "MITRE ATT&CK", desc: "Tactic & technique mapping" },
                    { col: "Assignee", desc: "Assigned analyst or responder" },
                    { col: "Total Risk / Score", desc: "Risk score (numeric)" },
                  ].map(({ col, desc }) => (
                    <div key={col} className="text-[10px]">
                      <code className="bg-muted px-1 rounded text-primary">{col}</code>
                      <span className="text-muted-foreground ml-1">- {desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium">Supported File Types</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  <strong>Excel (.xlsx/.xls)</strong> — Tabular and vertical incident report formats with smart header detection.
                  <br /><strong>CSV / TSV</strong> — Comma or tab-separated exports from any security platform.
                  <br /><strong>PDF</strong> — Text extraction with line-by-line parsing.
                </p>
              </div>

              <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground">
                    Imported data creates both <strong>incidents</strong> and <strong>security events</strong> for {currentTenant?.name || "the current tenant"}, enriching dashboards, analytics, and reports.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
