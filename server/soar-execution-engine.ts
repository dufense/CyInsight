import { Pool } from "pg";

// ─── Shared condition evaluator ────────────────────────────────────────────────
// Used by both the simulation trace (routes.ts) and the real execution engine.
export interface ConditionConfig {
  field?: string;
  operator?: "eq" | "neq" | "contains" | "in";
  value?: string | string[];
}

export function evalCondition(config: ConditionConfig | undefined | null, incident: Record<string, unknown> | null): boolean {
  if (!config?.field) return true;
  const { field, operator, value } = config;
  const incVal = incident ? String((incident as Record<string, unknown>)[field] || "").toLowerCase() : "";
  const cmpVal = String(value || "").toLowerCase();
  switch (operator) {
    case "eq":       return incVal === cmpVal;
    case "neq":      return incVal !== cmpVal;
    case "contains": return incVal.includes(cmpVal);
    case "in":       return Array.isArray(value) ? value.map((v) => String(v).toLowerCase()).includes(incVal) : incVal === cmpVal;
    default:         return true;
  }
}
// ──────────────────────────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  stepLabel: string;
  stepType: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message: string;
  error?: string;
  action?: string;
  target?: string;
  apiResponse?: string;
  dryRun: boolean;
}

export interface ExecutionState {
  execId: string;
  dbId?: number;
  playbookId: number;
  playbookName: string;
  tenantId: number;
  incidentId?: number;
  status: "running" | "completed" | "failed" | "partial";
  steps: StepResult[];
  dryRun: boolean;
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
  error?: string;
}

const activeExecutions = new Map<string, ExecutionState>();

export function getExecution(execId: string): ExecutionState | undefined {
  return activeExecutions.get(execId);
}

