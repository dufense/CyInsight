// ============================================================================
// Cyber Command Center -- Azure Event Hubs (Kafka-compatible Streaming)
//
// Replaces Amazon MSK in the Azure deployment. Event Hubs provides a
// Kafka-compatible endpoint so the same CCC consumer/producer code works
// unchanged across AWS (MSK) and Azure (Event Hubs).
//
// Creates:
//   - Event Hubs Namespace (Premium tier for Kafka + Private Endpoint)
//   - Event Hubs:
//       ccc-raw-events    (landing from receivers)
//       ccc-enriched      (post-AI normalization)
//       ccc-alerts        (alert engine output)
//       ccc-dead-letter   (parse failures for manual review)
//   - Private Endpoint + DNS A-record for VNet-only access
//   - Key Vault secret for Kafka-compat connection string
//   - Azure Monitor alerts (throttle, consumer lag)
//
// Depends on: 01-vnet.bicep (privateSubnetId, eventHubPrivateDnsZoneId)
//
// Deploy:
//   az deployment group create \
//     --resource-group ccc-management-rg \
//     --template-file deploy/azure/bicep/03-event-hubs.bicep \
//     --parameters environmentName=production
// ============================================================================

@description('Environment name')
@allowed(['production', 'staging', 'development'])
param environmentName string = 'production'

param location string = resourceGroup().location

@description('Private subnet ID for Event Hubs private endpoint')
param privateSubnetId string

@description('Private DNS Zone ID for servicebus.windows.net')
param eventHubPrivateDnsZoneId string

@description('Message retention in days per Event Hub')
@minValue(1)
@maxValue(90)
param messageRetentionDays int = 3

@description('Partition count per Event Hub (higher = more parallelism)')
@minValue(4)
@maxValue(32)
param partitionCount int = 12

var projectTag = 'CyberCommandCenter'
var namespaceName = 'ccc-eventhubs-${environmentName}'

// ── Event Hubs Namespace ──────────────────────────────────────────────────────
resource eventHubNamespace 'Microsoft.EventHub/namespaces@2023-01-01-preview' = {
  name: namespaceName
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  sku: {
    name: 'Premium'
    tier: 'Premium'
    capacity: 2
  }
  properties: {
    isAutoInflateEnabled: true
    maximumThroughputUnits: 20
    kafkaEnabled: true
    publicNetworkAccess: 'Disabled'
    minimumTlsVersion: '1.2'
    zoneRedundant: true
  }
}

// ── Event Hubs ────────────────────────────────────────────────────────────────
resource ehRawEvents 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ccc-raw-events'
  properties: {
    messageRetentionInDays: messageRetentionDays
    partitionCount: partitionCount
    captureDescription: {
      enabled: true
      encoding: 'Avro'
      intervalInSeconds: 300
      sizeLimitInBytes: 10485760
      skipEmptyArchives: true
      destination: {
        name: 'EventHubArchive.AzureBlockBlob'
        properties: {
          storageAccountResourceId: storageAccount.id
          blobContainer: 'eventhub-capture'
          archiveNameFormat: '{Namespace}/{EventHub}/{PartitionId}/{Year}/{Month}/{Day}/{Hour}/{Minute}/{Second}'
        }
      }
    }
  }
}

resource ehEnriched 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ccc-enriched'
  properties: {
    messageRetentionInDays: messageRetentionDays
    partitionCount: partitionCount
  }
}

resource ehAlerts 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ccc-alerts'
  properties: {
    messageRetentionInDays: messageRetentionDays
    partitionCount: 4
  }
}

resource ehDeadLetter 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ccc-dead-letter'
  properties: {
    messageRetentionInDays: 7
    partitionCount: 4
  }
}

// ── Consumer Groups ───────────────────────────────────────────────────────────
resource cgDataPlane 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: ehRawEvents
  name: 'ccc-data-plane'
}

resource cgEnrichment 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: ehRawEvents
  name: 'ccc-enrichment-pipeline'
}

resource cgSigma 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: ehEnriched
  name: 'ccc-sigma-engine'
}

// ── Authorization Rule (Kafka-compat SAS) ─────────────────────────────────────
resource authRule 'Microsoft.EventHub/namespaces/authorizationRules@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'ccc-data-plane-sender'
  properties: {
    rights: ['Send', 'Listen', 'Manage']
  }
}

// ── Capture Storage Account ────────────────────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'ccccapture${replace(environmentName, '-', '')}${substring(uniqueString(resourceGroup().id), 0, 6)}'
  location: location
  tags: { Project: projectTag }
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource captureContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/eventhub-capture'
  properties: {
    publicAccess: 'None'
  }
}

// ── Private Endpoint ──────────────────────────────────────────────────────────
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'ccc-eventhubs-pe-${environmentName}'
  location: location
  tags: { Project: projectTag }
  properties: {
    subnet: { id: privateSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'ccc-eventhubs-plsc'
        properties: {
          privateLinkServiceId: eventHubNamespace.id
          groupIds: ['namespace']
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: privateEndpoint
  name: 'ccc-eventhubs-dnsgroup'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: { privateDnsZoneId: eventHubPrivateDnsZoneId }
      }
    ]
  }
}

// ── Key Vault Secret ─────────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: 'ccc-kv-${environmentName}'
}

resource kafkaBrokersSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ccc-kafka-brokers'
  properties: {
    value: '${namespaceName}.servicebus.windows.net:9093'
  }
}

resource kafkaConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ccc-eventhubs-connection-string'
  properties: {
    value: authRule.listKeys().primaryConnectionString
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output namespaceName string = eventHubNamespace.name
output kafkaBootstrapServers string = '${namespaceName}.servicebus.windows.net:9093'
output rawEventsHubName string = ehRawEvents.name
output enrichedHubName string = ehEnriched.name
output connectionStringSecretUri string = kafkaConnectionStringSecret.properties.secretUri
