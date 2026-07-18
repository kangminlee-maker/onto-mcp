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
- issue-001 (high): ECO 발효 상태와 실제 생산 구성이 하나의 원자적 기준으로 연결되지 않아, 동기화 지연 중 생산오더가 구 리비전을 사용할 수 있다.
  - root cause: 변경 권위가 발효된 불변 구성 버전 하나로 결속되지 않고 ECO, mutable Part.rev, Routing 상태에 분산되어 있어 동기화 지연 중 구 리비전 생산이 허용된다.
  - materiality: PLM과 MES는 특정 생산분에 유효한 구성을 동일하게 판정해야 한다. 그러나 ECO 발효 후 Part.rev의 주간 갱신 전까지 두 시스템이 서로 다른 리비전을 정당한 것으로 해석할 수 있어, 잘못된 자재·공정·검사 기준으로 생산할 위험이 생기며 선언된 구성 통제와 제조 안전 목적을 직접 훼손한다.
  - action: ECO가 effective_date와 lot 또는 serial 범위에 따라 정확한 Part·BOM·Routing 조합을 선택하는 불변 구성 버전을 권위 단위로 갖도록 모델링해야 한다. 이어 생산오더가 승인·발효된 해당 구성 버전을 고정 참조하고, 생성 시점에 버전 및 효력 조건의 일치를 검증하도록 해야 한다. 모든 렌즈가 이 근본 원인과 조치 및 high 심각도를 지지했으므로 현재 대상에서 우선 닫아야 한다.
- issue-004 (high): 선언된 PLM/MES 통합 목적과 달리 기준 모델에 MES 실행·추적성 개념이 없어, 릴리스된 엔지니어링 정의를 실제 생산 결과와 연결할 수 없는 중대한 범위 결함이 있다.
  - root cause: 온톨로지 범위가 engineering definition에 머물러 선언된 PLM/MES 통합 목적의 manufacturing-execution 영역을 모델링하지 않았다.
  - materiality: ManufacturingOrder, OperationExecution, MaterialConsumption, Lot/Serial 및 실제 결과가 표현되지 않으므로 BOM·라우팅의 MES 인계, 자재 소비 추적, 생산 실적 대사가 공통 기준에서 도출되지 않는다. 구현별로 별도 의미 체계를 만들어야 하므로 PLM/MES 통합의 개념 기준이라는 선언 목적이 약화된다.
  - action: 현재 문서에서 범위를 결정해야 한다. PLM/MES 통합 목적을 유지한다면 ManufacturingOrder, OperationExecution, MaterialConsumption, 생산·소비 Lot/Serial, 실제 결과, 일탈·부적합 연결을 포함하는 최소 실행 모델을 추가하고 엔지니어링 릴리스와의 인계 관계를 먼저 정의해야 한다. 실행 모델을 포함하지 않을 경우에는 선언 목적을 engineering handoff 이전으로 명시적으로 축소하고, 별도의 권위 있는 MES 모델과 경계를 식별해야 한다.
- issue-005 (high): Part·BOM·Routing을 불변 버전과 효력 구간으로 관리하지 않고 서로 다른 revision 의미를 현재값에 혼합해, 변경 전후 및 특정 생산 시점의 권위 있는 제품·공정 구성을 식별하거나 재구성할 수 없는 high 결함이다.
  - root cause: 품목·도면·ECO·생산 효력을 구분하는 불변 revision/effectivity 개념 없이 변경 가능한 현재 scalar 상태로 구성을 표현해 시점별 기준선과 권위 있는 생산 리비전을 재구성할 수 없다.
  - materiality: PLM과 MES가 동일한 품목·BOM·라우팅·변경관리 기준을 사용해야 하지만, ECO 효력일이 주간 동기화 지연과 겹치거나 과거 생산을 재구성할 때 시스템별로 서로 다른 BOM·라우팅·revision을 선택할 수 있다. 그 결과 오래되거나 승인되지 않은 구성으로 생산할 위험이 생기며 구성 통제, 제조 추적성, 감사 가능성이 약화된다.
  - action: 먼저 item revision과 drawing revision을 분리하고 PartRevision, BomRevision, RoutingRevision 또는 동등한 공통 불변 버전 정의를 도입해야 한다. 다음으로 각 버전에 효력 구간과 supersession 관계를 부여하고, ECO가 정확한 변경 전·후 구성 기준선과 revision 전환을 연결하도록 해야 한다. 마지막으로 MES가 주간 `Part.rev` 동기화 여부와 무관하게 생산 시점 기준의 단일 권위 구성과 유효 revision을 조회하도록 그 투영의 권위와 동기화 의미를 명확히 해야 한다. 모든 관련 렌즈가 이 근인과 high 심각도에 동의했으므로 현재 대상에서 반드시 수정해야 한다.
