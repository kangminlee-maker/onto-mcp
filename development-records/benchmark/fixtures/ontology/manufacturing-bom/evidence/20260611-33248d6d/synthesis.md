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
- issue-001 (high): ECO effectivity와 Part revision authority가 versioned/effective artifact로 분리되지 않아, ECO 적용일 이후 MES가 어떤 생산 리비전을 기준으로 오더를 생성해야 하는지 통합 계약 안에서 닫히지 않습니다. 따라서 이 이슈는 PLM/MES 통합 기준 문서에서 반드시 수정해야 하는 high material issue입니다.
  - root cause: Revision/effectivity가 versioned artifact 개념이 아니라 current Part.rev와 date-only ECO 속성으로 모델링되어, ECO effective_date 이후 생산 적용 기준을 Part.rev 동기화 상태와 독립적으로 결정하거나 과거·현재·미래 제조 상태를 동시에 보존할 수 없다.
  - materiality: 이 문서의 목적은 품목·BOM·라우팅·변경관리의 정합성과 제조 운영 위험을 판단 가능하게 하는 것입니다. 그런데 ECO.effective_date 이후 생산분은 신규 rev를 따라야 한다고 선언하면서도 Part.rev는 도면 관리대장 반영 뒤 주간 배치로 늦게 동기화될 수 있게 두어, 적용일 이후의 생산오더가 변경 적용 기준이 아니라 지연된 current 속성을 참조할 수 있습니다. 이는 변경관리 위험을 줄이는 기준 문서가 아니라 그 위험을 정상 운영 조건처럼 남기는 결과가 됩니다.
  - action: Part.rev를 단일 current 필드로 두지 말고 drawing revision, effective production revision, BOM/Routing revision/effectivity를 명시적인 versioned/effective artifact로 분리해야 합니다. ECO는 변경된 artifact와 effectivity scope 및 전환 규칙에 연결하고, current revision/current ECO는 권위 원본이 아니라 파생 projection으로 격하해야 합니다. 최소한 ECO.effective_date 이후 신규 rev가 MES에 아직 동기화되지 않은 경우 생산오더 생성을 차단하거나, Routing release 조건이 ECO 적용 이력에서 생산 적용 rev를 직접 해석하도록 해야 합니다.
- issue-010 (high): Issue-010은 BOM 검증 규칙 안에서 일반 BOM 구성은 비순환이어야 한다는 필수 제약과 재생 원료 회수 공정을 self-child BOM 예외로 모델링한다는 선언이 같은 parent-child 관계에 놓여 발생한 high-severity 논리 모순입니다.
  - root cause: 무결성 규칙이 acyclic BOM 제약과 self-reference 예외를 같은 parent-child 관계 위에 동시에 선언했습니다.
  - materiality: 이 문서의 목적은 PLM/MES 통합에서 BOM 무결성 규칙을 일관된 기준으로 제공하는 것입니다. 그러나 같은 BOM이 acyclic 규칙을 적용하면 무효이고 self-child 예외를 허용하면 유효해지는 상태라면, BOM 검증, 전개, 생산오더 생성 전 단계에서 어떤 기준을 따라야 하는지 결정할 수 없어 통합 기준 문서의 신뢰가 깨집니다.
  - action: 일반 BOM 구성 관계는 acyclic invariant로 유지하고, 스크랩 재투입이나 재생 원료 회수는 BOM parent-child 예외가 아니라 별도 process/yield/recovery input-output relation 또는 entity로 분리해야 합니다. 예를 들어 RecoveredMaterialInput이나 ProcessYieldReturn 같은 개념으로 공정 투입·산출 권한을 분리한 뒤, 무결성 규칙을 일반 BOM 구성은 비순환이고 회수 흐름은 공정 관계로 모델링한다고 명시해야 합니다.
