#!/usr/bin/env bash
# Initialize git repository (Spec Kit git extension)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "[specify] Git not installed; skipping" >&2
  exit 0
fi

if [[ -d .git ]]; then
  echo "✓ Git repository already initialized"
  exit 0
fi

git init -b main
git add .
git commit -m "chore: initial commit from Specify template"
echo "✓ Git repository initialized"
