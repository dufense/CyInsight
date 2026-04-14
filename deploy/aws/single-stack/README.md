# CyInsight - Cost-Optimized AWS Deployment (India)

## Overview

This is a **single-stack, cost-optimized deployment** of CyInsight on AWS India (ap-south-1) designed for:
- **Budget**: ₹35,000-50,000/month
- **Tenants**: 1-10
- **Events/Second**: < 1,000
- **Use Case**: MVP, POC, or small production

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS India (ap-south-1) - Cost-Optimized Deployment            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐    ┌──────────────────────────┐   │
│  │  MANAGEMENT + DATA      │    │  AWS Managed Services    │   │
│  │  (Combined)             │    │                          │   │
│  │                         │    │  • RDS PostgreSQL        │   │
│  │  • ECS Fargate          │    │    (Single-AZ)           │   │
│  │    2 tasks × 2 vCPU     │    │  • ElastiCache Redis     │   │
│  │    4 GB RAM             │    │    (Single node)         │   │
│  │                         │    │  • ClickHouse            │   │
│  │  • Application Load     │    │    (Single node + EFS)   │   │
│  │    Balancer             │    │  • S3 Bucket             │   │
│  │                         │    │                          │   │
│  └─────────────────────────┘    └──────────────────────────┘   │
│                                                                  │
│  VPC: 2 AZs with public/private/database subnets                │
│  Cost Optimization: Fargate Spot (60% savings)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- AWS CLI v2 installed and configured
- Docker installed
- AWS account with appropriate permissions
- Domain name (optional, for HTTPS)

### One-Command Deployment

```bash
cd /Users/poojabhavsar/Development/Cyinsight/deploy/aws/single-stack
chmod +x deploy.sh
./deploy.sh
```

### Manual Deployment

If you prefer to run each step manually:

#### 1. Set Environment Variables

```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export STACK_NAME=cyinsight-starter
```

#### 2. Build and Push Docker Image

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Create ECR repository (if not exists)
aws ecr create-repository --repository-name cyinsight --region $AWS_REGION 2>/dev/null || true

# Build and push
cd /Users/poojabhavsar/Development/Cyinsight
docker build -t cyinsight:latest .
docker tag cyinsight:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cyinsight:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cyinsight:latest
```

#### 3. Request ACM Certificate (for HTTPS)

```bash
# Optional - skip if using HTTP only
aws acm request-certificate \
    --domain-name app.yourdomain.com \
    --validation-method DNS \
    --region $AWS_REGION

# Validate via DNS, then get the certificate ARN
CERTIFICATE_ARN=$(aws acm list-certificates --region $AWS_REGION \
    --query "CertificateSummaryList[?DomainName=='app.yourdomain.com'].CertificateArn | [0]" \
    --output text)
```

#### 4. Deploy CloudFormation Stack

```bash
aws cloudformation deploy \
    --template-file cyinsight-starter.yml \
    --stack-name $STACK_NAME \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $AWS_REGION \
    --parameter-overrides \
        EnvironmentName=production \
        DomainName=app.yourdomain.com \
        CertificateArn=$CERTIFICATE_ARN \
        DBPassword=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24) \
        ImageTag=latest \
        EnableFargateSpot=true
```

#### 5. Get Deployment Outputs

```bash
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table
```

## Cost Breakdown

| Service | Configuration | Monthly Cost (₹) |
|---------|--------------|------------------|
| **ECS Fargate** | 2 tasks, 2 vCPU/4GB, Fargate Spot | ₹15,000-20,000 |
| **RDS PostgreSQL** | db.t3.medium, Single-AZ | ₹6,000-9,000 |
| **ClickHouse** | 1 task × 2 vCPU/4GB + EFS | ₹4,000-6,000 |
| **ElastiCache Redis** | cache.t3.micro × 1 | ₹2,000-2,500 |
| **Application Load Balancer** | 1 ALB + LCU | ₹3,000-3,500 |
| **S3 Storage** | 500 GB Standard | ₹1,000-1,500 |
| **Data Transfer** | ~100 GB/month | ₹1,000-1,500 |
| **NAT Gateway** | 1 NAT Gateway | ₹3,000-3,200 |
| **CloudWatch Logs** | 10 GB/day, 7-day retention | ₹1,500-2,000 |
| **Other (Secrets Manager, etc.)** | - | ₹1,000-1,500 |
| **TOTAL** | | **₹34,500-49,700** |
| **With Fargate Spot Discount** | 60% off compute | **₹30,000-42,000** |

### Cost Optimization Tips

1. **Enable Fargate Spot** (default): Saves 60-70% on compute costs
2. **Use Single-AZ RDS**: Saves ~₹9,000/month vs Multi-AZ
3. **ClickHouse replaces OpenSearch**: Saves ~₹5,000/month and simplifies the stack
4. **Reserved Capacity**: If you commit to 1 year, save 30-40% on RDS

## Operations

### Check Application Health

```bash
# Get application URL
APP_URL=$(aws cloudformation describe-stacks \
    --stack-name cyinsight-starter \
    --region ap-south-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`ApplicationURL`].OutputValue' \
    --output text)