- issue-011 (high): AlternatePart는 상호 대체를 뜻하는 정의와 `one_way` 기본값이 같은 개념 안에 공존해 대체 허용 방향의 canonical semantics가 흔들리는 고위험 의미 충돌이다. Issue-011의 범위는 이 semantic direction-authority contradiction을 닫는 데 있다.
  - root cause: 대체 관계의 방향성 의미가 AlternatePart 정의, direction default, Part-to-Part shortcut relation 사이에서 하나의 canonical relation authority로 고정되어 있지 않다.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 품목 대체 관계의 승인 의미를 일관되게 전달해야 한다. 그런데 소비자가 정의의 상호 대체 의미를 따르면 양방향 대체를, `direction` 기본값을 따르면 단방향 대체를 도출할 수 있어 자재 대체, 구매/불출, 생산오더 적용 범위가 달라진다. 대체 방향은 제조 실행과 운영 안전성에 직접 영향을 주므로 문서의 기준 신뢰를 약화한다.
  - action: AlternatePart 정의를 direction-aware substitution relation으로 고쳐야 한다. `direction=bidirectional`일 때만 상호 대체라고 명시하고, `one_way` 기본값은 단방향 승인 의미로 일관되게 설명해야 한다. shortcut relation은 canonical direction 의미를 덮거나 흐리지 않도록 제거하거나 derived view로 구분해야 하며, 구조적 relation-record projection 수리는 issue-016과 순서를 맞춰 조율해야 한다.
- issue-002 (medium): scrap_rate, capacity, std_time, UOM 변환 같은 운영 핵심값이 모델 안에서 canonical authority와 precedence, invalid-input behavior로 닫히지 않아 PLM/MES 통합 기준 문서로서의 신뢰성을 약화한다.
  - root cause: 운영 핵심값의 authority, precedence, invalid input behavior를 대상 파일 안에서 canonical 개념으로 닫지 않아 계획·원가·용량·단위 값이 외부 복사, 수기 입력, 현장 환산에 의존한다.
  - materiality: 이 문서의 선언된 목적은 BOM·라우팅·운영값의 우선순위와 입력 실패 조건을 닫아 PLM/MES 통합 기준을 제공하는 것이다. 그런데 계획 엑셀 복사값, 작업장별 capacity 단위, MES 계산값과 표준원가 수기값, 현장 UOM 환산이 충돌하거나 누락되어도 차단·예외·우선순위 기준이 없으면, 문서는 운영 위험을 제거하는 기준이 아니라 부서별 로컬 원천과 수기 보정을 정당화하는 문서가 된다.
  - action: 각 운영값에 canonical source, 단위 또는 dimension, 유효기간, 동기화 주기, 충돌 시 우선순위, 누락·불일치 시 차단 또는 예외 처리 규칙을 부여해야 한다. 특히 품목별 UOM 환산계수 마스터와 capacity 단위 enum 또는 dimension 모델을 추가하고, 엑셀 복사값과 표준원가 수기값 같은 로컬 입력은 canonical 값이 아니라 derived/projection으로 격하해야 한다.
- issue-003 (medium): BomLine.scrap_rate는 생산 시점에 따라 달라질 수 있는 제조 계수인데 현재 온톨로지에서는 단순 숫자 속성으로만 존재합니다. 그 결과 특정 생산일자에 어떤 스크랩 보정 계수를 적용했는지 재구성하기 어려워 BOM 소요량, 계획값, 실적/원가 대사의 신뢰성이 약해집니다.
  - root cause: 시점 의존 제조 계수인 scrap_rate를 독립 값 또는 versioned/effective concept로 승격하지 않고 BomLine의 단순 number 속성으로 모델링했다.
  - materiality: 이 온톨로지의 목적은 PLM/MES 통합 기준 문서로서 BOM 수량과 공정 불량 계수를 생산계획과 실행 시스템이 일관되게 해석하도록 하는 것입니다. scrap_rate가 변경되거나 생산계획팀 엑셀 값이 주기적으로 복사되는 상황에서 유효기간, 이력, 원천 authority가 없으면 동일 BOM 라인이라도 생산일자별로 적용해야 할 계수를 판단할 수 없습니다. 따라서 운영 의사결정과 감사 가능한 대사 기준이 약해지므로 material 이슈입니다.
  - action: scrap_rate_effectivity, BomLineEffectivity, ProcessYieldFactor 같은 versioned/effective 개념을 추가하고 value, effective_from, effective_to, source_ref, changed_by, changed_at을 관리해야 합니다. 이 조치는 issue-002의 운영값 authority 문제와 연결되지만, issue-003에서는 특히 생산일자별 계수 조회와 재구성이 가능하도록 effectivity/history 기준을 다음 단계 전에 닫는 것이 필요합니다.
