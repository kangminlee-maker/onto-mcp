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
- issue-001 (high): ECO 효력일과 Part.rev 주간 동기화 사이에 생산 적용 리비전을 결정하고 구 리비전 오더를 차단하는 계약이 없어, 효력일 이후에도 구 리비전 생산이 가능하다.
  - root cause: 생산 적용 리비전의 시점별 권위와 오더 선택 규칙이 없고 지연 갱신되는 Part.rev 복제값에 의존한다.
  - materiality: 이 공백은 같은 시점의 PLM과 MES가 서로 다른 유효 리비전을 선택하게 하며, 변경 효력 준수와 구형 설계 생산 방지라는 PLM/MES 통합 기준의 핵심 목적을 직접 약화한다. 따라서 제조 안전 위험과 운영 신뢰 상실을 초래하는 중대한 현재 차단 이슈다.
  - action: 먼저 ECO 효력 시점별 유효 리비전과 해당 BOM·Routing을 원자적으로 식별하는 effective-from 권위 관계를 모델링해야 한다. 다음으로 생산 오더가 이 권위를 통해 적용 구성을 선택하도록 연결하고, 동기화 완료 전에는 오더 발행을 차단하되 명시적으로 승인된 예외만 허용해야 한다. Part.rev는 권위가 아닌 파생 캐시로 제한해야 효력일과 실행 리비전의 불일치를 제거할 수 있다.
- issue-002 (high): BOM 수량에 공통 측정 단위와 권위 있는 품목별 환산 기준이 없어 PLM의 설계 수량을 MES의 실행 수량으로 결정적으로 변환할 수 없다. 이는 현재 제조 투입 정확성을 막는 high 영향의 필수 조치 이슈다.
  - root cause: 수량의 측정 단위와 품목별 환산 권위를 모델링하지 않고 환산을 현장 재량에 맡겼다.
  - materiality: BOM 단위와 실행·재고 단위가 다른 경우 동일한 qty_per가 시스템이나 작업자마다 다르게 해석될 수 있다. 그 결과 자재 소요량과 생산 투입량뿐 아니라 스크랩 및 원가 계산까지 달라져, PLM/MES가 공유해야 할 수량 기준과 통합 운영의 실행 가능성이 훼손된다.
  - action: 먼저 BomLine 수량에 명시적 UOM을 연결하고, 이어서 품목별 허용 단위·기준 단위와 버전·효력일을 가진 권위 있는 환산 기준을 둬야 한다. 자동 계획과 투입은 해당 시점에 유효한 환산값을 사용해야 하며, 값이 없거나 유효하지 않으면 처리를 거부하고 승인된 예외를 추적해야 한다. 이 순서가 필요한 이유는 환산 통제가 단위가 명시된 수량을 전제로 하기 때문이다.
- issue-005 (high): BOM·Routing의 불변 구성 리비전과 확장 가능한 효과성 범위가 없어 ECO 전후의 시점별 구성과 공장·로트·일련번호·생산오더별 적용 구성을 판정할 수 없다.
  - root cause: 효과성을 독립적이고 확장 가능한 범위 개념으로 승격하지 않고 현재값과 ECO의 단일 날짜 속성으로 축약했다.
  - materiality: 이 결함은 PLM과 MES가 동일 품목에 서로 다른 BOM·공정을 적용해도 공통 기준으로 판별하거나 감사할 수 없게 한다. 과거 생산 재현, 미래 효력 계획, 다공장 단계적 전환에서도 시스템별 별도 규칙과 불일치가 발생하므로 선언된 통합·변경관리 목적을 직접 약화한다.
  - action: 현재 차단 결함으로서 대상 범위 안에서 반드시 해소해야 한다. 불변 BOM·Routing 구성 리비전을 도입해 각 구성 요소를 해당 리비전에 귀속시키고, ECO 변경항목이 대상 객체와 변경 전후 버전을 참조하도록 해야 한다. 이어 ECO와 분리된 ChangeEffectivity를 두어 날짜·공장·로트·일련번호·생산오더 범위를 확장 가능하게 표현하고 구성 리비전에 연결해야 한다. 구성 식별을 먼저 확립한 뒤 효과성 범위를 연결해야 적용 대상을 일관되게 판정할 수 있다.
- issue-006 (high): 생산 오더, 공정 실행, 적용 구성 리비전, 투입·산출 계보를 잇는 최소 실행 경계가 없어 PLM의 설계 정의와 MES의 실제 제조 이력을 연결할 수 없다.
  - root cause: 통합 범위가 제조 계획 정의에 편중되어 MES 실행·실적·자재 계보 영역을 포함하지 않았다.
  - materiality: 생산 오더가 생성된 뒤 실제 사용된 자재·공정·구성 리비전을 추적할 수 없으므로, PLM/MES 통합이 제공해야 할 오투입 및 잘못된 공정 사용의 탐지와 회수 범위 판단을 지원하지 못한다.
  - action: 현재 목표 범위에서 ProductionOrder와 OperationExecution을 정의하고, 적용 Part·BOM·Routing 리비전, 투입·산출 lot 또는 serial, 수량·단위, 실행 시각, 작업장 및 결과 상태를 연결해야 한다. 불량과 재작업은 실행 결과 또는 별도 사건으로 표현해야 하며, 우선 최소 추적 사슬을 완성한 뒤 필요한 MES 상세를 확장해야 한다.
