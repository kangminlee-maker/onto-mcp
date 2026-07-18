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
- issue-001 (high): Result 검증 상태와 Report 발행·정정 상태를 서로 다른 개념으로 분리하고, Report 상태를 correction-aware 집계 규칙에 따라 동기식으로 도출해야 한다. 현재의 중복 권위와 야간 동기화는 임상의에게 오래된 상태를 권위 값으로 제시할 수 있는 high 이슈다.
  - root cause: 개별 Result의 검증 상태와 집합 Report의 발행 상태를 동일 정보로 취급해 별도 권위 값으로 중복 저장하고 지연 동기화했기 때문에 상태 불일치가 발생한다.
  - materiality: Result가 corrected로 전이된 뒤에도 야간 배치 전까지 Report.result_status가 finalized로 남을 수 있다. 이때 LIS 원천 상태와 EMR에서 임상의가 신뢰하는 상태가 달라져 최종성·정정 여부에 대한 임상 판단과 EMR/LIS 권위 문서의 신뢰성이 직접 훼손된다.
  - action: 먼저 Result 검증 상태와 Report 발행·정정 상태의 역할 및 권위를 분리해야 한다. 이어 corrected를 미완료 여부와 구분하는 correction-aware 집계 전이표를 정의하고, 여러 Result에서 Report 상태를 동기식으로 도출하거나 정정 이벤트와 원자적으로 amended로 전이해야 한다. 비동기 처리가 불가피하면 지연 중 상태와 EMR 소비자 차단 규칙을 계약에 포함해야 하며, 임상 권위 상태를 제공하기 전에 이 전이·집계 규칙이 먼저 확정되어야 한다.
- issue-006 (high): Result와 Report의 정정·재발행을 현재 상태 덮어쓰기로만 표현해 이전 값과 변경 이력을 재구성할 수 없는 중대한 감사·신뢰 결함이다.
  - root cause: Result와 Report의 변경을 버전 있는 사건·기록이 아니라 덮어쓸 수 있는 현재 상태 속성으로만 모델링했다.
  - materiality: final 결과가 corrected로 바뀌거나 배포된 보고서가 amended로 재발행될 때, 임상의가 어떤 버전을 언제 받았는지와 누가 무엇을 왜 변경했는지 확인할 수 없다. 이에 따라 과거 임상 판단의 근거와 정정 책임을 입증할 수 없어 EMR/LIS 간 결과·보고 상태를 권위 있고 감사 가능하게 정의하려는 목적이 훼손된다.
  - action: 정정과 보고서 배포를 ResultVersion 또는 ResultAmendment, ReportRelease와 같은 버전형 사건으로 먼저 모델링해야 한다. 각 사건에 이전·새 값, 버전, 행위자, 발생·유효 시각, 사유 및 관련 보고서 배포를 보존한 뒤, Result와 Report의 현재 상태를 이 권위 있는 이력에서 도출해야 한다. 그래야 과거 기록과 배포 계보를 유지하면서 현재 상태도 일관되게 제공할 수 있다.
- issue-007 (high): 중대결과 통보를 단일 notified 플래그로 표현해서는 실제 전달과 수신 확인을 검증할 수 없다. 결과별 CriticalValueNotification 사건을 권위 기록으로 모델링하고 완료 상태를 그 사건에서 도출해야 한다.
  - root cause: 중대결과 통보를 행위와 증거가 있는 사건이 아니라 단일 완료 플래그로 축약했다.
  - materiality: 이 결손은 환자안전상 핵심 통제인 중대결과 통보의 대상, 책임자, 수신자, 시각 및 확인 증거를 EMR/LIS가 공통 개념으로 교환하거나 신뢰하지 못하게 한다. 따라서 통보 완료 여부와 책임 이력을 검증할 수 없고, 외부 기록과의 불일치도 판별할 수 없어 선언된 통합 목적을 직접 약화한다.
  - action: 먼저 임계값 정책과 결과별 통보 사건을 분리한 뒤, 각 Result에 연결되는 CriticalValueNotification 사건을 추가해야 한다. 이 사건에는 통보자·수신자, 발생 시각, 방법, 성공 및 확인 상태, 재시도와 근거를 기록하고 외부 기록과 대조 가능한 식별 연결을 마련해야 한다. 이후 notified는 독립 입력값이 아니라 유효한 사건 기록에서 도출해야 통보 책임과 감사 증거의 권위가 일관된다.
- issue-009 (high): Test와 Assay의 대응·권위·버전 계약이 없어 두 카탈로그의 이중 등록 값과 주문 Test의 실제 Assay 수행 관계를 권위 문서에서 판정할 수 없다. 이 문제는 현재 차단 요인이므로 목표 범위에서 즉시 해소해야 한다.
  - root cause: Test와 Assay 병행 관리의 대응 관계, 속성별 권위 및 버전 모델을 후속 과제로 유보했다.
  - materiality: 신규 항목 등록, 카탈로그 변경 또는 주문 Test와 수행 Assay 연결 시 공통 판정 기준이 없다. 따라서 속성 불일치와 잘못된 매핑을 식별할 수 없고 EMR 주문에서 LIS 수행 및 결과까지의 추적성이 약화되어, 두 카탈로그에 공통 개념 권위를 제공한다는 선언 목적을 직접 훼손한다.
  - action: 우선 버전 있는 Test-to-Assay 매핑을 권위 모델에 추가하고 유효기간과 일대다 관계를 정의해야 한다. 이어 대체 Assay와 패널 구성 규칙을 명시하며, 양쪽에 병행되는 각 속성의 권위 시스템과 동기화 방향을 지정해야 한다. 이 순서로 관계와 판정 권위를 먼저 확립해야 신규 등록과 변경 이력을 일관되게 관리하고 주문-수행-결과 추적성을 복원할 수 있다.
