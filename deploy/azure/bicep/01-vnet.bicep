// ============================================================================
// Cyber Command Center -- Azure Virtual Network (Management + Data Plane)
//
// Creates a 3-tier VNet mirroring the AWS VPC design:
//   - Public subnet    (Application Gateway / Azure Front Door origin)
//   - Private subnet   (Container Apps, Event Hubs, ClickHouse OLAP)
//   - Isolated subnet  (Azure Database for PostgreSQL Flexible Server)
//
// Also creates:
//   - NAT Gateway (one per region for outbound)
//   - NSGs for each subnet tier
//   - Private DNS Zones for PostgreSQL, Event Hubs, ADLS, Synapse
//   - Network Watcher Flow Logs
//
// Deploy:
//   az deployment group create \
//     --resource-group ccc-management-rg \
//     --template-file deploy/azure/bicep/01-vnet.bicep \
//     --parameters environmentName=production location=eastus
// ============================================================================

@description('Environment name (production | staging | development)')
@allowed(['production', 'staging', 'development'])
param environmentName string = 'production'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('VNet address space CIDR')
param vnetCidr string = '10.20.0.0/16'

@description('Public subnet CIDR (Application Gateway)')
param publicSubnetCidr string = '10.20.1.0/24'

@description('Private subnet CIDR (Container Apps / services)')
param privateSubnetCidr string = '10.20.10.0/24'

@description('Isolated subnet CIDR (PostgreSQL Flexible Server)')
param isolatedSubnetCidr string = '10.20.20.0/24'

var projectTag = 'CyberCommandCenter'
var nameSuffix = '${environmentName}'

// ── NSG: Public (Application Gateway) ────────────────────────────────────────
resource nsgPublic 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'ccc-public-nsg-${nameSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    securityRules: [
      {
        name: 'AllowHTTPS'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          description: 'Allow HTTPS from internet'
        }
      }
      {
        name: 'AllowHTTP'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          description: 'Allow HTTP redirect from internet'
        }
      }
      {
        name: 'AllowGatewayManagerInbound'
        properties: {
          priority: 120
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '65200-65535'
          sourceAddressPrefix: 'GatewayManager'
          destinationAddressPrefix: '*'
          description: 'Azure App Gateway management ports'
        }
      }
    ]
  }
}

// ── NSG: Private (Container Apps / services) ─────────────────────────────────
resource nsgPrivate 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'ccc-private-nsg-${nameSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    securityRules: [
      {
        name: 'AllowAppPort'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '5000'
          sourceAddressPrefix: vnetCidr
          destinationAddressPrefix: '*'
          description: 'Allow app port from VNet'
        }
      }
      {
        name: 'DenyInternetInbound'
        properties: {
          priority: 4000
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          description: 'Block direct internet access'
        }
      }
    ]
  }
}

// ── NSG: Isolated (PostgreSQL Flexible Server) ───────────────────────────────
resource nsgIsolated 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'ccc-isolated-nsg-${nameSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    securityRules: [
      {
        name: 'AllowPostgresFromPrivate'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '5432'
          sourceAddressPrefix: privateSubnetCidr
          destinationAddressPrefix: '*'
          description: 'Allow PostgreSQL from private subnet only'
        }
      }
      {
        name: 'DenyAll'
        properties: {
          priority: 4000
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          description: 'Deny all other inbound'
        }
      }
    ]
  }
}

// ── NAT Gateway ──────────────────────────────────────────────────────────────
resource natGatewayPip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: 'ccc-nat-pip-${nameSuffix}'
  location: location
  sku: { name: 'Standard' }
  tags: { Project: projectTag }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource natGateway 'Microsoft.Network/natGateways@2023-09-01' = {
  name: 'ccc-nat-gateway-${nameSuffix}'
  location: location
  sku: { name: 'Standard' }
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    publicIpAddresses: [{ id: natGatewayPip.id }]
    idleTimeoutInMinutes: 10
  }
}

