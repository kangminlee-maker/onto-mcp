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
- issue-001 (high): Rating conversion and report-grade adjustment are outside the ontology's canonical authority, so the risk engine and reporting system can produce different risk classifications while still appearing compliant with the shared ontology.
  - root cause: The ontology preserves historical rating-scale plurality as consumer-owned conversion instead of modeling canonical rating authority and governed projections.
  - materiality: This is material because the declared purpose is a shared concept standard for risk engine and reporting outputs, especially classification authority and precedence. If each consumer can convert rating scales or manually adjust reporting grades locally, the ontology no longer provides one accountable basis for reconciling or auditing an exposure's risk class.
  - action: Make rating authority explicit in the ontology before relying on it as the shared standard: define one canonical rating scale or a versioned mapping table from RiskRating.grade/internal_rating to Exposure.risk_grade, define who may override it, require override reason, effective date, and source, and keep report-only adjustments as separate projections rather than rewriting the shared risk_grade concept.
- issue-004 (high): 핵심 결론은 신용위험 분류의 주요 축인 등급, 연체/부실 상태, 익스포저·한도 생애주기, 총익스포저의 시간 기준이 공유 온톨로지 안에서 governed first-class concept로 닫혀 있지 않다는 점입니다. 그 결과 소비 시스템이 각자 확장, 변환, 해석, 우회 로직을 만들어도 온톨로지상으로는 준수처럼 보일 수 있습니다.
  - root cause: The taxonomy lacks governed extensible state, rating, and inclusion-boundary concepts, leaving critical classification axes closed, omitted, externally maintained, or semantically ambiguous.
  - materiality: 이 이슈는 리스크 엔진과 보고 시스템이 안정적이고 확장 가능하며 의미가 명확한 여신 리스크 분류 기준을 공유한다는 목적을 직접 약화합니다. 새 등급·상품·담보·세그먼트가 추가되거나, 연체/부실 및 운영 상태별 포함 여부를 판단하거나, ExposureAggregate가 현재 총량인지 월말 지연 스냅샷인지 해석해야 할 때 공유 모델이 권위 있는 기준을 제공하지 못합니다. 따라서 등급 의미, 상태 분류, 소진율·총익스포저 산정 기준이 시스템별로 갈라질 수 있습니다.
  - action: 필요한 조치는 분류값과 상태축을 governed vocabulary 또는 boundary concept로 승격하고, canonical RatingScale/RatingGrade/RatingMapping과 수동 조정 의미를 추가하며, 연체/부실 및 Exposure/Limit 생애주기 상태별 포함·제외 규칙을 classification_rules에 명시하는 것입니다. ExposureAggregate는 월말 지연 스냅샷임을 드러내도록 rename 또는 split하고, 현재 총량이 별도 의미라면 별도 개념으로 분리해야 합니다. 등급 권위와 상태·포함 경계를 먼저 닫아야 이후 상품·등급·상태 확장이 schema rewrite가 아니라 통제된 데이터 확장으로 처리됩니다.
- issue-005 (high): Collateral은 Exposure의 하위 유형으로 남아 있으면 안 됩니다. 담보는 익스포저 자체가 아니라 익스포저를 담보하는 독립 자산으로 모델링되어야 하며, 현재 구조는 의미상 및 구조상 높은 심각도의 타입 경계 결함입니다.
  - root cause: Collateral is defined as a secured asset but typed as an Exposure subtype, creating an ontology-level type error.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 공유할 여신 리스크 분류 기준을 제공하는 것입니다. Collateral이 Exposure subtype이면 담보 레코드가 익스포저 속성, 등급, 집계, 보고 분류의 대상으로 해석될 수 있어 담보 자산과 신용 익스포저의 기준 경계가 오염됩니다. 그 결과 엔진과 보고서가 같은 객체를 서로 다른 의미로 처리하거나 담보를 익스포저처럼 집계할 수 있으므로 공유 기준의 신뢰성이 크게 약화됩니다.
  - action: `Collateral.is_a: Exposure`를 제거하고 Collateral을 독립 엔티티로 유지해야 합니다. Exposure와 Collateral의 연결은 `secured_by` 같은 관계로 표현하고, 필요하면 담보제공 계약이나 담보평가 단위를 별도 개념으로 분리해야 합니다. 이 조치는 익스포저 분류·집계 경로에서 담보 자산이 잘못 포함되는 것을 먼저 차단한 뒤 관계 모델로 실제 업무 연결을 보존하기 위한 것입니다.
- issue-002 (medium): Limit utilization is material because cross-currency conversion is delegated to each system's daily FX table, so two ontology-compliant systems can calculate different utilization for the same borrower and date.
  - root cause: The ontology treats FX conversion authority as external and per-system instead of a governed concept in the shared model.
  - materiality: The declared purpose requires shared concepts for risk engine and reporting systems, especially precedence and invalid-input behavior for cross-currency limit utilization. Per-system FX tables make a core risk-control metric locally defined, weakening auditability and making breach detection and report reconciliation unreliable.
  - action: Define a canonical FX conversion concept for limit-utilization calculations before release. It should specify source authority, as-of timestamp, rounding, stale-rate handling, and precedence; if multiple FX sources are required, model them as named projections with explicit precedence so reporting variants do not override the canonical engine metric.
