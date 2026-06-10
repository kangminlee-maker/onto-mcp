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
- issue-002 (high): 세 등급 스케일과 확장 가능한 분류값이 온톨로지 내부의 버전 있는 mapping/taxonomy 권위로 관리되지 않아, 현재 등급 의미 대응·과거 등급 재구성·향후 분류체계 변경의 연속성이 모두 약해지는 high material issue입니다.
  - root cause: 등급 값, 등급 스케일, 분류 어휘를 유효기간과 버전이 있는 권위 개념으로 분리하지 않고 속성/enum 및 소비자별 변환에 맡겨 과거 재현성과 향후 taxonomy 진화가 함께 깨진다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템이 공유하는 분류체계와 신용등급 기준, 보고 재현성의 권위가 되어야 합니다. 그런데 등급 변환을 소비 시스템별 구현에 맡기고 핵심 분류값을 고정 enum/현재 속성으로만 두면, 같은 차주나 익스포저의 등급 해석과 정책 적용이 시스템·시점별로 달라질 수 있습니다. 새 상품, 담보, 세그먼트, 리스크 등급이 추가될 때도 통제된 taxonomy 업데이트가 아니라 schema coordination 문제가 되어 공유 기준의 신뢰를 약화합니다.
  - action: 온톨로지 안에 `RatingScale`, `RatingGrade`, `GradeMapping` 및 governed classification vocabulary를 추가해야 합니다. 각 mapping/value에는 source/target scale, stable code, version 또는 valid_from/valid_to, owner, alias/deprecation/unknown 처리, manual override provenance를 포함해야 하며, Borrower/Exposure의 현재 등급은 이 권위 모델에서 파생되는 view로 두는 것이 필요합니다. 이 작업은 소비 시스템의 독립 변환보다 먼저 닫혀야 engine-report continuity와 taxonomy evolution의 기준점이 생깁니다.
- issue-004 (high): 등급, 한도, 환율 값에 대해 복수 원천과 소비자별 해석을 하나로 닫는 공통 권위 모델이 없어, 온톨로지가 리스크 엔진과 보고 시스템의 공유 기준 역할을 충분히 수행하지 못한다.
  - root cause: 병행 관리 값을 인정하면서도 단일 원본, 변환 버전, 충돌 우선순위를 나타내는 권위 개념을 모델링하지 않았다.
  - materiality: 선언된 목적은 리스크 엔진과 보고서 시스템이 공유할 개념 권위와 분류·환산 기준을 제공하는 것이다. 그런데 등급 변환, 한도 소진율, 통화 환산이 각 소비 시스템이나 외부 표에 맡겨지면 같은 차주·익스포저라도 엔진값과 보고값이 달라질 수 있어, 온톨로지가 단일 기준이 아니라 시스템별 해석 목록으로 약화된다.
  - action: `RatingScale`, `RatingMappingVersion`, `CanonicalRiskGrade`, `FxRateTableSource`, `LimitBook`, `LimitAvailabilityAuthority` 같은 공유 권위 개념을 추가하고 각 값에 `source_system`, `authority_rank`, `effective_date/version`, `conflict_resolution_rule`을 부여해야 한다. 먼저 권위 원천과 우선순위, 버전 규칙을 모델 안에 닫은 뒤 등급 변환, 한도 가용성, FX 환산이 이 권위 개념을 참조하도록 정렬해야 한다.
