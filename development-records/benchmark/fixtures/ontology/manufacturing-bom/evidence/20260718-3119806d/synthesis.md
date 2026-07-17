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
- issue-002 (high): 제조 구성의 revision·effectivity·변경 대상·통제 사건이 하나의 변경관리 계약으로 닫히지 않아, 특정 시점의 유효한 Part·BOM·Routing을 유일하게 선택·재현하고 변경 이력을 추적할 수 없는 high 결함이다.
  - root cause: Part·BOM·Routing 제조 구성을 불변 revision·effectivity·change-subject 및 통제 사건을 가진 일급 개념으로 모델링하지 않고 현재 Part 상태와 축약된 ECO 연결에 의존한다.
  - materiality: PLM과 MES가 동일한 효력 시점에도 서로 다른 revision을 생산 기준으로 선택할 수 있으며, BOM·Routing 변경과 승인·적용·릴리스 근거도 복원할 수 없다. 이는 품목·BOM·라우팅 변경관리의 정합성, 안전한 생산 구성 결정, 제조 운영 통제라는 선언 목적을 직접 훼손하고 잘못된 사양 생산과 감사 실패 위험을 만든다.
  - action: 먼저 Part·BOM·Routing의 불변 구성 revision과 effective_from/effective_to를 정준화하고 BomLine과 Operation을 해당 버전에 종속시켜야 한다. 다음으로 ECO가 실제 변경 대상인 구성 revision, BomLine, Routing 및 필요 시 Operation을 명시적으로 가리키게 하고, 승인·적용·릴리스를 actor·occurred_at·rationale/evidence·source_system을 가진 통제 사건으로 기록해야 한다. 마지막으로 생산오더가 주문 시점에 승인·적용된 ECO와 effectivity를 만족하는 Part·BOM·Routing revision을 명시적으로 고정하도록 gate를 확장해야 한다. 이 순서가 필요한 이유는 생산오더 통제가 먼저 정립된 구성 및 변경 권위를 참조해야 하기 때문이다.
- issue-005 (high): 생산오더·작업 실행 실적·실제 자재 투입·완료품 단위/lot 계보가 누락되어, PLM의 계획 기준정보를 MES 실행 결과와 연결할 수 없는 high 결함이다.
  - root cause: 모델 범위를 제조 기준정보에 한정하여 실행 트랜잭션과 as-built 계보 하위 영역을 포함하지 않았다.
  - materiality: released Routing에 따른 생산 실행, 실제 구성 검증 또는 lot 추적이 필요한 현재 범위에서 기준정보와 실행 결과 사이의 핵심 경계가 끊어진다. 그 결과 MES가 온톨로지 밖에 별도 실행·계보 모델을 만들게 되어 변경 영향 추적, 불량 범위 판정, 계획 대비 실제 구성 검증을 일관되게 수행할 수 없으므로 PLM/MES 통합의 개념 기준이라는 선언 목적이 약화된다.
  - action: 현재 대상 범위에서 ProductionOrder, OperationExecution, MaterialConsumption, ProducedUnit/Lot을 최소 실행·계보 개념으로 추가해야 한다. 먼저 ProductionOrder를 released Routing revision 및 계획 BOM revision에 연결하고, 그 주문 아래 OperationExecution과 실제 MaterialConsumption 및 ProducedUnit/Lot을 연결해 계획 대비 실적과 as-built 계보가 같은 모델에서 추적되도록 해야 한다. 이 순서로 기준정보 참조를 먼저 확립해야 후속 실행·투입·산출 사실의 기준과 계보가 모호해지지 않는다.
