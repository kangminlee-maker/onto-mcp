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
- issue-001 (high): ECO 효력 발생 후 Part.rev 주간 동기화 전까지 권위 있는 생산 리비전과 생산 차단 여부를 결정할 수 없는 high severity 결함이다.
  - root cause: 변경 효력성과 품목 리비전을 일관된 시간·권한 모델로 결합하지 않고 서로 다른 원본과 주간 배치에 맡긴 것이 ECO 효력 후 생산 리비전 충돌을 일으킨다.
  - materiality: 이 공백에서는 동일 생산분에 대해 PLM의 신규 리비전 효력과 MES의 구 Part.rev가 충돌하여 구 리비전 생산이나 추적 불가능한 예외가 발생할 수 있다. 따라서 품목·변경관리 정합성을 갖춘 PLM/MES 통합 개념 기준을 제공한다는 선언된 목적이 직접 약화된다.
  - action: 먼저 설계변경 적용을 Part.rev의 복사값이 아니라 버전과 효력구간을 가진 명시적 관계로 모델링하고, 권위 있는 생산 적용 리비전과 동기화 확인 상태를 정의해야 한다. 이어 신규 리비전 동기화가 확인되기 전에는 관련 생산 릴리스를 차단하고, 불가피한 경우에만 추적 가능한 명시적 예외 승인을 요구해야 한다. 이 순서가 필요한 이유는 생산 통제가 먼저 정의된 권위·효력 관계를 기준으로 판단해야 하기 때문이다.
- issue-004 (high): 불변 revision·효력구간과 ECO의 변경 전후 revision 연결이 없어 특정 생산 시점의 유효 품목·BOM·Routing 구성과 적용 revision을 결정하거나 재현할 수 있는 명시적 기준이 없다.
  - root cause: 변경 가능한 품목·BOM·Routing을 연결 가능한 불변 revision과 효력구간 없이 현재 상태로만 표현한 것이 과거 구성 재현 부재와 ECO→신규 리비전 경로 단절을 함께 만든다.
  - materiality: 이 결함은 PLM과 MES가 공유해야 할 제조 기준을 시점별로 유일하게 결정하지 못하게 한다. 그 결과 ECO 발효 전후나 동기화 지연 기간에 동일 생산분에 서로 다른 BOM·Routing 또는 revision이 적용될 수 있으며, 과거 구성 감사·재현과 구 revision 생산 통제도 불가능해지므로 선언된 통합 목적을 직접 약화한다.
  - action: 먼저 품목·BOM·Routing에 연결 가능한 불변 revision과 명시적 효력 시작·종료 구간을 도입해야 한다. 이어 각 BomLine·Operation·대체 관계를 해당 revision 및 효력구간에 귀속시키고, ECO 변경 라인을 대상 품목과 적용 전후 revision에 연결해야 한다. 마지막으로 생산 기준 시점에 유효한 구성을 유일하게 선택하는 규칙을 정의해야 PLM과 MES가 같은 revision을 적용하고 과거 구성을 재현할 수 있다.
- issue-005 (high): 제조 마스터 revision과 생산 오더·실행·자재 소비·생산 계보를 잇는 명시적 경계 계약이 없어, 실제 생산에 적용된 BOM·Routing·revision을 추적할 수 없는 high severity 문제다.
  - root cause: 온톨로지 범위가 제조 마스터 정의에서 끝나고 MES 실행 영역과의 정식 연결 계약이 모델링되지 않은 것이 실행 추적 공백을 만든다.
  - materiality: 이 문서는 PLM/MES 통합의 개념 기준을 표방하지만 현재 모델은 제조 마스터에서 끝난다. 따라서 released Routing으로 오더를 생성하고 생산 결과를 설계·공정 기준에 연결해야 할 때, 설계 기준과 MES 실행 사실 사이의 추적 계약을 제공하지 못해 선언된 통합 목적이 약화된다.
  - action: 대상 문서에서 우선 실행 영역의 소유 경계를 결정해야 한다. 내부 모델링을 선택하면 최소한 ProductionOrder, 생산 대상 revision/BOM/Routing 스냅샷, OperationExecution, MaterialConsumption, Lot/Serial genealogy와 핵심 관계를 추가해야 한다. 외부 MES 실행 온톨로지를 선택하면 동일 정보를 식별·고정·참조하는 명시적 경계 및 연결 계약을 정의해야 한다. 어느 선택이든 실제 생산 오더에서 적용 마스터와 실행 계보까지 추적 가능함을 보장해야 이 문제를 닫을 수 있다.
