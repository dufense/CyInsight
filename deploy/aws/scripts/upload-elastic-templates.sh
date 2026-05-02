#!/usr/bin/env bash
# ============================================================================
# upload-elastic-templates.sh
# ----------------------------------------------------------------------------
# Publishes the elastic child templates to an S3 bucket so the nested-stack
# root `cyinsight-elastic.yml` can resolve their TemplateURL references
# during a single `aws cloudformation deploy`.
#
# Usage:
#   deploy/aws/scripts/upload-elastic-templates.sh <bucket> [prefix]
#
# Defaults:
#   prefix = elastic/v1/   (matches `TemplatesPrefix` default in root)
#
# Env:
#   AWS_REGION  — region containing the bucket (defaults to ap-south-1)
# ============================================================================
set -euo pipefail

BUCKET="${1:-}"
PREFIX="${2:-elastic/v1/}"
REGION="${AWS_REGION:-ap-south-1}"

if [[ -z "${BUCKET}" ]]; then
  echo "usage: $0 <s3-bucket> [prefix]" >&2
  exit 2
fi

PREFIX="${PREFIX%/}/"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TPL_DIR="$(cd "${SCRIPT_DIR}/../cloudformation" && pwd)"

TEMPLATES=(
  "cyinsight-elastic-substrate.yml"
  "08-clickhouse-cluster.yml"
  "06-management-ecs.yml"
  "07-data-plane-ecs.yml"
)

echo "Publishing Elastic child templates → s3://${BUCKET}/${PREFIX} (region ${REGION})"

for tpl in "${TEMPLATES[@]}"; do
  src="${TPL_DIR}/${tpl}"
  if [[ ! -f "${src}" ]]; then
    echo "ERROR: template not found: ${src}" >&2
    exit 1
  fi
  dst="s3://${BUCKET}/${PREFIX}${tpl}"
  echo "  uploading ${tpl} → ${dst}"
  aws s3 cp "${src}" "${dst}" \
    --region "${REGION}" \
    --content-type "application/x-yaml" \
    --no-progress
done

echo
echo "Done. Deploy the parent stack with:"
cat <<EOF
  aws cloudformation deploy \\
    --template-file ${TPL_DIR}/cyinsight-elastic.yml \\
    --stack-name cyinsight-elastic \\
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \\
    --region ${REGION} \\
    --parameter-overrides \\
        TemplatesBucket=${BUCKET} \\
        TemplatesPrefix=${PREFIX} \\
        TenantTier=pilot \\
        HighAvailability=false \\
        EnableClickHouse=false \\
        EnableDataPlane=false \\
        DomainName=app.example.com \\
        CertificateArn=arn:aws:acm:${REGION}:ACCOUNT:certificate/ID \\
        ImageUri=ACCOUNT.dkr.ecr.${REGION}.amazonaws.com/cyinsight:latest
EOF
