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
- issue-001 (high): ECO effectivity, Part revision, and BOM/routing operating values must be treated as production-effective baseline records, not as delayed current attributes. As modeled, a production date can fall between an effective ECO and the synchronized Part.rev or BOM/routing current values, leaving the governing revision or baseline ambiguous.
  - root cause: Time-varying production truth is represented as current scalar attributes and date notes rather than immutable effectivity/version baselines that production orders can reference.
  - materiality: This is material because the target is a PLM/MES integration concept baseline for part, BOM, routing, and change-management decisions. If MES, quality, costing, or audit consumers cannot determine the revision, BOM quantities, scrap rate, standard time, or capacity that governed a specific production date, downstream decisions can appear compliant while using stale or unreconstructable production truth.
  - action: Introduce explicit Effectivity and BOM/routing baseline or revision concepts that bind ECO status, effective dates, target revision, affected BOM/routing records, and production-order selection to immutable records. Production order creation should reference or snapshot the applicable baseline, and release should be blocked or resolved by a deterministic rule when ECO effectivity and delayed Part.rev synchronization disagree.
- issue-007 (high): BOM traversal and validation are materially unsafe because the ontology does not define one canonical BOM graph. It both requires BOM acyclicity and allows Assembly self-inclusion for recycled material recovery, while BomLine.parent_ref is not explicitly closed into the relation graph used for traversal.
  - root cause: The BOM graph contract is under-specified, mixing semantic exceptions and relation/attribute projections without one canonical graph for validation.
  - materiality: This weakens the PLM/MES integration baseline because BOM validation, requirements explosion, production-order expansion, costing, parent-path traversal, and ECO impact analysis all depend on a shared definition of the valid BOM graph. If implementations choose different graph authorities or treat recovery self-inclusion differently, the same model can produce incompatible validation and operational outcomes.
  - action: Fix this before the next stage by separating ordinary BOM parent-child edges from recovery/rework flows, keeping ordinary BOM validation acyclic, and modeling scrap return through a distinct relation or explicit exception type excluded from BOM cycle checks. Also explicitly map parent_ref and child_ref into the canonical relation graph, including which side is authoritative, so traversal, cycle validation, and impact analysis use one declared graph.
- issue-002 (medium): 이 이슈는 온톨로지가 복사·수기 입력·현장 변환 값과 release/applied 이후의 기준정보 상태를 운영상 유효한 것처럼 수용하면서도, 그 값과 상태의 권위·대사·감사 증거·전이 유효성을 명시하지 않는다는 문제입니다.
  - root cause: Operational authority, control evidence, and lifecycle transitions are recorded as notes or terminal statuses instead of governed source-of-truth, audit-event, and state concepts.
  - materiality: PLM/MES 통합 기준은 계획, 원가, 생산 실행, 감사 판단에서 어떤 값과 상태를 믿어야 하는지 정해야 합니다. 그런데 scrap_rate, 표준시간, UOM 변환, 승인·release·적용 상태, 단종·대체·보관 상태가 명확한 권위와 검증 규칙 없이 남아 있어 서로 다른 시스템이나 현장 관행이 다른 값을 써도 문서상 허용된 것처럼 보일 수 있습니다.
  - action: 운영 값과 상태를 즉시 고쳐야 할 root 개념으로 다루어야 합니다. 각 operational value에는 canonical source, 허용 projection/copy, refresh cadence, reconciliation owner, precedence, validation, invalid-input behavior를 정의하고, ApprovalRecord 또는 AuditEvent 같은 공통 증거 개념으로 승인·적용·release·수동 반영을 추적해야 합니다. 또한 Part/BOM/Routing/ECO별 lifecycle 상태를 분리해 active, on_hold, superseded, obsolete/discontinued, archived 및 ECO 정정·취소·재발행 관계를 정의해야 이후 계획·원가·MES 생산 가능 여부 판단이 같은 기준을 공유할 수 있습니다.
