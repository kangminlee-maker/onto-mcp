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
- issue-001 (high): Result와 Report가 동일한 임상 상태를 독립된 비버전 어휘로 보유하고 완전한 투영 규칙 없이 비동기 동기화되므로, 임상의에게 노출되는 상태가 실제 결과와 어긋나거나 혼합 버전 환경에서 번역되지 않을 수 있다.
  - root cause: Result와 Report의 상태를 독립된 비버전 어휘로 저장하고 정규 권위와 완전한 투영 계약을 두지 않아 현재의 배치 지연 불일치와 향후 혼합 버전 해석 실패가 함께 발생한다.
  - materiality: 이 문서는 LIS의 결과 생산부터 EMR의 임상의 보고까지 신뢰할 수 있는 상태 권위와 호환 계약을 제공해야 한다. 그러나 권위 값으로 선언된 Report.result_status가 정정된 Result.status보다 늦게 갱신되거나 새 상태를 해석하지 못하면 임상 판단과 통합 소비자의 데이터 신뢰가 직접 훼손되므로 material high 이슈이다.
  - action: 먼저 하나의 버전된 정규 결과 상태를 권위로 지정해야 한다. 다음으로 Report 상태를 그 권위에서 파생되는 투영으로 정의하고, 모든 값과 전이, 유효 버전, 알 수 없거나 더 새로운 값의 처리까지 포함한 완전한 매핑 계약을 마련해야 한다. 마지막으로 결과 정정 시 임상의 노출 상태와 배포 상태가 같은 전이에서 원자적으로 갱신되도록 야간 배치 의존성을 제거해야 현재 불일치와 혼합 버전 위험을 함께 닫을 수 있다.
- issue-002 (high): Test와 Assay 사이에 정규적이고 수명주기 있는 관계가 없어 EMR 주문을 LIS 수행 단위에 권위 있게 연결할 수 없으며, 카탈로그 변경 시에도 그 연결의 정체성을 보존할 수 없다.
  - root cause: 주문 단위 Test와 수행 단위 Assay 사이에 수명주기와 카디널리티를 가진 정규 매핑 및 원천 권위를 정의하지 않아 카탈로그 중복, 구조적 경로 단절, 변경 시 정체성 상실이 함께 발생한다.
  - materiality: 이 문서의 목적은 Order부터 Report까지 EMR 주문 카탈로그와 LIS 수행 카탈로그를 일관되게 연결하는 개념 권위를 제공하는 것이다. 그러나 주문 Test를 수행 Assay로 변환하거나 결과를 원 주문에 귀속하는 경로가 닫혀 있지 않아 구현별 비공식 매핑이 권위를 대신한다. 항목의 추가·변경·분할·병합·폐기 때 카탈로그 드리프트와 결과 귀속 불일치를 검증할 수도 없으므로 현재의 필수 완전성 결함이다.
  - action: Test와 Assay의 의미적 구별은 유지하되, 다대다 가능성을 포함한 명시적 수행 매핑을 정의해야 한다. 매핑에는 카디널리티, 유효기간, 상태, 안정적인 매핑 식별자, 식별 권위, 선행·후행 참조를 포함하고 공통 검체 용어 체계로 동일성을 검증해야 한다. 먼저 카탈로그별 식별 권위와 매핑 수명주기를 확정한 뒤 주문-수행-결과 경로가 이 매핑을 사용하도록 연결해야 하며, 이 조치는 대상 문서에서 즉시 닫아야 한다.
