# Cyber Command Center — Multi-Region HA Deployment Guide

## Target Topology

| Plane | Region | AWS Region Code | Purpose |
|---|---|---|---|
| Management Plane | India (Mumbai) | `ap-south-1` | API, UI, orchestration, admin portal, AI pipeline |
| Data Plane — India | India (Mumbai) | `ap-south-1` | Event storage/search for Indian tenants |
| Data Plane — Bahrain | Bahrain | `me-south-1` | Event storage/search for GCC/Bahrain tenants |
| Data Plane — Kenya | Kenya (Cape Town) | `af-south-1` | Event storage/search for East Africa tenants |

**Architecture:** The Management Plane controls all three Data Planes via internal REST federation (`DATA_PLANE_ENDPOINTS`). Each Data Plane is fully independent (own Kafka cluster, ClickHouse, S3, PostgreSQL replica) and handles events for tenant-designated data residency regions.

---

## Prerequisites

### AWS Account Requirements

1. **Enable opt-in regions** (if not already):
   ```bash
   aws account enable-region --region-name me-south-1  # Bahrain
   aws account enable-region --region-name af-south-1  # Kenya (Cape Town)
   # ap-south-1 (Mumbai) is enabled by default
   ```

2. **IAM permissions** — The deploying IAM principal needs:
   - `cloudformation:*`, `ecs:*`, `ec2:*`, `elasticloadbalancing:*`
   - `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:PassRole`
   - `logs:CreateLogGroup`, `logs:PutRetentionPolicy`
   - `secretsmanager:*`, `ssm:*`
   - `ecr:*`, `s3:*`, `msk:*`, `efs:*` (ClickHouse runs on ECS Fargate, no managed-search IAM actions required)

3. **AWS CLI v2 installed and configured**:
   ```bash
   aws configure --profile ccc-deploy
   export AWS_PROFILE=ccc-deploy
   ```

4. **Docker installed** (for building + pushing images):
   ```bash
   docker --version   # 20.x or later
   ```

### SSL Certificate Requirements

Request ACM certificates in **each region** (Management Plane + each Data Plane):

```bash
# Management Plane (ap-south-1)
aws acm request-certificate \
  --domain-name app.yourdomain.com \
  --validation-method DNS \
  --region ap-south-1

# Data Plane Bahrain (me-south-1) — optional, for HTTPS internal ALB
aws acm request-certificate \
  --domain-name dp-bahrain.internal.yourdomain.com \
  --validation-method DNS \
  --region me-south-1

# Data Plane Kenya (af-south-1) — optional
aws acm request-certificate \
  --domain-name dp-kenya.internal.yourdomain.com \
  --validation-method DNS \
  --region af-south-1
```

> **Note:** ACM certificates are region-specific. A certificate issued in `ap-south-1` **cannot** be used in `me-south-1`.

---

## RDS SSL Configuration (CRITICAL — read before deploying)

### Why This Matters

Prior deployments failed with `SELF_SIGNED_CERT_IN_CHAIN` errors when the Node.js process attempted to connect to RDS Aurora with SSL. This happens because:

1. Node.js does not include the AWS RDS CA in its default trust store.
2. Aurora with `rds.force_ssl=1` rejects connections without a valid CA.
3. The error manifests as a connection refused / TLS handshake failure at container startup.

### Solution (already baked into the Dockerfiles)

Both `deploy/management/Dockerfile` and `deploy/data-plane/Dockerfile` now:

1. Download the **AWS RDS global CA bundle** at image build time:
   ```
   https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```
   This is the **single-file replacement for all individual RDS CA artifacts** including `rds-ca-2019-root.pem`, `rds-ca-rsa2048-g1.pem`, `rds-ca-ecc384-g1.pem`, and regional variants. AWS recommends using `global-bundle.pem` as the canonical trust anchor for all new deployments because:
   - It contains all CA generations (2019, 2023, and beyond) in one PEM file.
   - It covers all AWS commercial regions including opt-in regions (`ap-south-1`, `me-south-1`, `af-south-1`).
   - It is updated by AWS when new CAs are added — no Dockerfile changes needed.
   - Individual files like `rds-ca-2019-root.pem` are deprecated and will not cover clusters created with newer CA rotations.

