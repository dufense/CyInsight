#!/bin/sh
##############################################################################
# start-with-retry.sh — Management Plane entrypoint with DB readiness wait
#
# Waits for PostgreSQL to accept connections before starting the Node process.
# This prevents crash-loops on fresh ECS deployments where the container
# starts before RDS / Aurora has finished initialising or DNS has propagated.
#
# Retry strategy: up to 30 attempts, 5 seconds apart (2.5-min total window).
# On failure after all retries the script exits non-zero so ECS/K8s can
# apply its own restart policy.
#
# Environment variables read:
#   DATABASE_URL   — PostgreSQL connection string (required)
#   DB_SSL_CA      — Path to CA bundle for SSL verification (optional)
#   PGSSLMODE      — PostgreSQL SSL mode (optional, default: verify-ca)
#   STARTUP_RETRIES      — Override retry count (default: 30)
#   STARTUP_RETRY_WAIT   — Override wait seconds between retries (default: 5)
##############################################################################

set -e

MAX_RETRIES="${STARTUP_RETRIES:-30}"
RETRY_WAIT="${STARTUP_RETRY_WAIT:-5}"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [startup] $*"
}

# ── Extract host + port from DATABASE_URL ─────────────────────────────────────
# Supports formats:
#   postgresql://user:pass@host:5432/db?sslmode=verify-ca
#   postgres://user:pass@host/db
extract_host() {
  echo "$DATABASE_URL" | sed -E 's|.*@([^/:?]+)[:/].*|\1|'
}

extract_port() {
  port=$(echo "$DATABASE_URL" | sed -E 's|.*@[^:]+:([0-9]+).*|\1|')
  # If no port extracted (same as full URL), default to 5432
  if [ "$port" = "$DATABASE_URL" ]; then
    echo "5432"
  else
    echo "$port"
  fi
}

wait_for_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    log "WARNING: DATABASE_URL is not set; skipping DB readiness check"
    return 0
  fi

  DB_HOST=$(extract_host)
  DB_PORT=$(extract_port)

  log "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT} ..."

  attempt=1
  while [ "$attempt" -le "$MAX_RETRIES" ]; do
    # Use /dev/tcp (busybox sh compatible) or nc if available
    if nc -z -w3 "${DB_HOST}" "${DB_PORT}" 2>/dev/null; then
      log "PostgreSQL is reachable after ${attempt} attempt(s)"
      return 0
    fi

    log "Attempt ${attempt}/${MAX_RETRIES}: PostgreSQL not ready, waiting ${RETRY_WAIT}s ..."
    sleep "${RETRY_WAIT}"
    attempt=$((attempt + 1))
  done

  log "ERROR: PostgreSQL did not become reachable after ${MAX_RETRIES} attempts ($(( MAX_RETRIES * RETRY_WAIT ))s total)"
  log "DATABASE_URL host: ${DB_HOST}  port: ${DB_PORT}"
  log "Check: RDS instance status, security group inbound rules, VPC subnet routing"
  exit 1
}

# ── SSL configuration ─────────────────────────────────────────────────────────
configure_ssl() {
  if [ -n "${DB_SSL_CA:-}" ] && [ -f "${DB_SSL_CA}" ]; then
    log "Using RDS CA bundle: ${DB_SSL_CA}"
    export NODE_EXTRA_CA_CERTS="${DB_SSL_CA}"
    export PGSSLROOTCERT="${DB_SSL_CA}"
  elif [ -f "/etc/ssl/certs/rds-ca-bundle.pem" ]; then
    log "Using embedded RDS CA bundle: /etc/ssl/certs/rds-ca-bundle.pem"
    export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/rds-ca-bundle.pem"
    export PGSSLROOTCERT="/etc/ssl/certs/rds-ca-bundle.pem"
    export DB_SSL_CA="/etc/ssl/certs/rds-ca-bundle.pem"
  else
    log "WARNING: No RDS CA bundle found; SSL verification will use system defaults"
  fi

  export PGSSLMODE="${PGSSLMODE:-verify-ca}"
  log "PostgreSQL SSL mode: ${PGSSLMODE}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
log "Management Plane starting (NODE_ENV=${NODE_ENV:-production})"
configure_ssl
wait_for_db

log "Starting application: $*"
exec "$@"
