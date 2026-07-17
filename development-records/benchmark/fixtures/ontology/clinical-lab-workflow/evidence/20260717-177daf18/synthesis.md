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
- issue-005 (high): 검증·보고서 공개·결과 정정·위험 결과 통보를 현재 상태 속성만으로 표현해서는 누가 언제 어떤 근거로 상태를 바꾸었는지 추적할 수 없다. 이 통제 행위들을 대상, 행위자, 발생 시각, 근거와 상태 변화에 연결된 독립 감사 사건으로 모델링해야 한다.
  - root cause: 상태 속성은 정의했지만 상태를 발생시킨 통제 사건과 그 증거를 독립 개념으로 모델링하지 않은 것이 감사 추적 결손을 만든다.
  - materiality: EMR/LIS 통합의 개념 권위는 핵심 임상 통제의 책임과 이력을 시스템 간에 교환하고 사후 재구성할 수 있어야 한다. 현재 모델에서는 corrected, released, notified 등의 상태가 있어도 그 상태를 만든 책임자·시각·근거를 일관되게 확인할 수 없어 감사 가능성과 운영상 책임 추적이 끊긴다.
  - action: 검증·보고서 공개·결과 정정·위험 결과 통보를 독립 감사 사건으로 추가하고 각 사건을 대상, actor, occurred_at, reason/evidence 및 이전·이후 상태와 연결해야 한다. 먼저 공통 감사 사건 계약을 정의한 뒤 각 통제 행위에 적용하고, 외부 전화 기록을 근거로 사용할 경우에는 그 기록의 권위 시스템과 안정적인 참조도 함께 모델링해야 전체 감사 경로를 재구성할 수 있다.
- issue-006 (high): Result의 검증 상태와 Report의 발행·개정 상태는 서로 다른 상태 차원인데도 동일 정보의 복제본처럼 관리되어 의미와 권위가 충돌한다. 각 차원을 분리하고 차원별 단일 권위와 결정적 전이 규칙을 정의해야 한다.
  - root cause: Result 검증 상태와 Report 발행·개정 상태를 별도 차원으로 모델링하지 않고 복제된 하나의 상태로 취급한 것이 권위 충돌과 의미 혼합을 함께 발생시킨다.
  - materiality: Result가 corrected로 바뀐 뒤 야간 동기화가 지연·실패하거나 Report 상태가 독립적으로 변하면 LIS와 임상의 화면이 서로 다른 최종성·정정 의미를 사실로 제시한다. 이는 EMR/LIS 간 상태를 일관되게 해석하고 개념 권위를 제공하려는 목적을 직접 훼손하며, 정정 결과의 적시 인지와 후속 의사결정의 신뢰를 떨어뜨린다.
  - action: Result 검증 상태와 Report 발행·개정 상태를 먼저 별도 개념으로 분리하고 각각의 단일 권위와 소유 시스템을 지정해야 한다. 그다음 corrected Result가 amended Report를 생성하는 명시적 이벤트·전이 매핑을 정의하고, enum 매핑, 갱신 시점, 배치 실패와 재시도, 역순 이벤트와 충돌의 우선순위, 정정 전파 완료 조건을 결정적으로 규정해야 한다. 이 조치는 목표 산출물 안에서 즉시 닫아야 한다.
- issue-007 (high): Test와 Assay를 독립적으로 중복 등록하고, 그 대응 관계와 권위 있는 정본, 정의·임계값의 버전 및 유효기간을 두지 않아 과거 주문·결과에 적용된 의미와 판정 기준을 재구성할 수 없다.
  - root cause: 카탈로그 정의를 버전이 있는 권위 개념으로 모델링하지 않고 Test와 Assay를 독립된 중복 등록부로 남긴 것이 시간적 재현성 결손을 만든다.
  - materiality: EMR과 LIS가 동일한 검사 항목, 실제 수행 정의, 위험 임계값을 시간에 따라 일관되게 해석해야 한다는 목적을 직접 훼손한다. 두 카탈로그가 어긋나거나 정의·임계값이 변경되면 코드 매핑과 임상 판정 기준의 재현성이 사라지고 시스템 간 의미 불일치가 누적되므로 중대한 현재 차단 문제다.
  - action: 주문 카탈로그와 수행 정의 사이에 권위 있는 정식 매핑을 만들고 단일 정본을 지정해야 한다. TestDefinition, AssayDefinition, CriticalValuePolicy에는 version, effective_from, effective_to 및 변경 이력을 두고, Order 또는 Result가 실제 적용 버전을 명시적으로 참조하게 해야 한다. 먼저 issue-002와 공유된 원인인 주문 단위–수행 단위의 정본·매핑을 일관되게 정리한 뒤 그 권위 위에 버전과 유효기간을 적용해야 중복된 권위 모델을 만들지 않고 과거 의미를 재현할 수 있다.