- issue-008 (high): 반복 변경을 견딜 불변 구성 revision과 효력 이력이 없어 두 번째 설계·BOM·라우팅 변경부터 과거 생산 구성의 연속성과 생산 시점별 유효 구성을 재현할 수 없는 high severity 이슈이다.
  - root cause: 변경 가능한 현재 상태 필드가 불변 구성 버전과 효력 이력의 원본 역할을 대신한 것이 반복 변경 후 구성 연속성 상실을 일으킨다.
  - materiality: PLM/MES 통합의 핵심 목적은 품목·BOM·라우팅·변경관리를 일관된 공통 개념으로 연결하는 것이다. 동일 품목에 여러 변경이 누적되거나 변경 전후 생산분을 함께 추적할 때 유효 구성과 실제 사용 구성을 식별하지 못하면 잘못된 BOM·라우팅이 적용되고 변경 추적이 단절되므로 그 목적이 직접 약화된다.
  - action: 먼저 BOM·Routing·Operation에 불변 구성 revision, valid_from/valid_to, lifecycle status, ECO provenance를 갖춘 공통 버전 모델을 정의하고, 다음으로 생산 오더가 정확한 released revision을 직접 참조하도록 해야 한다. current rev와 current ECO는 이 이력에서 계산되는 projection으로만 유지해야 한다. 동시에 issue-004와의 same_root_candidate 관계 또는 동등한 판정을 확보해 issue-008을 독립적으로 닫을지 issue-004의 실패 양상으로 통합할지 결정해야 하지만, 이 분류 결정과 무관하게 버전·효력 모델 보강은 필요하다.
  - unresolved disagreement: 실패와 근본 원인에는 합의했지만, evolution은 이를 독립적인 진화성 결함으로 유지하고 coverage는 issue-004의 시간·버전 모델 결함에서 파생된 양상으로 좁힌다. 두 이슈의 동일 근본 원인을 확정하는 명시적 관계가 없어 독립 이슈 유지 여부는 미해결이다.
- issue-012 (high): InspectionPlan을 Operation의 하위 유형으로 둔 현재 모델은 정보성 품질 규격과 수행·스케줄링되는 검사 활동을 동일한 유형으로 취급하는 high severity 결함이다. 특히 소비자가 이 상속을 실행 경로에 적용하면 품질 계획과 제조 실행 공정의 구분이 무너진다.
  - root cause: 정보성 검사 규격과 수행 활동인 검사 공정을 하나의 존재론적 유형으로 모델링한 것이 계획과 실행 대상의 혼동을 만든다.
  - materiality: InspectionPlan이 Routing.operations에 포함되거나 Operation 속성에 따라 실행·스케줄링되면 규격 버전, 실행 실적, 작업장 배정의 대상이 뒤섞인다. 그 결과 PLM의 품질 의도와 MES의 실제 검사 수행을 정확히 연결하고 추적해야 한다는 통합 목적이 훼손된다.
  - action: InspectionPlan을 Operation과 분리된 독립 규격 엔티티로 재분류하고, 실제 검사 Operation이 uses_inspection_plan과 같은 명시적 사용 관계로 이를 참조하도록 해야 한다. 먼저 상속에 의한 실행 대상 동일시를 제거한 뒤 명시적 참조를 연결해야 규격의 버전·수명주기와 공정의 스케줄·배정·실적을 독립적으로 관리하면서도 PLM/MES 간 추적 관계를 보존할 수 있다.
