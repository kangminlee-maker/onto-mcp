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
- issue-001 (high): Part·BOM·Routing을 현재값과 목록으로, ECO를 단일 상태로만 표현해 승인·효력 시점에 적용할 제조 구성을 일관되게 선택하거나 과거 구성을 재현할 수 없다. 심각도 high의 즉시 수정 대상이다.
  - root cause: ECO를 감사 가능한 변경 전이 및 시점별 Part·BOM·Routing 버전과 연결하면 current_eco의 의미 모호성, 변경 대상 단절, 적용 구성 재현 불가가 함께 해소된다.
  - materiality: PLM과 MES가 동일한 품목에 서로 다른 BOM·라우팅·개정을 적용할 수 있으며, 생산 당시의 기준 구성을 사후에 재현할 수도 없다. 이는 BOM·라우팅·변경 적용을 일관되게 판정하고 추적하려는 개념 기준의 핵심 목적을 직접 약화시켜 생산 판단과 감사 결과의 신뢰성을 훼손한다.
  - action: 먼저 Part·BOM·Routing의 식별 가능한 버전 엔티티와 상태·유효구간·선행 버전을 도입해야 한다. 다음으로 ECO가 변경 전후 버전과 영향받는 BOM·Routing 구성을 명시적으로 연결하도록 하고, 생산 적용 판단은 변경 가능한 current 필드가 아니라 해당 버전의 effectivity를 기준으로 정의해야 한다. 이 연결을 먼저 확립해야 current_eco의 의미를 latest_eco 또는 current_applied_eco처럼 분리·정의할 수 있고, 이후 감사·취소·롤백 lifecycle 확장의 근거도 마련된다.
  - unresolved disagreement: coverage는 행위자·근거·감사·취소·롤백까지 동일 근본 원인의 필수 범위로 보지만, 심의는 이를 유용한 확장으로만 남겼다. structure는 버전 및 변경 대상 연결로 원인을 좁히는 데 동의하면서도 구조 증거만으로는 심각도를 medium으로 보았으며, 실제 구성 선택·재현 실패의 영향도를 확정하려면 운영 증거가 더 필요하다고 판단했다.
- issue-003 (high): 회수·재투입 흐름을 BOM 자기포함으로 표현하면 비순환 제품구조 계약과 양립할 수 없으므로, BOM은 비순환 구조로 유지하고 해당 흐름은 별도 물질 흐름 관계로 분리해야 한다.
  - root cause: 재투입 물질 흐름을 BOM containment에서 분리하면 제품구조 불안정성과 비순환 규칙의 형식적 모순이 함께 사라진다.
  - materiality: 동일한 재투입 인스턴스가 자기포함 예외로는 허용되지만 보편적 비순환 규칙에는 실패한다. 이에 따라 PLM·MES 소비자마다 검증과 전개 방식이 달라지고 무한 전개나 잘못된 소요량 계산이 발생할 수 있어, 일관되게 검증 가능한 통합 BOM 기준이라는 목적이 훼손된다.
  - action: 먼저 BOM containment를 예외 없는 비순환 제품구조로 확정하고, 스크랩 회수·재투입을 별도의 공정 material-flow 관계로 분리해야 한다. 이어 각 흐름에 수량, 단위, 회수율 또는 수율, 종료 조건을 명시해 전개와 계산의 종료 및 해석을 일관되게 만들어야 한다. 적용 가능한 렌즈들은 이 원인과 조치 및 높은 심각도에 합의했으며 대상 온톨로지에서 즉시 수정해야 한다.
