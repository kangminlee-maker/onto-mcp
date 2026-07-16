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
- issue-001 (high): Result와 Report의 병행 상태 모델에 권위·의미적 대응·정정 전파 계약이 없어, Result가 corrected로 바뀐 뒤에도 임상의가 오래된 Report 상태를 신뢰할 수 있는 high 심각도 문제이다.
  - root cause: Result 상태와 Report 상태를 독립 저장하면서 정정 전파를 야간 배치에 맡긴 설계가 임상의에게 오래된 상태를 노출한다.
  - materiality: 이 모델의 선언된 목적은 EMR/LIS 통합에서 엔티티와 상태의 개념 권위를 제공하는 것이다. 그러나 임상의가 신뢰하는 Report 상태가 원천 Result 상태와 달라질 수 있으면 통합 시스템이 어느 상태를 언제 신뢰해야 하는지 즉시 판정할 수 없으므로, 권위 문서의 신뢰성과 운영 일관성이 직접 훼손된다.
  - action: 먼저 Result와 Report 상태 각각의 권위와 corrected→amended 같은 버전형 의미 대응을 명시해야 한다. 이어 정정 전파의 원자성 또는 명시적인 허용 지연과 지연 중 해석 규칙을 정의하고, 허용되지 않은 불일치를 차단하는 불변식을 적용해야 한다. Result를 단일 권위로 삼을지 별도 권위를 유지할지는 도메인 구현 결정이지만, 어느 선택이든 이 계약과 즉시 판정 가능한 동작을 먼저 확정해야 한다.
- issue-002 (high): 재사용 임계값 정책과 결과별 통보 사건이 하나의 CriticalValue에 결합되어 있어, 온톨로지 경계 안에서는 특정 Result의 통보 책임과 완료 상태를 판정할 수 없는 high 심각도의 현재 차단 문제다.
  - root cause: 재사용 임계값 정책과 결과별 통보 사건을 CriticalValue 하나에 결합하고 사건 증거를 모델 밖에 둔 설계가 통합 권위를 약화한다.
  - materiality: EMR/LIS 통합은 운영상 중요한 상태에 대한 공통 권위를 제공해야 한다. 그러나 notified boolean과 별도 전화 기록을 결합해야 통보 사실을 판단할 수 있으므로 시스템 간 상태 합의, 안전 통제, 책임 추적 및 감사가 외부 대장에 종속되어 그 목적이 약화된다.
  - action: 먼저 임계값 정책을 재사용 가능한 정책 개념으로 분리하고, 각 Result에 귀속되는 CriticalNotification 사건을 도입해야 한다. 사건에는 status, notified_at, recipient, notifier와 실패·재시도 상태를 두고, 외부 전화 기록은 사건을 대체하는 권위가 아니라 식별 가능한 증거 링크로 연결해야 한다. 그래야 결과별 책임과 완료 상태를 공통 모델에서 판정하고 이후 통보 채널 확장과 과거 기록 해석도 안정화할 수 있다.
- issue-005 (high): Test–Assay 매핑과 실제 분석 수행 개념이 없어 EMR 주문에서 LIS 수행과 Result 생성까지의 권위 있는 계보를 재구성할 수 있는 경로가 끊겨 있다.
  - root cause: 온톨로지가 카탈로그 변환과 실제 분석 수행을 독립 개념으로 모델링하지 않아 주문에서 수행과 결과까지의 권위 경로가 끊겼다.
  - materiality: 이 결손은 주문부터 보고까지의 EMR/LIS 워크플로를 정의한다는 문서의 핵심 목적을 직접 약화한다. 구현자가 시스템별 매핑과 실행 모델을 별도로 만들게 되어 의미 불일치가 발생하고, 과거 Result가 어떤 주문·검체·분석 수행에서 생성되었는지 추적할 수 없기 때문이다.
  - action: 먼저 권위 시스템, 버전, 유효기간을 갖는 Test–Assay 매핑을 정의하고, 이어 AssayRun 같은 수행 엔티티로 Assay, 주문, Specimen, Result, 장비·방법, 수행 시각을 연결해야 한다. 매핑이 카탈로그 변환의 권위를 제공하고 수행 엔티티가 실제 실행 계보를 기록하도록 함께 닫아야 주문부터 결과까지 재현 가능한 추적 경로가 완성된다.
- issue-006 (high): Result와 Report 상태를 병행 저장하면서 각 상태의 권위와 의미 관계, 전체 매핑, 전이, 버전 호환성, 미지원 값 처리 계약을 정의하지 않아 현재의 상태 불일치와 향후 변경 드리프트가 모두 발생할 수 있다.
  - root cause: 공통 상태 권위와 완전한 버전형 투영 계약 없이 Result와 Report 상태 enum을 병행 저장한 설계가 현재 불일치와 향후 변경 드리프트를 함께 만든다.
  - materiality: 정정 후 야간 동기화 전에는 동일 결과에 상충하는 상태가 노출될 수 있고, 새 상태나 전이 규칙이 한쪽에만 반영되면 EMR과 LIS가 최종성·정정 여부를 다르게 판단한다. 이는 현재의 임상적 상태 신뢰뿐 아니라 기존 데이터와 신규 규칙 사이의 의미 연속성까지 약화한다.
  - action: 먼저 ResultStatus와 ReportStatus의 의미와 수명주기가 동일한지 도메인 계약으로 결정해야 한다. 동일하다면 하나의 권위 있는 버전형 상태에서 두 표현을 투영하고, 다르다면 각각의 권위와 독립 전이를 유지하되 두 상태 사이에 완전한 버전형 상관관계 계약을 둬야 한다. 그 다음 전체 매핑, 허용 전이, 유효 버전, 미지원 값 처리, 동기화 지연 중 소비 규칙을 기계 판독 가능하게 정의해야 현재 불일치와 향후 호환성 위험을 함께 닫을 수 있다.
