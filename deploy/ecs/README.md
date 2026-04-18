# Cyber Command Center — AWS ECS Fargate Deployment

Full deployment of the CCC multi-plane architecture on AWS ECS Fargate.

## Architecture Overview

```
Internet
   │
   ▼
[ALB - Public]           [NLB - Public]
   │                          │
   │ HTTPS 443           Syslog 514/1514/6514
   │                     Push API 5000
   ▼                          ▼
┌─────────────────────────────────────────────────┐
│                  Private Subnets (VPC)           │
│                                                 │
│  [Management Plane - ECS Fargate]               │
│    - Express API + React SPA                    │
│    - PLANE=management                           │
│    - 1024 CPU / 2048 MB (auto-scales 1→10)      │
│         │          │            │               │
│         ▼          ▼            ▼               │
│       [RDS]    [ElastiCache]  [MSK]             │
│   PostgreSQL 16   Redis 7    Kafka 3.x          │
│                                                 │
│  [Receiver Plane - ECS Fargate]                 │
│    - Syslog + CEF + Push API ingest             │
│    - PLANE=receiver                             │
│    - 512 CPU / 1024 MB                          │
│         │                                       │
│         ▼                                       │
│       [MSK] ──────────────────────────────────► │
│                                                 │
│  [Data Plane × 5 regions - ECS Fargate]         │
│    PLANE=data (one cluster per region)          │
│    Regions: in-west-1 | us-east-1 | ke-east-1  │
│             sa-central-1 | bh-east-1            │
│    2048 CPU / 4096 MB (auto-scales 1→6)         │
│         │             │                         │
│         ▼             ▼                         │
│  [RDS+TimescaleDB] [ClickHouse]                 │
│                                                 │
│  [EFS] — reports/uploads (management)           │
│  [S3]  — event lake (per data-plane region)     │
└─────────────────────────────────────────────────┘
```

## File Structure

```
deploy/ecs/
├── cloudformation/
│   ├── prerequisites.yml      # Step 1: ECR repos, shared IAM role, S3 buckets
│   ├── management-plane.yml   # Step 2: Management plane cluster + ALB + ECS service
│   ├── data-plane.yml         # Step 3: Data plane cluster per region (deploy × 5)
│   └── receiver-plane.yml     # Step 4: Receiver plane cluster + NLB + ECS service
├── task-definitions/
│   ├── management-plane.json  # Raw ECS task definition (reference / CI pipelines)
│   ├── data-plane.json        # Raw ECS task definition (reference)
│   └── receiver-plane.json    # Raw ECS task definition (reference)
├── scripts/
│   ├── push-images.sh         # Build + push plane images to ECR
│   ├── deploy-stacks.sh       # Deploy all CloudFormation stacks in order
│   ├── setup-secrets.sh       # Populate AWS Secrets Manager interactively
│   ├── validate-secrets.sh    # Pre-flight: confirm all Secrets Manager paths exist
│   ├── activate-clickhouse.sh # Turn-key ClickHouse activation (post clickhouse stack)
│   ├── migrate.sh             # Run Drizzle schema migrations (direct/ecs/github-actions)
│   └── smoke-test.sh          # Post-deploy health checks
└── .env.ecs.example           # Documents all required secret paths + AWS infra

.github/workflows/
└── deploy-aws.yml             # GitHub Actions CI/CD pipeline (7 jobs)

Dockerfile                     # Production image (devDependencies pruned)
Dockerfile.migrate             # Migration-only image (retains devDeps for drizzle-kit)
```

## Prerequisites

- AWS CLI v2 configured with permissions for: ECS, ECR, CloudFormation, IAM, S3, EFS, SecretsManager, EC2
- Docker (with `linux/amd64` build support — use `docker buildx` on Apple Silicon)
- A VPC with at least 2 public subnets + 2 private subnets across 2 AZs
- An ACM certificate for your domain (for the management plane ALB HTTPS listener)
- AWS Managed Services provisioned (see `.env.ecs.example`):
  - RDS PostgreSQL 16 (management) + TimescaleDB instance (data planes)
  - ElastiCache Redis 7
  - Amazon MSK (Kafka 3.x KRaft)
  - ClickHouse OLAP cluster (single shared NLB-fronted instance — see "ClickHouse Activation" below)

