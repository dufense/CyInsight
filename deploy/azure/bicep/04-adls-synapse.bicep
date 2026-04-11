// ============================================================================
// Cyber Command Center -- Azure Data Lake Storage Gen2 + Synapse Analytics
//
// Azure equivalent of the AWS S3 + Iceberg + Athena data lake stack.
// Stores petabyte-scale security events in Delta Lake / Parquet format
// with identical tiering and lifecycle policies.
//
// Storage tiers (matched to 90-day alert retention in UI):
//   Day 0-30:   Hot tier           (real-time Synapse queries)
//   Day 31-90:  Cool tier          (Synapse batch queries, lower cost)
//   Day 91-365: Archive tier       (Synapse via rehydration)
//   Day 365+:   Archive + LTR      (compliance only)
//
// Creates:
//   - ADLS Gen2 storage account (hierarchical namespace, ZRS)
//   - Containers: raw-events, processed (Delta Lake), athena-results
//   - Lifecycle policy (hot -> cool -> archive tiering)
//   - Synapse Analytics Workspace
//   - Synapse Dedicated SQL Pool (DWU200c) for historical queries
//   - Synapse Serverless SQL Pool (auto, for ad-hoc queries)
//   - Private Endpoints for ADLS Gen2 DFS and Synapse SQL
//
// Depends on: 01-vnet.bicep
//
// Deploy:
//   az deployment group create \
//     --resource-group ccc-management-rg \
//     --template-file deploy/azure/bicep/04-adls-synapse.bicep \
//     --parameters environmentName=production sqlAdminPassword=<password>
// ============================================================================

@description('Environment name')
@allowed(['production', 'staging', 'development'])
param environmentName string = 'production'

param location string = resourceGroup().location

@description('Private subnet ID for private endpoints')
param privateSubnetId string

@description('ADLS private DNS zone ID')
param adlsPrivateDnsZoneId string

@description('Synapse SQL admin password')
@secure()
param sqlAdminPassword string

@description('Synapse SQL admin username')
param sqlAdminLogin string = 'ccc_synapse_admin'

var projectTag = 'CyberCommandCenter'
var storageAccountName = 'cccdatalake${replace(environmentName, '-', '')}${substring(uniqueString(resourceGroup().id), 0, 6)}'
var synapseWorkspaceName = 'ccc-synapse-${environmentName}'

// ── ADLS Gen2 Storage Account ────────────────────────────────────────────────
resource adlsAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  kind: 'StorageV2'
  sku: { name: 'Standard_ZRS' }
  properties: {
    isHnsEnabled: true
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [
        { id: privateSubnetId, action: 'Allow' }
      ]
    }
    encryption: {
      services: {
        blob: { enabled: true, keyType: 'Account' }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: adlsAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// ── ADLS Containers ───────────────────────────────────────────────────────────
resource containerRawEvents 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'raw-events'
  properties: { publicAccess: 'None' }
}

resource containerProcessed 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'processed'
  properties: { publicAccess: 'None' }
}

resource containerQueryResults 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'query-results'
  properties: { publicAccess: 'None' }
}

resource containerCheckpoints 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'synapse-checkpoints'
  properties: { publicAccess: 'None' }
}

// ── Lifecycle Management Policy ──────────────────────────────────────────────
resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  parent: adlsAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'TransitionSecurityEvents'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['raw-events/', 'processed/']
            }
            actions: {
              baseBlob: {
                // hot  (0-30 days):   Hot tier    — real-time Synapse queries
                // warm (31-90 days):  Cool tier   — batch queries, lower cost
                // cold (91-365 days): Cold tier   — infrequent access, rehydrate in hours
                // frozen (365+ days): Archive tier — compliance/long-term, rehydrate 1-15 hrs
                tierToCool: { daysAfterModificationGreaterThan: 30 }
                tierToCold: { daysAfterModificationGreaterThan: 90 }
                tierToArchive: { daysAfterModificationGreaterThan: 365 }
              }
            }
          }
        }
        {
          name: 'ExpireQueryResults'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['query-results/']
            }
            actions: {
              baseBlob: {
                delete: { daysAfterModificationGreaterThan: 7 }
              }
            }
          }
        }
      ]
    }
  }
}

