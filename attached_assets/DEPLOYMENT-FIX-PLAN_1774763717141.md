# GRC Shield AWS Deployment - Fix Plan

## Current State Analysis

### What's Working:
- ✅ VPC, RDS, ECS stacks are created
- ✅ ECS task is running and passing health checks
- ✅ ALB is serving traffic
- ✅ CSRF cookie is now being set (with SECURE_COOKIES=false)

### What's Broken:
- ❌ Database seeding fails with license_key constraint error
- ❌ No admin user exists in database
- ❌ Login fails with 401 (user not found)

---

## Root Cause Analysis

### 1. Database Seeding Failure
**Error:** `null value in column "license_key" of relation "licenses" violates not-null constraint`

**Why:** The seed code tries to create a license without a license_key, but the schema requires it.

### 2. ECS Deployment Confusion
I've been making reactive changes without a clear deployment strategy:
- Multiple task definition revisions (29, 30, 31, 32)
- Unclear which image has which fixes
- No clear rollback strategy

---

## The Fix Strategy

### Phase 1: Fix Database (Manual SQL)
Since the app seeding is broken, manually insert the minimum required data:

1. Create tenant
2. Create license with valid key
3. Create admin user
4. Create tenant_frameworks entry

### Phase 2: Fix Application Code
1. Fix server/index.ts CSRF cookie logic ✅ (Already done)
2. Fix seed code to handle license_key (optional, for future deployments)

### Phase 3: Create Clean Deployment
1. Build ONE final Docker image with all fixes
2. Update task definition with correct environment variables
3. Force new deployment with proper health check grace period

---

## Detailed Implementation

### Step 1: Database Fix (Execute via psql or AWS ECS Exec)

```sql
-- 1. Ensure demo tenant exists
INSERT INTO tenants (
    id, name, subdomain, status, industry, size, region, 
    primary_contact_email, timezone, settings, created_at, updated_at
) VALUES (
    'd0000000-demo-0000-0000-000000000001',
    'Demo Tenant',
    'demo',
    'active',
    'Technology',
    'medium',
    'ap-south-1',
    'admin@grcshield.com',
    'Asia/Kolkata',
    '{}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Create license with required key
INSERT INTO licenses (
    id, license_key, tenant_id, tier, max_users, max_auditors, max_frameworks,
    modules, status, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'DEMO-LICENSE-' || extract(epoch from now())::bigint,
    'd0000000-demo-0000-0000-000000000001',
    'enterprise',
    100,
    10,
    20,
    '{"ISO 27001","NCA ECC","CBB","SAMA CSF","PCI DSS","GDPR"}',
    'active',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- 3. Create admin user (password: Admin@123)
INSERT INTO users (
    id, tenant_id, username, email, password, full_name, role,
    active, email_verified, mfa_enabled, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'd0000000-demo-0000-0000-000000000001',
    'admin',
    'admin@grcshield.com',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'System Administrator',
    'administrator',
    true,
    true,
    false,
    NOW(),
    NOW()
) ON CONFLICT (username) DO UPDATE SET 
    password = EXCLUDED.password,
    updated_at = NOW();
```

### Step 2: Build Final Image

```bash
# Single clean image with all fixes
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -t 200810847769.dkr.ecr.ap-south-1.amazonaws.com/grc-shield/app:v1.0.16-final \
  -f Dockerfile \
  --push .
```

### Step 3: Create Clean Task Definition

Key environment variables:
```yaml
Environment:
  - Name: NODE_ENV
    Value: "production"
  - Name: SECURE_COOKIES
    Value: "false"  # Required for HTTP ALB
  - Name: PORT
    Value: "5000"
  - Name: UPLOAD_DIR
    Value: "/app/uploads"
  - Name: NODE_OPTIONS
    Value: "--max-old-space-size=512"
  # Note: RUN_SEED removed - database will be seeded manually
```

### Step 4: Update Service

```bash
aws ecs update-service \
  --cluster grc-shield-cluster \
  --service grc-shield-app \
  --task-definition grc-shield-app:NEW_REVISION \
  --health-check-grace-period-seconds 120 \
  --force-new-deployment
```

---

## Verification Steps

1. **Health Check:**
   ```bash
   curl http://ALB/api/health
   ```

2. **CSRF Cookie:**
   ```bash
   curl -v http://ALB/api/csrf-token 2>&1 | grep "__csrf"
   ```

3. **Login:**
   ```bash
   # Get CSRF token
   CSRF=$(curl -s -c cookies.txt http://ALB/api/csrf-token | jq -r '.csrfToken')
   
   # Login
   curl -X POST -b cookies.txt \
     -H "Content-Type: application/json" \
     -H "X-CSRF-Token: $CSRF" \
     -d '{"username":"admin","password":"Admin@123"}' \
     http://ALB/api/auth/login
   ```

---

## Lessons Learned

1. **Don't make reactive changes** - Plan the deployment first
2. **Database seeding must be reliable** - Test seed code before deployment
3. **One image, one task definition** - Avoid multiple confusing revisions
4. **Environment variables are not runtime-configurable for SPAs** - Backend only
5. **Health check grace period is critical** - ECS needs time to start tasks

---

## Current Priority Actions

1. ✅ CSRF fix applied
2. 🔄 Database manual seeding needed
3. 🔄 Clean deployment needed
