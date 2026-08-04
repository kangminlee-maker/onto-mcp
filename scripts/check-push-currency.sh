#!/usr/bin/env bash
# G15 push-currency — 활성 런타임이 바뀌는 push는 "지금 이 레포가 무엇인가"를 함께 옮긴다.
#
# `README.md`는 이 패키지를 쓰는 사람이 읽는 문서이고 `IMPLEMENTATION_MAP.html`은
# 지금 무엇이 켜져 있고 무엇이 판단을 기다리는지 보는 대시보드다. 둘 중 하나라도
# 코드보다 뒤처지면 읽는 사람을 없는 곳으로 보낸다. 실제로 그렇게 됐었다 — 맵은
# src 커밋 103개 동안 멈춰 있었고, 그 사이 vitest 수치가 문서 안에서 서로 달랐다.
#
# 이 검사는 "잘 고쳤는가"가 아니라 "잊지 않았는가"를 본다. 한 글자만 바꿔도
# 통과한다. 실제로 일어나는 실패는 나쁜 갱신이 아니라 갱신을 통째로 잊는 것이다.
# 정말 두 문서 모두에게 보이지 않는 변경이라면, 그 사실 자체가 맵의 한 줄감이지
# 우회할 이유가 아니다.
#
# 판정은 결정 가능하다: 범위가 런타임을 건드렸는가, 그 범위에 두 파일이 있는가.
# 그래서 차단한다.
#
#   scripts/check-push-currency.sh [<range>]   기본 origin/main..HEAD
#   scripts/check-push-currency.sh --self-test 게이트가 실패할 수 있는지 확인
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# 무엇이 맵을 낡게 만드는가는 `scripts/lib/active-paths.sh`가 소유한다 — G13과
# 같은 파일을 읽어야 두 게이트가 같은 경로를 두고 다른 답을 내지 않는다.
# shellcheck source=lib/active-paths.sh
. "$ROOT/scripts/lib/active-paths.sh"
RUNTIME_RE="$ONTO_MAP_TRIGGER_RE"

# 변경 목록 취득. **실패를 삼키지 않는다.** `git diff`가 죽으면 빈 목록이 나오고,
# 빈 목록은 "변경 없음"과 구분되지 않는다 — 그러면 해석 불가능한 범위가 초록이
# 된다. 초록은 검사한 결과여야지 못 본 결과일 수 없다.
acquire_changed() {
  local range="$1" out rc
  out="$(git diff --name-only "$range" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '%s\n' "$out" >&2
    return 1
  fi
  printf '%s\n' "$out"
  return 0
}

# 판정. 파일 목록만 받는다 — git을 부르지 않으므로 self-test가 레포를 건드리지
# 않고도 이 함수를 falsifiable하게 검사할 수 있다.
verdict_for_files() {
  local changed="$1" label="$2" quiet="${3:-}"
  local runtime missing

  if [ -z "$changed" ]; then
    [ -n "$quiet" ] || echo "push-currency: OK ($label 에 변경 없음)"
    return 0
  fi

  runtime="$(printf '%s\n' "$changed" | grep -E "$RUNTIME_RE" || true)"
  if [ -z "$runtime" ]; then
    [ -n "$quiet" ] || echo "push-currency: OK ($label 는 활성 런타임을 건드리지 않는다)"
    return 0
  fi

  # README는 비차단 보고다. 둘 다 강제하면 주석 한 줄을 고칠 때도 README에 의미
  # 없는 한 글자를 넣게 되고, 매 push마다 그러는 문서는 읽히지 않게 된다. 실제로
  # 썩은 쪽은 맵이었다 — README가 두 번 갱신되는 동안 맵은 103 커밋을 멈춰 있었다.
  # 그래서 차단은 관측된 실패에만 건다.
  if ! printf '%s\n' "$changed" | grep -qx 'README.md'; then
    [ -n "$quiet" ] || echo "push-currency: 알림 — README.md는 이 범위에 없다. 사용자에게 보이는 변경이면 함께 옮긴다(차단 아님)."
  fi

  if ! printf '%s\n' "$changed" | grep -qx 'IMPLEMENTATION_MAP.html'; then
    if [ -z "$quiet" ]; then
      echo "push-currency: FAILED"
      echo "  $label 가 활성 런타임을 바꾼다:"
      printf '%s\n' "$runtime" | sed 's/^/    /' | head -20
      echo "  그런데 IMPLEMENTATION_MAP.html이 이 범위에 없다."
      echo
      echo "  맵은 \"지금 무엇이 켜져 있고 무엇이 판단을 기다리는가\"에 답한다."
      echo "  같은 범위에서 갱신하거나, 맵에게 보이지 않는 변경인 이유를 적는다 —"
      echo "  정말 그렇다면 그것이야말로 맵의 한 줄감이다."
    fi
    return 1
  fi

  [ -n "$quiet" ] || echo "push-currency: OK (런타임 변경 · IMPLEMENTATION_MAP.html 동반)"
  return 0
}