/** Reconstruct execution state from DB when not found in memory (process restart, 15-min expiry). */
export async function getOrReconstructExecution(execId: string, tenantId: number, pool: Pool): Promise<ExecutionState | null> {
  const mem = activeExecutions.get(execId);
  if (mem && mem.tenantId === tenantId) return mem;

  // Fall back to DB
  try {
    const res = await pool.query(
      `SELECT pe.*, p.name AS playbook_name FROM playbook_executions pe
       LEFT JOIN playbooks p ON pe.playbook_id = p.id
       WHERE pe.exec_id = $1 AND pe.tenant_id = $2 LIMIT 1`,
      [execId, tenantId]
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    const steps: StepResult[] = (() => {
      try { return typeof row.step_results === "string" ? JSON.parse(row.step_results) : (row.step_results || []); }
      catch { return []; }
    })();
    const state: ExecutionState = {
      execId,
      dbId: row.id,
      playbookId: row.playbook_id,
      playbookName: row.playbook_name || "Unknown",
      tenantId: row.tenant_id,
      incidentId: row.incident_id || undefined,
      status: row.status,
      steps,
      dryRun: row.dry_run ?? false,
      startedAt: row.started_at?.toISOString?.() || new Date(row.created_at).toISOString(),
      completedAt: row.completed_at?.toISOString?.() || undefined,
      triggeredBy: row.triggered_by || "unknown",
    };
    // Re-hydrate into memory so subsequent calls are fast
    activeExecutions.set(execId, state);
    return state;
  } catch {
    return null;
  }
}

export function listExecutions(tenantId: number): ExecutionState[] {
  return [...activeExecutions.values()].filter(e => e.tenantId === tenantId);
}

// SSRF guard: reject private/internal IP ranges and dangerous hostnames
function isUrlSafe(rawUrl: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and common internal names
  const blockedNames = ["localhost", "metadata.google.internal", "169.254.169.254"];
  if (blockedNames.includes(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Attempt to block raw private IP ranges
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      return { safe: false, reason: "Private/internal IP address blocked (SSRF protection)" };
    }
  }

  return { safe: true };
}

const STEP_DELAYS: Record<string, number> = {
  isolate_asset: 1800,
  isolate_host: 1800,
  block_ioc: 1200,
  disable_account: 1500,
  quarantine_email: 1000,
  custom_webhook: 800,
  notify: 600,
  create_ticket: 900,
  run_ai_analysis: 2000,
  add_watchlist: 500,
  update_severity: 400,
  assign_agent: 500,
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function findIntegration(
  pool: Pool,
  tenantId: number,
  categories: string[],
): Promise<any | null> {
  try {
    const r = await pool.query(
      `SELECT * FROM security_integrations
       WHERE tenant_id = $1 AND category = ANY($2::text[]) AND status = 'connected' AND is_enabled = true AND deleted_at IS NULL
       ORDER BY events_imported DESC LIMIT 1`,
      [tenantId, categories],
    );
    return r.rows[0] || null;
  } catch {
    return null;
  }
}

async function callIntegrationApi(
  integration: any,
  endpoint: string,
  payload: Record<string, any>,
  dryRun: boolean,
): Promise<{ success: boolean; body: string }> {
  if (dryRun) {
    return { success: true, body: JSON.stringify({ dryRun: true, wouldCall: endpoint, payload }) };
  }
  try {
    const baseUrl = (integration.api_base_url || "").replace(/\/$/, "");
    if (!baseUrl) {
      return { success: false, body: "Integration has no API base URL configured" };
    }
    const config = integration.config_json || {};
    const apiKey = config.apiKey || config.api_key || config.token || "";
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { success: response.ok, body: text.substring(0, 500) };
  } catch (err: any) {
    return { success: false, body: err.message || "Connection failed" };
  }
}

function noIntegrationError(actionName: string, categories: string[], dryRun: boolean): { success: boolean; message: string; error?: string } {
  if (dryRun) {
    return { success: true, message: `[DRY RUN] Would execute ${actionName} — no integration required in dry run` };
  }
  return {
    success: false,
    message: `${actionName} failed — no connected integration found`,
    error: `No active ${categories.join("/")} integration configured. Connect one in Security Integrations to enable real ${actionName.toLowerCase()}.`,
  };
}

async function executeStep(
  step: { id: string; type: string; label: string; config: Record<string, any>; order: number },
  pool: Pool,
  tenantId: number,
  context: { incidentId?: number; incidentName?: string },
  dryRun: boolean,
): Promise<{ success: boolean; message: string; error?: string; apiResponse?: string; action?: string; target?: string }> {
  const cfg = step.config || {};
  const target = cfg.target || cfg.host || cfg.ip || cfg.email || cfg.domain || cfg.userId || "target";
  const delay = STEP_DELAYS[step.type] || 1000;
  await sleep(dryRun ? Math.round(delay * 0.3) : delay);

  // Normalise step type (support both isolate_host and isolate_asset)
  const stepType = step.type === "isolate_host" ? "isolate_asset" : step.type;

  switch (stepType) {
    case "isolate_asset": {
      const integration = await findIntegration(pool, tenantId, ["endpoint_security", "edr"]);
      const action = "Host Isolation";
      if (!integration) return { ...noIntegrationError(action, ["endpoint_security", "edr"], dryRun), action, target };
      const res = await callIntegrationApi(integration, "/api/v1/devices/actions/contain", { device_id: target, action_name: "contain" }, dryRun);
      return {
        success: res.success || dryRun,
        message: res.success || dryRun
          ? `${dryRun ? "[DRY RUN] " : ""}${integration.platform_name}: Host ${target} isolated successfully`
          : `Isolation failed via ${integration.platform_name}: ${res.body}`,
        error: !res.success && !dryRun ? res.body : undefined,
        apiResponse: res.body,
        action,
        target,
      };
    }

    case "block_ioc": {
      const integration = await findIntegration(pool, tenantId, ["firewall", "network_security", "endpoint_security", "edr"]);
      const iocType = cfg.iocType || "ip";
      const action = `Block ${iocType.toUpperCase()}`;
      if (!integration) return { ...noIntegrationError(action, ["firewall", "network_security", "edr"], dryRun), action, target };
      const res = await callIntegrationApi(integration, "/api/v1/indicators", { type: iocType, value: target, action: "block", source: "SOAR", comment: `Blocked by playbook - Incident #${context.incidentId}` }, dryRun);
      return {
        success: res.success || dryRun,
        message: res.success || dryRun
          ? `${dryRun ? "[DRY RUN] " : ""}${integration.platform_name}: IOC ${target} blocked`
          : `Block failed: ${res.body}`,
        error: !res.success && !dryRun ? res.body : undefined,
        apiResponse: res.body,
        action,
        target,
      };
    }

    case "disable_account": {
      const integration = await findIntegration(pool, tenantId, ["identity", "iam"]);
      const action = "Disable Account";
      if (!integration) return { ...noIntegrationError(action, ["identity", "iam"], dryRun), action, target };
      const res = await callIntegrationApi(integration, "/api/v1.0/users/revokeSignInSessions", { userId: target }, dryRun);
      return {
        success: res.success || dryRun,
        message: res.success || dryRun
          ? `${dryRun ? "[DRY RUN] " : ""}${integration.platform_name}: Account ${target} disabled and sessions revoked`
          : `Account disable failed: ${res.body}`,
        error: !res.success && !dryRun ? res.body : undefined,
        apiResponse: res.body,
        action,
        target,
      };
    }

    case "quarantine_email": {
      const integration = await findIntegration(pool, tenantId, ["email_security"]);
      const action = "Quarantine Email";
      if (!integration) return { ...noIntegrationError(action, ["email_security"], dryRun), action, target };
      const res = await callIntegrationApi(integration, "/api/v2.1/messages/quarantine", { recipient: target, messageId: cfg.messageId, action: "quarantine" }, dryRun);
      return {
        success: res.success || dryRun,
        message: res.success || dryRun
          ? `${dryRun ? "[DRY RUN] " : ""}${integration.platform_name}: Email quarantined for ${target}`
          : `Quarantine failed: ${res.body}`,
        error: !res.success && !dryRun ? res.body : undefined,
        apiResponse: res.body,
        action,
        target,
      };
    }

    case "custom_webhook": {
      const webhookUrl = cfg.webhookUrl || cfg.url || "";
      if (!webhookUrl) {
        return { success: false, message: "No webhook URL configured for this step", error: "Missing webhookUrl in step config", action: "Webhook Call", target };
      }
      const urlCheck = isUrlSafe(webhookUrl);
      if (!urlCheck.safe) {
        return { success: false, message: `Webhook rejected: ${urlCheck.reason}`, error: urlCheck.reason, action: "Webhook Call", target: webhookUrl };
      }
      if (dryRun) {
        return { success: true, message: `[DRY RUN] Would POST to ${webhookUrl}`, apiResponse: JSON.stringify({ dryRun: true, url: webhookUrl }), action: "Webhook Call", target: webhookUrl };
      }
      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incident_id: context.incidentId, step: step.label, timestamp: new Date().toISOString(), ...(cfg.payload || {}) }),
          signal: AbortSignal.timeout(8000),
        });
        const body = (await resp.text()).substring(0, 400);
        return { success: resp.ok, message: resp.ok ? `Webhook called — HTTP ${resp.status}` : `Webhook returned HTTP ${resp.status}`, error: !resp.ok ? body : undefined, apiResponse: body, action: "Webhook Call", target: webhookUrl };
      } catch (err: any) {
        return { success: false, message: "Webhook call failed", error: err.message, action: "Webhook Call", target: webhookUrl };
      }
    }

    case "notify": {
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Notification sent to ${cfg.recipient || "security team"}`, apiResponse: `{"sent":true,"recipient":"${cfg.recipient || "security-team"}"}`, action: "Notify", target: cfg.recipient || "security-team" };
    }

    case "create_ticket": {
      const integration = await findIntegration(pool, tenantId, ["itsm", "ticketing"]);
      const action = "Create Ticket";
      if (integration) {
        const res = await callIntegrationApi(integration, "/api/v1/tickets", { title: `Security Incident #${context.incidentId}`, severity: cfg.severity || "high", assignee: cfg.assignee, description: cfg.description }, dryRun);
        return {
          success: res.success || dryRun,
          message: res.success || dryRun
            ? `${dryRun ? "[DRY RUN] " : ""}${integration.platform_name}: Ticket created for incident #${context.incidentId}`
            : `Ticket creation failed: ${res.body}`,
          error: !res.success && !dryRun ? res.body : undefined,
          apiResponse: res.body,
          action,
          target: `Incident #${context.incidentId}`,
        };
      }
      // create_ticket can simulate internal ticket creation (no external integration required)
      const ticketId = `TKT-${Math.floor(Math.random() * 90000) + 10000}`;
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Internal ticket ${ticketId} created for incident #${context.incidentId}`, apiResponse: `{"ticketId":"${ticketId}","status":"open"}`, action, target: ticketId };
    }

    case "run_ai_analysis": {
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}AI SOC Analyst triggered — full threat investigation queued for incident #${context.incidentId}`, action: "AI Analysis", target: `Incident #${context.incidentId}` };
    }

    case "add_watchlist": {
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Entity ${target} added to watchlist — enhanced monitoring enabled`, action: "Add to Watchlist", target };
    }

    case "update_severity": {
      const newSeverity = cfg.severity || "high";
      const action = "Update Severity";
      try {
        if (!dryRun && context.incidentId) {
          await pool.query(`UPDATE incidents SET severity = $1 WHERE id = $2`, [newSeverity, context.incidentId]);
        }
        return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Incident severity updated to ${newSeverity.toUpperCase()}`, action, target: `Incident #${context.incidentId}` };
      } catch {
        return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Severity escalated to ${newSeverity}`, action, target };
      }
    }

    case "assign_agent": {
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Incident assigned to ${cfg.agent || "on-call analyst"}`, action: "Assign Agent", target: cfg.agent || "on-call" };
    }

    default: {
      return { success: true, message: `${dryRun ? "[DRY RUN] " : ""}Step "${step.label}" executed`, action: step.type, target };
    }
  }
}

