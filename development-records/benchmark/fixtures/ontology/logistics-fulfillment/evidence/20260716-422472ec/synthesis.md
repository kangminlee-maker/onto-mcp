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
- issue-001 (high): 재고 수량이 목적별 권위자·수량 유형·유효시점 없이 현재값과 야간 집계로 표현되어, WMS 실물 수량·ERP 회계 수량·가용재고를 일관되게 선택할 수 없고 주문 시점의 할당 근거도 재현할 수 없다.
  - root cause: 재고를 목적별 권위·유효시점·변동 이력을 가진 장부가 아니라 무시점 현재값과 야간 집계로 모델링한 것이 재고 선택, 일중 할당, 대사 재현을 함께 불가능하게 한다.
  - materiality: 이는 WMS/TMS/ERP 통합에서 재고 권위와 시간성을 공통 기준으로 제공하려는 목적을 직접 약화한다. 시스템 간 수량 불일치나 야간 스냅샷 이후 변동이 있을 때 소비자가 서로 다른 값 또는 오래된 가용량을 선택하여 과잉·중복 할당할 수 있고, 이후 대사와 감사도 재현하기 어렵다.
  - action: 출처, 수량 유형, 목적별 권위자, 유효시점과 신선도 기준을 갖는 재고 잔액을 정의하고, 예약·해제·입출고·조정을 불변의 시간 기록으로 모델링해야 한다. available_qty의 산식, 기준시각, 포함 수량 범주를 명시하고 신선도 기준을 만족하는 가용재고만 할당에 사용해야 한다. 이 계약과 잔액·변동 기록은 함께 도입하되, InventoryAggregate의 원천 provenance 보완은 issue-018의 독립 범위로 유지한다.
- issue-002 (high): 중량·치수·재고수량을 단위 없는 숫자·문자열로 표현한 현재 모델은 이기종 물류 값을 안전하게 비교·합산할 수 없게 만드는 high 이슈이며, 목표 범위에서 반드시 수정해야 한다.
  - root cause: 물리량을 값과 단위의 결합 개념으로 정의하지 않고 원시 숫자·문자열과 소스별 관례로 남긴 것이 현재 계산 오류와 신규 소스 추가 시 호환성 붕괴를 함께 만든다.
  - materiality: kg와 lb, 서로 다른 길이·포장 단위가 같은 속성에 들어오면 형식상 유효한 값도 의미상 비교 불가능해진다. 그 결과 총중량, 운임, 적재 한도, 재고 대사 및 신규 시스템과의 호환성이 조용히 훼손되어 WMS/TMS/ERP가 공유하는 단위 일관적 개념 기준이라는 목적을 직접 약화한다.
  - action: 먼저 중량·길이·재고수량에 재사용할 Quantity/Measurement 구조를 정의해 value, uom, canonical unit, 변환 및 반올림 규칙을 단일 계약으로 만든다. 다음으로 dimensions를 length/width/height의 단위 있는 값으로 구조화하고 SKU 재고 기준단위와 포장단위 환산을 명시한다. 마지막으로 Shipment.total_weight 같은 파생값에 계산 시점, 사용 단위, 구성 항목 또는 계산 근거와 규칙 버전을 보존해야 계산 재현성과 향후 변환 호환성을 확보할 수 있다.
- issue-006 (high): 현재의 Shipment→Order 이진 `fulfills` 관계만으로는 주문행별 충족 수량을 나타낼 수 없으므로, 부분·분할·합배송을 정확히 표현하거나 주문 전체의 충족 여부를 안전하게 추론할 수 없는 high 이슈다.
  - root cause: 충족 행위를 수량을 가진 독립 연결 개념이 아니라 Shipment→Order 이진 관계로 축약한 것이 부분출하 표현 누락, 변경 취약성, 전체 충족 오해를 함께 만든다.
  - materiality: 이 결함은 부분출하나 한 주문행의 다회 출하가 발생할 때 주문행별 출하량과 잔량을 WMS·TMS·ERP 사이에서 일관되게 대사하지 못하게 한다. 그 결과 관계의 존재만으로 주문을 조기 완료하고 미출하 주문행을 누락하거나 잘못된 고객 통지를 생성할 수 있어, 주문에서 출하·배송까지 추적 가능한 통합 기준이라는 선언 목적을 직접 약화한다.
  - action: 먼저 OrderLine과 Shipment를 연결하고 fulfilled_qty, quantity_uom, 생성·취소 시각 및 상태를 갖는 FulfillmentAllocation을 충족 사실의 권위 구조로 도입해야 한다. 그다음 주문 단위 `fulfills`는 이 할당들의 합계로 모든 주문행이 충족된 경우에만 도출되는 projection으로 제한해야 한다. 이 순서를 지켜야 부분 기여와 전체 완료를 구분하고 주문행별 출하량·잔량 대사와 향후 분할·합배송 확장을 동일한 근거에서 처리할 수 있다.
