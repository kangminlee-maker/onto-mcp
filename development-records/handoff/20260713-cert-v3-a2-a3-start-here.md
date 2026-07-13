# cert v3 A-2/A-3 — 다음 세션 시작점 (2026-07-13)

선행 완료: **A-1 (지금 가능분)** — clean-target(G1) + shared-root(G2) gate/record 확장 +
V1 transpile-eval probe. **PR #194 머지됨** (main HEAD `8fea8e2` 위 4커밋). 설계 SSOT:
`development-records/design/20260712-review-cert-v3-fixture-mece-design.md`.
직전 시작점 `20260713-cert-fixture-v3-start-here.md`는 이 문서로 대체됨.

## 재개 시 상태 검증 (먼저 실행)

```
pwd                          # /Users/kangmin/Documents/onto-mcp
git fetch origin main && git rev-parse --short origin/main   # 아래 landed와 대조
git branch --show-current
```

## landed (A-1, PR #194 · main 위 4커밋)

- `ed31cad` **A-1a** — `SemanticQualityExpectations` 3필드(default-off): `expectsNoMaterialDefects`
  ·`requiresBoundaryPreservation`(clean-target G1) ·`expectedSharedCauseAnchorPairs`(shared-root G2).
  각 필드가 기존 check에 신규 분기(새 check id 없음, universe 12 불변). `validSharedCauseRelation`
  헬퍼 추출.
- `075c88f` **A-1b** — `FixtureManifestEntrySchema.applicable_check_ids?`(additive-optional) 전파
  (aggregate·emission·assemble). 부재=full universe=byte-동일. wire contract **review-cert/v2 유지**.
- `fab0eef` **A-1c** — `scripts/fixture-defect-probe.ts` V1 transpile-eval 유틸(esbuild+data-URL) +
  기존 2 fixture 결함 실증(retryBudget/unstableFormat), vitest 머지게이트에서 실행.
- `3566ee6` **fix** — 독립 3-렌즈 교차검증이 찾은 5홀 차단(아래 학습 참조).

병합 후 main HEAD: `8fea8e2`. 실등록 v2 record(fable5 095011, sol 215835) recompute=0(무영향 실증).
전체 vitest 2894 green.

## A-1 교차검증 학습 (A-2/A-3에서 재활용)

- **validator/G7는 gate를 재실행하지 않고 record의 per-run `checks[].status`를 신뢰**한다. 따라서
  record가 표현할 수 있는 구조(예: applicable set 축소)는 반드시 **validator 레벨에서 제약**해야
  한다. F1(HIGH 인증우회): `applicable_check_ids` 무제약 → material fixture가 recall spine 제거해도
  통과. 수정: `REDUCED_APPLICABLE_FIXTURE_IDS`(clean-target 전용) + `CLEAN_TARGET_APPLICABLE_CHECK_IDS`
  정확 축소 강제(새 violation `applicable_check_ids_invalid`).
- 이종 리뷰어 divergence는 신호 → union 채택(리뷰어3는 F1을 SPECULATIVE로 봤으나 probe가 실증).

## 다음 시작점: A-2 (validator 하드닝)

`src/core-runtime/discovery/review-cert-record.ts`:
- **over-declaration 대칭**: 현재 검증은 `computed.per_fixture_check` 행만 순회 → declared에만 있고
  computed에 없는 초과 행(non-applicable check 참조)은 무시된다(무해하나 위생 갭, A-1b 커밋이 명시).
  declared 행 집합이 computed와 **정확히 일치**하도록 대칭 검사 추가.
- **G7 binding 재검증**: `reviewCertBindingViolations` 경로가 applicable_check_ids 도입 후에도 v2
  record 2건을 여전히 bind하는지 회귀 테스트(현재 recompute=0 실측됨, binding 레벨 명시 테스트 권장).
- **하니스 not_run 판정**: applicable set 축소 fixture의 not_run row 처리 확인.
- **content-sha 신원 바인딩은 Phase B** — F1 잔여(fixture_id 위장)는 sha-pin이 닫음. A-2 아님.

## A-3 (신규 fixture 저작) — 착수 시 주의

신규 fixture V1/V2는 blob이 있어야 성립해 A-1c에서 유예됨(owner "지금 가능분만").
- clean-target·shared-root 대상 blob을 `scripts/review-pipeline-benchmark.ts benchmarkFixture`에
  저작(SSOT 불변식: 실 모듈 금지, TS-구문 blob). FIXTURES preset에 expectations 추가.
- ⚠️ **clean-target 배선 커플링(A-1 fix가 만든 계약)**: gate FIXTURES에 clean-target을 추가할 때
  **fixture_id = "clean-target-v1"** (record의 `REDUCED_APPLICABLE_FIXTURE_IDS`와 정확히 일치)
  이어야 하고, 그 record의 `applicable_check_ids`는 `CLEAN_TARGET_APPLICABLE_CHECK_IDS`
  (=gate `CLEAN_TARGET_EXCLUDED_CHECK_IDS`의 여집합, 7종)과 일치해야 함. 하드코딩 말고 상수 파생 권장.
- 신규 fixture V1(shared-root 구조증명·clean-target 구조검사 면제) + V2 완비 메타테스트(신규
  applicable set 우선) 저작. 사전-unit 10분 hang flake(미진단, 3회 이력)를 A-3 착수 전 조사.
- A-4 v3 fresh cert run은 **owner spend 승인 별도**.

## open questions (설계 §4 — 기본값 유지)

- Q1 Phase B(온톨로지 fixture) 분리 — 기본값 **분리**
- Q2 v3 run 기존 2 fixture baseline 재실행 — 기본값 **전면 재실행**
- Q3 신규 부하 core floor 승격 — 기본값 **D4 승격 트리거**(첫 run disclosure)

## 관련 메모리

- [[onto-mcp-cert-v3-a1-complete-20260713]] — A-1 완료·교차검증 5홀·validator 신뢰모델 학습
- [[onto-mcp-cert-v3-stage0-complete-20260713]] — 단계0 4-렌즈 리뷰·6영역 스코프
- [[onto-mcp-post-impl-cross-verify-expectation]] — 완료 전 독립 multi-lens 교차검증 규약
