import { useState, useEffect, lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { DashboardExportBar, useDashboardExportRef } from "@/components/ui/dashboard-export-bar";
import {
  Shield, ShieldCheck, Monitor,
  MapPin, Search, RefreshCw, Loader2, Target, Gauge, AlertTriangle,
  GitBranch, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const OverviewTab = lazy(() => import("@/pages/caasm/overview"));
const AssetExplorerTab = lazy(() => import("@/pages/caasm/asset-explorer"));
const LocationTab = lazy(() => import("@/pages/caasm/location"));
const OSLandscapeTab = lazy(() => import("@/pages/caasm/os-landscape"));
const AttackSurfaceTab = lazy(() => import("@/pages/caasm/attack-surface"));
const CoverageTab = lazy(() => import("@/pages/caasm/coverage"));
const MigrationInventoryTab = lazy(() => import("@/pages/caasm/migration-inventory"));
const DevicePostureTab = lazy(() => import("@/pages/caasm/device-posture"));
const AssetIntelligenceTab = lazy(() => import("@/pages/caasm/asset-intelligence"));
const CAASM_MODULES = [
  { id: "overview", label: "Cyber Asset Intelligence", icon: Gauge, description: "Real-time posture & threat surface analysis" },
  { id: "explorer", label: "Asset Explorer", icon: Search, description: "Full asset inventory & discovery" },
  { id: "device-posture", label: "Device Posture", icon: ShieldCheck, description: "Compliance & posture assessment" },
  { id: "attack", label: "Attack Surface", icon: Target, description: "Exposure analysis & blast radius" },
  { id: "location", label: "Location & Geo", icon: MapPin, description: "Regional asset distribution" },
  { id: "os", label: "OS Landscape", icon: Monitor, description: "OS versions & EOL tracking" },
  { id: "coverage", label: "Coverage", icon: ShieldCheck, description: "Security tool deployment coverage" },
  { id: "migration", label: "Migration", icon: GitBranch, description: "Migration strategy inventory" },
  { id: "intelligence", label: "Asset Intelligence", icon: BarChart2, description: "Reports, visualizations & warranty tracking" },
] as const;

type ModuleId = typeof CAASM_MODULES[number]["id"];

function SubmoduleLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

class ModuleErrorBoundary extends Component<
  { children: ReactNode; moduleName: string; onRetry?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; moduleName: string; onRetry?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`CAASM ${this.props.moduleName} error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="mx-auto max-w-md mt-12" data-testid="module-error-card">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Failed to load {this.props.moduleName}</h3>
              <p className="text-xs text-muted-foreground">
                This module encountered an error. Try reloading it.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onRetry?.();
                }}
                data-testid="button-retry-module"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Retry
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
                data-testid="button-reload-page"
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default function CAAMSPage() {
  const { currentTenant } = useTenant();
  const [location, navigate] = useLocation();
  const tenantId = currentTenant?.id;
  const qc = useQueryClient();
  const dashboardRef = useDashboardExportRef();

  const params = new URLSearchParams(window.location.search);
  const tabFromUrl = params.get("tab") as ModuleId | null;
  const resolvedTab = tabFromUrl === "app-mapping" ? "app-inventory" as ModuleId : tabFromUrl;
  const [activeModule, setActiveModule] = useState<ModuleId>(resolvedTab && CAASM_MODULES.some(m => m.id === resolvedTab) ? resolvedTab : "overview");

  useEffect(() => {
    const syncTab = () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as ModuleId | null;
      if (t && CAASM_MODULES.some(m => m.id === t)) {
        setActiveModule(t);
      }
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, [location]);

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Select a Tenant</h2>
          <p className="text-sm text-muted-foreground">Choose a tenant from the sidebar to view CAASM data.</p>
        </div>
      </div>
    );
  }

  const activeModuleConfig = CAASM_MODULES.find(m => m.id === activeModule)!;
  const ActiveIcon = activeModuleConfig.icon;

  return (
    <div className="h-full" data-testid="caasm-page">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <ActiveIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate" data-testid="text-caasm-title">
                {activeModuleConfig.label}
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {activeModuleConfig.description} — {currentTenant?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeModule !== "migration" && (
              <DashboardExportBar dashboardTitle={`CAASM - ${activeModuleConfig.label}`} containerRef={dashboardRef} />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["/api/asset-inventory", tenantId] })}
              data-testid="button-refresh-caasm"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6" ref={dashboardRef}>
        <ModuleErrorBoundary moduleName={activeModuleConfig.label} key={activeModule}>
          <Suspense fallback={<SubmoduleLoader />}>
            {activeModule === "overview" && <OverviewTab tenantId={tenantId} summary={null} onNavigate={(tab) => { setActiveModule(tab as ModuleId); window.history.replaceState({}, "", `/caasm?tab=${tab}`); }} />}
            {activeModule === "explorer" && <AssetExplorerTab tenantId={tenantId} />}
            {activeModule === "device-posture" && <DevicePostureTab tenantId={tenantId} />}
            {activeModule === "attack" && <AttackSurfaceTab tenantId={tenantId} />}
            {activeModule === "location" && <LocationTab tenantId={tenantId} />}
            {activeModule === "os" && <OSLandscapeTab tenantId={tenantId} />}
            {activeModule === "coverage" && <CoverageTab tenantId={tenantId} />}
            {activeModule === "migration" && <MigrationInventoryTab tenantId={tenantId} />}
            {activeModule === "intelligence" && <AssetIntelligenceTab />}
          </Suspense>
        </ModuleErrorBoundary>
      </div>
    </div>
  );
}
