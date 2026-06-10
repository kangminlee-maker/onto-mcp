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
- issue-001 (high): scrap_rate, std_time, uom conversion의 기준 권위와 precedence가 온톨로지 내부의 명시적 master/reference 개념과 관계 경로로 닫히지 않아, PLM/MES 통합 기준 문서가 동일 품목·BOM·라우팅에 대해 하나의 운영 기준값을 보장하지 못합니다.
  - root cause: 제조 운영 핵심값의 source-of-truth와 precedence를 온톨로지 안에서 닫지 않고 외부 수기·현장 경로를 기준 모델 일부로 수용했다.
  - materiality: 이 이슈는 PLM/MES 통합 기준 문서가 제공해야 하는 핵심 목적, 즉 품목·BOM·라우팅의 동일한 운영 의미와 기준값 제공을 직접 약화합니다. 생산계획 엑셀, MES 계산값, 표준원가 수기 입력, 현장 UOM 환산이 서로 다른 값이나 갱신 시점을 가지면 생산오더 수량, 자재 소요량, capacity/cost 계산이 시스템별로 달라져 통합 기준 문서의 신뢰성과 제조 의사결정의 재현성이 손상됩니다.
  - action: scrap_rate, std_time, uom conversion을 각각 authoritative source, 적용 범위, 동기화 방식, precedence, 검증 실패 처리를 가진 master/reference 개념으로 분리해야 합니다. 복사·수기·현장 환산은 기준값이 아니라 예외 입력 경로로 낮추고, PLM/MES/원가 시스템 간 대사 및 실패 처리 규칙을 온톨로지 계약에 포함해야 합니다.
  - unresolved disagreement: Deliberation은 issue-001을 유지하되 root를 master/reference와 graph-path 폐쇄 문제로 좁혔습니다. evolution 렌즈는 UOM/measurement 근거 범위에서는 지지하지만 scrap_rate와 std_time까지 high로 확장하려면 변경·확장·버전 관리되는 기준 개념으로서 내부 authority/precedence가 필요하다는 추가 직접 근거가 남아 있다고 보았습니다.
- issue-002 (high): ECO effective_date와 Part.rev 주간 배치 동기화가 동시에 기준으로 남아 있어, 생산오더 생성 또는 release 시점에 어느 revision이 유효한지 일관되게 판정할 수 없는 고위험 변경관리 결함이다.
  - root cause: 변경 효력의 운영 기준과 Part.rev 동기화 projection의 권위·시점 차이를 명시적으로 분리하지 않았다.
  - materiality: PLM/MES 통합에서 변경관리의 목적은 생산 실행 시점에 유효한 revision을 운영 시스템이 동일하게 결정하게 하는 것이다. 그런데 ECO 효력일은 생산 기준으로 즉시 작동하는 반면 Part.rev는 도면 관리대장 반영 후 주간 배치로 늦게 갱신되므로, 그 사이 생산오더·BOM·라우팅 판단이 구 rev와 신규 rev 사이에서 갈릴 수 있다. 이는 변경 적용 누락, 잘못된 자재·공정 사용, 추적성 약화로 이어져 선언된 목적을 직접 약화한다.
  - action: ECO, drawing revision, Part revision을 effectivity-aware revision/effectivity entity로 연결하고, 생산오더 생성 및 release 시점의 유효 revision 판정 기준을 명시해야 한다. Part.rev 주간 배치 값은 운영 판단의 권위가 아니라 표시용 projection으로 낮추고, 실제 적용 판단은 ECO status, effective_date, 적용 revision의 승인 상태를 함께 검증하는 precedence로 닫아야 한다.
