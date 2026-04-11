#!/bin/bash
# Setup GitHub remote for pushing code to dufense/CyInsight
# Usage: bash scripts/setup-github-remote.sh
#
# Requires the GITHUB_PAT environment variable to be set with a valid
# GitHub Personal Access Token (with repo scope).

if [ -z "$GITHUB_PAT" ]; then
  echo "ERROR: GITHUB_PAT environment variable is not set."
  echo "Set it with: export GITHUB_PAT=<your_github_personal_access_token>"
  exit 1
fi

echo "Configuring GitHub remote using GITHUB_PAT..."

git remote remove github 2>/dev/null
git remote add github "https://x-access-token:${GITHUB_PAT}@github.com/dufense/CyInsight.git"

echo ""
echo "Remote 'github' configured for dufense/CyInsight"
echo ""
echo "You can now push with:"
echo "  git push github main --force"
echo ""
echo "Or to push to a different fork:"
echo "  git remote set-url github https://x-access-token:\${GITHUB_PAT}@github.com/<owner>/CyInsight.git"
echo "  git push github main --force"