- issue-004 (high): AlternatePart의 endpoint 역할과 direction을 canonical association entity에 단일화하고, 직접 Part-to-Part alternate_of 간선은 그 관계의 파생 투영으로 제한해야 한다. 또한 대칭성 정의와 one_way 허용 중 어느 계약이 권위인지 명시적으로 결정해야 한다.
  - root cause: AlternatePart를 endpoint 역할과 direction의 단일 권위인 association entity로 연결하면 대체 의미 충돌과 관계 그래프 단절이 함께 해소된다.
  - materiality: 현재 모델에서는 PLM과 MES가 동일한 대체 관계를 서로 다른 방향으로 해석할 수 있고, 명시적 관계 그래프만 탐색하는 소비자는 direction과 endpoint 역할에 도달할 수도 없다. 이 때문에 승인되지 않은 역방향 대체, 허용된 대체의 거부, 잘못된 자재 투입 또는 생산 중단이 발생할 수 있어 공유 개념 기준이라는 목적이 약화된다.
  - action: 먼저 단방향 대체를 보존할지 결정해야 한다. 보존한다면 direction을 권위 필드로 삼아 대칭성 정의를 수정하고, 보존하지 않는다면 one_way와 역할 방향 구분을 제거해 양방향만 허용해야 한다. 그 계약에 맞춰 AlternatePart를 두 endpoint 역할과 direction을 소유하는 canonical association entity로 명시적으로 연결한 뒤, 직접 Part-to-Part 간선은 해당 관계에서 파생되는 투영으로 정의해야 한다.
  - unresolved disagreement: canonical association 연결과 direction·대칭성 계약의 정합화 필요성에는 합의했지만, one_way를 실제 계약으로 보존할지와 운영 영향에 따른 high·medium 심각도 평가는 미확정이다. 이를 닫으려면 단방향 대체 요구와 오허용·오거부의 발생 가능성 및 운영 영향 증거가 필요하다.
- issue-005 (high): ECO, Part revision, BOM, Routing이 권위 원본과 유효시점에 따른 하나의 제조 구성으로 연결되지 않아, 동기화 지연 중 ECO 효력과 MES 적용 리비전이 어긋나며 구 리비전 생산 위험이 발생한다.
  - root cause: ECO, Part revision, BOM 및 Routing을 원자적인 시점별 유효 구성으로 연결하면 배치 동기화 지연 중 구 리비전 생산을 방지할 수 있다.
  - materiality: ECO 효력일 이후 Part.rev 주간 배치 갱신 전 생산 오더가 생성되면 PLM과 MES가 동일 품목에 서로 다른 유효 리비전을 적용할 수 있다. 이는 잘못된 자재·공정 기준의 생산을 허용하여 ‘PLM/MES 통합에서 변경관리의 단일하고 실행 가능한 개념 기준 제공’이라는 목적을 직접 약화한다.
  - action: 먼저 온톨로지에 권위 원본, 유효시점, 적용되는 Part revision·BOM·Routing의 원자적 제조 구성, 불일치 상태와 허용되지 않는 결과를 명시해야 한다. 그 계약을 전제로 각 PLM/MES 경계의 운영정책이 불일치 시 생산을 차단하거나 권위 있는 as-of 구성을 선택하도록 선언하고 집행해야 한다. 의미 계약을 먼저 확정해야 소비자별 집행 규칙이 동일한 권위와 시점 기준을 사용한다.
  - unresolved disagreement: coverage 렌즈는 생산 차단 또는 as-of 선택 정책 자체도 온톨로지에 선언해야 한다는 입장을 유지한다. 최종 숙의는 온톨로지가 불일치 상태와 금지 결과를 명시하되 실제 차단·선택 집행은 PLM/MES 소비 운영정책의 책임으로 한정했다.
- issue-008 (high): 현재 모델에는 최소 제조 실행 사실과 적용 설계 버전을 연결하는 추적 구조가 없어, PLM의 설계 정의와 MES의 실제 생산 기록을 대조할 수 없다.
  - root cause: PLM/MES 통합 범위에 최소 실행 트랜잭션과 설계 정의 참조를 포함하면 실제 생산 사실과 설계 기준을 연결할 수 있다.
  - materiality: PLM/MES 통합 개념 기준은 어떤 제품이 어떤 BOM·Routing 개정, 부품, 공정 및 변경 기준으로 생산되었는지 추적할 수 있어야 한다. 이 연결이 없으면 변경 영향 분석, 불량 추적, 리콜 범위 산정과 생산 적합성 판정의 핵심 경로가 성립하지 않으므로 선언된 통합 목적이 실질적으로 약화된다.
  - action: 현재 대상에서 최소 실행 엔티티인 ProductionOrder 또는 WorkOrder, MaterialLot 또는 Serial, OperationExecution, MaterialConsumption, InspectionResult 및 Genealogy를 추가해야 한다. 먼저 각 실행 기록이 적용 BOM·Routing 버전과 ECO를 명시적으로 참조하도록 공통 추적 구조를 정의하고, 그 위에 실제 부품 소비, 공정 결과, 검사 결과와 산출물 계보를 연결해야 한다. 이 순서로 설계 기준 참조를 실행 기록의 기반으로 삼아야 이후 엔티티가 확장되어도 계보가 끊기지 않는다.
