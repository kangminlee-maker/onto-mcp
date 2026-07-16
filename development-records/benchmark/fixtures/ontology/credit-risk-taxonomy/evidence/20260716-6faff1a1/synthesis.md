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
- issue-001 (high): 등급 척도·변환·조정의 canonical 권위가 없어 동일 위험상태에 소비 시스템별 상충 등급이 허용되는 중대한 현재 결함이며, 대상 범위에서 반드시 해소해야 한다.
  - root cause: 역사적으로 병존하는 등급 척도를 canonical 평가 개념으로 통합하지 않고 변환·조정 권위를 소비 시스템에 남긴 설계가 등급 불일치를 만든다.
  - materiality: 리스크 엔진과 보고 시스템이 서로 다른 매핑 버전이나 수동 판단을 적용하면 동일 차주·시점의 등급이 달라질 수 있다. 이는 공유 개념 권위와 분류 기준을 제공한다는 선언된 목적을 직접 약화하고, 결과의 비교·감사·재현 신뢰를 손상한다.
  - action: 먼저 하나의 canonical 신용등급 평가와 그 권위 소스를 정의해야 한다. 이어 세 척도 사이의 버전된 총함수 매핑에 적용 우선순위와 유효기간을 포함해 모든 소비자가 같은 변환을 재현하도록 해야 한다. 수동 조정은 원등급을 덮어쓰지 않는 별도 override로 모델링하고 원등급·사유·주체·시각·만료 및 provenance를 보존해야 한다.
- issue-002 (high): 월말 집계와 시스템별 당일 환율을 혼합하면 동일한 기준시점의 한도 소진율과 RiskAppetite 준수 상태를 일관되고 재현 가능하게 판단할 수 없다.
  - root cause: 파생 판단 전체에 적용되는 canonical valuation 시점·신선도·환율 권위를 정의하지 않아 월말 집계와 현재 시점 판단이 혼합된다.
  - materiality: 월말 이후 신규 여신이 집계에 반영되지 않으면 실제 임계치 초과가 compliant로 표시될 수 있고, 시스템별 환율 스냅숏이 다르면 같은 as-of 표기에서도 결과가 달라진다. 이는 리스크 엔진과 보고 시스템이 공유해야 할 시간적으로 일관된 기준을 훼손해 운영 의사결정과 보고 신뢰를 직접 약화한다.
  - action: 모든 계산 입력에 공통 valuation 시점과 데이터 완전성·신선도 상태를 먼저 지정하고, canonical 환율 출처·스냅숏 시각·통화를 같은 계약에 포함해야 한다. RiskAppetite 판정은 동일 시점의 aggregate와 threshold만 결합해야 하며, 일중 데이터가 미반영된 경우 compliant로 단정하지 말고 stale 또는 unknown으로 표시해야 한다.
- issue-004 (high): 변경 가능한 등급·한도·익스포저·LTV·리스크 성향에 공통 유효기간과 버전 계약이 없어 과거 기준일의 리스크 상태와 파생 결과를 신뢰성 있게 재구성할 수 없다.
  - root cause: 온톨로지에 변경 가능한 리스크 값 전반을 포괄하는 공통 temporal/versioning 개념이 정의되지 않았다.
  - materiality: 값이 변경된 뒤 리스크 엔진과 보고 시스템이 각자 현재값이나 서로 다른 보존 방식을 사용하면 동일한 과거 기준일에도 분류와 보고 결과가 달라질 수 있다. 이는 두 시스템이 공유하는 개념 권위와 과거 결과의 재현·대사·감사 가능성을 직접 훼손하므로 중대한 문제다.
  - action: 공통 유효기간·버전 모델을 먼저 정의하고, 등급·한도·익스포저·LTV·리스크 성향 값에 기준시점, 기록시점, 변경 원인 및 버전을 연결해야 한다. 이어 파생 결과가 사용한 원천 버전을 기록하도록 연결해 동일 기준일의 상태 선택, 재현 및 대사가 가능하게 해야 한다.
