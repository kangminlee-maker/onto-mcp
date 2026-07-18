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
- issue-001 (high): Issue-001 should be retained as a high-severity material issue: the ontology splits result/report status authority across `Result.status` and `Report.result_status` without a precise authoritative state, mapping, timing, and correction-propagation contract.
  - root cause: Result and report status authority is split across duplicated vocabularies and delayed synchronization rather than a single current authoritative state contract.
  - materiality: This weakens the ontology's declared purpose as an EMR/LIS concept authority for clinician-facing report semantics because clinicians may rely on `Report.result_status` while the LIS has already recorded a corrected result. A model that permits stale or ambiguously mapped clinician-visible status during correction cannot safely serve as the shared authority for integration and operational workflow design.
  - action: Fix the authority contract before the ontology is used as an integration authority. Either define one canonical result/report status vocabulary, or add an explicit versioned mapping between `Result.status` and `Report.result_status` that states ownership, value equivalence, timing, correction-versus-amendment semantics, temporal precedence after release, maximum propagation delay, and any clinician-visible pending-correction state required during asynchronous processing.
  - unresolved disagreement: Logic preserves a narrower disagreement: it accepts the formally shown temporal precedence gap after correction, but does not treat delayed synchronization and authority ownership as independently proven formal contradictions without additional specification evidence.
- issue-003 (high): Issue-003은 중요값 통보를 단순 완료 boolean로만 표현해 통보 행위의 감사 권위를 온톨로지 내부에서 재구성할 수 없게 만드는 고위험 결함이다. 독립 이슈로 유지하되, 해결 범위는 CriticalValue 또는 Result에 연결되는 first-class CriticalValueNotification 사건/증거 노드 추가로 좁혀야 한다.
  - root cause: CriticalValue notification audit evidence is reduced to a boolean and external phone log rather than a first-class evidence-bearing concept inside ontology scope.
  - materiality: 이 온톨로지는 EMR/LIS 통합의 개념 권위 문서로서 엔티티, 관계, 상태, 운영 위험을 설명해야 한다. 중요값 통보는 환자 안전과 운영 책임에 직접 연결되는 통제 행위인데, 현재 표현은 통보 완료 여부만 남기고 누가, 언제, 누구에게, 어떤 채널과 근거로 통보했는지 및 어떤 외부 기록이 권위 원본인지 식별하지 못하게 한다. 그 결과 누락, 지연, 정정, 분쟁 상황에서 통합 시스템의 감사 추적과 책임 소재 판단이 약해진다.
  - action: CriticalValueNotification action/evidence 엔티티를 추가하고 CriticalValue 또는 Result에 연결해야 한다. 최소한 result_ref/test_ref, notifier_staff_ref, recipient, notified_at, channel, acknowledgement/status, reason 또는 evidence_ref를 포함하고, 외부 전화 기록 대장을 계속 쓰는 경우에도 그 장부가 권위 원본임을 나타내는 관계를 명시해야 한다. 이 작업은 broader CriticalValue relation/event-modeling 맥락과 정합되어야 하지만, 독립적인 통보 감사 권위 요구사항은 잃지 않아야 한다.
  - unresolved disagreement: Semantics lens는 사건/증거 개념 추가에는 동의하지만, 이 문제를 독립 고위험 이슈라기보다 threshold/result와 notification event의 의미 경계 문제로 더 좁게 본다.
