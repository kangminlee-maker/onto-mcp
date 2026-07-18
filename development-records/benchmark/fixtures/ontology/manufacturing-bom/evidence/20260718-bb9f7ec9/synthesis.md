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
- issue-001 (high): ECO 발효 후 적용할 결과 리비전을 권위 있게 식별하는 연결과 Part.rev의 신선도 계약이 없어, 생산 적용 리비전을 폐쇄적으로 결정하거나 MES에 일관되게 노출할 수 없다.
  - root cause: ECO가 결과 리비전을 권위 있게 식별하지 못하고 Part.rev가 지연 투영으로 남아 있어, 발효 후 적용 리비전을 닫힌 경로로 결정할 수 없다.
  - materiality: 이 결함은 ECO 발효 뒤 신규 리비전 사용을 요구하면서도 MES의 Part.rev에는 주간 동기화 전까지 구 리비전이 남을 수 있게 한다. 그 결과 생산 릴리스가 오래된 설계 데이터를 선택하거나 구·신 리비전을 혼용할 수 있으므로, 신뢰 가능한 PLM/MES 품목·변경관리 기준을 제공한다는 선언 목적을 직접 약화한다.
  - action: 먼저 ECO를 승인·적용된 결과 리비전에 명시적으로 연결하고, 생산오더의 리비전 선택이 그 권위를 기준으로 결정되도록 해야 한다. 이어 Part.rev를 권위값이 아닌 파생 투영으로 정의하고 신선도 상태, 우선순위, 동기화 실패 시 차단 또는 실패 처리를 규정해야 한다. 결과 리비전 권위를 먼저 확립해야 Part.rev 투영과 릴리스 차단 규칙을 일관되게 구현할 수 있다.
- issue-002 (high): 통합 중요 값의 복사·대사·환산이 권위와 감사 증거를 갖춘 사건으로 모델링되지 않아, 값의 출처·신선도·변환 결과와 변경 책임을 신뢰성 있게 검증할 수 없다.
  - root cause: 복사·대사·환산 같은 수동 통합 행위를 권위와 감사 증거를 가진 일급 개념으로 모델링하지 않고 운영 관행과 메모로 남겼다.
  - materiality: 원천 값 변경이나 대사 지연, 단위 환산이 발생하면 PLM·MES·계획·원가 시스템이 동일한 품목·BOM·라우팅에서 서로 다른 수량·용량·원가를 산출할 수 있다. 또한 행위자·시각·근거·전후값이 남지 않아 불일치 발생 시 승인된 변경과 비인가 변경을 구분하기 어렵다. 따라서 제조 운영 위험을 통제하는 신뢰 가능한 공통 개념 기준이라는 선언 목적을 직접 약화한다.
  - action: 각 통합 중요 값에 단일 권위 원천, provenance, 단위, 효력 기간, 신선도와 누락·만료 시 거부 동작을 먼저 정의해야 한다. 이어 scrap_rate 복사와 누적 표준시간 입력을 파생 또는 동기화된 투영으로 바꾸고, 품목별 적용 범위와 검증된 계수를 가진 UOM 변환 개념을 마련해야 한다. 복사·대사·환산과 ECO 승인은 actor, occurred_at, reason, source system·record/version, before/after value를 보존하는 감사 가능한 사건으로 연결해야 한다. 이 조치는 현재 차단 요인이므로 목표 범위에서 즉시 닫아야 한다.
- issue-003 (high): Part·BOM·Routing·ECO를 잇는 버전화된 구성 기준선과 effectivity 모델이 없어, 특정 시점에 유효한 BOM과 라우팅을 결정하거나 과거 생산 구성을 재구성할 수 없다.
  - root cause: Part·BOM·Routing·ECO를 하나의 버전화된 구성 기준선과 effectivity 모델로 묶는 개념이 부재하다.
  - materiality: PLM/MES 통합은 변경 적용 전후와 시스템 간 동기화 지연 중에도 특정 생산 시점의 제품 구조와 공정을 일관되게 판정해야 한다. 현재 모델로는 생산 기준선과 변경 적용 증거를 재구성할 수 없어 오구성 생산, 감사 실패, 시스템 간 분쟁 가능성이 생기므로 선언된 시점별 개념 기준 제공 목적을 중대하게 약화한다.
  - action: 현재 차단 이슈로서 불변 Part·BOM·Routing revision 또는 이를 묶는 통합 ConfigurationBaseline을 도입해야 한다. 각 기준선에 선후 버전과 ECO 적용 결과를 연결하고 날짜·로트·일련번호 등 필요한 effectivity를 명시해, 먼저 특정 시점의 유효 구성을 결정할 단일 기준을 세운 뒤 PLM/MES가 동일한 기준선을 조회·재구성하도록 해야 한다.
