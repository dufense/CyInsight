import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHero } from "@/components/page-hero";
import { useTenant } from "@/lib/tenant-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Play, Plus, Trash2, Edit, Zap, Mail, ShieldBan, Ban, Ticket, UserCheck, Brain,
  AlertTriangle, Eye, Webhook, CheckCircle2, XCircle, Clock, BookTemplate, Workflow,
  Loader2, CheckCircle, Download, Upload, FlaskConical, Save, ArrowLeft, GitBranch,
  BellRing, Cpu, Circle, LayoutGrid, List, Network, MousePointer2, Minus, RefreshCw,
  SquareArrowRight,
} from "lucide-react";
import type { Playbook, PlaybookExecution, PlaybookGraphNode, PlaybookGraphEdge, PlaybookTriggerConditions } from "@shared/schema";

// DB returns snake_case; Drizzle maps to camelCase — helper for field access
function pbIsActive(pb: Playbook): boolean { return (pb as unknown as { is_active?: boolean }).is_active ?? pb.isActive ?? true; }
function pbIsTemplate(pb: Playbook): boolean { return (pb as unknown as { is_template?: boolean }).is_template ?? pb.isTemplate ?? false; }
function pbGraphNodes(pb: Playbook): PlaybookGraphNode[] {
  const raw = (pb as unknown as { graph_nodes?: PlaybookGraphNode[] }).graph_nodes ?? pb.graphNodes;
  return Array.isArray(raw) ? raw : [];
}
function pbGraphEdges(pb: Playbook): PlaybookGraphEdge[] {
  const raw = (pb as unknown as { graph_edges?: PlaybookGraphEdge[] }).graph_edges ?? pb.graphEdges;
  return Array.isArray(raw) ? raw : [];
}
function pbTriggerConds(pb: Playbook): PlaybookTriggerConditions {
  const raw = (pb as unknown as { trigger_conditions?: PlaybookTriggerConditions }).trigger_conditions ?? pb.triggerConditions;
  return (raw as PlaybookTriggerConditions) || {};
}

// ===================== CONSTANTS =====================
const NODE_W = 180;
const NODE_H = 64;
const PORT_R = 7;

const NODE_META: Record<string, { label: string; color: string; stroke: string; bg: string }> = {
  trigger:       { label: "Trigger",       color: "#f59e0b", stroke: "#d97706", bg: "#fffbeb" },
  condition:     { label: "Condition",     color: "#8b5cf6", stroke: "#7c3aed", bg: "#f5f3ff" },
  action:        { label: "Action",        color: "#0ea5e9", stroke: "#0284c7", bg: "#f0f9ff" },
  notification:  { label: "Notification",  color: "#3b82f6", stroke: "#2563eb", bg: "#eff6ff" },
  ai_enrichment: { label: "AI Analysis",   color: "#10b981", stroke: "#059669", bg: "#f0fdf4" },
  end:           { label: "End",           color: "#6b7280", stroke: "#4b5563", bg: "#f9fafb" },
};

const PALETTE_NODES: { type: PlaybookGraphNode["type"]; icon: string; color: string }[] = [
  { type: "trigger",       icon: "⚡", color: "#f59e0b" },
  { type: "condition",     icon: "◆", color: "#8b5cf6" },
  { type: "action",        icon: "⚙", color: "#0ea5e9" },
  { type: "notification",  icon: "🔔", color: "#3b82f6" },
  { type: "ai_enrichment", icon: "🤖", color: "#10b981" },
  { type: "end",           icon: "⬛", color: "#6b7280" },
];

const ACTION_TYPES = [
  "isolate_asset", "block_ioc", "disable_account", "quarantine_email",
  "create_ticket", "update_severity", "assign_agent", "add_watchlist", "custom_webhook",
];

const TRIGGER_SEVERITY    = ["low", "medium", "high", "critical"];
const TRIGGER_TACTICS     = ["Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection",
  "Exfiltration", "Command and Control", "Impact"];
const TRIGGER_TECHNIQUES  = [
  "T1059", "T1078", "T1021", "T1055", "T1027", "T1053", "T1003", "T1110", "T1190",
  "T1566", "T1486", "T1082", "T1083", "T1105", "T1071", "T1041", "T1048", "T1133",
];
const TRIGGER_IOC         = ["ip", "domain", "url", "hash", "email"];
const TRIGGER_CRITICALITY = ["low", "medium", "high", "critical"];

// ===================== HELPERS =====================
function getInputPortPos(x: number, y: number)  { return { px: x + NODE_W / 2, py: y }; }
function getOutputPortPos(x: number, y: number, port: "default" | "true" | "false") {
  if (port === "true")  return { px: x + NODE_W * 0.3, py: y + NODE_H };
  if (port === "false") return { px: x + NODE_W * 0.7, py: y + NODE_H };
  return { px: x + NODE_W / 2, py: y + NODE_H };
}
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.abs(y2 - y1) * 0.6 + 40;
  return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}
function uid() { return Math.random().toString(36).slice(2, 10); }

function graphToSteps(nodes: PlaybookGraphNode[], edges: PlaybookGraphEdge[]) {
  const actionTypes = ["action", "notification", "ai_enrichment"];
  const edgeMap = new Map<string, PlaybookGraphEdge[]>();
  for (const e of edges) {
    if (!edgeMap.has(e.from)) edgeMap.set(e.from, []);
    edgeMap.get(e.from)!.push(e);
  }
  const visited = new Set<string>();
  const order: PlaybookGraphNode[] = [];
  const trigger = nodes.find(n => n.type === "trigger");
  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find(n => n.id === id);
    if (node && actionTypes.includes(node.type)) order.push(node);
    for (const e of (edgeMap.get(id) || [])) walk(e.to);
  }
  if (trigger) walk(trigger.id);
  return order.map((n, i) => ({
    id: n.id, type: n.config?.actionType || n.type, label: n.label, config: n.config || {}, order: i + 1,
  }));
}

// ===================== SVG NODE =====================
interface GraphNodeProps {
  node: PlaybookGraphNode;
  selected: boolean;
  simResult?: string;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onPortClick: (port: "default" | "true" | "false", e: React.MouseEvent) => void;
  onPortDrop: (e: React.MouseEvent) => void;
  isConnecting: boolean;
}