- issue-007 (high): 중요 결과 통보가 Result별 독립 사건으로 표현되지 않아 누가 누구에게 언제 무엇을 통보했는지, 수신·실패·재통보·대리 수신이 어떻게 이루어졌는지를 재구성할 수 없는 high 심각도의 현재 차단 문제다.
  - root cause: 중요 결과 통제를 독립된 사건과 증거로 모델링하지 않고 boolean과 식별 관계 없는 외부 대장으로 축약해 감사 경로가 단절된다.
  - materiality: 중요 결과의 안전한 전달은 임상검사 워크플로가 제공해야 할 핵심 환자 안전 통제다. 그러나 통보 수행 증거를 감사할 수 없고 EMR과 LIS가 서로 다른 증거를 유지할 수 있어, 온톨로지가 해당 통제의 개념 권위와 수행 여부를 신뢰성 있게 제공하지 못한다.
  - action: Result에 연결되는 CriticalNotification을 독립 사건으로 추가하고 발신자, 수신자, 발생·확인 시각, 채널, 상태, 근거 및 이전 시도와의 재시도 관계를 모델링해야 한다. 외부 전화 기록 대장을 증거 권위로 사용할 경우 그 권위와 식별자를 명시해 각 통보 사건과 연결해야 한다. 이를 통해 완료·실패·미수신·재통보·대리 수신을 동일한 감사 경로에서 검증할 수 있다.
- issue-010 (high): Test와 Assay를 별도 카탈로그에 중복 등록하면서도 단일 권위와 명시적 식별·버전 매핑이 없어, 신규 검사·분석기 변형·코드 변경이 누적될수록 주문 항목과 실제 수행 항목이 드리프트하는 high 심각도 문제다.
  - root cause: 주문 카탈로그와 수행 카탈로그 사이에 단일 권위와 명시적 식별·버전 매핑이 없어 확장할수록 드리프트가 누적된다.
  - materiality: 두 카탈로그가 불일치하면 EMR 주문 코드와 LIS 수행 코드의 대응을 권위 문서만으로 결정할 수 없다. 그 결과 통합 구현마다 별도 매핑이 생기고 동일 검사의 의미가 시스템별로 분기될 수 있어, EMR/LIS 연동에 개념 권위를 제공하려는 목적이 약화된다.
  - action: 먼저 Test를 주문 카탈로그의 권위 개념으로 확정하고 Assay가 이를 수행하거나 실현한다는 명시적 관계를 둬야 한다. 이어 매핑의 다중성, 식별 규칙, 유효기간과 버전, 코드 변경 처리 기준을 정의한 뒤 신규 등록과 변경이 하나의 권위 절차에서 원자적으로 반영되도록 해야 한다. 권위와 매핑 규칙을 먼저 확정해야 등록 절차가 일관된 기준을 집행할 수 있다.
- issue-013 (high): 동시에 성립 가능한 release와 correction 규칙이 단일 Report.result_status에 각각 finalized와 amended를 요구해 권위 상태를 비결정적으로 만드는 high 심각도 문제이며, 목표 범위에서 반드시 수정해야 한다.
  - root cause: 동시에 참일 수 있는 release와 correction 규칙이 같은 Report 상태에 상충 값을 요구하지만 우선순위·상호배제·시간 계약이 없다.
  - materiality: Report.result_status는 EMR/LIS 통합에서 임상의가 신뢰하는 권위 값이다. 현재 계약에서는 시스템마다 finalized 또는 amended를 정당하게 선택할 수 있어 상태 불일치와 오래된 최종 상태 노출이 가능하므로 정확성과 임상 신뢰를 직접 약화한다.
  - action: Report 상태 전이표에 사건 순서와 조건 우선순위를 먼저 확정해야 한다. corrected 결과가 이미 있으면 release 시 amended를 적용하고, release 후 correction이면 finalized에서 amended로 전이하도록 정의하는 방식이 가능하다. 이어 최대 전파 지연과 지연 중 표시 상태를 명시해 EMR과 LIS가 동일한 권위 상태를 결정하도록 해야 한다.
- issue-014 (high): ResultStatus와 ReportStatus 사이의 권위·전체 매핑·전이·우선순위·정정 전파 계약이 없어 corrected와 amended의 관계 및 불일치 처리 의미가 모호하며, 이는 현재 해결해야 할 고심각도 일관성 문제다.
  - root cause: 결과 수정 상태와 보고서 발행 상태를 같은 정보의 중복본으로 취급하면서 두 필드에 권위를 나눠 개념 경계와 전파 의미가 모호해졌다.
  - materiality: 정정된 Result가 존재해도 야간 동기화 전까지 Report가 finalized로 남을 수 있어 EMR과 LIS가 서로 충돌하는 현재 상태를 노출한다. 임상의가 오래된 상태를 신뢰할 수 있으므로, 온톨로지를 EMR/LIS 결과 보고의 개념 권위로 사용하려는 목적이 약화된다.
  - action: 각 상태의 권위자를 지정하고 corrected–amended 전체 대응표, 허용 전이, 충돌 시 우선순위, 정정 전파 완료 조건을 명시해야 한다. 정정된 Result를 현재 상태로 제시하기 전에 Report까지 필요한 전파가 완료되도록 해야 한다. 별도 ResultStatus·ReportStatus 개념으로 분리할지는 명시적 도메인 계약과 독립 전이 증거를 바탕으로 결정하되, 그 결정과 무관하게 공통 계약 부재는 즉시 해소해야 한다.
  - unresolved disagreement: 모든 렌즈는 권위·매핑·전이·우선순위·전파 계약 부재에 합의했다. 다만 semantics·evolution·structure는 두 상태를 별도 개념으로 보며, axiology는 안전 근거 없는 권위 분할을 추가 근본 원인으로 본다. coverage·logic은 현재 증거만으로 어느 추가 원인도 확정할 수 없다고 보므로 이 부분은 미해결이다.
