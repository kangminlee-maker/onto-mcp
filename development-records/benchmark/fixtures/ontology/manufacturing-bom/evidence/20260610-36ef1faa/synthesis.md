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
- issue-001 (high): ECO effective_date, Part.rev 주간 동기화, BOM/routing 현재 구조, released Routing 상태가 서로 분리되어 있어 변경 전후 생산분에 적용할 품목 revision, BOM 구성, 라우팅/표준시간 기준을 온톨로지 내부의 일관된 이력으로 재구성할 수 없습니다.
  - root cause: 생산 기준이 되는 품목 revision, BOM line, Routing/Operation을 현재 상태 속성으로만 두고 version/effectivity 이력 개념으로 승격하지 않아 ECO 적용 시점별 기준을 온톨로지 내부에서 재구성할 수 없다.
  - materiality: 이 문제는 PLM/MES 통합 기준 문서가 제공해야 하는 품목·BOM·라우팅·변경관리 정합성과 제조 운영 위험 감소 목적을 직접 약화합니다. ECO effective_date 이후에는 신규 rev 생산을 요구하면서도 Part.rev는 주간 배치 후 갱신되므로, 같은 생산 시점에 PLM 변경 기준, MES 생산오더, 품질 추적, 원가 계산이 서로 다른 현재값이나 외부 장부 해석에 기대게 됩니다.
  - action: PartRevision 또는 RevisionEffectivity, BomLineEffectivity, RoutingRevision 또는 ProcessEffectivity 같은 effective-dated 기준 개념을 추가해야 합니다. ECO 적용은 현재값 갱신이 아니라 유효기간·적용 범위·source_eco·동기화 상태를 가진 이력 레코드 생성으로 표현하고, 생산오더 생성과 원가 계산은 Part.rev나 released Routing의 현재값이 아니라 해당 생산 시점의 유효 버전을 참조하도록 정렬해야 합니다.
- issue-007 (high): BOM 비순환 규칙과 스크랩 재투입을 Assembly 자기 하위 포함으로 표현하는 예외가 같은 BomLine 구조에 함께 놓여, 제품 구성 관계와 공정 재순환 관계가 충돌합니다. 이 상태에서는 BOM이 동시에 비순환이어야 하고 self-loop를 가져야 하므로 검증과 소비 로직의 기준이 흔들립니다.
  - root cause: 스크랩/회수/재투입을 Routing/Operation 쪽의 물질 흐름 확장 개념으로 분리하지 않고 일반 BOM parent-child 자기참조 예외로 모델링했다.
  - materiality: PLM/MES 통합 기준 문서에서 BOM은 구성 전개, 자재 소요 계산, 원가 롤업, 생산 오더 생성, 변경 영향 분석의 기준 구조입니다. 그런데 자기참조 예외가 BOM 구성 그래프 안에 들어오면 동일 BOM을 검증기는 순환으로 거부해야 하고, 예외 모델은 허용해야 하는 상황이 생깁니다. 그 결과 PLM, MES, 전개 로직, 원가 계산, ECO 영향 분석이 서로 다른 해석을 할 수 있어 선언된 안정적 통합 목적을 직접 약화합니다.
  - action: 스크랩 재투입은 ScrapReturnFlow, MaterialRecoveryOperation, RecoveredMaterial, Byproduct 또는 라우팅의 입력/출력 관계 같은 별도 공정 물질 흐름 개념으로 분리해야 합니다. 먼저 BOM은 일반 구성 관계와 비순환 규칙을 유지하도록 고정하고, 순환성이 필요한 제조 흐름은 Routing/Operation 확장 지점에서 회수 대상 Part, 산출/투입 수량, 회수율, 적용 조건을 명시해야 합니다. 그래야 BOM 전개와 검증의 불변식을 깨지 않고 공정 재순환을 확장할 수 있습니다.
