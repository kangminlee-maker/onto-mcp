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
- issue-001 (high): 정정 lifecycle과 상태 매핑·실패·지연 규칙이 없는 Result–Report 이중 권위로 인해, 정정된 Result와 stale finalized Report가 동시에 노출되는 현재 차단 결함이다.
  - root cause: 동일한 결과 상태를 Result와 Report에 각각 권위 값으로 저장하면서 정정 동기화를 야간 배치에 맡긴 설계.
  - materiality: 임상의와 EMR 소비자가 Report.result_status를 현재의 권위 값으로 신뢰하는데, 정정 후 야간 동기화 전까지 오래된 finalized 상태가 유지될 수 있다. 이는 정정 사실의 가시성과 의미 일관성을 훼손하여 EMR/LIS 통합의 신뢰 가능한 개념 권위라는 목적을 직접 약화한다.
  - action: 먼저 Result를 결과 상태의 단일 권위로 정하고 Report 상태의 파생·매핑 규칙과 정정 lifecycle을 정의해야 한다. 이어 정정을 원자적 또는 이벤트 기반으로 즉시 전파하고, 완료 전이나 실패·지연 시에는 Report를 pending_correction 같은 명시적 비최종 상태로 노출하며 재시도·경고·최대 지연 규칙을 마련해야 한다. 이 조치는 통합 권위 문서로 사용하기 전에 완료되어야 한다.
- issue-002 (high): Test와 Assay를 병행 카탈로그로 유지하려면 주문 단위와 수행 단위의 역할을 분리하고, 양자를 잇는 권위 있는 매핑·카디널리티·버전 수명주기 계약을 반드시 정의해야 한다.
  - root cause: Test와 Assay를 병행 카탈로그로 유지하면서 권위·매핑 계약을 정의하지 않은 결정이 현재 상호운용 모호성과 시간에 따른 추적성 손실을 함께 만든다.
  - materiality: 현재 구조에서는 신규·변경 검사 항목의 코드, 명칭 또는 검체 의미가 두 카탈로그에서 달라질 때 어느 정의가 기준인지 판정할 수 없다. 그 결과 주문–수행–결과 연결이 구현별 임의 매핑에 의존하고, EMR과 LIS를 일관되게 연결하는 단일 개념 권위라는 문서 목적이 약화된다.
  - action: 먼저 Test를 주문 카탈로그, Assay를 수행 카탈로그로 명확히 구분하고 각 카탈로그의 권위와 생성·변경 책임을 지정해야 한다. 다음으로 필수 TestAssayMapping을 두어 카디널리티를 정의하고, Test·Assay·매핑에 권위 시스템, 버전, valid_from/valid_to 및 활성 상태를 기록해야 한다. 검체 종류는 하나의 정규 어휘를 공유하게 하고, 이중 등록 자체가 아니라 매핑의 완전성과 유효성을 검증해야 주문–수행–결과 경로를 일관되게 닫을 수 있다.
- issue-003 (high): 중대값 통보를 단순 notified 불리언으로 표현한 현재 모델은 통보 완료의 권위와 감사 증거를 보존하지 못하는 high·material 결함이며, 대상 범위에서 즉시 수정해야 한다.
  - root cause: 통제 행위를 행위자·시각·근거를 가진 감사 사건으로 모델링하지 않고 현재 속성이나 boolean으로 축약한 결정이 통보와 기타 통제 이력의 재구성을 막는다.
  - materiality: 통보 시각, 수신자, 방법, 수신 확인 및 근거가 권위 사건으로 남지 않으므로 LIS 값과 외부 전화 기록이 불일치할 때 통보의 적시성과 완료 여부를 판정할 수 없다. 이는 주문부터 보고까지 중요한 검사 사건을 EMR/LIS가 일관되게 해석하려는 목적을 약화시키고 환자안전 조사와 감사의 검증 가능성을 훼손한다.
  - action: CriticalValueNotification 또는 CriticalNotificationEvent를 독립된 권위 사건으로 추가하고 CriticalValue/Result, 행위자, occurred_at, recipient, method, acknowledgement 및 사유·근거를 연결해야 한다. 외부 전화 기록을 유지한다면 기록 식별자와 권위 시스템도 연결하고, notified는 유효한 권위 사건에서 파생되도록 해야 한다. 검증·보고 공개·정정 사건으로 범위를 넓히기 전에는 각 유형의 감사 이력 재구성 실패를 보여 주는 직접 필드 근거를 먼저 확보해야 한다.
  - unresolved disagreement: coverage 렌즈는 verified_by, released_at, notified 필드를 근거로 검증·공개·정정·통보 전체의 사건 모델 부재를 유지하지만, axiology와 semantics가 직접 확증한 범위는 중대값 통보다. 특히 정정을 같은 high-severity 문제에 포함할 독립 근거가 아직 필요하다.
