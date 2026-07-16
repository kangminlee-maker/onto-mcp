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
- issue-001 (high): 재고 값의 목적별 권위와 시간 계약이 모델에 연결되지 않은 상태에서 일중 할당이 전일 InventoryAggregate.available_qty를 사용하므로, 통합 구성요소가 동일 시점의 가용재고를 일관되게 해석할 수 없다.
  - root cause: 배치 조정 관행을 수용하면서 재고 값의 목적별 권위와 시간 계약을 모델링하지 않았다.
  - materiality: 이 결함은 WMS·TMS·ERP 통합을 위한 재고 권위·시간성의 개념 기준이라는 목적을 직접 약화한다. 실물·회계·가용 수량의 권위와 기준시점이 불명확하면 동일 온톨로지를 채택한 구성요소도 서로 다른 재고 진실로 판단하여 재고 부족, 중복 할당, 감사 불가능성의 위험을 만든다.
  - action: 먼저 실물·회계·가용 수량별 권위 시스템을 구분하고 각 재고 값에 기준시점(as_of), 출처, 갱신 시각을 연결해야 한다. 그다음 할당 계약이 예약을 반영한 최신 가용수량만 소비하고 명시된 허용 신선도를 초과한 값은 사용하지 않도록 해야 한다. 권위·시간 계약을 먼저 확립해야 할당 규칙과 향후 WMS·3PL·실시간 원천 확장이 같은 의미를 유지할 수 있다.
- issue-003 (high): Order·Shipment·TrackingEvent가 공통 생명주기와 연결 계약 없이 독립 enum으로 정의되어, 연동별 상태 해석이 달라지고 취소·부분충족·배송 실패·반품·종결 후 정정 같은 비정상 운영을 일관되게 표현할 수 없다.
  - root cause: Order·Shipment·TrackingEvent 상태를 공통 생명주기 계약 없이 정상 경로 중심의 독립 enum으로 정의했다.
  - materiality: 이 결함은 OMS·TMS·캐리어 상태를 공통 기준으로 연결하려는 목적을 직접 약화한다. 캐리어 이벤트로 상태를 갱신하거나 시스템 간 충돌을 조정할 때 각 연동이 의미와 예외 처리를 따로 정하게 되어 상태 일관성, 운영 대사, 고객 판단을 신뢰하기 어렵다.
  - action: 먼저 Order와 Shipment의 canonical 상태 의미와 정상·예외 생명주기를 정의하고, 취소·부분충족·배송 실패·반품 및 delivered 이후 정정·재개·재출하의 허용 전이를 명시해야 한다. 그다음 외부 TrackingEvent에서 Shipment, 다시 Order로 이어지는 crosswalk를 연결하고, 판정 권위·우선순위·충돌 처리 규칙을 같은 계약에 포함해야 한다. 의미와 전이를 먼저 확정해야 후속 매핑과 충돌 규칙이 안정된 기준을 참조할 수 있다.
- issue-006 (high): 재고 예약·할당 거래가 독립 개념으로 모델링되지 않아 주문별 할당 수량과 생명주기를 표현할 수 없으며, 동일한 야간 재고 스냅샷을 여러 일중 주문이 반복 참조할 때 과다 할당 방지와 소비 이력 추적이 불가능하다.
  - root cause: 재고를 잔액 스냅샷으로만 모델링하고 예약·할당 거래를 독립 개념으로 포함하지 않았다.
  - materiality: 이는 주문→재고 할당과 WMS/ERP 통합을 위한 개념 기준 제공이라는 선언 목적을 직접 약화한다. 가용재고가 주문별 예약·할당·해제와 연결되지 않으므로 시스템은 특정 주문이 얼마의 재고를 소비했는지 재구성하거나 복수 주문의 총할당량이 가용량을 넘지 않음을 보장할 수 없다.
  - action: OrderLine과 InventoryRecord를 연결하는 예약 또는 할당 엔터티를 먼저 도입하고, 할당 수량, 상태, 생성·만료·해제 시각을 정의해야 한다. 이어 각 상태 전이가 available_qty에 언제 반영되거나 복원되는지 규칙을 정하고, 동시 주문과 부분 할당에서도 유효 예약·할당 합계가 가용재고를 초과하지 않으며 주문별 소비 이력이 보존되도록 해야 한다.
- issue-007 (high): 현재 모델은 Shipment가 어떤 Order를 충족하는지만 나타내고 주문행별 충족 수량은 기록하지 못하므로, 부분·분할 출하에서 잔여 주문량과 실제 출하량을 대사할 수 없다.
  - root cause: 충족 관계의 최소 단위를 Order로만 정의하고 수량을 가진 행 단위 연결 개념을 생략했다.
  - materiality: 한 OrderLine이 여러 Shipment로 나뉘거나 일부만 출하될 때 주문 잔량, 실제 출하량, 배송 결과를 OMS·WMS·TMS가 동일한 기준으로 연결할 수 없다. 따라서 선언된 목적인 주문부터 출하·배송까지의 통합 추적을 현재 지원 경로에서 직접 저해하는 high 수준의 완전성 결함이다.
  - action: FulfillmentLine 또는 ShipmentLine과 같은 행 단위 충족 개념을 추가해 OrderLine, Shipment, fulfilled_qty 및 수량 단위를 연결해야 한다. 이어 분할, 부분 충족, 취소, 재출하 시 수량의 증감·잔량·중복 방지 규칙을 정의해야 시스템 간 대사 기준이 완성된다. 이 조치는 현재 차단 요인이므로 대상 범위에서 즉시 닫아야 한다.
