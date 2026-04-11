import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";

const SecurityToolsConfigPage = lazy(() => import("@/pages/security-tools-config"));
const InfrastructurePage = lazy(() => import("@/pages/infrastructure"));
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, Users, Shield, Server, Cloud, Database, Network, HardDrive,
  Mail, Monitor, Globe, Plus, Edit2, Trash2, Search, ChevronDown, ChevronRight,
  Phone, UserCheck, Briefcase, MessageSquare, ArrowLeft, LayoutGrid,
  Cpu, Lock, Eye, Wifi, Bug, AppWindow, FolderKanban, ShieldCheck, Loader2
} from "lucide-react";
import { Link } from "wouter";

const STAKEHOLDER_ROLES = [
  "Owner", "Admin", "SME", "Escalation Contact", "Operator", "Manager", "Architect", "Engineer", "Vendor Contact"
];

const CATEGORY_DEFINITIONS: Record<string, {
  label: string;
  icon: any;
  color: string;
  subcategories: string[];
}> = {
  servers: {
    label: "Servers",
    icon: Server,
    color: "#3b82f6",
    subcategories: [
      "Microsoft Windows Server", "Linux - RHEL", "Linux - Ubuntu", "Linux - CentOS",
      "Linux - SUSE", "IBM AIX", "Oracle Solaris", "HP-UX", "VMware ESXi"
    ],
  },
  storage: {
    label: "Storage",
    icon: HardDrive,
    color: "#8b5cf6",
    subcategories: [
      "NetApp", "Dell EMC", "HPE Storage", "Pure Storage", "IBM Storage",
      "Hitachi Vantara", "Nutanix", "Synology", "QNAP"
    ],
  },
  network: {
    label: "Network",
    icon: Network,
    color: "#06b6d4",
    subcategories: [
      "Cisco Networking", "Juniper Networks", "Palo Alto Networks", "Fortinet",
      "Arista Networks", "F5 Networks", "Aruba (HPE)", "MikroTik", "Ubiquiti"
    ],
  },
  cloud: {
    label: "Cloud",
    icon: Cloud,
    color: "#10b981",
    subcategories: [
      "Microsoft Azure", "Amazon Web Services (AWS)", "Google Cloud Platform (GCP)",
      "Oracle Cloud", "IBM Cloud", "Alibaba Cloud", "DigitalOcean", "Linode (Akamai)"
    ],
  },
  security: {
    label: "Security",
    icon: Shield,
    color: "#ef4444",
    subcategories: [
      "Endpoint Protection", "SecOps / SIEM", "Email Security", "Web Security",
      "Cloud Security (CASB/CSPM)", "Network Security", "Vulnerability Management",
      "Identity & Access Management (IAM)", "Data Security / DLP",
      "Threat Intelligence", "Security Awareness Training"
    ],
  },
  applications: {
    label: "Applications",
    icon: AppWindow,
    color: "#f59e0b",
    subcategories: [
      "SAP ERP", "Microsoft Dynamics 365", "Salesforce", "ServiceNow",
      "Oracle EBS", "Workday", "SAP SuccessFactors", "Jira / Confluence (Atlassian)",
      "Zoho", "Adobe Experience Cloud", "HubSpot", "Custom / Internal Applications"
    ],
  },
  databases: {
    label: "Databases",
    icon: Database,
    color: "#ec4899",
    subcategories: [
      "Oracle Database", "Microsoft SQL Server", "PostgreSQL", "MySQL / MariaDB",
      "MongoDB", "Redis", "Elasticsearch", "Cassandra", "IBM Db2", "SAP HANA"
    ],
  },
  collaboration: {
    label: "Collaboration",
    icon: MessageSquare,
    color: "#14b8a6",
    subcategories: [
      "Microsoft 365 (O365)", "Google Workspace", "Slack", "Zoom",
      "Microsoft Teams", "Cisco Webex", "SharePoint", "Dropbox Business",
      "Box", "Miro"
    ],
  },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_DEFINITIONS);

interface StakeholderForm {
  subcategory: string;
  stakeholderName: string;
  stakeholderEmail: string;
  stakeholderRole: string;
  stakeholderPhone: string;
  stakeholderDepartment: string;
  notes: string;
}

const emptyForm: StakeholderForm = {
  subcategory: "", stakeholderName: "", stakeholderEmail: "",
  stakeholderRole: "Owner", stakeholderPhone: "", stakeholderDepartment: "", notes: "",
};

