import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Shield,
  AlertTriangle,
  Ticket,
  FolderKanban,
  FileText,
  Settings,
  ChevronDown,
  Building2,
  LogOut,
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
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/hooks/use-auth";

const mssNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Incidents", url: "/incidents", icon: AlertTriangle },
  { title: "Tickets", url: "/tickets", icon: Ticket },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Reports", url: "/reports", icon: FileText },
];

const customerNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Tickets", url: "/tickets", icon: Ticket },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { tenants, currentTenant, setCurrentTenant, userRole } = useTenant();
  const { user, logout } = useAuth();

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";
  const navItems = isMSS ? mssNavItems : customerNavItems;

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
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="flex-1 text-left truncate">
                  {currentTenant?.name || "Select Tenant"}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenants.map((tenant) => (
                <DropdownMenuItem
                  key={tenant.id}
                  onClick={() => setCurrentTenant(tenant)}
                  data-testid={`menu-tenant-${tenant.slug}`}
                >
                  <Building2 className="w-3.5 h-3.5 mr-2" />
                  <span>{tenant.name}</span>
                  {tenant.id === currentTenant?.id && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">Active</Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">
            {isMSS ? "Operations" : "Overview"}
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
