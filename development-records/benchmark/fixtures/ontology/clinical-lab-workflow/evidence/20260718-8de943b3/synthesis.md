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
- issue-003 (high): 검증·배포·정정·중요결과 통보를 독립 사건으로 보존하지 않아 서로 다른 실행 이력이 동일한 현재 상태로 붕괴하며, 책임 주체와 완료 여부를 권위 모델만으로 구별·재구성할 수 없다. 직접 입증된 결함 범위는 medium으로 좁혀졌지만, 목표 릴리스에서 반드시 해소해야 하는 material 이슈다.
  - root cause: 검증·배포·정정·통보 행위를 독립 사건과 감사 증거로 보존하지 않고 부분 속성이나 외부 대장에 분산했다.
  - materiality: EMR/LIS 통합 권위가 임상의에게 신뢰할 결과·보고 상태와 중요결과 통보 완료 상태를 제공하려면 누가 언제 어떤 근거로 무엇을 수행했는지 재구성할 수 있어야 한다. 현재 모델은 이 증거를 함께 보존하지 않아 임상 전달 상태와 감사 가능성에 대한 신뢰를 약화한다.
  - action: 목표 릴리스 전에 대상, 행위자, 발생 시각, 근거, 수신자와 결과를 필수로 보존하는 개별 통제 사건 또는 공통 AuditEvent를 도입해야 한다. issue-004 및 issue-010과 공유 원인 후보가 있으므로 공통 시간적 사건 모델을 먼저 정하고 정정·통보 표현을 그 모델에 정렬해 중복 개념을 피해야 한다.
  - unresolved disagreement: logic은 사건 이력의 비구별성과 medium 결함만 직접 입증됐다고 보아 범위를 좁혔고, coverage는 감사 증거 전체의 high 실패를 유지한다. 각 통제 행위의 권위 있는 필수 감사 요건과 실제 임상·감사 영향 사례가 없어 이 심각도 이견은 남아 있다.
- issue-004 (high): Result와 Report가 현재 상태의 가변 단일 레코드로만 표현되어, 최종 결과의 정정과 보고서 재발행 전후에 어떤 값이 언제 임상의에게 유효했는지 재구성할 수 없는 high 이슈이며 즉시 수정해야 한다.
  - root cause: Result와 Report를 시간순 버전이나 불변 정정 사건이 아닌 가변 단일 레코드와 현재 상태로 모델링했다.
  - materiality: 과거에 실제 전달된 값, 현재 유효한 값, 그리고 두 값의 대체 계보를 판별할 수 없으므로 정정 동기화와 임상 기록 해석의 신뢰가 훼손된다. 이는 신뢰할 수 있는 보고 상태를 포함한 EMR/LIS 개념 권위를 제공한다는 목적을 직접 약화한다.
  - action: ResultVersion·ReportVersion 또는 불변 Correction/Amendment 사건을 도입하고 valid_from, valid_to, supersedes, reason, authored_by, released_at을 모델링해야 한다. 먼저 변경 전후 값을 보존하는 버전·사건 권위를 확립한 뒤 finalized 이후 amended 및 재배포 전이와 Result–Report 동기화를 그 권위에 연결해야 과거와 현재의 임상 노출 값을 모두 재구성할 수 있다.
- issue-007 (high): Test와 Assay의 canonical 의미 역할과 버전형 관계가 정의되지 않아 주문·수행 카탈로그의 통합 매핑과 변경 이력을 신뢰할 수 없는 high 이슈이며, 목표 범위에서 즉시 해소해야 한다.
  - root cause: Test와 Assay가 동의어인지 주문 개념과 수행 구현인지에 대한 canonical 결정과 그 관계가 없어 의미 경계와 카탈로그 진화가 함께 불안정하다.
  - materiality: 신규 검사·분석법·검체 유형을 추가하거나 코드를 개정할 때 Test와 Assay가 독립적으로 다른 개념, 식별자 또는 검체 의미에 연결될 수 있다. 이는 EMR 주문부터 LIS 수행·결과까지의 연결과 카탈로그 확장 추적성을 약화해 개념 권위 제공이라는 목적을 직접 훼손한다.
  - action: 먼저 Test와 Assay의 의미적 역할을 결정해 하나의 canonical 검사 정체성을 세워야 한다. 그다음 정의와 식별자를 정렬하고, 두 개념 사이에 카디널리티·코드 체계·버전·유효기간·검체 개념 매핑을 포함한 명시적 관계를 모델링하며, 신규 항목 등록과 개정 경로를 단일 권위 아래 통합해야 한다. 역할 결정이 선행되어야 이후 매핑 구조가 불확정 의미를 다시 고정하지 않는다.
