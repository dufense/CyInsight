import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ShieldCheck, ShieldAlert, Loader2, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Minus, ChevronDown, ChevronRight,
  ClipboardList, FileSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RadarChart, Radar as RechartsRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
} from "recharts";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

const SCORE_COLORS = {
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444",
};

function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_COLORS.high;
  if (score >= 40) return SCORE_COLORS.medium;
  return SCORE_COLORS.low;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Developing";
  if (score >= 20) return "Initial";
  return "Minimal";
}

function getStatusIcon(status: string) {
  switch (status) {
    case "implemented": return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case "partial": return <Minus className="w-3.5 h-3.5 text-yellow-500" />;
    case "not_implemented": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case "not_applicable": return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
    default: return null;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "implemented": return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "partial": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
    case "not_implemented": return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "not_applicable": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "implemented": return "Implemented";
    case "partial": return "Partial";
    case "not_implemented": return "Not Implemented";
    case "not_applicable": return "N/A";
    default: return status;
  }
}

interface FunctionScore {
  id: string;
  name: string;
  score: number;
  totalControls: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  notApplicable: number;
}

interface ControlStatusEntry {
  status: string;
  score: number;
  evidence: string;
  controlName: string;
  functionId: string;
  functionName: string;
}

interface GapItem {
  controlId: string;
  controlName: string;
  functionId: string;
  functionName: string;
  status: string;
  evidence: string;
  priority: string;
}

interface FrameworkData {
  framework: { id: string; name: string; version: string };
  overallScore: number;
  functionScores: Record<string, FunctionScore>;
  controlStatuses: Record<string, ControlStatusEntry>;
  gapAnalysis: GapItem[];
  assessedAt?: string;
}

interface ComplianceResponse {
  assessed: boolean;
  data: {
    nist_csf?: FrameworkData;
    iso_27001?: FrameworkData;
  } | null;
}

function CircularGauge({ score, size = 120, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="8"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold" style={{ color }}>{score}%</span>
        <span className="text-[10px] text-muted-foreground">{getScoreLabel(score)}</span>
      </div>
      <span className="text-xs font-medium text-center mt-1">{label}</span>
    </div>
  );
}

