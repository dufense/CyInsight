/**
 * Central mapping from log_source values (stored in security_events.log_source
 * and incidents.detection_source) to the platform_key in security_integrations.
 *
 * This is the single source of truth used by all query functions to enforce
 * integration-aware filtering.
 */
export const LOG_SOURCE_TO_PLATFORM_KEY: Record<string, string> = {
  "Cynet 360":  "cynet",
  "Skyhigh SSE": "skyhigh_sse",
  "FortiNAC":   "fortinac",
  "FortiGate":  "fortigate",
};

/**
 * Inline SQL CASE WHEN expression that maps a log_source / detection_source
 * value to the corresponding platform_key in security_integrations.
 *
 * Returns NULL for any unrecognised source — the EXISTS guard will then always
 * evaluate to FALSE for that row, which is the safe default.
 */
export function buildSourceCaseSql(sourceCol: string): string {
  const branches = Object.entries(LOG_SOURCE_TO_PLATFORM_KEY)
    .map(([src, key]) => `WHEN '${src}' THEN '${key}'`)
    .join("\n          ");
  return `CASE ${sourceCol}\n          ${branches}\n          ELSE NULL\n        END`;
}

/**
 * Builds a raw SQL EXISTS predicate that enforces per-row, per-tenant
 * integration-awareness.
 *
 * For every row examined, the predicate checks whether that specific row's
 * tenant currently has the integration that produced the log_source /
 * detection_source value connected.  This avoids the multi-tenant union
 * problem: a source connected in tenant A never unlocks rows for tenant B.
 *
 * @param tenantCol - Unquoted column expression for tenant_id, e.g. "tenant_id"
 * @param sourceCol - Unquoted column expression for the source, e.g. "log_source"
 */
export function buildIntegrationGuardSql(tenantCol: string, sourceCol: string): string {
  return `EXISTS (
      SELECT 1
      FROM   security_integrations _ig
      WHERE  _ig.tenant_id  = ${tenantCol}
        AND  _ig.status     = 'connected'
        AND  _ig.deleted_at IS NULL
        AND  _ig.platform_key = ${buildSourceCaseSql(sourceCol)}
    )`;
}

/**
 * Given a set of connected platform_key values, returns the log_source values
 * that are covered by those integrations.  Used only for display/reporting, not
 * as a primary security guard.
 */
export function getLogSourcesForPlatformKeys(platformKeys: string[]): string[] {
  const keySet = new Set(platformKeys);
  return Object.entries(LOG_SOURCE_TO_PLATFORM_KEY)
    .filter(([, pk]) => keySet.has(pk))
    .map(([ls]) => ls);
}