- issue-006 (high): BOM 수량과 작업장 능력이 값·단위·차원·기준수량·환산 권위를 갖춘 공통 측정 계약 없이 표현되어, 현재의 자재 소요량·능력 계산과 향후 단위 확장을 일관되게 수행할 수 없는 high 결함이다.
  - root cause: 측정값을 값·단위·차원·기준수량·품목별 환산 권위가 결합된 확장 가능한 Quantity/UOM 개념으로 모델링하지 않았다.
  - materiality: qty_per의 물리적 의미와 기준수량이 고정되지 않고 capacity_per_shift가 처리량과 가용시간을 함께 나타내므로, PLM과 MES가 동일 숫자를 서로 다르게 해석할 수 있다. kg↔ea 같은 품목별 환산이나 개수형 처리량과 시간형 용량의 결합에서는 자재 부족·과다 투입, 생산실적 불일치, 작업장 과부하·가용능력 오판이 발생할 수 있어 BOM 전개와 능력계획의 정확성 및 교환 신뢰성을 직접 훼손한다.
  - action: 먼저 공통 Quantity/UOM과 차원 모델을 권위 있는 측정 기반으로 도입하고, 품목별 UomConversion에 변환 방향, 계수, 적용 조건, 유효기간 및 권위 원천을 명시해야 한다. 그다음 BomLine을 단위 포함 component_quantity와 parent_base_quantity로 표현하고, 작업장 능력은 available_time_per_shift와 조건·대상·UOM이 명시된 throughput_per_shift로 분리해야 한다. 기존 ea/kg/m은 정준 단위 식별자로 이행하고, 차원이 맞지 않거나 권위 있는 환산이 없는 조합은 거부해야 한다. 공통 측정·환산 계약을 먼저 확립해야 후속 필드 분리와 데이터 이행이 동일한 의미를 보존할 수 있다.
- issue-008 (high): 현재 모델은 Part의 현재 리비전과 최신 ECO만 보존하므로, 복수 리비전과 시점별 BOM·Routing의 연속성을 유지하거나 과거 생산 구성을 재현할 수 없는 high 결함이다.
  - root cause: 리비전과 효력을 독립된 불변 개념으로 모델링하지 않고 Part의 현재값과 최신 ECO 포인터로 축약했다.
  - materiality: 미래 효력 ECO, 동시 유효 리비전, 주간 배치 동기화 지연이 발생하면 PLM과 MES가 서로 다른 BOM·Routing 조합을 선택할 수 있다. 과거 생산 당시의 구성 근거도 복원할 수 없어, 품목·BOM·라우팅·변경관리를 시점별로 일관되게 해석하는 통합 기준의 신뢰성이 크게 약화된다.
  - action: 먼저 불변 PartRevision을 도입해 리비전별 정체성과 이력을 보존하고, BomLine과 Routing을 해당 리비전에 연결해야 한다. 다음으로 각 구조에 유효기간 또는 ECO 기반 효력 범위를 부여한 뒤, 생산오더가 기준 시점을 사용해 정확한 BOM·Routing 버전을 선택하도록 결정 규칙을 정의해야 한다. 이 순서가 필요한 이유는 선택 규칙이 참조할 안정적인 리비전과 효력 정보가 먼저 존재해야 하기 때문이다.
- issue-010 (high): AlternatePart가 필수 대칭성과 기본·허용값 one_way를 동시에 선언해 대체 허용 방향을 결정할 수 없는 high 결함이며, 대상 범위에서 즉시 수정해야 한다.
  - root cause: 대체 관계의 필수 대칭성 규칙과 one_way 방향성 속성이 서로 다른 관계 양상을 선언한다.
  - materiality: direction=one_way 인스턴스나 기본값이 적용되면 PLM과 MES가 역방향 대체 허용 여부를 서로 다르게 해석할 수 있다. 이는 대체품 관계의 단일 개념 기준을 제공하려는 목적을 훼손하고, 승인되지 않은 자재 대체와 생산 투입으로 이어질 수 있다.
  - action: 먼저 AlternatePart가 대칭적 상호대체를 뜻하는지 방향성 대체를 뜻하는지 계약을 확정해야 한다. 전자라면 direction을 제거하고 항상 역관계를 의무화하며, 후자라면 direction에 따른 조건부 규칙으로 바꾸어 bidirectional일 때만 역관계를 의무화해야 한다. 이후 one_way 기본값과 인스턴스가 선택한 계약을 일관되게 만족하는지 검증해야 한다.
- issue-011 (high): 제품구조 BomLine과 공정상 회수·재투입 흐름을 동일 개념으로 모델링해, 제품구조의 보편적 비순환 제약과 스크랩 재투입 자기참조를 동시에 일관되게 집행할 수 없다.
  - root cause: 비순환 예외를 식별하는 모델 속성 없이 자연어 자기참조 예외와 보편적 비순환 규칙을 함께 선언했다.
  - materiality: 이 모순은 PLM과 MES가 동일 BOM을 서로 다르게 유효성 판정하게 만들고, 전개·소요량 계산에서 무한 순환을 일으킬 수 있으므로 공통 BOM 무결성 기준 제공이라는 목적을 직접 훼손한다.
  - action: 먼저 회수·재투입 흐름을 제품구조 BOM에서 별도 개념과 그래프로 분리해야 한다. 그다음 제품구조 BOM에는 보편적 비순환 제약을 그대로 적용하고, 회수 흐름에는 해당 흐름에 맞는 별도 무결성 규칙을 정의해야 한다. 숙의에서 단순 예외 predicate 추가는 개념 혼합을 유지하므로 우선 조치에서 제외되었다.