- issue-007 (high): 핵심 객체를 현재 상태값으로만 모델링해 ECO 승인·적용의 감사 증거와 Part·Routing·ECO의 종결·취소·정정 이력을 보존할 수 없으며, 이는 즉시 보완해야 하는 high 영향의 lifecycle 통제 결함이다.
  - root cause: 핵심 객체의 lifecycle을 현재 상태 열거로만 표현하고 상태 전이 사건, 증거, 종결 및 사후 정정 이력을 모델링하지 않았다.
  - materiality: 승인된 변경의 행위자·시각·근거와 실제 적용 구성을 입증할 수 없고, 단종 품목·대체 라우팅·취소 또는 정정된 ECO의 유효성도 판별할 수 없다. 그 결과 PLM/MES가 무승인 또는 잘못 적용된 변경과 이미 종결된 제조 정의를 정상 상태로 해석할 수 있어 전 lifecycle 정합성과 변경 적용 통제가 약화된다.
  - action: 먼저 Part·Routing·ECO별 허용 상태 전이와 superseded·obsolete·discontinued·rejected·canceled 등 종결·무효화 상태를 정의해야 한다. 이어 actor, occurred_at, rationale 또는 evidence_ref, 변경 전후 revision과 affected configuration, outcome을 보존하는 승인·적용·정정 사건 모델을 만들고 ECO 상태 전이 및 실제 BOM·라우팅 변경과 연결해야 한다. 적용 후 correction 또는 superseding ECO 관계도 추가해 현재 유효 정의와 전체 감사 이력을 함께 판정할 수 있게 해야 한다.
- issue-010 (high): BOM과 Routing에 독립적인 불변 리비전과 유효기간이 없어 변경 전후 제조 구성을 연속적으로 보존하거나 특정 시점의 적용 구성을 결정적으로 재구성할 수 없는 high 영향의 현재 차단 이슈다.
  - root cause: 구성의 시간적 정체성을 Part의 단일 현재 rev와 ECO 포인터로 축약하고 BOM·Routing 자체의 버전 권위를 모델링하지 않았다.
  - materiality: PLM의 설계 기준선과 MES의 실제 생산 구성을 동일 기준으로 연결하려면 품목·BOM·Routing의 시점별 정체성이 보존되어야 한다. 현재 모델에서는 새 BOM 또는 Routing이 반영된 뒤 과거 released 구성을 식별하기 어려워 생산 이력, 재작업, 품질 추적, 단계적 전환과 변경관리의 신뢰성이 크게 약화된다.
  - action: PartRevision, BomRevision, RoutingRevision에 해당하는 불변 버전 권위를 도입하고 버전 간 참조와 유효기간 또는 effectivity를 명시해야 한다. 먼저 각 구성 버전의 정체성과 상호 참조를 정의한 뒤 시점별 적용 규칙을 연결하며, released 버전은 수정하지 않고 후속 버전을 생성하도록 수명주기 규칙을 적용해야 과거와 현재 구성을 모두 재구성할 수 있다.
- issue-013 (high): AlternatePart의 대칭 정의, direction 규칙, Part→Part 단축 관계가 서로 다른 권위처럼 작동하고 정규 AlternatePart 엔티티는 명시적 관계 그래프에서 고립되어 있다. 따라서 소비 경로에 따라 대체 방향과 관계 정체성이 달라지는 하나의 high 이슈이며, 목표 범위에서 즉시 해소해야 한다.
  - root cause: 대체 관계의 정규 권위를 정의·direction·Part 간 단축 관계에 분산해 의미 규칙과 그래프 연결을 일관되게 노출하지 않았다.
  - materiality: PLM과 MES가 정의와 관계 그래프를 서로 다르게 소비하면 한쪽은 대체를 상호 가능으로, 다른 쪽은 단방향으로 판단할 수 있다. 또한 단축 관계만 탐색하는 소비자는 direction과 관계 레코드 자체를 잃는다. 이는 공통 개념·관계 그래프라는 목적을 약화시키고, 허용되지 않은 역방향 자재 투입이나 유효한 대체 차단에 따른 생산 중단으로 이어질 수 있다.
  - action: AlternatePart를 primary와 alternate 역할 관계 및 필수 direction을 가진 유일한 정규 대체 관계로 먼저 명시적 관계 그래프에 연결해야 한다. 그다음 의미 규칙을 정리해 bidirectional일 때만 역관계가 성립하도록 하고, Part→Part alternate_of는 정규 AlternatePart에서 direction을 보존해 생성되는 파생 투영으로 제한해야 한다. 이 순서가 정규 권위를 먼저 단일화한 뒤 모든 소비 경로가 같은 방향 규칙을 따르게 한다.
