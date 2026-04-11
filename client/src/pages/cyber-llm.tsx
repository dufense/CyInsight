import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Target,
  Activity,
  Sparkles,
  Clock,
  Info,
  History,
  Cpu,
  BarChart3,
  CheckCircle,
  Database,
  Users,
  Shield,
  AlertTriangle,
  Star,
  ChevronRight,
  Crosshair,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

type KillChainStage =
  | "Reconnaissance"
  | "Weaponization"
  | "Delivery"
  | "Exploitation"
  | "Installation"
  | "Command & Control"
  | "Actions on Objectives";

const KILL_CHAIN_STAGES: KillChainStage[] = [
  "Reconnaissance",
  "Weaponization",
  "Delivery",
  "Exploitation",
  "Installation",
  "Command & Control",
  "Actions on Objectives",
];

interface PredictionRow {
  attackType: string;
  confidence: number;
  timeWindow: "24h" | "7d" | "30d";
  targetAssetClass: string;
  mitreTactic: string;
  mitreTechniqueId: string;
  killChainStage: KillChainStage;
  recommendedAction: string;
}

interface InputSignalCounts {
  incidents: number;
  analystFeedback: number;
  federatedIocs: number;
  maliciousIocs: number;
}

interface AttackVector {
  tactic: string;
  techniqueIds: string[];
  probability: number;
  delta: number;
  confidence: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  killChainStage: KillChainStage;
  reasoning: string;
}

interface RiskTimelinePoint {
  day: number;
  label: string;
  riskScore: number;
  dominantTactic: string;
  incidentCount: number;
}

interface EmergingIndicator {
  ioc: string;
  type: string;
  prevalence: number;
  trending: "rising" | "stable" | "declining";
  associatedTactics: string[];
}

interface PredictedTarget {
  industry: string;
  probability: number;
  confidence: number;
  primaryVector: string;
}