- issue-009 (high): ECO 전후의 BOM·Routing 구성을 함께 식별할 불변 버전과 효력 구조가 없어, 생산 시점별 적용 구성을 일관되게 판정·추적할 수 없는 high 결함이다.
  - root cause: 변경 가능한 현재 상태와 시간에 따라 유효한 불변 구성 버전을 분리하지 않아 ECO 전후 데이터 연속성이 보존되지 않는다.
  - materiality: 이 결함은 설계변경 전후의 구성과 공정 정의를 연속적으로 식별한다는 PLM/MES 통합 목적을 직접 약화한다. ECO 효력일 전후에 생산이나 동기화가 수행되면 양 시스템이 적용 버전을 다르게 판단할 수 있어 생산오더, 자재소요, as-planned/as-built 이력의 신뢰성이 떨어진다.
  - action: 현재 대상에서 불변 PartRevision, BomRevision, RoutingRevision을 도입하고 BomLine과 RoutingStep을 해당 버전에 귀속해야 한다. 이어 ECO가 변경 전후 버전과 효력 시작·종료 조건을 연결하도록 하고, 생산오더가 실제 적용 버전을 고정 참조하게 해야 한다. 이 순서로 버전 기준선을 먼저 확립해야 ECO 효력 판정과 생산 이력이 동일한 권위에 기반할 수 있다.
- issue-012 (high): 전역 BOM 비순환 의무와 스크랩 재투입의 자기 포함 허용은 직접 모순된다. 다만 숙의 결과 이 모순은 독립적인 근본 이슈가 아니라, 물질 흐름을 제품 구성 관계인 BomLine으로 표현한 의미 혼합의 표면 증상으로 좁혀졌다.
  - root cause: 스크랩 재투입 예외를 전역 비순환 제약의 적용 범위 밖 관계로 분리하지 않고 제약이 금지하는 자기참조 구조로 정의했다.
  - materiality: 자기 참조는 길이 1의 순환이므로 동일 모델을 어떤 시스템은 허용하고 다른 시스템은 순환 오류로 거부할 수 있다. 이는 PLM/MES 간 BOM 교환과 생산 전개의 일관성 및 신뢰성을 직접 훼손하므로 현재 대상에서 반드시 해소해야 한다.
  - action: 스크랩 재투입을 BomLine에서 분리된 material-flow 관계로 모델링하고, BOM 비순환 검증은 제품 구성 관계에만 적용해야 한다. 대안적으로 순환을 허용해야 한다면 허용 가능한 관계 타입과 조건을 명시한 검증 규칙으로 교체해야 한다. 먼저 관계의 의미와 제약 적용 범위를 분리한 뒤 검증 규칙과 PLM/MES 소비자 판정을 함께 정렬해야 모순과 시스템별 해석 차이를 동시에 제거할 수 있다.
- issue-015 (high): InspectionPlan을 실행 가능한 Operation으로 분류해 검사 명세와 실행 단계의 의미를 혼합한 high 결함이며, 현재 대상에서 수정해야 한다.
  - root cause: 실행 가능한 제조 공정과 그 공정을 규율하는 정보성 검사 명세를 하나의 Operation 계층으로 혼합했다.
  - materiality: PLM/MES 소비자가 `is_a Operation`을 실행 디스패치 기준으로 사용하면 InspectionPlan 자체가 라우팅 단계로 처리된다. 이로 인해 실행 절차와 품질 명세를 일관되게 구분할 수 없어 라우팅·검사 상호운용성이 약화된다.
  - action: 먼저 현재 타입이 정보성 명세인지 실행 단계인지 정체성을 확정해야 한다. 명세라면 Operation 하위의 InspectionOperation을 별도로 만들고 InspectionPlan 또는 InspectionSpecification과 연결하여 실행과 명세를 독립적으로 연결·버전 관리해야 한다. 실행 단계를 뜻한다면 현재 타입의 이름과 정의를 InspectionOperation으로 정렬해야 한다.
