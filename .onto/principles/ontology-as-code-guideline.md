# Ontology as Code Guideline

> 상태: Active
> 목적: onto-mcp가 concept, contract, artifact, runtime implementation을 같은 authority chain으로 유지하는 기준을 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/principles/ontology-as-code-naming-charter.md`
> - `.onto/principles/productization-charter.md`

---

## 1. Position

`Ontology as Code`는 naming convention이나 문서 정리 습관이 아니다.

onto-mcp에서 이 말은 아래 사슬을 끊지 않는다는 뜻이다.

```text
concept
-> contract
-> artifact seat
-> type/interface
-> field name
-> variable name
-> filesystem path
-> MCP/Core API surface
```

핵심은 같은 개념이 문서, artifact, code, tool surface에서 같은 뜻으로 작동하게 만드는 것이다.

---

## 2. Core Goal

이 guideline의 목표는 아래다.

1. 같은 개념이 문서와 코드에서 같은 뜻으로 작동하게 만든다.
2. `LLM`과 runtime의 책임을 concept 기준으로 분리한다.
3. source layer와 projection layer를 분리한다.
4. host/model/provider가 바뀌어도 유지되는 structure를 만든다.
5. MCP/Core API surface가 artifact truth와 같은 contract를 보게 만든다.

중요한 것은 코드 양이 아니라 concept, contract, artifact, implementation이 일관되게 연결되는 정도다.

---

## 3. What It Is Not

`Ontology as Code`는 아래가 아니다.

1. 단순 naming convention
2. 문서 정리 습관
3. `LLM`을 없애는 시도
4. 모든 것을 deterministic runtime code로 옮기는 시도
5. prose-only 문서를 runtime authority로 유지하는 방식
6. artifact truth 없이 MCP tool schema만 늘리는 방식

---

## 4. Canonical Mapping Rule

하나의 concept는 아래 mapping을 가져야 한다.

예:

```text
ReviewRecord
-> record contract
-> .onto/review/{session_id}/review-record.yaml
-> interface/type/validator
-> review_record_id / record_status / final_output_ref
-> reviewRecord
-> onto_review_result bounded response view
```

이 연결 중 하나가 끊어지면 drift가 생긴다.

---

## 5. Same Concept, Same Label

하나의 concept에는 하나의 canonical label만 쓴다.

자주 쓰는 예:

- `호출 해석 (InvocationInterpretation)`
- `호출 고정 (InvocationBinding)`
- `대상물 형식 (TargetMaterialKind)`
- `목적 적합성 프레임 (PurposeAdequacyFrame)`
- `리뷰 기록 (ReviewRecord)`
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`

naming과 concept economy의 상세 규칙은 `.onto/principles/ontology-as-code-naming-charter.md`가 소유한다.

---

## 6. Execution Rule

### 6.1 Product path is artifact-first

현재 product path는 artifact-first다.

즉 실행이 성공했다는 말은 대화가 그럴듯하게 끝났다는 뜻이 아니라,
contract가 요구하는 source artifact와 projection artifact가 올바른 seat에 생성됐다는 뜻이다.

### 6.2 Prompt/provider execution is a realization, not alternate truth

LLM/provider 실행은 의미 판단을 수행하는 realization이다.
그 실행이 worker-backed이든 direct-call이든 artifact truth는 같아야 한다.

규칙:

1. 같은 contract를 따른다.
2. 같은 accepted output channel을 쓴다.
3. 같은 output shape를 만든다.
4. 같은 source/projection layer를 유지한다.
5. runtime-owned field는 runtime이 쓴다.

### 6.3 Separate discovery from implementation

치환이나 확장 과정에서 새 개념을 발견할 수 있다.

판별 기준은 아래다.

> 이것 없이 다음 product path 실행이 성공할 수 있는가?

- 아니오: blocker로 지금 처리한다.
- 예: discovery로 기록하고 active runtime contract에는 섞지 않는다.

---

## 7. Context Isolation Rule

`LLM` 실행 단위는 필요할 때 `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`로 분리한다.

핵심 속성:

1. 메인 콘텍스트와 상태를 공유하지 않는다.
2. 계약된 입력만 받는다.
3. 계약된 출력만 낸다.
4. 독립적으로 의미 판단을 수행한다.

현재 review에서는 selected lens set과 synthesize actor가 이 원칙의 주요 적용 대상이다.

---

## 8. Authority Rule

권위 순서는 아래를 따른다.

1. `.onto/authority/core-lexicon.yaml`
2. `.onto/processes/**` process contracts
3. `.onto/principles/**` active principles
4. TypeScript type/interface/validator/submit handler
5. MCP/Core API schema and surface
6. generated runtime artifact
7. historical prototype prose and migration notes

prose가 code를 이기는 구조가 아니라,
concept -> contract -> implementation -> artifact evidence 순서가 유지되어야 한다.

---

## 9. Canonical Pointers

| 원칙 | canonical 위치 |
|---|---|
| LLM/runtime capability boundary | `/Users/kangmin/.codex/guides/llm-capability-boundary.md` |
| onto-mcp LLM/runtime 적용 규칙 | `.onto/principles/llm-native-development-guideline.md` |
| Interface seat and boundary state | `.onto/principles/llm-runtime-interface-principles.md` |
| Concept economy and naming | `.onto/principles/ontology-as-code-naming-charter.md` |
| Product direction and priority | `.onto/principles/productization-charter.md` |
| Product-local execution/data rule | `.onto/principles/product-locality-principle.md` |
| Mock/fixture evidence boundary | `/Users/kangmin/.codex/guides/mock-realization-boundary.md` |

---

## 10. Practical Checklist

새 기능이나 문서 변경 전에 확인한다.

1. 이 변경의 canonical concept는 무엇인가
2. 그 concept는 core lexicon 또는 process contract에 있는가
3. reuse, extend, rename, split 중 어떤 경로인가
4. 입력/출력 contract가 문서화됐는가
5. source artifact와 projection artifact가 분리됐는가
6. `LLM` 소유 field와 runtime 소유 field가 분리됐는가
7. accepted output channel이 명시됐는가
8. runtime-owned value를 `LLM`이 제출할 수 없게 되어 있는가
9. MCP/Core API surface가 같은 artifact truth를 보는가
10. verification evidence class가 product-path인지 mock/fixture support인지 구분됐는가
11. 변경이 `INVARIANTS.md` 보호 항목에 닿는가

---

## 11. Immediate Use

이 guideline은 아래 경우에 사용한다.

1. 새 MCP/Core API surface를 만들 때
2. review 또는 reconstruct artifact contract를 바꿀 때
3. `LLM`/runtime boundary를 자를 때
4. source layer와 projection layer를 분리할 때
5. concept naming drift를 정리할 때
6. historical prose를 active contract에서 분리할 때
