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
- issue-001 (high): ECO 발효와 Part 리비전 가시성 사이의 지연 구간에 단일 적용 판정이나 생산 차단 계약이 없어, MES가 발효 후에도 구 리비전으로 생산할 수 있는 중대한 변경관리 공백이 존재한다.
  - root cause: 변경 발효 권위와 통합 노출 상태가 분리되어 있으면서 동기화 전 안전한 판정·차단 계약이 없다.
  - materiality: 이 공백은 발효된 설계변경과 실제 생산 지시를 불일치시켜 구 리비전 생산, 추적성 손실, 재작업을 초래할 수 있다. 따라서 PLM/MES 통합에서 일관된 생산 기준을 제공하고 제조 운영 위험을 통제한다는 문서의 선언 목적을 직접 약화한다.
  - action: 먼저 ECO 적용 시점의 권위 값을 단일화한 뒤, 생산 오더가 effective_date, ECO 상태, 적용 리비전을 하나의 판정으로 확인하도록 모델링해야 한다. 배치 동기화가 불가피하면 동기화 완료 전 오더를 차단하거나 발효 시점의 명시적 적용 스냅샷을 사용하도록 계약에 포함해야 한다. 이 조치는 통합 기준으로 사용하기 전에 완료되어야 한다.
- issue-003 (high): 단위 없는 수량과 현장 임의 환산을 허용하는 현재 모델은 자재 소요량과 생산능력 계산을 불결정적으로 만드는 high 이슈이며, 목표 산출물에서 반드시 수정해야 한다.
  - root cause: 수량의 숫자 값만 모델링하고 단위 차원 및 환산 권위를 공통 개념 계약에서 제외했다.
  - materiality: PLM과 MES가 kg 기반 BOM 소요량을 ea 기반 계획으로 바꾸거나 서로 다른 작업장 능력을 비교·합산할 때 단위 차원과 환산 근거를 판정할 수 없다. 그 결과 동일한 데이터가 해석자마다 다르게 계산되어 과소투입, 과대계획, 일정 오류로 이어질 수 있으므로, 품목·라우팅 데이터를 일관된 의미로 공유하고 제조 운영 위험을 줄이려는 목적을 직접 훼손한다.
  - action: 먼저 공통 수량 계약을 value와 uom의 결합으로 정의하고, capacity_per_shift에 측정 단위와 명시적인 시간 기준을 부여해야 한다. 그다음 품목별 환산계수에 변환 방향, 유효기간, 적용 조건, 권위 출처를 포함하고, 차원이 다른 변환은 검증 없이는 허용하지 않아야 한다. 이 공통 계약을 먼저 확정한 뒤 BOM 소요량과 생산능력 소비 경로에 적용해야 각 시스템이 같은 기준으로 계산하고 검증할 수 있다.
- issue-006 (high): BOM과 Routing이 버전·효력 기반 릴리스 구성으로 모델링되지 않아, ECO 적용 시점의 유효 구성을 선택하거나 과거 생산 구성을 재구성할 수 없는 high 이슈다.
  - root cause: BOM과 라우팅이 시간에 따라 변하는 릴리스 구성 대신 현재 상태의 참조 목록으로만 모델링되어 있다.
  - materiality: 이 개념 문서의 목적은 PLM/MES 통합에서 생산 시점에 적용할 품목·BOM·라우팅 기준을 제공하는 것이다. 그러나 ECO 적용 전후나 주간 동기화 지연 중에 MES가 신규·구 구성을 판별할 수 없으므로 실행 기준, 사후 추적, 변경 영향 검증의 신뢰성이 모두 약화된다.
  - action: 먼저 BOM과 Routing의 릴리스 버전 및 유효기간을 명시하고, 각 릴리스 버전을 해당 ECO와 연결해야 한다. 이어 릴리스된 BOM 라인과 공정 순서를 불변 스냅샷으로 보존하고, 기준 시점으로 유효 구성을 조회할 수 있게 해야 한다. 이 순서가 필요한 이유는 안정적인 버전·효력 권위가 먼저 있어야 ECO 연결과 과거 구성 재현이 동일한 기준을 사용할 수 있기 때문이다.
- issue-007 (high): PLM/MES 전체 통합 범위를 유지하는 한, 생산오더 이후의 실행·소비·산출·부적합·계보 개념 부재는 선언된 통합 범위를 닫지 못하는 high 완결성 결함이다.
  - root cause: PLM/MES 전체 통합을 선언했지만 모델의 개념 범위를 제조 기준정보에 한정해 생산 실행·실적·계보 축을 포함하지 않았다.
  - materiality: 실제 생산의 자재·공정·산출물을 적용 BOM 및 Routing 버전과 연결할 수 없어 PLM 변경의 제조 영향 분석, 현장 계보 추적, 실제 대비 표준 검증에 필요한 공통 의미를 제공하지 못한다.
  - action: 먼저 문서의 권위 있는 범위를 결정해야 한다. 역할을 제조 기준정보 온톨로지로 명시적으로 축소하거나, PLM/MES 전체 통합을 유지한다면 ProductionOrder, OperationExecution, MaterialConsumption, ProducedLot, Nonconformance를 추가하고 각각 적용 BOM·Routing 버전과 연결해야 한다. 범위 결정이 선행되어야 필요한 모델 확장과 검증 기준이 확정된다.
  - unresolved disagreement: logic과 structure 렌즈는 ProductionOrder 및 Routing 경로의 부재는 직접 확인했지만 실행·소비·산출·부적합·계보 전 범주가 필수라는 점은 명시적 규칙·관계 증거가 더 필요하다고 범위를 좁혔다.