- issue-013 (high): 스크랩 재투입을 자기참조 BomLine으로 표현한 현재 모델은 제품구조와 공정상 자재 흐름을 혼합해 BOM의 의미와 전개 종료성을 훼손하는 high 결함이며, 목표 범위에서 반드시 수정해야 한다.
  - root cause: 제품 구성 관계와 공정 중 자재 회수 흐름을 하나의 BomLine 개념으로 표현했다.
  - materiality: PLM/MES 통합에서 BOM은 일관된 제품구조와 자재소요의 기준이어야 한다. 그러나 스크랩 재투입 Assembly를 전개하거나 소요량·생산오더를 계산하면 자기참조로 인해 반복 전개 또는 과대 계산이 발생할 수 있어 통합 기준으로 신뢰할 수 없다.
  - action: 먼저 BOM에서 자기참조 재투입 관계를 제거해 비순환 제품구조를 복원해야 한다. 이어 회수·재투입을 Routing/Operation에 연결된 별도 material_flow 또는 recycle_input 관계로 분리하고 회수율과 투입 지점을 명시해야 제품구조 계산과 공정 흐름이 각각 독립적이고 일관되게 처리된다.
- issue-014 (high): 도면 revision, 품목의 유효 구성 revision, ECO 상태·효력이 혼합되어 특정 생산 시점에 MES가 따라야 할 기준 revision을 유일하게 결정할 수 없는 high 결함이다.
  - root cause: 도면 revision, 품목의 유효 구성 revision, ECO의 상태·효력 의미를 분리하지 않은 변경 모델을 사용한다.
  - materiality: ECO 효력일과 Part.rev의 주간 배치 갱신 시점이 어긋나거나 최신 ECO가 아직 생산 유효 상태가 아니면 PLM과 MES가 서로 다른 revision을 현재 기준으로 판단할 수 있다. 그 결과 구 도면·구 BOM 또는 잘못된 공정으로 생산할 수 있어, PLM 변경 정보를 MES 생산 기준으로 정확히 전달하려는 변경관리 계약을 직접 약화한다.
  - action: DrawingRevision과 ItemRevision 또는 ProductRevision을 먼저 분리하고, 각 ECO에 이전·신규 revision과 적용 대상 BOM·Routing을 명시적으로 연결해야 한다. 이어서 ECO 상태와 효력 조건으로 effective_change 또는 effective_revision을 결정하도록 생산 기준 선택 규칙을 정의하고, 효력 적용과 MES 동기화를 원자적으로 처리하거나 동기화 지연 상태를 명시해야 한다. 이 순서가 필요한 이유는 개념과 관계가 분리되어야 효력 규칙과 동기화 계약이 하나의 생산 기준을 안정적으로 산출할 수 있기 때문이다.
- issue-015 (high): 방향성 substitution과 대칭적 interchangeability가 하나의 AlternatePart 개념에 혼합되어, 소비자가 승인된 대체 방향을 일관되게 해석할 수 없는 high 결함이다.
  - root cause: 방향성 substitution과 대칭적 interchangeability를 하나의 AlternatePart 개념으로 합쳤다.
  - materiality: PLM의 대체 승인을 MES 자재 투입 판단에 일관되게 전달해야 하지만, one_way 관계가 대칭 관계로 해석될 수 있어 승인되지 않은 역대체가 발생한다. 이는 조립 적합성, 품질 및 추적성에 직접적인 제조 위험을 만든다.
  - action: 기준 모델에서 먼저 directed substitution을 from_part와 to_part가 명시된 관계로 분리하고, interchangeability는 별도의 대칭 관계로 정의해야 한다. 그다음 alternate_of 단축 표기가 동일한 방향과 승인 의미를 손실 없이 보존하도록 정렬해야 하며, 이 수정은 MES 소비 계약을 확정하기 전에 완료해야 한다.
