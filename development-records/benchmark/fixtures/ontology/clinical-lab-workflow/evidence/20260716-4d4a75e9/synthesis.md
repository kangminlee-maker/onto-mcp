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
- issue-001 (high): Corrected LIS results can coexist with a clinician-facing Report.result_status that still reads finalized or preliminary until nightly synchronization, so the ontology leaves clinicians and EMR/LIS integrations without a determinate trusted status during the correction window.
  - root cause: The model duplicates result and report status authority while allowing delayed reconciliation, leaving the authoritative state undefined during the correction window.
  - materiality: This is material because the ontology is intended to serve as the concept authority for EMR/LIS integration, especially status precedence and operational risk. If the document permits a corrected Result.status while the report status clinicians are told to trust remains stale, it weakens the authority role by allowing downstream systems to present corrected clinical information as still finalized or preliminary.
  - action: Fix this before release by either defining one authoritative correction status or by making the eventual-consistency contract explicit. If delayed processing remains, the model needs a bounded stale interval, freshness timestamp, source result linkage, and EMR-facing authority rules such as an amendment_pending state so consumers know what to trust during the correction window.
- issue-006 (high): Orderable Test and executable Assay are modeled as parallel catalog structures without a governed mapping or authority boundary, so the ontology cannot reliably decide how an EMR orderable item corresponds to LIS/analyzer execution units when catalog items are added, changed, versioned, renamed, or retired.
  - root cause: Catalog extension relies on dual Test and Assay registration because the ontology lacks a governed Test-Assay mapping, source of truth, and effective-history concept.
  - materiality: This weakens the declared purpose because the ontology is meant to serve as concept authority for EMR/LIS integration. If Test and Assay both hold catalog-like attributes but no source of truth, cardinality, lifecycle, or effective history governs their relationship, EMR, LIS, analyzer, and dashboard consumers can interpret the same lab item differently and drift during catalog maintenance.
  - action: Define the canonical catalog authority first, then add the Test-Assay mapping around it. The fix should specify orderable-versus-executable boundaries, mapping cardinality, authoritative ownership for shared attributes such as department and specimen kind, effective_from/effective_to or version history, and activation/retirement or migration rules for items currently present in both catalogs. This must be closed in the target model because later catalog, result, integration, and dashboard behavior depends on that authority.
- issue-010 (high): Result.status and Report.result_status are a material status-authority defect: they claim to carry the same status information, but use different vocabularies and meanings without a governed mapping, versioning, authority rule, or transition model.
  - root cause: Status lifecycle extensibility is weakened because result and report states are duplicated as separate enums without a governed mapping, version, or transition model.
  - materiality: This weakens the ontology's purpose as a stable EMR/LIS concept authority because implementers cannot reliably know whether preliminary/prelim, final/finalized, and corrected/amended are identical states, mapped states, or separate authorities. That ambiguity can change what clinicians see as final or corrected and what workflows treat as order completion, especially when new statuses or synchronization modes are added.
  - action: Fix this before release by either unifying result and report status under one common status concept, or explicitly separating ResultStatus and ReportStatus with governed mappings, authority ownership, versions, valid periods, transition rules, and synchronization events or SLA semantics. The key ordering dependency is to decide the source of status authority first, then encode mappings and transitions from that authority so clinical display, correction handling, and order-completion logic all read the same lifecycle semantics.
- issue-002 (medium): Critical-value notification is materially under-modeled: the ontology uses a bare `notified` boolean where EMR/LIS integration needs an auditable notification event with recipient, notifier, time, channel, acknowledgement, and source authority.
  - root cause: The model treats critical-value communication evidence as external operational bookkeeping instead of a first-class integration concept.
  - materiality: This weakens the declared purpose because critical values are operational-risk events that must support traceable clinical communication. If the ontology is the EMR/LIS concept authority, downstream systems should not have to infer closed-loop notification status from an external phone ledger or a boolean that cannot show who was notified, when, by whom, through what channel, or whether acknowledgement closed the loop.
  - action: Promote critical-value notification into an explicit event or entity, such as `CriticalValueNotification`, linked to `CriticalValue`, `Result`, `Staff`, and the EMR/LIS release workflow. It should carry recipient, notifier, notified_at, channel, acknowledgement status, and source authority so systems can distinguish a dangerous result threshold from the communication event that closes or audits the clinical risk loop.
