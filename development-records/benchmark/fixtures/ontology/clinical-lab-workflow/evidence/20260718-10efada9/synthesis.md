---
deliberation_status: performed
participation:
  expected_lenses:
    - axiology
    - coverage
    - evolution
    - logic
    - semantics
    - structure
  received_lenses:
    - axiology
    - coverage
    - evolution
    - logic
    - semantics
    - structure
  missing_or_failed_lenses: []
  run_status: full
  synthesis_run_status: full
---
# Synthesize

## Consensus
- issue-001 (high): Result와 Report에 중복 저장된 상태 권위와 야간 동기화 때문에 정정 직후뿐 아니라 상태 어휘 변경·비동기 배포 중에도 EMR과 LIS가 서로 다른 상태를 권위 값으로 노출할 수 있다.
  - root cause: Result와 Report의 상태 권위를 canonical lifecycle과 결정적 projection으로 단일화하지 않고, 호환되지 않는 두 폐쇄 어휘와 야간 동기화에 분산한 설계가 현재 불일치와 상태 진화 취약성을 함께 만든다.
  - materiality: 이 설계는 동일한 임상 결과 상태를 현재와 향후 버전에서 일관되게 해석하도록 하는 개념 권위 문서의 핵심 목적을 훼손한다. 임상의나 통합 소비자가 실제 LIS의 corrected 상태 대신 Report의 finalized 상태를 신뢰할 수 있어 임상 상태 계약과 운영 신뢰가 함께 무너진다.
  - action: 먼저 결과 생명주기와 보고서 발행 생명주기를 명확히 구분하고 각각의 canonical versioned state machine과 호환성 규칙을 정의해야 한다. 그다음 결과 상태의 단일 권위 좌석을 지정하고 Report 상태를 그 권위에서 즉시 계산되는 결정적 projection으로 전환해야 한다. 별도 저장이 불가피하면 명시적 상태 매핑과 원자적 또는 이벤트 기반 동기화를 적용하고, 불일치가 검출되면 배포를 차단해야 현재 불일치와 향후 혼합 버전 위험을 함께 제거할 수 있다.
- issue-004 (high): Specimen 모델은 collected–received–in_analysis–analyzed 정상 경로만 다루며, 거부·분실·재채취·보관·폐기와 그 사건·전이가 누락되어 있어 임상검사 워크플로의 공통 개념 권위로 불완전하다.
  - root cause: 온톨로지가 검체의 정상 경로만 모델링하고 예외 및 분석 후 생명주기 의미를 권위 밖으로 위임한다.
  - materiality: 검체가 정상 경로를 벗어나면 EMR과 LIS가 현재 운영 상태와 주문 진행 가능 여부를 일관되게 교환할 수 없고, 보관·폐기를 포함한 감사 이력도 재구성할 수 없다. 따라서 임상검사 워크플로 전반을 통합하는 개념 권위라는 선언 목적을 직접 약화한다.
  - action: Specimen 생명주기에 수집·접수·운송·수령을 포함한 전처리 사건, 거부 상태와 사유, 분실 상태, 원검체와 재채취 검체의 연결, 보관 위치와 보존기간, 폐기 행위자·시각·사유를 추가하고 명시적인 허용 전이를 정의해야 한다. 먼저 공통 상태·사건과 전이 규칙을 권위화한 뒤 EMR/LIS가 주문 진행 판단과 감사 이력을 동일한 의미로 교환하도록 연결해야 한다.
- issue-005 (high): 검증·공개·정정·통보 같은 안전 관련 임상 행위가 귀속 가능한 불변 사건으로 모델링되지 않아, 행위자·시각·근거·대상 버전을 갖춘 first-class 감사 증거가 없다.
  - root cause: 검증, 공개, 정정 및 통보 같은 통제 행위를 불변이며 행위자에 귀속되는 사건으로 모델링하지 않고 현재 속성이나 상태로만 표현한다.
  - materiality: 결과의 검증·정정, 보고서의 공개·개정, 위험 값의 통보·에스컬레이션은 환자 안전과 책임성에 직접 영향을 준다. 이 행위들을 입증하고 조정할 증거가 없으면 EMR/LIS 통합 워크플로가 과거 행위를 신뢰성 있게 재구성하지 못해, 검사 결과 교환과 보고를 위한 운영상 신뢰 가능한 개념 권위라는 목적이 약화된다.
  - action: 먼저 공통 auditable event를 도입해 모든 안전 관련 행위에 행위자, 타임스탬프, 근거와 대상 결과·보고서 버전을 필수로 귀속해야 한다. 그 위에 검증, 공개, 정정·개정, 통보 사건을 특수화하고, 통보에는 적용 가능한 수신자, 채널, 확인, 에스컬레이션 결과를 추가해야 한다. 현재 상태는 이 사건 기록에서 도출되는 투영으로 두어 과거 증거를 보존하면서 운영 상태와 감사 이력을 일관되게 조정해야 한다.
