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
- issue-001 (high): BOM·Routing·Operation의 유효 버전과 ECO 적용 결과가 독립 개념으로 닫혀 있지 않아, ECO 전후 또는 특정 생산 조건 기준으로 어떤 제조 기준이 적용됐는지 안정적으로 재구성할 수 없다.
  - root cause: 변경 적용성을 독립된 effectivity/version 개념으로 모델링하지 않고 ECO.effective_date와 현재 rev 값에 묶어 둔 것이 BOM·Routing 이력 누락과 ECO 확장성 부족을 함께 만든다.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 품목, BOM, 라우팅, 변경관리 기준을 제공해야 한다. 그런데 BOM 라인, 라우팅 순서, 표준시간, 스크랩률, Part revision의 적용 기준이 단일 현재값과 ECO.effective_date에 묶여 있으면 과거 생산일, lot/serial/plant/order 상태, 재고 소진 방식 같은 실제 적용 조건에서 기준정보를 판정할 수 없다. 그 결과 생산오더와 변경관리 사이의 추적성, 원가·품질 판단, 변경 적용 감사 신뢰가 약해진다.
  - action: BOM·Routing·Operation 또는 별도 Effectivity/Revision 개념에 effective_from/effective_to, revision/version, 적용 범위(date, lot, serial, plant, line, order_state 등), superseded_by, ECO 적용 결과 연결을 추가해야 한다. 또한 생산오더는 release 시점에 해석된 BOM/Routing/Part revision snapshot 또는 effectivity resolution 결과를 참조해야 하며, Part.rev의 도면 원본 권위와 동기화 상태는 분리해 표현해야 한다.
- issue-007 (high): BOM 전역 비순환 규칙과 스크랩 재투입 시 Assembly 자기 포함 허용 예외가 같은 규칙 안에 함께 있어, 재생 원료 회수 공정이 있는 Assembly BOM은 정상 구조이면서 동시에 순환 오류가 되는 모순을 가진다.
  - root cause: 스크랩 재투입이라는 공정상 재사용 흐름을 BOM의 parent-child 포함 관계에 자기참조 예외로 직접 얹었다.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 BOM 검증, BOM 전개, 생산 투입 생성의 기준을 제공해야 한다. 동일 BOM을 검증기는 순환 위반으로 막아야 하는지, 스크랩 재투입 예외로 받아야 하는지 결정할 수 없으므로 운영 기준의 일관성과 자동화 가능성이 직접 약해진다.
  - action: 일반 자재 BOM에는 비순환 규칙을 유지하되, 스크랩 재투입은 별도 recovery/rework input 관계로 분리해야 한다. 만약 자기참조를 유지해야 한다면 허용되는 순환 유형, 적용 범위, 검증 예외 조건을 명시해 검증기와 생산 오더 생성 로직이 같은 BOM을 같은 방식으로 판정하도록 해야 한다.
- issue-002 (medium): 생산오더 실행 snapshot이 없어 릴리즈된 Part revision, BOM version, Routing version, release_basis가 MES 실행 단위에 고정되지 않으므로, PLM 기준정보가 실제 생산 실행 기준으로 닫히지 않는다.
  - root cause: 온톨로지가 기준정보 마스터에는 엔티티를 두었지만 MES 실행 단위인 생산오더 하위 영역을 포함하지 않았다.
  - materiality: 선언된 목적은 PLM 기준정보와 MES 생산 실행을 연결하는 개념 기준 제공이다. 그러나 어떤 생산오더가 어떤 릴리즈 기준 BOM·Routing·Part revision으로 생성되었는지 표현할 수 없으면, 라우팅 릴리즈 여부를 근거로 생산오더를 생성하거나 생성된 오더의 변경 기준을 추적·감사해야 하는 운영 접점을 검증할 수 없다.
  - action: ProductionOrder 또는 ManufacturingOrder 개념을 추가하되, 핵심은 실행 snapshot으로 selected_part_rev, bom_version, routing_version, release_basis를 고정하는 것이다. 여기에 part_ref, order_qty, created_at, status 및 Routing/Part/ECO와의 관계를 정의해야 릴리즈 기준정보가 생산오더 생성 시점에 어떤 실행 기준으로 선택되었는지 추적할 수 있다. issue-001과 공유되는 effectivity/version 원인이 있으므로 version·effectivity 기준과 생산오더 snapshot 정의가 서로 맞물리도록 함께 정렬해야 한다.