- issue-009 (high): 재고와 ETA를 덮어쓰는 현재값으로만 표현한 모델은 과거 주문·할당·배송 판단의 재구성과 새 WMS·3PL·실시간 이력의 점진적 도입을 함께 막는 중대한 설계 문제다.
  - root cause: 변동 값을 원천·시점·버전이 있는 관측 이력 대신 덮어쓰는 현재값으로 모델링했다.
  - materiality: 원천별 값과 시간에 따른 의미가 보존되지 않아 감사, 사후 대사, SLA 분석과 변경 원인 확인의 신뢰가 약화된다. 또한 기존 의미와 과거 상태를 유지하면서 새 원천이나 계산 규칙을 병행할 수 없어 WMS/ERP 통합의 권위·시간 기준 및 확장성이라는 목적을 훼손한다.
  - action: 다음 단계 전에 원천 시스템, 재고 의미, 관측·유효·기록 시각과 버전을 갖는 InventoryObservation 또는 InventoryLedger 같은 이력 모델을 권위 기록으로 결정해야 한다. 재고 현재값과 집계, ETA는 명시된 기준시점과 계산 규칙에서 생성되는 투영으로 정의해 과거 재구성과 새 원천의 병행 도입을 가능하게 해야 한다. 아울러 직접 재구성 실패와 진화상 확장 실패를 합산하는 심각도 기준을 정해 fix-before-release와 위험 수용 중 하나를 확정해야 한다.
  - unresolved disagreement: coverage와 evolution은 원인과 실패 범위에는 합의했지만, 직접 재구성 실패와 단계적 확장 실패를 종합해 심각도를 medium 또는 high로 판단할 기준이 경계 내에 없어 최종 심각도는 확정되지 않았다.
- issue-012 (high): 버전형 StatusMapping 계약의 부재로 캐리어 상태의 canonical 정규화가 연동별 구현에 분산되어 현재 결과의 일관성과 변경 이후 과거 이벤트 해석의 연속성을 보장할 수 없다. 원인과 필요한 조치에는 합의했으며, 다음 단계 전에 닫아야 하는 material 이슈다.
  - root cause: 외부 상태 상호운용성을 버전 가능한 공통 매핑 레지스트리가 아니라 닫힌 enum과 연동별 코드로 구현했다.
  - materiality: 이 문제는 OMS·TMS·캐리어 사이에 공통 배송 상태 기준을 제공한다는 목적을 직접 약화한다. 같은 외부 사건이 연동이나 적용 시점에 따라 다른 Shipment 상태가 될 수 있어 상태 대사와 자동화가 불안정해지고, 코드 변경 때마다 반복 수정과 매핑 드리프트가 누적되며 과거 이벤트의 해석도 달라질 수 있다.
  - action: 다음 단계로 진행하기 전에 원천 시스템·원천 코드, canonical 이벤트·상태, 매핑 버전과 유효 기간을 권위 있게 관리하는 StatusMapping을 도입해야 한다. 먼저 원시 코드를 변경 없이 보존하고 unknown/unmapped 경로를 명시한 뒤, 모든 연동이 사건 시점에 유효한 매핑을 사용하도록 연결해야 현재 일관성과 과거 결과의 재현성을 함께 확보할 수 있다.
  - unresolved disagreement: coverage와 evolution은 원인과 조치에는 합의했지만, 현재 상호운용성 공백과 장기적인 반복 수정·매핑 드리프트·과거 재해석의 누적 영향을 하나의 심각도로 가중하는 기준이 없어 medium과 high 중 어느 수준인지 경계 내에서 확정하지 못했다. 또한 실제 연동 구현에 별도 매핑 레지스트리가 존재하는지는 현재 증거 범위에서 확인되지 않았다.
- issue-013 (high): 현재의 Shipment→Order 주문 단위 fulfills 관계만으로는 부분출하·분할충족을 표현할 수 없다. 따라서 부분출하 도입 전에 라인별 수량 할당 모델로 재구성해야 한다.
  - root cause: 충족을 수량을 가진 라인-출하 연관이 아니라 주문-출하 이진 관계로만 모델링했다.
  - materiality: 한 주문 라인이 여러 출하로 나뉘는 운영에서는 어느 OrderLine이 어느 Shipment에서 얼마만큼 충족됐는지 공통으로 표현할 수 없다. 이 때문에 WMS·TMS·ERP가 기존 관계를 재사용하지 못하고 스키마와 소비 로직을 함께 변경해야 하며, 과거 데이터와 새 모델 사이의 의미 연속성도 보장하기 어려워 주문→출하 통합 기준과 확장성을 중대하게 약화한다.
  - action: OrderLine과 Shipment를 연결하는 FulfillmentAllocation을 추가하고 할당 수량·단위·유효 시점·상태를 그 연관의 속성으로 정의해야 한다. 먼저 이 연관을 충족 정보의 권위 있는 모델로 확립한 뒤, 기존 주문 단위 fulfills는 할당에서 계산되는 호환용 투영으로 유지해야 소비자 전환을 단계화하고 향후 충족 방식 확장을 수용할 수 있다.
- issue-015 (high): DeliveryLeg는 Shipment의 하위유형이 아니라 특정 Shipment를 구성하는 독립 운송 구간이어야 한다. 현재 분류는 구간과 전체 화물의 식별·상태·주문 충족 의미를 충돌시키는 high 심각도의 현재 차단 이슈다.
  - root cause: 운송 구간과 전체 화물 이동 사이의 부분-전체 관계를 하위유형 관계로 모델링했다.
  - materiality: WMS·TMS·ERP가 다구간 운송을 교환하거나 주문 충족을 판정할 때 구간을 전체 출하와 같은 종류로 해석하면 shipment_no, 중량, 최종 배송 상태와 충족 책임의 범위가 모호해진다. 그 결과 시스템별 식별, 상태 집계와 충족 판정이 달라져 통합을 위한 공통 화물·배송 개념 기준을 약화시킨다.
  - action: 먼저 DeliveryLeg의 Shipment 하위유형 분류를 제거하고 독립 엔터티로 정의한 뒤, part_of 또는 shipment_ref로 각 구간을 해당 Shipment에 연결해야 한다. 이어 구간별 상태·ETA·운송사와 전체 Shipment의 식별자·중량·최종 상태·주문 충족 속성을 명확히 분리해야 한다. 관계와 속성 범위를 먼저 바로잡아야 이후 시스템 매핑과 상태 집계가 동일한 의미 경계를 따를 수 있다.
- issue-017 (high): 물리적 보유량과 회계 장부량이 하나의 quantity_on_hand에 혼합되어 WMS와 ERP 중 어느 값이 목적별 진실인지 판정할 수 없는 현재의 high 심각도 문제이며, 대상 범위에서 반드시 해소해야 한다.
  - root cause: 물리 재고와 회계 재고를 별도 재고 관점으로 모델링하지 않고 하나의 quantity_on_hand 개념에 수용했다.
  - materiality: 두 수량은 불일치할 수 있고 출고 할당과 회계 결산의 목적도 다르다. 단일 필드가 상반된 진실 기준을 나타내면 할당, 재고조정, 감사에서 올바른 값을 선택할 수 없어 ‘WMS와 ERP 재고 개념의 권위 및 의미를 통합 기준으로 제공’하려는 목적을 직접 약화한다.
  - action: 먼저 physical_on_hand와 accounting_on_hand를 분리하거나 재고 관측값에 quantity_kind, source_system, as_of를 도입해 서로 다른 관점을 명시해야 한다. 그다음 할당, 결산, 조정과 감사별 권위 시스템을 지정하고, 야간 조정이 물리 수량의 덮어쓰기가 아니라 관점 간 조정 결과로 해석되도록 의미를 정의해야 한다. 이 의미·권위 분리를 재고 선택 및 조정 로직보다 먼저 확정해야 downstream 동작이 올바른 값을 사용할 수 있다.
