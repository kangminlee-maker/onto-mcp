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
- issue-002 (high): Production change applicability is materially unreliable because the ontology cannot consistently answer which revision, BOM line, routing step, operation parameter, or inspection criterion applied to a production order at a given date.
  - root cause: The ontology localizes change applicability in Part current state and ECO effective_date instead of modeling effectivity/history as a shared dimension of BOM, routing, operation, and inspection-related production definitions.
  - materiality: This weakens the declared PLM/MES integration baseline because date-effective production definition is core to traceability, costing, quality investigation, rework, and change-control trust. When ECO.effective_date, delayed Part.rev synchronization, and unversioned BOM/routing/inspection definitions coexist, PLM and MES consumers can reach different answers for the same production date or order.
  - action: Model effectivity/history as a first-class production-definition concept spanning Part, BomLine, Routing, Operation, and inspection criteria. It should identify the target, effective interval or condition, supersession or old/new state, and effective ECO reference; Part.rev and Part.current_eco should become current views or projections rather than the production-application authority. Inspection criteria should also be separated from inspection execution steps so criteria changes are versioned without being confused with routing operation changes.
  - unresolved disagreement: Deliberation resolved the issue as high severity, but preserved narrower reservations: semantics directly proves the InspectionPlan separation facet rather than the full shared effectivity failure, and structure had insufficient lens-specific evidence for relation paths or attachment points.
- issue-001 (medium): Issue-001 should be kept as a material shared-root issue: the ontology does not provide a reusable governed operational-value contract for cross-system manufacturing values such as scrap_rate, UOM conversion, capacity_per_shift, standard time/cost, and ECO-related copied or reconciled values.
  - root cause: The ontology lacks a reusable source-authority and precedence contract for operational values, so cross-system values are left as ad hoc notes, copies, or manual reconciliations instead of governed integration concepts. / The integration baseline treats production quantity semantics as local attributes or field practice rather than canonical governed value contracts. / The ontology represents operational planning capacities as bare numbers without canonical unit/basis authority, forcing consumers to infer meaning from local practice. / The ontology omits a governed control/action layer for cross-system values, so approvals, copies, reconciliations, and authority precedence are only described as outcomes or notes.
  - materiality: This weakens the declared PLM/MES integration-baseline purpose because the ontology is supposed to reduce manufacturing operation risk and clarify cross-system precedence, quantity movement, capacity planning, and controlled change. Instead, core operational values remain governed by local notes, Excel copies, shop-floor conversion, manual standard-cost fields, or quarterly reconciliation, so production quantity, capacity, cost, and audit-trust differences can survive the integration baseline unchanged.
  - action: Close this before the next integration-design stage by adding a compact governed-value layer: SourceAuthority/SystemOfRecord with owner system, precedence, sync cadence, reconciliation policy, and conflict rule; QuantityBasis or ItemUomConversion with from/to UOM, factor, validity, basis, authority, and allowed use; a Capacity concept or explicit capacity_value, capacity_unit, capacity_basis, and shift_calendar_ref; and AuditEvent/ControlAction for approvals, copies, manual entries, reconciliations, and conversions. Apply these consistently to scrap_rate, std_time/cumulative time, standard-cost fields, Part.rev, current_eco, capacity_per_shift, UOM conversion, and ECO transitions so manual or shop-floor handling becomes an explicit exception state rather than the implicit integration rule.
