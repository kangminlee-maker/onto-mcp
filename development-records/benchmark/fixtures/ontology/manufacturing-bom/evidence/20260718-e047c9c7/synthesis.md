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
- issue-001 (high): 단위·물리 차원과 적용 가능한 변환 규칙을 결합한 Quantity·UnitConversion 계약이 없어 BOM 수량과 작업장 능력 계산이 비결정적이므로, 이 결함은 현재 통합 기준에서 반드시 해소해야 한다.
  - root cause: 측정값을 단위·변환 규칙·권위와 결합하지 않고 무단위 숫자와 현장 환산 관행으로 남긴 것이 기준값 드리프트와 수량·능력 계산의 비결정성을 함께 만든다.
  - materiality: qty_per의 단위가 명시되지 않고 작업장별 capacity_per_shift 단위와 품목별 환산 규칙도 표준화되지 않아, PLM과 MES가 동일한 제조 사실에서 서로 다른 자재 소요량과 생산능력을 산출할 수 있다. 이는 부족·과다 불출, 계획 오류, 원가 차이를 일으켜 품목·BOM·라우팅을 동일한 의미로 해석하게 한다는 기준 문서의 목적과 운영 신뢰를 직접 약화한다.
  - action: 우선 Quantity에 value, uom 및 물리 차원을 결합하고, 품목·공정별 UnitConversion에 from_uom, to_uom, factor, 적용 범위와 valid_from/to를 정의해 모든 BOM 수량·작업장 능력 계산이 동일 계약을 사용하게 해야 한다. 적용 가능한 정준 변환이 없는 단위 조합은 명시적으로 거부해야 한다. 이어 권위 시스템, 파생 관계, 동기화 방식과 충돌 우선순위를 별도의 provenance·운영 거버넌스 계약으로 정의해 복사·수기 값이 추적 가능한 파생값으로만 존재하도록 해야 한다.
  - unresolved disagreement: logic·semantics는 Quantity·UnitConversion 의미 계약 부재만을 직접 근본 원인으로 수용했지만, axiology·coverage는 권위·동기화 계약 부재도 같은 근원에 포함해야 한다고 본다. 이를 통합하려면 두 결함이 하나의 인과적 근원임을 보여 주는 직접 사례나 데이터 흐름 증거가 추가로 필요하다.
- issue-002 (high): 도면 표시 리비전과 제조 적용 리비전이 하나의 Part.rev로 혼합되고 ECO.effective_date와 함께 생산 적용의 권위로 사용되어, 배치 동기화 공백 동안 MES가 유효 제조 구성을 일관되게 결정할 수 없는 중대한 변경관리 문제다.
  - root cause: 도면 표시 리비전과 제조 적용 리비전을 분리하지 않고 갱신 시점이 다른 Part.rev와 ECO.effective_date를 함께 권위로 사용한 것이 효력 공백을 만든다.
  - materiality: ECO 효력일 이후에도 Part.rev가 주간 배치 전의 구값을 유지할 수 있으므로 생산 오더가 구 리비전으로 생성·실행되거나 잘못된 자재·공정이 적용될 수 있다. 이는 PLM 변경을 MES에 동일한 의미와 시점으로 전달해야 한다는 목적과 변경 이력의 추적성을 직접 약화한다.
  - action: 먼저 도면 리비전과 제조 적용 리비전을 별도 개념과 식별자로 분리하고, ECO를 승인 상태와 효력 조건을 가진 유효 제조 구성에 직접 연결해야 한다. 이후 오더 생성과 실행이 Part.rev 배치 갱신과 무관하게 같은 유효 구성 권위를 사용하도록 해야 하며, 동기화 불일치가 남는 동안에는 생산을 차단하거나 명시적인 예외 승인을 요구해야 한다.