- issue-003 (medium): 스크랩 재투입·회수 흐름을 BOM parent-child 자기참조 예외로 표현한 것이 핵심 문제입니다. 이 모델링은 BOM을 제품 구조의 비순환 그래프로 유지해야 한다는 규칙과 충돌하므로, 스크랩 재투입은 BOM 자기참조가 아니라 별도 제조 흐름 개념으로 분리해야 합니다.
  - root cause: 공정 재투입·회수 흐름을 별도 제조 흐름 개념으로 분리하지 않고 BOM parent-child 자기참조 예외로 흡수했다.
  - materiality: PLM/MES 통합 기준 문서에서 품목, BOM, 라우팅은 서로 다른 운영 의미와 무결성 규칙을 안정적으로 제공해야 합니다. 그런데 스크랩 재투입을 자기참조 BOM으로 넣으면 제품 구조, 공정 순환, BOM 비순환 규칙이 한 모델 안에서 섞입니다. 그 결과 BOM 전개, 자재 소요량 계산, 원가 누적, 변경 영향 분석, 생산오더 생성, BOM 검증 같은 downstream 처리가 순환 차단 기준을 신뢰하기 어려워집니다.
  - action: BOM은 제품 구조의 비순환 불변식으로 유지해야 합니다. 스크랩 재투입은 routing operation의 input/output, byproduct/recovered-material, recycle-flow, MaterialFlow, RecoveryOperation 같은 별도 공정 흐름 관계로 분리하고, 필요한 경우 source operation, target operation, yield/scrap factor, effectivity 같은 계산 규칙을 그 흐름 쪽에 두어야 합니다. 이 수정이 먼저 되어야 BOM 검증, 전개, 소요량, 원가, 라우팅 연계 규칙이 일반 규칙과 예외 분기 사이에서 흔들리지 않습니다.
- issue-004 (medium): MES 실행 주문/작업지시 개념이 없어 PLM의 품목·라우팅·ECO 기준이 MES 생산 실행 단위로 닫히지 않는다. 이 이슈는 material이며, 다음 단계 전에 ProductionOrder 또는 WorkOrder 개념으로 보완해야 한다.
  - root cause: 온톨로지 범위가 BOM/라우팅/ECO master data 중심으로 구성되었지만 PLM/MES 통합에 필요한 MES 실행 주문 개념을 포함하지 않았다.
  - materiality: 선언된 목적은 PLM/MES 통합의 개념 기준으로서 품목, 라우팅, 변경관리 기준을 MES 생산 실행으로 넘기는 것이다. 그런데 실행 주문 객체가 없으면 released Routing과 effective_date가 지난 ECO를 기준으로 어떤 품목·revision·routing에 대해 생산 오더를 생성해야 하는지 온톨로지 안에서 결정할 수 없다. 그 결과 master data와 실행 데이터 사이의 핵심 접점이 비어 구현자가 주문 생성과 변경 반영 기준을 각자 해석하게 된다.
  - action: ProductionOrder 또는 WorkOrder 개념을 추가하고 part_ref, routing_ref, planned_qty, status, effective_rev 또는 applied_eco_ref를 연결해야 한다. 이 조치는 Routing.status, ECO.effective_date, Part.rev가 MES 실행 주문 생성 기준으로 이어지게 만드는 선행 보완이며, PLM/MES 통합 설계의 다음 단계 전에 닫아야 한다.
- issue-005 (medium): BOM이 Assembly의 `bom_lines` 속성으로만 모델링되어 있어 BOM 자체의 revision, status, effectivity, 적용 범위를 표현하지 못한다. 따라서 변경 전후 BOM, 공장별 BOM, 모델/옵션별 BOM, draft/released BOM을 구분해야 하는 PLM/MES 기준으로는 BOMHeader 또는 BomRevision 같은 독립 기준 객체가 필요하다.
  - root cause: BOM을 독립 수명주기를 가진 기준 객체가 아니라 Assembly의 라인 목록 속성으로만 모델링했다.
  - materiality: 선언된 목적은 품목·BOM·라우팅·변경관리 정합성을 제공하는 PLM/MES 통합 기준이다. 현재 모델은 동일 Assembly에 하나의 `bom_lines` 목록만 제공하므로 MES가 생산 시점, 공장, 모델, 옵션, 릴리즈 상태에 맞는 자재 구조를 선택할 기준이 없다. 그 결과 ECO의 effective_date 규칙도 Part.rev 수준에 머물고 BOM 구조 변경의 적용 범위를 닫지 못한다.
  - action: BOMHeader 또는 BomRevision 개념을 분리하고 status, revision, effective_from/effective_to, plant/model/variant 적용 범위를 추가해야 한다. BomLine에는 owning BOM revision 참조 또는 line revision/effectivity를 두어 ECO가 Part.rev뿐 아니라 BOM 구조 변경까지 적용 대상으로 닫을 수 있게 해야 한다. 이 이슈는 target ontology 안에서 fix_now로 처리되어야 한다.