- issue-018 (high): 야간 available_qty 스냅샷을 일중 현재 가용재고로 사용하는 구조는 유효 시점과 계산 산식이 없어 중복 할당 위험을 만들므로 즉시 수정해야 하는 high 심각도 이슈다.
  - root cause: 시간 의존적 파생값인 available_qty를 원천·산식·유효시점 없는 독립 스냅샷 필드로 모델링했다.
  - materiality: 야간 스냅샷 이후 주문·예약·입출고·조정이 발생하면 저장값이 현재 상태를 반영하지 못한다. 그럼에도 일중 할당 기준으로 사용하면 이미 할당된 수량을 다시 가용하다고 판단하거나 시스템별로 서로 다른 가용량을 계산할 수 있어, 일관된 재고 할당 기준이라는 목적을 훼손한다.
  - action: available_qty의 권위 시스템과 물리 보유량·예약량·차단량 등 입력을 사용하는 계산 산식을 정의하고, as_of와 계산·갱신 시점을 모델에 추가해야 한다. 그다음 일중 할당 경로가 야간 스냅샷이 아니라 갱신 가능한 권위 값을 사용하도록 전환해야 하며, 권위와 갱신 규칙을 먼저 확정한 뒤 소비 경로를 바꿔야 의미 불일치가 재발하지 않는다.
- issue-019 (high): 주문 전체의 단일 fulfillment_status와 Shipment→Order 관계만으로는 부분출하에서 shipped·delivered가 일부 완료인지 전량 완료인지 판정할 수 없습니다. 따라서 주문선별 충족 범위와 수량을 재구성할 수 없는 현재의 high 심각도 정확성 이슈를 목표 범위에서 반드시 수정해야 합니다.
  - root cause: 충족 사실의 의미 단위를 OrderLine과 수량이 아니라 Order 전체로만 모델링했다.
  - materiality: 주문이 여러 Shipment로 분할되거나 일부 주문선·수량만 처리되면 완료 여부와 출하별 충족 범위를 확인할 수 없어 과소·중복 출하를 판별하기 어렵고, 고객 상태 표시와 OMS·WMS·TMS의 운영 대사가 서로 다른 사실을 나타낼 수 있습니다. 이는 주문부터 출하·배송까지 일관된 충족 상태를 제공한다는 목적을 직접 훼손합니다.
  - action: 먼저 Shipment와 OrderLine 사이에 충족 수량을 기록하는 관계를 추가해 행·수량별 사실을 권위 있는 근거로 만들어야 합니다. 그다음 그 사실에서 주문 상태를 도출하고 partially_allocated, partially_shipped, partially_delivered 같은 부분 상태의 전이 의미와 shipped·delivered의 전량 완료 조건을 명시해야 합니다. 이 순서를 지켜야 상태 정의가 주문 전체의 모호한 값이 아니라 재구성 가능한 충족 사실에 의존합니다.
- issue-022 (high): Shipment와 OrderLine을 충족 수량과 함께 연결하는 구조가 없어, 부분·분할 출하에서 주문행별 출하 추적 경로가 끊겨 있다. 이 문제는 현재 차단 요인이므로 대상 모델에서 반드시 수정해야 한다.
  - root cause: Shipment와 OrderLine을 수량과 함께 연결하는 구성 요소를 생략했다.
  - materiality: 한 주문이나 주문행이 여러 Shipment로 나뉘면 시스템 간 주문행별 출하 수량 대사와 미충족 수량 판정이 불가능하다. 따라서 주문→재고 할당→출하→배송을 WMS/TMS/ERP 통합의 개념 기준으로 제공하려는 핵심 목적과 추적성이 직접 훼손된다.
  - action: `ShipmentLine` 또는 동등한 연결 엔터티를 추가하고 각 인스턴스가 `Shipment`, `OrderLine`, `fulfilled_qty`를 필수로 참조하도록 해야 한다. 주문 단위 `fulfills`는 이 행 단위 연결에서 유도되도록 하여 행 단위 기록을 원천으로 삼아야 하며, 그래야 부분·분할 출하의 출하량 대사와 미충족 수량 계산이 일관되게 가능하다.
- issue-024 (high): 주문행과 창고 재고 사이에 할당 인스턴스가 없어 주문→재고 할당 단계가 구조적으로 기록되지 않는다. 이는 선언된 핵심 흐름을 막는 high 심각도의 현재 결함이며 목표 범위에서 반드시 수정해야 한다.
  - root cause: 주문행과 창고 재고 사이의 할당 행위 및 할당 수량을 독립된 연결 구조로 표현하지 않았다.
  - materiality: 동일 SKU에 여러 주문행이나 여러 창고 재고가 존재하면 SKU 공유만으로 특정 주문행에 어느 재고의 얼마가 예약되었는지 식별할 수 없다. 그 결과 OMS 주문 수요와 WMS 예약을 대응시켜 중복 할당, 미할당, 출하 전 재고 대사를 판정할 수 없어 주문→재고 할당→출하→배송의 통합 개념 기준이라는 목적이 약화된다.
  - action: InventoryAllocation 연결 엔터티를 추가해 각 OrderLine을 해당 InventoryRecord 또는 Warehouse 및 allocated_qty와 연결해야 한다. 할당 상태와 생성 시각도 이 엔터티에 정의하여 예약의 생명주기를 추적할 수 있게 해야 한다. 이 연결을 먼저 권위 있는 할당 기록으로 확립해야 이후 출하 연결과 재고 대사가 주문행별 할당을 일관되게 참조할 수 있다.