- issue-010 (high): 안정적인 Part 정체성과 시간별 PartRevision·BomRevision·RoutingRevision을 분리하고, ECO가 생성·대체하는 개정과 그 유효 조건을 명시해야 한다. 현재처럼 단일 rev/current_eco와 개정 없는 직접 참조를 사용하면 과거·현재·미래 제조 구성을 동시에 판정할 수 없다.
  - root cause: 안정적인 Part 정체성과 시점별 PartRevision·BomRevision·RoutingRevision을 분리하면 공존하는 개정의 적용 구성을 판정할 수 있다.
  - materiality: 둘 이상의 개정이 공존하거나 ECO 발효와 배치 동기화 사이에 시차가 생기면 생산 오더에 적용할 정확한 BOM과 라우팅을 기준 모델만으로 결정할 수 없다. 이는 PLM/MES 통합 개념 기준의 핵심인 변경 통제, 이력 연속성, 생산 추적성의 신뢰를 직접 약화하므로 중대한 현재 차단 문제다.
  - action: 먼저 Part를 변하지 않는 품목 식별자로 유지하고 PartRevision·BomRevision·RoutingRevision을 독립된 개정 객체로 도입해야 한다. 다음으로 각 개정에 valid_from/valid_to 등 명시적인 유효 조건을 부여하고, ECO가 생성하거나 대체하는 전후 개정 및 관련 BOM·라우팅 개정을 연결해야 한다. 마지막으로 현재 rev는 저장된 단일 권위값이 아니라 유효기간에서 계산되는 투영값으로 두어야 한다. 이 순서를 따라야 정체성, 개정 이력, 변경 전환의 권위가 먼저 확립되고 생산 오더가 시점별 유효 구성을 결정할 수 있다.
- issue-002 (medium): 확장 가능한 단위와 시점별 품목 환산 권위가 없어 BOM 수량과 제조 계획값을 결정적으로 계산·공유할 수 없으므로, 다음 단계 전에 단위 및 환산 모델을 확정해야 한다.
  - root cause: 확장 가능한 UnitOfMeasure와 유효기간이 있는 품목별 ConversionFactor를 도입하면 현재 수량 계산의 비결정성과 향후 단위 확장 실패가 함께 해소된다.
  - materiality: PLM과 MES가 동일한 숫자를 질량·개수·시간 중 어떤 물리량으로 해석해야 하는지, 어떤 시점의 환산계수를 적용해야 하는지 결정할 수 없다. 서로 다른 기본단위나 구매·재고·생산 단위를 사용하면 소요량, 스크랩 반영, 작업장 능력 및 투입량이 시스템마다 달라져 계획 오차와 대사 실패를 유발한다. 또한 새 단위 추가가 데이터 등록이 아니라 스키마와 소비자 검증 계약의 변경으로 이어져 지속적인 의미 공유라는 목적을 약화한다.
  - action: 다음 구현 단계 전에 모든 수량값을 확장 가능한 UnitOfMeasure 참조와 결합하고, 품목별 기준 단위와 유효기간을 가진 ConversionFactor를 모델링해야 한다. 변환에는 원본과 승인 정보를 포함해 적용 시점과 권위를 재현 가능하게 하고, scrap_rate에도 차원·범위·적용 기준을 정의해야 한다. 기존 ea/kg/m 값은 초기 단위 마스터 데이터로 이관하여 현재 계산의 결정성과 향후 단위 확장성을 함께 확보해야 한다.