- issue-003 (high): 재사용되는 CriticalValue 규칙과 환자별 위험값 발생·통보 사건이 하나의 엔티티와 `notified` boolean으로 혼합되어, 해당 값이 어느 Result의 통보를 뜻하는지와 통보 시각·수신자·책임을 온톨로지에서 식별할 수 없다.
  - root cause: 재사용되는 CriticalValue 정책과 환자별 위험 결과·통보 사건을 하나의 엔티티와 boolean으로 축약해 통보 대상과 이행 증거가 모두 소실된다.
  - materiality: 위험 결과의 판정과 즉시 통보 상태를 EMR/LIS가 공통으로 해석하고 신뢰해야 하지만, 현재 모델로는 반복 발생한 위험 결과별 통보 이행을 귀속하거나 검증할 수 없다. 그 결과 미통보 건을 완료로 오인하고 지연·누락·오연결을 탐지하지 못할 수 있어 임상 안전성과 감사 가능성이 약화된다.
  - action: CriticalValueRule, Result별 위험값 발생, 통보 이벤트를 순서대로 분리해야 한다. 규칙에는 검사·단위·적용 조건과 경계를, 발생에는 Result 참조와 판정 시각 및 적용 규칙을, 통보 이벤트에는 발신자·수신자·통보 시각·통보 및 확인 상태를 구조화한다. 외부 전화 기록은 채널별 증거로 참조하되 통보 완료의 정규 권위는 구조화된 통보 이벤트에 두어야 한다.
- issue-004 (high): Specimen 생명주기가 성공적인 분석 경로에만 한정되어 운송·거부·재채취와 보관·폐기 상태를 표현하지 못하므로, Order-to-Report 통합의 공통 권위 모델로서 불완전하다.
  - root cause: Specimen 개념을 성공적인 분석 경로에만 한정하고 예외 처리와 보관·폐기 단계를 온톨로지 밖 정책으로 위임했다.
  - materiality: 이 누락 때문에 EMR과 LIS는 미수집, 운송 중, 거부, 재채취, 보관, 폐기를 일관되게 교환·판정할 수 없다. 각 구현이 서로 다른 로컬 상태를 만들게 되어 검체의 가용성, 인계 상태와 최종 처분을 신뢰성 있게 확인할 수 없으므로 선언된 통합 목적을 직접 약화한다.
  - action: 먼저 공통 Specimen 생명주기에 collection-pending/collected, in-transit, received, accepted/rejected, processing/analyzed, retained/disposed 상태와 관련 시각, 거부 사유, 재채취 연결 및 보관·폐기 증거를 추가해야 한다. 그다음 부서별 세부 규칙과 거부 분류는 이 공통 모델을 정제하도록 두고, 기존 기록과 소비자가 유지되도록 상태 전이·호환 계약을 함께 정의해야 한다. 이는 통합 경계에서 검체 가용성, 인계와 최종 처분을 동일하게 판정하기 위한 필수 조치다.
- issue-005 (high): 주문된 Test와 실제 수행된 Assay·방법·장비·QC 판정·Result를 잇는 분석 실행 개념이 없어, 결과가 어떤 승인된 실행에서 생성되었는지 추적할 수 없다.
  - root cause: 분석 단계를 실행 개념이 아니라 카탈로그 명사와 최종 결과 값만으로 표현해 수행 방법, QC, 반복 실행과 결과 계보가 모델에서 빠졌다.
  - materiality: 이 누락은 주문부터 보고까지 권위 있는 검사 파이프라인을 제공한다는 목적을 직접 약화한다. 실제 수행 방법이 다르거나 QC 실패 후 재실행된 결과를 구별할 수 없어, 분석적으로 동등하지 않은 결과의 계보와 시스템 간 안전한 조정을 보장할 수 없다.
  - action: 먼저 Test와 실제 수행 Assay/version 사이의 경로를 확립하고, 이를 포함하는 최소 분석 실행 개념을 추가해야 한다. 이 개념은 주문된 Test, Specimen, 수행 Assay/version, 방법 또는 장비, 실행 시각, QC 판정과 생성된 Result를 연결해야 하며, 반복·재실행 및 선행 실행 관계도 표현해야 한다. 장비 내부 구현까지 모델링할 필요는 없지만 통합 계약에서 결과의 실행 계보와 승인 여부를 판별할 정보는 반드시 보존해야 한다.
