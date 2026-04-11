# Cyber Command Center - Multi-Cloud Deployment Guide

## Overview

This guide covers deploying the Cyber Command Center MSSP platform across AWS, Azure, and GCP with the petabyte-scale data lake architecture. Each cloud provider has identical logical components implemented with native services.

---

## Prerequisites

### All Clouds

- Docker installed and authenticated to your container registry
- CCC container images built and pushed:
  - `ccc-management-plane:{tag}`
  - `ccc-data-plane:{tag}`
  - `ccc-receiver-plane:{tag}`
- Environment secrets pre-created (see Secrets section below)

### AWS Prerequisites

```bash
# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && ./aws/install

# Configure credentials
aws configure

# Verify
aws sts get-caller-identity

# Create ECR repositories (one-time)
aws ecr create-repository --repository-name ccc-management-plane --image-scanning-configuration scanOnPush=true
aws ecr create-repository --repository-name ccc-data-plane --image-scanning-configuration scanOnPush=true
aws ecr create-repository --repository-name ccc-receiver-plane --image-scanning-configuration scanOnPush=true
```

### Azure Prerequisites

```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login
az login
az account set --subscription <SUBSCRIPTION_ID>

# Create resource group
az group create --name ccc-management-rg --location eastus

# Create Azure Container Registry
az acr create --resource-group ccc-management-rg --name cccregistry --sku Premium
az acr login --name cccregistry

# Create Key Vault (required before Bicep deploys)
az keyvault create \
  --name ccc-kv-production \
  --resource-group ccc-management-rg \
  --location eastus \
  --sku premium \
  --retention-days 90

# Create Log Analytics Workspace
az monitor log-analytics workspace create \
  --resource-group ccc-management-rg \
  --workspace-name ccc-log-analytics-production \
  --location eastus
```

### GCP Prerequisites

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash && exec -l $SHELL
gcloud init

# Set project
gcloud config set project YOUR_PROJECT_ID

# Authenticate
gcloud auth application-default login

# Enable Deployment Manager API
gcloud services enable deploymentmanager.googleapis.com --project YOUR_PROJECT_ID

# Create Artifact Registry for containers
gcloud artifacts repositories create ccc-images \
  --repository-format=docker \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID

# Authenticate Docker to Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Building and Pushing Container Images

### Build Images (AMD64 only - required for ECS Fargate / Cloud Run)

```bash
export IMAGE_TAG=v2.0.0

# Build management plane
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -t ccc-management-plane:${IMAGE_TAG} \
  --target management-plane \
  .

# Build data plane
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -t ccc-data-plane:${IMAGE_TAG} \
  --target data-plane \
  .
```

### Push to AWS ECR

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-south-1
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Authenticate
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Tag and push
docker tag ccc-management-plane:${IMAGE_TAG} ${ECR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}
docker push ${ECR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}

docker tag ccc-data-plane:${IMAGE_TAG} ${ECR_REGISTRY}/ccc-data-plane:${IMAGE_TAG}
docker push ${ECR_REGISTRY}/ccc-data-plane:${IMAGE_TAG}
```

### Push to Azure ACR

```bash
az acr login --name cccregistry

docker tag ccc-management-plane:${IMAGE_TAG} cccregistry.azurecr.io/ccc-management-plane:${IMAGE_TAG}
docker push cccregistry.azurecr.io/ccc-management-plane:${IMAGE_TAG}

docker tag ccc-data-plane:${IMAGE_TAG} cccregistry.azurecr.io/ccc-data-plane:${IMAGE_TAG}
docker push cccregistry.azurecr.io/ccc-data-plane:${IMAGE_TAG}
```

### Push to GCP Artifact Registry

```bash
export GCP_PROJECT_ID=your-project-id
export AR_REGISTRY="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/ccc-images"

docker tag ccc-management-plane:${IMAGE_TAG} ${AR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}
docker push ${AR_REGISTRY}/ccc-management-plane:${IMAGE_TAG}