- issue-011 (high): Test와 Assay가 독립 카탈로그로 유지되어 변경 시 동일성과 시간적 연속성을 보장할 수 없다. 합의된 판단대로 Test를 권위 주문 개념으로, Assay를 버전형 수행 정의로 연결해야 하는 high 심각도의 즉시 수정 사안이다.
  - root cause: 주문 카탈로그와 수행 카탈로그를 연결하는 권위 관계 및 버전 모델이 없다.
  - materiality: 신규 검사·분석법 추가, 장비 변경 또는 카탈로그 개정 때 두 구조가 서로 다른 시점의 정의를 참조할 수 있다. 그러면 동일 검사에 대한 주문·수행·결과 연결이 분기되어 EMR/LIS 통합 계약과 과거 데이터 해석의 신뢰성이 훼손되므로, 지속 가능한 검사 카탈로그 권위를 제공한다는 목적을 약화한다.
  - action: 먼저 Test를 권위 있는 주문 카탈로그 개념으로 확정하고, Assay를 버전과 유효기간을 가진 수행 정의로 모델링해야 한다. 이어 각 Assay 버전을 해당 Test에 연결하는 명시적 권위 관계와 변경 전후 연속성 규칙을 추가하고, 신규 항목을 두 카탈로그에 독립 등록하는 규칙을 제거해야 한다. 이 순서가 선행되어야 EMR/LIS가 동일한 권위와 시점 기준으로 주문·수행·결과를 연결할 수 있다.
- issue-017 (high): STAT 우선순위를 priority 값, is_stat 불리언, StatOrder 하위 타입이라는 세 개의 독립 권위로 표현하면 동일 주문에 모순된 STAT 상태가 생길 수 있으므로, priority를 유일한 정규 권위로 통합해야 한다.
  - root cause: 상황적 우선순위인 STAT를 하나의 정규 속성 대신 값, 불리언과 하위 타입으로 중복 실체화했다.
  - materiality: EMR과 LIS가 서로 다른 STAT 표현을 소비하거나 두 표현 이상이 불일치하면 동일 주문이 한 시스템에서는 STAT로, 다른 시스템에서는 일반 주문으로 해석될 수 있다. 이는 긴급 라우팅과 처리 순서의 신뢰를 훼손해 주문 우선순위 개념 권위와 환자 안전에 직접 영향을 주므로 중대한 결함이다.
  - action: priority를 STAT 여부의 유일한 저장 권위로 정하고, is_stat은 priority=stat 여부에서 계산되는 파생 속성으로 정의해야 한다. StatOrder가 필요하다면 독립 저장 타입이 아니라 같은 조건으로 생성되는 파생 뷰로 제한해야 한다. 먼저 정규 권위를 확정한 뒤 두 표현의 파생 제약을 적용해야 불일치 상태를 제거하고 EMR/LIS가 같은 긴급 처리 의미를 소비할 수 있다.
- issue-020 (high): 재사용되는 위험값 임계값 정책과 결과별 통보 상태를 하나의 엔티티에 두면 개별 위험 결과와 재통보 이력을 정확히 표현할 수 없다. 두 개념을 분리해야 한다.
  - root cause: 재사용되는 임계값 정책과 결과 발생별 통보 사건의 존재론적 유형을 구분하지 않았다.
  - materiality: 같은 임계값에 해당하는 결과가 여러 건이거나 재통보가 필요할 때 단일 notified 값이 서로 다른 결과의 상태를 공유하게 된다. 이로 인해 미통보 결과가 통보된 것으로 해석될 수 있어, 위험 결과 판정과 통보 책임에 대한 개념 권위가 약화되고 환자 안전 위험이 발생한다.
  - action: 먼저 임계값 정의를 재사용 가능한 CriticalValueThreshold 정책으로 분리하고, 각 위험 결과에 대해 CriticalResultOccurrence 또는 Notification 사건을 생성해야 한다. 이어 각 사건을 해당 Result, 적용 정책, 수신자, 통보 시각에 연결하여 결과별 통보 책임과 재통보 이력을 독립적으로 표현해야 한다. 모든 렌즈가 이 근본 원인과 high 심각도, 즉시 수정 필요성에 합의했다.
- issue-022 (high): 재사용 가능한 CriticalValue 임계값의 notified 불리언만으로는 어떤 Result를 누구에게 언제 통보했는지 식별할 수 없으므로, 결과별 즉시 통보 사건을 독립적으로 모델링해야 한다.
  - root cause: 결과별 통보 사건을 재사용 임계값의 불리언으로 축약하고 근거 사실을 연결되지 않은 외부 대장에 두었다.
  - materiality: 임계 결과의 통보 완료 여부와 책임 대상을 검증하거나 외부 대장과 조정할 수 없어 환자안전과 EMR/LIS 통합을 위한 운영 개념 권위가 약화된다.
  - action: 먼저 재사용 임계값에서 결과별 통보 상태를 분리해 독립적인 통보 사건을 만들고, 그 사건을 triggering Result, 수신자(Staff 또는 외부 수신자 참조), 통보 시각과 상태에 연결해야 한다. 전화 대장이 권위 기록이라면 조정을 위한 안정적인 외부 대장 식별자도 포함해야 한다.
