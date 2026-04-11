#!/usr/bin/env bash
##############################################################################
# Cyber Command Center — Security Audit Script
#
# Performs automated security checks:
#   1. HTTP Security Headers
#   2. Authentication & Brute Force Protection
#   3. Rate Limiting
#   4. Common Injection Patterns
#   5. CSRF & Session Security
#   6. Sensitive Information Exposure
#   7. TLS Configuration (if HTTPS)
#
# Usage:
#   chmod +x tests/security/security-audit.sh
#   BASE_URL=http://localhost:5000 ./tests/security/security-audit.sh
#   BASE_URL=https://ccc.internal.corp ./tests/security/security-audit.sh
##############################################################################

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-Admin@123}"

PASS=0
FAIL=0
WARN=0
RESULTS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

pass() { PASS=$((PASS+1)); RESULTS+=("  ${GREEN}✓ PASS${NC}  $1"); echo -e "  ${GREEN}✓ PASS${NC}  $1"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("  ${RED}✗ FAIL${NC}  $1"); echo -e "  ${RED}✗ FAIL${NC}  $1"; }
warn() { WARN=$((WARN+1)); RESULTS+=("  ${YELLOW}⚠ WARN${NC}  $1"); echo -e "  ${YELLOW}⚠ WARN${NC}  $1"; }
section() { echo -e "\n${BOLD}${BLUE}══ $1 ══${NC}"; }

echo -e "\n${BOLD}Cyber Command Center — Security Audit${NC}"
echo -e "Target: ${BASE_URL}"
echo -e "$(date)\n"

LOGIN_RESP=$(curl -s -c /tmp/ccc_audit_cookies.txt -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" \
  -w "\n%{http_code}")
LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | head -n -1)

if [ "$LOGIN_STATUS" = "200" ]; then
  pass "Authentication: Login with valid credentials returns 200"
else
  fail "Authentication: Login with valid credentials returned $LOGIN_STATUS (expected 200)"
fi

# ─── 1. Security Headers ─────────────────────────────────────────────────────
section "HTTP Security Headers"

HEADERS=$(curl -sI "${BASE_URL}/api/auth/user" -b /tmp/ccc_audit_cookies.txt)

check_header() {
  local name="$1"; local pattern="$2"
  if echo "$HEADERS" | grep -qi "$pattern"; then
    pass "Header present: $name"
  else
    fail "Header missing: $name"
  fi
}

check_header "X-Content-Type-Options" "x-content-type-options"
check_header "X-Frame-Options" "x-frame-options"
check_header "Strict-Transport-Security" "strict-transport-security"
check_header "Content-Security-Policy" "content-security-policy"
check_header "Referrer-Policy" "referrer-policy"
check_header "Permissions-Policy" "permissions-policy"

if echo "$HEADERS" | grep -qi "x-powered-by"; then
  fail "Server identity exposed: X-Powered-By header present"
else
  pass "Server identity: X-Powered-By header suppressed"
fi

if echo "$HEADERS" | grep -qi "server: apache\|server: nginx\|server: iis"; then
  warn "Server header reveals technology stack"
else
  pass "Server header: does not reveal technology stack"
fi

# ─── 2. Authentication Security ───────────────────────────────────────────────
section "Authentication & Session Security"

BAD_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong_password_123"}')

if [ "$BAD_LOGIN" = "401" ] || [ "$BAD_LOGIN" = "400" ]; then
  pass "Invalid credentials: Returns $BAD_LOGIN (non-200)"
else
  fail "Invalid credentials: Returns $BAD_LOGIN (should be 401)"
fi

SQL_INJECT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"username":"admin\\u0027 OR 1=1--","password":"x"}')")

if [ "$SQL_INJECT" != "200" ]; then
  pass "SQL injection attempt rejected: $SQL_INJECT"
else
  fail "SQL injection in username may have succeeded: returned 200"
fi

EMPTY_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"","password":""}')

if [ "$EMPTY_LOGIN" != "200" ]; then
  pass "Empty credentials rejected: $EMPTY_LOGIN"
else
  fail "Empty credentials accepted: returned 200"
fi

# ─── 3. Rate Limiting ─────────────────────────────────────────────────────────
section "Rate Limiting & Brute Force Protection"

echo "Testing brute force protection (25 rapid requests)..."
RATE_LIMITED=0
for i in $(seq 1 25); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"nonexistent","password":"wrongpassword"}')
  if [ "$STATUS" = "429" ]; then
    RATE_LIMITED=1
    pass "Rate limiting: 429 Too Many Requests triggered after $i attempts"
    break
  fi
done

if [ "$RATE_LIMITED" = "0" ]; then
  fail "Rate limiting: No 429 after 25 rapid login attempts (brute force possible)"
fi

# ─── 4. Authorization & Access Control ───────────────────────────────────────
section "Authorization & Access Control"

UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/incidents/30")
if [ "$UNAUTH" = "401" ] || [ "$UNAUTH" = "403" ]; then
  pass "Protected endpoint /api/incidents/30: Returns $UNAUTH without auth"
else
  fail "Protected endpoint /api/incidents/30: Returns $UNAUTH without auth (expected 401/403)"
