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
- issue-002 (high): BOM과 Routing이 독립적인 버전 및 유효기간을 갖지 않아 ECO 적용 시점이나 과거 생산 시점의 제조 구성을 확정적으로 재구성할 수 없다.
  - root cause: BOM과 Routing이 버전 및 유효기간을 가진 독립 구성으로 모델링되지 않았으며, 이를 도입하면 ECO 시점과 과거 생산 시점의 구성을 재구성할 수 있어야 한다.
  - materiality: ECO 전후 생산분, 주간 동기화 지연 구간, 과거 생산 기록을 판정할 때 PLM과 MES가 동일 시점의 BOM·Routing 구성을 재현하거나 대사할 수 없다. 이는 구버전 부품·공정의 오적용 위험과 추적성 공백을 만들어 품목·BOM·라우팅 기준 및 변경 적용 일관성이라는 통합 목적을 직접 약화한다.
  - action: BomRevision과 RoutingRevision 같은 식별 가능한 독립 구성 버전을 도입하고, 각 버전에 유효 시작·종료 시점, 상태, ECO 참조 및 불변 BOM 라인·공정 목록을 귀속시켜야 한다. 이어 Part revision을 해당 구성 버전에 명시적으로 연결해야 한다. 이 연결과 effectivity가 먼저 권위 있는 선택 기준으로 정립되어야 ECO 적용 시점과 과거 생산 시점의 구성을 재현하고 양 시스템 간 대사를 수행할 수 있다.
- issue-003 (high): ECO가 구체 변경 항목과 변경 전후의 Part·BOM·Routing 리비전을 연결하지 않으므로, 승인된 변경 내용과 생산 시점에 유효한 제조 구성을 결정하거나 과거 구성을 재현할 수 없다.
  - root cause: 시간에 따라 유효한 제조 구성과 이를 변경하는 ECO가 독립적인 버전·변경항목·전후 연결 구조로 모델링되지 않았으며, 이 구조를 도입하면 변경 내용, 과거 구성 보존, 적용 경로 및 현재 효력 선택 문제가 함께 해소되어야 한다.
  - materiality: 부분 변경, 순차·병행 리비전, ECO 발효 전후 생산, 리비전 동기화 지연 상황에서 MES가 적용할 BOM과 라우팅을 결정적으로 선택할 수 없다. 이로 인해 변경의 과잉·누락 반영, 구형 또는 미발효 구성의 적용, PLM 결과와 MES 실행 결과의 대사 실패 및 감사 불가능성이 발생하여 PLM 설계변경을 MES 제조 구성에 정확히 전달한다는 목적이 약화된다.
  - action: 불변 PartRevision, BomRevision, RoutingRevision과 각 유효 구간을 먼저 도입하고, ECOChangeItem이 대상 객체·대상 버전·변경 유형·before/after 값 또는 결과 리비전·적용 순서를 표현하도록 해야 한다. 이어 ECO가 변경 전후 리비전과 해당 BOM·Routing 버전을 명시적으로 연결하고, 생산 실행이 Part의 가변 현재값이 아니라 생산 시점에 확정된 유효 구성 버전을 고정 참조하도록 해야 한다. current_eco는 최신 ECO와 현재 유효 ECO를 분리하거나 status와 effective_date에 따른 선택 규칙을 명시해야 한다.
- issue-010 (high): 스크랩 재투입을 BomLine 자기 포함으로 표현한 현재 모델은 제품 구성과 공정 자재 흐름을 혼합해 BOM의 비순환 구성 의미를 훼손하므로 즉시 분리해야 한다.
  - root cause: 제품 구성과 공정 중 회수물 흐름을 동일한 BomLine 관계로 모델링했으며, 재투입 흐름을 별도 관계로 분리하면 BOM의 비순환 구성 의미가 복원되어야 한다.
  - materiality: PLM 제품구조와 MES 제조 흐름 사이의 공통 개념 기준에서 BomLine은 상위 품목이 하위 품목을 사용하는 구성 관계여야 한다. 자기 참조 예외가 유지되면 BOM 전개, 자재소요 계산, 계보 추적에서 무한 전개·중복 소요·잘못된 재고 소비가 발생할 수 있어 선언된 목적을 실질적으로 약화한다.
  - action: BOM에서 자기 포함 예외를 제거해 제품구조를 비순환으로 유지하고, 스크랩 발생·회수·재투입은 material_flow, byproduct 또는 recycle_input 같은 별도 자재 흐름 관계와 수율 속성으로 모델링해야 한다. 먼저 관계 의미를 분리한 뒤 BOM 전개, 자재소요 계산, 계보 추적이 새 경계를 따르도록 검증해야 한다.