- issue-004 (high): scrap_rate와 누적 표준시간 등 병행 관리 값에 공통 권위·파생·동기화·충돌 해결 계약이 없어, PLM·MES와 연계 시스템이 복수 값 중 권위 있는 사실을 일관되게 선택할 수 없다. 이는 수동 통합의 감사 문제와 구별되는 독립적인 현재 차단 결함이다.
  - root cause: 병행 관리 속성에 적용할 공통 데이터 권위·파생·동기화 계약이 부재하다.
  - materiality: 복사본·계산값·수기값이 다르거나 동기화가 지연될 때 생산계획과 원가 계산이 서로 다른 값을 선택할 수 있다. 그 결과 계획량, 불량 여유와 표준원가가 시스템별로 달라지고 자동 대사로도 정답을 판정할 수 없어, 시스템 간 단일 개념 기준을 제공하려는 목적이 훼손된다.
  - action: 먼저 각 병행 관리 속성에 authoritative_system, derived_from, synchronization_direction, freshness/SLA, reconciliation_rule을 지정하는 공통 계약을 확정해야 한다. 다음으로 파생값은 권위 있는 원천 Routing 버전에서 계산되는 내부 투영으로 제한하고 수기 사본의 권위를 낮춘 뒤, 생산계획·원가 계산 소비자가 이 계약에 따라 값을 선택하도록 연결해야 한다. 이 순서가 필요한 이유는 권위와 충돌 규칙이 확정되기 전에 소비자 로직을 구현하면 시스템별 임의 선택이 다시 고착되기 때문이다.
- issue-006 (high): 계획 BOM·라우팅·ECO 기준선과 생산오더, 공정 실행, 자재 소비, 생산 산출, Lot/Serial 추적 사이의 최소 MES 실행 브리지가 없어 실제 생산이 어떤 계획·변경 기준으로 수행되었는지 표현할 수 없다.
  - root cause: 온톨로지의 범위가 제조 계획 마스터에 머물러 있고 MES 실행을 연결하는 최소 경계 개념이 부재하다.
  - materiality: PLM/MES 통합의 개념 기준 문서는 released 라우팅에서 생성된 생산오더와 실제 투입·공정·산출 및 변경 적용 결과를 연결해야 한다. 현재 모델은 이 핵심 계약을 제공하지 않아 통합 구현과 제조 추적성의 기준 역할을 수행하지 못하므로 material한 high 이슈다.
  - action: 현재 대상에서 반드시 닫아야 한다. 먼저 계획 기준선에 연결되는 ProductionOrder를 정의하고, 이어 OperationExecution, MaterialConsumption, ProductionOutput 및 Lot/Serial을 실제 투입·공정·산출 관계로 연결해 최소 실행 브리지를 완성해야 한다. 실행 영역을 의도적으로 제외한다면 대안으로 문서의 선언 목적과 경계를 제조 계획 마스터 기준으로 명시적으로 축소해야 한다.
- issue-008 (high): 현재 모델은 변경 이력을 Part의 단일 현재 상태로 축약하므로, 연속 ECO·미래 유효 변경·동기화 지연이 발생하면 생산 시점별 유효 BOM과 Routing을 선택하거나 재현할 수 없다.
  - root cause: 변경 대상을 불변 버전과 유효성 관계로 모델링하지 않고 Part의 단일 현재 상태로 축약했다.
  - materiality: PLM/MES 통합 기준은 생산 시점에 적용할 구성과 공정을 일관되게 결정하고 과거 기준을 재현할 수 있어야 한다. 이 모델로는 그 기준이 보존되지 않아 제조 정확성, 감사 가능성, 통합 문서에 대한 운영 신뢰가 크게 약화되므로 material한 high 이슈다.
  - action: 먼저 PartRevision을 불변 엔티티로 분리하고, 이어 BOM·Routing revision을 해당 PartRevision에 연결해야 한다. 각 revision에 effectivity 구간을 부여하고 ECO가 변경 전후 revision 및 적용 관계를 명시하도록 한 뒤, Part의 현재 버전은 이력과 기준 시점에서 계산되는 투영값으로 전환해야 한다. 이 조치는 시점별 구성 선택과 이력 재현을 가능하게 하므로 목표 범위에서 반드시 함께 종결해야 한다.
