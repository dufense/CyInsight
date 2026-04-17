#!/usr/bin/env bash
##############################################################################
# deploy-stacks.sh — Deploy all CCC CloudFormation stacks in order
#
# Usage:
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=ap-south-1
#   export VPC_ID=vpc-xxxxxxxxx
#   export PUBLIC_SUBNETS="subnet-aaa,subnet-bbb"
#   export PRIVATE_SUBNETS="subnet-ccc,subnet-ddd"
#   export CERTIFICATE_ARN=arn:aws:acm:ap-south-1:...
#   export ENVIRONMENT=production
#   export IMAGE_TAG=v1.0.0
#
#   chmod +x deploy/ecs/scripts/deploy-stacks.sh
#   ./deploy/ecs/scripts/deploy-stacks.sh
#
# To deploy only a specific stack:
#   ./deploy/ecs/scripts/deploy-stacks.sh --stack prerequisites
#   ./deploy/ecs/scripts/deploy-stacks.sh --stack management
#   ./deploy/ecs/scripts/deploy-stacks.sh --stack data --region in-west-1
#   ./deploy/ecs/scripts/deploy-stacks.sh --stack receiver
##############################################################################

set -euo pipefail

AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
VPC_ID="${VPC_ID:?Set VPC_ID}"
PUBLIC_SUBNETS="${PUBLIC_SUBNETS:?Set PUBLIC_SUBNETS (comma-separated subnet IDs)}"
PRIVATE_SUBNETS="${PRIVATE_SUBNETS:?Set PRIVATE_SUBNETS (comma-separated subnet IDs)}"
CERTIFICATE_ARN="${CERTIFICATE_ARN:?Set CERTIFICATE_ARN}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
DEPLOY_STACK="all"
DATA_PLANE_REGION=""

DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)
ENABLE_CLICKHOUSE="${ENABLE_CLICKHOUSE:-false}"
MGMT_SG_ID="${MGMT_SG_ID:-}"         # Management ECS SG — required for clickhouse stack
DATA_PLANE_SG_ID="${DATA_PLANE_SG_ID:-}" # Data-plane ECS SG — optional
CH_INSTANCE_TYPE="${CH_INSTANCE_TYPE:-r6i.xlarge}"
CH_KEY_PAIR="${CH_KEY_PAIR:-}"        # EC2 key pair name — required for clickhouse stack

while [[ $# -gt 0 ]]; do
  case $1 in
    --stack)  DEPLOY_STACK="$2"; shift 2 ;;
    --region) DATA_PLANE_REGION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

cfn_deploy() {
  local stack_name="$1"
  local template="$2"
  shift 2
  local params=("$@")

  log "Deploying CloudFormation stack: ${stack_name}"
  aws cloudformation deploy \
    --region "${AWS_REGION}" \
    --stack-name "${stack_name}" \
    --template-file "${template}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "${params[@]}"

  log "✓ Stack ${stack_name} deployed"
}

cfn_output() {
  local stack_name="$1"
  local output_key="$2"
  aws cloudformation describe-stacks \
    --region "${AWS_REGION}" \
    --stack-name "${stack_name}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
    --output text
}

deploy_prerequisites() {
  cfn_deploy "ccc-prerequisites" \
    "deploy/ecs/cloudformation/prerequisites.yml" \
    "EnvironmentName=${ENVIRONMENT}"
}

deploy_management() {
  local image_uri="${ECR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}"
  cfn_deploy "ccc-management-plane" \
    "deploy/ecs/cloudformation/management-plane.yml" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcId=${VPC_ID}" \
    "PublicSubnetIds=${PUBLIC_SUBNETS}" \
    "PrivateSubnetIds=${PRIVATE_SUBNETS}" \
    "CertificateArn=${CERTIFICATE_ARN}" \
    "ImageUri=${image_uri}"

  log "Management Plane ALB DNS:"
  cfn_output "ccc-management-plane" "ALBDNSName"
}

deploy_data_plane() {
  local dp_region="${1:?Provide data plane region}"
  local image_uri="${ECR_REGISTRY}/ccc-data-plane:${IMAGE_TAG}"
  local mgmt_sg
  mgmt_sg=$(cfn_output "ccc-management-plane" "ECSSecurityGroupId")

  cfn_deploy "ccc-data-plane-${dp_region}" \
    "deploy/ecs/cloudformation/data-plane.yml" \
    "EnvironmentName=${ENVIRONMENT}" \
    "DataPlaneRegion=${dp_region}" \
    "VpcId=${VPC_ID}" \
    "PrivateSubnetIds=${PRIVATE_SUBNETS}" \
    "ManagementPlaneSecurityGroupId=${mgmt_sg}" \
    "ImageUri=${image_uri}"

  log "Data Plane (${dp_region}) Internal ALB DNS:"
  cfn_output "ccc-data-plane-${dp_region}" "InternalALBDNSName"
}

