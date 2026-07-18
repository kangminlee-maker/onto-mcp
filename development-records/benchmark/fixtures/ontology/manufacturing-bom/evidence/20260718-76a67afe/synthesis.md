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
- issue-001 (high): Part·BOM·Routing의 개정, 효력, 상태 전이 및 조건별 적용 기준이 현재값에 묶여 있어, PLM과 MES가 특정 생산 시점과 조건에 유효한 제조 정의 및 승인 근거를 일관되게 결정하거나 과거 상태를 재구성할 수 없다.
  - root cause: Part·BOM·Routing·Operation의 개정, 효력, 상태 전이와 적용 조건이 독립적인 버전·사건·사양 개념으로 분리되지 않고 변경 가능한 현재 객체와 상태값에 결합되어 있다.
  - materiality: ECO 발효 후 Part.rev 동기화 전이거나 후속 ECO, 라우팅 변경, 공장별 변형이 존재하면 설계와 생산이 서로 다른 개정·BOM·공정을 선택할 수 있다. 이는 동일한 제조 기준을 공유·추적한다는 통합 목적을 직접 훼손하며, 잘못된 생산 투입, 변경 준수 실패, 감사 및 추적성 상실로 이어질 수 있어 현재 차단 요소로 반드시 해소해야 한다.
  - action: 즉시 PartRevision, BOMRevision, RoutingRevision 또는 동등한 식별 가능한 개정 개념을 도입하고 각 개정에 effectivity와 시점·공장·자원별 적용 조건을 부여해야 한다. ECO는 생성·승인된 개정과 연결하고, BomLine과 공정 사양은 해당 개정 및 변경 근거에 고정하며, 승인·적용·릴리스·정정은 actor, occurred_at, rationale/evidence_ref를 가진 감사 사건으로 기록해야 한다. 적용 개정 선택 권위를 먼저 단일화한 뒤 생산오더가 선택된 확정 개정을 보존하도록 연결해야 동기화 지연과 후속 변경에도 결정성과 추적성이 유지된다. InspectionPlan 분류와 Operation의 자원·시간 경계는 이 근본 원인과 섞지 말고 별도 개념 경계 수정으로 처리해야 한다.
- issue-005 (high): ProductionOrder와 실제 적용 BOM·Routing·ECO 개정의 연결이 없어, 생산분에 적용된 설계·공정 기준을 고정하거나 추적할 수 없는 고심각도 완전성 결손이다.
  - root cause: 온톨로지가 제조 정의에는 머물면서 그 정의를 소비하고 확정된 개정을 고정하는 최소 MES 실행 개념을 포함하지 않는다.
  - materiality: PLM/MES 통합의 핵심은 확정된 제조 정의를 실제 생산 실행에 귀속시키는 것이다. 현재는 released Routing에서 생산 오더를 생성한다는 규칙이 있어도 그 규칙의 적용 대상과 결과 객체가 없으므로, 선언된 생산 허용 규칙을 데이터에 적용할 수 없고 설계에서 실행까지의 추적 사슬도 끊긴다.
  - action: 현재 대상에서 반드시 수정해야 한다. ProductionOrder를 최소 실행 개념으로 먼저 추가하고 주문 품목, 수량, 계획·시작 시각을 표현한 뒤 applied_bom_revision, applied_routing_revision 및 적용 ECO 참조를 연결해 생산 시점의 확정 기준을 보존해야 한다. 이 실행 객체와 적용 연결이 무결성 규칙의 실제 대상이 되어야 한다.
