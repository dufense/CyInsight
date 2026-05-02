#!/usr/bin/env bash
##############################################################################
# CyInsight — Elastic end-to-end orchestration.
#
# Deploys the elastic-tier topology in dependency order:
#
#   1. cyinsight-elastic-substrate.yml — VPC + Aurora Serverless v2 + Redis
#                                        Serverless + Kinesis on-demand + S3
#                                        + ALB + WAF
#   2. 08-clickhouse-cluster.yml       — OPTIONAL (off in pilot tier)
#   3. 06-management-ecs.yml           — Management plane ECS Fargate
#   4. 07-data-plane-ecs.yml           — OPTIONAL (off in pilot tier)
#
# Same dependency order as deploy-hyperscale.sh; the difference is that this
# script defaults to single-NAT, Aurora Serverless v2, on-demand Kinesis,
# Redis Serverless, no ClickHouse, no data plane in pilot tier.
#
# Usage:
#   export AWS_REGION=ap-south-1
#   export DOMAIN_NAME=app.example.com
#   export CERTIFICATE_ARN=arn:aws:acm:ap-south-1:ACCOUNT:certificate/ID
#   export IMAGE_URI=123456789012.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest
#   export TENANT_TIER=pilot                # pilot|growth|midtier|hyperscale
#   export HIGH_AVAILABILITY=false          # false=1 NAT, true=3 NAT
#   export ENABLE_CLICKHOUSE=false          # pilot can skip CH for ~$330/mo savings
#   export ENABLE_DATA_PLANE=false          # pilot uses mgmt plane for ingest
#
#   ./deploy/aws/scripts/deploy-elastic.sh
#
# Selective deploy (re-run a single stage):
#   ./deploy/aws/scripts/deploy-elastic.sh --stage substrate
#   ./deploy/aws/scripts/deploy-elastic.sh --stage clickhouse
#   ./deploy/aws/scripts/deploy-elastic.sh --stage management
#   ./deploy/aws/scripts/deploy-elastic.sh --stage dataplane
#
# Tier upgrade (no redesign):
#   TENANT_TIER=growth ENABLE_CLICKHOUSE=true ./deploy/aws/scripts/deploy-elastic.sh
#
# Teardown (snapshots Aurora, retains S3):
#   ./deploy/aws/scripts/deploy-elastic.sh --teardown
##############################################################################

set -euo pipefail

# ── Required env ────────────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-ap-south-1}"
DOMAIN_NAME="${DOMAIN_NAME:?Set DOMAIN_NAME (e.g. app.example.com)}"
CERTIFICATE_ARN="${CERTIFICATE_ARN:?Set CERTIFICATE_ARN (ACM cert ARN in same region)}"

# ── Tier knobs (defaults = pilot, single-AZ, no CH, no DP) ──────────────────
TENANT_TIER="${TENANT_TIER:-pilot}"
HIGH_AVAILABILITY="${HIGH_AVAILABILITY:-false}"
ENABLE_CLICKHOUSE="${ENABLE_CLICKHOUSE:-false}"
ENABLE_DATA_PLANE="${ENABLE_DATA_PLANE:-false}"

# ── Required for ECS + ClickHouse stages ────────────────────────────────────
IMAGE_URI="${IMAGE_URI:-}"
EC2_KEY_NAME="${EC2_KEY_NAME:-}"

# ── Stack names ─────────────────────────────────────────────────────────────
SUBSTRATE_STACK="${SUBSTRATE_STACK:-cyinsight-elastic}"
CH_STACK="${CH_STACK:-cyinsight-elastic-ch}"
MGMT_STACK="${MGMT_STACK:-cyinsight-elastic-mgmt}"
DATA_STACK="${DATA_STACK:-cyinsight-elastic-data}"

CH_PASSWORD_SSM_PATH="${CH_PASSWORD_SSM_PATH:-/cyinsight/elastic/ch-admin-password}"

TEMPLATE_DIR="deploy/aws/cloudformation"
STAGE="all"
TEARDOWN=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --stage)    STAGE="$2"; shift 2 ;;
    --teardown) TEARDOWN=1; shift ;;
    -h|--help)  grep "^#" "$0" | sed 's/^# \{0,1\}//' | head -55; exit 0 ;;
    *)          echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