interface SignalSummary {
  totalIncidents: number;
  topTactics: Array<{ tactic: string; count: number }>;
  analystFeedbackCount: number;
  aiAccuracyPercent: number | null;
  federatedIocCount: number;
  maliciousIocCount: number;
  dataSpanDays: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface CyberPredictionResult {
  id: number;
  createdAt: string;
  predictionWindowDays: number;
  overallConfidence: number;
  accuracyScore: number | null;
  modelUsed: string;
  status: string;
  predictions: PredictionRow[];
  inputSignalCounts: InputSignalCounts;
  vectors: AttackVector[];
  riskTimeline: RiskTimelinePoint[];
  emergingIndicators: EmergingIndicator[];
  predictedTargets: PredictedTarget[];
  narrative: string;
  signalSummary: SignalSummary;
  empty?: boolean;
}

interface SignalStats extends SignalSummary {
  inputSignalCounts: InputSignalCounts;
}

interface PredictionHistoryItem {
  id: number;
  createdAt: string;
  overallConfidence: number | null;
  accuracyScore: number | null;
  status: string;
  predictionCount: number;
  modelUsed: string | null;
  predictionWindowDays: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SEV: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", bar: "#ef4444" },
  HIGH:     { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", bar: "#f97316" },
  MEDIUM:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", bar: "#eab308" },
  LOW:      { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", bar: "#22c55e" },
};

const WINDOW_COLORS: Record<string, string> = { "24h": "text-red-400", "7d": "text-orange-400", "30d": "text-yellow-400" };

const GENERATE_STEPS = [
  "Ingesting signals…",
  "Synthesizing patterns…",
  "Generating predictions…",
];

// ── Utility components ───────────────────────────────────────────────────────

function RadialGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const arc = (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="hsl(var(--border)/0.4)" strokeWidth="8" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
          className="transition-all duration-700"
        />
        <text x="45" y="50" textAnchor="middle" fontSize="14" fontWeight="bold" fill={color}>
          {value}%
        </text>
      </svg>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">{label}</p>
    </div>
  );
}

function KillChainHeatRow({ vectors }: { vectors: AttackVector[] }) {
  const stageCounts = KILL_CHAIN_STAGES.map((stage) => {
    const hits = vectors.filter((v) => v.killChainStage === stage);
    const maxProb = hits.length > 0 ? Math.max(...hits.map((v) => v.probability)) : 0;
    return { stage, count: hits.length, maxProb };
  });

  const peak = Math.max(...stageCounts.map((s) => s.maxProb), 1);

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Crosshair className="w-3 h-3" /> Kill Chain Progression
      </p>
      <div className="flex items-end gap-1 h-14">
        {stageCounts.map(({ stage, maxProb, count }) => {
          const intensity = maxProb / peak;
          const bg =
            intensity > 0.7
              ? "bg-red-500"
              : intensity > 0.4
              ? "bg-orange-400"
              : intensity > 0.1
              ? "bg-yellow-400"
              : "bg-muted/30";
          const h = Math.max(4, Math.round(intensity * 44));
          return (
            <Tooltip key={stage}>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-0.5 flex-1 cursor-pointer">
                  <div
                    className={`w-full rounded-sm transition-all ${bg}`}
                    style={{ height: `${h}px`, opacity: intensity > 0 ? 0.85 : 0.2 }}
                    data-testid={`kill-chain-${stage.replace(/ /g, "-").toLowerCase()}`}
                  />
                  <span className="text-[7px] text-muted-foreground text-center leading-tight">
                    {stage.split(" ").slice(0, 1).join("")}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold text-xs">{stage}</p>
                <p className="text-[10px]">{count} vector{count !== 1 ? "s" : ""} · max {maxProb}% probability</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function GenerateLoadingOverlay({ step }: { step: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-purple-500/20" />
        <div className="absolute inset-0 rounded-full border-4 border-t-purple-500 animate-spin" />
        <Brain className="absolute inset-0 m-auto w-6 h-6 text-purple-400" />
      </div>
      <div className="space-y-2 text-center">
        {GENERATE_STEPS.map((s, i) => (
          <div key={s} className={`flex items-center gap-2 text-sm transition-all ${i < step ? "text-green-400" : i === step ? "text-purple-300 font-medium" : "text-muted-foreground/40"}`}>
            {i < step ? <CheckCircle className="w-4 h-4 shrink-0" /> : i === step ? <RefreshCw className="w-4 h-4 shrink-0 animate-spin" /> : <div className="w-4 h-4 rounded-full border border-muted-foreground/20 shrink-0" />}
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function useCountdown(targetIso: string | null | undefined): string {
  const [display, setDisplay] = useState("—");
  useEffect(() => {
    if (!targetIso) { setDisplay("—"); return; }
    function tick() {
      const diff = new Date(targetIso!).getTime() - Date.now();
      if (diff <= 0) { setDisplay("now"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return display;
}

// ── Predictions summary tab ──────────────────────────────────────────────────

function PredictionsTab({ prediction }: { prediction: CyberPredictionResult | null }) {
  if (!prediction || prediction.empty) return (
    <div className="text-center py-12 text-muted-foreground">
      <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm">No predictions yet. Click Generate to create the first forecast.</p>
    </div>
  );

  const topPredictions = [...prediction.predictions]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
  const criticalCount = topPredictions.filter((p) => p.confidence >= 80).length;

  return (
    <div className="space-y-4">
      {/* AI narrative */}
      <div className="flex gap-3 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5">AI Threat Intelligence Summary</p>
          <p className="text-sm text-foreground/85 leading-relaxed">{prediction.narrative}</p>
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Brain className="w-3 h-3" /> Model: {prediction.modelUsed} · Generated: {new Date(prediction.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Overall Confidence", value: `${prediction.overallConfidence}%`, icon: Brain, color: "text-purple-400" },
          { label: "High-Confidence", value: criticalCount, icon: ShieldAlert, color: "text-red-400" },
          { label: "Total Predictions", value: topPredictions.length, icon: Target, color: "text-primary" },
          { label: "Window", value: `${prediction.predictionWindowDays}d`, icon: Activity, color: "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-3 flex flex-col items-center gap-1.5">
            <Icon className={`w-5 h-5 ${color}`} />
            <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">{label}</p>
          </Card>
        ))}
      </div>

      {/* Prediction cards — one per attack type, sorted by confidence DESC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topPredictions.map((p, i) => (
            <Card key={p.attackType + i} className="border border-border/40" data-testid={`prediction-card-${i}`}>
              <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-primary">#{i + 1}</span>
                    </div>
                    <p className="text-sm font-semibold truncate" data-testid={`text-attack-type-${i}`}>{p.attackType}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${WINDOW_COLORS[p.timeWindow] ?? ""}`}>{p.timeWindow}</Badge>
                </div>

                {/* Confidence bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground">Confidence</span>
                    <span className={`text-sm font-bold ${p.confidence >= 80 ? "text-red-400" : p.confidence >= 60 ? "text-yellow-400" : "text-muted-foreground"}`}
                      data-testid={`text-confidence-${i}`}>{p.confidence}%</span>
                  </div>
                  <Progress value={p.confidence} className="h-1.5" />
                </div>

                {/* Detail grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                  <div>
                    <span className="text-muted-foreground block">Target Asset</span>
                    <span className="font-medium" data-testid={`text-asset-${i}`}>{p.targetAssetClass}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">MITRE Technique</span>
                    <span className="font-mono text-primary" data-testid={`text-mitre-${i}`}>
                      {p.mitreTechniqueId || p.mitreTactic}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Tactic</span>
                    <span className="font-medium">{p.mitreTactic}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Kill Chain Stage</span>
                    <span className="font-medium flex items-center gap-0.5" data-testid={`text-kill-chain-${i}`}>
                      <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />{p.killChainStage}
                    </span>
                  </div>
                </div>

                {/* Recommended action */}
                <div className="rounded-md border border-border/30 bg-muted/20 px-3 py-2">
                  <p className="text-[9px] text-muted-foreground mb-0.5">Recommended Action</p>
                  <p className="text-[10px] text-foreground/90 leading-relaxed" data-testid={`text-action-${i}`}>{p.recommendedAction}</p>
                </div>
              </CardContent>
            </Card>
        ))}
      </div>

      {/* Risk timeline + predicted targets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-red-400" /> 30-Day Risk Trajectory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={prediction.riskTimeline.filter((_, i) => i % 2 === 0)} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="riskG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={4} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v}`, "Risk Score"]}
                />
                <Area type="monotone" dataKey="riskScore" stroke="#ef4444" strokeWidth={2} fill="url(#riskG)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-orange-400" /> Predicted Target Sectors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {prediction.predictedTargets.map((t, i) => (
              <div key={t.industry + i} className="flex items-center gap-2">
                <span className="text-xs flex-1 truncate">{t.industry}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{t.primaryVector}</span>
                <Progress value={t.probability} className="h-1 w-16 shrink-0" />
                <span className="text-xs font-bold text-orange-400 shrink-0 w-8 text-right">{t.probability}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Attack Vectors tab ───────────────────────────────────────────────────────

function AttackVectorsTab({ prediction }: { prediction: CyberPredictionResult | null }) {
  if (!prediction || prediction.empty || !prediction.vectors.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">No attack vectors available yet.</div>
  );

  const barData = prediction.vectors.slice(0, 8).map((v) => ({
    tactic: v.tactic.split(" ").slice(0, 2).join(" "),
    probability: v.probability,
    severity: v.severity,
  }));

  const radarData = prediction.vectors.slice(0, 7).map((v) => ({
    subject: v.tactic.split(" ")[0],
    probability: v.probability,
    confidence: v.confidence,
    fullMark: 100,
  }));

  return (
    <div className="space-y-4">
      {/* Kill chain heat-row */}
      <Card className="p-4">
        <KillChainHeatRow vectors={prediction.vectors} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-primary" /> Attack Probability Matrix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="tactic" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={80} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v}%`, "Probability"]}
                />
                <Bar dataKey="probability" radius={[0, 3, 3, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={SEV[entry.severity]?.bar ?? "#eab308"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Radar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Threat Vector Radar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="hsl(var(--border)/0.4)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Probability" dataKey="probability" stroke="#a855f7" fill="#a855f7" fillOpacity={0.25} strokeWidth={2} />
                <Radar name="Confidence" dataKey="confidence" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-1">
              {[{ label: "Probability", color: "#a855f7" }, { label: "Confidence", color: "#06b6d4" }].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color, opacity: 0.7 }} />
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vector detail cards */}
      <div className="space-y-3">
        {prediction.vectors.map((vector, i) => {
          const sev = SEV[vector.severity] ?? SEV.MEDIUM;
          const DeltaIcon = vector.delta > 5 ? TrendingUp : vector.delta < -5 ? TrendingDown : Minus;
          const deltaColor = vector.delta > 5 ? "text-red-400" : vector.delta < -5 ? "text-green-400" : "text-muted-foreground";
          return (
            <div key={vector.tactic + i} className={`flex flex-col gap-2 p-4 rounded-lg border ${sev.border} ${sev.bg}`} data-testid={`vector-card-${i}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">#{i + 1}</span>
                  <h3 className="font-semibold text-sm truncate">{vector.tactic}</h3>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${sev.text} ${sev.border}`}>{vector.severity}</Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`flex items-center gap-0.5 text-[11px] font-medium ${deltaColor}`}>
                    <DeltaIcon className="w-3 h-3" />{Math.abs(vector.delta)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">{vector.killChainStage}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Probability</span>
                    <span className={`text-xs font-bold ${sev.text}`}>{vector.probability}%</span>
                  </div>
                  <Progress value={vector.probability} className="h-1.5" />
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">Confidence</div>
                  <div className="text-xs font-semibold">{vector.confidence}%</div>
                </div>
              </div>
              {vector.techniqueIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vector.techniqueIds.slice(0, 4).map((tid) => (
                    <span key={tid} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{tid}</span>
                  ))}
                </div>
              )}
              {vector.reasoning && (
                <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">{vector.reasoning}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Emerging indicators */}
      {prediction.emergingIndicators.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" /> Emerging Threat Indicators
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prediction.emergingIndicators.map((ind, i) => {
              const TrendIcon = ind.trending === "rising" ? TrendingUp : ind.trending === "declining" ? TrendingDown : Minus;
              const trendColor = ind.trending === "rising" ? "text-red-400" : ind.trending === "declining" ? "text-green-400" : "text-muted-foreground";
              return (
                <div key={ind.ioc + i} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0" data-testid={`indicator-${i}`}>
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 border border-primary/20 shrink-0">
                    <span className="text-[9px] font-bold uppercase text-primary">{ind.type.slice(0, 2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{ind.ioc}</p>
                    <p className="text-[10px] text-muted-foreground">{ind.associatedTactics.slice(0, 2).join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Prevalence</div>
                      <div className="text-xs font-semibold">{ind.prevalence}%</div>
                    </div>
                    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
                      <TrendIcon className="w-3 h-3" />{ind.trending}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Learning Signal tab ──────────────────────────────────────────────────────

function LearningSignalTab({ tenantId }: { tenantId: number }) {
  const { data: stats, isLoading } = useQuery<SignalStats>({
    queryKey: ["/api/cyber-llm", tenantId, "signal-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/cyber-llm/${tenantId}/signal-stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load signal stats");
      return res.json() as Promise<SignalStats>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const countdown = useCountdown(stats?.nextRunAt);

  const signalCards = stats
    ? [
        { label: "Incidents (90d)", value: stats.inputSignalCounts?.incidents ?? stats.totalIncidents, icon: AlertTriangle, color: "text-orange-400" },
        { label: "Analyst Feedback", value: stats.inputSignalCounts?.analystFeedback ?? stats.analystFeedbackCount, icon: Users, color: "text-blue-400" },
        { label: "Federated IOCs", value: stats.inputSignalCounts?.federatedIocs ?? stats.federatedIocCount, icon: Shield, color: "text-cyan-400" },
        { label: "Malicious IOCs", value: stats.inputSignalCounts?.maliciousIocs ?? stats.maliciousIocCount, icon: ShieldAlert, color: "text-red-400" },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Learning quality gauge + run metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center justify-center p-4">
          {isLoading ? (
            <Skeleton className="w-24 h-24 rounded-full" />
          ) : (
            <RadialGauge
              value={stats?.aiAccuracyPercent ?? 0}
              label="Learning Quality"
              color={
                (stats?.aiAccuracyPercent ?? 0) >= 75
                  ? "#22c55e"
                  : (stats?.aiAccuracyPercent ?? 0) >= 50
                  ? "#eab308"
                  : "#ef4444"
              }
            />
          )}
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3" /> Last Run
            </p>
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <p className="text-xs font-medium text-foreground">
                {stats?.lastRunAt ? new Date(stats.lastRunAt).toLocaleString() : "Never"}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <RefreshCw className="w-3 h-3" /> Next Run In
            </p>
            {isLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <p className="text-sm font-bold text-primary tabular-nums" data-testid="next-run-countdown">
                {countdown}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Schedule</p>
            <p className="text-xs text-foreground">Every 6 hours</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col gap-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Database className="w-3 h-3" /> Data Span
          </p>
          <div className="text-3xl font-black text-primary">{stats?.dataSpanDays ?? "—"}<span className="text-base font-normal text-muted-foreground ml-1">days</span></div>
          <p className="text-[10px] text-muted-foreground">Rolling signal window for pattern analysis</p>
        </Card>
      </div>

      {/* Signal count cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          : signalCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
                <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
              </Card>
            ))}
      </div>

      {/* Top tactics signal */}
      {stats?.topTactics && stats.topTactics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Top MITRE ATT&CK Signals (90d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topTactics.slice(0, 8).map((t, i) => (
                <div key={t.tactic} className="flex items-center gap-3" data-testid={`signal-tactic-${i}`}>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-4">#{i + 1}</span>
                  <span className="text-xs flex-1 truncate">{t.tactic}</span>
                  <span className="text-xs font-semibold text-foreground shrink-0">{t.count}</span>
                  <div className="w-20 shrink-0">
                    <Progress value={Math.min(100, (t.count / (stats.topTactics[0]?.count ?? 1)) * 100)} className="h-1" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="p-4 rounded-lg border border-border/40 bg-muted/20">
        <p className="text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Signal sources (all from the last 90 days): incident MITRE ATT&CK patterns, analyst TP/FP verdict feedback, platform-wide federated threat intelligence, and malicious IOC reputation data. The Learning Quality gauge shows the AI triage accuracy rate from the last 30 days of analyst feedback.
        </p>
      </div>
    </div>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [gradingId, setGradingId] = useState<number | null>(null);
  const [inputAccuracy, setInputAccuracy] = useState<string>("");

  const { data: history, isLoading } = useQuery<PredictionHistoryItem[]>({
    queryKey: ["/api/cyber-llm", tenantId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/cyber-llm/${tenantId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json() as Promise<PredictionHistoryItem[]>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ predictionId, actualAccuracy }: { predictionId: number; actualAccuracy: number }) => {
      const res = await apiRequest("POST", `/api/cyber-llm/${tenantId}/accuracy-feedback`, { predictionId, actualAccuracy });
      return res.json();
    },
    onSuccess: () => {
      setGradingId(null);
      setInputAccuracy("");
      queryClient.invalidateQueries({ queryKey: ["/api/cyber-llm", tenantId, "history"] });
      toast({ title: "Accuracy recorded", description: "Analyst accuracy score saved successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function submitGrade(predictionId: number) {
    const val = parseInt(inputAccuracy, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ title: "Invalid input", description: "Enter a number between 0 and 100.", variant: "destructive" });
      return;
    }
    feedbackMutation.mutate({ predictionId, actualAccuracy: val });
  }

  return (
    <div className="space-y-3">
      {isLoading
        ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
        : !history?.length
        ? <div className="text-center py-8 text-muted-foreground text-sm">No prediction history yet.</div>
        : history.map((item, i) => (
            <div key={item.id} className="flex items-center gap-4 p-4 rounded-lg border border-border/40 bg-card hover:bg-muted/20 transition-colors" data-testid={`history-row-${i}`}>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                <span className="text-[11px] font-bold text-primary">#{item.id}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold">{new Date(item.createdAt).toLocaleString()}</p>
                  <Badge variant="outline" className={`text-[9px] ${item.status === "complete" ? "text-green-400 border-green-500/30" : "text-muted-foreground"}`}>{item.status}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {item.predictionCount} predictions · {item.predictionWindowDays}d window · {item.modelUsed ?? "unknown model"}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {item.overallConfidence !== null && (
                  <div className="text-center">
                    <div className="text-sm font-bold text-primary">{item.overallConfidence}%</div>
                    <div className="text-[9px] text-muted-foreground">Confidence</div>
                  </div>
                )}
                {item.accuracyScore !== null ? (
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-sm font-bold text-green-400">
                      <CheckCircle className="w-3 h-3" />{item.accuracyScore}%
                    </div>
                    <div className="text-[9px] text-muted-foreground">Accuracy</div>
                  </div>
                ) : gradingId === item.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={inputAccuracy}
                      onChange={(e) => setInputAccuracy(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitGrade(item.id);
                        if (e.key === "Escape") { setGradingId(null); setInputAccuracy(""); }
                      }}
                      placeholder="0-100"
                      className="w-16 h-7 text-[10px] rounded border border-border/60 bg-background px-1.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      data-testid={`input-accuracy-${item.id}`}
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[10px] px-2"
                      onClick={() => submitGrade(item.id)}
                      disabled={feedbackMutation.isPending}
                      data-testid={`button-submit-grade-${item.id}`}
                    >
                      <CheckCircle className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] px-1"
                      onClick={() => { setGradingId(null); setInputAccuracy(""); }}
                      data-testid={`button-cancel-grade-${item.id}`}
                    >
                      ✕
                    </Button>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => { setGradingId(item.id); setInputAccuracy(""); }}
                        data-testid={`button-grade-${item.id}`}
                      >
                        <Star className="w-3 h-3" /> Grade
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Enter analyst accuracy % (0-100)</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CyberLLMPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("predictions");
  const [generateStep, setGenerateStep] = useState(-1);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tenantId = currentTenant?.id;

  const { data: prediction, isLoading } = useQuery<CyberPredictionResult>({
    queryKey: ["/api/cyber-llm", tenantId, "predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/cyber-llm/${tenantId}/predictions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load prediction");
      return res.json() as Promise<CyberPredictionResult>;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cyber-llm/${tenantId}/generate`);
      return res.json();
    },
    onMutate: () => {
      setGenerateStep(0);
      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step = Math.min(step + 1, GENERATE_STEPS.length - 1);
        setGenerateStep(step);
      }, 2500);
    },
    onSuccess: () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setGenerateStep(GENERATE_STEPS.length);
      setTimeout(() => setGenerateStep(-1), 600);
      queryClient.invalidateQueries({ queryKey: ["/api/cyber-llm", tenantId, "predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cyber-llm", tenantId, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cyber-llm", tenantId, "signal-stats"] });
      toast({ title: "Prediction generated", description: "New 30-day attack prediction is ready." });
    },
    onError: (err: Error) => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setGenerateStep(-1);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const isGenerating = generateMutation.isPending;
  const hasData = prediction && !prediction.empty;
  const criticalCount = prediction?.predictions?.filter((p) => p.confidence >= 80).length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHero
        icon={Brain}
        iconColor="text-purple-400"
        title="Cyber Predictive Engine"
        description="LLM-powered 30-day attack forecast synthesizing MITRE ATT&CK patterns, analyst feedback, federated IOC intelligence, and historical incident telemetry"
        badge="AI · LLM-Powered"
        cyberAccent
        stats={[
          { label: "predictions", value: prediction?.predictions?.length ?? "—", accent: true },
          { label: "confidence", value: hasData ? `${prediction!.overallConfidence}%` : "—" },
          { label: "high-confidence", value: criticalCount, accent: criticalCount > 0 },
          { label: "window", value: "30 days" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={isGenerating || !tenantId}
            data-testid="button-generate-prediction"
            className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating ? "Generating…" : "Generate Prediction"}
          </Button>
        }
      />

      {/* Multi-step generation overlay */}
      {isGenerating && generateStep >= 0 && (
        <Card>
          <CardContent className="py-4">
            <GenerateLoadingOverlay step={generateStep} />
          </CardContent>
        </Card>
      )}

      {!isGenerating && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="predictions" data-testid="tab-predictions" className="text-xs">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />Predictions
            </TabsTrigger>
            <TabsTrigger value="vectors" data-testid="tab-vectors" className="text-xs">
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Attack Vectors
            </TabsTrigger>
            <TabsTrigger value="signals" data-testid="tab-signals" className="text-xs">
              <Cpu className="w-3.5 h-3.5 mr-1.5" />Learning Signal
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history" className="text-xs">
              <History className="w-3.5 h-3.5 mr-1.5" />History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="predictions" className="mt-4">
            {isLoading
              ? <div className="space-y-3"><Skeleton className="h-20 rounded-xl" /><div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div></div>
              : <PredictionsTab prediction={prediction ?? null} />}
          </TabsContent>

          <TabsContent value="vectors" className="mt-4">
            {isLoading
              ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
              : <AttackVectorsTab prediction={prediction ?? null} />}
          </TabsContent>

          <TabsContent value="signals" className="mt-4">
            {tenantId ? <LearningSignalTab tenantId={tenantId} /> : <p className="text-sm text-muted-foreground">No tenant selected.</p>}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {tenantId ? <HistoryTab tenantId={tenantId} /> : <p className="text-sm text-muted-foreground">No tenant selected.</p>}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
