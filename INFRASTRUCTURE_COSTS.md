# CyInsight Infrastructure Cost Estimate

**Region:** `ap-south-1` (Mumbai)  
**Account:** `200810847769`  
**Environment:** Production  
**Date:** April 19, 2026  

---

## 1. Executive Summary

| Scenario | Monthly Estimate | Annual Estimate |
|----------|-----------------|-----------------|
| **Current (2 tasks, minimal traffic)** | **$185 – $260** | **$2,220 – $3,120** |
| **With NAT Gateway** | **$220 – $300** | **$2,640 – $3,600** |
| **Scaled (4 tasks, moderate traffic)** | **$320 – $450** | **$3,840 – $5,400** |

> **Note:** This is a **starter-tier deployment** optimized for cost. As tenant count, event volume, and user concurrency grow, compute and database costs will scale proportionally.

---

## 2. Component-by-Component Breakdown

### 2.1 ECS Fargate (Application)

| Property | Value |
|----------|-------|
| Cluster | `cyinsight-production` |
| Service | `cyinsight-production` |
| Desired Count | 2 tasks |
| CPU / Memory per task | 2 vCPU / 4 GB |
| Capacity Provider | FARGATE + FARGATE_SPOT |

**Pricing (ap-south-1):**
- Fargate vCPU: **$0.04048/hour**
- Fargate Memory: **$0.00444/hour/GB**
- Fargate Spot vCPU: **~$0.01214/hour** (~70% discount)
- Fargate Spot Memory: **~$0.00133/hour/GB**

**Monthly Calculation:**

| Mix | Per Task / Hour | 2 Tasks / Hour | Monthly (730 hrs) |
|-----|----------------|----------------|-------------------|
| 100% On-Demand | $0.09872 | $0.19744 | **~$144.13** |
| 50/50 Spot/On-Demand | $0.05492 | $0.10984 | **~$80.18** |
| 100% Spot | $0.02712 | $0.05424 | **~$39.60** |

**Assumption:** The CloudFormation stack uses both `FARGATE` and `FARGATE_SPOT` capacity providers. With 2 tasks, you likely get 1 on-demand + 1 spot.

**Estimated:** **$65 – $100/month**

---

### 2.2 RDS PostgreSQL

| Property | Value |
|----------|-------|
| Instance | `db.t3.micro` |
| Engine | PostgreSQL 16.6 |
| Storage | gp3 (assumed 20 GB default) |
| Multi-AZ | No (starter stack) |

**Pricing (ap-south-1):**
- db.t3.micro on-demand: **$0.017/hour** = **~$12.41/month**
- gp3 storage: **$0.092/GB-month** × 20 GB = **~$1.84/month**
- Backup storage (within 100% of provisioned): **Included**

**Estimated:** **$14 – $20/month**

**Growth path:**
- db.t3.small: ~$25/month
- db.t3.medium: ~$50/month
- db.m6g.large: ~$140/month

---

### 2.3 ElastiCache Redis

| Property | Value |
|----------|-------|
| Cluster ID | `cyinsight-redis-production` |
| Node Type | `cache.t3.micro` |
| Engine | Redis 7.1 |

**Pricing (ap-south-1):**
- cache.t3.micro: **$0.0125/hour** = **~$9.13/month**

**Estimated:** **$9 – $12/month**

---

### 2.4 ClickHouse (Analytics Database)

| Property | Value |
|----------|-------|
| Deployment | ECS Service + EFS |
| Access | Internal ALB |

**ECS Task Estimate:**
- Assuming 1 task @ 1 vCPU / 2 GB (light analytics workload)
- On-demand: (1 × $0.04048) + (2 × $0.00444) = **$0.04936/hour**
- Monthly: **~$36.03**

**EFS Storage Estimate:**
- EFS Standard: **$0.33/GB-month**
- Assuming 20 GB for ClickHouse data: **~$6.60/month**

**Internal ALB:**
- ALB hourly: **$0.02628/hour** = **~$19.18/month**
- LCU charges: minimal for internal traffic (~$2-5)

**Estimated:** **$60 – $70/month**

