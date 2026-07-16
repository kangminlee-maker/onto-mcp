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
- issue-001 (high): Inventory authority and temporality must be closed in the ontology before it can serve as a reliable WMS/TMS/ERP integration baseline. The current model lets live allocation, WMS/ERP reconciliation, and future real-time inventory extension depend on current or nightly stock numbers whose source authority, effective time, and allocation basis are not explicit.
  - root cause: Inventory availability is modeled as current/nightly quantities without first-class authority, effective time, source qualification, or allocation/reservation events.
  - materiality: This weakens the declared purpose because inventory allocation, order receipt, shipment decisions, and WMS/ERP reconciliation all require knowing which inventory value is authoritative and when it applies. If intraday allocation reads a nightly InventoryAggregate.available_qty or an ambiguous InventoryRecord.quantity_on_hand, the baseline cannot justify allocation decisions, reconstruct stock at order time, or audit later WMS/ERP discrepancies.
  - action: Separate inventory quantity concepts by authority, purpose, source system, effective/as-of time, snapshot or calculation basis, and allocation/reservation events. Treat nightly ERP reconciliation as its own reconciliation state and timestamped accounting alignment, not as the live allocation authority. Allocation rules should reference an explicitly authorized and fresh inventory view or reservation ledger, so physical availability, available-to-promise, reserved quantity, and accounting quantity can evolve without changing the meaning of existing records.
- issue-004 (high): Partial, split, substituted, backordered, or exception fulfillment cannot be represented at the order-line quantity grain because fulfillment is modeled only from Shipment to Order, not from shipment or allocation activity to specific OrderLine quantities.
  - root cause: Fulfillment is modeled only at Shipment-to-Order granularity, while OrderLine has no shipment, leg, or allocation fulfillment edge.
  - materiality: This materially weakens the WMS/TMS/ERP baseline because reconciliation and exception handling depend on knowing which SKU quantity on which commercial order line was picked, shipped, delivered, backordered, substituted, or cancelled. Order-level fulfillment collapses those distinctions, so physical movement and delivery evidence cannot be tied back to the obligations that operations and finance need to reconcile.
  - action: Add a line-level fulfillment or allocation concept, such as FulfillmentLine or ShipmentLine, that connects OrderLine to Shipment and, where needed, DeliveryLeg or package evidence. It should carry fulfilled quantity, shipped quantity, and fulfillment status so order-level fulfillment can remain only as a derived aggregate after the line-level truth exists.
- issue-014 (high): OrderLine is structurally disconnected from the Shipment that fulfills it, leaving the ontology unable to represent which order-line quantity was satisfied by which physical shipment, leg, or allocation.
  - root cause: The fulfillment relation is modeled only at Shipment-to-Order granularity while OrderLine lacks a shipment or leg fulfillment edge.
  - materiality: This materially weakens the declared WMS/TMS/ERP integration baseline because order-line fulfillment is a core reconciliation path between commercial order detail and shipment execution. Under multiple lines, partial fulfillment, split shipments, or line-level exceptions, consumers cannot determine line-level fulfillment status, shipment composition, delivery progress, or exception responsibility from the ontology itself.
  - action: Add an explicit line-level fulfillment structure, such as ShipmentLine or FulfillmentAllocation, relating OrderLine to Shipment with fulfilled_qty and optional DeliveryLeg or package references. Keep the existing order-level fulfills relation only as a derived or summary relation if useful, because the line-level allocation must be the authoritative structure for partial, split, and exception workflows.
