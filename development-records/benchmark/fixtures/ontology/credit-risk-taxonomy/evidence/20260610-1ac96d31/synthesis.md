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
- issue-001 (high): 병행 관리되는 등급·한도·환율 값의 권위와 변환 규칙이 온톨로지 내부에 닫혀 있지 않아, 리스크 엔진과 보고 시스템이 공유해야 할 개념 기준과 산출 재현성이 약해집니다.
  - root cause: 등급·한도·환율처럼 병행 관리되는 핵심 값의 canonical source, precedence, conflict-resolution, versioned mapping/conversion policy가 온톨로지 내부에 닫혀 있지 않다.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 동일한 등급 분류, 한도 소진율, 환산 기준을 공유하게 하는 것입니다. 그런데 엔진 등급, 내부 등급, 보고 등급, 승인 한도, CRM available_limit, 시스템별 환율 테이블이 각자 권위처럼 쓰일 수 있으면 동일 차주·익스포저에 대해 서로 다른 등급이나 소진율이 모두 정당화됩니다. 따라서 문제는 단순한 모델링 취향이 아니라 공유 권위 문서라는 목적 자체를 약화하는 중대한 결함입니다.
  - action: 등급·한도·환율의 권위 모델을 온톨로지 개념으로 승격해야 합니다. SourceAuthority, RatingMapping/RatingOverride, ConversionPolicy 같은 개념을 두고 canonical_source_system, precedence_order, mapping_version, effective_date, conflict_resolution_rule, override_authority, override_reason, applied_at을 명시해야 합니다. 특히 직접 증거가 강한 등급 경로부터 엔진 산출 등급, 변환 등급, 보고 조정 등급을 분리하고 deterministic precedence와 derivation/adjustment relation을 닫아야 하며, 한도·환율도 동일한 권위·버전·환산 정책 아래에서 report_value와 engine_value 같은 projection으로만 갈라지게 해야 합니다.
- issue-002 (high): ExposureAggregate.total_amount가 현재 총익스포저처럼 정의·명명되어 있지만 실제로는 월말 배치 스냅샷으로 저장되며, 이 값이 Limit utilization과 RiskAppetite 판단에 사용되어 stale 익스포저가 운영 판단으로 전파되는 high/material 이슈입니다.
  - root cause: ExposureAggregate.total_amount가 실시간 전체 합계와 월말 배치 스냅샷이라는 서로 다른 시간 권위를 하나의 current-like 개념으로 겹쳐 선언한다.
  - materiality: 리스크 엔진과 보고 시스템이 같은 기준 시점의 익스포저 총액, 한도 소진율, 리스크 성향 준수 상태를 공유해야 한다는 목적을 약화합니다. 일중 신규 여신이 발생한 뒤 다음 월말 배치 전까지 stale total_amount가 현재 총익스포저처럼 해석되면 한도 초과나 RiskAppetite 위반 발견·보고가 지연될 수 있습니다.
  - action: ExposureAggregate를 as_of 기준의 배치 스냅샷으로 좁히거나 current_total_amount와 month_end snapshot을 별도 속성/엔티티로 분리해야 합니다. 각 값에는 포함 범위, as_of, freshness SLA, 일중 포함 여부, 사용할 수 있는 판단 경로를 명시하고, 일중 판단에는 current 권위 값을 사용하며 월말 보고용 스냅샷은 운영 판단 사용을 금지하거나 제한해야 합니다.
- issue-003 (high): 차주 등급, 엔진 산출 등급, 보고 등급이 현재값 속성으로만 모델링되어 있어 과거 보고일이나 월말 배치 기준의 등급을 온톨로지 내부 정보만으로 재구성하기 어렵다.
  - root cause: 시점 의존 등급 값을 현재값 속성으로만 모델링하고 이력, 유효기간, 산출시각, 버전 개념을 분리하지 않았다.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준을 제공하는 것이다. 그런데 핵심 분류값인 등급에 기준시점, 유효기간, 이력 또는 버전 의미가 없으면 특정 보고일에 어떤 등급이 적용되었는지 검증할 수 없고, 엔진 산출 등급과 보고 등급의 차이도 감사 가능한 방식으로 대조하기 어렵다. 따라서 공유 권위 문서로서의 재현성과 감사 가능성이 약해진다.
  - action: RatingSnapshot, RatingHistory 또는 동등한 time-qualified rating 개념을 추가해야 한다. 이 개념은 차주·엔진·보고 등급에 산출시각, 적용시작일, 적용종료일, 원천, 버전 또는 이전/다음 참조를 부여하고, ExposureAggregate.as_of와 같은 기준일로 조인 가능한 등급 선택 규칙을 명시해야 한다. 보고·감사 사용 전에 닫아야 하는 다음 단계 차단 이슈다.
