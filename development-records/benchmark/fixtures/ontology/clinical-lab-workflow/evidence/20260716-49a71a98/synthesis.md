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
- issue-001 (high): Corrected LIS results can leave the clinician-trusted Report.result_status stale as finalized until nightly synchronization, so the ontology is not yet reliable as an EMR/LIS authority for corrected clinical information.
  - root cause: The ontology accepts batch-delayed correction propagation even though Report.result_status is declared as the clinician-facing authority.
  - materiality: This is material because the ontology’s declared purpose is to serve as a concept authority for EMR/LIS integration, including state-model validity and operational risk. If a corrected result exists while the clinician-facing authoritative report status still reads finalized, consumers cannot trust the modeled report status at the moment corrected clinical information matters most.
  - action: Make correction propagation part of the authoritative workflow before relying on this ontology for integration design. Define an immediate or bounded transition from Result.status=corrected to Report.result_status=amended, or explicitly model a visible pending-correction state if batching remains, with clinician-facing notification and visibility requirements during any delay.
- issue-002 (high): Critical-value notification semantics are materially weakened because `CriticalValue` carries three different meanings at once: threshold/range policy, actual patient critical-result occurrence, and notification completion state.
  - root cause: The model conflates critical threshold, actual critical result, and notification completion in one CriticalValue concept.
  - materiality: The declared purpose is to guide EMR/LIS integration around operational risks and critical-result notification workflow semantics. With only a `notified=true` flag and notification evidence kept outside the modeled authority, a consuming system can treat a safety-critical notification as complete without authoritative time, recipient, acknowledgement, channel, or accountable evidence needed for audit, escalation, reconciliation, and clinical handoff.
  - action: Separate the model into at least three concepts or relations: critical threshold/range policy, actual critical result or alert tied to a patient result, and notification event/record. Move `notified` onto the notification concept or derive it from governed notification evidence, and either own timestamp, recipient, notifier, channel, acknowledgement, and status in the ontology or define an explicit authoritative relation and synchronization rule to the phone ledger. This must be fixed before the next integration stage because it is a root-level safety and governance blocker.
- issue-004 (high): The ontology must not treat critical-value notification as only a boolean. It needs an evidence-bearing notification event and an explicit workflow path from the actual result/report context to the critical-value condition and notification handling.
  - root cause: CriticalValue and notification state are kept outside the result/report workflow graph, causing both evidence coverage loss and graph disconnection.
  - materiality: This is material because the declared purpose is to serve as the concept authority for operational EMR/LIS workflow integration, including critical-value notification risk. If a critical result must be communicated or audited, the current model can only say whether notification is complete, while actor, recipient, time, acknowledgement, escalation, and source-system evidence remain outside the authority graph. That weakens traceability, auditability, escalation, dispute handling, and consistent implementation of urgent clinical notification workflows.
  - action: Add a CriticalValueNotification or NotificationEvent concept and connect it to the relevant workflow objects: CriticalValue or the triggered alert, Result, Report or Order as appropriate, Staff or other notifier, recipient, acknowledgement, escalation, channel, notification time, and the authoritative notification record/source system. The notified flag should be derived from that event or replaced by it, because the evidence-bearing action must become the authority for notification completion before downstream EMR/LIS integrations rely on the model.
- issue-007 (high): Duplicated Result.status and Report.result_status vocabularies are a material high-severity issue because the ontology presents overlapping result status facts without a single authority, projection, freshness, synchronization, or evolution model.
  - root cause: Result and Report status are duplicated as separate enum carriers without a canonical mapping/projection model.
  - materiality: This weakens the ontology's declared role as EMR/LIS integration concept authority. LIS records Result.status, clinicians are told to trust Report.result_status, and nightly synchronization can leave the report-facing value stale after LIS correction. Without explicit precedence, staleness, and mapping semantics, different consumers may interpret preliminary/final/corrected display, completion, and amendment propagation differently.
  - action: Fix this before the next stage by introducing either a canonical ResultStatus concept or an explicit StatusMapping/projection model. The model should define source authority, report-facing projection, clinical display value, alias or distinct-state semantics, freshness or last_synced_at, synchronization/correction events, update authority, terminal status, and transition rules so future LIS states or reporting-policy changes extend the catalog rather than requiring coordinated enum and prose-rule edits.
