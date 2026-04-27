#!/bin/bash
# Sync Sigma rules from SigmaHQ/sigma submodule to sigma-rules/community/
# Usage: ./scripts/sync-sigma-rules.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUBMODULE_DIR="$PROJECT_ROOT/vendor/sigma-hq"
TARGET_DIR="$PROJECT_ROOT/sigma-rules/community"

# Ensure submodule is initialized and up to date
if [ ! -d "$SUBMODULE_DIR/.git" ]; then
    echo "[Sync] Initializing SigmaHQ submodule..."
    git -C "$PROJECT_ROOT" submodule update --init --depth=1 vendor/sigma-hq
fi

echo "[Sync] Updating SigmaHQ submodule..."
git -C "$SUBMODULE_DIR" pull --depth=1 origin master 2>/dev/null || true

# Get current counts for reporting
BEFORE_COUNT=0
if [ -d "$TARGET_DIR" ]; then
    BEFORE_COUNT=$(find "$TARGET_DIR" -name "*.yml" | wc -l | tr -d ' ')
fi

echo "[Sync] Before sync: $BEFORE_COUNT community rule(s)"

# Clean and recreate target directory (preserve it in git, just refresh contents)
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Copy rules from submodule, preserving directory structure
# Only copy .yml files, skip README and other metadata
if [ -d "$SUBMODULE_DIR/rules" ]; then
    find "$SUBMODULE_DIR/rules" -type f -name "*.yml" | while read -r src; do
        # Get relative path within rules/
        rel="${src#$SUBMODULE_DIR/rules/}"
        dst="$TARGET_DIR/$rel"
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst"
    done
fi

AFTER_COUNT=$(find "$TARGET_DIR" -name "*.yml" | wc -l | tr -d ' ')
ADDED=$((AFTER_COUNT - BEFORE_COUNT))

echo "[Sync] After sync: $AFTER_COUNT community rule(s)"
if [ "$ADDED" -gt 0 ]; then
    echo "[Sync] Added $ADDED new rule(s)"
elif [ "$ADDED" -lt 0 ]; then
    echo "[Sync] Removed $((ADDED * -1)) rule(s)"
else
    echo "[Sync] Rule count unchanged (content may have been updated)"
fi

echo "[Sync] Done. Commit changes with: git add sigma-rules/community vendor/sigma-hq && git commit -m 'chore: sync sigma rules from SigmaHQ'"
