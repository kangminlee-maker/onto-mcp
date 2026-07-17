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
- issue-001 (high): ECO effective_date와 비동기 갱신되는 Part.rev가 변경 효력의 권위를 나누고 있어, 주간 동기화 전에는 생산에 적용할 revision을 유일하게 결정할 수 없는 high 결함이다.
  - root cause: 변경 효력의 권위가 effective-dated revision 객체가 아니라 비동기 갱신되는 Part.rev와 ECO에 분산되어 있어, 동기화 지연 구간에는 생산 적용 리비전이 단일하게 결정되지 않는다.
  - materiality: ECO 효력일이 지났지만 Part.rev가 아직 갱신되지 않은 기간에 생산 오더가 생성되면 PLM과 MES가 동일 생산분에 서로 다른 설계 revision을 적용할 수 있다. 이는 구형 설계 생산, 추적성 상실, 재작업 판단 오류를 초래할 수 있어 PLM/MES 통합 기준의 변경관리 정합성과 제조 운영 위험 통제 목적을 직접 약화한다.
  - action: 먼저 유효기간을 가진 PartRevision을 변경 효력의 단일 권위로 모델링하고 ECO와의 적용 관계, effective_date 기준 선택 우선순위, 중복·공백 시 실패 규칙을 정의해야 한다. 이어 생산 오더가 생성 시점에 결정된 PartRevision을 명시적으로 고정하도록 해야 한다. 이 순서로 구현해야 배치 동기화 상태와 무관하게 조회가 단일 결과를 반환하고 실행 이력도 보존된다.
  - unresolved disagreement: coverage 렌즈는 더 포괄적인 원인을 Part·BOM·Routing 전체의 시점별 형상 기준선 부재로 본다. 심각도와 현재 결함의 존재에는 이견이 없지만, 두 결함의 same-root 또는 상하위 관계를 확정할 근거는 남아 있지 않다.
- issue-002 (high): 제품 구성과 스크랩 회수·재투입을 같은 BomLine으로 표현한 개념 혼합은 비순환 BOM 계약과 자기참조 예외를 충돌시키는 high 결함이다. 재투입 흐름은 BOM에서 분리해야 한다.
  - root cause: 제품 구성 구조와 공정 회수·재투입 흐름을 BomLine 하나로 표현하여 비순환 BOM 규칙과 자기참조 예외가 충돌한다.
  - materiality: 이 모델을 PLM/MES의 공통 개념 기준으로 사용할 때 스크랩 재투입이 포함된 Assembly를 일반 BOM처럼 전개하거나 소요량·원가를 계산하면 무한 전개, 중복 수량 계산 또는 시스템별 예외 해석이 발생할 수 있다. 따라서 공유 기준에 필요한 계산의 예측 가능성과 운영 안전성이 훼손된다.
  - action: 먼저 BOM을 비순환 제품 구성 구조로 한정하고, 스크랩 발생·회수·재투입을 별도의 MaterialFlow 계열 관계로 분리해야 한다. 그다음 재투입률, 질량수지 및 종료 규칙을 해당 흐름에 배치하여 BOM 전개·소요량·원가 소비자가 예외 없이 구성 관계를 처리하고 공정 흐름 소비자가 별도 규칙을 적용하도록 해야 한다. 이 조치는 현재 차단 결함으로서 대상 범위에서 반드시 완료되어야 한다.
- issue-003 (high): 품목별 UOM 변환의 권위·유효성·실패 규칙이 통합 모델에 없어 BOM 수량의 공통 계산 의미를 보장할 수 없는 high 결함이며, 목표 범위에서 즉시 해소해야 한다.
  - root cause: 수량 단위와 품목별 변환 규칙을 권위 있는 통합 개념으로 두지 않아 BOM 수량 환산이 현장 판단에 의존한다.
  - materiality: BOM 단위와 실행·재고 단위가 다르거나 ea와 kg처럼 품목 물성에 따른 환산이 필요할 때, 시스템과 작업자가 서로 다른 결과를 산출할 수 있다. 이는 과소·과다 불출, 계획 오차, 재고 불일치를 유발하여 PLM/MES 간 수량 의미의 일관성과 제조 운영 위험 통제를 직접 약화한다.
  - action: 먼저 출처와 유효기간을 가진 품목별 기준 UOM 및 변환 규칙을 권위 있는 마스터로 정의하고, 그다음 BomLine 수량에 명시적 UOM을 연결해야 한다. 이후 변환 시점에 해당 규칙을 적용하고, 필요한 규칙이 없거나 단위 차원이 호환되지 않으면 생산 또는 인터페이스 처리를 실패시키는 검증 규칙을 두어 임의 환산을 차단해야 한다.
- issue-005 (high): BOM·라우팅의 revision·effectivity 형상 기준선 부재는 생산 시점의 유효 제조 구성을 선택하거나 과거 구성을 재구성할 수 없게 하는 high 결함이다.
  - root cause: 품목·BOM·라우팅을 현재값 중심으로 표현하고 제조 형상의 버전과 시간 효력을 독립 개념으로 모델링하지 않아 시점별 구성을 식별할 수 없다.
  - materiality: 동일 품목에 ECO 전후 구성이나 복수 라우팅 개정이 존재하거나 Part.rev 동기화가 지연되면, PLM 설계 형상과 MES 생산 형상을 공통 기준으로 연결할 수 없다. 그 결과 잘못된 부품이나 공정을 사용할 위험이 생겨 통합 기준 문서의 핵심 목적을 직접 약화한다.
  - action: 먼저 PartRevision 또는 ConfigurationBaseline을 제조 형상의 기준 개념으로 도입해야 한다. 이어 BomLine과 Routing 버전에 effective_from/effective_to 또는 적용 일련·로트 범위를 부여하고, ECO가 변경 전후 형상과 각 유효구간을 명시적으로 연결하도록 해야 한다. 그래야 생산 시점의 구성 선택과 과거 형상 재구성이 같은 기준선에서 가능해진다.