- issue-003 (medium): 스크랩 재투입을 Assembly가 자기 자신을 하위 BOM 항목으로 포함하는 예외로 모델링한 것은 유지하면 안 된다. 이 이슈는 BOM 비순환성과 제품구조 의미를 약화하는 material issue이며, 스크랩 재투입은 BOM 구성관계가 아니라 공정/자재흐름 관계로 분리해 표현해야 한다.
  - root cause: 공정 재투입 현상을 BOM 구성관계 안에 예외로 압축해 표현함.
  - materiality: 검토 목적은 PLM/MES 통합 기준 문서로서 BOM 개념 정합성과 제조 운영 위험을 관리하는 것이다. 그런데 BOM 소비자는 BOM 폭발, 자재소요량 계산, 변경 영향 분석에서 비순환 제품구조를 전제로 삼기 쉽다. Assembly 자기 하위 포함 예외를 일반 BomLine처럼 허용하면 하나의 공정 예외 때문에 전체 BOM 계층 신뢰가 약해지고, 각 통합 소비자가 순환 예외를 별도로 해석해야 하므로 기준 문서의 목적과 가치가 훼손된다.
  - action: BOM 비순환 규칙은 예외 없이 유지하고, 스크랩 재투입은 별도 Rework, RecycledInput, ProcessYield relation 또는 Operation input/output 흐름으로 모델링해야 한다. 순서는 먼저 BOM 계층과 공정/자재흐름의 경계를 분리한 뒤, 재투입·수율·회수 같은 순환형 제조 현상을 그 별도 흐름 모델에 배치하는 것이다. 이렇게 해야 BOM 소비자는 계속 acyclic product-structure를 신뢰할 수 있고, 제조 운영 현상도 손실 없이 표현된다.
- issue-004 (medium): 스크랩 재투입을 BOM 자기 참조 예외로 표현한 현재 모델은 제품 구조 BOM의 비순환성 검증과 회수/재투입 공정 확장을 서로 충돌시킨다. issue-004는 별도 MaterialFlow 또는 Operation 입출력 개념 부재에서 시작되는 확장성 문제로 유지되어야 한다.
  - root cause: 공정 물류 흐름을 나타낼 별도 확장 개념이 없어 회수 공정을 BOM 자기 참조로 표현한다.
  - materiality: 선언된 목적은 BOM과 공정 라우팅을 통합 기준으로 삼아 제조 운영 변경을 안정적으로 수용하는 것이다. 그러나 재작업, 부산물 회수, 폐기 후 재투입 같은 순환처럼 보이는 흐름이 늘어날 때마다 BOM 비순환 규칙에 예외를 추가해야 하면, 핵심 무결성 규칙이 약해지고 제품 구조와 공정 물류 흐름이 한 관계 안에 섞여 변경 내성이 떨어진다.
  - action: 제품 구조 BOM은 비순환 구조로 유지하고, 스크랩·재생 투입·회수·재작업 흐름은 Routing/Operation 산출물 또는 MaterialFlow 같은 별도 개념으로 분리해야 한다. BomLine에는 정상 소요량만 두고, 공정 흐름 쪽에서 입력/출력, yield, recovery_rate를 표현하면 새 회수 유형을 BOM 순환 예외 없이 추가할 수 있다.
- issue-005 (medium): issue-005는 UOM과 변환 규칙을 독립적으로 관리하지 않고 Part.uom의 고정 enum 및 현장 환산 관행에 맡긴 문제가 맞습니다. 이 상태에서는 새 단위, 구매/생산 단위 병존, 품목별 환산 규칙이 추가될 때 PLM/MES 수량 의미를 안정적으로 유지하기 어렵습니다.
  - root cause: 단위와 변환 규칙이 확장 가능한 참조 데이터가 아니라 Part.uom enum 및 현장 환산 관행으로 표현되어 있다.
  - materiality: 영향받는 목적은 변경 후에도 품목과 BOM 수량 의미를 일관되게 유지하는 것입니다. 현재 모델은 단위 추가마다 스키마 enum을 바꿔야 하고, kg↔ea 같은 품목별 변환을 온톨로지 밖 수작업 판단에 맡기므로 BOM 전개, 소요량 계산, MES 생산오더 수량 해석이 같은 기준으로 이어진다고 보장할 수 없습니다.
  - action: UOM을 독립 마스터 개념으로 분리하고, Part별 기본 단위와 품목별 변환 계수, 유효기간, 수량 기준을 명시해야 합니다. BomLine.qty_per와 생산오더 수량도 해당 UOM 또는 quantity basis를 참조하도록 바꾸어야 하며, enum은 단위 자체가 아니라 category 수준으로 낮추는 편이 적절합니다. 이 작업은 downstream PLM/MES 통합 설계가 수량 의미에 의존하기 전에 닫아야 합니다.
