# Ontology as Code Guideline

> 상태: Active
> 목적: 이 레포가 제품화를 진행하면서 정리한 `Ontology as Code` 원칙을 하나의 guideline으로 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

이 레포에서 `Ontology as Code`는
단순 naming rule이나 ontology 문서 정리를 뜻하지 않는다.

의미는 아래다.

1. 개념을 먼저 고정한다
2. 그 개념을 contract로 내린다
3. 그 contract를 artifact seat로 내린다
4. 그 artifact를 type, field, variable, filesystem path와 일치시킨다
5. prompt path와 implementation path가 같은 concept truth를 보게 만든다

한 문장으로 말하면:

- `Ontology as Code`는 `LLM` 작업과 runtime 작업을 같은 개념 체계 위에서 재현 가능하게 고정하는 방식이다.

---

## 2. Core Goal

이 guideline의 목표는 아래다.

1. 같은 개념이 문서와 코드에서 같은 뜻으로 작동하게 만든다
2. `LLM`과 runtime의 책임을 ontology 기준으로 분리한다
3. prompt path와 implementation path가 같은 artifact truth를 보게 만든다
4. host/model/provider가 바뀌어도 유지되는 structure를 만든다

즉 중요한 것은 "얼마나 많은 코드를 썼는가"가 아니라,
**개념, 계약, artifact, 구현이 얼마나 일관되게 연결되어 있는가**다.

---

## 3. What It Is Not

`Ontology as Code`는 아래와 같지 않다.

1. 단순 naming convention
2. 문서 정리 습관
3. `LLM`을 없애는 시도
4. 모든 것을 runtime code로 옮기려는 시도
5. ontology 문서와 실제 구현이 느슨하게 연결된 상태

---

## 4. Canonical Mapping Rule

`Ontology as Code`는 아래 사슬이 끊기지 않아야 한다.

```text
concept
-> contract
-> artifact seat
-> type/interface
-> field name
-> variable name
-> filesystem path
```

예:

```text
ReviewRecord
-> review-record contract
-> .onto/review/{session_id}/review-record.yaml
-> interface ReviewRecord
-> review_record_id / record_status / final_output_ref
-> reviewRecord
```

이 연결 중 하나라도 끊어지면
그 구현은 `Ontology as Code` 적합성이 떨어진다.

---

## 5. Same Concept, Same Label

하나의 개념에는 하나의 canonical label만 쓴다.

예:

