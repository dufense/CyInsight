import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Database, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export interface DataSourceBadgeProps {
  source?: string | null;
  latencyMs?: number | null;
  className?: string;
  samplesKey?: string;
  sampleId?: number | string;
}

const MAX_SAMPLES = 20;
const MAX_KEYS = 50;
const STORAGE_PREFIX = "data-source-badge:latency:v1:";
const INDEX_KEY = "data-source-badge:latency:v1:__index";

const sampleStore = new Map<string, number[]>();
const subscribers = new Map<string, Set<() => void>>();
const keyOrder: string[] = [];
let hydrated = false;
let hydrateRequested = false;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeRemoveItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readIndex(storage: Storage): string[] {
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(storage: Storage) {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(keyOrder));
  } catch {
    /* ignore quota */
  }
}

function evictOldest(storage: Storage) {
  while (keyOrder.length > MAX_KEYS) {
    const oldest = keyOrder.shift();
    if (!oldest) break;
    sampleStore.delete(oldest);
    safeRemoveItem(storage, STORAGE_PREFIX + oldest);
  }
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const storage = safeStorage();
  if (!storage) return;
  const seen = new Set<string>();
  const index = readIndex(storage).filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const key of index) {
    try {
      const raw = safeGetItem(storage, STORAGE_PREFIX + key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const nums = parsed
        .map((n) => (typeof n === "number" && Number.isFinite(n) ? n : null))
        .filter((n): n is number => n !== null)
        .slice(-MAX_SAMPLES);
      if (nums.length > 0) {
        sampleStore.set(key, nums);
        keyOrder.push(key);
      } else {
        safeRemoveItem(storage, STORAGE_PREFIX + key);
      }
    } catch {
      /* ignore */
    }
  }
  evictOldest(storage);
  writeIndex(storage);
}

function requestHydrate() {
  if (hydrateRequested) return;
  hydrateRequested = true;
  // Defer to next tick so module-level evaluation never blocks render
  if (typeof window !== "undefined") {
    Promise.resolve().then(hydrate).catch(() => {
      hydrated = false;
      hydrateRequested = false;
    });
  }
}

function persistKey(key: string, samples: number[]) {
  const storage = safeStorage();
  if (!storage) return;
  if (safeSetItem(storage, STORAGE_PREFIX + key, JSON.stringify(samples))) return;
  // Likely quota — drop the oldest and try once more.
  if (keyOrder.length > 0 && keyOrder[0] !== key) {
    const oldest = keyOrder.shift()!;
    sampleStore.delete(oldest);
    safeRemoveItem(storage, STORAGE_PREFIX + oldest);
    safeSetItem(storage, STORAGE_PREFIX + key, JSON.stringify(samples));
  }
}

function pushSample(key: string, value: number) {
  const arr = sampleStore.get(key) ?? [];
  const next = [...arr, value].slice(-MAX_SAMPLES);
  sampleStore.set(key, next);

  const idx = keyOrder.indexOf(key);
  if (idx !== -1) keyOrder.splice(idx, 1);
  keyOrder.push(key);

  const storage = safeStorage();
  if (storage) {
    evictOldest(storage);
    persistKey(key, next);
    writeIndex(storage);
  }

  const subs = subscribers.get(key);
  if (subs) subs.forEach((fn) => fn());
}

function useSamples(key: string | undefined): number[] {
  const [, force] = useState(0);
  const hydratedRef = useRef(false);

  if (!hydratedRef.current) {
    hydratedRef.current = true;
    requestHydrate();
  }

  useEffect(() => {
    if (!key) return;
    const fn = () => {
      try {
        force((n) => n + 1);
      } catch {
        /* ignore stale state updates */
      }
    };
    let subs = subscribers.get(key);
    if (!subs) {
      subs = new Set();
      subscribers.set(key, subs);
    }
    subs.add(fn);
    return () => {
      try {
        subs?.delete(fn);
      } catch {
        /* ignore */
      }
    };
  }, [key]);
  return key ? sampleStore.get(key) ?? [] : [];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  const baseVal = sorted[base];
  if (next === undefined || !Number.isFinite(baseVal)) return Number.isFinite(baseVal) ? baseVal : 0;
  return baseVal + rest * (next - baseVal);
}

type TrendLevel = "normal" | "warning" | "critical";

interface TrendInfo {
  level: TrendLevel;
  recent: number;
  baseline: number;
  ratio: number;
}

const TREND_RECENT_WINDOW = 3;
const TREND_MIN_SAMPLES = 6;
const TREND_WARNING_RATIO = 1.5;
const TREND_CRITICAL_RATIO = 2.0;
const TREND_ABS_WARNING_MS = 500;
const TREND_ABS_CRITICAL_MS = 1000;
const TREND_NOISE_FLOOR_MS = 25;