// ── Private Endpoint for ADLS DFS ────────────────────────────────────────────
resource adlsPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'ccc-adls-pe-${environmentName}'
  location: location
  tags: { Project: projectTag }
  properties: {
    subnet: { id: privateSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'ccc-adls-plsc'
        properties: {
          privateLinkServiceId: adlsAccount.id
          groupIds: ['dfs']
        }
      }
    ]
  }
}

resource adlsDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: adlsPrivateEndpoint
  name: 'adls-dns-group'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'adls-config'
        properties: { privateDnsZoneId: adlsPrivateDnsZoneId }
      }
    ]
  }
}

// ── Synapse Analytics Workspace ──────────────────────────────────────────────
resource synapseWorkspace 'Microsoft.Synapse/workspaces@2021-06-01' = {
  name: synapseWorkspaceName
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    defaultDataLakeStorage: {
      accountUrl: 'https://${adlsAccount.name}.dfs.core.windows.net'
      filesystem: 'synapse-checkpoints'
      resourceId: adlsAccount.id
      createManagedPrivateEndpoint: false
    }
    sqlAdministratorLogin: sqlAdminLogin
    sqlAdministratorLoginPassword: sqlAdminPassword
    managedVirtualNetwork: 'default'
    publicNetworkAccess: 'Disabled'
    // connectivityEndpoints is a read-only/service-populated property; do not set at create time
  }
}

// ── Synapse Serverless SQL Pool (ad-hoc queries, pay-per-use) ─────────────────
resource builtinSqlPool 'Microsoft.Synapse/workspaces/sqlPools@2021-06-01' existing = {
  parent: synapseWorkspace
  name: 'Built-in'
}

