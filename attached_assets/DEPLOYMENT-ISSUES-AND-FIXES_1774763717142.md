# GRC Shield AWS Deployment - Issues & Fixes Documentation

**Date:** March 29, 2026  
**Status:** RESOLVED - Application now running successfully on ECS Fargate

---

## Summary of Issues Encountered

This document records all deployment issues encountered during the AWS ECS Fargate deployment of GRC Shield and their resolutions.

---

## 1. CloudFormation Template Issues

### Issue 1.1: Unicode Characters in Templates
**Problem:** Em-dashes (—) in CloudFormation template descriptions caused validation errors.

**Error:**
```
GroupDescription: ALB — allow inbound HTTP/HTTPS from internet
```

**Fix:** Replace with standard hyphens (-)
```yaml
GroupDescription: ALB - allow inbound HTTP/HTTPS from internet
```

**Files Affected:**
- `aws/cloudformation/01-vpc.yaml`
- `aws/cloudformation/02-rds.yaml`
- `aws/cloudformation/03-ecs.yaml`

---

### Issue 1.2: Invalid CloudFormation Intrinsic Function Syntax
**Problem:** `!ImportValue !Sub` pattern is not valid in CloudFormation.

**Error:**
```yaml
SubnetIds:
  - !ImportValue !Sub "${EnvironmentName}-DBSubnet1Id"
```

**Fix:** Use `Fn::ImportValue` with explicit function notation
```yaml
SubnetIds:
  - Fn::ImportValue: !Sub "${EnvironmentName}-DBSubnet1Id"
```

**Files Affected:**
- `aws/cloudformation/02-rds.yaml`
- `aws/cloudformation/03-ecs.yaml`

---

### Issue 1.3: PostgreSQL Version Not Available
**Problem:** PostgreSQL version 15.4 not available in ap-south-1 region.

**Fix:** Updated to version 15.14
```yaml
EngineVersion: "15.14"
```

**File Affected:**
- `aws/cloudformation/02-rds.yaml`

---

### Issue 1.4: Missing RuntimePlatform
**Problem:** ECS TaskDefinition didn't specify architecture for Mac builds.

**Error:** Tasks failing on Fargate with architecture mismatch.

**Fix:** Added explicit RuntimePlatform
```yaml
RuntimePlatform:
  CpuArchitecture: X86_64
  OperatingSystemFamily: LINUX
```

**File Affected:**
- `aws/cloudformation/03-ecs.yaml`

---

### Issue 1.5: ECR Repository Conflicts
**Problem:** CloudFormation template tries to create ECR repo that already exists.

**Error:**
```
Resource of type 'AWS::ECR::Repository' with identifier 'grc-shield/app' already exists.
```

**Fix Options:**
1. Create template variant without ECR resource: `03-ecs-no-ecr.yaml`
2. Use existing ECR repository in task definition
3. Import existing ECR repo into CloudFormation stack

**Recommended Approach:** Use separate ECR creation step before CloudFormation deployment.

---

## 2. Secrets Management Issues

### Issue 2.1: Missing Session Secret
**Problem:** ECS template requires `SessionSecretArn` parameter, but secret was never created.

**Error:** CloudFormation stack fails because secret doesn't exist.

**Fix:** Create session secret BEFORE deploying ECS stack:
```bash
aws secretsmanager create-secret \
  --name "grc-shield/session-secret" \
  --description "GRC Shield Session Secret" \
  --secret-string "$(openssl rand -hex 32)"
```

**Documentation Update Needed:**
- Add to deployment prerequisites in README
- Add to deployment script automation

---

## 3. Docker Build Issues

### Issue 3.1: Missing Python for Native Modules
**Problem:** `npm rebuild` fails for native modules (bufferutil) because Python is not available.

**Error:**
```
gyp ERR! find Python Python is not set from command line or npm configuration
gyp ERR! stack Error: Could not find any Python installation to use
```

**Fix:** Add Python and build tools to both builder and production stages
```dockerfile
# In builder stage
RUN apk add --no-cache python3 make g++

# In production stage  
RUN apk add --no-cache python3 make g++ dumb-init
```