- issue-004 (high): 시점별 Part/BOM/Routing 구성 기준선과 유효구간, 그리고 ECO에서 변경된 구성으로 이어지는 식별 경로가 없어 적용 제조 구성을 단일하게 판정하거나 과거 상태로 재현할 수 없는 중대한 결함이다.
  - root cause: 온톨로지가 현재 제조 정의 마스터에 편중되어 버전별 구성 기준선, 일반화된 변경 항목, 그 구성을 고정하는 실행 인스턴스를 함께 모델링하지 않았다.
  - materiality: ECO 발효와 Part.rev 배치 반영 사이의 시간차 또는 과거 생산 시점에서 어느 품목 개정·BOM·라우팅 조합이 유효했는지 확정할 수 없다. 그 결과 MES가 서로 다른 시점의 정의를 조합할 수 있고, 변경 적용 여부와 생산 이력의 신뢰성 있는 판정·감사가 약화되어 PLM/MES 간 제조 정의의 일관성을 제공하려는 목적을 직접 훼손한다.
  - action: 우선 Part/BOM/Routing에 식별 가능한 버전별 구성 기준선과 effective_from/effective_to를 도입하고, ECO가 변경 전후 기준선 및 해당 BOM·Routing 구성으로 직접 연결되게 해야 한다. 적용 규칙은 현재 Part.rev가 아니라 해당 시점에 발효된 기준선을 참조해야 한다. 이 정체성·효력 경로를 먼저 권위 있는 기준으로 만든 뒤, 일반 ChangeItem과 ProductionOrder가 같은 기준선을 공유해야 하는지는 직접 구조·실행 계보 증거를 보강해 후속 범위를 확정해야 한다.
  - unresolved disagreement: 심의는 버전별 구성 기준선·효력 의미와 ECO 변경 구성 탐색 경로의 단절만 직접 입증된 원인으로 수용했다. coverage와 axiology는 일반 ChangeItem 및 ProductionOrder까지 하나의 정의→실행 정체성 사슬 결손으로 포함해야 한다고 보지만, semantics와 structure는 이들이 동일 원인에서 발생한다는 직접 증거가 부족하다고 범위를 좁혔다.
- issue-007 (high): 현재 모델은 품목 리비전과 유효성을 현재값으로만 표현하므로, 새 리비전 도입 시 과거 및 전환 시점에 적용된 BOM과 Routing을 결정하거나 재현할 수 없다.
  - root cause: 리비전과 유효성이 독립된 버전 객체와 시간 범위가 아니라 Part의 현재값과 ECO의 단일 시작일로 축약되어 있다.
  - materiality: PLM/MES 통합은 생산 시점별 품목·BOM·Routing·변경관리의 공통 기준을 제공해야 한다. 그러나 구·신 리비전이 공존하거나 과거 생산 이력을 재현할 때 적용 구성을 판별할 수 없어 잘못된 생산 오더가 생성될 수 있고 제조 이력의 감사 가능성도 훼손된다.
  - action: 먼저 PartRevision을 독립 엔티티로 도입하고, 다음으로 BOM과 Routing을 리비전별 객체로 만들어 각 객체에 valid_from/valid_to 또는 동등한 유효구간을 부여해야 한다. 이어 ECO가 이전·신규 리비전과 변경 대상을 명시하도록 연결해야 한다. 이 순서로 리비전 식별 기준을 세운 뒤 구성과 변경 이력을 결합해야 생산 시점별 적용 구성을 일관되게 결정하고 과거 이력을 재현할 수 있다.
- issue-012 (high): 제품 구성과 스크랩 재투입을 같은 BomLine으로 표현하면 필수 비순환 규칙과 제품 구조 의미가 함께 깨진다. 제품 BOM은 비순환 구조로 유지하고, 스크랩 발생·회수·재투입은 별도 material-return 또는 recovery 관계로 분리해야 한다.
  - root cause: 제품 구성과 스크랩 재투입이 구분자 없이 같은 BomLine 관계를 공유해 논리적 비순환 충돌과 제품구조 의미 훼손을 함께 일으킨다.
  - materiality: 규정된 자기참조를 사용한 정상 인스턴스가 필연적으로 비순환 검증에 실패하고, 일반 BOM 전개와 소요 계산에서는 순환·중복 소요·잘못된 구성으로 해석될 수 있다. 따라서 일관된 PLM 제품 구조와 MES 자재 흐름을 제공하고 BOM을 무결성 및 소요 계산 기준으로 사용하려는 목적을 직접 약화한다.
  - action: 먼저 제품 BOM에서 스크랩 재투입 자기참조를 제거해 비순환 계약을 보존해야 한다. 이어 스크랩 발생물, 회수 및 재투입량을 별도 material-return 또는 recovery 관계로 모델링하고 관련 Operation이나 Routing에 연결해야 한다. 그런 다음 무결성 검증과 BOM 전개·소요 계산이 새 관계를 제품 구성에서 제외하도록 소비 경로를 정렬해야 한다.