- issue-011 (high): issue-011은 Borrower.internal_rating, RiskRating.grade, Exposure.risk_grade가 같은 신용등급 의미권을 공유하면서도 각 등급의 의미, 변환 규칙, 원천 권위, override 근거가 온톨로지 안에 닫혀 있지 않은 high-severity material issue입니다.
  - root cause: 온톨로지 내부에 병존 등급 스케일의 의미 분리와 매핑 권위가 정의되어 있지 않다.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 공유할 신용등급 분류 기준을 제공하는 것입니다. 그런데 엔진 산출 등급, 차주 내부 등급, 보고용 익스포저 등급의 의미와 변환 권위가 소비 시스템별 해석이나 외부 문서에 남아 있으면 같은 차주나 익스포저의 위험 수준이 보고, 심사, 한도 판단 경로에서 서로 다르게 비교되거나 조정될 수 있어 공유 기준이라는 목적을 약화합니다.
  - action: 세 등급을 단순히 하나로 합치기보다 BorrowerInternalRating, EngineBorrowerRating, ReportExposureRiskGrade처럼 의미와 책임을 분리해 명명해야 합니다. 그 다음 R1~R5에서 AAA~CCC로 가는 매핑, override 사유, override authority, as_of를 온톨로지 내부 개념으로 모델링해 변환·비교·보고 조정의 권위와 시점을 공유 기준 안에서 닫아야 합니다.
- issue-001 (medium): 보고서 팀이 `Exposure.risk_grade`를 수동 조정할 수 있게 하면서 원천 `RiskRating.grade`와의 권위, 우선순위, 유효시점, provenance, 이력 기준을 닫지 않은 것이 medium severity의 권위 drift 이슈다.
  - root cause: 공유 권위 문서 안에서 원천 엔진 등급과 보고용 파생 등급의 권위 경계를 닫지 않은 채 수동 조정을 허용한다.
  - materiality: 대상 온톨로지의 목적은 리스크 엔진과 보고서 시스템이 공유할 개념 권위 기준을 제공하는 것이다. 그런데 보고용 등급 조정이 별도 권위와 이력 없이 허용되면 동일 익스포저의 공식 리스크 등급이 엔진 결과와 보고 결과로 갈라질 수 있어, 공유 기준 문서가 오히려 소비 시스템별 등급 차이를 정당화하게 된다. 그 결과 대사, 감사, 리스크 의사결정 신뢰가 약해진다.
  - action: `RiskRating.grade`는 원천 엔진 등급으로 고정하고, `Exposure.risk_grade`는 파생/보고용 등급인지 조정 결과인지 의미를 분리해야 한다. 수동 조정은 `override_grade`, `override_reason`, `override_authority`, `effective_at`, `source_grade` 같은 필드나 동등한 규칙으로 닫아 조정 권위, 사유, 유효시점, 원천 값, 이력을 보존해야 한다. 이 정리는 공유 기준으로 다음 단계에 넘기기 전에 먼저 닫아야 하는 차단 조건이다.
- issue-003 (medium): 월말 배치 기준의 ExposureAggregate, 일중 미반영 상태, 당일 환율, 시스템별 환율 권위가 같은 계산 계약에 섞여 있어 Limit 소진율과 RiskAppetite 준수 판단이 시점과 시스템에 따라 달라질 수 있다.
  - root cause: 시간 민감 리스크 판단에 필요한 공통 기준시각과 환율 권위를 온톨로지 내부에서 닫지 않는다.
  - materiality: 영향받는 목적은 리스크 엔진과 보고 시스템이 공유하는 시간 일관적 리스크/한도 판단 기준 제공이다. 현재 구조에서는 월말 집계값과 당일 환율, 시스템별 환율 테이블이 함께 쓰일 때 동일 차주라도 보고 시점과 엔진 판단 시점에 따라 한도 위반 또는 준수 결론이 달라질 수 있으므로, 공유 판단 기준으로서의 신뢰와 운영 일관성이 약해진다.
  - action: 집계값과 비율 계산이 같은 as_of/effective_at 기준을 사용하도록 계약을 닫고, 일중 미반영 여부를 stale, provisional, final 같은 상태로 드러내야 한다. 또한 FX는 단일 권위를 두거나 fx_rate_source, 적용 시각, 필요 시 버전 기준을 명시해 Limit 소진율과 RiskAppetite 준수 판단이 같은 시간 기준과 환율 권위 위에서 재현되도록 해야 한다.
