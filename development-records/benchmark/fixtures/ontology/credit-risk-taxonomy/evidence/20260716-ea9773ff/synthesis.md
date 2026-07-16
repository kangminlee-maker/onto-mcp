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
- issue-001 (high): issue-001은 등급 scale/mapping과 borrower/product/collateral 핵심 분류 코드가 온톨로지 소유의 버전 있는 공유 분류 권위로 닫혀 있지 않은 문제다. 이 때문에 등급 변환, 보고 조정, 등급 체계 변경, 일반 분류 확장이 소비자별 로직·수동 조정·폐쇄 enum에 분산된다.
  - root cause: 등급 값과 분류 코드가 버전 있는 canonical scale/code-set 개념이 아니라 로컬 속성·폐쇄 enum·외부/소비자별 매핑으로 남아 있어 등급 변경과 일반 분류 확장이 공유 권위 안에서 통제되지 않는다.
  - materiality: 온톨로지의 선언 목적은 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 분류 기준이 되는 것이다. 그런데 RiskRating.grade, Exposure.risk_grade, Borrower.internal_rating의 변환과 보고 조정이 시스템별 또는 보고팀 판단으로 분산되고, 주요 business classification이 폐쇄 enum으로 남아 있으면 같은 borrower/exposure가 엔진·보고·소비 시스템에서 다른 리스크 의미로 분류될 수 있다. 그 결과 보고 수치와 엔진 판단의 비교, 추적, 감사, 역사적 등급 연속성, 신규 분류 온보딩이 온톨로지 내부 기준만으로 재현·검증되지 않는다.
  - action: 등급 scale과 mapping, 그리고 주요 borrower/product/collateral classification을 first-class governed concept으로 승격해야 한다. 각 개념에는 canonical code 또는 grade, owner/source authority, version 및 effective dates, lifecycle/status, compatibility mapping, alias/backward mapping, manual override provenance와 승인·범위·유효기간을 포함해야 한다. 이 조치는 다음 단계 전에 닫아야 하는 root-level governance 문제이며, 소비 시스템이 자체 변환을 구현하기보다 동일한 canonical mapping과 code-set authority를 읽도록 순서를 맞추는 것이 필요하다.
  - unresolved disagreement: Deliberation은 broad governed classification authority 이슈를 유지했다. Axiology, coverage, evolution, structure는 broad root를 수용했지만, semantics는 rating/classification meaning authority에는 동의하면서 closed-code-set evolution 전체 범위는 직접 증거 밖이라고 좁혔다. 이는 이슈를 축소할 실질 반박이 아니라 lens-scoped evidence limitation으로 남는다.
- issue-002 (high): 월말 배치 ExposureAggregate와 시간 의존 등급·한도·LTV·RiskAppetite 준수상태, 파생 계산이 공통 as_of, batch/run, cutoff, source, rule-version context 없이 같은 권위 값처럼 쓰이고 있어, 현재 온톨로지는 한도 소진율과 과거 리스크 상태를 신뢰성 있게 해석하거나 재현할 수 없다.
  - root cause: ExposureAggregate와 derived risk calculations가 기준시점, batch/run, cutoff, source table, rule version을 공통 계산 context로 갖지 않아 lagged aggregate와 현재/과거 risk state가 같은 권위 값처럼 섞인다.
  - materiality: 이 온톨로지의 선언 목적은 리스크 엔진과 보고 시스템이 공유하는 리스크·한도 판단 기준과 시간 경과에 따른 계산·보고의 공통 해석을 제공하는 것이다. 그런데 공식 한도 소진율이 일중 신규 여신을 반영하지 않는 월말 배치 집계에 의존할 수 있고, 과거 기준일의 등급·한도·LTV·준수상태 및 계산 context를 재구성할 수 없으면 엔진/보고 대사, trend reporting, 감사 재현성이 모두 약해진다. 따라서 같은 필드가 시점이나 운영 규칙 변화에 따라 다른 의미를 갖게 되어 공유 권위 문서로서의 목적을 직접 훼손한다.
  - action: 우선 ExposureAggregate의 temporal boundary를 명시해 특정 batch cutoff/as_of 기준의 합으로 재정의하거나, CurrentExposureAggregate와 MonthEndExposureAggregate처럼 현재 통제용 값과 보고 snapshot 값을 분리해야 한다. 그 다음 time-dependent values와 derived metrics에 as_of 또는 valid_from/valid_to, source_event_ref, batch/run id, inclusion cutoff, FX source/rate date, rule version, valuation/revaluation policy version을 부여하고 파생 필드가 사용한 calculation context를 참조하게 해야 한다. 이 순서가 필요한 이유는 한도 소진율의 권위 exposure 값을 먼저 분리해야 등급·한도·성향 준수상태와 계산 이력도 같은 기준시점에 맞춰 재현될 수 있기 때문이다.