- issue-007 (high): Order와 Shipment lifecycle이 정상 배송 완료 경로만 폐쇄적으로 열거해 취소·실패·분실·반송·반품 및 완료 후 reversal을 표현하지 못하는 high 이슈이며, 목표 범위에서 반드시 수정해야 한다.
  - root cause: Order와 Shipment 상태 모델이 정상적인 정방향 배송 완료 단계만 폐쇄적으로 열거한 것이 취소·실패·반품 등 예외 및 역방향 lifecycle을 표현하지 못하게 한다.
  - materiality: 통합 시스템 간 공통 lifecycle은 실제 운영 상태를 손실 없이 투영해야 한다. 현재 모델에서는 예외 상황을 기존 상태에 억지로 남기거나 delivered로 잘못 종결해야 하므로 후속 처리와 책임 추적이 불명확해지고 선언된 통합 목적이 훼손된다.
  - action: 먼저 Order와 Shipment에 공통으로 적용할 명시적 전이 모델을 정의해 정상·취소·실패·반품 종결 경로, 예외 발생·해결 단계, 완료 후 reversal·return 사건을 구분해야 한다. 이후 기존 상태와 사건을 이 전이 모델에 매핑해 예외 상황에서도 상태 보존, 후속 처리, 책임 추적이 가능함을 검증해야 한다.
- issue-009 (high): 캐리어 원천 이벤트와 내부 정규 상태 사이에 공유되고 버전 관리되는 매핑 계약이 없어, 동일 사건의 현재 해석과 변경 이후 과거 사건의 재현이 일관되지 않습니다. 이 문제는 현재 통합을 막는 근본 원인이므로 대상 범위에서 즉시 해소해야 합니다.
  - root cause: 원천 상태와 정규 상태 사이에 버전·유효기간을 가진 canonical 매핑 개념이 없는 것이 현재 연동별 해석 불일치와 신규 상태 도입 시 변경 취약성을 함께 만든다.
  - materiality: 여러 캐리어나 연동이 같은 Shipment를 갱신할 때 각 커넥터가 상태 의미를 독자적으로 결정하면 의미 드리프트와 상충 상태가 발생합니다. 새 코드·취소·반품·부분배송 같은 수명주기 또는 기존 코드의 의미 변경까지 고려하면, 과거 이벤트에 당시 어떤 규칙이 적용됐는지도 재현할 수 없습니다. 따라서 OMS·TMS·캐리어 상태를 일관되고 변경 가능하게 통합한다는 목적이 현재의 상태 일관성과 장기 변경 내성 양쪽에서 약화됩니다.
  - action: 원천 코드와 안정적인 정규 상태를 분리하고, CarrierEventMapping에 해당하는 공유 매핑 권위를 정의해야 합니다. 이 개념에는 carrier, external_code, canonical_event 또는 canonical_status, 버전, 유효기간, 우선순위와 미매핑 처리 정책이 포함되어야 합니다. 먼저 이 매핑을 상태 해석의 단일 권위로 세운 뒤 각 연동이 이를 사용하도록 연결해야 현재 drift를 막고 과거 이벤트를 당시 규칙으로 재현할 수 있습니다. 신규 수명주기는 기존 정규 상태를 불필요하게 깨지 않도록 호환 가능한 전이 규칙으로 확장해야 합니다.
  - unresolved disagreement: 근본 원인과 조치에는 합의가 있으나 coverage 렌즈는 현재 의미 드리프트만 기준으로 심각도를 medium으로 보았습니다. 최종 심각도는 신규 코드와 의미 변경 시의 과거 해석 재현 실패까지 포함하여 high로 확정되었습니다.
- issue-010 (high): 재고 권위나 갱신 방식이 바뀌어도 값의 의미와 이력을 이어갈 수 있도록, 재고를 출처·시점·산출 규칙이 명시된 관측 또는 스냅샷으로 모델링해야 하는 high 이슈다.
  - root cause: 재고를 출처·유효시간·산출 버전이 있는 관측 또는 스냅샷으로 모델링하지 않은 것이 권위나 갱신 주기 변경 전후의 데이터 연속성을 끊는다.
  - materiality: 현재 구조에서는 새 WMS 도입, ERP 권위 변경, 배치 주기 변경 또는 과거 시점 재현 시 기존 값이 어느 시스템의 어느 시점을 나타내는지 판별할 수 없다. 이 때문에 WMS와 ERP의 재고 권위 및 시간성을 조정하려는 통합 기준이 약화되고, 재고 할당의 재현성과 변경 후 데이터 연속성이 상실된다.
  - action: 먼저 재고 관측과 집계를 이력의 권위로 삼고 source_system, observed_at/as_of, recorded_at, 수량 의미와 단위, 입력 범위, 계산 시점 및 산출 규칙 버전을 기록해야 한다. 그 다음 현재 재고 값은 이 이력 모델에서 계산되는 명시적 projection으로 정의해야 한다. 기존 기록은 확인 가능한 근거만 이관하고 복원할 수 없는 provenance는 불명으로 남겨, 새 필드가 과거 의미를 임의로 복원한 것처럼 취급하지 않아야 한다.
