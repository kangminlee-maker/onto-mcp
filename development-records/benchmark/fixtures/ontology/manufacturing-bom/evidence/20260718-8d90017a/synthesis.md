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
- issue-001 (medium): BomLine.scrap_rate를 생산계획팀 엑셀에서 복사한 운영 값으로 두는 현재 모델은 PLM/MES 통합 기준 문서가 제공해야 하는 권위 있는 제조 운영 의미와 경계를 약화한다.
  - root cause: 운영 핵심 값의 원본 권한과 동기화 계약을 온톨로지 개념으로 승격하지 않고 복사본 속성으로 수용한 설계 결정.
  - materiality: scrap_rate는 공정 불량을 감안해 BOM 사용량과 생산계획 판단에 영향을 주는 값이다. 이 값이 원본 계획 데이터가 아니라 별도 엑셀 복사본으로 노출되면, 엑셀 원본과 온톨로지/MES 복사본이 달라질 때 BOM 기준 수량과 제조 운영 계획이 서로 다른 값을 기준으로 계산될 수 있다. 따라서 PLM/MES 통합의 개념 기준 문서로서 신뢰 가능한 의미와 권한 경계를 제공한다는 목적이 약해진다.
  - action: scrap_rate에 대해 authoritative source, 적용 범위, 유효일자, 갱신 책임을 온톨로지에 명시해야 한다. 값이 실제 권위 값이 아니라 단순 복사본이라면 BomLine의 권위 속성이 아니라 derived/cache 성격으로 낮추고, 원본 생산계획 데이터와의 동기화 계약을 별도 개념 또는 관계로 분리해야 한다. 이 정리가 다음 단계 전에 선행되어야 PLM/MES가 같은 운영 값을 같은 권한 기준으로 사용할 수 있다.
- issue-002 (medium): ECO effective_date 이후 생산은 신규 리비전을 따라야 하는데 Part.rev가 주간 배치로 늦게 동기화되도록 남아 있어, 같은 품목의 권위 있는 생산 리비전과 표시 리비전이 일정 기간 갈라지는 문제가 있다.
  - root cause: 변경 적용의 권한 상태와 표시/동기화 상태를 같은 품목 리비전 개념 안에서 충분히 분리하지 않은 설계.
  - materiality: 검토 목적은 품목, BOM, 라우팅, 변경관리 개념이 PLM/MES 통합 기준으로 정합하게 작동하는 것이다. 이 설계에서는 ECO 적용일 이후와 Part.rev 배치 동기화 전 사이에 생산 오더나 현장 기준이 Part.rev를 참조하면 생산 기준은 신규 리비전인데 품목 속성은 구 리비전처럼 보일 수 있어 변경 적용 추적과 생산 통제가 흔들린다.
  - action: 대상 산출물에서 이 문제는 릴리스 전에 닫아야 한다. ECO 적용 상태와 Part.rev 표시/동기화 상태를 별도 개념 또는 별도 속성으로 분리해 각각의 권한과 유효시점을 명시하거나, 생산 오더 생성 기준이 Part.rev가 아니라 approved/applied ECO의 effective revision을 참조하도록 개념 계약을 확정해야 한다. evolution 렌즈의 좁힘처럼 이는 first-class effectivity/synchronization authority를 세우는 방향과도 호환된다.
- issue-003 (medium): Issue-003 is a material umbrella measurement-semantics issue: the ontology leaves UOM conversion and work-center capacity basis insufficiently standardized, so shared calculation meaning can depend on implicit local interpretation rather than the PLM/MES baseline itself.
  - root cause: Operational measurement semantics for UOM conversion and work-center capacity are left to local practice instead of being standardized as ontology concepts.
  - materiality: This weakens the declared purpose because a PLM/MES integration baseline must provide common calculation rules for item quantities, BOM requirements, routing, and manufacturing operations. If the same quantity or capacity value can mean different things by site, work center, or consuming system, the ontology cannot serve as a stable operational calculation baseline.
  - action: Introduce explicit UOM conversion and capacity unit or basis concepts so operational calculations have stable shared semantics. The action should be carried forward before the next stage as the umbrella fix direction, while preserving issue-004 and issue-005 as the narrower remediation scopes for UOM conversion and capacity modeling details.
