#!/usr/bin/env bash
# Setup tasks phase (mirrors setup-tasks.ps1)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

JSON=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=true ;;
    -h|--help) echo "Usage: setup-tasks.sh [--json]"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

get_feature_paths_env
test_feature_branch "$CURRENT_BRANCH" "$HAS_GIT" || exit 1

if [[ ! -f "$IMPL_PLAN" ]]; then
  echo "ERROR: plan.md not found in $FEATURE_DIR" >&2
  echo "Run /speckit.plan first to create the implementation plan." >&2
  exit 1
fi

if [[ ! -f "$FEATURE_SPEC" ]]; then
  echo "ERROR: spec.md not found in $FEATURE_DIR" >&2
  echo "Run /speckit.specify first to create the feature structure." >&2
  exit 1
fi

docs=()
[[ -f "$RESEARCH" ]] && docs+=("research.md")
[[ -f "$DATA_MODEL" ]] && docs+=("data-model.md")
if [[ -d "$CONTRACTS_DIR" ]] && compgen -G "$CONTRACTS_DIR/*" >/dev/null; then
  docs+=("contracts/")
fi
[[ -f "$QUICKSTART" ]] && docs+=("quickstart.md")

tasks_template="$(resolve_template tasks-template "$REPO_ROOT" || true)"
if [[ -z "$tasks_template" || ! -f "$tasks_template" ]]; then
  echo "ERROR: Tasks template not found under $REPO_ROOT/.specify/templates/" >&2
  exit 1
fi

if $JSON; then
  python3 -c "import json; print(json.dumps({'FEATURE_DIR':'$FEATURE_DIR','AVAILABLE_DOCS':$(printf '%s\n' "${docs[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))'),'TASKS_TEMPLATE':'$tasks_template'}, separators=(',',':')))"
else
  echo "FEATURE_DIR: $FEATURE_DIR"
  echo "TASKS_TEMPLATE: $tasks_template"
  echo "AVAILABLE_DOCS:"
  test_file_exists "$RESEARCH" "research.md" || true
  test_file_exists "$DATA_MODEL" "data-model.md" || true
  test_dir_has_files "$CONTRACTS_DIR" "contracts/" || true
  test_file_exists "$QUICKSTART" "quickstart.md" || true
fi
