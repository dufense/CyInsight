/**
 * Integration Autoheal Engine
 *
 * Monitors security integration failures, classifies the root cause,
 * applies targeted heal strategies (rule-based + AI-powered), validates
 * the fix by running testConnection(), and logs every attempt.
 *
 * Failure types handled:
 *   auth_failure     → credential trimming, header variation, token refresh
 *   endpoint_changed → API version bump, alternate path discovery, AI endpoint suggestion
 *   rate_limited     → polling interval backoff, retry-after respect
 *   schema_changed   → AI field remapping, configJson patch
 *   connectivity     → alternate base URL, SSL tolerance flag
 *   api_version      → version string negotiation
 *   ssl_error        → SSL verification tolerance
 *   unknown          → full AI diagnosis and config patch
 */

import { pool } from "./db";
import { storage } from "./storage";
import { getConnector } from "./connectors/base-connector";
import { createAIClient, getDefaultModel } from "./ai-provider";
import type { SecurityIntegration } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────

export type HealFailureType =
  | "auth_failure"
  | "endpoint_changed"
  | "rate_limited"
  | "schema_changed"
  | "connectivity"
  | "api_version"
  | "ssl_error"
  | "unknown";

export interface HealAttemptResult {
  integrationId: number;
  platformKey: string;
  failureType: HealFailureType;
  strategy: string;
  succeeded: boolean;
  message: string;
  configPatch?: Record<string, any>;
  aiDiagnosis?: string;
}

export interface HealSummary {
  integrationId: number;
  platformName: string;
  attempts: HealAttemptResult[];
  finalSuccess: boolean;
  totalStrategiesTried: number;
}

// ── Failure Classifier ─────────────────────────────────────────────────────

const AUTH_PATTERNS = [
  /401/,
  /403/,
  /unauthorized/i,
  /forbidden/i,
  /invalid.?api.?key/i,
  /invalid.?token/i,
  /token.?expired/i,
  /authentication.?fail/i,
  /access.?denied/i,
  /credentials.?invalid/i,
  /api.?key.?invalid/i,
  /bad.?credentials/i,
  /not.?authenticated/i,
];

const ENDPOINT_PATTERNS = [
  /404/,
  /not.?found/i,
  /no.?such.?route/i,
  /path.?not.?found/i,
  /endpoint.?not.?found/i,
  /resource.?not.?found/i,
  /deprecated/i,
  /moved.?permanently/i,
  /301/,
  /url.?has.?changed/i,
];

const RATE_LIMIT_PATTERNS = [
  /429/,
  /too.?many.?requests/i,
  /rate.?limit/i,
  /quota.?exceeded/i,
  /throttl/i,
  /request.?limit/i,
  /slowdown/i,
];

const SCHEMA_PATTERNS = [
  /cannot.?read.?propert/i,
  /undefined.?is.?not/i,
  /field.?not.?found/i,
  /key.?error/i,
  /unexpected.?response.?format/i,
  /missing.?field/i,
  /schema.?mismatch/i,
  /invalid.?response.?structure/i,
  /response.?parse.?error/i,
  /json.?parse.?error/i,
  /unexpected.?token/i,
];

const CONNECTIVITY_PATTERNS = [
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /EHOSTUNREACH/,
  /ENETUNREACH/,
  /connection.?refused/i,
  /connection.?timeout/i,
  /network.?error/i,
  /failed.?to.?fetch/i,
  /socket.?hang.?up/i,
  /timed.?out/i,
  /unreachable/i,
];

const API_VERSION_PATTERNS = [
  /version.?not.?supported/i,
  /unsupported.?version/i,
  /api.?version/i,
  /upgrade.?required/i,
  /version.?mismatch/i,
  /deprecated.?api/i,
  /use.?v\d/i,
];

const SSL_PATTERNS = [
  /SSL/,
  /TLS/,
  /certificate/i,
  /DEPTH_ZERO_SELF_SIGNED_CERT/,
  /UNABLE_TO_VERIFY_LEAF_SIGNATURE/,
  /CERT_HAS_EXPIRED/,
  /self.?signed/i,
  /ssl.?handshake/i,
];

