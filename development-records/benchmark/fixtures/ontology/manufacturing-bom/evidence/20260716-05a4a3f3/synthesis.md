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
- issue-001 (high): 공유 제조 값의 권위 출처, 유효시점, 단위·변환 및 동기화 계약이 없어 PLM·MES 등 소비 시스템이 동일한 스크랩률·표준시간·UOM을 일관되게 해석하고 계산한다는 보장이 없다.
  - root cause: 공유 제조 값에 단일 권위, 유효시점, 변환·동기화 계약이 없어서 시스템별 계산이 달라진다. 이 계약을 도입하면 복사·수기 값으로 인한 불일치가 사라져야 한다.
  - materiality: 이 결함은 복사·수기 입력·현장 환산된 값으로 소요량, 능력, 원가가 서로 다르게 계산되게 하여 계획·원가·실행 판단의 신뢰성을 낮춘다. 따라서 품목·BOM·라우팅의 공통 해석 기준을 제공하고 제조 운영 위험을 줄인다는 문서의 핵심 목적과 채택 가능성을 직접 약화한다.
  - action: 먼저 스크랩률·표준시간·UOM 환산을 각각 권위 있는 공유 제조 값으로 모델링하고 원본 시스템, 기준 단위, 유효기간, 승인 상태를 명시해야 한다. 이어 변환, 동기화, 충돌 해결 정책을 같은 계약에 연결하고, 수기 사본은 권위 값이 아니라 출처와 변환 이력을 추적할 수 있는 파생값으로 제한해야 한다. 이 순서가 필요한 이유는 권위와 유효성 기준이 먼저 확정되어야 동기화와 충돌 해결이 어떤 값을 보존해야 하는지 결정할 수 있기 때문이다.
- issue-002 (high): ECO 유효일과 주간 배치로 갱신되는 Part.rev 사이에 생산이 따라야 할 단일 리비전 권위가 없어, 변경 경계에서 잘못된 리비전으로 생산할 수 있다.
  - root cause: ECO, 도면 관리대장, Part.rev 사이에 단일 시점 기반 유효 리비전 권위가 없어서 변경 경계에서 서로 다른 리비전이 선택된다. 유효 리비전 권위를 단일화하면 지연 구간의 상충이 사라져야 한다.
  - materiality: ECO 유효일이 지났지만 Part.rev가 아직 갱신되지 않은 기간에는 PLM과 MES가 서로 다른 현재 리비전을 선택할 수 있다. 그 결과 잘못된 도면·BOM·공정 기준으로 생산할 직접적인 운영 위험이 생기므로, 변경관리의 일관성과 오리비전 생산 방지라는 목적을 훼손한다.
  - action: 먼저 part_ref, revision, effective_from/to 및 ECO 승인·적용 상태를 연결한 유효 리비전 레코드를 단일 권위로 정의해야 한다. 다음으로 생산 오더 생성이 이 권위를 조회하도록 연결하고, 해당 리비전이 동기화·승인되지 않았거나 다른 기준정보와 불일치하면 생성을 차단하거나 명시적 예외 승인을 요구해야 한다. 권위 정의와 연결이 선행되어야 차단 규칙이 일관된 기준을 집행할 수 있다.
- issue-003 (high): 회수·재투입 흐름을 자기참조 BOM으로 표현한 현재 모델은 BOM의 비순환 계약과 전개·롤업 계산의 종료 가능성을 훼손하므로 대상 문서에서 즉시 수정해야 한다.
  - root cause: 제품 구성 BOM과 공정 회수 흐름을 같은 관계로 표현해서 순환 계산 위험이 발생한다. 회수 흐름을 별도 관계로 분리하면 일반 BOM 전개의 순환이 사라져야 한다.
  - materiality: PLM/MES가 공유하는 BOM은 소요량 계산과 원가 롤업에 일관되게 적용될 수 있어야 한다. 자기참조 예외를 일반 BOM 관계에 두면 소비자별 순환 처리 결과가 달라지거나 계산이 끝나지 않을 수 있어, 공통 BOM 개념과 제조 계획 결과의 신뢰성이 약화된다.
  - action: 먼저 회수·스크랩·재투입을 별도의 자재 흐름 또는 공정 산출·투입 관계로 모델링하고, 수율·회수율·적용 공정·유효기간·계산 규칙을 그 관계에 둬야 한다. 그다음 일반 BOM에서 자기참조 예외를 제거하고 비순환성을 엄격히 유지해야 한다. 이 순서로 분리해야 회수 의미를 보존하면서 BOM 전개와 롤업의 종료 가능성을 회복할 수 있다.
