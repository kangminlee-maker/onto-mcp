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
- issue-001 (high): Result.status와 Report.result_status가 동일한 현재 결과 상태를 서로 다른 어휘로 보관하고 야간 배치로 동기화되므로, 교정 후 배치 전에는 임상의가 신뢰하는 권위 값이 corrected와 finalized로 분기된다. 이는 즉시 수정해야 하는 고위험 상태 권위 결함이다.
  - root cause: 동일한 결과 상태 의미를 두 속성에 별도 어휘로 저장하면서 동기화 권위를 야간 배치에 둔 설계
  - materiality: 이 문서는 EMR/LIS 통합에서 엔티티와 상태 의미를 정하는 개념 권위 문서다. 그런데 동일 결과의 현재 상태가 시스템별로 다르게 보일 수 있어 단일한 상태 의미를 제공하지 못하고, 임상의의 운영·진료 판단에 대한 신뢰도 함께 약화시킨다.
  - action: 먼저 결과 상태의 단일 canonical lifecycle과 두 필드 사이의 명시적 매핑을 정의해야 한다. 그다음 Report 상태를 canonical 상태에서 즉시 파생하거나 동일한 원자적 이벤트로 갱신해 불일치 창을 제거해야 한다. 지연 동기화가 불가피하면 pending-amendment 상태, 최대 허용 지연, 동기화 실패 처리, 사용자 표시 계약을 모델에 포함해야 한다.
- issue-006 (high): 검증과 긴급 통보가 정적 속성으로 축약되어 있어 수행 증거, 책임, 재통보, 실패 및 수신 확인을 감사 가능하게 구분·재구성할 수 없다.
  - root cause: 결과 검증과 긴급 통보라는 통제 행위를 시간·행위자·근거를 가진 사건이 아니라 정적 속성으로 축약했기 때문에 수행 증거와 책임을 재구성할 수 없다.
  - materiality: EMR/LIS 통합에서 결과 검증과 위험 결과 통보는 환자 안전을 위한 핵심 통제다. 수행 여부·책임자·시점·근거와 통보 결과를 시스템 간 추적할 수 없으면 조사, 책임 확인 및 재통보가 불가능해져 공통 권위와 운영 추적성이라는 목적이 훼손된다.
  - action: VerificationEvent와 CriticalNotificationEvent를 먼저 독립된 감사 가능 사건으로 정의하고 Result 및 CriticalValue에 연결해야 한다. 각 사건에는 대상 결과, 행위자, 발생 시각, 근거를 기록하고, 통보 사건에는 수신자, 채널, 결과와 확인 상태까지 포함해야 재검증·재통보와 실패를 구분하고 환자 안전 통제의 증거를 복원할 수 있다.
- issue-008 (high): Result와 Report의 상태가 별도 권위 후보로 병행되지만 이를 지배하는 단일 권위와 완전한 파생·불일치 처리 규칙이 없어, 현재 결과 상태를 일관되게 판단할 수 없다.
  - root cause: 하나의 상태 개념을 시스템별 표현으로 투영하지 않고 Result와 Report에 별도 권위 후보로 중복 모델링했다.
  - materiality: 정정 후 야간 동기화 전과 같은 구간에는 임상의에게 노출되는 Report 상태와 LIS의 Result 상태가 달라질 수 있다. 어느 값을 원본으로 삼아야 하는지도 계약에 명시되지 않아, EMR과 LIS가 공유할 결과 상태의 개념 권위를 제공한다는 목적을 직접 약화한다.
  - action: 먼저 하나의 canonical ResultStatus와 그 권위 시스템을 지정하고 Report 상태를 명시적인 파생값으로 정의해야 한다. 이어 preliminary/prelim, final/finalized, corrected/amended 등을 포함한 전체 매핑과 상태 변경 사건을 규정하고, 동기화 시각·버전 및 불일치 탐지·처리 상태를 추가해야 한다. 이 순서로 권위를 먼저 단일화해야 후속 매핑과 동기화 규칙이 다시 별도 권위로 굳어지는 것을 막을 수 있다.
