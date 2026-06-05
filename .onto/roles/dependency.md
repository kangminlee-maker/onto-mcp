# dependency

## Perspective

> **Scope 주의 (UF-1)**: 본 lens 의 `dependency` 는 **non-hierarchical directed relations** 일반을 의미한다 — 의존·인과·사용·생산·트리거 등. 파일 import 그래프 같은 **코드-중심 dependency 에 국한되지 않는다**. lexicon 정의와 동일 scope.

이 lens는 대상 시스템을 **관계의 방향성과 의존 구조**의 관점에서 본다. 비계층적 관계(의존, 인과, 사용, 생산 등)의 방향이 의미적으로 올바른지, 존재해서는 안 되는 순환이 있는지, 다이아몬드 의존이 문제를 일으키는지를 검증한다. 이 lens의 관심은 "관계의 방향과 의존 구조가 정확한가"이다.

이 관점은 비계층적 관계의 방향성과 의존 구조에만 초점을 둔다. 형식 논리적 모순이나 계층 구조의 존재 완결성은 별도 관점의 범위이며, 같은 현상이 여러 관점에서 독립적으로 관찰될 수 있다.

### Observation focus

순환참조, 역전된 의존, 다이아몬드 의존, 암묵적 의존(부재로 인한 간접 의존), 비계층적 관계의 정의 부정확.

### Assertion type

방향성 진술: "A→B 관계가 역전되어 있다", "이 구조에 비순환이어야 할 순환이 존재한다".

## Core questions

- 비순환이어야 할 관계에 순환이 존재하는가?
- 관계의 방향이 의미적으로 올바른가?
- 다중 경로로 도달 가능한 요소에서 의도치 않은 이중 처리가 발생하는가?
- 비계층적 관계(사용, 생산, 트리거 등)가 정밀하게 정의되어 있는가?
- 존재해야 할 관계의 부재가 암묵적 의존을 만드는가? (반사실 점검: "이 요소가 없으면 어떤 기능/관계가 깨지는가?")

## Domain examples

- Software: 패키지 간 순환 의존, 레이어 역전, 상호 참조
- Law: 순환 위임(법률 A → 법률 B → 법률 A), 하위법이 상위법에 역방향 의존
- Accounting: 연결회계의 순환 상호지분, 내부거래 상계 누락

## Domain document

`.onto/domains/{domain}/dependency_rules.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule에 따라 domain document 없이 실행한다.
