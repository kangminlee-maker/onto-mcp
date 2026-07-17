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
- issue-001 (high): Result.status와 Report.result_status가 의미·권위 관계가 불명확한 복수의 현재 상태로 운용되고 야간 배치로 동기화되어, 정정 직후 충돌과 상태 모델 변경 시 매핑 파손이 발생한다.
  - root cause: 하나의 결과 상태 권위를 Result와 Report의 서로 다른 폐쇄 enum에 중복 저장하고 야간 배치로 동기화한 설계가 현재 불일치와 상태 진화 시 호환성 파손을 함께 만든다.
  - materiality: 임상의가 권위 값으로 신뢰하는 Report.result_status가 최신 Result.status와 다를 수 있으므로, EMR/LIS가 공유할 단일하고 지속 가능한 개념 권위라는 목적이 직접 약화된다. 특히 정정 직후에는 같은 검사에 대해 finalized와 corrected/amended가 공존할 수 있고, 혼합 버전 운영에서는 신규 상태가 잘못 해석될 수 있어 운영 안전성과 변경 연속성에 영향을 준다.
  - action: 먼저 Result 상태와 Report 상태가 같은 개념의 투영인지 독립 lifecycle인지 대상 문서 안에서 결정해야 한다. 이어 각 상태의 의미·권위·전이와 교차 관계를 명시적이고 버전된 계약으로 정의하고, 완전한 시스템별 매핑과 미매핑 처리 규칙을 마련해야 한다. 그 계약에 따라 비동기 중복 권위를 제거하고 원자적 또는 이벤트 기반으로 상태를 투영하며, 전파 실패 시 오래된 finalized 상태를 계속 권위로 노출하지 않도록 보류·오류 상태와 재처리 규칙을 정의해야 한다.
  - unresolved disagreement: 정정 직후의 충돌과 명시적·버전된 계약의 필요성에는 합의했지만, 두 필드를 하나의 정규 상태로 통합할지 서로 연관된 독립 lifecycle로 분리할지는 현재 증거로 확정되지 않았다.
- issue-002 (high): CriticalValue가 재사용되는 임계 정책과 환자별 위험 결과·통보 사건을 함께 나타내므로, 결과별 통보 책임과 증적을 EMR/LIS에서 일관되게 표현하거나 검증할 수 없다.
  - root cause: 재사용되는 CriticalValue 임계 정책과 환자별 위험 결과·통보 사건을 하나의 엔티티 및 notified 불리언에 결합하고 증적은 외부 대장에 둔 것이 의미 혼합과 감사 불가능성을 함께 만든다.
  - materiality: 동일 임계값에서 여러 환자 결과가 발생하거나 notified 값과 외부 전화 대장이 불일치하면, 시스템은 어떤 결과가 누구에게 언제 통보되었고 확인되었는지 판별할 수 없다. 따라서 즉시 통보라는 환자안전 약속의 실행 여부와 실패 여부를 교환·감사할 수 없어 운영 통제와 감사 신뢰가 직접 약화된다.
  - action: 먼저 검사별 임계 정책을 버전 가능한 CriticalValueRule로 분리하고, 특정 Result에 연결되는 CriticalResultEvent와 NotificationEvent를 별도 정체성과 수명주기로 정의해야 한다. 이어 NotificationEvent에 통보 행위자, 수신자, 발생 시각, 채널, 확인, 실패 및 재시도 상태를 두고 동일 권위 흐름에서 결과와 증적을 연결해야 한다. 이는 정책 변경 이력과 과거 사건을 분리해 보존하면서 결과별 통보 완료와 운영 실패를 검증하기 위해 필요하다.
- issue-006 (high): 부분적인 상태 목록과 산발적 prose 규칙만으로 lifecycle을 표현해, 검체의 전처리 실패·재채취·보관·폐기를 나타낼 수 없으며 EMR과 LIS가 유효 전이를 동일하게 검증할 수도 없다.
  - root cause: Lifecycle을 완전한 사건·전이 모델이 아니라 부분 상태 목록과 산발적 prose 규칙으로 표현해 검체 예외·종료 구간과 전이 검증 계약이 함께 누락되었다.
  - materiality: 이 온톨로지는 주문부터 보고까지의 임상검사 상태 모델을 EMR/LIS 통합의 개념 권위로 제공해야 한다. 그러나 부적합 검체와 정상 진행 검체, 분석 후 보관·폐기 상태를 공통으로 구분하지 못하고 미정의 전이에 대한 일관된 판단도 제공하지 않아 잘못된 분석 진행, 누락된 재채취, 추적성 상실 및 시스템 간 상태 조정 실패를 허용한다.
  - action: 먼저 모든 lifecycle에 공통으로 적용할 source, target, trigger·guard 및 종결 의미를 가진 명시적 전이 구조와 미선언 전이 거부 규칙을 정의해야 한다. 이어 Specimen에 planned, labelled, collected, in_transit, received, accepted 또는 rejected, in_analysis, analyzed, stored, disposed 경로를 연결하고 거부·재채취·폐기 사건의 사유와 시각을 기록해야 한다. 같은 구조로 Report 등 관련 lifecycle의 전이도 선언해야 EMR과 LIS가 하나의 계약으로 상태를 교환하고 검증할 수 있다.