- issue-004 (medium): Routing과 ECO가 현재 상태값만 보존하므로 승인·적용의 증거와 철회·정정·대체 이력을 재구성할 수 없다. 다음 운영 통제 단계로 넘어가기 전에 사건 기반 lifecycle 권위를 명시해야 한다.
  - root cause: Routing과 ECO lifecycle이 증거 있는 상태 전이 사건이 아니라 현재 enum 값으로만 모델링되었으며, 전이·종결·정정 사건을 도입하면 감사 공백과 lifecycle 종료 불능이 함께 해소되어야 한다.
  - materiality: 승인 적법성, 적용 책임 또는 PLM/MES 상태 불일치를 조사할 때 행위자·시각·근거를 확인할 수 없고, 배포된 Routing이나 적용된 ECO를 폐기·철회·정정할 때도 기존 상태 의미를 훼손하지 않는 이력을 남길 수 없다. 그 결과 생산 가능 여부가 모호해지고 변경 통제, 감사 가능성, 사후 원인 분석의 신뢰가 약해진다.
  - action: 행위자, 발생 시각, 이전·이후 상태, 사유와 증거 참조를 보존하는 권위 있는 상태 전이 사건을 Routing과 ECO에 모델링하고, 현재 상태는 그 사건 이력에서 도출해야 한다. 또한 허용 전이와 terminal 상태를 정의하고 폐기·철회·정정·재발행·대체 관계를 명시해야 한다. 이는 기본 개념 기준을 확정한 뒤 운영 통제 단계로 진행하기 전에 완료되어야 승인 감사와 PLM/MES 상태 대조가 동일한 이력 권위를 사용한다.
- issue-005 (medium): 외부·병행 관리되는 scrap_rate와 표준시간 계열 값이 현재 스칼라 값으로만 보존되어 단일 권위, 출처, 적용 시점, 동기화 상태 및 충돌 해결 규칙을 판정할 수 없다. 이는 다음 통합 단계 전에 반드시 해소해야 하는 중간 심각도의 근본 원인이다.
  - root cause: 외부 또는 병행 관리 값을 출처·버전·유효성·동기화·충돌 계약 없이 현재 스칼라 값으로 보존했으며, 공통 provenance 계약을 도입하면 권위 선택과 변경 추적 문제가 함께 해소되어야 한다.
  - materiality: 복제값과 원본·계산값이 다르거나 원본 버전과 적용 시점이 바뀌면 어느 값을 계획·자재소요량·원가·품질 판단에 사용해야 하는지 결정할 수 없다. 그 결과 PLM, MES, 계획 및 원가 시스템이 서로 다른 값이나 시점에 근거해 판단할 수 있어, 운영 값의 출처와 의미를 일관되게 유지하려는 목적이 약화된다.
  - action: 외부·병행 관리 값에 공통 권위·provenance·effectivity·동기화·충돌 해결 계약을 적용해야 한다. 최소한 authoritative_system, source_record, source_version, observed_at, effective_from/to, sync_status, derivation_rule 및 conflict_resolution을 정의하고, 가능한 복제 필드는 버전된 원본에서 도출되는 읽기 전용 투영으로 모델링한다. 이 계약은 시스템 통합을 실행하기 전에 확정해야 이후 계획·원가·품질 로직이 동일한 권위와 적용 시점을 사용한다.