- issue-016 (high): 회수·재투입 물질 흐름을 BomLine으로 표현한 탓에 제품 구성의 part-whole 의미와 BOM 전개의 종료성이 훼손된 high 결함이며, 현재 대상에서 반드시 수정해야 한다.
  - root cause: 회수 재료의 공정 흐름을 의미적으로 다른 BOM part-whole 관계로 표현했다.
  - materiality: PLM 또는 MES가 자기참조 BomLine에 일반 부품 전개 규칙을 적용하면 무한 재귀, 소요량 중복 계산, 회수 재료의 구성품 오인이 발생할 수 있다. 따라서 이 모델은 BOM 교환과 제조 계획을 위한 안전한 개념 기준이라는 목적을 충족하지 못한다.
  - action: 제품 BOM에서 자기포함 예외를 제거하고 전체 구성 그래프를 비순환으로 유지해야 한다. 먼저 스크랩 회수·재투입을 관련 Operation, 흐름 방향, 수량 기준에 연결되는 별도 material-flow 또는 return 관계로 모델링한 뒤 기존 자기참조 표현을 그 관계로 이전해야 한다. 이 순서가 회수 공정 정보를 보존하면서 안전한 BOM 전개 의미를 복구한다.
- issue-002 (medium): scrap 값을 포함한 핵심 제조 수치에 단일 권위 원천과 공통 계산 의미가 결여되어 PLM과 MES가 서로 다른 값과 해석을 사용하면서도 동일 계약을 준수한 것으로 보일 수 있다. 이 문제는 다음 통합 단계 전에 해소해야 한다.
  - root cause: scrap 값을 포함한 핵심 제조 수치가 권위 있는 원천, 단위·범위·공식, 파생 및 대사 계약을 가진 통합 개념으로 정의되지 않아 복제값과 수치 의미가 함께 분기한다.
  - materiality: 통합 기준의 목적은 BOM·라우팅 정보를 PLM과 MES가 동일한 의미와 값으로 교환하도록 하는 것이다. 그러나 scrap_rate의 비율·계수·범위가 확정되지 않고 수율·표준시간·능력·환산값도 복사나 수기 입력에 의존하므로, 자재 소요량·예상 수율·표준원가·능력 계산이 시스템별로 달라져 기준 문서가 통합 판정 기준 역할을 하지 못한다.
  - action: 통합 매핑과 계산 설계에 앞서 공유 제조 수치별 단일 권위 원천과 단위 포함 타입을 확정해야 한다. scrap은 scrap_fraction 또는 yield_fraction 같은 하나의 정규 개념으로 범위, 단위, 수량 공식, 공정·작업 범위와 원천 권위를 명시하고 gross-up 계수 등은 결정적으로 파생해야 한다. 복제본에는 출처 참조, 유효기간, 동기화 상태와 자동 대사를 모델링하고, 불일치 시 차단하거나 명시적으로 공개하는 규칙을 두어야 한다.
- issue-003 (medium): 스크랩 회수·재투입을 자기참조 BomLine으로 표현하면 제품 구성 의미와 BOM 비순환·전개 종료 계약이 함께 깨진다. 이 흐름은 제품 구성 관계에서 분리해야 하는 현재 차단 결함이다.
  - root cause: 제품 구성 그래프와 제조 물질 흐름을 분리하지 않고 BomLine 하나에 두 목적을 부여해 스크랩 재투입이 자기참조 BOM으로 표현된다.
  - materiality: PLM과 MES가 동일한 BOM을 안전하고 예측 가능하게 해석하려면 제품 구성 그래프가 비순환이어야 한다. 자기참조 BomLine이 일반 BOM 전개, 소요량 계산 또는 순환 검증에 들어가면 전개가 반복되거나 소비자별 예외 처리에 따라 결과가 달라져 운영 안전과 시스템 간 정합성이 약화된다.
  - action: BomLine을 비순환 제품 구성 관계로 한정한 뒤, Operation의 부산물·회수 산출과 후속 Operation의 투입을 연결하는 별도 material-flow 또는 recycle-flow 관계를 도입해야 한다. 먼저 두 그래프의 의미와 제약을 분리하고, 이어 BOM 전개·소요량 계산 소비자가 제품 구성 그래프만 순환 검증 및 전개 대상으로 사용하도록 계약을 명시해야 한다.