- issue-007 (high): Result와 Report의 검증·발행·정정이 현재 상태값으로만 축약되어 행위자·시각·사유·이전 버전·전달 이력이 일관되게 보존되지 않으며, 이는 즉시 보완해야 할 핵심 추적성 결함이다.
  - root cause: 결과 검증·보고서 발행·정정을 독립 사건과 버전 계보로 모델링하지 않고 현재 상태 속성으로 축약했다.
  - materiality: 최종 결과가 검증·발행된 뒤 정정되거나 보고서가 재발행되면, 현재 모델로는 임상적으로 사용된 버전과 그 버전을 승인·전달한 책임 행위를 복원할 수 없다. 따라서 EMR/LIS 통합 개념 권위의 감사 가능성과 운영 신뢰가 약화된다.
  - action: Verification, ReportRelease, ResultCorrection, ReportAmendment를 독립 사건으로 모델링하고 각 사건에 actor, occurred_at, reason 또는 evidence를 부여해야 한다. Result와 Report 버전에는 supersedes 또는 version_ref 계보를 연결하고 전달 대상과 전달 시각도 함께 기록해야 한다. 사건, 버전 계보, 전달 이력을 하나의 일관된 계약으로 함께 도입해야 최종·정정 결과와 임상 사용 이력을 감사 가능하게 재구성할 수 있다.
- issue-008 (high): 중요 결과 통보가 `notified` 불리언과 온톨로지 밖 전화 대장으로 분리되어 있어, 실제 전달·확인 증거와 실패·재시도·에스컬레이션 lifecycle을 공통 모델에서 표현하거나 추적할 수 없다.
  - root cause: 중요 결과 통보를 감사 가능한 workflow 사건이 아니라 요약 불리언과 온톨로지 밖 전화 대장으로 분리했다.
  - materiality: 위험 결과의 안전한 전달을 통합적으로 관리하려면 누가 누구에게 언제 어떤 채널로 통보했고, 성공·실패·확인 및 후속 에스컬레이션이 어떻게 진행됐는지 판정할 수 있어야 한다. 단일 불리언은 미통보, 실패, 재시도 중, 완료를 구별하지 못하므로 환자안전 통제의 수행을 검증하거나 자동화할 수 없으며 현재 권위 문서의 목적을 약화한다.
  - action: 결과별 `CriticalNotification` 사건을 먼저 도입하고 critical result 참조, 통보자, 수신자, 시도·통보·확인 시각, 채널, outcome, 실패 사유, 재시도·에스컬레이션 정보 및 외부 기록 식별자를 정의해야 한다. 이 사건과 `CriticalValue` 및 외부 대장의 연결을 권위 관계로 확립한 뒤, 기존 `notified` 값은 필요하다면 사건 이력에서 계산되는 요약값으로만 사용해야 한다. 그래야 감사 증거, 현재 진행 상태, 실패 복구와 에스컬레이션을 일관되게 검증하고 자동화할 수 있다.
- issue-010 (high): Result가 문자열 값과 단위만 보유하는 최소 표시값 레코드로 축약되어 있어, 관찰 시각·자료형·기준구간·해석·수행 방법과 측정 실패 또는 취소 맥락을 의미 보존 방식으로 교환할 수 없다.
  - root cause: Result를 임상 관찰과 수행 provenance 개념이 아니라 최소 표시 값 레코드로 축약했다.
  - materiality: 정성·코드형 결과, 기준구간 경고, 방법 의존 결과, 측정 불가·취소 결과에서는 동일한 표시값도 맥락에 따라 임상 의미와 표시 동작이 달라진다. 현 모델에서는 EMR/LIS가 이를 안전하게 판단할 수 없어 비표준 추론이나 별도 매핑에 의존하므로, 검사 결과의 의미 보존 교환이라는 선언 목적을 직접 약화한다.
  - action: Result에 관찰 시각, 명시적 typed value 선택, 코드화 단위, 기준구간, interpretation·abnormal flag, 검사 수행 또는 assay 참조, validity·status reason을 추가하고 측정 불가와 취소를 정상 값 문자열과 구분해 표현해야 한다. 또한 issue-016과 공유하는 원인인 독립된 검사 수행 provenance 부재를 고려해 수행 개념과 참조 구조를 함께 정립해야 방법 의존 결과의 의미를 보존할 수 있다.