- issue-007 (high): 차원화된 Quantity·UnitOfMeasure와 품목별 변환 모델이 없어 PLM BOM 수량과 MES 투입량·작업장 능력을 공통 계산 의미로 연결할 수 있는 계약이 부재한 high 결함이며, 목표 범위에서 즉시 해소해야 한다.
  - root cause: 단위를 계산 대상 값의 속성이 아닌 제한된 품목 코드로만 표현하고 단위 차원과 변환 개념을 제외하여 BOM과 설비능력을 결정적으로 계산할 수 없다.
  - materiality: 상·하위 품목의 단위가 다르거나 작업장 능력이 개수·중량·시간 기준으로 혼재하면 필요 자재량과 작업장 부하를 결정적으로 산출하거나 검증할 수 없다. 그 결과 부족·과다 투입과 잘못된 생산 일정 위험이 발생하여 PLM BOM과 MES 계획·실적 간 수량 및 능력 의미 통합이라는 목적이 직접 약화된다.
  - action: Quantity와 UnitOfMeasure를 명시적으로 도입하고 qty_per 및 capacity에 측정 차원, 단위, 분모와 시간 기준을 연결해야 한다. 품목별 UomConversion에는 factor, from_uom, to_uom, 유효기간, 근거와 권위 시스템을 두어 변환을 결정적이고 검증 가능하게 만들어야 한다. issue-003과 공유하는 원인 후보가 있으므로 개별 계산 경로를 보완하기 전에 공통 단위 변환의 권위·유효성 계약을 먼저 확립하고, 그 계약을 BOM과 MES 능력 계산 양쪽에서 사용해야 한다.
- issue-011 (high): BOM과 라우팅에 불변 revision 및 유효구간이 없어 ECO 전후의 제조 형상을 별도 기준선으로 보존할 수 없는 high 결함이며, 변경 연속성 확보를 위해 즉시 수정해야 한다.
  - root cause: 현재 상태와 버전별 기준선을 구분하는 시간·개정 모델이 BOM과 라우팅에 없어 변경 전후 구성을 별개 식별자로 보존할 수 없다.
  - materiality: 동일 품목에 ECO가 순차 적용되거나 적용일 전후 생산 이력을 함께 유지할 때 생산 시점의 설계·BOM·라우팅 기준선을 재현할 수 없다. 이는 PLM/MES 통합의 핵심 목적인 변경 연속성을 약화시키고 변경 적용, 추적성 및 재작업 판단의 신뢰를 크게 떨어뜨린다.
  - action: 먼저 PartRevision, BomRevision, RoutingRevision을 명시적 기준선 개념으로 도입하고 각 버전에 불변 식별자, 상태, valid_from/valid_to 또는 동등한 effectivity 조건, 적용 ECO를 연결해야 한다. 그다음 생산오더가 가변적인 현재 Part가 아니라 확정된 BOM·라우팅 버전을 참조하도록 해야 생산 시점의 형상을 재현하고 변경 적용 및 추적성 판단을 안정화할 수 있다.
- issue-004 (medium): BomLine.scrap_rate를 의미·산식·권위·생명주기가 없는 복사 스칼라로 둔 설계는 PLM/MES의 소요량 계산과 변경 재현을 불확정하게 만드는 medium 결함이며, 다음 단계 전에 수정해야 한다.
  - root cause: scrap_rate를 정규 의미·산식·원천 권한·생명주기가 없는 BomLine 복사 스칼라로 모델링하여 변경 정합성과 계산 의미가 함께 불확정적이다.
  - materiality: 공정 불량률 변경, 공정별 수율 차이, 원본과 복사본의 불일치가 발생하거나 소비자가 값을 손실 비율과 수량 배수로 다르게 해석하면 동일 BOM에서도 필요 수량과 자재 투입량이 시스템별로 달라진다. 이는 BOM·라우팅 정합성과 일관된 소요량 해석이라는 통합 기준을 약화하고, 기준값과 계산 결과의 감사·재현을 어렵게 한다.
  - action: 다음 단계 전에 scrap/yield의 정규 의미, 값 범위·단위와 qty_per 계산식을 하나로 확정하고, 이를 해당 Operation 및 자재 투입 관계에 귀속시켜 Routing 또는 공정 리비전과 유효기간에 연결해야 한다. 권위 원본도 하나로 지정하고 다른 시스템에는 원천값이나 결정적으로 산출된 값만 전달해야 한다. 외부 계획 시스템이 원본이면 원본 식별자, 동기화 상태·갱신 규칙과 불일치 처리 정책을 함께 모델링해야 변경 정합성과 계산 재현성을 확보할 수 있다.
