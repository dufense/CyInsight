#!/usr/bin/env bash
##############################################################################
# Cyber Command Center -- AWS Multi-Region HA Full Deploy Script
#
# Architecture: Management plane in India + 3 HA data planes
#
#   Plane              Region        VPC CIDR        Stack prefix
#   ─────────────────  ────────────  ──────────────  ─────────────────────
#   Management         ap-south-1    10.10.0.0/16    ccc-vpc / ccc-management-ecs
#   Data plane Mumbai  ap-south-1    10.20.0.0/16    ccc-dp-vpc-mumbai / ccc-data-plane-mumbai
#   Data plane Bahrain me-south-1    10.30.0.0/16    ccc-dp-vpc-bahrain / ccc-data-plane-bahrain
#   Data plane Kenya   af-south-1    10.40.0.0/16    ccc-dp-vpc-kenya   / ccc-data-plane-kenya
#
# Connectivity:
#   Management <──VPC peering──> Mumbai (internal ALB, private routing)
#   Management <──HTTPS+NAT EIP─> Bahrain (internet-facing ALB, EIP allowlist)
#   Management <──HTTPS+NAT EIP─> Kenya   (internet-facing ALB, EIP allowlist)
#
# CloudFormation stacks deployed in dependency order:
#   01. ccc-vpc               -- Management VPC (3-tier, 2-AZ + 3rd MSK subnet)
#   02. ccc-aurora-management -- Aurora Serverless v2 (management OLTP, MaxACU=128, RDS Proxy)
#   03. ccc-msk-kafka         -- MSK Kafka (m5.xlarge/1TB/500 MB/s -- 100-500 GB/day)
#   05. ccc-data-lake         -- S3 + Iceberg + Glue + Athena
#   06. ccc-management-ecs    -- Management plane ECS Fargate + ALB
#   07. ccc-dp-vpc-*          -- Data plane HA VPCs (one per region)
#   08. ccc-cross-region-security -- VPC peering routes + NAT EIP registry
#   09. ccc-clickhouse         -- ClickHouse 3-node OLAP (r6i.2xlarge/500 GiB/12000 IOPS)
#   10. ccc-dp-rds-*          -- Data plane Aurora + RDS Proxy (per region, isolated)
#   11. ccc-data-plane-*      -- Data plane ECS Fargate (3 regions, HA)
#   12. ccc-platform-updates  -- v2 Feature Pack: Redis, Read Replica, Response Engine
#
# Usage:
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=ap-south-1          # management plane region
#   export IMAGE_TAG=v2.0.0
#   export CERTIFICATE_ARN=arn:aws:acm:ap-south-1:...:certificate/...
#   export DB_PASSWORD=$(openssl rand -base64 32)
#   export OS_PASSWORD=$(openssl rand -base64 24)
#
#   chmod +x deploy/aws/scripts/deploy-all.sh
#   ./deploy/aws/scripts/deploy-all.sh
#
# Selective deploy:
#   ./deploy/aws/scripts/deploy-all.sh --stack vpc
#   ./deploy/aws/scripts/deploy-all.sh --stack aurora
#   ./deploy/aws/scripts/deploy-all.sh --stack kafka
#   ./deploy/aws/scripts/deploy-all.sh --stack datalake
#   ./deploy/aws/scripts/deploy-all.sh --stack management
#   ./deploy/aws/scripts/deploy-all.sh --stack dp-vpc           # all 3 data plane VPCs
#   ./deploy/aws/scripts/deploy-all.sh --stack dp-vpc --region mumbai
#   ./deploy/aws/scripts/deploy-all.sh --stack cross-region-security
#   ./deploy/aws/scripts/deploy-all.sh --stack data-plane       # all 3 data plane ECS
#   ./deploy/aws/scripts/deploy-all.sh --stack data-plane --region bahrain
#   ./deploy/aws/scripts/deploy-all.sh --stack clickhouse
#   ./deploy/aws/scripts/deploy-all.sh --stack platform-updates
#   ./deploy/aws/scripts/deploy-all.sh --stack dp-rds            # all 3 data plane Aurora clusters
#   ./deploy/aws/scripts/deploy-all.sh --stack dp-rds --region mumbai
#
# ClickHouse optional vars (right-sized defaults for 100-500 GB/day):
#   export CH_INSTANCE_TYPE=r6i.2xlarge     (default -- was r6i.xlarge)
#   export CH_HOT_DISK_GIB=500             (default -- was 200)
#   export CH_VERSION=24.8                 (default)
#
# Data plane cert ARNs (required for Bahrain/Kenya internet-facing ALBs):
#   export CERT_ARN_BAHRAIN=arn:aws:acm:me-south-1:...:certificate/...
#   export CERT_ARN_KENYA=arn:aws:acm:af-south-1:...:certificate/...
#
# Data plane Aurora password (required for dp-rds step):
#   export DP_DB_PASSWORD=$(openssl rand -base64 32)
##############################################################################

