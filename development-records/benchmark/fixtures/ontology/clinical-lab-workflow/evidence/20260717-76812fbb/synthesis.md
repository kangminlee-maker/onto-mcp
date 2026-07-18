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
- issue-001 (high): Result 정정 상태와 Report 개정·발행 상태를 같은 정보로 취급하면서 각각 독립 권위로 둔 설계는 임상의에게 오래된 보고 상태를 최신 상태처럼 노출할 수 있는 고심각도 결함이다.
  - root cause: 동일한 결과 상태를 Result와 Report에 각각 권위 값으로 저장하면서 정합성을 비동기 야간 배치에 맡긴 설계
  - materiality: 이 설계에서는 Result.status가 corrected로 바뀐 뒤에도 야간 동기화 전까지 Report.result_status가 finalized로 남을 수 있다. 따라서 임상의와 통합 구현이 잘못된 최종 상태를 신뢰하게 되어, EMR/LIS 통합의 개념 권위를 제공하고 최신 보고 상태를 신뢰할 수 있게 한다는 문서의 핵심 목적과 환자 안전을 직접 훼손한다.
  - action: 먼저 Result 상태와 Report 상태의 의미 및 각 권위 범위를 분리하고 두 lifecycle 사이의 명시적 상태 매핑과 전이 계약을 정의해야 한다. 그다음 Result 정정 시 동일 트랜잭션 또는 신뢰 가능한 즉시 이벤트로 Report의 개정 전이를 보장하고, 전파에 실패하면 Report를 stale 또는 blocked로 표시해야 한다. 이 조치는 야간 배치가 성공할 때까지 finalized가 신뢰 가능한 상태로 노출되는 경로를 즉시 차단해야 하므로 대상 범위에서 반드시 지금 닫아야 한다.
- issue-002 (high): CriticalValue가 재사용 가능한 임계값 정책과 결과별 통보 상태를 동시에 소유해, 어떤 위험 결과가 누구에게 언제 전달·확인되었는지를 권위 있게 판정할 수 없다.
  - root cause: 재사용 가능한 임계값 정책과 결과별 통보 사건을 하나의 CriticalValue 개념에 결합하고, 통보 증거를 boolean과 연결되지 않은 외부 장부에 분산했다.
  - materiality: EMR/LIS 통합은 위험 결과의 즉시 통보와 그 이행 증거를 일관되게 제공해야 한다. 그러나 단일 notified 불리언과 연결되지 않은 외부 전화 기록만으로는 결과별 통보 지연·실패·중복이나 수신 확인을 재구성할 수 없어 환자안전 통제와 장애 감사의 신뢰가 훼손된다.
  - action: 먼저 CriticalValue를 재사용 가능한 임계값 규칙으로 한정하고, 결과별 CriticalNotification 사건을 별도 개념으로 분리해야 한다. 이어 각 사건을 triggering Result와 임계값 규칙, 통보자·수신자, 발생·시도·전달·확인 시각, 채널, 상태, 재시도·에스컬레이션 및 외부 기록 참조에 연결해야 한다. 이 순서로 정책 권위를 먼저 분리해야 사건별 운영 상태와 감사 증거의 소유권을 일관되게 정의할 수 있다.
- issue-003 (high): 서로 다른 생명주기의 Test와 Assay를 유지하면서 권위·cardinality·유효기간·버전·폐기 상태가 있는 명시적 매핑 없이 이중 수동 등록하도록 한 것이 주문–수행 대응의 모호성과 변경 이력 결손을 만든 현재의 중대한 차단 문제다.
  - root cause: Test와 Assay를 별도 유지하면서 권위 있는 시간 유효 매핑 대신 이중 수동 등록을 채택한 것이 현재 대응 모호성과 변경 이력 결손을 함께 만든다. / Test와 Assay의 정체성·역할 차이를 결정하지 않은 채 명시적 매핑 없이 병행 등록한 것이 권위·이력 누락과 의미적 미결정을 함께 유발한다. / 병행 카탈로그 운영에서 Test–Assay 대응을 구조화하지 않은 것이 카탈로그 권위 결손과 주문에서 수행 단위로의 경로 단절을 함께 만든다. / 수행된 검사·Assay를 주문, 검체, Result 사이의 명시적 중간 실행 개념으로 연결하지 않은 것이 주문→수행 매핑 단절과 Result provenance 오귀속을 함께 만든다.
  - materiality: EMR 주문 카탈로그와 LIS 수행 카탈로그를 연결하는 개념 권위가 선언된 목적이지만, 현재 모델만으로는 어떤 Assay가 주문된 Test를 수행하는지, 어느 시스템 값이 권위 있는지, 과거 시점의 대응이 무엇이었는지 결정할 수 없다. 그 결과 통합 구현이 사설 매핑에 의존하며 중복·누락·오대응과 인터페이스 드리프트 위험이 생긴다.
  - action: Test와 Assay는 실제 동일성이 입증되지 않는 한 별도 canonical 개념으로 유지하되, TestAssayMapping 또는 명시적 performed_by/implements 관계를 추가해야 한다. 먼저 관계의 권위 시스템, cardinality, effective_from/effective_to, version, 폐기 상태와 코드 소유권을 정의하고, 패널처럼 하나의 주문이 여러 수행 항목으로 확장되는 경우를 표현해야 한다. 이후 이중 수동 등록을 권위 원본에서의 파생 또는 검증된 동기화로 대체해야 시점별 대응과 변경 이력을 일관되게 보장할 수 있다.