- issue-004 (medium): Routing.status와 ECO.status가 release/applied 이후의 폐기, 대체, 취소, 정정 상태를 표현하지 못해, 생산 가능 여부와 변경 적용 판단이 오래된 current status에 묶이는 material issue입니다.
  - root cause: 상태 보유 개념을 release/applied까지의 진행 상태로만 모델링하고 lifecycle 종료, 폐기, 대체, 사후 정정 사건을 별도 개념으로 포함하지 않았다.
  - materiality: PLM/MES 통합 목적은 라우팅 릴리즈 상태와 ECO 적용 상태를 기준으로 생산 오더 생성과 변경 적용 여부를 판단하는 것입니다. 그런데 released 라우팅이 폐기되거나 대체된 경우, 또는 applied ECO가 취소·정정·재발행되어야 하는 경우를 상태나 사건으로 표현할 수 없으면 오래된 라우팅이 계속 생산 가능해 보이고 적용 후 변경 이력도 기존 status 의미를 깨지 않고 남길 수 없습니다. 따라서 제조 실행 통제와 과거 기준 보존이 약화됩니다.
  - action: Routing에는 obsolete, archived, superseded 같은 종료 상태와 effective_to, superseded_by 같은 대체·효력 종료 속성을 추가해야 합니다. ECO에는 cancelled, revised, superseded 상태를 확장하거나 ECORevision/CorrectionEvent 같은 사후 정정·재발행 사건을 추가해야 합니다. 이 조치는 생산 가능 여부와 변경 적용 기준이 단순 current status가 아니라 lifecycle 종료 및 supersession/correction 의미까지 반영하도록 만들기 위해 필요합니다.
- issue-005 (medium): ECO 승인/적용, Routing release, 외부값 복사 같은 통제 행위가 상태값이나 속성 메모로만 남고, actor·timestamp·basis를 담는 audit evidence/event 개념이 없어 감사 가능한 변경관리 기준으로는 불완전합니다.
  - root cause: 통제 행위를 상태 전이 또는 속성 메모로만 표현하고 actor, timestamp, basis를 담는 audit evidence/event를 별도 entity로 모델링하지 않았다.
  - materiality: 선언된 목적은 품목·BOM·라우팅·변경관리의 통제 기준을 PLM/MES 사이에서 감사 가능하게 공유하는 것입니다. 그러나 승인 책임자, 적용 시각, 근거 문서나 원본 시스템을 재구성할 증거 개념이 없으면 ECO와 라우팅 상태의 신뢰성, 외부 복사값의 근거, 수동 변경 책임을 확인하기 어렵습니다.
  - action: ApprovalEvent, ReleaseEvent, SourceSyncEvent 또는 공통 AuditEvidence 개념을 추가하고 action, actor, timestamp, basis_document/source_system, target_ref, previous_value, new_value를 포함해야 합니다. 이 개념을 ECO 승인·적용, Routing release, 외부값 동기화 대상에 연결해야 상태 결과와 통제 행위 증거가 분리되고, 변경 책임과 적용 근거를 감사 가능하게 재구성할 수 있습니다.
- issue-006 (medium): 단위와 환산 기준이 enum 또는 메모에만 머물러 있어, BOM 수량과 작업장 능력을 PLM/MES가 같은 기준으로 계산하는 통합 목적을 만족하지 못합니다.
  - root cause: 단위를 속성 enum 또는 설명 메모로만 두고, 품목별 환산과 능력 단위 기준을 독립 관리 개념으로 포함하지 않았습니다.
  - materiality: 이 이슈는 kg 원재료를 ea 완제품 BOM에 투입하거나 작업장별 capacity_per_shift를 생산계획에 함께 쓰는 상황에서 직접 문제가 됩니다. 품목별 UOM 환산 기준과 capacity unit/basis가 canonical 개념으로 닫혀 있지 않으면 시스템별 임의 환산이나 현장 계산에 의존하게 되어 계획 수량과 능력 산정 결과가 일관되지 않을 수 있습니다.
  - action: UomConversionFactor 또는 PartUomConversion 같은 환산 authority 엔티티를 추가해 from_uom, to_uom, factor, effective period, source authority를 모델링해야 합니다. 또한 WorkCenter.capacity_per_shift에는 capacity_unit 또는 capacity_basis와 표준 시간 단위를 명시해 생산계획 계산이 어떤 단위와 기준으로 수행되는지 고정해야 합니다. 이는 release 전 현재 대상 안에서 닫아야 하는 fix_now 성격의 조치입니다.