- issue-006 (high): 보고 수동 조정, underwriter 입력, approval system 기록은 핵심 리스크 값을 생성·변경·확정하는 통제 행위인데, 현재 모델에는 actor, time, reason, before/after value, evidence URI를 담는 event/evidence entity가 없다.
  - root cause: 값 엔티티 중심 모델링이 값을 생성·변경·승인하는 control event와 audit evidence 개념을 분리해 포함하지 않았다.
  - materiality: 권위 문서의 목적은 리스크 엔진 산출값과 보고 시스템 사용값을 공유 기준으로 설명하는 것이다. 수동 조정 또는 승인·입력 이후 값만 남고 행위 근거가 모델 밖에 있으면, 보고값과 엔진값의 차이를 통제된 조정으로 입증하거나 감사·대사·이의제기에 대응하기 어렵다.
  - action: ManualAdjustment 및 Approval/InputEvent 같은 이벤트 엔티티를 추가하고 target_ref, actor_ref 또는 actor_id, occurred_at, reason_code/free_text, source_system, before_value, after_value, evidence_uri를 포함시켜야 한다. 조정 또는 승인된 값은 해당 이벤트를 참조하게 하여 값 자체와 통제 행위 증거가 같은 권위 모델 안에서 추적되도록 해야 한다.
- issue-007 (high): 여러 소비 시스템과 외부 wiki/CRM/FX table에 흩어진 등급, 한도, 환율 값에 대해 canonical source, precedence, fallback, reconciliation rule이 정의되지 않아 온톨로지가 충돌 시 권위 있는 값을 결정하지 못한다.
  - root cause: 병행 관리되는 등급·한도·환율 값과 외부 참조가 SourceOfRecord/AuthorityPolicy/precedence 개념으로 승격되지 않고 주석 수준에 머물러 있다.
  - materiality: 대상 온톨로지의 목적은 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 문서가 되는 것이다. 그런데 RiskRating 등급 매핑, CRM available_limit, 승인 한도, 시스템별 FX rate table이 서로 다른 값을 제공할 때 어느 값을 채택해야 하는지 닫혀 있지 않으면 동일 차주나 익스포저의 한도 소진율과 보고 등급이 시스템마다 달라질 수 있다. 이는 공유 개념 기준이라는 선언 목적을 직접 약화한다.
  - action: SourceOfRecord 또는 AuthorityPolicy 개념을 추가하고 rating_scale_mapping, fx_rate_table, available_limit, approved_amount 각각에 canonical_source, precedence, effective_date, fallback, reconciliation_rule을 명시해야 한다. 외부 wiki, CRM, 시스템별 FX table은 단순 참고 위치가 아니라 권위와 버전을 가진 참조 대상으로 모델링해야 하며, 이 권위 정책이 먼저 닫혀야 리스크 엔진과 보고 시스템의 산출 차이를 안정적으로 정규화할 수 있다.
- issue-003 (medium): RiskAppetite가 정책/threshold와 compliance 평가 결과를 한 개념에 섞고 있으며, ExposureAggregate가 RiskAppetite 및 Limit와 어떻게 비교·소비되는지 relation graph에 명시되지 않아 declared appetite breach와 limit utilization rule이 공유 graph contract로 소비될 수 없다.
  - root cause: RiskAppetite compliance와 classification rules의 cross-entity dependencies가 별도 evaluation/derived relation 개념과 graph edge로 모델링되지 않고 prose rule에 남아 있다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템이 limits와 appetite breaches를 같은 구조적 계약으로 해석하고 감사하도록 하기 위한 것이다. 그러나 compliance_status가 RiskAppetite 정책의 고유 속성처럼 보이고, ExposureAggregate에서 적용할 appetite threshold나 Limit join path를 graph로 찾을 수 없으면 consumer별로 평가 시점, scope, join 기준을 다르게 구현할 수 있다. 그 결과 stale 또는 scope-ambiguous breach state가 정책 사실처럼 보고되고, utilization rule도 prose에 의존한 divergent implementation으로 갈라질 수 있다.
  - action: RiskAppetite는 policy/limit concept으로 남기고 threshold, currency, scope, effective period 같은 정책 속성을 담게 하며, RiskAppetiteCompliance 같은 별도 evaluation result concept에 borrower 또는 portfolio scope, aggregate reference, evaluated value, status, as-of time을 둬야 한다. 동시에 ExposureAggregate-to-RiskAppetite dependency와 ExposureAggregate-to-Limit utilization dependency를 명시적 relation 또는 named derived concept으로 표현해 consumer가 prose가 아니라 graph contract를 따라 breach와 utilization을 계산·보고·감사할 수 있게 해야 한다.
