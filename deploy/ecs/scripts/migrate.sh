#!/usr/bin/env bash
##############################################################################
# migrate.sh — Run Drizzle schema migrations against the production RDS
#              PostgreSQL database.
#
# IMPORTANT: The main production image prunes devDependencies (drizzle-kit is
# a devDep). Two reliable migration approaches are supported:
#
# ── Mode A: Direct (local machine / CI runner with npm ci and DB access) ──────
#   Suitable for:
#     • Initial setup from a bastion host / machine with VPN to RDS
#     • GitHub Actions CI runners that have run `npm ci` (all deps available)
#       and have DB access via Secrets Manager + temporary credential fetch
#
#   export DATABASE_URL="postgresql://user:pass@rds-host:5432/secureops?sslmode=require"
#   ./deploy/ecs/scripts/migrate.sh --mode direct
#
# ── Mode B: ECS Task (no direct DB access required) ───────────────────────────
#   Launches a one-off Fargate task using the dedicated migration image
#   (ccc-migrate:${IMAGE_TAG}, built from Dockerfile.migrate), which retains
#   all devDependencies and is NOT the pruned production image.
#
#   Prerequisites:
#     - Build and push the migrate image first:
#         push-images.sh --plane migrate --tag ${IMAGE_TAG}
#     - Management plane CloudFormation stack must be deployed
#
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=ap-south-1
#   export ENVIRONMENT=production
#   export IMAGE_TAG=v1.0.0
#   ./deploy/ecs/scripts/migrate.sh --mode ecs
#
# ── Mode C: GitHub Actions (CI-optimized direct mode) ─────────────────────────
#   Used by the GitHub Actions workflow: fetches DATABASE_URL from Secrets
#   Manager, then runs drizzle-kit push directly on the CI runner (which has
#   devDependencies available from npm ci).
#
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=ap-south-1
#   export SECRETS_PREFIX=ccc
#   ./deploy/ecs/scripts/migrate.sh --mode github-actions
#
# Common options:
#   --mode   direct|ecs|github-actions  (default: auto-detect)
#   --dry-run                           Print what would be done without executing
##############################################################################

set -euo pipefail

MODE="${MIGRATE_MODE:-auto}"
DRY_RUN=false
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
AWS_REGION="${AWS_REGION:-}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SECRETS_PREFIX="${SECRETS_PREFIX:-ccc}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --mode)    MODE="$2";   shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── Auto-detect mode ──────────────────────────────────────────────────────────
if [[ "${MODE}" == "auto" ]]; then
  if [[ -n "${DATABASE_URL:-}" ]]; then
    MODE="direct"
    log "Auto-detected mode: direct (DATABASE_URL is set)"
  elif [[ -n "${AWS_ACCOUNT_ID}" && -n "${AWS_REGION}" ]]; then
    # Default to github-actions mode when running in CI (no DATABASE_URL available locally)
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      MODE="github-actions"
      log "Auto-detected mode: github-actions (GITHUB_ACTIONS env is set)"
    else
      MODE="ecs"
      log "Auto-detected mode: ecs (AWS vars are set, no DATABASE_URL)"
    fi
  else
    echo "Cannot auto-detect mode. Options:"
    echo "  Direct:         export DATABASE_URL='postgresql://...' then --mode direct"
    echo "  ECS task:       export AWS_ACCOUNT_ID + AWS_REGION then --mode ecs"
    echo "  GitHub Actions: export AWS_ACCOUNT_ID + AWS_REGION + SECRETS_PREFIX then --mode github-actions"
    exit 1
  fi
fi

# ── Mode A: Direct ────────────────────────────────────────────────────────────
run_direct() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL must be set for direct mode."
    echo "  Example: export DATABASE_URL='postgresql://user:pass@rds-host:5432/db?sslmode=require'"
    exit 1
  fi

  log "Running Drizzle migrations (direct mode)..."
  log "Target: $(echo "${DATABASE_URL}" | sed 's|://[^@]*@|://***@|')"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] Would run: npx drizzle-kit push --config=drizzle.config.ts"
    return
  fi

  # drizzle-kit push is idempotent — safe to run on an existing schema.
  npx drizzle-kit push --config=drizzle.config.ts

  log "Migrations complete (direct mode)."
}

