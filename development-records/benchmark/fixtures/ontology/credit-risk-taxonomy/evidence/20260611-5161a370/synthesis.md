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
- issue-001 (high): `Exposure.risk_grade`가 원천 엔진 등급과 보고서 조정 등급을 하나의 권위값처럼 담고 있어, 두 시스템이 같은 필드명을 서로 다른 리스크 등급 의미로 소비할 수 있다.
  - root cause: `Exposure.risk_grade`가 엔진 산출 등급과 보고서 조정 등급을 같은 권위값으로 결합하면서 조정 권한, lineage, 우선순위를 온톨로지 안에서 닫지 않았다.
  - materiality: 대상 온톨로지는 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 문서여야 한다. 그런데 보고서 팀의 시장 상황 기반 조정값이 원천 엔진 등급과 구분되지 않으면, 공유 기준이 아니라 소비자별 편의값이 권위값처럼 유통되어 신뢰성과 감사 가능성을 약화한다.
  - action: 원천 엔진 등급과 보고서 조정 등급을 별도 개념 또는 명시적 속성으로 분리하고, 각 등급의 lineage와 precedence를 온톨로지 내부 규칙으로 닫아야 한다. 조정 등급에는 조정 주체, 사유, 적용 시점, 승인/감사 상태, 원천 등급 참조를 붙여 어떤 값이 공유 권위값인지 소비자가 일관되게 판단할 수 있게 해야 한다.
- issue-002 (high): issue-002는 high severity의 material issue로 유지된다. 세 등급 스케일과 확장 가능한 분류값이 온톨로지 소유의 권위 있는 스케일, 매핑, 버전, 유효기간, lifecycle 계약으로 닫히지 않아 리스크 엔진과 보고 시스템 사이의 분류 의미가 시스템별 구현 관행에 의존한다.
  - root cause: 등급 및 확장 분류값을 온톨로지 소유의 권위 있는 스케일·매핑·lifecycle 개념으로 모델링하지 않고 외부 위키, 소비 시스템 변환, 고정 enum 값에 맡겼다.
  - materiality: 이 온톨로지의 목적은 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준, 등급 해석 권위, 확장 가능한 분류체계를 제공하는 것이다. 그런데 Borrower.internal_rating, RiskRating.grade, Exposure.risk_grade가 서로 다른 스케일로 존재하면서 canonical 변환 권위와 버전이 없고, 상품·담보·세그먼트 같은 확장 분류축도 고정 enum으로만 선언되어 있다. 그 결과 같은 차주나 익스포저가 시스템별로 다른 bucket에 배치될 수 있고, 과거 보고 재현, 외부 표준 변경 대응, 새 분류값 수용이 신뢰하기 어려워진다.
  - action: RatingScale과 GradeMapping을 추가해 source/target scale, grade, mapping version, effective_from/to, mapping_status, owner, 변환 불가 또는 다대일 처리 규칙을 온톨로지 내부 계약으로 둬야 한다. product_type, collateral_type, segment, reporting grade처럼 확장 가능한 축은 CodeSet/ClassificationTerm으로 분리해 code, label, parent, status, validity, replaced_by, external_code_refs를 관리해야 한다. 등급 필드도 권위·스케일·조정 상태가 드러나도록 정리해 엔진 산출값, 보고 표시값, 수동 조정값의 차이를 판별 가능하게 해야 한다.
  - unresolved disagreement: semantics 렌즈는 범위를 rating-scale meaning과 mapping authority로 좁히고 severity를 낮추려 했지만, axiology, evolution, coverage, logic, structure는 확장 분류값의 code-set authority와 lifecycle까지 같은 high severity 범위로 유지했다. 최종 resolution은 semantics의 축소 의견을 남기되 broader lifecycle scope를 issue-002에 포함한다.