- issue-008 (high): New Test and Assay entries currently require separate registration even though the ontology does not define an authoritative Test-to-Assay mapping or single registration authority. This is a high-severity root-cause issue because the order catalog and execution catalog can diverge as the catalog evolves.
  - root cause: Test and Assay are separate catalog/execution concepts without a canonical mapping or single registration authority.
  - materiality: The ontology is meant to act as an EMR/LIS integration authority for extensible continuity from ordered tests to executed assays and onward to results. Without an authoritative bridge between Test and Assay, implementers cannot reliably tell which code or relationship governs a new item, panel decomposition, or analyzer-specific execution variant, so catalog continuity can break and later migration or rework becomes likely.
  - action: Make Test the authoritative order catalog concept and Assay the execution implementation concept, then add an authoritative Test-to-Assay mapping or relation. New-item registration ownership should be assigned to one authority, while analyzer, department, panel, or implementation variants should be represented through the mapping entity or relation properties so extensions do not require semantic duplication.
- issue-010 (high): Order.completed is materially inconsistent because the ontology allows a completed Order to remain completed after a later Result correction changes Result.status from final to corrected, making the stated completion predicate false.
  - root cause: The durable Order.completed lifecycle state is derived from mutable Result.status values without post-completion correction semantics.
  - materiality: This weakens the ontology's purpose as the conceptual authority for EMR/LIS integration state behavior from Order through Report. Downstream systems may treat Order.completed as authoritative closure for workflow, billing, reporting, or clinician-facing state even though the result state has moved beyond the condition that justified completion.
  - action: Fix this before the next stage by defining completion against a stable milestone or versioned snapshot, or by adding explicit corrected/amended/reopened semantics and terminal-state rules. If corrected Results should still satisfy completion, the ontology must state that final-or-corrected terminal statuses count for Order completion; otherwise it must define how Order.completed changes or is qualified after correction.
- issue-003 (medium): TAT should be treated as a material authority gap: the ontology names a cross-system turnaround-time metric, but its executable calculation remains informally described and externally owned, so dashboard, EMR, and LIS consumers can drift apart.
  - root cause: The ontology defines a cross-system TAT metric but leaves executable calculation ownership outside the authority document.
  - materiality: This weakens the declared purpose because the ontology is meant to serve as the shared conceptual authority for EMR/LIS integration. If TAT is interpreted or calculated locally by downstream consumers, a key operational metric no longer has one shared meaning across systems, reducing consistent operational interpretation.
  - action: Promote TAT to an authoritative derived concept or versioned metric rule in the ontology. The rule should name the owning timestamps, calculation semantics, edge cases, and downstream consumption or mirroring expectations so dashboards, EMR, and LIS integrations all depend on the same governed metric definition.
- issue-005 (medium): Specimen lifecycle coverage is materially incomplete because the shared ontology stops at analyzed and does not define post-analysis storage, retention, disposal, retrieval, or exception states.
  - root cause: The ontology bounds Specimen lifecycle to the analytical phase and leaves end-of-life handling outside the shared concept model.
  - materiality: The declared purpose is to guide operational EMR/LIS integration across the clinical lab workflow. When specimen end-of-life handling is left outside the canonical model, departments and systems can invent incompatible meanings for retention, disposal audit, retesting, retrieval, rejected, lost, or recalled specimens, weakening cross-system consistency after analysis.
  - action: Extend the Specimen lifecycle with governed post-analysis states such as stored, retained, disposed, rejected, lost, or recalled as appropriate, and add retention/disposal event concepts with actor, time, reason, and department policy reference where policy variability must remain. This should follow the existing lifecycle authority so local policies can vary without removing shared audit and integration semantics.
- issue-006 (medium): Catalog, threshold, unit/reference, and TAT rule facts are time-dependent but modeled as current-state concepts, so historical lab results and operational metrics cannot be reliably reconstructed under the definitions that were in force when the events occurred.
  - root cause: Mutable reference data is modeled as unversioned current-state entities and at least one derived calculation is outside the authority model.
  - materiality: This weakens the declared purpose because EMR/LIS integration depends on trustworthy historical reconstruction. If catalog mappings, critical thresholds, units, or TAT formulas change without effective-period or version authority, old reports, corrected results, audits, and dashboards may be interpreted using current definitions rather than event-time definitions.
  - action: Add versioned or effective-dated concepts for Test, Assay, CriticalValue thresholds, unit/reference metadata, and TAT calculation rules, then relate Result and Report records to the effective catalog or rule version used at verification or release time. The ordering matters: first establish the versioned authority concepts, then wire historical result/report interpretation to those versions so reconstruction uses event-time rules instead of current-state defaults.