- issue-002 (medium): issue-002는 소스 시스템별 중량·치수 단위 관례를 그대로 허용하는 설계가 물류 통합 기준 문서의 운영 위험 감소 목적을 약화한다는 material issue이다. 다만 독립 remediation root라기보다 issue-005/issue-011의 canonical measurement-unit cluster에 속하는 source-convention/value-alignment 증상으로 유지되어야 한다.
  - root cause: 물류 수량 단위를 canonical concept로 승격하지 않고 source-system convention을 통합 기준 안에 그대로 허용한 설계 결정.
  - materiality: WMS/TMS/ERP 통합 기준은 주문·화물·배송 값이 운임 산정, 적재 계획, 라벨, carrier handoff, 배송 예외 처리에서 일관되게 해석되도록 해야 한다. 그런데 Sku.weight와 Sku.dims가 kg/lb 또는 문자열 단위를 소스 시스템 관례에 맡기고 Shipment.total_weight가 OrderLine 중량 합으로 저장되면, 서로 다른 단위 값이 합산·전달될 수 있다. 이는 통합 기준이 단위 불일치 위험을 예방하지 못하고 각 연동의 관례 차이를 운영 경로로 전파하게 만든다.
  - action: weight와 dims를 수치 값과 canonical unit으로 분리하고 원천 단위와 변환 시점·방법을 보존해야 한다. Shipment.total_weight는 canonical unit 기반 계산 결과와 계산 기준 시점/version을 포함해야 하며, 단위가 확정되지 않은 값은 출하 확정 계산에 사용할 수 없도록 모델링해야 한다. remediation은 issue-005/issue-011의 measurement-unit cluster와 함께 처리해 중복 수정 없이 같은 root를 닫는 순서가 적절하다.
- issue-003 (medium): State interpretation is materially weak because order fulfillment, shipment, carrier tracking, and displayed ETA/state values are not governed by a canonical versioned status model; instead, meaning and authority are delegated to independent systems, integrations, and operations judgment.
  - root cause: Carrier-native statuses, canonical shipment/order statuses, mapping precedence, and mapping versions are not modeled as first-class concepts.
  - materiality: This weakens the declared WMS/TMS/ERP integration baseline purpose because the ontology is supposed to provide a common state and authority reference for order, shipment, tracking, and carrier coordination. When carrier events, TMS shipment statuses, OMS order statuses, ETA overrides, or new carrier status codes are used together, delivered, delayed, exception, and completed decisions can drift by integration or time period rather than following one reproducible baseline.
  - action: Add a canonical fulfillment/shipment state model and separate it from native carrier status data. Preserve carrier_code, native_status_code, and native_status_version; introduce versioned StatusMapping with canonical status, mapping_version, effective dates, precedence, conflict resolution, freshness rules, and displayed-state authority. ETA overrides should be modeled separately from carrier ETA with audit and display-decision rules, so source truth, operational override, and final presentation do not collapse into one field.
- issue-005 (medium): SKU weight, SKU dimensions, and Shipment.total_weight need canonical measurement semantics because the current model leaves physical quantities as source-local numbers or strings that cannot be trusted across warehouse, carrier, or unit-rule changes.
  - root cause: Physical measurements are stored as source-local number/string fields without unit, source, conversion basis, or calculation version.
  - materiality: This weakens the declared WMS/TMS/ERP baseline purpose because freight rating, routing, capacity, cartonization, and reconciliation depend on comparable physical quantities. If warehouses or source systems mix kg/lb or dimension conventions, shipment totals derived from unitless SKU values can silently combine incompatible units, and historical totals cannot be reliably interpreted, converted, or audited after standardization.
  - action: Model weight and dimensions as quantity value objects containing value, canonical unit, source or measurement system, measured/calculated timestamp, conversion basis, and source unit where relevant. Derived shipment totals should also be modeled as derived measurement values with unit, derivation timestamp, conversion rule, and calculation version, so unit normalization is established before shipment, carrier-rating, routing, capacity, and audit workflows depend on the values.
- issue-006 (medium): Manual ETA overrides and inventory reconciliation changes are a material auditability gap: the ontology can hold changed ETA or inventory values, but it cannot represent who changed them, when, on what basis, or what prior and new values were involved.
  - root cause: The ontology represents final mutable values but omits control-action evidence concepts for manual and batch changes.
  - materiality: This weakens the declared purpose of an operationally trustworthy WMS/TMS/ERP concept baseline because customer-facing ETA changes and accounting/warehouse stock-truth changes must be explainable and challengeable. Without audit evidence for manual judgment and reconciliation adjustments, the shared model cannot support accountability, dispute analysis, or operational trust when mutable values change.
  - action: Add audit/control concepts for manual overrides, operational decisions, and inventory adjustments before the next stage. These concepts should link each controlled change to actor, occurred_at, source or basis value, prior value, new value, reason, approval or reference evidence, and affected shipment or inventory entities, so ETA and inventory-truth changes become traceable rather than only final-state values.
