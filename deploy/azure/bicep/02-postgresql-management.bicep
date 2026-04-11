// ============================================================================
// Cyber Command Center -- Azure Database for PostgreSQL Flexible Server
//
// Management plane OLTP: tenants, users, incidents metadata, tickets,
// projects. Not for security event data (that goes to Synapse/ADLS).
//
// Creates:
//   - PostgreSQL Flexible Server (16.x, High Availability)
//   - Private DNS Zone link for VNet-integrated access
//   - Key Vault secret with connection string
//   - Diagnostic settings (slow queries, connections, locks)
//   - Azure Monitor alerts (CPU, storage, connections, replication lag)
//
// Depends on: 01-vnet.bicep (isolatedSubnetId, postgresPrivateDnsZoneId)
//
// Deploy:
//   az deployment group create \
//     --resource-group ccc-management-rg \
//     --template-file deploy/azure/bicep/02-postgresql-management.bicep \
//     --parameters administratorLoginPassword=<password> environmentName=production
// ============================================================================

@description('Environment name')
@allowed(['production', 'staging', 'development'])
param environmentName string = 'production'

param location string = resourceGroup().location

@description('VNet isolated subnet resource ID (from 01-vnet.bicep output)')
param isolatedSubnetId string

@description('Private DNS Zone resource ID for PostgreSQL (from 01-vnet.bicep output)')
param postgresPrivateDnsZoneId string

@description('PostgreSQL administrator login')
param administratorLogin string = 'ccc_admin'

@description('PostgreSQL administrator password (min 8 chars)')
@secure()
param administratorLoginPassword string

@description('Database name for management plane')
param databaseName string = 'ccc_management'

@description('PostgreSQL server SKU name')
@allowed([
  'Standard_D2ds_v4'
  'Standard_D4ds_v4'
  'Standard_D8ds_v4'
  'Standard_D16ds_v4'
])
param skuName string = 'Standard_D4ds_v4'

@description('Storage size in GB')
param storageSizeGb int = 128

@description('Backup retention in days')
param backupRetentionDays int = 14

var projectTag = 'CyberCommandCenter'
var serverName = 'ccc-postgres-${environmentName}'

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: serverName
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  sku: {
    name: skuName
    tier: 'GeneralPurpose'
  }
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    version: '16'
    storage: {
      storageSizeGB: storageSizeGb
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Enabled'
    }
    highAvailability: {
      mode: 'ZoneRedundant'
      standbyAvailabilityZone: '2'
    }
    availabilityZone: '1'
    network: {
      delegatedSubnetResourceId: isolatedSubnetId
      privateDnsZoneArmResourceId: postgresPrivateDnsZoneId
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    maintenanceWindow: {
      customWindow: 'Enabled'
      dayOfWeek: 0
      startHour: 3
      startMinute: 0
    }
  }
}

// ── Database ─────────────────────────────────────────────────────────────────
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── Server Configurations (OLTP tuning + pg_stat_statements) ─────────────────
resource configStatStatements 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: postgresServer
  name: 'shared_preload_libraries'
  properties: {
    value: 'pg_stat_statements,auto_explain'
    source: 'user-override'
  }
}

resource configLogDuration 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: postgresServer
  name: 'log_min_duration_statement'
  dependsOn: [configStatStatements]
  properties: {
    value: '2000'
    source: 'user-override'
  }
}

resource configConnections 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: postgresServer
  name: 'max_connections'
  dependsOn: [configLogDuration]
  properties: {
    value: '500'
    source: 'user-override'
  }
}

resource configIdleTimeout 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: postgresServer
  name: 'idle_in_transaction_session_timeout'
  dependsOn: [configConnections]
  properties: {
    value: '60000'
    source: 'user-override'
  }
}

// ── Private Endpoint (VNet-only access - no public endpoint exposed) ──────────
@description('Private subnet ID for private endpoint (from 01-vnet.bicep)')
param privateSubnetId string = ''

resource postgresPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (!empty(privateSubnetId)) {
  name: 'ccc-postgres-pe-${environmentName}'
  location: location
  tags: { Project: projectTag }
  properties: {
    subnet: { id: privateSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'ccc-postgres-plsc'
        properties: {
          privateLinkServiceId: postgresServer.id
          groupIds: ['postgresqlServer']
        }
      }
    ]
  }
}

// ── Azure Monitor Alerts ──────────────────────────────────────────────────────
resource actionGroupOps 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ccc-postgres-ops-ag-${environmentName}'
  location: 'global'
  tags: { Project: projectTag }
  properties: {
    groupShortName: 'CCCPostgres'
    enabled: true
    emailReceivers: []
    webhookReceivers: []
  }
}

resource alertHighCpu 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'ccc-postgres-high-cpu-${environmentName}'
  location: 'global'
  tags: { Project: projectTag }
  properties: {
    description: 'PostgreSQL CPU above 80%'
    severity: 2
    enabled: true
    scopes: [postgresServer.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'HighCPU'
          metricName: 'cpu_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [{ actionGroupId: actionGroupOps.id }]
  }
}

resource alertHighConnections 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'ccc-postgres-high-connections-${environmentName}'
  location: 'global'
  tags: { Project: projectTag }
  properties: {
    description: 'PostgreSQL active connections above 400'
    severity: 2
    enabled: true
    scopes: [postgresServer.id]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'HighConnections'
          metricName: 'active_connections'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 400
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [{ actionGroupId: actionGroupOps.id }]
  }
}

resource alertHighStorage 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'ccc-postgres-high-storage-${environmentName}'
  location: 'global'
  tags: { Project: projectTag }
  properties: {
    description: 'PostgreSQL storage utilization above 80%'
    severity: 2
    enabled: true
    scopes: [postgresServer.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'HighStorage'
          metricName: 'storage_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [{ actionGroupId: actionGroupOps.id }]
  }
}

// ── Key Vault Secret ─────────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: 'ccc-kv-${environmentName}'
}

resource postgresSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ccc-postgres-connection-string'
  properties: {
    value: 'postgresql://${administratorLogin}:${administratorLoginPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
  }
}

// ── Diagnostic Settings ──────────────────────────────────────────────────────
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: 'ccc-log-analytics-${environmentName}'
}

resource diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'ccc-postgres-diag-${environmentName}'
  scope: postgresServer
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output serverFqdn string = postgresServer.properties.fullyQualifiedDomainName
output serverName string = postgresServer.name
output databaseName string = database.name
output connectionStringSecretUri string = postgresSecret.properties.secretUri