- issue-005 (high): 분석 수행 사건이 모델에서 누락되어 Assay·Specimen·Test와 Result 사이의 실제 수행 및 품질 근거를 권위 있게 연결할 수 없다. 따라서 AnalysisExecution을 독립 사건으로 도입해야 한다.
  - root cause: 분석 수행을 독립된 도메인 사건으로 모델링하지 않고 카탈로그와 최종 결과만 정의해 장비·방법·QC 및 재검 provenance를 표현할 권위 구조가 누락됐다.
  - materiality: 주문부터 보고까지의 임상검사 파이프라인 전체를 포괄하려는 문서에서 실제 분석 단계가 비어 있다. 이 상태에서는 결과 생성 경로, 재검 여부, 장비·시약 및 QC 승인 근거를 시스템 간에 교환하거나 추적할 수 없어 비공식 필드와 시스템별 해석이 공통 권위를 대체한다.
  - action: Specimen, Test, Assay와 Result를 연결하는 AnalysisExecution 사건을 먼저 도입하고, 그 사건에 수행 시각, 분석기, 시약 로트, 수행자, 재검 여부 및 QC 승인 근거를 속성이나 관계로 모델링해야 한다. 중심 사건을 먼저 확립해야 향후 장비·방법·QC 요구를 Result에 누적하거나 외부 기록에 의존하지 않고 provenance를 안정적으로 확장할 수 있다.
- issue-006 (high): Specimen lifecycle이 정상 분석 경로에서 끝나 거부·재채취·보관·폐기와 관련 사건을 표현하지 못하므로, 주문부터 종결까지의 검체 상태를 포괄하도록 즉시 확장해야 한다.
  - root cause: Specimen lifecycle 범위를 정상적인 분석 완료 경로로 한정하고 전처리 예외와 보관·폐기 구간을 모델 밖 규정에 위임했다.
  - materiality: 검체 부적합, 재채취, 보관 또는 폐기 상황에서 공통 상태와 이력을 교환할 수 없으면 EMR과 LIS가 주문 완료 여부와 검체 추적 상태를 서로 다른 외부 규칙으로 판정하게 된다. 이는 검체를 포함한 주문-보고 전 과정에 통합 상태 권위를 제공한다는 목적을 직접 약화한다.
  - action: Specimen lifecycle을 주문·채취 예정부터 운송, 접수, 적합성 판정, 분주, 분석, 보관 및 폐기까지 확장해야 한다. 먼저 공통 상태와 전이 의미를 정의하고, 거부·재채취·폐기는 사유·행위자·시각을 가진 사건으로 모델링하여 예외 이후의 주문 진행 조건과 검체 이력을 재구성할 수 있게 해야 한다.
- issue-007 (high): Result와 Report가 정정·철회·재발행될 때 현재 상태만 덮어쓰므로, 임상의에게 공개됐던 과거 내용과 변경 순서를 재구성할 수 없는 중대한 시간적 완전성 결함이다.
  - root cause: Result와 Report를 불변 버전이 누적되는 기록이 아니라 덮어쓰는 현재 상태로 모델링해 이전 값, 대체 관계와 유효기간이 소실된다.
  - materiality: 최종 결과가 한 번 이상 변경되거나 특정 시점의 공개 내용을 확인해야 할 때, 현재 모델은 당시 값과 보고 상태를 증명하지 못한다. 이는 임상의가 신뢰한 권위 기록의 사후 검증과 감사 가능성을 직접 훼손하므로 현재 대상에서 반드시 해소해야 한다.
  - action: 먼저 ResultVersion 또는 Amendment 사건을 불변 이력의 권위로 도입하고, 각 버전에 값·상태·유효기간·발행 시각·정정 사유와 이전·대체 버전 관계를 보존해야 한다. 이어서 Report도 결과 버전과 연결된 공개 버전을 누적하여 특정 시점에 임상의에게 공개된 내용을 재구성할 수 있게 해야 한다. 심의에서는 이 근본 원인과 조치를 수용했으며 추가로 남은 이견은 없다.
