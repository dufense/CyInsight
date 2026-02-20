import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { TenantProvider } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
              <ThemeToggle />
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

function AppContent() {
  const { user, isLoading } = useAuth();

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

  if (!user) {
    return <LandingPage />;
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
