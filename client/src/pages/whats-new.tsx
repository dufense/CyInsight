import { useState, useMemo } from "react";
import { Sparkles, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChangelogCategory = "Feature" | "Improvement" | "Security" | "Fix";

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  category: ChangelogCategory;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v3.8.0",
    date: "2026-03-10",
    title: "Dynamic Theming & Personalization",
    description: "Customize your platform experience with dynamic theming and personalization options.",
    category: "Feature",
    items: [
      "Custom accent colors for personalized UI",
      "8 color presets to choose from",
      "Persistent theme preferences across sessions",
    ],
  },
  {
    version: "v3.7.0",
    date: "2026-03-08",
    title: "Interactive Guided Tours",
    description: "Onboard faster with interactive guided tours that walk you through key platform features.",
    category: "Feature",
    items: [
      "Step-by-step platform tours",
      "Spotlight overlay highlighting key elements",
      "3 predefined tours for different user roles",
    ],
  },
  {
    version: "v3.6.0",
    date: "2026-03-05",
    title: "Real-Time Notification Center",
    description: "Stay informed with a centralized notification center delivering real-time alerts.",
    category: "Feature",
    items: [
      "In-app notifications with read/unread tracking",
      "Severity indicators for priority triage",
      "Auto-alerts for critical incidents",
    ],
  },
  {
    version: "v3.5.0",
    date: "2026-03-03",
    title: "Compare Reports",
    description: "Analyze security trends by comparing reports side by side with detailed delta indicators.",
    category: "Feature",
    items: [
      "Side-by-side report comparison view",
      "Delta indicators showing changes over time",
      "Security posture tracking across periods",
    ],
  },
  {
    version: "v3.4.0",
    date: "2026-02-28",
    title: "CAASM Chart Enhancements",
    description: "Enhanced charting capabilities for deeper asset analytics and better export options.",
    category: "Improvement",
    items: [
      "HD chart export for presentations and reports",
      "Expandable charts for detailed analysis",
      "OS distribution chart type switching (donut/pie/bar/table)",
    ],
  },
  {
    version: "v3.3.0",
    date: "2026-02-25",
    title: "AI SOC Analyst Agents",
    description: "Autonomous AI agents that investigate incidents and accelerate threat response.",
    category: "Feature",
    items: [
      "5 autonomous AI agents (ARIA, VANGUARD, SENTINEL, GUARDIAN, NEXUS)",
      "Automated incident investigation workflows",
      "AI-driven threat correlation and analysis",
    ],
  },
  {
    version: "v3.2.0",
    date: "2026-02-20",
    title: "Risk Intelligence Dashboard",
    description: "Unified risk visibility with scoring, profiles, and trend analysis across your environment.",
    category: "Feature",
    items: [
      "Unified risk scoring across all entities",
      "Entity risk profiles with historical context",
      "Risk trend analysis and forecasting",
      "Compound risk alerts for correlated threats",
    ],
  },
  {
    version: "v3.1.0",
    date: "2026-02-15",
    title: "Sankey Diagram Improvements",
    description: "Better visualization of data flows with improved Sankey diagram rendering and export.",
    category: "Improvement",
    items: [
      "Full SVG export capture for complete diagrams",
      "Improved label padding for readability",
      "OS-specific flow views for targeted analysis",
    ],
  },
  {
    version: "v3.0.1",
    date: "2026-02-10",
    title: "Security Patch",
    description: "Critical security improvements for multi-tenant data isolation and access controls.",
    category: "Security",
    items: [
      "Enhanced tenant data segregation",
      "Strict access control enforcement",
      "Session security improvements",
    ],
  },
  {
    version: "v3.0.0",
    date: "2026-02-05",
    title: "Platform 3.0 Launch",
    description: "Major platform release introducing multi-tenant architecture, CAASM, and AI-powered reporting.",
    category: "Feature",
    items: [
      "Multi-tenant MSSP architecture",
      "CAASM module with 12 submodules",
      "44 AI report templates for comprehensive coverage",
    ],
  },
];

export function getUnreadCount(lastViewedDate: string): number {
  const lastViewed = new Date(lastViewedDate);
  return CHANGELOG.filter((entry) => new Date(entry.date) > lastViewed).length;
}

const categoryColors: Record<ChangelogCategory, string> = {
  Feature: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Improvement: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Security: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Fix: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

export default function WhatsNewPage() {
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    return CHANGELOG.filter((entry) => {
      const matchesCategory =
        categoryFilter === "all" || entry.category === categoryFilter;
      const query = searchText.toLowerCase();
      const matchesSearch =
        !query ||
        entry.title.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.version.toLowerCase().includes(query) ||
        entry.items.some((item) => item.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [searchText, categoryFilter]);

  return (
    <div className="flex-1 overflow-auto p-6" data-testid="whats-new-page">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-page-title"
          >
            What's New
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3" data-testid="filter-bar">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search changelog..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Feature">Feature</SelectItem>
              <SelectItem value="Improvement">Improvement</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
              <SelectItem value="Fix">Fix</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredEntries.length === 0 && (
          <p
            className="text-center text-muted-foreground py-8"
            data-testid="text-no-results"
          >
            No entries match your search.
          </p>
        )}

        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <Card key={entry.version} data-testid={`card-changelog-${entry.version}`}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" data-testid={`badge-version-${entry.version}`}>
                    {entry.version}
                  </Badge>
                  <span className="text-sm text-muted-foreground" data-testid={`text-date-${entry.version}`}>
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <Badge
                  className={`no-default-hover-elevate no-default-active-elevate ${categoryColors[entry.category]}`}
                  data-testid={`badge-category-${entry.version}`}
                >
                  {entry.category}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardTitle className="text-lg" data-testid={`text-title-${entry.version}`}>
                  {entry.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground" data-testid={`text-description-${entry.version}`}>
                  {entry.description}
                </p>
                <ul className="list-disc pl-5 space-y-1" data-testid={`list-items-${entry.version}`}>
                  {entry.items.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-sm"
                      data-testid={`text-item-${entry.version}-${idx}`}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