- issue-015 (high): 재사용 가능한 CriticalValueThreshold 정책에 결과별 notified 상태를 두면 어떤 중요 결과의 통보가 완료됐는지 식별할 수 없으므로, 임계값 정책과 Result별 발생·통보 사건을 분리해야 한다.
  - root cause: 정책 설정과 결과별 사건 발생을 하나의 CriticalValue 타입으로 모델링해 notified의 적용 대상을 식별할 수 없다.
  - materiality: 여러 Result가 동일한 임계값을 공유할 때 threshold 수준의 boolean은 개별 결과, 통보 시점, 수신자를 나타내지 못한다. 통합 시스템이 이를 사건별 상태로 해석하면 필수 통보를 누락하거나 중복하고, 어느 중요 결과가 전달됐는지 합의할 수 없어 중요 결과 교환과 운영 통보 추적의 신뢰성과 안전성이 훼손된다.
  - action: CriticalValue를 CriticalValueThreshold라는 검사별 정책 개념으로 한정하고, 각 Result에 귀속되는 CriticalValueOccurrence 또는 Notification 사건을 별도로 도입해야 한다. 사건에는 최소한 result_ref, threshold_ref, status, notified_at, recipient, channel을 두어야 한다. 먼저 정책과 사건의 권위를 분리한 뒤 notified를 사건 상태로 이전해야 다중 결과·다중 수신자·재통보를 결과별로 추적하고 감사할 수 있다.
- issue-019 (high): Order의 주문 항목에서 Test 수행과 Result까지 이어지는 필수 소유 관계가 없어 완료 판정 집합이 닫히지 않는 high 심각도 문제이며, 목표 모델에서 즉시 보완해야 한다.
  - root cause: 주문 항목과 수행 결과를 같은 소유 경로로 묶는 필수 관계가 없어 Order 완료 규칙의 평가 집합이 닫히지 않는다.
  - materiality: Order 완료 규칙은 주문별 필수 Result 전체를 판정해야 하지만, 아직 Result가 없는 Test를 그 집합에 포함할 구조가 없다. 특히 결과 미생성 항목이나 여러 주문 항목이 한 검체·보고서에 섞인 경우 구현체마다 완료 대상을 다르게 계산하여 Order를 조기 완료하거나 영구 미완료로 둘 수 있으므로, EMR/LIS 통합 권위 문서로서 상태 동기화의 정확성과 신뢰성이 약화된다.
  - action: Order→Test 관계를 명시하고, 각 주문 항목을 검사 수행 및 Result와 동일한 소유·실현 경로로 연결해야 한다. 그 다음 Order 완료 규칙을 이 경로로 도달하는 모든 필수 주문 항목과 그 요구 결과 집합에 적용해야 하며, Result가 아직 없는 항목도 완료 판정 집합에 남도록 정의해야 한다. 이 소유 경로를 먼저 확정해야 완료 규칙이 안정적으로 정의되고 신규 수행 유형이나 부분 결과에도 일관되게 확장된다.
- issue-004 (medium): 주문 긴급성이 priority, is_stat, StatOrder로 독립 표현되고 이들 사이의 권위·파생 규칙이 없어 모순 상태가 허용되는 medium 심각도 문제다.
  - root cause: 하나의 주문 긴급성을 enum, boolean, subtype으로 독립 모델링하고 권위·파생 불변식을 두지 않아 모순 상태가 허용된다.
  - materiality: 세 표현이 일부만 설정되거나 서로 충돌하면 EMR과 LIS가 같은 주문을 서로 다르게 STAT로 분류할 수 있다. 이는 시스템 간 동일한 긴급성 판정을 제공해야 하는 개념 권위를 약화하고, 긴급 주문의 라우팅과 운영 대응을 소비자별 임의 우선순위에 의존하게 한다.
  - action: 다음 통합 단계 전에 priority를 긴급성의 단일 권위 표현으로 정하고 is_stat은 priority == stat의 파생값으로 만들어야 한다. StatOrder에 고유 행위가 필요하면 priority=stat을 필수 불변식으로 강제하고, 그렇지 않으면 하위 타입을 제거해야 한다. 이렇게 해야 모순 상태를 차단하고 EMR과 LIS가 같은 판정 기준을 사용한다.
