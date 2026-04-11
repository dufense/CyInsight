#!/usr/bin/env bash
##############################################################################
# Cyber Command Center -- Azure Bicep Full Deploy Script
#
# Deploys all 5 Bicep stacks in dependency order:
#   01. ccc-vnet               -- VNet + NSGs + NAT Gateway + Private DNS Zones
#   02. ccc-postgresql         -- PostgreSQL Flexible Server (management OLTP)
#   03. ccc-event-hubs         -- Event Hubs Namespace (Kafka-compat streaming)
#   04. ccc-adls-synapse       -- ADLS Gen2 + Synapse Analytics (data lake)
#   05. ccc-container-apps     -- Container Apps (management + data planes)
#
# Usage:
#   export AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   export AZURE_RESOURCE_GROUP=ccc-management-rg
#   export AZURE_LOCATION=eastus
#   export CONTAINER_REGISTRY=cccregistry.azurecr.io
#   export IMAGE_TAG=v2.0.0
#   export DB_PASSWORD=$(openssl rand -base64 24)
#   export SQL_ADMIN_PASSWORD=$(openssl rand -base64 24)
#
#   chmod +x deploy/azure/scripts/deploy-all.sh
#   ./deploy/azure/scripts/deploy-all.sh
#
# Selective deploy:
#   ./deploy/azure/scripts/deploy-all.sh --stack vnet
#   ./deploy/azure/scripts/deploy-all.sh --stack postgresql
#   ./deploy/azure/scripts/deploy-all.sh --stack eventhubs
#   ./deploy/azure/scripts/deploy-all.sh --stack datalake
#   ./deploy/azure/scripts/deploy-all.sh --stack apps
##############################################################################

set -euo pipefail

# ── Always-required environment variables ────────────────────────────────────
AZURE_SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID}"
AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"
AZURE_LOCATION="${AZURE_LOCATION:-eastus}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOY_STACK="${DEPLOY_STACK:-all}"

# Stack-specific vars: evaluated lazily so --stack vnet etc. don't require all.
# require_vars() validates them for stacks that need them.
CONTAINER_REGISTRY="${CONTAINER_REGISTRY:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
SQL_ADMIN_PASSWORD="${SQL_ADMIN_PASSWORD:-}"
TEMPLATE_DIR="deploy/azure/bicep"
DATA_PLANE_REGIONS=(in-west-1 us-east-1 ke-east-1 sa-central-1 bh-east-1)

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --stack) DEPLOY_STACK="$2"; shift 2 ;;
    --env)   ENVIRONMENT="$2"; shift 2 ;;
    --tag)   IMAGE_TAG="$2"; shift 2 ;;
    -h|--help)
      grep "^#" "$0" | sed 's/^# //' | head -30
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

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

bicep_deploy() {
  local deployment_name="$1"
  local template="$2"
  shift 2
  local params=("$@")

  log "Deploying: ${deployment_name}"
  az deployment group create \
    --subscription "${AZURE_SUBSCRIPTION_ID}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${deployment_name}" \
    --template-file "${template}" \
    --parameters "${params[@]}"

  log "Deployed: ${deployment_name}"
}

bicep_output() {
  local deployment_name="$1"
  local output_key="$2"
  az deployment group show \
    --subscription "${AZURE_SUBSCRIPTION_ID}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${deployment_name}" \
    --query "properties.outputs.${output_key}.value" \
    --output tsv
}

ensure_rg() {
  if ! az group show --name "${AZURE_RESOURCE_GROUP}" &>/dev/null; then
    log "Creating resource group: ${AZURE_RESOURCE_GROUP}"
    az group create \
      --subscription "${AZURE_SUBSCRIPTION_ID}" \
      --name "${AZURE_RESOURCE_GROUP}" \
      --location "${AZURE_LOCATION}"
  fi
}