- issue-010 (high): Test와 Assay가 병렬 카탈로그로 운영되지만 개념 권위와 명시적 대응 관계가 없어, 신규 검사 등록과 수행법 변경 시 주문 항목과 실제 수행 항목의 의미가 드리프트하는 중대한 문제다.
  - root cause: Test와 Assay를 병렬 카탈로그로 유지하면서 권위 소유자와 명시적 대응 관계를 모델링하지 않았다.
  - materiality: EMR/LIS 연동은 주문 코드와 실제 수행 항목의 대응을 일관되게 해석할 수 있어야 한다. 두 카탈로그가 독립적으로 변경되면 신규·과거 주문과 결과의 의미 및 연동 규칙을 신뢰할 수 없으므로, 검사 카탈로그의 개념 권위를 제공한다는 목적이 직접 약화된다.
  - action: Test를 권위 있는 주문 카탈로그 개념으로 확정하고 Assay를 버전과 유효기간을 가진 수행 매핑으로 연결하거나, 공통 CatalogItem 아래에서 주문과 수행 역할을 명시적으로 분리해야 한다. 먼저 권위 경계를 정한 뒤 대응 관계의 버전·유효기간을 모델링하고, 신규 등록·변경·폐기 시 양쪽의 정합성을 검증하는 규칙을 정의해야 과거와 신규 주문·결과의 의미를 안정적으로 보존할 수 있다.
- issue-016 (high): Result.status와 Report.result_status가 동일한 결과 상태를 서로 다른 어휘와 권위 규칙으로 표현하고 있어, 최종성과 정정 여부를 일관되게 판단할 단일 의미 권위가 없다.
  - root cause: 동일한 상태 개념을 Result와 Report에 별도 권위 값으로 두면서 공통 어휘와 파생 규칙을 정의하지 않았다.
  - materiality: Result가 corrected로 바뀐 뒤 Report가 야간 동기화 전까지 finalized로 남을 수 있으므로 LIS와 EMR이 동일 결과에 대해 서로 다른 상태를 표시할 수 있다. 이는 임상의의 신뢰를 훼손하고, 결과 상태를 일관되게 해석·전달해야 하는 EMR/LIS 연동 계약의 실행 가능성을 약화하므로 material한 high-severity 문제다.
  - action: 먼저 항목 상태의 단일 권위를 Result.status로 확정하고 Report.result_status를 그 상태들의 명시적 집계·projection으로 정의하거나, 두 표현이 하나의 공통 상태 어휘를 사용하도록 통합해야 한다. 이어 모든 상태에 대한 완전한 대응표와 집계 규칙을 정의하고, 정정 발생 시 동기화 시점과 외부 공개 규칙까지 명시해야 한다. 이 순서가 필요한 이유는 권위와 의미를 먼저 고정해야 동기화 및 전달 규칙이 일관된 기준을 따를 수 있기 때문이다.
- issue-021 (high): 수행 단위인 Assay가 Test·Specimen·Result와 연결되지 않아 Order에서 실제 수행과 Result까지 이어지는 핵심 워크플로가 구조적으로 단절되어 있다.
  - root cause: Test와 Assay를 병존시키면서 두 수행 카탈로그를 잇는 정식 관계를 모델에 포함하지 않았다.
  - materiality: 주문된 Test가 하나 이상의 Assay로 수행될 때 권위 문서만으로 주문 항목, 분석 수행, 결과의 대응을 추적할 수 없다. 이에 따라 각 EMR/LIS 구현체가 Test–Assay 매핑을 문서 밖에서 임의로 정의하게 되어 시스템 간 추적성과 개념 권위가 깨진다.
  - action: 먼저 Test와 Assay 사이에 명시적인 수행 매핑 관계와 카디널리티를 정의해야 한다. 이어 실제 분석 수행을 결과까지 추적할 수 있도록 Assay를 Result에 연결하고, 검체 수준 추적이 필요하면 Specimen과의 관계도 추가하여 Order→Test→Assay→Result 경로를 닫아야 한다. 이 수정은 외부 구현체가 임의 매핑을 만들기 전에 권위 모델에서 완료되어야 한다.
- issue-002 (medium): Test와 Assay의 대응 및 카탈로그 권위가 정의되지 않은 상태에서 이중 등록을 요구하면 주문·수행 카탈로그가 분기되므로, 통합 구현의 다음 단계 전에 개념 경계와 단일 권위를 확정해야 한다.
  - root cause: Test–Assay의 장기 개념 경계를 결정하지 않고 중복 등록을 임시 운영 정책으로 채택한 것
  - materiality: 신규 검사가 Test와 Assay에 독립 등록되거나 검체 유형이 enum과 자유 문자열로 달라지면 EMR의 주문, LIS의 수행, 결과가 동일 검사 개념을 참조한다는 보장이 없다. 이는 공유 검사 카탈로그의 핵심 목적인 신뢰할 수 있는 통합 매핑과 일관된 변경 관리를 약화하므로 material issue이다.
  - action: 다음 통합 단계 전에 Test를 주문 가능 개념, Assay를 수행 가능 개념으로 유지할지 또는 통합할지 먼저 결정해야 한다. 분리한다면 버전된 realizes/mapped_to 관계와 카디널리티를 정의하고, 검체 유형은 하나의 canonical vocabulary를 공유하게 해야 한다. 이후 한 권위 카탈로그에서 다른 표현을 파생하도록 등록·변경 경로를 정해 이중 독립 등록을 제거해야 한다.
