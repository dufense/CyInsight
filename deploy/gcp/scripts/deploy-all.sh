#!/usr/bin/env bash
##############################################################################
# Cyber Command Center -- GCP Deployment Manager Full Deploy Script
#
# Deploys all 4 GCP Deployment Manager configs in dependency order:
#   01. ccc-vpc         -- VPC network + subnets + NAT + firewall rules
#                          + VPC Access Connector (ccc-vpc-connector-us-central1)
#   02. ccc-cloudsql    -- Cloud SQL PostgreSQL 16 (management OLTP)
#                          (dbPassword auto-generated and passed via --properties)
#   03. ccc-datalake    -- GCS + BigQuery (data lake) [deployed BEFORE pubsub]
#                          (GCS bucket names: ccc-raw-events-<PROJECT_ID> etc.)
#   04. ccc-pubsub      -- Pub/Sub topics, subscriptions + Dataflow Flex Template
#                          (uses gcp-types/dataflow-v1b3:projects.locations.flexTemplates.launch)
#                          GCS bucket must exist before this DM deployment runs.
#   05. dataflow (CLI)  -- gcloud dataflow flex-template run (idempotent re-launch)
#                          Belt-and-suspenders: ensures job is running even if DM
#                          Flex Template launch had a transient error.
#
# Cloud Run services are deployed separately via gcloud run deploy.
#
# Usage:
#   export GCP_PROJECT_ID=your-gcp-project-id
#   export GCP_REGION=us-central1
#   export IMAGE_TAG=v2.0.0
#   export CONTAINER_REGISTRY=gcr.io/${GCP_PROJECT_ID}
#
#   chmod +x deploy/gcp/scripts/deploy-all.sh
#   ./deploy/gcp/scripts/deploy-all.sh
#
# Selective deploy:
#   ./deploy/gcp/scripts/deploy-all.sh --stack vpc
#   ./deploy/gcp/scripts/deploy-all.sh --stack cloudsql
#   ./deploy/gcp/scripts/deploy-all.sh --stack pubsub
#   ./deploy/gcp/scripts/deploy-all.sh --stack datalake
#   ./deploy/gcp/scripts/deploy-all.sh --stack dataflow
#   ./deploy/gcp/scripts/deploy-all.sh --stack cloud-run
##############################################################################

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
GCP_REGION="${GCP_REGION:-us-central1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_REGISTRY="${CONTAINER_REGISTRY:-gcr.io/${GCP_PROJECT_ID}}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOY_STACK="${DEPLOY_STACK:-all}"
TEMPLATE_DIR="deploy/gcp/deployment-manager"

DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

while [[ $# -gt 0 ]]; do
  case $1 in
    --stack) DEPLOY_STACK="$2"; shift 2 ;;
    --env)   ENVIRONMENT="$2"; shift 2 ;;
    --tag)   IMAGE_TAG="$2"; shift 2 ;;
    -h|--help)
      grep "^#" "$0" | sed 's/^# //' | head -30
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

dm_deploy() {
  local deployment_name="$1"
  local config_file="$2"
  shift 2
  local extra_args=("$@")   # e.g. --properties key:value

  if gcloud deployment-manager deployments describe "${deployment_name}" \
      --project="${GCP_PROJECT_ID}" &>/dev/null 2>&1; then
    log "Updating existing deployment: ${deployment_name}"
    gcloud deployment-manager deployments update "${deployment_name}" \
      --project="${GCP_PROJECT_ID}" \
      --config="${config_file}" \
      "${extra_args[@]+"${extra_args[@]}"}"
  else
    log "Creating new deployment: ${deployment_name}"
    gcloud deployment-manager deployments create "${deployment_name}" \
      --project="${GCP_PROJECT_ID}" \
      --config="${config_file}" \
      "${extra_args[@]+"${extra_args[@]}"}"
  fi
  log "Deployed: ${deployment_name}"
}

dm_output() {
  local deployment_name="$1"
  local output_key="$2"
  gcloud deployment-manager deployments describe "${deployment_name}" \
    --project="${GCP_PROJECT_ID}" \
    --format="value(outputs[name=${output_key}].finalValue)"
}

enable_apis() {
  log "Enabling required GCP APIs..."
  local apis=(
    compute.googleapis.com
    sqladmin.googleapis.com
    pubsub.googleapis.com
    storage.googleapis.com
    bigquery.googleapis.com
    secretmanager.googleapis.com
    run.googleapis.com
    deploymentmanager.googleapis.com
    cloudresourcemanager.googleapis.com
    iam.googleapis.com
    vpcaccess.googleapis.com
    servicenetworking.googleapis.com
    dataflow.googleapis.com
  )
  gcloud services enable "${apis[@]}" --project="${GCP_PROJECT_ID}"
  log "APIs enabled"
}