- issue-005 (medium): 수동 `ltv` 입력과 `risk_grade` 수동 조정이 리스크 분류값을 바꿀 수 있는데, 이를 감사 가능한 값 변경 이벤트로 모델링하지 않아 행위자, 시각, 근거, 승인 증거가 남지 않는 material 이슈다.
  - root cause: 수동 행위를 값 변경 이벤트가 아니라 값 속성의 주석으로만 표현했다.
  - materiality: 영향받는 목적은 리스크 분류값의 운영 통제, 보고 조정 설명 가능성, 감사 추적성이다. 보고서 팀의 `risk_grade` 조정이나 심사역의 `ltv` 입력이 분류, 소진율, 담보위험 판단에 영향을 준 뒤 근거를 확인해야 할 때, 현재 모델은 값 자체만 남기고 누가 언제 어떤 근거와 승인 상태로 바꿨는지를 설명하지 못한다. 따라서 수동 개입 검증과 오류 조정 역추적이 약해진다.
  - action: `ManualRiskGradeAdjustment`와 `LtvInputEvidence` 같은 감사 이벤트 엔티티를 추가하고, `target_ref`, `previous_value`, `new_value`, `actor_id`, `acted_at`, `reason_code`, `evidence_ref`, `approval_status`, `approver_id`, `approved_at`, `source_system`을 연결해야 한다. `Exposure.risk_grade`와 `Exposure.ltv`는 단독 속성의 최종값으로만 두지 말고 해당 이벤트에서 파생되도록 연결해야 수동 변경의 원인, 책임, 승인, 재현 가능한 이력이 함께 남는다.
- issue-006 (medium): 연체·부실 상태를 별도 시스템 범위로 둘 수는 있지만, 공유 리스크 분류 온톨로지 안에는 이를 참조할 최소 경계 개념이 필요합니다. 현재는 그 경계가 없어 정상/연체/부실 상태를 익스포저, 등급, 보고 기준일과 함께 해석하는 기준이 닫히지 않습니다.
  - root cause: 범위 밖 도메인에 대한 최소 참조/경계 개념 없이 단순 제외 메모만 두었다.
  - materiality: 이 온톨로지는 여신 리스크 관리 개념 모델이자 리스크 엔진·보고 시스템의 공유 기준을 지향합니다. 그런데 엔진 입력이나 보고 분류가 익스포저 등급과 연체·부실 상태를 함께 써야 하는 순간, 외부 상태를 어떤 식별자와 기준일로 가져와 결합해야 하는지 알 수 없습니다. 따라서 도메인 전체를 흡수하지 않는 범위 결정 자체보다, 공유 분류 기준으로서 핵심 상태 축을 연결하지 못하는 점이 목적을 약화합니다.
  - action: 연체관리 시스템 전체를 모델 안으로 흡수할 필요는 없습니다. 대신 `CreditStatusReference` 또는 `DefaultStatusSnapshot` 같은 경계 엔티티를 추가하고, `borrower_ref` 또는 `exposure_ref`, `status`, `source_system`, `external_status_id`, `as_of` 또는 `effective_from`, `effective_to`를 명시해야 합니다. 또한 이 경계 상태가 `RiskRating` 또는 `Exposure`와 어떤 기준일로 결합되는지 사용 규칙을 닫아야 다음 단계의 엔진 입력·보고 분류 기준으로 사용할 수 있습니다.
