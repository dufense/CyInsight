import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Shield,
  Ticket,
  FolderKanban,
  FileText,
  Upload,
  ChevronDown,
  Building2,
  LogOut,
  Users,
  ChevronRight,
  Briefcase,
  CalendarClock,
  BookOpen,
  Settings,
  Plug,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Database,
  Brain,
  Wrench,
  FileQuestion,
  HardDrive,
  Activity,
  Monitor,
  Mail,
  Globe,
  AppWindow,
  Cloud,
  Cpu,
  Network,
  Skull,
  Bug,
  Bot,
  MapPin,
  Target,
  Gauge,
  Search,
  Trophy,
  Sparkles,
  Radar,
  Crosshair,
  Workflow,
  BarChart3,
  GraduationCap,
  HeadphonesIcon,
  Keyboard,
  Swords,
  Share2,
  Code2,
  AlertTriangle,
  Wand2,
  BookMarked,
  Rss,
  Layers,
  Server,
  FlaskConical,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

interface SeverityEntry { name: string; value: number }
interface DashboardStats {
  criticalIncidents: number;
  openIncidents: number;
  severityBreakdown: SeverityEntry[];
}

const caasmTabs = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "explorer", label: "Asset Explorer", icon: Search },
  { id: "device-posture", label: "Device Posture", icon: ShieldCheck },
  { id: "attack", label: "Attack Surface", icon: Target },
  { id: "location", label: "Location & Geo", icon: MapPin },
  { id: "os", label: "OS Landscape", icon: Monitor },
  { id: "coverage", label: "Coverage", icon: ShieldCheck },
];

const commandCenterTabs = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "endpoint", label: "Endpoint Security", icon: Monitor },
  { id: "email", label: "Email Security", icon: Mail },
  { id: "web", label: "Web Security", icon: Globe },
  { id: "webapp", label: "Web App Security", icon: AppWindow },
  { id: "cloud_security", label: "Cloud Security", icon: Cloud },
  { id: "ai_security", label: "AI Security", icon: Cpu },
  { id: "data_security", label: "Data Security", icon: Lock },
  { id: "network", label: "Network Security", icon: Network },
  { id: "threat_intel", label: "Threat Intelligence", icon: Skull },
  { id: "vulnerability", label: "Vulnerability", icon: Bug },
];

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

