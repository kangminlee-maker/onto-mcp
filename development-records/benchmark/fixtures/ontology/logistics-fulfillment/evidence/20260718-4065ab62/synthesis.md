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
- issue-001 (high): Issue-001 is a high-severity material defect: the ontology cannot safely serve as a WMS/TMS/ERP integration baseline while allocation depends on current or nightly inventory quantity surfaces instead of time-scoped, source-authoritative availability records.
  - root cause: Inventory allocation depends on non-temporal current/nightly quantity surfaces rather than a time-scoped, source-authoritative availability model.
  - materiality: The declared purpose depends on clear authority and temporality for order, inventory, shipment, and delivery concepts. Using a nightly InventoryAggregate for intraday allocation while WMS operational quantities and ERP accounting quantities may diverge weakens that purpose because consumers cannot know which inventory fact is authoritative, when it is valid, or how to reconstruct allocation decisions later. This can drive oversell, under-allocation, reconciliation failures, and audit disputes.
  - action: Fix this before the next integration-baseline stage by separating physical, accounting, and allocatable inventory concepts; adding as_of/effective_at validity; defining the source authority for each consuming context; and requiring allocations or reservations to reference a current WMS-backed or event-sourced availability record rather than a daily ERP-aligned snapshot. Add temporal InventorySnapshot, InventoryMovement or InventoryTransaction, and Reservation/Allocation concepts so allocation correctness and audit reconstruction have explicit authority and time semantics.
- issue-005 (high): The ontology has a material fulfillment coverage gap: fulfillment is modeled only from Shipment to Order, so it cannot represent which OrderLine quantity was allocated, picked, shipped, canceled, or backordered in a specific shipment or delivery leg.
  - root cause: The ontology's fulfillment relation is scoped to `Shipment -> Order` and does not include a line-level fulfillment/allocation entity.
  - materiality: The declared purpose is a WMS/TMS/ERP integration baseline across order, inventory, shipment, and delivery concepts. That purpose requires reconciliation at the operational unit where fulfillment actually happens: ordered SKU quantities. If a multi-line order or partially fulfilled line is split across shipments, the model cannot bind fulfilled quantity to shipment evidence, inventory decrement, delivery progress, or customer-facing status, making exception handling non-actionable.
  - action: Add a line-fulfillment concept, such as FulfillmentAllocation or ShipmentLine, before advancing the ontology. It should reference OrderLine and Shipment or DeliveryLeg, carry fulfilled quantity, allocation/pick/ship timestamps, and lifecycle/status for partial, canceled, and backordered quantities. This is required to make order promise, inventory movement, shipment confirmation, and delivery evidence traceable through the same fulfillment unit.
  - unresolved disagreement: Deliberation narrowed but did not fully resolve the issue: coverage keeps the issue distinct and high severity because it blocks operational reconstruction, while axiology accepts the issue and action but preserves a medium severity caveat from the value-alignment lens and its relationship to issue-004.
- issue-007 (high): 부분출하, 다중창고 출고, 백오더 같은 분할 충족 패턴을 지원하려면 현재의 Order 단위 fulfills 구조를 유지한 채로는 충분하지 않으며, 충족 권위를 OrderLine 수량 또는 별도 FulfillmentAllocation/ShipmentLine 단위로 내려야 합니다.
  - root cause: 충족 관계의 권위 단위가 OrderLine 수량이 아니라 Order 전체로 고정되어 있다.
  - materiality: 검토 대상의 목적은 주문, 재고 할당, 출하, 배송을 WMS/TMS/ERP 통합 기준으로 연결하는 것입니다. 그러나 현재 모델은 Shipment가 Order 전체를 fulfills하는 관계만 두고 OrderLine 수량이 어떤 화물 또는 배송 구간으로 충족됐는지 표현하지 못합니다. 그 결과 한 주문줄이 여러 출하로 나뉘거나 여러 주문줄이 한 화물에 섞이는 경우, 통합 시스템이 어느 재고 할당과 출하가 어느 고객 주문 품목을 충족했는지 공통 기준으로 판단할 수 없어 목적을 약화합니다.
  - action: 릴리스 전 수정하려면 OrderLine 또는 별도 FulfillmentAllocation/ShipmentLine 개념을 도입해 OrderLine 수량의 어느 부분이 어떤 Shipment 또는 DeliveryLeg로 충족되는지 표현해야 합니다. 또한 Order.fulfillment_status는 이 세부 충족 상태에서 파생되도록 권위 관계를 정리해야 합니다. 이 결정은 부분출하, 다중창고 출고, 백오더 확장 전에 닫혀야 하는 구조적 선행 조건입니다.
  - unresolved disagreement: 진화 관점은 확장 차단 효과 때문에 high severity를 유지하지만, axiology 관점은 동일한 root cause를 수용하면서도 가치 목적만 기준으로 보면 medium severity라는 caveat를 남겼습니다.