- issue-007 (medium): Common non-happy-path and post-delivery fulfillment outcomes cannot currently be represented as order or shipment lifecycle states. The lifecycle model should be fixed before the next stage because it otherwise forces materially different outcomes into happy-path states or external handling.
  - root cause: Lifecycle coverage is limited to forward happy-path fulfillment states without exception, return, failure, cancellation, resolution, or correction concepts.
  - materiality: The declared purpose is to provide a concept baseline for order, shipment, and delivery state models that can support customer service, inventory, and settlement. A baseline that cannot represent cancellation, delivery failure, returns, carrier exceptions, or post-delivery corrections leaves integrations without shared operational-risk meanings, so different systems may interpret or overload states inconsistently.
  - action: Extend the lifecycle models with explicit non-happy-path and post-delivery states or events, such as canceled, delivery_failed, exception_open, exception_resolved, return_initiated, returned, corrected, or reissued. Also define how tracking events transition or annotate shipment and order state, because the tracking exception concept must connect to the canonical lifecycle rather than remain an isolated event value.
- issue-008 (medium): DeliveryLeg should not remain a subtype of Shipment. The current model makes a route segment inherit the meaning of an end-to-end warehouse-to-customer shipment, so leg-level records are classified and related as whole shipments even when they only represent one segment of a route.
  - root cause: A route segment is modeled with subtype inheritance from end-to-end Shipment instead of composition, conflating leg lifecycle and fulfillment semantics with whole-shipment semantics.
  - materiality: This weakens the WMS/TMS/ERP concept baseline because multi-leg, hub-transfer, multiple-carrier, leg-specific ETA/status, and reverse-logistics routes need DeliveryLeg records that are not themselves complete shipments. With the current inheritance, integration rules can incorrectly apply whole-shipment status, carrier, weight, and order-fulfillment relations to individual route legs.
  - action: Separate end-to-end Shipment from DeliveryLeg composition. Model Shipment as owning or being connected to ordered route legs through a ShipmentRoute or LegAssignment structure, with leg_seq, from/to, carrier, leg_status, and leg_eta on the leg or assignment. Keep fulfills on the whole Shipment, or move allocation semantics to a separate FulfillmentAllocation if fulfillment must be split explicitly.
- issue-009 (medium): DeliveryLeg must not remain modeled as a subtype of Shipment. In the reviewed ontology, that inheritance makes a route segment look like the same kind of thing as the whole shipment, so leg-level TMS state can be mistaken for whole-shipment fulfillment state.
  - root cause: DeliveryLeg is declared as a Shipment, so route segment meaning is confused with whole cargo movement meaning.
  - materiality: The declared purpose is to provide a WMS/TMS/ERP integration baseline that consistently distinguishes order, cargo, and delivery concepts. This issue weakens that purpose because multi-leg delivery depends on separating a leg's operational progress from the whole shipment's customer-facing and fulfillment meaning; if they are mapped as equivalent, delivery completion, freight handling, and order fulfillment judgments can be made at the wrong grain.
  - action: Model DeliveryLeg as a route component, such as part of a ShipmentRoute or ShipmentLeg structure, rather than as a Shipment subtype. Then connect Shipment to one or more DeliveryLeg instances through composition, split leg status from whole Shipment status, and keep fulfills constrained to the whole shipment or the actual fulfillment allocation grain. This should be handled with the broader DeliveryLeg inheritance-versus-composition correction so the semantic fix and structural type fix land together.
