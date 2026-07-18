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
- issue-001 (high): 세 신용등급 스케일, 자동 산출 등급, 수동 조정값이 하나의 권위 모델로 구분·연결되지 않아 동일 차주나 익스포저의 최종 등급이 소비 시스템별로 달라질 수 있다.
  - root cause: 신용등급의 정규 의미, 변환 권위, 산출 원천과 수동 조정 우선순위를 온톨로지에 구조화하지 않아 의미 분산과 도출 계보 단절이 함께 발생한다.
  - materiality: 온톨로지의 목적은 리스크 엔진과 보고 시스템이 단일하고 추적 가능한 신용등급 기준을 공유하게 하는 것이다. 그러나 소비자가 각자 스케일을 변환하거나 자동 산출값과 수동 조정값을 같은 의미로 취급하면 등급의 의미와 원천이 달라져 리스크 계산과 보고 결과의 비교, 재현 및 감사를 신뢰할 수 없다.
  - action: 먼저 하나의 정규 신용평가 개념을 정의하고 평가 주체, 모형·스케일, 유효시점과 원천을 명시해야 한다. 그 위에 버전과 유효기간 및 책임자가 있는 정규 스케일 매핑을 온톨로지 권위로 두고, Exposure와 실제 적용된 RiskRating을 직접 연결해 도출 계보와 복수 평가 선택 규칙을 구조화해야 한다. 마지막으로 수동 조정을 원본·변환 등급과 분리된 override 개념으로 모델링하고 사유, 승인 주체, 적용 범위, 유효시점 및 우선순위를 필수화해야 한다. 이 순서가 최종 권위값의 의미와 원천을 먼저 고정한 뒤 조정 규칙을 결정하게 한다.
- issue-004 (high): 시간에 따라 변하는 등급·한도·임계값과 조정·환산·정책 규칙이 현재값 또는 자유문장으로만 표현되고 산출 결과도 당시 사용한 값·규칙에 연결되지 않아, 과거 기준일의 상태와 계산을 동일하게 재현할 수 없다.
  - root cause: 시간에 따라 변하는 리스크 값과 산출 규칙을 버전·유효기간을 가진 권위 개념으로 분리하지 않고 현재 속성이나 자유문장으로 표현했다.
  - materiality: 이 결함은 리스크 엔진과 보고 시스템이 같은 기준일에도 서로 다른 현재값, 환율, 수동 조정 또는 정책을 선택하게 만들 수 있다. 그 결과 차이가 실제 업무 데이터 변화인지 규칙 버전 차이인지 구분할 수 없고, 공유 개념 권위의 핵심 목적인 시간적으로 안정적인 산출, 과거 보고 재생, 변경 전후 비교 및 감사를 약화시킨다.
  - action: 먼저 시간가변 상태와 규칙에 공통으로 적용할 effective_from, effective_to, recorded_at, as_of, supersedes 및 버전 식별 계약을 정의해야 한다. 다음으로 등급·한도·리스크 성향 값과 조정·환산·집계·정책 규칙을 이 계약을 따르는 버전형 상태·정책 개념으로 분리한다. 마지막으로 각 산출 결과가 기준시점, 사용한 상태·규칙 버전, 입력 스냅샷 또는 권위 데이터셋, 조정 주체와 사유를 참조하도록 연결해야 한다. 이 순서를 따라야 과거와 신규 정책을 병존시키고 계산을 결정적으로 재생할 수 있다.
- issue-005 (high): RiskAppetite가 범위 있는 정책, 수치 한도, 시점별 준수 평가로 구분되지 않은 채 관계 그래프에서 고립되어 있어, 복수 포트폴리오·상품·통화·집계 또는 정책 버전에서는 준수 상태의 대상·기준·시점을 구조적으로 결정할 수 없다. 세 참여 렌즈는 결합된 결함과 high 심각도에 최종 합의했다.
  - root cause: RiskAppetite를 적용 범위가 있는 정책, 수치 기준, 시점별 평가 결과로 분리하지 않고 하나의 고립된 엔터티에 압축했다.
  - materiality: 리스크 엔진과 보고 시스템이 동일한 위반 분류와 준수 상태를 공유하려면 같은 ExposureAggregate에 어떤 한도를 어느 기간·통화 기준으로 적용했는지 식별할 수 있어야 한다. 현재는 소비자가 이를 별도로 추론해야 하므로 동일 데이터가 시스템에 따라 compliant 또는 breached로 다르게 판정될 수 있어 선언된 목적을 직접 훼손한다.
  - action: 먼저 RiskAppetite 정책, 범위가 지정된 한도, 시점별 compliance assessment를 별도 개념으로 분리해야 한다. 다음으로 한도에 포트폴리오·세그먼트·상품·통화·측정기간·유효기간을 부여하고, 평가를 대상 ExposureAggregate·적용 한도·평가 시점·산식 및 통화와 기계 판독 가능한 관계로 연결해야 한다. 이 순서가 정책과 결과의 생명주기를 분리하고 준수 판정의 논항을 명시해 소비자 간 일관성을 회복한다.