- issue-008 (medium): Specimen lifecycle이 analyzed에서 끝나 분석 후 보관·반출·폐기와 정상 분석 전 예외 종결을 공통 표현하지 못하므로, 다음 단계 전에 보완해야 하는 medium 심각도의 독립 이슈다.
  - root cause: Specimen lifecycle 범위를 분석 처리까지만 모델링하고 종결·예외 처리를 외부 내규에 위임해 검체 상태가 닫히지 않는다.
  - materiality: 주문부터 보고까지 검체 흐름을 공통 개념으로 정의하려는 목적에는 검체의 종결 상태와 처분 이력도 포함되어야 한다. 현재 모델로는 분석 후 조회·재검 또는 부적합 검체의 조기 종결 시 EMR/LIS가 현재 상태, 처분 시각, 보존·폐기 이력을 일관되게 해석하거나 재구성할 수 없다.
  - action: 정상 및 예외 종결 상태와 상태 전이 사건을 Specimen lifecycle에 추가하고, 각 전이에 시각·행위자·사유를 기록해야 한다. 부서별 보존 규칙은 상태 자체에 고정하지 말고 버전된 정책 개념으로 연결해야 새 정책이나 예외 유형이 생겨도 공통 lifecycle과 소비자 로직을 유지할 수 있다. 이 보완은 다음 단계 전에 완료해야 한다.
- issue-009 (medium): 검사 카탈로그와 중요값 정책에 버전·유효기간이 없고 주문·결과가 당시 사용한 버전을 참조하지 않아, 변경 후 과거 판정 기준과 통보 의무를 정확히 복원할 수 없는 medium 심각도 문제다.
  - root cause: 시점 의존하는 검사 카탈로그와 중요값 정책을 유효기간·버전 없는 불변 속성 집합으로만 모델링해 과거 적용 기준을 잃는다.
  - materiality: EMR/LIS가 검사 정의와 판정 기준을 장기간 권위 있게 공유하려면 과거 사건에도 당시 기준을 결정적으로 적용할 수 있어야 한다. 현재 구조에서는 최신 값이 과거 주문·결과에 소급될 수 있어 재해석, 정정, 감사 및 시스템 간 재처리의 일관성과 신뢰성이 약화된다.
  - action: 다음 단계 전에 카탈로그 항목과 CriticalValue 정책을 버전형 개념으로 전환하고 각 버전에 유효기간, 상태, 변경 근거 및 선후 버전 관계를 기록해야 한다. 이어서 각 Order와 Result가 실제 사용한 버전을 직접 참조하도록 연결해야 하며, 이 사건별 참조가 있어야 변경 이후에도 당시 정의와 임계값을 정확히 복원할 수 있다.
- issue-011 (medium): 검체 유형이 Specimen·Test의 폐쇄형 enum과 Assay의 자유 문자열에 중복 내장되어 있어, 새 범주나 외부 코드를 도입할 때 여러 스키마와 변환 규칙을 함께 변경해야 하는 medium 심각도의 진화 결손이다.
  - root cause: 검체 유형을 재사용 가능한 버전형 개념이 아니라 여러 enum과 자유 문자열에 중복 내장해 확장·호환 규칙이 분산된다.
  - materiality: 현재 네 범주 밖의 검체나 분석기별 세부 유형이 들어오면 과거 값과 신규 값의 의미 연결을 일관되게 보존할 수 없다. 그 결과 EMR/LIS마다 별도 변환 규칙이 분기되어 검체 요구사항과 실제 검체 표현을 지속적으로 해석한다는 목적이 약화된다.
  - action: 다음 단계 전에 안정 식별자, 상·하위 유형, 동의어, 외부 코드, 유효기간, 폐기·대체 매핑을 갖는 버전형 권위 SpecimenType을 도입해야 한다. 이후 Specimen, Test, Assay가 중복 enum이나 자유 문자열 대신 이 개념을 공통 참조하도록 전환하고 기존 값의 버전 매핑을 보존해야 신규 코드 도입과 과거 데이터 해석을 일관되게 유지할 수 있다.
- issue-012 (medium): 문서 전체 버전만으로는 개별 개념·코드 값의 추가, 폐기, 대체 또는 재해석을 추적할 수 없어 과거 EMR/LIS 데이터가 어떤 정의로 생성됐는지 판정할 수 없다. 이는 다음 단계 전에 보완해야 하는 중간 심각도의 중요 문제다.
  - root cause: 버전 권위가 문서 전체 버전에만 있고 개별 개념·값의 수명주기와 호환 관계에는 없어 의미 연속성이 끊긴다.
  - materiality: 온톨로지가 EMR/LIS 통합의 지속적인 개념 권위가 되려면 버전이 바뀌어도 과거 데이터의 의미를 재현할 수 있어야 한다. 현재 구조에서는 소비자마다 별도의 호환·마이그레이션 규칙을 만들게 되므로 장기 호환성과 감사 가능성이 약화된다.
  - action: 다음 단계 전에 개념·코드별 안정 식별자와 introduced, deprecated, effective 기간을 정의하고, replaced_by 또는 equivalent_to 관계 및 미지원 신규 값 처리 규칙을 기계 판독 가능한 현재 모델 계약으로 추가해야 한다. 이 계약이 먼저 마련되어야 이후 표준·카탈로그 변경과 데이터 마이그레이션을 일관되게 처리할 수 있다.
