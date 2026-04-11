# Cyber Command Center - Multi-Cloud Data Lake Architecture

## Overview

The CCC data lake replaces direct PostgreSQL storage for security event data with a petabyte-scale architecture that can handle the annual volume of security events across five data-plane regions. PostgreSQL (Aurora/Cloud SQL/PostgreSQL Flexible) remains as the management-plane OLTP store for structured metadata (tenants, users, incidents metadata, tickets, projects).

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │                 MANAGEMENT PLANE                            │
                        │                                                             │
                        │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
                        │  │  CCC React   │   │  Express API │   │  Aurora/PG   │   │
                        │  │  Frontend    │──>│  (metadata)  │──>│  (OLTP only) │   │
                        │  └──────────────┘   └──────┬───────┘   └──────────────┘   │
                        │                            │ Query                          │
                        └────────────────────────────│────────────────────────────────┘
                                                     │
                        ┌────────────────────────────│────────────────────────────────┐
                        │                 DATA PLANE  │                               │
                        │                             v                               │
                        │  ┌──────────────────────────────────────────────────────┐  │
                        │  │            HOT TIER (0-30 days)                      │  │
                        │  │          OpenSearch / Azure Search / GCS             │  │
                        │  │    Real-time queries, SOC analyst investigation      │  │
                        │  └──────────────────────────────────────────────────────┘  │
                        │                             │ age >30d                      │
                        │                             v                               │
                        │  ┌──────────────────────────────────────────────────────┐  │
                        │  │            WARM TIER (31-90 days)                    │  │
                        │  │    S3 Intelligent-Tiering / ADLS Cool / GCS Nearline │  │
                        │  │    Athena/Synapse/BigQuery batch queries              │  │
                        │  └──────────────────────────────────────────────────────┘  │
                        │                             │ age >91d                      │
                        │                             v                               │
                        │  ┌──────────────────────────────────────────────────────┐  │
                        │  │            COLD TIER (91-365 days)                   │  │
                        │  │    S3 Glacier IR / ADLS Archive / GCS Coldline       │  │
                        │  │    Athena/Synapse/BigQuery via rehydration            │  │
                        │  └──────────────────────────────────────────────────────┘  │
                        │                             │ age >365d                     │
                        │                             v                               │
                        │  ┌──────────────────────────────────────────────────────┐  │
                        │  │            FROZEN TIER (365+ days)                   │  │
                        │  │    S3 Glacier Deep Archive / Azure LTR / GCS Archive │  │
                        │  │    Compliance-only, no query SLA                     │  │
                        │  └──────────────────────────────────────────────────────┘  │
                        └─────────────────────────────────────────────────────────────┘
```

---

## Architecture Principles

### Management Plane vs Data Plane Separation

| Concern | Management Plane | Data Plane |
|---------|-----------------|------------|
| **Database** | PostgreSQL (OLTP) | S3/ADLS/GCS (object store) |
| **Query** | Direct SQL | Athena / Synapse / BigQuery |
| **Format** | Normalized rows | Parquet + Apache Iceberg |
| **Scale** | GB-scale | PB-scale |
| **Latency** | <10ms | Seconds to minutes |
| **Data** | Tenants, users, incidents meta, tickets | Raw events, enriched events, IOCs |

### Why Iceberg/Delta Lake Instead of Raw Parquet

- **ACID transactions**: Safe concurrent writes from multiple data plane regions
- **Time travel**: Query state at any historical point (audit trail)
- **Schema evolution**: Add IOC fields, MITRE enrichment without rewriting all data
- **Partition evolution**: Change partitioning strategy without full table rewrites
- **Z-order clustering**: Co-locate related records (tenant_id + date) for 10x query speedup

---

## AWS Architecture

### Stack Dependency Graph

```
01-vpc.yml
    |
    +-- 02-aurora-management.yml  (isolated subnets)
    |
    +-- 03-msk-kafka.yml          (private subnets)
    |
    +-- 04-opensearch.yml         (private subnets)
    |
    +-- 05-data-lake.yml          (S3 + Glue + Athena, no VPC dependency)
    |
    +-- 06-management-ecs.yml     (depends on all above)
    |
    +-- 07-data-plane-ecs.yml     (per-region, depends on all above)
         x5 regions:
           ccc-data-plane-in-west-1
           ccc-data-plane-us-east-1
           ccc-data-plane-ke-east-1
           ccc-data-plane-sa-central-1
           ccc-data-plane-bh-east-1
