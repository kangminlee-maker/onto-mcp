# LLM Runtime Interface Principles

> 상태: Active
> 목적: `LLM`과 runtime 사이의 interface를 어떤 원칙과 기준으로 구성할지 고정한다.
> 기준 문서:
> - `.onto/principles/productization-charter.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 문서는 `LLM`과 runtime 사이의 interface를
단순한 prompt formatting 문제가 아니라
`ontology as code`의 핵심 경계 문제로 본다.

즉 interface는 아래를 동시에 만족해야 한다.

1. `LLM`이 실제로 잘 작동해야 한다
2. runtime은 semantic drift를 임의로 보정하지 못해야 한다
3. prompt path와 implementation path가 같은 artifact truth를 봐야 한다

한 문장으로 말하면:

- runtime은 seat와 gate를 고정하고
- `LLM`은 그 seat 안에서 의미 판단을 수행한다

---

## 2. Core Principle

runtime은 interface의 `meaning`이 아니라 `shape`를 고정한다.
`LLM`은 그 shape 안에서 의미 판단을 수행한다.

LLM/runtime 소유 분리의 상세 원칙은 `.onto/principles/llm-native-development-guideline.md`가 canonical이다.

---

## 3. Interface Construction Principles

### 3.1 declared boundary는 세 가지를 함께 정한다

`declared boundary`는 단순히
“무엇을 넘길 것인가”만 정하는 게 아니다.

반드시 아래 세 가지를 함께 정해야 한다.

1. 어떤 요소를 선언하는가
2. 어떤 방식으로 제시하는가
3. 어떤 방식으로 통제하는가

즉 interface boundary는
`declared inputs + presentation mode + control policy`
의 조합이다.

하지만 실제 제품화에서는 이것을 더 정확히 아래 네 seat로 분리해 다루는 것이 좋다.

1. `경계 정책 (BoundaryPolicy)`
2. `경계 제시 (BoundaryPresentation)`
3. `경계 강제 프로필 (BoundaryEnforcementProfile)`
4. `실효 경계 상태 (EffectiveBoundaryState)`

### 3.2 declared input은 두 층으로 나뉜다

`LLM`이 읽는 입력은 아래 두 층으로 나뉜다.

#### 선언형 handoff 입력 (DeclaredHandoffInputs)

주체: runtime

내용:

1. role / task instruction
2. primary target
3. required context
4. output seat
5. explicit constraints
6. exploration allowance boundary

성격:

1. predeclared
2. artifact-first
3. deterministic
4. contract로 고정 가능

#### 자율 탐색 입력 (SelfDirectedExplorationInputs)

주체: `LLM`

내용:

1. 추가 파일 탐색
2. repo 내부 탐색
3. 필요 시 웹 리서치
4. 추가 evidence 확보
5. 근거 재검증

성격:

1. self-directed
2. semantic
3. non-deterministic
4. 문제 해결 과정의 일부

중요한 규칙:

- runtime은 첫 번째 층을 제공한다
- `LLM`은 두 번째 층을 스스로 획득한다
- runtime은 두 번째 층의 대상 선택을 대신하면 안 된다

즉 runtime은
`무엇을 반드시 줘야 하는가`
를 고정하고,
`LLM`은
`무엇을 더 찾아야 하는가`
를 판단한다.

### 3.3 artifact-first interface

`LLM`/runtime interface는 자유 텍스트 conversation이 아니라
artifact seat를 중심으로 구성한다.

즉 interface는 아래 조합으로 정의한다.

1. input artifact refs
2. optional embedded primary content
3. output artifact seat
4. bounded execution directives

예:

- input:
  - `materialized-input.md`
  - `.onto/roles/logic.md`
  - `interpretation.yaml`
  - `binding.yaml`
- output:
  - `round1/logic.findings.yaml`

### 3.4 declared boundary elements

`declared boundary`는 최소한 아래 요소들에 대해 seat와 policy를 가져야 한다.

1. instruction boundary
2. target boundary
3. required context boundary
4. output boundary
5. exploration boundary
6. write boundary
7. tool/research boundary
8. evidence/provenance boundary
9. degraded/failure boundary

각 항목의 뜻은 아래와 같다.

#### instruction boundary

어떤 역할 정의와 task 지시가 authoritative instruction인지 정한다.

예:

- `.onto/roles/logic.md`
- `prompt-packets/logic.prompt.md`

#### target boundary

이번 reasoning의 primary object가 무엇인지 정한다.

예:

- `materialized-input.md`
- `review_target_scope`

#### required context boundary

반드시 같이 고려해야 하는 supporting artifact를 정한다.

예:

- `binding.yaml`
- `interpretation.yaml`
- `context-candidate-assembly.yaml`

#### output boundary

결과가 반드시 써져야 하는 seat를 정한다.

예:

- `round1/logic.findings.yaml`
- `synthesis-ledger.yaml`

#### exploration boundary

`LLM`이 자율 탐색할 수 있는 범위를 정한다.

예:

- repo 내부 탐색 허용
- packet에 명시된 ref 우선
- target 내부 링크 재귀 추적 금지

#### write boundary

`LLM`이 어디에 써도 되고 어디에 쓰면 안 되는지 정한다.

예:

- output seat만 write 허용
- source doc 수정 금지

#### tool/research boundary

shell, 파일 읽기, 웹 리서치 등 외부 도구 사용 가능 범위를 정한다.

예:

- repo file read 허용
- web research 금지 또는 허용
- patch/write 금지

#### evidence/provenance boundary

추가 탐색을 했다면 어떤 evidence/provenance를 남겨야 하는지 정한다.

예:

- external source URL
- inspected file ref
- cited section

#### degraded/failure boundary

입력이 부족하거나 output을 못 만들었을 때 어떤 상태로 끝내야 하는지 정한다.

예:

- `Unverified`
- `deliberation required`
- `fail-close`

### 3.5 boundary seat 분리

`declared boundary`는 아래처럼 seat를 나눠서 표현하는 것이 좋다.

#### `BoundaryPolicy`

무엇이 허용/금지/요구되는지를 선언한다.

예:

```yaml
boundary_policy:
  web_research_policy: denied
  filesystem_scope:
    allowed_roots:
      - /repo-a
	  write_policy:
	    allowed_outputs:
	      - round1/logic.findings.yaml
