#!/usr/bin/env bash
# sync-to-github.sh — Push latest Replit codebase to GitHub
# Usage: bash scripts/sync-to-github.sh [remote] [branch]
# Default: remote=origin, branch=main
set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"
DATE=$(date +'%Y-%m-%d %H:%M UTC')
CURRENT_SHA=$(git rev-parse HEAD)

echo "==> Syncing to GitHub ${REMOTE}/${BRANCH}..."
echo "    Local HEAD: $CURRENT_SHA"

# Stash any uncommitted changes
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "    Stashing uncommitted changes..."
  git stash push -m "sync-stash-$(date +%s)"
  STASHED=1
fi

# Create orphan branch with current snapshot
TMP_BRANCH="sync-$(date +%s)"
git checkout --orphan "$TMP_BRANCH" 2>/dev/null
git add -A
git commit -m "Sync: Cyber Command Center — ${DATE}

SHA: ${CURRENT_SHA}" 2>/dev/null

# Force push to remote
echo "==> Pushing snapshot to ${REMOTE}/${BRANCH}..."
git push "${REMOTE}" "${TMP_BRANCH}:${BRANCH}" --force

# Return to main
git checkout main 2>/dev/null
git branch -D "$TMP_BRANCH" 2>/dev/null

# Restore stash if needed
if [ "$STASHED" -eq 1 ]; then
  echo "    Restoring stashed changes..."
  git stash pop
fi

echo "==> Done. GitHub ${REMOTE}/${BRANCH} is now up to date."