- issue-006 (high): 검증·발행·정정·개정·위험값 통보가 변경 가능한 현재 상태로만 표현되어, 행위자·시각·사유·이전 버전·수신자 확인을 갖춘 완전한 감사 증거를 보존하지 못한다.
  - root cause: 검증, 발행, 정정과 통보 같은 안전 관련 행위를 불변 감사 사건이 아니라 변경 가능한 현재 상태 조각으로 모델링했다.
  - materiality: 이 공백은 임상적으로 중요한 행위를 EMR/LIS에 권위 있게 통합하려는 목적을 약화한다. 현재 플래그만으로는 감사나 시스템 간 조정 시 누가 언제 무엇을 왜 수행했는지, 정정 전 결과가 무엇이었는지, 위험값을 누가 수신하고 확인했는지를 입증할 수 없어 임상 책임성과 분쟁 해결이 훼손된다.
  - action: 검증, 발행, 정정·개정, 위험값 통보를 각각 불변의 감사 사건 또는 동등한 구조화 기록으로 정의해야 한다. 각 사건은 대상, 행위자, 발생 시각, 사유·근거, 해당 시 이전 버전, 통보 수신자와 확인, 원천 시스템을 연결해야 한다. 먼저 사건과 필수 관계를 권위 모델에 두고, 현재 상태는 이 사건 이력에서 파생되도록 해야 정정·재발행 이후에도 감사와 시스템 간 조정이 가능하다.
- issue-008 (high): 중복 카탈로그, Result·Report 상태, TAT 값이 불일치할 때 정규 값을 결정할 완전한 권위·투영 계약이 없어 EMR, LIS 및 하위 소비자가 서로 다른 결과를 정당하게 채택할 수 있다.
  - root cause: 여러 구성요소에 병렬 표현된 사실에 대해 정규 원천, 투영 시점, 매핑 및 불일치 처리의 공통 계약을 정의하지 않았다.
  - materiality: 이 문서의 목적은 시스템 간 우선순위를 해결하는 개념 권위를 제공하는 것이지만, 불일치 시 적용할 결정적 우선순위가 없다. 따라서 구현별로 다른 임상 상태나 성능 지표를 표시하면서도 문서 준수를 주장할 수 있어 목적을 직접 약화한다.
  - action: 각 중복 사실별로 정규 개념과 원천 시스템을 먼저 지정한 뒤, 다른 표현을 그 원천의 투영으로 정의해야 한다. 이어 Test–Assay 매핑, 버전이 부여된 결과·보고 이벤트에서 상태를 도출하는 규칙, TAT의 정규 정의와 경계 타임스탬프, 투영 시점 및 불일치 탐지·조정 절차를 온톨로지 또는 직접 관리되는 계약에 명시해야 한다. 이 순서가 필요한 이유는 정규 원천이 확정되어야 매핑과 충돌 해결이 결정적으로 작동하기 때문이다.
- issue-012 (high): 완료된 Order의 Result가 `final`에서 `corrected`로 변경된 뒤에도 Order가 완료 상태를 유지하는지 판정할 일관된 규칙이 없다.
  - root cause: Order 완료 조건을 되돌릴 수 있는 Result 상태에 의존시키면서 정정 시 우선순위와 완료 후 Order 전이를 정의하지 않았다.
  - materiality: 이 공백은 동일한 임상검사 이력에 대해 EMR과 LIS가 서로 다른 완료 판정을 내리게 할 수 있다. 따라서 두 시스템 사이에서 Order와 Result 생명주기를 일관되게 해석하도록 하는 공유 상태 모델의 개념적 권위와 실행 가능성을 약화한다.
  - action: 정정 처리보다 먼저 완료 의미와 우선순위를 하나의 계약으로 결정해야 한다. 즉 `corrected`를 완료 충족 상태로 인정하거나, 정정 시 Order를 `completed`에서 명시적으로 전이시키거나, 완료를 특정 Result·Report 버전에 결속된 역사적 스냅샷으로 정의해야 한다. 선택한 의미에 맞춰 정정 이벤트의 전이 간선과 guard를 명시하고, 버전 간에도 과거 Order 판정이 일관되도록 호환성 규칙을 함께 정해야 한다.