export function classifyFailure(errorMessage: string): HealFailureType {
  const msg = errorMessage || "";
  if (SSL_PATTERNS.some((p) => p.test(msg))) return "ssl_error";
  if (CONNECTIVITY_PATTERNS.some((p) => p.test(msg))) return "connectivity";
  if (AUTH_PATTERNS.some((p) => p.test(msg))) return "auth_failure";
  if (RATE_LIMIT_PATTERNS.some((p) => p.test(msg))) return "rate_limited";
  if (ENDPOINT_PATTERNS.some((p) => p.test(msg))) return "endpoint_changed";
  if (API_VERSION_PATTERNS.some((p) => p.test(msg))) return "api_version";
  if (SCHEMA_PATTERNS.some((p) => p.test(msg))) return "schema_changed";
  return "unknown";
}

// ── Config Helpers ─────────────────────────────────────────────────────────

function getConfigJson(integration: SecurityIntegration): Record<string, any> {
  return (integration.configJson as Record<string, any>) || {};
}

function getCredentials(integration: SecurityIntegration): Record<string, any> {
  const cfg = getConfigJson(integration);
  return cfg.credentials || {};
}

/** Bump API version in URL: /v1/ → /v2/, /api/v1 → /api/v2, etc. */
function bumpApiVersion(url: string): string | null {
  const match = url.match(/\/v(\d+)\//);
  if (match) {
    const next = parseInt(match[1]) + 1;
    return url.replace(`/v${match[1]}/`, `/v${next}/`);
  }
  const match2 = url.match(/\/v(\d+)$/);
  if (match2) {
    const next = parseInt(match2[1]) + 1;
    return url.replace(`/v${match2[1]}`, `/v${next}`);
  }
  return null;
}

/** Try known alternate base URLs for well-known platforms */
const PLATFORM_ALTERNATE_URLS: Record<string, string[]> = {
  crowdstrike: [
    "https://api.crowdstrike.com",
    "https://api.us-2.crowdstrike.com",
    "https://api.eu-1.crowdstrike.com",
    "https://api.laggar.gcw.crowdstrike.com",
  ],
  cynet: [
    "https://api.cynet.com",
    "https://console.cynet.com",
  ],
  checkpoint_hec: [
    "https://cloudinfra-gw.portal.checkpoint.com",
    "https://cloudinfra-gw-us.portal.checkpoint.com",
    "https://cloudinfra-gw-eu.portal.checkpoint.com",
  ],
  azure_ad: [
    "https://graph.microsoft.com",
    "https://graph.microsoft.com/v1.0",
    "https://graph.microsoft.com/beta",
  ],
  vicarius: [
    "https://portal.vicarius.io",
    "https://api.vicarius.io",
  ],
};

// ── Heal Strategies ────────────────────────────────────────────────────────

async function strategyTrimCredentials(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const cfg = getConfigJson(integration);
  const creds = getCredentials(integration);
  let changed = false;
  const newCreds = { ...creds };

  for (const [k, v] of Object.entries(newCreds)) {
    if (typeof v === "string" && v !== v.trim()) {
      newCreds[k] = v.trim();
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    patch: { configJson: { ...cfg, credentials: newCreds } },
    description: "Trimmed whitespace from credential values",
  };
}

async function strategyAuthHeaderVariation(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const cfg = getConfigJson(integration);
  const creds = getCredentials(integration);
  const current = cfg.authHeaderStyle || "bearer";

  const STYLES = ["bearer", "token", "apikey_header", "apikey_param"];
  const nextIndex = (STYLES.indexOf(current) + 1) % STYLES.length;
  const nextStyle = STYLES[nextIndex];

  if (nextStyle === current) return null;

  return {
    patch: { configJson: { ...cfg, authHeaderStyle: nextStyle } },
    description: `Switched auth header style: ${current} → ${nextStyle}`,
  };
}

async function strategyTokenRefresh(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const cfg = getConfigJson(integration);
  const creds = getCredentials(integration);

  if (!creds.refresh_token && !creds.clientId && !creds.client_id) {
    return null;
  }

  const clientId = creds.clientId || creds.client_id || "";
  const clientSecret = creds.clientSecret || creds.client_secret || "";
  const tokenUrl = cfg.tokenUrl || `${integration.apiBaseUrl}/oauth2/token`;
  const refreshToken = creds.refresh_token || "";

  try {
    let newToken: string | null = null;

    if (refreshToken) {
      const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json();
        newToken = data.access_token || data.token || data.accessToken;
        if (newToken) {
          const newCreds = {
            ...creds,
            access_token: newToken,
            token: newToken,
            ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
          };
          return {
            patch: { configJson: { ...cfg, credentials: newCreds } },
            description: "Token refreshed via refresh_token grant",
          };
        }
      }
    }

    if (clientId && clientSecret) {
      const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json();
        newToken = data.access_token || data.token || data.accessToken;
        if (newToken) {
          const newCreds = { ...creds, access_token: newToken, token: newToken };
          return {
            patch: { configJson: { ...cfg, credentials: newCreds } },
            description: "Token refreshed via client_credentials grant",
          };
        }
      }
    }
  } catch {
    // token refresh attempt failed silently
  }

  return null;
}

