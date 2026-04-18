#!/usr/bin/env bash
##############################################################################
# activate-clickhouse.sh — Turn-key end-to-end activation of ClickHouse
#                         after the ccc-clickhouse stack has been deployed.
#
# What this script does (in order):
#   1. Reads the NLB DNS from the deployed `ccc-clickhouse` stack output
#      (ClickHouseNLBDNS, value: http://<dns>:8123).
#   2. Verifies the three identity secrets exist
#      (ccc/shared/clickhouse-{user,password,database}). These are populated
#      by setup-secrets.sh and consumed by the ClickHouse EC2 UserData; the
#      activation flow refuses to continue without them.
#   3. Writes the NLB URL to:
#        - ccc/shared/clickhouse-url                       (management plane)
#        - ccc/data-plane/<region>/clickhouse-url          (every data plane)
#      Each per-region password secret is also seeded from
#      ccc/shared/clickhouse-password when missing, so a single shared
#      cluster works without manual per-region password entry.
#   4. Re-runs validate-secrets.sh with ENABLE_CLICKHOUSE=true to confirm
#      every consumer secret is now present.
#   5. Optionally re-deploys the management plane and all data planes with
#      EnableClickHouse=true so the running ECS services pick up the new
#      CLICKHOUSE_URL / CLICKHOUSE_PASSWORD env vars (forces a new task
#      revision via deploy-stacks.sh).
#
# Usage:
#   export AWS_REGION=ap-south-1
#   ./deploy/ecs/scripts/activate-clickhouse.sh                # write secrets only
#   ./deploy/ecs/scripts/activate-clickhouse.sh --redeploy     # also redeploy planes
#
# Prerequisites:
#   - ccc-clickhouse CloudFormation stack must already be deployed
#     (deploy/ecs/scripts/deploy-stacks.sh --stack clickhouse).
#   - ccc/shared/clickhouse-{user,password,database} must already exist
#     (deploy/ecs/scripts/setup-secrets.sh — answer "y" to the ClickHouse
#     prompt).
#   - For --redeploy: the same env vars deploy-stacks.sh requires
#     (AWS_ACCOUNT_ID, VPC_ID, PUBLIC_SUBNETS, PRIVATE_SUBNETS,
#     CERTIFICATE_ARN, IMAGE_TAG, ENVIRONMENT).
##############################################################################

set -euo pipefail

AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
PREFIX="${SECRETS_PREFIX:-ccc}"
CH_STACK_NAME="${CH_STACK_NAME:-ccc-clickhouse}"
DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

REDEPLOY="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --redeploy) REDEPLOY="true"; shift ;;
    --stack)    CH_STACK_NAME="$2"; shift 2 ;;
    -h|--help)  sed -n '2,40p' "$0"; exit 0 ;;
    *)          echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# ── 1. Read NLB DNS from the ccc-clickhouse stack ─────────────────────────────
log "[1/5] Reading ClickHouse NLB DNS from stack '${CH_STACK_NAME}' (${AWS_REGION})"
NLB_URL="$(aws cloudformation describe-stacks \
              --region "${AWS_REGION}" \
              --stack-name "${CH_STACK_NAME}" \
              --query "Stacks[0].Outputs[?OutputKey=='ClickHouseNLBDNS'].OutputValue" \
              --output text 2>/dev/null || true)"
if [[ -z "${NLB_URL}" || "${NLB_URL}" == "None" ]]; then
  fail "Could not read ClickHouseNLBDNS from stack ${CH_STACK_NAME}. Is the stack deployed?"
fi
log "  ClickHouse NLB URL: ${NLB_URL}"

# ── 2. Verify identity secrets exist (must be set BEFORE the EC2 boots) ──────
log "[2/5] Verifying identity secrets exist (user/password/database)"
get_secret() {
  aws secretsmanager get-secret-value \
       --secret-id "$1" \
       --region "${AWS_REGION}" \
       --query SecretString \
       --output text 2>/dev/null || true
}
need_secret() {
  local val
  val="$(get_secret "$1")"
  [[ -z "${val}" ]] && fail "Required secret missing: $1 (run setup-secrets.sh first)"
}
need_secret "${PREFIX}/shared/clickhouse-user"
need_secret "${PREFIX}/shared/clickhouse-password"
need_secret "${PREFIX}/shared/clickhouse-database"
SHARED_PASSWORD="$(get_secret "${PREFIX}/shared/clickhouse-password")"
log "  ✓ shared identity secrets present"