- issue-013 (high): Result 정정 즉시 Report가 `amended`여야 한다는 불변조건과 다음 야간 배치까지 상태 갱신을 미루는 구현은 같은 시간 구간에서 양립할 수 없습니다. 따라서 현재의 권위 있는 Report 상태 계약은 시간적으로 모순됩니다.
  - root cause: 즉시 성립하는 corrected-to-amended 의무와 지연된 야간 배치 구현을 함께 선언하면서 그 지연을 허용 상태로 모델링하지 않았다.
  - materiality: released Result가 정정된 후 야간 배치 전까지 Report가 계속 `finalized`로 표시될 수 있습니다. 임상의와 EMR/LIS 소비자는 권위 값으로 선언된 `Report.result_status`를 안전하게 신뢰할 수 없으므로, 정확한 상태 전달이라는 목적이 직접 훼손됩니다.
  - action: 먼저 원자적 동기화와 명시적 eventual consistency 중 하나를 권위 있는 계약으로 결정해야 합니다. 원자적 방식을 택하면 Result 정정과 Report의 `amended` 전이를 함께 커밋해야 합니다. Eventual consistency를 택하면 허용 지연의 상한, `pending_amendment` 또는 stale 상태, 해당 상태의 진입·해소 전이, 소비자의 표시·처리 규칙을 먼저 정의하고 계약 변경을 버전화한 뒤 야간 배치 구현과 소비자를 맞춰야 합니다.
- issue-014 (high): Result의 corrected와 Report의 amended는 서로 다른 상태 차원인데도 직접 대응하는 동의어처럼 취급되어 의미 경계와 조건부 전이가 불명확하다. 그 결과 정정된 Result와 finalized인 Report가 동시에 존재할 수 있다.
  - root cause: Result 검증·정정 상태와 Report 발행·개정 상태라는 서로 다른 의미 차원을 동일 정보로 간주하고 각각 권위 값으로 독립 저장했다.
  - materiality: 이 모델은 EMR/LIS 연동에서 결과와 보고 상태의 일관된 의미를 제공해야 한다. 그러나 Result 정정 후 야간 동기화 전까지 Report가 finalized로 남으면 임상의에게 노출되는 보고 상태가 실제 정정을 반영하지 않아 임상 판단과 시스템별 상태 해석이 달라질 수 있으므로 선언된 목적을 중대하게 약화한다.
  - action: 먼저 Result의 검증·정정 상태와 Report의 발행·개정 상태를 별도 개념으로 정의해야 한다. 이어서 Result 정정이 Report 개정을 요구하는 조건과 허용 전이를 명시하고, 임상의에게 노출되는 상태가 단일 권위 경로를 통해 원자적으로 갱신되도록 해야 한다. 의미 경계를 먼저 확정해야 전이·투영 계약과 저장·노출 경로를 일관되게 설계할 수 있다.
- issue-007 (medium): Test, Assay 및 CriticalValue가 변경되면 과거 Result가 당시 어떤 정의·방법·단위·임계값에 따라 생성되고 판정되었는지 재구성할 수 없다.
  - root cause: 변경되는 카탈로그 정의와 임계값 지식을 버전·유효기간·역사적 바인딩이 없는 현재 상태 엔티티로만 표현했다.
  - materiality: 이 결함은 과거 기록의 해석과 감사가 당시 기준이 아니라 현재 설정에 의존하게 만든다. 따라서 EMR/LIS 기록과 카탈로그 유지보수 전반에서 지속 가능한 개념 권위가 되려는 목적을 약화하며, 운영화 전 해소해야 하는 material한 중간 심각도 문제다.
  - action: Test, Assay 및 CriticalValue에 안정 식별자, 명시적 버전, 유효기간과 대체 관계를 추가하고 이전 버전을 덮어쓰지 않고 보존해야 한다. 이어 각 분석 실행 또는 Result를 생성·판정 당시 적용된 정확한 버전에 바인딩해야 한다. 버전 보존 구조를 먼저 확립한 뒤 결과 바인딩을 적용해야 과거 기록을 결정적으로 재구성할 수 있으며, 이 조치는 다음 운영화 단계 전에 완료해야 한다.
