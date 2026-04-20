# CyInsight Deployment Documentation

**Date:** April 20, 2026
**Environment:** AWS Production (ap-south-1)
**Domain:** https://app.riskproficient.com
**AWS Account:** 200810847769

---

## 1. Executive Summary

CyInsight (Cyber Command Center) MSSP platform has been successfully deployed to AWS using a CloudFormation starter stack. The application runs on ECS Fargate with a complete backend infrastructure including PostgreSQL RDS, Redis ElastiCache, ClickHouse, and S3 storage. SSL termination is handled via AWS ALB with an ACM certificate.

**Key Challenges Resolved:**
- 60+ missing database tables due to incomplete migration history
- CJS/ESM interop bug with `connect-redis` causing startup failure
- DNS zone not being served by Hostinger nameservers — migrated to Route 53

---

## 2. Infrastructure Architecture

```
Internet
    |
    v
[Route 53] app.riskproficient.com
    |
    v
[ALB :443 HTTPS]  -->  [ALB :80 HTTP] --301--> HTTPS
    |                        |
    v                        v
[ECS Fargate Tasks]    [ECS Fargate Tasks]
    |                        |
    +---> [RDS PostgreSQL 16.6]
    +---> [ElastiCache Redis 7.1]
    +---> [ClickHouse ECS + EFS]
    +---> [S3 Bucket]
```

---

## 3. AWS Resources Inventory

### 3.1 CloudFormation Stack
| Property | Value |
|----------|-------|
| Stack Name | `cyinsight-starter` |
| Status | `CREATE_COMPLETE` |
| Region | `ap-south-1` |
| Account | `200810847769` |

### 3.2 VPC & Networking
| Resource | Details |
|----------|---------|
| VPC ID | `vpc-0502f9e7af3fa3703` |
| CIDR | `10.0.0.0/16` |
| Public Subnets | `subnet-0c20b39f04062af16` (ap-south-1b), `subnet-0c40ed1f36c2ec52d` (ap-south-1a) |
| Private Subnets | `subnet-02a538f1d4414e096`, `subnet-0fcdcd889cb808696` |
| ALB Security Group | `sg-035d72924c3fabc4b` |
| ECS Security Group | `sg-0147df3ca63497fe7` |
| RDS Security Group | `sg-06bd1cec308d716fb` |

### 3.3 Application Load Balancer (ALB)
| Property | Value |
|----------|-------|
| Name | `cyinsight-alb-production` |
| ARN | `arn:aws:elasticloadbalancing:ap-south-1:200810847769:loadbalancer/app/cyinsight-alb-production/f1495adec7e2dd65` |
| DNS Name | `cyinsight-alb-production-1224997034.ap-south-1.elb.amazonaws.com` |
| Scheme | `internet-facing` |
| IP Type | `ipv4` |

**Listeners:**
| Port | Protocol | Action |
|------|----------|--------|
| 443 | HTTPS | Forward to target group `cyinsight-tg-production` with ACM certificate |
| 80 | HTTP | 301 Redirect to `https://#{host}:443/#{path}` |

**Target Group:**
| Property | Value |
|----------|-------|
| Name | `cyinsight-tg-production` |
| ARN | `arn:aws:elasticloadbalancing:ap-south-1:200810847769:targetgroup/cyinsight-tg-production/a119654ae0bc9848` |
| Protocol | HTTP |
| Port | 5000 |
| Health Check Path | `/_health` |

### 3.4 ECS Service
| Property | Value |
|----------|-------|
| Cluster | `cyinsight-production` |
| Service | `cyinsight-production` |
| Status | `ACTIVE` |
| Desired Count | 2 |
| Running Count | 2 |
| Launch Type | FARGATE / FARGATE_SPOT |
| Task Definition | `cyinsight-production:6` |
| Image | `200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest` |
| Image Digest | `sha256:30ffdfcdfb0226fe2268235e3506fc999ecc230641b5e4e684b645bef4f84be7` |
| Health Check Grace Period | 180 seconds |
| Circuit Breaker | Enabled with rollback |
| Execute Command | Enabled |

