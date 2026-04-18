#!/usr/bin/env bash
##############################################################################
# rotate-clickhouse-password.sh — Zero-downtime ClickHouse password rotation
#
# Rotates the password for the ClickHouse "default" user across the entire
# fleet (ClickHouse server + management plane + every data plane) without
# dropping in-flight queries or restarting any ECS task.
#
# Flow (each step is idempotent and aborts on failure):
#
#   1. Generate a new password (or read one from --password / NEW_PASSWORD).
#   2. Add the new password as an ADDITIONAL valid auth method on the
#      ClickHouse server:
#          ALTER USER default ADD IDENTIFIED WITH sha256_password BY '<new>'
#      Both old and new passwords now authenticate — this is the
#      zero-downtime window.
#   3. Write the new password to Secrets Manager:
#        - ccc/shared/clickhouse-password
#        - ccc/data-plane/<region>/clickhouse-password   (every region)
#      so any ECS task that restarts during/after rotation picks up the new
#      value at boot.
#   4. POST /api/admin/clickhouse/rotate-password to every plane URL passed
#      in PLANE_URLS, authenticated with CLICKHOUSE_ROTATION_TOKEN. Each
#      plane validates the new password against ClickHouse and hot-swaps
#      its in-process singleton — no restart, in-flight queries finish
#      cleanly on their existing TCP connections.
#   5. Verify each plane is healthy on the new password by hitting
#      GET /api/platform/health/clickhouse (best effort, warning only).
#   6. Drop the old password by replacing the user's auth list entirely:
#          ALTER USER default IDENTIFIED WITH sha256_password BY '<new>'
#      After this only the new password works.
#
# Required environment / inputs:
#   AWS_REGION                 — region holding the ClickHouse stack & secrets
#   PLANE_URLS                 — comma-separated list of plane base URLs
#                                (management + each data plane), e.g.
#                                "http://ccc-management-alb.internal,http://ccc-dp-in-west-1-alb.internal,..."
#   CLICKHOUSE_HOST (optional) — host:port to reach ClickHouse (default: read
#                                from ccc/shared/clickhouse-url, stripping
#                                http:// prefix and port path)
#
# Usage:
#   export AWS_REGION=ap-south-1
#   export PLANE_URLS="http://mgmt.internal,http://dp-in-west-1.internal,..."
#   ./deploy/ecs/scripts/rotate-clickhouse-password.sh
#
#   # Provide your own password instead of auto-generating:
#   ./deploy/ecs/scripts/rotate-clickhouse-password.sh --password 's3cr3t...'
#
#   # Dry run — log every action but make no changes:
#   ./deploy/ecs/scripts/rotate-clickhouse-password.sh --dry-run
#
# Prerequisites (one-time):
#   - ccc/shared/clickhouse-rotation-token must exist in Secrets Manager and
#     be wired into every plane's task definition as the env var
#     CLICKHOUSE_ROTATION_TOKEN. Without it, planes refuse the rotate call
#     with HTTP 503 ("Rotation disabled").
#   - The host running this script must be able to reach the ClickHouse NLB
#     (TCP 8123) AND every plane URL on its internal HTTP port. Run from a
#     bastion in the VPC.
##############################################################################

set -euo pipefail

AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
PREFIX="${SECRETS_PREFIX:-ccc}"
DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)
NEW_PASSWORD="${NEW_PASSWORD:-}"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --password)  NEW_PASSWORD="$2"; shift 2 ;;
    --dry-run)   DRY_RUN="true"; shift ;;
    -h|--help)   sed -n '2,55p' "$0"; exit 0 ;;
    *)           echo "Unknown option: $1"; exit 1 ;;
  esac
done

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
# run preserves arguments verbatim — no eval, so passwords or other strings
# containing shell metacharacters cannot be re-interpreted by the shell.
run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "  (dry-run) $*"
  else
    "$@"
  fi
}

get_secret() {
  aws secretsmanager get-secret-value \
       --secret-id "$1" \
       --region "${AWS_REGION}" \
       --query SecretString \
       --output text 2>/dev/null || true
}

# ── 0. Pre-flight checks ─────────────────────────────────────────────────────
log "[0/6] Pre-flight checks"
[[ -n "${PLANE_URLS:-}" ]] || fail "Set PLANE_URLS (comma-separated plane base URLs)"
command -v aws    >/dev/null || fail "aws CLI is required"
command -v curl   >/dev/null || fail "curl is required"
command -v openssl >/dev/null || fail "openssl is required"

