import { Card, CardContent } from "@/components/ui/card";

export const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#3b82f6", low: "#22c55e",
};

export const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#a855f7"];

export function StatCard({ title, value, icon: Icon, color, subtitle, onClick }: {
  title: string; value: string | number; icon: any; color: string; subtitle?: string; onClick?: () => void;
}) {
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-all ${onClick ? "hover:border-primary/30" : ""}`}
      onClick={onClick} data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RichTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-2.5 text-xs">
      {label && <p className="font-semibold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export const RI_RISK_COLORS: Record<string, string> = {
  critical: "#dc2626", high: "#ea580c", medium: "#eab308", low: "#22c55e", minimal: "#6b7280",
};

export const riTooltipStyle = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px",
};

export function getScoreColor(score: number): string {
  if (score >= 80) return "#dc2626";
  if (score >= 60) return "#ea580c";
  if (score >= 40) return "#eab308";
  return "#22c55e";
}

export function getRiskBadgeClass(level: string) {
  switch (level?.toLowerCase()) {
    case "severe": return "bg-purple-600 text-white dark:bg-purple-700";
    case "critical": return "bg-red-600 text-white dark:bg-red-700";
    case "high": return "bg-orange-500 text-white dark:bg-orange-600";
    case "medium": case "moderate": return "bg-yellow-500 text-white dark:bg-yellow-600";
    case "low": return "bg-green-500 text-white dark:bg-green-600";
    default: return "bg-muted text-muted-foreground";
  }
}

export function RiskScoreBar({ score }: { score: number }) {
  const color = getScoreColor(score);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-muted/30 rounded-full h-2">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

export function getClassificationBadgeClass(classification: string) {
  switch (classification) {
    case "critical": return "bg-red-600 text-white dark:bg-red-700";
    case "risky": return "bg-orange-500 text-white dark:bg-orange-600";
    case "moderate": return "bg-yellow-500 text-white dark:bg-yellow-600";
    case "trusted": return "bg-green-500 text-white dark:bg-green-600";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getAppFavicon(appName: string): string {
  const domainMap: Record<string, string> = {
    'openai': 'openai.com', 'chatgpt': 'openai.com', 'google': 'google.com',
    'microsoft': 'microsoft.com', 'slack': 'slack.com', 'zoom': 'zoom.us',
    'dropbox': 'dropbox.com', 'salesforce': 'salesforce.com', 'github': 'github.com',
    'notion': 'notion.so', 'figma': 'figma.com', 'canva': 'canva.com',
    'whatsapp': 'whatsapp.com', 'gmail': 'gmail.com', 'adobe': 'adobe.com',
    'nvidia': 'nvidia.com', 'anthropic': 'anthropic.com', 'claude': 'anthropic.com',
    'grok': 'x.ai', 'deepseek': 'deepseek.com', 'perplexity': 'perplexity.ai',
    'fireflies': 'fireflies.ai', 'linkedin': 'linkedin.com', 'box': 'box.com',
    'aws': 'aws.amazon.com', 'amazon': 'amazon.com', 'trend micro': 'trendmicro.com',
  };
  const lower = appName.toLowerCase();
  for (const [key, domain] of Object.entries(domainMap)) {
    if (lower.includes(key)) return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  }
  return `https://www.google.com/s2/favicons?domain=${lower.replace(/[^a-z0-9]/g, '')}.com&sz=32`;
}
