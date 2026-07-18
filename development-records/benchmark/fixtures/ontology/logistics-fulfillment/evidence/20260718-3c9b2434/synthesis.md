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
- issue-001 (high): 출처·권위·유효시점이 없는 야간 스냅샷형 재고 모델은 일중 할당의 근거를 일관되게 해석하거나 재현할 수 없게 하며, 실시간·다중 원장 전환까지 불안정하게 만드는 high 수준의 현재 차단 문제다.
  - root cause: 재고를 출처·유효시점이 있는 관측값이 아니라 무시점 현재값과 야간 스냅샷으로 모델링한 것이 현재 할당과 향후 실시간·다중 원장 전환을 모두 불안정하게 만든다.
  - materiality: 야간 스냅샷 이후 재고가 변하거나 WMS 실물 수량과 ERP 회계 수량이 불일치하면, 같은 온톨로지를 사용하는 시스템도 서로 다른 수량을 사실로 간주할 수 있다. 그 결과 재고 부족·중복 약속의 원인을 설명하기 어렵고 운영 신뢰와 감사 가능성이 훼손되므로, 권위와 시간성을 일관되게 해석해 안전한 할당을 지원한다는 선언 목적이 직접 약화된다.
  - action: 먼저 출처, 권위, 수량 종류, 유효시점, 정책 버전을 필수 속성으로 갖는 시간 유효 재고 관측 모델을 정의해야 한다. 다음으로 각 할당이 사용한 관측값 또는 스냅샷을 명시적으로 연결하고, 예약·가용량 계산 정책과 권위 우선순위, 허용 가능한 최대 시차 및 오래된 입력의 실패 처리를 그 참조에 결합해야 한다. 이 순서가 필요한 이유는 관측의 의미와 권위가 먼저 확정되어야 할당 규칙과 마이그레이션이 새 기준을 안정적으로 따를 수 있기 때문이다.
- issue-002 (high): 주문 전체를 대상으로 하는 `fulfills` 관계만으로는 부분·분할 출하에서 어느 Shipment가 어떤 OrderLine의 수량을 충족했는지 추적할 수 없다. 주문선·수량 수준의 충족 할당 개념이 반드시 필요하다.
  - root cause: 충족 관계의 기준 단위를 주문 전체로 고정하고 주문 줄·수량 수준의 연결 개념을 제외했다.
  - materiality: 이 누락은 주문부터 출하·배송까지의 충족 관계를 WMS·TMS·ERP가 공통으로 해석한다는 목적을 직접 약화한다. 부분 출하, 취소 또는 대체 충족이 발생하면 실제 충족 수량을 판정할 근거가 없어 통합 추적, 주문 상태 산정, 정산과 고객 대응의 공통 기준이 사라진다.
  - action: OrderLine과 Shipment 또는 출하 품목을 연결하는 충족 할당 개념을 정의하고, 충족 수량, 단위, 확정 시점을 그 개념의 속성으로 둬야 한다. 먼저 이 연결을 주문충족의 권위 있는 기준으로 정립한 뒤 부분·취소·대체 충족 및 주문 상태·잔량·정산을 그 할당에서 파생하도록 해야 시스템 간 해석이 일치한다.
- issue-003 (high): 수량·중량·치수와 파생값에 단위 및 환산 기준이 결합되어 있지 않아, 혼합 단위 계산과 신규 소스 통합을 신뢰할 수 없는 high 문제이며 대상에서 반드시 수정해야 한다.
  - root cause: 물류 측정값을 단위가 결합된 값 객체가 아닌 원시 숫자나 문자열로 모델링하고 소스별 관례에 맡겼다.
  - materiality: WMS/TMS/ERP 간 측정값을 손실 없이 일관되게 공유하려면 같은 숫자가 같은 수량 또는 물리량을 뜻해야 한다. 현재는 kg/lb, 치수 단위, 개·박스·팔레트 같은 포장 단위를 데이터만으로 구분할 수 없어 재고·적재·운임·가용량 계산이 왜곡될 수 있고, 원 단위가 남지 않은 과거 값은 사후 표준화나 마이그레이션에서도 복구하기 어렵다.
  - action: 먼저 수량과 측정값의 공통 모델을 도입해 value, unit, dimension 또는 measurement_kind를 필수화하고 치수 축을 length·width·height로 분리해야 한다. 이어 표준 단위, 명시적 환산·반올림 규칙, 원본 값·원본 단위 보존 방식을 정한 뒤 Shipment.total_weight의 계산 단위·원천·시점 또는 구성 측정값 참조를 정의해야 한다. 이 기반을 먼저 확정해야 기존 데이터 변환과 신규 소스 연결을 손실 없이 검증할 수 있다.
  - unresolved disagreement: axiology 렌즈는 직접 가치 근거가 중량·치수와 파생 총중량에 한정된다고 보아 medium 범위로 좁혔다. 다른 네 렌즈는 수량까지 포함한 공통 원인과 high 결론을 수용했지만, 수량의 개수·포장 단위 차이가 high 수준의 가치 손상을 일으키는 직접 사례는 후속 근거로 남아 있다.
