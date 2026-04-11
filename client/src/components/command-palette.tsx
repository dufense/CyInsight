import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  LayoutDashboard, AlertTriangle, Database, Shield, Map, FileText,
  Ticket, Settings, Users, BookOpen, Activity, Bot, Zap,
  Sun, Target, Eye, RefreshCw,
  Clock, Network, Building, BrainCircuit, BookMarked, Layers, ListChecks,
  ServerCrash, ShieldAlert, Folder, Keyboard,
  Shuffle, BrainCog, Fingerprint, Crosshair,
} from "lucide-react";

export interface RecentItem {
  type: "incident" | "ticket" | "asset";
  id: string | number;
  label: string;
  url: string;
}

interface SearchIncident {
  id: number;
  title: string;
  severity: string;
  status: string;
}

interface SearchTicket {
  id: number;
  title: string;
  priority: string;
  status: string;
}

interface SearchAsset {
  id: number;
  hostname: string;
  ipAddress: string;
  riskLevel: string;
}

interface SearchIoc {
  id: number;
  type: string;
  value: string;
  reputation: string;
  confidence: number;
}

interface SearchDoc {
  id: number;
  title: string;
  category: string;
}

interface SearchResults {
  incidents: SearchIncident[];
  tickets: SearchTicket[];
  assets: SearchAsset[];
  iocs: SearchIoc[];
  knowledgeBase: SearchDoc[];
}

interface GlobalSearchResponse {
  results: SearchResults;
  totalCount: number;
}