- issue-006 (high): CriticalValue를 포함한 변경 가능한 검사 정의가 버전 없는 current-state로 표현되고, 재사용 임계값 규칙과 개별 결과의 통보 사건까지 한 개념에 혼합되어 있다. 이 구조로는 과거 결과에 적용된 기준과 실제 통보 이력을 신뢰성 있게 재구성할 수 없다.
  - root cause: 변경 가능한 운영 정의를 timeless current-state로 표현하고 CriticalValue의 재사용 규칙과 환자별 통보 사건을 분리하지 않아 시간 유효성과 사건 정체성이 함께 소실된다.
  - materiality: 검사 정의나 임계값이 변경되거나 동일 검사에서 여러 위험 결과가 발생하면, 과거 Result에 적용된 정의·임계값과 환자별 통보 여부를 특정할 수 없다. 이는 현재와 과거 검사 데이터를 일관되게 해석하는 EMR/LIS 개념 권위라는 목적을 약화시키고 감사, 종단 해석 및 안전 관련 통보 증명의 신뢰를 훼손한다.
  - action: 먼저 재사용 가능한 CriticalValueRule 또는 CriticalThreshold와 특정 Result에 귀속되는 불변 CriticalValueEvent/Notification을 분리해야 한다. 통보 여부·시각·수신자는 사건에 두고, 사건이 적용한 정확한 규칙 버전을 연결해야 한다. 이어 Test, Assay, 그 매핑 및 기타 변경 가능한 정의에 불변 버전 또는 effective_from/effective_to와 폐기·교체 계보를 부여하고, 각 Result를 당시 적용된 정의와 임계값 버전에 결속해야 한다.
- issue-007 (high): 카탈로그, 결과 상태 및 TAT를 여러 시스템과 필드에서 병렬 유지하면서 단일 source of truth와 결정적 파생 규칙을 지정하지 않아, 같은 검사·상태·처리시간에 대해 상충하는 운영 사실이 노출될 수 있다.
  - root cause: 공유 값을 병렬 유지하면서 단일 권위와 결정적 projection 또는 versioned mapping을 일관되게 지정하지 않았다.
  - materiality: 이 문제는 EMR/LIS 통합 경계에서 공유 의미와 우선순위를 확립하려는 목적을 직접 약화한다. 중복 값이 서로 달라지거나 늦게 동기화되면 소비자는 어느 값을 신뢰해야 하는지 판단할 수 없고, 온톨로지가 제공해야 할 권위와 precedence 계약도 성립하지 않는다.
  - action: 먼저 카탈로그, 결과 상태, TAT 각각에 대해 단일 권위 엔티티와 소유 시스템을 지정해야 한다. 이어 Test–Assay 관계에는 소유권이 명확한 versioned mapping을 정의하고, Report 상태와 TAT는 권위 있는 이벤트로부터 결정적으로 파생되도록 규칙과 변경 책임을 명시해야 한다. 권위 지정이 선행되어야 매핑과 projection이 올바른 방향으로 고정되고 동기화 지연이나 독립 진화로 인한 드리프트를 막을 수 있다.