- issue-010 (high): 시간에 따라 변하는 BOM·Routing 구성과 변경 통제를 현재 상태 필드로만 표현해, 변경 전후의 유효 구성을 선택·재현하고 승인 근거를 감사할 수 없는 high 수명주기 모델링 결함이다.
  - root cause: 시간에 따라 변하는 제조 정의와 통제 행위를 버전·전이·이벤트가 아닌 현재 상태 필드로만 축약했다.
  - materiality: ECO 이후 MES가 생산 시점에 유효했던 PLM의 BOM·Routing을 판정할 공통 버전 키와 계보가 없으므로 잘못된 자재나 공정을 적용하거나 과거 생산 오더의 설계 기준을 잃을 수 있다. 또한 승인·적용·대체·정정의 주체, 시각, 근거와 전이 이력이 없어 현재 릴리스의 정당성과 유효성을 입증할 수 없다. 따라서 설계변경 전후의 제품·공정 기준을 연속적으로 교환·재현하고 신뢰할 수 있게 통제한다는 선언 목적이 직접 약화된다.
  - action: 먼저 PartRevision을 독립된 불변 버전 권한으로 만들고, 버전이 있는 BOM과 Routing을 해당 개정에 연결하며 valid_from/valid_to 또는 명시적 effectivity와 이전·후속 버전 관계를 정의해야 한다. ECO는 이 전후 버전을 연결해야 하고 released·superseded·obsolete 수명주기는 버전 객체에 적용해야 한다. 그 기반 위에서 Routing과 ECO의 허용 상태 전이 및 종결·취소·대체·정정 상태를 정의하고, actor, occurred_at, reason, evidence_ref, from_status, to_status를 가진 변경·승인 이벤트를 기록해야 한다. 버전 정체성과 효력 모델을 먼저 세워야 후속 전이·이벤트가 어떤 구성에 대한 통제 증거인지 명확해진다.
- issue-012 (high): Operation이 공정 정체성, 라우팅·공장별 실행 사양과 검사 계획 정보를 함께 담아 재사용성과 실행 의미를 훼손한다. Source finding context: Operation·WorkCenter의 공장 및 라우팅별 확장 모델 Source finding context: .onto/review/20260718-8cd44907/execution-preparation/materialized-input.md:47-67,87-89 Source finding context: 작업장과 표준시간이 Operation에 직접 고정되어 새 공장·대체 설비·라우팅별 실행 조건...
  - root cause: 재사용 가능한 공정 정의, 라우팅 단계, 자원 배치, 검사 실행 및 계획 정보 객체의 유형 경계를 Operation 하나로 축약했다.
  - materiality: Upstream artifacts classify this as high. Affected purpose: PLM의 공정·검사 정의를 여러 MES 공장과 라우팅에서 실행 의미를 보존하며 확장하는 공통 기준. Source finding context: PLM의 공정 정의를 여러 MES 공장과 설비 구성으로 확장 가능한 공통 기준으로 제공하는 목적 Source finding context: 라우팅과 검사 정보를 PLM/MES 사이에서 실행 의미가 보존되도록 통합하는 개념 기준. Failure condition: 동일 공정을 복수 공장·대체 작업장·상이한 라우팅 시간으로 전개하거나 InspectionPlan을 라우팅 실행 단계로 소비할 때. Source finding context: 동일 공정을 복수 공장, 대체 작업장 또는 서로 다른 라우팅 시간으로 전개할 때 Source finding context: Routing.operations 소비자가 Operation 하위 유형인 InspectionPlan을 실행·배정 가능한 공정 단계로 처리할 때. Impact: 공정 복제와 기준 드리프트가 발생하고 검사 규격 문서가 실행 단계로 오인되어 잘못된 라우팅·검사 지시가 생성될 수 있다. Source finding context: 기존...
  - action: Preserved proposed action: OperationDefinition, RoutingOperation과 공장별 WorkCenter 배치를 분리하고, InspectionOperation은 실행 단계로, InspectionPlan은 별도 정보 객체로 모델링한다.. Action candidates: fix_now.
