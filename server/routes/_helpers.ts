/**
 * Shared route helpers — extracted from the historical monolithic
 * `server/routes.ts` so route modules under `server/routes/*` can share a
 * single, well-typed surface for the cross-cutting concerns every endpoint
 * needs: tenant access checks, ClickHouse integration guards, MITRE-style
 * incident classification, snapshot caches, etc.
 *
 * Adding a new route module
 * ─────────────────────────
 * Import the helpers you need from this file rather than copy-pasting any
 * of these utilities into your module. If you find yourself adding a new
 * cross-cutting helper that more than one route module needs, put it here
 * (not in the registrar in `server/routes.ts`).
 *
 * What does NOT belong here
 * ─────────────────────────
 *  - Any route handler.
 *  - Anything that depends on closures inside `registerRoutes` (e.g. the
 *    `forensicQueryRegistry`, `_computeSoftwareAnalyticsForWarmup`, the
 *    inline middleware closures `isSuperAdmin*`, etc.). Those still live
 *    inside `registerRoutes` for now and will be relocated as their
 *    consuming routes are extracted into per-domain modules.
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { getLogSourcesForPlatformKeys } from "../log-source-map";
import { evalCondition, type ConditionConfig } from "../soar-execution-engine";
import {
  nominateFromIncident,
  isPrivateIP,
  isValidIPv4,
} from "../federated-intel-engine";

// ── ClickHouse integration guard helpers ────────────────────────────────────

/**
 * Per-tenant map of connected log_source values for a set of tenants.
 * Used to enforce integration-aware visibility on ClickHouse fast-paths
 * with parity to the PG buildIntegrationGuardSql EXISTS predicate.
 *
 * Returns Map<tenantId, logSources[]>. Tenants with no connected integrations
 * map to an empty array — CH queries should treat that as "return zero rows
 * for this tenant" to match the PG guard's deny-by-default behavior.
 */
export async function getConnectedLogSourcesByTenant(
  tenantIds: number[],
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (tenantIds.length === 0) return map;
  const result = await pool.query(
    `SELECT tenant_id, platform_key
       FROM security_integrations
      WHERE tenant_id = ANY($1) AND status = 'connected' AND deleted_at IS NULL`,
    [tenantIds],
  );
  const byTenant = new Map<number, string[]>();
  for (const row of result.rows) {
    const list = byTenant.get(row.tenant_id) ?? [];
    list.push(row.platform_key);
    byTenant.set(row.tenant_id, list);
  }
  for (const tid of tenantIds) {
    const keys = byTenant.get(tid) ?? [];
    map.set(tid, getLogSourcesForPlatformKeys(keys));
  }
  return map;
}

/** Safe JSON parse for ClickHouse string columns — returns the value as-is
 *  if it's not a string, undefined for nullish/empty, or the original string
 *  on parse failure. */
export function chJsonParse(s: unknown): any {
  if (s == null || s === "") return undefined;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

/**
 * Build a ClickHouse WHERE predicate applying the integration guard as a
 * per-tenant `(tenant_id = X AND log_source IN (...))` disjunction — exact
 * parity with buildIntegrationGuardSql semantics (which filters on the PG
 * log_source column). The CH schema stores log_source alongside source_type,
 * populated by chDualWrite. Returns "0" (always false) when no tenants have
 * connected integrations, matching PG deny-by-default.
 */
export function buildChIntegrationGuard(
  map: Map<number, string[]>,
  column: string = "log_source",
): string {
  const safeColumn = column.replace(/[^a-zA-Z0-9_]/g, "");
  const clauses: string[] = [];
  for (const [tid, sources] of Array.from(map.entries())) {
    if (sources.length === 0) continue;
    const quoted = sources.map((s) => `'${s.replace(/'/g, "\\'")}'`).join(",");
    clauses.push(`(tenant_id = ${tid} AND ${safeColumn} IN (${quoted}))`);
  }
  return clauses.length === 0 ? "0" : `(${clauses.join(" OR ")})`;
}

// ── Heavy-query concurrency limiter ─────────────────────────────────────────

let heavyQueryRunning = 0;
const MAX_CONCURRENT_HEAVY = 2;

/** Runs `fn` after acquiring one of {MAX_CONCURRENT_HEAVY} slots — used to
 *  cap the number of expensive analytics queries hitting Postgres
 *  concurrently and prevent pool exhaustion under burst load. */
export async function withHeavyQueryLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (heavyQueryRunning >= MAX_CONCURRENT_HEAVY) {
    await new Promise(r => setTimeout(r, 100));
  }
  heavyQueryRunning++;
  try {
    return await fn();
  } finally {
    heavyQueryRunning--;
  }
}