- issue-010 (high): Test와 Assay 사이에 권위 있는 버전별 수행 실현 매핑이 없어, 카탈로그 확장과 변경이 이중 등록에 의존하며 원자성과 추적성을 확보할 수 없다.
  - root cause: Test와 Assay를 병렬 카탈로그로 두면서 authoritative realization mapping과 그 lifecycle을 생략했다.
  - materiality: 이 누락은 EMR에서 주문한 Test가 LIS의 어떤 Assay로 수행되는지를 모델 내부에서 결정하지 못하게 한다. 신규·개정·분할 검사나 분석기 대체 시 외부 관행에 의존하고 양쪽 카탈로그가 불일치할 수 있으므로, 주문-수행 통합의 개념 권위를 직접 약화한다.
  - action: Test와 Assay는 구별된 개념으로 유지하되, 둘 사이에 안정적 식별자, 명시적 cardinality, 유효기간, 상태 및 버전 생명주기를 갖는 권위 있는 realization mapping을 먼저 정의해야 한다. 이후 신규·개정·분할·분석기 대체가 이 매핑을 통해 하나의 권위 있는 변경 흐름으로 처리되도록 기존 이중 등록 절차를 대체해야 한다.
- issue-011 (high): 통합 코드와 분류가 단순 문자열·열거값으로 표현되어 외부 또는 로컬 코드 집합이 변경될 때 과거 identity와 구·신 버전의 병행 매핑을 보존할 수 없다.
  - root cause: 통합용 코드와 분류에 versioned, namespaced identity 및 시간적 교체 의미를 부여하지 않았다.
  - materiality: 이 결함은 EMR/LIS 코드 변경을 견디는 지속 가능한 개념 권위라는 목적을 직접 훼손한다. 코드 재사용·폐기·교체 또는 새 릴리스가 발생하면 과거 기록과 통합 규칙의 의미가 불안정해지고, 별도 migration table이 사실상의 권위가 된다.
  - action: namespace, code, display, version, validity interval, status, alias 및 replaced-by 관계를 갖는 재사용 가능한 Coding 또는 Concept reference를 정의하고 catalog, department, role 등 모든 통합 경계의 분류가 이를 참조하도록 해야 한다. 기존 기록은 당시의 불변 reference를 유지하게 하여 코드 개정과 후속 매핑이 과거 의미를 덮어쓰지 않도록 해야 한다.
- issue-013 (high): Test와 Assay의 의미 경계와 권위 있는 대응 관계가 없어, EMR의 주문 Test를 LIS의 수행 Assay 및 그 결과로 일관되게 추적할 수 없다. 이 때문에 Assay가 Order–Specimen–Result–Report 경로에서 구조적으로 고립된다.
  - root cause: 주문 가능 서비스와 실제 분석 수행 단위의 의미를 확정하고 연결하는 authoritative Test-Assay 모델이 없다.
  - materiality: 이 문서의 목적은 Order부터 Report까지 이어지는 EMR/LIS 임상검사 파이프라인의 개념 권위를 제공하는 것이다. 그러나 주문 코드와 수행·결과 코드의 동일성 및 결과 귀속을 판정할 경로가 없으므로 구현마다 별도 매핑을 만들게 되고, 동일한 임상검사가 서로 다르게 해석될 수 있어 권위 문서로서의 실행 가능성이 약화된다.
  - action: 먼저 Test와 Assay를 각각 주문 가능 서비스와 실제 수행 분석 단위로 사용할지, 또는 하나를 정식 개념으로 통합하고 다른 명칭·코드를 별칭으로 처리할지 확정해야 한다. 그 결정에 따라 권위 있는 Test–Assay 매핑, 카디널리티, 필수성, 버전·대체를 포함한 lifecycle을 정의하고, 실제 결과가 Assay 수행에서 생성된다면 Result에 assay_ref 또는 동등한 관계를 연결해야 한다. 의미 결정을 먼저 내려야 구조 관계와 결과 귀속 규칙이 모순 없이 확정된다.
- issue-014 (high): 개별 Result 상태와 집계 Report publication 상태가 서로 다른 어휘와 갱신 주기를 가지면서도 모두 권위값처럼 노출되어, 동일 시점의 임상 상태를 상충되게 나타낸다.
  - root cause: 개별 Result 상태와 집계 Report 상태를 동일 정보로 취급하면서 단일 의미, 파생 및 우선권 규칙을 두지 않았다.
  - materiality: 결과 정정 후 야간 동기화 전이나 여러 Result의 상태가 혼재한 상황에서는 Report가 임상의에게 보여 주는 상태와 LIS의 실제 결과 상태가 달라질 수 있다. 따라서 임상의가 신뢰할 수 있는 EMR/LIS 결과 상태의 개념 권위가 약화되고, 정정 결과의 해석과 후속 조치가 지연될 위험이 있다.
  - action: 먼저 개별 결과 상태와 Report publication lifecycle을 별도 개념으로 명명해야 한다. 이어 Report 상태가 Result 상태에서 파생된다면 다중 결과의 집계 함수, 전체 상태 매핑, 갱신 시점, 정정 시 처리 및 충돌 우선권을 하나의 권위 규칙으로 정의해야 한다. 이 순서로 의미를 분리한 뒤 파생 관계를 규정해야 임상의에게 노출되는 상태를 일관되게 결정할 수 있다.
