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
- issue-001 (high): 공유 위험값의 운영 권위와 변경·대사 계약이 온톨로지에 없고 소비 시스템에 위임되어 있어, 리스크 엔진과 보고 시스템이 동일 익스포저에 서로 다른 등급·환산액·한도 사용률을 산출할 수 있다. 이 이슈는 등급 의미 자체가 아니라 등급·FX·한도에 공통되는 상위 거버넌스 결손으로 한정된다.
  - root cause: 등급 및 기타 공유 위험값의 권위·우선순위·버전 규칙을 온톨로지가 소유하지 않고 외부 문서와 개별 소비 시스템에 위임한 것이 시스템별 결과 분기의 원인이다.
  - materiality: 온톨로지의 선언된 목적은 리스크 엔진과 보고 시스템이 변경 전후에도 동일하게 사용하는 공유 개념 권위를 제공하는 것이다. 그러나 소비자가 매핑, 환율표, 한도 스냅샷과 조정을 독립적으로 선택하면 동일 입력에 복수의 정당한 결과가 생기고, 보고 수치와 한도 판단의 일관성뿐 아니라 과거 결과의 재현·대사·설명 가능성도 약화된다.
  - action: 온톨로지에 공유 위험값별 canonical source와 precedence를 지정하고, version 및 effective period를 가진 governed mapping 계약과 reconciliation 규칙을 추가해야 한다. 등급에는 버전된 스케일·매핑 참조를, FX와 분산 한도 입력에는 source-system 식별자와 유효시점·스냅샷 규칙을 부여해야 한다. 수동 조정은 원본 값과 분리된 override로 모델링하고 승인 주체, 사유, 시각과 적용 범위를 필수화해야 한다. 먼저 공통 권위·변경 계약을 확립한 뒤 등급 의미와 구체적 매핑 모델은 issue-010과 경계를 맞춰 구현해야 한다.
  - unresolved disagreement: structure 렌즈는 등급의 구조적 권위 결손에는 동의하지만, FX와 분산 한도 입력까지 동일한 구조적 원인으로 묶을 직접 근거는 상대적으로 약하다고 보아 범위에 대한 이견이 남아 있다.
- issue-002 (high): RiskAppetite 정책과 시점·범위별 준수 평가가 하나의 엔티티에 결합되고 평가 입력 관계도 누락되어, 권위 있고 시간적으로 일관된 준수 상태를 재현할 수 없다.
  - root cause: RiskAppetite 정책과 시점·범위 의존적인 준수 평가를 하나의 엔티티로 모델링하고 평가 입력 관계를 생략한 것이 오래된 상태와 시스템별 판정 충돌의 원인이다.
  - materiality: 월말 집계 이후 실제 익스포저가 임계치를 초과해도 기존 compliance_status가 compliant로 남을 수 있으며, 소비 시스템이 서로 다른 집계 시점이나 범위를 사용하면 동일 정책에 상충하는 상태를 부여할 수 있다. 이는 리스크 엔진과 보고 시스템이 공유해야 할 위험성향 한도와 위반 상태의 권위를 훼손하므로 material high 이슈다.
  - action: 먼저 RiskAppetite를 적용 범위와 버전이 명시된 정책·임계치로 유지하고 compliance_status를 정책에서 분리해야 한다. 이어 별도 ComplianceAssessment가 특정 ExposureAggregate 스냅샷과 해당 임계치 버전을 명시적으로 참조하도록 관계를 추가하고, 평가 시점·통화·집계 기준시점과 최대 허용 지연을 기록해야 한다. 허용 지연을 넘으면 compliant 대신 stale 또는 unknown을 반환하거나 준수 판단용 집계 갱신 주기를 보장해야 한다. 모든 참여 렌즈가 이 원인과 조치에 합의했다.
- issue-003 (high): 연체·부도 lifecycle과 외부 권위 시스템을 잇는 최소 공유 의미 경계가 없어, 익스포저가 연체·부도·정상화·상각으로 전환되는 핵심 신용악화 구간에서 리스크 엔진과 보고 시스템의 공통 분류 계약이 단절된다.
  - root cause: 연체·부도 영역을 운영 범위에서 제외하면서도 외부 권위 시스템과 연결되는 최소 공유 의미 경계를 정의하지 않았다.
  - materiality: 이 온톨로지는 리스크 엔진과 보고 시스템을 위한 공유 신용위험 개념 권위를 표방한다. 그러나 연체·부도 구간을 표현할 경계가 없으므로 두 소비자는 별도 매핑과 lifecycle 의미를 만들어야 하며, 전체 신용위험 lifecycle을 일관되게 분류하고 재현한다는 목적을 현재 충족하지 못한다.
  - action: 대상 온톨로지에 유효기간과 lifecycle state를 갖는 최소 CreditQualityStatus 또는 DefaultEvent 경계를 추가하고, 먼저 해당 상태의 권위 있는 외부 시스템을 명시적으로 참조하도록 연결해야 한다. 운영 처리는 계속 외부에 둘 수 있지만, 엔진과 보고 시스템이 같은 상태 식별자와 전이 의미를 공유할 수 있도록 경계 계약은 대상 온톨로지에서 닫아야 한다.