function GraphNodeEl({ node, selected, simResult, onSelect, onDragStart, onPortClick, onPortDrop, isConnecting }: GraphNodeProps) {
  const meta = NODE_META[node.type] || NODE_META.action;
  const isCondition = node.type === "condition";
  const simColor = simResult === "executed" || simResult === "branch_true" || simResult === "branch_false"
    ? "#22c55e" : simResult === "skipped" ? "#9ca3af" : undefined;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onMouseDown={(e) => { e.stopPropagation(); onDragStart(e); onSelect(); }}
      style={{ cursor: "grab" }}
    >
      <rect x={3} y={3} width={NODE_W} height={NODE_H} rx={10} fill="rgba(0,0,0,0.12)" />
      <rect
        width={NODE_W} height={NODE_H} rx={10}
        fill={simColor || meta.bg}
        stroke={selected ? "#6366f1" : simColor || meta.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <rect width={NODE_W} height={22} rx={10} fill={meta.color} />
      <rect x={0} y={12} width={NODE_W} height={10} fill={meta.color} />
      <text x={NODE_W / 2} y={15} textAnchor="middle" fontSize={10} fill="white" fontWeight={600}>{meta.label}</text>
      <text x={NODE_W / 2} y={42} textAnchor="middle" fontSize={12} fill="#1e293b" fontWeight={500}>
        {node.label.slice(0, 22)}
      </text>
      {simResult && (
        <text x={NODE_W / 2} y={57} textAnchor="middle" fontSize={9} fill={simColor || "#6b7280"}>
          {simResult === "branch_true" ? "→ TRUE" : simResult === "branch_false" ? "→ FALSE" : simResult}
        </text>
      )}
      {/* Input port top */}
      <circle
        cx={NODE_W / 2} cy={0} r={PORT_R}
        fill="white" stroke={meta.stroke} strokeWidth={2}
        style={{ cursor: isConnecting ? "crosshair" : "default" }}
        onMouseUp={(e) => { e.stopPropagation(); onPortDrop(e); }}
      />
      {/* Output ports */}
      {isCondition ? (
        <>
          <circle cx={NODE_W * 0.3} cy={NODE_H} r={PORT_R} fill="#22c55e" stroke="#16a34a" strokeWidth={2}
            style={{ cursor: "crosshair" }}
            onMouseDown={(e) => { e.stopPropagation(); onPortClick("true", e); }} />
          <text x={NODE_W * 0.3} y={NODE_H + 18} textAnchor="middle" fontSize={9} fill="#16a34a" fontWeight={600}>TRUE</text>
          <circle cx={NODE_W * 0.7} cy={NODE_H} r={PORT_R} fill="#ef4444" stroke="#dc2626" strokeWidth={2}
            style={{ cursor: "crosshair" }}
            onMouseDown={(e) => { e.stopPropagation(); onPortClick("false", e); }} />
          <text x={NODE_W * 0.7} y={NODE_H + 18} textAnchor="middle" fontSize={9} fill="#dc2626" fontWeight={600}>FALSE</text>
        </>
      ) : node.type !== "end" && (
        <circle cx={NODE_W / 2} cy={NODE_H} r={PORT_R} fill="white" stroke={meta.stroke} strokeWidth={2}
          style={{ cursor: "crosshair" }}
          onMouseDown={(e) => { e.stopPropagation(); onPortClick("default", e); }} />
      )}
    </g>
  );
}

// ===================== SVG DEFS (arrowheads) =====================
// Rendered once inside the SVG, shared by all edges
function EdgeDefs() {
  return (
    <defs>
      {[
        { id: "arrow-default", color: "#6366f1" },
        { id: "arrow-true",    color: "#22c55e" },
        { id: "arrow-false",   color: "#ef4444" },
        { id: "arrow-selected",color: "#f59e0b" },
      ].map(({ id, color }) => (
        <marker key={id} id={id} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
      ))}
    </defs>
  );
}

// ===================== SVG EDGE =====================
function GraphEdgeEl({ edge, nodes, selected, onClick }: {
  edge: PlaybookGraphEdge; nodes: PlaybookGraphNode[]; selected: boolean; onClick: () => void;
}) {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode   = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return null;
  const { px: x1, py: y1 } = getOutputPortPos(fromNode.x, fromNode.y, edge.fromPort);
  const { px: x2, py: y2 } = getInputPortPos(toNode.x, toNode.y);
  const d = cubicBezier(x1, y1, x2, y2);
  const portColor = edge.fromPort === "true" ? "#22c55e" : edge.fromPort === "false" ? "#ef4444" : "#6366f1";
  const markerId = selected ? "arrow-selected" : edge.fromPort === "true" ? "arrow-true" : edge.fromPort === "false" ? "arrow-false" : "arrow-default";
  return (
    <g onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ cursor: "pointer" }}>
      <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
      <path d={d} stroke={selected ? "#f59e0b" : portColor} strokeWidth={selected ? 2.5 : 2}
        fill="none" opacity={0.8} strokeDasharray={selected ? "5,3" : undefined}
        markerEnd={`url(#${markerId})`} />
    </g>
  );
}

