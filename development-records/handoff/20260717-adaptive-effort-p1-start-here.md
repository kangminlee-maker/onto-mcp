# Handoff — adaptive-effort P1 착수 (start here)

> 목적: `/clear` 직후 fresh context에서 **adaptive-effort P1**(무비용·오프라인)을 바로 이어가기.
> P0 + sol role-확장 + settings 승격은 전부 **main 머지 완료(PR #219, merge 1c6502a)**.
> 이 파일은 P1 PR에 함께 커밋해도 된다(현재 untracked).

## 0. 위치·시작 명령 (먼저 확인)

```bash
cd /Users/kangmin/Documents/onto-mcp
git fetch origin && git switch main && git pull --ff-only origin main
git switch -c feat/adaptive-effort-p1   # base = 1c6502a 이상
```

주의: 리모트가 공유 저장소이므로 작업 전 `origin/main..HEAD`로 range 계산(로컬 base drift 주의).

## 1. 권위 문서 (이 순서로)

1. **설계 SSOT (rev.3)**: `development-records/design/20260716-effort-benchmark-and-setting-logic-design.md`
   — **§8 P1이 이 작업의 스코프**. §4(벤치 방법론)·§5(메커니즘)·§9(falsifiability)·§10(concept 원장)·
   §12(2라운드 교차검증 이력 — rev.1/2의 무효화된 접근을 재도입하지 말 것).
2. `INVARIANTS.md` — INV-BENCH-1(runs≥3·fixtures≥2)·INV-EXP-1(한 변수)·INV-CFG-1·INV-MODEL-1(B7
   role-확장 조항은 2026-07-17 개정됨).
3. 메모리 `onto-mcp-adaptive-effort-design-20260716` (경과 요약).

## 2. 한 줄 요지

P0가 만든 **순수 부품**(coverage 맵퍼·graded adapter·zone 리포트·embed witness·prereg 검증기) 위에,
P1은 **벤치 실행 준비물**(arm 설정 생성기·적격성 사전계산·ITT 분석기·judge 불변성 하니스·cost 캡처)을
무비용으로 만든다. 라이브(P2)는 별도 owner-spend 승인 필요 — P1에서 절대 라이브 dispatch 금지.

## 3. 완료된 것 (P0, main에 있음 — 착수 시 실코드 재확증)

| 부품 | 위치 | 핵심 |
|---|---|---|
| coverage 맵퍼 | `src/core-runtime/review/embed-coverage.ts` | **렌더링된 materialized-input 좌표**(raw target 라인 아님), 유일-앵커 fail-loud, in/out/**straddle**, `coverageCellEligibility`(결정론 적격성). 테스트가 실제 `renderReviewTargetMaterializedInput`+`truncateForEmbedding`과 byte-대조 |
| graded adapter + ingest | `src/core-runtime/effort-calibration-graded.ts` | `gradedRunGateSignal`(gate=recall≥cut ∧ precision≥floor, quality=recall), **`m3-bench-run/1`** 스키마 {zone,effort,fixture,rep,metrics,cost}, per-(model,**zone**) whole-pipeline 리포트 + **R≥3/fixture≥2 게이트 내장** |
| embed witness | `materialize-review-prompt-packets.ts` `resolveEffectiveEmbedBudget` → context manifest `embed_budget{max_embed_lines_effective, max_embed_lines_source}` | 사후-우선순위 effective 값. **plan 필드는 prepare-time 값이라 witness 아님**. 우선순위: cli > plan > default(:1047 부근) |
| prereg | `scripts/effort-bench-prereg.ts` + `development-records/benchmark/effort-bench/preregistration-template.yaml` | 파서/검증기 + **fail-closed** 대비/회복 평가기. 커밋된 템플릿을 테스트가 파싱(drift 불가) |
| 커버리지 노브 | settings `review.context.max_embed_lines`(settings-chain:404) → review-invoke:2919 → `--max-embed-lines` → packets 우선순위 | **라이브 노브 실증됨**. per-arm eval-settings로 핀 |

sol은 review+author+confirmation_provider 3-role 등록(registry), reconstruct seat default=sol@medium.

## 4. P1 스코프 (설계 §8 P1 — 전부 무비용·오프라인)

1. **defect evidence-anchor authoring + 적격성 사전계산 리포트**: 4개 ontology fixture
   (`development-records/benchmark/fixtures/ontology/{clinical-lab-workflow,credit-risk-taxonomy,
   manufacturing-bom,logistics-fulfillment}`)의 seeded_defects에 대해 **렌더 좌표 앵커**
   (`DefectEvidenceAnchor[]`) authoring → 맵퍼로 (fixture × 노브값)별 in/out/straddle 사전계산 →
   등록 술어("컷 밖 material defect ≥m") 충족 셀 도출. **앵커는 렌더 텍스트 내 유일 출현 강제**
   (맵퍼가 fail-loud). 산출물은 prereg manifest의 노브/수준 선택 근거.
2. **arm eval-settings 생성기**: p2-eval-settings 패턴(`development-records/benchmark/m3/p2-eval-settings/`)
   재사용 — (coverage 노브 `max_embed_lines` 사다리) × (whole-pipeline effort {medium,high}) 조합별
   clean settings 파일 생성. **confound diff 증명**: arm 간 diff가 의도 축만 다름을 기계 검증.
3. **ITT 대비/CI 분석기**: prereg 평가기(점추정)를 **클러스터 구조**(K는 review 내, R은 fixture 내 —
   풀링 금지)로 확장: review-수준 분산, CI(등록된 `analysis.ci` 규칙), 다중성. 합성 곡선 테스트.
4. **judge 불변성 blind 표본 하니스**: coverage×effort 균형 표본, issue specificity 층화, FNR/FPR
   비교가능성 판정(R2-10). 순수 로직 + 표본 추출기(라이브 채점은 P2).
5. **arm cost 캡처 스키마**: output-token+wall-time을 `m3-bench-run/1`의 `cost`(EffortCostSummary)로
   싣는 수집기.
6. (검토) per-run tool-read 기록 확장 — artifact는 집계 `tool_calls`뿐. 확장이 무겁면 "이질성 미관측"을
   리포트에 명시하는 쪽으로(설계 §4-4).
7. **벤치 run-admission assert**: run 채택 전 context manifest의 `embed_budget.max_embed_lines_effective
   == 의도 노브` 정확 일치 검증(witness 소비 — P0가 만든 필드의 소비자).

골든·m3-compare 회귀 유지. 리포트 필드는 기존 `semantic_quality_*`와 grep-구분(설계 RIDER).

## 5. 금지 (설계 §10 + §12 — 재도입 금지 목록)

- minViable 단조추적을 **검증통계로 사용 금지**(R1 클러스터 1 — vacuous).
- raw-target-라인 커버리지 금지(컷은 합성 렌더 문서의 first-N — R2-3).
- 문서 교란(패딩) fixture 금지 — 노브 조작이 1차(자가검증 rev.2.1; 교란은 후속 위치-변주 전용).
- registry `context_window_tokens` 배선 금지(P0/P1 — flag-off에도 동작 변경, R2-9).
- settings adaptive flag 추가 금지(INV-CFG-1 사람 승인 별도 게이트).
- 결과 기반 fixture 선별 금지(적격성은 결정론 술어 사전등록 — R2-6).
- 이 벤치 결과로 분할(partition)·300줄 상수·장문 일반화 승격 금지(D8).
- 라이브 LLM dispatch 금지(P2 owner-spend 별도 승인).

## 6. 검증 (P1 완료 기준)

- `check:ts-core`·`check:ts-scripts`(신규 스크립트는 tsconfig.scripts.json include에 추가)·
  `npx vitest run`(전체)·G1/G2/G6·G4(커밋 range).
- falsifiable 단위테스트: 앵커 모호/미출현 fail-loud / 적격성 술어가 부적격 셀 거부 / arm diff가
  의도 축 외 변경 시 생성기 fail / 클러스터 CI가 풀링 CI와 다름을 보이는 합성 케이스 /
  witness 불일치 run 거부.
- 구현 후 **독립 multi-lens 교차검증**(cross-family 권장 — 설계 리뷰가 전부 Codex였으므로 구현
  리뷰는 kind·family 교차) material 0 확인 후 PR.

## 7. 알려진 함정·백로그 (P1 범위 밖, 재확증만)

- codex 워커 경로: dead-child-open-stream wedge를 600s 유닛 타임아웃이 미포착(2026-07-17 실증,
  1.5h 침묵) — 라이브 run 시 정체 감시 필요. 백로그 감.
- 로컬 `check:supported-models` FAIL은 untracked `.onto/review/20260714-*` 세션 로그의 benchCandidate
  토큰 노이즈(main에서도 재현, CI 무관).
- M3 P2 R=2 실측: review-생성 분산 큼(어느 fixture도 양 arm STABLE 아님) — R≥3 요구의 실증 근거.
