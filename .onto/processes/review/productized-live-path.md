# Review Productized Live Path

> 상태: Active
> 목적: `검토 (review)`의 `제품화된 실시간 경로 (productized live path)`를 canonical 실행 경로로 고정한다.
> 기준 문서:
> - `.onto/processes/review/interpretation-contract.md`
> - `.onto/processes/review/binding-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/record-field-mapping.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`
> - `.onto/processes/review/review-context-manifest-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/processes/review/review-execution-ux-contract.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 문서는 `검토 (review)`의 현재 canonical live execution truth다.

즉 실제 productization target은 이 문서의 순서를 따른다.

live path authority는 이 문서와 하위 review contracts가 가진다.

---

## 2. Canonical Live Path

```text
user request
-> 호출 해석 (InvocationInterpretation)
-> 주체자 확인 / 선택 확정
-> 호출 고정 (InvocationBinding)
-> execution preparation artifacts
-> 9개 lens 독립 실행
-> 통제된 lens 숙의 (controlled lens deliberation)
-> 종합 단계 (synthesize)
-> human-readable final output
-> 리뷰 기록 (ReviewRecord)
```

---

## 3. Step-by-Step

### 3.1 주체자 요청 수집

host가 아래를 받는다.

- 주체자 자연어 요청
- explicit target token
- explicit domain token
- explicit execution profile token
- 현재 repo / selected target context

### 3.2 호출 해석 (InvocationInterpretation)

`LLM`이 아래를 해석한다.

- entrypoint가 `review`인지
- `검토 대상 범위 (review_target_scope)` 후보가 무엇인지
- intent가 무엇인지
- domain recommendation이 필요한지
- `lens 선택 계획 (LensSelectionPlan)`이 무엇인지
- `core-axis/full` recommendation이 필요한지

prompt-backed path에서도 이 단계의 결과는 최종적으로
`interpretation.yaml`로 materialize되어야 한다.

### 3.3 주체자 확인 / 선택 확정

필요한 경우 아래를 주체자와 확정한다.

- `도메인 최종 선택 (DomainFinalSelection)`
- `core-axis/full`
- explicit override

이 단계는 semantic recommendation과 deterministic binding의 중간에서
주체자가 최종 authority를 행사하는 구간이다.

현재 host-facing `onto_review`의 domain 고정 규칙:

- explicit `--domain {name}` / `--no-domain` 이 있으면 그대로 사용
- configured domain이 하나면 바로 사용
- configured domain이 여러 개면 interactive selection을 수행
- interactive selection이 불가능한 non-interactive 환경이면 fail-fast 하고 explicit domain selection을 요구
- explicit token과 configured domain이 모두 없으면 review target path/content/intent를 기반으로 available domain 문서 중 하나를 자동 선택하고, 선택 domain과 이유를 start preview, `binding_notes`, opening brief input, final output에 기록한다
- target 기반 자동 선택에 충분한 signal이 없거나 available domain seat가 없으면 `session_domain=none`으로 진행하며 그 이유를 같은 표면에 기록한다
- `--domain` 과 `--no-domain` 동시 지정은 parser layer 에서 fail-fast

### 3.4 호출 고정 (InvocationBinding)

runtime/host가 아래를 고정한다.

- resolved target scope
- final domain value
- resolved execution realization
- resolved host runtime
- resolved artifact generation realization
- semantic quality evidence status
- resolved review mode
- resolved lens set
- session root
- artifact paths

이 단계가 끝나면 prompt-backed path에서도
적어도 `session_root`와 각 artifact path는 확정되어 있어야 한다.

현재 bounded runtime step은 TypeScript Core API로 구현한다.
Host-facing combined entrypoint는 `onto_review`이며, 준비만 필요한 경우
`onto_prepare_review`를 사용한다.

Core API review runner는 interpretation, binding, execution preparation,
prompt packet materialization을 순서대로 수행하고 같은 session artifact truth
아래에 기록한다.

### 3.5 Execution Preparation Artifacts

binding 다음에는 최소 아래 artifact가 materialize되어야 한다.

1. `session metadata`
2. `target snapshot`
3. `review target materialized input`
4. `context candidate assembly`
5. `execution plan`
6. `actor invocation profiles`
7. `actor consumer bindings`
8. `domain binding`
9. `review value-alignment criteria`
10. `review context manifest`
11. `prompt packets`
12. `execution result`

이 단계는 later `ReviewRecord`와 runtime replacement의 bridge다.

세부 contract는 `.onto/processes/review/execution-preparation-artifacts.md`를 따른다.
dispatch 전에 닫혀야 하는 gate와 phase boundary는
`.onto/processes/review/pre-dispatch-contracts.md`를 따른다.

prompt-backed path에서도 실제 파일이 만들어져야 한다.
즉 이 단계는 단순 개념 설명이 아니라 artifact materialization step이다.

`execution plan`은 아래를 deterministic하게 고정한다.

- lens별 output seat
- issue artifact output seats
- controlled deliberation result seat: `deliberation-resolution.yaml`
- controlled deliberation projection seat: `deliberation.md`
- synthesize aggregate truth seat: `synthesis-ledger.yaml`
- synthesize projection seat: `synthesis.md`
- synthesize work item root: `synthesis-work-items.yaml` and `prompt-packets/synthesis/{issue_id}.prompt.md`
- lens별 deliberation response seat
- `error-log.md` seat
- `final-output.md` seat
- `review-record.yaml` seat
- `execution-result.yaml` seat
- boundary seat
  - `BoundaryPolicy`
  - `BoundaryPresentation`
  - `BoundaryEnforcementProfile`
  - `EffectiveBoundaryState`

`prompt packets`는 아래를 deterministic하게 고정한다.

- lens별 prompt handoff text
- `synthesize` prompt handoff text
- 각 packet이 읽어야 할 artifact path
- 각 packet이 써야 할 output path
- packet은 가급적 lightweight handoff여야 하며, authoritative artifact의 전체 본문을 과도하게 embedded하지 않는다
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`는 packet이 가리키는 artifact file을 직접 읽는다
- synthesize runtime packet은 participating lens output의 seat/ref를 넘기되, 가능하면 본문 전체를 다시 중복 embedded하지 않는다
- packet은 boundary policy와 effective boundary state를 함께 제시해, 허용된 탐색 공간과 강제 강도를 분명히 해야 한다

