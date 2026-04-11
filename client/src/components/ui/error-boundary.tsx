import { Component, type ReactNode, Suspense } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, RotateCcw, RefreshCw, Shield, LayoutDashboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: ReactNode;
  moduleName?: string;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = "ccc_chunk_reload_attempted";
// Auto-reload guard expires after 5 minutes so a genuine subsequent deploy
// can still trigger a fresh reload rather than showing the error boundary.
const CHUNK_RELOAD_TTL_MS = 5 * 60 * 1000;

function isChunkLoadError(error: Error): boolean {
  const msg = error.message ?? "";
  const name = error.name ?? "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("Unable to preload CSS")
  );
}

export class ModuleErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    if (isChunkLoadError(error)) {
      const stored = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      const lastAttempt = stored ? parseInt(stored, 10) : 0;
      const withinWindow = Date.now() - lastAttempt < CHUNK_RELOAD_TTL_MS;
      if (!withinWindow) {
        // Record timestamp so subsequent errors within 5 min don't loop
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        console.warn(`[${this.props.moduleName || 'Module'}] Stale chunk detected — reloading page to pick up new assets.`);
        window.location.reload();
        return;
      }
      // TTL guard still active — don't loop; show error UI instead
      console.error(`[${this.props.moduleName || 'Module'}] Chunk reload already attempted within the last 5 min — showing error UI.`);
    }
    console.error(`[${this.props.moduleName || 'Module'}] Error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  handleDashboard = () => {
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      const moduleName = this.props.moduleName;
      const isDev = import.meta.env.DEV;
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="module-error-boundary">
          <div className="text-center space-y-5 max-w-md w-full">
            <div className="mx-auto flex items-center justify-center w-14 h-14 rounded-full bg-muted">
              <Shield className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">
                {moduleName ? `${moduleName} is unavailable` : "This section is unavailable"}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {moduleName
                  ? `The ${moduleName} module encountered an unexpected error. Other parts of the platform are unaffected.`
                  : "This section encountered an unexpected error. You can retry or navigate elsewhere."}
              </p>
              {isDev && this.state.error && (
                <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-left">
                  <p className="text-xs font-mono text-destructive break-all">{this.state.error.message}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              <Button
                onClick={this.handleRetry}
                variant="default"
                size="sm"
                className="gap-2"
                data-testid="error-retry-btn"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </Button>
              <Button
                onClick={this.handleReload}
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="error-reload-btn"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload Page
              </Button>
              <Button
                onClick={this.handleDashboard}
                variant="ghost"
                size="sm"
                className="gap-2"
                data-testid="error-dashboard-btn"
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Go to Dashboard
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">
              If this keeps happening, please contact your system administrator.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function QueryErrorState({ moduleName, onRetry }: { moduleName: string; onRetry?: () => void }) {
  return (
    <Card className="m-4" data-testid={`error-state-${moduleName.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="font-semibold">Failed to load {moduleName}</h3>
          <p className="text-sm text-muted-foreground">Unable to fetch data. Please try again.</p>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="default" size="sm" className="gap-2" data-testid="query-error-retry">
            <RotateCcw className="w-4 h-4" /> Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyDataState({ moduleName, description }: { moduleName: string; description?: string }) {
  return (
    <Card className="m-4" data-testid={`empty-state-${moduleName.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-center space-y-1">
          <h3 className="font-semibold text-muted-foreground">No {moduleName} Data</h3>
          <p className="text-sm text-muted-foreground">{description || "No data is available for this tenant yet."}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" data-testid="route-loader">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading module…</p>
      </div>
    </div>
  );
}

export function RouteErrorBoundary({ children, moduleName }: { children: ReactNode; moduleName?: string }) {
  const [pathname] = useLocation();
  return (
    <ModuleErrorBoundary key={pathname} moduleName={moduleName}>
      <Suspense fallback={<RouteLoader />}>
        {children}
      </Suspense>
    </ModuleErrorBoundary>
  );
}

interface TabErrorState {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<ErrorBoundaryProps, TabErrorState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TabErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[TabError:${this.props.moduleName}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center" data-testid={`tab-error-${this.props.moduleName?.toLowerCase().replace(/\s+/g, "-")}`}>
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {this.props.moduleName ? `${this.props.moduleName} failed to load` : "This tab encountered an error"}
            </p>
            <p className="text-xs text-muted-foreground">Other tabs are still available.</p>
            {import.meta.env.DEV && this.state.error && (
              <p className="text-[10px] font-mono text-destructive/70 mt-1 max-w-sm">{this.state.error.message}</p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs h-7"
            onClick={() => this.setState({ hasError: false, error: null })}
            data-testid={`tab-error-retry-${this.props.moduleName?.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