- issue-012 (high): InspectionPlan을 Operation으로 상속하고 Part–Routing 관계를 manufactured_by로 명명한 현재 모델은 계획·명세 객체를 실행 단계·제조 행위자처럼 해석하게 하므로, PLM 명세와 MES 실행 역할을 일관되게 구분할 수 없다.
  - root cause: 계획·명세 정보 객체와 실제 실행 행위 또는 행위자를 존재론적 유형과 관계명에서 분리하지 않았다.
  - materiality: 이 혼동은 검사 계획과 공정 실행의 수명주기·버전·책임을 뒤섞고, Routing 명세를 실제 제조 수행이나 생산 이력으로 오인하게 한다. 그 결과 PLM/MES 통합 매핑과 추적성 해석이 달라져 공통 개념 기준이라는 목적을 직접 약화하므로 high 심각도의 현재 차단 문제다.
  - action: 먼저 InspectionPlan을 독립적인 계획·명세 엔티티로 분리하고, 실제 검사 단계가 필요하면 InspectionOperation을 Operation의 하위 유형으로 둔다. 다음으로 계획과 실행 단계를 specifies 또는 governs로 연결한다. Part–Routing 관계는 has_routing이나 manufactured_according_to처럼 명세 관계임을 드러내도록 바꾸고, 실제 제조 수행·설비 책임·생산 이력은 생산 오더나 공정 실행 및 WorkCenter를 별도 관계로 모델링해야 한다. 이 순서로 개념 경계를 먼저 확립해야 후속 PLM/MES 매핑이 같은 의미 구분을 따를 수 있다.
- issue-013 (high): AlternatePart는 대칭적 상호 대체와 방향성 있는 대체 허용을 하나의 관계로 혼합하고, relations 그래프도 해당 엔티티를 우회해 direction을 잃는다. 따라서 PLM/MES가 대체 가능성을 일관되고 방향 보존적으로 해석할 수 없는 현재 차단 이슈다.
  - root cause: 방향성 있는 대체 허용과 대칭적인 상호 대체를 하나의 canonical relation으로 정규화하지 못해 엔티티 의미 충돌과 그래프 방향 정보 손실이 함께 발생한다.
  - materiality: 동일한 대체 관계가 정의상 양방향이면서 direction 속성상 단방향일 수 있고, 그래프 교환 시에는 방향 자체가 누락될 수 있다. 소비 시스템별 해석 차이로 승인되지 않은 역방향 대체가 허용되거나 유효한 대체가 누락되어 제조 투입 적합성 판정의 신뢰가 직접 약화된다.
  - action: 먼저 대체 허용의 방향 역할을 from_part/to_part처럼 명확히 한 방향 보존 canonical relation을 확정해야 한다. 상호 대체는 역방향 관계를 함께 생성하거나 명시적 bidirectional 규칙으로 표현한다. 그다음 relations에 Part→AlternatePart와 AlternatePart→Part 경로를 연결해 direction과 관계 레코드를 추적 가능하게 하고, 기존 Part→Part shortcut은 이 canonical 경로에서 파생되는 projection으로만 정의해야 한다.