- issue-003 (medium): WorkCenter.capacity_per_shift is material because it is a single numeric value without explicit unit or basis, so work-center capacity cannot be consistently compared or scheduled across routing contexts from the ontology alone.
  - root cause: Capacity is represented as one numeric attribute while its measurement basis is allowed to vary by work center.
  - materiality: The declared purpose is a PLM/MES routing and manufacturing-operation concept baseline. Capacity is a production-planning input, and leaving its unit implicit means one work center may express capacity as count while another expresses it as time. That makes bottleneck analysis, routing comparison, and schedule feasibility depend on local interpretation outside the shared ontology, weakening trust even when the current schema is satisfied.
  - action: Split capacity into explicit fields such as capacity_value, capacity_uom, and capacity_basis, and add compatibility rules that connect operation units to work-center capacity basis. If multiple capacity dimensions are required, model them as typed capacity records instead of forcing different meanings into one unitless number. This should be carried forward with the broader capacity-contract work because it is a narrower symptom of that same capacity-dimension problem.
- issue-004 (medium): ProductionOrder 또는 WorkOrder가 모델에 없어서, 생산오더 생성 규칙은 존재하지만 released BOM/routing 기준정보가 실제 MES 실행과 추적 기록으로 이어지는 개념 연결이 닫히지 않습니다.
  - root cause: The ontology references production-order creation rules without modeling the MES execution object that consumes released BOM/routing baselines.
  - materiality: 이 온톨로지의 목적은 설계·기준정보와 제조 실행 객체 사이의 공통 의미를 제공하는 PLM/MES 통합 기준을 세우는 것입니다. 생산오더가 개념으로 정의되지 않으면 통합 범위가 기준정보 전달에서 멈추고, 실제 생산된 내용과 기준 BOM·라우팅을 비교하는 운영 리스크 분석, 추적성, 생산 기준 검증이 모델 밖으로 밀립니다.
  - action: ProductionOrder 또는 WorkOrder 실행 객체를 추가하고 selected part, BOM/routing baseline, order quantity, planned schedule, status, execution records를 참조하도록 정의해야 합니다. 필요하면 OperationExecution, MaterialConsumption, Lot/SerialTrace, AsBuiltBomLine을 하위 개념으로 분리해 기준정보와 실제 실행 실적의 연결을 명시해야 하며, 이는 다음 단계 전에 닫아야 하는 completeness 문제입니다.
- issue-005 (medium): UOM이 `ea`, `kg`, `m` 같은 고정 enum과 현장 수작업 환산에 묶여 있어, 새 단위나 품목별 환산 규칙이 생기면 BOM과 MES 수량 의미를 안정적으로 이어 해석하기 어렵습니다.
  - root cause: Units are modeled as a fixed enum while item-specific conversion authority remains outside the ontology.
  - materiality: 이 이슈는 PLM/MES 통합 기준이 품목 수량, BOM 소요량, 생산계획, 실적 수량을 같은 의미 체계로 확장해야 한다는 목적을 약화합니다. 단위 확장이나 품목별 환산이 필요할 때 온톨로지 안에 참조 가능한 단위·환산 기준이 없으면 기존 BOM/MES 수량의 의미 연속성이 깨지고, 소요량·계획·실적 집계 간 수량 불일치가 통합 리스크로 이어질 수 있습니다.
  - action: `Uom`과 `UnitConversion`을 관리되는 기준 개념으로 분리하고, `Part`에는 기본 관리 단위와 필요 시 구매·생산·재고 단위를 참조하게 해야 합니다. 또한 `BomLine.qty_per` 같은 수량 보유 필드에는 해당 수량 단위 또는 부모/자식 단위 변환 기준을 명시해야 합니다. 이렇게 해야 새 단위나 품목별 환산이 추가되어도 enum 수정과 현장 판단에 의존하지 않고, BOM/MES 수량 의미를 온톨로지 안의 기준으로 유지할 수 있습니다.