- issue-007 (medium): 고정된 `uom` enum과 현장 수동 환산 방식은 BOM 수량을 PLM/MES 통합 기준으로 쓰기에는 부족합니다. 단위 자체와 단위 환산을 확장 가능한 권위 개념으로 모델링해야 합니다.
  - root cause: Unit identity and unit conversion are not modeled as extensible authority concepts.
  - materiality: 선언된 목적은 BOM 수량과 제조 작업을 PLM/MES 통합 개념 표준으로 삼는 것입니다. 그러나 단위가 `ea/kg/m` 같은 폐쇄 enum에 묶이고 품목별 환산 권위가 없으면 구매, BOM, 재고, 실행 단위가 달라지는 순간 수량, 스크랩, 원가, 소비 계산이 시스템별 또는 작업자별 해석에 의존하게 됩니다. 그래서 통합 기준으로서의 신뢰성이 약해집니다.
  - action: `uom`을 하드코딩 enum이 아니라 `UnitOfMeasure` 참조로 바꾸고, 유효한 범위에서 품목, 사이트, effectivity를 고려하는 `UomConversion` master를 추가해야 합니다. 허용 단위군과 차원 호환성은 enum 값 자체가 아니라 검증 데이터로 두어야 하며, issue-006과 같은 unit authority 정비와 함께 다음 단계에서 묶어 처리하는 것이 적절합니다.
- issue-008 (medium): Scrap reinput을 Assembly가 자기 자신을 child로 포함하는 BOM 예외로 두면 안 됩니다. engineering/product BOM은 엄격히 acyclic으로 유지하고, scrap recovery, rework, byproduct, yield-return 흐름은 별도 process/yield/recovery 관계로 분리해야 합니다.
  - root cause: Process recovery semantics are encoded as a special-case cycle inside the BOM product-structure invariant.
  - materiality: 이 이슈는 제조 운영과 통합을 위한 안정적인 BOM/routing baseline이라는 목적을 약화합니다. BOM parent-child 관계가 제품 구조와 공정 회수 의미를 동시에 떠안으면 BOM 전개, cycle validation, costing, 외부 통합 로직이 self-cycle 예외를 알아야 하며, 회수·재작업·부산물 케이스가 늘어날수록 소비자는 핵심 acyclic 검증을 약화하거나 숨은 traversal 예외를 추가해야 합니다.
  - action: BOM parent-child 관계에서 scrap reinput 예외를 제거하고 BOM cycle validation은 strict acyclic으로 유지해야 합니다. 그 다음 scrap reinput과 유사한 회수 흐름은 `MaterialRecovery`, `ByproductOutput`, routing operation input/output link 같은 별도 process/yield/recovery 관계로 표현해야 합니다. 순서상 먼저 제품 구조 invariant의 권위를 회복한 뒤 공정 회수 의미를 독립 relation으로 옮겨야 검증, 전개, 통합 로직이 같은 기준을 공유할 수 있습니다.
- issue-009 (medium): WorkCenter capacity가 `capacity_per_shift`라는 단일 숫자와 “단위는 작업장별로 다름”이라는 주석에 의존해 모델링되어 있어, routing/MES 계획 기준으로 쓰기에는 capacity 의미가 충분히 명시되지 않습니다.
  - root cause: Capacity measurement unit and basis are omitted from the WorkCenter capacity concept.
  - materiality: 이 온톨로지의 목적은 operation, routing, work-center planning을 위한 MES 통합 기준을 제공하는 것입니다. 그러나 capacity의 unit, basis, shift/calendar scope가 데이터 안에 없으면 scheduling, order release, capacity reconciliation이 온톨로지 계약이 아니라 소비자별 외부 가정에 의존하게 되어 목적을 약화합니다.
  - action: WorkCenter capacity를 `capacity_value`, `capacity_uom`, `capacity_basis`, shift/calendar scope로 분리하고, 가능한 경우 canonical UOM 개념을 재사용해야 합니다. 필요하면 capability constraints도 함께 둬서 새 capacity 유형이 추가되어도 소비자가 별도 해석 규칙을 만들지 않고 동일한 통합 기준으로 비교할 수 있게 해야 합니다.