- issue-005 (medium): Routing과 ECO의 lifecycle이 정상 진행 상태에만 머물러 있어, 발행 이후 단종·거절·취소·정정·대체가 발생하면 유효하지 않은 라우팅이나 변경지시가 현 상태로 남아 생산에 적용될 수 있다.
  - root cause: Routing과 ECO lifecycle이 정상 진행 경로까지만 모델링되고 종료·예외·정정 전이가 정의되지 않았다.
  - materiality: PLM과 MES가 동일한 상태를 일관되게 해석하려면 객체의 현재 유효성과 필요한 후속 조치를 상태 및 이력으로 판정할 수 있어야 한다. 종료·예외·정정 상태가 없으면 폐기된 공정이나 잘못된 변경을 정상 객체와 구분할 수 없고, 삭제나 상태 덮어쓰기는 변경 이력을 손실시켜 신뢰 가능한 변경 통제를 약화한다.
  - action: 다음 단계에서 PLM/MES가 이 상태들을 소비하기 전에 Routing과 ECO 각각의 실제 lifecycle을 보완해야 한다. Routing에는 obsolete·superseded, ECO에는 rejected·cancelled·superseded 같은 종료·예외 상태를 정의하고, 각 허용 전이와 정정 ECO가 원 ECO를 대체하거나 취소하는 관계를 명시해야 한다. 이를 통해 현재 유효성을 판정하면서도 원래 상태와 변경 이력을 보존할 수 있다.
- issue-009 (medium): 폐쇄형 단위 열거형과 무차원 용량 필드는 새 단위나 용량 차원을 수용할 때 스키마 변경 또는 수동 환산을 요구하므로, 다음 단계 전에 공통 측정 모델로 교체해야 한다.
  - root cause: 측정값의 값·단위·차원·변환 규칙을 분리한 확장 가능한 측정 개념이 없다.
  - materiality: 이 구조에서는 ea·kg·m 이외의 단위, 서로 다른 용량 차원, 외부 PLM/MES의 단위 체계를 통합할 때마다 특례가 필요하다. 그 결과 동일한 수치의 의미가 시스템별로 달라지고 반복적인 스키마 변경과 수동 환산이 발생해, 다양한 품목과 작업장 데이터를 확장 가능한 공통 개념으로 교환하려는 목적과 생산계획의 신뢰성이 약화된다.
  - action: 다음 단계로 진행하기 전에 UnitOfMeasure와 Quantity를 독립 개념으로 도입하고, 측정 종류·차원·단위 코드·값·기준 단위 변환 규칙과 환산 권위를 명시해야 한다. WorkCenter 용량도 quantity, 시간 구간, 산정 기준을 분리한 뒤 동일한 측정 메커니즘을 사용하도록 정렬해야 신규 단위와 설비 유형을 스키마 특례 없이 확장할 수 있다.
- issue-010 (medium): 제품 구성과 순환 물질 흐름을 하나의 BomLine으로 결합한 탓에, 직접 자기 재투입을 넘어서는 순환 제조 시나리오마다 BOM 검증과 전개 로직에 예외가 누적된다.
  - root cause: 제품 구성 관계와 공정 물질 흐름을 하나의 BomLine 관계로 합쳐 순환성을 특례로 처리했다.
  - materiality: 이 결합은 회수·재작업·부산물·다단계 순환을 일관되게 확장하지 못하게 하며, 핵심 BOM 규칙의 반복 수정과 시스템별 해석 분기를 초래한다. 따라서 BOM과 공정 개념을 제조 운영 전반의 확장 가능한 기준으로 제공하려는 목적을 약화한다.
  - action: 다음 단계 전에 제품 구성 BOM을 비순환 관계로 확정하고, 회수·스크랩·재투입은 별도의 MaterialFlow 또는 RecoveryFlow로 분리해야 한다. 새 흐름 관계에는 흐름 유형, 투입·산출 품목, 관련 공정, 수율 및 적용 조건을 명시해 순환 시나리오가 늘어나도 핵심 BOM 무결성 규칙과 전개 소비자를 수정하지 않도록 해야 한다.