- issue-006 (medium): AlternatePart는 대체 관계를 한편으로는 항상 대칭이라고 정의하면서, 다른 한편으로는 one_way 방향 값을 허용하고 Part-to-Part alternate_of 단축 관계도 노출합니다. 그 결과 단방향 또는 조건부 대체가 추가될 때 어떤 표현이 권위 있는 의미인지 안정적으로 판단할 수 없습니다.
  - root cause: AlternatePart directionality is split between a symmetric definition, a direction enum, and a shortcut relation instead of one authoritative relationship contract.
  - materiality: 이 문제는 PLM/MES 통합 기준에서 자재 대체, 결품 대응, 생산 가능 여부를 일관되게 판단해야 하는 목적을 약화합니다. 소비자가 alternate_of를 조건 없는 대칭 관계로 해석하면 실제로는 역방향 대체나 승인되지 않은 대체가 금지되어야 하는 경우에도 허용될 수 있어 생산, 구매, 품질 판단의 신뢰가 떨어집니다.
  - action: 권위 있는 대체품 관계 계약을 AlternatePart 중심으로 정규화해야 합니다. 항상 대칭 관계라면 direction과 one_way 값을 제거하거나 bidirectional로 고정하고, 단방향 대체를 지원해야 한다면 정의를 direction에 따라 단방향 또는 양방향일 수 있도록 바꾸며 bidirectional일 때만 역방향 대체가 성립한다고 분리해야 합니다. alternate_of는 방향과 조건을 보존하는 명시적 파생 뷰로 제한하거나, 정보 손실을 피할 수 없으면 제거해야 합니다.
  - unresolved disagreement: Deliberation은 issue-006을 broader clustered contract defect로 resolved 처리했지만, coverage는 AlternatePart 관련 lens-specific evidence가 부족하다고 보았고 structure는 shortcut/projection-loss facet만 지지하며 대칭 정의와 direction enum 충돌 전체를 독립적으로 입증하지는 못한다고 좁혔습니다.
- issue-008 (medium): AlternatePart는 정의에서 대체 관계를 항상 양방향으로 설명하지만, direction 속성은 one_way를 허용하고 기본값도 one_way로 둔다. 따라서 같은 대체 관계가 정의 기준으로는 상호 대체, 속성 기준으로는 단방향 대체로 해석될 수 있어 의미 계약이 불일치한다.
  - root cause: AlternatePart assigns incompatible symmetry semantics through its definition and direction attribute.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 품목, BOM 변경, 대체품 의미의 기준으로 쓰이는 목적을 가진다. 대체 가능성은 MES, 구매, 생산 계획에서 실제 투입 품목을 판단하는 계약이므로, 단방향 대체를 양방향으로 오해하면 허용되지 않은 역방향 대체가 사용되어 품목 적합성, 품질 승인, 변경 적용 기준에 대한 신뢰를 약화시킨다.
  - action: AlternatePart 정의를 direction-aware하게 고쳐 one_way일 때는 한 방향 대체, bidirectional일 때만 상호 대체라고 명시해야 한다. 반대로 도메인 의도가 항상 상호 대체라면 direction 값에서 one_way와 기본 one_way 계약을 제거해야 한다. 이 조치는 issue-006의 더 넓은 alternate-part 계약 정규화와 함께 처리되는 후속 작업으로 유지된다.
- issue-009 (medium): InspectionPlan은 routable Operation과 동일한 실행 단계로 취급되지 않도록 분리되거나 명시적으로 제약되어야 한다. 현재 모델은 검사 기준/파라미터 기록이 Operation 의미를 상속하거나 충족할 수 있어, 검사 계획 문서와 라우팅 실행 단계의 역할을 혼동시킨다.
  - root cause: Inspection criteria and execution steps are compressed into one inheritance hierarchy instead of separated into governed quality-plan artifacts and routable operations.
  - materiality: 이 문제는 라우팅·공정·검사 계획 의미를 PLM/MES 통합 기준으로 맞추려는 목적을 약화한다. InspectionPlan이 Routing.operations의 Operation처럼 해석되거나 Operation의 work_center/std_time_min 기대를 받으면, 품질 기준 문서가 스케줄링 가능한 공정 단계처럼 처리되어 라우팅 순서, 작업장 배정, 표준시간 해석, 검사 기준 적용의 의미가 흐려진다.
  - action: InspectionPlan을 Operation에서 분리하고, 검사 실행이 필요하면 별도의 InspectionOperation 또는 Operation subtype을 두어 그 실행 단계가 InspectionPlan이나 품질 기준 엔티티를 명시적으로 참조하게 해야 한다. deliberation은 무조건적인 상속 제거 자체보다, criteria record가 routable-step semantics, work-center obligation, standard-time expectation을 상속하거나 만족하지 못하게 하는 제약이 핵심이라고 좁혔다. 따라서 다음 단계 전에 분리 또는 명시 제약 중 하나를 결정하고 모델 계약에 반영해야 한다.