- issue-005 (high): Issue-005 is material: the ontology should treat changing catalog entries, assay mappings, critical thresholds, TAT rules, and specimen kinds as governed, versionable authority concepts, not as scattered current fields, closed enums, free strings, or prose notes.
  - root cause: Mutable operational classification values are modeled as local current fields instead of shared, versionable authority concepts.
  - materiality: This weakens the declared EMR/LIS integration purpose because integrations must reconstruct historical result interpretation, alerts, performance metrics, and specimen compatibility after operational standards change. Without effective dates, version history, authority/source information, aliases, and external codes, systems may apply today's values to past records or resolve Test/Assay, dashboard, and specimen-kind conflicts through implementation-specific mappings rather than ontology authority.
  - action: Promote these mutable values into governed concepts such as TestCatalogEntry, AssayMapping, CriticalValueRule, TatDefinition, and SpecimenType/SpecimenKind. They should carry effective_from/effective_to, version, source_system or authority, supersedes, mapping status, aliases, and external codes; TAT should model authoritative start/end events and exception rules, with dashboard formulas positioned as consumers of that definition. This should be fixed in the target artifact before release because later consumers depend on these concepts for historical reconstruction and cross-system reconciliation.
  - unresolved disagreement: Deliberation resolved the issue in favor of the broad high-severity governance/versioning action. The semantics lens remained narrower, treating the specimen shared-code-set meaning boundary as the directly supported semantic subproblem; additional semantic evidence would be needed for full semantics-lens convergence on the broader governance scope.
- issue-009 (high): Order.completed is materially inconsistent with later allowed Result.status=corrected transitions unless completion is explicitly modeled as either a historical snapshot or a current invariant with reopen/amended lifecycle behavior.
  - root cause: Order completion is defined over mutable Result.status values without a corresponding temporal snapshot or correction/reopen rule.
  - materiality: This weakens the ontology's purpose as an EMR/LIS integration authority because consumers cannot reliably interpret completed Orders after corrections. If consumers treat completed as terminal, later corrected Results contradict the completion predicate; if they treat it as a snapshot marker, the ontology does not say so.
  - action: Define completed in one of two ways. If completed is a historical transition snapshot, record that it was reached at a timestamp when all Results were final and stop requiring current Result statuses to remain final. If completed is a current invariant, add explicit Order reopen or amended lifecycle behavior whenever any associated Result becomes corrected. This must be fixed now because the state contract is otherwise not stable enough for EMR/LIS integration.
- issue-010 (high): Report.result_status has a material state-rule conflict: after a report is released, a later corrected Result can require the same single status field to remain finalized and become amended at the same time.
  - root cause: Report.result_status assignments are defined by overlapping predicates without precedence, versioning, or snapshot scoping.
  - materiality: This weakens the ontology's purpose as an EMR/LIS synchronization authority because consumers need one authoritative displayed report status. In the failure condition, released_at remains recorded while a linked Result later becomes corrected, so downstream systems cannot determine whether the report should be shown as finalized or amended.
  - action: Make the lifecycle rule deterministic by either snapshot-scoping finalization or defining correction precedence. A corrected Result after release should supersede finalized and set Report.result_status to amended until a new report version or release is issued, or the model should otherwise specify versioned report snapshots so finalized and amended cannot overlap on the same status value.
- issue-002 (medium): CriticalValue currently combines two different concepts: the threshold/range that identifies a dangerous lab result and the notification state for a specific critical result occurrence. That weakens the ontology as a workflow authority because notification should be modeled as an auditable event tied to the result, order or patient, recipient, notifier, timestamp, status, and any external phone-log authority.
  - root cause: Critical-value threshold definition is conflated with per-occurrence notification workflow instead of modeling notification as a separate event tied to a specific result.
  - materiality: The declared purpose is operationally safe EMR/LIS integration using the ontology as the shared conceptual authority. This issue is material because critical-value notification is part of the safety workflow, not merely local recordkeeping. If the ontology exposes only a `notified` boolean and leaves decisive details outside the model, downstream systems lack a shared concept for coordinating, auditing, or displaying who was notified, when, by whom, and whether notification is pending, failed, or complete.
  - action: Separate the threshold/range concept from the notification workflow concept. Model a `CriticalValueThreshold` for bounds and criteria, and add a `CriticalValueNotification` or `CriticalResultEvent` linked to the specific result, order or patient, recipient, notifier, timestamp, delivery/status state, and the authoritative external phone log if that log remains outside the ontology. This should be fixed before downstream workflow use because later EMR/LIS behavior depends on the ontology carrying the correct event-level authority.