- issue-004 (high): 변경 가능한 위험 사실 전반에 공통 시간·이력 계약이 없어 과거 시점의 신용위험 상태를 결정적으로 재구성할 수 없으며, 이는 즉시 해소해야 하는 중대한 일관성 문제다.
  - root cause: 변경 가능한 위험 사실의 시간 유효성과 변경 이력을 일부 필드에만 국소적으로 모델링하고 공통 계약으로 적용하지 않았다.
  - materiality: 등급, 한도, 금액, LTV, 임계치 또는 준수 상태가 변경된 뒤 보고·재계산·감사·정정을 수행하면 당시 적용된 값을 선택할 근거가 없다. 따라서 계산과 보고 소비자가 서로 다른 역사적 결과를 만들 수 있어, 동일한 과거 신용위험 상태를 재현하고 대사하려는 목적이 직접 훼손된다.
  - action: 먼저 변경 가능한 위험 사실에 적용할 공통 계약을 정의해야 한다. 이 계약에는 valid_from/valid_to, recorded_at, version, 정정·대체 관계와 보고시점 선택 규칙이 포함되어야 한다. 이후 등급, 한도, 금액, LTV, 임계치 및 준수 상태를 이 계약에 맞춰 유효기간이 있는 기록이나 사건으로 표현하고, 계산·보고 소비자가 같은 선택 규칙을 사용하도록 연결해야 한다. 공통 계약을 선행해야 관련 개념의 중복된 이력 모델을 피하고 과거 결과를 일관되게 재현할 수 있다.
- issue-006 (high): issue-006은 독립 원인이 아니라, issue-004의 공통 시간·이력 계약 부재가 RiskRating, RiskAppetite, 모델·정책 버전 및 수동 조정에 나타난 고심각도 하위 문제다. 이 범위가 닫히지 않으면 변경 전후 리스크 결과의 의미를 복원하거나 재현할 수 없다.
  - root cause: 변경 가능한 리스크 판단과 정책을 버전 있는 시간적 사실이 아니라 무시점 현재 속성으로 모델링했다.
  - materiality: 평가모델, 정책 한도 또는 수동 조정 규칙이 변경된 뒤 과거와 현재 데이터를 함께 조회·재계산할 때 당시 적용된 기준을 식별할 수 없다. 따라서 엔진과 보고 시스템이 동일한 역사적 판단을 재현하지 못하고, 보고·대사·재처리 결과의 신뢰가 훼손되어 선언된 공통 개념 기준의 목적을 중대하게 약화한다.
  - action: issue-004의 공통 시간·이력 계약을 먼저 canonical 기준으로 확정한 뒤, 그 계약을 RiskRating, RiskAppetite 및 등급 조정에 필수 적용해야 한다. 각 사실에 observed/as_of, effective_from/to, model_or_policy_version, source, supersedes를 두고, 수동 조정에는 original_grade, adjusted_grade, reason, adjusted_at를 기록해야 한다. 상위 계약과 이 전문 적용 범위를 함께 검증해야 과거 시점의 규칙 선택과 결과 재현이 가능하다.
- issue-010 (high): 세 신용등급 스케일이 서로 호환되지 않는데도 동일한 ‘신용등급’ 의미를 공유하고, 변환·수동 조정의 권위와 계보가 소비자별로 달라 동일 대상의 등급을 일관되게 해석하거나 비교할 수 없다. 이 문제는 상위 운영 거버넌스 결손을 issue-001과 공유하지만, 등급 의미와 매핑 계약을 소유하는 별도 시정 범위로 유지해야 한다.
  - root cause: 공존하는 신용등급 스케일에 canonical 의미 역할, precedence 및 mapping authority를 부여하지 않았다.
  - materiality: 온톨로지는 위험 엔진과 보고 시스템 사이의 신용 분류에 대한 공유 의미 권위여야 한다. 그러나 각 소비자가 등급을 독립적으로 변환하거나 덮어쓸 수 있어 비비교적인 결과도 모두 온톨로지 준수로 보일 수 있으며, 핵심 신용 분류의 일관성과 보고 신뢰가 훼손된다.
  - action: 등급 관측, 등급 스케일, reported/adjusted grade를 별도 canonical 개념으로 정의하고, 스케일 간 변환을 위한 버전된 권위 매핑을 공유 계약에 포함해야 한다. 각 등급에는 source, effective time, derivation 및 override provenance와 적용 우선순위를 기록해야 한다. 상위 운영 권위와 변경 계약은 issue-001과 정렬하되, issue-010에서 구체적인 등급 의미·매핑과 계보를 별도로 시정하고 검증해야 한다.