- issue-009 (high): 발급 권위와 수명주기를 갖지 않는 단순 문자열 식별자는 다기관·복수 EMR/LIS 통합에서 동일 문자열의 대상을 안전하게 구분하거나 동일 대상을 교차 참조할 수 없으므로, 현재 통합 권위로 사용하기에 부적합한 high 이슈다.
  - root cause: 식별자 모델이 값만 보존하고 발급 권위와 수명주기를 보존하지 않는다.
  - materiality: 연결된 기관이나 시스템이 같은 로컬 문자열을 서로 다른 환자·검사·부서 등에 사용하거나 코드 체계를 개정하면 잘못된 대상끼리 결합되거나 같은 대상이 분리될 수 있다. 이는 환자·검사·조직·인력 식별의 개념 권위를 약화시키며, 문서만으로 충돌 해소 규칙을 결정할 수 없어 임상 안전 위험을 만든다.
  - action: 현재 통합 권위로 사용하기 전에 value, system 또는 issuer, version, validity를 함께 보존하는 공통 Identifier 개념을 정의하고, 로컬 식별자와 통합 식별자 간 대응 관계를 명시해야 한다. 먼저 이 공통 구조와 동일성·충돌 해소 규칙을 확정한 뒤 Patient·Test·Assay·Department 등 기존 식별자와 참조를 그 구조에 연결해야 향후 namespace 추가에 따른 전면 마이그레이션과 잘못된 임상 대상 연결을 예방할 수 있다.
- issue-010 (high): CriticalValue가 재사용·버전되는 위험 판정 규칙과 특정 Result의 통보 사건을 함께 표현해 규칙 확장성과 결과별 상태 구별을 동시에 훼손한다. 이 개념 혼합은 목표 모델에서 반드시 분리해야 하며, 확인된 영향 범위는 deliberation에 따라 medium으로 한정한다.
  - root cause: 재사용 가능한 위험 판정 정책과 시간에 발생하는 결과별 통보 사건을 하나의 CriticalValue 유형으로 모델링했다.
  - materiality: 현재 구조는 숫자 상·하한과 단일 notified 값에 의존한다. 따라서 조건형·범주형·버전별 기준을 도입할 때 규칙을 재설계해야 하고, 동일 규칙에 해당하는 여러 Result의 서로 다른 통보 상태도 보존할 수 없다. 이는 운영 정책이 바뀌어도 판정 근거를 재현하고 위험 결과와 통보 이력을 EMR/LIS 사이에서 의미 손실 없이 교환하려는 목적을 약화한다.
  - action: 목표 모델에서 버전 가능한 CriticalThreshold 또는 CriticalRule을 먼저 독립시키고 대상 검사, 조건, 연산자, 기준값·단위, 유효기간을 그 규칙의 권위 아래 둬야 한다. 이어 특정 Result에 연결되는 CriticalResult 또는 Notification 사건을 분리해 통보 시각, 수신자, 상태를 사건에 귀속해야 한다. 이 분리는 규칙 진화와 결과별 통보 추적의 공통 선행조건이므로 현재 목표 범위에서 즉시 수정해야 한다.
  - unresolved disagreement: 규칙과 통보 사건을 분리해야 한다는 점에는 수렴했지만, 미통보 Result가 통보 완료로 오인되는 실제 데이터 경로와 임상·운영 영향은 입증되지 않았다. 따라서 semantics의 high 판단은 남아 있으며, deliberation은 직접 확인된 확장성 및 상태 비구별 결함에 근거해 최종 영향을 medium으로 좁혔다.
- issue-013 (high): Result의 검증·정정 상태와 Report의 발행·개정 상태를 동일 정보로 취급해 의미와 권위를 이중화한 문제다. 두 상태의 분리 필요성은 확정됐으며, 직접 입증된 영향에 따라 범위는 배치 지연 중 일관성 문제로 좁혀졌다.
  - root cause: 개별 Result의 검증·정정 상태와 집합 문서인 Report의 발행·개정 상태를 독립 개념으로 분리하지 않았다.
  - materiality: Result가 corrected로 바뀐 뒤 야간 동기화가 끝나기 전에는 Report 상태와 의도적으로 불일치할 수 있고, 여러 Result가 서로 다른 상태인 보고서는 단일 Report 상태로 정확히 표현하기 어렵다. 이 때문에 EMR이 LIS의 결과 상태와 보고 상태를 의미적으로 일관되게 해석한다는 목적이 약화된다.
  - action: Result 검증·정정 상태와 Report 발행·개정 상태를 먼저 별도 개념과 독립 lifecycle로 정의하고, 각 개념의 단일 권위 원천을 지정해야 한다. 그다음 Result 상태 변화가 Report에 반영되는 전이 사건과 명시적 투영 규칙을 정의해 야간 배치가 권위 조정자가 아니라 파생 상태 전달 수단이 되도록 해야 한다. 이 조치는 대상 릴리스 전에 완료해야 한다.
  - unresolved disagreement: 근본 원인과 분리 조치에는 합의했지만 심각도에는 이견이 남아 있다. semantics는 최종본 오인과 잘못된 코드 매핑 가능성을 근거로 높은 심각도를 유지했으나, deliberation은 그 직접 경로가 입증되지 않았다고 보아 현재 확인된 배치 지연 중 시간적 불일치에 맞춰 medium으로 좁혔다. axiology는 이를 독립적으로 판단할 canonical 제품 원칙이 부족하다고 봤다.