- issue-004 (medium): The ontology currently cannot handle new units of measure or deterministic cross-unit BOM/MES quantity flows without either changing the schema or relying on manual interpretation outside the model.
  - root cause: Unit semantics are modeled as a closed Part.uom enum while item-specific conversion authority is absent from the ontology.
  - materiality: This is material because the declared purpose is a PLM/MES integration concept baseline for item, BOM, routing, and manufacturing operations. If unit identity and conversion rules are outside the ontology, integrations cannot reliably calculate or exchange quantities as item classes and operational units expand.
  - action: Replace the closed UOM enum with a UnitOfMeasure reference/entity, then add item-specific conversion-factor concepts with source authority, effective dating, and validity constraints. This should be fixed before the next integration stage because downstream BOM/MES quantity flows depend on shared, deterministic unit semantics.
- issue-005 (medium): WorkCenter.capacity_per_shift is a material modeling problem because it is a bare numeric field while its unit or basis may differ by work center. The ontology therefore cannot reliably support heterogeneous work-center capacity semantics from the model alone.
  - root cause: Work-center capacity is represented as an untyped number while its unit is declared variable by work center.
  - materiality: The declared purpose is a MES routing and production-order readiness baseline for work centers and operations. Capacity is central to scheduling and MES integration, so a numeric value that may mean pieces, hours, machine minutes, or another local measure weakens that purpose: consumers cannot compare, validate, normalize, or schedule capacity without hidden local conventions.
  - action: Replace the bare numeric capacity field with a structured capacity concept: model capacity as a measured quantity with explicit unit, capacity basis/type, shift or calendar context, and optional conversion or normalization rules. WorkCenter should reference that structured capacity concept so routing, scheduling, and production-order consumers can derive capacity meaning from the ontology itself before heterogeneous work centers are integrated.
- issue-006 (medium): The ECO model is materially incomplete for PLM/MES change applicability because it can express affected parts and one effective date, but not phased, lot/serial, plant/site, BOM-line, routing/operation, or scoped cutover effectivity without external exception logic or later model changes.
  - root cause: ECO applicability is modeled with affected parts plus a single effective date rather than a versioned effectivity scope.
  - materiality: This weakens the declared purpose of a change-management concept baseline for PLM/MES production applicability. Production cutovers often need different applicability by site, lot, serial range, routing, BOM line, operation, or transition phase; a single date for all affected parts cannot preserve those continuity conditions, so existing change records would require reinterpretation or migration and traceability between engineering change and MES execution would be undermined.
  - action: Introduce a first-class Effectivity concept referenced by ECO. It should scope applicability by date/time, lot, serial, plant/site, BOM line, routing, operation, and revision transition, with explicit source authority and synchronization state, so production cutover logic is modeled in the baseline before the next stage rather than delegated to external exceptions.
- issue-007 (medium): The ontology weakens its own BOM acyclicity rule by allowing scrap reinsertion as Assembly self-containment. That makes BOM containment carry both product-structure semantics and process-recirculation semantics, so future recovery or rework cases would need more ad hoc exceptions.
  - root cause: Process recirculation is represented inside BOM containment rather than as a separate process/material-flow concept.
  - materiality: This is material because the declared purpose is a BOM and routing concept baseline for manufacturing operations and future process extensions. A baseline that says BOMs are acyclic but immediately permits a self-cycle for scrap reinsertion makes downstream traversal, planning, and integration semantics unstable as more recovery, rework, by-product, or recirculation scenarios are added.
  - action: Keep product BOM containment acyclic, and model scrap reinsertion through a separate material-recovery, rework, process-output, or material-flow relationship. Allowed cycle semantics should live in that process/material-flow concept so BOM traversal remains stable while recovery and recirculation cases gain an extensible home.
