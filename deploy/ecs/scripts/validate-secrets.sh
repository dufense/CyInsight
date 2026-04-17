#!/usr/bin/env bash
##############################################################################
# validate-secrets.sh — Pre-flight check: confirm all required Secrets Manager
#                        paths exist before any CloudFormation deploy starts.
#
# Source of truth: deploy/ecs/.env.ecs.example
# All secret paths (lines starting with "#   ccc/") are parsed from that file.
# Data-plane paths listed for in-west-1 are expanded to all 5 regions.
#
# Usage:
#   export AWS_REGION=ap-south-1
#   export ENVIRONMENT=production           # production | staging | development
#   export SECRETS_PREFIX=ccc              # default: ccc
#
#   chmod +x deploy/ecs/scripts/validate-secrets.sh
#   ./deploy/ecs/scripts/validate-secrets.sh
#
#   Exit codes:
#     0  — all secrets present
#     1  — one or more secrets missing (printed to stderr)
#
# Options:
#   --plane  management|data|receiver|all   Validate only a specific plane's
#                                           secrets (default: all)
#   --region <dp-region>                    Data plane region to validate
#                                           (e.g. in-west-1). Only used when
#                                           --plane data is specified.
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_FILE="${SCRIPT_DIR}/../.env.ecs.example"

AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
ENVIRONMENT="${ENVIRONMENT:-production}"
PREFIX="${SECRETS_PREFIX:-ccc}"
PLANE="${PLANE:-all}"
DP_REGION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --plane)  PLANE="$2";     shift 2 ;;
    --region) DP_REGION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ ! -f "${EXAMPLE_FILE}" ]]; then
  echo "ERROR: Could not find ${EXAMPLE_FILE}"
  echo "Run this script from the repository root or ensure deploy/ecs/.env.ecs.example exists."
  exit 1
fi

DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

PASS=0
FAIL=0
MISSING=()

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── Parse secret paths from .env.ecs.example ─────────────────────────────────
# Lines in the example file that document secret paths look like:
#   #   ccc/shared/kafka-brokers            b-1.ccc.xxx...
#   #   ccc/management/database-url         postgresql://...
# This function extracts them and optionally filters by a prefix segment.
parse_paths_for_segment() {
  local segment="${1}"  # e.g. "shared" "ai" "management" "storage" "data-plane"
  # Always grep for the literal "ccc/" prefix that appears in .env.ecs.example,
  # then substitute the runtime SECRETS_PREFIX. This ensures the parser works
  # correctly even when PREFIX differs from the default "ccc".
  grep -E "^#[[:space:]]+ccc/${segment}/" "${EXAMPLE_FILE}" \
    | awk '{print $2}' \
    | sed "s|^ccc/|${PREFIX}/|" \
    | grep -v '^$' \
    || true
}

# ── Check a single secret path ────────────────────────────────────────────────
check_secret_path() {
  local full_path="${1}"  # full path as stored in Secrets Manager, e.g. ccc/shared/kafka-brokers

  if aws secretsmanager describe-secret \
       --secret-id "${full_path}" \
       --region "${AWS_REGION}" \
       --output text \
       --query 'Name' \
       &>/dev/null 2>&1; then
    echo "  [PASS] ${full_path}"
    ((PASS++)) || true
  else
    echo "  [FAIL] ${full_path}  ← MISSING" >&2
    MISSING+=("${full_path}")
    ((FAIL++)) || true
  fi
}

# ── Check all paths for a given segment ──────────────────────────────────────
check_segment() {
  local label="${1}"
  local segment="${2}"
  log "[${label}]"
  local paths
  paths=$(parse_paths_for_segment "${segment}")
  if [[ -z "${paths}" ]]; then
    log "  WARNING: No paths found for segment '${segment}' in ${EXAMPLE_FILE}"
    return
  fi
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    check_secret_path "${path}"
  done <<< "${paths}"
}

# ── Data-plane: expand the template region (in-west-1) to all 5 regions ──────
check_data_plane_for_region() {
  local dp_region="${1}"
  log "[Data Plane: ${dp_region}]"
  # Extract in-west-1 paths as the template, then substitute the target region
  local template_paths
  template_paths=$(parse_paths_for_segment "data-plane/in-west-1")
  if [[ -z "${template_paths}" ]]; then
    log "  WARNING: No data-plane/in-west-1 paths found in ${EXAMPLE_FILE}"
    return
  fi
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    local expanded_path="${path/in-west-1/${dp_region}}"
    check_secret_path "${expanded_path}"
  done <<< "${template_paths}"
}

# ── Plane dispatch ────────────────────────────────────────────────────────────
validate_management() {
  check_segment "Shared"          "shared"
  check_segment "AI Provider"     "ai"
  check_segment "Management Plane" "management"
  check_segment "Storage"         "storage"
}

validate_data() {
  if [[ -n "${DP_REGION}" ]]; then
    check_data_plane_for_region "${DP_REGION}"
  else
    for r in "${DATA_PLANE_REGIONS[@]}"; do
      check_data_plane_for_region "${r}"
    done
  fi
}

validate_receiver() {
  check_segment "Shared" "shared"
}

validate_clickhouse() {
  # ClickHouse secrets are optional — only checked when explicitly requested.
  # The 3 shared paths are always required when ClickHouse is enabled.
  # Per-region clickhouse-url paths are validated for all 5 data-plane regions
  # (or just the one specified via --region).
  log "[ClickHouse Shared]"
  check_secret_path "${PREFIX}/shared/clickhouse-password"
  check_secret_path "${PREFIX}/shared/clickhouse-user"
  check_secret_path "${PREFIX}/shared/clickhouse-database"

  if [[ -n "${DP_REGION}" ]]; then
    log "[ClickHouse URL: ${DP_REGION}]"
    check_secret_path "${PREFIX}/data-plane/${DP_REGION}/clickhouse-url"
  else
    for r in "${DATA_PLANE_REGIONS[@]}"; do
      log "[ClickHouse URL: ${r}]"
      check_secret_path "${PREFIX}/data-plane/${r}/clickhouse-url"
    done
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
log "=== Cyber Command Center — Secrets Manager Pre-flight Check ==="
log "Region:      ${AWS_REGION}"
log "Prefix:      ${PREFIX}"
log "Plane:       ${PLANE}"
log "Source file: ${EXAMPLE_FILE}"
log ""

case "${PLANE}" in
  management)
    validate_management
    ;;
  data)
    validate_data
    ;;
  receiver)
    validate_receiver
    ;;
  clickhouse)
    validate_clickhouse
    ;;
  all)
    validate_management
    validate_data
    ;;
  *)
    echo "Unknown plane: ${PLANE}. Use: management | data | receiver | clickhouse | all"
    exit 1
    ;;
esac

echo ""
log "────────────────────────────────────────────────────────────────"
log "Results: ${PASS} passed, ${FAIL} failed"

if [[ ${FAIL} -gt 0 ]]; then
  log ""
  log "Missing secrets:"
  for secret in "${MISSING[@]}"; do
    log "  • ${secret}"
  done
  log ""
  log "Run deploy/ecs/scripts/setup-secrets.sh to populate missing secrets."
  exit 1
fi

log ""
log "╔══════════════════════════════════════════════════════╗"
log "║  All required secrets are present in Secrets Manager ║"
log "╚══════════════════════════════════════════════════════╝"