- issue-014 (high): 도면 리비전과 생산 적용 제조 리비전을 단일 Part.rev로 표현하여, ECO 적용 시점과 Part.rev 갱신 시점이 어긋나는 구간에서 MES가 적용해야 할 제조 개정을 확정할 수 없다.
  - root cause: 도면 문서 개정과 품목·제조 개정을 Part.rev라는 단일 개념으로 결합했다.
  - materiality: 이 문제는 PLM 변경정보를 MES 생산 기준으로 일관되게 전달한다는 목적을 직접 약화한다. ECO 적용일 이후이지만 도면 관리대장 또는 주간 배치의 Part.rev 갱신 전인 생산분에서는 구개정 생산이나 추적성 불일치가 발생할 수 있으므로 high·material 및 fix-now 판단이 타당하다.
  - action: 먼저 도면 개정과 품목·제조 개정을 별도 개정 객체와 lifecycle로 분리해야 한다. 다음으로 ECO가 승인하는 개정을 명시하고, 생산 효과성 레코드가 날짜나 배치 갱신된 Part.rev가 아니라 적용 대상 제조 개정을 직접 참조하게 해야 한다. 마지막으로 MES의 적용 개정 판정이 이 명시적 효과성 경로를 사용하도록 연결해야 하며, 이 순서가 개정 권위를 먼저 확립한 뒤 소비 경로를 일관되게 만드는 데 필요하다.
- issue-019 (high): ECO 변경 경로가 Part에서 끝나 적용 대상 BOM·Routing 구성과 변경 전후 버전을 식별할 수 없으므로, 효력일 이후 MES가 올바른 제조 구성을 선택할 수 없는 중대한 구조적 결함이다.
  - root cause: 변경관리를 Part의 스칼라 rev와 일반 ECO→Part 관계에 한정해 구성별 변경 연결을 정의하지 않았다.
  - materiality: PLM의 변경 결과를 MES 실행 구성으로 일관되게 전달하는 것이 선언된 통합 목적의 핵심이다. 현재 구조에서는 변경된 구성을 온톨로지만으로 판별할 수 없어 구 BOM 또는 구 Routing으로 생산할 위험이 있으므로 그 목적이 직접 약화된다.
  - action: ECO를 변경 대상인 정확한 BOM·Routing 구성 및 적용 Part 리비전에 명시적으로 연결해야 한다. 우선 구성 버전과 효과성의 권위 있는 모델을 정의한 뒤 ECO의 변경 전후 경로를 그 모델에 연결해야 하며, 별도 버전 엔티티를 도입하지 않는 경우에도 최소한 BomLine·Routing의 버전 식별자와 ECO/effective_date 관계를 정의해야 한다.
- issue-003 (medium): scrap_rate와 누적 표준시간에 산식·단위·권위 원천·동기화 상태·불일치 소비 규칙이 없어, PLM·MES·계획·원가 시스템이 같은 제조 기준값을 서로 다르게 해석하거나 소비할 수 있다. 이는 다음 구현 단계 전에 닫아야 하는 공통 계산·권위 계약의 결함이다.
  - root cause: 파생 제조 기준값의 산식과 단일 권위·동기화 계약을 모델링하지 않고 복제 및 수기 대사를 정상 운영 방식으로 채택했다.
  - materiality: 원천값과 복제·수기값이 어긋나거나 scrap_rate를 불량률과 가산 승수로 다르게 해석하면 계획 소요량, 구매량, 생산 투입량과 원가 결과가 시스템별로 달라진다. 따라서 PLM/MES 통합의 목적인 제조 기준값과 BOM 수량 계산의 공통 의미, 결과 신뢰성, 추적 및 감사 가능성이 약화된다.
  - action: 다음 구현 단계 전에 scrap_rate와 누적 표준시간 각각에 대해 의미, 단위, 허용 범위, 적용 산식과 적용 수준, 단일 권위 원천 및 파생 규칙을 확정해야 한다. 복제값에는 provenance, 버전, 효력시점과 동기화 상태를 기록하고, 불일치 시 소비 차단 또는 승인된 예외 절차와 대사 주기를 정의해야 한다. 이 계약이 먼저 확정되어야 PLM·MES·계획·원가 시스템이 동일한 기준값과 계산 규칙을 구현할 수 있다.