- issue-004 (high): 주문·화물·추적 이벤트 상태를 연결하는 중앙 계약이 없어 동일 사건이 연동별로 다르게 해석되고 예외 상태가 일관되게 반영되지 않는 high 문제다.
  - root cause: 공통 상태 계약을 독립 시스템의 정상경로 enum과 연동별 해석으로 축약해 canonical 의미·권위·전이 및 예외 생명주기가 모델 밖에 남았다.
  - materiality: 이 온톨로지는 OMS·TMS·캐리어 상태를 WMS·TMS·ERP 전반에서 일관되게 판정할 공통 기준이어야 한다. 그러나 상태 의미와 권위가 시스템별로 분리되고 매핑이 연동별 구현에 맡겨져 동일 주문·화물에 상이한 상태가 적용될 수 있다. 특히 단일 배송 이벤트나 부분 배송이 주문 전체 완료로 잘못 승격되면 자동화, 고객 통지, 정산과 예외 대응이 서로 어긋나므로 선언된 통합 목적을 직접 훼손한다.
  - action: 원천 상태와 코드는 보존하되 중앙 상태 계약을 먼저 정의해야 한다. 계약에는 각 상태의 주체와 권위 소스, canonical 의미, 유효시점, 매핑 버전, 전이와 파생 규칙, 충돌 우선순위 및 역행 처리와 함께 취소·부분충족·예외·실패·반품·종결 후 정정을 포함해야 한다. 이어 원시 캐리어 코드에서 canonical TrackingEvent, Shipment 상태, Order 상태로 이어지는 명시적이고 검증 가능한 매핑을 연결하고, 단일 화물의 delivered가 주문 전체 완료로 승격되는 조건을 별도로 규정해야 한다. 이 순서가 필요한 이유는 생명주기와 완료 조건을 먼저 확정하지 않으면 매핑 규칙이 다시 연동별 의미를 내포하게 되기 때문이다.
- issue-005 (high): 주문선과 재고 사이의 할당·예약 결과, 상태, 해제 이력이 없어 경합 시 중복 할당과 과판매를 막을 공통 기준이 결여된 high 문제이며 즉시 보완해야 한다.
  - root cause: 할당 행위를 지속되는 연결 개체와 생명주기로 모델링하지 않고 가용재고 조회 규칙으로만 서술했다.
  - materiality: 여러 주문이 같은 재고를 경합하거나 부분 승인·해제·재할당될 때 OMS, WMS, ERP가 무엇이 예약되었고 언제 가용재고에서 차감되는지 동일하게 판단할 수 없다. 이는 주문→재고 할당→출하 흐름의 통합 기준이라는 목적을 직접 약화시키고 운영 안전성과 감사 가능성을 훼손한다.
  - action: 먼저 OrderLine과 Warehouse 또는 InventoryRecord, Sku 및 수량을 연결하는 권위 있는 할당 개념을 정의하고 requested, allocated, released 수량과 단위, 상태, created_at, released_at을 보존해야 한다. 그다음 OMS·WMS·ERP의 예약 생성, 부분 할당, 해제, 재할당 및 가용재고 차감 규칙이 이 개체의 상태 전이를 소비하도록 연결해 동일한 결과와 생명주기를 공유하게 해야 한다.
- issue-006 (high): 부분·분할·합배송에서 현재 모델은 실제로 출하된 주문선별 수량을 추적하지 못하고, 일부 출하도 주문 전체 충족으로 과대 표현하는 high 문제다.
  - root cause: 주문선·수량 수준의 중간 충족 개념을 생략하고 Shipment와 Order 사이의 단일 완결 관계로 축약했다.
  - materiality: 주문 잔량과 실제 발송 내역을 OMS·WMS·TMS 사이에서 일치시킬 수 없으므로 주문 완료 상태, 고객 통지와 미출고 판단이 잘못될 수 있으며, 오배송·중복배송 위험도 생긴다. 따라서 주문부터 출하·배송까지 물리적 충족을 공통 의미로 추적하려는 목적을 직접 훼손한다.
  - action: 먼저 Shipment와 OrderLine 사이에 fulfilled_qty, 단위, 출발·도착 참조와 취소·정정 상태를 갖는 충족 연결 개념을 추가해야 한다. 그다음 취소·정정을 반영한 주문선별 순충족 수량이 모든 요구 수량을 충족할 때만 Order 수준 fulfills가 파생되도록 정의해야 한다. 이 순서가 부분 충족 기록을 원천 사실로 만들고 주문 전체 충족의 과대 표현을 막는다.
