import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Shield,
  Zap,
  HardDrive,
  Bot,
} from "lucide-react";

const NAV_TABS = [
  { label: "Dashboard", url: "/dashboard", icon: LayoutDashboard, matchPrefixes: ["/dashboard", "/"] },
  { label: "Incidents", url: "/events?domain=overview", icon: Shield, matchPrefixes: ["/events"] },
  { label: "Operations", url: "/operations", icon: Zap, matchPrefixes: ["/operations"] },
  { label: "CAASM", url: "/caasm", icon: HardDrive, matchPrefixes: ["/caasm"] },
  { label: "ARIA AI", url: "/ai-analyst", icon: Bot, matchPrefixes: ["/ai-analyst"] },
] as const;

export function MobileBottomNav() {
  const [location] = useLocation();

  function isActive(prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => {
      if (prefix === "/") return location === "/";
      const base = prefix.split("?")[0];
      return location === base || location.startsWith(base + "/") || location.startsWith(base + "?");
    });
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="mobile-bottom-nav"
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch h-14">
        {NAV_TABS.map((tab) => {
          const active = isActive(tab.matchPrefixes);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.url}
              href={tab.url}
              className="flex-1"
              data-testid={`mobile-nav-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div
                className={`flex flex-col items-center justify-center h-full gap-0.5 transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all ${active ? "bg-primary/12" : ""}`}>
                  <Icon className={`w-[18px] h-[18px] transition-transform ${active ? "scale-110" : ""}`} />
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