- issue-002 (medium): Test와 Assay가 독립 등록되면서도 대응 관계와 속성 권위가 정의되지 않아, EMR 주문 항목과 LIS 수행 항목이 같은 검사인지 모델만으로 판정할 수 없다.
  - root cause: Test와 Assay의 개념 분리 결정을 닫지 않은 채 관계 모델 없이 이중 등록을 운영 정책으로 채택해 카탈로그 권위가 분산된다.
  - materiality: 이 문서의 목적은 EMR 주문 카탈로그와 LIS 수행 카탈로그를 연결하는 개념 권위를 제공하는 것이다. 그러나 신규 항목의 코드나 검체 표현이 달라질 때 어느 항목과 속성이 기준인지 결정할 수 없어 통합 설계가 비공식 외부 매핑에 의존하므로 그 목적이 실질적으로 약화된다.
  - action: 먼저 Test와 Assay의 정체성 경계와 속성 권위 좌석을 확정해야 한다. 별도 개념이라면 명시적 매핑 관계, cardinality, canonical 식별자와 검체 요구사항의 권위를 정의하고, 동일 개념이라면 하나로 통합한 뒤 시스템별 코드는 alias 또는 projection으로 두어야 한다. 이 결정은 주문·수행 카탈로그 연결 설계의 선행 조건이므로 대상 문서에서 닫아야 한다.
- issue-008 (medium): Result가 임상 관찰, 보고 값, 분석 실행을 구분하지 못하고 값도 문자열로만 표현하므로, 방법·시각·해석·장비·실행 provenance가 다른 결과를 임상적으로 동등한 것으로 오인할 수 있다.
  - root cause: 검사 관찰과 분석 provenance를 최소 문자열 기반 Result 레코드로 축약하고 Assay 실행과의 연결을 두지 않았다.
  - materiality: EMR/LIS가 결과를 안전하게 표시·추세화·비교·재현하려면 값의 유형과 해석 조건, 관찰 시각, 방법 및 수행 provenance를 보존해야 한다. 현재 모델은 이를 제공하지 않아 임상적으로 중요한 의미가 소실되거나 비동등한 관찰이 같은 결과로 처리될 수 있으므로, 결과 의미를 제공한다는 목적을 실질적으로 약화한다.
  - action: 출시 전 현재 대상에서 관찰 또는 분석 실행과 보고 값을 분리하고, Result에 typed value 변형, 관찰·수행 시각, 참조구간, 해석, 이상·위험 플래그와 한정자를 모델링해야 한다. 이어 Result를 적용 가능한 버전 정의 및 Assay 실행에 연결하고 방법, 장비, 수행 검사실 provenance를 보존해야 한다. 관찰·실행의 정체성과 연결을 먼저 확립해야 보고 값의 해석 필드가 올바른 분석 맥락을 참조할 수 있다.
- issue-009 (medium): 검체 분류가 Specimen과 Test의 폐쇄 enum 및 Assay의 자유 문자열에 중복되어 있어, 분류 추가·변경 시 세 표현과 별도 매핑을 함께 수정해야 한다. 이는 단일 권위로 관리되어야 할 검체 분류의 진화와 상호운용성을 저해하는 material issue이다.
  - root cause: Specimen 분류가 하나의 참조 가능하고 versionable한 권위 개념 없이 여러 폐쇄 enum과 자유 문자열에 독립적으로 인코딩되어 있다.
  - materiality: 이 온톨로지는 새 검사 분류를 수용하면서 EMR/LIS 통합의 개념 권위로 기능해야 한다. 그러나 신규 검체 분류, 동의어 또는 분류 변경을 주문·채취·분석기 카탈로그 사이에서 교환하려면 권위 문서 밖에서 수정과 매핑을 조정해야 하므로 상호운용성이 약화되고 과거·현재 기록의 의미를 일관되게 해석하기 어려워진다.
  - action: 안정적 식별자, 별칭, 유효 버전 메타데이터 및 외부·로컬 코드 매핑을 가진 canonical SpecimenType을 먼저 권위 개념으로 도입하고, 이어서 Specimen, Test, Assay의 모든 검체 속성이 이를 참조하도록 전환해야 한다. 이 순서가 필요한 이유는 공통 권위를 먼저 확립해야 기존 값의 매핑과 이력을 보존하면서 중복 enum과 자유 문자열 의존을 제거할 수 있기 때문이다.