- issue-009 (high): AlternatePart는 정의상 항상 상호 대체 가능한 부품 관계처럼 읽히지만, direction 속성은 one_way를 기본값으로 허용한다. 따라서 같은 AlternatePart 인스턴스가 정의상 양방향이면서 속성상 단방향일 수 있어 개념 의미가 불일치한다.
  - root cause: AlternatePart 동일 개념 안에서 대체 관계의 방향성 의미를 단일 기준으로 정하지 않아 정의는 양방향을 말하고 속성은 단방향 기본값을 허용한다.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 품목 대체 관계의 의미 기준을 제공해야 한다. 그러나 단방향 대체가 기본으로 생성되거나 해석될 때 정의 문장이 이를 양방향 대체로 읽히게 만들면, 제조·구매·품질 승인 흐름에서 허용되지 않은 방향의 대체가 승인된 것으로 적용될 수 있다. 이는 생산 투입 오류나 승인되지 않은 대체 사용으로 이어질 수 있어 목적을 직접 약화한다.
  - action: AlternatePart 정의를 direction에 종속된 방향성 있는 대체 관계로 고쳐야 한다. 즉 direction이 bidirectional일 때만 상호 대체가 성립하고 one_way일 때는 한쪽 방향 대체만 성립한다고 명시한다. 반대로 실제 의도가 항상 대칭 관계라면 direction 속성과 one_way 값을 제거해 정의와 속성 표면을 일치시켜야 한다. issue-008의 relation model 정규화와 연결된 의존성은 있지만, 이 issue는 독립적인 intra-concept contradiction이므로 대상 내에서 즉시 닫아야 한다.
- issue-002 (medium): scrap_rate, 표준시간/표준원가, UOM 환산처럼 복사·수기·계산·대사되는 운영 값은 기준 원본과 동기화·대사 상태가 온톨로지 내부에서 판정 가능해야 한다. 현재 모델은 이를 독립 기준 개념으로 닫지 않아 값 충돌 시 어느 값을 믿어야 하는지 결정하지 못한다.
  - root cause: 운영적으로 중요한 병행 관리 값을 source authority, sync 상태, reconciliation 상태가 있는 독립 기준 개념으로 모델링하지 않고 외부 장부 복사값 또는 note에 맡겼다.
  - materiality: 이 이슈는 PLM/MES 및 주변 장부 간 기준 데이터의 precedence와 scope control을 제공하고 제조 운영 위험을 검토 가능하게 만드는 목적을 직접 약화한다. 생산계획 엑셀 복사값, MES 계산값, 표준원가 수기값, 현장 UOM 환산값이 서로 다를 때 기준값·최신성·대사 상태를 판단할 수 없으면 생산계획, 자재소요, 원가/능력 판단에서 통합 기준 문서의 신뢰가 낮아진다.
  - action: SourceAuthority 또는 MasterDataAuthority 개념을 추가해 attribute_ref, authoritative_system, replica_systems, sync_method, last_synced_at, reconciliation_status, discrepancy_owner를 표현해야 한다. 우선 scrap_rate, std_time/표준원가 병행 관리, UOM conversion factor에 적용하고, evolution·semantics·structure 렌즈가 좁혀 지적한 시간·버전 효과, 값 의미 구분, 구조적 authority link를 repair scope에 포함해야 한다.
- issue-003 (medium): Part.uom, UOM conversion, WorkCenter.capacity_per_shift가 구조화된 단위·환산·capacity basis 없이 표현되어 수량과 능력 값의 의미가 PLM/MES, 계획, 원가 계산 소비자별로 달라질 수 있는 material issue이다.
  - root cause: 단위와 환산 기준을 독립 기준 데이터로 모델링하지 않고 제한 enum, 숫자 필드, 현장 환산에 분산했다.
  - materiality: 이 문제는 PLM/MES 통합 기준 문서가 수량·능력·공정 데이터를 일관되고 확장 가능하게 해석하게 해야 한다는 목적을 약화한다. kg 기반 품목과 ea 소요량을 결합하거나 작업장별 capacity를 계획·부하 계산에 사용할 때, 환산 권위와 capacity 단위가 명시되지 않으면 현장 판단과 소비 시스템의 암묵 해석이 기준을 대체한다. 그 결과 자재소요, 생산능력, 생산오더 가능 여부, 원가 계산의 비교 가능성과 자동 검증 가능성이 낮아진다.
  - action: Uom, UnitConversion, WorkCenterCapacity를 별도 기준 개념으로 승격해야 한다. WorkCenterCapacity에는 capacity_value, capacity_uom, capacity_basis, valid_from, work_center_ref를 명시하고, Part.uom은 기준 Uom 참조 또는 확장 가능한 코드 마스터로 분리해야 한다. 또한 환산 불가나 단위 누락 입력은 생산오더·계획 계산에서 거부하거나 검토 상태로 남기는 규칙이 필요하다. 이 조치는 수량·능력 계산의 단위 권위를 먼저 고정해야 이후 라우팅, 계획, 원가 계산이 같은 의미의 데이터를 소비할 수 있기 때문이다.