- issue-006 (medium): ECO가 정상 상태(open→approved→applied)만 표현하고 승인·적용 증거와 예외·정정 이력을 보존하지 않아, PLM/MES 간 설계변경의 책임성과 재현성을 약화하는 medium 결함이다.
  - root cause: ECO를 변경 통제 과정이 아니라 현재 상태를 가진 단순 지시 객체로 축약하여 예외 lifecycle과 승인·적용 증거를 표현하지 못한다.
  - materiality: ECO가 거절·취소·대체되거나 승인·적용 경위를 감사해야 할 때 현재 상태값만으로는 누가 언제 어떤 근거로 판단하고 적용했는지 입증할 수 없다. 따라서 통제된 변경 전달과 변경 이력 추적이라는 목적에 대한 신뢰가 실질적으로 약화된다.
  - action: 먼저 거절·취소·대체·정정·재발행을 포함한 ECO 상태 전이 전체와 허용 규칙을 정의해야 한다. 이어 ChangeEvent 또는 ApprovalDecision을 모델링해 각 전이의 actor, occurred_at, rationale/evidence_ref, from_status, to_status를 불변 이력으로 기록하고, 취소·대체·정정 관계를 ECO에 연결해야 한다. 현재 상태는 이 이력에서 일관되게 도출하거나 이력과의 정합성을 검증해야 감사와 조사에서 변경 경위를 재현할 수 있다.
- issue-008 (medium): 병행 관리되는 제조 기준값에 권위 원본, 복제 출처, 유효기간, 동기화 상태 및 대사 이력이 없어 계획·원가·실행에 사용할 값을 일관되게 선택하거나 재현할 수 없는 medium 결함이며, 다음 단계 전에 해소해야 한다.
  - root cause: 병행 관리되는 제조 기준값의 권위·복제·유효기간·대사를 공통 개념으로 정의하지 않아 기준값 선택과 조정 이력을 재현할 수 없다.
  - materiality: 엑셀·MES·표준원가 시스템의 값이 다르거나 동기화 사이에 변경되면 시스템이나 사용자마다 다른 기준값을 선택할 수 있다. 따라서 PLM/MES 및 연계 장부 사이의 일관된 해석이 깨지고 계획·원가 결과의 신뢰성, 재현성 및 감사 가능성이 약화된다.
  - action: 다음 단계 전에 각 제조 기준값에 authoritative_system, value_as_of 및 valid_from/to를 지정하고, 복제본에는 원본 참조와 동기화 시각·상태를 연결해야 한다. 이어 ReconciliationEvent로 비교값, 차이, 조정 주체·시각·근거를 기록해 값 선택과 조정 이력을 재현 가능하게 해야 한다. issue-004와 공유 원인 후보가 있으므로 공통 권위·복제 모델을 먼저 정의해 중복 개념을 피해야 한다.
- issue-009 (medium): 생산오더 규칙을 유지하려면 생산오더가 적용한 PartRevision·BOM·Routing 형상을 고정하는 접점을 제공해야 하며, 이를 제공하지 않을 경우 MES 실행 영역을 제외한다는 경계와 외부 실행 온톨로지와의 계약을 명시해야 한다.
  - root cause: 온톨로지가 제조 마스터에 집중하면서 범위를 명시적으로 한정하지 않은 채 MES 생산오더 규칙을 포함하여 실행 계약의 필수 개념이 비어 있다.
  - materiality: 현재 구조로는 생산오더 생성 전제는 선언되지만 실제 생산분에 적용된 형상과 사용 자재·공정을 확인할 수 없다. 따라서 PLM 마스터와 MES 제조 실행 사이의 개념 기준이라는 목적이 약화되고, 형상 변경 영향 분석·실적 대조·추적성 검증을 수행할 통합 계약도 성립하지 않는다.
  - action: 다음 단계 전에 목적과 범위를 먼저 결정해야 한다. MES 실행을 포함한다면 최소한 ProductionOrder와 OrderConfigurationSnapshot을 추가해 PartRevision·BOM·Routing 버전에 연결하고, 선언된 목적에 따라 MaterialConsumption·OperationExecution·Lot/SerialGenealogy까지 확장한다. 실행을 제외한다면 생산오더 규칙을 제거하거나 별도 실행 온톨로지와의 경계 및 교환 계약을 명시해야 한다.
- issue-010 (medium): AlternatePart는 적용 조건·방향·승인 근거를 가진 일급 대체 규칙으로 완결되지 않았고 명시적 관계 그래프에도 연결되지 않아, PLM과 MES가 실제 대체 허용 범위와 방향을 일관되게 판단할 수 없는 medium 결함이다.
  - root cause: AlternatePart를 조건과 증거를 가진 일급 적용 규칙으로 완결하지 않고 정적 품목 관계와 단축 그래프로 이중 표현하여 적용 범위와 관계 추적이 모두 불완전하다.
  - materiality: 대체 승인이 특정 개정·형상·기간·공장·공정·수량에 한정될 때 현재 모델은 그 범위를 표현하거나 승인 근거를 확인할 수 없다. 또한 relations 기반 통합 경로에서는 AlternatePart 인스턴스와 direction이 소실될 수 있어 MES가 대체 권한을 과도하게 적용하거나 잘못된 상호 대체를 허용할 위험이 있으므로, BOM 대체품을 PLM과 MES가 동일하게 해석한다는 목적을 약화한다.
  - action: 다음 단계 전에 AlternatePart를 적용 조건과 승인 근거를 보유한 정규 관계 권위로 먼저 완결해야 한다. applicable revision/configuration, site/work center, quantity/UOM 조건, effective_from/to, approval_ref, substitution_reason을 모델링하고, Part→AlternatePart 및 AlternatePart→Part 역할별 관계를 명시한 뒤 Part→Part alternate_of를 그 구조에서 결정적으로 파생되는 투영으로 정의해야 한다. 마지막으로 생산 오더의 실제 대체 사용 사건을 해당 규칙에 연결해 승인 규칙과 실행 이력을 추적 가능하게 해야 한다.