- issue-003 (medium): 승인, 동기화, 수동 입력, 복사, 대사 같은 통제 행위를 별도 감사 이벤트로 남기지 않아 actor, timestamp, source, 근거, 전후값을 재구성할 수 없는 material issue이다.
  - root cause: 상태와 값은 모델링했지만 그 상태·값을 변경하거나 외부에서 복사·대사하는 행위 자체를 별도 감사 개념으로 모델링하지 않았다.
  - materiality: 선언된 목적은 변경관리와 제조 운영 위험 중심의 PLM/MES 통합 기준을 세우는 것이다. 그런데 ECO 승인, Part.rev 동기화, scrap_rate 복사, 표준원가 수기 입력·대사처럼 책임과 근거가 필요한 행위의 증거가 없으면 값 불일치나 적용 오류가 발생했을 때 누가, 언제, 어떤 출처와 근거로 값을 반영했는지 추적할 수 없다. 따라서 운영 통제, 책임성, 감사 가능성이 약해진다.
  - action: ApprovalEvent, SyncEvent, ManualAdjustment, ReconciliationRecord 같은 공통 감사 이벤트 개념을 추가하고 actor, occurred_at, source_system, source_reference, reason, before_value, after_value, evidence_uri를 관련 행위에 연결해야 한다. 우선 ECO 승인, Part.rev 동기화, scrap_rate 복사, 표준원가 수기 입력·대사에 이 이벤트를 연결해 통제 행위의 증거를 값 자체와 분리해 보존해야 한다.
- issue-004 (medium): issue-004는 품목 단위 환산과 WorkCenter 생산능력 단위/기준이 독립 기준정보로 닫히지 않아, BOM 수량과 작업장 능력을 MES 계획·실행 계산에서 공통 기준으로 해석하기 어렵다는 material issue입니다.
  - root cause: 온톨로지가 단위 값을 enum/number로만 두고 단위 변환과 능력 기준을 독립된 기준정보 개념으로 포함하지 않았다.
  - materiality: 온톨로지의 목적은 BOM·라우팅 기준을 MES 계획/실행 계산에 사용할 수 있는 통합 개념 기준을 제공하는 것입니다. 그러나 kg↔ea처럼 BOM 소요량 단위가 다르거나 작업장별 capacity_per_shift 기준이 다른 경우, 환산 권위와 능력 단위가 없으면 같은 숫자가 시스템마다 다르게 해석되어 소요량 산정, 생산능력 비교, 계획·실적 계산의 신뢰가 약해집니다.
  - action: 품목별 UnitConversionFactor 마스터를 추가해 from_uom, to_uom, factor, valid_from/to, authority/source를 정의하고, WorkCenter에는 capacity_unit 또는 capacity_basis를 분리해 수량 기반 능력과 시간 기반 능력을 명시해야 합니다. 구현 시 broad issue는 단위 환산과 capacity basis를 함께 다루되, evolution 렌즈가 좁힌 대로 capacity 기준 계약은 명시적 하위 조치로 우선 확인해야 합니다.
  - unresolved disagreement: Deliberation은 broad issue scope를 수용했지만, evolution 렌즈는 특히 WorkCenter capacity_per_shift의 단위/기준 계약을 더 좁은 구현 우선순위로 보아야 한다는 강조를 남겼습니다.
- issue-005 (medium): 스크랩률을 BomLine의 단일 복사 속성으로 두면 BOM 구조와 제조 운영 파라미터의 변경 이력이 결합되어, 공정·기간·버전·출처별 스크랩 기준을 안정적으로 추적하기 어렵습니다.
  - root cause: 변동성 있는 제조 운영 파라미터를 독립된 유효기간/출처 개념이 아니라 BOM 구조 속성의 복사값으로 배치했다.
  - materiality: 이 이슈는 PLM/MES 통합 기준 문서가 BOM과 제조 운영 파라미터의 변경 연속성을 제공해야 한다는 목적을 약화합니다. 스크랩률이 공정별 수율, 설비별 불량률, 기간별 계획값, 외부 엑셀 개정값으로 바뀌는 순간 기존 BomLine 값을 직접 수정해야 하므로, 과거 계획·원가·생산 오더가 어떤 기준으로 산출되었는지 재현하기 어려워집니다.
  - action: scrap_rate를 BomLine의 단순 속성에서 분리해 ScrapPolicy 또는 ProcessYieldFactor 같은 별도 개념으로 모델링해야 합니다. 이 개념은 part, routing, operation, work_center 등 적용 범위와 effective_from/effective_to, source_system, revision을 가져야 하며, BomLine에는 필요한 경우 현재 적용 정책 참조만 두는 방식이 적절합니다. 이렇게 해야 BOM 구조는 안정적으로 유지되고, 운영 파라미터의 변경 이력과 출처를 별도로 추적할 수 있습니다.