- issue-002 (medium): CriticalValue 통보 완료가 `notified` 불리언과 연결되지 않은 외부 전화 대장에 분산되어 있어, 현재 권위 모델만으로는 어떤 결과가 언제 누구에게 통보되었는지 검증하거나 감사할 수 없다.
  - root cause: 통보 완료 주장과 이를 입증하는 사건·수신자·시각 정보를 연결되지 않은 권위 좌석으로 분할했기 때문에 완료 여부를 검증할 수 없다.
  - materiality: 이 결손은 위험 결과의 즉시 통보를 EMR/LIS 통합에서 일관되고 감사 가능하게 표현하려는 목적을 약화한다. 불리언과 외부 기록이 누락·불일치하거나 소비자가 외부 대장에 접근할 수 없으면 통보 완료와 책임 소재를 확인할 수 없어 환자안전 관련 운영 약속의 신뢰가 저하된다.
  - action: 다음 단계 전에 결과별 통보 사건을 권위 모델에 추가해 발생 시각, 통보 시각, 수신자, 방법, 확인 상태를 CriticalValue 또는 Result와 연결해야 한다. 외부 전화 대장을 계속 사용한다면 먼저 안정적인 기록 식별자와 권위·동기화·불일치 처리 규칙을 정의하여 통보 완료 주장과 감사 증거가 하나의 검증 가능한 사슬을 이루게 해야 한다.
  - unresolved disagreement: coverage와 semantics 렌즈는 환자안전 핵심 통제인 결과별 통보 사건의 부재를 이유로 high를 주장했지만, 실제 즉시 통보 수행 또는 임상 대응 실패를 입증하는 경계 내 증거가 없어 medium 유지 결정과의 이견이 남아 있다.
- issue-003 (medium): Test와 Assay의 역할은 분리해 유지하되, 검사 동일성을 권위 있게 판정할 수 있도록 정식 Test-to-Assay realization 관계를 다음 단계 전에 도입해야 한다.
  - root cause: 주문 단위와 수행 단위의 정식 대응 모델 없이 Test와 Assay의 이중 등록을 임시 운영 정책으로 채택했다.
  - materiality: 현재 정책은 신규 검사를 두 카탈로그에 독립 등록하면서 대응 관계를 제공하지 않는다. 코드·검체·부서 정보가 달라지거나 일대일 대응이 성립하지 않으면 통합 구현자가 로컬 매핑으로 동일성을 다시 판단해야 하므로, 온톨로지는 EMR 주문과 LIS 수행 개념 사이의 권위 있는 대응을 제공한다는 목적을 달성하지 못한다.
  - action: 다음 단계 전에 Test와 Assay의 역할, realization 관계, 허용 다중성, 버전 규칙과 단일 등록 권위를 명시해야 한다. 신규 항목은 하나의 권위 카탈로그에서 등록하고 다른 카탈로그 표현은 해당 관계와 규칙에 따라 파생되도록 해야 중복 수정, 카탈로그 분기 및 로컬 동일성 매핑을 방지할 수 있다.
- issue-005 (medium): Specimen lifecycle이 정상 분석 경로에만 한정되어 거부·취소·재채취·보관·폐기 상태와 허용 전이를 표현하지 못하므로, 다음 단계 전에 이를 권위 모델에 포함해야 한다.
  - root cause: Specimen lifecycle의 범위를 collected부터 analyzed까지의 정상 경로로 한정하고 예외 처리와 최종 처분을 모델 밖에 두었다.
  - materiality: 이 누락으로 EMR/LIS는 검체 부적합, 재채취 필요, 보관 및 최종 처분을 공통된 상태 의미로 교환할 수 없다. 따라서 주문부터 보고까지의 엔티티·관계·상태에 대한 개념 권위를 제공한다는 목적이 약화되고, 시스템별 비호환과 수동 해석이 발생한다.
  - action: 다음 단계로 진행하기 전에 운송과 접수 판정부터 거부·취소, 재채취, 보관 및 폐기까지의 상태와 사건을 Specimen lifecycle에 추가하고, 각 상태 및 종결 상태의 허용 전이를 정의해야 한다. 그래야 정상·예외·종결 경로가 하나의 권위 모델에서 일관되게 교환되고 향후 운영 변화도 비호환 확장 없이 수용할 수 있다.
- issue-008 (medium): CriticalValue 임계값에 버전과 유효기간이 없어, 기준 변경 후에는 과거 결과가 당시 어떤 기준으로 중대결과로 판정되었는지 재구성할 수 없다. 이 문제는 다음 단계 전에 해소해야 하는 medium 수준의 중요 이슈다.
  - root cause: 시점 의존 정책인 CriticalValue 임계값을 버전과 유효기간 없는 현재값 속성으로 모델링했다.
  - materiality: EMR과 LIS가 중대결과 판정을 공통된 권위 기준으로 해석하려면 동일한 결과·시점에 동일한 기준을 복원할 수 있어야 한다. 현재 모델에서는 과거 판정과 통보를 재검토할 때 시스템별 재계산 결과와 감사 결론이 달라질 수 있으므로 판정의 재현성과 정당성이 약화된다.
  - action: 다음 단계 전에 CriticalValueCriterion을 식별 가능한 버전형 정책으로 전환하고 effective_from/effective_to, 승인 정보, 적용 대상·방법 범위 및 기준 버전을 기록해야 한다. 이어 각 Result가 결과 시점에 유효했던 정책 버전을 명시적으로 참조하도록 하여 과거 판정과 통보를 동일 기준으로 재현할 수 있게 해야 한다.