- issue-009 (high): Result가 문자열 값과 단위 중심의 최소 레코드로 모델링되어 자료형, 참고범위, 이상·위험 판정, 검사법, 적용 정책을 보존하지 못하므로 임상 결과의 의미와 판정 근거를 EMR/LIS 간에 동일하게 전달할 수 없다.
  - root cause: Result를 임상 관찰 및 판정 개념이 아니라 문자열 값 중심의 최소 레코드로 모델링한 것이 해석 근거를 누락시킨다.
  - materiality: 정량·정성 결과의 구분과 이상·위험 판정은 값 자체뿐 아니라 참고범위, 검사법, 검체 조건 및 적용 기준에 좌우된다. 이 맥락이 빠지면 값은 전송되어도 수신 시스템이 동일한 임상 의미로 해석하거나 위험 판정의 근거를 재현할 수 없어, 결과와 판정 근거를 손실 없이 공유하려는 목적이 직접 훼손된다.
  - action: 현재 차단 이슈로서 대상 범위에서 반드시 수정해야 한다. 먼저 Result를 값 유형별 임상 관찰 구조로 확장하고 참고범위, 이상·위험 해석, 수행 Assay 또는 검사법, 적용 정책 버전 참조를 포함해야 한다. 이어서 CriticalValuePolicy가 특정 Result 판정에 사용되었음을 나타내는 명시적 관계와 판정 사건을 정의해 판정 근거와 변경 이력을 재현 가능하게 해야 한다.
- issue-010 (high): Test와 Assay를 독립 카탈로그로 관리하면서 버전 가능한 권위 매핑을 두지 않아, 검사 추가·코드 교체·카탈로그 통합 시 주문 개념과 수행 정의의 정체성 연속성이 끊긴다.
  - root cause: Test와 Assay를 별도 등록 대상으로 두면서 둘 사이의 버전 가능한 권위 매핑을 모델링하지 않은 것이 변경 시 정체성 연속성을 깨뜨린다.
  - materiality: 이 결손은 EMR과 LIS가 동일 주문·결과를 서로 다르게 해석하게 하거나 과거 결과가 어떤 수행 정의로 생성됐는지 재구성하지 못하게 한다. 따라서 주문 개념과 실제 수행 항목의 권위 있는 대응 및 변경 이력을 제공하려는 목적을 직접 약화한다.
  - action: Test는 주문 가능한 임상 개념으로, Assay는 버전 가능한 수행 정의로 유지한 뒤 둘 사이에 유효기간, 상태, 매핑 버전 및 대체 관계를 가진 권위 매핑 엔티티를 도입해야 한다. 이어 신규 등록의 단일 권위 지점을 정하고 과거 매핑을 변경·삭제하지 않고 보존하는 규칙을 적용해야 변경 이후에도 기존 주문과 결과를 재구성할 수 있다.
- issue-015 (high): 재사용되는 임계값 규칙과 개별 Result의 통보 사건을 분리해야 한다. 현재 CriticalValue의 공유 notified 상태는 특정 위험 결과의 통보 여부를 정확히 표현하지 못한다.
  - root cause: 임계값 규칙과 결과별 통보 사건을 존재론적으로 구분하지 않은 것이 규칙 수준 상태를 결과별 이력처럼 오해하게 만든다.
  - materiality: 동일한 test_ref의 임계값 규칙이 여러 Result에 적용되면 한 결과의 통보 상태가 규칙 자체의 notified 값으로 기록되어 다른 미통보 결과까지 통보 완료로 해석될 수 있다. 이는 위험 결과와 즉시 통보 상태를 EMR/LIS 간 일관되게 해석하려는 개념 권위를 훼손하고 환자 안전 위험을 만든다.
  - action: 임계값 정의를 CriticalValueRule로 분리하고, 각 위험 Result에 귀속되는 CriticalNotification 또는 CriticalResultOccurrence를 별도로 모델링해야 한다. 사건에는 해당 Result, 통보 시각, 수신자와 상태를 연결해야 하며, 규칙 분리를 먼저 확립한 뒤 결과별 사건과 당시 적용 규칙의 관계를 명시해야 통보 이력과 규칙 변경 이력을 독립적으로 보존·재구성할 수 있다.
- issue-018 (high): AssayExecution 부재로 Order–Test에서 실제 검사 수행과 Result로 이어지는 계보가 끊겼고, 그 빈자리를 Specimen.produces가 잘못 대신하고 있다. 명시적인 Test–Assay 매핑과 실행 개념을 도입하고 Specimen은 입력·근거로만 표현해야 한다.
  - root cause: 검사 수행 또는 AssayExecution 개념을 워크플로 그래프에 배치하지 않은 것이 Assay의 운영 단절과 Specimen에 잘못 부여된 결과 생성자 역할을 함께 만든다.
  - materiality: 주문된 Test를 분석기 수행 단위로 변환하거나 Result를 주문 항목과 검체로 역추적할 수 없어 구현자가 외부 매핑을 임의로 만들어야 한다. 또한 수동적 검체가 결과 생성자로 표현되어 수행 방법과 분석기 단위의 의미가 사라지므로, Order부터 Report까지 정확한 계보를 제공해야 하는 EMR/LIS 통합 개념 권위가 약화된다.
  - action: 먼저 Test–Assay의 정규 매핑과 명시적 카디널리티를 결정해야 한다. 이어 AssayExecution을 도입해 주문된 Test 및 Assay와 연결하고, 해당 실행이 Specimen을 입력으로 받아 Result를 생산하도록 관계를 구성해야 한다. 기존 Specimen.produces Result는 제거하고 Specimen is_input_to AssayExecution 및 Result derived_from Specimen 같은 입력·근거 관계로 대체해야 한다.