- issue-012 (high): WMS의 실물 재고와 ERP의 회계 재고를 단일 `quantity_on_hand`로 표현하면 목적별 기준 수량을 식별할 수 없으므로, issue-010과 연계되더라도 독립적인 high 이슈로 즉시 수정해야 한다.
  - root cause: WMS 실물 수량과 ERP 회계 수량을 출처·시점 없는 단일 quantity_on_hand로 축약한 것이 서로 다른 실재와 권위를 혼합한다.
  - materiality: 야간 조정 전처럼 WMS와 ERP 값이 다르거나 과거 값과 현재 값을 구분해야 할 때, 출처·유형·시점이 없는 수량으로는 피킹·할당·회계 조정에 적용할 권위를 선택할 수 없다. 그 결과 기준 수량이 뒤바뀌고 자동 처리와 감사가 불가능해져 WMS와 ERP의 재고 의미·권위·시간성을 일관되게 통합하려는 목적이 약화된다.
  - action: 실물 수량과 회계 수량을 별도 개념으로 분리하거나 명시적 `quantity_type`을 가진 관측 구조로 모델링하고, 각 값에 `source_system`, `as_of`, 조정 상태를 보존해야 한다. 먼저 원천별 값과 시점을 손실 없이 표현한 뒤 소비 목적별 권위 선택 규칙을 연결해야 하며, 기존 레코드의 새 유형 체계 이관은 issue-010과 함께 처리해야 한다.
- issue-013 (high): 야간 집계 스냅샷을 current `available_qty`로 노출하면 이름이 약속하는 현재성과 실제 유효시점이 어긋난다. 더 넓은 재고 관측 결함과 연결되지만, 일중 할당에서 독립적인 실패 조건과 교정안이 있는 high 이슈로 즉시 수정해야 한다.
  - root cause: 시점이 있는 집계 스냅샷과 현재 가용재고를 동일 개념으로 취급한 것이 야간 값을 일중 현재값처럼 노출한다.
  - materiality: 재고 할당에 사용할 공통 가용 재고 의미가 오래된 야간 값을 현재값처럼 전달한다. 스냅샷 이후 주문·예약·피킹·재고 조정이 발생하면 이미 소진되거나 보류된 재고를 다시 할당해 중복 할당 또는 품절 주문 승인을 초래할 수 있으므로 목적의 신뢰성과 안전성을 직접 약화한다.
  - action: 먼저 집계값을 `as_of`가 포함된 명시적 스냅샷 계약으로 분리하고, 할당 시점의 current 가용량은 보유량·예약량·보류량 등 권위 있는 최신 원천에서 계산되는 별도 projection으로 정의해야 한다. 이후 일중 할당 경로가 반드시 이 최신 projection을 사용하도록 연결하고 검증해야 오래된 스냅샷의 현재값 오용을 차단할 수 있다.
- issue-014 (high): Shipment.total_weight는 단위가 명시된 공통 측정 계약뿐 아니라 출하 라인별 수량을 반영하는 권위 있는 산식, 계량값과 파생값의 구분, 계산 provenance가 없어 동일 화물의 재계산 결과가 시스템마다 달라질 수 있는 독립적인 high 이슈이다.
  - root cause: 측정값 단위와 total_weight의 권위 있는 계산 산식을 모델 계약에 포함하지 않은 것이 파생 중량을 비결정적으로 만든다.
  - materiality: WMS와 TMS가 동일한 화물 중량과 운송 계산 의미를 공유해야 하지만, 서로 다른 단위의 SKU가 섞이거나 수량이 1보다 크면 운임, 적재 한도, 서비스 선택, 라벨 데이터가 서로 다르게 산출될 수 있다. 이는 공통 의미를 제공하려는 목적을 직접 약화한다.
  - action: 먼저 issue-002의 단위 있는 공통 측정·변환 계약을 적용한 뒤, total_weight를 각 출하 라인의 shipped_qty × unit_weight를 정규 단위로 변환해 합산하는 권위 있는 산식으로 계약해야 한다. 함께 입력 라인 범위, 계산 시점과 출처, 규칙 버전, 계량값과 계산값의 구분을 기록해야 동일 화물의 재계산을 결정적으로 만들고 저장된 파생값의 드리프트를 판별할 수 있다.
