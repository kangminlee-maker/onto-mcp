## /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-manufacturing-bom-YDxgXz/manufacturing-bom-ontology.yaml

# Manufacturing BOM & Routing Ontology (v2.0)
# 부품·조립품·공정·라우팅의 개념 모델. PLM/MES 통합의 개념 기준 문서.

ontology: manufacturing-bom
version: "2.0"

entities:

  Part:
    definition: "구매 또는 제조되는 최소 관리 단위 품목."
    attributes:
      part_no: { type: string }
      name: { type: string }
      uom: { type: enum, values: [ea, kg, m] }
      rev: { type: string, note: "도면 리비전. 도면 관리대장이 원본." }
      current_eco: { type: ref, target: ECO, note: "최신 설계변경. ECO 시스템이 원본." }

  Assembly:
    definition: "하위 Part들로 구성되는 조립품. Assembly도 Part의 일종이다."
    is_a: Part
    attributes:
      bom_lines: { type: list, of: ref, target: BomLine }

  BomLine:
    definition: "BOM 한 줄: 상위 품목이 하위 품목을 얼마나 쓰는지."
    attributes:
      parent_ref: { type: ref, target: Assembly }
      child_ref: { type: ref, target: Part }
      qty_per: { type: number }
      scrap_rate: { type: number, note: "공정 불량 감안 계수. 생산계획팀 엑셀로 별도 관리되는 값을 복사해 둔다." }

  AlternatePart:
    definition: "대체 가능 부품 관계. A의 대체가 B이면 B의 대체도 A다."
    attributes:
      primary_ref: { type: ref, target: Part }
      alternate_ref: { type: ref, target: Part }
      direction:
        type: enum
        values: [one_way, bidirectional]
        note: "대체 방향. 기본은 one_way."

  Operation:
    definition: "라우팅의 한 공정 단계(예: 절삭, 도장, 검사)."
    attributes:
      op_code: { type: string }
      name: { type: string }
      work_center: { type: ref, target: WorkCenter }
      std_time_min: { type: number, note: "표준 작업시간(분)" }

  Routing:
    definition: "품목 제조의 공정 순서."
    attributes:
      routing_id: { type: string }
      part_ref: { type: ref, target: Part }
      operations: { type: ordered_list, of: ref, target: Operation }
      status: { type: enum, values: [draft, released] }

  WorkCenter:
    definition: "공정이 수행되는 작업장/설비 그룹."
    attributes:
      wc_code: { type: string }
      capacity_per_shift: { type: number, note: "교대당 처리 능력. 단위는 작업장마다 다르다(개수 또는 시간)." }

  ECO:
    definition: "설계 변경 지시(Engineering Change Order)."
    attributes:
      eco_no: { type: string }
      affected_parts: { type: list, of: ref, target: Part }
      effective_date: { type: date }
      status: { type: enum, values: [open, approved, applied] }

  InspectionPlan:
    definition: "검사 계획. 검사도 하나의 Operation으로 라우팅에 포함되므로, 본 엔티티는 Operation의 검사 파라미터 확장이다."
    is_a: Operation
    attributes:
      sampling_rule: { type: string }
      acceptance_criteria: { type: string, note: "합격 기준 서술. 품질팀 SOP 문서가 원본." }

relations:
  - { from: Assembly, to: BomLine, kind: has_many }
  - { from: BomLine, to: Part, kind: references_child }
  - { from: Part, to: Routing, kind: manufactured_by }
  - { from: Routing, to: Operation, kind: has_ordered }
  - { from: Operation, to: WorkCenter, kind: performed_at }
  - { from: ECO, to: Part, kind: changes }
  - { from: Part, to: Part, kind: alternate_of, note: "AlternatePart를 통해 표현되는 관계의 단축 표기" }

integrity_rules:
  - "BOM은 비순환이어야 한다. 단, 재생 원료 회수 공정(스크랩 재투입)은 Assembly가 자기 하위에 자신을 포함하는 형태로 모델링한다."
  - "Routing.status가 released인 품목만 생산 오더를 생성할 수 있다."
  - "ECO.effective_date 이후 생산분은 신규 rev를 따른다. 단 Part.rev 갱신은 도면 관리대장 반영 후 주간 배치로 동기화한다."

notes:
  - "원가 계산용 누적 std_time은 MES가 Routing에서 계산하지만, 표준원가 시스템에도 수기 입력 필드가 있어 분기마다 대사한다."
  - "uom 변환(kg↔ea 등)은 품목별 환산계수 마스터가 없고, 필요 시 현장에서 환산한다."