- issue-002 (medium): Test와 Assay를 각각 등록하는 절차만으로는 EMR의 주문 단위와 LIS의 수행 단위 사이에 권위 있는 대응 관계가 성립하지 않는다. 통합 구현 전에 두 개념의 명시적이고 버전 가능한 매핑과 등록 책임을 확립해야 한다.
  - root cause: 서로 다른 생명주기와 책임을 가진 Test와 Assay의 정식 관계와 권위 소유자를 정의하지 않은 채 이중 등록으로 정합성을 유지하려 한 것이 현재 매핑 불확실성을 만든다.
  - materiality: 한쪽 등록이 누락되거나 코드·속성·검체 표현이 달라지면 통합 소비자는 권위 문서만으로 주문 항목과 실제 수행 항목의 정합성 또는 우선할 카탈로그를 판정할 수 없다. 따라서 EMR 주문 개념과 LIS 수행 개념을 연결하는 개념 권위 제공 목적이 약화되고, 매핑이 시스템별 관행에 의존하게 된다.
  - action: 다음 통합 단계 전에 Test–Assay 매핑의 관계 유형과 카디널리티, 유효기간·버전, 각 코드의 소유 시스템 및 등록 책임을 정의해야 한다. 신규 항목은 하나의 명시적 권위 원천에서 시작해 검증 가능한 파생 또는 매핑 절차로 반영하고, 누락·불일치 시 판정 규칙도 계약에 포함해야 한다.
- issue-003 (medium): TAT가 권위 있는 파생 개념이나 단일 규칙 아티팩트에 연결되지 않고 소비자별 구현에 맡겨져 있어, 동일 입력에 서로 다른 TAT 해석이 허용된다. 다음 단계 전에 계산 권위를 단일화해야 한다.
  - root cause: 파생 지표의 의미와 계산 권위를 개념 모델이 아니라 개별 소비자 팀에 배정한 것이 소비자별 TAT 해석 차이를 허용한다.
  - materiality: 이 상태에서는 대시보드 등 소비자가 경계 시각, 포함·제외 조건, 결측 처리, 시간대 등을 독자적으로 정할 수 있다. 그 결과 동일 사례의 TAT가 소비자별로 달라져 운영 지표와 워크플로 판단을 재현하거나 감사하기 어려우며, EMR·LIS·분석 소비자가 동일한 워크플로 의미를 공유한다는 개념 권위의 목적이 약화된다.
  - action: TAT 계산 규칙, 시작·종료 경계, 포함·제외 조건, 결측 처리, 시간대 및 버전을 온톨로지나 명시적으로 지정한 단일 권위 아티팩트에 정의하고 TAT 개념과 연결해야 한다. 대시보드를 포함한 모든 소비자는 이 권위 규칙에서 값을 파생하도록 소유권과 변경 절차를 정해야 하며, 이는 지표 소비 단계로 진행하기 전에 완료되어야 한다.
- issue-008 (medium): Specimen lifecycle이 정상 분석 완료에서 끝나 검사 불가 예외와 분석 후 보관·폐기를 공통으로 표현하지 못하므로, 다음 통합 단계 전에 예외·재채취·사후 종결 경로를 완결해야 한다.
  - root cause: 검체 모델을 정상 분석 경로까지만 열거하고 예외 및 사후 보존 구간을 온톨로지 범위 밖으로 위임한 것이 lifecycle 공백을 만든다.
  - materiality: 주문부터 보고까지 검체 처리 전 구간을 EMR/LIS 공통 개념으로 표현하려는 목적과 달리, 부적합·분실 또는 보관·폐기 상황이 통합 계약 밖에 남는다. 그 결과 시스템 간 주문 지연·취소·재채취 및 미완료 원인을 일관되고 신뢰성 있게 공유할 수 없다.
  - action: 다음 통합 단계 전에 Specimen lifecycle에 운송·접수, 부적합·거부, 분실·이용 불가, 보관, 폐기 상태 또는 사건을 추가해야 한다. 재채취·대체 검체 관계, 각 전이의 조건, 발생 시각과 근거도 함께 정의해 예외 및 종결 경로가 주문과 결과 상태에 일관되게 반영되도록 해야 한다.
- issue-011 (medium): 검체 분류가 Specimen과 Test의 폐쇄형 enum 및 Assay 자유 문자열에 분산되어 있어, 새 검체 유형을 일관되게 추가하려면 여러 위치를 동시에 수정해야 한다. 다음 단계 전에 버전 가능한 SpecimenType을 단일 권위로 정규화해야 한다.
  - root cause: 검체 분류를 재사용 가능한 버전형 개념으로 만들지 않고 중복 enum과 자유 문자열로 분산한 것이 확장 시 동시 수정을 요구한다.
  - materiality: 기존 네 범주 밖의 검체나 세부 재료·장비별 표기를 도입할 때 일부 표현만 갱신될 수 있어 주문·채취·수행 계층 간 의미가 달라질 수 있다. 이는 EMR/LIS 전 구간에서 검체 의미를 공유하고 새 범주를 안정적으로 수용하려는 목적을 약화시키므로 material한 문제다.
  - action: 다음 단계로 진행하기 전에 버전 가능한 SpecimenType을 단일 권위로 정의하고 Specimen과 Test가 이를 참조하도록 해야 한다. Assay의 장비별 표현은 별칭 또는 유효기간을 가진 명시적 매핑으로 연결해, 새 유형을 기존 엔티티 구조의 반복 수정 없이 추가하고 과거 문자열 의미도 보존할 수 있게 해야 한다.