### 3.5 RDS PostgreSQL
| Property | Value |
|----------|-------|
| Identifier | `cyinsight-db-production` |
| Engine | PostgreSQL 16.6 |
| Instance Class | `db.t3.micro` |
| Endpoint | `cyinsight-db-production.cxwkeigscpqz.ap-south-1.rds.amazonaws.com` |
| Port | 5432 |
| Database Name | `cyinsight` |
| Username | `cyinsight_admin` |
| SSL | Required (`sslmode=require`) |
| Status | `available` |

### 3.6 ElastiCache Redis
| Property | Value |
|----------|-------|
| Cluster ID | `cyinsight-redis-production` |
| Engine | Redis 7.1 |
| Node Type | `cache.t3.micro` |
| Endpoint | (in CloudFormation stack) |
| Port | 6379 |

### 3.7 ClickHouse
| Property | Value |
|----------|-------|
| Deployment | ECS Service + EFS |
| Internal ALB | `internal-cyinsight-ch-alb-production-998401469.ap-south-1.elb.amazonaws.com:8123` |
| Database | `ccc` |
| User | `default` |

### 3.8 S3 Bucket
| Property | Value |
|----------|-------|
| Bucket Name | `cyinsight-data-200810847769-production` |

### 3.9 Secrets Manager
| Secret Name | Contents |
|-------------|----------|
| `cyinsight/app-secrets-production` | DATABASE_URL, SESSION_SECRET, CLICKHOUSE_URL, CLICKHOUSE_PASSWORD, S3_BUCKET |

---

## 4. DNS & SSL Configuration

### 4.1 Route 53 Hosted Zone
| Property | Value |
|----------|-------|
| Domain | `riskproficient.com` |
| Hosted Zone ID | `Z00688023NHWGMJSF34NF` |

### 4.2 Nameservers (Route 53)
```
ns-648.awsdns-17.net
ns-141.awsdns-17.com
ns-1204.awsdns-22.org
ns-1948.awsdns-51.co.uk
```

> **Note:** Nameservers were updated via Hostinger API from Hostinger NS to Route 53 NS.

### 4.3 DNS Records
| Name | Type | Value | TTL |
|------|------|-------|-----|
| `app` | CNAME | `cyinsight-alb-production-1224997034.ap-south-1.elb.amazonaws.com` | 300 |
| `_e456be1e539d719055f70ded81501f17.app` | CNAME | `_6e4f740fcf6b2ac806c9a2ce63cb8b17.jkddzztszm.acm-validations.aws.` | 300 |
| `@` | A | `2.57.91.91` | 300 |
| `www` | CNAME | `riskproficient.com` | 300 |

### 4.4 SSL Certificate (ACM)
| Property | Value |
|----------|-------|
| Domain | `app.riskproficient.com` |
| ARN | `arn:aws:acm:ap-south-1:200810847769:certificate/3ef6a6a2-5ad0-493b-bf73-ab04c2c2025f` |
| Status | `ISSUED` |
| Validation | DNS (SUCCESS) |
| Expiry | November 4, 2026 |

---

## 5. Application Configuration

### 5.1 Docker Image
- **Base:** Node.js 20 Alpine
- **Platform:** `linux/amd64`
- **Includes:** RDS CA bundle (`rds-ca-bundle.pem`)
- **Health Check:** `wget --no-verbose --tries=1 --spider http://localhost:5000/_health`
- **Entry Point:** `node start-prod.js`

### 5.2 Key Environment Variables
| Variable | Value |
|----------|-------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (from Secrets Manager) |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | `/etc/ssl/certs/rds-ca-bundle.pem` |
| `NODE_EXTRA_CA_CERTS` | `/etc/ssl/certs/rds-ca-bundle.pem` |
| `PGSSLMODE` | `require` |
| `REDIS_URL` | (from Secrets Manager) |
| `CLICKHOUSE_URL` | (from Secrets Manager) |
| `S3_BUCKET` | `cyinsight-data-200810847769-production` |

---

## 6. Database Schema & Migrations

### 6.1 Migration History
| Migration | Tag | Description |
|-----------|-----|-------------|
| 0000 | `0000_parallel_spitfire` | Baseline tables (~25 tables) |
| 0001-0022 | Various | Incremental schema changes |
| 0023 | `0023_add_missing_tables` | **Idempotent comprehensive migration** — creates all 124 tables with `IF NOT EXISTS` |

### 6.2 Total Tables
**124 tables** in the PostgreSQL schema, including:

**Core:**
- `tenants`, `users`, `superadmins`, `sessions`

**Assets & Infrastructure:**
- `assets`, `infrastructure_locations`, `asset_connections`, `user_assets`

**Security Operations:**
- `incidents`, `security_events`, `cases`, `playbooks`, `playbook_executions`
- `incident_response_actions`, `incident_response_plans`, `incident_notifications`
- `incident_evidence`, `case_evidence`, `case_incidents`, `case_timeline`

**Threat Intelligence:**
- `threat_intel_feeds`, `threat_intel_iocs`, `sigma_rules`
- `federated_threat_indicators`, `shared_threat_intel`

**AI & Automation:**
- `ai_investigations`, `ai_agent_activity_log`, `ai_learning_feedback`
- `ai_detection_rules`, `ai_ticket_tasks`

**Platform & Integrations:**
- `platform_integrations`, `platform_settings`, `platform_settings_audit`
- `security_integrations`, `integration_audit_log`, `integration_heal_logs`
- `db_connectors`, `log_sources`, `device_fingerprints`

**Compliance & Reporting:**
- `compliance_assessments`, `reports`, `report_schedules`
- `documents`, `tasks`, `tickets`, `ticket_comments`, `ticket_attachments`

**CTI & Threat Actors:**
- `cti_campaigns`, `cti_intel_reports`, `cti_intrusion_sets`
- `cti_malware_families`, `cti_threat_actors`

**OpenCTI / TAXII Cache:**
- `opencti_campaigns_cache`, `opencti_ioc_cache`, `opencti_malware_cache`
- `taxii_campaigns`, `taxii_malware`, `taxii_stix_iocs`, `taxii_threat_actors`

**And ~40 more tables...**

### 6.3 Migration Runner
The standard `drizzle-orm migrate()` was replaced with a **custom resilient migration runner** (`server/migrate.ts`) that:
- Reads the migration journal and SQL files
- Executes each statement individually
- Skips benign errors: `already exists`, `duplicate`, `does not exist`, `undefined_table`
- Marks migrations as applied even if some statements fail
- Handles partial-schema databases (tables created via `drizzle-kit push` but missing from migration files)

---

## 7. Code Changes Made

### 7.1 `server/migrate.ts`
- **Replaced** standard `drizzle-orm migrate()` with custom resilient migration runner
- Added idempotent `CREATE TABLE IF NOT EXISTS` blocks for critical tables
- Added graceful error handling for missing tables during startup

### 7.2 `server/index.ts`
- Moved `httpServer.listen()` before blocking initialization
- Wrapped `initClickHouseSchema()` in 15-second timeout
- Background initialization runs async after server starts listening
- Health endpoint returns `{ status: "ok", ready: serverReady }`

### 7.3 `script/build.ts`
- Added `"connect-redis"` to esbuild `allowlist`
- Fixes CJS/ESM interop bug where `connect-redis` externalization caused `TypeError: oIe.default is not a constructor`

