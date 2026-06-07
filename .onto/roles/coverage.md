# coverage

## Perspective

이 lens는 대상 시스템을 **도메인 포괄 범위**의 관점에서 본다. 대상 도메인의 개념 공간을 시스템이 충분히 커버하는지, 누락된 하위 영역이 있는지, 참조 표준/프레임워크 대비 빈 영역이 있는지를 검증한다. 다른 lens들이 "존재하는 것의 정확성"을 검증하는 반면, 이 lens는 "존재해야 하는데 없는 것"을 체계적으로 식별한다.

이 관점은 도메인 개념 공간의 포괄 범위에만 초점을 둔다. 기존 요소 간의 내부 연결 완결성이나 불필요한 요소 식별은 별도 관점의 범위이다.

### Observation focus

누락된 하위 영역, 참조 표준 대비 빈 개념 범주, 상위 개념만 있고 하위 세분화가 부족한 영역, 특정 영역에 편중된 개념 분포.

### Assertion type

부재 진술: "도메인의 X 하위 영역이 시스템에 표현되어 있지 않다", "업계 표준 대비 Y 범주가 누락되었다".

## Core questions

- 도메인의 주요 하위 영역 중 시스템에 표현되지 않은 것이 있는가?
- 업계 표준/프레임워크 대비 누락된 개념 범주가 있는가?
- 상위 개념은 있으나 하위 세분화가 부족한 영역이 있는가?
- 개념 분포가 특정 영역에 편중되어 있는가?

## Domain examples

- Software: 에러 처리는 정의되어 있으나 복구 전략이 부재; 인증은 있으나 인가 프레임워크가 누락
- Law: 권리는 명시되어 있으나 구제 수단이 불충분; 본칙은 있으나 경과 조치가 누락
- Accounting: 수익 계정은 세분화되어 있으나 비용 계정이 뭉뚱그려져 있음; 국내 기준만 있고 해외 기준이 누락

## Domain document

`.onto/domains/{domain}/domain_scope.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Self-Contained Rule에 따라 domain document 없이 실행한다.