- issue-017 (high): Test와 Assay 또는 Result와 Assay를 잇는 canonical 관계가 없어, 주문된 검사를 실제 수행 단위로 해석하고 결과를 그 수행 단위에 추적할 수 없는 high 중요도 구조 결함이다.
  - root cause: 별도 주문·수행 카탈로그 개념을 선언하면서 워크플로를 잇는 canonical 관계를 정의하지 않았다.
  - materiality: 온톨로지가 Order부터 Report까지 EMR/LIS 통합의 개념적 권위를 표방하지만 핵심 order-to-execution 구간을 자체적으로 도출할 수 없다. 따라서 구현마다 문서 밖 매핑을 별도로 유지해야 하며, 시스템 간 의미와 추적성이 달라질 수 있다.
  - action: 먼저 Test와 Assay의 주문·수행 역할과 관계 소유권을 결정한 뒤, 명시적 카디널리티를 가진 canonical Test–Assay 실행 매핑을 추가해야 한다. 실행 추적성이 요구되는 범위에서는 Result를 실제 수행된 Assay에 연결하고, 두 카탈로그를 별도로 유지한다면 변경 동기화 또는 단일 소유권 규칙도 정의해야 한다.
- issue-002 (medium): Specimen lifecycle이 정상 분석 경로에만 한정되어 채취 실패·접수 거부·재채취·보관·폐기를 표현하지 못하는 medium 수준의 모델 완전성 결함이며, 통합 상태 권위로 사용하기 전에 해소해야 한다.
  - root cause: Specimen lifecycle 범위를 정상 분석 경로에만 한정해 예외 및 종결 상태가 모델에서 누락되었다.
  - materiality: 이 누락 때문에 예외 또는 분석 후 종결 상황에서 EMR과 LIS가 공통 상태와 종결 의미를 교환할 수 없다. 그 결과 주문의 진행 여부와 검체 처리 결과를 일관되게 판정할 수 없어, Order부터 Report까지 통합 상태 모델을 제공한다는 목적이 약화된다.
  - action: 릴리스 전에 pending_collection, collection_failed, rejected, recollection_requested, retained, disposed 등 필요한 예외·종결 상태를 기관 정책에 맞게 확정하고, 허용 전이와 완료 조건을 lifecycle에 정의해야 한다. 이어 각 전이의 사유와 시각을 기록하는 SpecimenEvent를 연결해 EMR과 LIS가 동일한 진행·종결 의미를 교환하도록 해야 한다. dep-001의 공유 원인인 lifecycle 노드·간선 스키마 불완전성과 함께 조정해 상태와 전이를 분절된 수정으로 남기지 않아야 한다.
- issue-005 (medium): 병행 관리되는 Test와 Assay 카탈로그에 canonical authority, 명시적 대응 관계, 버전 및 유효기간이 없어 현재·과거 정의와 코드 매핑을 신뢰하기 어려운 medium 이슈이며, 목표 범위에서 반드시 해소해야 한다.
  - root cause: 별도 Test·Assay 카탈로그를 두면서 canonical authority, 대응 관계, 버전 및 유효기간을 모델링하지 않았다.
  - materiality: 신규 등록, 코드·검체 요건 변경 또는 단종이 두 카탈로그에 다르게 반영되면 통합 당사자는 어느 정의가 권위 있는지, 주문 시점에 어떤 정의가 유효했는지 판단할 수 없다. 이는 EMR 주문과 LIS 수행 간 코드 매핑 및 결과 귀속을 불안정하게 하여 두 카탈로그 사이에 개념 권위를 제공하려는 목적을 약화한다.
  - action: 먼저 Test와 Assay가 동의어인지, 아니면 각각 주문 개념과 수행 구현인지 역할을 확정해야 한다. 그다음 TestAssayMapping과 각 시스템 소유자 및 canonical authority를 정의하고, 두 카탈로그에 version, valid_from, valid_to와 retired 상태를 적용해야 한다. 이 순서를 지켜야 역할이 불명확한 상태에서 소유자와 버전만 추가하는 불완전한 조치를 피하고 현재·과거 매핑을 재현할 수 있다.
  - unresolved disagreement: 원인과 필요한 조치에는 합의했지만 evolution 렌즈는 의미 연속성 훼손을 근거로 더 높은 심각도를 주장했다. 실제 오귀속·재해석 사례와 영향 범위가 입증되지 않아 현재는 medium으로 한정하며, 해당 증거가 확보되면 심각도를 재평가해야 한다.