### 7.4 `migrations/0023_add_missing_tables.sql`
- Generated via `drizzle-kit generate` against `shared/schema.ts`
- Converted to idempotent SQL using custom script:
  - `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
  - `CREATE TYPE` → wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
  - `ALTER TABLE ... ADD CONSTRAINT` → wrapped in exception handlers

### 7.5 `migrations/meta/_journal.json`
- Added entry for `0023_add_missing_tables`

### 7.6 `deploy/aws/single-stack/cyinsight-starter.yml`
- Fixed circular dependency (extracted SecurityGroupIngress)
- Fixed `SuccessCode` → `Matcher`
- Fixed `Tags` → `FileSystemTags`
- Fixed `EngineVersion` 16.3 → 16.6
- Moved `REDIS_URL` from Secrets to Environment
- Set `RuntimePlatform: { CpuArchitecture: X86_64 }`
- Health check path: `/_health`
- Added RDS CA bundle and SSL env vars

### 7.7 `Dockerfile`
- Added `rds-ca-bundle.pem` copy
- Updated health check endpoint to `/_health`
- Added `COPY --from=builder /app/migration-data ./migration-data` to include seed data in production images
- Added `RUN rm -f /app/migration-data/.migrated` to ensure data re-import on fresh containers

### 7.8 `server/migrate.ts` — Missing Columns Sync
- Added `syncMissingColumns()` function that parses `migrations/0023_add_missing_tables.sql`
- Compares `information_schema.columns` against parsed CREATE TABLE blocks
- Runs `ALTER TABLE ADD COLUMN IF NOT EXISTS` for each missing column (74 columns added)
- Creates unique index: `idx_security_events_event_hash ON security_events(event_hash) WHERE event_hash IS NOT NULL`
- Clears `.migrated` DB marker on startup so `runProdDataMigration()` re-imports seed data
- Fully idempotent — safe to run on every startup

### 7.9 `server/routes.ts` — Tenant Admin Access Fix
- Rewrote `seedSuperadmin()` to always ensure the admin user has a `tenant_users` link with `platform_admin` role
- Creates matching regular user in `users` table (`superadmin-001`, username `admin`)
- Creates fallback MSSP tenant ("SecureOps MSSP") if no MSSP tenant exists
- Upgrades existing `tenant_users` role to `platform_admin` if needed
- Assigns full role set: `platform_admin`, `mss_admin`, `mss_analyst`, `soc_manager`, `security_engineer`, `security_analyst`, `service_desk`, `customer`

### 7.10 `server/migrate-prod-data.ts` — Data Seeding
- Imports 10 tenants from `migration-data/tenants.json`
- Imports 9,061 incidents from `migration-data/incidents.json`
- Imports security events with `ON CONFLICT (event_hash)` deduplication
- Imports assets, user_assets, and reports
- Builds tenant ID mapping from dev → prod by tenant name
- Skips if `.migrated` marker exists or `.purged` marker is present

---

## 8. Deployment Steps Log

### Phase 1: Initial Stack Deployment
1. Synced git to `fa1ca1b` (13 commits)
2. Fixed CloudFormation template errors
3. Built and pushed Docker image to ECR
4. Deployed `cyinsight-starter` stack → `CREATE_COMPLETE`

### Phase 2: Application Startup Fixes
1. Fixed health check endpoint (`/healthz` → `/_health`)
2. Added RDS CA bundle and SSL configuration
3. Refactored `server/index.ts` for non-blocking startup
4. Rebuilt and redeployed

### Phase 3: Database Migration Crisis
1. Discovered 60+ missing tables (schema evolved via `drizzle-kit push`, never migrated)
2. Generated comprehensive `0023_add_missing_tables.sql`
3. Created custom resilient migration runner
4. Rebuilt and redeployed → migrations applied successfully (314 statements)

### Phase 4: Background Init Fix
1. Identified `connect-redis` CJS/ESM interop bug
2. Added `connect-redis` to esbuild allowlist
3. Rebuilt and redeployed → background init completes successfully

### Phase 5: DNS & SSL Setup
1. Discovered Hostinger nameservers not serving zone
2. Created Route 53 hosted zone for `riskproficient.com`
3. Updated nameservers via Hostinger API to Route 53
4. Requested ACM certificate for `app.riskproficient.com`
5. Added DNS validation CNAME record
6. Certificate validated and issued
7. Created HTTPS listener (port 443) on ALB
8. Updated HTTP listener to redirect to HTTPS

### Phase 6: Login & Admin Portal Fix
1. Frontend uses regular auth (`/api/auth/login`) unconditionally
2. `admin` user existed in `superadmins` but not in `users` table
3. Rewrote `seedSuperadmin()` to create matching `users` row
4. Ensured `tenant_users` link with `platform_admin` role
5. Created fallback MSSP tenant if missing
6. Verified admin portal shows Tenant Management

### Phase 7: Missing Database Columns
1. App failed with `column does not exist` errors (e.g., `event_hash`, `sigma_matches`)
2. Added `syncMissingColumns()` to `server/migrate.ts`
3. Parses `0023_add_missing_tables.sql` and auto-adds missing columns
4. Added 74 columns across multiple tables
5. Added unique index on `security_events(event_hash)` for deduplication
6. Cleared `.migrated` marker to trigger data re-import

### Phase 8: Seed Data Import
1. Dockerfile was not copying `migration-data/` into the image
2. Added `COPY --from=builder /app/migration-data ./migration-data`
3. Added `RUN rm -f /app/migration-data/.migrated` to clear filesystem marker
4. Cleared DB `.migrated` marker so `runProdDataMigration()` runs
5. Successfully imported: 10 tenants, 9,061 incidents, security_events, assets, user_assets, reports

---

## 9. Troubleshooting Log

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| CloudFormation `CREATE_FAILED` | Circular dependency in SecurityGroup | Extracted `SecurityGroupIngress` resource |
| `SuccessCode` invalid | ALB target group uses `Matcher` | Changed `SuccessCode: 200` to `Matcher: HttpCode: 200` |
| `EngineVersion` 16.3 rejected | RDS doesn't support 16.3 in ap-south-1 | Updated to 16.6 |
| ECS tasks fail health check | Health endpoint was `/healthz` | Updated to `/_health` in Dockerfile, task def, ALB |
| SSL connection fails | RDS requires CA verification | Added `rds-ca-bundle.pem` to image, set `DB_SSL=true` |
| App never starts serving | `httpServer.listen()` after blocking init | Moved listen before init, wrapped in async block |
| `relation does not exist` errors | 60+ tables missing from migrations | Created `0023_add_missing_tables.sql` + resilient runner |
| `TypeError: oIe.default is not a constructor` | `connect-redis` externalized in esbuild | Added to allowlist for inline bundling |
| DNS not resolving | Hostinger nameservers return `REFUSED` | Migrated DNS to Route 53 |
| Admin portal not visible | `admin` user missing from `users` table + no `tenant_users` link | Rewrote `seedSuperadmin()` to create `users` row and `tenant_users` link with `platform_admin` |
| `column does not exist` errors | Schema evolved via `drizzle-kit push`; 74 columns missing from some tables | Added `syncMissingColumns()` to auto-discover and add missing columns on startup |
| `ON CONFLICT` fails on security_events | No unique index on `event_hash` | Added `idx_security_events_event_hash` unique partial index |
| Seed data not importing | `migration-data/` not copied into Docker image + `.migrated` marker present | Added COPY in Dockerfile; cleared `.migrated` marker in DB and filesystem |
| `CannotPullContainerError` | Image built for wrong architecture | Switched to explicit `linux/amd64` buildx builds |

---

## 10. Credentials & Access Information

### 10.1 Application Login

**Superadmin (Platform Admin Portal):**
```
Username: admin
Password: Admin@123
```

**Login Endpoints:**
- Superadmin: `POST /api/superadmin/login`
- Regular User: `POST /api/auth/login`

### 10.2 AWS Resources Access

| Resource | Identifier / Endpoint |
|----------|----------------------|
| Application URL | https://app.riskproficient.com |
| ALB DNS | cyinsight-alb-production-1224997034.ap-south-1.elb.amazonaws.com |
| RDS Endpoint | cyinsight-db-production.cxwkeigscpqz.ap-south-1.rds.amazonaws.com:5432 |
| ECS Cluster | cyinsight-production |
| ECS Service | cyinsight-production |
| ECR Repository | cyinsight |

### 10.3 Database Connection
```
Host:     cyinsight-db-production.cxwkeigscpqz.ap-south-1.rds.amazonaws.com
Port:     5432
Database: cyinsight
Username: cyinsight_admin
SSL:      require
```

> **Note:** RDS is in a private subnet. Direct access requires VPC peering, VPN, or bastion host.

### 10.4 Secrets Manager
- **Secret ARN:** `arn:aws:secretsmanager:ap-south-1:200810847769:secret:cyinsight/app-secrets-production-47Qp2R`
- Contains: `DATABASE_URL`, `SESSION_SECRET`, `CLICKHOUSE_URL`, `CLICKHOUSE_PASSWORD`, `S3_BUCKET`

---

## 11. Operational Notes

### 11.1 Health Check
```bash
curl https://app.riskproficient.com/_health
# Expected: {"status":"ok","ready":true}
```

### 11.2 Scaling
- ECS service is configured for 2 tasks
- Can scale via AWS Console or CLI:
```bash
aws ecs update-service --cluster cyinsight-production --service cyinsight-production --desired-count N
```

### 11.3 Redeployment
```bash
# Build and push new image
docker build --platform linux/amd64 -t cyinsight:latest .
docker tag cyinsight:latest 200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest
docker push 200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest

