# SecureOps MSSP Platform - Deployment Guide

## Table of Contents

1. [Deployment Target Matrix](#deployment-target-matrix)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [Development Mode](#development-mode)
5. [AWS Deployment (EKS + Helm)](#aws-deployment-eks--helm)
6. [Azure Deployment (AKS + Helm)](#azure-deployment-aks--helm)
7. [GCP Deployment (GKE + Helm)](#gcp-deployment-gke--helm)
8. [On-Premises Deployment (Docker Compose)](#on-premises-deployment-docker-compose)
9. [On-Premises Deployment (Kubernetes)](#on-premises-deployment-kubernetes)
10. [Management Plane Deployment](#management-plane-deployment)
11. [Data Plane Deployment](#data-plane-deployment)
12. [Regional Data Plane Deployment](#regional-data-plane-deployment)
13. [AI Provider Configuration](#ai-provider-configuration)
14. [Cloud Storage Configuration](#cloud-storage-configuration)
15. [High Availability Architecture](#high-availability-architecture)
16. [Monitoring & Health Checks](#monitoring--health-checks)
17. [Backup Strategy](#backup-strategy)
18. [Troubleshooting](#troubleshooting)

---

## Deployment Target Matrix

| Target | Orchestration | Database | Messaging | Object Storage | Ingress | IAM |
|--------|--------------|----------|-----------|----------------|---------|-----|
| **AWS** | EKS + Helm | RDS PostgreSQL | MSK (Kafka) | S3 | ALB Ingress Controller | IRSA |
| **Azure** | AKS + Helm | Azure DB for PostgreSQL | Event Hubs (Kafka) | Azure Blob Storage | Application Gateway | Workload Identity |
| **GCP** | GKE + Helm | Cloud SQL | Managed Kafka / Pub/Sub | GCS | GCE Ingress / NEG | Workload Identity |
| **VMware (TKG / vSphere)** | Tanzu Kubernetes Grid + Helm | External PostgreSQL | Kafka KRaft (self-hosted) | MinIO / vSAN Object | Nginx / NSX-T | K8s RBAC |
| **Nutanix (NKE / Karbon)** | Nutanix Kubernetes Engine + Helm | External PostgreSQL | Kafka KRaft (self-hosted) | MinIO / Nutanix Objects | Nginx Ingress | K8s RBAC |
| **On-Prem (Docker)** | Docker Compose (+ resource limits) | Self-hosted PostgreSQL | Self-hosted Kafka KRaft | MinIO | Nginx reverse proxy | N/A |
| **On-Prem (K8s)** | k3s / Rancher / bare-metal K8s | Self-hosted PostgreSQL | Self-hosted Kafka KRaft | MinIO | Nginx Ingress Controller | K8s RBAC |

---

## Prerequisites

### All Targets

- Docker 20.10+ and Docker Compose v2 (for building images)
- Node.js 20+ (for local development only)
- A PostgreSQL 14+ compatible database

### Kubernetes Targets (AWS / Azure / GCP / On-Prem K8s)

- `kubectl` 1.27+
- Helm 3.12+
- Access to a container registry (ECR, ACR, GCR, or private)

### AWS-Specific

- AWS CLI v2 configured with appropriate IAM permissions
- An EKS cluster (1.27+)
- eksctl or Terraform for infrastructure provisioning
- RDS PostgreSQL (Multi-AZ recommended)
- Amazon MSK cluster
- S3 bucket with lifecycle policies
- IAM roles for IRSA (IAM Roles for Service Accounts)

### Azure-Specific

- Azure CLI (`az`) configured
- An AKS cluster (1.27+)
- Azure Database for PostgreSQL Flexible Server
- Azure Event Hubs namespace (Kafka-enabled)
- Azure Blob Storage account
- Managed Identity or Azure AD Workload Identity

### GCP-Specific

- `gcloud` CLI configured
- A GKE cluster (1.27+)
- Cloud SQL for PostgreSQL instance
- Managed Kafka or Confluent Cloud
- GCS bucket
- GCP Workload Identity configured

### On-Premises (Docker Compose)

- Docker 20.10+ and Docker Compose v2
- Minimum 16 GB RAM, 8 CPU cores, 200 GB disk
- Network connectivity between all services

### On-Premises (Kubernetes)

- A Kubernetes cluster (k3s, Rancher, kubeadm, or bare-metal)
- `kubectl` and Helm 3.12+
- Nginx Ingress Controller deployed
- `local-path` or NFS StorageClass provisioner
- Private container registry (Harbor, GitLab Registry, etc.)

---

## Environment Variables

### Core Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | - | Random string for session encryption |
| `PORT` | No | 5000 | Server port |
| `NODE_ENV` | No | production | Environment mode |
| `SUPERADMIN_DEFAULT_PASSWORD` | No | Admin@123 | Initial admin password |

### AI Provider

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `openai` | Provider: openai, anthropic, ollama, azure, vertex, huggingface, custom |
| `AI_MODEL` | No | Provider default | Model name override |
| `AI_API_KEY` | Yes | - | API key (falls back to `OPENAI_API_KEY`) |
| `AI_BASE_URL` | No | - | Custom endpoint URL (falls back to `OPENAI_BASE_URL`) |
| `AI_API_VERSION` | No | - | API version (Azure OpenAI) |

### Cloud Object Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUD_STORAGE_PROVIDER` | No | `minio` | Backend: s3, azure, gcs, minio |
| `CLOUD_STORAGE_REGION` | No | `us-east-1` | Storage region |
| `CLOUD_STORAGE_BUCKET` | No | `secureops-data` | Default bucket |
| `MINIO_ENDPOINT` | No | `http://localhost:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | No | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | No | `minioadmin` | MinIO secret key |
| `AWS_ACCESS_KEY_ID` | No | - | AWS S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | No | - | AWS S3 credentials |
| `AZURE_STORAGE_ACCOUNT_NAME` | No | - | Azure Blob account |
| `AZURE_STORAGE_ACCOUNT_KEY` | No | - | Azure Blob key |
| `GCP_PROJECT_ID` | No | - | GCP project ID |
| `GCP_KEY_FILE_PATH` | No | - | GCP service account key file |

### Data Plane Region Connections

| Variable | Required | Description |
|----------|----------|-------------|
| `DP_IN_WEST_1_DB_URL` | No | India region TimescaleDB connection |
| `DP_IN_WEST_1_STORAGE_URL` | No | India region object storage endpoint |
| `DP_IN_WEST_1_KAFKA_BROKERS` | No | India region Kafka brokers (comma-separated) |
| `DP_US_EAST_1_DB_URL` | No | US East region TimescaleDB connection |
| `DP_US_EAST_1_STORAGE_URL` | No | US East region object storage endpoint |
| `DP_US_EAST_1_KAFKA_BROKERS` | No | US East region Kafka brokers |
| `DP_KE_EAST_1_DB_URL` | No | Kenya region TimescaleDB connection |
| `DP_KE_EAST_1_STORAGE_URL` | No | Kenya region object storage endpoint |
| `DP_KE_EAST_1_KAFKA_BROKERS` | No | Kenya region Kafka brokers |
| `DP_SA_CENTRAL_1_DB_URL` | No | Saudi region TimescaleDB connection |
| `DP_SA_CENTRAL_1_STORAGE_URL` | No | Saudi region object storage endpoint |
| `DP_SA_CENTRAL_1_KAFKA_BROKERS` | No | Saudi region Kafka brokers |
| `DP_BH_EAST_1_DB_URL` | No | Bahrain region TimescaleDB connection |
| `DP_BH_EAST_1_STORAGE_URL` | No | Bahrain region object storage endpoint |
| `DP_BH_EAST_1_KAFKA_BROKERS` | No | Bahrain region Kafka brokers |

### Docker Compose Variables

| Variable | Default | Used In | Description |
|----------|---------|---------|-------------|
| `DB_PASSWORD` | `secureops_dev_password` | Both planes | PostgreSQL password |
| `DATA_PLANE_REGION` | `in-west-1` | Data plane | Region identifier |
| `DATA_PLANE_REGION_NAME` | `India (Mumbai)` | Data plane | Region display name |
| `MANAGEMENT_PLANE_URL` | `http://host.docker.internal:80` | Data plane | Management API URL |
| `DP_DB_PORT` | `5433` | Data plane | TimescaleDB host port |
| `DP_OPENSEARCH_PORT` | `9200` | Data plane | OpenSearch host port |
| `DP_MINIO_PORT` | `9000` | Data plane | MinIO host port |
| `DP_COLLECTOR_PORT` | `5001` | Data plane | Collector host port |

---

## Development Mode

Run the application as a single Express.js server with React frontend:

```bash
npm ci
npm run dev
```

The monolith mode automatically falls back to direct in-process pipeline when Kafka is unavailable. All features work without external dependencies beyond PostgreSQL.

### Building from Source

```bash
npm ci
npm run build
NODE_ENV=production node dist/index.cjs
```

---

## AWS Deployment (EKS + Helm)

This guide deploys SecureOps on Amazon EKS using IRSA for pod-level IAM, RDS for databases, MSK for Kafka, and S3 for object storage.

### Step 1: Provision Infrastructure

```bash
export AWS_REGION=us-east-1
export CLUSTER_NAME=secureops-prod

eksctl create cluster \
  --name $CLUSTER_NAME \
  --region $AWS_REGION \
  --version 1.29 \
  --nodegroup-name standard \
  --node-type m5.2xlarge \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed

aws rds create-db-instance \
  --db-instance-identifier secureops-management \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 16 \
  --master-username secureops \
  --master-user-password "YOUR_STRONG_PASSWORD" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --db-name secureops_management

aws s3 mb s3://secureops-events-${AWS_REGION}

aws s3api put-bucket-lifecycle-configuration \
  --bucket secureops-events-${AWS_REGION} \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "archive-old-events",
      "Status": "Enabled",
      "Transitions": [
        {"Days": 90, "StorageClass": "STANDARD_IA"},
        {"Days": 365, "StorageClass": "GLACIER"}
      ]
    }]
  }'
```

### Step 2: Create IRSA Role

```bash
eksctl create iamserviceaccount \
  --name secureops-irsa \
  --namespace secureops \
  --cluster $CLUSTER_NAME \
  --attach-policy-arn arn:aws:iam::policy/AmazonS3FullAccess \
  --attach-policy-arn arn:aws:iam::policy/AmazonMSKFullAccess \
  --approve
```

### Step 3: Build and Push Docker Images

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

for repo in management data-plane receiver collector normalizer detection-engine enrichment storage; do
  aws ecr create-repository --repository-name secureops/${repo} --region $AWS_REGION 2>/dev/null || true
  docker build -t ${ECR_REGISTRY}/secureops/${repo}:latest -f deploy/${repo}/Dockerfile . 2>/dev/null || \
  docker build -t ${ECR_REGISTRY}/secureops/${repo}:latest -f services/${repo}/Dockerfile . 2>/dev/null || \
  docker build -t ${ECR_REGISTRY}/secureops/${repo}:latest .
  docker push ${ECR_REGISTRY}/secureops/${repo}:latest
done
```

### Step 4: Install AWS Load Balancer Controller

```bash
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME
```

### Step 5: Create Kubernetes Secret

```bash
kubectl create namespace secureops

kubectl create secret generic secureops-secrets \
  --namespace secureops \
  --from-literal=database-url="postgresql://secureops:YOUR_PASSWORD@your-rds-host:5432/secureops_management" \
  --from-literal=timescaledb-url="postgresql://secureops:YOUR_PASSWORD@your-timescaledb-host:5432/secureops_events" \
  --from-literal=session-secret="$(openssl rand -hex 32)" \
  --from-literal=openai-api-key="sk-your-key" \
  --from-literal=superadmin-password="YourStrongPassword123!"
```

### Step 6: Deploy with Helm

```bash
helm install secureops deploy/helm/secureops/ \
  --namespace secureops \
  -f deploy/helm/secureops/values/aws.yaml \
  --set global.imageRegistry=${ECR_REGISTRY} \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="arn:aws:iam::${ACCOUNT_ID}:role/secureops-irsa" \
  --set management.database.host=your-rds-host.rds.amazonaws.com \
  --set management.ingress.host=app.yourdomain.com \
  --set receiver.ingress.host=ingest.yourdomain.com \
  --set objectStorage.bucket=secureops-events-${AWS_REGION} \
  --set objectStorage.region=${AWS_REGION} \
  --set kafkaExternal.brokers="b-1.mymsk.kafka.${AWS_REGION}.amazonaws.com:9092,b-2.mymsk.kafka.${AWS_REGION}.amazonaws.com:9092" \
  --set secrets.create=false
```

### Step 7: Verify Deployment

```bash
kubectl get pods -n secureops
kubectl get svc -n secureops
kubectl get ingress -n secureops

kubectl logs -n secureops -l app.kubernetes.io/component=management --tail=50

curl -s https://app.yourdomain.com/healthz
```

### AWS Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| ALB not created | Missing AWS LB Controller | Install `aws-load-balancer-controller` Helm chart |
| Pods stuck in `CrashLoopBackOff` | Invalid DATABASE_URL | Check RDS security group allows EKS node traffic |
| S3 access denied | Missing IRSA role | Verify `eks.amazonaws.com/role-arn` annotation on ServiceAccount |
| MSK connection timeout | Security group misconfigured | Ensure MSK SG allows inbound from EKS node SG on port 9092 |

---

## Azure Deployment (AKS + Helm)

This guide deploys SecureOps on Azure Kubernetes Service using Workload Identity, Azure Database for PostgreSQL, Event Hubs, and Azure Blob Storage.

### Step 1: Provision Infrastructure

```bash
export RESOURCE_GROUP=secureops-rg
export LOCATION=eastus
export CLUSTER_NAME=secureops-aks

az group create --name $RESOURCE_GROUP --location $LOCATION

az aks create \
  --resource-group $RESOURCE_GROUP \
  --name $CLUSTER_NAME \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-managed-identity \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --network-plugin azure \
  --generate-ssh-keys

az aks get-credentials --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME

az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name secureops-pgdb \
  --location $LOCATION \
  --admin-user secureops \
  --admin-password "YOUR_STRONG_PASSWORD" \
  --sku-name Standard_D2s_v3 \
  --tier GeneralPurpose \
  --version 16 \
  --storage-size 128 \
  --high-availability ZoneRedundant

az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name secureops-pgdb \
  --database-name secureops_management

az eventhubs namespace create \
  --resource-group $RESOURCE_GROUP \
  --name secureops-events-ns \
  --location $LOCATION \
  --sku Standard \
  --enable-kafka true

az storage account create \
  --resource-group $RESOURCE_GROUP \
  --name secureopsblob \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot

az storage container create \
  --account-name secureopsblob \
  --name secureops-events
```

### Step 2: Configure Workload Identity

```bash
AKS_OIDC_ISSUER=$(az aks show --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME --query "oidcIssuerProfile.issuerUrl" -o tsv)

az identity create \
  --resource-group $RESOURCE_GROUP \
  --name secureops-identity

CLIENT_ID=$(az identity show --resource-group $RESOURCE_GROUP --name secureops-identity --query clientId -o tsv)

az identity federated-credential create \
  --resource-group $RESOURCE_GROUP \
  --identity-name secureops-identity \
  --name secureops-federated \
  --issuer $AKS_OIDC_ISSUER \
  --subject system:serviceaccount:secureops:secureops-management \
  --audience api://AzureADTokenExchange
```

### Step 3: Build and Push Docker Images

```bash
ACR_NAME=secureopsacr

az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Standard
az aks update --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME --attach-acr $ACR_NAME

for component in management data-plane receiver; do
  az acr build --registry $ACR_NAME --image secureops/${component}:latest -f deploy/${component}/Dockerfile .
done
```

### Step 4: Install Application Gateway Ingress Controller

```bash
helm repo add application-gateway-kubernetes-ingress https://appgwingress.blob.core.windows.net/ingress-azure-helm-package/
helm install ingress-azure application-gateway-kubernetes-ingress/ingress-azure \
  --namespace kube-system \
  --set appgw.name=secureops-appgw \
  --set appgw.resourceGroup=$RESOURCE_GROUP \
  --set appgw.subscriptionId=$(az account show --query id -o tsv) \
  --set armAuth.type=workloadIdentity
```

### Step 5: Create Kubernetes Secret

```bash
kubectl create namespace secureops

STORAGE_KEY=$(az storage account keys list --account-name secureopsblob --query '[0].value' -o tsv)
PG_HOST=$(az postgres flexible-server show --resource-group $RESOURCE_GROUP --name secureops-pgdb --query fullyQualifiedDomainName -o tsv)

kubectl create secret generic secureops-secrets \
  --namespace secureops \
  --from-literal=database-url="postgresql://secureops:YOUR_PASSWORD@${PG_HOST}:5432/secureops_management?sslmode=require" \
  --from-literal=session-secret="$(openssl rand -hex 32)" \
  --from-literal=openai-api-key="sk-your-key" \
  --from-literal=superadmin-password="YourStrongPassword123!" \
  --from-literal=azure-storage-key="${STORAGE_KEY}"
```

### Step 6: Deploy with Helm

```bash
helm install secureops deploy/helm/secureops/ \
  --namespace secureops \
  -f deploy/helm/secureops/values/azure.yaml \
  --set global.imageRegistry=${ACR_NAME}.azurecr.io \
  --set serviceAccount.annotations."azure\.workload\.identity/client-id"="${CLIENT_ID}" \
  --set management.database.host=${PG_HOST} \
  --set management.ingress.host=app.yourdomain.com \
  --set receiver.ingress.host=ingest.yourdomain.com \
  --set objectStorage.accountName=secureopsblob \
  --set objectStorage.containerName=secureops-events \
  --set kafkaExternal.brokers="secureops-events-ns.servicebus.windows.net:9093" \
  --set secrets.create=false
```

### Step 7: Verify Deployment

```bash
kubectl get pods -n secureops
kubectl get svc -n secureops
kubectl get ingress -n secureops

kubectl logs -n secureops -l app.kubernetes.io/component=management --tail=50

curl -s https://app.yourdomain.com/healthz
```

### Azure Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| App Gateway not routing | AGIC misconfigured | Check AGIC pod logs in `kube-system` namespace |
| DB connection refused | Firewall rule missing | Add AKS subnet to PostgreSQL firewall rules |
| Event Hubs auth failure | Wrong connection string | Ensure Kafka-enabled namespace and use correct SASL config |
| Blob storage 403 | Workload Identity not set up | Verify federated credentials and SA annotations |

---

## GCP Deployment (GKE + Helm)

This guide deploys SecureOps on Google Kubernetes Engine using Workload Identity, Cloud SQL, and GCS.

### Step 1: Provision Infrastructure

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1
export ZONE=us-central1-a
export CLUSTER_NAME=secureops-gke

gcloud config set project $PROJECT_ID

gcloud container clusters create $CLUSTER_NAME \
  --region $REGION \
  --num-nodes 3 \
  --machine-type e2-standard-4 \
  --enable-ip-alias \
  --workload-pool=${PROJECT_ID}.svc.id.goog \
  --release-channel regular

gcloud sql instances create secureops-pg \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-8192 \
  --region=$REGION \
  --availability-type=REGIONAL \
  --storage-size=100 \
  --storage-type=SSD

gcloud sql databases create secureops_management --instance=secureops-pg
gcloud sql users set-password postgres --instance=secureops-pg --password="YOUR_STRONG_PASSWORD"

gsutil mb -l $REGION gs://secureops-events-${PROJECT_ID}/

gsutil lifecycle set <(cat <<EOF
{
  "rule": [
    {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"}, "condition": {"age": 90}},
    {"action": {"type": "SetStorageClass", "storageClass": "ARCHIVE"}, "condition": {"age": 365}}
  ]
}
EOF
) gs://secureops-events-${PROJECT_ID}/
```

### Step 2: Configure Workload Identity

```bash
gcloud iam service-accounts create secureops-sa \
  --display-name "SecureOps K8s Service Account"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:secureops-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:secureops-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/storage.objectAdmin"

gcloud iam service-accounts add-iam-policy-binding \
  secureops-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT_ID}.svc.id.goog[secureops/secureops-management]"
```

### Step 3: Build and Push Docker Images

```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev

for component in management data-plane receiver; do
  gcloud builds submit --tag gcr.io/${PROJECT_ID}/secureops/${component}:latest -f deploy/${component}/Dockerfile .
done
```

### Step 4: Deploy Cloud SQL Auth Proxy

The GCP values file supports Cloud SQL Proxy as a sidecar. Set the instance connection name:

```bash
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe secureops-pg --format='value(connectionName)')
```

### Step 5: Create Kubernetes Secret

```bash
kubectl create namespace secureops

kubectl create secret generic secureops-secrets \
  --namespace secureops \
  --from-literal=database-url="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/secureops_management" \
  --from-literal=session-secret="$(openssl rand -hex 32)" \
  --from-literal=openai-api-key="sk-your-key" \
  --from-literal=superadmin-password="YourStrongPassword123!"
```

### Step 6: Deploy with Helm

```bash
helm install secureops deploy/helm/secureops/ \
  --namespace secureops \
  -f deploy/helm/secureops/values/gcp.yaml \
  --set global.imageRegistry=gcr.io/${PROJECT_ID} \
  --set serviceAccount.annotations."iam\.gke\.io/gcp-service-account"="secureops-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set management.database.cloudSqlProxy.instanceConnectionName="${INSTANCE_CONNECTION_NAME}" \
  --set management.ingress.host=app.yourdomain.com \
  --set receiver.ingress.host=ingest.yourdomain.com \
  --set objectStorage.bucket=secureops-events-${PROJECT_ID} \
  --set objectStorage.projectId=${PROJECT_ID} \
  --set cloudProviderConfig.projectId=${PROJECT_ID} \
  --set secrets.create=false
```

### Step 7: Verify Deployment

```bash
kubectl get pods -n secureops
kubectl get svc -n secureops
kubectl get ingress -n secureops

kubectl logs -n secureops -l app.kubernetes.io/component=management --tail=50

curl -s https://app.yourdomain.com/healthz
```

### GCP Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Cloud SQL connection refused | Cloud SQL Proxy not running | Verify sidecar is enabled and instance connection name is correct |
| GCS permission denied | Workload Identity not bound | Run `gcloud iam service-accounts add-iam-policy-binding` for the K8s SA |
| Ingress pending | Static IP not reserved | Reserve a global static IP: `gcloud compute addresses create secureops-ip --global` |
| NEG not created | Missing NEG annotation | Ensure `cloud.google.com/neg: '{"ingress": true}'` on Service |

---

## On-Premises Deployment (Docker Compose)

This is the simplest production deployment. All infrastructure (PostgreSQL, TimescaleDB, Kafka, Redis, OpenSearch, MinIO) runs self-hosted via Docker Compose.

### Step 1: Clone and Configure

```bash
git clone <your-repo-url> secureops
cd secureops

cp deploy/docker/.env.onprem .env
```

Edit `.env` to set secure passwords:

```bash
DB_PASSWORD=your_strong_db_password
SESSION_SECRET=$(openssl rand -hex 32)
SUPERADMIN_DEFAULT_PASSWORD=YourAdminPassword123!
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
```

Optionally configure an AI provider:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-your-key
```

Or for self-hosted AI (Ollama):

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://ollama-host:11434
AI_MODEL=llama3
```

### Step 2: Start the Full Stack

```bash
docker-compose -f docker-compose.onprem.yml --env-file .env up -d
```

This starts all services:

| Service | Port | Description |
|---------|------|-------------|
| `management-db` | 5432 | PostgreSQL 16 (management plane) |
| `management-db-replica` | - | PostgreSQL streaming replica |
| `data-plane-db` | 5433 | TimescaleDB (data plane) |
| `data-plane-db-replica` | - | TimescaleDB streaming replica |
| `redis` | 6379 | Redis 7 cache |
| `redis-sentinel` | 26379 | Redis Sentinel for HA |
| `kafka-1/2/3` | - | Kafka KRaft 3-node HA cluster |
| `opensearch-1/2` | 9200 | OpenSearch 2-node cluster |
| `minio` | 9000/9001 | MinIO object storage |
| `nginx` | 80/443 | Nginx reverse proxy |
| `management-1/2` | - | Management plane (2 instances) |
| `receiver` | 5001 | Event receiver |
| `collector` | 5010 | Event collector |
| `normalizer` | 5011 | Event normalizer |
| `detection-engine` | 5012 | Sigma rule detection |
| `enrichment` | 5013 | IOC enrichment |
| `storage` | 5014 | Event persistence |
| `data-plane` | 5002 | Data plane API |

### Step 3: Verify Services

```bash
docker-compose -f docker-compose.onprem.yml ps

curl -s http://localhost/healthz
curl -s http://localhost/api/health | jq .
```

### Step 4: Access the Platform

- Management UI: `http://localhost` (via Nginx)
- MinIO Console: `http://localhost:9001`
- Default credentials: `admin / Admin@123` (or your configured password)

### Step 5: Assign Tenants to Data Region

```bash
curl -X PUT http://localhost/api/tenants/1/retention-policy \
  -H "Content-Type: application/json" \
  -d '{
    "dataRegion": "local-1",
    "retentionHotDays": 90,
    "retentionWarmDays": 365,
    "retentionColdDays": 1095
  }'
```

### Docker Compose Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Kafka brokers fail health check | Insufficient memory | Ensure at least 16 GB RAM; reduce `KAFKA_LOG_RETENTION_BYTES` |
| OpenSearch fails to start | `vm.max_map_count` too low | Run `sysctl -w vm.max_map_count=262144` on the host |
| Management can't reach DB | DB not healthy yet | Wait for `management-db` health check; check `docker logs management-db` |
| Nginx 502 Bad Gateway | Management instances not ready | Wait for management containers to pass health checks |
| MinIO health check fails | Port conflict | Ensure ports 9000/9001 are not in use by another service |

### Scaling the Docker Stack

To add more management instances, duplicate the `management-2` service definition with incremented names and add them to the Nginx upstream.

For multiple data plane regions on separate machines, use `docker-compose.data-plane.yml` with unique port mappings:

```bash
DATA_PLANE_REGION=us-east-1 \
DATA_PLANE_REGION_NAME="US (Virginia)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
DP_DB_PORT=5434 \
docker-compose -f docker-compose.data-plane.yml -p secureops-us-east up -d
```

---

## On-Premises Deployment (Kubernetes)

For on-premises Kubernetes clusters (k3s, Rancher, kubeadm, or bare-metal), you can deploy using either raw manifests or Helm with the on-prem values overlay.

### Option A: Helm Deployment (Recommended)

#### Step 1: Prepare the Cluster

```bash
kubectl create namespace secureops

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: secureops-secrets
  namespace: secureops
type: Opaque
stringData:
  database-url: "postgresql://secureops:YOUR_PASSWORD@postgresql.secureops.svc:5432/secureops_management"
  timescaledb-url: "postgresql://secureops:YOUR_PASSWORD@timescaledb.secureops.svc:5432/secureops_events"
  session-secret: "$(openssl rand -hex 32)"
  openai-api-key: "sk-your-key"
  superadmin-password: "YourStrongPassword123!"
EOF
```

#### Step 2: Push Images to Private Registry

```bash
REGISTRY=registry.internal.example.com

for component in management data-plane receiver; do
  docker build -t ${REGISTRY}/secureops/${component}:latest -f deploy/${component}/Dockerfile .
  docker push ${REGISTRY}/secureops/${component}:latest
done
```

#### Step 3: Create Image Pull Secret

```bash
kubectl create secret docker-registry registry-credentials \
  --namespace secureops \
  --docker-server=${REGISTRY} \
  --docker-username=YOUR_USER \
  --docker-password=YOUR_PASSWORD
```

#### Step 4: Install with Helm

```bash
helm install secureops deploy/helm/secureops/ \
  --namespace secureops \
  -f deploy/helm/secureops/values/onprem.yaml \
  --set global.imageRegistry=${REGISTRY} \
  --set management.ingress.host=app.secureops.local \
  --set receiver.ingress.host=ingest.secureops.local \
  --set secrets.create=false
```

The on-prem values file configures:
- `local-path` StorageClass (compatible with k3s and Rancher)
- Built-in Kafka KRaft 3-node cluster (self-hosted)
- Self-hosted Redis with Sentinel
- Self-hosted OpenSearch 2-node cluster
- MinIO for object storage
- Nginx Ingress Controller
- No cloud IAM annotations
- Network policies disabled (enable if your CNI supports them)

#### Step 5: Verify

```bash
kubectl get pods -n secureops
kubectl get svc -n secureops
kubectl get ingress -n secureops

curl -s https://app.secureops.local/healthz
```

### Option B: Raw Manifest Deployment

For environments without Helm, apply raw Kubernetes manifests directly.

#### Step 1: Deploy Management Plane

```bash
kubectl create namespace secureops

kubectl apply -f deploy/management/k8s/secrets.yaml
kubectl apply -f deploy/management/k8s/serviceaccount.yaml
kubectl apply -f deploy/management/k8s/rbac.yaml
kubectl apply -f deploy/management/k8s/configmap.yaml
kubectl apply -f deploy/management/k8s/pvc.yaml
kubectl apply -f deploy/management/k8s/deployment.yaml
kubectl apply -f deploy/management/k8s/service.yaml
kubectl apply -f deploy/management/k8s/ingress.yaml
```

#### Step 2: Deploy Data Plane

```bash
kubectl apply -f deploy/data-plane/k8s/secrets.yaml
kubectl apply -f deploy/data-plane/k8s/serviceaccount.yaml
kubectl apply -f deploy/data-plane/k8s/rbac.yaml
kubectl apply -f deploy/data-plane/k8s/configmap.yaml
kubectl apply -f deploy/data-plane/k8s/pvc.yaml
kubectl apply -f deploy/data-plane/k8s/deployment.yaml
kubectl apply -f deploy/data-plane/k8s/service.yaml
kubectl apply -f deploy/data-plane/k8s/hpa.yaml
```

#### Step 3: Deploy Receiver

```bash
kubectl apply -f deploy/receiver/k8s/secrets.yaml
kubectl apply -f deploy/receiver/k8s/serviceaccount.yaml
kubectl apply -f deploy/receiver/k8s/rbac.yaml
kubectl apply -f deploy/receiver/k8s/configmap.yaml
kubectl apply -f deploy/receiver/k8s/deployment.yaml
kubectl apply -f deploy/receiver/k8s/service.yaml
kubectl apply -f deploy/receiver/k8s/hpa.yaml
kubectl apply -f deploy/receiver/k8s/ingress.yaml
```

#### Step 4: (Optional) Deploy Kafka

If you need self-hosted Kafka:

```bash
kubectl apply -f deploy/receiver/k8s/kafka-statefulset.yaml
```

#### Step 5: Verify

```bash
kubectl get all -n secureops

kubectl logs -l app=secureops,plane=management -n secureops --tail=20
kubectl logs -l app=secureops,plane=data -n secureops --tail=20
kubectl logs -l app=secureops,plane=receiver -n secureops --tail=20
```

### On-Prem K8s Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| PVC stuck in Pending | No StorageClass provisioner | Install `local-path-provisioner` (k3s) or NFS provisioner |
| Ingress not working | No ingress controller | Install `nginx-ingress` controller |
| Image pull error | Registry not reachable | Check `imagePullSecrets` and registry connectivity |
| Kafka pods pending | Insufficient resources | Check node capacity; reduce Kafka resource requests |
| DNS resolution fails | CoreDNS misconfigured | Verify CoreDNS pods are running; check service FQDN |

---

## VMware Deployment (Tanzu Kubernetes Grid / vSphere)

Cyber Command Center runs on VMware Tanzu Kubernetes Grid (TKG) 2.x, vSphere with Tanzu (Supervisor clusters), and self-managed Kubernetes on vSphere VMs.

### Supported VMware Platforms

| Platform | Tested Version | Notes |
|---|---|---|
| VMware Tanzu Kubernetes Grid (TKG) | 2.x | Recommended — full lifecycle management |
| vSphere with Tanzu (Supervisor) | 8.0 U2+ | Requires vSphere Namespace and StorageClass |
| Self-managed K8s on vSphere VMs | Any | Use onprem.yaml + vsphere-csi driver |
| VMware Cloud on AWS | SDDC 1.22+ | Use aws.yaml with vSphere CNS |

### Prerequisites

- vSphere 7.0 U3 or 8.x with vSAN or external SAN
- vSphere CSI driver installed in the workload cluster
- StorageClass `vsphere-sc` (block/RWO) and `vsphere-nfs-sc` (RWX)
- kubectl + helm 3.14+ configured against the TKG workload cluster
- Container image registry reachable from the cluster (Harbor or Docker Hub)

#### Install vSphere CSI Driver (if not pre-installed by TKG)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/vsphere-csi-driver/master/manifests/vanilla/deploy/vsphere-csi-node-ds.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/vsphere-csi-driver/master/manifests/vanilla/deploy/vsphere-csi-controller-deployment.yaml
```

#### Create StorageClasses

```yaml
# vsphere-sc — Block (RWO) for stateful services
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: vsphere-sc
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: csi.vsphere.volume
parameters:
  datastoreurl: "ds:///vmfs/volumes/<your-datastore-id>/"
  storagepolicyname: "vSAN Default Storage Policy"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer

---
# vsphere-nfs-sc — File (RWX) for shared volumes (management persistence)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: vsphere-nfs-sc
provisioner: csi.vsphere.volume
parameters:
  storagepolicyname: "vSAN File Service"
reclaimPolicy: Retain
volumeBindingMode: Immediate
```

### Step 1: Build and Push Images

```bash
# Tag and push to your Harbor registry (or any OCI-compliant registry)
REGISTRY=registry.corp.internal/ccc

docker build -t $REGISTRY/management:latest -f deploy/management/Dockerfile .
docker build -t $REGISTRY/receiver:latest  -f deploy/receiver/Dockerfile .
docker push $REGISTRY/management:latest
docker push $REGISTRY/receiver:latest
```

### Step 2: Create Namespace and Secrets

```bash
kubectl create namespace ccc

kubectl create secret generic ccc-secrets \
  --from-literal=database-url="postgresql://secureops:PASSWORD@pg-host:5432/ccc_management" \
  --from-literal=session-secret="$(openssl rand -base64 64)" \
  --from-literal=openai-api-key="sk-..." \
  --from-literal=superadmin-password="Admin@123" \
  --from-literal=cloud-storage-access-key="" \
  --from-literal=cloud-storage-secret-key="" \
  -n ccc

kubectl create secret generic ccc-redis-secret \
  --from-literal=redis-password="$(openssl rand -base64 32)" \
  -n ccc
```

### Step 3: Deploy with Helm

```bash
helm upgrade --install ccc ./deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/values/vmware.yaml \
  --namespace ccc \
  --create-namespace \
  --set global.imageRegistry="registry.corp.internal/ccc/" \
  --set management.ingress.host="ccc.corp.internal" \
  --set receiver.ingress.host="ingest.corp.internal" \
  --wait --timeout=10m
```

### Step 4: Verify Deployment

```bash
kubectl get pods -n ccc
kubectl get hpa  -n ccc
kubectl get pdb  -n ccc
kubectl get ing  -n ccc

# Check management is healthy
kubectl rollout status deployment/ccc-management -n ccc
kubectl logs -l plane=management -n ccc --tail=20

# Access the platform
echo "https://$(kubectl get ing ccc-management -n ccc -o jsonpath='{.spec.rules[0].host}')"
```

### Step 5: Enable Vertical Pod Autoscaler (Optional)

```bash
# Install VPA
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/vertical-pod-autoscaler/deploy/vpa-rbac.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/vertical-pod-autoscaler/deploy/vpa-admission-controller.yaml

# Re-deploy with VPA enabled
helm upgrade ccc ./deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/values/vmware.yaml \
  --set vpa.enabled=true \
  --namespace ccc
```

### VMware Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| PVC stuck in `Pending` | StorageClass missing or CSI not installed | Verify CSI driver pods running; check StorageClass exists |
| RWX PVC fails | File services not enabled on vSAN | Enable vSAN File Services in vCenter; create `vsphere-nfs-sc` StorageClass |
| Image pull failure | Harbor cert not trusted | Add Harbor CA cert to cluster nodes; set `imagePullSecrets` |
| Ingress not resolving | No ingress controller | Install `nginx-ingress` or NSX-T ingress controller |
| Kafka pods OOMKilled | Heap too large for node | Reduce `kafkaKraft.resources.limits.memory` or add nodes |

---

## Nutanix Deployment (Karbon / NKE)

Cyber Command Center supports Nutanix Karbon (now called NKE — Nutanix Kubernetes Engine) 2.x running on Nutanix AHV hypervisor.

### Supported Nutanix Platforms

| Platform | Version | Notes |
|---|---|---|
| Nutanix Kubernetes Engine (NKE/Karbon) | 2.x | Recommended — integrated lifecycle |
| Self-managed K8s on AHV VMs | Any | Use onprem.yaml + Nutanix CSI |
| Nutanix NC2 on AWS | Any | Use aws.yaml with Nutanix CSI |

### Prerequisites

- Nutanix AOS 6.x and AHV
- Nutanix CSI Driver installed in the NKE cluster
- StorageClass `nutanix-volume` (block/iSCSI) and `nutanix-file` (RWX)
- kubectl + helm 3.14+ configured against the NKE cluster
- Container registry reachable from the cluster

#### Install Nutanix CSI Driver

```bash
# Install via Helm (recommended)
helm repo add nutanix https://nutanix.github.io/helm/
helm repo update

helm install nutanix-csi nutanix/nutanix-csi-storage \
  --namespace ntnx-system --create-namespace \
  --set prismEndPoint="prism-element.corp.internal" \
  --set username="admin" \
  --set password="Admin@123" \
  --set defaultStorageClass=nutanix-volume
```

#### Create StorageClasses

```yaml
# nutanix-volume — Block (RWO) for stateful services (iSCSI-backed)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nutanix-volume
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: csi.nutanix.com
parameters:
  csi.storage.k8s.io/provisioner-secret-name: ntnx-secret
  csi.storage.k8s.io/provisioner-secret-namespace: ntnx-system
  csi.storage.k8s.io/node-publish-secret-name: ntnx-secret
  csi.storage.k8s.io/node-publish-secret-namespace: ntnx-system
  csi.storage.k8s.io/controller-expand-secret-name: ntnx-secret
  csi.storage.k8s.io/controller-expand-secret-namespace: ntnx-system
  storageType: NutanixVolumes
  dataServiceEndPoint: "prism-element.corp.internal:3260"
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer

---
# nutanix-file — Files (RWX) for shared volumes
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nutanix-file
provisioner: csi.nutanix.com
parameters:
  storageType: NutanixFiles
  nfsServerName: "nutanix-files.corp.internal"
reclaimPolicy: Retain
volumeBindingMode: Immediate
```

### Step 1: Build and Push Images

```bash
REGISTRY=registry.corp.internal/ccc

docker build -t $REGISTRY/management:latest -f deploy/management/Dockerfile .
docker build -t $REGISTRY/receiver:latest  -f deploy/receiver/Dockerfile .
docker push $REGISTRY/management:latest
docker push $REGISTRY/receiver:latest
```

### Step 2: Create Namespace and Secrets

```bash
kubectl create namespace ccc

kubectl create secret generic ccc-secrets \
  --from-literal=database-url="postgresql://secureops:PASSWORD@pg-host:5432/ccc_management" \
  --from-literal=session-secret="$(openssl rand -base64 64)" \
  --from-literal=openai-api-key="sk-..." \
  --from-literal=superadmin-password="Admin@123" \
  --from-literal=cloud-storage-access-key="" \
  --from-literal=cloud-storage-secret-key="" \
  -n ccc

kubectl create secret generic ccc-redis-secret \
  --from-literal=redis-password="$(openssl rand -base64 32)" \
  -n ccc
```

### Step 3: Deploy with Helm

```bash
helm upgrade --install ccc ./deploy/helm/secureops \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/secureops/values/nutanix.yaml \
  --namespace ccc \
  --create-namespace \
  --set global.imageRegistry="registry.corp.internal/ccc/" \
  --set management.ingress.host="ccc.corp.internal" \
  --set receiver.ingress.host="ingest.corp.internal" \
  --wait --timeout=10m
```

### Step 4: Verify Deployment

```bash
kubectl get pods -n ccc
kubectl get hpa  -n ccc
kubectl get pdb  -n ccc
kubectl get ing  -n ccc

kubectl rollout status deployment/ccc-management -n ccc
kubectl logs -l plane=management -n ccc --tail=20

echo "https://$(kubectl get ing ccc-management -n ccc -o jsonpath='{.spec.rules[0].host}')"
```

### Step 5: Nutanix-Specific Cluster Autoscaler

NKE includes a built-in node autoscaler. Configure it in Prism Central:

```
Prism Central → Kubernetes Management → ccc-cluster
→ Node Pools → Edit → Enable Autoscaling
  Min Nodes: 3
  Max Nodes: 20
  Scale-up Threshold: 70% CPU
  Scale-down Threshold: 40% CPU
```

### Nutanix Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| PVC stuck in `Pending` | CSI driver not installed or Prism auth | Check `kubectl get csidrivers`; verify CSI secret credentials |
| RWX PVC fails | Files service not configured | Enable Nutanix Files and set `nfsServerName` in StorageClass |
| iSCSI mount fails | Data Services IP not configured | Set `dataServiceEndPoint` to Prism Element DSI IP:port |
| Pods `ImagePullBackOff` | Registry unreachable from AHV VM | Check IPAM/routing between AHV and registry; set `imagePullSecrets` |
| Kafka OOMKilled | Heap too high | Reduce `kafkaKraft.resources.limits.memory`; resize worker pool |

---

## Production Docker Compose (VMware / Nutanix VM Environments)

Use this when running Docker directly on VMs (VMware vSphere VMs or Nutanix AHV VMs) without Kubernetes. Includes resource limits, health checks, Redis Sentinel, 3-node Kafka KRaft, and nginx load balancer.

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- At least 4 vCPUs and 16 GB RAM for a minimal deployment
- Recommended: 16 vCPUs / 64 GB RAM for production load

### Setup

```bash
# 1. Copy and configure environment file
cp deploy/docker/.env.prod.example .env.prod
$EDITOR .env.prod   # fill in all CHANGE_ME values

# 2. Generate TLS certificates (or copy existing certs)
mkdir -p certs
# Self-signed (dev/test only):
openssl req -x509 -nodes -newkey rsa:4096 -days 365 \
  -keyout certs/privkey.pem -out certs/fullchain.pem \
  -subj "/CN=ccc.corp.internal"

# 3. Start all services
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

### Vertical Scaling (Multi-Core VMs)

Set `CLUSTER_WORKERS` to the number of vCPUs on your VM. The management plane will fork that many Node.js worker processes, saturating all available cores:

```bash
# In .env.prod:
CLUSTER_WORKERS=16   # for a 16-vCPU VM
```

### Horizontal Scaling

```bash
# Scale management plane to 5 replicas (nginx round-robins across them)
docker compose -f deploy/docker/docker-compose.prod.yml \
  --env-file .env.prod up -d --scale management=5

# Scale receiver to 4 replicas
docker compose -f deploy/docker/docker-compose.prod.yml \
  --env-file .env.prod up -d --scale receiver=4
```

### Monitoring

```bash
# Health check all services
docker compose -f deploy/docker/docker-compose.prod.yml ps

# View live logs
docker compose -f deploy/docker/docker-compose.prod.yml logs -f management

# Resource usage
docker stats
```

---

## Management Plane Deployment

The management plane handles all UI, API, incident orchestration, reporting, and administration.

### Step 1: Start Management Plane

```bash
docker-compose -f docker-compose.microservices.yml up -d
```

### Step 2: Verify Services

```bash
docker-compose -f docker-compose.microservices.yml ps
```

Expected services:
| Service | Port | Description |
|---------|------|-------------|
| `management-db` | 5432 | PostgreSQL 16 primary |
| `management-db-replica` | - | PostgreSQL streaming replica |
| `redis` | 6379 | Redis 7 cache |
| `redis-sentinel` | 26379 | Redis Sentinel for HA |
| `kafka-mgmt` | 9092 | Kafka KRaft (management events) |
| `minio` | 9000/9001 | MinIO object storage |
| `nginx` | 80/443 | Load balancer |
| `management-1` | - | Management API instance 1 |
| `management-2` | - | Management API instance 2 |

### Step 3: Access

- Management UI: `http://localhost` (via Nginx)
- MinIO Console: `http://localhost:9001`
- Default credentials: `admin / Admin@123`

### Step 4: Configure AI Provider

Set AI provider in your `.env` file or docker-compose environment:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-your-key-here
```

---

## Data Plane Deployment

Each data plane is deployed per region using the reusable `docker-compose.data-plane.yml` template.

### Step 1: Deploy India Region (Primary)

```bash
DATA_PLANE_REGION=in-west-1 \
DATA_PLANE_REGION_NAME="India (Mumbai)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
docker-compose -f docker-compose.data-plane.yml up -d
```

### Step 2: Deploy US East Region

```bash
DATA_PLANE_REGION=us-east-1 \
DATA_PLANE_REGION_NAME="US (Virginia)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
DP_DB_PORT=5434 \
DP_OPENSEARCH_PORT=9201 \
DP_MINIO_PORT=9002 \
DP_COLLECTOR_PORT=5011 \
DP_NORMALIZER_PORT=5012 \
DP_DETECTION_PORT=5013 \
DP_ENRICHMENT_PORT=5014 \
DP_STORAGE_PORT=5015 \
docker-compose -f docker-compose.data-plane.yml -p secureops-us-east up -d
```

### Step 3: Deploy Additional Regions

Repeat with unique port mappings for Kenya, Saudi Arabia, and Bahrain:

```bash
# Kenya
DATA_PLANE_REGION=ke-east-1 \
DATA_PLANE_REGION_NAME="Kenya (Nairobi)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
DP_DB_PORT=5435 \
docker-compose -f docker-compose.data-plane.yml -p secureops-kenya up -d

# Saudi Arabia
DATA_PLANE_REGION=sa-central-1 \
DATA_PLANE_REGION_NAME="Saudi Arabia (Riyadh)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
DP_DB_PORT=5436 \
docker-compose -f docker-compose.data-plane.yml -p secureops-saudi up -d

# Bahrain
DATA_PLANE_REGION=bh-east-1 \
DATA_PLANE_REGION_NAME="Bahrain (Manama)" \
MANAGEMENT_PLANE_URL=http://management-host:80 \
DP_DB_PORT=5437 \
docker-compose -f docker-compose.data-plane.yml -p secureops-bahrain up -d
```

### Step 4: Configure Management Plane Region Connections

Update the management plane environment with each region's connection details:

```bash
DP_IN_WEST_1_DB_URL=postgresql://secureops:password@india-db:5432/secureops_events
DP_IN_WEST_1_STORAGE_URL=http://india-minio:9000
DP_IN_WEST_1_KAFKA_BROKERS=india-kafka-1:9092,india-kafka-2:9092,india-kafka-3:9092

DP_US_EAST_1_DB_URL=postgresql://secureops:password@us-db:5432/secureops_events
DP_US_EAST_1_STORAGE_URL=http://us-minio:9000
DP_US_EAST_1_KAFKA_BROKERS=us-kafka-1:9092,us-kafka-2:9092,us-kafka-3:9092
```

### Step 5: Assign Tenants to Regions

Use the Admin Portal or API:

```bash
curl -X PUT http://localhost/api/tenants/1/retention-policy \
  -H "Content-Type: application/json" \
  -d '{
    "dataRegion": "in-west-1",
    "retentionHotDays": 90,
    "retentionWarmDays": 365,
    "retentionColdDays": 1095
  }'
```

---

## Regional Data Plane Deployment

### India (ap-south-1)

```bash
helm install secureops-dp-india deploy/helm/secureops/ \
  -f deploy/helm/secureops/regional/values-india.yaml \
  --namespace secureops-india \
  --create-namespace
```

Regional specifics:
- Availability Zones: `ap-south-1a`, `ap-south-1b`, `ap-south-1c`
- Storage Class: `gp3`
- Compliance: IT-Act-2000
- Object Storage Bucket: `secureops-events-india`
- Archive Class: `GLACIER`

### US East (us-east-1)

```bash
helm install secureops-dp-us deploy/helm/secureops/ \
  -f deploy/helm/secureops/regional/values-us-east.yaml \
  --namespace secureops-us \
  --create-namespace
```

Regional specifics:
- Availability Zones: `us-east-1a`, `us-east-1b`, `us-east-1c`
- Storage Class: `gp3`
- Compliance: SOC2, HIPAA
- Object Storage Bucket: `secureops-events-us-east`

### Kenya (af-south-1)

```bash
helm install secureops-dp-kenya deploy/helm/secureops/ \
  -f deploy/helm/secureops/regional/values-kenya.yaml \
  --namespace secureops-kenya \
  --create-namespace
```

Regional specifics:
- Availability Zones: `af-south-1a`, `af-south-1b`
- Compliance: KDPA
- Object Storage Bucket: `secureops-events-kenya`

### Saudi Arabia (me-central-1)

```bash
helm install secureops-dp-saudi deploy/helm/secureops/ \
  -f deploy/helm/secureops/regional/values-saudi.yaml \
  --namespace secureops-saudi \
  --create-namespace
```

Regional specifics:
- Availability Zones: `me-central-1a`, `me-central-1b`, `me-central-1c`
- Compliance: PDPL, NCA-ECC
- Object Storage Bucket: `secureops-events-saudi`

### Bahrain (me-south-1)

```bash
helm install secureops-dp-bahrain deploy/helm/secureops/ \
  -f deploy/helm/secureops/regional/values-bahrain.yaml \
  --namespace secureops-bahrain \
  --create-namespace
```

Regional specifics:
- Availability Zones: `me-south-1a`, `me-south-1b`, `me-south-1c`
- Compliance: PDPL
- Object Storage Bucket: `secureops-events-bahrain`

---

## AI Provider Configuration

### OpenAI (Default)

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-your-key
```

### Anthropic

```bash
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-your-key
```

### Ollama (Self-Hosted)

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://ollama-host:11434
AI_MODEL=llama3
```

### Azure OpenAI

```bash
AI_PROVIDER=azure
AI_API_KEY=your-azure-key
AI_BASE_URL=https://your-resource.openai.azure.com
AI_API_VERSION=2024-02-15-preview
AI_MODEL=gpt-4o-mini
```

### Google Vertex AI

```bash
AI_PROVIDER=vertex
AI_BASE_URL=https://your-vertex-endpoint
AI_API_KEY=your-key
AI_MODEL=gemini-pro
```

### HuggingFace

```bash
AI_PROVIDER=huggingface
AI_API_KEY=hf_your-token
AI_MODEL=meta-llama/Meta-Llama-3-8B-Instruct
```

### Custom OpenAI-Compatible

```bash
AI_PROVIDER=custom
AI_BASE_URL=http://your-custom-endpoint/v1
AI_API_KEY=your-key
AI_MODEL=your-model
```

---

## Cloud Storage Configuration

### MinIO (Local Development / Self-Hosted)

```bash
CLOUD_STORAGE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### AWS S3

```bash
CLOUD_STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CLOUD_STORAGE_REGION=us-east-1
CLOUD_STORAGE_BUCKET=secureops-data
```

### Azure Blob Storage

```bash
CLOUD_STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT_NAME=secureopsstore
AZURE_STORAGE_ACCOUNT_KEY=...
CLOUD_STORAGE_BUCKET=secureops-data
```

### Google Cloud Storage

```bash
CLOUD_STORAGE_PROVIDER=gcs
GCP_PROJECT_ID=your-project
GCP_KEY_FILE_PATH=/path/to/service-account-key.json
CLOUD_STORAGE_BUCKET=secureops-data
```

---

## High Availability Architecture

```
Management Plane (HA):
=====================
                +------------------+
                |  Nginx LB        |
                |  (Port 80/443)   |
                +--------+---------+
                         |
              +----------+----------+
              |                     |
        +-----+-----+        +-----+-----+
        | Mgmt API 1 |        | Mgmt API 2 |
        +-----+------+        +-----+------+
              |                      |
              +----------+-----------+
                         |
              +----------+----------+
              |          |          |
        +-----+----+ +--+---+ +---+----+
        |PG Primary | |Redis | | Kafka  |
        |+ Replica  | |+Sent.| | KRaft  |
        +-----------+ +------+ +--------+

Data Plane (Per Region, HA):
============================
    +--------------------------------+
    |        Kafka KRaft x3          |
    |   (min.insync.replicas=2)      |
    +-----------+--------------------+
                |
    +-----------+----------+
    |                      |
    |   Pipeline Services   |
    |  (Collector, Norm,    |
    |   Detection, Enrich,  |
    |   Storage)            |
    +-----------+----------+
                |
    +-----------+----------+
    |           |          |
+---+-----+ +--+---+ +----+------+
|Timescale | |Open  | | MinIO/S3  |
|DB +      | |Search| | Object    |
|Replica   | | x2   | | Storage   |
+----------+ +------+ +-----------+
```

### Key HA Considerations

1. **Stateless Application**: Sessions stored in PostgreSQL, any instance can serve any request
2. **Database**: PostgreSQL streaming replication with automatic failover
3. **Kafka**: 3-node KRaft cluster with `min.insync.replicas=2` for zero message loss
4. **OpenSearch**: 2-node cluster with shard replication
5. **Redis**: Sentinel mode for automatic failover
6. **Object Storage**: MinIO or cloud-managed (S3/Blob/GCS) with built-in redundancy
7. **Pod Anti-Affinity**: Kubernetes spreads pods across availability zones

---

## Monitoring & Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Lightweight liveness probe (200 OK) |
| `GET /api/health` | Detailed health with DB connectivity and uptime |
| `GET /api/pipeline/metrics` | Pipeline throughput and consumer lag |
| `GET /api/admin/data-planes` | Data plane region status |
| `GET /api/admin/data-planes/:regionId/health` | Per-region health details |
| `GET /api/admin/platform-health/data-planes` | All regions health overview |

### Platform Health Dashboard

The Admin Portal > Platform Health tab provides:
- System health cards (uptime, DB latency, memory, cache)
- Data plane region health cards (DB, Kafka, OpenSearch, storage status per region)
- Data plane connectivity matrix
- Object storage usage per tenant per region
- Data archival pipeline status
- Auto-refresh every 30 seconds

---

## Backup Strategy

1. **Management Database**: Automated PostgreSQL backups with point-in-time recovery (PITR)
2. **Data Plane Databases**: Per-region TimescaleDB backups with PITR
3. **Object Storage**: Cloud-native redundancy (S3 11 nines, Azure LRS/GRS, GCS multi-region)
4. **Kafka**: Topic retention provides 7-day replay buffer; critical topics have 30-day retention
5. **Configuration**: Store all environment variables in a secrets manager (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)
6. **Reports & Uploads**: Stored on shared filesystem (EFS/Filestore/Azure Files) or in object storage

---

## Troubleshooting

### General Diagnostics

```bash
# Check pod status and events
kubectl get pods -n secureops -o wide
kubectl describe pod <pod-name> -n secureops

# Check logs
kubectl logs -n secureops -l app.kubernetes.io/component=management --tail=100
kubectl logs -n secureops -l app.kubernetes.io/component=receiver --tail=100

# Check health endpoints
curl -s http://localhost/healthz
curl -s http://localhost/api/health | jq .

# Docker Compose logs
docker-compose -f docker-compose.onprem.yml logs --tail=50 management-1
docker-compose -f docker-compose.onprem.yml logs --tail=50 kafka-1
```

### Common Issues

| Issue | Diagnosis | Resolution |
|-------|-----------|------------|
| Database connection refused | Check DB pod/container health | Verify `DATABASE_URL`, check firewall rules, ensure DB is healthy |
| Kafka consumer lag growing | Check consumer group offsets | Scale consumers, increase `CONSUMER_CONCURRENCY`, check for slow downstream |
| OpenSearch cluster red | Check cluster health API | Verify `vm.max_map_count >= 262144`, check disk space, review shard allocation |
| High memory usage | Check resource limits | Increase memory limits, tune JVM heap for Kafka/OpenSearch |
| SSL/TLS errors | Check certificate validity | Renew certificates, verify cert-manager issuer, check secret references |
| Slow API responses | Check DB query performance | Add indexes, check connection pool size, review slow query logs |
| Event ingestion stopped | Check receiver and Kafka health | Verify Kafka broker connectivity, check receiver logs for errors |

### Helm Debugging

```bash
# Dry-run to inspect rendered templates
helm template secureops deploy/helm/secureops/ \
  -f deploy/helm/secureops/values/aws.yaml \
  --namespace secureops

# Check release status
helm status secureops -n secureops
helm history secureops -n secureops

# Rollback
helm rollback secureops 1 -n secureops
```
