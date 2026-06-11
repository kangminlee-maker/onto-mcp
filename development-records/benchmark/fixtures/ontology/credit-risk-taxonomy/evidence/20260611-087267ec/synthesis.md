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
- issue-001 (high): Issue-001은 등급 스케일, 등급 매핑, 수동 조정, 상품·담보·세그먼트 같은 변경 가능한 업무 분류가 온톨로지 안에서 버전 관리되는 권위 개념으로 닫혀 있지 않다는 중대한 문제입니다. 그 결과 리스크 엔진과 보고 시스템이 서로 다른 변환·조정·카테고리 해석을 해도 둘 다 온톨로지 준수처럼 보일 수 있습니다.
  - root cause: Mutable risk classification values are modeled as current attributes, fixed enums, or external mappings instead of governed versioned classification, assignment, and mapping concepts with explicit scale, authority, effective time, and override rules.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 공유하는 분류 개념 권위가 되는 것입니다. 그런데 RiskRating.grade, Borrower.internal_rating, Exposure.risk_grade가 서로 다른 스케일과 권위를 가지며, 변환은 소비 시스템에 맡겨지고, Exposure.risk_grade는 보고팀 수동 조정도 허용됩니다. 여기에 유효기간·이력·버전·우선순위가 없으므로 같은 차주나 익스포저의 위험 의미가 시스템별로 달라지고, 과거 기준일 보고나 등급 변경 후 재현도 온톨로지 자체에서 보장되지 않습니다.
  - action: 등급, 등급 할당, 등급 스케일, 매핑, override, 변경 가능한 코드셋을 온톨로지의 버전드 권위 개념으로 승격해야 합니다. 각 개념에는 effective_from/effective_to 또는 as_of, source authority, mapping_version, derivation_version, precedence, override_authority, adjustment reason, provenance, downstream visibility를 두고, 현재값 속성은 필요한 경우 최신 projection으로만 유지해야 합니다. 또한 ProductType, CollateralType, BorrowerSegment 같은 코드셋은 code, parent_code, status, reporting_bucket, engine_mapping을 가진 버전드 분류로 관리해야 합니다. 이 조치가 먼저 닫혀야 이후 엔진 산출, 보고 조정, 과거 재현, 신규 분류 도입이 동일한 권위 기준 위에서 작동할 수 있습니다.
- issue-004 (high): issue-004는 한도, 환산 금액, 등급 매핑처럼 리스크 엔진과 보고 시스템이 함께 쓰는 분산·파생 값에 단일 권위 원천이 모델링되어 있지 않아, 공유 온톨로지가 시스템별 해석 차이를 막지 못한다는 고중요도 material 이슈입니다.
  - root cause: The ontology omits a source-authority concept for values distributed across systems, reference tables, and derived calculations.
  - materiality: 온톨로지의 선언된 목적은 리스크 엔진과 보고 시스템이 공유하는 개념 권위가 되는 것입니다. 그런데 같은 값이 승인 시스템, CRM, 환율 테이블, 매핑 테이블, 소비 시스템별 계산 로직에 분산되어 있고 어느 원천·테이블·버전·계산시점이 권위인지 닫혀 있지 않으면, 동일 차주나 익스포저에 대해 서로 다른 소진율, 환산 금액, 등급, 한도 해석이 정상 상태로 허용됩니다. 이는 공유 판단 기준이라는 목적을 직접 약화시키고 보고 불일치와 운영 리스크를 만듭니다.
  - action: 조치는 enterprise-wide 재고가 아니라 공유 리스크·보고 해석에 영향을 주는 분산 값에 한정된 authority metadata 또는 AuthorityRegistry/ReferenceDataAuthority를 도입하는 것입니다. 최소 범위는 공유 계산에 들어가는 값이며, source_system, source_priority, mapping_table_version 또는 reference table version, fx_rate_source, calculation_as_of, reconciliation rule을 포함해야 합니다. 소비 시스템별 변환은 허용하더라도 엔진 권위 값과 보고 권위 값의 우선순위와 충돌 조정 규칙을 먼저 닫아야 합니다.
  - unresolved disagreement: logic 렌즈는 넓은 source-authority registry 자체보다는 공유 계산의 결정성을 보장하는 source, precedence, version, reconciliation 규칙 범위로 이슈를 좁혀 보았습니다. 최종 resolution은 이 범위 제한을 보존하여, 계산에 투입되는 값은 필수 핵심 범위이고 registry는 공유 리스크·보고 의미 해석에 영향을 주는 분산 값으로 제한됩니다.