- issue-005 (medium): 수동 등급 조정, LTV 입력·수정, 한도 승인처럼 통제된 값을 설정하는 행위를 감사하려면, 현재 결과 속성과 별도로 재사용 가능한 결정·조정 이벤트와 provenance를 모델링해야 한다.
  - root cause: 통제된 값의 결과만 현재 속성으로 저장하고 그 값을 설정한 행위와 provenance를 별도 개념으로 모델링하지 않았다.
  - materiality: 이 누락으로 소비자는 통제 결과만 받고 누가 언제 어떤 근거와 승인으로 값을 설정했는지 확인할 수 없다. 따라서 엔진 산출값과 수동 조정값을 구별하거나 결정을 설명·감사·복원할 수 없어, 위험 계산과 보고를 위한 감사 가능한 공유 권위라는 목적이 약화된다. 영향은 통제된 수동 행위가 발생하는 경로에 한정되므로 upstream의 medium 판단을 유지한다.
  - action: 다음 운영 단계 전에, 영향받은 사실과 연결되는 재사용 가능한 DecisionOrAdjustment 이벤트를 추가해야 한다. 이벤트에는 actor, occurred_at, 사유·증거, 변경 전후 값, 승인 상태, source-system record identifier를 포함해 수동 조정·입력·승인에 공통으로 적용해야 한다. 이를 먼저 닫아야 이후 계산과 보고가 결과값뿐 아니라 그 권위와 변경 이력까지 추적할 수 있다.
- issue-007 (medium): 고객군·상품·담보 분류를 닫힌 열거형으로 고정한 현재 구조는 코드의 추가·개명·폐기와 생산자·소비자의 비동시 배포를 안전하게 지원하지 못하므로, 다음 단계 전에 생애주기를 갖는 버전 코드 목록으로 전환해야 한다.
  - root cause: 분류 코드를 stable identity와 lifecycle을 가진 버전 코드 목록이 아니라 엔티티 속성의 닫힌 열거형으로 고정했다.
  - materiality: 새 segment, product_type 또는 collateral_type이 도입될 때 기존 열거형과 소비자 검증 로직을 함께 바꿔야 한다. 배포 시점이 어긋나면 구버전 소비자가 새 값을 거부하거나 임의 치환하여 분류를 잃을 수 있고, 개명·폐기된 코드의 역사적 의미도 보존되지 않는다. 이는 기존 엔진과 보고 시스템의 연속성을 유지하면서 새 상품과 분류를 수용하려는 확장성 목적을 직접 약화한다.
  - action: 분류 코드 목록을 별도 개념으로 분리하고 각 코드에 stable_id, version, effective_from/to, status 및 superseded_by를 부여해야 한다. 또한 소비자 계약에 알 수 없는 미래 코드를 보존할지 거부할지와 호환 가능한 확장 규칙을 명시해야 한다. 모든 참여 렌즈가 이 조치와 중간 심각도에 합의했으며, 안전한 확장과 점진 배포의 선행조건이므로 다음 단계 전에 완료해야 한다.
- issue-008 (medium): ExposureAggregate는 현재의 모든 Exposure.amount를 합산한 값과 배치 시점에 반영된 스냅샷을 동시에 뜻할 수 없습니다. 따라서 명시적 as_of 스냅샷으로 의미를 한정하거나, 현재 완전합을 유지하려면 실시간 갱신을 계약으로 요구해야 합니다.
  - root cause: ExposureAggregate를 현재의 완전합으로 정의하면서 실제 배치 스냅샷의 시점과 포함 경계를 그 정의에 반영하지 않았다.
  - materiality: 월말 배치 후 신규 여신이 발생하고 다음 배치가 실행되기 전에는 두 규칙을 따르는 소비자가 동일 차주의 총익스포저와 한도 사용률을 서로 다르게 산출할 수 있습니다. 이는 리스크 엔진과 보고 시스템이 공유해야 할 총익스포저 기준의 정확성과 일관성을 약화합니다.
  - action: 대상 계약에서 두 의미 중 하나를 확정해야 합니다. 기본 조치는 ExposureAggregate를 명시적 as_of 스냅샷으로 한정하고 기준시각, 포함 경계, 배치 반영 규칙을 함께 정의하는 것입니다. 현재의 완전합이 필수라면 선행 조건으로 total_amount의 실시간 갱신을 요구해야 합니다. 이 선택을 먼저 확정해야 리스크 엔진과 보고 시스템이 동일한 계산 규칙을 구현할 수 있습니다.