- issue-007 (medium): 통화 변환을 각 시스템의 일일 FX 테이블에 맡기는 현재 모델은 `Limit` utilization의 공유 의미를 불안정하게 만듭니다. FX source, cut-off, version, holiday handling이 바뀌면 같은 exposure와 limit 데이터도 시스템별로 다른 소진율을 만들고, 과거 보고값의 재현도 깨질 수 있습니다.
  - root cause: 온톨로지가 system-local FX table을 참조할 뿐 통화 변환을 권위 있는 versioned concept으로 모델링하지 않는다.
  - materiality: 이 이슈는 risk와 reporting 소비자가 함께 쓰는 `Limit` utilization 규칙을 직접 약화시킵니다. 공유 계산 개념인데도 통화가 다를 때 어떤 환율 원천과 적용 시각, 버전으로 환산했는지가 온톨로지에 남지 않아 cross-system reconciliation과 historical replay가 보장되지 않습니다.
  - action: `FxRate` 또는 `CurrencyConversion` 개념을 추가해 source, rate_date/time, base/quote currency, rate version, calculation provenance를 명시해야 합니다. `Limit` utilization은 이 canonical conversion input에 의존하도록 연결하고, 이전 보고 기간에는 어떤 versioned conversion을 replay해야 하는지까지 계약으로 닫아야 합니다. 이 조치는 다음 단계 전에 닫아야 하는 blocker 성격이며, 단순 계산 보완이 아니라 공유 utilization 의미의 권위와 재현성을 세우는 작업입니다.
- issue-009 (medium): ExposureAggregate.total_amount는 현재 모든 Exposure.amount의 합계와 월말 배치 기준 스냅샷을 동시에 의미하도록 되어 있어, 일중 신규 여신이 발생하는 순간 동일 필드의 invariant와 temporal state가 충돌한다.
  - root cause: 온톨로지가 하나의 `total_amount` 개념을 정확한 현재 aggregate와 dated batch snapshot 양쪽에 재사용하면서 snapshot modality를 명시하지 않았다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템이 공유하는 개념 권위로 쓰이기 때문에, 같은 total_amount 필드가 현재 익스포저 총액인지 오래된 배치 산출값인지 불명확하면 한도와 risk appetite 평가가 소비자별로 달라질 수 있다. 따라서 필드 의미의 시간 기준 불일치는 단순 설명 문제가 아니라 공유 판단 기준을 약화시키는 material consistency 문제다.
  - action: current_total_amount = sum(all current Exposure.amount)와 batch_total_amount/as_of를 분리하거나, total_amount 정의 자체를 as_of 기준 배치 산출 총익스포저로 좁혀야 한다. limit/appetite 평가에서는 어떤 기준시각의 값을 쓰는지 명시해야 하며, 이 정리는 다음 단계 전에 닫아야 소비 시스템이 같은 필드를 서로 다른 시간 의미로 계산하지 않는다.
- issue-012 (medium): RiskAppetite는 정책상 허용 한도와 특정 시점의 compliance_status를 한 엔티티에 섞고, relations에서도 적용 대상과 연결되지 않아 위반 판단의 대상, 기준시각, 계산 결과가 닫히지 않는다.
  - root cause: RiskAppetite 준수 판정을 별도 assessment 관계/엔티티로 모델링하지 않아 정책 기준, 계산 결과, 적용 대상이 모두 닫히지 않는다.
  - materiality: 이 온톨로지는 리스크 성향 한도와 위반 보고, 리스크 엔진과 보고 시스템의 공유 개념 기준을 제공해야 한다. 그런데 정책 threshold와 산출된 준수 상태가 같은 개념에 있으면 threshold 변경인지 특정 차주/시점의 위반 상태 변경인지 구분하기 어렵고, RiskAppetite가 ExposureAggregate나 차주 범위와 연결되지 않아 엔진과 보고가 서로 다른 암묵적 조인을 사용할 위험이 생긴다.
  - action: RiskAppetite를 정책/threshold 개념으로 좁히고, RiskAppetiteAssessment 또는 AppetiteBreachStatus 같은 파생 결과 개념을 추가해야 한다. 이 평가 결과에는 borrower 또는 exposure aggregate reference, as_of, used_threshold, calculation basis, 그리고 RiskAppetite와 적용 대상 사이의 명시적 관계를 포함해야 하며, 다음 단계로 넘어가기 전에 닫아야 할 medium material 이슈다.
