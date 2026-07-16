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
- issue-001 (high): Issue-001 is a material governed rating-event authority gap: the ontology cannot provide one shared authoritative rating value when engine grades, report-side manual adjustments, mapping changes, and historical assignments are modeled as mutable/current grade attributes instead of distinct governed events.
  - root cause: Rating changes and report-side overrides are modeled as mutable/current grade attributes rather than time-bound, governed, auditable rating events with authority, effective period, approval, and replay metadata.
  - materiality: This weakens the declared purpose because the artifact is meant to give the risk engine and reporting system a shared, reproducible credit-rating concept authority. If Exposure.risk_grade can be manually adjusted for reporting, mappings can change outside the ontology, and past ratings lack effective-period and audit metadata, then engine output, reporting display, and historical reconstruction can each look valid while pointing to different authoritative values.
  - action: Fix this before the target ontology is considered complete by separating RatingAssignment, RatingMappingVersion or MappingApproval, and ManualRatingAdjustment or RatingOverride from current grade attributes. These concepts need owner/source authority, original and adjusted grade, approval authority/status, reason, effective period, timestamp, precedence, source system, supersession or versioning, and audit evidence so engine and reporting consumers use the same priority and replay rules.
- issue-005 (high): Issue-005 is a material shared-authority failure: the ontology keeps three rating scales but leaves conversion among them to consumer systems, so rating-scale changes can split engine and reporting behavior and make historical classifications non-replayable.
  - root cause: The ontology does not make rating conversion a versioned, owned concept inside the target artifact and instead delegates it to external consumer systems.
  - materiality: The declared purpose is to serve as the shared concept authority for risk engine and reporting systems. Because `Borrower.internal_rating`, `RiskRating.grade`, and `Exposure.risk_grade` coexist without an owned conversion authority, consumers must implement their own mappings. That weakens the ontology as the central basis for consistent classification, especially when grades, rating models, or report-side override policies change.
  - action: Add a canonical `RatingScale`/`RatingMapping` concept before release, including source scale, target scale, mapping rules, owner, version, effective_from/effective_to, and override provenance. `Exposure.risk_grade` derivation should reference that mapping rather than consumer-local conversion, so engine/report continuity and historical replay depend on a single versioned ontology authority.
  - unresolved disagreement: Deliberation resolved the root cause and final high issue severity, while preserving lens-specific disagreement: axiology and semantics lower severity to medium in their own frames, and logic does not find an independent contradiction beyond the authority/versioning concern.
- issue-008 (high): Collateral is materially mis-modeled because the ontology makes it both a subtype of Exposure and the asset that secures an Exposure. This collapses two different core concepts: the credit position being secured and the collateral asset/support that secures it.
  - root cause: The ontology conflates collateral assets with credit exposures by using Exposure inheritance for Collateral while also modeling Collateral as the asset that secures an Exposure.
  - materiality: This weakens the declared shared concept authority for risk engines and reporting systems because consumers that honor `is_a` as subtype semantics can treat collateral assets as exposure records. That can cause exposure fields, aggregation, classification, and reporting behavior to be applied to collateral, corrupting the exposure/collateral boundary and making future collateral lifecycle extensions disruptive.
  - action: Remove `Collateral is_a Exposure` and model Collateral as a separate asset/support concept. Connect it to Exposure through a relationship entity such as `SecurityAgreement` or `CollateralLink` that can carry allocation, priority, valuation, and effective-date semantics, so collateral-specific lifecycle behavior can evolve without inheriting exposure attributes or breaking consumers.
- issue-002 (medium): 이 이슈는 차주 등급, 리스크 엔진 등급, 익스포저 등급의 병존 자체가 아니라, 그 사이의 변환 기준을 온톨로지의 canonical 개념으로 소유하지 않고 각 소비 시스템에 맡긴 점이 문제다. 따라서 공유 온톨로지는 등급 의미와 변환 기준의 단일 기준 역할을 하지 못한다.
  - root cause: 등급 스케일 병존을 canonical mapping concept으로 승격하지 않고 소비 시스템별 변환 책임으로 남겼다.
  - materiality: 선언된 목적은 리스크 엔진과 보고 시스템이 등급 의미 및 변환 기준을 공유하도록 하는 것이다. 그런데 변환표, 버전, 적용일, 우선순위가 각 엔진·보고서·소비 시스템에 분산되면 같은 차주나 익스포저도 시스템마다 다르게 해석될 수 있다. 이는 공유 개념 기준이라는 목적을 약화시키며, 보고와 리스크 판단 간 불일치를 만들 수 있어 material issue로 유지된다.
  - action: 세 등급 스케일은 인정하되, 온톨로지 안에 canonical RatingScale과 RatingMapping을 추가해야 한다. RatingMapping에는 source_scale, target_scale, source_grade, target_grade, mapping_version, owner, effective_from/effective_to, precedence를 포함해 변환 권위와 적용 순서를 명시해야 한다. 외부 위키는 권위 있는 변환 기준 자체가 아니라 해당 규칙의 출처나 운영 절차로 연결해야 하며, 이 작업은 소비 시스템 구현보다 먼저 닫혀야 한다.