- issue-006 (medium): 병행 관리되는 scrap rate와 표준시간의 권위·계보·유효시점이 정의되지 않고 수기 복사본이 권위값과 구분되지 않아, 시스템 간 충돌 값이 정상적인 운영값처럼 노출된다.
  - root cause: 운영값의 권위·계보·시간 유효성을 모델링하고 수기 복사본을 파생 투영으로 구분하면 시스템 간 값 불일치를 판정할 수 있다.
  - materiality: 원본 변경 후 다음 대사 전에 계획·원가 계산이 수행되면 동일 BOM과 라우팅의 소요량과 표준원가가 시스템별로 달라질 수 있다. 이는 PLM/MES 간 운영값에 신뢰 가능한 공통 의미를 제공한다는 목적을 직접 약화하며, 운영 판단과 대사 결과의 신뢰성도 낮춘다.
  - action: 다음 통합 소비 단계 전에 운영값에 원본, 버전, 유효기간, 소유 시스템, 단위를 부여하고 수기 복사본을 시점별 파생 투영으로 분리해야 한다. 이어 복사본의 신선도 한계, 충돌 우선순위, 대사 증거와 임계 초과 시 사용 차단 규칙을 정의해야 시스템 간 불일치를 판정하고 잘못된 계획·원가 계산을 예방할 수 있다.
- issue-007 (medium): 수량과 능력을 단위·차원 없는 숫자로 표현하고 환산 권위를 현장 판단에 맡기면 BOM 소요량과 작업장 능력의 계산 의미가 결정되지 않으므로, MES 계산 경로를 적용하기 전에 이 문제를 수정해야 한다.
  - root cause: 측정값을 단위가 결합된 typed measure로 만들고 환산 권위를 데이터로 관리하면 수량 및 능력 계산을 재현할 수 있다.
  - materiality: 서로 다른 단위의 품목이나 작업장을 포함한 계획에서는 같은 데이터에도 시스템 또는 담당자별 환산 결과가 달라질 수 있다. 이는 PLM/MES 통합이 제공해야 할 기계 해석 가능하고 재현 가능한 수량·능력 의미를 훼손하며, 계획 수량·자재 부족·능력 부하 계산의 신뢰성을 약화한다.
  - action: 수량과 능력을 값에 단위와 차원이 결합된 typed measure로 모델링하고, capacity에는 분모와 적용 시간 구간을 명시해야 한다. 품목별 환산계수와 유효기간을 버전 관리되는 권위 데이터로 추가하고, 유효한 환산 경로가 없으면 계산을 실패시켜야 한다. 이 기준은 MES의 계획·소요량·능력 계산 경로가 사용되기 전에 적용되어야 한다.
- issue-009 (medium): 병행 관리되는 scrap rate와 표준시간 값에 권위·동기화·조정 증거가 없어, 값이 충돌할 때 사용할 값을 일관되고 감사 가능하게 판정할 수 없다.
  - root cause: 병행 관리값에 권위·동기화 상태와 조정 증거를 모델링하면 충돌 시 사용할 값을 일관되게 판정할 수 있다.
  - materiality: 엑셀·MES·표준원가 시스템의 값이 다르면 계획·원가 계산 결과가 선택한 저장소에 따라 달라질 수 있고, 수동 조정의 근거와 책임도 추적할 수 없다. 이는 PLM/MES와 주변 장부 사이에서 동일 개념의 권위와 운영 일관성을 제공하려는 목적을 직접 약화한다.
  - action: 다음 단계 전에 각 관리값에 권위 원본, 소유자, 유효구간, synchronized_at 또는 source_version을 지정해야 한다. 이어 Reconciliation과 ManualAdjustment에 비교값, 차이, 행위자, 시각, 근거, 승인 및 해결 상태를 기록해 충돌 판정과 수동 조정의 감사 증거를 남겨야 한다. 적용 가능한 렌즈들은 이 조치와 medium 심각도에 합의했으며 별도 숙의는 필요하지 않았다.