- issue-009 (high): Test와 Assay를 독립적으로 병행 등록하면서 두 카탈로그 사이의 권위 있고 버전된 매핑을 두지 않은 탓에, 항목의 추가·이름 변경·분할·병합·폐기 시 동일성 연속성을 보장할 수 없다. 이 문제는 현재 핵심 경로를 막는 고위험 결함이며 목표 범위에서 함께 해결해야 한다.
  - root cause: The model leaves the Test–Assay conceptual boundary unresolved and supplies no authoritative, versioned mapping between the two catalogs.
  - materiality: 온톨로지가 EMR/LIS 통합과 지속적인 카탈로그 진화의 개념적 권위가 되려면, 통합자가 Test와 Assay가 같은 검사 개념의 어떤 버전을 나타내는지 안정적으로 판정할 수 있어야 한다. 현재 구조에서는 변경 이후의 항목과 과거 Result.test_ref를 신뢰성 있게 연결하기 어려워 상호운용성과 이력 추적성이 약화된다.
  - action: Test와 Assay는 서로 다른 개념으로 유지하되, 안정 식별자·카디널리티·유효기간·상태를 갖는 버전형 realization 관계를 정의해야 한다. 먼저 각 공유 속성의 소유 카탈로그와 매핑 권위를 확정하고, 이어 매핑의 생성·변경·분할·병합·폐기 수명주기를 모델링한 뒤, 이중 등록을 하나의 권위 있는 생성 워크플로로 대체해야 한다. 모든 참여 렌즈가 이 근본 원인과 높은 심각도를 지지했으며 별도 숙의에서 좁혀지거나 남은 이견은 없다.
- issue-011 (high): 식별자와 코드가 발급자·체계·버전·유효기간 없이 문자열로만 표현되어, 다기관·다시스템 환경의 동일 값 충돌과 시간에 따른 의미 변경을 구별할 수 없다. 이는 현재 차단 요인이므로 목표 범위에서 즉시 해소해야 한다.
  - root cause: 외부에서 지배되는 식별자와 코드 값을 issuer, code system, version 및 유효기간이 없는 문맥 비의존 문자열로 표현해 시스템 간 충돌과 의미 변경을 구분할 수 없다.
  - materiality: 이 모델은 EMR/LIS와 향후 참여 시스템 전반에서 지속 가능한 식별·용어 권위를 제공해야 한다. 그러나 서로 다른 시스템이 같은 로컬 식별자를 쓰거나 코드·단위 정의가 바뀌면 현재 및 과거 기록의 정체성과 의미를 명확히 해석할 수 없어 시스템 간 연속성과 통합 신뢰가 직접 훼손된다.
  - action: system/issuer, code, display, version, 유효기간, supersession/equivalence 매핑을 포함하는 재사용 가능한 Identifier와 CodedConcept 구조를 먼저 정의하고, 관련 식별자·코드·단위 속성에 일관되게 적용해야 한다. 역사적 참조에는 변경되지 않는 내부 식별자를 유지하고 외부 값의 버전 및 유효 시점과 연결해야 시스템 간 충돌 해소와 과거 의미 재현을 함께 보장할 수 있다.
- issue-014 (high): Result 상태와 Report 생명주기를 구분하지 않은 채 하나의 공개 상태를 서로 다른 폐쇄 어휘로 중복 권위화하고 canonical mapping도 두지 않아, 현재의 상태 불일치와 향후 확장 파손이 함께 발생하는 중대한 문제다.
  - root cause: 하나의 공개 상태 개념을 서로 다른 폐쇄 어휘로 중복 모델링하고 canonical mapping을 두지 않은 것이 현재 불일치와 향후 상태 확장 파손을 함께 유발한다.
  - materiality: Result가 corrected로 바뀐 뒤 야간 동기화가 완료되기 전이거나 LIS와 EMR이 각자의 열거형을 직접 해석하면, 동일 결과의 최종성·정정 여부가 시스템마다 다르게 표시될 수 있다. 따라서 임상의가 신뢰해야 할 권위 상태가 오래되거나 모호해져 EMR/LIS 연동의 일관성과 임상 판단 신뢰를 훼손한다.
  - action: 먼저 Result의 임상 결과 상태와 Report의 생명주기를 별도 개념으로 명시하고 의미가 다른 상태를 분리해야 한다. 그 위에 단일하고 확장 가능한 canonical publication-state 권위를 정의한 뒤, 시스템별 표시는 버전된 명시적 mapping 또는 결정적 projection으로 파생해야 한다. 미매핑 상태 처리, 전이 규칙, 정정 provenance를 함께 규정하고, 야간 지연으로 권위 상태가 오래되지 않도록 Report 상태를 결정적으로 파생하거나 사건 기반으로 동기화해야 한다. 참여 렌즈들은 이 공통 근원과 조치 방향을 수용했으며 추가 숙의가 필요하지 않다고 결론냈다.