```

### S3 Bucket Layout

```
ccc-raw-events-{env}-{account}/
  events/
    year=2026/month=03/day=29/
      {tenant_id}-{uuid}.parquet      <- receiver writes here

ccc-iceberg-{env}-{account}/
  iceberg/
    security_events/
      metadata/                       <- Iceberg metadata files
      data/
        event_date=2026-03-29/
          tenant_id=30/
            *.parquet                 <- Iceberg data files

ccc-athena-results-{env}-{account}/
  athena-results/                     <- 7-day TTL
```

### Event Flow (AWS)

```
Security Tool
    |
    v
Receiver Plane (NLB)
    |  Push API / Syslog / CEF
    v
MSK Kafka (ccc-raw-events topic)
    |
    +-- Data Plane ECS ----------> S3 Raw (Parquet write)
    |   (per region, x5)              |
    |                             Glue Crawler (triggered by Lambda)
    |                                 |
    |                             S3 Iceberg (compacted)
    |                                 |
    |                             Athena Workgroup
    |
    +-- AI Normalization ---------> MSK Kafka (ccc-enriched-events)
    |                                 |
    |                             OpenSearch (30-day hot tier)
    |
    v
Management Plane API
    |  Query enriched events
    v
OpenSearch (hot) or Athena (warm/cold)
```

### Data Tiering (AWS)

| Tier | Storage Class | Days | Query Method | Monthly Cost/TB |
|------|--------------|------|--------------|-----------------|
| Hot | S3 Standard + OpenSearch | 0-30 | OpenSearch API | ~$45 + $25 |
| Warm | S3 Intelligent-Tiering | 31-90 | Athena $5/TB scanned | ~$18 |
| Cold | S3 Glacier Instant | 91-365 | Athena $5/TB scanned | ~$4 |
| Frozen | S3 Glacier Deep Archive | 365+ | Athena (rehydrate 12h) | ~$0.99 |

---

## Azure Architecture

### Stack Dependency Graph

```
01-vnet.bicep
    |
    +-- 02-postgresql-management.bicep  (isolated subnet)
    |
    +-- 03-event-hubs.bicep            (private subnet)
    |
    +-- 04-adls-synapse.bicep          (private subnet)
    |
    +-- 05-container-apps.bicep        (private subnet, depends on all above)
         x5 data plane regions
```

### ADLS Gen2 Container Layout

```
cccdatalake{env}{hash}/
  raw-events/                    <- EventHub Capture writes here
    {namespace}/{eventhub}/{partition}/{year}/{month}/{day}/
  processed/                     <- Delta Lake / Parquet
    security_events/
      year=2026/month=03/day=29/
        tenant_id=30/
          *.parquet
  query-results/                 <- 7-day TTL
  synapse-checkpoints/           <- Synapse internal state
```

### Event Flow (Azure)

```
Security Tool
    |
    v
Container App (Receiver)
    |  Push API / Syslog / CEF
    v
Event Hubs (ccc-raw-events, Kafka-compat endpoint)
    |
    +-- Container App (Data Plane) -----> ADLS Gen2 Raw (Parquet)
    |   (KEDA scaled by consumer lag)         |
    |                                     Synapse Spark (compaction)
    |                                         |
    |                                     ADLS Gen2 Processed
    |                                         |
    |                                     Synapse SQL (query)
    |
    +-- AI Enrichment Pipeline ---------> Event Hubs (ccc-enriched)
    |                                         |
    |                                     Azure Cognitive Search (hot)
    |
    v