- issue-011 (medium): AlternatePart에 보편적 대칭성과 one_way 허용·기본값을 함께 부여한 계약은 논리적으로 양립할 수 없으며, 현재 심각도 medium의 material 이슈로서 대상 범위에서 즉시 수정해야 한다.
  - root cause: 대체 가능성의 대칭성에 대해 보편적 정의와 방향성 상태 모델이 서로 양립하지 않는 계약을 부여했다.
  - materiality: direction=one_way 인스턴스가 생성되거나 기본값이 적용되면 PLM은 단방향 대체로, MES는 보편적 대칭 정의에 따라 양방향 대체로 해석할 수 있다. 이로 인해 서로 다른 자재 선택과 제조 판단이 발생할 수 있어, PLM/MES 통합을 위한 일관된 대체부품 개념 기준이라는 목적이 약화된다.
  - action: 대체 관계의 단일 방향 계약을 먼저 선택해야 한다. 양방향만 지원한다면 direction을 제거하거나 bidirectional로 고정하고, 단방향도 필요하다면 direction 값에 따라 대칭성 규칙이 달라지는 조건부 계약으로 정의해야 한다. 이후 PLM과 MES가 동일한 방향 규칙을 소비하도록 검증해야 한다.
  - unresolved disagreement: 근본 원인과 수정 필요성에는 합의했지만 심각도는 미해결 상태다. logic·coverage·structure는 핵심 제조 경로의 실제 차단이 입증되지 않아 medium을 유지하고, axiology·semantics는 자재 선택 영향을 근거로 상향을 주장한다. high 확정에는 one_way가 승인되지 않은 역방향 대체 또는 상이한 자재 선택을 실제로 유발하며 기존 통제로 차단되지 않는다는 운영 증거가 필요하다.
- issue-014 (medium): BomLine.scrap_rate는 폐기 비율과 수량 보정계수 중 어느 의미인지, 값의 범위와 qty_per 적용 산식이 무엇인지 결정되지 않아 PLM과 MES가 동일한 BOM 소요량을 계산할 수 없는 독립적인 수치 계약 결함이다.
  - root cause: 비율과 수량 보정계수라는 서로 다른 수치 개념을 하나의 이름과 자유로운 number 값에 중첩했다.
  - materiality: 5% 손실을 폐기율 0.05, 단순 보정계수 1.05, 수율 역산계수 약 1.0526으로 해석할 수 있으므로 소비 시스템별 계산 결과가 달라질 수 있다. 이는 구매·생산 소요량과 계획 수량을 체계적으로 어긋나게 하여 BOM 소요량을 PLM/MES 간 동일한 의미로 교환하려는 목적을 직접 약화한다.
  - action: 릴리스 전에 업무 권위자와 원본 의미를 확인해 scrap fraction 또는 quantity multiplier 중 하나를 정규 의미로 선택해야 한다. 선택 결과에 맞춰 속성명을 정렬하고 단위, 허용 범위, qty_per 적용 산식 및 외부 원본 값의 정규화 규칙을 명시해야 PLM과 MES가 같은 계산 계약을 사용할 수 있다.
- issue-016 (medium): Part.current_eco는 시간상 최신 ECO와 승인·효력 발생·적용된 ECO를 하나의 ‘current’로 혼합해 생산에 적용할 현재 설계 상태를 고유하게 결정하지 못한다. 이 문제는 issue-001과 공유하는 변경 상태 권위·선정·신선도 계약 안에서 반드시 해소해야 하는 독립적인 하위 결함이다.
  - root cause: 변경 문서의 시간상 최신성, 승인 상태, 효력 발생 및 적용 완료를 하나의 current 참조로 축약했다.
  - materiality: 열린 최신 ECO와 실제로 승인·적용되어 효력이 발생한 ECO가 다르거나 Part.rev의 주간 배치 갱신이 지연되면, PLM과 MES가 서로 다른 변경 문서와 설계 상태를 현재값으로 선택할 수 있다. 따라서 PLM 변경관리와 MES 생산 적용 상태에 일관된 기준을 제공하려는 목적이 약화되고, 생산에 잘못된 revision 또는 effectivity가 적용될 수 있다.
  - action: latest_eco와 effective_eco 등 상태별 참조를 분리하거나, 상태·효력일·revision에 따른 명시적인 선정 규칙을 정의해야 한다. 현재 설계 상태는 적용된 revision/effectivity에서 계산되는 투영값으로 두고, 그 원천 권위와 갱신 신선도도 함께 명시해야 한다. 이 수정은 issue-001과 공유하는 변경 상태 권위·선정·신선도 계약에 먼저 정렬한 뒤 Part의 선정 경로에 구체화해야 하며, 그래야 별도 규칙 간 충돌을 피하고 PLM과 MES가 동일한 생산 적용 상태를 선택할 수 있다.