- issue-015 (high): STAT이 Order.priority, Order.is_stat, StatOrder 하위 타입이라는 세 독립 표현에 중복되어 하나의 주문에 상충하는 긴급도 판정이 허용된다. STAT의 단일 권위를 확립하고 나머지 표현은 파생하거나 제거해야 한다.
  - root cause: 변경 가능한 주문 우선순위 분류와 존재론적 하위 타입을 구분하지 않고 STAT 의미를 enum, boolean 및 StatOrder 타입에 중복 배치해 단일 권위가 없다.
  - materiality: 세 표현 중 일부만 설정되거나 서로 다르게 변경되면 EMR과 LIS가 같은 주문의 긴급도를 다르게 해석할 수 있다. 그 결과 긴급 검사의 라우팅과 우선 처리가 시스템별로 달라지고 StatOrder 하위 타입 추론도 신뢰할 수 없으므로, 검사 주문 긴급도를 일관되게 해석하게 한다는 목적과 환자안전·운영 신뢰를 직접 약화한다.
  - action: Order.priority를 STAT 판정의 단일 권위로 먼저 지정하고 Order.is_stat은 그 값에서 결정적으로 파생하거나 제거해야 한다. StatOrder도 단순한 우선순위 분류라면 제거하거나 파생 표현으로 제한해야 한다. 실제로 별도 생명주기나 의무를 가진 개념이라서 유지해야 한다면 그 차이를 명시하고 priority 및 is_stat과의 일관성 제약을 추가해야 한다. 이는 현재 차단 이슈로서 대상 범위에서 반드시 해소해야 한다.
- issue-018 (high): CriticalValue에 재사용 가능한 임계값 규칙과 결과별 통보 상태를 함께 두면 동일 규칙에 해당하는 여러 Result의 통보 여부를 각각 표현할 수 없다. 임계값 규칙과 개별 임계 결과·통보 사건을 분리해야 한다.
  - root cause: 재사용 가능한 임계값 규칙과 개별 임계 결과의 발생·통보 사건을 하나의 CriticalValue 엔티티에 혼합해 규범적 기준에 결과별 boolean 상태를 귀속했다.
  - materiality: 동일 임계범위에 여러 결과가 해당할 때 규칙의 단일 notified 값이 모든 결과에 공유된 것으로 해석될 수 있다. 이로 인해 한 결과의 통보가 다른 결과에도 적용된 것처럼 보여 미통보 임계 결과를 놓치거나 결과별 감사 추적이 불가능해지므로, EMR/LIS 간 임계 결과의 의미와 운영 상태를 안전하게 공유하려는 목적을 직접 약화한다.
  - action: CriticalValueThreshold를 Test별로 재사용 가능한 판정 기준으로 분리하고, 각 Result를 참조하는 CriticalResultEvent를 생성한 뒤 그 사건에 대한 Notification을 별도 권위 기록으로 모델링해야 한다. 먼저 규칙과 결과 발생을 분리하고 그 다음 통보를 결과 사건에 연결해야 결과별 통보 상태, 다중 통보 방식, 감사 추적을 보존할 수 있다.
- issue-020 (high): Test와 Assay 사이에 canonical realization 관계와 이를 지배하는 권위 있고 버전된 매핑 lifecycle이 없어 주문–수행 경로가 구조적으로 끊겨 있습니다.
  - root cause: Test and Assay are maintained as parallel catalog concepts without a canonical realization relationship.
  - materiality: 주문된 Test를 분석기가 실행한 Assay로 권위 있게 추적할 수 없으므로 EMR/LIS 통합이 외부 임의 매핑에 의존하게 됩니다. 이는 주문부터 결과 보고까지 온톨로지를 개념적 권위로 사용하려는 목적을 훼손하고 상호운용성과 감사 가능성을 약화합니다.
  - action: cardinality와 검체 호환성 제약을 명시한 canonical Test–Assay realization 관계를 정의하고, 한쪽을 권위 원천으로 지정해야 합니다. 이 관계는 버전, 유효기간, 변경 이력을 포함하는 단일 매핑 contract로 관리되어야 하며, 병행 등록에 의존하는 방식은 대체해야 합니다.
- issue-004 (medium): TAT의 문제는 외부 대시보드가 계산을 수행한다는 사실 자체가 아니라, 시작·종료 사건, 다중 검체·미발행·정정 처리 및 적용 버전이 권위 모델에 완결되지 않아 실행자가 계산 의미를 독자적으로 결정할 수 있다는 점이다.
  - root cause: TAT의 의미는 온톨로지에 선언하면서 경계 사례를 포함한 계산 규칙의 실행 권위를 별도 대시보드 팀에 위임해 하나의 파생 개념에 복수 권위가 생긴다.
  - materiality: 이 계약 부재는 동일한 EMR/LIS 사건에서 소비자별 TAT가 달라질 가능성을 만든다. 그 결과 운영 비교와 과거 값 재현성이 약화되고, 공유 워크플로 파생 지표에 단일 의미 권위를 제공한다는 선언 목적이 훼손되므로 다음 통합 단계 전에 해소해야 할 material issue이다.
  - action: 다음 통합 단계 전에 TAT의 권위 계산 계약을 완결해야 한다. collected_at과 권위 있는 released_at의 선택 기준, 다중 검체·미발행·예비 및 정정 보고의 처리 규칙, 적용 버전과 재현 방식을 권위 모델에 명시하고, 대시보드는 해당 버전의 규칙을 그대로 실행하는 소비자로 제한해야 한다.