docker tag ccc-data-plane:${IMAGE_TAG} ${AR_REGISTRY}/ccc-data-plane:${IMAGE_TAG}
docker push ${AR_REGISTRY}/ccc-data-plane:${IMAGE_TAG}
```

---

## AWS Deployment

### 1. Pre-create Required Secrets

```bash
export AWS_REGION=ap-south-1
export ENVIRONMENT=production

# Session secret
aws secretsmanager create-secret \
  --name "ccc/session-secret-${ENVIRONMENT}" \
  --secret-string "$(openssl rand -base64 48)"

# AI provider credentials
aws secretsmanager create-secret \
  --name "ccc/ai/provider-${ENVIRONMENT}" \
  --secret-string "openai"

aws secretsmanager create-secret \
  --name "ccc/ai/api-key-${ENVIRONMENT}" \
  --secret-string "sk-..."
```

### 2. Deploy All Stacks

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-south-1
export IMAGE_TAG=v2.0.0
export CERTIFICATE_ARN="arn:aws:acm:ap-south-1:123456789012:certificate/..."
export DB_PASSWORD=$(openssl rand -base64 32)
export OS_PASSWORD=$(openssl rand -base64 24)
export ENVIRONMENT=production

chmod +x deploy/aws/scripts/deploy-all.sh
./deploy/aws/scripts/deploy-all.sh
```

### 3. Deploy Receiver Plane (Optional - uses existing ECS scripts)

```bash
chmod +x deploy/ecs/scripts/deploy-stacks.sh
./deploy/ecs/scripts/deploy-stacks.sh --stack receiver
```

### 4. Verify Deployment

```bash
# Check all stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'ccc-')].{Name:StackName, Status:StackStatus}" \
  --output table

# Get management plane URL
aws cloudformation describe-stacks \
  --stack-name ccc-management-ecs \
  --query "Stacks[0].Outputs[?OutputKey=='ALBURL'].OutputValue" \
  --output text

# Check ECS services
aws ecs list-services --cluster ccc-management-production
aws ecs list-services --cluster ccc-data-plane-in-west-1-production
```

---

## Azure Deployment

### 1. Pre-create Key Vault Secrets

```bash
export KV_NAME="ccc-kv-production"

az keyvault secret set --vault-name ${KV_NAME} --name ccc-session-secret \
  --value "$(openssl rand -base64 48)"

az keyvault secret set --vault-name ${KV_NAME} --name ccc-ai-api-key \
  --value "sk-..."
```

### 2. Deploy All Bicep Stacks

```bash
export AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export AZURE_RESOURCE_GROUP=ccc-management-rg
export AZURE_LOCATION=eastus
export CONTAINER_REGISTRY=cccregistry.azurecr.io
export IMAGE_TAG=v2.0.0
export DB_PASSWORD=$(openssl rand -base64 24)
export SQL_ADMIN_PASSWORD=$(openssl rand -base64 24)
export ENVIRONMENT=production

chmod +x deploy/azure/scripts/deploy-all.sh
./deploy/azure/scripts/deploy-all.sh
```

### 3. Verify Deployment

```bash
# List deployments
az deployment group list \
  --resource-group ccc-management-rg \
  --query "[?starts_with(name, 'ccc-')].{Name:name, State:properties.provisioningState}" \
  --output table

# Get management plane FQDN
az deployment group show \
  --resource-group ccc-management-rg \
  --name "ccc-apps-in-west-1-production" \
  --query "properties.outputs.managementAppFqdn.value" \
  --output tsv
```

---

## GCP Deployment

### 1. Pre-create Secret Manager Secrets

```bash
export GCP_PROJECT_ID=your-project-id

echo -n "$(openssl rand -base64 48)" | \
  gcloud secrets create ccc-session-secret \
    --data-file=- \
    --project=${GCP_PROJECT_ID}

echo -n "sk-..." | \
  gcloud secrets create ccc-ai-api-key \
    --data-file=- \
    --project=${GCP_PROJECT_ID}
```