- issue-006 (medium): 주문된 Test와 Result 사이에 실제 Assay 수행 발생 기록이 없어, 반복 측정·재검·실패 및 최종 결과의 생성 근거를 표현할 수 없는 medium 완전성 이슈다.
  - root cause: 카탈로그 개념인 Assay만 정의하고 실제 수행 발생을 독립 엔티티로 모델링하지 않았다.
  - materiality: 이 누락은 Order-to-Report 파이프라인의 핵심 실행 단계를 비워 둔다. 따라서 EMR/LIS 통합 모델이 검사 진행 상태와 Result 계보를 교환·추적해야 하는 목적을 충족하지 못한다.
  - action: 릴리스 전에 AssayRun 또는 LaboratoryExecution을 독립 실행 발생 엔티티로 추가해야 한다. 먼저 각 수행 건이 Specimen과 Assay를 참조하고 수행자, 분석기, 시작·종료 시각, 실행 상태를 보존하도록 한 뒤, Result를 해당 수행 건에 연결하고 반복·재검 관계를 표현해야 실행 상태와 결과 계보가 함께 복원된다.
- issue-008 (medium): 상태 개념과 Result–Report 대응 규칙에 독립적인 버전·유효기간 모델이 없어, 상태 추가·개정 시 완료 판정과 과거 이력 해석이 달라질 수 있는 medium 이슈이며 대상 범위에서 지금 해소해야 한다.
  - root cause: 상태 개념과 Result–Report 대응 규칙에 독립적인 버전·유효기간 모델이 없다.
  - materiality: EMR/LIS 통합은 결과와 보고 상태를 장기간 동일하게 해석할 수 있어야 한다. 그러나 상태 의미와 대응 규칙의 적용 시점을 재현할 수 없으면 같은 과거 레코드가 평가 시점에 따라 다르게 완료·동기화될 수 있어 권위 계약의 재현성과 이력 신뢰가 약화된다.
  - action: 릴리스 전에 상태를 버전 가능한 개념 체계로 분리하고, 각 상태의 안정된 의미와 유효기간, 폐기·별칭 규칙, Result–Report 대응표를 권위 있게 정의해야 한다. 그다음 완료 판정과 전이·동기화 규칙이 개별 문자열 대신 해당 상태 의미 또는 상태군과 적용 버전을 참조하도록 바꿔야 한다. issue-012와 공유 원인 후보인 권위 있는 상태 매핑 계약 부재를 고려해 공통 계약을 먼저 정립하면 중복 표현 간 일관성도 함께 보존할 수 있다.
- issue-011 (medium): Order가 completed로 전이된 뒤 Result가 corrected로 변경될 수 있는데 후속 Order 전이 규칙이 없어, 동일 사건에 대한 완료 여부가 시스템별로 달라질 수 있는 medium 이슈다.
  - root cause: Order 완료 판정이 변경 가능한 Result.status에 의존하면서 정정 이후의 Order 전이 정책을 정의하지 않았다.
  - materiality: EMR과 LIS가 Order 상태를 공통 개념 권위로 사용하려면 같은 사건에서 같은 완료 판정을 내려야 한다. 현재 모델에서는 한 시스템이 completed를 유지하고 다른 시스템이 완료 조건 불충족으로 판단할 수 있어 상태 기반 처리와 감사 결과의 신뢰가 약화된다.
  - action: 릴리스 전에 완료 의미를 하나로 확정하고 허용 전이표에 반영해야 한다. corrected를 완료를 유지하는 안정된 종결 결과 상태로 포함하거나, corrected 발생 시 Order를 in_progress 또는 reopened로 되돌린 뒤 조건 충족 후 재완료하도록 정의해야 한다. 먼저 의미를 선택한 다음 Result 변경과 Order 전이의 순서·조건을 명시해야 동일 사건을 일관되게 처리할 수 있다.
  - unresolved disagreement: 렌즈 간 미해결 이견은 없지만, completed를 역사적 전이 사실로 볼지 현재 완료 조건을 지속적으로 보장하는 상태로 볼지는 문서에서 아직 선택되지 않았다.