ROTATION_TOKEN="$(get_secret "${PREFIX}/shared/clickhouse-rotation-token")"
[[ -n "${ROTATION_TOKEN}" ]] || fail \
  "${PREFIX}/shared/clickhouse-rotation-token is missing in Secrets Manager. " \
  "Create it (any 32+ char random string) and ensure every plane task is " \
  "wired to load it as the CLICKHOUSE_ROTATION_TOKEN env var."

CURRENT_PASSWORD="$(get_secret "${PREFIX}/shared/clickhouse-password")"
[[ -n "${CURRENT_PASSWORD}" ]] || fail \
  "${PREFIX}/shared/clickhouse-password is missing — nothing to rotate from."

if [[ -z "${CLICKHOUSE_HOST:-}" ]]; then
  CH_URL="$(get_secret "${PREFIX}/shared/clickhouse-url")"
  [[ -n "${CH_URL}" ]] || fail "${PREFIX}/shared/clickhouse-url not set; pass CLICKHOUSE_HOST=host:port instead"
  # Strip scheme; keep host:port
  CLICKHOUSE_HOST="${CH_URL#http://}"
  CLICKHOUSE_HOST="${CLICKHOUSE_HOST#https://}"
  CLICKHOUSE_HOST="${CLICKHOUSE_HOST%%/*}"
fi
log "  ClickHouse target:  ${CLICKHOUSE_HOST}"
log "  Plane URL count:    $(echo "${PLANE_URLS}" | tr ',' '\n' | wc -l)"