- issue-006 (medium): Routing과 ECO에 폐기·대체·정정·재발행 경로와 승인·적용 감사 증거가 없어, 제조 운영의 일관된 릴리스 및 변경 통제를 가로막는 medium 결함이다.
  - root cause: 통제 대상 객체를 짧은 status enum으로만 모델링하고 수명주기 사건과 불변 감사 증거를 독립 개념으로 두지 않았다.
  - materiality: 거절, 취소, 대체, 폐기 또는 승인·적용 후 정정이 발생하면 시스템마다 수명주기 의미가 달라질 수 있다. 또한 과거 결정과 적용 근거를 추적할 수 없어 통제 변경이 감사 불가능해지거나 현재 상태를 파괴적으로 덮어써야 하므로, 일관된 라우팅 릴리스와 엔지니어링 변경 통제라는 목적이 약화된다.
  - action: 다음 단계로 진행하기 전에 Routing과 ECO의 전이를 거절·취소·폐기·대체·정정·재발행까지 명시하고, 각 변경과 승인·적용 결정을 불변 ChangeEvent 및 Approval로 기록해야 한다. 기록에는 행위자, 시각, 결정, 근거·증거와 영향받은 구성 버전을 포함해 현재 상태와 과거 사건을 분리하고, 운영 시스템 연결 전에 상태 전이 및 감사 권위를 확정해야 한다.
- issue-007 (medium): BOM 수량과 작업장 용량에 통제된 단위 및 변환 규칙이 없어, 동일한 PLM/MES 데이터에서도 소요량과 용량 계산이 달라질 수 있는 중간 심각도의 결함이다.
  - root cause: 측정 의미를 governed quantity/unit/conversion 하위 도메인이 아니라 고립된 숫자 필드와 제한된 enum으로 표현했다.
  - materiality: 부품·생산 수량이나 용량을 개수, 질량, 길이 또는 시간 단위 사이에서 변환할 때 시스템과 작업자가 서로 다른 결과를 산출할 수 있다. 이는 PLM과 MES가 BOM 및 라우팅 수량을 일관되게 해석해야 한다는 목적을 훼손하고, 자재 계획과 실행의 반복 가능성을 약화한다.
  - action: 다음 단계의 수량 기반 통합 계산을 시작하기 전에 모든 측정값을 Quantity와 Unit에 연결하고, 품목별 변환에 분자·분모, 반올림 규칙, 효력 구간 및 권위 원천을 명시해야 한다. 그래야 PLM과 MES가 동일한 변환 계약을 사용해 BOM 소요량과 작업장 용량을 반복 가능하게 재구성할 수 있다.
- issue-008 (medium): 중복 관리되는 scrap rate와 누적 표준시간 파생값에 권위 원천과 대사 기록이 없어, 값이 충돌할 때 승자와 해결 이력을 결정할 수 없는 medium 결함이 있다.
  - root cause: 복제된 운영 값은 문서화했지만 provenance, 단일 권위, projection 및 reconciliation을 통합 개념으로 모델링하지 않았다.
  - materiality: 스프레드시트, MES, 원가 시스템의 복제값이 동기화 사이에 달라지면 계획·실행·원가가 각기 다른 값을 정답으로 사용할 수 있다. 온톨로지가 권위 있는 값과 감사 가능한 해결 과정을 제시하지 못하므로, 공유 PLM/MES 제조 데이터의 일관된 개념 권위라는 목적이 약화된다.
  - action: 먼저 공유 값마다 하나의 권위 원천을 지정하고 다른 사본을 그 원천의 projection으로 모델링해야 한다. 이어 동기화·대사 기록에 원천 버전, 관측 시각, 소유자, 차이, 해결 결과와 근거를 보존해야 한다. 권위와 projection 관계가 대사 수명주기의 선행 조건이며, 상세 대사 절차는 다음 통합 설계 단계에서 완성할 수 있다.