- issue-008 (medium): CriticalValue가 문맥과 버전을 가진 판정 규칙이 아니라 변경 가능한 숫자 범위로 표현되어, 현재 적용할 규칙을 권위 있게 선택하거나 과거 판정·통보의 근거를 재구성할 수 없다.
  - root cause: CriticalValue를 적용 문맥과 유효 버전을 가진 판정 규칙이 아니라 변경 가능한 현재 숫자 범위로 모델링해 규칙 선택과 역사적 provenance가 소실된다.
  - materiality: 동일 검사라도 단위·방법·검체·환자군 또는 정책 유효시점에 따라 임계값이 달라질 수 있다. 이를 구분하지 못하면 EMR과 LIS가 서로 다른 규칙을 적용할 수 있고 과거 경보의 근거도 감사할 수 없어, 공유 중대값 판정·통보 규칙의 일관되고 지속적인 개념 권위가 약화된다.
  - action: 다음 통합 단계 전에 CriticalValue를 안정 식별자, 버전, 단위, Test/Assay 및 검체·환자군·기관/부서 문맥, valid_from/valid_to, 상태·승인 근거와 supersession을 가진 규칙 개념으로 승격해야 한다. 이어 판정 및 통보 사건이 실제 적용한 규칙 버전을 참조하도록 연결해야 규칙 선택과 역사적 provenance가 모두 권위 있게 보존된다.
- issue-010 (medium): 검체 분류가 Specimen과 Test의 폐쇄 enum 및 Assay의 자유 문자열에 분산되어 있어, 새 검체 범주를 한 번 정의해 일관되게 재사용할 수 없다. 따라서 카탈로그 확장 전에 세 엔터티가 함께 참조하는 버전형 검체 taxonomy를 단일 권위로 도입해야 한다.
  - root cause: 검체 분류를 재사용 가능한 권위 taxonomy로 모델링하지 않고 여러 폐쇄 enum과 자유 문자열에 복제해 새로운 분류 추가가 다중 구조 변경과 임의 번역을 요구한다.
  - materiality: 새 검체 유형·하위 유형·채취 형태·분석기별 지정이 추가될 때 여러 schema와 소비자를 동시에 수정하고 EMR/LIS 매핑을 수동으로 조정해야 한다. 이 과정에서 enum과 자유 문자열의 표현이 어긋나 호환성이 깨질 수 있으므로, 새 검체 범주를 기존 통합을 훼손하지 않고 확장하려는 목적을 실질적으로 약화한다.
  - action: 다음 단계의 카탈로그 확장 전에 Specimen, Test, Assay가 모두 참조하는 버전형 SpecimenType 또는 통제 코드 개념을 단일 권위로 도입해야 한다. 광범위한 유형과 분석기별 세부 형태를 연결하는 계층·매핑을 제공하고, 폐기 코드에는 명시적 alias와 유효기간을 유지한 뒤 기존 세 필드의 값을 이 권위 개념으로 이행해야 한다. 심의에서는 이 해결 방향과 근본 원인에 실질적 이견이 없었다.
- issue-012 (medium): Order completion 규칙은 한 Order에 속하는 Result 집합과 completed 이후 corrected 발생 시의 상태 전이를 함께 확정하지 않아, 동일한 임상 사건에서도 EMR과 LIS가 서로 다른 완료 상태를 산출할 수 있습니다.
  - root cause: Order 완료 규칙이 어느 Result 집합을 양화하는지와 completed 이후 corrected가 발생할 때의 시간적 지속 조건을 함께 형식화하지 않아 실행 가능한 완료 계약으로 닫히지 않았다.
  - materiality: 공유 Order lifecycle 계약은 두 시스템이 동일한 Result와 시간 규칙으로 완료 여부 및 후속 처리를 판단해야 합니다. 현재처럼 다중 검체·보고서에서 Result 귀속이 모호하고 정정 후 완료 유지 여부도 열려 있으면 시스템별 상태와 처리 조건이 분기되어 계약의 정확성과 실행 가능성이 약화됩니다.
  - action: 다음 단계 전에 canonical Order–Result membership을 정의하고 Specimen 및 Report 경로가 동일 Order로 수렴하도록 일관성 제약을 추가해야 합니다. 그 경계가 정해진 Result 집합을 대상으로 완료 조건을 다시 작성한 뒤, corrected 발생 시 completed를 유지하는 불변 종결 모델과 명시적으로 reopened/revision으로 전이하는 모델 중 하나를 선택해 상태 규칙과 후속 처리 조건을 명시해야 합니다.