- issue-009 (medium): Specimen compatibility vocabulary can diverge because Specimen and Test use closed specimen-kind enums while Assay stores specimen kind as a free string. This should be carried forward as a material medium-severity extensibility issue.
  - root cause: Specimen kind is split across closed enums and free strings instead of a shared authoritative specimen-kind catalog.
  - materiality: The declared purpose is to add new tests, devices, and specimen handling types without breaking ontology continuity. When a more detailed specimen type is needed, the model must either change the Specimen/Test enum or normalize Assay/LIS strings manually, so schema evolution and value interpretation become coupled and cross-system compatibility checks become less reliable.
  - action: Promote specimen kind into a shared SpecimenKind or SpecimenType catalog and have Specimen, Test, and Assay reference it. The catalog should support aliases, hierarchy, or external codes where needed so variants such as broad blood categories and more specific serum or whole-blood terms can evolve without rewriting each consuming concept.
- issue-011 (medium): Result.status and Report.result_status are presented as maintaining the same status information, but the ontology defines separate enum domains and only specifies the corrected -> amended synchronization case. This leaves the overall equivalence and authority relationship under-specified.
  - root cause: The ontology splits one declared status information concept into two enum domains and only partially constrains equivalence.
  - materiality: The affected purpose is conceptual authority for EMR/LIS status synchronization between LIS result state and clinician-facing report state. Without a total mapping or a single authoritative enum, implementations can each satisfy local enum constraints while disagreeing about which cross-field status combinations are valid, which field controls, and how invalid mismatches should be handled.
  - action: Add a total status mapping table or unify the enum. If two fields remain, clarify whether Report.result_status is derived from Result.status or is authoritative, define the propagation rule, and include rules for multiple Results in one Report so every allowed state has a determinate cross-field interpretation.
- issue-012 (medium): STAT order meaning is materially ambiguous because the ontology represents STAT status through `Order.priority`, `Order.is_stat`, and `StatOrder` without declaring which one is authoritative or how they must stay consistent.
  - root cause: STAT is modeled simultaneously as an Order priority value, boolean flag, and subtype without an authority or invariant rule.
  - materiality: The declared purpose is shared EMR/LIS meaning for order priority and STAT orders. If integrated systems read different STAT indicators, urgent routing, SLA/TAT calculations, and notification rules can diverge even for the same order, weakening predictable urgent-order handling.
  - action: Choose one authoritative STAT representation, preferably the priority value if STAT is intended as order urgency, and make any retained boolean or subtype an explicit derived alias. If `StatOrder` remains, document invariants tying it to `priority=stat` and `is_stat=true`, plus how inconsistencies are rejected or resolved.
- issue-013 (medium): The `Specimen produces Result` relation is a material semantic defect because it describes specimen material as if it actively produces the lab result, instead of serving as the source material for a test, assay, or analysis event that generates the result.
  - root cause: The model assigns the result-producing action verb to Specimen, conflating source material lineage with assay/result generation.
  - materiality: This weakens concept authority for specimen traceability and result-production relationships. If designers rely on this relation for lineage or provenance, the model blurs the boundary between specimen source, assay/test execution, analyzer action, and result provenance, which can lead to incorrect EMR/LIS integration interpretation.
  - action: Replace or rename the relation to express specimen lineage rather than result-generation agency, using a relation such as `source_for`, `used_for`, or `has_result`. Result generation semantics should instead be connected to `Test`, `Assay`, or an explicit analysis event, so provenance and traversal paths distinguish source material from execution and production.
- issue-014 (medium): Assay is a material structural gap: it is modeled as a separate analyzer-performed execution/catalog concept, but it is not connected to ordered Tests or produced Results in the workflow graph.
  - root cause: Assay was introduced as a separate execution/catalog concept without structural relations to the order-result-report graph.
  - materiality: This weakens the ontology's declared purpose as the concept authority for EMR/LIS integration from Order through Report because implementers cannot use the authority graph to map ordered catalog tests to LIS/analyzer execution units or trace a result back to the assay that produced it. That missing bridge leaves a central cross-system mapping outside the model and encourages incompatible local joins.
  - action: Add explicit Test-to-Assay and Result-to-Assay relations, such as Test maps_to or realized_by Assay and Result produced_by Assay. If Assay is not intended to be a separate authority concept yet, merge it into Test instead. The ordering dependency is to resolve the Test-Assay catalog/execution bridge before treating the ontology as complete for EMR/LIS integration.