- issue-013 (high): Assembly 자기 포함 BomLine은 스크랩 재투입을 제품구조로 잘못 표현한 의미론적 증상이다. 심의에서는 issue-003과 같은 근본 결함의 medium severity 표현으로 좁혔으며, 별도 이슈의 구조적 병합은 보류했다.
  - root cause: 제품 구조 관계인 BomLine을 공정 중 회수 물질흐름까지 표현하는 범용 관계로 사용한 것이 BOM 자기 의존을 만든다.
  - materiality: PLM의 제품구조와 MES의 공정·자재 흐름이 같은 관계로 전달되면, 스크랩 재투입 품목의 BOM 전개와 자재소요·원가·생산계획 계산에서 자기 의존이 발생해 무한 전개, 잘못된 소요량 또는 시스템별 상이한 예외 해석을 유발할 수 있으므로 공유 개념 기준의 정확성을 약화한다.
  - action: 제품 BOM의 비순환 원칙을 유지하고, 회수 스크랩·재생 원료·재투입 공정은 별도의 물질흐름 또는 회수 관계로 모델링해야 한다. 수율과 재투입 위치를 그 관계에 명시해 제품구조 전개와 공정 흐름 계산을 분리해야 하며, 이후 issue-003과 issue-013 사이의 same_root_candidate 또는 동등한 동일근거 판정을 확보한 뒤 구조적 병합 여부를 결정해야 한다.
  - unresolved disagreement: 렌즈 간 남은 이견은 없으나, issue-003과의 구조적 병합은 명시적인 동일근거 관계가 없어 미해결 상태다.
- issue-002 (medium): 불량률·표준시간·원가 등 병행 관리되는 운영값에 신뢰할 원본과 파생 관계가 정의되지 않아, PLM/MES 통합 소비자가 일관된 계획·실행·원가 결과를 재현할 수 없는 medium severity 문제다.
  - root cause: 핵심 운영값을 권한·파생·동기화 계보가 있는 공유 개념으로 모델링하지 않고 수기 복사와 병행 관리에 맡긴 것이 시스템별 값 충돌과 계산 비재현성을 함께 만든다.
  - materiality: 이 문서는 BOM·라우팅과 제조 운영값의 공통 개념 및 값 권위를 제공해야 한다. 그러나 복사값·계산값·수기값이 충돌하거나 동기화가 지연될 때 선택 기준이 없어 시스템과 작업자별로 자재 소요량, 생산능력, 원가가 달라질 수 있으므로 통합 기준의 신뢰성·재현성·책임 소재가 약해진다.
  - action: 다음 통합 계산 단계 전에 공유 운영값마다 authoritative system, 단위 차원과 환산 규칙, 적용 범위와 효력 기간, derivation rule과 source value reference, synchronized timestamp 및 충돌 해결 정책을 정의해야 한다. 누적 표준시간 등 계산값은 Routing/Operation 권위값에서 생성되는 파생 projection으로 명시하고, 수기값은 별도 조정 개념으로 분리하며, 동기화 상태와 대사 실패도 표현해야 한다.
- issue-006 (medium): Routing/ECO의 철회·정정 사건과 승인·복사·동기화 행위의 감사 증거를 표현할 수 없는 medium severity의 중요 문제다.
  - root cause: 상태와 현재 값만 저장하고 lifecycle 및 통제 행위를 시간·행위자·근거가 있는 사건으로 모델링하지 않은 것이 종결·정정 표현과 감사 증거의 부재를 함께 만든다.
  - materiality: 승인 또는 release 이후 철회·단종·대체·정정이 발생하거나 수동 복사·동기화·대사 결과에 오류나 이견이 생기면, 현재 상태가 덮어써지거나 결과만 남는다. 이로 인해 변경 이력의 신뢰, 오류 귀속, 승인 검증, 재현성과 감사 가능성이 약화되어 라우팅·변경관리의 운영 일관성과 제조 운영 통제 목적을 훼손한다.
  - action: 다음 운영 단계 전에 명시적 상태 전이와 취소·거절·대체·폐기 및 correction·withdrawal·reissue 사건을 정의하고, 종결 후 허용되는 전이를 구분해야 한다. 이어 Approval/ChangeEvent 또는 AuditEvent를 통해 승인·수동 조정·복사·동기화·대사 행위를 대상 엔티티, actor, occurred_at, source, rationale, before/after 값 및 외부 근거에 연결해야 한다. 공통 사건 기반을 사용하되 lifecycle 사건과 감사 행위는 서로 다른 필수 속성과 통제를 갖도록 구분해야 한다.