- issue-003 (medium): 스크랩 재투입을 Assembly의 자기참조 BOM으로 표현한 것은 제품구조 BOM의 비순환 계약과 제조 계산 안정성을 훼손하는 medium 결함이며, 회수·재투입 흐름을 BOM에서 분리해 대상 범위에서 즉시 수정해야 한다.
  - root cause: 제품 구조와 재생 원료의 공정 흐름을 분리하지 않고 스크랩 재투입을 자기참조 BOM 관계로 표현했다.
  - materiality: PLM과 MES가 공유하는 BOM은 전개가 종료되고 소요량·원가 계산의 의미가 일관되어야 한다. 자기참조 예외는 이 전제를 깨뜨려 소비자마다 별도 예외 처리를 요구하고 계산 결과와 제조 계획의 신뢰를 약화하므로, 정합적인 공통 BOM 개념 기준이라는 목적을 실질적으로 훼손한다.
  - action: 먼저 스크랩 발생·회수·재투입을 Routing/Operation에 연결되는 별도 material-flow 또는 recycle-flow와 수율·투입 비율로 모델링해야 한다. 그다음 자기참조 BomLine 예외를 제거해 구조 BOM을 예외 없이 비순환으로 유지해야 한다. 이 순서로 개념을 분리해야 재투입 의미를 보존하면서 BOM 소비자의 종료성과 계산 일관성을 회복할 수 있다.
- issue-004 (medium): 확인된 제조 수량·능력·scrap·표준시간/원가 값에 정준 관리계약이 없어 PLM/MES의 값 선택·계산·추적이 비결정적이 되는 medium 결함이다. 다음 통합 단계 전에 닫아야 한다.
  - root cause: 운영 수치의 단위·권위·효력·파생·동기화 규칙을 공통 개념으로 모델링하지 않고 지역별 수기·복제 관행을 유지했다.
  - materiality: PLM과 MES가 공유값의 단위, 원본, 유효 시점, 변환·파생 규칙을 동일하게 판정할 수 없으므로 계획·실행·원가 결과가 달라지고 사후 추적도 어려워진다. 이는 두 시스템에 일관된 제조 수량·능력·원가 의미를 제공하려는 목적을 직접 약화한다.
  - action: 다음 통합 단계 전에 확인된 각 공유값에 UOM, 출처·권위, 유효기간, 동기화·대사 정책을 부여하고 품목별 UOM conversion master를 정준화해야 한다. Routing에서 계산되는 파생 표준원가는 단일 권위값으로 만들고, 수기 override가 필요하면 승인·효력·이력을 가진 별도 개념으로 모델링해야 한다. Quantity/UOM 및 공유값 대사 이슈와 shared-cause 관계를 유지해 계약을 정합적으로 설계하되 별도 이슈는 병합하지 않는다.
- issue-007 (medium): scrap_rate와 표준시간 기반 원가가 여러 시스템에 복제되어 있지만 단일 권위, 유효기간, 대사 이력이 없어 시스템별 계획·원가 결과와 감사 근거가 달라질 수 있는 중간 심각도의 결함이다.
  - root cause: 공유 운영값을 출처·유효기간·대사 사건을 가진 관리 개념이 아니라 단순 복제 숫자로 표현했다.
  - materiality: Excel, MES, 표준원가 시스템의 값이 불일치하면 소비자가 적용할 정본을 결정할 수 없고, 과거 시점의 계수와 시간도 재구성하기 어렵다. 이는 PLM/MES와 원가 시스템 사이의 기준값 정합성, 계산 재현성, 대사 결과의 감사 가능성을 의미 있게 약화하므로 실제 시스템 연계 전 반드시 해소해야 한다.
  - action: 다음 시스템 연계 단계 전에 각 공유 값에 authoritative source, effective_from/effective_to, captured_at을 지정해야 한다. 비교 대상, 차이, 조정 결정, 행위자와 시각은 ReconciliationRecord로 보존하고, 누적 std_time처럼 Routing revision에서 파생 가능한 값은 그 계산 결과로 단일화해 복제 권위를 제거해야 한다. 이 조치는 충돌 시 정본 선택과 과거 계산 재현·감사를 가능하게 한다.