- issue-014 (high): AlternatePart가 속성과 방향성 계약을 보유하는 canonical associative relation으로 정립되지 않고 Part 간 단축 관계와의 권위·파생 규칙도 정의되지 않아, 대체 관계의 의미와 그래프 탐색 경로가 함께 불명확한 high 이슈이다.
  - root cause: AlternatePart를 canonical associative relation으로 명확히 정의하지 않아 관계 의미와 관계 엔티티의 그래프 권위가 모두 불분명하다.
  - materiality: PLM과 MES가 대칭적 호환성과 방향성 있는 대체 승인을 다르게 해석하거나 관계 그래프에서 속성 보유 레코드에 도달하지 못하면, 승인되지 않은 역방향 대체를 허용하거나 유효한 대체를 차단하고 불완전한 관계 투영을 생성할 수 있다. 이는 대체품 관계를 일관되고 안전하게 소비한다는 목적을 직접 약화한다.
  - action: 대칭적 호환성과 방향성 있는 대체 승인을 별도 개념으로 구분하는 것이 우선이다. 단일 개념을 유지한다면 AlternatePart를 canonical associative relation으로 선언하고 명시적인 Part 역할 경로를 추가한 뒤, direction에 따라 의미를 정의하여 bidirectional일 때만 역관계를 성립시켜야 한다. Part-to-Part 단축 관계는 이 canonical 레코드에서 파생되도록 권위와 파생 순서를 고정해야 한다.
  - unresolved disagreement: 심의는 결합된 high 이슈와 조치를 수용했지만, logic과 structure 렌즈는 각각 관계 양상 불결정성과 그래프 탐색 경로 부재만 직접 입증된다고 범위를 좁혔다. 두 결함이 동일한 실제 소비 경로에서 결합되어 안전 실패를 만든다는 직접 인과 증거는 아직 필요하다.
- issue-015 (high): 공정 재투입 흐름을 자기참조 BomLine으로 표현하면 제품 구성과 공정 물질 흐름의 의미가 충돌하므로, 다음 단계 전에 두 개념을 분리해야 한다. 유형 경계 위반은 확정됐지만 실제 소비자 오처리는 확인되지 않았다.
  - root cause: 제품 구성 관계와 공정상의 재생 물질 흐름을 하나의 BomLine 의미로 혼합했다.
  - materiality: PLM과 MES가 동일한 BOM 및 라우팅 의미를 공유하려면 BomLine이 비순환 제품 구성 관계로 일관되게 해석되어야 한다. 자기참조 재투입을 일반 BomLine으로 처리하면 BOM 전개, 소요량 계산, 구조 검증에서 순환이나 잘못된 자재 수량이 발생하거나 시스템별 해석이 달라질 수 있어 이 목적을 약화한다.
  - action: 다음 단계 전에 BomLine을 비순환 제품 구성 관계로 유지하고, 스크랩 발생·회수·재투입은 Operation 간 material flow 또는 별도의 Rework/RecycleFlow 개념으로 분리해야 한다. 이후 기존 자기참조 표현을 새 흐름 관계로 이전하고, BOM 전개·소요량 계산·구조 검증 경로에서 순환과 중복 소요가 사라지는지 확인해야 한다.
  - unresolved disagreement: 원인과 분리 조치에는 합의했지만 심각도에는 이견이 남는다. semantics는 높은 심각도를 유지하지만, deliberation은 실제 소비자 오처리 증거가 없다는 이유로 판단을 medium으로 좁혔다. 이를 해소하려면 자기참조 예외가 실제 소비 경로에서 어떻게 처리되는지 실행 증거가 필요하다.
- issue-017 (high): 시간상 최신 ECO, 승인·적용된 ECO, 현재 생산에 유효한 품목 리비전을 단일 current_eco와 지연 갱신되는 Part.rev로 함께 표현해 현재 적용 대상을 안정적으로 판정할 수 없는 high 이슈다.
  - root cause: 변경의 시간상 최신성, 승인·적용 상태, revision 유효성을 하나의 current_eco 참조와 지연 갱신 rev에 의존시켰다.
  - materiality: PLM과 MES가 동일한 변경관리 기준으로 생산 적용 리비전을 판정해야 하지만, 이 구조에서는 유효일 이후에도 구 리비전으로 생산하거나 미승인·미적용 변경을 조기에 반영할 수 있어 선언된 목적을 직접 약화한다.
  - action: ECO가 변경 전·후 revision을 명시적으로 참조하도록 하고, 시간상 최신 ECO와 승인·적용된 변경을 별도 관계로 구분해야 한다. 이어서 기준 시점, 승인·적용 상태, effective_date로부터 현재 유효 revision을 도출하는 별도 관계 또는 조회를 정의하고 PLM과 MES가 이를 생산 적용의 공통 권위로 사용하게 해야 한다. 이 조치는 현재 차단 이슈로서 즉시 닫아야 한다.