- issue-008 (medium): 병행 관리되는 제조 기준값에 속성별 권위 시스템, provenance, 동기화 상태 및 불일치 처리 계약이 없어 PLM과 MES가 서로 다른 값을 보유할 때 기준값을 판정할 수 없다.
  - root cause: 외부 원본을 주석으로만 서술하고 속성별 데이터 권위와 대사를 모델 개념으로 만들지 않았다.
  - materiality: 복사·수기 입력값이 원본 또는 계산값과 달라지면 생산계획 소요량, 표준원가, 검사 판정이 시스템별로 달라질 수 있다. 그런데 어느 값을 적용해야 하는지 결정할 근거가 없으므로 PLM/MES 간 제조 기준값의 일관된 해석과 운영 위험 통제라는 목적이 약화된다.
  - action: 다음 단계 전에 속성별 권위 원천, 원천 레코드와 버전, 동기화 시각, 대사 상태 및 불일치 처리 규칙을 하나의 명시적 provenance·대사 계약으로 모델링해야 한다. 이 공통 기반을 먼저 확정해야 생산계획, 표준원가 및 검사 소비자가 동일한 기준값 선택 규칙을 적용하고 이후 원천 시스템이나 대사 방식의 변경도 안전하게 처리할 수 있다.
- issue-009 (medium): 수량·능력 값이 단위 차원 및 권위 있는 환산 기준과 연결되지 않고 UOM도 폐쇄형 열거로 제한되어, PLM과 MES가 현재 값을 일관되게 계산하거나 새로운 단위·복합 차원으로 확장하기 어렵다.
  - root cause: 측정 단위와 환산을 확장 가능한 기준정보 개념으로 분리하지 않고 폐쇄형 enum과 무단위 숫자로 표현했다.
  - materiality: 중량과 개수 단위가 혼재하거나 작업장 능력을 비교·계획할 때 시스템별 현장 환산이 개입하면 동일한 BOM 소요량과 생산능력이 서로 다르게 계산될 수 있다. 이는 PLM/MES 공통 해석이라는 목적을 약화하고 계획·실행 오류와 데이터 비교 불가능성을 초래한다.
  - action: 다음 단계 전에 식별자·측정 차원·기준단위를 가진 확장 가능한 UOM 기준정보와 품목, from/to 단위, 환산계수, 유효기간 및 권위 출처를 포함한 ConversionFactor를 도입해야 한다. 그 후 qty_per와 capacity_per_shift를 값·단위·기준 분모가 결합된 측정값으로 연결하여 PLM과 MES가 동일한 권위 데이터로 검증·환산하도록 해야 한다.
- issue-011 (medium): Routing의 정규 구조가 Operation의 단일 ordered_list에 고정되어 있어 선형 공정은 표현할 수 있지만 병렬, 조건 분기, 선택 경로, 합류 및 재작업 루프는 표현할 수 없다. 따라서 이는 다음 단계에서 해소해야 할 중간 수준의 진화성 결함이다.
  - root cause: 라우팅 순서 의미를 확장 가능한 전이 관계가 아니라 Operation의 단일 선형 목록에 부여했다.
  - materiality: 다양한 제조 공정 구조를 PLM과 MES가 공통 의미로 교환하려면 비선형 경로도 동일한 라우팅 기준으로 보존되어야 한다. 현재 구조에서는 새로운 라우팅 유형이 등장할 때마다 스키마와 연계 소비자를 다시 설계하거나 소비자별 예외 규칙을 추가해야 하므로 통합 기준의 확장성과 장기적 일관성이 약화된다.
  - action: Operation과 분리된 RoutingStep 및 StepTransition을 정규 구조로 도입하고, 전이에 순서·조건·분기·합류·재작업 의미를 명시해야 한다. 먼저 그래프형 전이 모델을 공통 의미의 권위 있는 구조로 정의한 뒤, 단순 선형 라우팅은 그 제한된 형태 또는 호환 투영으로 제공해야 기존 사용을 유지하면서 소비자가 동일한 경로 의미를 해석할 수 있다.
- issue-015 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 분류는 검사 명세와 검사 실행 단계를 혼동하므로, 실행 모델을 구축하기 전에 두 개념을 분리해야 한다.
  - root cause: 검사 행위와 그 행위를 규정하는 정보 객체를 동일한 존재론적 유형으로 분류했다.
  - materiality: InspectionPlan이 Operation 상속 규칙에 따라 라우팅 단계나 실행 대상으로 해석되면 계획 자체에 작업장 배정, 표준시간, 실행 추적 의미가 부여될 수 있다. 이는 PLM과 MES가 라우팅과 품질계획을 동일한 의미로 교환하려는 목적을 약화한다.
  - action: InspectionOperation을 Operation의 하위 유형으로 두고, InspectionPlan은 독립된 정보 객체로 분리한 뒤 InspectionOperation이 해당 계획을 참조하도록 해야 한다. 이 수정은 실행 모델의 라우팅·자원 배정·추적 규칙을 확장하기 전에 완료해야 계획 버전, 승인 및 실행 결과가 동일 상속 계층에서 충돌하는 것을 막을 수 있다.