- issue-009 (medium): Routing을 단일 ordered Operation 목록으로 고정한 현재 모델은 분기·병렬·대체·재작업 흐름을 핵심 구조 변경 없이 표현할 수 없는 중간 심각도의 확장성 결함이다.
  - root cause: 공정 토폴로지를 단계와 전이로 모델링하지 않고 Operation 참조의 선형 목록으로 축약했다.
  - materiality: 현재 순차 라우팅은 표현할 수 있지만 비선형 제조 흐름이 추가될 때마다 핵심 스키마와 소비자의 순서 해석을 바꿔야 한다. 따라서 PLM과 MES가 공유할 수 있는 확장 가능한 공정·라우팅 기준이라는 목적을 약화시키고 하위 호환성 위험을 만든다.
  - action: RoutingStep과 StepTransition을 도입해 공정 흐름을 그래프로 일반화하고, 전이에 순서·조건·대체·병렬·재작업 의미를 명시해야 한다. 먼저 단계·전이 계약을 정의한 뒤 기존 ordered_list 라우팅을 그래프의 단순 순차 경로로 손실 없이 매핑해야 기존 소비자의 의미를 보존하면서 확장할 수 있다.
- issue-016 (medium): scrap_rate가 공정 수율과 BOM 구성품의 추가 소요 계수를 하나의 복제값으로 혼합해, 소비 시스템마다 자재 소요량과 생산량을 다르게 계산할 수 있는 medium 결함이다.
  - root cause: 공정 수율과 BOM 구성품 스크랩 계수를 구분하지 않고 외부 계산값을 의미·산식·효력 규약 없이 복제했다.
  - materiality: 공정 수율과 구성품 스크랩 계수는 적용 대상·분모·산식이 다를 수 있다. 이를 구분하지 않으면 PLM, MES, 계획 시스템이 동일 값에 서로 다른 계산을 적용하거나 원천과 불일치한 복사값을 사용해 자재 부족·과잉 투입과 생산계획 불일치를 일으킬 수 있으므로, 일관된 자재소요 및 생산계획 계산이라는 목적을 약화한다.
  - action: 다음 단계에서 자재·생산 계산에 사용하기 전에 operation_yield와 component_scrap_factor를 분리하고, 각각의 값 범위·단위·분모·적용 산식·유효기간을 명시해야 한다. 복사 필드 대신 권위 원천을 참조하거나 원천 버전과 동기화 상태를 가진 명시적 스냅샷으로 모델링해 계산 의미와 값의 효력을 재현 가능하게 해야 한다.
- issue-017 (medium): InspectionPlan을 실제 라우팅 실행 단계인 Operation의 하위 유형으로 둔 현재 모델은 검사 명세와 검사 실행 단계의 정체성을 혼합하는 medium 결함이며, 다음 단계 전에 수정해야 한다.
  - root cause: 실행 단계와 그 실행을 규정하는 계획·명세 객체를 존재론적으로 구분하지 않았다.
  - materiality: 검사 계획은 여러 공정에서 재사용·개정될 수 있지만 실행 단계로 분류되면 work_center, std_time_min 같은 실행 속성과 Routing.operations 배치 가능성을 상속한다. 그 결과 명세 변경이 공정 단계 변경으로 오인되거나 계획 객체가 실행 라우팅에 직접 배치되어, 품질 검사 기준과 MES 실행 단계를 정확히 대응시키려는 목적과 실행 추적성이 약화된다.
  - action: 다음 단계 전에 Operation의 하위 유형으로 InspectionOperation을 두고, InspectionPlan 또는 InspectionSpecification은 독립된 명세 개념으로 분리해야 한다. 두 개념은 has_inspection_plan 같은 명시적 관계로 연결하고, 계획의 revision·효력·재사용 속성과 실행 단계의 순서·작업장·표준시간 속성을 각각의 소유 영역에 둬야 한다.