> **Note:** If ClickHouse task uses Fargate Spot, costs drop to ~$45-55/month.

---

### 2.5 Application Load Balancer (Public)

| Property | Value |
|----------|-------|
| Type | Internet-facing ALB |
| Listeners | 443 (HTTPS), 80 (HTTP→301) |

**Pricing (ap-south-1):**
- Base hourly charge: **$0.02628/hour** = **~$19.18/month**
- LCU (Load Balancer Capacity Unit): **$0.008/LCU-hour**
  - For low traffic (~1-10 req/sec): ~1-2 LCU = **$6 – $12/month**

**Estimated:** **$25 – $35/month**

---

### 2.6 S3 Storage

| Property | Value |
|----------|-------|
| Bucket | `cyinsight-data-200810847769-production` |

**Pricing (ap-south-1):**
- Standard storage: **$0.025/GB-month**
- PUT/COPY/POST/LIST requests: **$0.0053 per 1,000**
- GET/SELECT requests: **$0.00042 per 1,000**

**Current Usage Estimate:**
- Reports, exports, file uploads: ~5-20 GB
- Storage: **~$0.13 – $0.50/month**
- Requests: negligible

**Estimated:** **$1 – $5/month**

---

### 2.7 AWS Secrets Manager

| Property | Value |
|----------|-------|
| Secret | `cyinsight/app-secrets-production` |

**Pricing:**
- Per secret: **$0.40/month**
- API calls (GetSecretValue): **$0.05 per 10,000 calls**

**Estimated:** **~$0.40/month**

---

### 2.8 Route 53

| Property | Value |
|----------|-------|
| Hosted Zone | `riskproficient.com` |

**Pricing:**
- Hosted zone: **$0.50/month**
- DNS queries: **$0.40 per million queries**

**Estimated:** **~$0.50 – $1.00/month**

---

### 2.9 CloudWatch Logs

| Property | Value |
|----------|-------|
| Log Group | `/ecs/cyinsight-production` |

**Pricing (ap-south-1):**
- Data ingestion: **$0.67/GB**
- Log storage (first 5 GB always free): **$0.033/GB**

**Current Usage Estimate:**
- 2 Fargate tasks + 1 ClickHouse task
- ~2-5 GB logs/month
- Ingestion: **~$1.34 – $3.35/month**

**Estimated:** **$2 – $5/month**

---

### 2.10 Amazon ECR

| Property | Value |
|----------|-------|
| Repository | `cyinsight` |

**Pricing (ap-south-1):**
- Storage: **$0.10/GB-month**
- Image size: ~500 MB – 1 GB
- 1-2 image versions stored

**Estimated:** **~$0.10 – $0.50/month**

---

### 2.11 NAT Gateway (If Deployed)

> **Status:** Not confirmed in current stack. The CloudFormation template may or may not include a NAT Gateway for private subnet outbound access.

**Pricing (ap-south-1):**
- Hourly charge: **$0.045/hour** = **~$32.85/month**
- Data processing: **$0.045/GB**

**If present:** **$35 – $50/month**

---

### 2.12 Data Transfer

| Type | Rate (ap-south-1) | Estimate |
|------|-------------------|----------|
| ALB → Internet (egress) | $0.109/GB | ~$5-20/month (low traffic) |
| RDS → ECS (same AZ) | Free | $0 |
| ECS → S3 (same region) | Free | $0 |
| Cross-AZ traffic | $0.01/GB | Minimal |

**Estimated:** **$5 – $20/month**

---

## 3. Consolidated Monthly Cost Table

| Component | Low Estimate | High Estimate | Notes |
|-----------|-------------|---------------|-------|
| ECS Fargate (App) | $65 | $100 | 2 tasks, mixed on-demand/spot |
| RDS PostgreSQL | $14 | $20 | db.t3.micro, 20 GB gp3 |
| ElastiCache Redis | $9 | $12 | cache.t3.micro |
| ClickHouse (ECS + EFS) | $60 | $70 | 1 task, 20 GB EFS |
| Public ALB | $25 | $35 | Base + LCU |
| Internal ALB (ClickHouse) | $19 | $24 | Included in ClickHouse row above |
| S3 | $1 | $5 | Minimal usage |
| Secrets Manager | $0.40 | $0.40 | 1 secret |
| Route 53 | $0.50 | $1 | Hosted zone + queries |
| CloudWatch Logs | $2 | $5 | 2-5 GB/month |
| ECR | $0.10 | $0.50 | 1 image |
| Data Transfer | $5 | $20 | ALB egress |
| **Subtotal (without NAT)** | **$185** | **$260** | |
| NAT Gateway (if present) | $35 | $50 | Optional |
| **Subtotal (with NAT)** | **$220** | **$310** | |

