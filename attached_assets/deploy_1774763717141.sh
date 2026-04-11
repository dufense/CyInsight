#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GRC Shield — ECS Fargate Deploy Script
#
# Handles: build → push to ECR → ECS rolling update (or full stack deploy)
#
# Prerequisites:
#   - AWS CLI v2 configured with sufficient IAM permissions
#   - Docker running locally
#   - CloudFormation stacks 01-vpc, 02-rds, 03-ecs already deployed
#
# Usage:
#   # Deploy (build + push + ECS update):
#   AWS_REGION=us-east-1 bash aws/scripts/deploy.sh
#
#   # Deploy a specific tag:
#   IMAGE_TAG=v1.2.3 AWS_REGION=us-east-1 bash aws/scripts/deploy.sh
#
#   # Deploy CloudFormation stacks from scratch:
#   DEPLOY_INFRA=true AWS_REGION=us-east-1 bash aws/scripts/deploy.sh
#
# Required environment variables:
#   AWS_REGION         — AWS region (e.g. us-east-1)
#   AWS_ACCOUNT_ID     — Auto-detected from STS if not set
#
# Optional environment variables:
#   IMAGE_TAG          — Docker image tag (default: git short SHA)
#   ENV_NAME           — CloudFormation environment name prefix (default: grc-shield)
#   DEPLOY_INFRA       — Set to "true" to (re)deploy CloudFormation stacks
#   DB_PASSWORD        — Required only when DEPLOY_INFRA=true
#   SESSION_SECRET_ARN — Required for 03-ecs stack
#   OPENAI_KEY_ARN     — Optional for 03-ecs stack
#   CERTIFICATE_ARN    — ACM certificate for HTTPS (optional)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-ap-south-1}"
ENV_NAME="${ENV_NAME:-grc-shield}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
DEPLOY_INFRA="${DEPLOY_INFRA:-false}"

info()  { echo "[INFO]  $*"; }
ok()    { echo "[OK]    $*"; }
warn()  { echo "[WARN]  $*"; }
die()   { echo "[ERROR] $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "'$1' is required. Install it and try again."; }
require_cmd aws
require_cmd docker

# ─── Resolve Account ID ───────────────────────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")}"
info "AWS Account:  $AWS_ACCOUNT_ID"
info "AWS Region:   $AWS_REGION"
info "Environment:  $ENV_NAME"
info "Image Tag:    $IMAGE_TAG"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ENV_NAME}/app"
CLUSTER="${ENV_NAME}-cluster"
SERVICE="${ENV_NAME}-app"

# ─── Step 1: (Optional) Deploy/Update CloudFormation Stacks ──────────────────
deploy_stack() {
  local stack_name="$1"
  local template="$2"
  shift 2
  local params=("$@")

  info "Deploying stack: $stack_name"
  aws cloudformation deploy \
    --region "$AWS_REGION" \
    --stack-name "$stack_name" \
    --template-file "$template" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    "${params[@]+"${params[@]}"}"
  ok "Stack deployed: $stack_name"
}