- issue-007 (high): 현재 재고와 야간 스냅샷에 기준시각·유효기간·변경 이력이 없어, 오래된 가용량을 현재 재고로 오인할 수 있는 high 문제이며 목표 범위에서 즉시 수정해야 한다.
  - root cause: 재고를 시점이 있는 관측·원장 값이 아니라 무시간성 현재 스칼라로 모델링했다.
  - materiality: 야간 스냅샷 이후 입고·출고·조정이 발생해도 일중 주문 할당이 기존 available_qty를 사용하므로, 값의 신선도를 판정하거나 주문 접수·할당 시점의 실제 재고를 재현할 수 없다. 따라서 WMS/ERP 재고를 주문 할당에 사용할 일관된 통합 기준으로 제공한다는 목적의 정확성과 운영 신뢰가 훼손된다.
  - action: 모든 재고 잔액에 as_of와 source를 추가하고, InventoryMovement 또는 버전 이력으로 증감 원인과 유효기간을 기록해야 한다. 먼저 이 시점·출처·이력 모델을 재고의 권위 있는 기준으로 확립한 뒤 일중 주문 할당이 해당 기준을 소비하도록 연결하고, 공유 원인 후보인 dep-001/rel-001과 조정해 동일한 무시간성 입력을 소비자별로 중복 보정하지 않도록 해야 한다.
- issue-008 (high): 실물 재고와 회계 재고를 단일 quantity_on_hand로 표현하고 관점별 권위와 조정 사건을 남기지 않는 현재 모델은 WMS·ERP 재고 대사와 감사에 중대한 결함이 있으므로 즉시 수정해야 한다.
  - root cause: 서로 다른 의미와 권위를 가진 실물 재고와 회계 재고를 하나의 수량 개념으로 축약했다.
  - materiality: WMS 실물 수량과 ERP 회계 수량이 다르거나 야간 조정이 실행될 때, 통합 소비자는 차이가 정상적인 관점 차이인지 오류인지 판정하거나 어느 값을 신뢰해야 하는지 결정할 수 없다. 이로 인해 재고가 잘못 덮어써질 수 있고 변경 근거도 추적할 수 없어, WMS와 ERP 사이의 공통 재고 권위 및 불일치 처리 기준이라는 목적이 약화된다.
  - action: 먼저 실물 재고 잔액과 회계 재고 잔액을 별도 개념으로 구분하거나 balance_type과 source_system으로 명시하고, 각 잔액에 기준시각과 권위 규칙을 정의해야 한다. 그다음 ReconciliationAdjustment를 모델링하여 조정 전후 값, 행위자, 발생 시각과 사유를 기록하고 해당 잔액에 연결해야 한다. 이 순서로 의미와 권위를 먼저 확정해야 조정 사건이 어떤 기준 간 차이를 해소했는지 일관되게 해석하고 감사할 수 있다.
- issue-014 (high): quantity_on_hand가 WMS 실물 수량과 ERP 회계 수량을 동시에 나타내므로, 재고 조회·대사·할당에서 일관된 의미와 권위를 제공하지 못하는 high 문제다.
  - root cause: 물리 재고와 회계 재고를 하나의 quantity_on_hand에 합치고 관점·권위·유효시점을 모델링하지 않았다.
  - materiality: 두 수량이 다르거나 야간 조정 전후 값을 판단할 때 동일 필드의 의미가 시스템마다 달라진다. 그 결과 불일치가 오류인지 정상적인 관점 차이인지 판별할 수 없고, WMS/TMS/ERP 통합의 재고 기준으로 사용할 수 없다.
  - action: physical_on_hand와 accounting_on_hand를 별도 개념 또는 명시적인 관점별 측정값으로 먼저 분리해야 한다. 각 값에 source_system, as_of, reconciliation_status를 연결한 뒤 allocation에 사용할 권위 값을 명시하여 조회·대사·할당 소비자가 동일한 기준을 적용하도록 해야 한다.
- issue-015 (high): available_qty가 산식·예약 반영 의미·기준시각 없이 독립 스냅샷처럼 모델링되어 현재 가용재고로 오인될 수 있으며, 중복 할당과 과판매를 유발할 수 있는 high 문제다.
  - root cause: 시간·정책 의존 파생값인 available_qty를 원천·산식·차감 요소와 기준시각이 없는 독립 숫자로 모델링했다.
  - materiality: 야간 스냅샷 이후 예약·출고·조정이 발생해도 일중 할당이 기존 available_qty를 현재 값으로 해석할 수 있다. 시스템마다 가용성의 의미와 시점이 달라지므로 시스템 공통 가용재고 정의와 안전한 주문 할당이라는 목적이 약화된다.
  - action: 먼저 available_qty의 권위 있는 원천과 포함·제외 및 차감 항목, 계산 산식과 정책을 정의해야 한다. 이어 source_system, as_of 및 예약 반영 상태를 명시하고, 할당 시 허용되는 최신성 조건을 계약으로 강제해야 일중 주문이 오래된 야간 값을 현재 가용량으로 사용하지 않는다.