- issue-013 (medium): Result.status와 Report.result_status가 ‘동일 정보’를 유지한다는 계약은 서로 다른 폐쇄 enum 사이의 canonical 대응과 동기화 규칙이 없어 현재 형태로 검증할 수 없습니다.
  - root cause: 중복 상태 필드 사이의 canonical enum 또는 명시적 대응·일관성 규칙이 없습니다.
  - materiality: 시스템마다 직접 equality나 자체 매핑·동기화 시점을 적용할 수 있어 동일 결과의 preliminary, final, corrected 의미와 정정 상태가 달리 해석될 수 있습니다. 따라서 임상의가 신뢰하는 보고 상태를 EMR과 LIS에서 일관되게 해석한다는 목적과 상호운용성을 약화합니다.
  - action: 다음 단계 전에 하나의 canonical status enum을 두 필드에서 재사용하는 것이 우선입니다. 분리된 enum을 유지해야 한다면 세 값의 전단사 매핑, 즉시 또는 명시적 지연 일관성 방식, 야간 배치 전 임시 상태의 허용 조합과 권위 필드를 함께 선언해야 합니다. 그래야 상태 의미와 정정 처리의 일관성을 기계적으로 검증할 수 있습니다.
- issue-016 (medium): 주문 단위 Test와 실행 단위 Assay는 동의어가 아니라 역할과 카디널리티가 다른 별도 카탈로그 개념이다. 현재는 두 개념을 구별하면서도 realization 관계를 정의하지 않아 정체성과 결과 귀속이 모호하므로, 다음 단계 전에 공통 매핑 계약을 확정해야 한다.
  - root cause: 주문 단위와 분석 수행 단위를 구별하면서도 그 관계를 정의하지 않고 잠정적 동의어처럼 운영함
  - materiality: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 매핑 권위를 제공하려면 주문·수행·결과가 어떤 정체성에 귀속되는지 일관되게 결정할 수 있어야 한다. 하나의 주문이 여러 분석으로 수행되거나 Test와 Assay 코드가 독립적으로 변경될 때 현재 모델은 그 연결을 판정하지 못하므로, 시스템별 임의 매핑과 잘못된 결과 귀속을 초래할 수 있어 선언된 목적을 실질적으로 약화한다.
  - action: 먼저 Test와 Assay를 각각 OrderableTest와 ExecutableAssay처럼 역할이 드러나는 별도 개념으로 유지하고, 무조건적인 이중 등록 지침을 제거해야 한다. 이어 패널·프로파일을 포함할 수 있는 주문 단위와 개별 수행 단위 사이에 카디널리티가 명시된 realization 매핑을 정의해야 한다. 카탈로그가 성장하거나 코드가 독립 변경될 때도 매핑 권위를 유지하려면 이 관계에 버전과 유효기간을 포함하는 계약을 마련하고, 다음 단계 진행 전에 공통 Test–Assay 계약과 함께 폐쇄해야 한다.
- issue-017 (medium): 검체의 상위 재료 분류와 구체적인 처리·분획 형태가 하나의 specimen type/kind로 혼용되어, EMR의 주문 요구 검체와 LIS Assay의 수행 가능 검체 사이 호환성을 일관되게 판정할 수 없다.
  - root cause: 검체의 원재료 분류 수준과 처리·분획 형태를 하나의 specimen type/kind 의미로 평탄화해 상위 요구조건과 구체적 분석 적합성을 구분하지 못한다.
  - materiality: blood 같은 상위 요구가 serum 전용 또는 whole-blood 전용 Assay에 적합한지를 모델 자체로 결정할 수 없고 자유 문자열 표기까지 달라질 수 있다. 이에 따라 시스템별 적합성 판단이 달라져 잘못된 수행 매핑, 재채혈 또는 결과 귀속 오류가 발생할 수 있으므로, EMR과 LIS 간 검체 의미 호환이라는 선언된 목적을 실질적으로 약화한다.
  - action: 다음 통합 단계 전에 검체 원재료, 채취원·표본 유형, 처리·분획 형태를 별도 축으로 분리해야 한다. 이어 Test와 Assay가 동일한 권위 검체 개념을 참조하도록 하고, 상위 요구와 구체 적합성 사이에는 명시적인 상·하위 호환 매핑을 둬야 한다. 이 작업은 issue-010과 공유된 taxonomy 부재 원인과 조율하되, 본 이슈의 독립적인 의미 축 혼합 결함을 별도로 닫아야 한다.