- issue-017 (high): Shipment와 OrderLine 사이에 출하 수량을 포함하는 연결이 없어 부분·분할 출하의 라인 구성, 충족 수량, 잔량 및 Shipment.total_weight의 근거를 구조적으로 추적할 수 없는 독립적인 high 이슈이며, 목표 범위에서 즉시 해소해야 한다.
  - root cause: Shipment→Order 관계만 두고 Shipment와 OrderLine 사이의 수량 포함 연결을 생략한 것이 부분출하 구조와 total_weight 구성 근거를 단절한다.
  - materiality: 이 결함은 한 OrderLine이 여러 Shipment로 나뉘거나 한 Shipment가 주문 일부만 충족할 때 WMS·TMS·ERP가 출하 귀속, 부분충족, 잔량과 중량 산출 근거를 동일한 구조로 교환하거나 감사하지 못하게 한다. 따라서 주문→재고 할당→출하 흐름의 통합 개념 기준을 제공한다는 목적을 직접 약화한다.
  - action: Shipment와 OrderLine을 연결하면서 출하 수량을 보유하는 ShipmentLine 또는 FulfillmentAllocation 개념을 도입해야 한다. 이어 각 OrderLine의 출하 수량 합계가 주문 수량과 일치하거나 허용된 부분충족 상태를 만족하도록 정합성 규칙을 정의하고, 이 라인 구성을 Shipment.total_weight 산출 근거로 연결해야 한다. 연결 개념을 먼저 확립한 뒤 수량 합계와 중량 provenance 규칙을 적용해야 검증 대상이 명확해진다.
- issue-004 (medium): Shipment→Order 관계만으로는 부분출하 시 주문행별 충족량·잔량·완료 근거를 추적할 수 없다. 따라서 다음 구현 단계 전에 수량 기반의 OrderLine–Shipment 충족 연결을 모델의 권위 있는 사실로 도입해야 한다.
  - root cause: fulfillment를 수량을 가진 OrderLine 수준 사실이 아니라 Shipment에서 Order로 향하는 거친 관계로 축약한 것이 부분출하의 고객·운영 추적 근거를 제거한다.
  - materiality: 이 결함은 한 주문이나 OrderLine이 여러 Shipment로 나뉘는 경우 완료 여부와 미출고 잔량을 재구성할 근거를 없앤다. 그 결과 주문에서 화물까지 추적한다는 기준 목적이 훼손되고, 고객 문의 대응·운영 복구·정산의 신뢰도도 약화된다.
  - action: OrderLine과 Shipment 사이에 FulfillmentAllocation 또는 ShipmentLine 같은 연결 개념을 두고 fulfilled_qty, 단위, 할당·출하 시점, 취소·반품 조정 이력을 기록해야 한다. Order 상태와 잔량은 이 사실에서 집계하도록 정의해야 하며, 이는 다음 구현 단계 전에 닫아야 할 선행 조건이다.
  - unresolved disagreement: 구조 렌즈는 심각도를 높여야 한다고 보았지만, high를 뒷받침할 도메인 임계값이나 광범위한 운영 중단·재무 영향 증거가 없어 최종 심각도는 medium으로 유지되었다.
- issue-005 (medium): ETA를 덮어쓰는 단일 표시값으로 관리하면 캐리어 예측과 운영팀 조정의 출처·시점·변경 근거가 사라진다. 따라서 출처와 유효시점, 대체 관계, 조정 사유를 보존하는 ETA revision 모델이 필요한 medium 이슈다.
  - root cause: ETA를 출처와 유효시점을 가진 예측 이력이 아니라 덮어쓰는 단일 표시값으로 모델링한 것이 배송 약속의 권위와 변경 근거를 제거한다.
  - materiality: 캐리어 예측과 운영팀 조정값이 다르거나 ETA가 반복 갱신될 때 현재 모델로는 고객에게 제시한 배송 약속의 근거와 신선도를 재현하거나 감사할 수 없다. 그 결과 오래된 값이 최종값으로 남을 수 있어 배송 시간 정보의 권위와 시간성을 일관되게 전달하려는 목적이 약화된다.
  - action: 다음 단계 전에 ETA를 value, generated_at/as_of, source, method, confidence, supersedes, adjustment_reason을 갖는 시계열 revision으로 분리해야 한다. 이어서 캐리어 예측과 운영팀 조정 중 어떤 revision을 표시 ETA로 선택하는지 권위와 우선순위 규칙을 명시해야 한다. revision 이력을 먼저 보존하고 그 위에 표시값 projection을 두어야 수기 재량을 유지하면서도 변경 근거와 시간성을 확보할 수 있다.
- issue-008 (medium): ETA를 덮어쓰는 단일 속성으로 유지하면 출처와 변경 근거를 감사할 수 없으므로, 값·출처·시점·대체 관계·행위자·사유를 보존하는 ETA revision 모델이 필요한 medium 이슈다.
  - root cause: ETA를 출처·유효시점·변경 행위자를 가진 추정 이력이 아니라 덮어쓰는 단일 값으로 모델링한 것이 감사 증거를 누락시킨다.
  - materiality: 캐리어 ETA와 수동 ETA가 다르거나 운영팀이 값을 반복 수정할 때 현재 표시값의 출처와 근거, 과거 예측을 재구성할 수 없다. 이는 TMS·캐리어·운영 시스템 간 배송 예측을 일관되게 공유한다는 목적을 약화시키며, 운영 판단의 신뢰와 오류 복구 가능성을 떨어뜨린다.
  - action: EtaEstimate 또는 EtaRevision에 value, source, observed_at, valid_from, supersedes, actor_ref, reason을 기록하고, 최종 표시 ETA를 이 이력과 명시된 우선순위에서 산출되는 파생값으로 정의해야 한다. 이 감사 증거 축은 다음 단계 전에 닫아야 하며, 출시 전 수정하거나 최소한 필수 후속 조치로 확정해야 한다.
