import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, FolderPlus, Trash2, Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "enum" | "number" | "date" | "ip";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  enumValues?: string[];
}

export type TextOperator = "contains" | "starts_with" | "ends_with" | "equals" | "not_equals" | "is_empty" | "is_not_empty";
export type EnumOperator = "equals" | "not_equals" | "in";
export type NumberOperator = "equals" | "gt" | "lt" | "between";
export type DateOperator = "after" | "before" | "between" | "last_n_days";
export type IpOperator = "equals" | "starts_with" | "in_subnet";
export type Operator = TextOperator | EnumOperator | NumberOperator | DateOperator | IpOperator;

export type BooleanOperator = "AND" | "OR" | "NOT" | "NOR";

export interface SearchRule {
  id: string;
  field: string;
  op: Operator;
  value: string;
  value2?: string;
}

export interface SearchGroup {
  id: string;
  operator: BooleanOperator;
  rules: (SearchRule | SearchGroup)[];
}

export type SearchQuery = SearchGroup;

function isGroup(item: SearchRule | SearchGroup): item is SearchGroup {
  return "operator" in item && "rules" in item;
}

const OPERATORS_BY_TYPE: Record<FieldType, { value: Operator; label: string }[]> = {
  text: [
    { value: "contains", label: "Contains" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  enum: [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not equals" },
    { value: "in", label: "In" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "between", label: "Between" },
  ],
  date: [
    { value: "after", label: "After" },
    { value: "before", label: "Before" },
    { value: "between", label: "Between" },
    { value: "last_n_days", label: "Last N days" },
  ],
  ip: [
    { value: "equals", label: "Equals" },
    { value: "starts_with", label: "Starts with" },
    { value: "in_subnet", label: "In subnet" },
  ],
};

const NO_VALUE_OPERATORS: Operator[] = ["is_empty", "is_not_empty"];
const DUAL_VALUE_OPERATORS: Operator[] = ["between"];

let idCounter = 0;
function genId(): string {
  return `rule_${++idCounter}_${Date.now()}`;
}

function createRule(): SearchRule {
  return { id: genId(), field: "", op: "contains", value: "" };
}

function createGroup(): SearchGroup {
  return { id: genId(), operator: "AND", rules: [createRule()] };
}

export const MODULE_FIELDS: Record<string, FieldDefinition[]> = {
  assets: [
    { name: "hostname", label: "Hostname", type: "text" },
    { name: "system_type", label: "System Type", type: "text" },
    { name: "operating_system", label: "Operating System", type: "text" },
    { name: "ip_address", label: "IP Address", type: "ip" },
    { name: "user_name", label: "User Name", type: "text" },
    { name: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "decommissioned"] },
    { name: "risk_level", label: "Risk Level", type: "enum", enumValues: ["critical", "high", "medium", "low", "info"] },
    { name: "risk_score", label: "Risk Score", type: "number" },
    { name: "endpoint_group", label: "Endpoint Group", type: "text" },
    { name: "cloud_provider", label: "Cloud Provider", type: "enum", enumValues: ["AWS", "Azure", "GCP", "On-Premise", "Other"] },
    { name: "cloud_region", label: "Cloud Region", type: "text" },
    { name: "tags", label: "Tags", type: "text" },
    { name: "last_seen", label: "Last Seen", type: "date" },
  ],
  users: [
    { name: "user_name", label: "User Name", type: "text" },
    { name: "account_type", label: "Account Type", type: "enum", enumValues: ["Domain", "Local Admin", "Local User", "Service", "Guest", "System Built-in"] },
    { name: "email", label: "Email", type: "text" },
    { name: "department", label: "Department", type: "text" },
    { name: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "disabled"] },
    { name: "risk_level", label: "Risk Level", type: "enum", enumValues: ["critical", "high", "medium", "low", "info"] },
    { name: "risk_score", label: "Risk Score", type: "number" },
    { name: "last_activity", label: "Last Activity", type: "date" },
  ],
  incidents: [
    { name: "title", label: "Title", type: "text" },
    { name: "severity", label: "Severity", type: "enum", enumValues: ["critical", "high", "medium", "low", "info"] },
    { name: "status", label: "Status", type: "enum", enumValues: ["open", "investigating", "contained", "resolved", "closed"] },
    { name: "source", label: "Source", type: "text" },
    { name: "category", label: "Category", type: "text" },
    { name: "incident_type", label: "Incident Type", type: "text" },
    { name: "source_ip", label: "Source IP", type: "ip" },
    { name: "destination_ip", label: "Destination IP", type: "ip" },
    { name: "mitre_tactic", label: "MITRE Tactic", type: "text" },
    { name: "mitre_technique", label: "MITRE Technique", type: "text" },
    { name: "kill_chain_phase", label: "Kill Chain Phase", type: "text" },
    { name: "classification", label: "Classification", type: "text" },
    { name: "confidence_score", label: "Confidence Score", type: "number" },
    { name: "assigned_to", label: "Assigned To", type: "text" },
    { name: "created_at", label: "Created At", type: "date" },
  ],
  events: [
    { name: "event_type", label: "Event Type", type: "enum", enumValues: ["email", "endpoint", "vulnerability", "casb", "waf", "dlp", "sse", "network", "identity", "cloud"] },
    { name: "severity", label: "Severity", type: "enum", enumValues: ["critical", "high", "medium", "low", "info"] },
    { name: "threat", label: "Threat", type: "text" },
    { name: "target", label: "Target", type: "text" },
    { name: "attacker", label: "Attacker", type: "text" },
    { name: "asset", label: "Asset", type: "text" },
    { name: "app", label: "Application", type: "text" },
    { name: "mitre_tactic", label: "MITRE Tactic", type: "text" },
    { name: "action", label: "Action", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "log_source", label: "Log Source", type: "text" },
    { name: "created_at", label: "Created At", type: "date" },
  ],
  tickets: [
    { name: "title", label: "Title", type: "text" },
    { name: "priority", label: "Priority", type: "enum", enumValues: ["urgent", "high", "medium", "low"] },
    { name: "status", label: "Status", type: "enum", enumValues: ["open", "in_progress", "waiting", "resolved", "closed"] },
    { name: "category", label: "Category", type: "text" },
    { name: "assigned_to", label: "Assigned To", type: "text" },
    { name: "created_by", label: "Created By", type: "text" },
    { name: "sla_breached", label: "SLA Breached", type: "enum", enumValues: ["true", "false"] },
    { name: "created_at", label: "Created At", type: "date" },
  ],
};