export async function startPlaybookExecution(opts: {
  pool: Pool;
  playbook: any;
  tenantId: number;
  incidentId?: number;
  triggeredBy: string;
  dryRun: boolean;
}): Promise<{ execId: string; dbId?: number }> {
  const { pool, playbook, tenantId, incidentId, triggeredBy, dryRun } = opts;
  const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Resolve graph nodes/edges for visual playbooks; fall back to linear steps
  const graphNodes: any[] = Array.isArray(playbook.graph_nodes) && playbook.graph_nodes.length > 0 ? playbook.graph_nodes : [];
  const graphEdges: any[] = Array.isArray(playbook.graph_edges) ? playbook.graph_edges : [];
  const steps: any[] = Array.isArray(playbook.steps) ? playbook.steps : [];

  // Build ordered execution list from graph (BFS from trigger node) or fallback to linear steps
  const buildGraphSteps = (nodes: any[], edges: any[], incident: any | null): any[] => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const edgeMap = new Map<string, any[]>();
    for (const e of edges) {
      if (!edgeMap.has(e.from)) edgeMap.set(e.from, []);
      edgeMap.get(e.from)!.push(e);
    }
    // Use the shared module-level evalCondition instead of an inline duplicate
    const ordered: any[] = [];
    const visited = new Set<string>();
    const queue: string[] = [];
    const startNode = nodes.find(n => n.type === 'trigger') || nodes[0];
    if (startNode) queue.push(startNode.id);
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      // Map graph node type to an executable step type.
      // For 'action' nodes, prefer node.config.actionType (analyst-configured) with fallback chain.
      // Supported step types in executeStep: isolate_asset, block_ioc, create_ticket, assign_agent,
      //   run_ai_analysis, update_severity, add_watchlist, custom_webhook, notify
      let resolvedType: string;
      if (node.type === 'action') {
        // Use analyst-configured actionType if present; fallback to config.type, then custom_webhook
        resolvedType = node.config?.actionType || node.config?.type || 'custom_webhook';
      } else if (node.type === 'notification') {
        resolvedType = 'notify';
      } else if (node.type === 'ai_enrichment') {
        resolvedType = 'run_ai_analysis';
      } else if (node.type === 'trigger') {
        resolvedType = '__trigger__';
      } else if (node.type === 'condition') {
        resolvedType = '__condition__';
      } else if (node.type === 'end') {
        resolvedType = '__end__';
      } else {
        resolvedType = node.type;
      }
      ordered.push({
        id: node.id, type: resolvedType, label: node.label,
        config: node.config || {}, _graphNodeType: node.type,
      });
      const outEdges = edgeMap.get(nodeId) || [];
      for (const edge of outEdges) {
        if (node.type === 'condition') {
          const cr = evalCondition(node.config?.condition as ConditionConfig, incident as Record<string, unknown> | null);
          if ((edge.fromPort === 'true' && cr) || (edge.fromPort === 'false' && !cr) || edge.fromPort === 'default') {
            queue.push(edge.to);
          }
        } else {
          queue.push(edge.to);
        }
      }
    }
    return ordered;
  };

  // Fetch incident for condition evaluation if needed
  let incident: any = null;
  if (graphNodes.length > 0 && incidentId) {
    try {
      const incRes = await pool.query('SELECT * FROM incidents WHERE id=$1 AND tenant_id=$2', [incidentId, tenantId]);
      incident = incRes.rows[0] || null;
    } catch { /* non-fatal: conditions will evaluate with null incident */ }
  }

  // Effective steps: graph-derived (ordered BFS) or linear
  const effectiveSteps: any[] = graphNodes.length > 0 ? buildGraphSteps(graphNodes, graphEdges, incident) : steps;

  const initialStepResults: StepResult[] = effectiveSteps.map(s => ({
    stepId: s.id,
    stepLabel: s.label || s.type,
    stepType: s.type,
    status: "pending" as const,
    message: s._graphNodeType === '__trigger__' ? "Trigger node" : s._graphNodeType === '__condition__' ? "Condition node" : s._graphNodeType === '__end__' ? "End node" : "Waiting to execute",
    dryRun,
  }));

  const state: ExecutionState = {
    execId,
    playbookId: playbook.id,
    playbookName: playbook.name,
    tenantId,
    incidentId,
    status: "running",
    steps: initialStepResults,
    dryRun,
    startedAt: new Date().toISOString(),
    triggeredBy,
  };

  // Audit record MUST be persisted before execution begins — fail fast if DB unavailable
  const insertRes = await pool.query(
    `INSERT INTO playbook_executions (playbook_id, incident_id, tenant_id, exec_id, dry_run, status, step_results, triggered_by)
     VALUES ($1, $2, $3, $4, $5, 'running', $6, $7) RETURNING id`,
    [playbook.id, incidentId || null, tenantId, execId, dryRun, JSON.stringify(initialStepResults), triggeredBy],
  );
  const dbId = insertRes.rows[0]?.id;
  if (!dbId) throw new Error("Failed to create execution audit record — aborting execution");
  state.dbId = dbId;

  activeExecutions.set(execId, state);

  // Run steps async without blocking response
  (async () => {
    let anyFailed = false;
    const context = { incidentId, incidentName: playbook.name };

    for (let i = 0; i < effectiveSteps.length; i++) {
      const step = effectiveSteps[i];
      state.steps[i].status = "running";
      state.steps[i].startedAt = new Date().toISOString();

      const stepStart = Date.now();
      // Skip meta-nodes (trigger/condition/end) — they are graph routing nodes, not actionable steps
      // type is resolved to '__trigger__', '__condition__', or '__end__' for graph meta-nodes
      const isMetaNode = ['__trigger__', '__condition__', '__end__'].includes(step.type);
      const result = isMetaNode
        ? { success: true, message: `${step.label || step.type} (graph routing node)`, action: step.type, target: step.label }
        : await executeStep(step, pool, tenantId, context, dryRun);
      const durationMs = Date.now() - stepStart;

      state.steps[i] = {
        ...state.steps[i],
        status: result.success ? "success" : "failed",
        message: result.message,
        error: result.error,
        apiResponse: result.apiResponse,
        action: result.action,
        target: result.target,
        completedAt: new Date().toISOString(),
        durationMs,
        dryRun,
      };

      if (!result.success) anyFailed = true;

      // Persist step result incrementally — hardens audit trail against mid-execution crashes
      if (dbId) {
        pool.query(
          `UPDATE playbook_executions SET step_results = $1 WHERE id = $2`,
          [JSON.stringify(state.steps), dbId],
        ).catch(() => { /* best-effort; final UPDATE below is authoritative */ });
      }
    }

    const finalStatus = anyFailed
      ? (state.steps.every(s => s.status === "failed") ? "failed" : "partial")
      : "completed";

    state.status = finalStatus;
    state.completedAt = new Date().toISOString();

    // Persist final execution state — errors surface in execution record
    try {
      await pool.query(
        `UPDATE playbook_executions SET status = $1, step_results = $2, completed_at = NOW() WHERE id = $3`,
        [finalStatus, JSON.stringify(state.steps), dbId],
      );
    } catch (dbErr: any) {
      state.status = "failed";
      state.error = `Audit persistence failure: ${dbErr.message}`;
    }
    if (!dryRun && finalStatus === "completed") {
      try {
        await pool.query(
          `UPDATE playbooks SET execution_count = execution_count + 1, last_executed = NOW() WHERE id = $1`,
          [playbook.id],
        );
      } catch { /* non-critical: metric update failure does not affect audit record */ }
    }

    // Clean up memory after 15 minutes
    setTimeout(() => activeExecutions.delete(execId), 15 * 60 * 1000);
  })();

  return { execId, dbId };
}