- issue-006 (medium): 제조 운영 위험 중심의 PLM/MES 통합 기준 문서인데도 lot/serial/batch 및 실행 이력·결과 개념이 없어, 계획 master data와 실제 제조 이력 및 물리 추적 단위가 연결되지 않는 것이 material issue다.
  - root cause: 온톨로지가 계획 기준 데이터에는 범위를 할당했지만 제조 실행 결과와 물리적 추적 단위에는 범위를 할당하지 않았다.
  - materiality: 이 문서의 목적은 품질, 리콜, ECO 적용 오류, 스크랩률 이상 같은 제조 운영 위험을 기준 데이터로 검증할 수 있게 하는 것이다. 그러나 현재 범위가 Part, BomLine, Operation, InspectionPlan 같은 계획 기준 데이터에 머물러 있어 특정 생산 lot/serial이 어떤 BOM, 라우팅, 검사 기준, 투입 자재 lot으로 생산되었는지 표현할 수 없다. 따라서 운영 위험 분석과 MES 통합에서 핵심인 추적성 검증이 목적대로 작동하지 않는다.
  - action: Lot/Serial 또는 Batch, MaterialConsumption, OperationExecution, InspectionResult 같은 최소 추적성 개념을 추가하고 ProductionOrder, Operation, Part, BomLine, InspectionPlan과 연결해야 한다. 범위를 작게 유지해야 한다면 우선 LotTraceRecord 하나로 생산 lot, 투입 part lot, operation, inspection result 참조를 묶어 계획 master data와 실행 이력 사이의 필수 연결을 닫는 방식이 적절하다.
- issue-007 (medium): 단위·환산·capacity 기준이 현재처럼 Part.uom enum, 단위 없는 capacity_per_shift 숫자, 현장 환산 관행으로 흩어져 있으면 PLM/MES 통합 기준으로 쓰기 어렵다. UnitOfMeasure, ConversionFactor, CapacityMeasure 같은 기준 개념으로 승격해 측정 의미와 확장 지점을 명시해야 한다.
  - root cause: 변경 가능성이 높은 측정 기준을 독립 기준 개념이 아니라 고정 enum 또는 단위 없는 숫자 속성으로 모델링했다.
  - materiality: 이 문서의 목적은 품목·BOM·라우팅 수량과 작업장 능력을 PLM/MES 사이에서 일관되게 교환하고 확장하는 것이다. 그러나 새 품목군이 다른 UOM을 쓰거나 설비 능력을 시간·수량·중량 등 다른 기준으로 통합해야 할 때, 현재 구조는 단위와 환산 의미를 데이터 안에 안정적으로 보존하지 못해 enum 수정, 기존 데이터 재해석, 현장별 수기 규칙 의존을 요구한다. 그 결과 계획·원가·capacity 계산의 신뢰가 약해진다.
  - action: UnitOfMeasure, ConversionFactor, CapacityMeasure를 기준 개념으로 추가하고 Part.uom, WorkCenter.capacity_per_shift, BomLine.scrap_rate가 단위, 적용 범위, 원본 권한, 유효기간을 참조하도록 바꿔야 한다. enum은 내부 식별자나 참조값 수준으로 축소하고 새 단위나 환산은 마스터 데이터 추가로 수용되게 해야 다음 단계의 PLM/MES 통합 계산과 데이터 교환을 안정적으로 진행할 수 있다.
