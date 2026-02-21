import { useState, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  File,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
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
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

      const data = await response.json();
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security-events"] });
      toast({
        title: "Import successful",
        description: data.message,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading}
                  data-testid="button-upload"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            )}

            {result && (
              <div className="p-4 rounded-md bg-chart-2/10 border border-chart-2/20" data-testid="import-result">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-chart-2 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{result.message}</p>
                    <div className="flex items-center gap-3 flex-wrap">
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
                    </div>
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
                  <span className="text-xs font-medium">Supported XDR / SIEM Formats</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Auto-detects columns from Palo Alto Cortex XDR, CrowdStrike, and other platforms:
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
