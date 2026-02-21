import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamMember, ShiftRoster } from "@shared/schema";
import {
  Plus,
  Users,
  Calendar,
  Trash2,
  Phone,
  Mail,
  UserCheck,
  UserX,
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

const SHIFT_TYPE_STYLES: Record<string, string> = {
  day: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  night: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  swing: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  oncall: "bg-red-500/10 text-red-700 dark:text-red-400",
};

function TeamMemberCard({
  member,
  isMSS,
  onToggleActive,
}: {
  member: TeamMember;
  isMSS: boolean;
  onToggleActive: (id: number, isActive: boolean) => void;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-member-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium" data-testid={`text-member-name-${member.id}`}>{member.name}</span>
              <Badge
                variant={member.isActive ? "default" : "secondary"}
                className="text-[10px]"
                data-testid={`badge-member-status-${member.id}`}
              >
                {member.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate" data-testid={`text-member-email-${member.id}`}>{member.email}</span>
            </div>
            {member.role && (
              <p className="text-[10px] text-muted-foreground" data-testid={`text-member-role-${member.id}`}>{member.role}</p>
            )}
            {member.phone && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Phone className="w-2.5 h-2.5 shrink-0" />
                <span data-testid={`text-member-phone-${member.id}`}>{member.phone}</span>
              </div>
            )}
          </div>
          {isMSS && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleActive(member.id, !member.isActive)}
              data-testid={`button-toggle-member-${member.id}`}
            >
              {member.isActive ? (
                <UserX className="w-4 h-4" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ShiftCard({
  shift,
  memberName,
  isMSS,
  onDelete,
}: {
  shift: ShiftRoster;
  memberName: string;
  isMSS: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-shift-${shift.id}`}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium truncate" data-testid={`text-shift-member-${shift.id}`}>{memberName}</p>
            <p className="text-[10px] text-muted-foreground" data-testid={`text-shift-date-${shift.id}`}>
              {new Date(shift.shiftDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
          </div>
          {isMSS && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(shift.id)}
              data-testid={`button-delete-shift-${shift.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground" data-testid={`text-shift-time-${shift.id}`}>
            {shift.startTime} - {shift.endTime}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${SHIFT_TYPE_STYLES[shift.shiftType] || ""}`}
            data-testid={`badge-shift-type-${shift.id}`}
          >
            {shift.shiftType}
          </Badge>
        </div>
        {shift.notes && (
          <p className="text-[10px] text-muted-foreground line-clamp-2" data-testid={`text-shift-notes-${shift.id}`}>{shift.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamTab({
  teamType,
  tenantId,
  isMSS,
}: {
  teamType: "implementation" | "mss";
  tenantId: number;
  isMSS: boolean;
}) {
  const { toast } = useToast();
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members", tenantId, { teamType }],
    queryFn: async () => {
      const res = await fetch(`/api/team-members/${tenantId}?teamType=${teamType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team members");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<ShiftRoster[]>({
    queryKey: ["/api/shift-rosters", tenantId],
    enabled: !!tenantId,
  });

  const teamShifts = shifts.filter((s) => {
    const member = members.find((m) => m.id === s.teamMemberId);
    return !!member;
  });

  const createMemberMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/team-members", { ...data, tenantId, teamType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setMemberDialogOpen(false);
      toast({ title: "Team member added" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMemberMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/team-members/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/shift-rosters", { ...data, tenantId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-rosters"] });
      setShiftDialogOpen(false);
      toast({ title: "Shift added" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shift-rosters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-rosters"] });
      toast({ title: "Shift removed" });
    },
  });

  const handleMemberSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMemberMutation.mutate({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role") || null,
      phone: formData.get("phone") || null,
    });
  };

  const handleShiftSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createShiftMutation.mutate({
      teamMemberId: Number(formData.get("teamMemberId")),
      shiftDate: formData.get("shiftDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      shiftType: formData.get("shiftType"),
      notes: formData.get("notes") || null,
    });
  };

  const getMemberName = (memberId: number) => {
    const member = members.find((m) => m.id === memberId);
    return member?.name || "Unknown";
  };

  const activeMembers = members.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Team Members</h2>
            <Badge variant="secondary" className="text-[10px]">{members.length}</Badge>
          </div>
          {isMSS && (
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid={`button-add-member-${teamType}`}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Team Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleMemberSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`member-name-${teamType}`}>Name</Label>
                    <Input id={`member-name-${teamType}`} name="name" required data-testid={`input-member-name-${teamType}`} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`member-email-${teamType}`}>Email</Label>
                    <Input id={`member-email-${teamType}`} name="email" type="email" required data-testid={`input-member-email-${teamType}`} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`member-role-${teamType}`}>Role</Label>
                    <Input id={`member-role-${teamType}`} name="role" data-testid={`input-member-role-${teamType}`} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`member-phone-${teamType}`}>Phone</Label>
                    <Input id={`member-phone-${teamType}`} name="phone" data-testid={`input-member-phone-${teamType}`} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMemberMutation.isPending} data-testid={`button-submit-member-${teamType}`}>
                    {createMemberMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {membersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
            ))}
          </div>
        ) : members.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No team members</p>
              <p className="text-xs text-muted-foreground mt-1">Add team members to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((member) => (
              <TeamMemberCard
                key={member.id}
                member={member}
                isMSS={isMSS}
                onToggleActive={(id, isActive) => toggleMemberMutation.mutate({ id, isActive })}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Shift Schedule</h2>
            <Badge variant="secondary" className="text-[10px]">{teamShifts.length}</Badge>
          </div>
          {isMSS && (
            <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary" disabled={activeMembers.length === 0} data-testid={`button-add-shift-${teamType}`}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Shift</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleShiftSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Team Member</Label>
                    <Select name="teamMemberId" required>
                      <SelectTrigger data-testid={`select-shift-member-${teamType}`}><SelectValue placeholder="Select member" /></SelectTrigger>
                      <SelectContent>
                        {activeMembers.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`shift-date-${teamType}`}>Date</Label>
                    <Input id={`shift-date-${teamType}`} name="shiftDate" type="date" required data-testid={`input-shift-date-${teamType}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`shift-start-${teamType}`}>Start Time</Label>
                      <Input id={`shift-start-${teamType}`} name="startTime" type="time" required data-testid={`input-shift-start-${teamType}`} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`shift-end-${teamType}`}>End Time</Label>
                      <Input id={`shift-end-${teamType}`} name="endTime" type="time" required data-testid={`input-shift-end-${teamType}`} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Shift Type</Label>
                    <Select name="shiftType" defaultValue="day">
                      <SelectTrigger data-testid={`select-shift-type-${teamType}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="night">Night</SelectItem>
                        <SelectItem value="swing">Swing</SelectItem>
                        <SelectItem value="oncall">On-Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`shift-notes-${teamType}`}>Notes</Label>
                    <Textarea id={`shift-notes-${teamType}`} name="notes" rows={2} data-testid={`input-shift-notes-${teamType}`} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createShiftMutation.isPending} data-testid={`button-submit-shift-${teamType}`}>
                    {createShiftMutation.isPending ? "Adding..." : "Add Shift"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {shiftsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-3"><Skeleton className="h-14" /></CardContent></Card>
            ))}
          </div>
        ) : teamShifts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No shifts scheduled</p>
              <p className="text-xs text-muted-foreground mt-1">Add shifts to build the schedule</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {teamShifts
              .sort((a, b) => new Date(a.shiftDate).getTime() - new Date(b.shiftDate).getTime())
              .map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  memberName={getMemberName(shift.teamMemberId)}
                  isMSS={isMSS}
                  onDelete={(id) => deleteShiftMutation.mutate(id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShiftRosterPage() {
  const { currentTenant, isMSS } = useTenant();
  const [activeTab, setActiveTab] = useState("implementation");

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Shift Roster Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-tenant-name">
            {currentTenant?.name}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="implementation" data-testid="tab-implementation">
              Implementation Team
            </TabsTrigger>
            <TabsTrigger value="mss" data-testid="tab-mss">
              MSS Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="implementation" className="mt-4">
            {currentTenant && (
              <TeamTab
                teamType="implementation"
                tenantId={currentTenant.id}
                isMSS={isMSS}
              />
            )}
          </TabsContent>

          <TabsContent value="mss" className="mt-4">
            {currentTenant && (
              <TeamTab
                teamType="mss"
                tenantId={currentTenant.id}
                isMSS={isMSS}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