- issue-017 (medium): 수량 처리능력과 가용시간을 하나의 무단위 capacity_per_shift로 표현하므로 작업장 능력을 일관되게 비교하거나 라우팅 부하와 대조할 수 없다.
  - root cause: 서로 차원이 다른 용량 측정값을 측정 차원과 단위가 없는 단일 capacity_per_shift 속성으로 추상화했다.
  - materiality: 작업장마다 capacity_per_shift가 개수/교대 또는 시간/교대로 해석될 수 있어, 이를 동일 단위로 집계하거나 std_time_min과 직접 대조하면 능력계획과 작업장 배정 결과가 숨은 관례에 따라 달라진다. 따라서 MES 능력과 라우팅 부하를 일관되게 해석하려는 목적과 운영 의사결정의 신뢰성이 약화된다.
  - action: 다음 단계 전에 능력값에 명시적인 측정 차원, UOM 및 교대 등 basis를 결합해야 한다. 의미와 계산 방식이 본질적으로 다른 경우에는 수량 처리능력과 가용시간을 별도 속성 또는 개념으로 분리해야 한다. 이후 단위와 basis가 호환되는 값만 비교·집계하고, std_time_min과의 부하 대조도 시간 차원으로 정규화된 능력에 한정해야 한다.
- issue-018 (medium): Part에 포괄 품목과 말단 부품의 의미를 동시에 부여하여, 하위 Part를 갖는 Assembly가 Part를 상속할 때 Part의 ‘최소 관리 단위’ 정의와 타입 계층이 충돌한다.
  - root cause: 포괄적 품목 개념과 말단 부품 개념을 Part라는 하나의 명칭과 정의에 결합했다.
  - materiality: PLM과 MES가 Part를 말단 부품 또는 모든 품목의 상위 타입으로 서로 다르게 해석할 수 있다. 그 결과 BOM 및 라우팅 대상의 타입 판정과 인터페이스 매핑이 불안정해지므로, 품목·조립품 타입을 공유하는 개념 기준의 신뢰성이 약화된다.
  - action: 다음 단계의 인터페이스 타입 계약 전에 이 문제를 닫아야 한다. Part를 구매·제조·식별되는 포괄적 품목 개념으로 재정의하고, 말단성은 LeafPart나 Component 같은 별도 하위 유형·역할 또는 명시적 속성으로 분리해야 한다. 이후 Assembly 상속과 BOM 대상 타입 규칙이 이 구분을 일관되게 따르는지 확인해야 한다.
  - unresolved disagreement: 렌즈 간 미해결 이견은 없다. 다만 ‘최소 관리 단위’가 분해 불가능한 말단이 아니라 식별·변경관리의 최소 단위를 뜻할 가능성은 문서상 정의되지 않아 남아 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-018: 렌즈 간 미해결 이견은 없다. 다만 ‘최소 관리 단위’가 분해 불가능한 말단이 아니라 식별·변경관리의 최소 단위를 뜻할 가능성은 문서상 정의되지 않아 남아 있다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-013: resolved
- issue-014: no-deliberation-needed
- issue-019: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 변경관리 개념 기준과 제조 운영 위험 통제
- issue-002: PLM/MES가 공유하는 품목·BOM 수량의 개념 기준과 제조 투입 정확성
- issue-005: PLM/MES 통합의 품목·BOM·라우팅 구성 및 변경 적용 범위 기준 Source finding context: PLM/MES 통합의 품목·BOM·라우팅 개념 기준 제공 Source finding context: PLM 변경 지시를 MES 생산 적용 범위로 일관되게 전달하는 변경관리 기준
- issue-006: PLM/MES 통합의 개념 기준 제공
- issue-007: 품목·라우팅·변경관리의 전 lifecycle 정합성과 PLM/MES 변경 적용 통제 Source finding context: 변경관리 개념의 정합성과 PLM/MES 변경 적용 통제 Source finding context: 품목·라우팅·변경관리의 전 lifecycle 개념 기준 제공
- issue-010: PLM/MES 통합에서 품목·BOM·라우팅 변경 전후 제조 구성을 동일 기준으로 식별하고 추적하는 목적 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅 변경 전후의 제조 구성을 동일한 기준으로 식별하고 추적하는 목적
- issue-013: 대체품 관계를 포함한 PLM/MES 공통 개념 및 관계 그래프 Source finding context: PLM/MES 통합을 위한 부품 대체 개념의 공통 기준 Source finding context: 대체품 관계를 포함한 PLM/MES 공통 개념 그래프 제공
- issue-014: PLM 변경정보를 MES 생산 기준으로 일관되게 전달하는 개념 계약
- issue-019: PLM/MES 통합을 위한 품목·BOM·라우팅·변경관리 개념 기준 제공
- issue-003: PLM/MES 통합에서 제조 기준값과 BOM 수량 계산의 공통 의미 및 추적 가능한 권위 Source finding context: PLM/MES 통합에서 운영 기준값의 공통 의미와 추적 가능한 권위 Source finding context: BOM 수량을 생산계획과 MES에서 동일하게 계산하는 의미 계약
- issue-008: PLM/MES 간 제조 기준값의 일관된 해석과 운영 위험 통제
- issue-009: BOM 수량, 자재 소요 및 제조 능력의 PLM/MES 공통 해석 Source finding context: BOM 수량과 제조 능력의 PLM/MES 공통 해석 Source finding context: PLM 품목 수량과 MES 자재소요·설비용량을 일관된 단위로 교환하는 통합 기준
- issue-011: 다양한 제조 공정 구조를 PLM과 MES가 공통 의미로 교환하는 라우팅 기준
- issue-015: 라우팅과 품질계획을 PLM/MES 간 동일 의미로 교환하는 기준
- issue-017: MES 작업장 능력과 라우팅 부하를 일관되게 해석하는 개념 기준
- issue-018: 품목과 조립품 타입을 공유하는 PLM/MES 개념 기준