- issue-011 (medium): DeliveryLeg를 Shipment의 하위 유형으로 둔 모델은 전체 화물과 운송 구간의 의미를 혼합하므로, 다구간 확장 전에 DeliveryLeg를 Shipment의 구성 요소로 분리해야 한다.
  - root cause: 부분-전체 관계인 DeliveryLeg를 Shipment의 하위 유형으로 모델링한 것이 다구간·구간별 운송사 확장 시 전체 화물과 구간의 속성 의미를 충돌시킨다.
  - materiality: 한 Shipment에 여러 구간과 구간별 운송사·상태·ETA를 추가하면 전체 화물 속성과 구간 속성이 충돌하거나 중복 저장된다. 이는 기존 구조를 유지한 채 TMS 경로와 화물 개념을 확장 가능한 공통 모델로 제공하려는 목적을 약화시키므로 material한 medium 이슈이며, 다음 통합 단계 전에 해소해야 한다.
  - action: 다음 통합 단계 전에 DeliveryLeg의 Shipment 상속을 제거하고 Shipment가 순서가 있는 DeliveryLeg들을 구성 요소로 보유하도록 모델링해야 한다. 운송사·구간 상태·구간 ETA는 DeliveryLeg에, 전체 상태·중량·종합 ETA는 Shipment에 두며, 구간 값에서 전체 값을 산출하는 집계 규칙과 책임을 명시해야 속성 충돌과 중복을 방지할 수 있다.
- issue-015 (medium): DeliveryLeg를 Shipment의 하위 유형으로 둔 채 소속 Shipment 참조를 생략해, 구간과 전체 화물의 의미가 혼동되고 다구간 경로 구조가 단절된 medium 이슈다.
  - root cause: DeliveryLeg의 정체성을 Shipment 하위형으로 잘못 두고 상위 Shipment 구성 참조를 생략한 것이 유형 오류와 다구간 경로 단절을 함께 만든다.
  - materiality: 다구간 배송에서 구간 상태·도착·완료를 전체 Shipment와 구분할 수 없고, 이벤트 귀속과 화물별 경로 그룹화·순서·연속성도 검증할 수 없다. 따라서 화물과 배송 구간을 TMS 통합의 공통 의미·구조로 제공하려는 목적이 약화되며, 다음 단계 전에 해소해야 한다.
  - action: DeliveryLeg를 독립 구성 엔터티로 전환하고 명시적인 `part_of Shipment` 관계를 추가해야 한다. 그다음 Shipment별 `leg_seq` 유일성, 인접 구간의 `to_ref`–`from_ref` 연속성, 구간별 운송사·상태·ETA 및 완료 의미를 별도 계약으로 정의해야 한다. 구간 귀속을 먼저 확립해야 순서와 연속성 제약을 정확한 Shipment 범위에 적용할 수 있다.
- issue-016 (medium): 캐리어 예측 ETA와 운영팀 override를 단일 무출처 `eta`로 혼합한 현재 모델은 표시 ETA의 의미·출처·신선도·선택 권위를 모호하게 하므로, 다음 통합 단계 전에 폐쇄해야 하는 독립 medium 이슈다.
  - root cause: 캐리어 예측과 운영팀 수정이라는 서로 다른 ETA 주장을 하나의 무출처 datetime으로 축약한 것이 예상 시각의 의미와 권위를 모호하게 한다.
  - materiality: 캐리어 예측 갱신이나 운영팀 수기 조정 후 다른 시스템이 ETA를 소비하면 운송사 예측과 내부 판단을 같은 사실로 취급하게 된다. 그 결과 TMS·캐리어·운영 화면 사이 공통 의미와 권위가 약화되고, 예측 정확도 평가·지연 판단·고객 안내의 일관성이 훼손된다.
  - action: 캐리어 예측과 운영 조정 ETA를 원천별 관측 또는 별도 속성으로 모델링하고 각 값에 `source`, `predicted_at`, 운영 override의 `override_reason`을 보존해야 한다. 이어 최종 표시 ETA를 선택하는 명시적 우선순위 규칙과 projection을 정의해야 한다. 이 현재값의 정체성·선택 권위는 다음 통합 단계 전에 해결하되, 변경 이력·감사·revision 수명주기는 issue-005와 issue-008의 소유 범위로 남겨 중복 구현을 피해야 한다.
