import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  SECURITY_TOOL_CATEGORY_DEFINITIONS,
  POPULAR_SECURITY_TOOLS,
} from "@shared/schema";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  Monitor,
  Mail,
  BarChart3,
  Lock,
  Globe,
  Network,
  Users,
  HardDrive,
  Bug,
  RefreshCw,
  Cloud,
  Workflow,
  Radar,
  ShieldCheck,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
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
import { Slider } from "@/components/ui/slider";

const ICON_MAP: Record<string, any> = {
  Monitor,
  Mail,
  BarChart3,
  Lock,
  Globe,
  Network,
  Shield,
  ShieldCheck,
  Users,
  HardDrive,
  Bug,
  KeyRound: Lock,
  RefreshCw,
  Cloud,
  Workflow,
  Radar,
};

const DEPLOYMENT_STATUS_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  deployed: { label: "Deployed", variant: "default" },
  partial: { label: "Partial", variant: "secondary" },
  planned: { label: "Planned", variant: "outline" },
  not_deployed: { label: "Not Deployed", variant: "destructive" },
};

type SecurityToolRow = {
  id: number;
  tenant_id: number;
  category: string;
  tool_name: string;
  vendor: string;
  deployment_status: string;
  coverage_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export default function SecurityToolsConfigPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<SecurityToolRow | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const [toolSource, setToolSource] = useState<"popular" | "custom">("popular");
  const [selectedPopularTool, setSelectedPopularTool] = useState<string>("");
  const [customToolName, setCustomToolName] = useState("");
  const [customVendor, setCustomVendor] = useState("");
  const [deploymentStatus, setDeploymentStatus] = useState("deployed");
  const [coveragePercent, setCoveragePercent] = useState(100);
  const [notes, setNotes] = useState("");

  const tenantId = currentTenant?.id;

  const { data: tools = [], isLoading } = useQuery<SecurityToolRow[]>({
    queryKey: ["/api/tenants", tenantId, "security-tools"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/security-tools`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch security tools");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/security-tools`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-tools"] });
      toast({ title: "Tool Added", description: "Security tool configured successfully." });
      setAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/tenants/${tenantId}/security-tools/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-tools"] });
      toast({ title: "Updated", description: "Security tool updated." });
      setEditDialogOpen(false);
      setEditingTool(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tenants/${tenantId}/security-tools/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "security-tools"] });
      toast({ title: "Removed", description: "Security tool removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setToolSource("popular");
    setSelectedPopularTool("");
    setCustomToolName("");
    setCustomVendor("");
    setDeploymentStatus("deployed");
    setCoveragePercent(100);
    setNotes("");
    setSelectedCategory(null);
  }

  function openAddDialog(categoryKey: string) {
    resetForm();
    setSelectedCategory(categoryKey);
    setAddDialogOpen(true);
  }

  function openEditDialog(tool: SecurityToolRow) {
    setEditingTool(tool);
    setCustomToolName(tool.tool_name);
    setCustomVendor(tool.vendor);
    setDeploymentStatus(tool.deployment_status);
    setCoveragePercent(tool.coverage_percent);
    setNotes(tool.notes || "");
    setEditDialogOpen(true);
  }

  function handleAdd() {
    if (!selectedCategory) return;
    let toolName = "";
    let vendor = "";

    if (toolSource === "popular" && selectedPopularTool) {
      const popularTools = POPULAR_SECURITY_TOOLS[selectedCategory] || [];
      const found = popularTools.find(t => t.name === selectedPopularTool);
      if (found) {
        toolName = found.name;
        vendor = found.vendor;
      }
    } else if (toolSource === "custom") {
      toolName = customToolName.trim();
      vendor = customVendor.trim();
    }

    if (!toolName || !vendor) {
      toast({ title: "Missing Fields", description: "Please select or enter a tool name and vendor.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      category: selectedCategory,
      toolName,
      vendor,
      deploymentStatus,
      coveragePercent,
      notes: notes.trim() || null,
    });
  }

  function handleUpdate() {
    if (!editingTool) return;
    updateMutation.mutate({
      id: editingTool.id,
      data: {
        category: editingTool.category,
        toolName: customToolName.trim(),
        vendor: customVendor.trim(),
        deploymentStatus,
        coveragePercent,
        notes: notes.trim() || null,
      },
    });
  }

  function toggleCategory(key: string) {
    const next = new Set(collapsedCategories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedCategories(next);
  }

  const toolsByCategory = SECURITY_TOOL_CATEGORY_DEFINITIONS.reduce((acc, cat) => {
    acc[cat.key] = tools.filter(t => t.category === cat.key);
    return acc;
  }, {} as Record<string, SecurityToolRow[]>);

  const totalTools = tools.length;
  const categoriesCovered = new Set(tools.map(t => t.category)).size;
  const totalCategories = SECURITY_TOOL_CATEGORY_DEFINITIONS.length;
  const categoriesWithGaps = totalCategories - categoriesCovered;

  function getCategoryIcon(iconName: string) {
    return ICON_MAP[iconName] || Wrench;
  }

  if (!currentTenant) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Select a tenant to configure security tools.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="security-tools-config-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShieldCheck className="w-6 h-6" />
            Security Tools Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your security tool stack per category for {currentTenant.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-stat-total-tools">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-tools">{totalTools}</p>
              <p className="text-xs text-muted-foreground">Total Tools Configured</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-categories-covered">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-categories-covered">{categoriesCovered}/{totalCategories}</p>
              <p className="text-xs text-muted-foreground">Categories Covered</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-gaps">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/10">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-gaps">{categoriesWithGaps}</p>
              <p className="text-xs text-muted-foreground">Categories with Gaps</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECURITY_TOOL_CATEGORY_DEFINITIONS.map(catDef => {
            const CategoryIcon = getCategoryIcon(catDef.icon);
            const categoryTools = toolsByCategory[catDef.key] || [];
            const hasTools = categoryTools.length > 0;
            const isCollapsed = collapsedCategories.has(catDef.key);

            return (
              <Card key={catDef.key} data-testid={`card-category-${catDef.key}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                    onClick={() => toggleCategory(catDef.key)}
                    data-testid={`toggle-category-${catDef.key}`}
                  >
                    <div className={`p-1.5 rounded-md ${hasTools ? "bg-primary/10" : "bg-muted"}`}>
                      <CategoryIcon className={`w-4 h-4 ${hasTools ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-medium">{catDef.name}</CardTitle>
                      <p className="text-[10px] text-muted-foreground truncate">{catDef.description}</p>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasTools && (
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-count-${catDef.key}`}>
                        {categoryTools.length}
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openAddDialog(catDef.key)}
                      data-testid={`button-add-tool-${catDef.key}`}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="pt-0">
                    {!hasTools ? (
                      <div className="py-4 text-center">
                        <XCircle className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">No tools configured</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => openAddDialog(catDef.key)}
                          data-testid={`button-add-first-${catDef.key}`}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Tool
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {categoryTools.map(tool => {
                          const statusStyle = DEPLOYMENT_STATUS_STYLES[tool.deployment_status] || DEPLOYMENT_STATUS_STYLES.deployed;
                          return (
                            <div
                              key={tool.id}
                              className="flex items-center justify-between gap-2 p-2 rounded-md border"
                              data-testid={`tool-item-${tool.id}`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate" data-testid={`text-tool-name-${tool.id}`}>{tool.tool_name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{tool.vendor}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant={statusStyle.variant} className="text-[10px]" data-testid={`badge-status-${tool.id}`}>
                                  {statusStyle.label}
                                </Badge>
                                {tool.coverage_percent < 100 && (
                                  <Badge variant="outline" className="text-[10px]" data-testid={`badge-coverage-${tool.id}`}>
                                    {tool.coverage_percent}%
                                  </Badge>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEditDialog(tool)}
                                  data-testid={`button-edit-tool-${tool.id}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteMutation.mutate(tool.id)}
                                  data-testid={`button-delete-tool-${tool.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-add-dialog-title">
              Add Security Tool
            </DialogTitle>
            <DialogDescription>
              {selectedCategory && (
                <>Add a tool to {SECURITY_TOOL_CATEGORY_DEFINITIONS.find(c => c.key === selectedCategory)?.name || selectedCategory}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={toolSource} onValueChange={(v) => { setToolSource(v as "popular" | "custom"); setSelectedPopularTool(""); }}>
                <SelectTrigger data-testid="select-tool-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Popular Tools</SelectItem>
                  <SelectItem value="custom">Custom Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {toolSource === "popular" && selectedCategory && (
              <div className="space-y-2">
                <Label>Select Tool</Label>
                <Select value={selectedPopularTool} onValueChange={setSelectedPopularTool}>
                  <SelectTrigger data-testid="select-popular-tool">
                    <SelectValue placeholder="Choose a tool..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(POPULAR_SECURITY_TOOLS[selectedCategory] || []).map(tool => (
                      <SelectItem key={tool.name} value={tool.name}>
                        {tool.name} ({tool.vendor})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {toolSource === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Tool Name</Label>
                  <Input
                    value={customToolName}
                    onChange={(e) => setCustomToolName(e.target.value)}
                    placeholder="e.g., My Custom Tool"
                    data-testid="input-custom-tool-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input
                    value={customVendor}
                    onChange={(e) => setCustomVendor(e.target.value)}
                    placeholder="e.g., Vendor Inc."
                    data-testid="input-custom-vendor"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Deployment Status</Label>
              <Select value={deploymentStatus} onValueChange={setDeploymentStatus}>
                <SelectTrigger data-testid="select-deployment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deployed">Deployed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="not_deployed">Not Deployed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Coverage</Label>
                <span className="text-xs text-muted-foreground">{coveragePercent}%</span>
              </div>
              <Slider
                value={[coveragePercent]}
                onValueChange={([v]) => setCoveragePercent(v)}
                min={0}
                max={100}
                step={5}
                data-testid="slider-coverage"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="resize-none"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending} data-testid="button-confirm-add">
              {createMutation.isPending ? "Adding..." : "Add Tool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-dialog-title">Edit Security Tool</DialogTitle>
            <DialogDescription>Update tool configuration</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tool Name</Label>
              <Input
                value={customToolName}
                onChange={(e) => setCustomToolName(e.target.value)}
                data-testid="input-edit-tool-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={customVendor}
                onChange={(e) => setCustomVendor(e.target.value)}
                data-testid="input-edit-vendor"
              />
            </div>
            <div className="space-y-2">
              <Label>Deployment Status</Label>
              <Select value={deploymentStatus} onValueChange={setDeploymentStatus}>
                <SelectTrigger data-testid="select-edit-deployment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deployed">Deployed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="not_deployed">Not Deployed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Coverage</Label>
                <span className="text-xs text-muted-foreground">{coveragePercent}%</span>
              </div>
              <Slider
                value={[coveragePercent]}
                onValueChange={([v]) => setCoveragePercent(v)}
                min={0}
                max={100}
                step={5}
                data-testid="slider-edit-coverage"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="resize-none"
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-confirm-edit">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