**File Affected:**
- `Dockerfile`

---

### Issue 3.2: Architecture Mismatch (ARM64 vs AMD64)
**Problem:** Docker image built on Apple Silicon (ARM64) doesn't run on ECS Fargate (AMD64).

**Error:**
```
CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'
```

**Fix:** Use Docker buildx with platform specification
```bash
docker buildx create --use --name multiplatform-builder
docker buildx build \
  --platform linux/amd64 \
  -t "${ECR_URI}:latest" \
  -f Dockerfile \
  --push .
```

**Documentation Update Needed:**
- Add to CI/CD pipeline requirements
- Document for developers on Apple Silicon Macs

---

### Issue 3.3: Permission Issues with Uploads Directory
**Problem:** Application can't write to `/app/uploads` directory.

**Error:**
```
Error: EACCES: permission denied, mkdir '/app/uploads/policies'
```

**Root Causes:**
1. Directory ownership not set correctly for `grcshield` user
2. Volume mount in ECS task definition overriding container permissions

**Fix 1:** Update Dockerfile with proper permissions
```dockerfile
RUN mkdir -p /app/uploads /app/tmp /app/logs && \
    chown -R grcshield:nodejs /app/uploads /app/tmp /app/logs && \
    chmod -R 755 /app/uploads /app/tmp /app/logs
```

**Fix 2:** Remove uploads volume from ECS task definition
```yaml
# Remove these from task definition:
# Volumes:
#   - Name: uploads-storage  
# MountPoints:
#   - SourceVolume: uploads-storage
#     ContainerPath: /app/uploads
```

**Files Affected:**
- `Dockerfile`
- `aws/cloudformation/03-ecs.yaml`

---

## 4. Database Connectivity Issues

### Issue 4.1: Missing SSL Mode for RDS
**Problem:** Application can't connect to RDS PostgreSQL without SSL.

**Fix:** Add `sslmode=require` to DATABASE_URL
```
postgresql://user:pass@host:5432/dbname?sslmode=require
```

**Implementation:**
The `docker-entrypoint.sh` already handles SSL if present in URL:
```javascript
const useSsl = url.includes('sslmode=require');
const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
```

**Fix Location:** Update Secrets Manager secret to include `?sslmode=require`

---

## 5. ECS Task Definition Issues

### Issue 5.1: Volume Mounts Shadowing Container Directories
**Problem:** ECS volumes mounted over container directories override permissions set in Dockerfile.

**Example:**
```yaml
Volumes:
  - Name: uploads-storage  # Empty volume mounts over /app/uploads
MountPoints:
  - SourceVolume: uploads-storage
    ContainerPath: /app/uploads  # This hides the Docker image's /app/uploads
```

**Impact:**
- Container user loses write access to uploads directory
- Application crashes when trying to create upload subdirectories

**Fix:** Remove the uploads-storage volume entirely, use container filesystem
```yaml
# Keep only tmp-storage for /tmp
Volumes:
  - Name: tmp-storage
MountPoints:
  - SourceVolume: tmp-storage
    ContainerPath: /tmp
```

**File Affected:**
- `aws/cloudformation/03-ecs.yaml`

---

## Configuration Changes Required

### Application Code Changes:

1. **`server/index.ts`**
   - Added `useSecureCookies` environment variable check
   - Updated CSRF cookie configuration to use `useSecureCookies`
   - Allows disabling secure cookies for HTTP deployments

2. **`Dockerfile`**
   - Add Python and build tools to both stages
   - Add `chmod -R 755 /app/uploads` to set proper permissions

### Infrastructure Changes:

3. **`aws/cloudformation/01-vpc.yaml`**
   - Replace em-dashes with standard hyphens

4. **`aws/cloudformation/02-rds.yaml`**
   - Replace em-dashes with standard hyphens
   - Fix Fn::ImportValue syntax
   - Update PostgreSQL version to 15.14