- issue-013 (medium): 재사용 가능한 공정 정의와 라우팅 문맥의 자원·시간 배정이 Operation 하나에 결합되어 있어, 동일 공정을 공장·작업장·대체설비·기간별로 다르게 운영하려면 Operation을 복제하거나 구조를 변경해야 하는 medium 결함이다.
  - root cause: 재사용 가능한 공정 정의와 라우팅 문맥의 자원·시간 배정을 하나의 Operation 객체에 결합하여 문맥별 변형을 표현하지 못한다.
  - materiality: 라우팅을 PLM 공정 정의와 MES 실행 자원 배정 사이의 확장 가능한 기준으로 사용하려면 공정의 동일성을 유지하면서 문맥별 배정을 표현할 수 있어야 한다. 현재 구조에서는 다공장·대체설비·서로 다른 표준시간을 수용할수록 Operation 복제와 예외 매핑이 늘어나므로 변경 전파와 시스템 간 매핑의 신뢰성이 약화된다.
  - action: OperationDefinition과 RoutingOperation을 분리해야 한다. 공통 공정 의미는 OperationDefinition에 유지하고, RoutingOperation이 이를 참조하면서 순서, 사이트 또는 자원 요구와 후보 WorkCenter, 표준시간, 유효구간을 보유하게 해야 한다. 이 분리를 먼저 확립해야 공정 정의를 복제하지 않고 라우팅 문맥별 배정을 확장할 수 있다.
- issue-015 (medium): AlternatePart 계약은 무조건적 대칭성과 direction=one_way를 동시에 허용해 동일 인스턴스의 방향 의미를 모순되게 만든다. 이는 다음 단계 전에 수정해야 하는 medium 결함이다.
  - root cause: AlternatePart 계약에 무조건적 대칭성 정의와 비대칭 one_way 허용 상태를 함께 선언하여 동일 인스턴스에 양립 불가능한 의무를 부여한다.
  - materiality: one_way 관계를 생성하거나 교환할 때 PLM과 MES가 동일 데이터를 각각 단방향 또는 양방향 대체로 해석할 수 있다. 따라서 대체 부품 관계의 단일 개념 기준을 제공하려는 통합 목적과 계약의 실행 가능성이 약화된다.
  - action: 방향성을 유지하려면 역방향 의무를 direction=bidirectional인 경우로 제한해야 한다. 모든 대체 관계가 항상 대칭이어야 한다면 one_way를 enum과 기본값에서 제거해야 한다. 두 의미 중 하나를 정규 계약으로 확정하고 다음 단계 전에 스키마와 정의를 함께 정렬해야 한다.
- issue-016 (medium): AlternatePart가 대칭 관계로 정의되면서 direction=one_way도 허용해, 동일한 대체 관계를 단방향 또는 양방향으로 해석할 수 있는 medium 결함이다. 다음 단계 전에 정규 관계 의미를 하나로 확정해야 한다.
  - root cause: 방향성 대체와 상호 대체를 하나의 관계 의미로 혼합하여 AlternatePart의 정규 의미가 결정되지 않았다.
  - materiality: PLM이 정의의 대칭성을 따르고 MES가 one_way 방향을 따르면 동일 데이터에 대해 서로 반대되는 부품 대체 허용 판단을 내릴 수 있다. 이는 PLM/MES 간 대체 부품 의미를 일관되게 전달하려는 목적과 제조 투입 결정의 신뢰를 약화한다.
  - action: 다음 단계 및 릴리스 전에 대체 관계를 방향성 관계로 정규화하고 bidirectional을 두 방향 관계의 축약으로 명시해야 한다. 항상 대칭인 관계가 의도라면 대신 direction을 제거해야 한다. 어느 방식을 택하든 정의와 허용 값이 하나의 해석만 만들도록 먼저 의미 계약을 확정해야 PLM/MES 구현을 일관되게 맞출 수 있다.
- issue-017 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 품질 계획 정보와 실행 검사 공정을 동일시하여 PLM과 MES의 개념 경계를 흐리는 material medium 결함이다.
  - root cause: 검사 단계와 그 단계가 참조하는 검사 계획을 동일한 존재론적 유형으로 취급하여 정보 객체와 실행 공정의 역할·수명주기를 혼합한다.
  - materiality: InspectionPlan이 MES 라우팅 단계로 해석되면 계획의 버전·승인과 공정의 순서·표준시간·작업장이 같은 객체의 속성과 수명주기로 취급될 수 있다. 이는 품질 계획과 제조 공정의 의미를 구분해 PLM/MES 개념을 정렬하려는 목적을 직접 약화한다.
  - action: 다음 단계 전에 InspectionPlan을 Operation 상속 구조에서 분리하여 독립된 품질 계획 정보 객체로 모델링해야 한다. 실제 검사 단계는 Operation의 하위 유형인 InspectionOperation 등으로 두고, 해당 단계가 InspectionPlan을 참조하도록 관계를 정의해야 한다. 이렇게 해야 계획의 버전·승인과 공정의 순서·시간·작업장 계약을 독립적으로 관리하고 과거 참조 관계도 보존할 수 있다.