- issue-011 (high): Test와 Assay가 각각 주문 가능 항목과 실제 수행 단위를 나타내지만 역할별 권위와 의미적 연결이 정의되지 않아, EMR 주문을 LIS 수행 및 결과에 신뢰성 있게 귀속할 수 없다.
  - root cause: 주문 가능한 Test와 수행 가능한 Assay를 분리한 뒤 canonical authority와 cardinality-aware mapping을 정의하지 않았다.
  - materiality: 신규·변경 검사를 두 카탈로그에 독립 등록하거나 하나의 주문이 여러 수행법으로 분해되면 코드, 검체 요구, 담당 부서 및 수행법이 서로 다르게 연결될 수 있다. 이는 EMR 주문 카탈로그와 LIS 수행 카탈로그를 일관되게 통합하려는 목적을 직접 약화하며 주문·수행·결과의 정확성을 현재 차단한다.
  - action: 대상 범위에서 Test를 주문 권위, Assay를 수행 정의로 명시하고, 일대다·다대일·다대다 가능성을 수용하는 버전된 주문–수행 매핑을 정의해야 한다. 이 매핑에는 식별자와 공유 속성별 소유 권위, 유효기간, 변경 동기화, 불일치 탐지 및 해소 규칙을 포함해야 한다. 먼저 권위와 의미 경계를 확정한 뒤 매핑과 검증 규칙을 적용해야 신규 등록과 대체 수행법 도입에서도 주문·수행·결과 연결이 일관되게 유지된다.
- issue-012 (high): Test와 Assay를 함께 수정하는 이중 등록 방식은 검사 카탈로그 변경 시 주문 항목과 실제 수행 항목의 시점별 대응을 보존하지 못하므로, 기존 주문·결과 해석과 신규 EMR/LIS 연동의 신뢰성을 훼손한다.
  - root cause: Test와 Assay의 권위·매핑·버전 모델 없이 이중 등록을 카탈로그 변경 방식으로 채택했다.
  - materiality: 이 온톨로지는 EMR/LIS 연동을 위한 검사 카탈로그의 개념 권위를 제공해야 한다. 그러나 신규 검사, 대체 분석법, 검사 분할·통합 또는 카탈로그 개정 때 양쪽 등록의 누락이나 변경 시점 차이가 생기면 주문 코드와 수행 항목의 연결이 달라지거나 사라진다. 따라서 현재 구조로는 과거 데이터의 의미와 향후 연동의 연속성을 보장할 수 없다.
  - action: 먼저 Test를 주문 카탈로그의 단일 권위로 확정하고 Assay를 버전 가능한 수행 정의로 분리해야 한다. 다음으로 Test–Assay 매핑에 유효기간, 버전, 활성 상태를 두어 특정 시점의 대응을 명시하고, 신규 항목은 권위 위치 한 곳에만 등록한 뒤 다른 표현을 매핑에서 파생해야 한다. 이 순서로 권위와 매핑 계약을 먼저 확립해야 이후 카탈로그 변경과 기존 데이터 해석을 일관되게 검증할 수 있다.
- issue-014 (high): Result 상태와 Report 문서 상태를 서로 다른 의미와 값 체계로 두면서도 동일한 현재 권위 정보로 취급해, 결과 정정 후 야간 동기화 전까지 corrected와 finalized가 병존하는 양립 불가능한 권위 상태가 발생한다.
  - root cause: Result 상태와 Report 문서 상태의 의미 경계를 정하지 않고 서로 다른 enum의 두 필드를 동일 정보의 권위로 취급하면서 정합성 시점과 매핑도 정의하지 않았다.
  - materiality: 이 충돌은 EMR/LIS와 임상의가 동일한 결과의 확정·정정·보고 상태를 일관되게 해석해야 한다는 목적을 직접 약화한다. 지연 구간에 EMR이나 임상의가 stale한 finalized 보고 상태를 권위 값으로 신뢰하면 실제 정정을 놓쳐 임상 해석과 후속 조치가 잘못될 수 있으므로 현재 대상에서 반드시 해소해야 하는 안전 위험이다.
  - action: 먼저 ObservationResultStatus와 ReportDocumentStatus를 별도 개념으로 정의하고 각 의미와 전이를 독립적으로 명시하거나, 하나만 상태 권위로 정한 뒤 다른 필드를 즉시 계산되는 파생 값으로 만들어야 한다. 두 필드를 유지한다면 모든 enum 값의 전사 매핑, 정정 이벤트에 따른 원자적 또는 이벤트 기반 갱신, 버전과 갱신 시각, 지연 중 소비 가능 여부를 하나의 계약으로 정의해야 한다. 야간 배치를 유지할 경우에는 ‘동일한 현재 정보’라는 보장을 eventual consistency로 명시적으로 낮추고 stale한 Report 상태를 권위 값으로 노출하지 않아야 한다.
