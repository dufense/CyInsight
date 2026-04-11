import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Code2, Shield, Brain, Save, Send, ChevronRight,
  AlertTriangle, CheckCircle2, Copy, Loader2, Lightbulb,
  Target, FileText, Crosshair, MessageSquare, Sparkles,
  FlameKindling, Eye, TrendingUp, XCircle, ExternalLink,
  Download, Clock, Activity, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MITRE_TACTICS, type MitreTechnique, type MitreTactic } from "@/lib/mitre-attack-data";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low: "text-blue-400 border-blue-500/40 bg-blue-500/10",
};

const CONFIDENCE_COLOR = (c: number) =>
  c >= 80 ? "text-emerald-400" : c >= 60 ? "text-yellow-400" : "text-orange-400";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  ruleYaml?: string;
};

type GeneratedRule = {
  title: string;
  ruleYaml: string;
  mitreTechniques: string[];
  mitreTactic: string;
  killChainPhase: string;
  severity: string;
  confidence: number;
  logSources: string[];
  falsePositives: string[];
  description: string;
  suggestedRefinements: string[];
  isDuplicate: boolean;
  conversationId: string;
};

type MatchedEvent = {
  id: number;
  title: string;
  severity: string;
  status: string;
  attacker: string;
  target: string;
  created_at: string;
  confidence_score: number;
  mitre_technique_id: string;
  mitre_technique: string;
};

type GapReport = {
  executiveSummary: string;
  coverageScore: number;
  coverageGrade: string;
  tacticCoverage: { tactic: string; coveredCount: number; totalTechniques: number; riskLevel: string }[];
  topGaps: { techniqueId: string; techniqueName: string; tactic: string; risk: string; reason: string; recommendation: string }[];
  topRecommendations: string[];
  strengths: string[];
  generatedAt: string;
  totalRules: number;
  coveredTechniques: number;
};

type SigmaRuleRef = { id: number; ruleId: string; title: string; level: string };

type CoverageEntry = {
  count: number;
  lastSeen: string;
  tactic: string;
  technique: string;
  confidence: number;
  ruleCount: number;
  rules: SigmaRuleRef[];
};

type CoverageStatus = "high" | "partial" | "sigma" | "none";

function getCoverageStatus(entry: CoverageEntry | undefined): CoverageStatus {
  if (!entry) return "none";
  if (entry.count > 0) {
    const daysSince = entry.lastSeen ? (Date.now() - new Date(entry.lastSeen).getTime()) / 86400000 : 999;
    return daysSince <= 30 ? "high" : "partial";
  }
  if (entry.ruleCount > 0) return "sigma";
  return "none";
}

function coverageCellClass(status: CoverageStatus): string {
  switch (status) {
    case "high":    return "bg-emerald-500/80 border-emerald-400/40 hover:bg-emerald-500 text-white";
    case "partial": return "bg-emerald-900/60 border-emerald-700/30 hover:bg-emerald-800/70 text-emerald-200";
    case "sigma":   return "bg-amber-800/40 border-amber-600/30 hover:bg-amber-700/50 text-amber-200";
    case "none":    return "bg-red-950/50 border-red-900/20 hover:bg-red-900/40 text-red-400/70";
  }
}

function coverageLegendLabel(status: CoverageStatus): string {
  switch (status) {
    case "high":    return "Active Detection";
    case "partial": return "Stale Coverage";
    case "sigma":   return "Sigma Rule Only";
    case "none":    return "No Coverage";
  }
}