- issue-007 (medium): 수량과 작업장 능력에 측정 차원·단위·환산 규칙이 연결되지 않아, PLM과 MES가 이종 단위의 BOM 소요량과 생산능력을 안전하고 일관되게 계산할 수 없는 medium severity 문제다.
  - root cause: 단위를 수량·capacity에 결합된 독립 측정 개념으로 모델링하지 않고 환산 규칙도 원본화하지 않은 것이 이종 단위 계산 불능을 만든다.
  - materiality: 상·하위 품목 또는 작업장 간 단위가 다르면 숫자는 전달되더라도 그 의미와 환산 근거를 판정할 수 없다. 그 결과 자재 부족·과다 투입이나 잘못된 능력 계획이 발생할 수 있어, BOM 수량과 라우팅·작업장 데이터를 시스템 간 일관되게 교환하고 계산하려는 목적을 직접 약화한다.
  - action: UOM과 측정 차원을 독립 개념으로 정의하고 모든 quantity·capacity 값에 단위를 필수 연결해야 한다. 이어 품목과 유효기간별 환산계수, 기준 수량, 반올림 규칙, 권위 시스템을 포함한 효력 있는 환산 규칙을 원본화하고 환산 불가 시 처리 규칙을 정해야 한다. 값 교환이나 계산 로직을 신뢰하기 전에 이 공통 기준을 먼저 확립해야 한다.
- issue-009 (medium): 새 단위와 capacity 산정 방식 추가 시 필요한 스키마·소비자 변경은 독립 근본 결함이라기보다 issue-007의 단위·환산 모델 부재가 진화 과정에서 드러난 결과인 material medium 문제다. 구조적 병합은 명시적 동일근거 관계가 없어 보류한다.
  - root cause: 측정값의 차원과 변환 규칙이 독립적이고 확장 가능한 개념으로 모델링되지 않은 것이 새 단위와 capacity 산정 방식의 안전한 확장을 막는다.
  - materiality: 서로 다른 PLM/MES가 새로운 단위, 포장·복합 단위 또는 작업장별 capacity 차원을 교환하면 기존 구조와 소비자 로직을 수정해야 한다. 단위 없는 기존 수치의 의미도 안정적으로 이관할 수 없어 계획 수량과 생산능력 계산이 달라질 수 있으므로, 시스템 간 의미를 지속적으로 정렬하려는 목적을 약화한다.
  - action: issue-007의 단위·환산 모델 개선과 함께 확장 가능한 Unit·Quantity·ConversionRule을 원본화하고 모든 측정값을 값과 단위의 결합으로 저장해야 한다. 품목·효력 구간별 변환 규칙을 관리하며 capacity에는 단위, 기간 또는 shift 기준, 산정 방식 참조를 명시하고 변환 불가 시 검증 실패로 처리해야 한다. issue-009를 issue-007과 구조적으로 병합하려면 먼저 same_root_candidate 관계 또는 동등한 명시적 동일근거 판정이 필요하다.
- issue-010 (medium): AlternatePart가 조건·효력·승인 정보를 가진 권위 있는 대체 규칙으로 연결되지 않고 관계 그래프에서도 고립되어 있어, MES가 조건별 대체 적격성과 방향을 안정적으로 판정할 수 없는 medium severity 문제다.
  - root cause: 대체 가능성을 적용 맥락과 수명주기가 있는 권위 있는 규칙으로 연결하지 않고 고정 부품 쌍과 Part→Part 단축 관계로 표현한 것이 조건부 확장과 구조 탐색을 함께 막는다.
  - materiality: PLM의 승인된 대체 정의를 MES의 실제 자재 선택 규칙으로 일관되게 전달하려면 시점·사업장·수량·승인 상태별 적격성과 관계 방향을 동일한 권위 경로에서 해석할 수 있어야 한다. 현재 모델에서는 과거와 현재의 적격성을 구분할 수 없고 relations 기반 소비자가 규칙 인스턴스와 방향을 복원하지 못하므로 자재 선택의 신뢰성과 실행 가능성이 약화된다.
  - action: 다음 단계 전에 AlternatePart를 버전 가능한 SubstitutionRule로 정립하고 primary·alternate 역할별 간선을 명시해야 한다. 이 규칙에 effectivity, site/context, priority, quantity constraint, approval 및 ECO provenance를 두어 조건별 적격성과 이력을 권위 있게 판정하도록 한다. 그 후 alternate_of와 direction은 이 규칙 경로에서 계산되는 bounded projection으로 한정하여, 소비자가 단축 표현을 별도 권위로 오인하지 않게 해야 한다.
