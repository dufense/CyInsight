import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Ticket } from "@shared/schema";
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-chart-4/10 text-chart-4",
  medium: "bg-chart-1/10 text-chart-1",
  low: "bg-chart-2/10 text-chart-2",
};

const STATUS_ICONS: Record<string, any> = {
  open: AlertCircle,
  in_progress: Loader2,
  waiting: Clock,
  resolved: CheckCircle2,
  closed: CheckCircle2,
};

function TicketCard({ ticket, isMSS, onStatusChange }: { ticket: Ticket; isMSS: boolean; onStatusChange: (id: number, status: string) => void }) {
  const Icon = STATUS_ICONS[ticket.status] || AlertCircle;

  return (
    <Card className="hover-elevate" data-testid={`card-ticket-${ticket.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${
              ticket.status === "open" ? "bg-destructive/10" :
              ticket.status === "in_progress" ? "bg-chart-4/10" :
              "bg-chart-2/10"
            }`}>
              <Icon className={`w-4 h-4 ${
                ticket.status === "open" ? "text-destructive" :
                ticket.status === "in_progress" ? "text-chart-4" :
                "text-chart-2"
              }`} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground">TKT-{String(ticket.id).padStart(4, "0")}</span>
                <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[ticket.priority]}`}>
                  {ticket.priority}
                </Badge>
              </div>
              <h3 className="text-sm font-medium truncate">{ticket.title}</h3>
              {ticket.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
                {ticket.category && (
                  <Badge variant="secondary" className="text-[10px]">{ticket.category}</Badge>
                )}
              </div>
            </div>
          </div>
          {isMSS && (
            <Select
              value={ticket.status}
              onValueChange={(status) => onStatusChange(ticket.id, status)}
            >
              <SelectTrigger className="h-7 text-[10px] w-[110px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TicketsPage() {
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("open");

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tickets", { ...data, tenantId: currentTenant?.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setDialogOpen(false);
      toast({ title: "Ticket created", description: "Your support ticket has been submitted." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/tickets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    },
  });

  const filteredByTab = tickets.filter((t) => {
    if (activeTab === "open") return t.status === "open" || t.status === "in_progress";
    if (activeTab === "waiting") return t.status === "waiting";
    if (activeTab === "resolved") return t.status === "resolved" || t.status === "closed";
    return true;
  });

  const filtered = filteredByTab.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = tickets.filter(t => t.status === "open" || t.status === "in_progress").length;
  const waitingCount = tickets.filter(t => t.status === "waiting").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      category: formData.get("category"),
    });
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Support Tickets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTenant?.name} -- {tickets.length} total tickets
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-create-ticket">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-title">Subject</Label>
                <Input id="ticket-title" name="title" required data-testid="input-ticket-title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-desc">Description</Label>
                <Textarea id="ticket-desc" name="description" rows={4} data-testid="input-ticket-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue="medium">
                    <SelectTrigger data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue="general">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="incident">Incident</SelectItem>
                      <SelectItem value="access">Access Request</SelectItem>
                      <SelectItem value="configuration">Configuration</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-ticket">
                {createMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open">
            Open ({openCount})
          </TabsTrigger>
          <TabsTrigger value="waiting" data-testid="tab-waiting">
            Waiting ({waitingCount})
          </TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">
            Resolved ({resolvedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No tickets found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search ? "Try adjusting your search" : `No ${activeTab} tickets at the moment`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isMSS={isMSS}
                  onStatusChange={(id, status) => updateMutation.mutate({ id, status })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
