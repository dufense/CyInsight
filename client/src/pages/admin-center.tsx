import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TenantUser, Tenant } from "@shared/schema";
import {
  Users,
  Plus,
  Search,
  Shield,
  Building2,
  UserPlus,
  Trash2,
  Edit,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer", description: "Dashboard & ticket access only" },
  { value: "security_engineer", label: "Security Engineer", description: "Full security operations access" },
  { value: "service_desk", label: "Service Desk", description: "Ticket and service management" },
  { value: "security_analyst", label: "Security Analyst", description: "Incident analysis and response" },
  { value: "soc_manager", label: "SOC Manager", description: "SOC operations & user management" },
  { value: "mss_analyst", label: "MSS Analyst", description: "Full MSS operations access" },
  { value: "mss_admin", label: "MSS Admin", description: "Full platform & user management" },
];

const ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-red-500/10 text-red-500",
  mss_admin: "bg-purple-500/10 text-purple-500",
  soc_manager: "bg-blue-500/10 text-blue-500",
  security_analyst: "bg-cyan-500/10 text-cyan-500",
  security_engineer: "bg-emerald-500/10 text-emerald-500",
  service_desk: "bg-amber-500/10 text-amber-500",
  mss_analyst: "bg-indigo-500/10 text-indigo-500",
  customer: "bg-muted text-muted-foreground",
};

function formatRole(role: string): string {
  return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function AdminCenterPage() {
  const { toast } = useToast();
  const { tenants, hierarchy, currentTenant, userRole, isPlatformAdmin } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserTenantId, setNewUserTenantId] = useState("");
  const [newUserRole, setNewUserRole] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editRole, setEditRole] = useState("");

  const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
  const isAdmin = adminRoles.includes(userRole);

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { userId: string; tenantId: number; role: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowAddUser(false);
      setNewUserId("");
      setNewUserTenantId("");
      setNewUserRole("");
      toast({ title: "User created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User removed successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove user", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">You need admin privileges to access the Admin Center.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.userId?.toLowerCase().includes(q) ||
           u.role?.toLowerCase().includes(q) ||
           allTenants.find(t => t.id === u.tenantId)?.name?.toLowerCase().includes(q);
  });

  const tenantMap = Object.fromEntries(allTenants.map(t => [t.id, t]));

  const roleCounts = users.reduce((acc: Record<string, number>, u: any) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-admin-center-title">Admin Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage users, roles, and access across your organization</p>
          </div>
          <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-user">
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>User ID (Replit username or ID)</Label>
                  <Input
                    placeholder="Enter user ID or email"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    data-testid="input-new-user-id"
                  />
                </div>
                <div>
                  <Label>Organization</Label>
                  <Select value={newUserTenantId} onValueChange={setNewUserTenantId}>
                    <SelectTrigger data-testid="select-new-user-tenant">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTenants.map(t => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          <div className="flex items-center gap-2">
                            {t.type === "mssp" ? <Shield className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                            {t.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={newUserRole} onValueChange={setNewUserRole}>
                    <SelectTrigger data-testid="select-new-user-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          <div>
                            <span className="font-medium">{r.label}</span>
                            <span className="text-muted-foreground ml-2 text-xs">- {r.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!newUserId || !newUserTenantId || !newUserRole) {
                      toast({ title: "Please fill all fields", variant: "destructive" });
                      return;
                    }
                    createUserMutation.mutate({
                      userId: newUserId,
                      tenantId: parseInt(newUserTenantId),
                      role: newUserRole,
                    });
                  }}
                  disabled={createUserMutation.isPending}
                  data-testid="button-submit-add-user"
                >
                  {createUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Add User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Users</span>
              </div>
              <p className="text-2xl font-bold mt-1" data-testid="text-total-users">{users.length}</p>
            </CardContent>
          </Card>
          {Object.entries(roleCounts).slice(0, 3).map(([role, count]) => (
            <Card key={role}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-[10px] ${ROLE_COLORS[role] || ""}`}>
                    {formatRole(role)}
                  </Badge>
                </div>
                <p className="text-2xl font-bold mt-1">{count as number}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users by ID, role, or organization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-users"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No users found</p>
                </CardContent>
              </Card>
            ) : (
              filteredUsers.map((u: any) => {
                const tenant = tenantMap[u.tenantId];
                return (
                  <Card key={u.id} data-testid={`card-user-${u.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 shrink-0">
                            <Users className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-user-id-${u.id}`}>{u.userId}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {tenant && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  {tenant.type === "mssp" ? <Shield className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                                  {tenant.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editingUser?.id === u.id ? (
                            <div className="flex items-center gap-2">
                              <Select value={editRole} onValueChange={setEditRole}>
                                <SelectTrigger className="h-8 w-44" data-testid={`select-edit-role-${u.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map(r => (
                                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                onClick={() => updateUserMutation.mutate({ id: u.id, data: { role: editRole } })}
                                disabled={updateUserMutation.isPending}
                                data-testid={`button-save-role-${u.id}`}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Badge className={`text-[10px] ${ROLE_COLORS[u.role] || ""}`} data-testid={`badge-role-${u.id}`}>
                                {formatRole(u.role)}
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => { setEditingUser(u); setEditRole(u.role); }}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive"
                                    data-testid={`button-delete-user-${u.id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove User</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove this user from the organization? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteUserMutation.mutate(u.id)}>
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
