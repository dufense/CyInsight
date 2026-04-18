#!/usr/bin/env bash
##############################################################################
# smoke-test.sh — Post-deployment smoke test for Cyber Command Center
#
# Verifies the management plane is healthy after a deployment.
# Exits non-zero if any check fails, causing CI to fail and preventing
# a bad deployment from being marked successful.
#
# Usage:
#   export ALB_DNS=ccc-management-alb-production-123456789.ap-south-1.elb.amazonaws.com
#   chmod +x deploy/ecs/scripts/smoke-test.sh
#   ./deploy/ecs/scripts/smoke-test.sh
#
#   # Or pass the DNS name directly:
#   ./deploy/ecs/scripts/smoke-test.sh --host ccc-management-alb-production.amazonaws.com
#
# Options:
#   --host <dns>        ALB DNS name or full URL (overrides ALB_DNS env var)
#   --timeout <secs>    Max seconds to wait for /healthz (default: 180)
#   --scheme <http|https>  Default: https
#   --insecure          Pass -k to curl (skip TLS verification; useful if using
#                       the raw ALB DNS without a cert)
#   --clickhouse        Run the post-activation ClickHouse verification section
#                       (connection, mirrored writes, events fast-path).
#   --admin-cookie <c>  Session cookie value for the protected admin endpoints
#                       (e.g. "connect.sid=s%3A..."). Required by --clickhouse.
#                       Can also be supplied via ADMIN_SESSION_COOKIE env var.
#   --tenant-id <id>    Tenant ID used to probe the events fast-path endpoint.
#                       Required by --clickhouse. Also via TENANT_ID env var.
##############################################################################

set -euo pipefail

ALB_HOST="${ALB_DNS:-}"
WAIT_TIMEOUT=180
SCHEME="https"
INSECURE_FLAG=""
RUN_CLICKHOUSE="false"
ADMIN_COOKIE="${ADMIN_SESSION_COOKIE:-}"
TENANT_ID="${TENANT_ID:-}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --host)         ALB_HOST="$2";      shift 2 ;;
    --timeout)      WAIT_TIMEOUT="$2";  shift 2 ;;
    --scheme)       SCHEME="$2";        shift 2 ;;
    --insecure)     INSECURE_FLAG="-k"; shift ;;
    --clickhouse)   RUN_CLICKHOUSE="true"; shift ;;
    --admin-cookie) ADMIN_COOKIE="$2";  shift 2 ;;
    --tenant-id)    TENANT_ID="$2";     shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "${ALB_HOST}" ]]; then
  echo "Provide the ALB DNS name via --host <dns> or export ALB_DNS=<dns>"
  exit 1
fi

# Strip scheme if user passed a full URL
ALB_HOST="${ALB_HOST#https://}"
ALB_HOST="${ALB_HOST#http://}"
ALB_HOST="${ALB_HOST%/}"

BASE_URL="${SCHEME}://${ALB_HOST}"

PASS=0
FAIL=0

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "  [PASS] $*"; ((PASS++)) || true; }
fail() { echo "  [FAIL] $*" >&2; ((FAIL++)) || true; }

# ── Wait for /healthz ─────────────────────────────────────────────────────────
wait_for_health() {
  local url="${BASE_URL}/healthz"
  local deadline=$((SECONDS + WAIT_TIMEOUT))
  local attempt=0

  log "Waiting for ${url} (timeout: ${WAIT_TIMEOUT}s)..."

  while [[ ${SECONDS} -lt ${deadline} ]]; do
    ((attempt++)) || true
    local http_code
    http_code=$(curl --silent --output /dev/null \
                     --write-out "%{http_code}" \
                     --connect-timeout 5 \
                     --max-time 10 \
                     ${INSECURE_FLAG} \
                     "${url}" 2>/dev/null || echo "000")

    if [[ "${http_code}" == "200" ]]; then
      log "  /healthz returned 200 after ${attempt} attempt(s)"
      return 0
    fi

    log "  Attempt ${attempt}: HTTP ${http_code} — retrying in 10s..."
    sleep 10
  done

  return 1
}