- issue-010 (high): Inventory quantity and ETA cannot be trusted as integration baseline values until the ontology models which source governs each value, what context it governs, and what evidence explains overrides or supersession.
  - root cause: The ontology describes multi-source controlled values without source-of-truth, provenance, or override evidence concepts.
  - materiality: The stated purpose is to provide a WMS/TMS/ERP concept baseline with clear authority for inventory, shipment, ETA, and audit-relevant values. That purpose is weakened because WMS physical inventory, ERP accounting inventory, carrier ETA, and manually adjusted ETA are all described as possible values, but the ontology does not say which value controls allocation, accounting reconciliation, customer display, or audit explanation when they differ.
  - action: Fix this before the next stage by adding explicit authority and provenance concepts such as SystemOfRecordPolicy, QuantityAssertion, EtaEstimate, and ManualOverride. These should capture source system, effective/as-of time, governing consuming context, actor, reason, superseded value, and reconciliation or override status so inventory and ETA consumers can determine the authoritative value and explain why it governs.
- issue-014 (high): OrderLine fulfillment is materially incomplete because the ontology describes shipment composition in terms of order lines but provides no structural way to say which OrderLine quantity was fulfilled by which Shipment or DeliveryLeg.
  - root cause: The fulfillment relation is modeled only at order granularity even though shipment composition is described in terms of order lines.
  - materiality: The declared purpose is a WMS/TMS/ERP integration reference across order, inventory, shipment, and delivery concepts. Without line-level fulfillment traceability, consumers cannot reconcile OMS line status, WMS pick/pack records, TMS shipment contents, and carrier delivery events when orders are split, partially shipped, or mixed into shipments with lines from multiple orders.
  - action: Add a line-level fulfillment or allocation structure, such as ShipmentLine or FulfillmentAllocation, that links OrderLine to Shipment and optionally DeliveryLeg, with shipped or allocated quantity and status-relevant timestamps. This should be closed before the next stage because downstream reconciliation, shipment contents, partial fulfillment, and delivery evidence depend on this mapping.
  - unresolved disagreement: Deliberation accepted the root and narrowed the issue to a structural line-level traceability defect, but preserved axiology's caveat that severity is medium under value-purpose criteria while structure keeps high severity for structural completeness.
- issue-002 (medium): Freight weights, dimensions, and shipment totals are not safe integration values while they remain bare numbers or strings. The ontology must model them as structured measurements with explicit value, unit, source, conversion basis, and relevant package or handling-unit level before it can serve as a unit-consistent WMS/TMS/ERP baseline.
  - root cause: Freight measurement failures stem from representing logistics measurements as bare numbers or strings instead of structured value/unit/source measurements.
  - materiality: This is material because the declared purpose depends on unit consistency and logistics operating risk control. If SKU measurements from different warehouses or source systems can be combined without known units or basis, shipment totals can be numerically valid-looking but operationally wrong, weakening carrier rating, routing, capacity planning, cost calculation, reconciliation, and trust in the ontology.
  - action: Fix this before the next stage by introducing normalized measurement concepts for weight and dimensions, including value, unit of measure, precision, source, effective time, and conversion policy. Define canonical integration units for shipment totals, store total_weight with unit and derivation metadata, and attach gross, net, dimensional weight, and dimensions to the correct package or handling-unit level such as carton, pallet, parcel, or shipment container.
- issue-003 (medium): The ontology has a material status-model gap: it does not define a versioned canonical mapping from external carrier event codes to internal shipment states, so integrations can derive different meanings for the same shipment lifecycle evidence.
  - root cause: Status-model inconsistency and evolution fragility both stem from lacking a versioned canonical status/event mapping between external carrier codes and internal shipment states.
  - materiality: This weakens the declared purpose of serving as the WMS/TMS/ERP integration status-model and authority baseline. If carrier event meanings and shipment status transitions are left to each integration, consumers can disagree on in_transit, exception, delivered, and other terminal or non-happy-path states, undermining coordination, customer notifications, exception handling, and auditability.
  - action: Define a canonical lifecycle/status mapping table before treating the ontology as the shared status baseline. The table should separate external carrier_event_code from canonical shipment state, include mapping versions, transition rules, terminal-state precedence, exception handling, and the authority allowed to advance or correct each state; stable enums should remain high-level categories while detailed external codes live in extensible mapping/code-set structures.