- issue-018 (medium): canonical 관계 그래프가 방향 메타데이터를 소유한 AlternatePart를 우회하므로, 엔티티 모델과 다른 대체 구조를 산출할 수 있는 material medium 결함이다.
  - root cause: 방향 메타데이터를 소유한 AlternatePart association entity를 canonical relation graph에 연결하지 않고 Part→Part 단축 관계만 선언했다.
  - materiality: PLM/MES 통합 소비자가 relations 그래프를 정준 탐색 경로로 사용해 대체 가능성을 도출하면 AlternatePart의 direction을 확인할 수 없다. 그 결과 온톨로지가 공유하는 탐색 가능한 구조와 엔티티 모델의 의미가 달라질 수 있어 개념 기준으로서의 일관성과 신뢰성이 약해진다.
  - action: 다음 통합 단계 전에 역할이 구분된 Part→AlternatePart와 AlternatePart→Part edge를 canonical 그래프에 선언해야 한다. 이후 직접 Part→Part alternate_of는 association과 direction에서 결정적으로 도출되는 문서화된 단축 표기로만 유지해야 한다. 이 순서를 지켜야 정준 탐색 경로가 먼저 메타데이터의 권위 있는 구조를 보존하고, 단축 표현이 별도의 상충하는 대체 구조가 되지 않는다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-002: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: resolved
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: narrowed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-002: PLM/MES 통합에서 품목·BOM·라우팅 변경관리의 정합성, 시점별 구성 선택 및 제조 운영 통제 Source finding context: PLM/MES 통합에서 변경관리 정합성과 안전한 생산 구성 결정 Source finding context: PLM/MES 통합의 품목·BOM·라우팅 개념 기준과 ECO 시점 적용 Source finding context: 변경관리 정합성과 제조 운영 통제 Source finding context: Provide a coherent conceptual reference for item, BOM, routing, and change-management integration.
- issue-005: PLM/MES 통합의 개념 기준 문서
- issue-006: PLM/MES 간 BOM 소요량과 제조 능력의 일관되고 확장 가능한 계산·교환 Source finding context: BOM 수량 및 제조 운영 능력의 일관된 PLM/MES 해석 Source finding context: PLM/MES 통합에서 품목 수량, BOM 소요량 및 작업장 능력의 지속 가능한 공통 해석 Source finding context: 라우팅 표준시간과 작업장 용량을 결합한 MES 능력계획 기준 Source finding context: PLM BOM 수량을 MES 자재 불출·투입 수량으로 손실 없이 전달하는 계약
- issue-008: 품목·BOM·라우팅·변경관리의 일관된 시점별 PLM/MES 해석 Source finding context: PLM/MES 통합의 개념 기준으로서 품목·BOM·라우팅·변경관리의 일관된 시점별 해석
- issue-010: PLM/MES 통합에서 대체품 관계의 단일 개념 기준 제공 Source finding context: PLM/MES 통합에서 대체품 관계의 단일 개념 기준을 제공하는 목적
- issue-011: PLM/MES가 공통으로 집행할 수 있는 BOM 무결성 기준 제공
- issue-013: PLM/MES 통합에서 BOM을 일관된 제품구조 및 자재소요 기준으로 사용하는 목적
- issue-014: PLM 변경 정보를 MES 생산 기준으로 정확히 전달하는 변경관리 계약
- issue-015: PLM의 대체 승인 의미를 MES 자재 투입 판단에 일관되게 전달하는 계약
- issue-003: PLM/MES가 공유할 수 있는 정합적인 BOM 개념 기준
- issue-004: PLM/MES 간 일관된 제조 수량·능력·원가 의미 제공
- issue-007: PLM/MES 및 원가 시스템 사이의 기준값 정합성
- issue-009: PLM/MES가 공유할 수 있는 확장 가능한 공정·라우팅 개념 기준
- issue-016: BOM과 공정 데이터를 이용한 일관된 자재소요 및 생산계획 계산
- issue-017: 품질 검사 기준과 MES 라우팅 실행 단계를 정확히 대응시키는 개념 계약
- issue-018: 온톨로지를 PLM/MES 통합의 탐색 가능한 개념 기준으로 사용하는 목적 Source finding context: Use the ontology as the conceptual reference for PLM/MES integration.

## Final Review Result
16 material issue(s) require attention. Highest-priority issue: issue-002 (high) — 제조 구성의 revision·effectivity·변경 대상·통제 사건이 하나의 변경관리 계약으로 닫히지 않아, 특정 시점의 유효한 Part·BOM·Routing을 유일하게 선택·재현하고 변경 이력을 추적할 수 없는 high 결함이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 외부 PLM 식별자가 이 온톨로지 밖에서 더 세밀한 BOM·Routing 변경 연결을 제공하는지는 경계 내 증거로 확인되지 않았다.
- 실제 운영에서 도면 revision과 품목 revision이 항상 동일하게 유지되는지는 경계 내 증거로 확인되지 않지만, 문서에 명시된 주간 배치 지연은 효력 시점 불일치를 확정한다.
- 모든 운영 수치와 지역별 수기·복제 관행에 같은 결함이 반복된다는 직접 증거는 없어 결론을 확인된 공유 운영값으로 한정한다.

