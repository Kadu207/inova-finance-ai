#!/usr/bin/env bash
# Common functions for Spec Kit bash scripts (mirrors common.ps1)

set -euo pipefail

find_specify_root() {
  local current
  current="$(cd "${1:-$(pwd)}" && pwd)"
  while [[ -n "$current" && "$current" != "/" ]]; do
    if [[ -d "$current/.specify" ]]; then
      echo "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done
  return 1
}

get_repo_root() {
  local root
  if root="$(find_specify_root "$(pwd)" 2>/dev/null)"; then
    echo "$root"
    return 0
  fi
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
    return 0
  fi
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
}

test_has_git() {
  local repo_root
  repo_root="$(get_repo_root)"
  command -v git >/dev/null 2>&1 || return 1
  [[ -e "$repo_root/.git" ]] || return 1
  git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

get_spec_kit_effective_branch_name() {
  local branch="$1"
  if [[ "$branch" =~ ^([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[2]}"
  else
    echo "$branch"
  fi
}

get_current_branch() {
  if [[ -n "${SPECIFY_FEATURE:-}" ]]; then
    echo "$SPECIFY_FEATURE"
    return 0
  fi
  local repo_root
  repo_root="$(get_repo_root)"
  if test_has_git; then
    git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null && return 0
  fi
  local specs_dir="$repo_root/specs"
  if [[ -d "$specs_dir" ]]; then
    local latest=""
    local highest=0
    local latest_ts=""
    local dir name
    for dir in "$specs_dir"/*/; do
      [[ -d "$dir" ]] || continue
      name="$(basename "$dir")"
      if [[ "$name" =~ ^([0-9]{8}-[0-9]{6})- ]]; then
        if [[ "${BASH_REMATCH[1]}" > "$latest_ts" ]]; then
          latest_ts="${BASH_REMATCH[1]}"
          latest="$name"
        fi
      elif [[ "$name" =~ ^([0-9]{3,})- ]]; then
        if (( ${BASH_REMATCH[1]} > highest )) && [[ -z "$latest_ts" ]]; then
          highest="${BASH_REMATCH[1]}"
          latest="$name"
        fi
      fi
    done
    if [[ -n "$latest" ]]; then
      echo "$latest"
      return 0
    fi
  fi
  echo "main"
}

test_feature_branch() {
  local branch="$1"
  local has_git="${2:-true}"
  if [[ "$has_git" != "true" ]]; then
    echo "[specify] Warning: Git repository not detected; skipped branch validation" >&2
    return 0
  fi
  local raw="$branch"
  branch="$(get_spec_kit_effective_branch_name "$branch")"
  if [[ "$branch" =~ ^[0-9]{7}-[0-9]{6}- ]] || [[ "$branch" =~ ^(|[0-9]{7}|[0-9]{8})-[0-9]{6}$ ]]; then
    echo "ERROR: Not on a feature branch. Current branch: $raw" >&2
    echo "Feature branches: 001-feature-name, 1234-feature-name, or 20260319-143022-feature-name" >&2
    return 1
  fi
  if [[ ! "$branch" =~ ^[0-9]{3,}- ]] && [[ ! "$branch" =~ ^[0-9]{8}-[0-9]{6}- ]]; then
    echo "ERROR: Not on a feature branch. Current branch: $raw" >&2
    echo "Feature branches: 001-feature-name, 1234-feature-name, or 20260319-143022-feature-name" >&2
    return 1
  fi
  return 0
}

find_feature_dir_by_prefix() {
  local repo_root="$1"
  local branch="$2"
  local specs_dir="$repo_root/specs"
  local branch_name prefix matches=()
  branch_name="$(get_spec_kit_effective_branch_name "$branch")"
  if [[ "$branch_name" =~ ^([0-9]{8}-[0-9]{6})- ]]; then
    prefix="${BASH_REMATCH[1]}"
  elif [[ "$branch_name" =~ ^([0-9]{3,})- ]]; then
    prefix="${BASH_REMATCH[1]}"
  else
    echo "$specs_dir/$branch_name"
    return 0
  fi
  shopt -s nullglob
  matches=("$specs_dir/$prefix-"*/)
  shopt -u nullglob
  if [[ ${#matches[@]} -eq 0 ]]; then
    echo "$specs_dir/$branch_name"
  elif [[ ${#matches[@]} -eq 1 ]]; then
    echo "${matches[0]%/}"
  else
    echo "ERROR: Multiple spec directories found with prefix '$prefix'" >&2
    return 1
  fi
}

get_feature_paths_env() {
  local repo_root current_branch has_git feature_dir feature_json
  repo_root="$(get_repo_root)"
  current_branch="$(get_current_branch)"
  if test_has_git; then has_git=true; else has_git=false; fi

  if [[ -n "${SPECIFY_FEATURE_DIRECTORY:-}" ]]; then
    feature_dir="$SPECIFY_FEATURE_DIRECTORY"
    if [[ "$feature_dir" != /* ]]; then
      feature_dir="$repo_root/$feature_dir"
    fi
  else
    feature_json="$repo_root/.specify/feature.json"
    if [[ -f "$feature_json" ]]; then
      feature_dir="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('feature_directory',''))" "$feature_json" 2>/dev/null || echo "")"
      if [[ -n "$feature_dir" && "$feature_dir" != /* ]]; then
        feature_dir="$repo_root/$feature_dir"
      fi
    fi
    if [[ -z "${feature_dir:-}" ]]; then
      feature_dir="$(find_feature_dir_by_prefix "$repo_root" "$current_branch")" || exit 1
    fi
  fi

  export REPO_ROOT="$repo_root"
  export CURRENT_BRANCH="$current_branch"
  export HAS_GIT="$has_git"
  export FEATURE_DIR="$feature_dir"
  export FEATURE_SPEC="$feature_dir/spec.md"
  export IMPL_PLAN="$feature_dir/plan.md"
  export TASKS="$feature_dir/tasks.md"
  export RESEARCH="$feature_dir/research.md"
  export DATA_MODEL="$feature_dir/data-model.md"
  export QUICKSTART="$feature_dir/quickstart.md"
  export CONTRACTS_DIR="$feature_dir/contracts"
}

resolve_template() {
  local template_name="$1"
  local repo_root="$2"
  local base="$repo_root/.specify/templates"
  local candidate

  candidate="$base/overrides/${template_name}.md"
  [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }

  if [[ -d "$repo_root/.specify/presets" ]]; then
    local preset
    for preset in "$repo_root/.specify/presets"/*/; do
      [[ -d "$preset" ]] || continue
      candidate="${preset}templates/${template_name}.md"
      [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
    done
  fi

  if [[ -d "$repo_root/.specify/extensions" ]]; then
    local ext
    for ext in "$repo_root/.specify/extensions"/*/; do
      [[ -d "$ext" ]] || continue
      candidate="${ext}templates/${template_name}.md"
      [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
    done
  fi

  candidate="$base/${template_name}.md"
  [[ -f "$candidate" ]] && { echo "$candidate"; return 0; }
  return 1
}

test_file_exists() {
  local path="$1" desc="$2"
  if [[ -f "$path" ]]; then echo "  ✓ $desc"; return 0; fi
  echo "  ✗ $desc"; return 1
}

test_dir_has_files() {
  local path="$1" desc="$2"
  if [[ -d "$path" ]] && compgen -G "$path/*" >/dev/null; then
    echo "  ✓ $desc"; return 0
  fi
  echo "  ✗ $desc"; return 1
}
