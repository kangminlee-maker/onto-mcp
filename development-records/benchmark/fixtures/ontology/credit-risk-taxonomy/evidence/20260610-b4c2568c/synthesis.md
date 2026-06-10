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
- issue-001 (high): 신용·리스크 등급의 권위, 변환, 보고 조정 의미가 온톨로지 내부에서 닫히지 않아 `RiskRating.grade`, `Borrower.internal_rating`, `Exposure.risk_grade`가 시스템별로 다르게 해석될 수 있는 material issue입니다.
  - root cause: 등급 스케일, 등급 변환, Exposure.risk_grade 도출·수동 조정을 versioned canonical mapping/provenance 개념으로 닫지 않고 외부 위키와 소비 시스템 구현 및 단일 필드 의미에 맡긴 것이 공통 원인이다.
  - materiality: 대상 온톨로지는 리스크 엔진과 보고 시스템이 공유하는 차주·익스포저 등급 분류 기준과 장기 등급 해석 연속성을 제공해야 합니다. 그러나 세 등급 스케일의 canonical 매핑, 버전, 유효기간, 조정 권위가 온톨로지에 없고 변환이 외부 위키나 소비 시스템 구현에 맡겨져 있어 같은 차주나 익스포저가 엔진, 보고, 내부 심사에서 서로 다른 의미와 권위를 갖는 등급으로 분류될 수 있습니다. 이는 공유 개념 권위, 비교 가능성, 재현성, 운영 일관성을 직접 약화합니다.
  - action: `RatingScale`, `RatingMapping`, `MappingVersion`, `source_authority`, `valid_from/valid_to`, `manual_override provenance`, `adjustment authority`를 온톨로지 개념으로 승격해야 합니다. `Exposure.risk_grade`는 단순 enum이나 수동 수정 가능한 단일 필드가 아니라 어떤 `RiskRating.grade`, 어떤 mapping version, 어떤 조정 이력과 승인 상태에서 나온 값인지 참조하도록 분리해야 합니다. 이 작업은 소비 시스템별 변환을 고치기 전에 온톨로지의 canonical 등급 관계와 보고 조정 권위를 먼저 닫아야 하므로 fix-now 성격의 선행 조치입니다.
- issue-002 (high): ExposureAggregate.total_amount가 현재 모든 Exposure.amount의 총계와 월말 배치 snapshot 값을 동시에 의미해, 한도 소진율과 RiskAppetite 준수 판단이 stale하거나 논리적으로 모순된 총액에 의존할 수 있습니다.
  - root cause: ExposureAggregate.total_amount를 모든 Exposure.amount의 현재 총계와 월말 배치 snapshot 저장값으로 동시에 사용하면서 snapshot kind, inclusion policy, freshness/as_of 계약을 분리하지 않은 것이 공통 원인이다.
  - materiality: 이 문제는 여신 리스크 관리에서 한도 소진율과 준수 상태를 공유 기준으로 판단하려는 목적을 약화합니다. 일중 신규 여신이 생긴 뒤 다음 월말 배치 전까지 집계값이 갱신되지 않으면 breached 상태를 compliant로 보거나 한도 소진율을 과소 산정할 수 있고, 소비 시스템마다 서로 다른 계산을 하면서도 모두 온톨로지를 따른다고 주장할 수 있습니다.
  - action: ExposureAggregate를 as-of/batch snapshot 총계로 명확히 제한하거나 live/current total과 분리해야 합니다. aggregation_basis 또는 snapshot_kind, calculated_at, effective_as_of, inclusion_policy, freshness_status를 추가하고, Limit utilization 및 RiskAppetite 판단이 어떤 aggregate version 또는 snapshot을 사용할 수 있는지 명시해야 합니다. 월말 보고용 집계와 통제용 실시간·준실시간 집계가 모두 필요하다면 별도 인스턴스나 개념으로 분리하는 순서가 먼저입니다.
- issue-003 (high): 연체·default·부실/NPL 상태가 공유 온톨로지 범위에서 빠져 있어, 여신 리스크 상태를 리스크 엔진과 보고 시스템이 같은 기준으로 참조하기 어렵다.
  - root cause: default/연체/부실 상태를 공유 온톨로지의 최소 참조 개념으로 포함하지 않고 별도 연체관리 시스템 범위로 외부화한 것이 원인이다.
  - materiality: 대상 온톨로지는 리스크 엔진과 보고서 시스템이 공유할 여신 리스크 개념 기준을 제공하는 것이 목적이다. 그런데 차주나 익스포저가 정상, 연체, default, 부실 중 어디에 속하는지를 나타내는 공통 상태 개념이 없으면 엔진 산출과 보고 분류가 각 외부 시스템의 상태 정의에 의존하게 된다. 따라서 공유 권위 문서로서의 일관성과 신뢰가 약해진다.
  - action: DefaultStatus 또는 CreditEvent 같은 공통 상위 개념을 추가하고, 최소한 연체 단계, default 여부, 부실/NPL 여부, 상태 기준일, 상태 권위 시스템을 Exposure 또는 Borrower와 연결해야 한다. 별도 연체관리 시스템이 원천 권위라면 그 사실은 상태 권위 시스템 속성이나 관계로 모델링하되, 공유 온톨로지에는 엔진과 보고가 같은 상태를 참조할 수 있는 최소 개념을 포함해야 한다.