- issue-003 (medium): 한도 소진율과 RiskAppetite 준수 상태는 현재 공유된 시간 기준과 FX 권위 없이 월말 배치 ExposureAggregate 및 시스템별 환율표에 의존하므로, 같은 포트폴리오와 같은 판단 시점에서도 리스크 엔진과 보고 시스템이 서로 다른 utilization 또는 breached/compliant 상태를 산출할 수 있다.
  - root cause: 한도/준수 판단에 필요한 시간 기준과 환율 권위를 공유 개념으로 닫지 않고 소비 시스템과 배치 주기에 맡겼다.
  - materiality: 이 문제는 리스크 엔진과 보고 시스템이 한도 소진율 및 RiskAppetite 준수 상태를 동일한 권위와 시간 기준으로 공유해야 한다는 목적을 약화한다. 준수 상태는 운영상 핵심 신호인데, 일중 신규 여신이 월말 배치 전까지 반영되지 않거나 통화 환산 기준이 시스템별로 달라지면 보고 지연, 한도 초과 미탐지, 엔진-보고 불일치가 발생할 수 있다.
  - action: Limit 소진율과 RiskAppetite 준수 판단에 canonical valuation_time/as_of, aggregation_cutoff, freshness_status, fx_rate_source, fx_rate_timestamp, currency_basis를 모델링해야 한다. 월말 배치 값은 stale 가능성을 명시하고, 일중 준수 판단이 필요한 경우 별도 current exposure source 또는 'not current' 상태를 두어 현재성 없는 값을 현재 준수 상태처럼 소비하지 못하게 해야 한다.
- issue-004 (medium): Default and delinquency states are materially missing from the shared credit-risk ontology as a minimal external-authority lifecycle-status reference, so the ontology cannot provide a common basis for post-transition exposure classification across risk engines and reporting.
  - root cause: External default/delinquency state is excluded from the shared ontology instead of modeled as a minimal authoritative lifecycle-status reference with source and timing metadata.
  - materiality: This weakens completeness of the shared exposure-risk lifecycle basis because Exposure is a core entity, but its modeled attributes stop at identifiers, borrower, amount, product type, risk grade, and LTV while default/delinquency status is explicitly excluded. When an exposure becomes delinquent or defaults, grades, reporting aggregation, limits, collateral treatment, and risk classification may depend on that state; without a shared reference, consumers can classify the same exposure differently.
  - action: Add a minimal DefaultStatus or ExposureLifecycleStatus reference concept linked to the external authority, including source_system, status, status_effective_at, status_received_at, and status_history_ref. This should preserve the external system as the authority while giving risk-engine and reporting consumers the same lifecycle status basis; richer status vocabulary and transition semantics can be defined later once authoritative evidence is available.
- issue-006 (medium): Issue-006 is a material utilization-calculation provenance and authority gap: limit utilization is defined from stored exposure aggregates, approved limits, and FX conversion, but the ontology lacks canonical snapshot, version, source, cutoff/as-of, and valuation metadata needed to replay the calculation consistently.
  - root cause: The ontology combines stored exposure aggregates, approved limits, and FX conversion without canonical snapshot/version/source metadata for replayable utilization calculations.
  - materiality: This weakens the declared shared risk-engine and reporting purpose because the same borrower and limit can produce different utilization results when batch timing, report cutoffs, limit sources, or system-local FX tables differ. Since utilization can drive risk appetite breach checks and reporting, missing shared authority over inputs and valuation timing undermines reproducibility and comparability.
  - action: Fix this before release by making utilization depend on explicit temporal and valuation concepts: define ExposureSnapshot or extend ExposureAggregate with calculation_frequency, included_exposure_cutoff, as_of timestamp, source batch/run id, and version; add source-of-record or BookOfRecord/LimitSourceAuthority concepts for limit values; add CurrencyConversionRate metadata such as rate_source, rate_timestamp, effective_date, currency_pair, and version. LimitUtilization should reference the named snapshot, authoritative limit source, and canonical FX policy so replay and reporting use the same inputs.
  - unresolved disagreement: Deliberation narrowed the issue to a provenance and authority gap primarily supported by evolution and coverage with axiology materiality support; it should not be restated as a fully supported formal logic, semantics-led, or graph-structure defect without additional lens-specific evidence.