- issue-002 (medium): 계획·능력·시간·원가 입력의 권위 원천과 단위가 통합 모델에서 결정되지 않아 동일 운영 파라미터를 시스템과 부서가 서로 다르게 해석하고 있으며, 대상 모델에서 즉시 해소해야 하는 중대한 통합 기준 결손이다.
  - root cause: 운영 파라미터가 권위 원천·단위·유효기간을 가진 공유 개념이 아니라 로컬 사본, 수기 입력과 현장 관례로 유지된다.
  - materiality: PLM과 MES가 품목·BOM·라우팅 정보를 공통 의미로 해석하려면 계산 입력의 값, 단위, 적용 시점이 일관되어야 한다. 그러나 복사 시점이 다른 값과 단위가 불명확한 값을 결합하면 계획·능력·원가 결과를 재현하거나 신뢰할 수 없어 선언된 통합 기준 역할이 약화된다.
  - action: 구현 전에 각 운영 파라미터의 권위 원천, 측정 차원, 단위, 유효기간, 갱신 책임자와 충돌 우선순위를 대상 모델에 명시해야 한다. scrap_rate와 환산계수는 공유 참조 마스터로 승격하고, 표준시간·원가의 파생 규칙 및 수기 override의 승인·만료 조건을 정의해야 한다. 특히 issue-006과 공유하는 원인 후보인 공통 단위·환산 마스터 부재를 함께 정리해야 후속 계산 규칙이 다시 로컬 환산에 의존하지 않는다.
- issue-003 (medium): 제품 구성과 순환 가능한 공정 물질 흐름을 BomLine에 함께 표현함으로써 BOM의 비순환 불변식이 일관되게 적용되지 않는 중대한 모델 경계 결함이다.
  - root cause: 공정상의 스크랩 회수·재투입 흐름을 위한 별도 개념 없이 제품 구성 관계인 BomLine을 재사용했다.
  - materiality: 스크랩 재투입이 있는 Assembly가 일반 BOM 전개나 소요량 계산에 들어가면 PLM/MES 소비자는 BOM이 비순환이라는 핵심 계약을 안전하게 가정할 수 없다. 그 결과 제품 구성과 공정 흐름의 의미가 혼합되어, 소비자 간 일관된 구성 해석과 계산 정확성을 보장하려는 목적이 약화된다.
  - action: 릴리스와 일반 BOM 소비 로직 구현 전에 BomLine을 순수한 제품 구성 관계로 한정하고 비순환 불변식을 예외 없이 복원해야 한다. 스크랩 회수·재투입은 Routing·Operation에 연결된 별도 물질 흐름 또는 부산물·재투입 관계로 모델링하고, 그 순환 흐름을 사용하는 소비자와 계산 규칙을 명시해야 한다. 이 분리가 먼저 완료되어야 이후 BOM 전개와 소요량 계산이 안정된 계약을 전제로 구현될 수 있다.
- issue-006 (medium): BOM 수량과 작업장 능력이 값·측정 차원·단위·환산 규칙을 갖춘 공통 모델로 표현되지 않아, PLM과 MES가 이를 결정적으로 해석·검증·변환하거나 새로운 단위로 확장할 수 없다.
  - root cause: 수량의 값·측정 차원·단위와 시점별 환산 규칙이 재사용 가능한 공통 Quantity·UnitOfMeasure 모델로 분리되지 않았다.
  - materiality: 품목의 관리 단위가 다르거나 환산계수가 변경되면 시스템과 작업자마다 BOM 소요량이 달라져 자재 부족 또는 과다 투입이 발생할 수 있다. 또한 작업장 능력의 숫자가 처리 수량인지 가용 시간인지 구별되지 않아 능력 비교, 생산계획, 스케줄링 및 공정 배정의 신뢰가 약화된다. 고정 단위 열거는 신규 단위 수용에도 스키마 변경이나 비표준 현장 관례를 요구하므로 PLM/MES 간 지속적인 의미 통합 목적을 훼손한다.
  - action: 대상 기준에서 즉시 Quantity와 UnitOfMeasure를 공통 개념으로 분리하고, 값·측정 차원·단위 코드를 명시해야 한다. 품목·단위쌍별 권위 있는 환산 규칙에 factor, valid_from, valid_to 및 source_authority를 부여하고 BomLine 수량의 기준 단위를 정의해야 한다. 작업장 능력에도 필수 측정 유형과 단위를 부여하여 수량 능력과 가용 시간을 구별하고, 필요한 경우 교대 길이와 품목·공정별 처리율을 별도 속성으로 모델링해야 한다. 이는 계획·스케줄링 소비자가 구현되기 전에 닫아야 하는 선행 모델 결손이다.
