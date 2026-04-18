import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { useTenantDateFormatter } from "@/lib/format-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SecurityIntegration } from "@shared/schema";
import { SECURITY_PLATFORMS, INTEGRATION_CATEGORIES, PLATFORM_AUTH_FIELDS } from "@shared/schema";
import type { PlatformAuthConfig } from "@shared/schema";
import {
  Plus,
  Shield,
  Plug,
  Unplug,
  RefreshCw,
  Trash2,
  Settings,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Search,
  Filter,
  MoreVertical,
  PlayCircle,
  TestTube,
  Globe,
  RotateCcw,
  Download,
  History,
  Archive,
  Server,
  Eye,
  EyeOff,
  ShieldCheck,
  Cloud,
  Lock,
  Mail,
  Monitor,
  MonitorSmartphone,
  Radar,
  Bug,
  Users,
  Network,
  BarChart3,
  Workflow,
  Wrench,
  Database,
  AlertTriangle,
  ChevronDown,
  Building2,
  Rss,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  connected: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  disconnected: { bg: "bg-muted", text: "text-muted-foreground", icon: Unplug },
  error: { bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
  pending: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: Clock },
};

const CATEGORY_ICONS: Record<string, any> = {
  edr_xdr: ShieldCheck,
  sse_casb: Cloud,
  dlp: Lock,
  email_security: Mail,
  waf: Globe,
  tip_easm: Radar,
  vulnerability_management: Bug,
  directory_services: Users,
  network_security: Network,
  endpoint_security: MonitorSmartphone,
  siem: BarChart3,
  soar: Workflow,
  hardware_infra: Server,
  other: Wrench,
};

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] || Wrench;
  return <Icon className={className || "w-4 h-4"} />;
}

function getCategoryName(key: string): string {
  const cat = INTEGRATION_CATEGORIES.find(c => c.key === key);
  return cat?.name || key;
}

interface TaxiiServer {
  id: number;
  name: string;
  displayName: string;
  url: string;
  authType: "basic" | "bearer" | "none";
  username?: string;
  collectionIds: string[];
  pollIntervalHours: number;
  lastSyncedAt: string | null;
  enabled: boolean;
  status: string;
  objectCount: number;
}