- issue-006 (high): Result와 Report의 상태 관계가 동일 상태의 투영인지 서로 다른 lifecycle 간 전이인지 정의되지 않았고, 불일치 시점의 임상 권위 판정 계약도 없어 다음 단계 전에 반드시 결정해야 하는 고위험 일관성 문제다.
  - root cause: 하나의 결과 상태 정보를 두 엔티티에 물리적으로 유지하면서 단일 권위와 시간성 있는 투영 계약을 정의하지 않았다.
  - materiality: Result가 corrected된 뒤 Report가 amended되기 전까지 또는 배치가 실패한 동안 EMR은 Report.result_status를 근거로 이미 정정된 결과를 finalized로 표시할 수 있다. 이는 EMR과 LIS가 현재 임상 상태를 동일하게 해석해야 한다는 목적을 훼손하며, 소비자마다 서로 다른 값을 권위로 선택하게 만든다.
  - action: 다음 단계 전에 Result–Report 상태 관계를 먼저 결정해야 한다. 동일 임상 상태라면 Result 측의 단일 권위를 지정하고 Report.result_status를 유효시각과 동기화 상태를 가진 파생 투영으로 정의한다. 서로 다른 lifecycle이라면 두 상태를 분리하고 완전한 매핑, 전이 조건, 유효시각, 동기화 실패 표시 및 충돌 처리 규칙을 추가한다. 이 결정은 issue-001의 신뢰성 영향 및 issue-013의 lifecycle 의미 경계와 함께 정합성을 확인해야 한다.
  - unresolved disagreement: 관계·시간성 계약의 결손에는 합의했지만, semantics 관점은 근본 원인을 동일 상태의 중복이 아니라 구별된 Result·Report lifecycle을 동일시한 의미론적 오류로 본다. 따라서 두 lifecycle의 동일성 여부는 아직 확정되지 않았다.
- issue-008 (high): Test–Assay의 이중 등록과 시간 유효한 명시적 매핑 부재는 카탈로그 변경을 결합시키고 과거 주문–수행 대응을 잃게 한다. 다만 심의 결과 이 문제는 독립 근본 원인이라기보다 issue-003의 시간 유효 카탈로그 매핑 결손에서 파생된 진화 위험으로 좁혀졌다.
  - root cause: 주문 카탈로그와 수행 카탈로그 사이에 단일 권위 또는 버전 가능한 명시적 매핑이 없고 중복 등록을 운영 규칙으로 채택했다.
  - materiality: 신규 검사, 분석법 교체, 장비별 수행 분기 또는 코드 개정 때 Test와 Assay가 불일치하거나 과거 매핑이 사라지면 EMR의 주문 개념과 LIS의 실제 수행 개념을 안정적으로 연결할 수 없다. 이에 따라 통합 규칙의 결정성, 기존 데이터의 연속성, 검사 카탈로그를 개념 권위로 사용하는 신뢰가 훼손된다.
  - action: 별도 독립 수정 단위로 확장하기보다 issue-003의 수용 기준에서 함께 닫아야 한다. Test를 주문 가능한 검사 개념의 권위로 유지하고 Assay를 버전 가능한 수행 정의로 구분한 뒤, 매핑 식별자와 유효기간을 가진 명시적 Test–Assay 관계를 권위화해야 한다. 신규 등록은 Test에서 시작해 매핑으로 Assay에 연결하고, 분석법 교체·장비별 분기·코드 개정 시 과거 매핑을 보존하도록 해야 한다.
  - unresolved disagreement: 심의는 issue-003의 원인과 조치에 포함된다고 좁혔으나, evolution 렌즈는 독립적인 진화 이슈로 유지해야 한다고 보았고 structure 렌즈는 제공된 근거만으로 병합을 확정하지 않았다.