// ── Incident classification ─────────────────────────────────────────────────

/**
 * Heuristic classifier for incident types — pattern-matches the title +
 * description + source + category against well-known SOC keywords and
 * returns a coarse-grained type label. Used to backfill `incident_type` for
 * incidents created without an explicit type and as a fallback for the
 * AI-driven classifier.
 */
export function classifyIncidentType(title: string, description?: string | null, source?: string | null, category?: string | null): string {
  const text = `${title} ${description || ""} ${source || ""} ${category || ""}`;

  if (/wildfire malware|wildfire.*malware/i.test(text)) return "Malware";
  if (/ransomware/i.test(text)) return "Ransomware";
  if (/trojan|worm|backdoor|keylogger|spyware|adware/i.test(text)) return "Malware";
  if (/cryptominer|coinminer|crypto.*min/i.test(text)) return "Cryptomining";

  if (/vulnerable driver|loldriver|byovd|bring your own vulnerable/i.test(text)) return "Vulnerable Driver";
  if (/vulnerable.*application|vulnerable.*software/i.test(text)) return "Vulnerable Application";
  if (/cve-|vulnerab.*patch|patch.*missing|unpatched|security.*flaw/i.test(text) && !/driver/i.test(text)) return "Vulnerability";

  if (/suspicious executable/i.test(text)) return "Suspicious Executable";
  if (/suspicious process creation|suspicious process$/i.test(text)) return "Suspicious Process";
  if (/suspicious remote wmi|remote wmi/i.test(text)) return "Remote Code Execution";
  if (/psexec|remote.*execution.*attempt|winrm.*execution/i.test(text)) return "Remote Code Execution";

  if (/local threat detected/i.test(text)) return "Local Threat";
  if (/rootkit|uncommon driver.*loaded/i.test(text)) return "Rootkit";
  if (/anti.?webshell|webshell.*dropped|known webshell/i.test(text)) return "Webshell";

  if (/pe injection|process injection|process hollowing|dll injection/i.test(text)) return "Process Injection";
  if (/dll.*sideload|dll.*hijack|dll.*loaded.*cd-rom|log4net.*loaded/i.test(text)) return "DLL Side-Loading";
  if (/modification of the system partition/i.test(text)) return "System Modification";
  if (/digital signer restriction/i.test(text)) return "Digital Signer Restriction";

  if (/masquerading/i.test(text)) return "Masquerading";
  if (/ntlm relay/i.test(text)) return "NTLM Relay";
  if (/powershell activity|powershell.*execution/i.test(text)) return "Powershell Activity";
  if (/accessibility feature escalation|sync.*escalation/i.test(text)) return "Privilege Escalation";
  if (/impair defenses|gain persistency/i.test(text)) return "Defense Evasion";
  if (/rare unsigned process|unsigned.*module|rundll32.*unsigned/i.test(text)) return "Suspicious Process";
  if (/multiple alerts.*mitre tactics/i.test(text)) return "Multiple MITRE Alerts";

  if (/compute.attached identity.*api call|executed api calls.*unusual asn/i.test(text)) return "Suspicious API Call";
  if (/suspicious usage of ec2 token|ec2.*token/i.test(text)) return "Suspicious Cloud Token Usage";
  if (/cloud identity.*performed|createemailidentity|cloud.*operation/i.test(text)) return "Suspicious Cloud Operation";
  if (/logged in.*aws console|aws.*console.*login/i.test(text)) return "Suspicious Cloud Login";
  if (/cloud.*misconfig|s3.*bucket.*public/i.test(text)) return "Cloud Misconfiguration";
  if (/instance metadata|imds/i.test(text)) return "IMDS Exploitation";

  if (/unusual ssh activity|ssh tunnel/i.test(text)) return "Suspicious SSH Activity";
  if (/uploaded.*mb.*external|uploaded.*gb.*external|large upload/i.test(text)) return "Large Data Upload";
  if (/data (exfiltration|leak|loss|theft)|dlp|unusual.*(download|transfer)/i.test(text)) return "Data Exfiltration";

  if (/tried to connect to \d+ hosts|port scan|network scan|suspicious port scan/i.test(text)) return "Port Scan";
  if (/failed connection/i.test(text)) return "Failed Connections";
  if (/vnc scanning|vnc.*activity|scanning tool/i.test(text)) return "Network Scanning";
  if (/lateral movement/i.test(text)) return "Lateral Movement";
  if (/ddos|dos attack|syn flood|packet flood/i.test(text)) return "DDoS";
  if (/ids.*alert|ips.*alert|network.*intrusion|firewall.*block/i.test(text)) return "Network Intrusion";

  if (/phish|spear.?phish|spoofed.*email|malicious.*email|bec |business email compromise/i.test(text)) return "Phishing";
  if (/email.*gateway|dmarc.*fail|spf.*fail/i.test(text)) return "Email Security Alert";

  if (/brute.?force|credential.?(stuff|spray|dump)|password.*spray|authentication.*anomal|account.*lock/i.test(text)) return "Brute Force";

  if (/unauthorized (access|login)|privilege (escalation|abuse)|insider.*threat/i.test(text)) return "Unauthorized Access";

  if (/sql.*inject|xss|cross.site|owasp|waf.*alert/i.test(text)) return "Web Application Attack";
  if (/casb|shadow.*it|unsanctioned.*app/i.test(text)) return "Shadow IT";

  if (/process.*action.*type.*execution/i.test(text)) return "Suspicious Process";

  return "";
}