- issue-018 (medium): Part의 ‘최소 관리 단위’ 표현은 관리 식별 역할과 구성상 원자성을 혼합해 Assembly 상속 및 BOM 대상 범위를 모호하게 한다. 우선 Part를 구성 여부와 무관한 관리 품목으로 명확히 정의해야 한다.
  - root cause: 관리 식별 단위라는 역할 개념과 구성상 최소 단위라는 구조 개념을 Part 정의에서 구분하지 않아 Assembly 상속 의미가 모호하다.
  - materiality: 소비자가 ‘최소’를 서로 다르게 해석하면 Assembly를 Part에 포함할지와 어떤 품목을 BOM 대상으로 삼을지가 시스템마다 달라진다. 이로 인해 품목·BOM 계층의 공통 개념 기준과 시스템 간 매핑 안정성이 약화된다.
  - action: 먼저 Part의 규범적 의미를 구성 여부와 무관한 관리 품목 역할로 결정하고 정의를 수정해야 한다. Assembly는 하위 품목 구조를 가진 Part로 한정한다. LeafPart 분리나 계층 재설계는 구성상 원자성을 요구하는 소비자 계약 또는 BOM 규칙이 확인된 뒤에만 도입해야 불필요한 개념 확장을 피할 수 있다.
  - unresolved disagreement: 정의 명확화 필요성에는 합의했지만, structure 렌즈는 이를 낮은 심각도의 국소적 정의 모호성으로 보아 영향 수준에 이견이 남아 있다.
- issue-020 (medium): ECO가 영향 품목별 이전·결과 revision 전이를 연결하지 않아, 적용 시점에 사용할 생산 revision을 구조적으로 결정할 수 없는 medium 결함이다.
  - root cause: revision을 Part의 단일 가변 문자열로만 모델링하여 ECO별 이전·결과 revision 전이를 구조적으로 연결할 수 없다.
  - materiality: PLM의 설계변경을 MES 생산 적용시점의 정확한 revision 기준으로 전달해야 하지만, 여러 ECO가 존재하거나 Part.rev 동기화가 늦으면 적용 대상만 확인할 수 있고 적용할 revision은 판정할 수 없다. 그 결과 구 revision 생산 또는 외부 추정에 의존할 수 있어 목적의 정확성을 약화한다.
  - action: 다음 단계 전에 ECO의 영향 품목별 이전·결과 revision 전이를 명시적으로 연결해야 한다. 지속적인 변경 이력과 시점별 판정이 필요하므로 PartRevision을 별도 엔티티로 두고 ECO, 대상 품목, 이전 revision, 신규 revision 및 effectivity를 연결해 생산 revision의 구조적 결정 근거를 마련해야 한다.
  - unresolved disagreement: axiology와 coverage는 이 결함을 더 넓은 revision·effectivity 형상 기준선 부재의 증상으로 본다. 다만 현재 근거에는 두 결함의 same-root 또는 dependency 관계와 통합 시 심각도 재평가를 뒷받침할 영향 범위가 없어, 독립 결함으로 유지하면서 이견을 보존한다.
- issue-021 (medium): 제품 구성 BOM과 스크랩 회수·재투입 물질 흐름을 BomLine 하나로 표현해 허용된 재투입 자기참조와 오류 순환을 구조적으로 구별할 수 없다. 이 이슈는 더 근본적인 개념 혼합의 직접 증상이며, 심각도는 medium으로 유지된다.
  - root cause: 스크랩 재투입 순환 예외의 의미가 자연어 무결성 규칙에만 있고 BomLine 구조에 투영되지 않아 허용된 자기참조와 오류 순환을 구별할 수 없다.
  - materiality: Assembly 자기참조를 판정할 때 정상 재투입을 거부하거나 임의 자기순환을 허용할 수 있어 BOM 전개와 소요량 계산의 신뢰성이 약화된다. 따라서 PLM/MES가 BOM 구조를 일관되게 검증하고 전개할 수 있는 개념 기준이라는 목적을 훼손한다.
  - action: 정규 해결은 재투입을 별도 MaterialFlow 개념으로 분리하고 그 끝점, 허용 조건, 종료 조건 및 BomLine 연계 규칙을 정의한 뒤, 일반 BomLine에는 비순환 규칙을 유지하는 것이다. edge_kind 추가만으로는 일반 BOM 소비자의 순환 위험과 향후 회수 유형별 예외 증가를 해소하지 못하므로 충분한 종결 조치가 아니다.
  - unresolved disagreement: coverage 렌즈는 일반 BOM 경로의 직접 영향을 근거로 심각도 상향을 유지한다. 다만 현재 자기순환이 실제 소비 경로에서 실패나 오계산을 일으킨다는 실행 증거가 없어, 합의된 심각도는 medium이다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: coverage 렌즈는 더 포괄적인 원인을 Part·BOM·Routing 전체의 시점별 형상 기준선 부재로 본다. 심각도와 현재 결함의 존재에는 이견이 없지만, 두 결함의 same-root 또는 상하위 관계를 확정할 근거는 남아 있지 않다.
