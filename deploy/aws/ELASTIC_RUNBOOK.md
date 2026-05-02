# CyInsight Elastic Tier — Operator Runbook

**Region:** `ap-south-1` (Mumbai) by default — works in any 3-AZ region.
**Goal:** Pay-as-you-use infrastructure that scales from 1-tenant pilot
(~$300-500/mo) to full Hyperscale (500 tenants, 5M EPS, ~$180K/mo) without
ever being torn down or redesigned. Same VPC, same DNS, same secrets, same
code, same task definitions across all four tiers.

---

## §1. The four tiers at a glance

| Tier         | Tenants | Events/day | Monthly bill (USD)     | Aurora MaxACU | NAT GWs | ClickHouse                | Data plane |
| ------------ | ------- | ---------- | ---------------------- | ------------- | ------- | ------------------------- | ---------- |
| **pilot**    | 1–5     | 1–10 GB    | **~$300–500**          | 16            | 1       | OFF (Athena/S3 only)      | OFF        |
| **growth**   | 20–50   | 50–100 GB  | **~$2,500–3,500**      | 32            | 1 or 3  | 3 × `r6i.large` (~$330)   | ON         |
| **midtier**  | 100–200 | 500 GB     | **~$8,000–12,000**     | 64            | 3       | 3 × `r6i.2xlarge`         | ON         |
| **hyperscale** | 500   | 5M EPS / 5 TB | **~$180,000–220,000** | 256          | 3       | 3 × `i4i.8xlarge`         | ON (60–600 tasks) |

Going from one tier to the next is a single `aws cloudformation update-stack`
call with a different `TenantTier` parameter. **No data migration, no DNS
change, no secret rotation, no code change.**

---

## §2. What changes between tiers (the only knobs that move)

| Knob                           | pilot            | growth            | midtier          | hyperscale          |
| ------------------------------ | ---------------- | ----------------- | ---------------- | ------------------- |
| Aurora `MaxACU`                | 16               | 32                | 64               | 256                 |
| Aurora reader instances        | 0 (writer only)  | 1                 | 1                | 2                   |
| Redis `ECPUPerSecond` cap      | 5,000            | 15,000            | 50,000           | 200,000             |
| WAF per-IP rate limit          | 2,000 / 5min     | 5,000             | 10,000           | 20,000              |
| Mgmt ECS `MinCount`/`MaxCount` | 2 / 10           | 3 / 20            | 5 / 30           | 10 / 40             |
| Data ECS `MinCount`/`MaxCount` | 2 / 10 (or off)  | 3 / 30            | 10 / 60          | 60 / 600            |
| ClickHouse instance            | OFF              | r6i.large         | r6i.2xlarge      | i4i.8xlarge         |
| `HYPERSCALE_PROFILE` env var   | false            | false             | false            | **true**            |
| Kinesis stream mode            | ON_DEMAND        | ON_DEMAND         | ON_DEMAND        | ON_DEMAND           |

Everything else — VPC CIDR, subnet IDs, ALB DNS, S3 bucket names, Aurora
cluster identifier, Kinesis stream names, secret ARNs, Glue/Athena workgroup
names — **stays identical across all tiers.**

---

## §3. Cost breakdown — pilot tier (single-AZ, no ClickHouse)

Indicative monthly bill in `ap-south-1`, on-demand list prices, May 2026:

| Component                                      | Monthly (USD) |
| ---------------------------------------------- | ------------- |
| ECS Fargate — 2 mgmt tasks × 1 vCPU/2 GB       | ~$70          |
| Aurora Serverless v2 — 0.5 ACU baseline (writer) | ~$45         |
| RDS Proxy                                      | ~$20          |
| ElastiCache Serverless Redis (1 GB, low ECPU)  | ~$13          |
| Kinesis Data Streams on-demand (10 GB/day)     | ~$25          |
| S3 (raw + processed + archive at 10 GB/day)    | ~$5           |
| Athena (light query usage)                     | ~$5           |
| ALB                                            | ~$22          |
| NAT Gateway × 1                                | ~$35          |
| Data transfer (egress)                         | ~$10          |
| WAFv2 (managed rules + rate limit)             | ~$6           |
| Secrets Manager (3 secrets)                    | ~$1.20        |
| CloudWatch (logs + alarms)                     | ~$10          |
| **Total**                                      | **~$267 + variable** |

