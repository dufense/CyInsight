import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SecurityIntegration } from "@shared/schema";
import { SECURITY_PLATFORMS, INTEGRATION_CATEGORIES } from "@shared/schema";
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
  ChevronDown,
  ChevronRight,
  Globe,
  Server,
  Eye,
  EyeOff,
  ShieldCheck,
  Cloud,
  Lock,
  Mail,
  MonitorSmartphone,
  Radar,
  Bug,
  Users,
  Network,
  BarChart3,
  Workflow,
  Wrench,
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

export default function SecurityIntegrationsPage() {
  const { currentTenant, isMSS } = useTenant();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("connected");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<SecurityIntegration | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<typeof SECURITY_PLATFORMS[number] | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [pollingInterval, setPollingInterval] = useState("15");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(INTEGRATION_CATEGORIES.map(c => c.key)));

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
      toast({ title: "Removed", description: "Integration removed successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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

  function resetForm() {
    setSelectedPlatform(null);
    setApiUrl("");
    setApiKeyValue("");
    setShowApiKey(false);
    setPollingEnabled(false);
    setPollingInterval("15");
  }

  function handleAddIntegration() {
    if (!selectedPlatform || !tenantId) return;
    createMutation.mutate({
      platformKey: selectedPlatform.key,
      platformName: selectedPlatform.name,
      category: selectedPlatform.category,
      authType: selectedPlatform.authType,
      apiBaseUrl: apiUrl || null,
      pollingEnabled,
      pollingIntervalMinutes: parseInt(pollingInterval),
      description: selectedPlatform.description,
      configJson: apiKeyValue ? { apiKey: "***configured***" } : null,
      isEnabled: true,
    });
  }

  function handleUpdateIntegration() {
    if (!selectedIntegration) return;
    updateMutation.mutate({
      id: selectedIntegration.id,
      data: {
        apiBaseUrl: apiUrl || null,
        pollingEnabled,
        pollingIntervalMinutes: parseInt(pollingInterval),
        isEnabled: selectedIntegration.isEnabled,
      },
    });
  }

  function openConfigDialog(integration: SecurityIntegration) {
    setSelectedIntegration(integration);
    setApiUrl(integration.apiBaseUrl || "");
    setPollingEnabled(integration.pollingEnabled);
    setPollingInterval(String(integration.pollingIntervalMinutes || 15));
    setConfigDialogOpen(true);
  }

  const connectedIntegrations = integrations.filter(i => i.status === "connected");
  const allConfigured = integrations;
  const availablePlatforms = SECURITY_PLATFORMS.filter(
    p => !integrations.find(i => i.platformKey === p.key)
  );

  const filteredPlatforms = availablePlatforms.filter(p => {
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredIntegrations = integrations.filter(i => {
    const matchesSearch = !searchQuery ||
      i.platformName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || i.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const platformsByCategory = INTEGRATION_CATEGORIES.reduce((acc, cat) => {
    const platforms = filteredPlatforms.filter(p => p.category === cat.key);
    if (platforms.length > 0) {
      acc[cat.key] = platforms;
    }
    return acc;
  }, {} as Record<string, typeof SECURITY_PLATFORMS[number][]>);

  const toggleCategory = (key: string) => {
    const next = new Set(expandedCategories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedCategories(next);
  };

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
              {connectedIntegrations.filter(i => {
                const matchesSearch = !searchQuery || i.platformName.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesCategory = selectedCategory === "all" || i.category === selectedCategory;
                return matchesSearch && matchesCategory;
              }).map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  isMSS={isMSS}
                  onConfigure={openConfigDialog}
                  onTestConnection={(id) => testConnectionMutation.mutate(id)}
                  onPullData={(id) => pullDataMutation.mutate(id)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isTestingConnection={testConnectionMutation.isPending}
                  isPullingData={pullDataMutation.isPending}
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
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isTestingConnection={testConnectionMutation.isPending}
                  isPullingData={pullDataMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="catalog" className="mt-4">
          {Object.keys(platformsByCategory).length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">All Platforms Configured</h3>
                <p className="text-muted-foreground">You've added all available security platforms.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(platformsByCategory).map(([catKey, platforms]) => (
                <Card key={catKey}>
                  <CardHeader
                    className="cursor-pointer py-3 px-4"
                    onClick={() => toggleCategory(catKey)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={catKey} className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">{getCategoryName(catKey)}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{platforms.length}</Badge>
                      </div>
                      {expandedCategories.has(catKey) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedCategories.has(catKey) && (
                    <CardContent className="pt-0 pb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {platforms.map(platform => (
                          <div
                            key={platform.key}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            data-testid={`card-platform-${platform.key}`}
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <h4 className="font-medium text-sm truncate">{platform.name}</h4>
                              <p className="text-xs text-muted-foreground truncate">{platform.description}</p>
                              <Badge variant="outline" className="text-xs mt-1">{platform.authType}</Badge>
                            </div>
                            {isMSS && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedPlatform(platform as any);
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
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                  if (p) setSelectedPlatform(p as any);
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

                <div className="space-y-2">
                  <Label>API Base URL</Label>
                  <Input
                    placeholder="https://api.example.com/v1"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    data-testid="input-api-url"
                  />
                </div>

                <div className="space-y-2">
                  <Label>API Key / Token</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key..."
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      data-testid="input-api-key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>

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
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleAddIntegration}
              disabled={!selectedPlatform || createMutation.isPending}
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
        <DialogContent className="max-w-lg" data-testid="dialog-config-integration">
          <DialogHeader>
            <DialogTitle>Configure Integration</DialogTitle>
            <DialogDescription>
              {selectedIntegration?.platformName}
            </DialogDescription>
          </DialogHeader>
          {selectedIntegration && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Base URL</Label>
                <Input
                  placeholder="https://api.example.com/v1"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  data-testid="input-config-api-url"
                />
              </div>

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
    </div>
  );
}

function IntegrationCard({
  integration,
  isMSS,
  onConfigure,
  onTestConnection,
  onPullData,
  onDelete,
  isTestingConnection,
  isPullingData,
}: {
  integration: SecurityIntegration;
  isMSS: boolean;
  onConfigure: (i: SecurityIntegration) => void;
  onTestConnection: (id: number) => void;
  onPullData: (id: number) => void;
  onDelete: (id: number) => void;
  isTestingConnection: boolean;
  isPullingData: boolean;
}) {
  const statusStyle = STATUS_STYLES[integration.status] || STATUS_STYLES.disconnected;
  const StatusIcon = statusStyle.icon;

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
            <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0 text-xs`} data-testid={`badge-status-${integration.id}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {integration.status}
            </Badge>
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
                    <DropdownMenuItem onClick={() => onPullData(integration.id)} data-testid={`menu-pull-${integration.id}`}>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Pull Data Now
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(integration.id)}
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
                ? new Date(integration.lastPollAt).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>

        {integration.lastPollMessage && (
          <div className="text-xs p-2 rounded bg-muted truncate" data-testid={`text-poll-message-${integration.id}`}>
            {integration.lastPollMessage}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