async function strategyApiVersionBump(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const baseUrl = integration.apiBaseUrl || "";
  const bumped = bumpApiVersion(baseUrl);
  if (!bumped || bumped === baseUrl) return null;

  return {
    patch: { apiBaseUrl: bumped },
    description: `Bumped API version in base URL: ${baseUrl} → ${bumped}`,
  };
}

async function strategyAlternateBaseUrl(
  integration: SecurityIntegration,
  attemptIndex: number
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const alternates = PLATFORM_ALTERNATE_URLS[integration.platformKey] || [];
  if (!alternates.length || attemptIndex >= alternates.length) return null;

  const target = alternates[attemptIndex];
  if (target === integration.apiBaseUrl) return null;

  return {
    patch: { apiBaseUrl: target },
    description: `Trying alternate base URL: ${target}`,
  };
}

async function strategyBackoffPollingInterval(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const current = integration.pollingIntervalMinutes || 15;
  const MAX = 240;
  if (current >= MAX) return null;

  const next = Math.min(current * 2, MAX);
  return {
    patch: { pollingIntervalMinutes: next },
    description: `Rate limit backoff: polling interval increased from ${current} to ${next} minutes`,
  };
}

async function strategySSLTolerance(
  integration: SecurityIntegration
): Promise<{ patch: Record<string, any>; description: string } | null> {
  const cfg = getConfigJson(integration);
  if (cfg.sslVerify === false) return null;

  return {
    patch: { configJson: { ...cfg, sslVerify: false } },
    description: "Disabled strict SSL verification for self-signed certificates",
  };
}

// ── AI Diagnosis ───────────────────────────────────────────────────────────

