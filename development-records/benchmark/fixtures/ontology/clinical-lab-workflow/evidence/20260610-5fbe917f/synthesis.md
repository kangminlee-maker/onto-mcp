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
- issue-001 (high): 결과 상태와 보고 상태의 source of truth가 문서 안에서 닫히지 않았습니다. Result.status와 Report.result_status가 같은 결과 상태 의미를 다루면서도 서로 다른 enum, 권위 선언, 동기화 규칙을 가지므로 EMR/LIS 통합자는 어느 값을 canonical authority로 삼아야 하는지 일관되게 결정할 수 없습니다.
  - root cause: Result.status와 Report.result_status가 동일 결과 상태 정보를 두 권위 표면에 중복 모델링하고 완전한 매핑 및 시간 동기화 계약을 닫지 않아 stale authority와 상태 확장 문제가 함께 발생한다.
  - materiality: 이 문서의 목적은 EMR/LIS 통합을 위한 개념 권위로서 결과·보고 상태 전이와 상태 권위를 일관되게 제공하는 것입니다. 그런데 Report.result_status가 임상의가 신뢰하는 권위 값으로 선언되어 있으면서 Result.status와 다른 값 공간을 쓰고, corrected 이후 amended 반영도 야간 배치에 의존합니다. 그 결과 corrected 결과가 생긴 뒤에도 EMR이나 임상의가 배치 전까지 stale finalized 보고 상태를 신뢰할 수 있어, 상태 precedence와 stale-state 처리 기준을 권위 문서가 보장하지 못합니다.
  - action: 결과 상태의 단일 canonical 상태 모델을 먼저 정해야 합니다. 그 다음 Report.result_status가 그 상태의 projection인지, 아니면 별도 임상 보고 lifecycle인지 명시하고, 전체 enum 매핑, 상태 precedence, corrected/amended 반영의 즉시성 또는 허용 지연 SLA를 state_rules에 포함해야 합니다. 이 순서로 닫아야 EMR, LIS, 대시보드 소비자가 동일한 상태 해석과 stale-state 처리 기준을 구현할 수 있습니다.
- issue-003 (high): issue-003은 다중 검사·다중 검체 주문에서 ordered Test를 해당 Specimen, 수행 Assay, 산출 Result에 권위 있게 연결하는 실행/매핑 bridge가 없다는 문제로 확정된다.
  - root cause: 온톨로지가 주문, 검체, 결과의 상위 엔티티는 포함했지만 다중 검사/다중 검체 상황에서 쓰이는 주문 라인 또는 접수 항목 같은 중간 실행 단위를 개념 범위에 포함하지 않았다.
  - materiality: 이 온톨로지는 EMR/LIS 연동 설계의 개념 권위 문서로서 주문부터 보고까지의 엔티티, 관계, 상태를 정의해야 한다. 그런데 하나의 Order 안에 여러 ordered_tests와 여러 Specimen이 공존할 때 어떤 검사 항목이 어떤 검체에서 수행되고 어떤 결과로 이어지는지 결정할 권위가 비어 있어, EMR 주문, LIS 접수/수행, 결과 반환 사이의 핵심 매핑 규칙이 구현별 임의 해석으로 밀려난다.
  - action: OrderItem, OrderedTest, Accession 또는 AccessionItem 같은 중간 실행/매핑 단위를 추가해 Order, Test, Specimen, Assay, Result를 ordered Test 단위로 연결해야 한다. 특히 각 라인 또는 접수 항목이 required specimen, collected/received specimen, assay mapping, result_refs를 갖도록 세분화해야 주문-접수-수행-결과 반환의 권위 경로가 문서 안에서 완결된다.