- issue-012 (medium): Result 정정으로 완료 조건이 사라진 뒤 Order 상태를 재평가하는 규칙이 없어, 동일한 사건 이력에서 Order를 completed로 유지할지 다시 처리 상태로 전환할지 결정할 수 없다.
  - root cause: Order.completed의 판정 조건이 변경 가능한 Result.status에 의존하지만 결과 정정 후 Order를 재평가하는 규칙이 정의되지 않았다.
  - materiality: 이 공백은 EMR과 LIS가 동일한 주문을 서로 다른 상태로 해석하게 만들어 상태 동기화와 후속 처리의 신뢰성을 낮추므로, 주문·결과 상태의 개념 권위를 제공하려는 문서 목적을 약화한다.
  - action: 배포 전에 상태 정책을 하나로 명시해야 한다. corrected를 완료된 결과로 포함해 Order.completed를 유지하거나, 정정 시 Order를 in_progress로 재개하고 정정 완료 후 다시 completed로 전이하도록 규정해야 한다. 먼저 completed의 의미를 ‘과거 처리 완료’와 ‘현재 결과 집합의 확정 완료’ 중 무엇으로 볼지 결정한 뒤, 그 결정에 맞춰 정정 전이와 Order 재평가 규칙을 함께 닫아야 한다.
- issue-015 (medium): STAT 긴급도가 priority, is_stat, StatOrder로 중복 표현되면서 동치 조건이 없어 동일 주문이 서로 다른 긴급도 판정을 가질 수 있다. 이 문제는 목표 범위에서 반드시 해소해야 한다.
  - root cause: 긴급도라는 단일 분류 의미에 대해 canonical 권위 표현과 파생 규칙을 선택하지 않았다.
  - materiality: EMR과 LIS가 서로 다른 표현을 권위값으로 사용하거나 일부 표현만 갱신하면 주문 우선순위 해석이 갈린다. 그 결과 긴급 검사의 라우팅과 처리 기준에 대한 통합 계약이 불명확해져, 시스템 간 긴급도를 일관되게 전달하려는 목적이 약화된다.
  - action: 릴리스 전에 priority를 긴급도의 유일한 권위 속성으로 정하고 is_stat과 StatOrder를 제거하거나 priority에서 계산되는 결정적 파생 뷰로 정의해야 한다. StatOrder를 유지한다면 priority=stat, is_stat=true, StatOrder 소속 사이의 필요충분조건을 강제하고, 주문 발행 후 priority 변경 가능성과 그에 따른 subtype 전환 규칙도 명시해야 한다.
- issue-016 (medium): Specimen은 Result의 물질적 출처인데도 produces가 생산 행위까지 Specimen에 귀속하여 derived_from과 충돌하고 실제 분석 수행 주체를 모호하게 만든다.
  - root cause: 결과의 물질적 출처와 결과를 산출하는 분석 실행을 구분하지 않아 Specimen에 생산 행위 의미가 잘못 귀속된다.
  - materiality: 관계 이름을 기준으로 결과 생성 사건, 계보 또는 책임 주체를 구현하면 물질적 출처가 분석 수행자로 오해될 수 있다. 이는 검체·검사 수행·결과 사이에 의미적으로 정확한 통합 관계를 제공한다는 목적을 약화시키며, 결과 계보와 이벤트 매핑 오류로 이어질 수 있어 material·medium 판단이 타당하다.
  - action: 대상 릴리스 전에 이 문제를 닫아야 한다. 먼저 Specimen–Result 연결을 물질적 출처 관계로 한정하고, 역관계가 필요하면 is_source_of 또는 has_derived_result처럼 derived_from의 정확한 역의미로 명명한다. 이어 실제 결과 생산 행위는 Test 또는 Assay 실행 개념에 귀속해 Specimen, 분석 실행, Result를 분리하여 연결한다. 분석 실행과 Assay provenance 부재는 issue-008과 공유 원인 후보이므로 실행 개념을 공통 기반으로 정리한 뒤 이 관계를 수정해야 중복 확장과 재해석을 피할 수 있다.