- `호출 해석 (InvocationInterpretation)`
- `호출 고정 (InvocationBinding)`
- `리뷰 기록 (ReviewRecord)`
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)`

같은 개념을 상황마다 다른 이름으로 부르면 안 된다.

또 하나의 label은 하나의 conceptual axis에서만 써야 한다.

예:

- `execution_realization`은 실행 구조 축
- `host_runtime`은 실행 환경 축

---

## 6. Execution Rule

### 6.1 Prompt path is a reference realization

`프롬프트 기반 기준 경로 (PromptBackedReferencePath)`는
설계의 대략적인 근사치가 아니라,
설계된 process의 reference realization이어야 한다.

즉 prompt path도 아래를 따라야 한다.

1. 같은 contract
2. 같은 execution order
3. 같은 output shape
4. 같은 artifact truth

또한 authority contract는 prompt path와 implementation path 모두에서 아래를 고정해야 한다.

1. 어떤 prompt contract를 쓰는가
2. 어떤 input artifact bundle을 읽는가
3. 어떤 execution step을 따르는가
4. 어떤 output shape를 반환하는가
5. 어떤 lineage artifact를 남기는가

### 6.2 Separate Discovery From Implementation

치환 과정에서 프로토타입에 없던 새 개념을 발견하는 것은 자연스럽다.
프로토타입에서는 `LLM`이 암묵적으로 처리하던 것이
코드로 옮겨지면서 명시적 설계가 필요해지기 때문이다.

하지만 발견과 구현의 타이밍은 분리해야 한다.

1. 새 개념을 **발견**하는 것은 자연스럽고 좋다
2. 발견한 개념을 **기록**하는 것은 즉시 해야 한다 (문서, lexicon, contract)
3. 하지만 그 개념을 **구현**하는 것은 현재 치환 대상이 작동한 이후로 미룬다

판별 기준은 한 가지다.

> **"이것 없이 다음 실행이 성공할 수 있는가?"**

- **아니오** → 지금 구현 (blocker)
- **예** → 기록만 하고, 실행 성공 이후에 구현 (enhancement)

이 규칙이 없으면 치환과 진화가 섞이면서
runtime infrastructure는 커지는데 실제 실행은 작동하지 않는 상태가 오래 유지된다.

발견한 enhancement의 추적 seat 경로는 `process.md`가 소유한다.

---

## 7. Context Isolation Rule

`LLM` 실행 단위는 필요할 때
**맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 로 분리해야 한다.

이 개념이 중요한 이유:

1. 메인 콘텍스트를 보존한다
2. 독립적인 semantic judgment를 유지한다
3. 메인 콘텍스트의 drift를 그대로 따라가지 않는다

가능한 realization 예:

- `worker`
- `Agent Teams teammate`
- `MCP`로 분리된 `LLM`
- `external model worker`

중요한 것은 구현 이름이 아니라 아래 속성이다.

1. 메인 콘텍스트와 상태를 공유하지 않는다
2. 계약된 입력만 받는다
3. 계약된 출력만 낸다
4. 독립적으로 의미 판단을 수행한다

---

## 8. Authority Rule

`Ontology as Code`는 authority chain이 명확해야 한다.

권장 순서:

1. `.onto/authority/core-lexicon.yaml`
2. 상위 charter / methodology / interface 원칙 문서
3. 개별 contract 문서
4. TypeScript type/interface
5. runtime writer / reader
6. legacy prototype prose

즉 prose가 code를 이기는 구조가 아니라,
**authority concept -> contract -> implementation** 순서가 유지되어야 한다.

---

## 9. Canonical Pointers

이 guideline에서 제거된 원칙의 canonical 위치는 아래와 같다.

| 원칙 | canonical 위치 |
|---|---|
| Ownership Rule (LLM/runtime 소유 분리) | `.onto/principles/llm-native-development-guideline.md` |
| Interface Rule (artifact-first, boundary seat) | `.onto/principles/llm-runtime-interface-principles.md` |
| Replace one boundary at a time | `.onto/principles/productization-charter.md` §7 Development Method |
| Always Keep Working | `.onto/principles/productization-charter.md` §8 Always-Keep-Working Rule |
| Fail-Close Rule | `.onto/principles/llm-native-development-guideline.md` (테스트 전략 §3 production review) |
| TypeScript Core Rule | `.onto/principles/productization-charter.md` §4.1 core는 TypeScript로 구현한다 |

---

## 10. Practical Checklist

새 기능을 만들기 전에 아래를 점검한다.

1. 이 기능의 canonical concept는 무엇인가
2. 그 concept는 `core-lexicon`에 있는가
3. 입력/출력 contract가 문서화되었는가
4. artifact seat가 정해졌는가
5. `LLM` 소유와 runtime 소유가 정확히 분리되었는가
6. runtime이 semantic reasoning을 먹고 있지 않은가
7. prompt-backed reference path가 먼저 작동하는가
8. implementation replacement가 같은 artifact truth를 유지하는가
9. degraded / fail-close posture가 정의되어 있는가
10. 이름이 canonical terminology와 일치하는가

---

## 11. Immediate Use

이 guideline은 아래 경우의 상위 기준으로 사용한다.

1. 새 entrypoint를 만들 때
2. 기존 prototype flow를 service path로 옮길 때
3. `LLM`/runtime boundary를 자를 때
4. artifact contract를 설계할 때
5. prompt path를 runtime path로 치환할 때

`review`는 현재 이 guideline을 가장 먼저 실제로 적용하는 영역이다.