- issue-006 (high): 병존하는 세 신용등급 체계에 canonical scale과 온톨로지 내부의 권위 있는 변환 개념이 없어, 동일 위험의 등급이 소비 시스템마다 달라질 수 있는 중대한 일관성 결함이다.
  - root cause: 병존하는 신용등급 체계를 하나의 권위 있는 분류체계와 정식 변환 개념으로 통합하지 않았다.
  - materiality: 리스크 엔진과 보고 시스템이 동일 차주나 익스포저를 서로 다르게 분류하면 집계, 한도 판단, 보고 수치의 비교 가능성이 무너진다. 따라서 공통 등급 분류와 단일 개념 권위를 제공하려는 공유 모델의 핵심 목적을 현재 직접 저해한다.
  - action: 먼저 canonical rating scale과 그 authoritative source 및 소유자를 지정해야 한다. 이어 각 기존 스케일을 RatingScale으로 명시하고, source_grade, target_grade, mapping_version, effective period, owner를 갖는 RatingMapping으로 변환을 모델링해야 한다. 이 순서가 필요한 이유는 기준 스케일의 권위를 먼저 확정해야 버전별 변환 결과를 일관되게 판정하고 재현할 수 있기 때문이다.
- issue-009 (high): 변경 가능한 분류값을 버전 없는 폐쇄형 인라인 enum으로 고정한 현재 구조는 범주 변경 시 하위 호환성, 과거 의미 재현, 시스템 간 연속성을 보장하지 못하므로 반드시 수정해야 하는 high 이슈이다.
  - root cause: 분류값을 수명주기가 있는 독립 개념이 아니라 엔터티 내부의 버전 없는 폐쇄형 enum으로 모델링했다.
  - materiality: 새 세그먼트·상품·담보·등급을 추가하거나 기존 값을 폐기·분할·통합할 때 온톨로지와 enum 의존 소비자를 동시에 변경해야 한다. 또한 레코드가 적용된 분류 버전을 보존하지 않아 과거 데이터의 의미가 비결정적으로 변할 수 있으므로, 리스크 엔진과 보고 시스템이 공유하는 확장 가능한 개념 권위라는 목적이 훼손된다.
  - action: 분류체계를 독립된 버전형 코드 목록 개념으로 분리하고 각 코드에 안정 식별자, 버전, 유효 시작·종료일, 상태, 대체 코드 및 상위 코드 관계를 정의해야 한다. 각 업무 레코드에는 적용된 코드 목록 버전을 보존해야 하며, 이후 소비자가 이 권위 구조와 버전을 사용하도록 전환해야 범주 변경의 호환성과 과거 의미 재현을 함께 보장할 수 있다.
- issue-010 (high): 신용등급 스케일 간 변환이 소비 시스템별 무버전 로직에 맡겨져 있어, 등급체계가 변경되면 변환 결과의 연속성과 과거 산출의 재현성을 보장할 수 없다.
  - root cause: 신용등급 스케일 간 변환을 온톨로지의 버전형 권위 개념으로 모델링하지 않고 외부 위키와 각 소비 시스템에 분산했다.
  - materiality: 리스크 엔진과 보고 시스템이 동일한 원천 등급을 서로 다른 규칙이나 시점으로 변환할 수 있으므로, 두 시스템이 공유해야 할 단일 등급 개념 기준이 무너진다. 특히 등급 경계·모형·매핑 변경이나 신규 스케일 도입 시 결과 비교와 과거 보고 재현이 불가능해질 수 있어 중대한 현재 차단 요인이다.
  - action: 먼저 온톨로지에 원천·대상 스케일, 행별 유효기간, 승인 권위, 변환 버전 및 비매핑 처리 방식을 갖춘 버전형 RatingMapping을 권위 개념으로 추가해야 한다. 그다음 리스크 엔진과 보고 시스템이 이 공통 매핑을 사용하도록 연결하고, 각 산출 등급에 적용한 매핑 버전을 기록해야 한다. 이 순서가 지켜져야 변경 전후 결과 비교, 단계적 이행과 과거 산출 재현이 가능하다.