- issue-003 (medium): 즉시 통보의 수신자·시각·근거가 결과와 연결되지 않아 통보 완료를 재구성하거나 감사할 수 없으므로, 현재 온톨로지의 운영 권위 경계는 불완전하다.
  - root cause: 통보 행위를 독립 워크플로 개념으로 모델링하지 않고 boolean과 연결되지 않은 외부 기록으로 분할한 것
  - materiality: 온톨로지가 notified=true만 제공하고 통보 증거를 연결되지 않은 외부 대장에 맡기면 EMR/LIS가 동일한 완료 의미를 재현·검증할 수 없다. 그 결과 시스템마다 완료 상태와 감사 가능성이 달라져, 임상검사 워크플로의 엔티티·관계·상태에 대한 개념 권위를 제공하려는 목적이 약화된다.
  - action: 다음 단계 전에 Notification 또는 CriticalValueNotification을 독립 사건으로 모델링하고 critical result, recipient, notified_at, acknowledgement, delivery status를 연결해야 한다. 외부 전화 대장이 증거의 권위라면 외부 기록 식별자와 함께 권위 소재, 동기화 방식 및 동기화·전달 실패 경계도 명시해야 한다. 그래야 통보 완료의 의미를 시스템 간에 일관되게 재현하고 감사할 수 있다.
- issue-005 (medium): Specimen 수명주기가 정상 분석 완료에서 끝나 예외와 최종 처분을 공통 상태나 사건으로 표현할 수 없으며, 그 결과 EMR/LIS 간에 결과 부재 원인과 검체의 최종 상태를 교환·감사할 수 없다.
  - root cause: Specimen lifecycle을 정상 분석 완료까지만 정의하고 거부·재채취·보관·폐기 같은 예외 및 후속 처리를 외부 규정으로 밀어냈기 때문에 검체의 최종 상태를 표현할 수 없다.
  - materiality: 이 모델은 주문부터 보고까지의 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 제공해야 한다. 그러나 검체가 거부·분실·재채취 대상이 되거나 분석 후 보관·폐기될 때 그 원인과 최종 처분을 나타내지 못하므로, 정상 경로 밖의 주문 미완료와 결과 부재를 일관되게 설명하거나 감사할 수 없어 목적을 실질적으로 약화한다.
  - action: 다음 단계로 진행하기 전에 검체의 거부·재채취·보관·폐기를 표현하도록 모델을 보완해야 한다. 필요한 상태를 Specimen lifecycle에 확장하거나, 변화 수용성과 감사 가능성을 위해 사유·행위자·시각을 가진 SpecimenDisposition 또는 SpecimenException 사건으로 모델링하고 정상 및 예외 경로에 연결해야 한다.
- issue-007 (medium): 카탈로그와 위험 기준에 버전·유효기간 이력이 없고 결과가 당시 적용된 버전을 참조하지 않아, 과거 결과의 검사 정의와 critical-value 판정 기준을 신뢰성 있게 재구성할 수 없다.
  - root cause: 카탈로그 항목과 임계치를 시간 의존 정의가 아닌 현재 상태의 정적 엔티티로 모델링했다.
  - materiality: 검사 정의, 검체 요구사항 또는 critical-value 경계가 변경되면 현재 값만으로 과거 결과를 소급 해석해야 한다. 이 경우 시스템마다 당시 의미와 판정 기준을 다르게 복원할 수 있어, 시간이 지나도 결과와 규칙의 의미를 재구성하는 개념 권위가 약화된다.
  - action: 다음 단계 전에 카탈로그 항목과 임계치 정의에 안정 식별자, 버전, 유효기간, 활성·폐기 상태를 도입해야 한다. 이어 Result 또는 검사 실행 사건이 실제 적용된 정의 및 임계치 버전을 참조하도록 연결해야 한다. 정의의 시간적 권위를 먼저 확립한 뒤 결과 참조를 연결해야 과거 결과의 의미와 판정 근거를 일관되게 감사·재구성할 수 있다.