- issue-017 (medium): Test의 주문 검체 요구사항과 Assay의 분석 가능 검체가 서로 다른 타입과 값 체계로 표현되지만, 두 표현 사이의 동일성·계층·변환 의미가 정의되지 않아 검체 호환성을 권위 있게 판정할 수 없다.
  - root cause: 검체 분류의 canonical 의미 체계와 Test-Assay 간 변환 규칙을 선택하지 않았다.
  - materiality: 이 문제는 EMR 주문 요구사항과 LIS 분석 검체의 일관된 의미 교환을 약화시킨다. 구현자가 문자열을 임의로 비교하거나 변환해야 하므로 검체 적합성 판정에서 거짓 일치 또는 거짓 불일치가 발생할 수 있다.
  - action: 출시 전에 두 필드가 참조할 canonical 검체 개념 또는 코드 체계를 먼저 결정해야 한다. 이어 분류 수준이 다르면 명시적인 대응 관계, 허용 변환 규칙과 그 버전 권위를 정의하여 검체 적합성 판정이 문자열 비교가 아니라 모델의 정식 의미 관계를 따르도록 해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 현재와 진화 이후에도 일관되게 해석되는 결과 상태의 개념 권위 제공 Source finding context: EMR/LIS 통합에서 엔티티·상태 의미를 일관되게 해석할 수 있는 개념 권위 문서 제공 Source finding context: Maintaining stable, evolvable state semantics for EMR/LIS integration.
- issue-004: 임상검사 워크플로 전반의 EMR/LIS 통합 개념 권위 제공 Source finding context: Using the ontology as the conceptual authority for EMR/LIS laboratory workflow integration.
- issue-005: 검사 결과 교환과 보고를 위한 운영상 신뢰 가능한 개념 권위 제공 Source finding context: Providing an operationally trustworthy conceptual authority for laboratory result exchange and reporting.
- issue-006: 현재 및 과거 검사 정의와 위험 결과 통보를 일관되게 해석하는 지속 가능한 EMR/LIS 개념 권위 제공 Source finding context: Serving as a durable conceptual authority for EMR/LIS interpretation of current and historical laboratory data. Source finding context: 위험 결과와 통보 상태를 EMR/LIS에서 동일하게 해석하는 개념 권위 제공
- issue-007: EMR/LIS 통합 경계에서 precedence와 공유 의미 확립 Source finding context: Establishing precedence and shared meaning across EMR/LIS integration boundaries.
- issue-010: EMR 주문에서 LIS 수행까지의 통합 개념 권위 제공 Source finding context: Providing the conceptual authority for ordering-to-execution integration between EMR and LIS.
- issue-011: EMR/LIS 코드와 버전 변경을 견디는 지속 가능한 개념 권위 제공 Source finding context: Acting as a durable conceptual authority across EMR/LIS code and version changes.
- issue-013: Order부터 Report까지 이어지는 EMR/LIS 임상검사 파이프라인의 개념 권위 제공 Source finding context: EMR/LIS 연동 설계의 개념 권위 문서 Source finding context: Order부터 Report까지의 임상검사 파이프라인을 EMR/LIS 연동 설계의 개념 권위 문서로 제공하는 목적
- issue-014: 임상의가 신뢰할 수 있는 EMR/LIS 결과 상태의 개념 권위 제공
- issue-002: EMR의 주문 카탈로그와 LIS의 수행 카탈로그를 연결하는 개념 권위 제공
- issue-008: EMR/LIS 교환과 임상 활용을 위한 개념적으로 유효한 결과 의미 제공 Source finding context: Providing conceptually valid result semantics for EMR/LIS exchange and downstream clinical use.
- issue-009: 새 검사 분류를 수용하면서 EMR/LIS 통합의 개념 권위로 기능 Source finding context: Serving as the conceptual authority for EMR/LIS integration while accommodating new laboratory categories.
- issue-012: EMR/LIS 통합에서 주문과 결과 상태의 개념 권위 제공 Source finding context: EMR/LIS 통합에서 주문·결과 상태의 개념 권위 문서로 사용되는 목적
- issue-015: EMR/LIS 간 주문 긴급도의 일관된 의미 전달
- issue-016: 검체, 검사 수행 및 결과 사이의 의미적으로 정확한 통합 관계 제공 Source finding context: 검체, 검사 수행, 결과 사이의 의미적으로 정확한 통합 관계 제공
- issue-017: EMR 주문 요구사항과 LIS 분석 검체의 일관된 의미 교환