- issue-013 (high): AlternatePart의 대칭 정의와 one_way 방향 규칙이 충돌하고, 공개 Part→Part alternate_of 경로가 direction을 보존하지 않아 PLM과 MES의 대체 판정이 서로 반대로 나올 수 있는 high 이슈이다.
  - root cause: AlternatePart 연관 엔티티와 Part 간 단축 관계 사이에 하나의 정준 방향성 계약과 방향 보존 투영을 정의하지 않았다.
  - materiality: PLM/MES 통합의 목적은 부품 대체 가능성과 방향을 공통 기준으로 전달하는 것이다. 그러나 소비자가 대칭 정의, direction 값, 또는 alternate_of 중 어느 경로를 따르느냐에 따라 역방향 대체의 허용 여부가 달라질 수 있어 승인되지 않은 부품 투입이나 유효한 대체의 거부로 이어지며 제조 투입 판단의 신뢰성을 훼손한다.
  - action: 먼저 AlternatePart를 대체 방향의 권위 관계로 확정하고 primary_ref, alternate_ref, direction의 의미를 일관되게 규정해야 한다. 그다음 이 연결을 공식 relations 경로에 명시하고 Part→Part alternate_of를 AlternatePart에서 파생되는 방향 보존 투영으로 정의해야 한다. 이 순서로 권위 계약을 먼저 고정해야 단축 관계가 동일한 대체 허용 의미를 안정적으로 전달할 수 있다.
- issue-014 (high): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 검사 계획과 실제 검사 공정을 동일한 실행 단계로 오해하게 만드는 분류 오류다. InspectionPlan과 InspectionOperation을 분리해야 한다.
  - root cause: 검사 행위와 그 행위를 규정하는 정보·규격 계획을 하나의 Operation 하위 유형으로 취급했다.
  - materiality: 이 구조에서는 검사 계획이 작업장·표준시간·공정 코드 같은 실행 속성을 상속하고 라우팅에 직접 배치될 수 있다. 그 결과 계획 버전과 실제 실행 단계가 뒤섞여 검사 지시, 작업장 배정, 합격 기준 적용이 달라질 수 있으므로 PLM 검사 규격과 MES 실행 공정을 일관되게 통합하려는 목적을 훼손한다.
  - action: InspectionOperation을 실제 실행 단계인 Operation의 하위 유형으로 두고, InspectionPlan은 독립된 규격·계획 엔티티로 분리해야 한다. 그런 다음 InspectionOperation이 적용할 InspectionPlan을 참조하도록 연결해야 계획 버전·적용 조건·복수 계획을 실행 공정의 정체성과 분리해 정확히 관리할 수 있다.
- issue-003 (medium): 스크랩 재투입을 자기참조 BomLine으로 표현하면 제품 구성과 공정 흐름이 혼합되어 BOM의 비순환성과 종료 가능한 전개 의미가 훼손된다. 다만 숙의 결과 이 문제는 독립 이슈라기보다 issue-012와 동일한 원인과 조치 범위를 가진 파생 표면으로 좁혀졌다.
  - root cause: 제품 구성 관계와 공정 자재 회수·재투입 흐름을 분리하지 않아 공정 순환을 자기참조 BomLine으로 표현하게 되었다.
  - materiality: 스크랩 재투입 Assembly를 전개·소요량·원가 계산에 사용하면 자기참조 때문에 종료 조건, 수량 산정, 원가 롤업 및 예외 처리가 소비 시스템마다 달라질 수 있다. 이는 PLM 제품 구조와 MES 공정 흐름을 구분하면서 연결하려는 BOM·라우팅 개념 기준의 일관성을 약화한다.
  - action: 구성 BOM의 비순환 규칙을 예외 없이 유지하고, 스크랩 발생·회수·재투입은 Routing/Operation에 연결된 별도 자재 흐름 관계로 모델링해야 한다. 먼저 공정 흐름 개념과 투입률·회수율·계산 경계를 정의한 뒤 자기참조 BomLine을 해당 관계로 이전해야 하며, 중복 조치를 피하도록 issue-012의 동일한 개선 범위 안에서 처리하고 대상 문서에서 issue-003을 닫아야 한다.
  - unresolved disagreement: logic 렌즈는 issue-003을 issue-012가 포괄하는 파생 표면으로 보았지만, axiology와 semantics 렌즈는 독립 이슈로 유지해야 한다는 이견을 남겼다. 이를 구분하려면 독립적인 근본 원인, 실패 조건, 영향 또는 조치 범위의 직접 증거가 필요하다.