- issue-018: 정의 명확화 필요성에는 합의했지만, structure 렌즈는 이를 낮은 심각도의 국소적 정의 모호성으로 보아 영향 수준에 이견이 남아 있다.
- issue-020: axiology와 coverage는 이 결함을 더 넓은 revision·effectivity 형상 기준선 부재의 증상으로 본다. 다만 현재 근거에는 두 결함의 same-root 또는 dependency 관계와 통합 시 심각도 재평가를 뒷받침할 영향 범위가 없어, 독립 결함으로 유지하면서 이견을 보존한다.
- issue-021: coverage 렌즈는 일반 BOM 경로의 직접 영향을 근거로 심각도 상향을 유지한다. 다만 현재 자기순환이 실제 소비 경로에서 실패나 오계산을 일으킨다는 실행 증거가 없어, 합의된 심각도는 medium이다.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: narrowed
- issue-010: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: narrowed
- issue-020: resolved
- issue-021: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준으로서 변경관리 정합성과 제조 운영 위험 통제
- issue-002: PLM/MES가 공유할 일관된 BOM 및 공정 개념 기준
- issue-003: PLM/MES 간 품목·BOM 수량의 일관된 의미와 제조 운영 위험 통제
- issue-005: PLM/MES 통합에서 품목·BOM·라우팅·변경의 공통 형상 기준 제공
- issue-007: PLM BOM과 MES 계획·실적 사이의 수량 및 생산능력 의미 통합
- issue-011: PLM/MES 통합의 개념 기준으로서 품목·BOM·라우팅·변경관리의 변경 연속성 제공 Source finding context: PLM/MES 통합의 개념 기준으로서 품목·BOM·라우팅·변경관리의 변경 연속성을 제공하는 목적
- issue-004: BOM·라우팅 및 소요량 계산을 PLM/MES가 일관되게 해석하는 통합 개념 기준 Source finding context: BOM·라우팅 정합성을 갖춘 PLM/MES 통합 개념 기준 Source finding context: BOM 소요량과 제조 계획을 PLM/MES에서 동일하게 해석하는 기준
- issue-006: PLM/MES 간 설계변경의 통제된 전달과 변경 이력 추적
- issue-008: PLM/MES 및 연계 장부 사이 제조 기준값의 일관된 해석
- issue-009: PLM 마스터와 MES 제조 실행 사이의 개념 기준 제공
- issue-010: BOM 대체품의 조건과 방향을 PLM/MES가 동일하게 해석하는 기준 제공 Source finding context: BOM 대체품을 PLM과 MES가 동일한 조건으로 해석하는 기준 제공 Source finding context: PLM/MES 통합을 위한 품목 및 대체품 관계의 개념 기준 제공
- issue-013: 라우팅 개념을 PLM 공정 정의와 MES 실행 자원 배정 사이의 확장 가능한 기준으로 사용하는 목적 Source finding context: 라우팅 개념을 PLM의 공정 정의와 MES의 실행 자원 배정 사이에서 확장 가능한 기준으로 사용하는 목적
- issue-015: PLM/MES 통합에서 대체 부품 관계의 단일 개념 기준 제공 Source finding context: PLM/MES 통합에서 대체 부품 관계의 단일 개념 기준을 제공하는 목적
- issue-016: PLM/MES 통합에서 대체 부품 의미를 일관되게 전달하는 개념 기준
- issue-017: 품질 계획과 제조 공정의 의미를 구분해 PLM/MES 간 개념을 정렬하는 기준
- issue-018: 품목과 BOM 계층의 공통 개념 기준
- issue-020: PLM 설계변경과 MES 생산 적용시점 사이의 revision 기준 제공
- issue-021: BOM 구조를 PLM/MES가 일관되게 검증하고 전개할 수 있는 개념 기준 제공

## Final Review Result
18 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO effective_date와 비동기 갱신되는 Part.rev가 변경 효력의 권위를 나누고 있어, 주간 동기화 전에는 생산에 적용할 revision을 유일하게 결정할 수 없는 high 결함이다. Unresolved disagreement remains: coverage 렌즈는 더 포괄적인 원인을 Part·BOM·Routing 전체의 시점별 형상 기준선 부재로 본다. 심각도와 현재 결함의 존재에는 이견이 없지만, 두 결함의 same-root 또는 상하위 관계를 확정할 근거는 남아 있지 않다.

## Boundary Notes
- 실제 PLM/MES에 별도의 보완 통제가 존재하는지는 현재 검토 경계에서 확인되지 않았다.
- 각 연계 시스템의 실제 순환 방지 구현은 이 검토 경계 밖이며, 현재 증거는 공유 모델에 종료 의미와 계산 규칙이 없음을 확정한다.
- 실제 현장 환산표의 존재 여부는 경계 내 증거로 확인되지 않지만, 존재하더라도 현재 통합 개념에는 그 권위와 추적성이 표현되지 않는다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-005 (high): fix_now
- issue-007 (high): fix_now
- issue-011 (high): fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-006 (medium): follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, accept_risk
- issue-010 (medium): fix_before_release, fix_now
- issue-013 (medium): follow_up
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_before_release, fix_now
- issue-018 (medium): follow_up, accept_risk
- issue-020 (medium): fix_before_release, fix_now
- issue-021 (medium): fix_before_release, follow_up