- issue-013 (high): Result.status and Report.result_status represent different lifecycle concepts and must not be treated as duplicated authorities for the same fact. Issue-013 remains the canonical semantic root cause; Issue-001 separately captures its clinical-reliability impact.
  - root cause: The model conflates result-instance status with report lifecycle/amendment status while assigning both independent authority.
  - materiality: The ontology is intended to guide EMR/LIS status integration, but its current contract permits a corrected result to coexist with a still-finalized clinician-facing report until synchronization. Consumers following the ontology can therefore display stale or semantically incorrect status, undermining consistency and trust in the declared conceptual authority.
  - action: Define ResultStatus and ReportStatus as distinct concepts and designate exactly one authoritative field for each. Then specify the transition from a corrected result to an amended report and execute that report transition within correction handling, rather than waiting for nightly synchronization. The concept and authority split must precede integration mapping so consumers can distinguish source state from its report-level consequence and future status additions can evolve without ambiguous coupling.
- issue-015 (high): Order·Specimen·Report의 상태 목록만으로는 공유 lifecycle 계약이 성립하지 않는다. 각 lifecycle을 명시적 전이 그래프로 완성해 허용·금지 경로를 공통으로 판정할 수 있어야 한다.
  - root cause: 상태 모델을 명시적 전이 그래프가 아니라 상태 열거와 일부 자연어 규칙으로만 표현했다.
  - materiality: EMR과 LIS가 다음 허용 상태, 취소 가능 시점, 검체 진행 조건을 동일하게 판단해야 하지만 현재 모델은 그 계약을 제공하지 않는다. 그 결과 시스템별 구현이 분기되고 잘못된 상태 조합을 권위 모델에서 구조적으로 거부할 수 없어, 공유 상태 모델의 개념 권위라는 목적이 직접 약화된다.
  - action: Order·Specimen·Report를 동일한 상태 모델 구조로 통합하고 각 lifecycle에 from, to, trigger, guard가 명시된 전이를 추가해야 한다. 이어 모든 선언 상태가 적어도 하나의 유효한 진입 또는 진출 경로를 갖는지, 금지 경로가 거부되는지 검증해야 한다. 다만 실제 업무별 guard와 책임 시스템은 별도 근거로 확정해야 한다.
- issue-004 (medium): TAT의 시작·종료 범위와 경계 사례 규칙이 권위 모델에 정의되지 않아 동일 검사 흐름에서도 소비자별 TAT가 달라질 수 있다. 이 문제는 통합 운영 지표를 사용하기 전에 해소해야 한다.
  - root cause: 공유 파생 지표인 TAT의 의미와 예외 규칙을 개념 권위 문서가 소유하지 않고 개별 소비자 팀의 계산식에 위임했다.
  - materiality: EMR/LIS 통합의 목적은 공통 워크플로와 운영 의미를 권위 있게 제공하는 것이다. 취소·재채취·수정 보고·누락 시각을 소비자가 각자 해석하면 TAT가 일관된 공유 지표로 기능하지 못해 시스템 간 운영 비교, SLA 판단, 개선 의사결정의 신뢰가 약화된다.
  - action: TAT를 collected_at과 released_at에서 파생되는 권위 있는 명명 projection으로 정의하고, 포함·제외 조건, 취소·재채취·수정 보고·누락 시각 처리, 시간대 및 버전 규칙을 온톨로지 또는 연결된 권위 계약에 명시해야 한다. 대시보드 등 소비자는 이 계약을 구현하도록 하며, 통합 지표를 배포·사용하기 전에 계약을 확정해야 재현성과 소비자 간 일관성을 확보할 수 있다.
- issue-005 (medium): Specimen lifecycle이 정상 분석 구간에만 한정되어 전처리 예외와 분석 후 종결을 함께 표현하지 못하므로, 다음 단계 전에 채취·인계·품질 판정·거부·재채취부터 보관·폐기까지 공통 lifecycle 또는 사건 모델을 확장해야 한다.
  - root cause: Specimen을 정상 분석 구간의 상태 목록으로만 모델링하고 채취·인계·예외와 분석 후 보관·폐기를 lifecycle 밖에 두었다.
  - materiality: 통합 권위 모델은 주문부터 보고와 검체 종결까지 상태와 책임을 일관되게 판정할 수 있어야 한다. 그러나 현재 모델로는 채취 실패·운송 문제·부적합 거부·재채취의 원인과 계보, 분석 완료 후 보관 위치·재검 가능 여부·폐기 이력을 공통으로 표현할 수 없어 EMR과 LIS 사이에서 주문 상태, TAT, 사용자 안내 및 검체 책임 해석이 달라질 수 있다.
  - action: 다음 단계 전에 Specimen lifecycle 또는 사건 모델을 확장해 채취·인계·품질 판정·거부·재채취와 보관·폐기를 연결해야 한다. 먼저 허용 상태와 사건 및 전이를 정의하고, 각 전이에 시각·행위자·근거를 결합하며, 재채취 검체 계보와 적용 보존정책 참조를 모델링해야 한다. 그래야 예외 처리와 종결 책임을 동일한 권위 모델에서 추적하고 시스템 간 상태·TAT·안내의 분기를 방지할 수 있다.