- issue-018 (medium): InventoryAggregate가 원천 InventoryRecord 집합이나 집계 범위와 연결되지 않아 available_qty의 구성 근거를 재현할 수 없는 medium 이슈이며, 다음 단계 전에 폐쇄해야 한다.
  - root cause: InventoryAggregate가 원천 InventoryRecord 집합이나 집계 범위와 연결되지 않은 독립 현재값으로 정의된 것이 집계 구성 provenance를 제거한다.
  - materiality: available_qty는 일중 주문 할당의 직접 입력이지만 포함·제외된 창고와 원천 레코드를 식별할 수 없다. 따라서 WMS와 ERP 간에 집계값을 재현·조정·감사할 수 없어 재고 할당의 공통 기준을 제공하려는 목적의 추적성과 검증 가능성이 약화된다.
  - action: InventoryAggregate에 원천 InventoryRecord 집합 또는 명시적인 집계 범위·원천 관계를 추가하고, 스냅샷 시점별로 원천 합계와 available_qty를 검증할 수 있는 구조를 정의해야 한다. 이는 재계산·조정·감사의 기반이므로 다음 단계 전에 완료해야 하며, 관련된 재고 권위·시간성 계약과 구별되는 독립 provenance 축으로 유지해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-009: 근본 원인과 조치에는 합의가 있으나 coverage 렌즈는 현재 의미 드리프트만 기준으로 심각도를 medium으로 보았습니다. 최종 심각도는 신규 코드와 의미 변경 시의 과거 해석 재현 실패까지 포함하여 high로 확정되었습니다.
- issue-004: 구조 렌즈는 심각도를 높여야 한다고 보았지만, high를 뒷받침할 도메인 임계값이나 광범위한 운영 중단·재무 영향 증거가 없어 최종 심각도는 medium으로 유지되었다.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: resolved
- issue-010: no-deliberation-needed
- issue-012: resolved
- issue-013: resolved
- issue-014: resolved
- issue-017: resolved
- issue-004: resolved
- issue-005: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: resolved
- issue-018: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: WMS/TMS/ERP 통합을 위한 재고 권위·시간성 및 주문 할당의 공통 개념 기준 Source finding context: WMS/TMS/ERP 통합을 위한 재고 권위·시간성의 공통 개념 기준 Source finding context: 주문 할당과 재고를 WMS/ERP 간 일관되게 해석하는 기준 제공 Source finding context: WMS/ERP 간 재고 개념과 권위의 통합 기준 제공
- issue-002: WMS/TMS/ERP가 공유할 단위 일관적인 수량·중량·치수 개념 기준 Source finding context: WMS/TMS/ERP 간 단위가 일관된 SKU·화물 기준 제공 Source finding context: WMS/TMS/ERP가 공유할 물류 수량·중량 의미의 기준 제공 Source finding context: WMS/TMS/ERP 통합의 개념 기준으로서 이기종 물류 데이터를 확장 가능하게 정렬하는 목적
- issue-006: 주문에서 출하·배송까지 추적 가능한 WMS/TMS/ERP 주문충족 통합 기준 Source finding context: 주문→출하 전 과정의 WMS/TMS/ERP 통합 개념 기준 제공 Source finding context: 주문에서 출하·배송까지 추적 가능한 주문충족 통합 기준 Source finding context: 주문·출하 개념을 WMS/TMS/ERP 통합의 공통 의미 기준으로 제공하는 목적
- issue-007: 주문·출하·배송 상태를 통합 시스템 간 공통 lifecycle로 제공
- issue-009: OMS/TMS/캐리어 간 상태 의미를 일관되고 변경 가능하게 통합하는 개념 기준 Source finding context: OMS/TMS/캐리어 간 상태 의미의 통합 기준 제공 Source finding context: OMS/TMS/캐리어 간 상태 모델을 통합하는 개념 기준
- issue-010: WMS와 ERP 재고 권위 및 시간성을 조정하는 통합 기준
- issue-012: WMS와 ERP 사이 재고 의미·권위·시간성을 일관되게 통합하는 목적
- issue-013: 재고 할당에 사용할 공통 가용 재고 의미를 정의하는 목적
- issue-014: WMS/TMS가 공유할 화물 중량·치수 및 운송 계산의 공통 의미 제공 Source finding context: WMS/TMS가 공유할 화물 중량·치수 및 운송 계산의 공통 의미를 제공하는 목적
- issue-017: 주문→재고 할당→출하 흐름을 WMS/TMS/ERP 통합의 개념 기준으로 제공 Source finding context: 주문→재고 할당→출하 흐름을 WMS/TMS/ERP 통합의 개념 기준으로 제공하는 목적
- issue-004: 주문에서 화물까지 추적 가능한 주문충족 개념 기준
- issue-005: 배송 시간 정보의 권위와 시간성을 일관되게 전달하는 통합 기준
- issue-008: 배송 예측 값을 TMS·캐리어·운영 시스템 간 일관되게 공유
- issue-011: TMS 경로와 화물 개념을 확장 가능한 공통 모델로 제공 Source finding context: TMS 경로와 화물 개념을 확장 가능한 공통 모델로 제공하는 목적
- issue-015: 화물과 배송 구간을 TMS 통합의 공통 의미·구조로 제공하는 목적 Source finding context: 화물과 배송 구간의 개념을 TMS 연동 기준으로 일관되게 정의하는 목적 Source finding context: 화물·배송 개념을 TMS 통합의 공통 구조로 제공하는 목적
- issue-016: TMS·캐리어·운영 화면 사이 예상 도착 시각의 공통 의미와 권위 제공 Source finding context: TMS·캐리어·운영 화면 사이 예상 도착 시각의 공통 의미와 권위를 제공하는 목적
- issue-018: WMS와 ERP 재고 데이터를 연결하고 재고 할당의 공통 기준을 제공 Source finding context: WMS와 ERP의 재고 데이터를 연결하고 재고 할당의 공통 기준을 제공하는 목적

