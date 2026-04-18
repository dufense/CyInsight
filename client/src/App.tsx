import { useState, useEffect, useCallback, useRef, Component, lazy, Suspense } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Switch, Route, useLocation, useRoute, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme, ACCENT_COLORS } from "@/components/theme-provider";
import { TenantProvider, useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";
import { Moon, Sun, Shield, ArrowLeft, LogOut, Loader2, Palette, Keyboard, WifiOff, ServerCrash } from "lucide-react";
import { GlobalSearchWithTrigger } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleSwitcher } from "@/components/role-switcher";
import { RouteErrorBoundary } from "@/components/ui/error-boundary";
import { DashboardFilterProvider } from "@/components/dashboard/DashboardFilterContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationCenter } from "@/components/notification-center";
import { TourLauncher } from "@/components/guided-tour";
import { AriaCopilot } from "@/components/aria-copilot";
import { CommandPalette, addRecentItem } from "@/components/command-palette";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { PWAInstallBanner, PWAUpdateNotification } from "@/components/pwa-install-banner";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";

const DashboardPage = lazy(() => import("@/pages/dashboard"));
const IncidentsRedirect = lazy(() => import("@/pages/incidents"));
const TicketsPage = lazy(() => import("@/pages/tickets"));
const ProjectsPage = lazy(() => import("@/pages/projects"));
const ServicesPage = lazy(() => import("@/pages/services"));
const ShiftRosterPage = lazy(() => import("@/pages/shift-roster"));
const SecurityChallengesPage = lazy(() => import("@/pages/security-challenges"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const ImportPage = lazy(() => import("@/pages/import"));
const KnowledgeBasePage = lazy(() => import("@/pages/knowledge-base"));
const AdminPortalPage = lazy(() => import("@/pages/admin-portal"));
const SecurityIntegrationsPage = lazy(() => import("@/pages/security-integrations"));
const AssetDetailPage = lazy(() => import("@/pages/asset-detail"));
const UserDetailPage = lazy(() => import("@/pages/user-detail"));
const EntityProfilePage = lazy(() => import("@/pages/entity-profile"));
const ProjectDetailPage = lazy(() => import("@/pages/project-detail"));

const ComplianceFrameworksPage = lazy(() => import("@/pages/compliance-frameworks"));
const IngestionDashboardPage = lazy(() => import("@/pages/ingestion-dashboard"));
const EventsPage = lazy(() => import("@/pages/events"));
const AIAnalystPage = lazy(() => import("@/pages/ai-analyst"));
const AIAnalystDetailPage = lazy(() => import("@/pages/ai-analyst-detail"));
const DocumentationPage = lazy(() => import("@/pages/documentation"));
const IncidentActionPage = lazy(() => import("@/pages/incident-action"));
const AssetInventoryPage = lazy(() => import("@/pages/asset-inventory"));
const AIWorkforcePage = lazy(() => import("@/pages/ai-workforce"));
const CAAMSPage = lazy(() => import("@/pages/caasm"));
const VendorHubPage = lazy(() => import("@/pages/vendor-hub"));
const BehaviorAnalyticsPage = lazy(() => import("@/pages/behavior-analytics"));
const MyOrganizationPage = lazy(() => import("@/pages/my-organization"));
const AccountSecurityPage = lazy(() => import("@/pages/account-security"));
const WhatsNewPage = lazy(() => import("@/pages/whats-new"));
const CasesPage = lazy(() => import("@/pages/cases"));
const PlaybooksPage = lazy(() => import("@/pages/playbooks"));
const BASPage = lazy(() => import("@/pages/bas"));
const CVERiskPage = lazy(() => import("@/pages/cve-risk"));
const VulnerabilityRiskPage = lazy(() => import("@/pages/vulnerability-risk"));
const FederatedIntelPage = lazy(() => import("@/pages/federated-intel"));
const DetectionEngineeringPage = lazy(() => import("@/pages/detection-engineering"));
const DetectionStudioPage = lazy(() => import("@/pages/detection-studio"));
const ThreatIntelPage = lazy(() => import("@/pages/threat-intel"));
const OperationsPage = lazy(() => import("@/pages/operations"));
const ThreatMapPage = lazy(() => import("@/pages/threat-map"));
const MitreCoveragePage = lazy(() => import("@/pages/mitre-coverage"));
const IncidentCanvasPage = lazy(() => import("@/pages/incident-canvas"));
const AlertTriagePage = lazy(() => import("@/pages/alert-triage"));
const ZeroTrustPage = lazy(() => import("@/pages/zero-trust"));
const IncidentWarRoomPage = lazy(() => import("@/pages/incident-war-room"));
const MalwareAnalysisPage = lazy(() => import("@/pages/malware-analysis"));
const AttackPathsPage = lazy(() => import("@/pages/attack-paths"));
const CyberLLMPage = lazy(() => import("@/pages/cyber-llm"));

const LogExplorerPage = lazy(() => import("@/pages/log-explorer"));
const LogInvestigationPage = lazy(() => import("@/pages/log-investigation"));
const LogSourceManagementPage = lazy(() => import("@/pages/log-source-management"));
const DetectionFeedPage = lazy(() => import("@/pages/detection-feed"));
const AITrainingFeedbackPage = lazy(() => import("@/pages/ai-training-feedback"));

const CyberIntelPage = lazy(() => import("@/pages/cyber-intel"));
const ThreatActorsPage = lazy(() => import("@/pages/threat-actors"));
const IntrusionSetsPage = lazy(() => import("@/pages/intrusion-sets"));
const CtiCampaignsPage = lazy(() => import("@/pages/cti-campaigns"));
const MalwareFamiliesPage = lazy(() => import("@/pages/malware-families"));
const StixObservablesPage = lazy(() => import("@/pages/stix-observables"));
const IntelReportsPage = lazy(() => import("@/pages/intel-reports"));
const TaxiiFeedsPage = lazy(() => import("@/pages/taxii-feeds"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]" data-testid="page-loader">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidMount() {
    sessionStorage.removeItem("_err_reload");
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }
  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }
  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const msg = String(event.reason?.message || event.reason || "");
    const isChunkError = msg.includes("dynamically imported module") || msg.includes("Failed to fetch") || msg.includes("Loading chunk") || msg.includes("ChunkLoadError");
    const reloadCount = parseInt(sessionStorage.getItem("_err_reload") || "0", 10);
    if (isChunkError && reloadCount < 2) {
      event.preventDefault();
      sessionStorage.setItem("_err_reload", String(reloadCount + 1));
      window.location.reload();
    }
  };
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error boundary:", error, info);
    const isDynamicImportError = error.message?.includes("dynamically imported module") || error.message?.includes("Failed to fetch") || error.message?.includes("Loading chunk") || error.name === "ChunkLoadError";
    const reloadCount = parseInt(sessionStorage.getItem("_err_reload") || "0", 10);
    if (isDynamicImportError && reloadCount < 2) {
      sessionStorage.setItem("_err_reload", String(reloadCount + 1));
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center space-y-5 max-w-lg p-10">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-muted">
              <Shield className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">This page can't be displayed</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The page you're trying to access is temporarily unavailable. This is usually caused by a recent platform update. Please reload the page to continue.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }} data-testid="button-reload">
                Reload Page
              </Button>
              <Button variant="outline" onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/dashboard"; }} data-testid="button-go-dashboard">
                Go to Dashboard
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">If the issue persists, please contact your system administrator.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function AccentColorPicker() {
  const { accentColor, setAccentColor } = useTheme();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-accent-color">
          <Palette className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="end">
        <p className="text-xs font-medium mb-2">Accent Color</p>
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => setAccentColor(c.name)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${accentColor === c.name ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
              style={{ backgroundColor: `hsl(${c.value})` }}
              title={c.label}
              data-testid={`accent-color-${c.name}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function HeaderNotifications() {
  const { currentTenant } = useTenant();
  if (!currentTenant?.id) return null;
  return <NotificationCenter tenantId={currentTenant.id} />;
}

function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-200"
      data-testid="offline-banner"
      role="status"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>You are offline. Showing cached data — live features unavailable.</span>
    </div>
  );
}

function ServiceUnavailableBanner() {
  const [show503, setShow503] = useState(false);
  const [retryIn, setRetryIn] = useState(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ retryAfter?: number }>).detail;
      setShow503(true);
      setRetryIn(detail?.retryAfter ?? 15);
    };
    window.addEventListener("ccc:service-unavailable", handler);
    return () => window.removeEventListener("ccc:service-unavailable", handler);
  }, []);

  useEffect(() => {
    if (!show503 || retryIn <= 0) return;
    const t = setInterval(() => {
      setRetryIn((n) => {
        if (n <= 1) { setShow503(false); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [show503, retryIn]);

  if (!show503) return null;
  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive"
      data-testid="service-unavailable-banner"
      role="alert"
    >
      <ServerCrash className="w-3.5 h-3.5 shrink-0" />
      <span>Server is temporarily unavailable. Retrying in {retryIn}s…</span>
    </div>
  );
}

function AuthenticatedRouter() {
  const [pathname] = useLocation();

  useEffect(() => {
    sessionStorage.removeItem("_err_reload");
  }, [pathname]);

  return (
    <Switch>
      <Route path="/">{() => <DashboardFilterProvider><RouteErrorBoundary moduleName="Dashboard"><DashboardPage /></RouteErrorBoundary></DashboardFilterProvider>}</Route>
      <Route path="/dashboard">{() => <DashboardFilterProvider><RouteErrorBoundary moduleName="Dashboard"><DashboardPage /></RouteErrorBoundary></DashboardFilterProvider>}</Route>
      <Route path="/incidents">{() => <RouteErrorBoundary moduleName="Incidents"><IncidentsRedirect /></RouteErrorBoundary>}</Route>
      <Route path="/events">{() => <RouteErrorBoundary moduleName="Events"><EventsPage /></RouteErrorBoundary>}</Route>
      <Route path="/operations">{() => <RouteErrorBoundary moduleName="Operations"><OperationsPage /></RouteErrorBoundary>}</Route>
      <Route path="/tickets"><Redirect to="/operations?tab=tickets" /></Route>
      <Route path="/projects/:id">{() => <RouteErrorBoundary moduleName="Project Detail"><ProjectDetailPage /></RouteErrorBoundary>}</Route>
      <Route path="/projects">{() => <RouteErrorBoundary moduleName="Projects"><ProjectsPage /></RouteErrorBoundary>}</Route>
      <Route path="/services">{() => <RouteErrorBoundary moduleName="Services"><ServicesPage /></RouteErrorBoundary>}</Route>
      <Route path="/shift-roster">{() => <RouteErrorBoundary moduleName="Shift Roster"><ShiftRosterPage /></RouteErrorBoundary>}</Route>
      <Route path="/security-challenges">{() => <RouteErrorBoundary moduleName="Security Challenges"><SecurityChallengesPage /></RouteErrorBoundary>}</Route>
      <Route path="/reports">{() => <RouteErrorBoundary moduleName="Reports"><ReportsPage /></RouteErrorBoundary>}</Route>
      <Route path="/knowledge-base">{() => <RouteErrorBoundary moduleName="Knowledge Base"><KnowledgeBasePage /></RouteErrorBoundary>}</Route>
      <Route path="/import">{() => <RouteErrorBoundary moduleName="Import"><ImportPage /></RouteErrorBoundary>}</Route>
      <Route path="/integrations">{() => <RouteErrorBoundary moduleName="Security Integrations"><SecurityIntegrationsPage /></RouteErrorBoundary>}</Route>
      <Route path="/ingestion">{() => <RouteErrorBoundary moduleName="Ingestion Dashboard"><IngestionDashboardPage /></RouteErrorBoundary>}</Route>
      <Route path="/ai-analyst/:id">{(params) => <RouteErrorBoundary moduleName="AI Investigation"><AIAnalystDetailPage params={params} /></RouteErrorBoundary>}</Route>
      <Route path="/ai-analyst">{() => <RouteErrorBoundary moduleName="AI Analyst"><AIAnalystPage /></RouteErrorBoundary>}</Route>
      <Route path="/ai-workforce">{() => <RouteErrorBoundary moduleName="AI Workforce"><AIWorkforcePage /></RouteErrorBoundary>}</Route>
      <Route path="/behavior-analytics">{() => <RouteErrorBoundary moduleName="Behavior Analytics"><BehaviorAnalyticsPage /></RouteErrorBoundary>}</Route>
      <Route path="/caasm">{() => <RouteErrorBoundary moduleName="CAASM"><CAAMSPage /></RouteErrorBoundary>}</Route>
      <Route path="/vendor-hub">{() => <RouteErrorBoundary moduleName="Vendor Hub"><VendorHubPage /></RouteErrorBoundary>}</Route>
      <Route path="/asset-inventory">{() => <RouteErrorBoundary moduleName="Asset Inventory"><AssetInventoryPage /></RouteErrorBoundary>}</Route>
      <Route path="/compliance-frameworks">{() => <RouteErrorBoundary moduleName="Compliance Frameworks"><ComplianceFrameworksPage /></RouteErrorBoundary>}</Route>
      <Route path="/assets/:tenantId/:assetName">{() => <RouteErrorBoundary moduleName="Asset Detail"><AssetDetailPage /></RouteErrorBoundary>}</Route>
      <Route path="/users/:tenantId/:userName">{() => <RouteErrorBoundary moduleName="User Detail"><UserDetailPage /></RouteErrorBoundary>}</Route>
      <Route path="/entity-profile/:tenantId/:entityType/:entityName">{() => <RouteErrorBoundary moduleName="Entity Profile"><EntityProfilePage /></RouteErrorBoundary>}</Route>
      <Route path="/cases"><Redirect to="/operations?tab=cases" /></Route>
      <Route path="/documentation">{() => <RouteErrorBoundary moduleName="Documentation"><DocumentationPage /></RouteErrorBoundary>}</Route>
      <Route path="/whats-new">{() => <RouteErrorBoundary moduleName="What's New"><WhatsNewPage /></RouteErrorBoundary>}</Route>
      <Route path="/threat-intel">{() => <RouteErrorBoundary moduleName="Threat Intelligence"><ThreatIntelPage /></RouteErrorBoundary>}</Route>
      <Route path="/playbooks">{() => <RouteErrorBoundary moduleName="Playbooks"><PlaybooksPage /></RouteErrorBoundary>}</Route>
      <Route path="/bas">{() => <RouteErrorBoundary moduleName="BAS"><BASPage /></RouteErrorBoundary>}</Route>
      <Route path="/cve-risk">{() => <RouteErrorBoundary moduleName="CVE Risk"><CVERiskPage /></RouteErrorBoundary>}</Route>
      <Route path="/vulnerability-risk">{() => <RouteErrorBoundary moduleName="Vulnerability Risk"><VulnerabilityRiskPage /></RouteErrorBoundary>}</Route>
      <Route path="/federated-intel">{() => <RouteErrorBoundary moduleName="Federated Intel"><FederatedIntelPage /></RouteErrorBoundary>}</Route>
      <Route path="/detection-engineering">{() => <RouteErrorBoundary moduleName="Detection Engineering"><DetectionEngineeringPage /></RouteErrorBoundary>}</Route>
      <Route path="/detection-studio">{() => <RouteErrorBoundary moduleName="Detection Studio"><DetectionStudioPage /></RouteErrorBoundary>}</Route>
      <Route path="/threat-map">{() => <RouteErrorBoundary moduleName="Threat Map"><ThreatMapPage /></RouteErrorBoundary>}</Route>
      <Route path="/mitre-coverage">{() => <RouteErrorBoundary moduleName="MITRE Coverage"><MitreCoveragePage /></RouteErrorBoundary>}</Route>
      <Route path="/alert-triage">{() => <RouteErrorBoundary moduleName="Alert Triage"><AlertTriagePage /></RouteErrorBoundary>}</Route>
      <Route path="/zero-trust">{() => <RouteErrorBoundary moduleName="Zero Trust"><ZeroTrustPage /></RouteErrorBoundary>}</Route>
      <Route path="/attack-paths">{() => <RouteErrorBoundary moduleName="Attack Paths"><AttackPathsPage /></RouteErrorBoundary>}</Route>
      <Route path="/cyber-llm">{() => <RouteErrorBoundary moduleName="Cyber Predictive Engine"><CyberLLMPage /></RouteErrorBoundary>}</Route>
      <Route path="/predictive-attack">{() => <RouteErrorBoundary moduleName="Predictive Attack Engine"><CyberLLMPage /></RouteErrorBoundary>}</Route>
      <Route path="/malware-analysis">{() => <RouteErrorBoundary moduleName="Malware Analysis"><MalwareAnalysisPage /></RouteErrorBoundary>}</Route>
      <Route path="/cyber-intel">{() => <RouteErrorBoundary moduleName="Cyber Intelligence Hub"><CyberIntelPage /></RouteErrorBoundary>}</Route>
      <Route path="/threat-actors">{() => <RouteErrorBoundary moduleName="Threat Actors"><ThreatActorsPage /></RouteErrorBoundary>}</Route>
      <Route path="/intrusion-sets">{() => <RouteErrorBoundary moduleName="Intrusion Sets"><IntrusionSetsPage /></RouteErrorBoundary>}</Route>
      <Route path="/cti-campaigns">{() => <RouteErrorBoundary moduleName="CTI Campaigns"><CtiCampaignsPage /></RouteErrorBoundary>}</Route>
      <Route path="/malware-families">{() => <RouteErrorBoundary moduleName="Malware Families"><MalwareFamiliesPage /></RouteErrorBoundary>}</Route>
      <Route path="/stix-observables">{() => <RouteErrorBoundary moduleName="STIX Observables"><StixObservablesPage /></RouteErrorBoundary>}</Route>
      <Route path="/taxii-feeds">{() => <RouteErrorBoundary moduleName="TAXII Feeds"><TaxiiFeedsPage /></RouteErrorBoundary>}</Route>
      <Route path="/intel-reports">{() => <RouteErrorBoundary moduleName="Intel Reports"><IntelReportsPage /></RouteErrorBoundary>}</Route>
      <Route path="/log-intelligence/explorer">{() => <RouteErrorBoundary moduleName="Log Explorer"><LogExplorerPage /></RouteErrorBoundary>}</Route>
      <Route path="/log-investigation">{() => <RouteErrorBoundary moduleName="Log Investigation"><LogInvestigationPage /></RouteErrorBoundary>}</Route>
      <Route path="/log-intelligence/sources">{() => <RouteErrorBoundary moduleName="Source Management"><LogSourceManagementPage /></RouteErrorBoundary>}</Route>
      <Route path="/log-intelligence/detections">{() => <RouteErrorBoundary moduleName="Detection Feed"><DetectionFeedPage /></RouteErrorBoundary>}</Route>
      <Route path="/log-intelligence/training">{() => <RouteErrorBoundary moduleName="AI Training"><AITrainingFeedbackPage /></RouteErrorBoundary>}</Route>
      <Route path="/incident-war-room/:id">{() => <RouteErrorBoundary moduleName="Incident War Room"><IncidentWarRoomPage /></RouteErrorBoundary>}</Route>
      <Route path="/incidents/:id/canvas">{() => <RouteErrorBoundary moduleName="Incident Canvas"><IncidentCanvasPage /></RouteErrorBoundary>}</Route>
      <Route path="/admin/my-org">{() => <RouteErrorBoundary moduleName="My Organization"><MyOrganizationPage /></RouteErrorBoundary>}</Route>
      <Route path="/account/security">{() => <RouteErrorBoundary moduleName="Account Security"><AccountSecurityPage /></RouteErrorBoundary>}</Route>
      <Route>{() => <RouteErrorBoundary moduleName="Page Not Found"><NotFound /></RouteErrorBoundary>}</Route>
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };
  const { toggleTheme } = useTheme();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentPath, navigate] = useLocation();
  const gKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const openFromSidebar = () => setCmdOpen(true);
    window.addEventListener("open-command-palette", openFromSidebar);
    return () => window.removeEventListener("open-command-palette", openFromSidebar);
  }, []);

  useEffect(() => {
    const incidentMatch = currentPath.match(/[?&]incidentId=(\d+)/);
    const ticketMatch = currentPath.match(/[?&]ticketId=(\d+)/);
    const assetMatch = currentPath.match(/\/asset-detail\/([^/?]+)/);
    if (incidentMatch) {
      addRecentItem({ type: "incident", id: incidentMatch[1], label: `Incident #${incidentMatch[1]}`, url: currentPath });
    } else if (ticketMatch) {
      addRecentItem({ type: "ticket", id: ticketMatch[1], label: `Ticket #${ticketMatch[1]}`, url: currentPath });
    } else if (assetMatch) {
      addRecentItem({ type: "asset", id: assetMatch[1], label: assetMatch[1], url: currentPath });
    }
  }, [currentPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(prev => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        const trigger = document.querySelector('[data-testid="button-sidebar-toggle"]') as HTMLButtonElement;
        trigger?.click();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector('[data-testid="input-global-search"]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      if (isInput) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.key === "g" || e.key === "G") {
        gKeyRef.current = Date.now();
        return;
      }
      if (gKeyRef.current && Date.now() - gKeyRef.current < 1500) {
        const map: Record<string, string> = { d: "/dashboard", D: "/dashboard", i: "/events?domain=overview", I: "/events?domain=overview", e: "/events", E: "/events", c: "/caasm", C: "/caasm" };
        if (map[e.key]) { e.preventDefault(); navigate(map[e.key]); gKeyRef.current = null; }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <TenantProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <PWAInstallBanner />
            <PWAUpdateNotification />
            <OfflineBanner />
            <ServiceUnavailableBanner />
            <header className="flex items-center justify-between gap-2 px-4 h-12 border-b shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <GlobalSearchWithTrigger />
              <div className="flex items-center gap-1">
                <RoleSwitcher />
                <HeaderNotifications />
                <TourLauncher />
                <AccentColorPicker />
                <ThemeToggle />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setCmdOpen(true)}
                  title="Command Palette (⌘K)"
                  data-testid="button-command-palette"
                >
                  <Keyboard className="w-4 h-4" />
                </Button>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
              <AuthenticatedRouter />
            </main>
          </div>
        </div>
        <MobileBottomNav />
      </SidebarProvider>
      <AriaCopilot />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onToggleTheme={toggleTheme}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </TenantProvider>
  );
}

function AdminPortalLayout({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  const handleGoBack = () => {
    if (isSuperAdmin) {
      navigate("/");
    } else {
      navigate("/dashboard");
    }
  };

  const handleLogout = async () => {
    if (isSuperAdmin) {
      await fetch("/api/superadmin/logout", { method: "POST", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/session"] });
      navigate("/");
    } else {
      logout();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight" data-testid="text-admin-portal-title">Cyber Command Center Admin</h1>
              <p className="text-[10px] text-muted-foreground">
                {isSuperAdmin ? "Logged in as superadmin" : `Logged in as ${user?.firstName || "admin"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" variant="outline" onClick={handleGoBack} data-testid="button-go-to-app">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              {isSuperAdmin ? "Go to Login" : "Go to Dashboard"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLogout} data-testid="button-admin-logout">
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <AdminPortalPage />
        </Suspense>
      </main>
    </div>
  );
}

function AdminPortalGuard() {
  const { data: profile, isLoading } = useQuery<{ role: string }>({
    queryKey: ["/api/user/profile"],
  });
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="w-12 h-12 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
  if (!profile || !adminRoles.includes(profile.role)) {
    navigate("/dashboard");
    return null;
  }

  return <AdminPortalLayout />;
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const [isIncidentAction] = useRoute("/incident-action/:token");

  const { data: superadminSession } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/superadmin/session"],
    queryFn: async () => {
      const res = await fetch("/api/superadmin/session", { credentials: "include" });
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  if (isIncidentAction) {
    return (
      <Suspense fallback={<PageLoader />}>
        <IncidentActionPage />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="w-12 h-12 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (superadminSession?.authenticated) {
    return <AdminPortalLayout isSuperAdmin />;
  }

  if (!user) {
    return <LandingPage />;
  }

  if (location === "/admin") {
    return <AdminPortalGuard />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <AppContent />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