- issue-007 (high): issue-007은 Test와 Assay의 권위 경계와 그래프 연결이 닫히지 않은 high-severity 결함입니다. Test는 주문 가능한 검사 카탈로그처럼, Assay는 분석기/수행 단위처럼 쓰이지만 둘 사이의 의미 차이, 권위 방향, cardinality, Result provenance 경로가 정의되지 않아 EMR 주문 카탈로그와 LIS 수행 카탈로그가 서로 어긋날 수 있습니다.
  - root cause: Test와 Assay의 의미 경계, 권위 방향, 구조적 매핑 관계가 정의되지 않아 신규 항목 등록, 검체 타입 권위, analyzer execution mapping이 두 카탈로그 사이에서 수동 동기화된다.
  - materiality: 이 문서의 목적은 EMR/LIS 연동에서 신규 검사 항목, 주문 카탈로그, 분석 수행 단위, order-to-result workflow를 안정적으로 확장하고 추적하는 것입니다. 그런데 ordered Test가 어떤 Assay로 수행되는지, 수행 결과가 어떤 Assay에서 왔는지 구조적으로 추적할 수 없고, 신규 항목도 Test와 Assay 양쪽에 수동 등록해야 합니다. 따라서 구현자는 analyzer execution mapping과 결과 귀속을 문서 밖 운영 관행으로 보완하게 되어 개념 권위 문서로서의 신뢰가 약해집니다.
  - action: Test를 orderable clinical request/catalog unit으로, Assay를 analyzer/execution unit으로 재정의하고 Test-to-Assay mapping relation을 추가해야 합니다. 이때 cardinality, 권위 방향, 신규 항목 등록 순서, specimen typing authority, Result produced_by 또는 equivalent provenance 연결을 함께 닫아야 합니다. 순서는 먼저 Test/Assay의 역할과 권위 방향을 확정한 뒤, 그 결정에 맞춰 mapping relation과 Result provenance 경로 및 specimen type 참조를 같은 권위 개념으로 정렬하는 것이 안전합니다.
- issue-010 (high): 동일한 결과 상태 의미가 `Result.status`와 `Report.result_status`에 서로 다른 enum 어휘와 권위 선언으로 중복 배치되어, 어떤 상태가 원천이고 어떤 상태가 표시/투영인지 불명확해진다.
  - root cause: 결과 상태 개념을 canonical 상태와 보고서 표시/투영 상태로 분리하지 않고 두 enum 필드에 각각 권위 의미를 부여했다.
  - materiality: 이 온톨로지는 EMR/LIS 통합에서 결과 상태와 보고 상태의 의미 및 권위를 정하는 개념 권위 문서여야 한다. 그런데 동일 정보가 LIS 기록 상태와 임상의가 신뢰하는 보고 상태 양쪽에서 각각 권위처럼 선언되면 상태 precedence가 흐려지고, 특히 corrected/amended 같은 환자 안전 관련 변경이 시스템마다 다르게 해석될 수 있어 목적을 직접 약화한다.
  - action: 결과 상태의 canonical enum을 하나로 정하고, Report 쪽은 같은 enum을 참조하거나 명시적 매핑 테이블과 권위 방향을 가져야 한다. `prelim`, `finalized`, `amended`가 임상의 화면용 문구라면 코드 값이 아니라 presentation label로 분리해야 하며, issue-001의 canonical status/projection contract 해소와 함께 target 안에서 닫아야 한다.
- issue-002 (medium): 위험 결과 통보 워크플로는 현재 CriticalValue의 notified boolean과 외부 전화 기록 대장에 의존하므로, EMR/LIS 통합 권위 문서 안에서 통보 완료, 지연, 실패, 재시도, 수신 확인을 구분할 수 없는 material issue입니다.
  - root cause: CriticalValue 통보를 NotificationEvent 같은 독립 상태/관계 개념으로 승격하지 않고 notified boolean과 외부 전화 기록 대장으로 축소해 운영 책임, 실패 처리, 감사 확장 범위가 닫히지 않는다.
  - materiality: 선언된 목적은 운영 위험까지 고려해 위험 결과 통보 상태와 책임을 감사 가능하게 표현하는 것입니다. 그러나 통보의 핵심 증거가 온톨로지 내부 이벤트나 관계가 아니라 외부 대장과 단일 boolean에 흩어져 있어, 통합 설계자가 환자 안전 관련 통보 상태와 책임 경계를 문서에서 도출하기 어렵고 실패 또는 지연을 정상 완료처럼 해석할 수 있습니다.
  - action: CriticalValueDefinition과 실제 발생한 CriticalResultEvent를 분리하고, CriticalNotification 또는 NotificationEvent 계열 개념을 추가해야 합니다. 해당 개념에는 result_ref, triggered_at, recipient, notifier, channel, acknowledged_at 또는 read_back, attempt_status, escalation_status, failure_reason 같은 통보 상태와 감사 속성을 두어야 하며, notified boolean은 필요할 경우 이 이벤트들에서 파생되는 표시값으로 낮추는 것이 적절합니다. 구조 렌즈가 좁힌 Result/CriticalValue/notification 관계 경로도 이 조치 안에서 함께 닫아야 합니다.