- issue-012 (medium): Result의 검증·정정 상태와 Report의 발행·개정 상태를 구분하는 권위 모델 및 일관성 계약이 없어, 정정 후 다음 야간 배치까지 임상의와 소비 시스템에 상반된 상태가 노출될 수 있는 material medium 이슈다.
  - root cause: 하나의 결과 상태 사실을 Result와 Report에 중복 저장하면서 동기화 지연과 일관성 양상을 정의하지 않았다.
  - materiality: Report.result_status가 임상 소비자가 신뢰하는 권위 값인데 Result의 corrected 상태를 즉시 반영하지 못하면 임상의와 EMR/LIS가 서로 다른 상태를 관찰한다. 이는 단일하고 신뢰할 수 있는 결과 상태 권위를 제공한다는 목적을 직접 약화한다.
  - action: 릴리스 전에 먼저 Report 상태를 Result 상태의 권위 있는 파생 뷰로 할지, 독립적인 발행·개정 수명주기로 할지 도메인 결정을 내려야 한다. 파생 뷰라면 정정 사실이 임상 노출 상태에 실시간 반영되도록 단일 권위를 구성하고, 비동기 복제를 유지한다면 eventual consistency, 최대 지연시간, 정정 대기 상태, 상태 대응 규칙 및 배치 전 임상 노출 권위를 명시해야 한다.
- issue-014 (medium): STAT 분류가 Order.priority, Order.is_stat, StatOrder에 중복 표현되지만 단일 권위와 등가 제약이 없어, 동일 주문이 서로 모순된 STAT 상태를 가질 수 있는 medium 이슈다.
  - root cause: 변경 가능한 우선순위 속성을 불리언 파생값과 하위 타입으로 중복 모델링했다.
  - materiality: EMR과 LIS가 서로 다른 표현을 권위로 해석하거나 일부 표현만 갱신하면 응급 주문의 분류와 처리 우선순위가 시스템마다 달라질 수 있다. 이는 주문 우선순위를 동일하게 해석하고 라우팅하려는 목적을 직접 약화한다.
  - action: 먼저 priority를 STAT 분류의 단일 권위로 정하고 is_stat을 priority에서 계산되는 파생값으로 만들어야 한다. StatOrder가 필요하면 독립 저장 타입이 아니라 priority=stat 제약을 가진 뷰 또는 명시적 파생 분류로 정의해 불일치 가능성을 제거해야 한다. 이 수정은 대상 릴리스 전에 완료되어야 한다.
- issue-015 (medium): Specimen을 Result의 생산 주체로 모델링한 현재 구조는 실제 분석 수행 단위를 감추므로, 검체·분석 수행·결과 간 provenance를 정확히 전달하지 못하는 medium 이슈다.
  - root cause: 물리적 입력인 Specimen과 Result를 생성하는 분석 수행 사건을 구분하지 않았다.
  - materiality: 한 검체에서 여러 분석이 수행되거나 동일 Test가 서로 다른 Assay로 실행되면 어떤 수행이 각 Result를 생성했는지 식별할 수 없다. 이에 따라 LIS 결과의 검체 및 수행 계보를 EMR에 정확히 전달하려는 목적이 약화되고, 추적성과 결과 해석의 신뢰성이 떨어진다.
  - action: Specimen–Result 관계는 검체 출처를 나타내는 관계로 한정하고, AssayExecution 같은 수행 사건 개념을 도입해 Test 또는 Assay, Specimen, Result에 연결해야 한다. 먼저 결과 생산 권한을 수행 사건에 부여한 뒤 기존 직접 produces 관계를 정리해야 각 결과의 실제 수행 계보를 보존할 수 있다.
- issue-016 (medium): TAT는 시작·종료 시각만으로는 단일하고 재현 가능한 지표가 아니다. 측정 주체와 다중 검체·부분 보고 처리 규칙이 없어 동일 주문의 TAT가 시스템별로 달라질 수 있으므로 출시 전에 바로 보완해야 하는 medium 이슈다.
  - root cause: TAT 산식만 기록하고 지표의 관찰 단위와 다중값 선택·집계 규칙을 정의하지 않았다.
  - materiality: 통합 시스템이 검사 처리시간을 같은 의미로 계산하려면 동일 사례에서 하나의 규칙으로 결과가 재현되어야 한다. 그러나 주문에 여러 검체나 보고가 연결되면 최초·최종 채취와 부분·최종 보고 중 무엇을 선택하는지에 따라 EMR, LIS 및 대시보드가 서로 다른 TAT를 산출할 수 있어 이 목적이 훼손된다.
  - action: 먼저 TAT의 공식 권위 위치를 하나로 정한 뒤 측정 주체를 Order, Specimen, Test 또는 Report 중 하나로 명시해야 한다. 이어 다중 검체에서 최초·최종 또는 개별 채취 중 어떤 값을 쓰는지, 부분·최종 보고를 어떻게 선택·집계하는지, 원천 시각과 공식 계산 규칙을 함께 정의해야 한다. 이 규칙이 확정된 후 각 시스템의 계산을 동일한 정의에 맞춰야 재현 가능한 지표가 된다.