# ── 실패 카나리아 ─────────────────────────────────────────────────────────────
# 실패할 수 있음을 증명하기 전엔 초록을 믿지 않는다. 판정은 합성 목록으로 세 경우를
# 전부 확인하고, 취득 경로(git diff)는 별도로 비어 있지 않음을 단언한다.
#
# 커밋을 만들거나 브랜치를 옮기지 않는다 — 자기 검사가 레포를 오염시키면 그 게이트는
# 신뢰할 수 없다.
if [ "${1:-}" = "--self-test" ]; then
  st=0
  expect() { # <기대(pass|fail)> <설명> <파일목록>
    local want="$1" what="$2" files="$3"
    if verdict_for_files "$files" "self-test" quiet; then got=pass; else got=fail; fi
    if [ "$got" = "$want" ]; then
      echo "self-test: $what OK ($got)"
    else
      echo "self-test: FAIL — $what 는 $want 여야 하는데 $got 였다" >&2; st=1
    fi
  }

  expect fail "런타임 단독"        $'src/core-runtime/logger.ts'
  expect fail "런타임 + README만"  $'src/core-runtime/logger.ts\nREADME.md'
  expect pass "런타임 + 맵"        $'src/core-runtime/logger.ts\nIMPLEMENTATION_MAP.html'
  expect pass "런타임 + 둘 다"     $'src/core-runtime/logger.ts\nREADME.md\nIMPLEMENTATION_MAP.html'
  expect fail "설정 단독"          $'.onto/settings.json'
  expect fail "집행 코드 단독"     $'scripts/check-push-currency.sh'
  expect fail "훅 단독"            $'.githooks/pre-push'
  expect fail "계약 .onto 단독"    $'.onto/processes/review/record-contract.md'
  expect pass "문서만"             $'docs/architecture/repo-layout.md\ndevelopment-records/x.md'
  expect pass "유효 범위·변경 없음" ''

  # 취득 경로를 **실제 함수로** 양방향 확인한다. 유효 범위는 목록을 주고, 해석
  # 불가능한 범위는 실패로 전파되어야 한다 — 후자가 조용히 빈 목록이 되면 위
  # "변경 없음 → pass"가 그 구멍을 승인하는 장치로 바뀐다.
  if out="$(acquire_changed 'HEAD~1..HEAD' 2>/dev/null)" && [ -n "$out" ]; then
    echo "self-test: 취득(유효) OK ($(printf '%s\n' "$out" | grep -c .)개 파일)"
  else
    echo "self-test: FAIL — 유효 범위인데 취득이 빈 목록/실패를 준다" >&2; st=1
  fi
  if acquire_changed 'onto-nonexistent-ref..HEAD' >/dev/null 2>&1; then
    echo "self-test: FAIL — 해석 불가능한 범위인데 취득이 성공을 보고했다" >&2; st=1
  else
    echo "self-test: 취득(무효) OK (fail-closed)"
  fi

  exit "$st"
fi

RANGE="${1:-origin/main..HEAD}"
if ! changed="$(acquire_changed "$RANGE")"; then
  echo "push-currency: FAILED — 범위 '$RANGE'를 해석할 수 없다."
  echo "  검사하지 못한 것은 통과가 아니다. base가 없거나 ref가 사라졌는지 확인한다."
  exit 2
fi
verdict_for_files "$changed" "$RANGE"
