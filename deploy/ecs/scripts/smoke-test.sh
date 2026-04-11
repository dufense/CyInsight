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
##############################################################################

set -euo pipefail

ALB_HOST="${ALB_DNS:-}"
WAIT_TIMEOUT=180
SCHEME="https"
INSECURE_FLAG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --host)     ALB_HOST="$2";     shift 2 ;;
    --timeout)  WAIT_TIMEOUT="$2"; shift 2 ;;
    --scheme)   SCHEME="$2";       shift 2 ;;
    --insecure) INSECURE_FLAG="-k"; shift ;;
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

# ── Run all checks ────────────────────────────────────────────────────────────
log "=== Cyber Command Center — Smoke Tests ==="
log "Target: ${BASE_URL}"
log ""

check_healthz
check_auth_endpoint
check_static_assets
check_redirect

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