- issue-018 (medium): 재사용 가능한 CriticalValue 임계 규칙과 특정 Result의 통보 사건이 분리되어 있지 않아, 결과별 즉시 통보를 실행하고 추적할 수 없는 material medium 이슈다.
  - root cause: 결과별 통보 발생과 그 필수 관계가 온톨로지에서 누락되었다.
  - materiality: 복수 Result가 같은 임계값에 해당할 때 현재 모델은 어떤 Result가 통보를 유발했는지, 누가 누구에게 언제 통보했는지 표현할 수 없다. 따라서 운영 EMR/LIS의 즉시 통보 워크플로와 시스템 간 교환·감사 추적이라는 선언 목적을 충족하지 못한다.
  - action: 먼저 CriticalValue를 재사용 가능한 임계값 구성으로 유지하면서 결과별 notification occurrence를 별도 개념으로 분리해야 한다. 이어 그 사건을 Result, 적용된 CriticalValue, 통보자, 수신자, 통보 시각에 필수적으로 연결하고, 외부 전화 로그가 증빙 authority라면 명시적 참조를 추가해야 한다. 이 분리와 관계 정의가 통보 상태를 특정 결과에 귀속시키는 선행 조건이므로 목표 범위에서 즉시 수정해야 한다.
  - unresolved disagreement: semantics 렌즈는 미통보 Result를 통보 완료로 오인할 위험을 근거로 high 심각도를 주장했지만, 경계 내에는 그러한 오인이 실제로 발생하거나 교환되는 사례와 그 임상·운영 영향이 없다. 따라서 원인과 조치는 수렴했으나 심각도는 medium으로 한정되며, high 상향 여부는 해당 실행 사례와 영향 근거가 추가될 때 재평가해야 한다.
- issue-019 (medium): Order·Specimen의 lifecycle 상태와 Report의 status가 열거되어 있지만, 허용되는 상태 진행을 판정할 완전한 전이 그래프가 없어 EMR과 LIS가 서로 다른 전이 규칙을 구현할 수 있는 medium 이슈다.
  - root cause: 상태 노드는 정의했지만 전이 간선 스키마와 완전한 전이 집합을 정의하지 않았다.
  - materiality: 공유 상태 모델은 양쪽 시스템이 동일한 전이를 검증·발행·소비·조정하게 해야 한다. 현재 문서는 일부 서술 규칙 밖의 합법·불법 전이를 결정하지 못하므로 구현별 상태 순서와 이벤트 처리가 달라져 상호운용 목적을 약화한다.
  - action: 먼저 모든 lifecycle 표현에 공통으로 적용할 전이 간선 스키마를 정하고, 이어 엔티티별 모든 상태에 대해 from-state, to-state, trigger, guard를 빠짐없이 정의해야 한다. Report.result_status를 Report lifecycle 자체로 사용할지 별도 lifecycle을 둘지도 일관되게 결정해야 권위 문서가 전체 진행 경로를 판정할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-003: logic은 사건 이력의 비구별성과 medium 결함만 직접 입증됐다고 보아 범위를 좁혔고, coverage는 감사 증거 전체의 high 실패를 유지한다. 각 통제 행위의 권위 있는 필수 감사 요건과 실제 임상·감사 영향 사례가 없어 이 심각도 이견은 남아 있다.
- issue-010: 규칙과 통보 사건을 분리해야 한다는 점에는 수렴했지만, 미통보 Result가 통보 완료로 오인되는 실제 데이터 경로와 임상·운영 영향은 입증되지 않았다. 따라서 semantics의 high 판단은 남아 있으며, deliberation은 직접 확인된 확장성 및 상태 비구별 결함에 근거해 최종 영향을 medium으로 좁혔다.
- issue-013: 근본 원인과 분리 조치에는 합의했지만 심각도에는 이견이 남아 있다. semantics는 최종본 오인과 잘못된 코드 매핑 가능성을 근거로 높은 심각도를 유지했으나, deliberation은 그 직접 경로가 입증되지 않았다고 보아 현재 확인된 배치 지연 중 시간적 불일치에 맞춰 medium으로 좁혔다. axiology는 이를 독립적으로 판단할 canonical 제품 원칙이 부족하다고 봤다.
- issue-005: 원인과 필요한 조치에는 합의했지만 evolution 렌즈는 의미 연속성 훼손을 근거로 더 높은 심각도를 주장했다. 실제 오귀속·재해석 사례와 영향 범위가 입증되지 않아 현재는 medium으로 한정하며, 해당 증거가 확보되면 심각도를 재평가해야 한다.
- issue-011: 렌즈 간 미해결 이견은 없지만, completed를 역사적 전이 사실로 볼지 현재 완료 조건을 지속적으로 보장하는 상태로 볼지는 문서에서 아직 선택되지 않았다.
- issue-018: semantics 렌즈는 미통보 Result를 통보 완료로 오인할 위험을 근거로 high 심각도를 주장했지만, 경계 내에는 그러한 오인이 실제로 발생하거나 교환되는 사례와 그 임상·운영 영향이 없다. 따라서 원인과 조치는 수렴했으나 심각도는 medium으로 한정되며, high 상향 여부는 해당 실행 사례와 영향 근거가 추가될 때 재평가해야 한다.