5. **`aws/cloudformation/03-ecs.yaml`**
   - Replace em-dashes with standard hyphens
   - Fix Fn::ImportValue syntax
   - Add RuntimePlatform configuration
   - Remove uploads-storage volume (or document when to use it)
   - Make ECR repository creation optional
   - Add SECURE_COOKIES environment variable (set to "false" for HTTP)

### New Files Created:

1. **`aws/cloudformation/03-ecs-no-ecr.yaml`**
   - ECS template without ECR resource creation
   - Use when ECR repo already exists

---

## Deployment Prerequisites Checklist

Before deploying, ensure:

- [ ] AWS CLI configured with appropriate credentials
- [ ] Docker buildx configured for multi-platform builds
- [ ] Session secret created in Secrets Manager
- [ ] ECR repository created (if not using CloudFormation to create it)
- [ ] PostgreSQL 15.14 available in target region
- [ ] All CloudFormation templates validated
- [ ] **SECURE_COOKIES environment variable set** ("false" for HTTP, "true" or unset for HTTPS)

---

## Recommended Deployment Order

1. **Create Prerequisites**
   ```bash
   # Create session secret
   aws secretsmanager create-secret \
     --name "grc-shield/session-secret" \
     --secret-string "$(openssl rand -hex 32)"
   
   # Create ECR repository
   aws ecr create-repository --repository-name grc-shield/app
   ```

2. **Deploy VPC Stack**
   ```bash
   aws cloudformation create-stack \
     --stack-name grc-shield-vpc \
     --template-body file://01-vpc.yaml
   ```

3. **Deploy RDS Stack**
   ```bash
   aws cloudformation create-stack \
     --stack-name grc-shield-rds \
     --template-body file://02-rds.yaml
   ```

4. **Build and Push Docker Image**
   ```bash
   docker buildx build \
     --platform linux/amd64 \
     -t "${ECR_URI}:latest" \
     -f Dockerfile \
     --push .
   ```

5. **Update DATABASE_URL with SSL**
   ```bash
   # Get current secret and update DATABASE_URL to include sslmode=require
   ```

6. **Deploy ECS Stack**
   ```bash
   aws cloudformation create-stack \
     --stack-name grc-shield-ecs \
     --template-body file://03-ecs-no-ecr.yaml
   ```

---

## Lessons Learned

1. **Always validate CloudFormation templates** before deployment using `aws cloudformation validate-template`

2. **Test Docker images locally** with the same user/permissions as production:
   ```bash
   docker run --user grcshield -e DATABASE_URL=... myimage
   ```

3. **Use Docker buildx for cross-platform builds** when developing on ARM64 (Apple Silicon)

4. **Be careful with volume mounts** - they can override Dockerfile permissions

5. **RDS requires SSL** - always include `sslmode=require` in production DATABASE_URL

6. **Create prerequisites first** - secrets and ECR repos should exist before stack deployment

7. **Secure cookies require HTTPS** - When `secure: true` is set on cookies, browsers will refuse them over HTTP. For HTTP-only deployments (like ALB without SSL), you must set `SECURE_COOKIES=false`.

8. **White page often means CSRF/auth issues** - If the HTML loads but the page is blank, check:
   - Browser DevTools for JavaScript errors
   - Network tab for 403 responses
   - CSRF cookie is being set (check Application > Cookies in DevTools)
   - Server logs for authentication failures

9. **ALB health checks ≠ Application health** - The ALB can show healthy while the app has runtime issues. Always test actual API endpoints and user flows.

---

## My Deployment Mistakes (Learning Log)

### Mistake 1: Reactive Debugging Without a Plan
**What I did:** Made multiple task definition revisions (29→30→31→32) without a clear strategy.

**Why it was wrong:** Created confusion about which image had which fixes. Each revision was a band-aid instead of a solution.

**What I should have done:** Created a fix plan FIRST, then executed it once with a single clean deployment.

---

### Mistake 2: Assumed Database Was Seeded
**What I did:** Kept trying to login without verifying the admin user actually existed in the database.

**Why it was wrong:** Wasted time debugging CSRF and frontend issues when the real problem was missing database data.