set -euo pipefail

# ── Always-required environment variables ────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOY_STACK="${DEPLOY_STACK:-all}"
DATA_PLANE_REGION_FILTER=""

# Stack-specific vars: evaluated lazily so --stack vpc etc. don't require all of them.
# Set to empty by default; preflight_check() validates them for stacks that need them.
CERTIFICATE_ARN="${CERTIFICATE_ARN:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
OS_PASSWORD="${OS_PASSWORD:-}"
DP_DB_PASSWORD="${DP_DB_PASSWORD:-}"

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TEMPLATE_DIR="deploy/aws/cloudformation"

# Three data plane regions (logical name -> AWS region code).
# Mumbai shares ap-south-1 with the management plane; it uses an internal ALB
# via VPC peering. Bahrain and Kenya use internet-facing ALBs restricted to
# management plane NAT Gateway EIPs.
DATA_PLANE_REGIONS=(mumbai bahrain kenya)

declare -A DP_AWS_REGION=(
  [mumbai]=ap-south-1
  [bahrain]=me-south-1
  [kenya]=af-south-1
)

declare -A DP_VPC_CIDR=(
  [mumbai]="10.20.0.0/16"
  [bahrain]="10.30.0.0/16"
  [kenya]="10.40.0.0/16"
)

declare -A DP_ALB_SCHEME=(
  [mumbai]="internal"
  [bahrain]="internet-facing"
  [kenya]="internet-facing"
)

# ACM certificate ARNs for internet-facing data plane ALBs (Bahrain/Kenya).
# These must be in the respective data plane AWS region.
CERT_ARN_BAHRAIN="${CERT_ARN_BAHRAIN:-}"
CERT_ARN_KENYA="${CERT_ARN_KENYA:-}"

declare -A DP_CERT_ARN=(
  [mumbai]=""
  [bahrain]="${CERT_ARN_BAHRAIN}"
  [kenya]="${CERT_ARN_KENYA}"
)

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --stack)  DEPLOY_STACK="$2";           shift 2 ;;
    --region) DATA_PLANE_REGION_FILTER="$2"; shift 2 ;;
    --env)    ENVIRONMENT="$2";            shift 2 ;;
    --tag)    IMAGE_TAG="$2";              shift 2 ;;
    -h|--help)
      grep "^#" "$0" | sed 's/^# //' | head -30
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# Validate stack-specific required env vars before each deploy function.
# Only the stacks that need them will call require_vars().
require_vars() {
  local missing=()
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("${var}")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: Missing required env vars for --stack ${DEPLOY_STACK}: ${missing[*]}" >&2
    exit 1
  fi
}

cfn_deploy() {
  local stack_name="$1"
  local template="$2"
  local region="${3:-${AWS_REGION}}"
  shift 3
  local params=("$@")

  log "Deploying stack: ${stack_name} (region: ${region})"
  aws cloudformation deploy \
    --region "${region}" \
    --stack-name "${stack_name}" \
    --template-file "${template}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "${params[@]}"

  log "Stack deployed: ${stack_name}"
}