2. Append it to the Alpine system CA store so any library (not just Node) trusts it.

3. Set these environment variables in the ECS task definition (and Helm values):
   - `DB_SSL_CA=/etc/ssl/certs/rds-ca-bundle.pem`
   - `PGSSLMODE=verify-ca`
   - `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ca-bundle.pem`

4. The `start-with-retry.sh` entrypoint verifies the CA bundle exists before starting Node.

### RDS Parameter Group

If your Aurora cluster has `rds.force_ssl=1` (recommended for production), ensure the `NODE_EXTRA_CA_CERTS` and `DB_SSL_CA` env vars are set correctly before the first connection attempt. The Dockerfiles and CFN task definitions handle this automatically.

To check your Aurora parameter group:
```bash
aws rds describe-db-cluster-parameters \
  --db-cluster-parameter-group-name your-param-group \
  --region ap-south-1 \
  --query "Parameters[?ParameterName=='rds.force_ssl']"
```

---

## Step-by-Step Deployment Order

### Step 1: Pre-create CloudWatch Log Groups

This prevents the ECS service from failing to start because the log group doesn't exist yet. (RCA lesson: the ECS execution role needs `logs:CreateLogGroup`, but race conditions can cause failures on first deploy.)

```bash
# Management Plane
aws logs create-log-group \
  --log-group-name "/ecs/ccc-management-production" \
  --region ap-south-1
aws logs put-retention-policy \
  --log-group-name "/ecs/ccc-management-production" \
  --retention-in-days 30 \
  --region ap-south-1

# Data Plane India
aws logs create-log-group \
  --log-group-name "/ecs/ccc-data-plane-in-west-1-production" \
  --region ap-south-1
aws logs put-retention-policy \
  --log-group-name "/ecs/ccc-data-plane-in-west-1-production" \
  --retention-in-days 30 \
  --region ap-south-1

# Data Plane Bahrain
aws logs create-log-group \
  --log-group-name "/ecs/ccc-data-plane-bh-east-1-production" \
  --region me-south-1
aws logs put-retention-policy \
  --log-group-name "/ecs/ccc-data-plane-bh-east-1-production" \
  --retention-in-days 30 \
  --region me-south-1

# Data Plane Kenya
aws logs create-log-group \
  --log-group-name "/ecs/ccc-data-plane-ke-east-1-production" \
  --region af-south-1
aws logs put-retention-policy \
  --log-group-name "/ecs/ccc-data-plane-ke-east-1-production" \
  --retention-in-days 30 \
  --region af-south-1
```

### Step 2: Build and Push Docker Images

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export IMAGE_TAG="v$(date +%Y%m%d-%H%M%S)"  # e.g. v20250401-143000

# Login to ECR in each region
for region in ap-south-1 me-south-1 af-south-1; do
  aws ecr get-login-password --region $region | \
    docker login --username AWS \
      --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${region}.amazonaws.com"
done

# Create ECR repos if they don't exist (ap-south-1 = home region for all repos)
for repo in ccc-management-plane ccc-data-plane ccc-migrate; do
  aws ecr create-repository \
    --repository-name $repo \
    --image-scanning-configuration scanOnPush=true \
    --region ap-south-1 2>/dev/null || true
done

# Build images (run from project root)
docker build -f deploy/management/Dockerfile \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-management-plane:${IMAGE_TAG}" \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-management-plane:latest" .

docker build -f deploy/data-plane/Dockerfile \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}" \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:latest" .

docker build -f Dockerfile.migrate \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-migrate:${IMAGE_TAG}" \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-migrate:latest" .

# Push to ECR
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-management-plane:${IMAGE_TAG}"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-management-plane:latest"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:latest"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-migrate:${IMAGE_TAG}"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-migrate:latest"

# Replicate data-plane image to Bahrain and Kenya ECR (cross-region replication)
# Option A: ECR replication rule (recommended for CI/CD)
# Option B: Pull + re-tag + push manually:
for region in me-south-1 af-south-1; do
  # Create ECR repo in target region
  aws ecr create-repository \
    --repository-name ccc-data-plane \
    --image-scanning-configuration scanOnPush=true \
    --region $region 2>/dev/null || true

  docker tag \
    "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}" \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${region}.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"
  docker push "${AWS_ACCOUNT_ID}.dkr.ecr.${region}.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"
