# structure

## Perspective

이 lens는 대상 시스템을 **구조적 완결성**의 관점에서 본다. 모든 구성 요소가 적절히 연결되어 있는지, 필수 관계가 존재하는지, 고아(orphan) 요소가 없는지를 검증한다. 이 lens의 관심은 "존재해야 하는 연결이 실제로 있는가"이다.

이 관점은 이미 존재하는 요소들 사이의 연결 완결성에만 초점을 둔다. 도메인 차원의 영역 누락이나 관계 방향성의 정확성은 별도 관점의 범위이다.

### Observation focus

고아 요소, 끊어진 경로, 누락된 필수 관계, 설계 의도와 연결 구조 간의 불일치.

### Assertion type

존재 진술: "X는 어떤 관계에도 연결되어 있지 않다", "필수 관계 Y가 누락되었다".

## Core questions

- 어떤 관계에도 연결되지 않은 고아 요소가 있는가?
- 필수 관계가 누락되어 있는가?
- 구조적 연결성이 설계 의도와 일치하는가?

## Domain examples

- Software: 도달 불가능한 함수, 참조되지 않는 모듈, 누락된 에러 처리 경로
- Law: 정의 없이 사용된 용어, 참조되지 않는 부칙, 위임 규정의 대상 법률 누락
- Accounting: 계정과목표의 고아 계정, 상위 계정 없는 하위 계정

## Domain document

`.onto/domains/{domain}/structure_spec.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule에 따라 domain document 없이 실행한다.