// ===================== NODE CONFIG PANEL =====================
function NodeConfigPanel({ node, onChange, onDelete }: {
  node: PlaybookGraphNode; onChange: (n: PlaybookGraphNode) => void; onDelete: () => void;
}) {
  const update       = (patch: Partial<PlaybookGraphNode>) => onChange({ ...node, ...patch });
  const updateConfig = (patch: Record<string, any>) => onChange({ ...node, config: { ...node.config, ...patch } });
  const updateCond   = (patch: Record<string, any>) => updateConfig({ condition: { ...(node.config?.condition || {}), ...patch } });

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full" data-testid="node-config-panel">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Node Config</span>
        <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={onDelete} data-testid="btn-delete-node">
          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
        </Button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Label</Label>
        <Input value={node.label} onChange={e => update({ label: e.target.value })} className="h-8 text-sm" data-testid="input-node-label" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select value={node.type} onValueChange={v => update({ type: v as PlaybookGraphNode["type"] })}>
          <SelectTrigger className="h-8 text-sm" data-testid="select-node-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PALETTE_NODES.map(p => (
              <SelectItem key={p.type} value={p.type}>{NODE_META[p.type]?.label || p.type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {node.type === "action" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Action Type</Label>
          <Select value={node.config?.actionType || ""} onValueChange={v => updateConfig({ actionType: v })}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-action-type"><SelectValue placeholder="Select action…" /></SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map(a => (
                <SelectItem key={a} value={a}>{a.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {node.config?.actionType === "block_ioc" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Block Type</Label>
              <Select value={node.config?.blockType || "ip"} onValueChange={v => updateConfig({ blockType: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ip","domain","url","hash"].map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {node.config?.actionType === "update_severity" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target Severity</Label>
              <Select value={node.config?.severity || "high"} onValueChange={v => updateConfig({ severity: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","medium","high","critical"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {node.config?.actionType === "custom_webhook" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Webhook URL</Label>
              <Input value={node.config?.webhookUrl || ""} onChange={e => updateConfig({ webhookUrl: e.target.value })}
                className="h-8 text-sm" placeholder="https://…" />
            </div>
          )}
        </div>
      )}

      {node.type === "notification" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <Select value={node.config?.channel || "email"} onValueChange={v => updateConfig({ channel: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["email","slack","pagerduty","teams","webhook"].map(c => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Recipients</Label>
            <Input value={node.config?.recipients || ""} onChange={e => updateConfig({ recipients: e.target.value })}
              className="h-8 text-sm" placeholder="soc-team, ciso@…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea value={node.config?.message || ""} onChange={e => updateConfig({ message: e.target.value })}
              className="text-sm resize-none" rows={3} placeholder="Incident requires attention…" />
          </div>
        </div>
      )}

      {node.type === "ai_enrichment" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Analysis Type</Label>
          <Select value={node.config?.analysisType || "full"} onValueChange={v => updateConfig({ analysisType: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[["full","Full Analysis"],["ioc","IOC Reputation"],["mitre","MITRE Mapping"],["risk","Risk Scoring"],["summary","Executive Summary"]].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={!!node.config?.storeResults} onCheckedChange={v => updateConfig({ storeResults: v })} id="store-results" />
            <Label htmlFor="store-results" className="text-xs">Store to incident</Label>
          </div>
        </div>
      )}

      {node.type === "condition" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground font-semibold">Condition Rule</Label>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Select value={node.config?.condition?.field || "severity"} onValueChange={v => updateCond({ field: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                ["severity","Severity"],
                ["incident_type","Incident Type"],
                ["status","Status"],
                ["source","Source"],
                ["mitre_tactic","MITRE Tactic"],
                ["mitre_technique_id","MITRE Technique ID"],
                ["kill_chain_phase","Kill Chain Phase"],
                ["confidence_score","Confidence Score"],
                ["action_taken","Action Taken"],
                ["detection_source","Detection Source"],
              ].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select value={node.config?.condition?.operator || "eq"} onValueChange={v => updateCond({ operator: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["eq","equals"],["neq","not equals"],["contains","contains"],["in","is one of"]].map(([v,l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input value={node.config?.condition?.value || ""} onChange={e => updateCond({ value: e.target.value })}
              className="h-8 text-sm" placeholder="critical, high, …" />
          </div>
          <div className="p-2 bg-muted/40 rounded text-xs text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />TRUE → left port</div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />FALSE → right port</div>
          </div>
        </div>
      )}

      {node.type === "trigger" && (
        <p className="text-xs text-muted-foreground">Trigger rules are configured via the Triggers button in the toolbar. This node starts the workflow.</p>
      )}
    </div>
  );
}

// ===================== TRIGGER CONFIG =====================
function TriggerConfig({ value, onChange }: { value: PlaybookTriggerConditions; onChange: (v: PlaybookTriggerConditions) => void }) {
  const toggle = (key: keyof PlaybookTriggerConditions, val: string) => {
    const arr: string[] = (value[key] as string[] | undefined) || [];
    const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
    onChange({ ...value, [key]: next });
  };
  const isActive = (key: keyof PlaybookTriggerConditions, val: string) => ((value[key] as string[] | undefined) || []).includes(val);

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Severity Levels</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TRIGGER_SEVERITY.map(s => (
            <Button key={s} variant={isActive("severity", s) ? "default" : "outline"} size="sm"
              className="h-7 text-xs capitalize" onClick={() => toggle("severity", s)}
              data-testid={`trigger-severity-${s}`}>{s}</Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">MITRE Tactics</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TRIGGER_TACTICS.map(t => (
            <Button key={t} variant={isActive("mitreTactics", t) ? "default" : "outline"} size="sm"
              className="h-6 text-xs" onClick={() => toggle("mitreTactics", t)}
              data-testid={`trigger-tactic-${t.replace(/\s/g,"-")}`}>{t}</Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">MITRE Technique IDs</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TRIGGER_TECHNIQUES.map(t => (
            <Button key={t} variant={isActive("mitreTechniqueIds", t) ? "default" : "outline"} size="sm"
              className="h-6 text-xs font-mono" onClick={() => toggle("mitreTechniqueIds", t)}
              data-testid={`trigger-technique-${t}`}>{t}</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Fires when incident has a matching MITRE technique</p>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">IOC Types</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TRIGGER_IOC.map(i => (
            <Button key={i} variant={isActive("iocTypes", i) ? "default" : "outline"} size="sm"
              className="h-7 text-xs uppercase" onClick={() => toggle("iocTypes", i)}
              data-testid={`trigger-ioc-${i}`}>{i}</Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Asset Criticality</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TRIGGER_CRITICALITY.map(c => (
            <Button key={c} variant={isActive("assetCriticality", c) ? "default" : "outline"} size="sm"
              className="h-7 text-xs capitalize" onClick={() => toggle("assetCriticality", c)}
              data-testid={`trigger-criticality-${c}`}>{c}</Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================== SIM TRACE =====================
function SimTrace({ trace }: { trace: any[] }) {
  if (!trace.length) return <div className="text-sm text-muted-foreground text-center py-8">No trace data</div>;
  const cls = (r: string) => ({
    executed:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    branch_true:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    branch_false: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    skipped:      "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  }[r] || "bg-gray-100 text-gray-500");
  return (
    <div className="space-y-2">
      {trace.map((t, i) => (
        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold">{t.label}</span>
              <Badge className={`text-xs px-1.5 py-0 h-4 ${cls(t.result)}`}>{t.result.replace("_"," ")}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">{t.durationMs}ms</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{t.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================== VISUAL EDITOR =====================
interface VisualEditorProps {
  playbook: Playbook;
  tenantId: number;
  onClose?: () => void;
}

function VisualEditor({ playbook, tenantId, onClose }: VisualEditorProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  // Build initial graph state from playbook data.
  // Returns both nodes and edges so legacy-step conversion always produces a connected graph.
  const initGraph = (): { nodes: PlaybookGraphNode[]; edges: PlaybookGraphEdge[] } => {
    const existingNodes: PlaybookGraphNode[] = pbGraphNodes(playbook);
    const existingEdges: PlaybookGraphEdge[] = pbGraphEdges(playbook);
    // If saved graph exists, use it as-is
    if (existingNodes.length > 0) return { nodes: existingNodes, edges: existingEdges };
    // Legacy steps: synthesize a linear graph with edges so graphToSteps() can traverse it
    const legacySteps = (playbook.steps || []) as { id: string; type: string; label: string; config: Record<string, unknown>; order: number }[];
    if (legacySteps.length > 0) {
      const t: PlaybookGraphNode = { id: uid(), type: "trigger", label: "Trigger", x: 220, y: 40, config: {} };
      const acts: PlaybookGraphNode[] = legacySteps.map((s, i) => ({
        id: uid(),
        type: (s.type === "notify" ? "notification" : s.type === "run_ai_analysis" ? "ai_enrichment" : "action") as PlaybookGraphNode["type"],
        label: s.label || s.type, x: 220, y: 160 + i * 120,
        config: { ...(s.config as PlaybookGraphNode["config"]), actionType: s.type },
      }));
      const endNode: PlaybookGraphNode = { id: uid(), type: "end", label: "End", x: 220, y: 160 + legacySteps.length * 120, config: {} };
      const allNodes = [t, ...acts, endNode];
      // Synthesize linear edges: trigger → act[0] → act[1] → … → end
      const synthEdges: PlaybookGraphEdge[] = allNodes.slice(0, -1).map((n, i) => ({
        id: `e-${n.id}-${allNodes[i + 1].id}`,
        from: n.id, to: allNodes[i + 1].id, fromPort: "default",
      }));
      return { nodes: allNodes, edges: synthEdges };
    }
    // Fresh playbook: trigger + end with a connecting edge
    const triggerId = uid(); const endId = uid();
    return {
      nodes: [
        { id: triggerId, type: "trigger", label: "Trigger", x: 220, y: 60, config: {} },
        { id: endId,     type: "end",     label: "End",     x: 220, y: 220, config: {} },
      ],
      edges: [{ id: `e-${triggerId}-${endId}`, from: triggerId, to: endId, fromPort: "default" }],
    };
  };

  const { nodes: initN, edges: initE } = useMemo(initGraph, []);
  const [nodes, setNodes] = useState<PlaybookGraphNode[]>(initN);
  const [edges, setEdges] = useState<PlaybookGraphEdge[]>(initE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [zoom, setZoom] = useState(1);
  const [connecting, setConnecting] = useState<{ nodeId: string; port: "default" | "true" | "false"; fromX: number; fromY: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState("canvas");
  const [simTrace, setSimTrace] = useState<any[] | null>(null);
  const [isSimRunning, setIsSimRunning] = useState(false);
  const [simIncidentId, setSimIncidentId] = useState<string>("");
  const [showTriggerConfig, setShowTriggerConfig] = useState(false);
  const [triggerConds, setTriggerConds] = useState<PlaybookTriggerConditions>(pbTriggerConds(playbook));
  const [isSaving, setIsSaving] = useState(false);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const svgToWorld = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const w = svgToWorld(e.clientX, e.clientY);
    setMousePos(w);
    if (dragNodeId) {
      setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: w.x - dragOffset.x, y: w.y - dragOffset.y } : n));
    }
    if (isPanning) setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
  }, [dragNodeId, dragOffset, isPanning, svgToWorld]);

  const handleMouseUp = useCallback(() => {
    setDragNodeId(null);
    setIsPanning(false);
    if (connecting) setConnecting(null);
  }, [connecting]);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const el = e.target as SVGElement;
    if (el === svgRef.current || el.tagName === "svg" || el.getAttribute("data-bg") === "1") {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnecting(null);
      setIsPanning(true);
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)));
  }, []);

  const startDrag = useCallback((nodeId: string, e: React.MouseEvent) => {
    const w = svgToWorld(e.clientX, e.clientY);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDragNodeId(nodeId);
    setDragOffset({ x: w.x - node.x, y: w.y - node.y });
  }, [nodes, svgToWorld]);

  const startConnect = useCallback((nodeId: string, port: "default" | "true" | "false", e: React.MouseEvent) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const { px, py } = getOutputPortPos(node.x, node.y, port);
    setConnecting({ nodeId, port, fromX: px, fromY: py });
    setSelectedNodeId(null);
  }, [nodes]);

  const completeConnect = useCallback((toNodeId: string) => {
    if (!connecting || connecting.nodeId === toNodeId) return;
    const exists = edges.some(e => e.from === connecting.nodeId && e.to === toNodeId && e.fromPort === connecting.port);
    if (!exists) setEdges(prev => [...prev, { id: uid(), from: connecting.nodeId, fromPort: connecting.port, to: toNodeId }]);
    setConnecting(null);
  }, [connecting, edges]);

  const addNode = (type: PlaybookGraphNode["type"], worldPos?: { x: number; y: number }) => {
    const pos = worldPos ?? { x: 80 + Math.random() * 260, y: 80 + Math.random() * 200 };
    const n: PlaybookGraphNode = {
      id: uid(), type, label: NODE_META[type]?.label || type,
      x: pos.x, y: pos.y, config: {},
    };
    setNodes(prev => [...prev, n]);
    setSelectedNodeId(n.id);
  };

  const handleCanvasDragOver = useCallback((e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("application/playbook-node-type") as PlaybookGraphNode["type"];
    if (!nodeType) return;
    const worldPos = svgToWorld(e.clientX, e.clientY);
    addNode(nodeType, { x: worldPos.x - NODE_W / 2, y: worldPos.y - NODE_H / 2 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgToWorld, pan, zoom]);

  const deleteNode = useCallback((id?: string) => {
    const target = id || selectedNodeId;
    if (!target) return;
    setNodes(prev => prev.filter(n => n.id !== target));
    setEdges(prev => prev.filter(e => e.from !== target && e.to !== target));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const deleteEdge = useCallback((id?: string) => {
    const target = id || selectedEdgeId;
    if (!target) return;
    setEdges(prev => prev.filter(e => e.id !== target));
    setSelectedEdgeId(null);
  }, [selectedEdgeId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) deleteNode();
        else if (selectedEdgeId) deleteEdge();
      }
      if (e.key === "Escape") { setConnecting(null); setSelectedNodeId(null); setSelectedEdgeId(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedNodeId, selectedEdgeId, deleteNode, deleteEdge]);

  const autoLayout = () => {
    const trigger = nodes.find(n => n.type === "trigger");
    const endN = nodes.find(n => n.type === "end");
    const others = nodes.filter(n => n.type !== "trigger" && n.type !== "end");
    const cx = 220; let y = 60;
    const upd = [...nodes];
    const set = (id: string, nx: number, ny: number) => {
      const i = upd.findIndex(n => n.id === id);
      if (i >= 0) upd[i] = { ...upd[i], x: nx, y: ny };
    };
    if (trigger) { set(trigger.id, cx, y); y += 130; }
    for (const n of others) { set(n.id, cx, y); y += 130; }
    if (endN) set(endN.id, cx, y);
    setNodes(upd);
    setPan({ x: 80, y: 20 });
    setZoom(1);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const steps = graphToSteps(nodes, edges);
      await apiRequest("PATCH", `/api/playbooks/${tenantId}/${playbook.id}/graph`, { graphNodes: nodes, graphEdges: edges, steps });
      await apiRequest("PATCH", `/api/playbooks/${tenantId}/${playbook.id}`, {
        triggerConditions: triggerConds, name: playbook.name, description: playbook.description,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] });
      toast({ title: "Saved", description: "Playbook saved successfully." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const simulate = async (overrideIncidentId?: string) => {
    setIsSimRunning(true);
    setSimTrace(null);
    const incId = overrideIncidentId ?? simIncidentId;
    try {
      const body: any = {};
      if (incId && incId !== "") body.incidentId = parseInt(incId);
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}/${playbook.id}/simulate`, body);
      const data = await res.json();
      setSimTrace(data.trace || []);
      setActiveTab("simulation");
      toast({ title: "Simulation complete", description: `${data.executedNodes} of ${data.totalNodes} nodes would execute` });
      queryClient.invalidateQueries({ queryKey: [`/api/playbook-executions/${tenantId}`] });
    } catch {
      toast({ title: "Simulation failed", variant: "destructive" });
    } finally {
      setIsSimRunning(false);
    }
  };

  const exportPb = async () => {
    try {
      const res = await fetch(`/api/playbooks/${tenantId}/${playbook.id}/export`, { credentials: "include" });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `playbook-${playbook.name.replace(/\s+/g,"-")}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
  };

  const simResultMap = new Map((simTrace || []).map(t => [t.nodeId, t.result as string]));

  return (
    <div className="flex flex-col h-full bg-background" data-testid="visual-editor">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card z-10 shrink-0">
        <Network className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold text-xs truncate max-w-32 text-muted-foreground">{playbook.name}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShowTriggerConfig(true)} className="h-7 gap-1 text-xs px-2" data-testid="btn-trigger-config">
            <Zap className="h-3 w-3" />Triggers
          </Button>
          <Button variant="ghost" size="sm" onClick={autoLayout} className="h-7 gap-1 text-xs px-2" data-testid="btn-auto-layout">
            <LayoutGrid className="h-3 w-3" />Layout
          </Button>
          <Button variant="ghost" size="sm" onClick={exportPb} className="h-7 gap-1 text-xs px-2" data-testid="btn-export">
            <Download className="h-3 w-3" />Export
          </Button>
          <Button variant="ghost" size="sm" onClick={simulate} disabled={isSimRunning} className="h-7 gap-1 text-xs px-2" data-testid="btn-simulate">
            {isSimRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
            Sim
          </Button>
          <Button size="sm" onClick={save} disabled={isSaving} className="h-7 gap-1 text-xs px-3" data-testid="btn-save-graph">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Node palette */}
        <div className="w-44 border-r border-border bg-card/60 flex flex-col gap-1 p-3 shrink-0 overflow-y-auto" data-testid="node-palette">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Node Palette</p>
          <p className="text-[10px] text-muted-foreground mb-2 leading-tight">Drag onto canvas or click to add at center</p>
          {PALETTE_NODES.map(p => (
            <div
              key={p.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/playbook-node-type", p.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex items-center gap-2 h-9 w-full px-2 rounded-md border border-border bg-background hover:bg-accent cursor-grab active:cursor-grabbing transition-colors select-none"
              onClick={() => addNode(p.type)}
              data-testid={`palette-${p.type}`}
            >
              <span style={{ color: p.color }} className="text-base leading-none shrink-0">{p.icon}</span>
              <span className="text-xs font-medium">{NODE_META[p.type]?.label || p.type}</span>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Help</p>
            <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
              <p>• Drag nodes from palette above</p>
              <p>• Click port circles to connect</p>
              <p>• Drag background to pan</p>
              <p>• Scroll to zoom</p>
              <p>• Delete key removes selection</p>
            </div>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex flex-col flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-3 mt-2 w-fit shrink-0">
              <TabsTrigger value="canvas" className="gap-1.5 text-xs" data-testid="tab-canvas">
                <Network className="h-3.5 w-3.5" />Canvas
              </TabsTrigger>
              <TabsTrigger value="simulation" className="gap-1.5 text-xs" data-testid="tab-simulation">
                <FlaskConical className="h-3.5 w-3.5" />Simulation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="canvas" className="flex-1 min-h-0 m-0 relative">
              <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] dark:bg-[radial-gradient(#374151_1px,transparent_1px)]">
                <svg
                  ref={svgRef}
                  className="w-full h-full select-none"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseDown={handleSvgMouseDown}
                  onWheel={handleWheel}
                  onDragOver={handleCanvasDragOver}
                  onDrop={handleCanvasDrop}
                  style={{ cursor: isPanning ? "grabbing" : connecting ? "crosshair" : "default" }}
                  data-testid="playbook-canvas"
                >
                  <EdgeDefs />
                  {/* Background capture */}
                  <rect x={-10000} y={-10000} width={20000} height={20000} fill="transparent" data-bg="1" />
                  <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                    {edges.map(edge => (
                      <GraphEdgeEl
                        key={edge.id} edge={edge} nodes={nodes}
                        selected={selectedEdgeId === edge.id}
                        onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
                      />
                    ))}
                    {connecting && (
                      <path
                        d={cubicBezier(connecting.fromX, connecting.fromY, mousePos.x, mousePos.y)}
                        stroke="#6366f1" strokeWidth={2} fill="none" strokeDasharray="6,3" opacity={0.7}
                      />
                    )}
                    {nodes.map(node => (
                      <GraphNodeEl
                        key={node.id} node={node}
                        selected={selectedNodeId === node.id}
                        simResult={simResultMap.get(node.id)}
                        isConnecting={!!connecting}
                        onSelect={() => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                        onDragStart={(e) => startDrag(node.id, e)}
                        onPortClick={(port, e) => startConnect(node.id, port, e)}
                        onPortDrop={() => completeConnect(node.id)}
                      />
                    ))}
                  </g>
                </svg>

                {/* Zoom controls */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-1" data-testid="zoom-controls">
                  <Button variant="outline" size="icon" className="h-7 w-7 shadow-sm"
                    onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 w-12 text-xs shadow-sm px-1"
                    onClick={() => { setZoom(1); setPan({ x: 40, y: 20 }); }}>
                    {Math.round(zoom * 100)}%
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 shadow-sm"
                    onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Status bar */}
                <div className="absolute top-3 left-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-border shadow-sm">
                  <span>{nodes.length} nodes · {edges.length} edges</span>
                  {selectedEdgeId && (
                    <>
                      <span>·</span>
                      <button className="text-destructive hover:underline font-medium" onClick={() => deleteEdge()}>
                        Delete edge
                      </button>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="simulation" className="flex-1 min-h-0 m-0 overflow-y-auto">
              <div className="p-4 max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Simulation Trace</h3>
                  <Button variant="outline" size="sm" onClick={() => simulate()} disabled={isSimRunning} className="gap-1.5" data-testid="btn-re-simulate">
                    {isSimRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Re-run
                  </Button>
                </div>
                {/* Incident selector for simulation context */}
                <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Simulate Against Historical Incident (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Enter incident ID (e.g. 42)"
                      className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={simIncidentId}
                      onChange={e => setSimIncidentId(e.target.value)}
                      data-testid="input-sim-incident-id"
                    />
                    <Button size="sm" variant="secondary" onClick={() => simulate()} disabled={isSimRunning} className="h-8" data-testid="btn-sim-run">
                      {isSimRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">When an incident ID is provided, condition nodes evaluate against that incident's actual data.</p>
                </div>
                {simTrace === null ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-25" />
                    <p className="mb-4">Run a simulation to preview the execution path</p>
                    <Button onClick={() => simulate()} disabled={isSimRunning} className="gap-2">
                      {isSimRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Start Simulation
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        { label: "Total Nodes", value: simTrace.length, color: "text-foreground" },
                        { label: "Would Execute", value: simTrace.filter(t => t.result !== "skipped").length, color: "text-green-600" },
                        { label: "Branches", value: simTrace.filter(t => t.type === "condition").length, color: "text-purple-600" },
                      ].map(({ label, value, color }) => (
                        <Card key={label} className="p-3">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className={`text-2xl font-bold ${color}`}>{value}</div>
                        </Card>
                      ))}
                    </div>
                    <SimTrace trace={simTrace} />
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Node config panel */}
        {selectedNode && (
          <div className="w-72 border-l border-border bg-card/60 shrink-0 overflow-hidden flex flex-col" data-testid="node-config-sidebar">
            <NodeConfigPanel
              node={selectedNode}
              onChange={(upd) => setNodes(prev => prev.map(n => n.id === upd.id ? upd : n))}
              onDelete={() => deleteNode()}
            />
          </div>
        )}
      </div>

      {/* Trigger config dialog */}
      <Dialog open={showTriggerConfig} onOpenChange={setShowTriggerConfig}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />Auto-Trigger Rules
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] py-2">
            <TriggerConfig value={triggerConds} onChange={setTriggerConds} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTriggerConfig(false)}>Close</Button>
            <Button onClick={() => { setShowTriggerConfig(false); save(); }}>Save Trigger Rules</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== STEP ICONS =====================
const STEP_TYPE_MAP: Record<string, { icon: any; color: string }> = {
  notify:        { icon: Mail,          color: "text-blue-500" },
  isolate_asset: { icon: ShieldBan,     color: "text-red-500" },
  block_ioc:     { icon: Ban,           color: "text-orange-500" },
  create_ticket: { icon: Ticket,        color: "text-purple-500" },
  assign_agent:  { icon: UserCheck,     color: "text-green-500" },
  run_ai_analysis:{ icon: Brain,        color: "text-indigo-500" },
  update_severity:{ icon: AlertTriangle,color: "text-yellow-500" },
  add_watchlist: { icon: Eye,           color: "text-cyan-500" },
  disable_account:{ icon: Ban,          color: "text-red-600" },
  quarantine_email:{ icon: Mail,        color: "text-orange-600" },
  custom_webhook:{ icon: Webhook,       color: "text-gray-500" },
};

function StepIcon({ type }: { type: string }) {
  const s = STEP_TYPE_MAP[type];
  if (!s) return <Zap className="h-3.5 w-3.5 text-gray-400" />;
  const Icon = s.icon;
  return <Icon className={`h-3.5 w-3.5 ${s.color}`} />;
}

function ExecBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; Icon: any }> = {
    completed: { cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", Icon: CheckCircle2 },
    failed:    { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",         Icon: XCircle },
    running:   { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",     Icon: Loader2 },
    partial:   { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", Icon: AlertTriangle },
  };
  const c = cfg[status] || cfg.running;
  return <Badge className={`text-xs px-1.5 py-0 h-4 gap-0.5 ${c.cls}`}><c.Icon className="h-2.5 w-2.5" />{status}</Badge>;
}

// ===================== EXECUTION AUDIT LOG =====================
function ExecutionAuditLog({ executions }: { executions: PlaybookExecution[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (executions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No executions yet. Run or simulate this playbook to see history.</p>
      </div>
    );
  }

  const stepStatusCls: Record<string, string> = {
    executed:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    branch_true:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    branch_false: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    failed:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    skipped:      "bg-gray-100 text-gray-500 dark:bg-gray-800",
    completed:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="overflow-auto h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Exec ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Steps</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map(ex => {
            // Normalize snake_case (DB) and camelCase (API/legacy) field access
            const startedAt: string = ex.started_at ?? ex.startedAt;
            const completedAt: string | null = ex.completed_at ?? ex.completedAt ?? null;
            const execId: string = ex.exec_id ?? ex.execId ?? "—";
            const dryRun: boolean = ex.dry_run ?? ex.dryRun ?? false;
            const start = new Date(startedAt);
            const end = completedAt ? new Date(completedAt) : null;
            const dur = end ? `${((end.getTime() - start.getTime()) / 1000).toFixed(1)}s` : "—";
            type StepResult = { id?: string; type?: string; label?: string; status?: string; result?: string; startedAt?: string; started_at?: string; completedAt?: string; completed_at?: string; durationMs?: number; duration_ms?: number; message?: string; error?: string; target?: string; action?: string; stepId?: string; nodeId?: string };
            const steps: StepResult[] = (ex.step_results ?? ex.stepResults ?? []) as StepResult[];
            const isExpanded = expandedId === ex.id;
            const stepStatusColor = (s: string) => {
              if (s === 'success' || s === 'executed' || s === 'branch_true') return 'text-green-600 dark:text-green-400';
              if (s === 'failed') return 'text-red-600 dark:text-red-400';
              if (s === 'branch_false') return 'text-orange-600 dark:text-orange-400';
              if (s === 'skipped') return 'text-gray-400';
              return 'text-blue-600 dark:text-blue-400';
            };
            return (
              <>
                <TableRow
                  key={`header-${ex.id}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                  data-testid={`execution-row-${ex.id}`}
                >
                  <TableCell className="text-center text-muted-foreground">
                    {steps.length > 0 ? (isExpanded ? "▾" : "▸") : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{execId.slice(0, 14)}</TableCell>
                  <TableCell><ExecBadge status={ex.status} /></TableCell>
                  <TableCell className="text-xs">
                    {dryRun ? (
                      <Badge variant="outline" className="text-xs gap-1"><FlaskConical className="h-2.5 w-2.5" />Simulation</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1"><Play className="h-2.5 w-2.5" />Live</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{start.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{dur}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{steps.length} steps</TableCell>
                </TableRow>
                {isExpanded && steps.length > 0 && steps.map((step, si) => {
                  const stepStatus: string = step.status ?? step.result ?? 'unknown';
                  const stepStartedAt: string | undefined = step.startedAt ?? step.started_at;
                  const stepCompletedAt: string | undefined = step.completedAt ?? step.completed_at;
                  const stepDurMs: number | undefined = step.durationMs ?? step.duration_ms;
                  const stepDur = stepDurMs !== undefined ? `${stepDurMs}ms` : stepCompletedAt && stepStartedAt ? `${(new Date(stepCompletedAt).getTime() - new Date(stepStartedAt).getTime())}ms` : '—';
                  return (
                    <TableRow key={`step-${ex.id}-${si}`} className="bg-muted/20" data-testid={`execution-step-${ex.id}-${si}`}>
                      <TableCell className="pl-6 text-muted-foreground text-xs">#{si + 1}</TableCell>
                      <TableCell colSpan={2} className="text-xs">
                        <span className="font-medium">{step.label ?? step.target ?? step.action ?? step.stepId ?? step.nodeId ?? `Step ${si + 1}`}</span>
                        <span className="text-muted-foreground ml-2 text-[10px]">{step.action ?? step.type ?? ''}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={`font-medium ${stepStatusColor(stepStatus)}`}>{stepStatus}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" colSpan={2}>
                        {stepStartedAt ? new Date(stepStartedAt).toLocaleTimeString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="text-muted-foreground">{stepDur}</div>
                        {step.message && <div className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={step.message}>{step.message}</div>}
                        {step.error && <div className="text-[10px] text-red-500 truncate max-w-[140px]" title={step.error}>{step.error}</div>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ===================== PLAYBOOK LIBRARY =====================
interface PlaybookLibraryProps {
  onOpenEditor: (pb: Playbook) => void;
  editorPlaybook?: Playbook | null;
  onCloseEditor?: () => void;
  tenantId?: number;
  tenantObj?: any;
}

function PlaybookLibrary({ onOpenEditor, editorPlaybook, onCloseEditor, tenantId: tenantIdProp, tenantObj }: PlaybookLibraryProps) {
  const { currentTenant, isPlatformAdmin } = useTenant();
  const { toast } = useToast();
  const tenantId = tenantIdProp ?? currentTenant?.id;

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [form, setForm] = useState({ name: "", description: "", isActive: true });
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);
  const [detailTab, setDetailTab] = useState("steps");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: playbooks = [], isLoading } = useQuery<Playbook[]>({
    queryKey: [`/api/playbooks/${tenantId}`],
    enabled: !!tenantId,
  });

  const { data: executions = [] } = useQuery<PlaybookExecution[]>({
    queryKey: [`/api/playbook-executions/${tenantId}`],
    enabled: !!tenantId,
    refetchInterval: 8000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}`, data);
      return res.json();
    },
    onSuccess: (pb) => {
      queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] });
      setShowCreate(false);
      setForm({ name: "", description: "", isActive: true });
      onOpenEditor(pb);
    },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/playbooks/${tenantId}/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] }); setActivePlaybook(null); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/playbooks/${tenantId}/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] }),
  });

  const executeMutation = useMutation({
    mutationFn: async ({ id, dryRun }: { id: number; dryRun: boolean }) => {
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}/${id}/execute`, { dryRun });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.dryRun ? "Dry run started" : "Execution started", description: `Exec ID: ${data.execId}` });
      queryClient.invalidateQueries({ queryKey: [`/api/playbook-executions/${tenantId}`] });
    },
    onError: () => toast({ title: "Execution failed", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}/seed-templates`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] });
      toast({ title: `${data.seeded} templates seeded` });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}/migrate-to-graph`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] });
      toast({ title: `Graph migration complete`, description: `${data.migrated} of ${data.total} playbooks migrated to visual graph format` });
    },
    onError: () => toast({ title: "Migration failed", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/playbooks/${tenantId}/import`, { playbook: data });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/playbooks/${tenantId}`] });
      setShowImport(false);
      setImportJson("");
      toast({ title: "Imported successfully" });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(ev.target?.result as string || "");
    reader.readAsText(file);
  };

  const filtered = playbooks.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // Backend returns snake_case; normalize to support both snake_case and camelCase
  const pbExecutions = executions.filter(e =>
    (e.playbook_id ?? e.playbookId) === activePlaybook?.id
  );

  return (
    <div className="flex flex-col h-full">
      <PageHero
        title="SOAR Playbook Studio"
        description="Design, automate, and orchestrate security response workflows with the visual canvas editor"
        icon={Workflow}
      />
      <div className="flex flex-1 min-h-0">
        {/* Library panel */}
        <div className="w-80 border-r border-border flex flex-col bg-card/30 shrink-0">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex gap-2">
              <Input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search playbooks…" className="h-8 text-sm"
                data-testid="input-search-playbooks"
              />
              <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 w-8 p-0 shrink-0" data-testid="btn-create-playbook">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 flex-1" onClick={() => setShowImport(true)} data-testid="btn-import-playbook">
                <Upload className="h-3 w-3" />Import
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 flex-1"
                onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
                data-testid="btn-seed-templates">
                {seedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookTemplate className="h-3 w-3" />}
                Seed
              </Button>
            </div>
            {isPlatformAdmin && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full"
                onClick={() => migrateMutation.mutate()} disabled={migrateMutation.isPending}
                data-testid="btn-migrate-graph">
                {migrateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Network className="h-3 w-3" />}
                Migrate to Graph Format
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 m-2 rounded" />) :
              filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Workflow className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No playbooks</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => seedMutation.mutate()}>
                    <BookTemplate className="h-3.5 w-3.5" />Seed templates
                  </Button>
                </div>
              ) : filtered.map(pb => (
                <div
                  key={pb.id}
                  className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${activePlaybook?.id === pb.id ? "bg-accent" : ""}`}
                  onClick={() => setActivePlaybook(pb)}
                  data-testid={`playbook-item-${pb.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{pb.name}</span>
                        {!pbIsActive(pb) && (
                          <Badge variant="outline" className="text-xs px-1 py-0 h-3.5 shrink-0">Off</Badge>
                        )}
                        {pbIsTemplate(pb) && (
                          <Badge className="text-xs px-1.5 py-0 h-3.5 shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <BookTemplate className="h-2.5 w-2.5 mr-0.5" />Official Template
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pb.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                      {(pb.steps || []).length} steps
                    </Badge>
                    {pbGraphNodes(pb).length > 0 && (
                      <Badge className="text-xs px-1.5 py-0 h-4 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                        <Network className="h-2.5 w-2.5 mr-0.5" />Visual
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{pb.executionCount ?? 0} runs</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Detail area — shows VisualEditor inline when a playbook is in editor mode */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {editorPlaybook && tenantId ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2" onClick={onCloseEditor} data-testid="btn-back-to-library">
                  <ArrowLeft className="h-3.5 w-3.5" />Back to Details
                </Button>
                <Badge variant="outline" className="text-xs font-mono h-5 px-1.5">
                  <Network className="h-3 w-3 mr-1" />Canvas Editor
                </Badge>
                <span className="text-xs text-muted-foreground truncate">{editorPlaybook.name}</span>
              </div>
              <div className="flex-1 min-h-0">
                <VisualEditor playbook={editorPlaybook} tenantId={tenantId} onClose={onCloseEditor} />
              </div>
            </div>
          ) : !activePlaybook ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <Network className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="font-semibold text-lg mb-2">SOAR Visual Playbook Studio</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Select a playbook to view details and open the visual canvas editor for drag-and-drop workflow design with conditional branching.
                </p>
                <div className="flex gap-3 justify-center mt-6">
                  <Button className="gap-2" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4" />New Playbook
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    <BookTemplate className="h-4 w-4" />Seed Templates
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-border bg-card/40 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-lg leading-tight">{activePlaybook.name}</h2>
                      {pbIsTemplate(activePlaybook) && (
                        <Badge className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
                          <BookTemplate className="h-3 w-3" />Official Template
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{activePlaybook.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <Switch
                      checked={pbIsActive(activePlaybook)}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: activePlaybook.id, isActive: v })}
                      data-testid="switch-playbook-active"
                    />
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenEditor(activePlaybook)} data-testid="btn-open-editor">
                      <Network className="h-3.5 w-3.5" />Visual Editor
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5"
                      onClick={() => executeMutation.mutate({ id: activePlaybook.id, dryRun: true })}
                      disabled={executeMutation.isPending} data-testid="btn-dry-run">
                      <Eye className="h-3.5 w-3.5" />Dry Run
                    </Button>
                    <Button size="sm" className="gap-1.5"
                      onClick={() => executeMutation.mutate({ id: activePlaybook.id, dryRun: false })}
                      disabled={executeMutation.isPending} data-testid="btn-execute">
                      {executeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Execute
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => deleteMutation.mutate(activePlaybook.id)} data-testid="btn-delete-playbook">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab} className="flex flex-col flex-1 min-h-0">
                <TabsList className="mx-4 mt-3 w-fit shrink-0">
                  <TabsTrigger value="steps" className="text-xs gap-1"><List className="h-3.5 w-3.5" />Steps</TabsTrigger>
                  <TabsTrigger value="triggers" className="text-xs gap-1"><Zap className="h-3.5 w-3.5" />Triggers</TabsTrigger>
                  <TabsTrigger value="executions" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" />Executions</TabsTrigger>
                </TabsList>

                <TabsContent value="steps" className="flex-1 overflow-y-auto m-0 p-4">
                  {(activePlaybook.steps || []).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p className="text-sm mb-4">No steps defined. Open the Visual Editor to design the workflow.</p>
                      <Button variant="outline" className="gap-2" onClick={() => onOpenEditor(activePlaybook)}>
                        <Network className="h-4 w-4" />Open Visual Editor
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(activePlaybook.steps as { id: string; type: string; label: string; config: Record<string, unknown>; order: number }[] || []).map((step, i) => (
                        <div key={step.id || i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
                          data-testid={`step-row-${step.id}`}>
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <StepIcon type={step.type} />
                            <span className="font-medium text-sm truncate">{step.label}</span>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">{step.type}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="triggers" className="flex-1 overflow-y-auto m-0 p-4">
                  {(() => {
                    const tc: PlaybookTriggerConditions = pbTriggerConds(activePlaybook);
                    const hasAny = Object.values(tc).some((v) => Array.isArray(v) && v.length > 0);
                    return !hasAny ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="text-sm mb-4">No trigger rules configured</p>
                        <Button variant="outline" className="gap-2" onClick={() => onOpenEditor(activePlaybook)}>
                          <Network className="h-4 w-4" />Configure in Editor
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {tc.severity?.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Severity</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {tc.severity.map((s: string) => <Badge key={s} variant="outline" className="capitalize">{s}</Badge>)}
                            </div>
                          </div>
                        )}
                        {tc.mitreTactics?.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">MITRE Tactics</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {tc.mitreTactics.map((t: string) => (
                                <Badge key={t} className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {tc.mitreTechniqueIds?.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">MITRE Technique IDs</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {tc.mitreTechniqueIds.map((t: string) => (
                                <Badge key={t} variant="outline" className="font-mono text-xs">{t}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {tc.iocTypes?.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">IOC Types</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {tc.iocTypes.map((i: string) => <Badge key={i} variant="outline" className="uppercase">{i}</Badge>)}
                            </div>
                          </div>
                        )}
                        {tc.assetCriticality?.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Asset Criticality</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {tc.assetCriticality.map((c: string) => <Badge key={c} variant="outline" className="capitalize">{c}</Badge>)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="executions" className="flex-1 overflow-hidden m-0">
                  <ExecutionAuditLog executions={pbExecutions} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Playbook</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Playbook name…" data-testid="input-playbook-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3} placeholder="Describe what this playbook does…" data-testid="input-playbook-description" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} id="create-active" />
              <Label htmlFor="create-active" className="text-sm">Active immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}
              data-testid="btn-submit-create">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-1" />}
              Create & Open Editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Import Playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileImport} data-testid="input-import-file" />
            <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />Choose JSON file
            </Button>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Or paste JSON</Label>
              <Textarea value={importJson} onChange={e => setImportJson(e.target.value)}
                rows={6} placeholder='{"exportVersion":"1.0","playbook":{…}}'
                className="font-mono text-xs" data-testid="textarea-import-json" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button
              onClick={() => {
                try {
                  const parsed = JSON.parse(importJson);
                  importMutation.mutate(parsed.playbook || parsed);
                } catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
              }}
              disabled={!importJson || importMutation.isPending}
              data-testid="btn-submit-import"
            >
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== MAIN PAGE =====================
export default function PlaybooksPage() {
  const { currentTenant } = useTenant();
  const [editorPlaybook, setEditorPlaybook] = useState<Playbook | null>(null);

  return (
    <PlaybookLibrary
      onOpenEditor={setEditorPlaybook}
      editorPlaybook={editorPlaybook}
      onCloseEditor={() => setEditorPlaybook(null)}
      tenantId={currentTenant?.id}
      tenantObj={currentTenant}
    />
  );
}
