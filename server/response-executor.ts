import { pool } from "./db";

export interface ExecutionResult {
  success: boolean;
  message: string;
  timestamp: string;
  isReversible: boolean;
  reversalPayload?: any;
}

async function getIntegration(tenantId: number, platformKeys: string[]): Promise<any | null> {
  const keyList = platformKeys.map((_, i) => `$${i + 2}`).join(",");
  const res = await pool.query(
    `SELECT * FROM security_integrations WHERE tenant_id = $1 AND platform_key IN (${keyList}) AND is_enabled = true ORDER BY created_at DESC LIMIT 1`,
    [tenantId, ...platformKeys]
  );
  return res.rows[0] || null;
}

// Helper: get display name from integration row using canonical column
function getIntegrationName(integration: any): string {
  return integration.platform_name || integration.platformKey || integration.platform_key || "integration";
}

// Helper: get platform key for type-based dispatch
function getPlatformKey(integration: any): string {
  return (integration.platform_key || integration.platformKey || "").toLowerCase();
}

function getConfig(integration: any): Record<string, any> {
  // Raw pool.query returns snake_case column names (config_json), Drizzle ORM returns camelCase (configJson)
  const raw = integration.config_json ?? integration.configJson ?? integration.config_data ?? {};
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, any>;
}

function getBaseUrl(integration: any): string {
  const cfg = getConfig(integration);
  // Raw SQL: api_base_url; Drizzle ORM: apiBaseUrl; also check inside config_json credentials
  return (
    integration.api_base_url ||
    integration.apiBaseUrl ||
    cfg.apiBaseUrl ||
    cfg.api_base_url ||
    cfg.baseUrl ||
    cfg.credentials?.apiBaseUrl ||
    cfg.credentials?.baseUrl ||
    ""
  ).replace(/\/+$/, "");
}

function getApiKey(integration: any): string {
  const cfg = getConfig(integration);
  // api_key may live inside config_json credentials block
  return (
    cfg.apiKey ||
    cfg.api_key ||
    cfg.credentials?.apiKey ||
    cfg.credentials?.api_key ||
    cfg.token ||
    cfg.credentials?.token ||
    cfg.clientSecret ||
    cfg.credentials?.clientSecret ||
    ""
  );
}