- issue-004 (medium): issue-004는 Specimen lifecycle이 정상 수집-접수-분석 흐름에 치우쳐 분석 전 품질부적합, 거절, 재채취, 검수 같은 예외 상태 의미를 담지 못하는 material 결함이다. 관계 그래프 단절 주장은 제외하고, pre-analytic 품질/예외 coverage 및 lifecycle 상태 의미 결함으로 유지한다.
  - root cause: Specimen 개념 범위가 정상 수집-접수-분석 흐름에 집중되어 분석 전 예외와 품질 관리 하위 영역을 포함하지 않았다.
  - materiality: 이 온톨로지는 주문부터 보고까지의 임상검사 파이프라인 상태 모델을 EMR/LIS 통합 권위로 제공해야 한다. 그런데 검체가 부적합하거나 부족하거나 잘못 채취되어 분석/보고로 진행되지 못하는 경우를 표현하지 못하면 검사 지연, 취소, 재채취 요청, 미보고 사유를 시스템 간에 일관되게 교환하기 어렵다.
  - action: Specimen 상태를 검수, 거절, 재채취, 분석, 보관, 폐기까지 확장하고, SpecimenQuality 또는 SpecimenRejection 개념으로 reject_reason, condition_at_receipt, received_at, requested_recollection, notifying party를 표현해야 한다. 우선 lifecycle의 상태 경계를 정리한 뒤 품질/거절 개념과 EMR/LIS 통보 책임을 연결해야 정상 경로와 예외 경로가 같은 상태 모델 안에서 교환 가능해진다.
- issue-005 (medium): issue-005는 final 이후 corrected/amended가 발생하는 경우를 위한 amendment event 및 감사·버전 권위 표면이 없다는 material issue입니다. 상태값은 존재하지만 정정의 내용, 사유, 행위자, 시각, 승인, 임상의 재통보 상태를 권위 있게 보존하지 못합니다.
  - root cause: 정정/수정 상태는 모델링했지만 그 상태를 발생시키는 이력 이벤트와 감사 속성을 별도 하위 영역으로 포함하지 않았다.
  - materiality: 이 모델의 목적은 결과 보고 상태를 EMR/LIS 통합의 개념 권위로 쓰는 것입니다. 보고 후 정정은 임상 의사결정과 법적·운영 감사에 직접 영향을 주므로, 단순히 Result.status=corrected 또는 Report.result_status=amended로 표시하는 것만으로는 무엇이 왜, 누구에 의해, 어떤 승인과 재통보를 거쳐 바뀌었는지 교환하거나 감사할 수 없습니다. 따라서 결과 신뢰성과 재보고 책임의 일관성이 약해집니다.
  - action: ResultAmendment 또는 ReportAmendment 같은 amendment event/extension point를 추가하고 prior_result_ref 또는 prior_value, new_value, reason, amended_by, amended_at, approval, clinician_notification_status를 핵심 속성으로 모델링해야 합니다. Result/Report의 상태 필드는 최신 상태 표시로 유지하되, 감사와 버전의 권위는 amendment event가 갖도록 분리하는 것이 필요합니다.
- issue-008 (medium): issue-008은 Specimen의 공통 lifecycle이 analyzed에서 끝나 post-analysis 보관, 폐기, 재검 추적 및 retention/disposition 정책 권위가 모델 밖 부서 내규로 밀려나는 medium material issue입니다.
  - root cause: Specimen의 공통 lifecycle이 analyzed에서 종료되고 이후 보관/폐기 정책을 모델 내부 상태나 정책 개념으로 연결하지 않는다.
  - materiality: 이 문제는 검체의 전체 생애주기와 부서별 운영 정책을 통합 설계에서 안정적으로 확장하려는 목적을 약화합니다. 새 부서, 새 보관/폐기 규정, 재검 또는 추적 요구가 생기면 공통 온톨로지가 후속 상태 권위를 제공하지 못하고 부서 내규 해석에 의존하게 되어 EMR/LIS 통합 처리의 일관성이 떨어집니다.
  - action: Specimen lifecycle에 post-analysis 상태를 추가하거나 SpecimenDisposition/RetentionPolicy 엔티티를 도입해 공통 상태 전이와 부서별 예외 정책을 분리해야 합니다. 우선 공통 lifecycle/policy authority 경계를 모델 안에 세운 뒤, 부서별 차이는 정책 인스턴스나 예외 규칙으로 붙이는 방식이 필요합니다.