- issue-009 (medium): 검체 원천 범주, 처리 재료, 채취 한정자가 서로 다른 enum과 자유 문자열에 분산되어 있어 Specimen·Test·Assay 간 재료 호환성을 일관되게 판정할 수 없다. 이 문제는 다음 단계 전에 해소해야 한다.
  - root cause: 검체 원천 범주, 처리된 재료와 채취 한정자를 공통 식별자·계층·버전이 있는 개념으로 분리하지 않고 폐쇄형 enum과 자유 문자열에 내장했다.
  - materiality: 새 검체 유형이나 세분화된 LIS 코드가 들어오면 여러 스키마와 매핑을 반복 수정해야 하며, blood와 whole blood·serum 또는 urine과 random urine의 차이를 정확히 검증하지 못한다. 그 결과 EMR/LIS가 잘못된 재료를 호환된 것으로 받아들이거나 유효한 조합을 거부하여 검체 의미 공유와 assay routing 목적을 약화한다.
  - action: 버전 가능한 공통 검체·재료 개념을 먼저 정의하고, 원천 범주·처리 재료·채취 한정자의 계층과 관계를 명시해야 한다. 이어 Specimen, Test, Assay가 이 공통 식별자를 일관되게 참조하도록 전환하고, 기존 및 외부 문자열은 유효기간이 있는 별칭·매핑으로 보존해야 한다. 공통 권위와 매핑을 먼저 확립해야 데이터 마이그레이션 중 의미 연속성을 유지하면서 이후 스키마 참조를 안전하게 통합할 수 있다.
- issue-010 (medium): Result와 Report를 동일 상태의 복제본으로 취급할 문제가 아니라, 서로 다른 lifecycle 사이의 상태 전이 계약이 불완전한 문제다. 버전 가능한 전체 전이 규칙, 미지원 상태와 과거 버전 처리, Order 완료 의미 연결을 다음 단계 전에 확정해야 한다.
  - root cause: Result와 Report에 별도 폐쇄형 상태 어휘를 저장하면서 버전이 있고 완전한 상태 투영 및 미지원 상태 처리 계약을 정의하지 않았다.
  - materiality: 새 LIS 상태의 추가·의미 변경 또는 과거 데이터 재처리 시 EMR에 표시할 Report 상태와 Order 완료 여부를 일관되게 결정하거나 재현할 수 없다. 이는 LIS 결과 상태를 EMR 보고 및 주문 완료 의미로 안정적으로 전달한다는 개념 계약을 약화시키며, 여러 enum과 규칙의 동시 변경도 요구한다.
  - action: 각 lifecycle의 상태 권위를 유지하면서 Result에서 Report 상태 및 Order 완료 의미로 이어지는 전이를 완전하고 버전 가능한 계약으로 정의해야 한다. 모든 입력 상태에 대한 결과, 미지원 상태의 표시·보류·오류 처리, 규칙 버전별 유효 범위와 과거 데이터 재처리 방식을 포함해야 하며, 새 LIS 상태를 도입하는 다음 단계 전에 이를 닫아야 한다.
- issue-011 (medium): STAT 우선순위가 Order.priority, is_stat, StatOrder에 각각 독립적으로 영속화되어 서로 모순되는 긴급도 판정이 가능하므로, 다음 단계 전에 단일 권위와 파생 규칙을 확정해야 한다.
  - root cause: 하나의 우선순위 개념을 속성과 규칙으로 확장하지 않고 동일한 STAT 의미를 세 개의 독립 개념 표면에 영속화했다.
  - materiality: 이 중복 표현은 EMR과 LIS가 확장 가능한 우선순위 의미를 일관되게 공유하려는 목적을 약화한다. 새 긴급 범주를 추가하거나 STAT 표현을 통합할 때 세 표현과 소비자를 동시에 변경해야 하며, 해석 차이로 일부 연동 경로의 처리 누락과 기존 데이터 마이그레이션 위험이 발생한다.
  - action: 먼저 Order.priority를 canonical 우선순위 분류로 확정해야 한다. 다음으로 is_stat은 priority에서 계산되는 파생 속성으로 명시하거나 제거한다. StatOrder는 STAT만의 독립 lifecycle이나 규칙이 입증될 때만 유지하고, 그렇지 않으면 stat_reason을 조건부 Order 속성으로 통합한다. 이 권위와 파생 규칙을 먼저 정한 뒤 소비자 규칙과 기존 데이터의 호환성 마이그레이션을 함께 적용해야 한다.