- issue-006 (high): 승인 한도와 가용 잔액이 하나의 한도처럼 혼합되고 어느 값이 정본인지 정해지지 않아 소진율 분모가 단일하게 결정되지 않는다. 이 문제는 현재 대상에서 반드시 바로 수정해야 한다.
  - root cause: Limit을 권위, 측정 종류와 시점이 명확한 governed measure로 모델링하지 않아 승인 ceiling과 가용 잔액이 병행 관리되면서 하나의 분모로 합쳐진다.
  - materiality: 공유 온톨로지의 목적은 리스크 엔진과 보고 시스템에 동일한 한도·소진율 의미를 제공하는 것이다. 그러나 승인 시스템 값과 CRM 가용 잔액이 다를 때 소비자마다 서로 다른 수량과 우선순위를 선택할 수 있어, 동일 차주와 기준일에도 소진율 및 분류 결과가 달라진다. 따라서 공유 기준이 결과를 수렴시키지 못해 정확성과 보고 일관성을 훼손한다.
  - action: 먼저 승인 한도와 가용 한도를 별도의 시점 측정 개념으로 분리해야 한다. 다음으로 각 측정값의 authoritative source, 기준시점, 충돌 우선순위를 지정하고, 가용 한도는 승인 ceiling과 사용액·예약액에서 파생되는 값으로 정의해야 한다. 이후 소진율 분모에는 governed approved ceiling만 사용하도록 규칙을 고정하되, 다른 공식이 필요하면 별도 공식으로 명시해야 한다. 소비 시스템에는 이 정본 규칙에서 생성된 파생 뷰만 제공해야 새 원천이나 규칙 변경에도 분모 의미가 조용히 바뀌지 않는다.
- issue-009 (high): 등급 정책 변경 시 버전·유효기간·조정 이력이 없으면 소비 시스템마다 서로 다른 등급을 산출하고 과거 결과를 재현할 수 있으므로, 다음 단계 전에 canonical 등급 권위와 provenance 계약을 마련해야 한다.
  - root cause: 등급 변환과 조정 정책이 온톨로지 안의 버전 관리되는 권위 개념이 아니라 소비자별 외부 로직으로 남아 있다.
  - materiality: 리스크 엔진과 보고 시스템이 같은 등급 의미와 규칙을 공유해야 장기적 연속성이 유지된다. 현재 구조에서는 등급 스케일·매핑 변경이나 수동 조정이 발생할 때 결과가 소비자별로 분기되고 당시 보고 등급의 근거를 재현하거나 감사할 수 없어 선언된 공유 개념 권위가 약화된다.
  - action: 먼저 등급 체계와 변환표를 식별자·버전·유효기간을 가진 canonical 자산으로 정의해야 한다. 그다음 산출 등급에 원등급, 적용 규칙 버전, 조정 전후 값, 조정 사유·주체·시점을 기록하도록 계약하고 리스크 엔진과 보고 시스템이 이를 사용하게 해야 한다. 이 순서가 규칙 권위를 먼저 확립한 뒤 결과 이력을 그 권위에 연결해 변경 이후에도 재현성과 감사 가능성을 보장한다.
- issue-010 (high): 등급·한도·리스크 성향과 익스포저 집계에 공통 시간·버전 계약이 없어, 정책·모델·계산 규칙 변경 전후의 적용 상태를 구분하고 과거 리스크 결과를 동일한 의미로 재현할 수 없다.
  - root cause: 변경 가능한 리스크 개념에 유효기간, 관측 시점과 산출 버전이 공통 계약으로 모델링되지 않았다.
  - materiality: 등급 모델, 승인 한도, 리스크 성향 또는 집계 규칙이 변경된 뒤에는 과거 기준일에 실제 적용된 상태와 현재 상태를 판별해야 한다. 이를 식별할 계약이 없으면 리스크 엔진과 보고 시스템이 서로 다른 시점이나 버전을 사용할 수 있고, 과거 보고 및 재산출 결과의 일관성과 재현성이 훼손된다.
  - action: 먼저 시간에 따라 변하는 개념에 공통 유효기간 또는 관측 시점 계약을 도입해야 한다. 이어 RiskRating에는 model_version, 정책 개념에는 policy_version, 집계에는 calculation_version과 input_snapshot_id를 연결해 당시 적용된 상태·규칙·입력을 함께 식별할 수 있게 해야 한다. 이 연결이 완료되어야 과거 기준일 조회와 재산출이 동일한 의미로 재현될 수 있다.
- issue-013 (high): Collateral은 Exposure의 하위 유형이 아니라 Exposure를 담보하는 별도 자산이므로, 현재의 subtype 선언은 타입 정체성을 왜곡하는 중대한 결함이다.
  - root cause: 온톨로지가 담보 자산과 익스포저의 연관 관계를 subtype 상속으로 잘못 중복 모델링했다.
  - materiality: 공통 개념 권위를 사용하는 리스크 엔진이나 보고 시스템이 subtype을 포함해 Exposure를 조회하면 Collateral까지 신용 포지션으로 분류·집계할 수 있다. 이는 익스포저 계산과 보고의 정확성 및 신뢰성을 직접 훼손한다.
  - action: 먼저 `Collateral.is_a: Exposure`를 제거해 잘못된 타입 상속을 차단하고, Collateral을 독립 엔터티로 유지한 채 Exposure와는 `secured_by` 관계로만 연결해야 한다. 이어 다중 담보·다중 익스포저 상황에서도 소비자 해석이 일관되도록 관계의 cardinality와 담보가치 배분 의미를 명시해야 한다.