## Deployment Steps

### 1. Set environment variables

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-south-1
export VPC_ID=vpc-xxxxxxxxxxxxxxxxx
export PUBLIC_SUBNETS="subnet-aaa,subnet-bbb"
export PRIVATE_SUBNETS="subnet-ccc,subnet-ddd"
export CERTIFICATE_ARN=arn:aws:acm:ap-south-1:...
export ENVIRONMENT=production
export IMAGE_TAG=v1.0.0
```

### 2. Deploy prerequisites (ECR repos + IAM role + S3 buckets)

```bash
./deploy/ecs/scripts/deploy-stacks.sh --stack prerequisites
```

### 3. Configure secrets in AWS Secrets Manager

```bash
./deploy/ecs/scripts/setup-secrets.sh
```

This interactively sets all secrets under the `ccc/` prefix. See `.env.ecs.example` for the full list and expected values.

### 4. Build and push Docker images to ECR

```bash
chmod +x deploy/ecs/scripts/push-images.sh
./deploy/ecs/scripts/push-images.sh --tag "${IMAGE_TAG}"
```

To push a single plane only:

```bash
./deploy/ecs/scripts/push-images.sh --plane management --tag v1.0.0
./deploy/ecs/scripts/push-images.sh --plane data        --tag v1.0.0
./deploy/ecs/scripts/push-images.sh --plane receiver    --tag v1.0.0
```

### 5. Deploy all stacks

```bash
chmod +x deploy/ecs/scripts/deploy-stacks.sh
./deploy/ecs/scripts/deploy-stacks.sh
```

Or deploy individual planes:

```bash
# Management plane
./deploy/ecs/scripts/deploy-stacks.sh --stack management

# Data plane — single region
./deploy/ecs/scripts/deploy-stacks.sh --stack data --region in-west-1

# Data plane — all 5 regions
./deploy/ecs/scripts/deploy-stacks.sh --stack data

# Receiver plane
./deploy/ecs/scripts/deploy-stacks.sh --stack receiver
```

## ClickHouse Activation (optional hot-tier OLAP)

By default the platform runs PostgreSQL-only. To activate the ClickHouse hot
tier (used by the events console fast path, dashboard event-volume trend, and
cross-source IOC correlation), follow these one-time steps **after** the
management plane is healthy:

```bash
# 1. Populate the ClickHouse identity secrets (answer "y" at the prompt).
./deploy/ecs/scripts/setup-secrets.sh

# 2. Deploy the ClickHouse EC2 + NLB stack. Requires MGMT_SG_ID (or have
#    management-plane already deployed so it is auto-discovered) and an
#    EC2 key pair name for break-glass SSH:
export CH_KEY_PAIR=my-keypair
./deploy/ecs/scripts/deploy-stacks.sh --stack clickhouse

