#!/bin/bash
##############################################################################
# CyInsight Health Check & Monitoring Script
# Usage: ./health-check.sh [stack-name]
##############################################################################

STACK_NAME="${1:-cyinsight-starter}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

echo "=============================================="
echo "   CyInsight Health Check"
echo "   Stack: $STACK_NAME"
echo "   Region: $AWS_REGION"
echo "=============================================="
echo ""

# Get stack outputs
echo "📋 Stack Outputs:"
echo "-----------------"
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table 2>/dev/null || {
    echo "❌ Stack not found: $STACK_NAME"
    exit 1
}

echo ""

# Get application URL
APP_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApplicationURL`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$APP_URL" ] && [ "$APP_URL" != "None" ]; then
    echo "🌐 Application Health Check:"
    echo "----------------------------"
    echo "URL: $APP_URL"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/healthz" 2>/dev/null || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "✅ Health Check: PASSED (HTTP $HTTP_STATUS)"
        HEALTH_RESPONSE=$(curl -s "$APP_URL/healthz" 2>/dev/null)
        echo "Response: $HEALTH_RESPONSE"
    else
        echo "❌ Health Check: FAILED (HTTP $HTTP_STATUS)"
    fi
    echo ""
fi

# Check ECS Service
echo "🚀 ECS Service Status:"
echo "---------------------"
CLUSTER_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterName`].OutputValue' \
    --output text 2>/dev/null)

SERVICE_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSServiceName`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$CLUSTER_NAME" ] && [ "$CLUSTER_NAME" != "None" ]; then
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].{Name:serviceName,Status:status,Desired:desiredCount,Running:runningCount,Pending:pendingCount}' \
        --output table 2>/dev/null || echo "❌ Could not retrieve ECS status"
fi
echo ""

# Check RDS
echo "🗄️  Database Status:"
echo "-------------------"
DB_INSTANCE=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$DB_INSTANCE" ] && [ "$DB_INSTANCE" != "None" ]; then
    aws rds describe-db-instances \
        --db-instance-identifier cyinsight-db-production \
        --region $AWS_REGION \
        --query 'DBInstances[0].{Status:DBInstanceStatus,Engine:Engine,Version:EngineVersion,InstanceClass:DBInstanceClass}' \
        --output table 2>/dev/null || echo "❌ Could not retrieve RDS status"
fi
echo ""

# Check ALB
echo "⚖️  Load Balancer Status:"
echo "------------------------"
ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ]; then
    echo "DNS: $ALB_DNS"
    
    # Get ALB ARN
    ALB_ARN=$(aws elbv2 describe-load-balancers \
        --names cyinsight-alb-production \
        --region $AWS_REGION \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text 2>/dev/null)
    
    if [ -n "$ALB_ARN" ] && [ "$ALB_ARN" != "None" ]; then
        aws elbv2 describe-target-health \
            --target-group-arn $(aws elbv2 describe-target-groups \
                --load-balancer-arn $ALB_ARN \
                --region $AWS_REGION \
                --query 'TargetGroups[0].TargetGroupArn' \
                --output text 2>/dev/null) \
            --region $AWS_REGION \
            --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State]' \
            --output table 2>/dev/null || echo "⚠️  Could not retrieve target health"
    fi
fi
echo ""

# Cost Estimate
echo "💰 Monthly Cost Estimate:"
echo "------------------------"
echo "With Fargate Spot:    ₹30,000 - 42,000"
echo "Without Fargate Spot: ₹45,000 - 55,000"
echo ""

# Recommendations
echo "💡 Quick Actions:"
echo "----------------"
echo "View logs:     aws logs tail /ecs/cyinsight-production --follow --region $AWS_REGION"
echo "Scale up:      aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 4 --region $AWS_REGION"
echo "Scale down:    aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 2 --region $AWS_REGION"
echo ""

echo "=============================================="
echo "   Health Check Complete"
echo "=============================================="
