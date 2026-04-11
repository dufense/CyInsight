import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot, X, Send, Loader2, Zap, ChevronDown, AlertTriangle, BarChart3, Shield,
  Clock, Activity, Database, Users, Target, TrendingUp, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface ARIAMessage {
  id: string;
  role: "user" | "aria";
  content: string;
  data?: {
    type: "metrics" | "table" | "links";
    items?: { label: string; value: number | string }[];
    columns?: string[];
    rows?: (string | number)[][];
  } | null;
  links?: { label: string; href: string }[];
  timestamp: Date;
  isError?: boolean;
}

interface QuickPrompt {
  label: string;
  icon: React.ElementType;
  question: string;
}

const DEFAULT_PROMPTS: QuickPrompt[] = [
  { label: "Today's briefing", icon: Shield, question: "Give me today's security briefing" },
  { label: "Top threats", icon: AlertTriangle, question: "What are the top threats this week?" },
  { label: "Open incidents", icon: Zap, question: "How many critical incidents are open right now?" },
  { label: "MITRE coverage", icon: BarChart3, question: "What is our MITRE ATT&CK coverage?" },
  { label: "SLA status", icon: Clock, question: "Are there any SLA breaches on tickets?" },
];

const PAGE_PROMPTS: Record<string, QuickPrompt[]> = {
  "/events": [
    { label: "Events today", icon: Activity, question: "How many security events occurred in the last 24 hours?" },
    { label: "Threat summary", icon: AlertTriangle, question: "Summarize today's threat activity" },
    { label: "Top threats", icon: Target, question: "What are the top threat actors this week?" },
    { label: "IOC list", icon: Shield, question: "Show me the latest malicious indicators" },
    { label: "Event severity", icon: BarChart3, question: "Break down events by severity" },
  ],
  "/incidents": [
    { label: "Incident summary", icon: Zap, question: "Summarize incidents from the last 7 days" },
    { label: "Critical open", icon: AlertTriangle, question: "How many critical incidents are open right now?" },
    { label: "MTTR metrics", icon: Clock, question: "What is our mean time to resolve incidents?" },
    { label: "MITRE coverage", icon: BarChart3, question: "What MITRE techniques have we seen?" },
    { label: "Recent incidents", icon: Activity, question: "Show me the most recent incidents" },
  ],
  "/threat-intel": [
    { label: "IOC list", icon: Shield, question: "Show me the latest threat indicators" },
    { label: "Top threats", icon: AlertTriangle, question: "What are the top threats this week?" },
    { label: "MITRE coverage", icon: BarChart3, question: "What MITRE techniques have been detected?" },
    { label: "Threat summary", icon: Target, question: "Give me a threat intelligence summary" },
    { label: "Malicious IPs", icon: Activity, question: "List recent malicious IP indicators" },
  ],
  "/operations": [
    { label: "SLA status", icon: Clock, question: "Are there any SLA breaches on tickets?" },
    { label: "Open tickets", icon: FileText, question: "How many open tickets are there?" },
    { label: "Open cases", icon: Database, question: "Show me open investigation cases" },
    { label: "MTTR metrics", icon: TrendingUp, question: "What is our average ticket resolution time?" },
    { label: "Critical tickets", icon: AlertTriangle, question: "Show me critical priority open tickets" },
  ],
  "/caasm": [
    { label: "Asset summary", icon: Database, question: "Give me an asset inventory summary" },
    { label: "Vulnerabilities", icon: Shield, question: "Which assets have the most vulnerabilities?" },
    { label: "User risk", icon: Users, question: "Who are the highest risk users?" },
    { label: "Unhealthy assets", icon: AlertTriangle, question: "How many assets are unhealthy or offline?" },
    { label: "Patch status", icon: Activity, question: "Summarize our patch and vulnerability status" },
  ],
  "/dashboard": [
    { label: "Today's briefing", icon: Shield, question: "Give me today's security briefing" },
    { label: "Top threats", icon: AlertTriangle, question: "What are the top threats this week?" },
    { label: "SLA status", icon: Clock, question: "Are there any SLA breaches on tickets?" },
    { label: "Asset overview", icon: Database, question: "Give me an asset inventory summary" },
    { label: "User risk", icon: Users, question: "Who are the highest risk users?" },
  ],
  "/mitre-coverage": [
    { label: "MITRE stats", icon: BarChart3, question: "What is our MITRE ATT&CK coverage?" },
    { label: "Top techniques", icon: Target, question: "What MITRE techniques have we seen most?" },
    { label: "Severity breakdown", icon: Activity, question: "Break down incidents by severity" },
    { label: "MTTR metrics", icon: Clock, question: "What is our mean time to detect incidents?" },
    { label: "Top threats", icon: AlertTriangle, question: "What are the top threats this week?" },
  ],
};

function getPagePrompts(path: string): QuickPrompt[] {
  for (const [prefix, prompts] of Object.entries(PAGE_PROMPTS)) {
    if (path === prefix || path.startsWith(prefix + "/")) return prompts;
  }
  return DEFAULT_PROMPTS;
}