- issue-006 (medium): 품목별 단위 변환과 유효성 기준이 없고 UOM이 폐쇄 enum으로 고정되어 있어, 단위가 다른 BOM 수량의 환산과 새로운 단위의 확장이 모두 불안정하다.
  - root cause: 단위가 확장 가능한 기준정보 및 유효한 변환 규칙이 아니라 폐쇄 enum과 품목 속성으로만 모델링되었으며, UOM 기준 엔티티와 변환 마스터를 도입하면 현재 환산 불능과 미래 확장 결손이 함께 해소되어야 한다.
  - materiality: PLM과 MES가 BOM 기반 자재소요량과 현장 투입 수량을 일관되게 교환·계산하려면 동일한 단위 의미와 재현 가능한 환산 규칙이 필요하다. 현재 구조에서는 단위가 다를 때 수기 환산에 의존하고, 새 단위에는 스키마 변경이 필요해 생산·재고 오차와 시스템 간 수량 의미 불일치가 발생할 수 있다.
  - action: 다음 단계의 BOM 수량 교환·계산 전에 UOM을 식별자, 차원, 표준 코드 매핑을 가진 확장 가능한 기준 엔티티로 분리해야 한다. 이어 품목별 기준·대체 단위, 변환계수, 반올림 규칙, 유효기간과 승인 출처를 관리하는 변환 마스터를 추가하고, BomLine이 사용 단위와 해당 시점의 유효한 변환 규칙을 명시적으로 참조하도록 해야 한다.
- issue-007 (medium): 대체 가능성을 품목 쌍과 방향만으로 고정한 현재 모델은 revision·BOM·사업장·기간에 따라 달라지는 승인 범위를 표현할 수 없으므로, 다음 단계 전에 문맥과 유효성을 가진 대체 정책으로 보완해야 한다.
  - root cause: 대체 정책이 문맥과 시간에 독립적인 품목 쌍 및 방향으로 고정되었으며, 버전·범위·유효성을 가진 정책으로 확장하면 조건별 대체를 구조 변경 없이 표현할 수 있어야 한다.
  - materiality: PLM의 대체 승인을 MES 자재 투입 판단에 안정적으로 연결하려면 승인 범위를 조건별로 보존해야 한다. 현재 구조에서는 같은 품목 쌍에 서로 다른 유효 정책을 무손실로 병존시킬 수 없어 MES가 승인 범위를 넘어선 부품을 허용할 수 있으므로 이 목적을 실질적으로 약화한다.
  - action: 다음 단계 전에 AlternatePart를 버전·유효기간·승인 상태를 가진 대체 정책으로 확장하고, 적용 BOM 또는 상위 품목과 사업장·라우팅 같은 제조 문맥을 선택적으로 참조하게 해야 한다. alternate_of는 권한 판단의 근거가 아니라 문맥 없는 탐색용 projection으로 한정해야 동일 품목 쌍의 여러 정책을 안전하게 병존시키고 승인 범위를 보존할 수 있다.
- issue-008 (medium): AlternatePart를 항상 대칭 관계로 정의하면서 direction에서 one_way를 허용하고 기본값으로 둔 현재 명세는 동시에 만족될 수 없으며, 대체 가능 방향에 대한 단일 기준을 제공하지 못한다.
  - root cause: AlternatePart의 대칭성 정의와 direction 스키마가 단일 방향성 규칙으로 통일되지 않았으며, 둘 중 하나의 규칙으로 정규화하면 논리적 불만족성이 사라져야 한다.
  - materiality: one_way 관계가 생성되거나 PLM과 MES가 서로 다른 규칙을 우선하면 동일한 부품 관계의 허용 방향이 시스템마다 달라진다. 그 결과 잘못된 자재 대체 또는 유효한 대체의 거부가 발생할 수 있어, PLM/MES 통합을 위한 단일 개념 기준이라는 목적이 약화된다.
  - action: 먼저 실제 업무 규칙이 비대칭 대체를 허용하는지 결정한 뒤 정의와 스키마를 같은 규칙으로 정규화해야 한다. 비대칭을 허용한다면 direction별 조건부 규칙으로 정의를 바꾸고, 항상 대칭이어야 한다면 one_way 값과 그 기본값을 제거해야 한다. 이 정책 결정과 명세 통일이 PLM/MES 구현 및 데이터 검증보다 선행되어야 한다.