- issue-011 (high): Collateral을 Exposure의 하위 유형으로 선언한 것은 Collateral을 독립 담보 자산으로 정의하고 `Exposure secured_by Collateral` 관계로 연결한 모델과 직접 충돌하는 중대한 유형 오류다.
  - root cause: 관계로 연결되는 담보 자산과 신용 익스포저를 상속 가능한 동일 존재론적 유형으로 혼동했다.
  - materiality: 소비자가 `is_a`를 유형 상속이나 분류 규칙으로 적용하면 Collateral이 Exposure로 처리되고 Exposure 속성까지 상속할 수 있다. 그 결과 리스크 엔진의 계산 대상과 보고 시스템의 집계 대상이 달라져, 두 시스템에 동일한 엔터티 유형과 관계 의미를 제공하려는 개념 권위 문서의 목적이 훼손된다.
  - action: 현재 대상에서 `Collateral.is_a: Exposure`를 제거하고 Collateral을 독립 엔터티로 유지해야 한다. 이후 담보와 익스포저의 연결은 기존 `secured_by` 관계를 권위 있는 의미로 사용해야 하며, 이 유형 수정이 계산 및 보고 분류 규칙보다 먼저 반영되어야 잘못된 상속에 기반한 소비자 동작을 차단할 수 있다.
- issue-002 (medium): 한도 소진율 계산에 사용하는 환율과 분산 한도 값의 단일 권위 및 계산 스냅샷이 정의되지 않아, 동일 차주·포지션·기준일에도 리스크 엔진과 보고 시스템이 서로 다른 소진율과 한도 초과 판단을 낼 수 있다.
  - root cause: 환율과 분산 한도 값을 권위와 시점이 식별된 공유 계산 입력으로 모델링하지 않고 소비 시스템별 로컬 데이터에 위임했다.
  - materiality: 공유 온톨로지의 목적은 리스크 엔진과 보고 시스템에 일관된 한도·익스포저 및 소진율 기준을 제공하는 것이다. 그러나 복수 통화이거나 승인 시스템과 CRM의 값·갱신 시점이 다르면 시스템별 로컬 입력이 서로 다른 결과를 만들 수 있어 운영 조치와 보고를 조정할 공통 근거가 사라진다. 따라서 공유 계산을 운영에 사용하기 전에 해소해야 하는 material한 중간 심각도 결함이다.
  - action: 다음 단계 전에 권위 있는 LimitBalance와 FxRateSnapshot을 공유 개념으로 정의해야 한다. 각 입력에 source_system, authority, as_of, 기준 통화와 통화쌍 방향, 환율 유형·버전 및 반올림 규칙을 명시하고, 소진율 계산은 동일 기준 통화와 동일 스냅샷의 한도·환율 입력을 참조하도록 연결해야 한다. 계산 결과에도 사용한 입력 식별자를 보존해야 시스템 간 결과 일치와 사후 재현이 가능하다.