## Final Review Result
16 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO 효력일과 Part.rev 주간 동기화 사이에 생산 적용 리비전을 결정하고 구 리비전 오더를 차단하는 계약이 없어, 효력일 이후에도 구 리비전 생산이 가능하다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 생산 오더 시스템에 별도 차단 장치가 존재하는지는 허용된 증거 범위에서 확인되지 않았으나, 개념 기준 문서의 계약 누락은 확인된다.
- 특정 품목의 실제 환산 규칙과 오차 허용치는 이 검토 경계의 증거만으로 확정할 수 없다.
- 실제 도면 개정과 품목·제조 개정이 항상 일치하는지는 경계 내 자료로 확인할 수 없으며, 현재 모델에는 그 동일성 조건도 선언되어 있지 않다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-010 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now
- issue-019 (high): fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-011 (medium): follow_up
- issue-015 (medium): fix_before_release, fix_now
- issue-017 (medium): fix_before_release, fix_now
- issue-018 (medium): fix_before_release, fix_now

## Recommendations
- issue-016 (high): 스크랩 재투입을 BOM 자기포함으로 표현해 제품구조와 공정 물질흐름의 관계 의미를 혼합했다. Source finding context: BOM 비순환 규칙의 스크랩 재투입 예외 Source finding context: manufacturing-bom-ontology.yaml > integrity_rules[0], entities.BomLine.definition Source finding context: 제품 구성 관계인 BOM 자기포함으로 공정의 스크랩 재투입 흐름을 표현해 서로 다른 관계 의미를 혼합했다. Source finding context: 제품 구조와 공정 중 발생하는 회수·재투입 흐름은 의미가 다르다. 같은 관계를 사용하면 BOM 전개 소비자가 자기포함을 구성으로 해석하고, 공정 소비자는 일반 BOM 라인을 회수 흐름으로 오인할 수 있다. Source finding context: BOM은 비순환 제품 구조로 유지하고, 스크랩 발생·회수·재투입은 Routing/Operation에 연결된 별도의 material-flow 또는 byproduct/rework 관계로 모델링한다. Source finding context: .onto/review/20260717-aa03f0e2/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: PLM 제품구조와 MES 공정 자재흐름의 공통 개념 기준 Source finding context: BOM 전개·소요량 계산기가 스크랩 재투입 자기참조를 일반 구성 관계로 처리할 때 Source finding context: 무한 전개, 중복 소요량 또는 잘못된 자재계획으로 이어질 수 있다. Source finding context: 제품 구성과 공정 자재순환을 동일한 BomLine 관계로 표현했다. Source finding context: 스크랩 재투입이 Assembly의 자기 하위 포함으로 모델링된다. Source finding context: 제품 구조 관계에 공정 자재흐름 의미를 부여한 결과다.
- issue-004 (medium): 스크랩 재투입 예외가 BOM 비순환 불변조건을 무력화하지만 일반 BOM과 구분할 관계나 종료 조건이 없다. Source finding context: manufacturing-bom-ontology.yaml — BOM 비순환 원칙과 스크랩 재투입 예외 Source finding context: Value authority: .onto/review/20260717-aa03f0e2/execution-preparation/review-value-alignment-criteria.yaml:6-18, criterion user-request-intent — “BOM…개념의 정합성과 제조 운영 위험”; target: materialized-input.md:23-35,93-95 — BOM은 비순환이어야 하지만 스크랩 재투입은 Assembly 자기 포함으로 모델링 Source finding context: [tradeoff][misaligned] 회수 공정을 기존 BOM 구조에 억지로 수용하는 국소 단순화가 비순환 BOM이라는 운영 안전 약속을 무력화한다. Source finding context: 일반 BOM 전개와 계획 계산이 의존하는 비순환 약속을 깨면서도 재투입 흐름을 구별할 경계를 제공하지 않는다. 모델 수를 줄이는 편의가 무한 전개 방지와 명확한 자재 흐름이라는 전체 목적보다 우선된 상태다. Source finding context: 생산 BOM의 비순환 원칙은 유지하고, 스크랩 발생·회수·재투입을 별도의 material-flow 또는 by-product/rework 관계로 분리한다. 회수율, 적용 공정, 시간 경계와 종료 조건을 명시해 일반 BOM 전개에서 제외한다. Source finding context: .onto/review/20260717-aa03f0e2/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 정합적인 BOM 개념 기준과 안전한 자재 소요량 전개 Source finding context: 스크랩 재투입을 자기참조 BomLine으로 표현한 BOM을 일반 전개·원가·계획 로직이 소비하는 경우 Source finding context: 비순환 검증을 우회하거나 무한/중복 전개를 유발해 BOM 기준의 신뢰성과 제조 계획의 실행 가능성을 약화한다. Source finding context: 공정 물질흐름인 스크랩 회수를 제품구조인 BOM 포함 관계로 재사용해 서로 다른 목적의 개념 경계를 합쳤다. Source finding context: BOM은 비순환이어야 한다는 운영 불변조건이 선언되어 있다. Source finding context: 스크랩 재투입은 Assembly 자기 포함이라는 순환 BOM으로 모델링하도록 같은 규칙이 예외를 둔다. Source finding context: 재투입을 일반 BOM과 구분할 별도 관계나 종료 조건이 없어 비순환 불변조건을 결정적으로 적용할 수 없다.
- issue-012 (medium): AlternatePart의 무조건 대칭 정의와 허용된 one_way 값이 논리적으로 양립하지 않는다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart definition and direction attribute Source finding context: .onto/review/20260717-aa03f0e2/execution-preparation/materialized-input.md:37-45 Source finding context: fail — AlternatePart is declared symmetric while the same entity permits one-way substitution, so a one_way instance cannot satisfy both claims. Source finding context: For any AlternatePart instance whose direction is one_way, the definition obligates the reverse substitution while the selected direction denotes that only one direction applies. PLM and MES consumers can therefore derive incompatible valid substitution sets from the same record, weakening this ontology as their shared conceptual contract. Source finding context: Choose one canonical model: either remove one_way and define AlternatePart as always symmetric, or revise the definition to make symmetry conditional on direction=bidirectional and explicitly define the effective edge for direction=one_way. Source finding context: .onto/review/20260717-aa03f0e2/round1/logic.findings.yaml#logic-candidate-001 Source finding context: Provide a logically consistent shared concept standard for PLM/MES part substitution behavior. Source finding context: An AlternatePart record uses the explicitly permitted one_way value. Source finding context: The same valid record requires and rejects the reverse substitution depending on which declaration a consumer follows, making substitution decisions non-interoperable. Source finding context: The symmetric substitution invariant was retained while an asymmetric direction mode was added to the same concept without conditioning the invariant. Source finding context: A one_way AlternatePart instance cannot simultaneously satisfy the unconditional reciprocal-substitution definition and its selected direction. Source finding context: The contradiction is caused by defining reciprocity unconditionally while permitting one_way as a valid, default direction.