### 3.6 9개 lens 독립 실행

각 lens는 **맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 로 실행된다.

가능하면 host는 자유 텍스트 대신 TS core가 materialize한 prompt packet을 사용해야 한다.
기본 bounded dispatch step은 Core API review runner가 내부 runtime step으로 수행한다.

이 step은 실행 종료 시 `execution-result.yaml`을 반드시 materialize해야 한다.

canonical requirement:

1. 각 lens는 자기 전용 맥락을 가진다
2. Round 1에서는 다른 lens 결과를 보지 않는다
3. 메인 `LLM` 콘텍스트는 per-lens detailed reasoning을 직접 모두 담지 않는다
4. 각 실행 단위는 packet에 제시된 `BoundaryPolicy`와 `EffectiveBoundaryState`를 hard constraint로 읽는다
5. 경계 안에서 충분한 근거를 얻지 못하면 broad search로 타협하지 않고 degraded/uncertain output을 남긴다
6. lens dispatch는 병렬 실행이 기본이다
7. runtime은 선택된 lens 전체를 dispatch한다. host가 자체 제한으로 이를 수행할 수 없으면 fail-loud하게 중단한다

현재 repo-local TS bounded path에서 실행 가능한 `ReviewExecutionProfile` mode는 아래다.

- `main-workers`: main이 teamlead 역할을 수행하고 worker가 lens를 실행한다.
- `synthesize.llm`: deliberation 이후 별도 synthesize unit에 적용된다. synthesize는 모든 lens output, issue artifacts, deliberation, problem framing을 통합하므로 높은 effort가 기본적으로 적합하다.

`nested-workers`는 concept/profile shape로 남아 있지만 현재 active live path에서는
pre-dispatch에서 fail-loud한다. 기존 nested bridge가 sidecar structured output,
read-only lens execution, settings-owned bounded dispatch를 강제하지 못하기 때문이다.
이 mode는 inner lens 실행이 동일한 structured runner 계약을 따를 때만 다시 실행
가능한 경로가 될 수 있다.

worker executor는 profile resolution에서 아래 중 하나로 고정된다.

- `codex`: host-bound OAuth 또는 Codex worker path.
- `direct_call`: `api_key` 또는 `local` provider path.

중요한 점은 host-specific naming이 아니라:

- `lens별 독립성`
- `메인 콘텍스트 보존`
- `독립 의미 검증`

이 유지되는 것이다.

packet materialization만 단독으로 디버깅해야 할 때도 host-facing 표면은
`onto_prepare_review`다. Repo-local prepare/schema/route check와 mock-backed
harness는 debug 및 contract verification 목적으로만 취급한다. 실제 review 완료
증거와 semantic quality evidence는 LLM/provider를 호출하는 live E2E run에서만
인정한다.

현재 TS bounded runner의 lens 병렬성은 선택된 lens 수와 같다. full review는
9개 lens를 모두 병렬 dispatch하고, core-axis 또는 명시적 lens 선택은 해당 lens
전체를 병렬 dispatch한다.