- issue-012 (medium): Order 완료 규칙은 비어 있지 않은 기대 Result 집합이 존재하고, ordered_tests에서 요구되는 모든 Result가 생성되어 final 상태일 때만 완료되도록 보완해야 한다.
  - root cause: Order 완료 규칙의 보편양화에 Result 존재성과 ordered_tests에서 파생되는 기대 결과 완전성 조건이 포함되지 않았다.
  - materiality: 현재 규칙에서는 Result가 없거나 기대 결과가 누락되어도 ‘모든 Result가 final’이라는 조건이 형식적으로 참이 될 수 있다. 그 결과 미완료 Order가 completed로 판정되어 EMR과 LIS의 workflow 상태 및 인터페이스 이벤트가 서로 다르거나 부정확해질 수 있으므로, 동일한 완료 판정 규칙을 제공하려는 목적이 약화된다.
  - action: 먼저 ordered_tests와 Test–Result 관계에서 Order별 기대 Result 집합을 명확히 정의해야 한다. 이어 완료 조건을 그 집합이 비어 있지 않고, 모든 기대 Result가 실제로 생성되었으며, 생성된 모든 기대 Result가 final인 경우로 한정해야 한다. 이 순서로 양화 범위와 완전성을 먼저 확정해야 EMR과 LIS가 동일하고 재현 가능한 완료 판정을 적용할 수 있다.
- issue-014 (medium): Issue-014는 독립 이슈가 아니라 issue-011의 중복 STAT 권위 결함이 드러난 의미 계약 측면이다. issue-011에 통합하되, priority, is_stat, StatOrder 사이의 필요충분조건과 파생 방향을 명시적 수용 기준으로 보존해야 한다.
  - root cause: One order-urgency concept has three independent representations with no declared canonical authority or derivation rule.
  - materiality: EMR/LIS가 서로 다른 STAT 표현을 권위로 사용하거나 표현들이 불일치하면 동일 주문의 긴급 라우팅과 처리 우선순위가 시스템마다 달라질 수 있다. 따라서 명확한 주문 우선순위 의미를 제공하려는 목적이 약화된다.
  - action: issue-011의 수정 범위에서 하나의 canonical STAT 분류를 정하고, 권장대로 priority 값을 권위로 삼아 is_stat을 파생해야 한다. StatOrder는 별도의 정체성이나 생명주기 의미가 입증될 때만 유지하고, 유지한다면 소속의 필요충분조건과 canonical 값에 대한 파생 방향을 명시해야 한다. 이 계약은 대상 문서에서 반드시 닫혀야 하는 수용 기준이다.
- issue-016 (medium): CriticalValue의 `notified` 상태는 특정 Result 발생 건에 귀속되지 않아 결과별 통보 대상을 식별하거나 감사 가능한 상태로 교환할 수 없다. 이 문제는 독립 원인이 아니라 issue-002의 정책·사건 혼합에서 파생된 구조·의미 증상이며, 사건별 귀속 요구를 issue-002의 필수 수용 기준으로 보존해야 한다.
  - root cause: 재사용되는 임계값 정의가 결과별 통보 상태를 직접 소유하고 CriticalValue와 실제 Result 발생 건 사이의 연결을 두지 않았다.
  - materiality: 동일 Test와 임계값 정책이 여러 환자·시점의 Result에 반복 적용될 때 단일 `notified` 값만으로는 어느 위험 결과가 누구에게 언제 통보되었는지 구분할 수 없다. 따라서 위험 결과와 통보 상태를 EMR/LIS 간 일관되게 연결한다는 목적이 약화되고, 환자안전 통제와 감사 가능한 상태 교환이 불가능해진다.
  - action: 별도 수정 단위로 처리하기보다 issue-002를 닫는 변경에 포함해야 한다. 임계값 정책에서 결과별 통보 발생을 분리하고, 각 발생 건에 Result 참조·수신자·통보 시각·완료 상태를 함께 연결해야 한다. 완료 기준은 반복되는 Result마다 통보 대상과 상태를 독립적으로 식별하고 EMR/LIS가 이를 감사 가능하게 교환할 수 있는지로 삼아야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-006: 관계·시간성 계약의 결손에는 합의했지만, semantics 관점은 근본 원인을 동일 상태의 중복이 아니라 구별된 Result·Report lifecycle을 동일시한 의미론적 오류로 본다. 따라서 두 lifecycle의 동일성 여부는 아직 확정되지 않았다.
