# CloudFormation Template Changes - Documentation

**Date:** March 29, 2026  
**Project:** GRC Shield AWS Deployment  
**Status:** Changes Applied and Validated

---

## Table of Contents
1. [Original Templates vs Modified](#original-templates-vs-modified)
2. [Changes by Template](#changes-by-template)
3. [Critical Fixes Applied](#critical-fixes-applied)
4. [Lessons Learned](#lessons-learned)

---

## Original Templates vs Modified

### Files Modified

| Template | Original Issues | Changes Made |
|----------|----------------|--------------|
| `01-vpc.yaml` | Unicode em-dashes | Replaced with hyphens |
| `02-rds.yaml` | Invalid syntax, wrong PG version | Fixed syntax, updated to 15.14 |
| `03-ecs.yaml` | ECR conflicts, missing runtime | Removed ECR, added RuntimePlatform |
| `03-ecs-no-ecr.yaml` | New file | Created to avoid ECR conflicts |

---

## Changes by Template

### 01-vpc.yaml - VPC Infrastructure

#### Changes Applied:

```yaml
# BEFORE (Lines with em-dashes)
GroupDescription: ALB — allow inbound HTTP/HTTPS from internet
GroupDescription: ECS tasks — allow traffic from ALB

# AFTER (Fixed)
GroupDescription: ALB - allow inbound HTTP/HTTPS from internet
GroupDescription: ECS tasks - allow traffic from ALB
```

**Issue:** CloudFormation rejects Unicode em-dashes (—)  
**Fix:** Replace all em-dashes with standard hyphens (-)

**Files Affected:** All CloudFormation templates with descriptions

---

### 02-rds.yaml - RDS Database

#### Change 1: Fixed ImportValue Syntax

```yaml
# BEFORE (Invalid CloudFormation syntax)
SubnetIds:
  - !ImportValue !Sub "${EnvironmentName}-DBSubnet1Id"
  - !ImportValue !Sub "${EnvironmentName}-DBSubnet2Id"

# AFTER (Correct syntax)
SubnetIds:
  - Fn::ImportValue: !Sub "${EnvironmentName}-DBSubnet1Id"
  - Fn::ImportValue: !Sub "${EnvironmentName}-DBSubnet2Id"
```

**Issue:** `!ImportValue !Sub` is not valid CloudFormation syntax  
**Fix:** Use `Fn::ImportValue` with explicit function notation

#### Change 2: Updated PostgreSQL Version

```yaml
# BEFORE
EngineVersion: "15.4"

# AFTER
EngineVersion: "15.14"
```

**Issue:** PostgreSQL 15.4 not available in ap-south-1 region  
**Fix:** Updated to 15.14 (latest available)

#### Change 3: Fixed Security Group Descriptions

```yaml
# BEFORE
GroupDescription: RDS — allow PostgreSQL from ECS only

# AFTER
GroupDescription: RDS - allow PostgreSQL from ECS only
```

---

### 03-ecs.yaml - ECS Service (Original)

#### Change 1: Fixed ImportValue Syntax

```yaml
# BEFORE
VPCId: !ImportValue !Sub "${EnvironmentName}-VPCId"

# AFTER
VPCId: 
  Fn::ImportValue: !Sub "${EnvironmentName}-VPCId"
```

#### Change 2: Added RuntimePlatform for Architecture

```yaml
# ADDED to TaskDefinition
RuntimePlatform:
  CpuArchitecture: X86_64
  OperatingSystemFamily: LINUX
```

**Issue:** Docker images built on ARM64 (Apple Silicon) failed on Fargate  
**Fix:** Explicitly specify X86_64 architecture

#### Change 3: Removed Uploads Volume (Permission Issues)

```yaml
# BEFORE (Caused permission conflicts)
Volumes:
  - Name: uploads-storage
  - Name: tmp-storage

ContainerDefinitions:
  MountPoints:
    - SourceVolume: uploads-storage
      ContainerPath: /app/uploads
    - SourceVolume: tmp-storage
      ContainerPath: /tmp

# AFTER (Fixed)
Volumes:
  - Name: tmp-storage

ContainerDefinitions:
  MountPoints:
    - SourceVolume: tmp-storage
      ContainerPath: /tmp
```

**Issue:** Volume mount overrode Dockerfile permissions  
**Fix:** Use container filesystem for uploads, only mount /tmp

#### Change 4: Fixed Security Group Descriptions

```yaml
# BEFORE
GroupDescription: ALB — allow inbound HTTP/HTTPS from internet

# AFTER
GroupDescription: ALB - allow inbound HTTP/HTTPS from internet
```

---

### 03-ecs-no-ecr.yaml - ECS Service (Without ECR)

#### Purpose:
Created as an alternative template when ECR repository already exists.

#### Key Differences from 03-ecs.yaml:

```yaml
# REMOVED: ECR Repository resource
# ECRRepository:
#   Type: AWS::ECR::Repository
#   Properties:
#     RepositoryName: !Sub "${EnvironmentName}/app"

# MODIFIED: Image URI format
Image: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/${EnvironmentName}/app:${ImageTag}"

# INSTEAD OF: Using ECR repository created by template
# Image: !Sub "${ECRRepository.RepositoryUri}:${ImageTag}"
```

**Use Case:** When ECR repo already exists or created separately

---

## Critical Fixes Applied

### 1. CSRF Cookie Secure Flag (Application Level)

**File:** `server/index.ts`

```typescript
// BEFORE (Hardcoded)
secure: isProduction && !isReplitPreview,

// AFTER (Environment controlled)
const useSecureCookies = process.env.SECURE_COOKIES === "true" ||
  (isProduction && process.env.SECURE_COOKIES !== "false");

secure: useSecureCookies && !isReplitPreview,
```

**ECS Environment Variable:**
```yaml
- Name: SECURE_COOKIES
  Value: "true"  # For HTTPS deployments
```

**Issue:** CSRF cookie rejected over HTTP with secure:true  
**Impact:** White page, cannot login

### 2. Database Seeding License Key

**File:** `server/seed.ts`

```typescript
// BEFORE (Missing licenseKey field)
await db.insert(licenses).values([
  {
    tenantId: kalaamTenant.id,
    licenseType: "enterprise",
    // ... other fields
    // licenseKey was missing!
  }
]);

// AFTER (Added licenseKey)
await db.insert(licenses).values([
  {
    licenseKey: "KALAAM-ENT-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    tenantId: kalaamTenant.id,
    licenseType: "enterprise",
    // ... other fields
  }
]);
```

**Issue:** `license_key` column has NOT NULL constraint  
**Impact:** Database seeding failed, no admin user created

### 3. Docker Image Platform

**File:** `Dockerfile` (build process)

```bash
# BEFORE (No platform specified)
docker buildx build -t image:tag .

# AFTER (Explicit AMD64 platform)
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -t image:tag .
```

**Issue:** ARM64 images don't run on ECS Fargate (AMD64 only)  
**Impact:** CannotPullContainerError

### 4. Health Check Grace Period

**ECS Service Configuration:**

```bash
aws ecs update-service \
  --cluster grc-shield-cluster \
  --service grc-shield-app \
  --health-check-grace-period-seconds 180
```

**Issue:** ECS kills tasks before they finish starting  
**Impact:** Deployment failures, tasks cycling

---

## CloudFormation Template Best Practices Applied

### 1. Use Fn::ImportValue for Cross-Stack References

```yaml
# Good
VPCId:
  Fn::ImportValue: !Sub "${EnvironmentName}-VPCId"

# Bad (Invalid)
VPCId: !ImportValue !Sub "${EnvironmentName}-VPCId"
```

### 2. Avoid Special Unicode Characters

```yaml
# Good
Description: RDS - allow PostgreSQL from ECS

# Bad
Description: RDS — allow PostgreSQL from ECS  # Contains em-dash
```

### 3. Explicit Resource Naming

```yaml
DBInstanceIdentifier: !Sub "${EnvironmentName}-postgres"
```

### 4. Secrets Management

```yaml
# Use Secrets Manager for sensitive data
DatabaseUrl:
  Fn::ImportValue: !Sub "${EnvironmentName}-DatabaseSecretUrl"

SessionSecretArn:
  Fn::ImportValue: !Sub "${EnvironmentName}-SessionSecretArn"
```

### 5. Output Important Values

```yaml
Outputs:
  LoadBalancerDNS:
    Description: ALB DNS Name
    Value: !GetAtt ApplicationLoadBalancer.DNSName
    Export:
      Name: !Sub "${EnvironmentName}-ALBDNS"
```

---

## Validation Checklist

Before deploying CloudFormation templates, verify:

- [ ] No em-dashes (—) or other Unicode characters
- [ ] Valid `Fn::ImportValue` syntax (not `!ImportValue !Sub`)
- [ ] Correct resource references
- [ ] Valid AWS region-specific resources (e.g., PostgreSQL versions)
- [ ] Proper IAM permissions in capabilities
- [ ] Secrets exist before stack deployment

---

## Template Validation Command

```bash
# Validate before deployment
aws cloudformation validate-template \
  --template-body file://aws/cloudformation/01-vpc.yaml

aws cloudformation validate-template \
  --template-body file://aws/cloudformation/02-rds.yaml

aws cloudformation validate-template \
  --template-body file://aws/cloudformation/03-ecs-no-ecr.yaml
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-29 | Initial deployment, all fixes applied |

---

## Related Documentation

- [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) - Full deployment instructions
- [DEPLOYMENT-ISSUES-AND-FIXES.md](../DEPLOYMENT-ISSUES-AND-FIXES.md) - Issues encountered
- [TROUBLESHOOTING-CHECKLIST.md](../TROUBLESHOOTING-CHECKLIST.md) - Quick troubleshooting

---

**Document Version:** 1.0  
**Last Updated:** March 29, 2026