async function runAIDiagnosis(
  integration: SecurityIntegration,
  failureType: HealFailureType,
  errorMessage: string,
  consecutiveFailures: number
): Promise<{ configPatch: Record<string, any>; diagnosis: string; strategy: string } | null> {
  try {
    const ai = createAIClient();
    const cfg = getConfigJson(integration);

    const safeConfig = {
      apiBaseUrl: integration.apiBaseUrl,
      authType: integration.authType,
      pollingIntervalMinutes: integration.pollingIntervalMinutes,
      hasApiKey: !!(getCredentials(integration).api_key || getCredentials(integration).apiKey),
      hasToken: !!(getCredentials(integration).token || getCredentials(integration).access_token),
      hasClientId: !!(getCredentials(integration).clientId || getCredentials(integration).client_id),
      authHeaderStyle: cfg.authHeaderStyle,
      sslVerify: cfg.sslVerify,
      fieldMappings: cfg.fieldMappings,
      endpointOverrides: cfg.endpointOverrides,
    };

    const systemPrompt = `You are a security platform integration expert specializing in API troubleshooting.
You diagnose integration failures between a Security Operations Center (SOC) platform and vendor APIs.
You must return ONLY valid JSON — no markdown, no explanation text, just the JSON object.`;

    const userPrompt = `An integration is failing with the following details:

Platform: ${integration.platformName} (key: ${integration.platformKey})
Category: ${integration.category}
Failure Type: ${failureType}
Error Message: ${errorMessage}
Consecutive Failures: ${consecutiveFailures}
Current Configuration (sanitized, no secrets):
${JSON.stringify(safeConfig, null, 2)}

Based on this failure, diagnose the root cause and provide a precise configuration patch to fix it.

Return ONLY this JSON structure:
{
  "diagnosis": "Brief technical explanation of root cause (1-2 sentences)",
  "strategy": "Name of the healing strategy being applied (e.g., 'field_remapping', 'endpoint_v2_migration', 'bearer_auth_switch')",
  "configPatch": {
    // Fields to MERGE into the integration record. Only include fields that need changing.
    // Valid top-level keys: apiBaseUrl (string), pollingIntervalMinutes (number), authType (string)
    // For configJson changes, nest them under "configJson": { ... }
    // Example for field remapping: "configJson": { "fieldMappings": { "eventId": "id", "severity": "alert_severity" } }
    // Example for endpoint fix:    "apiBaseUrl": "https://api.example.com/v2"
    // Example for auth fix:        "configJson": { "authHeaderStyle": "token" }
    // DO NOT include: credentials, api_key, token, password — those are never in configPatch
  }
}

Be specific and actionable. If the failure type is 'schema_changed', provide the correct field mappings based on common vendor response formats. If it's 'endpoint_changed', suggest the most likely correct endpoint path for this vendor.`;

    const response = await ai.chat.completions.create({
      model: getDefaultModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const jsonStr = raw.startsWith("{") ? raw : raw.replace(/^```json?\n?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.configPatch || typeof parsed.configPatch !== "object") {
      return null;
    }

    return {
      configPatch: parsed.configPatch,
      diagnosis: parsed.diagnosis || "AI diagnosis completed",
      strategy: parsed.strategy || "ai_config_patch",
    };
  } catch (err: any) {
    console.warn(`[Autoheal] AI diagnosis error for integration ${integration.id}:`, err.message);
    return null;
  }
}

// ── Apply Patch & Validate ─────────────────────────────────────────────────

async function applyPatchAndValidate(
  integration: SecurityIntegration,
  patch: Record<string, any>,
  strategy: string,
  failureType: HealFailureType,
  errorMessage: string,
  aiDiagnosis: string | undefined,
  consecutiveFailures: number
): Promise<HealAttemptResult> {
  let patchedIntegration = { ...integration };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "configJson" && typeof value === "object") {
      const existing = getConfigJson(integration);
      (patchedIntegration as any).configJson = { ...existing, ...value };
    } else {
      (patchedIntegration as any)[key] = value;
    }
  }

  const connector = getConnector(patchedIntegration as SecurityIntegration);

  let succeeded = false;
  let message = "";

  if (connector) {
    try {
      const result = await connector.testConnection();
      succeeded = result.success;
      message = result.message;
    } catch (err: any) {
      succeeded = false;
      message = err.message || "Connection test threw an exception";
    }
  } else {
    succeeded = false;
    message = `No connector registered for platform key "${integration.platformKey}" — patch stored but not validated`;
  }

  return {
    integrationId: integration.id,
    platformKey: integration.platformKey,
    failureType,
    strategy,
    succeeded,
    message,
    configPatch: patch,
    aiDiagnosis,
  };
}

// ── Log to DB ─────────────────────────────────────────────────────────────

async function logHealAttempt(
  integration: SecurityIntegration,
  attempt: HealAttemptResult,
  consecutiveFailures: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO integration_heal_logs
         (integration_id, tenant_id, platform_key, platform_name,
          failure_type, error_message, heal_strategy, config_patch,
          succeeded, result_message, ai_diagnosis, consecutive_failures_at_attempt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        integration.id,
        integration.tenantId,
        integration.platformKey,
        integration.platformName,
        attempt.failureType,
        attempt.configPatch?.errorContext || null,
        attempt.strategy,
        JSON.stringify(attempt.configPatch || {}),
        attempt.succeeded,
        attempt.message,
        attempt.aiDiagnosis || null,
        consecutiveFailures,
      ]
    );
  } catch (err: any) {
    console.warn(`[Autoheal] Failed to write heal log for integration ${integration.id}:`, err.message);
  }
}

// ── Update Integration After Heal ─────────────────────────────────────────

async function updateIntegrationAfterHeal(
  integration: SecurityIntegration,
  attempt: HealAttemptResult,
  consecutiveFailures: number
): Promise<void> {
  const now = new Date();

  if (attempt.succeeded && attempt.configPatch) {
    const updateData: Partial<SecurityIntegration> = {
      lastHealAttemptAt: now,
      lastHealStatus: "healed",
      lastHealMessage: `Healed via strategy "${attempt.strategy}": ${attempt.message}`,
      status: "connected",
      lastPollStatus: "success",
      lastPollMessage: `Auto-healed: ${attempt.message}`,
      consecutiveFailures: 0,
    } as any;

    for (const [key, value] of Object.entries(attempt.configPatch)) {
      if (key === "configJson" && typeof value === "object") {
        const existing = getConfigJson(integration);
        (updateData as any).configJson = { ...existing, ...value };
      } else if (key === "apiBaseUrl") {
        updateData.apiBaseUrl = value as string;
      } else if (key === "pollingIntervalMinutes") {
        updateData.pollingIntervalMinutes = value as number;
      } else if (key === "authType") {
        updateData.authType = value as string;
      }
    }

    await storage.updateSecurityIntegration(integration.id, updateData);
    console.log(`[Autoheal] ✓ Integration ${integration.id} (${integration.platformName}) healed via "${attempt.strategy}"`);
  } else {
    await storage.updateSecurityIntegration(integration.id, {
      lastHealAttemptAt: now,
      lastHealStatus: "failed",
      lastHealMessage: `Heal strategy "${attempt.strategy}" failed: ${attempt.message}`,
      consecutiveFailures: consecutiveFailures + 1,
    } as any);
  }
}

// ── Main Heal Orchestrator ─────────────────────────────────────────────────

export async function triggerAutoHeal(
  integrationId: number,
  manualOverride = false
): Promise<HealSummary> {
  const integration = await storage.getSecurityIntegration(integrationId);
  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  if (!integration.autoHealEnabled && !manualOverride) {
    return {
      integrationId,
      platformName: integration.platformName,
      attempts: [],
      finalSuccess: false,
      totalStrategiesTried: 0,
    };
  }

  const errorMessage = integration.lastPollMessage || integration.lastHealMessage || "";
  const failureType = classifyFailure(errorMessage);
  const consecutiveFailures = (integration as any).consecutiveFailures || 0;

  console.log(
    `[Autoheal] Starting heal for integration ${integrationId} (${integration.platformName}) ` +
    `— failure: ${failureType}, consecutive: ${consecutiveFailures}`
  );

  const strategies: Array<{
    name: string;
    fn: () => Promise<{ patch: Record<string, any>; description: string } | null>;
  }> = [];

  switch (failureType) {
    case "auth_failure":
      strategies.push(
        { name: "trim_credentials", fn: () => strategyTrimCredentials(integration) },
        { name: "auth_header_variation", fn: () => strategyAuthHeaderVariation(integration) },
        { name: "token_refresh", fn: () => strategyTokenRefresh(integration) }
      );
      break;

    case "endpoint_changed":
      strategies.push(
        { name: "api_version_bump", fn: () => strategyApiVersionBump(integration) },
        { name: "alternate_base_url_0", fn: () => strategyAlternateBaseUrl(integration, 0) },
        { name: "alternate_base_url_1", fn: () => strategyAlternateBaseUrl(integration, 1) }
      );
      break;

    case "rate_limited":
      strategies.push(
        { name: "backoff_interval", fn: () => strategyBackoffPollingInterval(integration) }
      );
      break;

    case "connectivity":
      strategies.push(
        { name: "alternate_base_url_0", fn: () => strategyAlternateBaseUrl(integration, 0) },
        { name: "alternate_base_url_1", fn: () => strategyAlternateBaseUrl(integration, 1) }
      );
      break;

    case "ssl_error":
      strategies.push(
        { name: "ssl_tolerance", fn: () => strategySSLTolerance(integration) }
      );
      break;

    case "api_version":
      strategies.push(
        { name: "api_version_bump", fn: () => strategyApiVersionBump(integration) },
        { name: "alternate_base_url_0", fn: () => strategyAlternateBaseUrl(integration, 0) }
      );
      break;

    case "schema_changed":
      // Schema changes rely primarily on AI — no rule-based strategy
      break;

    case "unknown":
    default:
      strategies.push(
        { name: "trim_credentials", fn: () => strategyTrimCredentials(integration) }
      );
      break;
  }

  const attempts: HealAttemptResult[] = [];

  for (const strat of strategies) {
    try {
      const result = await strat.fn();
      if (!result) continue;

      const attempt = await applyPatchAndValidate(
        integration,
        result.patch,
        strat.name,
        failureType,
        errorMessage,
        undefined,
        consecutiveFailures
      );

      await logHealAttempt(integration, attempt, consecutiveFailures);
      attempts.push(attempt);

      if (attempt.succeeded) {
        await updateIntegrationAfterHeal(integration, attempt, consecutiveFailures);
        return {
          integrationId,
          platformName: integration.platformName,
          attempts,
          finalSuccess: true,
          totalStrategiesTried: attempts.length,
        };
      }
    } catch (err: any) {
      console.warn(`[Autoheal] Strategy "${strat.name}" threw for integration ${integrationId}:`, err.message);
    }
  }

  // If rule-based strategies didn't work (or we have unknown/schema), try AI diagnosis
  const shouldTryAI = failureType === "unknown" || failureType === "schema_changed" || consecutiveFailures >= 2;

  if (shouldTryAI) {
    try {
      const aiResult = await runAIDiagnosis(integration, failureType, errorMessage, consecutiveFailures);

      if (aiResult && Object.keys(aiResult.configPatch).length > 0) {
        const attempt = await applyPatchAndValidate(
          integration,
          aiResult.configPatch,
          aiResult.strategy,
          failureType,
          errorMessage,
          aiResult.diagnosis,
          consecutiveFailures
        );

        await logHealAttempt(integration, attempt, consecutiveFailures);
        attempts.push(attempt);

        if (attempt.succeeded) {
          await updateIntegrationAfterHeal(integration, attempt, consecutiveFailures);
          return {
            integrationId,
            platformName: integration.platformName,
            attempts,
            finalSuccess: true,
            totalStrategiesTried: attempts.length,
          };
        }

        // Even if the AI patch didn't restore connectivity, save AI diagnosis for operator review
        if (aiResult.diagnosis) {
          await storage.updateSecurityIntegration(integrationId, {
            lastHealAttemptAt: new Date(),
            lastHealStatus: "diagnosis_available",
            lastHealMessage: `AI diagnosis: ${aiResult.diagnosis}`,
          } as any);
        }
      }
    } catch (err: any) {
      console.warn(`[Autoheal] AI diagnosis failed for integration ${integrationId}:`, err.message);
    }
  }

  // All strategies exhausted
  await storage.updateSecurityIntegration(integrationId, {
    lastHealAttemptAt: new Date(),
    lastHealStatus: "exhausted",
    lastHealMessage: `All ${attempts.length} heal strategies exhausted — manual intervention required`,
    consecutiveFailures: consecutiveFailures + 1,
  } as any);

  return {
    integrationId,
    platformName: integration.platformName,
    attempts,
    finalSuccess: false,
    totalStrategiesTried: attempts.length,
  };
}

// ── Background Monitor ─────────────────────────────────────────────────────

let monitorInterval: ReturnType<typeof setInterval> | null = null;
const MONITOR_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const MIN_CONSECUTIVE_FOR_BACKGROUND_HEAL = 2;
const HEAL_COOLDOWN_MS = 20 * 60 * 1000; // don't re-heal more than once per 20 min

async function runBackgroundHealCycle(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - HEAL_COOLDOWN_MS);
    const rows = await pool.query<{
      id: number;
      platform_name: string;
      consecutive_failures: number;
      last_heal_attempt_at: Date | null;
    }>(
      `SELECT id, platform_name, consecutive_failures, last_heal_attempt_at
       FROM security_integrations
       WHERE last_poll_status = 'error'
         AND auto_heal_enabled = true
         AND is_enabled = true
         AND deleted_at IS NULL
         AND consecutive_failures >= $1
         AND (last_heal_attempt_at IS NULL OR last_heal_attempt_at < $2)
       ORDER BY consecutive_failures DESC
       LIMIT 20`,
      [MIN_CONSECUTIVE_FOR_BACKGROUND_HEAL, cutoff]
    );

    if (rows.rows.length === 0) return;

    console.log(`[Autoheal Monitor] ${rows.rows.length} integration(s) eligible for background heal`);

    for (const row of rows.rows) {
      try {
        const summary = await triggerAutoHeal(row.id, false);
        console.log(
          `[Autoheal Monitor] Integration ${row.id} (${row.platform_name}): ` +
          `${summary.finalSuccess ? "HEALED ✓" : `failed (${summary.totalStrategiesTried} strategies tried)`}`
        );
      } catch (err: any) {
        console.warn(`[Autoheal Monitor] Error healing integration ${row.id}:`, err.message);
      }
      // Small delay between integrations to avoid stampede
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err: any) {
    console.error("[Autoheal Monitor] Cycle error:", err.message);
  }
}

export function startAutoHealMonitor(): void {
  if (monitorInterval) return;
  console.log("[Autoheal Monitor] Started — checking every 10 minutes for failed integrations");
  // Delay first run by 90 seconds to let startup settle
  setTimeout(async () => {
    await runBackgroundHealCycle().catch((e) =>
      console.warn("[Autoheal Monitor] First run error:", e.message)
    );
  }, 90_000);
  monitorInterval = setInterval(() => {
    runBackgroundHealCycle().catch((e) =>
      console.warn("[Autoheal Monitor] Scheduled run error:", e.message)
    );
  }, MONITOR_INTERVAL_MS);
}

export function stopAutoHealMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

// ── On-Poll Failure Hook ───────────────────────────────────────────────────

/**
 * Called immediately after any integration poll/test failure.
 * Increments consecutive_failures and optionally triggers a quick heal
 * (only if failures >= 3 and autoheal is enabled — avoids thrashing on transient errors).
 */
export async function onIntegrationFailure(
  integrationId: number,
  errorMessage: string
): Promise<void> {
  try {
    const integration = await storage.getSecurityIntegration(integrationId);
    if (!integration) return;

    const current = (integration as any).consecutiveFailures || 0;
    const next = current + 1;

    await storage.updateSecurityIntegration(integrationId, {
      consecutiveFailures: next,
    } as any);

    // Trigger immediate heal if >= 3 failures and autoheal enabled
    if (next >= 3 && (integration as any).autoHealEnabled !== false) {
      const cooldown = new Date(Date.now() - HEAL_COOLDOWN_MS);
      const lastHeal = (integration as any).lastHealAttemptAt as Date | null;
      if (!lastHeal || lastHeal < cooldown) {
        console.log(`[Autoheal] Triggering immediate heal for integration ${integrationId} (${next} consecutive failures)`);
        setImmediate(() => {
          triggerAutoHeal(integrationId, false).catch((e) =>
            console.warn(`[Autoheal] Immediate heal error for ${integrationId}:`, e.message)
          );
        });
      }
    }
  } catch (err: any) {
    console.warn(`[Autoheal] onIntegrationFailure error for ${integrationId}:`, err.message);
  }
}

/**
 * Called when a poll/test succeeds — resets consecutive_failures counter.
 */
export async function onIntegrationSuccess(integrationId: number): Promise<void> {
  try {
    await storage.updateSecurityIntegration(integrationId, {
      consecutiveFailures: 0,
    } as any);
  } catch (err: any) {
    console.warn(`[Autoheal] onIntegrationSuccess error for ${integrationId}:`, err.message);
  }
}

// ── Heal History Query ─────────────────────────────────────────────────────

export async function getHealLog(
  integrationId: number,
  limit = 50
): Promise<any[]> {
  const rows = await pool.query(
    `SELECT * FROM integration_heal_logs
     WHERE integration_id = $1
     ORDER BY attempted_at DESC
     LIMIT $2`,
    [integrationId, limit]
  );
  return rows.rows;
}

export async function getHealStats(tenantId: number): Promise<{
  totalAttempts: number;
  successfulHeals: number;
  failedHeals: number;
  integrationsHealed: number;
  byFailureType: Record<string, { attempts: number; successes: number }>;
}> {
  const rows = await pool.query(
    `SELECT failure_type, succeeded, COUNT(*) as cnt,
            COUNT(DISTINCT integration_id) FILTER (WHERE succeeded) as healed_integrations
     FROM integration_heal_logs
     WHERE tenant_id = $1
     GROUP BY failure_type, succeeded`,
    [tenantId]
  );

  const byFailureType: Record<string, { attempts: number; successes: number }> = {};
  let totalAttempts = 0;
  let successfulHeals = 0;
  let integrationsHealed = 0;

  for (const row of rows.rows) {
    const ft = row.failure_type;
    if (!byFailureType[ft]) byFailureType[ft] = { attempts: 0, successes: 0 };
    const cnt = parseInt(row.cnt, 10);
    byFailureType[ft].attempts += cnt;
    totalAttempts += cnt;
    if (row.succeeded) {
      byFailureType[ft].successes += cnt;
      successfulHeals += cnt;
      integrationsHealed += parseInt(row.healed_integrations, 10) || 0;
    }
  }

  return {
    totalAttempts,
    successfulHeals,
    failedHeals: totalAttempts - successfulHeals,
    integrationsHealed,
    byFailureType,
  };
}
