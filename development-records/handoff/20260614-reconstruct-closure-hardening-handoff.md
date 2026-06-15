# Handoff — Reconstruct Maturation Closure Hardening

> **Date**: 2026-06-15 (재갱신; 최초 2026-06-14)
> **Worktree**: `/Users/kangmin/cowork/onto-mcp-closure`
> **Branch**: `feat/reconstruct-closure-hardening` — **PR #55 OPEN** (base `main`, head `162bc55`, origin 동기화, 작업트리 clean)
> **Status**: 계약-side closure hardening **완료** + 런타임 **R0 설계 완료(경로 A)** + PR #55 **load-break(gate-0) 수정 완료**. 남은 것 = 런타임 judge 단계 **구현(R1~R5)** — 격리된 소스 레포 `onto-mcp-claude`.

## 0. clear 후 즉시 시작 (resume)

1. **1순위 정독**: `development-records/design/20260615-runtime-judge-stage-r0-design.md` — 구현 가능 R0
   설계(경로 A·EDIT SET 1/2/3·스키마·authoring·validator 의무·테스트·open items)가 다 들어있다.
2. 그다음 이 핸드오프 §5(다음 작업)·§7(불변식)·§9(작업 규칙).
3. 구현은 **소스 레포 `onto-mcp-claude`**(격리). 이 worktree는 *읽기/계약* 전용. `.onto` EDIT SET은
   rank-5라 적용 전 **사용자 확인** 필수.

## 1. 한 줄 요약