- issue-007 (high): Collateral을 Exposure의 하위 유형으로 둔 모델링은 담보 자산과 여신 익스포저의 의미 경계를 혼동시키는 high material correctness 결함입니다. issue-009는 같은 결함의 구조적 표면으로 통합 해석되며, issue-007이 canonical consolidated issue입니다.
  - root cause: 담보 자산을 여신 익스포저의 하위 유형으로 둔 존재론적 유형 분류 오류
  - materiality: 이 온톨로지는 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 개념 권위 문서입니다. `is_a`를 따르는 소비 시스템이 Collateral을 Exposure의 일종으로 분류하면 담보 자산이 익스포저 집계, 검증, 리스크 엔진 입력에 포함될 수 있어 익스포저 총액, 담보 평가, `secured_by` 관계 해석이 시스템마다 달라집니다.
  - action: `Collateral.is_a: Exposure`를 제거하고 Collateral을 독립 엔티티로 두어야 합니다. 그런 뒤 Exposure와 Collateral 사이의 `secures/secured_by` 관계로 담보 연결을 표현하고, 필요하면 담보가치, 평가시점, 적용비율 같은 속성은 해당 관계나 별도 담보 평가 개념에 명시해야 합니다. 이 수정은 subtype hierarchy를 정리한 뒤 관계 의미를 보강하는 순서로 처리되어야 합니다.
  - unresolved disagreement: Deliberation은 semantics, structure, axiology가 root와 materiality를 수용해 resolved 상태입니다. logic은 subtype 추론을 쓰는 경우로 위험을 좁혔고 evolution은 진화성 root는 아니라고 보았지만, 둘 다 canonical issue 수용을 막는 미해결 반대는 아닙니다.
- issue-004 (medium): 통화 및 환산 기준이 온톨로지의 공통 개념으로 모델링되지 않아, 다통화 익스포저에서 한도 소진율과 RiskAppetite 위반 판단이 시스템별 환율 처리에 따라 달라질 수 있다.
  - root cause: 금액 값을 독립 숫자로 두고 통화·기준통화·환율 참조·환산일을 공통 온톨로지 개념으로 승격하지 않은 것이 원인이다.
  - materiality: 선언된 목적은 리스크 엔진과 보고 시스템이 같은 한도 소진율 및 위반 판단 기준을 공유하는 것이다. 그런데 ExposureAggregate.total_amount와 Limit.approved_amount를 직접 비교하면서 통화와 환산 권위가 닫혀 있지 않으면, 같은 포트폴리오도 시스템별 당일 환율 테이블에 따라 소진율, 한도 초과 여부, RiskAppetite 위반 여부가 다르게 산출될 수 있어 공통 판단 기준이 약해진다.
  - action: MoneyAmount 또는 CurrencyConversion 개념을 추가해 amount, currency, base_currency, fx_rate_ref, conversion_date, converted_amount를 모델링해야 한다. Exposure.amount와 ExposureAggregate.total_amount에도 통화 및 환산 기준을 붙이고, 한도 소진율 산식은 단일 환산 권위나 명시적 환율 참조를 사용하도록 먼저 닫아야 이후 보고와 엔진의 위반 판단이 같은 기준으로 재현된다.
- issue-005 (medium): 포트폴리오·세그먼트별 집계와 RiskAppetite 적용 범위가 온톨로지에 충분히 닫혀 있지 않아, 보고용 리스크 기준이 차주 단위 총액 중심으로 편중되어 있습니다.
  - root cause: 집계와 RiskAppetite를 차주 단위 총액과 단일 threshold/status 중심으로만 모델링하고 segment, product, rating, collateral type, 적용 기간 같은 scope dimension을 닫지 않은 것이 원인이다.
  - materiality: 검토 목적은 보고 시스템과 리스크 엔진이 공유할 분류·집계 기준 및 리스크 성향 준수 판단 기준의 적절성입니다. 현재 모델은 차주별 총익스포저와 단일 threshold/status는 표현하지만, 세그먼트·상품·등급·담보유형·적용기간별 분포나 한도를 공통 기준으로 표현하기 어렵습니다. 그 결과 보고 분류와 RiskAppetite 적용 기준이 공유 온톨로지가 아니라 각 시스템의 임의 구현으로 이동하므로 목적을 약화합니다.
  - action: ExposureAggregate를 PortfolioAggregate로 일반화하거나 별도 집계 개념을 추가해 aggregation_dimension, segment, product_type, rating_bucket, collateral_type, as_of, currency/base_currency를 포함해야 합니다. RiskAppetite에는 scope_dimension, applicable_segment/product/rating, effective_from/to, threshold_basis를 추가해 정책 한도의 적용 대상과 기간을 명시해야 합니다. 이 수정은 보고 집계 기준과 appetite 준수 판단이 같은 공유 개념을 사용하도록 만드는 데 필요합니다.