- issue-009 (medium): 독립된 분석 실행 사건이 없어 분석 실행, 장비, 작업자, 재검 및 QC 판정과 결과 사이의 provenance를 추적할 수 없다.
  - root cause: 분석 수행을 Assay 중심의 독립 사건으로 모델링하지 않고 Specimen에서 Result로 직접 연결했기 때문에 실행·장비·작업자·QC provenance가 사라진다.
  - materiality: 이 공백은 주문에서 보고까지의 검사 파이프라인을 EMR/LIS 공통 개념으로 표현하려는 목적을 약화한다. 실제 수행 경로와 재검·장비·QC 예외를 교환할 때 핵심 운영 정보가 시스템별 비표준 필드로 남아 결과 추적의 신뢰성이 떨어진다.
  - action: 다음 단계 전에 AnalyticalRun 또는 TestExecution을 독립 사건으로 도입해야 한다. 먼저 이를 Specimen 또는 aliquot, Test와 Assay에 연결하고, 이어 장비, 작업자, 수행 시각, 재실행 관계, QC disposition 및 생성된 Result를 같은 실행에 귀속시켜야 한다. 이 순서가 결과 provenance와 예외 처리의 공통 결합점을 마련하며, 해당 공백은 다음 단계 진행 전에 해소해야 한다.
- issue-011 (medium): 검체 유형이 Specimen·Test의 폐쇄형 enum과 Assay의 자유 문자열로 분산되어 있어, 신규 검체 유형이나 외부 LIS 표현을 수용할 때 구조와 변환 규칙을 반복 수정해야 하며 시스템 간 의미를 안정적으로 보존하기 어렵다.
  - root cause: 공유되어야 할 검체 분류를 독립 속성들의 enum 또는 문자열 값으로 내장했다.
  - materiality: 현재 네 범주 밖의 검체나 WB·Serum 같은 세분화된 표현이 들어오면 여러 엔티티와 임의 문자열 매핑을 함께 변경해야 한다. 이는 서로 다른 EMR/LIS 표현을 지속적으로 통합한다는 목적을 약화하고 기존 연동 데이터의 의미 연속성을 훼손하므로 material한 medium 이슈다.
  - action: 다음 단계 전에 검체 유형을 독립된 권위 코드 개념으로 승격하고 Specimen, Test, Assay가 이를 참조하도록 해야 한다. 이어 외부 코드 체계별 매핑, 상·하위 유형, 버전과 유효기간을 같은 권위 아래 표현해야 신규 유형을 기존 엔티티 정의의 반복 변경 없이 수용하고 데이터 의미의 연속성을 유지할 수 있다.
- issue-012 (medium): 변경 가능한 검사·분석 카탈로그와 CriticalValue 규칙에 항목별 코드체계, 버전, 유효기간 및 적용 버전 참조가 없어 변경 전후 데이터의 의미를 보존할 수 없다. 이 문제는 다음 단계 전에 해소해야 한다.
  - root cause: 변경 가능한 카탈로그 항목과 임계 규칙을 시간에 따라 버전 관리되는 개념으로 모델링하지 않았다.
  - materiality: 검사 코드의 재사용·폐기, 분석법 변경 또는 임계값 개정이 발생하면 과거 결과에 적용된 정의와 현재 정의를 구분할 수 없다. 그 결과 재처리, 감사, EMR/LIS 연동 변환에서 현재 의미를 과거 데이터에 잘못 적용할 위험이 생겨 역사적 해석의 연속성과 신뢰성이 훼손된다.
  - action: 다음 단계 전에 변경 가능한 카탈로그 항목과 CriticalValue 규칙에 안정 식별자, 코드체계, 항목별 버전, valid_from/valid_to 및 대체 관계를 추가해야 한다. 이어서 각 Result가 실제 적용된 항목 버전 또는 임계 규칙을 명시적으로 참조하게 해야 변경 이후에도 과거 결과의 의미를 재현하고 감사·재처리·연동 변환을 정확히 수행할 수 있다.
- issue-013 (medium): STAT 긴급도가 priority 값, is_stat 불리언, StatOrder 하위 타입으로 중복 표현되고 권위·파생 규칙이 없어, 불일치 데이터와 긴급도 확장 시 다중 수정 위험이 발생한다.
  - root cause: 하나의 긴급도 개념을 단일 권위로 두지 않고 enum, boolean, subtype으로 중복 모델링했다.
  - materiality: EMR/LIS가 주문 긴급도를 일관되게 교환·확장하려면 하나의 권위 있는 긴급도 계약이 필요하다. 현재 구조에서는 정책 변경이나 불일치 입력이 발생할 때 시스템마다 서로 다른 표현을 기준으로 판단할 수 있어 해석이 고착되고 스키마·변환 규칙 변경 비용이 누적된다.
  - action: 다음 단계 전에 priority를 긴급도의 단일 권위로 정규화해야 한다. stat_reason은 priority=stat일 때만 적용되는 조건부 속성으로 두거나, 정책·근거의 독립 수명주기가 필요하면 PriorityAssignment로 모델링한다. 호환성을 위해 is_stat 또는 StatOrder를 유지해야 한다면 권위 값에서 생성되는 명시적 projection으로 제한하고 일치 규칙과 소비 경로를 검증해야 한다.