function StakeholderDialog({
  open, onOpenChange, tenantId, category, editData, subcategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  category: string;
  editData?: any;
  subcategories: string[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<StakeholderForm>(
    editData ? {
      subcategory: editData.subcategory || "",
      stakeholderName: editData.stakeholderName || "",
      stakeholderEmail: editData.stakeholderEmail || "",
      stakeholderRole: editData.stakeholderRole || "Owner",
      stakeholderPhone: editData.stakeholderPhone || "",
      stakeholderDepartment: editData.stakeholderDepartment || "",
      notes: editData.notes || "",
    } : { ...emptyForm, subcategory: subcategories[0] || "" }
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/org-stakeholders/${tenantId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-stakeholders", tenantId] });
      toast({ title: "Stakeholder added" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to add stakeholder", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/org-stakeholders/${editData.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-stakeholders", tenantId] });
      toast({ title: "Stakeholder updated" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to update stakeholder", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.stakeholderName || !form.stakeholderEmail || !form.subcategory) {
      toast({ title: "Name, email and subcategory are required", variant: "destructive" });
      return;
    }
    const payload = { ...form, category };
    if (editData) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="stakeholder-dialog">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Stakeholder" : "Add Stakeholder"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Technology / Subcategory</Label>
            <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
              <SelectTrigger data-testid="select-subcategory">
                <SelectValue placeholder="Select technology" />
              </SelectTrigger>
              <SelectContent>
                {subcategories.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name *</Label>
              <Input data-testid="input-stakeholder-name" value={form.stakeholderName} onChange={(e) => setForm({ ...form, stakeholderName: e.target.value })} placeholder="John Smith" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input data-testid="input-stakeholder-email" value={form.stakeholderEmail} onChange={(e) => setForm({ ...form, stakeholderEmail: e.target.value })} placeholder="john@company.com" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Role</Label>
              <Select value={form.stakeholderRole} onValueChange={(v) => setForm({ ...form, stakeholderRole: v })}>
                <SelectTrigger data-testid="select-stakeholder-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAKEHOLDER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input data-testid="input-stakeholder-phone" value={form.stakeholderPhone} onChange={(e) => setForm({ ...form, stakeholderPhone: e.target.value })} placeholder="+1 555-0100" />
            </div>
          </div>
          <div>
            <Label>Department</Label>
            <Input data-testid="input-stakeholder-department" value={form.stakeholderDepartment} onChange={(e) => setForm({ ...form, stakeholderDepartment: e.target.value })} placeholder="IT Infrastructure" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea data-testid="input-stakeholder-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional context..." rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-stakeholder">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-stakeholder">
              {isPending ? "Saving..." : editData ? "Update" : "Add Stakeholder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategorySection({
  categoryKey, tenantId, stakeholders, search,
}: {
  categoryKey: string;
  tenantId: number;
  stakeholders: any[];
  search: string;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<string | null>(null);

  const cat = CATEGORY_DEFINITIONS[categoryKey];
  if (!cat) return null;
  const Icon = cat.icon;

  const catStakeholders = useMemo(() => {
    let list = stakeholders.filter((s) => s.category === categoryKey);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.stakeholderName?.toLowerCase().includes(q) ||
        s.stakeholderEmail?.toLowerCase().includes(q) ||
        s.subcategory?.toLowerCase().includes(q) ||
        s.stakeholderDepartment?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [stakeholders, categoryKey, search]);

  const subcatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cat.subcategories.forEach((s) => { counts[s] = 0; });
    catStakeholders.forEach((s) => {
      if (counts[s.subcategory] !== undefined) counts[s.subcategory]++;
      else counts[s.subcategory] = 1;
    });
    return counts;
  }, [catStakeholders, cat.subcategories]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/org-stakeholders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-stakeholders", tenantId] });
      toast({ title: "Stakeholder removed" });
    },
  });

  const filteredBySubcat = selectedSubcat
    ? catStakeholders.filter((s) => s.subcategory === selectedSubcat)
    : catStakeholders;

  return (
    <Card className="border" data-testid={`category-card-${categoryKey}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`category-toggle-${categoryKey}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cat.color}15` }}>
            <Icon className="w-5 h-5" style={{ color: cat.color }} />
          </div>
          <div>
            <p className="font-semibold text-sm">{cat.label}</p>
            <p className="text-xs text-muted-foreground">{cat.subcategories.length} technologies · {catStakeholders.length} stakeholders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{catStakeholders.length}</Badge>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={selectedSubcat === null ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setSelectedSubcat(null)}
                data-testid="filter-all-subcategories"
              >
                All ({catStakeholders.length})
              </Badge>
              {cat.subcategories.map((sub) => (
                <Badge
                  key={sub}
                  variant={selectedSubcat === sub ? "default" : "outline"}
                  className="cursor-pointer text-[10px]"
                  onClick={() => setSelectedSubcat(sub === selectedSubcat ? null : sub)}
                  data-testid={`filter-subcategory-${sub.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {sub.split(" - ").pop()?.split("(")[0]?.trim() || sub} ({subcatCounts[sub] || 0})
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-1.5 shrink-0 ml-3"
              onClick={(e) => { e.stopPropagation(); setEditItem(null); setDialogOpen(true); }}
              data-testid={`button-add-stakeholder-${categoryKey}`}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {filteredBySubcat.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No stakeholders assigned{selectedSubcat ? ` for ${selectedSubcat}` : ""}</p>
              <p className="text-xs mt-1">Click "Add" to assign a stakeholder</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[11px] font-bold uppercase">Technology</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Name</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Email</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Role</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Department</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Phone</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBySubcat.map((s: any) => (
                    <TableRow key={s.id} data-testid={`stakeholder-row-${s.id}`}>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${cat.color}40`, color: cat.color }}>
                          {s.subcategory?.split(" - ").pop()?.split("(")[0]?.trim() || s.subcategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{s.stakeholderName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.stakeholderEmail}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="text-[10px]">{s.stakeholderRole}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.stakeholderDepartment || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.stakeholderPhone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditItem(s); setDialogOpen(true); }}
                            data-testid={`button-edit-stakeholder-${s.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(s.id)}
                            data-testid={`button-delete-stakeholder-${s.id}`}
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

          {dialogOpen && (
            <StakeholderDialog
              open={dialogOpen}
              onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditItem(null); }}
              tenantId={tenantId}
              category={categoryKey}
              editData={editItem}
              subcategories={cat.subcategories}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function OverviewTab({ tenant, stakeholderCount, toolCount, locationCount }: { tenant: any; stakeholderCount: number; toolCount: number; locationCount: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="stat-stakeholders">
          <CardContent className="pt-6 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-3xl font-extrabold">{stakeholderCount}</p>
            <p className="text-sm text-muted-foreground">Technology Stakeholders</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-security-tools">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <p className="text-3xl font-extrabold">{toolCount}</p>
            <p className="text-sm text-muted-foreground">Security Tools Configured</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-locations">
          <CardContent className="pt-6 text-center">
            <Globe className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p className="text-3xl font-extrabold">{locationCount}</p>
            <p className="text-sm text-muted-foreground">Infrastructure Locations</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Organization</p>
              <p className="text-sm font-semibold" data-testid="text-org-name">{tenant?.name || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Type</p>
              <Badge variant="outline" className="text-xs">{tenant?.type || "—"}</Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Industry</p>
              <p className="text-sm" data-testid="text-org-industry">{tenant?.industry || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contact Email</p>
              <p className="text-sm text-muted-foreground" data-testid="text-org-email">{tenant?.contactEmail || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Timezone</p>
              <p className="text-sm" data-testid="text-org-timezone">{tenant?.timezone || "UTC"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Slug</p>
              <p className="text-sm text-muted-foreground font-mono">{tenant?.slug || "—"}</p>
            </div>
            {tenant?.brandColor && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Brand Color</p>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded border" style={{ backgroundColor: tenant.brandColor }} />
                  <span className="text-sm font-mono">{tenant.brandColor}</span>
                </div>
              </div>
            )}
            {(tenant?.brandColor || (tenant as any)?.logoUrl) && (
              <div className="col-span-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">PDF Branding Preview</p>
                <div className="rounded-lg overflow-hidden border border-border/40 shadow-md" style={{ maxWidth: 480 }} data-testid="pdf-brand-preview">
                  <div className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: `linear-gradient(135deg, ${tenant?.brandColor || "#1e293b"} 0%, #0f172a 100%)` }}>
                    <div className="flex items-center gap-3">
                      {(tenant as any)?.logoUrl ? (
                        <img src={(tenant as any).logoUrl} alt="Brand logo" className="h-6 w-auto max-w-[80px] object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: tenant?.brandColor || "#3b82f6" }}>
                          {tenant?.name?.[0] || "C"}
                        </div>
                      )}
                      <span className="text-white text-xs font-bold tracking-wide uppercase">{tenant?.name || "Organization"}</span>
                    </div>
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full text-white/70 border border-white/20 uppercase tracking-wider">Confidential</span>
                  </div>
                  <div className="bg-slate-950 px-4 py-2 flex items-center justify-between">
                    <span className="text-[9px] text-white/40">Executive Security Briefing</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                      style={{ background: `${tenant?.brandColor || "#3b82f6"}25`, color: tenant?.brandColor || "#3b82f6", border: `1px solid ${tenant?.brandColor || "#3b82f6"}40` }}>
                      SAMPLE
                    </span>
                  </div>
                  <div className="bg-slate-900/80 px-4 py-2 flex gap-3">
                    {["Active Threats", "New IOCs", "SLA Health", "Risk Score"].map((label, i) => (
                      <div key={label} className="flex-1 text-center">
                        <div className="text-sm font-bold text-white">{["—", "—", "—%", "—"][i]}</div>
                        <div className="text-[8px] text-white/30 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-900 px-4 py-1.5 flex items-center justify-between border-t border-white/5">
                    <span className="text-[8px] text-white/20">CYBER COMMAND CENTER</span>
                    <div className="h-0.5 w-12 rounded" style={{ background: tenant?.brandColor || "#3b82f6" }} />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1.5">This preview reflects how your brand colors and logo appear on exported PDF reports.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stakeholder Coverage</CardTitle>
          <CardDescription>Technology domains with assigned stakeholders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CATEGORY_KEYS.map((key) => {
              const cat = CATEGORY_DEFINITIONS[key];
              const Icon = cat.icon;
              return (
                <div key={key} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20" data-testid={`coverage-${key}`}>
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${cat.color}15` }}>
                    <Icon className="w-4 h-4" style={{ color: cat.color }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{cat.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cat.subcategories.length} technologies</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StakeholdersTab({ tenantId, stakeholders, isLoading }: { tenantId: number; stakeholders: any[]; isLoading: boolean }) {
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search stakeholders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-stakeholders"
          />
        </div>
        <Badge variant="secondary" className="text-xs">{stakeholders.length} total stakeholders</Badge>
      </div>
      {CATEGORY_KEYS.map((key) => (
        <CategorySection
          key={key}
          categoryKey={key}
          tenantId={tenantId}
          stakeholders={stakeholders}
          search={search}
        />
      ))}
    </div>
  );
}

export default function MyOrganizationPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const [activeTab, setActiveTab] = useState("overview");

  const { data: stakeholders = [], isLoading: stakeholdersLoading } = useQuery<any[]>({
    queryKey: ["/api/org-stakeholders", tenantId],
    queryFn: async () => {
      const r = await fetch(`/api/org-stakeholders/${tenantId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!tenantId,
  });

  const { data: tools = [] } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "security-tools"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/security-tools`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!tenantId,
  });

  const { data: topology } = useQuery<any>({
    queryKey: ["/api/infrastructure", tenantId, "topology"],
    queryFn: async () => {
      const r = await fetch(`/api/infrastructure/${tenantId}/topology`, { credentials: "include" });
      if (!r.ok) return { locations: [] };
      return r.json();
    },
    enabled: !!tenantId,
  });

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No Organization Selected</p>
          <p className="text-sm">Please select a tenant to view organization details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-admin">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-page-title">My Organization</h1>
              <p className="text-sm text-muted-foreground">{currentTenant?.name} — Stakeholders, Security Tools & Infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="my-org-tabs">
            <TabsTrigger value="overview" data-testid="tab-overview" className="gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="stakeholders" data-testid="tab-stakeholders" className="gap-1.5">
              <Users className="w-3.5 h-3.5" /> Stakeholders
            </TabsTrigger>
            <TabsTrigger value="security-tools" data-testid="tab-security-tools" className="gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Security Tools
            </TabsTrigger>
            <TabsTrigger value="infrastructure" data-testid="tab-infrastructure" className="gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Infrastructure
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              tenant={currentTenant}
              stakeholderCount={stakeholders.length}
              toolCount={tools.length}
              locationCount={topology?.locations?.length || 0}
            />
          </TabsContent>

          <TabsContent value="stakeholders">
            <StakeholdersTab tenantId={tenantId} stakeholders={stakeholders} isLoading={stakeholdersLoading} />
          </TabsContent>

          <TabsContent value="security-tools">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
              <SecurityToolsConfigPage />
            </Suspense>
          </TabsContent>

          <TabsContent value="infrastructure">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
              <InfrastructurePage />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