- issue-004 (medium): 수량을 가진 OrderLine–Shipment 대응이 없어 부분출하 시 주문선별 충족 사실과 상태를 재구성할 수 없으며, 이는 목표 범위에서 즉시 보완해야 하는 현재 결손이다.
  - root cause: 관계를 주문 수준으로만 단순화하면서 수량을 가진 주문선-화물 대응 개념을 제외했다.
  - materiality: 한 주문선이 여러 Shipment로 나뉘거나 일부 수량만 출하되면 OMS·WMS·TMS가 동일한 충족 사실을 교환할 수 없다. 그 결과 운영 조사와 고객 응대가 약화되고, 주문부터 출하·배송까지 일관된 충족 추적 기준을 제공한다는 목적이 훼손된다.
  - action: OrderLine과 Shipment를 충족 수량과 함께 연결하는 FulfillmentAllocation 또는 ShipmentLine을 먼저 도입해야 한다. 이후 주문 수준 fulfills와 관련 출하·배송 상태를 해당 행 단위 수량의 합계에서 파생하도록 바꿔, 주문선별 사실을 단일 권위로 삼고 시스템 간 재구성과 조사가 가능하게 해야 한다.
- issue-005 (medium): 캐리어 예측과 운영팀의 수기 판단을 단일 변경 가능 ETA에 혼합하면 최종 표시값의 출처, 신선도와 변경 책임을 검증할 수 없다. 적용 가능한 렌즈들은 이 원인과 medium 심각도 및 조치 방향을 일관되게 지지했다.
  - root cause: 서로 다른 ETA 주장과 수기 오버라이드를 출처 있는 추정 이력으로 분리하지 않고 하나의 mutable 값으로 합쳤다.
  - materiality: 운영팀이 ETA를 수정하거나 여러 시스템이 이를 교환·표시할 때 값의 근거와 기준시각을 복원할 수 없어, 배송 예상시각의 권위와 시간성을 일관되게 해석하려는 목적이 약화된다. 그 결과 고객 약속과 운영 판단의 신뢰도도 낮아진다.
  - action: 먼저 각 ETA 추정치를 출처, 산출·수신·수정 시각, 수정 주체와 함께 불변 이력으로 보존하고 캐리어 예측과 운영 오버라이드를 구분해야 한다. 그다음 명시적인 우선순위 규칙으로 최종 표시 ETA를 파생해야 한다. 이력 및 책임 계약을 먼저 마련해야 표시 규칙이 검증·감사·복구 가능한 결과를 만들 수 있으며, 다음 단계 전에 이 결손을 해소해야 한다.
- issue-010 (medium): 수동 ETA 변경과 WMS·ERP 재고 불일치 조정을 독립된 감사 사건으로 보존하지 않아 변경의 책임과 근거를 검증하거나 당시 상태를 재현할 수 없다. 이 문제는 다음 단계 전에 해소해야 한다.
  - root cause: 변경 가능한 값만 정의하고 그 값을 변경하는 통제 행위를 독립된 감사 사건으로 모델링하지 않았다.
  - materiality: 중요 운영값이 변경될 때 행위자·시각·사유·증거가 남지 않으면 승인 적정성, 책임 소재, 장애 원인을 확인할 수 없다. 따라서 통합 기준 문서의 목적인 운영상 통제되는 변경의 추적 가능성이 직접 약화된다.
  - action: 다음 단계 전에 수동 ETA 변경과 재고 불일치 조정 등 통제값 변경에 Adjustment 또는 AuditEvent를 도입해야 한다. 각 사건에는 대상 값, 변경 전·후 값, 행위자 또는 실행 프로세스, 발생 시각, 사유, 증거·원천 및 승인 정보를 기록하고 해당 운영값과 연결해야 변경 이력의 감사와 재현이 가능하다.
- issue-011 (medium): 재고·ETA·배송 상태에 값별 권위 범위, 출처, 우선순위와 계보가 없어 다중 원본이 충돌할 때 신뢰할 값을 일관되게 선택할 수 없다.
  - root cause: 다중 원본을 서술형 메모로만 설명하고 권위 범위와 데이터 계보를 일급 개념으로 모델링하지 않았다.
  - materiality: 이는 WMS/TMS/ERP 통합 소비자가 동일한 값 이름에 대해 서로 다른 선택을 하게 만들어 통합 결과가 구현별로 달라지므로, 단일 개념 기준을 제공하려는 목적을 실질적으로 약화한다.
  - action: 다음 단계 전에 SystemOfRecord, AuthorityScope, ValueProvenance를 일급 개념으로 추가해야 한다. 물리재고·회계재고·가용재고·표시 ETA·정규화 상태 등 값 종류별로 권위자와 적용 범위, 충돌 시 우선순위, 원본 값, 파생 규칙을 명시하여 통합 소비자가 동일한 기준으로 값을 선택하고 계보를 보존하도록 해야 한다.
- issue-021 (medium): 캐리어 예측 ETA와 운영팀 수기 조정 ETA가 Shipment의 단일 eta에 덮어써져, 최종 값의 출처와 기준시각을 복원할 수 없는 중간 심각도의 중요 이슈다.
  - root cause: 서로 다른 출처의 ETA 관측값과 최종 표시값을 구별하지 않고 단일 속성에 덮어쓰기 방식으로 수용했다.
  - materiality: 캐리어 ETA 갱신이나 운영팀 조정 후에는 시스템 간 어떤 ETA가 교환되었는지, 누가 어떤 근거로 값을 바꿨는지, 예측 오차를 어느 원천값과 비교해야 하는지 알 수 없다. 따라서 TMS·캐리어·운영 화면 간 ETA 의미의 일관성과 추적 가능성이 훼손되고, 충돌 처리·감사·예측 정확도 평가가 불가능해진다.
  - action: 다음 단계 전에 캐리어 ETA와 운영 조정 ETA를 별도 관측값으로 먼저 보존하고 각 값에 source, calculated_at, effective_at, supersedes 및 선택 근거를 기록해야 한다. 그 후 최종 표시 ETA를 원천 관측값에서 도출되는 명시적 projection으로 정의해야 한다. 원천 이력 보존이 선행되어야 표시값을 재계산하고 선택 이유를 감사할 수 있다.
