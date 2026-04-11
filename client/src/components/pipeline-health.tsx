import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Server,
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Zap,
  Shield,
  Search,
  HardDrive,
} from "lucide-react";

interface PipelineService {
  name: string;
  description: string;
  status: string;
  reachable: boolean;
  url: string | null;
  topics: { produces: string[]; consumes: string[] };
  scaling: { min: number; max: number; current: number };
}

interface PipelineTopic {
  name: string;
  partitions: number;
  description: string;
  retentionDays: number;
}

interface PipelineStage {
  stage: number;
  service: string;
  input: string;
  output: string;
}

interface PipelineMetrics {
  architecture: string;
  kafkaAvailable: boolean;
  services: PipelineService[];
  topics: PipelineTopic[];
  pipeline: PipelineStage[];
  timestamp: string;
}

const SERVICE_ICONS: Record<string, any> = {
  collector: Zap,
  normalizer: Layers,
  "detection-engine": Shield,
  enrichment: Search,
  storage: Database,
};

const SERVICE_COLORS: Record<string, string> = {
  collector: "bg-blue-500",
  normalizer: "bg-purple-500",
  "detection-engine": "bg-orange-500",
  enrichment: "bg-emerald-500",
  storage: "bg-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" data-testid="badge-status-healthy">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Healthy
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" data-testid="badge-status-degraded">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Degraded
        </Badge>
      );
    case "standalone":
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" data-testid="badge-status-standalone">
          <Server className="w-3 h-3 mr-1" />
          Standalone
        </Badge>
      );
    default:
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" data-testid="badge-status-unreachable">
          <XCircle className="w-3 h-3 mr-1" />
          Unreachable
        </Badge>
      );
  }
}

function PipelineFlowDiagram({ pipeline }: { pipeline: PipelineStage[] }) {
  return (
    <Card data-testid="card-pipeline-flow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Event Processing Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 overflow-x-auto pb-2" data-testid="pipeline-flow-diagram">
          {pipeline.map((stage, idx) => {
            const Icon = SERVICE_ICONS[stage.service] || Server;
            const color = SERVICE_COLORS[stage.service] || "bg-gray-500";
            return (
              <div key={stage.stage} className="flex items-center gap-2">
                <div className="flex flex-col items-center min-w-[120px]" data-testid={`pipeline-stage-${stage.stage}`}>
                  <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium mt-1 text-center">{stage.service}</span>
                  <span className="text-[10px] text-muted-foreground text-center max-w-[110px] truncate">
                    {stage.output}
                  </span>
                </div>
                {idx < pipeline.length - 1 && (
                  <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceCard({ service }: { service: PipelineService }) {
  const Icon = SERVICE_ICONS[service.name] || Server;
  const color = SERVICE_COLORS[service.name] || "bg-gray-500";

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-service-${service.name}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center text-white`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-sm capitalize">{service.name.replace("-", " ")}</h4>
              <p className="text-xs text-muted-foreground">{service.description}</p>
            </div>
          </div>
          <StatusBadge status={service.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-muted/50 rounded-md p-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Scaling</span>
            <p className="text-sm font-medium">
              {service.scaling.current} / {service.scaling.max} pods
            </p>
            <p className="text-[10px] text-muted-foreground">min: {service.scaling.min}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Topics</span>
            <p className="text-sm font-medium">
              {service.topics.consumes.length} in / {service.topics.produces.length} out
            </p>
          </div>
        </div>

        {service.topics.produces.length > 0 && (
          <div className="mt-2">
            <span className="text-[10px] text-muted-foreground">Produces:</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {service.topics.produces.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0" data-testid={`badge-topic-${t}`}>
                  {t.split(".").pop()}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {service.topics.consumes.length > 0 && (
          <div className="mt-1.5">
            <span className="text-[10px] text-muted-foreground">Consumes:</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {service.topics.consumes.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-consumes-${t}`}>
                  {t.split(".").pop()}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopicsTable({ topics }: { topics: PipelineTopic[] }) {
  return (
    <Card data-testid="card-kafka-topics">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="w-4 h-4" />
          Kafka Topics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Topic</th>
                <th className="pb-2 font-medium">Partitions</th>
                <th className="pb-2 font-medium">Retention</th>
                <th className="pb-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.name} className="border-b last:border-0" data-testid={`row-topic-${topic.name}`}>
                  <td className="py-2">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{topic.name}</code>
                  </td>
                  <td className="py-2">
                    <Badge variant="outline" className="text-xs">{topic.partitions}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">{topic.retentionDays}d</td>
                  <td className="py-2 text-muted-foreground text-xs">{topic.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PipelineHealthTab() {
  const { data: metrics, isLoading } = useQuery<PipelineMetrics>({
    queryKey: ["/api/pipeline/metrics"],
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="pipeline-health-loading">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <Card data-testid="card-pipeline-error">
        <CardContent className="p-8 text-center text-muted-foreground">
          <XCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Unable to load pipeline metrics</p>
        </CardContent>
      </Card>
    );
  }

  const healthyCount = metrics.services.filter((s) => s.status === "healthy").length;
  const totalServices = metrics.services.length;

  return (
    <div className="space-y-4" data-testid="pipeline-health-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Microservices Pipeline Health</h3>
          <p className="text-sm text-muted-foreground">
            Architecture: {metrics.architecture} | Kafka: {" "}
            {metrics.kafkaAvailable ? (
              <span className="text-green-600">Connected</span>
            ) : (
              <span className="text-yellow-600">Standalone Mode</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              healthyCount === totalServices
                ? "bg-green-100 text-green-700"
                : healthyCount > 0
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
            }
            data-testid="badge-overall-health"
          >
            {healthyCount}/{totalServices} Services Healthy
          </Badge>
        </div>
      </div>

      <PipelineFlowDiagram pipeline={metrics.pipeline} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.services.map((service) => (
          <ServiceCard key={service.name} service={service} />
        ))}
      </div>

      <TopicsTable topics={metrics.topics} />
    </div>
  );
}