- issue-012 (medium): InspectionPlan을 Operation 하위 타입으로 둔 현재 모델은 검사 계획/기준 문서와 라우팅 실행 공정 단계를 같은 종류로 취급하므로 수정이 필요하다.
  - root cause: 검사 실행 단계와 검사 계획/기준 문서를 하나의 is_a Operation 타입 계층으로 표현해 execution step과 quality-basis artifact의 존재론적 유형을 혼동했다.
  - materiality: 이 문제는 라우팅과 검사 기준을 MES 실행 모델로 정확히 전달하려는 목적을 약화한다. InspectionPlan이 Operation이면 검사 기준 문서가 라우팅 공정 단계처럼 해석될 수 있고, 반대로 실제 검사 Operation도 계획 속성과 섞여 실행 순서, 작업장, 표준시간의 의미가 흐려진다. 그 결과 라우팅 릴리즈, 검사 수행, 품질 기준 참조의 경계가 불명확해져 운영 해석 오류로 이어질 수 있다.
  - action: `InspectionOperation is_a Operation`과 `InspectionPlan`을 분리해야 한다. 라우팅에 들어가는 검사 실행 단계는 InspectionOperation으로 모델링하고, InspectionPlan은 별도 계획/기준 artifact로 두어 `applies_to` 또는 `parameterizes` 관계로 검사 Operation에 연결해야 한다. 이렇게 해야 실행 순서·작업장·시간을 갖는 공정 단계와 검사 기준·샘플링·합격 조건을 담는 기준 문서의 책임과 lifecycle을 분리할 수 있다.
- issue-013 (medium): `capacity_per_shift`는 WorkCenter의 교대당 능력을 표현하려는 속성이지만, 개수 기반 처리량과 시간 기반 가용량을 같은 numeric 속성명 아래에 섞어 담고 있어 해석이 불안정합니다.
  - root cause: 용량 측정 차원을 속성 모델에서 분리하거나 명시하지 않고 단일 number 속성에 합쳤다.
  - materiality: 이 문제는 작업장/설비 능력을 MES 계획과 라우팅 실행에서 해석 가능하게 만드는 목적을 약화합니다. 서로 다른 WorkCenter가 같은 `capacity_per_shift` 값을 제출해도 어떤 값은 생산 수량, 어떤 값은 가용 시간으로 읽히면 공정능력 산정, WorkCenter 간 비교, 생산오더 가능 여부 판단이 같은 기준으로 닫히지 않습니다.
  - action: 용량 의미를 하나로 고정하고 단위를 명시해야 합니다. 필요하면 `capacity_quantity_per_shift`와 `available_minutes_per_shift`처럼 측정 차원별 개념으로 분리하거나, `capacity_value`와 `capacity_uom`/`capacity_basis`를 함께 두어 값의 단위와 기준을 명시해야 합니다. 이 조치는 다음 단계 전에 닫아야 하는 capacity authority 정비에 속합니다.
- issue-014 (medium): BomLine.scrap_rate가 BOM 라인의 제품 구조 소요량 의미와 공정 조건 기반 scrap/yield 의미를 한 속성에 결합하고 있어, BOM과 Routing/Operation의 개념 경계를 분리해야 합니다.
  - root cause: 제품 구조 소요량 개념과 공정 조건 기반 scrap/yield 개념을 BomLine 속성 하나에 결합했다.
  - materiality: 이 문제는 BOM과 라우팅/공정 개념을 PLM/MES 통합 기준으로 명확히 구분하려는 목적을 직접 약화합니다. 공정 불량률이 BomLine의 독립 입력값으로 복사되면 Routing/Operation 기준과 별도로 해석되거나 갱신될 수 있고, 그 결과 자재 소요량 산정과 생산계획이 서로 다른 scrap 의미를 사용하게 됩니다.
  - action: BomLine에는 BOM 구조와 qty_per 중심의 소요량 의미를 남기고, scrap은 Operation 또는 Routing 단계의 yield/scrap parameter로 분리해 모델링해야 합니다. 계획 엑셀 값이 필요하다면 BomLine의 독립 truth로 복사하기보다 원본 authority, 동기화 상태, 또는 공정 파라미터의 입력 출처로 표현해야 합니다.