export const ENRICHMENT_SYSTEM_PROMPT = `You are a senior SOC analyst specializing in MSSP operations. For each incident, provide precise security classification and enrichment.

CRITICAL CLASSIFICATION RULES (incidentType field) - Use SPECIFIC threat types, NOT broad categories:
- "malware": WildFire Malware, malicious files, trojans, worms, backdoors, spyware
- "ransomware": Ransomware attacks, file encryption events
- "cryptomining": Cryptominers, coinminers
- "vulnerable_driver": Vulnerable Driver Dropped (BYOVD/loldrivers) - NOT "vulnerability"
- "vulnerable_application": Vulnerable application or software detected
- "vulnerability": CVE-based findings, missing patches, scan results (NOT vulnerable drivers)
- "suspicious_executable": Suspicious executable file detected
- "suspicious_process": Suspicious process creation, rare unsigned processes, rundll32 unsigned modules
- "remote_code_execution": Remote WMI process execution, PsExec, WinRM execution
- "local_threat": Local Threat Detected by XDR Agent
- "rootkit": Rootkit detection, uncommon driver loaded for rootkit purposes
- "webshell": Anti Webshell Protection, webshell dropped
- "process_injection": PE injection, process injection, process hollowing, DLL injection
- "dll_sideloading": DLL side-loading, DLL hijacking, DLL loaded from unusual location
- "system_modification": Modification of system partition
- "digital_signer_restriction": Digital Signer Restriction alerts
- "masquerading": Process masquerading (T1036)
- "ntlm_relay": NTLM Relay attacks
- "powershell_activity": PowerShell activity alerts
- "privilege_escalation": Accessibility Feature Escalation, privilege escalation
- "defense_evasion": Impair Defenses, Gain Persistency
- "multiple_mitre_alerts": Multiple alerts of different MITRE tactics on same host
- "suspicious_api_call": Compute-attached identity executing API calls from unusual ASN/region
- "suspicious_cloud_token": Suspicious usage of EC2 token
- "suspicious_cloud_operation": Cloud identity performing unusual operations (CreateEmailIdentity etc.)
- "suspicious_cloud_login": Unusual AWS/Azure console login
- "cloud_misconfiguration": Cloud misconfigurations, public S3 buckets
- "large_data_upload": Host uploaded large amounts of data to external host
- "data_exfiltration": DLP alerts, unusual data transfers
- "port_scan": Host tried to connect to many hosts, suspicious port scan
- "failed_connections": Failed network connections
- "network_scanning": VNC scanning, network sweep
- "lateral_movement": Lateral movement attempts
- "network_intrusion": IDS/IPS alerts, firewall blocks
- "phishing": Phishing, spear-phishing, BEC, malicious email
- "brute_force": Brute force, credential stuffing/spraying
- "unauthorized_access": Unauthorized logins, privilege abuse
- "web_application_attack": SQL injection, XSS, WAF alerts

Return JSON: {"results":[{"index":0,"mitreTactic":"...","mitreTechniqueId":"T1xxx","mitreTechnique":"...","killChainPhase":"reconnaissance|weaponization|delivery|exploitation|installation|command_and_control|actions_on_objectives","confidenceScore":0-100,"classification":"true_positive|false_positive|suspicious","detectionSource":"SIEM|EDR|IDS|Firewall|WAF|Email Gateway|Cloud Security|Vulnerability Scanner|SOAR|Manual","incidentType":"malware|ransomware|cryptomining|vulnerable_driver|vulnerable_application|vulnerability|suspicious_executable|suspicious_process|remote_code_execution|local_threat|rootkit|webshell|process_injection|dll_sideloading|system_modification|masquerading|ntlm_relay|powershell_activity|privilege_escalation|defense_evasion|multiple_mitre_alerts|suspicious_api_call|suspicious_cloud_token|suspicious_cloud_operation|suspicious_cloud_login|cloud_misconfiguration|large_data_upload|data_exfiltration|port_scan|failed_connections|network_scanning|lateral_movement|network_intrusion|phishing|brute_force|unauthorized_access|web_application_attack|other","actionTaken":"Blocked|Quarantined|Isolated|Investigated|Escalated|Remediated|Monitored|No Action","iocReputation":{"indicators":[{"type":"ip|domain|hash|url","value":"...","reputation":"malicious|suspicious|clean","country":"XX"}]}}]}`;

