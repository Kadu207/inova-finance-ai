#!/usr/bin/env bash
# Consolidated prerequisite checking (mirrors check-prerequisites.ps1)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

JSON=false
REQUIRE_TASKS=false
INCLUDE_TASKS=false
PATHS_ONLY=false

usage() {
  cat <<'EOF'
Usage: check-prerequisites.sh [OPTIONS]

OPTIONS:
  --json           Output in JSON format
  --require-tasks  Require tasks.md (implementation phase)
  --include-tasks  Include tasks.md in AVAILABLE_DOCS
  --paths-only     Only output path variables
  -h, --help       Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=true ;;
    --require-tasks) REQUIRE_TASKS=true ;;
    --include-tasks) INCLUDE_TASKS=true ;;
    --paths-only) PATHS_ONLY=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

get_feature_paths_env
test_feature_branch "$CURRENT_BRANCH" "$HAS_GIT" || exit 1

if $PATHS_ONLY; then
  if $JSON; then
    python3 -c "import json; print(json.dumps({'REPO_ROOT':'$REPO_ROOT','BRANCH':'$CURRENT_BRANCH','FEATURE_DIR':'$FEATURE_DIR','FEATURE_SPEC':'$FEATURE_SPEC','IMPL_PLAN':'$IMPL_PLAN','TASKS':'$TASKS'}, separators=(',',':')))"
  else
    echo "REPO_ROOT: $REPO_ROOT"
    echo "BRANCH: $CURRENT_BRANCH"
    echo "FEATURE_DIR: $FEATURE_DIR"
    echo "FEATURE_SPEC: $FEATURE_SPEC"
    echo "IMPL_PLAN: $IMPL_PLAN"
    echo "TASKS: $TASKS"
  fi
  exit 0
fi

if [[ ! -d "$FEATURE_DIR" ]]; then
  echo "ERROR: Feature directory not found: $FEATURE_DIR"
  echo "Run /speckit.specify first to create the feature structure."
  exit 1
fi

if [[ ! -f "$IMPL_PLAN" ]]; then
  echo "ERROR: plan.md not found in $FEATURE_DIR"
  echo "Run /speckit.plan first to create the implementation plan."
  exit 1
fi

if $REQUIRE_TASKS && [[ ! -f "$TASKS" ]]; then
  echo "ERROR: tasks.md not found in $FEATURE_DIR"
  echo "Run /speckit.tasks first to create the task list."
  exit 1
fi

docs=()
[[ -f "$RESEARCH" ]] && docs+=("research.md")
[[ -f "$DATA_MODEL" ]] && docs+=("data-model.md")
if [[ -d "$CONTRACTS_DIR" ]] && compgen -G "$CONTRACTS_DIR/*" >/dev/null; then
  docs+=("contracts/")
fi
[[ -f "$QUICKSTART" ]] && docs+=("quickstart.md")
if $INCLUDE_TASKS && [[ -f "$TASKS" ]]; then docs+=("tasks.md"); fi

if $JSON; then
  python3 -c "import json; print(json.dumps({'FEATURE_DIR':'$FEATURE_DIR','AVAILABLE_DOCS':$(printf '%s\n' "${docs[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')}, separators=(',',':')))"
else
  echo "FEATURE_DIR:$FEATURE_DIR"
  echo "AVAILABLE_DOCS:"
  test_file_exists "$RESEARCH" "research.md" || true
  test_file_exists "$DATA_MODEL" "data-model.md" || true
  test_dir_has_files "$CONTRACTS_DIR" "contracts/" || true
  test_file_exists "$QUICKSTART" "quickstart.md" || true
  if $INCLUDE_TASKS; then test_file_exists "$TASKS" "tasks.md" || true; fi
fi