- issue-003 (medium): TAT is a material authority gap: it is named as an ontology concept, but the ontology neither governs it as a derived metric nor clearly declares the dashboard formula outside its authority boundary.
  - root cause: Operational metric authority is delegated to local dashboard practice without modeling ownership, versioning, precedence, or conformance to the ontology.
  - materiality: This weakens the ontology's declared purpose as an EMR/LIS integration concept authority because consumers can treat TAT as authoritative while applying different dashboard, LIS, or reporting formulas. When formulas change or reports are amended, the ontology provides only source timestamps, not the governed metric semantics needed to reproduce or compare TAT consistently.
  - action: Before the next stage, decide whether TAT is inside or outside ontology authority. If inside, model it as a governed derived metric with source timestamps, owner, version/effective rules, exclusions, conformance requirements, and amended/corrected report behavior. If outside, explicitly declare the dashboard metric out of scope and define the integration boundary so consumers do not mistake it for canonical ontology semantics.
- issue-004 (medium): Specimen lifecycle is materially incomplete because the shared ontology stops at analyzed and does not model or govern post-analysis custody, retention, retrieval, storage, or disposal states/events.
  - root cause: The target delegates post-analyzed specimen handling to departmental rules instead of modeling it as part of the shared ontology.
  - materiality: The declared purpose is to serve as the concept authority for EMR/LIS integration from order through report, including entity, relationship, and state modeling. When post-analysis handling must be reconciled, the model has no canonical states or events for downstream systems to map to, so integrations may treat analyzed as terminal and let department-specific rules become the effective authority.
  - action: Add explicit post-analysis specimen lifecycle concepts such as retained/stored, retrieved, disposed, and retention/disposal events, including timestamp, responsible department or staff, location, and policy basis. If the detailed rules must remain departmental, add a governed extension point that is still visible in the authority model so downstream integrations have a canonical mapping target.
- issue-005 (medium): CriticalValue currently conflates the definition of a dangerous threshold/range with the state of notifying someone about a patient-specific critical result. This makes the ontology unable to cleanly represent either the threshold rule or the auditable notification event.
  - root cause: The model fails to separate critical threshold definitions from patient/result-specific notification events.
  - materiality: The declared purpose is to serve as an EMR/LIS integration authority for operationally risky lab workflow states and controlled actions. Critical-value notification is such a controlled action: systems need to know not only that notification occurred, but who notified whom, when, through what channel, with what acknowledgement, and from what evidence source. A single notified boolean can be overwritten or interpreted inconsistently across LIS, EMR, and phone-log reconciliation, weakening auditability and semantic clarity for safety-relevant communication.
  - action: Split the model into a threshold/range rule concept, such as CriticalValueRange or CriticalRule, and a result-linked notification or critical-result event concept. Keep threshold bounds and rule semantics on the rule concept; put notified status, notifier, recipient, notified_at, channel, acknowledgement/status, escalation, and source-log evidence on the event concept. This split should be done before release because downstream EMR/LIS reconciliation and audit behavior depend on having a stable event authority rather than a boolean attached to a range definition.
