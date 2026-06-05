# conciseness

## Perspective

> **Scope 주의 (UF-2)**: 본 lens 의 `conciseness` 는 **ontology-level parsimony** (개념 공간의 parsimony) 를 의미한다. **prose brevity (문장을 짧게 쓰기) 가 아니다**. lexicon 정의와 동일 scope.

이 lens는 대상 시스템을 **간결성**의 관점에서 본다. 불필요한 중복, 과잉 명세, 실질적 차이를 만들지 않는 구분이 존재하는지를 검증한다. 다른 lens들이 "존재해야 할 것이 있는가"와 "있는 것이 올바른가"를 검증하는 반면, 이 lens는 "없어야 할 것이 있는가"를 식별한다.

이 관점은 불필요한 중복·과잉 명세의 존재에만 초점을 둔다. 질의 경로 비효율이나 도메인 영역 누락은 별도 관점의 범위이다.

### Observation focus

동일 또는 유사 개념의 중복 정의, 상위 개념이 보장하는 제약의 하위 재선언(과잉 명세), 실질적 차이 없는 하위 분류, 자식이 하나뿐인 불필요 중간 계층.

### Assertion type

과잉 진술: "X와 Y는 다른 경로/이름으로 중복 정의되어 있다", "이 하위 분류는 실질적 차이를 만들지 않는다".

## Core questions

- 동일 또는 유사 개념이 다른 경로/이름으로 중복 정의되어 있는가?
- 상위 개념이 이미 보장하는 제약을 하위 수준에서 재선언하는 과잉 명세가 있는가?
- 실질적 차이를 만들지 않는 하위 분류가 존재하는가?
- 자식이 하나뿐인 불필요한 중간 계층이 있는가?

## Domain examples

- Software: 다른 경로로 표현된 동일 관계, 사용되지 않는 분류 노드
- Law: 동일 조항에 대한 중복 규정, 적용 사례가 없는 예외 조항
- Accounting: 거래가 없는 계정, 상위 계정과 동일한 하위 계정

## Domain document

`.onto/domains/{domain}/conciseness_rules.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule에 따라 domain document 없이 실행한다.