- issue-018 (high): Assay가 Order-to-Result workflow에 연결되지 않아, 주문된 Test를 실제 LIS 수행 Assay로 변환하고 그 수행을 Result까지 추적하는 권위 있는 구조적 경로가 없다.
  - root cause: 별도의 주문 가능 카탈로그와 실행 가능 카탈로그를 선언했지만 두 카탈로그 및 수행 경로를 잇는 관계를 만들지 않았다.
  - materiality: 온톨로지는 Order부터 Report까지 EMR/LIS 통합의 개념 권위여야 하지만, 핵심 EMR-to-LIS 실행 인계가 선언되지 않았다. 따라서 구현마다 별도 매핑을 만들어야 하고, 동일 주문에 대한 수행 및 결과 추적이 구현별로 달라질 수 있어 선언된 목적을 직접 약화한다.
  - action: 먼저 Test-to-Assay 매핑의 다중성, 권위 있는 링크, 신규·대체 Assay에 대한 버전 규칙을 선언해야 한다. 이어 Assay를 수행 Result 또는 검체 실행 경로에 연결하여 Order–Test–Assay–Result–Report 추적이 온톨로지 안에서 완결되도록 해야 한다. 여러 Assay가 하나의 Test를 구현할 때 어느 매핑이 시점별 권위인지 명시해야 구현별 로컬 매핑을 제거할 수 있다.
- issue-003 (medium): Test와 Assay를 독립 개념으로 유지하면서도 둘 사이의 정식 매핑과 소유권을 정의하지 않고 이중 등록으로 대체한 결과, 식별·대응 판단이 각 통합 구현자에게 전가된다. 모든 검토 관점은 원인과 중간 심각도 및 조치에 동의했으며, evolution 관점은 쟁점의 범위를 전체 카탈로그 버전 문제가 아닌 Test–Assay 매핑 책임으로 한정했다.
  - root cause: 주문 개념과 수행 개념을 구분했지만 canonical mapping과 소유권 결정을 유예하고 신규 항목의 이중 등록으로 대체했다.
  - materiality: 이 문서의 목적은 EMR의 주문 단위와 LIS의 수행 단위를 연결하는 개념 권위를 제공하는 것이다. 그러나 동일 신규 항목의 두 등록이 불일치하거나 하나의 Test가 여러 Assay로 수행되면 단순 동일성 가정이 무너지고, 구현마다 독자적인 매핑을 만들게 된다. 이는 상호운용성을 낮추고 권위 문서의 결정력을 약화하므로 material issue이다.
  - action: 다음 통합 설계 단계 전에 Test와 Assay의 서로 다른 역할은 유지하되 명시적 매핑 관계 또는 매핑 엔티티를 정의해야 한다. 여기에 일대일·일대다 등 다중성, 유효기간, 매핑 권위자, 변경 책임 및 불일치 처리 규칙을 포함해 구현자가 추론하지 않아도 되는 단일 계약을 마련해야 한다.
- issue-004 (medium): TAT의 의미 정의와 대시보드 계산 구현 사이에 우선순위·버전·적합성 계약이 없어, 같은 `turnaround_time` 명칭이 시스템별로 서로 다른 값과 의미로 진화할 수 있다.
  - root cause: TAT의 의미 권위와 실행 계산 권위를 서로 다른 소유자에게 두면서 우선순위·버전·적합성 검증 계약을 정의하지 않았다.
  - materiality: 이는 EMR/LIS와 후속 소비자에게 공유 파생 의미의 권위를 제공한다는 목적을 약화한다. 대시보드 계산식이 온톨로지의 collected_at-to-released_at 정의와 다르거나 독립적으로 변경되면 운영 측정과 통합 검증 결과를 신뢰하기 어렵다.
  - action: 다음 단계 전에 TAT의 기준 구간, 예외 처리, 버전 및 변경 규칙을 canonical 파생 지표 계약으로 확정해야 한다. 대시보드는 이 계약을 참조하고 적합성을 검증하는 소비자로 두며, 다른 계산 목적이 필요하면 별도 이름과 목적을 부여해야 한다. 이 계약을 먼저 확정해야 소비자 구현과 통합 검증이 동일한 의미를 기준으로 진행될 수 있다.