- issue-011 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 재사용·개정되는 검사 사양과 특정 라우팅에서 실행되는 공정 단계를 동일한 정체성과 수명주기로 취급하므로 수정이 필요하다.
  - root cause: 검사 사양과 검사 실행 단계를 하나의 상속 계층으로 결합했으며, 사양과 실행 엔티티를 분리해 참조로 연결하면 수명주기 및 추적 의미가 분리되어야 한다.
  - materiality: 검사 기준을 개정·재사용하거나 라우팅을 실행할 때 계획과 공정 단계가 같은 개체로 처리되면 품질 계획 변경이 라우팅 변경으로 오인되고 검사 기준과 실행 단계 사이의 추적성이 왜곡된다. 이는 PLM 품질 사양과 MES 라우팅 단계의 개념 정합성을 약화한다.
  - action: 다음 단계 전에 InspectionPlan을 독립적인 검사 사양 엔티티로 분리하고, 검사 실행을 나타내는 InspectionOperation 또는 명시적인 Operation 하위 유형이 inspection_plan_ref로 이를 참조하도록 모델링해야 한다. 이 순서로 사양과 실행의 식별자·개정·재사용 수명주기를 먼저 분리해야 이후 PLM–MES 연계와 추적 관계를 일관되게 정의할 수 있다.
- issue-012 (medium): scrap_rate의 이름은 비율을, 설명은 계산 계수를 암시해 폐기 비율·수율·승수 중 어느 의미와 산식을 적용해야 하는지 확정할 수 없다. 생산계획 계산 전에 하나의 권위 있는 계산 의미로 결정해야 한다.
  - root cause: scrap_rate에서 비율과 계산 계수를 구분하지 않은 채 외부 값을 숫자 속성으로 복사했으며, 단위·범위·산식을 명시하면 계산 의미의 분기가 사라져야 한다.
  - materiality: PLM, MES, 생산계획 시스템이 같은 값을 qty_per/(1-rate), qty_per*(1+rate), qty_per*factor처럼 다르게 적용하면 계획 소요량·구매량·재고 차감량이 달라진다. 이는 BOM 수량을 시스템 간 일관되게 해석하려는 계약과 제조 운영 수량의 신뢰성을 약화한다.
  - action: 다음 생산계획 단계 전에 값을 폐기 비율, 수율 또는 승수 중 하나로 결정하고 단위, 허용 범위, 백분율 표현, qty_per 적용 산식을 명시해야 한다. 승수라면 scrap_factor처럼 의미에 맞게 이름을 바꾸고, 원천 시스템과 유효기간별 참조를 함께 관리해야 한다. 실제 생산계획 엑셀의 산식과 값 표현을 확인해 권위 의미를 확정한 뒤 PLM·MES·계획 시스템이 동일 계약을 사용하도록 해야 한다.
- issue-013 (medium): capacity_per_shift가 가용 시간과 산출 처리량이라는 서로 다른 차원의 값을 하나의 숫자로 표현해 소비자가 의미와 단위를 결정할 수 없으므로, 다음 단계 전에 용량 계약을 명확히 해야 한다.
  - root cause: 가용 시간과 산출 처리량을 하나의 일반 capacity 숫자로 축약했으며, 차원별 속성 또는 명시적 kind와 UOM으로 분리하면 해석 모호성이 사라져야 한다.
  - materiality: MES 통합 소비자가 이 값을 일률적으로 시간 또는 처리 개수로 해석하면 차원이 다른 값이 능력계획, 병목 판단, 작업 배정 계산에 혼입된다. 이는 작업장 용량을 공통 의미로 교환하고 라우팅 능력을 판단하려는 계약의 정확성을 약화한다.
  - action: 능력계획과 작업 배정에서 사용하기 전에 available_time_per_shift와 output_capacity_per_shift처럼 차원별 속성으로 분리하거나, capacity_value에 명시적 capacity_kind와 uom을 함께 두는 계약을 선택해야 한다. 출시 전 수정하거나 위험을 명시적으로 수용하는 결정을 다음 단계 전에 닫아야 하며, 새 용량 유형도 기존 값의 의미를 바꾸지 않고 추가할 수 있어야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-002: PLM/MES 통합의 품목·BOM·라우팅 개념 기준 및 변경 적용 일관성