done
```

### Step 3: Set Up Secrets in AWS Secrets Manager

```bash
# Run the interactive setup script for Management Plane (ap-south-1)
AWS_REGION=ap-south-1 ./deploy/ecs/scripts/setup-secrets.sh

# For each Data Plane region, set region-specific secrets:
for region in me-south-1 af-south-1; do
  AWS_REGION=$region ./deploy/ecs/scripts/setup-secrets.sh
done
```

**Required secrets checklist:**

| Secret Path | Description | Region |
|---|---|---|
| `ccc/management/database-url` | Aurora PostgreSQL connection string | ap-south-1 |
| `ccc/management/session-secret` | Express session secret (64+ chars) | ap-south-1 |
| `ccc/management/redis-url` | ElastiCache Redis Sentinel URL | ap-south-1 |
| `ccc/management/superadmin-password` | Initial superadmin password | ap-south-1 |
| `ccc/shared/kafka-brokers` | MSK bootstrap brokers | ap-south-1 |
| `ccc/shared/management-plane-url` | Management Plane internal ALB URL | each region |
| `ccc/ai/provider` | AI provider name (openai/anthropic/etc.) | ap-south-1 |
| `ccc/ai/api-key` | AI provider API key | ap-south-1 |
| `ccc/ai/model` | AI model name (e.g. gpt-4o) | ap-south-1 |
| `ccc/storage/provider` | Cloud storage provider (s3) | ap-south-1 |
| `ccc/storage/s3-bucket` | S3 reports bucket name | ap-south-1 |
| `ccc/data-plane/in-west-1/database-url` | India data plane DB URL | ap-south-1 |
| `ccc/data-plane/bh-east-1/database-url` | Bahrain data plane DB URL | me-south-1 |
| `ccc/data-plane/ke-east-1/database-url` | Kenya data plane DB URL | af-south-1 |

### Step 4: Deploy VPC and Shared Infrastructure (ap-south-1)

```bash
export AWS_REGION=ap-south-1
export ENVIRONMENT=production

# 1. VPC (creates subnets, SGs, NAT Gateway, VPC endpoints)
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/01-vpc.yml \
  --stack-name ccc-vpc \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION \
  --parameter-overrides EnvironmentName=$ENVIRONMENT

# 2. Aurora Management Plane DB
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/02-aurora-management.yml \
  --stack-name ccc-aurora-management \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION \
  --parameter-overrides EnvironmentName=$ENVIRONMENT VpcStackName=ccc-vpc

# 3. MSK Kafka (KRaft mode, 3-node)
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/03-msk-kafka.yml \
  --stack-name ccc-msk-kafka \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION \
  --parameter-overrides EnvironmentName=$ENVIRONMENT VpcStackName=ccc-vpc

# 4. ClickHouse (OLAP cluster)
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/08-clickhouse-cluster.yml \
  --stack-name ccc-clickhouse \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION \
  --parameter-overrides EnvironmentName=$ENVIRONMENT VpcStackName=ccc-vpc

# 5. Data Lake (S3 + Glue + Athena)
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/05-data-lake.yml \
  --stack-name ccc-data-lake \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION \
  --parameter-overrides EnvironmentName=$ENVIRONMENT
```

### Step 5: Deploy Management Plane ECS (ap-south-1)

**Pre-requisite: Create the session secret in Secrets Manager first.**

```bash
# Create session secret (one-time, idempotent)
aws secretsmanager create-secret \
  --name "ccc/management/session-secret" \
  --description "Express session secret for CCC Management Plane" \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-south-1 || true   # ignore AlreadyExistsException

# Retrieve the ARN for use in the deploy command below
SESSION_SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id "ccc/management/session-secret" \
  --region ap-south-1 \
  --query "ARN" --output text)

export CERTIFICATE_ARN="arn:aws:acm:ap-south-1:${AWS_ACCOUNT_ID}:certificate/YOUR_CERT_ID"
export MGMT_IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-management-plane:${IMAGE_TAG}"