- issue-014 (medium): 완료 조건 자체의 모순은 확정되지 않았지만, completed의 의미와 Result correction 이후 Order 처리 계약이 누락되어 EMR/LIS의 시간 경로가 달라질 수 있는 중간 심각도의 결함이다.
  - root cause: Order completed 판정을 가역적인 Result.status의 순간 조건에 의존시키면서 correction 이후의 종결 불변조건과 전이를 정의하지 않았기 때문에 완료 상태의 의미가 결정되지 않는다.
  - materiality: completed 처리 후 Result가 corrected로 바뀌면 EMR과 LIS가 Order 완료를 유지할지, 업무를 재개할지, 수정 상태로 전환할지를 서로 다르게 판단할 수 있다. 이 차이는 후속 검토·알림·처리 여부를 분기시켜 Order 상태를 일관된 개념 권위로 제공하려는 통합 목적을 약화한다.
  - action: 다음 단계 전에 먼저 completed를 종결 불변상태와 이력적 표지 중 무엇으로 사용할지 권위 명세로 결정해야 한다. 이어 Result correction 발생 시 Order를 그대로 유지할지, in_progress로 재개할지, amended/reopened 같은 별도 상태로 전환할지와 각 불변조건을 상태 계약에 정의해야 한다. 이 순서가 필요한 이유는 completed의 의미가 정해져야 후속 전이와 검증 규칙을 모순 없이 설계할 수 있기 때문이다.
- issue-015 (medium): release와 Result correction이 겹칠 때 단일 Report.result_status에 finalized와 amended가 모두 요구될 수 있지만, 어느 상태가 우선하는지 결정하는 규칙이 없어 구현별 상태 분기가 발생한다.
  - root cause: Report의 단일 상태를 설정하는 release와 correction 조건 사이에 사건 순서와 override 우선순위를 정의하지 않았기 때문에 중첩 조건에서 상호 배타적 상태가 동시에 요구된다.
  - materiality: Report.result_status는 임상의가 신뢰하고 EMR과 LIS가 공유해야 하는 단일 권위 상태다. 동일 사건에서 한 시스템은 finalized를, 다른 시스템은 amended를 선택할 수 있으면 그 권위성과 임상적 신뢰가 약화되므로 이 문제는 material하다.
  - action: corrected 조건이 finalized보다 우선하는지 명시하고, 동시 release·correction 사건의 직렬화 순서와 허용 사건 순서를 정의한 상태 전이표를 마련해야 한다. 특히 release 시점에도 correction 조건을 먼저 평가하는 등 결정 규칙을 실행 가능하게 규정해야 EMR과 LIS가 항상 동일한 단일 상태를 산출할 수 있다.
- issue-017 (medium): Test와 Assay의 정체성·역할·대응 cardinality가 정의되지 않아 주문–수행–결과의 의미 추적이 불완전하며, 다음 구현 단계 전에 권위 있는 개념 결정을 내려야 한다.
  - root cause: 주문 개념과 수행 개념의 정체성 및 대응 관계 결정을 문서가 유보했다.
  - materiality: 하나의 주문 항목에 여러 수행법이 대응하거나 EMR과 LIS가 두 개념을 서로 다른 단위로 취급하면 코드 매핑과 결과 해석이 구현자별 추측에 의존한다. 이는 주문 카탈로그와 검사실 수행 카탈로그 사이의 일관된 개념 매핑이라는 목적을 약화한다.
  - action: 다음 단계 전에 Test를 주문 의미, Assay를 실제 수행법으로 구별할지 먼저 결정해야 한다. 구별한다면 명시적 realizes/performs 관계와 cardinality를 정의하고 Result가 수행 Assay를 참조하게 해야 한다. 동의어라면 하나의 정규 개념으로 통합하고 기존 명칭은 호환 별칭으로 유지해야 한다.