- issue-009 (medium): 검사 카탈로그, 중요 결과 임계 규칙, 검체 유형이 버전 가능한 참조 권위로 관리되지 않아 변경 시 과거 구성과 결과 해석을 재현하기 어렵고 새 검체 유형의 안정적인 확장도 저해된다.
  - root cause: 변경 가능한 참조 개념을 식별자·버전·유효기간을 가진 권위 엔티티로 두지 않고 enum, 문자열 및 현재 속성값에 내장했다.
  - materiality: EMR과 LIS가 시점별 검사 정의, 임계 판단, 검체 요구조건을 동일하게 공유해야 하지만 현재 구조로는 당시 적용된 의미를 확정할 수 없다. 그 결과 과거 결과가 현재 설정으로 잘못 해석될 수 있고, 새 검체 유형마다 스키마 변경과 수동 매핑이 반복되어 감사 재현성, 검사 라우팅, 적합성 판단 및 상호운용성이 약화된다.
  - action: 배포·연동 설계의 다음 단계 전에 검사 카탈로그, 임계 규칙, SpecimenType을 식별자, 버전, 유효 시작·종료, 상태, 적용 범위, 변경 사유 및 외부·레거시 코드 매핑을 가진 권위 개념으로 승격해야 한다. Specimen, Test, Assay는 공통 SpecimenType을 참조하고 Result는 실제 사용한 카탈로그 및 임계 규칙 버전을 참조해야 과거 구성을 재현하고 변경 이후에도 의미 연속성을 유지할 수 있다.
- issue-013 (medium): CriticalValue가 버전·유효기간·단위·검사방법 맥락 없는 현재 임계값으로만 표현되어, 기준 변경 전후에 어떤 정책이 각 결과에 적용되었는지 재현할 수 없다.
  - root cause: 시간에 따라 변하는 CriticalValue 임계 정책을 버전 가능한 정의가 아니라 현재값 속성 집합으로 모델링했다.
  - materiality: 임계값, 단위, 분석법 또는 적용 범위가 변경된 뒤 과거 결과와 신규 결과가 공존하면 당시 기준에 따른 critical 판정과 병행 적용을 확인할 수 없다. 이는 변경 가능한 임상검사 운영 규칙을 EMR/LIS 통합의 지속적인 개념 권위로 제공하려는 목적을 약화시키고 경보 및 감사 해석의 신뢰를 떨어뜨린다.
  - action: 다음 단계에서 운영 규칙을 적용하기 전에 CriticalValueDefinition을 독립적이고 버전 가능한 정책 개념으로 만들고, 적용 Test·Assay, 단위, 검체와 필요한 환자 범주, 유효기간, 버전 및 대체 관계를 포함해야 한다. 결과별 통보 완료 여부는 정책 정의에서 분리해 알림 사건으로 모델링해야 한다. 이 조치가 선행되어야 과거 판정을 재현하고 변경 전후 정책을 병행 적용할 수 있다.
- issue-015 (medium): Result가 final에서 corrected로 바뀐 뒤 Order.completed를 어떻게 처리할지 정의되지 않아, 동일한 주문의 완료 상태가 EMR과 LIS에서 다르게 해석될 수 있다.
  - root cause: 가역적인 Result 상태를 Order 종결 판정에 사용하면서 정정 이후 전이와 completed의 시간적 의미를 정의하지 않았다.
  - materiality: 이 모델은 Order부터 Report까지의 상태를 EMR/LIS 통합의 공통 개념 권위로 제공해야 한다. 그러나 완료 후 정정 경로에서 주문 종결, 재처리, 화면 표시와 후속 연동 판단이 구현마다 달라질 수 있으므로 그 목적을 약화한다.
  - action: 먼저 completed의 시간적 의미를 명시적으로 선택해야 한다. 현재 상태라면 corrected 발생 시 in_progress 또는 amended/reopened 상태로 전이하고 재완료 조건을 정의해야 한다. 역사적 마일스톤이라면 released_once 같은 불변 사건으로 분리하고 현재 정합 상태를 별도 파생 속성으로 정의해야 한다. 이 의미 결정이 선행되어야 전이 계약과 연동 동작을 일관되게 확정할 수 있다.
