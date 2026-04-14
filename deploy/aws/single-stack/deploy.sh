#!/bin/bash
##############################################################################
# CyInsight - Cost-Optimized Starter Deployment Script
# AWS India (ap-south-1)
#
# This script automates the deployment of CyInsight on AWS
# Target Cost: ₹35,000-50,000/month
#
# Usage:
#   export AWS_PROFILE=your-profile
#   ./deploy.sh
##############################################################################

set -e

# Configuration
AWS_REGION="ap-south-1"
ENVIRONMENT="production"
STACK_NAME="cyinsight-starter"
TEMPLATE_FILE="cyinsight-starter.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'"
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    log_info "AWS Account ID: $ACCOUNT_ID"
    log_info "AWS Region: $AWS_REGION"
    
    echo ""
}

# Get or create ACM certificate
setup_certificate() {
    log_info "Checking for ACM certificate..."
    
    read -p "Enter your domain name (e.g., app.yourdomain.com): " DOMAIN_NAME
    
    if [ -z "$DOMAIN_NAME" ]; then
        log_warn "No domain provided. Will use HTTP only (not recommended for production)"
        CERTIFICATE_ARN=""
        return
    fi
    
    # Check if certificate exists
    CERTIFICATE_ARN=$(aws acm list-certificates --region $AWS_REGION \
        --query "CertificateSummaryList[?DomainName=='$DOMAIN_NAME'].CertificateArn | [0]" \
        --output text)
    
    if [ "$CERTIFICATE_ARN" != "None" ] && [ -n "$CERTIFICATE_ARN" ]; then
        log_info "Found existing certificate: $CERTIFICATE_ARN"
    else
        log_info "Requesting new certificate for $DOMAIN_NAME..."
        CERTIFICATE_ARN=$(aws acm request-certificate \
            --domain-name $DOMAIN_NAME \
            --validation-method DNS \
            --region $AWS_REGION \
            --query CertificateArn --output text)
        
        log_warn "Certificate requested: $CERTIFICATE_ARN"
        log_warn "Please validate the certificate by adding the DNS records shown below:"
        
        aws acm describe-certificate \
            --certificate-arn $CERTIFICATE_ARN \
            --region $AWS_REGION \
            --query Certificate.DomainValidationOptions
        
        log_warn "Waiting for certificate validation... (Press Enter after DNS validation is complete)"
        read
        
        # Wait for certificate to be validated
        log_info "Waiting for certificate validation..."
        aws acm wait certificate-validated \
            --certificate-arn $CERTIFICATE_ARN \
            --region $AWS_REGION
        log_info "Certificate validated!"
    fi
}

# Create ECR repository and build/push image
setup_ecr() {
    log_info "Setting up ECR repository..."
    
    ECR_REPO="cyinsight"
    ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
    
    # Create repository if not exists
    aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null || {
        log_info "Creating ECR repository..."
        aws ecr create-repository \
            --repository-name $ECR_REPO \
            --image-scanning-configuration scanOnPush=true \
            --region $AWS_REGION
    }
    
    # Login to ECR
    log_info "Logging in to ECR..."
    aws ecr get-login-password --region $AWS_REGION | \
        docker login --username AWS --password-stdin $ECR_URI
    
    # Build Docker image
    log_info "Building Docker image..."
    cd /Users/poojabhavsar/Development/Cyinsight
    
    # Check if Dockerfile exists
    if [ ! -f "Dockerfile" ]; then
        log_warn "No Dockerfile found. Using default Node.js setup..."
        create_dockerfile
    fi
    
    IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"
    docker build -t $ECR_REPO:$IMAGE_TAG .
    docker tag $ECR_REPO:$IMAGE_TAG $ECR_URI:$IMAGE_TAG
    docker tag $ECR_REPO:$IMAGE_TAG $ECR_URI:latest
    
    # Push image
    log_info "Pushing image to ECR..."
    docker push $ECR_URI:$IMAGE_TAG
    docker push $ECR_URI:latest
    
    log_info "Image pushed: $ECR_URI:$IMAGE_TAG"
    echo ""
}

# Create a simple Dockerfile if none exists
create_dockerfile() {
    cat > Dockerfile << 'EOF'
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache wget openssl

# Create app directory
WORKDIR /app

# Download RDS CA bundle
RUN wget -O /etc/ssl/certs/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the application
RUN npm run build 2>/dev/null || echo "No build script found"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/healthz || exit 1

# Start the application
CMD ["node", "dist/index.cjs"]
EOF
    log_info "Created Dockerfile"
}

# Generate database password
generate_db_password() {
    DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    echo "$DB_PASSWORD"
}