# ── Mode C: GitHub Actions ────────────────────────────────────────────────────
# Fetches DATABASE_URL from Secrets Manager, then runs drizzle-kit push on the
# CI runner (which has all devDependencies from `npm ci`).
run_github_actions() {
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID for github-actions mode}"
  AWS_REGION="${AWS_REGION:?Set AWS_REGION for github-actions mode}"

  local secret_id="${SECRETS_PREFIX}/management/database-url"

  log "Running Drizzle migrations (github-actions mode)..."
  log "Fetching DATABASE_URL from Secrets Manager: ${secret_id}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] Would fetch: aws secretsmanager get-secret-value --secret-id ${secret_id}"
    log "[DRY-RUN] Would run: npx drizzle-kit push --config=drizzle.config.ts"
    return
  fi

  local db_url
  db_url=$(aws secretsmanager get-secret-value \
    --secret-id "${secret_id}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text)

  if [[ -z "${db_url}" ]]; then
    echo "ERROR: Could not retrieve DATABASE_URL from Secrets Manager (${secret_id})"
    exit 1
  fi

  export DATABASE_URL="${db_url}"

  log "Running drizzle-kit push against RDS..."
  npx drizzle-kit push --config=drizzle.config.ts

  unset DATABASE_URL
  log "Migrations complete (github-actions mode)."
}