- issue-015 (medium): Order completion is materially under-specified because the ontology says an Order is completed when all Results are final, but it does not declare which Results belong to that Order for this rule.
  - root cause: The lifecycle rule aggregates over Result without declaring the authoritative result-set ownership path from Order.
  - materiality: This weakens the ontology's purpose as an authority for Order-to-Report state behavior. Consumers implementing Order.completed must choose their own traversal, such as Report.contains Result, Specimen.produces Result, or Test.has_many Result, so EMR and LIS components can compute completion differently while each appears consistent with part of the graph.
  - action: Declare the authoritative scoping relation for order completion and update the state rule to reference it explicitly. The action should identify whether Order's completion Results are scoped through Report.contains, Specimen.produces, another explicit Order has_many Result relation, or a defined derived path, so downstream consumers evaluate the same result set before marking an Order completed.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: resolved
- issue-004: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the concept authority document for EMR/LIS integration, especially entity, relation, state-model validity, and operational risk. Source finding context: Use the ontology as the concept authority document for EMR/LIS integration, especially entity, relation, and state-model validity and operational risk.
- issue-002: Use the ontology to guide EMR/LIS integration around operational risks and critical-result notification workflow semantics. Source finding context: Use the ontology to guide EMR/LIS integration around operational risks in the clinical lab workflow. Source finding context: 위험 결과 판정 및 통보 워크플로의 개념 권위
- issue-004: Use the ontology as a concept authority for operational EMR/LIS workflow integration, including critical-value notification risk. Source finding context: Use as the conceptual authority document for EMR/LIS integration from order through report, including operational risk concepts. Source finding context: Use the ontology as a concept authority for operational EMR/LIS workflow integration.
- issue-007: EMR/LIS integration concept authority with clear precedence, operationally safe status interpretation, and future status evolution continuity. Source finding context: EMR/LIS integration concept authority with clear precedence and operationally safe status interpretation. Source finding context: EMR/LIS 통합에서 결과 상태의 권위와 상태 변경 연속성을 제공하는 목적. Source finding context: EMR/LIS 통합의 결과 상태와 보고 상태에 대한 개념 권위 문서 역할
- issue-008: EMR/LIS integration authority for extensible continuity between order catalog and execution catalog. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 주문 카탈로그와 수행 카탈로그의 확장 가능한 연결을 제공하는 목적.
- issue-010: Use of the ontology as the conceptual authority for EMR/LIS integration state behavior from Order through Report.
- issue-003: Use the ontology as a shared conceptual authority for EMR/LIS integration.
- issue-005: A complete clinical lab workflow ontology from order to report that can guide operational EMR/LIS integration.
- issue-006: Conceptual authority for EMR/LIS integration that supports reliable historical reconstruction of lab results and operational metrics.
- issue-009: Extensibility for adding new tests, devices, and specimen handling types without breaking ontology continuity. Source finding context: 새 검사, 새 장비, 새 검체 처리 유형을 기존 온톨로지에 연속적으로 추가할 수 있어야 하는 확장성 목적.
- issue-011: Conceptual authority for EMR/LIS status synchronization between LIS result state and clinician-facing report state.
- issue-012: Shared EMR/LIS meaning for order priority and STAT orders. Source finding context: 주문 우선순위와 STAT 주문의 EMR/LIS 공통 의미 정의
- issue-013: Concept authority for specimen traceability and result production relationships. Source finding context: 검체 추적과 결과 산출 관계의 개념 권위
- issue-014: Use the ontology as the concept authority for EMR/LIS integration from Order through Report.
- issue-015: Use the ontology as an authority for state behavior in the Order-to-Report workflow.

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Corrected LIS results can leave the clinician-trusted Report.result_status stale as finalized until nightly synchronization, so the ontology is not yet reliable as an EMR/LIS authority for corrected clinical information. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- Structure reported insufficient structure-specific evidence, but did not dispute the workflow and status-authority issue.
- The bounded evidence does not include the external phone-log schema or an integration contract that would restore notification evidence authority.
- The bounded evidence does not include the dashboard formula, so this synthesis preserves the issue as authority-drift risk rather than a proven numerical mismatch.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-002 (high): fix_before_release, fix_now
- issue-004 (high): fix_before_release, fix_now
- issue-007 (high): fix_before_release, fix_now
- issue-008 (high): fix_before_release, fix_now
- issue-010 (high): fix_before_release, fix_now
- issue-003 (medium): follow_up
- issue-005 (medium): follow_up
- issue-006 (medium): follow_up
- issue-009 (medium): follow_up
- issue-011 (medium): follow_up
- issue-012 (medium): follow_up
- issue-013 (medium): follow_up
- issue-014 (medium): follow_up
- issue-015 (medium): follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