- issue-006 (medium): WorkCenter.capacity_per_shift가 단일 number 속성으로만 정의되고 단위/기준 계약이 없어서, 작업장 유형이 늘거나 MES/APS와 연동될 때 같은 값이 생산량인지 시간인지 안정적으로 해석되지 않는다.
  - root cause: 용량 값과 용량 단위/기준을 같은 속성 계약 안에서 분리하지 않았다.
  - materiality: 이 문제는 PLM/MES 통합 기준에서 라우팅, 작업장, 생산능력 계산을 일관되게 확장하려는 목적을 약화한다. 새 작업장 유형이나 외부 시스템이 수량, 시간, 중량, 배치 같은 서로 다른 capacity 기준을 요구하면 동일 필드가 서로 다른 물리량을 뜻하게 되고, 통합 매핑과 능력 계산이 작업장별 예외 규칙에 의존하게 된다.
  - action: capacity_per_shift를 CapacityProfile 같은 별도 개념으로 분리하거나, 최소한 capacity_value, capacity_uom, capacity_basis, shift_calendar_ref, 유효기간을 속성 계약에 추가해야 한다. WorkCenter에는 현재 또는 기본 capacity profile 참조를 두어, 라우팅과 외부 통합이 값만이 아니라 단위, 기준, 달력 맥락까지 함께 참조하도록 만드는 것이 필요하다.
- issue-008 (medium): issue-008은 AlternatePart의 대체 방향 의미 계약이 정의, direction 속성, alternate_of shortcut 사이에서 일관되게 보존되지 않는 문제이다. 대체 가능성을 실행 기준으로 해석해야 하는 PLM/MES 통합 문서에서는 one_way와 bidirectional의 차이가 명확해야 하므로 material issue로 유지된다.
  - root cause: 대체 관계의 기본 의미를 대칭 관계로 서술하면서 별도 속성에서는 단방향을 기본값으로 둔 의미 모델링 불일치가 있다.
  - materiality: 대체 부품 사용 가능성은 MES나 계획 시스템이 실제 투입 가능한 품목과 역방향 대체 허용 여부를 판단하는 기준이다. 현재처럼 정의는 상호 대체처럼 읽히고 direction은 one_way를 기본으로 두며 shortcut은 방향 조건을 드러내지 않으면, 승인되지 않은 부품 투입, 자재 가용성 판단 오류, BOM 대체 정책 실행 불일치로 이어져 제조 운영 신뢰를 약화한다.
  - action: AlternatePart 정의를 'primary_ref 품목을 alternate_ref 품목으로 대체할 수 있는 방향성 있는 관계'로 정렬하고, bidirectional일 때만 역방향도 허용된다고 명시해야 한다. 또한 alternate_of shortcut은 directed_alternate_of와 mutual_alternate_of처럼 방향 의미가 보존되도록 분리하거나, direction 조건을 필수로 참조하게 해야 한다. deliberation은 이 이슈를 issue-013과 병합하지 않고 방향 의미 계약 문제로 유지했으며, 구조적 shortcut 문제는 공유 dependency context로만 보존했다.
- issue-009 (medium): Part.rev가 도면 문서 리비전과 생산 적용 품목/설계 리비전을 동시에 뜻하고 있어, ECO effective_date 이후 MES 생산분이 따라야 할 revision authority가 불명확해진다.
  - root cause: Part.rev라는 단일 속성에 도면 문서 리비전과 생산 적용 설계/품목 리비전의 의미를 함께 부여했다.
  - materiality: 검토 목적은 품목·BOM·라우팅·변경관리 개념을 PLM/MES 통합 기준으로 정합하게 정의하는 것이다. 그런데 ECO 이후 생산분의 rev 판단이 Part.rev를 참조하는 동시에 Part.rev가 도면 관리대장 기반 도면 리비전으로도 정의되면, 변경 적용 기준이 문서 동기화 상태와 섞인다. 그 결과 신규 설계가 적용되어야 할 생산분을 구분하는 통합 계약의 신뢰가 약해진다.
  - action: Part에는 생산과 변경관리 기준이 되는 item_rev 또는 design_rev를 별도 속성으로 두고, 도면 문서의 revision은 drawing_rev 또는 drawing_ref.rev로 분리해야 한다. 그 다음 ECO 규칙이 어떤 revision authority를 갱신하는지, MES 생산 실행이 어느 revision authority를 따라야 하는지 명시해야 한다. 이 분리가 선행되어야 ECO effective revision과 문서 동기화 상태를 독립적으로 해석할 수 있다.