- issue-010 (medium): Result를 문자열 값과 단위 중심의 최소 레코드로 제한한 현재 모델은 임상검사 결과의 핵심 의미를 보존하지 못하므로, 다음 단계 전에 자료형별 결과와 해석·시점·기준범위·수행 Assay 차원을 구조화해야 한다.
  - root cause: Result를 다양한 임상 관찰을 표현하는 모델이 아니라 최소 문자열 값 레코드로 한정했다.
  - materiality: 정성·서수·코드형 결과나 기준범위·검사 방법에 의존하는 결과를 교환할 때 핵심 의미가 비구조 문자열 또는 시스템별 확장으로 밀린다. 그 결과 EMR/LIS가 결과를 일관되게 표시하거나 의사결정 지원과 방법별 비교에 활용하기 어려워져 의미 보존적 상호운용이라는 선언 목적이 약화된다.
  - action: 다음 단계 전에 ResultValue를 필요한 자료형별 구조로 분리하고 observation_at, reference_range, interpretation/abnormal_flag, method 또는 performed_assay 참조를 추가해야 한다. 필요성이 확인되는 경우 검출한계와 장비 맥락도 같은 의미 모델 안에 포함해야 한다. 이 조치는 핵심 의미가 시스템별 확장으로 분산되기 전에 공통 교환 계약의 권위로 고정하기 위해 필요하다.
- issue-013 (medium): ResultStatus–ReportStatus 대응 및 전이 정책에 식별자·버전·적용 기간이 없어, 상태 어휘나 정정 워크플로가 바뀌면 과거 기록의 상태 의미와 완료 판단을 일관되게 재현할 수 없다. 이 medium 이슈는 다음 단계 전에 해소해야 한다.
  - root cause: ResultStatus와 ReportStatus 사이의 대응 및 전이 정책에 독립 식별자, 버전과 적용 기간이 없다.
  - materiality: EMR/LIS 간 권위 계약은 결과와 보고 상태를 장기간 동일하게 해석할 수 있어야 한다. 그러나 변경 시점을 구분할 정책 경계가 없으면 신규 규칙이 과거 기록에 소급 적용되어 시스템별 상태 의미, 완료 여부, 정정 여부가 달라질 수 있으므로 그 목적이 약화된다.
  - action: 두 상태 체계를 독립된 코드 체계로 유지하면서, 그 사이의 매핑과 전이 규칙에 안정적인 식별자, 버전 및 유효기간을 부여해야 한다. 각 결과·보고 기록에는 실제 적용된 규칙 버전을 남겨 과거 해석을 재현할 수 있게 해야 한다. 이는 다음 단계 전에 닫아야 하며, 새 상태나 정정 유형을 추가하기 전에 버전형 정책 계약과 기록 연결을 먼저 마련해야 한다.
- issue-014 (medium): CriticalValue 임계값을 무시점 숫자로만 표현하면 임계값이나 결과 단위가 개정된 뒤 각 결과에 적용된 기준을 식별할 수 없다. 따라서 이 문제는 다음 단계 전에 해소해야 하는 중간 심각도의 근본 진화 결함이다.
  - root cause: 변경 가능한 CriticalValue 임계값을 정책 생명주기 없는 무시점 숫자 속성으로 모델링했다.
  - materiality: 변경 전후 결과가 함께 존재할 때 동일 결과의 위험 여부가 조회 시점에 따라 달라지거나 당시 통보 판단을 재현하지 못할 수 있다. 이는 위험 결과 판단과 통보 규칙을 EMR/LIS 통합의 지속 가능한 권위로 제공하려는 목적과 운영·감사 신뢰를 약화한다.
  - action: 먼저 CriticalValue를 고유 식별자, 정책 버전, 유효 시작·종료 시각, 값 단위 및 적용 우선순위를 가진 버전형 정책으로 모델링해야 한다. 이어 각 결과의 평가 및 통보 기록이 실제 적용된 정책 버전을 참조하도록 연결해야 한다. 정책 생명주기 정의가 선행되어야 기록 참조가 안정적인 권위를 가질 수 있으며, 이 조치는 다음 단계 전에 완료되어야 한다.
- issue-015 (medium): 공개(released_at)와 정정(corrected) 조건이 동시에 성립할 때 단일값인 Report.result_status에 finalized와 amended가 함께 요구되어 규칙을 만족할 수 없습니다. 이는 수정 대상인 medium 심각도의 correctness 결함입니다.
  - root cause: 중첩 가능한 공개 및 correction 조건을 단일 Report 상태에 연결하면서 배타 조건, 전이 우선순위와 적용 시점을 정의하지 않았다.
  - materiality: 동일한 권위 속성에 상충하는 상태가 요구되면 구현체마다 서로 다른 우선순위를 적용할 수 있습니다. 그 결과 EMR/LIS에 노출되는 Report의 최종성 판단이 달라져 임상의가 Report.result_status를 신뢰할 수 없게 됩니다.
  - action: 공개와 정정을 하나의 상호 배타적인 correction-aware 전이 규칙으로 통합해야 합니다. released_at 적용 시 관련 Result에 corrected가 있으면 amended를, 없으면 finalized를 선택하도록 우선순위와 적용 시점을 명시하고, 공개 후 correction은 야간 동기화를 기다리지 않고 즉시 amended로 전이되도록 해야 합니다. 이 전이 규칙과 상태 의미를 먼저 확정해야 모든 구현체가 동일한 권위 값을 산출할 수 있습니다.