### 2. Deploy All GCP Resources

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export IMAGE_TAG=v2.0.0
export CONTAINER_REGISTRY="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/ccc-images"

chmod +x deploy/gcp/scripts/deploy-all.sh
./deploy/gcp/scripts/deploy-all.sh
```

### 3. Verify Deployment

```bash
# List deployments
gcloud deployment-manager deployments list \
  --project=${GCP_PROJECT_ID} \
  --filter="name:ccc-*"

# Get Cloud Run service URL
gcloud run services describe ccc-management-plane-production \
  --project=${GCP_PROJECT_ID} \
  --region=${GCP_REGION} \
  --format="value(status.url)"
```

---

## Post-Deployment Steps

### 1. Run Database Migrations

After the management plane ECS/Container App/Cloud Run service is running:

```bash
# AWS - ECS exec
aws ecs execute-command \
  --cluster ccc-management-production \
  --task $(aws ecs list-tasks --cluster ccc-management-production --query "taskArns[0]" --output text) \
  --container management-plane \
  --interactive \
  --command "npm run db:push"

# Azure - Container Apps exec
az containerapp exec \
  --name ccc-management-plane-production \
  --resource-group ccc-management-rg \
  --command "npm run db:push"

# GCP - Cloud Run exec (requires Cloud Run jobs or Cloud Shell)
gcloud run jobs execute ccc-db-migrate \
  --project=${GCP_PROJECT_ID} \
  --region=${GCP_REGION}
```

### 2. Seed Initial Data

```bash
# Same exec as above, but run:
npm run db:seed
# Default admin: username=admin, password=Admin@123, role=platform_admin
```

### 3. Create Kafka Topics (AWS MSK)

```bash
# Connect via bastion or ECS exec, then:
kafka-topics.sh \
  --bootstrap-server ${KAFKA_BROKERS} \
  --command-config client.properties \
  --create --topic ccc-raw-events --partitions 12 --replication-factor 3 \
  --config retention.ms=259200000 \
  --config min.insync.replicas=2

kafka-topics.sh --bootstrap-server ${KAFKA_BROKERS} \
  --command-config client.properties \
  --create --topic ccc-enriched-events --partitions 12 --replication-factor 3

kafka-topics.sh --bootstrap-server ${KAFKA_BROKERS} \
  --command-config client.properties \
  --create --topic ccc-alerts --partitions 4 --replication-factor 3

kafka-topics.sh --bootstrap-server ${KAFKA_BROKERS} \
  --command-config client.properties \
  --create --topic ccc-dead-letter --partitions 4 --replication-factor 3
```

### 4. Configure OpenSearch Index Lifecycle Policy (AWS)

```bash
# Apply ISM (Index State Management) policy for 30-day -> warm -> cold
curl -X PUT "https://${OPENSEARCH_URL}/_plugins/_ism/policies/ccc-event-lifecycle" \
  -H "Content-Type: application/json" \
  -u "${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}" \
  --data '{
    "policy": {
      "description": "CCC security events 30d hot, 90d warm, cold after",
      "default_state": "hot",
      "states": [
        {
          "name": "hot",
          "actions": [],
          "transitions": [{"state_name": "warm", "conditions": {"min_index_age": "30d"}}]
        },
        {
          "name": "warm",
          "actions": [{"warm_migration": {}}],
          "transitions": [{"state_name": "cold", "conditions": {"min_index_age": "90d"}}]
        },
        {
          "name": "cold",
          "actions": [{"cold_migration": {"timestamp_field": "ingested_at"}}],
          "transitions": []
        }
      ]
    }
  }'
```

---

## Troubleshooting

### ECS Tasks Not Starting (AWS)

```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster ccc-management-production \
  --tasks $(aws ecs list-tasks --cluster ccc-management-production \
    --desired-status STOPPED --query "taskArns[0]" --output text) \
  --query "tasks[0].containers[0].{reason:reason,exitCode:exitCode}"