- issue-018 (medium): 검체 상위 유형과 분석용 세부 물질이 서로 다른 분류 수준과 자료형으로 표현되고 이를 연결하는 정규 코드·계층·매핑이 없어, EMR 주문 요구 검체와 LIS 실제 검체·수행 조건이 의미적으로 호환되지 않는다.
  - root cause: 검체의 상위 유형과 분석용 세부 물질을 하나의 공통 개념처럼 사용하면서 정규 코드와 계층을 두지 않았다.
  - materiality: 자유 문자열인 세부 검체 표현을 폐쇄형 상위 열거값과 비교하거나 시스템 간 변환하면 동일 검체가 다르게 해석될 수 있다. 그 결과 유효한 검체가 거부되거나 부적합 검체가 허용되고 연동별 임의 매핑이 누적되어, EMR 주문에서 LIS 수행까지 검체 의미를 보존하려는 목적이 약화된다.
  - action: 다음 단계 전에 하나의 정규 검체·물질 코드 체계를 권위로 정하고 세 필드가 모두 이를 참조하도록 해야 한다. 상위 검체 유형과 세부 물질·채취 유형이 구별되어야 한다면 별도 속성으로 분리하고 명시적 계층과 매핑을 정의해야 한다. 이 정규화가 먼저 이루어져야 주문 적합성 검사, 수행 적합성 검사와 시스템 간 변환이 동일한 의미를 사용할 수 있다.
- issue-019 (medium): CriticalValue가 재사용 가능한 임계값 정책과 개별 결과의 통보 상태를 한 유형에 혼합하고 특정 Result 및 적용 규칙 버전을 참조하지 않아, 어떤 결과가 어떤 규칙으로 판정·통보되었는지 권위 있게 표현할 수 없다.
  - root cause: 재사용 가능한 임계 판정 규칙과 개별 결과의 통보 사건을 하나의 CriticalValue 유형에 혼합했기 때문에 정책과 사건의 생명주기·식별자가 충돌한다.
  - materiality: 동일 임계값이 여러 결과에 적용되거나 정책 변경 후 과거 통보 이력을 조회할 때 판정 근거와 통보 대상을 구분할 수 없다. 따라서 EMR과 LIS가 위험 결과 판정 및 통보를 동일하게 해석하기 어렵고, 안전 추적성과 연동 행동 계약이 약화된다.
  - action: 다음 단계 전에 CriticalValueRule과 CriticalResultNotification을 별도 유형으로 분리해야 한다. 통보 사건은 특정 Result, 수신자, 발생 시각, 상태와 적용된 규칙 버전을 참조하도록 하여 정책 개정과 과거 사건 보존을 독립시키고, 판정 및 통보의 권위 있는 추적 경로를 확보해야 한다.
- issue-020 (medium): STAT가 Order.priority, is_stat, StatOrder라는 세 표현에 분산되어 단일 권위와 개념 정체성이 불명확하므로, 현재 모델로는 불일치 시 어떤 표현이 긴급 주문의 라우팅과 처리 우선순위를 결정하는지 알 수 없다.
  - root cause: STAT를 하나의 정규 우선순위 개념으로 두지 않고 속성 값, 파생 불리언 및 존재론적 하위 타입으로 중복 승격했다.
  - materiality: EMR과 LIS가 서로 다른 STAT 표현을 권위로 사용하거나 일부 표현만 갱신하면 동일 주문의 긴급성이 시스템마다 다르게 해석될 수 있다. 이는 주문 우선순위와 STAT 처리 의미를 일관되게 교환한다는 계약을 약화시키고 긴급 주문의 라우팅 및 처리 순서를 달라지게 할 수 있다.
  - action: 다음 단계 전에 STAT의 정규 권위를 결정해야 한다. 기본 조치는 Order.priority의 stat 값을 유일한 권위로 삼고 is_stat를 그 값에서 파생하며 StatOrder 하위 타입을 제거하는 것이다. stat_reason은 priority=stat일 때만 허용되는 조건부 속성으로 정의한다. 별도 타입을 유지해야 한다면 먼저 STAT의 불변성 및 생성 조건을 정책으로 확정한 뒤, 세 표현의 강제 동치와 변경 규칙을 명시해야 한다.
