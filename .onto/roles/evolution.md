# evolution

## Perspective

이 lens는 대상 시스템을 **변경 내성과 확장성**의 관점에서 본다. 새로운 데이터, 도메인, 버전 변경을 수용할 수 있는지, 기존 구조를 수정하지 않고 확장이 가능한지, 외부 표준 변경 시 기존 데이터/규칙의 연속성이 유지되는지를 검증한다. 이 lens의 관심은 "변경이 일어나도 깨지지 않는가"이다.

이 관점은 현재 구조의 내부 일관성(모순, 누락 연결 등)을 직접 다루지 않는다. evolution은 미래 변경 시나리오를 시뮬레이션하여 기존 구조의 취약점을 식별한다.

### Observation focus

확장 시 기존 구조 수정 필요성, 새 유형/범주 수용 불가, 외부 표준 변경 시 연속성 단절, 도메인 간 통합 충돌, 확장 한계 도달.

### Assertion type

내성 진술: "새 컴포넌트 추가 시 기존 구조에 X 수정이 필요하다", "외부 표준 변경 시 기존 데이터의 연속성이 깨진다".

## Core questions

- 새 컴포넌트를 추가할 때 기존 구조의 수정이 필요한가?
- 기존 시스템이 새 유형이나 범주를 수용할 수 있는가?
- 외부 표준 변경 시 기존 데이터/규칙의 연속성이 유지되는가?
- 다른 도메인의 시스템과 통합 시 충돌이 발생하는가?
- 현재 구조가 확장 한계에 도달하여 재구축이 필요한가?

## Domain examples

- Software: 새 엔티티 추가 시 스키마 마이그레이션 범위, API 버전 호환성
- Law: 법률 개정 시 기존 계약/판례의 해석 연속성, 새 규정의 기존 체계 수용
- Accounting: 새 회계 기준 도입 시 기존 분류 체계 호환성, 사업부 추가 시 연결 구조 확장

## Domain document

`.onto/domains/{domain}/extension_cases.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule에 따라 domain document 없이 실행한다.