- issue-008 (medium): BOM은 반드시 비순환이어야 한다는 규칙과 스크랩 재투입을 Assembly가 자기 자신을 child로 갖는 형태로 모델링한다는 규칙이 동시에 존재해, 같은 입력을 valid와 invalid로 동시에 만들고 있습니다.
  - root cause: 순환 금지 대상인 BOM 그래프와 스크랩 재투입 흐름을 같은 Assembly-child 관계로 모델링했다.
  - materiality: 이 문제는 PLM/MES 통합에서 BOM 개념 기준과 invalid input behavior를 약화합니다. 스크랩 재투입 Assembly의 self-child 데이터가 비순환 검증에서는 거부되어야 하지만 재투입 모델링 규칙에서는 요구되거나 허용되므로, 검증기와 MES 전개 로직이 승인/거부 기준을 결정할 수 없습니다. 그 결과 생산 전개, 원가 롤업, 자재 소요 산출의 신뢰 기준이 흔들립니다.
  - action: 스크랩 재투입은 BOM parent-child 순환으로 표현하지 말고 별도 관계나 별도 Rework/ReclaimFlow 그래프로 분리해야 합니다. 또는 비순환 규칙의 적용 범위를 일반 생산 BOM으로 명시하고 재작업/회수 흐름은 별도 그래프에서 관리한다고 닫아야 합니다. 먼저 그래프 경계를 분리하거나 규칙 범위를 좁혀야 이후 검증기, MES 전개, 원가/소요 산출 로직이 같은 입력에 대해 일관된 판정을 내릴 수 있습니다.
- issue-009 (medium): AlternatePart는 정의상 항상 양방향 대체 관계라고 설명되지만, direction 속성은 one_way를 기본값으로 허용하므로 같은 관계 인스턴스의 방향성을 일관되게 해석할 수 없다.
  - root cause: AlternatePart의 관계 대칭성을 정의 문장과 direction 속성 양쪽에서 서로 다른 modality로 선언했다.
  - materiality: 이 문제는 PLM/MES 통합에서 대체품 개념 기준과 production substitution rule을 약화시킨다. AlternatePart.direction이 one_way인 인스턴스가 만들어지면 한 시스템은 정의에 따라 A와 B를 상호 대체 가능하다고 해석하고, 다른 시스템은 속성에 따라 A에서 B로만 대체 가능하다고 해석할 수 있어 자재 대체 승인, 재고 소진, 생산 오더의 대체품 선택 기준이 갈라진다.
  - action: 대체 관계가 항상 대칭이어야 한다면 direction 속성과 one_way 값을 제거해 정의를 단일 권위로 만들어야 한다. 단방향 대체도 필요한 도메인 요구라면 정의를 direction에 따라 단방향 또는 양방향으로 해석되는 대체 가능 부품 관계로 바꾸어야 한다. 특히 coverage 관점이 지적한 것처럼 symmetric alternate equivalence와 directed substitution approval을 구분할 필요가 있으므로, 먼저 둘이 같은 개념인지 분리된 개념인지 결정한 뒤 enum/default와 정의를 그 결정에 맞춰 정렬해야 한다.
- issue-010 (medium): `scrap_rate` should not be treated as an intrinsic authoritative attribute of `BomLine` as currently modeled. It is a copied, externally maintained process/yield value, so the ontology mixes BOM structure with planning authority and creates drift risk.
  - root cause: The model assigns an externally maintained, rate-like process/yield value to the BOM-line concept without separating authority from visibility.
  - materiality: This is material because the ontology is meant to serve as a PLM/MES integration concept baseline for BOM and process concepts. If MES, planning, or costing consumers read `BomLine` as authoritative product structure, they may also treat the copied `scrap_rate` as authoritative even though its source is separately maintained in production planning. That weakens trust in the integration model because a manufacturing quantity can diverge across systems without the ontology naming the true semantic owner.
  - action: Model scrap/yield as a separately governed process or planning parameter with explicit source authority and effective scope, or define `scrap_rate` as a derived projection from authoritative defect/yield inputs. If the value must remain visible on `BomLine`, mark it as non-authoritative cached data and specify synchronization semantics so consumers know it is not the governing source.