- issue-010 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 검사 계획/사양 문서와 실제 수행되는 공정 단계를 같은 존재론적 유형으로 취급하므로 수정이 필요하다.
  - root cause: 검사 계획이라는 규칙/사양 개념을 검사 작업 단계와 동일한 존재론적 유형으로 모델링했다.
  - materiality: 이 문제는 PLM/MES 통합에서 라우팅과 검사 계획의 의미를 실행 가능한 기준으로 구분하려는 목적을 약화한다. Operation 상속이나 라우팅 operations 목록을 기준으로 처리할 때 InspectionPlan이 작업장, 표준시간, 실행 단계 의미를 가진 공정으로 오인되어 품질 기준 문서가 MES 실행 단계처럼 해석될 수 있다.
  - action: InspectionPlan을 Operation의 하위 유형에서 분리해 Operation에 연결되는 plan/spec 엔티티로 모델링해야 한다. 검사 수행 단계가 별도로 필요하면 InspectionOperation is_a Operation을 두고, 이 InspectionOperation이 InspectionPlan을 참조하게 하여 실행 단계와 기준 문서의 책임을 분리해야 한다.
- issue-011 (medium): BomLine.scrap_rate는 BOM 라인의 구조 수량 속성처럼 놓여 있지만 실제 의미는 공정 불량 보정값에 가까워, BOM 구조와 라우팅/공정 파라미터의 의미 경계를 흐리게 한다.
  - root cause: 공정 불량을 반영하는 비율 개념을 원천 공정이나 계산 기준 없이 BOM 라인의 독립 속성으로 모델링했다.
  - materiality: 이 이슈는 BOM과 라우팅/공정 개념의 의미 경계를 통합 기준 문서에서 분명히 하려는 목적을 약화한다. PLM/MES나 생산계획 연동이 scrap_rate를 BOM의 원천 구조 데이터로 취급하면, qty_per 같은 구조 소요량과 공정 조건에서 온 보정값이 같은 authority의 입력처럼 해석되어 자재 소요량, 계획 수량, 원가 계산에서 원천 드리프트와 중복 보정 위험이 생긴다.
  - action: BOM 구조에는 qty_per와 적용 조건만 남기고, scrap_rate는 Routing/Operation별 yield 또는 planning_factor로 분리해야 한다. 반드시 BomLine에 노출해야 한다면 원천 공정, 기준 기간, authority, 계산식, 복사본 여부를 명시해 파생값임을 드러내야 한다. 이 조치는 issue-005와 같은 scrap_rate 출처·유효기간·정책 분리 작업과 함께 처리하는 것이 자연스럽다.
- issue-012 (medium): capacity_per_shift가 작업장별 처리 개수와 가용 시간이라는 다른 물리량을 한 속성으로 표현해, 생산능력·부하 계산에서 같은 의미의 값처럼 오해될 수 있다.
  - root cause: 작업장 능력이라는 상위 용어 아래 처리량 capacity와 시간 capacity를 구분하지 않고 단일 속성으로 모델링했다.
  - materiality: 이 문서의 목적은 MES 생산능력과 라우팅 작업장 의미를 정확히 연결하는 것이다. 그런데 capacity_per_shift가 count capacity와 time capacity를 구분하지 않으면 설비별 capacity를 집계하거나 Routing.std_time_min과 결합할 때 단위 의미가 섞여 작업장 부하와 생산 가능 수량 판단의 신뢰도가 약해진다.
  - action: capacity_per_shift를 그대로 단일 숫자처럼 쓰지 말고 capacity_qty_per_shift와 available_time_min_per_shift처럼 의미별 속성으로 분리하거나, value·unit·capacity_kind 구조로 바꾸어 count capacity와 time capacity를 명시해야 한다. 이 정리는 capacity 기준 계약을 다음 단계에서 확정할 때 함께 처리되어야 하며, 그래야 집계와 부하 계산이 올바른 단위 의미를 따라간다.