- issue-016 (medium): Order가 completed가 된 뒤 Result가 corrected로 전이할 수 있는데도 완료 유지·재개·재완료 규칙이 없어, 현재 명세는 안정적인 주문 완료 의미를 보장하지 못한다.
  - root cause: Order 완료 판정에 가역적인 Result.status를 사용하면서 후속 correction에 대한 재개·유지 전이를 정의하지 않았다.
  - materiality: EMR/LIS 구현체마다 correction 이후 Order.completed를 유지하거나 해제하는 선택이 달라질 수 있다. 그러면 주문 완료 여부와 후속 정정 처리의 상호운용성이 깨져, Order부터 Report까지 일관된 상태 모델을 개념 권위로 제공하려는 목적이 약화된다.
  - action: 다음 단계 전에 완료 정책을 결정하고 명세해야 한다. corrected를 완료된 결과로 인정한다면 완료 술어와 Report 연계를 그렇게 정의하고, 인정하지 않는다면 correction 시 Order를 in_progress 또는 reopened로 되돌린 뒤 재검증 후 completed로 재진입하는 전이와 Report 상태 연계를 명시해야 한다. 어느 정책을 택하든 terminal 의미, 전이 조건, 재완료 조건을 함께 고정해야 구현체 간 해석 차이를 막을 수 있다.
- issue-018 (medium): Test와 Assay 사이에 정식 realization 관계가 없어 주문 단위, 실제 수행 단위, 결과를 온톨로지의 권위 있는 경로로 추적할 수 없다. 이 결함은 다음 단계 전에 해소해야 하는 medium 수준의 근본 원인이다.
  - root cause: 주문 단위 Test와 수행 단위 Assay를 별도 카탈로그로 유지하면서 두 개념을 연결하는 정식 의미·workflow 관계를 정의하지 않았다.
  - materiality: 주문 Test를 analyzer Assay로 변환할 때 코드가 다르거나 일대다·다대일 대응이 발생하면 온톨로지가 매핑을 제공하지 못한다. 통합 구현은 별도의 비권위 매핑에 의존하게 되고, 주문한 검사와 실제 수행법 및 결과의 의미적 동일성과 provenance를 신뢰성 있게 검증할 수 없어 EMR/LIS 의미 보존과 Order-to-Report 추적성이라는 목적이 약화된다.
  - action: Test와 Assay의 역할을 명확히 구분하고, 방향 또는 canonical 탐색 규칙과 cardinality가 명시된 Test-to-Assay realization 관계를 추가해야 한다. 매핑이 specimen, analyzer 또는 다른 조건에 따라 달라지거나 일대다·다대일이면 조건과 버전을 담는 association entity로 승격해야 한다. 이 관계를 먼저 권위 있는 매핑으로 확립한 뒤 결과 provenance가 실제 수행 Assay까지 이어지도록 연결해야 한다.
- issue-021 (medium): Specimen을 Result의 입력 재료이자 생산 주체로 동시에 표현해 재료 provenance와 검사 수행 provenance가 혼동된다. Specimen은 입력·유래 관계로만 연결하고, Result의 produced_by는 실제 Assay 수행 사건을 참조해야 한다.
  - root cause: 결과 생성의 수행 사건을 모델링하지 않고 입력 재료인 Specimen에 생산 관계를 부여했다.
  - materiality: 이 모델에서는 결과 생성 원인이나 수행법을 추적할 때 검체와 검사 행위를 구별할 수 없다. 그 결과 감사, 재현, 정정 과정에서 어떤 재료가 사용되었고 어떤 분석 수행이 결과를 만들었는지가 모호해져, 검사 결과의 재료 및 수행 provenance에 공통 의미를 제공하려는 목적이 약화된다.
  - action: 먼저 실제 Assay 수행 사건을 결과 생성의 권위 있는 수행 단위로 모델링해야 한다. 그다음 Specimen에는 input_specimen 또는 derived_from 같은 입력·유래 관계만 사용하고, Result의 produced_by는 해당 Assay 수행 사건을 참조하도록 관계를 정정해야 한다. 이 분리는 새 분석법, 재실행, 장비 변경도 안정적으로 추적할 수 있게 하므로 다음 단계 전에 완료해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-002: coverage와 semantics 렌즈는 환자안전 핵심 통제인 결과별 통보 사건의 부재를 이유로 high를 주장했지만, 실제 즉시 통보 수행 또는 임상 대응 실패를 입증하는 경계 내 증거가 없어 medium 유지 결정과의 이견이 남아 있다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-020: no-deliberation-needed