## Deliberation Decision
- issue-003: narrowed
- issue-004: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: narrowed
- issue-013: narrowed
- issue-017: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-005: narrowed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: narrowed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-018: narrowed
- issue-019: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-003: 임상의가 신뢰할 결과·보고 상태와 중요결과 통보를 EMR/LIS 통합 권위로 제공하는 목적
- issue-004: 임상의가 신뢰하는 보고 상태를 포함한 EMR/LIS 개념 권위 제공
- issue-007: EMR/LIS 연동에서 주문 카탈로그와 수행 카탈로그를 일관되게 매핑·확장하는 개념 권위 제공 Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 카탈로그의 일관된 확장과 추적 가능성 Source finding context: EMR/LIS 통합의 개념 권위 문서로서 주문 카탈로그와 LIS 수행 카탈로그의 의미를 일관되게 매핑하는 목적
- issue-009: EMR/LIS 통합에서 환자·검사·조직·인력 식별을 위한 개념 권위
- issue-010: 운영 정책 변경에도 위험 결과 판정과 통보를 의미 손실 없이 교환하는 EMR/LIS 개념 모델 Source finding context: 운영 정책 변경에도 유지되는 임상검사 워크플로 개념 모델 Source finding context: 위험 결과 판정과 통보를 EMR/LIS 사이에서 의미 손실 없이 교환하는 목적
- issue-013: EMR이 임상의에게 전달할 결과 및 보고 상태를 LIS와 의미적으로 일관되게 해석하는 목적
- issue-017: Using the ontology as the conceptual authority for EMR/LIS integration from Order through Report.
- issue-002: Order부터 Report까지의 EMR/LIS 통합 상태 모델을 개념 권위로 제공하는 목적
- issue-005: EMR 주문 카탈로그와 LIS 수행 카탈로그 간 개념 권위를 제공하는 목적
- issue-006: Order부터 Report까지의 임상검사 파이프라인을 EMR/LIS 통합 개념 모델로 제공하는 목적
- issue-008: EMR/LIS 사이에서 결과와 보고 상태를 장기간 동일하게 해석하는 권위 계약
- issue-011: EMR/LIS 통합에서 Order 상태를 일관된 개념 권위로 사용하는 목적
- issue-012: 임상의와 EMR/LIS가 신뢰할 수 있는 단일 결과 상태 권위를 제공하는 목적
- issue-014: EMR/LIS가 주문 우선순위를 동일하게 해석하고 라우팅하는 목적
- issue-015: LIS 결과의 검체 및 수행 계보를 EMR에 정확히 전달하는 목적
- issue-016: 통합 시스템에서 검사 처리시간 지표를 동일한 의미로 계산하는 목적
- issue-018: Serving as an operational EMR/LIS conceptual authority, including the declared immediate-notification workflow.
- issue-019: Providing an authoritative shared state model for EMR/LIS workflow integration.

## Final Review Result
18 material issue(s) require attention. Highest-priority issue: issue-003 (high) — 검증·배포·정정·중요결과 통보를 독립 사건으로 보존하지 않아 서로 다른 실행 이력이 동일한 현재 상태로 붕괴하며, 책임 주체와 완료 여부를 권위 모델만으로 구별·재구성할 수 없다. 직접 입증된 결함 범위는 medium으로 좁혀졌지만, 목표 릴리스에서 반드시 해소해야 하는 material 이슈다. Unresolved disagreement remains: logic은 사건 이력의 비구별성과 medium 결함만 직접 입증됐다고 보아 범위를 좁혔고, coverage는 감사 증거 전체의 high 실패를 유지한다. 각 통제 행위의 권위 있는 필수 감사 요건과 실제 임상·감사 영향 사례가 없어 이 심각도 이견은 남아 있다.

## Boundary Notes
- 외부 전화 대장의 구조와 보존 정책은 현재 경계에서 확인할 수 없다.
- 통제 행위별 필수 감사 필드와 재구성 요건을 정한 권위 기준이 제공되지 않았다.
- 현재 경계 자료만으로 실제 기관 카탈로그에서 Test와 Assay가 일대일, 일대다 또는 부분 중첩인지 확정할 수 없다.

## Immediate Actions Required
- issue-003 (high): fix_before_release, fix_now
- issue-004 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-010 (high): fix_before_release, fix_now
- issue-013 (high): fix_before_release, fix_now
- issue-017 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, accept_risk, fix_now
- issue-014 (medium): fix_before_release, fix_now
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, fix_now
- issue-018 (medium): fix_before_release, fix_now
- issue-019 (medium): fix_before_release, fix_now