export function buildSearchQuery(group: SearchGroup): SearchQuery {
  return {
    id: group.id,
    operator: group.operator,
    rules: group.rules
      .filter((item) => {
        if (isGroup(item)) return item.rules.length > 0;
        return item.field !== "";
      })
      .map((item) => {
        if (isGroup(item)) return buildSearchQuery(item);
        return { id: item.id, field: item.field, op: item.op, value: item.value, ...(item.value2 ? { value2: item.value2 } : {}) };
      }),
  };
}

function countActiveRules(group: SearchGroup): number {
  let count = 0;
  for (const item of group.rules) {
    if (isGroup(item)) {
      count += countActiveRules(item);
    } else if (item.field) {
      count++;
    }
  }
  return count;
}

interface RuleRowProps {
  rule: SearchRule;
  fields: FieldDefinition[];
  onUpdate: (id: string, updates: Partial<SearchRule>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function RuleRow({ rule, fields, onUpdate, onRemove, canRemove }: RuleRowProps) {
  const selectedField = fields.find((f) => f.name === rule.field);
  const fieldType = selectedField?.type || "text";
  const operators = OPERATORS_BY_TYPE[fieldType];
  const needsValue = !NO_VALUE_OPERATORS.includes(rule.op);
  const needsDualValue = DUAL_VALUE_OPERATORS.includes(rule.op);
  const isEnumField = fieldType === "enum" && selectedField?.enumValues;

  const handleFieldChange = useCallback(
    (val: string) => {
      const newField = fields.find((f) => f.name === val);
      const newType = newField?.type || "text";
      const newOps = OPERATORS_BY_TYPE[newType];
      onUpdate(rule.id, { field: val, op: newOps[0].value, value: "", value2: undefined });
    },
    [fields, onUpdate, rule.id]
  );

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={`rule-row-${rule.id}`}>
      <Select value={rule.field || undefined} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[160px]" data-testid={`select-field-${rule.id}`}>
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={rule.op} onValueChange={(val) => onUpdate(rule.id, { op: val as Operator, value: "", value2: undefined })}>
        <SelectTrigger className="w-[140px]" data-testid={`select-operator-${rule.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && (
        <>
          {isEnumField && rule.op !== "in" ? (
            <Select value={rule.value || undefined} onValueChange={(val) => onUpdate(rule.id, { value: val })}>
              <SelectTrigger className="w-[180px]" data-testid={`select-value-${rule.id}`}>
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {selectedField.enumValues!.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="w-[180px]"
              placeholder={rule.op === "last_n_days" ? "Number of days" : needsDualValue ? "From" : "Value"}
              value={rule.value}
              onChange={(e) => onUpdate(rule.id, { value: e.target.value })}
              type={fieldType === "number" || rule.op === "last_n_days" ? "number" : fieldType === "date" ? "date" : "text"}
              data-testid={`input-value-${rule.id}`}
            />
          )}
          {needsDualValue && (
            <Input
              className="w-[180px]"
              placeholder="To"
              value={rule.value2 || ""}
              onChange={(e) => onUpdate(rule.id, { value2: e.target.value })}
              type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
              data-testid={`input-value2-${rule.id}`}
            />
          )}
        </>
      )}

      {canRemove && (
        <Button size="icon" variant="ghost" onClick={() => onRemove(rule.id)} data-testid={`button-remove-rule-${rule.id}`}>
          <X />
        </Button>
      )}
    </div>
  );
}

interface GroupEditorProps {
  group: SearchGroup;
  fields: FieldDefinition[];
  onUpdate: (updatedGroup: SearchGroup) => void;
  onRemove?: () => void;
  depth: number;
}

function GroupEditor({ group, fields, onUpdate, onRemove, depth }: GroupEditorProps) {
  const updateRule = useCallback(
    (id: string, updates: Partial<SearchRule>) => {
      const newRules = group.rules.map((item) => {
        if (!isGroup(item) && item.id === id) return { ...item, ...updates };
        return item;
      });
      onUpdate({ ...group, rules: newRules });
    },
    [group, onUpdate]
  );

  const removeRule = useCallback(
    (id: string) => {
      const newRules = group.rules.filter((item) => {
        if (isGroup(item)) return item.id !== id;
        return item.id !== id;
      });
      onUpdate({ ...group, rules: newRules.length > 0 ? newRules : [createRule()] });
    },
    [group, onUpdate]
  );

  const addRule = useCallback(() => {
    onUpdate({ ...group, rules: [...group.rules, createRule()] });
  }, [group, onUpdate]);

  const addGroup = useCallback(() => {
    onUpdate({ ...group, rules: [...group.rules, createGroup()] });
  }, [group, onUpdate]);

  const updateNestedGroup = useCallback(
    (id: string, updatedChild: SearchGroup) => {
      const newRules = group.rules.map((item) => {
        if (isGroup(item) && item.id === id) return updatedChild;
        return item;
      });
      onUpdate({ ...group, rules: newRules });
    },
    [group, onUpdate]
  );

  const booleanOps: BooleanOperator[] = ["AND", "OR", "NOT", "NOR"];

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2",
        depth > 0 ? "bg-muted/30 ml-4" : ""
      )}
      data-testid={`search-group-${group.id}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground mr-1">Match</span>
        {booleanOps.map((op) => (
          <Button
            key={op}
            size="sm"
            variant={group.operator === op ? "default" : "outline"}
            className="toggle-elevate"
            onClick={() => onUpdate({ ...group, operator: op })}
            data-testid={`button-operator-${op}-${group.id}`}
          >
            {op}
          </Button>
        ))}
        {onRemove && (
          <Button size="icon" variant="ghost" onClick={onRemove} className="ml-auto" data-testid={`button-remove-group-${group.id}`}>
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {group.rules.map((item, index) => (
          <div key={isGroup(item) ? item.id : item.id}>
            {index > 0 && (
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <Badge variant="secondary" className="no-default-hover-elevate text-xs">
                  {group.operator}
                </Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            {isGroup(item) ? (
              <GroupEditor
                group={item}
                fields={fields}
                onUpdate={(updated) => updateNestedGroup(item.id, updated)}
                onRemove={() => removeRule(item.id)}
                depth={depth + 1}
              />
            ) : (
              <RuleRow
                rule={item}
                fields={fields}
                onUpdate={updateRule}
                onRemove={removeRule}
                canRemove={group.rules.length > 1}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <Button size="sm" variant="outline" onClick={addRule} data-testid={`button-add-rule-${group.id}`}>
          <Plus className="mr-1" />
          Add Rule
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup} data-testid={`button-add-group-${group.id}`}>
          <FolderPlus className="mr-1" />
          Add Group
        </Button>
      </div>
    </div>
  );
}

interface AdvancedSearchProps {
  module: string;
  fields?: FieldDefinition[];
  onApply: (query: SearchQuery) => void;
  onClear?: () => void;
  className?: string;
}

export function AdvancedSearch({ module, fields: fieldsProp, onApply, onClear, className }: AdvancedSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rootGroup, setRootGroup] = useState<SearchGroup>(createGroup());

  const fields = useMemo(() => fieldsProp || MODULE_FIELDS[module] || [], [fieldsProp, module]);

  const activeCount = useMemo(() => countActiveRules(rootGroup), [rootGroup]);

  const handleApply = useCallback(() => {
    const query = buildSearchQuery(rootGroup);
    onApply(query);
  }, [rootGroup, onApply]);

  const handleClear = useCallback(() => {
    setRootGroup(createGroup());
    onClear?.();
  }, [onClear]);

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen((p) => !p)}
        data-testid="button-advanced-search-toggle"
      >
        <Search className="mr-1" />
        Advanced Search
        {activeCount > 0 && (
          <Badge variant="default" className="ml-1 no-default-hover-elevate">
            {activeCount}
          </Badge>
        )}
        {isOpen ? <ChevronUp className="ml-1" /> : <ChevronDown className="ml-1" />}
      </Button>

      {isOpen && (
        <div className="mt-2 rounded-md border bg-card shadow-md" data-testid="panel-advanced-search">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2 rounded-t-md flex-wrap">
            <span className="text-sm font-semibold">Advanced Search</span>
            <span className="text-xs text-muted-foreground">
              {module.charAt(0).toUpperCase() + module.slice(1)} module
            </span>
          </div>
          <div className="p-4">
            <GroupEditor group={rootGroup} fields={fields} onUpdate={setRootGroup} depth={0} />
            <div className="flex items-center gap-2 pt-4 justify-end flex-wrap">
              <Button size="sm" variant="ghost" onClick={handleClear} data-testid="button-clear-search">
                Clear All
              </Button>
              <Button size="sm" onClick={handleApply} data-testid="button-apply-search">
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