# ── Stack functions ──────────────────────────────────────────────────────────
deploy_vnet() {
  bicep_deploy "ccc-vnet-${ENVIRONMENT}" \
    "${TEMPLATE_DIR}/01-vnet.bicep" \
    "environmentName=${ENVIRONMENT}" \
    "location=${AZURE_LOCATION}"
  log "VNet ID: $(bicep_output ccc-vnet-${ENVIRONMENT} vnetId)"
}

deploy_postgresql() {
  require_vars DB_PASSWORD
  local isolated_subnet_id
  isolated_subnet_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" isolatedSubnetId)
  local postgres_dns_zone_id
  postgres_dns_zone_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" postgresPrivateDnsZoneId)

  bicep_deploy "ccc-postgresql-${ENVIRONMENT}" \
    "${TEMPLATE_DIR}/02-postgresql-management.bicep" \
    "environmentName=${ENVIRONMENT}" \
    "location=${AZURE_LOCATION}" \
    "isolatedSubnetId=${isolated_subnet_id}" \
    "postgresPrivateDnsZoneId=${postgres_dns_zone_id}" \
    "administratorLoginPassword=${DB_PASSWORD}"

  log "PostgreSQL FQDN: $(bicep_output ccc-postgresql-${ENVIRONMENT} serverFqdn)"
}

deploy_eventhubs() {
  local private_subnet_id
  private_subnet_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" privateSubnetId)
  local eventhub_dns_zone_id
  eventhub_dns_zone_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" eventHubPrivateDnsZoneId)

  bicep_deploy "ccc-eventhubs-${ENVIRONMENT}" \
    "${TEMPLATE_DIR}/03-event-hubs.bicep" \
    "environmentName=${ENVIRONMENT}" \
    "location=${AZURE_LOCATION}" \
    "privateSubnetId=${private_subnet_id}" \
    "eventHubPrivateDnsZoneId=${eventhub_dns_zone_id}"

  log "Kafka Bootstrap: $(bicep_output ccc-eventhubs-${ENVIRONMENT} kafkaBootstrapServers)"
}

deploy_datalake() {
  require_vars SQL_ADMIN_PASSWORD
  local private_subnet_id
  private_subnet_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" privateSubnetId)
  local adls_dns_zone_id
  adls_dns_zone_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" adlsPrivateDnsZoneId)

  bicep_deploy "ccc-adls-synapse-${ENVIRONMENT}" \
    "${TEMPLATE_DIR}/04-adls-synapse.bicep" \
    "environmentName=${ENVIRONMENT}" \
    "location=${AZURE_LOCATION}" \
    "privateSubnetId=${private_subnet_id}" \
    "adlsPrivateDnsZoneId=${adls_dns_zone_id}" \
    "sqlAdminPassword=${SQL_ADMIN_PASSWORD}"

  local synapse_ws adls_account
  synapse_ws=$(bicep_output "ccc-adls-synapse-${ENVIRONMENT}" synapseWorkspaceName)
  adls_account=$(bicep_output "ccc-adls-synapse-${ENVIRONMENT}" adlsAccountName)
  log "ADLS account: ${adls_account}"
  log "Synapse workspace: ${synapse_ws}"

  # ── Execute Synapse Serverless SQL Scripts (Delta Lake external tables) ───────
  # The Synapse Serverless ("Built-in") SQL pool is reached via the on-demand
  # endpoint using sqlcmd with SQL authentication.  The az CLI has no command
  # to execute ad-hoc SQL against Synapse; sqlcmd is the standard mechanism
  # used in Azure DevOps pipelines and documented deployment guides.
  #
  # Requires:  sqlcmd (Microsoft ODBC-based client, available via mssql-tools)
  #   Ubuntu:  sudo apt-get install -y mssql-tools
  #   macOS:   brew install mssql-tools
  #   Linux:   https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-setup-tools
  local sql_login="${SQL_ADMIN_LOGIN:-ccc_synapse_admin}"
  local synapse_ondemand_host="${synapse_ws}-ondemand.sql.azuresynapse.net"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if ! command -v sqlcmd &>/dev/null; then
    log "ERROR: sqlcmd not found. Install mssql-tools and re-run --stack datalake."
    log "       Ubuntu: sudo apt-get install -y mssql-tools"
    exit 1
  fi

  log "Executing SQL script 01 (external data source) on ${synapse_ondemand_host} …"
  sqlcmd \
    -S "${synapse_ondemand_host},1433" \
    -U "${sql_login}" \
    -P "${SQL_ADMIN_PASSWORD}" \
    -d "master" \
    -v ADLS_ACCOUNT="${adls_account}" SQL_ADMIN_PASSWORD="${SQL_ADMIN_PASSWORD}" \
    -i "${script_dir}/01-synapse-external-tables.sql" \
    -b  # abort on first error

  log "Executing SQL script 02 (security_events external table) on ${synapse_ondemand_host} …"
  sqlcmd \
    -S "${synapse_ondemand_host},1433" \
    -U "${sql_login}" \
    -P "${SQL_ADMIN_PASSWORD}" \
    -d "ccc_datalake" \
    -i "${script_dir}/02-synapse-security-events.sql" \
    -b

  log "Synapse Delta Lake external table provisioning complete."
}