- issue-004 (high): 적용 시점별 제품 구성을 재구성할 독립된 BOM·라우팅 revision과 effectivity가 없어, MES가 특정 생산 시점에 유효한 구성과 공정 순서를 단일하게 판정할 수 없다.
  - root cause: 시간에 따라 변하는 제품 구성에 독립된 버전과 effectivity 개념이 없어서 특정 시점의 구성을 재구성할 수 없다. 버전별 유효기간을 도입하면 변경 경계와 과거 구성이 단일하게 결정되어야 한다.
  - materiality: 이 결손은 ECO 변경 경계와 과거 생산 시점에서 PLM의 설계 기준을 MES 실행 기준으로 일관되게 변환하지 못하게 한다. 따라서 적용할 BOM·라우팅의 결정뿐 아니라 과거 생산 구성의 감사와 재현도 보장할 수 없어, PLM/MES 통합 개념 기준이라는 문서 목적을 직접 약화한다.
  - action: PartRevision, BomRevision, RoutingRevision 또는 이를 포괄하는 ConfigurationRevision을 먼저 도입하고, 각 버전에 유효 시작·종료 시점, 변경 근거 ECO, 상태 및 적용 범위를 연결해야 한다. 그다음 현재값을 별도 권위로 유지하지 않고 해당 시점의 유효 버전에서 파생되는 투영으로 정의해야 변경 경계 판정과 과거 구성 재현이 일관된다.
- issue-005 (high): 생산 오더를 전제한 규칙과 달리 이를 나타내는 ManufacturingOrder, 실행을 기록하는 OperationExecution, 설계 기준과 실제 결과를 잇는 최소 투입·산출 연결이 없어 PLM 제품 정의에서 MES 생산 실적까지의 추적 사슬이 단절되어 있다.
  - root cause: 모델 범위가 제품·공정 정의에 머물러 MES 실행 인계와 실적 하위 영역을 포함하지 않았다. 생산 주문과 실행 엔티티를 추가하면 설계 기준부터 실행 결과까지의 추적 사슬이 연결되어야 한다.
  - materiality: 이 공백 때문에 released 라우팅을 근거로 생산 오더를 만들거나 실행 결과를 설계 기준과 대조할 때, 어떤 Part/BOM/Routing revision이 적용되었고 무엇이 실제 소비·생산되었는지 연결할 수 없다. 따라서 PLM의 제품 정의와 MES의 생산 실행을 잇는다는 선언 목적을 직접 약화시키는 중대한 완전성 문제다.
  - action: ManufacturingOrder와 OperationExecution을 추가하고, ManufacturingOrder를 적용 Part/BOM/Routing revision에 명시적으로 연결해야 한다. 이어 OperationExecution에 설계 기준과 실제 결과를 대조할 수 있는 최소 MaterialConsumption·ProductionOutput 또는 동등한 투입·산출 기록을 연결해야 한다. 먼저 주문과 적용 revision의 인계 관계를 확립한 뒤 실행 및 실적 연결을 결합해야 전체 추적 사슬을 검증할 수 있다.