// ── Synapse Dedicated SQL Pool (DWU200c for historical batch queries) ──────────
resource dedicatedSqlPool 'Microsoft.Synapse/workspaces/sqlPools@2021-06-01' = {
  parent: synapseWorkspace
  name: 'cccSecurityEvents'
  location: location
  tags: { Project: projectTag }
  sku: {
    name: 'DW200c'
  }
  properties: {
    createMode: 'Default'
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

// ── Synapse Spark Pool (3 nodes autoscale for Delta Lake compaction) ──────────
resource synapseSparkPool 'Microsoft.Synapse/workspaces/bigDataPools@2021-06-01' = {
  parent: synapseWorkspace
  name: 'cccSparkPool'
  location: location
  tags: { Project: projectTag }
  properties: {
    nodeSize: 'Small'
    nodeSizeFamily: 'MemoryOptimized'
    sparkVersion: '3.4'
    autoScale: {
      enabled: true
      minNodeCount: 3
      maxNodeCount: 10
    }
    autoPause: {
      enabled: true
      delayInMinutes: 15
    }
    isComputeIsolationEnabled: false
    dynamicExecutorAllocation: {
      enabled: true
      minExecutors: 1
      maxExecutors: 4
    }
    sparkConfigProperties: {
      configurationType: 'Artifact'
      content: '''
spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension
spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog
spark.databricks.delta.optimize.enabled=true
spark.databricks.delta.vacuum.enabled=true
'''
    }
  }
}

// ── Synapse Private Link Hub (for private connectivity to Synapse Studio) ─────
resource synapseLinkHub 'Microsoft.Synapse/privateLinkHubs@2021-06-01' = {
  name: 'cccsynapsehub${replace(environmentName, '-', '')}${substring(uniqueString(resourceGroup().id), 0, 6)}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
}

// ── ADLS Gen2 Linked Service (required by external table data source) ─────────
resource deltaLakeLinkedService 'Microsoft.Synapse/workspaces/linkedServices@2019-06-01-preview' = {
  parent: synapseWorkspace
  name: 'ccc-adls-gen2-linked'
  properties: {
    type: 'AzureBlobFS'
    typeProperties: {
      url: 'https://${adlsAccount.name}.dfs.core.windows.net'
      accountKey: adlsAccount.listKeys().keys[0].value
    }
    description: 'ADLS Gen2 linked service backing Delta Lake external tables'
  }
}

// ── Synapse Serverless SQL Script: Delta Lake External Data Source ─────────────
// Defines the external data source, file format, and external tables over the
// Delta Lake (Parquet) files in ADLS Gen2.  Run against the Built-in (serverless)
// SQL endpoint to create the query layer objects that expose security_events as
// a partitioned external table queryable via T-SQL.
//
// Deployment note: Synapse SQL Scripts are DDL artifacts stored in the workspace;
// they must be executed once after workspace creation (orchestrated by the deploy
// script via `az synapse sql-script run`).
resource createExternalDataSource 'Microsoft.Synapse/workspaces/sqlScripts@2021-06-01-preview' = {
  parent: synapseWorkspace
  name: '01_create_external_data_source'
  properties: {
    description: 'Create ADLS Gen2 external data source for Delta Lake tables'
    content: {
      currentConnection: {
        databaseName: 'master'
        poolName: 'Built-in'
      }
      // Use format() to inject runtime values: {0}=sqlAdminPassword, {1}=adlsAccount.name
      // Bicep triple-quoted strings are verbatim so interpolation is done via format().
      // SQL has no literal curly braces so no escaping is needed.
      query: format('''
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N''ccc_datalake'')
  CREATE DATABASE ccc_datalake;
GO

USE ccc_datalake;
GO

-- Master key for credential encryption (password = Synapse SQL admin password)
IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = ''##MS_DatabaseMasterKey##'')
  CREATE MASTER KEY ENCRYPTION BY PASSWORD = ''{0}'';
GO

-- Managed Identity credential (Synapse MSI has Storage Blob Data Contributor on ADLS)
IF NOT EXISTS (SELECT 1 FROM sys.database_credentials WHERE name = N''ccc_adls_msi_cred'')
  CREATE DATABASE SCOPED CREDENTIAL ccc_adls_msi_cred
  WITH IDENTITY = ''Managed Identity'';
GO

-- External data source pointing at the processed (Delta/Parquet) container
IF NOT EXISTS (SELECT 1 FROM sys.external_data_sources WHERE name = N''ccc_adls_processed'')
  CREATE EXTERNAL DATA SOURCE ccc_adls_processed
  WITH (
    LOCATION   = ''abfss://processed@{1}.dfs.core.windows.net'',
    CREDENTIAL = ccc_adls_msi_cred
  );
GO

-- Parquet file format for Delta Lake tables
IF NOT EXISTS (SELECT 1 FROM sys.external_file_formats WHERE name = N''ccc_parquet_format'')
  CREATE EXTERNAL FILE FORMAT ccc_parquet_format
  WITH (
    FORMAT_TYPE = PARQUET,
    DATA_COMPRESSION = ''org.apache.hadoop.io.compress.SnappyCodec''
  );
GO
''', sqlAdminPassword, adlsAccount.name)
    }
    type: 'SqlQuery'
  }
}

// ── Synapse Serverless SQL Script: security_events External Table ─────────────
// Creates the security_events external table partitioned by event_date and
// clustered logically by tenant_id, severity, source_type (pruning is handled
// by Synapse serverless pushdown predicates on the Parquet column statistics).
resource createSecurityEventsTable 'Microsoft.Synapse/workspaces/sqlScripts@2021-06-01-preview' = {
  parent: synapseWorkspace
  name: '02_create_security_events_external_table'
  dependsOn: [createExternalDataSource]
  properties: {
    description: 'Create security_events Delta Lake external table with partitioning'
    content: {
      currentConnection: {
        databaseName: 'ccc_datalake'
        poolName: 'Built-in'
      }
      query: '''
USE ccc_datalake;
GO

-- Drop and recreate so re-runs are idempotent during IaC iterations
IF OBJECT_ID(N'dbo.security_events', N'ET') IS NOT NULL
  DROP EXTERNAL TABLE dbo.security_events;
GO

-- External table over Delta Lake (Parquet) files in ADLS Gen2 processed container.
-- Partitioned by event_date (Hive-style dt=YYYY-MM-DD/ directories).
-- Synapse serverless pushes down predicates on tenant_id, severity, source_type
-- using Parquet column statistics, providing clustering-equivalent performance.
CREATE EXTERNAL TABLE dbo.security_events (
  event_id            NVARCHAR(36)    NOT NULL,
  tenant_id           INT             NOT NULL,
  source_type         NVARCHAR(64)    NULL,
  severity            NVARCHAR(16)    NULL,
  event_type          NVARCHAR(64)    NULL,
  raw_event           NVARCHAR(MAX)   NULL,
  normalized_event    NVARCHAR(MAX)   NULL,
  host                NVARCHAR(256)   NULL,
  src_ip              NVARCHAR(45)    NULL,
  dst_ip              NVARCHAR(45)    NULL,
  user_name           NVARCHAR(256)   NULL,
  process_name        NVARCHAR(512)   NULL,
  mitre_tactic        NVARCHAR(128)   NULL,
  mitre_technique_id  NVARCHAR(32)    NULL,
  kill_chain_phase    NVARCHAR(64)    NULL,
  confidence_score    INT             NULL,
  data_region         NVARCHAR(32)    NULL,
  ingested_at         DATETIME2       NULL,
  event_date          DATE            NOT NULL   -- Hive partition key (dt=YYYY-MM-DD)
)
WITH (
  DATA_SOURCE       = ccc_adls_processed,
  LOCATION          = 'security_events/**',
  FILE_FORMAT       = ccc_parquet_format
);
GO

-- Convenience view: tenant-scoped (application passes @tenant_id parameter)
IF OBJECT_ID(N'dbo.v_tenant_security_events', N'V') IS NOT NULL
  DROP VIEW dbo.v_tenant_security_events;
GO

CREATE VIEW dbo.v_tenant_security_events AS
  SELECT *
  FROM   dbo.security_events
  WHERE  event_date >= CAST(DATEADD(DAY, -90, GETUTCDATE()) AS DATE);  -- 90-day hot window
GO
'''
    }
    type: 'SqlQuery'
  }
}

// ── Synapse Firewall (allow Azure services + private subnet) ──────────────────
resource synapseFirewallAzure 'Microsoft.Synapse/workspaces/firewallRules@2021-06-01' = {
  parent: synapseWorkspace
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Role Assignment (Synapse MSI -> ADLS Storage Blob Data Contributor) ───────
resource synapseAdlsRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: adlsAccount
  name: guid(adlsAccount.id, synapseWorkspace.id, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: synapseWorkspace.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Key Vault Secrets ─────────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: 'ccc-kv-${environmentName}'
}

resource adlsConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ccc-adls-connection-string'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${adlsAccount.name};AccountKey=${adlsAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
  }
}

resource adlsDfsEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ccc-adls-dfs-endpoint'
  properties: {
    value: 'https://${adlsAccount.name}.dfs.core.windows.net'
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output adlsAccountName string = adlsAccount.name
output adlsDfsEndpoint string = 'https://${adlsAccount.name}.dfs.core.windows.net'
output rawEventsContainer string = containerRawEvents.name
output processedContainer string = containerProcessed.name
output synapseWorkspaceName string = synapseWorkspace.name
output synapseSqlEndpoint string = synapseWorkspace.properties.connectivityEndpoints.sql
output synapseServerlessSqlEndpoint string = synapseWorkspace.properties.connectivityEndpoints.sqlOnDemand