- issue-004 (high): 등급·점수·변환 결과가 현재 속성으로만 모델링되어 있어, 등급 산출·조정·스케일 변환이 바뀐 뒤 과거 특정 시점에 어떤 값과 기준이 적용됐는지 온톨로지 안에서 재구성할 수 없다.
  - root cause: 등급·점수·변환 결과를 시간 의존 assignment/history 개념으로 분리하지 않고 엔티티의 현재 속성으로만 둔 모델링 범위 결손이 있다.
  - materiality: 대상 온톨로지는 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서를 지향하며, 과거 시점 보고와 산출 재현 가능성이 핵심 목적이다. 그러나 월말 보고, 재작성 보고, 과거 심사 재현, 사후감사처럼 당시의 등급·점수·변환 기준·수동 조정 상태를 확인해야 하는 상황에서 현재값만 남으면 엔진 결과와 보고 결과의 시점별 차이를 설명하거나 감사할 권위 기준이 약해진다.
  - action: RatingSnapshot 또는 RatingAssignment 같은 이력 개념을 추가하고 grade, score, source_scale, target_scale, effective_from, effective_to, as_of, generated_at, supersedes, status를 포함해야 한다. Exposure.risk_grade도 단순 현재 속성이 아니라 RiskRating 및 조정 이벤트에서 파생되는 시점별 결과로 모델링해야 하며, 그래야 등급 변경, 매핑 변경, 수동 조정 이후에도 특정 과거 시점의 적용 값과 기준을 재현할 수 있다.
- issue-005 (high): 수동 등급 조정은 최종 Exposure.risk_grade 값만 바꾸는 문제가 아니라, 엔진 산출 등급과 보고 등급 사이의 차이를 설명해야 하는 통제 행위다. 현재 온톨로지는 이 조정 행위를 별도 권위 개념으로 남기지 않아 high material issue로 유지된다.
  - root cause: 수동 등급 조정을 별도 통제 행위와 증거 개념으로 모델링하지 않고 최종 등급 속성 변경 가능성만 규칙 문장에 두었다.
  - materiality: 영향받는 목적은 리스크 엔진 산출 등급과 보고 시스템 사용 등급의 공유 권위 및 통제 가능성이다. 보고서 팀이 시장 상황 등을 이유로 등급을 수동 조정할 수 있는데, actor, 시각, 근거, 승인, 원천값이 없으면 엔진값과 보고값이 달라진 이유를 재현하거나 감사할 수 없다. 따라서 보고 결과의 신뢰성, 재현성, 내부통제 추적성이 직접 약해진다.
  - action: RiskGradeOverride 또는 ManualAdjustment 엔티티를 추가해 exposure_ref, source_rating_ref, original_grade, adjusted_grade, actor, adjusted_at, reason_code, evidence_ref, approval_status, approved_by, approved_at, effective_period를 모델링해야 한다. 이 개념이 먼저 생겨야 최종 보고 등급이 어떤 엔진 산출값에서, 누가, 언제, 어떤 근거와 승인으로 바뀌었는지 공유 권위와 감사 증거로 연결할 수 있다.
- issue-006 (high): 등급, 한도, 환율, 익스포저 집계처럼 여러 시스템이 병행 관리하는 공유 리스크 지표 입력에 단일 원본 권위와 변환·계산 기준이 없어서, 리스크 엔진과 보고 시스템이 같은 차주·익스포저에 대해 서로 다른 결과를 내도 이를 정상 변형인지 오류인지 판정하기 어렵다.
  - root cause: 공유 리스크 지표 계산 입력의 권위, 우선순위, timestamp, version, 환율·집계 기준이 온톨로지 내부가 아니라 병행 시스템 실행에 분산되어 있다.
  - materiality: 이 이슈는 리스크 엔진과 보고 시스템이 공유해야 하는 등급 변환, 한도 소진율, 통화 환산, 익스포저 집계 기준의 일관성을 직접 약화한다. 복수 시스템이 등급 스케일 변환, CRM 한도 합산, 다중 통화 환산, 월말/일중 집계를 각각 수행할 때 권위·우선순위·시점·버전이 닫혀 있지 않으면 동일한 한도 위반이나 소진율 판단이 시스템마다 달라질 수 있고, 새 통화나 환율 정책 변경 후에도 결과의 연속성과 재현성을 보장하기 어렵다.
  - action: SourceAuthority, RatingScaleMapping, ExchangeRateSnapshot, LimitUsage 같은 권위·계산 기준 개념을 도입하고, 각 값 계열에 canonical source, source system, authority owner, precedence, mapping/fx version, rate timestamp, aggregation cutoff, calculation owner를 명시해야 한다. 소비 시스템별 변환 자체는 허용할 수 있지만, 권위 매핑과 예외 우선순위, 월말 배치값과 일중 추정값의 status/version 구분은 온톨로지 안에서 닫아야 리스크 엔진과 보고 시스템이 같은 기준으로 결과 차이를 해석할 수 있다.
