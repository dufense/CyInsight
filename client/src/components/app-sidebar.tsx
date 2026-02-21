import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Shield,
  AlertTriangle,
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

function getNavItems(role: string) {
  const items: { title: string; url: string; icon: any }[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  ];

  if (role === "platform_admin") {
    items.push({ title: "Admin Center", url: "/admin-center", icon: Settings });
  }

  const incidentRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  if (incidentRoles.includes(role)) {
    items.push({ title: "Incidents", url: "/incidents", icon: AlertTriangle });
  }

  const ticketRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk", "customer"];
  if (ticketRoles.includes(role)) {
    items.push({ title: "Tickets", url: "/tickets", icon: Ticket });
  }

  const projectRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "service_desk", "customer"];
  if (projectRoles.includes(role)) {
    items.push({ title: "Projects", url: "/projects", icon: FolderKanban });
  }

  items.push({ title: "Knowledge Base", url: "/knowledge-base", icon: BookOpen });

  const serviceRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "service_desk"];
  if (serviceRoles.includes(role)) {
    items.push({ title: "Services & SLA", url: "/services", icon: Briefcase });
  }

  const shiftRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst"];
  if (shiftRoles.includes(role)) {
    items.push({ title: "Shift Roster", url: "/shift-roster", icon: CalendarClock });
  }

  const mssRoles = ["platform_admin", "mss_admin", "soc_manager", "mss_analyst", "security_engineer", "security_analyst", "service_desk"];
  if (mssRoles.includes(role)) {
    items.push({ title: "Reports", url: "/reports", icon: FileText });
    items.push({ title: "Import Data", url: "/import", icon: Upload });
  }

  return items;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { tenants, hierarchy, currentTenant, setCurrentTenant, userRole, isPlatformAdmin } = useTenant();
  const { user, logout } = useAuth();

  const mssRoles = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
  const isMSS = mssRoles.includes(userRole);
  const navItems = getNavItems(userRole);

  const currentTenantType = currentTenant?.type || "customer";
  const isViewingMSSP = currentTenantType === "mssp";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">SecureOps</h2>
            <p className="text-[10px] text-muted-foreground">MSSP Platform</p>
          </div>
        </div>

        {isMSS && tenants.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 w-full rounded-md border border-sidebar-border px-3 py-2 text-xs"
                data-testid="dropdown-tenant-selector"
              >
                {isViewingMSSP ? (
                  <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 text-left truncate">
                  {currentTenant?.name || "Select Organization"}
                </span>
                <Badge variant={isViewingMSSP ? "default" : "outline"} className="text-[9px] px-1.5 py-0 shrink-0">
                  {isViewingMSSP ? "MSSP" : "Customer"}
                </Badge>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
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
          <div className="flex items-center gap-2 w-full rounded-md border border-sidebar-border px-3 py-2 text-xs">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="flex-1 text-left truncate">{currentTenant.name}</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">
            {isMSS ? (isViewingMSSP ? "MSSP Operations" : "Customer Operations") : "Overview"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isMSS && isViewingMSSP && hierarchy.length > 0 && (() => {
          const currentMSSP = hierarchy.find(h => h.id === currentTenant?.id);
          return currentMSSP && currentMSSP.children.length > 0;
        })() && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">
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

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user?.profileImageUrl || ""} />
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-md text-muted-foreground"
            data-testid="button-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
