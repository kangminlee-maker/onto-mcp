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
- issue-001 (high): Operational quantity semantics for scrap, yield, and item-specific UOM conversion are not governed inside the PLM/MES integration baseline, so systems can appear conformant while calculating production quantities differently.
  - root cause: The ontology treats operationally critical quantity data as attributes while leaving scrap/yield authority and UOM conversion governance outside the PLM/MES concept baseline.
  - materiality: This is material because the declared purpose is an integration concept standard for PLM/MES operating risk, not just a vocabulary. BOM explosion, planning, costing, inventory consumption, and MES order generation depend on stable quantity meaning; copied scrap values and local UOM conversions weaken cross-system trust.
  - action: Add authoritative concepts for scrap/yield and item-specific UOM conversion, including source ownership, unit basis, effective scope/date, and which system consumes or owns each value. Copied spreadsheet values and ad hoc shop-floor conversions should be removed from the canonical ontology or demoted to non-authoritative migration notes before the ontology is used as an integration standard.
- issue-002 (high): ECO effectivity can become production-authoritative before the Part.rev value exposed to MES and other integrated systems is updated, creating a hidden transition window where systems may identify the old revision while the ontology says production should follow the new revision.
  - root cause: The ontology separates ECO effectivity authority from part revision synchronization without modeling the precedence and transition state as a controlled integration concept.
  - materiality: This weakens the declared PLM/MES integration purpose because change effectivity determines what production is allowed to build. If the shared baseline permits stale revision identity during an effective ECO window, downstream execution can manufacture the wrong revision or lose trustworthy revision traceability.
  - action: Model ECO effectivity and revision applicability as first-class versioned or effective-dated relationships, and require released production orders to resolve the applicable revision from ECO state plus effectivity rather than from a potentially stale Part.rev copy. The source-of-truth precedence for the transition window must be explicit before the next integration stage.
- issue-003 (high): BOM, routing, ECO, lifecycle state, and production-history concepts need an explicit as-of revision/effectivity model. As written, the ontology collapses change-controlled manufacturing state into current fields and narrow status enums, so it cannot reliably answer which BOM, routing, revision, or lifecycle state governed a production order at a given time.
  - root cause: The ontology lacks an as-of revision/effectivity model that binds BOM, routing, ECO, lifecycle state, and production history to valid intervals or applicability conditions.
  - materiality: This materially weakens the declared PLM/MES integration purpose because that purpose depends on a shared operational baseline for BOM, routing, and change-management decisions. In ECO cutover, weekly Part.rev synchronization delay, phased or parallel ECOs, canceled or corrected ECOs, and historical production-order tracebacks, MES orders, PLM drawing revisions, costing, timing, and quality traceability may resolve against different current values instead of the governed as-of state.
  - action: Fix this before release by introducing revisioned/effective-dated artifact concepts for Part revisions, BOM, Routing, Operation/InspectionPlan, and ECO applicability. Add valid_from/valid_to or equivalent applicability conditions, explicit links to applicable revisions and ECOs, terminal/correction lifecycle states, and authority rules for as-of resolution; production orders should reference the resolved revision/effectivity snapshot created at order time.
- issue-004 (medium): Approval, manual input, and shop-floor unit conversion are modeled only as resulting states, values, or notes, so the ontology lacks first-class evidence of who performed or approved controlled changes, when, from what source, and with what rationale.
  - root cause: Controlled operational changes are represented as states or notes without first-class action evidence for actor, time, rationale, source, and before/after values.
  - materiality: This weakens the declared PLM/MES integration purpose because approvals, inspection criteria changes, standard-time manual entries, and shop-floor conversions can affect production, quality, cost, and time decisions. Without traceable actor, timestamp, source/version, rationale, and before/after value evidence, later audits or root-cause analysis cannot determine accountability or whether a controlled value should be trusted.
  - action: Add first-class evidence concepts such as ApprovalRecord, ManualOverride or Adjustment, ConversionEvent, or a shared SourceEvidence pattern, then connect them to the affected controlled actions and fields. The model should capture actor, timestamp, source document/version, rationale, affected_field, previous_value, and new_value so audit and root-cause traceability are available before downstream governance, quality, or costing decisions rely on those values.