Realistic with light interactive usage: **~$300–500/mo**.

---

## §4. Pre-flight checklist (one-time per region)

1. **AWS account access** with permissions for: CloudFormation, EC2, VPC,
   RDS, ElastiCache, Kinesis, S3, Glue, Athena, ELB, WAFv2, Secrets Manager,
   IAM, ECS, ECR, SSM.
2. **ACM certificate** for `${DomainName}` issued in `ap-south-1`.
3. **DNS zone** ready to point a CNAME/ALIAS at the substrate's
   `AlbDnsName` output.
4. **PostgreSQL TLS:** the substrate forces `RequireTLS=true` on RDS Proxy
   and the generated `DATABASE_URL` uses `sslmode=require`. The Node `pg`
   client trusts AWS's RDS root certificate by default in `ap-south-1`; no
   extra CA bundle is required for `sslmode=require`. Switch to
   `sslmode=verify-full` if your compliance regime demands hostname
   verification (requires bundling `rds-ca-rsa2048-g1.pem` in the image).
5. **ECR repository** with the application image (push from your CI/CD or via
   `docker buildx build --platform linux/amd64 --push -t <ECR_URI>:latest .`).
6. **Service quotas** — pilot tier requires almost no quota raises. Default
   limits are sufficient for ECS Fargate (1,000 vCPUs), Aurora Serverless v2
   (90 ACU), and Kinesis on-demand (5 streams × 200 MB/s).
   - For **hyperscale** later: raise Fargate vCPUs to 8,000+, ENIs to 6,500+,
     Kinesis on-demand throughput to 200 MB/s × 5 streams.
7. **EC2 key pair** (optional; only needed if you enable ClickHouse and want
   SSH access — SSM Session Manager works without it).

---

## §5. Deploy — pilot tier (~15 min)

```bash
export AWS_REGION=ap-south-1
export DOMAIN_NAME=app.example.com
export CERTIFICATE_ARN=arn:aws:acm:ap-south-1:ACCOUNT:certificate/ID
export IMAGE_URI=ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest

# Pilot defaults: TENANT_TIER=pilot, HIGH_AVAILABILITY=false,
# ENABLE_CLICKHOUSE=false, ENABLE_DATA_PLANE=false
./deploy/aws/scripts/deploy-elastic.sh
```

**Smoke test:**
```bash
# 1. ALB health
curl -sf https://app.example.com/api/health

# 2. Aurora is up + RDS Proxy reachable
aws rds describe-db-clusters --region ap-south-1 \
  --db-cluster-identifier cyinsight-elastic-aurora \
  --query 'DBClusters[0].Status'

# 3. Kinesis on-demand mode + zero shard provisioning
aws kinesis describe-stream-summary --region ap-south-1 \
  --stream-name cyinsight-elastic-events-raw \
  --query 'StreamDescriptionSummary.[StreamModeDetails.StreamMode,OpenShardCount]'

# 4. Redis Serverless reachable from an ECS task
aws ecs execute-command --region ap-south-1 \
  --cluster ccc-management-elastic --task <TASK_ARN> \
  --command "redis-cli -h <REDIS_ENDPOINT> --tls ping"
```

---

## §6. Tier upgrade — pilot → growth (no downtime)

Run the same script with the new tier knobs. The substrate stack-update is
non-destructive: Aurora MaxACU lifts from 16→32 online, Redis cap lifts,
WAF rate limit lifts. ClickHouse and data plane stacks are created fresh.

```bash
export TENANT_TIER=growth
export HIGH_AVAILABILITY=true     # add NAT GW in AZ2 + AZ3, Aurora reader
export ENABLE_CLICKHOUSE=true     # 3-node r6i.large cluster
export ENABLE_DATA_PLANE=true     # dedicate ECS to ingest

./deploy/aws/scripts/deploy-elastic.sh
```

What CloudFormation does:

1. **Substrate update** (in-place, ~5 min): Aurora MaxACU 16→32, ServerlessV2
   tracks the change online; adds Aurora reader in AZ2; adds NAT GWs in
   AZ2/AZ3, switches private route tables to per-AZ NAT; widens WAF rate
   limit. **Zero downtime.**