- issue-023 (medium): DeliveryLeg가 소속 Shipment와 연결되지 않아 복수 화물·다구간 배송에서 화물별 경로와 구간 순서를 구성할 수 없다. 적용 가능한 렌즈들은 이 결함과 medium 심각도 판단을 일관되게 수용했으며, 남은 이견은 없다.
  - root cause: 유형 상속만 정의하고 Shipment 인스턴스와 DeliveryLeg 인스턴스의 구성 관계를 생략했다.
  - materiality: 이 모델의 목적은 WMS/TMS/ERP가 화물과 배송 구간을 공통 구조로 교환·통합하도록 하는 것이다. 그러나 구간의 소속 화물을 판별할 수 없으면 둘 이상의 Shipment가 존재할 때 DeliveryLeg를 화물별로 그룹화하거나 순서화할 수 없어 TMS 경로 데이터와 Shipment를 신뢰성 있게 통합할 수 없다.
  - action: 다음 단계 전에 Shipment–DeliveryLeg의 권위 있는 구성 관계를 하나로 정의해야 한다. DeliveryLeg.shipment_ref 또는 Shipment contains DeliveryLeg 중 모델의 기존 방향성에 맞는 관계를 추가한 뒤, leg_seq가 해당 Shipment 내부에서 유일하도록 무결성 규칙을 둬야 한다. dep-004가 issue-015와의 공통 원인 가능성을 보존하므로 관련 관계 수정과 정합성을 맞춰 중복되거나 충돌하는 모델링을 피해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-009: coverage와 evolution은 원인과 실패 범위에는 합의했지만, 직접 재구성 실패와 단계적 확장 실패를 종합해 심각도를 medium 또는 high로 판단할 기준이 경계 내에 없어 최종 심각도는 확정되지 않았다.
- issue-012: coverage와 evolution은 원인과 조치에는 합의했지만, 현재 상호운용성 공백과 장기적인 반복 수정·매핑 드리프트·과거 재해석의 누적 영향을 하나의 심각도로 가중하는 기준이 없어 medium과 high 중 어느 수준인지 경계 내에서 확정하지 못했다. 또한 실제 연동 구현에 별도 매핑 레지스트리가 존재하는지는 현재 증거 범위에서 확인되지 않았다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: narrowed
- issue-012: narrowed
- issue-013: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-019: no-deliberation-needed
- issue-022: no-deliberation-needed
- issue-024: no-deliberation-needed
- issue-004: resolved
- issue-005: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-021: no-deliberation-needed
- issue-023: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: WMS/TMS/ERP 통합을 위한 재고 권위·시간성의 개념 기준 제공
- issue-003: OMS/TMS/캐리어의 주문·화물·배송 상태를 일관되게 연결하는 통합 개념 기준 제공 Source finding context: OMS/TMS/캐리어 상태를 일관되게 연결하는 통합 개념 기준 제공 Source finding context: 주문·화물·배송의 공통 상태 기준 제공
- issue-006: 주문→재고 할당과 WMS/ERP 통합을 위한 개념 기준 제공
- issue-007: 주문에서 출하·배송까지의 통합 추적
- issue-009: 시간에 따라 변하는 주문충족 정보와 WMS/ERP 재고의 권위·시간 기준 및 확장성 제공 Source finding context: 시간에 따라 변하는 주문충족 정보를 시스템 간 일관되게 해석하는 기준 제공 Source finding context: WMS/ERP 재고 통합의 권위·시간 기준 및 새로운 재고 원천에 대한 확장성
- issue-012: OMS/TMS/캐리어 간 공통 배송 상태 기준과 외부 상태 체계 변경에 대한 연속성 Source finding context: TMS와 캐리어 연동 사이의 공통 배송 상태 기준 제공 Source finding context: OMS/TMS/캐리어 간 상태 통합 기준과 외부 상태 체계 변경에 대한 연속성
- issue-013: WMS/TMS/ERP 통합을 위한 주문→출하 개념 기준과 향후 충족 방식 확장성
- issue-015: WMS/TMS/ERP 통합을 위한 화물·배송 개념 기준
- issue-017: WMS와 ERP 재고 개념의 권위 및 의미를 통합 기준으로 제공
- issue-018: 재고 할당을 위한 일관된 가용 재고 기준
- issue-019: 주문에서 출하와 배송까지의 일관된 충족 상태 기준
- issue-022: 주문→재고 할당→출하→배송을 WMS/TMS/ERP 통합의 개념 기준으로 제공하는 목적
- issue-024: 주문→재고 할당→출하→배송 흐름을 통합 시스템의 개념 기준으로 제공하는 목적
- issue-004: 주문에서 재고 할당·출하·배송까지 일관된 충족 추적 기준 제공
- issue-005: 배송 예상시각의 권위와 시간성을 일관되게 해석하는 통합 기준 제공
- issue-010: 통합 기준 문서에서 운영상 통제되는 변경의 추적 가능성 제공
- issue-011: WMS/TMS/ERP 통합을 위한 단일 개념 기준 제공
- issue-021: TMS·캐리어·운영 화면 간 ETA의 일관된 의미와 추적 가능성
- issue-023: 화물과 배송 구간을 포함하는 WMS/TMS/ERP 공통 개념 모델

## Final Review Result
19 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 재고 값의 목적별 권위와 시간 계약이 모델에 연결되지 않은 상태에서 일중 할당이 전일 InventoryAggregate.available_qty를 사용하므로, 통합 구성요소가 동일 시점의 가용재고를 일관되게 해석할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 통합 시스템에 별도의 실시간 예약 또는 신선도 통제가 존재하는지는 허용된 증거 범위에서 확인할 수 없다.
- 현재 각 개별 연동이 실제로 구현한 상태 매핑은 경계 내 증거로 확인되지 않았다.
- 필수 예외 상태의 정확한 범위는 실제 운영 정책 확인이 필요하다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-003 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_before_release, accept_risk
- issue-012 (high): fix_before_release, accept_risk
- issue-013 (high): fix_now
- issue-015 (high): fix_now
- issue-017 (high): fix_now
- issue-018 (high): fix_now
- issue-019 (high): fix_now
- issue-022 (high): fix_now
- issue-024 (high): fix_now
- issue-004 (medium): fix_now
- issue-005 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-021 (medium): fix_before_release, follow_up
- issue-023 (medium): fix_before_release, follow_up