cfn_output() {
  local stack_name="$1"
  local output_key="$2"
  local region="${3:-${AWS_REGION}}"
  aws cloudformation describe-stacks \
    --region "${region}" \
    --stack-name "${stack_name}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
    --output text
}

ssm_get() {
  local param_path="$1"
  local region="${2:-${AWS_REGION}}"
  aws ssm get-parameter \
    --region "${region}" \
    --name "${param_path}" \
    --query "Parameter.Value" \
    --output text 2>/dev/null || echo ""
}

# ── Stack Deploy Functions ───────────────────────────────────────────────────
deploy_vpc() {
  cfn_deploy "ccc-vpc" \
    "${TEMPLATE_DIR}/01-vpc.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}"
  log "Management VPC ID: $(cfn_output ccc-vpc VpcId)"
}

deploy_aurora() {
  require_vars DB_PASSWORD
  cfn_deploy "ccc-aurora-management" \
    "${TEMPLATE_DIR}/02-aurora-management.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcStackName=ccc-vpc" \
    "DBPassword=${DB_PASSWORD}" \
    "DBName=ccc_management" \
    "DBUsername=ccc_admin"
  log "Aurora endpoint: $(cfn_output ccc-aurora-management ClusterEndpoint)"
}

deploy_kafka() {
  cfn_deploy "ccc-msk-kafka" \
    "${TEMPLATE_DIR}/03-msk-kafka.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcStackName=ccc-vpc"
  log "MSK brokers (TLS): $(cfn_output ccc-msk-kafka BootstrapBrokersTLS)"
}

deploy_datalake() {
  cfn_deploy "ccc-data-lake" \
    "${TEMPLATE_DIR}/05-data-lake.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}"
  log "Raw events bucket: $(cfn_output ccc-data-lake RawEventsBucketName)"
  log "Iceberg bucket:    $(cfn_output ccc-data-lake ProcessedBucketName)"
}

deploy_management() {
  require_vars CERTIFICATE_ARN
  local management_image="${ECR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}"

  # Enable Bedrock IAM policy when AI_PROVIDER is set to bedrock.
  local enable_bedrock="false"
  if [[ "${AI_PROVIDER:-}" == "bedrock" ]]; then
    enable_bedrock="true"
    log "AI_PROVIDER=bedrock detected — attaching BedrockPolicy to ECS Task Role"
  fi

  # ClickHouse wiring: empty on first pass (before ClickHouse stack exists),
  # set to ccc-clickhouse on the post-ClickHouse re-deploy so the management
  # plane container gets CLICKHOUSE_URL/USER/DATABASE/PASSWORD injected.
  local ch_stack_param="ClickHouseStackName="
  if aws cloudformation describe-stacks --stack-name ccc-clickhouse \
      --region "${AWS_REGION}" >/dev/null 2>&1; then
    ch_stack_param="ClickHouseStackName=ccc-clickhouse"
    log "ClickHouse stack detected — wiring CLICKHOUSE_* env into management plane"
  fi

  cfn_deploy "ccc-management-ecs" \
    "${TEMPLATE_DIR}/06-management-ecs.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcStackName=ccc-vpc" \
    "AuroraStackName=ccc-aurora-management" \
    "MSKStackName=ccc-msk-kafka" \
    "DataLakeStackName=ccc-data-lake" \
    "CertificateArn=${CERTIFICATE_ARN}" \
    "ImageUri=${management_image}" \
    "EnableBedrock=${enable_bedrock}" \
    "${ch_stack_param}"

  log "Management Plane URL: https://$(cfn_output ccc-management-ecs ALBDNSName)"
}