- issue-011 (medium): `capacity_per_shift` is a material semantic defect because one numeric WorkCenter attribute is allowed to mean incompatible capacity dimensions, including quantity per shift and time per shift.
  - root cause: The work-center capacity concept omits unit/basis from the modeled value while allowing multiple measurement dimensions.
  - materiality: This weakens the PLM/MES integration baseline because routing and scheduling consumers depend on WorkCenter capacity to compare, aggregate, and plan operations. If the same numeric field can represent either count capacity or available time depending on the work center, MES capacity planning can combine values that do not share a unit or basis.
  - action: Fix this before the next stage by giving every capacity value a stable measure interpretation. Either split the concept into explicit attributes such as `capacity_quantity_per_shift` and `available_time_per_shift`, or require a `capacity_unit`/`capacity_basis` enum with conversion rules so consumers can distinguish and safely compare values.
- issue-012 (medium): `AlternatePart` is materially inconsistent because it describes alternate parts as reciprocally substitutable while its own `direction` attribute supports and defaults to one-way substitution. This leaves consumers unable to tell whether the relationship is symmetric equivalence or directed substitution approval.
  - root cause: The alternate-part concept conflates symmetric equivalence with directed substitution approval.
  - materiality: The declared purpose is a PLM/MES integration baseline for BOM substitution and change-controlled manufacturing execution. If a consumer follows the symmetric definition while the modeled approval is one-way, it may allow a reverse substitution that was not approved, producing incorrect BOM consumption or MES execution decisions.
  - action: Revise the ontology so the relationship has one authoritative semantic contract. Either define `AlternatePart` as an approved substitution relationship with explicit direction, potentially renaming fields to `source_part_ref` and `substitute_part_ref`, or remove `one_way` and make the relation truly symmetric. The fix should preserve coverage for both reciprocal alternates and one-way approved substitutions, while leaving the separate relation-path metadata-loss issue to issue-015.
- issue-013 (medium): `Part.rev` and `current_eco` create a material ambiguity because their names read as current authoritative Part state, while their definitions make them externally governed, asynchronously synchronized projections. Production revision authority is therefore split between Part display fields and ECO effectivity semantics.
  - root cause: The Part concept uses current-state naming for externally governed, asynchronously synchronized change-management projections.
  - materiality: This weakens the PLM/MES integration baseline for item revision and engineering change management because consumers need one clear production-current revision. After an `ECO.effective_date` but before the weekly Part synchronization, one consumer may follow ECO effectivity while another may trust `Part.rev`, creating manufacturing execution risk.
  - action: Separate the authoritative production revision/effectivity model from synchronized Part snapshots. Model an ECO-governed `effective_revision` or `revision_effectivity`, and rename or mark `Part.rev` and `current_eco` as snapshot/display projections such as `drawing_rev_snapshot` and `latest_eco_snapshot`, with freshness metadata so consumers can tell authority from lagging cache.
- issue-014 (medium): InspectionPlan is materially misclassified: it is modeled as an Operation even though it represents an inspection plan/specification, so its instances inherit executable routing-step meaning they should not carry.
  - root cause: The ontology conflates executable inspection activity with the inspection specification that governs it by typing InspectionPlan as an Operation.
  - materiality: The declared purpose is a PLM/MES integration concept baseline for routing, operation, and quality inspection concepts. This issue weakens that purpose because MES routing consumers can reasonably treat every Operation subtype as an executable ordered step; under the current model, InspectionPlan instances may therefore be scheduled or sequenced as routing work instead of being referenced as quality specifications.
  - action: Split the concepts. Model InspectionOperation as an Operation subtype if an executable inspection step is needed, and model InspectionPlan as a separate specification referenced by that operation. Keep sampling_rule and acceptance_criteria on the plan/specification, or as governed parameters applied to the operation, so routing execution consumes an executable step while quality rules remain specifications.