- issue-003 (medium): ExposureAggregate를 기준시점이 없는 현재 전수 합계와 월말 배치 스냅샷으로 동시에 사용하고, 그 값을 준수 상태에 연결해 공유 리스크 상태의 시간적 의미가 불명확하다.
  - root cause: ExposureAggregate의 평가 기준시점과 데이터 반영 마감시점을 구분하지 않아 총계 정의 충돌과 준수 상태의 시간적 모호성이 발생한다.
  - materiality: 월말 배치 후 신규 여신이 발생하거나 임계값이 변경되면 동일한 total_amount와 compliant/breached 상태가 서로 다른 시점의 익스포저와 기준을 뜻할 수 있다. 따라서 리스크 엔진과 보고 시스템의 파생 지표, 운영 판단, 보고 결과가 일치한다는 신뢰가 약화된다.
  - action: 다음 단계 전에 ExposureAggregate를 as_of와 data_cutoff가 명시된 스냅샷으로 한정하고 현재 총계가 필요하면 별도 개념으로 분리해야 한다. 이어서 준수 결과를 사용한 ExposureAggregate, 적용된 RiskAppetite 임계값의 유효시점, 계산시점에 연결하고 월말 공식 상태와 일중 잠정 상태 및 신선도 정책을 구분해야 한다. 그래야 총계 의미를 먼저 확정한 뒤 재현 가능하고 시스템 간 일관된 준수 상태를 산출할 수 있다.
- issue-007 (medium): 수동 등급 조정이 Exposure.risk_grade의 단순 상태 덮어쓰기로 표현되어 원래 등급, 조정 행위자·시각·근거·승인 및 유효기간을 추적할 수 없다. 따라서 엔진 산출값과 최종 보고 등급을 구분하고 변경 이력을 재현할 수 있는 감사 가능한 조정 사건이 필요하다.
  - root cause: 수동 등급 조정을 원본 등급과 분리된 감사 가능한 사건으로 모델링하지 않고 상태 덮어쓰기로만 허용했다.
  - materiality: 보고서 팀이 엔진 산출 등급을 수동 조정하면 최종 등급의 출처와 정당성을 검증하거나 변경 전 상태를 재현할 수 없다. 이는 오류 조사, 이의제기 및 감사에서 책임과 근거를 확인하지 못하게 하므로 공유 등급 결과의 추적 가능성과 보고 통제를 실질적으로 약화한다.
  - action: 원본 등급과 분리된 RatingAdjustment 또는 OverrideEvent를 정의하고 original_grade, adjusted_grade, actor, adjusted_at, reason 또는 evidence_ref, approval, status 및 effective period를 포함해야 한다. Exposure.risk_grade는 이 사건에서 도출되도록 연결해야 하며, 조정 경로를 운영하거나 보고에 사용하기 전에 이 감사 계보를 확보해야 한다.
- issue-012 (medium): Exposure.ltv는 원천 금액에서 일관되게 재현할 수 있는 파생 결과가 아니라 산식·기준시점·원천 참조가 없는 독립 입력으로 모델링되어 있어, 담보 리스크 분류와 보고에 사용하기 전에 바로잡아야 한다.
  - root cause: 도메인 산식으로 해석되는 LTV를 원천 개념에서 파생되는 값이 아니라 출처·시점 없는 독립 입력으로 모델링했다.
  - materiality: Exposure.amount나 Collateral.appraised_value가 변경되거나 서로 다른 시점의 값이 사용되면 동일한 ltv 이름 아래 상충하는 값이 모두 정당화될 수 있다. 이 때문에 리스크 엔진과 보고 시스템이 서로 다른 LTV를 사용하여 담보 리스크 분류와 보고 결과가 불일치할 수 있으므로, 공유 비율을 일관되게 계산하고 해석하려는 목적이 약화된다.
  - action: 다음 단계 전에 LTV의 분자·분모, 다중 담보 집계 규칙, 평가 기준과 as_of를 권위 있는 계산 규칙으로 정의해야 한다. 가능한 경우 LTV를 원천값에서 파생하고, 저장해야 한다면 계산 시점·산식 버전·사용한 원천 및 담보 집합 참조를 함께 보존하며 원천 변경 시 재계산 규칙을 적용해야 한다. 이는 계산 재현성과 엔진·보고 간 일관성을 확보하기 위해 필요하다.
- issue-013 (medium): ExposureAggregate와 원천 Exposure 사이에 명시적인 집계 의존 관계와 포함 범위가 없어, 관계 그래프만으로 특정 총익스포저의 입력 집합과 계보를 결정할 수 없다.
  - root cause: 파생 집계와 그 원천 Exposure 사이의 합산 의존 관계를 relations에 선언하지 않았다.
  - materiality: 리스크 엔진과 보고 시스템이 동일한 총익스포저를 공유하려면 같은 Exposure 집합을 재현 가능하게 선택해야 한다. 현재는 각 소비자가 정의 문장을 해석해 별도 선택 규칙을 구현해야 하므로 결과의 일관성, 재현성, 추적 가능성이 약화된다.
  - action: 다음 단계 전에 ExposureAggregate에서 Exposure로 향하는 명시적 집계 원천 관계를 추가하고, borrower_ref 또는 동등한 명시적 범위 조건으로 포함 대상 Exposure를 규정해야 한다. 그래야 소비 시스템이 동일한 입력 집합을 구성하고 집계 계보를 검증할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: resolved