- issue-008 (medium): Part 최신 rev/current_eco와 ECO.effective_date만으로 변경 이력과 적용성을 표현하면 PLM/MES 기준 문서가 요구하는 버전 연속성을 유지할 수 없다. PartVersion 또는 RevisionedItem, BomVersion, RoutingVersion, Effectivity를 명시하고 ECO가 변경 전/후 버전과 적용 범위를 참조하도록 보강해야 한다.
  - root cause: 변경관리의 권한과 이력을 버전 개념이 아니라 현재값 속성과 단일 적용일 규칙에 집중시켰다.
  - materiality: 이 기준 문서의 목적은 품목, BOM, 라우팅, 변경관리 개념을 PLM/MES 사이에서 연속적으로 유지하는 것이다. 현재 구조는 특정 시점의 생산오더, 품질 검사, 원가 산정이 어떤 과거 BOM/라우팅/검사 기준을 따라야 했는지 재현하기 어렵고, 미래 변경도 안전하게 예약하기 어렵게 만든다. 특히 ECO 적용일과 Part.rev 주간 동기화 사이, BOM/라우팅/검사 계획 동시 변경, 여러 리비전 병행 생산 상황에서 목적을 직접 약화한다.
  - action: fix_now로 PartVersion 또는 RevisionedItem, BomVersion, RoutingVersion, Effectivity 범위를 도입해야 한다. ECO는 affected_parts를 넘어서 변경 대상 버전, 변경 전/후, 적용 범위(날짜·로트·오더), BOM/라우팅/검사계획 변경 세트를 참조해야 하며, 생산오더가 도입되거나 연결될 때는 생성 시점의 유효 버전을 고정 참조하도록 해야 한다. 이는 issue-005와 공유 원인 후보가 있으므로 BOM 구조의 변경 효력/버전 귀속과 함께 정리하는 것이 필요하다.
- issue-009 (medium): AlternatePart는 필수 대칭 관계로 정의되어 있으면서 direction 속성에서는 one_way를 허용하고 기본값으로 두기 때문에, 동일한 대체 관계 인스턴스를 양방향과 단방향으로 동시에 해석하게 만드는 material issue입니다.
  - root cause: AlternatePart의 관계 양상 정의를 대칭 관계로 고정하면서 방향성 속성과 기본값을 동시에 도입했다.
  - materiality: PLM/MES 통합 기준은 품목 대체 가능성의 유효 범위와 방향을 일관되게 판정해야 합니다. 그러나 기본 one_way AlternatePart 인스턴스가 정의상으로는 역방향 대체까지 참이어야 하는 동시에 속성상으로는 역방향 대체를 보장하지 않으므로, 자재 부족 대체, 구매 대체, 생산 현장 투입 허용 판단에서 같은 관계가 서로 다르게 적용될 수 있습니다.
  - action: 대체 관계를 항상 대칭으로 유지할 것이라면 direction 속성과 one_way 값을 제거해야 합니다. 단방향 승인 대체도 필요한 모델이라면 정의를 바꾸어 direction이 bidirectional일 때만 역방향 대체가 성립한다고 명시하고, one_way 기본값이 의미하는 운영 판단 범위를 분명히 해야 합니다. 먼저 관계 의미를 선택한 뒤 enum/default를 그 의미에 맞춰 정렬해야 합니다.
- issue-010 (medium): AlternatePart는 대체 관계를 항상 대칭처럼 설명하면서 direction 속성은 one_way를 기본값으로 두고, alternate_of 단축 관계도 방향 정보를 드러내지 않는다. 따라서 단방향 대체와 상호 대체의 의미가 섞여 PLM/MES 통합 기준에서 대체 허용 범위를 잘못 해석하게 만드는 material 이슈다.
  - root cause: 대체 관계의 대칭성 여부를 관계 정의와 속성 양쪽에서 서로 다르게 부여했다.
  - materiality: 영향받는 목적은 PLM/MES 통합에서 품목·BOM, 특히 대체부품 사용 가능성의 의미 기준을 명확히 하는 것이다. one_way로 승인된 대체가 정의 문구나 alternate_of 단축 표기 때문에 양방향 대체처럼 읽히면, 승인되지 않은 역방향 부품 대체가 생산 오더, 현장 자재 피킹, 품질 승인 판단에 반영될 수 있어 제조 운영 신뢰를 약화한다.
  - action: AlternatePart 정의를 방향성 관계로 고치고, bidirectional일 때만 상호 대체라고 명시해야 한다. 또한 alternate_of 단축 표기는 direction을 함께 포함하는 명시적 투영으로 바꾸거나, 방향 정보를 잃는 단축 관계라면 제거 또는 비권장 처리해야 한다. 먼저 원천 관계의 방향성 의미를 닫은 뒤 단축 표기의 파생 규칙을 정해야 해석 손실을 막을 수 있다.
