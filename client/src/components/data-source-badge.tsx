import { Database, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface DataSourceBadgeProps {
  source?: string | null;
  latencyMs?: number | null;
  className?: string;
}

export function DataSourceBadge({ source, latencyMs, className }: DataSourceBadgeProps) {
  if (!source) return null;

  const isOlap = source === "clickhouse_olap";
  const Icon = isOlap ? Zap : Database;
  const label = isOlap ? "OLAP fast-path" : "PostgreSQL";
  const latencyText =
    typeof latencyMs === "number" && Number.isFinite(latencyMs)
      ? ` • ${Math.max(0, Math.round(latencyMs))}ms`
      : "";

  const colorClass = isOlap
    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
    : "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400";

  const latencyDetail =
    typeof latencyMs === "number" && Number.isFinite(latencyMs)
      ? ` Server-side latency for this request was ${Math.max(0, Math.round(latencyMs))}ms (excludes network round-trip).`
      : "";
  const tip = (isOlap
    ? "Served from ClickHouse — the OLAP store used for high-volume event search and aggregations. Falls back to PostgreSQL when ClickHouse is unreachable."
    : "Served from PostgreSQL — the primary OLTP store. ClickHouse fast-path is unavailable or this query isn't supported by the OLAP schema."
  ) + latencyDetail;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`inline-flex items-center gap-1 font-medium ${colorClass} ${className ?? ""}`}
            data-testid={`badge-data-source-${isOlap ? "clickhouse" : "postgres"}`}
          >
            <Icon className="w-3 h-3" />
            <span className="text-[11px]">{label}{latencyText}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