- issue-015 (medium): BomLine.parent_ref가 공식 relations graph에 투영되지 않아 BOM line의 상위 Assembly 연결이 닫히지 않습니다. 이 때문에 BOM line이 parent-child usage statement로 성립한다는 구조가 관계 목록 기준에서는 비대칭으로 남습니다.
  - root cause: relations 목록이 BomLine의 구조 ref 중 child_ref만 공식 관계로 투영하고 parent_ref는 관계 그래프에 투영하지 않은 비대칭 모델링을 한다.
  - materiality: 이 온톨로지는 PLM/MES 통합의 개념 기준 문서로서 BOM 구조를 일관된 관계 그래프로 제공해야 합니다. relations를 기준으로 BOM 전개, 부모별 추적, orphan BomLine 검출을 수행할 때 parent_ref가 빠져 있으면 상위 Assembly 없는 BOM line이나 부모-자식 경로의 구조 완결성을 검증하기 어려워져 문서의 actionability가 낮아집니다.
  - action: relations에 BomLine -> Assembly references_parent를 추가하거나, 기존 Assembly -> BomLine 관계가 BomLine.parent_ref의 명시적 역관계임을 선언해야 합니다. 핵심은 parent_ref가 공식 relation graph의 검증 및 전개 기준에 포함되도록 닫는 것이며, 이 조치가 있어야 부모별 BOM 전개와 orphan BomLine 검출 기준이 일관됩니다.
- issue-016 (medium): AlternatePart가 direction을 가진 기준 엔티티로 정의되어 있지만 relations에는 직접 참여하지 않고 Part -> Part alternate_of 단축 관계만 노출되어, 대체부품 관계의 기준 구조가 검증 가능한 그래프에 충분히 반영되지 않는다.
  - root cause: AlternatePart를 entity로 정의하면서 relations에는 entity의 primary/alternate endpoints가 아니라 Part 간 shortcut만 두어 direction-bearing record의 structural authority가 관계 그래프에서 검증되지 않는다.
  - materiality: 이 이슈는 PLM/MES 통합에서 대체부품 구조를 검증 가능한 기준 관계로 제공해야 하는 목적을 약화시킨다. 대체부품 마스터를 AlternatePart 레코드로 관리하거나 direction을 검증해야 할 때, 공식 relations가 AlternatePart의 primary_ref, alternate_ref, direction을 직접 연결하지 않으면 유효성, 방향성, 참조 무결성 검증이 Part 간 shortcut 해석에 의존하게 된다.
  - action: relations에 AlternatePart -> Part primary 및 AlternatePart -> Part alternate 관계를 추가해 AlternatePart 레코드가 공식 관계 그래프에서 기준 authority를 갖도록 해야 한다. Part -> Part alternate_of는 제거하거나 derived/shortcut relation으로 명확히 낮춰, 검증은 AlternatePart의 endpoint와 direction을 기준으로 수행되고 shortcut은 파생 뷰로만 사용되게 해야 한다. 이 조치는 다음 단계 전에 닫아야 하는 구조적 전제이다.
- issue-017 (medium): Part.current_eco가 ECO를 참조하는 속성으로 선언되어 있지만 공식 relations graph에는 Part -> ECO 경로가 없어, 품목 기준 최신 ECO 조회와 참조 무결성 검증 경로가 닫히지 않는다.
  - root cause: Part.current_eco 속성 참조를 공식 relations 그래프에 투영하지 않아 Part에서 ECO로 향하는 변경관리 관계 authority가 닫히지 않는다.
  - materiality: 이 온톨로지는 품목과 변경관리 개념을 PLM/MES 통합 기준에서 추적 가능한 구조로 연결해야 한다. 그런데 품목에서 최신 ECO로 가는 공식 관계가 없으면 변경 지시 연결성 검증과 통합 매핑이 속성 선언에 의존하게 되어, 관계 그래프 기준 추적성과 신뢰가 약해진다.
  - action: relations에 Part -> ECO current_change 관계를 추가하거나, current_eco가 ECO -> Part changes에서 계산되는 derived inverse/cache임을 명시해야 한다. 다음 단계 전에 canonical relation인지 derived projection인지 정해야 이후 revision/effectivity authority와 변경관리 매핑이 같은 권위 모델 위에서 검증될 수 있다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: resolved