- issue-004 (medium): 통화가 다른 한도 소진율 계산에서 사용할 FX source, rate date, precedence, fallback, recalculation policy가 canonical rule로 닫혀 있지 않아 동일 포지션의 소진율이 시스템별로 달라질 수 있다.
  - root cause: 환율 변환의 계산 권위가 온톨로지에 닫혀 있지 않고 소비 시스템별 daily FX table에 분산되어 있다.
  - materiality: 영향받는 목적은 리스크 엔진과 보고 시스템이 공유하는 한도 소진율 계산 기준이다. 현재 규칙은 통화가 다를 때 각 시스템의 당일 환율 테이블을 쓰게 하므로, 환율 값이나 갱신 시각이 다르면 같은 익스포저와 한도에서도 서로 다른 utilization이 산출될 수 있다. 이는 보고와 통제 사이의 reconciliation 비용과 판단 불일치를 만들기 때문에 material issue다.
  - action: ExchangeRateSource 또는 FXRateAuthority 같은 권위 개념을 추가하고, rate date, source, precedence, fallback, recalculation policy를 canonical calculation rule로 정의해야 한다. 이 조치는 다음 단계 전에 닫아야 하는 blocker이며, 그래야 리스크 엔진과 보고 시스템이 같은 환산 권위와 재계산 기준으로 동일한 utilization을 재현할 수 있다.
- issue-005 (medium): 연체/부실(default) 상태가 별도 시스템 소관이라는 사실만 out-of-scope note로 남아 있고, 공유 온톨로지 안에는 이를 참조·해석하기 위한 boundary contract가 없다. 따라서 외부 운영은 유지하더라도 DefaultStatus 또는 CreditImpairmentStatus 같은 참조 개념이나 계약 규칙을 추가해야 한다.
  - root cause: 목적상 핵심 외부 상태인 delinquency/default를 shared ontology boundary contract나 reference status concept으로 닫지 않고 단순 out-of-scope note로 남겼다.
  - materiality: 온톨로지의 목적은 여신 리스크 관리 개념 모델이 리스크 엔진과 보고 시스템의 공유 기준이 되는 것이다. 연체/부실 상태는 등급, 익스포저, 보고 해석에 직접 영향을 주는 핵심 리스크 상태이므로, 이를 단순히 범위 밖이라고만 두면 시스템 간 의미 정렬과 책임 추적이 끊긴다.
  - action: 다음 단계 전에 DefaultStatus 또는 CreditImpairmentStatus를 외부 권위 참조 개념으로 추가하거나, 최소한 boundary contract로 외부 authority, 참조 identifier, 상태 기준 시점/status_as_of, 갱신·생명주기, RiskRating/Exposure/reporting 반영 관계를 명시해야 한다. 운영 소유권을 내부로 가져오는 것이 아니라 공유 기준이 외부 상태를 안정적으로 해석하도록 경계를 닫는 조치다.
- issue-008 (medium): issue-008은 연체·부실 상태를 외부 연체관리 시스템 소관이라는 이유로 공유 리스크 온톨로지에서 완전히 제외해, 익스포저 lifecycle의 핵심 상태 전환을 같은 분류 권위 안에서 참조할 수 없게 만든 material coverage defect이다. 다만 독립 root가 아니라 issue-005의 externally owned delinquency/default boundary-contract 결함 중 lifecycle/status coverage 및 graph-linkage facet으로 유지된다.
  - root cause: 운영 소유 시스템의 범위와 공유 개념 기준의 범위를 동일시해 externally owned delinquency/default status를 reference concept으로도 포함하지 않았다.
  - materiality: 대상 온톨로지는 여신 리스크 관리 개념 모델이자 리스크 엔진/보고 시스템의 공유 분류 기준을 목적으로 한다. 보고서나 엔진이 익스포저의 연체·부실 여부를 등급, 한도, 리스크 성향 위반과 함께 분류·집계해야 할 때, 연체/default 상태 의미와 lifecycle을 참조할 shared concept이 없으면 핵심 리스크 상태 범위가 단절되어 선언된 목적을 약화한다.
  - action: 외부 연체관리 시스템의 운영 권위는 유지하되, 공유 온톨로지에는 최소 reference entity로 DelinquencyStatus 또는 CreditImpairmentStatus를 포함해야 한다. 이 reference concept에는 status value, status_as_of, source_system, lifecycle transition, reporting_bucket, Borrower/Exposure relationship을 정의해 issue-005의 boundary-contract 수리와 함께 닫을 수 있도록 해야 한다.