- issue-004 (high): 리스크 값에 영향을 주는 수동 조정, 심사 입력, 승인 행위가 별도 행위·증거 엔티티로 모델링되지 않아 감사 추적이 닫히지 않는다.
  - root cause: 수동 조정, 심사 입력, 승인 기록 같은 통제 행위를 값 속성의 메모로만 설명하고 별도 행위·증거 엔티티로 모델링하지 않았다.
  - materiality: 선언된 목적은 리스크 엔진과 보고 시스템 간 수동 조정 및 승인값을 통제 가능한 공유 기준으로 만드는 것이다. 그러나 등급 수동 조정, LTV 입력, 승인 한도 기록이 산출·보고값에 영향을 줄 때 actor, acted_at, reason, evidence, previous/new value가 없으면 누가 언제 어떤 근거로 값을 바꿨는지 설명할 수 없어 감사 추적, 이의 제기, 재처리, 운영 통제가 온톨로지 내부에서 지원되지 않는다.
  - action: ManualRiskGradeAdjustment, LtvAssessmentInput, LimitApprovalEvent 같은 통제 행위 엔티티를 추가하고 actor_ref, acted_at, reason, evidence_ref, source_system, previous_value, new_value를 포함해야 한다. 또한 Exposure.risk_grade, Exposure.ltv, Limit.approved_amount와 해당 행위 엔티티의 관계를 명시해 값의 현재 상태뿐 아니라 변경 전이와 근거를 재현할 수 있게 해야 한다.
- issue-005 (medium): 연체·부실 상태와 그 lifecycle이 공유 온톨로지에 최소 경계 개념으로도 표현되지 않아, 부실 이벤트 이후 차주·익스포저의 등급, 한도, 리스크 성향 상태를 일관되게 해석하기 어렵다.
  - root cause: 별도 시스템 소관인 연체·부실 같은 주요 리스크 상태를 외부 권위 참조로 모델링하지 않고 온톨로지 범위 밖으로만 배제했다.
  - materiality: 대상 온톨로지는 여신 리스크 엔진과 보고 시스템이 함께 참조할 도메인 포괄성과 상태 기준을 제공해야 한다. 그런데 연체·부실 같은 핵심 신용 리스크 상태가 모델 밖으로만 배제되어 있어, 해당 상태에 진입하거나 해소된 이후 산출 등급, 익스포저, 한도, RiskAppetite 위반 상태를 같은 기준으로 결합해 보고하기 어렵다.
  - action: 다음 단계에서 DefaultStatus 또는 CreditEvent 같은 최소 경계 개념을 추가하고, source_system, 상태값, 발생일, 해소일, 차주·익스포저 연결, 보고 반영 기준을 포함해야 한다. 이렇게 해야 연체관리 시스템이 실제 원천 권위인 경우에도 공유 온톨로지가 등급·익스포저·한도·리스크 성향 상태와 부실 이벤트를 일관되게 참조할 수 있다.
- issue-006 (medium): 핵심 분류축이 닫힌 enum으로만 모델링되어 새 세그먼트, 상품, 담보, 등급, 준수 상태가 추가될 때 스키마와 소비자 검증 로직을 동시에 바꾸어야 하는 material issue입니다.
  - root cause: 핵심 분류값을 lifecycle이 있는 확장 가능 코드셋이 아니라 닫힌 enum 목록으로 직접 모델링한다.
  - materiality: 이 문제는 분류체계 변경 후에도 리스크 엔진과 보고 시스템이 같은 기준을 유지하고 invalid input behavior를 예측 가능하게 해야 한다는 목적을 약화합니다. 새 값이 한 시스템에 먼저 도입되면 다른 시스템은 이를 미인식 값으로 거부하거나 보고에서 누락할 수 있어 확장 내성과 운영 안정성이 낮아집니다.
  - action: 고정 enum을 lifecycle-aware code-set 개념으로 승격해야 합니다. 각 code-set은 code, label, status, valid_from, valid_to, parent_code, external_aliases, unknown_handling, compatibility policy를 가져야 하며, 신규 값 추가는 기존 스키마 수정이 아니라 code-set 버전 추가로 처리되도록 해야 합니다. 특히 unknown/extension handling과 유효기간 경계 처리를 필수 acceptance criteria로 두어 소비 시스템별 처리 차이를 막아야 합니다.
