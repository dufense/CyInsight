import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "none" | "blue" | "red" | "green" | "amber";
  onClick?: () => void;
}

const glowClasses = {
  none: "",
  blue: "shadow-[0_0_20px_rgba(59,130,246,0.15)] hover:shadow-[0_0_30px_rgba(59,130,246,0.25)]",
  red: "shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_30px_rgba(239,68,68,0.25)]",
  green: "shadow-[0_0_20px_rgba(34,197,94,0.15)] hover:shadow-[0_0_30px_rgba(34,197,94,0.25)]",
  amber: "shadow-[0_0_20px_rgba(234,179,8,0.15)] hover:shadow-[0_0_30px_rgba(234,179,8,0.25)]",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className, glow = "none", onClick }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          "rounded-xl border border-white/10 bg-white/5 backdrop-blur-md transition-all duration-300",
          "dark:border-white/10 dark:bg-white/5",
          "light:border-black/10 light:bg-black/5",
          glowClasses[glow],
          onClick && "cursor-pointer",
          className
        )}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