## Recommendations
- issue-016 (high): 단위 식별 없이 kg와 lb 등을 허용하고 합산 중량을 저장하므로 중량의 의미와 계산 결과가 확정되지 않는다. Source finding context: Sku.weight, Sku.dims 및 Shipment.total_weight의 단위 의미 Source finding context: materialized-input.md:33-38, 40-49 Source finding context: 동일 숫자 속성에 kg와 lb 등 서로 다른 단위를 허용하면서 단위 식별 없이 합산 중량을 저장하므로 중량 의미가 확정되지 않는다. Source finding context: 단위 없는 숫자는 시스템 간 동일한 물리량을 나타낸다고 보장할 수 없다. 서로 다른 단위의 값을 합산하면 total_weight라는 파생값도 의미적으로 무효가 되어 적재, 운임, 운송사 제한 판단에 잘못 사용될 수 있다. Source finding context: 중량과 각 치수를 값+단위로 모델링하고 통합 기준 단위 및 변환 규칙을 정한다. total_weight에는 계산 기준 단위, 구성 수량, 계산 시점 또는 원천 계측값을 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/semantics.findings.yaml#semantics-candidate-002 Source finding context: WMS/TMS/ERP 간 SKU 및 화물 물성의 일관된 교환과 출하 중량 계산 Source finding context: 단위 관례가 다른 창고나 소스 시스템의 SKU를 동일 Shipment에 포함하거나 시스템 간 전송할 때 Source finding context: 동일 숫자가 다른 물리량으로 해석되고 파생 중량 계산이 틀려 운영 및 비용 판단의 신뢰성이 훼손된다. Source finding context: 물리량의 값과 측정 단위를 분리하지 않고 숫자 또는 문자열 하나에 소스별 관례를 수용했다. Source finding context: Shipment.total_weight는 구성 OrderLine 중량의 합으로 저장된다. Source finding context: 합산 원천인 Sku.weight가 kg 또는 lb 중 어느 단위인지 표현하지 않는다. Source finding context: 물리량 속성에 명시적 단위와 정규화 규칙이 없다.
- issue-002 (medium): 단위 없는 중량·치수와 합산값은 시스템 간 비교 가능한 물리량 기준을 제공하지 못한다. Source finding context: Sku.weight, Sku.dims 및 Shipment.total_weight Source finding context: 대상: materialized-input.md:33-38,40-49. 가치 권위: review-value-alignment-criteria.yaml:6-8 (`user-request-intent`: 통합 개념 기준의 단위 정합성 검토). value_type=commitment; alignment_direction=misaligned. Source finding context: 소스별 단위 관례를 그대로 보존하는 설계는 시스템 간 비교 가능한 단위 기준을 제공하지 못한다. Source finding context: 같은 숫자와 문자열이 시스템마다 다른 물리량을 뜻할 수 있어 총중량, 운임, 용량 판단을 신뢰할 수 없다. 소스 편의성을 선택한 대가로 통합 문서의 정규화 목적을 훼손한다. Source finding context: 중량과 각 치수를 값·단위의 구조화된 수량으로 모델링하고 canonical 단위와 변환 규칙을 지정한다. `total_weight`에는 계산 단위와 구성값의 정규화 조건을 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/axiology.findings.yaml#axiology-candidate-002 Source finding context: WMS/TMS/ERP 간 단위가 일관된 상품·화물 개념 기준 제공 Source finding context: 서로 다른 계량 관례의 SKU가 동일 Shipment 계산 또는 시스템 간 교환에 포함될 때 Source finding context: 통합 문서가 값의 비교와 합산을 보장하지 못해 운영·비용 판단의 신뢰가 약화된다. Source finding context: 소스 시스템의 표현을 canonical 수량 모델로 정규화하지 않고 공통 속성에 직접 수용했다. Source finding context: Shipment.total_weight가 구성 OrderLine 중량의 합으로 저장된다. Source finding context: 합산 원천인 SKU 중량에는 단위 필드가 없고 kg 또는 lb가 혼재할 수 있다. Source finding context: 치수 역시 단위 없는 소스별 문자열로 정의되어 있다.
- issue-008 (medium): 수량·중량·치수 값에 단위와 변환 기준이 없어 시스템 간 비교·합산이 안전하지 않다. Source finding context: Quantities, weight, and dimensions Source finding context: materialized-input.md → Sku.weight, Sku.dims, OrderLine.qty, Shipment.total_weight Source finding context: 수량·중량·치수 값에 단위 개념과 변환 기준이 없다. Source finding context: 서로 다른 시스템의 값을 동일 의미로 비교·합산할 수 없고, total_weight 계산이나 운송 계획에서 단위 혼합 오류가 발생할 수 있다. Source finding context: Quantity/Measure와 UnitOfMeasure 개념을 도입하고 weight·length·dimension·order quantity의 표준 단위, 원본 단위, 변환 규칙을 명시한다. dims는 세 축의 수치와 단위로 구조화한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/coverage.findings.yaml#coverage-candidate-003 Source finding context: WMS/TMS/ERP 사이의 정량 데이터 통합 기준 제공 Source finding context: kg와 lb 또는 서로 다른 길이 단위를 사용하는 소스 값을 교환·합산할 때 Source finding context: 중량 합계, 용적, 운임 및 수량 대사가 의미적으로 안전하지 않다. Source finding context: 측정값을 단위가 결합된 개념으로 모델링하지 않고 number 또는 string 원시값으로만 정의했다. Source finding context: 소스별로 다른 단위를 그대로 사용하는 값들이 존재한다. Source finding context: 해당 속성들과 합산 결과에 UnitOfMeasure 또는 변환 기준이 없다.
- issue-014 (medium): 다른 단위 관례의 창고·국가·운송사를 추가하면 기존 중량·치수 값의 의미와 합산 결과가 충돌한다. Source finding context: logistics-fulfillment-ontology.yaml — Sku 측정값 모델 Source finding context: materialized-input.md:33-38, 40-49 Source finding context: 새 창고·국가·운송사를 추가하면 중량과 치수의 의미가 기존 데이터와 충돌한다. Source finding context: 다른 단위 관례를 쓰는 시스템이 추가되면 같은 값과 문자열이 서로 다른 물리량을 뜻한다. 단위 변환 규칙과 원천 단위가 없어 기존 데이터를 안정적으로 변환하거나 새 표준으로 이행할 수 없고, 합산 중량의 연속성도 깨진다. Source finding context: 중량과 각 치수를 value+unit 구조의 Measurement로 모델링하고 표준 단위 코드, 변환 규칙, 원천 값·원천 단위를 보존한다. dims 문자열은 길이 축별 구조로 분리하고 total_weight에는 계산 단위와 계산 버전을 기록한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/evolution.findings.yaml#evolution-candidate-003 Source finding context: WMS/TMS/ERP 사이에서 재사용 가능한 SKU 및 화물 측정 기준 Source finding context: kg와 lb 또는 서로 다른 길이 단위를 사용하는 창고·운송사·지역을 통합할 때 Source finding context: 기존 값과 신규 값의 의미를 구분할 수 없어 운송 계산과 제한 검증이 신뢰할 수 없게 되고, 단위 표준화 시 전면 데이터 정제가 필요하다. Source finding context: 물리량을 단위와 분리된 숫자 또는 비정형 문자열로 모델링했다. Source finding context: 서로 다른 단위 관례의 시스템을 추가하면 동일 필드 값의 의미가 충돌한다. Source finding context: Shipment.total_weight가 단위 없는 SKU 중량의 합으로 저장된다. Source finding context: 측정값에 단위, 변환 기준, 원천 표현을 담는 구조가 없다.
- issue-020 (medium): 캐리어 이벤트와 Shipment 상태의 의미 대응을 연동별로 결정해 동일 이벤트가 서로 다른 상태로 투영될 수 있다. Source finding context: Shipment.status와 TrackingEvent.event_type의 상태 의미 매핑 Source finding context: materialized-input.md:40-47, 60-68, 111-113 Source finding context: 캐리어별 이벤트와 자사 화물 상태의 의미 대응을 통합 기준에서 정의하지 않고 각 연동에 위임한다. Source finding context: 동일한 `delivered` 또는 이동 관련 이벤트가 캐리어·TMS·OMS에서 서로 다른 완료 조건이나 시점을 가질 수 있다. 매핑 권위를 연동별로 두면 같은 이벤트가 Shipment.status로 다르게 투영되어 통합 개념 기준 역할을 수행하지 못한다. Source finding context: 원시 `carrier_event_code`와 정규화된 이벤트 의미를 분리하고, 버전이 있는 canonical mapping 및 미매핑/예외 처리 규칙을 정의한다. Shipment 상태 전이의 판정 조건과 권위 시스템도 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/semantics.findings.yaml#semantics-candidate-006 Source finding context: OMS/TMS/캐리어 상태의 의미적 정합성과 통합 상태 판정 Source finding context: 여러 캐리어 또는 연동 구현이 동일 원시 이벤트를 Shipment 상태로 변환할 때 Source finding context: 연동별 매핑 차이로 동일 배송이 서로 다른 상태로 표시되고 최종 배송 판정의 신뢰성이 낮아진다. Source finding context: 원시 제공자 상태와 canonical 상태 사이의 의미 매핑 및 그 권위를 온톨로지 밖의 개별 연동에 위임했다. Source finding context: TrackingEvent.event_type과 Shipment.status는 서로 다른 enum을 사용한다. Source finding context: 두 상태의 매핑은 각 연동이 개별 결정한다. Source finding context: OMS, TMS, 캐리어의 상태 모델이 독립적으로 관리되며 canonical 판정 규칙이 없다.

