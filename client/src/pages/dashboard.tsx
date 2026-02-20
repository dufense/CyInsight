import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import {
  AlertTriangle,
  Shield,
  Ticket,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  Mail,
  Monitor,
  Bug,
  Crosshair,
  Target,
  Skull,
  AppWindow,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const CHART_COLORS = [
  "hsl(217, 91%, 55%)",
  "hsl(142, 76%, 45%)",
  "hsl(269, 80%, 58%)",
  "hsl(32, 95%, 52%)",
  "hsl(340, 82%, 52%)",
  "hsl(180, 70%, 45%)",
  "hsl(45, 90%, 50%)",
  "hsl(300, 60%, 50%)",
  "hsl(120, 60%, 40%)",
  "hsl(200, 80%, 60%)",
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "hsl(0, 84%, 42%)",
  high: "hsl(32, 95%, 52%)",
  medium: "hsl(217, 91%, 55%)",
  low: "hsl(142, 76%, 45%)",
  info: "hsl(210, 10%, 50%)",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  email: "hsl(217, 91%, 55%)",
  endpoint: "hsl(340, 82%, 52%)",
  vulnerability: "hsl(32, 95%, 52%)",
};

interface EnhancedDashboardStats {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  criticalIncidents: number;
  totalTickets: number;
  openTickets: number;
  totalEvents: number;
  incidentTrend: { month: string; incidents: number; resolved: number }[];
  severityBreakdown: { name: string; value: number }[];
  categoryBreakdown: { category: string; count: number }[];
  recentIncidents: { id: number; title: string; severity: string; status: string; createdAt: string }[];
  eventsByType: { type: string; count: number }[];
  eventsBySeverity: { name: string; value: number }[];
  eventTrend: { month: string; email: number; endpoint: number; vulnerability: number; total: number }[];
  topThreats: { name: string; count: number }[];
  topTargets: { name: string; count: number }[];
  topAttackers: { name: string; count: number }[];
  topVulnerableApps: { name: string; count: number }[];
  vulnerabilitySeverity: { name: string; value: number }[];
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {change && (
              <div className="flex items-center gap-1">
                {trend === "up" ? (
                  <TrendingUp className="w-3 h-3 text-chart-2" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-destructive" />
                )}
                <span className={`text-[10px] font-medium ${trend === "up" ? "text-chart-2" : "text-destructive"}`}>
                  {change}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Top10Table({
  title,
  data,
  icon: Icon,
  colorKey,
}: {
  title: string;
  data: { name: string; count: number }[];
  icon: any;
  colorKey?: string;
}) {
  const maxCount = data.length > 0 ? data[0].count : 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {data.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">No data available</p>
          )}
          {data.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2" data-testid={`top10-row-${idx}`}>
              <span className="text-[10px] text-muted-foreground w-4 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate">{item.name}</span>
                  <span className="text-xs font-medium shrink-0">{item.count}</span>
                </div>
                <div className="w-full bg-muted/30 rounded-full h-1 mt-0.5">
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
        <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
};

export default function DashboardPage() {
  const { currentTenant } = useTenant();

  const { data: stats, isLoading } = useQuery<EnhancedDashboardStats>({
    queryKey: ["/api/dashboard", currentTenant?.id],
    enabled: !!currentTenant,
  });

  if (isLoading || !stats) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-dashboard-title">
            Security Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- Real-time security overview
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Activity className="w-3 h-3" />
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Incidents"
          value={stats.totalIncidents}
          change="+12% this month"
          icon={AlertTriangle}
          trend="up"
        />
        <StatCard
          title="Open Incidents"
          value={stats.openIncidents}
          change="-5% vs last month"
          icon={Shield}
          trend="down"
        />
        <StatCard
          title="Critical Alerts"
          value={stats.criticalIncidents}
          icon={AlertTriangle}
        />
        <StatCard
          title="Security Events"
          value={stats.totalEvents}
          icon={Activity}
        />
        <StatCard
          title="Support Tickets"
          value={stats.totalTickets}
          change={`${stats.openTickets} open`}
          icon={Ticket}
          trend="down"
        />
      </div>

      <Tabs defaultValue="overview" data-testid="dashboard-tabs">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="threats" data-testid="tab-threats">Threats & Targets</TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">Event Analysis</TabsTrigger>
          <TabsTrigger value="vulnerabilities" data-testid="tab-vulnerabilities">Vulnerabilities</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Incident Trend</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={stats.incidentTrend}>
                    <defs>
                      <linearGradient id="colorIncidents" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="incidents" stroke={CHART_COLORS[0]} fill="url(#colorIncidents)" strokeWidth={2} />
                    <Area type="monotone" dataKey="resolved" stroke={CHART_COLORS[1]} fill="url(#colorResolved)" strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Severity Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={stats.severityBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {stats.severityBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || CHART_COLORS[0]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px" }}
                      formatter={(value) => <span className="capitalize">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Incidents by Category</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.categoryBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Recent Incidents</CardTitle>
                <a href="/incidents" className="text-xs text-primary flex items-center gap-0.5">
                  View All <ArrowUpRight className="w-3 h-3" />
                </a>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {stats.recentIncidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30"
                      data-testid={`incident-row-${incident.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          incident.severity === "critical" ? "bg-destructive" :
                          incident.severity === "high" ? "bg-chart-4" :
                          incident.severity === "medium" ? "bg-chart-1" :
                          "bg-chart-2"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{incident.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(incident.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={incident.status === "open" ? "destructive" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {incident.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="threats" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Top10Table
              title="Top 10 Threats"
              data={stats.topThreats}
              icon={Skull}
            />
            <Top10Table
              title="Top 10 Targets"
              data={stats.topTargets}
              icon={Target}
            />
            <Top10Table
              title="Top 10 Attackers"
              data={stats.topAttackers}
              icon={Crosshair}
            />
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Security Event Trend</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.eventTrend}>
                    <defs>
                      <linearGradient id="colorEmail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={EVENT_TYPE_COLORS.email} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={EVENT_TYPE_COLORS.email} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorEndpoint" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={EVENT_TYPE_COLORS.endpoint} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={EVENT_TYPE_COLORS.endpoint} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorVuln" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={EVENT_TYPE_COLORS.vulnerability} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={EVENT_TYPE_COLORS.vulnerability} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="email" name="Email" stroke={EVENT_TYPE_COLORS.email} fill="url(#colorEmail)" strokeWidth={2} />
                    <Area type="monotone" dataKey="endpoint" name="Endpoint" stroke={EVENT_TYPE_COLORS.endpoint} fill="url(#colorEndpoint)" strokeWidth={2} />
                    <Area type="monotone" dataKey="vulnerability" name="Vulnerability" stroke={EVENT_TYPE_COLORS.vulnerability} fill="url(#colorVuln)" strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Events by Type</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.eventsByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="count"
                      nameKey="type"
                    >
                      {stats.eventsByType.map((entry) => (
                        <Cell key={entry.type} fill={EVENT_TYPE_COLORS[entry.type] || CHART_COLORS[0]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px" }}
                      formatter={(value) => <span className="capitalize">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Events by Severity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.eventsBySeverity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Events" radius={[4, 4, 0, 0]} barSize={32}>
                    {stats.eventsBySeverity.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || CHART_COLORS[0]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vulnerabilities" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Top10Table
              title="Top Vulnerable Applications"
              data={stats.topVulnerableApps}
              icon={AppWindow}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Vulnerability Severity Distribution</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.vulnerabilitySeverity}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {stats.vulnerabilitySeverity.map((entry) => (
                        <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || CHART_COLORS[0]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px" }}
                      formatter={(value) => <span className="capitalize">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