deploy_apps() {
  require_vars CONTAINER_REGISTRY

  # ── Preflight: verify shared prerequisites exist before deploying Container Apps.
  # Key Vault (ccc-kv-<env>) is deployed by stack 03 (key-vault.bicep).
  # Log Analytics workspace (ccc-log-analytics-<env>) is deployed by stack 02
  # (monitor.bicep).  Both are shared across all region deployments.
  local kv_name="ccc-kv-${ENVIRONMENT}"
  local law_name="ccc-log-analytics-${ENVIRONMENT}"

  if ! az keyvault show --name "${kv_name}" --resource-group "${AZURE_RESOURCE_GROUP}" &>/dev/null; then
    log "ERROR: Key Vault '${kv_name}' not found in resource group '${AZURE_RESOURCE_GROUP}'."
    log "       Stack 03 (key-vault.bicep) must be deployed first."
    log "       Run: $0 keyvault    — or —    $0 all"
    exit 1
  fi
  log "Preflight OK: Key Vault '${kv_name}' exists"

  if ! az monitor log-analytics workspace show \
       --resource-group "${AZURE_RESOURCE_GROUP}" \
       --workspace-name "${law_name}" &>/dev/null; then
    log "ERROR: Log Analytics workspace '${law_name}' not found."
    log "       Stack 02 (monitor.bicep) must be deployed first."
    log "       Run: $0 monitor    — or —    $0 all"
    exit 1
  fi
  log "Preflight OK: Log Analytics workspace '${law_name}' exists"

  local private_subnet_id
  private_subnet_id=$(bicep_output "ccc-vnet-${ENVIRONMENT}" privateSubnetId)

  local log_workspace_id log_customer_id log_key
  log_workspace_id=$(az monitor log-analytics workspace show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --workspace-name "ccc-log-analytics-${ENVIRONMENT}" \
    --query id -o tsv)
  log_customer_id=$(az monitor log-analytics workspace show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --workspace-name "ccc-log-analytics-${ENVIRONMENT}" \
    --query customerId -o tsv)
  log_key=$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --workspace-name "ccc-log-analytics-${ENVIRONMENT}" \
    --query primarySharedKey -o tsv)

  # ── Management plane + first data-plane region (deployManagementPlane=true) ──
  # Deploy management-plane Container App once, paired with the first data-plane
  # region (in-west-1) in a single ARM deployment.  Subsequent iterations only
  # deploy the data-plane app (deployManagementPlane=false) to avoid repeated
  # ARM updates to the shared management-plane resource and potential conflicts.
  local primary_region="${DATA_PLANE_REGIONS[0]}"
  log "Deploying management plane + data plane [${primary_region}] …"
  bicep_deploy "ccc-apps-${primary_region}-${ENVIRONMENT}" \
    "${TEMPLATE_DIR}/05-container-apps.bicep" \
    "environmentName=${ENVIRONMENT}" \
    "location=${AZURE_LOCATION}" \
    "containerRegistryServer=${CONTAINER_REGISTRY}" \
    "managementImageTag=${IMAGE_TAG}" \
    "dataPlaneImageTag=${IMAGE_TAG}" \
    "privateSubnetId=${private_subnet_id}" \
    "keyVaultName=ccc-kv-${ENVIRONMENT}" \
    "logAnalyticsWorkspaceId=${log_workspace_id}" \
    "logAnalyticsWorkspaceCustomerId=${log_customer_id}" \
    "logAnalyticsWorkspaceSharedKey=${log_key}" \
    "dataPlaneRegion=${primary_region}" \
    "deployManagementPlane=true"

  log "Management FQDN: $(bicep_output "ccc-apps-${primary_region}-${ENVIRONMENT}" managementAppFqdn)"

  # ── Remaining data-plane regions (deployManagementPlane=false) ────────────
  for i in "${!DATA_PLANE_REGIONS[@]}"; do
    [[ $i -eq 0 ]] && continue  # primary region already deployed above
    local region="${DATA_PLANE_REGIONS[$i]}"
    log "Deploying data plane [${region}] (management plane skipped) …"
    bicep_deploy "ccc-apps-${region}-${ENVIRONMENT}" \
      "${TEMPLATE_DIR}/05-container-apps.bicep" \
      "environmentName=${ENVIRONMENT}" \
      "location=${AZURE_LOCATION}" \
      "containerRegistryServer=${CONTAINER_REGISTRY}" \
      "managementImageTag=${IMAGE_TAG}" \
      "dataPlaneImageTag=${IMAGE_TAG}" \
      "privateSubnetId=${private_subnet_id}" \
      "keyVaultName=ccc-kv-${ENVIRONMENT}" \
      "logAnalyticsWorkspaceId=${log_workspace_id}" \
      "logAnalyticsWorkspaceCustomerId=${log_customer_id}" \
      "logAnalyticsWorkspaceSharedKey=${log_key}" \
      "dataPlaneRegion=${region}" \
      "deployManagementPlane=false"

    log "Data plane [${region}] FQDN: $(bicep_output "ccc-apps-${region}-${ENVIRONMENT}" dataPlaneAppFqdn)"
  done
}