- issue-022: no-deliberation-needed
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-018: resolved
- issue-021: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 결과와 보고 상태를 일관되게 해석하고 임상의에게 신뢰할 권위 상태를 제공하는 목적. Source finding context: EMR/LIS 통합에서 결과 상태의 개념적 권위와 임상의가 신뢰할 수 있는 보고 상태를 제공하는 목적. Source finding context: 결과와 보고 상태에 대한 EMR/LIS 공통 해석
- issue-006: 임상의가 신뢰할 결과·보고 상태를 EMR/LIS 간 권위 있고 감사 가능하게 정의하는 목적. Source finding context: 임상의가 신뢰할 결과·보고 상태를 EMR/LIS 간 권위 있게 정의하는 것
- issue-007: 안전 관련 통보 행위를 EMR/LIS가 공통 개념으로 교환하고 신뢰하게 하는 목적. Source finding context: 임상검사 파이프라인의 안전 관련 행위를 EMR/LIS가 공통 개념으로 교환하고 신뢰하게 하는 것
- issue-009: EMR 주문 카탈로그와 LIS 수행 카탈로그의 공통 개념 권위를 제공하는 목적. Source finding context: EMR 주문 카탈로그와 LIS 수행 카탈로그의 공통 개념 권위를 제공하는 것
- issue-011: EMR/LIS 연동 설계의 지속 가능한 검사 카탈로그 개념 권위 제공. Source finding context: EMR/LIS 연동 설계의 검사 카탈로그 개념 권위 제공
- issue-017: EMR/LIS 연동의 주문 우선순위 개념 권위 제공.
- issue-020: 위험 결과 판정과 통보 책임의 개념 권위 제공.
- issue-022: 임상검사 workflow와 EMR/LIS 통합의 운영 개념 권위 제공. Source finding context: Use of the ontology as an operational conceptual authority for laboratory workflow and EMR/LIS integration.
- issue-002: 위험 결과의 즉시 통보를 EMR/LIS 통합에서 일관되고 감사 가능하게 표현하는 목적.
- issue-003: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 대응을 권위 있게 제공하는 목적.
- issue-005: 주문부터 보고까지 임상검사 파이프라인의 엔티티·관계·상태를 정의하는 EMR/LIS 개념 권위 제공. Source finding context: 주문부터 보고까지 임상검사 파이프라인의 엔티티·관계·상태를 정의하는 EMR/LIS 개념 권위 문서
- issue-008: EMR/LIS가 중대결과 판정 의미를 공통 권위 기준으로 해석하는 목적. Source finding context: EMR/LIS가 중대결과 판정 의미를 공통 권위 기준으로 해석하는 것
- issue-010: 임상검사 결과를 EMR/LIS 사이에서 의미 보존적으로 교환하는 개념 권위 제공.
- issue-013: EMR/LIS가 결과와 보고 상태를 장기간 일관되게 해석하는 권위 계약.
- issue-014: 위험 결과 판단과 통보 규칙을 EMR/LIS 통합의 지속 가능한 권위로 제공하는 목적.
- issue-015: EMR/LIS 통합에서 임상의가 신뢰할 Report.result_status의 개념 권위 제공.
- issue-016: Order부터 Report까지 일관된 상태 모델을 EMR/LIS 통합의 개념 권위로 제공하는 목적.
- issue-018: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 의미 보존 매핑 및 Order-to-Report 실행 추적성 제공. Source finding context: EMR 주문 카탈로그와 LIS 수행 카탈로그 간 의미 보존 매핑 Source finding context: Use of the ontology as the conceptual authority for EMR/LIS integration across the Order-to-Report workflow.
- issue-021: 검사 결과의 재료 및 수행 provenance에 대한 공통 의미 제공.

## Final Review Result
19 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result 검증 상태와 Report 발행·정정 상태를 서로 다른 개념으로 분리하고, Report 상태를 correction-aware 집계 규칙에 따라 동기식으로 도출해야 한다. 현재의 중복 권위와 야간 동기화는 임상의에게 오래된 상태를 권위 값으로 제시할 수 있는 high 이슈다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 경계 내 자료에는 야간 배치의 실행 시각과 실패 처리 방식이 없어 실제 불일치 지연의 상한은 확정할 수 없다.
- 허용된 증거에는 외부 전화 기록 대장의 스키마와 식별자가 없어 구체적인 결합 방식은 평가할 수 없다.
- 현재 EMR/LIS의 실제 카탈로그 소유권과 구체적인 운영 매핑 규칙은 경계 내 증거로 확인되지 않는다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-011 (high): fix_now
- issue-017 (high): fix_now
- issue-020 (high): fix_now
- issue-022 (high): fix_now
- issue-002 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up
- issue-014 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, accept_risk
- issue-018 (medium): fix_before_release, follow_up
- issue-021 (medium): fix_before_release, follow_up

