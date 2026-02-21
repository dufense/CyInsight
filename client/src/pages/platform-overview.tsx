import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Tenant } from "@shared/schema";
import {
  Building2,
  Users,
  Plus,
  ChevronRight,
  Shield,
  Globe,
  Loader2,
  Search,
  BarChart3,
  Activity,
  AlertTriangle,
  Ticket,
  FolderKanban,
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantWithChildren extends Tenant {
  children: Tenant[];
}

function MSSPCard({
  mssp,
  onSelectTenant,
  stats,
}: {
  mssp: TenantWithChildren;
  onSelectTenant: (tenant: Tenant) => void;
  stats?: Record<number, { incidents: number; tickets: number; projects: number }>;
}) {
  const [expanded, setExpanded] = useState(true);
  const msspStats = stats?.[mssp.id];

  return (
    <Card className="overflow-hidden" data-testid={`card-mssp-${mssp.id}`}>
      <CardHeader className="pb-3 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{mssp.name}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="default" className="text-[9px]">MSSP</Badge>
                {mssp.industry && <span className="text-[10px] text-muted-foreground">{mssp.industry}</span>}
                {mssp.contactEmail && <span className="text-[10px] text-muted-foreground">{mssp.contactEmail}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => onSelectTenant(mssp)}
              data-testid={`button-view-mssp-${mssp.id}`}
            >
              View Dashboard
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
        {msspStats && (
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="w-3 h-3" />
              <span>{msspStats.incidents} incidents</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Ticket className="w-3 h-3" />
              <span>{msspStats.tickets} tickets</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderKanban className="w-3 h-3" />
              <span>{msspStats.projects} projects</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <button
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors border-b"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-toggle-customers-${mssp.id}`}
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            {mssp.children.length} Customer{mssp.children.length !== 1 ? "s" : ""}
          </span>
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        {expanded && mssp.children.length > 0 && (
          <div className="divide-y">
            {mssp.children.map((child) => {
              const childStats = stats?.[child.id];
              return (
                <div
                  key={child.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() => onSelectTenant(child)}
                  data-testid={`row-customer-${child.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <span className="text-sm font-medium">{child.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {child.industry && <span className="text-[10px] text-muted-foreground">{child.industry}</span>}
                        {child.isActive ? (
                          <Badge variant="secondary" className="text-[9px]">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {childStats && (
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{childStats.incidents} inc</span>
                        <span>{childStats.tickets} tkt</span>
                        <span>{childStats.projects} proj</span>
                      </div>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {expanded && mssp.children.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No customers yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlatformOverviewPage() {
  const { hierarchy, setCurrentTenant, isPlatformAdmin, tenants } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"mssp" | "customer">("mssp");
  const [parentMsspId, setParentMsspId] = useState<string>("");

  const mssps = hierarchy.filter(h => h.type === "mssp");
  const totalCustomers = mssps.reduce((sum, m) => sum + m.children.length, 0);
  const totalTenants = mssps.length + totalCustomers;

  const createTenantMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tenants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      setCreateDialogOpen(false);
      toast({ title: "Tenant created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    createTenantMutation.mutate({
      name,
      slug,
      type: createType,
      parentId: createType === "customer" ? parseInt(parentMsspId) : null,
      industry: formData.get("industry") || null,
      contactEmail: formData.get("contactEmail") || null,
    });
  };

  const [, navigate] = useLocation();

  const handleSelectTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    navigate("/dashboard");
  };

  const filteredMssps = search
    ? mssps.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.children.some(c => c.name.toLowerCase().includes(search.toLowerCase()))
      )
    : mssps;

  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Access Restricted</p>
            <p className="text-xs text-muted-foreground mt-1">Platform Overview is available to platform administrators only.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage all MSSPs and their customer organizations
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-tenant">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Tenant
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-tenants">{totalTenants}</p>
              <p className="text-[10px] text-muted-foreground">Total Tenants</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-1/10">
              <Shield className="w-5 h-5 text-chart-1" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-mssps">{mssps.length}</p>
              <p className="text-[10px] text-muted-foreground">MSSP Organizations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-2/10">
              <Building2 className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-customers">{totalCustomers}</p>
              <p className="text-[10px] text-muted-foreground">Customer Tenants</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search MSSPs and customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-tenants"
        />
      </div>

      {filteredMssps.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No MSSPs found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try adjusting your search" : "Create your first MSSP tenant to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMssps.map((mssp) => (
            <MSSPCard
              key={mssp.id}
              mssp={mssp}
              onSelectTenant={handleSelectTenant}
            />
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTenant} className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant Type</Label>
              <Select value={createType} onValueChange={(v) => setCreateType(v as "mssp" | "customer")}>
                <SelectTrigger data-testid="select-tenant-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mssp">MSSP Organization</SelectItem>
                  <SelectItem value="customer">Customer Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createType === "customer" && (
              <div className="space-y-2">
                <Label>Parent MSSP</Label>
                <Select value={parentMsspId} onValueChange={setParentMsspId}>
                  <SelectTrigger data-testid="select-parent-mssp"><SelectValue placeholder="Select MSSP" /></SelectTrigger>
                  <SelectContent>
                    {mssps.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" required data-testid="input-tenant-name" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input name="industry" placeholder="e.g., Healthcare, Finance" data-testid="input-tenant-industry" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input name="contactEmail" type="email" placeholder="admin@example.com" data-testid="input-tenant-email" />
            </div>
            <Button type="submit" className="w-full" disabled={createTenantMutation.isPending} data-testid="button-submit-tenant">
              {createTenantMutation.isPending ? "Creating..." : `Create ${createType === "mssp" ? "MSSP" : "Customer"} Tenant`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