## Unique Finding Tagging
- issue-016 (high): 스크랩 재투입을 BOM 자기포함으로 표현해 제품구조와 공정 물질흐름의 관계 의미를 혼합했다. Source finding context: BOM 비순환 규칙의 스크랩 재투입 예외 Source finding context: manufacturing-bom-ontology.yaml > integrity_rules[0], entities.BomLine.definition Source finding context: 제품 구성 관계인 BOM 자기포함으로 공정의 스크랩 재투입 흐름을 표현해 서로 다른 관계 의미를 혼합했다. Source finding context: 제품 구조와 공정 중 발생하는 회수·재투입 흐름은 의미가 다르다. 같은 관계를 사용하면 BOM 전개 소비자가 자기포함을 구성으로 해석하고, 공정 소비자는 일반 BOM 라인을 회수 흐름으로 오인할 수 있다. Source finding context: BOM은 비순환 제품 구조로 유지하고, 스크랩 발생·회수·재투입은 Routing/Operation에 연결된 별도의 material-flow 또는 byproduct/rework 관계로 모델링한다. Source finding context: .onto/review/20260717-aa03f0e2/round1/semantics.findings.yaml#semantics-candidate-004 Source finding context: PLM 제품구조와 MES 공정 자재흐름의 공통 개념 기준 Source finding context: BOM 전개·소요량 계산기가 스크랩 재투입 자기참조를 일반 구성 관계로 처리할 때 Source finding context: 무한 전개, 중복 소요량 또는 잘못된 자재계획으로 이어질 수 있다. Source finding context: 제품 구성과 공정 자재순환을 동일한 BomLine 관계로 표현했다. Source finding context: 스크랩 재투입이 Assembly의 자기 하위 포함으로 모델링된다. Source finding context: 제품 구조 관계에 공정 자재흐름 의미를 부여한 결과다.
- issue-004 (medium): 스크랩 재투입 예외가 BOM 비순환 불변조건을 무력화하지만 일반 BOM과 구분할 관계나 종료 조건이 없다. Source finding context: manufacturing-bom-ontology.yaml — BOM 비순환 원칙과 스크랩 재투입 예외 Source finding context: Value authority: .onto/review/20260717-aa03f0e2/execution-preparation/review-value-alignment-criteria.yaml:6-18, criterion user-request-intent — “BOM…개념의 정합성과 제조 운영 위험”; target: materialized-input.md:23-35,93-95 — BOM은 비순환이어야 하지만 스크랩 재투입은 Assembly 자기 포함으로 모델링 Source finding context: [tradeoff][misaligned] 회수 공정을 기존 BOM 구조에 억지로 수용하는 국소 단순화가 비순환 BOM이라는 운영 안전 약속을 무력화한다. Source finding context: 일반 BOM 전개와 계획 계산이 의존하는 비순환 약속을 깨면서도 재투입 흐름을 구별할 경계를 제공하지 않는다. 모델 수를 줄이는 편의가 무한 전개 방지와 명확한 자재 흐름이라는 전체 목적보다 우선된 상태다. Source finding context: 생산 BOM의 비순환 원칙은 유지하고, 스크랩 발생·회수·재투입을 별도의 material-flow 또는 by-product/rework 관계로 분리한다. 회수율, 적용 공정, 시간 경계와 종료 조건을 명시해 일반 BOM 전개에서 제외한다. Source finding context: .onto/review/20260717-aa03f0e2/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 정합적인 BOM 개념 기준과 안전한 자재 소요량 전개 Source finding context: 스크랩 재투입을 자기참조 BomLine으로 표현한 BOM을 일반 전개·원가·계획 로직이 소비하는 경우 Source finding context: 비순환 검증을 우회하거나 무한/중복 전개를 유발해 BOM 기준의 신뢰성과 제조 계획의 실행 가능성을 약화한다. Source finding context: 공정 물질흐름인 스크랩 회수를 제품구조인 BOM 포함 관계로 재사용해 서로 다른 목적의 개념 경계를 합쳤다. Source finding context: BOM은 비순환이어야 한다는 운영 불변조건이 선언되어 있다. Source finding context: 스크랩 재투입은 Assembly 자기 포함이라는 순환 BOM으로 모델링하도록 같은 규칙이 예외를 둔다. Source finding context: 재투입을 일반 BOM과 구분할 별도 관계나 종료 조건이 없어 비순환 불변조건을 결정적으로 적용할 수 없다.
- issue-012 (medium): AlternatePart의 무조건 대칭 정의와 허용된 one_way 값이 논리적으로 양립하지 않는다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart definition and direction attribute Source finding context: .onto/review/20260717-aa03f0e2/execution-preparation/materialized-input.md:37-45 Source finding context: fail — AlternatePart is declared symmetric while the same entity permits one-way substitution, so a one_way instance cannot satisfy both claims. Source finding context: For any AlternatePart instance whose direction is one_way, the definition obligates the reverse substitution while the selected direction denotes that only one direction applies. PLM and MES consumers can therefore derive incompatible valid substitution sets from the same record, weakening this ontology as their shared conceptual contract. Source finding context: Choose one canonical model: either remove one_way and define AlternatePart as always symmetric, or revise the definition to make symmetry conditional on direction=bidirectional and explicitly define the effective edge for direction=one_way. Source finding context: .onto/review/20260717-aa03f0e2/round1/logic.findings.yaml#logic-candidate-001 Source finding context: Provide a logically consistent shared concept standard for PLM/MES part substitution behavior. Source finding context: An AlternatePart record uses the explicitly permitted one_way value. Source finding context: The same valid record requires and rejects the reverse substitution depending on which declaration a consumer follows, making substitution decisions non-interoperable. Source finding context: The symmetric substitution invariant was retained while an asymmetric direction mode was added to the same concept without conditioning the invariant. Source finding context: A one_way AlternatePart instance cannot simultaneously satisfy the unconditional reciprocal-substitution definition and its selected direction. Source finding context: The contradiction is caused by defining reciprocity unconditionally while permitting one_way as a valid, default direction.

## Shared Phenomenon Summary
- none