- issue-004 (medium): TAT is a material authority gap: the ontology names turnaround time as a workflow metric, but the authoritative derivation and ownership remain outside the ontology with the dashboard team.
  - root cause: TAT is named in the ontology but its authoritative calculation formula and ownership are delegated outside the ontology.
  - materiality: This weakens the declared purpose because the ontology is meant to serve as the shared concept authority for EMR/LIS integration. If TAT is governed by an external dashboard formula, operational dashboards, LIS, and EMR integrations can compute the same named metric differently, reducing trust in the ontology as the shared integration source.
  - action: Define TAT as a derived metric in the ontology, including source fields, calculation start and end events, inclusion and exclusion rules, ownership, and named projections for dashboard-specific variants. This preserves one canonical TAT concept while allowing governed variants instead of independent formulas.
- issue-006 (medium): The ontology cannot serve as a reliable Test-to-Assay authority while it requires both concepts to be maintained but does not define whether they are synonyms, mapped concepts, variants, or orderable versus executable units.
  - root cause: Test and Assay are split as catalog concepts without an explicit semantic boundary, mapping relation, or registration authority.
  - materiality: This weakens the stated EMR/LIS integration purpose because implementers need a stable authority for connecting EMR orderable tests to LIS/analyzer execution units. Without that boundary or mapping, each new lab item, assay variant, or mapping change can drift into local interpretation outside the ontology, reducing traceability from orders to performed assays and results.
  - action: Resolve the boundary before downstream integration design proceeds. Either merge Test and Assay if they are intended to be the same concept, or keep them distinct by defining Test as the orderable unit and Assay as the executable analytic unit, then add an explicit Test-to-Assay mapping with ownership, mapping status, specimen/analyzer variant handling, and registration authority.
- issue-007 (medium): The ontology materially under-models the specimen lifecycle because it stops at analysis and does not represent post-analysis storage, retention, disposal, return, or the policy evidence that authorizes those outcomes.
  - root cause: Specimen lifecycle scope stops at analysis and leaves post-analysis retention/disposal to external departmental policy.
  - materiality: This weakens the purpose of making the specimen-based clinical lab workflow a shared EMR/LIS conceptual authority. After analysis, systems still need to know whether a specimen can support retesting or additional testing, where it is retained, who controls it, whether disposal is complete, and which policy justified the action. If those facts remain in departmental policy outside the ontology, integration decisions fragment across local rules instead of a common workflow model.
  - action: Add explicit post-analysis specimen states such as stored, retained, disposed, returned, and rejected, or introduce SpecimenDisposition and SpecimenRetentionPolicy concepts. The model should cover storage location, retention period, disposition timestamp, responsible actor, and policy basis so the workflow can close the specimen lifecycle before relying on downstream audit, retest, or disposal decisions.
- issue-008 (medium): Specimen lifecycle가 analyzed에서 사실상 종료되고, 이후 보관·폐기·반송·재검 같은 후분석 처분을 Department와 연결된 확장 가능한 정책 개념으로 담지 못해 EMR/LIS 통합용 권위 모델로서의 추적 연속성이 약해진다.
  - root cause: Post-analysis specimen state and departmental disposition policy are not modeled as extensible ontology concepts.
  - materiality: 이 이슈는 검체 상태 모델을 운영 변경까지 수용하는 EMR/LIS 통합의 권위 문서로 쓰려는 목적을 약화시킨다. 부서별 보관·폐기 규칙이 새로 생기거나 바뀌면 온톨로지 안에는 analyzed 이후 상태나 정책 연결 구조가 없으므로, 구현자는 공통 모델 대신 부서 외부 내규를 별도로 해석해야 한다.
  - action: Specimen lifecycle에 보관, 폐기, 반송, 보류, 재검 같은 후분석 상태를 추가하거나, Department에 연결되는 SpecimenDispositionPolicy 개념을 도입해 부서별 lifecycle extension과 상태 전이를 참조하게 해야 한다. 핵심 순서는 먼저 post-analysis 처분을 권위 있는 개념으로 세우고, 그 다음 Department별 정책 차이를 그 개념의 속성이나 관계로 표현하는 것이다.
