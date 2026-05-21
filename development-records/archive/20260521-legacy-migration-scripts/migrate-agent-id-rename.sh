#!/usr/bin/env bash
#
# migrate-agent-id-rename.sh — onto_ prefix 제거 마이그레이션 (W-A-01~05 + W-D-04 Phase 3)
#
# onto 프로젝트의 agent_id_rename (commit c29b4c7, 2026-04-08) 이후, 기존 사용자의
# global state (`~/.onto/`) + repo-local state (`{project}/.onto/`) 를 bare canonical
# ID 로 정렬한다. Dual-read fallback 이 이미 작동 중이므로 본 마이그레이션은
# 선택사항이지만, legacy 파일을 정리하면 cognitive load + drift risk 감소.
#
# 치환 대상 (10쌍):
#   onto_logic → logic, onto_structure → structure, onto_dependency → dependency,
#   onto_semantics → semantics, onto_pragmatics → pragmatics, onto_evolution → evolution,
#   onto_coverage → coverage, onto_conciseness → conciseness, onto_axiology → axiology,
#   onto_synthesize → synthesize
#
# 보존 대상 (rename 하지 않음):
#   - onto_taxonomy (lexicon axis name, 다른 개념)
#   - onto_direction (process.md frontmatter field, 다른 개념)
#   - ONTO_HOME (환경 변수, 다른 개념)
#   - philosopher.md (명시적 scope 분리 대상)
#   - onto_philosopher / ask_philosopher (관련 legacy, philosopher 유지 정책)
#
# 제외 경로 (preserve zone — archival-only):
#   - ~/.onto/review/** 및 {project}/.onto/review/** (review 세션 artifact, historical record)
#   - ~/.onto/backups/ 및 _backup_*/ (기존 백업 디렉토리)
#
# Usage:
#   bash scripts/migrate-agent-id-rename.sh              # interactive, ~/.onto/ 대상
#   bash scripts/migrate-agent-id-rename.sh --dry-run    # 변경 미실행, 계획만 출력
#   bash scripts/migrate-agent-id-rename.sh --project=/path/to/project  # {project}/.onto/ 도 포함
#   bash scripts/migrate-agent-id-rename.sh --no-backup  # 백업 생략 (비추천)
#   bash scripts/migrate-agent-id-rename.sh --verify     # 마이그레이션 후 검증만 실행
#
# Idempotent: 재실행해도 안전. 이미 rename 된 파일은 건드리지 않음.
# Safety: 기본적으로 변경 전 timestamp-prefixed backup 생성 (~/.onto/_backup_agent-id-rename_YYYYMMDD_HHMMSS).

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

RENAME_PAIRS=(
  "onto_logic:logic"
  "onto_structure:structure"
  "onto_dependency:dependency"
  "onto_semantics:semantics"
  "onto_pragmatics:pragmatics"
  "onto_evolution:evolution"
  "onto_coverage:coverage"
  "onto_conciseness:conciseness"
  "onto_axiology:axiology"
  "onto_synthesize:synthesize"
)

DRY_RUN=0
DO_BACKUP=1
VERIFY_ONLY=0
PROJECT_PATH=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --verify) VERIFY_ONLY=1 ;;
    --project=*) PROJECT_PATH="${arg#--project=}" ;;
    --help|-h)
      head -36 "$0" | grep "^#" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Run with --help for usage" >&2
      exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[migrate-agent-id-rename] $*"; }
dry() { [ "$DRY_RUN" -eq 1 ]; }

# Portable in-place sed. macOS BSD sed needs `-i ''`; GNU sed needs `-i`.
sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# ---------------------------------------------------------------------------
# Scan: list legacy files + content references
# ---------------------------------------------------------------------------

