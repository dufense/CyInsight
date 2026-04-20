# CyInsight Production Inventory — Quick Reference

## 🌐 Public Access

| Resource | URL |
|----------|-----|
| **Application** | https://app.riskproficient.com |
| **Health Check** | https://app.riskproficient.com/_health |

---

## 🔐 Login Credentials

| Role | Username | Password | Endpoint | Notes |
|------|----------|----------|----------|-------|
| **Superadmin** | `admin` | `Admin@123` | `POST /api/superadmin/login` | Platform admin portal |
| **Regular User** | `admin` | `Admin@123` | `POST /api/auth/login` | `users` table + `tenant_users` link with `platform_admin` role |

> **Auth Architecture:** The app has two auth systems:
> - **Superadmin auth** → `superadmins` table (`/api/superadmin/login`)
> - **Regular auth** → `users` + `tenant_users` tables (`/api/auth/login`)
>
> The frontend unconditionally uses **regular auth**, so the `admin` user MUST have a `tenant_users` row with `platform_admin` to see admin features.
>
> **Security Note:** Change default password after first login.

---

## ☁️ AWS Resources (ap-south-1)

### CloudFormation
```
Stack:     cyinsight-starter
Status:    CREATE_COMPLETE
Account:   200810847769
```

### ECS
```
Cluster:   cyinsight-production
Service:   cyinsight-production
Tasks:     2/2 running
Image:     200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest
```

### RDS PostgreSQL
```
Endpoint:  cyinsight-db-production.cxwkeigscpqz.ap-south-1.rds.amazonaws.com
Port:      5432
DB:        cyinsight
Engine:    PostgreSQL 16.6
Username:  cyinsight_admin
SSL:       required
```

### ALB
```
DNS:       cyinsight-alb-production-1224997034.ap-south-1.elb.amazonaws.com
HTTPS:     Port 443 (with ACM certificate)
HTTP:      Port 80 → 301 redirect to HTTPS
```

### S3
```
Bucket:    cyinsight-data-200810847769-production
```

### Secrets Manager
```
ARN:       arn:aws:secretsmanager:ap-south-1:200810847769:secret:cyinsight/app-secrets-production-47Qp2R
```

---

## 📜 SSL Certificate

| Property | Value |
|----------|-------|
| Domain | `app.riskproficient.com` |
| Provider | AWS ACM |
| Status | ISSUED |
| Auto-Renew | Yes (DNS validated) |
| Expires | November 4, 2026 |

---

## 🌍 DNS (Route 53)

```
Hosted Zone:    riskproficient.com
Zone ID:        Z00688023NHWGMJSF34NF

Nameservers:
  - ns-648.awsdns-17.net
  - ns-141.awsdns-17.com
  - ns-1204.awsdns-22.org
  - ns-1948.awsdns-51.co.uk

Records:
  app           CNAME   cyinsight-alb-production-1224997034.ap-south-1.elb.amazonaws.com
  @             A       2.57.91.91
  www           CNAME   riskproficient.com
```

---

## 🗄️ Database

### Total Tables: 124

**Migration System:** Custom resilient runner (replaces standard drizzle-orm migrate)
- Handles partial-schema databases
- Skips benign errors (`already exists`, `does not exist`, etc.)
- Runs automatically on startup

---

## 🛠️ Common Commands

### Redeploy Application
```bash
# Build and push (use buildx for consistent linux/amd64 images)
docker --context=default buildx build --platform linux/amd64 --builder grc-shield-builder -t 200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest --push .

# Force new deployment
aws ecs update-service --cluster cyinsight-production --service cyinsight-production --force-new-deployment --region ap-south-1
```

### View Logs
```bash
aws logs tail /ecs/cyinsight-production --follow --region ap-south-1
```

### Check Service Status
```bash
aws ecs describe-services --cluster cyinsight-production --services cyinsight-production --region ap-south-1
```

### Scale Tasks
```bash
aws ecs update-service --cluster cyinsight-production --service cyinsight-production --desired-count 4 --region ap-south-1
```

---

## 📞 Support Contacts

| Issue | Contact |
|-------|---------|
| AWS Infrastructure | AWS Console / CLI |
| Domain/Registrar | Hostinger |
| DNS | Route 53 (AWS) |
| Application | DevOps Team |

---

*Last Updated: April 19, 2026*

---

## ⚠️ Deployment Hygiene Note

The working tree has **16 modified + 9 untracked files** vs the last commit (`fa1ca1b`). The `COPY . .` in the Dockerfile includes all uncommitted changes, so the deployed image may contain unintended modifications. A clean rebuild from committed code is recommended for production stability.