# Deploy CloudFormation stack
deploy_stack() {
    log_info "Deploying CloudFormation stack..."
    
    # Generate DB password if not provided
    if [ -z "$DB_PASSWORD" ]; then
        DB_PASSWORD=$(generate_db_password)
        log_info "Generated database password"
    fi
    
    # Deploy stack
    aws cloudformation deploy \
        --template-file $TEMPLATE_FILE \
        --stack-name $STACK_NAME \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $AWS_REGION \
        --parameter-overrides \
            EnvironmentName=$ENVIRONMENT \
            DomainName="${DOMAIN_NAME:-}" \
            CertificateArn="${CERTIFICATE_ARN:-}" \
            DBPassword="$DB_PASSWORD" \
            ImageTag="latest" \
            EnableFargateSpot="true" \
        --no-fail-on-empty-changeset
    
    if [ $? -eq 0 ]; then
        log_info "Stack deployed successfully!"
    else
        log_error "Stack deployment failed"
        exit 1
    fi
}

# Get stack outputs
get_outputs() {
    log_info "Getting deployment outputs..."
    
    echo ""
    echo "=========================================="
    echo "   DEPLOYMENT COMPLETE"
    echo "=========================================="
    echo ""
    
    aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    echo ""
    echo "=========================================="
    echo "   NEXT STEPS"
    echo "=========================================="
    echo ""
    
    ALB_DNS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
        --output text)
    
    APP_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ApplicationURL`].OutputValue' \
        --output text)
    
    echo "1. Application URL: $APP_URL"
    echo ""
    
    if [ -n "$DOMAIN_NAME" ]; then
        echo "2. Configure DNS:"
        echo "   Create a CNAME record:"
        echo "   $DOMAIN_NAME → $ALB_DNS"
        echo ""
    fi
    
    echo "3. Database Connection:"
    echo "   Endpoint: $(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
        --output text)"
    echo ""
    
    echo "4. To check application status:"
    echo "   curl $APP_URL/healthz"
    echo ""
    
    echo "5. To view logs:"
    echo "   aws logs tail /ecs/cyinsight-$ENVIRONMENT --follow --region $AWS_REGION"
    echo ""
    
    echo "=========================================="
    echo "   MONTHLY COST ESTIMATE"
    echo "=========================================="
    echo ""
    echo "With Fargate Spot enabled: ₹30,000-42,000/month"
    echo "Without Fargate Spot:     ₹45,000-55,000/month"
    echo ""
    echo "Cost breakdown:"
    echo "  - ECS Fargate:     ₹15,000-25,000"
    echo "  - RDS PostgreSQL:  ₹6,000-9,000"
    echo "  - ClickHouse:      ₹4,000-6,000"
    echo "  - ElastiCache:     ₹2,000-2,500"
    echo "  - ALB:             ₹3,000-3,500"
    echo "  - S3:              ₹1,000-1,500"
    echo "  - NAT Gateway:     ₹3,000-3,200"
    echo "  - Other:           ₹2,000-3,000"
    echo ""
    echo "=========================================="
}

# Cleanup on error
cleanup() {
    if [ $? -ne 0 ]; then
        echo ""
        log_error "Deployment failed. Cleaning up..."
        # Don't delete the stack automatically - let user decide
        log_info "To delete the stack manually, run:"
        echo "  aws cloudformation delete-stack --stack-name $STACK_NAME --region $AWS_REGION"
    fi
}

trap cleanup EXIT

# Main deployment flow
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        CyInsight - Cost-Optimized Starter Deployment        ║"
    echo "║                     AWS India (ap-south-1)                   ║"
    echo "║                                                              ║"
    echo "║              Estimated Cost: ₹35,000-50,000/month           ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_prerequisites
    
    # Get AWS account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    read -p "Do you want to set up a custom domain with HTTPS? (y/n): " SETUP_DOMAIN
    if [[ $SETUP_DOMAIN =~ ^[Yy]$ ]]; then
        setup_certificate
    else
        DOMAIN_NAME=""
        CERTIFICATE_ARN=""
    fi
    
    read -p "Do you want to build and push Docker image? (y/n): " BUILD_IMAGE
    if [[ $BUILD_IMAGE =~ ^[Yy]$ ]]; then
        setup_ecr
    fi
    
    read -p "Enter database password (leave blank for auto-generated): " DB_PASSWORD
    
    log_warn "This will deploy resources that incur AWS charges."
    read -p "Continue with deployment? (y/n): " CONFIRM
    
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled."
        exit 0
    fi
    
    deploy_stack
    get_outputs
}

# Run main function
main
