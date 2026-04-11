import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Shield, CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck, ShieldAlert, ArrowUpCircle, Eye, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";

interface IncidentActionData {
  incidentId: number;
  incidentTitle: string;
  severity: string;
  status: string;
  verdict?: string;
  tenantName: string;
  domain?: string;
  actionTaken?: string;
  actionTakenAt?: string;
}

type PageState = "loading" | "ready" | "already_actioned" | "success" | "error_not_found" | "error_server";

function getSeverityVariant(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "destructive";
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "secondary";
  }
}

function getVerdictIcon(verdict?: string) {
  if (!verdict) return null;
  const lower = verdict.toLowerCase();
  if (lower.includes("true") || lower.includes("malicious") || lower.includes("threat")) {
    return <ShieldAlert className="w-3.5 h-3.5" />;
  }
  if (lower.includes("false") || lower.includes("benign") || lower.includes("safe")) {
    return <ShieldCheck className="w-3.5 h-3.5" />;
  }
  return <Shield className="w-3.5 h-3.5" />;
}

export default function IncidentActionPage() {
  const [, params] = useRoute("/incident-action/:token");
  const token = params?.token;

  const [pageState, setPageState] = useState<PageState>("loading");
  const [data, setData] = useState<IncidentActionData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<"close" | "false_positive" | "escalate" | "acknowledge" | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [completedAction, setCompletedAction] = useState("");

  useEffect(() => {
    if (!token) return;

    async function fetchData() {
      try {
        const res = await fetch(`/api/notification-action/${token}`, { credentials: "include" });
        if (res.status === 404) {
          setPageState("error_not_found");
          return;
        }
        if (!res.ok) {
          setErrorMessage("An unexpected error occurred. Please try again later.");
          setPageState("error_server");
          return;
        }
        const json = await res.json();
        setData(json);
        if (json.actionTaken) {
          setPageState("already_actioned");
        } else {
          setPageState("ready");
        }
      } catch {
        setErrorMessage("Unable to connect to the server. Please check your connection.");
        setPageState("error_server");
      }
    }

    fetchData();
  }, [token]);

  async function executeAction(action: "close" | "false_positive" | "escalate" | "acknowledge" | "share") {
    if (!token) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/notification-action/${token}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed");
      if (action === "share" && json.shareUrl) {
        setShareUrl(json.shareUrl);
        setCompletedAction("Investigation Report Link Ready");
      } else {
        const labels: Record<string, string> = {
          close: "Incident Closed",
          false_positive: "Reported as False Positive",
          escalate: "Escalated to Tier 2",
          acknowledge: "Acknowledged & Monitoring",
        };
        setCompletedAction(labels[action] || json.message);
      }
      setPageState("success");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setPageState("already_actioned");
      } else {
        setErrorMessage("Failed to execute action. Please try again.");
        setPageState("error_server");
      }
    } finally {
      setExecuting(false);
      setConfirmAction(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight" data-testid="text-header-title">Cyber Command Center</h1>
            <p className="text-[10px] text-muted-foreground">Incident Action Portal</p>
          </div>
        </div>
      </header>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {pageState === "loading" && (
            <div className="flex flex-col items-center gap-3 py-16" data-testid="status-loading">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Validating action link...</p>
            </div>
          )}

          {pageState === "error_not_found" && (
            <Card data-testid="status-not-found">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <XCircle className="w-12 h-12 text-destructive" />
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-semibold">Invalid or Expired Link</h2>
                  <p className="text-sm text-muted-foreground">This action link is no longer valid. It may have expired or already been used.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {pageState === "error_server" && (
            <Card data-testid="status-error">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <AlertTriangle className="w-12 h-12 text-amber-500" />
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-semibold">Something Went Wrong</h2>
                  <p className="text-sm text-muted-foreground">{errorMessage}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {pageState === "already_actioned" && data && (
            <Card data-testid="status-already-actioned">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <CheckCircle2 className="w-12 h-12 text-muted-foreground" />
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-semibold">Action Already Completed</h2>
                  <p className="text-sm text-muted-foreground">
                    This incident has already been actioned
                    {data.actionTaken ? `: ${data.actionTaken}` : ""}
                    {data.actionTakenAt ? ` on ${new Date(data.actionTakenAt).toLocaleString()}` : ""}.
                  </p>
                </div>
                <IncidentSummaryCard data={data} />
              </CardContent>
            </Card>
          )}

          {pageState === "success" && (
            <Card data-testid="status-success">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-semibold">Action Completed Successfully</h2>
                  <p className="text-sm text-muted-foreground">{completedAction}</p>
                </div>
                {shareUrl && (
                  <div className="w-full p-3 rounded-md bg-muted/50 border text-center">
                    <p className="text-xs text-muted-foreground mb-1">Investigation Report Link:</p>
                    <a href={shareUrl} className="text-sm font-medium text-primary hover:underline" data-testid="link-share-url">{window.location.origin}{shareUrl}</a>
                  </div>
                )}
                {data && <IncidentSummaryCard data={data} />}
              </CardContent>
            </Card>
          )}

          {pageState === "ready" && data && (
            <div className="space-y-4">
              <Card data-testid="card-incident-summary">
                <CardHeader>
                  <CardTitle className="text-base">Incident Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="text-sm font-medium" data-testid="text-tenant-name">{data.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Incident</p>
                    <p className="text-sm font-medium" data-testid="text-incident-title">{data.incidentTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getSeverityVariant(data.severity)} data-testid="badge-severity">
                      {data.severity}
                    </Badge>
                    <Badge variant="outline" data-testid="badge-status">
                      {data.status}
                    </Badge>
                    {data.verdict && (
                      <Badge variant="secondary" data-testid="badge-ai-verdict">
                        {getVerdictIcon(data.verdict)}
                        <span className="ml-1">{data.verdict === "true_positive" ? "True Positive" : data.verdict === "false_positive" ? "False Positive" : "Inconclusive"}</span>
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <p className="text-sm text-muted-foreground text-center">Choose an action for this incident:</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {(() => {
                      const verdict = (data.verdict || "").toLowerCase();
                      const severity = (data.severity || "").toLowerCase();
                      const isTP = verdict.includes("true") || verdict === "true_positive";
                      const isFP = verdict.includes("false") || verdict === "false_positive";

                      const buttons: Array<{ action: "close" | "false_positive" | "escalate" | "acknowledge" | "share"; label: string; icon: any; bg: string }> = [];

                      if (isTP) {
                        buttons.push({ action: "close", label: "Close Incident", icon: CheckCircle2, bg: "bg-green-600" });
                        if (severity === "critical" || severity === "high") {
                          buttons.push({ action: "escalate", label: "Escalate to Tier 2", icon: ArrowUpCircle, bg: "bg-red-600" });
                        } else {
                          buttons.push({ action: "acknowledge", label: "Acknowledge & Monitor", icon: Eye, bg: "bg-sky-600" });
                        }
                        buttons.push({ action: "share", label: "Share Report", icon: Share2, bg: "bg-indigo-600" });
                      } else if (isFP) {
                        buttons.push({ action: "close", label: "Close Incident", icon: CheckCircle2, bg: "bg-green-600" });
                        buttons.push({ action: "false_positive", label: "Report False Positive", icon: ShieldCheck, bg: "bg-amber-500" });
                        buttons.push({ action: "share", label: "Share Report", icon: Share2, bg: "bg-indigo-600" });
                      } else {
                        buttons.push({ action: "escalate", label: "Escalate to Tier 2", icon: ArrowUpCircle, bg: "bg-red-600" });
                        buttons.push({ action: "acknowledge", label: "Acknowledge & Monitor", icon: Eye, bg: "bg-sky-600" });
                        buttons.push({ action: "false_positive", label: "Report False Positive", icon: ShieldCheck, bg: "bg-amber-500" });
                        buttons.push({ action: "share", label: "Share Report", icon: Share2, bg: "bg-indigo-600" });
                      }

                      return buttons.map((b) => {
                        const Icon = b.icon;
                        return (
                          <Button
                            key={b.action}
                            className={`flex-1 ${b.bg} text-white hover:opacity-90`}
                            onClick={() => b.action === "share" ? executeAction("share") : setConfirmAction(b.action)}
                            disabled={executing}
                            data-testid={`button-${b.action}`}
                          >
                            <Icon className="w-4 h-4 mr-2" />
                            {b.label}
                          </Button>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-action">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "close" ? "Close Incident?" :
               confirmAction === "false_positive" ? "Report as False Positive?" :
               confirmAction === "escalate" ? "Escalate to Tier 2?" :
               confirmAction === "acknowledge" ? "Acknowledge & Monitor?" : "Confirm Action"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "close"
                ? "This will close the incident and mark it as resolved. This action cannot be undone."
                : confirmAction === "false_positive"
                ? "This will mark the incident as a false positive. This action cannot be undone."
                : confirmAction === "escalate"
                ? "This will escalate the incident priority and assign it for Tier 2 review."
                : confirmAction === "acknowledge"
                ? "This will acknowledge the alert and keep it under active monitoring without closing it."
                : "Are you sure you want to proceed?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executing} data-testid="button-cancel-action">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmAction) executeAction(confirmAction); }}
              disabled={executing}
              data-testid="button-confirm-action"
            >
              {executing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IncidentSummaryCard({ data }: { data: IncidentActionData }) {
  return (
    <div className="w-full mt-4 p-4 rounded-md border bg-muted/30 space-y-2">
      <p className="text-xs text-muted-foreground">Tenant: <span className="font-medium text-foreground">{data.tenantName}</span></p>
      <p className="text-sm font-medium" data-testid="text-incident-title-summary">{data.incidentTitle}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={getSeverityVariant(data.severity)} data-testid="badge-severity-summary">
          {data.severity}
        </Badge>
        <Badge variant="outline" data-testid="badge-status-summary">
          {data.status}
        </Badge>
      </div>
    </div>
  );
}