- issue-019 (high): ECO에서 적용 Part revision과 해당 BOM·Routing 구성으로 이어지는 탐색 가능한 effectivity 경로가 없어, 발효 시점의 제조 구성을 선택·검증할 수 없는 독립적인 high 이슈이다.
  - root cause: The ontology models revision as an unlinked scalar and omits configuration-level relationships from ECO to revisioned BOM and Routing.
  - materiality: ECO 발효 후 생산이 새 revision의 BOM과 Routing을 사용해야 할 때 모델만으로 유효 구성을 식별할 수 없다. 따라서 PLM 변경이 올바른 MES 실행 데이터로 이어진다는 통합 기준의 정확성과 신뢰가 약화된다.
  - action: Revision/configuration 엔터티를 도입하거나 동등한 명시적 버전 참조를 추가하고, ECO를 적용 Part revision 및 그 BOM·Routing에 effectivity와 함께 연결해야 한다. 이어서 발효일 이후 선택 규칙이 이 관계 경로를 실제로 순회하여 동일 구성을 선택·검증하도록 만들어야 한다.
  - unresolved disagreement: coverage 렌즈는 이를 issue-006의 표면으로 보지만, 명시적 same-root 관계나 issue-006 해결 후 이 경로 결함이 사라진다는 증거가 없어 독립 이슈로 유지한다.
- issue-002 (medium): 복제·수기 대사되는 scrap_rate와 표준시간의 권위가 불명확해 시스템별 계획·능력·원가 결과가 달라질 수 있는 medium 이슈이며, 다음 단계 전에 바로 해소해야 한다.
  - root cause: 운영 핵심값의 권위와 파생·복제 상태를 명시하지 않고 조직별 저장소와 수기 대사를 정상 운영 모델로 수용한다.
  - materiality: BOM·라우팅을 PLM/MES 통합의 일관된 기준으로 제공하려면 동일 운영값이 시스템마다 같은 의미와 권위를 가져야 한다. 그러나 복사 이후 scrap_rate가 바뀌거나 MES 계산 표준시간과 수기 원가 값이 분기 대사 전까지 갈라지면 품목별 소요량·능력·원가 판단이 달라져 기준 문서의 신뢰성이 약해진다.
  - action: 다음 단계 전에 각 운영값의 canonical source, 유효기간, 버전, 동기화 상태와 충돌 해결 규칙을 모델링해야 한다. 누적 std_time은 Routing/Operation에서 계산되는 projection으로 규정하고, 수기 필드는 비권위 캐시 또는 명시적 override로 분리해야 한다. 이 권위 계약을 먼저 확정해야 이후 모델링과 시스템 연계가 다시 복제값을 독립 권위로 고착하지 않는다.
- issue-004 (medium): 제품구조와 공정 재투입 흐름을 동일한 BomLine으로 표현한 결과, 자기참조 재투입 관계가 일반 BOM 구성관계로 해석될 수 있는 유형 경계 결함이 발생한다. 이 결함은 다음 단계 전에 수정해야 하며, 실제 전개·MRP 오처리는 아직 입증되지 않았으므로 심각도는 medium으로 한정한다.
  - root cause: 제품구조와 공정 물질흐름을 별도 개념으로 분리하지 않고 BomLine 하나로 표현한다.
  - materiality: BOM이 PLM/MES 통합의 안전한 공통 기준이 되려면 제품구조의 의미와 비순환 전개 규칙이 일관되어야 한다. 재투입 흐름이 일반 구성관계와 구별되지 않으면 소비 시스템이 이를 서로 다르게 해석하여 무한 전개, 중복 소요량 또는 잘못된 자재계획을 일으킬 수 있으므로 BOM 정합성과 제조 운영 안전성이 약화된다.
  - action: 다음 단계 전에 BOM을 비순환 제품구조로 유지하고 스크랩 발생·회수·재투입을 별도의 material-flow 또는 routing input/output 관계로 모델링해야 한다. 기존 자기참조를 당장 유지해야 한다면 최소한 명시적 relation kind와 BOM 전개·MRP·순환 검증에서의 제외 규칙을 함께 정의하고 적용 경로를 검증해야 한다.
  - unresolved disagreement: 원인과 필요한 조치에는 합의했지만 심각도에는 이견이 남아 있다. semantics 관점은 운영 영향 때문에 high를 주장했으나, 실제 BOM 전개 또는 MRP가 자기참조를 일반 구성관계로 처리한다는 증거와 전개 제외 규칙의 부재가 확인되지 않아 현재 결론은 medium으로 좁혀졌다.