deploy_vpc() {
  dm_deploy "ccc-vpc" "${TEMPLATE_DIR}/01-vpc.yaml"
  log "VPC network created"
}

deploy_cloudsql() {
  # Generate a strong random password and pass it as a DM property
  local db_password
  db_password="$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)"
  log "Deploying Cloud SQL with generated DB password..."
  dm_deploy "ccc-cloudsql" "${TEMPLATE_DIR}/02-cloudsql-management.yaml" \
    --properties "dbPassword:${db_password}"
  local connection_name
  connection_name=$(dm_output "ccc-cloudsql" connectionName)
  log "Cloud SQL connection name: ${connection_name}"
}

deploy_pubsub() {
  # ── Preflight: verify the destination GCS bucket (created by stack 04) exists.
  # The Dataflow streaming job in 03-pubsub-dataflow.yaml writes to the raw-events
  # bucket provisioned by 04-gcs-bigquery.yaml.  Deploying stack 03 before stack 04
  # would succeed at the DM level but cause Dataflow job failures at runtime.
  # This guard fails fast for selective deployments, preventing silent runtime errors.
  local raw_bucket="ccc-raw-events-${GCP_PROJECT_ID}"
  if ! gcloud storage buckets describe "gs://${raw_bucket}" --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "ERROR: Destination bucket gs://${raw_bucket} not found."
    log "       Stack 04 (04-gcs-bigquery.yaml / ccc-datalake) must be deployed first."
    log "       Run: $0 datalake    — or —    $0 all"
    exit 1
  fi
  log "Preflight OK: gs://${raw_bucket} exists"
  dm_deploy "ccc-pubsub" "${TEMPLATE_DIR}/03-pubsub-dataflow.yaml"
  log "Pub/Sub topics and subscriptions created"
}

deploy_datalake() {
  dm_deploy "ccc-datalake" "${TEMPLATE_DIR}/04-gcs-bigquery.yaml"
  log "GCS buckets and BigQuery dataset created"
}

deploy_dataflow() {
  # Launch the Pub/Sub -> GCS Parquet Flex Template streaming job (idempotent).
  # Must run AFTER deploy_datalake so the destination bucket exists, and AFTER
  # deploy_pubsub so the Dataflow service account and Pub/Sub topic exist.
  #
  # Idempotency: Dataflow jobs are not idempotent by job name — each run creates
  # a NEW job with a unique ID.  We skip the launch if an active job already
  # exists (state: JOB_STATE_RUNNING or JOB_STATE_DRAINING) for this environment.
  local raw_bucket="ccc-raw-events-${GCP_PROJECT_ID}"
  local job_name="ccc-pubsub-to-parquet-${ENVIRONMENT}"

  log "Checking for existing Dataflow streaming job '${job_name}' …"
  local existing_job
  existing_job=$(gcloud dataflow jobs list \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --filter="name=${job_name} AND (state=JOB_STATE_RUNNING OR state=JOB_STATE_DRAINING)" \
    --format="value(id)" 2>/dev/null | head -1)

  if [[ -n "${existing_job}" ]]; then
    log "Dataflow job '${job_name}' is already running (ID: ${existing_job}). Skipping launch."
    return 0
  fi

  log "Launching Dataflow Flex Template job '${job_name}' (Pub/Sub -> ${raw_bucket})…"
  gcloud dataflow flex-template run "${job_name}" \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --template-file-gcs-location="gs://dataflow-templates-${GCP_REGION}/latest/flex/PubSub_to_Parquet" \
    --service-account-email="ccc-dataflow-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --network="ccc-vpc" \
    --subnetwork="regions/${GCP_REGION}/subnetworks/ccc-private-subnet-${GCP_REGION}" \
    --disable-public-ips \
    --max-workers=20 \
    --num-workers=2 \
    --worker-machine-type="n2-standard-4" \
    --enable-streaming-engine \
    --parameters "inputTopic=projects/${GCP_PROJECT_ID}/topics/ccc-raw-events,\
outputDirectory=gs://${raw_bucket}/security-events/,\
outputFilenamePrefix=events-,\
outputFilenameSuffix=.parquet,\
numShards=10,\
windowDuration=5m"
  log "Dataflow streaming job launched"
}

