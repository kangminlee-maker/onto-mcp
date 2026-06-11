# Fable(claude-fable-5) 모델 벤치마크 기록 (PRELIMINARY)

> 상태: 완료 (fixture당 완주 1 run — PRELIMINARY; INV-BENCH-1 decision-grade는 runs≥3 필요).
> 변수: **executor 번들만** — `settings-claude-fable.json`(auth oauth + provider anthropic + model claude-fable-5 → claude_code adapter); effort/timeout/retry 등 나머지는 codex baseline과 동일(INV-EXP-1). baseline: codex(gpt-5.5+codex_cli) 3 fixture × 3 runs (`20260610-ontology-problem-eval-record.md` 후속 6).
> 실행: `ONTO_EVAL_SETTINGS=...settings-claude-fable.json CLAUDE_CONFIG_DIR=~/.claude-1 npx tsx run-ontology-review.mts`

## 1. 결과 — 의미 품질

| fixture | fable 세션 | seeded 검출 | gate | findings/material | codex baseline (3 runs) |
|---|---|---|---|---|---|
| clinical | `20260611-49e15b58` | **10/10** | passed | 42 / 25 | CLW-10 **2/3**, 나머지 3/3 · gate 3/3 |
| credit | `20260611-284c5e2e` | **10/10** | passed | 43 / 23 | 30/30 · gate 3/3 |
| bom | `20260611-43359fc2` | **10/10** | passed (completed_with_degradation — degraded lens 0, 전 유닛 completed; 보조 상태 플래그) | 45 / 32 | MBO-8 **2/3**, 나머지 3/3 · gate 3/3 |

- **seeded 30/30** — codex 3×3에서 분산을 보이던 CLW-10·MBO-8까지 각 1 run에 전부 검출(단, n=1이라 분산 비교는 불가 — 우월 주장은 PRELIMINARY).
- 산출 밀도: findings 42~45개 (codex 13~21개의 ~2.5배) — 상세도가 높고 material 분류도 큼(23~32). 과잉 분류 여부는 미채점(환각 검사 비수행 — 후속 후보).

## 2. 결과 — 비용·신뢰성

- **시간**: 완주 run 기준 fixture당 ~43~47분 (codex ~10~20분의 ~2.5~4배). 심야 부하 시 2시간+ 관측(clinical 1차).
- **신뢰성**: 완주까지 시도 — clinical 1회 / credit 3회 / bom 3회. 실패 모드:
  1. 환경: 세션 한도(`session limit`, claude-1 quota) ×2, 망 단절(ConnectionRefused) ×1 — 모델 무관.
  2. **모델 행동**: `output_contract` — `submit_issue_stance_response is missing issue_id(s): issue-021` (bom `ca3c674b`, 부분 제출 후 재시도 2회 동일 실패). codex 3×3에서는 미관측. → **submit salvage recovery 설계의 동기** (`design/submit-salvage-recovery-design.md`).
- 실패 attempt evidence 보존: credit `005b8e3a`(망), bom `ca3c674b`(부분 제출) — 감사용.

## 3. 운영 재현성 (실측)

- 격리 HOME에서 claude CLI 인증 3요소: `~/.claude`(디렉토리) + `~/.claude.json`(로그인 상태) + **`~/Library/Keychains`(OAuth 토큰, HOME 기반 해석)** — 러너가 3종 모두 symlink.
- worker 탐지는 `CLAUDE_CONFIG_DIR` 기준(`.oauth-token` 마커) — claude-1/claude-2 멀티 설치 환경에선 재현 시 명시 고정 필요.

## 4. 결론 (PRELIMINARY)

동일 fixture·동일 packet·동일 채점에서 **fable은 회수율 상한(30/30)을 보였고 codex는 속도·계약 준수 안정성에서 우위**. 도구-계약 flake는 salvage recovery(설계 확정, 구현 진행)로 흡수 예정. decision-grade 비교가 필요하면 fable 3×3 확장(약 7~9시간 wall-clock + quota 소모)을 별도 결정.
