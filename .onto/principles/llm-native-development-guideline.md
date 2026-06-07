# LLM Native Development Guideline

> 상태: Active
> 목적: onto-mcp에서 `LLM`과 runtime의 책임을 나눌 때 적용할 repo-local 기준을 고정한다.
> 최신 일반 원칙:
> - `/Users/kangmin/.codex/guides/llm-capability-boundary.md`
> 관련 기준:
> - `/Users/kangmin/.codex/guides/mock-realization-boundary.md`
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/principles/llm-runtime-interface-principles.md`
> - `.onto/principles/productization-charter.md`

---

## 1. Position

이 문서는 일반적인 LLM/runtime 경계 원칙의 canonical source가 아니다.
그 일반 원칙은 `/Users/kangmin/.codex/guides/llm-capability-boundary.md`가 소유한다.

이 문서가 소유하는 것은 그 원칙을 onto-mcp의 개념, artifact, MCP/Core API
surface에 적용하는 방식이다.

핵심 기준은 아래다.

1. `LLM`은 의미 판단을 맡는다.
2. runtime은 구조, 권한, artifact, 검증, 직렬화, deterministic projection을 맡는다.
3. machine-consumed artifact는 자유 prose가 아니라 submit tool 또는 동등한 constrained channel을 통해 만든다.
4. runtime-owned 값은 `LLM`이 제출할 수 없고, 제출되면 실패해야 한다.
5. mock/fixture는 verification support evidence이며 제품 의미 경로의 완료 증거가 아니다.

---

## 2. Ownership Rule

### 2.1 `LLM` 소유

아래는 의미 판단이므로 `LLM`이 소유한다.

| 대상 | 이유 |
|---|---|
| 사용자 의도 해석 | 자연어 요청의 목적, 모호성, tradeoff 판단이 필요하다. |
| 관련성 판단 | 어떤 증거가 중요한지 ranking과 선택이 필요하다. |
| evidence sufficiency judgment | 주어진 근거로 결론을 낼 수 있는지 판단해야 한다. |
| materiality, causality, semantic quality 판단 | 의미, 원인, 영향, 품질 기준을 해석해야 한다. |
| rationale와 user-facing prose 초안 | 결과의 의미를 사람이 이해할 수 있게 설명해야 한다. |
| open-world 탐색 계획 | 명시 입력만으로 부족할 때 무엇을 더 봐야 하는지 판단해야 한다. |

### 2.2 runtime 소유

아래는 구조와 실행 권한 문제이므로 runtime이 소유한다.

| 대상 | 이유 |
|---|---|
| 접근 가능한 context와 tool surface | 실제 접근 권한은 실행 환경이 결정한다. |
| artifact path, id, envelope, metadata | 결정론적으로 만들 수 있고 downstream contract가 의존한다. |
| accepted output channel | machine artifact 생성 경로는 구조적으로 제한되어야 한다. |
| schema, validator, allowed set | exactness와 repeatability가 필요하다. |
| serialization과 persistence | canonical artifact는 runtime이 써야 한다. |
| deterministic projection | upstream artifact에서 재해석 없이 계산 가능하다. |
| run status, retry, failure, degradation 기록 | 실행 상태는 runtime evidence다. |
| MCP/Core API tool schema와 surface | host-facing capability surface는 runtime contract다. |

---

## 3. Structured Artifact Rule

machine-consumed artifact의 각 field는 하나의 primary enforcement mechanism을 가져야 한다.

| field 종류 | 기본 mechanism |
|---|---|
| 짧은 closed value | provider enum이 가능하면 provider enum + runtime enum validation |
| runtime-known id/path/session metadata | runtime-owned |
| 긴 evidence ref, source-derived ref, quoted snippet | provider schema에서는 string, runtime allowed-set validation |
| source span 존재 여부처럼 truth가 decidable한 값 | grounding-blocked validation |
| materiality/causal rationale처럼 열린 의미 판단 | structured shape validation + semantic review |
| artifact envelope, schema version, serialization | runtime-only |

규칙:

1. canonical machine artifact는 free prose에서 파싱하지 않는다.
2. `LLM`이 runtime-owned field를 제출하면 실패한다.
3. unknown field는 실패한다.
4. human-readable markdown/HTML은 가능한 한 machine artifact에서 runtime projection으로 만든다.
5. prompt contract, submit schema, runtime validator, tests는 단일 source에서 파생하거나 drift-catching test를 가져야 한다.

---

## 4. Onto Concept Mapping

### 4.1 Invocation

- `호출 해석 (InvocationInterpretation)`: `LLM`이 사용자 요청의 의미, 모호성, target 후보를 해석한다.
- `호출 고정 (InvocationBinding)`: runtime이 target, session, allowed roots, execution profile, artifact seat를 고정한다.

`InvocationInterpretation`의 semantic payload는 `LLM`이 만들 수 있지만,
artifact id, path, schema envelope, write location은 runtime이 소유한다.

### 4.2 Review

`review`에서 책임은 아래처럼 나뉜다.

| 단계 | `LLM` 소유 | runtime 소유 |
|---|---|---|
| execution preparation | 목적/맥락 해석이 필요한 semantic profile 보조 | `review-context-manifest`, target snapshot, allowed refs, actor bindings |
| lens execution | lens별 finding의 claim, rationale, materiality/causal 판단 | lens id, candidate id, submit tool, sidecar path, serialization |
| finding/issue artifacts | issue meaning을 묶기 위한 bounded semantic payload | finding ledger, relation graph, issue ledger, stance matrix projection |
| deliberation | contested issue에 대한 lens stance와 resolution input | plan, allowed issue set, response seats, resolution artifact persistence |
| synthesize | bounded synthesis response | `synthesis-work-items`, `synthesis-ledger`, markdown projection |
| record assembly | human-facing explanation 초안 또는 bounded semantic fields | `review-record.yaml` aggregate, counts, refs, final artifact persistence |

`review-record.yaml`은 primary artifact다. Markdown 출력은 projection/rendering layer다.

### 4.3 Reconstruct

`reconstruct`에서 runtime은 source observation, material kind handling, directive validation,
artifact persistence를 소유한다.

`LLM`은 source-derived purpose, ontology meaning, reconstruction directive의 semantic payload를
bounded submit/validation 경계 안에서만 제공한다.

---

## 5. Development Procedure

새 LLM-assisted artifact를 만들거나 기존 artifact를 바꿀 때는 아래 순서를 따른다.

1. canonical artifact와 downstream consumer를 확인한다.
2. field를 semantic field와 deterministic field로 나눈다.
3. field마다 primary enforcement mechanism을 하나씩 정한다.
4. accepted output channel을 정한다.
5. runtime-owned field를 schema에서 금지하거나 submit handler에서 거부한다.
6. allowed refs와 closed values를 runtime에서 계산한다.
7. schema, validator, submit tool, prompt contract, tests의 authority를 한 곳으로 맞춘다.
8. truth가 decidable한 곳에만 hard grounding gate를 둔다.
9. failure kind별 retry/fail/degraded policy를 정한다.
10. product-path evidence와 mock/fixture support evidence를 분리해서 보고한다.

---

## 6. Verification Evidence

LLM/provider 호출이 제품 경로에 포함되면 제품 behavior, materiality judgment,
causal reasoning, semantic quality는 실제 semantic path에서만 완료 증거가 된다.

mock, fake, stub, fixture, prepare-only dispatch는 아래를 검증할 수 있다.

1. wiring
2. schema
3. artifact contract
4. deterministic projection
5. retry/failure handling
6. harness stability

mock-backed check는 product completion, E2E completion, semantic quality evidence와 분리한다.
실제 호출이 불가능하면 product-path evidence는 blocked 또는 degraded로 기록한다.

---

## 7. Anti-Patterns

금지하거나 즉시 재검토해야 하는 패턴은 아래다.

1. canonical artifact를 `LLM` prose에서 사후 파싱한다.
2. runtime-owned id/path/status를 `LLM`이 생성한다.
3. runtime이 materiality, causality, semantic quality를 대신 판단한다.
4. 같은 enum/schema/validator가 여러 파일에서 독립적으로 정의된다.
5. provider strict schema에 긴 source ref나 quote-heavy enum을 억지로 넣는다.
6. human-readable markdown과 machine artifact를 각각 `LLM`에게 따로 쓰게 한다.
7. mock/fixture 결과를 제품 의미 경로 완료 증거로 보고한다.
8. fallback이 trigger, lost capability, trust status, recovery path 없이 조용히 실행된다.
9. context packet이 거대해지고 output seat와 allowed refs가 흐려진다.

---

## 8. Practical Checklist

작업 시작 전 확인한다.

1. 어떤 concept와 artifact를 바꾸는가
2. canonical source는 `.onto`, TS type, submit tool, validator 중 어디인가
3. 각 field의 `LLM`/runtime 소유가 정해졌는가
4. canonical machine artifact의 accepted output channel이 명시됐는가
5. runtime-owned field와 unknown field가 실패하는가
6. source refs는 allowed-set 또는 grounding validation을 통과하는가
7. markdown/HTML은 machine artifact의 projection인가
8. mock/fixture evidence와 product-path evidence가 분리됐는가
9. 변경이 `INVARIANTS.md` 보호 항목에 닿는가