function getNavGroups(role: string): NavGroup[] {
  const groups: NavGroup[] = [];

  // ── SOC Operations ── (no Operations Center, no Federated Intel — both moved)
  const socRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  const socItems: NavItem[] = [];
  if (socRoles.includes(role)) {
    socItems.push({ title: "SOC Alert Console", url: "/events", icon: Database });
    socItems.push({ title: "Incidents", url: "/incidents", icon: AlertTriangle, badge: "New" });
    socItems.push({ title: "Alert Triage", url: "/alert-triage", icon: Sparkles, badge: "AI" });
    socItems.push({ title: "Zero Trust Posture", url: "/zero-trust", icon: ShieldCheck });
    socItems.push({ title: "Attack Path Prediction", url: "/attack-paths", icon: Network, badge: "AI" });
    socItems.push({ title: "Malware Analysis", url: "/malware-analysis", icon: Bug, badge: "AI" });
    socItems.push({ title: "Breach & Attack Simulation", url: "/bas", icon: Swords, badge: "BAS" });
    socItems.push({ title: "CVE Risk Intelligence", url: "/cve-risk", icon: Bug, badge: "AI" });
    socItems.push({ title: "Exploitation Risk", url: "/vulnerability-risk", icon: ShieldAlert, badge: "New" });
    socItems.push({ title: "Detection Engineering", url: "/detection-engineering", icon: Code2, badge: "AI" });
    socItems.push({ title: "AI Detection Studio", url: "/detection-studio", icon: Wand2, badge: "New" });
    socItems.push({ title: "Playbooks", url: "/playbooks", icon: Shield });
  }
  if (socItems.length > 0) {
    groups.push({ label: "SOC Operations", icon: Crosshair, items: socItems });
  }

  // ── Cyber Intelligence (NEW) ─ 12 items ────────────────────────────────────
  const ctiRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  const ctiItems: NavItem[] = [];
  if (ctiRoles.includes(role)) {
    ctiItems.push({ title: "Intel Overview", url: "/cyber-intel", icon: Shield, badge: "New" });
    ctiItems.push({ title: "Threat Actors", url: "/threat-actors", icon: Users });
    ctiItems.push({ title: "Intrusion Sets", url: "/intrusion-sets", icon: Network });
    ctiItems.push({ title: "Campaigns", url: "/cti-campaigns", icon: Crosshair });
    ctiItems.push({ title: "Malware Families", url: "/malware-families", icon: Bug });
    ctiItems.push({ title: "IOC Indicators", url: "/threat-intel", icon: Radar, badge: "IOC" });
    ctiItems.push({ title: "STIX Observables", url: "/stix-observables", icon: BarChart3, badge: "STIX" });
    ctiItems.push({ title: "TAXII Feeds", url: "/taxii-feeds", icon: Rss, badge: "Live" });
    ctiItems.push({ title: "Attack Patterns", url: "/mitre-coverage", icon: Target });
    ctiItems.push({ title: "Global Threat Map", url: "/threat-map", icon: Globe });
    ctiItems.push({ title: "Predictive Engine", url: "/cyber-llm", icon: Brain, badge: "LLM" });
    ctiItems.push({ title: "Federated Intel", url: "/federated-intel", icon: Share2 });
    ctiItems.push({ title: "Intel Reports", url: "/intel-reports", icon: FileText });
  }
  if (ctiItems.length > 0) {
    groups.push({ label: "Cyber Intelligence", icon: BookMarked, items: ctiItems });
  }

  // ── Log Intelligence ──
  const logIntelRoles = ["platform_admin", "mss_admin", "mss_analyst", "soc_manager", "security_analyst", "security_engineer"];
  const logIntelItems: NavItem[] = [];
  const logInvestigationRoles = ["platform_admin", "mss_admin", "mss_analyst"];
  if (logIntelRoles.includes(role)) {
    logIntelItems.push({ title: "Log Explorer", url: "/log-intelligence/explorer", icon: Search });
    if (logInvestigationRoles.includes(role)) {
      logIntelItems.push({ title: "Log Investigation", url: "/log-investigation", icon: FlaskConical, badge: "New" });
    }
    logIntelItems.push({ title: "Source Management", url: "/log-intelligence/sources", icon: Server });
    logIntelItems.push({ title: "Detection Feed", url: "/log-intelligence/detections", icon: Layers, badge: "Live" });
    logIntelItems.push({ title: "AI Training & Feedback", url: "/log-intelligence/training", icon: Brain, badge: "AI" });
  }
  if (logIntelItems.length > 0) {
    groups.push({ label: "Log Intelligence", icon: Database, items: logIntelItems });
  }

  // ── AI & Intelligence ── (Behavior Analytics only — threat intel moved to CTI group)
  const aiRoles = ["platform_admin", "mss_admin", "mss_analyst", "soc_manager", "tenant_admin", "security_analyst", "security_engineer"];
  const aiItems: NavItem[] = [];
  if (aiRoles.includes(role)) {
    aiItems.push({ title: "AI SOC Analyst", url: "/ai-analyst", icon: Brain });
    aiItems.push({ title: "AI Workforce", url: "/ai-workforce", icon: Bot });
    aiItems.push({ title: "Behavior Analytics", url: "/behavior-analytics", icon: Activity });
  }
  if (aiItems.length > 0) {
    groups.push({ label: "AI & Intelligence", icon: Workflow, items: aiItems });
  }

  // ── Service Management ── (Operations Center at top for all relevant roles; Projects removed)
  const serviceItems: NavItem[] = [];
  const opsRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk", "customer"];
  if (opsRoles.includes(role)) {
    serviceItems.push({ title: "Operations Center", url: "/operations", icon: Zap });
  }
  const svcRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "service_desk"];
  if (svcRoles.includes(role)) {
    serviceItems.push({ title: "Services & SLA", url: "/services", icon: Briefcase });
  }
  const shiftRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  if (shiftRoles.includes(role)) {
    serviceItems.push({ title: "Shift Roster", url: "/shift-roster", icon: CalendarClock });
  }
  if (serviceItems.length > 0) {
    groups.push({ label: "Service Management", icon: HeadphonesIcon, items: serviceItems });
  }

  const govItems: NavItem[] = [];
  const riskRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  if (riskRoles.includes(role)) {
    govItems.push({ title: "Compliance", url: "/compliance-frameworks", icon: ShieldCheck });
  }
  const mssRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk"];
  if (mssRoles.includes(role)) {
    govItems.push({ title: "Reports", url: "/reports", icon: FileText });
  }
  govItems.push({ title: "Knowledge Base", url: "/knowledge-base", icon: BookOpen });
  govItems.push({ title: "Security Challenges", url: "/security-challenges", icon: Trophy });
  if (govItems.length > 0) {
    groups.push({ label: "Governance", icon: GraduationCap, items: govItems });
  }

  return groups;
}