```

#### `BoundaryPresentation`

그 정책을 `LLM`에게 어떤 방식으로 드러내는지 선언한다.

예:

```yaml
boundary_presentation:
  prompt_packet: declared
  binding_artifact: declared
  capability_notice: optional
```

#### `BoundaryEnforcementProfile`

그 정책이 실제 실행 환경에서 어떻게 강제되는지 선언한다.

예:

```yaml
boundary_enforcement_profile:
  prompt: declared_only
  filesystem: mcp_scoped
  network: environment_enforced
  write: host_enforced
```

#### `EffectiveBoundaryState`

실제로 적용된 최종 상태를 남긴다.

예:

```yaml
effective_boundary_state:
  web_research_policy: denied
  filesystem_scope:
    allowed_roots:
      - /repo-a
```

### 3.6 weakest/strongest boundary

같은 `BoundaryPolicy`라도 강제 강도는 다를 수 있다.

#### 약한 경계

- prompt-declared only
- host가 사실상 신뢰에 기대는 경계

#### 강한 경계

- host-enforced
- MCP-scoped
- environment-enforced

현재 productization 단계에서는
`worker + prompt-declared boundary`로 먼저 작동을 확인할 수 있다.

하지만 설계 자체는
나중에 더 강한 enforcement로 승격될 수 있어야 한다.

### 3.7 deny precedence

정책과 강제 프로필이 여러 층에 걸쳐 공존할 때는
기본 우선순위를 아래처럼 둔다.

- 가장 강한 `deny`가 승리한다

예:

1. prompt는 web 허용
2. host는 web 허용
3. environment는 network 차단

이 경우 `EffectiveBoundaryState`는 `web_research_policy: denied`가 된다.

즉 선언보다 실제 적용 상태가 우선이고,
실제 적용 상태에서는 가장 강한 deny가 authority가 된다.

### 3.8 smallest sufficient bundle

interface는 `LLM`에게 가장 큰 bundle을 던지는 것이 아니라,
**가장 작은 충분 집합**을 줘야 한다.

원칙:

1. primary reasoning object는 우선 제공
2. secondary context는 ref로 제공
3. optional context는 정말 필요할 때만 읽게 한다
4. target 안의 참조를 재귀적으로 계속 따라가게 만들지 않는다

즉 좋은 interface는
`more context`가 아니라 `sharper context`다.

### 3.9 declared boundary presentation modes

declared boundary는 아래 방식으로 제시할 수 있다.

1. embed
2. ref
3. seat map
4. explicit allow/deny rule
5. bounded policy statement

즉 runtime은 단순히 파일 몇 개를 나열하는 것이 아니라,
각 요소가 어떤 presentation mode를 갖는지까지 정해야 한다.

예:

- `materialized input` -> embed
- `binding.yaml` -> ref
- `round1/logic.findings.yaml` -> output seat
- `repo 내부 탐색 허용, web 금지` -> bounded policy statement

### 3.10 embed vs ref criteria

무엇을 packet에 직접 넣고 무엇을 ref로만 줄지의 기준은 아래다.

#### embed해야 하는 것

1. 이번 reasoning의 핵심 대상 본문
2. 한 번의 lens 판단에 반드시 필요한 짧은 canonical instruction
3. file lookup 비용보다 즉시 가시성이 더 중요한 작은 primary input

예:

- `materialized input`
- lens-specific minimal directives

#### ref로 넘겨야 하는 것

1. 부가 맥락 문서
2. session metadata
3. binding/interpretation artifact
4. context candidate assembly
5. 다른 lens output seat

예:

- `interpretation.yaml`
- `binding.yaml`
- `context-candidate-assembly.yaml`
- `round1/{lens}.findings.yaml`

#### embed하면 안 되는 것

1. target과 직접 무관한 대형 문서 묶음
2. target 본문을 다시 감싼 giant repeated payload
3. 이미 file seat가 있는 artifact 전체를 중복 복사한 packet

즉:

- primary target content는 embed 가능
- supporting context는 원칙적으로 ref

### 3.11 declared boundary control modes

declared boundary의 통제 방식은 최소 아래를 포함해야 한다.

1. allowlist
2. denylist
3. scope cap
4. write restriction
5. provenance obligation
6. fail-close gate

예:

- packet에 명시된 파일 우선
- 문서 내부 링크의 재귀 추적 금지
- output seat 외 write 금지
- 웹 리서치 시 URL 증거 남기기
- required section이 없으면 fail-close

즉 boundary는 단순 제시가 아니라
`allowed / disallowed / required / forbidden`
을 함께 선언해야 한다.

### 3.12 no hidden expansion

packet이 가리키는 파일 집합이 interface boundary다.

따라서 `LLM`은 아래를 기본으로 해서는 안 된다.

1. target 안의 문서 링크를 계속 재귀 추적
2. packet에 없는 광범위한 repo 탐색
3. self-directed context expansion

예외가 있으려면 packet이나 contract가 그 확장을 명시적으로 허용해야 한다.

### 3.13 single-purpose output

각 interface call은 단일 목적의 output seat를 가진다.

예:

- `logic` -> `round1/logic.findings.yaml`
- `axiology` -> `round1/axiology.findings.yaml`
- `synthesize` -> `synthesis-ledger.yaml`

runtime은 이 output seat의 존재/비어있지 않음을 검사할 수는 있지만,
그 의미를 다시 써서는 안 된다.

### 3.14 machine source layer와 human-readable projection을 분리

Structured output이 필요한 단계에서는 `LLM` output이 machine source layer로
고정되고, human-readable 문서는 runtime projection으로 남는다.

예:

- `round1/*.findings.yaml` -> optional `round1/*.md` projection
- `synthesis-ledger.yaml` -> `synthesis.md` projection

그 다음 runtime이 deterministic하게 아래를 조립한다.

- `final-output.md`
- `review-record.yaml`

즉 interface의 중요한 원칙은:

- `LLM`은 reasoning/source layer를 만든다
- runtime은 primary artifact를 조립한다

### 3.15 host/runtime neutrality

interface는 특정 host command에 묶이면 안 된다.

즉 canonical seat는 아래 두 축으로 본다.

1. `실행 실현 방식 (execution_realization)`
2. `호스트 런타임 (host_runtime)`

예:

```yaml
execution_realization: worker
host_runtime: codex
```

interface contract는 이 두 축을 분리해서 유지해야 한다.

### 3.16 process identity preservation

prompt path와 implementation path는
interface의 identity가 같아야 한다.

즉 아래가 동일해야 한다.

- `declared handoff inputs`
- `presentation mode`
- `control policy`

허용되지 않는 것:

1. target마다 ad hoc prompt로 절차를 바꾸는 것
2. 설계 문서에 없는 reasoning step을 adapter 내부에서 암묵적으로 추가하는 것
3. contract에 없는 output field를 사실상 required처럼 쓰는 것

---

## 4. Interface Gate Principles

### 4.1 runtime은 structural gate다

runtime이 검사하는 것은 아래다.

1. declared input seat 존재 여부
2. declared output seat 존재 여부
3. output 비어있지 않음
4. deterministic field/section extraction 가능 여부
5. artifact 조립 가능 여부

즉 runtime은 `structure`만 gate한다.

### 4.2 `LLM`은 semantic gate다

`맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`는
메인 콘텍스트와 분리된 semantic gate 역할을 한다.

즉:

1. 메인 콘텍스트 drift를 그대로 따라가지 않는다
2. lens-specific 관점에서 독립 판단을 한다
3. disagreement와 uncertainty를 독립적으로 남긴다

### 4.3 boundary-constrained degradation

경계 때문에 필요한 탐색이나 근거 확보가 불가능해진 경우,
`LLM`은 억지 결론으로 타협하면 안 된다.

이때는 아래 같은 degraded 상태로 끝내야 한다.

1. `insufficient_access`
2. `insufficient_evidence_within_boundary`
3. `deliberation_required`
4. `fail-close`

즉 boundary는 단순 금지 규칙이 아니라,
문제를 풀지 못할 때의 종료 posture까지 함께 가져야 한다.

---

## 5. Review Interface Template

현재 `review`에서의 canonical interface template은 아래다.

### 5.1 runtime -> lens

input:

1. `role definition`
2. `materialized input`
3. optional refs:
   - `interpretation.yaml`
   - `binding.yaml`
   - `session metadata`
   - `target snapshot`
   - `context candidate assembly`
4. declared control policy:
   - repo exploration allowance
   - recursive expansion 금지
   - output seat only write
   - provenance requirement if extra exploration occurs
5. optional boundary seats:
   - `BoundaryPolicy`
   - `BoundaryPresentation`
   - `BoundaryEnforcementProfile`
   - `EffectiveBoundaryState`

output:

1. `round1/{lens}.findings.yaml`

### 5.2 runtime -> synthesize

input:

1. `materialized input`
2. participating `round1/{lens}.findings.yaml` refs
3. optional refs:
   - `interpretation.yaml`
   - `binding.yaml`
   - `session metadata`
4. declared control policy:
   - participating lens outputs만 authoritative input
   - 새 독립 관점 invent 금지
   - output seat only write
5. optional boundary seats:
   - `BoundaryPolicy`
   - `EffectiveBoundaryState`

output:

1. `synthesis-ledger.yaml`
2. optional deterministic `synthesis.md` projection

### 5.3 runtime after LLM

input:

1. `synthesis-ledger.yaml`
2. `binding.yaml`
3. `session-metadata.yaml`

output:

1. `final-output.md`
2. `review-record.yaml`

---

## 6. Interface Design Priority Ordering

productization 중간 단계에서는
runtime deterministicization을 늘리는 것보다
`LLM`/runtime interface를 더 잘 자르는 것이 우선일 수 있다.

interface를 손볼 때의 우선순위는 아래다.

1. `LLM`이 실제로 더 잘 작동하도록 bundle을 줄인다
2. primary target과 output seat를 더 선명하게 한다
3. supporting context는 ref로 내린다
4. seat와 artifact truth는 유지한다
5. 그 다음에만 hardened runtime gate를 더한다

즉:

- 먼저 `작동하는 review`
- 그 다음 `더 엄격한 runtime`

순서다.

---

## 7. Immediate Rule Of Thumb

실무적으로는 아래 한 줄로 판단한다.

- runtime interface는 **seat를 고정하되 bundle은 최소화**하고,
- `LLM`에게는 **선언형 handoff 입력 + explicit output seat + bounded refs + declared control policy**를 준다.

이 기준을 벗어나 giant packet, hidden expansion, semantic repair가 생기면
interface를 다시 잘라야 한다.