Container App (Management)
    |  Query via Synapse Serverless SQL
    v
ADLS Gen2 (warm/cold via Synapse)
```

---

## GCP Architecture

### Stack Dependency Graph

```
01-vpc.yaml
    |
    +-- 02-cloudsql-management.yaml   (Cloud SQL Private Service Access)
    |
    +-- 03-pubsub-dataflow.yaml       (Pub/Sub topics + subscriptions)
    |
    +-- 04-gcs-bigquery.yaml          (GCS buckets + BigQuery dataset)
    |
    Cloud Run deploy (via deploy-all.sh --stack cloud-run)
         Management plane + data plane per logical region
```

### GCS Bucket Layout

```
ccc-raw-events-bucket/
  security_events/
    year=2026/month=03/day=29/
      {tenant_id}-{uuid}.parquet

ccc-processed-bucket/
  security_events/
    event_date=2026-03-29/
      tenant_id=30/
        *.parquet

ccc-query-results-bucket/
  {query-id}/                     <- 7-day TTL
```

### Event Flow (GCP)

```
Security Tool
    |
    v
Cloud Run (Receiver) - push API
    |
    v
Pub/Sub (ccc-raw-events topic)
    |
    +-- Cloud Run (Data Plane) -----> GCS Raw (Parquet)
    |   (scaled by subscriber lag)         |
    |                                  BigQuery External Table
    |                                  (auto-detects new partitions)
    |
    +-- AI Normalization -----------> Pub/Sub (ccc-enriched)
    |                                      |
    |                                  Cloud Run (Sigma engine)
    |
    v
Cloud Run (Management) - query via BigQuery API
    |
    v
BigQuery (hot 0-30d, external table)
```

---

## Multi-Cloud Comparison Matrix

| Feature | AWS | Azure | GCP |
|---------|-----|-------|-----|
| **Streaming** | MSK Kafka | Event Hubs (Kafka-compat) | Pub/Sub |
| **Compute** | ECS Fargate | Container Apps | Cloud Run |
| **OLTP DB** | Aurora Serverless v2 | PostgreSQL Flexible | Cloud SQL |
| **Object Store** | S3 | ADLS Gen2 | GCS |
| **Table Format** | Apache Iceberg | Delta Lake | Parquet + BigLake |
| **Query Engine** | Athena (Trino) | Synapse Serverless SQL | BigQuery |
| **Hot Search** | OpenSearch | Azure Search | Cloud Search |
| **Secrets** | Secrets Manager | Key Vault | Secret Manager |
| **IAM** | IAM Roles | Managed Identity | Service Accounts |
| **VNet** | VPC + Security Groups | VNet + NSGs | VPC + Firewall Rules |
| **NAT** | NAT Gateway (per-AZ) | NAT Gateway | Cloud NAT |

---

## Security Event Schema (All Clouds)

```parquet
security_events {
  event_id          : STRING      -- UUID, globally unique
  tenant_id         : INTEGER     -- FK to management plane tenants table
  source_type       : STRING      -- cynet|checkpoint|syslog|push_api|sigma
  severity          : STRING      -- critical|high|medium|low|info
  event_type        : STRING      -- alert type classification
  raw_event         : STRING      -- original JSON string
  normalized_event  : STRING      -- AI-normalized JSON string
  host              : STRING
  src_ip            : STRING
  dst_ip            : STRING
  user_name         : STRING
  process_name      : STRING
  mitre_tactic      : STRING      -- TA0001, TA0002, ...
  mitre_technique_id: STRING      -- T1566.001, ...
  kill_chain_phase  : STRING      -- reconnaissance|weaponization|...
  iocs              : ARRAY       -- [{type, value, reputation, country}]
  confidence_score  : INTEGER     -- 0-100 (AI enrichment)
  data_region       : STRING      -- in-west-1|us-east-1|ke-east-1|sa-central-1|bh-east-1
  ingested_at       : TIMESTAMP
  event_date        : DATE        -- PARTITION KEY (used by Athena/Synapse/BigQuery)
}