- issue-018 (high): OrderLine과 실제 충족 Shipment 사이에 충족 수량을 담는 구조적 경로가 없어 부분출하를 주문선 단위로 추적할 수 있으며, 반드시 보완해야 하는 high 문제다.
  - root cause: 충족 관계를 Shipment와 Order 사이의 주문 단위 관계로만 모델링하고 주문 줄 연결을 제외했다.
  - materiality: 한 OrderLine이 여러 Shipment로 나뉘거나 Shipment가 주문선 수량 일부만 충족하면 WMS·TMS·ERP가 동일한 출하 내역을 식별할 공통 기준이 없다. 그 결과 출하 수량 대사, 부분출하 상태 산정, 미충족 수량 추적이 불가능해져 주문→출하 추적을 포함한 통합 개념 기준이라는 목적을 직접 약화한다.
  - action: OrderLine과 Shipment를 잇는 FulfillmentLine 같은 연결 엔티티를 추가하고 최소한 order_line_ref, shipment_ref, fulfilled_qty를 보유하게 해야 한다. 이 연결을 주문선별 실제 충족 기록의 공통 구조로 먼저 확립해야 출하 수량 대사, 부분출하 상태 및 미충족 수량을 일관되게 산정할 수 있다.
- issue-009 (medium): 캐리어 예측, 운영 보정, 고객 표시 ETA가 단일 필드에 덮어써져 원천·권위·시점·변경 계보와 표시값 선택 근거를 재구성할 수 없는 medium 문제이며, 다음 단계 전에 해소해야 한다.
  - root cause: 캐리어 예측값, 운영 보정값과 고객 표시값을 버전 있는 별도 의미로 모델링하지 않고 단일 eta 필드에 덮어썼다.
  - materiality: 캐리어 ETA와 수기 조정이 다르거나 여러 번 갱신되면 최종값의 출처와 신선도, 변경 책임을 확인할 수 없다. 이 때문에 TMS·캐리어·운영 화면이 신뢰 가능한 공통 ETA 의미를 제공하지 못하고, 지연 탐지와 고객 안내 및 사후 감사의 신뢰성이 약화된다.
  - action: 먼저 ETA를 버전 있는 관측·수정 개념으로 모델링해 source, predicted_at 또는 as_of, 유효기간, actor, reason, supersedes와 authority를 보존해야 한다. 이어 캐리어 예측과 운영 보정의 권위 우선순위를 명시하고 displayed_eta를 그 규칙에서 파생해야 한다. 이 이력·권위 모델과 선택 규칙은 신뢰 가능한 ETA 통합과 감사의 전제이므로 다음 단계 전에 함께 확정해야 한다.
- issue-010 (medium): 운송사·OMS·TMS의 원본 상태 코드와 canonical 상태 간 매핑에 버전, 유효기간, 원본 보존 계약이 없어 코드 체계가 변할 때 매핑 드리프트와 과거 상태 해석 손실이 발생하는 medium 진화성 문제다.
  - root cause: 외부 상태 코드 체계를 버전 있는 매핑 자산으로 모델링하지 않고 닫힌 enum과 연동별 구현에 분산했다.
  - materiality: 이 문제는 OMS/TMS/캐리어 상태를 장기적으로 통합하는 기준을 약화한다. 외부 코드가 추가·폐기·재정의되면 연동마다 해석이 달라지고, 전환 전후의 동일 이벤트를 일관되게 재현할 수 없어 상태 기반 운영과 이력 조회의 신뢰가 낮아진다.
  - action: 먼저 각 이벤트에 원본 시스템·원본 코드·발생시각을 보존한 뒤, 원본 코드에서 canonical 상태로의 매핑을 버전과 유효기간을 갖는 독립된 권위 자산으로 관리해야 한다. 이어 코드 폐기와 alias 규칙, canonical enum 확장에 대한 호환 정책을 같은 계약에 포함해야 현재 매핑 변경이 과거 이력의 해석을 덮어쓰지 않고 연동별 수정도 공통 기준으로 통제할 수 있다.
- issue-011 (medium): 다중 구간 운송의 계층·여정 결손과 분할·합배송의 충족 결손은 서로 구별되는 원인이지만, 복합 운송을 확장할 때 Shipment 구조와 충족 관계를 함께 재설계해야 하는 하나의 물질적 문제를 만든다.
  - root cause: 운송 전체와 구간을 구성 관계가 아닌 is_a로 합치고 분할·통합을 나타내는 중간 개념을 두지 않았다.
  - materiality: 현재 모델로는 여러 DeliveryLeg를 하나의 여정에 배열하거나 구간별 운송사를 나타내고, 주문선 수량이 여러 출하로 분할되거나 여러 주문이 한 출하로 합쳐지는 과정을 일관되게 식별할 수 없다. 따라서 이러한 시나리오를 도입하면 핵심 Shipment 의미와 관계를 비호환적으로 변경해야 하며, 기존 단일 구간 데이터와 새 복합 운송 데이터를 동일한 방식으로 질의하기 어려워져 확장 가능한 주문-화물-배송 통합이라는 목적이 약화된다.
  - action: Shipment와 DeliveryLeg를 전체-부분의 구성 관계로 분리하고, 명시적인 journey/route 또는 parent Shipment 참조로 구간의 소속과 순서를 정의해야 한다. 운송사와 상태는 구간 수준에도 배치할 수 있게 하고, 주문선 수량과 화물·출하 수량을 연결하는 fulfillment allocation 개념을 추가해야 한다. 구현 전에는 여정 구성 변경과 충족 할당 변경을 독립적으로 마이그레이션할 수 있는지 경계 증거를 확보해 변경 순서와 기존 데이터 호환 전략을 정해야 한다.