## Recommendations
- issue-012 (medium): 폐쇄형 UOM 열거와 환산 모델 부재가 단위 체계의 확장성과 계산 의미 보존을 약화한다. Source finding context: manufacturing-bom-ontology.yaml — 단위와 수량 모델 Source finding context: entities.Part.attributes.uom; entities.BomLine.attributes.qty_per; entities.WorkCenter.attributes.capacity_per_shift; notes[1] Source finding context: 폐쇄형 UOM 열거와 환산 모델 부재 때문에 새 단위·복합 단위·시스템별 단위를 수용할 때 기존 스키마와 소비 로직을 수정해야 한다. Source finding context: 새 품목 단위나 PLM/MES의 다른 단위 코드를 추가할 때 enum 변경이 필요하고, BOM 수량과 생산능력의 차원 및 환산 근거를 기계적으로 보존할 수 없다. 통합 범위가 넓어질수록 현장 환산과 시스템별 예외가 누적된다. Source finding context: UnitOfMeasure와 UnitConversion을 독립 기준 개념으로 만들고 코드 체계, 차원, 기준 단위, 품목별 환산계수, 유효기간을 모델링한다. qty_per와 capacity_per_shift가 자신의 단위 또는 측정량 객체를 명시적으로 참조하게 한다. Source finding context: .onto/review/20260717-a8a687d8/round1/evolution.findings.yaml#evolution-candidate-002 Source finding context: PLM/MES 간 BOM 수량과 제조 능력을 확장 가능한 공통 개념으로 교환하는 목적 Source finding context: ea·kg·m 이외 단위, 품목별 질량 환산, 또는 서로 다른 능력 단위를 가진 작업장을 통합할 때 Source finding context: 확장마다 스키마와 변환 로직을 변경해야 하며, 단위가 암묵적인 수치의 오해가 계획·소요량 계산의 신뢰를 약화한다. Source finding context: 측정 단위와 환산을 독립적인 확장 가능 기준 개념으로 모델링하지 않았다. Source finding context: 허용 UOM이 세 enum 값으로 닫혀 있고 qty_per 및 capacity_per_shift의 단위 표현이 불완전하다. Source finding context: 새 단위 수용에 enum 수정과 현장 환산이 필요한 현상은 단위·환산 마스터 부재의 증상이다.
- issue-014 (medium): 스크랩 재투입을 BOM 자기순환으로 표현해 회수·재작업 확장 시 소비자별 예외 비용과 계산 위험이 증가한다. Source finding context: manufacturing-bom-ontology.yaml — 스크랩 재투입 예외 규칙 Source finding context: integrity_rules[0]; entities.BomLine.attributes.parent_ref/child_ref Source finding context: 재생 원료 흐름을 BOM 자기순환으로 표현하면 향후 회수·재작업 유형을 추가할수록 비순환 BOM 소비자에 예외 수정이 확산된다. Source finding context: BOM 전개, 소요량 계산, 원가 누적 같은 소비자는 자기순환이 정상 재투입인지 잘못된 BOM인지 구조만으로 판별할 수 없다. 새로운 회수·재작업 패턴이 생기면 각 소비자가 별도 예외와 순환 종료 규칙을 추가해야 한다. Source finding context: 제품 구조 BOM은 비순환으로 유지하고, 스크랩 회수·재투입은 MaterialFlow, ByproductFlow 또는 ReworkLoop 같은 공정 흐름 개념으로 분리해 수율, 투입 지점, 최대 반복 또는 종료 조건을 명시한다. Source finding context: .onto/review/20260717-a8a687d8/round1/evolution.findings.yaml#evolution-candidate-004 Source finding context: BOM과 제조 공정을 여러 PLM/MES 소비자가 안정적으로 확장·해석할 수 있는 공통 기준을 제공하는 목적 Source finding context: 스크랩 재투입 외에 재작업, 부산물 회수 또는 다단계 재순환을 추가하거나 일반 BOM 전개를 수행할 때 Source finding context: 모든 소비자에 순환 예외 로직이 퍼지고 신규 회수 유형마다 수정 범위가 커져 확장 내성과 계산 안전성이 저하된다. Source finding context: 제품 구성 관계와 제조 물질 순환이라는 서로 다른 수명주기 개념을 BomLine 하나로 표현했다. Source finding context: 동일 규칙이 BOM 비순환을 요구하면서 스크랩 재투입에는 자기 하위 포함을 허용한다. Source finding context: 순환의 의미와 종료 조건을 구조적으로 구분할 수 없는 현상은 재투입 흐름을 일반 parent-child BomLine으로 인코딩한 것의 증상이다.
- issue-019 (medium): WorkCenter.capacity_per_shift가 개수와 시간이라는 서로 다른 차원을 허용해 능력 계산 의미가 불명확하다. Source finding context: manufacturing-bom-ontology.yaml — WorkCenter.capacity_per_shift Source finding context: entities.WorkCenter.attributes.capacity_per_shift Source finding context: capacity_per_shift 하나에 개수와 시간이라는 서로 다른 차원의 값을 허용한다. Source finding context: 개수/교대와 시간/교대는 비교·합산·부하율 계산 방식이 다른 수량이다. 속성명만으로 소비자가 의미를 판별할 수 없어 작업장 능력과 부하 계산이 시스템마다 달라질 수 있다. Source finding context: 용량의 측정 종류와 UOM을 명시하는 구조로 바꾸거나 quantity_capacity_per_shift와 available_time_per_shift처럼 차원별 속성 또는 하위 유형으로 분리한다. Source finding context: .onto/review/20260717-a8a687d8/round1/semantics.findings.yaml#semantics-candidate-005 Source finding context: 라우팅 작업장 능력을 PLM/MES가 동일한 수량 의미로 교환하는 기준 Source finding context: 여러 WorkCenter의 capacity_per_shift를 비교·집계하거나 공정 표준시간과 결합해 부하를 산출할 때 Source finding context: 차원이 다른 값을 같은 수치로 처리해 생산능력 및 일정 판단을 왜곡할 수 있다. Source finding context: 용량이라는 상위 용어 아래 처리량과 가용시간을 구분하지 않았다. Source finding context: capacity_per_shift가 개수 또는 시간일 수 있어 인스턴스별 의미가 달라진다. Source finding context: 측정 종류와 UOM이 데이터 구조에 표현되지 않았다.