## Recommendations
- issue-012 (medium): 새 검체 유형을 수용할 때 여러 enum과 Assay 문자열 관행을 함께 변경해야 하며 값의 연속성을 표현할 수 없다. Source finding context: 검체 유형 어휘 Source finding context: materialized-input.md:37-60 — Specimen.specimen_type과 Test.requires_specimen_type은 같은 폐쇄 enum을 중복하고 Assay.specimen_kind는 별도 자유 문자열을 사용함 Source finding context: 새 검체 유형을 수용하려면 기존 enum 두 곳과 Assay 문자열 관행을 함께 변경해야 한다. Source finding context: serum, plasma 또는 세부 채취 유형 같은 새 범주가 생기면 기존 스키마를 여러 곳에서 수정하고 문자열 대응 규칙도 별도로 만들어야 한다. 과거 값과 신규 값의 동치·세분화 관계를 표현할 수 없어 표준 어휘 변경 시 연속성이 끊긴다. Source finding context: SpecimenType을 독립된 권위 개념으로 승격하고 코드, 표시명, 상위 유형, 외부 코드 매핑, 버전 및 유효기간을 둔다. 세 속성은 모두 이 개념을 참조하게 한다. Source finding context: .onto/review/20260718-0e0876e7/round1/evolution.findings.yaml#evolution-candidate-002 Source finding context: EMR/LIS 사이에서 검체 요구조건과 실제 검체를 확장 가능한 공통 개념으로 전달 Source finding context: 기존 네 범주 밖의 검체 유형이나 더 세분화된 외부 코드 체계를 도입할 때 Source finding context: 여러 기존 정의의 동시 수정과 임의 문자열 매핑이 필요해져 시스템별 해석 차이와 과거 데이터 단절이 발생한다. Source finding context: 검체 유형을 독립된 버전형 권위 어휘로 모델링하지 않았다. Source finding context: 같은 검체 개념이 중복 enum과 자유 문자열로 표현된다. Source finding context: 중복 표현은 공유되는 검체 유형 개념이 엔티티화되지 않은 구조의 증상이다.
- issue-019 (medium): Test의 요구 검체와 Assay의 분석 matrix가 다른 세분도와 의미를 가지지만 구별 개념과 매핑이 없다. Source finding context: Test.requires_specimen_type와 Assay.specimen_kind Source finding context: materialized-input.md:46-60 — Test는 blood/urine/tissue/swab 열거형, Assay는 WB/Serum/Urine-random 문자열을 사용함 Source finding context: 두 속성이 모두 검체 종류처럼 명명됐지만 서로 다른 분류 축과 세분도를 표현한다. Source finding context: blood가 WB나 Serum과 동일하다고 간주되면 분석에 부적합한 검체도 호환되는 것으로 해석될 수 있다. 반대로 문자열 차이를 단순 불일치로 처리하면 유효한 상위·하위 관계도 잃는다. Source finding context: 채취원/기초 검체와 분석용 specimen matrix를 별도 개념으로 명명하고, 통제 어휘 및 상위·하위 또는 허용 변환 관계를 정의한다. Source finding context: .onto/review/20260718-0e0876e7/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: EMR 주문 요구 검체와 LIS assay 요구 재료의 호환성 판단 Source finding context: 광범위한 Test 검체 값과 세부 Assay matrix를 직접 동등 비교할 때 Source finding context: 부적합 검체 수용 또는 유효 검체 거부로 이어질 수 있어 연동 규칙의 신뢰가 약화된다. Source finding context: 채취물 범주와 분석용 검체 matrix를 하나의 'specimen type/kind' 의미로 취급했다. Source finding context: 두 속성의 값 집합이 서로 다른 세분도와 분류 의미를 보인다. Source finding context: 서로 다른 검체 분류 축을 구별하는 개념이나 매핑이 없다.
- issue-004 (info): 상위 제품·온톨로지 원칙의 권위 자료가 바인딩되지 않아 전체 가치 정렬 판정을 완료할 증거가 부족하다. Source finding context: axiology 가치 권위 바인딩 Source finding context: value_type=boundary; alignment_direction=indeterminate. prompt packet §Authoritative alignment input — core lexicon과 제품·OaC·LLM-native·product-locality 원칙을 항상 바인딩하며 미존재/읽기 실패 시 insufficient evidence로 보고하도록 규정. review-value-alignment-criteria.yaml:5-20 — 제공된 기준은 사용자 요청 목적 하나뿐이며, review-context-manifest.yaml의 context_sources에는 canonical authority 파일이 포함되지 않음. Source finding context: 필수 canonical 가치 권위가 이 lens에 바인딩되지 않아 제품 원칙 수준의 가치 정렬 판정은 경계 내에서 완료할 수 없다. Source finding context: 현재 finding들은 명시된 EMR/LIS 권위 목적과 대상 자체의 약속에는 근거할 수 있지만, onto의 상위 제품 목적·원칙과의 정렬 여부는 개인 해석 없이 판단할 수 없다. 따라서 전체 axiology 판정의 범위가 제한된다. Source finding context: execution preparation 단계에서 요구된 canonical authority 파일의 정확한 anchor와 excerpt를 review-value-alignment-criteria 또는 axiology prompt에 물질화하고, lens 소비 허용 목록에 포함한 뒤 가치 정렬 검토를 재실행한다. Source finding context: .onto/review/20260718-0e0876e7/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: canonical authority chain에 근거해 대상의 가치·목적 정렬을 판정하는 axiology lens의 선언된 목적. Source finding context: 상위 제품·온톨로지 원칙과 대상 결정 사이의 정렬 또는 충돌을 판단해야 하는 경우. Source finding context: 사용자 목적에 대한 국소 평가는 가능하지만 canonical 제품 가치에 대한 적합성은 검증되지 않아 clean 또는 전면적 부적합 판정을 신뢰할 수 없다. Source finding context: execution preparation이 axiology 필수 authority source set을 소비자 컨텍스트에 물질화하지 않은 상태. Source finding context: axiology에 제공된 정렬 기준은 확인된 사용자 요청 목적 한 건뿐이다. Source finding context: review context source 목록과 lens:axiology 접근 집합에 canonical authority 파일이 없다. Source finding context: 필수 authority 미바인딩 시 개인 가치 판단을 금지하고 insufficient evidence로 처리하도록 역할 계약이 규정한다.