function TaxiiFeedsSection() {
  const { toast } = useToast();
  const { data: servers = [], isLoading, refetch } = useQuery<TaxiiServer[]>({
    queryKey: ["/api/integrations/taxii/servers"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/integrations/taxii/servers/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
    },
    onError: () => toast({ title: "Failed to update server", variant: "destructive" }),
  });

  const pollMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/integrations/taxii/servers/${id}/poll`),
    onSuccess: () => {
      toast({ title: "Poll triggered" });
      refetch();
    },
    onError: () => toast({ title: "Poll failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/taxii/servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/taxii/servers"] });
      toast({ title: "Server removed" });
    },
    onError: () => toast({ title: "Failed to remove server", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Rss className="w-5 h-5 text-primary" /> TAXII 2.1 Feed Servers
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage external TAXII servers to automatically ingest STIX threat indicators.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild data-testid="button-open-taxii-management">
          <a href="/taxii-feeds">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Full Management
          </a>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : servers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No TAXII servers configured. Click <strong>Full Management</strong> to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Objects</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.id} data-testid={`row-taxii-server-${server.id}`}>
                  <TableCell className="font-medium">{server.displayName || server.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{server.url}</TableCell>
                  <TableCell>
                    <Badge
                      variant={server.status === "ok" ? "outline" : server.status === "error" ? "destructive" : "secondary"}
                      className="text-[10px]"
                      data-testid={`status-taxii-server-${server.id}`}
                    >
                      {server.status || "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-testid={`text-object-count-${server.id}`}>
                    {server.objectCount ?? 0}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {server.lastSyncedAt ? new Date(server.lastSyncedAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={(enabled) => toggleMutation.mutate({ id: server.id, enabled })}
                      data-testid={`switch-taxii-server-${server.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => pollMutation.mutate(server.id)}
                        disabled={pollMutation.isPending}
                        data-testid={`button-poll-taxii-${server.id}`}
                        title="Poll now"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(server.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-taxii-${server.id}`}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function SecurityIntegrationsPage() {
  const { currentTenant, isMSS, tenants, setCurrentTenant, isPlatformAdmin } = useTenant();
  const fmt = useTenantDateFormatter();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("connected");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<SecurityIntegration | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<typeof SECURITY_PLATFORMS[number] | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [pollingInterval, setPollingInterval] = useState("15");
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [editConfigFields, setEditConfigFields] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [editVisibleSecrets, setEditVisibleSecrets] = useState<Set<string>>(new Set());
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [auditLogVisible, setAuditLogVisible] = useState(20);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pendingDeleteIntegration, setPendingDeleteIntegration] = useState<SecurityIntegration | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab !== "audit-log") setAuditLogVisible(20);
  }, [activeTab]);

  const [catalogPage, setCatalogPage] = useState(0);

  const [emailConfigDialogOpen, setEmailConfigDialogOpen] = useState(false);
  const [emailProvider, setEmailProvider] = useState<string | null>(null);
  const [emailConfigId, setEmailConfigId] = useState<number | null>(null);
  const [emailApiKey, setEmailApiKey] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [emailAppPassword, setEmailAppPassword] = useState("");
  const [emailFromEmail, setEmailFromEmail] = useState("");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailSmtpPort, setEmailSmtpPort] = useState("587");
  const [emailSmtpUsername, setEmailSmtpUsername] = useState("");
  const [emailSmtpPassword, setEmailSmtpPassword] = useState("");
  const [emailSmtpTls, setEmailSmtpTls] = useState(true);
  const [emailIsDefault, setEmailIsDefault] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const tenantId = currentTenant?.id;

  const { data: integrations = [], isLoading } = useQuery<SecurityIntegration[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch integrations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/security-integrations`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Integration Added", description: "Platform integration configured successfully." });
      setAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/security-integrations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Updated", description: "Integration updated successfully." });
      setConfigDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/security-integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations", "deleted"] });
      setPendingDeleteIntegration(null);
      toast({ title: "Moved to Recycle Bin", description: "Integration can be restored within 30 days." });
    },
    onError: (error: any) => {
      setPendingDeleteIntegration(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations", "deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations", "audit-log"] });
      toast({ title: "Restored", description: "Integration has been restored successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: deletedIntegrations = [] } = useQuery<SecurityIntegration[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations", "deleted"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations/deleted`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && isMSS && activeTab === "recycle-bin",
  });

  const { data: auditLog = [] } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "security-integrations", "audit-log"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations/audit-log`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && isMSS && activeTab === "audit-log",
  });

  const handleExport = async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/security-integrations/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `integrations-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${data.count} integration configs downloaded.` });
    } catch {
      toast({ title: "Export Failed", description: "Could not export integration configs.", variant: "destructive" });
    }
  };

  const testConnectionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/test-connection`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({
        title: "Connection Successful",
        description: `${data.message} (${data.latencyMs}ms)`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullDataMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/pull-data`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({
        title: "Data Pull Complete",
        description: `${data.message}`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Data Pull Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullHostsMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/pull-hosts`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Hosts Pull Complete", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Hosts Pull Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullUsersMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/pull-users`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Users Pull Complete", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Users Pull Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullNetworkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/pull-network`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      toast({ title: "Network Pull Complete", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Network Pull Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullAssetsMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/security-integrations/${id}/pull-assets`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-integrations"] });
      const ok = data.status === "success";
      toast({
        title: ok ? "Asset Inventory Synced" : "Asset Sync Warning",
        description: `${data.message}${ok && data.assetsImported != null ? ` (${data.assetsImported} assets imported)` : ""}`,
        variant: ok ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({ title: "Asset Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const ASSET_SYNC_CATEGORIES = new Set(["edr_xdr", "endpoint_security", "dlp", "patch_mgmt", "vulnerability_management"]);

  const { data: emailConfigs = [], isLoading: emailConfigsLoading } = useQuery<any[]>({
    queryKey: ["/api/email-configurations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/email-configurations/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch email configurations");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createEmailConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/email-configurations/${tenantId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-configurations", tenantId] });
      toast({ title: "Email Configuration Saved", description: "Email provider configured successfully." });
      setEmailConfigDialogOpen(false);
      resetEmailForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateEmailConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/email-configurations/${tenantId}/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-configurations", tenantId] });
      toast({ title: "Updated", description: "Email configuration updated successfully." });
      setEmailConfigDialogOpen(false);
      resetEmailForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteEmailConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/email-configurations/${tenantId}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-configurations", tenantId] });
      toast({ title: "Removed", description: "Email configuration removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testEmailConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/email-configurations/${tenantId}/${id}/test`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test Email Sent", description: "Check your inbox for the test email." });
    },
    onError: (error: any) => {
      toast({ title: "Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const setDefaultEmailConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/email-configurations/${tenantId}/${id}`, { isDefault: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-configurations", tenantId] });
      toast({ title: "Default Updated", description: "Default email provider updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetEmailForm() {
    setEmailProvider(null);
    setEmailConfigId(null);
    setEmailApiKey("");
    setEmailAddress("");
    setEmailAppPassword("");
    setEmailFromEmail("");
    setEmailFromName("");
    setEmailSmtpHost("");
    setEmailSmtpPort("587");
    setEmailSmtpUsername("");
    setEmailSmtpPassword("");
    setEmailSmtpTls(true);
    setEmailIsDefault(false);
    setShowEmailPassword(false);
  }

  function openEmailConfigDialog(provider: string, existingConfig?: any) {
    resetEmailForm();
    setEmailProvider(provider);
    if (existingConfig) {
      setEmailConfigId(existingConfig.id);
      setEmailFromEmail(existingConfig.fromEmail || "");
      setEmailFromName(existingConfig.fromName || "");
      setEmailIsDefault(existingConfig.isDefault || false);
      const cfg = existingConfig.config || {};
      if (provider === "sendgrid") {
        setEmailApiKey(cfg.apiKey || "");
      } else if (provider === "office365" || provider === "google_workspace") {
        setEmailAddress(cfg.email || "");
        setEmailAppPassword(cfg.password || "");
      } else if (provider === "custom_smtp") {
        setEmailSmtpHost(cfg.host || "");
        setEmailSmtpPort(String(cfg.port || 587));
        setEmailSmtpUsername(cfg.username || "");
        setEmailSmtpPassword(cfg.password || "");
        setEmailSmtpTls(cfg.tls !== false);
      }
    }
    setEmailConfigDialogOpen(true);
  }

  function handleSaveEmailConfig() {
    if (!emailProvider || !tenantId) return;
    let config: Record<string, any> = {};
    let name = "";

    if (emailProvider === "sendgrid") {
      config = { apiKey: emailApiKey };
      name = "SendGrid";
    } else if (emailProvider === "office365") {
      config = { email: emailAddress, password: emailAppPassword };
      name = "Office 365";
    } else if (emailProvider === "google_workspace") {
      config = { email: emailAddress, password: emailAppPassword };
      name = "Google Workspace";
    } else if (emailProvider === "custom_smtp") {
      config = {
        host: emailSmtpHost,
        port: parseInt(emailSmtpPort),
        username: emailSmtpUsername,
        password: emailSmtpPassword,
        tls: emailSmtpTls,
      };
      name = "Custom SMTP";
    }

    const payload = {
      provider: emailProvider,
      name,
      config,
      fromEmail: emailFromEmail,
      fromName: emailFromName,
      isDefault: emailIsDefault,
    };

    if (emailConfigId) {
      updateEmailConfigMutation.mutate({ id: emailConfigId, data: payload });
    } else {
      createEmailConfigMutation.mutate(payload);
    }
  }

  const EMAIL_PROVIDERS = [
    { key: "sendgrid", name: "SendGrid", description: "Transactional email via SendGrid API" },
    { key: "office365", name: "Office 365", description: "Microsoft Office 365 email" },
    { key: "google_workspace", name: "Google Workspace", description: "Google Workspace (Gmail) email" },
    { key: "custom_smtp", name: "Custom SMTP", description: "Custom SMTP server configuration" },
  ];

  function resetForm() {
    setSelectedPlatform(null);
    setApiUrl("");
    setPollingEnabled(false);
    setPollingInterval("15");
    setConfigFields({});
    setVisibleSecrets(new Set());
    createMutation.reset();
  }

  function handleAddIntegration() {
    if (!selectedPlatform || !tenantId) return;
    const authConfig = PLATFORM_AUTH_FIELDS[selectedPlatform.key];
    const credentials: Record<string, string> = {};
    if (authConfig) {
      for (const field of authConfig.fields) {
        if (configFields[field.key]) {
          credentials[field.key] = configFields[field.key];
        }
      }
    }
    const configJson: Record<string, any> = {
      credentials,
      apiBaseUrl: apiUrl || null,
    };

    createMutation.mutate({
      platformKey: selectedPlatform.key,
      platformName: selectedPlatform.name,
      category: selectedPlatform.category,
      authType: selectedPlatform.authType,
      apiBaseUrl: apiUrl || null,
      pollingEnabled,
      pollingIntervalMinutes: parseInt(pollingInterval),
      description: selectedPlatform.description,
      configJson,
      isEnabled: true,
    });
  }

  function handleUpdateIntegration() {
    if (!selectedIntegration) return;
    const authConfig = PLATFORM_AUTH_FIELDS[selectedIntegration.platformKey];
    const credentials: Record<string, string> = {};
    if (authConfig) {
      for (const field of authConfig.fields) {
        if (editConfigFields[field.key]) {
          credentials[field.key] = editConfigFields[field.key];
        }
      }
    }
    const configJson: Record<string, any> = {
      credentials,
      apiBaseUrl: apiUrl || null,
    };
    updateMutation.mutate({
      id: selectedIntegration.id,
      data: {
        apiBaseUrl: apiUrl || null,
        pollingEnabled,
        pollingIntervalMinutes: parseInt(pollingInterval),
        isEnabled: selectedIntegration.isEnabled,
        configJson,
      },
    });
  }

  function openConfigDialog(integration: SecurityIntegration) {
    setSelectedIntegration(integration);
    setApiUrl(integration.apiBaseUrl || "");
    setPollingEnabled(integration.pollingEnabled);
    setPollingInterval(String(integration.pollingIntervalMinutes || 15));
    const cfg = (integration.configJson as Record<string, any>) || {};
    const creds = cfg.credentials || cfg || {};
    const authConfig = PLATFORM_AUTH_FIELDS[integration.platformKey];
    const populatedFields: Record<string, string> = {};
    if (authConfig) {
      for (const field of authConfig.fields) {
        const val = creds[field.key] || "";
        populatedFields[field.key] = val === "***configured***" ? "" : val;
      }
    }
    setEditConfigFields(populatedFields);
    setEditVisibleSecrets(new Set());
    setConfigDialogOpen(true);
  }

  const connectedIntegrations = useMemo(() => integrations.filter(i => i.status === "connected"), [integrations]);
  const allConfigured = integrations;

  const availablePlatforms = useMemo(
    () => SECURITY_PLATFORMS.filter(p => !integrations.find(i => i.platformKey === p.key)),
    [integrations]
  );

  const filteredPlatforms = useMemo(() => availablePlatforms.filter(p => {
    const matchesSearch = !debouncedSearch ||
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [availablePlatforms, debouncedSearch, selectedCategory]);

  const missingRequiredFields = useMemo(() => {
    if (!selectedPlatform) return [];
    const authConfig = PLATFORM_AUTH_FIELDS[selectedPlatform.key];
    if (!authConfig) return [];
    return authConfig.fields.filter(f => f.required && !configFields[f.key]?.trim());
  }, [selectedPlatform, configFields]);

  const filteredIntegrations = useMemo(() => integrations.filter(i => {
    const matchesSearch = !debouncedSearch ||
      i.platformName.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === "all" || i.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [integrations, debouncedSearch, selectedCategory]);

  const filteredConnectedIntegrations = useMemo(() => connectedIntegrations.filter(i => {
    const matchesSearch = !debouncedSearch ||
      i.platformName.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === "all" || i.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [connectedIntegrations, debouncedSearch, selectedCategory]);

  useEffect(() => { setCatalogPage(0); }, [debouncedSearch, selectedCategory]);

  if (!currentTenant) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Select a tenant to view security integrations.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="security-integrations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Plug className="w-6 h-6" />
            Security Integrations
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect and manage security platforms for automated data collection
          </p>
        </div>
        {isMSS && (
          <Button onClick={() => { resetForm(); setAddDialogOpen(true); }} data-testid="button-add-integration">
            <Plus className="w-4 h-4 mr-2" />
            Add Integration
          </Button>
        )}
      </div>

      {(isPlatformAdmin || (isMSS && tenants.length > 1)) && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10" data-testid="tenant-context-banner">
          <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-sm text-muted-foreground">Viewing integrations for:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10" data-testid="button-tenant-switcher">
                {currentTenant?.name}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenants.map(t => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setCurrentTenant(t)}
                  className={t.id === currentTenant?.id ? "bg-accent font-medium" : ""}
                  data-testid={`option-tenant-${t.id}`}
                >
                  <Building2 className="w-3.5 h-3.5 mr-2 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t.name}</span>
                  {t.id === currentTenant?.id && (
                    <span className="ml-auto text-xs text-blue-500">current</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-auto text-xs text-muted-foreground hidden sm:block">Switch tenant to view their integrations</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Plug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{integrations.length}</p>
              <p className="text-xs text-muted-foreground">Total Configured</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-connected">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{connectedIntegrations.length}</p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-events">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{integrations.reduce((sum, i) => sum + (i.eventsImported || 0), 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Events Imported</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-categories">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{new Set(integrations.map(i => i.category)).size}</p>
              <p className="text-xs text-muted-foreground">Categories Active</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-integrations"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]" data-testid="select-category-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {INTEGRATION_CATEGORIES.map(cat => (
              <SelectItem key={cat.key} value={cat.key}>
                <span className="flex items-center gap-2">
                  <CategoryIcon category={cat.key} className="w-3 h-3" />
                  {cat.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isMSS && (
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-integrations">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-integrations">
          <TabsTrigger value="connected" data-testid="tab-connected">
            Connected ({connectedIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-configured">
            All Configured ({allConfigured.length})
          </TabsTrigger>
          <TabsTrigger value="catalog" data-testid="tab-catalog">
            Platform Catalog ({availablePlatforms.length})
          </TabsTrigger>
          <TabsTrigger value="taxii-feeds" data-testid="tab-taxii-feeds">
            <Rss className="w-4 h-4 mr-1" />
            TAXII Feeds
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Mail className="w-4 h-4 mr-1" />
            Email Notifications
          </TabsTrigger>
          {isMSS && (
            <TabsTrigger value="recycle-bin" data-testid="tab-recycle-bin" className="relative">
              <Archive className="w-4 h-4 mr-1" />
              Recycle Bin
              {deletedIntegrations.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {deletedIntegrations.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {isMSS && (
            <TabsTrigger value="audit-log" data-testid="tab-audit-log">
              <History className="w-4 h-4 mr-1" />
              Audit Log
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="connected" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : connectedIntegrations.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Unplug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Connected Integrations</h3>
                <p className="text-muted-foreground mb-4">
                  Add and connect security platforms to start collecting data.
                </p>
                {isMSS && (
                  <Button onClick={() => { resetForm(); setAddDialogOpen(true); }} data-testid="button-add-first-integration">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Integration
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredConnectedIntegrations.map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  isMSS={isMSS}
                  onConfigure={openConfigDialog}
                  onTestConnection={(id) => testConnectionMutation.mutate(id)}
                  onPullData={(id) => pullDataMutation.mutate(id)}
                  onPullHosts={(id) => pullHostsMutation.mutate(id)}
                  onPullUsers={(id) => pullUsersMutation.mutate(id)}
                  onPullNetwork={(id) => pullNetworkMutation.mutate(id)}
                  onPullAssets={(id) => pullAssetsMutation.mutate(id)}
                  assetSyncCategories={ASSET_SYNC_CATEGORIES}
                  onDelete={(integration) => setPendingDeleteIntegration(integration)}
                  isTestingConnection={testConnectionMutation.isPending}
                  isPullingData={pullDataMutation.isPending}
                  isPullingAssets={pullAssetsMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredIntegrations.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Integrations Configured</h3>
                <p className="text-muted-foreground">Add integrations from the platform catalog.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIntegrations.map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  isMSS={isMSS}
                  onConfigure={openConfigDialog}
                  onTestConnection={(id) => testConnectionMutation.mutate(id)}
                  onPullData={(id) => pullDataMutation.mutate(id)}
                  onPullHosts={(id) => pullHostsMutation.mutate(id)}
                  onPullUsers={(id) => pullUsersMutation.mutate(id)}
                  onPullNetwork={(id) => pullNetworkMutation.mutate(id)}
                  onPullAssets={(id) => pullAssetsMutation.mutate(id)}
                  assetSyncCategories={ASSET_SYNC_CATEGORIES}
                  onDelete={(integration) => setPendingDeleteIntegration(integration)}
                  isTestingConnection={testConnectionMutation.isPending}
                  isPullingData={pullDataMutation.isPending}
                  isPullingAssets={pullAssetsMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="catalog" className="mt-4">
          {filteredPlatforms.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">All Platforms Configured</h3>
                <p className="text-muted-foreground">You've added all available security platforms.</p>
              </CardContent>
            </Card>
          ) : (() => {
            const PAGE_SIZE = 12;
            const totalPages = Math.ceil(filteredPlatforms.length / PAGE_SIZE);
            const safePage = Math.min(catalogPage, Math.max(0, totalPages - 1));
            const pagedPlatforms = filteredPlatforms.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>
                    Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredPlatforms.length)} of {filteredPlatforms.length} platforms
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={safePage === 0}
                      onClick={() => setCatalogPage(p => Math.max(0, p - 1))}
                      data-testid="button-catalog-prev"
                    >
                      Previous
                    </Button>
                    <span className="text-xs">{safePage + 1} / {totalPages}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setCatalogPage(p => Math.min(totalPages - 1, p + 1))}
                      data-testid="button-catalog-next"
                    >
                      Next
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pagedPlatforms.map(platform => (
                    <div
                      key={platform.key}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      data-testid={`card-platform-${platform.key}`}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CategoryIcon category={platform.category} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <h4 className="font-medium text-sm truncate">{platform.name}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{platform.description}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-xs">{platform.authType}</Badge>
                          <Badge variant="secondary" className="text-xs">{getCategoryName(platform.category)}</Badge>
                        </div>
                      </div>
                      {isMSS && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPlatform(platform as any);
                            if (platform.key === "cynet") {
                              setPollingEnabled(true);
                              setPollingInterval("5");
                            }
                            setAddDialogOpen(true);
                          }}
                          data-testid={`button-add-${platform.key}`}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={catalogPage === 0}
                      onClick={() => setCatalogPage(p => p - 1)}
                      data-testid="button-catalog-prev-bottom"
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">{catalogPage + 1} of {totalPages}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={catalogPage >= totalPages - 1}
                      onClick={() => setCatalogPage(p => p + 1)}
                      data-testid="button-catalog-next-bottom"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="taxii-feeds" className="mt-4">
          <TaxiiFeedsSection />
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Email Providers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {EMAIL_PROVIDERS.map(provider => {
                const configured = emailConfigs.find((c: any) => c.provider === provider.key);
                return (
                  <Card key={provider.key} data-testid={`card-email-provider-${provider.key}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Mail className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm" data-testid={`text-email-provider-name-${provider.key}`}>{provider.name}</h4>
                          <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={configured ? "default" : "secondary"}
                          data-testid={`badge-email-status-${provider.key}`}
                        >
                          {configured ? "Configured" : "Not Configured"}
                        </Badge>
                        <Button
                          size="sm"
                          variant={configured ? "outline" : "default"}
                          onClick={() => openEmailConfigDialog(provider.key, configured)}
                          data-testid={`button-configure-email-${provider.key}`}
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          {configured ? "Edit" : "Configure"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Configured Providers</h3>
            {emailConfigsLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : emailConfigs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Mail className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <h4 className="font-medium mb-1">No Email Providers Configured</h4>
                  <p className="text-sm text-muted-foreground">Configure an email provider above to start sending notifications.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {emailConfigs.map((config: any) => (
                      <div
                        key={config.id}
                        className="flex items-center justify-between gap-3 p-4"
                        data-testid={`row-email-config-${config.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm" data-testid={`text-email-config-name-${config.id}`}>{config.name}</span>
                              {config.isDefault && (
                                <Badge variant="default" className="text-xs" data-testid={`badge-email-default-${config.id}`}>
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate" data-testid={`text-email-from-${config.id}`}>
                              {config.fromEmail || "No from email set"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEmailConfigDialog(config.provider, config)}
                                data-testid={`button-edit-email-config-${config.id}`}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => testEmailConfigMutation.mutate(config.id)}
                                disabled={testEmailConfigMutation.isPending}
                                data-testid={`button-test-email-config-${config.id}`}
                              >
                                <TestTube className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Test</TooltipContent>
                          </Tooltip>
                          {!config.isDefault && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDefaultEmailConfigMutation.mutate(config.id)}
                                  data-testid={`button-set-default-email-config-${config.id}`}
                                >
                                  <Zap className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Set as Default</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteEmailConfigMutation.mutate(config.id)}
                                data-testid={`button-delete-email-config-${config.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {isMSS && (
          <TabsContent value="recycle-bin" className="mt-4">
            {deletedIntegrations.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Archive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Recycle Bin is Empty</h3>
                  <p className="text-muted-foreground text-sm">
                    Deleted integrations appear here and can be restored within 30 days.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {deletedIntegrations.length} deleted integration{deletedIntegrations.length !== 1 ? "s" : ""}. These can be restored to resume data collection.
                </p>
                {deletedIntegrations.map(integration => (
                  <Card key={integration.id} className="border-amber-500/30 bg-amber-500/5" data-testid={`card-deleted-${integration.id}`}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                          <CategoryIcon category={integration.category} className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{integration.platformName}</p>
                          <p className="text-xs text-muted-foreground">{getCategoryName(integration.category)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Deleted</p>
                          <p className="text-xs font-mono">{integration.deletedAt ? fmt.formatDateTime(integration.deletedAt) : "—"}</p>
                        </div>
                        <Badge variant="outline" className="text-amber-600 border-amber-500/50 text-xs">
                          <Archive className="w-3 h-3 mr-1" />
                          Deleted
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreMutation.mutate(integration.id)}
                          disabled={restoreMutation.isPending}
                          data-testid={`button-restore-${integration.id}`}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Restore
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {isMSS && (
          <TabsContent value="audit-log" className="mt-4">
            {auditLog.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Audit Activity Yet</h3>
                  <p className="text-muted-foreground text-sm">
                    All integration changes (create, update, delete, restore) will be logged here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    Integration Change History
                    <Badge variant="secondary" className="ml-auto text-xs">{auditLog.length} entries</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {auditLog.slice(0, auditLogVisible).map((entry: any) => {
                      const actionColors: Record<string, string> = {
                        created: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                        updated: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
                        deleted: "text-destructive bg-destructive/10",
                        restored: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
                        test_connection: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
                        pull_data: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
                      };
                      const actionLabel: Record<string, string> = {
                        created: "Created",
                        updated: "Updated",
                        deleted: "Deleted",
                        restored: "Restored",
                        test_connection: "Tested",
                        pull_data: "Data Pull",
                      };
                      return (
                        <div key={entry.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors" data-testid={`row-audit-${entry.id}`}>
                          <div className="shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${actionColors[entry.action] || "bg-muted text-muted-foreground"}`}>
                              {actionLabel[entry.action] || entry.action}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{entry.platformName}</p>
                            {entry.username && (
                              <p className="text-xs text-muted-foreground">by {entry.username}</p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {entry.createdAt ? fmt.formatDateTime(entry.createdAt) : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {auditLog.length > auditLogVisible && (
                    <div className="p-3 border-t flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Showing {auditLogVisible} of {auditLog.length} entries
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setAuditLogVisible(v => v + 20)}
                        data-testid="button-load-more-audit"
                      >
                        Load more
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={emailConfigDialogOpen} onOpenChange={setEmailConfigDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-email-config">
          <DialogHeader>
            <DialogTitle>
              {emailConfigId ? "Edit" : "Configure"} {EMAIL_PROVIDERS.find(p => p.key === emailProvider)?.name || "Email Provider"}
            </DialogTitle>
            <DialogDescription>
              {EMAIL_PROVIDERS.find(p => p.key === emailProvider)?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {emailProvider === "sendgrid" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showEmailPassword ? "text" : "password"}
                    placeholder="SG.xxxxxxxx"
                    value={emailApiKey}
                    onChange={(e) => setEmailApiKey(e.target.value)}
                    data-testid="input-email-api-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowEmailPassword(!showEmailPassword)}
                  >
                    {showEmailPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            )}

            {(emailProvider === "office365" || emailProvider === "google_workspace") && (
              <>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    data-testid="input-email-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label>App Password</Label>
                  <div className="relative">
                    <Input
                      type={showEmailPassword ? "text" : "password"}
                      placeholder="App-specific password"
                      value={emailAppPassword}
                      onChange={(e) => setEmailAppPassword(e.target.value)}
                      data-testid="input-email-app-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowEmailPassword(!showEmailPassword)}
                    >
                      {showEmailPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {emailProvider === "custom_smtp" && (
              <>
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input
                    placeholder="smtp.example.com"
                    value={emailSmtpHost}
                    onChange={(e) => setEmailSmtpHost(e.target.value)}
                    data-testid="input-email-smtp-host"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={emailSmtpPort}
                    onChange={(e) => setEmailSmtpPort(e.target.value)}
                    data-testid="input-email-smtp-port"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    placeholder="SMTP username"
                    value={emailSmtpUsername}
                    onChange={(e) => setEmailSmtpUsername(e.target.value)}
                    data-testid="input-email-smtp-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showEmailPassword ? "text" : "password"}
                      placeholder="SMTP password"
                      value={emailSmtpPassword}
                      onChange={(e) => setEmailSmtpPassword(e.target.value)}
                      data-testid="input-email-smtp-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowEmailPassword(!showEmailPassword)}
                    >
                      {showEmailPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label>TLS Encryption</Label>
                    <p className="text-xs text-muted-foreground">Use TLS for secure connection</p>
                  </div>
                  <Switch
                    checked={emailSmtpTls}
                    onCheckedChange={setEmailSmtpTls}
                    data-testid="switch-email-smtp-tls"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                type="email"
                placeholder="noreply@example.com"
                value={emailFromEmail}
                onChange={(e) => setEmailFromEmail(e.target.value)}
                data-testid="input-email-from-email"
              />
            </div>

            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                placeholder="SecureOps Notifications"
                value={emailFromName}
                onChange={(e) => setEmailFromName(e.target.value)}
                data-testid="input-email-from-name"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label>Set as Default</Label>
                <p className="text-xs text-muted-foreground">Use this provider for all notifications</p>
              </div>
              <Switch
                checked={emailIsDefault}
                onCheckedChange={setEmailIsDefault}
                data-testid="switch-email-is-default"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {emailConfigId && (
              <Button
                variant="outline"
                onClick={() => testEmailConfigMutation.mutate(emailConfigId)}
                disabled={testEmailConfigMutation.isPending}
                data-testid="button-test-email-connection"
              >
                {testEmailConfigMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4 mr-2" />
                )}
                Test Connection
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => { setEmailConfigDialogOpen(false); resetEmailForm(); }} data-testid="button-cancel-email-config">
                Cancel
              </Button>
              <Button
                onClick={handleSaveEmailConfig}
                disabled={createEmailConfigMutation.isPending || updateEmailConfigMutation.isPending}
                data-testid="button-save-email-config"
              >
                {(createEmailConfigMutation.isPending || updateEmailConfigMutation.isPending) ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Save Configuration
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-integration">
          <DialogHeader>
            <DialogTitle>Add Security Integration</DialogTitle>
            <DialogDescription>
              {selectedPlatform ? `Configure ${selectedPlatform.name}` : "Select a platform to integrate"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedPlatform ? (
              <div className="space-y-2">
                <Label>Select Platform</Label>
                <Select onValueChange={(key) => {
                  const p = SECURITY_PLATFORMS.find(pl => pl.key === key);
                  if (p) {
                    setSelectedPlatform(p as any);
                    if (p.key === "cynet") {
                      setPollingEnabled(true);
                      setPollingInterval("5");
                    }
                  }
                }}>
                  <SelectTrigger data-testid="select-platform">
                    <SelectValue placeholder="Choose a platform..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlatforms.map(p => (
                      <SelectItem key={p.key} value={p.key}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon category={p.category} className="w-3 h-3" />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-2">
                    <CategoryIcon category={selectedPlatform.category} className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{selectedPlatform.name}</h4>
                      <p className="text-xs text-muted-foreground">{selectedPlatform.description}</p>
                    </div>
                  </div>
                </div>

                {(() => {
                  const authConfig = selectedPlatform ? PLATFORM_AUTH_FIELDS[selectedPlatform.key] : undefined;
                  return (
                    <>
                      {!authConfig?.hideUrl && (
                        <div className="space-y-2">
                          <Label>{authConfig?.urlLabel || "API Base URL"}</Label>
                          <Input
                            placeholder={authConfig?.urlPlaceholder || "https://api.example.com/v1"}
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                            data-testid="input-api-url"
                          />
                          {authConfig?.urlHelpText && (
                            <p className="text-xs text-muted-foreground">{authConfig.urlHelpText}</p>
                          )}
                        </div>
                      )}
                      {(authConfig?.fields || []).map((field) => {
                        const isEmpty = field.required && !configFields[field.key]?.trim();
                        return (
                        <div key={field.key} className="space-y-2">
                          <Label>
                            {field.label}
                            {field.required
                              ? <span className="text-destructive ml-1">*</span>
                              : <span className="text-xs text-muted-foreground ml-1">(optional)</span>}
                          </Label>
                          {field.type === "select" && field.options ? (
                            <Select
                              value={configFields[field.key] || ""}
                              onValueChange={(val) => setConfigFields(prev => ({ ...prev, [field.key]: val }))}
                            >
                              <SelectTrigger data-testid={`select-add-${field.key}`} className={isEmpty ? "border-destructive" : ""}>
                                <SelectValue placeholder={field.placeholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                          <div className="relative">
                            <Input
                              type={field.type === "password" && !visibleSecrets.has(field.key) ? "password" : "text"}
                              placeholder={field.placeholder}
                              value={configFields[field.key] || ""}
                              onChange={(e) => setConfigFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                              data-testid={`input-add-${field.key}`}
                              className={isEmpty ? "border-destructive pr-8" : ""}
                            />
                            {field.type === "password" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2"
                                onClick={() => setVisibleSecrets(prev => {
                                  const next = new Set(prev);
                                  if (next.has(field.key)) next.delete(field.key);
                                  else next.add(field.key);
                                  return next;
                                })}
                              >
                                {visibleSecrets.has(field.key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                            )}
                          </div>
                          )}
                          {isEmpty && (
                            <p className="text-xs text-destructive">{field.label} is required</p>
                          )}
                          {field.helpText && !isEmpty && (
                            <p className="text-xs text-muted-foreground">{field.helpText}</p>
                          )}
                        </div>
                        );
                      })}
                    </>
                  );
                })()}

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label>Automated Polling</Label>
                    <p className="text-xs text-muted-foreground">Automatically pull data at intervals</p>
                  </div>
                  <Switch
                    checked={pollingEnabled}
                    onCheckedChange={setPollingEnabled}
                    data-testid="switch-polling"
                  />
                </div>

                {pollingEnabled && (
                  <div className="space-y-2">
                    <Label>Polling Interval (minutes)</Label>
                    <Select value={pollingInterval} onValueChange={setPollingInterval}>
                      <SelectTrigger data-testid="select-polling-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">Every 5 minutes</SelectItem>
                        <SelectItem value="15">Every 15 minutes</SelectItem>
                        <SelectItem value="30">Every 30 minutes</SelectItem>
                        <SelectItem value="60">Every hour</SelectItem>
                        <SelectItem value="360">Every 6 hours</SelectItem>
                        <SelectItem value="1440">Every 24 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          {createMutation.isError && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(() => {
                  const msg = (createMutation.error as Error)?.message || "Failed to add integration";
                  const match = msg.match(/^\d+: (.+)$/);
                  if (match) {
                    try { return JSON.parse(match[1]).message || match[1]; } catch { return match[1]; }
                  }
                  return msg;
                })()}
              </AlertDescription>
            </Alert>
          )}

          {!tenantId && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No active tenant selected. Please select a tenant first.</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleAddIntegration}
              disabled={!selectedPlatform || !tenantId || missingRequiredFields.length > 0 || createMutation.isPending}
              data-testid="button-confirm-add"
            >
              {createMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-config-integration">
          <DialogHeader>
            <DialogTitle>Configure Integration</DialogTitle>
            <DialogDescription>
              {selectedIntegration?.platformName}
            </DialogDescription>
          </DialogHeader>
          {selectedIntegration && (
            <div className="space-y-4">
              {(() => {
                const authConfig = PLATFORM_AUTH_FIELDS[selectedIntegration.platformKey];
                return (
                  <>
                    {!authConfig?.hideUrl && (
                      <div className="space-y-2">
                        <Label>{authConfig?.urlLabel || "API Base URL"}</Label>
                        <Input
                          placeholder={authConfig?.urlPlaceholder || "https://api.example.com/v1"}
                          value={apiUrl}
                          onChange={(e) => setApiUrl(e.target.value)}
                          data-testid="input-config-api-url"
                        />
                        {authConfig?.urlHelpText && (
                          <p className="text-xs text-muted-foreground">{authConfig.urlHelpText}</p>
                        )}
                      </div>
                    )}
                    {(authConfig?.fields || []).map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label>
                          {field.label}
                          {!field.required && <span className="text-xs text-muted-foreground ml-1">(optional)</span>}
                        </Label>
                        {field.type === "select" && field.options ? (
                          <Select
                            value={editConfigFields[field.key] || ""}
                            onValueChange={(val) => setEditConfigFields(prev => ({ ...prev, [field.key]: val }))}
                          >
                            <SelectTrigger data-testid={`select-config-${field.key}`}>
                              <SelectValue placeholder={field.placeholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                        <div className="relative">
                          <Input
                            type={field.type === "password" && !editVisibleSecrets.has(field.key) ? "password" : "text"}
                            placeholder={field.placeholder}
                            value={editConfigFields[field.key] || ""}
                            onChange={(e) => setEditConfigFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            data-testid={`input-config-${field.key}`}
                          />
                          {field.type === "password" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2"
                              onClick={() => setEditVisibleSecrets(prev => {
                                const next = new Set(prev);
                                if (next.has(field.key)) next.delete(field.key);
                                else next.add(field.key);
                                return next;
                              })}
                            >
                              {editVisibleSecrets.has(field.key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                        )}
                        {field.helpText && (
                          <p className="text-xs text-muted-foreground">{field.helpText}</p>
                        )}
                      </div>
                    ))}
                  </>
                );
              })()}

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label>Automated Polling</Label>
                  <p className="text-xs text-muted-foreground">Automatically pull data at intervals</p>
                </div>
                <Switch
                  checked={pollingEnabled}
                  onCheckedChange={setPollingEnabled}
                  data-testid="switch-config-polling"
                />
              </div>

              {pollingEnabled && (
                <div className="space-y-2">
                  <Label>Polling Interval (minutes)</Label>
                  <Select value={pollingInterval} onValueChange={setPollingInterval}>
                    <SelectTrigger data-testid="select-config-polling-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Every 5 minutes</SelectItem>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every hour</SelectItem>
                      <SelectItem value="360">Every 6 hours</SelectItem>
                      <SelectItem value="1440">Every 24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)} data-testid="button-cancel-config">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateIntegration}
              disabled={updateMutation.isPending}
              data-testid="button-save-config"
            >
              {updateMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Settings className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteIntegration} onOpenChange={(open) => { if (!open) setPendingDeleteIntegration(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-delete-integration">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Remove Integration
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to remove <span className="font-semibold text-foreground">{pendingDeleteIntegration?.platformName}</span>?
                </p>
                {pendingDeleteIntegration && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={pendingDeleteIntegration.category} className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs font-normal">
                        {getCategoryName(pendingDeleteIntegration.category)}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Events imported</span>
                      <span className="font-medium">{(pendingDeleteIntegration.eventsImported ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Last pull</span>
                      <span className="font-medium">
                        {pendingDeleteIntegration.lastPollAt ? fmt.formatDateTime(pendingDeleteIntegration.lastPollAt) : "Never"}
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  This integration will be moved to the <span className="font-medium">Recycle Bin</span> and can be restored within 30 days. Data already collected will not be affected.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-integration" onClick={() => setPendingDeleteIntegration(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-integration"
              onClick={() => {
                if (pendingDeleteIntegration) deleteMutation.mutate(pendingDeleteIntegration.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Move to Recycle Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntegrationCard({
  integration,
  isMSS,
  onConfigure,
  onTestConnection,
  onPullData,
  onPullHosts,
  onPullUsers,
  onPullNetwork,
  onPullAssets,
  assetSyncCategories,
  onDelete,
  isTestingConnection,
  isPullingData,
  isPullingAssets,
}: {
  integration: SecurityIntegration;
  isMSS: boolean;
  onConfigure: (i: SecurityIntegration) => void;
  onTestConnection: (id: number) => void;
  onPullData: (id: number) => void;
  onPullHosts?: (id: number) => void;
  onPullUsers?: (id: number) => void;
  onPullNetwork?: (id: number) => void;
  onPullAssets?: (id: number) => void;
  assetSyncCategories?: Set<string>;
  onDelete: (integration: SecurityIntegration) => void;
  isTestingConnection: boolean;
  isPullingData: boolean;
  isPullingAssets?: boolean;
}) {
  const fmt = useTenantDateFormatter();
  const statusStyle = STATUS_STYLES[integration.status] || STATUS_STYLES.disconnected;
  const StatusIcon = statusStyle.icon;
  const isUpToDate = integration.lastPollMessage?.startsWith("Up to date");
  const supportsAssetSync = assetSyncCategories?.has(integration.category) ?? false;
  const assetSyncStatus = integration.assetSyncStatus ?? undefined;
  const assetSyncMessage = integration.assetSyncMessage ?? undefined;
  const lastAssetSyncAt = integration.lastAssetSyncAt ?? undefined;
  const isHealthy = integration.status === "connected" && (integration.lastPollStatus === "success" || isUpToDate);

  const isMissingCredentials = (() => {
    if (integration.status !== "connected") return false;
    const authConfig = PLATFORM_AUTH_FIELDS[integration.platformKey];
    if (!authConfig) return false;
    const cfg = (integration.configJson as Record<string, any>) || {};
    const creds = cfg.credentials;
    if (!creds || typeof creds !== "object" || Object.keys(creds).length === 0) return true;
    return authConfig.fields.some(f => f.required && !creds[f.key]);
  })();

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-integration-${integration.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CategoryIcon category={integration.category} className="w-5 h-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm truncate">{integration.platformName}</CardTitle>
              <CardDescription className="text-xs truncate">
                {getCategoryName(integration.category)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${isHealthy && isUpToDate ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : `${statusStyle.bg} ${statusStyle.text}`} border-0 text-xs`} data-testid={`badge-status-${integration.id}`}>
              {isHealthy && isUpToDate ? (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              ) : (
                <StatusIcon className="w-3 h-3 mr-1" />
              )}
              {isHealthy && isUpToDate ? "synced" : integration.status}
            </Badge>
            {isMissingCredentials && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0 text-xs cursor-pointer" data-testid={`badge-credentials-missing-${integration.id}`} onClick={() => onConfigure(integration)}>
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Credentials missing
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>API credentials are not configured. Click to re-enter them.</TooltipContent>
              </Tooltip>
            )}
            {isMSS && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-menu-${integration.id}`}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onConfigure(integration)} data-testid={`menu-configure-${integration.id}`}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTestConnection(integration.id)} data-testid={`menu-test-${integration.id}`}>
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Connection
                  </DropdownMenuItem>
                  {integration.status === "connected" && (
                    <>
                      <DropdownMenuItem onClick={() => onPullData(integration.id)} data-testid={`menu-pull-${integration.id}`}>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Pull Alerts
                      </DropdownMenuItem>
                      {supportsAssetSync && (
                        <DropdownMenuItem onClick={() => onPullAssets?.(integration.id)} data-testid={`menu-pull-assets-${integration.id}`}>
                          <Database className="w-4 h-4 mr-2" />
                          Fetch Asset Inventory
                        </DropdownMenuItem>
                      )}
                      {integration.platformKey === "cynet" && (
                        <>
                          <DropdownMenuItem onClick={() => onPullHosts?.(integration.id)} data-testid={`menu-pull-hosts-${integration.id}`}>
                            <Monitor className="w-4 h-4 mr-2" />
                            Pull Hosts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onPullUsers?.(integration.id)} data-testid={`menu-pull-users-${integration.id}`}>
                            <Users className="w-4 h-4 mr-2" />
                            Pull Users
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onPullNetwork?.(integration.id)} data-testid={`menu-pull-network-${integration.id}`}>
                            <Globe className="w-4 h-4 mr-2" />
                            Pull Network
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(integration)}
                    data-testid={`menu-delete-${integration.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Auth Type</span>
            <p className="font-medium">{integration.authType || "N/A"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Events</span>
            <p className="font-medium">{(integration.eventsImported || 0).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Polling</span>
            <p className="font-medium">
              {integration.pollingEnabled ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Every {integration.pollingIntervalMinutes}m
                </span>
              ) : (
                <span className="text-muted-foreground">Disabled</span>
              )}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Pull</span>
            <p className="font-medium">
              {integration.lastPollAt
                ? fmt.formatDate(integration.lastPollAt)
                : "Never"}
            </p>
          </div>
        </div>

        {integration.lastPollMessage && (
          <PollStatusDisplay integration={integration} />
        )}

        {supportsAssetSync && assetSyncStatus && (
          <div className={`text-xs p-2 rounded flex items-center gap-1.5 ${
            assetSyncStatus === "success" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" :
            assetSyncStatus === "error" ? "bg-destructive/10 text-destructive" :
            assetSyncStatus === "syncing" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
            "bg-muted text-muted-foreground"
          }`} data-testid={`text-asset-sync-status-${integration.id}`}>
            {assetSyncStatus === "syncing" ? (
              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
            ) : (
              <Database className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">
              {assetSyncStatus === "syncing"
                ? "Syncing assets…"
                : assetSyncMessage
                  ? `${assetSyncMessage}${lastAssetSyncAt ? ` · ${fmt.formatDateTime(lastAssetSyncAt instanceof Date ? lastAssetSyncAt : new Date(lastAssetSyncAt))}` : ""}`
                  : `Asset sync: ${assetSyncStatus}`}
            </span>
          </div>
        )}

        {isMSS && (
          <div className="flex gap-2 pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onTestConnection(integration.id)}
                  disabled={isTestingConnection}
                  data-testid={`button-test-${integration.id}`}
                >
                  {isTestingConnection ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <TestTube className="w-3 h-3 mr-1" />
                  )}
                  Test
                </Button>
              </TooltipTrigger>
              <TooltipContent>Test connection to platform</TooltipContent>
            </Tooltip>
            {integration.status === "connected" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onPullData(integration.id)}
                    disabled={isPullingData}
                    data-testid={`button-pull-${integration.id}`}
                  >
                    {isPullingData ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3 h-3 mr-1" />
                    )}
                    Pull
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Manually pull data now</TooltipContent>
              </Tooltip>
            )}
            {integration.status === "connected" && supportsAssetSync && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onPullAssets?.(integration.id)}
                    disabled={isPullingAssets || assetSyncStatus === "syncing"}
                    data-testid={`button-pull-assets-${integration.id}`}
                  >
                    {(isPullingAssets || assetSyncStatus === "syncing") ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Database className="w-3 h-3 mr-1" />
                    )}
                    Assets
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fetch Asset Inventory</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PollStatusDisplay({ integration }: { integration: SecurityIntegration }) {
  const fmt = useTenantDateFormatter();
  const cfg = (integration.configJson as Record<string, any>) || {};
  const isUpToDate = integration.lastPollMessage?.startsWith("Up to date");
  const lastSuccessAt = cfg.lastSuccessfulPullAt;
  const lastSuccessCount = cfg.lastSuccessfulPullCount;
  const isError = integration.lastPollStatus === "error" || integration.status === "error";

  if (isUpToDate) {
    return (
      <div className="space-y-1" data-testid={`text-poll-message-${integration.id}`}>
        <div className="text-xs p-2 rounded bg-emerald-500/10 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-emerald-700 dark:text-emerald-300">
            Up to date — no new data since {integration.lastPollAt ? fmt.formatDateTime(integration.lastPollAt) : "last check"}
          </span>
        </div>
        {lastSuccessAt && lastSuccessCount > 0 && (
          <div className="text-xs px-2 text-muted-foreground flex items-center gap-1" data-testid={`text-last-success-${integration.id}`}>
            <Activity className="w-3 h-3 shrink-0" />
            Last data: {lastSuccessCount} items on {fmt.formatDateTime(lastSuccessAt)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`text-xs p-2 rounded break-words whitespace-pre-wrap ${
        isError
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      }`}
      data-testid={`text-poll-message-${integration.id}`}
    >
      {isError && (
        <span className="font-medium block mb-0.5">Connection error:</span>
      )}
      {integration.lastPollMessage}
    </div>
  );
}
