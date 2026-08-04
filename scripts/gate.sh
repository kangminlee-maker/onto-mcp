#!/usr/bin/env bash
# 커밋 전에 돌리는 하나의 게이트. 초록이 아니면 커밋하지 않는다.
#
# 검사가 스무 개로 흩어져 있으면 매번 무엇을 돌릴지 사람이 고르게 되고, 고르는
# 순간 빠뜨린다. 여기 한 줄이 전부다:
#
#   npm run gate
#
# 차단하는 것과 보고만 하는 것을 나누는 기준은 하나다 — **결정 가능한가**.
# 경로가 있거나 없거나, 파일이 tarball에 들었거나 아니거나는 기계가 판정한다.
# 어떤 문장이 현재를 서술하는지, 어떤 변경이 사용자에게 보이는지는 사람이 정한다.
# 휴리스틱으로 차단하면 다들 게이트를 우회하는 법부터 배운다.
#
# 자격증명이 필요한 것(`npm test`=live E2E, `benchmark:*`)은 여기 없다. 그것들은
# 실행 증거이지 커밋 전 관문이 아니다.
#
#   scripts/gate.sh              전부 실행
#   scripts/gate.sh --fast       vitest 전체 스위트를 건너뛴다(정적 검사만)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

fail=0
ran=0

run() { # <라벨> <명령...>
  local label="$1"; shift
  ran=$((ran + 1))
  printf '=== %s ===\n' "$label"
  if "$@"; then
    printf '    ok\n'
  else
    printf '    FAIL: %s\n' "$label"
    fail=1
  fi
}

# ── 게이트 자신부터 ───────────────────────────────────────────────────────────
# self-test를 본 검사보다 먼저 돌린다. 심은 위반에 죽는 것을 보이기 전에는 그
# 게이트의 초록을 세지 않는다. 카나리아가 없는 게이트는 영원히 초록이다.
run "G13 doc-currency (self-test)"       bash scripts/check-doc-currency.sh --self-test
run "G14 shipped-links (self-test)"      node scripts/check-shipped-links.mjs --self-test
run "G15 push-currency (self-test)"      bash scripts/check-push-currency.sh --self-test
run "G16 history-append-only (self-test)" bash scripts/check-history-append-only.sh --self-test

# ── 타입·경계 ─────────────────────────────────────────────────────────────────
run "typecheck (core)"                   npm run --silent check:ts-core
run "typecheck (scripts)"                npm run --silent check:ts-scripts
run "G1 import boundary"                 npx tsx scripts/check-import-boundary.ts
run "G2 hardcoded spec defaults"         npx tsx scripts/check-no-hardcoded-spec-defaults.ts

# ── 권위·계약 정합 ────────────────────────────────────────────────────────────
run "G7 supported-model guard"           npx tsx scripts/check-supported-models.ts
run "G8 prompt-projection parity"        npx tsx scripts/check-prompt-projection-parity.ts
run "G9 final-output-sections parity"    npx tsx scripts/check-final-output-sections-parity.ts
run "G11 terminal-signal rethrow"        npx tsx scripts/check-graceful-signal-rethrow.ts
run "G12 Linguist catalog drift"         npx tsx scripts/check-linguist-drift.ts

# ── 문서 현재성 ───────────────────────────────────────────────────────────────
run "G13 doc-currency"                   bash scripts/check-doc-currency.sh
run "G14 shipped-links"                  node scripts/check-shipped-links.mjs
run "G15 push-currency"                  bash scripts/check-push-currency.sh
run "G16 history-append-only"            bash scripts/check-history-append-only.sh

# ── 테스트 ────────────────────────────────────────────────────────────────────
if [ "$FAST" -eq 0 ]; then
  run "vitest (전체 스위트)"             npm run --silent test:vitest -- --reporter=dot
else
  printf '=== vitest ===\n    건너뜀 (--fast)\n'
fi

# 공허 방지: 하나도 돌지 않았는데 초록이면 그것은 통과가 아니다.
if [ "$ran" -lt 10 ]; then
  printf '\ngate: 검사가 %d개만 돌았다 — 게이트가 스스로 비었다\n' "$ran" >&2
  exit 2
fi

printf '\n=== GATE: %s (검사 %d개) ===\n' "$([ "$fail" -eq 0 ] && echo 초록 || echo 실패)" "$ran"
exit "$fail"