- issue-007 (medium): scrap_rate 복사값에 권위 원본, 동기화 시점, 유효기간이 연결되지 않아 특정 계획 시점에 사용할 값을 유일하게 결정하거나 과거 계획을 재현할 수 없다.
  - root cause: 복사 관리되는 scrap_rate에 권위 원본, 동기화 시점과 시간적 적용 범위를 지정하는 모델이 없다.
  - materiality: 엑셀 원본 후보와 통합 시스템의 값이 다르거나 scrap_rate가 변경되면 생산계획과 MES가 적용할 값을 판별할 수 없다. 이에 따라 BOM 기반 자재 소요량과 제조 계획 계수의 시스템 간 일관성, 결과 재현성, 신뢰성이 약화된다.
  - action: 대상 구현 전에 기준 모델에서 scrap_rate의 권위 마스터 식별자, 유효 시작·종료 시점, 동기화 시각을 정의하고, 복사 값은 해당 마스터를 참조하는 시점 스냅샷으로 구분해야 한다. 공유 원인 후보인 dep-004 및 rel-012와 동일한 권위·시간 모델을 정렬해 중복되거나 상충하는 기준이 생기지 않도록 해야 한다.
- issue-008 (medium): AlternatePart에 무조건적 대칭성과 기본값을 포함한 one_way 방향성을 함께 부여한 현재 계약은 논리적으로 양립할 수 없으므로 출시 전에 수정해야 한다.
  - root cause: 하나의 AlternatePart 개념에 무조건적 대칭성 정의와 선택 가능한 one_way 방향성을 동시에 부여했다.
  - materiality: direction=one_way인 관계가 생성되거나 기본값이 적용되면 PLM과 MES가 동일한 대체 관계를 각각 양방향과 단방향으로 해석할 수 있다. 이 차이는 대체품 선택과 제조 실행 판단을 불일치시켜, 품목 대체 관계를 두 시스템의 일관된 개념 기준으로 제공하려는 목적을 약화한다.
  - action: 대상 계약을 즉시 한 가지 의미로 정규화해야 한다. 방향성을 유지하려면 direction=bidirectional일 때만 역관계가 성립하도록 대칭성을 조건부 제약으로 바꾸고, one_way에는 역관계가 암시되지 않음을 명시해야 한다. 반대로 모든 대체 관계가 대칭이어야 한다면 direction 속성과 one_way 값을 제거해야 한다. 어느 방식을 택하든 PLM/MES가 이 계약을 소비하기 전에 수정하여 상반된 실행 해석을 차단해야 한다.
- issue-009 (medium): AlternatePart의 primary→alternate 역할과 direction이 alternate_of 단축 관계에 보존되지 않아, 방향성 있는 허용 대체가 무방향 관계로 해석될 수 있다. 심의는 이 문제를 투영 규칙 결손으로 한정했으며 즉시 수정이 필요하다.
  - root cause: 대체 가능성의 primary→alternate 역할과 방향성을 AlternatePart 정의 및 alternate_of 단축 관계에서 일관되게 보존하지 않았다.
  - materiality: PLM이 승인한 단방향 대체 정보를 MES가 같은 방향으로 해석해야 한다는 개념 기준이 깨진다. 단축 관계를 통해 역방향 대체까지 허용하면 승인되지 않은 부품 투입이 발생할 수 있고, 자재 판단과 추적성의 신뢰가 약화된다.
  - action: 소비자 구현 전에 alternate_of의 투영 계약을 수정해야 한다. primary→alternate 방향을 명시적으로 보존하고, one_way는 해당 방향만 허용하며 bidirectional은 두 개의 방향성 관계로 투영되도록 규정해야 한다. 수정 후 단방향 관계에서 역방향 조회·투입이 거부되고 양방향 관계에서만 두 방향이 허용되는지 검증해야 한다.