function MetricCards({ items }: { items: { label: string; value: number | string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {items.slice(0, 6).map((item, i) => (
        <div key={i} className="bg-muted/30 dark:bg-white/5 rounded-lg p-2 border border-border dark:border-white/10">
          <div className="text-base font-bold text-primary">{item.value}</div>
          <div className="text-[11px] text-muted-foreground leading-tight">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border dark:border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border dark:border-white/10 bg-muted/30 dark:bg-white/5">
            {columns.map((col, i) => (
              <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, i) => (
            <tr key={i} className="border-b border-border/40 dark:border-white/5 hover:bg-muted/30 dark:hover:bg-white/5">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 text-foreground max-w-[120px] truncate">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseMarkdownBold(text: string) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-primary font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
    return <span key={li}>{rendered}{li < lines.length - 1 && line ? <br /> : null}</span>;
  });
}

export function AriaCopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ARIAMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;
  const [location] = useLocation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const quickPrompts = getPagePrompts(location);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-aria-copilot", handler);
    return () => window.removeEventListener("open-aria-copilot", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setHasNew(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading || !tenantId) return;
    setInput("");

    const userMsg: ARIAMessage = {
      id: Date.now().toString(),
      role: "user",
      content: question.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/copilot/query", {
        question: question.trim(),
        tenantId,
      });

      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "aria",
          content: errData.message || "Too many requests. Please wait a moment before asking again.",
          timestamp: new Date(),
          isError: true,
        }]);
        return;
      }

      const data = await res.json();
      const ariaMsg: ARIAMessage = {
        id: (Date.now() + 1).toString(),
        role: "aria",
        content: data.answer || "I was unable to process your question.",
        data: data.data || null,
        links: data.links || [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, ariaMsg]);
      if (!open) setHasNew(true);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "aria",
        content: "I'm experiencing connectivity issues. Please try again in a moment.",
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function clearChat() {
    setMessages([]);
  }

  return (
    <>
      <button
        data-testid="aria-copilot-toggle"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close ARIA Copilot" : "Open ARIA Copilot"}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center",
          "bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30",
          "hover:scale-110 active:scale-95 transition-all duration-200",
          "border border-primary/50",
          open && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        )}
      >
        {hasNew && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background animate-pulse" />
        )}
        {open ? <X className="w-5 h-5 text-primary-foreground" /> : <Bot className="w-5 h-5 text-primary-foreground" />}
      </button>

      <div
        data-testid="aria-copilot-panel"
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[420px] max-h-[620px] flex flex-col",
          "rounded-2xl border border-border dark:border-white/15 bg-background/95 backdrop-blur-xl",
          "shadow-2xl shadow-black/20",
          "transition-all duration-300 origin-bottom-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border dark:border-white/10 bg-muted/30 dark:bg-white/5 rounded-t-2xl shrink-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-sm shadow-primary/30">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">ARIA</div>
            <div className="text-xs text-muted-foreground">AI Security Copilot · Online</div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                data-testid="aria-copilot-clear"
                title="Clear chat"
                className="p-1.5 rounded-lg hover:bg-muted dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              >
                <span className="text-[10px] font-medium">Clear</span>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              data-testid="aria-copilot-close"
              className="p-1 rounded-lg hover:bg-muted dark:hover:bg-white/10 transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[420px] overscroll-contain">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-center pt-2">
                <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-medium">Hello, I'm ARIA</p>
                <p className="text-xs text-muted-foreground mt-1 px-4">Your AI security analyst. Ask me anything about your security posture.</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 mt-3">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt.label}
                    data-testid={`aria-quick-prompt-${prompt.label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => sendMessage(prompt.question)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted dark:hover:bg-white/10 hover:border-primary/30 transition-all text-left text-xs text-foreground"
                  >
                    <prompt.icon className="w-3.5 h-3.5 text-primary shrink-0" />
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "aria" && (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mr-2 mt-1 shrink-0">
                  <Bot className="w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : msg.isError
                    ? "bg-red-500/10 border border-red-500/30 rounded-tl-sm text-red-600 dark:text-red-400"
                    : "bg-muted/50 dark:bg-white/[0.08] border border-border dark:border-white/10 rounded-tl-sm"
              )}>
                <div className="leading-relaxed">{parseMarkdownBold(msg.content)}</div>
                {msg.data?.type === "metrics" && msg.data.items && (
                  <MetricCards items={msg.data.items} />
                )}
                {msg.data?.type === "table" && msg.data.columns && msg.data.rows && (
                  <DataTable columns={msg.data.columns} rows={msg.data.rows} />
                )}
                {msg.links && msg.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.links.map((link, i) => (
                      <Link key={i} href={link.href} onClick={() => setOpen(false)}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-primary/20 text-xs border-primary/30 text-primary">
                          {link.label}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/50 mt-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mr-2 mt-1 shrink-0">
                <Bot className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
              <div className="bg-muted/50 dark:bg-white/[0.08] border border-border dark:border-white/10 rounded-2xl rounded-tl-sm px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs">ARIA is analyzing...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-border dark:border-white/10 shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask ARIA about your security posture..."
              rows={1}
              data-testid="aria-copilot-input"
              className="resize-none text-sm min-h-[36px] max-h-[100px] bg-muted/30 dark:bg-white/5 border-border dark:border-white/10 rounded-xl"
            />
            <Button
              size="sm"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              data-testid="aria-copilot-send"
              className="rounded-xl h-9 px-3 shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">ARIA uses your live security data · 20 req/min</p>
        </div>
      </div>
    </>
  );
}