# ── 3. Write the NLB URL into Secrets Manager (shared + per-region) ───────────
put_or_update() {
  local name="$1" value="$2"
  if aws secretsmanager describe-secret --secret-id "${name}" \
       --region "${AWS_REGION}" &>/dev/null; then
    aws secretsmanager put-secret-value \
      --secret-id "${name}" \
      --secret-string "${value}" \
      --region "${AWS_REGION}" >/dev/null
    log "  ↺ Updated: ${name}"
  else
    aws secretsmanager create-secret \
      --name "${name}" \
      --description "ClickHouse endpoint (auto-set by activate-clickhouse.sh)" \
      --secret-string "${value}" \
      --region "${AWS_REGION}" >/dev/null
    log "  ✓ Created: ${name}"
  fi
}

log "[3/5] Writing ClickHouse URL secrets"
put_or_update "${PREFIX}/shared/clickhouse-url" "${NLB_URL}"
for region in "${DATA_PLANE_REGIONS[@]}"; do
  put_or_update "${PREFIX}/data-plane/${region}/clickhouse-url" "${NLB_URL}"
  # Seed the per-region password from the shared password if not yet present.
  # Keeps single-cluster deployments turn-key without requiring the operator
  # to set 5 identical passwords; rotating later is still per-region safe.
  if [[ -z "$(get_secret "${PREFIX}/data-plane/${region}/clickhouse-password")" ]]; then
    put_or_update "${PREFIX}/data-plane/${region}/clickhouse-password" "${SHARED_PASSWORD}"
  fi
done

# ── 4. Re-validate with CH consumer secrets enforced ─────────────────────────
log "[4/5] Re-validating Secrets Manager with ENABLE_CLICKHOUSE=true"
if [[ -x "${SCRIPT_DIR}/validate-secrets.sh" ]]; then
  ENABLE_CLICKHOUSE=true \
    AWS_REGION="${AWS_REGION}" \
    SECRETS_PREFIX="${PREFIX}" \
    "${SCRIPT_DIR}/validate-secrets.sh" --plane all \
    || fail "Secrets validation failed — review missing entries above"
else
  log "  (validate-secrets.sh not executable — skipping; chmod +x to enable)"
fi

# ── 5. Optional: redeploy management + data planes with CH enabled ───────────
log "[5/5] Plane redeploy"
if [[ "${REDEPLOY}" == "true" ]]; then
  if [[ ! -x "${SCRIPT_DIR}/deploy-stacks.sh" ]]; then
    fail "deploy-stacks.sh is not executable. Run: chmod +x ${SCRIPT_DIR}/deploy-stacks.sh"
  fi
  log "  Redeploying management plane with EnableClickHouse=true"
  ENABLE_CLICKHOUSE=true "${SCRIPT_DIR}/deploy-stacks.sh" --stack management
  log "  Redeploying all data planes with EnableClickHouse=true"
  ENABLE_CLICKHOUSE=true "${SCRIPT_DIR}/deploy-stacks.sh" --stack data
else
  log "  Skipped (use --redeploy to push EnableClickHouse=true to mgmt + data planes)"
  log ""
  log "  To finish activation, run:"
  log "    ENABLE_CLICKHOUSE=true ${SCRIPT_DIR}/deploy-stacks.sh --stack management"
  log "    ENABLE_CLICKHOUSE=true ${SCRIPT_DIR}/deploy-stacks.sh --stack data"
fi

log ""
log "╔══════════════════════════════════════════════════════════════╗"
log "║  ClickHouse activation complete ✓                            ║"
log "║                                                              ║"
log "║  Verify in production after redeploy — single command:       ║"
log "║                                                              ║"
log "║    ALB_DNS=<mgmt-alb-dns> \\                                  ║"
log "║    ADMIN_SESSION_COOKIE='connect.sid=...' \\                  ║"
log "║    TENANT_ID=<tenant> \\                                      ║"
log "║    ./deploy/ecs/scripts/smoke-test.sh --clickhouse           ║"
log "║                                                              ║"
log "║  This checks (and prints PASS/FAIL for) all three:           ║"
log "║   • Hot-tier database connection (status=connected, version) ║"
log "║   • Mirrored writes are working (insert rate > 0 rows/s)     ║"
log "║   • Events screen reads via the fast path (clickhouse_olap)  ║"
log "╚══════════════════════════════════════════════════════════════╝"