- issue-004 (medium): Issue-004 is a material traceability gap: the ontology needs a line-level fulfillment/allocation authority, not only a Shipment-to-Order fulfillment relation, to serve as an order, freight, and delivery integration standard.
  - root cause: The ontology optimizes for order-level fulfillment simplicity instead of preserving line-level operational traceability.
  - materiality: The declared purpose is to support order, freight, and delivery workflows while controlling logistics operating risk. When fulfillment is recorded only at order level, the ontology cannot answer which ordered item quantity moved in which shipment or delivery leg, especially in partial shipments, split fulfillment, exceptions, cancellations, reconciliation, customer service, or audit scenarios. That weakens the ontology's operational integration value rather than merely leaving out a convenience detail.
  - action: Add a fulfillment allocation/detail concept linking OrderLine to Shipment or DeliveryLeg, including shipped quantity, split or partial flags, timestamps, and exception or cancellation state. This should be closed before the next stage because later fulfillment, exception, reconciliation, and audit semantics depend on this authority being present rather than inferred from order-level shipment links.
  - unresolved disagreement: All participating lenses accepted the missing line-level allocation concept as the actionable root, but severity remains unresolved: axiology, semantics, and logic keep the medium framing, while coverage, evolution, and structure support raising severity because of reconciliation, exception handling, auditability, and future fulfillment patterns.
- issue-006 (medium): The ontology’s order and shipment lifecycles are materially incomplete because they stop at normal forward progress to delivered while tracking events can already report exceptions. This leaves cancellation, failed delivery, return, reissue, correction, reversal, and archival closure without canonical lifecycle representation.
  - root cause: Lifecycle enumerations are limited to forward-progress delivery states and define delivered as final, leaving non-happy-path and post-terminal logistics states outside the model.
  - materiality: This weakens order, freight, and delivery concept consistency for logistics operations and WMS/TMS/ERP reconciliation because non-happy-path outcomes and post-delivery corrections cannot be represented consistently. When OMS, TMS, carrier tracking, and ERP systems need to coordinate an exception, reversal, or correction, the model forces those conditions into happy-path statuses or leaves them outside the lifecycle, hiding operational risk.
  - action: Extend lifecycle coverage before relying on the ontology as an operational standard. Add explicit non-happy-path, terminal, and post-terminal concepts such as canceled or backordered order states, failed_delivery, returned, reissued, exception or recovery shipment states, correction or reversal events, and archival or audit-closed states, with rules for how exception and correction events affect order, shipment, and audit status.
- issue-008 (medium): issue-008은 재고 수량이 유효 시점과 원천 권위를 구조화하지 않아, 현재값과 야간 스냅샷을 넘어 실시간 재고, 감사 재현, 회계 조정, 복수 WMS/ERP 통합으로 확장할 때 재고 판단의 의미가 흔들리는 material issue입니다.
  - root cause: 재고 수량 개념이 유효 시점과 원천 권위를 구조화하지 않는다.
  - materiality: 선언된 목적은 재고 할당과 WMS/ERP 재고 권위 통합 기준입니다. 현재 모델은 주문 일중에도 야간 InventoryAggregate.available_qty를 읽고, InventoryRecord.quantity_on_hand도 현재 보유 수량 중심이라 주문 당시 재고 판단, 이후 조정, ERP 기준 reconcile 결과를 같은 수량 표면에 섞게 됩니다. 그래서 실시간 원천이나 감사 가능한 재고 이력을 추가하면 기존 주문 판단을 재현하기 어렵고, 새 재고 원천과의 통합 연속성도 약해집니다.
  - action: InventoryRecord와 InventoryAggregate에 as_of/effective_at, source_system, snapshot_type, reconciliation_status를 도입하고, 할당은 단순 현재 스냅샷 값이 아니라 특정 시점의 가용성 이벤트 또는 재고 원장 기준을 참조하게 해야 합니다. 이 변경은 다음 단계 통합 전에 닫아야 합니다. 먼저 수량의 시간·원천 권위를 모델의 기준 개념으로 세워야 이후 실시간 WMS, ERP 조정, 주문 시점 감사, 회계 마감 재고가 기존 데이터 의미를 덮어쓰지 않고 연결됩니다.