# ── Mode B: ECS Task ──────────────────────────────────────────────────────────
# Uses the ccc-migrate image (built from Dockerfile.migrate) which retains
# all devDependencies. Does NOT use the production image which prunes devDeps.
run_ecs() {
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID for ECS mode}"
  AWS_REGION="${AWS_REGION:?Set AWS_REGION for ECS mode}"

  local cluster="ccc-management-${ENVIRONMENT}"
  local ecr_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  # Use the dedicated migration image (retains devDependencies / drizzle-kit)
  local image_uri="${ecr_registry}/ccc-migrate:${IMAGE_TAG}"
  local log_group="/ecs/ccc-management-plane-${ENVIRONMENT}"
  local task_family="ccc-migrate-${ENVIRONMENT}"
  local stack_name="ccc-management-plane"

  log "Running Drizzle migrations (ECS task mode)..."
  log "Cluster:    ${cluster}"
  log "Image:      ${image_uri}"
  log "Log group:  ${log_group}"
  log ""
  log "NOTE: Uses Dockerfile.migrate image which retains devDependencies."
  log "      Ensure this image is built/pushed before running this mode."

  get_cfn_output() {
    aws cloudformation describe-stacks \
      --region "${AWS_REGION}" \
      --stack-name "${stack_name}" \
      --query "Stacks[0].Outputs[?OutputKey=='${1}'].OutputValue" \
      --output text 2>/dev/null || true
  }

  log "Fetching networking info from CloudFormation stack '${stack_name}'..."

  local execution_role_arn
  execution_role_arn=$(aws cloudformation describe-stacks \
    --region "${AWS_REGION}" \
    --stack-name "ccc-prerequisites" \
    --query "Stacks[0].Outputs[?OutputKey=='ECSExecutionRoleArn'].OutputValue" \
    --output text 2>/dev/null || true)

  if [[ -z "${execution_role_arn}" ]]; then
    execution_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/ccc-ecs-execution-role-${ENVIRONMENT}"
  fi

  local task_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/ccc-management-task-role-${ENVIRONMENT}"

  local private_subnets="${PRIVATE_SUBNETS:-}"
  if [[ -z "${private_subnets}" ]]; then
    log "PRIVATE_SUBNETS not set — attempting to read from CloudFormation..."
    private_subnets=$(get_cfn_output "PrivateSubnetIds" || true)
  fi
  if [[ -z "${private_subnets}" ]]; then
    echo "ERROR: Set PRIVATE_SUBNETS (comma-separated) or ensure the management stack exports PrivateSubnetIds"
    exit 1
  fi

  local ecs_sg_id
  ecs_sg_id=$(get_cfn_output "ECSSecurityGroupId" || echo "")
  if [[ -z "${ecs_sg_id}" ]]; then
    echo "ERROR: Could not determine ECS security group. Ensure the management stack exports ECSSecurityGroupId"
    exit 1
  fi

  # Convert comma-separated subnets to compact JSON array for AWS CLI shorthand.
  # Use -cs (compact + slurp) to avoid pretty-printing, which can cause CLI
  # argument-parsing failures when injected into --network-configuration strings.
  local subnets_json
  subnets_json=$(echo "${private_subnets}" | tr ',' '\n' | jq -R . | jq -cs .)

  local task_def_json
  task_def_json=$(cat <<-TASKDEF
{
  "family": "${task_family}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${execution_role_arn}",
  "taskRoleArn": "${task_role_arn}",
  "containerDefinitions": [
    {
      "name": "migrate",
      "image": "${image_uri}",
      "essential": true,
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:${SECRETS_PREFIX}/management/database-url"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${log_group}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "migrate",
          "awslogs-create-group": "true"
        }
      },
      "stopTimeout": 30
    }
  ]
}
TASKDEF
)

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] Would register task definition:"
    echo "${task_def_json}" | jq .
    log "[DRY-RUN] Would run migration task in cluster '${cluster}'"
    return
  fi

  log "Registering migration task definition..."
  local task_def_arn
  task_def_arn=$(aws ecs register-task-definition \
    --region "${AWS_REGION}" \
    --cli-input-json "${task_def_json}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)
  log "Task definition ARN: ${task_def_arn}"

  log "Starting migration task in cluster '${cluster}'..."
  local task_arn
  task_arn=$(aws ecs run-task \
    --region "${AWS_REGION}" \
    --cluster "${cluster}" \
    --task-definition "${task_def_arn}" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=${subnets_json},securityGroups=[\"${ecs_sg_id}\"],assignPublicIp=DISABLED}" \
    --query 'tasks[0].taskArn' \
    --output text)
  log "Task ARN: ${task_arn}"

  local task_id="${task_arn##*/}"

  local log_stream="migrate/migrate/${task_id}"

  # ── Stream CloudWatch logs while the ECS task runs ─────────────────────────
  # Poll the task status every 10s; meanwhile stream available log events.
  log "Streaming migration logs from CloudWatch (log stream: ${log_stream})..."
  log "Task status polling every 10s — waiting for STOPPED..."

  local next_token=""
  local task_status="RUNNING"
  local max_wait_seconds=600   # 10 minutes absolute timeout
  local waited=0

  # Give CloudWatch Logs a moment to create the log stream
  sleep 15

  while [[ "${task_status}" != "STOPPED" && ${waited} -lt ${max_wait_seconds} ]]; do
    # Stream any new log events
    local log_args=(
      --region "${AWS_REGION}"
      --log-group-name "${log_group}"
      --log-stream-name "${log_stream}"
      --start-from-head
      --output text
      --query 'events[*].message'
    )
    if [[ -n "${next_token}" ]]; then
      log_args+=(--next-token "${next_token}")
    fi

    local log_output next_token_raw
    log_output=$(aws logs get-log-events "${log_args[@]}" 2>/dev/null || true)
    next_token_raw=$(aws logs get-log-events "${log_args[@]}" \
      --query 'nextForwardToken' --output text 2>/dev/null || echo "")

    if [[ -n "${log_output}" ]]; then
      echo "${log_output}"
      if [[ -n "${next_token_raw}" && "${next_token_raw}" != "None" ]]; then
        next_token="${next_token_raw}"
      fi
    fi

    sleep 10
    ((waited += 10)) || true

    task_status=$(aws ecs describe-tasks \
      --region "${AWS_REGION}" \
      --cluster "${cluster}" \
      --tasks "${task_arn}" \
      --query 'tasks[0].lastStatus' \
      --output text 2>/dev/null || echo "UNKNOWN")
  done

  if [[ ${waited} -ge ${max_wait_seconds} ]]; then
    log "ERROR: Migration task did not complete within ${max_wait_seconds}s"
    exit 1
  fi

  # Flush any remaining logs after the task stopped
  local final_log_args=(
    --region "${AWS_REGION}"
    --log-group-name "${log_group}"
    --log-stream-name "${log_stream}"
    --start-from-head
    --output text
    --query 'events[*].message'
  )
  if [[ -n "${next_token}" ]]; then
    final_log_args+=(--next-token "${next_token}")
  fi
  aws logs get-log-events "${final_log_args[@]}" 2>/dev/null || true

  local exit_code
  exit_code=$(aws ecs describe-tasks \
    --region "${AWS_REGION}" \
    --cluster "${cluster}" \
    --tasks "${task_arn}" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text)

  log "Migration task exit code: ${exit_code}"

  if [[ "${exit_code}" != "0" ]]; then
    echo ""
    log "ERROR: Migration task failed with exit code ${exit_code}"
    log "Check full logs: aws logs get-log-events --log-group-name ${log_group} --log-stream-name ${log_stream} --start-from-head --region ${AWS_REGION}"
    exit 1
  fi

  log ""
  log "╔══════════════════════════════════════════════════════╗"
  log "║  Database schema migrations completed successfully   ║"
  log "╚══════════════════════════════════════════════════════╝"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
log "=== Cyber Command Center — Database Migration ==="
log "Mode:        ${MODE}"
log "Environment: ${ENVIRONMENT}"
log ""

case "${MODE}" in
  direct)         run_direct         ;;
  github-actions) run_github_actions ;;
  ecs)            run_ecs            ;;
  *)
    echo "Unknown mode: ${MODE}. Use: direct | github-actions | ecs"
    exit 1
    ;;
esac