- issue-012 (medium): 문서 수준의 최상위 버전만으로는 개념·상태·관계·계산 규칙이 변경된 뒤 기존 레코드가 따랐던 의미 계약을 식별할 수 없다. 따라서 버전 전환 계약의 부재는 장기 운영을 위한 WMS/TMS/ERP 공통 개념 기준을 약화하는 medium 문제이며, 다음 단계에서 보완해야 한다.
  - root cause: 버전을 문서 식별자 수준으로만 두고 데이터 의미의 생명주기와 마이그레이션 권위로 연결하지 않았다.
  - materiality: 온톨로지 1.1 이상에서 상태, 관계, 계산 또는 외부 표준 매핑이 바뀌면 기존 데이터와 규칙의 당시 의미를 재현할 근거가 없다. 이 때문에 점진적 전환과 감사 가능한 호환성이 어려워지고, 일괄 재해석이나 비호환 재구축에 의존하게 되어 장기간 유지되는 공통 개념 기준이라는 목적이 약화된다.
  - action: 다음 단계에서 변경 가능한 개념·상태·관계·계산 규칙마다 stable identifier, 도입·폐기 버전, alias 및 호환 규칙을 정의하고, 의미가 온톨로지나 계산 정책에 의존하는 레코드에는 적용된 ontology 또는 policy version을 추적해야 한다. 이 생명주기 계약을 마이그레이션의 권위로 먼저 확립해야 이후 버전 변경을 점진적으로 적용하고 기존 의미를 감사 가능하게 재현할 수 있다.
- issue-013 (medium): DeliveryLeg의 유효 사례인 창고→허브 및 허브→고객 구간은 Shipment의 창고→고객 정의를 상속할 수 없으므로, 현재 `DeliveryLeg is_a Shipment` 모델은 양립 불가능한 타입 계약을 만든다.
  - root cause: 배송 경로의 부분 구간을 종단 간 Shipment의 구성요소가 아니라 하위 타입으로 모델링했다.
  - materiality: 동일한 DeliveryLeg 인스턴스가 상위 Shipment 정의를 위반하면 WMS/TMS/ERP마다 타입 판정, 상태 적용 범위, 관계 매핑이 달라질 수 있다. 이는 일관된 화물·배송 구간 타입 계약을 제공하려는 문서의 목적을 직접 약화한다.
  - action: 현재 차단 문제로서 대상 모델에서 `DeliveryLeg.is_a: Shipment`를 제거하고 Shipment와 DeliveryLeg 사이에 `has_leg` 또는 `part_of` 구성 관계를 도입해야 한다. 먼저 타입 계층과 관계를 바로잡은 뒤 각 시스템의 상태 및 관계 매핑을 그 계약에 맞춰 정렬해야 한다. Shipment를 모든 물리 이동으로 넓히는 대안을 택한다면, 기존 창고→고객 종단 간 의미를 별도 하위 타입으로 분리해 현재 의미를 보존해야 한다.
- issue-017 (medium): DeliveryLeg를 Shipment의 하위 유형으로 둔 현재 모델은 전체 화물 이동과 그 경로의 일부를 동일 종류로 취급하는 part-of/is-a 유형 오류이며, medium 수준의 현재 차단 문제로 수정해야 한다.
  - root cause: 배송 경로의 부분-전체 관계를 하위유형 관계로 모델링했다.
  - materiality: Shipment의 식별자, 전체 중량, 상태, ETA 및 fulfills 관계가 DeliveryLeg에 상속되면 구간과 전체 운송의 책임 범위가 혼동된다. 이는 화물과 운송 구간의 공통 개념 분류를 약화시키고 WMS/TMS 데이터 매핑을 부정확하게 만든다.
  - action: DeliveryLeg의 Shipment 상속을 제거하고 Shipment와 DeliveryLeg를 part_of/has_leg 구성 관계로 연결해야 한다. 먼저 Shipment가 화물 자체인지 전체 운송 이동인지 정체성을 명확히 한 뒤, 구간별 상태·운송사·ETA는 DeliveryLeg 고유 속성으로 분리하고 shipment_no, 전체 total_weight 및 fulfills 같은 전체 수준 의미가 구간에 전파되지 않도록 WMS/TMS 매핑을 갱신해야 한다.