# Common fixes:
# 1. Secret not found -> verify secret ARN in Secrets Manager
# 2. Image pull error -> re-run ecr_login() and verify image URI
# 3. CannotPullContainerError -> check RuntimePlatform: X86_64 (not ARM)
# 4. Health check failing -> increase HealthCheckGracePeriodSeconds to 180
```

### CloudFormation Errors

```bash
# Common error: "!ImportValue !Sub" invalid syntax
# Fix: Use Fn::ImportValue: !Sub "..." (see 02-aurora-management.yml pattern)

# Common error: "em-dash in description"
# Fix: Replace all — with - in GroupDescription fields

# Check stack events
aws cloudformation describe-stack-events \
  --stack-name ccc-vpc \
  --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].{Resource:LogicalResourceId,Reason:ResourceStatusReason}"
```

### OpenSearch Cluster Red (AWS)

```bash
# Check cluster health
curl -u "${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}" \
  "https://${OPENSEARCH_URL}/_cluster/health?pretty"

# Check shard allocation
curl -u "${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}" \
  "https://${OPENSEARCH_URL}/_cat/shards?h=index,shard,prirep,state,unassigned.reason&v"
```

### MSK Consumer Lag (AWS)

```bash
# Check consumer group lag
kafka-consumer-groups.sh \
  --bootstrap-server ${KAFKA_BROKERS} \
  --command-config client.properties \
  --describe --group ccc-data-plane

# If lag is growing: scale out data plane ECS service
aws ecs update-service \
  --cluster ccc-data-plane-in-west-1-production \
  --service ccc-data-plane-in-west-1-production \
  --desired-count 10
```

---

## Security Checklist

Before going live:

- [ ] All S3 buckets have `BlockPublicAcls: true` and deny non-TLS requests
- [ ] Aurora/Cloud SQL has no public IP
- [ ] OpenSearch/Azure Search has no public endpoint (VPC-only)
- [ ] MSK/Event Hubs TLS-only (no plaintext)
- [ ] All secrets in Secrets Manager/Key Vault (no env vars with plain passwords)
- [ ] ECS task roles have minimum required IAM permissions
- [ ] VPC Flow Logs enabled and retained for 30+ days
- [ ] CloudWatch/Azure Monitor alarms configured for critical metrics
- [ ] ACM/Azure Certificates issued and attached to ALB/App Gateway
- [ ] `SECURE_COOKIES=true` set in management plane ECS task definition

---

## Cost Optimization

### AWS

- Use FARGATE_SPOT 4:1 ratio for data plane tasks (80% cheaper for batch workloads)
- Enable S3 Intelligent-Tiering for raw events after 30 days
- Aurora Serverless v2 scales to 0.5 ACU during low traffic
- OpenSearch UltraWarm is 90% cheaper than hot storage for 31-90 day data
- Athena charges $5/TB scanned - always use partition filters (event_date, tenant_id)

### Azure

- Container Apps scale to 0 replicas when idle (Consumption workload profile)
- ADLS Gen2 Cool tier is 50% cheaper than Hot for 31-90 day data
- Event Hubs Premium has reserved capacity - use Standard for dev/staging

### GCP

- Cloud Run scales to 0 (no charge when idle)
- GCS Nearline (30d+) is 40% cheaper than Standard
- BigQuery on-demand $5/TB scanned - use partitioned tables and column clustering
- Pub/Sub is pay-per-message - no idle charges

---

## Data Plane Regions Reference

| Region ID | AWS Region | Azure Region | GCP Region | Geography |
|-----------|-----------|-------------|-----------|-----------|
| `in-west-1` | ap-south-1 | India Central | asia-south1 | Mumbai, India |
| `us-east-1` | us-east-1 | East US | us-east1 | Virginia, USA |
| `ke-east-1` | af-south-1 | South Africa North | africa-south1 | Nairobi, Kenya |
| `sa-central-1` | sa-east-1 | Brazil South | southamerica-east1 | Sao Paulo, Brazil |
| `bh-east-1` | me-south-1 | UAE North | me-west1 | Bahrain |