- issue-003 (medium): Exposure-derived calculations do not have a shared temporal and currency contract: aggregate freshness, rating/limit/appetite effective timing, and monetary valuation basis are implicit or externalized, so the same exposure state can be interpreted differently by the risk engine and reporting.
  - root cause: Temporal and currency bases are treated as incidental attributes or external behavior rather than governed, versioned shared concepts for reproducible risk calculations.
  - materiality: This is material because the declared purpose is a shared concept basis for risk engine and reporting, especially temporality, reproducibility, and operational control. Without freshness, effective-date, cutoff, and valuation semantics, limit utilization and appetite compliance can present stale or locally converted values as authoritative, weakening reconciliation and historical replay.
  - action: Add governed temporal validity and valuation concepts before relying on these calculations as shared engine/report facts. The fix should cover effective/as-of dates for ratings, limits, and appetite thresholds; aggregate calculation cadence, freshness SLA, stale/partial status, included-event cutoff, and refresh cadence; and Money/Valuation plus FXRate or ConversionPolicy with amount, currency, value_as_of, source, effective dating, and conversion basis. Structure should provide explicit carriers and relations connecting these bases to ExposureAggregate, utilization, and appetite checks so current and historical calculations can be replayed consistently.
- issue-006 (medium): RiskAppetite가 리스크 성향 한도라는 정책 기준과 compliance_status라는 평가 결과를 한 개념에 함께 담아, 해당 객체가 기준인지 현재 평가 상태인지 불명확하게 만듭니다.
  - root cause: RiskAppetite combines a policy threshold and a compliance result in one concept instead of separating policy authority from assessment output.
  - materiality: 선언된 목적은 리스크 엔진과 보고 시스템이 공유할 한도/위반 상태의 개념 기준을 세우는 것입니다. 그런데 정책 기준과 산출 상태의 권위가 RiskAppetite 하나에 섞이면 소비 시스템이 한도 값을 현재 위반 상태처럼, 또는 위반 상태를 정책 기준처럼 해석하거나 갱신할 수 있어 위반 판단의 의미와 이력이 흐려집니다.
  - action: RiskAppetite는 RiskAppetiteLimit 또는 RiskAppetitePolicy처럼 정책 기준을 담는 개념으로 정리하고, 비교 결과는 RiskAppetiteComplianceAssessment 같은 별도 평가 결과 개념으로 분리해야 합니다. 평가 결과에는 평가 대상 aggregate, 참조한 appetite 기준, 평가 시점, 상태를 연결해야 하며, 이 분리가 먼저 되어야 엔진과 보고 시스템이 기준 권위와 산출 상태를 일관되게 사용할 수 있습니다.
- issue-007 (medium): RiskAppetite is material because it is defined as governing ExposureAggregate breach/compliance, but the ontology provides no structural relation that connects the aggregate being evaluated to the appetite threshold/status concept.
  - root cause: The relations block omits any edge involving RiskAppetite despite its definition depending on ExposureAggregate.
  - materiality: The declared purpose is to serve as shared concept authority for risk engines and reporting systems. Without a canonical path from ExposureAggregate to RiskAppetite, implementations cannot consistently determine or report which aggregate is evaluated against which appetite threshold, so they must rely on implicit or external joins outside the ontology.
  - action: Add an explicit relation connecting ExposureAggregate to RiskAppetite, using a kind such as evaluated_against or constrained_by. Include the required scope key where thresholds vary by borrower, segment, product, or portfolio so engines and reports can resolve the correct appetite threshold from the canonical model.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: resolved
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: A shared concept standard for risk engine and reporting systems, especially classification authority and precedence.
- issue-004: Risk engine and reporting systems sharing a stable, extensible, and semantically clear credit-risk classification standard. Source finding context: 리스크 엔진과 보고서 시스템이 공유할 여신 리스크 분류 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저·한도 분류 및 집계 기준 Source finding context: Risk engine and reporting system share a stable concept basis for ratings and classification. Source finding context: Classification taxonomy remains extensible as credit products, collateral types, borrower segments, and reporting states evolve. Source finding context: 리스크 엔진과 보고 시스템이 공유할 등급 분류 기준 및 권위 문서 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저 집계 및 한도 소진율 기준
- issue-005: 리스크 엔진과 보고 시스템이 공유할 여신 리스크 분류 기준
- issue-002: Shared concept criteria for risk engine and reporting systems, with emphasis on precedence and invalid-input behavior for cross-currency limit utilization.
- issue-003: A shared concept basis for risk engine and reporting, especially temporality, reproducibility, and operational risk in exposure aggregation, limit utilization, and appetite compliance. Source finding context: A shared concept basis for risk engine and reporting, especially temporality and operational risk in exposure aggregation, limit utilization, and appetite compliance. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 시간 일관적 리스크 분류·보고 기준 Source finding context: Risk engine and reports share reproducible limit-utilization and aggregate-exposure concepts over time.
- issue-006: 리스크 엔진과 보고 시스템이 공유하는 한도/위반 상태의 개념 기준
- issue-007: The ontology's declared purpose as a shared concept authority for risk engines and reporting systems.

## Final Review Result
7 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Rating conversion and report-grade adjustment are outside the ontology's canonical authority, so the risk engine and reporting system can produce different risk classifications while still appearing compliant with the shared ontology. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 외부 리스크팀 위키, 연체관리 시스템 스키마, 소비자 구현은 이 단위의 경계 밖이므로 실제 매핑 품질이나 divergence 규모는 확인하지 않았습니다.
- Logic 렌즈는 반대가 아니라 형식 논리 모순 범주가 아니어서 not_applicable로 남았습니다.
- The bounded evidence establishes a contract risk in the ontology text, not observed variance between actual FX tables.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
