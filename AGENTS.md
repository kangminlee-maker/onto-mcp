# AGENTS

> 상태: Active
> 목적: 이 레포에서 작업하는 에이전트가 핵심 authority와 개발 기준을 빠르게 찾도록 한다.

---

## 0. 비협상 규칙 (INVARIANTS)

1. **매 작업·루프 시작 시 `INVARIANTS.md`를 다시 읽고**, 지금 만들려는 변경이 어떤 불변식에
   닿는지 먼저 점검한다. 닿는다면 멈추고 사용자에게 확인한다.

2. **다음 변경은 자동 반영하지 않는다. 멈추고 사용자 확인을 받는다.**
   - 인증 방식 또는 그 기본값
   - `.onto/settings.json` 스키마
   - 파이프라인 단계의 출력 계약/스키마
   - material issue의 정의·판정 기준

3. **기본값·인증·보안 값을 "편의상" 바꾸지 않는다.** 벤치마크·테스트 편의도 사유가 되지 않는다.
   필요하면 명시적 옵션(`--auth api_key` 등)으로만 노출한다.

4. **테스트 기대값을 바꿀 때는 "명세가 이렇게 바뀌어서"를 근거로 명시한다.**
   "코드가 지금 이렇게 동작하니까"는 사유로 인정하지 않는다.

5. **비교 실험은 한 번에 한 변수만 바꾼다.** 결정 근거 수치에는 반복 횟수·fixture 수·분산을
   반드시 병기한다. 표본 1회는 "예비 관찰"이며 결정 근거로 쓰지 않는다.

6. **mock은 검증 realization이지 제품 의미 경로가 아니다.** wiring, schema, artifact
   contract, deterministic projection, retry/failure, harness 안정성 검증에는 명시적
   selector로 사용할 수 있다. materiality 판단, causal reasoning, semantic quality,
   제품 완료 증거는 실제 semantic path로만 검증한다. mock/fixture payload는 지정
   test-fixture boundary에 두고, 운영 코드는 그 boundary를 import하지 않는다. 생성된
   artifact는 `artifact_generation_realization`과 semantic quality evidence를 provenance로
   기록한다.

7. **무인 루프는 상한(턴/시간/파일 수)에 도달하면 멈추고**, 변경 요약과 INVARIANTS 대조 결과를
   보고한 뒤 다음 지시를 기다린다.

8. **최적화가 재설계로 커지면**, 원래 성공기준("품질 손상 없음")을 새 스코프에서 다시 측정한다.

> 위 규칙들의 구조적 강제(가드)는 [docs/architecture/structural-guardrails-enforcement.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/structural-guardrails-enforcement.md)를 따른다. G1~G6 구현 완료 — 실행 명령·불변식 매핑은 [INVARIANTS.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/INVARIANTS.md) §강제 수단 구현 현황. 빠른 일괄 확인: `npm run check:invariant-drift`.

---

## 1. Position

이 레포는 `onto`의 TS-first MCP-native 제품 런타임이다. `.onto` YAML/MD 계약이
언어 중립 의미와 프로세스 계약을 소유하고, `src/core-runtime/`이 실행 의미론을
구현하며, `src/core-api/`와 `src/mcp/`가 host-facing surface를 얇게 투영한다.

- `.onto` contracts + TS core runtime + Core API facade + MCP tool surface
- product evidence는 실제 runtime/provider path에서 얻는다
- external host integration은 canonical implementation이 아니라 provider evidence다

---

## 2. Authority Hierarchy

문서가 충돌하면 아래 우선순위를 따른다. 아래 표는 [CLAUDE.md](CLAUDE.md)의 Authority 위계를 빠른 참조용으로 **미러**한 것이며 **SSOT는 CLAUDE.md**다 — 위계 자체를 바꿀 때는 CLAUDE.md를 먼저 고치고 이 표를 동기화한다. 위계 구성 노트와 "동일 순위 충돌 해소" 규칙은 CLAUDE.md가 소유한다.