- issue-017 (medium): released Routing에서 생산 실행 대상으로 이어지는 검증 경로가 끊겨 있어, 생산 오더가 어떤 released Routing에 근거하는지 표현하거나 추적할 수 없다. 내부 ProductionOrder 관계를 모델링하거나 동등한 외부 MES 계약을 명시해야 한다.
  - root cause: 무결성 규칙에서 생산 오더를 도입했지만 해당 개념이나 외부 경계 연결을 선언하지 않았다.
  - materiality: 이 결함은 라우팅 릴리스와 MES 생산 실행 사이의 통합 개념 기준을 약화한다. 생산 오더 생성 가능 여부와 사용 Routing을 관계로 검증해야 할 때 실행 객체의 근거를 확인할 수 없으므로, 완전성과 추적성이 확보되지 않는다.
  - action: 다음 단계 전에 권위 있는 실행 경계를 결정하고 닫아야 한다. 내부 경계를 택하면 ProductionOrder 엔티티와 Part/Routing 참조 및 released Routing 제약을 모델링한다. 외부 경계를 택하면 책임 시스템, 안정적 식별자, 버전, Part/Routing 참조를 포함한 MES 계약으로 규칙을 연결한다. 어느 경로든 실제 생성 가능성과 Routing 사용 근거를 검증할 수 있어야 한다.
  - unresolved disagreement: 내부 ProductionOrder 모델과 외부 MES 계약 중 어느 방식을 권위 있는 실행 경계로 채택할지 미결정이다. 또한 axiology·coverage는 issue-006의 표면으로 통합해야 한다고 보지만, structure·semantics·evolution은 명시적 same-root 근거가 없어 issue-017의 독립 추적을 유지한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-011: 근본 원인과 수정 필요성에는 합의했지만 심각도는 미해결 상태다. logic·coverage·structure는 핵심 제조 경로의 실제 차단이 입증되지 않아 medium을 유지하고, axiology·semantics는 자재 선택 영향을 근거로 상향을 주장한다. high 확정에는 one_way가 승인되지 않은 역방향 대체 또는 상이한 자재 선택을 실제로 유발하며 기존 통제로 차단되지 않는다는 운영 증거가 필요하다.
- issue-017: 내부 ProductionOrder 모델과 외부 MES 계약 중 어느 방식을 권위 있는 실행 경계로 채택할지 미결정이다. 또한 axiology·coverage는 issue-006의 표면으로 통합해야 한다고 보지만, structure·semantics·evolution은 명시적 same-root 근거가 없어 issue-017의 독립 추적을 유지한다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: resolved
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: unresolved-with-reason
- issue-014: no-deliberation-needed
- issue-016: resolved
- issue-017: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM 설계변경을 MES 생산 적용 기준으로 연결하는 일관된 품목·리비전 변경관리 계약 Source finding context: Serve as a conceptually consistent PLM/MES integration reference for item and engineering-change control. Source finding context: PLM 설계변경을 MES 생산 적용 기준으로 연결하는 변경관리 개념 계약
- issue-002: PLM/MES 공통 개념 기준에서 제조 운영 값과 변경 통제를 신뢰 가능하게 유지하는 목적 Source finding context: Provide a common PLM/MES conceptual basis that controls manufacturing operational risk. Source finding context: 변경관리와 제조 운영 통제에 신뢰 가능한 통합 기준을 제공하는 목적
- issue-003: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 시점별 개념 기준 제공 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 개념 기준을 제공하는 목적
- issue-004: PLM/MES 및 연계 시스템 사이에서 공유할 단일 개념 기준 제공
- issue-006: PLM/MES 통합의 개념 기준 문서 역할
- issue-008: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준 제공 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준을 제공하는 목적
- issue-012: PLM 공정·검사 명세와 MES 제조 실행을 구분하는 공통 개념 기준 제공 Source finding context: PLM/MES 통합에서 공정과 검사 계획의 공통 개념 기준 제공 Source finding context: PLM의 공정 명세와 MES의 제조 실행을 구분하는 공통 개념 기준 제공
- issue-013: PLM/MES 통합용 대체품 관계의 단일하고 방향 보존적인 개념 기준 Source finding context: PLM/MES가 공유하는 부품 대체 가능성의 일관된 해석 Source finding context: PLM/MES 통합용 대체품 관계의 단일 개념 기준
- issue-005: 라우팅과 변경관리 상태를 PLM/MES가 일관되게 해석하도록 하는 개념 기준
- issue-009: 다양한 PLM/MES 품목과 작업장 데이터를 확장 가능한 공통 개념으로 교환하는 목적
- issue-010: BOM과 공정 개념을 제조 운영 전반에 확장 가능한 기준으로 제공하는 목적
- issue-011: PLM/MES 통합을 위한 대체부품 관계의 일관된 개념 기준 Source finding context: PLM/MES 통합을 위한 품목 및 대체부품 관계의 일관된 개념 기준
- issue-014: BOM 소요량을 PLM/MES 간 동일한 의미로 교환하는 목적
- issue-016: PLM 변경관리와 MES 생산 적용 상태의 일관된 기준 제공
- issue-017: 라우팅 릴리스와 MES 생산 실행 사이의 통합 개념 기준

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO 발효 후 적용할 결과 리비전을 권위 있게 식별하는 연결과 Part.rev의 신선도 계약이 없어, 생산 적용 리비전을 폐쇄적으로 결정하거나 MES에 일관되게 노출할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 결과 리비전을 문자열 속성으로 둘지 독립 PartRevision 엔티티로 모델링할지는 현재 경계의 증거만으로 결정되지 않는다.
- 외부 생산오더 서비스가 별도로 ECO 적용성을 해석하는지는 확인되지 않았으므로 이 개념 참조의 보완책으로 인정할 수 없다.
- 실제 불일치 빈도와 재무·생산 영향 규모는 경계 내 증거로 확정할 수 없지만, 불일치를 가능하게 하는 모델 조건은 확인된다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now, follow_up
- issue-012 (high): fix_now
- issue-013 (high): fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_now
- issue-014 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_before_release, accept_risk