- issue-014 (high): 신용등급을 서로 다른 척도의 독립 scalar 필드로 표현하고 매핑·권위·시점·provenance를 통제하지 않아, 리스크 엔진과 보고 시스템이 동일한 등급을 일관되고 권위 있게 해석할 수 없다.
  - root cause: 신용등급이 governed, time-indexed assessment가 아니라 서로 무관한 scalar 필드들로 모델링되었다.
  - materiality: 공유 등급 분류와 권위가 핵심 목적인데도 소비자가 등급 변환, 엔진·보고 등급 대사 또는 특정 시점의 적용 등급 조회를 자체 매핑과 override에 의존해야 한다. 그 결과 동일 차주나 익스포저에 상충하는 분류가 생겨도 어느 값·척도·시점이 권위 있는지 판별할 수 없으므로 목적을 중대하게 훼손한다.
  - action: 대상, 척도, 등급, source authority, effective/as-of time, 파생 및 override provenance를 명시하는 canonical RatingAssessment를 정의해야 한다. 이어 권위 artifact에 척도 간 매핑과 그 버전·유효기간을 두고, 엔진 산출 등급과 보고 조정 등급을 구분해 연결해야 한다. 먼저 assessment를 권위 단위로 확립한 뒤 변환과 override가 이를 참조하도록 해야 시점별 해석과 시스템 간 대사가 일관된다.
- issue-015 (high): ExposureAggregate.total_amount는 통화와 환산 기준이 없는 Exposure.amount의 무조건 합으로 정의되어 있어, 총익스포저와 한도 소진율을 단일하고 재현 가능한 측정값으로 제공하지 못한다.
  - root cause: 금액 모델이 통화, 환율 권위·버전과 valuation 시점을 포함하는 governed monetary-measurement context를 누락했다.
  - materiality: 복수 통화 익스포저가 있거나 엔진과 보고서가 서로 다른 환율표·기준일을 사용하면 같은 total_amount와 소진율 명칭 아래 실질적으로 다른 값이 생성된다. 이는 총익스포저와 한도 소진율의 공유 정의라는 목적을 약화시키고 운영 판단의 비교 가능성과 신뢰성을 훼손한다.
  - action: 먼저 Exposure 금액의 통화와 aggregate의 보고 통화, 환율 출처·버전, valuation 시점, 포함 익스포저 모집단을 하나의 governed measurement context로 정의하고 aggregate와 함께 보존해야 한다. 그다음 total_amount 집계와 한도 소진율 계산이 반드시 동일한 컨텍스트를 참조하도록 연결해야 한다. 이 공통 측정 맥락은 관련 집계·판정 문제에도 공유 원인 후보이므로, 소비자별 계산을 수정하기 전에 권위 있는 모델 계약에서 먼저 확정해야 한다.
- issue-017 (high): RiskAppetite와 적용 대상 ExposureAggregate 사이의 canonical 관계가 누락되어, 공유 관계 그래프만으로 준수 평가의 비교 대상을 선택할 수 없다. 이 관계는 특정 aggregate snapshot·적용 정책·평가시점을 결속하는 일급 ComplianceAssessment가 소비하고, 준수 결과도 해당 assessment에 귀속되도록 보완해야 한다.
  - root cause: canonical relation graph가 RiskAppetite 정의에 필요한 ExposureAggregate 비교 의존성을 누락했다.
  - materiality: 리스크 엔진과 보고 시스템이 동일한 개념 권위를 사용하려면 어떤 ExposureAggregate가 어떤 RiskAppetite의 적용을 받는지 일관되게 탐색할 수 있어야 한다. 현재는 그 경로가 없어 준수 판단이 누락되거나 소비자별 비공식 조인에 의존할 수 있으므로, RiskAppetite 준수를 포함한 공유 개념 권위라는 목적이 훼손된다.
  - action: 먼저 특정 aggregate snapshot, 적용 RiskAppetite 정책, 평가시점과 적용 범위를 결속하는 일급 ComplianceAssessment 계약을 정의해야 한다. 이어 적용 범위 키를 가진 RiskAppetite–ExposureAggregate canonical 관계를 추가하고, 그 관계를 ComplianceAssessment가 소비하도록 연결하며, compliance_status를 해당 assessment의 비교 결과로 귀속해야 한다. 이 순서가 관계의 탐색 가능성과 평가 의미·권위를 함께 복구한다.
