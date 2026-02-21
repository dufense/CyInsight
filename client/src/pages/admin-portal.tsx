import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Tenant, TenantUser, License } from "@shared/schema";
import {
  Building2, Users, Shield, KeyRound, Globe, Plus, Search,
  Edit2, Trash2, ChevronRight, Activity, Calendar, AlertTriangle,
  UserPlus, Check, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface EnrichedTenantUser extends TenantUser {
  tenantName: string;
  tenantType: string;
}

interface EnrichedLicense extends License {
  tenantName: string;
}

interface PlatformStats {
  totalTenants: number;
  totalMSSPs: number;
  totalCustomers: number;
  totalUsers: number;
  totalLicenses: number;
  activeLicenses: number;
}

const ROLE_OPTIONS = [
  { value: "platform_admin", label: "Platform Admin", description: "Full platform control" },
  { value: "mss_admin", label: "MSS Admin", description: "Full platform & user management" },
  { value: "soc_manager", label: "SOC Manager", description: "SOC operations management" },
  { value: "mss_analyst", label: "MSS Analyst", description: "Full MSS operations" },
  { value: "security_engineer", label: "Security Engineer", description: "Security operations" },
  { value: "security_analyst", label: "Security Analyst", description: "Incident analysis" },
  { value: "service_desk", label: "Service Desk", description: "Ticket management" },
  { value: "customer", label: "Customer", description: "Dashboard & tickets" },
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

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function OverviewTab() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/tenant-admin/stats"],
  });
  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const mssps = allTenants.filter(t => t.type === "mssp");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Tenants", value: stats?.totalTenants || 0, icon: Globe, color: "text-primary" },
          { label: "MSSP Organizations", value: stats?.totalMSSPs || 0, icon: Shield, color: "text-chart-1" },
          { label: "Customer Tenants", value: stats?.totalCustomers || 0, icon: Building2, color: "text-chart-2" },
          { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-chart-3" },
          { label: "Total Licenses", value: stats?.totalLicenses || 0, icon: KeyRound, color: "text-chart-4" },
          { label: "Active Licenses", value: stats?.activeLicenses || 0, icon: Activity, color: "text-chart-5" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">MSSP Hierarchy</CardTitle>
        </CardHeader>
        <CardContent>
          {mssps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No MSSPs configured</p>
          ) : (
            <div className="space-y-3">
              {mssps.map(mssp => {
                const children = allTenants.filter(t => t.parentId === mssp.id);
                return (
                  <div key={mssp.id} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{mssp.name}</span>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">MSSP</Badge>
                      {mssp.industry && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{mssp.industry}</Badge>
                      )}
                      <Badge variant={mssp.isActive ? "outline" : "destructive"} className="text-[9px] px-1.5 py-0 ml-auto">
                        {mssp.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {children.length > 0 ? (
                      <div className="ml-6 space-y-1.5">
                        {children.map(child => (
                          <div key={child.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 border-l-2 border-muted pl-3">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="font-medium text-foreground">{child.name}</span>
                            {child.industry && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">{child.industry}</Badge>
                            )}
                            <Badge variant={child.isActive ? "outline" : "destructive"} className="text-[9px] px-1 py-0 ml-auto">
                              {child.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground ml-6">No customer tenants</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TenantsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [formType, setFormType] = useState<"mssp" | "customer">("mssp");
  const [parentId, setParentId] = useState<string>("");

  const { data: allTenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const mssps = allTenants.filter(t => t.type === "mssp");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tenant-admin/tenants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      setDialogOpen(false);
      toast({ title: "Tenant created" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/tenant-admin/tenants/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenants"] });
      setEditTenant(null);
      setDialogOpen(false);
      toast({ title: "Tenant updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tenant-admin/tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      toast({ title: "Tenant deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (editTenant) {
      updateMutation.mutate({
        id: editTenant.id,
        data: {
          name,
          slug,
          industry: fd.get("industry") || null,
          contactEmail: fd.get("contactEmail") || null,
          isActive: fd.get("isActive") === "true",
        },
      });
    } else {
      createMutation.mutate({
        name,
        slug,
        type: formType,
        parentId: formType === "customer" && parentId ? parseInt(parentId) : null,
        industry: fd.get("industry") || null,
        contactEmail: fd.get("contactEmail") || null,
      });
    }
  };

  const filtered = search
    ? allTenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.industry?.toLowerCase().includes(search.toLowerCase()))
    : allTenants;

  const getUserCount = (tenantId: number) => {
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-tenants-title">Tenants</h2>
          <p className="text-sm text-muted-foreground">{allTenants.length} tenants registered</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64"
              data-testid="input-search-tenants"
            />
          </div>
          <Button size="sm" onClick={() => { setEditTenant(null); setFormType("mssp"); setParentId(""); setDialogOpen(true); }} data-testid="button-add-tenant">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Tenant
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No tenants found</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-medium">Name</TableHead>
                <TableHead className="font-medium">Type</TableHead>
                <TableHead className="font-medium">Industry</TableHead>
                <TableHead className="font-medium">Parent</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Created</TableHead>
                <TableHead className="font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const parent = t.parentId ? allTenants.find(p => p.id === t.parentId) : null;
                return (
                  <TableRow key={t.id} className="hover:bg-muted/30" data-testid={`row-tenant-${t.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.type === "mssp" ? (
                          <Shield className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-sm">{t.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.type === "mssp" ? "default" : "secondary"} className="text-[10px]">
                        {t.type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.industry ? (
                        <Badge variant="outline" className="text-[10px] font-normal">{t.industry}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{parent?.name || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.isActive ? "outline" : "destructive"} className="text-[10px]">
                        {t.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {t.createdAt ? formatDate(t.createdAt) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          onClick={() => { setEditTenant(t); setDialogOpen(true); }}
                          data-testid={`button-edit-tenant-${t.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-7 h-7 text-destructive hover:text-destructive"
                              data-testid={`button-delete-tenant-${t.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{t.name}"? This action cannot be undone and will remove all associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(t.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTenant ? "Edit Tenant" : "Add Tenant"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" defaultValue={editTenant?.name || ""} required data-testid="input-tenant-name" />
            </div>
            {!editTenant && (
              <>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={(v: "mssp" | "customer") => setFormType(v)}>
                    <SelectTrigger data-testid="select-tenant-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mssp">MSSP</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formType === "customer" && (
                  <div className="space-y-2">
                    <Label>Parent MSSP</Label>
                    <Select value={parentId} onValueChange={setParentId}>
                      <SelectTrigger data-testid="select-parent-mssp"><SelectValue placeholder="Select MSSP" /></SelectTrigger>
                      <SelectContent>
                        {mssps.map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input name="industry" defaultValue={editTenant?.industry || ""} data-testid="input-tenant-industry" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input name="contactEmail" type="email" defaultValue={editTenant?.contactEmail || ""} data-testid="input-tenant-email" />
            </div>
            {editTenant && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="isActive" defaultValue={editTenant.isActive ? "true" : "false"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-tenant">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {editTenant ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserTenantId, setNewUserTenantId] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);

  const { data: tenantUsers = [], isLoading: usersLoading } = useQuery<EnrichedTenantUser[]>({
    queryKey: ["/api/tenant-admin/tenant-users"],
  });

  const { data: adminUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const allUsers = tenantUsers.length > 0 ? tenantUsers : adminUsers.map(u => ({
    ...u,
    tenantName: allTenants.find(t => t.id === u.tenantId)?.name || "Unknown",
    tenantType: allTenants.find(t => t.id === u.tenantId)?.type || "customer",
  }));

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      try {
        const res = await apiRequest("POST", "/api/tenant-admin/tenant-users", data);
        return res.json();
      } catch {
        const res = await apiRequest("POST", "/api/admin/users", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      setDialogOpen(false);
      setNewUserId("");
      setNewUserTenantId("");
      setNewUserRoles([]);
      toast({ title: "User added successfully" });
    },
    onError: (e: any) => toast({ title: "Failed to add user", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      try {
        const res = await apiRequest("PATCH", `/api/tenant-admin/tenant-users/${id}`, data);
        return res.json();
      } catch {
        const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "User updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        await apiRequest("DELETE", `/api/tenant-admin/tenant-users/${id}`);
      } catch {
        await apiRequest("DELETE", `/api/admin/users/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      toast({ title: "User removed" });
    },
    onError: (e: any) => toast({ title: "Failed to remove user", description: e.message, variant: "destructive" }),
  });

  const filtered = search
    ? allUsers.filter((u: any) =>
        u.userId?.toLowerCase().includes(search.toLowerCase()) ||
        u.tenantName?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase())
      )
    : allUsers;

  const roleCounts = allUsers.reduce((acc: Record<string, number>, u: any) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-users-title">Users</h2>
          <p className="text-sm text-muted-foreground">{allUsers.length} users registered</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64"
              data-testid="input-search-users"
            />
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-user">
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Add User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Users</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-users">{allUsers.length}</p>
          </CardContent>
        </Card>
        {Object.entries(roleCounts).slice(0, 3).map(([role, count]) => (
          <Card key={role}>
            <CardContent className="pt-4 pb-3 px-4">
              <Badge variant="secondary" className={`text-[10px] ${ROLE_COLORS[role] || ""}`}>
                {formatRole(role)}
              </Badge>
              <p className="text-2xl font-bold mt-1">{count as number}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {usersLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No users found</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-medium">User ID</TableHead>
                <TableHead className="font-medium">Organization</TableHead>
                <TableHead className="font-medium">Roles</TableHead>
                <TableHead className="font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u: any) => (
                <TableRow key={u.id} className="hover:bg-muted/30" data-testid={`row-user-${u.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                        <Users className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium text-sm" data-testid={`text-user-id-${u.id}`}>{u.userId}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      {u.tenantType === "mssp" ? <Shield className="w-3 h-3 text-primary" /> : <Building2 className="w-3 h-3 text-muted-foreground" />}
                      <span>{u.tenantName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingUser?.id === u.id ? (
                      <div className="flex flex-col gap-2 w-72">
                        <div className="grid grid-cols-1 gap-1 border rounded-md p-2 max-h-40 overflow-y-auto" data-testid={`select-edit-roles-${u.id}`}>
                          {ROLE_OPTIONS.map(r => {
                            const selected = editRoles.includes(r.value);
                            return (
                              <button
                                key={r.value}
                                type="button"
                                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted"}`}
                                onClick={() => {
                                  setEditRoles(prev =>
                                    prev.includes(r.value) ? prev.filter(x => x !== r.value) : [...prev, r.value]
                                  );
                                }}
                              >
                                <div className={`flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                                  {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                </div>
                                <span className="font-medium">{r.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (editRoles.length === 0) {
                                toast({ title: "Select at least one role", variant: "destructive" });
                                return;
                              }
                              updateMutation.mutate({
                                id: u.id,
                                data: { role: editRoles[0], assignedRoles: editRoles },
                              });
                            }}
                            disabled={updateMutation.isPending}
                            data-testid={`button-save-role-${u.id}`}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {(u.assignedRoles && u.assignedRoles.length > 0 ? u.assignedRoles : [u.role]).map((r: string) => (
                          <Badge key={r} className={`text-[10px] ${ROLE_COLORS[r] || ""}`} data-testid={`badge-role-${u.id}-${r}`}>
                            {formatRole(r)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingUser?.id !== u.id && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          onClick={() => { setEditingUser(u); setEditRoles(u.assignedRoles && u.assignedRoles.length > 0 ? [...u.assignedRoles] : [u.role]); }}
                          data-testid={`button-edit-user-${u.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-7 h-7 text-destructive hover:text-destructive"
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this user? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(u.id)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User ID (Replit username or email)</Label>
              <Input
                placeholder="Enter user ID"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                data-testid="input-new-user-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={newUserTenantId} onValueChange={setNewUserTenantId}>
                <SelectTrigger data-testid="select-new-user-tenant">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {allTenants.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <div className="flex items-center gap-2">
                        {t.type === "mssp" ? <Shield className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Roles (select one or more)</Label>
              <div className="grid grid-cols-1 gap-1.5 mt-1 border rounded-md p-3 max-h-52 overflow-y-auto" data-testid="select-new-user-roles">
                {ROLE_OPTIONS.map(r => {
                  const selected = newUserRoles.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-sm transition-colors ${selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"}`}
                      onClick={() => {
                        setNewUserRoles(prev =>
                          prev.includes(r.value) ? prev.filter(x => x !== r.value) : [...prev, r.value]
                        );
                      }}
                      data-testid={`checkbox-role-${r.value}`}
                    >
                      <div className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.label}</span>
                        <span className="text-muted-foreground ml-2 text-[11px]">{r.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {newUserRoles.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {newUserRoles.map(r => (
                    <Badge key={r} variant="secondary" className="text-[10px]">{formatRole(r)}</Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (!newUserId || !newUserTenantId || newUserRoles.length === 0) {
                  toast({ title: "Please fill all fields and select at least one role", variant: "destructive" });
                  return;
                }
                createMutation.mutate({
                  userId: newUserId,
                  tenantId: parseInt(newUserTenantId),
                  role: newUserRoles[0],
                  assignedRoles: newUserRoles,
                });
              }}
              disabled={createMutation.isPending}
              data-testid="button-submit-user"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LicensesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLicense, setEditLicense] = useState<EnrichedLicense | null>(null);

  const { data: allLicenses = [], isLoading } = useQuery<EnrichedLicense[]>({
    queryKey: ["/api/tenant-admin/licenses"],
  });

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tenant-admin/licenses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/licenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      setDialogOpen(false);
      toast({ title: "License created" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/tenant-admin/licenses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/licenses"] });
      setEditLicense(null);
      setDialogOpen(false);
      toast({ title: "License updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tenant-admin/licenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/licenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      toast({ title: "License deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      tenantId: parseInt(fd.get("tenantId") as string),
      licenseType: fd.get("licenseType"),
      maxUsers: parseInt(fd.get("maxUsers") as string) || 10,
      maxEndpoints: parseInt(fd.get("maxEndpoints") as string) || null,
      status: fd.get("status"),
      startDate: fd.get("startDate"),
      expiresAt: fd.get("expiresAt"),
      notes: fd.get("notes") || null,
    };
    if (editLicense) {
      updateMutation.mutate({ id: editLicense.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-600 dark:text-green-400",
    expired: "bg-red-500/10 text-red-600 dark:text-red-400",
    suspended: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    trial: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-licenses-title">Licenses</h2>
          <p className="text-sm text-muted-foreground">{allLicenses.length} license(s) registered</p>
        </div>
        <Button size="sm" onClick={() => { setEditLicense(null); setDialogOpen(true); }} data-testid="button-add-license">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add License
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : allLicenses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No licenses</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first license to start managing subscriptions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-medium">Tenant</TableHead>
                <TableHead className="font-medium">Type</TableHead>
                <TableHead className="font-medium">Users</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Start Date</TableHead>
                <TableHead className="font-medium">Expiry</TableHead>
                <TableHead className="font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allLicenses.map(l => (
                <TableRow key={l.id} className="hover:bg-muted/30" data-testid={`row-license-${l.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-sm">{l.tenantName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{l.licenseType}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      {l.maxUsers}
                      {l.maxEndpoints && <span className="text-muted-foreground text-xs ml-1">({l.maxEndpoints} endpoints)</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${statusColors[l.status] || ""}`}>{l.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{formatDate(l.startDate)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{formatDate(l.expiresAt)}</span>
                      {new Date(l.expiresAt) < new Date() && (
                        <AlertTriangle className="w-3 h-3 text-destructive" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7"
                        onClick={() => { setEditLicense(l); setDialogOpen(true); }}
                        data-testid={`button-edit-license-${l.id}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 text-destructive hover:text-destructive"
                            data-testid={`button-delete-license-${l.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete License</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this license? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(l.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditLicense(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editLicense ? "Edit License" : "Add License"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select name="tenantId" defaultValue={editLicense ? String(editLicense.tenantId) : ""} required>
                <SelectTrigger data-testid="select-license-tenant"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {allTenants.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>License Type</Label>
                <Select name="licenseType" defaultValue={editLicense?.licenseType || "enterprise"}>
                  <SelectTrigger data-testid="select-license-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue={editLicense?.status || "active"}>
                  <SelectTrigger data-testid="select-license-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Max Users</Label>
                <Input name="maxUsers" type="number" defaultValue={editLicense?.maxUsers || 10} data-testid="input-max-users" />
              </div>
              <div className="space-y-2">
                <Label>Max Endpoints</Label>
                <Input name="maxEndpoints" type="number" defaultValue={editLicense?.maxEndpoints || ""} data-testid="input-max-endpoints" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  name="startDate"
                  type="date"
                  defaultValue={editLicense ? new Date(editLicense.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}
                  required
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  name="expiresAt"
                  type="date"
                  defaultValue={editLicense ? new Date(editLicense.expiresAt).toISOString().split("T")[0] : ""}
                  required
                  data-testid="input-expiry-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea name="notes" defaultValue={editLicense?.notes || ""} rows={2} data-testid="input-license-notes" />
            </div>
            <DialogFooter>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-license">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {editLicense ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <div className="p-6 overflow-y-auto h-full max-w-7xl mx-auto">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-4 mb-6" data-testid="tabs-admin-portal">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="licenses" data-testid="tab-licenses">
            <KeyRound className="w-3.5 h-3.5 mr-1.5" />
            Licenses
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="tenants">
          <TenantsTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="licenses">
          <LicensesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