- issue-007 (medium): Collateral을 Exposure의 하위 유형으로 둔 현재 모델링은 잘못된 subsumption입니다. Collateral은 여신 익스포저의 종류가 아니라 익스포저를 담보하는 별도 자산 개념으로 유지되어야 합니다.
  - root cause: 담보 자산을 Exposure의 하위 유형으로 선언한 개념 유형 분류 오류가 있다.
  - materiality: 이 문제는 리스크 엔진과 보고 시스템이 공유하는 익스포저·담보 개념 기준을 약화합니다. Collateral이 Exposure 하위 유형이면 담보 자산이 Exposure 속성, 분류, 집계 대상에 포함될 수 있어 엔진 입력과 보고 집계에서 담보와 여신 익스포저의 의미가 섞입니다.
  - action: Collateral.is_a: Exposure를 제거하고 Exposure secured_by Collateral 관계를 권위 관계로 유지해야 합니다. 담보 평가 단위가 필요하면 Collateral 자체 속성이나 CollateralValuation 같은 별도 평가 개념으로 분리하여, 익스포저 분류와 담보 평가가 서로 다른 개념 축에서 관리되도록 해야 합니다.
- issue-008 (medium): LTV의 권위를 반드시 닫아야 한다. 현재 `ltv`는 담보인정비율이라는 계산성 이름을 쓰면서도 심사역 입력값처럼 정의되어 있어, Exposure.amount와 Collateral.appraised_value로 계산한 LTV와 같은 이름 아래 충돌할 수 있다.
  - root cause: 산식성 비율 명칭인 LTV를 원천값과 공존시키면서 독립 심사역 입력 속성으로 정의했다.
  - materiality: 이 이슈는 리스크 엔진과 보고 시스템이 공유해야 하는 담보 인정 비율의 개념 권위를 약화시킨다. 동일한 `ltv`가 심사 입력값, 계산값, 담보 재평가 이후 값 중 무엇인지 불명확하면 리스크 분류와 보고 수치가 서로 다른 값을 소비할 수 있어 일관성이 깨진다.
  - action: `ltv`를 권위 입력값으로 둘지 계산 파생값으로 둘지 먼저 명시해야 한다. 파생값이면 산식, 원천 속성, 기준시점, 다건 담보 처리 규칙, 재평가 이후 적용 기준을 정의해야 하고, 입력값이면 `submitted_ltv`처럼 이름을 분리해 계산 LTV와 혼동되지 않게 해야 한다. 이 결정은 엔진·보고 사용 전에 닫혀야 한다.
- issue-009 (medium): RiskAppetite.compliance_status가 정책 기준 자체의 속성처럼 놓여 있고 RiskAppetite가 ExposureAggregate와 관계로 연결되지 않아, 리스크 성향 한도 준수/위반 판정의 대상과 기준시점이 닫히지 않습니다.
  - root cause: RiskAppetite 준수 판정을 ExposureAggregate, RiskAppetite, as_of가 연결된 별도 assessment relation/entity로 모델링하지 않았다.
  - materiality: 이 온톨로지의 선언 목적은 리스크 엔진과 보고 시스템이 공유할 리스크 성향 한도 및 위반 판정 기준을 제공하는 것입니다. 현재 구조에서는 같은 RiskAppetite에 대해 어떤 ExposureAggregate를 어떤 as_of 시점에 비교한 상태인지 알 수 없고, 관계 그래프에서도 RiskAppetite로 도달하는 경로가 없어 소비 시스템마다 다른 위반 의미를 부여할 수 있습니다.
  - action: RiskAppetite에는 appetite 식별자와 threshold 같은 정책 기준만 남기고, 준수 판정은 RiskAppetiteAssessment 또는 checked_against/constrains 성격의 관계로 분리해야 합니다. 이 평가 개념은 ExposureAggregate, RiskAppetite, as_of, computed_status를 함께 가져야 하며, 먼저 이 연결을 모델링해야 엔진 판정과 보고 조회가 같은 대상·시점·한도 기준을 공유할 수 있습니다.