- issue-009 (medium): issue-009는 `Result.status=corrected` 이후 `Report.result_status=amended`가 즉시 성립해야 하는지, 야간 배치 이후 bounded eventual guarantee로 성립해도 되는지 닫히지 않은 material timing-modality 계약 결함입니다.
  - root cause: 정정 상태 전이 규칙이 즉시 의무와 배치 기반 지연 가능성을 하나의 선언에 섞고 허용 시간 구간을 정의하지 않는다.
  - materiality: 영향받는 목적은 EMR/LIS 통합자가 결과 정정과 보고서 상태 동기화의 권위 규칙을 일관되게 구현하게 하는 것입니다. 그런데 `Report.result_status`가 임상의가 신뢰하는 권위 값으로 선언된 상태에서 즉시 amended 보장인지 배치 전 불일치 허용인지가 불명확하면, 임상의 표시값과 LIS 결과값 사이의 불일치 처리, 경보, 재발행 로직이 구현자별로 달라질 수 있습니다.
  - action: 정정 규칙을 시간 조건으로 분해해야 합니다. 배치 지연을 허용하려면 `pending_amendment` 같은 중간 상태, 배치 완료 전까지의 허용 불일치 조건, 최대 보장 시점을 명시해야 합니다. 즉시 amended 전이가 필수라면 야간 배치 제한 문구를 제거하고 동기 실행을 계약으로 선언해야 합니다. 이 결정은 다음 단계 구현 전에 닫혀야 합니다.
  - unresolved disagreement: Evolution lens는 이 문제가 issue-001의 중복 상태 모델에서 드러난 surface symptom이라고 보았으므로, 독립 timing-contract 결함으로 유지하되 해당 이견을 보존합니다.
- issue-011 (medium): issue-011은 STAT/urgency 의미가 `priority=stat`, `is_stat`, `StatOrder`에 독립적으로 중복되어 canonical urgency source가 없는 material semantic canonical-source 결함입니다.
  - root cause: STAT 주문이라는 하나의 의미를 canonical 개념으로 정하지 않고 priority enum value, is_stat boolean, StatOrder subtype에 중복 배치했다.
  - materiality: 이 결함은 주문 우선순위와 STAT 처리 의미를 EMR/LIS 통합에서 일관되게 전달하려는 목적을 약화합니다. STAT 여부를 소비하는 시스템이 서로 다른 필드를 기준으로 판단하면 우선 처리, 작업 큐, 알림, TAT 계산, 대시보드 집계가 같은 주문을 다르게 해석할 수 있습니다.
  - action: STAT 의미의 권위 표현을 하나로 정해야 합니다. 예를 들어 `priority` enum을 canonical source로 두고 `is_stat`은 파생값으로 명시하거나 제거하며, `StatOrder`를 유지한다면 subtype 성립 조건을 `priority=stat`과 일치시키는 invariant/derivation contract를 선언해야 합니다. 이 결정은 다음 단계 전에 닫아야 소비 시스템의 라우팅과 우선순위 판단 계약이 흔들리지 않습니다.
- issue-012 (medium): issue-012는 Result의 유래 물체인 Specimen과 Result를 생성하는 분석 수행 행위를 분리하지 않아, Specimen이 produces Result 역할을 떠안는 material issue입니다. 최종 판단은 단순한 관계명 문제를 넘어 execution/provenance 경계와 graph connection 부재로 좁혀졌습니다.
  - root cause: 결과의 유래 물체와 결과 생성 행위를 별도 개념 관계로 분리하지 않고 produces 관계를 검체에 부여했다.
  - materiality: 이 문제는 검체, 분석 수행, 결과 생성의 의미 주체를 정확히 구분하려는 목적을 약화합니다. 결과 provenance, 장비/부서 책임, 재검/수정 결과 추적을 모델에 의존할 때, 검체가 결과를 능동적으로 생산하는 것처럼 표현되면 결과의 유래와 생성 행위가 같은 의미로 취급되어 감사와 추적의 개념 기반이 흐려집니다.
  - action: 후속 모델링에서는 Specimen to Result 관계를 source_for, used_for, has_result, derived_from 같은 provenance 의미로 바꾸거나, 더 명확하게 AssayExecution produces Result와 Result derived_from Specimen으로 분리해야 합니다. 핵심 순서는 먼저 실행/출처 경계를 명시한 뒤 그 경계에 맞게 관계명을 재배치하는 것입니다.