- issue-004 (medium): Routing release, ECO 승인/적용, scrap_rate 복사, 표준원가 대사처럼 통제가 필요한 행위가 AuditEvent 또는 ControlEvidence로 표현되지 않아, 기준값이나 상태 변경의 책임 주체와 근거를 추적할 수 없다.
  - root cause: 상태와 수기 관리 값을 모델링하면서 승인, 적용, 복사, 대사 같은 통제 행위를 actor/time/reason/evidence가 있는 감사 이벤트로 포함하지 않았다.
  - materiality: 검토 대상의 목적은 제조 운영 위험을 중심으로 PLM/MES 통합 개념 기준의 통제 가능성을 제공하는 것이다. 현재 모델은 Routing.status, ECO.status, scrap_rate, 표준원가 대사 같은 결과 상태와 값은 남기지만, 누가 언제 어떤 이유와 증거로 승인·적용·복사·대사했는지를 남기지 못한다. 따라서 변경관리와 제조 실행 통제의 책임성, 감사성, 재현성이 약해져 material issue로 유지된다.
  - action: AuditEvent 또는 ControlEvidence 개념을 추가하고 actor, occurred_at, action_type, target_ref, reason/evidence_ref, source_system, before/after를 포함해야 한다. 이 개념을 ECO 승인/적용, Routing release, scrap_rate 복사, 표준원가 대사 행위와 연결해 상태 전이와 수기·외부장부 개입이 감사 가능한 이벤트로 남도록 해야 한다.
- issue-005 (medium): Routing, ECO, Part, BomLine의 lifecycle 모델이 생성, release, apply 전반부에 머물러 운영 종료와 사후 정정 구간을 표현하지 못하는 material 이슈입니다.
  - root cause: 핵심 마스터 데이터 lifecycle을 생성, release, apply 전반부 상태 중심으로만 모델링하고 종료·폐기·단종·정정·재발행 구간을 상태나 전이 이벤트로 닫지 않았다.
  - materiality: 선언된 목적은 품목, BOM, 라우팅, 변경관리의 전 lifecycle 기준을 제공하는 것입니다. 그러나 품목 단종, 라우팅 폐기, BOM line 대체 종료, 적용된 ECO의 정정 또는 재발행 같은 운영 후반부 상태를 담지 못하면 MES와 PLM이 사용 가능 여부와 상태 의미를 일관되게 판단하기 어렵습니다.
  - action: Part, BomLine, Routing, ECO에 공통 lifecycle 범주를 정리하고 obsolete, superseded, archived, cancelled, revised 같은 종료·정정 상태를 추가하거나 상태 전이 이벤트로 모델링해야 합니다. 특히 현재 enum을 단순 확장하는 데 그치지 말고 applied 이후 correction/reissue 이력을 기록할 수 있는 전이 구조를 함께 설계해야 합니다.
- issue-006 (medium): released routing 이후 생산오더와 실행 결과가 어떤 품목 revision, BOM, routing, 대체품, 검사계획 기준으로 수행되었는지 잇는 최소 execution bridge와 as-planned/as-built traceability가 없어, PLM/MES 통합 목적의 제조 운영 위험 검토가 실행 단계까지 이어지지 않는다.
  - root cause: PLM 기준정보 엔티티 중심으로 범위를 구성하면서 MES 실행 bridge 엔티티를 포함하지 않아 생산오더와 실제 실행 결과가 기준정보와 연결되지 않는다.
  - materiality: 문서 목적은 PLM/MES 통합의 개념 기준으로 제조 운영 위험까지 검토 가능하게 하는 것이다. 그러나 현재 범위가 기준정보 중심에 머물러 생산오더, 로트/배치, 자재소비, 공정실적, as-built genealogy 같은 실행 인스턴스와 결과를 담지 못하므로, released routing이 실제 생산으로 전이된 뒤 변경 적용, 대체품 사용, 검사 결과, 실행 기준 재현을 추적할 수 없다.
  - action: 전체 MES 도메인을 넓게 추가하기보다, 다음 단계에서 최소 실행 bridge를 우선 추가해야 한다. ProductionOrder, Lot/Batch, AsPlannedBOM/RoutingSnapshot, MaterialConsumption, OperationExecution/Result, AsBuiltGenealogy를 기준정보 snapshot과 연결해 생산오더가 어떤 기준으로 계획·실행·소비·검사·구성되었는지 추적 가능하게 해야 한다. 범위를 기준정보로 제한할 의도라면 생산오더 생성 언급을 외부 의존으로 명확히 표시해야 한다.