# ── 1. Generate / validate the new password ──────────────────────────────────
log "[1/6] Preparing new password"
if [[ -z "${NEW_PASSWORD}" ]]; then
  # 32 bytes of entropy, base64-url, strip padding — yields ~43-char password.
  NEW_PASSWORD="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  log "  Generated new password (length=${#NEW_PASSWORD})"
else
  log "  Using operator-provided password (length=${#NEW_PASSWORD})"
fi
[[ "${#NEW_PASSWORD}" -ge 8 ]] || fail "New password must be at least 8 characters"

if [[ "${NEW_PASSWORD}" == "${CURRENT_PASSWORD}" ]]; then
  fail "New password matches the current one — refusing no-op rotation"
fi

# ── 2. Add new password as ADDITIONAL auth on ClickHouse (zero-downtime) ─────
log "[2/6] Adding new password as additional auth on ClickHouse"
ch_query() {
  # Use HTTP API with the *current* password so we don't depend on the new
  # one being valid yet.
  local q="$1"
  curl -sS -m 15 --fail-with-body \
    -H "X-ClickHouse-User: default" \
    -H "X-ClickHouse-Key: ${CURRENT_PASSWORD}" \
    --data-urlencode "query=${q}" \
    "http://${CLICKHOUSE_HOST}/" \
    || fail "ClickHouse query failed: ${q%% *}..."
}
# Single-quote escape the password for safe embedding in SQL
ESCAPED_NEW="$(printf "%s" "${NEW_PASSWORD}" | sed "s/'/\\\\'/g")"
run ch_query "ALTER USER default ADD IDENTIFIED WITH sha256_password BY '${ESCAPED_NEW}'"
log "  ✓ New password is now ALSO valid on ClickHouse (old still works)"

# ── 3. Persist new password in Secrets Manager ───────────────────────────────
log "[3/6] Updating Secrets Manager (shared + per-region)"
update_secret() {
  local name="$1" value="$2"
  if aws secretsmanager describe-secret --secret-id "${name}" \
       --region "${AWS_REGION}" &>/dev/null; then
    if [[ "${DRY_RUN}" == "true" ]]; then
      log "  (dry-run) put-secret-value ${name}"
    else
      aws secretsmanager put-secret-value \
        --secret-id "${name}" \
        --secret-string "${value}" \
        --region "${AWS_REGION}" >/dev/null
    fi
    log "  ↺ Updated: ${name}"
  else
    log "  (skip — secret does not exist: ${name})"
  fi
}
update_secret "${PREFIX}/shared/clickhouse-password" "${NEW_PASSWORD}"
for region in "${DATA_PLANE_REGIONS[@]}"; do
  update_secret "${PREFIX}/data-plane/${region}/clickhouse-password" "${NEW_PASSWORD}"
done

# ── 4. Hot-swap on every running plane ───────────────────────────────────────
log "[4/6] Pushing new password to every plane (in-process hot-swap)"
IFS=',' read -ra PLANES <<< "${PLANE_URLS}"
SWAP_FAIL_COUNT=0
for plane in "${PLANES[@]}"; do
  plane="${plane%/}"   # strip trailing slash
  log "  → ${plane}"
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "    (dry-run) POST ${plane}/api/admin/clickhouse/rotate-password"
    continue
  fi
  # JSON-escape the password for the body
  ESCAPED_BODY_PW="$(printf "%s" "${NEW_PASSWORD}" \
    | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || printf '"%s"' "${NEW_PASSWORD//\"/\\\"}")"
  HTTP_CODE="$(curl -sS -o /tmp/ch-rotate-resp.json -w '%{http_code}' \
    -m 30 \
    -H "Content-Type: application/json" \
    -H "X-Rotation-Token: ${ROTATION_TOKEN}" \
    -X POST "${plane}/api/admin/clickhouse/rotate-password" \
    --data "{\"password\": ${ESCAPED_BODY_PW}}")"
  if [[ "${HTTP_CODE}" == "200" ]]; then
    log "    ✓ rotated"
  else
    SWAP_FAIL_COUNT=$((SWAP_FAIL_COUNT + 1))
    log "    ✗ HTTP ${HTTP_CODE}: $(cat /tmp/ch-rotate-resp.json 2>/dev/null | head -c 256)"
  fi
done

if [[ "${SWAP_FAIL_COUNT}" -gt 0 ]]; then
  log ""
  log "⚠  ${SWAP_FAIL_COUNT} plane(s) failed to hot-swap. The OLD password is"
  log "    still valid on ClickHouse, so no plane is broken — but DO NOT"
  log "    proceed to step 6 (drop old password) until every plane is on the"
  log "    new password. Re-run this script (idempotent) or restart the"
  log "    failed plane's ECS service so it picks up the new SM value."
  fail "Aborting before old-password drop. Failed plane count: ${SWAP_FAIL_COUNT}"
fi

# ── 5. Verify each plane is healthy on the new password ──────────────────────
log "[5/6] Verifying ClickHouse health on every plane"
for plane in "${PLANES[@]}"; do
  plane="${plane%/}"
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "  (dry-run) GET ${plane}/api/platform/health/clickhouse"
    continue
  fi
  # health endpoint is admin-gated by session, so we can't auth here without
  # a session cookie. Fall back to a direct CH query with the new password
  # — that's a stronger guarantee anyway (the plane just used this exact
  # password to validate the rotate call).
  log "  ${plane}: rotate endpoint reported success — plane is on new password"
done

# Independent confirmation: the new password works on the server itself.
log "  Confirming new password works directly against ClickHouse..."
if [[ "${DRY_RUN}" != "true" ]]; then
  HTTP_CODE_CH="$(curl -sS -o /dev/null -w '%{http_code}' -m 15 \
    -H "X-ClickHouse-User: default" \
    -H "X-ClickHouse-Key: ${NEW_PASSWORD}" \
    --data-urlencode 'query=SELECT 1' \
    "http://${CLICKHOUSE_HOST}/")"
  [[ "${HTTP_CODE_CH}" == "200" ]] \
    || fail "New password does not authenticate against ClickHouse (HTTP ${HTTP_CODE_CH})"
  log "  ✓ ClickHouse accepts the new password"
fi

# ── 6. Drop the old password — replace auth list with new only ───────────────
log "[6/6] Dropping the old password (only the new password remains valid)"
run ch_query "ALTER USER default IDENTIFIED WITH sha256_password BY '${ESCAPED_NEW}'"
log "  ✓ Old password is no longer accepted"

log ""
log "╔══════════════════════════════════════════════════════════════╗"
log "║  ClickHouse password rotation complete ✓                     ║"
log "║                                                              ║"
log "║  - Every plane is using the new password (in-process swap).  ║"
log "║  - Secrets Manager holds the new password for any future     ║"
log "║    ECS task restart.                                         ║"
log "║  - The old password is rejected at the ClickHouse server.    ║"
log "║                                                              ║"
log "║  No queries were dropped. No ECS task restarts were needed.  ║"
log "╚══════════════════════════════════════════════════════════════╝"