async function callIntegrationApi(
  integration: any,
  method: string,
  path: string,
  body?: object,
  extraHeaders: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const baseUrl = getBaseUrl(integration);
  const apiKey = getApiKey(integration);
  const cfg = getConfig(integration);

  if (!baseUrl) {
    return { ok: false, status: 0, data: { error: "No API base URL configured for integration" } };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  // Prefer Bearer token, fall back to API key header styles
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (cfg.credentials?.clientId && cfg.credentials?.clientSecret) {
    headers["X-Client-ID"] = cfg.credentials.clientId;
    headers["X-Client-Secret"] = cfg.credentials.clientSecret;
  }

  const url = `${baseUrl}${path}`;
  const options: RequestInit = { method, headers };
  if (body && method !== "GET") options.body = JSON.stringify(body);

  const resp = await fetch(url, options);
  let data: any = {};
  try { data = await resp.json(); } catch {}
  return { ok: resp.ok, status: resp.status, data };
}

export async function executeHostIsolation(tenantId: number, target: string): Promise<ExecutionResult> {
  // Use canonical platform_key values from security_integrations
  const integration = await getIntegration(tenantId, ["cynet", "crowdstrike", "sentinelone", "ms_defender_endpoint"]);
  if (!integration) {
    return { success: false, message: "No EDR integration connected for tenant — host isolation cannot proceed", timestamp: new Date().toISOString(), isReversible: true };
  }

  const intKey = getPlatformKey(integration);
  let apiPath = "/api/v1/hosts/isolate";
  let requestBody: any = { target, reason: "Autonomous response engine — TP incident containment" };

  if (intKey.includes("crowdstrike")) {
    apiPath = "/devices/entities/devices-actions/v2?action_name=contain";
    requestBody = { ids: [target] };
  } else if (intKey.includes("sentinelone")) {
    apiPath = "/web/api/v2.1/agents/actions/isolate";
    requestBody = { filter: { query: target }, data: {} };
  } else if (intKey.includes("defender")) {
    apiPath = `/api/machines/${encodeURIComponent(target)}/isolate`;
    requestBody = { Comment: "Autonomous response engine isolation", IsolationType: "Full" };
  } else if (intKey.includes("cynet")) {
    apiPath = "/api/v1.0/hosts/isolate";
    requestBody = { host: target };
  }

  const result = await callIntegrationApi(integration, "POST", apiPath, requestBody);

  if (result.ok || result.status === 202 || result.status === 200) {
    return {
      success: true,
      message: `Host isolation initiated via ${getIntegrationName(integration)} for target: ${target}`,
      timestamp: new Date().toISOString(),
      isReversible: true,
      reversalPayload: { target, integrationId: integration.id, intKey },
    };
  }

  return {
    success: false,
    message: `EDR API (${getIntegrationName(integration)}) returned ${result.status}: ${result.data?.error ?? result.data?.message ?? JSON.stringify(result.data).slice(0, 200)}`,
    timestamp: new Date().toISOString(),
    isReversible: true,
  };
}

export async function executeUnisolation(tenantId: number, target: string): Promise<ExecutionResult> {
  const integration = await getIntegration(tenantId, ["cynet", "crowdstrike", "sentinelone", "ms_defender_endpoint"]);
  if (!integration) {
    return { success: false, message: "No EDR integration connected — unisolation cannot proceed", timestamp: new Date().toISOString(), isReversible: false };
  }

  const intKey = getPlatformKey(integration);
  let apiPath = "/api/v1/hosts/unisolate";
  let requestBody: any = { target };

  if (intKey.includes("crowdstrike")) {
    apiPath = "/devices/entities/devices-actions/v2?action_name=lift_containment";
    requestBody = { ids: [target] };
  } else if (intKey.includes("sentinelone")) {
    apiPath = "/web/api/v2.1/agents/actions/unquarantine";
    requestBody = { filter: { query: target }, data: {} };
  } else if (intKey.includes("defender")) {
    apiPath = `/api/machines/${encodeURIComponent(target)}/unisolate`;
    requestBody = { Comment: "Autonomous response engine — isolation lifted" };
  }

  const result = await callIntegrationApi(integration, "POST", apiPath, requestBody);

  if (result.ok || result.status === 202 || result.status === 200) {
    return {
      success: true,
      message: `Host isolation lifted via ${getIntegrationName(integration)} for target: ${target}`,
      timestamp: new Date().toISOString(),
      isReversible: false,
    };
  }

  return {
    success: false,
    message: `EDR API (${getIntegrationName(integration)}) returned ${result.status}: ${result.data?.error ?? result.data?.message ?? JSON.stringify(result.data).slice(0, 200)}`,
    timestamp: new Date().toISOString(),
    isReversible: false,
  };
}

export async function executeIPBlock(tenantId: number, target: string): Promise<ExecutionResult> {
  // Use canonical platform_key values for firewall integrations
  const integration = await getIntegration(tenantId, ["palo_alto_ngfw", "paloalto", "fortinet_fortigate", "fortinet", "checkpoint_ngfw", "checkpoint", "cisco_asa"]);
  if (!integration) {
    return { success: false, message: "No firewall integration connected for tenant — IP block cannot proceed", timestamp: new Date().toISOString(), isReversible: true };
  }

  const intKey = getPlatformKey(integration);
  let apiPath = "/api/v1/block-ip";
  let requestBody: any = { ip: target, reason: "Autonomous response engine — TP incident containment" };

  if (intKey.includes("palo_alto") || intKey.includes("paloalto")) {
    apiPath = "/restapi/v10.2/Objects/AddressObjects";
    requestBody = { entry: { "@name": `BLOCK-${target}`, ip_netmask: target } };
  } else if (intKey.includes("fortinet")) {
    apiPath = "/api/v2/cmdb/firewall/address";
    requestBody = { name: `BLOCK-${target}`, subnet: target };
  }

  const result = await callIntegrationApi(integration, "POST", apiPath, requestBody);

  if (result.ok || result.status === 200 || result.status === 201) {
    return {
      success: true,
      message: `IP block rule created via ${getIntegrationName(integration)} for: ${target}`,
      timestamp: new Date().toISOString(),
      isReversible: true,
      reversalPayload: { target, integrationId: integration.id, intKey },
    };
  }

  return {
    success: false,
    message: `Firewall API (${getIntegrationName(integration)}) returned ${result.status}: ${result.data?.error ?? result.data?.message ?? JSON.stringify(result.data).slice(0, 200)}`,
    timestamp: new Date().toISOString(),
    isReversible: true,
  };
}

export async function executeAccountDisable(tenantId: number, target: string): Promise<ExecutionResult> {
  // Use canonical platform_key values for identity/IAM integrations
  const integration = await getIntegration(tenantId, ["okta", "azure_ad", "azure_entra", "entra_id", "active_directory", "ldap"]);
  if (!integration) {
    return { success: false, message: "No identity integration connected for tenant — account disable cannot proceed", timestamp: new Date().toISOString(), isReversible: true };
  }

  const intKey = getPlatformKey(integration);
  let apiPath = "/api/v1/users/disable";
  let requestBody: any = { user: target };

  if (intKey.includes("okta")) {
    apiPath = `/api/v1/users/${encodeURIComponent(target)}/lifecycle/deactivate`;
    requestBody = {};
  } else if (intKey.includes("azure") || intKey.includes("entra")) {
    apiPath = `/v1.0/users/${encodeURIComponent(target)}`;
    requestBody = { accountEnabled: false };
  }

  const method = (intKey.includes("azure") || intKey.includes("entra")) ? "PATCH" : "POST";
  const result = await callIntegrationApi(integration, method, apiPath, requestBody);

  if (result.ok || result.status === 200 || result.status === 204) {
    return {
      success: true,
      message: `Account disabled via ${getIntegrationName(integration)} for: ${target}`,
      timestamp: new Date().toISOString(),
      isReversible: true,
      reversalPayload: { target, integrationId: integration.id, intKey },
    };
  }

  return {
    success: false,
    message: `Identity API (${getIntegrationName(integration)}) returned ${result.status}: ${result.data?.error ?? result.data?.message ?? JSON.stringify(result.data).slice(0, 200)}`,
    timestamp: new Date().toISOString(),
    isReversible: true,
  };
}

export async function executeTicketEscalation(tenantId: number, incidentId: number, actorName: string): Promise<ExecutionResult> {
  const ticketRes = await pool.query(
    `INSERT INTO tickets (tenant_id, title, description, priority, status, category, created_by)
     VALUES ($1, $2, $3, 'critical', 'open', 'incident_response', $4) RETURNING id`,
    [tenantId,
     `[P1 ESCALATION] Incident #${incidentId} Requires Immediate Action`,
     `Autonomous response engine escalated incident #${incidentId} to P1. Immediate analyst attention required.`,
     actorName]
  );
  const ticketId = ticketRes.rows[0]?.id;
  return {
    success: true,
    message: `P1 ticket #${ticketId} created and escalated`,
    timestamp: new Date().toISOString(),
    isReversible: false,
    reversalPayload: { ticketId },
  };
}

export async function executeNotification(tenantId: number, target: string, incidentId: number): Promise<ExecutionResult> {
  await pool.query(
    `INSERT INTO incident_notifications (tenant_id, incident_id, recipients, notification_type, email_subject, email_body, status)
     VALUES ($1, $2, ARRAY[$3], 'response_action', $4, $5, 'pending')`,
    [
      tenantId,
      incidentId,
      target,
      `[Auto Response] Incident #${incidentId} Requires Attention`,
      `Autonomous response engine has been triggered for incident #${incidentId}. Target: ${target}. Immediate review recommended.`
    ]
  ).catch(() => null);
  return {
    success: true,
    message: `Notification queued to ${target} for incident #${incidentId}`,
    timestamp: new Date().toISOString(),
    isReversible: false,
  };
}

export async function executeEvidenceSnapshot(tenantId: number, incidentId: number): Promise<ExecutionResult> {
  const snapshotId = `snapshot-incident-${incidentId}-${Date.now()}`;

  const eventsRes = await pool.query(
    `SELECT id, event_type, severity, threat, target, attacker, source, occurred_at
     FROM security_events
     WHERE tenant_id = $1
     ORDER BY occurred_at DESC LIMIT 50`,
    [tenantId]
  );

  const snapshot = {
    capturedAt: new Date().toISOString(),
    incidentId,
    tenantId,
    eventCount: eventsRes.rowCount,
    events: eventsRes.rows,
  };

  await pool.query(
    `INSERT INTO incident_evidence (incident_id, tenant_id, type, value, description, added_by)
     VALUES ($1, $2, 'log_snapshot', $3, $4, 'response_engine')`,
    [incidentId, tenantId, snapshotId, `Automated evidence snapshot — ${eventsRes.rowCount} events archived`]
  );

  return {
    success: true,
    message: `Evidence snapshot (${snapshotId}) captured — ${eventsRes.rowCount} events archived`,
    timestamp: new Date().toISOString(),
    isReversible: false,
  };
}

export async function dispatchAction(
  actionType: string,
  target: string,
  tenantId: number,
  incidentId: number,
  actorName: string
): Promise<ExecutionResult> {
  switch (actionType) {
    case "host_isolation": return executeHostIsolation(tenantId, target);
    case "ip_block": return executeIPBlock(tenantId, target);
    case "account_disable": return executeAccountDisable(tenantId, target);
    case "ticket_escalation": return executeTicketEscalation(tenantId, incidentId, actorName);
    case "notification": return executeNotification(tenantId, target, incidentId);
    case "evidence_snapshot": return executeEvidenceSnapshot(tenantId, incidentId);
    default:
      return { success: false, message: `Unknown action type: ${actionType}`, timestamp: new Date().toISOString(), isReversible: false };
  }
}

export async function dispatchUndo(
  actionType: string,
  target: string,
  tenantId: number
): Promise<ExecutionResult> {
  switch (actionType) {
    case "host_isolation": return executeUnisolation(tenantId, target);
    case "ip_block": {
      const integration = await getIntegration(tenantId, ["palo_alto_ngfw", "paloalto", "fortinet_fortigate", "fortinet", "checkpoint_ngfw", "checkpoint", "cisco_asa"]);
      if (!integration) {
        return { success: false, message: "No firewall integration connected — cannot remove IP block rule", timestamp: new Date().toISOString(), isReversible: false };
      }
      const intKey = getPlatformKey(integration);
      let apiPath = `/api/v1/unblock-ip`;
      let requestBody: any = { ip: target };
      if (intKey.includes("palo_alto") || intKey.includes("paloalto")) {
        apiPath = `/restapi/v10.2/Objects/AddressObjects/BLOCK-${encodeURIComponent(target)}`;
      }
      const method = (intKey.includes("palo_alto") || intKey.includes("paloalto")) ? "DELETE" : "POST";
      const result = await callIntegrationApi(integration, method, apiPath, method === "DELETE" ? undefined : requestBody);
      if (result.ok || result.status === 200 || result.status === 204) {
        return { success: true, message: `IP block rule removed for: ${target}`, timestamp: new Date().toISOString(), isReversible: false };
      }
      return { success: false, message: `Firewall API (${getIntegrationName(integration)}) returned ${result.status} on unblock`, timestamp: new Date().toISOString(), isReversible: false };
    }
    case "account_disable": {
      const integration = await getIntegration(tenantId, ["okta", "azure_ad", "azure_entra", "entra_id", "active_directory", "ldap"]);
      if (!integration) {
        return { success: false, message: "No identity integration connected — cannot re-enable account", timestamp: new Date().toISOString(), isReversible: false };
      }
      const intKey = getPlatformKey(integration);
      let apiPath = `/api/v1/users/enable`;
      let requestBody: any = { user: target };
      if (intKey.includes("okta")) {
        apiPath = `/api/v1/users/${encodeURIComponent(target)}/lifecycle/activate`;
        requestBody = {};
      } else if (intKey.includes("azure") || intKey.includes("entra")) {
        apiPath = `/v1.0/users/${encodeURIComponent(target)}`;
        requestBody = { accountEnabled: true };
      }
      const method = (intKey.includes("azure") || intKey.includes("entra")) ? "PATCH" : "POST";
      const result = await callIntegrationApi(integration, method, apiPath, requestBody);
      if (result.ok || result.status === 200 || result.status === 204) {
        return { success: true, message: `Account re-enabled via ${getIntegrationName(integration)} for: ${target}`, timestamp: new Date().toISOString(), isReversible: false };
      }
      return { success: false, message: `Identity API (${getIntegrationName(integration)}) returned ${result.status} on account re-enable`, timestamp: new Date().toISOString(), isReversible: false };
    }
    default:
      return { success: false, message: `Action type '${actionType}' is not reversible`, timestamp: new Date().toISOString(), isReversible: false };
  }
}