- issue-007 (medium): Specimen type modeling materially weakens the ontology because the same specimen-kind concept is split between closed Specimen/Test enums and Assay free strings. This should be carried forward as a medium material issue and resolved by making specimen kind a governed shared code set or entity referenced by Specimen, Test, and Assay.
  - root cause: Specimen kind is duplicated across closed enums and free strings without a single governed code-set or mapping authority.
  - materiality: The declared purpose is to keep specimen-based orderability, analysis execution, and result tracing extensible across EMR/LIS integration. That purpose is weakened because new detailed specimen types, external LIS specimen codes, or department-specific specimen names cannot be introduced through one stable authority: closed enums must be changed while Assay strings require separate mapping rules, leaving broad legacy values such as blood without governed continuity to detailed values such as Serum or WB.
  - action: Promote specimen kind to a governed SpecimenType or SpecimenKind code set/entity with hierarchy, aliases, versions, and external LIS-code mappings. Then make Specimen, Test, and Assay reference that same authority so orderability, assay execution, and result tracing share one specimen axis; this can be handled as planned follow-up and should remain aligned with the related Test/Assay catalog-authority work.
- issue-008 (medium): STAT priority is modeled in three parallel ways: `Order.priority=stat`, `Order.is_stat`, and the `StatOrder` subtype. Because no one representation is declared canonical and no invariant binds them, the model can produce divergent STAT meanings when priority policy or EMR/LIS interface mappings change.
  - root cause: STAT priority is modeled redundantly as a priority enum value, an is_stat boolean, and a StatOrder subtype without a canonical source or invariant.
  - materiality: This weakens the purpose of consistently supporting order priority and STAT policy changes in an EMR/LIS integration model. When new priority categories, institution-specific STAT reason policies, or external priority codes are added, consumers must interpret and update an enum value, a boolean, and a subtype together, making priority meaning unstable and increasing the risk of conflicting routing, SLA, alerting, or reporting behavior.
  - action: Choose one canonical priority/STAT authority before dependent integration design proceeds. Prefer an extensible priority concept or policy object as the source of truth, then remove `is_stat` or mark it as derived, and either remove `StatOrder` or constrain it with explicit invariants. STAT-specific reasons should be generalized into `priority_reason` or priority-policy attributes so new categories do not require new order subtypes or structural edits to `Order`.
- issue-009 (medium): Order.completed is unsafe as a current lifecycle authority because it can be reached when all Results are final, while later allowed Result corrections can invalidate that condition without any modeled Order transition.
  - root cause: The model defines order completion against a reversible Result.status value but does not define how order lifecycle responds when that value changes after completion.
  - materiality: This weakens the declared EMR/LIS integration purpose because downstream systems may treat Order.completed as authoritative lifecycle state while also seeing a corrected or non-final Result. That creates conflicting current-state signals for lifecycle precedence and invalid-input handling.
  - action: Define completed as either a historical release-completion event or a maintained invariant. If maintained, add explicit Order behavior for correction, such as reopened, corrected, or amended transitions; if historical, rename or document completed accordingly and add a separate current-result-finality predicate for integrations that need present-state truth.
- issue-011 (medium): priority=stat, is_stat=true, and StatOrder all represent the same STAT order meaning, but the ontology does not define one canonical authority or an invariant that keeps the three surfaces aligned. This is a material consistency issue that must be carried forward and closed before the next stage.
  - root cause: STAT is declared as the same order meaning in separate semantic surfaces without a defined decision relationship among them.
  - materiality: The declared purpose is to transmit order priority and STAT routing meaning consistently across EMR/LIS integration. If the same order can imply different STAT states through priority, is_stat, and subtype membership, downstream consumers may choose different authorities for urgent routing, SLA handling, alerts, and dashboard aggregation, producing inconsistent operational behavior.
  - action: Choose one canonical source for STAT meaning and then either remove the other surfaces, mark them as derived views, or define mandatory invariants that force them to agree. This decision should be made before the next stage because other routing, SLA, alerting, and reporting logic depends on a stable STAT authority.