- issue-009 (medium): Collateral은 Exposure를 담보하는 독립 자산이므로 Exposure의 subtype으로 분류해서는 안 된다. 현재의 이중 모델링은 정체성 상속과 객체 간 관계를 충돌시키는 현재적 정확성 결함이다.
  - root cause: 서로 다른 Collateral과 Exposure의 연관관계를 subtype identity로도 중복 표현했다.
  - materiality: 공유 온톨로지의 소비자가 `is_a`를 subtype 상속으로 해석하면 Collateral을 Exposure로 검증·질의하거나 Exposure 모집단에 집계할 수 있다. 이는 위험 엔진과 보고 시스템이 exposure와 collateral에 대해 일관된 개념 권위를 공유하려는 목적을 약화시키고, 소비자마다 서로 다른 분류 결과를 허용한다.
  - action: `Collateral.is_a: Exposure` 선언을 제거하고 Collateral을 독립 엔티티로 유지해야 한다. Exposure와 Collateral의 연결은 기존 `Exposure secured_by Collateral` 관계만이 권위를 갖도록 해야 한다. 모든 참여 렌즈가 이 최소 수정과 즉시 종결 필요성에 동의했으며 별도의 선행 의존성은 제시되지 않았다.
- issue-011 (medium): Exposure.ltv는 관측값인지 파생값인지와 권위 기준이 정해지지 않아, 구조적으로 유효하지만 서로 다른 LTV 값이 공존할 수 있는 현재 차단 이슈다.
  - root cause: LTV 비율을 authoritative formula나 관측 provenance 없이 독립적인 수동 입력 속성으로 표현했다.
  - materiality: 위험 엔진이 exposure·collateral 값으로 LTV를 재계산하고 보고 시스템이 수동 입력 ltv를 사용하면 두 값이 의미상 달라질 수 있다. 이는 위험 측정값을 하나의 의미로 공유하려는 목적을 훼손하고 위험 판단과 보고의 불일치를 초래한다.
  - action: 권위 있는 LTV 공식과 피연산자 선택 규칙을 먼저 정의하고, 여러 담보의 집계 방식과 평가시점을 함께 명시해야 한다. 그 결과 ltv를 해당 규칙에서 도출되는 파생값으로 만들거나, 실제 업무상 입력·승인값이라면 observed/approved LTV로 명확히 이름 붙이고 출처와 유효시점 provenance를 부여해야 한다. 그래야 엔진과 보고 시스템이 동일한 권위와 의미를 사용한다.
- issue-012 (medium): Exposure.risk_grade 도출 규칙을 지탱할 RiskRating–Exposure 간 정규 매핑·도출·계보 관계가 누락되어 있다. 이 문제는 독립 원인이 아니라 issue-010의 canonical 등급 의미 및 versioned mapping authority 결손이 구조에 드러난 증상이며, 해당 상위 조치의 필수 완료 조건으로 닫아야 한다.
  - root cause: 등급 변환을 외부 위키와 개별 소비 시스템에 위임하면서 RiskRating과 Exposure 사이의 정규 도출 관계를 온톨로지에 선언하지 않았다.
  - materiality: 보고 시스템이 RiskRating.grade에서 Exposure.risk_grade를 산출하거나 계보를 검증할 때, 구조적 연결과 매핑 버전이 없으면 소비 시스템마다 변환이 달라질 수 있고 동일 차주·익스포저의 보고 등급 출처와 조정 이력을 추적할 수 없다. 따라서 R1–R5와 AAA–CCC를 공유 개념 기준으로 일관되게 연결한다는 목적을 약화한다.
  - action: 먼저 issue-010 범위에서 canonical 등급 의미, 정규 매핑 규칙, 버전과 우선순위의 권위를 확립해야 한다. 이어 그 계약을 RiskRating에서 Exposure로 이어지는 명시적 도출 관계로 투영하고, 적용된 매핑 버전과 원본 등급을 기록하며 수동 조정 결과도 원본 및 도출 결과에 연결해야 한다. 릴리스 전 실제 구조에서 이 관계와 계보를 독립적으로 검증해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: structure 렌즈는 등급의 구조적 권위 결손에는 동의하지만, FX와 분산 한도 입력까지 동일한 구조적 원인으로 묶을 직접 근거는 상대적으로 약하다고 보아 범위에 대한 이견이 남아 있다.