export const AI_TYPE_MAP: Record<string, string> = {
  malware: "Malware",
  ransomware: "Ransomware",
  cryptomining: "Cryptomining",
  vulnerable_driver: "Vulnerable Driver",
  vulnerable_application: "Vulnerable Application",
  vulnerability: "Vulnerability",
  suspicious_executable: "Suspicious Executable",
  suspicious_process: "Suspicious Process",
  remote_code_execution: "Remote Code Execution",
  local_threat: "Local Threat",
  rootkit: "Rootkit",
  webshell: "Webshell",
  process_injection: "Process Injection",
  dll_sideloading: "DLL Side-Loading",
  system_modification: "System Modification",
  digital_signer_restriction: "Digital Signer Restriction",
  masquerading: "Masquerading",
  ntlm_relay: "NTLM Relay",
  powershell_activity: "Powershell Activity",
  privilege_escalation: "Privilege Escalation",
  defense_evasion: "Defense Evasion",
  multiple_mitre_alerts: "Multiple MITRE Alerts",
  suspicious_api_call: "Suspicious API Call",
  suspicious_cloud_token: "Suspicious Cloud Token Usage",
  suspicious_cloud_operation: "Suspicious Cloud Operation",
  suspicious_cloud_login: "Suspicious Cloud Login",
  cloud_misconfiguration: "Cloud Misconfiguration",
  imds_exploitation: "IMDS Exploitation",
  suspicious_ssh_activity: "Suspicious SSH Activity",
  large_data_upload: "Large Data Upload",
  data_exfiltration: "Data Exfiltration",
  port_scan: "Port Scan",
  failed_connections: "Failed Connections",
  network_scanning: "Network Scanning",
  lateral_movement: "Lateral Movement",
  ddos: "DDoS",
  network_intrusion: "Network Intrusion",
  phishing: "Phishing",
  email_security_alert: "Email Security Alert",
  brute_force: "Brute Force",
  unauthorized_access: "Unauthorized Access",
  web_application_attack: "Web Application Attack",
  shadow_it: "Shadow IT",
  endpoint_security: "Local Threat",
  cloud_security: "Suspicious Cloud Operation",
  network_security: "Network Intrusion",
  email_threat: "Phishing",
  credential_abuse: "Brute Force",
  other: "Security Alert",
};

// ── Tenant access helpers ───────────────────────────────────────────────────

export interface UserTenantAccess {
  userId: string;
  role: string;
  tenantId: number | null;
  isMSS: boolean;
  isPlatformAdmin: boolean;
  /** True when the user's own tenant has type === 'mssp'.
   *  This (not isMSS role-name check) is the correct gate for cross-tenant
   *  data access: a soc_manager at a customer tenant has isMSS=true but
   *  isMSSPTenant=false and must see only their own tenant. */
  isMSSPTenant: boolean;
}

export interface AssertedTenantAccess {
  userId: string;
  role: string;
  tenantId: number;
  isMSS: boolean;
  isPlatformAdmin: boolean;
  isMSSPTenant: boolean;
}

/** Resolves the calling user's tenant + role context. Defaults to a
 *  `customer` role with no tenant when there is no matching tenant_user
 *  row. Throws if there is no authenticated user.
 *
 *  Task #519: when a superadmin has a `viewingTenantId` session, a synthetic
 *  platform_admin access record is returned so every downstream route works
 *  transparently without separate superadmin-aware branches. */