- issue-011 (medium): AlternatePart에 필수 대칭성과 one_way 기본 방향을 함께 부여한 현재 정의는 동일 관계의 역방향 성립 여부를 일관되게 결정할 수 없는 medium severity의 형식 모순이다.
  - root cause: 대체 관계의 대칭성이라는 하나의 개념에 필수 대칭 정의와 one_way 방향 옵션을 함께 부여한 것이 논리 모순을 만든다.
  - materiality: direction이 없거나 one_way가 지정된 관계를 PLM과 MES가 각각 양방향 또는 단방향으로 해석할 수 있다. 이 차이는 대체품 승인과 자재 선택 결과를 시스템별로 달라지게 하므로, 대체 부품 관계의 공통 개념 기준을 제공하려는 목적을 약화한다.
  - action: 먼저 대체 관계의 권위 있는 의미를 하나로 확정해야 한다. 방향성 대체 승인이 의도라면 역관계는 bidirectional일 때만 성립하도록 정의를 조건화해야 한다. 모든 대체 관계가 항상 대칭이어야 한다면 one_way 값과 그 기본값을 제거해야 한다. 이 의미 결정과 모델 수정은 소비자별 매핑이나 확장보다 먼저 완료되어야 시스템 간 해석 분기를 막을 수 있다.
- issue-014 (medium): AlternatePart를 무조건 대칭 관계로 정의하면서 one_way 방향을 허용해 동일 인스턴스의 역방향 대체 가능성을 일관되게 판단할 수 없는 medium severity 문제다.
  - root cause: 대칭적 동등 대체와 방향성 대체 승인을 하나의 AlternatePart 의미로 혼합한 것이 one_way 관계의 역방향 해석 위험을 만든다.
  - materiality: PLM에서 승인한 대체 방향을 MES에 일관되게 전달해야 하지만, one_way 관계를 대칭 정의에 따라 역방향으로 해석하면 승인되지 않은 자재 투입과 시스템 간 대체 가능성 불일치가 발생할 수 있어 목적을 실질적으로 약화한다.
  - action: AlternatePart의 기본 의미를 primary_ref에서 alternate_ref로 향하는 방향성 대체 승인 관계로 명시해야 한다. 역방향 대체는 direction이 bidirectional인 경우에만 성립하도록 정의와 소비자 판단 규칙을 함께 정렬해야 PLM 승인 의도가 MES에서 일관되게 집행된다.
- issue-015 (medium): 단일 Part.rev가 도면 문서 개정과 제조 품목의 생산 적용 개정을 함께 나타내므로, 두 개정이 다르거나 ECO 효력이 동기화 사이에 발생하면 MES가 생산에 적용할 권위 있는 개정을 구분할 수 없는 medium severity 문제다.
  - root cause: 도면 문서 개정과 제조 품목의 적용 개정을 단일 Part.rev 개념으로 축약한 것이 서로 다른 개정 대상과 권위를 중첩시킨다.
  - materiality: 이 중첩은 PLM 변경관리 결과를 MES 생산 개정에 의미 손실 없이 연결하려는 목적을 약화한다. 생산 오더가 참조해야 할 품목 개정과 도면 원본의 문서 개정을 구분하지 못해 구개정 또는 미승인 개정으로 생산할 위험이 있으며, issue-001의 생산 리비전 권위 충돌을 가능하게 하는 직접 기여 원인이기도 하다.
  - action: 먼저 품목의 item_revision과 도면의 document_revision을 별도 권위 개념으로 분리하고 두 개정의 명시적 대응 관계를 정의해야 한다. 이어 ECO가 대상 품목 revision과 효력 조건을 직접 참조하도록 연결한 뒤, MES가 도면 revision을 추정값으로 사용하지 않고 해당 조건으로 생산 적용 revision을 판정하게 해야 한다. 이 순서로 개정 권위와 대응 규칙을 먼저 확립해야 issue-001의 관련 생산 리비전 충돌도 일관되게 해소할 수 있다.
