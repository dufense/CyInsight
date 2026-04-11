# Root Cause Analysis (RCA) Report

## GRC Shield Database Seeding Failures Due to SSL Certificate Chain Validation

| Field | Value |
|-------|-------|
| **RCA ID** | RCA-GRC-2026-04-01-001 |
| **Date** | April 1, 2026 |
| **Severity** | High |
| **Status** | ✅ Resolved |
| **Reported By** | Operations Team |
| **Resolved By** | DevOps Team |

---

## 1. Executive Summary

During the GRC Shield production deployment, ECS tasks failed to complete database seeding due to PostgreSQL SSL certificate chain validation errors. The application could establish initial database connectivity but failed during migration and seeding phases when using SSL/TLS connections to Amazon RDS.

**Impact**: Deployment delayed by ~2 hours while root cause was identified and resolved.

---

## 2. Problem Statement

### Symptoms
1. ECS tasks started successfully but exited with code 1 during migrations
2. Error message: `SELF_SIGNED_CERT_IN_CHAIN`
3. Initial database connection succeeded, but subsequent operations failed
4. CloudWatch logs showed repeated SSL-related errors during seeding

### Error Log
```
Error: self-signed certificate in certificate chain
    at /app/node_modules/pg-pool/index.js:45:11
    at process.processTicksAndRejections (node:internal/process/task_queues:95:95)
    code: 'SELF_SIGNED_CERT_IN_CHAIN'
```

---

## 3. Root Cause Analysis

### Timeline of Events

| Time (IST) | Event |
|------------|-------|
| 2026-04-01 10:00 | Initial deployment started with SSL enabled (`DB_SSL=true`, `PGSSLMODE=require`) |
| 2026-04-01 10:05 | Tasks failing with SSL certificate errors |
| 2026-04-01 10:15 | Diagnosed RDS parameter group - `rds.force_ssl=1` |
| 2026-04-01 10:30 | Changed RDS parameter to `rds.force_ssl=0` and rebooted |
| 2026-04-01 10:45 | CloudWatch log group `/ecs/grc-shield` missing - manually created |
| 2026-04-01 11:00 | IAM roles missing - manually created task and execution roles |
| 2026-04-01 11:15 | Task definition updated to disable SSL (`DB_SSL=false`) |
| 2026-04-01 11:30 | Application started successfully with all data seeded |

### Contributing Factors

1. **RDS SSL Enforcement**
   - RDS parameter group had `rds.force_ssl=1` enabled
   - Node.js `pg` driver could not validate RDS self-signed certificate chain
   - The `NODE_TLS_REJECT_UNAUTHORIZED=0` environment variable did not affect PostgreSQL driver's SSL handling

2. **Missing CloudWatch Log Group**
   - ECS task definition referenced `/ecs/grc-shield` log group
   - Log group did not exist, causing task initialization failures
   - Error: `ResourceNotFoundException: The specified log group does not exist`

3. **Missing IAM Roles**
   - CloudFormation template did not create required ECS task roles
   - Error: `ECS was unable to assume the role 'arn:aws:iam::...:role/grc-shield-ecs-task-role'`
   - Both `grc-shield-ecs-task-role` and `grc-shield-ecs-execution-role` were missing

---

## 4. Technical Details

### SSL/TLS Configuration Conflict

**Original Configuration (Failed)**:
```yaml
DB_SSL: "true"
PGSSLMODE: "require"
NODE_TLS_REJECT_UNAUTHORIZED: "0"
```

**Issue**: The `pg` (node-postgres) driver uses its own SSL implementation that doesn't respect `NODE_TLS_REJECT_UNAUTHORIZED`. The driver attempted to verify the RDS certificate chain, which failed because RDS uses self-signed certificates that weren't properly configured in the container.

**Working Configuration (Resolved)**:
```yaml
DB_SSL: "false"
PGSSLMODE: "disable"
```

### Code Analysis

The issue occurred in `GRC/server/seed.ts` during the `seedDatabase()` function:

```typescript
// The seed function attempts database operations after migrations
export async function seedDatabase() {
  // This succeeded because initial connection was established
  await db.execute(sql`...`); 
  
  // This failed during drizzle-kit push due to SSL validation
  // Error propagated from pg-pool through drizzle-orm
}
```

### Network Flow