# NOTE: SessionSecretArn is required by the template (no default).
# The deploy will fail if this parameter is omitted.
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/06-management-ecs.yml \
  --stack-name ccc-management-ecs \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-south-1 \
  --parameter-overrides \
    EnvironmentName=$ENVIRONMENT \
    VpcStackName=ccc-vpc \
    AuroraStackName=ccc-aurora-management \
    MSKStackName=ccc-msk-kafka \
   ClickHouseStackName=ccc-clickhouse \
    DataLakeStackName=ccc-data-lake \
    CertificateArn=$CERTIFICATE_ARN \
    SessionSecretArn=$SESSION_SECRET_ARN \
    ImageUri=$MGMT_IMAGE

# Retrieve Management Plane ALB DNS (needed for data-plane federation)
MGMT_ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name ccc-management-ecs \
  --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
  --output text)
echo "Management Plane URL: https://${MGMT_ALB_DNS}"
```

### Step 6: Run Database Migrations

Run migrations as an ECS one-off task before the service starts serving traffic:

```bash
MIGRATE_IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-migrate:${IMAGE_TAG}"

aws ecs run-task \
  --cluster ccc-management-production \
  --task-definition ccc-management-plane-production \
  --overrides "{\"containerOverrides\":[{\"name\":\"management-plane\",\"image\":\"${MIGRATE_IMAGE}\",\"command\":[\"npx\",\"drizzle-kit\",\"push\",\"--config=drizzle.config.ts\"]}]}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[PRIVATE_SUBNET_1,PRIVATE_SUBNET_2],securityGroups=[ECS_SG_ID],assignPublicIp=DISABLED}" \
  --region ap-south-1
```

### Step 7: Deploy Data Planes (in parallel across 3 regions)

Deploy all three data-plane stacks in parallel. Each stack deploys in its own AWS region.

```bash
export DP_IMAGE_INDIA="${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"
export DP_IMAGE_BAHRAIN="${AWS_ACCOUNT_ID}.dkr.ecr.me-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"
export DP_IMAGE_KENYA="${AWS_ACCOUNT_ID}.dkr.ecr.af-south-1.amazonaws.com/ccc-data-plane:${IMAGE_TAG}"

