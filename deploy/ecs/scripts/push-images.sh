#!/usr/bin/env bash
##############################################################################
# push-images.sh — Build and push all CCC plane images to ECR
#
# Usage:
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=ap-south-1
#   export IMAGE_TAG=v1.0.0   # defaults to 'latest'
#
#   chmod +x deploy/ecs/scripts/push-images.sh
#   ./deploy/ecs/scripts/push-images.sh
#
# Options:
#   --plane management|data|receiver|all  (default: all)
#   --tag   <image-tag>                   (default: latest)
##############################################################################

set -euo pipefail

PLANE="all"
TAG="${IMAGE_TAG:-latest}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
AWS_REGION="${AWS_REGION:?Set AWS_REGION}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

while [[ $# -gt 0 ]]; do
  case $1 in
    --plane) PLANE="$2"; shift 2 ;;
    --tag)   TAG="$2";   shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

ecr_login() {
  log "Authenticating with ECR (${ECR_REGISTRY})..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
}

build_and_push() {
  local plane="$1"
  local dockerfile="$2"
  local repo="${ECR_REGISTRY}/ccc-${plane}-plane:${TAG}"

  log "Building ${plane}-plane → ${repo}"
  docker build \
    --platform linux/amd64 \
    --file "${dockerfile}" \
    --tag "${repo}" \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --build-arg IMAGE_TAG="${TAG}" \
    --cache-from "${repo}" \
    .

  log "Pushing ${plane}-plane → ${repo}"
  docker push "${repo}"

  # Also tag and push as 'latest' if a specific tag was supplied
  if [[ "${TAG}" != "latest" ]]; then
    local latest_repo="${ECR_REGISTRY}/ccc-${plane}-plane:latest"
    docker tag "${repo}" "${latest_repo}"
    docker push "${latest_repo}"
    log "Also pushed ${plane}-plane → ${latest_repo}"
  fi

  log "✓ ${plane}-plane pushed successfully"
}

ecr_login

case "${PLANE}" in
  management)
    build_and_push "management" "deploy/management/Dockerfile"
    ;;
  data)
    build_and_push "data" "deploy/data-plane/Dockerfile"
    ;;
  receiver)
    build_and_push "receiver" "deploy/receiver/Dockerfile"
    ;;
  all)
    build_and_push "management" "deploy/management/Dockerfile"
    build_and_push "data"       "deploy/data-plane/Dockerfile"
    build_and_push "receiver"   "deploy/receiver/Dockerfile"
    ;;
  *)
    echo "Unknown plane: ${PLANE}. Use: management | data | receiver | all"
    exit 1
    ;;
esac

log "All images pushed. ECR registry: ${ECR_REGISTRY}"
log "Image tag: ${TAG}"