- issue-015 (medium): Consumers that use the canonical relations section can see a Part-to-Part alternate_of relationship while bypassing the AlternatePart entity that carries substitution direction. This makes the ontology materially unsafe as a PLM/MES integration baseline for substitute-part semantics.
  - root cause: The ontology defines AlternatePart as an entity but represents its canonical relation path as a direct Part-to-Part alternate_of shortcut instead of connecting the entity in the relation graph.
  - materiality: The declared purpose is to serve as a concept baseline for PLM/MES integration across items, BOM, routing, and change-management concepts. If integrations traverse relations and receive only a direct Part -> Part alternate_of shortcut, they can preserve that two parts are alternates while losing whether the substitution is directed and any relationship-level metadata held on AlternatePart. That weakens downstream mapping trust for production substitution constraints.
  - action: Model AlternatePart explicitly in the relations graph, for example Part -> AlternatePart for the primary side and AlternatePart -> Part for the alternate side. Then either remove the direct Part-to-Part alternate_of relation from the canonical relation list or mark it as derived from AlternatePart so the metadata-bearing object remains authoritative before downstream integration mappings rely on the graph.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: narrowed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: resolved
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 BOM과 제조 운영 값의 신뢰 가능한 의미와 권한 경계를 제공하는 목적.
- issue-002: 품목, BOM, 라우팅, 변경관리 개념의 정합성을 갖춘 PLM/MES 통합 기준 제공.
- issue-003: PLM/MES integration concept baseline for common calculation rules across item, BOM, routing, and manufacturing operations. Source finding context: PLM/MES 통합에서 품목, BOM, 라우팅, 제조 운영 값의 공통 계산 기준을 제공하는 목적.
- issue-004: PLM/MES integration concept baseline for item, BOM, routing, and manufacturing operations.
- issue-005: MES routing and production-order readiness concept baseline for work centers and operations.
- issue-006: Change-management concept baseline for PLM/MES production applicability.
- issue-007: BOM and routing concept baseline for manufacturing operations and future process extensions.
- issue-008: PLM/MES 통합의 BOM 개념 기준과 invalid input behavior.
- issue-009: PLM/MES 통합의 대체품 개념 기준과 production substitution rule.
- issue-010: PLM/MES integration concept baseline for BOM and process concepts.
- issue-011: PLM/MES integration concept baseline for routing and manufacturing operations.
- issue-012: PLM/MES integration concept baseline for BOM substitution and change-controlled manufacturing execution.
- issue-013: PLM/MES integration concept baseline for item revision and engineering change management.
- issue-014: PLM/MES integration concept baseline for routing, operation, and quality inspection concepts.
- issue-015: PLM/MES integration concept baseline across items, BOM, routing, and change-management concepts. Source finding context: Use the ontology as a concept baseline for PLM/MES integration across items, BOM, routing, and change-management concepts.

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (medium) — BomLine.scrap_rate를 생산계획팀 엑셀에서 복사한 운영 값으로 두는 현재 모델은 PLM/MES 통합 기준 문서가 제공해야 하는 권위 있는 제조 운영 의미와 경계를 약화한다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- The bounded target does not show downstream PLM/MES consumers, so the issue is limited to the ontology's declared concept-baseline role.
- The synthesis is limited to the review artifacts allowed by the unit boundary and does not assess actual ECO system capabilities outside the visible model.

## Immediate Actions Required
- issue-001 (medium): fix_before_release, follow_up
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, follow_up
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_now
- issue-009 (medium): fix_now
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_now
- issue-013 (medium): fix_before_release, fix_now
- issue-014 (medium): fix_before_release, fix_now
- issue-015 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