- issue-011 (medium): STAT ordering is materially underspecified because the ontology represents the same urgent-order concept three ways: `priority: stat`, `is_stat`, and `StatOrder`, without declaring which one is authoritative or how they must agree.
  - root cause: STAT is not normalized into one canonical representation or explicitly mapped across priority, boolean flag, and subtype forms.
  - materiality: The artifact is meant to serve as the concept authority for EMR/LIS integration design. With multiple independent STAT representations and no precedence or equivalence rule, an EMR and LIS could interpret the same order differently, causing disagreement about urgent handling. That weakens the ontology as a shared semantic contract for operationally sensitive STAT orders.
  - action: Fix this before the next integration stage by choosing one canonical STAT representation, preferably STAT as an order priority value with optional `stat_reason`, or by defining an explicit invariant that `StatOrder`, `priority: stat`, and `is_stat: true` are exactly equivalent while naming one representation as authoritative. This closes both the semantic authority problem and the narrowed structural concern that relation-based consumers need explicit equivalence or authority edges.
- issue-012 (medium): Patient, StatOrder, Assay, and CriticalValue are declared concepts but are not connected in the explicit relations graph, so the ontology is incomplete for relation-based EMR/LIS integration consumers.
  - root cause: The relation graph omits several declared entities because the ontology mixes attribute references, subtype declarations, and explicit relations without defining which edges are authoritative.
  - materiality: This weakens the ontology's stated purpose as an EMR/LIS concept authority for entities, relationships, and states because consumers that treat `relations:` as the authoritative graph cannot traverse patient association, STAT order subtype handling, assay execution mapping, or critical-value result/notification paths.
  - action: Close this before downstream use by either defining `type: ref` and `is_a` declarations as first-class graph edges or by adding explicit relations for Order-to-Patient, StatOrder-to-Order, Test-to-Assay, and CriticalValue-to-result/notification paths. The ordering matters because consumers need one authoritative graph rule before they can implement these concepts consistently.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: Logic preserves a narrower disagreement: it accepts the formally shown temporal precedence gap after correction, but does not treat delayed synchronization and authority ownership as independently proven formal contradictions without additional specification evidence.
- issue-003: Semantics lens는 사건/증거 개념 추가에는 동의하지만, 이 문제를 독립 고위험 이슈라기보다 threshold/result와 notification event의 의미 경계 문제로 더 좁게 본다.
- issue-005: Deliberation resolved the issue in favor of the broad high-severity governance/versioning action. The semantics lens remained narrower, treating the specimen shared-code-set meaning boundary as the directly supported semantic subproblem; additional semantic evidence would be needed for full semantics-lens convergence on the broader governance scope.

