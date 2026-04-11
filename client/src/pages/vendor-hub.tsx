import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SECURITY_PLATFORMS, PLATFORM_AUTH_FIELDS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Cpu, Server, Cloud, Database, Shield, CheckCircle2, XCircle,
  Clock, Plug, RefreshCw, Plus, Search, Zap, Activity,
  Eye, EyeOff, Settings, BarChart3, HardDrive, Globe,
  Loader2, ChevronRight, AlertTriangle, Package,
} from "lucide-react";
import {
  SiDell, SiHp, SiLenovo, SiIntel, SiNvidia,
  SiVmware, SiAmazonwebservices, SiGooglecloud,
} from "react-icons/si";

function MicrosoftLogo({ size = 22 }: { size?: number }) {
  const s = size * 0.45;
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function AzureLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.05 4.24L6.56 18.05l2.91.87 5.55-9.73 2.37 6.63H12l-.96 1.9H20L13.05 4.24z" fill="#0089D6"/>
      <path d="M5.39 18.01L9.82 7.76l2.1 5.88-3.62 4.13-2.91.24z" fill="#0089D6" opacity=".8"/>
    </svg>
  );
}

// ── All hardware/infra platforms from schema ────────────────────────────────
const HARDWARE_PLATFORMS = SECURITY_PLATFORMS.filter(p => p.category === "hardware_infra");