closure 정지 기준을 신설 없이 굳히는 두 narrow hardening을 **boundary 인지 절차**로 검증: **갭-타이핑은
철회**(기존 `closure_disposition`이 방향을 과결정), **ODKE+ 지지 게이트는 좁게 진행**(빠진 건 "증거→답
imply"의 독립 judge뿐). 계약은 **planned tier**로 적용(PR #55). 런타임 **R0 = 경로 A**, 그 과정에서 PR
#55의 registry **load-break를 발견·수정**. 다음은 런타임 judge 단계 구현.

## 2. PR #55 커밋 (origin 반영)

| commit | 내용 |
|---|---|
| `50ab5d2` | foundation: 운영모델 개념 + 개념표면 감사(맵/원장) + 리뷰·리서치 + closure 스파이크 + .onto 감사수정 |
| `5e6f06b` | DD-010 lean 재작성 |
| `d01be90` | ODKE+ B를 planned tier로 적용(answer_support_judgment_*) + 갭-타이핑 철회 기록 |
| `ea1a49d` | **fix**: gate-0 load-break — judge validator를 active→`planned_validator_records` |
| `162bc55` | **docs**: 런타임 R0 설계(경로 A) + gate-0 발견 + proposals 정정 |

> 백업 ref `backup/closure-hardening-20260615`(rebase 전 상태) 존재 — PR #55 머지 후 삭제 가능.

## 3. 확정 결론 (재신고 금지)

- **갭-타이핑 = 변경 없음**: 방향(divergence/absence)은 `closure_disposition`(8값)+`authority_kind`의 파생
  투영(과결정). 매트릭스 신규 필드 금지(redundant·lossy·표면증가). 라우팅 완전성도 기존 의무가 양방향 강제.
- **ODKE+ = 좁게 진행**: 결정론 envelope(개수·독립·모순·binary)는 이미 게이트됨. judge는 별도 authored
  아티팩트(`AnswerSupportJudgment`)로 author≠judge를 *아티팩트-단위 귀속*으로 구조 강제. per-evidence
  `supported|not_supported` + rationale_ref만, sufficiency는 runtime(B-6) 집계.
- **런타임 활성화 = 경로 A**: 지원 presence token으로 judge gate 좁게 활성화. evaluator 확장(B)은 별도
  트랙(dormant planned 게이트 대량 활성화 = 광범위 blast radius).

## 4. 적용된 계약 (planned tier, active 런 무영향 — PR #55)

maturation-design: `answer-support-judgment.yaml` shape. registry: `planned_artifact_authorities`(2),
`planned_validation_gate_catalog`(judge gate), `required_when_predicate_catalog`(`answer_support_judgment_required`
+ family 인스턴스), **`planned_validator_records`**(judge validator — gate-0 수정으로 여기), answer-claims
validator conditional 의무(B-6). 검증: 실 loader **LOADED 39/39**, `check:invariant-drift` no_drift.

## 5. 다음 작업 — 런타임 judge 단계 구현 (R1~R5, 소스 레포 `onto-mcp-claude`, 격리)

정밀 계획은 **R0 설계 문서**가 소유. 요지:

- **EDIT SET 2 (활성화, rank-5 .onto, 확인 후 + 런타임 stage와 *함께*)**: 지원 predicate
  `answer_support_judgment_required_minimal`(truth `artifact_exists(answer-support-judgment.yaml)`) 추가 →
  judge gate·두 artifact authority·judge validator를 **active로 함께 승격**(따로 가면 loader throw).
- **EDIT SET 3 (validator input 정정, rank-5)**: B-5 judge validator에 authored `answer-support-ledger.yaml`,
  B-6 conditional input에 authored `answer-support-judgment.yaml` 추가.
- **코드**: stage 배선(`artifact-types`/`pipeline-execution-ledger`/`execution-telemetry` UNIT_ID fail-loud) +
  `writeAnswerSupportJudgment`(별도 invocation; **judge userPayload는 저자 rationale/independence_basis 배제**
  = 컨텍스트 격리; evidence_ref는 runtime이 observation_id→full ref로 lift) + `validateAnswerSupportJudgment`(B-5)
  + answer-claims validator B-6(독립 키 = ledger envelope의 `source_ref:location` 2-tuple byte-identical) +
  `mock-llm-realization` judge 분기.
- **정책**: judge author는 **unconditional-write**(빈 cluster여도 두 파일 작성) — 안 그러면 non-convergent run에서
  gate over-block.
- **검증**: typecheck/lint · **실 loader 적재**(필수, 아래 §9) · `check:invariant-drift`(EDIT SET 2 후 재실행,
  planned→active 승격이 보호키 trip 시 INVARIANT-CHANGE 마커) · 단위(B-5 3 + B-6) · E2E(judge 없는 convergent
  claim 차단) · **벤치마크 완주율 회귀**(judge 단계가 ~17% medium 완주율에 LLM 호출+게이트 추가 → STOP 가드).

## 6. 반드시 읽을 것

- **`development-records/design/20260615-runtime-judge-stage-r0-design.md`** ← 1순위(구현 가능 R0).
- `development-records/design/20260615-runtime-judge-stage-implementation-plan.md` — R1~R5 골격.
- `development-records/design/20260614-boundary-recognition-procedure.md` — 절차·두 검증.
- `development-records/design/20260614-closure-hardening-registry-proposals.md` — 적용 블록·§6 gate-0 정정.
- 계약: `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`, `ontology-seeding-and-maturation-design.md`.

## 7. 불변식 / 경계 (유지)

- **두 권위 분리**: LLM=의미, runtime=결정론. runtime은 빠진 의미를 몰래 채우지 않는다.
- **ODKE+ judge 경계**: judge=LLM은 per-evidence yes/no만, sufficiency는 runtime 집계. author≠judge는
  아티팩트-단위 귀속으로 **구조** 강제(자기선언 필드로 X).
- **judge 의미 독립 한계(미해결)**: 동일 모델/컨텍스트 rubber-stamp는 구조만으론 못 막는다 — prompt 컨텍스트
  격리가 유일 레버(tracked follow-up, "해결됨" 오인 금지).
- **정지 기준 신설 아님**: canonical = `MaturationContinuationDecision`.
- **materiality 한계**: 정지 신호·갭 materiality는 LLM-authored. 하드닝은 방향·충분성만 결정론화.
- **개념경제**: ODKE+ 신규 top-level 개념 = 1(`AnswerSupportJudgment`); `supported|not_supported`는 net +1 enum(정직 회계).

## 8. 작업 규칙

- 권위 계약(.onto rank 1–5) **자동수정 금지** — 수정안 제시 → 사용자 확인 → 적용.
- 커밋은 사용자가 요청할 때만. 메시지 끝 Co-Authored-By.
- **검증(레지스트리 변경 시 필수)**: ① 실 loader 적재 `loadReconstructContractRegistry`(tsx probe) — YAML
  파싱+grep+invariant-drift는 active validator→active gate 참조 깨짐을 **못 잡는다**(gate-0가 그렇게 샘) ②
  `npm run -s check:invariant-drift`(no_drift) ③ 참조 resolve ④ registry 이름 일치.
- 이 worktree에서 작업. 소스 레포(`onto-mcp-claude`)·`onto-mcp-l1a`는 격리 — 구현 트랙 전까지 **읽기만**.