- issue-010 (medium): quantity_on_hand should be retained as a material, narrowed issue: it hides the difference between WMS physical on-hand stock and ERP accounting/book inventory, so the ontology cannot state which inventory quantity is authoritative for a given decision.
  - root cause: WMS physical inventory and ERP accounting inventory are represented by one quantity_on_hand property despite different authority, purpose, and reconciliation timing.
  - materiality: This weakens the declared purpose of clarifying inventory authority and state for WMS/ERP integration. If lookup, allocation, or accounting adjustment reads the same quantity_on_hand field as either physical stock or book inventory depending on context, availability decisions and accounting corrections can conflict while appearing to use one shared inventory truth.
  - action: Split the concept into explicit quantities such as physical_on_hand_qty for WMS authority and accounting_inventory_qty or erp_book_qty for ERP authority. Each quantity should carry source_system, authority, and as_of or reconciled_at timing, while reconciliation or derivation between them should be represented separately. This should be handled as a concrete follow-up under the broader issue-001 inventory authority and temporality cluster, not as a replacement for that broader root issue.
- issue-011 (medium): Material issue: weight, dimensions, and shipment total_weight are not semantically reliable because their units, calculation basis, and conversion rules are not explicit. Deliberation narrowed this issue into issue-005's canonical measurement quantity scope while preserving issue-011's semantic requirements.
  - root cause: Measurement units are not modeled as part of the semantic meaning of weight, dimensions, and derived shipment totals.
  - materiality: This weakens the WMS/TMS/ERP freight and delivery unit-consistency purpose because the same numeric field can mean kg, lb, or a source-specific dimension convention. When multiple warehouses or systems contribute SKU measurements to one shipment, freight, loading, and delivery restriction decisions can be based on incompatible quantities that look identical in the model.
  - action: Consolidate the fix under issue-005's canonical measurement quantity work: represent weight and dimensions as explicit value-plus-unit fields or normalized quantities, and make total_weight carry its calculation unit, calculation time, conversion rules, and conversion history. This should be addressed before relying on shipment totals for freight, loading, or delivery constraints because the derived value depends on correct source-unit interpretation.
- issue-012 (medium): InventoryAggregate.available_qty should be carried forward as a material issue because it is named and consumed like current available inventory while representing a nightly snapshot used for intraday allocation.
  - root cause: InventoryAggregate.available_qty is named as current availability while actually representing a nightly snapshot also used for intraday allocation.
  - materiality: This weakens the purpose of clarifying availability meaning and time basis across order and inventory integration. If OMS/WMS/ERP consumers read available_qty as current allocatable stock when it is only a stale snapshot, allocation criteria become ambiguous and can cause either over-allocation or overly conservative under-allocation.
  - action: Rename and model the value as a timestamped snapshot, such as available_qty_snapshot with snapshot_as_of and source traceability, or split current allocatable quantity into a separate real-time derived concept with explicit authority and freshness. This should be coordinated with issue-001's broader inventory temporality work so the available_qty-specific ambiguity is fixed without duplicating generic inventory authority remediation.
- issue-015 (medium): Issue-015 is a material route-composition gap: the ontology cannot reconstruct which DeliveryLeg records compose an end-to-end Shipment, or their order, for multi-leg delivery paths.
  - root cause: DeliveryLeg is modeled through inheritance but no composition relation connects an end-to-end shipment or route to its ordered legs.
  - materiality: This weakens the WMS/TMS/ERP shipment and delivery integration baseline because integrations need a dependable structure for connecting route segments, locations, carrier responsibility, and tracking events back to the shipment path. When a shipment has multiple legs, the current model cannot identify the ordered route or localize events to a specific segment.
  - action: Fix this before the next stage by adding an explicit ordered composition structure: either Shipment has_many DeliveryLeg ordered by leg_seq, or a Route entity contains ordered DeliveryLeg instances. Coordinate the fix with issue-008 because both share the inheritance-versus-composition cause, but preserve issue-015 as the distinct requirement for ordered route reconstruction and leg-level traceability. Also define whether TrackingEvent attaches to Shipment, DeliveryLeg, or both.