- issue-005 (medium): Adjustment와 DerivedMeasurement를 provenance 없는 독립 결과 속성으로 저장해 수동 변경의 정당성과 LTV 재계산의 일관성을 검증할 수 없는 중대한 설계 문제이며, 다음 단계 전에 해소해야 한다.
  - root cause: 수동 또는 파생 값을 provenance와 원천 입력을 가진 일급 assessment/event로 모델링하지 않고 독립 결과 속성으로 저장한 것이 감사 공백과 LTV 불일치를 함께 만든다.
  - materiality: 수동 등급·한도·LTV가 엔진 산출이나 원천 측정값과 달라질 때 승인된 예외와 오류를 구분할 증거가 없다. 또한 잔액, 담보 평가액 또는 배분이 바뀌면 동일 익스포저에 서로 다른 LTV가 존재할 수 있어, 인수·리스크·보고 시스템이 공유해야 할 통제 가능한 분류 기준과 일관된 담보 리스크 측정이 약화된다.
  - action: 다음 단계 전에 공통 provenance 구조 아래 Adjustment와 DerivedMeasurement를 별도 하위 개념으로 도입해야 한다. Adjustment에는 대상 값, 행위자, 승인자, 발생 시각, 사유·근거 참조와 전후 값을 연결하고, DerivedMeasurement에는 분자·분모 등 원천 입력, 담보 집합·배분, 평가시점, 공식 버전과 재계산·검증 규칙을 연결해야 한다. 수동 LTV를 유지한다면 파생값과 구별되는 asserted assessment로 표시하고 provenance 및 파생값 대비 검증 결과를 보존해야 한다.
- issue-008 (medium): Limit과 RiskAppetite에 유효기간, lifecycle 상태, 상태 전이 및 supersedes 계약이 없어 활성 정책과 종료·정정 이력을 일관되게 판별할 수 있다. 위반은 정책 상태가 아니라 별도 평가 사건으로 모델링해야 한다.
  - root cause: 상태 보유 정책 개념에 대한 lifecycle 및 상태 전이 사건 모델이 없어 활성 기준 선택과 종결 후 정정을 표현할 수 없다.
  - materiality: 만료·대체·정지된 기준과 활성 기준을 구분하지 못하면 엔진과 보고 시스템이 서로 다른 정책을 선택하고 위반의 해소·정정을 다르게 해석한다. 이는 동일한 운영 상태를 공유한다는 계약을 약화시키며, 종결 후 사건도 일관되게 수용할 수 없게 한다.
  - action: 다음 운영 단계 전에 Limit과 RiskAppetite에 effective·expired 시점, 명시적 lifecycle 상태, 상태 전이 사건 및 supersedes 관계를 정의해야 한다. 먼저 정책 lifecycle과 기준 대비 평가를 분리하고, 위반·해소·정정은 별도 평가 사건으로 모델링해야 정책 상태의 의미를 보존하면서 이력을 일관되게 추적할 수 있다.
- issue-011 (medium): 차주 세그먼트, 상품, 담보, 등급을 폐쇄형 enum으로 관리하는 현재 구조는 분류 변경 때 온톨로지와 소비자의 동시 수정을 요구하므로, 신규·변경 코드를 안전하게 확장하기 어렵다.
  - root cause: 변화하는 코드 목록이 독립적으로 버전 관리되는 분류 개념이 아니라 속성 내부의 폐쇄형 enum으로 표현되어 있다.
  - materiality: 신규 코드를 도입하거나 기존 코드를 개명·분할·폐기하면 배포 시차 동안 구버전 소비자가 값을 거부하거나 의미를 다르게 처리할 수 있다. 이는 기존 엔진과 보고 시스템에 새 리스크 분류를 안전하게 확장하고 과거 데이터의 의미를 보존하려는 목적을 약화한다.
  - action: 각 분류 코드 목록을 stable id, label, status, valid_from/valid_to 및 supersedes 관계를 가진 독립 분류 개념으로 먼저 승격해야 한다. 이어 소비자 계약에 미지원 코드의 보존·거부·fallback 동작을 명시해, 분류와 소비자를 반드시 동시에 배포하지 않아도 의미가 보존되는 확장 경로를 마련해야 한다.