- issue-016 (medium): priority, is_stat, StatOrder가 동일한 STAT 긴급성을 독립적으로 표현하면서 등가·파생 제약이 없어 모순된 주문 상태를 허용하는 medium 심각도의 중요 문제다.
  - root cause: 가변적인 주문 긴급성을 세 개의 제약 없는 표현으로 승격해 모순 인스턴스를 허용한다.
  - materiality: priority=routine이면서 is_stat=true이거나 StatOrder인 주문이 유효할 수 있어 EMR과 LIS가 같은 주문을 서로 다르게 분류·라우팅할 수 있다. 이는 경계 간 긴급 주문을 일관되게 해석하고 처리하려는 목적을 직접 약화한다.
  - action: 다음 단계 전에 priority를 STAT 긴급성의 단일 권위 표현으로 정하고 is_stat과 StatOrder view를 priority=stat에서 파생해야 한다. StatOrder에 실제로 별도 정체성이나 생명주기 의미가 있다면 그 의미를 먼저 명시한 뒤 priority 및 is_stat과의 등가 제약을 강제해야 한다. 그래야 모순 상태를 제거하고 향후 priority 값이나 subtype 확장 시에도 일관된 마이그레이션과 라우팅을 보장할 수 있다.
- issue-017 (medium): 주문·채취·수행 검체가 서로 다른 어휘와 추상화 수준으로 표현되어 호환성을 일관되게 판정할 수 없는 medium 심각도의 중요 문제다.
  - root cause: 검체 의미를 공통 개념 체계가 아닌 서로 다른 지역 어휘와 추상화 수준으로 표현해 호환성 판단이 미정의 상태다.
  - materiality: EMR 주문의 blood 요구와 LIS Assay의 WB 또는 Serum 요구 사이에 선언된 의미 관계가 없으면 통합 소비자가 임의로 호환성을 해석해야 한다. 그 결과 동등한 검체를 거부하거나 부적합한 물질을 허용할 수 있어 수행 안전성과 주문-수행 통합의 일관성이 약화된다.
  - action: 먼저 안정 코드, 별칭, 상위·하위 관계를 갖는 공통 SpecimenType을 검체 의미의 권위로 정의해야 한다. 그다음 Specimen, Test, Assay가 모두 이를 참조하도록 전환하고, 임상적으로 필요한 경우 채취 원재료와 처리된 검체를 구분해 명시적 호환 관계를 모델링해야 한다. 이는 다음 단계 전에 주문-채취-수행 경로의 의미 범위를 닫기 위해 필요하다.
- issue-018 (medium): TAT는 다중 Specimen·Report에서 사용할 시작·종료 레코드와 산식의 권위 규칙이 없어 동일 데이터로 여러 값이 산출될 수 있는 medium 심각도 문제이며, 공유 운영 지표로 사용하기 전에 해소해야 한다.
  - root cause: 다중 레코드에서 계산되는 TAT를 두 필드 이름만으로 정의하고 레코드 선택과 계산 권위를 외부 대시보드에 위임해 지표 의미가 결정되지 않는다.
  - materiality: 온톨로지가 운영 임상검사 지표의 공유 개념 권위여야 하지만, 현재는 EMR·LIS·대시보드가 서로 다른 collected_at 또는 released_at을 선택해 상충하는 TAT를 산출해도 어느 값이 적합한지 판정할 수 없다. 이는 지표의 비교 가능성, 일관성, 책임 있는 성과 판단을 약화한다.
  - action: 다음 단계로 진행하기 전에 온톨로지 계약에 TAT의 계산 주체와 단위(예: specimen-result-report 체인 또는 Order 수준), 시작·종료 레코드 선택 규칙, 제외 조건, 재발행·정정 처리, 권위 있는 산식과 버전을 정의해야 한다. 이후 EMR·LIS·대시보드가 이 계약을 동일하게 소비하도록 정렬해야 지표의 결정성과 시간적 호환성을 확보할 수 있다.
- issue-020 (medium): Test와 Assay 사이의 수행·매핑 관계와 Assay에서 Specimen·Result로 이어지는 실행 경로가 없어, 주문된 Test가 실제로 어떤 Assay로 수행되어 어떤 Result를 산출했는지 구조적으로 추적할 수 없다.
  - root cause: 병행 유지되는 Test와 Assay 카탈로그 사이의 구조적 매핑이 없어 Assay가 핵심 워크플로에서 고립된다.
  - materiality: 이 결손은 Test 코드와 분석기 Assay 코드가 다르거나 하나의 Test가 여러 Assay를 요구할 때 주문·분석·결과 사이의 추적 경로와 코드 대응을 단일하게 해석할 수 없게 한다. 따라서 주문부터 분석 및 결과 보고까지 연결하려는 EMR/LIS 통합 개념 모델의 완전성과 공통 권위가 약화된다.
  - action: 다음 단계 전에 Test–Assay 수행·매핑 관계를 정의하고, Assay를 Specimen 및 Result의 실제 실행 경로에 연결해야 한다. 관계의 다중성, 매핑 권위, 미매핑 처리도 함께 명시해야 Test와 Assay가 일대일이 아니거나 코드가 다른 경우에도 주문·수행·결과를 일관되게 추적할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-014: 모든 렌즈는 권위·매핑·전이·우선순위·전파 계약 부재에 합의했다. 다만 semantics·evolution·structure는 두 상태를 별도 개념으로 보며, axiology는 안전 근거 없는 권위 분할을 추가 근본 원인으로 본다. coverage·logic은 현재 증거만으로 어느 추가 원인도 확정할 수 없다고 보므로 이 부분은 미해결이다.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: narrowed