- issue-010 (medium): Exposure.risk_grade가 RiskRating.grade에서 도출된다는 규칙은 있지만, relations나 constraint가 어떤 RiskRating이 어떤 Exposure.risk_grade의 근거인지 닫아 주지 않아 등급 산출 근거가 구조적으로 불완전합니다.
  - root cause: classification_rules에 선언된 RiskRating.grade에서 Exposure.risk_grade로의 산출 의존성을 relations 섹션이 관계나 제약으로 표현하지 않는다.
  - materiality: 이 이슈는 리스크 엔진과 보고 시스템이 공유해야 하는 등급 산출 기준을 약화시킵니다. 보고 시스템이 Exposure.risk_grade를 재현하거나 검증할 때 명시된 산출 의존 관계가 없으면 시스템별로 Borrower 경유 조인이나 rating 선택 규칙을 임의 해석할 수 있고, 그 결과 핵심 분류 값의 일관된 검증이 어려워집니다.
  - action: Exposure와 RiskRating 사이에 risk_grade_derived_from 같은 명시적 산출 의존 관계를 추가하거나, Borrower를 기준으로 어떤 rating을 선택해 Exposure.risk_grade를 산출하는지 관계 또는 constraint로 선언해야 합니다. 먼저 산출 근거 선택 규칙을 닫아야 이후 보고 검증, 재현, 규칙 변경 비교가 같은 연결 기준을 사용할 수 있습니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-003: resolved
- issue-004: resolved
- issue-005: no-deliberation-needed
- issue-006: resolved
- issue-007: resolved
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 동일한 등급 분류, 한도 소진율, 환산 기준을 공유하게 하는 개념 권위 문서 목적. Source finding context: 리스크 엔진과 보고 시스템이 공유할 개념 권위 문서로서의 등급 기준과 precedence 제공. Source finding context: 리스크 엔진과 보고 시스템이 동일한 한도 소진율 계산 기준을 공유하게 하는 목적. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서 Source finding context: 리스크 엔진과 보고 시스템이 공유할 개념 기준으로서 등급 분류와 보고 해석을 일관되게 유지하는 목적. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 등급 분류 기준
- issue-002: 리스크 엔진과 보고 시스템이 같은 기준 시점의 익스포저 총액, 한도 소진율, 리스크 성향 준수 상태를 공유하게 하는 목적. Source finding context: 시간성 관점에서 리스크 엔진과 보고 시스템이 같은 기준 시점의 익스포저·한도·준수 상태를 공유하게 하는 목적. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 총익스포저 개념 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저 총액 및 한도 소진율 기준
- issue-003: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준의 재현성과 감사 가능성.
- issue-004: 리스크 엔진과 보고 시스템 간 수동 조정 및 승인값의 통제 가능한 공유 기준.
- issue-005: 여신 리스크 분류 온톨로지의 도메인 포괄성과 상태 기준.
- issue-006: 분류체계 변경에도 리스크 엔진과 보고 시스템이 공유 기준을 유지하고 invalid input behavior를 예측 가능하게 하는 목적.
- issue-007: 리스크 엔진과 보고 시스템이 공유하는 익스포저·담보 개념 기준. Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 익스포저·담보 개념 기준
- issue-008: 리스크 엔진과 보고 시스템이 공유하는 담보 인정 비율의 개념 권위.
- issue-009: 리스크 엔진과 보고 시스템이 공유하는 리스크 성향 한도 및 위반 판정 기준. Source finding context: 리스크 엔진과 보고 시스템이 공유할 개념 기준으로서의 여신 리스크 분류 온톨로지
- issue-010: 리스크 엔진과 보고 시스템이 공유하는 등급 산출 기준.

## Final Review Result
10 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 병행 관리되는 등급·한도·환율 값의 권위와 변환 규칙이 온톨로지 내부에 닫혀 있지 않아, 리스크 엔진과 보고 시스템이 공유해야 할 개념 기준과 산출 재현성이 약해집니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 웹 조사와 재귀 참조 확장은 단위 경계에서 금지되어 프롬프트 패킷의 허용된 근거와 소스 참조만 사용했다.
- 연체관리 시스템의 실제 데이터 계약은 이 unit의 증거 범위 밖이므로, 결론은 온톨로지 내부의 최소 외부 참조 개념 부재로 한정한다.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_before_release, fix_now
- issue-004 (high): fix_before_release, fix_now
- issue-005 (medium): follow_up
- issue-006 (medium): follow_up
- issue-007 (medium): fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