- issue-012 (medium): ExposureAggregate.total_amount는 기준시점·컷오프 없이 모든 Exposure.amount의 완전합으로 정의되면서 배치 사이에는 신규 여신 미반영을 허용하므로, 일중 신규 Exposure가 존재하는 동안 두 규칙을 동시에 만족할 수 없다.
  - root cause: ExposureAggregate의 완전합 정의에 기준시점·컷오프 한정이 없지만 저장 규칙은 배치 사이의 불완전성을 허용한다.
  - materiality: 월말 배치 후 신규 Exposure가 생성되고 다음 배치가 실행되기 전에는 동일한 aggregate를 완전한 총액과 일부 익스포저가 제외된 값으로 모두 해석할 수 있다. 이에 따라 리스크 엔진과 보고 시스템이 서로 다른 한도 소진율 및 RiskAppetite 판단을 정당화할 수 있어, 공유 차주 단위 총익스포저 개념의 권위와 정확성이 약화된다.
  - action: 먼저 total_amount의 권위 있는 시간 의미를 하나로 결정해야 한다. 배치 기반 값이라면 ExposureAggregate를 명시적인 as_of와 컷오프, 포함 모집단을 가진 스냅숏으로 재정의하고 배치 기준시각과 포함 규칙을 함께 명시해야 한다. 실시간 총액을 의도한다면 신규·정정·취소를 포함한 모든 Exposure 변경 사건에서 total_amount가 갱신되도록 계약을 변경해야 한다. 이 선택과 계약 정합화가 선행되어야 소비 시스템이 동일한 총익스포저를 일관되게 판단할 수 있다.
- issue-016 (medium): RiskAppetite가 정책 한도와 시점 의존 준수 결과를 함께 보유해 준수 결과의 범위·시점·근거가 불명확하므로, 다음 단계 전에 정책과 평가를 분리해야 한다.
  - root cause: 온톨로지가 정책 제약과 그 정책에 대한 시점 의존 평가를 하나의 RiskAppetite 엔터티로 합쳤다.
  - materiality: threshold 변경, 복수 차주·포트폴리오 범위, 서로 다른 ExposureAggregate 스냅숏이 존재할 때 단일 compliance_status는 어느 정책·범위·시점의 판단인지 나타내지 못한다. 그 결과 오래되거나 범위가 불명확한 상태가 권위 있는 결과로 오인되어 appetite 한도와 위반 보고의 일관성이 약화된다.
  - action: 시간 한정 RiskAppetiteLimit 정책과 ComplianceAssessment 결과를 분리해야 한다. 먼저 한도에 적용 범위, 측정 지표, 단위·통화, 유효 기간과 권한 주체를 명시하고, 이어 각 ComplianceAssessment를 적용된 한도와 정확한 ExposureAggregate 스냅숏 및 평가 시점에 연결해야 한다. 참여 렌즈들은 이 분리와 연결 필요성에 합의했으며, 일관된 위반 판단과 과거 평가 보존을 위해 다음 단계 전에 조치해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-017: narrowed
- issue-005: resolved
- issue-008: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-016: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 분류 기준 제공
- issue-002: 리스크 엔진과 보고 시스템이 공유하는 시간적으로 일관된 리스크·준수 기준
- issue-004: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서 및 과거 시점 보고 재현
- issue-006: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 한도·소진율 의미 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 문서 Source finding context: A shared semantic basis for limit and utilization reporting.
- issue-009: 리스크 엔진과 보고 시스템이 공유하는 개념 권위 및 등급 결과의 장기적 연속성
- issue-010: 리스크 엔진과 보고 시스템 사이의 시점 일치 및 과거 리스크 결과 재현
- issue-013: 리스크 엔진과 보고 시스템을 위한 공통 개념 권위 Source finding context: A common conceptual authority for the risk engine and reporting system.
- issue-014: 리스크 엔진과 보고 시스템 사이의 공유 등급 분류 및 권위 Source finding context: Shared rating classification and authority between the risk engine and reporting system.
- issue-015: 총익스포저와 한도 소진율의 공유 정의 Source finding context: A shared definition of total exposure and limit utilization.
- issue-017: RiskAppetite 준수를 포함하여 리스크 엔진과 보고 시스템의 공유 개념 권위 제공 Source finding context: Serving as the shared concept authority for the risk engine and reporting system, including RiskAppetite compliance.
- issue-005: 엔진과 보고 시스템이 공유하는 통제 가능한 분류 기준 및 일관된 담보 리스크 측정 Source finding context: Consistent collateral-risk classification shared by underwriting, risk, and reporting consumers.
- issue-008: 한도·리스크 성향을 엔진과 보고 시스템이 동일한 운영 상태로 해석하는 계약
- issue-011: 새 리스크 분류를 기존 엔진과 보고 시스템에 안전하게 확장하는 능력
- issue-012: 리스크 엔진과 보고 시스템이 공유하는 차주 단위 총익스포저 개념 권위
- issue-016: RiskAppetite 한도와 위반 보고의 일관된 해석 Source finding context: Consistent interpretation of appetite limits and breach reporting.

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 등급 척도·변환·조정의 canonical 권위가 없어 동일 위험상태에 소비 시스템별 상충 등급이 허용되는 중대한 현재 결함이며, 대상 범위에서 반드시 해소해야 한다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- CRM 가용 잔액의 정확한 외부 계약은 이 경계에서 확인되지 않았지만, 온톨로지 자체에 동등성 또는 조정 규칙이 없다는 결론에는 영향이 없다.
- 의미 렌즈는 단독 근거로 high 심각도를 입증하는 범위만 한정했으며, 측정 종류 분리와 권위·우선순위 지정에는 합의했다.
- 실제 소비 시스템이 별도 이력을 보존하는지는 이 검토 경계 밖이며, 그러한 이력은 현재 선언된 공유 온톨로지 계약에 포함되어 있지 않다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-004 (high): fix_now
- issue-006 (high): fix_now
- issue-009 (high): fix_before_release, follow_up
- issue-010 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_now
- issue-017 (high): fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, follow_up
- issue-011 (medium): follow_up
- issue-012 (medium): fix_now
- issue-016 (medium): fix_before_release, fix_now