## Recommendations
- issue-007 (medium): 혼합 단위 BOM을 정규화할 품목별 환산계수와 적용 범위가 없다. Source finding context: 품목별 단위 변환 Source finding context: materialized-input.md:14-20, 29-35, 98-100 Source finding context: 혼합 단위 BOM을 정규화할 품목별 환산계수와 그 적용 범위가 없다. Source finding context: 중량·개수·길이가 섞인 BOM에서 요구량, 소비량과 재고를 결정적으로 변환할 수 없다. 현장별 임의 환산은 생산계획 및 실적 대사의 불일치를 만든다. Source finding context: PartUnitConversion을 추가해 part_ref, from_uom, to_uom, factor, rounding_rule, effective interval 및 권위 시스템을 정의하고 BomLine과 생산 실적이 해당 변환 버전을 참조하도록 한다. Source finding context: .onto/review/20260718-bb9f7ec9/round1/coverage.findings.yaml#coverage-candidate-006 Source finding context: 품목과 BOM 수량을 PLM/MES가 동일하게 해석하도록 하는 개념 기준 Source finding context: 상·하위 품목 또는 계획·실적이 서로 다른 단위를 사용해 수량 변환이 필요한 경우 Source finding context: 소요량과 소비량을 재현 가능하게 계산할 수 없어 자재 부족, 과다 투입 및 재고 대사 오류가 발생할 수 있다. Source finding context: 단위 변환을 품목별 관리 개념으로 승격하지 않고 현장 행위에 맡겼다. Source finding context: 혼합 단위 수량을 온톨로지 규칙만으로 정규화할 수 없다. Source finding context: 품목별 변환계수와 적용 규칙이 없으며 환산을 현장에서 수행한다고 명시한다.
- issue-015 (medium): 처리 수량과 가용 시간이라는 차원이 다른 측정치를 하나의 capacity_per_shift 속성으로 혼합한다. Source finding context: WorkCenter.capacity_per_shift 속성 Source finding context: materialized-input.md — entities.WorkCenter.attributes.capacity_per_shift Source finding context: 처리 수량과 가용 시간이라는 차원이 다른 측정치를 하나의 `capacity_per_shift` 의미로 혼합한다. Source finding context: 개수/교대는 처리량이고 시간/교대는 가용시간이다. 두 값은 이름이 같아도 직접 비교·합산할 수 없으며, 용량 산정에 필요한 처리율이나 표준시간과의 관계도 다르다. Source finding context: `available_time_per_shift`와 `throughput_quantity_per_shift`를 구분하거나, 측정값에 명시적 quantity kind와 UOM을 부여한다. 처리량은 대상 품목/공정 조건도 함께 명시한다. Source finding context: .onto/review/20260718-bb9f7ec9/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: MES 라우팅과 작업장 용량의 공통 의미 제공 Source finding context: 개수 기반 작업장과 시간 기반 작업장을 동일 capacity 필드로 스케줄링하거나 비교할 때 Source finding context: 용량 계산의 차원 일관성이 깨져 작업장 부하와 생산 가능량을 잘못 해석할 수 있다. Source finding context: 처리량과 가용시간을 ‘capacity’라는 다의적 상위 용어 하나로 모델링했다. Source finding context: capacity_per_shift가 개수와 시간 중 어느 단위도 가질 수 있다. Source finding context: 개수와 시간은 서로 다른 물리적 차원과 계산 의미를 가진다.