- issue-016 (medium): Specimen이 Result를 직접 생산하도록 한 모델은 입력 물질과 실제 검사 수행의 역할을 혼동하므로, 결과 생성 주체와 수행 provenance를 올바르게 표현하지 못한다.
  - root cause: 독립적인 TestPerformance 또는 AssayRun 없이 분석 수행의 산출 역할을 수동적 입력 물질인 Specimen에 배정했다.
  - materiality: 이 혼동은 재검사, 분주 검체, 여러 assay 수행, 동일 검체의 복수 결과를 구별해야 할 때 결과가 어떤 검체와 어떤 수행에서 산출되었는지 추적할 수 없게 한다. 따라서 EMR/LIS의 결과 provenance 계약과 결과 추적의 신뢰성이 약화된다.
  - action: 먼저 TestPerformance 또는 AssayRun을 독립된 수행 개념으로 도입하고, 이 수행이 Specimen을 사용해 Result를 산출하도록 모델링해야 한다. 그다음 Specimen–Result 직접 관계는 specimen_for 또는 result_based_on_specimen과 같은 입력·근거 의미로 제한해야 한다. 수행 provenance를 먼저 세워야 기존 produces 관계를 제거하거나 재정의해도 결과 생성 경로가 소실되지 않으며, 이 조치는 대상 모델에서 반드시 해소해야 할 다음 단계 차단 사안이다.
- issue-017 (medium): STAT 긴급도가 Order.priority, Order.is_stat, StatOrder에 독립적으로 중복되어 동일 주문을 STAT과 비STAT으로 동시에 해석할 수 있다. 단일 권위와 동치 규칙이 없는 이 결함은 대상 모델에서 즉시 닫아야 한다.
  - root cause: 상황적 긴급도 분류를 단일 권위 속성으로 정규화하지 않고 subtype, enum 및 boolean으로 동시에 모델링했다.
  - materiality: EMR과 LIS가 서로 다른 표현을 권위로 사용하거나 일부 표현만 갱신하면 동일 주문의 우선 처리 여부와 운영 규칙이 시스템별로 달라진다. 이는 주문 긴급도를 하나의 의미로 교환하고 처리하려는 개념 권위를 직접 약화한다.
  - action: 릴리스 전에 Order.priority의 STAT 값을 단일 정규 권위로 먼저 확정하고, is_stat은 그 값에서 계산되는 projection으로 정의해야 한다. StatOrder가 별도 계약, 수명주기 또는 필수 속성을 갖지 않는다면 제거하거나 비권위 파생 분류로 다뤄야 한다. 반드시 유지해야 한다면 명확한 판별 규칙과 세 표현의 동치를 강제하는 불변조건을 함께 정의해 부분 갱신과 표현 드리프트를 차단해야 한다.
- issue-019 (medium): CriticalValue.notified는 검사 수준 임계 정책에 놓인 불리언일 뿐 특정 Critical Result의 통보 사건이나 증거를 가리키지 않으므로, 결과별 통보 완료를 판정하거나 추적할 수 없다.
  - root cause: Test-level CriticalValue 범위에 통보 결과를 두면서 결과별 통보 사건과 증거를 연결하는 관계를 만들지 않았다.
  - materiality: 특정 위험 결과가 누구에게 언제 통보되었는지와 그 근거 기록을 확인할 canonical 경로가 없어 EMR과 LIS가 서로 다른 통보 상태를 유지해도 조정할 수 없다. 이는 검사결과 운영을 위한 연결된 개념 권위와 안전 통제의 감사 가능성을 직접 약화한다.
  - action: 검사 수준의 임계 정책과 결과 수준의 통보 사건을 분리한 뒤, 통보 사건을 triggering Result, 적용된 임계 정책, 통보한 Staff, 수신자, 통보 시각 및 권위 있는 통신 증거에 연결해야 한다. 먼저 정책과 사건의 권위를 분리해야 이후 관계가 결과별 사실과 변경 가능한 정책을 혼동하지 않으며, 이 연결을 통해 EMR/LIS가 동일한 근거로 통보 완료를 판정하고 불일치를 조정할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: 정정 직후의 충돌과 명시적·버전된 계약의 필요성에는 합의했지만, 두 필드를 하나의 정규 상태로 통합할지 서로 연관된 독립 lifecycle로 분리할지는 현재 증거로 확정되지 않았다.