- issue-022 (medium): Order·Specimen·Result·Report에는 상태 값과 일부 완료 조건만 있을 뿐, 시작·허용·금지·종결 전이를 연결하는 권위 있는 상태 그래프가 없어 EMR/LIS 구현의 적합성을 판정할 수 없다.
  - root cause: 상태 집합과 일부 완료 조건만 선언하고 시작·중간·종결 상태를 잇는 허용 전이 그래프를 모델링하지 않았기 때문에 구현 적합성을 판단할 수 없다.
  - materiality: completed 외의 Order 전이, Specimen 진행 전이, Result·Report 상태 변경을 처리할 때 가능한 다음 상태와 금지된 역전이를 문서에서 결정할 수 없다. 그 결과 EMR과 LIS가 서로 다른 전이 그래프를 구현해도 차이를 판별하거나 조정할 수 없어, 공유 상태 모델의 구조적 권위와 상호운용성이 약화된다.
  - action: 다음 단계 전에 각 상태 보유 엔티티별 시작 상태, 허용·금지 전이, 전이 조건과 우선순위, 종결 상태를 명시적인 전이 구조로 정의하고 기존 state_rules를 해당 전이에 연결해야 한다. 특히 사건 순서와 상호 배타적 상태의 우선순위, Result 정정 경로와 종결 불변조건까지 같은 권위 구조에서 결정해야 구현 적합성과 향후 상태 변경의 호환성을 검증할 수 있다.
- issue-023 (medium): CriticalValue와 실제 Result 및 통보 기록 사이의 필수 관계가 없어, 어떤 위험 결과가 누구에게 언제 통보되었는지 결과별로 추적할 수 없다.
  - root cause: 통보를 독립 이벤트나 참조 가능한 기록으로 모델링하지 않고 CriticalValue의 불리언 속성으로만 축약했다.
  - materiality: 위험 결과의 즉시 통보를 추적 가능한 개념 구조로 표현하려면 통보 완료 여부를 해당 Result, 통보 시각, 수신자 및 근거 기록과 연결해 검증할 수 있어야 한다. 현재 구조에서는 notified가 고립된 주장으로 남아 EMR/LIS 간 운영 추적성과 통합 계약의 신뢰가 약화되므로 material한 문제다.
  - action: 다음 단계 전에 임계 판정된 Result와 CriticalValue를 연결하고, 통보 이벤트 엔티티 또는 명시적인 외부 기록 참조를 추가해야 한다. Result→CriticalValue 판정→통보 이벤트→수신자 경로에 통보 시각과 근거 기록을 포함해 notified 상태가 검증 가능한 파생 사실이 되도록 해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-021: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: narrowed
- issue-015: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-019: no-deliberation-needed
- issue-020: no-deliberation-needed
- issue-022: no-deliberation-needed
- issue-023: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 엔티티·상태 의미를 정하는 개념 권위 문서로 사용되는 목적
- issue-006: EMR/LIS 통합에서 결과 검증과 위험 결과 통보의 공통 권위 및 운영 추적성 제공
- issue-008: EMR과 LIS가 공유할 결과 상태의 개념 권위 제공
- issue-010: EMR/LIS 연동 설계에서 검사 카탈로그의 개념 권위를 제공하는 목적
- issue-016: EMR/LIS 연동 설계의 개념 권위 문서로서 결과 상태의 일관된 해석과 전달
- issue-021: EMR/LIS 연동에서 주문부터 수행·결과까지의 개념 권위와 추적 가능한 연결 구조
- issue-002: EMR/LIS가 공유할 검사 카탈로그 개념과 관계의 권위 제공
- issue-003: 임상검사 워크플로의 엔티티·관계·상태를 EMR/LIS 통합의 개념 권위로 제공하는 목적
- issue-005: 주문부터 보고까지 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 제공하는 목적 Source finding context: 주문부터 보고까지의 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 제공하는 목적
- issue-007: 시간이 지나도 결과와 검사 규칙의 의미를 재구성할 수 있는 개념 권위 제공
- issue-009: 주문부터 보고까지 검사 파이프라인을 EMR/LIS 통합 개념 모델로 표현하는 목적 Source finding context: 주문부터 보고까지의 검사 파이프라인을 EMR/LIS 통합 개념 모델로 표현하는 목적
- issue-011: 서로 다른 EMR/LIS 검체 표현을 지속적으로 통합할 수 있는 개념 모델 제공
- issue-012: 외부 표준과 검사 규칙이 바뀌어도 EMR/LIS 데이터의 역사적 해석 연속성을 유지하는 목적
- issue-013: EMR/LIS가 주문 긴급도를 일관되게 확장하고 교환할 수 있는 개념 권위 제공
- issue-014: EMR/LIS 통합에서 Order 상태를 일관된 개념 권위로 제공하는 목적
- issue-015: 임상의가 신뢰하는 Report.result_status를 EMR/LIS 사이의 단일 권위 상태로 제공하는 목적
- issue-017: 주문 카탈로그와 검사실 수행 카탈로그 사이의 EMR/LIS 개념 매핑
- issue-018: EMR 주문 요구 검체와 LIS 실제 검체·수행 조건의 의미 보존
- issue-019: 위험 결과 판정과 통보를 EMR/LIS가 동일하게 해석하는 개념 모델 제공 Source finding context: 위험 결과 판정과 통보를 EMR/LIS가 동일하게 해석할 수 있는 개념 모델
- issue-020: EMR/LIS 사이에서 주문 우선순위와 STAT 처리 의미를 일관되게 교환하는 계약
- issue-022: EMR/LIS가 공유할 상태 모델의 구조적 권위 제공
- issue-023: 위험 결과의 즉시 통보를 포함하는 임상검사 워크플로의 추적 가능한 개념 구조