- issue-010 (medium): 선형 Operation 목록은 현재 선형 공정은 표현하지만, 병렬·분기·대체·재작업 흐름과 라우팅별 공정 변형을 의미 손실 없이 확장할 수 없는 medium 결함이다.
  - root cause: 재사용 가능한 공정 정의, 라우팅 내 공정 발생, 단계 간 흐름을 하나의 Operation과 ordered_list에 축약했다.
  - materiality: MES와 공유할 확장 가능한 공정·라우팅 개념 기준이 새 제조 유형을 기존 계약의 확장으로 수용하지 못한다. 해당 유형이 추가되면 Routing.operations 구조를 교체하고 기존 라우팅 데이터를 마이그레이션해야 하므로 통합 연속성과 진화 가능성이 약화된다.
  - action: 후속 단계에서 OperationDefinition과 RoutingStep을 분리하고, 작업장·표준시간·효력 조건을 RoutingStep에 배치해야 한다. 이어 단계 간 predecessor 또는 transition 관계를 명시해 병렬·분기·대체·재작업을 표현하고, 기존 선형 라우팅은 이 그래프 모델의 부분집합으로 유지되도록 마이그레이션 규칙을 마련해야 한다.
- issue-011 (medium): 폐쇄형 단위 열거와 무차원 수량·용량 값 때문에 새 단위나 용량 유형을 도입하려면 기존 스키마와 인터페이스를 변경해야 하며, 과거 값의 차원과 의미도 안정적으로 보존할 수 없는 medium 결함이 있다.
  - root cause: 측정값과 단위를 독립적이고 확장 가능한 개념으로 모델링하지 않고 폐쇄형 enum, 무차원 숫자 및 주석에 의존했다.
  - materiality: PLM과 MES가 수량과 생산능력을 지속적으로 교환하려면 값의 차원과 변환 의미가 기계적으로 판별되어야 한다. 현재 enum 밖의 단위나 다른 차원의 작업장 용량이 추가되면 양쪽 시스템의 계약과 매핑을 함께 수정해야 하고, 기존 무차원 값을 안전하게 변환할 수 없어 계획·소요량·능력 계산의 신뢰성이 저하된다.
  - action: UnitOfMeasure를 확장 가능한 기준 엔티티로 분리하고 모든 측정값을 value와 unit이 결합된 Quantity로 모델링해야 한다. 이어서 품목별 변환 규칙에 유효기간을 두고, WorkCenter 용량에는 단위·시간 기준·용량 유형을 명시해야 한다. 먼저 Quantity·Unit의 공통 계약을 확립한 뒤 변환 및 용량 세부를 연결해야 기존 값의 의미를 보존하면서 새 단위와 용량 유형을 데이터 확장으로 수용할 수 있다.
- issue-013 (medium): AlternatePart가 상호 호환성과 방향성 대체를 하나의 관계로 혼합한 채 필수 대칭성과 기본 one_way 상태를 동시에 허용해 규칙이 직접 충돌한다. 이 충돌은 실제 교환 모델을 확정하기 전에 해소해야 하는 중간 심각도의 중요 이슈다.
  - root cause: 대체 관계를 본질적으로 대칭이라고 선언하면서 같은 엔티티에 비대칭 one_way 상태를 도입하고 적용 조건을 제한하지 않았다.
  - materiality: 기본값인 one_way로 AlternatePart가 생성·교환되면 수신 시스템은 필수 대칭성에 따라 역대체를 허용하거나 direction에 따라 금지할 수 있다. 이에 따라 PLM과 MES의 자재 대체 판정이 달라져 대체 품목 관계를 일관되게 해석하려는 목적이 약화된다.
  - action: 먼저 도메인 정책으로 단방향 대체 허용 여부와 상호 호환성의 역관계 의무를 결정해야 한다. 대칭 관계만 지원한다면 direction을 제거하고 양방향으로 고정한다. 단방향도 지원한다면 상호 호환성과 방향성 대체를 관계 의미 또는 유형으로 분리하고, bidirectional일 때만 역관계를 의무화해야 한다. 이 결정과 규칙 정합성 검증은 실제 PLM/MES 교환 모델 확정 전에 완료해야 한다.
- issue-017 (medium): WorkCenter.capacity_per_shift는 개수 처리량과 가용 처리 시간을 하나의 무차원 값으로 표현하여 차원적으로 무효한 스케줄링·용량 계산을 허용하는 material medium 결함이다.
  - root cause: 차원이 다른 처리량 용량과 가용 시간을 하나의 타입 없는 숫자 속성으로 압축했다.
  - materiality: 제조 소비자는 작업장별 외부 지식 없이는 값이 개수인지 시간인지 판별할 수 없다. 이로 인해 시간을 개수로 또는 개수를 시간으로 해석할 수 있어, 일관된 작업장 용량 의미를 제공하려는 목적이 훼손된다.
  - action: 다음 단계와 스케줄링 통합 전에 용량을 명시적 단위와 capacity basis를 가진 typed quantity로 정의하거나, 처리량 용량과 가용시간 용량을 별도 속성으로 분리해야 한다. 새 계약의 차원이 유일하게 판별되도록 스키마와 소비 로직을 함께 정렬해야 한다.