## Deliberation Decision
- issue-001: narrowed
- issue-002: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-019: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS가 공유하는 결과·보고 상태의 단일하고 지속 가능한 개념 권위. Source finding context: EMR/LIS 통합에서 결과 상태의 단일하고 신뢰 가능한 개념 권위를 제공하는 목적. Source finding context: EMR/LIS가 공유할 결과·보고 상태의 개념 권위와 변경 연속성
- issue-002: 위험 결과의 판정과 즉시 통보를 EMR/LIS에서 일관되게 해석하고 운영 위험을 통제하는 목적. Source finding context: 위험 결과의 즉시 통보를 EMR/LIS 통합에서 일관되게 표현하고 운영 위험을 통제하는 목적. Source finding context: 위험 검사결과 판정과 통보를 EMR/LIS 사이에서 일관되게 해석하는 개념 모델
- issue-006: 주문부터 보고까지의 임상검사 파이프라인과 상태 모델을 EMR/LIS 통합의 개념 권위로 제공하는 목적. Source finding context: 주문부터 보고까지의 임상검사 파이프라인을 EMR/LIS 통합의 개념 권위로 제공한다는 선언 Source finding context: Serving as the authoritative state model for EMR/LIS integration and invalid-state handling.
- issue-007: Result와 Report 상태를 포함한 EMR/LIS 통합 개념 권위 및 운영 추적성.
- issue-008: 위험 결과의 안전한 전달을 포함하는 임상검사 워크플로 통합 권위.
- issue-010: 검사 결과를 EMR/LIS 사이에서 의미 보존하여 전달하는 개념 권위.
- issue-011: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 권위 및 매핑. Source finding context: EMR/LIS 통합에서 주문 항목과 실제 수행 항목을 연결하는 개념 권위
- issue-012: EMR/LIS 연동 설계의 검사 카탈로그 개념 권위 제공.
- issue-014: 임상의와 EMR/LIS가 결과의 확정·정정·보고 상태를 동일하게 해석하는 권위 계약. Source finding context: EMR/LIS 연동 설계에서 결과 상태의 개념 권위와 임상의가 신뢰할 보고 상태를 제공하는 목적
- issue-018: Order부터 Report까지 EMR/LIS 통합의 개념 권위로 온톨로지를 사용하는 목적. Source finding context: Use of the ontology as the conceptual authority for EMR/LIS integration from Order through Report.
- issue-003: EMR의 주문 단위와 LIS의 수행 단위를 연결하는 개념 권위를 제공하는 목적.
- issue-004: EMR/LIS 및 후속 소비자가 공유하는 파생 의미의 권위를 제공하는 목적. Source finding context: EMR/LIS 및 후속 소비자가 공유하는 개념과 파생 의미의 권위를 제공하는 목적.
- issue-009: EMR/LIS가 검사 정의, 임계 판단 및 검체 요구조건을 시간에 따라 안정적으로 공유하는 개념 권위. Source finding context: EMR/LIS가 공유하는 검사 정의와 중요 결과 판단의 개념 권위 Source finding context: EMR/LIS 간 검체 및 검사 요구조건의 안정적인 개념 공유
- issue-013: 변경 가능한 임상검사 운영 규칙을 EMR/LIS 통합의 지속적인 개념 권위로 제공하는 목적.
- issue-015: Order부터 Report까지 상태 모델을 EMR/LIS 통합의 개념 권위로 사용하는 목적.
- issue-016: 결과가 어떤 검체와 수행 과정에서 산출되었는지 표현하는 EMR/LIS provenance 계약.
- issue-017: EMR/LIS가 주문 긴급도를 하나의 의미로 교환하고 처리하는 개념 권위.
- issue-019: 검사결과 운영과 EMR/LIS 통합을 위한 연결된 개념 권위를 제공하는 목적. Source finding context: Providing a connected conceptual authority for laboratory-result operations and their EMR/LIS integration.

## Final Review Result
18 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result.status와 Report.result_status가 의미·권위 관계가 불명확한 복수의 현재 상태로 운용되고 야간 배치로 동기화되어, 정정 직후 충돌과 상태 모델 변경 시 매핑 파손이 발생한다. Unresolved disagreement remains: 정정 직후의 충돌과 명시적·버전된 계약의 필요성에는 합의했지만, 두 필드를 하나의 정규 상태로 통합할지 서로 연관된 독립 lifecycle로 분리할지는 현재 증거로 확정되지 않았다.

## Boundary Notes
- 배치 외 실시간 보정 경로의 존재 여부는 경계 내 증거로 확인되지 않았다.
- 외부 전화 대장의 스키마와 결과 결합 키는 허용된 경계 밖이므로 기존 기록의 복구 가능성은 판단할 수 없다.
- 실제 EMR 및 LIS 코드 체계의 대응 다중성은 현재 경계의 자료로 확정할 수 없으므로 구현 시 실데이터로 검증해야 한다.

## Immediate Actions Required
- issue-001 (high): fix_now, accept_risk
- issue-002 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-008 (high): fix_now
- issue-010 (high): fix_now
- issue-011 (high): fix_now
- issue-012 (high): fix_now
- issue-014 (high): fix_now
- issue-018 (high): fix_now
- issue-003 (medium): fix_before_release, follow_up
- issue-004 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, accept_risk, fix_now
- issue-016 (medium): fix_before_release, follow_up, fix_now
- issue-017 (medium): fix_before_release, fix_now
- issue-019 (medium): fix_now

