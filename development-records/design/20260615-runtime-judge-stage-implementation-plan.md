# 계획 — 런타임 judge 단계 구현 (ODKE+ 지지 게이트 활성화)

> **Type**: implementation-process 계획 (design 모드). **구현 승인 아님** — R0 경로 확정 + 승인 후 시작.
> **Target repo**: `onto-mcp-claude` (격리). 이 계획은 `onto-mcp-closure`에서 작성, 구현은 소스 레포에서.
> **활성화 대상**: PR #55가 planned tier로 둔 계약(`answer_support_judgment_*`).
> **Grounding**: 소스 런타임 읽기 전용 조사(이 세션). 정확한 줄번호는 구현 착수 시 재확인(심볼/맵 이름 기준).
> **Date**: 2026-06-15.
> **R0 결론(갱신)**: ultracode 워크플로로 R0 확정 → **경로 A**. 그 과정에서 PR #55의 registry
> **load-break(gate-0)** 발견·수정 완료. 상세·구현 가능 설계 = [R0 설계 문서](./20260615-runtime-judge-stage-r0-design.md).
> 아래 §2 결정점·§3 작업분해는 그 문서가 정밀화한다.

## 1. 목표 / 완료 기준

planned로 착지한 ODKE+ judge 게이트를 런타임에서 **active로 승격**한다.
- **완료 기준(E2E)**: `convergent_source_evidence` answer claim이 *≥2 독립 judge-confirmed support* 없이는
  validate되지 않는다. author≠judge가 **구조적으로** 강제된다(별도 단계·아티팩트). drift `no_drift`, 테스트 green.

## 2. 핵심 설계 결정 (high-level)