- issue-008 (medium): AlternatePart의 대체 방향성 권위가 엔티티 속성(`direction`, `primary_ref`, `alternate_ref`)과 단축 `Part -> Part alternate_of` relation 사이에 갈라져 있어, 표준 relations 그래프만으로 대체 관계의 유효 방향을 일관되게 검증하거나 순회하기 어렵다.
  - root cause: AlternatePart 대체 관계를 방향성 속성을 가진 엔티티와 단축 Part-to-Part relation으로 나누어 표현하면서 방향성의 단일 구조 권위를 정규화하지 않았다.
  - materiality: 이 온톨로지는 PLM/MES 통합에서 대체 부품 관계의 유효 방향과 연결 구조를 일관되게 판정해야 한다. 그런데 `AlternatePart`가 기본값 또는 허용값으로 `one_way`를 가질 수 있으면서 정의상으로는 항상 대칭 관계처럼 설명되고, relations 그래프는 방향성 속성을 가진 `AlternatePart` 엔티티를 우회한다. 그 결과 구매, 생산, 변경 영향 범위 판단에서 같은 대체 관계가 단방향인지 양방향인지, 어떤 구조를 기준으로 검증해야 하는지 시스템마다 다르게 해석될 수 있어 통합 계약의 신뢰성이 약해진다.
  - action: 대체 관계의 표준 구조를 하나로 선택해 정규화해야 한다. `relations`에 `AlternatePart -> Part` 연결을 추가해 `primary_ref`와 `alternate_ref`를 명시하고 `direction`을 그 연결 엔티티의 권위로 삼거나, 반대로 단축 `Part -> Part alternate_of`를 제거하고 `AlternatePart`를 관계의 표준 연결 엔티티로 삼아야 한다. 항상 대칭 관계가 의도라면 `direction`에서 `one_way`를 제거하고 기본값을 `bidirectional`으로 맞추는 정합성 정리도 함께 필요하다.
- issue-010 (medium): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 검사 계획 문서/파라미터와 라우팅 실행 공정 단계를 같은 타입으로 취급하여, PLM/MES 통합에서 분리되어야 할 품질 기준 관리와 라우팅 실행 관리를 혼동하게 만든다.
  - root cause: 검사 수행 행위와 검사 계획 문서/파라미터를 같은 하위유형 계층에 배치해 계획 객체를 실행 공정 단계로 취급했다.
  - materiality: 이 이슈는 라우팅과 검사 계획을 의미적으로 구분하려는 목적을 직접 약화한다. 검사 기준 변경, 샘플링 룰 변경, 라우팅 공정 변경은 서로 다른 생명주기와 변경관리 기준을 가져야 하는데, InspectionPlan is_a Operation 관계는 이들을 같은 실행 공정 유형으로 처리하게 만들어 배포, 추적성, 변경 영향 판단을 부정확하게 할 수 있다.
  - action: InspectionPlan은 독립 엔티티로 분리하고, Operation 또는 별도 InspectionOperation이 inspection_plan_ref로 이를 참조하게 해야 한다. 검사 실행 단계가 필요하면 InspectionOperation is_a Operation으로 실행 행위를 표현하고, 검사 기준·샘플링 룰·파라미터는 InspectionPlan에 남겨 변경관리와 추적성의 기준을 분리해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: resolved