- issue-009 (medium): issue-009 is a material medium issue: DeliveryLeg is modeled as a subtype of Shipment even though it represents route segments, so route reasoning needs composition and ordered containment under a parent Shipment or Route instead of inheritance.
  - root cause: DeliveryLeg route reasoning is unstable because the ontology uses inheritance where it needs shipment-route composition and ordering.
  - materiality: This weakens the declared WMS/TMS/ERP integration purpose because downstream systems can treat partial legs, such as warehouse-to-hub or hub-to-customer movements, as complete customer shipments. That destabilizes shipment status, fulfillment scope, carrier handoff, ETA, and exception reasoning, and also prevents consumers from reconstructing a multi-leg route under one stable parent shipment.
  - action: Fix the model before the next stage by choosing a clear route authority: either keep Shipment as the whole consignment/order movement and model DeliveryLeg as a contained component of Shipment, or broaden Shipment to any cargo movement and introduce a separate whole-shipment fulfillment concept. In either case, add an explicit parent/composition relation, such as Shipment has_many DeliveryLeg, DeliveryLeg belongs_to Shipment, or a Route entity with ordered legs, and scope `leg_seq` to that parent.
- issue-011 (medium): DeliveryLeg를 Shipment의 하위 유형으로 둔 현재 모델은 배송 구간과 전체 출하를 같은 종류로 취급하므로 수정이 필요하다. DeliveryLeg는 Shipment 자체가 아니라 Shipment 또는 Route에 속한 route segment로 분리되어야 한다.
  - root cause: 배송 구간이라는 부분 개념을 전체 출하 이동의 특수한 종류로 분류했다.
  - materiality: 이 문제는 TMS/OMS/WMS 간 화물·배송 상태와 관계를 정합적으로 통합하려는 목적을 약화시킨다. 하나의 주문 출하가 여러 구간을 거칠 때 DeliveryLeg가 Shipment 의미를 상속하면 구간 완료가 전체 배송 완료처럼 보이고, 구간 운송이 주문 충족 주체처럼 해석되어 상태 매핑과 fulfillment 판단이 부정확해질 수 있다.
  - action: DeliveryLeg를 Shipment의 subclass에서 제거하고 Shipment.legs 또는 DeliveryLeg.parent_shipment_ref 같은 포함·연결 관계로 모델링해야 한다. fulfills 관계는 전체 Shipment에만 유지하고, DeliveryLeg의 상태는 leg-specific 완료 또는 운송 상태로 별도 정의해야 한다. 이 변경은 다음 단계 전에 닫아야 하는 구조적 전제이며, 구간 상태와 전체 출하/주문 충족 상태의 해석 경계를 먼저 고정해야 이후 통합 매핑이 안정된다.
- issue-012 (medium): The ontology must treat measurement units as part of the measurement value model. As written, SKU weight, SKU dimensions, and shipment total weight cannot remain stable when warehouses, carriers, regions, or rating engines use different unit conventions.
  - root cause: The unit model is not evolvable because measurement unit is not part of the measurement value concept.
  - materiality: This weakens the declared purpose because the model is meant to be a common integration basis for WMS/TMS/ERP shipment, inventory, and calculation concepts. If kg/lb or cm/in values can enter the same fields without explicit units and conversion basis, downstream carrier exchange, freight rating, load-limit checks, labels, and validation cannot reliably compare or aggregate those values.
  - action: Model weight and dimensions as structured measurements with value and unit, distinguish source units from canonical normalized units, and define conversion rules. Split dimensions into length, width, and height measurements, and make Shipment.total_weight explicit about whether it is a normalized aggregate or source measurement, including calculation unit, calculated_at, source_basis, and preferably the contributing source weights or SKU version basis.
- issue-013 (medium): TrackingEvent.event_type과 Shipment.status 사이에 canonical 상태 의미와 전이 기준이 정의되어 있지 않아, 캐리어 이벤트를 내부 배송 상태로 반영하는 통합마다 서로 다른 상태 해석을 만들 수 있다.
  - root cause: 원천 캐리어 이벤트 의미와 내부 Shipment 상태 의미 사이의 canonical 매핑을 온톨로지 밖 연동 구현으로 위임한다.
  - materiality: 이 문제는 배송 상태 모델과 WMS/TMS/ERP/캐리어 통합 상태 의미를 일관되게 제공하려는 목적을 직접 약화한다. delivered, in_transit, exception 같은 이름이 캐리어 원천 이벤트인지, 내부 Shipment 완료 상태인지, 고객 알림이나 예외 처리 기준인지 닫힌 기준이 없으면 여러 연동이 각자 매핑을 만들고 동일 이벤트가 서로 다른 완료, 진행, 예외 판단으로 이어진다.
  - action: 캐리어 원천 이벤트와 내부 canonical shipment status를 분리해 모델링하고, 각 이벤트가 Shipment.status나 Order.fulfillment_status 전이를 일으키는 조건과 범위를 기준 문서에 명시해야 한다. event_type에는 source_carrier_code와 source_event_code를 보존하고, 별도의 canonical_event_type 또는 status_transition 매핑 테이블을 두어 상태 파생을 연동 구현의 암묵 지식이 아니라 온톨로지의 명시 기준으로 만들어야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-005: Deliberation narrowed but did not fully resolve the issue: coverage keeps the issue distinct and high severity because it blocks operational reconstruction, while axiology accepts the issue and action but preserves a medium severity caveat from the value-alignment lens and its relationship to issue-004.