# Get management plane SG ID for internal ALB ingress rules
MGMT_SG_ID=$(aws cloudformation describe-stacks \
  --stack-name ccc-management-ecs \
  --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ECSSecurityGroupId'].OutputValue" \
  --output text)

# India Data Plane (same region as management — uses same VPC)
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/07-data-plane-ecs.yml \
  --stack-name ccc-data-plane-in-west-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-south-1 \
  --parameter-overrides \
    EnvironmentName=$ENVIRONMENT \
    DataPlaneRegion=in-west-1 \
    RegionCode=ap-south-1 \
    DataPlaneId=india \
    VpcStackName=ccc-vpc \
    MSKStackName=ccc-msk-kafka \
   ClickHouseStackName=ccc-clickhouse \
    DataLakeStackName=ccc-data-lake \
    AuroraStackName=ccc-aurora-management \
    ImageUri=$DP_IMAGE_INDIA &

# Bahrain Data Plane
# NOTE: Deploy VPC stack in me-south-1 first:
#   AWS_REGION=me-south-1 aws cloudformation deploy \
#     --template-file deploy/aws/cloudformation/01-vpc.yml \
#     --stack-name ccc-vpc --region me-south-1 ...
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/07-data-plane-ecs.yml \
  --stack-name ccc-data-plane-bh-east-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region me-south-1 \
  --parameter-overrides \
    EnvironmentName=$ENVIRONMENT \
    DataPlaneRegion=bh-east-1 \
    RegionCode=me-south-1 \
    DataPlaneId=bahrain \
    VpcStackName=ccc-vpc \
    MSKStackName=ccc-msk-kafka \
   ClickHouseStackName=ccc-clickhouse \
    DataLakeStackName=ccc-data-lake \
    AuroraStackName=ccc-aurora-management \
    ImageUri=$DP_IMAGE_BAHRAIN &

# Kenya Data Plane
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation/07-data-plane-ecs.yml \
  --stack-name ccc-data-plane-ke-east-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region af-south-1 \
  --parameter-overrides \
    EnvironmentName=$ENVIRONMENT \
    DataPlaneRegion=ke-east-1 \
    RegionCode=af-south-1 \
    DataPlaneId=kenya \
    VpcStackName=ccc-vpc \
    MSKStackName=ccc-msk-kafka \
   ClickHouseStackName=ccc-clickhouse \
    DataLakeStackName=ccc-data-lake \
    AuroraStackName=ccc-aurora-management \
    ImageUri=$DP_IMAGE_KENYA &

# Wait for all three to complete
wait
echo "All data-plane stacks deployed"
```

### Step 8: Wire Data-Plane Federation (CRITICAL — do this before traffic flows)

After all data-plane stacks are deployed, retrieve their internal ALB hostnames and inject them into the management plane:

```bash
# Retrieve internal ALB DNS names
INDIA_DP_DNS=$(aws cloudformation describe-stacks \
  --stack-name ccc-data-plane-in-west-1 --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InternalALBDNSName'].OutputValue" --output text)

BAHRAIN_DP_DNS=$(aws cloudformation describe-stacks \
  --stack-name ccc-data-plane-bh-east-1 --region me-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InternalALBDNSName'].OutputValue" --output text)

KENYA_DP_DNS=$(aws cloudformation describe-stacks \
  --stack-name ccc-data-plane-ke-east-1 --region af-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='InternalALBDNSName'].OutputValue" --output text)

echo "India  DP: $INDIA_DP_DNS"
echo "Bahrain DP: $BAHRAIN_DP_DNS"
echo "Kenya   DP: $KENYA_DP_DNS"

# Build the federation JSON
DATA_PLANE_JSON="{\"india\":\"http://${INDIA_DP_DNS}\",\"bahrain\":\"http://${BAHRAIN_DP_DNS}\",\"kenya\":\"http://${KENYA_DP_DNS}\"}"
echo "DATA_PLANE_ENDPOINTS: ${DATA_PLANE_JSON}"

# Re-deploy management plane stack with updated DATA_PLANE_ENDPOINTS
# (or update the ECS task definition environment variable directly)
aws ecs update-service \
  --cluster ccc-management-production \
  --service ccc-management-plane-production \
  --task-definition ccc-management-plane-production \
  --force-new-deployment \
  --region ap-south-1
```

> **For Helm deployments:** Update `deploy/helm/secureops/values.yaml`:
> ```yaml
> dataPlane:
>   federation:
>     endpoints:
>       india: "http://<india-alb-dns>"
>       bahrain: "http://<bahrain-alb-dns>"
>       kenya: "http://<kenya-alb-dns>"
>     dataPlaneEndpointsJson: '{"india":"http://...","bahrain":"http://...","kenya":"http://..."}'
> ```
> Then: `helm upgrade ccc-management deploy/helm/secureops -f values-india.yaml`

### Step 9: DNS and TLS Setup

```bash
# Get management plane ALB DNS name
MGMT_ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name ccc-management-ecs --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" --output text)

echo "Create a CNAME record:"
echo "  app.yourdomain.com  →  ${MGMT_ALB_DNS}"
```

For AWS Route 53:
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"app.yourdomain.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$(aws elbv2 describe-load-balancers \
            --query \"LoadBalancers[?DNSName=='${MGMT_ALB_DNS}'].CanonicalHostedZoneId\" \
            --output text --region ap-south-1)\",
          \"DNSName\": \"${MGMT_ALB_DNS}\",
          \"EvaluateTargetHealth\": true
        }
      }
    }]
  }"
```

---

## Health-Check Verification

### Management Plane

```bash
# Should return {"status":"ok"} with HTTP 200
curl -k https://app.yourdomain.com/healthz

# Or via ALB DNS directly
curl http://${MGMT_ALB_DNS}/healthz

# ECS service status
aws ecs describe-services \
  --cluster ccc-management-production \
  --services ccc-management-plane-production \
  --region ap-south-1 \
  --query "services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}"
```

### Data Planes

```bash
for region_stack in "ap-south-1 ccc-data-plane-in-west-1" "me-south-1 ccc-data-plane-bh-east-1" "af-south-1 ccc-data-plane-ke-east-1"; do
  read region stack <<< "$region_stack"
  dp_dns=$(aws cloudformation describe-stacks \
    --stack-name $stack --region $region \
    --query "Stacks[0].Outputs[?OutputKey=='InternalALBDNSName'].OutputValue" --output text)
  echo -n "$stack health: "
  curl -s --max-time 5 "http://${dp_dns}/healthz" || echo "UNREACHABLE"
done
```

### Admin Portal Access

After DNS propagates:
```
URL: https://app.yourdomain.com/admin
Username: admin
Password: (value from ccc/management/superadmin-password secret)
```

---

## IAM Pre-Creation Checklist

All IAM roles are created inline by the CloudFormation stacks. No manual pre-creation is required **if** you deploy with `--capabilities CAPABILITY_NAMED_IAM`. 

Verify the following roles exist after deployment:

```bash
# Management Plane
aws iam get-role --role-name ccc-management-execution-role-production --region ap-south-1
aws iam get-role --role-name ccc-management-task-role-production --region ap-south-1

# Data Plane India
aws iam get-role --role-name ccc-data-plane-execution-role-in-west-1-production
aws iam get-role --role-name ccc-data-plane-task-role-in-west-1-production

# Data Plane Bahrain
aws iam get-role --role-name ccc-data-plane-execution-role-bh-east-1-production
aws iam get-role --role-name ccc-data-plane-task-role-bh-east-1-production

# Data Plane Kenya
aws iam get-role --role-name ccc-data-plane-execution-role-ke-east-1-production
aws iam get-role --role-name ccc-data-plane-task-role-ke-east-1-production
```

---

## Helm / Kubernetes Deployment

For Kubernetes-based deployments (EKS), use the regional Helm values files:

```bash
# Management Plane (ap-south-1)
helm upgrade --install ccc-management deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/regional/values-india.yaml \
  --set management.image.tag=$IMAGE_TAG \
  --set global.managementPlane=true \
  --namespace ccc-production \
  --create-namespace

# Data Plane India (ap-south-1)
helm upgrade --install ccc-dp-india deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/regional/values-india.yaml \
  --set management.enabled=false \
  --set dataPlane.enabled=true \
  --set dataPlane.config.region=ap-south-1 \
  --set global.dataPlaneId=india \
  --namespace ccc-production

# Data Plane Bahrain (me-south-1) — run from context pointed at me-south-1 cluster
helm upgrade --install ccc-dp-bahrain deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/regional/values-bahrain.yaml \
  --set management.enabled=false \
  --set dataPlane.enabled=true \
  --set dataPlane.config.region=me-south-1 \
  --set global.dataPlaneId=bahrain \
  --namespace ccc-production

# Data Plane Kenya (af-south-1) — run from context pointed at af-south-1 cluster
helm upgrade --install ccc-dp-kenya deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/regional/values-kenya.yaml \
  --set management.enabled=false \
  --set dataPlane.enabled=true \
  --set dataPlane.config.region=af-south-1 \
  --set global.dataPlaneId=kenya \
  --namespace ccc-production
```

---

## Rollback Procedures

### ECS Rollback (single service)

```bash
# List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix ccc-management-plane-production \
  --sort DESC \
  --region ap-south-1

# Roll back to previous revision
aws ecs update-service \
  --cluster ccc-management-production \
  --service ccc-management-plane-production \
  --task-definition ccc-management-plane-production:PREVIOUS_REVISION \
  --region ap-south-1
```

### CloudFormation Stack Rollback

CloudFormation stacks have `DeploymentCircuitBreaker` enabled with `Rollback: true`. If a deployment fails (new tasks fail health checks), the stack automatically rolls back to the previous task definition.

To manually trigger rollback:
```bash
aws cloudformation cancel-update-stack \
  --stack-name ccc-management-ecs \
  --region ap-south-1
```

### Database Rollback

Database migrations are applied using `drizzle-kit push`. To rollback:
1. Restore from the Aurora automated backup (point-in-time recovery).
2. Run the migration against the restored snapshot.

```bash
# Initiate point-in-time restore
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier ccc-aurora-management-production-restored \
  --source-db-cluster-identifier ccc-aurora-management-production \
  --restore-to-time "2025-04-01T12:00:00Z" \
  --region ap-south-1
```

---

## Monitoring and Alerts

### CloudWatch Dashboards

After deployment, create dashboards for each plane:

```bash
# Management Plane metrics
aws cloudwatch get-metric-data \
  --metric-data-queries '[
    {"Id":"cpu","MetricStat":{"Metric":{"Namespace":"AWS/ECS","MetricName":"CPUUtilization","Dimensions":[{"Name":"ClusterName","Value":"ccc-management-production"}]},"Period":60,"Stat":"Average"}}
  ]' \
  --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --region ap-south-1
```

### Key Alarms to Create

1. **ECS Service RunningCount < DesiredCount** — triggers if tasks are crashing
2. **ALB UnHealthyHostCount > 0** — triggers if health checks fail
3. **RDS FreeStorageSpace < 10GB** — storage alert
4. **Database connections > 80%** of max_connections

---

## Security Hardening Checklist

- [ ] All ECS tasks run as non-root user (uid 1001)
- [ ] ECS task security groups deny all inbound except from ALB
- [ ] RDS security group allows only port 5432 from ECS task SG
- [ ] All S3 buckets have public access blocked
- [ ] All secrets stored in Secrets Manager (not plain-text env vars)
- [ ] RDS encryption at rest enabled (KMS)
- [ ] EFS encryption at rest and in transit enabled
- [ ] ALB access logging enabled to S3
- [ ] CloudTrail enabled in all deployed regions
- [ ] GuardDuty enabled in all deployed regions
- [ ] ECR image scanning enabled (scanOnPush: true)
- [ ] `DB_SSL_CA` and `PGSSLMODE=verify-ca` set in all ECS task definitions

---

## Troubleshooting

### Container fails to start — database connection error

**Symptom:** ECS tasks keep stopping with exit code 1, logs show `SELF_SIGNED_CERT_IN_CHAIN` or `connection refused`

**Cause 1 — SSL cert issue:**
```bash
# Check NODE_EXTRA_CA_CERTS is set in the task definition
aws ecs describe-task-definition \
  --task-definition ccc-management-plane-production \
  --region ap-south-1 \
  --query "taskDefinition.containerDefinitions[0].environment"
```

**Cause 2 — DB not reachable from ECS subnet:**
```bash
# Verify RDS security group allows port 5432 from ECS SG
aws ec2 describe-security-group-rules \
  --filters "Name=group-id,Values=RDS_SG_ID" \
  --region ap-south-1
```

**Cause 3 — DATABASE_URL secret not accessible:**
```bash
# Verify execution role can read the secret
aws secretsmanager get-secret-value \
  --secret-id ccc/management/database-url \
  --region ap-south-1
```

### startup retry loop exhausted

**Symptom:** Logs show `ERROR: Database did not become reachable after 30 attempts`

**Fix:** The `start-with-retry.sh` script waits for PostgreSQL TCP port 5432 to be open. Increase `STARTUP_RETRIES` env var in the task definition for slower DB cold starts:

```bash
# Update task definition to set STARTUP_RETRIES=60 (5-min window)
# Re-deploy with the modified task definition
```

### Data plane not receiving federation calls

**Symptom:** Management plane cannot route tenant events to data planes

**Check:** Verify `DATA_PLANE_ENDPOINTS` is set correctly in the management plane task definition:
```bash
aws ecs describe-task-definition \
  --task-definition ccc-management-plane-production \
  --region ap-south-1 \
  --query "taskDefinition.containerDefinitions[0].environment[?name=='DATA_PLANE_ENDPOINTS']"
```

The value should be a valid JSON object like:
```json
{"india":"http://internal-ccc-dp-in-west-1-alb-123456.ap-south-1.elb.amazonaws.com","bahrain":"http://...","kenya":"http://..."}
```

### ECS task fails with ResourceInitializationError

**Symptom:** Task fails before container starts, CloudTrail shows `CannotPullContainerError` or `ResourceInitializationError`

**Causes and fixes:**
1. **No internet access / VPC endpoint missing** — Ensure VPC has endpoints for ECR (ecr.api, ecr.dkr), S3, Secrets Manager, and CloudWatch Logs
2. **Missing CloudWatch log group** — Pre-create log groups (Step 1 above)
3. **Insufficient execution role permissions** — Verify `AmazonECSTaskExecutionRolePolicy` is attached to the execution role