# ── Individual checks ─────────────────────────────────────────────────────────

check_healthz() {
  log "[1/4] Checking /healthz returns HTTP 200..."
  if wait_for_health; then
    ok "/healthz → 200 OK"
  else
    fail "/healthz did not return 200 within ${WAIT_TIMEOUT}s"
  fi
}

check_auth_endpoint() {
  log "[2/4] Checking /api/auth/user returns HTTP 401 (auth protection is enforced)..."
  local http_code
  http_code=$(curl --silent --output /dev/null \
                   --write-out "%{http_code}" \
                   --connect-timeout 5 \
                   --max-time 10 \
                   ${INSECURE_FLAG} \
                   "${BASE_URL}/api/auth/user" 2>/dev/null || echo "000")
  if [[ "${http_code}" == "401" ]]; then
    ok "/api/auth/user → 401 Unauthorized (API running, authentication required)"
  else
    fail "/api/auth/user → ${http_code} (EXPECTED 401 — unauthenticated requests must be rejected; got ${http_code})"
  fi
}

check_static_assets() {
  log "[3/4] Checking that the React SPA index.html is served..."
  local http_code content_type
  http_code=$(curl --silent --output /dev/null \
                   --write-out "%{http_code}" \
                   --connect-timeout 5 \
                   --max-time 10 \
                   ${INSECURE_FLAG} \
                   "${BASE_URL}/" 2>/dev/null || echo "000")
  if [[ "${http_code}" == "200" ]]; then
    ok "/ → 200 OK (SPA served)"
  else
    fail "/ → ${http_code} (expected 200)"
  fi
}

check_redirect() {
  log "[4/4] Checking HTTP → HTTPS redirect (if applicable)..."
  if [[ "${SCHEME}" != "https" ]]; then
    log "  Skipped (scheme is not https)"
    return
  fi

  local http_base="http://${ALB_HOST}"
  local http_code
  http_code=$(curl --silent --output /dev/null \
                   --write-out "%{http_code}" \
                   --connect-timeout 5 \
                   --max-time 10 \
                   --no-location \
                   "${http_base}/" 2>/dev/null || echo "000")
  if [[ "${http_code}" == "301" || "${http_code}" == "302" ]]; then
    ok "HTTP → HTTPS redirect active (${http_code})"
  elif [[ "${http_code}" == "000" ]]; then
    log "  HTTP port not reachable (ALB may be HTTPS-only) — skipped"
  else
    fail "HTTP redirect: unexpected response ${http_code} (expected 301/302)"
  fi
}

