import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Service, SlaDefinition } from "@shared/schema";
import {
  Plus,
  Shield,
  Clock,
  Target,
  ArrowUpRight,
  CalendarDays,
  DollarSign,
  Trash2,
  ChevronDown,
  ChevronRight,
  Server,
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

const SERVICE_TYPES: Record<string, string> = {
  managed_soc: "Managed SOC",
  vulnerability_management: "Vulnerability Management",
  email_security: "Email Security",
  endpoint_protection: "Endpoint Protection",
  cloud_security: "Cloud Security",
  compliance_advisory: "Compliance Advisory",
  incident_response: "Incident Response",
  penetration_testing: "Penetration Testing",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-chart-2/10 text-chart-2",
  inactive: "bg-muted text-muted-foreground",
  pending: "bg-chart-1/10 text-chart-1",
  suspended: "bg-destructive/10 text-destructive",
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SlaRow({
  sla,
  isMSS,
  onDelete,
}: {
  sla: SlaDefinition;
  isMSS: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
      data-testid={`row-sla-${sla.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        <span className="text-xs font-medium">{sla.name}</span>
        <Badge variant="outline" className="text-[10px]">
          {sla.priority}
        </Badge>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Response</p>
          <p className="text-xs font-medium">{formatMinutes(sla.responseTimeMinutes)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Resolution</p>
          <p className="text-xs font-medium">{formatMinutes(sla.resolutionTimeMinutes)}</p>
        </div>
        {sla.uptimePercentage && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Uptime</p>
            <p className="text-xs font-medium">{sla.uptimePercentage}%</p>
          </div>
        )}
        {isMSS && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(sla.id)}
            data-testid={`button-delete-sla-${sla.id}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  isMSS,
  isExpanded,
  onToggle,
  onAddSla,
}: {
  service: Service;
  isMSS: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onAddSla: (serviceId: number) => void;
}) {
  const { data: slas = [], isLoading: slasLoading } = useQuery<SlaDefinition[]>({
    queryKey: ["/api/sla-definitions", service.id],
    enabled: isExpanded,
  });

  const deleteSla = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sla-definitions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sla-definitions", service.id] });
    },
  });

  return (
    <Card className="hover-elevate" data-testid={`card-service-${service.id}`}>
      <CardContent className="p-4">
        <div
          className="flex items-start justify-between gap-3 cursor-pointer"
          onClick={onToggle}
          data-testid={`button-toggle-service-${service.id}`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-md shrink-0 bg-chart-1/10">
              <Shield className="w-4 h-4 text-chart-1" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium">{service.name}</h3>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${STATUS_STYLES[service.status] || ""}`}
                >
                  {service.status}
                </Badge>
              </div>
              {service.serviceType && (
                <p className="text-xs text-muted-foreground">
                  {SERVICE_TYPES[service.serviceType] || service.serviceType}
                </p>
              )}
              {service.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{service.description}</p>
              )}
              <div className="flex items-center gap-4 pt-1 flex-wrap">
                {service.msaStartDate && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="w-2.5 h-2.5" />
                    {new Date(service.msaStartDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {service.msaEndDate && (
                      <>
                        {" - "}
                        {new Date(service.msaEndDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </>
                    )}
                  </span>
                )}
                {service.contractValue && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" />
                    {service.contractValue}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 mt-1">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-xs font-medium">SLA Definitions</h4>
              {isMSS && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSla(service.id);
                  }}
                  data-testid={`button-add-sla-${service.id}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add SLA
                </Button>
              )}
            </div>
            {slasLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : slas.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No SLA definitions configured
              </p>
            ) : (
              <div>
                {slas.map((sla) => (
                  <SlaRow
                    key={sla.id}
                    sla={sla}
                    isMSS={isMSS}
                    onDelete={(id) => deleteSla.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getUptimeColor(uptime: string | null): string {
  if (!uptime) return "bg-muted text-muted-foreground";
  const val = parseFloat(uptime);
  if (val >= 99.9) return "bg-chart-2/10 text-chart-2";
  if (val >= 99.0) return "bg-chart-1/10 text-chart-1";
  return "bg-destructive/10 text-destructive";
}

function getResponseColor(minutes: number): string {
  if (minutes <= 15) return "bg-chart-2/10 text-chart-2";
  if (minutes <= 60) return "bg-chart-1/10 text-chart-1";
  return "bg-destructive/10 text-destructive";
}

function SlaDashboard({ services }: { services: Service[] }) {
  const activeServices = services.filter((s) => s.status === "active");

  const slaQueries = activeServices.map((service) => ({
    service,
    query: useQuery<SlaDefinition[]>({
      queryKey: ["/api/sla-definitions", service.id],
    }),
  }));

  const isLoading = slaQueries.some((q) => q.query.isLoading);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (activeServices.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No active services</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create services to see SLA compliance data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {slaQueries.map(({ service, query }) => {
        const slas = query.data || [];
        if (slas.length === 0) return null;

        return (
          <Card key={service.id} data-testid={`card-sla-dashboard-${service.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{service.name}</CardTitle>
              <Badge
                variant="outline"
                className={`text-[10px] ${STATUS_STYLES[service.status] || ""}`}
              >
                {service.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {slas.map((sla) => (
                <div key={sla.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium">{sla.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {sla.priority}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div
                      className={`rounded-md p-2 text-center ${getResponseColor(sla.responseTimeMinutes)}`}
                    >
                      <Clock className="w-3 h-3 mx-auto mb-1" />
                      <p className="text-[10px]">Response</p>
                      <p className="text-xs font-semibold">
                        {formatMinutes(sla.responseTimeMinutes)}
                      </p>
                    </div>
                    <div
                      className={`rounded-md p-2 text-center ${getResponseColor(sla.resolutionTimeMinutes)}`}
                    >
                      <Target className="w-3 h-3 mx-auto mb-1" />
                      <p className="text-[10px]">Resolution</p>
                      <p className="text-xs font-semibold">
                        {formatMinutes(sla.resolutionTimeMinutes)}
                      </p>
                    </div>
                    <div
                      className={`rounded-md p-2 text-center ${getUptimeColor(sla.uptimePercentage)}`}
                    >
                      <ArrowUpRight className="w-3 h-3 mx-auto mb-1" />
                      <p className="text-[10px]">Uptime</p>
                      <p className="text-xs font-semibold">
                        {sla.uptimePercentage ? `${sla.uptimePercentage}%` : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function ServicesPage() {
  const { currentTenant, userRole } = useTenant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("active");
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);

  const isMSS = userRole === "mss_admin" || userRole === "mss_analyst";

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant,
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/services", {
        ...data,
        tenantId: currentTenant?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setServiceDialogOpen(false);
      toast({ title: "Service created", description: "New service has been added." });
    },
  });

  const createSlaMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/sla-definitions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sla-definitions"] });
      setSlaDialogOpen(false);
      toast({ title: "SLA definition added" });
    },
  });

  const activeServices = services.filter((s) => s.status === "active");
  const activeCount = activeServices.length;

  const filteredServices = activeTab === "active" ? activeServices : services;

  const handleServiceSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createServiceMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description") || null,
      serviceType: formData.get("serviceType"),
      status: formData.get("status"),
      msaStartDate: formData.get("msaStartDate") || null,
      msaEndDate: formData.get("msaEndDate") || null,
      contractValue: formData.get("contractValue") || null,
    });
  };

  const handleSlaSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createSlaMutation.mutate({
      serviceId: selectedServiceId,
      name: formData.get("name"),
      priority: formData.get("priority"),
      responseTimeMinutes: parseInt(formData.get("responseTimeMinutes") as string, 10),
      resolutionTimeMinutes: parseInt(formData.get("resolutionTimeMinutes") as string, 10),
      uptimePercentage: formData.get("uptimePercentage") || null,
    });
  };

  const openSlaDialog = (serviceId: number) => {
    setSelectedServiceId(serviceId);
    setSlaDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
            Solutions & Services
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-page-subtitle">
            {currentTenant?.name} -- {services.length} total services
          </p>
        </div>
        {isMSS && (
          <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-service">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Service
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Service</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleServiceSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="service-name">Service Name</Label>
                  <Input
                    id="service-name"
                    name="name"
                    required
                    data-testid="input-service-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-desc">Description</Label>
                  <Textarea
                    id="service-desc"
                    name="description"
                    data-testid="input-service-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Service Type</Label>
                    <Select name="serviceType" defaultValue="managed_soc">
                      <SelectTrigger data-testid="select-service-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SERVICE_TYPES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select name="status" defaultValue="active">
                      <SelectTrigger data-testid="select-service-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="msa-start">MSA Start Date</Label>
                    <Input
                      id="msa-start"
                      name="msaStartDate"
                      type="date"
                      data-testid="input-msa-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="msa-end">MSA End Date</Label>
                    <Input
                      id="msa-end"
                      name="msaEndDate"
                      type="date"
                      data-testid="input-msa-end-date"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract-value">Contract Value</Label>
                  <Input
                    id="contract-value"
                    name="contractValue"
                    placeholder="e.g. $50,000/yr"
                    data-testid="input-contract-value"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createServiceMutation.isPending}
                  data-testid="button-submit-service"
                >
                  {createServiceMutation.isPending ? "Creating..." : "Create Service"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-services">
            Active Services ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-services">
            All Services ({services.length})
          </TabsTrigger>
          <TabsTrigger value="sla" data-testid="tab-sla-dashboard">
            SLA Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No active services</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a service to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  isMSS={isMSS}
                  isExpanded={expandedServiceId === service.id}
                  onToggle={() =>
                    setExpandedServiceId(
                      expandedServiceId === service.id ? null : service.id
                    )
                  }
                  onAddSla={openSlaDialog}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : services.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No services found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a service to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  isMSS={isMSS}
                  isExpanded={expandedServiceId === service.id}
                  onToggle={() =>
                    setExpandedServiceId(
                      expandedServiceId === service.id ? null : service.id
                    )
                  }
                  onAddSla={openSlaDialog}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sla" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <SlaDashboard services={services} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={slaDialogOpen} onOpenChange={setSlaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add SLA Definition</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSlaSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sla-name">SLA Name</Label>
              <Input id="sla-name" name="name" required data-testid="input-sla-name" />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select name="priority" defaultValue="medium">
                <SelectTrigger data-testid="select-sla-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="response-time">Response Time (min)</Label>
                <Input
                  id="response-time"
                  name="responseTimeMinutes"
                  type="number"
                  required
                  min={1}
                  data-testid="input-sla-response-time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resolution-time">Resolution Time (min)</Label>
                <Input
                  id="resolution-time"
                  name="resolutionTimeMinutes"
                  type="number"
                  required
                  min={1}
                  data-testid="input-sla-resolution-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="uptime">Uptime Percentage</Label>
              <Input
                id="uptime"
                name="uptimePercentage"
                placeholder="e.g. 99.9"
                data-testid="input-sla-uptime"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createSlaMutation.isPending}
              data-testid="button-submit-sla"
            >
              {createSlaMutation.isPending ? "Adding..." : "Add SLA Definition"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