Round 1 이후에는 `lens-completion-barrier.yaml`이 작성되어야 한다.
canonical review path는 선택된 lens 수가 최소 1개이고 선택된 lens 전원이 완료될 때만
issue artifacts, controlled deliberation, synthesize로 진행한다.

### 3.7 통제된 lens 숙의 (Controlled Lens Deliberation)

Round 1 lens 결과가 나온 뒤, review는 반드시 통제된 lens 숙의 단계를 거친다.

이 단계의 목적은 `synthesize`가 혼자 충돌을 판정하는 것이 아니라,
서로 다른 관점의 lens가 teamlead가 제한한 context 안에서 자기 입장을 재평가하고,
teamlead deliberation result가 합의/조건부 합의/지속 이견을 명시하게 하는 것이다.

canonical requirement:

1. 각 lens deliberation response는 fresh bounded context에서 실행된다.
2. 입력은 해당 lens의 Round 1 결과와 다른 participating lens 결과로 제한된다.
3. lens는 최종 종합을 수행하지 않고 자기 관점의 유지/수정/양보/지속 이견만 기록한다.
4. teamlead-controlled deliberation result는 모든 lens response를 읽고 `deliberation-resolution.yaml`을 작성한다.
5. `deliberation-resolution.yaml`은 synthesize보다 앞선 authoritative conflict-resolution artifact다.
6. `synthesize`는 이 결과를 소비하며, 독자적으로 새 resolution을 만들지 않는다.

MCP/TS runtime에서는 이 의미론을 provider 독립적인 controlled deliberation packet으로 실현한다.
중요한 것은 기능명이 아니라 `분리된 관점 + 제한 context + teamlead 통제 + 기록 가능한 resolution`이다.

#### 3.7.1 Issue-Stance Deliberation Target

다음 runtime target은 `.onto/processes/review/issue-stance-deliberation-contract.md`를 따른다.

목표 구조:

```text
Round 1 lens outputs
-> finding-ledger.yaml
-> finding-relation-graph.yaml
-> issue-ledger.yaml
-> issue-stance-matrix.yaml
-> deliberation-plan.yaml
-> issue-scoped controlled deliberation
-> deliberation-resolution.yaml
-> deliberation.md projection
-> common spine + domain problem framing profile
-> problem-framing.yaml
-> synthesize
```

핵심 invariant:

1. 모든 surface finding은 finding ledger에 등록된다.
2. finding 간 관계를 검토해 root-cause issue cluster를 만든다.
3. 모든 participating lens는 모든 root-cause issue에 대해 stance를 남긴다.
4. material conflict가 있는 issue만 deliberation에 진입한다.
5. deliberation은 서로 다른 입장의 이유와 root-cause 해석 차이, stance 유지/변경 여부를 확인한다.
6. issue별 결론은 `no-deliberation-needed`, `resolved`, `narrowed`, `unresolved-with-reason` 중 하나다.
7. review closure는 `problem-framing.yaml`에서 공통 spine과 선택된 domain profile 기반 분류를 기록한다.
8. domain별 분류 축은 `.onto/domains/{domain}/problem_framing_profile.md`가 소유한다.
9. `synthesize`는 issue status와 common spine/domain axes classification을 변경하지 않고 보존적으로 렌더링한다.

### 3.8 종합 단계 (synthesize)

`synthesize`는 issue-level artifact truth에서 만들어진
`synthesis-work-items.yaml`을 읽고, material issue별 bounded semantic explanation을
생성한다. runtime은 issue response YAML을 검증한 뒤 `synthesis-ledger.yaml`을
canonical truth로 assemble하고, `synthesis.md` projection을 생성한다.

`synthesize`가 보존적으로 렌더링하는 항목:

- material issue conclusion and explanation
- controlled deliberation outcome
- root cause and causal path explanation
- action explanation
- boundary notes
- non-material finding surface summary
- final review result

중요:

- `synthesize`는 새 독립 관점을 만들지 않는다
- `synthesize`는 deliberation actor가 아니다
- 충돌 resolution의 authority는 `deliberation-resolution.yaml`이다
- `deliberation.md`는 human-readable projection이다
- `New Perspectives`는 `axiology`가 제시하는 영역이다
- synthesize는 `axiology`가 제시한 추가 관점이 있으면 그것을 보존/배치할 수는 있지만, 스스로 invent하면 안 된다

### 3.9 리뷰 기록 (ReviewRecord)

`review`의 primary output은 `리뷰 기록 (ReviewRecord)`다.

최종 human-readable output은 먼저 render될 수 있지만,
later `learn/govern`가 읽을 canonical artifact는 `ReviewRecord`여야 한다.

즉:

- lens markdown
- lens sidecar/projection
- `deliberation-resolution.yaml` and `deliberation.md` projection
- `synthesis-ledger.yaml` and `synthesis.md` projection

은 최종적으로 `ReviewRecord`의 source/human-readable layer로 내려간다.

세부 contract는 `.onto/processes/review/record-contract.md`를 따른다.

prompt-backed path에서는 `final-output.md`를 먼저 render한 뒤,
team lead 또는 bounded TS step이 마지막에 `review-record.yaml`을 actual aggregate로 assemble해야 한다.

Combined completion 포함 host-facing entrypoint는 `onto_review`다.
Completion은 Core API review runner가 session artifact truth에 맞춰 내부적으로
수행한다.

### 3.10 Human-Readable Final Output

주체자에게 보여주는 최종 review output은
`ReviewRecord`와 synthesis result를 기반으로 render된 결과다.

즉 사람이 읽는 결과와
later system handoff artifact를 분리한다.

중요:

- degraded case가 발생하면 prompt execution runner는 `degradation-summary.yaml`을 구조화 source로 기록하고 `error-log.md`에는 실행 로그를 남긴다
- completion step은 `final-output.md`와 `review-record.yaml`을 모두 필수 산출물로 취급한다
- 필수 artifact가 없으면 해당 단계는 즉시 실패한다

### 3.11 Execution UX Presentation Target

Review 진행 UX의 design target은 `.onto/processes/review/review-execution-ux-contract.md`를 따른다.

이 UX contract는 final output만이 아니라 setup, pre-dispatch readiness, lens
execution, issue construction, controlled deliberation, synthesize, halted partial
result 전 구간에서 주체자가 판단 가능한 상태를 받도록 하는 presentation target이다.

현재 active runtime truth는 기존 artifacts와 CLI/MCP 결과가 소유한다.
`onto_review_status`는 artifact-backed `llmPresentation.progress`를 반환하며,
그 안에는 polling liveness state, latest review signal, progress stepper가
포함된다. halted partial일 때는 `llmPresentation.halt`도 반환한다. completed result는
`llmPresentation.finalResult`, `final-output.md`, `review-record.yaml`에서 같은
result classification projection을 노출한다.
Progress step id/label/total truth는 runtime review progress contract와
`review-run-manifest.yaml.execution_contract`가 소유한다.

Severity/result classification은 runtime active projection이다. Projection source는
`finding-ledger.yaml`, `issue-ledger.yaml`, `problem-framing.yaml`,
`execution-result.yaml`이다.

Target rules:

- `severity`가 finding의 materiality candidate boundary를 포함한다
- `blocker`, `high`, `medium`은 problem-framing admission을 통과해야 material issue로 파생된다
- `low`, `info`는 non-material finding 또는 evidence observation이다
- 모든 material issue는 affected purpose, failure condition, impact, evidence refs를 가져야 한다
- 시작 시점에는 환경, 방식, non-secret 모델/profile, 도메인, target, review direction을 짧게 제시해야 한다
- 긴 실행 중에는 stepwise/progress-bar 형태로 진행 상태와 새로 수집된 review 정보를 함께 제시해야 하며, 새 정보가 없더라도 bounded liveness update를 제공해야 한다
- issue-stage artifact가 생성되면 progress update는 finding/issue count, highest severity, material issue count 같은 새 review signal을 함께 제시해야 한다
- 중간 finding-like update는 `lens_local`, `issue_candidate`, `deliberation_pending`, `deliberated`, `finalized` 같은 interim signal status를 표시해야 한다
- halted partial result는 halt identity와 produced/absent artifact truth를 먼저 보여줘야 한다
- CLI가 보이지 않는 MCP/host 환경에서는 `onto_review_status` polling을 기본 경로로 host LLM presentation input을 갱신해야 한다
- 별도 HTML/UI 구현은 요구하지 않는다. CLI, MCP, `final-output.md`, `review-record.yaml`은 같은 bounded facts를 제시해야 한다

---

## 4. Immediate Follow-up

이 문서의 productized live path는 현재 MCP `onto_review`에서 Core API
review runner를 통해 prepare, prompt execution, completion을 같은 session
artifact truth 아래에서 수행한다.

남은 follow-up은 live path 자체의 구조 변경이 아니라 운영/확장 품질이다.

1. provider credentials/endpoints가 의도적으로 준비된 환경에서 provider별 live conformance를 수행한다.
2. `.onto/processes/shared/pipeline-execution-ledger-contract.md`의 shared ledger를 `review`에 먼저 투영하고, `docs/architecture/review-continuation-surface.md`의 설계에 따라 `onto_review_status` continuation plan과 `onto_review_continue`를 구현한다.