## Immediate Actions Required
- issue-002 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now
- issue-010 (high): fix_now
- issue-011 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): follow_up
- issue-016 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, follow_up
- issue-018 (medium): fix_before_release, follow_up

## Recommendations
- issue-001 (medium): 가치 정렬 검토에 필요한 정준 권위 체인이 비어 있어 axiology 판단의 권위와 감사 가능성이 제한된다. Source finding context: .onto/review/20260718-3119806d/execution-preparation/context-candidate-assembly.yaml Source finding context: context-candidate-assembly.yaml:1-4 has system_purpose_refs: [], role_definition_refs: [], and execution_rule_refs: []; review-value-alignment-criteria.yaml:5-20 binds only criterion user-request-intent. Axiology role §Authoritative alignment input states that ranks 1-3 must always be bound and missing authority requires an insufficient-evidence finding. value_type=boundary; alignment_direction=indeterminate. Source finding context: 정준 가치 권위 체인이 바인딩되지 않아 목적 정렬 판단의 권위가 불완전하다. Source finding context: Axiology는 개인적 가치 판단이 아니라 정준 권위 체인에 근거해야 한다. 현재 자료로는 사용자가 명시한 PLM/MES 통합 목적에 대한 제한적 평가는 가능하지만, onto 제품 원칙과의 정렬 여부는 판정할 수 없어 렌즈 결과의 신뢰 범위가 축소된다. Source finding context: 실행 준비 단계에서 필수 순위 1-3 authority 문서의 경로, 안정 anchor, 직접 인용문을 materialized context에 바인딩하고 읽기 실패 시 dispatch를 제한하거나 해당 판단을 명시적으로 indeterminate로 유지한다. Source finding context: .onto/review/20260718-3119806d/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: 정준 권위에 근거한 가치·목적 정렬 검토 Source finding context: core lexicon과 제품·검토 원칙에 기대는 정렬 판단을 수행할 때 Source finding context: 검토자의 개인 해석과 정준 제품 가치 사이를 구분할 수 없어 axiology 판정의 감사 가능성과 신뢰가 약화된다. Source finding context: 실행 준비가 axiology 필수 authority source set을 materialized context에 바인딩하지 않았다. Source finding context: 가치 정렬 기준에는 사용자 요청 목적 하나만 존재한다. Source finding context: 필수 시스템 목적·역할·실행 규칙 참조 목록이 비어 있다.
- issue-012 (medium): ECO 발효 후 신규 revision 의무와 주간 Part.rev 동기화 사이의 시간적 충돌을 현재 모델만으로 해소할 수 없다. Source finding context: manufacturing-bom-ontology.yaml — Part.rev 및 integrity_rules[2] Source finding context: materialized-input.md:20-21,69-75,93-96 Source finding context: Insufficient evidence: ECO 발효 후 신규 rev 의무와 주간 Part.rev 동기화 사이의 시간적 충돌을 현재 모델만으로 해소할 수 없다. Source finding context: 발효 시점과 다음 배치 사이에는 생산 의무상 신규 rev와 저장된 Part.rev가 다를 수 있다. 다만 생산 오더가 Part.rev를 읽는지 외부 도면 관리대장을 직접 읽는지 선언되지 않아 직접적인 unsatisfiability는 경계 내에서 확정할 수 없다. Source finding context: 생산 오더가 참조하는 유효 리비전의 권위 원천과 시점 선택 규칙을 명시하고, effective_date 기준의 revision/effectivity 레코드를 모델링한다. Part.rev를 사용한다면 발효 전에 동기화를 완료하도록 전이 제약을 추가한다. Source finding context: .onto/review/20260718-3119806d/round1/logic.findings.yaml#logic-candidate-003 Source finding context: PLM 변경 효력과 MES 생산 리비전을 일관되게 연결하는 개념 기준 제공 Source finding context: ECO.effective_date가 지난 뒤 Part.rev 주간 동기화가 완료되기 전에 생산 오더가 생성되는 경우 Source finding context: 실제 소비 경로에 따라 구 리비전으로 생산될 가능성이 있어 변경관리 기준에 대한 신뢰가 약화된다. Source finding context: ECO 효력 시점과 Part.rev 갱신 시점 사이의 권위·선택 규칙이 선언되지 않았다. Source finding context: 발효 후 신규 rev 의무와 지연된 Part.rev 값이 시간 창에서 불일치할 수 있다. Source finding context: 생산 오더가 어느 리비전 원천을 읽는지 모델에 없다.