- issue-009 (medium): 검체 분류가 Specimen·Test의 중복 enum과 Assay의 자유 문자열에 분산되고 서로 다른 의미 차원까지 혼합되어 있어, 현재 검체의 동치성과 적합성을 일관되게 비교할 수 없으며 향후 분류 변경도 의미 보존적으로 수행할 수 없다.
  - root cause: Specimen, Test와 Assay가 공유하는 단일 버전형 SpecimenType 권위가 없고 재료·가공 형태·채취 맥락을 서로 다른 입도의 type/kind 값에 혼합했다.
  - materiality: EMR 주문 요구와 LIS 분석 적합 검체를 지속 가능하게 교환하려면 동일한 분류 권위와 비교 가능한 의미 단위가 필요하다. 현재는 blood, WB, Serum, Urine-random처럼 입도와 의미가 다른 값을 직접 대응해야 하므로 부적합 검체를 허용하거나 적합 검체를 거부할 수 있고, 새 하위 유형·동의어·외부 코드 도입 시 소비자별 독자 매핑으로 상호운용성과 역사적 연속성이 약화된다.
  - action: 다음 단계 전에 안정 식별자, 별칭·외부 코드 매핑, 버전, 유효기간을 갖는 하나의 공통 SpecimenType 권위를 확립하고 Specimen, Test, Assay가 이를 참조하도록 해야 한다. 검체 재료·가공 형태·채취 방식과 시점·용기와 첨가제는 독립 의미 차원으로 분리해야 한다. 이후 기존 enum과 자유 문자열을 canonical identifier에 매핑하고 버전·유효기간에 따른 이력 및 마이그레이션 규칙을 정의해야 비교 가능성과 변경의 역사적 연속성을 함께 보장할 수 있다.
- issue-010 (medium): 식별자를 단순 문자열로 표현하는 현재 모델은 기관·원천 시스템·코드 체계가 확대되거나 코드가 변경될 때 충돌, 동등성, 역사적 승계를 판별할 수 없으므로 다음 통합 단계 전에 보완해야 한다.
  - root cause: 식별자를 할당 권위, namespace, 코드 체계 버전, 유효기간과 대체 관계가 없는 단순 문자열로 모델링했다.
  - materiality: 이 결함은 EMR/LIS 간 교차 시스템 개념 권위라는 목적을 직접 약화시킨다. 서로 다른 권위가 같은 값을 부여하거나 코드가 재사용·교체되면 엔티티 정체성이 모호해져 종단 조인과 마이그레이션이 잘못된 레코드를 연결하거나 과거 기록의 연속성을 잃을 수 있다.
  - action: 다음 통합 단계 전에 값, 할당 권위·시스템, namespace, 코드 체계 버전, 유효기간 및 대체 연결을 갖춘 재사용 가능한 Identifier 모델을 정의하고 각 엔티티의 정규 식별자를 명시해야 한다. 이를 먼저 확정해야 이후의 다기관 연결, 코드 변경, 종단 조인 및 마이그레이션이 일관된 식별 권위 계약을 사용할 수 있다.
