#!/usr/bin/env bash
# Setup implementation plan (mirrors setup-plan.ps1)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

JSON=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=true ;;
    -h|--help) echo "Usage: setup-plan.sh [--json]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

get_feature_paths_env
test_feature_branch "$CURRENT_BRANCH" "$HAS_GIT" || exit 1

mkdir -p "$FEATURE_DIR"

template="$(resolve_template plan-template "$REPO_ROOT" || true)"
if [[ -n "$template" && -f "$template" ]]; then
  cp "$template" "$IMPL_PLAN"
else
  echo "[specify] Warning: Plan template not found" >&2
  : > "$IMPL_PLAN"
fi

if $JSON; then
  python3 -c "import json; print(json.dumps({'FEATURE_SPEC':'$FEATURE_SPEC','IMPL_PLAN':'$IMPL_PLAN','SPECS_DIR':'$FEATURE_DIR','BRANCH':'$CURRENT_BRANCH','HAS_GIT':$([[ \"$HAS_GIT\" == true ]] && echo true || echo false)}, separators=(',',':')))"
else
  echo "FEATURE_SPEC: $FEATURE_SPEC"
  echo "IMPL_PLAN: $IMPL_PLAN"
  echo "SPECS_DIR: $FEATURE_DIR"
  echo "BRANCH: $CURRENT_BRANCH"
  echo "HAS_GIT: $HAS_GIT"
fi