// ── Vendor visual definitions ──────────────────────────────────────────────
const VENDOR_META: Record<string, {
  logo: any; vendor: string; badge: string; tag: string; features: string[];
}> = {
  dell_ome: {
    logo: SiDell, vendor: "Dell Technologies", badge: "On-Premises",
    tag: "Server Management",
    features: ["Hardware inventory", "Firmware lifecycle", "iDRAC integration", "Alert correlation"],
  },
  dell_idrac: {
    logo: SiDell, vendor: "Dell Technologies", badge: "Out-of-Band",
    tag: "iDRAC / Redfish",
    features: ["BIOS/firmware versions", "Hardware telemetry", "Warranty data", "Power metrics"],
  },
  hpe_ilo: {
    logo: SiHp, vendor: "Hewlett Packard Enterprise", badge: "On-Premises",
    tag: "iLO Management",
    features: ["Server health events", "Firmware versions", "Thermal & power", "IML log ingestion"],
  },
  hpe_oneview: {
    logo: SiHp, vendor: "Hewlett Packard Enterprise", badge: "On-Premises",
    tag: "Composable Infra",
    features: ["Server, storage, network unified", "Template compliance", "Activity log", "Scope-based RBAC"],
  },
  lenovo_xclarity: {
    logo: SiLenovo, vendor: "Lenovo", badge: "On-Premises",
    tag: "XClarity Administrator",
    features: ["ThinkSystem inventory", "Firmware compliance", "Power telemetry", "BMC event ingestion"],
  },
  intel_vpro: {
    logo: SiIntel, vendor: "Intel Corporation", badge: "In-Band / OOB",
    tag: "vPro / AMT",
    features: ["CPU asset discovery", "AMT inventory", "Hardware posture", "Remote KVM metadata"],
  },
  nvidia_ngc: {
    logo: SiNvidia, vendor: "NVIDIA", badge: "Cloud / On-Prem",
    tag: "GPU Telemetry",
    features: ["GPU inventory & drivers", "Utilization telemetry", "Security advisories", "NGC catalog sync"],
  },
  ms_intune: {
    logo: MicrosoftLogo, vendor: "Microsoft", badge: "Cloud SaaS",
    tag: "Intune / Graph API",
    features: ["Device compliance", "OS patch levels", "App inventory", "Hardware metadata via Graph"],
  },
  ms_sccm: {
    logo: MicrosoftLogo, vendor: "Microsoft", badge: "On-Premises",
    tag: "SCCM / ConfigMgr",
    features: ["Full SW/HW inventory", "Patch compliance", "Collection membership", "Deployment status"],
  },
  vmware_vcenter: {
    logo: SiVmware, vendor: "Broadcom / VMware", badge: "On-Premises",
    tag: "vCenter / vSphere",
    features: ["VM inventory", "ESXi host hardware", "Network topology", "Snapshot hygiene"],
  },
  vmware_aria: {
    logo: SiVmware, vendor: "Broadcom / VMware", badge: "Hybrid",
    tag: "Aria (vRealize)",
    features: ["Multi-cloud discovery", "Cost & performance", "Config drift detection", "Policy compliance"],
  },
  aws_ssm: {
    logo: SiAmazonwebservices, vendor: "Amazon Web Services", badge: "Cloud",
    tag: "Systems Manager",
    features: ["EC2 instance inventory", "Patch compliance", "Parameter store", "Session manager logs"],
  },
  aws_config: {
    logo: SiAmazonwebservices, vendor: "Amazon Web Services", badge: "Cloud",
    tag: "Config / Security Hub",
    features: ["Resource compliance rules", "Config history", "GuardDuty findings", "Security Hub ASFF"],
  },
  azure_arc: {
    logo: AzureLogo, vendor: "Microsoft Azure", badge: "Hybrid Cloud",
    tag: "Azure Arc",
    features: ["On-prem server inventory", "Arc-enabled Kubernetes", "Policy at scale", "Update Manager"],
  },
  azure_resource: {
    logo: AzureLogo, vendor: "Microsoft Azure", badge: "Cloud",
    tag: "Resource Manager",
    features: ["Azure resource inventory", "VM metadata & tags", "RBAC assignments", "Policy compliance"],
  },
  gcp_asset: {
    logo: SiGooglecloud, vendor: "Google Cloud", badge: "Cloud",
    tag: "Cloud Asset Inventory",
    features: ["GCP resource graph", "IAM policy analysis", "Asset history timeline", "SCC integration"],
  },
  gcp_scc: {
    logo: SiGooglecloud, vendor: "Google Cloud", badge: "Cloud",
    tag: "Security Command Center",
    features: ["Vulnerability findings", "Misconfig detection", "Threat intelligence", "Asset risk scoring"],
  },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  connected: { color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Connected", icon: CheckCircle2 },
  disconnected: { color: "text-muted-foreground", bg: "bg-muted/40 border-border", label: "Disconnected", icon: Plug },
  error: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", label: "Error", icon: XCircle },
  pending: { color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", label: "Pending", icon: Clock },
};

function VendorLogo({ platformKey, size = 28 }: { platformKey: string; size?: number }) {
  const meta = VENDOR_META[platformKey];
  if (meta?.logo) {
    const Logo = meta.logo;
    return <Logo size={size} className="opacity-90" />;
  }
  return <Package size={size} />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// Connection dialog
function ConnectDialog({
  platform, existingIntegration, open, onClose, tenantId,
}: {
  platform: typeof HARDWARE_PLATFORMS[number];
  existingIntegration?: any;
  open: boolean;
  onClose: () => void;
  tenantId: number;
}) {
  const { toast } = useToast();
  const authConfig = PLATFORM_AUTH_FIELDS[platform.key];
  const [url, setUrl] = useState(existingIntegration?.apiUrl || "");
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const saved = (existingIntegration?.configJson as any) || {};
    const init: Record<string, string> = {};
    authConfig?.fields.forEach(f => { init[f.key] = saved[f.key] || ""; });
    return init;
  });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/tenants/${tenantId}/security-integrations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Integration saved", description: `${platform.name} configured successfully.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/security-integrations/${existingIntegration?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Integration updated", description: `${platform.name} settings saved.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSave() {
    const configJson = { ...fields };
    const payload = {
      platformKey: platform.key,
      platformName: platform.name,
      category: platform.category,
      apiUrl: authConfig?.hideUrl ? "" : url,
      configJson,
      status: "disconnected",
    };
    if (existingIntegration) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <VendorLogo platformKey={platform.key} size={22} />
            </div>
            <div>
              <DialogTitle className="text-base">{existingIntegration ? "Update" : "Connect"} {platform.name}</DialogTitle>
              <DialogDescription className="text-[11px]">{platform.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!authConfig?.hideUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs">{authConfig?.urlLabel || "API URL"}</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={authConfig?.urlPlaceholder || "https://..."}
                className="text-sm font-mono"
                data-testid="input-vendor-url"
              />
              {authConfig?.urlHelpText && (
                <p className="text-[10px] text-muted-foreground">{authConfig.urlHelpText}</p>
              )}
            </div>
          )}
          {authConfig?.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
              <div className="relative">
                <Input
                  type={field.type === "password" && !showPasswords[field.key] ? "password" : "text"}
                  value={fields[field.key] || ""}
                  onChange={e => setFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="text-sm pr-8 font-mono"
                  data-testid={`input-vendor-${field.key}`}
                />
                {field.type === "password" && (
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="absolute right-1 top-1 h-7 w-7"
                    onClick={() => setShowPasswords(p => ({ ...p, [field.key]: !p[field.key] }))}
                  >
                    {showPasswords[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
              {field.helpText && <p className="text-[10px] text-muted-foreground">{field.helpText}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending} data-testid="button-save-vendor">
            {isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plug className="w-4 h-4 mr-1.5" />}
            {existingIntegration ? "Update" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main page
export default function VendorHubPage() {
  const { currentTenant, isMSS } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.id;
  const [search, setSearch] = useState("");
  const [connectingPlatform, setConnectingPlatform] = useState<typeof HARDWARE_PLATFORMS[number] | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [pullingId, setPullingId] = useState<number | null>(null);

  const { data: integrations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations"],
    queryFn: async () => {
      if (!tenantId) return [];
      const r = await fetch(`/api/tenants/${tenantId}/security-integrations`, { credentials: "include" });
      if (!r.ok) return [];
      const all = await r.json();
      return all.filter((i: any) => i.category === "hardware_infra");
    },
    enabled: !!tenantId,
    staleTime: 15000,
  });

  const integrationMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const i of integrations) m[i.platformKey] = i;
    return m;
  }, [integrations]);

  async function testConnection(integration: any) {
    setTestingId(integration.id);
    try {
      const res = await apiRequest("POST", `/api/security-integrations/${integration.id}/test-connection`);
      const data = await res.json();
      toast({
        title: data.success ? "Connection successful" : "Connection failed",
        description: data.message || (data.success ? "Vendor API is reachable." : "Check credentials and URL."),
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  }

  async function pullData(integration: any) {
    setPullingId(integration.id);
    try {
      const res = await apiRequest("POST", `/api/security-integrations/${integration.id}/pull-data`);
      const data = await res.json();
      toast({
        title: data.success ? "Data pulled" : "Pull complete",
        description: data.message || `${data.eventsImported ?? 0} items imported.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
    } catch (e: any) {
      toast({ title: "Pull failed", description: e.message, variant: "destructive" });
    } finally {
      setPullingId(null);
    }
  }

  const connectedCount = integrations.filter(i => i.status === "connected").length;
  const totalImported = integrations.reduce((s, i) => s + (i.eventsImported || 0), 0);

  const filtered = HARDWARE_PLATFORMS.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (VENDOR_META[p.key]?.vendor || "").toLowerCase().includes(search.toLowerCase()) ||
    (VENDOR_META[p.key]?.tag || "").toLowerCase().includes(search.toLowerCase())
  );

  // Group by vendor
  const grouped = useMemo(() => {
    const g: Record<string, typeof HARDWARE_PLATFORMS[number][]> = {};
    for (const p of filtered) {
      const v = VENDOR_META[p.key]?.vendor || "Other";
      if (!g[v]) g[v] = [];
      g[v].push(p);
    }
    return g;
  }, [filtered]);

  if (!tenantId) return null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="vendor-hub-page">

      {/* Page Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border dark:border-white/10 bg-gradient-to-br from-card via-primary/10 to-card dark:from-slate-900 dark:via-primary/10 dark:to-slate-900 p-6 shadow-xl">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-primary/5 rounded-full blur-2xl" />
          <svg className="absolute right-8 top-6 opacity-5" width="180" height="180" viewBox="0 0 180 180">
            <rect x="10" y="10" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="70" y="10" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="130" y="10" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="10" y="70" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="70" y="70" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
            <line x1="60" y1="35" x2="70" y2="35" stroke="currentColor" strokeWidth="0.5" />
            <line x1="120" y1="35" x2="130" y2="25" stroke="currentColor" strokeWidth="0.5" />
            <line x1="35" y1="60" x2="35" y2="70" stroke="currentColor" strokeWidth="0.5" />
            <line x1="95" y1="60" x2="95" y2="70" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </div>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <HardDrive className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Hardware & Infrastructure Vendor Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">Connect server OEMs, hypervisors, and cloud platforms for real-time asset discovery & enrichment</p>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {[
                { label: "Vendors Available", value: HARDWARE_PLATFORMS.length, icon: Package },
                { label: "Connected", value: connectedCount, icon: CheckCircle2 },
                { label: "Assets Imported", value: totalImported.toLocaleString(), icon: Database },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-1.5 bg-primary/10 dark:bg-white/10 rounded-lg px-3 py-1.5">
                  <m.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">{m.value}</span>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search vendors..."
                className="pl-9 bg-muted/50 dark:bg-white/10 border-border dark:border-white/20 text-foreground placeholder:text-muted-foreground w-56 focus:ring-primary"
                data-testid="input-vendor-search"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Server OEM Connectors", value: HARDWARE_PLATFORMS.filter(p => ["dell_ome","dell_idrac","hpe_ilo","hpe_oneview","lenovo_xclarity"].includes(p.key)).length, icon: Server, desc: "Dell, HP, Lenovo" },
          { label: "Silicon Vendors", value: HARDWARE_PLATFORMS.filter(p => ["intel_vpro","nvidia_ngc"].includes(p.key)).length, icon: Cpu, desc: "Intel, NVIDIA" },
          { label: "Hypervisor & OS", value: HARDWARE_PLATFORMS.filter(p => ["vmware_vcenter","vmware_aria","ms_intune","ms_sccm"].includes(p.key)).length, icon: Globe, desc: "VMware, Microsoft" },
          { label: "Cloud Platforms", value: HARDWARE_PLATFORMS.filter(p => ["aws_ssm","aws_config","azure_arc","azure_resource","gcp_asset","gcp_scc"].includes(p.key)).length, icon: Cloud, desc: "AWS, Azure, GCP" },
        ].map(s => (
          <Card key={s.label} className="bg-card/50 border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
                  <div className="text-[9px] text-muted-foreground/60">{s.desc}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vendor groups */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([vendorName, platforms]) => (
          <div key={vendorName} className="space-y-3" data-testid={`vendor-group-${vendorName.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <VendorLogo platformKey={platforms[0].key} size={14} />
              </div>
              <h2 className="text-sm font-semibold">{vendorName}</h2>
              <Badge variant="secondary" className="text-[9px]">{platforms.length} connector{platforms.length > 1 ? "s" : ""}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {platforms.map(platform => {
                const meta = VENDOR_META[platform.key];
                const integration = integrationMap[platform.key];
                const status = integration?.status || "disconnected";
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
                const isTesting = testingId === integration?.id;
                const isPulling = pullingId === integration?.id;

                return (
                  <div
                    key={platform.key}
                    className="group relative flex flex-col gap-3 p-4 rounded-xl border bg-card/60 hover:bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
                    data-testid={`vendor-card-${platform.key}`}
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-primary/5 to-transparent" />

                    <div className="flex items-start justify-between gap-2 relative">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/10 flex items-center justify-center text-primary shrink-0">
                          <VendorLogo platformKey={platform.key} size={22} />
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">{platform.name}</div>
                          <div className="text-[10px] text-muted-foreground">{meta?.tag || platform.category}</div>
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>

                    <p className="text-[10px] text-muted-foreground leading-relaxed relative">
                      {platform.description}
                    </p>

                    <div className="space-y-1 relative">
                      {(meta?.features || []).slice(0, 3).map(f => (
                        <div key={f} className="flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                          <span className="text-[10px] text-muted-foreground">{f}</span>
                        </div>
                      ))}
                    </div>

                    {integration && (
                      <div className="relative border-t border-border/50 pt-2 space-y-1">
                        {integration.lastPollAt && (
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            Last sync: {new Date(integration.lastPollAt).toLocaleString()}
                          </div>
                        )}
                        {integration.eventsImported > 0 && (
                          <div className="flex items-center gap-1 text-[9px] text-primary font-medium">
                            <BarChart3 className="w-2.5 h-2.5" />
                            {integration.eventsImported.toLocaleString()} assets imported
                          </div>
                        )}
                        {integration.lastPollMessage && (
                          <div className="text-[9px] text-muted-foreground/70 truncate">
                            {integration.lastPollMessage}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-auto relative">
                      {!integration ? (
                        <Button size="sm" className="flex-1 h-7 text-[11px]"
                          onClick={() => setConnectingPlatform(platform)}
                          disabled={!isMSS} data-testid={`button-connect-${platform.key}`}>
                          <Plus className="w-3 h-3 mr-1" /> Connect
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px]"
                            onClick={() => testConnection(integration)}
                            disabled={isTesting} data-testid={`button-test-${platform.key}`}>
                            {isTesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                            Test
                          </Button>
                          {status === "connected" && (
                            <Button size="sm" className="flex-1 h-7 text-[11px]"
                              onClick={() => pullData(integration)}
                              disabled={isPulling} data-testid={`button-pull-${platform.key}`}>
                              {isPulling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                              Sync
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                            onClick={() => setConnectingPlatform(platform)}
                            data-testid={`button-edit-${platform.key}`}>
                            <Settings className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <h3 className="font-medium text-muted-foreground">No vendors match "{search}"</h3>
          <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="mt-2">Clear search</Button>
        </div>
      )}

      {/* Connect dialog */}
      {connectingPlatform && (
        <ConnectDialog
          platform={connectingPlatform}
          existingIntegration={integrationMap[connectingPlatform.key]}
          open={!!connectingPlatform}
          onClose={() => setConnectingPlatform(null)}
          tenantId={tenantId!}
        />
      )}
    </div>
  );
}