- issue-010 (medium): 스크랩 재투입을 자기 참조 BomLine으로 표현하면 제품 구성 수량과 공정 회수량이 하나의 관계로 혼합되므로, BOM은 비순환 제품 구성으로 한정하고 재투입 흐름은 별도의 공정 물질 흐름 관계로 분리해야 한다.
  - root cause: 제품 구성과 공정 내 스크랩 발생·재투입 물질 흐름을 별도 관계로 모델링하지 않았다.
  - materiality: 일반 BOM 전개 또는 소요량 계산이 자기 참조 BomLine을 실제 제품 구성으로 소비하면 공정 회수량을 구성 수량으로 해석할 수 있다. 이에 따라 BOM 전개와 자재 계획의 의미적 신뢰가 약화되고, PLM과 MES가 제품 구조와 제조 공정 흐름을 동일하게 해석한다는 목적이 훼손된다.
  - action: 릴리스와 BOM 계산 소비 전에 BomLine 및 무결성 규칙에서 스크랩 자기 참조 예외를 제거하여 BOM을 비순환 제품 구성 관계로 제한해야 한다. 이어 스크랩 발생·회수·재투입을 Operation 또는 Routing 간 별도 material-flow 관계로 모델링하고 필요한 수량·수율 속성을 그 관계에 두어야 한다.
- issue-011 (medium): scrap_rate 하나에 손실 비율과 gross-up 계수, 측정값과 계획값, qty_per 적용 의미가 결합되어 동일 BOM으로 서로 다른 총소요량을 계산할 수 있으므로 대상 문서에서 즉시 수정해야 한다.
  - root cause: 공정 손실의 측정 비율, 계획 계수, 적용 산식과 BOM 계산 결과를 하나의 scrap_rate 숫자 속성에 결합했다.
  - materiality: PLM과 MES가 같은 값을 각각 손실 비율 또는 소요계수로 해석하거나 원천과 다른 복사값을 사용하면 총소요량이 달라진다. 이는 BOM 수량과 공정 손실을 일관되게 해석·교환하려는 목적을 훼손하고 계획·실행 데이터의 정합성을 약화한다.
  - action: 구현 전에 손실률과 gross-up 계수를 별도 개념으로 명명하고 각각의 값 범위·단위와 qty_per 적용 산식을 명시해야 한다. 공정 성과에서 파생되는 측정값은 원천 측정과 계산 규칙에 연결하고, 계획 기준값은 별도 권위와 유효기간을 가진 planning_scrap_factor로 분리해야 한다. 권위·이력 결손을 다루는 issue-007과 원인을 공유하지만, 본 이슈의 계산 의미와 산식 계약은 독립적으로 닫아야 한다.
- issue-012 (medium): 정식 `relations` 그래프가 `AlternatePart` 관계 엔티티를 우회하므로, primary·alternate 역할과 `direction`을 보존하면서 대체품 관계를 탐색할 수 있는 정식 경로가 없다.
  - root cause: 정식 관계 그래프가 재구체화된 AlternatePart 노드를 연결하지 않고 Part 간 alternate_of 단축 간선으로 우회한다.
  - materiality: PLM/MES 통합 소비자가 `relations`를 권위 있는 탐색 그래프로 사용할 때 단축 간선과 관계 엔티티 중 서로 다른 구조를 기준으로 삼을 수 있다. 그 결과 역할과 방향 정보의 보존 여부가 구현마다 달라져, 품목·BOM·라우팅·변경관리 모델을 일관된 통합 기준으로 제공하려는 목적이 약화된다.
  - action: 통합 구현 전에 `Part`와 `AlternatePart` 사이에 primary와 alternate 역할을 명시한 정식 간선을 추가해야 한다. 그 구조를 권위 원천으로 확정한 뒤 `Part -> Part alternate_of`를 명시적으로 파생되는 projection으로 정의하거나 제거해야 하며, 그래야 역할과 `direction`의 보존 규칙이 단일 경로에서 검증 가능해진다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: narrowed
