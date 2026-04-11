import { useState, Fragment, lazy, Suspense } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Tenant, TenantUser, License } from "@shared/schema";
import { INDUSTRY_OPTIONS } from "@shared/schema";
import { TIMEZONE_OPTIONS, formatTenantDate } from "@/lib/format-date";
import {
  Building2, Users, Shield, KeyRound, Globe, Plus, Search,
  Edit2, Trash2, ChevronRight, ChevronDown, Activity, Calendar, AlertTriangle,
  UserPlus, Check, Loader2, Lock, Key, Eye, EyeOff, ShieldCheck, Mail, Copy, X,
  HeartPulse, Database, Archive, Download, FolderOpen, HardDrive, Clock, Save,
  ServerCog, PlayCircle, CheckCircle2, XCircle, Layers, Pencil, Cpu, Zap,
  RefreshCw, CheckCheck, AlertCircle, CloudCog, LogIn, Fingerprint, MessageSquare,
  Settings2, Plug, ToggleLeft, ToggleRight, FlaskConical, Bell, Bug,
} from "lucide-react";

const PlatformHealthTab = lazy(() => import("./platform-health"));
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
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
      <Link href="/admin/my-org">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/20 bg-primary/5" data-testid="card-my-organization">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">My Organization</p>
                <p className="text-xs text-muted-foreground">Manage stakeholders, security tools, and infrastructure</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

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

const SSO_PROVIDERS = [
  { value: "entra_id", label: "Microsoft Entra ID (Azure AD)", type: "oidc" },
  { value: "google", label: "Google Workspace", type: "oidc" },
  { value: "okta", label: "Okta", type: "oidc" },
  { value: "generic_oidc", label: "Generic OIDC", type: "oidc" },
  { value: "saml_miniorange", label: "miniOrange (SAML 2.0)", type: "saml" },
  { value: "saml_rsa", label: "RSA SecurID (SAML/RADIUS)", type: "saml" },
  { value: "saml_generic", label: "Generic SAML 2.0", type: "saml" },
];