- issue-008: 심의는 issue-003의 원인과 조치에 포함된다고 좁혔으나, evolution 렌즈는 독립적인 진화 이슈로 유지해야 한다고 보았고 structure 렌즈는 제공된 근거만으로 병합을 확정하지 않았다.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-003: narrowed
- issue-006: narrowed
- issue-008: narrowed
- issue-013: resolved
- issue-015: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: resolved
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-014: resolved
- issue-016: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 엔티티·상태의 개념 권위를 제공하고 임상의가 신뢰할 수 있는 최신 보고 상태를 정의하는 목적
- issue-002: EMR/LIS 통합에서 위험 결과의 즉시 통보 의미와 운영 증거를 일관되게 제공하는 목적 Source finding context: EMR/LIS 통합의 개념 권위 문서가 즉시 통보가 필요한 위험 결과의 운영 계약을 일관되게 제공하는 목적 Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 중요값 통보 통제와 운영 증거를 일관되게 표현하는 목적 Source finding context: Provide authoritative entity meanings for EMR/LIS critical-result integration.
- issue-003: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 공통 개념 권위를 제공하는 목적 / EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 권위를 제공하는 목적 / Serve as the conceptual authority for mapping EMR order catalogs to LIS execution catalogs. / EMR/LIS 연동 설계에서 주문 카탈로그와 분석기 수행 단위를 연결하는 개념 권위 제공 / Authoritatively describe result provenance across EMR and LIS.
- issue-006: EMR/LIS가 결과의 현재 임상 상태를 동일하게 해석하도록 하는 개념 권위 목적
- issue-008: EMR/LIS 연동 설계에서 검사 카탈로그의 개념 권위를 제공하는 목적
- issue-013: Use of the ontology as the conceptual authority for EMR/LIS status integration.
- issue-015: EMR/LIS가 공유할 주문·검체·보고 상태 모델의 개념 권위 제공
- issue-004: EMR/LIS 통합에서 공통 워크플로와 운영 지표의 의미를 권위 있게 제공하는 목적 Source finding context: EMR/LIS 통합에서 공통 워크플로 개념과 운영 의미를 권위 있게 제공하는 목적
- issue-005: 주문부터 보고 및 검체 종결까지 임상검사 workflow를 통합 권위 모델로 제공하는 목적 Source finding context: 주문부터 보고까지의 임상검사 엔티티·관계·상태를 통합 권위 모델로 제공하는 목적 Source finding context: Order부터 Report까지 전 구간의 임상검사 워크플로를 통합 모델로 제공하는 목적
- issue-009: 새 검사와 분석법을 수용하면서 EMR/LIS 간 검체 의미와 assay routing을 지속적으로 공유하는 목적 Source finding context: 새 검사와 분석법을 수용하면서 EMR/LIS 간 검체 의미를 지속적으로 공유하는 목적 Source finding context: Provide shared specimen semantics for order validation and assay routing between EMR and LIS.
- issue-010: LIS 결과 상태를 EMR 보고 및 주문 완료 의미로 안정적으로 전달하는 개념 계약
- issue-011: EMR 주문 우선순위와 LIS 특수 처리 의미를 확장 가능하게 공유하는 목적
- issue-012: EMR/LIS가 동일하게 적용할 수 있는 Order 완료 판정 규칙 제공
- issue-014: Provide unambiguous order-priority semantics for EMR/LIS integration.
- issue-016: 위험 결과와 통보 상태를 EMR/LIS 간 일관되게 연결하는 운영 개념 모델

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result 정정 상태와 Report 개정·발행 상태를 같은 정보로 취급하면서 각각 독립 권위로 둔 설계는 임상의에게 오래된 보고 상태를 최신 상태처럼 노출할 수 있는 고심각도 결함이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 야간 배치의 정확한 최대 지연과 장애 복구 방식은 경계 내 증거로 확인되지 않았다.
- 외부 전화 기록 대장의 실제 스키마, 정합성, 보존 및 장애 처리 계약은 허용된 경계에서 확인되지 않았다.
- 실제 EMR/LIS 카탈로그 cardinality와 운영 매핑 규칙은 경계 내 근거로 확정할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-006 (high): fix_before_release, accept_risk
- issue-008 (high): follow_up, fix_now
- issue-013 (high): fix_now
- issue-015 (high): fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_now
- issue-014 (medium): fix_before_release, follow_up, fix_now
- issue-016 (medium): fix_now, follow_up