- issue-010 (medium): WorkCenter.capacity_per_shift is a material semantic defect because it can represent either count per shift or time per shift, so it cannot serve as one safe capacity calculation contract.
  - root cause: WorkCenter capacity mixes different measurement dimensions under one numeric attribute.
  - materiality: The declared purpose is MES routing and work-center capacity semantic consistency. That purpose is weakened because scheduling, bottleneck, production-quantity, and order-feasibility judgments may compare, aggregate, or combine capacity_per_shift values that do not share the same measurement dimension, especially when combined with Operation.std_time_min.
  - action: Fix this before the next stage by splitting capacity into dimension-specific attributes such as capacity_quantity_per_shift and available_time_min_per_shift, or by pairing a capacity value with explicit unit of measure and capacity basis metadata. The remedy must make the measurement dimension and calculation basis explicit before routing capacity, load, or feasibility logic depends on the field.
- issue-011 (medium): Part.current_eco가 최신 설계변경 포인터와 생산일자 기준 유효 ECO/revision 권한을 구분하지 않아, PLM/MES 통합에서 생산 적용 기준을 안정적으로 판단하기 어렵다.
  - root cause: The model conflates latest ECO pointers with production-effective ECO or revision authority.
  - materiality: 이 이슈는 변경관리와 생산 적용 기준을 정합화하려는 목적을 직접 약화한다. 최신 ECO, 승인된 ECO, applied 상태의 ECO, 특정 생산일자에 유효한 ECO는 서로 다른 의미인데 current_eco 하나로 읽히면 effective_date, status, revision 선택 기준이 충돌할 수 있다. 특히 최신 변경과 실제 생산 적용 시점 또는 Part.rev 동기화 시점이 어긋나는 기간에는 생산 오더가 잘못된 rev 기준을 따를 위험이 있다.
  - action: current_eco를 latest_eco_ref처럼 최신 변경 참조로 명확히 제한하거나, 별도의 production_effective_eco 또는 effective_rev_by_date 같은 생산일자 기준 effectivity 개념을 추가해야 한다. 이때 ECO.status와 effective_date가 어떤 조건에서 생산 적용 권한을 갖는지도 함께 명시해야 한다. coverage 렌즈는 이를 missing production-effective baseline/effectivity concept 쪽으로 좁혀 지지했으므로, 후속 조치는 issue-001의 effectivity/baseline 분리와 정렬해 수행하는 것이 좋다.
- issue-012 (medium): AlternatePart.direction is materially disconnected from the canonical relations view because alternate_of is exposed as a direct Part-to-Part shortcut instead of the Part -> AlternatePart -> Part relationship entity that owns direction.
  - root cause: The relations graph exposes a Part-to-Part alternate shortcut without preserving the authoritative AlternatePart relationship entity's attributes.
  - materiality: This weakens the PLM/MES integration baseline because graph-based mapping or validation can read substitute-part relationships without the one-way or bidirectional constraint. That can let MES material input, purchasing alternatives, or change-impact analysis treat a disallowed or one-way substitution as a normal unrestricted substitute relationship.
  - action: Make Part -> AlternatePart -> Part the canonical relation structure by adding relations such as Part has_many AlternatePart, AlternatePart references_primary Part, and AlternatePart references_alternate Part, with direction required on AlternatePart. Any alternate_of Part-to-Part shortcut should be removed or explicitly marked as a derived view that preserves direction and future condition attributes, preferably while resolving the broader alternate-part contract dependency shared with issue-006.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-006: Deliberation은 issue-006을 broader clustered contract defect로 resolved 처리했지만, coverage는 AlternatePart 관련 lens-specific evidence가 부족하다고 보았고 structure는 shortcut/projection-loss facet만 지지하며 대칭 정의와 direction enum 충돌 전체를 독립적으로 입증하지는 못한다고 좁혔습니다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: resolved