- issue-007 (high): 수치·단위·차원과 환산 규칙을 하나의 권위 모델로 표현하지 않고 단위를 닫힌 enum 또는 암묵적 문맥에 맡겨, BOM 수량과 작업장 용량의 현재 계산 및 향후 확장을 신뢰하기 어렵다.
  - root cause: 수치와 단위를 결합한 확장 가능한 Quantity/UOM 권위 모델과 유효한 변환 규칙이 없어서 현재 환산과 향후 단위 확장이 모두 불안정하다. 해당 모델을 도입하면 계산 불일치와 단위 추가 시 스키마 변경 필요가 함께 해소되어야 한다.
  - materiality: PLM과 MES가 품목 수량과 생산 용량을 일관된 공통 의미로 교환하려면 값의 차원, 단위, 환산 근거가 기계적으로 결정되어야 한다. 현재는 현장별 수기 해석에 의존해 소요량·구매량·생산능력 계산에서 과소·과다 투입과 일정 오류가 발생할 수 있고, 새 단위나 외부 코드를 도입할 때 기존 데이터와의 비교 가능성도 약화된다.
  - action: 먼저 UnitOfMeasure와 Quantity를 재사용 가능한 권위 개념으로 정의해 모든 수량 값이 단위와 차원을 명시적으로 참조하게 해야 한다. 이어 UomConversion에 품목·유효기간별 변환계수, 단위 코드 매핑·버전, 원본 권위 시스템을 기록하고 기존 ea/kg/m 값을 단위 식별자로 매핑해야 한다. 작업장 capacity는 수량/시간 기준과 교대 시간 정의를 분리해 표현해야 하며, 이 기반을 마련한 뒤 BOM·스크랩·용량 속성을 연결해야 환산과 비교가 일관되게 작동한다.
- issue-009 (high): 새 리비전이나 ECO 적용 시점이 생기면 현재 모델은 기존 BOM·라우팅의 유효 버전과 적용 조건을 보존할 수 없으므로, PLM/MES가 특정 생산분의 유효 구성을 공통으로 결정할 수 없다.
  - root cause: 변경 가능한 BOM·라우팅을 독립적인 유효 버전이 아니라 현재 Part에 직접 연결해 기존 버전을 보존할 수 없다. 버전 권위와 effectivity를 도입하면 ECO 전후 생산 구성을 함께 보존할 수 있어야 한다.
  - materiality: 둘 이상의 리비전이 공존하거나 ECO 적용 전후의 생산·이력 데이터를 함께 교환할 때 시스템별 덮어쓰기나 별도 해석이 필요해진다. 이는 품목·BOM·라우팅·변경관리의 연속된 기준을 제공하려는 문서의 목적을 약화하고, 변경 추적과 과거 생산 재현의 신뢰를 훼손한다.
  - action: 먼저 PartRevision과 같은 버전 권위 개념을 도입한 뒤, BOM과 Routing의 각 버전을 해당 리비전에 연결해야 한다. 각 버전에 valid_from/valid_to 또는 동등한 effectivity 조건과 originating_eco를 기록하고, Part의 current 값은 유효 버전에서 파생해야 한다. 이 순서를 따라야 ECO 전후 구성을 동시에 보존하고 생산 시점별 유효 구성을 일관되게 판정할 수 있다.
- issue-012 (high): 재생 원료의 공정 환류를 Assembly의 자기참조 BomLine으로 표현하면 제품 구성과 공정 물질흐름의 의미가 혼합되어 BOM의 실제 의미가 왜곡된다. 이 문제는 현재 대상에서 반드시 분리해 수정해야 한다.
  - root cause: 제품구조 구성 관계와 제조공정 물질 환류 관계를 하나의 BomLine으로 합성해 자기참조의 의미가 모호해졌다. 환류를 별도 관계로 분리하면 제품구조 전개와 공정 흐름 해석이 분리되어야 한다.
  - materiality: PLM/MES 통합 기준에서 BomLine은 제품구조상의 하위 품목 사용량으로 일관되게 해석되어야 한다. 그러나 자기참조가 재투입 흐름까지 뜻하면 제품구조 전개, 소요량 계산, MES 투입 변환 시 해석이 비결정적이 되어 순환 전개나 잘못된 자재 소요를 유발할 수 있으므로 통합 모델의 정확성과 계산 안전성을 중대하게 약화한다.
  - action: BOM은 비순환 제품구조로 유지하고 스크랩 회수·재투입은 별도의 MaterialReturn 또는 ReworkFlow 관계로 분리해야 한다. 새 관계에는 출발 공정, 재투입 공정, 회수율과 유효 조건을 표현하고, 그다음 기존 자기참조 예외와 PLM/MES 소비 경로를 새 의미에 맞게 전환해야 제품구조 전개와 공정 흐름 계산을 결정적으로 분리할 수 있다.
