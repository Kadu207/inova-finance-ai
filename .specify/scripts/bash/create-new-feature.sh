#!/usr/bin/env bash
# Create a new feature branch and spec directory (mirrors create-new-feature.ps1)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

JSON=false
DRY_RUN=false
ALLOW_EXISTING=false
TIMESTAMP=false
SHORT_NAME=""
NUMBER=0
FEATURE_DESC=""

usage() {
  cat <<'EOF'
Usage: create-new-feature.sh [OPTIONS] <feature description>

Options:
  --json                  Output JSON
  --dry-run               Compute paths without creating files/branches
  --allow-existing-branch Switch to branch if it already exists
  --short-name <name>     Custom short name for branch
  --number N              Manual branch number
  --timestamp             Use YYYYMMDD-HHMMSS prefix
  -h, --help              Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=true ;;
    --dry-run) DRY_RUN=true ;;
    --allow-existing-branch) ALLOW_EXISTING=true ;;
    --timestamp) TIMESTAMP=true ;;
    --short-name) SHORT_NAME="$2"; shift ;;
    --number) NUMBER="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; FEATURE_DESC="$*"; break ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) FEATURE_DESC="$1" ;;
  esac
  shift
done

[[ -n "$FEATURE_DESC" ]] || { echo "Error: feature description required" >&2; usage; exit 1; }

clean_branch_suffix() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/-+/-/g; s/^-|-$//g'
}

branch_suffix_from_desc() {
  local desc="$1"
  local words filtered=() w
  read -ra words <<< "$(echo "$desc" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 ]/ /g')"
  local stop=" i a an the to for of in on at by with from is are was were be been being have has had do does did will would should could can may might must shall this that these those my your our their want need add get set "
  for w in "${words[@]}"; do
    [[ ${#w} -ge 3 ]] || continue
    [[ "$stop" == *" $w "* ]] && continue
    filtered+=("$w")
  done
  if ((${#filtered[@]} > 0)); then
    local max=3
    ((${#filtered[@]} == 4)) && max=4
    local out="" i
    for ((i=0; i<max && i<${#filtered[@]}; i++)); do
      out+="${filtered[$i]}-"
    done
    echo "${out%-}"
  else
    clean_branch_suffix "$desc" | cut -d- -f1-3
  fi
}

highest_from_specs() {
  local specs_dir="$1" max=0 n
  [[ -d "$specs_dir" ]] || { echo 0; return; }
  for n in "$specs_dir"/*/; do
    [[ -d "$n" ]] || continue
    local base
    base="$(basename "$n")"
    if [[ "$base" =~ ^([0-9]{3,})- ]] && [[ ! "$base" =~ ^[0-9]{8}-[0-9]{6}- ]]; then
      (( ${BASH_REMATCH[1]} > max )) && max="${BASH_REMATCH[1]}"
    fi
  done
  echo "$max"
}

REPO_ROOT="$(get_repo_root)"
HAS_GIT=false
test_has_git && HAS_GIT=true
SPECS_DIR="$REPO_ROOT/specs"

if [[ -n "$SHORT_NAME" ]]; then
  BRANCH_SUFFIX="$(clean_branch_suffix "$SHORT_NAME")"
else
  BRANCH_SUFFIX="$(branch_suffix_from_desc "$FEATURE_DESC")"
fi

if $TIMESTAMP; then
  FEATURE_NUM="$(date +%Y%m%d-%H%M%S)"
  BRANCH_NAME="$FEATURE_NUM-$BRANCH_SUFFIX"
else
  if [[ "$NUMBER" -eq 0 ]]; then
    NUMBER=$(( $(highest_from_specs "$SPECS_DIR") + 1 ))
    if $HAS_GIT; then
      while IFS= read -r b; do
        b="${b#* }"; b="${b#remotes/*/}"
        if [[ "$b" =~ ^([0-9]{3,})- ]]; then
          (( ${BASH_REMATCH[1]} >= NUMBER )) && NUMBER=$(( ${BASH_REMATCH[1]} + 1 ))
        fi
      done < <(git -C "$REPO_ROOT" branch -a 2>/dev/null || true)
    fi
  fi
  FEATURE_NUM="$(printf '%03d' "$NUMBER")"
  BRANCH_NAME="$FEATURE_NUM-$BRANCH_SUFFIX"
fi

FEATURE_DIR="$SPECS_DIR/$BRANCH_NAME"
SPEC_FILE="$FEATURE_DIR/spec.md"

if ! $DRY_RUN; then
  mkdir -p "$SPECS_DIR"
  if $HAS_GIT; then
    if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
      if $ALLOW_EXISTING; then
        current="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
        [[ "$current" != "$BRANCH_NAME" ]] && git -C "$REPO_ROOT" checkout -q "$BRANCH_NAME"
      else
        echo "Error: Branch '$BRANCH_NAME' already exists" >&2
        exit 1
      fi
    else
      git -C "$REPO_ROOT" checkout -q -b "$BRANCH_NAME"
    fi
  else
    echo "[specify] Warning: Git not detected; skipped branch creation for $BRANCH_NAME" >&2
  fi
  mkdir -p "$FEATURE_DIR"
  if [[ ! -f "$SPEC_FILE" ]]; then
    template="$(resolve_template spec-template "$REPO_ROOT" || true)"
    if [[ -n "$template" && -f "$template" ]]; then
      cp "$template" "$SPEC_FILE"
    else
      : > "$SPEC_FILE"
    fi
  fi
  export SPECIFY_FEATURE="$BRANCH_NAME"
fi

if $JSON; then
  if [[ "$HAS_GIT" == "true" ]]; then _has_git=True; else _has_git=False; fi
  if $DRY_RUN; then
    python3 -c "import json; print(json.dumps({'BRANCH_NAME':'$BRANCH_NAME','SPEC_FILE':'$SPEC_FILE','FEATURE_NUM':'$FEATURE_NUM','HAS_GIT':$_has_git,'DRY_RUN':True}, separators=(',',':')))"
  else
    python3 -c "import json; print(json.dumps({'BRANCH_NAME':'$BRANCH_NAME','SPEC_FILE':'$SPEC_FILE','FEATURE_NUM':'$FEATURE_NUM','HAS_GIT':$_has_git}, separators=(',',':')))"
  fi
else
  echo "BRANCH_NAME: $BRANCH_NAME"
  echo "SPEC_FILE: $SPEC_FILE"
  echo "FEATURE_NUM: $FEATURE_NUM"
  echo "HAS_GIT: $HAS_GIT"
  if ! $DRY_RUN; then
    echo "SPECIFY_FEATURE environment variable set to: $BRANCH_NAME"
  fi
fi