- issue-003: PLM 설계변경을 MES의 품목·BOM·라우팅 구성에 정확히 전달하고 생산 시점별 적용 구성을 재현하는 개념 기준 Source finding context: 설계변경을 PLM에서 MES의 BOM·라우팅으로 정확히 전달하는 개념 기준 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준을 제공하는 목적 Source finding context: PLM 설계변경과 MES 생산 시점의 적용 revision을 일관되게 결정하는 계약 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리를 연결하는 개념 기준 제공
- issue-010: PLM 제품구조와 MES 제조 흐름 사이의 공통 개념 기준
- issue-004: 변경관리와 라우팅의 전 생애주기 통제, 감사 가능성 및 PLM/MES 반영 추적성 Source finding context: 변경관리의 통제 가능성과 PLM/MES 반영 추적성 Source finding context: 라우팅과 변경지시의 전 생애주기 관리 및 안전한 생산 사용 통제
- issue-005: PLM/MES 및 계획·원가 시스템 사이에서 운영 값의 출처와 의미를 일관되게 유지하는 것 Source finding context: PLM/MES 및 계획·원가 시스템 사이의 공통 개념과 값 해석 일관성 Source finding context: PLM/MES 통합 개념 기준에서 변경 후에도 운영 데이터의 출처와 의미를 유지하는 목적
- issue-006: PLM/MES 사이에서 BOM 기반 자재소요량과 현장 투입 수량을 안정적으로 교환·계산하는 것 Source finding context: BOM 기반 자재소요량과 MES 투입 수량의 일관된 계산 Source finding context: PLM/MES 사이에서 품목과 BOM 수량을 안정적으로 교환하는 공통 개념 제공
- issue-007: PLM의 대체 승인 정보를 MES 자재 투입 판단과 안정적으로 연결하는 개념 기준 Source finding context: PLM의 대체 승인 정보를 MES의 자재 투입 판단과 안정적으로 연결하는 개념 기준
- issue-008: PLM/MES 통합에서 대체 부품 관계의 단일한 개념 기준을 제공하는 것 Source finding context: PLM/MES 통합에서 대체 부품 관계의 단일한 개념 기준을 제공하는 목적
- issue-011: PLM 품질 사양과 MES 라우팅 단계의 개념 정합성
- issue-012: BOM 수량을 PLM/MES 및 생산계획에서 일관되게 해석하는 계약
- issue-013: MES 작업장 용량을 공통 의미로 교환하고 라우팅 능력을 판단하는 계약

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-002 (high) — BOM과 Routing이 독립적인 버전 및 유효기간을 갖지 않아 ECO 적용 시점이나 과거 생산 시점의 제조 구성을 확정적으로 재구성할 수 없다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 PLM·MES가 별도 버전 키나 외부 매핑으로 결손을 보완하는지는 경계 내 증거로 확인할 수 없지만, 대상 온톨로지 자체에는 그 계약과 연결 경로가 없다.
- 외부 시스템 자체에 별도 이력·대사 기능이 있는지는 경계 내 증거로 확인할 수 없지만, 온톨로지에는 그 기능과 연결할 식별·시점 계약이 없다.
- 실제 대체 승인에 필요한 차원은 경계 내 증거로 확정되지 않았으므로, 제안된 BOM·상위 품목·사업장·라우팅 문맥은 선택적 확장점으로 두어야 한다.

## Immediate Actions Required
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-010 (high): fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_now, accept_risk
- issue-011 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, accept_risk
- issue-013 (medium): fix_before_release, accept_risk