- issue-006 (medium): ECO와 Routing에 현재 상태값만 있고 lifecycle 종결 상태와 감사 사건이 없어, 변경 승인과 생산 릴리스의 근거·현재 효력·후속 정정을 신뢰성 있게 입증할 수 없다.
  - root cause: 현재 상태값만 모델링하고 상태 전이 사건, 통제 증거와 lifecycle 종료 구간을 독립 개념으로 두지 않아 승인 효력을 재구성할 수 없다. 감사 사건과 허용 전이를 추가하면 승인 근거와 후속 정정을 재현할 수 있어야 한다.
  - materiality: 승인·릴리스의 행위자, 시각, 근거와 취소·대체·정정 이력을 재구성할 수 없으면 같은 상태값이 서로 다른 승인 경로와 효력을 숨긴다. 이는 변경관리와 생산 릴리스의 통제 판단 및 책임 추적을 약화하므로, 운영 통제 단계 전에 닫아야 하는 material 이슈다.
  - action: 다음 운영 통제 단계 전에 ECO와 Routing의 허용 전이와 종결 상태를 정의하고, actor, occurred_at, rationale/evidence, from_status, to_status를 담는 Approval/ReleaseEvent를 모델링해야 한다. 취소·대체·정정 사건은 원 사건과 연결하여 승인 근거, 현재 효력과 전체 변경 이력을 재현할 수 있어야 한다.
- issue-008 (medium): 복수 장부의 scrap_rate와 표준시간에 권위 값, 유효기간, 조정·대사 이력이 없어 불일치 시 운영 기준과 변경 경위를 판정할 수 없습니다.
  - root cause: 병행 관리되는 시점 의존 기준값에 권위 출처, 유효기간과 조정·대사 사건이 없어 불일치 시 기준값을 판정할 수 없다. 이를 모델링하면 과거 값과 불일치 해결 과정을 재현할 수 있어야 한다.
  - materiality: 이 결손은 PLM/MES와 원가·계획 시스템 사이에서 제조 기준값의 의미와 권위를 통일하려는 목적을 약화시킵니다. 오래된 복사본이나 수기 조정값이 BOM 소요량·원가·공정시간 계산에 사용되어도 식별하기 어려워 결과의 신뢰성과 감사 가능성이 낮아집니다.
  - action: 실제 시스템 연계 전 각 기준값에 authoritative_source와 valid_from/valid_to를 부여하고, 수동 변경은 actor·timestamp·reason을 가진 AdjustmentEvent로, 장부 간 비교와 해결은 비교 대상·차이·판정·해결 결과를 가진 ReconciliationEvent로 기록해야 합니다. 공유 원인 관계가 있는 권위 계약과 정합되게 설계하여 기준값 선택과 과거 재현을 같은 감사 경로에서 검증해야 합니다.
- issue-010 (medium): Routing을 단일 ordered_list로만 표현하면 분기·병렬·합류·재작업 공정을 수용할 때 기존 구조를 변경하거나 정보를 잃게 되므로, 다음 단계 전에 비선형 흐름을 보존할 수 있는 라우팅 구조 계약을 마련해야 한다.
  - root cause: 공정 흐름을 확장 가능한 전이 그래프가 아니라 단일 ordered_list로 고정해 비선형 흐름을 표현할 수 없다. 전이 개념을 분리하면 분기·병렬·합류·재작업을 스키마 변경 없이 표현할 수 있어야 한다.
  - materiality: 라우팅이 PLM/MES 통합 기준이 되려면 양쪽 시스템의 공정 토폴로지를 손실 없이 교환할 수 있어야 한다. 현재 구조는 선형 순서만 보존하므로 비선형 흐름을 축약하거나 시스템별 별도 사양으로 분기시켜 통합 기준의 확장성과 채택성을 약화한다.
  - action: 다음 단계로 진행하기 전에 RoutingStep과 StepTransition을 분리하고, 전이에 순서·조건·분기·합류·재작업 의미를 표현하도록 구조 계약을 확정해야 한다. 기존 ordered_list는 단순 선형 라우팅을 위한 파생 뷰 또는 호환 표현으로 유지하면 현재 사용 경로를 보존하면서 비선형 공정을 핵심 스키마의 반복 변경 없이 확장할 수 있다.