- issue-005: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: narrowed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM과 MES가 변경 전후 및 생산 조건별로 동일한 품목·BOM·라우팅·품질 기준을 결정하고 추적하는 통합 개념 기준. Source finding context: PLM/MES 통합의 개념 기준 문서로서 변경 적용과 제조 실행이 동일한 리비전을 결정하게 하는 목적. Source finding context: 품목·BOM·변경관리의 정합성을 제공하는 PLM/MES 통합 개념 기준 Source finding context: PLM 정의와 MES 생산 공정 간 라우팅 기준의 일관성 Source finding context: 변경관리와 생산 릴리스 통제의 추적 가능한 개념 기준 Source finding context: 품목·BOM·라우팅·변경관리의 PLM/MES 통합 기준과 변경 이후 데이터 연속성 Source finding context: MES가 확장된 생산 환경에서도 품목별 유효 라우팅과 실행 자원을 일관되게 선택하도록 하는 통합 기준 Source finding context: 품질 계획과 제조 실행 단계를 일관되게 교환하는 PLM/MES 개념 기준
- issue-005: PLM/MES 통합을 위한 설계 정의와 제조 실행 간 개념적 연결.
- issue-002: 품목·BOM·라우팅 정보를 PLM과 MES가 공통 의미로 해석하는 개념 기준 역할.
- issue-003: BOM 개념 정합성을 보장하고 PLM/MES 소비자가 일관된 구성 의미를 공유하게 하는 목적.
- issue-006: BOM 수량, 자재 소요량과 작업장 능력을 PLM/MES 및 확장된 생산 환경에서 일관되게 해석하는 기준. Source finding context: BOM 수량과 MES 자재 소요량의 일관된 해석 Source finding context: 서로 다른 PLM/MES 데이터의 품목 수량 및 생산능력 의미를 지속적으로 통합하는 기준 Source finding context: 작업장 용량을 MES 계획·스케줄링에 일관되게 전달하는 개념 기준
- issue-007: BOM 기반 소요량과 제조 계획 계수의 시스템 간 일관성.
- issue-008: 품목 대체 관계를 PLM/MES 통합의 일관된 개념 기준으로 제공하는 목적.
- issue-009: PLM과 MES가 동일한 부품 대체 가능성 및 방향을 해석하도록 하는 개념 기준.
- issue-010: 제품 구조와 제조 공정 흐름을 PLM/MES 사이에서 동일하게 해석하는 개념 기준.
- issue-011: BOM 수량과 공정 손실을 일관되게 해석하여 자재 소요를 교환하는 개념 기준.
- issue-012: 품목·BOM·라우팅·변경관리 모델을 PLM/MES 통합의 일관된 개념 기준으로 제공하는 목적.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Part·BOM·Routing의 개정, 효력, 상태 전이 및 조건별 적용 기준이 현재값에 묶여 있어, PLM과 MES가 특정 생산 시점과 조건에 유효한 제조 정의 및 승인 근거를 일관되게 결정하거나 과거 상태를 재구성할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 작업 실적, 자재 계보, 설비 이력까지의 상세 실행 모델링은 선언된 최소 통합 범위를 넘어설 수 있어 이번 필수 조치에 포함하지 않는다.
- 실제 시스템별 원본 소유권과 동기화 SLA는 현재 증거 경계에서 확인되지 않았다.
- 구조적 증거는 권위 원본 참조와 이력 모델의 부재를 확인하지만 실제 운영상 권위 마스터가 무엇인지는 확정하지 않는다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-005 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, fix_now

