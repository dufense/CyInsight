#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GRC Shield — ECS Rollback Script
# Reverts the ECS service to the previous stable task definition revision.
#
# Usage:
#   AWS_REGION=us-east-1 bash aws/scripts/rollback.sh
#   AWS_REGION=us-east-1 REVISION=42 bash aws/scripts/rollback.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
ENV_NAME="${ENV_NAME:-grc-shield}"
TASK_FAMILY="${ENV_NAME}-app"
CLUSTER="${ENV_NAME}-cluster"
SERVICE="${ENV_NAME}-app"

info() { echo "[INFO]  $*"; }
ok()   { echo "[OK]    $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "'$1' is required."; }
require_cmd aws

CURRENT_REVISION=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].taskDefinition' \
  --output text | grep -oE '[0-9]+$')

info "Current task definition revision: $CURRENT_REVISION"

TARGET_REVISION="${REVISION:-$((CURRENT_REVISION - 1))}"
[ "$TARGET_REVISION" -lt 1 ] && die "Cannot rollback — no previous revision exists."

TARGET_TASK_ARN="arn:aws:ecs:${AWS_REGION}:$(aws sts get-caller-identity --query Account --output text):task-definition/${TASK_FAMILY}:${TARGET_REVISION}"

info "Rolling back to revision: $TARGET_REVISION"
info "Task ARN: $TARGET_TASK_ARN"

read -r -p "Confirm rollback to revision ${TARGET_REVISION}? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { info "Rollback cancelled."; exit 0; }

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "${TASK_FAMILY}:${TARGET_REVISION}" \
  --force-new-deployment \
  --region "$AWS_REGION" > /dev/null

info "Waiting for ECS service to stabilize..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$AWS_REGION"

ok "Rollback to revision ${TARGET_REVISION} completed."