## Unique Finding Tagging
- issue-007 (medium): 혼합 단위 BOM을 정규화할 품목별 환산계수와 적용 범위가 없다. Source finding context: 품목별 단위 변환 Source finding context: materialized-input.md:14-20, 29-35, 98-100 Source finding context: 혼합 단위 BOM을 정규화할 품목별 환산계수와 그 적용 범위가 없다. Source finding context: 중량·개수·길이가 섞인 BOM에서 요구량, 소비량과 재고를 결정적으로 변환할 수 없다. 현장별 임의 환산은 생산계획 및 실적 대사의 불일치를 만든다. Source finding context: PartUnitConversion을 추가해 part_ref, from_uom, to_uom, factor, rounding_rule, effective interval 및 권위 시스템을 정의하고 BomLine과 생산 실적이 해당 변환 버전을 참조하도록 한다. Source finding context: .onto/review/20260718-bb9f7ec9/round1/coverage.findings.yaml#coverage-candidate-006 Source finding context: 품목과 BOM 수량을 PLM/MES가 동일하게 해석하도록 하는 개념 기준 Source finding context: 상·하위 품목 또는 계획·실적이 서로 다른 단위를 사용해 수량 변환이 필요한 경우 Source finding context: 소요량과 소비량을 재현 가능하게 계산할 수 없어 자재 부족, 과다 투입 및 재고 대사 오류가 발생할 수 있다. Source finding context: 단위 변환을 품목별 관리 개념으로 승격하지 않고 현장 행위에 맡겼다. Source finding context: 혼합 단위 수량을 온톨로지 규칙만으로 정규화할 수 없다. Source finding context: 품목별 변환계수와 적용 규칙이 없으며 환산을 현장에서 수행한다고 명시한다.
- issue-015 (medium): 처리 수량과 가용 시간이라는 차원이 다른 측정치를 하나의 capacity_per_shift 속성으로 혼합한다. Source finding context: WorkCenter.capacity_per_shift 속성 Source finding context: materialized-input.md — entities.WorkCenter.attributes.capacity_per_shift Source finding context: 처리 수량과 가용 시간이라는 차원이 다른 측정치를 하나의 `capacity_per_shift` 의미로 혼합한다. Source finding context: 개수/교대는 처리량이고 시간/교대는 가용시간이다. 두 값은 이름이 같아도 직접 비교·합산할 수 없으며, 용량 산정에 필요한 처리율이나 표준시간과의 관계도 다르다. Source finding context: `available_time_per_shift`와 `throughput_quantity_per_shift`를 구분하거나, 측정값에 명시적 quantity kind와 UOM을 부여한다. 처리량은 대상 품목/공정 조건도 함께 명시한다. Source finding context: .onto/review/20260718-bb9f7ec9/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: MES 라우팅과 작업장 용량의 공통 의미 제공 Source finding context: 개수 기반 작업장과 시간 기반 작업장을 동일 capacity 필드로 스케줄링하거나 비교할 때 Source finding context: 용량 계산의 차원 일관성이 깨져 작업장 부하와 생산 가능량을 잘못 해석할 수 있다. Source finding context: 처리량과 가용시간을 ‘capacity’라는 다의적 상위 용어 하나로 모델링했다. Source finding context: capacity_per_shift가 개수와 시간 중 어느 단위도 가질 수 있다. Source finding context: 개수와 시간은 서로 다른 물리적 차원과 계산 의미를 가진다.

## Shared Phenomenon Summary
- none