# 3. Turn-key activation: reads the NLB DNS from the stack, writes it into
#    ccc/shared/clickhouse-url + per-region ccc/data-plane/<r>/clickhouse-url,
#    re-validates secrets, and (with --redeploy) re-rolls mgmt + data planes
#    with EnableClickHouse=true.
./deploy/ecs/scripts/activate-clickhouse.sh --redeploy
```

After redeploy, verify in production:

- Management ECS task logs print `[ClickHouse] Schema initialization complete.`
- `GET /api/admin/platform-health` shows ClickHouse OLAP as `connected`.
- `POST /api/events/ingest` mirrors writes to PG + ClickHouse without
  `[Storage] ClickHouse write error` warnings.
- `GET /api/events/:tenantId` returns rows tagged `source: "clickhouse_olap"`
  when the hot-tier path is hit.

To deactivate, simply re-run the management/data deploys with
`ENABLE_CLICKHOUSE=false` (the default) — the dual-write helper is a no-op
when `CLICKHOUSE_URL` is unset, so the fallback path keeps serving from
PostgreSQL.

## Updating / Rolling Deployments

To update a running service with a new image:

```bash
export IMAGE_TAG=v1.1.0
./deploy/ecs/scripts/push-images.sh --tag "${IMAGE_TAG}"
./deploy/ecs/scripts/deploy-stacks.sh --stack management
```

CloudFormation will trigger a rolling ECS deployment automatically (50% min healthy, 200% max). The deployment circuit breaker auto-rolls back on health check failures.

## Connecting to Running Tasks (ECS Exec)

All task roles include `ssmmessages:*` permissions. Enable ECS Exec to SSH into containers without opening ports:

```bash
TASK_ARN=$(aws ecs list-tasks \
  --cluster ccc-management-production \
  --service-name ccc-management-plane-production \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster ccc-management-production \
  --task "${TASK_ARN}" \
  --container management-plane \
  --command "/bin/sh" \
  --interactive
```

## Auto Scaling Configuration

| Plane      | Min | Max | Scale-out trigger |
|------------|-----|-----|-------------------|
| Management | 1   | 10  | CPU > 65% or Memory > 75% |
| Data Plane | 1   | 6   | CPU > 70% |
| Receiver   | 2   | —   | Fixed (stateless) |

## Fargate Sizing Reference

| Plane      | CPU   | Memory | Notes                         |
|------------|-------|--------|-------------------------------|
| Management | 1 vCPU | 2 GB  | Handles UI + API + schedulers |
| Data Plane | 2 vCPU | 4 GB  | Event processing + search     |
| Receiver   | 0.5 vCPU | 1 GB | Stateless ingestion only      |

## TimescaleDB on AWS

Amazon RDS does not support the TimescaleDB extension. For the data plane DB, use:

- **Timescale Cloud** — managed TimescaleDB (recommended): https://www.timescale.com/cloud
- **EC2 self-managed** — Run TimescaleDB on EC2 in the same VPC
- **Standard RDS PostgreSQL** — Works if TimescaleDB-specific queries are adapted (hypertable creation still works on compatible extensions)

## MSK (Kafka) Recommended Config

```
Kafka version:  3.6.x (KRaft mode)
Instance type:  kafka.m5.large (production)
Brokers:        3 (across 3 AZs)
Storage:        500 GB per broker (gp3, encrypted)
Topics:         Auto-create enabled
Partitions:     6
Replication:    3
Retention:      168h (7 days)
```

## GitHub Actions CI/CD

The pipeline is defined in `.github/workflows/deploy-aws.yml` and runs
automatically on every push to `main`. It can also be triggered manually via
the GitHub Actions UI to deploy any image tag to any environment.

### Pipeline stages

```
push to main (or manual trigger)
         │
         ▼
[1] Build & Push     — docker buildx linux/amd64 → ECR (all 3 planes)
         │
         ▼
[2] Validate Secrets — confirm all Secrets Manager paths exist
         │
         ▼
[3] Deploy Management Plane  — CloudFormation rolling deploy
         │
         ▼
[4] Run DB Migrations        — one-off Fargate task (drizzle-kit push)
         │
         ▼
[5] Smoke Test               — /healthz, /api/auth/user, SPA, HTTP redirect
         │
         ├──(optional)──► [6] Deploy Data Planes  (all 5 regions)
         │
         └──(optional)──► [7] Deploy Receiver Plane
```

### Step 1: Configure required GitHub repository secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**
and add every secret in the table below.

| Secret name              | Description |
|--------------------------|-------------|
| `AWS_ACCOUNT_ID`         | 12-digit AWS account number |
| `AWS_REGION`             | Primary AWS region (e.g. `ap-south-1`) |
| `VPC_ID`                 | VPC where ECS clusters live |
| `PUBLIC_SUBNETS`         | Comma-separated public subnet IDs (ALB) |
| `PRIVATE_SUBNETS`        | Comma-separated private subnet IDs (ECS tasks) |
| `CERTIFICATE_ARN`        | ACM certificate ARN for HTTPS on the management ALB |

#### Authentication — choose one option

**Option A (recommended): OIDC — no long-lived keys**

```bash
# Create an IAM role that GitHub Actions can assume
# Trust policy: token.actions.githubusercontent.com
# Allowed repo: your-org/your-repo, branch: main
```

Then add:

| Secret name          | Value |
|----------------------|-------|
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT_ID:role/ccc-github-actions-role` |

**Option B: Access key pair**

| Secret name              | Value |
|--------------------------|-------|
| `AWS_ACCESS_KEY_ID`      | IAM user access key |
| `AWS_SECRET_ACCESS_KEY`  | IAM user secret key |

### Step 2: Configure repository variables (optional)

Go to **Settings → Secrets and variables → Actions → Variables**.

| Variable name        | Default   | Description |
|----------------------|-----------|-------------|
| `SECRETS_PREFIX`     | `ccc`     | Secrets Manager path prefix |
| `DEPLOY_DATA_PLANES` | (not set) | Set to `true` to auto-deploy data planes on every push |
| `DEPLOY_RECEIVER`    | (not set) | Set to `true` to auto-deploy the receiver plane |

### Step 3: Trigger a manual deployment

1. Go to **Actions → Deploy to AWS ECS Fargate**
2. Click **Run workflow**
3. Fill in:
   - **Image tag** — leave blank to use the commit SHA, or enter a specific tag
   - **Environment** — `production` (default), `staging`, or `development`
   - **Deploy data planes** — check to deploy all 5 data-plane regions
   - **Deploy receiver plane** — check to deploy the receiver plane
   - **Dry run** — check to validate without making any changes

### New scripts added by this pipeline

| Script | Purpose |
|--------|---------|
| `deploy/ecs/scripts/validate-secrets.sh` | Pre-flight: confirm all Secrets Manager paths exist |
| `deploy/ecs/scripts/migrate.sh`          | Run Drizzle schema migrations (direct or ECS task mode) |
| `deploy/ecs/scripts/smoke-test.sh`       | Post-deploy health checks (healthz, API, SPA, redirect) |

#### validate-secrets.sh

Checks that every required Secrets Manager path exists before a deploy starts.
Exits non-zero if any are missing, printing the full list.

```bash
export AWS_REGION=ap-south-1
./deploy/ecs/scripts/validate-secrets.sh --plane management
./deploy/ecs/scripts/validate-secrets.sh --plane data
./deploy/ecs/scripts/validate-secrets.sh --plane all
```

#### migrate.sh

Runs `drizzle-kit push` against the production RDS database. Supports two modes:

**Direct mode** — from a machine with DB network access (bastion host, VPN):

```bash
export DATABASE_URL="postgresql://user:pass@rds-host:5432/db?sslmode=require"
./deploy/ecs/scripts/migrate.sh --mode direct
```

**ECS task mode** — launches a one-off Fargate task in the existing cluster
(no direct DB access required — secrets read from Secrets Manager):

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-south-1
export ENVIRONMENT=production
export IMAGE_TAG=v1.0.0
export PRIVATE_SUBNETS="subnet-ccc,subnet-ddd"
./deploy/ecs/scripts/migrate.sh --mode ecs
```

Add `--dry-run` to print what would be executed without running anything.

#### smoke-test.sh

Runs four checks against the management plane ALB after deployment:
1. `/healthz` returns HTTP 200 (waits up to 3 minutes)
2. `/api/auth/user` returns HTTP 401 (API running, auth required)
3. `/` serves the React SPA (HTTP 200)
4. HTTP → HTTPS redirect is active (301/302)

```bash
export ALB_DNS=ccc-management-alb-production.ap-south-1.elb.amazonaws.com
./deploy/ecs/scripts/smoke-test.sh

# Or with options:
./deploy/ecs/scripts/smoke-test.sh \
  --host ccc-management-alb-production.ap-south-1.elb.amazonaws.com \
  --timeout 180 \
  --insecure
```

Exits non-zero if any check fails, causing the CI job to fail and preventing
a bad deployment from being marked successful.
