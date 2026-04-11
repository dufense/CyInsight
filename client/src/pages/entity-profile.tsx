import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useTenantDateFormatter } from "@/lib/format-date";
import {
  Server, Users, Mail, ArrowLeft, Calendar, Activity, Shield,
  Database, Globe, AlertTriangle, ChevronRight, Loader2, Network,
  AppWindow, Upload, Download, BarChart3, TrendingUp, Target, Zap,
} from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

function getRiskColor(level: string) {
  switch (level?.toLowerCase()) {
    case "severe": return "bg-purple-600/10 text-purple-600 border-purple-600/20";
    case "critical": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "high": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "medium": case "moderate": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "low": return "bg-green-500/10 text-green-500 border-green-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getEntityIcon(entityType: string) {
  switch (entityType) {
    case "host": return Server;
    case "user": return Users;
    case "email": return Mail;
    case "application": return AppWindow;
    default: return Shield;
  }
}

const RISK_LEVEL_COLORS: Record<string, string> = {
  severe: "text-purple-600 dark:text-purple-400",
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-500 dark:text-orange-400",
  moderate: "text-yellow-600 dark:text-yellow-400",
  low: "text-green-600 dark:text-green-400",
};

const RISK_LEVEL_BG: Record<string, string> = {
  severe: "bg-purple-500",
  critical: "bg-red-500",
  high: "bg-orange-500",
  moderate: "bg-yellow-500",
  low: "bg-green-500",
};

const FACTOR_SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-slate-400",
};

function RiskGauge({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 81 ? "#9333ea" : score >= 61 ? "#ef4444" : score >= 41 ? "#f97316" : score >= 21 ? "#eab308" : "#22c55e";

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }} data-testid="risk-gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 8 ${size / 2 + 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${size / 2 + 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 2}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="text-2xl font-bold" style={{ color }} data-testid="text-risk-score">{score}</span>
      </div>
    </div>
  );
}