- issue-006 (medium): Alternate-part substitution behavior is materially inconsistent because the ontology places direction semantics on AlternatePart while also exposing substitution through a Part-to-Part shortcut that can bypass that carrier entity. As a result, consumers do not have one authoritative structural representation for whether a substitution is one-way or bidirectional.
  - root cause: Alternate-part substitution is split between an entity that carries direction semantics and a Part-to-Part shortcut relation, leaving no single authoritative structural representation of substitution behavior.
  - materiality: This weakens the declared PLM/MES integration baseline because substitute-part direction is operationally significant for manufacturing execution, planning, and change control. If one consumer follows the symmetric AlternatePart definition while another follows the default one_way direction or the shortcut relation, downstream mappings can disagree on whether a substitute may be used in reverse.
  - action: Choose a single authority for substitution behavior before release. Either make AlternatePart inherently bidirectional and remove direction/one_way, or make it directional by default and state that symmetry applies only when direction=bidirectional. Then connect that authority into the structural graph with explicit AlternatePart-to-Part relations for primary and alternate parts, and either remove the Part-to-Part shortcut or mark it as a derived projection so it cannot override or bypass the carrier entity.
- issue-007 (medium): BomLine.scrap_rate is a material semantic-authority issue: the field is modeled on a BOM line as though it were part of stable BOM structure, while its note says it is a process-defect factor copied from a separately managed production-planning Excel source.
  - root cause: BomLine.scrap_rate has no settled semantic authority among BOM structure, process scrap/yield, and an external production-planning Excel copy.
  - materiality: This weakens the PLM/MES integration baseline because the baseline is supposed to keep BOM and process calculation semantics consistent. If material requirements, production-order quantities, or costing use both BOM quantity and scrap adjustment, PLM, MES, and production planning may calculate from different meanings or versions of the same scrap value.
  - action: Decide the semantic home of scrap_rate before the next stage: keep it as BOM structure only if it is truly a stable BOM value, move it to routing/process yield if it is a process parameter, or model it as an external planning reference if Excel remains authoritative. If the external source remains authoritative, BomLine should carry source reference, scope, and validity instead of treating the copied value as canonical. This issue should remain visible as a focused dependency of the broader issue-001 authority/audit gap.
- issue-008 (medium): AlternatePart는 정의상 상호 대체 가능한 양방향 관계처럼 설명되지만 direction 속성은 기본값 one_way를 허용하므로, 같은 인스턴스가 양방향 호환인지 단방향 대체 승인인지 일관되게 해석되지 않는다.
  - root cause: 상호 호환 대체와 방향성 있는 대체 승인이라는 서로 다른 의미를 AlternatePart 하나에 섞었다.
  - materiality: 이 충돌은 품목 대체 개념을 PLM/MES 통합 기준으로 일관되게 해석하게 하는 목적을 약화한다. 대체품 승인이나 생산 투입 가능 여부 판단에서 한 시스템은 정의를 따라 양방향으로 보고 다른 시스템은 direction 기본값을 따라 단방향으로 보면, 승인되지 않은 역방향 투입이 허용되거나 허용되어야 할 대체 투입이 차단될 수 있다.
  - action: 대상에서 이 문제는 바로 닫아야 한다. 선택지는 AlternatePart를 PartSubstitution 같은 방향성 있는 대체 승인 개념으로 재정의하거나, AlternatePart를 진짜 상호 호환 관계로 유지하려면 direction을 제거하고 양방향 의미만 허용하는 것이다. 두 의미가 모두 필요하면 단방향 SubstitutionRule과 양방향 InterchangeablePart를 분리하고, 이후 relation graph도 선택된 방향 의미를 우회하지 않고 보존하도록 맞춰야 한다.