**What I should have done:** Checked the database first - seed logs showed "Skipping full database seeding in production" and then license_key constraint errors.

---

### Mistake 3: Didn't Understand ECS Deployment Flow
**What I did:** Didn't set `healthCheckGracePeriodSeconds` properly, didn't wait for deployments to stabilize before testing.

**Why it was wrong:** ECS needs time to start tasks and pass health checks. Testing immediately after update-service gave false negatives.

**What I should have done:** Waited for rolloutState=COMPLETED and confirmed running tasks before testing.

---

### Mistake 4: Didn't Verify Image Platform
**What I did:** First image build didn't have proper AMD64 manifest for ECS.

**Why it was wrong:** Built on Apple Silicon without ensuring cross-platform compatibility, causing "CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'"

**What I should have done:** Used `--provenance=false` flag with buildx to ensure single-platform manifest.

---

### Mistake 5: Tried to Fix Database Without Access
**What I did:** Attempted to use psql and postgres MCP tools without having proper connectivity.

**Why it was wrong:** Didn't verify database access before attempting fixes. Multiple failed connection attempts.

**What I should have done:** Verified database connectivity FIRST, then planned the SQL execution method.

---

### Mistake 6: Didn't Check Database Schema Constraints
**What I did:** Didn't look at the licenses table schema before seeding failed.

**Why it was wrong:** The seed code assumed license_key could be null, but the schema requires it. Could have caught this earlier.

**What I should have done:** Examined the schema or seed code before deploying.

---

## 6. Application Runtime Issues

### Issue 6.1: White Page / Cannot Login - CSRF Cookie Secure Flag

**Problem:** Application loads but shows a white page, or login fails with "Invalid or missing CSRF token" error.

**Root Cause:** The CSRF cookie is configured with `secure: true` in production, but the ALB is using HTTP (not HTTPS). Browsers refuse to set `Secure` cookies over HTTP connections.

**Symptoms:**
- Page loads but shows white/blank screen
- Browser DevTools Console may show JavaScript errors
- Network tab shows 403 Forbidden on API calls
- Login API returns: `{"message":"Invalid or missing CSRF token"}`
- Server logs show 403 for POST /api/login
- CSRF token endpoint works but cookie is not set in browser

**Diagnosis Steps:**
```bash
# 1. Check if CSRF cookie is being set
curl -v http://YOUR-ALB/api/csrf-token 2>&1 | grep -i "set-cookie"

# 2. Check login response
curl -X POST http://YOUR-ALB/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'

# 3. Check server logs for 403 errors
aws logs tail "/ecs/grc-shield/app" --since 10m
```

**Fix:** 

1. **Update server/index.ts** to respect SECURE_COOKIES environment variable:
```typescript
const useSecureCookies = process.env.SECURE_COOKIES === "true" ||
  (isProduction && process.env.SECURE_COOKIES !== "false");

// In CSRF configuration:
cookieOptions: {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: useSecureCookies && !isReplitPreview,  // Now respects env var
  path: "/",
},
```

2. **Update ECS Task Definition** to set SECURE_COOKIES=false:
```yaml
Environment:
  - Name: SECURE_COOKIES
    Value: "false"
```

**Note:** This fix is for HTTP-only deployments. For production with HTTPS, set `SECURE_COOKIES=true` or remove the environment variable.

**Files Affected:**
- `server/index.ts`
- `aws/cloudformation/03-ecs.yaml`

---

### Issue 6.2: API Routes Returning HTML Instead of JSON

**Problem:** API endpoints like `/api/user` return HTML (index.html) instead of JSON.

**Cause:** This is expected behavior for unauthenticated requests in the SPA fallback handler. The server returns index.html for client-side routing.

**Expected Behavior:**
- Authenticated: Returns JSON user data
- Unauthenticated: Returns HTML (SPA fallback)

**Not an Error** - This is by design for the React frontend.

---

## Troubleshooting Checklist