if [ "$DEPLOY_INFRA" = "true" ]; then
  info "─── Deploying CloudFormation infrastructure stacks ─────────────────"

  # 01 — VPC (no extra params needed, uses defaults)
  deploy_stack "${ENV_NAME}-vpc" "aws/cloudformation/01-vpc.yaml" \
    --parameter-overrides "EnvironmentName=${ENV_NAME}"

  # 02 — RDS
  [ -z "${DB_PASSWORD:-}" ] && die "DB_PASSWORD must be set when DEPLOY_INFRA=true"
  deploy_stack "${ENV_NAME}-rds" "aws/cloudformation/02-rds.yaml" \
    --parameter-overrides \
      "EnvironmentName=${ENV_NAME}" \
      "DBPassword=${DB_PASSWORD}" \
      "MultiAZ=true"

  # 03 — ECS (requires secrets ARNs)
  [ -z "${SESSION_SECRET_ARN:-}" ] && \
    die "SESSION_SECRET_ARN must be set. Run aws/scripts/create-secrets.sh first."

  ECS_PARAMS=(
    "EnvironmentName=${ENV_NAME}"
    "ImageTag=${IMAGE_TAG}"
    "SessionSecretArn=${SESSION_SECRET_ARN}"
  )
  [ -n "${OPENAI_KEY_ARN:-}"   ] && ECS_PARAMS+=("OpenAIKeyArn=${OPENAI_KEY_ARN}")
  [ -n "${GITHUB_TOKEN_ARN:-}" ] && ECS_PARAMS+=("GithubTokenArn=${GITHUB_TOKEN_ARN}")
  [ -n "${CERTIFICATE_ARN:-}"  ] && ECS_PARAMS+=("CertificateArn=${CERTIFICATE_ARN}")

  deploy_stack "${ENV_NAME}-ecs" "aws/cloudformation/03-ecs.yaml" \
    --parameter-overrides "${ECS_PARAMS[@]}"
fi

# ─── Step 2: Authenticate Docker to ECR ──────────────────────────────────────
info "─── Authenticating Docker to ECR ────────────────────────────────────"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ok "Docker authenticated to ECR"

# ─── Step 3: Build Docker image ──────────────────────────────────────────────
info "─── Building Docker image ───────────────────────────────────────────"
docker build \
  --platform linux/amd64 \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --build-arg GIT_SHA="${IMAGE_TAG}" \
  -t "${ECR_URI}:${IMAGE_TAG}" \
  -t "${ECR_URI}:latest" \
  .
ok "Image built: ${ECR_URI}:${IMAGE_TAG}"

# ─── Step 4: Push to ECR ─────────────────────────────────────────────────────
info "─── Pushing image to ECR ────────────────────────────────────────────"
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"
ok "Image pushed: ${ECR_URI}:${IMAGE_TAG}"

# ─── Step 5: Update ECS Service (rolling deploy) ──────────────────────────────
info "─── Triggering ECS rolling deployment ──────────────────────────────"

# Register new task definition revision with the updated image
TASK_FAMILY="${ENV_NAME}-app"
CURRENT_TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition "$TASK_FAMILY" \
  --region "$AWS_REGION" \
  --query 'taskDefinition' \
  --output json)

NEW_TASK_DEF=$(echo "$CURRENT_TASK_DEF" | python3 -c "
import json, sys
td = json.load(sys.stdin)
# Update image tag
for c in td['containerDefinitions']:
    if c['name'] == 'app':
        parts = c['image'].rsplit(':', 1)
        c['image'] = parts[0] + ':${IMAGE_TAG}'
# Remove read-only fields
for k in ['taskDefinitionArn','revision','status','requiresAttributes',
          'compatibilities','registeredAt','registeredBy']:
    td.pop(k, None)
print(json.dumps(td))
")

NEW_TASK_ARN=$(aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json "$NEW_TASK_DEF" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
ok "New task definition: $NEW_TASK_ARN"

# Update the ECS service to use the new task definition
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$NEW_TASK_ARN" \
  --force-new-deployment \
  --region "$AWS_REGION" > /dev/null
ok "ECS service update triggered"

# ─── Step 6: Wait for deployment to stabilize ────────────────────────────────
info "─── Waiting for ECS service to stabilize (may take ~3 min) ─────────"
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$AWS_REGION"
ok "ECS service is stable"

# ─── Step 7: Print summary ────────────────────────────────────────────────────
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "${ENV_NAME}-ecs" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
  --output text 2>/dev/null || echo "N/A")

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  GRC Shield deployed successfully!"
echo ""
echo "  Image:    ${ECR_URI}:${IMAGE_TAG}"
echo "  Cluster:  ${CLUSTER}"
echo "  Service:  ${SERVICE}"
echo "  Region:   ${AWS_REGION}"
[ "$ALB_DNS" != "N/A" ] && echo "  URL:      http://${ALB_DNS}"
echo "═══════════════════════════════════════════════════════════════"