- issue-005 (medium): 대체부품 관계가 대칭 호환성인지 방향성 승인인지 canonical 의미가 정해지지 않아 PLM과 MES가 같은 품목 관계를 다르게 해석할 수 있다. 계약 불결정성은 확정되었으나 실제 무권한 역대체와 운영 피해는 입증되지 않아 중간 심각도로 한정된다.
  - root cause: 대체부품 관계의 canonical 가치 약속을 대칭 관계와 방향성 관계 중 하나로 결정하지 않았다.
  - materiality: 공통 품목 기준은 PLM과 MES가 동일한 대체 판단을 내리게 해야 한다. 한 시스템이 관계를 대칭으로, 다른 시스템이 direction=one_way로 해석하면 승인되지 않은 역방향 대체나 허용된 대체의 누락이 발생해 자재계획과 현장 투입 판단의 정합성이 약화된다.
  - action: 기준 문서에서 먼저 canonical 의미를 하나로 결정해야 한다. 방향성 승인이 본질이면 정의와 alternate_of 투영도 방향성을 보존하고, 대칭 호환성이 계약이면 direction을 제거하거나 bidirectional만 허용해야 한다. 그 결정에 맞춰 기본값 대신 승인 범위, 유효기간, 적용 조건을 명시해 모든 소비 시스템이 같은 판단 규칙을 사용하도록 해야 한다.
  - unresolved disagreement: semantics 관점은 승인되지 않은 역방향 대체 가능성을 근거로 더 높은 심각도를 주장했다. 그러나 PLM과 MES의 상반된 실제 소비 경로, 기존 승인 통제 실패, 제조 운영 피해 범위가 확인되지 않아 심각도 상향은 수용되지 않았다.
- issue-008 (medium): UOM을 폐쇄형 문자열과 현장 환산으로 처리하는 현재 모델은 수량·용량의 의미와 변환 기준을 일관되게 보장하지 못하므로, 다음 단계 전에 확장 가능한 UOM 참조 데이터와 유효 변환 관계로 교체해야 한다.
  - root cause: 단위를 확장 가능한 UOM 참조 데이터와 유효한 변환 관계로 분리하지 않고 폐쇄형 문자열과 현장 환산으로 처리했다.
  - materiality: 단위가 결합되지 않은 qty_per·capacity_per_shift와 비정형 환산은 PLM과 MES가 동일한 BOM 소요량과 라우팅 용량을 다르게 해석하게 만들 수 있다. 또한 새 단위나 시스템별 단위를 추가할 때 데이터 추가가 아니라 스키마·매핑 변경이 필요해 교환 기준의 신뢰성과 확장성을 약화한다.
  - action: Quantity를 도입해 qty_per·scrap·capacity의 값과 단위를 결합하고, UnitOfMeasure를 코드·차원·기준 단위를 가진 참조 마스터로 분리해야 한다. 이어 품목·사업장·유효기간별 UomConversion 또는 PartUomConversion에 원단위, 대상단위, 계수와 유효기간을 두고 capacity_basis를 명시하며, 외부 시스템 단위 코드는 별도 식별자 관계로 매핑해야 한다. 이는 다음 단계 전에 닫아야 할 선행 수정이다.
  - unresolved disagreement: 근본 원인과 수정 필요성은 합의되었으나, 실제 오환산 빈도·통제 실패·운영 피해 규모가 경계 내 증거로 확인되지 않아 심각도는 medium으로 한정되었고 axiology 렌즈의 high 주장에는 이견이 남는다.
- issue-009 (medium): scrap_rate와 표준시간 파생값에 단일 데이터 권위와 동기화·대사 이력이 없어, 시스템 간 불일치가 발생하면 기준값과 책임 주체를 판별할 수 없는 medium 이슈이며 다음 단계 전에 해소해야 한다.
  - root cause: 복제·파생되는 값에 데이터 권위와 동기화·대사 사건을 부여하는 공통 개념이 없다.
  - materiality: Excel·MES·표준원가 시스템의 값이 다르거나 대사 사이에 생산 판단이 필요할 때 잘못된 스크랩 계수나 표준시간이 계획·원가에 사용될 수 있다. 어느 값이 기준인지, 누가 수정·최종 판정하는지, 차이가 어떻게 해결됐는지를 확인할 수 없어 PLM/MES 및 주변 장부 간 제조 기준값의 일관된 해석과 관리가 약화된다.
  - action: 다음 단계 전에 각 관리 값의 system_of_record와 accountable_owner를 지정해야 한다. 이어 복사된 값을 SourceValue, 계산된 값을 DerivedValue, 동기화·비교·해결 행위를 ReconciliationEvent로 구분하고 각 기록에 시각, 버전, 차이, 행위자와 해결 결과를 남겨야 한다. 권위와 책임을 먼저 확정해야 이후 동기화 및 대사 기록이 어떤 값을 기준으로 판정했는지 명확해진다.