deploy_cloud_run() {
  local management_image="${CONTAINER_REGISTRY}/ccc-management-plane:${IMAGE_TAG}"
  local data_plane_image="${CONTAINER_REGISTRY}/ccc-data-plane:${IMAGE_TAG}"

  log "Deploying management plane Cloud Run service..."
  gcloud run deploy "ccc-management-plane-${ENVIRONMENT}" \
    --image="${management_image}" \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --platform=managed \
    --no-allow-unauthenticated \
    --min-instances=2 \
    --max-instances=20 \
    --cpu=2 \
    --memory=2Gi \
    --concurrency=80 \
    --timeout=300 \
    --set-env-vars="NODE_ENV=production,PORT=5000,PLANE=management,SECURE_COOKIES=true,GCP_PROJECT_ID=${GCP_PROJECT_ID}" \
    --set-secrets="\
DATABASE_URL=ccc-postgres-connection-string:latest,\
SESSION_SECRET=ccc-session-secret:latest,\
AI_API_KEY=ccc-ai-api-key:latest,\
GCS_RAW_BUCKET=ccc-gcs-raw-bucket:latest,\
GCS_PROCESSED_BUCKET=ccc-gcs-processed-bucket:latest" \
    --vpc-connector="ccc-vpc-connector-us-central1" \
    --vpc-egress=all-traffic \
    --service-account="ccc-management-plane@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --no-traffic

  log "Management plane URL: $(gcloud run services describe ccc-management-plane-${ENVIRONMENT} \
    --project=${GCP_PROJECT_ID} --region=${GCP_REGION} --format='value(status.url)')"

  log "Deploying data plane Cloud Run services (${#DATA_PLANE_REGIONS[@]} regions)..."
  for dp_region in "${DATA_PLANE_REGIONS[@]}"; do
    log "  Deploying data plane [${dp_region}]..."
    gcloud run deploy "ccc-data-plane-${dp_region}-${ENVIRONMENT}" \
      --image="${data_plane_image}" \
      --project="${GCP_PROJECT_ID}" \
      --region="${GCP_REGION}" \
      --platform=managed \
      --no-allow-unauthenticated \
      --min-instances=2 \
      --max-instances=30 \
      --cpu=2 \
      --memory=4Gi \
      --concurrency=40 \
      --timeout=300 \
      --set-env-vars="\
NODE_ENV=production,\
PORT=5000,\
PLANE=data,\
DATA_PLANE_REGION=${dp_region},\
GCP_PROJECT_ID=${GCP_PROJECT_ID}" \
      --set-secrets="\
DATABASE_URL=ccc-postgres-connection-string:latest,\
AI_API_KEY=ccc-ai-api-key:latest,\
GCS_RAW_BUCKET=ccc-gcs-raw-bucket:latest,\
GCS_PROCESSED_BUCKET=ccc-gcs-processed-bucket:latest,\
PUBSUB_PROJECT=ccc-pubsub-project:latest" \
      --vpc-connector="ccc-vpc-connector-us-central1" \
      --vpc-egress=all-traffic \
      --service-account="ccc-data-plane@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
      --no-traffic
  done
}

case "${DEPLOY_STACK}" in
  vpc)       deploy_vpc ;;
  cloudsql)  deploy_cloudsql ;;
  pubsub)    deploy_pubsub ;;
  datalake)  deploy_datalake ;;
  dataflow)  deploy_dataflow ;;
  cloud-run) deploy_cloud_run ;;
  all)
    log "============================================================"
    log "  Cyber Command Center -- GCP Full Data Lake Deploy"
    log "  Project:    ${GCP_PROJECT_ID}"
    log "  Region:     ${GCP_REGION}"
    log "  Image tag:  ${IMAGE_TAG}"
    log "============================================================"
    log ""
    log "=== Step 0: Enable APIs ==="
    enable_apis
    log ""
    log "=== Step 1/6: VPC Network (+ VPC Access Connector) ==="
    deploy_vpc
    log ""
    log "=== Step 2/6: Cloud SQL PostgreSQL (Management OLTP) ==="
    deploy_cloudsql
    log ""
    log "=== Step 3/6: GCS + BigQuery Data Lake ==="
    # Deploy data lake BEFORE Pub/Sub because the Dataflow Flex Template job
    # in 03-pubsub-dataflow.yaml writes to ccc-raw-events-<PROJECT_ID> GCS bucket.
    # That bucket must exist before Deployment Manager tries to launch the job.
    deploy_datalake
    log ""
    log "=== Step 4/5: Pub/Sub Topics, Subscriptions + Dataflow Flex Template ==="
    # Deployment Manager 03-pubsub-dataflow.yaml manages the Dataflow job
    # (ccc-pubsub-to-parquet) as a declarative resource. No separate CLI launch
    # is performed here to avoid name-suffix mismatch (CLI uses env-suffix;
    # DM uses a fixed name) which would create a duplicate streaming job.
    # To manually re-launch the job: ./deploy-all.sh --stack dataflow
    deploy_pubsub
    log ""
    log "=== Step 5/5: Cloud Run Services ==="
    deploy_cloud_run
    log ""
    log "============================================================"
    log "  GCP deployment complete!"
    log "============================================================"
    ;;
  *)
    echo "Unknown stack: ${DEPLOY_STACK}"
    echo "Valid values: vpc | cloudsql | pubsub | datalake | dataflow | cloud-run | all"
    exit 1
    ;;
esac