- issue-018 (medium): AlternatePart가 명시적 relations 그래프에서 고립되어 있어 relations-only 소비자는 대체 관계의 양 끝점과 direction을 함께 복구할 수 없다. 이는 다음 통합 설계 단계 전에 수정해야 하는 medium 수준의 완전성 결함이다.
  - root cause: Part→Part 단축 관계가 reified AlternatePart 엔티티를 경유하는 명시적 간선을 대체해 관계 속성과 방향을 그래프에서 분리했다.
  - materiality: PLM/MES 간 대체부품 관계와 속성을 일관되게 교환하려는 목적은 소비자가 동일한 그래프 경로에서 관계의 끝점과 direction을 식별할 수 있어야 달성된다. 현재 구조에서는 각 시스템이 직접 Part→Part 관계를 임의로 해석할 수 있어 공통 개념 기준의 일관성과 예측 가능성이 약화된다.
  - action: 다음 통합 설계 단계 전에 Part→AlternatePart와 AlternatePart→Part 간선을 추가해 primary_ref와 alternate_ref를 명시적으로 연결해야 한다. 기존 Part→Part alternate_of는 이 reified 경로에서 의미와 direction을 보존해 유도되는 투영으로 엄격히 규정하거나 제거해야 한다. 그래야 relations-only 소비자가 단일 권위 경로로 관계 끝점과 속성을 함께 해석할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-012: narrowed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: resolved
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-013: narrowed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM과 MES가 동일한 변경 발효 상태와 제조 구성을 사용하는 개념 기준 제공
- issue-004: PLM/MES 통합의 개념 기준 제공 Source finding context: Serving as the conceptual baseline for PLM/MES integration.
- issue-005: PLM과 MES가 동일한 품목·BOM·라우팅·변경관리 기준과 생산 효력 상태를 사용하는 것 Source finding context: Providing a consistent item, BOM, routing, and change-management baseline across PLM and MES. Source finding context: Provide a consistent change-management vocabulary for PLM/MES integration.
- issue-009: 설계변경 전후의 구성과 공정 정의를 연속적으로 식별하는 PLM/MES 통합 기준 Source finding context: PLM/MES 통합의 개념 기준으로서 설계변경 전후의 구성과 공정 정의를 연속적으로 식별하는 목적
- issue-012: PLM/MES 통합을 위한 BOM 개념 및 무결성 기준
- issue-015: PLM/MES 간 일관된 라우팅 및 검사 개념 제공 Source finding context: Provide consistent routing and inspection concepts across PLM and MES.
- issue-016: BOM 교환과 제조 계획을 위한 안전한 개념 기준 제공 Source finding context: Serve as a safe conceptual reference for BOM exchange and manufacturing planning.
- issue-002: BOM·라우팅 정보를 PLM/MES가 동일한 의미와 값으로 교환하는 통합 개념 기준 제공 Source finding context: Provide consistent BOM quantity semantics for manufacturing planning.
- issue-003: PLM/MES가 제품 구조와 제조 흐름을 동일하고 안전하게 해석하도록 하는 정합적인 BOM·공정 개념 제공 Source finding context: 정합적인 BOM·공정 개념을 통해 PLM/MES가 동일하고 안전하게 제품 구조와 제조 흐름을 해석하도록 하는 것
- issue-006: 제조 운영을 위한 일관된 라우팅 릴리스와 엔지니어링 변경 통제 Source finding context: Consistent routing release and engineering change control for manufacturing operations.
- issue-007: PLM/MES 간 BOM 및 라우팅 수량의 일관된 해석 Source finding context: Consistent interpretation of BOM and routing quantities across PLM and MES.
- issue-008: 공유 PLM/MES 제조 데이터의 일관된 개념 권위 제공 Source finding context: Acting as a consistent conceptual authority for shared PLM/MES manufacturing data.
- issue-010: MES와 공유할 수 있는 확장 가능한 공정·라우팅 개념 기준
- issue-011: PLM/MES 간 수량과 생산능력을 지속적으로 교환할 수 있는 개념 기준
- issue-013: PLM/MES 간 대체 품목 관계의 일관된 해석
- issue-017: 제조 소비자에게 일관된 작업장 용량 의미 제공 Source finding context: Provide consistent work-center capacity semantics to manufacturing consumers.
- issue-018: 대체부품 관계와 그 속성을 일관되게 교환하는 PLM/MES 개념 기준 제공 Source finding context: PLM/MES 통합의 개념 기준 문서로서 대체부품 관계와 그 속성을 일관되게 교환하는 목적