- issue-012 (medium): 독립적인 Result 검증 상태와 Report 발행·개정 상태에 안정적이고 진화 가능한 어휘가 없으며, 두 차원 사이의 버전형 전이·투영 계약도 없어 상태 확장과 혼재 버전 운영에서 호환성이 깨질 수 있다.
  - root cause: 동일 의미의 상태를 두 폐쇄형 어휘에 중복 저장하면서 버전 가능한 매핑 계약을 두지 않은 것이 상태 확장 호환성을 깨뜨린다.
  - materiality: 새 상태가 추가되거나 기존 상태의 의미가 바뀌면 값이 거부되거나 일관되지 않게 투영될 수 있다. 그러면 임상의에게 보이는 Report 상태가 LIS의 권위 있는 Result 상태와 장기적으로 분기하여, 결과 상태를 EMR에 지속적이고 예측 가능하게 전달하려는 목적이 약화된다.
  - action: 다음 연동 단계 전에 Result와 Report 각 상태 차원에 안정 식별자와 버전 가능한 어휘를 정의하고, 차원 간 전이·투영을 명시적인 버전 계약으로 만들어야 한다. 계약에는 유효기간과 대체 관계, 미인식 신규 상태의 보존·표시 방식, 구버전 소비자용 호환 매핑이 포함되어야 한다. 이를 먼저 확정해야 상태 추가나 혼재 버전에서도 권위와 투영 결과를 예측 가능하게 유지할 수 있다.
- issue-014 (medium): Order가 completed로 전이한 뒤 Result가 corrected로 바뀔 수 있지만, completed가 종결 상태인지 과거 완료 사건인지와 정정 후 상태 전이가 정의되지 않아 EMR과 LIS가 서로 다른 Order 상태를 계산할 수 있다.
  - root cause: 완료 판정이 후속 변경 가능한 상태에 의존하면서 completed의 불변성 및 정정 후 전이를 형식화하지 않은 것이 Order 상태 모호성을 만든다.
  - materiality: 이 누락은 정정 이후의 완료 여부와 후속 처리 가능성을 시스템마다 다르게 해석하게 하므로, EMR/LIS가 공유할 Order 상태 모델의 일관성과 실행 가능성을 약화한다.
  - action: 다음 단계 전에 completed의 양상을 결정하고 권위 규칙으로 명시해야 한다. completed가 종결 불변식이면 correction 발생 시 Order를 재개하는 전이와 재완료 조건을 정의하고, 이력 사건이면 completion 시점과 현재 Result 상태를 분리하여 corrected 이후에도 과거 완료 기록이 유효한 이유 및 현재 후속 처리 가능성을 정의해야 한다.
- issue-016 (medium): STAT은 주문의 본질적 유형이 아니라 변경 가능한 우선순위이므로, Order.priority를 유일한 권위로 두고 is_stat과 StatOrder를 파생 표현으로 정리해야 한다.
  - root cause: 긴급도라는 하나의 비본질적 분류를 속성·파생값·하위 타입으로 구분 없이 중복 모델링한 것이 복수 권위를 만든다.
  - materiality: priority, is_stat, 인스턴스 타입이 독립적으로 갱신되거나 EMR과 LIS가 서로 다른 표현을 권위로 삼으면 동일 주문의 긴급도와 STAT 사유가 다르게 해석된다. 이는 두 시스템이 주문 우선순위를 동일하게 분류해야 한다는 목적을 직접 약화한다.
  - action: 다음 통합 단계 전에 Order.priority를 단일 권위로 확정해야 한다. is_stat은 priority=stat에서 계산되는 파생값으로 정의하거나 제거하고, stat_reason은 priority=stat일 때만 유효한 조건부 속성으로 둔다. StatOrder가 필요하다면 영속 하위 타입이 아니라 priority에서 파생되는 역할 또는 뷰로 정의해 독립 갱신과 정체성 혼선을 차단해야 한다.
- issue-017 (medium): Test와 Assay는 각각 주문 가능 단위와 실행 가능 단위로 의미가 다르므로 동일 항목으로 이중 등록해서는 안 된다. 두 개념 사이의 실현·구성 관계와 카디널리티, 코드 권위 및 등록 책임을 명시해야 한다.
  - root cause: 주문 가능 개념과 실행 가능 개념의 관계를 모델링하지 않고 이중 등록으로 대체한 것이 비동의어 개념을 동일 항목처럼 취급하게 한다.
  - materiality: 일대다 또는 다대일 수행이 필요한 항목에서 동일 등록 정책은 Result가 어떤 Test 주문을 충족하고 어떤 Assay가 실제 수행되었는지 추적하지 못하게 한다. 이로 인해 EMR 주문 카탈로그와 LIS 수행 카탈로그 간 의미 매핑의 권위, 코드 매핑의 신뢰성, 결과 해석의 정확성이 약화된다.
  - action: 다음 통합 단계 전에 Test를 실현하는 Assay 또는 Assay 조합을 나타내는 명시적 관계와 허용 카디널리티를 정의해야 한다. 이어 Test와 Assay 각각의 코드 권위와 등록 책임을 지정하고, ‘양쪽 모두 동일 등록’ 정책을 관계에 근거한 매핑 생성 정책으로 대체해야 한다. 이는 비일대일 수행에서도 주문·수행·결과 계보를 보존하기 위해 필요한 선행 조치다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: resolved