deploy_data_plane_vpc() {
  local dp="${1:?Provide data plane logical name (mumbai|bahrain|kenya)}"
  local dp_aws_region="${DP_AWS_REGION[$dp]}"
  local dp_cidr="${DP_VPC_CIDR[$dp]}"
  local stack_name="ccc-dp-vpc-${dp}"

  # Mumbai: add VPC peering request to management VPC
  local peering_params=()
  if [[ "${dp}" == "mumbai" ]]; then
    local mgmt_vpc_id
    mgmt_vpc_id=$(cfn_output "ccc-vpc" VpcId "${AWS_REGION}")
    peering_params=(
      "PeeringRequesterVpcId=${mgmt_vpc_id}"
      "PeeringRequesterCidr=10.10.0.0/16"
    )
    log "Mumbai: adding VPC peering to management VPC ${mgmt_vpc_id}"
  fi

  # Compute per-region subnet CIDRs from the data plane CIDR prefix
  local octet2
  octet2=$(echo "${dp_cidr}" | cut -d. -f2)

  cfn_deploy "${stack_name}" \
    "${TEMPLATE_DIR}/10-data-plane-ha-vpc.yml" \
    "${dp_aws_region}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "DataPlaneId=${dp}" \
    "VpcCidr=${dp_cidr}" \
    "PublicSubnet1Cidr=10.${octet2}.1.0/24" \
    "PublicSubnet2Cidr=10.${octet2}.2.0/24" \
    "PublicSubnet3Cidr=10.${octet2}.3.0/24" \
    "PrivateSubnet1Cidr=10.${octet2}.10.0/24" \
    "PrivateSubnet2Cidr=10.${octet2}.11.0/24" \
    "PrivateSubnet3Cidr=10.${octet2}.12.0/24" \
    "IsolatedSubnet1Cidr=10.${octet2}.20.0/24" \
    "IsolatedSubnet2Cidr=10.${octet2}.21.0/24" \
    "IsolatedSubnet3Cidr=10.${octet2}.22.0/24" \
    "${peering_params[@]+"${peering_params[@]}"}"

  log "Data Plane VPC [${dp}/${dp_aws_region}] VpcId: $(cfn_output "${stack_name}" VpcId "${dp_aws_region}")"
  log "  NAT EIP 1: $(cfn_output "${stack_name}" NatEip1 "${dp_aws_region}")"
  log "  NAT EIP 2: $(cfn_output "${stack_name}" NatEip2 "${dp_aws_region}")"
  log "  NAT EIP 3: $(cfn_output "${stack_name}" NatEip3 "${dp_aws_region}")"
}

deploy_cross_region_security() {
  # Read the Mumbai VPC peering connection ID created by the Mumbai DP VPC stack
  local peering_id
  peering_id=$(cfn_output "ccc-dp-vpc-mumbai" VpcPeeringConnectionId "${AWS_REGION}")

  if [[ -z "${peering_id}" ]]; then
    log "WARNING: Could not read VpcPeeringConnectionId from ccc-dp-vpc-mumbai."
    log "         Ensure ccc-dp-vpc-mumbai is deployed first (--stack dp-vpc --region mumbai)."
    return 1
  fi

  log "Mumbai VPC Peering ID: ${peering_id}"

  cfn_deploy "ccc-cross-region-security" \
    "${TEMPLATE_DIR}/11-cross-region-security.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "ManagementVpcStackName=ccc-vpc" \
    "MumbaiDataPlaneVpcStackName=ccc-dp-vpc-mumbai" \
    "PeeringConnectionId=${peering_id}"

  log "Cross-region security deployed."
  log "  Management NAT EIP 1: $(cfn_output ccc-cross-region-security MgmtNatEip1)"
  log "  Management NAT EIP 2: $(cfn_output ccc-cross-region-security MgmtNatEip2)"
  log "  (These EIPs are auto-injected into Bahrain/Kenya data plane stacks)"
}