Partitioning strategy:
  Primary:   event_date   (daily partitions, enables lifecycle management)
  Secondary: tenant_id    (cluster within date, reduces scan costs per tenant)
```

---

## Capacity Planning

### Storage Estimates (per region per year)

| Severity Distribution | Events/Day | Compressed Parquet | S3 Cost/Year |
|----------------------|-----------|-------------------|--------------|
| Low volume tenant | 100K | ~50 GB | ~$1.15 |
| Mid volume tenant | 1M | ~500 GB | ~$11.50 |
| High volume tenant | 10M | ~5 TB | ~$115 |
| Enterprise tenant | 100M | ~50 TB | ~$1,150 |
| All 5 regions combined | 500M | ~250 TB | ~$5,750 |

### MSK/Event Hubs Throughput

- **Partition count**: 12 per topic (configurable)
- **Target throughput**: 100 MB/s per broker (MSK m5.large baseline)
- **Peak headroom**: 3x with FARGATE_SPOT data plane auto-scaling
- **Consumer lag threshold**: 100 messages before scale-out (KEDA for Azure)

### OpenSearch Sizing

| Tier | Instance | Storage | AZ | Purpose |
|------|---------|---------|-----|---------|
| Data | r6g.large x3 | 512 GB each | 2 AZ | 30-day hot queries |
| UltraWarm | ultrawarm1.medium x2 | 3 TB each | N/A | 31-90 day warm |
| Master | r6g.large x3 | Ephemeral | 3 AZ | Cluster state |

---

## Disaster Recovery

### RTO / RPO Targets

| Component | RTO | RPO |
|-----------|-----|-----|
| Aurora (management) | 30s (failover) | 0 (synchronous) |
| MSK Kafka | 60s (broker failover) | 0 (min.insync=2) |
| OpenSearch | 60s (master election) | 0 (replication=2) |
| S3 Iceberg | N/A (durable) | ~5 min (last Glue crawl) |
| Athena | N/A (serverless) | N/A |

### Backup Strategy

| Store | Method | Retention |
|-------|--------|-----------|
| Aurora | Automated + manual snapshots | 14 days |
| S3 Raw Events | Versioning enabled | 90 days |
| S3 Iceberg | Versioning + Iceberg snapshot | 30 days (snapshots) |
| OpenSearch | Automated snapshots to S3 | 7 days |

---

## Operations

### Running Athena Queries (AWS)

```sql
-- Query last 7 days of high severity events for tenant 30
SELECT
  event_id, source_type, severity, host, src_ip, mitre_tactic, ingested_at
FROM ccc_security_events_production.security_events
WHERE event_date BETWEEN DATE '2026-03-22' AND DATE '2026-03-29'
  AND tenant_id = 30
  AND severity IN ('critical', 'high')
ORDER BY ingested_at DESC
LIMIT 1000;
-- Uses partition pruning on event_date, costs ~$0.005 for 7-day scan
```

### Running BigQuery Queries (GCP)

```sql
-- Same query on GCP BigQuery
SELECT
  event_id, source_type, severity, host, src_ip, mitre_tactic, ingested_at
FROM `PROJECT_ID.ccc_security_events.security_events`
WHERE event_date BETWEEN '2026-03-22' AND '2026-03-29'
  AND tenant_id = 30
  AND severity IN ('critical', 'high')
ORDER BY ingested_at DESC
LIMIT 1000;
```

### Monitoring Key Metrics

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| MSK UnderReplicatedPartitions | > 0 | Immediate - data loss risk |
| OpenSearch ClusterStatus.red | > 0 | Immediate - service degraded |
| Aurora ServerlessDatabaseCapacity | >= MaxACU | Scale up MaxACU |
| S3 Crawler errors | > 0 | Check Lambda trigger logs |
| ECS task CPU | > 70% avg | Auto-scales via target tracking |