- issue-014: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-005: EMR/LIS 통합에서 검사 결과의 검증·공개·정정·통보를 추적할 수 있는 개념 권위 제공
- issue-006: EMR/LIS 간 결과와 보고 상태의 일관된 해석 및 개념 권위 제공 Source finding context: EMR/LIS 간 결과 상태의 일관된 해석과 권위 제공 Source finding context: EMR/LIS 통합에서 결과와 보고 상태의 개념 권위를 제공하는 목적
- issue-007: EMR/LIS가 검사 항목, 수행 정의 및 위험 임계값을 시간에 따라 일관되게 해석하는 개념 권위 제공 Source finding context: EMR/LIS가 동일한 검사 항목, 수행 정의 및 위험 임계값을 시간에 따라 일관되게 해석하는 개념 권위 제공
- issue-009: EMR/LIS 간 검사 결과의 임상적 의미와 판정 근거를 손실 없이 공유하는 개념 권위 제공
- issue-010: EMR/LIS 연동에서 주문 개념과 실제 수행 항목의 권위 있는 대응 및 변경 이력을 제공하는 목적
- issue-015: 위험 결과와 즉시 통보 상태를 EMR/LIS 간 일관되게 해석하는 개념 권위
- issue-018: Order부터 Report까지 검사 수행과 결과 계보를 정확히 전달하는 EMR/LIS 통합 개념 권위 Source finding context: 검체에서 수행과 결과까지의 계보를 정확히 전달하는 EMR/LIS 개념 권위 Source finding context: Use of the ontology as the conceptual authority for EMR/LIS integration from Order through Report.
- issue-002: EMR의 주문 개념과 LIS의 수행 개념을 연결하는 개념 권위 제공
- issue-003: EMR/LIS 및 분석 소비자가 동일한 워크플로 개념을 공유하도록 하는 개념 권위
- issue-008: 주문부터 보고까지 검체 처리 전 구간을 EMR/LIS 공통 개념으로 표현
- issue-011: EMR/LIS 전 구간에서 검체 의미를 공유하고 새 검체 범주를 안정적으로 수용하는 목적
- issue-012: LIS 결과 상태를 EMR 보고 상태로 지속적이고 예측 가능하게 전달하는 목적
- issue-014: EMR/LIS가 공유할 Order 상태 모델의 일관된 해석
- issue-016: 주문 우선순위를 EMR/LIS가 동일하게 분류하는 개념 권위
- issue-017: EMR 주문 카탈로그와 LIS 수행 카탈로그 간 의미 매핑의 권위 제공

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-005 (high) — 검증·보고서 공개·결과 정정·위험 결과 통보를 현재 상태 속성만으로 표현해서는 누가 언제 어떤 근거로 상태를 바꾸었는지 추적할 수 없다. 이 통제 행위들을 대상, 행위자, 발생 시각, 근거와 상태 변화에 연결된 독립 감사 사건으로 모델링해야 한다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 LIS와 EMR이 별도 매핑 테이블을 운영하는지는 경계 내 자료로 확인할 수 없지만, 검토 대상 문서 자체에는 해당 권위 정보가 없다.
- 전화 기록 대장의 실제 식별자와 보존 계약은 현재 검토 경계에서 확인할 수 없다.
- 제한된 근거에는 의도된 Test–Assay 카디널리티와 기존 외부 카탈로그 매핑의 존재 여부가 확정되어 있지 않다.

## Immediate Actions Required
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-010 (high): fix_now
- issue-015 (high): fix_now
- issue-018 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, fix_now
- issue-014 (medium): fix_before_release, accept_risk
- issue-016 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_before_release, fix_now