function getAdminItems(role: string) {
  const items: NavItem[] = [];

  const integrationRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer"];
  if (integrationRoles.includes(role)) {
    items.push({ title: "Integrations", url: "/integrations", icon: Plug });
    items.push({ title: "Vendor Hub", url: "/vendor-hub", icon: HardDrive });
    items.push({ title: "Data Ingestion", url: "/ingestion", icon: BarChart3 });
  }

  const importRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk"];
  if (importRoles.includes(role)) {
    items.push({ title: "Import Data", url: "/import", icon: Upload });
  }

  const docRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk", "customer"];
  if (docRoles.includes(role)) {
    items.push({ title: "Documentation", url: "/documentation", icon: FileQuestion });
  }

  items.push({ title: "What's New", url: "/whats-new", icon: Sparkles });

  const orgRoles = ["platform_admin", "mss_admin"];
  if (orgRoles.includes(role)) {
    items.push({ title: "My Organization", url: "/admin/my-org", icon: Building2 });
  }

  const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
  if (adminRoles.includes(role)) {
    items.push({ title: "Admin Portal", url: "/admin", icon: Settings });
  }

  return items;
}

function CollapsibleNavGroup({
  group,
  location,
}: {
  group: NavGroup;
  location: string;
}) {
  const isAnyActive = group.items.some((item) => location === item.url || location.startsWith(item.url + "/"));
  const [open, setOpen] = useState(isAnyActive);
  const GroupIcon = group.icon;

  useEffect(() => {
    if (isAnyActive) {
      setOpen(true);
    }
  }, [isAnyActive]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setOpen(!open)}
        className={`cursor-pointer group/nav-group sidebar-nav-hover ${isAnyActive ? "sidebar-nav-active" : ""}`}
        data-active={isAnyActive}
        data-testid={`nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <GroupIcon className="w-4 h-4" />
        <span className="flex-1">{group.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const isActive = location === item.url || location.startsWith(item.url + "/");
            return (
              <SidebarMenuSubItem key={item.url}>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  isActive={isActive}
                  className={`cursor-pointer sidebar-nav-hover ${isActive ? "sidebar-nav-active" : ""}`}
                  data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Link href={item.url}>
                    <ItemIcon className="w-3.5 h-3.5" />
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge className="ml-auto text-[8px] px-1 py-0 h-4 bg-cyan-500/20 text-cyan-400 border-cyan-500/30 border font-semibold">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const { tenants, hierarchy, currentTenant, setCurrentTenant, userRole, isPlatformAdmin } = useTenant();
  const { user, logout } = useAuth();

  const { data: dashStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard", currentTenant?.id, "all"],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/${currentTenant!.id}?timeRange=all`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!currentTenant?.id,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 120000,
  });

  const threatStrip = (() => {
    const critical = dashStats?.criticalIncidents ?? 0;
    const highEntry = dashStats?.severityBreakdown?.find((s) => s.name === "high");
    const high = highEntry?.value ?? 0;
    if (critical > 0) return {
      gradient: "linear-gradient(90deg, transparent 0%, hsl(0 84% 50% / 0.70) 35%, hsl(0 84% 50% / 0.55) 65%, transparent 100%)",
      glow: "0 -1px 10px hsl(0 84% 50% / 0.30)",
    };
    if (high > 0) return {
      gradient: "linear-gradient(90deg, transparent 0%, hsl(38 95% 55% / 0.70) 35%, hsl(38 95% 55% / 0.55) 65%, transparent 100%)",
      glow: "0 -1px 10px hsl(38 95% 55% / 0.25)",
    };
    return {
      gradient: "linear-gradient(90deg, transparent 0%, hsl(142 76% 45% / 0.60) 35%, hsl(var(--cyber) / 0.40) 65%, transparent 100%)",
      glow: "0 -1px 8px hsl(142 76% 45% / 0.20)",
    };
  })();

  const [adminOpen, setAdminOpen] = useState(true);
  const [cccOpen, setCccOpen] = useState(true);
  const [caasmOpen, setCaasmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [caasmActiveTab, setCaasmActiveTab] = useState("overview");
  const mssRoles = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
  const isMSS = mssRoles.includes(userRole);
  const navGroups = getNavGroups(userRole);
  const adminItems = getAdminItems(userRole);
  const caasmRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  const showCaasm = caasmRoles.includes(userRole);

  const currentTenantType = currentTenant?.type || "customer";
  const isViewingMSSP = currentTenantType === "mssp";

  const isDashboard = location === "/dashboard" || location === "/";
  const isCaasm = location === "/caasm";

  useEffect(() => {
    if (isDashboard) {
      const sp = new URLSearchParams(window.location.search);
      setActiveTab(sp.get("tab") || "overview");
    }
  }, [isDashboard, location]);

  useEffect(() => {
    if (isCaasm) {
      setCaasmOpen(true);
      const sp = new URLSearchParams(window.location.search);
      setCaasmActiveTab(sp.get("tab") || "overview");
    }
  }, [isCaasm, location]);

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
    if (isDashboard) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tabId);
      window.history.pushState({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      navigate("/dashboard");
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tabId);
        window.history.replaceState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, 0);
    }
  }, [navigate, isDashboard]);

  const handleCaasmTabClick = useCallback((tabId: string) => {
    setCaasmActiveTab(tabId);
    if (isCaasm) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tabId);
      window.history.pushState({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      navigate("/caasm");
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tabId);
        window.history.replaceState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, 0);
    }
  }, [navigate, isCaasm]);

  const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
    platform_admin: { label: "PLATFORM ADMIN", color: "text-violet-400", bg: "bg-violet-500/15 border-violet-500/25" },
    mss_admin:      { label: "MSS ADMIN",      color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/25" },
    mss_analyst:    { label: "MSS ANALYST",    color: "text-cyan-400",   bg: "bg-cyan-500/15 border-cyan-500/25" },
    soc_manager:    { label: "SOC MANAGER",    color: "text-indigo-400", bg: "bg-indigo-500/15 border-indigo-500/25" },
    security_analyst:  { label: "SEC ANALYST", color: "text-teal-400",  bg: "bg-teal-500/15 border-teal-500/25" },
    security_engineer: { label: "SEC ENGINEER",color: "text-sky-400",   bg: "bg-sky-500/15 border-sky-500/25" },
    customer:       { label: "CUSTOMER",       color: "text-slate-400",  bg: "bg-slate-500/15 border-slate-500/25" },
    service_desk:   { label: "SERVICE DESK",   color: "text-green-400",  bg: "bg-green-500/15 border-green-500/25" },
  };
  const currentRoleCfg = roleConfig[userRole] ?? { label: userRole?.toUpperCase() ?? "USER", color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/25" };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-4 pb-3">
        {/* Header top: logo + title + LIVE badge */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md" style={{ boxShadow: "0 0 14px hsl(217 91% 58% / 0.30)" }}>
            <Shield className="w-[18px] h-[18px] text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-sidebar animate-pulse" style={{ animationDuration: "3s" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight leading-none truncate">Cyber Command Center</h2>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 shrink-0">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "2s" }} />
                <span className="text-[9px] font-bold text-emerald-400 tracking-widest uppercase">LIVE</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">MSSP Platform</p>
          </div>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            title="Command Palette (⌘K)"
            onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
            data-testid="sidebar-button-command-palette"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Accent divider */}
        <div className="h-px mb-3 rounded-full" style={{ background: "linear-gradient(90deg, hsl(217 91% 58% / 0.35) 0%, hsl(var(--cyber) / 0.25) 50%, transparent 100%)" }} />

        {/* Current tenant name with brand-color left accent bar */}
        {currentTenant && (
          <div
            className="flex items-center gap-2 mb-2 pl-3 pr-2 py-1.5 rounded-md bg-sidebar-accent/25"
            style={{ borderLeft: `3px solid ${currentTenant.brandColor ?? "#3b82f6"}`, boxShadow: `inset 0 0 12px 0 ${(currentTenant.brandColor ?? "#3b82f6")}18` }}
            data-testid="sidebar-tenant-accent-bar"
          >
            <span className="text-[11px] font-semibold truncate leading-none" style={{ color: currentTenant.brandColor ?? "#3b82f6" }}>
              {currentTenant.name}
            </span>
            <Badge variant="outline" className="ml-auto text-[8px] px-1 py-0 shrink-0 border-sidebar-border">
              {currentTenant.type === "mssp" ? "MSSP" : "Customer"}
            </Badge>
          </div>
        )}

        {isMSS && tenants.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs transition-colors glass-card-cyber"
                data-testid="dropdown-tenant-selector"
              >
                {isViewingMSSP ? (
                  <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 text-left truncate font-medium">
                  {currentTenant?.name || "Select Organization"}
                </span>
                <Badge variant={isViewingMSSP ? "default" : "outline"} className="text-[9px] px-1.5 py-0 shrink-0">
                  {isViewingMSSP ? "MSSP" : "Customer"}
                </Badge>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 glass-card-cyber border-0 p-1">
              {hierarchy.map((mssp) => (
                <div key={mssp.id}>
                  <DropdownMenuLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground py-1">
                    <Shield className="w-3 h-3" />
                    {mssp.name}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setCurrentTenant(mssp)}
                    className="pl-4"
                    data-testid={`menu-tenant-${mssp.slug}`}
                  >
                    <Shield className="w-3.5 h-3.5 mr-2 text-primary" />
                    <span>{mssp.name}</span>
                    <Badge variant="default" className="ml-auto text-[9px] px-1.5 py-0">MSSP</Badge>
                    {mssp.id === currentTenant?.id && (
                      <ChevronRight className="w-3 h-3 ml-1 text-primary" />
                    )}
                  </DropdownMenuItem>
                  {mssp.children && mssp.children.length > 0 && (
                    <>
                      {mssp.children.map((child) => (
                        <DropdownMenuItem
                          key={child.id}
                          onClick={() => setCurrentTenant(child)}
                          className="pl-8"
                          data-testid={`menu-tenant-${child.slug}`}
                        >
                          <Building2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          <span className="truncate">{child.name}</span>
                          {child.id === currentTenant?.id && (
                            <ChevronRight className="w-3 h-3 ml-auto text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!isMSS && currentTenant && (
          <div className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs glass-card-cyber">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="flex-1 text-left truncate font-medium">{currentTenant.name}</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--sidebar-border))_transparent]">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-semibold sidebar-group-label-accent">
            {isMSS ? (isViewingMSSP ? "MSSP Operations" : "Customer Operations") : "Overview"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setCccOpen(!cccOpen)}
                  data-active={isDashboard}
                  className={`cursor-pointer sidebar-nav-hover ${isDashboard ? "sidebar-nav-active" : ""}`}
                  data-testid="nav-cyber-command-center"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="flex-1">Cyber Command Center</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${cccOpen ? "" : "-rotate-90"}`} />
                </SidebarMenuButton>
                {cccOpen && (
                  <SidebarMenuSub>
                    {commandCenterTabs.map((tab) => {
                      const TabIcon = tab.icon;
                      const isTabActive = isDashboard && activeTab === tab.id;
                      return (
                        <SidebarMenuSubItem key={tab.id}>
                          <SidebarMenuSubButton
                            size="sm"
                            isActive={isTabActive}
                            onClick={() => handleTabClick(tab.id)}
                            className={`cursor-pointer sidebar-nav-hover ${isTabActive ? "sidebar-nav-active" : ""}`}
                            data-testid={`sidebar-tab-${tab.id}`}
                          >
                            <TabIcon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              {showCaasm && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setCaasmOpen(!caasmOpen)}
                    data-active={isCaasm}
                    className={`cursor-pointer sidebar-nav-hover ${isCaasm ? "sidebar-nav-active" : ""}`}
                    data-testid="nav-caasm"
                  >
                    <HardDrive className="w-4 h-4" />
                    <span className="flex-1">CAASM</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${caasmOpen ? "" : "-rotate-90"}`} />
                  </SidebarMenuButton>
                  {caasmOpen && (
                    <SidebarMenuSub>
                      {caasmTabs.map((tab) => {
                        const TabIcon = tab.icon;
                        const isTabActive = isCaasm && caasmActiveTab === tab.id;
                        return (
                          <SidebarMenuSubItem key={tab.id}>
                            <SidebarMenuSubButton
                              size="sm"
                              isActive={isTabActive}
                              onClick={() => handleCaasmTabClick(tab.id)}
                              className={`cursor-pointer sidebar-nav-hover ${isTabActive ? "sidebar-nav-active" : ""}`}
                              data-testid={`sidebar-caasm-${tab.id}`}
                            >
                              <TabIcon className="w-3.5 h-3.5" />
                              <span>{tab.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}

              {navGroups.map((group) => (
                <CollapsibleNavGroup
                  key={group.label}
                  group={group}
                  location={location}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel
              className="text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none flex items-center justify-between sidebar-group-label-accent"
              onClick={() => setAdminOpen(!adminOpen)}
              data-testid="nav-administration-toggle"
            >
              <span className="flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                Administration
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${adminOpen ? "" : "-rotate-90"}`} />
            </SidebarGroupLabel>
            {adminOpen && (
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={location === item.url || (item.url === "/admin" && location.startsWith("/admin"))}
                        className={`sidebar-nav-hover ${(location === item.url || (item.url === "/admin" && location.startsWith("/admin"))) ? "sidebar-nav-active" : ""}`}
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}

        {isMSS && isViewingMSSP && hierarchy.length > 0 && (() => {
          const currentMSSP = hierarchy.find(h => h.id === currentTenant?.id);
          return currentMSSP && currentMSSP.children.length > 0;
        })() && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-semibold sidebar-group-label-accent">
              <Users className="w-3 h-3 mr-1 inline" />
              Customers ({hierarchy.find(h => h.id === currentTenant?.id)?.children.length || 0})
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(hierarchy.find(h => h.id === currentTenant?.id)?.children || []).map((child) => (
                  <SidebarMenuItem key={child.id}>
                    <SidebarMenuButton
                      onClick={() => setCurrentTenant(child)}
                      data-testid={`sidebar-customer-${child.slug}`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span className="truncate">{child.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-0 border-t border-sidebar-border">
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            <Avatar className="w-9 h-9 ring-2 ring-primary/25 shrink-0" style={{ boxShadow: "0 0 10px hsl(217 91% 58% / 0.15)" }}>
              <AvatarImage src={user?.profileImageUrl || ""} />
              <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-primary/25 to-primary/10 text-primary">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate leading-none">
                {user?.firstName} {user?.lastName}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-widest border ${currentRoleCfg.bg} ${currentRoleCfg.color}`}
                  data-testid="badge-user-role"
                >
                  {currentRoleCfg.label}
                </span>
              </div>
            </div>
            <Link href="/account/security">
              <button
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors shrink-0"
                title="Account Security & MFA"
                data-testid="button-account-security"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            </Link>
            <button
              onClick={() => logout()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors shrink-0"
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Threat level ambient strip — dynamic color reflects open incidents */}
        <div
          className="h-[3px] w-full transition-all duration-700"
          style={{
            background: threatStrip.gradient,
            boxShadow: threatStrip.glow,
          }}
          data-testid="sidebar-threat-strip"
        />
      </SidebarFooter>
    </Sidebar>
  );
}