- issue-002 (medium): Limit utilization과 RiskAppetite compliance는 aggregate value, threshold, borrower/context, valuation basis, freshness, as-of time을 묶는 canonical assessment context 없이 모델링되어 있어, 같은 질문에도 시스템별 또는 실행 시점별로 다른 utilization/breach 결론이 ontology-compliant하게 나올 수 있습니다.
  - root cause: Utilization and appetite breach status lack an explicit assessment context that binds aggregate value, threshold, valuation basis, freshness, and as-of time into one authoritative calculation event.
  - materiality: 이 이슈는 리스크 엔진과 보고 시스템이 공유해야 하는 운영 통제 기준을 약화시키므로 material합니다. ExposureAggregate는 month-end batch 값으로 intraday exposure를 다음 batch까지 누락할 수 있고, cross-currency utilization은 각 시스템의 daily FX table에 맡겨져 있습니다. 여기에 RiskAppetite.compliance_status가 특정 borrower, aggregate, as-of 평가 결과가 아니라 appetite 자체의 속성처럼 놓이면서, 보고 재현성과 breach 판정의 추적성이 떨어집니다.
  - action: RiskAppetite는 기준 값과 threshold를 보유하는 개념으로 정리하고, 별도의 RiskAppetiteAssessment 또는 AppetiteCompliance 같은 평가 결과 개념을 정의해야 합니다. 이 assessment context는 borrower/context, ExposureAggregate, appetite/limit threshold, calculation_as_of, exposure inclusion cutoff, batch-vs-intraday 상태, freshness/staleness 상태, canonical FX source/table version, rate timestamp, computed_status를 연결해야 합니다. 이 작업이 먼저 닫혀야 limit utilization과 breach reporting이 같은 기준으로 재현됩니다.
- issue-003 (medium): 수동 입력, 승인, 보고 조정이 리스크 등급·LTV·승인 한도 같은 권위 있는 값을 바꾸는데도, 온톨로지는 이를 감사 가능한 통제 행위로 모델링하지 않고 결과 값이나 note 수준에 머물러 있습니다. 따라서 issue-003은 다음 단계 전에 닫아야 하는 material issue입니다.
  - root cause: Control-changing human actions are described as notes or result values instead of being modeled as auditable events with actor, time, reason, evidence, source value, adjusted value, and approval state.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 조정·승인된 리스크 값을 같은 기준으로 공유하게 하는 것입니다. 그러나 사후 설명이나 통제 검증이 필요한 순간에 결과 값만 남으면 소비자는 그 값이 자동 산출인지, 수동 조정인지, 승인된 값인지, 누가 어떤 근거로 바꾼 값인지 구분할 수 없습니다. 이는 운영 통제와 보고 신뢰를 직접 약화합니다.
  - action: Manual adjustment, approval, assessment input을 공통 ControlAction 또는 AdjustmentEvent/ApprovalEvent/AssessmentInput 같은 감사 이벤트로 모델링해야 합니다. 각 이벤트는 actor_ref, occurred_at, reason, evidence_ref, source_value, adjusted_value, approval_status/status를 보존하고, Exposure.risk_grade, Exposure.ltv, Limit.approved_amount 같은 영향을 받는 값이 해당 이벤트를 참조해야 합니다. deliberation은 단순 변경 이력 필드만으로는 부족하며, 이 필드들이 전체 통제 행위 이벤트 안에 포함되어야 한다고 결론냈습니다.
- issue-005 (medium): 공유 신용위험 온톨로지가 연체와 부실(default) lifecycle 상태를 최소 경계 projection 없이 외부 시스템 책임으로만 배제하여, 정상 익스포저 이후의 핵심 상태 분류를 공통 기준으로 표현하지 못한다.
  - root cause: Default and delinquency lifecycle states are excluded to an external system without even a minimal boundary projection in the shared ontology.
  - materiality: 이 이슈는 온톨로지의 주요 여신 리스크 상태/lifecycle 포괄성을 약화한다. 익스포저가 연체, 부실, 회복, 상각 단계로 이동할 때 리스크 엔진과 보고 시스템은 공통 분류 기준이 필요한데, 현재 모델은 정상 익스포저와 단순 compliance 상태에 치우쳐 distressed 상태를 공유 해석 공간 밖에 둔다.
  - action: DefaultStatusSnapshot 또는 CreditQualityStatus 같은 최소 external-source status projection을 추가해야 한다. 이 projection에는 source_system, status, days_past_due 또는 default_flag, effective_as_of, resolution_status를 포함하고 Exposure 또는 Borrower와 연결해야 하며, 상세 연체관리 모델을 가져오는 것이 아니라 리스크 엔진과 보고 시스템이 공유할 최소 상태 분류를 닫는 것이 핵심이다.