deploy_receiver() {
  local image_uri="${ECR_REGISTRY}/ccc-receiver-plane:${IMAGE_TAG}"
  cfn_deploy "ccc-receiver-plane" \
    "deploy/ecs/cloudformation/receiver-plane.yml" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcId=${VPC_ID}" \
    "PublicSubnetIds=${PUBLIC_SUBNETS}" \
    "PrivateSubnetIds=${PRIVATE_SUBNETS}" \
    "ImageUri=${image_uri}"

  log "Receiver Plane NLB DNS:"
  cfn_output "ccc-receiver-plane" "NLBDNSName"
}

deploy_clickhouse() {
  # Required env vars for this function:
  #   MGMT_SG_ID       — management-plane ECS security group ID
  #   CH_KEY_PAIR      — EC2 key pair name for break-glass SSH access
  #
  # Optional:
  #   DATA_PLANE_SG_ID  — data-plane ECS security group ID (leave empty to skip)
  #   CH_INSTANCE_TYPE  — EC2 instance type (default: r6i.xlarge)

  if [[ -z "${MGMT_SG_ID}" ]]; then
    # Auto-discover from management-plane stack outputs
    MGMT_SG_ID=$(cfn_output "ccc-management-plane" "ECSSecurityGroupId" 2>/dev/null || echo "")
  fi

  if [[ -z "${MGMT_SG_ID}" ]]; then
    echo "ERROR: MGMT_SG_ID is required. Either set it explicitly or deploy management-plane first."
    exit 1
  fi

  if [[ -z "${CH_KEY_PAIR}" ]]; then
    echo "ERROR: CH_KEY_PAIR is required. Set it to an existing EC2 key pair name."
    exit 1
  fi

  local params=(
    "EnvironmentName=${ENVIRONMENT}"
    "VpcId=${VPC_ID}"
    "PrivateSubnetIds=${PRIVATE_SUBNETS}"
    "ManagementECSSecurityGroupId=${MGMT_SG_ID}"
    "KeyPairName=${CH_KEY_PAIR}"
    "InstanceType=${CH_INSTANCE_TYPE}"
  )

  if [[ -n "${DATA_PLANE_SG_ID}" ]]; then
    params+=("DataPlaneECSSecurityGroupId=${DATA_PLANE_SG_ID}")
  fi

  cfn_deploy "ccc-clickhouse" \
    "deploy/ecs/cloudformation/clickhouse.yml" \
    "${params[@]}"

  log "ClickHouse NLB URL:"
  cfn_output "ccc-clickhouse" "ClickHouseNLBDNS"
  log ""
  log "Next: store the NLB URL in Secrets Manager under ccc/shared/clickhouse-url"
  log "      (and per-region: ccc/data-plane/<region>/clickhouse-url)"
  log "      then re-deploy management/data planes with EnableClickHouse=true"
}

case "${DEPLOY_STACK}" in
  prerequisites)
    deploy_prerequisites
    ;;
  management)
    deploy_management
    ;;
  data)
    if [[ -n "${DATA_PLANE_REGION}" ]]; then
      deploy_data_plane "${DATA_PLANE_REGION}"
    else
      for region in "${DATA_PLANE_REGIONS[@]}"; do
        deploy_data_plane "${region}"
      done
    fi
    ;;
  receiver)
    deploy_receiver
    ;;
  clickhouse)
    deploy_clickhouse
    ;;
  all)
    log "=== Step 1/4: Prerequisites (ECR + IAM + S3) ==="
    deploy_prerequisites

    log "=== Step 2/4: Management Plane ==="
    deploy_management

    log "=== Step 3/4: Data Planes (all 5 regions) ==="
    for region in "${DATA_PLANE_REGIONS[@]}"; do
      deploy_data_plane "${region}"
    done

    log "=== Step 4/4: Receiver Plane ==="
    deploy_receiver

    log ""
    log "╔══════════════════════════════════════════════════════╗"
    log "║  Cyber Command Center deployed to ECS Fargate ✓      ║"
    log "╚══════════════════════════════════════════════════════╝"
    log ""
    log "Management Plane URL: https://$(cfn_output ccc-management-plane ALBDNSName)"
    log "Receiver NLB:         $(cfn_output ccc-receiver-plane NLBDNSName)"
    ;;
  *)
    echo "Unknown stack: ${DEPLOY_STACK}"
    echo "Use: prerequisites | management | data | receiver | clickhouse | all"
    exit 1
    ;;
esac