- issue-008: no-deliberation-needed
- issue-009: narrowed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES integration concept baseline for part, BOM, routing, and change-management decisions. Source finding context: PLM/MES 통합의 개념 기준 문서로서 ECO 적용 시점과 생산 기준 BOM·라우팅을 일관되게 해석하는 목적. Source finding context: 변경관리 개념을 PLM/MES 생산 실행 기준으로 안정적으로 확장하는 목적
- issue-007: PLM/MES integration concept baseline for BOM integrity, path traversal, cycle validation, and change-impact analysis. Source finding context: PLM/MES 통합의 개념 기준 문서로서 BOM 무결성 규칙과 제조 운영 기준을 제공하는 목적. Source finding context: PLM/MES 통합 기준에서 BOM 상하위 경로, 순환 검증, 변경 영향 범위를 안정적으로 계산하는 목적.
- issue-002: PLM/MES integration concept baseline with review focus on manufacturing operations risk, precedence, scope control, and invalid-input behavior. Source finding context: PLM/MES integration concept baseline with review focus on manufacturing operations risk and invalid-input behavior. Source finding context: PLM/MES 통합 기준에서 변경관리, 라우팅 release, 수동 반영 값의 운영 통제를 추적 가능하게 만드는 목적. Source finding context: 품목·BOM·라우팅·변경관리 개념의 정합성과 제조 운영 위험을 검토하는 목적, 특히 상태 있는 기준정보의 전 lifecycle 표현.
- issue-003: PLM/MES routing and manufacturing operation concept baseline.
- issue-004: PLM/MES integration concept baseline for shared meaning between design/master data and manufacturing execution. Source finding context: PLM/MES 통합의 개념 기준 문서로서 설계·기준정보와 제조 실행 객체 사이의 공통 의미를 제공하는 목적.
- issue-005: PLM/MES integration concept baseline for consistently extending item and BOM quantity semantics. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목과 BOM 수량 의미를 일관되게 확장하는 목적
- issue-006: PLM/MES integration baseline for consistent material substitution, shortage response, and production eligibility decisions. Source finding context: 품목 대체 관계를 PLM/MES 통합 기준에서 조건부로 확장 가능한 개념으로 유지하는 목적 Source finding context: PLM/MES 통합 기준에서 대체 부품 관계의 허용 방향과 적용 조건을 일관되게 정의하는 목적.
- issue-008: PLM/MES integration concept baseline for item, BOM-change, and substitute-part meaning. Source finding context: PLM/MES 통합의 품목·BOM 변경 및 대체품 개념 기준 문서
- issue-009: PLM/MES integration baseline for routing, operation, and inspection-plan semantics. Source finding context: 라우팅·공정·검사 계획 개념을 PLM/MES 통합 기준으로 맞추는 목적
- issue-010: MES routing and work-center capacity semantic consistency. Source finding context: MES 공정 라우팅과 작업장 능력 기준의 의미 정합성
- issue-011: PLM/MES integration baseline for change management and production application criteria. Source finding context: 변경관리와 생산 적용 기준을 PLM/MES 통합 개념으로 정합화하는 목적
- issue-012: PLM/MES integration baseline for consistently mapping and validating substitute-part relationships. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목 대체 관계를 일관되게 매핑하고 검증하는 목적.

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO effectivity, Part revision, and BOM/routing operating values must be treated as production-effective baseline records, not as delayed current attributes. As modeled, a production date can fall between an effective ECO and the synchronized Part.rev or BOM/routing current values, leaving the governing revision or baseline ambiguous. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- The file-level evidence does not state a scheduling algorithm, so the impact is bounded to concept-baseline ambiguity rather than a proven runtime scheduling failure.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-007 (high): fix_before_release, fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): follow_up
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): follow_up
- issue-006 (medium): fix_before_release, accept_risk
- issue-008 (medium): follow_up
- issue-009 (medium): fix_before_release, accept_risk
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): follow_up
- issue-012 (medium): follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