export async function getUserTenantAccess(req: any): Promise<UserTenantAccess> {
  // Task #519 — Superadmin identity shortcuts.
  // Viewing mode: superadmin is browsing as a specific tenant.
  if (req.user?.isSuperAdminViewing && req.user?.viewingTenantId) {
    const tenantId: number = req.user.viewingTenantId;
    return {
      userId: "__superadmin__",
      role: "platform_admin",
      tenantId,
      isMSS: true,
      isPlatformAdmin: true,
      isMSSPTenant: true,
    };
  }
  // Admin-portal mode: superadmin is making admin API calls without tenant context.
  if (req.user?.isSuperAdmin) {
    return {
      userId: "__superadmin__",
      role: "platform_admin",
      tenantId: null,
      isMSS: true,
      isPlatformAdmin: true,
      isMSSPTenant: true,
    };
  }

  const userId = req.user?.claims?.sub;
  if (!userId) throw new Error("No user ID");

  const tenantUser = await storage.getTenantUserByUserId(userId);
  if (!tenantUser) {
    return { userId, role: "customer", tenantId: null, isMSS: false, isPlatformAdmin: false, isMSSPTenant: false };
  }

  const isPlatformAdmin = tenantUser.role === "platform_admin";
  const mssRoles = ["platform_admin", "mss_admin", "mss_analyst", "security_engineer", "service_desk", "security_analyst", "soc_manager"];
  const isMSS = mssRoles.includes(tenantUser.role);

  // isMSSPTenant: true ONLY when the user's own tenant has type='mssp'.
  // platform_admin does NOT get implicit MSSP-level cross-tenant access —
  // a platform_admin in a customer tenant is scoped to that customer tenant,
  // a platform_admin in an MSSP tenant sees that MSSP's subtree.
  // Only superadmin (isSuperAdmin flag, tenantId=null) gets global access.
  let isMSSPTenant = false;
  if (tenantUser.tenantId) {
    const userTenant = await storage.getTenant(tenantUser.tenantId);
    isMSSPTenant = userTenant?.type === "mssp";
  }

  return { userId, role: tenantUser.role, tenantId: tenantUser.tenantId, isMSS, isPlatformAdmin, isMSSPTenant };
}

/** Asserts the calling user has access to `tenantId`.
 *
 *  Three-tier model (Task #560 / #564):
 *   1. True superadmin (isPlatformAdmin && tenantId === null) → any tenant (global access).
 *      platform_admin users WITH a real tenantId are NOT in this tier — they fall
 *      through to tier 2 or 3 below.
 *   2. User whose OWN tenant.type === 'mssp' (isMSSPTenant) → may access
 *      any tenant in their descendant tree (recursive). Cross-MSSP access is
 *      denied even for users with MSS-like role names.
 *   3. Everyone else (customer-tenant users, regardless of role name) →
 *      own tenant only. A platform_admin or soc_manager at a customer tenant
 *      is in group 3.
 *
 *  Throws an Error with `.status = 403` on denial. */
export async function assertTenantAccess(req: any, tenantId: number): Promise<AssertedTenantAccess> {
  const access = await getUserTenantAccess(req);

  // Only true superadmin (tenantId=null, set by the isSuperAdmin early-return path)
  // gets unconditional cross-tenant access.  platform_admin users WITH a real
  // tenantId fall through to the MSSP-tree or own-tenant checks below.
  if (access.isPlatformAdmin && !access.tenantId) {
    return { userId: access.userId, role: access.role, tenantId, isMSS: true, isPlatformAdmin: true, isMSSPTenant: true };
  }

  if (access.isMSSPTenant && access.tenantId !== null) {
    // MSSP user: verify the requested tenant is within their descendant tree.
    const allowedIds = await getAllDescendantTenantIds(access.tenantId);
    if (!allowedIds.includes(tenantId)) {
      throw Object.assign(
        new Error("Forbidden: tenant not in your MSSP tree"),
        { status: 403 },
      );
    }
    return { userId: access.userId, role: access.role, tenantId, isMSS: true, isPlatformAdmin: false, isMSSPTenant: true };
  }

  // Customer-tenant user (including those with MSS-like role names): own tenant only.
  if (access.tenantId !== tenantId) {
    throw Object.assign(new Error("Forbidden: no access to this tenant"), { status: 403 });
  }

  return { userId: access.userId, role: access.role, tenantId, isMSS: access.isMSS, isPlatformAdmin: false, isMSSPTenant: false };
}

/** Throws 403 if the access record does not represent an MSS role. */
export function assertMSSRole(access: { role: string; isMSS: boolean }) {
  if (!access.isMSS) {
    throw Object.assign(new Error("Forbidden: MSS role required"), { status: 403 });
  }
}