function FrameworkOverviewCard({ data, onViewDetails }: { data: FrameworkData; onViewDetails: () => void }) {
  const functionEntries = Object.values(data.functionScores);
  const totalImplemented = functionEntries.reduce((s, f) => s + f.implemented, 0);
  const totalPartial = functionEntries.reduce((s, f) => s + f.partial, 0);
  const totalNotImpl = functionEntries.reduce((s, f) => s + f.notImplemented, 0);
  const totalNA = functionEntries.reduce((s, f) => s + f.notApplicable, 0);
  const totalControls = functionEntries.reduce((s, f) => s + f.totalControls, 0);
  const gapCount = data.gapAnalysis?.length || 0;

  return (
    <Card data-testid={`card-framework-${data.framework.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-sm">{data.framework.name}</CardTitle>
              <p className="text-[10px] text-muted-foreground">v{data.framework.version}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onViewDetails} data-testid={`button-view-${data.framework.id}`}>
            <FileSearch className="w-3.5 h-3.5 mr-1" /> Details
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center relative" style={{ height: 130 }}>
          <CircularGauge score={data.overallScore} label="Overall Coverage" />
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-green-500">{totalImplemented}</p>
            <p className="text-[9px] text-muted-foreground">Implemented</p>
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-500">{totalPartial}</p>
            <p className="text-[9px] text-muted-foreground">Partial</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-500">{totalNotImpl}</p>
            <p className="text-[9px] text-muted-foreground">Not Impl.</p>
          </div>
          <div>
            <p className="text-lg font-bold text-muted-foreground">{totalNA}</p>
            <p className="text-[9px] text-muted-foreground">N/A</p>
          </div>
        </div>

        <div className="space-y-2">
          {functionEntries.map(fn => (
            <div key={fn.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{fn.id} - {fn.name}</span>
                <span className="font-mono" style={{ color: getScoreColor(fn.score) }}>{fn.score}%</span>
              </div>
              <Progress value={fn.score} className="h-1.5" />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <span className="text-muted-foreground">{totalControls} total controls</span>
          {gapCount > 0 && (
            <Badge variant="outline" className="text-[9px] text-orange-500 border-orange-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />{gapCount} gaps
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FrameworkDetailView({ data }: { data: FrameworkData }) {
  const [expandedFn, setExpandedFn] = useState<string | null>(null);
  const functionEntries = Object.values(data.functionScores);
  const controlEntries = Object.entries(data.controlStatuses || {});

  const radarData = functionEntries.map(fn => ({
    function: fn.id,
    score: fn.score,
    fullMark: 100,
  }));

  const barData = functionEntries.map(fn => ({
    name: fn.id,
    fullName: fn.name,
    implemented: fn.implemented,
    partial: fn.partial,
    notImplemented: fn.notImplemented,
    notApplicable: fn.notApplicable,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Coverage Radar
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Control Assessment — scored from platform security control evaluation against framework requirements</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="function" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <RechartsRadar name="Coverage" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Control Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={30} />
                <RechartsTooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [value, name === "notImplemented" ? "Not Implemented" : name === "notApplicable" ? "N/A" : name.charAt(0).toUpperCase() + name.slice(1)]}
                  labelFormatter={(label: string) => {
                    const item = barData.find(d => d.name === label);
                    return item ? `${item.name} - ${item.fullName}` : label;
                  }}
                />
                <Bar dataKey="implemented" stackId="a" fill="#22c55e" name="Implemented" />
                <Bar dataKey="partial" stackId="a" fill="#eab308" name="Partial" />
                <Bar dataKey="notImplemented" stackId="a" fill="#ef4444" name="Not Implemented" />
                <Bar dataKey="notApplicable" stackId="a" fill="#6b7280" name="N/A" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Controls by Function
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {functionEntries.map(fn => {
            const isExpanded = expandedFn === fn.id;
            const fnControls = controlEntries.filter(([_, c]) => c.functionId === fn.id);
            return (
              <div key={fn.id} className="border rounded-lg" data-testid={`function-${fn.id}`}>
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                  onClick={() => setExpandedFn(isExpanded ? null : fn.id)}
                  data-testid={`button-expand-${fn.id}`}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="text-xs font-semibold">{fn.id}</span>
                    <span className="text-xs">{fn.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[9px] ${getStatusBadgeClass("implemented")} no-default-hover-elevate no-default-active-elevate`}>{fn.implemented}</Badge>
                      <Badge className={`text-[9px] ${getStatusBadgeClass("partial")} no-default-hover-elevate no-default-active-elevate`}>{fn.partial}</Badge>
                      <Badge className={`text-[9px] ${getStatusBadgeClass("not_implemented")} no-default-hover-elevate no-default-active-elevate`}>{fn.notImplemented}</Badge>
                    </div>
                    <span className="text-xs font-mono font-bold" style={{ color: getScoreColor(fn.score) }}>{fn.score}%</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] w-[80px]">Control</TableHead>
                          <TableHead className="text-[10px]">Name</TableHead>
                          <TableHead className="text-[10px] w-[100px]">Status</TableHead>
                          <TableHead className="text-[10px] w-[60px]">Score</TableHead>
                          <TableHead className="text-[10px]">Evidence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fnControls.map(([ctrlId, ctrl]) => (
                          <TableRow key={ctrlId} data-testid={`row-control-${ctrlId}`}>
                            <TableCell className="text-[10px] font-mono font-medium">{ctrlId}</TableCell>
                            <TableCell className="text-[10px]">{ctrl.controlName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {getStatusIcon(ctrl.status)}
                                <Badge className={`text-[9px] ${getStatusBadgeClass(ctrl.status)} no-default-hover-elevate no-default-active-elevate`}>
                                  {getStatusLabel(ctrl.status)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono" style={{ color: getScoreColor(ctrl.score) }}>
                              {ctrl.score}%
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">{ctrl.evidence}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {data.gapAnalysis && data.gapAnalysis.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Gap Analysis
              <Badge variant="outline" className="text-[9px]">{data.gapAnalysis.length} gaps</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-[60px]">Priority</TableHead>
                  <TableHead className="text-[10px] w-[80px]">Control</TableHead>
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Function</TableHead>
                  <TableHead className="text-[10px] w-[90px]">Status</TableHead>
                  <TableHead className="text-[10px]">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.gapAnalysis.map((gap, idx) => (
                  <TableRow key={idx} data-testid={`row-gap-${idx}`}>
                    <TableCell>
                      <Badge className={`text-[9px] ${gap.priority === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"} no-default-hover-elevate no-default-active-elevate`}>
                        {gap.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono font-medium">{gap.controlId}</TableCell>
                    <TableCell className="text-[10px]">{gap.controlName}</TableCell>
                    <TableCell className="text-[10px]">{gap.functionId} - {gap.functionName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(gap.status)}
                        <span className="text-[10px]">{getStatusLabel(gap.status)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{gap.evidence}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}

function EmptyState({ onAssess, isPending }: { onAssess: () => void; isPending: boolean }) {
  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardContent className="p-8 text-center space-y-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">No Compliance Assessment</h3>
        <p className="text-sm text-muted-foreground">
          Run a compliance assessment to evaluate your security controls against NIST CSF 2.0 and ISO 27001 frameworks.
          The assessment automatically maps your platform data to framework controls.
        </p>
        <Button onClick={onAssess} disabled={isPending} data-testid="button-initial-assess">
          {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Assessing...</> : <><ShieldCheck className="w-4 h-4 mr-2" />Run Assessment</>}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ComplianceFrameworksPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;
  const [activeFramework, setActiveFramework] = useState<string>("overview");

  const { data: complianceData, isLoading } = useQuery<ComplianceResponse>({
    queryKey: ["/api/compliance/assessment", tenantId],
    enabled: !!tenantId,
  });

  const assessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/compliance/assess/${tenantId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/assessment"] });
      toast({ title: "Assessment Complete", description: "Compliance frameworks assessed against current security controls." });
    },
    onError: (error: any) => {
      toast({ title: "Assessment Failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  const nistData = complianceData?.data?.nist_csf;
  const isoData = complianceData?.data?.iso_27001;
  const hasData = complianceData?.assessed && (nistData || isoData);

  if (!hasData) {
    return (
      <div className="p-4 md:p-6 overflow-y-auto h-full">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-compliance-title">
              <Shield className="w-5 h-5" /> Compliance Frameworks
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{currentTenant?.name}</p>
          </div>
        </div>
        <EmptyState onAssess={() => assessMutation.mutate()} isPending={assessMutation.isPending} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 overflow-y-auto h-full" data-testid="compliance-frameworks-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-compliance-title">
            <Shield className="w-5 h-5" /> Compliance Frameworks
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{currentTenant?.name}</p>
        </div>
        <Button
          onClick={() => assessMutation.mutate()}
          disabled={assessMutation.isPending}
          data-testid="button-reassess"
        >
          {assessMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Assessing...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Reassess</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card data-testid="card-nist-score">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">NIST CSF 2.0</p>
                <p className="text-2xl font-bold tracking-tight" style={{ color: getScoreColor(nistData?.overallScore || 0) }}>
                  {nistData?.overallScore || 0}%
                </p>
                <p className="text-[10px] text-muted-foreground">{getScoreLabel(nistData?.overallScore || 0)}</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-iso-score">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">ISO 27001:2022</p>
                <p className="text-2xl font-bold tracking-tight" style={{ color: getScoreColor(isoData?.overallScore || 0) }}>
                  {isoData?.overallScore || 0}%
                </p>
                <p className="text-[10px] text-muted-foreground">{getScoreLabel(isoData?.overallScore || 0)}</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/10">
                <Shield className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-gaps">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Gaps</p>
                <p className="text-2xl font-bold tracking-tight text-orange-500">
                  {(nistData?.gapAnalysis?.length || 0) + (isoData?.gapAnalysis?.length || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Across both frameworks</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500/10">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-coverage">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Avg Coverage</p>
                <p className="text-2xl font-bold tracking-tight" style={{ color: getScoreColor(Math.round(((nistData?.overallScore || 0) + (isoData?.overallScore || 0)) / 2)) }}>
                  {Math.round(((nistData?.overallScore || 0) + (isoData?.overallScore || 0)) / 2)}%
                </p>
                <p className="text-[10px] text-muted-foreground">Combined frameworks</p>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10">
                <ShieldAlert className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeFramework} onValueChange={setActiveFramework} data-testid="tabs-framework">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="nist_csf" data-testid="tab-nist">NIST CSF 2.0</TabsTrigger>
          <TabsTrigger value="iso_27001" data-testid="tab-iso">ISO 27001</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nistData && (
              <FrameworkOverviewCard data={nistData} onViewDetails={() => setActiveFramework("nist_csf")} />
            )}
            {isoData && (
              <FrameworkOverviewCard data={isoData} onViewDetails={() => setActiveFramework("iso_27001")} />
            )}
          </div>

          {(nistData || isoData) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-500" /> Top Priority Gaps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-[80px]">Framework</TableHead>
                      <TableHead className="text-[10px] w-[60px]">Priority</TableHead>
                      <TableHead className="text-[10px] w-[80px]">Control</TableHead>
                      <TableHead className="text-[10px]">Name</TableHead>
                      <TableHead className="text-[10px]">Function / Domain</TableHead>
                      <TableHead className="text-[10px]">Evidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      ...(nistData?.gapAnalysis || []).filter(g => g.priority === "high").slice(0, 5).map(g => ({ ...g, fw: "NIST" })),
                      ...(isoData?.gapAnalysis || []).filter(g => g.priority === "high").slice(0, 5).map(g => ({ ...g, fw: "ISO" })),
                    ].slice(0, 10).map((gap, idx) => (
                      <TableRow key={idx} data-testid={`row-priority-gap-${idx}`}>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px]">{gap.fw}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="text-[9px] bg-red-500/10 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">
                            {gap.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">{gap.controlId}</TableCell>
                        <TableCell className="text-[10px]">{gap.controlName}</TableCell>
                        <TableCell className="text-[10px]">{gap.functionName}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{gap.evidence}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="nist_csf" className="mt-4">
          {nistData ? <FrameworkDetailView data={nistData} /> : <p className="text-sm text-muted-foreground p-4">No NIST CSF assessment data.</p>}
        </TabsContent>

        <TabsContent value="iso_27001" className="mt-4">
          {isoData ? <FrameworkDetailView data={isoData} /> : <p className="text-sm text-muted-foreground p-4">No ISO 27001 assessment data.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