- issue-008 (high): `Collateral.is_a: Exposure`는 담보를 익스포저의 하위 타입으로 만들면서, 동시에 `Exposure secured_by Collateral` 관계에서는 담보를 익스포저를 담보하는 별도 자산으로 둔다. 이 타입/관계 계약 모순은 제거되어야 한다.
  - root cause: 담보와 익스포저의 secured_by 관계를 이미 선언했음에도 `Collateral.is_a: Exposure` 상속 관계로 같은 개념을 다시 표현했다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템의 공유 개념 권위로 쓰이도록 선언되어 있다. 소비자가 `is_a`를 상속 또는 타입 멤버십으로 구현하면 담보 자산이 유효한 익스포저처럼 취급되어 타입 검사, 익스포저 속성 상속, 집계 대상 판정, 보고 조인에 섞일 수 있다. 따라서 담보와 익스포저를 구분해야 하는 운영 계약이 안전하지 않게 된다.
  - action: `Collateral.is_a: Exposure`를 제거하고 `Collateral`은 독립 엔티티로 유지해야 한다. 익스포저와 담보의 연결은 이미 선언된 `Exposure secured_by Collateral` 관계로만 표현하는 것이 필요하다. 공통 부모가 필요하다면 두 개념에 실제로 공통 속성이 있는 경우에만 중립적인 상위 개념을 별도로 도입해야 한다.
- issue-003 (medium): `ExposureAggregate.total_amount`는 실제로 월말 배치 스냅샷인데 현재 총익스포저처럼 명명·정의되어, 한도 소진율과 RiskAppetite 준수 판단에 stale 값이 현재값처럼 쓰일 수 있는 material issue다.
  - root cause: `ExposureAggregate.total_amount`가 실제로는 월말 배치 스냅샷인데 이름과 정의는 현재 총익스포저처럼 보이며, freshness와 stale 값 처리 정책이 없다.
  - materiality: 이 문제는 여신 리스크 관리와 리스크 엔진/보고 시스템 간 준수 판단 기준 공유라는 목적을 약화한다. 일중 신규 여신이 발생했는데 월말 배치 aggregate를 현재 총액처럼 사용하면 한도 초과나 RiskAppetite 위반이 다음 배치까지 정상으로 표시될 수 있고, 시스템별로 서로 다른 시간 기준으로 소진율과 위반 여부를 판단할 수 있다.
  - action: 집계 개념을 기준시점이 드러나는 스냅샷으로 명명하거나 정의를 `as_of` 기준 월말 배치 총액으로 좁혀야 한다. 그 다음 RiskAppetite와 Limit 소진율 산식에 사용할 수 있는 기준시점, 일중 이벤트 반영 여부, 산출 주기, freshness SLA, stale aggregate일 때의 invalid/unknown 상태를 명시해야 한다. 운영상 월말 배치가 계속 필요하면 준수 판단용 실시간/일중 보정 익스포저와 보고용 월말 익스포저를 별도 개념으로 분리하는 순서가 필요하다.