## Recommendations
- issue-005 (medium): 필수 가치 권위 문서가 바인딩되지 않아 axiology 검토가 사용자 요청 목적 외의 canonical 원칙 정렬을 판단할 수 없다. Source finding context: axiology 실행의 가치 권위 바인딩 Source finding context: axiology role §Authoritative alignment input: 순위 1~3 권위는 항상 바인딩되며 읽기 실패 시 insufficient evidence로 처리; context-candidate-assembly.yaml: `system_purpose_refs: []`, `role_definition_refs: []`, `execution_rule_refs: []`; review-value-alignment-criteria.yaml에는 user-request-intent만 존재. [value_type=principle, alignment_direction=indeterminate] Source finding context: canonical 가치 권위 파일이 이 실행에 바인딩되지 않아 제품화·OaC·LLM-native·product-locality 원칙에 대한 정렬 판단은 경계 내에서 불가능하다. Source finding context: 현재 findings는 확인된 사용자 목적과 대상 자체의 선언에 대해서만 판단할 수 있다. 더 높은 canonical authority와의 충돌·정렬을 평가하면 근거 없는 개인 해석이 되므로, axiology 검토 범위가 축소되고 완전한 가치 정렬 결론을 신뢰할 수 없다. Source finding context: execution preparation에서 필수 권위 문서의 정확한 버전·anchor·excerpt를 axiology packet에 materialize하고, 누락 시 lens dispatch를 중단하거나 결과를 명시적으로 partial로 표시한다. Source finding context: .onto/review/20260717-2b4d329d/round1/axiology.findings.yaml#axiology-candidate-005 Source finding context: canonical authority chain에 근거한 가치·목적 정렬 검토. Source finding context: 필수 순위 1~3 권위 문서가 비어 있는 상태로 axiology가 실행될 때. Source finding context: 검토가 사용자 요청 목적에 대한 제한적 판단만 제공하며, 시스템 원칙 전반에 대한 clean 또는 complete 결론을 낼 수 없다. Source finding context: execution preparation이 axiology의 필수 authority source set을 context candidate에 materialize하지 않았다. Source finding context: 현재 허용 컨텍스트의 system_purpose_refs, role_definition_refs, execution_rule_refs가 모두 비어 있다. Source finding context: 역할 계약은 순위 1~3 권위를 항상 바인딩하도록 요구한다. Source finding context: 준비 단계에서 필수 authority source set이 주입되지 않았다.

## Unique Finding Tagging
- issue-005 (medium): 필수 가치 권위 문서가 바인딩되지 않아 axiology 검토가 사용자 요청 목적 외의 canonical 원칙 정렬을 판단할 수 없다. Source finding context: axiology 실행의 가치 권위 바인딩 Source finding context: axiology role §Authoritative alignment input: 순위 1~3 권위는 항상 바인딩되며 읽기 실패 시 insufficient evidence로 처리; context-candidate-assembly.yaml: `system_purpose_refs: []`, `role_definition_refs: []`, `execution_rule_refs: []`; review-value-alignment-criteria.yaml에는 user-request-intent만 존재. [value_type=principle, alignment_direction=indeterminate] Source finding context: canonical 가치 권위 파일이 이 실행에 바인딩되지 않아 제품화·OaC·LLM-native·product-locality 원칙에 대한 정렬 판단은 경계 내에서 불가능하다. Source finding context: 현재 findings는 확인된 사용자 목적과 대상 자체의 선언에 대해서만 판단할 수 있다. 더 높은 canonical authority와의 충돌·정렬을 평가하면 근거 없는 개인 해석이 되므로, axiology 검토 범위가 축소되고 완전한 가치 정렬 결론을 신뢰할 수 없다. Source finding context: execution preparation에서 필수 권위 문서의 정확한 버전·anchor·excerpt를 axiology packet에 materialize하고, 누락 시 lens dispatch를 중단하거나 결과를 명시적으로 partial로 표시한다. Source finding context: .onto/review/20260717-2b4d329d/round1/axiology.findings.yaml#axiology-candidate-005 Source finding context: canonical authority chain에 근거한 가치·목적 정렬 검토. Source finding context: 필수 순위 1~3 권위 문서가 비어 있는 상태로 axiology가 실행될 때. Source finding context: 검토가 사용자 요청 목적에 대한 제한적 판단만 제공하며, 시스템 원칙 전반에 대한 clean 또는 complete 결론을 낼 수 없다. Source finding context: execution preparation이 axiology의 필수 authority source set을 context candidate에 materialize하지 않았다. Source finding context: 현재 허용 컨텍스트의 system_purpose_refs, role_definition_refs, execution_rule_refs가 모두 비어 있다. Source finding context: 역할 계약은 순위 1~3 권위를 항상 바인딩하도록 요구한다. Source finding context: 준비 단계에서 필수 authority source set이 주입되지 않았다.

## Shared Phenomenon Summary
- none
