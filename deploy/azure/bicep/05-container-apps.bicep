// ============================================================================
// Cyber Command Center -- Azure Container Apps (Management + Data Planes)
//
// Azure equivalent of ECS Fargate. Container Apps Environment provides:
//   - Management plane (main CCC app + ALB equivalent via Ingress)
//   - Data plane (per-region event processing, no public ingress)
//   - KEDA scaling (CPU + Event Hubs consumer lag)
//   - Dapr sidecar optional (for distributed tracing)
//   - VNet integration with private subnet
//   - Azure Application Gateway for external HTTPS
//
// Depends on:
//   - 01-vnet.bicep  (privateSubnetId)
//   - 02-postgresql-management.bicep (connection string via Key Vault)
//   - 03-event-hubs.bicep (kafka brokers via Key Vault)
//   - 04-adls-synapse.bicep (ADLS endpoint via Key Vault)
//
// Deploy:
//   az deployment group create \
//     --resource-group ccc-management-rg \
//     --template-file deploy/azure/bicep/05-container-apps.bicep \
//     --parameters \
//       environmentName=production \
//       managementImageTag=latest \
//       dataPlaneImageTag=latest
// ============================================================================

@description('Environment name')
@allowed(['production', 'staging', 'development'])
param environmentName string = 'production'

param location string = resourceGroup().location

@description('Container registry server (e.g., cccregistry.azurecr.io)')
param containerRegistryServer string

@description('Management plane container image tag')
param managementImageTag string = 'latest'

@description('Data plane container image tag')
param dataPlaneImageTag string = 'latest'

@description('Private subnet ID for Container Apps environment')
param privateSubnetId string

@description('Key Vault name for reading secrets')
param keyVaultName string = 'ccc-kv-${environmentName}'

@description('Log Analytics workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Log Analytics workspace customer ID')
param logAnalyticsWorkspaceCustomerId string

@description('Log Analytics workspace shared key')
@secure()
param logAnalyticsWorkspaceSharedKey string

@description('Data plane logical region identifier')
@allowed(['in-west-1', 'us-east-1', 'ke-east-1', 'sa-central-1', 'bh-east-1'])
param dataPlaneRegion string = 'in-west-1'

var projectTag = 'CyberCommandCenter'
var environmentSuffix = '${environmentName}'
var registryServer = containerRegistryServer
var managementImage = '${registryServer}/ccc-management-plane:${managementImageTag}'
var dataPlaneImage = '${registryServer}/ccc-data-plane:${dataPlaneImageTag}'

// ── Key Vault Reference ───────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// ── Managed Identity for Container Apps ──────────────────────────────────────
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'ccc-container-apps-identity-${environmentSuffix}'
  location: location
  tags: { Project: projectTag }
}

// ── ACR Pull Role Assignment (managed identity -> container registry) ─────────
// AcrPull role ID: 7f951dda-4ed3-4680-a7ca-43fe172d538d
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: replace(replace(containerRegistryServer, '.azurecr.io', ''), '.', '')
  scope: resourceGroup()
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: containerRegistry
  name: guid(containerRegistry.id, managedIdentity.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Key Vault Access Policy for Managed Identity ──────────────────────────────
resource kvAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: managedIdentity.properties.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}

@description('Custom domain name for the management plane (optional, e.g. app.cybercommandcenter.io)')
param customDomainName string = ''

@description('Set to false when deploying data-plane-only iterations to avoid re-deploying shared management-plane resources in the regional loop.')
param deployManagementPlane bool = true

// ── Container Apps Environment ────────────────────────────────────────────────
resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-11-02-preview' = {
  name: 'ccc-apps-env-${environmentSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspaceCustomerId
        sharedKey: logAnalyticsWorkspaceSharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: privateSubnetId
      internal: false
    }
    zoneRedundant: true
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
      {
        name: 'D4'
        workloadProfileType: 'D4'
        minimumCount: 1
        maximumCount: 20
      }
    ]
  }
}

// ── Managed Certificate (auto-renewed TLS for custom domain) ─────────────────
resource managedCert 'Microsoft.App/managedEnvironments/managedCertificates@2023-11-02-preview' = if (!empty(customDomainName) && deployManagementPlane) {
  parent: containerAppsEnvironment
  name: 'ccc-managed-cert-${environmentSuffix}'
  location: location
  tags: { Project: projectTag }
  properties: {
    domainControlValidation: 'HTTP'
    subjectName: customDomainName
  }
}

