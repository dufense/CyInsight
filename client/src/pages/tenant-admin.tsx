import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Tenant, TenantUser, License } from "@shared/schema";
import {
  Building2, Users, Shield, KeyRound, Globe, Plus, Search,
  Edit2, Trash2, ChevronRight, Activity, Calendar, AlertTriangle,
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

function PlatformOverviewTab() {
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
          <CardTitle className="text-sm">MSSP Hierarchy</CardTitle>
        </CardHeader>
        <CardContent>
          {mssps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No MSSPs configured</p>
          ) : (
            <div className="space-y-3">
              {mssps.map(mssp => {
                const children = allTenants.filter(t => t.parentId === mssp.id);
                return (
                  <div key={mssp.id} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{mssp.name}</span>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">MSSP</Badge>
                      <Badge variant={mssp.isActive ? "outline" : "destructive"} className="text-[9px] px-1.5 py-0 ml-auto">
                        {mssp.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {children.length > 0 && (
                      <div className="ml-6 space-y-1">
                        {children.map(child => (
                          <div key={child.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                            <ChevronRight className="w-3 h-3" />
                            <Building2 className="w-3 h-3" />
                            <span>{child.name}</span>
                            <Badge variant={child.isActive ? "outline" : "destructive"} className="text-[9px] px-1 py-0 ml-auto">
                              {child.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {children.length === 0 && (
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
      toast({ title: "Tenant updated" });
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
    ? allTenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : allTenants;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-tenants-tab"
          />
        </div>
        <Button size="sm" onClick={() => { setEditTenant(null); setDialogOpen(true); }} data-testid="button-add-tenant">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Tenant
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No tenants found</CardContent></Card>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map(t => {
            const parent = t.parentId ? allTenants.find(p => p.id === t.parentId) : null;
            return (
              <div key={t.id} className="flex items-center gap-3 p-3 hover:bg-muted/50" data-testid={`row-tenant-${t.id}`}>
                {t.type === "mssp" ? (
                  <Shield className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.type === "mssp" ? "MSSP" : `Customer of ${parent?.name || "—"}`}
                    {t.industry ? ` · ${t.industry}` : ""}
                    {t.contactEmail ? ` · ${t.contactEmail}` : ""}
                  </p>
                </div>
                <Badge variant={t.isActive ? "outline" : "destructive"} className="text-[9px] px-1.5 py-0 shrink-0">
                  {t.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge variant={t.type === "mssp" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 shrink-0">
                  {t.type.toUpperCase()}
                </Badge>
                <Button size="icon" variant="ghost" className="shrink-0 w-7 h-7" onClick={() => { setEditTenant(t); setDialogOpen(true); }} data-testid={`button-edit-tenant-${t.id}`}>
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
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
                {editTenant ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TenantUsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tenantUsers = [], isLoading } = useQuery<EnrichedTenantUser[]>({
    queryKey: ["/api/tenant-admin/tenant-users"],
  });

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tenant-admin/tenant-users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      setDialogOpen(false);
      toast({ title: "User added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/tenant-admin/tenant-users/${id}`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tenant-admin/tenant-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      toast({ title: "User removed" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      userId: fd.get("userId"),
      tenantId: parseInt(fd.get("tenantId") as string),
      role: fd.get("role"),
    });
  };

  const filtered = search
    ? tenantUsers.filter(u =>
        u.userId.toLowerCase().includes(search.toLowerCase()) ||
        u.tenantName.toLowerCase().includes(search.toLowerCase())
      )
    : tenantUsers;

  const roleColors: Record<string, string> = {
    platform_admin: "bg-red-500/10 text-red-500",
    mss_admin: "bg-blue-500/10 text-blue-500",
    mss_analyst: "bg-green-500/10 text-green-500",
    customer: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-users-tab"
          />
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-user">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No users found</CardContent></Card>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map(u => (
            <div key={u.id} className="flex items-center gap-3 p-3 hover:bg-muted/50" data-testid={`row-user-${u.id}`}>
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.userId}</p>
                <p className="text-[10px] text-muted-foreground">{u.tenantName} · {u.tenantType}</p>
              </div>
              <Select
                value={u.role}
                onValueChange={(role) => updateRoleMutation.mutate({ id: u.id, role })}
              >
                <SelectTrigger className="w-36 h-7 text-xs" data-testid={`select-role-${u.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_admin">Platform Admin</SelectItem>
                  <SelectItem value="mss_admin">MSS Admin</SelectItem>
                  <SelectItem value="mss_analyst">MSS Analyst</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
              <Badge className={`text-[9px] px-1.5 py-0 ${roleColors[u.role] || ""}`}>
                {u.role.replace(/_/g, " ")}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 w-7 h-7 text-destructive"
                onClick={() => deleteMutation.mutate(u.id)}
                data-testid={`button-delete-user-${u.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Tenant User</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input name="userId" required data-testid="input-user-id" />
            </div>
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select name="tenantId" required>
                <SelectTrigger data-testid="select-user-tenant"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {allTenants.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select name="role" defaultValue="customer">
                <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_admin">Platform Admin</SelectItem>
                  <SelectItem value="mss_admin">MSS Admin</SelectItem>
                  <SelectItem value="mss_analyst">MSS Analyst</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" size="sm" disabled={createMutation.isPending} data-testid="button-submit-user">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LicenseManagementTab() {
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
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    expired: "bg-red-500/10 text-red-500 border-red-500/20",
    suspended: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    trial: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{allLicenses.length} license(s)</p>
        <Button size="sm" onClick={() => { setEditLicense(null); setDialogOpen(true); }} data-testid="button-add-license">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add License
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : allLicenses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No licenses</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first license to start managing tenant subscriptions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {allLicenses.map(l => (
            <Card key={l.id} data-testid={`card-license-${l.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <KeyRound className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{l.tenantName}</p>
                      <Badge className={`text-[9px] px-1.5 py-0 ${statusColors[l.status] || ""}`}>
                        {l.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.licenseType} · {l.maxUsers} users
                      {l.maxEndpoints ? ` · ${l.maxEndpoints} endpoints` : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(l.startDate).toLocaleDateString()} — {new Date(l.expiresAt).toLocaleDateString()}
                      </span>
                      {new Date(l.expiresAt) < new Date() && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => { setEditLicense(l); setDialogOpen(true); }}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive" onClick={() => deleteMutation.mutate(l.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
                {editLicense ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TenantAdminPage() {
  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-tenant-admin-title">Tenant Administration</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage tenants, users, licenses, and platform configuration
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4" data-testid="tabs-tenant-admin">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Platform Overview
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Tenant Users
          </TabsTrigger>
          <TabsTrigger value="licenses" data-testid="tab-licenses">
            <KeyRound className="w-3.5 h-3.5 mr-1.5" />
            License Management
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <PlatformOverviewTab />
        </TabsContent>
        <TabsContent value="tenants" className="mt-4">
          <TenantsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <TenantUsersTab />
        </TabsContent>
        <TabsContent value="licenses" className="mt-4">
          <LicenseManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