- issue-009 (medium): `Collateral is_a Exposure` should be treated as a material semantic modeling error: collateral is a pledged asset securing an exposure, not a subtype of the credit exposure itself.
  - root cause: Collateral에 subtype inheritance를 사용해, 이미 secured_by relation으로 표현된 association을 subtype identity로 잘못 모델링했다.
  - materiality: The ontology is meant to be a shared concept authority for risk engines and reporting systems. If consumers interpret `is_a` as inheritance or subtype membership, collateral assets can be processed as exposure instances, causing exposure attributes, aggregation rules, or classifications to be applied to pledged assets and weakening the boundary between credit positions and their security.
  - action: Remove `Collateral.is_a: Exposure`, keep `Collateral` as a separate entity, and preserve the connection through `Exposure secured_by Collateral` or an explicit join/reference entity if the model needs richer collateral linkage. This should be fixed in the target now because the inherited subtype meaning is the mechanism that can mislead downstream consumers.
- issue-010 (medium): issue-010은 LTV가 파생 담보비율처럼 명명되고 배치되었지만 독립적인 수동 입력 권위를 가진다는 문제다. formula, collateral selection, valuation/date basis, rule/version authority, override policy, provenance가 없어서 계산된 LTV와 수동 입력 LTV의 의미와 권위가 닫히지 않는다.
  - root cause: LTV가 source quantities가 있는 derived ratio인지 manually asserted underwriting input인지 구분되지 않고 독립 수동 입력값으로 모델링되었다.
  - materiality: 이 온톨로지는 risk engine과 report가 exposure, limit, collateral 개념을 같은 의미로 쓰게 하는 것이 목적이다. 그런데 한 소비자는 Exposure.amount와 Collateral.appraised_value로 LTV를 재계산하고, 다른 소비자는 수동 입력된 Exposure.ltv를 신뢰할 수 있다. 같은 exposure에 대해 위험 분류와 보고 값이 갈라질 수 있으므로 목적을 직접 약화한다.
  - action: ltv를 formula authority, collateral selection rule, valuation date basis, temporal basis, recalculation rule/version semantics를 가진 derived measure로 정의해야 한다. 수동 underwriting 값이 필요하면 underwriter_ltv_override 같은 별도 concept으로 분리하고 provenance, 승인/정당화, override policy를 붙여야 한다. 이 조치는 issue-006의 broader audit-event gap과 구분되는 LTV-specific authority 문제를 target 내에서 닫기 위한 fix-now 사항이다.
- issue-011 (medium): Issue-011 is a material, focused rating-scale mapping gap: Borrower.internal_rating, RiskRating.grade, and Exposure.risk_grade look like related credit/risk grade concepts, but the ontology does not define their shared authority, scope, conversions, or override semantics.
  - root cause: Three credit-rating scales have no ontology-owned authoritative semantic mapping, leaving equivalence and conversion semantics to external consumer-specific mechanisms.
  - materiality: This weakens the target purpose because the ontology is meant to be a shared concept authority for a risk engine and reporting system. If the engine emits RiskRating.grade while reports consume or manually adjust Exposure.risk_grade through local transformations, both systems can appear conformant while assigning different meanings to the same risk-grade semantics.
  - action: Add an explicit canonical rating concept or ontology-owned mapping table covering borrower versus exposure scope, scale ownership, effective dates, derivation rules, conversion authority, and override/provenance semantics. This should remain linked or subordinate to the broader governed-classification authority work in issue-001, but it needs rating-specific traceability so the risk engine and reports share the same grade semantics.
  - unresolved disagreement: Axiology narrows the issue as a subordinate expression of issue-001's broader governed classification authority problem, while semantics, coverage, evolution, and structure support carrying it forward as a separate focused rating-scale mapping issue.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: Deliberation은 broad governed classification authority 이슈를 유지했다. Axiology, coverage, evolution, structure는 broad root를 수용했지만, semantics는 rating/classification meaning authority에는 동의하면서 closed-code-set evolution 전체 범위는 직접 증거 밖이라고 좁혔다. 이는 이슈를 축소할 실질 반박이 아니라 lens-scoped evidence limitation으로 남는다.