- issue-005 (medium): Routing과 ECO가 현재 상태값만 보유하고 전이·승인 증거를 남기지 않아, 생산 허용과 설계변경 적용의 종료·철회·정정·대체 과정을 감사할 수 없다. 이 결손은 다음 단계 전에 해소해야 한다.
  - root cause: Routing과 ECO 상태를 현재값 enum으로만 모델링하고 lifecycle 전이와 승인 행위를 독립적인 감사 증거로 만들지 않았다.
  - materiality: 릴리스된 Routing이나 승인·적용된 ECO를 폐기, 취소, 정정 또는 재발행할 때 유효성 종료와 변경 근거를 입증할 수 없다. 그 결과 종료되거나 잘못 승인된 정의가 계속 유효한 것으로 해석될 수 있고, 승인 책임도 추적할 수 없어 통제 가능한 lifecycle이라는 목적이 약화된다.
  - action: 다음 단계 전에 LifecycleTransition과 ApprovalRecord를 도입해 from_status, to_status, actor, timestamp, rationale, source_document를 기록해야 한다. 이어 실제 운영 정책에 맞춰 Routing의 obsolete/superseded 및 ECO의 rejected/cancelled/superseded 등 종료·철회·정정·대체 경로와 허용 전이를 정의해야 한다. 전이·승인 증거 구조를 먼저 확립해야 상태 명칭과 정책을 감사 가능한 계약으로 연결할 수 있다.
- issue-006 (medium): scrap_rate와 표준시간이 여러 시스템에서 병행 관리되지만 필드별 권위 원본과 복제·충돌 계약이 없어, 동일 제조 기준값을 일관되게 공유할 수 없다.
  - root cause: 병행 저장되는 제조 계수를 권위 원본과 추적 가능한 파생 복제본으로 구분하는 provenance·동기화 계약이 없다.
  - materiality: 엑셀·MES·표준원가 시스템의 값이 시점이나 내용에서 달라지면 자재 소요량, 생산능력, 일정 및 원가가 서로 다른 기준으로 계산된다. 이는 PLM/MES 간 제조 기준값을 일관되게 공유하려는 목적과 운영 의사결정의 신뢰를 직접 약화한다.
  - action: 다음 단계 전에 먼저 scrap_rate와 표준시간 각각의 authoritative_system과 authoritative_record를 지정해야 한다. 이어 복제값을 source_ref, source_version, synchronized_at, valid_from/to를 가진 파생 투영으로 모델링하고, 충돌 시 적용할 우선순위와 판정 규칙을 명시해야 한다. 권위 지정이 복제 계보와 충돌 처리의 전제이므로 이 순서로 닫아야 한다.
- issue-008 (medium): 폐쇄형 단위 enum과 모델 외부의 품목별 환산 규칙 때문에 새 단위를 수용하려면 스키마와 연계를 반복 변경해야 하며, PLM 계획 수량과 MES 현장 투입량의 환산도 재현·검증할 수 없다.
  - root cause: 단위를 확장 가능한 참조 개념으로 두지 않고 폐쇄 enum으로 선언했으며 품목별 변환 규칙을 모델 밖에 두었다.
  - materiality: 이 결함은 서로 다른 품목·수량 체계를 사용하는 PLM과 MES에 공통 개념 기준을 제공하려는 목적을 약화한다. 현재 enum에 없는 단위나 품목별 변환이 필요한 데이터가 들어오면 계약과 소비 시스템을 함께 수정해야 하고, 수기 환산의 비결정성 때문에 계획 수량과 실제 투입량이 달라질 수 있다.
  - action: 다음 단계 전에 UnitOfMeasure와 품목별 UnitConversion을 독립적이고 확장 가능한 마스터로 먼저 정의해야 한다. 이어 BomLine.qty_per를 비롯한 수량·용량·시간 값을 수치와 단위를 함께 보존하는 Quantity 형태로 통일하고, 단위 코드·차원·환산 출처·유효기간을 명시해야 한다. 이 순서로 단위와 변환 규칙을 권위 있는 기준으로 만든 뒤 관련 값을 연결해야 신규 단위 확장과 시스템 간 환산을 반복 가능하게 검증할 수 있다.
