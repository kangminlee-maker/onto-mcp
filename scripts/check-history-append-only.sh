#!/usr/bin/env bash
# G16 history-append-only — 이력은 고쳐 쓰지 않는다. 갱신은 새 파일이다.
#
# 한 파일을 계속 고치면 "언제 기준의 진실인가"가 사라진다. 그 파일은 항상 최신인
# 척하면서 어느 시점의 것도 아니게 된다. 시점이 박제된 파일은 낡을 수 없다 —
# 낡았다는 것이 이름에 적혀 있기 때문이다.
#
# 대상은 `development-records/handoff/`로 한정한다. 관측된 실패가 거기서 났다:
# `20260406-current-work.md`는 8개 커밋에 걸쳐 덧쓰였고, 최근 핸드오프들도 5~6회
# 고쳐졌다. 차단은 관측된 실패에만 건다 — `design/`이나 `audit/`은 성격이 다르고
# 그쪽에서 같은 실패가 관측되면 그때 넓힌다.
#
# 두 검사, 둘 다 차단한다:
#   1. 기존 핸드오프 파일의 수정·삭제 — 결정 가능하다(git이 M/D를 말한다)
#   2. 새 핸드오프 파일의 시점 frontmatter 누락 — 결정 가능하다(있거나 없거나다)
#
# 기존 파일은 소급해 고치지 않는다. frontmatter 요구는 **새로 추가되는 파일**에만
# 걸리므로, 이미 있는 112개는 그대로 두고 다음 핸드오프부터 규약이 선다.
#
#   scripts/check-history-append-only.sh [<range>]   기본 origin/main..HEAD
#   scripts/check-history-append-only.sh --self-test
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

HANDOFF_DIR='development-records/handoff/'

# 시점 박제 이름: <YYYY-MM-DD>T<HHMM>--<short-sha>--<슬러그>.md
SNAPSHOT_NAME_RE='^development-records/handoff/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}--[0-9a-f]{7,40}--[a-z0-9-]+\.md$'

# 새 스냅샷이 머리에 달아야 하는 생성 시점 정보.
REQUIRED_FRONTMATTER='created_at head branch kind'

# 판정. name-status 목록만 받는다 — git을 부르지 않으므로 self-test가 레포를
# 건드리지 않고도 falsifiable하게 검사할 수 있다.
verdict_for_status() {
  local status_lines="$1" label="$2" quiet="${3:-}"
  local rewritten="" added="" line st file
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    st="${line%%$'\t'*}"
    file="${line#*$'\t'}"
    case "$file" in "$HANDOFF_DIR"*) ;; *) continue ;; esac
    case "$st" in
      M*|D*) rewritten="$rewritten$st $file"$'\n' ;;
      A*)    added="$added$file"$'\n' ;;
      R*)    rewritten="$rewritten$st $file"$'\n' ;;
    esac
  done < <(printf '%s\n' "$status_lines")

  local fail=0
  if [ -n "${rewritten%$'\n'}" ]; then
    if [ -z "$quiet" ]; then
      echo "history-append-only: FAILED — 기존 핸드오프를 고쳐 썼다:"
      printf '%s' "$rewritten" | sed 's/^/    /'
      echo "  갱신은 새 파일이다. 이전 스냅샷은 그대로 두고 supersedes로 잇는다."
    fi
    fail=1
  fi

  local missing="" f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    printf '%s\n' "$f" | grep -qE "$SNAPSHOT_NAME_RE" || {
      missing="$missing  이름 규약 아님: $f"$'\n'; continue
    }
    [ -f "$f" ] || continue   # self-test의 합성 경로는 디스크에 없다
    local key
    for key in $REQUIRED_FRONTMATTER; do
      head -12 "$f" | grep -qE "^${key}:" || missing="$missing  ${key} 없음: $f"$'\n'
    done
  done < <(printf '%s\n' "$added")

  if [ -n "${missing%$'\n'}" ]; then
    if [ -z "$quiet" ]; then
      echo "history-append-only: FAILED — 새 핸드오프가 시점 정보를 달지 않았다:"
      printf '%s' "$missing"
      echo "  이름: development-records/handoff/<YYYY-MM-DD>T<HHMM>--<short-sha>--<슬러그>.md"
      echo "  머리: created_at / head / branch / kind (있으면 supersedes)"
    fi
    fail=1
  fi

  if [ "$fail" -eq 0 ] && [ -z "$quiet" ]; then
    echo "history-append-only: OK ($label)"
  fi
  return "$fail"
}

# 취득. 실패를 삼키지 않는다 — 빈 목록과 "범위를 못 봤다"는 구분되어야 한다.
acquire_status() {
  local range="$1" out rc
  case "$range" in
    -*) echo "범위 자리에 옵션이 왔다: '$range'" >&2; return 1 ;;
  esac
  out="$(git -c core.quotePath=false diff --name-status "$range" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then printf '%s\n' "$out" >&2; return 1; fi
  printf '%s\n' "$out"
  return 0
}

if [ "${1:-}" = "--self-test" ]; then
  st=0
  expect() { # <pass|fail> <설명> <name-status 목록>
    local want="$1" what="$2" lines="$3" got
    if verdict_for_status "$lines" "self-test" quiet; then got=pass; else got=fail; fi
    if [ "$got" = "$want" ]; then echo "self-test: $what OK ($got)"
    else echo "self-test: FAIL — $what 는 $want 여야 하는데 $got 였다" >&2; st=1; fi
  }

  expect fail "기존 핸드오프 수정"   "$(printf 'M\tdevelopment-records/handoff/20260801-x.md')"
  expect fail "기존 핸드오프 삭제"   "$(printf 'D\tdevelopment-records/handoff/20260801-x.md')"
  expect fail "핸드오프 이름 변경"   "$(printf 'R100\tdevelopment-records/handoff/a.md')"
  expect fail "새 파일 이름 규약 위반" "$(printf 'A\tdevelopment-records/handoff/20260805-new-handoff.md')"
  expect pass "규약에 맞는 새 스냅샷" "$(printf 'A\tdevelopment-records/handoff/2026-08-05T0930--d9d8918--operating-rules.md')"
  expect pass "핸드오프 밖 수정"     "$(printf 'M\tdevelopment-records/design/x.md\nM\tsrc/core-runtime/logger.ts')"
  expect pass "변경 없음"            ''

  if out="$(acquire_status 'HEAD~1..HEAD' 2>/dev/null)" && [ -n "$out" ]; then
    echo "self-test: 취득(유효) OK ($(printf '%s\n' "$out" | grep -c .)개 항목)"
  else
    echo "self-test: FAIL — 유효 범위인데 취득이 빈 목록/실패를 준다" >&2; st=1
  fi
  for bad in 'onto-nonexistent-ref..HEAD' '-M'; do
    if acquire_status "$bad" >/dev/null 2>&1; then
      echo "self-test: FAIL — '$bad' 인데 취득이 성공을 보고했다" >&2; st=1
    else
      echo "self-test: 취득 거절 OK ($bad)"
    fi
  done
  exit "$st"
fi

RANGE="${1:-origin/main..HEAD}"
if ! status="$(acquire_status "$RANGE")"; then
  echo "history-append-only: FAILED — 범위 '$RANGE'를 해석할 수 없다."
  echo "  검사하지 못한 것은 통과가 아니다."
  exit 2
fi
verdict_for_status "$status" "$RANGE"