- issue-016 (medium): capacity_per_shift가 산출 수량과 가용 시간을 단위 없이 함께 나타내므로 측정 차원을 구분할 수 없는 medium severity 문제이며, 목표 범위에서 반드시 수정해야 한다.
  - root cause: 산출 수량과 가용 시간이라는 서로 다른 측정 차원을 단위 없는 단일 capacity_per_shift 속성으로 모델링한 것이 용량 의미의 중첩을 만든다.
  - materiality: 개수 기반 작업장과 시간 기반 작업장의 값을 동일 필드로 스케줄링·비교·집계하면 서로 다른 물리량이 같은 측정치로 취급된다. 그 결과 부하율과 과부하 판단, 생산 일정 계산이 일관되게 재현되지 않아 PLM/MES 간 작업장 능력과 공정 부하의 신뢰성 있는 교환 목적이 훼손된다.
  - action: capacity_per_shift에 측정 차원과 UOM을 명시하고 기준 품목·시간 단위를 정의하거나, output_capacity_per_shift와 available_time_per_shift처럼 산출량 용량과 가용시간 용량을 별도 속성으로 분리해야 한다. issue-007과 공유하는 단위 모델 결손 맥락을 함께 정합화한 뒤 스케줄링·비교·집계 연산이 같은 차원의 값에만 적용되도록 해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-008: 실패와 근본 원인에는 합의했지만, evolution은 이를 독립적인 진화성 결함으로 유지하고 coverage는 issue-004의 시간·버전 모델 결함에서 파생된 양상으로 좁힌다. 두 이슈의 동일 근본 원인을 확정하는 명시적 관계가 없어 독립 이슈 유지 여부는 미해결이다.
- issue-013: 렌즈 간 남은 이견은 없으나, issue-003과의 구조적 병합은 명시적인 동일근거 관계가 없어 미해결 상태다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-008: unresolved-with-reason
- issue-012: no-deliberation-needed
- issue-013: narrowed
- issue-002: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: narrowed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: 품목·변경관리 정합성을 갖춘 PLM/MES 통합 개념 기준 제공
- issue-004: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 기준과 제조 적용 리비전 제공 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준 제공 Source finding context: 품목·변경관리 개념을 연결하여 PLM/MES 통합 기준과 제조 적용 리비전을 제공하는 목적
- issue-005: PLM/MES 통합의 개념 기준 문서
- issue-008: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준 제공 Source finding context: PLM/MES 통합에서 품목·BOM·라우팅·변경관리의 공통 개념 기준을 제공하는 목적
- issue-012: PLM/MES 통합 기준에서 품질 계획과 제조 실행 공정을 정확히 구분 Source finding context: PLM/MES 통합의 개념 기준으로서 품질 계획과 제조 실행 공정을 정확히 구분하는 목적
- issue-013: PLM 제품구조와 MES 공정·자재 흐름을 공유하는 개념 기준의 정확성
- issue-002: BOM·라우팅 및 제조 운영값에 대한 PLM/MES 공통 개념과 값의 권위 제공 Source finding context: BOM·라우팅 및 제조 운영값에 대한 PLM/MES 공통 개념 기준 제공 Source finding context: PLM/MES 및 관련 제조 시스템 간 공통 개념과 값의 권위 제공
- issue-006: 라우팅 및 변경관리의 운영상 일관성, 추적 가능성과 제조 운영 통제 Source finding context: 라우팅 및 변경관리 개념의 운영상 일관성 Source finding context: 변경관리의 추적 가능성과 제조 운영 통제
- issue-007: BOM 수량과 라우팅/작업장 데이터를 PLM과 MES 사이에서 일관되게 교환·계산
- issue-009: 서로 다른 PLM/MES의 품목 수량과 생산능력 의미를 지속적으로 정렬하는 통합 기준
- issue-010: PLM의 승인된 대체 정의를 MES의 실제 자재 선택 규칙으로 일관되게 전달 Source finding context: PLM의 승인된 대체 정의를 MES의 실제 자재 선택 규칙으로 지속적으로 전달하는 통합 기준 Source finding context: PLM/MES 통합의 개념 기준 문서로서 대체품 구조를 일관되게 전달하는 목적
- issue-011: PLM/MES 통합에서 대체 부품 관계의 공통 개념 기준 제공 Source finding context: PLM/MES 통합에서 대체 부품 관계의 공통 개념 기준을 제공하는 목적
- issue-014: PLM의 대체 승인 정보를 MES 자재 대체 판단에 일관되게 전달 Source finding context: PLM의 대체 승인 정보를 MES 자재 대체 판단에 일관되게 전달하는 목적
- issue-015: PLM 변경관리 결과를 MES 생산 개정에 의미 손실 없이 연결 Source finding context: PLM 변경관리 결과를 MES 생산 개정에 의미 손실 없이 연결하는 목적
- issue-016: PLM/MES 통합에서 작업장 능력과 공정 부하를 일관된 의미로 교환 Source finding context: PLM/MES 통합에서 작업장 능력과 공정 부하를 일관된 의미로 교환하는 목적