## Unique Finding Tagging
- issue-001 (medium): 가치 정렬 검토에 필요한 정준 권위 체인이 비어 있어 axiology 판단의 권위와 감사 가능성이 제한된다. Source finding context: .onto/review/20260718-3119806d/execution-preparation/context-candidate-assembly.yaml Source finding context: context-candidate-assembly.yaml:1-4 has system_purpose_refs: [], role_definition_refs: [], and execution_rule_refs: []; review-value-alignment-criteria.yaml:5-20 binds only criterion user-request-intent. Axiology role §Authoritative alignment input states that ranks 1-3 must always be bound and missing authority requires an insufficient-evidence finding. value_type=boundary; alignment_direction=indeterminate. Source finding context: 정준 가치 권위 체인이 바인딩되지 않아 목적 정렬 판단의 권위가 불완전하다. Source finding context: Axiology는 개인적 가치 판단이 아니라 정준 권위 체인에 근거해야 한다. 현재 자료로는 사용자가 명시한 PLM/MES 통합 목적에 대한 제한적 평가는 가능하지만, onto 제품 원칙과의 정렬 여부는 판정할 수 없어 렌즈 결과의 신뢰 범위가 축소된다. Source finding context: 실행 준비 단계에서 필수 순위 1-3 authority 문서의 경로, 안정 anchor, 직접 인용문을 materialized context에 바인딩하고 읽기 실패 시 dispatch를 제한하거나 해당 판단을 명시적으로 indeterminate로 유지한다. Source finding context: .onto/review/20260718-3119806d/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: 정준 권위에 근거한 가치·목적 정렬 검토 Source finding context: core lexicon과 제품·검토 원칙에 기대는 정렬 판단을 수행할 때 Source finding context: 검토자의 개인 해석과 정준 제품 가치 사이를 구분할 수 없어 axiology 판정의 감사 가능성과 신뢰가 약화된다. Source finding context: 실행 준비가 axiology 필수 authority source set을 materialized context에 바인딩하지 않았다. Source finding context: 가치 정렬 기준에는 사용자 요청 목적 하나만 존재한다. Source finding context: 필수 시스템 목적·역할·실행 규칙 참조 목록이 비어 있다.
- issue-012 (medium): ECO 발효 후 신규 revision 의무와 주간 Part.rev 동기화 사이의 시간적 충돌을 현재 모델만으로 해소할 수 없다. Source finding context: manufacturing-bom-ontology.yaml — Part.rev 및 integrity_rules[2] Source finding context: materialized-input.md:20-21,69-75,93-96 Source finding context: Insufficient evidence: ECO 발효 후 신규 rev 의무와 주간 Part.rev 동기화 사이의 시간적 충돌을 현재 모델만으로 해소할 수 없다. Source finding context: 발효 시점과 다음 배치 사이에는 생산 의무상 신규 rev와 저장된 Part.rev가 다를 수 있다. 다만 생산 오더가 Part.rev를 읽는지 외부 도면 관리대장을 직접 읽는지 선언되지 않아 직접적인 unsatisfiability는 경계 내에서 확정할 수 없다. Source finding context: 생산 오더가 참조하는 유효 리비전의 권위 원천과 시점 선택 규칙을 명시하고, effective_date 기준의 revision/effectivity 레코드를 모델링한다. Part.rev를 사용한다면 발효 전에 동기화를 완료하도록 전이 제약을 추가한다. Source finding context: .onto/review/20260718-3119806d/round1/logic.findings.yaml#logic-candidate-003 Source finding context: PLM 변경 효력과 MES 생산 리비전을 일관되게 연결하는 개념 기준 제공 Source finding context: ECO.effective_date가 지난 뒤 Part.rev 주간 동기화가 완료되기 전에 생산 오더가 생성되는 경우 Source finding context: 실제 소비 경로에 따라 구 리비전으로 생산될 가능성이 있어 변경관리 기준에 대한 신뢰가 약화된다. Source finding context: ECO 효력 시점과 Part.rev 갱신 시점 사이의 권위·선택 규칙이 선언되지 않았다. Source finding context: 발효 후 신규 rev 의무와 지연된 Part.rev 값이 시간 창에서 불일치할 수 있다. Source finding context: 생산 오더가 어느 리비전 원천을 읽는지 모델에 없다.

## Shared Phenomenon Summary
- none