- issue-012 (medium): Specimen produces Result should be retained as a material ontology issue: it frames a physical specimen as the producer of a result, while the model already expresses specimen lineage through Result derived_from Specimen.
  - root cause: The specimen-to-result lineage relationship is named as production, overexpressing a physical specimen as the producer of a result.
  - materiality: This weakens the EMR/LIS authority model's purpose of separating specimen identity, test execution, and result production. If implementers treat Specimen produces Result as the authoritative generation relation, downstream flows can conflate material lineage with assay execution, equipment or department responsibility, and result creation.
  - action: Repair the relation by either renaming/remodeling the specimen-result edge as lineage/source semantics, such as source_for or provides_material_for, or by introducing and wiring an Assay/Test execution concept as the actual producer of Result. This should be coordinated with the shared missing execution/result-production concept context captured for issue-014.
- issue-013 (medium): Patient is referenced by Order.patient_ref but is not represented in the explicit workflow relations graph. This leaves Patient outside the traversable Order-to-Report relation model unless attribute references are formally documented as authoritative relationships.
  - root cause: The ontology splits structural linkage between attribute refs and the relations list without making Patient an explicit relation participant.
  - materiality: The ontology is intended to serve as the concept authority for EMR/LIS integration from Order through Report. If consumers derive integration paths from the relations section, they cannot connect orders, specimens, results, or reports to Patient, which weakens trust in the model for a core workflow participant.
  - action: Resolve the structural authority gap by either adding explicit patient relations, such as Order belongs_to Patient and Patient has_many Order, or documenting that attribute references are the authoritative relationship surface and aligning the relations list with that rule. The decision about which surface is authoritative should come first, because it determines whether the fix is a graph change or a contract/documentation alignment change.
- issue-014 (medium): Assay is materially disconnected from the authoritative workflow graph: the ontology treats Test as the orderable unit and Assay as the analyzer execution unit, but it does not relate Assay to Test or Result, so consumers cannot trace orderable tests through execution to produced results.
  - root cause: Assay was introduced as a separate catalog concept but not wired into the explicit relations graph.
  - materiality: This weakens the declared EMR/LIS authority purpose because orderable catalog items and analyzer-executed items must be integrated. A consumer can follow existing graph edges from Test to Result, but cannot determine which Assay implements the Test or produces the Result, leaving an actionable integration gap between EMR ordering and LIS/analyzer execution.
  - action: Close this before the next stage by deciding whether Assay belongs in the authoritative workflow graph. If it does, add the minimal execution relations, such as Test implemented_by Assay and Assay produces Result, aligned with the broader issue-006 Test-Assay mapping work. If Assay is not yet authoritative, explicitly de-scope it from the workflow graph until catalog consolidation is complete, so consumers are not misled by an execution concept with no operational path.
- issue-015 (medium): CriticalValue is materially under-modeled for operational workflow use: it is not explicitly reachable from produced Result instances or notification actors, so relation-based consumers cannot traverse from a lab result to critical-value handling or notification completion.
  - root cause: CriticalValue combines threshold and notification state but is not represented in the explicit workflow relations.
  - materiality: This weakens the declared purpose because the ontology is meant to act as operational concept authority for lab result workflow and LIS reporting behavior. Critical-value handling is safety-relevant; if it is detached from the Result and report path, the ontology cannot reliably drive or audit the workflow that identifies a critical result and confirms notification.
  - action: Resolve the threshold-versus-event modeling decision before the next stage. Either make CriticalValue catalog-only and move notification state into a separate result-specific notification event, or explicitly split/type the concept so Result-to-critical-handling and actor notification traversal are represented. Simply adding edges to the mixed concept is not enough unless the threshold and notification-event authority distinction is also settled.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-006: resolved
