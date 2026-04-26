import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Monitor,
  Users,
  AlertTriangle,
  Activity,
  Ticket,
  BookOpen,
  FolderKanban,
  FileText,
  Clock,
  Search,
  Slash,
} from "lucide-react";

interface SearchResult {
  id: number | string;
  title: string;
  subtitle: string;
  module: string;
  url: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

interface GlobalSearchResults {
  results: {
    assets: Array<{ id: number; hostname: string; ipAddress?: string; operatingSystem?: string; riskLevel?: string }>;
    users: Array<{ id: number; userName: string; accountType?: string; riskLevel?: string }>;
    incidents: Array<{ id: number; title: string; severity?: string; status?: string }>;
    events: Array<{ id: number; eventType?: string; threat?: string; severity?: string }>;
    tickets: Array<{ id: number; title: string; priority?: string; status?: string }>;
    knowledgeBase: Array<{ id: number; title: string; category?: string }>;
    projects: Array<{ id: number; name: string; status?: string }>;
    reports: Array<{ id: number; title: string; reportType?: string; period?: string }>;
  };
  totalCount: number;
}

const MODULE_ICONS: Record<string, typeof Monitor> = {
  assets: Monitor,
  users: Users,
  incidents: AlertTriangle,
  events: Activity,
  tickets: Ticket,
  knowledgeBase: BookOpen,
  projects: FolderKanban,
  reports: FileText,
};

const MODULE_LABELS: Record<string, string> = {
  assets: "Assets",
  users: "Users",
  incidents: "Incidents",
  events: "Events",
  tickets: "Tickets",
  knowledgeBase: "Knowledge Base",
  projects: "Projects",
  reports: "Reports",
};

const MODULE_PREFIXES: Record<string, string> = {
  "/assets": "assets",
  "/users": "users",
  "/incidents": "incidents",
  "/events": "events",
  "/tickets": "tickets",
  "/kb": "knowledgeBase",
  "/projects": "projects",
  "/reports": "reports",
};

const RECENT_SEARCHES_KEY = "secureops_recent_searches";

function getRecentSearches(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  try {
    const recent = getRecentSearches();
    const filtered = recent.filter((s) => s !== query);
    filtered.unshift(query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered.slice(0, 10)));
  } catch {}
}

function getSeverityVariant(severity?: string): "default" | "secondary" | "destructive" | "outline" {
  if (!severity) return "secondary";
  const s = severity.toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium" || s === "warning") return "default";
  return "secondary";
}

