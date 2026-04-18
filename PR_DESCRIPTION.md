# PR: ClickHouse-Only Architecture (Task #181)

## Objective

Make ClickHouse the sole hot-tier OLAP backend for security events across the
Cyber Command Center platform. The previous starter stack and multi-plane
deployments shipped with a parallel hot-search engine; this PR removes that
engine entirely and standardises every runtime, deployment, and documentation
path on ClickHouse.

> **Migration context:** earlier releases co-deployed an external search
> engine alongside ClickHouse for hot search. ClickHouse has been the primary
> OLAP store since the multi-vector detection engine launched, so the legacy
> engine is now redundant and is removed end-to-end by this change.

## Scope of Changes

### 1. Runtime Code

- Removed the legacy `services/storage/src/opensearch-indexer.ts` module and
  every dynamic import / dual-write call site in `services/storage/src/index.ts`.
- Removed legacy hot-search status fields from `/health` and `/metrics`
  endpoints; both planes now report `clickHouseStatus` only.
- Renamed the Platform Health UI tile from "OpenSearch" to "ClickHouse" and
  swapped the underlying status field.

### 2. Deployment Artifacts

- **CloudFormation:** deleted `04-opensearch.yml`; renamed
  `08-clickhouse-cluster.yml` as the canonical OLAP stack. Updated
  `06-management-ecs.yml` to accept `ClickHouseStackName` / `ClickHouseUser` /
  `ClickHouseDatabase` parameters and a `HasClickHouse` condition that injects
  `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_DATABASE`, and the
  `CLICKHOUSE_PASSWORD` SSM secret into the management container.
- **deploy-all.sh:** `deploy_management()` now auto-detects the
  `ccc-clickhouse` stack and forwards the parameter; the `all` flow runs a new
  Step 09b management re-deploy after ClickHouse comes up so the ECS task
  picks up the ClickHouse env in the same rollout.
- **Helm / Kubernetes / Bicep:** stripped every `OPENSEARCH_*` env var,
  secret, service, and StatefulSet from the chart, manifests, and Bicep
  modules.
- **docker-compose.{onprem,multi-plane}.yml:** removed the OpenSearch
  service; added a full ClickHouse 24.3 service (with persistent volume and
  healthcheck) to the on-prem compose; the multi-plane data-plane service now
  inherits `*common-env` so it receives `CLICKHOUSE_URL` automatically.
- **Env files:** `.env.ecs.example`, `.env.example`, `.env.onprem.example`,
  and `.env.multi-plane.example` swapped `OPENSEARCH_*` for `CLICKHOUSE_*`.

### 3. Documentation

- Replaced legacy operational examples (ISM policies, `_cluster/health`,
  `_cat/shards`, JVM heap, UltraWarm, master-election) with their
  ClickHouse equivalents (TTL + `storage_policy`, `system.replicas`,
  `system.clusters`, S3 cold tier, replica failover) across
  `ARCHITECTURE.md`, `ARCHITECTURE.microservices.md`, `DEPLOYMENT.md`,
  `AWS_DEPLOYMENT_GUIDE.md`, and `deploy/docs/*`.
- Renamed mermaid graph nodes (`OS`/`OS1`/`OS2`/`DP_OS`/`OSI` →
  `CH`/`CH1`/`CH2`/`DP_CH`/`CHW`) and corrected stale references
  (`04-clickhouse.yml` → `08-clickhouse-cluster.yml`, "3 master + warm"
  sizing → "shards × replicas + ZK").
- Updated the starter-stack README cost narrative to describe the
  single-node ClickHouse OLAP footprint instead of a side-by-side comparison.

## Migration Instructions for Existing Stacks

For deployments that already have data in the legacy `security_events` table,
backfill the enriched columns and recreate the materialized view once:

```sql
ALTER TABLE ccc.security_events
  ADD COLUMN IF NOT EXISTS source_type LowCardinality(String),
  ADD COLUMN IF NOT EXISTS host String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS src_ip String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS dst_ip String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS user_name String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS process_name String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS kill_chain_phase LowCardinality(String),
  ADD COLUMN IF NOT EXISTS confidence_score UInt8 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_region LowCardinality(String),
  ADD COLUMN IF NOT EXISTS raw_event String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS normalized_event String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS iocs String CODEC(ZSTD(3)),
  ADD COLUMN IF NOT EXISTS ingested_at DateTime64(3) DEFAULT now64(3);

DROP TABLE IF EXISTS ccc.security_events_hourly_stats;

CREATE MATERIALIZED VIEW ccc.security_events_hourly_stats
ENGINE = AggregatingMergeTree()
PARTITION BY (tenant_id, toYYYYMM(hour))
ORDER BY (tenant_id, hour, severity, event_type, source_type)
AS SELECT
  tenant_id,
  toStartOfHour(occurred_at) AS hour,
  severity,
  event_type,
  source_type,
  countState() AS cnt,
  sumState(risk_score) AS total_risk_score_state,
  uniqExactState(event_id) AS unique_events_state
FROM ccc.security_events
GROUP BY tenant_id, hour, severity, event_type, source_type;
```

`ALTER TABLE ... UPDATE` runs asynchronously in ClickHouse; monitor
`system.mutations` for completion on large tables.

## Verification Checklist

- [ ] `aws cloudformation deploy ... 06-management-ecs.yml` succeeds with
      `ClickHouseStackName=ccc-clickhouse` and the management task definition
      shows `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_DATABASE`, and
      the `CLICKHOUSE_PASSWORD` secret reference.
- [ ] `docker compose -f docker-compose.onprem.yml up` starts the bundled
      ClickHouse 24.3 service and `clickhouse-client --query "SELECT 1"`
      returns `1`.
- [ ] `docker compose -f docker-compose.multi-plane.yml config` shows
      `CLICKHOUSE_URL` on both `management-plane` and `data-plane` services.
- [ ] Platform Health page renders the **ClickHouse** tile per region with
      live status (no legacy hot-search field anywhere).
- [ ] `grep -ri opensearch deploy/ services/ server/ client/ shared/` returns
      no matches in active runtime/deploy paths.

## Cost Impact

Removing the parallel hot-search engine reduces the starter-stack monthly
cost (single-node OLAP footprint replaces a managed search domain) and
simplifies the multi-plane bill of materials to one OLAP cluster per region.

## Breaking Changes

None for end users. Dashboards, the event console, SOC KPIs, IOC
correlations, and confidence scoring continue to behave identically — they
already read from ClickHouse.