- issue-006: no-deliberation-needed
- issue-009: resolved
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 공유하는 단일하고 추적 가능한 신용등급 개념 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서 Source finding context: 리스크 엔진과 보고 시스템이 같은 신용등급 개념 기준을 공유하는 목적 Source finding context: 리스크 엔진 등급을 보고 시스템의 익스포저 등급으로 일관되게 전달하는 공유 개념 기준
- issue-004: 리스크 엔진과 보고 시스템이 공유하는 시간적으로 안정적이고 재현 가능한 개념 권위 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 재현 가능한 개념 권위 문서 Source finding context: 리스크 엔진과 보고 시스템 사이의 시간적으로 안정적인 공통 산출 기준
- issue-005: 리스크 엔진과 보고 시스템이 공유하는 리스크 성향 위반 분류와 준수 상태 Source finding context: 공유된 리스크 성향 위반 분류와 준수 상태 Source finding context: 공유 개념 기준에서 리스크 정책과 그 준수 결과를 일관되게 해석하는 목적 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서로서 RiskAppetite 위반 및 준수 상태를 일관되게 판정하는 목적
- issue-006: 리스크 엔진과 보고 시스템 사이의 공통 등급 분류 및 개념 권위
- issue-009: 리스크 엔진과 보고 시스템이 공유하는 확장 가능한 개념 권위 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 확장 가능한 개념 권위 문서
- issue-010: 리스크 엔진과 보고 시스템이 공유하는 단일 등급 개념 기준
- issue-011: 리스크 엔진과 보고 시스템이 동일한 엔터티 유형과 관계 의미를 공유하는 목적 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서로서 동일한 엔터티 유형과 관계 의미를 제공하는 목적
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 일관된 한도·익스포저 및 소진율 기준 Source finding context: 리스크 엔진과 보고 시스템 사이의 공유 한도·익스포저 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 일관된 한도 소진율
- issue-003: 리스크 엔진과 보고 시스템이 공유하는 시간적으로 일관된 총익스포저와 리스크 준수 상태 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 시간적으로 해석 가능한 리스크 상태 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 총익스포저 개념 기준
- issue-007: 공유 등급 결과의 추적 가능성과 보고 통제
- issue-012: 리스크 엔진과 보고 시스템이 공유하는 비율 개념을 일관되게 계산하고 해석하는 목적
- issue-013: ExposureAggregate를 리스크 엔진과 보고 시스템이 동일한 총익스포저 개념으로 사용하는 목적

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 세 신용등급 스케일, 자동 산출 등급, 수동 조정값이 하나의 권위 모델로 구분·연결되지 않아 동일 차주나 익스포저의 최종 등급이 소비 시스템별로 달라질 수 있다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 소비 시스템별 매핑 결과의 차이는 현재 경계에서 확인하지 않았으나, 소비자별 분기 가능성은 확정된 문제 구조에 포함된다.
- 정확한 스케일 간 대응값은 경계 밖 자료 없이 판단하지 않았다.
- 각 운영 시스템이 별도 감사 로그나 정책 이력을 보존하는지는 현재 경계에서 확인되지 않았으나, 공유 온톨로지에는 이를 식별하거나 연결하는 계약이 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-009 (high): fix_now
- issue-010 (high): fix_now
- issue-011 (high): fix_now
- issue-002 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up