- issue-011 (medium): CriticalValue 임계값 정책에 시간적 정체성과 적용 이력이 없어, 정책이 바뀌면 과거 Result와 통보가 어느 규칙에 따라 판정되었는지 보존할 수 없다.
  - root cause: 변경 가능한 CriticalValue 임계값 정책을 안정 식별자, 버전, 유효기간과 역사적 적용 바인딩이 없는 엔티티로 표현했다.
  - materiality: 이는 운영 검사 워크플로와 EMR/LIS 교환에 권위 있는 임상 규칙을 제공하려는 목적을 약화한다. 과거 판정 근거를 재현할 수 없으면 감사 가능성이 떨어지고, 임계값 변경이나 적용 조건 변경을 안전하게 이전할 수 없다.
  - action: 다음 단계 전에 CriticalValue 정책을 통보 사건과 분리된 버전형 규칙으로 모델링해야 한다. 규칙에는 안정 식별자, 단위와 적용 조건, 유효 시작·종료 시점, 상태, 선행·후행 관계를 두고, 각 Result와 통보 사건이 실제 적용된 규칙 버전을 명시적으로 참조하게 해야 한다. issue-003과 공유 원인 후보가 있으므로 중복 개념을 만들지 않도록 관련 수정과 함께 정합성을 확인해야 한다.
- issue-015 (medium): Test와 Assay의 의미 경계와 동일성 기준이 없어, 두 항목이 동의어인지 또는 주문 정의와 분석 수행 단위의 구성·실현 관계인지 결정할 수 없다.
  - root cause: 주문 가능 카탈로그 단위와 분석 수행 카탈로그 단위의 의미 경계와 입도를 정의하지 않은 채 둘 다 검사 항목으로 명명했다.
  - materiality: 한 주문이 여러 분석 단위로 수행되거나 패널을 포함할 때 해석이 갈릴 수 있다. 그 결과 EMR과 LIS가 서로 다른 주문-수행-결과 귀속을 만들 수 있어, 두 카탈로그 사이에 일관된 개념 권위를 제공하려는 목적이 약화된다.
  - action: 다음 단계의 카탈로그 운영 전에 Test를 주문 가능 정의, Assay를 분석 수행 정의로 명확히 구분하고 각각의 식별 권위를 정해야 한다. 이어 Test가 하나 이상의 Assay로 실현되는 명시적 대응 관계와 허용 카디널리티를 정의하고, '단일' 정의와 패널 예시를 그 입도 규칙에 맞게 일관되게 수정해야 한다.
- issue-016 (medium): Order의 STAT 여부가 priority, is_stat, StatOrder로 중복 표현되지만 정규 권위와 동치 제약이 없어 서로 모순되는 상태가 허용된다. 이 권위 계약은 다음 통합 단계 전에 확정해야 한다.
  - root cause: 하나의 주문 우선순위 의미를 속성, boolean과 존재론적 하위 타입으로 중복 표현하면서 권위와 동치 제약을 지정하지 않았다.
  - materiality: 세 표현 중 일부만 갱신되거나 서로 다른 값으로 수신되면 EMR과 LIS가 각기 다른 표현을 우선해 동일한 Order의 긴급 처리 여부를 다르게 판단할 수 있다. 따라서 주문 긴급도를 일관되게 해석하게 한다는 목적이 훼손된다.
  - action: 다음 단계 전에 priority를 정규 권위로 확정하고 is_stat와 StatOrder는 그 값에서 파생되도록 하거나 제거해야 한다. 두 표현을 유지한다면 StatOrder iff priority=stat iff is_stat=true의 완전한 동치 제약, 불일치 입력의 처리 방식, 분류 변경 규칙을 명시해야 한다. 특히 StatOrder 하위 타입을 유지할지는 발행 후 priority 변경 가능성을 확인한 뒤 결정해야 한다.