deploy_data_plane() {
  local dp="${1:?Provide data plane logical name (mumbai|bahrain|kenya)}"
  local dp_aws_region="${DP_AWS_REGION[$dp]}"
  local dp_alb_scheme="${DP_ALB_SCHEME[$dp]}"
  local dp_cert_arn="${DP_CERT_ARN[$dp]:-}"

  # Per-region ECR registry (each region needs its own ECR endpoint)
  local dp_ecr_registry="${AWS_ACCOUNT_ID}.dkr.ecr.${dp_aws_region}.amazonaws.com"
  local data_image="${dp_ecr_registry}/ccc-data-plane:${IMAGE_TAG}"
  local vpc_stack_name="ccc-dp-vpc-${dp}"
  local stack_name="ccc-data-plane-${dp}"

  # Validate cert ARN for internet-facing ALBs.
  # Template gracefully handles empty cert (HTTP-only forward, no HTTPS listener).
  # Strongly recommend providing cert for production Bahrain/Kenya deployments.
  if [[ "${dp_alb_scheme}" == "internet-facing" && -z "${dp_cert_arn}" ]]; then
    log "WARNING: ${dp} uses internet-facing ALB but CERT_ARN_${dp^^} is not set."
    log "         Set CERT_ARN_BAHRAIN or CERT_ARN_KENYA for HTTPS (recommended)."
    log "         Proceeding with HTTP-only ALB (no HTTPS listener will be created)."
  fi

  # Read management NAT EIPs from SSM (populated by deploy_cross_region_security)
  local mgmt_nat_eip1=""
  local mgmt_nat_eip2=""
  if [[ "${dp_alb_scheme}" == "internet-facing" ]]; then
    mgmt_nat_eip1=$(ssm_get "/ccc/${ENVIRONMENT}/mgmt-nat-eip-1")
    mgmt_nat_eip2=$(ssm_get "/ccc/${ENVIRONMENT}/mgmt-nat-eip-2")
    if [[ -z "${mgmt_nat_eip1}" ]]; then
      log "WARNING: management NAT EIP not found in SSM (/ccc/${ENVIRONMENT}/mgmt-nat-eip-1)."
      log "         Run --stack cross-region-security first to register NAT EIPs."
    fi
  fi

  # Wire ClickHouse if already deployed in management region
  local ch_stack_param="ClickHouseStackName="
  if aws cloudformation describe-stacks \
      --region "${AWS_REGION}" \
      --stack-name "ccc-clickhouse" &>/dev/null 2>&1; then
    ch_stack_param="ClickHouseStackName=ccc-clickhouse"
    log "ClickHouse stack detected — wiring CLICKHOUSE_URL into data-plane [${dp}]"
  fi

  # Wire per-region data plane Aurora + RDS Proxy if already deployed
  local dp_rds_stack_param="DataPlaneRDSStackName="
  local dp_rds_stack_name="ccc-dp-rds-${dp}"
  if aws cloudformation describe-stacks \
      --region "${dp_aws_region}" \
      --stack-name "${dp_rds_stack_name}" &>/dev/null 2>&1; then
    dp_rds_stack_param="DataPlaneRDSStackName=${dp_rds_stack_name}"
    log "Data plane RDS stack detected [${dp_rds_stack_name}] — wiring DATA_PLANE_DB_URL + DATA_PLANE_RDS_PROXY into data-plane [${dp}]"
  fi

  # Private subnet 3 for 3-AZ ECS task spread (from HA VPC stack)
  local private_subnet3
  private_subnet3=$(cfn_output "${vpc_stack_name}" PrivateSubnet3Id "${dp_aws_region}")

  cfn_deploy "${stack_name}" \
    "${TEMPLATE_DIR}/07-data-plane-ecs.yml" \
    "${dp_aws_region}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "DataPlaneRegion=${dp}" \
    "RegionCode=${dp_aws_region}" \
    "DataPlaneId=${dp}" \
    "AlbScheme=${dp_alb_scheme}" \
    "AlbCertificateArn=${dp_cert_arn}" \
    "ManagementNatEip1=${mgmt_nat_eip1}" \
    "ManagementNatEip2=${mgmt_nat_eip2}" \
    "ManagementVpcCidr=10.10.0.0/16" \
    "VpcPrivateSubnet3Id=${private_subnet3}" \
    "VpcStackName=${vpc_stack_name}" \
    "MSKStackName=ccc-msk-kafka" \
    "DataLakeStackName=ccc-data-lake" \
    "AuroraStackName=ccc-aurora-management" \
    "ImageUri=${data_image}" \
    "${ch_stack_param}" \
    "${dp_rds_stack_param}"

  log "Data Plane [${dp}/${dp_aws_region}] ALB: $(cfn_output "${stack_name}" ALBDNSName "${dp_aws_region}")"
}