## Final Review Result
15 material issue(s) require attention. Highest-priority issue: issue-001 (high) — ECO 효력 발생 후 Part.rev 주간 동기화 전까지 권위 있는 생산 리비전과 생산 차단 여부를 결정할 수 없는 high severity 결함이다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 실제 PLM/MES에 별도 생산 차단 로직이 존재하는지는 경계 내 증거로 확인되지 않았으나, 개념 기준 문서 자체의 결손 판단에는 영향을 주지 않는다.
- 현재 증거 경계에서는 요청 범위를 마스터 데이터 교환에만 한정하는 별도 계약의 존재를 확인할 수 없다.
- 실제 PLM/MES가 별도 버전 스냅샷을 보유하는지는 검토 경계 밖이며, 현재 문서에는 그 스냅샷과의 연결 계약이 정의되어 있지 않다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-005 (high): fix_now, accept_risk
- issue-008 (high): fix_now, accept_risk
- issue-012 (high): fix_now
- issue-013 (high): fix_now, follow_up
- issue-002 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_now
- issue-009 (medium): follow_up
- issue-010 (medium): fix_before_release, fix_now
- issue-011 (medium): fix_now
- issue-014 (medium): fix_now
- issue-015 (medium): fix_now
- issue-016 (medium): fix_now

## Recommendations
- issue-003 (medium): 스크랩 재투입을 BOM 자기 포함으로 표현하여 제품 구성과 공정 물질흐름의 의미를 혼합한다. Source finding context: manufacturing-bom-ontology.yaml — cyclic BOM exception for scrap re-input Source finding context: .onto/review/20260718-ca026909/execution-preparation/review-value-alignment-criteria.yaml, criterion_id=user-request-intent: “품목·BOM·라우팅 … 개념의 정합성과 제조 운영 위험”; materialized-input.md, integrity_rules[0]: “BOM은 비순환이어야 한다. 단, 재생 원료 회수 공정… Assembly가 자기 하위에 자신을 포함” Source finding context: 공정상 스크랩 재투입을 품목 구조의 자기 포함으로 표현하는 국소적 편의가 BOM 기준의 의미와 운영 안정성을 훼손한다. Source finding context: 공정 흐름 또는 물질 회수라는 별도 의미를 BOM 구성 관계에 적재하면, 일반 BOM 전개 소비자는 동일 관계를 구성 수량과 재순환 흐름 중 무엇으로 해석해야 하는지 결정할 수 없다. 이는 통합 개념 기준의 명료성을 희생해 특정 공정을 간단히 표현하는 정당화되지 않은 트레이드오프다. Source finding context: BOM 구성 관계는 비순환으로 유지하고, 스크랩 발생·회수·재투입을 Routing/Operation에 연결된 별도 물질흐름 또는 부산물/회수 관계로 모델링한다. 해당 관계에 회수율, 투입 지점과 효력 조건을 둔다. Source finding context: .onto/review/20260718-ca026909/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: 정합적인 BOM·라우팅 개념을 PLM/MES 공통 기준으로 제공 Source finding context: 스크랩 재투입이 있는 품목의 BOM을 일반 전개, 소요량 계산 또는 순환 검증에 사용하는 경우 Source finding context: 동일한 자기 참조가 허용된 공정 예외인지 잘못된 순환 BOM인지 구분되지 않아 전개 실패, 무한 계산 또는 잘못된 자재 소요량으로 이어질 수 있다. Source finding context: 공정의 재순환 물질흐름을 표현할 별도 개념 없이 BOM 구성 관계를 재사용했다. Source finding context: BOM은 비순환이어야 한다는 원칙과 자기 포함 예외가 같은 규칙에 공존한다. Source finding context: 예외는 재생 원료 회수라는 공정 현상을 Assembly-BomLine-Part 구성 구조로 표현한다. Source finding context: 재투입 흐름을 표현하는 독립 관계나 엔티티가 대상 모델에 없다.
- issue-017 (low): Part manufactured_by Routing 관계명이 공정 계획을 제조 수행 주체로 표현한다. Source finding context: Part와 Routing 사이 manufactured_by 관계명 Source finding context: .onto/review/20260718-ca026909/execution-preparation/materialized-input.md:55-61,84-88 Source finding context: `Part manufactured_by Routing`은 라우팅 계획을 제조 수행 주체로 표현한다. Source finding context: `manufactured_by`는 대상이 제조 행위자나 실행 공정에 의해 생산된다는 의미를 암시한다. Routing은 실행 주체가 아니라 준거가 되는 공정 계획이므로, 관계명이 그대로 통합 매핑되면 계획과 실행을 혼동한다. Source finding context: 관계를 `has_manufacturing_routing` 또는 `manufactured_according_to`로 바꾸고, 실제 제조 실행이 필요하면 별도 생산 오더·공정 실행 개념과 연결한다. Source finding context: .onto/review/20260718-ca026909/round1/semantics.findings.yaml#semantics-candidate-006