- issue-011 (medium): AlternatePart에 보편적 대칭성과 one_way 방향성을 함께 부여한 현재 계약은 모순되며, PLM과 MES가 동일 관계를 서로 다르게 해석할 수 있으므로 다음 적용 단계 전에 방향 규칙을 하나로 확정해야 한다.
  - root cause: 대체 관계의 방향성을 하나의 일관된 규칙으로 정하지 않아 보편적 대칭성과 one_way 상태가 동시에 선언된다. direction을 권위 규칙으로 단일화하면 동일 인스턴스에서 상반된 역관계가 도출되지 않아야 한다.
  - materiality: 한 소비자는 one_way를 비대칭 관계로, 다른 소비자는 엔티티 정의에 따라 대칭 관계로 해석할 수 있다. 그러면 동일 모델에서 대체 승인 가능 부품과 자재 선택 결과가 달라져, PLM/MES 통합을 위한 일관된 개념 기준이라는 목적의 신뢰성이 약화된다.
  - action: 소비 시스템 적용 전에 방향성의 권위를 결정해야 한다. one_way와 bidirectional을 모두 지원하려면 direction을 권위 있는 구분자로 삼아 bidirectional일 때만 역방향이 성립하고 one_way일 때는 primary_ref에서 alternate_ref 방향만 성립하도록 정의해야 한다. 모든 대체 관계를 대칭으로 만들 의도라면 one_way 값과 기본 one_way 설명을 제거해야 한다. 어느 선택이든 단일 규칙으로 확정해야 이후 대체 유형이나 승인 정책을 추가할 때 기존 데이터의 의미와 시스템 간 판단이 보존된다.
- issue-013 (medium): 대체부품의 권위 모델인 AlternatePart가 canonical relation graph에서 빠진 채 방향 없는 Part 간 shortcut으로 평탄화되어, 일방향 대체 승인과 대칭적 상호 호환의 의미가 충돌하고 방향 정보에도 구조적으로 도달할 수 없다.
  - root cause: 방향 정보를 소유한 AlternatePart를 canonical relation graph에 연결하지 않고 방향 없는 shortcut으로 평탄화해 의미와 구조적 도달성이 함께 손실된다. 권위 association을 연결하고 shortcut을 방향 보존 투영으로 제한하면 두 결함이 함께 사라져야 한다.
  - materiality: PLM/MES가 one_way 대체 관계를 교환하거나 relation graph로 탐색할 때 허용 방향을 잃거나 역방향 대체까지 승인된 것으로 해석할 수 있다. 이는 생산 투입 판단의 신뢰성을 떨어뜨리고 통합 매핑을 불완전하거나 불일치하게 만들어, 대체부품 관계의 일관된 승인 의미와 완전한 구조적 연결을 제공하려는 목적을 약화한다.
  - action: 다음 통합 매핑 단계 전에 AlternatePart를 primary Part와 substitute Part에 명시적으로 연결하고 directed substitution을 권위 의미로 확정해야 한다. 상호 대체는 두 방향 관계 또는 별도의 명시적 symmetric 호환 관계로 표현하고, Part 간 alternate_of는 권위 association에서 방향을 보존해 산출되는 파생 투영으로 제한하거나 제거해야 한다.