# ── Main dispatch ────────────────────────────────────────────────────────────
ensure_rg

case "${DEPLOY_STACK}" in
  vnet)       deploy_vnet ;;
  postgresql) deploy_postgresql ;;
  eventhubs)  deploy_eventhubs ;;
  datalake)   deploy_datalake ;;
  apps)       deploy_apps ;;
  all)
    log "============================================================"
    log "  Cyber Command Center -- Azure Full Data Lake Deploy"
    log "  Environment: ${ENVIRONMENT}"
    log "  Location:    ${AZURE_LOCATION}"
    log "  Image tag:   ${IMAGE_TAG}"
    log "============================================================"
    log ""
    log "=== Step 1/5: VNet + Networking ==="
    deploy_vnet
    log ""
    log "=== Step 2/5: PostgreSQL (Management OLTP) ==="
    deploy_postgresql
    log ""
    log "=== Step 3/5: Event Hubs (Kafka-compat Streaming) ==="
    deploy_eventhubs
    log ""
    log "=== Step 4/5: ADLS Gen2 + Synapse (Data Lake) ==="
    deploy_datalake
    log ""
    log "=== Step 5/5: Container Apps (Management + Data Planes) ==="
    deploy_apps
    log ""
    log "============================================================"
    log "  Azure deployment complete!"
    log "============================================================"
    ;;
  *)
    echo "Unknown stack: ${DEPLOY_STACK}"
    echo "Valid values: vnet | postgresql | eventhubs | datalake | apps | all"
    exit 1
    ;;
esac