# ── ClickHouse activation verification ───────────────────────────────────────
# Confirms in production that:
#   1. The hot-tier database is connected (status=connected, version present).
#   2. Mirrored writes are working (recentInsertRatePerSec > 0 over the last 60s).
#   3. The events screen reads via the fast path (source=clickhouse_olap).
# Requires an admin session cookie + tenant id because the underlying endpoints
# are auth-gated to super-admin / platform-admin.
check_clickhouse() {
  log "[CH 1/3] Checking /api/platform/health/clickhouse (hot-tier connection)..."
  if [[ -z "${ADMIN_COOKIE}" ]]; then
    fail "ClickHouse checks require --admin-cookie or ADMIN_SESSION_COOKIE"
    return
  fi

  local body http_code status enabled version insert_rate
  body=$(curl --silent --show-error \
              --connect-timeout 5 --max-time 15 \
              ${INSECURE_FLAG} \
              -H "Cookie: ${ADMIN_COOKIE}" \
              --write-out "\n__HTTP_CODE__%{http_code}" \
              "${BASE_URL}/api/platform/health/clickhouse" 2>/dev/null || echo "__HTTP_CODE__000")
  http_code="${body##*__HTTP_CODE__}"
  body="${body%__HTTP_CODE__*}"

  if [[ "${http_code}" != "200" ]]; then
    fail "/api/platform/health/clickhouse → HTTP ${http_code} (expected 200; cookie expired or insufficient role?)"
    return
  fi

  status=$(echo "${body}"   | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  enabled=$(echo "${body}"  | sed -n 's/.*"enabled":\(true\|false\).*/\1/p')
  version=$(echo "${body}"  | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  insert_rate=$(echo "${body}" | sed -n 's/.*"recentInsertRatePerSec":\([0-9.]*\).*/\1/p')

  if [[ "${enabled}" != "true" ]]; then
    fail "ClickHouse not enabled in production (enabled=${enabled:-unknown}). Did activate-clickhouse.sh --redeploy run?"
    return
  fi
  if [[ "${status}" != "connected" ]]; then
    fail "ClickHouse status=${status:-unknown} (expected 'connected'). Body: ${body:0:200}"
    return
  fi
  ok "ClickHouse connected — v${version:-unknown}"

  log "[CH 2/3] Checking mirrored-write rate over the last 60s..."
  if [[ -z "${insert_rate}" ]]; then
    fail "recentInsertRatePerSec missing from /api/platform/health/clickhouse response"
  elif awk "BEGIN { exit !(${insert_rate} > 0) }"; then
    ok "Mirrored writes active — ${insert_rate} rows/s"
  else
    fail "Mirrored writes look idle — recentInsertRatePerSec=${insert_rate} over last 60s. This may be a real wiring failure (check ECS task logs for '[Storage] ClickHouse write error') OR simply a quiet traffic window. Re-run after generating ingest activity if your environment has low baseline traffic."
  fi

  log "[CH 3/3] Checking events screen reads via the fast path..."
  if [[ -z "${TENANT_ID}" ]]; then
    fail "Skipped events fast-path check — provide --tenant-id (or TENANT_ID env var)"
    return
  fi

  local events_body events_code source_field
  events_body=$(curl --silent --show-error \
                     --connect-timeout 5 --max-time 15 \
                     ${INSECURE_FLAG} \
                     -H "Cookie: ${ADMIN_COOKIE}" \
                     --write-out "\n__HTTP_CODE__%{http_code}" \
                     "${BASE_URL}/api/events/${TENANT_ID}?page=1&pageSize=1" 2>/dev/null || echo "__HTTP_CODE__000")
  events_code="${events_body##*__HTTP_CODE__}"
  events_body="${events_body%__HTTP_CODE__*}"

  if [[ "${events_code}" != "200" ]]; then
    fail "/api/events/${TENANT_ID} → HTTP ${events_code} (expected 200)"
    return
  fi

  source_field=$(echo "${events_body}" | sed -n 's/.*"source":"\([^"]*\)".*/\1/p')
  if [[ "${source_field}" == "clickhouse_olap" ]]; then
    ok "Events screen served from ClickHouse fast path (source=clickhouse_olap)"
  else
    fail "Events screen NOT on fast path — source='${source_field:-unset}' (expected 'clickhouse_olap'). Check ClickHouse reachability from the management plane."
  fi
}

# ── Run all checks ────────────────────────────────────────────────────────────
log "=== Cyber Command Center — Smoke Tests ==="
log "Target: ${BASE_URL}"
log ""

check_healthz
check_auth_endpoint
check_static_assets
check_redirect

if [[ "${RUN_CLICKHOUSE}" == "true" ]]; then
  log ""
  log "=== ClickHouse activation verification ==="
  check_clickhouse
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
log "────────────────────────────────────────────────────────"
log "Results: ${PASS} passed, ${FAIL} failed"

if [[ ${FAIL} -gt 0 ]]; then
  log ""
  log "Smoke tests FAILED. The deployment may be unhealthy."
  log "Check CloudWatch logs at: /ecs/ccc-management-plane-${ENVIRONMENT:-production}"
  exit 1
fi

log ""
log "╔══════════════════════════════════════════════════════╗"
log "║  All smoke tests passed. Deployment looks healthy!   ║"
log "╚══════════════════════════════════════════════════════╝"