```
ECS Task → RDS Security Group (5432) → PostgreSQL
   ↓
SSL Handshake Initiated
   ↓
Certificate Validation Failed (self-signed cert in chain)
   ↓
Connection Rejected → Task Exit
```

---

## 5. Resolution

### Immediate Fix

1. **Disabled SSL for RDS Connections**
   - Updated task definition revision 45
   - Set `DB_SSL=false` and `PGSSLMODE=disable`
   - Application now uses unencrypted connections within VPC

2. **Created Missing CloudWatch Log Group**
   ```bash
   aws logs create-log-group --log-group-name /ecs/grc-shield --region ap-south-1
   aws logs put-retention-policy --log-group-name /ecs/grc-shield --retention-in-days 30
   ```

3. **Created Missing IAM Roles**
   - Created `grc-shield-ecs-task-role` with proper trust policy
   - Created `grc-shield-ecs-execution-role` for ECS agent
   - Attached required managed policies

### Security Considerations

While disabling SSL is not ideal, the risk is mitigated because:
- Traffic remains within AWS VPC (private subnets)
- RDS security group only allows connections from ECS security group
- No public access to database endpoints
- Future: Implement proper RDS CA certificate bundle in container

---

## 6. Lessons Learned

### What Went Wrong

1. **Inadequate Pre-Deployment Testing**
   - Local development didn't test SSL configuration against actual RDS
   - Docker image didn't include RDS CA certificate bundle

2. **CloudFormation Template Gaps**
   - Missing CloudWatch log group creation
   - Missing IAM role definitions
   - RDS parameter group not configurable

3. **Insufficient Documentation**
   - SSL configuration options not documented
   - No troubleshooting guide for SSL-related errors

### What Went Right

1. **Quick Diagnosis**
   - Error logs were clear and pointed to SSL issue
   - CloudWatch logs provided immediate visibility

2. **Workaround Available**
   - VPC isolation allowed temporary SSL disablement
   - No data loss or corruption during troubleshooting

---

## 7. Action Items

### Immediate (Completed)

- [x] Disable SSL in task definition for production deployment
- [x] Create CloudWatch log group manually
- [x] Create required IAM roles
- [x] Update deployment documentation

### Short-term (Next Sprint)

- [ ] Update CloudFormation templates to create log groups
- [ ] Add IAM role creation to CloudFormation
- [ ] Document SSL configuration requirements
- [ ] Add pre-deployment SSL connectivity test

### Long-term (Next Quarter)

- [ ] Implement RDS CA certificate bundle in Docker image
- [ ] Re-enable SSL with proper certificate validation
- [ ] Add automated integration tests with SSL enabled
- [ ] Implement RDS Proxy for connection pooling and SSL termination

---

## 8. Prevention Measures

### Code Changes

1. **Enhanced Error Handling**
   ```typescript
   // Add better SSL error detection
   if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
     console.error('SSL certificate validation failed. Consider disabling DB_SSL or adding CA bundle.');
   }
   ```

2. **Configuration Validation**
   - Add startup check to validate SSL configuration
   - Log SSL mode on application startup

### Process Changes

1. **Pre-Deployment Checklist**
   - [ ] Verify CloudWatch log groups exist
   - [ ] Verify IAM roles exist with correct policies
   - [ ] Test database connectivity with SSL enabled
   - [ ] Document SSL bypass if required

2. **Documentation Updates**
   - Document SSL configuration options
   - Add troubleshooting section for common SSL errors
   - Include IAM role requirements in deployment guide

---

## 9. Appendix

### Related Documentation

- Change Request: `CHANGE_REQUEST.md`
- Deployment Guide: `DEPLOYMENT_GUIDE.md`
- Release Notes: `RELEASE_NOTES.md`

### AWS Resources

| Resource | ARN/Name |
|----------|----------|
| ECS Task Definition | `arn:aws:ecs:ap-south-1:200810847769:task-definition/grc-shield-app:45` |
| RDS Parameter Group | `grc-shield-postgres15-params` |
| CloudWatch Log Group | `/ecs/grc-shield` |
| ECS Task Role | `grc-shield-ecs-task-role` |
| ECS Execution Role | `grc-shield-ecs-execution-role` |

---

*Document generated: April 1, 2026*  
*Classification: Internal*  
*Review Date: April 15, 2026*