- issue-020 (medium): DeliveryLeg에 부모 Shipment 귀속 관계가 없어 다구간 배송의 소속, 순서, 연속성을 특정 화물 경로 기준으로 재구성할 수 없는 medium 문제이며, 목표 산출물에서 즉시 수정해야 한다.
  - root cause: DeliveryLeg를 Shipment의 하위 유형으로만 모델링하고 구간을 특정 화물 경로에 귀속시키는 구성 관계를 두지 않았다.
  - materiality: 한 Shipment가 여러 창고·허브·고객 구간을 거칠 때 구간을 화물별로 묶거나 올바른 순서로 복원할 수 없다. 그 결과 TMS의 구간 경로와 OMS/WMS의 출하를 동일 Shipment 기준으로 연결하지 못해, Shipment와 배송 구간을 통합 시스템의 공통 물류 경로로 표현하려는 목적이 약화된다.
  - action: `DeliveryLeg.shipment_ref -> Shipment` 또는 `Shipment.legs -> DeliveryLeg[]`와 같은 명시적 구성 관계를 추가해야 한다. 먼저 각 구간을 부모 Shipment에 귀속시킨 뒤, `leg_seq`의 유일성과 순서 및 인접 구간의 연속성 규칙을 해당 부모 Shipment 범위 안에서 정의해야 TMS 경로와 OMS/WMS 출하를 같은 화물 기준으로 연결할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-003: axiology 렌즈는 직접 가치 근거가 중량·치수와 파생 총중량에 한정된다고 보아 medium 범위로 좁혔다. 다른 네 렌즈는 수량까지 포함한 공통 원인과 high 결론을 수용했지만, 수량의 개수·포장 단위 차이가 high 수준의 가치 손상을 일으키는 직접 사례는 후속 근거로 남아 있다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: resolved
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: narrowed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-020: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: WMS/TMS/ERP 통합에서 재고 권위·시간성을 일관되게 해석하고 현재와 향후의 안전한 할당을 지원하는 개념 기준. Source finding context: WMS/TMS/ERP 통합에서 재고 권위·시간성을 일관되게 해석하고 안전한 할당 판단을 지원하는 개념 기준. Source finding context: WMS/TMS/ERP 통합의 재고 개념 기준과 안전한 주문 할당
- issue-002: 주문에서 출하·배송까지의 충족 관계를 WMS/TMS/ERP가 공통으로 해석하는 개념 기준.
- issue-003: WMS/TMS/ERP 사이에서 수량과 물리 측정값 및 파생값을 손실 없이 일관되게 공유하는 개념 기준. Source finding context: WMS/TMS/ERP 사이에서 중량과 치수의 단위 의미 및 파생값을 일관되게 공유하는 개념 기준. Source finding context: WMS/TMS/ERP 간 수량과 물리 제원을 손실 없이 교환하는 통합 기준 제공 Source finding context: WMS/TMS/ERP 간 상품·화물 측정값의 공통 개념 기준
- issue-004: OMS/TMS/캐리어 상태를 WMS/TMS/ERP 통합에서 일관되게 해석하고 운영할 공통 상태 모델. Source finding context: OMS/TMS/캐리어 상태를 WMS/TMS/ERP 통합에서 일관되게 해석할 공통 권위·상태 모델. Source finding context: 주문·화물·배송 상태를 시스템 간 공통 운영 기준으로 제공하는 목적 Source finding context: OMS/TMS/캐리어 상태를 정합하게 연결하는 통합 개념 기준 제공 Source finding context: OMS/TMS/캐리어 상태 통합의 의미 기준
- issue-005: 주문→재고 할당→출하 흐름을 WMS/OMS/ERP 통합의 개념 기준으로 제공하는 목적.
- issue-006: 주문에서 출하·배송까지의 물리적 충족 범위와 의미를 시스템 간 공통으로 추적하는 목적. Source finding context: 주문에서 출하·배송까지의 물리적 충족을 시스템 간 공통 개념으로 추적하는 목적 Source finding context: 주문·출하 간 충족 의미의 통합 기준
- issue-007: WMS/ERP 재고를 주문 할당에 사용할 수 있는 일관된 통합 기준으로 제공하는 목적.
- issue-008: WMS와 ERP 사이 재고 권위 및 불일치 처리의 공통 기준 제공.
- issue-014: WMS/TMS/ERP 통합의 재고 개념 및 권위 기준.
- issue-015: 시스템 공통 가용재고 정의와 안전한 주문 할당.
- issue-018: 주문→출하 추적을 포함한 WMS/TMS/ERP 통합 개념 기준 제공.
- issue-009: TMS·캐리어·운영 화면에서 배송 예상 시각을 신뢰 가능한 공통 값과 의미로 제공하는 목적. Source finding context: 배송 예상 시각을 운영과 시스템 통합에서 신뢰 가능한 공통 값으로 제공하는 목적 Source finding context: TMS·캐리어·운영 화면 간 ETA의 공통 의미와 권위
- issue-010: OMS/TMS/캐리어 상태를 연결하는 장기적 통합 기준.
- issue-011: 확장 가능한 주문-화물-배송 통합 개념 기준.
- issue-012: 장기간 유지되는 WMS/TMS/ERP 공통 개념 기준.
- issue-013: WMS/TMS/ERP 통합을 위한 일관된 화물 및 배송 구간 타입 계약. Source finding context: WMS/TMS/ERP 통합을 위한 물류·주문충족 개념 기준 문서로서 일관된 화물 및 배송 구간 타입 계약을 제공하는 목적
- issue-017: 화물과 운송 구간의 공통 개념 분류.
- issue-020: Shipment와 배송 구간을 통합 시스템의 공통 물류 경로로 표현하는 목적.