## Unique Finding Tagging
- issue-003 (medium): 스크랩 재투입을 BOM 자기 포함으로 표현하여 제품 구성과 공정 물질흐름의 의미를 혼합한다. Source finding context: manufacturing-bom-ontology.yaml — cyclic BOM exception for scrap re-input Source finding context: .onto/review/20260718-ca026909/execution-preparation/review-value-alignment-criteria.yaml, criterion_id=user-request-intent: “품목·BOM·라우팅 … 개념의 정합성과 제조 운영 위험”; materialized-input.md, integrity_rules[0]: “BOM은 비순환이어야 한다. 단, 재생 원료 회수 공정… Assembly가 자기 하위에 자신을 포함” Source finding context: 공정상 스크랩 재투입을 품목 구조의 자기 포함으로 표현하는 국소적 편의가 BOM 기준의 의미와 운영 안정성을 훼손한다. Source finding context: 공정 흐름 또는 물질 회수라는 별도 의미를 BOM 구성 관계에 적재하면, 일반 BOM 전개 소비자는 동일 관계를 구성 수량과 재순환 흐름 중 무엇으로 해석해야 하는지 결정할 수 없다. 이는 통합 개념 기준의 명료성을 희생해 특정 공정을 간단히 표현하는 정당화되지 않은 트레이드오프다. Source finding context: BOM 구성 관계는 비순환으로 유지하고, 스크랩 발생·회수·재투입을 Routing/Operation에 연결된 별도 물질흐름 또는 부산물/회수 관계로 모델링한다. 해당 관계에 회수율, 투입 지점과 효력 조건을 둔다. Source finding context: .onto/review/20260718-ca026909/round1/axiology.findings.yaml#axiology-candidate-003 Source finding context: 정합적인 BOM·라우팅 개념을 PLM/MES 공통 기준으로 제공 Source finding context: 스크랩 재투입이 있는 품목의 BOM을 일반 전개, 소요량 계산 또는 순환 검증에 사용하는 경우 Source finding context: 동일한 자기 참조가 허용된 공정 예외인지 잘못된 순환 BOM인지 구분되지 않아 전개 실패, 무한 계산 또는 잘못된 자재 소요량으로 이어질 수 있다. Source finding context: 공정의 재순환 물질흐름을 표현할 별도 개념 없이 BOM 구성 관계를 재사용했다. Source finding context: BOM은 비순환이어야 한다는 원칙과 자기 포함 예외가 같은 규칙에 공존한다. Source finding context: 예외는 재생 원료 회수라는 공정 현상을 Assembly-BomLine-Part 구성 구조로 표현한다. Source finding context: 재투입 흐름을 표현하는 독립 관계나 엔티티가 대상 모델에 없다.
- issue-017 (low): Part manufactured_by Routing 관계명이 공정 계획을 제조 수행 주체로 표현한다. Source finding context: Part와 Routing 사이 manufactured_by 관계명 Source finding context: .onto/review/20260718-ca026909/execution-preparation/materialized-input.md:55-61,84-88 Source finding context: `Part manufactured_by Routing`은 라우팅 계획을 제조 수행 주체로 표현한다. Source finding context: `manufactured_by`는 대상이 제조 행위자나 실행 공정에 의해 생산된다는 의미를 암시한다. Routing은 실행 주체가 아니라 준거가 되는 공정 계획이므로, 관계명이 그대로 통합 매핑되면 계획과 실행을 혼동한다. Source finding context: 관계를 `has_manufacturing_routing` 또는 `manufactured_according_to`로 바꾸고, 실제 제조 실행이 필요하면 별도 생산 오더·공정 실행 개념과 연결한다. Source finding context: .onto/review/20260718-ca026909/round1/semantics.findings.yaml#semantics-candidate-006

## Shared Phenomenon Summary
- none