- issue-016 (medium): InventoryAggregate is a material structural traceability issue: allocation reads available_qty from an aggregate SKU quantity, but the ontology does not show which warehouse-scoped InventoryRecord records, source authorities, snapshot/as-of metadata, or calculation basis produced that value.
  - root cause: InventoryAggregate is represented as a standalone SKU quantity without structural derivation from warehouse inventory records, source systems, authorities, or snapshot metadata.
  - materiality: This weakens the WMS/ERP inventory concept baseline for allocation and reconciliation because consumers can use the aggregate allocation quantity but cannot explain, verify, reconcile, or route disputes about available_qty back to warehouse records or source systems.
  - action: Add explicit derivation or aggregation relations from InventoryAggregate to the source InventoryRecord sets, including warehouse scope, source authority, snapshot/as-of metadata, and calculation basis. This should be carried forward as the narrow derivation and traceability facet linked to the broader inventory authority issue, so available_qty can be audited without duplicating the wider issue-001 concern.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: narrowed
- issue-010: narrowed
- issue-011: narrowed
- issue-012: narrowed
- issue-015: resolved
- issue-016: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: WMS/TMS/ERP integration concept baseline for inventory allocation, WMS/ERP reconciliation, order receipt, and shipment decisions. Source finding context: WMS/TMS/ERP 통합의 개념 기준 문서로서 주문·재고 개념의 권위와 시간성 정합성을 제공하는 목적. Source finding context: Use as a concept baseline for inventory allocation and WMS/ERP reconciliation. Source finding context: WMS/TMS/ERP 통합의 개념 기준 문서로서 주문 접수, 재고 할당, 출하 판단의 권위와 시간성을 안정적으로 정의하는 목적.
- issue-004: WMS/TMS/ERP concept baseline for order, inventory allocation, shipment, delivery, reconciliation, and exception handling. Source finding context: Use as a concept baseline for WMS/TMS/ERP integration across orders, inventory allocation, shipment, and delivery.
- issue-014: WMS/TMS/ERP concept baseline for order, inventory, shipment, and delivery integration. Source finding context: Using the ontology as the concept baseline for order, inventory, shipment, and delivery integration across WMS/TMS/ERP.
- issue-002: WMS/TMS/ERP 통합의 개념 기준 문서로서 주문·화물·배송 단위 정합성과 물류 운영 위험을 다루는 목적.
- issue-003: WMS/TMS/ERP integration concept baseline for order, shipment, tracking, and external carrier state coordination. Source finding context: WMS/TMS/ERP 통합의 개념 기준 문서로서 주문·화물·배송 상태 모델과 권위 정합성을 제공하는 목적. Source finding context: TMS/캐리어 상태와 OMS/ERP 상태를 통합할 때 외부 상태 변경에도 안정적인 기준과 이력 재현성을 제공하는 목적.
- issue-005: WMS/TMS/ERP concept baseline for SKU, freight, shipment, carrier rating, routing, and capacity integration. Source finding context: Use as a concept baseline for SKU, freight, and carrier integration. Source finding context: WMS/TMS/ERP 통합에서 SKU, 출하, 운송 요율·제약 판단에 쓰이는 수량 단위의 공통 기준 제공.
- issue-006: Operationally trustworthy WMS/TMS/ERP concept baseline for customer-facing ETA and accounting/warehouse inventory reconciliation changes. Source finding context: Use as an operationally trustworthy WMS/TMS/ERP concept baseline.
- issue-007: Concept baseline for order, shipment, delivery state models, customer service, inventory, and settlement. Source finding context: Use as a concept baseline for order, shipment, and delivery state models.
- issue-008: WMS/TMS/ERP concept baseline for cargo movement, delivery routes, shipment status, and order fulfillment relations. Source finding context: TMS 통합에서 전체 화물, 배송 구간, 주문 충족 관계를 확장 가능한 개념 기준으로 제공하는 목적. Source finding context: Concept baseline for WMS/TMS/ERP integration across orders, cargo, and delivery.
- issue-009: WMS/TMS/ERP integration concept baseline for consistently distinguishing order, cargo, and delivery concepts. Source finding context: WMS/TMS/ERP 통합의 개념 기준 문서로서 주문·화물·배송 개념을 일관되게 구분하는 목적.
- issue-010: Inventory concept authority and state clarity for WMS/ERP integration. Source finding context: 재고 개념의 권위와 상태를 WMS/ERP 통합 기준으로 명확히 하는 목적.
- issue-011: WMS/TMS/ERP concept baseline for freight and delivery unit consistency. Source finding context: 화물·배송 개념의 단위 정합성을 WMS/TMS/ERP 통합 기준으로 제공하는 목적.
- issue-012: Order and inventory integration clarity for availability meaning and time basis. Source finding context: 주문·재고 통합에서 재고 가용성의 의미와 시간 기준을 명확히 하는 목적.
- issue-015: WMS/TMS/ERP concept baseline for shipment and delivery integration. Source finding context: Using the ontology as a concept baseline for shipment and delivery integration.
- issue-016: WMS/ERP inventory concept baseline for allocation and reconciliation. Source finding context: Using the ontology as the inventory concept baseline for WMS/ERP allocation and reconciliation.

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Inventory authority and temporality must be closed in the ontology before it can serve as a reliable WMS/TMS/ERP integration baseline. The current model lets live allocation, WMS/ERP reconciliation, and future real-time inventory extension depend on current or nightly stock numbers whose source authority, effective time, and allocation basis are not explicit. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-014 (high): fix_now, follow_up
- issue-002 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_now
- issue-009 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, follow_up