- issue-011: Axiology narrows the issue as a subordinate expression of issue-001's broader governed classification authority problem, while semantics, coverage, evolution, and structure support carrying it forward as a separate focused rating-scale mapping issue.

## Deliberation Decision
- issue-001: resolved
- issue-002: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-008: narrowed
- issue-009: no-deliberation-needed
- issue-010: narrowed
- issue-011: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 공유할 개념 권위 문서 및 공유 분류 기준으로 사용되는 것. Source finding context: 리스크 엔진과 보고 시스템이 공유할 개념 권위 문서로 사용되는 것. Source finding context: The ontology's declared purpose as a shared concept authority for the risk engine and reporting systems. Source finding context: The taxonomy's suitability as a shared classification basis across risk engine and reporting systems.
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 리스크·한도 판단 기준 및 시간 경과에 따른 risk calculations/reports의 공유 해석. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 리스크/한도 판단 기준 제공. Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 개념 권위 문서 Source finding context: Shared interpretation of risk calculations and reports over time. Source finding context: Shared concept authority for risk engines and reporting systems using exposure aggregates in risk and utilization calculations.
- issue-006: 리스크 엔진 산출값과 보고 시스템 사용값을 공유 기준으로 설명하는 권위 문서.
- issue-007: 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 문서.
- issue-003: 리스크 엔진과 보고 시스템이 limits와 appetite breaches를 공유 graph contract로 소비하고 감사하는 것. Source finding context: The ontology is intended to coordinate risk-engine decisions and reporting concepts for limits and appetite breaches. Source finding context: The ontology is intended as the shared concept authority for a risk engine and reporting systems. Source finding context: The ontology is intended to give risk and reporting systems a shared structural basis for classification and rule consumption.
- issue-004: 리스크 엔진과 보고 시스템이 공유하는 한도 소진율 계산 기준.
- issue-005: 여신 리스크 관리 개념 모델이 리스크 엔진과 보고 시스템의 공유 기준이 되는 것.
- issue-008: 여신 리스크 관리 개념 모델과 리스크 엔진/보고 시스템의 공유 분류 기준.
- issue-009: The ontology is intended as a shared concept authority for risk engines and reporting systems.
- issue-010: The ontology is meant to give risk engines and reports a shared meaning for exposure, limit, and collateral concepts.
- issue-011: The target says it is a concept authority shared by a risk engine and reporting system.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-001 (high) — issue-001은 등급 scale/mapping과 borrower/product/collateral 핵심 분류 코드가 온톨로지 소유의 버전 있는 공유 분류 권위로 닫혀 있지 않은 문제다. 이 때문에 등급 변환, 보고 조정, 등급 체계 변경, 일반 분류 확장이 소비자별 로직·수동 조정·폐쇄 enum에 분산된다. Unresolved disagreement remains: Deliberation은 broad governed classification authority 이슈를 유지했다. Axiology, coverage, evolution, structure는 broad root를 수용했지만, semantics는 rating/classification meaning authority에는 동의하면서 closed-code-set evolution 전체 범위는 직접 증거 밖이라고 좁혔다. 이는 이슈를 축소할 실질 반박이 아니라 lens-scoped evidence limitation으로 남는다.

## Boundary Notes
- 웹 조사와 추가 repo 탐색은 unit boundary에서 금지되어 제공된 packet 및 허용된 review artifact 맥락만 사용했다.
- logic lens의 insufficient_evidence는 형식 논리 모순 증거가 없다는 범위 제한 판단이며, 목적·coverage·semantics·structure·evolution 판단을 뒤집는 이견으로 남지 않았다.
- 웹 리서치와 추가 repo exploration은 unit boundary에서 금지되어, 제공된 issue packet 및 허용된 review artifacts 범위의 주장만 사용했다.

## Immediate Actions Required
- issue-001 (high): fix_before_release, follow_up
- issue-002 (high): fix_now
- issue-006 (high): fix_now
- issue-007 (high): fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-008 (medium): follow_up
- issue-009 (medium): fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