## Deliberation Decision
- issue-001: resolved
- issue-003: narrowed
- issue-005: resolved
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the concept authority document for EMR/LIS integration and clinician-facing report semantics. Source finding context: Use the ontology as the concept authority document for EMR/LIS integration and operational workflow design. Source finding context: EMR/LIS 통합에서 결과 상태의 권위와 변경 연속성을 보장하는 목적. Source finding context: Use as a concept authority for EMR/LIS integration and clinician-facing report semantics.
- issue-003: EMR/LIS 통합의 개념 권위 문서로서 엔티티·관계·상태와 운영 위험을 설명하는 목적
- issue-005: EMR/LIS integration에서 검사 카탈로그, 중요값 기준, 성과 지표, 주문/수행 검체를 안정적으로 연결하는 개념 권위를 제공하는 목적 Source finding context: EMR/LIS 통합에서 검사 카탈로그, 중요값 기준, 성과 지표의 개념 권위를 제공하는 목적 Source finding context: EMR/LIS 통합에서 주문 요구 검체, 실제 검체, 분석기 수행 검체를 안정적으로 연결하는 개념 권위 목적.
- issue-009: Use the ontology as the EMR/LIS integration concept authority for entity, relationship, and state behavior.
- issue-010: Use the ontology as a state authority for EMR/LIS report synchronization.
- issue-002: Support operationally safe EMR/LIS integration using the ontology as the shared conceptual authority. Source finding context: Use as an operationally safe concept authority for clinical lab workflow integration.
- issue-004: Use the ontology as a concept authority for EMR/LIS integration across entities, relations, and states.
- issue-006: Use as the shared concept authority for order-to-analysis EMR/LIS integration. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 주문 카탈로그와 수행 카탈로그의 확장 규칙을 제공하는 목적. Source finding context: EMR/LIS integration design from orderable tests to LIS/analyzer execution units.
- issue-007: 검체 기반 임상검사 워크플로를 EMR/LIS 통합의 개념 권위로 닫는 목적
- issue-008: 검체 상태 모델을 EMR/LIS 통합의 권위 문서로 사용해 운영 변경을 수용하는 목적.
- issue-011: Use as the concept authority document for EMR/LIS integration design.
- issue-012: Use of the ontology as the EMR/LIS integration concept authority for entities, relationships, and states.

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Issue-001 should be retained as a high-severity material issue: the ontology splits result/report status authority across `Result.status` and `Report.result_status` without a precise authoritative state, mapping, timing, and correction-propagation contract. Unresolved disagreement remains: Logic preserves a narrower disagreement: it accepts the formally shown temporal precedence gap after correction, but does not treat delayed synchronization and authority ownership as independently proven formal contradictions without additional specification evidence.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-003 (high): fix_before_release, fix_now
- issue-005 (high): fix_before_release, fix_now
- issue-009 (high): fix_now
- issue-010 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-004 (medium): follow_up
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): follow_up
- issue-008 (medium): follow_up
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, fix_now

## Recommendations
- issue-013 (low): The relation Specimen produces Result blurs material provenance with operational production. Source finding context: Specimen-to-Result relation naming Source finding context: .onto/review/20260718-0c3a8973/execution-preparation/materialized-input.md:118, .onto/review/20260718-0c3a8973/execution-preparation/materialized-input.md:119 Source finding context: The relation `Specimen produces Result` gives a physical specimen the semantic role of producing a result. Source finding context: A specimen is the physical source material; the analysis process, assay, instrument, or lab workflow produces the result. Calling the specimen the producer blurs source material with operational actor/process. This is a semantic naming mismatch, even if a derived-from relation is appropriate. Source finding context: Keep `Result derived_from Specimen` for material provenance and replace `Specimen produces Result` with a relation from `Assay` or an analysis event/process to `Result`, if that process concept is in scope. Source finding context: .onto/review/20260718-0c3a8973/round1/semantics.findings.yaml#semantics-candidate-005

## Unique Finding Tagging
- issue-013 (low): The relation Specimen produces Result blurs material provenance with operational production. Source finding context: Specimen-to-Result relation naming Source finding context: .onto/review/20260718-0c3a8973/execution-preparation/materialized-input.md:118, .onto/review/20260718-0c3a8973/execution-preparation/materialized-input.md:119 Source finding context: The relation `Specimen produces Result` gives a physical specimen the semantic role of producing a result. Source finding context: A specimen is the physical source material; the analysis process, assay, instrument, or lab workflow produces the result. Calling the specimen the producer blurs source material with operational actor/process. This is a semantic naming mismatch, even if a derived-from relation is appropriate. Source finding context: Keep `Result derived_from Specimen` for material provenance and replace `Specimen produces Result` with a relation from `Assay` or an analysis event/process to `Result`, if that process concept is in scope. Source finding context: .onto/review/20260718-0c3a8973/round1/semantics.findings.yaml#semantics-candidate-005

## Shared Phenomenon Summary
- none