deploy_platform_updates() {
  require_vars CERTIFICATE_ARN
  local management_image="${ECR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}"

  # Optional: set CREATE_READ_REPLICA=true to spin up an Aurora read replica.
  local create_replica="${CREATE_READ_REPLICA:-false}"

  # AI model override (defaults to gpt-4o in the template).
  local ai_model="${AI_MODEL:-gpt-4o}"
  local ai_max_tokens="${AI_MAX_TOKENS:-4096}"

  log "Deploying Platform Feature Pack v2 (Tasks #119-#127)..."
  log "  Image:           ${management_image}"
  log "  Read Replica:    ${create_replica}"
  log "  AI Model:        ${ai_model}"

  cfn_deploy "ccc-platform-updates" \
    "${TEMPLATE_DIR}/09-platform-updates.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcStackName=ccc-vpc" \
    "AuroraStackName=ccc-aurora-management" \
    "ManagementECSStackName=ccc-management-ecs" \
    "ImageUri=${management_image}" \
    "CreateReadReplica=${create_replica}" \
    "AIModel=${ai_model}" \
    "AIMaxTokens=${ai_max_tokens}" \
    "MalwareAnalysisEnabled=true" \
    "ResponseEngineEnabled=true" \
    "LearningEngineEnabled=true"

  log "Platform updates deployed."
  log "  Redis endpoint:         $(cfn_output ccc-platform-updates RedisEndpoint)"
  log "  Task Definition ARN:    $(cfn_output ccc-platform-updates UpdatedTaskDefinitionArn)"
  if [[ "${create_replica}" == "true" ]]; then
    log "  Read Replica endpoint:  $(cfn_output ccc-platform-updates ReadReplicaEndpoint)"
  fi
}

deploy_clickhouse() {
  # Generate a secure admin password if not already in SSM
  local ch_ssm_path="/ccc/clickhouse/admin-password"
  if ! aws ssm get-parameter \
      --region "${AWS_REGION}" \
      --name "${ch_ssm_path}" &>/dev/null 2>&1; then
    log "Generating ClickHouse admin password in SSM..."
    local ch_pass
    ch_pass=$(openssl rand -base64 32)
    aws ssm put-parameter \
      --region "${AWS_REGION}" \
      --name "${ch_ssm_path}" \
      --value "${ch_pass}" \
      --type "SecureString" \
      --description "CCC ClickHouse cluster admin password" \
      --overwrite
    log "ClickHouse admin password stored at SSM:${ch_ssm_path}"
  else
    log "ClickHouse admin password already exists in SSM (${ch_ssm_path})"
  fi

  local ch_instance_type="${CH_INSTANCE_TYPE:-r6i.2xlarge}"
  local ch_hot_disk="${CH_HOT_DISK_GIB:-500}"
  local ch_version="${CH_VERSION:-24.8}"

  cfn_deploy "ccc-clickhouse" \
    "${TEMPLATE_DIR}/08-clickhouse-cluster.yml" \
    "${AWS_REGION}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "VpcStackName=ccc-vpc" \
    "MskStackName=ccc-msk-kafka" \
    "DataLakeStackName=ccc-data-lake" \
    "ClickHouseVersion=${ch_version}" \
    "InstanceType=${ch_instance_type}" \
    "HotDiskSizeGiB=${ch_hot_disk}"

  log "ClickHouse NLB (native):  $(cfn_output ccc-clickhouse ClickHouseNLBDNS)"
  log "ClickHouse ALB (HTTP):    $(cfn_output ccc-clickhouse ClickHouseALBDNS)"
  log "ClickHouse HTTP URL:      $(cfn_output ccc-clickhouse ClickHouseHTTPUrl)"
}