- issue-014 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 검사 계획 정보 객체와 검사 작업 공정 객체를 동일시하는 유형 오류다. 이 경계는 다음 단계 전에 바로잡아야 한다.
  - root cause: 검사 활동과 그 활동을 규정하는 계획을 구분하지 않고 InspectionPlan을 Operation의 하위 유형으로 두어 생명주기와 식별 의미가 혼합된다. 두 개념을 분리하면 계획 재사용과 공정 실행을 독립적으로 표현할 수 있어야 한다.
  - materiality: 계획과 실행 단계는 식별자, 개정, 재사용, 배포 및 생명주기가 다르다. 이를 한 유형으로 취급하면 별도 생명주기나 다대일 재사용 관계를 정확히 표현할 수 없어, 라우팅과 품질검사 개념을 PLM/MES 사이에서 정확히 매핑하려는 목적이 약화된다.
  - action: 다음 매핑 단계 전에 InspectionOperation을 Operation의 하위 유형으로 만들고, InspectionPlan은 별도의 정보 객체로 분리해야 한다. InspectionOperation이 plan_ref로 InspectionPlan을 참조하도록 하며 sampling_rule과 acceptance_criteria는 계획에 유지해야 한다. 이 순서로 유형 경계를 먼저 수정해야 이후 PLM/MES 매핑이 독립적인 계획 생명주기와 공정 실행을 보존할 수 있다.
- issue-015 (medium): capacity_per_shift가 처리량(개수/교대)과 가용시간(시간/교대)을 하나의 숫자 필드로 표현해, 차원이 다른 작업장 능력을 같은 의미로 취급한다.
  - root cause: 작업장 능력을 단위와 능력 종류가 있는 측정 개념이 아니라 숫자 하나로 축약해 처리량과 가용시간이 같은 필드에 섞인다. capacity_kind와 단위를 구조화하면 차원이 다른 값의 통합 계산이 거부되거나 분리되어야 한다.
  - materiality: 서로 다른 작업장의 능력을 부하·능력 계산에 통합하면 숫자 형식은 맞아 계산이 성공할 수 있지만, 처리량과 가용시간이 혼합되어 결과는 의미상 무효가 될 수 있다. 따라서 MES 라우팅과 작업장 능력에 일관된 제조 운영 의미를 제공하려는 목적을 약화한다.
  - action: 능력계획 연계 전 이 문제를 닫아야 한다. available_time_per_shift와 throughput_per_shift를 분리하거나, capacity를 value, unit, capacity_kind 및 기준 품목·공정을 포함하는 측정값으로 모델링해야 한다. 이를 통해 차원이 다른 값의 통합 연산을 거부하거나 종류별 계산으로 분리할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: resolved
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅 값을 일관되게 해석하고 제조 운영 위험을 줄이는 목적
- issue-002: PLM/MES 통합에서 변경관리 개념을 일관되게 적용하고 잘못된 리비전 생산을 방지하는 목적
- issue-003: PLM/MES가 공유할 정합한 BOM 개념과 안전한 제조 소요량·원가 계산 기준 제공
- issue-004: PLM/MES 통합에서 품목·BOM·라우팅의 적용 기준을 일관되게 제공하는 개념 기준 문서
- issue-005: PLM의 제품 정의와 MES의 생산 실행을 잇는 개념 기준 제공
- issue-007: PLM/MES 간 품목 수량과 작업장 용량을 일관되고 확장 가능한 공통 의미로 교환하는 기준 제공 Source finding context: PLM BOM 수량과 MES 계획·생산 용량을 일관된 의미로 교환하는 기준 제공 Source finding context: PLM/MES 간 품목 수량과 작업장 용량을 공통 의미로 교환하는 개념 기준 목적
- issue-009: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리의 연속된 기준을 제공하는 목적
- issue-012: PLM/MES 통합의 품목·BOM·공정 개념 기준
- issue-006: 변경관리와 생산 릴리스의 통제 기준 및 감사 가능성 제공
- issue-008: PLM/MES 및 원가·계획 시스템 사이에서 제조 기준값의 의미와 권위를 통일하는 개념 기준 제공
- issue-010: 라우팅 개념을 PLM/MES 통합 기준으로 제공하는 목적
- issue-011: PLM/MES 통합을 위한 품목·BOM·라우팅·변경관리 개념 기준 제공
- issue-013: PLM/MES 통합에서 대체 부품 관계의 일관된 승인 의미와 완전한 구조적 연결을 제공하는 목적 Source finding context: PLM/MES 통합에서 대체 부품의 일관된 승인 의미 제공 Source finding context: Serving as the conceptual reference model for PLM/MES integration, including alternate-part relationships.
- issue-014: 라우팅과 품질검사 개념을 PLM/MES 사이에서 정확히 매핑하는 기준 제공
- issue-015: MES 라우팅과 작업장 능력의 일관된 제조 운영 의미 제공

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 공유 제조 값의 권위 출처, 유효시점, 단위·변환 및 동기화 계약이 없어 PLM·MES 등 소비 시스템이 동일한 스크랩률·표준시간·UOM을 일관되게 해석하고 계산한다는 보장이 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 운영 시스템에 별도 통제나 환산 마스터가 존재하는지는 이 검토 경계에서 확인되지 않았으며, 결론은 대상 개념 기준 문서에 해당 계약이 없다는 사실에 한정된다.
- 실제 PLM/MES 인터페이스가 별도 차단을 수행하는지는 이번 검토 경계에서 확인되지 않았으며, 기준 문서에는 그 의무가 표현되지 않았다.
- 실제 소비 시스템에 별도의 순환 차단 로직이 존재하는지는 이 검토 경계에서 확인되지 않았으나, 온톨로지 자체에는 공통 처리 의미가 제공되지 않는다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-012 (high): fix_now
- issue-006 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, accept_risk
- issue-013 (medium): fix_before_release, follow_up
- issue-014 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, follow_up