fi

UNAUTH2=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/admin/platform-health")
if [ "$UNAUTH2" = "401" ] || [ "$UNAUTH2" = "403" ]; then
  pass "Admin endpoint /api/admin/platform-health: Returns $UNAUTH2 without auth"
else
  fail "Admin endpoint returns $UNAUTH2 without auth (expected 401/403)"
fi

# ─── 5. Injection Checks ──────────────────────────────────────────────────────
section "Injection Attack Patterns"

XSS_TEST=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/incidents?search=%3Cscript%3Ealert(1)%3C%2Fscript%3E" \
  -b /tmp/ccc_audit_cookies.txt)
if [ "$XSS_TEST" != "500" ]; then
  pass "XSS in query param: Does not return 500 (returns $XSS_TEST)"
else
  fail "XSS in query param caused server error 500"
fi

PATH_TRAV=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/assets?path=../../etc/passwd" \
  -b /tmp/ccc_audit_cookies.txt)
if [ "$PATH_TRAV" != "500" ]; then
  pass "Path traversal in query param: Returns $PATH_TRAV (not 500)"
else
  fail "Path traversal caused server error 500"
fi

# ─── 6. Sensitive Information ─────────────────────────────────────────────────
section "Sensitive Information Exposure"

STACK_ERR=$(curl -s "${BASE_URL}/api/nonexistent_endpoint_xyz" -b /tmp/ccc_audit_cookies.txt)
if echo "$STACK_ERR" | grep -qi "at Object\.\|at Module\.\|at Function\.\|node_modules\|\.ts:[0-9]"; then
  fail "Error response leaks stack trace"
else
  pass "Error response: No stack trace in error output"
fi

ENV_LEAK=$(curl -s "${BASE_URL}/api/env" -b /tmp/ccc_audit_cookies.txt)
if echo "$ENV_LEAK" | grep -qi "DATABASE_URL\|SECRET\|API_KEY\|PASSWORD"; then
  fail "Environment variables exposed at /api/env"
else
  pass "Environment variables: Not exposed at /api/env"
fi

# ─── 7. CORS ──────────────────────────────────────────────────────────────────
section "CORS Configuration"

CORS_RESP=$(curl -sI -H "Origin: https://evil.attacker.com" "${BASE_URL}/api/auth/user" \
  -b /tmp/ccc_audit_cookies.txt)

if echo "$CORS_RESP" | grep -qi "access-control-allow-origin: \*"; then
  fail "CORS: Wildcard origin (*) allowed — cross-origin requests from any domain permitted"
elif echo "$CORS_RESP" | grep -qi "access-control-allow-origin: https://evil.attacker.com"; then
  fail "CORS: Malicious origin reflected in ACAO header"
else
  pass "CORS: Malicious origin not reflected in Access-Control-Allow-Origin"
fi

# ─── 8. TLS (HTTPS only) ──────────────────────────────────────────────────────
if [[ "$BASE_URL" == https://* ]]; then
  section "TLS Configuration"
  TLS_GRADE=$(curl -s "https://api.ssllabs.com/api/v3/analyze?host=${BASE_URL#https://}&fromCache=on" 2>/dev/null | grep -o '"grade":"[A-F][+-]*"' | head -1)
  if [ -n "$TLS_GRADE" ]; then
    echo "  SSL Labs Grade: $TLS_GRADE"
    if echo "$TLS_GRADE" | grep -q '"A'; then
      pass "TLS: Grade A or better"
    else
      warn "TLS: Grade below A — review cipher suites and TLS version"
    fi
  else
    warn "TLS: Could not fetch SSL Labs grade (may need internet access)"
  fi

  HTTP_REDIRECT=$(curl -sI "${BASE_URL/https/http}" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
  if [ "$HTTP_REDIRECT" = "301" ] || [ "$HTTP_REDIRECT" = "302" ]; then
    pass "TLS: HTTP redirects to HTTPS ($HTTP_REDIRECT)"
  else
    warn "TLS: HTTP->HTTPS redirect not confirmed (got $HTTP_REDIRECT)"
  fi
fi

# ─── 9. Health Endpoint ───────────────────────────────────────────────────────
section "Health & Observability"

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/healthz")
if [ "$HEALTH" = "200" ]; then
  pass "Health endpoint /healthz: Returns 200"
else
  fail "Health endpoint /healthz: Returns $HEALTH (expected 200)"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL+WARN))
echo -e "\n${BOLD}══ Security Audit Summary ══${NC}"
echo -e "Total checks: ${TOTAL}"
echo -e "${GREEN}Passed: ${PASS}${NC}"
echo -e "${RED}Failed: ${FAIL}${NC}"
echo -e "${YELLOW}Warnings: ${WARN}${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}${BOLD}⚠  AUDIT FAILED — ${FAIL} critical issue(s) found${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "\n${YELLOW}${BOLD}⚠  AUDIT PASSED WITH WARNINGS — ${WARN} issue(s) to review${NC}"
  exit 0
else
  echo -e "\n${GREEN}${BOLD}✓  AUDIT PASSED — All security checks passed${NC}"
  exit 0
fi