- issue-011 (medium): current_eco는 편의를 위한 파생 조회값으로만 두어야 하며, 변경 효력의 권위는 조건별로 복수 ECO를 표현하고 충돌을 해소할 수 있는 독립 ChangeEffectivity 관계가 맡아야 한다.
  - root cause: Part의 단일 current_eco 포인터가 변경 이력과 복수·조건부 effectivity를 대신하도록 모델링되어 있다.
  - materiality: 한 품목에 복수 ECO가 병행되거나 효력이 미래 시점, 공장, 로트 또는 시리얼별로 달라지면 현재 구조는 어떤 변경이 실제 적용되는지 일관되게 결정할 수 없다. 그 결과 새 조건마다 스키마 수정이나 비정형 예외가 필요하고 PLM과 MES가 서로 다른 변경을 현재 유효한 것으로 해석할 수 있어, 승인된 변경을 MES 적용 조건으로 안정적으로 전달하려는 목적이 약화된다.
  - action: 다음 단계 전에 ECO와 대상 revision 사이에 ChangeEffectivity 관계를 도입해야 한다. 이 관계가 적용 대상, valid_from/to, 공장, 로트·시리얼 범위와 우선순위 또는 선행 변경을 표현하고 충돌 해소 규칙을 제공하도록 하며, current_eco는 그 권위 데이터에서 계산되는 파생 조회값으로 제한해야 한다.
- issue-013 (medium): AlternatePart에 필수 대칭성과 one_way 허용·기본값을 함께 선언해 동일 인스턴스의 역관계 계약이 직접 모순된다. 실제 운영 피해가 입증되지는 않았으므로 심각도는 medium으로 한정하지만, 통합 기준 문서에서 관계 양상을 결정해야 하는 출시 전 차단 이슈다.
  - root cause: AlternatePart의 관계 양상을 하나의 정식 규칙으로 결정하지 않고 필수 대칭성과 허용된 단방향성을 함께 선언했다.
  - materiality: direction이 생략되거나 one_way인 경우 PLM과 MES가 동일 데이터를 두고 B→A 역방향 대체를 필수로 보거나 미보장으로 볼 수 있다. 이는 일관된 대체품 계약이라는 문서 목적과 통합 판단의 결정성·검토 신뢰를 약화한다.
  - action: 출시 전에 대체성의 정식 양상을 하나로 결정해야 한다. 항상 대칭이어야 한다면 direction을 제거하고 모든 AlternatePart에 역관계를 강제한다. 방향성이 필요하다면 정의를 direction에 따른 단방향·양방향 관계로 수정하고 bidirectional일 때만 역관계를 강제하는 조건부 무결성 규칙을 추가한다. 이 계약 결정을 먼저 내려야 PLM/MES 소비 규칙과 검증을 일관되게 맞출 수 있다.
  - unresolved disagreement: 논리적 모순과 수정 방향에는 합의했지만, semantics 렌즈는 심각도를 높여야 한다고 보았다. 다만 one_way 인스턴스가 실제 PLM/MES 경로에서 안전하지 않은 대체 결정으로 이어진 증거가 없어 최종 심각도는 medium으로 좁혀졌다.
- issue-016 (medium): capacity_per_shift가 처리량 능력과 가용 시간이라는 서로 다른 물리 차원을 단위 없는 숫자 하나로 표현하므로, 작업장 간 비교와 생산능력 계산의 의미가 확정되지 않는 material한 medium 계약 결함이다.
  - root cause: capacity_per_shift를 측정 차원과 단위가 없는 하나의 숫자로 정의해 처리량과 가용 시간을 구별하지 못한다.
  - materiality: MES가 작업장 능력을 일관된 의미와 단위로 해석해야 하지만, 개수/교대와 시간/교대가 같은 지표로 취급되면 부하와 가용능력을 잘못 비교·합산하여 생산계획을 오산할 수 있다.
  - action: 다음 단계 전에 처리량 능력과 가용 시간을 별도 속성으로 분리하거나, 값·단위·측정 차원을 함께 갖는 CapacityMeasure로 모델링해야 한다. 비교·합산 및 계획 계산이 동일 차원의 호환 가능한 값에만 적용되도록 계약을 명확히 해야 한다.
  - unresolved disagreement: 원인과 조치에는 합의했지만 심각도에는 이견이 남았다. 실제 생산계획에서 capacity_per_shift가 사용되는 범위와 차원 혼합에 따른 오산 빈도·운영상 파급 규모가 입증되지 않아 high가 아닌 medium으로 한정되었다.
- issue-018 (medium): scrap_rate의 범위·분모·적용식과 권위 원천이 정의되지 않아 PLM과 MES가 같은 값을 불량률 또는 소요량 보정계수로 다르게 해석할 수 있는 medium 이슈이며, 다음 단계 전에 바로 수정해야 한다.
  - root cause: scrap_rate를 권위 원천과 결정적 산식이 있는 개념이 아니라 의미가 불명확한 외부 입력 숫자로 모델링했다.
  - materiality: 동일한 scrap_rate에 0.05, 1.05 또는 1/(1-0.05) 같은 서로 다른 해석이 허용되면 자재 소요량, 구매량, 생산계획 수량이 시스템별로 달라진다. 이는 BOM 소요량과 공정 불량을 PLM/MES가 동일한 산식으로 해석한다는 목적을 직접 약화한다.
  - action: 다음 단계 전에 공정 불량의 권위 원천을 먼저 지정하고 scrap_rate의 허용 범위, 분모, 단위 의미와 적용식을 명시해야 한다. 소요량 보정계수가 필요하면 별도 이름의 파생값으로 두고 canonical rate에서 결정적으로 계산하며 중복 입력을 금지해야 한다. 이 순서로 권위와 산식을 먼저 고정해야 PLM/MES의 계산 일관성과 향후 산식 변경 시 비교 연속성을 확보할 수 있다.