- issue-017 (medium): 분석 실행 개념이 빠진 상태에서 Specimen이 Result를 produces하도록 모델링되어, 원천 검체의 계보와 실제 분석 실행의 결과 생성 행위가 혼동된다.
  - root cause: 원천 물질과 분석 실행 행위를 구분하는 개념이 없어 Result 생성 관계를 물리적 Specimen에 직접 부여했다.
  - materiality: 이 모델로는 결과의 생성 실행, 사용된 Assay 정의, 원천 Specimen을 분리해 추적할 수 없다. 따라서 동일 검체의 반복 측정이나 재분석 결과를 생성 사건별로 구별하기 어려워 주문부터 결과까지 신뢰할 수 있는 추적성을 제공하려는 목적이 약화된다.
  - action: 다음 단계 전에 분석 실행 개념을 도입하고, Result 생성 관계를 그 실행에 귀속해야 한다. 분석 실행은 사용한 Assay 정의와 입력 Specimen을 각각 참조하게 하고, Specimen에는 derived_from의 역관계 등 원천 재료 관계만 유지해야 한다. 이 순서로 수정해야 원천 계보, 분석 정의, 개별 실행을 분리하고 반복·재분석 결과를 신뢰성 있게 식별할 수 있다.
- issue-018 (medium): 상태는 열거되어 있지만 상태 사이의 from/to 전이 간선과 trigger·guard가 정의되지 않아, lifecycle이 실행 가능한 전이 경로로 완결되지 않았다.
  - root cause: 상태 모델을 전이 그래프가 아니라 상태 열거와 일부 자연어 조건으로만 표현했다.
  - materiality: EMR과 LIS가 상태 이벤트의 유효성·순서·후속 처리를 동일한 권위 모델로 판단해야 하지만, 현재 문서는 상태 이름만 공유하고 허용 경로는 공유하지 않는다. 따라서 서로 다른 전이 순서나 잘못된 완료·정정 처리를 구현해도 구조적 부적합을 판정할 수 없어, 공유 개념 권위라는 목적이 약화된다.
  - action: 다음 단계 전에 각 상태 보유 엔티티에 명시적인 transition 구조를 추가해 from, to, trigger와 guard를 정의해야 한다. 기존 state_rules는 대응하는 전이의 guard로 귀속하고, 모든 선언 상태가 최소 하나의 유효 경로에 연결되는지 검증해야 한다. 이 일반 전이 계약을 먼저 확립해야 공유 원인 후보로 연결된 issue-012 같은 구체적 완료·정정 모순도 일관된 권위에 따라 폐쇄할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 사이에서 결과 생산부터 임상의 보고까지 신뢰 가능한 상태 권위와 호환 계약을 제공하는 목적. Source finding context: EMR/LIS 통합에서 결과·보고 상태의 신뢰 가능한 개념 권위를 제공하는 목적. Source finding context: Serve as the authoritative state contract between LIS result production and EMR report consumption.