- issue-011 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 taxonomy는 검사 계획 문서와 라우팅 실행 단계를 같은 종류로 취급하므로 material issue다. InspectionPlan은 별도 계획 엔티티로 분리하고, 실제 검사 작업 단계는 Operation 또는 InspectionOperation이 inspection_plan_ref로 참조하도록 수정해야 한다.
  - root cause: 검사라는 활동(Operation)과 검사 계획이라는 제도적/문서적 기준(InspectionPlan)을 같은 is_a 계층에 배치했다.
  - materiality: PLM/MES 통합에서 Operation은 라우팅 순서, work_center, std_time_min 같은 실행 단계 의미를 담는다. InspectionPlan이 그 하위 유형이면 검사 기준·파라미터·합격 기준을 담는 계획 레코드가 실행 공정 속성을 가져야 하는 대상으로 해석되어, MES 라우팅 생성과 검사 기준 적용, 작업장·시간 배정의 기준이 흐려진다.
  - action: 우선 InspectionPlan을 Operation 계층에서 제거해 별도 계획 엔티티로 두고, Operation 또는 별도 InspectionOperation이 inspection_plan_ref로 해당 계획을 참조하게 해야 한다. deliberation은 이 taxonomy correction을 직접 해결 범위로 수용했으며, coverage/evolution 관점의 완료 조건을 위해 InspectionOperation, OperationExecution, InspectionResult 또는 적용 이력 범위를 최종 수정안에 포함할지 결정해야 한다.
  - unresolved disagreement: coverage와 evolution은 taxonomy 오류 자체를 부정하지 않지만, 완료 범위를 검사 계획·실행·결과 및 적용 이력 분리까지 넓혀야 한다고 보므로 최종 수정 범위 결정이 남아 있다.
- issue-012 (medium): BOM 구성 관계 안에 scrap_rate와 재투입/회수 흐름을 함께 넣어 제품 구조 의미와 공정 수율 의미가 혼재되어 있습니다. 이 이슈는 issue-003에 병합하지 않고, 독립적인 BOM-versus-process-flow 의미론 문제로 유지되어야 합니다.
  - root cause: 제품 구조 관계와 공정 수율·회수 흐름을 같은 BOM 표현 안에 배치했다.
  - materiality: PLM/MES 통합에서 BOM은 상위 품목이 하위 품목을 얼마나 사용하는지에 대한 제품 구조 기준이어야 합니다. 스크랩률이나 재투입을 같은 BOM 관계로 해석하면 자재소요, 원가, 라우팅 수율 계산에서 구성량과 손실·회수량의 기준이 섞여 생산계획과 운영 판단의 신뢰가 약해집니다.
  - action: BOM은 제품 구조 사용량 표현으로 제한하고, scrap_rate와 재투입은 Routing/Operation의 yield, byproduct, rework/recycle flow 같은 별도 공정 개념으로 분리해야 합니다. 재생 원료가 실제 투입 품목이면 별도 Part로 참조하되, 자기 포함 BOM으로 회수 공정을 표현하지 않아야 합니다.