## Recommendations
- issue-001 (medium): 필수 가치 권위 문서가 바인딩되지 않아 온톨로지의 목적·가치 정렬 여부를 신뢰성 있게 판단할 수 없다. Source finding context: .onto/review/20260718-8de943b3/execution-preparation authority binding Source finding context: axiology role §Authoritative alignment input/§Finding evidence requirements; context-candidate-assembly.yaml:1 (`system_purpose_refs: []`); review-value-alignment-criteria.yaml:criteria[0] Source finding context: 필수 가치 권위 문서가 바인딩되지 않아 온톨로지의 목적·가치 정렬 여부를 판단할 근거가 부족하다. Source finding context: 사용자 요청은 검토 목적을 설명하지만 canonical 개념 의미와 제품 원칙을 대신하지 못한다. 따라서 현재 경계에서 특정 모델링 결정을 aligned 또는 misaligned로 판정하면 개인 해석이 되며, 이 렌즈 결과의 신뢰성이 약화된다. Source finding context: 필수 순위 1~2 authority 문서를 실행 준비 단계에 명시적으로 바인딩하고 axiology 패킷에 주입한 뒤 이 렌즈를 다시 실행한다. 읽기 권한을 부여할 수 없다면 axiology 결과를 indeterminate로 표시한다. Source finding context: .onto/review/20260718-8de943b3/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: EMR/LIS 통합의 개념 권위 문서로서 온톨로지의 목적·가치 정렬을 검증하는 axiology 리뷰 Source finding context: 필수 canonical authority chain 없이 사용자 요청과 대상 문서만으로 가치 판단을 수행할 때 Source finding context: 정렬·위반 판단을 권위 근거에 추적할 수 없어 axiology 결과를 승인 또는 개선 결정의 근거로 신뢰하기 어렵다. Source finding context: execution preparation이 axiology 계약상 필수인 canonical authority source set을 바인딩하지 않았다. Source finding context: 현재 axiology 단위는 대상 온톨로지에 대한 근거 기반 가치 정렬 판정을 완료할 수 없다. Source finding context: 허용된 컨텍스트에 canonical system-purpose authority reference가 하나도 없다. Source finding context: 필수 authority 문서가 실행 준비 결과와 렌즈 소비 컨텍스트에 바인딩되지 않았다.

## Unique Finding Tagging
- issue-001 (medium): 필수 가치 권위 문서가 바인딩되지 않아 온톨로지의 목적·가치 정렬 여부를 신뢰성 있게 판단할 수 없다. Source finding context: .onto/review/20260718-8de943b3/execution-preparation authority binding Source finding context: axiology role §Authoritative alignment input/§Finding evidence requirements; context-candidate-assembly.yaml:1 (`system_purpose_refs: []`); review-value-alignment-criteria.yaml:criteria[0] Source finding context: 필수 가치 권위 문서가 바인딩되지 않아 온톨로지의 목적·가치 정렬 여부를 판단할 근거가 부족하다. Source finding context: 사용자 요청은 검토 목적을 설명하지만 canonical 개념 의미와 제품 원칙을 대신하지 못한다. 따라서 현재 경계에서 특정 모델링 결정을 aligned 또는 misaligned로 판정하면 개인 해석이 되며, 이 렌즈 결과의 신뢰성이 약화된다. Source finding context: 필수 순위 1~2 authority 문서를 실행 준비 단계에 명시적으로 바인딩하고 axiology 패킷에 주입한 뒤 이 렌즈를 다시 실행한다. 읽기 권한을 부여할 수 없다면 axiology 결과를 indeterminate로 표시한다. Source finding context: .onto/review/20260718-8de943b3/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: EMR/LIS 통합의 개념 권위 문서로서 온톨로지의 목적·가치 정렬을 검증하는 axiology 리뷰 Source finding context: 필수 canonical authority chain 없이 사용자 요청과 대상 문서만으로 가치 판단을 수행할 때 Source finding context: 정렬·위반 판단을 권위 근거에 추적할 수 없어 axiology 결과를 승인 또는 개선 결정의 근거로 신뢰하기 어렵다. Source finding context: execution preparation이 axiology 계약상 필수인 canonical authority source set을 바인딩하지 않았다. Source finding context: 현재 axiology 단위는 대상 온톨로지에 대한 근거 기반 가치 정렬 판정을 완료할 수 없다. Source finding context: 허용된 컨텍스트에 canonical system-purpose authority reference가 하나도 없다. Source finding context: 필수 authority 문서가 실행 준비 결과와 렌즈 소비 컨텍스트에 바인딩되지 않았다.

## Shared Phenomenon Summary
- none