- issue-002: resolved
- issue-003: no-deliberation-needed
- issue-004: resolved
- issue-005: no-deliberation-needed
- issue-006: narrowed
- issue-008: no-deliberation-needed
- issue-010: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리 정합성과 제조 운영 위험 감소를 제공하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목·BOM·라우팅·변경관리의 정합성과 제조 운영 위험을 줄이는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목 revision과 ECO 적용 기준을 일관되게 제공하는 목적 Source finding context: PLM/MES 통합에서 ECO effective-date 이후 생산분과 품목 리비전의 기준을 일관되게 해석하는 것. Source finding context: BOM·라우팅·변경관리 개념의 정합성을 바탕으로 PLM/MES 통합 기준을 제공하는 목적 Source finding context: 라우팅과 표준시간을 MES 생산 실행 및 표준원가 계산의 안정적인 통합 기준으로 쓰는 것.
- issue-007: PLM/MES 통합의 개념 기준 문서로서 BOM 전개, 라우팅, 구성 의미, 변경 영향 분석이 안정적으로 작동하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 BOM 전개, 라우팅, 변경 영향 분석이 안정적으로 확장되는 것. Source finding context: BOM 구조를 PLM/MES 통합의 기준으로 사용해 구성 전개, 생산 오더 생성, 자재 소요 계산을 안정적으로 수행하는 목적. Source finding context: BOM과 공정/라우팅의 의미 경계를 PLM/MES 통합 기준으로 제공하는 목적.
- issue-009: PLM/MES 통합의 개념 기준 문서에서 품목 대체 관계의 의미 기준을 제공하는 목적.
- issue-002: PLM/MES 및 주변 장부 간 기준 데이터의 precedence와 scope control을 제공하는 목적. Source finding context: BOM·공정 온톨로지를 PLM/MES 통합 기준으로 사용하고 제조 운영 위험을 검토 가능하게 만드는 목적.
- issue-003: PLM/MES 통합 기준 문서로서 수량·능력·공정 데이터를 일관되고 확장 가능하게 해석하게 하는 목적. Source finding context: PLM/MES 통합 기준 문서로서 수량·능력·공정 데이터를 일관되게 해석하게 하는 목적. Source finding context: 품목·공정·작업장 데이터가 PLM/MES와 계획·원가 계산에서 확장 가능한 기준으로 쓰이는 것. Source finding context: 작업장 능력 개념을 라우팅 및 생산계획 통합 기준으로 명확히 정의하는 목적.
- issue-004: 제조 운영 위험을 중심으로 한 PLM/MES 통합 개념 기준 문서의 통제 가능성.
- issue-005: 품목·BOM·라우팅·변경관리의 전 lifecycle 기준을 제공하는 목적.
- issue-006: PLM/MES 통합의 개념 기준 문서로서 제조 운영 위험까지 검토 가능한 범위를 제공하는 목적.
- issue-008: PLM/MES 통합의 품목 대체 기준 문서로서 대체 부품 관계의 유효 방향과 연결 구조를 일관되게 판정하는 목적. Source finding context: PLM/MES 통합의 품목 대체 기준 문서로서 대체 부품 관계의 유효 방향을 일관되게 판정하는 목적. Source finding context: PLM/MES 통합의 개념 기준 문서로서 품목 대체 관계를 일관되게 연결하고 검증하는 목적
- issue-010: 라우팅과 검사 계획을 PLM/MES 통합 기준에서 의미적으로 구분하는 목적.

## Final Review Result
10 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO effective_date, Part.rev 주간 동기화, BOM/routing 현재 구조, released Routing 상태가 서로 분리되어 있어 변경 전후 생산분에 적용할 품목 revision, BOM 구성, 라우팅/표준시간 기준을 온톨로지 내부의 일관된 이력으로 재구성할 수 없습니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_before_release, follow_up
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-002 (medium): fix_before_release, follow_up
- issue-003 (medium): fix_before_release, follow_up
- issue-004 (medium): fix_before_release, follow_up
- issue-005 (medium): fix_before_release, follow_up
- issue-006 (medium): follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up