## Recommendations
- issue-007 (high): 정정 계보와 정정 후 Order 완료 상태의 재평가 계약이 없어 과거 보고 변경과 현재 workflow 상태를 일관되게 재구성할 수 없다. Source finding context: 결과 정정·재발행 lifecycle과 감사 이력 Source finding context: materialized-input.md:62-84,121-123 — corrected/amended 상태는 있으나 Result에는 verified_by만 있고 Report에는 released_at만 있으며 정정 사건·사유·버전·대체 관계가 없다. Source finding context: 종결 결과 이후의 정정·재발행을 재구성할 lifecycle 및 감사 차원이 누락되었다. Source finding context: corrected와 amended는 현재 상태만 나타내므로 어떤 내용이 언제 누구에 의해 변경되어 어느 보고서를 대체했는지 권위 문서만으로 재구성할 수 없다. Source finding context: ResultRevision/ReportRevision 또는 Amendment 사건을 추가하고 이전 버전 관계, 변경 전후 값, 사유, 행위자, 발생·검증·재발행 시각 및 수신 통지를 모델링한다. Source finding context: .onto/review/20260717-76812fbb/round1/coverage.findings.yaml#coverage-candidate-005 Source finding context: 최종·정정 결과와 보고의 lifecycle을 임상적으로 추적 가능한 권위 모델로 제공하는 목적 Source finding context: 최종 보고 후 결과가 정정되어 과거 보고 내용과 변경 경위를 감사하거나 임상의 통지를 입증해야 할 때 Source finding context: 현재 상태만 남아 정정 계보와 책임 증거를 복원할 수 없으며, 이전 보고를 현재 결과로 오인할 위험이 있다. Source finding context: 정정을 버전 있는 사건이 아니라 상태 enum의 최종 값으로만 모델링했다. Source finding context: Result와 Report에는 corrected/amended 상태가 존재하지만 정정 사건이나 버전 관계가 없다. Source finding context: 행위자·시각 정보도 최초 검증자와 단일 released_at에 한정된다. Source finding context: 정정 lifecycle을 상태 변경이 아닌 감사 가능한 개별 사건으로 표현하지 않았다. Source finding context: clinical-lab-ontology.yaml — Order completion state rule Source finding context: materialized-input.md:23,69-72,121-123 Source finding context: Order의 완료 판정이 이후 corrected로 바뀔 수 있는 Result.status에 의존하지만, 정정 후 Order 상태를 재평가하는 규칙이 없어 시간 전개상 완료 의미를 일관되게 유지할 수 없다. Source finding context: 충돌 쌍은 materialized-input.md:122의 완료 전이 규칙과 materialized-input.md:123의 후속 corrected 전이 규칙이다. 이는 여러 claim 사이의 시간적 충돌이며 modality는 mixed(완료 전이와 후속 정정 의무)이다. final 조건을 만족해 완료된 주문에서 정정이 발생하면 현재 상태는 completed이지만 완료 근거는 더 이상 성립하지 않는다. EMR과 LIS가 서로 다른 해석을 선택할 수 있어 개념 권위 문서의 상태 판정이 결정적이지 않다. Source finding context: 완료를 불변 종결 상태로 만들지, 정정 가능한 스냅숏 상태로 만들지 명시한다. 후자라면 corrected 발생 시 Order를 재개하거나 `completed_amended` 같은 정정 상태로 전이시키는 규칙과 재완료 조건을 추가한다. Source finding context: .onto/review/20260717-76812fbb/round1/logic.findings.yaml#logic-candidate-001 Source finding context: EMR/LIS 통합에서 Order 상태 전이의 개념 권위를 제공하는 목적 Source finding context: completed 전이 후 연결된 Result.status가 final에서 corrected로 변경되는 경우 Source finding context: 동일 사건 뒤 EMR은 completed를 유지하고 LIS는 미완료 또는 정정 진행으로 해석할 수 있어 상태 동기화와 후속 처리가 비결정적이 된다. Source finding context: 완료 조건이 가역적인 Result.status에 결합되어 있으나 정정 이후의 Order 전이 규칙이 정의되지 않았다. Source finding context: Result가 모두 final이면 Order가 completed로 전이한다. Source finding context: completed 판정 이후에도 Result.status는 corrected로 변경될 수 있다. Source finding context: Order lifecycle과 state_rules에는 정정 시 completed 상태를 재평가하거나 해제하는 전이가 없다.

