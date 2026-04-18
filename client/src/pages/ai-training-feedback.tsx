import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, CheckCircle2, XCircle, Minus, FileText, Database,
  TrendingUp, Clock, BarChart3, ChevronDown, ChevronRight,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AILearningStats {
  totalFeedback?: number;
  total?: number;
  truePositives?: number;
  falsePositives?: number;
  byCategory?: Record<string, number>;
  modelVersion?: string;
  lastUpdated?: string;
}

interface SecurityEvent {
  id: number;
  eventType: string;
  severity: string;
  threat: string | null;
  target: string | null;
  attacker: string | null;
  asset: string | null;
  description: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  parseConfidence: number | null;
  needsReview: boolean | null;
  rawLog: string | null;
  rawPayload: Record<string, unknown> | null;
  occurredAt: string | null;
  createdAt: string;
}

interface EventsListResponse {
  events: SecurityEvent[];
  totalCount: number;
}

const ATTACK_CATEGORIES = [
  "malware", "ransomware", "apt", "phishing", "spam",
  "web_app", "network_intrusion", "bot", "ai_generative",
  "database", "fileless", "lateral_movement", "ueba",
  "network_anomaly", "cloud_ot",
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

const CATEGORY_THRESHOLDS: Record<string, string> = {
  malware: "0.85",
  ransomware: "0.90",
  apt: "0.75",
  phishing: "0.80",
  spam: "0.70",
  web_app: "0.80",
  network_intrusion: "0.80",
  bot: "0.75",
  ai_generative: "0.70",
  database: "0.85",
  fileless: "0.88",
  lateral_movement: "0.82",
  ueba: "0.78",
  network_anomaly: "0.72",
  cloud_ot: "0.80",
};

type Verdict = "tp" | "fp" | "benign";

interface ReviewItem {
  id: number;
  eventId: number | null;
  timestamp: string;
  category: string;
  confidence: number;
  severity: string;
  rawLog: string;
  parsedResult: Record<string, unknown>;
  flagReason: string;
  reviewed: boolean;
  verdict: Verdict | null;
  notes: string;
}

interface FeedbackPayload {
  tenantId: number;
  category: string;
  verdict: Verdict;
  notes: string;
  confidence: number;
  eventId?: number;
}

function eventToReviewItem(ev: SecurityEvent): ReviewItem {
  return {
    id: ev.id,
    eventId: ev.id,
    timestamp: ev.occurredAt ?? ev.createdAt,
    category: ev.eventType?.replace(/ /g, "_") ?? "unknown",
    confidence: ev.parseConfidence ?? 0,
    severity: ev.severity ?? "medium",
    rawLog: ev.rawLog ?? JSON.stringify(ev.rawPayload ?? {
      threat: ev.threat,
      target: ev.target,
      attacker: ev.attacker,
      asset: ev.asset,
    }, null, 2),
    parsedResult: ev.rawPayload ?? {
      event_type: ev.eventType,
      threat: ev.threat,
      target: ev.target,
      attacker: ev.attacker,
      asset: ev.asset,
      description: ev.description,
    } as Record<string, unknown>,
    flagReason: ev.needsReview
      ? `Low confidence (${ev.parseConfidence ?? 0}%) — needs analyst review`
      : `Confidence below threshold (${ev.parseConfidence ?? 0}%)`,
    reviewed: false,
    verdict: null,
    notes: "",
  };
}

export default function AITrainingFeedbackPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [localItems, setLocalItems] = useState<ReviewItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [localReviewed, setLocalReviewed] = useState<Set<number>>(new Set());

  const eventsQuery = useQuery<EventsListResponse>({
    queryKey: ["/api/events", currentTenant?.id, "needs-review"],
    queryFn: async () => {
      if (!currentTenant?.id) return { events: [], totalCount: 0 };
      const res = await fetch(`/api/events/${currentTenant.id}?pageSize=200`, { credentials: "include" });
      if (!res.ok) return { events: [], totalCount: 0 };
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60000,
  });

  const aiStatsQuery = useQuery<AILearningStats>({
    queryKey: ["/api/ai-learning/stats", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return {};
      const res = await fetch(`/api/ai-learning/stats/${currentTenant.id}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 60000,
  });

  const feedbackMutation = useMutation<void, Error, FeedbackPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/ai-learning/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
    },
  });

  const allApiEvents = eventsQuery.data?.events ?? [];

  const pendingFromApi: ReviewItem[] = useMemo(() => {
    return allApiEvents
      .filter((ev) => ev.needsReview === true || (ev.parseConfidence != null && ev.parseConfidence < 60))
      .filter((ev) => !localReviewed.has(ev.id))
      .map(eventToReviewItem)
      .sort((a, b) => {
        const cdiff = a.confidence - b.confidence;
        if (cdiff !== 0) return cdiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [allApiEvents, localReviewed]);

  const reviewedItems: ReviewItem[] = useMemo(() => {
    return localItems.filter((i) => i.reviewed);
  }, [localItems]);

  const tpCount = reviewedItems.filter((i) => i.verdict === "tp").length;
  const fpCount = reviewedItems.filter((i) => i.verdict === "fp").length;
  const benignCount = reviewedItems.filter((i) => i.verdict === "benign").length;

  const categoryStats = useMemo(() => {
    const byCategory = aiStatsQuery.data?.byCategory ?? {};
    return ATTACK_CATEGORIES.map((cat) => {
      const submitted = byCategory[cat] ?? byCategory[cat.replace(/_/g, " ")] ?? null;
      return {
        category: cat,
        submitted,
        threshold: CATEGORY_THRESHOLDS[cat],
      };
    });
  }, [aiStatsQuery.data]);

  const submitVerdict = (item: ReviewItem, verdict: Verdict) => {
    if (!currentTenant?.id) {
      toast({ title: "No tenant selected", description: "Select a tenant before submitting feedback.", variant: "destructive" });
      return;
    }
    feedbackMutation.mutate(
      {
        tenantId: currentTenant.id,
        category: item.category,
        verdict,
        notes: item.notes,
        confidence: item.confidence,
        ...(item.eventId != null ? { eventId: item.eventId } : {}),
      },
      {
        onSuccess: () => {
          setLocalReviewed((prev) => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
          });
          setLocalItems((prev) => {
            const existing = prev.find((i) => i.id === item.id);
            if (existing) {
              return prev.map((i) => i.id === item.id ? { ...i, verdict, reviewed: true } : i);
            }
            return [...prev, { ...item, verdict, reviewed: true }];
          });
          setExpandedId(null);
          toast({
            title: "Feedback submitted",
            description: `Marked as ${verdict === "tp" ? "True Positive" : verdict === "fp" ? "False Positive" : "Benign"}. Training queue updated.`,
          });
        },
        onError: (err) => {
          toast({ title: "Submission failed", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  const updateNote = (id: number, notes: string) => {
    setLocalItems((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) return prev.map((i) => i.id === id ? { ...i, notes } : i);
      const item = pendingFromApi.find((i) => i.id === id);
      if (item) return [...prev, { ...item, notes }];
      return prev;
    });
  };

  const getItemNotes = (id: number) => localItems.find((i) => i.id === id)?.notes ?? "";

  const liveTotal = aiStatsQuery.data?.totalFeedback ?? aiStatsQuery.data?.total;

  return (
    <div className="flex flex-col min-h-full">
      <PageHero
        icon={Brain}
        title="AI Training & Feedback"
        description="Review low-confidence detections from the pipeline sorted by confidence then recency — provide feedback to improve AI model accuracy"
        badge="Log Intelligence"
        stats={[
          { label: "Pending Review", value: pendingFromApi.length, accent: pendingFromApi.length > 5 },
          { label: "Reviewed (session)", value: reviewedItems.length },
          { label: "True Positives", value: tpCount },
          { label: "Feedback (live)", value: liveTotal ?? "—" },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Pending Review Queue
              <Badge variant="outline" className="text-xs">{pendingFromApi.length} items</Badge>
              <span className="text-[10px] text-muted-foreground ml-1">(lowest confidence · most recent)</span>
            </h3>

            {eventsQuery.isLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Brain className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Loading review queue...</p>
                </CardContent>
              </Card>
            ) : pendingFromApi.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-60" />
                  <p className="text-sm text-muted-foreground">
                    {allApiEvents.length === 0
                      ? "No events available for review yet."
                      : "All low-confidence events have been reviewed!"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pendingFromApi.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const isSubmitting = feedbackMutation.isPending;
                  const itemNotes = getItemNotes(item.id);
                  return (
                    <Card
                      key={item.id}
                      className="overflow-hidden"
                      data-testid={`card-review-${item.id}`}
                    >
                      <button
                        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        data-testid={`button-expand-review-${item.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[item.severity] ?? ""}`}>
                              {item.severity}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {item.category.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{item.flagReason}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${Math.max(item.confidence, 2)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-red-600">{item.confidence}% confidence</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        }
                      </button>

                      {isExpanded && (
                        <div className="border-t p-4 bg-muted/20 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                <FileText className="w-3 h-3" />Raw Log
                              </p>
                              <ScrollArea className="h-[100px]">
                                <pre className="text-[11px] font-mono bg-background rounded border p-2 whitespace-pre-wrap">
                                  {item.rawLog}
                                </pre>
                              </ScrollArea>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                <Database className="w-3 h-3" />AI Parsed Result
                              </p>
                              <ScrollArea className="h-[100px]">
                                <pre className="text-[11px] font-mono bg-background rounded border p-2 whitespace-pre-wrap">
                                  {JSON.stringify(item.parsedResult, null, 2)}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Notes (optional)</p>
                            <Textarea
                              value={itemNotes}
                              onChange={(e) => updateNote(item.id, e.target.value)}
                              placeholder="Add analyst notes about this detection..."
                              className="text-xs h-16 resize-none"
                              data-testid={`textarea-notes-${item.id}`}
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium mr-2">Verdict:</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5 text-green-600 border-green-500/30 hover:bg-green-500/10"
                              disabled={isSubmitting}
                              onClick={() => submitVerdict({ ...item, notes: itemNotes }, "tp")}
                              data-testid={`button-tp-${item.id}`}
                            >
                              {isSubmitting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />}
                              True Positive
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5 text-red-600 border-red-500/30 hover:bg-red-500/10"
                              disabled={isSubmitting}
                              onClick={() => submitVerdict({ ...item, notes: itemNotes }, "fp")}
                              data-testid={`button-fp-${item.id}`}
                            >
                              {isSubmitting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <XCircle className="w-3.5 h-3.5" />}
                              False Positive
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5 text-muted-foreground"
                              disabled={isSubmitting}
                              onClick={() => submitVerdict({ ...item, notes: itemNotes }, "benign")}
                              data-testid={`button-benign-${item.id}`}
                            >
                              {isSubmitting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Minus className="w-3.5 h-3.5" />}
                              Benign
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {reviewedItems.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />Reviewed ({reviewedItems.length})
                </h3>
                {reviewedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/10"
                    data-testid={`row-reviewed-${item.id}`}
                  >
                    <Badge
                      variant="outline"
                      className={`text-[10px] gap-1 ${
                        item.verdict === "tp" ? "text-green-600 border-green-500/30" :
                        item.verdict === "fp" ? "text-red-600 border-red-500/30" :
                        "text-muted-foreground"
                      }`}
                    >
                      {item.verdict === "tp"
                        ? <CheckCircle2 className="w-2.5 h-2.5" />
                        : item.verdict === "fp"
                        ? <XCircle className="w-2.5 h-2.5" />
                        : <Minus className="w-2.5 h-2.5" />}
                      {item.verdict === "tp" ? "True Positive" : item.verdict === "fp" ? "False Positive" : "Benign"}
                    </Badge>
                    <span className="text-[11px] capitalize text-muted-foreground">
                      {item.category.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card data-testid="panel-training-stats">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Training Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-lg font-bold text-green-600">{tpCount + (aiStatsQuery.data?.truePositives ?? 0)}</p>
                    <p className="text-[9px] text-muted-foreground">True Pos</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-lg font-bold text-red-600">{fpCount + (aiStatsQuery.data?.falsePositives ?? 0)}</p>
                    <p className="text-[9px] text-muted-foreground">False Pos</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50 border">
                    <p className="text-lg font-bold">{benignCount}</p>
                    <p className="text-[9px] text-muted-foreground">Benign</p>
                  </div>
                </div>

                {aiStatsQuery.data?.modelVersion && (
                  <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-[10px] font-semibold text-primary uppercase mb-1">AI Learning Engine (live)</p>
                    <div className="text-[10px] space-y-0.5">
                      <div><span className="text-muted-foreground">Model: </span><span className="font-mono">{aiStatsQuery.data.modelVersion}</span></div>
                      {aiStatsQuery.data.lastUpdated && (
                        <div><span className="text-muted-foreground">Updated: </span><span>{new Date(aiStatsQuery.data.lastUpdated).toLocaleDateString()}</span></div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />Submissions by Category
                  </p>
                  <ScrollArea className="h-[260px]">
                    <div className="space-y-1.5">
                      {categoryStats.map((stat) => (
                        <div key={stat.category} data-testid={`row-category-stat-${stat.category}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] capitalize">{stat.category.replace(/_/g, " ")}</span>
                            <span className="text-[10px] font-mono">
                              {stat.submitted != null ? stat.submitted : <span className="text-muted-foreground">—</span>}
                            </span>
                          </div>
                          {stat.submitted != null && (
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.min(100, (stat.submitted / 200) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="panel-threshold-status">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Model Confidence Thresholds
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Default detection confidence thresholds per category</p>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[230px]">
                  <div className="space-y-2">
                    {categoryStats.map((stat) => (
                      <div
                        key={stat.category}
                        className="flex items-center justify-between py-1 border-b border-border/40 last:border-0"
                        data-testid={`row-threshold-${stat.category}`}
                      >
                        <div>
                          <p className="text-[11px] capitalize font-medium">{stat.category.replace(/_/g, " ")}</p>
                          {stat.submitted != null && (
                            <p className="text-[9px] text-muted-foreground">{stat.submitted} samples</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">{stat.threshold}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
