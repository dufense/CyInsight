#!/usr/bin/env bash
##############################################################################
# setup-secrets.sh — Populate AWS Secrets Manager for CCC ECS deployment
#
# Run this interactively to set all required secrets.
# Each secret is stored as a plain-string SecretString value.
#
# Usage:
#   export AWS_REGION=ap-south-1
#   chmod +x deploy/ecs/scripts/setup-secrets.sh
#   ./deploy/ecs/scripts/setup-secrets.sh
#
# You can also pipe values non-interactively:
#   AWS_REGION=us-east-1 ./deploy/ecs/scripts/setup-secrets.sh <<EOF
#   ...
#   EOF
##############################################################################

set -euo pipefail

AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
PREFIX="${SECRETS_PREFIX:-ccc}"

log()    { echo "[$(date '+%H:%M:%S')] $*"; }
confirm(){ read -r -p "$1 [y/N]: " ans; [[ "${ans,,}" == "y" ]]; }

put_secret() {
  local name="$1"
  local description="$2"
  local value="${3:-}"

  if [[ -z "${value}" ]]; then
    read -r -s -p "  Enter value for ${name}: " value
    echo
  fi

  if aws secretsmanager describe-secret --secret-id "${PREFIX}/${name}" \
       --region "${AWS_REGION}" &>/dev/null 2>&1; then
    aws secretsmanager put-secret-value \
      --secret-id "${PREFIX}/${name}" \
      --secret-string "${value}" \
      --region "${AWS_REGION}" > /dev/null
    log "  ↺ Updated: ${PREFIX}/${name}"
  else
    aws secretsmanager create-secret \
      --name "${PREFIX}/${name}" \
      --description "${description}" \
      --secret-string "${value}" \
      --region "${AWS_REGION}" > /dev/null
    log "  ✓ Created: ${PREFIX}/${name}"
  fi
}

log "Setting up Secrets Manager entries (prefix: ${PREFIX}/)"
log "AWS Region: ${AWS_REGION}"
echo

# Defined up-front so it is in scope for the optional ClickHouse block below
# (which loops over the same regions to populate per-region clickhouse-url).
DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

# ── Shared Secrets ────────────────────────────────────────────────────────────
log "[SHARED]"
put_secret "shared/kafka-brokers"      "MSK Bootstrap Brokers (comma-separated host:port)"
put_secret "shared/management-plane-url" "Internal URL of the management plane (e.g. http://ccc-management-alb.internal)"
put_secret "shared/data-plane-url"    "Primary data plane URL (e.g. http://ccc-dp-in-west-1-alb.internal)"

# ── ClickHouse Secrets (optional — skip if not deploying ClickHouse) ──────────
# These are only required when EnableClickHouse=true in the CloudFormation stacks.
# The clickhouse.yml EC2 stack also reads clickhouse-user/database/password directly
# from Secrets Manager during instance bootstrap.
if confirm "Configure ClickHouse secrets? (skip if not using ClickHouse)"; then
  log "[CLICKHOUSE]"
  put_secret "shared/clickhouse-user"     "ClickHouse username (default: default)" "default"
  put_secret "shared/clickhouse-database" "ClickHouse database name (default: ccc)" "ccc"
  put_secret "shared/clickhouse-password" "ClickHouse password (strong random string)"
  # Shared rotation token consumed by every plane's
  # POST /api/admin/clickhouse/rotate-password endpoint. Required to enable
  # zero-downtime password rotation via rotate-clickhouse-password.sh.
  # Auto-generate with `openssl rand -base64 48` if you don't have one yet.
  put_secret "shared/clickhouse-rotation-token" \
    "Shared bearer token used by rotate-clickhouse-password.sh to fan out to every plane (32+ char random)"
  # Shared ClickHouse URL — used by the management plane. Set to the internal
  # NLB DNS produced by clickhouse.yml (e.g. http://ccc-clickhouse-nlb-production.internal:8123).
  put_secret "shared/clickhouse-url" \
    "ClickHouse HTTP endpoint shared by the management plane (e.g. http://ccc-clickhouse-nlb-production.internal:8123)"
  # Per-region ClickHouse URL + password — used by each data plane region.
  # Per-region password lets each region rotate independently. If you run a
  # single shared ClickHouse cluster, set the same URL & password for every
  # region (still seeded as the cluster's actual password).
  for region in "${DATA_PLANE_REGIONS[@]}"; do
    put_secret "data-plane/${region}/clickhouse-url" \
      "ClickHouse HTTP endpoint for ${region} (e.g. http://ccc-clickhouse-nlb-production.internal:8123)"
    put_secret "data-plane/${region}/clickhouse-password" \
      "ClickHouse password for ${region} data plane (typically same as shared/clickhouse-password)"
  done
fi

# ── AI Provider ───────────────────────────────────────────────────────────────
log "[AI]"
put_secret "ai/provider"  "AI provider: openai|anthropic|azure|vertex|ollama|huggingface|custom|grok|deepseek|kimi|zai"
put_secret "ai/api-key"   "AI API key for the selected provider"
put_secret "ai/model"     "AI model name (e.g. gpt-4o | grok-2-latest | deepseek-chat | moonshot-v1-32k | glm-4-flash)"
put_secret "ai/base-url"  "AI base URL (leave empty for openai/anthropic/grok/deepseek/kimi/zai defaults)"

# ── Management Plane Secrets ──────────────────────────────────────────────────
# NOTE: PARQUET_DATA_DIR, APP_REPORTS_DIR, APP_UPLOADS_DIR, and CLUSTER_WORKERS_MAX
# are plain env vars set directly in the ECS task-definition JSON files (not in
# Secrets Manager). They point to EFS subdirs under /app/data — do NOT change
# them to /tmp or the data will be lost on every Fargate task restart.
log "[MANAGEMENT PLANE]"
put_secret "management/database-url"          "PostgreSQL connection string (management DB)"
put_secret "management/session-secret"        "Express session secret (random 64-char string)"
put_secret "management/redis-url"             "ElastiCache Redis URL (redis://:pass@host:6379)"
put_secret "management/superadmin-password"   "Initial superadmin password"

# ── Storage ───────────────────────────────────────────────────────────────────
log "[STORAGE]"
put_secret "storage/provider"   "Cloud storage provider (s3|azure|gcs|minio)"
put_secret "storage/s3-bucket"  "S3 bucket for reports"
put_secret "storage/s3-region"  "S3 bucket region"

# ── Data Plane Secrets (per region) ──────────────────────────────────────────
DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

for region in "${DATA_PLANE_REGIONS[@]}"; do
  log "[DATA PLANE: ${region}]"
  put_secret "data-plane/${region}/database-url"        "PostgreSQL/TimescaleDB URL for ${region}"
  put_secret "data-plane/${region}/plane-region"        "Data plane region identifier" "${region}"
  put_secret "data-plane/${region}/s3-bucket"           "S3 events bucket for ${region}"
done

log ""
log "╔══════════════════════════════════════════════════╗"
log "║  All secrets configured in Secrets Manager ✓    ║"
log "╚══════════════════════════════════════════════════╝"