## Final Review Result
17 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 재고 수량이 목적별 권위자·수량 유형·유효시점 없이 현재값과 야간 집계로 표현되어, WMS 실물 수량·ERP 회계 수량·가용재고를 일관되게 선택할 수 없고 주문 시점의 할당 근거도 재현할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 논의는 의미 계약과 재현 가능한 잔액·변동 기록의 필요성에 합의했으며 남은 렌즈 간 이견은 없다.
- InventoryAggregate 원천 provenance는 issue-018에서 별도로 다룬다.
- SKU 수량이 항상 개수인지 중량·포장 단위도 허용하는지는 경계 내 증거만으로 확정할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-010 (high): fix_now
- issue-012 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now
- issue-017 (high): fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-015 (medium): fix_before_release, follow_up
- issue-016 (medium): fix_before_release, follow_up
- issue-018 (medium): fix_before_release, follow_up

## Recommendations
- issue-003 (high): 주문, 화물, 캐리어 이벤트의 상태 의미와 권위가 구분되지 않고 공통 매핑도 없어 동일 이벤트가 연동별로 다른 완료·예외 판단을 만든다. Source finding context: Order.fulfillment_status, Shipment.status 및 TrackingEvent.event_type Source finding context: .onto/review/20260716-422472ec/execution-preparation/materialized-input.md:19-22,44-47,60-68,111-113; value authority: .onto/review/20260716-422472ec/execution-preparation/review-value-alignment-criteria.yaml:6-8 — 상태 모델 정합성을 갖춘 통합 기준 목적 Source finding context: [boundary/misaligned] 상태 의미와 매핑을 각 연동에 위임하여, 온톨로지가 통합 경계의 공통 상태 계약 역할을 스스로 포기한다. Source finding context: 동일 이벤트가 연동별로 다른 상태 전이를 만들 수 있고 delivered 같은 동명 상태도 주문·화물·이벤트에서 서로 다른 완료 의미를 가질 수 있다. 이는 상태 정합성을 위한 기준 문서라는 목적 대신 국소 구현 편의를 우선한 선택이다. Source finding context: 각 상태 체계의 소유권은 유지하되 canonical fulfillment milestone과 명시적 매핑 규칙을 정의한다. 허용 전이, 예외·취소·반품, 순서 역전·중복 이벤트 처리, 주문 상태 집계 규칙도 계약화한다. Source finding context: .onto/review/20260716-422472ec/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: OMS/TMS/캐리어 상태를 일관되게 해석하는 통합 개념 기준 Source finding context: 둘 이상의 연동이 동일 캐리어 이벤트를 Shipment 또는 Order 상태로 변환할 때 Source finding context: 연동별 상태 drift로 고객 표시, 운영 예외 처리, 완료 판정이 달라질 수 있다. Source finding context: 온톨로지가 시스템별 상태를 연결하는 canonical milestone과 매핑·전이 권위를 정의하지 않는다. Source finding context: 캐리어 event_type와 Shipment.status의 매핑을 각 연동이 독자적으로 수행한다. Source finding context: Order, Shipment, TrackingEvent 상태는 각 소유 시스템이 독립 관리한다. Source finding context: 통합 기준이 상태 의미를 중재하지 않고 연동 구현에 위임한다. Source finding context: Order, Shipment, and TrackingEvent state semantics Source finding context: materialized-input.md:19-22,44-47,60-68,111-113 Source finding context: 세 상태 모델의 동명 상태가 서로 다른 대상·권위를 뜻하지만 의미 매핑 없이 독립 관리된다. Source finding context: 이벤트가 보고한 배송, 한 화물의 배송 완료, 여러 화물로 충족되는 주문의 배송 완료는 동일한 사실이 아니다. 통합별 자의적 매핑은 같은 입력을 서로 다른 주문 상태로 번역하게 하며 예외·부분배송에서 특히 의미가 갈린다. Source finding context: 각 상태의 적용 대상과 완료 조건을 명시하고, 원시 캐리어 코드와 정규화된 이벤트 유형을 분리한다. 버전 관리되는 캐리어별 매핑과 Shipment→Order 상태 파생 규칙을 공통 계약에 포함한다. Source finding context: .onto/review/20260716-422472ec/round1/semantics.findings.yaml#semantics-candidate-007 Source finding context: OMS/TMS/캐리어 간 상태 모델을 공통 개념 기준으로 제공하는 목적 Source finding context: 캐리어 이벤트로 Shipment 또는 Order 상태를 갱신하거나 부분배송·예외를 처리하는 경우 Source finding context: 연동마다 완료 의미가 달라져 조기 주문 완료, 누락된 예외, 상충하는 고객 안내가 발생할 수 있다. Source finding context: 대상과 권위가 다른 상태 어휘를 공통 의미 정의와 매핑 계약 없이 병렬로 두었다. Source finding context: Order, Shipment, TrackingEvent가 유사한 배송 진행 상태어를 사용한다. Source finding context: 각 상태는 OMS, TMS, 캐리어가 독립적으로 관리한다. Source finding context: 캐리어 상태와 Shipment 상태의 의미 매핑은 공통 모델이 아니라 개별 연동에 위임된다.