function SsoConfigDialog({ tenantId, tenantName, open, onClose }: { tenantId: number; tenantName: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [enforceSsoOnly, setEnforceSsoOnly] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});

  const { data: existing, refetch } = useQuery<any>({
    queryKey: ["/api/admin/tenants", tenantId, "sso"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/tenants/${tenantId}/sso`);
      return r.json();
    },
    enabled: open && !!tenantId,
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const currentProvider = SSO_PROVIDERS.find(p => p.value === provider);
  const isSaml = currentProvider?.type === "saml";
  const metadataUrl = isSaml ? `${baseUrl}/auth/sso/metadata/${tenantId}` : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/sso`, {
        provider, displayName, config,
        allowedDomains: allowedDomains.split(",").map(d => d.trim()).filter(Boolean),
        enforceSsoOnly, enabled: true,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "SSO configuration saved" });
      refetch();
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/tenants/${tenantId}/sso`); },
    onSuccess: () => { toast({ title: "SSO configuration removed" }); refetch(); setProvider(""); },
    onError: (e: any) => toast({ title: "Failed to remove", description: e.message, variant: "destructive" }),
  });

  const updateField = (key: string, val: string) => setConfig(prev => ({ ...prev, [key]: val }));

  const configFields: Record<string, { key: string; label: string; placeholder?: string }[]> = {
    entra_id: [
      { key: "tenantId", label: "Azure Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "clientId", label: "Client ID (Application ID)", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "clientSecret", label: "Client Secret", placeholder: "Your client secret" },
    ],
    google: [
      { key: "clientId", label: "Client ID", placeholder: "xxxxxx.apps.googleusercontent.com" },
      { key: "clientSecret", label: "Client Secret", placeholder: "Your client secret" },
    ],
    okta: [
      { key: "oktaDomain", label: "Okta Domain", placeholder: "your-org.okta.com" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret" },
    ],
    generic_oidc: [
      { key: "discoveryUrl", label: "Discovery URL", placeholder: "https://idp.example.com/.well-known/openid-configuration" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret" },
    ],
    saml_miniorange: [
      { key: "idpSsoUrl", label: "IdP SSO URL", placeholder: "https://login.miniorange.com/..." },
      { key: "idpCertificate", label: "IdP X.509 Certificate (PEM)" },
      { key: "spEntityId", label: "SP Entity ID (optional)", placeholder: `urn:cyber-command-center:tenant:${tenantId}` },
    ],
    saml_rsa: [
      { key: "idpSsoUrl", label: "IdP SSO URL" },
      { key: "idpCertificate", label: "IdP X.509 Certificate (PEM)" },
      { key: "spEntityId", label: "SP Entity ID (optional)" },
    ],
    saml_generic: [
      { key: "idpSsoUrl", label: "IdP SSO URL" },
      { key: "idpCertificate", label: "IdP X.509 Certificate (PEM)" },
      { key: "spEntityId", label: "SP Entity ID (optional)" },
    ],
  };

  const fields = configFields[provider] || [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-4 h-4 text-blue-400" />
            SSO & Identity — {tenantName}
          </DialogTitle>
        </DialogHeader>

        {existing && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 mb-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            SSO configured: <strong>{SSO_PROVIDERS.find(p => p.value === existing.provider)?.label ?? existing.provider}</strong>
            <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              Remove
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Identity Provider</Label>
            <Select value={provider} onValueChange={v => { setProvider(v); setConfig({}); }}>
              <SelectTrigger data-testid="select-sso-provider"><SelectValue placeholder="Select provider…" /></SelectTrigger>
              <SelectContent>
                <SelectGroup><SelectLabel>OIDC</SelectLabel>
                  {SSO_PROVIDERS.filter(p => p.type === "oidc").map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup><SelectLabel>SAML 2.0</SelectLabel>
                  {SSO_PROVIDERS.filter(p => p.type === "saml").map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {provider && (
            <>
              <div className="space-y-1.5">
                <Label>Display Name (shown on login button)</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Acme Corp SSO" data-testid="input-sso-display-name" />
              </div>

              <div className="space-y-1.5">
                <Label>Allowed Email Domains (comma-separated)</Label>
                <Input value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} placeholder="acme.com, acmecorp.com" data-testid="input-sso-domains" />
                <p className="text-xs text-muted-foreground">Users with these email domains will see the SSO button on the login page.</p>
              </div>

              {fields.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  {f.key === "idpCertificate" ? (
                    <Textarea value={config[f.key] || ""} onChange={e => updateField(f.key, e.target.value)} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" rows={4} className="text-xs font-mono" data-testid={`input-sso-${f.key}`} />
                  ) : (
                    <Input value={config[f.key] || ""} onChange={e => updateField(f.key, e.target.value)} placeholder={f.placeholder} data-testid={`input-sso-${f.key}`} />
                  )}
                </div>
              ))}

              {isSaml && metadataUrl && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-blue-400">SP Metadata URL</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground flex-1 truncate">{metadataUrl}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(metadataUrl); toast({ title: "Copied" }); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Register this URL in your IdP to configure the SP.</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="checkbox" id="enforceSSO" checked={enforceSsoOnly} onChange={e => setEnforceSsoOnly(e.target.checked)} className="rounded" />
                <Label htmlFor="enforceSSO" className="cursor-pointer">Enforce SSO-only (disable local password login for SSO users)</Label>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!provider || saveMutation.isPending} data-testid="button-save-sso">
            {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save SSO Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TENANT_TIER_COLORS: Record<string, string> = {
  standard: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  professional: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function TenantsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [ssoTenant, setSsoTenant] = useState<Tenant | null>(null);
  const [formType, setFormType] = useState<"mssp" | "customer">("mssp");
  const [parentId, setParentId] = useState<string>("");
  const [expandedMssps, setExpandedMssps] = useState<Set<number>>(new Set());
  const [industryValue, setIndustryValue] = useState<string>("");
  const [timezoneValue, setTimezoneValue] = useState<string>("UTC");
  const [brandColorValue, setBrandColorValue] = useState<string>("#3b82f6");
  const [logoUrlValue, setLogoUrlValue] = useState<string>("");
  // Quota tier inline editing
  const [quotaEditId, setQuotaEditId] = useState<number | null>(null);
  const [quotaEditTier, setQuotaEditTier] = useState<string>("standard");

  const { data: allTenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const mssps = allTenants.filter(t => t.type === "mssp");

  // Quota tier data for tenants (includes live usage rates)
  const { data: quotaList = [] } = useQuery<Array<{
    tenantId: number; tier: string; apiLimit: number; eventsLimit: number; storageGb: number;
    currentApiRate: number; currentEventsRate: number;
  }>>({
    queryKey: ["/api/admin/tenant-quotas"],
    refetchInterval: 30_000,
    select: (data: any[]) => data.map(q => ({
      tenantId: q.tenantId,
      tier: q.tier,
      apiLimit: q.apiLimit,
      eventsLimit: q.eventsLimit,
      storageGb: q.storageGb,
      currentApiRate: q.currentApiRate ?? 0,
      currentEventsRate: q.currentEventsRate ?? 0,
    })),
  });
  const quotaMap = Object.fromEntries(quotaList.map(q => [q.tenantId, q]));

  function quotaUtilColor(rate: number, limit: number): string {
    if (limit >= 999999) return "text-green-400";
    const pct = limit > 0 ? (rate / limit) * 100 : 0;
    if (pct >= 90) return "text-red-400";
    if (pct >= 60) return "text-amber-400";
    return "text-green-400";
  }
  function quotaStatusDot(rate: number, limit: number): string {
    if (limit >= 999999) return "bg-green-500";
    const pct = limit > 0 ? (rate / limit) * 100 : 0;
    if (pct >= 90) return "bg-red-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-green-500";
  }

  const updateQuotaTierMutation = useMutation({
    mutationFn: async ({ tenantId, tier }: { tenantId: number; tier: string }) => {
      const res = await apiRequest("PUT", `/api/admin/tenant-quotas/${tenantId}`, { tier });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenant-quotas"] });
      setQuotaEditId(null);
      toast({ title: "Quota tier updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update quota", description: e.message, variant: "destructive" }),
  });

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
          industry: industryValue || null,
          contactEmail: fd.get("contactEmail") || null,
          timezone: timezoneValue || "UTC",
          brandColor: brandColorValue || "#3b82f6",
          logoUrl: (fd.get("logoUrl") as string) || null,
          isActive: fd.get("isActive") === "true",
        },
      });
    } else {
      createMutation.mutate({
        name,
        slug,
        type: formType,
        parentId: formType === "customer" && parentId ? parseInt(parentId) : null,
        industry: industryValue || null,
        contactEmail: fd.get("contactEmail") || null,
        timezone: timezoneValue || "UTC",
        brandColor: brandColorValue || "#3b82f6",
        logoUrl: (fd.get("logoUrl") as string) || null,
      });
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedMssps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAddCustomer = (mssp: Tenant) => {
    setEditTenant(null);
    setFormType("customer");
    setParentId(String(mssp.id));
    setIndustryValue("");
    setTimezoneValue("UTC");
    setBrandColorValue("#3b82f6");
    setLogoUrlValue("");
    setDialogOpen(true);
  };

  const searchLower = search.toLowerCase();
  const matchesSearch = (t: Tenant) =>
    !search || t.name.toLowerCase().includes(searchLower) || t.industry?.toLowerCase().includes(searchLower);

  const getChildren = (pid: number) => allTenants.filter(t => t.parentId === pid);

  const topLevel = allTenants.filter(t => t.type === "mssp" || !t.parentId).filter(t => {
    if (matchesSearch(t)) return true;
    if (t.type === "mssp") return getChildren(t.id).some(c => matchesSearch(c));
    return false;
  });

  const getFilteredChildren = (pid: number) => {
    const children = getChildren(pid);
    if (!search) return children;
    return children.filter(c => matchesSearch(c));
  };

  const totalCount = allTenants.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-tenants-title">Tenants</h2>
          <p className="text-sm text-muted-foreground">{totalCount} tenants registered</p>
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
          <Button size="sm" onClick={() => { setEditTenant(null); setFormType("mssp"); setParentId(""); setIndustryValue(""); setTimezoneValue("UTC"); setBrandColorValue("#3b82f6"); setLogoUrlValue(""); setDialogOpen(true); }} data-testid="button-add-tenant">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Tenant
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : topLevel.length === 0 ? (
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
                <TableHead className="font-medium">Quota Tier</TableHead>
                <TableHead className="font-medium">Status</TableHead>
                <TableHead className="font-medium">Created</TableHead>
                <TableHead className="font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topLevel.map(t => {
                const parent = t.parentId ? allTenants.find(p => p.id === t.parentId) : null;
                const children = t.type === "mssp" ? getFilteredChildren(t.id) : [];
                const allChildren = t.type === "mssp" ? getChildren(t.id) : [];
                const isExpanded = expandedMssps.has(t.id);
                const renderRow = (tenant: Tenant, isChild: boolean, parentTenant?: Tenant | null) => (
                  <TableRow key={tenant.id} className={`hover:bg-muted/30 ${isChild ? "bg-muted/20" : ""}`} data-testid={`row-tenant-${tenant.id}`}>
                    <TableCell>
                      <div className={`flex items-center gap-2 ${isChild ? "pl-8" : ""}`}>
                        {!isChild && tenant.type === "mssp" && children.length > 0 ? (
                          <button
                            onClick={() => toggleExpand(tenant.id)}
                            className="p-0.5 rounded hover:bg-muted shrink-0"
                            data-testid={`button-expand-tenant-${tenant.id}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : !isChild && tenant.type === "mssp" ? (
                          <span className="w-5 shrink-0" />
                        ) : isChild ? (
                          <span className="w-0.5 h-4 bg-border rounded shrink-0 -ml-4 mr-1.5" />
                        ) : null}
                        {tenant.type === "mssp" ? (
                          <Shield className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-sm">{tenant.name}</span>
                        {!isChild && tenant.type === "mssp" && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">
                            {allChildren.length} customer{allChildren.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.type === "mssp" ? "default" : "secondary"} className="text-[10px]">
                        {tenant.type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tenant.industry ? (
                        <Badge variant="outline" className="text-[10px] font-normal">{tenant.industry}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{parentTenant?.name || parent?.name || "—"}</span>
                    </TableCell>
                    {/* Quota Tier column — shows usage/limit with health color + inline tier editor */}
                    <TableCell>
                      {quotaEditId === tenant.id ? (
                        <div className="flex items-center gap-1">
                          <Select value={quotaEditTier} onValueChange={setQuotaEditTier}>
                            <SelectTrigger className="h-6 text-[10px] w-24" data-testid={`select-quota-tier-${tenant.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-6 px-2 text-[10px]"
                            onClick={() => updateQuotaTierMutation.mutate({ tenantId: tenant.id, tier: quotaEditTier })}
                            disabled={updateQuotaTierMutation.isPending}
                            data-testid={`button-save-quota-${tenant.id}`}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                            onClick={() => setQuotaEditId(null)}>✕</Button>
                        </div>
                      ) : quotaMap[tenant.id] ? (
                        <div className="flex flex-col gap-0.5 cursor-pointer group"
                          onClick={() => { setQuotaEditId(tenant.id); setQuotaEditTier(quotaMap[tenant.id].tier); }}
                          data-testid={`quota-cell-${tenant.id}`}>
                          {/* Tier badge with health dot */}
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${quotaStatusDot(quotaMap[tenant.id].currentApiRate, quotaMap[tenant.id].apiLimit)}`} />
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${TENANT_TIER_COLORS[quotaMap[tenant.id].tier] || ""}`}
                              data-testid={`badge-quota-tier-${tenant.id}`}>
                              {quotaMap[tenant.id].tier}
                            </Badge>
                          </div>
                          {/* API usage/limit */}
                          <span className={`text-[9px] font-mono leading-none ${quotaUtilColor(quotaMap[tenant.id].currentApiRate, quotaMap[tenant.id].apiLimit)}`}
                            data-testid={`text-quota-api-${tenant.id}`}>
                            {quotaMap[tenant.id].apiLimit >= 999999 ? "API: ∞" : `API: ${quotaMap[tenant.id].currentApiRate}/${quotaMap[tenant.id].apiLimit}/s`}
                          </span>
                          {/* Events usage/limit */}
                          <span className={`text-[9px] font-mono leading-none ${quotaUtilColor(quotaMap[tenant.id].currentEventsRate, quotaMap[tenant.id].eventsLimit)}`}
                            data-testid={`text-quota-ev-${tenant.id}`}>
                            {quotaMap[tenant.id].eventsLimit >= 999999 ? "Ev: ∞" : `Ev: ${quotaMap[tenant.id].currentEventsRate}/${quotaMap[tenant.id].eventsLimit}/s`}
                          </span>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-muted-foreground"
                          onClick={() => { setQuotaEditId(tenant.id); setQuotaEditTier("standard"); }}
                          data-testid={`button-set-quota-${tenant.id}`}>
                          Set tier
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.isActive ? "outline" : "destructive"} className="text-[10px]">
                        {tenant.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {tenant.createdAt ? formatTenantDate(tenant.createdAt) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {tenant.type === "mssp" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openAddCustomer(tenant)}
                            data-testid={`button-add-customer-${tenant.id}`}
                          >
                            <Plus className="w-3 h-3" />
                            Add Customer
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          title="Configure SSO & Identity"
                          onClick={() => setSsoTenant(tenant)}
                          data-testid={`button-sso-tenant-${tenant.id}`}
                        >
                          <LogIn className="w-3.5 h-3.5 text-blue-400" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          onClick={() => { setEditTenant(tenant); setIndustryValue(tenant.industry || ""); setTimezoneValue((tenant as any).timezone || "UTC"); setBrandColorValue((tenant as any).brandColor || "#3b82f6"); setLogoUrlValue((tenant as any).logoUrl || ""); setDialogOpen(true); }}
                          data-testid={`button-edit-tenant-${tenant.id}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-7 h-7 text-destructive hover:text-destructive"
                              data-testid={`button-delete-tenant-${tenant.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {isChild ? "Customer" : "Tenant"}</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{tenant.name}"? This action cannot be undone and will remove all associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(tenant.id)}
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
                );
                return (
                  <Fragment key={t.id}>
                    {renderRow(t, false)}
                    {isExpanded && children.map(child => renderRow(child, true, t))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTenant ? "Edit Tenant" : formType === "customer" ? "Add Customer" : "Add Tenant"}
            </DialogTitle>
            {!editTenant && formType === "customer" && parentId && (
              <p className="text-sm text-muted-foreground">
                Creating customer under: <span className="font-medium text-foreground">{mssps.find(m => String(m.id) === parentId)?.name}</span>
              </p>
            )}
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
              <Select value={industryValue} onValueChange={setIndustryValue}>
                <SelectTrigger data-testid="select-tenant-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input name="contactEmail" type="email" defaultValue={editTenant?.contactEmail || ""} data-testid="input-tenant-email" />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezoneValue} onValueChange={setTimezoneValue}>
                <SelectTrigger data-testid="select-tenant-timezone"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Brand Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColorValue}
                  onChange={e => setBrandColorValue(e.target.value)}
                  className="w-10 h-9 rounded-md border border-input cursor-pointer p-0.5"
                  data-testid="input-tenant-brand-color"
                />
                <Input
                  value={brandColorValue}
                  onChange={e => setBrandColorValue(e.target.value)}
                  placeholder="#3b82f6"
                  className="flex-1"
                  data-testid="input-tenant-brand-color-hex"
                />
                <div
                  className="w-9 h-9 rounded-md border border-input shrink-0"
                  style={{ backgroundColor: brandColorValue }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input name="logoUrl" type="url" value={logoUrlValue} onChange={e => setLogoUrlValue(e.target.value)} placeholder="https://example.com/logo.png" data-testid="input-tenant-logo-url" />
            </div>
            {/* PDF Branding Preview */}
            <div className="space-y-2">
              <Label>PDF Branding Preview</Label>
              <div className="rounded-lg overflow-hidden border border-border/40" data-testid="pdf-brand-preview-admin">
                <div className="flex items-center justify-between px-3 py-2"
                  style={{ background: `linear-gradient(135deg, ${brandColorValue || "#1e293b"} 0%, #0f172a 100%)` }}>
                  <div className="flex items-center gap-2">
                    {logoUrlValue ? (
                      <img src={logoUrlValue} alt="Logo preview" className="h-5 w-auto max-w-[60px] object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                        style={{ background: brandColorValue || "#3b82f6" }}>
                        {(editTenant?.name || "C")[0]}
                      </div>
                    )}
                    <span className="text-white text-[10px] font-bold tracking-wide truncate">{editTenant?.name || "Tenant Name"}</span>
                  </div>
                  <span className="text-[8px] text-white/50 uppercase tracking-wider">Confidential</span>
                </div>
                <div className="bg-slate-900 px-3 py-1.5 flex gap-2">
                  {["Threats", "IOCs", "SLA", "Score"].map(label => (
                    <div key={label} className="flex-1 text-center">
                      <div className="text-[11px] font-bold text-white">—</div>
                      <div className="text-[7px] text-white/30">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-950 px-3 py-1 flex items-center justify-between">
                  <span className="text-[7px] text-white/20">SAMPLE PDF HEADER</span>
                  <div className="h-0.5 w-8 rounded" style={{ background: brandColorValue || "#3b82f6" }} />
                </div>
              </div>
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

      {ssoTenant && (
        <SsoConfigDialog
          tenantId={ssoTenant.id}
          tenantName={ssoTenant.name}
          open={!!ssoTenant}
          onClose={() => setSsoTenant(null)}
        />
      )}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserTenantIds, setNewUserTenantIds] = useState<string[]>([]);
  const [newUserRoles, setNewUserRoles] = useState<string[]>([]);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [passwordDialog, setPasswordDialog] = useState<{ userId: string; mode: "set" | "reset" } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState("");

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
      if (data.tenantIds && data.tenantIds.length > 1) {
        const res = await apiRequest("POST", "/api/admin/users/multi-tenant", data);
        return res.json();
      }
      const singleData = { ...data, tenantId: data.tenantIds?.[0] || data.tenantId };
      try {
        const res = await apiRequest("POST", "/api/tenant-admin/tenant-users", singleData);
        return res.json();
      } catch {
        const res = await apiRequest("POST", "/api/admin/users", singleData);
        return res.json();
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-admin/stats"] });
      setDialogOpen(false);
      setNewUserId("");
      setNewUserTenantIds([]);
      setNewUserRoles([]);
      setNewUserPassword("");
      const msg = data?.message || "User added successfully";
      toast({ title: msg });
    },
    onError: (e: any) => toast({ title: "Failed to add user", description: e.message, variant: "destructive" }),
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/set-password`, { password });
      return res.json();
    },
    onSuccess: () => {
      setPasswordDialog(null);
      setNewPassword("");
      toast({ title: "Password updated successfully" });
    },
    onError: (e: any) => toast({ title: "Failed to set password", description: e.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setTempPassword(data.tempPassword || "");
      toast({ title: "Password reset successfully" });
    },
    onError: (e: any) => toast({ title: "Failed to reset password", description: e.message, variant: "destructive" }),
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

  const toggleTenantSelection = (tid: string) => {
    setNewUserTenantIds(prev =>
      prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid]
    );
  };

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
                          title="Edit roles"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          onClick={() => { setPasswordDialog({ userId: u.userId, mode: "set" }); setNewPassword(""); setTempPassword(""); }}
                          data-testid={`button-set-password-${u.id}`}
                          title="Set password"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 text-amber-600 hover:text-amber-700"
                          onClick={() => {
                            setPasswordDialog({ userId: u.userId, mode: "reset" });
                            setTempPassword("");
                            resetPasswordMutation.mutate(u.userId);
                          }}
                          data-testid={`button-reset-password-${u.id}`}
                          title="Reset password"
                        >
                          <Lock className="w-3.5 h-3.5" />
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User ID (username or email)</Label>
              <Input
                placeholder="Enter username or email"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                data-testid="input-new-user-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Initial Password</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Set initial password (min 6 chars)"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  data-testid="input-new-user-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Organizations (select one or more)</Label>
              <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-0.5" data-testid="select-new-user-tenants">
                {allTenants.filter(t => t.type === "mssp").map(mssp => {
                  const customers = allTenants.filter(c => c.parentId === mssp.id);
                  const msspSelected = newUserTenantIds.includes(String(mssp.id));
                  return (
                    <Fragment key={mssp.id}>
                      <button
                        type="button"
                        className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-left text-sm transition-colors ${msspSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"}`}
                        onClick={() => toggleTenantSelection(String(mssp.id))}
                      >
                        <div className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${msspSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {msspSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <Shield className="w-3 h-3 text-primary" />
                        <span className="font-medium">{mssp.name}</span>
                        <span className="text-muted-foreground text-[10px]">MSSP</span>
                      </button>
                      {customers.map(c => {
                        const cSelected = newUserTenantIds.includes(String(c.id));
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-left text-sm transition-colors pl-8 ${cSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"}`}
                            onClick={() => toggleTenantSelection(String(c.id))}
                          >
                            <div className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${cSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                              {cSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <span>{c.name}</span>
                            <span className="text-muted-foreground text-[10px]">Customer</span>
                          </button>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </div>
              {newUserTenantIds.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {newUserTenantIds.map(tid => {
                    const t = allTenants.find(x => x.id === parseInt(tid));
                    return (
                      <Badge key={tid} variant="outline" className="text-[10px] gap-1">
                        {t?.name || tid}
                        <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => toggleTenantSelection(tid)} />
                      </Badge>
                    );
                  })}
                </div>
              )}
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
              onClick={async () => {
                if (!newUserId || newUserTenantIds.length === 0 || newUserRoles.length === 0) {
                  toast({ title: "Please fill all fields, select at least one organization and role", variant: "destructive" });
                  return;
                }
                if (newUserPassword) {
                  if (newUserPassword.length < 6) {
                    toast({ title: "Password must be at least 6 characters", variant: "destructive" });
                    return;
                  }
                  try {
                    await apiRequest("POST", `/api/admin/users/${newUserId}/set-password`, { password: newUserPassword });
                  } catch {}
                }
                createMutation.mutate({
                  userId: newUserId,
                  tenantIds: newUserTenantIds.map(t => parseInt(t)),
                  role: newUserRoles[0],
                  assignedRoles: newUserRoles,
                });
              }}
              disabled={createMutation.isPending}
              data-testid="button-submit-user"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add User to {newUserTenantIds.length || 0} Organization(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordDialog} onOpenChange={(o) => { if (!o) { setPasswordDialog(null); setNewPassword(""); setTempPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{passwordDialog?.mode === "reset" ? "Reset Password" : "Set Password"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">User: <span className="font-medium text-foreground">{passwordDialog?.userId}</span></p>
            {passwordDialog?.mode === "set" ? (
              <>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password (min 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      data-testid="input-set-password"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!newPassword || newPassword.length < 6) {
                      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
                      return;
                    }
                    setPasswordMutation.mutate({ userId: passwordDialog!.userId, password: newPassword });
                  }}
                  disabled={setPasswordMutation.isPending}
                  data-testid="button-confirm-set-password"
                >
                  {setPasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Set Password
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                {resetPasswordMutation.isPending ? (
                  <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Generating temporary password...</div>
                ) : tempPassword ? (
                  <div className="space-y-2">
                    <p className="text-sm">Temporary password generated. Share this with the user:</p>
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                      <code className="flex-1 font-mono text-sm font-bold" data-testid="text-temp-password">{tempPassword}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 shrink-0"
                        onClick={() => { navigator.clipboard.writeText(tempPassword); toast({ title: "Copied to clipboard" }); }}
                        data-testid="button-copy-temp-password"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-amber-600">The user should change this password after first login.</p>
                  </div>
                ) : null}
              </div>
            )}
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
                    <span className="text-xs text-muted-foreground">{formatTenantDate(l.startDate)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{formatTenantDate(l.expiresAt)}</span>
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
                  {allTenants.filter(t => t.type === "mssp").map(mssp => {
                    const customers = allTenants.filter(c => c.parentId === mssp.id);
                    return (
                      <Fragment key={mssp.id}>
                        <SelectItem value={String(mssp.id)}>
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3 text-primary shrink-0" />
                            <span>{mssp.name}</span>
                            <span className="text-muted-foreground text-[10px]">MSSP</span>
                          </div>
                        </SelectItem>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            <div className="flex items-center gap-2 pl-4">
                              <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span>{c.name}</span>
                              <span className="text-muted-foreground text-[10px]">Customer</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Fragment>
                    );
                  })}
                  {allTenants.filter(t => t.type !== "mssp" && !t.parentId).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span>{t.name}</span>
                      </div>
                    </SelectItem>
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

interface RetentionPolicy {
  tenantId: number;
  tenantName: string;
  retentionHotDays: number;
  retentionWarmDays: number;
  retentionColdDays: number;
  archiveStorageProvider: string | null;
  dataRegion: string | null;
}

interface StorageStats {
  totalObjects: number;
  totalSizeBytes: number;
  byTier: Record<string, { objects: number; sizeBytes: number }>;
  byTenant: Record<string, { objects: number; sizeBytes: number }>;
}

interface ArchivedObject {
  key: string;
  size: number;
  lastModified: string;
  etag?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function DataRetentionTab() {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [browseRegion, setBrowseRegion] = useState<string>("in-west-1");
  const [browsePrefix, setBrowsePrefix] = useState<string>("");
  const [archiveDays, setArchiveDays] = useState<string>("90");
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const [editHotDays, setEditHotDays] = useState("90");
  const [editWarmDays, setEditWarmDays] = useState("365");
  const [editColdDays, setEditColdDays] = useState("1095");
  const [editProvider, setEditProvider] = useState<string>("");

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const { data: retentionPolicy, isLoading: policyLoading } = useQuery<RetentionPolicy>({
    queryKey: ["/api/tenants", selectedTenantId, "retention-policy"],
    enabled: !!selectedTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${selectedTenantId}/retention-policy`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: storageStats, isLoading: statsLoading } = useQuery<StorageStats & { region: string; provider: string; bucket: string }>({
    queryKey: ["/api/data-plane", browseRegion, "storage", "stats", selectedTenantId],
    queryFn: async () => {
      const params = selectedTenantId ? `?tenantId=${selectedTenantId}` : "";
      const res = await fetch(`/api/data-plane/${browseRegion}/storage/stats${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: archivedData, isLoading: browseLoading } = useQuery<{ region: string; objects: ArchivedObject[]; count: number }>({
    queryKey: ["/api/data-plane", browseRegion, "storage", "browse", browsePrefix],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (browsePrefix) params.set("prefix", browsePrefix);
      params.set("maxKeys", "100");
      const res = await fetch(`/api/data-plane/${browseRegion}/storage/browse?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async (data: { tenantId: string; policy: any }) => {
      const res = await apiRequest("PUT", `/api/tenants/${data.tenantId}/retention-policy`, data.policy);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", selectedTenantId, "retention-policy"] });
      setEditingPolicy(null);
      toast({ title: "Retention policy updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (data: { tenantId: number; olderThanDays: number }) => {
      const res = await apiRequest("POST", "/api/data-plane/archive", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-plane"] });
      toast({ title: "Archival complete", description: data.message });
    },
    onError: (e: any) => toast({ title: "Archival failed", description: e.message, variant: "destructive" }),
  });

  const regions = [
    { id: "in-west-1", name: "India (Mumbai)" },
    { id: "us-east-1", name: "US (Virginia)" },
    { id: "ke-east-1", name: "Kenya (Nairobi)" },
    { id: "sa-central-1", name: "Saudi Arabia (Riyadh)" },
    { id: "bh-east-1", name: "Bahrain (Manama)" },
  ];

  const openEditPolicy = (policy: RetentionPolicy) => {
    setEditingPolicy(policy);
    setEditHotDays(String(policy.retentionHotDays));
    setEditWarmDays(String(policy.retentionWarmDays));
    setEditColdDays(String(policy.retentionColdDays));
    setEditProvider(policy.archiveStorageProvider || "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-data-retention-title">Data Retention</h2>
          <p className="text-sm text-muted-foreground">Configure retention policies and browse archived data</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger className="w-56" data-testid="select-retention-tenant">
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {allTenants.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>
                  <div className="flex items-center gap-2">
                    {t.type === "mssp" ? <Shield className="w-3 h-3 text-primary shrink-0" /> : <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span>{t.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={browseRegion} onValueChange={setBrowseRegion}>
            <SelectTrigger className="w-48" data-testid="select-retention-region">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              {regions.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedTenantId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Retention Policy
            </CardTitle>
            {retentionPolicy && !editingPolicy && (
              <Button size="sm" variant="outline" onClick={() => openEditPolicy(retentionPolicy)} data-testid="button-edit-retention-policy">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                Edit Policy
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {policyLoading ? (
              <div className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            ) : retentionPolicy ? (
              editingPolicy ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Hot Storage (days)</Label>
                      <Input
                        type="number"
                        value={editHotDays}
                        onChange={e => setEditHotDays(e.target.value)}
                        min={1}
                        max={365}
                        data-testid="input-retention-hot-days"
                      />
                      <p className="text-[10px] text-muted-foreground">Database, fast access</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Warm Storage (days)</Label>
                      <Input
                        type="number"
                        value={editWarmDays}
                        onChange={e => setEditWarmDays(e.target.value)}
                        min={1}
                        max={3650}
                        data-testid="input-retention-warm-days"
                      />
                      <p className="text-[10px] text-muted-foreground">Standard object storage</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cold Storage (days)</Label>
                      <Input
                        type="number"
                        value={editColdDays}
                        onChange={e => setEditColdDays(e.target.value)}
                        min={1}
                        max={7300}
                        data-testid="input-retention-cold-days"
                      />
                      <p className="text-[10px] text-muted-foreground">Infrequent access</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Archive Provider</Label>
                      <Select value={editProvider} onValueChange={setEditProvider}>
                        <SelectTrigger data-testid="select-archive-provider">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="s3">AWS S3</SelectItem>
                          <SelectItem value="azure">Azure Blob</SelectItem>
                          <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                          <SelectItem value="minio">MinIO</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Override default provider</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => updatePolicyMutation.mutate({
                        tenantId: selectedTenantId,
                        policy: {
                          retentionHotDays: parseInt(editHotDays),
                          retentionWarmDays: parseInt(editWarmDays),
                          retentionColdDays: parseInt(editColdDays),
                          archiveStorageProvider: editProvider || null,
                        },
                      })}
                      disabled={updatePolicyMutation.isPending}
                      data-testid="button-save-retention-policy"
                    >
                      {updatePolicyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Policy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingPolicy(null)} data-testid="button-cancel-retention-edit">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-3.5 h-3.5 text-chart-1" />
                      <span className="text-xs font-medium">Hot</span>
                    </div>
                    <p className="text-lg font-bold" data-testid="text-hot-days">{retentionPolicy.retentionHotDays} days</p>
                    <p className="text-[10px] text-muted-foreground">Database storage</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <HardDrive className="w-3.5 h-3.5 text-chart-2" />
                      <span className="text-xs font-medium">Warm</span>
                    </div>
                    <p className="text-lg font-bold" data-testid="text-warm-days">{retentionPolicy.retentionWarmDays} days</p>
                    <p className="text-[10px] text-muted-foreground">Standard storage</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Archive className="w-3.5 h-3.5 text-chart-3" />
                      <span className="text-xs font-medium">Cold</span>
                    </div>
                    <p className="text-lg font-bold" data-testid="text-cold-days">{retentionPolicy.retentionColdDays} days</p>
                    <p className="text-[10px] text-muted-foreground">Infrequent access</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="w-3.5 h-3.5 text-chart-4" />
                      <span className="text-xs font-medium">Provider</span>
                    </div>
                    <p className="text-sm font-bold" data-testid="text-archive-provider">{retentionPolicy.archiveStorageProvider || "Default"}</p>
                    <p className="text-[10px] text-muted-foreground">{retentionPolicy.dataRegion || "No region"}</p>
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Select a tenant to view retention policy</p>
            )}
          </CardContent>
        </Card>
      )}

      {selectedTenantId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Archive className="w-4 h-4 text-primary" />
              Archive Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Archive events older than (days)</Label>
                <Input
                  type="number"
                  value={archiveDays}
                  onChange={e => setArchiveDays(e.target.value)}
                  className="w-32"
                  min={1}
                  data-testid="input-archive-days"
                />
              </div>
              <Button
                className="mt-5"
                size="sm"
                onClick={() => archiveMutation.mutate({
                  tenantId: parseInt(selectedTenantId),
                  olderThanDays: parseInt(archiveDays),
                })}
                disabled={archiveMutation.isPending}
                data-testid="button-trigger-archive"
              >
                {archiveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
                Archive Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            Storage Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : storageStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground">Total Objects</p>
                  <p className="text-lg font-bold" data-testid="text-total-objects">{storageStats.totalObjects}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground">Total Size</p>
                  <p className="text-lg font-bold" data-testid="text-total-size">{formatBytes(storageStats.totalSizeBytes)}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="text-lg font-bold" data-testid="text-storage-provider">{storageStats.provider}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground">Region</p>
                  <p className="text-lg font-bold" data-testid="text-storage-region">{storageStats.region}</p>
                </div>
              </div>
              {storageStats.byTier && Object.keys(storageStats.byTier).length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2 text-muted-foreground">By Tier</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(storageStats.byTier).map(([tier, data]) => (
                      <div key={tier} className="p-2 rounded-md border">
                        <p className="text-xs font-medium capitalize">{tier}</p>
                        <p className="text-sm font-bold">{data.objects} files</p>
                        <p className="text-[10px] text-muted-foreground">{formatBytes(data.sizeBytes)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No storage statistics available</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />
            Browse Archived Data
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter by prefix..."
              value={browsePrefix}
              onChange={e => setBrowsePrefix(e.target.value)}
              className="w-48"
              data-testid="input-browse-prefix"
            />
          </div>
        </CardHeader>
        <CardContent>
          {browseLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : archivedData && archivedData.objects.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Key</TableHead>
                    <TableHead className="font-medium">Size</TableHead>
                    <TableHead className="font-medium">Last Modified</TableHead>
                    <TableHead className="font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedData.objects.map((obj, idx) => (
                    <TableRow key={obj.key || idx} className="hover:bg-muted/30" data-testid={`row-archived-${idx}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Archive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-mono truncate max-w-xs" title={obj.key}>{obj.key}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{formatBytes(obj.size)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {obj.lastModified ? new Date(obj.lastModified).toLocaleString() : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/data-plane/${browseRegion}/storage/download/${encodeURIComponent(obj.key)}?presigned=true`);
                              const data = await res.json();
                              if (data.url) {
                                window.open(data.url, "_blank");
                              } else {
                                window.open(`/api/data-plane/${browseRegion}/storage/download/${encodeURIComponent(obj.key)}`, "_blank");
                              }
                            } catch {
                              window.open(`/api/data-plane/${browseRegion}/storage/download/${encodeURIComponent(obj.key)}`, "_blank");
                            }
                          }}
                          data-testid={`button-download-${idx}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No archived data</p>
              <p className="text-xs text-muted-foreground mt-1">Archived events will appear here after archival runs</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const CONNECTOR_TYPE_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  mssql: "SQL Server",
  clickhouse: "ClickHouse",
  timescaledb: "TimescaleDB",
  snowflake: "Snowflake",
  bigquery: "BigQuery",
  redshift: "Redshift",
  databricks: "Databricks",
  iceberg: "Apache Iceberg",
};

const CONNECTOR_TIER: Record<string, "hot" | "warm" | "cold"> = {
  postgresql: "hot",
  timescaledb: "hot",
  mysql: "hot",
  mariadb: "hot",
  mssql: "hot",
  clickhouse: "warm",
  redshift: "warm",
  iceberg: "cold",
  snowflake: "cold",
  bigquery: "cold",
  databricks: "cold",
};

interface DbConnector {
  id: number;
  name: string;
  connector_type: string;
  host: string | null;
  port: number | null;
  database: string | null;
  ssl_mode: string | null;
  status: string;
  last_tested_at: string | null;
  is_active: boolean;
  scope: string;
  tenant_id: number | null;
  has_credentials?: boolean;
}

interface RetentionBinding {
  id: number;
  tenant_id: number;
  tenant_name: string;
  warm_connector_id: number | null;
  cold_connector_id: number | null;
  warm_connector_name: string | null;
  warm_connector_type: string | null;
  cold_connector_name: string | null;
  cold_connector_type: string | null;
}

function ConnectorStatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
  }
  if (status === "unreachable") {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]"><XCircle className="w-3 h-3 mr-1" />Unreachable</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />Unconfigured</Badge>;
}

function DataInfrastructureTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<DbConnector | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [showCred, setShowCred] = useState(false);
  const [connectorType, setConnectorType] = useState<string>("postgresql");
  const [scope, setScope] = useState<string>("global");
  const [connectorTenantId, setConnectorTenantId] = useState<string>("");
  const [editingBindingId, setEditingBindingId] = useState<number | null>(null);

  const { data: allTenantsForConnectors = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });
  const [bindWarm, setBindWarm] = useState<string>("none");
  const [bindCold, setBindCold] = useState<string>("none");

  const { data: connectors = [], isLoading, refetch } = useQuery<DbConnector[]>({
    queryKey: ["/api/admin/db-connectors"],
    refetchInterval: 30000,
  });

  const { data: bindings = [], refetch: refetchBindings } = useQuery<RetentionBinding[]>({
    queryKey: ["/api/admin/retention-connector-bindings"],
    refetchInterval: 30000,
  });

  const { data: duckdbStatus } = useQuery<{ available: boolean; error: string | null }>({
    queryKey: ["/api/admin/duckdb-status"],
    refetchInterval: 30000,
  });

  const bindingMutation = useMutation({
    mutationFn: async ({ tenantId, warmConnectorId, coldConnectorId }: { tenantId: number; warmConnectorId: number | null; coldConnectorId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/retention-connector-bindings/${tenantId}`, { warmConnectorId, coldConnectorId });
      return res.json();
    },
    onSuccess: () => {
      refetchBindings();
      setEditingBindingId(null);
      toast({ title: "Binding updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/db-connectors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-connectors"] });
      setDialogOpen(false);
      toast({ title: "Connector added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/db-connectors/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-connectors"] });
      setDialogOpen(false);
      setEditConnector(null);
      toast({ title: "Connector updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/db-connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-connectors"] });
      toast({ title: "Connector removed" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const testConnector = async (id: number) => {
    setTestingId(id);
    try {
      const res = await apiRequest("POST", `/api/admin/db-connectors/${id}/test`, {});
      const data = await res.json();
      refetch();
      toast({
        title: data.connected ? "Connection successful" : "Connection failed",
        description: data.error || (data.connected ? "Connector is reachable" : "Could not reach the endpoint"),
        variant: data.connected ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name") as string,
      connectorType,
      host: fd.get("host") as string || null,
      port: fd.get("port") ? parseInt(fd.get("port") as string) : null,
      database: fd.get("database") as string || null,
      credentialBlob: fd.get("credentialBlob") as string || null,
      sslMode: fd.get("sslMode") as string || "prefer",
      scope,
      tenantId: scope === "tenant" && connectorTenantId ? parseInt(connectorTenantId) : null,
    };
    if (editConnector) {
      updateMutation.mutate({ id: editConnector.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openAdd = () => {
    setEditConnector(null);
    setConnectorType("postgresql");
    setScope("global");
    setConnectorTenantId("");
    setShowCred(false);
    setDialogOpen(true);
  };

  const openEdit = (c: DbConnector) => {
    setEditConnector(c);
    setConnectorType(c.connector_type);
    setScope(c.scope);
    setConnectorTenantId(c.tenant_id ? String(c.tenant_id) : "");
    setShowCred(false);
    setDialogOpen(true);
  };

  const connected = connectors.filter(c => c.status === "connected").length;
  const unreachable = connectors.filter(c => c.status === "unreachable").length;

  const tierGroups = {
    hot: connectors.filter(c => CONNECTOR_TIER[c.connector_type] === "hot"),
    warm: connectors.filter(c => CONNECTOR_TIER[c.connector_type] === "warm"),
    cold: connectors.filter(c => CONNECTOR_TIER[c.connector_type] === "cold"),
  };

  return (
    <div className="space-y-6" data-testid="data-infrastructure-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data Infrastructure</h2>
          <p className="text-sm text-muted-foreground">
            {connectors.length} connector{connectors.length !== 1 ? "s" : ""} registered — {connected} connected, {unreachable} unreachable
          </p>
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-connector">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Connector
        </Button>
      </div>

      {/* DuckDB Federated Query Engine Status */}
      <Card className={`border ${duckdbStatus?.available ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`} data-testid="card-duckdb-status">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              DuckDB Federated Query Engine
            </div>
            <Badge variant={duckdbStatus?.available ? "default" : "secondary"}
              className={duckdbStatus?.available ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>
              {duckdbStatus === undefined ? "Loading…" : duckdbStatus.available ? "Available" : "Unavailable"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-muted-foreground">
            {duckdbStatus?.available
              ? "In-memory DuckDB engine ready for warm-tier Parquet/federated queries via read_parquet()."
              : duckdbStatus?.error
                ? `Not initialized: ${duckdbStatus.error}`
                : "DuckDB status not yet loaded."}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["hot", "warm", "cold"] as const).map(tier => {
          const tierColors = {
            hot: "from-orange-500/10 to-red-500/10 border-orange-500/20",
            warm: "from-yellow-500/10 to-amber-500/10 border-yellow-500/20",
            cold: "from-blue-500/10 to-indigo-500/10 border-blue-500/20",
          };
          const tierLabels = { hot: "Hot Tier (OLTP)", warm: "Warm Tier (OLAP)", cold: "Cold Tier (Lake)" };
          const tierIcons = { hot: Database, warm: Layers, cold: Archive };
          const TierIcon = tierIcons[tier];
          return (
            <Card key={tier} className={`bg-gradient-to-br ${tierColors[tier]}`} data-testid={`card-tier-${tier}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TierIcon className="w-4 h-4" />
                  {tierLabels[tier]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tierGroups[tier].length === 0 ? (
                  <p className="text-xs text-muted-foreground">No connectors</p>
                ) : (
                  <div className="space-y-1">
                    {tierGroups[tier].map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{c.name}</span>
                        <ConnectorStatusBadge status={c.status} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Retention Tier Connector Bindings */}
      {bindings.length > 0 && (
        <Card data-testid="card-retention-bindings">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Retention Tier Connector Bindings
              <span className="text-xs font-normal text-muted-foreground ml-1">— assigns warm/cold connectors per tenant</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Tenant</TableHead>
                    <TableHead className="font-medium">Warm Tier Connector</TableHead>
                    <TableHead className="font-medium">Cold Tier Connector</TableHead>
                    <TableHead className="font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bindings.map(b => (
                    <TableRow key={b.tenant_id} data-testid={`row-binding-${b.tenant_id}`}>
                      <TableCell className="font-medium text-sm">{b.tenant_name}</TableCell>
                      {editingBindingId === b.tenant_id ? (
                        <>
                          <TableCell>
                            <Select value={bindWarm} onValueChange={setBindWarm} data-testid={`select-warm-${b.tenant_id}`}>
                              <SelectTrigger className="h-7 text-xs w-44">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {connectors.filter(c => CONNECTOR_TIER[c.connector_type] === "warm").map(c => (
                                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={bindCold} onValueChange={setBindCold} data-testid={`select-cold-${b.tenant_id}`}>
                              <SelectTrigger className="h-7 text-xs w-44">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {connectors.filter(c => CONNECTOR_TIER[c.connector_type] === "cold").map(c => (
                                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="default" className="h-6 text-xs px-2"
                                data-testid={`button-save-binding-${b.tenant_id}`}
                                disabled={bindingMutation.isPending}
                                onClick={() => bindingMutation.mutate({
                                  tenantId: b.tenant_id,
                                  warmConnectorId: bindWarm === "none" ? null : parseInt(bindWarm),
                                  coldConnectorId: bindCold === "none" ? null : parseInt(bindCold),
                                })}>Save</Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                onClick={() => setEditingBindingId(null)}>Cancel</Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-sm">
                            {b.warm_connector_name ? (
                              <Badge variant="outline" className="text-[10px]">
                                {b.warm_connector_name}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {b.cold_connector_name ? (
                              <Badge variant="outline" className="text-[10px]">
                                {b.cold_connector_name}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="h-6 text-xs"
                              data-testid={`button-edit-binding-${b.tenant_id}`}
                              onClick={() => {
                                setEditingBindingId(b.tenant_id);
                                setBindWarm(b.warm_connector_id ? String(b.warm_connector_id) : "none");
                                setBindCold(b.cold_connector_id ? String(b.cold_connector_id) : "none");
                              }}>
                              <Pencil className="w-3 h-3 mr-1" />Edit
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : connectors.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ServerCog className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No connectors configured</p>
            <p className="text-xs mt-1">Add your first data source connector to get started</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ServerCog className="w-4 h-4" />
              Connector Registry
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Name</TableHead>
                    <TableHead className="font-medium">Type</TableHead>
                    <TableHead className="font-medium">Host</TableHead>
                    <TableHead className="font-medium">Database</TableHead>
                    <TableHead className="font-medium">Scope</TableHead>
                    <TableHead className="font-medium">Status</TableHead>
                    <TableHead className="font-medium">Last Tested</TableHead>
                    <TableHead className="font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectors.map(c => (
                    <TableRow key={c.id} className="hover:bg-muted/30" data-testid={`row-connector-${c.id}`}>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {CONNECTOR_TYPE_LABELS[c.connector_type] || c.connector_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.host ? `${c.host}${c.port ? `:${c.port}` : ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.database || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.scope === "global" ? "default" : "secondary"} className="text-[10px]">
                          {c.scope}
                        </Badge>
                      </TableCell>
                      <TableCell><ConnectorStatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.last_tested_at ? new Date(c.last_tested_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => testConnector(c.id)}
                            disabled={testingId === c.id}
                            data-testid={`button-test-connector-${c.id}`}
                          >
                            {testingId === c.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <PlayCircle className="w-3 h-3" />
                            )}
                            <span className="ml-1">Test</span>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            onClick={() => openEdit(c)}
                            data-testid={`button-edit-connector-${c.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" data-testid={`button-delete-connector-${c.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Connector</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove "{c.name}"? This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(c.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
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
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editConnector ? "Edit Connector" : "Add Data Connector"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Connector Name</Label>
                <Input id="name" name="name" required defaultValue={editConnector?.name || ""} placeholder="e.g. Production PostgreSQL" data-testid="input-connector-name" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={connectorType} onValueChange={setConnectorType}>
                  <SelectTrigger data-testid="select-connector-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OLTP / Relational</SelectLabel>
                      {(["postgresql","mysql","mariadb","mssql","timescaledb"] as const).map(val => (
                        <SelectItem key={val} value={val}>{CONNECTOR_TYPE_LABELS[val]}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data Warehouse / Lake</SelectLabel>
                      {(["clickhouse","snowflake","bigquery","redshift","databricks","iceberg"] as const).map(val => (
                        <SelectItem key={val} value={val}>{CONNECTOR_TYPE_LABELS[val]}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger data-testid="select-connector-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="tenant">Tenant-specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {scope === "tenant" && (
                <div>
                  <Label>Tenant</Label>
                  <Select value={connectorTenantId} onValueChange={setConnectorTenantId}>
                    <SelectTrigger data-testid="select-connector-tenant">
                      <SelectValue placeholder="Select a tenant…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTenantsForConnectors.map((t: Tenant) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="host">Host</Label>
                <Input id="host" name="host" defaultValue={editConnector?.host || ""} placeholder="hostname or IP" data-testid="input-connector-host" />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input id="port" name="port" type="number" defaultValue={editConnector?.port || ""} placeholder="5432" data-testid="input-connector-port" />
              </div>
              <div>
                <Label htmlFor="database">Database</Label>
                <Input id="database" name="database" defaultValue={editConnector?.database || ""} placeholder="database name" data-testid="input-connector-database" />
              </div>
              <div>
                <Label htmlFor="sslMode">SSL Mode</Label>
                <Select name="sslMode" defaultValue={editConnector?.ssl_mode || "prefer"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="credentialBlob" className="flex items-center justify-between">
                  Connection String / Credentials
                  <button type="button" onClick={() => setShowCred(s => !s)} className="text-xs text-muted-foreground">
                    {showCred ? <EyeOff className="w-3.5 h-3.5 inline" /> : <Eye className="w-3.5 h-3.5 inline" />}
                  </button>
                </Label>
                <Textarea
                  id="credentialBlob"
                  name="credentialBlob"
                  rows={3}
                  placeholder="postgresql://user:pass@host:5432/db or JSON credentials..."
                  defaultValue={editConnector ? "" : ""}
                  className={showCred ? "" : "[input-security:disc] text-security-disc"}
                  data-testid="input-connector-credentials"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Stored encrypted. Leave blank to keep existing.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-connector">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                {editConnector ? "Update" : "Add Connector"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const BEDROCK_REGIONS = [
  { value: "us-east-1",      label: "US East (N. Virginia)" },
  { value: "us-west-2",      label: "US West (Oregon)" },
  { value: "ap-south-1",     label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "eu-west-1",      label: "Europe (Ireland)" },
  { value: "eu-central-1",   label: "Europe (Frankfurt)" },
];

const BEDROCK_MODELS = [
  { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", name: "Claude 3.5 Sonnet v2",  family: "Anthropic" },
  { id: "anthropic.claude-3-haiku-20240307-v1:0",    name: "Claude 3 Haiku",         family: "Anthropic" },
  { id: "anthropic.claude-opus-4-5",                  name: "Claude Opus 4",           family: "Anthropic" },
  { id: "meta.llama3-70b-instruct-v1:0",              name: "Llama 3 70B",             family: "Meta"      },
  { id: "amazon.titan-text-premier-v1:0",             name: "Titan Text Premier",      family: "Amazon"    },
  { id: "mistral.mistral-large-2402-v1:0",            name: "Mistral Large",           family: "Mistral"   },
];

const AI_PROVIDERS = [
  { value: "openai",      label: "OpenAI",       description: "GPT-4o, GPT-4o-mini, and other OpenAI models" },
  { value: "bedrock",     label: "AWS Bedrock",  description: "Claude, Llama 3, Titan, Mistral — IAM auth, no API key" },
  { value: "anthropic",   label: "Anthropic",    description: "Claude models via Anthropic API" },
  { value: "azure",       label: "Azure OpenAI", description: "OpenAI models hosted on Azure" },
  { value: "vertex",      label: "Google Vertex AI", description: "Gemini and other Vertex models (requires proxy)" },
  { value: "grok",        label: "Grok (xAI)",   description: "Grok-2 and Grok-3 models by xAI — OpenAI-compatible" },
  { value: "deepseek",    label: "DeepSeek",     description: "DeepSeek-Chat and DeepSeek-Reasoner — cost-effective reasoning" },
  { value: "kimi",        label: "Kimi (Moonshot AI)", description: "Long-context Moonshot models up to 128k tokens" },
  { value: "zai",         label: "Z AI (Zhipu)",  description: "GLM-4 family by Zhipu AI — fast and reasoning variants" },
  { value: "ollama",      label: "Ollama",       description: "Local models via Ollama" },
  { value: "huggingface", label: "HuggingFace",  description: "HuggingFace Inference API" },
  { value: "custom",      label: "Custom (OpenAI-compatible)", description: "Any OpenAI-compatible endpoint" },
];

// Model family → default model ID for Bedrock
const BEDROCK_FAMILY_DEFAULTS: Record<string, string> = {
  Anthropic: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  Meta:      "meta.llama3-70b-instruct-v1:0",
  Amazon:    "amazon.titan-text-premier-v1:0",
  Mistral:   "mistral.mistral-large-2402-v1:0",
};

function AIProviderTab() {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedFamily, setSelectedFamily] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  // Empty string = not user-modified; safe to omit from save payload
  const [selectedRegion, setSelectedRegion] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [testResult, setTestResult] = useState<{ ok?: boolean; latencyMs?: number; error?: string; modelId?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: settings, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/ai-provider-settings"],
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/ai-provider-settings", data),
    onSuccess: () => {
      toast({ title: "AI Provider Updated", description: "Settings applied immediately. Restart is not required." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    },
  });

  const activeProvider = settings?.provider || "openai";
  const activeModel = settings?.model || "";
  const activeRegion = settings?.region || "us-east-1";

  const effectiveProvider = selectedProvider || activeProvider;

  // When the user picks a model family, auto-populate the model ID
  function handleFamilyChange(family: string) {
    setSelectedFamily(family);
    setSelectedModel(BEDROCK_FAMILY_DEFAULTS[family] ?? "");
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/ai-provider-test", {
        provider: effectiveProvider,
        model: selectedModel || activeModel,
        region: selectedRegion || activeRegion,
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  }

  function handleSave() {
    const payload: any = {};
    if (selectedProvider) payload.provider = selectedProvider;
    if (selectedModel)   payload.model    = selectedModel;
    if (selectedRegion && effectiveProvider === "bedrock") payload.region = selectedRegion;
    if (apiKey)          payload.apiKey   = apiKey;
    if (baseURL)         payload.baseURL  = baseURL;
    saveMutation.mutate(payload);
  }

  const providerBadgeColor = (p: string) => {
    if (p === "bedrock")     return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    if (p === "openai")      return "bg-green-500/10 text-green-400 border-green-500/30";
    if (p === "anthropic")   return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    if (p === "azure")       return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    if (p === "grok")        return "bg-gray-500/10 text-gray-300 border-gray-500/30";
    if (p === "deepseek")    return "bg-sky-500/10 text-sky-400 border-sky-500/30";
    if (p === "kimi")        return "bg-teal-500/10 text-teal-400 border-teal-500/30";
    if (p === "zai")         return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Active AI Provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64" /></div>
          ) : (
            <div className="flex flex-wrap gap-4 items-start">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Provider</p>
                <Badge
                  variant="outline"
                  className={`text-sm font-semibold px-3 py-1 ${providerBadgeColor(activeProvider)}`}
                  data-testid="badge-active-provider"
                >
                  {AI_PROVIDERS.find(p => p.value === activeProvider)?.label || activeProvider}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Model</p>
                <p className="text-sm font-mono text-foreground" data-testid="text-active-model">{activeModel || "(default)"}</p>
              </div>
              {activeProvider === "bedrock" && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Region</p>
                  <p className="text-sm text-foreground" data-testid="text-active-region">
                    {BEDROCK_REGIONS.find(r => r.value === activeRegion)?.label || activeRegion}
                  </p>
                </div>
              )}
              {settings?.envVars?.hasApiKey && activeProvider !== "bedrock" && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">API Key</p>
                  <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10">
                    <CheckCheck className="w-3 h-3 mr-1" /> Configured
                  </Badge>
                </div>
              )}
              {activeProvider === "bedrock" && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Auth</p>
                  <Badge variant="outline" className="text-orange-400 border-orange-500/30 bg-orange-500/10">
                    <Shield className="w-3 h-3 mr-1" /> IAM Role (no API key)
                  </Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudCog className="w-4 h-4 text-primary" />
            Configure Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selector */}
          <div className="space-y-1.5">
            <Label htmlFor="provider-select">AI Provider</Label>
            <Select
              value={selectedProvider || activeProvider}
              onValueChange={setSelectedProvider}
            >
              <SelectTrigger id="provider-select" data-testid="select-ai-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value} data-testid={`option-provider-${p.value}`}>
                    <div>
                      <span className="font-medium">{p.label}</span>
                      <span className="text-muted-foreground text-xs ml-2">— {p.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bedrock-specific: region + model family */}
          {effectiveProvider === "bedrock" && (
            <>
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 flex gap-2">
                <Shield className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  AWS Bedrock uses IAM role credentials — no API key is required.
                  Ensure the ECS Task Role has <code className="font-mono bg-muted px-1 rounded">bedrock:InvokeModel</code> permissions,
                  or deploy with <code className="font-mono bg-muted px-1 rounded">EnableBedrock=true</code>.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bedrock-region">
                    AWS Region
                    {!selectedRegion && activeRegion && (
                      <span className="text-muted-foreground text-xs ml-2">(current: {activeRegion})</span>
                    )}
                  </Label>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger id="bedrock-region" data-testid="select-bedrock-region">
                      <SelectValue placeholder={`${activeRegion} (unchanged)`} />
                    </SelectTrigger>
                    <SelectContent>
                      {BEDROCK_REGIONS.map(r => (
                        <SelectItem key={r.value} value={r.value} data-testid={`option-region-${r.value}`}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bedrock-family">Model Family</Label>
                  <Select value={selectedFamily} onValueChange={handleFamilyChange}>
                    <SelectTrigger id="bedrock-family" data-testid="select-bedrock-family">
                      <SelectValue placeholder="Pick a family…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(BEDROCK_FAMILY_DEFAULTS).map(fam => (
                        <SelectItem key={fam} value={fam} data-testid={`option-family-${fam}`}>
                          {fam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Model ID row — auto-filled when a family is chosen, editable for custom IDs */}
              <div className="space-y-1.5">
                <Label htmlFor="bedrock-model-id">
                  Model ID
                  {selectedFamily && (
                    <Badge variant="outline" className="ml-2 text-xs text-orange-400 border-orange-500/30">
                      auto-filled from {selectedFamily}
                    </Badge>
                  )}
                  {!selectedFamily && activeModel && (
                    <span className="text-muted-foreground text-xs ml-2">(current: {activeModel})</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="bedrock-model-id"
                    className="font-mono text-sm"
                    placeholder={activeModel || "anthropic.claude-3-5-sonnet-20241022-v2:0"}
                    value={selectedModel}
                    onChange={e => { setSelectedModel(e.target.value); setSelectedFamily(""); }}
                    data-testid="input-bedrock-model-id"
                  />
                  {selectedModel && (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => { setSelectedModel(""); setSelectedFamily(""); }}
                      data-testid="button-clear-model"
                      title="Clear (keep existing)"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a family above to auto-fill, or type a fully-qualified Bedrock model ID.
                  Leave blank to keep the current model.
                </p>
              </div>
            </>
          )}

          {/* Non-Bedrock: API key and optional base URL */}
          {effectiveProvider !== "bedrock" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-key-input">
                  API Key
                  {settings?.envVars?.hasApiKey && (
                    <Badge variant="outline" className="ml-2 text-xs text-green-400 border-green-500/30">currently set</Badge>
                  )}
                </Label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder={settings?.envVars?.hasApiKey ? "••••••••••• (leave blank to keep existing)" : "sk-..."}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  data-testid="input-api-key"
                />
              </div>
              {(effectiveProvider === "custom" || effectiveProvider === "azure" || effectiveProvider === "ollama") && (
                <div className="space-y-1.5">
                  <Label htmlFor="base-url-input">Base URL</Label>
                  <Input
                    id="base-url-input"
                    placeholder={effectiveProvider === "ollama" ? "http://localhost:11434/v1" : "https://api.example.com/v1"}
                    value={baseURL}
                    onChange={e => setBaseURL(e.target.value)}
                    data-testid="input-base-url"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="model-input">Model ID (optional)</Label>
                <Input
                  id="model-input"
                  placeholder={effectiveProvider === "openai" ? "gpt-4o-mini" : ""}
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  data-testid="input-model-id"
                />
              </div>
            </div>
          )}

          {/* Test Connection result */}
          {testResult && (
            <div className={`rounded-lg border p-3 flex gap-2 items-start ${testResult.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              {testResult.ok
                ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              <div className="text-sm">
                {testResult.ok ? (
                  <p className="text-green-400">
                    Connected successfully
                    {testResult.latencyMs && <span className="text-muted-foreground ml-2">({testResult.latencyMs}ms)</span>}
                    {testResult.modelId && <span className="text-muted-foreground ml-2">· {testResult.modelId}</span>}
                  </p>
                ) : (
                  <p className="text-red-400">{testResult.error || "Connection failed"}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting}
              data-testid="button-test-connection"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Test Connection
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-ai-settings"
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Apply Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bedrock Model Reference */}
      {effectiveProvider === "bedrock" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-400" />
              Bedrock Foundation Models Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Best For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Claude 3.5 Sonnet v2", family: "Anthropic", id: "anthropic.claude-3-5-sonnet-20241022-v2:0", use: "Security analysis, report generation, complex reasoning" },
                  { name: "Claude 3 Haiku",        family: "Anthropic", id: "anthropic.claude-3-haiku-20240307-v1:0",    use: "Fast triage, real-time chat, high-volume enrichment" },
                  { name: "Claude Opus 4",          family: "Anthropic", id: "anthropic.claude-opus-4-5",                  use: "Deep investigation, executive briefings" },
                  { name: "Llama 3 70B",            family: "Meta",      id: "meta.llama3-70b-instruct-v1:0",              use: "Open-source alternative, cost-effective inference" },
                  { name: "Titan Text Premier",     family: "Amazon",    id: "amazon.titan-text-premier-v1:0",              use: "AWS-native workloads, summarisation" },
                  { name: "Mistral Large",          family: "Mistral",   id: "mistral.mistral-large-2402-v1:0",             use: "European data residency, multilingual" },
                ].map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.family}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.use}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Grok Model Reference */}
      {effectiveProvider === "grok" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-gray-400" />
              Grok (xAI) Model Reference
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Base URL: <span className="font-mono">https://api.x.ai/v1</span> — OpenAI-compatible</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Best For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Grok-2 Latest",  family: "xAI", id: "grok-2-latest",  use: "General-purpose flagship; balanced speed and capability" },
                  { name: "Grok-3 Mini",    family: "xAI", id: "grok-3-mini",    use: "Fast, cost-effective reasoning for high-volume triage" },
                  { name: "Grok-3",         family: "xAI", id: "grok-3",         use: "Advanced reasoning and complex security analysis" },
                ].map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.family}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.use}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* DeepSeek Model Reference */}
      {effectiveProvider === "deepseek" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              DeepSeek Model Reference
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Base URL: <span className="font-mono">https://api.deepseek.com/v1</span> — OpenAI-compatible</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Best For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "DeepSeek Chat",     family: "DeepSeek", id: "deepseek-chat",     use: "General-purpose analysis, enrichment, report generation" },
                  { name: "DeepSeek Reasoner", family: "DeepSeek", id: "deepseek-reasoner", use: "Step-by-step reasoning, threat investigation, RCA" },
                ].map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.family}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.use}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Kimi (Moonshot AI) Model Reference */}
      {effectiveProvider === "kimi" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-400" />
              Kimi (Moonshot AI) Model Reference
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Base URL: <span className="font-mono">https://api.moonshot.cn/v1</span> — OpenAI-compatible</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Best For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Moonshot v1 8K",   family: "Moonshot AI", id: "moonshot-v1-8k",   ctx: "8 K",   use: "Fast triage, alerts, short enrichments" },
                  { name: "Moonshot v1 32K",  family: "Moonshot AI", id: "moonshot-v1-32k",  ctx: "32 K",  use: "Standard analysis, playbook execution" },
                  { name: "Moonshot v1 128K", family: "Moonshot AI", id: "moonshot-v1-128k", ctx: "128 K", use: "Long log analysis, multi-event correlation" },
                ].map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.family}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs font-mono">{m.ctx}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.use}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Z AI (Zhipu) Model Reference */}
      {effectiveProvider === "zai" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Z AI (Zhipu GLM) Model Reference
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Base URL: <span className="font-mono">https://open.bigmodel.cn/api/paas/v4/</span> — OpenAI-compatible</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Best For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "GLM-4",        family: "Zhipu AI", id: "glm-4",        use: "Flagship — deep analysis, complex SOC workflows" },
                  { name: "GLM-4 Flash",  family: "Zhipu AI", id: "glm-4-flash",  use: "Fast, cost-effective triage and enrichment" },
                  { name: "GLM-Z1 Flash", family: "Zhipu AI", id: "glm-z1-flash", use: "Lightweight reasoning, structured output" },
                ].map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.family}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.use}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Platform Integrations Tab (#135) ─────────────────────────────────────────
interface PlatformIntegration {
  id: number;
  name: string;
  displayName: string;
  category: string;
  description: string;
  enabled: boolean;
  requiresKey: boolean;
  keyConfigured: boolean;
  maskedHint: string | null;
  lastTestedAt: string | null;
  testStatus: "ok" | "error" | "untested";
  testMessage: string | null;
  updatedAt: string;
}

const FEED_ICONS: Record<string, React.ReactNode> = {
  malwarebazaar:  <Shield className="w-5 h-5 text-red-400" />,
  urlhaus:        <Globe className="w-5 h-5 text-orange-400" />,
  feodo_tracker:  <ServerCog className="w-5 h-5 text-yellow-400" />,
  alienvault_otx: <Eye className="w-5 h-5 text-blue-400" />,
  virustotal:     <FlaskConical className="w-5 h-5 text-purple-400" />,
  threatfox:      <AlertTriangle className="w-5 h-5 text-red-400" />,
  greynoise:      <Activity className="w-5 h-5 text-green-400" />,
  shodan:         <Search className="w-5 h-5 text-cyan-400" />,
  urlscan_io:     <Globe className="w-5 h-5 text-blue-400" />,
  anyrun:         <Bug className="w-5 h-5 text-red-400" />,
  hybrid_analysis:<Layers className="w-5 h-5 text-orange-400" />,
  joe_sandbox:    <FlaskConical className="w-5 h-5 text-yellow-400" />,
  hatching_triage:<Zap className="w-5 h-5 text-purple-400" />,
  intezer_analyze:<Cpu className="w-5 h-5 text-blue-400" />,
  vmray:          <ShieldCheck className="w-5 h-5 text-green-400" />,
};

const SANDBOX_CAPABILITIES: Record<string, string[]> = {
  anyrun:          ["Interactive Sandbox", "Behavioral Analysis", "Network Analysis"],
  hybrid_analysis: ["AI Analysis", "MITRE ATT&CK Mapping", "Behavioral Analysis"],
  joe_sandbox:     ["AI Analysis", "Code Analysis", "Network Analysis"],
  hatching_triage: ["High-Throughput Sandbox", "YARA/Suricata", "Behavioral Analysis"],
  intezer_analyze: ["Gene-Based Analysis", "Code Reuse Detection", "Threat Actor Attribution"],
  vmray:           ["Agentless Sandbox", "VTI Scoring", "Evasion-Resistant"],
};

function PlatformIntegrationsTab() {
  const { toast } = useToast();
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testingName, setTestingName] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs: number; message: string }>>({});

  const { data: integrations, isLoading, refetch } = useQuery<PlatformIntegration[]>({
    queryKey: ["/api/admin/platform-integrations"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, body }: { name: string; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/admin/platform-integrations/${name}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-integrations"] });
      toast({ title: "Integration updated", description: "Changes saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleTest(name: string) {
    setTestingName(name);
    try {
      const res = await apiRequest("POST", `/api/admin/platform-integrations/${name}/test`, {});
      const data = await res.json() as { ok: boolean; latencyMs: number; message: string };
      setTestResults(prev => ({ ...prev, [name]: data }));
      refetch();
      toast({
        title: data.ok ? "Test passed" : "Test failed",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Test error", description: err.message, variant: "destructive" });
    } finally {
      setTestingName(null);
    }
  }

  function handleToggle(integration: PlatformIntegration) {
    updateMutation.mutate({ name: integration.name, body: { enabled: !integration.enabled } });
  }

  function handleSaveKey(name: string) {
    const key = apiKeyInputs[name]?.trim();
    if (!key) return;
    updateMutation.mutate({
      name,
      body: { apiKey: key },
    });
    setApiKeyInputs(prev => ({ ...prev, [name]: "" }));
  }

  function handleClearKey(name: string) {
    updateMutation.mutate({ name, body: { apiKey: "" } });
  }

  const grouped: Record<string, PlatformIntegration[]> = {};
  for (const integration of integrations ?? []) {
    if (!grouped[integration.category]) grouped[integration.category] = [];
    grouped[integration.category].push(integration);
  }

  const categoryLabels: Record<string, string> = {
    threat_intel: "Threat Intelligence Feeds",
    malware_sandbox: "Malware Sandboxes",
    notification:  "Notifications",
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1">
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          Platform-wide third-party service integrations. API keys are stored securely in the database — not in environment variables.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Note: API keys are stored as plain text in the database. Restrict access to this portal accordingly.
        </p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            {category === "threat_intel" ? <Shield className="w-4 h-4" />
              : category === "malware_sandbox" ? <Bug className="w-4 h-4" />
              : <Bell className="w-4 h-4" />}
            {categoryLabels[category] ?? category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map(integration => {
              const isTestingThis = testingName === integration.name;
              const testResult = testResults[integration.name];
              const lastResult = testResult ?? (integration.testStatus !== "untested" ? { ok: integration.testStatus === "ok", message: integration.testMessage ?? "", latencyMs: 0 } : null);

              return (
                <Card key={integration.name} className={`border ${integration.enabled ? "border-border" : "border-border/40 opacity-70"}`} data-testid={`card-integration-${integration.name}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          {FEED_ICONS[integration.name] ?? <Plug className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold leading-tight">{integration.displayName}</CardTitle>
                          <Badge variant="outline" className="text-[10px] mt-0.5 font-normal">
                            {categoryLabels[integration.category] ?? integration.category}
                          </Badge>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggle(integration)}
                        className="flex-shrink-0 mt-0.5"
                        title={integration.enabled ? "Click to disable" : "Click to enable"}
                        data-testid={`toggle-integration-${integration.name}`}
                      >
                        {integration.enabled
                          ? <ToggleRight className="w-7 h-7 text-green-500" />
                          : <ToggleLeft className="w-7 h-7 text-muted-foreground/50" />}
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <p className="text-xs text-muted-foreground leading-relaxed">{integration.description}</p>

                    {/* Status row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {integration.enabled ? (
                        <Badge className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                      )}
                      {integration.requiresKey && (
                        integration.keyConfigured ? (
                          <Badge className="text-[10px] bg-blue-500/15 text-blue-400 border-blue-500/30">
                            Key: …{integration.maskedHint?.slice(-4)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">No Key</Badge>
                        )
                      )}
                      {lastResult && (
                        <Badge className={`text-[10px] ${lastResult.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                          {lastResult.ok ? <CheckCircle2 className="w-2.5 h-2.5 mr-1 inline" /> : <XCircle className="w-2.5 h-2.5 mr-1 inline" />}
                          {lastResult.ok ? "Pass" : "Fail"}
                          {lastResult.latencyMs > 0 && ` · ${lastResult.latencyMs}ms`}
                        </Badge>
                      )}
                    </div>

                    {/* Capability badges — shown for malware sandbox integrations */}
                    {integration.category === "malware_sandbox" && SANDBOX_CAPABILITIES[integration.name] && (
                      <div className="flex flex-wrap gap-1">
                        {SANDBOX_CAPABILITIES[integration.name].map((cap, ci) => (
                          <span key={ci} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-700/30 font-medium">
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* API key input — only for key-requiring integrations */}
                    {integration.requiresKey && integration.enabled && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">API Key</label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <Input
                              type={showKey[integration.name] ? "text" : "password"}
                              placeholder={integration.keyConfigured ? "Enter new key to replace…" : "Paste API key here…"}
                              value={apiKeyInputs[integration.name] ?? ""}
                              onChange={e => setApiKeyInputs(prev => ({ ...prev, [integration.name]: e.target.value }))}
                              className="text-xs pr-8 font-mono"
                              data-testid={`input-apikey-${integration.name}`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowKey(prev => ({ ...prev, [integration.name]: !prev[integration.name] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showKey[integration.name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <Button
                            size="sm"
                            className="text-xs px-2.5"
                            onClick={() => handleSaveKey(integration.name)}
                            disabled={!apiKeyInputs[integration.name]?.trim() || updateMutation.isPending}
                            data-testid={`button-save-key-${integration.name}`}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          {integration.keyConfigured && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs px-2"
                              onClick={() => handleClearKey(integration.name)}
                              disabled={updateMutation.isPending}
                              title="Remove API key"
                              data-testid={`button-clear-key-${integration.name}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {lastResult?.message && (
                          <p className={`text-[10px] ${lastResult.ok ? "text-green-400" : "text-red-400"}`}>
                            {lastResult.message}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Test + metadata footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <div className="text-[10px] text-muted-foreground/60">
                        {integration.lastTestedAt
                          ? `Tested ${new Date(integration.lastTestedAt).toLocaleDateString()}`
                          : "Never tested"}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => handleTest(integration.name)}
                        disabled={!integration.enabled || isTestingThis || (integration.requiresKey && !integration.keyConfigured)}
                        data-testid={`button-test-${integration.name}`}
                      >
                        {isTestingThis
                          ? <><Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />Testing…</>
                          : <><FlaskConical className="w-2.5 h-2.5 mr-1" />Test</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Placeholder: Notifications section */}
      {!grouped["notification"] && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </h3>
          <Card className="border border-dashed border-border/50 bg-muted/20">
            <CardContent className="py-8 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No notification integrations configured yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">SMTP, Slack, and Teams integrations coming soon.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <div className="p-6 overflow-y-auto h-full max-w-7xl mx-auto">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full max-w-6xl grid-cols-10 mb-6" data-testid="tabs-admin-portal">
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
          <TabsTrigger value="retention" data-testid="tab-retention">
            <Database className="w-3.5 h-3.5 mr-1.5" />
            Data Retention
          </TabsTrigger>
          <TabsTrigger value="data-infra" data-testid="tab-data-infra">
            <ServerCog className="w-3.5 h-3.5 mr-1.5" />
            Data Infrastructure
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <HeartPulse className="w-3.5 h-3.5 mr-1.5" />
            Platform Health
          </TabsTrigger>
          <TabsTrigger value="ai-provider" data-testid="tab-ai-provider">
            <Cpu className="w-3.5 h-3.5 mr-1.5" />
            AI Provider
          </TabsTrigger>
          <TabsTrigger value="ai-learning" data-testid="tab-ai-learning">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            AI Learning
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-platform-integrations">
            <Plug className="w-3.5 h-3.5 mr-1.5" />
            Integrations
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
        <TabsContent value="retention">
          <DataRetentionTab />
        </TabsContent>
        <TabsContent value="data-infra">
          <DataInfrastructureTab />
        </TabsContent>
        <TabsContent value="health">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}>
            <PlatformHealthTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="ai-provider">
          <AIProviderTab />
        </TabsContent>
        <TabsContent value="ai-learning">
          <AILearningAdminTab />
        </TabsContent>
        <TabsContent value="integrations">
          <PlatformIntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── AI Learning Admin Tab ─────────────────────────────────────────────────────
interface TenantRow { id: number; name: string; industry?: string; }
interface TenantLearningStats {
  totalFeedback: number;
  tpCount: number;
  fpCount: number;
  aiAccuracy: number | null;
  accuracyPercent: number | null;
  hasContext: boolean;
  fewShotExamples?: string | null;
  decisionsThisWeek: number;
  totalDecisions: number;
  topMisclassified?: Array<{ source: string; count: number }>;
  lastDigestAt?: string | null;
}

function AILearningAdminTab() {
  const { toast } = useToast();
  const { data: tenants = [] } = useQuery<TenantRow[]>({
    queryKey: ["/api/tenant-admin/tenants"],
  });

  const resetMutation = useMutation({
    mutationFn: async (tenantId: number) => {
      const res = await apiRequest("POST", `/api/ai-learning/reset/${tenantId}`, {});
      return res.json();
    },
    onSuccess: (_data, tenantId) => {
      toast({ title: "Learning Context Reset", description: `AI learning context for tenant #${tenantId} has been reset.` });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-learning/stats"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset learning context.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Adaptive AI Learning Loop</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Per-tenant analyst feedback capture, triage context enrichment, and learning digest management.
          Reset a tenant's learning context to clear accumulated feedback and start fresh.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">How It Works</p>
            <p className="text-sm text-foreground leading-relaxed">
              Every TP/FP classification by an analyst is captured and stored. Nightly digests synthesize 
              feedback into few-shot examples that are injected into triage prompts for that tenant.
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Digest Schedule</p>
            <p className="text-sm text-foreground leading-relaxed">
              Learning digests run automatically at <strong>02:00 UTC</strong> every night. You can also 
              trigger a manual digest from the AI Learning card on the MSS dashboard.
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Context Reset</p>
            <p className="text-sm text-foreground leading-relaxed">
              Resetting a tenant's context clears synthesized few-shot examples but preserves raw feedback 
              history for audit purposes. The next digest will rebuild from scratch.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm">Per-Tenant Learning Context</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No tenants found.</p>
            ) : (
              tenants.map((tenant) => (
                <TenantLearningRow
                  key={tenant.id}
                  tenant={tenant}
                  onReset={() => resetMutation.mutate(tenant.id)}
                  isResetting={resetMutation.isPending && resetMutation.variables === tenant.id}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TenantLearningRow({ tenant, onReset, isResetting }: { tenant: TenantRow; onReset: () => void; isResetting: boolean }) {
  const [showContext, setShowContext] = useState(false);

  const { data: stats } = useQuery<TenantLearningStats | null>({
    queryKey: ["/api/ai-learning/stats", tenant.id],
    queryFn: async () => {
      const res = await fetch(`/api/ai-learning/stats/${tenant.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json() as Promise<TenantLearningStats>;
    },
  });

  const contextText: string | null = stats?.fewShotExamples ?? null;
  const contextPreview = contextText ? (contextText.length > 300 ? contextText.slice(0, 300) + "…" : contextText) : null;

  return (
    <div className="px-4 py-3 space-y-2" data-testid={`ai-learning-row-${tenant.id}`}>
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{tenant.name || `Tenant #${tenant.id}`}</p>
          <p className="text-xs text-muted-foreground">{tenant.industry || "No industry"} · ID: {tenant.id}</p>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground shrink-0">
          {stats ? (
            <>
              <div className="text-center">
                <p className="font-semibold text-foreground">{stats.totalFeedback ?? 0}</p>
                <p>Feedbacks</p>
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">{stats.tpCount ?? 0} / {stats.fpCount ?? 0}</p>
                <p>TP / FP</p>
              </div>
              <div className="text-center">
                <p className={`font-semibold ${(stats.aiAccuracy ?? 0) >= 80 ? "text-green-400" : (stats.aiAccuracy ?? 0) >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {stats.aiAccuracy != null ? `${stats.aiAccuracy}%` : "—"}
                </p>
                <p>AI Accuracy</p>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setShowContext(v => !v)}
                  disabled={!contextText}
                  className="font-semibold text-foreground hover:text-primary transition-colors disabled:cursor-default"
                  data-testid={`button-view-context-${tenant.id}`}
                  title={contextText ? "Click to view learning context" : "No context accumulated yet"}
                >
                  {stats.hasContext ? "Active" : "None"}
                </button>
                <p>{stats.hasContext ? (showContext ? "▲ Context" : "▼ Context") : "Context"}</p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </div>
        <button
          onClick={onReset}
          disabled={isResetting}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors disabled:opacity-50"
          data-testid={`button-reset-learning-${tenant.id}`}
        >
          {isResetting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reset Context
        </button>
      </div>
      {showContext && contextPreview && (
        <div className="ml-0 mr-0 bg-muted/30 border border-border rounded-md p-3" data-testid={`context-viewer-${tenant.id}`}>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Few-Shot Learning Context</p>
          <pre className="text-[11px] text-foreground whitespace-pre-wrap font-mono leading-relaxed">{contextPreview}</pre>
          {contextText && contextText.length > 300 && (
            <p className="text-[10px] text-muted-foreground mt-1">{contextText.length} chars total — showing first 300</p>
          )}
        </div>
      )}
    </div>
  );
}