## Final Review Result
18 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 출처·권위·유효시점이 없는 야간 스냅샷형 재고 모델은 일중 할당의 근거를 일관되게 해석하거나 재현할 수 없게 하며, 실시간·다중 원장 전환까지 불안정하게 만드는 high 수준의 현재 차단 문제다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 예약 차감 방식과 스냅샷 갱신 실패 처리의 실제 구현은 현재 증거 경계에서 확인되지 않았다.
- 기존 스냅샷에서 누락된 출처와 유효시점은 사후에 확정적으로 복원할 수 없으므로 전환 시 해당 불확실성을 보존해야 한다.
- 실제 연동 계층에서 별도 단위 변환을 수행하는지는 현재 경계에서 확인되지 않았으나, 온톨로지 자체에는 그 변환 계약이 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-008 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_now
- issue-018 (high): fix_now
- issue-009 (medium): fix_before_release, follow_up
- issue-010 (medium): follow_up
- issue-011 (medium): follow_up
- issue-012 (medium): follow_up
- issue-013 (medium): fix_now
- issue-017 (medium): fix_now
- issue-020 (medium): fix_before_release, fix_now

## Recommendations
- issue-016 (high): 단위 없는 SKU 중량·치수를 합산해 Shipment.total_weight를 만들 수 있다. Source finding context: Sku.weight, Sku.dims, Shipment.total_weight Source finding context: materialized-input.md > Sku attributes 및 Shipment.total_weight Source finding context: 측정 단위가 속성 의미에 포함되지 않아 서로 다른 단위의 값을 동일한 weight·dims로 취급하고 total_weight로 합산할 수 있다. Source finding context: 숫자 중량은 단위와 함께 있어야 동일한 물리량을 뜻한다. 단위 없는 값들을 합하면 total_weight라는 이름이 실제 총중량을 보장하지 못하며 운송사 요율, 적재 한도, 라우팅 판단에 잘못 사용될 수 있다. Source finding context: 중량과 치수를 value+unit 구조로 모델링하고 canonical unit 및 변환 규칙을 정한다. dimensions는 length/width/height 각각의 값과 단위를 둔다. total_weight는 단위 정규화된 원천에서 계산되도록 정의한다. Source finding context: .onto/review/20260718-3c9b2434/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: WMS/TMS 간 상품 치수·중량 및 화물 총중량의 공통 의미 Source finding context: 서로 다른 계량 단위를 쓰는 창고나 소스의 SKU가 한 Shipment에 포함되거나 TMS로 전달될 때 Source finding context: 같은 숫자가 다른 물리량을 뜻하고 파생 총중량이 틀릴 수 있어 비용·용량·운송 운영 판단을 훼손한다. Source finding context: 물리량의 단위를 데이터 의미의 일부가 아닌 소스별 관례로 남겼다. Source finding context: Shipment.total_weight가 구성 품목 weight의 합으로 저장된다. Source finding context: 합산 원천인 Sku.weight가 kg와 lb를 구분하지 않는 number다. Source finding context: 측정값의 단위와 정규화 규칙이 온톨로지에 없다.
- issue-019 (medium): 선언된 주문→재고 할당 단계가 OrderLine과 재고 레코드 사이의 실행 가능한 구조로 닫히지 않는다. Source finding context: logistics-fulfillment-ontology.yaml — 주문·재고 할당 연결 구조 Source finding context: 문서 서두, entities.Order.fulfillment_status, entities.InventoryRecord, entities.InventoryAggregate, integrity_rules[0] Source finding context: 선언된 재고 할당 단계가 주문 줄 및 재고 레코드와 연결되지 않는다. Source finding context: 구조상 주문과 재고는 공통 Sku를 통해서만 간접 연결된다. 이 연결만으로는 특정 주문에 대한 예약·할당 내역을 식별할 수 없어, 선언된 주문→재고 할당→출하 흐름 중 할당 단계가 실행 가능한 개념 경로로 닫히지 않는다. Source finding context: `InventoryAllocation` 연결 엔티티를 추가하여 `order_line_ref`, `inventory_record_ref` 또는 `warehouse_ref`/`sku_ref`, `allocated_qty`를 연결하고, 필요하면 해당 할당과 출하 충족 연결도 연계한다. Source finding context: .onto/review/20260718-3c9b2434/round1/structure.findings.yaml#structure-candidate-002 Source finding context: 주문→재고 할당→출하 흐름을 WMS/ERP 간 공통 개념으로 제공 Source finding context: 주문에 재고를 할당하거나 할당 내역을 취소·대사·출하 전환해야 하는 경우 Source finding context: `allocated` 상태의 근거 레코드가 존재하지 않아 OMS 상태와 WMS/ERP 재고 변동을 구조적으로 대사할 수 없다. Source finding context: 할당을 독립된 연결 개념으로 모델링하지 않고 집계 재고 조회 규칙과 주문 상태만 배치했다. Source finding context: 특정 OrderLine에서 할당된 재고 및 수량으로 이어지는 관계가 없다. Source finding context: 할당은 InventoryAggregate 조회 규칙과 Order의 `allocated` 상태로만 표현된다.