## Recommendations
- issue-008 (medium): 정상 여신에서 연체·부실로 이어지는 신용위험 lifecycle과 외부 상태 권위의 연결이 공유 모델에서 단절되어 있다. Source finding context: credit-risk-ontology.yaml — 연체·부실 lifecycle 범위 Source finding context: notes[1]은 연체/부실(default) 상태를 별도 연체관리 시스템에서 다루며 이 온톨로지의 범위 밖이라고 명시하고, 외부 상태를 연결하는 엔터티·관계·식별자·경계 계약은 정의하지 않는다. Source finding context: 차주의 정상 여신에서 연체·부실로 이어지는 신용위험 lifecycle 구간이 공유 모델에서 단절되어 있다. Source finding context: 리스크 엔진이나 보고 시스템이 연체·부실 분류를 필요로 하는 경우 이 온톨로지만으로 차주의 위험 상태 전이를 표현하거나 외부 시스템의 상태를 공통 의미로 해석할 수 없다. 다만 실제 소비자 범위가 연체 이전 단계로 제한되는지는 현재 경계에서 확인할 수 없다. Source finding context: 범위를 전체 여신 lifecycle로 확장해 Delinquency/DefaultEvent와 상태 전이를 정의하거나, 의도적 분리를 유지한다면 external_credit_status_ref, authoritative system, 상태 매핑, 기준시각과 동기화 계약을 최소 경계 개념으로 추가한다. Source finding context: .onto/review/20260718-41224df0/round1/coverage.findings.yaml#coverage-candidate-005 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준 Source finding context: 소비 시스템이 연체·부실 상태를 포함한 신용위험 분류나 보고를 수행할 때 Source finding context: 핵심 위험 상태가 공통 모델 밖에서 소비자별 의미로 해석되어 전체 lifecycle 보고와 등급 연계의 일관성이 약화된다. Source finding context: 연체·부실 하위 영역을 범위에서 제외하면서 외부 권위와 연결하는 경계 개념을 함께 정의하지 않았다. Source finding context: 공유 모델에서 연체·부실 상태와 그 전이를 표현할 수 없다. Source finding context: 해당 상태는 별도 시스템에 위임되지만 외부 참조나 상태 매핑 관계가 없다. Source finding context: 신용위험 lifecycle의 종결·악화 구간이 온톨로지 범위에서 단절되어 있다.

## Unique Finding Tagging
- issue-008 (medium): 정상 여신에서 연체·부실로 이어지는 신용위험 lifecycle과 외부 상태 권위의 연결이 공유 모델에서 단절되어 있다. Source finding context: credit-risk-ontology.yaml — 연체·부실 lifecycle 범위 Source finding context: notes[1]은 연체/부실(default) 상태를 별도 연체관리 시스템에서 다루며 이 온톨로지의 범위 밖이라고 명시하고, 외부 상태를 연결하는 엔터티·관계·식별자·경계 계약은 정의하지 않는다. Source finding context: 차주의 정상 여신에서 연체·부실로 이어지는 신용위험 lifecycle 구간이 공유 모델에서 단절되어 있다. Source finding context: 리스크 엔진이나 보고 시스템이 연체·부실 분류를 필요로 하는 경우 이 온톨로지만으로 차주의 위험 상태 전이를 표현하거나 외부 시스템의 상태를 공통 의미로 해석할 수 없다. 다만 실제 소비자 범위가 연체 이전 단계로 제한되는지는 현재 경계에서 확인할 수 없다. Source finding context: 범위를 전체 여신 lifecycle로 확장해 Delinquency/DefaultEvent와 상태 전이를 정의하거나, 의도적 분리를 유지한다면 external_credit_status_ref, authoritative system, 상태 매핑, 기준시각과 동기화 계약을 최소 경계 개념으로 추가한다. Source finding context: .onto/review/20260718-41224df0/round1/coverage.findings.yaml#coverage-candidate-005 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준 Source finding context: 소비 시스템이 연체·부실 상태를 포함한 신용위험 분류나 보고를 수행할 때 Source finding context: 핵심 위험 상태가 공통 모델 밖에서 소비자별 의미로 해석되어 전체 lifecycle 보고와 등급 연계의 일관성이 약화된다. Source finding context: 연체·부실 하위 영역을 범위에서 제외하면서 외부 권위와 연결하는 경계 개념을 함께 정의하지 않았다. Source finding context: 공유 모델에서 연체·부실 상태와 그 전이를 표현할 수 없다. Source finding context: 해당 상태는 별도 시스템에 위임되지만 외부 참조나 상태 매핑 관계가 없다. Source finding context: 신용위험 lifecycle의 종결·악화 구간이 온톨로지 범위에서 단절되어 있다.

## Shared Phenomenon Summary
- none