- issue-010: resolved
- issue-011: narrowed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: narrowed
- issue-009: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-017: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리의 정합성과 제조 운영 위험을 판단 가능하게 하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 변경관리 정합성과 제조 운영 위험을 판단 가능하게 하는 목적. Source finding context: ECO 변경관리와 생산 적용 기준을 PLM/MES 사이에서 일관되게 전달하는 목적. Source finding context: Use the ontology as the concept baseline for PLM/MES integration around item, BOM, routing, and change management.
- issue-010: PLM/MES 통합의 개념 기준 문서에서 BOM 무결성 규칙을 일관되게 제공하는 목적
- issue-011: PLM/MES 통합의 개념 기준 문서로서 품목 대체 관계의 승인 의미를 일관되게 전달해야 하는 목적.
- issue-002: PLM/MES 통합의 개념 기준 문서로서 BOM·라우팅·운영값의 우선순위와 입력 실패 조건을 닫는 목적.
- issue-003: PLM/MES 통합의 개념 기준 문서로서 BOM 수량·공정 불량 계수를 생산계획과 실행 시스템이 일관되게 해석하도록 하는 목적.
- issue-004: PLM/MES 통합에서 라우팅 릴리즈 상태와 ECO 적용 상태를 기준으로 생산 오더 생성 및 변경 적용 여부를 판단하는 목적.
- issue-005: 품목·BOM·라우팅·변경관리의 통제 기준을 PLM/MES 사이에서 감사 가능하게 공유하는 목적.
- issue-006: BOM 수량과 라우팅/작업장 능력을 PLM/MES가 같은 단위 기준으로 계산하도록 하는 통합 기준 목적.
- issue-007: Use the ontology as a PLM/MES integration concept standard for BOM quantities and manufacturing operations.
- issue-008: Use the ontology as a stable BOM/routing baseline for manufacturing operations and integration.
- issue-009: Use the ontology as a routing/MES integration baseline for operations and work-center planning.
- issue-012: 라우팅과 검사 기준을 MES 실행 모델로 정확히 전달하는 PLM/MES 통합 기준 목적.
- issue-013: 작업장/설비 능력 개념을 MES 계획과 라우팅 실행에서 해석 가능하게 만드는 목적.
- issue-014: BOM과 라우팅/공정 개념을 PLM/MES 통합 기준으로 명확히 구분하는 목적.
- issue-015: PLM/MES 통합의 개념 기준 문서로서 BOM 구조를 일관된 관계 그래프로 제공하는 목적.
- issue-016: PLM/MES 통합에서 대체부품 구조를 검증 가능한 기준 관계로 제공하는 목적.
- issue-017: 품목과 변경관리 개념을 PLM/MES 통합 기준에서 추적 가능한 구조로 연결하는 목적.

## Final Review Result
17 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO effectivity와 Part revision authority가 versioned/effective artifact로 분리되지 않아, ECO 적용일 이후 MES가 어떤 생산 리비전을 기준으로 오더를 생성해야 하는지 통합 계약 안에서 닫히지 않습니다. 따라서 이 이슈는 PLM/MES 통합 기준 문서에서 반드시 수정해야 하는 high material issue입니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 웹 연구와 추가 저장소 탐색은 unit boundary에서 금지되어 제공된 prompt packet의 허용 근거만 사용했다.
- Issue-011은 semantic direction authority 문제로 좁혀졌고 shortcut/projection의 구조 수리는 issue-016 경계로 보존된다.

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-010 (high): fix_now
- issue-011 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): fix_before_release, follow_up
- issue-004 (medium): fix_before_release, fix_now
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, fix_now
- issue-007 (medium): follow_up
- issue-008 (medium): fix_before_release, fix_now
- issue-009 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, fix_now
- issue-013 (medium): fix_before_release, follow_up
- issue-014 (medium): fix_before_release, fix_now
- issue-015 (medium): fix_before_release, fix_now
- issue-016 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, follow_up

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
