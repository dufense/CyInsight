import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Check,
  Crown,
  ShieldCheck,
  Shield,
  UserCog,
  Wrench,
  Search,
  Headphones,
  User,
} from "lucide-react";

const ROLES = [
  {
    id: "platform_admin",
    label: "Platform Admin",
    description: "Full platform control",
    icon: Crown,
  },
  {
    id: "mss_admin",
    label: "MSS Admin",
    description: "MSSP & customer management",
    icon: ShieldCheck,
  },
  {
    id: "soc_manager",
    label: "SOC Manager",
    description: "Security operations oversight",
    icon: Shield,
  },
  {
    id: "mss_analyst",
    label: "MSS Analyst",
    description: "Operational access",
    icon: UserCog,
  },
  {
    id: "security_engineer",
    label: "Security Engineer",
    description: "Security operations",
    icon: Wrench,
  },
  {
    id: "security_analyst",
    label: "Security Analyst",
    description: "Security analysis",
    icon: Search,
  },
  {
    id: "service_desk",
    label: "Service Desk",
    description: "Ticket & project support",
    icon: Headphones,
  },
  {
    id: "customer",
    label: "Customer",
    description: "Dashboard & ticket access only",
    icon: User,
  },
];

export function RoleSwitcher() {
  const { userRole, isPlatformAdmin, canSwitchRoles, assignedRoles } = useTenant();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const switchRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await apiRequest("PUT", "/api/user/role", { role });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user/profile"], data);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "/api/user/profile" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/hierarchy"] });
      setOpen(false);
      const roleDef = ROLES.find((r) => r.id === data.role);
      toast({
        title: "Role switched",
        description: `Now viewing as ${roleDef?.label || data.role}`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to switch role",
        variant: "destructive",
      });
    },
  });

  const hasMultipleRoles = assignedRoles.length > 1;
  if (!hasMultipleRoles && !isPlatformAdmin && !canSwitchRoles) return null;

  const availableRoles = isPlatformAdmin || canSwitchRoles
    ? ROLES
    : ROLES.filter((r) => assignedRoles.includes(r.id));

  const currentRole = ROLES.find((r) => r.id === userRole);
  const CurrentIcon = currentRole?.icon || User;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-8 text-xs"
          data-testid="button-role-switcher"
        >
          <CurrentIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{currentRole?.label || userRole}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="menu-role-switcher">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Switch Role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoles.map((role) => {
          const Icon = role.icon;
          const isActive = userRole === role.id;
          return (
            <DropdownMenuItem
              key={role.id}
              onClick={() => {
                if (!isActive) switchRoleMutation.mutate(role.id);
              }}
              className="flex items-center gap-3 py-2.5 cursor-pointer"
              data-testid={`menu-item-role-${role.id}`}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{role.label}</div>
                <div className="text-[10px] text-muted-foreground">{role.description}</div>
              </div>
              {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