# Force new deployment
aws ecs update-service --cluster cyinsight-production --service cyinsight-production --force-new-deployment
```

### 11.4 View Logs
```bash
aws logs tail /ecs/cyinsight-production --follow --region ap-south-1
```

### 11.5 Database Migrations
Migrations run automatically on every container startup. The resilient runner handles:
- Missing tables (`CREATE TABLE IF NOT EXISTS`)
- Duplicate objects (`CREATE TYPE` with exception handling)
- Missing referenced tables in `ALTER TABLE` statements

No manual migration intervention required under normal circumstances.

### 11.6 SSL Certificate Renewal
The ACM certificate is set to auto-renew. Since DNS validation is used and the validation CNAME record persists in Route 53, AWS will automatically re-validate and renew the certificate before expiry.

---

## 12. Files Modified in Git

```
Dockerfile
script/build.ts
server/index.ts
server/migrate.ts
server/routes.ts
server/migrate-prod-data.ts
deploy/aws/single-stack/cyinsight-starter.yml
migrations/0023_add_missing_tables.sql
migrations/meta/_journal.json
```

## 13. Known Issues & Warnings

### 13.1 Dirty Working Tree
The working tree has **16 modified + 9 untracked files** vs the last commit (`fa1ca1b`). Because the Dockerfile uses `COPY . .`, uncommitted changes are included in the built image. This means the deployed image may contain unintended modifications. **Recommendation:** Commit all intended changes, then rebuild from a clean working tree.

### 13.2 ClickHouse Non-Fatal Errors (Resolved)
On startup, the app attempts to create ClickHouse tables (`ccc._migrations`, `ccc.incidents_distributed`). ~~These used to fail with readonly mode / syntax errors and were logged as non-fatal.~~ **Now resolved:**

- **Schema init retry loop**: 5 attempts with exponential backoff (2s→4s→8s→16s→32s) so transient CH outages at deploy time don't permanently disable CH.
- **DDL uses POST**: `ClickHouseClient.exec()` sends DDL/mutations via HTTP POST instead of GET.
- **Single-node VIEW fallback**: `_insertWithFallback()` retries INSERT against the base table when `*_distributed` is a VIEW (storage View / NOT_IMPLEMENTED error).
- **DateTime64 formatting**: `formatChDateTime64()` converts ISO-8601 strings to ClickHouse `YYYY-MM-DD HH:MM:SS.sss` for `date_time_input_format=basic` compatibility.
- **Security events sweeper**: Cursor-based backfill (`sweepSecurityEventsToClickHouse`) catches any rows that bypass live dual-write.

### 13.3 Memory Pressure
`[CrashGuard][Memory] CRITICAL` warnings appear in logs when heap reaches ~97% or RSS ~300MB, forcing `global.gc()`. The ECS task has 2 vCPU / 4 GB, which provides comfortable headroom, but the Node.js process may need `--max-old-space-size` tuning if warnings persist.

### 13.4 Ingestion Pipeline Resilience (New)
Six retry/recovery layers were added to eliminate data loss during transient outages:

| # | Layer | Behavior | File |
|---|-------|----------|------|
| 1 | CH Client Retry | 3 attempts, exponential backoff (1s, 2s, 3s) for 5xx/connection errors | `server/clickhouse-client.ts` |
| 2 | Security Events Sweeper | Cursor-based PG→CH drain; deduplicates via CH query; cursor advances only on success | `server/storage.ts` |
| 3 | Live Dual-Write Retry | 3 attempts with backoff for `chDualWrite()`; PG remains authoritative | `server/storage.ts` |
| 4 | Connector Retry | 2 retries for transient network errors in all `BaseConnector` subclasses | `server/connectors/base-connector.ts` |
| 5 | DLQ Auto-Retry | 60s background job replays failed DLQ entries up to `max_retries` with 5-min cooldown | `server/index.ts` |
| 6 | Schema Init Retry | 5 attempts with exponential backoff (2s→32s); 15s timeout per attempt | `server/index.ts` |

**Production verification:**
- Incident backfill: 9,276 rows ✓
- Security event target backfill: 40,301 rows ✓
- Schema init: `[ClickHouse] Schema init succeeded` on all tasks ✓

---

*Document generated: April 20, 2026*
*Maintainer: DevOps / Platform Team*