- issue-011 (medium): Routing을 Operation 참조의 선형 목록으로만 모델링하면 대체·조건부·병렬·재작업 경로를 호환 가능하게 표현할 수 없다. RoutingStep과 명시적 StepTransition을 권위 구조로 도입하고, 단순 선형 경로는 그 그래프의 ordered projection으로 유지해야 한다.
  - root cause: RoutingStep과 명시적 StepTransition을 도입하면 분기·병렬·재작업을 스키마 변경 없이 표현할 수 있다.
  - materiality: 이 모델의 목적은 PLM과 MES가 공유할 수 있는 확장 가능한 라우팅 기준을 제공하는 것이다. 현재 구조에서는 비선형 경로가 필요할 때마다 스키마와 소비자 계약을 함께 변경하거나 ordered_list의 의미를 비표준적으로 확장해야 하므로, 통합 비용과 시스템 간 해석 불일치 위험이 커져 그 목적을 약화한다.
  - action: 다음 단계에서 RoutingStep과 조건을 포함한 StepTransition을 도입해 순서, 분기, 병렬 합류, 재작업 전이를 표현해야 한다. 전이 그래프를 권위 구조로 먼저 정의하고 기존 operations 목록은 단순 선형 그래프의 ordered projection으로 유지해야 기존 소비자 호환성과 향후 확장성을 함께 확보할 수 있다.
- issue-012 (medium): WorkCenter.capacity_per_shift가 값의 단위·측정 차원·적용 기간·대상을 구분하지 않아 작업장마다 다른 의미를 갖는다. WorkCenter가 명시적 의미를 가진 하나 이상의 CapacityProfile을 참조하도록 모델을 확장해야 한다.
  - root cause: Capacity를 값·측정 차원·기간·적용 대상으로 분리하면 작업장별 의미 변화와 확장 비용을 줄일 수 있다.
  - materiality: 서로 다른 용량 차원을 사용하는 작업장이나 품목별·기간별 계획을 통합하면 동일 필드를 공통 방식으로 비교하거나 해석할 수 없다. 그 결과 새 설비마다 예외 로직이나 병렬 필드가 필요해져, MES와 공유할 확장 가능한 제조 운영 기준이라는 목적이 약화된다.
  - action: WorkCenter가 하나 이상의 CapacityProfile을 참조하도록 하고, 각 프로필에 값, 명시적 단위와 측정 차원, 적용 기간 또는 교대, 적용 대상을 표현해야 한다. 기존 capacity_per_shift는 의미와 단위가 명확한 기본 프로필로 변환해야 하며, 구체적인 MES 계획 모델을 확장하기 전에 이 공통 구조를 마련해야 비교 가능성과 후속 확장성을 확보할 수 있다.
- issue-013 (medium): AlternatePart가 무조건 대칭이라고 정의되면서 direction은 one_way를 유효값이자 기본값으로 허용하므로, one_way 인스턴스의 역방향 대체가 동시에 참과 거짓이어야 하는 논리 모순이 발생한다.
  - root cause: 대체 관계를 방향성 관계로 정의하거나 대칭 관계로 제한하면 one_way 인스턴스의 논리 모순이 제거된다.
  - materiality: PLM과 MES가 같은 인스턴스를 서로 다르게 해석해 잘못된 자재 대체를 허용하거나 필요한 대체를 거부할 수 있으므로, 공유된 부품 대체 가능성 계약의 일관성과 정확성을 훼손한다.
  - action: 목표 계약에서 단방향 대체가 필수인지 먼저 확인한 뒤 하나의 권위를 선택해야 한다. 단방향 표현이 필요하면 direction을 권위로 하는 방향성 관계로 재정의하고 bidirectional을 양방향 간선의 축약으로 규정한다. 대칭성만 필요하면 one_way와 해당 기본값을 제거한다. 선택 후 정의, 허용값, 기본값이 동일한 규칙을 강제하는지 검증해야 한다.
  - unresolved disagreement: 원인과 모순 제거 필요성에는 합의했지만 해법과 심각도는 미확정이다. evolution은 표현력 보존을 위해 방향성 모델을 요구하고, logic과 semantics는 대칭 전용 모델도 유효하다고 본다. 또한 semantics만 운영 위험을 근거로 high를 주장한다. 확정에는 단방향 대체의 실제 계약 요구사항과 오대체·대체 거부의 빈도·영향·통제 실패 증거가 필요하다.