## Recommendations
- issue-011 (medium): BomLine의 parent_ref 연결이 relations 목록에 명시되어 있지 않아 BOM 라인에서 상위 조립품으로 돌아가는 구조적 경로가 불완전하다. Source finding context: manufacturing-bom-ontology.yaml entities.BomLine / relations Source finding context: .onto/review/20260610-36ef1faa/execution-preparation/materialized-input.md:29-35,84-86 Source finding context: BomLine의 parent_ref 연결이 relations 목록에 명시되어 있지 않습니다. Source finding context: BOM 라인은 정의상 상위 품목과 하위 품목의 연결 단위입니다. 하위 품목 연결은 관계 목록에 반영되어 있지만 상위 조립품 참조는 속성에만 존재하고 관계 그래프에는 빠져 있어, BOM 라인을 기준으로 부모 조립품을 추적하거나 고아 BomLine을 검증하는 구조적 경로가 불완전합니다. Source finding context: `relations`에 `{ from: BomLine, to: Assembly, kind: references_parent }` 같은 parent_ref 대응 관계를 추가하거나, `Assembly -> BomLine has_many`가 parent_ref의 유일한 권위라는 점을 명시하고 `BomLine.parent_ref`와의 중복/동기화 규칙을 정합니다. Source finding context: .onto/review/20260610-36ef1faa/round1/structure.findings.yaml#structure-candidate-002 Source finding context: BOM 구조를 PLM/MES 통합의 기준 그래프로 제공하는 목적 Source finding context: BOM 라인을 독립 레코드로 수신하거나 검증할 때 관계 그래프만으로 parent Assembly 연결을 확인해야 하는 경우 Source finding context: 하위 품목 경로는 닫혀 있지만 상위 품목 경로가 relations에 닫히지 않아, 고아 BOM 라인 검출과 양방향 BOM 탐색의 신뢰가 낮아집니다. Source finding context: BomLine의 속성 참조와 relations 그래프 사이에 parent_ref 대응 관계가 누락되었습니다. Source finding context: `BomLine`은 `parent_ref`로 `Assembly`를, `child_ref`로 `Part`를 참조합니다. Source finding context: `relations`는 `BomLine -> Part` child 관계만 명시하고 `BomLine -> Assembly` parent 관계를 명시하지 않습니다. Source finding context: 그 결과 BOM 라인에서 상위 Assembly로 돌아가는 필수 구조 연결이 관계 목록 기준으로 누락됩니다.

## Unique Finding Tagging
- issue-011 (medium): BomLine의 parent_ref 연결이 relations 목록에 명시되어 있지 않아 BOM 라인에서 상위 조립품으로 돌아가는 구조적 경로가 불완전하다. Source finding context: manufacturing-bom-ontology.yaml entities.BomLine / relations Source finding context: .onto/review/20260610-36ef1faa/execution-preparation/materialized-input.md:29-35,84-86 Source finding context: BomLine의 parent_ref 연결이 relations 목록에 명시되어 있지 않습니다. Source finding context: BOM 라인은 정의상 상위 품목과 하위 품목의 연결 단위입니다. 하위 품목 연결은 관계 목록에 반영되어 있지만 상위 조립품 참조는 속성에만 존재하고 관계 그래프에는 빠져 있어, BOM 라인을 기준으로 부모 조립품을 추적하거나 고아 BomLine을 검증하는 구조적 경로가 불완전합니다. Source finding context: `relations`에 `{ from: BomLine, to: Assembly, kind: references_parent }` 같은 parent_ref 대응 관계를 추가하거나, `Assembly -> BomLine has_many`가 parent_ref의 유일한 권위라는 점을 명시하고 `BomLine.parent_ref`와의 중복/동기화 규칙을 정합니다. Source finding context: .onto/review/20260610-36ef1faa/round1/structure.findings.yaml#structure-candidate-002 Source finding context: BOM 구조를 PLM/MES 통합의 기준 그래프로 제공하는 목적 Source finding context: BOM 라인을 독립 레코드로 수신하거나 검증할 때 관계 그래프만으로 parent Assembly 연결을 확인해야 하는 경우 Source finding context: 하위 품목 경로는 닫혀 있지만 상위 품목 경로가 relations에 닫히지 않아, 고아 BOM 라인 검출과 양방향 BOM 탐색의 신뢰가 낮아집니다. Source finding context: BomLine의 속성 참조와 relations 그래프 사이에 parent_ref 대응 관계가 누락되었습니다. Source finding context: `BomLine`은 `parent_ref`로 `Assembly`를, `child_ref`로 `Part`를 참조합니다. Source finding context: `relations`는 `BomLine -> Part` child 관계만 명시하고 `BomLine -> Assembly` parent 관계를 명시하지 않습니다. Source finding context: 그 결과 BOM 라인에서 상위 Assembly로 돌아가는 필수 구조 연결이 관계 목록 기준으로 누락됩니다.

## Shared Phenomenon Summary
- none