## Unique Finding Tagging
- issue-016 (high): 단위 없는 SKU 중량·치수를 합산해 Shipment.total_weight를 만들 수 있다. Source finding context: Sku.weight, Sku.dims, Shipment.total_weight Source finding context: materialized-input.md > Sku attributes 및 Shipment.total_weight Source finding context: 측정 단위가 속성 의미에 포함되지 않아 서로 다른 단위의 값을 동일한 weight·dims로 취급하고 total_weight로 합산할 수 있다. Source finding context: 숫자 중량은 단위와 함께 있어야 동일한 물리량을 뜻한다. 단위 없는 값들을 합하면 total_weight라는 이름이 실제 총중량을 보장하지 못하며 운송사 요율, 적재 한도, 라우팅 판단에 잘못 사용될 수 있다. Source finding context: 중량과 치수를 value+unit 구조로 모델링하고 canonical unit 및 변환 규칙을 정한다. dimensions는 length/width/height 각각의 값과 단위를 둔다. total_weight는 단위 정규화된 원천에서 계산되도록 정의한다. Source finding context: .onto/review/20260718-3c9b2434/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: WMS/TMS 간 상품 치수·중량 및 화물 총중량의 공통 의미 Source finding context: 서로 다른 계량 단위를 쓰는 창고나 소스의 SKU가 한 Shipment에 포함되거나 TMS로 전달될 때 Source finding context: 같은 숫자가 다른 물리량을 뜻하고 파생 총중량이 틀릴 수 있어 비용·용량·운송 운영 판단을 훼손한다. Source finding context: 물리량의 단위를 데이터 의미의 일부가 아닌 소스별 관례로 남겼다. Source finding context: Shipment.total_weight가 구성 품목 weight의 합으로 저장된다. Source finding context: 합산 원천인 Sku.weight가 kg와 lb를 구분하지 않는 number다. Source finding context: 측정값의 단위와 정규화 규칙이 온톨로지에 없다.
- issue-019 (medium): 선언된 주문→재고 할당 단계가 OrderLine과 재고 레코드 사이의 실행 가능한 구조로 닫히지 않는다. Source finding context: logistics-fulfillment-ontology.yaml — 주문·재고 할당 연결 구조 Source finding context: 문서 서두, entities.Order.fulfillment_status, entities.InventoryRecord, entities.InventoryAggregate, integrity_rules[0] Source finding context: 선언된 재고 할당 단계가 주문 줄 및 재고 레코드와 연결되지 않는다. Source finding context: 구조상 주문과 재고는 공통 Sku를 통해서만 간접 연결된다. 이 연결만으로는 특정 주문에 대한 예약·할당 내역을 식별할 수 없어, 선언된 주문→재고 할당→출하 흐름 중 할당 단계가 실행 가능한 개념 경로로 닫히지 않는다. Source finding context: `InventoryAllocation` 연결 엔티티를 추가하여 `order_line_ref`, `inventory_record_ref` 또는 `warehouse_ref`/`sku_ref`, `allocated_qty`를 연결하고, 필요하면 해당 할당과 출하 충족 연결도 연계한다. Source finding context: .onto/review/20260718-3c9b2434/round1/structure.findings.yaml#structure-candidate-002 Source finding context: 주문→재고 할당→출하 흐름을 WMS/ERP 간 공통 개념으로 제공 Source finding context: 주문에 재고를 할당하거나 할당 내역을 취소·대사·출하 전환해야 하는 경우 Source finding context: `allocated` 상태의 근거 레코드가 존재하지 않아 OMS 상태와 WMS/ERP 재고 변동을 구조적으로 대사할 수 없다. Source finding context: 할당을 독립된 연결 개념으로 모델링하지 않고 집계 재고 조회 규칙과 주문 상태만 배치했다. Source finding context: 특정 OrderLine에서 할당된 재고 및 수량으로 이어지는 관계가 없다. Source finding context: 할당은 InventoryAggregate 조회 규칙과 Order의 `allocated` 상태로만 표현된다.

## Shared Phenomenon Summary
- none