## Recommendations
- issue-001 (high): 필수 가치 권위가 누락되어 온톨로지의 PLM/MES 통합 목적 정렬 여부를 유효하게 판단할 수 없다. Source finding context: manufacturing-bom-ontology.yaml의 PLM/MES 통합 목적 및 운영 트레이드오프에 대한 가치 정렬 판단 Source finding context: .onto/review/20260718-6dc79b44/prompt-packets/axiology.prompt.md:46-68 — authority ranks 1–3 must be bound, and missing authority requires `insufficient evidence` with upstream evidence; .onto/review/20260718-6dc79b44/execution-preparation/review-context-manifest.yaml:72-91 — axiology receives only the invocation-derived alignment criterion among value inputs; .onto/review/20260718-6dc79b44/execution-preparation/materialized-input.md:35,94-100 — copied scrap rates, delayed revision synchronization, manual cost reconciliation, and field UOM conversion expose purpose-critical tradeoffs. value_type=purpose/tradeoff; alignment_direction=indeterminate Source finding context: 필수 canonical value authority가 바인딩되지 않아, 이 온톨로지가 PLM/MES 통합의 개념 기준이라는 목적에 정렬되는지 유효하게 판단할 수 없다. Source finding context: axiology 계약은 core lexicon, 제품화 및 ontology-as-code 원칙, active review contracts를 항상 바인딩하도록 요구하며, 누락 시 개인적 가치판단 대신 insufficient evidence를 제출하도록 명시한다. 따라서 관찰된 운영 트레이드오프가 허용 가능한 경계인지 목적 drift인지 결정할 근거가 없고, 이 렌즈의 적합성 결론을 신뢰할 수 없다. Source finding context: execution preparation에서 prompt packet에 명시된 rank 1–3 authority 문서를 axiology의 허용 컨텍스트로 실제 바인딩·주입한 뒤 이 렌즈를 다시 실행한다. 재실행 시 각 판단에 정확한 authority anchor, value type, alignment direction을 보존한다. Source finding context: .onto/review/20260718-6dc79b44/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: 이 온톨로지가 PLM/MES 통합의 개념 기준 문서로 적절한지 가치·목적 관점에서 검증하는 것 Source finding context: 복제 데이터와 지연·수기 처리 같은 운영 트레이드오프가 존재하지만 이를 평가할 의무적 canonical authority ranks 1–3가 axiology 컨텍스트에 없을 때 Source finding context: 목적 부합 또는 목적 drift라는 핵심 결론이 계약상 생성될 수 없어, 제조 운영 위험을 감수할지에 대한 리뷰의 의사결정 근거가 비어 있게 된다. Source finding context: execution preparation이 axiology 계약상 필수인 canonical authority ranks 1–3를 렌즈 컨텍스트에 바인딩하지 않았다. Source finding context: 대상에는 PLM/MES 기준 문서의 목적에 영향을 줄 수 있는 복제 값, 지연 동기화, 수기 대사 및 현장 환산이 명시되어 있다. Source finding context: 이 트레이드오프의 가치 정렬을 판정할 입력은 invocation-derived 사용자 의도 하나뿐이며 canonical 제품·온톨로지 원칙은 제공되지 않았다. Source finding context: axiology 계약은 ranks 1–3의 상시 바인딩과 누락 시 insufficient-evidence 처리를 요구한다.
- issue-009 (high): AlternatePart 내부의 방향 의미가 충돌하고 공식 관계 목록도 매개 엔티티를 우회해 direction 정보를 잃는다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart Source finding context: entities.AlternatePart.definition; entities.AlternatePart.attributes.direction Source finding context: 대체 관계의 대칭성 정의와 방향 속성이 서로 다른 의미를 부여한다. Source finding context: 동일 인스턴스가 정의상 양방향이면서 속성상 단방향일 수 있다. 시스템마다 정의 또는 direction 중 하나를 따르면 허용 대체품 집합이 달라져 잘못된 역방향 자재 대체가 발생할 수 있다. Source finding context: 대체 관계를 방향성 있는 substitution으로 정의하고 bidirectional을 명시적 특례로 만들거나, 항상 대칭 관계라면 direction과 primary/alternate 방향 의미를 제거한다. Source finding context: .onto/review/20260718-6dc79b44/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: PLM/MES 통합에서 대체 가능 품목의 공통 의미와 제조 투입 허용 범위를 제공하는 계약 Source finding context: one_way AlternatePart를 한 시스템은 정의에 따라 양방향으로, 다른 시스템은 direction에 따라 단방향으로 해석할 때 Source finding context: 승인되지 않은 역방향 대체 또는 유효한 대체 거부로 이어져 생산 자재 통제가 달라진다. Source finding context: 상호 호환성과 방향성 있는 대체를 하나의 AlternatePart 개념으로 혼합했다. Source finding context: AlternatePart 정의는 모든 대체 관계를 대칭 관계로 선언한다. Source finding context: 같은 엔티티의 direction은 one_way를 허용하고 이를 기본값으로 지정한다. Source finding context: 상호 호환성과 방향성 있는 대체를 하나의 개념으로 혼합한 것이 상충하는 의미를 만든다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart relation structure Source finding context: materialized-input.md:37-45, 84-91 Source finding context: 대체품 관계의 공식 관계 목록이 매개 엔티티 AlternatePart를 우회해 방향 속성과의 연결을 끊는다. Source finding context: 관계 그래프를 사용하는 소비자는 대체 관계에는 도달해도 그 관계의 방향을 담은 AlternatePart 인스턴스로 이동할 수 없다. 이로 인해 동일 개념이 속성 그래프와 relations 목록에서 서로 다른 연결 구조로 표현된다. Source finding context: relations에 Part→AlternatePart 및 AlternatePart→Part 연결을 정식으로 추가하고 direction을 그 매개 관계의 속성으로 유지한다. Part→Part 축약 관계를 유지한다면 정식 경로에서 결정적으로 파생되는 projection임을 명시한다. Source finding context: .onto/review/20260718-6dc79b44/round1/structure.findings.yaml#structure-candidate-002 Source finding context: PLM/MES가 동일한 대체품 관계와 방향 제약을 공유하도록 하는 개념 기준 제공 Source finding context: 통합 소비자가 relations 목록을 기준으로 대체품 그래프를 구축하거나 one_way와 bidirectional을 구분해야 할 때 Source finding context: 방향 정보 없는 Part 자기관계만 전달되어 허용되지 않은 역방향 대체가 가능해지거나 시스템별 대체품 해석이 달라질 수 있다. Source finding context: 속성을 가진 관계 엔티티와 축약 관계 사이의 정식 연결 및 파생 규칙이 정의되지 않았다. Source finding context: relations 그래프에서 AlternatePart가 누락되어 alternate_of와 direction 사이의 경로가 끊겨 있다. Source finding context: 대체 방향은 AlternatePart에만 저장되지만 공식 관계 항목은 Part→Part 축약 표기만 제공한다.