- **judge = 별도 authoring 단계** `answer_support_judgment`, `answer_support_ledger_validation` downstream.
  별도 LLM invocation·별도 authored 아티팩트 → 런타임 *아티팩트-단위 귀속*이 author≠judge를 구조 강제
  (PR #55 계약의 전제와 정합).
- **judge 출력 = bounded per-evidence** `supports: yes/no` + `rationale_ref`만. **sufficiency 집계는 runtime**
  (answer-claims validator의 B-6 conditional 의무). judge는 "충분"을 판정하지 않는다.
- **독립성 강화**(의미): judge 프롬프트는 저자의 자기평가 rationale을 *보지 않고*, 증거+proposed_answer만
  보고 검증하도록 컨텍스트 격리(R2 프롬프트 설계 항목). 구조 분리만으로는 rubber-stamp 위험 잔존 → 명시.

### 결정점 (가장 중요) — predicate evaluator 경로

현재 런타임 평가기 `reconstruct_registry_predicate_v1`은 `true`·`artifact_exists(...)`·count만 지원하고,
계약 토큰 `answer_support_ledger_has_convergent_source_evidence_cluster`는 **미지원**이며
`activation_condition`도 **아직 미강제**(planned 게이트는 현재 평가 안 됨 = 안전하게 dormant).

| 경로 | 내용 | 범위 | 권장 |
|---|---|---|---|
| **A (최소)** | 게이트 `required_when`을 *기존 지원 토큰*으로 단순화, "convergent cluster일 때만 필수"는 validator 내부 조건으로 처리. evaluator 미확장. | judge 게이트만 좁게 활성화. **계약 required_when 미세조정 필요(rank-5, 확인 후)** | ✅ **먼저** |
| **B (정공법)** | predicate evaluator를 확장해 새 토큰 평가 + `activation_condition` 강제 구현. | 다른 planned 게이트(promotion 등)도 활성화 가능해짐 → 범위·리스크↑ | 후속 별도 트랙 |

→ **A 먼저**(judge만 활성화), evaluator 확장(B)은 분리. A 선택 시 PR #55 계약의 `required_when` 토큰을
A에 맞게 조정하는 *추가 제안*이 필요(자동수정 금지 → 확인 후).

## 3. 작업 분해 (ordered · 의존성 · 검증점)

**R0 — 사전 확정 (design 마감)**
- predicate-evaluator 경로 A/B 확정 → (A면) 계약 `required_when` 토큰 정합 제안.
- 아티팩트 스키마 확정: `ReconstructAnswerSupportJudgmentArtifact` / `...ValidationArtifact`.
- 검증: 계약↔런타임 토큰 일치, 스키마↔B-1 shape 일치.

**R1 — 스테이지 배선 (무-LLM 골격)**
- `artifact-types.ts`: stage id 2개(`answer_support_judgment`/`_validation`) + 아티팩트 타입 인터페이스.
- `pipeline-execution-ledger.ts`: stage spec 2개 + `VALIDATION_GATE_BY_AUTHORED_UNIT` + presence-inputs 맵.
- `execution-telemetry.ts`: `UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`에 `["AnswerSupportJudgment", ...]`(fail-loud).
- `mock-llm-realization.ts`: judge 프롬프트 핸들러(fixture; 없으면 throw).
- 검증: typecheck, `pipeline-execution-ledger.test`·`execution-telemetry.test` green(스테이지 등록 인식).

**R2 — judge authoring (LLM 경로)**
- `run.ts`: `writeAnswerSupportJudgment()` — `callJsonAuthor`, `artifactName: "AnswerSupportJudgment"`,
  upstream `answer_support_ledger(_validation)`. **별도 invocation = author≠judge.**
- 프롬프트/스키마: per-evidence `supports` + `rationale_ref`만(bounded), 저자 rationale 비노출.
- 검증: mock fixture 결정론 단위 테스트 + mock E2E 1회.

**R3 — validator (결정론)**
- `maturation-validation.ts`: `validateAnswerSupportJudgment()` (B-5 의무 3종: refs resolve / supports enum /
  rationale ref) + `writeAnswerSupportJudgmentValidationArtifact()`.
- `maturation-answer-claims-validator`: **B-6 conditional 의무** 구현 — convergent claim → 서로 다른
  source location/kind의 evidence_ref ≥2개가 각각 judge `supported`.
- 검증: `maturation-validation.test` 신규 스위트(valid/violation 시나리오).

**R4 — 게이트 활성화 + 승격**
- 경로 A: 게이트를 active 배선(`required_when` 단순 토큰) + activation 처리. terminal/continuation 투영이
  judge 게이트를 소비하는지 확인(`dynamic_input_authority_rule`).
- 검증: 게이트 enforce E2E(judge 없는 convergent claim → **차단**), `check:invariant-drift` = no_drift.

**R5 — E2E + 회귀**
- 변경 흐름 targeted E2E + `run.test` 라운드트립.
- **벤치마크 회귀**: judge 단계 추가가 완주율에 주는 영향 점검(medium 완주율 ~17% 기저) — materiality 판단.

## 4. 리뷰 게이트 / redesign 트리거 (staged-workflow)

- 각 Phase 후 self/onto 리뷰 → material(blocker/high/medium) 0까지 반복.
- **redesign 트리거**: 경로 A로 계약 토큰을 못 맞춤 → B 승격 결정(범위 확장 → **사용자 확인**).
- **stop**: judge 게이트가 벤치마크 완주율을 유의하게 떨어뜨림(materiality) → 게이트 강도/scope 재검토 후 사용자 선택.

## 5. 리스크

- **predicate evaluator 미구현 (최대)** — A로 우회하되 계약 `required_when` 조정 필요(rank-5).
- **완주율 영향** — judge 추가 단계 = LLM 실패/지연 추가. 게이트를 `required_when`으로 좁게(convergent일 때만).
- **judge 의미 독립성** — 구조 분리는 보장되나 같은 모델/컨텍스트면 rubber-stamp 위험 → 프롬프트 컨텍스트 격리로 완화, 한계 명시.
- **격리 규율** — 구현은 소스 레포에서. 이 worktree·`onto-mcp-l1a`와 충돌 금지.

## 6. 검증 매트릭스 (완료 전)

| 층 | 항목 |
|---|---|
| 정적 | typecheck/lint, `check:invariant-drift` no_drift, registry 이름 일치 |
| 단위 | validator 의무 3(B-5)+1(B-6), stage 등록 테스트 |
| 통합 | mock judge authoring → validation 라운드트립 |
| E2E | convergent claim이 judge 없이는 invalid (게이트 enforce) |
| 회귀 | `run.test` + 벤치마크 완주율 |

## 7. 구현 트리거

R0에서 **경로 A/B 확정** + (A면) **계약 `required_when` 미세조정 승인** 후 R1 시작. 그 전까지는 design 단계.

## 8. 참조

- 계약·검증: PR #55 (`...closure-hardening-registry-proposals.md` §6 적용 완료, `...boundary-recognition-procedure.md`).
- 핸드오프: `../handoff/20260614-reconstruct-closure-hardening-handoff.md` §5(런타임 트랙)·§7(불변식).
- 런타임 확장 지점(이 세션 조사): stage 등록(artifact-types/pipeline-execution-ledger/execution-telemetry),
  authoring(run.ts + llm/ + mock-llm-realization), validator(maturation-validation), 게이트/투영(terminal-validation), 평가기(contract-registry).
