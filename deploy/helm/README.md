# Cyber Command Center — Helm Deployment Guide

This directory contains the Helm chart and per-cloud override values for deploying
Cyber Command Center on Kubernetes (EKS, GKE, AKS, or vanilla K8s).

## Directory layout

```
deploy/helm/
├── secureops/          # Main Helm chart
│   ├── Chart.yaml
│   ├── values.yaml     # Default values (cloud-agnostic baseline)
│   ├── templates/      # Kubernetes manifests
│   └── ...
├── values-aws.yaml     # AWS EKS overrides (ALB, gp3, IRSA, MSK)
├── values-gcp.yaml     # GCP GKE overrides (GCE ingress, Workload Identity, GCS)
├── values-azure.yaml   # Azure AKS overrides (AGIC, managed-premium, Azure WI)
└── README.md           # This file
```

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| helm | 3.12+ |
| kubectl | 1.28+ |
| cert-manager (cluster) | 1.13+ |
| Cloud-specific ingress controller | see per-cloud section |

Create the namespace and secrets first:

```bash
kubectl create namespace secureops

kubectl create secret generic secureops-secrets \
  --namespace secureops \
  --from-literal=database-url="postgresql://user:pass@host:5432/dbname?sslmode=require" \
  --from-literal=session-secret="$(openssl rand -hex 32)" \
  --from-literal=openai-api-key="sk-..." \
  --from-literal=superadmin-password="Admin@YourSecurePassword!"
```

---

## AWS EKS

**Prerequisites:**
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) installed
- [EBS CSI Driver](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) installed (for gp3 volumes)
- ACM certificate ARN for your domain

```bash
# Set your values
CERTIFICATE_ARN="arn:aws:acm:us-east-1:123456789012:certificate/xxxx"
IRSA_ROLE_ARN="arn:aws:iam::123456789012:role/secureops-role"

helm upgrade --install secureops ./deploy/helm/secureops \
  --namespace secureops --create-namespace \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/values-aws.yaml \
  --set management.ingress.host=app.example.com \
  --set receiver.ingress.host=ingest.example.com \
  --set "management.ingress.annotations.alb\.ingress\.kubernetes\.io/certificate-arn=${CERTIFICATE_ARN}" \
  --set "receiver.ingress.annotations.alb\.ingress\.kubernetes\.io/certificate-arn=${CERTIFICATE_ARN}" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${IRSA_ROLE_ARN}" \
  --set objectStorage.bucket=my-secureops-bucket \
  --set objectStorage.region=us-east-1 \
  --set kafkaExternal.brokers="b-1.my-msk.xxx.kafka.us-east-1.amazonaws.com:9092" \
  --wait
```

**Environment variables to configure via Secrets Manager / ECS task def:**
- `DB_SSL=true`, `DB_SSL_CA=/app/certs/global-bundle.pem`
- `DB_POOL_MAX=20`
- `CLOUD_STORAGE_PROVIDER=s3`
- `CLUSTER_WORKERS_MAX=4` (prevents Fargate OOM on tasks with limited vCPUs)
- `APP_BASE_URL=https://app.example.com`

---

## GCP GKE

**Prerequisites:**
- GKE cluster with HTTP Load Balancing enabled (default)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity) configured
- GCP service account with `roles/storage.objectAdmin` on your GCS bucket

```bash
GCP_SA_EMAIL="secureops-sa@my-project.iam.gserviceaccount.com"
GCS_BUCKET="my-secureops-bucket"
GCP_PROJECT="my-project"

helm upgrade --install secureops ./deploy/helm/secureops \
  --namespace secureops --create-namespace \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/values-gcp.yaml \
  --set management.ingress.host=app.example.com \
  --set receiver.ingress.host=ingest.example.com \
  --set "serviceAccount.annotations.iam\.gke\.io/gcp-service-account=${GCP_SA_EMAIL}" \
  --set objectStorage.provider=gcs \
  --set objectStorage.bucket="${GCS_BUCKET}" \
  --wait
```

**GCS credential notes:**
- On GKE with Workload Identity, omit `GCP_KEY_FILE_PATH` entirely — the SDK picks
  up credentials via ADC automatically.
- Set `GCP_PROJECT_ID` if the project cannot be inferred from the metadata server.

---

## Azure AKS

**Prerequisites:**
- [Application Gateway Ingress Controller (AGIC)](https://learn.microsoft.com/en-us/azure/application-gateway/ingress-controller-overview) installed, **or** swap to `className: nginx` for NGINX ingress
- [Azure Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview) enabled on the cluster
- Azure Managed Identity with `Storage Blob Data Contributor` role on your Blob container

```bash
AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # Managed Identity client ID
BLOB_CONTAINER="secureops-events"
STORAGE_ACCOUNT="mysecureopsaccount"

helm upgrade --install secureops ./deploy/helm/secureops \
  --namespace secureops --create-namespace \
  -f deploy/helm/secureops/values.yaml \
  -f deploy/helm/values-azure.yaml \
  --set management.ingress.host=app.example.com \
  --set receiver.ingress.host=ingest.example.com \
  --set "serviceAccount.annotations.azure\.workload\.identity/client-id=${AZURE_CLIENT_ID}" \
  --set objectStorage.provider=azure \
  --set objectStorage.bucket="${BLOB_CONTAINER}" \
  --set kafkaExternal.brokers="${EVENTHUBS_NAMESPACE}.servicebus.windows.net:9093" \
  --wait
```

**Azure Blob credential notes:**
- With Workload Identity, set `AZURE_STORAGE_ACCOUNT_NAME` but omit `AZURE_STORAGE_ACCOUNT_KEY`.
  The SDK automatically picks up credentials via the DefaultAzureCredential chain
  (`AZURE_CLIENT_ID` → Managed Identity → Workload Identity token).
- Alternatively set `AZURE_STORAGE_CONNECTION_STRING` for a simpler setup in non-prod.

---

## Vanilla Kubernetes (on-prem)

Use the base values only (no cloud overrides):

```bash
helm upgrade --install secureops ./deploy/helm/secureops \
  --namespace secureops --create-namespace \
  -f deploy/helm/secureops/values.yaml \
  --set management.ingress.host=app.example.com \
  --set receiver.ingress.host=ingest.example.com \
  --set objectStorage.provider=minio \
  --set global.storageClass=standard \
  --wait
```

---

## Upgrade

Re-run the same `helm upgrade --install` command with the same `-f` flags. Helm
applies only the diff and performs a rolling restart of affected deployments.

## Uninstall

```bash
helm uninstall secureops --namespace secureops
kubectl delete namespace secureops
```

> **Note:** Persistent volume claims (PVCs) are **not** deleted automatically.
> Delete them manually if you want to reclaim the storage:
> ```bash
> kubectl delete pvc --all --namespace secureops
> ```
