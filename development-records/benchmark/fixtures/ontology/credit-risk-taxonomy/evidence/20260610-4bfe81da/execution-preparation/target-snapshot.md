## /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-credit-risk-taxonomy-39bHi9/credit-risk-ontology.yaml

# Credit Risk Classification Ontology (v1.1)
# 여신(대출) 리스크 관리의 개념 모델. 익스포저, 등급, 한도, 담보를 정의하며
# 리스크 엔진과 보고서 시스템이 공유하는 개념 권위 문서를 지향한다.

ontology: credit-risk-taxonomy
version: "1.1"

entities:

  Borrower:
    definition: "여신을 받는 차주(개인 또는 법인)."
    attributes:
      borrower_id: { type: string }
      segment: { type: enum, values: [retail, sme, corporate] }
      internal_rating:
        type: string
        note: "내부 신용등급. 1~10 숫자 등급 체계."

  Exposure:
    definition: "차주에 대한 신용 익스포저(대출, 한도성 여신 포함)."
    attributes:
      exposure_id: { type: string }
      borrower_ref: { type: ref, target: Borrower }
      amount: { type: number, note: "익스포저 금액" }
      product_type: { type: enum, values: [term_loan, revolving, guarantee] }
      risk_grade:
        type: enum
        values: [AAA, AA, A, BBB, BB, B, CCC]
        note: "익스포저 단위 리스크 등급. 보고서 팀이 사용."
      ltv:
        type: number
        note: "담보인정비율. 심사 시점에 심사역이 입력한다."

  Collateral:
    definition: "익스포저를 담보하는 자산. 담보 평가의 기본 단위."
    is_a: Exposure
    attributes:
      collateral_id: { type: string }
      collateral_type: { type: enum, values: [real_estate, deposit, securities] }
      appraised_value: { type: number }
      appraised_at: { type: datetime }

  RiskRating:
    definition: "리스크 엔진이 산출하는 차주 신용등급."
    attributes:
      rating_id: { type: string }
      borrower_ref: { type: ref, target: Borrower }
      grade:
        type: enum
        values: [R1, R2, R3, R4, R5]
        note: "엔진 등급. Borrower.internal_rating과 매핑 테이블은 리스크팀 위키 참조."
      score: { type: number }

  Limit:
    definition: "차주/상품별 여신 한도."
    attributes:
      limit_id: { type: string }
      borrower_ref: { type: ref, target: Borrower }
      approved_amount:
        type: number
        note: "승인 한도. 승인 시스템이 기록한다. 영업점 CRM의 available_limit과 합산 관리."
      currency: { type: string }

  ExposureAggregate:
    definition: "차주 단위 총익스포저. 모든 Exposure.amount의 합."
    attributes:
      borrower_ref: { type: ref, target: Borrower }
      total_amount:
        type: number
        note: "월말 배치로 계산해 저장. 일중 신규 여신은 다음 배치까지 미반영."
      as_of: { type: date }

  RiskAppetite:
    definition: "리스크 성향 한도. ExposureAggregate가 RiskAppetite를 초과하면 RiskAppetite 위반이며, 위반 여부는 RiskAppetite 준수 상태로 정의된다."
    attributes:
      appetite_id: { type: string }
      threshold: { type: number }
      compliance_status: { type: enum, values: [compliant, breached] }

relations:
  - { from: Borrower, to: Exposure, kind: has_many }
  - { from: Exposure, to: Collateral, kind: secured_by }
  - { from: Borrower, to: RiskRating, kind: rated_by }
  - { from: Borrower, to: Limit, kind: limited_by }
  - { from: ExposureAggregate, to: Borrower, kind: summarizes }

classification_rules:
  - "Exposure.risk_grade는 RiskRating.grade에서 도출하되, 보고서 팀이 시장 상황에 따라 수동 조정할 수 있다."
  - "Limit 소진율 = ExposureAggregate.total_amount / Limit.approved_amount. 통화가 다른 경우 환산은 각 시스템의 당일 환율 테이블을 사용한다."
  - "Collateral.appraised_value가 1년 이상 경과하면 재평가 대상이다."

notes:
  - "차주 등급(internal_rating 1~10, RiskRating R1~R5, Exposure risk_grade AAA~CCC)의 3개 스케일은 역사적 이유로 병존한다. 변환은 각 소비 시스템이 수행한다."
  - "연체/부실(default) 상태는 별도 시스템(연체관리)에서 다루므로 이 온톨로지의 범위 밖이다."