- issue-014 (medium): issue-014는 AlternatePart를 엔티티로 정의해 놓고도 declared relations graph에 연결하지 않아, 대체 부품의 방향성(direction)이 관계 기반 소비자에게 전달되지 않을 수 있는 material structural issue입니다.
  - root cause: Declared relation graph가 AlternatePart association entity를 연결하지 않고 Part-to-Part alternate_of shortcut으로 대체 관계를 모델링했다.
  - materiality: 이 ontology의 목적은 item, BOM, routing, change-management 구조를 PLM/MES integration concept baseline으로 쓰는 것입니다. 그런데 relation graph를 구조 계약으로 소비하는 시스템은 AlternatePart에서 primary Part, alternate Part, direction 속성으로 이어지는 경로를 찾을 수 없으므로, 대체 가능 여부뿐 아니라 대체 방향이라는 운영상 중요한 의미를 잃을 수 있습니다. 이는 계획, 조달, 실행 판단에 필요한 substitution semantics의 신뢰도를 약화합니다.
  - action: relations에서 AlternatePart를 명시적 association entity로 연결해야 합니다. 예를 들어 AlternatePart -> Part primary, AlternatePart -> Part alternate 관계를 추가해 두 참여 Part와 direction 속성이 같은 canonical 구조 안에서 소비되게 해야 합니다. 기존 Part -> Part alternate_of shortcut은 제거하거나, 유지한다면 AlternatePart에서 파생된 projection임을 명확히 표시해야 관계 권위와 파생 뷰가 혼동되지 않습니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: Deliberation은 issue-001을 유지하되 root를 master/reference와 graph-path 폐쇄 문제로 좁혔습니다. evolution 렌즈는 UOM/measurement 근거 범위에서는 지지하지만 scrap_rate와 std_time까지 high로 확장하려면 변경·확장·버전 관리되는 기준 개념으로서 내부 authority/precedence가 필요하다는 추가 직접 근거가 남아 있다고 보았습니다.
- issue-011: coverage와 evolution은 taxonomy 오류 자체를 부정하지 않지만, 완료 범위를 검사 계획·실행·결과 및 적용 이력 분리까지 넓혀야 한다고 보므로 최종 수정 범위 결정이 남아 있다.

## Deliberation Decision
- issue-001: narrowed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: narrowed
- issue-012: resolved
- issue-014: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅이 동일한 운영 의미와 기준값을 제공해야 한다는 목적.
- issue-002: PLM/MES 통합에서 변경관리 개념이 생산 실행 시점의 유효 revision을 일관되게 결정해야 한다는 목적.
- issue-003: 품목·BOM·라우팅 개념이 PLM/MES 통합의 기준 문서로서 서로 다른 운영 의미와 무결성 규칙을 안정적으로 제공해야 한다는 목적. Source finding context: 품목·BOM·라우팅 개념이 PLM/MES 통합의 기준 문서로서 서로 다른 운영 의미를 안정적으로 제공해야 한다는 목적. Source finding context: BOM·라우팅 기준을 확장 가능한 PLM/MES 통합 개념으로 유지하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 BOM 무결성 규칙과 제조 운영 기준을 제공하는 목적.
- issue-004: PLM/MES 통합의 개념 기준 문서로서 품목, 라우팅, 변경관리 기준을 MES 생산 실행으로 넘기는 범위.
- issue-005: 품목·BOM·라우팅·변경관리 정합성을 제공하는 PLM/MES 통합 기준.
- issue-006: 제조 운영 위험 중심의 PLM/MES 통합 기준 문서.
- issue-007: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅 수량과 작업장 능력을 일관되게 교환·확장하는 목적.
- issue-008: 품목·BOM·라우팅·변경관리 개념을 PLM/MES 사이에서 연속적으로 유지하는 기준 문서 목적.
- issue-009: PLM/MES 통합 기준에서 품목 대체 가능성의 유효 범위와 방향을 일관되게 판정하는 목적.
- issue-010: PLM/MES 통합의 품목·BOM 개념 기준, 특히 대체부품 사용 가능성의 의미 기준.
- issue-011: PLM/MES 통합의 라우팅·검사 개념 기준.
- issue-012: PLM/MES 통합의 BOM·라우팅 개념 기준과 생산계획/자재소요 의미 기준.
- issue-014: Using the ontology as a PLM/MES integration concept baseline for item, BOM, routing, and change-management structures.