## Unique Finding Tagging
- issue-012 (medium): 폐쇄형 UOM 열거와 환산 모델 부재가 단위 체계의 확장성과 계산 의미 보존을 약화한다. Source finding context: manufacturing-bom-ontology.yaml — 단위와 수량 모델 Source finding context: entities.Part.attributes.uom; entities.BomLine.attributes.qty_per; entities.WorkCenter.attributes.capacity_per_shift; notes[1] Source finding context: 폐쇄형 UOM 열거와 환산 모델 부재 때문에 새 단위·복합 단위·시스템별 단위를 수용할 때 기존 스키마와 소비 로직을 수정해야 한다. Source finding context: 새 품목 단위나 PLM/MES의 다른 단위 코드를 추가할 때 enum 변경이 필요하고, BOM 수량과 생산능력의 차원 및 환산 근거를 기계적으로 보존할 수 없다. 통합 범위가 넓어질수록 현장 환산과 시스템별 예외가 누적된다. Source finding context: UnitOfMeasure와 UnitConversion을 독립 기준 개념으로 만들고 코드 체계, 차원, 기준 단위, 품목별 환산계수, 유효기간을 모델링한다. qty_per와 capacity_per_shift가 자신의 단위 또는 측정량 객체를 명시적으로 참조하게 한다. Source finding context: .onto/review/20260717-a8a687d8/round1/evolution.findings.yaml#evolution-candidate-002 Source finding context: PLM/MES 간 BOM 수량과 제조 능력을 확장 가능한 공통 개념으로 교환하는 목적 Source finding context: ea·kg·m 이외 단위, 품목별 질량 환산, 또는 서로 다른 능력 단위를 가진 작업장을 통합할 때 Source finding context: 확장마다 스키마와 변환 로직을 변경해야 하며, 단위가 암묵적인 수치의 오해가 계획·소요량 계산의 신뢰를 약화한다. Source finding context: 측정 단위와 환산을 독립적인 확장 가능 기준 개념으로 모델링하지 않았다. Source finding context: 허용 UOM이 세 enum 값으로 닫혀 있고 qty_per 및 capacity_per_shift의 단위 표현이 불완전하다. Source finding context: 새 단위 수용에 enum 수정과 현장 환산이 필요한 현상은 단위·환산 마스터 부재의 증상이다.
- issue-014 (medium): 스크랩 재투입을 BOM 자기순환으로 표현해 회수·재작업 확장 시 소비자별 예외 비용과 계산 위험이 증가한다. Source finding context: manufacturing-bom-ontology.yaml — 스크랩 재투입 예외 규칙 Source finding context: integrity_rules[0]; entities.BomLine.attributes.parent_ref/child_ref Source finding context: 재생 원료 흐름을 BOM 자기순환으로 표현하면 향후 회수·재작업 유형을 추가할수록 비순환 BOM 소비자에 예외 수정이 확산된다. Source finding context: BOM 전개, 소요량 계산, 원가 누적 같은 소비자는 자기순환이 정상 재투입인지 잘못된 BOM인지 구조만으로 판별할 수 없다. 새로운 회수·재작업 패턴이 생기면 각 소비자가 별도 예외와 순환 종료 규칙을 추가해야 한다. Source finding context: 제품 구조 BOM은 비순환으로 유지하고, 스크랩 회수·재투입은 MaterialFlow, ByproductFlow 또는 ReworkLoop 같은 공정 흐름 개념으로 분리해 수율, 투입 지점, 최대 반복 또는 종료 조건을 명시한다. Source finding context: .onto/review/20260717-a8a687d8/round1/evolution.findings.yaml#evolution-candidate-004 Source finding context: BOM과 제조 공정을 여러 PLM/MES 소비자가 안정적으로 확장·해석할 수 있는 공통 기준을 제공하는 목적 Source finding context: 스크랩 재투입 외에 재작업, 부산물 회수 또는 다단계 재순환을 추가하거나 일반 BOM 전개를 수행할 때 Source finding context: 모든 소비자에 순환 예외 로직이 퍼지고 신규 회수 유형마다 수정 범위가 커져 확장 내성과 계산 안전성이 저하된다. Source finding context: 제품 구성 관계와 제조 물질 순환이라는 서로 다른 수명주기 개념을 BomLine 하나로 표현했다. Source finding context: 동일 규칙이 BOM 비순환을 요구하면서 스크랩 재투입에는 자기 하위 포함을 허용한다. Source finding context: 순환의 의미와 종료 조건을 구조적으로 구분할 수 없는 현상은 재투입 흐름을 일반 parent-child BomLine으로 인코딩한 것의 증상이다.
- issue-019 (medium): WorkCenter.capacity_per_shift가 개수와 시간이라는 서로 다른 차원을 허용해 능력 계산 의미가 불명확하다. Source finding context: manufacturing-bom-ontology.yaml — WorkCenter.capacity_per_shift Source finding context: entities.WorkCenter.attributes.capacity_per_shift Source finding context: capacity_per_shift 하나에 개수와 시간이라는 서로 다른 차원의 값을 허용한다. Source finding context: 개수/교대와 시간/교대는 비교·합산·부하율 계산 방식이 다른 수량이다. 속성명만으로 소비자가 의미를 판별할 수 없어 작업장 능력과 부하 계산이 시스템마다 달라질 수 있다. Source finding context: 용량의 측정 종류와 UOM을 명시하는 구조로 바꾸거나 quantity_capacity_per_shift와 available_time_per_shift처럼 차원별 속성 또는 하위 유형으로 분리한다. Source finding context: .onto/review/20260717-a8a687d8/round1/semantics.findings.yaml#semantics-candidate-005 Source finding context: 라우팅 작업장 능력을 PLM/MES가 동일한 수량 의미로 교환하는 기준 Source finding context: 여러 WorkCenter의 capacity_per_shift를 비교·집계하거나 공정 표준시간과 결합해 부하를 산출할 때 Source finding context: 차원이 다른 값을 같은 수치로 처리해 생산능력 및 일정 판단을 왜곡할 수 있다. Source finding context: 용량이라는 상위 용어 아래 처리량과 가용시간을 구분하지 않았다. Source finding context: capacity_per_shift가 개수 또는 시간일 수 있어 인스턴스별 의미가 달라진다. Source finding context: 측정 종류와 UOM이 데이터 구조에 표현되지 않았다.

## Shared Phenomenon Summary
- none