/**
 * Verify that the given assetId belongs to the tenantId or one of its descendants.
 * Throws 404 if the asset doesn't exist, 403 if not in the allowed tenant tree.
 */
export async function assertAssetBelongsToTenantTree(
  assetId: number,
  tenantId: number,
  poolClient: any
): Promise<void> {
  const row = await poolClient.query(
    `SELECT tenant_id FROM assets WHERE id = $1 LIMIT 1`,
    [assetId]
  );
  if (!row.rows[0]) {
    throw Object.assign(new Error("Asset not found"), { status: 404 });
  }
  const assetTenantId: number = row.rows[0].tenant_id;
  if (assetTenantId === tenantId) return; // same tenant — allowed
  // Check if asset's tenant is a descendant
  const allowedIds = await getAllDescendantTenantIds(tenantId);
  if (!allowedIds.includes(assetTenantId)) {
    throw Object.assign(new Error("Forbidden: asset not in your tenant tree"), { status: 403 });
  }
}

/** Returns `tenantId` plus the IDs of every descendant tenant (recursive
 *  through the parent_tenant_id chain). Cycle-safe via the `visited` set. */
export async function getAllDescendantTenantIds(tenantId: number, visited = new Set<number>()): Promise<number[]> {
  if (visited.has(tenantId)) return [];
  visited.add(tenantId);
  const children = await storage.getChildTenants(tenantId);
  const ids: number[] = [tenantId];
  for (const child of children) {
    const desc = await getAllDescendantTenantIds(child.id, visited);
    ids.push(...desc);
  }
  return ids;
}

/** For MSSP-type-tenant or platform-admin callers, returns `tenantId` plus
 *  all of its descendants (recursive). Customer-tenant users (regardless of
 *  role name) always get back a single-element array with only their own
 *  tenant. Uses isMSSPTenant, not isMSS, per Task #560 three-tier model. */
export async function getAccessibleTenantIds(req: any, tenantId: number): Promise<number[]> {
  const access = await getUserTenantAccess(req);
  if (access.isPlatformAdmin || access.isMSSPTenant) {
    const allIds = await getAllDescendantTenantIds(tenantId);
    if (allIds.length > 1) return allIds;
  }
  return [tenantId];
}

// ── Federated-intel nomination ──────────────────────────────────────────────

/**
 * Shared helper: nominate incident IPs + IOCs when marked true_positive.
 * Called from both the enrichment PATCH and quick-classify endpoints to
 * avoid duplicating nomination logic at two call sites.
 */