- issue-007 (medium): Issue-007 remains a material evolvability problem: core credit-risk classifications are modeled as closed inline enums, so ordinary growth in segments, products, collateral classes, or grades requires schema and validator edits instead of additive taxonomy management.
  - root cause: Volatile business classifications are encoded as closed attribute-local enums rather than managed taxonomy concepts with lifecycle and compatibility metadata.
  - materiality: This weakens the declared purpose of an extensible shared classification ontology because the categories most likely to change are embedded directly in attribute definitions. When portfolios, reporting needs, or regulatory expectations add a category, consumers must absorb schema changes rather than reference a stable classification record with compatibility metadata.
  - action: Promote these volatile classifications to managed taxonomy concepts such as ProductType, CollateralType, BorrowerSegment, and GradeCode, with stable ids, labels, aliases, status, effective/version dates, and parent/category relations. Then keep the entity attributes as references to those taxonomy entries so category growth is additive and downstream compatibility can be managed explicitly.
- issue-009 (medium): Issue-009 is material: Exposure.ltv is presented as a collateralized risk ratio, but the ontology does not define whether that value is calculated, manually entered, snapshotted, or overridden. That leaves consumers unable to know which LTV value is authoritative for risk rules or reporting.
  - root cause: LTV is named as a collateralized ratio but modeled as an independent underwriter-entered input rather than a derived or snapshot measure with formula, timing, authority, and override semantics.
  - materiality: The declared purpose depends on a shared semantic basis for collateralized exposure risk measures. If Exposure.amount or Collateral.appraised_value changes while an independently entered ltv remains unchanged, risk engines and reports can apply different meanings of LTV to the same exposure, weakening classification, limit monitoring, and trust in outputs.
  - action: Define LTV as a governed derived or snapshot measure with explicit formula, denominator and valuation source, timestamp, and authority. If manual override is allowed, split calculated LTV from the approved override and include override reason, approval authority, and related metadata. Preserve the dependency on the broader exposure-collateral valuation/link lifecycle, but do not let that broader dependency postpone fixing LTV authority semantics in the target model.
  - unresolved disagreement: Deliberation resolved the issue as standing independently, while preserving narrower concerns from evolution, logic, and structure: direct structure evidence would be needed to claim a standalone structural graph defect, and formal logic evidence would be needed to claim a pure contradiction.
- issue-010 (medium): The ontology materially fails to distinguish three non-equivalent credit grade concepts: borrower internal rating, engine-produced borrower rating, and exposure reporting grade. Because these are presented as loosely related credit/risk grades without canonical mapping or authority, consumers can treat incompatible scales as if they were interchangeable.
  - root cause: The ontology preserves historically separate rating scales without assigning a canonical semantic authority or explicit mapping inside the shared concept artifact.
  - materiality: This weakens the ontology’s declared purpose as a shared concept authority for credit-grade classification. If the risk engine and reporting system both see their grade values as valid but no shared semantic mapping defines how they relate, each consumer must interpret or convert ratings locally, allowing inconsistent classifications to coexist under the same ontology.
  - action: Fix the issue by naming the concepts according to subject and authority, for example borrower_internal_rating, engine_borrower_rating, and exposure_reporting_grade, and by adding a canonical mapping or derivation artifact. That artifact should define the mapping owner, effective time/versioning, and override semantics for reporting adjustments so engine output, borrower-level rating, and report-grade classification have explicit relationships rather than implicit consumer-specific conversions.