## Recommendations
- issue-013 (low): carrier ETA, operations-adjusted ETA, and displayed ETA may lose source meaning when represented as one eta value. Source finding context: Shipment.eta Source finding context: .onto/review/20260716-9ee88c8b/execution-preparation/materialized-input.md:49,117 Source finding context: eta가 캐리어 ETA와 운영팀 조정 ETA를 한 값으로 합쳐 예측값의 출처 의미를 잃는다. Source finding context: 캐리어가 제공한 ETA와 운영팀이 표시용으로 조정한 ETA는 출처와 사용 목적이 다르다. 단일 eta 속성은 원천 예측, 운영 보정, 최종 표시값을 같은 의미로 보이게 하므로 TMS/캐리어/고객 표시 간 의미 매핑이 흐려진다. Source finding context: carrier_eta, ops_adjusted_eta, displayed_eta를 분리하거나 eta 값에 source, authority, adjusted_by, adjusted_at을 명시한다. 최종 표시값이 운영팀 판단이라면 그 파생 규칙을 별도 속성 또는 규칙으로 둔다. Source finding context: .onto/review/20260716-9ee88c8b/round1/semantics.findings.yaml#semantics-candidate-005

## Unique Finding Tagging
- issue-013 (low): carrier ETA, operations-adjusted ETA, and displayed ETA may lose source meaning when represented as one eta value. Source finding context: Shipment.eta Source finding context: .onto/review/20260716-9ee88c8b/execution-preparation/materialized-input.md:49,117 Source finding context: eta가 캐리어 ETA와 운영팀 조정 ETA를 한 값으로 합쳐 예측값의 출처 의미를 잃는다. Source finding context: 캐리어가 제공한 ETA와 운영팀이 표시용으로 조정한 ETA는 출처와 사용 목적이 다르다. 단일 eta 속성은 원천 예측, 운영 보정, 최종 표시값을 같은 의미로 보이게 하므로 TMS/캐리어/고객 표시 간 의미 매핑이 흐려진다. Source finding context: carrier_eta, ops_adjusted_eta, displayed_eta를 분리하거나 eta 값에 source, authority, adjusted_by, adjusted_at을 명시한다. 최종 표시값이 운영팀 판단이라면 그 파생 규칙을 별도 속성 또는 규칙으로 둔다. Source finding context: .onto/review/20260716-9ee88c8b/round1/semantics.findings.yaml#semantics-candidate-005

## Shared Phenomenon Summary
- none