- issue-009 (medium): 비선형 공정 요구가 있는 범위에서 현재 Routing.operations의 선형 ordered_list만으로는 병렬·선택·반복·재작업 흐름을 표현할 수 없으므로, 확장 가능한 PLM–MES 통합 계약으로는 불충분하다.
  - root cause: 공정 정의와 라우팅 내 공정 발생을 분리하지 않고 실행 흐름을 단일 ordered_list로 고정했다.
  - materiality: 비선형 흐름을 추가할 때 기존 라우팅 필드와 소비 로직을 교체하거나 별도 우회 모델을 만들어야 한다. 이는 MES 실행 순서를 PLM과 공유하는 개념 기준의 연속성과 일관성을 약화하므로 material한 medium 이슈다.
  - action: 먼저 Operation 정의와 라우팅 내 발생을 분리해 OperationOccurrence 또는 RoutingStep을 도입하고, 각 발생이 Operation을 참조하도록 해야 한다. 이어 predecessor/successor, 조건, 경로 유형을 가진 StepTransition으로 흐름을 표현하며, 기존 선형 라우팅은 이 일반 구조의 특수 사례로 유지해 계약 연속성을 보존해야 한다.
- issue-010 (medium): 이 이슈는 일반적인 예외 처리 문제가 아니라, 제품 구성과 회수·재투입이라는 이질적인 흐름을 하나의 BomLine으로 표현해 확장 시 검증·전개 예외가 반복적으로 누적되는 모델링 문제이다.
  - root cause: 제품 구성과 공정 부산물 회수 흐름의 서로 다른 생명주기·계산 의미를 하나의 BomLine 관계로 합쳤다.
  - materiality: 다단계 회수, 조립품 간 재투입, 반복 회수가 늘어나면 정상 회수와 오류 순환을 구분하기 어려워진다. 이에 따라 BOM 검증과 전개 소비자를 계속 수정해야 하며, 소요량·원가 계산의 종료성과 정확성을 보장하기 어려워져 안정적인 제조 운영 규칙을 유지하면서 재생 공정을 확장하려는 목적을 약화한다.
  - action: 먼저 구성 BOM에 비순환 계약을 유지하고, 회수·재투입을 별도의 MaterialRecoveryFlow로 분리해야 한다. 이 관계에는 투입원, 회수 대상, 적용 공정, 수율, 최대 반복 또는 종료 조건을 명시하고, 이후 필요한 계산에서만 구성 그래프와 회수 그래프를 결합해야 한다. 이 순서를 따라야 일반 BOM 검증과 전개의 안정성을 보존하면서 회수 계산의 종료성과 정확성을 별도로 보장할 수 있다.
- issue-011 (medium): AlternatePart의 무조건적 상호성 규칙과 허용·기본값인 `one_way` 방향은 동일 레코드에서 역방향 대체를 동시에 요구하고 금지하므로, 현재 계약은 결정적으로 해석할 수 없습니다.
  - root cause: AlternatePart의 상호성은 무조건 선언하면서 방향성을 선택 가능한 상태로 두고 one_way를 기본값으로 지정했다.
  - materiality: 이 모순 때문에 PLM과 MES가 같은 적합 레코드에서 서로 다른 대체 가능성을 도출할 수 있습니다. 따라서 부품 대체 자격을 시스템 간 공통 기준으로 일관되게 판정하려는 목적이 약화됩니다.
  - action: 하나의 정준 계약을 선택해야 합니다. 모든 대체를 양방향으로 규정한다면 `one_way`를 제거하고, 단방향을 유지한다면 상호성을 `direction: bidirectional`에만 적용해야 합니다. 선택 후 각 direction 값의 역방향 허용 의미와 기본값을 정의·규칙 전체에서 일치시켜 소비자가 동일한 자격 판정을 내리도록 해야 합니다.