## Recommendations
- issue-007 (high): 여신 리스크 분류의 핵심 결과인 연체·부실 상태가 공유 개념 범위에서 완전히 제외되어 있다. Source finding context: credit-risk-ontology.yaml — delinquency/default risk subdomain Source finding context: materialized-input.md:6-8, 97-99 Source finding context: 업무 소유 시스템이 별도인 것과 공유 의미 모델에서 개념을 제외하는 것은 다르다. 엔진과 보고 시스템이 부실 여부를 분류·집계·설명하려면 최소한 동일한 상태 의미와 외부 권위를 참조해야 한다. Source finding context: Delinquency/DefaultStatus의 최소 공유 계약을 추가하되 연체관리 시스템을 권위 원본으로 지정한다. 상태 코드, effective_at, source_ref, 해소·정정 상태를 포함하고 상세 운영 속성만 외부 범위로 둔다. Source finding context: .onto/review/20260716-6faff1a1/round1/coverage.findings.yaml#coverage-candidate-004 Source finding context: 여신 리스크 엔진과 보고 시스템 사이의 공통 리스크 분류 기준 Source finding context: 부실·연체 익스포저를 엔진에서 판정하거나 보고서에서 분류·집계해야 할 때 Source finding context: 핵심 신용사건의 공통 의미와 참조 계약이 없어 두 시스템이 외부 상태를 서로 다르게 해석하거나 아예 연결하지 못할 수 있다. Source finding context: 외부 시스템 소유 개념을 공유 계약으로 포함하는 경계 모델이 없다. Source finding context: 연체/default 상태는 별도 시스템에서 다룬다는 이유로 온톨로지 범위 밖으로 선언되어 있다. Source finding context: 동시에 이 온톨로지는 여신 리스크 관리의 공유 권위 문서를 지향한다. Source finding context: 소유권 분리와 의미 계약 제외를 동일시한 경계 설정 때문에 핵심 하위 영역의 참조 개념까지 누락되었다.
- issue-003 (medium): default의 외부 소유를 이유로 공유 의미 계약까지 제외하여 여신 리스크 분류 경계가 끊긴다. Source finding context: credit-risk-ontology.yaml의 default 범위 경계 Source finding context: 가치 권위: review-value-alignment-criteria.yaml:6-15(user-request-intent: 여신 리스크 분류의 공유 개념 기준과 운영 위험). 대상 증거: materialized-input.md:6-8,97-99(공유 권위 문서 지향, default는 별도 시스템이 다룬다는 이유로 범위 제외). Source finding context: default를 외부 시스템 소유라는 이유만으로 공유 온톨로지에서도 완전히 제외한 경계는 목적상 필요한 상호운용 계약을 정당화 없이 포기한다. Source finding context: 리스크 엔진이나 보고 시스템이 default 상태를 사용해야 하는 경우 각자 외부 시스템 의미를 해석해야 한다. 데이터 소유 경계와 공유 의미 경계를 동일시한 트레이드오프 때문에 전체 신용위험 분류의 공통 기준이 중요한 상태에서 끊길 수 있다. Source finding context: default 데이터의 소유권은 연체관리 시스템에 유지하되, 이 온톨로지에는 최소 공유 계약으로 canonical DefaultStatus, 대상 차주/익스포저 관계, effective_at, source authority를 정의한다. 완전 제외를 유지한다면 두 소비자가 default를 전혀 필요로 하지 않는다는 범위 근거와 연계 계약을 명시한다. Source finding context: .onto/review/20260716-6faff1a1/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 경계 Source finding context: 어느 한 소비자가 default 상태를 위험 산출, 분류 또는 보고에 사용하는 경우 Source finding context: 핵심 상태의 의미와 연결 규칙이 소비자별로 재정의되어 공유 기준의 범위 완결성과 상호운용 신뢰가 약화된다. Source finding context: 외부 시스템의 데이터 소유 경계를 공유 온톨로지의 의미 경계와 동일시한 범위 결정 Source finding context: default 상태에 대한 canonical 개념이나 연결 계약이 대상에서 전부 제외되어 있다. Source finding context: 이 공백은 default를 별도 시스템이 다룬다는 소유권 사실을 범위 제외 근거로 사용한 결정의 증상이다.
- issue-018 (medium): 세 등급 척도 사이의 필수 연결이 ontology graph나 canonical mapping 자산에 표현되지 않는다. Source finding context: credit-risk-ontology.yaml: rating concepts and classification_rules Source finding context: entities.Borrower.attributes.internal_rating; entities.RiskRating.attributes.grade; entities.Exposure.attributes.risk_grade; classification_rules[0]; notes[0]; relations Source finding context: The required connections among the three rating scales are not represented in the ontology graph or a canonical mapping artifact. Source finding context: The entities are connected only through borrower-level associations; those edges do not encode grade derivation or value correspondence. Consequently, the risk engine and reporting system cannot derive the declared rating transformation from the shared ontology and must supply separate, potentially divergent connections. Source finding context: Define one canonical rating-scale concept and explicit, versioned mapping relations from source grades to consumer projections within the ontology or a directly governed companion artifact; link Exposure.risk_grade to that mapping rather than delegating conversion to each consumer. Source finding context: .onto/review/20260716-6faff1a1/round1/structure.findings.yaml#structure-candidate-002 Source finding context: Providing a shared concept standard for risk-engine ratings and reporting grades. Source finding context: A consumer implements the declared derivation of Exposure.risk_grade or reconciles it with Borrower.internal_rating. Source finding context: The structural contract does not provide the required mapping path, so independently implemented transformations can produce incompatible classifications. Source finding context: Rating transformations are described in free text and assigned to external or consumer-specific mappings instead of being connected in the canonical ontology structure. Source finding context: No relation or mapping structure connects RiskRating.grade to Exposure.risk_grade or Borrower.internal_rating. Source finding context: The missing structural connection reflects the artifact's delegation of mappings to an external wiki and individual consuming systems.