- issue-014 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 검사 규격 계획과 실제 검사 실행 단계를 동일한 실행 단위로 취급하게 하므로, PLM/MES 통합 전에 두 유형을 분리해야 한다.
  - root cause: InspectionPlan을 독립 규격으로 두고 실행 단계가 이를 참조하게 하면 계획과 실행의 의미를 분리할 수 있다.
  - materiality: 이 혼동은 검사 기준과 라우팅을 정확히 구분하려는 목적을 약화한다. InspectionPlan이 일반 Operation처럼 처리되면 재사용·개정되는 검사 기준이 특정 실행 단계와 결합되어 잘못된 라우팅 삽입, 표준시간 산정 또는 검사 기준 적용을 유발할 수 있다.
  - action: 다음 통합 단계 전에 InspectionPlan을 독립된 계획·규격 엔티티로 분리하고, 실행 가능한 InspectionOperation을 Operation의 하위 유형으로 두어 applicable_plan 또는 governed_by 관계로 계획을 참조하게 해야 한다. 이 조치는 검사 기준의 재사용·개정 주기와 라우팅 단계의 실행 주기를 분리하며, 심의에서 의미론 렌즈가 수용한 원인과 조치를 그대로 이행한다.
- issue-015 (medium): scrap_rate가 손실률과 수량 보정계수라는 서로 다른 계산 의미를 함께 허용해 PLM과 MES의 BOM 소요량 계산이 일치하지 않을 수 있다. 소요량 계산 구현 전에 권위 의미를 하나로 결정하고 계산 계약을 고정해야 한다.
  - root cause: scrap_rate를 손실률 또는 소요량 계수 중 하나로 한정하고 범위와 산식을 명시하면 시스템별 계산 해석 차이가 사라진다.
  - materiality: 소비 시스템이 같은 값을 손실 비율, 직접 승수 또는 수율 보정계수로 각각 해석하면 자재 소요량·구매량·생산계획 수량이 체계적으로 과대 또는 과소 계산된다. 이는 BOM 수량과 공정 손실을 PLM/MES에서 동일하게 계산한다는 목적을 직접 약화한다.
  - action: 다음 단계의 소요량 계산 구현 전에 권위 의미를 결정해야 한다. 손실률로 채택하면 scrap_rate를 0~1 범위로 제한하고 qty_per 적용 산식을 명시해야 한다. 수량 보정계수로 채택하면 scrap_factor라는 별도 개념으로 구분하고 범위·산식·적용 공정·권위 원천을 식별 가능한 참조로 정의해야 한다. 이 계약을 먼저 확정해야 PLM과 MES가 같은 계산을 수행할 수 있다.
- issue-016 (medium): WorkCenter의 처리량 용량과 교대당 가용 시간은 서로 다른 측정 차원이므로, 이를 무단위 capacity_per_shift 하나로 표현한 현재 모델은 MES의 능력 비교 기준으로 사용할 수 없다.
  - root cause: 처리량 용량과 시간 가용성을 별도 개념으로 분리하거나 capacity_kind와 uom을 필수화하면 용량 비교의 차원 오류가 제거된다.
  - materiality: 수량 기반 작업장과 시간 기반 작업장의 capacity_per_shift를 같은 값처럼 집계하거나 Operation 부하와 비교하면 단위상 성립하지 않는 계산이 된다. 그 결과 능력 계획과 병목 판정이 왜곡되어 생산 일정의 실행 가능성을 잘못 판단할 수 있으므로, 작업장 능력과 라우팅 부하를 일관되게 해석하려는 목적이 약화된다.
  - action: 다음 단계에서 MES가 이 개념을 소비하기 전에 throughput_capacity와 available_time_per_shift를 별도 개념으로 분리하거나, capacity 값에 필수 capacity_kind와 uom을 결합해야 한다. 또한 각 capacity_kind별로 어떤 부하와 어떤 단위의 산식으로 비교하는지 정의해야 한다. 심의는 이 조치를 수용했고, coverage 관점의 범위는 일반적인 UOM 공백 전체가 아니라 용량 종류와 단위의 누락으로 한정되었다.