- issue-013 (medium): issue-013은 Result에서 CriticalValue 평가와 critical notification handling으로 이어지는 구조 경로가 없는 material issue입니다. produced Result가 어떤 critical-value rule에 해당했고 어떤 notification obligation, event, record, Staff 또는 recipient handling으로 이어져야 하는지 ontology graph 안에서 추적할 수 없습니다.
  - root cause: CriticalValue가 Test reference와 notified flag 중심 엔티티로만 모델링되고 Result, Report, Staff 또는 notification record와의 relation graph 경로에서 누락되어 있다.
  - materiality: Declared purpose는 reportable results에 대한 operational EMR/LIS workflow behavior와 integration risk의 concept authority가 되는 것입니다. Critical result notification은 환자 안전, 운영 책임, 감사 가능성에 직접 연결되는 workflow인데, Result에서 CriticalValue 및 notification handling으로 가는 경로가 없으면 구현체가 통보를 ontology 밖의 부수 절차로 처리할 수 있어 operational completeness와 auditability가 약해집니다.
  - action: Critical-value path를 명시적으로 모델링해야 합니다. 최소한 Result가 applicable CriticalValue를 evaluated_against 같은 관계로 참조하고, CriticalValue 또는 별도 CriticalValueNotification 개념이 notification event/record, timestamp, Staff 또는 recipient handling으로 이어지게 해야 합니다. Evolution과 logic lens가 좁힌 내용처럼 notification state 변화와 deterministic obligation inference가 가능해야 하므로, 이 경로는 다음 단계 전에 fix_now/fix_before_release로 닫아야 합니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-009: Evolution lens는 이 문제가 issue-001의 중복 상태 모델에서 드러난 surface symptom이라고 보았으므로, 독립 timing-contract 결함으로 유지하되 해당 이견을 보존합니다.

## Deliberation Decision
- issue-001: resolved
- issue-003: narrowed
- issue-007: resolved
- issue-010: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-004: narrowed
- issue-005: narrowed
- issue-008: narrowed
- issue-009: resolved
- issue-011: narrowed
- issue-012: narrowed
- issue-013: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합의 개념 권위 문서로서 결과와 보고서 상태 전이, 상태 권위, 상태 변화 연속성을 일관되게 제공하는 목적. Source finding context: EMR/LIS 통합의 개념 권위 문서로 사용하기 위한 상태 권위와 운영 위험 판단. Source finding context: EMR/LIS 통합에서 결과/보고 상태의 개념 권위와 상태 변화 연속성을 제공하는 목적. Source finding context: EMR/LIS 통합의 개념 권위 문서로서 결과와 보고서 상태 전이를 일관되게 정의하는 목적.
- issue-003: EMR/LIS 연동 설계의 개념 권위 문서로서 주문부터 보고까지의 엔티티, 관계, 상태를 정의하는 목적. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 주문부터 보고까지의 엔티티·관계·상태를 정의하는 목적
- issue-007: EMR/LIS 연동 설계의 개념 권위 문서로 신규 검사 항목, 주문 카탈로그, 분석 수행 단위, order-to-result workflow를 안정적으로 확장하고 추적하는 목적. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로 신규 검사 항목과 분석 수행 단위를 안정적으로 확장하는 목적. Source finding context: 검사 주문 카탈로그와 분석 수행 단위의 의미를 통합 권위 문서에서 구분하는 목적. Source finding context: Use as the concept authority document for EMR/LIS integration from Order to Report.
- issue-010: EMR/LIS 통합의 개념 권위 문서로서 결과 상태와 보고 상태의 의미와 권위를 정하는 목적.
- issue-002: EMR/LIS 통합 권위 문서가 운영 위험과 위험 결과 통보 상태 및 책임을 감사 가능하게 표현해야 한다는 목적. Source finding context: EMR/LIS 통합 권위 문서가 운영 위험과 상태 모델의 개념적 타당성을 설명해야 한다는 목적. Source finding context: 운영 시 생길 위험을 고려한 EMR/LIS 통합 개념 권위 문서로서 위험 결과 통보 상태와 책임을 표현하는 목적 Source finding context: 위험 결과 통보 워크플로를 EMR/LIS 통합 개념 모델 안에서 확장 가능하고 감사 가능한 방식으로 표현하는 목적.
- issue-004: 주문부터 보고까지의 임상검사 파이프라인 상태 모델을 EMR/LIS 통합 권위로 제공하는 목적.
- issue-005: 결과 보고 상태 모델을 EMR/LIS 통합의 개념 권위로 쓰는 목적.
- issue-008: 검체의 전체 생애주기와 부서별 운영 정책을 통합 설계에서 안정적으로 확장하는 목적.
- issue-009: 결과 정정과 보고서 상태 동기화의 권위 규칙을 EMR/LIS 통합자가 일관되게 구현하게 하는 목적.
- issue-011: 주문 우선순위와 STAT 처리 의미를 EMR/LIS 통합에서 일관되게 전달하는 목적.
- issue-012: 검체, 분석 수행, 결과 생성의 의미 주체를 정확히 구분하는 목적.
- issue-013: Use as a concept authority for operational EMR/LIS workflow behavior and integration risk around reportable results.

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 결과 상태와 보고 상태의 source of truth가 문서 안에서 닫히지 않았습니다. Result.status와 Report.result_status가 같은 결과 상태 의미를 다루면서도 서로 다른 enum, 권위 선언, 동기화 규칙을 가지므로 EMR/LIS 통합자는 어느 값을 canonical authority로 삼아야 하는지 일관되게 결정할 수 없습니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 구조적 missing edge 또는 graph-path defect 주장은 현재 evidence로 확정하지 않고 lifecycle/policy-authority 결함으로 좁혀 수용합니다.
- 웹 조사와 재귀적 참조 확장은 unit boundary에서 금지되어 packet 내 증거와 허용 source ref만 사용했습니다.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-003 (high): fix_before_release, fix_now
- issue-007 (high): fix_before_release, fix_now
- issue-010 (high): fix_before_release, follow_up, fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-004 (medium): follow_up
- issue-005 (medium): follow_up
- issue-008 (medium): follow_up
- issue-009 (medium): fix_before_release, accept_risk
- issue-011 (medium): fix_before_release, accept_risk
- issue-012 (medium): follow_up
- issue-013 (medium): fix_before_release, fix_now