- issue-005 (medium): Unit conversion and source authority are material gaps: the ontology treats units as fixed enum values and leaves item-specific conversion practice outside the model, so new units or cross-system quantity exchange can require schema edits, external correction, or local interpretation.
  - root cause: The unit system is modeled as a fixed enum plus unmapped field practice rather than an extensible UnitOfMeasure and conversion authority model.
  - materiality: This weakens the declared PLM/MES integration purpose because BOM quantities, production capacity, planning, inventory, and costing depend on the same quantity being interpreted consistently. When kg↔ea, new units, or item-specific conversions appear, the model cannot provide a shared authoritative basis, so systems or sites may calculate the same quantity differently and the integration baseline loses change tolerance.
  - action: Replace fixed UOM-only modeling with first-class UnitOfMeasure plus UomConversion or ItemUomConversion concepts. The conversion concept should carry source_uom, target_uom, factor, effective validity, owning system, and approval/source evidence, and BOM, production, inventory, and WorkCenter capacity quantities should reference explicit units and applicable conversion authority. This should be closed before the next stage because later quantity, capacity, planning, and cost semantics depend on it.
- issue-006 (medium): WorkCenter capacity is materially under-specified because `capacity_per_shift` is a single numeric field whose unit may mean either count or time depending on the work center. That makes released routing capacity ambiguous for production-order creation, scheduling, load calculation, and MES interpretation.
  - root cause: Production-order-relevant routing capacity is not modeled with explicit comparable capacity measures separating value, unit/dimension, basis period, and capacity type.
  - materiality: The declared purpose is a PLM/MES routing and manufacturing operation concept baseline, with emphasis on routing consistency and operating risk. That purpose requires capacity values to be comparable enough for planning and scheduling. If conforming consumers can read the same numeric field as either pieces per shift or time per shift, the ontology permits operationally incompatible interpretations while still appearing valid, weakening its actionability as an integration baseline.
  - action: Split WorkCenter capacity into explicit typed measures, or introduce a `CapacityMeasure` structure, with value, unit, basis period, capacity type or dimension, source/effectivity, and conversion or comparability rules. Released routing validation should require operation time and work-center capacity to be comparable before production-order creation or scheduling use. This should be fixed before relying on released routing data operationally; otherwise every downstream consumer must invent its own interpretation rules.
- issue-007 (medium): The issue is material: the BOM acyclicity invariant contradicts the stated scrap re-input modeling case, so the ontology cannot give a consistent validation rule for that case.
  - root cause: The same integrity rule uses the BOM parent-child graph for both product structure and scrap re-input process flow without separating their invariants.
  - materiality: The declared purpose is to use the ontology as a PLM/MES concept baseline for BOM and routing validation. That purpose is weakened because the same self-referential scrap re-input BOM can be interpreted as invalid under mandatory acyclicity and valid as the stated representation of scrap re-input, leaving validators and integrations without a stable decision rule at the BOM/MES boundary.
  - action: Separate normal product BOM acyclicity from scrap/rework flow modeling. The preferred fix is to keep the product BOM graph strictly acyclic and model scrap re-input through a distinct process or recovery relation; alternatively, define a separate graph scope where self-reference is explicitly allowed and excluded from the BOM acyclicity invariant. The separation must come before reliable validation rules can be written for PLM/MES integrations.
- issue-008 (medium): AlternatePart currently mixes two different meanings: reciprocal interchangeability and directional substitution/supersession. Because alternate_of can hide direction while AlternatePart defaults to one_way, consumers can reasonably apply substitution rules in the wrong direction.
  - root cause: The ontology assigns one concept name, AlternatePart/alternate_of, to both symmetric alternates and directional substitution relationships.
  - materiality: This weakens the PLM/MES item/BOM/change baseline because production planning, procurement substitution, and change-control workflows depend on knowing whether a part may replace another bidirectionally or only in one approved direction. Ambiguous direction semantics make the ontology unreliable for integration consumers.
  - action: Split symmetric interchangeability from directional substitution/supersession, or redefine AlternatePart as explicitly directional and require any alternate_of projection to preserve direction semantics. This should be closed before the next integration stage because consumers need the concept distinction before relying on substitution behavior.
- issue-009 (medium): InspectionPlan should not be modeled as an Operation subtype unless it specifically represents an executable inspection step. As currently framed, it describes a quality plan or specification while inheriting from an executable routing-step concept.
  - root cause: The ontology uses subtype inheritance where a reference or extension relation would better preserve the plan-versus-operation type distinction.
  - materiality: This is material because the declared purpose is a concept baseline for routing and manufacturing operation semantics in PLM/MES integration. If a quality inspection specification is typed as an executable operation, MES and routing consumers may schedule or map plan records as work steps, or require operation-only fields on records that are really inspection specifications.
  - action: Model inspection as an Operation subtype only when the entity is the executable inspection step. Otherwise, keep InspectionPlan as a separate specification entity and relate it to an inspection Operation by reference or extension, so routing execution remains distinct from quality-plan criteria such as sampling rules and acceptance criteria.
