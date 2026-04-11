# GRC Shield AWS Deployment - Complete Guide

**Date:** March 29, 2026  
**Domain:** https://grc.risk7.io  
**Status:** ✅ PRODUCTION READY

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Steps](#deployment-steps)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Troubleshooting](#troubleshooting)
6. [Cost Breakdown](#cost-breakdown)

---

## Architecture Overview

### Infrastructure Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER ACCESS                                     │
│                    https://grc.risk7.io (HTTPS)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ROUTE 53 / GODADDY DNS                               │
│                    grc.risk7.io → ALB DNS                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LOAD BALANCER (ALB)                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Port 80 (HTTP)    → Redirects to HTTPS (optional)                   │  │
│  │  Port 443 (HTTPS)  → Forwards to ECS Tasks                           │  │
│  │  Certificate:      ACM Wildcard (risk7.io + *.risk7.io)              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ECS FARGATE CLUSTER                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Service: grc-shield-app                                              │  │
│  │  Tasks: 1 running (desired: 1)                                        │  │
│  │  CPU: 512 | Memory: 1024 MB                                           │  │
│  │  Image: grc-shield/app:v1.0.17-final                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RDS POSTGRESQL                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Instance: db.t3.medium                                               │  │
│  │  Version: PostgreSQL 15.14                                            │  │
│  │  Storage: 20 GB GP2                                                   │  │
│  │  AZ: Single AZ (ap-south-1a)                                          │  │
│  │  Backup: 7 days retention                                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          VPC (10.0.0.0/16)                       │
│  ┌──────────────────────────┐      ┌──────────────────────────┐  │
│  │   Public Subnet 1        │      │   Public Subnet 2        │  │
│  │   (10.0.1.0/24)          │      │   (10.0.2.0/24)          │  │
│  │   - ALB                  │      │   - ALB                  │  │
│  │   - NAT Gateway 1        │      │   - NAT Gateway 2        │  │
│  └──────────────────────────┘      └──────────────────────────┘  │
│           │                                 │                     │
│           ▼                                 ▼                     │
│  ┌──────────────────────────┐      ┌──────────────────────────┐  │
│  │   Private Subnet 1       │      │   Private Subnet 2       │  │
│  │   (10.0.10.0/24)         │      │   (10.0.11.0/24)         │  │
│  │   - ECS Tasks            │      │   - ECS Tasks (standby)  │  │
│  │   - RDS (primary)        │      │                          │  │
│  └──────────────────────────┘      └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### AWS Requirements
- [ ] AWS Account with appropriate limits
- [ ] IAM user/role with permissions for:
  - CloudFormation
  - EC2 (VPC, ALB)
  - ECS (Clusters, Task Definitions, Services)
  - RDS
  - Secrets Manager
  - ACM (Certificates)

### Domain Requirements
- [ ] Registered domain (e.g., risk7.io)
- [ ] DNS management access (GoDaddy, Route 53, etc.)

### Local Tools
- [ ] AWS CLI configured
- [ ] Docker with buildx
- [ ] jq (for JSON processing)

---

## Deployment Steps

### Phase 1: Infrastructure Deployment

#### 1.1 Deploy VPC Stack

```bash
aws cloudformation create-stack \
  --stack-name grc-shield-vpc \
  --template-body file://aws/cloudformation/01-vpc.yaml \
  --parameters \
    ParameterKey=EnvironmentName,ParameterValue=grc-shield \
  --capabilities CAPABILITY_IAM
```

**Wait for completion:**
```bash
aws cloudformation wait stack-create-complete --stack-name grc-shield-vpc
```

#### 1.2 Deploy RDS Stack

```bash
aws cloudformation create-stack \
  --stack-name grc-shield-rds \
  --template-body file://aws/cloudformation/02-rds.yaml \
  --parameters \
    ParameterKey=EnvironmentName,ParameterValue=grc-shield \
  --capabilities CAPABILITY_IAM
```

**Wait for completion:**
```bash
aws cloudformation wait stack-create-complete --stack-name grc-shield-rds
```

#### 1.3 Create Secrets

```bash
# Create session secret
aws secretsmanager create-secret \
  --name "grc-shield/session-secret" \
  --description "GRC Shield Session Secret" \
  --secret-string "$(openssl rand -hex 32)"

# Database secret is created automatically by RDS stack
```

### Phase 2: Application Build & Push

#### 2.1 Build Docker Image

```bash
# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  200810847769.dkr.ecr.ap-south-1.amazonaws.com

# Build and push
cd GRC
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -t 200810847769.dkr.ecr.ap-south-1.amazonaws.com/grc-shield/app:v1.0.17-final \
  -f Dockerfile \
  --push .
```

### Phase 3: ECS Deployment

#### 3.1 Deploy ECS Stack

```bash
aws cloudformation create-stack \
  --stack-name grc-shield-ecs \
  --template-body file://aws/cloudformation/03-ecs-no-ecr.yaml \
  --parameters \
    ParameterKey=EnvironmentName,ParameterValue=grc-shield \
    ParameterKey=ImageTag,ParameterValue=v1.0.17-final
```

### Phase 4: SSL Certificate & HTTPS

#### 4.1 Request ACM Certificate

```bash
aws acm request-certificate \
  --domain-name "risk7.io" \
  --subject-alternative-names "*.risk7.io" \
  --validation-method DNS
```

#### 4.2 Add DNS Validation Records

In GoDaddy DNS, add:

| Type | Name | Value |
|------|------|-------|
| CNAME | `_53c0c0a9d4d9f743437d134ecc4625c7` | `_fe6469ef2e5317bf9a327db6b2eb224e.jkddzztszm.acm-validations.aws` |

Wait for certificate status: `ISSUED`

#### 4.3 Create HTTPS Listener

```bash
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names grc-shield-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

TG_ARN=$(aws elbv2 describe-target-groups \
  --names grc-shield-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

CERT_ARN="arn:aws:acm:ap-south-1:200810847769:certificate/a4079efe-437a-41ca-b069-68e1f6128ef6"

aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS \
  --port 443 \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn="$TG_ARN"
```

### Phase 5: Domain Configuration

In GoDaddy DNS, add:

| Type | Name | Value |
|------|------|-------|
| CNAME | `grc` | `grc-shield-alb-909687856.ap-south-1.elb.amazonaws.com` |

---

## Post-Deployment Configuration

### Environment Variables

**Current ECS Task Definition Environment:**

```yaml
Environment:
  - Name: NODE_ENV
    Value: "production"
  - Name: SECURE_COOKIES
    Value: "true"          # Required for HTTPS
  - Name: PORT
    Value: "5000"
  - Name: UPLOAD_DIR
    Value: "/app/uploads"
  - Name: NODE_OPTIONS
    Value: "--max-old-space-size=512"
  - Name: RUN_SEED
    Value: "true"          # For initial data seeding
```

### Security Group Rules

**ALB Security Group:**
- Inbound: Port 80 (HTTP) from 0.0.0.0/0
- Inbound: Port 443 (HTTPS) from 0.0.0.0/0

**ECS Task Security Group:**
- Inbound: Port 5000 from ALB security group
- Outbound: All traffic

**RDS Security Group:**
- Inbound: Port 5432 from ECS security group

### Default Admin User

```
Username: admin
Email: admin@grcshield.com
Password: Admin@123
Role: super_admin
```

---

## Troubleshooting

### Issue: Certificate Pending Validation

**Check:**
```bash
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.Status'
```

**Solution:** Verify DNS validation record in GoDaddy

### Issue: 503 Service Unavailable

**Check ECS service:**
```bash
aws ecs describe-services \
  --cluster grc-shield-cluster \
  --services grc-shield-app
```

**Check logs:**
```bash
aws logs tail "/ecs/grc-shield/app" --since 10m
```

### Issue: DNS Not Resolving

**Check propagation:**
```bash
dig grc.risk7.io +short
nslookup grc.risk7.io
```

**Solution:** Wait 30-60 minutes for DNS propagation

### Issue: CSRF Token Error

**Check:** Verify `SECURE_COOKIES=true` when using HTTPS

---

## Cost Breakdown

### Monthly Costs (Mumbai Region)

| Component | Specification | Monthly Cost |
|-----------|--------------|--------------|
| **VPC** | | |
| ALB | 2 AZs | ~$16.43 |
| NAT Gateway | 2 × t3.medium | ~$65.00 |
| Data Transfer | Estimated | ~$10-20 |
| **ECS** | | |
| Fargate | 0.5 vCPU, 1GB | ~$18.00 |
| **RDS** | | |
| PostgreSQL | db.t3.medium | ~$52.00 |
| Storage | 20 GB | ~$2.30 |
| **Other** | | |
| CloudWatch Logs | Basic | ~$5.00 |
| **TOTAL** | | **~$165-180/month** |

### Cost Optimization Options

1. **Reduce NAT Gateways:** Use 1 instead of 2 → Save ~$43/month
2. **Reserved Instances:** 1-year RDS reserved → Save ~30%
3. **Fargate Spot:** Use Spot capacity → Save ~30-40%

---

## Maintenance

### Regular Tasks

**Weekly:**
- Monitor CloudWatch logs for errors
- Check RDS storage usage

**Monthly:**
- Review AWS costs
- Update dependencies (security patches)

**Quarterly:**
- Rotate secrets
- Review security groups
- Backup verification

### Backup Strategy

**Automated:**
- RDS: Daily automated backups (7-day retention)
- ECR: Image versioning

**Manual:**
```bash
# Database backup
aws rds create-db-snapshot \
  --db-instance-identifier grc-shield-postgres \
  --db-snapshot-identifier grc-shield-backup-$(date +%Y%m%d)
```

---

## Rollback Procedures

### Rollback to Previous Task Definition

```bash
aws ecs update-service \
  --cluster grc-shield-cluster \
  --service grc-shield-app \
  --task-definition grc-shield-app:PREVIOUS_REVISION \
  --force-new-deployment
```

### Delete All Stacks

```bash
# Delete in reverse order
aws cloudformation delete-stack --stack-name grc-shield-ecs
aws cloudformation wait stack-delete-complete --stack-name grc-shield-ecs

aws cloudformation delete-stack --stack-name grc-shield-rds
aws cloudformation wait stack-delete-complete --stack-name grc-shield-rds

aws cloudformation delete-stack --stack-name grc-shield-vpc
aws cloudformation wait stack-delete-complete --stack-name grc-shield-vpc
```

---

## Contact & Support

- **Application URL:** https://grc.risk7.io
- **Health Check:** https://grc.risk7.io/api/health
- **Logs:** AWS CloudWatch → Log Groups → /ecs/grc-shield/app

---

**Document Version:** 1.0  
**Last Updated:** March 29, 2026  
**Maintained By:** DevOps Team