## Final Review Result
16 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result와 Report에 중복 저장된 상태 권위와 야간 동기화 때문에 정정 직후뿐 아니라 상태 어휘 변경·비동기 배포 중에도 EMR과 LIS가 서로 다른 상태를 권위 값으로 노출할 수 있다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 경계 내 자료에는 enum 변경 시의 구체적인 배포 호환성 및 마이그레이션 절차가 명시되어 있지 않다.
- 부서별 규칙의 구체적 내용은 허용된 증거 범위 밖이지만, 그 존재만으로 공유 개념 권위의 누락이 해소되지는 않는다.
- 별도 전화 원장의 스키마와 신뢰성은 이 검토 경계 밖이므로 평가하지 않았다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-010 (high): fix_now
- issue-011 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now, accept_risk
- issue-002 (medium): fix_before_release, accept_risk, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, accept_risk, fix_now
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_before_release, accept_risk, fix_now

## Recommendations
- issue-018 (medium): 위험 값 통보 상태가 실제 Result 및 수신자·시각 증거에 연결되지 않아 통보 이력을 추적할 수 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue 통보 연결 구조 Source finding context: materialized-input.md:62-84,100-119 Source finding context: CriticalValue의 통보 상태가 실제 Result 및 통보 기록과 연결되지 않아 위험 결과의 통보 이력을 워크플로에서 추적할 수 없다. Source finding context: 즉시 통보 대상이라는 정의에도 불구하고 통보 여부를 특정 결과 인스턴스에 귀속할 구조가 없다. 전화 기록 대장을 언급할 뿐 해당 기록을 나타내는 엔티티나 참조도 없어 Result부터 통보 증거까지의 경로가 끊긴다. Source finding context: 임계치 정의와 임계치 발생/통보 기록을 분리하고, 발생 기록을 Result에 연결한다. 통보 기록에는 시각과 수신자 참조를 포함해 Result→임계치 발생→통보의 추적 경로를 선언한다. Source finding context: .onto/review/20260718-10efada9/round1/structure.findings.yaml#structure-candidate-002 Source finding context: 임상검사 결과와 운영 상태를 연결된 개념 모델로 정의하여 EMR/LIS 통합의 권위 문서로 사용하는 목적 Source finding context: 특정 위험 Result에 대해 즉시 통보가 수행되었는지 통합 시스템이 판별하거나 감사해야 할 때 Source finding context: 통보 여부가 결과 인스턴스와 결합되지 않아 시스템 간 상태 교환과 추적의 기준이 될 수 없고, 동일 Test의 여러 결과 사이에서 통보 상태가 모호해진다. Source finding context: CriticalValue에 Result 및 통보 기록으로 이어지는 관계가 선언되지 않았다. Source finding context: `notified` 상태를 특정 Result나 수신자·시각 기록에 귀속할 구조적 경로가 없다. Source finding context: CriticalValue는 Test만 참조하며 Result 또는 별도 통보 기록 엔티티와의 관계가 누락되어 있다.
- issue-003 (info): 사용자 목적을 넘어선 axiology 판단에 필요한 upstream authority evidence가 현재 경계에 없다. Source finding context: axiology 실행의 가치 권위 바인딩 Source finding context: prompt packet §Authoritative alignment input 및 §Finding evidence requirements; review-value-alignment-criteria.yaml:5-20; value_authority_anchor={source: prompt packet, anchor: §Authoritative alignment input/Binding timing, excerpt: "authority 파일 미존재 또는 읽기 실패 → finding은 insufficient evidence + upstream_evidence_required=true"}; value_type=boundary; alignment_direction=indeterminate Source finding context: 필수 canonical 가치 권위가 제공되지 않아 사용자 목적을 넘어선 axiology 판단은 불충분한 증거 상태다. Source finding context: 따라서 위 두 finding은 확인된 사용자 목적과 대상 자체의 선언에 한정된다. onto의 상위 제품 원칙이나 개념 SSOT와의 정렬 여부는 현재 경계에서 판정할 수 없다. Source finding context: 후속 axiology 실행 전에 필수 authority source set을 prompt packet 또는 허용된 context input에 materialize하고 안정적인 term/section anchor를 제공한다. Source finding context: .onto/review/20260718-10efada9/round1/axiology.findings.yaml#axiology-candidate-003