deploy_data_plane_rds() {
  # Deploy a dedicated per-region Aurora Serverless v2 PostgreSQL cluster + RDS Proxy
  # for data plane event metadata isolation (12-data-plane-rds.yml).
  # Must run AFTER deploy_data_plane_vpc and BEFORE deploy_data_plane (ECS tasks).
  local dp="${1:?Provide data plane logical name (mumbai|bahrain|kenya)}"
  local dp_aws_region="${DP_AWS_REGION[$dp]}"
  local vpc_stack_name="ccc-dp-vpc-${dp}"
  local stack_name="ccc-dp-rds-${dp}"

  require_vars DP_DB_PASSWORD

  cfn_deploy "${stack_name}" \
    "${TEMPLATE_DIR}/12-data-plane-rds.yml" \
    "${dp_aws_region}" \
    "EnvironmentName=${ENVIRONMENT}" \
    "DataPlaneId=${dp}" \
    "VpcStackName=${vpc_stack_name}" \
    "DBPassword=${DP_DB_PASSWORD}" \
    "DBName=ccc_events" \
    "DBUsername=ccc_dp_admin"

  log "Data Plane RDS [${dp}/${dp_aws_region}]:"
  log "  Aurora writer:   $(cfn_output "${stack_name}" ClusterEndpoint "${dp_aws_region}")"
  log "  Aurora reader:   $(cfn_output "${stack_name}" ReaderEndpoint "${dp_aws_region}")"
  log "  RDS Proxy:       $(cfn_output "${stack_name}" RDSProxyEndpoint "${dp_aws_region}")"
}

# ── ECR Authentication ───────────────────────────────────────────────────────
ecr_login() {
  log "Authenticating with ECR..."
  aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"
}