function transformResults(data: GlobalSearchResults, tenantId: number | null): SearchResult[] {
  const results: SearchResult[] = [];
  const tid = tenantId || 1;

  if (data.results.assets) {
    for (const a of data.results.assets) {
      results.push({
        id: `asset-${a.id}`,
        title: a.hostname || `Asset #${a.id}`,
        subtitle: [a.ipAddress, a.operatingSystem].filter(Boolean).join(" · "),
        module: "assets",
        url: `/assets/${tid}/${encodeURIComponent(a.hostname || a.id)}`,
        badge: a.riskLevel,
        badgeVariant: getSeverityVariant(a.riskLevel),
      });
    }
  }

  if (data.results.users) {
    for (const u of data.results.users) {
      results.push({
        id: `user-${u.id}`,
        title: u.userName || `User #${u.id}`,
        subtitle: u.accountType || "User",
        module: "users",
        url: `/users/${tid}/${encodeURIComponent(u.userName || u.id)}`,
        badge: u.riskLevel,
        badgeVariant: getSeverityVariant(u.riskLevel),
      });
    }
  }

  if (data.results.incidents) {
    for (const inc of data.results.incidents) {
      results.push({
        id: `incident-${inc.id}`,
        title: inc.title || `Incident #${inc.id}`,
        subtitle: [inc.status, inc.severity].filter(Boolean).join(" · "),
        module: "incidents",
        url: `/incidents?highlight=${inc.id}`,
        badge: inc.severity,
        badgeVariant: getSeverityVariant(inc.severity),
      });
    }
  }

  if (data.results.events) {
    for (const ev of data.results.events) {
      results.push({
        id: `event-${ev.id}`,
        title: ev.threat || ev.eventType || `Event #${ev.id}`,
        subtitle: ev.eventType || "Security Event",
        module: "events",
        url: `/events?highlight=${ev.id}`,
        badge: ev.severity,
        badgeVariant: getSeverityVariant(ev.severity),
      });
    }
  }

  if (data.results.tickets) {
    for (const t of data.results.tickets) {
      results.push({
        id: `ticket-${t.id}`,
        title: t.title || `Ticket #${t.id}`,
        subtitle: [t.status, t.priority].filter(Boolean).join(" · "),
        module: "tickets",
        url: `/tickets?highlight=${t.id}`,
        badge: t.priority,
        badgeVariant: getSeverityVariant(t.priority),
      });
    }
  }

  if (data.results.knowledgeBase) {
    for (const kb of data.results.knowledgeBase) {
      results.push({
        id: `kb-${kb.id}`,
        title: kb.title || `Article #${kb.id}`,
        subtitle: kb.category || "Knowledge Base",
        module: "knowledgeBase",
        url: `/knowledge-base?highlight=${kb.id}`,
        badge: kb.category,
        badgeVariant: "outline",
      });
    }
  }

  if (data.results.projects) {
    for (const p of data.results.projects) {
      results.push({
        id: `project-${p.id}`,
        title: p.name || `Project #${p.id}`,
        subtitle: p.status || "Project",
        module: "projects",
        url: `/projects/${p.id}`,
        badge: p.status,
        badgeVariant: "secondary",
      });
    }
  }

  if (data.results.reports) {
    for (const r of data.results.reports) {
      results.push({
        id: `report-${r.id}`,
        title: r.title || `Report #${r.id}`,
        subtitle: [r.reportType, r.period].filter(Boolean).join(" · "),
        module: "reports",
        url: `/reports?highlight=${r.id}`,
        badge: r.reportType,
        badgeVariant: "outline",
      });
    }
  }

  return results;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showPrefixes, setShowPrefixes] = useState(false);
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setQuery("");
      setResults([]);
      setShowPrefixes(false);
    }
  }, [open]);

  const performSearch = useCallback(
    async (searchQuery: string, moduleFilter?: string | null) => {
      if (searchQuery.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const tenantId = currentTenant?.id || "";
        const params = new URLSearchParams({
          q: searchQuery,
          ...(tenantId ? { tenantId: String(tenantId) } : {}),
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(`/api/global-search?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data: GlobalSearchResults = await res.json();
          let allResults = transformResults(data, currentTenant?.id || null);
          if (moduleFilter) {
            allResults = allResults.filter((r) => r.module === moduleFilter);
          }
          setResults(allResults);
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentTenant]
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (value === "/") {
        setShowPrefixes(true);
        setResults([]);
        return;
      }
      setShowPrefixes(false);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      let actualQuery = value;
      let activeModule: string | null = null;
      for (const prefix of Object.keys(MODULE_PREFIXES)) {
        if (value.startsWith(prefix + " ")) {
          actualQuery = value.slice(prefix.length + 1);
          activeModule = MODULE_PREFIXES[prefix];
          break;
        }
      }

      debounceRef.current = setTimeout(() => {
        performSearch(actualQuery, activeModule);
      }, 300);
    },
    [performSearch]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (query.length >= 2) {
        saveRecentSearch(query);
      }
      setOpen(false);
      navigate(result.url);
    },
    [navigate, query]
  );

  const handleRecentSelect = useCallback(
    (search: string) => {
      setQuery(search);
      performSearch(search);
    },
    [performSearch]
  );

  const handlePrefixSelect = useCallback((prefix: string) => {
    setQuery(prefix + " ");
    setShowPrefixes(false);
  }, []);

  const groupedResults: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groupedResults[r.module]) {
      groupedResults[r.module] = [];
    }
    groupedResults[r.module].push(r);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search across all modules... (type / for filters)"
        value={query}
        onValueChange={handleQueryChange}
        data-testid="input-global-search"
      />
      <CommandList className="max-h-[400px]">
        {isSearching && (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-search-loading">
            Searching...
          </div>
        )}

        {!isSearching && query.length >= 2 && results.length === 0 && (
          <CommandEmpty data-testid="text-search-empty">No results found.</CommandEmpty>
        )}

        {showPrefixes && (
          <CommandGroup heading="Filter by module">
            {Object.entries(MODULE_PREFIXES).map(([prefix, moduleKey]) => {
              const Icon = MODULE_ICONS[moduleKey] || Search;
              return (
                <CommandItem
                  key={prefix}
                  value={prefix}
                  onSelect={() => handlePrefixSelect(prefix)}
                  data-testid={`item-prefix-${moduleKey}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-mono text-xs">{prefix}</span>
                  <span className="text-muted-foreground ml-1">
                    {MODULE_LABELS[moduleKey]}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!showPrefixes && query.length < 2 && recentSearches.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recentSearches.map((search, idx) => (
              <CommandItem
                key={`recent-${idx}`}
                value={`recent-${search}`}
                onSelect={() => handleRecentSelect(search)}
                data-testid={`item-recent-search-${idx}`}
              >
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{search}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!showPrefixes &&
          !isSearching &&
          Object.entries(groupedResults).map(([moduleKey, items], groupIdx) => {
            const Icon = MODULE_ICONS[moduleKey] || Search;
            const label = MODULE_LABELS[moduleKey] || moduleKey;
            return (
              <div key={moduleKey}>
                {groupIdx > 0 && <CommandSeparator />}
                <CommandGroup heading={label}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={String(item.id)}
                      onSelect={() => handleSelect(item)}
                      data-testid={`item-search-result-${item.id}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate text-sm">{item.title}</span>
                        {item.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.badge && (
                        <Badge variant={item.badgeVariant || "secondary"} className="ml-auto shrink-0">
                          {item.badge}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}

        {!showPrefixes && query.length < 2 && recentSearches.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-search-hint">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Search className="w-4 h-4" />
              <span>Start typing to search</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
              <span>Type</span>
              <kbd className="pointer-events-none inline-flex select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <Slash className="w-3 h-3" />
              </kbd>
              <span>for module filters</span>
            </div>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground transition-colors hover-elevate"
      style={{ height: "2.25rem" }}
      data-testid="button-global-search"
    >
      <Search className="w-4 h-4" />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        <span className="text-xs">&#8984;</span>K
      </kbd>
    </button>
  );
}

export function GlobalSearchWithTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <GlobalSearchTrigger onClick={() => setOpen(true)} />
      {open && <GlobalSearchInner open={open} onOpenChange={setOpen} />}
    </>
  );
}

function GlobalSearchInner({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showPrefixes, setShowPrefixes] = useState(false);
  const [, navigate] = useLocation();
  const { currentTenant } = useTenant();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setQuery("");
      setResults([]);
      setShowPrefixes(false);
    }
  }, [open]);

  const performSearch = useCallback(
    async (searchQuery: string, moduleFilter?: string | null) => {
      if (searchQuery.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const tenantId = currentTenant?.id || "";
        const params = new URLSearchParams({
          q: searchQuery,
          ...(tenantId ? { tenantId: String(tenantId) } : {}),
        });
        const res = await fetch(`/api/global-search?${params}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data: GlobalSearchResults = await res.json();
          let allResults = transformResults(data, currentTenant?.id || null);
          if (moduleFilter) {
            allResults = allResults.filter((r) => r.module === moduleFilter);
          }
          setResults(allResults);
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentTenant]
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (value === "/") {
        setShowPrefixes(true);
        setResults([]);
        return;
      }
      setShowPrefixes(false);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      let actualQuery = value;
      let activeModule: string | null = null;
      for (const prefix of Object.keys(MODULE_PREFIXES)) {
        if (value.startsWith(prefix + " ")) {
          actualQuery = value.slice(prefix.length + 1);
          activeModule = MODULE_PREFIXES[prefix];
          break;
        }
      }

      debounceRef.current = setTimeout(() => {
        performSearch(actualQuery, activeModule);
      }, 300);
    },
    [performSearch]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (query.length >= 2) {
        saveRecentSearch(query);
      }
      onOpenChange(false);
      navigate(result.url);
    },
    [navigate, query, onOpenChange]
  );

  const handleRecentSelect = useCallback(
    (search: string) => {
      setQuery(search);
      performSearch(search);
    },
    [performSearch]
  );

  const handlePrefixSelect = useCallback((prefix: string) => {
    setQuery(prefix + " ");
    setShowPrefixes(false);
  }, []);

  const groupedResults: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groupedResults[r.module]) {
      groupedResults[r.module] = [];
    }
    groupedResults[r.module].push(r);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search across all modules... (type / for filters)"
        value={query}
        onValueChange={handleQueryChange}
        data-testid="input-global-search"
      />
      <CommandList className="max-h-[400px]">
        {isSearching && (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-search-loading">
            Searching...
          </div>
        )}

        {!isSearching && query.length >= 2 && results.length === 0 && (
          <CommandEmpty data-testid="text-search-empty">No results found.</CommandEmpty>
        )}

        {showPrefixes && (
          <CommandGroup heading="Filter by module">
            {Object.entries(MODULE_PREFIXES).map(([prefix, moduleKey]) => {
              const Icon = MODULE_ICONS[moduleKey] || Search;
              return (
                <CommandItem
                  key={prefix}
                  value={prefix}
                  onSelect={() => handlePrefixSelect(prefix)}
                  data-testid={`item-prefix-${moduleKey}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-mono text-xs">{prefix}</span>
                  <span className="text-muted-foreground ml-1">
                    {MODULE_LABELS[moduleKey]}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!showPrefixes && query.length < 2 && recentSearches.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recentSearches.map((search, idx) => (
              <CommandItem
                key={`recent-${idx}`}
                value={`recent-${search}`}
                onSelect={() => handleRecentSelect(search)}
                data-testid={`item-recent-search-${idx}`}
              >
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{search}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!showPrefixes &&
          !isSearching &&
          Object.entries(groupedResults).map(([moduleKey, items], groupIdx) => {
            const Icon = MODULE_ICONS[moduleKey] || Search;
            const label = MODULE_LABELS[moduleKey] || moduleKey;
            return (
              <div key={moduleKey}>
                {groupIdx > 0 && <CommandSeparator />}
                <CommandGroup heading={label}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={String(item.id)}
                      onSelect={() => handleSelect(item)}
                      data-testid={`item-search-result-${item.id}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate text-sm">{item.title}</span>
                        {item.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.badge && (
                        <Badge variant={item.badgeVariant || "secondary"} className="ml-auto shrink-0">
                          {item.badge}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}

        {!showPrefixes && query.length < 2 && recentSearches.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-search-hint">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Search className="w-4 h-4" />
              <span>Start typing to search</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
              <span>Type</span>
              <kbd className="pointer-events-none inline-flex select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <Slash className="w-3 h-3" />
              </kbd>
              <span>for module filters</span>
            </div>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