// ── Management Plane Container App ────────────────────────────────────────────
// deployManagementPlane=false when script iterates over data-plane regions after
// the initial management + first-region deployment, avoiding repeated updates to
// the same management-plane resource from within the regional loop.
resource managementPlaneApp 'Microsoft.App/containerApps@2023-11-02-preview' = if (deployManagementPlane) {
  name: 'ccc-management-plane-${environmentSuffix}'
  location: location
  tags: { Project: projectTag, Plane: 'management' }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${managedIdentity.id}': {} }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    workloadProfileName: 'D4'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 5000
        transport: 'http2'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: registryServer
          identity: managedIdentity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-postgres-connection-string'
          identity: managedIdentity.id
        }
        {
          name: 'kafka-brokers'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-kafka-brokers'
          identity: managedIdentity.id
        }
        {
          name: 'session-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-session-secret'
          identity: managedIdentity.id
        }
        {
          name: 'ai-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-ai-api-key'
          identity: managedIdentity.id
        }
        {
          name: 'adls-connection'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-adls-connection-string'
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'management-plane'
          image: managementImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '5000' }
            { name: 'PLANE', value: 'management' }
            { name: 'SECURE_COOKIES', value: 'true' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'KAFKA_BROKERS', secretRef: 'kafka-brokers' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'AI_API_KEY', secretRef: 'ai-api-key' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'adls-connection' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 5000
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 5000
              }
              initialDelaySeconds: 15
              periodSeconds: 10
              failureThreshold: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 20
        rules: [
          {
            name: 'cpu-scaling'
            custom: {
              type: 'cpu'
              metadata: { type: 'Utilization', value: '70' }
            }
          }
          {
            name: 'memory-scaling'
            custom: {
              type: 'memory'
              metadata: { type: 'Utilization', value: '70' }
            }
          }
        ]
      }
    }
  }
}

// ── Data Plane Container App (no public ingress) ──────────────────────────────
resource dataPlaneApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: 'ccc-data-plane-${dataPlaneRegion}-${environmentSuffix}'
  location: location
  tags: { Project: projectTag, Plane: 'data', DataPlaneRegion: dataPlaneRegion }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${managedIdentity.id}': {} }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    workloadProfileName: 'D4'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 5000
        transport: 'http'
      }
      registries: [
        {
          server: registryServer
          identity: managedIdentity.id
        }
      ]
      secrets: [
        {
          name: 'kafka-brokers'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-kafka-brokers'
          identity: managedIdentity.id
        }
        {
          name: 'eventhubs-connection'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-eventhubs-connection-string'
          identity: managedIdentity.id
        }
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-postgres-connection-string'
          identity: managedIdentity.id
        }
        {
          name: 'adls-connection'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-adls-connection-string'
          identity: managedIdentity.id
        }
        {
          name: 'adls-dfs-endpoint'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-adls-dfs-endpoint'
          identity: managedIdentity.id
        }
        {
          name: 'ai-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/ccc-ai-api-key'
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'data-plane'
          image: dataPlaneImage
          resources: {
            cpu: json('2.0')
            memory: '4Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '5000' }
            { name: 'PLANE', value: 'data' }
            { name: 'DATA_PLANE_REGION', value: dataPlaneRegion }
            { name: 'KAFKA_BROKERS', secretRef: 'kafka-brokers' }
            { name: 'EVENTHUBS_CONNECTION_STRING', secretRef: 'eventhubs-connection' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'adls-connection' }
            { name: 'ADLS_DFS_ENDPOINT', secretRef: 'adls-dfs-endpoint' }
            { name: 'AI_API_KEY', secretRef: 'ai-api-key' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 5000 }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 30
        rules: [
          {
            name: 'cpu-scaling'
            custom: {
              type: 'cpu'
              metadata: { type: 'Utilization', value: '65' }
            }
          }
          {
            name: 'eventhubs-keda'
            custom: {
              type: 'azure-eventhub'
              metadata: {
                consumerGroup: 'ccc-data-plane'
                unprocessedEventThreshold: '100'
                activationUnprocessedEventThreshold: '10'
              }
              auth: [
                {
                  secretRef: 'eventhubs-connection'
                  triggerParameter: 'connection'
                }
              ]
            }
          }
        ]
      }
    }
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output environmentId string = containerAppsEnvironment.id
// managementAppFqdn is empty string when deployManagementPlane=false (data-plane-only runs)
output managementAppFqdn string = deployManagementPlane ? managementPlaneApp.properties.configuration.ingress.fqdn : ''
output dataPlaneAppFqdn string = dataPlaneApp.properties.configuration.ingress.fqdn
output managedIdentityClientId string = managedIdentity.properties.clientId