- issue-006 (medium): 핵심 분류인 Borrower.segment, Exposure.product_type, Collateral.collateral_type이 폐쇄 enum으로 고정되어 있어 신규 차주 세그먼트, 여신 상품, 담보 유형이 추가될 때 온톨로지 구조 자체를 수정해야 하는 material issue입니다.
  - root cause: 변경 가능한 업무 분류를 버전 가능한 taxonomy entity가 아니라 고정 enum attribute로 둔 것이 원인이다.
  - materiality: 선언된 목적은 리스크 엔진과 보고 시스템이 공유할 분류체계의 변경 내성과 확장성입니다. 현재처럼 변화 가능한 업무 분류가 enum 값 목록에 묶여 있으면 새 범주 추가가 스키마 변경으로 번지고, 소비 시스템 배포와 과거 데이터 호환성 검토까지 동반되어 운영 확장 비용과 회귀 위험이 커집니다.
  - action: 각 폐쇄 enum을 reference taxonomy 개념으로 분리하고 code, label, parent, status, valid_from/valid_to, replacement_code를 가진 확장 가능한 분류표로 모델링해야 합니다. Borrower, Exposure, Collateral의 속성은 enum 값 자체가 아니라 taxonomy code reference를 갖도록 바꾸어, 새 범주 추가가 스키마 변경이 아니라 taxonomy 데이터 확장으로 처리되게 해야 합니다.
- issue-008 (medium): RiskAppetite가 정책 기준과 준수 판정 결과를 한 엔티티에 섞고, 적용 대상인 ExposureAggregate와의 평가 관계도 그래프에 닫지 않아 준수 상태의 주체, 시점, 근거가 불명확하다.
  - root cause: RiskAppetite를 정책 기준, 적용 대상, 평가 결과로 분리하지 않고 threshold/status 중심 엔티티로 두며 ExposureAggregate와의 평가 관계를 구조적으로 닫지 않은 것이 공통 원인이다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템이 한도 초과 및 준수 상태를 공유하는 기준이어야 한다. 그런데 RiskAppetite.compliance_status가 어떤 차주, 어떤 ExposureAggregate, 어떤 as_of 시점에서 산출된 상태인지 구조적으로 연결되지 않으면 소비자가 prose나 외부 구현으로 연결을 추론해야 한다. 그 결과 breach 로직과 보고 상태가 같은 의미로 재현되기 어렵고 감사 경로도 약해진다.
  - action: RiskAppetite는 threshold, 적용 범위, 통화, 유효기간을 가진 정책 기준으로 유지하고, RiskAppetiteAssessment 또는 AppetiteBreach 같은 별도 평가/사건 개념을 추가해야 한다. 그 평가 개념에는 borrower 또는 exposure_aggregate_ref, appetite_ref, as_of, amount, status를 두어 기준, 대상, 시점, 결과를 명시적으로 연결해야 한다. threshold가 세그먼트, 상품, 통화, 기간별로 달라질 수 있으면 해당 scope도 RiskAppetite 또는 적용 관계에 함께 모델링해야 한다.
- issue-009 (medium): Collateral is a valid material structural issue, but the resolved framing narrows it to a symptom of the broader Collateral/Exposure boundary defect: `Collateral.is_a: Exposure` coexists with `Exposure secured_by Collateral`, so graph traversal or subtype inheritance can treat collateral as an exposure while also treating it as security for an exposure.
  - root cause: The ontology uses `is_a` where an association relation is already the appropriate structural connection.
  - materiality: This weakens the ontology’s purpose of defining shared exposure and collateral concepts for risk engines and reporting systems because hierarchy-based consumers may include collateral records in exposure classifications, aggregations, or reports. The result is not just a naming concern; it can corrupt exposure-oriented processing by mixing a securing asset into the exposure category.
  - action: Carry this forward as a follow-up tied to the Collateral/Exposure boundary correction. The direct action is to remove `is_a: Exposure` from `Collateral` and keep collateral as a separate entity connected through `Exposure secured_by Collateral`; introduce a broader shared parent only if exposure and collateral genuinely share a common supertype. This ordering matters because the hierarchy must be corrected before consumers can safely rely on exposure traversal or subtype inheritance.