## Unique Finding Tagging
- issue-012 (medium): 새 검체 유형을 수용할 때 여러 enum과 Assay 문자열 관행을 함께 변경해야 하며 값의 연속성을 표현할 수 없다. Source finding context: 검체 유형 어휘 Source finding context: materialized-input.md:37-60 — Specimen.specimen_type과 Test.requires_specimen_type은 같은 폐쇄 enum을 중복하고 Assay.specimen_kind는 별도 자유 문자열을 사용함 Source finding context: 새 검체 유형을 수용하려면 기존 enum 두 곳과 Assay 문자열 관행을 함께 변경해야 한다. Source finding context: serum, plasma 또는 세부 채취 유형 같은 새 범주가 생기면 기존 스키마를 여러 곳에서 수정하고 문자열 대응 규칙도 별도로 만들어야 한다. 과거 값과 신규 값의 동치·세분화 관계를 표현할 수 없어 표준 어휘 변경 시 연속성이 끊긴다. Source finding context: SpecimenType을 독립된 권위 개념으로 승격하고 코드, 표시명, 상위 유형, 외부 코드 매핑, 버전 및 유효기간을 둔다. 세 속성은 모두 이 개념을 참조하게 한다. Source finding context: .onto/review/20260718-0e0876e7/round1/evolution.findings.yaml#evolution-candidate-002 Source finding context: EMR/LIS 사이에서 검체 요구조건과 실제 검체를 확장 가능한 공통 개념으로 전달 Source finding context: 기존 네 범주 밖의 검체 유형이나 더 세분화된 외부 코드 체계를 도입할 때 Source finding context: 여러 기존 정의의 동시 수정과 임의 문자열 매핑이 필요해져 시스템별 해석 차이와 과거 데이터 단절이 발생한다. Source finding context: 검체 유형을 독립된 버전형 권위 어휘로 모델링하지 않았다. Source finding context: 같은 검체 개념이 중복 enum과 자유 문자열로 표현된다. Source finding context: 중복 표현은 공유되는 검체 유형 개념이 엔티티화되지 않은 구조의 증상이다.
- issue-019 (medium): Test의 요구 검체와 Assay의 분석 matrix가 다른 세분도와 의미를 가지지만 구별 개념과 매핑이 없다. Source finding context: Test.requires_specimen_type와 Assay.specimen_kind Source finding context: materialized-input.md:46-60 — Test는 blood/urine/tissue/swab 열거형, Assay는 WB/Serum/Urine-random 문자열을 사용함 Source finding context: 두 속성이 모두 검체 종류처럼 명명됐지만 서로 다른 분류 축과 세분도를 표현한다. Source finding context: blood가 WB나 Serum과 동일하다고 간주되면 분석에 부적합한 검체도 호환되는 것으로 해석될 수 있다. 반대로 문자열 차이를 단순 불일치로 처리하면 유효한 상위·하위 관계도 잃는다. Source finding context: 채취원/기초 검체와 분석용 specimen matrix를 별도 개념으로 명명하고, 통제 어휘 및 상위·하위 또는 허용 변환 관계를 정의한다. Source finding context: .onto/review/20260718-0e0876e7/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: EMR 주문 요구 검체와 LIS assay 요구 재료의 호환성 판단 Source finding context: 광범위한 Test 검체 값과 세부 Assay matrix를 직접 동등 비교할 때 Source finding context: 부적합 검체 수용 또는 유효 검체 거부로 이어질 수 있어 연동 규칙의 신뢰가 약화된다. Source finding context: 채취물 범주와 분석용 검체 matrix를 하나의 'specimen type/kind' 의미로 취급했다. Source finding context: 두 속성의 값 집합이 서로 다른 세분도와 분류 의미를 보인다. Source finding context: 서로 다른 검체 분류 축을 구별하는 개념이나 매핑이 없다.
- issue-004 (info): 상위 제품·온톨로지 원칙의 권위 자료가 바인딩되지 않아 전체 가치 정렬 판정을 완료할 증거가 부족하다. Source finding context: axiology 가치 권위 바인딩 Source finding context: value_type=boundary; alignment_direction=indeterminate. prompt packet §Authoritative alignment input — core lexicon과 제품·OaC·LLM-native·product-locality 원칙을 항상 바인딩하며 미존재/읽기 실패 시 insufficient evidence로 보고하도록 규정. review-value-alignment-criteria.yaml:5-20 — 제공된 기준은 사용자 요청 목적 하나뿐이며, review-context-manifest.yaml의 context_sources에는 canonical authority 파일이 포함되지 않음. Source finding context: 필수 canonical 가치 권위가 이 lens에 바인딩되지 않아 제품 원칙 수준의 가치 정렬 판정은 경계 내에서 완료할 수 없다. Source finding context: 현재 finding들은 명시된 EMR/LIS 권위 목적과 대상 자체의 약속에는 근거할 수 있지만, onto의 상위 제품 목적·원칙과의 정렬 여부는 개인 해석 없이 판단할 수 없다. 따라서 전체 axiology 판정의 범위가 제한된다. Source finding context: execution preparation 단계에서 요구된 canonical authority 파일의 정확한 anchor와 excerpt를 review-value-alignment-criteria 또는 axiology prompt에 물질화하고, lens 소비 허용 목록에 포함한 뒤 가치 정렬 검토를 재실행한다. Source finding context: .onto/review/20260718-0e0876e7/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: canonical authority chain에 근거해 대상의 가치·목적 정렬을 판정하는 axiology lens의 선언된 목적. Source finding context: 상위 제품·온톨로지 원칙과 대상 결정 사이의 정렬 또는 충돌을 판단해야 하는 경우. Source finding context: 사용자 목적에 대한 국소 평가는 가능하지만 canonical 제품 가치에 대한 적합성은 검증되지 않아 clean 또는 전면적 부적합 판정을 신뢰할 수 없다. Source finding context: execution preparation이 axiology 필수 authority source set을 소비자 컨텍스트에 물질화하지 않은 상태. Source finding context: axiology에 제공된 정렬 기준은 확인된 사용자 요청 목적 한 건뿐이다. Source finding context: review context source 목록과 lens:axiology 접근 집합에 canonical authority 파일이 없다. Source finding context: 필수 authority 미바인딩 시 개인 가치 판단을 금지하고 insufficient evidence로 처리하도록 역할 계약이 규정한다.

## Shared Phenomenon Summary
- none