function computeTrend(samples: number[]): TrendInfo {
  const n = samples.length;
  if (n < TREND_MIN_SAMPLES) {
    return { level: "normal", recent: 0, baseline: 0, ratio: 1 };
  }
  // Filter out any non-finite values that might have crept in
  const clean = samples.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (clean.length < TREND_MIN_SAMPLES) {
    return { level: "normal", recent: 0, baseline: 0, ratio: 1 };
  }
  const recentSlice = clean.slice(-TREND_RECENT_WINDOW);
  const baselineSlice = clean.slice(0, clean.length - TREND_RECENT_WINDOW);
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return quantile(s, 0.5);
  };
  const recent = median(recentSlice);
  const baseline = Math.max(median(baselineSlice), TREND_NOISE_FLOOR_MS);
  const ratio = recent / baseline;

  let level: TrendLevel = "normal";
  if (recent >= TREND_ABS_CRITICAL_MS || ratio >= TREND_CRITICAL_RATIO) {
    level = "critical";
  } else if (recent >= TREND_ABS_WARNING_MS || ratio >= TREND_WARNING_RATIO) {
    level = "warning";
  }
  return { level, recent, baseline, ratio };
}

function Sparkline({ samples, color }: { samples: number[]; color: string }) {
  const w = 56;
  const h = 16;
  if (samples.length < 2) {
    return (
      <svg width={w} height={h} className="opacity-60" aria-hidden="true">
        <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke="currentColor" strokeWidth={1} className={color} />
      </svg>
    );
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const stepX = w / (samples.length - 1);
  const points = samples
    .map((v, i) => {
      const x = i * stepX;
      const y = h - 1 - ((v - min) / range) * (h - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (samples.length - 1) * stepX;
  const lastY = h - 1 - ((samples[samples.length - 1] - min) / range) * (h - 2);
  return (
    <svg width={w} height={h} aria-hidden="true" className={color}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.5} fill="currentColor" />
    </svg>
  );
}

export function DataSourceBadge({
  source,
  latencyMs,
  className,
  samplesKey,
  sampleId,
}: DataSourceBadgeProps) {
  const isOlap = source === "clickhouse_olap";
  const effectiveKey = samplesKey ? `${samplesKey}::${source ?? "unknown"}` : undefined;
  const lastSampleIdRef = useRef<number | string | null>(null);

  useEffect(() => {
    if (!effectiveKey) return;
    if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) return;
    const id = sampleId ?? latencyMs;
    if (lastSampleIdRef.current === id) return;
    lastSampleIdRef.current = id;
    pushSample(effectiveKey, Math.max(0, latencyMs));
  }, [effectiveKey, latencyMs, sampleId]);

  const samples = useSamples(effectiveKey);

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      min: sorted[0],
      median: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      count: sorted.length,
    };
  }, [samples]);

  if (!source) return null;

  const Icon = isOlap ? Zap : Database;
  const label = isOlap ? "OLAP fast-path" : "PostgreSQL";
  const latencyText =
    typeof latencyMs === "number" && Number.isFinite(latencyMs)
      ? ` • ${Math.max(0, Math.round(latencyMs))}ms`
      : "";

  const colorClass = isOlap
    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
    : "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400";

  const baseSparkColor = isOlap
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-blue-600 dark:text-blue-400";
  const trend = useMemo(() => computeTrend(samples), [samples]);
  const sparkColor =
    trend.level === "critical"
      ? "text-red-600 dark:text-red-400"
      : trend.level === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : baseSparkColor;

  const latencyDetail =
    typeof latencyMs === "number" && Number.isFinite(latencyMs)
      ? ` Server-side latency for this request was ${Math.max(0, Math.round(latencyMs))}ms (excludes network round-trip).`
      : "";
  const baseTip = (isOlap
    ? "Served from ClickHouse — the OLAP store used for high-volume event search and aggregations. Falls back to PostgreSQL when ClickHouse is unreachable."
    : "Served from PostgreSQL — the primary OLTP store. ClickHouse fast-path is unavailable or this query isn't supported by the OLAP schema."
  ) + latencyDetail;

  const fmt = (n: number) => `${Math.max(0, Math.round(n))}ms`;

  return (
    <TooltipProvider delayDuration={150}>
      <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`inline-flex items-center gap-1 font-medium ${colorClass}`}
              data-testid={`badge-data-source-${isOlap ? "clickhouse" : "postgres"}`}
            >
              <Icon className="w-3 h-3" />
              <span className="text-[11px]">{label}{latencyText}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {baseTip}
          </TooltipContent>
        </Tooltip>
        {effectiveKey && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex items-center"
                data-testid={`sparkline-latency-${samplesKey}`}
                aria-label="Recent query latency sparkline"
              >
                <Sparkline samples={samples} color={sparkColor} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {stats ? (
                <div className="space-y-0.5">
                  <div className="font-medium flex items-center gap-1">
                    Recent latency ({stats.count} samples)
                    {trend.level !== "normal" && (
                      <ArrowUpRight
                        className={`w-3 h-3 ${
                          trend.level === "critical"
                            ? "text-red-600 dark:text-red-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                        data-testid={`indicator-trend-${trend.level}`}
                        aria-label={`Latency trending ${trend.level}`}
                      />
                    )}
                  </div>
                  <div>min: {fmt(stats.min)}</div>
                  <div>median: {fmt(stats.median)}</div>
                  <div>p95: {fmt(stats.p95)}</div>
                  {trend.level !== "normal" && (
                    <div
                      className={
                        trend.level === "critical"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      Trending up: recent {fmt(trend.recent)} vs baseline {fmt(trend.baseline)}
                      {trend.baseline > 0 && ` (${trend.ratio.toFixed(1)}×)`}
                    </div>
                  )}
                </div>
              ) : (
                <div>No latency samples yet</div>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