- issue-013 (medium): AlternatePart는 primary_ref, alternate_ref, direction을 가진 일급 대체부품 레코드로 정의되어 있지만, relations 계약에서는 Part -> Part alternate_of 단축 관계만 제공되어 구조적으로 우회됩니다. 따라서 관계 그래프를 따르는 소비자는 AlternatePart와 그 방향 속성을 traversable한 구조로 사용할 수 없습니다.
  - root cause: The relations section models alternate substitution as a direct Part-to-Part shortcut while omitting relations from the AlternatePart entity to its referenced Part endpoints.
  - materiality: 이 온톨로지의 목적은 item, BOM, routing, change-management를 포괄하는 PLM/MES 통합 개념 기준을 제공하는 것입니다. 대체부품 교환과 검증은 통합 소비자가 관계 계약을 따라 레코드와 속성을 탐색할 수 있어야 실행 가능한데, 현재 구조에서는 AlternatePart가 존재해도 그 속성이 canonical relation path에 실리지 않아 대체부품 통합 기준의 사용성이 약해집니다.
  - action: relations 계약에 AlternatePart -> Part primary_part 및 AlternatePart -> Part alternate_part 같은 명시적 관계를 추가하거나 기존 shortcut을 이 구조로 대체해야 합니다. Part -> Part alternate_of는 필요할 경우 파생 projection으로만 유지하는 것이 적절합니다. 이렇게 해야 대체부품 레코드와 direction 속성이 first-class 구조로 교환, 검증, 확장될 수 있습니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-004: Deliberation은 broad issue scope를 수용했지만, evolution 렌즈는 특히 WorkCenter capacity_per_shift의 단위/기준 계약을 더 좁은 구현 우선순위로 보아야 한다는 강조를 남겼습니다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-007: narrowed
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-004: resolved
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: resolved
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리 기준을 제공하고 변경 적용성을 안정적으로 확장하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리 기준을 제공하는 목적. Source finding context: 품목·BOM·라우팅·변경관리 개념을 PLM/MES 통합 기준으로 안정적으로 확장하는 목적
- issue-007: PLM/MES 통합의 BOM 및 공정 개념 기준 문서로서 BOM 검증/생산 투입 생성의 기준을 제공하는 목적.
- issue-002: PLM 기준정보와 MES 생산 실행을 연결하는 개념 기준 제공.
- issue-003: 변경관리와 제조 운영 위험 중심의 PLM/MES 통합 기준.
- issue-004: BOM·라우팅 기준을 MES 계획/실행 계산에 사용할 수 있게 하는 통합 개념 기준.
- issue-005: PLM/MES 통합의 개념 기준 문서로서 BOM과 제조 운영 파라미터의 변경 연속성을 제공하는 목적.
- issue-006: PLM/MES 통합 기준에서 라우팅, 작업장, 생산능력 계산을 일관되게 확장하는 목적.
- issue-008: PLM/MES 통합의 개념 기준 문서로서 대체 부품 사용 가능성을 일관되게 해석하게 하는 목적.
- issue-009: 품목·BOM·라우팅·변경관리 개념을 PLM/MES 통합 기준으로 정합하게 정의하는 목적.
- issue-010: 라우팅과 검사 계획의 의미를 PLM/MES 통합에서 실행 가능한 개념 기준으로 구분하는 목적.
- issue-011: BOM과 라우팅/공정 개념의 의미 경계를 통합 기준 문서에서 분명히 하는 목적.
- issue-012: MES 생산능력과 라우팅 작업장 의미를 정확히 연결하는 PLM/MES 통합 기준 문서의 목적.
- issue-013: Use this BOM/routing ontology as a PLM/MES integration concept baseline covering item, BOM, routing, and change-management concepts.

## Final Review Result
13 material issue(s) require attention. Highest-priority issue: issue-001 (high) — BOM·Routing·Operation의 유효 버전과 ECO 적용 결과가 독립 개념으로 닫혀 있지 않아, ECO 전후 또는 특정 생산 조건 기준으로 어떤 제조 기준이 적용됐는지 안정적으로 재구성할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 제공된 경계 안에서는 scrap_rate의 실제 운영 계산식, 기준 기간, 적용 공정 정의를 확인할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-007 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