- issue-007: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: narrowed
- issue-015: no-deliberation-needed
- issue-019: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-020: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 엔티티·상태 모델의 개념 권위를 제공한다는 목적. Source finding context: EMR/LIS 통합에서 엔티티·상태 모델의 개념 권위를 제공한다는 선언된 목적.
- issue-002: EMR/LIS 통합에서 운영상 중요한 엔티티·관계·상태의 공통 권위를 제공하는 목적.
- issue-005: EMR/LIS 연동에서 주문부터 보고까지의 워크플로를 정의하는 목적. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 주문부터 보고까지의 워크플로를 정의하는 목적
- issue-006: EMR/LIS 간 결과 상태 의미와 권위를 현재 및 장기간 일관되게 전달하는 목적. Source finding context: EMR/LIS 간 결과 상태 의미와 권위를 일관되게 전달하는 목적 Source finding context: EMR이 신뢰하는 보고 상태와 LIS 결과 상태의 장기적 호환성 및 권위 유지
- issue-007: 중요 결과의 안전한 전달을 포함하는 임상검사 워크플로의 개념 권위 제공.
- issue-010: EMR/LIS 연동에서 검사 카탈로그와 수행 항목의 개념 권위를 제공하는 목적. Source finding context: EMR/LIS 연동 설계에서 검사 카탈로그와 수행 항목의 개념 권위를 제공하는 목적
- issue-013: 임상의가 신뢰하는 Report.result_status의 개념 권위 계약. Source finding context: EMR/LIS 통합에서 임상의가 신뢰하는 Report.result_status의 개념 권위 계약
- issue-014: EMR/LIS 결과 보고의 개념 권위로 온톨로지를 사용하는 목적. Source finding context: Use of the ontology as the conceptual authority for EMR/LIS result reporting.
- issue-015: 중요 결과 교환과 운영 통보 추적의 신뢰할 수 있는 개념 권위. Source finding context: Reliable conceptual authority for critical-result exchange and operational notification tracking.
- issue-019: Order부터 Report까지의 모델을 EMR/LIS 통합 권위 문서로 사용하는 목적. Source finding context: Order부터 Report까지의 모델을 EMR/LIS 통합의 개념 권위 문서로 사용하는 목적
- issue-004: EMR/LIS가 주문 긴급성을 동일하게 판정하도록 하는 개념 권위. Source finding context: EMR/LIS가 주문 긴급성을 동일하게 판정하도록 하는 상태·엔티티 개념 권위.
- issue-008: 주문부터 보고까지 검체 흐름을 공통 개념으로 정의하는 목적.
- issue-009: EMR/LIS가 공통 검사 정의와 판정 기준을 장기간 권위 있게 공유하는 목적.
- issue-011: EMR/LIS 간 검체 요구사항과 실제 검체 표현을 지속적으로 해석하는 목적. Source finding context: EMR/LIS 간 검체 요구사항과 실제 검체 표현을 지속적으로 해석할 수 있는 개념 권위 제공
- issue-012: EMR/LIS 통합의 지속적인 개념 권위로서 버전 간 의미 연속성을 제공하는 목적. Source finding context: EMR/LIS 통합의 지속적인 개념 권위 문서로서 버전 간 의미 연속성을 제공하는 목적
- issue-016: EMR/LIS 경계에서 긴급 주문을 일관되게 해석하고 라우팅하는 목적. Source finding context: Consistent interpretation and routing of urgent orders across EMR/LIS boundaries.
- issue-017: EMR 주문과 LIS 수행 사이 검체 요구사항의 의미 상호운용성. Source finding context: Semantic interoperability of specimen requirements between EMR order entry and LIS execution.
- issue-018: 운영 임상검사 지표의 공유 개념 권위로 온톨로지를 사용하는 목적. Source finding context: Use of the ontology as the shared conceptual authority for operational laboratory metrics.
- issue-020: 주문부터 분석 및 결과 보고까지 연결되는 EMR/LIS 통합 개념 모델.

## Final Review Result
19 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result와 Report의 병행 상태 모델에 권위·의미적 대응·정정 전파 계약이 없어, Result가 corrected로 바뀐 뒤에도 임상의가 오래된 Report 상태를 신뢰할 수 있는 high 심각도 문제이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 외부 전화 기록 대장의 식별자와 결합 보장은 허용된 경계에서 확인할 수 없지만, 현재 모델에 그 결합 관계가 없다는 점은 확정적이다.
- 현재 증거만으로 ResultStatus와 ReportStatus의 의미적 동일성은 확정되지 않으므로 공통 권위와 별도 권위 중 구현 형태는 도메인 계약에 따라 결정해야 한다.
- corrected가 운영상 반드시 release 이후에만 발생하는지는 경계 내 문서에 규정되지 않았으며, 그러한 관행이 있다면 권위 계약의 명시적 선행조건으로 추가해야 한다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now, accept_risk
- issue-007 (high): fix_now
- issue-010 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now, accept_risk
- issue-015 (high): fix_now
- issue-019 (high): fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-016 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, follow_up
- issue-018 (medium): fix_before_release, follow_up
- issue-020 (medium): fix_before_release, follow_up