scan_dir() {
  local root="$1"
  [ -d "$root" ] || return 0

  echo ""
  log "scan: $root"

  # 1) Legacy filename scan (onto_* 파일)
  local legacy_files=()
  while IFS= read -r -d '' f; do
    legacy_files+=("$f")
  done < <(find "$root" -type f -name "onto_*.md" -not -path "*/_backup_*/*" -not -path "*/backups/*" -not -path "*/review/*" -print0 2>/dev/null || true)

  if [ "${#legacy_files[@]}" -gt 0 ]; then
    log "  legacy filenames (rename 대상) ${#legacy_files[@]}건:"
    for f in "${legacy_files[@]}"; do
      local base
      base=$(basename "$f")
      # Skip philosopher (preserve policy)
      if [[ "$base" == "onto_philosopher.md" ]] || [[ "$base" == "philosopher.md" ]]; then
        log "    SKIP (preserve): $f"
        continue
      fi
      # Skip ask_philosopher
      if [[ "$base" == *philosopher* ]]; then
        log "    SKIP (preserve): $f"
        continue
      fi
      log "    → $f"
    done
  else
    log "  legacy filenames: 없음"
  fi

  # 2) Content references scan (10 tokens)
  local ref_files=()
  for pair in "${RENAME_PAIRS[@]}"; do
    local legacy="${pair%%:*}"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      ref_files+=("$f")
    done < <(grep -rln "\b${legacy}\b" "$root" --include="*.md" --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v "_backup_" | grep -v "/backups/" | grep -v "/review/" || true)
  done

  # Dedupe
  if [ "${#ref_files[@]}" -gt 0 ]; then
    local unique_refs
    unique_refs=$(printf "%s\n" "${ref_files[@]}" | sort -u)
    local count
    count=$(echo "$unique_refs" | grep -c . || true)
    log "  content references: $count 파일"
    echo "$unique_refs" | while read -r f; do
      [ -z "$f" ] && continue
      log "    · $f"
    done
  else
    log "  content references: 없음"
  fi
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

create_backup() {
  local root="$1"
  [ -d "$root" ] || return 0
  [ "$DO_BACKUP" -eq 0 ] && { log "  backup 생략 (--no-backup)"; return 0; }
  dry && { log "  [dry-run] backup 생성 생략"; return 0; }

  local ts
  ts=$(date +%Y%m%d_%H%M%S)
  local backup_dir
  backup_dir="$(dirname "$root")/_backup_agent-id-rename_${ts}"
  log "  backup: $root → $backup_dir"
  cp -R "$root" "$backup_dir"
}

# ---------------------------------------------------------------------------
# Apply: file renames
# ---------------------------------------------------------------------------

apply_file_renames() {
  local root="$1"
  [ -d "$root" ] || return 0

  local renamed=0
  for pair in "${RENAME_PAIRS[@]}"; do
    local legacy="${pair%%:*}"      # e.g., "onto_logic" (includes onto_ prefix)
    local canonical="${pair#*:}"    # e.g., "logic"

    while IFS= read -r -d '' f; do
      local dir base target
      dir=$(dirname "$f")
      base=$(basename "$f")

      # Preserve philosopher family
      if [[ "$base" == *philosopher* ]]; then
        continue
      fi

      # Map {legacy}.md → {canonical}.md OR
      # {legacy}-{suffix}.md → {canonical}-{suffix}.md (e.g., promoted learning files)
      if [[ "$base" == "${legacy}.md" ]]; then
        target="$dir/${canonical}.md"
      elif [[ "$base" == "${legacy}-"* ]]; then
        local suffix="${base#${legacy}-}"
        target="$dir/${canonical}-${suffix}"
      elif [[ "$base" == "${legacy}."* ]]; then
        # e.g., onto_logic.prompt.md (though review/ excluded, repo-local may still have)
        local suffix="${base#${legacy}.}"
        target="$dir/${canonical}.${suffix}"
      else
        continue
      fi

      # If target already exists, skip (idempotent)
      if [ -e "$target" ]; then
        log "  target exists, skip: $f → $(basename "$target")"
        continue
      fi

      if dry; then
        log "  [dry-run] rename: $f → $target"
      else
        mv "$f" "$target"
        log "  renamed: $(basename "$f") → $(basename "$target")"
      fi
      renamed=$((renamed + 1))
    done < <(find "$root" -type f -name "${legacy}*" -not -path "*/_backup_*/*" -not -path "*/backups/*" -not -path "*/review/*" -print0 2>/dev/null || true)
  done

  log "  파일 rename 완료: ${renamed}건"
}

# ---------------------------------------------------------------------------
# Apply: content references
# ---------------------------------------------------------------------------

apply_content_rewrites() {
  local root="$1"
  [ -d "$root" ] || return 0

  local changed_files=0
  local affected_files=()

  for pair in "${RENAME_PAIRS[@]}"; do
    local legacy="${pair%%:*}"
    local canonical="${pair#*:}"

    while IFS= read -r f; do
      [ -z "$f" ] && continue
      affected_files+=("$f")
    done < <(grep -rln "\b${legacy}\b" "$root" --include="*.md" --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v "_backup_" | grep -v "/backups/" | grep -v "/review/" || true)
  done

  # Dedupe affected files
  if [ "${#affected_files[@]}" -eq 0 ]; then
    log "  content references 없음"
    return 0
  fi

  local unique_files
  unique_files=$(printf "%s\n" "${affected_files[@]}" | sort -u)

  echo "$unique_files" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    if dry; then
      log "  [dry-run] rewrite: $f"
    else
      # Apply all 10 substitutions per file with word boundary
      for pair in "${RENAME_PAIRS[@]}"; do
        local legacy="${pair%%:*}"
        local canonical="${pair#*:}"
        # Use perl for portable word boundary + in-place
        perl -i -pe "s/\\b${legacy}\\b/${canonical}/g" "$f"
      done
      log "  rewrote: $f"
    fi
    changed_files=$((changed_files + 1))
  done

  log "  content rewrite 완료: 처리된 파일 $(echo "$unique_files" | grep -c . || echo 0)"
}

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

verify_dir() {
  local root="$1"
  local scope="$2"
  [ -d "$root" ] || return 0

  log "verify: $scope ($root)"

  # Layer 1: legacy filenames should be 0 (excl. philosopher + backups)
  local legacy_count=0
  local legacy_remaining=()
  while IFS= read -r -d '' f; do
    local base
    base=$(basename "$f")
    [[ "$base" == *philosopher* ]] && continue
    legacy_count=$((legacy_count + 1))
    legacy_remaining+=("$f")
  done < <(find "$root" -type f -name "onto_*.md" -not -path "*/_backup_*/*" -not -path "*/backups/*" -not -path "*/review/*" -print0 2>/dev/null || true)

  if [ "$legacy_count" -eq 0 ]; then
    log "  Layer 1 (legacy filenames): PASS (0 잔존)"
  else
    log "  Layer 1 (legacy filenames): FAIL (${legacy_count} 잔존)"
    for f in "${legacy_remaining[@]}"; do
      log "    - $f"
    done
  fi

  # Layer 2: legacy tokens in content should be 0 (excl. philosopher, backups, review archives)
  local total_refs=0
  set +o pipefail
  for pair in "${RENAME_PAIRS[@]}"; do
    local legacy="${pair%%:*}"
    local count=0
    # grep returns 1 when no matches — explicitly handle via test
    local matches
    matches=$(grep -rln "\b${legacy}\b" "$root" --include="*.md" --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v "_backup_" | grep -v "/backups/" | grep -v "/review/" || true)
    if [ -n "$matches" ]; then
      count=$(echo "$matches" | grep -c . || echo 0)
    fi
    total_refs=$((total_refs + count))
  done
  set -o pipefail

  if [ "$total_refs" -eq 0 ]; then
    log "  Layer 2 (content references): PASS (0 잔존)"
  else
    log "  Layer 2 (content references): FAIL (${total_refs} 잔존)"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

USER_ONTO="$HOME/.onto"

log "========================================"
log "agent_id_rename 마이그레이션 (W-A-01~05 + W-D-04 Phase 3)"
log "========================================"
log "Mode: $(dry && echo 'DRY-RUN (변경 없음)' || echo 'APPLY')"
log "Backup: $([ $DO_BACKUP -eq 1 ] && echo '활성' || echo '비활성')"
log "User scope: $USER_ONTO"
[ -n "$PROJECT_PATH" ] && log "Project scope: $PROJECT_PATH/.onto"

if [ "$VERIFY_ONLY" -eq 1 ]; then
  log ""
  log "=== VERIFY ONLY ==="
  verify_dir "$USER_ONTO" "user-global"
  [ -n "$PROJECT_PATH" ] && verify_dir "$PROJECT_PATH/.onto" "project-local"
  exit 0
fi

# Phase A: Scan
log ""
log "=== PHASE A: SCAN ==="
scan_dir "$USER_ONTO"
[ -n "$PROJECT_PATH" ] && scan_dir "$PROJECT_PATH/.onto"

# Phase B: Backup
if ! dry; then
  log ""
  log "=== PHASE B: BACKUP ==="
  create_backup "$USER_ONTO"
  [ -n "$PROJECT_PATH" ] && create_backup "$PROJECT_PATH/.onto"
fi

# Phase C: Apply file renames
log ""
log "=== PHASE C: FILE RENAMES ==="
apply_file_renames "$USER_ONTO"
[ -n "$PROJECT_PATH" ] && apply_file_renames "$PROJECT_PATH/.onto"

# Phase D: Apply content rewrites
log ""
log "=== PHASE D: CONTENT REWRITES ==="
apply_content_rewrites "$USER_ONTO"
[ -n "$PROJECT_PATH" ] && apply_content_rewrites "$PROJECT_PATH/.onto"

# Phase E: Verify
log ""
log "=== PHASE E: VERIFY ==="
verify_dir "$USER_ONTO" "user-global"
[ -n "$PROJECT_PATH" ] && verify_dir "$PROJECT_PATH/.onto" "project-local"

log ""
log "========================================"
if dry; then
  log "DRY-RUN 완료. 실제 실행: --dry-run 제거"
else
  log "APPLY 완료."
  [ "$DO_BACKUP" -eq 1 ] && log "Backup 위치: $USER_ONTO 상위의 _backup_agent-id-rename_* 디렉토리"
  log "다음: cd <project> && npm run review:invoke -- README.md 'test' 로 정상 작동 확인"
fi
log "========================================"