// ── Virtual Network ──────────────────────────────────────────────────────────
resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: 'ccc-vnet-${nameSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
  properties: {
    addressSpace: {
      addressPrefixes: [vnetCidr]
    }
    subnets: [
      {
        name: 'ccc-public-subnet'
        properties: {
          addressPrefix: publicSubnetCidr
          networkSecurityGroup: { id: nsgPublic.id }
        }
      }
      {
        name: 'ccc-private-subnet'
        properties: {
          addressPrefix: privateSubnetCidr
          networkSecurityGroup: { id: nsgPrivate.id }
          natGateway: { id: natGateway.id }
          delegations: [
            {
              name: 'containerAppsDelegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          serviceEndpoints: [
            { service: 'Microsoft.Storage' }
            { service: 'Microsoft.KeyVault' }
            { service: 'Microsoft.EventHub' }
          ]
        }
      }
      {
        name: 'ccc-isolated-subnet'
        properties: {
          addressPrefix: isolatedSubnetCidr
          networkSecurityGroup: { id: nsgIsolated.id }
          delegations: [
            {
              name: 'postgresFlexibleServerDelegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

// ── Private DNS Zones ────────────────────────────────────────────────────────
resource dnsZonePostgres 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
  tags: { Project: projectTag }
}

resource dnsZonePostgresLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZonePostgres
  name: 'ccc-postgres-dns-link-${nameSuffix}'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource dnsZoneEventHub 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.servicebus.windows.net'
  location: 'global'
  tags: { Project: projectTag }
}

resource dnsZoneEventHubLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneEventHub
  name: 'ccc-eventhub-dns-link-${nameSuffix}'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource dnsZoneADLS 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.dfs.core.windows.net'
  location: 'global'
  tags: { Project: projectTag }
}

resource dnsZoneADLSLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneADLS
  name: 'ccc-adls-dns-link-${nameSuffix}'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

// ── Network Watcher Flow Logs ─────────────────────────────────────────────────
resource networkWatcher 'Microsoft.Network/networkWatchers@2023-09-01' = {
  name: 'ccc-network-watcher-${nameSuffix}'
  location: location
  tags: { Project: projectTag, Environment: environmentName }
}

resource storageAccountFlowLogs 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'cccflowlogs${replace(nameSuffix, '-', '')}${substring(uniqueString(resourceGroup().id), 0, 6)}'
  location: location
  tags: { Project: projectTag }
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource logAnalyticsWorkspaceFlowLogs 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: 'ccc-log-analytics-${environmentName}'
}

resource privateSubnetFlowLog 'Microsoft.Network/networkWatchers/flowLogs@2023-09-01' = {
  parent: networkWatcher
  name: 'ccc-private-subnet-flowlog-${nameSuffix}'
  location: location
  properties: {
    storageId: storageAccountFlowLogs.id
    enabled: true
    retentionPolicy: {
      days: 90
      enabled: true
    }
    format: {
      type: 'JSON'
      version: 2
    }
    flowAnalyticsConfiguration: {
      networkWatcherFlowAnalyticsConfiguration: {
        enabled: true
        workspaceResourceId: logAnalyticsWorkspaceFlowLogs.id
        trafficAnalyticsInterval: 10
      }
    }
    // flowLogs targetResourceId must be an NSG resource ID, not a subnet ID.
    // nsgPrivate is associated with the private subnet (subnets[1]).
    targetResourceId: nsgPrivate.id
  }
}

resource publicSubnetFlowLog 'Microsoft.Network/networkWatchers/flowLogs@2023-09-01' = {
  parent: networkWatcher
  name: 'ccc-public-subnet-flowlog-${nameSuffix}'
  location: location
  properties: {
    storageId: storageAccountFlowLogs.id
    enabled: true
    retentionPolicy: {
      days: 90
      enabled: true
    }
    format: {
      type: 'JSON'
      version: 2
    }
    // flowLogs targetResourceId must be an NSG resource ID, not a subnet ID.
    // nsgPublic is associated with the public subnet (subnets[0]).
    targetResourceId: nsgPublic.id
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output vnetId string = vnet.id
output vnetName string = vnet.name
output publicSubnetId string = vnet.properties.subnets[0].id
output privateSubnetId string = vnet.properties.subnets[1].id
output isolatedSubnetId string = vnet.properties.subnets[2].id
output natGatewayId string = natGateway.id
output postgresPrivateDnsZoneId string = dnsZonePostgres.id
output eventHubPrivateDnsZoneId string = dnsZoneEventHub.id
output adlsPrivateDnsZoneId string = dnsZoneADLS.id
