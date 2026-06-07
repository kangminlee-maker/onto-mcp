# LLM Runtime Interface Principles

> 상태: Active
> 목적: onto-mcp에서 `LLM`과 runtime 사이의 interface seat, packet, boundary state를 고정한다.
> 상위 기준:
> - `/Users/kangmin/.codex/guides/llm-capability-boundary.md`
> 관련 기준:
> - `.onto/principles/llm-native-development-guideline.md`
> - `.onto/principles/productization-charter.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 문서는 `LLM`/runtime 소유 분리의 일반 원칙을 다시 정의하지 않는다.
그 기준은 `/Users/kangmin/.codex/guides/llm-capability-boundary.md`가 소유한다.

이 문서는 onto-mcp에서 그 원칙을 실행할 때 필요한 interface 구조를 소유한다.

한 문장 기준:

- runtime은 interface seat, accepted output channel, allowed refs, write boundary를 고정한다.
- `LLM`은 그 경계 안에서 의미 판단과 bounded semantic payload 제출을 수행한다.

---

## 2. Interface Unit

하나의 `LLM` interface call은 아래 네 가지를 가져야 한다.

1. declared handoff inputs
2. declared boundary state
3. accepted output channel
4. single-purpose output seat

### 2.1 DeclaredHandoffInputs

runtime이 반드시 제공하는 입력이다.

예:

- role/task instruction
- primary target
- required context refs
- output seat
- allowed refs
- explicit constraints
- exploration allowance boundary

### 2.2 SelfDirectedExplorationInputs

`LLM`이 의미 판단을 위해 추가로 탐색할 수 있는 입력이다.

예:

- repo 내부 파일 탐색
- packet에 있는 ref 재검토
- 근거 충분성 확인
- 허용된 경우의 외부 source 확인

규칙:

1. runtime은 declared handoff input을 고정한다.
2. `LLM`은 허용된 범위 안에서 self-directed exploration을 수행한다.
3. exploration 결과가 판단에 쓰이면 provenance를 남긴다.
4. packet이나 contract가 허용하지 않은 hidden expansion은 금지한다.

---

## 3. Boundary Seats

declared boundary는 네 seat로 나눠 표현한다.

| seat | 소유 | 의미 |
|---|---|---|
| `BoundaryPolicy` | contract/runtime | 허용, 금지, 요구되는 행위를 선언한다. |
| `BoundaryPresentation` | runtime | 정책과 입력을 `LLM`에게 어떤 방식으로 제시했는지 기록한다. |
| `BoundaryEnforcementProfile` | runtime/host | 실제 실행 환경에서 무엇이 강제되는지 기록한다. |
| `EffectiveBoundaryState` | runtime | 선언과 실행 환경을 합친 최종 적용 상태다. |

`EffectiveBoundaryState`에서는 가장 강한 deny가 우선한다.
예를 들어 prompt가 web research를 허용해도 실행 환경이 network를 차단하면
effective state는 web denied다.

---

## 4. Boundary Elements

interface boundary는 최소 아래 요소를 가져야 한다.

| element | 질문 |
|---|---|
| instruction boundary | 어떤 role/task instruction이 authoritative한가 |
| target boundary | 이번 reasoning의 primary object는 무엇인가 |
| required context boundary | 반드시 고려해야 하는 supporting artifact는 무엇인가 |
| output boundary | 결과가 어느 artifact seat로 나와야 하는가 |
| exploration boundary | 추가 탐색은 어디까지 가능한가 |
| write boundary | 어디에 쓸 수 있고 어디에는 쓰면 안 되는가 |
| tool/research boundary | shell, file read, web, provider 호출은 어디까지 가능한가 |
| evidence/provenance boundary | 추가 증거를 어떤 형식으로 남겨야 하는가 |
| degraded/failure boundary | 경계 때문에 판단이 불가능할 때 어떻게 끝내야 하는가 |

degraded/failure 상태는 억지 결론을 막기 위한 product behavior다.
예: `insufficient_access`, `insufficient_evidence_within_boundary`, `fail-close`.

---

## 5. Presentation And Control

### 5.1 Presentation modes

declared boundary는 아래 방식으로 제시할 수 있다.

| mode | 사용처 |
|---|---|
| embed | primary target 본문, 짧은 role instruction |
| ref | supporting artifact, session metadata, large context |
| seat map | output path, artifact role, source/projection 관계 |
| allow/deny rule | tool, write, exploration 제한 |
| bounded policy statement | failure posture, provenance obligation |

### 5.2 Embed vs ref

embed한다:

1. 이번 reasoning의 핵심 대상 본문
2. 짧고 필수적인 role/task instruction
3. lookup 비용보다 즉시 가시성이 중요한 작은 primary input

ref로 둔다:

1. supporting context
2. binding/interpretation/session metadata
3. context candidate assembly
4. upstream machine artifacts
5. 다른 lens or actor output seat

embed하지 않는다:

1. target과 직접 무관한 대형 문서 묶음
2. 이미 artifact seat가 있는 내용을 거대 payload로 중복한 것
3. 링크를 재귀적으로 따라가며 커진 context bundle

### 5.3 Control modes

boundary control은 아래를 포함해야 한다.

1. allowlist
2. denylist
3. scope cap
4. write restriction
5. provenance obligation
6. fail-close gate

좋은 interface는 더 많은 context가 아니라 더 정확한 context와 더 선명한 output seat를 제공한다.

---

## 6. Accepted Output Channel

structured output이 필요한 단계는 submit tool 또는 동등한 constrained channel을 사용한다.

규칙:

1. canonical machine artifact는 `LLM` free prose에서 사후 파싱하지 않는다.
2. `LLM`은 bounded semantic payload만 제출한다.
3. runtime은 id, path, envelope, schema version, serialization을 소유한다.
4. runtime-owned field가 제출되면 실패한다.
5. unknown field는 실패한다.
6. human-readable output은 가능한 한 machine artifact의 deterministic projection으로 만든다.

tool-capable route가 이 contract를 강제하지 못하면 text-only fallback으로 계속하지 말고
fail-loud 또는 degraded 상태를 기록한다.

---

## 7. Review Interface Template

현재 `review` interface는 artifact-first다.

### 7.1 runtime -> lens

Declared inputs:

1. lens role/task instruction
2. `execution-preparation/materialized-input.md`
3. `execution-preparation/review-context-manifest.yaml`
4. allowed source/evidence refs
5. actor invocation profile
6. output seat: `round1/{lens}.findings.yaml`

Accepted output channel:

- lens findings submit tool or equivalent structured channel

Runtime-owned:

- `session_id`
- `lens_id`
- candidate/finding ids
- artifact path
- source/human output refs that can be derived
- YAML persistence

`LLM`-owned:

- claim
- rationale
- evidence use within allowed refs
- semantic materiality/causal judgment fields required by the contract

### 7.2 runtime -> issue and stance artifacts

Runtime deterministically projects:

- `finding-ledger.yaml`
- `finding-relation-graph.yaml`
- `issue-ledger.yaml`
- `issue-stance-matrix.yaml`

`LLM` involvement is bounded to semantic payloads that cannot be derived without judgment.
Issue and stance artifact contracts decide the exact fields; this document only fixes the interface rule.

### 7.3 runtime -> deliberation

Declared inputs:

1. contested issue set
2. participating lens stance refs
3. bounded issue projection
4. output seats under `deliberation/responses/{issue_id}/{lens_id}.yaml`

Runtime-owned:

- `deliberation-plan.yaml`
- allowed issue/lens pairs
- response artifact seats
- `deliberation-resolution.yaml` persistence

`deliberation.md` is a human-readable projection of `deliberation-resolution.yaml`.

### 7.4 runtime -> synthesize

Declared inputs:

1. issue artifact truth
2. `deliberation-resolution.yaml`
3. synthesis work items
4. output seat: `synthesis-ledger.yaml`

Rules:

1. synthesize does not create new conflict resolution.
2. synthesize preserves issue artifact truth and deliberation resolution.
3. `synthesis.md` is a projection.
4. `final-output.md` and `review-record.yaml` are assembled by runtime from canonical artifacts.

---

## 8. Reconstruct Interface Template

`reconstruct` uses the same boundary rule.

Runtime-owned:

1. source profile selection and validation
2. target material kind handling
3. source observation artifact seats
4. directive validation
5. artifact persistence and provenance
6. MCP/Core API status/result surfaces

`LLM`-owned:

1. source-derived purpose interpretation within the allowed source profile
2. ontology meaning proposal
3. reconstruction directive semantic payload
4. rationale for choices that cannot be deterministically derived

The directive must be accepted through a constrained validation path before it becomes runtime artifact truth.

---

## 9. Design Checklist

Before adding or revising an interface call, answer:

1. What is the single-purpose output seat?
2. What is embedded, and what is only a ref?
3. Which refs are allowed, and how are they computed?
4. What is the accepted output channel?
5. Which fields are runtime-owned and rejected from `LLM` submission?
6. Which fields are open semantic judgment?
7. What happens when access or evidence is insufficient?
8. Which human-readable outputs are projections?
9. Which tests catch schema, validator, submit tool, and prompt contract drift?