# ── Main dispatch ────────────────────────────────────────────────────────────
case "${DEPLOY_STACK}" in
  vpc)
    deploy_vpc
    ;;
  aurora)
    deploy_aurora
    ;;
  kafka)
    deploy_kafka
    ;;
  datalake|data-lake)
    deploy_datalake
    ;;
  management)
    deploy_management
    ;;
  dp-vpc)
    if [[ -n "${DATA_PLANE_REGION_FILTER}" ]]; then
      deploy_data_plane_vpc "${DATA_PLANE_REGION_FILTER}"
    else
      for dp in "${DATA_PLANE_REGIONS[@]}"; do
        deploy_data_plane_vpc "${dp}"
      done
    fi
    ;;
  cross-region-security)
    deploy_cross_region_security
    ;;
  data-plane)
    if [[ -n "${DATA_PLANE_REGION_FILTER}" ]]; then
      deploy_data_plane "${DATA_PLANE_REGION_FILTER}"
    else
      for dp in "${DATA_PLANE_REGIONS[@]}"; do
        deploy_data_plane "${dp}"
      done
    fi
    ;;
  clickhouse)
    deploy_clickhouse
    ;;
  dp-rds)
    if [[ -n "${DATA_PLANE_REGION_FILTER}" ]]; then
      deploy_data_plane_rds "${DATA_PLANE_REGION_FILTER}"
    else
      for dp in "${DATA_PLANE_REGIONS[@]}"; do
        deploy_data_plane_rds "${dp}"
      done
    fi
    ;;
  platform-updates)
    deploy_platform_updates
    ;;
  all)
    log "============================================================"
    log "  Cyber Command Center -- Full Multi-Cloud Data Lake Deploy"
    log "  Environment: ${ENVIRONMENT}"
    log "  Region:      ${AWS_REGION}"
    log "  Image tag:   ${IMAGE_TAG}"
    log "============================================================"

    log ""
    log "=== Step 01/12: Management VPC + Networking (ap-south-1) ==="
    deploy_vpc

    log ""
    log "=== Step 02/12: Aurora Serverless v2 (Management OLTP, MaxACU=128, RDS Proxy) ==="
    deploy_aurora

    log ""
    log "=== Step 03/12: MSK Kafka (m5.xlarge/1TB, 500 MB/s -- 100-500 GB/day sized) ==="
    deploy_kafka

    log ""
    log "=== Step 04/12: S3 + Iceberg Data Lake ==="
    deploy_datalake

    log ""
    log "=== Step 06/12: Management Plane ECS Fargate ==="
    deploy_management

    log ""
    log "=== Step 07/12: Data Plane HA VPCs (Mumbai/Bahrain/Kenya) ==="
    for dp in "${DATA_PLANE_REGIONS[@]}"; do
      deploy_data_plane_vpc "${dp}"
    done

    log ""
    log "=== Step 08/12: Cross-Region Security (Peering Routes + NAT EIP Registry) ==="
    deploy_cross_region_security

    log ""
    log "=== Step 09/12: ClickHouse OLAP Cluster (r6i.2xlarge, 500 GiB, 12000 IOPS) ==="
    deploy_clickhouse

    log ""
    log "=== Step 09b/12: Re-deploy Management Plane to inject CLICKHOUSE_* env ==="
    deploy_management

    log ""
    log "=== Step 10/12: Data Plane Aurora + RDS Proxy (per region -- Mumbai/Bahrain/Kenya) ==="
    for dp in "${DATA_PLANE_REGIONS[@]}"; do
      deploy_data_plane_rds "${dp}"
    done

    log ""
    log "=== Step 11/12: Data Plane ECS Fargate (3 regions -- Mumbai/Bahrain/Kenya) ==="
    for dp in "${DATA_PLANE_REGIONS[@]}"; do
      deploy_data_plane "${dp}"
    done

    log ""
    log "=== Step 12/12: Platform Feature Pack v2 (Redis + Response Engine + Learning) ==="
    deploy_platform_updates

    log ""
    log "╔══════════════════════════════════════════════════════════════════╗"
    log "║   Cyber Command Center -- Multi-Region HA Deployment Complete     ║"
    log "╚══════════════════════════════════════════════════════════════════╝"
    log ""
    log "Management Plane:          https://$(cfn_output ccc-management-ecs ALBDNSName)"
    log "Aurora Endpoint:           $(cfn_output ccc-aurora-management ClusterEndpoint)"
    log "Aurora RDS Proxy:          $(cfn_output ccc-aurora-management RDSProxyEndpoint)"
    log "Raw Events S3:             s3://$(cfn_output ccc-data-lake RawEventsBucketName)"
    log "Iceberg S3:                s3://$(cfn_output ccc-data-lake ProcessedBucketName)"
    log "ClickHouse NLB (native):   $(cfn_output ccc-clickhouse ClickHouseNLBDNS)"
    log "Redis Endpoint:            $(cfn_output ccc-platform-updates RedisEndpoint)"
    log "Management NAT EIP 1:      $(cfn_output ccc-cross-region-security MgmtNatEip1)"
    log "Management NAT EIP 2:      $(cfn_output ccc-cross-region-security MgmtNatEip2)"
    log ""
    log "Data Plane Aurora + RDS Proxy:"
    log "  [mumbai/ap-south-1]:   $(cfn_output ccc-dp-rds-mumbai RDSProxyEndpoint ap-south-1)"
    log "  [bahrain/me-south-1]:  $(cfn_output ccc-dp-rds-bahrain RDSProxyEndpoint me-south-1)"
    log "  [kenya/af-south-1]:    $(cfn_output ccc-dp-rds-kenya RDSProxyEndpoint af-south-1)"
    log ""
    log "Data Plane ALBs:"
    log "  [mumbai/ap-south-1]:   $(cfn_output ccc-data-plane-mumbai ALBDNSName ap-south-1)  (internal via VPC peering)"
    log "  [bahrain/me-south-1]:  $(cfn_output ccc-data-plane-bahrain ALBDNSName me-south-1) (internet-facing HTTPS)"
    log "  [kenya/af-south-1]:    $(cfn_output ccc-data-plane-kenya ALBDNSName af-south-1)   (internet-facing HTTPS)"
    ;;
  *)
    echo "Unknown stack: ${DEPLOY_STACK}"
    echo "Valid values: vpc | aurora | kafka | datalake | management | dp-vpc | cross-region-security | clickhouse | dp-rds | data-plane | platform-updates | all"
    exit 1
    ;;
esac