## Unique Finding Tagging
- issue-007 (high): 정정 계보와 정정 후 Order 완료 상태의 재평가 계약이 없어 과거 보고 변경과 현재 workflow 상태를 일관되게 재구성할 수 없다. Source finding context: 결과 정정·재발행 lifecycle과 감사 이력 Source finding context: materialized-input.md:62-84,121-123 — corrected/amended 상태는 있으나 Result에는 verified_by만 있고 Report에는 released_at만 있으며 정정 사건·사유·버전·대체 관계가 없다. Source finding context: 종결 결과 이후의 정정·재발행을 재구성할 lifecycle 및 감사 차원이 누락되었다. Source finding context: corrected와 amended는 현재 상태만 나타내므로 어떤 내용이 언제 누구에 의해 변경되어 어느 보고서를 대체했는지 권위 문서만으로 재구성할 수 없다. Source finding context: ResultRevision/ReportRevision 또는 Amendment 사건을 추가하고 이전 버전 관계, 변경 전후 값, 사유, 행위자, 발생·검증·재발행 시각 및 수신 통지를 모델링한다. Source finding context: .onto/review/20260717-76812fbb/round1/coverage.findings.yaml#coverage-candidate-005 Source finding context: 최종·정정 결과와 보고의 lifecycle을 임상적으로 추적 가능한 권위 모델로 제공하는 목적 Source finding context: 최종 보고 후 결과가 정정되어 과거 보고 내용과 변경 경위를 감사하거나 임상의 통지를 입증해야 할 때 Source finding context: 현재 상태만 남아 정정 계보와 책임 증거를 복원할 수 없으며, 이전 보고를 현재 결과로 오인할 위험이 있다. Source finding context: 정정을 버전 있는 사건이 아니라 상태 enum의 최종 값으로만 모델링했다. Source finding context: Result와 Report에는 corrected/amended 상태가 존재하지만 정정 사건이나 버전 관계가 없다. Source finding context: 행위자·시각 정보도 최초 검증자와 단일 released_at에 한정된다. Source finding context: 정정 lifecycle을 상태 변경이 아닌 감사 가능한 개별 사건으로 표현하지 않았다. Source finding context: clinical-lab-ontology.yaml — Order completion state rule Source finding context: materialized-input.md:23,69-72,121-123 Source finding context: Order의 완료 판정이 이후 corrected로 바뀔 수 있는 Result.status에 의존하지만, 정정 후 Order 상태를 재평가하는 규칙이 없어 시간 전개상 완료 의미를 일관되게 유지할 수 없다. Source finding context: 충돌 쌍은 materialized-input.md:122의 완료 전이 규칙과 materialized-input.md:123의 후속 corrected 전이 규칙이다. 이는 여러 claim 사이의 시간적 충돌이며 modality는 mixed(완료 전이와 후속 정정 의무)이다. final 조건을 만족해 완료된 주문에서 정정이 발생하면 현재 상태는 completed이지만 완료 근거는 더 이상 성립하지 않는다. EMR과 LIS가 서로 다른 해석을 선택할 수 있어 개념 권위 문서의 상태 판정이 결정적이지 않다. Source finding context: 완료를 불변 종결 상태로 만들지, 정정 가능한 스냅숏 상태로 만들지 명시한다. 후자라면 corrected 발생 시 Order를 재개하거나 `completed_amended` 같은 정정 상태로 전이시키는 규칙과 재완료 조건을 추가한다. Source finding context: .onto/review/20260717-76812fbb/round1/logic.findings.yaml#logic-candidate-001 Source finding context: EMR/LIS 통합에서 Order 상태 전이의 개념 권위를 제공하는 목적 Source finding context: completed 전이 후 연결된 Result.status가 final에서 corrected로 변경되는 경우 Source finding context: 동일 사건 뒤 EMR은 completed를 유지하고 LIS는 미완료 또는 정정 진행으로 해석할 수 있어 상태 동기화와 후속 처리가 비결정적이 된다. Source finding context: 완료 조건이 가역적인 Result.status에 결합되어 있으나 정정 이후의 Order 전이 규칙이 정의되지 않았다. Source finding context: Result가 모두 final이면 Order가 completed로 전이한다. Source finding context: completed 판정 이후에도 Result.status는 corrected로 변경될 수 있다. Source finding context: Order lifecycle과 state_rules에는 정정 시 completed 상태를 재평가하거나 해제하는 전이가 없다.

## Shared Phenomenon Summary
- none