## Unique Finding Tagging
- issue-016 (high): 단위 식별 없이 kg와 lb 등을 허용하고 합산 중량을 저장하므로 중량의 의미와 계산 결과가 확정되지 않는다. Source finding context: Sku.weight, Sku.dims 및 Shipment.total_weight의 단위 의미 Source finding context: materialized-input.md:33-38, 40-49 Source finding context: 동일 숫자 속성에 kg와 lb 등 서로 다른 단위를 허용하면서 단위 식별 없이 합산 중량을 저장하므로 중량 의미가 확정되지 않는다. Source finding context: 단위 없는 숫자는 시스템 간 동일한 물리량을 나타낸다고 보장할 수 없다. 서로 다른 단위의 값을 합산하면 total_weight라는 파생값도 의미적으로 무효가 되어 적재, 운임, 운송사 제한 판단에 잘못 사용될 수 있다. Source finding context: 중량과 각 치수를 값+단위로 모델링하고 통합 기준 단위 및 변환 규칙을 정한다. total_weight에는 계산 기준 단위, 구성 수량, 계산 시점 또는 원천 계측값을 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/semantics.findings.yaml#semantics-candidate-002 Source finding context: WMS/TMS/ERP 간 SKU 및 화물 물성의 일관된 교환과 출하 중량 계산 Source finding context: 단위 관례가 다른 창고나 소스 시스템의 SKU를 동일 Shipment에 포함하거나 시스템 간 전송할 때 Source finding context: 동일 숫자가 다른 물리량으로 해석되고 파생 중량 계산이 틀려 운영 및 비용 판단의 신뢰성이 훼손된다. Source finding context: 물리량의 값과 측정 단위를 분리하지 않고 숫자 또는 문자열 하나에 소스별 관례를 수용했다. Source finding context: Shipment.total_weight는 구성 OrderLine 중량의 합으로 저장된다. Source finding context: 합산 원천인 Sku.weight가 kg 또는 lb 중 어느 단위인지 표현하지 않는다. Source finding context: 물리량 속성에 명시적 단위와 정규화 규칙이 없다.
- issue-002 (medium): 단위 없는 중량·치수와 합산값은 시스템 간 비교 가능한 물리량 기준을 제공하지 못한다. Source finding context: Sku.weight, Sku.dims 및 Shipment.total_weight Source finding context: 대상: materialized-input.md:33-38,40-49. 가치 권위: review-value-alignment-criteria.yaml:6-8 (`user-request-intent`: 통합 개념 기준의 단위 정합성 검토). value_type=commitment; alignment_direction=misaligned. Source finding context: 소스별 단위 관례를 그대로 보존하는 설계는 시스템 간 비교 가능한 단위 기준을 제공하지 못한다. Source finding context: 같은 숫자와 문자열이 시스템마다 다른 물리량을 뜻할 수 있어 총중량, 운임, 용량 판단을 신뢰할 수 없다. 소스 편의성을 선택한 대가로 통합 문서의 정규화 목적을 훼손한다. Source finding context: 중량과 각 치수를 값·단위의 구조화된 수량으로 모델링하고 canonical 단위와 변환 규칙을 지정한다. `total_weight`에는 계산 단위와 구성값의 정규화 조건을 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/axiology.findings.yaml#axiology-candidate-002 Source finding context: WMS/TMS/ERP 간 단위가 일관된 상품·화물 개념 기준 제공 Source finding context: 서로 다른 계량 관례의 SKU가 동일 Shipment 계산 또는 시스템 간 교환에 포함될 때 Source finding context: 통합 문서가 값의 비교와 합산을 보장하지 못해 운영·비용 판단의 신뢰가 약화된다. Source finding context: 소스 시스템의 표현을 canonical 수량 모델로 정규화하지 않고 공통 속성에 직접 수용했다. Source finding context: Shipment.total_weight가 구성 OrderLine 중량의 합으로 저장된다. Source finding context: 합산 원천인 SKU 중량에는 단위 필드가 없고 kg 또는 lb가 혼재할 수 있다. Source finding context: 치수 역시 단위 없는 소스별 문자열로 정의되어 있다.
- issue-008 (medium): 수량·중량·치수 값에 단위와 변환 기준이 없어 시스템 간 비교·합산이 안전하지 않다. Source finding context: Quantities, weight, and dimensions Source finding context: materialized-input.md → Sku.weight, Sku.dims, OrderLine.qty, Shipment.total_weight Source finding context: 수량·중량·치수 값에 단위 개념과 변환 기준이 없다. Source finding context: 서로 다른 시스템의 값을 동일 의미로 비교·합산할 수 없고, total_weight 계산이나 운송 계획에서 단위 혼합 오류가 발생할 수 있다. Source finding context: Quantity/Measure와 UnitOfMeasure 개념을 도입하고 weight·length·dimension·order quantity의 표준 단위, 원본 단위, 변환 규칙을 명시한다. dims는 세 축의 수치와 단위로 구조화한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/coverage.findings.yaml#coverage-candidate-003 Source finding context: WMS/TMS/ERP 사이의 정량 데이터 통합 기준 제공 Source finding context: kg와 lb 또는 서로 다른 길이 단위를 사용하는 소스 값을 교환·합산할 때 Source finding context: 중량 합계, 용적, 운임 및 수량 대사가 의미적으로 안전하지 않다. Source finding context: 측정값을 단위가 결합된 개념으로 모델링하지 않고 number 또는 string 원시값으로만 정의했다. Source finding context: 소스별로 다른 단위를 그대로 사용하는 값들이 존재한다. Source finding context: 해당 속성들과 합산 결과에 UnitOfMeasure 또는 변환 기준이 없다.
- issue-014 (medium): 다른 단위 관례의 창고·국가·운송사를 추가하면 기존 중량·치수 값의 의미와 합산 결과가 충돌한다. Source finding context: logistics-fulfillment-ontology.yaml — Sku 측정값 모델 Source finding context: materialized-input.md:33-38, 40-49 Source finding context: 새 창고·국가·운송사를 추가하면 중량과 치수의 의미가 기존 데이터와 충돌한다. Source finding context: 다른 단위 관례를 쓰는 시스템이 추가되면 같은 값과 문자열이 서로 다른 물리량을 뜻한다. 단위 변환 규칙과 원천 단위가 없어 기존 데이터를 안정적으로 변환하거나 새 표준으로 이행할 수 없고, 합산 중량의 연속성도 깨진다. Source finding context: 중량과 각 치수를 value+unit 구조의 Measurement로 모델링하고 표준 단위 코드, 변환 규칙, 원천 값·원천 단위를 보존한다. dims 문자열은 길이 축별 구조로 분리하고 total_weight에는 계산 단위와 계산 버전을 기록한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/evolution.findings.yaml#evolution-candidate-003 Source finding context: WMS/TMS/ERP 사이에서 재사용 가능한 SKU 및 화물 측정 기준 Source finding context: kg와 lb 또는 서로 다른 길이 단위를 사용하는 창고·운송사·지역을 통합할 때 Source finding context: 기존 값과 신규 값의 의미를 구분할 수 없어 운송 계산과 제한 검증이 신뢰할 수 없게 되고, 단위 표준화 시 전면 데이터 정제가 필요하다. Source finding context: 물리량을 단위와 분리된 숫자 또는 비정형 문자열로 모델링했다. Source finding context: 서로 다른 단위 관례의 시스템을 추가하면 동일 필드 값의 의미가 충돌한다. Source finding context: Shipment.total_weight가 단위 없는 SKU 중량의 합으로 저장된다. Source finding context: 측정값에 단위, 변환 기준, 원천 표현을 담는 구조가 없다.
- issue-020 (medium): 캐리어 이벤트와 Shipment 상태의 의미 대응을 연동별로 결정해 동일 이벤트가 서로 다른 상태로 투영될 수 있다. Source finding context: Shipment.status와 TrackingEvent.event_type의 상태 의미 매핑 Source finding context: materialized-input.md:40-47, 60-68, 111-113 Source finding context: 캐리어별 이벤트와 자사 화물 상태의 의미 대응을 통합 기준에서 정의하지 않고 각 연동에 위임한다. Source finding context: 동일한 `delivered` 또는 이동 관련 이벤트가 캐리어·TMS·OMS에서 서로 다른 완료 조건이나 시점을 가질 수 있다. 매핑 권위를 연동별로 두면 같은 이벤트가 Shipment.status로 다르게 투영되어 통합 개념 기준 역할을 수행하지 못한다. Source finding context: 원시 `carrier_event_code`와 정규화된 이벤트 의미를 분리하고, 버전이 있는 canonical mapping 및 미매핑/예외 처리 규칙을 정의한다. Shipment 상태 전이의 판정 조건과 권위 시스템도 명시한다. Source finding context: .onto/review/20260716-b0f9e3b8/round1/semantics.findings.yaml#semantics-candidate-006 Source finding context: OMS/TMS/캐리어 상태의 의미적 정합성과 통합 상태 판정 Source finding context: 여러 캐리어 또는 연동 구현이 동일 원시 이벤트를 Shipment 상태로 변환할 때 Source finding context: 연동별 매핑 차이로 동일 배송이 서로 다른 상태로 표시되고 최종 배송 판정의 신뢰성이 낮아진다. Source finding context: 원시 제공자 상태와 canonical 상태 사이의 의미 매핑 및 그 권위를 온톨로지 밖의 개별 연동에 위임했다. Source finding context: TrackingEvent.event_type과 Shipment.status는 서로 다른 enum을 사용한다. Source finding context: 두 상태의 매핑은 각 연동이 개별 결정한다. Source finding context: OMS, TMS, 캐리어의 상태 모델이 독립적으로 관리되며 canonical 판정 규칙이 없다.

## Shared Phenomenon Summary
- none