export async function autoNominateIncidentIOCs(
  tenantId: number,
  incidentId: number,
  sourceIp: string | null | undefined,
  destIp: string | null | undefined,
  confidence: number,
  nominatedBy: string
): Promise<void> {
  const ips = [sourceIp, destIp].filter(Boolean) as string[];
  for (const ip of ips) {
    if (isValidIPv4(ip) && !isPrivateIP(ip)) {
      try {
        await nominateFromIncident(tenantId, incidentId, ip, "ip", confidence, nominatedBy);
      } catch (err) {
        console.warn(`[FederatedIntel] nomination failed for incident ${incidentId} ip ${ip}:`, (err as Error).message);
      }
    }
  }
  // Also nominate confirmed malicious IOCs linked to this incident
  try {
    const iocRows = await pool.query(
      `SELECT indicator_value, indicator_type, confidence FROM incident_iocs WHERE incident_id = $1 AND reputation = 'malicious' AND (confidence IS NULL OR confidence >= 80)`,
      [incidentId]
    );
    for (const iocRow of iocRows.rows) {
      try {
        await nominateFromIncident(tenantId, incidentId, iocRow.indicator_value, iocRow.indicator_type, iocRow.confidence ?? 85, nominatedBy);
      } catch (err) {
        console.warn(`[FederatedIntel] nomination failed for incident ${incidentId} ioc ${iocRow.indicator_value}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.warn(`[FederatedIntel] could not query incident_iocs for incident ${incidentId}:`, (err as Error).message);
  }
}

// ── Entity-graph snapshot LRU ───────────────────────────────────────────────

const SNAPSHOT_MAX_ENTRIES = 200;
/** In-memory snapshot store for entity graph PNGs (incidentId → base64 PNG
 *  data URL). Limited to 200 entries with LRU eviction; expires on server
 *  restart. Exported so route handlers can read snapshots directly via
 *  `entityGraphSnapshots.get(...)`. */
export const entityGraphSnapshots: Map<number, string> = new Map();
export function setEntityGraphSnapshot(id: number, png: string) {
  if (entityGraphSnapshots.size >= SNAPSHOT_MAX_ENTRIES) {
    const oldest = entityGraphSnapshots.keys().next().value;
    if (oldest !== undefined) entityGraphSnapshots.delete(oldest);
  }
  entityGraphSnapshots.set(id, png);
}

// ── Playbook trigger / simulation helpers ───────────────────────────────────

/**
 * Module-level helper: check if an incident matches a playbook's
 * trigger_conditions. Used by auto-trigger on incident creation AND the
 * manual trigger-for-incident endpoint.
 */
export function checkIncidentMatchesTrigger(incident: any, triggerConditions: any): boolean {
  if (!triggerConditions || Object.keys(triggerConditions).length === 0) return false;
  const tc = triggerConditions;
  const incSev = (incident.severity || '').toLowerCase();
  const incType = (incident.incident_type || incident.category || '').toLowerCase();
  const incMitreTactic = (incident.mitre_tactic || '').toLowerCase();
  const incMitreTechId = (incident.mitre_technique_id || '').toLowerCase();
  const incAssetCrit = (incident.asset_criticality || incident.criticality || '').toLowerCase();
  const incIocTypes: string[] = Array.isArray(incident.ioc_types)
    ? incident.ioc_types.map((t: string) => t.toLowerCase())
    : [];
  // Severity: required match if specified — incident severity MUST be in the configured set
  if (tc.severity?.length > 0) {
    if (!incSev || !tc.severity.map((s: string) => s.toLowerCase()).includes(incSev)) return false;
  }
  // Incident type: if configured, incident MUST have a matching type; missing type = no match
  if (tc.type?.length > 0) {
    if (!incType || !tc.type.some((t: string) => incType.includes(t.toLowerCase()))) return false;
  }
  // MITRE tactics: if configured, incident MUST have the tactic; missing tactic = no match
  if (tc.mitreTactics?.length > 0) {
    if (!incMitreTactic || !tc.mitreTactics.some((t: string) => incMitreTactic.includes(t.toLowerCase()))) return false;
  }
  // MITRE technique IDs: if configured, incident MUST have matching technique ID; missing = no match
  if (tc.mitreTechniqueIds?.length > 0) {
    if (!incMitreTechId || !tc.mitreTechniqueIds.some((id: string) => incMitreTechId.includes(id.toLowerCase()))) return false;
  }
  // IOC types: if configured, incident MUST have IOC data with a matching type; missing = no match
  if (tc.iocTypes?.length > 0) {
    if (incIocTypes.length === 0 || !tc.iocTypes.some((it: string) => incIocTypes.includes(it.toLowerCase()))) return false;
  }
  // Asset criticality: if configured (non-empty), incident MUST have matching criticality
  if (tc.assetCriticality) {
    const critArr: string[] = Array.isArray(tc.assetCriticality)
      ? tc.assetCriticality.map((c: string) => c.toLowerCase()).filter(Boolean)
      : (tc.assetCriticality ? [String(tc.assetCriticality).toLowerCase()] : []);
    // Only apply filter if the array is non-empty (empty array = unconfigured, skip check)
    if (critArr.length > 0 && (!incAssetCrit || !critArr.includes(incAssetCrit))) return false;
  }
  return true;
}

/**
 * Module-level simulation trace helper — runs graph-aware DFS trace for a
 * playbook. Used by the /simulate endpoint; separates simulation from real
 * execution (soar-execution-engine.ts).
 */
export function runGraphSimTrace(graphNodes: any[], graphEdges: any[], steps: any[], incident: any | null): any[] {
  const trace: any[] = [];
  if (graphNodes.length > 0) {
    const nodeMap = new Map(graphNodes.map((n: any) => [n.id, n]));
    const edgeMap = new Map<string, any[]>();
    for (const e of graphEdges) {
      if (!edgeMap.has(e.from)) edgeMap.set(e.from, []);
      edgeMap.get(e.from)!.push(e);
    }
    // Uses the shared evalCondition from soar-execution-engine (no inline duplicate)
    const visit = (nodeId: string, depth: number, visited: Set<string>) => {
      if (visited.has(nodeId) || depth > 50) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) return;
      let result = 'executed'; let message = '';
      if (node.type === 'trigger')      message = 'Trigger conditions matched';
      else if (node.type === 'condition') {
        const cr = evalCondition(node.config?.condition as ConditionConfig, incident as Record<string, unknown> | null);
        result = cr ? 'branch_true' : 'branch_false';
        message = cr ? 'Condition TRUE — following true branch' : 'Condition FALSE — following false branch';
      } else if (node.type === 'action')        message = 'Action executed';
      else if (node.type === 'notification')    message = 'Notification sent';
      else if (node.type === 'ai_enrichment')   message = 'AI enrichment applied';
      else if (node.type === 'end')             message = 'Playbook complete';
      trace.push({ nodeId, type: node.type, label: node.label, result, message, durationMs: Math.floor(Math.random() * 300) + 50 });
      for (const edge of (edgeMap.get(nodeId) || [])) {
        if (node.type === 'condition') {
          const cr = evalCondition(node.config?.condition as ConditionConfig, incident as Record<string, unknown> | null);
          if ((edge.fromPort === 'true' && cr) || (edge.fromPort === 'false' && !cr) || edge.fromPort === 'default') visit(edge.to, depth + 1, visited);
        } else { visit(edge.to, depth + 1, visited); }
      }
    };
    const startNode = graphNodes.find((n: any) => n.type === 'trigger') || graphNodes[0];
    if (startNode) visit(startNode.id, 0, new Set());
  } else {
    for (const step of steps) {
      trace.push({ nodeId: step.id, type: step.type, label: step.label, result: 'executed', message: 'Step executed', durationMs: Math.floor(Math.random() * 200) + 50 });
    }
  }
  return trace;
}

// ── Tiered log-query cache ──────────────────────────────────────────────────

export interface LogQueryCacheEntry {
  tenantId: number;
  userId: number | string;
  page: number;
  pageSize: number;
  sourceMode: string;
  tier: string;
  isAthena: boolean;
  hotRows?: Record<string, unknown>[];
  hotTotal?: number;
  sessionId?: number | null;
  rows?: Record<string, unknown>[];
  total?: number;
  totalPages?: number;
}
export type LogQueryCache = Record<string, LogQueryCacheEntry>;
const _logQueryCache: LogQueryCache = {};
/** Returns the shared log-query cache. Module-level so `routes.ts` and
 *  future split route modules see the same reference. */
export const getLogQueryCache = (): LogQueryCache => _logQueryCache;

// ── Admin role middleware (formerly closure-bound inside registerRoutes) ────
// These are pure functions on `req` that only need `getUserTenantAccess`
// (defined above). Kept here so route modules can apply them as Express
// middleware without re-implementing the role checks.

/** Express middleware: requires `req.session.isSuperAdmin === true`. */
export function isSuperAdmin(req: any, res: any, next: any) {
  if (req.session?.isSuperAdmin) {
    return next();
  }
  return res.status(401).json({ message: "Superadmin access required" });
}

/** Express middleware: allows superadmin OR users whose tenant role is
 *  `platform_admin` / `mss_admin` / `soc_manager`. */
export async function isSuperAdminOrPlatformAdmin(req: any, res: any, next: any) {
  if (req.session?.isSuperAdmin) {
    return next();
  }
  if (req.user?.claims?.sub) {
    try {
      const isAdmin = await assertAdminAccess(req);
      if (isAdmin) return next();
    } catch {}
  }
  return res.status(403).json({ message: "Admin access required" });
}

/** Returns true if the request is a superadmin session OR an authenticated
 *  user with an admin tenant role. Used by `isSuperAdminOrPlatformAdmin` and
 *  by route handlers that need to branch on admin status without short-
 *  circuiting the response. */
export async function assertAdminAccess(req: any): Promise<boolean> {
  if (req.session?.isSuperAdmin) return true;
  if (req.user?.claims?.sub) {
    const access = await getUserTenantAccess(req);
    const adminRoles = ["platform_admin", "mss_admin", "soc_manager"];
    return adminRoles.includes(access.role);
  }
  return false;
}

/** Insert a row into platform_notifications. Returns the new row id, or
 *  undefined on failure (errors are logged but never thrown so callers
 *  can treat notifications as best-effort side effects). Promoted from a
 *  closure inside `registerRoutes` so route modules can share it. */
export async function createNotification(
  tenantId: number,
  type: string,
  title: string,
  message: string,
  severity: string = "info",
  actionUrl?: string,
  userId?: number,
): Promise<number | undefined> {
  try {
    const result = await pool.query(
      `INSERT INTO platform_notifications (tenant_id, user_id, type, title, message, severity, action_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tenantId, userId || null, type, title, message, severity, actionUrl || null],
    );
    return result.rows[0]?.id;
  } catch (err: any) {
    console.error("[Notification] Create error:", err.message);
    return undefined;
  }
}

// Re-export commonly-used Express types so route modules that only need
// these and the helpers above can avoid importing `express` directly.
export type { Request, Response, NextFunction };
