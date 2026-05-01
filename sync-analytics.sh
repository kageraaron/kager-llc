#!/bin/bash
# sync-analytics.sh
# =================
# Copies the shared analytics.js to all project directories that use it.
# Run this after modifying shared/analytics.js to propagate changes.
#
# Usage:  ./sync-analytics.sh
#
# To add a new project, append its directory name to the PROJECTS array below.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/shared/analytics.js"

# ── Projects that use the shared analytics.js ────────────────────────
# Add new static-HTML project directory names here.
# Next.js projects (like local-convert) use their own Analytics.tsx
# component instead, so they don't need a copy.
PROJECTS=(
  "tools4tech"
  # "json-formatter"
  # "qr-code-generator"
  # ... add more as needed
)

# ── Sync ─────────────────────────────────────────────────────────────

if [ ! -f "$SOURCE" ]; then
  echo "❌ Source not found: $SOURCE"
  exit 1
fi

echo "🔄 Syncing analytics.js from shared/ to projects..."
echo ""

for project in "${PROJECTS[@]}"; do
  dest="$SCRIPT_DIR/$project/analytics.js"
  if [ -d "$SCRIPT_DIR/$project" ]; then
    cp "$SOURCE" "$dest"
    echo "  ✅ $project/analytics.js"
  else
    echo "  ⚠️  Skipped $project (directory not found)"
  fi
done

echo ""
echo "✨ Done. Don't forget to commit & deploy the updated projects."
