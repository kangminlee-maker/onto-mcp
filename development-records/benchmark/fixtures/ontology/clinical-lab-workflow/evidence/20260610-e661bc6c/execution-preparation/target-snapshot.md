## /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-clinical-lab-workflow-BE7eSN/clinical-lab-ontology.yaml

# Clinical Laboratory Workflow Ontology (v0.3 draft)
# 병원 임상검사 파이프라인의 개념 모델. 주문(Order)부터 보고(Report)까지의
# 엔티티·관계·상태를 정의한다. EMR/LIS 연동 설계의 개념 권위 문서로 사용 예정.

ontology: clinical-lab-workflow
version: "0.3"

entities:

  Order:
    definition: "임상의가 환자에 대해 발행하는 검사 주문."
    attributes:
      order_id: { type: string }
      patient_ref: { type: ref, target: Patient }
      ordered_tests: { type: list, of: ref, target: Test }
      priority: { type: enum, values: [routine, urgent, stat] }
      is_stat: { type: boolean, note: "STAT 주문 여부. priority와 함께 기록." }
    lifecycle: [draft, placed, in_progress, completed, cancelled]

  StatOrder:
    definition: "응급(STAT) 검사 주문. Order의 하위 타입."
    is_a: Order
    attributes:
      stat_reason: { type: string }

  Patient:
    definition: "검사 대상 환자."
    attributes:
      patient_id: { type: string }
      mrn: { type: string, note: "병원 등록번호" }

  Specimen:
    definition: "환자에게서 채취한 검체. 하나의 Order에 묶인다."
    attributes:
      specimen_id: { type: string }
      collected_at: { type: datetime }
      specimen_type: { type: enum, values: [blood, urine, tissue, swab] }
      container_barcode: { type: string }
    lifecycle: [collected, received, in_analysis, analyzed]

  Test:
    definition: "단일 검사 항목(예: CBC, BMP). 주문 가능한 카탈로그 단위."
    attributes:
      test_code: { type: string }
      name: { type: string }
      department: { type: ref, target: Department }
      requires_specimen_type: { type: enum, values: [blood, urine, tissue, swab] }

  Assay:
    definition: "분석기에서 수행되는 검사 항목. 검사 카탈로그의 수행 단위."
    attributes:
      assay_code: { type: string }
      display_name: { type: string }
      department: { type: ref, target: Department }
      specimen_kind: { type: string, note: "검체 종류 문자열 (예: 'WB', 'Serum', 'Urine-random')" }

  Result:
    definition: "하나의 Test 수행 결과 값."
    attributes:
      result_id: { type: string }
      test_ref: { type: ref, target: Test }
      value: { type: string }
      unit: { type: string }
      status:
        type: enum
        values: [preliminary, final, corrected]
        note: "결과 상태. LIS가 기록하며, Report.result_status에도 동일 정보가 유지된다."
      verified_by: { type: ref, target: Staff }

  Report:
    definition: "환자/주문 단위로 결과를 묶어 임상의에게 전달하는 보고서."
    attributes:
      report_id: { type: string }
      order_ref: { type: ref, target: Order }
      result_status:
        type: enum
        values: [prelim, finalized, amended]
        note: "보고서에 표시되는 결과 상태의 권위 값. 임상의는 이 값을 신뢰한다."
      released_at: { type: datetime }

  Department:
    definition: "검사 수행 부서(혈액학, 화학, 미생물 등)."
    attributes:
      dept_code: { type: string }
      name: { type: string }
      head: { type: ref, target: Staff }

  Staff:
    definition: "검사실 인력."
    attributes:
      staff_id: { type: string }
      role: { type: enum, values: [technologist, pathologist, phlebotomist] }
      department: { type: ref, target: Department }

  CriticalValue:
    definition: "즉시 통보가 필요한 위험 결과 값 범위."
    attributes:
      test_ref: { type: ref, target: Test }
      lower_bound: { type: number }
      upper_bound: { type: number }
      notified: { type: boolean, note: "통보 완료 여부. 통보 시각과 수신자는 전화 기록 대장에 있다." }

relations:
  - { from: Order, to: Specimen, kind: has_many, note: "주문은 여러 검체를 가질 수 있다" }
  - { from: Specimen, to: Order, kind: belongs_to }
  - { from: Test, to: Result, kind: has_many }
  - { from: Result, to: Report, kind: aggregated_into }
  - { from: Report, to: Order, kind: belongs_to }
  - { from: Department, to: Staff, kind: has_many }
  - { from: Staff, to: Department, kind: belongs_to }
  - { from: Order, to: Report, kind: produces }
  - { from: Report, to: Result, kind: contains }
  - { from: Result, to: Specimen, kind: derived_from }
  - { from: Specimen, to: Result, kind: produces, note: "검체가 결과를 생산한다" }

state_rules:
  - "Order는 모든 Result가 final일 때 completed로 전이한다."
  - "Report는 released_at 기록 시점에 finalized 상태가 된다. 단, Result.status가 corrected로 바뀌면 Report.result_status는 amended가 되어야 한다(동기화 배치는 야간 1회)."
  - "Specimen이 analyzed가 된 뒤의 보관/폐기 처리는 각 부서 내규를 따른다."

notes:
  - "Test와 Assay는 카탈로그 정비 후 통합 여부를 재검토한다. 현재 신규 항목은 두 곳 모두에 등록한다."
  - "turnaround_time(TAT)은 collected_at부터 released_at까지로 계산하며, 대시보드 팀이 자체 계산식을 유지한다."