- issue-019 (medium): Specimen은 Result의 물질적 원천이지 생성 행위의 주체가 아니므로, Specimen→Result의 produces 관계는 provenance를 왜곡합니다. 이 관계를 비행위적 관계로 교정하고 실제 수행 사건에 결과 생성 책임을 귀속해야 합니다.
  - root cause: 결과의 물질적 근거인 Specimen과 결과를 생성하는 분석 행위를 구분하지 않아 검체에 produces라는 수행 인과 역할을 잘못 부여했다.
  - materiality: EMR/LIS가 관계를 바탕으로 결과 생성 주체와 수행·감사 이력을 해석할 때 검체와 분석 행위가 혼동됩니다. 그 결과 수행 방법, 장비, 재분석 이력을 정확히 표현할 수 없어 검체에서 결과까지의 일관된 provenance와 감사 가능성이 약화됩니다.
  - action: 다음 단계 전에 Specimen→Result를 is_source_of 또는 has_result 같은 비행위적 provenance 관계로 바꾸고, Result 생성 및 수행·재분석 이력은 AnalysisExecution 또는 동등한 권위의 수행된 Assay에 귀속해야 합니다. 먼저 수행 사건의 정체성, 시각, 방법, 장비, QC 및 재분석 이력을 어느 개념이 소유할지 결정한 뒤 관계와 제약을 교정해야 합니다.
  - unresolved disagreement: 관계 교정과 권위 있는 수행 사건의 필요성에는 합의했지만, 별도 AnalysisExecution이 필수인지 수행된 Assay가 동일한 권위와 이력 소유 책임을 충족할 수 있는지는 미해결입니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-003: coverage 렌즈는 verified_by, released_at, notified 필드를 근거로 검증·공개·정정·통보 전체의 사건 모델 부재를 유지하지만, axiology와 semantics가 직접 확증한 범위는 중대값 통보다. 특히 정정을 같은 high-severity 문제에 포함할 독립 근거가 아직 필요하다.
- issue-019: 관계 교정과 권위 있는 수행 사건의 필요성에는 합의했지만, 별도 AnalysisExecution이 필수인지 수행된 Assay가 동일한 권위와 이력 소유 책임을 충족할 수 있는지는 미해결입니다.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-003: narrowed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-020: resolved
- issue-004: resolved
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-019: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 임상의가 신뢰할 수 있는 결과 상태의 개념 권위를 제공하는 목적.
- issue-002: EMR 주문 개념과 LIS 수행 개념을 일관되게 연결하는 개념 권위 제공. / EMR 주문 개념과 LIS 수행 개념 사이의 단일한 통합 권위
- issue-003: 주문부터 보고까지 운영상 중요한 검사 사건을 통합 시스템이 일관되게 해석할 수 있는 개념 권위 제공. / EMR/LIS 간 결과 승인·공개·정정·중대값 통보의 공통 권위 모델
- issue-005: 주문부터 보고까지 임상검사 파이프라인 전체의 EMR/LIS 개념 권위를 제공하는 목적. Source finding context: 주문부터 보고까지의 임상검사 파이프라인을 정의하는 EMR/LIS 통합 개념 권위 문서
- issue-006: 검체를 포함한 주문-보고 전 과정의 EMR/LIS 통합 상태 모델 제공.
- issue-007: 임상의가 신뢰한 결과와 보고 상태의 권위 및 과거 시점 재구성. Source finding context: 임상의가 신뢰하는 결과와 보고 상태의 권위 및 과거 시점 재구성
- issue-009: Use of the ontology as the conceptual authority for EMR/LIS integration and continued catalog evolution.
- issue-011: EMR/LIS 및 향후 참여 시스템 전반에서 지속 가능한 식별·용어 개념 권위를 제공하는 목적. Source finding context: Use of the ontology as a durable conceptual authority across EMR/LIS systems and future participating domains.
- issue-014: EMR/LIS 연동 설계에서 결과 상태와 임상의가 신뢰할 권위 값을 일관되게 정의하는 것 / Stable status semantics across EMR/LIS integration as the workflow evolves.
- issue-015: EMR/LIS가 검사 주문의 긴급도를 동일하게 해석하는 개념 권위 제공.
- issue-018: 임계 결과의 의미와 운영 상태를 EMR/LIS 간 안전하게 공유하는 개념 권위 제공.
- issue-020: Use of the ontology as the conceptual authority for EMR/LIS integration from ordering through reporting.
- issue-004: EMR/LIS가 공유하는 워크플로 파생 지표의 단일 의미 권위 제공. Source finding context: EMR/LIS가 공유하는 워크플로 개념과 파생 의미의 권위 제공.
- issue-008: EMR/LIS가 공유하는 중대값 판정·통보 규칙의 지속적이고 감사 가능한 개념 권위. Source finding context: EMR/LIS가 공유하는 중대값 판정 및 통보의 개념 권위 Source finding context: Continuous and auditable operation of laboratory alert rules as policies and catalog definitions evolve.
- issue-010: 새 검체 범주를 EMR/LIS 매핑을 깨뜨리지 않고 확장하는 목적. Source finding context: Extension of the workflow to new specimen categories without breaking EMR/LIS mappings.
- issue-012: EMR/LIS가 동일하게 실행할 수 있는 공유 Order lifecycle 계약. Source finding context: EMR/LIS 통합에서 Order 상태를 동일하게 판정하는 개념 권위 계약 Source finding context: A shared and operationally reliable Order lifecycle contract for EMR/LIS integration.
- issue-013: 임상의가 신뢰하는 보고 상태를 EMR/LIS 간 동일하게 해석하는 개념 권위 계약
- issue-016: EMR 주문 카탈로그와 LIS 수행 카탈로그 사이의 개념 매핑 권위 제공
- issue-017: EMR 주문 요구 검체와 LIS 수행 가능 검체를 의미적으로 호환되게 표현하는 목적. Source finding context: EMR 주문 요구 검체와 LIS 수행 가능 검체를 의미적으로 호환되게 표현하는 것
- issue-019: 검체에서 결과까지의 provenance를 EMR/LIS가 동일하게 해석하는 목적. Source finding context: 검체에서 결과까지의 provenance를 EMR/LIS가 동일하게 해석하도록 하는 것