- issue-017 (medium): issue-017은 별도 근본 원인이 아니라, 제품 구성 관계를 회수·재투입 흐름에 재사용한 상위 결함에서 발생한 의미적 하위 범위다. BOM 구성 수량과 공정 재투입량을 구분하지 않으면 제품구조 전개와 자재 소요 계산을 신뢰할 수 없으므로 대상 범위에서 즉시 폐쇄해야 한다.
  - root cause: 제품 구성 관계와 공정 중 회수·재투입 물질 흐름을 분리하면 BOM 전개와 재생 투입 의미를 각각 일관되게 유지할 수 있다.
  - materiality: PLM과 MES가 제품 구조와 제조 공정 흐름을 같은 기준으로 교환하려면 두 관계의 의미가 명확히 분리되어야 한다. 현재 모델은 스크랩 재투입 품목을 자기 포함 BOM으로 표현하므로, 소비자가 이를 무한 구성이나 순환 오류로 처리하거나 재투입량을 제품 구성 수량으로 오해해 계획 결과의 일관성과 신뢰성이 약화된다.
  - action: 상위 조치와 통합해 BOM을 비순환 제품구조로 유지하고, 스크랩 산출·회수·재투입은 Routing/Operation에 연결된 별도 물질 흐름으로 모델링해야 한다. 먼저 구성 관계와 공정 흐름의 권한을 분리한 뒤 material_output, recovery, recycle_input에 수량·단위·수율·투입 지점을 표현해야 BOM 전개와 재생 투입 계산을 각각 일관되게 수행할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: coverage는 행위자·근거·감사·취소·롤백까지 동일 근본 원인의 필수 범위로 보지만, 심의는 이를 유용한 확장으로만 남겼다. structure는 버전 및 변경 대상 연결로 원인을 좁히는 데 동의하면서도 구조 증거만으로는 심각도를 medium으로 보았으며, 실제 구성 선택·재현 실패의 영향도를 확정하려면 운영 증거가 더 필요하다고 판단했다.
- issue-004: canonical association 연결과 direction·대칭성 계약의 정합화 필요성에는 합의했지만, one_way를 실제 계약으로 보존할지와 운영 영향에 따른 high·medium 심각도 평가는 미확정이다. 이를 닫으려면 단방향 대체 요구와 오허용·오거부의 발생 가능성 및 운영 영향 증거가 필요하다.
- issue-005: coverage 렌즈는 생산 차단 또는 as-of 선택 정책 자체도 온톨로지에 선언해야 한다는 입장을 유지한다. 최종 숙의는 온톨로지가 불일치 상태와 금지 결과를 명시하되 실제 차단·선택 집행은 PLM/MES 소비 운영정책의 책임으로 한정했다.
- issue-013: 원인과 모순 제거 필요성에는 합의했지만 해법과 심각도는 미확정이다. evolution은 표현력 보존을 위해 방향성 모델을 요구하고, logic과 semantics는 대칭 전용 모델도 유효하다고 본다. 또한 semantics만 운영 위험을 근거로 high를 주장한다. 확정에는 단방향 대체의 실제 계약 요구사항과 오대체·대체 거부의 빈도·영향·통제 실패 증거가 필요하다.