- issue-020 (medium): ProductionOrder가 엔티티로 정의되지 않고 생산 Part 및 선택 Routing과의 관계도 없으므로, released-routing 제약을 모델 내부에서 해석·검증·집행할 수 없는 독립적인 medium 계약 결함이다.
  - root cause: ProductionOrder를 언급하는 운영 통제 규칙을 만들었지만 그 규칙의 구조적 주체와 Routing 연결 경로를 정의하지 않았다.
  - materiality: 이 공백은 생산오더에서 실행을 승인한 정확한 Routing과 그 릴리스 상태를 추적하지 못하게 한다. 따라서 라우팅 릴리스 상태를 MES 실행 승인과 연결하는 자기완결적 기준이 성립하지 않으며, 구현마다 통제를 다르게 해석하거나 집행할 수 있다.
  - action: 다음 단계로 진행하기 전에 ProductionOrder 개념을 추가하고, 각 오더가 생산할 Part와 선택한 Routing을 명시적으로 참조하도록 관계를 정의해야 한다. 이어서 released-status 제약을 ProductionOrder→선택 Routing 경로에 표현해 오더 생성·검증 시 해당 Routing의 릴리스 여부를 구조적으로 판정할 수 있게 해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-007: logic과 structure 렌즈는 ProductionOrder 및 Routing 경로의 부재는 직접 확인했지만 실행·소비·산출·부적합·계보 전 범주가 필수라는 점은 명시적 규칙·관계 증거가 더 필요하다고 범위를 좁혔다.