- issue-006 (medium): Cross-currency Limit utilization is materially under-specified because the ontology leaves FX source, rate timestamp, version, and fallback selection to each consuming system instead of defining a canonical conversion policy.
  - root cause: Cross-currency utilization delegates FX source, version, and rate timestamp to each system instead of modeling a canonical FX conversion policy.
  - materiality: This weakens shared calculation and time-basis continuity between the risk engine and reporting systems. When limits or exposures are multi-currency and FX providers, daily tables, cut-off times, or correction policies change, the same borrower and same as_of can yield different utilization values by system, reducing report reproducibility and engine-report consistency.
  - action: Add a CurrencyConversionPolicy or FxRateSource concept that records source_system, rate_type, as_of_datetime, effective version, and fallback policy, then link utilization rules to that policy and to ExposureAggregate.as_of. This should be fixed before the next stage because utilization cannot be a stable shared metric until the FX authority and time basis are modeled.
- issue-007 (medium): ExposureAggregate.total_amount는 현재 전체 합계와 월말 배치 스냅숏이라는 두 의미를 동시에 담고 있어, 일중 신규 여신이 발생한 배치 전 구간에서 총익스포저와 Limit 소진율 계약을 신뢰할 수 없습니다.
  - root cause: ExposureAggregate.total_amount is assigned both complete-current-sum and month-end-batch-snapshot meanings in one field contract.
  - materiality: 이 문제는 리스크 엔진과 보고 시스템이 공유해야 하는 총익스포저 및 Limit 소진율 산정 기준을 약화시킵니다. 같은 ontology 소비자가 total_amount를 모든 Exposure.amount의 완전 합계로 읽을 수도 있고, 일중 신규 여신이 빠진 월말 배치 저장값으로 읽을 수도 있어 동일 차주와 한도 상태에 대해 서로 다른 소진율과 보고 값을 산출할 수 있습니다.
  - action: real-time total exposure와 batch snapshot을 별도 속성이나 엔티티로 분리하거나, total_amount를 명시적인 as-of 스냅숏으로 재정의해 inclusion cutoff와 freshness semantics를 붙여야 합니다. 그 다음 Limit 소진율 규칙이 어느 값을 사용하는지 고정해야 하며, 그래야 계산 소비자가 동일한 시간 기준과 포함 범위로 일관된 결과를 만들 수 있습니다.
- issue-008 (medium): issue-008은 담보를 Exposure 하위 유형으로 둔 문제와 LTV-like 값을 산출 지표와 입력값 사이에서 분리하지 않은 문제를 하나의 secured-lending 의미 권위 이슈로 유지해야 합니다. 담보는 독립된 담보 자산/평가 개념으로 분리하고, LTV는 원천 금액과 담보 평가가치에서 계산되는 지표로 정의하되 수기 입력이나 담보인정비율은 별도 개념으로 분리해야 합니다.
  - root cause: The ontology does not cleanly separate exposure, collateral asset/valuation, and derived secured-lending metric concepts.
  - materiality: 이 문제는 리스크 엔진과 보고 시스템이 공유해야 하는 익스포저, 담보, 지표 의미의 권위를 약화합니다. Collateral이 Exposure 의미를 상속하면 담보 자산이 익스포저 집계나 상품/등급 해석에 잘못 소비될 수 있고, LTV가 입력값과 산출값으로 공존하면 심사, 보고, 한도 판단에서 서로 다른 기준값을 사용할 수 있습니다.
  - action: 우선 Collateral.is_a: Exposure를 제거하고 Collateral을 독립 담보 자산/평가 개념으로 유지한 뒤 Exposure secured_by Collateral 관계만 권위 관계로 삼아야 합니다. 이어 calculated_ltv는 Exposure.amount와 Collateral.appraised_value 및 담보 선택/기준일 규칙에 따른 산출 지표로 정의하고, 심사역 수기값이나 담보인정비율이 필요하면 manual_ltv_override 또는 collateral_recognition_ratio처럼 별도 속성으로 분리해야 합니다. evolution·logic 렌즈가 좁힌 범위까지 반영하려면 수기 입력, 산출값, valuation의 권위와 이력도 함께 명시해야 합니다.
- issue-009 (medium): RiskAppetite is a material graph usability issue: it is declared as the compliance threshold for ExposureAggregate breach evaluation, but the ontology does not make it reachable from ExposureAggregate through a modeled evaluation path.
  - root cause: The relation graph omits the edge needed to connect RiskAppetite to the ExposureAggregate it evaluates.
  - materiality: This weakens the ontology's stated purpose as shared concept authority for exposure, limits, and compliance-state traversal. A consumer trying to determine or report appetite compliance from ExposureAggregate cannot follow the graph to RiskAppetite, so implementations may create incompatible joins or skip the appetite check.
  - action: Add an assessment/evaluation intermediary, or an equivalent explicit relation pattern, connecting ExposureAggregate and RiskAppetite for compliance evaluation. A bare direct edge is acceptable only if it participates in a modeled evaluation path carrying the comparison context and result semantics; otherwise it would not resolve the accepted narrowing from deliberation.