---

## 4. Annual Projection

| Scenario | Monthly | Annual |
|----------|---------|--------|
| **Current (no NAT, low traffic)** | $185 – $260 | $2,220 – $3,120 |
| **With NAT Gateway** | $220 – $310 | $2,640 – $3,720 |
| **3x tenants, 2x events** | $280 – $400 | $3,360 – $4,800 |
| **Production-ready (Multi-AZ RDS, 4 tasks)** | $450 – $650 | $5,400 – $7,800 |

---

## 5. Cost Optimization Opportunities

| Opportunity | Potential Savings | Effort |
|-------------|-------------------|--------|
| Use **FARGATE_SPOT** for 100% of app tasks | ~$80/month | Low |
| Use **FARGATE_SPOT** for ClickHouse | ~$15/month | Low |
| Enable **RDS Reserved Instances** (1-year) | ~30-40% on RDS | Low |
| Enable **ElastiCache Reserved Nodes** | ~30-40% on Redis | Low |
| Move ClickHouse EFS to **Infrequent Access** tier | ~$2-3/month | Low |
| Implement **log retention policies** (CloudWatch) | $1-3/month | Low |
| Remove NAT Gateway if not needed | $33-50/month | Medium |
| Use **S3 Intelligent-Tiering** | Minimal now | Low |
| **Graviton2 (ARM)** instances for ECS/RDS/ElastiCache | ~20% savings | Medium |

---

## 6. Scaling Cost Projections

### 6.1 Compute Scaling

| Tasks | vCPU | Memory | Monthly (On-Demand) | Monthly (50/50 Spot) |
|-------|------|--------|---------------------|----------------------|
| 2 | 4 | 8 GB | $144 | $80 |
| 4 | 8 | 16 GB | $288 | $160 |
| 6 | 12 | 24 GB | $432 | $240 |
| 8 | 16 | 32 GB | $576 | $320 |

### 6.2 Database Scaling

| Instance | Monthly | Use Case |
|----------|---------|----------|
| db.t3.micro | ~$15 | Current (starter) |
| db.t3.small | ~$30 | 5-10 tenants |
| db.t3.medium | ~$60 | 20-50 tenants |
| db.m6g.large | ~$140 | 100+ tenants, heavy queries |
| db.m6g.xlarge | ~$280 | High concurrency |

### 6.3 Event Volume Impact

| Events / Day | S3 Growth | ClickHouse EFS Growth | CloudWatch Logs |
|--------------|-----------|----------------------|-----------------|
| 1,000 | ~1 GB/mo | ~2 GB/mo | +1 GB/mo |
| 10,000 | ~10 GB/mo | ~15 GB/mo | +3 GB/mo |
| 100,000 | ~100 GB/mo | ~120 GB/mo | +10 GB/mo |
| 1,000,000 | ~1 TB/mo | ~1 TB/mo | +50 GB/mo |

---

## 7. AWS Free Tier Impact

The following services have Free Tier allowances that may reduce costs:

| Service | Free Tier | Current Impact |
|---------|-----------|----------------|
| CloudWatch Logs | 5 GB ingestion + 5 GB storage | Likely covers current usage |
| S3 | 5 GB standard storage | Likely covers current usage |
| ECR | 500 MB storage/month | Covers 1 image |
| Secrets Manager | 30 days free trial | Already past trial |

---

*Last Updated: April 19, 2026*  
*Pricing based on AWS Mumbai (ap-south-1) published rates. Actual costs may vary based on usage patterns, reserved capacity, and AWS pricing changes.*