2. **ClickHouse stack create** (~30 min): 3 × r6i.large EC2 with Keeper
   quorum, hot disk, S3 tiered storage. Mgmt + data tasks pick up the
   `CLICKHOUSE_URL` env var on next deploy.
3. **Data plane stack create** (~10 min): dedicated ECS service for ingest.
4. **Mgmt plane stack update** (~5 min): rolling restart with the new
   `CLICKHOUSE_URL` and bumped task CPU/memory.

---

## §7. Tier upgrade — growth → midtier → hyperscale

Same procedure. The hyperscale jump is the only one that flips
`HYPERSCALE_PROFILE=true` in the task env, which boots `server/hyperscale-profile.ts`
overrides (DB pool 200, async insert, Kinesis batch 500, RSS 4GB cap).

For hyperscale, **request the AWS service quota raises in §4 step 5 at least
14 days before the cutover** — Fargate and Kinesis quota requests routinely
take 7–10 business days.

ClickHouse instance type swap (r6i.large → i4i.8xlarge) is **operator-driven**,
not automatic. The 08 template's ASG does not have an Instance Refresh policy
attached, so a CFN update that changes `InstanceType` updates the launch
template but **does not replace running nodes**. Procedure:

1. Run the deploy script with the new tier (CFN updates the launch template).
2. Manually trigger an ASG instance refresh, one AZ at a time, with min healthy
   percentage = 67% so the Keeper quorum (2 of 3 nodes) is preserved:
   ```
   aws autoscaling start-instance-refresh \
     --auto-scaling-group-name <CH_ASG_NAME> \
     --preferences MinHealthyPercentage=67,InstanceWarmup=600
   ```
3. Wait for `aws autoscaling describe-instance-refreshes ... --query 'InstanceRefreshes[0].Status'`
   to reach `Successful` before starting the next AZ.
4. Plan ~30–60 min per node for the refresh + ClickHouse rebalance.

For the hyperscale jump specifically (3 → 9 nodes at i4i.8xlarge), this is a
multi-day operation — schedule it across a maintenance window.

---

## §8. Operating tips

- **Aurora ACU monitoring**: the substrate ships a CloudWatch alarm
  `cyinsight-${env}-aurora-acu-high` that fires when usage hits the tier's
  MaxACU. If it fires repeatedly, that's the signal to bump the tier.
- **Kinesis lag**: alarm `cyinsight-${env}-kinesis-raw-lag` fires when iterator
  age exceeds 60s. On-demand mode auto-shards, but if you see persistent lag,
  scale up data-plane ECS tasks (data plane tier knob).
- **Cost monitoring**: tag all stacks with `Project=CyberCommandCenter` and
  use AWS Cost Explorer's Project tag filter for daily spend tracking.
- **Pilot → no ClickHouse → analytics**: dashboard analytics queries that
  would normally hit ClickHouse fall through to Athena/S3. Slower (multi-second
  latency vs. sub-second) but $0 idle cost. App code already handles this
  fallback via the read-replica router (`server/replica-router.ts`).

---

## §9. Tier-down (cost rollback)

Going hyperscale → midtier or midtier → pilot is also non-destructive but
takes longer because Aurora Serverless v2 takes time to release ACU after
a downscale. Steps:

1. Run the deploy script with the lower `TENANT_TIER`.
2. Aurora MaxACU drops immediately; actual ACU usage settles within ~15 min.
3. ECS task counts drop on next autoscaling evaluation (~5 min).
4. Optional: tear down the ClickHouse stack to release ~$330+/mo if you want
   to revert to Athena/S3 analytics. **Warning: this is destructive — all hot
   OLAP data is lost.** Re-ingestion from S3 raw events is possible but slow.

---

## §10. Teardown (full)

```bash
./deploy/aws/scripts/deploy-elastic.sh --teardown
```

Order: data plane → mgmt → ClickHouse → substrate. Aurora snapshot is taken
on cluster delete (`DeletionPolicy: Snapshot`). S3 buckets retain their
contents (`DeletionPolicy: Retain`) — manually empty + delete if you want
the storage gone. NAT GW EIPs are released automatically.