- issue-010: resolved
- issue-002: no-deliberation-needed
- issue-003: narrowed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: narrowed
- issue-013: no-deliberation-needed
- issue-014: narrowed
- issue-015: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the concept authority document for EMR/LIS integration, especially status precedence and operational risk. Source finding context: Use the ontology as the concept authority document for EMR/LIS integration, with attention to operational risk. Source finding context: Use as the concept authority document for EMR/LIS integration, especially precedence and status interpretation.
- issue-006: Use as the concept authority for EMR/LIS integration where orderable tests must map to LIS/analyzer execution units. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 카탈로그와 수행 단위의 변경을 안정적으로 수용하는 목적. Source finding context: 검사 카탈로그와 수행 단위의 개념 권위를 제공해 EMR 주문과 LIS 수행을 연결하는 목적.
- issue-010: Provide a stable concept authority for interpreting and extending result and report status across EMR/LIS systems. Source finding context: EMR/LIS 통합의 개념 권위 문서로서 결과 상태와 보고 상태의 의미 기준을 제공하는 목적. Source finding context: 결과와 보고서 상태를 EMR/LIS 간에 장기적으로 일관되게 해석하고 확장하는 목적.
- issue-002: Use the ontology as the concept authority for EMR/LIS integration while identifying operational risks in entities, relations, and states.
- issue-003: Use the ontology as a concept authority for EMR/LIS integration and operational values derived across workflow timestamps. Source finding context: Use the ontology as a concept authority for EMR/LIS integration. Source finding context: Use as a concept authority for EMR/LIS integration, including operational values derived across workflow timestamps.
- issue-004: Use as the concept authority document for EMR/LIS integration from order through report, including entity, relationship, and state modeling.
- issue-005: Use as an EMR/LIS integration concept authority for operationally risky lab workflow states and controlled actions. Source finding context: 위험 결과 기준과 통보 상태를 EMR/LIS 통합에서 정확히 해석하게 하는 목적.
- issue-007: Maintain specimen-based orderability, analysis execution, and result tracing as an extensible common concept in EMR/LIS integration. Source finding context: EMR/LIS 통합에서 검체 기반 주문 가능성, 분석 수행, 결과 추적을 확장 가능한 공통 개념으로 유지하는 목적.
- issue-008: Support consistent order priority and STAT policy changes in the EMR/LIS integration model. Source finding context: 주문 우선순위와 응급 정책 변경을 EMR/LIS 통합 모델에서 일관되게 수용하는 목적.
- issue-009: Use as an EMR/LIS integration authority for lifecycle and state interpretation.
- issue-011: Consistently transmit order priority and STAT routing meaning in EMR/LIS integration. Source finding context: 주문 우선순위와 STAT 라우팅 의미를 EMR/LIS 통합에서 일관되게 전달하는 목적.
- issue-012: Accurately distinguish specimen, test execution, and result production in the EMR/LIS integration authority model. Source finding context: 검체, 검사 수행, 결과 산출의 의미 관계를 EMR/LIS 통합 권위 문서에서 정확히 구분하는 목적.
- issue-013: Using the ontology as the concept authority for EMR/LIS integration from Order through Report.
- issue-014: Using the ontology as an EMR/LIS concept authority where orderable catalog items and analyzer-executed items must be integrated.
- issue-015: Using the ontology as the operational concept authority for lab result workflow and LIS reporting behavior.

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Corrected LIS results can coexist with a clinician-facing Report.result_status that still reads finalized or preliminary until nightly synchronization, so the ontology leaves clinicians and EMR/LIS integrations without a determinate trusted status during the correction window. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- Bounded evidence does not state whether downstream tooling is intended to treat attribute refs as graph edges.
- The synthesis is limited to the ontology review artifacts allowed by the unit boundary; downstream integration tooling was not inspected.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-006 (high): fix_before_release, fix_now
- issue-010 (high): fix_before_release, fix_now
- issue-002 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, accept_risk
- issue-004 (medium): follow_up
- issue-005 (medium): fix_before_release, fix_now
- issue-007 (medium): follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): follow_up, accept_risk
- issue-013 (medium): follow_up, accept_risk
- issue-014 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