require_vars() {
  local missing=()
  for var in "$@"; do
    [[ -z "${!var:-}" ]] && missing+=("$var")
  done
  [[ ${#missing[@]} -gt 0 ]] && fail "Missing required env vars for stage ${STAGE}: ${missing[*]}"
}

cfn_deploy() {
  local stack="$1" template="$2"
  shift 2
  log "Deploying ${stack} (${template})"
  local start=$(date +%s)
  aws cloudformation deploy \
    --region "${AWS_REGION}" \
    --stack-name "${stack}" \
    --template-file "${template}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "$@"
  log "Deployed ${stack} in $(( $(date +%s) - start ))s"
}

cfn_delete() {
  local stack="$1"
  log "Deleting ${stack}"
  aws cloudformation delete-stack --region "${AWS_REGION}" --stack-name "${stack}" || true
  aws cloudformation wait stack-delete-complete --region "${AWS_REGION}" --stack-name "${stack}" || true
}

ensure_ch_password_ssm() {
  if aws ssm get-parameter --region "${AWS_REGION}" --name "${CH_PASSWORD_SSM_PATH}" >/dev/null 2>&1; then
    log "ClickHouse admin password already exists at ${CH_PASSWORD_SSM_PATH}"
    return
  fi
  log "Generating ClickHouse admin password into SSM:${CH_PASSWORD_SSM_PATH}"
  local pw
  pw=$(openssl rand -base64 32)
  aws ssm put-parameter \
    --region "${AWS_REGION}" \
    --name "${CH_PASSWORD_SSM_PATH}" \
    --value "${pw}" \
    --type SecureString \
    --description "CyInsight Elastic ClickHouse admin password" \
    --overwrite >/dev/null
}

# ── Tier-driven instance / scale parameters ─────────────────────────────────
# Mirror of the TierMap mappings in cyinsight-elastic.yml — kept here so the
# bash wrapper can drive the per-plane templates directly without nested CFN.
declare -A TIER_MGMT_CPU TIER_MGMT_MEM TIER_MGMT_DES TIER_MGMT_MIN TIER_MGMT_MAX TIER_MGMT_POOL
declare -A TIER_DATA_CPU TIER_DATA_MEM TIER_DATA_DES TIER_DATA_MIN TIER_DATA_MAX TIER_DATA_POOL
declare -A TIER_CH_TYPE TIER_CH_SIZE TIER_CH_DISK TIER_CH_IOPS TIER_CH_MBPS

TIER_MGMT_CPU=( [pilot]=1024 [growth]=2048 [midtier]=4096 [hyperscale]=4096 )
TIER_MGMT_MEM=( [pilot]=2048 [growth]=4096 [midtier]=8192 [hyperscale]=8192 )
TIER_MGMT_DES=( [pilot]=2    [growth]=3    [midtier]=5    [hyperscale]=10 )
TIER_MGMT_MIN=( [pilot]=2    [growth]=3    [midtier]=5    [hyperscale]=10 )
TIER_MGMT_MAX=( [pilot]=10   [growth]=20   [midtier]=30   [hyperscale]=40 )
TIER_MGMT_POOL=( [pilot]=20  [growth]=30   [midtier]=50   [hyperscale]=200 )

TIER_DATA_CPU=( [pilot]=1024 [growth]=2048 [midtier]=4096 [hyperscale]=8192 )
TIER_DATA_MEM=( [pilot]=2048 [growth]=4096 [midtier]=8192 [hyperscale]=16384 )
TIER_DATA_DES=( [pilot]=2    [growth]=3    [midtier]=10   [hyperscale]=60 )
TIER_DATA_MIN=( [pilot]=2    [growth]=3    [midtier]=10   [hyperscale]=60 )
TIER_DATA_MAX=( [pilot]=10   [growth]=30   [midtier]=60   [hyperscale]=600 )
TIER_DATA_POOL=( [pilot]=20  [growth]=30   [midtier]=50   [hyperscale]=200 )

TIER_CH_TYPE=( [pilot]=r6i.large [growth]=r6i.large [midtier]=r6i.2xlarge [hyperscale]=i4i.8xlarge )
TIER_CH_SIZE=( [pilot]=3 [growth]=3 [midtier]=3 [hyperscale]=3 )
TIER_CH_DISK=( [pilot]=200 [growth]=500 [midtier]=1000 [hyperscale]=4000 )
TIER_CH_IOPS=( [pilot]=6000 [growth]=8000 [midtier]=12000 [hyperscale]=16000 )
TIER_CH_MBPS=( [pilot]=500 [growth]=600 [midtier]=700 [hyperscale]=1000 )

# ── Stage 1: Substrate (~15 min for pilot, ~25 min for HA) ─────────────────
deploy_substrate() {
  cfn_deploy "${SUBSTRATE_STACK}" "${TEMPLATE_DIR}/cyinsight-elastic-substrate.yml" \
    "EnvironmentName=elastic" \
    "TenantTier=${TENANT_TIER}" \
    "HighAvailability=${HIGH_AVAILABILITY}" \
    "DomainName=${DOMAIN_NAME}" \
    "CertificateArn=${CERTIFICATE_ARN}"
}

stack_exists() {
  aws cloudformation describe-stacks --region "${AWS_REGION}" --stack-name "$1" >/dev/null 2>&1
}

# ── Stage 2: ClickHouse (~30 min, OPTIONAL) ────────────────────────────────
deploy_clickhouse() {
  if [[ "${ENABLE_CLICKHOUSE}" != "true" ]]; then
    if stack_exists "${CH_STACK}"; then
      log "ENABLE_CLICKHOUSE=false but stack ${CH_STACK} exists — DELETING to release ~\$330+/mo."
      log "WARNING: this is destructive — all ClickHouse hot-tier data is lost. Re-ingest from S3 raw events if needed."
      cfn_delete "${CH_STACK}"
    else
      log "ENABLE_CLICKHOUSE=false — skipping ClickHouse stack (using Athena/S3 for analytics)."
    fi
    return 0
  fi
  ensure_ch_password_ssm
  local key_args=()
  [[ -n "${EC2_KEY_NAME}" ]] && key_args=("KeyName=${EC2_KEY_NAME}")
  cfn_deploy "${CH_STACK}" "${TEMPLATE_DIR}/08-clickhouse-cluster.yml" \
    "EnvironmentName=elastic" \
    "VpcStackName=${SUBSTRATE_STACK}" \
    "DataLakeStackName=${SUBSTRATE_STACK}" \
    "InstanceType=${TIER_CH_TYPE[$TENANT_TIER]}" \
    "ClusterSize=${TIER_CH_SIZE[$TENANT_TIER]}" \
    "HotDiskSizeGiB=${TIER_CH_DISK[$TENANT_TIER]}" \
    "HotDiskIops=${TIER_CH_IOPS[$TENANT_TIER]}" \
    "HotDiskThroughputMBps=${TIER_CH_MBPS[$TENANT_TIER]}" \
    "ClickHouseAdminPasswordParam=${CH_PASSWORD_SSM_PATH}" \
    "${key_args[@]}"
}

# ── Stage 3: Management plane (~10 min) ────────────────────────────────────
deploy_management() {
  require_vars IMAGE_URI
  local session_secret_arn
  session_secret_arn=$(aws cloudformation describe-stacks \
    --region "${AWS_REGION}" --stack-name "${SUBSTRATE_STACK}" \
    --query "Stacks[0].Outputs[?OutputKey=='SessionSecretArn'].OutputValue" --output text)
  [[ -z "${session_secret_arn}" || "${session_secret_arn}" == "None" ]] && \
    fail "Could not read SessionSecretArn from ${SUBSTRATE_STACK} — re-run --stage substrate first"

  local ch_stack_arg=""
  if [[ "${ENABLE_CLICKHOUSE}" == "true" ]]; then
    ch_stack_arg="ClickHouseStackName=${CH_STACK}"
  else
    ch_stack_arg="ClickHouseStackName="
  fi

  local hyperscale_flag="false"
  [[ "${TENANT_TIER}" == "hyperscale" ]] && hyperscale_flag="true"

  local async_flag="false"
  [[ "${ENABLE_CLICKHOUSE}" == "true" ]] && async_flag="true"

  cfn_deploy "${MGMT_STACK}" "${TEMPLATE_DIR}/06-management-ecs.yml" \
    "EnvironmentName=elastic" \
    "VpcStackName=${SUBSTRATE_STACK}" \
    "AuroraStackName=${SUBSTRATE_STACK}" \
    "KinesisStackName=${SUBSTRATE_STACK}" \
    "DataLakeStackName=${SUBSTRATE_STACK}" \
    "${ch_stack_arg}" \
    "CertificateArn=${CERTIFICATE_ARN}" \
    "SessionSecretArn=${session_secret_arn}" \
    "ImageUri=${IMAGE_URI}" \
    "AppBaseUrl=https://${DOMAIN_NAME}" \
    "TaskCpu=${TIER_MGMT_CPU[$TENANT_TIER]}" \
    "TaskMemory=${TIER_MGMT_MEM[$TENANT_TIER]}" \
    "DesiredCount=${TIER_MGMT_DES[$TENANT_TIER]}" \
    "MinCount=${TIER_MGMT_MIN[$TENANT_TIER]}" \
    "MaxCount=${TIER_MGMT_MAX[$TENANT_TIER]}" \
    "DbPoolMax=${TIER_MGMT_POOL[$TENANT_TIER]}" \
    "EnableHyperscaleProfile=${hyperscale_flag}" \
    "EnableClickHouseAsyncInsert=${async_flag}"
}

# ── Stage 4: Data plane (~10 min, OPTIONAL) ────────────────────────────────
deploy_dataplane() {
  if [[ "${ENABLE_DATA_PLANE}" != "true" ]]; then
    if stack_exists "${DATA_STACK}"; then
      log "ENABLE_DATA_PLANE=false but stack ${DATA_STACK} exists — DELETING to release Fargate cost."
      cfn_delete "${DATA_STACK}"
    else
      log "ENABLE_DATA_PLANE=false — skipping data plane (mgmt plane handles ingest)."
    fi
    return 0
  fi
  require_vars IMAGE_URI

  local ch_stack_arg=""
  if [[ "${ENABLE_CLICKHOUSE}" == "true" ]]; then
    ch_stack_arg="ClickHouseStackName=${CH_STACK}"
  else
    ch_stack_arg="ClickHouseStackName="
  fi

  local hyperscale_flag="false"
  [[ "${TENANT_TIER}" == "hyperscale" ]] && hyperscale_flag="true"

  local async_flag="false"
  [[ "${ENABLE_CLICKHOUSE}" == "true" ]] && async_flag="true"

  cfn_deploy "${DATA_STACK}" "${TEMPLATE_DIR}/07-data-plane-ecs.yml" \
    "EnvironmentName=elastic" \
    "VpcStackName=${SUBSTRATE_STACK}" \
    "AuroraStackName=${SUBSTRATE_STACK}" \
    "KinesisStackName=${SUBSTRATE_STACK}" \
    "DataLakeStackName=${SUBSTRATE_STACK}" \
    "${ch_stack_arg}" \
    "DataPlaneRegion=hyperscale" \
    "RegionCode=${AWS_REGION}" \
    "DataPlaneId=hyperscale" \
    "AlbScheme=internet-facing" \
    "AlbCertificateArn=${CERTIFICATE_ARN}" \
    "ManagementVpcCidr=10.60.0.0/16" \
    "ImageUri=${IMAGE_URI}" \
    "TaskCpu=${TIER_DATA_CPU[$TENANT_TIER]}" \
    "TaskMemory=${TIER_DATA_MEM[$TENANT_TIER]}" \
    "DesiredCount=${TIER_DATA_DES[$TENANT_TIER]}" \
    "MinCount=${TIER_DATA_MIN[$TENANT_TIER]}" \
    "MaxCount=${TIER_DATA_MAX[$TENANT_TIER]}" \
    "DbPoolMax=${TIER_DATA_POOL[$TENANT_TIER]}" \
    "EnableHyperscaleProfile=${hyperscale_flag}" \
    "EnableClickHouseAsyncInsert=${async_flag}" \
    "EnableClickHouseDirectIngest=false"
}

# ── Teardown (reverse order) ───────────────────────────────────────────────
teardown_all() {
  log "Tearing down Elastic topology in reverse order"
  cfn_delete "${DATA_STACK}"
  cfn_delete "${MGMT_STACK}"
  cfn_delete "${CH_STACK}"
  cfn_delete "${SUBSTRATE_STACK}"
  log "Teardown complete. Aurora snapshot + ArchiveBucket retain their data per DeletionPolicy."
}

# ── Main dispatch ──────────────────────────────────────────────────────────
if [[ "${TEARDOWN}" -eq 1 ]]; then
  teardown_all
  exit 0
fi

log "Tier=${TENANT_TIER}  HA=${HIGH_AVAILABILITY}  ClickHouse=${ENABLE_CLICKHOUSE}  DataPlane=${ENABLE_DATA_PLANE}  Region=${AWS_REGION}"

PIPELINE_START=$(date +%s)
case "${STAGE}" in
  substrate)  deploy_substrate ;;
  clickhouse) deploy_clickhouse ;;
  management) deploy_management ;;
  dataplane)  deploy_dataplane ;;
  all)
    deploy_substrate
    deploy_clickhouse
    deploy_management
    deploy_dataplane
    ;;
  *) fail "Unknown --stage: ${STAGE} (expected: substrate|clickhouse|management|dataplane|all)" ;;
esac
log "Elastic stage [${STAGE}] complete in $(( $(date +%s) - PIPELINE_START ))s total"

if [[ "${STAGE}" == "all" ]]; then
  log ""
  log "Verify deploy with:"
  log "  curl -sf https://${DOMAIN_NAME}/api/health"
  log "  See deploy/aws/ELASTIC_RUNBOOK.md §5 for the smoke test checklist."
  log ""
  log "To scale up later (no redesign):"
  log "  TENANT_TIER=growth ENABLE_CLICKHOUSE=true ./deploy/aws/scripts/deploy-elastic.sh"
fi