// ── Rule Builder Tab ──────────────────────────────────────────────────────────
function RuleBuilderTab() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;

  const [threatDescription, setThreatDescription] = useState("");
  const [mitreTechnique, setMitreTechnique] = useState("");
  const [generatedRule, setGeneratedRule] = useState<GeneratedRule | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [refinementInput, setRefinementInput] = useState("");
  const [currentRuleYaml, setCurrentRuleYaml] = useState("");
  const [copied, setCopied] = useState(false);
  const [matchedEvents, setMatchedEvents] = useState<MatchedEvent[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const generateMutation = useMutation({
    mutationFn: (data: { tenantId: number; threatDescription: string; mitreTechnique: string }) =>
      apiRequest("POST", "/api/detection-studio/generate", data).then(r => r.json()),
    onSuccess: (data: GeneratedRule) => {
      setGeneratedRule(data);
      setCurrentRuleYaml(data.ruleYaml);
      setMatchedEvents([]);
      setConversation([{
        role: "assistant",
        content: `Generated **${data.severity.toUpperCase()}** severity rule: **"${data.title}"**\n\nMITRE: ${data.mitreTechniques?.join(", ") || "N/A"} | Kill Chain: ${data.killChainPhase || "N/A"} | Confidence: ${data.confidence}%${data.isDuplicate ? "\n\n⚠️ Similar title exists in Sigma library." : ""}`,
        ruleYaml: data.ruleYaml,
      }]);
      // Auto-fetch matched events
      if (data.mitreTechniques?.length > 0 && tenantId) {
        previewEventsMutation.mutate({ tenantId, mitreTechniques: data.mitreTechniques });
      }
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const previewEventsMutation = useMutation({
    mutationFn: (data: { tenantId: number; mitreTechniques: string[] }) =>
      apiRequest("POST", "/api/detection-studio/preview-events", data).then(r => r.json()),
    onSuccess: (data: { events: MatchedEvent[]; total: number }) => {
      setMatchedEvents(data.events || []);
    },
  });

  const refineMutation = useMutation({
    mutationFn: (data: { tenantId: number; currentRuleYaml: string; refinementRequest: string; conversationHistory: ConversationMessage[] }) =>
      apiRequest("POST", "/api/detection-studio/refine", data).then(r => r.json()),
    onSuccess: (data: any) => {
      const newYaml = data.ruleYaml || currentRuleYaml;
      setCurrentRuleYaml(newYaml);
      setConversation(prev => [...prev, {
        role: "assistant",
        content: data.changesMade || "Rule updated.",
        ruleYaml: newYaml,
      }]);
      if (generatedRule) {
        setGeneratedRule(prev => prev ? {
          ...prev,
          ruleYaml: newYaml,
          confidence: data.confidence || prev.confidence,
          mitreTechniques: data.mitreTechniques || prev.mitreTechniques,
          suggestedRefinements: data.suggestedRefinements || prev.suggestedRefinements,
        } : null);
      }
    },
    onError: (e: any) => toast({ title: "Refinement failed", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/detection-studio/save-to-sigma", data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Rule saved to Sigma Library", description: "Manage it from the Detection Engineering page." });
      queryClient.invalidateQueries({ queryKey: ["/api/sigma-rules"] });
    },
    onError: async (e: any) => {
      const msg = e.message || "";
      if (msg.includes("409") || msg.includes("already exists")) {
        toast({ title: "Duplicate rule", description: "A rule with this title already exists in the library.", variant: "destructive" });
      } else {
        toast({ title: "Save failed", description: msg, variant: "destructive" });
      }
    },
  });

  const handleGenerate = () => {
    if (!tenantId || !threatDescription.trim()) return;
    setGeneratedRule(null);
    setConversation([]);
    setMatchedEvents([]);
    generateMutation.mutate({ tenantId, threatDescription: threatDescription.trim(), mitreTechnique: mitreTechnique.trim() });
  };

  const handleRefine = () => {
    if (!tenantId || !refinementInput.trim() || !currentRuleYaml) return;
    const userMsg: ConversationMessage = { role: "user", content: refinementInput };
    setConversation(prev => [...prev, userMsg]);
    refineMutation.mutate({ tenantId, currentRuleYaml, refinementRequest: refinementInput, conversationHistory: [...conversation, userMsg] });
    setRefinementInput("");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentRuleYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentRuleYaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(generatedRule?.title || "rule").replace(/\s+/g, "_")}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    if (!generatedRule || !tenantId) return;
    saveMutation.mutate({
      tenantId,
      ruleYaml: currentRuleYaml,
      title: generatedRule.title,
      description: generatedRule.description,
      mitreTags: generatedRule.mitreTechniques,
      level: generatedRule.severity,
    });
  };

  const EXAMPLE_PROMPTS = [
    "PowerShell downloading and executing a remote script from an unusual domain in the middle of the night",
    "User account logging in from two different countries within 1 hour (impossible travel)",
    "Process spawning from Microsoft Word to execute cmd.exe with encoded parameters",
    "Large volume of files being renamed to .locked extension suggesting ransomware encryption",
    "LSASS memory being accessed by a non-standard process for credential dumping",
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left: Input + Conversation */}
      <div className="space-y-4">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-violet-400" />
              Describe the Threat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              data-testid="input-threat-description"
              placeholder="Describe the threat scenario in plain English — process names, file paths, network activity, user actions you want to detect..."
              value={threatDescription}
              onChange={e => setThreatDescription(e.target.value)}
              className="min-h-[120px] resize-none bg-background/60 text-sm"
            />
            <Input
              data-testid="input-mitre-technique"
              placeholder="MITRE technique hint (optional) — e.g. T1059.001 PowerShell"
              value={mitreTechnique}
              onChange={e => setMitreTechnique(e.target.value)}
              className="bg-background/60 text-sm"
            />
            <Button
              data-testid="button-generate-rule"
              onClick={handleGenerate}
              disabled={!threatDescription.trim() || generateMutation.isPending}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generateMutation.isPending ? "Generating Sigma Rule..." : "Generate Sigma Rule"}
            </Button>
          </CardContent>
        </Card>

        {/* Example prompts */}
        {!generatedRule && !generateMutation.isPending && (
          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />Example scenarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  data-testid={`button-example-prompt-${i}`}
                  onClick={() => setThreatDescription(p)}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border/40"
                >
                  <span className="text-violet-400 mr-1.5">→</span>{p}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Conversational Refinement */}
        {generatedRule && (
          <Card className="border-border/60 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                Refine with AI
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">
                  {conversation.length} messages
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-44 rounded-md border border-border/40 bg-background/40 p-3">
                <div className="space-y-3">
                  {conversation.map((msg, i) => (
                    <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && (
                        <div className="h-6 w-6 rounded-full bg-violet-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Brain className="h-3 w-3 text-violet-400" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                        msg.role === "user"
                          ? "bg-violet-600/20 text-violet-100 border border-violet-500/20"
                          : "bg-muted/40 text-muted-foreground border border-border/30"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {refineMutation.isPending && (
                    <div className="flex gap-2">
                      <div className="h-6 w-6 rounded-full bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                        <Loader2 className="h-3 w-3 text-violet-400 animate-spin" />
                      </div>
                      <div className="bg-muted/40 text-muted-foreground border border-border/30 rounded-lg px-3 py-2 text-xs">
                        Refining rule...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  data-testid="input-refinement"
                  placeholder='"Only flag off-hours" or "Exclude service accounts" or "Add network filter"'
                  value={refinementInput}
                  onChange={e => setRefinementInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                  className="bg-background/60 text-sm"
                  disabled={refineMutation.isPending}
                />
                <Button
                  data-testid="button-refine-rule"
                  onClick={handleRefine}
                  disabled={!refinementInput.trim() || refineMutation.isPending}
                  size="icon"
                  className="bg-violet-600 hover:bg-violet-700 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {generatedRule.suggestedRefinements?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Suggested refinements:</p>
                  {generatedRule.suggestedRefinements.slice(0, 2).map((s, i) => (
                    <button
                      key={i}
                      data-testid={`button-suggested-refinement-${i}`}
                      onClick={() => setRefinementInput(s)}
                      className="w-full text-left text-xs text-violet-400 hover:text-violet-300 py-0.5 flex items-start gap-1"
                    >
                      <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />{s}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Matched Events Preview */}
        {generatedRule && (
          <Card className="border-border/60 bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-400" />
                  Historical Match Preview
                </CardTitle>
                {previewEventsMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {generatedRule.mitreTechniques?.length > 0 && !previewEventsMutation.isPending && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => tenantId && previewEventsMutation.mutate({ tenantId, mitreTechniques: generatedRule.mitreTechniques })}
                  >
                    <Activity className="h-3 w-3" />Refresh
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {previewEventsMutation.isPending ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : matchedEvents.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    {matchedEvents.length} historical incidents matched the MITRE techniques this rule covers:
                  </p>
                  {matchedEvents.slice(0, 5).map(ev => (
                    <div key={ev.id} data-testid={`row-matched-event-${ev.id}`}
                      className="flex items-center gap-2 rounded-md border border-border/30 bg-background/30 px-2.5 py-1.5 text-xs"
                    >
                      <Badge variant="outline" className={cn("text-xs shrink-0 capitalize",
                        ev.severity === "critical" ? "text-red-400 border-red-500/30" :
                        ev.severity === "high" ? "text-orange-400 border-orange-500/30" :
                        "text-yellow-400 border-yellow-500/30"
                      )}>
                        {ev.severity}
                      </Badge>
                      <span className="flex-1 truncate text-foreground">{ev.title}</span>
                      <Badge variant="outline" className="text-xs font-mono text-blue-400 border-blue-500/20 shrink-0">
                        {ev.mitre_technique_id}
                      </Badge>
                    </div>
                  ))}
                  {matchedEvents.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{matchedEvents.length - 5} more incidents</p>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">No historical incidents found for the mapped MITRE techniques in this tenant.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">This may be a new threat vector — deploy the rule proactively.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: Generated Rule Panel */}
      <div className="space-y-4">
        {generateMutation.isPending && (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        )}

        {generatedRule && !generateMutation.isPending && (
          <>
            {/* Rule Metadata */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid="text-rule-title">
                      {generatedRule.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground leading-relaxed">{generatedRule.description}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 capitalize text-xs", SEVERITY_COLORS[generatedRule.severity] || SEVERITY_COLORS.medium)}
                    data-testid="badge-severity"
                  >
                    {generatedRule.severity}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Confidence</p>
                    <div className="flex items-center gap-2">
                      <Progress value={generatedRule.confidence} className="h-1.5 flex-1" />
                      <span className={cn("font-mono font-medium", CONFIDENCE_COLOR(generatedRule.confidence))} data-testid="text-confidence">
                        {generatedRule.confidence}%
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Kill Chain Phase</p>
                    <Badge variant="outline" className="text-xs capitalize">{generatedRule.killChainPhase || "N/A"}</Badge>
                  </div>
                </div>

                {generatedRule.mitreTechniques?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">MITRE ATT&CK Techniques</p>
                    <div className="flex flex-wrap gap-1">
                      {generatedRule.mitreTechniques.map(t => (
                        <Badge key={t} variant="outline" className="text-xs font-mono text-blue-400 border-blue-500/30 bg-blue-500/10">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {generatedRule.logSources?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Required Log Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {generatedRule.logSources.map(s => (
                        <Badge key={s} variant="outline" className="text-xs text-muted-foreground">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {generatedRule.isDuplicate && (
                  <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Similar rule title exists in Sigma library. Saving will create a duplicate.
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button data-testid="button-copy-rule" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 flex-1">
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button data-testid="button-download-rule" variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 flex-1">
                    <Download className="h-3.5 w-3.5" />Download
                  </Button>
                  <Button
                    data-testid="button-save-rule"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    size="sm"
                    className="gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save to Library
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* YAML Preview */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-emerald-400" />
                    Sigma YAML
                    {refineMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />}
                  </span>
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    {currentRuleYaml.split("\n").length} lines
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 rounded-md border border-border/40 bg-black/40 p-3">
                  <pre className="text-xs font-mono text-emerald-300/90 whitespace-pre-wrap leading-relaxed" data-testid="text-rule-yaml">
                    {currentRuleYaml}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* False Positives */}
            {generatedRule.falsePositives?.length > 0 && (
              <Card className="border-border/40 bg-card/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />Known False Positives
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {generatedRule.falsePositives.map((fp, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-yellow-400 mt-0.5">•</span>{fp}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!generatedRule && !generateMutation.isPending && (
          <Card className="border-border/40 bg-card/20 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-violet-600/10 flex items-center justify-center">
                <Wand2 className="h-6 w-6 text-violet-400/50" />
              </div>
              <p className="text-sm text-muted-foreground">Describe a threat scenario and click "Generate Sigma Rule"</p>
              <p className="text-xs text-muted-foreground/60">AI generates a production-ready Sigma rule with MITRE mapping</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Coverage Map Tab ──────────────────────────────────────────────────────────
function CoverageMapTab({ onSwitchToRuleBuilder }: { onSwitchToRuleBuilder: () => void }) {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;
  const [selectedTechnique, setSelectedTechnique] = useState<{
    tactic: MitreTactic;
    technique: MitreTechnique;
    entry?: CoverageEntry;
  } | null>(null);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  const [days] = useState(90);

  const coverageQuery = useQuery<{ covered: Record<string, CoverageEntry>; days: number; ruleCounts: Record<string, number>; totalRules: number }>({
    queryKey: ["/api/detection-studio/coverage", tenantId, days],
    queryFn: () => apiRequest("GET", `/api/detection-studio/coverage?tenantId=${tenantId}&days=${days}`).then(r => r.json()),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const gapReportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/detection-studio/gap-report", { tenantId }).then(r => r.json()),
    onSuccess: (data: GapReport) => setGapReport(data),
    onError: (e: any) => toast({ title: "Gap report failed", description: e.message, variant: "destructive" }),
  });

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (!gapReport || !tenantId) return;
    setIsExportingPdf(true);
    try {
      const res = await fetch("/api/detection-studio/gap-report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId, reportData: gapReport }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mitre_gap_report_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Gap Report exported", description: "PDF saved successfully." });
    } catch {
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const covered = coverageQuery.data?.covered || {};

  const tacticStats = MITRE_TACTICS.map(tactic => {
    const techniques = tactic.techniques;
    const high = techniques.filter(t => getCoverageStatus(covered[t.id]) === "high").length;
    const partial = techniques.filter(t => getCoverageStatus(covered[t.id]) === "partial").length;
    const sigma = techniques.filter(t => getCoverageStatus(covered[t.id]) === "sigma").length;
    const none = techniques.filter(t => getCoverageStatus(covered[t.id]) === "none").length;
    const pct = techniques.length > 0 ? Math.round(((high + partial * 0.5 + sigma * 0.25) / techniques.length) * 100) : 0;
    return { tactic, high, partial, sigma, none, pct, total: techniques.length };
  });

  const totalHigh = tacticStats.reduce((a, t) => a + t.high, 0);
  const totalPartial = tacticStats.reduce((a, t) => a + t.partial, 0);
  const totalSigma = tacticStats.reduce((a, t) => a + t.sigma, 0);
  const totalNone = tacticStats.reduce((a, t) => a + t.none, 0);
  const totalTechniques = MITRE_TACTICS.reduce((a, t) => a + t.techniques.length, 0);
  const overallCoverage = Math.round(((totalHigh + totalPartial * 0.5 + totalSigma * 0.25) / totalTechniques) * 100);

  return (
    <div className="space-y-6">
      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Detection", count: totalHigh, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
          { label: "Stale Coverage", count: totalPartial, color: "text-emerald-600", bg: "bg-emerald-900/20 border-emerald-800/20", icon: TrendingUp },
          { label: "Sigma Rule Only", count: totalSigma, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: Shield },
          { label: "No Coverage", count: totalNone, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: XCircle },
        ].map(({ label, count, color, bg, icon: Icon }) => (
          <Card key={label} className={cn("border", bg)}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", color)} />
                <div>
                  <p className={cn("text-lg font-bold", color)} data-testid={`text-coverage-${label.toLowerCase().replace(/ /g, "-")}`}>{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overall bar + Gap Report button */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Overall ATT&CK Coverage ({days}d)</span>
            <span className={cn("font-medium", overallCoverage >= 50 ? "text-emerald-400" : overallCoverage >= 25 ? "text-yellow-400" : "text-red-400")}>
              {overallCoverage}%
            </span>
          </div>
          <Progress value={overallCoverage} className="h-2" />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            data-testid="button-generate-gap-report"
            onClick={() => gapReportMutation.mutate()}
            disabled={gapReportMutation.isPending}
            variant="outline"
            className="gap-2 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
          >
            {gapReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {gapReportMutation.isPending ? "Generating..." : "AI Gap Report"}
          </Button>
          {gapReport && (
            <Button
              data-testid="button-export-gap-report"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              variant="outline"
              className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <Download className="h-4 w-4" />{isExportingPdf ? "Exporting..." : "Export PDF"}
            </Button>
          )}
        </div>
      </div>

      {/* Gap Report Panel */}
      {gapReport && (
        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-400" />
                AI Coverage Gap Report
                <Badge variant="outline" className="text-xs font-normal text-violet-400 border-violet-500/30">
                  Grade: {gapReport.coverageGrade}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className={cn("text-2xl font-bold",
                  gapReport.coverageScore >= 70 ? "text-emerald-400" : gapReport.coverageScore >= 40 ? "text-yellow-400" : "text-red-400"
                )}>
                  {gapReport.coverageScore}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{gapReport.executiveSummary}</p>

            {gapReport.strengths?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />Strengths
                </p>
                {gapReport.strengths.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-emerald-400 mt-0.5">•</span>{s}
                  </p>
                ))}
              </div>
            )}

            {gapReport.topGaps?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />Top Coverage Gaps
                </p>
                <div className="space-y-2">
                  {gapReport.topGaps.map((gap, i) => (
                    <div key={i} className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono text-red-400 border-red-500/30">{gap.techniqueId}</Badge>
                        <span className="text-xs font-medium">{gap.techniqueName}</span>
                        <Badge variant="outline" className={cn("text-xs ml-auto capitalize",
                          gap.risk === "critical" ? "text-red-400 border-red-500/30" : "text-orange-400 border-orange-500/30"
                        )}>{gap.risk}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{gap.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gapReport.topRecommendations?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-violet-400 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />Recommendations
                </p>
                {gapReport.topRecommendations.map((r, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-violet-400 mt-0.5">{i + 1}.</span>{r}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
        {(["high", "partial", "sigma", "none"] as CoverageStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn("h-3 w-3 rounded border", coverageCellClass(s))} />
            {coverageLegendLabel(s)}
          </div>
        ))}
        <span className="ml-auto text-muted-foreground/60">Click any technique for details & rules</span>
      </div>

      {/* MITRE ATT&CK Matrix */}
      {coverageQuery.isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-2 overflow-x-auto pb-2">
          {MITRE_TACTICS.map((tactic, ti) => {
            const stats = tacticStats[ti];
            return (
              <div key={tactic.id + ti} className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground min-w-[130px]">{tactic.name}</span>
                  <div className="flex-1 max-w-[180px]">
                    <Progress value={stats.pct} className="h-1" />
                  </div>
                  <span className={cn("text-xs font-mono",
                    stats.pct >= 50 ? "text-emerald-400" : stats.pct >= 25 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {stats.pct}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tactic.techniques.map(technique => {
                    const entry = covered[technique.id];
                    const status = getCoverageStatus(entry);
                    return (
                      <TooltipProvider key={technique.id}>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <button
                              data-testid={`cell-technique-${technique.id}`}
                              onClick={() => setSelectedTechnique({ tactic, technique, entry })}
                              className={cn(
                                "h-6 min-w-[72px] max-w-[120px] rounded border text-xs font-mono px-1.5 py-0.5 transition-colors truncate",
                                coverageCellClass(status)
                              )}
                            >
                              {technique.id}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-[220px]">
                            <p className="font-medium">{technique.name}</p>
                            <p className="text-muted-foreground">{technique.id} • {coverageLegendLabel(status)}</p>
                            {entry?.count > 0 && <p>{entry.count} incident(s) in last {days} days</p>}
                            {entry?.ruleCount > 0 && <p>{entry.ruleCount} Sigma rule(s)</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Technique Detail Sheet — with rules list + add/create links */}
      <Sheet open={!!selectedTechnique} onOpenChange={() => setSelectedTechnique(null)}>
        <SheetContent className="w-[420px] sm:w-[500px]">
          {selectedTechnique && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-400" />
                  {selectedTechnique.technique.name}
                </SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">{selectedTechnique.technique.id} • {selectedTechnique.tactic.name}</p>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                <div className="space-y-4 pr-2">
                  {/* Coverage Status */}
                  <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn("h-3 w-3 rounded border", coverageCellClass(getCoverageStatus(selectedTechnique.entry)))} />
                      <span className="text-xs font-medium">{coverageLegendLabel(getCoverageStatus(selectedTechnique.entry))}</span>
                    </div>
                    {selectedTechnique.entry?.count ? (
                      <p className="text-xs text-muted-foreground">{selectedTechnique.entry.count} incident(s) in last {days} days
                        {selectedTechnique.entry.lastSeen && (
                          <span className="ml-1">(last: {new Date(selectedTechnique.entry.lastSeen).toLocaleDateString()})</span>
                        )}
                      </p>
                    ) : selectedTechnique.entry?.ruleCount ? (
                      <p className="text-xs text-muted-foreground">{selectedTechnique.entry.ruleCount} Sigma rule(s) cover this technique, no incidents detected</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No detections or rules — create one below</p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-xs leading-relaxed">{selectedTechnique.technique.description}</p>
                  </div>

                  {/* Sub-techniques */}
                  {selectedTechnique.technique.subTechniques?.length && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Sub-techniques</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTechnique.technique.subTechniques.map(st => (
                          <Badge key={st.id} variant="outline" className="text-xs font-mono">{st.id} {st.name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Covering Sigma Rules */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />Covering Sigma Rules
                      </p>
                      <Link href="/detection-studio">
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-violet-400 hover:text-violet-300"
                          onClick={() => setSelectedTechnique(null)}
                          data-testid="link-create-rule"
                        >
                          <Plus className="h-3 w-3" />Create Rule
                        </Button>
                      </Link>
                    </div>
                    {selectedTechnique.entry?.rules?.length ? (
                      <div className="space-y-1.5">
                        {selectedTechnique.entry.rules.map(rule => (
                          <div key={rule.id} data-testid={`row-covering-rule-${rule.id}`}
                            className="flex items-center gap-2 rounded-md border border-border/30 bg-background/30 px-2.5 py-1.5"
                          >
                            <Badge variant="outline" className={cn("text-xs capitalize shrink-0",
                              rule.level === "high" || rule.level === "critical" ? "text-orange-400 border-orange-500/30" :
                              rule.level === "medium" ? "text-yellow-400 border-yellow-500/30" :
                              "text-blue-400 border-blue-500/30"
                            )}>
                              {rule.level}
                            </Badge>
                            <span className="flex-1 text-xs truncate">{rule.title}</span>
                            <a
                              href={`/detection-engineering`}
                              data-testid={`link-edit-rule-${rule.id}`}
                              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5 shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/40 bg-background/20 px-3 py-3 text-center">
                        <p className="text-xs text-muted-foreground">No Sigma rules cover this technique</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Use the Rule Builder tab to generate one</p>
                      </div>
                    )}
                  </div>

                  {/* Quick Action: Go to Rule Builder with pre-filled technique */}
                  <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-violet-400 flex items-center gap-1.5">
                      <Wand2 className="h-3.5 w-3.5" />Quick Actions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use the Rule Builder to generate a Sigma rule specifically for this technique.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 border-violet-500/30 text-violet-400 hover:bg-violet-500/10 text-xs"
                      onClick={() => {
                        setSelectedTechnique(null);
                        onSwitchToRuleBuilder();
                      }}
                      data-testid="button-go-to-rule-builder"
                    >
                      <Wand2 className="h-3 w-3" />
                      Generate Rule for {selectedTechnique.technique.id}
                    </Button>
                  </div>

                  {/* MITRE ATT&CK Navigator link */}
                  <div>
                    <a
                      href={`https://attack.mitre.org/techniques/${selectedTechnique.technique.id.replace(".", "/")}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="link-mitre-external"
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View on MITRE ATT&CK Navigator
                    </a>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DetectionStudioPage() {
  const [activeTab, setActiveTab] = useState("rule-builder");
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <PageHero
        icon={FlameKindling}
        iconColor="text-violet-400"
        title="AI Detection Studio"
        description="World-class threat detection engineering — describe a threat in plain English, AI generates a production-ready Sigma rule. Refine conversationally, then deploy to your detection library in one click."
        badge="Powered by AI"
        stats={[
          { label: "Rule Format", value: "Sigma" },
          { label: "MITRE Tactics", value: "14" },
          { label: "Techniques Mapped", value: "200+" },
          { label: "Mode", value: "MSS Only" },
        ]}
      />

      <div className="flex-1 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/30 border border-border/40">
            <TabsTrigger value="rule-builder" className="gap-2" data-testid="tab-rule-builder">
              <Wand2 className="h-4 w-4" />
              Rule Builder
            </TabsTrigger>
            <TabsTrigger value="coverage-map" className="gap-2" data-testid="tab-coverage-map">
              <Crosshair className="h-4 w-4" />
              Coverage Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rule-builder">
            <RuleBuilderTab />
          </TabsContent>

          <TabsContent value="coverage-map">
            <CoverageMapTab onSwitchToRuleBuilder={() => setActiveTab("rule-builder")} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