## Unique Finding Tagging
- issue-007 (high): 여신 리스크 분류의 핵심 결과인 연체·부실 상태가 공유 개념 범위에서 완전히 제외되어 있다. Source finding context: credit-risk-ontology.yaml — delinquency/default risk subdomain Source finding context: materialized-input.md:6-8, 97-99 Source finding context: 업무 소유 시스템이 별도인 것과 공유 의미 모델에서 개념을 제외하는 것은 다르다. 엔진과 보고 시스템이 부실 여부를 분류·집계·설명하려면 최소한 동일한 상태 의미와 외부 권위를 참조해야 한다. Source finding context: Delinquency/DefaultStatus의 최소 공유 계약을 추가하되 연체관리 시스템을 권위 원본으로 지정한다. 상태 코드, effective_at, source_ref, 해소·정정 상태를 포함하고 상세 운영 속성만 외부 범위로 둔다. Source finding context: .onto/review/20260716-6faff1a1/round1/coverage.findings.yaml#coverage-candidate-004 Source finding context: 여신 리스크 엔진과 보고 시스템 사이의 공통 리스크 분류 기준 Source finding context: 부실·연체 익스포저를 엔진에서 판정하거나 보고서에서 분류·집계해야 할 때 Source finding context: 핵심 신용사건의 공통 의미와 참조 계약이 없어 두 시스템이 외부 상태를 서로 다르게 해석하거나 아예 연결하지 못할 수 있다. Source finding context: 외부 시스템 소유 개념을 공유 계약으로 포함하는 경계 모델이 없다. Source finding context: 연체/default 상태는 별도 시스템에서 다룬다는 이유로 온톨로지 범위 밖으로 선언되어 있다. Source finding context: 동시에 이 온톨로지는 여신 리스크 관리의 공유 권위 문서를 지향한다. Source finding context: 소유권 분리와 의미 계약 제외를 동일시한 경계 설정 때문에 핵심 하위 영역의 참조 개념까지 누락되었다.
- issue-003 (medium): default의 외부 소유를 이유로 공유 의미 계약까지 제외하여 여신 리스크 분류 경계가 끊긴다. Source finding context: credit-risk-ontology.yaml의 default 범위 경계 Source finding context: 가치 권위: review-value-alignment-criteria.yaml:6-15(user-request-intent: 여신 리스크 분류의 공유 개념 기준과 운영 위험). 대상 증거: materialized-input.md:6-8,97-99(공유 권위 문서 지향, default는 별도 시스템이 다룬다는 이유로 범위 제외). Source finding context: default를 외부 시스템 소유라는 이유만으로 공유 온톨로지에서도 완전히 제외한 경계는 목적상 필요한 상호운용 계약을 정당화 없이 포기한다. Source finding context: 리스크 엔진이나 보고 시스템이 default 상태를 사용해야 하는 경우 각자 외부 시스템 의미를 해석해야 한다. 데이터 소유 경계와 공유 의미 경계를 동일시한 트레이드오프 때문에 전체 신용위험 분류의 공통 기준이 중요한 상태에서 끊길 수 있다. Source finding context: default 데이터의 소유권은 연체관리 시스템에 유지하되, 이 온톨로지에는 최소 공유 계약으로 canonical DefaultStatus, 대상 차주/익스포저 관계, effective_at, source authority를 정의한다. 완전 제외를 유지한다면 두 소비자가 default를 전혀 필요로 하지 않는다는 범위 근거와 연계 계약을 명시한다. Source finding context: .onto/review/20260716-6faff1a1/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: 리스크 엔진과 보고 시스템이 공유하는 여신 리스크 분류 경계 Source finding context: 어느 한 소비자가 default 상태를 위험 산출, 분류 또는 보고에 사용하는 경우 Source finding context: 핵심 상태의 의미와 연결 규칙이 소비자별로 재정의되어 공유 기준의 범위 완결성과 상호운용 신뢰가 약화된다. Source finding context: 외부 시스템의 데이터 소유 경계를 공유 온톨로지의 의미 경계와 동일시한 범위 결정 Source finding context: default 상태에 대한 canonical 개념이나 연결 계약이 대상에서 전부 제외되어 있다. Source finding context: 이 공백은 default를 별도 시스템이 다룬다는 소유권 사실을 범위 제외 근거로 사용한 결정의 증상이다.
- issue-018 (medium): 세 등급 척도 사이의 필수 연결이 ontology graph나 canonical mapping 자산에 표현되지 않는다. Source finding context: credit-risk-ontology.yaml: rating concepts and classification_rules Source finding context: entities.Borrower.attributes.internal_rating; entities.RiskRating.attributes.grade; entities.Exposure.attributes.risk_grade; classification_rules[0]; notes[0]; relations Source finding context: The required connections among the three rating scales are not represented in the ontology graph or a canonical mapping artifact. Source finding context: The entities are connected only through borrower-level associations; those edges do not encode grade derivation or value correspondence. Consequently, the risk engine and reporting system cannot derive the declared rating transformation from the shared ontology and must supply separate, potentially divergent connections. Source finding context: Define one canonical rating-scale concept and explicit, versioned mapping relations from source grades to consumer projections within the ontology or a directly governed companion artifact; link Exposure.risk_grade to that mapping rather than delegating conversion to each consumer. Source finding context: .onto/review/20260716-6faff1a1/round1/structure.findings.yaml#structure-candidate-002 Source finding context: Providing a shared concept standard for risk-engine ratings and reporting grades. Source finding context: A consumer implements the declared derivation of Exposure.risk_grade or reconciles it with Borrower.internal_rating. Source finding context: The structural contract does not provide the required mapping path, so independently implemented transformations can produce incompatible classifications. Source finding context: Rating transformations are described in free text and assigned to external or consumer-specific mappings instead of being connected in the canonical ontology structure. Source finding context: No relation or mapping structure connects RiskRating.grade to Exposure.risk_grade or Borrower.internal_rating. Source finding context: The missing structural connection reflects the artifact's delegation of mappings to an external wiki and individual consuming systems.

## Shared Phenomenon Summary
- none