## Final Review Result
22 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result.status와 Report.result_status가 동일한 현재 결과 상태를 서로 다른 어휘로 보관하고 야간 배치로 동기화되므로, 교정 후 배치 전에는 임상의가 신뢰하는 권위 값이 corrected와 finalized로 분기된다. 이는 즉시 수정해야 하는 고위험 상태 권위 결함이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 야간 배치 지연 시간과 교정 결과 소비자에게 적용되는 완화 장치는 경계 내 증거로 확인되지 않았다.
- 실제 LIS에 별도 Test–Assay 매핑이 존재하는지는 이 검토 경계 밖이며, 존재하더라도 현재 권위 문서의 구조적 단절은 해소하지 못한다.
- 기존 EMR/LIS 카탈로그의 실제 매핑과 코드체계는 경계 내 근거에 없어 현행 데이터의 드리프트 규모는 판단하지 않았다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now
- issue-010 (high): fix_now
- issue-016 (high): fix_now
- issue-021 (high): fix_now
- issue-002 (medium): fix_before_release, accept_risk
- issue-003 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up
- issue-014 (medium): fix_before_release, accept_risk
- issue-015 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, accept_risk
- issue-018 (medium): fix_before_release, follow_up
- issue-019 (medium): fix_before_release, follow_up
- issue-020 (medium): fix_before_release, accept_risk
- issue-022 (medium): fix_before_release, follow_up
- issue-023 (medium): fix_before_release, follow_up

## Recommendations
- issue-004 (low): TAT 계산 계약과 소유권이 온톨로지에 없어 소비자별 예외·누락값·시간대 처리가 분기될 수 있다. Source finding context: clinical-lab-ontology.yaml — turnaround_time note Source finding context: materialized-input.md:126-128; value authority: review-value-alignment-criteria.yaml:6-8 and materialized-input.md:6-8 Source finding context: TAT 의미를 선언하면서 계산 권위를 대시보드 팀에 별도로 두어 개념 권위가 소비자별 구현으로 분산된다. Source finding context: 동일 지표가 다른 소비자에서 재계산될 때 예외, 누락값, 시간대 처리 등이 달라질 수 있다. 통합 개념의 의미를 정하면서 계산 계약을 외부 소유로 남기는 것은 문서의 권위 목적과 어긋난다. Source finding context: TAT를 collected_at과 released_at에서 파생되는 canonical projection으로 정의하고 null, 재채취, 정정 보고, 시간대 처리 규칙과 소유자를 이 문서 또는 명시적으로 연결된 계약에 둔다. Source finding context: .onto/review/20260718-41d4c6bb/round1/axiology.findings.yaml#axiology-candidate-004

## Unique Finding Tagging
- issue-004 (low): TAT 계산 계약과 소유권이 온톨로지에 없어 소비자별 예외·누락값·시간대 처리가 분기될 수 있다. Source finding context: clinical-lab-ontology.yaml — turnaround_time note Source finding context: materialized-input.md:126-128; value authority: review-value-alignment-criteria.yaml:6-8 and materialized-input.md:6-8 Source finding context: TAT 의미를 선언하면서 계산 권위를 대시보드 팀에 별도로 두어 개념 권위가 소비자별 구현으로 분산된다. Source finding context: 동일 지표가 다른 소비자에서 재계산될 때 예외, 누락값, 시간대 처리 등이 달라질 수 있다. 통합 개념의 의미를 정하면서 계산 계약을 외부 소유로 남기는 것은 문서의 권위 목적과 어긋난다. Source finding context: TAT를 collected_at과 released_at에서 파생되는 canonical projection으로 정의하고 null, 재채취, 정정 보고, 시간대 처리 규칙과 소유자를 이 문서 또는 명시적으로 연결된 계약에 둔다. Source finding context: .onto/review/20260718-41d4c6bb/round1/axiology.findings.yaml#axiology-candidate-004

## Shared Phenomenon Summary
- none