## Final Review Result
20 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 정정 lifecycle과 상태 매핑·실패·지연 규칙이 없는 Result–Report 이중 권위로 인해, 정정된 Result와 stale finalized Report가 동시에 노출되는 현재 차단 결함이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 배치 실패 시 재시도·경고·최대 지연의 구체 정책은 경계 내 증거에 정의되어 있지 않다.
- 현재 경계의 자료만으로 실제 카탈로그 간 불일치 건수는 확인할 수 없다.
- 실제 EMR 또는 LIS 중 어느 시스템을 각 카탈로그의 원본 권위로 지정할지는 현재 경계에서 결정할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-011 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_now
- issue-018 (high): fix_now
- issue-020 (high): fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up
- issue-016 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, follow_up
- issue-019 (medium): fix_before_release, accept_risk

## Recommendations
- issue-021 (medium): Critical-value notification completion is disconnected from the record that substantiates it. Source finding context: clinical-lab-ontology.yaml — entities.CriticalValue notification structure Source finding context: CriticalValue.notified is a boolean whose note says notification time and recipient exist in a telephone log, but no notification record entity or relationship appears in the ontology. Source finding context: A consumer can observe that notification is claimed but cannot navigate to evidence of who was notified or when. Because the file is intended as the integration authority, leaving the supporting record outside its relationship graph makes the operational state unauditable across systems. Source finding context: Model a CriticalValueNotification record, or at minimum an authoritative external-record reference, and link it to CriticalValue, recipient, notification time, and responsible staff; derive notified from the existence/status of that record. Source finding context: .onto/review/20260718-f461553b/round1/structure.findings.yaml#structure-candidate-003 Source finding context: Use of the ontology as an operational integration authority for critical-result handling. Source finding context: When EMR or LIS consumers must verify, reconcile, or audit a CriticalValue marked notified. Source finding context: The notification flag cannot be structurally reconciled with its evidence, allowing inconsistent or unsupported completion states between systems. Source finding context: Notification evidence is delegated to an external telephone log without representing that log or a reference to it in the ontology. Source finding context: CriticalValue.notified has no link to the notification record that supports the boolean. Source finding context: The missing link is a symptom of placing time and recipient data in an external log without modeling its identity or relationship.

## Unique Finding Tagging
- issue-021 (medium): Critical-value notification completion is disconnected from the record that substantiates it. Source finding context: clinical-lab-ontology.yaml — entities.CriticalValue notification structure Source finding context: CriticalValue.notified is a boolean whose note says notification time and recipient exist in a telephone log, but no notification record entity or relationship appears in the ontology. Source finding context: A consumer can observe that notification is claimed but cannot navigate to evidence of who was notified or when. Because the file is intended as the integration authority, leaving the supporting record outside its relationship graph makes the operational state unauditable across systems. Source finding context: Model a CriticalValueNotification record, or at minimum an authoritative external-record reference, and link it to CriticalValue, recipient, notification time, and responsible staff; derive notified from the existence/status of that record. Source finding context: .onto/review/20260718-f461553b/round1/structure.findings.yaml#structure-candidate-003 Source finding context: Use of the ontology as an operational integration authority for critical-result handling. Source finding context: When EMR or LIS consumers must verify, reconcile, or audit a CriticalValue marked notified. Source finding context: The notification flag cannot be structurally reconciled with its evidence, allowing inconsistent or unsupported completion states between systems. Source finding context: Notification evidence is delegated to an external telephone log without representing that log or a reference to it in the ontology. Source finding context: CriticalValue.notified has no link to the notification record that supports the boolean. Source finding context: The missing link is a symptom of placing time and recipient data in an external log without modeling its identity or relationship.

## Shared Phenomenon Summary
- none