- issue-007 (medium): 외부 소유 default/delinquency 상태를 공유 온톨로지에 연결하는 typed boundary reference 계약이 없어, 리스크 분류와 보고가 연체/부실 상태의 권위, 기준시점, 반영 신선도를 공통 기준으로 해석하기 어렵습니다.
  - root cause: 핵심 리스크 상태 하위 영역을 외부 시스템 책임으로 제외하면서도 외부 default 상태 참조와 동기화 범위를 온톨로지에 남기지 않았다.
  - materiality: 여신 리스크 분류 온톨로지의 목적은 주요 상태 축을 포괄하고 리스크 엔진과 보고 시스템 사이의 의미 연결을 제공하는 것입니다. default 여부는 등급, 익스포저 집계, 한도 위반 보고와 함께 소비될 수 있는 핵심 상태 축인데, 현재는 범위 밖이라는 선언만 있고 외부 상태를 참조하는 계약이 없어 공유 기준 안에서 상태의 의미와 반영 여부를 판단할 수 없습니다.
  - action: 필요한 조치는 DefaultStatus를 내부 risk-state concept으로 완전 편입하는 것보다 먼저 ExternalRiskStatusReference를 추가해 외부 소유 상태의 의미 연결을 닫는 것입니다. 이 경계 계약에는 owning system, borrower/exposure reference key, status, status_as_of, imported_at, authority owner, freshness rule이 포함되어야 하며, 이를 통해 외부 상태의 소유권과 기준시점, 반영 신선도를 등급·익스포저·한도 위반 보고와 함께 해석할 수 있게 해야 합니다.
- issue-009 (medium): `Collateral.is_a: Exposure` 선언은 담보 자산을 익스포저 타입 계층에 넣어 담보와 신용 익스포저의 의미를 혼동시키는 material issue다. 다만 심의 결과 issue-009는 별도 material root가 아니라 issue-008과 같은 root의 semantic/evolution facet으로 좁혀졌으며, 동일 제거 조치에 종속된다.
  - root cause: 담보와 익스포저 간 관계를 상속 관계와 담보 관계로 동시에 표현해 담보 자산과 신용 익스포저의 존재론적 유형을 혼동했다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 개념 권위 문서인데, Collateral이 Exposure 하위 유형으로 해석되면 담보 자산이 Exposure 속성, 집계, 등급, 상품 분류의 대상으로 취급될 수 있다. 그러면 엔진 입력 검증과 보고 집계가 서로 다른 의미의 객체를 같은 분류축에 올리게 되어 공유 권위 문서로서의 신뢰가 약해진다.
  - action: 필요한 조치는 `Collateral.is_a: Exposure`를 제거하고 담보와 익스포저를 `secured_by` 관계로만 연결하는 것이다. 담보 평가 단위가 필요하면 Collateral은 독립 엔티티로 유지하고 `collateral_ref`나 coverage 관계처럼 명시적 관계로 표현해야 한다. issue-009는 issue-008과 같은 root의 facet으로 좁혀졌으므로 별도 수정 경로를 만들기보다 issue-008의 제거 action과 함께 target에서 닫혀야 한다.
- issue-010 (medium): `Exposure.ltv`는 현재 모델에서 원천 금액과 담보 평가액으로부터 계산되는 비율처럼 보이지만, 산식과 기준시점 없이 독립 입력값으로 병존하므로 현재 LTV인지 심사 당시 LTV인지 권위가 불명확하다. 이 문제는 다음 단계 전에 닫아야 하는 material issue이다.
  - root cause: LTV라는 파생 비율 개념을 산식, 기준시점, 원천 입력 연결 없이 독립 입력 속성으로 모델링했다.
  - materiality: 검토 목적은 리스크 엔진과 보고서 시스템이 공유할 심사·담보·익스포저 지표의 일관성을 확보하는 것이다. `Exposure.amount`, `Collateral.appraised_value`, `Collateral.appraised_at`, `secured_by` 관계가 존재하는 상태에서 `ltv`가 별도 수동 입력값이면, 담보 재평가나 익스포저 금액 변경 후 같은 `ltv` 필드를 현재 비율로 볼지 과거 심사값으로 볼지 소비자마다 달라질 수 있다. 그 결과 담보 리스크 분류와 보고 수치의 의미가 어긋난다.
  - action: `ltv`를 원천 권위값이 아닌 파생 지표로 명시하고, 산식, 기준시점, 사용 담보 범위, 반올림 및 통화 처리 기준, 갱신 의미를 모델에 둬야 한다. 수동 심사 입력이 별도로 필요하다면 `underwritten_ltv` 또는 `ltv_at_approval`처럼 기준시점과 용도가 드러나는 별도 개념으로 분리해야 한다.