## Recommendations
- issue-003 (medium): 주문 개념과 수행 개념의 경계 및 권위 매핑이 없어 Test와 Assay의 안정적인 대응을 결정할 수 없다. Source finding context: Test와 Assay의 이중 카탈로그 운영 Source finding context: 가치 권위: review-value-alignment-criteria.yaml:6-8(EMR/LIS 통합의 개념 권위). 대상 증거: materialized-input.md:46-60,126-127(Test와 Assay가 별도 코드·검체 어휘를 사용하며 신규 항목을 양쪽에 등록). value_type=tradeoff; alignment_direction=misaligned. Source finding context: 카탈로그 통합 결정을 미룬 채 신규 항목의 이중 등록을 요구하는 국소적 이행 편의가 통합 개념 권위의 목적을 훼손한다. Source finding context: 개념 권위 문서가 두 시스템의 카탈로그 대응을 판정하지 못한 채 운영자에게 이중 등록을 요구하면 항목 누락·불일치가 사람의 절차로 전가된다. 이는 임시 호환성 비용을 감수하더라도 권위와 매핑 규칙을 명시해야 한다는 통합 목적과 맞지 않는다. Source finding context: Test와 Assay를 성급히 합치기보다 각각 주문 개념과 수행 개념으로 유지하되, 명시적 realizes/implemented_by 매핑과 공통 검체 개념을 추가한다. 신규 등록은 하나의 권위 카탈로그에서 파생되도록 한다. Source finding context: .onto/review/20260716-7f1c6ba1/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: EMR과 LIS 사이 카탈로그 개념을 권위 있게 연결하는 목적. Source finding context: 신규 또는 변경 항목이 두 카탈로그에 독립 등록되거나 서로 다른 검체 어휘로 표현될 때. Source finding context: 동일 검사에 대한 시스템 간 대응이 문서로 결정되지 않아 통합 구현과 운영자의 해석에 의존한다. Source finding context: Test–Assay의 역할 분리를 유지하면서도 두 개념을 연결할 권위 매핑과 공통 검체 어휘를 정의하지 않은 채 결정을 연기한 것. Source finding context: 신규 항목은 Test와 Assay 양쪽에 등록해야 하며 각 모델은 서로 다른 코드와 검체 표현을 사용한다. Source finding context: 이중 등록 의존은 Test와 Assay의 통합 여부만 나중으로 미루고 현재의 권위 매핑을 정의하지 않은 결정의 증상이다. Source finding context: Test and Assay concepts Source finding context: materialized-input.md:46-60,126-127 Source finding context: The semantic identity boundary between Test and Assay is underdefined despite both being maintained as catalog entries. Source finding context: Orderable clinical intent and executable laboratory procedure can legitimately be distinct, but dual registration without a declared distinction or mapping leaves integrations unable to determine whether records are synonyms, one-to-one counterparts, or panel-to-component relationships. Source finding context: Define Test as the canonical orderable service and Assay as the canonical executable procedure, then declare the allowed mapping cardinalities and identity rules. If they are intended as synonyms, select one canonical concept and represent the other as an alias rather than independent registration. Source finding context: .onto/review/20260716-7f1c6ba1/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: Shared EMR/LIS interpretation of ordered and performed laboratory services. Source finding context: An EMR sends a Test identifier while the LIS records one or more Assay identifiers under the mandated dual-registration practice. Source finding context: Implementers cannot derive stable identity or mapping semantics from the purported authority document, risking duplicate catalog records and incorrect result association. Source finding context: The ontology postpones the synonymy-versus-distinction decision while simultaneously requiring both concepts to be populated. Source finding context: Test and Assay are both defined as laboratory test items but emphasize different operational units. Source finding context: Their identity relationship remains undecided even though new items are registered in both catalogs.
- issue-021 (medium): CriticalValue의 notified 상태가 어느 실제 Result의 통보 완료를 뜻하는지 결정할 수 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue와 Result 연결 Source finding context: entities.CriticalValue; entities.Result; relations 전체 Source finding context: CriticalValue 규칙을 실제 Result 및 통보 상태에 귀속시키는 필수 관계가 없다. Source finding context: 동일 Test에서 여러 환자·주문·Result가 발생할 때 단일 CriticalValue 객체의 notified 값이 어느 결과의 통보 완료를 뜻하는지 결정할 수 없다. 따라서 임계 결과에서 통보 증거까지의 경로가 끊긴다. Source finding context: CriticalValue를 임계값 정의와 임계 결과 발생/통보 기록으로 분리하거나, 최소한 Result→CriticalValue 및 결과별 통보 기록 관계를 추가한다. 외부 전화 기록을 권위로 유지한다면 Result와 해당 기록을 연결하는 식별 관계를 명시한다. Source finding context: .onto/review/20260716-7f1c6ba1/round1/structure.findings.yaml#structure-candidate-003 Source finding context: 운영 위험을 포함해 Result를 신뢰성 있게 교환하는 EMR/LIS 개념 권위 문서 Source finding context: 같은 Test에 대해 여러 Result가 생성되고 일부만 임계값 통보 대상이거나 통보 완료된 경우 Source finding context: 임계 결과별 통보 여부를 구조적으로 추적할 수 없어 시스템 간 통보 상태가 잘못 결합되거나 감사 경로가 단절될 수 있다. Source finding context: 임계값 정의와 결과별 임계 사건/통보 기록이 하나의 연결되지 않은 CriticalValue 개념에 혼합되어 있다. Source finding context: CriticalValue는 실제 Result와 관계로 연결되지 않는다. Source finding context: notified 상태는 Result 식별자나 통보 기록 식별자 없이 CriticalValue 자체에 배치되어 있다.