- issue-009 (medium): WorkCenter.capacity_per_shift는 작업장별로 개수/교대와 시간/교대라는 다른 측정 차원을 같은 숫자 속성에 담을 수 있어, MES 라우팅과 작업장 능력 계산의 기준 속성으로 쓰기에는 의미가 불안정하다.
  - root cause: 작업장 처리 능력의 측정 차원과 단위가 capacity_per_shift 속성 의미에 포함되지 않았다.
  - materiality: 이 이슈는 생산 가능량, 병목, 부하 계산에서 같은 capacity_per_shift 값을 서로 비교하거나 합산할 때 물리적으로 다른 값이 섞일 수 있기 때문에 물질적이다. 해당 온톨로지의 목적은 MES 라우팅과 작업장 능력 기준을 통합 운영 계산에 일관되게 제공하는 것인데, 속성의 단위와 측정 기준이 명시되지 않으면 동일 필드의 숫자가 작업장마다 다른 의미를 가져 계획 계산의 정확성을 약화한다.
  - action: capacity_per_shift에 명시적인 단위 또는 capacity_type을 추가하거나, 더 안전하게는 unit_capacity_per_shift와 available_time_per_shift_min처럼 개수 기반 능력과 시간 기반 가용 능력을 별도 속성으로 분리해야 한다. 가능한 경우 Operation.std_time_min과 직접 호환되는 시간 기반 기준 단위를 정해 라우팅 계산, 부하 산정, 병목 판단이 같은 측정 기준 위에서 실행되도록 해야 한다. 이 문제는 downstream 운영 계산 전에 닫아야 하는 fix-now 항목이다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-002: Deliberation resolved the issue as high severity, but preserved narrower reservations: semantics directly proves the InspectionPlan separation facet rather than the full shared effectivity failure, and structure had insufficient lens-specific evidence for relation paths or attachment points.

## Deliberation Decision
- issue-002: resolved
- issue-001: resolved
- issue-003: narrowed
- issue-004: resolved
- issue-005: resolved
- issue-006: no-deliberation-needed
- issue-007: resolved
- issue-008: resolved
- issue-009: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-002: PLM/MES integration concept baseline for item, BOM, routing, inspection, and change-management alignment across production dates. Source finding context: PLM/MES 통합 기준 문서로서 변경관리 개념의 정합성과 생산 적용 위험을 줄이는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리 개념의 변경 연속성을 제공하는 목적 Source finding context: PLM/MES integration concept baseline for item, BOM, routing, and change-management alignment. Source finding context: 라우팅·공정·검사 개념을 PLM/MES 통합 기준으로 정확히 구분하는 목적.
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅 개념 정합성과 제조 운영 위험을 관리하는 목적. / PLM/MES integration concept baseline for cross-system precedence and operational trust. / BOM/routing ontology as a PLM/MES integration baseline for production quantities and material movement. / 라우팅과 WorkCenter를 MES 운영 기준으로 확장 가능하게 유지하는 목적 / Manufacturing operation risk review for PLM/MES integration, especially controlled change and manually maintained operational values.
- issue-003: PLM/MES 통합 기준 문서로서 BOM 개념 정합성과 제조 운영 위험을 관리하는 목적.
- issue-004: BOM과 공정 라우팅을 통합 기준으로 삼아 제조 운영 변경을 안정적으로 수용하는 목적
- issue-005: PLM/MES 통합 기준에서 품목과 BOM 수량 의미를 변경 후에도 일관되게 유지하는 목적
- issue-006: PLM/MES integration concept baseline for item substitution and alternate-part behavior. / The ontology is declared as a PLM/MES integration concept baseline for parts, BOM, process, routing, and change concepts.
- issue-007: PLM/MES integration concept baseline for consistent BOM and process calculation semantics. Source finding context: PLM/MES 통합의 개념 기준 문서로서 BOM과 공정 기준값의 의미를 일관되게 제공하는 목적.
- issue-008: 품목 대체 개념을 PLM/MES 통합 기준으로 일관되게 해석하게 하는 목적.
- issue-009: MES 라우팅과 작업장 능력 기준을 통합 운영 계산에 일관되게 제공하는 목적.

## Final Review Result
9 material issue(s) require attention. Highest-priority issue: issue-002 (high) — Production change applicability is materially unreliable because the ontology cannot consistently answer which revision, BOM line, routing step, operation parameter, or inspection criterion applied to a production order at a given date. Unresolved disagreement remains: Deliberation resolved the issue as high severity, but preserved narrower reservations: semantics directly proves the InspectionPlan separation facet rather than the full shared effectivity failure, and structure had insufficient lens-specific evidence for relation paths or attachment points.

## Boundary Notes
- 경계 내에는 실제 BOM 소비 알고리즘이 없으므로 런타임 장애가 아니라 통합 기준으로 채택될 때의 BOM 무결성 및 목적 정렬 위험으로 한정한다.

## Immediate Actions Required
- issue-002 (high): fix_now
- issue-001 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