## Unique Finding Tagging
- issue-018 (medium): 위험 값 통보 상태가 실제 Result 및 수신자·시각 증거에 연결되지 않아 통보 이력을 추적할 수 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue 통보 연결 구조 Source finding context: materialized-input.md:62-84,100-119 Source finding context: CriticalValue의 통보 상태가 실제 Result 및 통보 기록과 연결되지 않아 위험 결과의 통보 이력을 워크플로에서 추적할 수 없다. Source finding context: 즉시 통보 대상이라는 정의에도 불구하고 통보 여부를 특정 결과 인스턴스에 귀속할 구조가 없다. 전화 기록 대장을 언급할 뿐 해당 기록을 나타내는 엔티티나 참조도 없어 Result부터 통보 증거까지의 경로가 끊긴다. Source finding context: 임계치 정의와 임계치 발생/통보 기록을 분리하고, 발생 기록을 Result에 연결한다. 통보 기록에는 시각과 수신자 참조를 포함해 Result→임계치 발생→통보의 추적 경로를 선언한다. Source finding context: .onto/review/20260718-10efada9/round1/structure.findings.yaml#structure-candidate-002 Source finding context: 임상검사 결과와 운영 상태를 연결된 개념 모델로 정의하여 EMR/LIS 통합의 권위 문서로 사용하는 목적 Source finding context: 특정 위험 Result에 대해 즉시 통보가 수행되었는지 통합 시스템이 판별하거나 감사해야 할 때 Source finding context: 통보 여부가 결과 인스턴스와 결합되지 않아 시스템 간 상태 교환과 추적의 기준이 될 수 없고, 동일 Test의 여러 결과 사이에서 통보 상태가 모호해진다. Source finding context: CriticalValue에 Result 및 통보 기록으로 이어지는 관계가 선언되지 않았다. Source finding context: `notified` 상태를 특정 Result나 수신자·시각 기록에 귀속할 구조적 경로가 없다. Source finding context: CriticalValue는 Test만 참조하며 Result 또는 별도 통보 기록 엔티티와의 관계가 누락되어 있다.
- issue-003 (info): 사용자 목적을 넘어선 axiology 판단에 필요한 upstream authority evidence가 현재 경계에 없다. Source finding context: axiology 실행의 가치 권위 바인딩 Source finding context: prompt packet §Authoritative alignment input 및 §Finding evidence requirements; review-value-alignment-criteria.yaml:5-20; value_authority_anchor={source: prompt packet, anchor: §Authoritative alignment input/Binding timing, excerpt: "authority 파일 미존재 또는 읽기 실패 → finding은 insufficient evidence + upstream_evidence_required=true"}; value_type=boundary; alignment_direction=indeterminate Source finding context: 필수 canonical 가치 권위가 제공되지 않아 사용자 목적을 넘어선 axiology 판단은 불충분한 증거 상태다. Source finding context: 따라서 위 두 finding은 확인된 사용자 목적과 대상 자체의 선언에 한정된다. onto의 상위 제품 원칙이나 개념 SSOT와의 정렬 여부는 현재 경계에서 판정할 수 없다. Source finding context: 후속 axiology 실행 전에 필수 authority source set을 prompt packet 또는 허용된 context input에 materialize하고 안정적인 term/section anchor를 제공한다. Source finding context: .onto/review/20260718-10efada9/round1/axiology.findings.yaml#axiology-candidate-003

## Shared Phenomenon Summary
- none
