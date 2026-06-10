# 4f rebase live 재검증 기록 (2026-06-10)

> A 루프의 frontier 엔진 rebase(F1–F3) + ledger first-wins fix 이후 live-LLM 재검증. 실 codex(OAuth gpt-5.5), full 9-lens, MCP 경로(`npm run test:e2e`).

## 실행 요약

| Run | topology | 리뷰 본체 | E2E 스크립트 판정 |
|---|---|---|---|
| flat | main-workers | `completed` · 9/9 · degraded 0 · **delib 44유닛**(실 이슈 6) · synthesis 수행 | **전부 통과** (semantic gate 13 passed, continue/cancel 시나리오 포함, exit 0) |
| nested run-1 | nested-workers | `completed` · 9/9 · degraded 0 · 4단계 nested batch 전부 ok summary | canonical+**semantic gate 통과** → **continue 시나리오 신뢰 검사 실패** → 잠복 버그 발견(아래) |
| nested run-2 (fix 후) | nested-workers | `completed` · 9/9 · degraded 0 | semantic gate 내용 검사 2건 실패(`false_materiality_guard`, `boundary_uncertainty_preservation`) |
| nested run-3 (재시도) | nested-workers | `completed` · 9/9 · degraded 0 · delib 8유닛 | 동일 2건 실패 |

## 핵심 성과 1 — rebased 루프의 live 실증

- **mid-run frontier 부기 작동**: `execution-result.yaml`이 단계마다 engine-shape로 갱신되고 frontier가 finding-ledger→…→synthesize를 정확히 라우팅 (flat·nested 모두 관찰)
- flat run은 **무거운 실전 경로**(이슈 6, 심의 44유닛)를 frontier 루프로 완주 — 골든 mock(빈 파이프라인)이 못 덮는 fan-out·reduce 조합 검증
- nested에서 **deliberation nested batch가 live 최초 발화**(이전 live는 planned 0) — lens/stance/delib/synthesis 4단계 모두 `UNIT_DISPATCH_SUMMARY` all-ok

## 핵심 성과 2 — live 게이트가 잡은 잠복 버그 (수정: ad48b79)

nested run-1의 continue 시나리오(세션 `20260610-3c51cdc4`)에서 "completed인데 synthesize blocked_by_upstream":

- **원인(PR #22 시절부터, 4f 무관)**: unavailable-fallback으로 완성된 유닛은 실패 시도를 같은 unit_id의 `child_results`로 내장 → execution-result(`allExecutionResults` 재귀 평탄화)·manifest(worker-unit child 평탄화) 양쪽에서 중복 unit_id 발생(부모 선행) → **last-wins Map이 failed child로 completed parent를 가림** → downstream 신뢰 연쇄 차단
- 4f 루프는 mid-run에 child 없는 engine result를 merge하므로 무사히 진행; 최종 enriched artifact에 대한 사후 신뢰 검사만 깨짐. **오늘 live가 처음으로 fallback 경로를 실전에서 밟아 노출** (executor 일시 실패 2유닛 → fallback 완성 → 파이프라인 정상 지속 — A 의미론 자체는 정확히 작동했음)
- **수정**: per-unit 매핑 first-wins(부모=상태 권위, child=감사 추적). **실패 세션 실물 아티팩트로 재검증: 35/35 trusted** + fallback 형태 회귀 테스트

## 미해결 — semantic gate 내용 검사 변동 (후속 조사 항목)

nested run 2·3이 **완료된 리뷰의 내용**에 대해 같은 2개 체크에서 실패. run-1은 동일 코드 표면(ledger fix는 내용 무관)에서 통과, flat도 통과 → 4f 회귀 아님. 단 **동일 체크 2연속은 단순 변동으로 치부하기엔 의심스러움** — 가설: (a) 이 작은 fixture 대상에서 gate 엄격성과 모델 산출의 경계선 상호작용, (b) 당일 모델 거동 드리프트. 후속: gate 실패 세션들(`cad6106e`, `c8dcee91`)의 final-output을 보존된 기준으로 체크별 원인 분석, 필요시 gate 기준/fixture 보강. **런타임 결함 증거는 없음.**

## 결론

4f가 변경한 런타임 표면(루프·ledger)은 flat 전체 통과 + nested run-1 gate 통과 + ground-truth fix 검증으로 live 실증 완료. 잔여는 내용-품질 게이트의 변동 조사(별건).
