#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GRC Shield — AWS Secrets Manager setup
# Creates all required secrets before deploying the CloudFormation stacks.
#
# Usage:
#   export AWS_REGION=us-east-1
#   export DB_PASSWORD="$(openssl rand -base64 24)"
#   export OPENAI_API_KEY="sk-..."          # optional
#   export GITHUB_TOKEN="ghp_..."           # optional
#   bash aws/scripts/create-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PREFIX="grc-shield"

info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*"; }
die()   { echo "[ERROR] $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "'$1' is required but not installed."; }
require_cmd aws
require_cmd openssl

# ─── Helpers ────────────────────────────────────────────────────────────────
create_or_update_secret() {
  local name="$1"
  local value="$2"
  local description="$3"

  if aws secretsmanager describe-secret --secret-id "$name" --region "$REGION" &>/dev/null; then
    info "Updating existing secret: $name"
    aws secretsmanager put-secret-value \
      --secret-id "$name" \
      --secret-string "$value" \
      --region "$REGION" > /dev/null
  else
    info "Creating secret: $name"
    aws secretsmanager create-secret \
      --name "$name" \
      --description "$description" \
      --secret-string "$value" \
      --region "$REGION" \
      --tags Key=Project,Value=grc-shield > /dev/null
  fi
}

get_secret_arn() {
  aws secretsmanager describe-secret \
    --secret-id "$1" \
    --region "$REGION" \
    --query 'ARN' \
    --output text
}

# ─── SESSION_SECRET ──────────────────────────────────────────────────────────
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
if [ ${#SESSION_SECRET} -lt 32 ]; then
  die "SESSION_SECRET must be at least 32 characters."
fi
create_or_update_secret \
  "${PREFIX}/session-secret" \
  "$SESSION_SECRET" \
  "GRC Shield — Express session secret"

SESSION_SECRET_ARN=$(get_secret_arn "${PREFIX}/session-secret")
info "SESSION_SECRET ARN: $SESSION_SECRET_ARN"

# ─── OPENAI_API_KEY (optional) ───────────────────────────────────────────────
OPENAI_KEY_ARN=""
if [ -n "${OPENAI_API_KEY:-}" ]; then
  create_or_update_secret \
    "${PREFIX}/openai-api-key" \
    "$OPENAI_API_KEY" \
    "GRC Shield — OpenAI API key for AI features"
  OPENAI_KEY_ARN=$(get_secret_arn "${PREFIX}/openai-api-key")
  info "OPENAI_API_KEY ARN: $OPENAI_KEY_ARN"
else
  warn "OPENAI_API_KEY not set — AI features will be disabled."
fi

# ─── GITHUB_TOKEN (optional) ─────────────────────────────────────────────────
GITHUB_TOKEN_ARN=""
if [ -n "${GITHUB_TOKEN:-}" ]; then
  create_or_update_secret \
    "${PREFIX}/github-token" \
    "$GITHUB_TOKEN" \
    "GRC Shield — GitHub personal access token"
  GITHUB_TOKEN_ARN=$(get_secret_arn "${PREFIX}/github-token")
  info "GITHUB_TOKEN ARN: $GITHUB_TOKEN_ARN"
fi

# ─── Print summary ────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Secrets created/updated successfully."
echo "  Use these ARNs in the CloudFormation parameters:"
echo ""
echo "  SessionSecretArn:  $SESSION_SECRET_ARN"
[ -n "$OPENAI_KEY_ARN"   ] && echo "  OpenAIKeyArn:      $OPENAI_KEY_ARN"
[ -n "$GITHUB_TOKEN_ARN" ] && echo "  GithubTokenArn:    $GITHUB_TOKEN_ARN"
echo ""
echo "  NOTE: The DATABASE_URL secret is created automatically by"
echo "        the 02-rds.yaml CloudFormation stack."
echo "═══════════════════════════════════════════════════════════════"
