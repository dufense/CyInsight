import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: string | number;
  accent?: boolean;
  cyber?: boolean;
}

interface PageHeroProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  description: string;
  stats?: StatItem[];
  actions?: React.ReactNode;
  badge?: string;
  className?: string;
  cyberAccent?: boolean;
}

export function PageHero({
  icon: Icon,
  iconColor = "text-primary",
  title,
  description,
  stats = [],
  actions,
  badge,
  className,
  cyberAccent = false,
}: PageHeroProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl mb-6 page-hero-bg",
        cyberAccent && "page-hero-cyber",
        className
      )}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: cyberAccent
            ? "linear-gradient(90deg, transparent 0%, hsl(var(--cyber) / 0.6) 40%, hsl(217 91% 58% / 0.4) 60%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, hsl(217 91% 58% / 0.5) 40%, hsl(217 91% 58% / 0.3) 60%, transparent 100%)",
        }}
      />

      {/* Grid texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,transparent,transparent 40px,hsl(var(--primary)) 40px,hsl(var(--primary)) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,hsl(var(--primary)) 40px,hsl(var(--primary)) 41px)",
        }}
      />

      {/* Hex-grid texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none animate-hex-drift"
        style={{
          opacity: 0.032,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104'%3E%3Cpath d='M30 2L58 17v30L30 62 2 47V17z' fill='none' stroke='%2300d4ff' stroke-width='0.8'/%3E%3Cpath d='M30 62L58 77v25L30 116 2 101V77z' fill='none' stroke='%2300d4ff' stroke-width='0.8'/%3E%3Cpath d='M-30 2L-2 17v30L-30 62l-28-15V17z' fill='none' stroke='%2300d4ff' stroke-width='0.8'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 104px",
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none animate-cyber-scan"
        style={{
          opacity: 0.025,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.4) 3px, rgba(255,255,255,0.4) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Primary blue glow — top right */}
      <div
        className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.10) 0%, transparent 70%)",
          transform: "translate(30%, -30%)",
        }}
      />

      {/* Cyber teal glow — also top right, tighter, alongside primary */}
      <div
        className="absolute top-0 right-0 w-[280px] h-[280px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--cyber) / 0.07) 0%, transparent 70%)",
          transform: "translate(10%, -10%)",
        }}
      />

      {/* Sweep shimmer on mount using sweep-gradient keyframe */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        <div
          className="absolute inset-y-0 w-[180px] animate-sweep-gradient"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.025) 35%, rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.025) 65%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative z-10 px-5 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
              style={{
                background: cyberAccent
                  ? "linear-gradient(135deg, hsl(var(--cyber) / 0.15), hsl(var(--cyber) / 0.05))"
                  : "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))",
                border: cyberAccent
                  ? "1px solid hsl(var(--cyber) / 0.25)"
                  : "1px solid hsl(var(--primary) / 0.20)",
                boxShadow: cyberAccent
                  ? "0 0 20px hsl(var(--cyber) / 0.20)"
                  : "0 0 20px hsl(var(--primary) / 0.15)",
              }}
            >
              <Icon className={cn("w-5 h-5", iconColor)} />
            </div>
            <div className="min-w-0">
              {badge && (
                <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1"
                  style={{ color: cyberAccent ? "hsl(var(--cyber) / 0.85)" : "hsl(var(--primary) / 0.75)" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      background: cyberAccent ? "hsl(var(--cyber))" : "hsl(var(--primary))",
                      animationDuration: "2s",
                    }}
                  />
                  {badge}
                </div>
              )}
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground leading-tight">
                {title}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">
                {description}
              </p>
            </div>
          </div>

          {actions && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {actions}
            </div>
          )}
        </div>

        {stats.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40 dark:border-white/5 flex-wrap">
            {stats.map((stat, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    stat.cyber
                      ? "text-cyber"
                      : stat.accent
                      ? "text-primary"
                      : "text-foreground"
                  )}
                >
                  {stat.value}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {stat.label}
                </span>
                {i < stats.length - 1 && (
                  <span className="text-border dark:text-white/10 ml-2">·</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
