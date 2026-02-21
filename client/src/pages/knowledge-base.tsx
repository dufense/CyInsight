import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document } from "@shared/schema";
import {
  Plus,
  Search,
  FileText,
  BookOpen,
  ClipboardList,
  Shield,
  Server,
  GraduationCap,
  Layers,
  FolderOpen,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Sparkles,
  ArrowLeft,
  Globe,
  Lock,
  Archive,
  CheckCircle2,
  FileEdit,
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const CATEGORIES = [
  { id: "all", label: "All Documents", icon: FolderOpen },
  { id: "knowledge_transfer", label: "Knowledge Transfer", icon: BookOpen },
  { id: "implementation", label: "Implementation Docs", icon: Server },
  { id: "sop", label: "SOPs", icon: ClipboardList },
  { id: "runbook", label: "Runbooks", icon: FileText },
  { id: "policy", label: "Policies", icon: Shield },
  { id: "architecture", label: "Architecture", icon: Layers },
  { id: "training", label: "Training", icon: GraduationCap },
  { id: "other", label: "Other", icon: FileEdit },
];

const CATEGORY_COLORS: Record<string, string> = {
  knowledge_transfer: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  implementation: "bg-green-500/10 text-green-600 dark:text-green-400",
  sop: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  runbook: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  policy: "bg-red-500/10 text-red-600 dark:text-red-400",
  architecture: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  training: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  other: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const STATUS_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  draft: { icon: FileEdit, color: "text-muted-foreground", label: "Draft" },
  published: { icon: CheckCircle2, color: "text-chart-2", label: "Published" },
  archived: { icon: Archive, color: "text-muted-foreground", label: "Archived" },
};

function DocumentViewer({ doc, onBack, isMSS, onEdit }: {
  doc: Document;
  onBack: () => void;
  isMSS: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4 p-6 overflow-y-auto h-full" data-testid="section-document-viewer">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {isMSS && (
            <Button variant="secondary" size="sm" onClick={onEdit} data-testid="button-edit-document">
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
          <Badge variant={doc.customerVisible ? "default" : "secondary"} className="text-[10px]">
            {doc.customerVisible ? <><Globe className="w-3 h-3 mr-1" /> Customer Visible</> : <><Lock className="w-3 h-3 mr-1" /> Internal</>}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[doc.category] || ""}`}>
            {CATEGORIES.find(c => c.id === doc.category)?.label || doc.category}
          </Badge>
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Last updated: {new Date(doc.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {doc.tags && ` · Tags: ${doc.tags}`}
        </p>
      </div>
      <Card>
        <CardContent className="p-6 prose prose-sm dark:prose-invert max-w-none">
          {doc.content ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{doc.content}</div>
          ) : (
            <p className="text-muted-foreground italic">No content yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentCard({ doc, onClick, isMSS, onDelete, onToggleVisibility }: {
  doc: Document;
  onClick: () => void;
  isMSS: boolean;
  onDelete: (id: number) => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
}) {
  const catInfo = CATEGORIES.find(c => c.id === doc.category);
  const CatIcon = catInfo?.icon || FileText;
  const statusInfo = STATUS_ICONS[doc.status] || STATUS_ICONS.draft;
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="hover-elevate cursor-pointer group" data-testid={`card-document-${doc.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${CATEGORY_COLORS[doc.category] || "bg-muted"}`}>
            <CatIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0" onClick={onClick}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium truncate">{doc.title}</h3>
              <Badge variant="outline" className={`text-[9px] ${statusInfo.color}`}>
                <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                {statusInfo.label}
              </Badge>
              {doc.customerVisible && (
                <Badge variant="secondary" className="text-[9px]">
                  <Globe className="w-2.5 h-2.5 mr-0.5" />
                  Customer
                </Badge>
              )}
            </div>
            {doc.content && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{doc.content.substring(0, 150)}</p>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">
                {new Date(doc.updatedAt).toLocaleDateString()}
              </span>
              {doc.tags && (
                <div className="flex items-center gap-1">
                  {doc.tags.split(",").slice(0, 3).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">{tag.trim()}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          {isMSS && (
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(doc.id, !doc.customerVisible); }}
                data-testid={`button-toggle-visibility-${doc.id}`}
              >
                {doc.customerVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                data-testid={`button-delete-document-${doc.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function KnowledgeBasePage() {
  const { currentTenant, isMSS } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("knowledge_transfer");
  const [formStatus, setFormStatus] = useState("draft");
  const [formTags, setFormTags] = useState("");
  const [formCustomerVisible, setFormCustomerVisible] = useState(false);
  const [aiContext, setAiContext] = useState("");

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/documents", { ...data, tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      resetForm();
      setDialogOpen(false);
      toast({ title: "Document created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (viewingDoc) setViewingDoc(data);
      resetForm();
      setDialogOpen(false);
      setEditingDoc(null);
      toast({ title: "Document updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/documents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document deleted" });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, customerVisible }: { id: number; customerVisible: boolean }) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}`, { customerVisible });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/generate-document", data);
      return res.json();
    },
    onSuccess: (data) => {
      setFormContent(data.content || "");
      toast({ title: "Content generated by AI", description: "Review and edit the content before saving." });
    },
    onError: () => {
      toast({ title: "AI generation failed", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormCategory("knowledge_transfer");
    setFormStatus("draft");
    setFormTags("");
    setFormCustomerVisible(false);
    setAiContext("");
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingDoc(null);
    setDialogOpen(true);
  };

  const openEditDialog = (doc: Document) => {
    setEditingDoc(doc);
    setFormTitle(doc.title);
    setFormContent(doc.content || "");
    setFormCategory(doc.category);
    setFormStatus(doc.status);
    setFormTags(doc.tags || "");
    setFormCustomerVisible(doc.customerVisible);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formTitle.trim()) return;
    const payload = {
      title: formTitle,
      content: formContent,
      category: formCategory,
      status: formStatus,
      tags: formTags || null,
      customerVisible: formCustomerVisible,
    };
    if (editingDoc) {
      updateMutation.mutate({ id: editingDoc.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = useMemo(() => {
    let docs = documents;
    if (activeCategory !== "all") {
      docs = docs.filter(d => d.category === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.content?.toLowerCase().includes(q) ||
        d.tags?.toLowerCase().includes(q)
      );
    }
    return docs;
  }, [documents, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length };
    documents.forEach(d => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [documents]);

  if (viewingDoc) {
    return (
      <DocumentViewer
        doc={viewingDoc}
        onBack={() => setViewingDoc(null)}
        isMSS={isMSS}
        onEdit={() => { openEditDialog(viewingDoc); setViewingDoc(null); }}
      />
    );
  }

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge Base</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- {documents.length} documents
          </p>
        </div>
        {isMSS && (
          <Button size="sm" onClick={openCreateDialog} data-testid="button-create-document">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Document
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-documents"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const count = categoryCounts[cat.id] || 0;
          return (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "default" : "secondary"}
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
              data-testid={`button-category-${cat.id}`}
              className="text-xs"
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {cat.label}
              {count > 0 && <Badge variant="outline" className="ml-1.5 text-[9px] px-1.5 py-0">{count}</Badge>}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No documents found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try adjusting your search" : isMSS ? "Create your first document to get started" : "No documents available yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => setViewingDoc(doc)}
              isMSS={isMSS}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggleVisibility={(id, visible) => toggleVisibilityMutation.mutate({ id, customerVisible: visible })}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Document" : "Create Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Document title"
                data-testid="input-document-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger data-testid="select-document-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c.id !== "all").map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger data-testid="select-document-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="e.g. security, onboarding, firewall"
                data-testid="input-document-tags"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formCustomerVisible}
                onCheckedChange={setFormCustomerVisible}
                data-testid="switch-customer-visible"
              />
              <Label className="text-sm">
                {formCustomerVisible ? (
                  <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Visible to customers</span>
                ) : (
                  <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Internal only</span>
                )}
              </Label>
            </div>

            {!editingDoc && (
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">AI Content Generation</span>
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      placeholder="Describe what you need (optional context for AI)..."
                      rows={2}
                      className="text-xs"
                      data-testid="input-ai-context"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!formTitle || aiGenerateMutation.isPending}
                      onClick={() => aiGenerateMutation.mutate({
                        tenantId: currentTenant?.id,
                        title: formTitle,
                        category: formCategory,
                        context: aiContext,
                      })}
                      data-testid="button-ai-generate"
                    >
                      {aiGenerateMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {aiGenerateMutation.isPending ? "Generating..." : "Generate with AI"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Document content (supports Markdown)..."
                rows={12}
                className="font-mono text-xs"
                data-testid="input-document-content"
              />
            </div>

            <Button
              className="w-full"
              disabled={!formTitle || createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-submit-document"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingDoc ? "Update Document" : "Create Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