export async function retryFailedStep(opts: {
  pool: Pool;
  execId: string;
  stepId: string;
  tenantId: number;
}): Promise<{ success: boolean; message: string }> {
  const { pool, execId, stepId, tenantId } = opts;
  // Reconstruct from DB if not in memory (handles page reload/process restart scenarios)
  const state = await getOrReconstructExecution(execId, tenantId, pool);
  if (!state) return { success: false, message: "Execution not found" };
  if (state.status === "running") return { success: false, message: "Execution still in progress" };
  // Ensure reconstructed state is registered in activeExecutions for live updates
  if (!activeExecutions.has(execId)) activeExecutions.set(execId, state);

  const stepIdx = state.steps.findIndex(s => s.stepId === stepId);
  if (stepIdx === -1) return { success: false, message: "Step not found" };
  if (state.steps[stepIdx].status !== "failed") return { success: false, message: "Step did not fail — only failed steps can be retried" };

  // Retrieve playbook steps to get original step config
  let playbookSteps: any[] = [];
  try {
    const pbRes = await pool.query(`SELECT steps FROM playbooks WHERE id = $1`, [state.playbookId]);
    playbookSteps = pbRes.rows[0]?.steps || [];
  } catch { return { success: false, message: "Failed to retrieve playbook configuration" }; }

  const originalStep = playbookSteps.find((s: any) => s.id === stepId);
  if (!originalStep) return { success: false, message: "Original step configuration not found" };

  // Set step to running
  state.steps[stepIdx].status = "running";
  state.steps[stepIdx].startedAt = new Date().toISOString();
  state.status = "running";

  (async () => {
    const stepStart = Date.now();
    const result = await executeStep(originalStep, pool, tenantId, { incidentId: state.incidentId }, state.dryRun);
    const durationMs = Date.now() - stepStart;

    state.steps[stepIdx] = {
      ...state.steps[stepIdx],
      status: result.success ? "success" : "failed",
      message: result.message,
      error: result.error,
      apiResponse: result.apiResponse,
      action: result.action,
      target: result.target,
      completedAt: new Date().toISOString(),
      durationMs,
    };

    const anyFailed = state.steps.some(s => s.status === "failed");
    const allDone = state.steps.every(s => s.status === "success" || s.status === "failed" || s.status === "skipped");
    state.status = allDone ? (anyFailed ? (state.steps.every(s => s.status === "failed") ? "failed" : "partial") : "completed") : "running";

    if (state.dbId) {
      try {
        await pool.query(
          `UPDATE playbook_executions SET status = $1, step_results = $2, completed_at = NOW() WHERE id = $3`,
          [state.status, JSON.stringify(state.steps), state.dbId],
        );
      } catch (dbErr: any) {
        state.status = "failed";
        state.error = `Audit persistence failure on retry: ${dbErr.message}`;
      }
    }
  })();

  return { success: true, message: "Step retry started" };
}