## Recommendations
- issue-016 (low): manufactured_by가 제조 주체가 아닌 Routing을 목적어로 삼아 관계 이름과 실제 의미가 맞지 않는다. Source finding context: Part에서 Routing으로의 manufactured_by 관계명 Source finding context: materialized-input.md:55-60, 84-88 — Routing은 제조 공정 순서로 정의되지만 Part와의 관계명은 manufactured_by이다. Source finding context: manufactured_by가 제조 주체가 아닌 공정 순서인 Routing을 목적어로 삼아 관계 이름과 실제 의미가 맞지 않는다. Source finding context: 관계 소비자는 manufactured_by를 제조 주체 관계로 해석할 수 있어 제조 방법 또는 적용 라우팅 관계와 혼동한다. Source finding context: 관계명을 has_routing, uses_routing 또는 manufactured_via로 바꾸고, 제조 주체가 필요하면 별도의 manufacturer 관계를 둔다. Source finding context: .onto/review/20260716-05a4a3f3/round1/semantics.findings.yaml#semantics-candidate-005

## Unique Finding Tagging
- issue-016 (low): manufactured_by가 제조 주체가 아닌 Routing을 목적어로 삼아 관계 이름과 실제 의미가 맞지 않는다. Source finding context: Part에서 Routing으로의 manufactured_by 관계명 Source finding context: materialized-input.md:55-60, 84-88 — Routing은 제조 공정 순서로 정의되지만 Part와의 관계명은 manufactured_by이다. Source finding context: manufactured_by가 제조 주체가 아닌 공정 순서인 Routing을 목적어로 삼아 관계 이름과 실제 의미가 맞지 않는다. Source finding context: 관계 소비자는 manufactured_by를 제조 주체 관계로 해석할 수 있어 제조 방법 또는 적용 라우팅 관계와 혼동한다. Source finding context: 관계명을 has_routing, uses_routing 또는 manufactured_via로 바꾸고, 제조 주체가 필요하면 별도의 manufacturer 관계를 둔다. Source finding context: .onto/review/20260716-05a4a3f3/round1/semantics.findings.yaml#semantics-candidate-005

## Shared Phenomenon Summary
- none