## Unique Finding Tagging
- issue-003 (high): 주문, 화물, 캐리어 이벤트의 상태 의미와 권위가 구분되지 않고 공통 매핑도 없어 동일 이벤트가 연동별로 다른 완료·예외 판단을 만든다. Source finding context: Order.fulfillment_status, Shipment.status 및 TrackingEvent.event_type Source finding context: .onto/review/20260716-422472ec/execution-preparation/materialized-input.md:19-22,44-47,60-68,111-113; value authority: .onto/review/20260716-422472ec/execution-preparation/review-value-alignment-criteria.yaml:6-8 — 상태 모델 정합성을 갖춘 통합 기준 목적 Source finding context: [boundary/misaligned] 상태 의미와 매핑을 각 연동에 위임하여, 온톨로지가 통합 경계의 공통 상태 계약 역할을 스스로 포기한다. Source finding context: 동일 이벤트가 연동별로 다른 상태 전이를 만들 수 있고 delivered 같은 동명 상태도 주문·화물·이벤트에서 서로 다른 완료 의미를 가질 수 있다. 이는 상태 정합성을 위한 기준 문서라는 목적 대신 국소 구현 편의를 우선한 선택이다. Source finding context: 각 상태 체계의 소유권은 유지하되 canonical fulfillment milestone과 명시적 매핑 규칙을 정의한다. 허용 전이, 예외·취소·반품, 순서 역전·중복 이벤트 처리, 주문 상태 집계 규칙도 계약화한다. Source finding context: .onto/review/20260716-422472ec/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: OMS/TMS/캐리어 상태를 일관되게 해석하는 통합 개념 기준 Source finding context: 둘 이상의 연동이 동일 캐리어 이벤트를 Shipment 또는 Order 상태로 변환할 때 Source finding context: 연동별 상태 drift로 고객 표시, 운영 예외 처리, 완료 판정이 달라질 수 있다. Source finding context: 온톨로지가 시스템별 상태를 연결하는 canonical milestone과 매핑·전이 권위를 정의하지 않는다. Source finding context: 캐리어 event_type와 Shipment.status의 매핑을 각 연동이 독자적으로 수행한다. Source finding context: Order, Shipment, TrackingEvent 상태는 각 소유 시스템이 독립 관리한다. Source finding context: 통합 기준이 상태 의미를 중재하지 않고 연동 구현에 위임한다. Source finding context: Order, Shipment, and TrackingEvent state semantics Source finding context: materialized-input.md:19-22,44-47,60-68,111-113 Source finding context: 세 상태 모델의 동명 상태가 서로 다른 대상·권위를 뜻하지만 의미 매핑 없이 독립 관리된다. Source finding context: 이벤트가 보고한 배송, 한 화물의 배송 완료, 여러 화물로 충족되는 주문의 배송 완료는 동일한 사실이 아니다. 통합별 자의적 매핑은 같은 입력을 서로 다른 주문 상태로 번역하게 하며 예외·부분배송에서 특히 의미가 갈린다. Source finding context: 각 상태의 적용 대상과 완료 조건을 명시하고, 원시 캐리어 코드와 정규화된 이벤트 유형을 분리한다. 버전 관리되는 캐리어별 매핑과 Shipment→Order 상태 파생 규칙을 공통 계약에 포함한다. Source finding context: .onto/review/20260716-422472ec/round1/semantics.findings.yaml#semantics-candidate-007 Source finding context: OMS/TMS/캐리어 간 상태 모델을 공통 개념 기준으로 제공하는 목적 Source finding context: 캐리어 이벤트로 Shipment 또는 Order 상태를 갱신하거나 부분배송·예외를 처리하는 경우 Source finding context: 연동마다 완료 의미가 달라져 조기 주문 완료, 누락된 예외, 상충하는 고객 안내가 발생할 수 있다. Source finding context: 대상과 권위가 다른 상태 어휘를 공통 의미 정의와 매핑 계약 없이 병렬로 두었다. Source finding context: Order, Shipment, TrackingEvent가 유사한 배송 진행 상태어를 사용한다. Source finding context: 각 상태는 OMS, TMS, 캐리어가 독립적으로 관리한다. Source finding context: 캐리어 상태와 Shipment 상태의 의미 매핑은 공통 모델이 아니라 개별 연동에 위임된다.

## Shared Phenomenon Summary
- none