- issue-014: 심의는 결합된 high 이슈와 조치를 수용했지만, logic과 structure 렌즈는 각각 관계 양상 불결정성과 그래프 탐색 경로 부재만 직접 입증된다고 범위를 좁혔다. 두 결함이 동일한 실제 소비 경로에서 결합되어 안전 실패를 만든다는 직접 인과 증거는 아직 필요하다.
- issue-015: 원인과 분리 조치에는 합의했지만 심각도에는 이견이 남는다. semantics는 높은 심각도를 유지하지만, deliberation은 실제 소비자 오처리 증거가 없다는 이유로 판단을 medium으로 좁혔다. 이를 해소하려면 자기참조 예외가 실제 소비 경로에서 어떻게 처리되는지 실행 증거가 필요하다.
- issue-019: coverage 렌즈는 이를 issue-006의 표면으로 보지만, 명시적 same-root 관계나 issue-006 해결 후 이 경로 결함이 사라진다는 증거가 없어 독립 이슈로 유지한다.
- issue-004: 원인과 필요한 조치에는 합의했지만 심각도에는 이견이 남아 있다. semantics 관점은 운영 영향 때문에 high를 주장했으나, 실제 BOM 전개 또는 MRP가 자기참조를 일반 구성관계로 처리한다는 증거와 전개 제외 규칙의 부재가 확인되지 않아 현재 결론은 medium으로 좁혀졌다.
- issue-005: semantics 관점은 승인되지 않은 역방향 대체 가능성을 근거로 더 높은 심각도를 주장했다. 그러나 PLM과 MES의 상반된 실제 소비 경로, 기존 승인 통제 실패, 제조 운영 피해 범위가 확인되지 않아 심각도 상향은 수용되지 않았다.
- issue-008: 근본 원인과 수정 필요성은 합의되었으나, 실제 오환산 빈도·통제 실패·운영 피해 규모가 경계 내 증거로 확인되지 않아 심각도는 medium으로 한정되었고 axiology 렌즈의 high 주장에는 이견이 남는다.
- issue-013: 논리적 모순과 수정 방향에는 합의했지만, semantics 렌즈는 심각도를 높여야 한다고 보았다. 다만 one_way 인스턴스가 실제 PLM/MES 경로에서 안전하지 않은 대체 결정으로 이어진 증거가 없어 최종 심각도는 medium으로 좁혀졌다.
- issue-016: 원인과 조치에는 합의했지만 심각도에는 이견이 남았다. 실제 생산계획에서 capacity_per_shift가 사용되는 범위와 차원 혼합에 따른 오산 빈도·운영상 파급 규모가 입증되지 않아 high가 아닌 medium으로 한정되었다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: resolved
- issue-010: no-deliberation-needed
- issue-012: narrowed
- issue-014: resolved
- issue-015: narrowed
- issue-017: no-deliberation-needed
- issue-019: resolved
- issue-002: no-deliberation-needed
- issue-004: narrowed
- issue-005: narrowed
- issue-008: narrowed
- issue-009: no-deliberation-needed
- issue-011: resolved
- issue-013: narrowed
- issue-016: narrowed
- issue-018: no-deliberation-needed
- issue-020: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합에서 변경관리 개념을 일관된 생산 기준으로 제공하고 제조 운영 위험을 통제하는 목적.
- issue-003: 품목·라우팅 데이터를 PLM/MES 사이에서 일관된 의미로 공유하고 제조 운영 위험을 줄이는 목적.
- issue-006: PLM/MES 통합에서 생산 시점에 적용할 품목·BOM·라우팅 기준을 제공하는 개념 문서
- issue-007: PLM/MES 통합의 개념 기준 문서.
- issue-010: PLM/MES 통합의 개념 기준으로서 설계변경 전후의 제품 구조와 공정 기준을 연속적으로 교환하고 재현하는 목적 / 라우팅 릴리스 및 설계변경 관리를 위한 신뢰 가능한 공통 개념 기준
- issue-012: PLM의 공정·검사 정의를 여러 MES 공장과 라우팅에서 실행 의미를 보존하며 확장하는 공통 기준. Source finding context: PLM의 공정 정의를 여러 MES 공장과 설비 구성으로 확장 가능한 공통 기준으로 제공하는 목적 Source finding context: 라우팅과 검사 정보를 PLM/MES 사이에서 실행 의미가 보존되도록 통합하는 개념 기준
- issue-014: PLM/MES 통합에서 대체품 관계를 일관되게 해석하고 안전하게 소비하는 개념 기준 / A structurally consistent integration model for alternate-part relationships and their relationship-level properties.
- issue-015: BOM과 라우팅을 PLM/MES가 동일한 제품 구조 및 공정 의미로 소비하는 개념 기준
- issue-017: 설계변경과 생산 적용 리비전을 PLM/MES가 동일하게 판정하는 변경관리 기준
- issue-019: PLM/MES integration baseline for consistent change-controlled BOM and routing selection.
- issue-002: BOM·라우팅 개념을 PLM/MES 통합의 일관된 기준으로 제공하는 목적.
- issue-004: BOM 개념의 정합성과 제조 운영 안전성을 보장하는 PLM/MES 공통 기준 역할.
- issue-005: 품목 개념의 정합성을 유지해 PLM/MES가 동일한 대체부품 결정을 내리게 하는 목적.
- issue-008: BOM 소요량과 라우팅 용량을 PLM/MES 간 동일하게 해석하는 기준 / PLM과 MES 사이에서 품목 수량과 BOM 소요량을 확장 가능하게 교환하는 기준
- issue-009: PLM/MES 및 주변 장부 간 제조 기준값의 일관된 해석과 관리
- issue-011: PLM의 변경 승인을 MES 적용 조건으로 안정적으로 전달하는 변경관리 기준.
- issue-013: PLM/MES 통합을 위한 품목·BOM·라우팅 개념 기준 문서로서의 일관된 대체품 계약
- issue-016: MES가 작업장 능력을 일관된 의미와 단위로 해석할 수 있는 통합 기준.
- issue-018: BOM 소요량과 공정 불량을 PLM/MES가 동일한 산식으로 해석하는 개념 기준.
- issue-020: 라우팅 릴리스 상태를 MES 실행 승인과 연결하는 자기완결적 개념 기준. Source finding context: A self-contained conceptual baseline connecting routing release state to MES execution authorization.

## Final Review Result
20 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO 발효와 Part 리비전 가시성 사이의 지연 구간에 단일 적용 판정이나 생산 차단 계약이 없어, MES가 발효 후에도 구 리비전으로 생산할 수 있는 중대한 변경관리 공백이 존재한다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 PLM/MES 구현에 별도 차단 장치가 있는지는 경계 내 증거로 확인할 수 없지만, 개념 기준 문서의 계약 공백은 확인된다.
- 실제 PLM과 MES가 별도 버전 계보를 보유하는지는 경계 내 증거로 확인할 수 없지만, 검토 대상 개념 모델에는 그 계보를 교환할 개념이 없다.
- Runtime completion: issue-scoped synthesis response was unavailable; prose was projected conservatively from upstream artifacts. [plan:executor] kind=codex unit_id=synthesis:issue-012 model=gpt-5.6-sol sandbox=read-only effort=medium WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/" (codex_home: AbsolutePathBuf("/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-home-GdhbxF/.codex")) OpenAI Codex v0.144.4 -------- workdir: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-m...

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-003 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now, accept_risk
- issue-010 (high): fix_now
- issue-012 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_before_release, fix_now
- issue-017 (high): fix_now
- issue-019 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, accept_risk, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-013 (medium): fix_before_release, accept_risk, fix_now
- issue-016 (medium): fix_before_release, fix_now
- issue-018 (medium): fix_before_release, fix_now
- issue-020 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