## Recommendations
- issue-001 (high): 임상의가 신뢰하는 권위 상태를 별도로 복제하고 야간에 동기화하는 설계는 EMR/LIS 개념 권위 문서라는 목적과 어긋난다. Source finding context: clinical-lab-ontology.yaml의 Result.status, Report.result_status 및 corrected 동기화 규칙 Source finding context: .onto/review/20260717-177daf18/execution-preparation/materialized-input.md:69-83,121-123; .onto/review/20260717-177daf18/execution-preparation/review-value-alignment-criteria.yaml:6-18 (criterion_id=user-request-intent) Source finding context: 문서 자체가 Report.result_status를 임상의가 신뢰하는 권위 값으로 선언한다. 그런데 권위 값이 원천 변경을 즉시 반영하지 않도록 허용하므로 통합 소비자는 같은 시점에 상충하는 상태를 받게 되고 어느 값을 따라야 하는지 안정적으로 판단할 수 없다. Source finding context: 결과 상태의 단일 권위 원천을 정하고 Report 상태는 그 원천에서 결정적으로 투영하거나 동일 트랜잭션·이벤트에서 갱신한다. 보고서 생명주기와 결과 개정 상태가 별개라면 명시적으로 분리하고 허용 가능한 조합 및 전이 규칙을 정의한다. Source finding context: .onto/review/20260717-177daf18/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: EMR/LIS 연동 설계에서 엔티티·관계·상태 모델의 개념 권위를 제공하는 목적 Source finding context: Result.status가 corrected로 변경된 후 야간 동기화가 실행되기 전까지 Report.result_status가 finalized로 유지되는 경우 Source finding context: 권위 문서가 상충하는 현재 상태를 허용하여 임상의와 통합 시스템이 오래된 finalized 상태를 신뢰할 수 있으므로 운영 판단과 연동 계약의 신뢰성이 직접 약화된다. Source finding context: 동일 의미의 상태를 두 권위 필드에 복제하고 비동기 야간 배치로 일관성을 보정하도록 설계함 Source finding context: corrected Result와 finalized Report가 배치 전까지 동시에 존재할 수 있다. Source finding context: 이 불일치는 Result.status와 Report.result_status가 각각 저장되고 서로 다른 어휘를 사용하는 구조의 증상이다. Source finding context: 복제 상태의 일관성을 즉시 강제하지 않고 야간 동기화에 맡긴 선택이 상충 상태를 발생시킨다.
- issue-013 (high): Report.result_status의 지속적 권위·동일성 요구와 야간 배치 동기화는 정정 후 배치 전 구간에서 동시에 만족될 수 없다. Source finding context: clinical-lab-ontology.yaml — Result/Report status authority and synchronization rules Source finding context: materialized-input.md:69-83,121-123 Source finding context: 문서는 Result 상태와 Report 상태에 동일 정보가 유지된다고 선언하고 Report 값을 권위 값으로 지정합니다. 그러나 명시된 지연 동기화는 corrected와 finalized가 공존하는 시간 경로를 허용하므로, 지속적 동일성·권위 보장과 양립하지 않습니다. Source finding context: 상태 권위를 한 곳으로 단일화하고 Report 상태를 즉시 파생하거나 원자적으로 갱신하십시오. 야간 배치를 유지해야 한다면 Report를 권위 값으로 선언하지 말고 pending_sync 같은 명시적 비권위 상태와 일관성 시점을 정의하십시오. Source finding context: .onto/review/20260717-177daf18/round1/logic.findings.yaml#logic-candidate-001 Source finding context: EMR/LIS 통합에서 임상의가 신뢰할 결과 상태의 개념 권위를 제공하는 목적 Source finding context: Result가 corrected로 변경된 뒤 다음 야간 동기화 전까지 Report.result_status가 finalized로 남는 경우 Source finding context: 두 시스템이 서로 다른 상태를 정당한 권위 값으로 노출하여 정정 결과의 해석과 후속 처리가 달라질 수 있습니다. Source finding context: 지연 동기화되는 복제 필드를 지속적 권위 값으로 동시에 선언했습니다. Source finding context: 정정 직후 Result.status는 corrected이지만 Report.result_status는 다음 배치까지 finalized일 수 있습니다. Source finding context: 이 불일치 구간에도 Report.result_status는 임상의가 신뢰하는 권위 값입니다. Source finding context: Result와 Report에 동일 정보가 유지된다는 필요조건을 지연 배치가 위반합니다.
- issue-004 (medium): 즉시 통보 사건의 핵심 증거를 외부 전화 기록에 두고 온톨로지에는 boolean만 남겨 운영 권위를 약화한다. Source finding context: clinical-lab-ontology.yaml의 CriticalValue 통보 모델 Source finding context: .onto/review/20260717-177daf18/execution-preparation/materialized-input.md:100-106; .onto/review/20260717-177daf18/execution-preparation/review-value-alignment-criteria.yaml:6-18 (criterion_id=user-request-intent) Source finding context: 즉시 통보가 필요한 사건의 핵심 증거를 전화 기록 대장에 분리하고 온톨로지에는 boolean만 남긴 선택은 EMR/LIS 운영 권위라는 목적을 약화한다. Source finding context: 통합 시스템은 boolean만으로 어떤 결과가 언제 누구에게 전달되었는지 판별하거나 재통보 필요성을 검증할 수 없다. 즉시 통보라는 선언된 목적보다 기존 전화 기록의 편의가 우선되어 운영 사실의 권위가 분할된다. Source finding context: CriticalValue 임계값 정책과 실제 CriticalValueNotification 사건을 분리한다. 사건을 특정 Result에 연결하고 통보 시각, 수신자, 채널, 확인 상태 및 재시도 이력을 권위 모델에 포함하거나 명시된 단일 감사 원천으로 연결한다. Source finding context: .onto/review/20260717-177daf18/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 운영 위험을 포함한 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 표현하는 목적 Source finding context: critical 결과의 통보 여부를 EMR/LIS가 검증하거나 후속 조치해야 하는 경우 Source finding context: 통합 소비자가 대상 결과와 통보 증거를 권위 문서의 모델만으로 식별할 수 없어 즉시 통보 상태의 신뢰성과 감사 가능성이 약화된다. Source finding context: 임계값 정책과 실제 통보 사건을 하나의 CriticalValue 엔티티 및 boolean 상태로 축약하고 상세 권위를 외부 장부에 둠 Source finding context: 모델에는 notified boolean만 있고 통보 시각과 수신자는 외부 전화 기록 대장에 있다. Source finding context: CriticalValue와 개별 Result를 연결하는 관계도 없어 boolean이 어느 결과 사건의 통보를 뜻하는지 닫히지 않는다. Source finding context: 이는 재사용 가능한 임계값 정의와 발생별 통보 사건을 구분하지 않고 운영 증거를 모델 밖에 둔 선택의 증상이다.
- issue-019 (medium): CriticalValue 통보 상태에 유발 Result와 통보 참여자를 식별하는 관계가 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue notification structure Source finding context: materialized-input.md lines 100-106 and 108-119 Source finding context: CriticalValue notification state lacks the relationships needed to identify the triggering result and notification participants. Source finding context: A threshold-level Test reference can identify which catalog item a range applies to, but it cannot identify which concrete result triggered notification or who was notified. Thus the declared notified state cannot be traced through the EMR/LIS workflow and may be interpreted as a shared property of the threshold rather than an event tied to one result. Source finding context: Separate the threshold definition from a result-specific critical-notification record. Relate that record at minimum to the triggering Result and notification recipient, and model time/status and responsible Staff as attributes or references; alternatively, add an explicit authoritative relation to the external notification-log concept. Source finding context: .onto/review/20260717-177daf18/round1/structure.findings.yaml#structure-candidate-002 Source finding context: Use of the ontology as an operationally reliable conceptual authority for EMR/LIS workflow integration. Source finding context: When a concrete critical result is detected and systems must exchange or reconcile whether its required notification occurred. Source finding context: The ontology cannot structurally associate notification completion with the triggering result or participants, so integrations may update or interpret the boolean against the wrong scope. Source finding context: A result-specific notification event is represented only as a boolean on the threshold entity, with its detailed record left outside the ontology graph. Source finding context: CriticalValue.notified has no reference or relation to a concrete Result or notification participant. Source finding context: The missing links are a symptom of notification details being delegated to a prose-only telephone-log reference that is not modeled as an entity or relation.