- issue-013 (medium): Exposure.risk_grade가 RiskRating.grade에서 도출된다는 규칙은 선언되어 있지만, Exposure와 RiskRating을 직접 연결하는 관계나 mapping 엔티티가 없어 특정 익스포저 등급의 근거 등급을 그래프 안에서 추적할 수 없다.
  - root cause: 도출 규칙은 선언했지만 Exposure와 RiskRating 사이의 필수 관계를 relations에 모델링하지 않았다.
  - materiality: 이 이슈는 리스크 엔진 산출 등급과 보고 시스템 사용 등급 사이의 공유 개념 기준을 약화한다. 하나의 Borrower에 여러 Exposure나 시간별 RiskRating이 존재하면 어떤 RiskRating.grade가 특정 Exposure.risk_grade의 근거인지 그래프가 결정하지 못하므로, 계보 추적·검증·변경 영향 분석이 소비 시스템의 암묵 규칙에 의존하게 된다.
  - action: Exposure -> RiskRating의 risk_grade_derived_from 관계를 명시하거나, RatingMapping/GradeMapping 엔티티를 도입해 Exposure, RiskRating, 조정 주체를 연결해야 한다. 이 조치는 다음 단계 전 닫아야 하는 추적성 결함을 해결하며, 보고용 등급이 어떤 엔진 등급 또는 조정 mapping에서 나온 것인지 검증 가능한 구조로 만든다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-002: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-011: resolved
- issue-001: resolved
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 분류체계, 신용등급 기준, 보고 재현성, taxonomy 진화 기준 제공. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 분류체계 및 개념 기준 제공. Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 분류 기준 및 보고 재현성 Source finding context: The ontology's declared purpose as a shared concept authority for the risk engine and reporting system. Source finding context: The ontology's role as a shared concept basis for classification across risk engine and reporting.
- issue-004: 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 및 분류·환산 기준.
- issue-011: 리스크 엔진과 보고 시스템이 공유할 신용등급 분류 기준.
- issue-001: 리스크 엔진과 보고서 시스템이 공유할 개념 권위 기준 제공.
- issue-003: 리스크 엔진과 보고 시스템이 공유하는 시간 일관적 리스크/한도 판단 기준 제공.
- issue-005: 리스크 분류값의 운영 통제, 보고 조정 설명 가능성, 감사 추적성.
- issue-006: 여신 리스크 분류 온톨로지의 도메인 포괄성과 리스크 엔진·보고 시스템 공유 기준.
- issue-007: The shared utilization rule used by risk and reporting consumers.
- issue-009: The ontology is intended as a shared concept authority for risk engines and reporting systems.
- issue-012: 리스크 성향 한도와 위반 보고의 공유 개념 기준 및 리스크 엔진과 보고 시스템이 공유할 여신 리스크 개념 기준.
- issue-013: 리스크 엔진 산출 등급과 보고 시스템 사용 등급 사이의 공유 개념 기준.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-002 (high) — 세 등급 스케일과 확장 가능한 분류값이 온톨로지 내부의 버전 있는 mapping/taxonomy 권위로 관리되지 않아, 현재 등급 의미 대응·과거 등급 재구성·향후 분류체계 변경의 연속성이 모두 약해지는 high material issue입니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 연체관리 시스템 자체의 상세 모델은 검토 범위 밖이며, 이 이슈는 현재 온톨로지 안의 경계 참조 부재에 한정합니다.
- Deliberation은 물질적 충돌 없음으로 처리되었고, axiology/evolution의 좁힘은 최소 경계 참조 필요성과 양립합니다.

## Immediate Actions Required
- issue-002 (high): fix_now
- issue-004 (high): fix_now
- issue-011 (high): fix_now
- issue-001 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-006 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up