const NAV_PAGES = [
  { label: "Dashboard", url: "/dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { label: "Security Events", url: "/events", icon: Database, shortcut: "G E" },
  { label: "Incidents", url: "/events?domain=overview", icon: AlertTriangle, shortcut: "G I" },
  { label: "Alert Triage", url: "/alert-triage", icon: ShieldAlert },
  { label: "CAASM", url: "/caasm", icon: Layers, shortcut: "G C" },
  { label: "Threat Map", url: "/threat-map", icon: Map },
  { label: "MITRE Coverage", url: "/mitre-coverage", icon: Target },
  { label: "Operations Center", url: "/operations", icon: Zap },
  { label: "Playbooks", url: "/playbooks", icon: BookMarked },
  { label: "Threat Intelligence", url: "/threat-intel", icon: Eye },
  { label: "Reports", url: "/reports", icon: FileText },
  { label: "Projects", url: "/projects", icon: Folder },
  { label: "Services", url: "/services", icon: ListChecks },
  { label: "Knowledge Base", url: "/knowledge-base", icon: BookOpen },
  { label: "Shift Roster", url: "/shift-roster", icon: Users },
  { label: "AI Analyst", url: "/ai-analyst", icon: BrainCircuit },
  { label: "AI Workforce", url: "/ai-workforce", icon: Bot },
  { label: "Behavior Analytics", url: "/behavior-analytics", icon: Activity },
  { label: "Security Integrations", url: "/security-integrations", icon: Network },
  { label: "Compliance", url: "/compliance-frameworks", icon: Shield },
  { label: "Admin Portal", url: "/admin", icon: Building },
  { label: "Settings", url: "/settings", icon: Settings },
];

function getRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem("ccc_recent_items");
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function addRecentItem(item: RecentItem) {
  try {
    const items = getRecentItems().filter(i => i.url !== item.url);
    items.unshift(item);
    localStorage.setItem("ccc_recent_items", JSON.stringify(items.slice(0, 5)));
  } catch {}
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleTheme?: () => void;
  onOpenARIA?: () => void;
  onShowShortcuts?: () => void;
}

const SEV_COLOR: Record<string, string> = {
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  low: "bg-green-500/15 text-green-600 border-green-500/30",
};

const IOC_REP_COLOR: Record<string, string> = {
  malicious: "bg-red-500/15 text-red-500 border-red-500/30",
  suspicious: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  clean: "bg-green-500/15 text-green-600 border-green-500/30",
};

function InvestigateIncidentDialog({ open, onClose, onNavigate }: {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  const [incidentId, setIncidentId] = useState("");
  const handleGo = () => {
    const id = incidentId.trim().replace(/^#/, "");
    if (id) {
      onNavigate(`/events?domain=overview&incidentId=${id}`);
      onClose();
      setIncidentId("");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="dialog-investigate-incident">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" /> Investigate Incident
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            placeholder="Enter incident ID (e.g. 42)"
            value={incidentId}
            onChange={e => setIncidentId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGo()}
            data-testid="input-investigate-incident-id"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGo} disabled={!incidentId.trim()} data-testid="button-go-to-incident">
            Go to Incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tenants, setCurrentTenant, currentTenant } = useTenant();
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="dialog-switch-tenant">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-primary" /> Switch Tenant
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-1 max-h-64 overflow-y-auto">
          {tenants.map(t => (
            <button
              key={t.id}
              className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors flex items-center justify-between ${currentTenant?.id === t.id ? "bg-primary/10 text-primary font-medium" : ""}`}
              onClick={() => { setCurrentTenant(t); onClose(); }}
              data-testid={`btn-switch-tenant-${t.id}`}
            >
              <span>{t.name}</span>
              {currentTenant?.id === t.id && <Badge variant="outline" className="text-[9px]">Active</Badge>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommandPalette({ open, onOpenChange, onToggleTheme, onOpenARIA, onShowShortcuts }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const [query, setQuery] = useState("");
  const [showInvestigate, setShowInvestigate] = useState(false);
  const [showSwitchTenant, setShowSwitchTenant] = useState(false);

  const { data: searchResponse, isFetching } = useQuery<GlobalSearchResponse>({
    queryKey: ["/api/global-search", query, currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/global-search?q=${encodeURIComponent(query)}&tenantId=${currentTenant!.id}&limit=5`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<GlobalSearchResponse>;
    },
    enabled: query.length >= 2 && query !== "?" && !!currentTenant?.id,
    staleTime: 10_000,
  });

  const handleSelect = useCallback((url: string, recentItem?: RecentItem) => {
    onOpenChange(false);
    setQuery("");
    if (recentItem) addRecentItem(recentItem);
    navigate(url);
  }, [navigate, onOpenChange]);

  const handleAction = useCallback((action: string) => {
    if (action === "show-shortcuts") {
      onOpenChange(false);
      setQuery("");
      if (onShowShortcuts) onShowShortcuts();
      return;
    }
    if (action === "investigate-incident") {
      onOpenChange(false);
      setQuery("");
      setShowInvestigate(true);
      return;
    }
    if (action === "switch-tenant") {
      onOpenChange(false);
      setQuery("");
      setShowSwitchTenant(true);
      return;
    }
    if (action === "bulk-enrich") {
      onOpenChange(false);
      setQuery("");
      navigate("/events?domain=overview&action=bulk-enrich");
      return;
    }
    onOpenChange(false);
    setQuery("");
    if (action === "toggle-theme" && onToggleTheme) onToggleTheme();
    if (action === "open-aria") {
      if (onOpenARIA) onOpenARIA();
      else setTimeout(() => window.dispatchEvent(new CustomEvent("open-aria-copilot")), 100);
    }
  }, [onOpenChange, onToggleTheme, onOpenARIA, onShowShortcuts, navigate]);

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (val === "?") {
      onOpenChange(false);
      if (onShowShortcuts) onShowShortcuts();
    }
  }, [onOpenChange, onShowShortcuts]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const showSearch = query.length >= 2 && query !== "?";
  const recentItems = getRecentItems();
  const searchResults = searchResponse?.results;

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput
          placeholder="Search or type a command..."
          value={query}
          onValueChange={handleQueryChange}
          data-testid="command-palette-input"
        />
        <CommandList className="max-h-[500px]">
          <CommandEmpty>
            {isFetching ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : (
              <span>No results found for &ldquo;{query}&rdquo;</span>
            )}
          </CommandEmpty>

          {/* Global search results */}
          {showSearch && searchResults && (() => {
            const { incidents = [], tickets = [], assets = [], iocs = [], knowledgeBase: docs = [] } = searchResults;
            const hasResults = incidents.length + tickets.length + assets.length + docs.length + iocs.length > 0;
            if (!hasResults) return null;
            return (
              <>
                {incidents.length > 0 && (
                  <CommandGroup heading="Incidents">
                    {incidents.map((inc) => (
                      <CommandItem
                        key={`inc-${inc.id}`}
                        value={`incident ${inc.title} ${inc.id}`}
                        onSelect={() => handleSelect(`/events?domain=overview&incidentId=${inc.id}`, { type: "incident", id: inc.id, label: `#${inc.id} — ${inc.title}`, url: `/events?domain=overview&incidentId=${inc.id}` })}
                        data-testid={`cmd-incident-${inc.id}`}
                      >
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <span className="flex-1 truncate">#{inc.id} — {inc.title}</span>
                        <Badge className={`text-[9px] px-1 border ${SEV_COLOR[inc.severity] ?? ""}`}>{inc.severity}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {tickets.length > 0 && (
                  <CommandGroup heading="Tickets">
                    {tickets.map((t) => (
                      <CommandItem
                        key={`tkt-${t.id}`}
                        value={`ticket ${t.title} ${t.id}`}
                        onSelect={() => handleSelect(`/operations?tab=tickets&ticketId=${t.id}`, { type: "ticket", id: t.id, label: `#${t.id} — ${t.title}`, url: `/operations?tab=tickets&ticketId=${t.id}` })}
                        data-testid={`cmd-ticket-${t.id}`}
                      >
                        <Ticket className="w-4 h-4 text-blue-500" />
                        <span className="flex-1 truncate">#{t.id} — {t.title}</span>
                        <Badge variant="outline" className="text-[9px] px-1">{t.status}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {assets.length > 0 && (
                  <CommandGroup heading="Assets">
                    {assets.map((a) => (
                      <CommandItem
                        key={`ast-${a.id}`}
                        value={`asset ${a.hostname} ${a.ipAddress}`}
                        onSelect={() => handleSelect(`/caasm?assetId=${a.id}`, { type: "asset", id: a.id, label: a.hostname || a.ipAddress, url: `/caasm?assetId=${a.id}` })}
                        data-testid={`cmd-asset-${a.id}`}
                      >
                        <ServerCrash className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.hostname || a.ipAddress}</span>
                        <span className="text-[10px] text-muted-foreground">{a.ipAddress}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {iocs.length > 0 && (
                  <CommandGroup heading="IOC Indicators">
                    {iocs.map((ioc) => (
                      <CommandItem
                        key={`ioc-${ioc.id}`}
                        value={`ioc ${ioc.value} ${ioc.type}`}
                        onSelect={() => handleSelect(`/threat-intel?tab=iocs&q=${encodeURIComponent(ioc.value)}`)}
                        data-testid={`cmd-ioc-${ioc.id}`}
                      >
                        <Fingerprint className="w-4 h-4 text-purple-500" />
                        <span className="flex-1 truncate font-mono text-xs">{ioc.value}</span>
                        <Badge className={`text-[9px] px-1 border ${IOC_REP_COLOR[ioc.reputation] ?? ""}`}>{ioc.reputation}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {docs.length > 0 && (
                  <CommandGroup heading="Knowledge Base">
                    {docs.map((d) => (
                      <CommandItem
                        key={`doc-${d.id}`}
                        value={`doc ${d.title}`}
                        onSelect={() => handleSelect(`/knowledge-base?docId=${d.id}`)}
                        data-testid={`cmd-doc-${d.id}`}
                      >
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{d.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandSeparator />
              </>
            );
          })()}

          {/* Default (no search): Recent + Quick Actions + Navigation */}
          {!showSearch && (
            <>
              {recentItems.length > 0 && (
                <>
                  <CommandGroup heading="Recent">
                    {recentItems.map((item) => (
                      <CommandItem
                        key={item.url}
                        value={`recent ${item.label}`}
                        onSelect={() => handleSelect(item.url)}
                        data-testid={`cmd-recent-${item.id}`}
                      >
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1">{item.label}</span>
                        <Badge variant="outline" className="text-[9px] px-1 capitalize">{item.type}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              <CommandGroup heading="Quick Actions">
                <CommandItem value="create ticket" onSelect={() => handleSelect("/operations?tab=tickets&action=create")} data-testid="cmd-action-create-ticket">
                  <Ticket className="w-4 h-4 text-blue-500" />
                  <span>Create New Ticket</span>
                </CommandItem>
                <CommandItem value="investigate incident by id" onSelect={() => handleAction("investigate-incident")} data-testid="cmd-action-investigate">
                  <Crosshair className="w-4 h-4 text-orange-500" />
                  <span>Investigate Incident #...</span>
                </CommandItem>
                <CommandItem value="switch tenant organization" onSelect={() => handleAction("switch-tenant")} data-testid="cmd-action-switch-tenant">
                  <Shuffle className="w-4 h-4 text-cyan-500" />
                  <span>Switch Tenant</span>
                </CommandItem>
                <CommandItem value="bulk ai enrich incidents" onSelect={() => handleAction("bulk-enrich")} data-testid="cmd-action-bulk-enrich">
                  <BrainCog className="w-4 h-4 text-purple-500" />
                  <span>Bulk AI Enrich Incidents</span>
                </CommandItem>
                <CommandItem value="open aria copilot assistant" onSelect={() => handleAction("open-aria")} data-testid="cmd-action-aria">
                  <Bot className="w-4 h-4 text-primary" />
                  <span>Open ARIA Copilot</span>
                </CommandItem>
                <CommandItem value="toggle theme dark light mode" onSelect={() => handleAction("toggle-theme")} data-testid="cmd-action-theme">
                  <Sun className="w-4 h-4 text-yellow-500" />
                  <span>Toggle Theme</span>
                  <CommandShortcut>Dark / Light</CommandShortcut>
                </CommandItem>
                <CommandItem value="keyboard shortcuts help reference" onSelect={() => handleAction("show-shortcuts")} data-testid="cmd-action-shortcuts">
                  <Keyboard className="w-4 h-4 text-muted-foreground" />
                  <span>Keyboard Shortcuts</span>
                  <CommandShortcut>?</CommandShortcut>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Navigation">
                {NAV_PAGES.map((page) => (
                  <CommandItem
                    key={page.url}
                    value={page.label}
                    onSelect={() => handleSelect(page.url)}
                    data-testid={`cmd-nav-${page.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <page.icon className="w-4 h-4 text-muted-foreground" />
                    <span>{page.label}</span>
                    {page.shortcut && <CommandShortcut>{page.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Filtered navigation when searching */}
          {showSearch && (
            <CommandGroup heading="Pages">
              {NAV_PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase())).map((page) => (
                <CommandItem
                  key={page.url}
                  value={page.label}
                  onSelect={() => handleSelect(page.url)}
                  data-testid={`cmd-nav-search-${page.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <page.icon className="w-4 h-4 text-muted-foreground" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1 border rounded text-[9px] bg-muted/50">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 border rounded text-[9px] bg-muted/50">↵</kbd> select</span>
            <span className="flex items-center gap-1"><kbd className="px-1 border rounded text-[9px] bg-muted/50">Esc</kbd> close</span>
          </div>
          <button
            className="hover:text-foreground flex items-center gap-1"
            onClick={() => handleAction("show-shortcuts")}
            data-testid="cmd-btn-shortcuts"
          >
            <Keyboard className="w-3 h-3" /> shortcuts
          </button>
        </div>
      </CommandDialog>

      <InvestigateIncidentDialog
        open={showInvestigate}
        onClose={() => setShowInvestigate(false)}
        onNavigate={(url) => { setShowInvestigate(false); navigate(url); }}
      />
      <SwitchTenantDialog
        open={showSwitchTenant}
        onClose={() => setShowSwitchTenant(false)}
      />
    </>
  );
}