## Unique Finding Tagging
- issue-001 (high): 필수 가치 권위가 누락되어 온톨로지의 PLM/MES 통합 목적 정렬 여부를 유효하게 판단할 수 없다. Source finding context: manufacturing-bom-ontology.yaml의 PLM/MES 통합 목적 및 운영 트레이드오프에 대한 가치 정렬 판단 Source finding context: .onto/review/20260718-6dc79b44/prompt-packets/axiology.prompt.md:46-68 — authority ranks 1–3 must be bound, and missing authority requires `insufficient evidence` with upstream evidence; .onto/review/20260718-6dc79b44/execution-preparation/review-context-manifest.yaml:72-91 — axiology receives only the invocation-derived alignment criterion among value inputs; .onto/review/20260718-6dc79b44/execution-preparation/materialized-input.md:35,94-100 — copied scrap rates, delayed revision synchronization, manual cost reconciliation, and field UOM conversion expose purpose-critical tradeoffs. value_type=purpose/tradeoff; alignment_direction=indeterminate Source finding context: 필수 canonical value authority가 바인딩되지 않아, 이 온톨로지가 PLM/MES 통합의 개념 기준이라는 목적에 정렬되는지 유효하게 판단할 수 없다. Source finding context: axiology 계약은 core lexicon, 제품화 및 ontology-as-code 원칙, active review contracts를 항상 바인딩하도록 요구하며, 누락 시 개인적 가치판단 대신 insufficient evidence를 제출하도록 명시한다. 따라서 관찰된 운영 트레이드오프가 허용 가능한 경계인지 목적 drift인지 결정할 근거가 없고, 이 렌즈의 적합성 결론을 신뢰할 수 없다. Source finding context: execution preparation에서 prompt packet에 명시된 rank 1–3 authority 문서를 axiology의 허용 컨텍스트로 실제 바인딩·주입한 뒤 이 렌즈를 다시 실행한다. 재실행 시 각 판단에 정확한 authority anchor, value type, alignment direction을 보존한다. Source finding context: .onto/review/20260718-6dc79b44/round1/axiology.findings.yaml#axiology-candidate-001 Source finding context: 이 온톨로지가 PLM/MES 통합의 개념 기준 문서로 적절한지 가치·목적 관점에서 검증하는 것 Source finding context: 복제 데이터와 지연·수기 처리 같은 운영 트레이드오프가 존재하지만 이를 평가할 의무적 canonical authority ranks 1–3가 axiology 컨텍스트에 없을 때 Source finding context: 목적 부합 또는 목적 drift라는 핵심 결론이 계약상 생성될 수 없어, 제조 운영 위험을 감수할지에 대한 리뷰의 의사결정 근거가 비어 있게 된다. Source finding context: execution preparation이 axiology 계약상 필수인 canonical authority ranks 1–3를 렌즈 컨텍스트에 바인딩하지 않았다. Source finding context: 대상에는 PLM/MES 기준 문서의 목적에 영향을 줄 수 있는 복제 값, 지연 동기화, 수기 대사 및 현장 환산이 명시되어 있다. Source finding context: 이 트레이드오프의 가치 정렬을 판정할 입력은 invocation-derived 사용자 의도 하나뿐이며 canonical 제품·온톨로지 원칙은 제공되지 않았다. Source finding context: axiology 계약은 ranks 1–3의 상시 바인딩과 누락 시 insufficient-evidence 처리를 요구한다.
- issue-009 (high): AlternatePart 내부의 방향 의미가 충돌하고 공식 관계 목록도 매개 엔티티를 우회해 direction 정보를 잃는다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart Source finding context: entities.AlternatePart.definition; entities.AlternatePart.attributes.direction Source finding context: 대체 관계의 대칭성 정의와 방향 속성이 서로 다른 의미를 부여한다. Source finding context: 동일 인스턴스가 정의상 양방향이면서 속성상 단방향일 수 있다. 시스템마다 정의 또는 direction 중 하나를 따르면 허용 대체품 집합이 달라져 잘못된 역방향 자재 대체가 발생할 수 있다. Source finding context: 대체 관계를 방향성 있는 substitution으로 정의하고 bidirectional을 명시적 특례로 만들거나, 항상 대칭 관계라면 direction과 primary/alternate 방향 의미를 제거한다. Source finding context: .onto/review/20260718-6dc79b44/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: PLM/MES 통합에서 대체 가능 품목의 공통 의미와 제조 투입 허용 범위를 제공하는 계약 Source finding context: one_way AlternatePart를 한 시스템은 정의에 따라 양방향으로, 다른 시스템은 direction에 따라 단방향으로 해석할 때 Source finding context: 승인되지 않은 역방향 대체 또는 유효한 대체 거부로 이어져 생산 자재 통제가 달라진다. Source finding context: 상호 호환성과 방향성 있는 대체를 하나의 AlternatePart 개념으로 혼합했다. Source finding context: AlternatePart 정의는 모든 대체 관계를 대칭 관계로 선언한다. Source finding context: 같은 엔티티의 direction은 one_way를 허용하고 이를 기본값으로 지정한다. Source finding context: 상호 호환성과 방향성 있는 대체를 하나의 개념으로 혼합한 것이 상충하는 의미를 만든다. Source finding context: manufacturing-bom-ontology.yaml — AlternatePart relation structure Source finding context: materialized-input.md:37-45, 84-91 Source finding context: 대체품 관계의 공식 관계 목록이 매개 엔티티 AlternatePart를 우회해 방향 속성과의 연결을 끊는다. Source finding context: 관계 그래프를 사용하는 소비자는 대체 관계에는 도달해도 그 관계의 방향을 담은 AlternatePart 인스턴스로 이동할 수 없다. 이로 인해 동일 개념이 속성 그래프와 relations 목록에서 서로 다른 연결 구조로 표현된다. Source finding context: relations에 Part→AlternatePart 및 AlternatePart→Part 연결을 정식으로 추가하고 direction을 그 매개 관계의 속성으로 유지한다. Part→Part 축약 관계를 유지한다면 정식 경로에서 결정적으로 파생되는 projection임을 명시한다. Source finding context: .onto/review/20260718-6dc79b44/round1/structure.findings.yaml#structure-candidate-002 Source finding context: PLM/MES가 동일한 대체품 관계와 방향 제약을 공유하도록 하는 개념 기준 제공 Source finding context: 통합 소비자가 relations 목록을 기준으로 대체품 그래프를 구축하거나 one_way와 bidirectional을 구분해야 할 때 Source finding context: 방향 정보 없는 Part 자기관계만 전달되어 허용되지 않은 역방향 대체가 가능해지거나 시스템별 대체품 해석이 달라질 수 있다. Source finding context: 속성을 가진 관계 엔티티와 축약 관계 사이의 정식 연결 및 파생 규칙이 정의되지 않았다. Source finding context: relations 그래프에서 AlternatePart가 누락되어 alternate_of와 direction 사이의 경로가 끊겨 있다. Source finding context: 대체 방향은 AlternatePart에만 저장되지만 공식 관계 항목은 Part→Part 축약 표기만 제공한다.

## Shared Phenomenon Summary
- none
