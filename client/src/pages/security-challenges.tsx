import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy,
  Target,
  Shield,
  Flame,
  Star,
  Crown,
  Medal,
  Zap,
  Clock,
  CheckCircle,
  Lock,
  ChevronUp,
  ChevronDown,
  Minus,
  Search,
  Crosshair,
  FileText,
  Users,
  Timer,
  Eye,
  Radar,
  TrendingDown,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  incident_response: { label: "Incident Response", color: "bg-red-500/10 text-red-500 border-red-500/20", icon: Shield },
  threat_hunting: { label: "Threat Hunting", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: Crosshair },
  compliance: { label: "Compliance", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: FileText },
  asset_management: { label: "Asset Management", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: Radar },
  collaboration: { label: "Collaboration", color: "bg-purple-500/10 text-purple-500 border-purple-500/20", icon: Users },
  sla_performance: { label: "SLA Performance", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: Timer },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; stars: number }> = {
  beginner: { label: "Beginner", color: "bg-green-500/10 text-green-500 border-green-500/20", stars: 1 },
  intermediate: { label: "Intermediate", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", stars: 2 },
  advanced: { label: "Advanced", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", stars: 3 },
  expert: { label: "Expert", color: "bg-red-500/10 text-red-500 border-red-500/20", stars: 4 },
};

const TYPE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  one_time: "One-Time",
};

const BADGE_ICONS: Record<string, any> = {
  shield: Shield,
  "shield-check": ShieldCheck,
  "shield-alert": ShieldAlert,
  search: Search,
  crosshair: Crosshair,
  timer: Timer,
  "check-circle": CheckCircle,
  radar: Radar,
  "file-check": FileText,
  lock: Lock,
  "book-open": BookOpen,
  eye: Eye,
  "file-text": FileText,
  zap: Zap,
  "trending-down": TrendingDown,
};

const LEVEL_TITLES: Record<number, string> = {
  1: "Recruit",
  2: "Analyst",
  3: "Specialist",
  4: "Expert",
  5: "Senior Analyst",
  6: "Lead",
  7: "Principal",
  8: "Director",
  9: "Commander",
  10: "Legendary",
};

function getLevelTitle(level: number): string {
  if (level >= 10) return LEVEL_TITLES[10];
  return LEVEL_TITLES[level] || `Level ${level}`;
}

function getXpForLevel(level: number): number {
  return level * 500;
}

export default function SecurityChallengesPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("challenges");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const tenantId = currentTenant?.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/gamification", tenantId, "profile"],
    queryFn: () => fetch(`/api/gamification/${tenantId}/profile`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const { data: challenges, isLoading: challengesLoading } = useQuery({
    queryKey: ["/api/gamification", tenantId, "challenges"],
    queryFn: () => fetch(`/api/gamification/${tenantId}/challenges`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const { data: myProgress, isLoading: progressLoading } = useQuery({
    queryKey: ["/api/gamification", tenantId, "my-progress"],
    queryFn: () => fetch(`/api/gamification/${tenantId}/my-progress`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["/api/gamification", tenantId, "leaderboard"],
    queryFn: () => fetch(`/api/gamification/${tenantId}/leaderboard`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/gamification", tenantId, "stats"],
    queryFn: () => fetch(`/api/gamification/${tenantId}/stats`).then(r => r.json()),
    enabled: !!tenantId,
  });

  const claimMutation = useMutation({
    mutationFn: async (challengeId: number) => {
      const res = await apiRequest("POST", `/api/gamification/${tenantId}/challenges/${challengeId}/claim`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Reward Claimed!", description: `You earned ${data.xpEarned} XP${data.badge ? ` and the "${data.badge}" badge` : ""}!` });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification", tenantId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const progressMap = new Map<number, any>();
  if (Array.isArray(myProgress)) {
    myProgress.forEach((p: any) => progressMap.set(p.challenge_id, p));
  }

  const filteredChallenges = Array.isArray(challenges)
    ? challenges.filter((c: any) => categoryFilter === "all" || c.category === categoryFilter)
    : [];

  const xpForCurrentLevel = profile ? getXpForLevel(profile.level - 1) : 0;
  const xpForNextLevel = profile ? getXpForLevel(profile.level) : 500;
  const xpProgress = profile ? ((profile.total_xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 0;

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-[60vh]" data-testid="no-tenant">
        <p className="text-muted-foreground">Select a tenant to view security challenges</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="security-challenges-page">
      {profileLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : profile ? (
        <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 p-6" data-testid="profile-hero">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-yellow-400/10 to-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-background border-2 border-yellow-500 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold text-yellow-500" data-testid="text-level">
                  {profile.level}
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold" data-testid="text-level-title">{getLevelTitle(profile.level)}</h2>
                <p className="text-muted-foreground text-sm">
                  {profile.total_xp.toLocaleString()} XP Total
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={Math.min(xpProgress, 100)} className="w-40 h-2" />
                  <span className="text-xs text-muted-foreground">
                    {(xpForNextLevel - profile.total_xp)} XP to Level {profile.level + 1}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 lg:ml-8">
              <StatCard
                icon={Target}
                label="Challenges Done"
                value={profile.challengesCompleted}
                color="text-emerald-500"
                testId="stat-challenges"
              />
              <StatCard
                icon={Flame}
                label="Day Streak"
                value={profile.current_streak}
                color="text-orange-500"
                testId="stat-streak"
              />
              <StatCard
                icon={Crown}
                label="Rank"
                value={`#${profile.rank}`}
                subtitle={`of ${profile.totalUsers}`}
                color="text-yellow-500"
                testId="stat-rank"
              />
              <StatCard
                icon={Medal}
                label="Badges"
                value={Array.isArray(profile.badges) ? profile.badges.length : 0}
                color="text-purple-500"
                testId="stat-badges"
              />
            </div>
          </div>
        </div>
      ) : null}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Active Challenges" value={stats.totalChallenges} icon={Target} />
          <MiniStat label="Active Players" value={stats.activePlayers} icon={Users} />
          <MiniStat label="Total XP Earned" value={stats.totalXpEarned.toLocaleString()} icon={Zap} />
          <MiniStat label="Total Completions" value={stats.totalCompletions} icon={CheckCircle} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="challenges-tabs">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="challenges" data-testid="tab-challenges">
            <Target className="w-4 h-4 mr-1.5" />Challenges
          </TabsTrigger>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">
            <Crown className="w-4 h-4 mr-1.5" />Leaderboard
          </TabsTrigger>
          <TabsTrigger value="badges" data-testid="tab-badges">
            <Medal className="w-4 h-4 mr-1.5" />Badges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="challenges" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2" data-testid="category-filters">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              data-testid="filter-all"
            >
              All
            </Button>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant={categoryFilter === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategoryFilter(key)}
                  data-testid={`filter-${key}`}
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {challengesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredChallenges.map((challenge: any) => {
                const progress = progressMap.get(challenge.id);
                const catConfig = CATEGORY_CONFIG[challenge.category] || CATEGORY_CONFIG.compliance;
                const diffConfig = DIFFICULTY_CONFIG[challenge.difficulty] || DIFFICULTY_CONFIG.beginner;
                const CatIcon = catConfig.icon;
                const isCompleted = progress?.completed_at;
                const isClaimed = progress?.claimed_at;
                const currentVal = progress?.current_value || 0;
                const progressPct = Math.min((currentVal / challenge.target_value) * 100, 100);

                return (
                  <Card
                    key={challenge.id}
                    className={`relative overflow-hidden transition-all hover:shadow-md ${isCompleted && !isClaimed ? "ring-2 ring-yellow-500/50" : ""}`}
                    data-testid={`challenge-card-${challenge.id}`}
                  >
                    {isCompleted && (
                      <div className="absolute top-0 right-0 w-16 h-16">
                        <div className={`absolute top-0 right-0 w-16 h-16 ${isClaimed ? "bg-emerald-500" : "bg-yellow-500"} transform rotate-45 translate-x-8 -translate-y-8`} />
                        <CheckCircle className={`absolute top-1.5 right-1.5 w-4 h-4 ${isClaimed ? "text-emerald-100" : "text-yellow-100"}`} />
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${catConfig.color}`}>
                            <CatIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm font-semibold leading-tight">{challenge.title}</CardTitle>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{challenge.description}</p>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${diffConfig.color}`}>
                          {Array.from({ length: diffConfig.stars }).map((_, i) => (
                            <Star key={i} className="w-2.5 h-2.5 fill-current inline mr-0.5" />
                          ))}
                          {diffConfig.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="w-2.5 h-2.5 mr-0.5" />
                          {TYPE_LABELS[challenge.challenge_type] || challenge.challenge_type}
                        </Badge>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{currentVal} / {challenge.target_value}</span>
                        </div>
                        <Progress value={progressPct} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">{challenge.xp_reward} XP</span>
                          {challenge.badge_reward && (
                            <Badge variant="secondary" className="text-[10px] ml-1">
                              <Medal className="w-2.5 h-2.5 mr-0.5" />
                              {challenge.badge_reward}
                            </Badge>
                          )}
                        </div>
                        {isCompleted && !isClaimed && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-yellow-500 hover:bg-yellow-600 text-white"
                            onClick={() => claimMutation.mutate(challenge.id)}
                            disabled={claimMutation.isPending}
                            data-testid={`button-claim-${challenge.id}`}
                          >
                            <Trophy className="w-3 h-3 mr-1" />
                            Claim
                          </Button>
                        )}
                        {isClaimed && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                            <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                            Claimed
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          {leaderboardLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <Card data-testid="leaderboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  Security Champions Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!Array.isArray(leaderboard) || leaderboard.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="leaderboard-empty">
                    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No entries yet</p>
                    <p className="text-sm">Complete challenges to appear on the leaderboard!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaderboard.map((entry: any, index: number) => {
                      const isTop3 = index < 3;
                      const rankColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];
                      const rankBgs = ["bg-yellow-500/10", "bg-gray-400/10", "bg-amber-600/10"];
                      return (
                        <div
                          key={entry.userId}
                          className={`flex items-center gap-4 p-3 rounded-lg border ${isTop3 ? rankBgs[index] : "bg-muted/30"} transition-colors hover:bg-muted/50`}
                          data-testid={`leaderboard-row-${index}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isTop3 ? rankColors[index] + " bg-background border-2" : "text-muted-foreground"}`}>
                            {isTop3 ? (
                              index === 0 ? <Crown className="w-4 h-4" /> : <Medal className="w-4 h-4" />
                            ) : (
                              entry.rank
                            )}
                          </div>

                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                            {(entry.firstName?.[0] || entry.username?.[0] || "?").toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate" data-testid={`text-username-${index}`}>
                                {entry.firstName && entry.lastName
                                  ? `${entry.firstName} ${entry.lastName}`
                                  : entry.username}
                              </span>
                              {entry.title && (
                                <Badge variant="secondary" className="text-[10px]">{entry.title}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>Level {entry.level} - {getLevelTitle(entry.level)}</span>
                              <span>{entry.challengesCompleted} challenges</span>
                              {entry.currentStreak > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Flame className="w-3 h-3 text-orange-500" />
                                  {entry.currentStreak}d streak
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Zap className="w-4 h-4 text-yellow-500" />
                              <span className="font-bold text-sm" data-testid={`text-xp-${index}`}>
                                {entry.totalXp.toLocaleString()}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">XP</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="badges" className="mt-4">
          <Card data-testid="badges-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Medal className="w-5 h-5 text-purple-500" />
                Achievement Badges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.isArray(challenges) && challenges
                  .filter((c: any) => c.badge_reward)
                  .map((challenge: any) => {
                    const earned = Array.isArray(profile?.badges) &&
                      profile.badges.some((b: any) => b.name === challenge.badge_reward);
                    const BadgeIcon = BADGE_ICONS[challenge.badge_icon] || Shield;
                    const diffConfig = DIFFICULTY_CONFIG[challenge.difficulty] || DIFFICULTY_CONFIG.beginner;
                    return (
                      <div
                        key={challenge.id}
                        className={`flex flex-col items-center p-4 rounded-xl border text-center transition-all ${
                          earned
                            ? "bg-gradient-to-b from-yellow-500/10 to-orange-500/10 border-yellow-500/30 shadow-sm"
                            : "opacity-40 grayscale"
                        }`}
                        data-testid={`badge-${challenge.id}`}
                      >
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
                          earned
                            ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg shadow-orange-500/20"
                            : "bg-muted border-2 border-dashed"
                        }`}>
                          {earned ? (
                            <BadgeIcon className="w-7 h-7 text-white" />
                          ) : (
                            <Lock className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-xs font-semibold">{challenge.badge_reward}</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">{challenge.description}</span>
                        <div className="flex items-center gap-1 mt-1">
                          {Array.from({ length: diffConfig.stars }).map((_, i) => (
                            <Star key={i} className={`w-2.5 h-2.5 ${earned ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color, testId }: {
  icon: any; label: string; value: string | number; subtitle?: string; color: string; testId: string;
}) {
  return (
    <div className="bg-background/50 border rounded-lg p-3 text-center" data-testid={testId}>
      <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
      <div className="text-lg font-bold" data-testid={`${testId}-value`}>{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-semibold">{value}</div>
          <div className="text-[10px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </Card>
  );
}