## Deliberation Decision
- issue-001: narrowed
- issue-003: no-deliberation-needed
- issue-004: narrowed
- issue-005: narrowed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: unresolved-with-reason
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합에서 BOM·라우팅·변경 적용을 일관되게 판정하고 추적하는 개념 기준 제공 Source finding context: PLM/MES 통합의 개념 기준으로서 품목·BOM·라우팅·변경 적용을 일관되게 식별하고 추적하는 목적 Source finding context: 변경관리 개념의 정합성과 제조 변경 적용 위험을 통제하는 기준 문서 역할 Source finding context: PLM 변경 승인·효력과 MES 생산 개정 선택을 일관되게 연결하는 개념 기준 제공 Source finding context: Serve as a coherent PLM/MES conceptual baseline for BOM, routing, and engineering-change management.
- issue-003: PLM 제품구조와 MES 공정 흐름을 정합적으로 연결하고 일관되게 검증하는 BOM 기준 제공 Source finding context: PLM 제품구조와 MES 공정 흐름을 정합적으로 연결하는 안정된 BOM 개념 기준 Source finding context: PLM/MES 통합의 개념 기준으로서 BOM 무결성 규칙에 일관된 판정을 제공하는 목적
- issue-004: PLM/MES가 부품 대체 가능성과 방향 제약을 동일하게 해석할 수 있는 구조적 개념 기준 제공 Source finding context: 품목 대체 의미를 PLM/MES가 동일하게 해석할 수 있는 개념 기준 제공 Source finding context: Provide a structurally coherent conceptual baseline for PLM/MES item and substitute-part integration.
- issue-005: PLM/MES 통합에서 변경관리의 단일하고 실행 가능한 개념 기준 제공
- issue-008: PLM/MES 통합 개념 기준으로서 설계 정의와 제조 운영 사실을 연결하는 목적
- issue-010: 품목·BOM·라우팅·변경관리의 PLM/MES 통합 개념 기준 제공
- issue-002: PLM/MES 사이에서 BOM 소요량과 제조 계획값을 지속적으로 동일하게 해석하는 기준 제공 Source finding context: BOM 소요량과 라우팅/작업장 계획값을 PLM과 MES에서 동일하게 해석하는 목적 Source finding context: PLM/MES 사이에서 품목과 BOM 수량 의미를 지속적으로 공유하는 기준 제공
- issue-006: PLM/MES 간 BOM·라우팅 운영값의 신뢰 가능한 공통 의미 제공
- issue-007: PLM/MES 통합에서 BOM 수량과 제조 능력의 기계 해석 가능하고 재현 가능한 의미 제공
- issue-009: PLM/MES 및 주변 장부 간 동일 개념의 권위와 운영 일관성 제공 Source finding context: PLM/MES 및 주변 장부 간 동일 개념의 권위와 운영 일관성을 제공하는 목적
- issue-011: 라우팅 개념을 PLM/MES가 공유할 수 있는 확장 가능한 기준 제공
- issue-012: MES와 공유할 작업장 및 제조 운영 개념의 확장 가능한 기준 제공
- issue-013: PLM/MES가 공유할 부품 대체 가능성의 일관된 개념 계약
- issue-014: 라우팅과 검사 기준의 개념을 PLM/MES 사이에서 정확히 구분하는 기준 제공
- issue-015: BOM 수량과 공정 손실을 PLM/MES에서 동일하게 계산하는 개념 기준 제공
- issue-016: 작업장 능력과 라우팅 부하를 MES에서 일관되게 해석하는 개념 기준 제공
- issue-017: 제품 구조와 제조 공정 흐름을 PLM/MES가 동일한 개념으로 교환하는 기준 제공

## Final Review Result
17 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Part·BOM·Routing을 현재값과 목록으로, ECO를 단일 상태로만 표현해 승인·효력 시점에 적용할 제조 구성을 일관되게 선택하거나 과거 구성을 재현할 수 없다. 심각도 high의 즉시 수정 대상이다. Unresolved disagreement remains: coverage는 행위자·근거·감사·취소·롤백까지 동일 근본 원인의 필수 범위로 보지만, 심의는 이를 유용한 확장으로만 남겼다. structure는 버전 및 변경 대상 연결로 원인을 좁히는 데 동의하면서도 구조 증거만으로는 심각도를 medium으로 보았으며, 실제 구성 선택·재현 실패의 영향도를 확정하려면 운영 증거가 더 필요하다고 판단했다.

## Boundary Notes
- 외부 PLM/MES가 별도 구성 이력이나 ECO 감사 로그를 보유하는지는 현재 경계에서 확인되지 않았다.
- 행위자·근거·감사·취소·롤백 부재가 동일 실패 조건을 직접 유발하는지는 추가 lifecycle 증거가 필요하다.
- 실제 배치 지연 중 MES에 별도의 보완 통제가 존재하는지는 경계 내 증거로 확인되지 않았다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now, accept_risk
- issue-005 (high): fix_now
- issue-008 (high): fix_now
- issue-010 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-011 (medium): follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_now, accept_risk
- issue-014 (medium): fix_before_release, fix_now
- issue-015 (medium): fix_before_release, accept_risk
- issue-016 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