### White Page / Login Issues

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Health endpoint | `curl http://ALB/api/health` | JSON with status: healthy |
| HTML loads | `curl http://ALB/` | HTML with `<div id="root">` |
| JS assets load | `curl -I http://ALB/assets/index-*.js` | HTTP 200 |
| CSRF token | `curl http://ALB/api/csrf-token` | JSON with csrfToken |
| **CSRF cookie set** | `curl -v http://ALB/api/csrf-token 2>&1 \| grep Set-Cookie` | **Must show `__csrf` cookie** |
| Login works | `curl -X POST ... /api/login` | JSON with user data (not 403) |

### If CSRF Cookie Not Set:
1. Check if using HTTP (not HTTPS)
2. Verify SECURE_COOKIES=false is set in task definition
3. Redeploy with fixed image

### Common Log Errors:
```bash
# View recent logs
aws logs tail "/ecs/grc-shield/app" --since 10m

# Check for 403 errors
aws logs tail "/ecs/grc-shield/app" --since 10m | grep 403

# Check for errors
aws logs tail "/ecs/grc-shield/app" --since 10m | grep -i error
```

---

## Current Deployment Status

✅ **VPC Stack:** CREATE_COMPLETE  
✅ **RDS Stack:** CREATE_COMPLETE  
✅ **ECS Stack:** CREATE_COMPLETE  
✅ **Application:** RUNNING (1 task, Revision 33)  
✅ **Health Checks:** PASSING  
✅ **Load Balancer:** REGISTERED  
✅ **CSRF Cookie:** WORKING (SECURE_COOKIES=false)  
✅ **Database:** SEEDED (admin user created)  
✅ **Login:** WORKING  
⚠️ **HTTPS:** NOT CONFIGURED (using HTTP)  

**Application URL:** http://grc-shield-alb-909687856.ap-south-1.elb.amazonaws.com

**Default Login:**
- Username: `admin`
- Password: `Admin@123`
- Role: Super Administrator

---

## Summary of Fixes Applied

### Fix 1: CSRF Cookie Secure Flag (CRITICAL)
**Problem:** White page / cannot login because browser rejected `Secure` cookies over HTTP.

**Solution:** 
- Modified `server/index.ts` to respect `SECURE_COOKIES` environment variable
- Set `SECURE_COOKIES=false` in ECS task definition

### Fix 2: Database Seeding License Key Constraint (CRITICAL)
**Problem:** Seed failed with `null value in column "license_key" violates not-null constraint`.

**Solution:**
- Modified `server/seed.ts` to include `licenseKey` field in license inserts
- Used unique license keys with timestamp + random suffix

### Fix 3: Health Check Grace Period
**Problem:** ECS was killing tasks before they finished starting.

**Solution:**
- Set `healthCheckGracePeriodSeconds: 180` in ECS service
- Gave tasks 3 minutes to initialize before health checks count

---

## What I Did Wrong (Learning Summary)

| Mistake | Impact | Lesson |
|---------|--------|--------|
| Reactive debugging without plan | 4 task definition revisions, confusion | Plan first, execute once |
| Didn't check database seeding | Wasted time on frontend debugging | Verify data exists before testing features |
| Didn't understand ECS deployment flow | Tested before deployment stabilized | Wait for rolloutState=COMPLETED |
| Image platform mismatch | CannotPullContainerError | Use `--provenance=false` with buildx |
| Tried DB fixes without connectivity | Multiple failed connection attempts | Verify access before attempting fixes |

---

## Working Deployment Configuration

**Task Definition:** Revision 33
- Image: `grc-shield/app:v1.0.17-final`
- CPU: 512, Memory: 1024
- Environment:
  - NODE_ENV=production
  - SECURE_COOKIES=false
  - RUN_SEED=true (for initial seeding)
  - PORT=5000

**ECS Service:**
- Health Check Grace Period: 180 seconds
- Desired Count: 1
- Deployment: Rolling update

**Files Modified:**
1. `server/index.ts` - CSRF cookie logic
2. `server/seed.ts` - License key generation
3. `DEPLOYMENT-ISSUES-AND-FIXES.md` - Documentation
4. `TROUBLESHOOTING-CHECKLIST.md` - New troubleshooting guide