- issue-015 (medium): scrap_rate는 손실 비율과 소요량 보정 승수를 구분하지 못하므로 다음 단계 전에 의미와 파생 규칙을 바로잡아야 한다.
  - root cause: 손실 비율과 소요량 보정계수를 구분하지 않고 출처·범위·산식이 없는 단일 number 속성에 결합했다.
  - materiality: 소비 시스템이 같은 값을 비율 또는 승수로 다르게 해석하면 동일 BOM의 계획 소요량이 달라져 과소·과다 조달과 생산계획 오차가 발생한다. 따라서 BOM 수량과 공정 손실을 시스템 간 동일하게 해석하게 한다는 목적이 약화된다.
  - action: 다음 단계 전에 권위 있는 손실 비율의 분모·범위·원본 식별자·효력을 명시하고, 총소요 보정계수와 계획 소요량은 그 원천 값 및 qty_per에서 추적 가능하게 파생해야 한다. 보정계수를 별도 독립 입력으로 유지하지 않아야 해석 분기와 원천 값 드리프트를 함께 차단할 수 있다.
- issue-016 (medium): capacity_per_shift 하나로 처리량과 가용시간을 표현하면 값의 물리 차원과 계산 역할을 구별할 수 없으므로, 다음 단계 전에 명시적인 용량 계약으로 바로잡아야 한다.
  - root cause: 처리량과 가용시간을 물리 차원이나 단위 없이 하나의 capacity_per_shift number 속성으로 합쳤다.
  - materiality: 수량/교대와 시간/교대는 직접 비교하거나 같은 산식에 사용할 수 없다. 그런데 MES와 PLM이 단위 없는 숫자만 교환하면 작업장 능력과 라우팅 부하를 일관된 단위로 통합할 수 없고, 부하율·병목·생산 일정이 잘못 계산될 수 있어 선언된 목적을 실질적으로 약화한다.
  - action: 다음 단계의 부하 및 일정 계산 전에 available_time_per_shift와 throughput_capacity를 분리해야 한다. 하나의 일반 측정 모델을 유지한다면 최소한 dimension, unit, 기준 Operation 또는 Part, 산정 기간을 필수로 포함해 계산 가능한 값의 의미를 명시해야 한다. 심의는 이 원인과 조치, medium 심각도를 그대로 수용했으며 별도 이견은 남기지 않았다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-001: logic·semantics는 Quantity·UnitConversion 의미 계약 부재만을 직접 근본 원인으로 수용했지만, axiology·coverage는 권위·동기화 계약 부재도 같은 근원에 포함해야 한다고 본다. 이를 통합하려면 두 결함이 하나의 인과적 근원임을 보여 주는 직접 사례나 데이터 흐름 증거가 추가로 필요하다.
- issue-004: 심의는 버전별 구성 기준선·효력 의미와 ECO 변경 구성 탐색 경로의 단절만 직접 입증된 원인으로 수용했다. coverage와 axiology는 일반 ChangeItem 및 ProductionOrder까지 하나의 정의→실행 정체성 사슬 결손으로 포함해야 한다고 보지만, semantics와 structure는 이들이 동일 원인에서 발생한다는 직접 증거가 부족하다고 범위를 좁혔다.
- issue-003: logic 렌즈는 issue-003을 issue-012가 포괄하는 파생 표면으로 보았지만, axiology와 semantics 렌즈는 독립 이슈로 유지해야 한다는 이견을 남겼다. 이를 구분하려면 독립적인 근본 원인, 실패 조건, 영향 또는 조치 범위의 직접 증거가 필요하다.