- issue-002: Order부터 Report까지 EMR 주문 카탈로그와 LIS 수행 카탈로그를 일관되게 연결하는 통합 개념 권위. Source finding context: EMR 주문 개념과 LIS 수행 개념을 일관되게 연결하는 통합 개념 권위. Source finding context: Use as the conceptual authority for EMR/LIS integration. Source finding context: Order부터 Report까지의 임상검사 파이프라인을 EMR/LIS 통합의 개념 권위 문서로 제공하는 목적
- issue-003: 위험 결과의 판정과 즉시 통보를 EMR/LIS가 공통으로 해석하고 신뢰할 수 있게 하는 개념 권위. Source finding context: 위험 결과의 즉시 통보 상태를 EMR/LIS가 공통으로 해석하고 운영상 신뢰할 수 있게 하는 개념 권위. Source finding context: 위험 결과의 판정과 즉시 통보를 EMR/LIS 통합에서 명확히 표현하는 목적
- issue-004: Order-to-Report EMR/LIS 워크플로의 개념 권위 역할. Source finding context: Serving as the conceptual authority for Order-to-Report EMR/LIS workflow integration.
- issue-005: 주문부터 보고까지 검사 파이프라인의 권위 있는 엔티티와 관계를 제공하는 목적. Source finding context: Providing authoritative entities and relationships for the laboratory pipeline from order through report.
- issue-006: 운영상·임상적으로 중요한 워크플로 행위를 권위 있게 EMR/LIS에 통합하는 목적. Source finding context: Authoritative EMR/LIS integration of operationally and clinically significant workflow actions.
- issue-008: EMR, LIS와 하위 소비자 사이의 우선순위를 해결하는 개념 권위 역할. Source finding context: Acting as the conceptual authority that resolves precedence across EMR, LIS, and downstream consumers.
- issue-012: EMR/LIS 통합에서 Order와 Result 생명주기를 일관되게 처리하는 개념 권위. Source finding context: Serving as the conceptual authority for consistent Order and Result lifecycle handling across EMR/LIS integration.
- issue-013: EMR/LIS 소비자와 임상의를 위한 권위 있는 Report 상태 계약. Source finding context: Providing an authoritative Report status contract for EMR/LIS consumers and clinicians.
- issue-014: EMR/LIS 연동에서 결과와 보고 상태의 일관된 의미를 제공하는 개념 권위. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 결과와 보고 상태의 일관된 의미를 제공하는 목적
- issue-007: EMR/LIS 기록과 카탈로그 유지보수 전반에서 지속 가능한 개념 권위 역할. Source finding context: Using the ontology as a durable conceptual authority across EMR/LIS records and catalog maintenance.
- issue-009: EMR 주문의 검체 요구와 LIS 분석의 적합 검체를 지속 가능하고 의미 보존적으로 교환하는 목적. Source finding context: Provide a durable shared vocabulary for EMR/LIS workflow integration. Source finding context: EMR 주문 요구조건과 LIS 분석 적합 검체를 일관되게 교환하는 목적
- issue-010: EMR/LIS 사이의 교차 시스템 개념 권위 역할. Source finding context: Act as a cross-system conceptual authority for EMR/LIS integration.
- issue-011: 운영 검사 워크플로와 EMR/LIS 교환을 위한 권위 있는 임상 규칙 제공. Source finding context: Provide authoritative concepts for operational laboratory workflow and its EMR/LIS exchange.
- issue-015: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 권위 제공.
- issue-016: EMR/LIS가 주문 긴급도를 동일하게 해석하도록 하는 개념 권위. Source finding context: EMR/LIS가 주문 긴급도를 동일하게 해석하도록 하는 개념 권위 제공
- issue-017: 주문부터 검체·분석·결과까지 의미 있는 추적성을 제공하는 개념 권위. Source finding context: 주문부터 검체·분석·결과까지의 의미 있는 추적성을 제공하는 개념 권위 문서 역할
- issue-018: EMR/LIS가 공유할 엔티티·관계·상태 모델의 개념 권위 제공.

## Final Review Result
18 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result와 Report가 동일한 임상 상태를 독립된 비버전 어휘로 보유하고 완전한 투영 규칙 없이 비동기 동기화되므로, 임상의에게 노출되는 상태가 실제 결과와 어긋나거나 혼합 버전 환경에서 번역되지 않을 수 있다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 EMR/LIS 카탈로그의 운영 소유권과 외부 매핑 시스템 존재 여부는 허용된 증거 경계에서 확인되지 않는다.
- 외부 전화 기록 대장의 실제 스키마·품질·접근성과 권위 시스템은 허용된 증거 경계에서 확인할 수 없다.
- 정확한 보관 기간과 기관별 거부 분류는 현 증거 범위 밖의 로컬 정책이지만, 공통 통합 상태와 증거 개념의 부재는 확인되었다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now
- issue-012 (high): fix_now
- issue-013 (high): fix_now, accept_risk
- issue-014 (high): fix_now, accept_risk
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, accept_risk
- issue-016 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, follow_up
- issue-018 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