## Recommendations
- issue-010 (high): Collateral을 Exposure 하위 유형으로 두는 타입 오류와 LTV를 원천 담보/익스포저 값에서 독립된 입력값으로 두는 모델링이 결합되어 담보 기반 리스크 의미가 불안정하다. Source finding context: credit-risk-ontology.yaml / entities.Collateral Source finding context: .onto/review/20260611-2aab4b7f/execution-preparation/materialized-input.md:39-47,85-88 Source finding context: Collateral이 Exposure의 하위 유형으로 모델링되어 담보 자산과 신용 익스포저의 의미가 뒤섞인다. Source finding context: 담보 자산은 Exposure의 금액, 상품유형, 익스포저 등급을 본질적으로 갖는 신용 익스포저가 아니라 Exposure를 보전하는 별도 대상입니다. 공유 개념 권위 문서에서 이 상속이 유지되면 리스크 엔진이나 보고 시스템이 Collateral을 Exposure로 취급해 익스포저 집계, 등급, 상품 분류에 포함시키는 의미 오류가 발생할 수 있습니다. Source finding context: `Collateral.is_a: Exposure`를 제거하고 Collateral을 독립 엔터티로 유지한 뒤 `Exposure secured_by Collateral` 관계만 권위 관계로 사용하세요. 담보가 특정 익스포저에 귀속되어야 한다면 `exposure_ref` 또는 관계의 cardinality/role을 명시하세요. Source finding context: .onto/review/20260611-2aab4b7f/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저·담보 개념 기준 Source finding context: 시스템이 ontology의 `is_a` 의미를 따라 Collateral을 Exposure의 일종으로 해석하거나 상속 속성/집계 대상으로 취급할 때 Source finding context: 담보 평가 단위가 신용 익스포저로 오분류되어 총익스포저, 위험등급, 상품유형 보고의 의미적 신뢰가 깨진다. Source finding context: Collateral의 정의는 담보 자산이지만 타입 관계는 Exposure 하위 유형으로 선언되어 있다. Source finding context: Collateral은 '익스포저를 담보하는 자산'으로 정의된다. Source finding context: 같은 Collateral에 `is_a: Exposure`가 부여되어 담보 자산을 익스포저 종류로 만든다. Source finding context: 별도 관계에서는 Exposure가 Collateral에 의해 담보된다고 모델링되어 상속 관계와 역할 관계가 충돌한다. Source finding context: credit-risk-ontology.yaml / entities.Exposure.attributes.ltv Source finding context: .onto/review/20260611-2aab4b7f/execution-preparation/materialized-input.md:24-37,39-46 Source finding context: ltv가 담보와 익스포저 원천값에서 파생되는 비율인데 독립 입력값으로 모델링되어 의미 드리프트 위험이 있다. Source finding context: 비율·율 계열 용어는 원천값과 함께 존재할 때 파생값으로 취급되어야 합니다. 현재처럼 독립 입력으로 두면 Exposure.amount나 Collateral.appraised_value가 바뀌어도 ltv가 같은 의미 기준으로 재계산되었는지 알 수 없어 리스크 엔진과 보고 시스템이 서로 다른 LTV 의미를 사용할 수 있습니다. Source finding context: `ltv`를 원천 속성에서 계산되는 파생 속성으로 표시하고 계산식, 기준 담보 선택 방식, 산정 시점, override 가능 여부를 명시하세요. 사람이 입력해야 한다면 `manual_ltv`, `ltv_source`, `ltv_as_of`처럼 원천과 입력값의 의미 차이를 분리하세요. Source finding context: .onto/review/20260611-2aab4b7f/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: 담보 기반 리스크 분류와 보고 기준의 의미 일관성 Source finding context: Exposure.amount 또는 Collateral.appraised_value가 변경되거나 복수 시스템이 LTV를 재계산/입력할 때 Source finding context: 같은 익스포저의 담보 비율이 원천값과 불일치해 심사·등급·보고 판단의 재현성과 비교 가능성이 약해진다. Source finding context: 도메인상 비율 이름을 가진 ltv가 원천값과 함께 존재하지만 독립 입력 속성으로 선언되어 있다. Source finding context: Exposure.amount와 Collateral.appraised_value가 원천 금액으로 모델에 존재한다. Source finding context: Exposure.ltv는 비율 성격의 숫자 속성으로 심사역 입력값이라고 정의되어 있다. Source finding context: 계산식, 산정 시점, 원천 담보 선택 기준이 없어 원천값과 입력 비율의 의미 일치 여부를 검증할 수 없다.
- issue-008 (low): RiskAppetite definition contains a circular or under-specified rule for violation/compliance status. Source finding context: credit-risk-ontology.yaml / RiskAppetite.definition Source finding context: Embedded Materialized Input, RiskAppetite.definition: "ExposureAggregate가 RiskAppetite를 초과하면 RiskAppetite 위반이며, 위반 여부는 RiskAppetite 준수 상태로 정의된다." Source finding context: RiskAppetite definition contains a circular rule for violation/compliance status. Source finding context: Within the logic lens and domain-none boundary, the statement is not strictly unsatisfiable because `threshold` and `compliance_status` can still be assigned values. However, as a shared concept criterion for a risk engine and reporting system, the rule is logically under-specified/circular: the boolean/status it should determine is referenced as part of its own definition rather than being defined by an explicit comparison such as `ExposureAggregate.total_amount > RiskAppetite.threshold`. Source finding context: Define the rule directly against declared attributes, for example: `compliance_status = breached if ExposureAggregate.total_amount > RiskAppetite.threshold, otherwise compliant`, and specify the borrower/product/time scope needed to match an aggregate to an appetite threshold. Source finding context: .onto/review/20260611-2aab4b7f/round1/logic.findings.yaml#logic-candidate-001