- issue-007: 진화 관점은 확장 차단 효과 때문에 high severity를 유지하지만, axiology 관점은 동일한 root cause를 수용하면서도 가치 목적만 기준으로 보면 medium severity라는 caveat를 남겼습니다.
- issue-014: Deliberation accepted the root and narrowed the issue to a structural line-level traceability defect, but preserved axiology's caveat that severity is medium under value-purpose criteria while structure keeps high severity for structural completeness.
- issue-004: All participating lenses accepted the missing line-level allocation concept as the actionable root, but severity remains unresolved: axiology, semantics, and logic keep the medium framing, while coverage, evolution, and structure support raising severity because of reconciliation, exception handling, auditability, and future fulfillment patterns.

## Deliberation Decision
- issue-001: resolved
- issue-005: narrowed
- issue-007: narrowed
- issue-010: no-deliberation-needed
- issue-014: narrowed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: narrowed
- issue-006: no-deliberation-needed
- issue-008: resolved
- issue-009: resolved
- issue-011: resolved
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the WMS/TMS/ERP integration concept baseline for order, inventory, shipment, and delivery concepts, especially authority and temporality. / Inventory and order fulfillment authority for WMS/TMS/ERP integration.
- issue-005: WMS/TMS/ERP integration concept baseline for order, inventory, shipment, and delivery concepts.
- issue-007: 주문 -> 재고 할당 -> 출하 -> 배송의 WMS/TMS/ERP 통합 개념 기준 문서
- issue-010: Use the ontology as a WMS/TMS/ERP integration concept baseline with clear authority for inventory, shipment, ETA, and audit-relevant values. Source finding context: WMS/TMS/ERP 통합의 개념 기준 문서로서 재고 권위와 주문 할당 의미를 일관되게 제공하는 목적. Source finding context: WMS/TMS/ERP integration concept baseline with clear authority for order, inventory, shipment, and delivery values.
- issue-014: Concept reference document for WMS/TMS/ERP integration across order, inventory, shipment, and delivery concepts.
- issue-002: Use the ontology as the concept baseline for unit-consistent WMS/TMS/ERP integration and logistics risk control. / Freight, warehouse, and TMS integration concept baseline.
- issue-003: Use the ontology as the WMS/TMS/ERP integration status-model and authority baseline for shipments and delivery tracking. / WMS/TMS/ERP와 캐리어 통합의 배송 상태 공통 기준
- issue-004: Use the ontology as a concept standard across order, freight, and delivery workflows while controlling logistics operating risk.
- issue-006: Order, freight, and delivery concept consistency for logistics operations and WMS/TMS/ERP reconciliation. Source finding context: Order, freight, and delivery concept consistency for logistics operations.
- issue-008: 재고 할당과 WMS/ERP 재고 권위 통합 기준
- issue-009: Concept baseline for WMS/TMS/ERP integration across order, freight, and delivery concepts. / Concept reference document for shipment and delivery integration between WMS/TMS/carrier systems.
- issue-011: 화물·배송 개념의 정합성을 제공하여 TMS/OMS/WMS 상태와 관계를 통합하는 목적.
- issue-012: 주문·재고·화물·배송 개념의 단위 정합성을 보장하는 통합 기준 문서 목적. / WMS/TMS/ERP 통합에서 SKU, 화물, 배송 계산의 공통 개념 기준
- issue-013: 배송 상태 모델과 WMS/TMS/ERP/캐리어 통합 상태 의미를 일관되게 제공하는 목적.

## Final Review Result
14 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Issue-001 is a high-severity material defect: the ontology cannot safely serve as a WMS/TMS/ERP integration baseline while allocation depends on current or nightly inventory quantity surfaces instead of time-scoped, source-authoritative availability records. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-005 (high): fix_before_release, accept_risk
- issue-007 (high): fix_before_release, accept_risk
- issue-010 (high): fix_before_release, fix_now
- issue-014 (high): fix_before_release, accept_risk
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, accept_risk
- issue-006 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, fix_now
- issue-013 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