# Check health
curl $APP_URL/healthz

# Expected output: {"status":"ok"}
```

### View Logs

```bash
# Real-time logs
aws logs tail /ecs/cyinsight-production --follow --region ap-south-1

# Last 100 lines
aws logs tail /ecs/cyinsight-production --last 100 --region ap-south-1
```

### Scale the Application

```bash
# Scale to 4 tasks
aws ecs update-service \
    --cluster cyinsight-production \
    --service cyinsight-production \
    --desired-count 4 \
    --region ap-south-1

# Scale back to 2 tasks
aws ecs update-service \
    --cluster cyinsight-production \
    --service cyinsight-production \
    --desired-count 2 \
    --region ap-south-1
```

### Database Access

```bash
# Get database endpoint
DB_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name cyinsight-starter \
    --region ap-south-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
    --output text)

# Connect via psql (requires AWS CLI session manager or bastion host)
# Note: Database is in private subnet, requires VPN or bastion for direct access
```

### Backup and Restore

```bash
# Create manual DB snapshot
aws rds create-db-snapshot \
    --db-instance-identifier cyinsight-db-production \
    --db-snapshot-identifier cyinsight-manual-$(date +%Y%m%d) \
    --region ap-south-1

# List snapshots
aws rds describe-db-snapshots \
    --db-instance-identifier cyinsight-db-production \
    --region ap-south-1
```

## Monitoring

### CloudWatch Alarms (Auto-Created)

The deployment creates these alarms automatically:

| Alarm | Threshold | Action |
|-------|-----------|--------|
| High CPU | > 80% | Scale up consideration |
| High DB Connections | > 80% of max | Check for connection leaks |

### Custom Dashboard

```bash
# Create a CloudWatch dashboard
aws cloudwatch put-dashboard \
    --dashboard-name CyInsight-Starter \
    --dashboard-body file://dashboard.json \
    --region ap-south-1
```

Sample dashboard.json:
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "ECS CPU Utilization",
        "metrics": [["AWS/ECS", "CPUUtilization", "ClusterName", "cyinsight-production"]],
        "period": 300,
        "yAxis": {"left": {"min": 0, "max": 100}}
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Database Connections",
        "metrics": [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "cyinsight-db-production"]],
        "period": 300
      }
    }
  ]
}
```

## Troubleshooting

### Application Won't Start

```bash
# Check ECS service events
aws ecs describe-services \
    --cluster cyinsight-production \
    --services cyinsight-production \
    --region ap-south-1 \
    --query 'services[0].events[:5]'

# Check stopped tasks
aws ecs list-tasks \
    --cluster cyinsight-production \
    --desired-status STOPPED \
    --region ap-south-1
```

### Database Connection Issues

```bash
# Check RDS status
aws rds describe-db-instances \
    --db-instance-identifier cyinsight-db-production \
    --region ap-south-1 \
    --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]'

# Check security group rules
aws ec2 describe-security-groups \
    --group-names cyinsight-rds-sg-production \
    --region ap-south-1
```

### High Costs

1. **Check Fargate Spot is enabled**:
   ```bash
   aws ecs describe-services \
       --cluster cyinsight-production \
       --services cyinsight-production \
       --region ap-south-1 \
       --query 'services[0].capacityProviderStrategy'
   ```

2. **Review CloudWatch Logs**:
   ```bash
   aws logs describe-log-groups --region ap-south-1
   ```

3. **Check S3 storage**:
   ```bash
   aws s3 ls s3://cyinsight-data-$AWS_ACCOUNT_ID-production --recursive --summarize
   ```

## Upgrading to Production (Option 2)

When you're ready to upgrade from Starter to Production:

1. **Backup your data**:
   ```bash
   aws rds create-db-snapshot \
       --db-instance-identifier cyinsight-db-production \
       --db-snapshot-identifier pre-upgrade-backup
   ```

2. **Migrate to Multi-AZ**:
   ```bash
   aws rds modify-db-instance \
       --db-instance-identifier cyinsight-db-production \
       --multi-az \
       --apply-immediately
   ```

3. **Deploy separate data plane** using the full 3-plane architecture

4. **Update Route 53** to point to new ALB

See the full deployment guide for Option 2 details.

## Cleanup

To delete all resources and stop billing:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack \
    --stack-name cyinsight-starter \
    --region ap-south-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
    --stack-name cyinsight-starter \
    --region ap-south-1

# Delete ECR images (optional)
aws ecr batch-delete-image \
    --repository-name cyinsight \
    --image-ids imageTag=latest \
    --region ap-south-1

# Delete S3 bucket (must be empty first)
aws s3 rb s3://cyinsight-data-$AWS_ACCOUNT_ID-production --force
```

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review CloudWatch logs: `/ecs/cyinsight-production`
3. Check AWS Health Dashboard
4. Open an AWS Support case if needed

## License

This deployment template is part of the CyInsight project.