- issue-010 (medium): Issue-010 is a material structural gap: the ontology says Exposure.risk_grade is derived from RiskRating.grade, but it does not provide a bounded graph relation or explicit mapping path that consumers can traverse or validate.
  - root cause: The ontology declares a grade derivation dependency in text but does not model a bounded graph relation or mapping path from RiskRating to Exposure.
  - materiality: This weakens the declared purpose of sharing classification structure between the risk engine's RiskRating output and the reporting Exposure risk grade. Consumers can see both grade-bearing fields, but without a graph-level dependency they must infer how the reporting grade relates to the engine grade, allowing risk engine and reporting implementations to make different linkage assumptions while still appearing compliant.
  - action: Add a bounded derivation relation, explicit grade-mapping concept, or versioned mapping path linking RiskRating output to Exposure reporting grade. The fix should preserve issue-010 as the concrete graph-path remediation while aligning with issue-001's broader rating-authority model, so consumers can trace, validate, and govern the reporting grade dependency instead of relying on free-text interpretation.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-004: logic 렌즈는 넓은 source-authority registry 자체보다는 공유 계산의 결정성을 보장하는 source, precedence, version, reconciliation 규칙 범위로 이슈를 좁혀 보았습니다. 최종 resolution은 이 범위 제한을 보존하여, 계산에 투입되는 값은 필수 핵심 범위이고 registry는 공유 리스크·보고 의미 해석에 영향을 주는 분산 값으로 제한됩니다.

## Deliberation Decision
- issue-001: resolved
- issue-004: narrowed
- issue-002: no-deliberation-needed
- issue-003: resolved
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: narrowed
- issue-009: resolved
- issue-010: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: The ontology's declared purpose as the shared classification concept authority for risk engine and reporting systems, including historical reconstruction and classification evolution. Source finding context: The declared purpose that this ontology is the shared concept authority for risk engine and reporting system classification. Source finding context: 리스크 엔진과 보고 시스템이 공유할 여신 리스크 분류 기준 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서 Source finding context: 분류체계 변경에 견디는 공유 리스크 개념 기준 Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 등급 개념 기준
- issue-004: The ontology's declared role as a shared concept authority for risk engine and reporting system use. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서
- issue-002: The ontology's shared operational control basis for risk engine and reporting, especially temporality, valuation authority, limit utilization, and appetite breach reporting. Source finding context: The ontology's purpose as a shared concept basis for risk engine and reporting, especially for temporality and operational-risk review criteria. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 한도 기준과 위반 상태의 의미 기준
- issue-003: The shared concept standard for adjusted or approved risk values used by the risk engine and reporting system. Source finding context: 리스크 엔진과 보고 시스템이 공유할 조정·승인된 리스크 값의 개념 기준
- issue-005: The ontology's coverage of major credit-risk status and lifecycle classifications. Source finding context: 여신 리스크 분류 온톨로지의 주요 상태/lifecycle 포괄성
- issue-006: Shared calculation and time-basis continuity between the risk engine and reporting systems. Source finding context: 리스크 엔진과 보고 시스템 간 공유 산식 및 시간 기준의 연속성
- issue-007: The shared concept contract for total exposure and limit utilization calculation. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 개념 기준, 특히 총익스포저와 Limit 소진율 산정 계약
- issue-008: The shared exposure, collateral, and metric meaning authority used by the risk engine and reporting systems. Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 익스포저·담보 개념 기준 Source finding context: 리스크 엔진과 보고서 시스템이 공유할 지표 의미와 권위 기준
- issue-009: The shared concept authority for exposure, limits, and compliance-state traversal and validation. Source finding context: Shared concept authority for risk engines and reporting systems over credit exposure, limits, and compliance state.
- issue-010: The shared classification structure between the risk engine's RiskRating output and the reporting Exposure risk grade. Source finding context: Shared classification structure between the risk engine's RiskRating output and the reporting team's Exposure risk grade.

## Final Review Result
10 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Issue-001은 등급 스케일, 등급 매핑, 수동 조정, 상품·담보·세그먼트 같은 변경 가능한 업무 분류가 온톨로지 안에서 버전 관리되는 권위 개념으로 닫혀 있지 않다는 중대한 문제입니다. 그 결과 리스크 엔진과 보고 시스템이 서로 다른 변환·조정·카테고리 해석을 해도 둘 다 온톨로지 준수처럼 보일 수 있습니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 외부 연체관리 시스템의 상세 모델은 이 unit boundary 밖이므로 검토하지 않았다.
- 결론은 이 온톨로지 안에 최소 참조/경계 projection이 없다는 범위에 한정된다.
- Actual FX table operations, provider corrections, and system-specific table histories were outside this unit boundary and were not verified.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