## Final Review Result
13 material issue(s) require attention. Highest-priority issue: issue-001 (high) — scrap_rate, std_time, uom conversion의 기준 권위와 precedence가 온톨로지 내부의 명시적 master/reference 개념과 관계 경로로 닫히지 않아, PLM/MES 통합 기준 문서가 동일 품목·BOM·라우팅에 대해 하나의 운영 기준값을 보장하지 못합니다. Unresolved disagreement remains: Deliberation은 issue-001을 유지하되 root를 master/reference와 graph-path 폐쇄 문제로 좁혔습니다. evolution 렌즈는 UOM/measurement 근거 범위에서는 지지하지만 scrap_rate와 std_time까지 high로 확장하려면 변경·확장·버전 관리되는 기준 개념으로서 내부 authority/precedence가 필요하다는 추가 직접 근거가 남아 있다고 보았습니다.

## Boundary Notes
- 실제 현장에 별도 단위 마스터가 존재하는지는 이 경계 안에서 확인하지 않았지만, 대상 문서 자체는 품목별 환산계수 마스터가 없고 현장 환산에 맡긴다고 정리되어 있다.
- 생산오더 엔티티가 대상 파일에 없으므로 오더 고정 버전 정책은 이 경계 안에서 직접 확인할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, accept_risk
- issue-012 (medium): fix_before_release, fix_now
- issue-014 (medium): fix_before_release, fix_now

## Recommendations
- issue-013 (low): current_eco의 최신 설계변경 의미가 ECO 상태·효력일과 맞물릴 때 현재 적용 변경인지 최신 접수 변경인지 불명확하다. Source finding context: Part.current_eco Source finding context: manufacturing-bom-ontology.yaml:15-16; manufacturing-bom-ontology.yaml:64-70; manufacturing-bom-ontology.yaml:91 Source finding context: current_eco의 '최신 설계변경' 의미는 ECO 상태·효력일과 맞물릴 때 현재 적용 변경인지 최신 접수 변경인지 불명확하다. Source finding context: 최신 ECO, 승인된 ECO, 적용된 ECO, 현재 생산에 유효한 ECO는 서로 다른 의미다. current_eco라는 이름이 이 구분을 하지 않으면 생산 시점 기준의 rev 판정과 설계변경 추적 의미가 섞인다. Source finding context: current_eco를 latest_eco, effective_eco, applied_eco 등 의도별 의미로 분리하거나 이름/정의에 상태와 effective_date 기준을 명시한다. 생산 적용 기준은 ECO.status와 effective_date의 조합으로 정의하고 Part.rev 동기화 지연과 구분한다. Source finding context: .onto/review/20260610-9ced06aa/round1/semantics.findings.yaml#semantics-candidate-004

## Unique Finding Tagging
- issue-013 (low): current_eco의 최신 설계변경 의미가 ECO 상태·효력일과 맞물릴 때 현재 적용 변경인지 최신 접수 변경인지 불명확하다. Source finding context: Part.current_eco Source finding context: manufacturing-bom-ontology.yaml:15-16; manufacturing-bom-ontology.yaml:64-70; manufacturing-bom-ontology.yaml:91 Source finding context: current_eco의 '최신 설계변경' 의미는 ECO 상태·효력일과 맞물릴 때 현재 적용 변경인지 최신 접수 변경인지 불명확하다. Source finding context: 최신 ECO, 승인된 ECO, 적용된 ECO, 현재 생산에 유효한 ECO는 서로 다른 의미다. current_eco라는 이름이 이 구분을 하지 않으면 생산 시점 기준의 rev 판정과 설계변경 추적 의미가 섞인다. Source finding context: current_eco를 latest_eco, effective_eco, applied_eco 등 의도별 의미로 분리하거나 이름/정의에 상태와 effective_date 기준을 명시한다. 생산 적용 기준은 ECO.status와 effective_date의 조합으로 정의하고 Part.rev 동기화 지연과 구분한다. Source finding context: .onto/review/20260610-9ced06aa/round1/semantics.findings.yaml#semantics-candidate-004

## Shared Phenomenon Summary
- none