## Final Review Result
17 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO 발효 상태와 실제 생산 구성이 하나의 원자적 기준으로 연결되지 않아, 동기화 지연 중 생산오더가 구 리비전을 사용할 수 있다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 PLM 또는 MES에 별도 차단 로직이 있는지는 허용된 증거 범위에서 확인할 수 없으며, 검토 문서 자체에는 그 통합 계약이 없다.
- 제한된 증거에는 이 공백을 해소할 별도의 권위 있는 MES 온톨로지가 식별되어 있지 않다.
- 실제 PLM·MES가 별도 구성 이력을 보존하는지는 검토 경계 밖이지만, 검토 대상 모델 자체에는 그 연속성을 표현하거나 연결하는 계약이 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now, accept_risk
- issue-005 (high): fix_now
- issue-009 (high): fix_now
- issue-012 (high): fix_now
- issue-015 (high): fix_now
- issue-016 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): follow_up
- issue-011 (medium): follow_up
- issue-013 (medium): fix_before_release, accept_risk
- issue-017 (medium): fix_before_release, fix_now
- issue-018 (medium): fix_before_release, fix_now

## Recommendations
- issue-014 (high): AlternatePart가 동시에 대칭 관계와 방향 민감 관계로 정의되어 동일 관계에 호환되지 않는 의미를 부여한다. Source finding context: AlternatePart definition and direction semantics Source finding context: materialized-input.md:37-45,84-91 Source finding context: AlternatePart is simultaneously defined as symmetric and modeled as direction-sensitive, so the same relation has incompatible meanings. Source finding context: Mutual interchangeability and directed substitution are different authorization semantics. A PLM/MES consumer cannot determine whether reverse substitution is permitted, which can allow an unapproved component or reject an approved one. Source finding context: Define one canonical directed substitution relation with explicit source and target; represent mutual interchangeability as two directed assertions or an explicit bidirectional property, and require the shortcut projection to preserve that meaning. Source finding context: .onto/review/20260718-ddf66b5d/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: Provide a semantically reliable PLM/MES reference model for part substitution. Source finding context: A consumer interprets the symmetric definition or `alternate_of` shortcut while another follows the default `one_way` value. Source finding context: Systems can disagree about which component substitutions are authorized during planning or execution. Source finding context: The model conflates mutual interchangeability with directed substitution under one concept. Source finding context: The prose definition asserts symmetry, but the attribute model defaults to one-way substitution. Source finding context: The `alternate_of` shortcut further suppresses the direction that distinguishes the two meanings.

## Unique Finding Tagging
- issue-014 (high): AlternatePart가 동시에 대칭 관계와 방향 민감 관계로 정의되어 동일 관계에 호환되지 않는 의미를 부여한다. Source finding context: AlternatePart definition and direction semantics Source finding context: materialized-input.md:37-45,84-91 Source finding context: AlternatePart is simultaneously defined as symmetric and modeled as direction-sensitive, so the same relation has incompatible meanings. Source finding context: Mutual interchangeability and directed substitution are different authorization semantics. A PLM/MES consumer cannot determine whether reverse substitution is permitted, which can allow an unapproved component or reject an approved one. Source finding context: Define one canonical directed substitution relation with explicit source and target; represent mutual interchangeability as two directed assertions or an explicit bidirectional property, and require the shortcut projection to preserve that meaning. Source finding context: .onto/review/20260718-ddf66b5d/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: Provide a semantically reliable PLM/MES reference model for part substitution. Source finding context: A consumer interprets the symmetric definition or `alternate_of` shortcut while another follows the default `one_way` value. Source finding context: Systems can disagree about which component substitutions are authorized during planning or execution. Source finding context: The model conflates mutual interchangeability with directed substitution under one concept. Source finding context: The prose definition asserts symmetry, but the attribute model defaults to one-way substitution. Source finding context: The `alternate_of` shortcut further suppresses the direction that distinguishes the two meanings.

## Shared Phenomenon Summary
- none