- issue-010 (medium): RiskRating.grade에서 Exposure.risk_grade를 도출한다는 규칙은 있지만, 특정 Exposure의 등급이 어떤 RiskRating.grade에서 왔는지 표현하는 구조 경로가 없어 등급 도출과 감사 추적이 끊긴다.
  - root cause: 온톨로지가 cross-entity 등급 도출 규칙을 문장으로 선언했지만 그 dependency를 그래프에서 표현할 Exposure-to-RiskRating derivation 관계나 derivation object를 추가하지 않은 것이 원인이다.
  - materiality: 이 온톨로지의 목적은 리스크 엔진의 분류와 보고용 등급 사용을 위한 공유 개념 기반을 제공하는 것이다. 그런데 핵심 등급 값인 Exposure.risk_grade의 source가 공식 그래프에서 RiskRating.grade로 연결되지 않으면, 리스크 엔진과 보고 소비자가 등급을 서로 다르게 도출하거나 조정하고도 같은 기준으로 검증·감사하기 어렵다.
  - action: Exposure에서 RiskRating으로 가는 grade_derived_from 관계를 추가하거나, Exposure.risk_grade, source RiskRating.grade, adjustment authority, effective/as-of time을 함께 묶는 derivation object를 정의해야 한다. 단순한 Borrower 경유 연결보다 먼저 이 도출 dependency를 공식 구조로 닫아야 이후 등급 조정, 보고, 감사가 같은 source와 시간 기준을 공유할 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-007: Deliberation은 semantics, structure, axiology가 root와 materiality를 수용해 resolved 상태입니다. logic은 subtype 추론을 쓰는 경우로 위험을 좁혔고 evolution은 진화성 root는 아니라고 보았지만, 둘 다 canonical issue 수용을 막는 미해결 반대는 아닙니다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-007: resolved
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: narrowed
- issue-010: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 공유하는 차주·익스포저 등급 분류 기준 및 등급 해석의 장기 연속성. Source finding context: 리스크 엔진과 보고 시스템이 공유할 개념 권위 문서로서의 여신 리스크 분류 온톨로지. Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 등급 분류 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 차주·익스포저 등급 기준. Source finding context: 리스크 엔진 산출 등급과 보고 시스템 등급의 공유 분류 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서로서 등급 해석의 연속성을 제공하는 목적
- issue-002: 여신 리스크 관리에서 한도 소진율과 리스크 성향 준수 상태를 공유 기준으로 판단하는 목적 및 익스포저·한도 산정 기준의 시간적 확장성. Source finding context: 여신 리스크 관리에서 한도 소진율과 리스크 성향 준수 상태를 공유 기준으로 판단하는 목적. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저·한도 산정 기준의 시간적 확장성 Source finding context: A shared concept authority for risk engine and reporting systems.
- issue-003: 리스크 엔진과 보고서 시스템이 공유할 여신 리스크 개념 기준 제공.
- issue-007: 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 개념 권위 문서
- issue-004: 리스크 엔진과 보고 시스템이 공유하는 한도 소진율 및 리스크 성향 위반 판단 기준.
- issue-005: 보고 시스템과 리스크 엔진이 공유하는 분류·집계 기준 및 리스크 성향 준수 판단.
- issue-006: 리스크 엔진과 보고 시스템이 공유할 분류체계의 변경 내성과 확장성.
- issue-008: 리스크 엔진과 보고 시스템이 공유하는 한도 초과 및 준수 상태 기준. Source finding context: The ontology is intended as the shared concept authority for a risk engine and reporting system over exposures, ratings, limits, and collateral.
- issue-009: The ontology is intended to define shared concepts for exposures and collateral used by risk engines and reporting systems.
- issue-010: 리스크 엔진의 분류와 보고용 등급 사용을 위한 공유 개념 기반. Source finding context: The ontology is meant to provide a shared concept basis for risk-engine classification and reporting use of grades.

## Final Review Result
10 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 신용·리스크 등급의 권위, 변환, 보고 조정 의미가 온톨로지 내부에서 닫히지 않아 `RiskRating.grade`, `Borrower.internal_rating`, `Exposure.risk_grade`가 시스템별로 다르게 해석될 수 있는 material issue입니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 외부 위키의 실제 매핑 품질은 이 단위 경계 밖이므로 확인하지 않았고, 판단은 온톨로지 내부에 canonical 매핑과 provenance가 없다는 점에 한정됩니다.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-002 (high): fix_before_release, fix_now
- issue-003 (high): fix_before_release, fix_now
- issue-007 (high): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): follow_up
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): follow_up
- issue-010 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