- issue-011 (medium): `RiskAppetite`는 `ExposureAggregate` 초과 여부로 compliance status를 정의하지만, 관계 그래프에는 두 개념을 잇는 평가 관계가 없어 준수 판단 경로가 닫히지 않는다.
  - root cause: 규칙을 가진 `RiskAppetite` 엔티티가 `ExposureAggregate`에 의해 정의되지만 relations 섹션에 그 계산·평가 경로를 닫는 edge가 없다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템의 공유 개념 권위로 쓰이기 때문에, appetite 준수 판단 경로가 명시되지 않으면 각 소비자가 서로 다른 aggregate-to-threshold join이나 scope 가정을 구현할 수 있다. 그 결과 동일한 borrower exposure aggregate에서 같은 `RiskAppetite` compliance를 일관되게 계산하거나 보고한다는 목적이 약해진다.
  - action: `ExposureAggregate`와 `RiskAppetite` 사이에 `evaluated_against` 또는 `applies_to` 같은 명시적 관계를 추가해야 한다. appetite가 전역 기준이 아니라면 segment, borrower group, currency, product 같은 scope key도 함께 정의해, 엔진과 보고 시스템이 같은 평가 단위와 threshold를 사용하도록 다음 단계 전에 관계 완전성을 닫아야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-002: semantics 렌즈는 범위를 rating-scale meaning과 mapping authority로 좁히고 severity를 낮추려 했지만, axiology, evolution, coverage, logic, structure는 확장 분류값의 code-set authority와 lifecycle까지 같은 high severity 범위로 유지했다. 최종 resolution은 semantics의 축소 의견을 남기되 broader lifecycle scope를 issue-002에 포함한다.

## Deliberation Decision
- issue-001: narrowed
- issue-002: resolved
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-007: resolved
- issue-009: narrowed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 문서로서의 목적.
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준, 등급 해석 권위, 분류체계의 확장성. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 분류체계 및 개념 기준. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 기준 및 등급 해석 권위 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 분류체계의 확장성과 외부 표준 변경 수용 Source finding context: 리스크 엔진과 보고서 시스템이 공유하는 등급 분류 기준
- issue-004: 리스크 엔진과 보고 시스템이 공유할 개념 기준 및 과거 시점 보고/산출 재현 가능성.
- issue-005: 리스크 엔진 산출 등급과 보고 시스템 사용 등급의 공유 권위 및 통제 가능성.
- issue-006: 리스크 엔진과 보고 시스템이 공유하는 등급 변환, 한도 소진율, 통화 환산, 익스포저 집계 기준의 일관성. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 등급 변환, 한도 소진율, 통화 환산 기준의 일관성 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 한도 소진율 및 익스포저 집계 기준
- issue-008: The ontology is intended as the shared concept authority for risk engines and reporting systems.
- issue-003: 여신 리스크 관리 및 리스크 엔진/보고 시스템 간 한도 소진율과 RiskAppetite 위반 판단 기준 공유. Source finding context: 여신 리스크 관리 및 리스크 엔진/보고 시스템 간 준수 판단 기준 공유. Source finding context: 한도 소진율과 RiskAppetite 위반 판단에 쓰이는 공유 총익스포저 기준
- issue-007: 여신 리스크 분류 온톨로지의 주요 상태 축 포괄성과 리스크 엔진·보고 시스템 간 의미 연결.
- issue-009: 리스크 엔진과 보고서 시스템이 공유하는 여신 리스크 개념 권위 문서.
- issue-010: 리스크 엔진과 보고서 시스템이 공유할 개념 기준, 특히 심사·담보·익스포저 지표의 일관성.
- issue-011: A bounded ontology intended as the shared concept authority for a risk engine and reporting system.

## Final Review Result
11 material issue(s) require attention. Highest-priority issue: issue-001 (high) — `Exposure.risk_grade`가 원천 엔진 등급과 보고서 조정 등급을 하나의 권위값처럼 담고 있어, 두 시스템이 같은 필드명을 서로 다른 리스크 등급 의미로 소비할 수 있다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 경계 밖 연체관리 시스템의 실제 인터페이스는 이 unit boundary 안에 없으므로, 완전 편입이 필요한지 또는 외부 참조만으로 충분한지는 추가 시스템 계약 확인이 필요합니다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now
- issue-003 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up, fix_now
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
