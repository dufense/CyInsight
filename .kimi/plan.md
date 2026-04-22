# Fix Background Init Error & Complete Deployment

## Problem
The database migrations are now working (0023 applied successfully), but background initialization fails with:
```
TypeError: oIe.default is not a constructor
```

## Root Cause
`connect-redis` is externalized in the esbuild bundle (`script/build.ts` allowlist does not include it). Because the package sets `__esModule = true` in its CJS build, esbuild's `__toESM` interop helper wraps it incorrectly: `import RedisStore from "connect-redis"` becomes `{ default: { default: RedisStore } }` at runtime, so `new RedisStore(...)` throws.

## Fix
Add `"connect-redis"` to the esbuild allowlist so it gets bundled inline instead of externalized.

## Steps
1. Edit `script/build.ts` — add `"connect-redis"` to the `allowlist` array
2. Rebuild Docker image (`docker build --platform linux/amd64 -t cyinsight:latest .`)
3. Push to ECR (`docker push 200810847769.dkr.ecr.ap-south-1.amazonaws.com/cyinsight:latest`)
4. Force ECS redeployment (`aws ecs update-service --cluster cyinsight-production --service cyinsight-production --force-new-deployment`)
5. Verify CloudWatch logs show no constructor error and `ready: true`
6. Verify ALB serves the login page (HTTP 200)