## Deliberation Decision
- issue-001: narrowed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-006: narrowed
- issue-010: narrowed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: narrowed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 변경 전후에도 동일하게 사용하는 공유 개념 권위 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 단일 개념 권위 제공 Source finding context: Serving as the shared concept authority for the risk engine and reporting system. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 외부·내부 등급 변경 후의 분류 연속성
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 시간적으로 일관된 위험성향 한도와 위반 상태 Source finding context: 리스크 엔진과 보고 시스템이 시간적으로 일관된 위험·준수 개념을 공유하는 것 Source finding context: Provide a shared meaning for risk-appetite limits and breach reporting. Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 RiskAppetite 준수 상태의 일관된 판정
- issue-003: 리스크 엔진과 보고 시스템을 위한 전체 신용위험 lifecycle의 공유 개념 권위 Source finding context: Providing a shared credit-risk concept authority for the risk engine and reporting system.
- issue-004: 계산과 보고 소비자가 동일한 과거 신용위험 상태를 재현하는 것 Source finding context: Sharing reproducible credit-risk concepts between calculation and reporting consumers.
- issue-006: 변경되는 리스크 판단을 엔진과 보고 시스템이 동일하게 해석하고 재현하는 공통 기준 Source finding context: 시간에 따라 변하는 리스크 판단을 엔진과 보고 시스템이 동일하게 해석하고 재현하는 공통 개념 기준
- issue-010: 엔진과 보고 시스템의 신용 분류를 위한 공유 의미 권위 Source finding context: Serve as the shared concept authority for risk-engine and reporting-system credit classifications.
- issue-005: 위험 계산과 보고를 위한 감사 가능한 공유 권위 Source finding context: Operating the ontology as a trustworthy shared authority for risk calculations and reports.
- issue-007: 기존 엔진과 보고 시스템의 연속성을 유지하며 새 여신 상품과 분류 범주를 수용하는 확장성 Source finding context: 새 여신 상품과 분류 범주를 기존 엔진·보고 시스템의 연속성을 유지하며 수용하는 확장성
- issue-008: 리스크 엔진과 보고 시스템이 공유하는 총익스포저 개념 기준
- issue-009: 엔진과 보고 시스템이 공유하는 exposure와 collateral의 일관된 개념 권위 Source finding context: Provide a shared conceptual authority for risk-engine and reporting-system exposure and collateral concepts.
- issue-011: 엔진과 보고 시스템이 공유하는 exposure·collateral 위험 측정값의 단일 의미 Source finding context: Give risk-engine and reporting consumers one shared meaning for exposure and collateral risk measures.
- issue-012: 엔진의 R1–R5 등급과 보고 시스템의 AAA–CCC 등급을 일관되게 연결하는 공유 개념 기준 Source finding context: 리스크 엔진의 R1–R5 등급과 보고 시스템의 AAA–CCC 등급을 공유 개념 기준으로 일관되게 연결하는 것

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 공유 위험값의 운영 권위와 변경·대사 계약이 온톨로지에 없고 소비 시스템에 위임되어 있어, 리스크 엔진과 보고 시스템이 동일 익스포저에 서로 다른 등급·환산액·한도 사용률을 산출할 수 있다. 이 이슈는 등급 의미 자체가 아니라 등급·FX·한도에 공통되는 상위 거버넌스 결손으로 한정된다. Unresolved disagreement remains: structure 렌즈는 등급의 구조적 권위 결손에는 동의하지만, FX와 분산 한도 입력까지 동일한 구조적 원인으로 묶을 직접 근거는 상대적으로 약하다고 보아 범위에 대한 이견이 남아 있다.

## Boundary Notes
- 실제 외부 위키, FX 테이블, CRM 스키마 및 소비 시스템의 통제 규칙은 허용된 경계 밖이므로 확인하지 않았다.
- 현재 소비 시스템들이 실제로 동일한 매핑을 사용하는지는 경계 내 증거만으로 판단할 수 없다.
- 허용된 증거만으로 실제 소비 시스템의 별도 freshness 검사 존재 여부는 확인할 수 없다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-003 (high): fix_now
- issue-004 (high): fix_now
- issue-006 (high): fix_now
- issue-010 (high): fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-007 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_now, accept_risk
- issue-009 (medium): fix_now
- issue-011 (medium): fix_now
- issue-012 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