- issue-010 (medium): The issue is material: `manufactured_by` is modeled from the broad `Part` concept to `Routing`, even though `Part` includes purchased as well as manufactured items. This makes purchased parts appear eligible for manufacturing routing semantics unless the ontology adds a manufactured-part scope or applicability condition.
  - root cause: The ontology places manufacturing-specific semantics on the broad Part concept rather than on a manufactured-part subset or applicability condition.
  - materiality: The declared purpose is to provide a concept baseline for item, BOM, and routing integration between PLM and MES. Because the routing relation is attached at the parent `Part` level, downstream consumers can treat all parts as candidates for manufacturing routings. That weakens correctness in routing and production-order logic and reduces trust in the ontology as an integration reference.
  - action: Restrict routing relations to manufactured parts, or add an explicit make/buy or manufacturing-applicability concept that gates when routing applies. The scoping/applicability distinction should be resolved before downstream routing or production-order consumers rely on `manufactured_by`, because otherwise they may continue to classify purchased parts as manufacturable.
- issue-011 (medium): AlternatePart is a material structural completeness issue: it is declared as the entity that carries alternate-part relationship qualifiers, but it is absent from the formal relations graph, so graph consumers can only see the shorthand Part-to-Part alternate_of edge and may miss the relationship attributes, especially direction.
  - root cause: The formal relation list models alternates as a direct Part-to-Part shorthand instead of connecting the declared AlternatePart entity into the graph.
  - materiality: The ontology is intended to serve as a PLM/MES integration concept baseline for BOM, routing, and manufacturing master-data structures. If integration or validation logic discovers concepts through the formal relations list, AlternatePart is unreachable even though it carries the fields that qualify alternate-part meaning. That split weakens trust that the ontology's graph surface is complete enough for downstream consumers.
  - action: Make AlternatePart the explicit relationship node in relations by adding primary_ref and alternate_ref links from AlternatePart to Part. Then either remove the shorthand Part-to-Part alternate_of relation or define it as a derived projection that preserves linkage back to AlternatePart.direction, so consumers can traverse the graph to the relationship entity before relying on alternate-part semantics.

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
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Review intent asks whether this BOM/process ontology is suitable as a PLM/MES integration concept standard, focused on item, BOM, routing, change-management consistency and manufacturing operating risk.
- issue-002: The declared review purpose is PLM/MES integration suitability with emphasis on change-management consistency and manufacturing operating risk.
- issue-003: 품목·BOM·라우팅·변경관리 개념의 정합성을 PLM/MES 통합 기준으로 제공하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리의 운영 기준을 제공하는 목적 Source finding context: PLM/MES 통합 기준에서 라우팅 릴리스와 변경관리 상태가 운영 행위를 통제하는 목적
- issue-004: 제조 운영 위험을 줄이는 PLM/MES 통합 기준으로서 승인·검사·원가/시간 값의 추적성을 제공하는 목적
- issue-005: PLM/MES 통합에서 BOM 수량, 생산능력, 계획 계산 및 품목·생산·재고 수량을 일관되게 연결하는 목적. Source finding context: PLM/MES 통합에서 BOM 수량, 생산능력, 계획 계산의 공통 기준을 제공하는 목적 Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목, BOM, 생산, 재고 수량을 일관되게 연결하는 목적.
- issue-006: PLM/MES routing and manufacturing operation concept baseline, especially routing consistency and manufacturing operating risk. Source finding context: The review asks whether the ontology is suitable as a PLM/MES concept baseline, especially routing consistency and manufacturing operating risk. Source finding context: PLM/MES 통합 기준에서 라우팅의 작업장 능력과 생산 계획 가능성을 안정적으로 표현하는 목적. Source finding context: PLM/MES routing and manufacturing operation concept baseline.
- issue-007: Use the ontology as a PLM/MES concept baseline for BOM and routing validation.
- issue-008: PLM/MES integration concept baseline for item/BOM/change concepts.
- issue-009: Concept baseline for routing and manufacturing operation semantics in PLM/MES integration.
- issue-010: Concept baseline for item, BOM, and routing integration between PLM and MES.
- issue-011: Use the ontology as a PLM/MES integration concept baseline for BOM, routing, and related manufacturing master-data structures.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Operational quantity semantics for scrap, yield, and item-specific UOM conversion are not governed inside the PLM/MES integration baseline, so systems can appear conformant while calculating production quantities differently. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_before_release, follow_up
- issue-002 (high): fix_before_release, follow_up
- issue-003 (high): fix_before_release, fix_now
- issue-004 (medium): follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-006 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_now
- issue-008 (medium): fix_before_release, follow_up
- issue-009 (medium): follow_up
- issue-010 (medium): follow_up
- issue-011 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