| 순위 | 파일 | 폴더 |
|---|---|---|
| 1 | [core-lexicon.yaml](.onto/authority/core-lexicon.yaml) | .onto/authority/ |
| 2 | [ontology-as-code-guideline.md](.onto/principles/ontology-as-code-guideline.md) | .onto/principles/ |
| 2 | [llm-native-development-guideline.md](.onto/principles/llm-native-development-guideline.md) | .onto/principles/ |
| 2 | [non-specialist-communication-guideline.md](.onto/principles/non-specialist-communication-guideline.md) | .onto/principles/ |
| 2 | [product-locality-principle.md](.onto/principles/product-locality-principle.md) | .onto/principles/ |
| 3 | [productization-charter.md](.onto/principles/productization-charter.md) | .onto/principles/ |
| 4 | [llm-runtime-interface-principles.md](.onto/principles/llm-runtime-interface-principles.md) | .onto/principles/ |
| 4 | [ontology-as-code-naming-charter.md](.onto/principles/ontology-as-code-naming-charter.md) | .onto/principles/ |
| 5 | 기능별 계약 | .onto/processes/{feature}/*.md |
| 6 | 타입·구현 | src/core-runtime/ |
| 7 | 기능 프로세스·역할 정의 | .onto/processes/review/*.md, .onto/roles/*.md |
| 8 | 개발 기록 | development-records/ |

### 폴더 구조

폴더 구조·배치 원칙의 SSOT는
[docs/architecture/repo-layout.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/repo-layout.md)다.
top-level 역할 표, `src/core-runtime/` 내부 구조, `.onto/review/*` 세션 산출물
제외 규칙을 그 문서가 소유한다. 여기 재서술하지 않는다.

target material 관련 작업 시 추가로 읽을 문서:

1. [target-material-kind-contract.md](.onto/processes/shared/target-material-kind-contract.md)

`review` 작업 시 추가로 읽을 문서:

1. [productized-live-path.md](.onto/processes/review/productized-live-path.md)
2. [review-execution-ux-contract.md](.onto/processes/review/review-execution-ux-contract.md)
3. [lens-registry.md](.onto/processes/review/lens-registry.md)
4. [interpretation-contract.md](.onto/processes/review/interpretation-contract.md)
5. [binding-contract.md](.onto/processes/review/binding-contract.md)
6. [lens-prompt-contract.md](.onto/processes/review/lens-prompt-contract.md)
7. [synthesize-prompt-contract.md](.onto/processes/review/synthesize-prompt-contract.md)
8. [issue-stance-deliberation-contract.md](.onto/processes/review/issue-stance-deliberation-contract.md)
9. [shared-phenomenon-contract.md](.onto/processes/review/shared-phenomenon-contract.md)
10. [material-issue-contract.md](.onto/processes/review/material-issue-contract.md)
11. selected domain `problem_framing_profile.md` if `session_domain` is not `none`
12. [execution-preparation-artifacts.md](.onto/processes/review/execution-preparation-artifacts.md)
13. [review-target-profile-contract.md](.onto/processes/review/review-target-profile-contract.md)
14. [review-context-manifest-contract.md](.onto/processes/review/review-context-manifest-contract.md)
15. [prompt-execution-runner-contract.md](.onto/processes/review/prompt-execution-runner-contract.md)
16. [pre-dispatch-contracts.md](.onto/processes/review/pre-dispatch-contracts.md)
17. [pipeline-execution-ledger-contract.md](.onto/processes/shared/pipeline-execution-ledger-contract.md)
18. [record-contract.md](.onto/processes/review/record-contract.md)
19. [record-field-mapping.md](.onto/processes/review/record-field-mapping.md)
20. [review-continuation-surface.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/review-continuation-surface.md)
21. [mcp-native-tool-surface.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/mcp-native-tool-surface.md)

`reconstruct` 작업 시 추가로 읽을 문서:

1. [reconstruct-boundary-contract.md](.onto/processes/reconstruct/reconstruct-boundary-contract.md)
2. [ontology-seeding-and-maturation-design.md](.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md)
3. [operational-ontology-seed-contract.md](.onto/processes/reconstruct/operational-ontology-seed-contract.md)
4. [reconstruct-contract-registry.yaml](.onto/processes/reconstruct/reconstruct-contract-registry.yaml)
5. [reconstruct-execution-ux-contract.md](.onto/processes/reconstruct/reconstruct-execution-ux-contract.md)
6. [source-profile-contract.md](.onto/processes/reconstruct/source-profile-contract.md)
7. selected source profile under `.onto/processes/reconstruct/source-profiles/`

---

## 3. Core Principles

원칙은 아래 문서에 정의되어 있다. 재서술하지 않는다.

- **LLM/runtime capability boundary**: READ `~/.codex/guides/llm-capability-boundary.md`
- **onto-mcp LLM/runtime 적용 규칙**: READ `.onto/principles/llm-native-development-guideline.md`
- **인터페이스 seat와 boundary state**: READ `.onto/principles/llm-runtime-interface-principles.md`
- **Ontology as Code 규칙**: READ `.onto/principles/ontology-as-code-guideline.md`
- **Concept economy / naming**: READ `.onto/principles/ontology-as-code-naming-charter.md`
- **비전문가 소통**: READ `.onto/principles/non-specialist-communication-guideline.md`
- **product locality**: READ `.onto/principles/product-locality-principle.md`
- **제품 방향·결정**: READ `.onto/principles/productization-charter.md`

---

## 4. Canonical Terms

개념 SSOT: [core-lexicon.yaml](.onto/authority/core-lexicon.yaml)
이름 규칙: [ontology-as-code-naming-charter.md](.onto/principles/ontology-as-code-naming-charter.md)

자주 쓰는 개념:

- `호출 해석 (InvocationInterpretation)` — LLM 소유
- `호출 고정 (InvocationBinding)` — runtime 소유
- `대상물 형식 (TargetMaterialKind)` — code/spreadsheet/document/database/mixed/unknown 처리 축
- `목적 적합성 프레임 (PurposeAdequacyFrame)` — reconstruct 대상 목적을 만족하려면 대상물 형식별로 어떤 요소가 표현되어야 하는지 정의하는 축
- `리뷰 기록 (ReviewRecord)` — primary artifact
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)` — lens 실행 원칙

---

## 5. Review Canonical Direction

`검토 (review)`는 현재 가장 성숙한 제품화 경로다. Review 실행 truth는
`productized-live-path.md`와 하위 review contracts가 소유한다.

canonical review 구조:

1. user request
2. `호출 해석 (InvocationInterpretation)`
3. 주체자 확인 / 선택 확정
4. `호출 고정 (InvocationBinding)`
5. execution preparation artifacts
6. 선택된 lens set 독립 실행 (`full`은 9개, `core-axis`는 6개, explicit lens set 가능)
7. issue artifact construction
8. controlled lens deliberation
9. `종합 단계 (synthesize)`
10. human-readable final output
11. `리뷰 기록 (ReviewRecord)` aggregate

DO:
- 선택된 lens 전체를 context-isolated reasoning unit으로 실행하고, full review에서는 9개 lens를 실행한다
- issue-stance target에서는 surface finding을 root-cause issue cluster로 묶은 뒤 모든 lens stance를 기록하고 material conflict issue만 숙의한다
- `New Perspectives`는 `axiology`에서 제안한다
- `deliberation-resolution.yaml`이 contested lens position의 conflict-resolution authority다
- `deliberation.md`는 `deliberation-resolution.yaml`의 human-readable projection이다
- `synthesis-ledger.yaml`이 synthesize source layer이고 `synthesis.md`는 projection이다
- `synthesize`는 issue artifact truth와 `deliberation-resolution.yaml`을 보존적으로 렌더링하며 새 resolution을 만들지 않는다
- material issue의 canonical predicate는 `.onto/processes/review/material-issue-contract.md`가 소유하며 `src/core-runtime/review/review-result-classification.ts`가 구현한다. 별도 enum을 만들지 않는다. 단계 차단은 deterministic runtime gate의 구조·계약 실패만 소유한다. non-material finding은 보존하며 0으로 강제하지 않는다

---

## 6. Context-Isolated Reasoning Units

`review lens`는 **맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 로 실행되어야 한다.

핵심 속성:

1. 메인 콘텍스트와 상태를 공유하지 않는다
2. 계약된 입력만 받는다
3. 계약된 출력만 낸다
4. 독립적으로 판단한다

현재 active execution path:

- `ReviewExecutionProfile.mode=main-workers`
- worker executor `codex`: host-bound OAuth 또는 Codex worker path
- worker executor `direct_call`: API/local provider path
- `synthesize.llm`: deliberation 이후 별도 synthesize unit actor seat

`nested-workers`는 profile concept로 남아 있지만 active
product path에서는 sidecar structured output, read-only lens execution,
bounded dispatch 계약을 강제하지 못하므로 pre-dispatch에서 fail-loud한다.

기준 문서:

- [lens-registry.md](.onto/processes/review/lens-registry.md)
- [lens-prompt-contract.md](.onto/processes/review/lens-prompt-contract.md)
- [synthesize-prompt-contract.md](.onto/processes/review/synthesize-prompt-contract.md)
- [issue-stance-deliberation-contract.md](.onto/processes/review/issue-stance-deliberation-contract.md)
- [productized-live-path.md](.onto/processes/review/productized-live-path.md)

---

## 7. Artifact Truth

현재 `review`의 artifact truth:

- `interpretation.yaml`
- `binding.yaml`
- `session-metadata.yaml`
- `execution-plan.yaml`
- `execution-result.yaml`
- `review-run-manifest.yaml`
- `lens-completion-barrier.yaml`
- `failures/*.yaml` for structured pre-manifest or surface-specific failures
- `execution-preparation/actor-invocation-profiles.yaml`
- `execution-preparation/actor-consumer-bindings.yaml`
- `execution-preparation/domain-binding.yaml`
- `execution-preparation/review-target-profile.yaml`
- `execution-preparation/review-value-alignment-criteria.yaml`
- `execution-preparation/review-context-manifest.yaml`
- `execution-preparation/target-snapshot.md`
- `execution-preparation/target-snapshot-manifest.yaml`
- `execution-preparation/materialized-input.md`
- `execution-preparation/context-candidate-assembly.yaml`
- `round1/{lens}.findings.yaml` as lens machine source layer
- optional `round1/{lens}.md` when markdown projection is enabled
- `finding-ledger.yaml`
- `finding-relation-graph.yaml`
- `issue-ledger.yaml`
- `stance-responses/{lens_id}.yaml`
- `issue-stance-matrix.yaml`
- `deliberation-plan.yaml`
- `deliberation/responses/{issue_id}/{lens_id}.yaml`
- `deliberation-resolution.yaml`
- `deliberation.md` projection
- `problem-framing.yaml`
- `synthesis-work-items.yaml`
- `synthesis-ledger.yaml`
- `synthesis.md` projection
- `degradation-summary.yaml` when execution is degraded or halted
- `environment-warnings.yaml` when non-fatal worker warnings are captured
- `final-output.md`
- `review-record.yaml` ← primary artifact

`problem-framing.yaml` uses a common spine owned by the review contract and optional domain axes owned by `.onto/domains/{domain}/problem_framing_profile.md`.

관련 문서:

- [execution-preparation-artifacts.md](.onto/processes/review/execution-preparation-artifacts.md)
- [record-contract.md](.onto/processes/review/record-contract.md)
- [record-field-mapping.md](.onto/processes/review/record-field-mapping.md)

---

## 8. TypeScript Core

core 제품화 계층은 TypeScript다.

현재 host-facing review entrypoint는 MCP tool call이다.

광고되는 canonical tool surface는 12종(consolidated)이다. SSOT는 [src/mcp/tool-schemas.ts](https://github.com/kangminlee-maker/onto-mcp/blob/main/src/mcp/tool-schemas.ts) `OntoToolNames`이며, 정합은 `tool-surface.test.ts`가 핀한다.

review tools:

- `onto_review` — review 실행
- `onto_prepare_review` — 실행 전 session과 prompt packet 준비
- `onto_review_continue` — 기존 session artifact에서 eligible frontier를 계속 실행
- `onto_review_round` — host orchestration(B): 지금 실행 가능한 unit과 packet 반환 (onto는 실행하지 않음)
- `onto_review_advance` — host orchestration(B): host가 실행한 unit 보고 → seat 검증·기록 후 다음 round 또는 record 조립
- `onto_review_cancel` — 실행 중 review의 cooperative cancellation 요청
- `onto_review_read` — review session 단일 조회 진입점: 실행 중 liveness + 완료 후 bounded 결과 (`projectionLevel` `compact`/`standard`/`full`)

reconstruct·list tools:

- `onto_observe_source` — reconstruct source observation materialize
- `onto_validate_reconstruct_directive` — LLM-authored reconstruct directive 검증
- `onto_reconstruct` — material-aware reconstruct 실행
- `onto_reconstruct_read` — reconstruct session 단일 조회 진입점: stage progress·liveness·counts, `projectionLevel=full`이면 record·run manifest·final output
- `onto_list` — 레지스트리 조회 (`kind`: `lenses` / `domains` / `source_profiles`)

> deprecated alias (7종, tools/list 미광고·핸들러 보존, major bump 시에만 제거):
> `onto_review_status`·`onto_review_result` → `onto_review_read`;
> `onto_list_lenses`·`onto_list_domains`·`onto_list_source_profiles` → `onto_list`;
> `onto_reconstruct_status`·`onto_reconstruct_result` → `onto_reconstruct_read`.

`onto mcp`는 stdio MCP 서버 시작 명령이며 단발성 review 실행 명령이 아니다.
`src/core-runtime/cli/review-invoke.ts`는 내부 argv adapter와 live E2E 검증 entry로만 취급한다.

관련 설정: [package.json](package.json), [tsconfig.json](https://github.com/kangminlee-maker/onto-mcp/blob/main/tsconfig.json)

---

## 9. MCP-Native Boundary

장기 interface는 host별 slash command가 아니라 MCP tool call이다.

```text
.onto YAML/MD contracts
        -> TS core runtime
        -> MCP tool surface
        -> bounded worker/direct-call execution
```

경계:

- `.onto/`와 `src/core-runtime/`이 `onto` 의미론을 소유한다.
- `src/core-api/`는 기존 runtime을 library처럼 부르는 facade다.
- `src/mcp/`는 tool schema와 server surface만 소유한다.
- Provider execution은 현재 `src/core-runtime/cli`와 `src/core-runtime/llm`의 bounded adapters가 소유한다.
- External host integration은 실제 runtime/provider 경로로 검증한다.

---

## 9.1 Actual Environment And Mock Realization Testing

onto의 테스트는 evidence class를 분리한다.

- LLM/provider 호출이 제품 경로에 포함되면 제품 behavior, materiality judgment,
  causal reasoning, semantic quality는 실제 semantic path에서 검증한다.
- mock, fake, stub, fixture, prepare-only dispatch는 wiring, schema, artifact
  contract, deterministic projection, retry/failure, harness 안정성 검증에 사용할 수
  있다.
- mock-backed check는 verification support evidence로 보고하고, product completion,
  E2E completion, semantic quality evidence와 분리한다.
- fixture는 입력 데이터와 expected invariant를 제공할 수 있지만, semantic 판단이나
  provider integration 완료 증거를 대체하지 않는다.
- review artifact는 `review.execution.artifact_generation_realization`으로 생성 경로를
  명시하고, mock/fixture 계열의 semantic quality는 `not_applicable`로 기록한다.
- 실제 호출이 불가능하면 product-path evidence는 blocked/degraded로 기록한다.

기준 문서:

- [DD-010](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/decisions/DD-010-onto-mcp-native-tool-surface.md)
- [repo-layout.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/repo-layout.md)
- [mcp-native-tool-surface.md](https://github.com/kangminlee-maker/onto-mcp/blob/main/docs/architecture/mcp-native-tool-surface.md)

---

## 10. Current Priority

1. `review`의 productized live path를 artifact-backed canonical truth로 유지한다.
2. `selected lens set → issue artifacts → controlled deliberation → synthesize → final-output → ReviewRecord` 경로를 보존한다.
3. `ReviewRecord`를 primary artifact로 유지하고, markdown은 projection/rendering layer로 취급한다.
4. MCP tool surface는 `src/mcp/`에서 얇게 유지하고, 의미론은 `.onto/` contracts와 `src/core-runtime/`에 둔다.
5. `onto_review_status`, `onto_review_continue`, `onto_review_cancel`은 run-control, continuation, cancellation의 bounded host-facing surface다.
6. `reconstruct`는 active bounded MCP/Core API surface이며, runtime은 구조 관찰·검증·artifact persistence를 소유하고 LLM-authored ontology meaning은 submit/validation 경계 안에서만 받는다.
7. provider contract로 Codex / Claude / local / future host 실행 차이를 흡수하되, product completion과 semantic quality evidence는 실제 runtime/provider path에서만 주장한다.

새 작업은 항상 아래 질문으로 시작한다.

1. 어떤 ontology concept를 바꾸는가
2. canonical seat가 어디인가
3. 대상물 형식(`target_material_kind`)이 무엇이며 처리 방식이 달라지는가
4. `LLM` 소유인가, runtime 소유인가
5. source layer와 projection layer가 무엇인가
6. 기존 contract, validator, submit tool, MCP/Core API surface 중 무엇을 재사용해야 하는가
7. verification evidence가 product-path/live evidence인지 mock/fixture support evidence인지 무엇인가
8. 변경이 INVARIANTS 보호 항목에 닿는가