## Unique Finding Tagging
- issue-010 (high): Collateral을 Exposure 하위 유형으로 두는 타입 오류와 LTV를 원천 담보/익스포저 값에서 독립된 입력값으로 두는 모델링이 결합되어 담보 기반 리스크 의미가 불안정하다. Source finding context: credit-risk-ontology.yaml / entities.Collateral Source finding context: .onto/review/20260611-2aab4b7f/execution-preparation/materialized-input.md:39-47,85-88 Source finding context: Collateral이 Exposure의 하위 유형으로 모델링되어 담보 자산과 신용 익스포저의 의미가 뒤섞인다. Source finding context: 담보 자산은 Exposure의 금액, 상품유형, 익스포저 등급을 본질적으로 갖는 신용 익스포저가 아니라 Exposure를 보전하는 별도 대상입니다. 공유 개념 권위 문서에서 이 상속이 유지되면 리스크 엔진이나 보고 시스템이 Collateral을 Exposure로 취급해 익스포저 집계, 등급, 상품 분류에 포함시키는 의미 오류가 발생할 수 있습니다. Source finding context: `Collateral.is_a: Exposure`를 제거하고 Collateral을 독립 엔터티로 유지한 뒤 `Exposure secured_by Collateral` 관계만 권위 관계로 사용하세요. 담보가 특정 익스포저에 귀속되어야 한다면 `exposure_ref` 또는 관계의 cardinality/role을 명시하세요. Source finding context: .onto/review/20260611-2aab4b7f/round1/semantics.findings.yaml#semantics-candidate-001 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 익스포저·담보 개념 기준 Source finding context: 시스템이 ontology의 `is_a` 의미를 따라 Collateral을 Exposure의 일종으로 해석하거나 상속 속성/집계 대상으로 취급할 때 Source finding context: 담보 평가 단위가 신용 익스포저로 오분류되어 총익스포저, 위험등급, 상품유형 보고의 의미적 신뢰가 깨진다. Source finding context: Collateral의 정의는 담보 자산이지만 타입 관계는 Exposure 하위 유형으로 선언되어 있다. Source finding context: Collateral은 '익스포저를 담보하는 자산'으로 정의된다. Source finding context: 같은 Collateral에 `is_a: Exposure`가 부여되어 담보 자산을 익스포저 종류로 만든다. Source finding context: 별도 관계에서는 Exposure가 Collateral에 의해 담보된다고 모델링되어 상속 관계와 역할 관계가 충돌한다. Source finding context: credit-risk-ontology.yaml / entities.Exposure.attributes.ltv Source finding context: .onto/review/20260611-2aab4b7f/execution-preparation/materialized-input.md:24-37,39-46 Source finding context: ltv가 담보와 익스포저 원천값에서 파생되는 비율인데 독립 입력값으로 모델링되어 의미 드리프트 위험이 있다. Source finding context: 비율·율 계열 용어는 원천값과 함께 존재할 때 파생값으로 취급되어야 합니다. 현재처럼 독립 입력으로 두면 Exposure.amount나 Collateral.appraised_value가 바뀌어도 ltv가 같은 의미 기준으로 재계산되었는지 알 수 없어 리스크 엔진과 보고 시스템이 서로 다른 LTV 의미를 사용할 수 있습니다. Source finding context: `ltv`를 원천 속성에서 계산되는 파생 속성으로 표시하고 계산식, 기준 담보 선택 방식, 산정 시점, override 가능 여부를 명시하세요. 사람이 입력해야 한다면 `manual_ltv`, `ltv_source`, `ltv_as_of`처럼 원천과 입력값의 의미 차이를 분리하세요. Source finding context: .onto/review/20260611-2aab4b7f/round1/semantics.findings.yaml#semantics-candidate-003 Source finding context: 담보 기반 리스크 분류와 보고 기준의 의미 일관성 Source finding context: Exposure.amount 또는 Collateral.appraised_value가 변경되거나 복수 시스템이 LTV를 재계산/입력할 때 Source finding context: 같은 익스포저의 담보 비율이 원천값과 불일치해 심사·등급·보고 판단의 재현성과 비교 가능성이 약해진다. Source finding context: 도메인상 비율 이름을 가진 ltv가 원천값과 함께 존재하지만 독립 입력 속성으로 선언되어 있다. Source finding context: Exposure.amount와 Collateral.appraised_value가 원천 금액으로 모델에 존재한다. Source finding context: Exposure.ltv는 비율 성격의 숫자 속성으로 심사역 입력값이라고 정의되어 있다. Source finding context: 계산식, 산정 시점, 원천 담보 선택 기준이 없어 원천값과 입력 비율의 의미 일치 여부를 검증할 수 없다.
- issue-008 (low): RiskAppetite definition contains a circular or under-specified rule for violation/compliance status. Source finding context: credit-risk-ontology.yaml / RiskAppetite.definition Source finding context: Embedded Materialized Input, RiskAppetite.definition: "ExposureAggregate가 RiskAppetite를 초과하면 RiskAppetite 위반이며, 위반 여부는 RiskAppetite 준수 상태로 정의된다." Source finding context: RiskAppetite definition contains a circular rule for violation/compliance status. Source finding context: Within the logic lens and domain-none boundary, the statement is not strictly unsatisfiable because `threshold` and `compliance_status` can still be assigned values. However, as a shared concept criterion for a risk engine and reporting system, the rule is logically under-specified/circular: the boolean/status it should determine is referenced as part of its own definition rather than being defined by an explicit comparison such as `ExposureAggregate.total_amount > RiskAppetite.threshold`. Source finding context: Define the rule directly against declared attributes, for example: `compliance_status = breached if ExposureAggregate.total_amount > RiskAppetite.threshold, otherwise compliant`, and specify the borrower/product/time scope needed to match an aggregate to an appetite threshold. Source finding context: .onto/review/20260611-2aab4b7f/round1/logic.findings.yaml#logic-candidate-001

## Shared Phenomenon Summary
- none