## Unique Finding Tagging
- issue-001 (high): 임상의가 신뢰하는 권위 상태를 별도로 복제하고 야간에 동기화하는 설계는 EMR/LIS 개념 권위 문서라는 목적과 어긋난다. Source finding context: clinical-lab-ontology.yaml의 Result.status, Report.result_status 및 corrected 동기화 규칙 Source finding context: .onto/review/20260717-177daf18/execution-preparation/materialized-input.md:69-83,121-123; .onto/review/20260717-177daf18/execution-preparation/review-value-alignment-criteria.yaml:6-18 (criterion_id=user-request-intent) Source finding context: 문서 자체가 Report.result_status를 임상의가 신뢰하는 권위 값으로 선언한다. 그런데 권위 값이 원천 변경을 즉시 반영하지 않도록 허용하므로 통합 소비자는 같은 시점에 상충하는 상태를 받게 되고 어느 값을 따라야 하는지 안정적으로 판단할 수 없다. Source finding context: 결과 상태의 단일 권위 원천을 정하고 Report 상태는 그 원천에서 결정적으로 투영하거나 동일 트랜잭션·이벤트에서 갱신한다. 보고서 생명주기와 결과 개정 상태가 별개라면 명시적으로 분리하고 허용 가능한 조합 및 전이 규칙을 정의한다. Source finding context: .onto/review/20260717-177daf18/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: EMR/LIS 연동 설계에서 엔티티·관계·상태 모델의 개념 권위를 제공하는 목적 Source finding context: Result.status가 corrected로 변경된 후 야간 동기화가 실행되기 전까지 Report.result_status가 finalized로 유지되는 경우 Source finding context: 권위 문서가 상충하는 현재 상태를 허용하여 임상의와 통합 시스템이 오래된 finalized 상태를 신뢰할 수 있으므로 운영 판단과 연동 계약의 신뢰성이 직접 약화된다. Source finding context: 동일 의미의 상태를 두 권위 필드에 복제하고 비동기 야간 배치로 일관성을 보정하도록 설계함 Source finding context: corrected Result와 finalized Report가 배치 전까지 동시에 존재할 수 있다. Source finding context: 이 불일치는 Result.status와 Report.result_status가 각각 저장되고 서로 다른 어휘를 사용하는 구조의 증상이다. Source finding context: 복제 상태의 일관성을 즉시 강제하지 않고 야간 동기화에 맡긴 선택이 상충 상태를 발생시킨다.
- issue-013 (high): Report.result_status의 지속적 권위·동일성 요구와 야간 배치 동기화는 정정 후 배치 전 구간에서 동시에 만족될 수 없다. Source finding context: clinical-lab-ontology.yaml — Result/Report status authority and synchronization rules Source finding context: materialized-input.md:69-83,121-123 Source finding context: 문서는 Result 상태와 Report 상태에 동일 정보가 유지된다고 선언하고 Report 값을 권위 값으로 지정합니다. 그러나 명시된 지연 동기화는 corrected와 finalized가 공존하는 시간 경로를 허용하므로, 지속적 동일성·권위 보장과 양립하지 않습니다. Source finding context: 상태 권위를 한 곳으로 단일화하고 Report 상태를 즉시 파생하거나 원자적으로 갱신하십시오. 야간 배치를 유지해야 한다면 Report를 권위 값으로 선언하지 말고 pending_sync 같은 명시적 비권위 상태와 일관성 시점을 정의하십시오. Source finding context: .onto/review/20260717-177daf18/round1/logic.findings.yaml#logic-candidate-001 Source finding context: EMR/LIS 통합에서 임상의가 신뢰할 결과 상태의 개념 권위를 제공하는 목적 Source finding context: Result가 corrected로 변경된 뒤 다음 야간 동기화 전까지 Report.result_status가 finalized로 남는 경우 Source finding context: 두 시스템이 서로 다른 상태를 정당한 권위 값으로 노출하여 정정 결과의 해석과 후속 처리가 달라질 수 있습니다. Source finding context: 지연 동기화되는 복제 필드를 지속적 권위 값으로 동시에 선언했습니다. Source finding context: 정정 직후 Result.status는 corrected이지만 Report.result_status는 다음 배치까지 finalized일 수 있습니다. Source finding context: 이 불일치 구간에도 Report.result_status는 임상의가 신뢰하는 권위 값입니다. Source finding context: Result와 Report에 동일 정보가 유지된다는 필요조건을 지연 배치가 위반합니다.
- issue-004 (medium): 즉시 통보 사건의 핵심 증거를 외부 전화 기록에 두고 온톨로지에는 boolean만 남겨 운영 권위를 약화한다. Source finding context: clinical-lab-ontology.yaml의 CriticalValue 통보 모델 Source finding context: .onto/review/20260717-177daf18/execution-preparation/materialized-input.md:100-106; .onto/review/20260717-177daf18/execution-preparation/review-value-alignment-criteria.yaml:6-18 (criterion_id=user-request-intent) Source finding context: 즉시 통보가 필요한 사건의 핵심 증거를 전화 기록 대장에 분리하고 온톨로지에는 boolean만 남긴 선택은 EMR/LIS 운영 권위라는 목적을 약화한다. Source finding context: 통합 시스템은 boolean만으로 어떤 결과가 언제 누구에게 전달되었는지 판별하거나 재통보 필요성을 검증할 수 없다. 즉시 통보라는 선언된 목적보다 기존 전화 기록의 편의가 우선되어 운영 사실의 권위가 분할된다. Source finding context: CriticalValue 임계값 정책과 실제 CriticalValueNotification 사건을 분리한다. 사건을 특정 Result에 연결하고 통보 시각, 수신자, 채널, 확인 상태 및 재시도 이력을 권위 모델에 포함하거나 명시된 단일 감사 원천으로 연결한다. Source finding context: .onto/review/20260717-177daf18/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 운영 위험을 포함한 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 표현하는 목적 Source finding context: critical 결과의 통보 여부를 EMR/LIS가 검증하거나 후속 조치해야 하는 경우 Source finding context: 통합 소비자가 대상 결과와 통보 증거를 권위 문서의 모델만으로 식별할 수 없어 즉시 통보 상태의 신뢰성과 감사 가능성이 약화된다. Source finding context: 임계값 정책과 실제 통보 사건을 하나의 CriticalValue 엔티티 및 boolean 상태로 축약하고 상세 권위를 외부 장부에 둠 Source finding context: 모델에는 notified boolean만 있고 통보 시각과 수신자는 외부 전화 기록 대장에 있다. Source finding context: CriticalValue와 개별 Result를 연결하는 관계도 없어 boolean이 어느 결과 사건의 통보를 뜻하는지 닫히지 않는다. Source finding context: 이는 재사용 가능한 임계값 정의와 발생별 통보 사건을 구분하지 않고 운영 증거를 모델 밖에 둔 선택의 증상이다.
- issue-019 (medium): CriticalValue 통보 상태에 유발 Result와 통보 참여자를 식별하는 관계가 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue notification structure Source finding context: materialized-input.md lines 100-106 and 108-119 Source finding context: CriticalValue notification state lacks the relationships needed to identify the triggering result and notification participants. Source finding context: A threshold-level Test reference can identify which catalog item a range applies to, but it cannot identify which concrete result triggered notification or who was notified. Thus the declared notified state cannot be traced through the EMR/LIS workflow and may be interpreted as a shared property of the threshold rather than an event tied to one result. Source finding context: Separate the threshold definition from a result-specific critical-notification record. Relate that record at minimum to the triggering Result and notification recipient, and model time/status and responsible Staff as attributes or references; alternatively, add an explicit authoritative relation to the external notification-log concept. Source finding context: .onto/review/20260717-177daf18/round1/structure.findings.yaml#structure-candidate-002 Source finding context: Use of the ontology as an operationally reliable conceptual authority for EMR/LIS workflow integration. Source finding context: When a concrete critical result is detected and systems must exchange or reconcile whether its required notification occurred. Source finding context: The ontology cannot structurally associate notification completion with the triggering result or participants, so integrations may update or interpret the boolean against the wrong scope. Source finding context: A result-specific notification event is represented only as a boolean on the threshold entity, with its detailed record left outside the ontology graph. Source finding context: CriticalValue.notified has no reference or relation to a concrete Result or notification participant. Source finding context: The missing links are a symptom of notification details being delegated to a prose-only telephone-log reference that is not modeled as an entity or relation.

## Shared Phenomenon Summary
- none
