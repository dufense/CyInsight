#!/bin/bash
set -euo pipefail

# Apply ClickHouse S3 tiering CloudFormation update
# This script updates the starter stack with:
#   1. S3 IAM permissions for ClickHouse
#   2. S3 disk configuration in ClickHouse container
#   3. S3 lifecycle policies for clickhouse/warm/ and clickhouse/cold/
#
# Usage:
#   export AWS_REGION=ap-south-1
#   export STACK_NAME=cyinsight-starter
#   ./apply-ch-s3-update.sh

STACK_NAME="${STACK_NAME:-cyinsight-starter}"
REGION="${AWS_REGION:-ap-south-1}"
TEMPLATE_FILE="$(dirname "$0")/cyinsight-starter.yml"

echo "=== ClickHouse S3 Tiering Update ==="
echo "Stack:   $STACK_NAME"
echo "Region:  $REGION"
echo ""

# Validate template first
echo "[1/4] Validating CloudFormation template..."
aws cloudformation validate-template \
  --template-body "file://$TEMPLATE_FILE" \
  --region "$REGION"

# Update stack
echo "[2/4] Updating CloudFormation stack..."
aws cloudformation update-stack \
  --stack-name "$STACK_NAME" \
  --template-body "file://$TEMPLATE_FILE" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameters ParameterKey=EnvironmentName,UsePreviousValue=true \
               ParameterKey=DomainName,UsePreviousValue=true \
               ParameterKey=CertificateArn,UsePreviousValue=true \
               ParameterKey=DBUsername,UsePreviousValue=true \
               ParameterKey=DBPassword,UsePreviousValue=true \
               ParameterKey=ImageTag,UsePreviousValue=true \
               ParameterKey=SessionSecret,UsePreviousValue=true \
               ParameterKey=EnableFargateSpot,UsePreviousValue=true

echo "[3/4] Waiting for stack update to complete..."
aws cloudformation wait stack-update-complete \
  --stack-name "$STACK_NAME" \
  --region "$REGION"

echo "[4/4] Forcing new ECS deployment for ClickHouse..."
CLUSTER_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterName`].OutputValue' \
  --output text)

aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "cyinsight-clickhouse-production" \
  --force-new-deployment \
  --region "$REGION"

echo ""
echo "=== Update Complete ==="
echo "ClickHouse will restart with S3 disk configuration."
echo "Verify with: aws ecs describe-services --cluster $CLUSTER_NAME --services cyinsight-clickhouse-production --region $REGION"