function RiskScorePanel({ tenantId, entityType, entityName }: { tenantId: string; entityType: string; entityName: string }) {
  const { data: riskData, isLoading } = useQuery<any>({
    queryKey: ["/api/entity-risk", tenantId, entityType, entityName],
    queryFn: async () => {
      const res = await fetch(`/api/entity-risk/${tenantId}/${entityType}/${encodeURIComponent(entityName)}`);
      if (!res.ok) throw new Error("Failed to fetch risk score");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-32" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!riskData) return null;

  const levelColor = RISK_LEVEL_COLORS[riskData.riskLevel] || RISK_LEVEL_COLORS.low;
  const levelBg = RISK_LEVEL_BG[riskData.riskLevel] || RISK_LEVEL_BG.low;

  return (
    <div className="space-y-4" data-testid="risk-score-panel">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <RiskGauge score={riskData.overallScore} />
            <div className="text-center mt-1">
              <Badge className={`${levelBg} text-white text-xs px-3 py-0.5`} data-testid="badge-overall-risk">
                {riskData.riskLevel?.toUpperCase()}
              </Badge>
              {riskData.correlationMultiplier > 1 && (
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  Correlation: {riskData.correlationMultiplier}x
                </div>
              )}
              {riskData.decayApplied && (
                <div className="text-[10px] text-muted-foreground mt-0.5">Time decay applied</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4" />
              Top Contributing Factors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskData.topFactors?.map((factor: any, i: number) => (
              <div key={i} className="space-y-1" data-testid={`risk-factor-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate flex-1">{factor.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                      factor.severity === "critical" ? "text-red-500 border-red-200" :
                      factor.severity === "high" ? "text-orange-500 border-orange-200" :
                      factor.severity === "medium" ? "text-yellow-600 border-yellow-200" :
                      "text-blue-500 border-blue-200"
                    }`} data-testid={`badge-factor-severity-${i}`}>
                      {factor.severity}
                    </Badge>
                    <span className="text-xs font-bold w-8 text-right">{factor.percentage}%</span>
                  </div>
                </div>
                <Progress
                  value={factor.percentage}
                  className="h-1.5"
                  data-testid={`progress-factor-${i}`}
                />
                <p className="text-[10px] text-muted-foreground">{factor.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskData.categoryBreakdown?.length > 0 ? (
              <div className="space-y-3">
                {riskData.categoryBreakdown.map((cat: any, i: number) => (
                  <div key={i} className="space-y-1" data-testid={`category-${i}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{cat.category}</span>
                      <span className="text-xs font-bold">{cat.percentage}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          cat.percentage >= 70 ? "bg-red-500" :
                          cat.percentage >= 40 ? "bg-orange-500" :
                          cat.percentage >= 20 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {cat.score.toFixed(1)} / {cat.maxScore.toFixed(1)} weighted score
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No category data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Risk Score Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskData.historicalTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={riskData.historicalTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    labelFormatter={(l: string) => `Date: ${l}`}
                  />
                  <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[160px] text-xs text-muted-foreground">
                No historical trend data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {riskData.factors?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4" />
              All Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Factor</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Weight</TableHead>
                  <TableHead className="text-xs">Contribution</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskData.factors.map((f: any, i: number) => (
                  <TableRow key={i} data-testid={`row-all-factor-${i}`}>
                    <TableCell className="text-xs font-medium max-w-[200px]">
                      <div>{f.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{f.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px]">{f.category}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{f.score}/{f.maxScore}</TableCell>
                    <TableCell className="text-xs font-mono">{Math.round(f.weight * 100)}%</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${FACTOR_SEVERITY_COLORS[f.severity] || "bg-slate-400"}`}
                            style={{ width: `${f.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono">{f.percentage}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[9px] ${
                        f.severity === "critical" ? "text-red-500 border-red-200" :
                        f.severity === "high" ? "text-orange-500 border-orange-200" :
                        f.severity === "medium" ? "text-yellow-600 border-yellow-200" :
                        f.severity === "low" ? "text-blue-500 border-blue-200" :
                        "text-slate-400 border-slate-200"
                      }`}>
                        {f.severity}
                      </Badge>
                    </TableCell>
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

function CompactRiskScore({ tenantId, entityType, entityName }: { tenantId: string; entityType: string; entityName: string }) {
  const { data: riskData } = useQuery<any>({
    queryKey: ["/api/entity-risk", tenantId, entityType, entityName],
    queryFn: async () => {
      const res = await fetch(`/api/entity-risk/${tenantId}/${entityType}/${encodeURIComponent(entityName)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
  });

  if (!riskData) return null;

  const color = riskData.overallScore >= 81 ? "#9333ea" : riskData.overallScore >= 61 ? "#ef4444" : riskData.overallScore >= 41 ? "#f97316" : riskData.overallScore >= 21 ? "#eab308" : "#22c55e";
  const levelBg = RISK_LEVEL_BG[riskData.riskLevel] || RISK_LEVEL_BG.low;

  return (
    <div className="flex items-center gap-3 ml-auto" data-testid="compact-risk-score">
      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="p-0 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <RiskGauge score={riskData.overallScore} size={70} />
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Risk Score</div>
            <Badge className={`${levelBg} text-white text-[10px] mt-0.5`}>
              {riskData.riskLevel?.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EntityProfileSkeleton() {
  return (
    <div className="p-6 space-y-4" data-testid="entity-profile-loading">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-96" />
    </div>
  );
}

function HostOverview({ entity }: { entity: any }) {
  const fmt = useTenantDateFormatter();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Count</div>
          <div className="text-xl font-bold mt-1" data-testid="text-event-count">{entity.eventCount ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sources</div>
          <div className="text-xl font-bold mt-1" data-testid="text-sources-count">{entity.sources?.length ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">IPs</div>
          <div className="text-sm font-medium mt-1 break-all" data-testid="text-ips">{entity.ips?.join(", ") || "N/A"}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">OS</div>
          <div className="text-sm font-medium mt-1" data-testid="text-os">{Array.isArray(entity.os) ? entity.os.join(", ") : (entity.os || "N/A")}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">First Seen</div>
          <div className="text-sm font-medium mt-1" data-testid="text-first-seen">
            {entity.firstSeen ? fmt.formatDate(entity.firstSeen) : "N/A"}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Seen</div>
          <div className="text-sm font-medium mt-1" data-testid="text-last-seen">
            {entity.lastSeen ? fmt.formatDate(entity.lastSeen) : "N/A"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserOverview({ entity }: { entity: any }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Count</div>
          <div className="text-xl font-bold mt-1" data-testid="text-event-count">{entity.eventCount ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sources</div>
          <div className="text-xl font-bold mt-1" data-testid="text-sources-count">{entity.sources?.length ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Display Name</div>
          <div className="text-sm font-medium mt-1" data-testid="text-display-name">{entity.displayName || "N/A"}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Web Requests</div>
          <div className="text-xl font-bold mt-1" data-testid="text-web-requests">{entity.webActivity?.totalRequests ?? 0}</div>
          {(entity.webActivity?.blockedRequests ?? 0) > 0 && (
            <div className="text-[10px] text-red-500">{entity.webActivity.blockedRequests} blocked</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cloud Actions</div>
          <div className="text-xl font-bold mt-1" data-testid="text-cloud-actions">{entity.cloudActivity?.totalActions ?? 0}</div>
          {(entity.cloudActivity?.suspiciousActions ?? 0) > 0 && (
            <div className="text-[10px] text-orange-500">{entity.cloudActivity.suspiciousActions} suspicious</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Email Activity</div>
          <div className="text-xl font-bold mt-1" data-testid="text-email-activity">
            {(entity.emailActivity?.sentCount ?? 0) + (entity.emailActivity?.receivedCount ?? 0)}
          </div>
          {(entity.emailActivity?.threatCount ?? 0) > 0 && (
            <div className="text-[10px] text-red-500">{entity.emailActivity.threatCount} threats</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmailOverview({ entity }: { entity: any }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Domain</div>
          <div className="text-sm font-medium mt-1" data-testid="text-domain">{entity.domain || "N/A"}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sent Count</div>
          <div className="text-xl font-bold mt-1" data-testid="text-sent-count">{entity.sentCount ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Received Count</div>
          <div className="text-xl font-bold mt-1" data-testid="text-received-count">{entity.receivedCount ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Threats Sent</div>
          <div className="text-xl font-bold mt-1 text-red-500" data-testid="text-threats-sent">{entity.threatsSent ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Threats Received</div>
          <div className="text-xl font-bold mt-1 text-orange-500" data-testid="text-threats-received">{entity.threatsReceived ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Spam / Phishing</div>
          <div className="text-sm font-medium mt-1" data-testid="text-spam-phishing">
            {entity.spamCount ?? 0} / {entity.phishingCount ?? 0}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationOverview({ entity, appProfile }: { entity: any; appProfile: any }) {
  const fmt = useTenantDateFormatter();
  const cloudRisk = entity.cloudRiskData;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Events</div>
            <div className="text-xl font-bold mt-1" data-testid="text-total-events">{entity.totalEvents ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unique Users</div>
            <div className="text-xl font-bold mt-1" data-testid="text-unique-users">{entity.uniqueUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</div>
            <div className="text-sm font-medium mt-1" data-testid="text-category">{entity.categories?.join(", ") || "N/A"}</div>
          </CardContent>
        </Card>
        {cloudRisk && (
          <Card>
            <CardContent className="p-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-muted/30 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${cloudRisk.confidenceIndex}%`,
                      backgroundColor: cloudRisk.confidenceIndex >= 70 ? "#22c55e" : cloudRisk.confidenceIndex >= 40 ? "#eab308" : "#ef4444",
                    }}
                  />
                </div>
                <span className="text-sm font-bold" data-testid="text-confidence-index">{cloudRisk.confidenceIndex}</span>
              </div>
              <Badge className={`text-[9px] mt-1 ${
                cloudRisk.riskClassification === "High Risk" ? "bg-red-500/10 text-red-500" :
                cloudRisk.riskClassification === "Medium Risk" ? "bg-yellow-500/10 text-yellow-500" :
                "bg-green-500/10 text-green-500"
              }`} data-testid="badge-risk-classification">{cloudRisk.riskClassification}</Badge>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Upload className="w-3 h-3" /> Uploads</div>
            <div className="text-lg font-bold mt-1 text-orange-500" data-testid="text-uploads">{appProfile?.totalUploadsMB ?? 0} MB</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Download className="w-3 h-3" /> Downloads</div>
            <div className="text-lg font-bold mt-1 text-blue-500" data-testid="text-downloads">{appProfile?.totalDownloadsMB ?? 0} MB</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">First Seen</div>
            <div className="text-sm font-medium mt-1" data-testid="text-first-seen">
              {entity.firstSeen ? fmt.formatDate(entity.firstSeen) : "N/A"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Seen</div>
            <div className="text-sm font-medium mt-1" data-testid="text-last-seen">
              {entity.lastSeen ? fmt.formatDate(entity.lastSeen) : "N/A"}
            </div>
          </CardContent>
        </Card>
      </div>

      {appProfile?.timeline?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={appProfile.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApplicationUsersTab({ appProfile, tenantId }: { appProfile: any; tenantId: string }) {
  const [, navigate] = useLocation();
  const users = appProfile?.topUsers || [];

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-users">
          No user activity found for this application.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <Users className="w-4 h-4" />
          Active Users
          <Badge variant="secondary" className="text-[10px]">{users.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs w-[100px]">Events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u: any, i: number) => (
              <TableRow
                key={i}
                className="cursor-pointer hover-elevate"
                data-testid={`row-app-user-${i}`}
                onClick={() => {
                  if (u.user.includes("@")) {
                    navigate(`/entity-profile/${tenantId}/email/${encodeURIComponent(u.user)}`);
                  } else {
                    navigate(`/entity-profile/${tenantId}/user/${encodeURIComponent(u.user)}`);
                  }
                }}
              >
                <TableCell className="text-xs font-medium">{u.user}</TableCell>
                <TableCell className="text-xs font-mono">{u.eventCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CorrelatedEntitiesTab({ correlated, entityType, tenantId }: { correlated: any; entityType: string; tenantId: string }) {
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      {entityType !== "host" && correlated.hosts?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              <Server className="w-4 h-4" />
              Linked Hosts
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-hosts-count">{correlated.hosts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Host Name</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Events</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {correlated.hosts.map((host: any, i: number) => (
                  <TableRow
                    key={i}
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-host-${i}`}
                    onClick={() => navigate(`/entity-profile/${tenantId}/host/${encodeURIComponent(host.name)}`)}
                  >
                    <TableCell className="text-xs font-medium">{host.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{host.sources?.join(", ") || "N/A"}</TableCell>
                    <TableCell className="text-xs">{host.eventCount ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${getRiskColor(host.riskLevel)}`} data-testid={`badge-host-risk-${i}`}>
                        {host.riskLevel || "unknown"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {entityType !== "user" && correlated.users?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4" />
              Linked Users
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-users-count">{correlated.users.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Username</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Events</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {correlated.users.map((user: any, i: number) => (
                  <TableRow
                    key={i}
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-user-${i}`}
                    onClick={() => navigate(`/entity-profile/${tenantId}/user/${encodeURIComponent(user.name)}`)}
                  >
                    <TableCell className="text-xs font-medium">{user.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.sources?.join(", ") || "N/A"}</TableCell>
                    <TableCell className="text-xs">{user.eventCount ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${getRiskColor(user.riskLevel)}`} data-testid={`badge-user-risk-${i}`}>
                        {user.riskLevel || "unknown"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {entityType !== "email" && correlated.emails?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              <Mail className="w-4 h-4" />
              Linked Emails
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-emails-count">{correlated.emails.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Address</TableHead>
                  <TableHead className="text-xs">Domain</TableHead>
                  <TableHead className="text-xs">Threats</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {correlated.emails.map((email: any, i: number) => (
                  <TableRow
                    key={i}
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-email-${i}`}
                    onClick={() => navigate(`/entity-profile/${tenantId}/email/${encodeURIComponent(email.address)}`)}
                  >
                    <TableCell className="text-xs font-medium">{email.address}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{email.domain || "N/A"}</TableCell>
                    <TableCell className="text-xs">{(email.threatsSent ?? 0) + (email.threatsReceived ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${getRiskColor(email.riskLevel)}`} data-testid={`badge-email-risk-${i}`}>
                        {email.riskLevel || "unknown"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {entityType !== "host" && (!correlated.hosts || correlated.hosts.length === 0) &&
       entityType !== "user" && (!correlated.users || correlated.users.length === 0) &&
       entityType !== "email" && (!correlated.emails || correlated.emails.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-correlations">
            No correlated entities found for this profile.
          </CardContent>
        </Card>
      )}

      {entityType === "host" && (!correlated.users || correlated.users.length === 0) && (!correlated.emails || correlated.emails.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-correlations">
            No correlated entities found for this host.
          </CardContent>
        </Card>
      )}

      {entityType === "user" && (!correlated.hosts || correlated.hosts.length === 0) && (!correlated.emails || correlated.emails.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-correlations">
            No correlated entities found for this user.
          </CardContent>
        </Card>
      )}

      {entityType === "email" && (!correlated.hosts || correlated.hosts.length === 0) && (!correlated.users || correlated.users.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-correlations">
            No correlated entities found for this email.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventsTab({ events }: { events: any[] }) {
  const fmt = useTenantDateFormatter();
  const displayEvents = (events || []).slice(0, 50);

  if (displayEvents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-events">
          No recent events found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4" />
          Recent Events
          <Badge variant="secondary" className="text-[10px]">{displayEvents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Event Type</TableHead>
              <TableHead className="text-xs">Source</TableHead>
              <TableHead className="text-xs">Severity</TableHead>
              <TableHead className="text-xs">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayEvents.map((evt, i) => (
              <TableRow key={evt.id || i} data-testid={`row-event-${i}`}>
                <TableCell className="text-xs text-muted-foreground">
                  {evt.timestamp ? fmt.formatDate(evt.timestamp) : "N/A"}
                </TableCell>
                <TableCell className="text-xs font-medium">{evt.eventType || "N/A"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{evt.source || "N/A"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${getRiskColor(evt.severity)}`}>
                    {evt.severity || "unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {evt.rawPayload ? (typeof evt.rawPayload === "string" ? evt.rawPayload : JSON.stringify(evt.rawPayload)).slice(0, 80) : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function IncidentsTab({ incidents }: { incidents: any[] }) {
  const fmt = useTenantDateFormatter();
  const [, navigate] = useLocation();

  if (!incidents || incidents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-no-incidents">
          No linked incidents found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4" />
          Linked Incidents
          <Badge variant="secondary" className="text-[10px]">{incidents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Title</TableHead>
              <TableHead className="text-xs">Severity</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.map((inc, i) => (
              <TableRow
                key={inc.id || i}
                className="cursor-pointer hover-elevate"
                data-testid={`row-incident-${i}`}
                onClick={() => navigate("/events?domain=overview")}
              >
                <TableCell className="text-xs font-mono">{inc.id}</TableCell>
                <TableCell className="text-xs font-medium">{inc.title || "N/A"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${getRiskColor(inc.severity)}`}>
                    {inc.severity || "unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{inc.status || "N/A"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {inc.createdAt ? fmt.formatDate(inc.createdAt) : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function EntityProfilePage() {
  const [, params] = useRoute("/entity-profile/:tenantId/:entityType/:entityName");
  const fmt = useTenantDateFormatter();
  const [, navigate] = useLocation();

  const tenantId = params?.tenantId || "";
  const entityType = params?.entityType || "";
  const entityName = params?.entityName ? decodeURIComponent(params.entityName) : "";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/entity-profile", tenantId, entityType, entityName],
    queryFn: async () => {
      const res = await fetch(
        `/api/entity-profile/${tenantId}/${entityType}/${encodeURIComponent(entityName)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load entity profile");
      return res.json();
    },
    enabled: !!tenantId && !!entityType && !!entityName,
  });

  if (isLoading) {
    return <EntityProfileSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/caasm")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-error">
            Entity not found or no data available.
          </CardContent>
        </Card>
      </div>
    );
  }

  const entity = data.entity || {};
  const profile = data.profile || { recentEvents: [], linkedIncidents: [] };
  const correlated = data.correlated || { hosts: [], users: [], emails: [] };
  const EntityIcon = getEntityIcon(entityType);
  const riskLevel = entity.riskLevel || "unknown";
  const sources = entity.sources || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/caasm")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {entityType === "application" ? (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50">
            <AppLogo name={entityName} size={24} fallbackIcon="app" fallbackColor="text-muted-foreground" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50">
            <EntityIcon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate" data-testid="text-entity-name">{entityName}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${getRiskColor(riskLevel)}`} data-testid="badge-risk-level">
              {riskLevel}
            </Badge>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-entity-type">
              {entityType}
            </Badge>
            {entity.firstSeen && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                First seen: {fmt.formatDate(entity.firstSeen)}
              </span>
            )}
            {entity.lastSeen && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                Last seen: {fmt.formatDate(entity.lastSeen)}
              </span>
            )}
          </div>
        </div>
        <CompactRiskScore tenantId={tenantId} entityType={entityType} entityName={entityName} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="risk" className="text-xs" data-testid="tab-risk">Risk Analysis</TabsTrigger>
          {entityType === "application" && (
            <TabsTrigger value="users" className="text-xs" data-testid="tab-users">Users</TabsTrigger>
          )}
          {entityType !== "application" && (
            <TabsTrigger value="correlated" className="text-xs" data-testid="tab-correlated">Correlated Entities</TabsTrigger>
          )}
          <TabsTrigger value="events" className="text-xs" data-testid="tab-events">Events</TabsTrigger>
          {entityType !== "application" && (
            <TabsTrigger value="incidents" className="text-xs" data-testid="tab-incidents">Incidents</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {entityType === "host" && <HostOverview entity={entity} />}
          {entityType === "user" && <UserOverview entity={entity} />}
          {entityType === "email" && <EmailOverview entity={entity} />}
          {entityType === "application" && <ApplicationOverview entity={entity} appProfile={data.appProfile} />}
          {!["host", "user", "email", "application"].includes(entityType) && <HostOverview entity={entity} />}

          {sources.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <Database className="w-4 h-4" />
                  Detection Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {sources.map((src: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]" data-testid={`badge-source-${i}`}>
                      {src}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <RiskScorePanel tenantId={tenantId} entityType={entityType} entityName={entityName} />
        </TabsContent>

        {entityType === "application" && (
          <TabsContent value="users">
            <ApplicationUsersTab appProfile={data.appProfile} tenantId={tenantId} />
          </TabsContent>
        )}

        {entityType !== "application" && (
          <TabsContent value="correlated">
            <CorrelatedEntitiesTab correlated={correlated} entityType={entityType} tenantId={tenantId} />
          </TabsContent>
        )}

        <TabsContent value="events">
          <EventsTab events={profile.recentEvents} />
        </TabsContent>

        {entityType !== "application" && (
          <TabsContent value="incidents">
            <IncidentsTab incidents={profile.linkedIncidents} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
