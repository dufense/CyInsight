import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { TenantProvider } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";
import { Moon, Sun, Shield, ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleSwitcher } from "@/components/role-switcher";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import IncidentsPage from "@/pages/incidents";
import TicketsPage from "@/pages/tickets";
import ProjectsPage from "@/pages/projects";
import ServicesPage from "@/pages/services";
import ShiftRosterPage from "@/pages/shift-roster";
import ReportsPage from "@/pages/reports";
import ImportPage from "@/pages/import";
import KnowledgeBasePage from "@/pages/knowledge-base";
import AdminPortalPage from "@/pages/admin-portal";
import SecurityIntegrationsPage from "@/pages/security-integrations";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/incidents" component={IncidentsPage} />
      <Route path="/tickets" component={TicketsPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/shift-roster" component={ShiftRosterPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/integrations" component={SecurityIntegrationsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <TenantProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-2 px-4 h-12 border-b shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <RoleSwitcher />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <AuthenticatedRouter />
            </main>
          </div>
        </div>
      </SidebarProvider>
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
              <h1 className="text-sm font-semibold tracking-tight" data-testid="text-admin-portal-title">SecureOps Admin Portal</h1>
              <p className="text-[10px] text-muted-foreground">
                {isSuperAdmin ? "Logged in as superadmin" : `Logged in as ${user?.firstName || "admin"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" variant="outline" onClick={handleGoBack} data-testid="button-go-to-app">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              {isSuperAdmin ? "Go to Login" : "Go to SecureOps"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLogout} data-testid="button-admin-logout">
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <AdminPortalPage />
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

  const { data: superadminSession } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/superadmin/session"],
    queryFn: async () => {
      const res = await fetch("/api/superadmin/session", { credentials: "include" });
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