## Recommendations
- issue-004 (medium): 사용자 요청 목적을 넘어서는 가치·제품 원칙 정렬 판단에 필요한 정식 권위 자료가 바인딩되지 않았다. Source finding context: axiology execution-preparation — canonical value authority binding Source finding context: Role contract: axiology prompt §Authoritative alignment input and §Finding evidence requirements (canonical authority binding required; missing authority requires insufficient-evidence finding). Execution evidence: context-candidate-assembly.yaml:1-4; review-value-alignment-criteria.yaml:5-20. Source finding context: 정식 목적·원칙 권위가 바인딩되지 않아 사용자 요청 목적을 넘어선 axiology 판단은 불확정이다. Source finding context: axiology 역할 계약은 core lexicon과 제품화·OaC·LLM-native·product-locality 원칙을 가치 판단의 권위 사슬로 요구한다. 현재 자료로는 통합 기준이라는 세션 목적에 대한 정렬은 판단할 수 있지만, 해당 상위 제품 원칙과의 정렬 여부를 근거 있게 평가할 수 없다. Source finding context: 실행 준비 단계에서 역할 계약에 열거된 순위 1~3 권위 문서를 실제 context source로 바인딩하고 안정적인 anchor/excerpt를 제공한 뒤 axiology lens를 재실행한다. Source finding context: .onto/review/20260718-76a67afe/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 개인적 해석이 아닌 canonical authority에 근거해 가치·목적 정렬을 평가하는 axiology 계약. Source finding context: 제품 목적이나 OaC 등 상위 원칙에 대한 정렬 판단이 필요한 경우. Source finding context: 상위 가치에 대한 clean verdict 또는 위반 판단이 근거 없는 추론이 되어 리뷰 신뢰성이 약화된다. Source finding context: execution preparation이 axiology 역할에 필수인 canonical authority source set을 context source로 materialize하지 않았다. Source finding context: 현재 alignment 입력에는 사용자 요청 목적만 존재한다. Source finding context: system_purpose_refs와 execution_rule_refs가 빈 목록이다.

## Unique Finding Tagging
- issue-004 (medium): 사용자 요청 목적을 넘어서는 가치·제품 원칙 정렬 판단에 필요한 정식 권위 자료가 바인딩되지 않았다. Source finding context: axiology execution-preparation — canonical value authority binding Source finding context: Role contract: axiology prompt §Authoritative alignment input and §Finding evidence requirements (canonical authority binding required; missing authority requires insufficient-evidence finding). Execution evidence: context-candidate-assembly.yaml:1-4; review-value-alignment-criteria.yaml:5-20. Source finding context: 정식 목적·원칙 권위가 바인딩되지 않아 사용자 요청 목적을 넘어선 axiology 판단은 불확정이다. Source finding context: axiology 역할 계약은 core lexicon과 제품화·OaC·LLM-native·product-locality 원칙을 가치 판단의 권위 사슬로 요구한다. 현재 자료로는 통합 기준이라는 세션 목적에 대한 정렬은 판단할 수 있지만, 해당 상위 제품 원칙과의 정렬 여부를 근거 있게 평가할 수 없다. Source finding context: 실행 준비 단계에서 역할 계약에 열거된 순위 1~3 권위 문서를 실제 context source로 바인딩하고 안정적인 anchor/excerpt를 제공한 뒤 axiology lens를 재실행한다. Source finding context: .onto/review/20260718-76a67afe/round1/axiology.findings.yaml#axiology-candidate-004 Source finding context: 개인적 해석이 아닌 canonical authority에 근거해 가치·목적 정렬을 평가하는 axiology 계약. Source finding context: 제품 목적이나 OaC 등 상위 원칙에 대한 정렬 판단이 필요한 경우. Source finding context: 상위 가치에 대한 clean verdict 또는 위반 판단이 근거 없는 추론이 되어 리뷰 신뢰성이 약화된다. Source finding context: execution preparation이 axiology 역할에 필수인 canonical authority source set을 context source로 materialize하지 않았다. Source finding context: 현재 alignment 입력에는 사용자 요청 목적만 존재한다. Source finding context: system_purpose_refs와 execution_rule_refs가 빈 목록이다.

## Shared Phenomenon Summary
- none