- issue-011 (medium): RiskAppetite compliance is materially under-modeled: RiskAppetite should represent the policy threshold, while compliance should be a separate scoped evaluation result over an ExposureAggregate at a specific time.
  - root cause: RiskAppetite compliance is modeled as an intrinsic status on a policy threshold and omitted from the navigable relation graph instead of as a scoped evaluation result over an ExposureAggregate at a time.
  - materiality: This weakens the ontology's declared purpose as a shared concept authority for limit/appetite compliance across engine and reporting outputs. Because compliance status is embedded on the threshold and RiskAppetite is omitted from the navigable aggregate graph, consumers cannot reliably compute, audit, traverse, or reconcile breach status from ExposureAggregate values without inventing their own joins, scope assumptions, and timing basis.
  - action: Keep RiskAppetite as the policy/threshold concept and add a RiskAppetiteCompliance evaluation concept or explicit relation that binds RiskAppetite, ExposureAggregate, applicable scope keys, as_of/evaluation time, and status. This should be fixed in the target before release because downstream engine and reporting consumers need one authoritative structure for deriving and auditing compliance rather than parallel consumer-specific interpretations.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-005: Deliberation resolved the root cause and final high issue severity, while preserving lens-specific disagreement: axiology and semantics lower severity to medium in their own frames, and logic does not find an independent contradiction beyond the authority/versioning concern.
- issue-006: Deliberation narrowed the issue to a provenance and authority gap primarily supported by evolution and coverage with axiology materiality support; it should not be restated as a fully supported formal logic, semantics-led, or graph-structure defect without additional lens-specific evidence.
- issue-009: Deliberation resolved the issue as standing independently, while preserving narrower concerns from evolution, logic, and structure: direct structure evidence would be needed to claim a standalone structural graph defect, and formal logic evidence would be needed to claim a pure contradiction.

## Deliberation Decision
- issue-001: resolved
- issue-005: resolved
- issue-008: resolved
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: narrowed
- issue-006: narrowed
- issue-007: no-deliberation-needed
- issue-009: resolved
- issue-010: no-deliberation-needed
- issue-011: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Shared, reproducible credit-rating concept authority for the risk engine and reporting system, including past reporting-date replay and auditability. Source finding context: 리스크 엔진과 보고 시스템이 공유할 여신 리스크 개념 권위 기준 제공. Source finding context: 리스크 엔진 산출과 보고 시스템 사용 값 사이의 통제 가능하고 감사 가능한 공유 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유할 신용등급 개념 기준 및 과거 기준일 보고 재현성
- issue-005: The ontology's declared purpose as a shared concept authority for risk engine and reporting systems.
- issue-008: Shared concept authority for exposure and collateral management across risk-engine and reporting systems. Source finding context: A change-tolerant concept basis for exposure and collateral management shared across systems. Source finding context: Shared credit-risk concept authority for risk engine and reporting systems. Source finding context: A shared concept authority for risk engines and reporting systems covering exposure and collateral concepts.
- issue-002: 리스크 엔진과 보고 시스템 사이의 등급 의미 및 변환 기준 공유.
- issue-003: 리스크 엔진과 보고 시스템이 한도 소진율 및 RiskAppetite 준수 상태를 동일한 권위와 시간 기준으로 공유하는 것.
- issue-004: Completeness of the shared exposure-risk lifecycle basis for risk-engine and reporting classification. Source finding context: 여신 리스크 분류 온톨로지의 주요 리스크 상태 포괄성과 리스크 엔진·보고 시스템 간 상태 기준 공유
- issue-006: Shared risk-engine and reporting basis for limit utilization and exposure aggregation. / 리스크 엔진과 보고 시스템이 공유하는 한도 소진율 및 통화 환산 기준
- issue-007: Extensible shared classification ontology for credit-risk engine and reporting concepts.
- issue-009: Shared semantic basis for risk-engine and reporting use of collateralized exposure risk measures.
- issue-010: A concept authority shared by the risk engine and reporting system for credit-grade classification.
- issue-011: Shared concept authority for limit/appetite compliance across engine and reporting outputs. Source finding context: The ontology's stated purpose as a shared concept authority for risk engine and reporting systems.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Issue-001 is a material governed rating-event authority gap: the ontology cannot provide one shared authoritative rating value when engine grades, report-side manual adjustments, mapping changes, and historical assignments are modeled as mutable/current grade attributes instead of distinct governed events. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- The bounded evidence does not include the external wiki or consumer implementations, so the synthesis is limited to the ontology contract's lack of internal conversion authority.
- Within this unit, the actual external delinquency-management data contract was not inspected.
- The accepted resolution narrows the fix to a minimal external-authority reference, not a full lifecycle model.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-005 (high): fix_before_release, fix_now
- issue-008 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-004 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): follow_up
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