## Recommendations
- issue-006 (low): TAT 및 운영 지표 영역이 권위 모델 밖으로 빠져 있어 운영 지표의 개념 범위를 통제하지 못한다. Source finding context: clinical-lab-ontology.yaml / notes and operational metrics Source finding context: Embedded Materialized Input: notes turnaround_time(TAT) is calculated from collected_at to released_at and dashboard team maintains its own formula Source finding context: TAT 및 운영 지표 영역이 권위 모델 밖으로 빠져 있다. Source finding context: EMR/LIS 통합의 운영 위험 관점에서 TAT는 주문 지연, 검체 지연, 분석 지연, 보고 지연을 나누어 관리하는 핵심 영역이다. 현재는 대시보드 팀의 자체 계산식으로 남아 있어 권위 문서가 운영 지표의 개념 범위를 통제하지 못한다. Source finding context: WorkflowEvent 또는 LabMilestone 엔티티를 추가해 ordered/placed, collected, received, analysis_started, verified, released 같은 시각을 표준화하고, TATMetric/TATPolicy로 start/end milestone, exclusions, priority별 목표, breach 상태를 정의한다. Source finding context: .onto/review/20260610-5fbe917f/round1/coverage.findings.yaml#coverage-candidate-005

## Unique Finding Tagging
- issue-006 (low): TAT 및 운영 지표 영역이 권위 모델 밖으로 빠져 있어 운영 지표의 개념 범위를 통제하지 못한다. Source finding context: clinical-lab-ontology.yaml / notes and operational metrics Source finding context: Embedded Materialized Input: notes turnaround_time(TAT) is calculated from collected_at to released_at and dashboard team maintains its own formula Source finding context: TAT 및 운영 지표 영역이 권위 모델 밖으로 빠져 있다. Source finding context: EMR/LIS 통합의 운영 위험 관점에서 TAT는 주문 지연, 검체 지연, 분석 지연, 보고 지연을 나누어 관리하는 핵심 영역이다. 현재는 대시보드 팀의 자체 계산식으로 남아 있어 권위 문서가 운영 지표의 개념 범위를 통제하지 못한다. Source finding context: WorkflowEvent 또는 LabMilestone 엔티티를 추가해 ordered/placed, collected, received, analysis_started, verified, released 같은 시각을 표준화하고, TATMetric/TATPolicy로 start/end milestone, exclusions, priority별 목표, breach 상태를 정의한다. Source finding context: .onto/review/20260610-5fbe917f/round1/coverage.findings.yaml#coverage-candidate-005

## Shared Phenomenon Summary
- none