## Deliberation Decision
- issue-001: narrowed
- issue-002: no-deliberation-needed
- issue-004: narrowed
- issue-007: no-deliberation-needed
- issue-012: resolved
- issue-013: resolved
- issue-014: no-deliberation-needed
- issue-003: narrowed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: narrowed
- issue-011: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합에서 품목·BOM·라우팅의 기준값, 수량 및 능력을 동일한 의미로 해석하게 하는 개념 기준 제공 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅 데이터를 동일한 의미로 해석하게 하는 개념 기준 제공 Source finding context: BOM 수량과 라우팅/작업장 능력을 PLM과 MES에서 동일하게 해석하는 목적
- issue-002: PLM의 설계변경을 MES 생산 실행에 일관된 의미와 시점으로 전달하는 변경관리 개념 기준 Source finding context: PLM의 설계변경을 MES 생산 실행에 일관되게 전달하는 변경관리 개념 기준 Source finding context: PLM 변경 승인과 MES 생산 적용 시점의 공통 변경관리 의미 제공
- issue-004: PLM/MES 통합에서 품목·BOM·라우팅·변경 정의를 실제 생산 실행과 시점별로 일관되게 연결하는 목적 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경의 일관된 시점별 기준을 제공하는 목적 Source finding context: PLM/MES 통합의 개념 기준으로서 제조 정의와 실제 실행을 연결하는 목적 Source finding context: 품목·BOM·라우팅 전반의 변경을 일관된 변경관리 개념으로 통합하는 목적 Source finding context: PLM/MES 통합에서 BOM·라우팅·변경관리의 일관된 개념 기준 제공
- issue-007: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 시점별 개념 기준을 제공하는 목적 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 개념 기준을 제공하는 목적
- issue-012: 일관된 PLM 제품 구조와 MES 자재 흐름을 제공하고 BOM을 무결성 검증 및 소요 계산 기준으로 사용하는 목적 Source finding context: Use of the BOM ontology as a consistent PLM/MES integration contract and integrity-validation basis. Source finding context: PLM 제품구조와 MES 자재 흐름을 구분하면서 공유 가능한 BOM 의미 제공
- issue-013: PLM/MES 통합에서 부품 대체 가능성과 방향을 일관되게 전달하는 개념 기준 제공 Source finding context: PLM/MES 통합에서 부품 대체 가능성의 공통 의미 기준 제공 Source finding context: PLM/MES 통합을 위한 품목 및 대체품 관계의 개념 기준 제공
- issue-014: PLM 검사 규격과 MES 실행 공정을 일관된 개념으로 통합하는 목적 Source finding context: PLM의 검사 규격과 MES의 실행 공정을 일관된 개념으로 통합
- issue-003: PLM 제품 구조와 MES 공정 흐름을 구분하면서 연결하는 일관된 BOM·라우팅 개념 기준 Source finding context: PLM 제품 구조와 MES 공정 흐름을 구분하면서 연결하는 일관된 BOM/라우팅 개념 기준
- issue-005: 생산 허용과 설계변경 적용을 통제 가능한 lifecycle로 표현하는 목적
- issue-006: PLM/MES 간 제조 기준값을 일관되게 공유하는 목적
- issue-008: 서로 다른 품목·수량 체계를 사용하는 PLM/MES의 공통 개념 기준 제공
- issue-009: MES가 실행할 제조 공정 순서를 PLM과 공유하는 확장 가능한 개념 기준 제공
- issue-010: 안정적인 BOM 전개와 제조 운영 규칙을 유지하면서 재생 공정을 확장하는 목적 Source finding context: 안정적인 BOM 전개와 제조 운영 규칙을 제공하면서 재생 공정을 확장하는 목적
- issue-011: PLM/MES 공통 기준에서 부품 대체 가능성을 결정적으로 판정하는 목적 Source finding context: Use of the ontology as a shared PLM/MES conceptual standard for part substitution.
- issue-015: BOM 수량과 공정 손실을 시스템 간 동일하게 해석하는 개념 기준 제공
- issue-016: MES 작업장 능력과 라우팅 부하를 일관된 단위로 통합하는 목적

## Final Review Result
16 material issue(s) require attention. Highest-priority issue: issue-001 (high) — 단위·물리 차원과 적용 가능한 변환 규칙을 결합한 Quantity·UnitConversion 계약이 없어 BOM 수량과 작업장 능력 계산이 비결정적이므로, 이 결함은 현재 통합 기준에서 반드시 해소해야 한다. Unresolved disagreement remains: logic·semantics는 Quantity·UnitConversion 의미 계약 부재만을 직접 근본 원인으로 수용했지만, axiology·coverage는 권위·동기화 계약 부재도 같은 근원에 포함해야 한다고 본다. 이를 통합하려면 두 결함이 하나의 인과적 근원임을 보여 주는 직접 사례나 데이터 흐름 증거가 추가로 필요하다.

## Boundary Notes
- 현재 경계에서는 실제 PLM/MES에 별도 동기화·대사 통제가 존재하는지 확인할 수 없다.
- 생산 오더 시스템이 ECO를 직접 조회하는지는 경계 내 자료로 확인되지 않았다.
- 현행 원본 시스템에서 도면 리비전과 제조 구성 리비전이 항상 함께 변경되는지는 확인되지 않았다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-004 (high): fix_now
- issue-007 (high): fix_now
- issue-012 (high): fix_now
- issue-013 (high): fix_now
- issue-014 (high): fix_now
- issue-003 (medium): follow_up, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-008 (medium): fix_before_release, follow_up
- issue-009 (medium): follow_up
- issue-010 (medium): follow_up
- issue-011 (medium): fix_now, accept_risk
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