## Unique Finding Tagging
- issue-003 (medium): 주문 개념과 수행 개념의 경계 및 권위 매핑이 없어 Test와 Assay의 안정적인 대응을 결정할 수 없다. Source finding context: Test와 Assay의 이중 카탈로그 운영 Source finding context: 가치 권위: review-value-alignment-criteria.yaml:6-8(EMR/LIS 통합의 개념 권위). 대상 증거: materialized-input.md:46-60,126-127(Test와 Assay가 별도 코드·검체 어휘를 사용하며 신규 항목을 양쪽에 등록). value_type=tradeoff; alignment_direction=misaligned. Source finding context: 카탈로그 통합 결정을 미룬 채 신규 항목의 이중 등록을 요구하는 국소적 이행 편의가 통합 개념 권위의 목적을 훼손한다. Source finding context: 개념 권위 문서가 두 시스템의 카탈로그 대응을 판정하지 못한 채 운영자에게 이중 등록을 요구하면 항목 누락·불일치가 사람의 절차로 전가된다. 이는 임시 호환성 비용을 감수하더라도 권위와 매핑 규칙을 명시해야 한다는 통합 목적과 맞지 않는다. Source finding context: Test와 Assay를 성급히 합치기보다 각각 주문 개념과 수행 개념으로 유지하되, 명시적 realizes/implemented_by 매핑과 공통 검체 개념을 추가한다. 신규 등록은 하나의 권위 카탈로그에서 파생되도록 한다. Source finding context: .onto/review/20260716-7f1c6ba1/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: EMR과 LIS 사이 카탈로그 개념을 권위 있게 연결하는 목적. Source finding context: 신규 또는 변경 항목이 두 카탈로그에 독립 등록되거나 서로 다른 검체 어휘로 표현될 때. Source finding context: 동일 검사에 대한 시스템 간 대응이 문서로 결정되지 않아 통합 구현과 운영자의 해석에 의존한다. Source finding context: Test–Assay의 역할 분리를 유지하면서도 두 개념을 연결할 권위 매핑과 공통 검체 어휘를 정의하지 않은 채 결정을 연기한 것. Source finding context: 신규 항목은 Test와 Assay 양쪽에 등록해야 하며 각 모델은 서로 다른 코드와 검체 표현을 사용한다. Source finding context: 이중 등록 의존은 Test와 Assay의 통합 여부만 나중으로 미루고 현재의 권위 매핑을 정의하지 않은 결정의 증상이다. Source finding context: Test and Assay concepts Source finding context: materialized-input.md:46-60,126-127 Source finding context: The semantic identity boundary between Test and Assay is underdefined despite both being maintained as catalog entries. Source finding context: Orderable clinical intent and executable laboratory procedure can legitimately be distinct, but dual registration without a declared distinction or mapping leaves integrations unable to determine whether records are synonyms, one-to-one counterparts, or panel-to-component relationships. Source finding context: Define Test as the canonical orderable service and Assay as the canonical executable procedure, then declare the allowed mapping cardinalities and identity rules. If they are intended as synonyms, select one canonical concept and represent the other as an alias rather than independent registration. Source finding context: .onto/review/20260716-7f1c6ba1/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: Shared EMR/LIS interpretation of ordered and performed laboratory services. Source finding context: An EMR sends a Test identifier while the LIS records one or more Assay identifiers under the mandated dual-registration practice. Source finding context: Implementers cannot derive stable identity or mapping semantics from the purported authority document, risking duplicate catalog records and incorrect result association. Source finding context: The ontology postpones the synonymy-versus-distinction decision while simultaneously requiring both concepts to be populated. Source finding context: Test and Assay are both defined as laboratory test items but emphasize different operational units. Source finding context: Their identity relationship remains undecided even though new items are registered in both catalogs.
- issue-021 (medium): CriticalValue의 notified 상태가 어느 실제 Result의 통보 완료를 뜻하는지 결정할 수 없다. Source finding context: clinical-lab-ontology.yaml — CriticalValue와 Result 연결 Source finding context: entities.CriticalValue; entities.Result; relations 전체 Source finding context: CriticalValue 규칙을 실제 Result 및 통보 상태에 귀속시키는 필수 관계가 없다. Source finding context: 동일 Test에서 여러 환자·주문·Result가 발생할 때 단일 CriticalValue 객체의 notified 값이 어느 결과의 통보 완료를 뜻하는지 결정할 수 없다. 따라서 임계 결과에서 통보 증거까지의 경로가 끊긴다. Source finding context: CriticalValue를 임계값 정의와 임계 결과 발생/통보 기록으로 분리하거나, 최소한 Result→CriticalValue 및 결과별 통보 기록 관계를 추가한다. 외부 전화 기록을 권위로 유지한다면 Result와 해당 기록을 연결하는 식별 관계를 명시한다. Source finding context: .onto/review/20260716-7f1c6ba1/round1/structure.findings.yaml#structure-candidate-003 Source finding context: 운영 위험을 포함해 Result를 신뢰성 있게 교환하는 EMR/LIS 개념 권위 문서 Source finding context: 같은 Test에 대해 여러 Result가 생성되고 일부만 임계값 통보 대상이거나 통보 완료된 경우 Source finding context: 임계 결과별 통보 여부를 구조적으로 추적할 수 없어 시스템 간 통보 상태가 잘못 결합되거나 감사 경로가 단절될 수 있다. Source finding context: 임계값 정의와 결과별 임계 사건/통보 기록이 하나의 연결되지 않은 CriticalValue 개념에 혼합되어 있다. Source finding context: CriticalValue는 실제 Result와 관계로 연결되지 않는다. Source finding context: notified 상태는 Result 식별자나 통보 기록 식별자 없이 CriticalValue 자체에 배치되어 있다.

## Shared Phenomenon Summary
- none
