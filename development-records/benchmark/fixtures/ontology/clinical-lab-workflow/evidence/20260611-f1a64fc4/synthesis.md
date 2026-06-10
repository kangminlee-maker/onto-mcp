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
- issue-001 (high): Result.status와 Report.result_status는 corrected/amended/finalized 같은 핵심 상태를 하나의 임상 상태처럼 다루면서도 서로 다른 vocabulary, 별도 권위 주장, 야간 지연 동기화를 허용하고 있습니다. 이 상태 모델은 단일 권위 모델 또는 명시적 매핑·전이 규칙으로 즉시 정리되어야 합니다.
  - root cause: Result.status and Report.result_status are both treated as authority-bearing representations of the same clinical state despite different vocabularies and delayed synchronization.
  - materiality: 이 온톨로지는 EMR/LIS 통합에서 검사 결과와 보고 상태의 의미, 권위, 전이 기준을 신뢰 가능하게 정의하는 개념 권위 문서입니다. 그런데 임상의가 신뢰한다고 선언된 Report.result_status가 LIS의 corrected Result.status를 즉시 반영하지 않거나 finalized로 남을 수 있으면, 문서가 임상적으로 중요한 정정 상태의 지연 불일치를 정상 설계처럼 정당화합니다. 그 결과 구현자는 임의 매핑을 만들 수 있고, 임상의는 정정 결과의 의미를 잘못 해석할 수 있어 declared purpose를 직접 약화합니다.
  - action: 우선 하나의 권위 상태 모델을 선택해야 합니다. Result와 Report가 같은 상태를 공유한다면 단일 canonical status와 즉시 전이 규칙을 두고 vocabulary를 정렬해야 합니다. 별도 개념이라면 결과 상태와 보고서 공개/수정 상태를 분리해 명명하고, corrected/amended/finalized의 의미 차이, 매핑표, 전이 조건, 지연 허용 조건을 명시해야 합니다. 또는 Report.result_status를 파생/비권위 표시값으로 재배치하고 실제 source of truth를 Result.status로 선언해야 합니다. 어떤 선택이든 corrected 발생 시 즉시 반영 또는 pending_amendment 같은 명시 상태가 필요합니다.
- issue-004 (high): CriticalValue currently mixes two different concepts: a threshold/range rule and a patient-specific critical-result notification state. Because notification is reduced to `notified`, the ontology cannot serve as a reliable EMR/LIS authority for safety-critical notification evidence and audit.
  - root cause: The CriticalValue model collapses threshold/range definition and patient-specific notification-event state into one entity, producing both semantic ambiguity and missing notification audit coverage.
  - materiality: This weakens the declared EMR/LIS integration purpose because downstream systems need shared meaning for who was notified, when, by whom, through what channel, whether acknowledgement occurred, and what evidence supports the notification. A boolean on CriticalValue cannot carry that operational audit trail, so systems may diverge on notification evidence, acknowledgement, and accountability in a safety-critical workflow.
  - action: Split the model into a threshold definition concept such as `CriticalValueRange` or `CriticalThreshold`, and a patient/result-specific event concept such as `CriticalValueNotification` or `CriticalResultNotification`. Relate the event to CriticalValue or its threshold definition, Result, Order/Patient, notifying Staff, recipient/clinician, timestamp, channel, acknowledgement status/time, and evidence/source reference; then derive or replace `notified` from this event rather than treating it as the only authority.
- issue-006 (high): issue-006은 신규 검사 항목 또는 장비별 수행 항목을 추가할 때 Test와 Assay를 이중 등록해야 하지만, 두 개념을 연결하는 내부 매핑 권위와 변경 규칙이 없어 카탈로그 확장 연속성이 깨질 수 있다는 material issue입니다.
  - root cause: New catalog item registration depends on dual Test and Assay entry without an internal authority relation or change rule.
  - materiality: 이 온톨로지의 목적은 EMR/LIS 연동 설계에서 검사 카탈로그 변경을 안정적으로 수용하는 개념 권위를 제공하는 것입니다. 그런데 주문 가능 단위인 Test와 수행 단위인 Assay가 병렬 권위처럼 존재하고, 새 항목 추가 시 어느 코드·검체·부서 표현이 우선인지 target 내부에서 판정할 기준이 없습니다. 그 결과 카탈로그 확장 시 연속성이 운영자 기억이나 외부 정비 규칙에 의존하게 되어 declared purpose를 직접 약화합니다.
  - action: 신규 항목 등록의 단일 권위 위치를 먼저 정하고, target 내부에 Test-to-Assay 매핑 관계를 추가해야 합니다. 이때 Test has_many Assay 또는 Assay implements Test 같은 관계 방향, cardinality, 코드 체계 binding, active/retired version 상태, 검체 조건의 상속 또는 override 규칙을 함께 닫아야 카탈로그 확장 시 기존 구조 수정이나 외부 운영 규칙 의존 없이 연속성을 유지할 수 있습니다.
  - unresolved disagreement: Deliberation은 high-impact catalog continuity failure를 보존하되 root mechanism을 Test/Assay mapping-authority defect로 좁혔습니다. evolution, coverage, structure는 이 framing을 수용했고, axiology, logic, semantics는 여전히 medium 수준의 mapping-authority defect로 낮추거나 좁히는 입장을 남겼습니다.
- issue-002 (medium): issue-002는 CriticalValue의 즉시 통보 책임을 온톨로지 내부에서 검증·감사 가능한 개념으로 만들지 못한 material issue입니다. 통보 여부는 boolean으로만 남고, 통보 시각·수신자·증거·실패/재시도 상태는 명시적 권위 경계 없이 외부 전화 기록 대장에 위임되어 있습니다.
  - root cause: The ontology models critical notification as a boolean attribute while delegating notification evidence to an external phone log that is not represented as an authority boundary or relation.
  - materiality: 이 온톨로지는 EMR/LIS 통합에서 임상적으로 위험한 결과의 즉시 통보 책임과 상태를 정렬하는 개념 권위 문서여야 합니다. 그런데 가장 안전상 중요한 통보 이력과 책임 상태가 내부 모델에서 표현되지 않으면 구현자는 통보 완료, 미완료, 실패, 수신 확인을 일관되게 연동하거나 감사할 수 없습니다. 따라서 즉시 통보라는 이해관계자 약속이 운영 가능한 계약이 아니라 단순 플래그와 외부 메모로 축소됩니다.
  - action: `CriticalNotification` 같은 통보 event/entity를 도입해 `CriticalValue` 또는 `Result`와 연결하고, `notified_at`, `notified_to`, `notified_by`, acknowledgement/status, failure/retry 상태를 모델링해야 합니다. 전화 기록 대장을 계속 권위로 둘 경우에는 이를 명시적 external authority로 선언하고 EMR/LIS가 소비할 최소 동기화 계약을 정의해야 합니다. 먼저 내부 event로 닫을지 외부 권위로 닫을지 결정해야 이후 관계, 상태 규칙, 감사 계약을 일관되게 설계할 수 있습니다.
  - unresolved disagreement: Deliberation은 broader authority/audit boundary failure로 좁혀 수용했지만, semantics 렌즈는 핵심 원인을 외부 권위 경계 전체가 아니라 boolean이 notification event의 의미를 담지 못하는 문제로 더 좁게 보았습니다.
- issue-003 (medium): TAT는 EMR/LIS 통합에서 공통으로 해석되어야 하는 핵심 운영 지표인데, 현재 온톨로지는 이를 governed derived metric으로 닫지 않고 대시보드 팀의 별도 계산식에 남겨 두고 있습니다. 따라서 TAT의 계산 의미와 권위가 통합 권위 문서 밖으로 드리프트되는 material issue입니다.
  - root cause: The ontology leaves a cross-system operational metric under a local dashboard formula instead of defining it as a governed derived concept or authority projection.
  - materiality: 이 온톨로지의 선언된 목적은 주문-검체-보고 흐름의 운영 의미와 지표를 일관되게 정의하는 것입니다. TAT의 시작·종료 시점, 제외 조건, STAT/urgent 처리, 정정/수정 보고 처리 기준이 문서 안에서 권위 있게 정의되지 않으면 대시보드, LIS, EMR, 부서별 계산이 달라질 수 있고, 그 결과 운영 의사결정과 지표 비교 가능성이 약해집니다.
  - action: TAT를 명시적인 파생 지표로 정의하고 source fields, inclusion/exclusion rules, STAT/urgent 처리, corrected/amended report 처리, dashboard projection 권한과 버전화된 계산 의미를 온톨로지 안에 포함해야 합니다. 만약 대시보드 공식이 실제 권위라면, 그 외부 권위 경계를 온톨로지에 명시적으로 연결해 어떤 시스템이 어떤 계산을 authoritative하게 투영하는지 드러내야 합니다.
- issue-005 (medium): Test, Assay, specimen-kind가 주문 가능 항목, 분석 수행 항목, 검체 코드 의미를 병렬로 표현하지만 이를 묶는 mapping authority와 lifecycle 규칙이 없어 EMR/LIS 통합 권위로 쓰기에는 불완전합니다.
  - root cause: Catalog and specimen-kind concepts use parallel, ungoverned representations without shared authority, mapping, version, effective-period, or retirement rules.
  - materiality: 이 이슈는 EMR 주문, LIS/분석기 수행, 검체 요구사항, 결과 매핑의 기준값을 정해야 하는 목적을 직접 약화합니다. 신규 검사·분석 항목·검체 코드가 추가되거나 기존 카탈로그가 retire/replace될 때 어느 Test, Assay, specimen-kind 값이 특정 날짜와 맥락에서 유효한 권위인지 판단할 수 없어 orderability, specimen routing, result attribution이 시스템별 해석으로 갈라질 수 있습니다.
  - action: Test와 Assay의 역할을 orderable test와 performed analyzer assay로 명확히 분리하거나 실제 동의어라면 통합해야 합니다. 분리하는 경우 TestAssayMapping 또는 별도 catalog authority를 도입해 source-of-truth ownership, mapping cardinality, aliases, version/effective date range, active/retired status를 모델링하고, SpecimenKind 같은 공통 code-set authority를 만들어 Specimen, Test, Assay가 같은 검체 권위를 참조하게 해야 합니다. 통합 설계의 다음 단계 전에 이 권위 모델을 먼저 닫아야 downstream 주문·수행·결과 관계가 안정적으로 결정됩니다.
- issue-007 (medium): Result.status와 Report.result_status가 같은 결과 상태 정보를 담는 것으로 설명되지만 서로 다른 enum과 야간 동기화 규칙으로 분리되어 있어, 상태 체계가 확장될 때 변경 호환성과 임상 표시 상태의 신뢰성이 약해진다.
  - root cause: 동일 정보라고 설명되는 상태를 두 개의 별도 enum과 지연 동기화 규칙으로 모델링했다.
  - materiality: 이 문제는 EMR/LIS 연동에서 결과 및 보고 상태 변경을 안정적으로 수용하고 임상의가 신뢰할 상태 권위를 유지하려는 목적을 약화한다. 새 결과 상태, 정정 상태 세분화, 외부 LIS 상태 코드가 추가될 때 Result enum, Report enum, 동기화 규칙을 함께 수정해야 하며, 기존 결과와 보고서가 새 상태 체계로 이동할 때 의미 연속성과 권위 판단이 불명확해진다.
  - action: 먼저 상태 권위를 하나로 정해야 한다. Report.result_status가 권위 상태의 projection이라면 Result 상태를 기준으로 명시적 projection 규칙을 두고, 별도 임상 표시 상태라면 상태 매핑 테이블, 버전, unmapped 상태 처리, 동기화 지연 중 표시 규칙을 함께 정의해야 한다. 이 순서가 필요한 이유는 권위와 projection 관계가 정해져야 새 상태 추가, 외부 LIS 코드 변경, 기존 데이터 이전 시 의미 보존 규칙을 일관되게 적용할 수 있기 때문이다.
- issue-008 (medium): TAT는 현재 collected_at부터 released_at까지 계산된다는 단서와 source timestamp는 있지만, 계산 권위가 대시보드 팀의 자체 공식에 남아 있어 target 내부의 운영 지표 개념으로 닫히지 않았다.
  - root cause: TAT를 target 내부의 파생 개념이나 규칙으로 닫지 않고 외부 팀의 자체 계산식에 맡겼다.
  - materiality: 이 문제는 운영 지표까지 포함한 EMR/LIS 통합 개념 권위 문서라는 목적을 약화한다. TAT 기준이 부서별, 우선순위별, 재검·정정 포함 여부별로 바뀌면 기존 지표와 새 지표의 비교 가능성, 버전 구분, 예외 처리가 온톨로지 밖 대시보드 계산식으로 밀려 통합 설계의 신뢰가 낮아진다.
  - action: TAT를 target 내부의 파생 지표로 명시하고 source timestamps, start/end event, 제외 조건, 버전, 부서별 override 가능 범위를 함께 정의해야 한다. 대시보드는 이 내부 규칙을 소비하는 projection으로 제한하고, 자체 권위 계산식은 제거하거나 비권위 표시로 낮춰야 한다.
- issue-009 (medium): Report finalization and amendment semantics are conflated: a report released as finalized can later be required to become amended after a corrected result, so `finalized` is not a reliable completion state unless the ontology explicitly makes it non-terminal or separates it from amendment lifecycle state.
  - root cause: One mutable Report.result_status field is used both for release-time finalization and later amendment obligations after corrected results.
  - materiality: This weakens the ontology’s purpose as an EMR/LIS status-integration authority because consumers cannot tell whether `Report.result_status=finalized` means stable completion or only a mutable display state. On the allowed corrected-after-release path, integrations may cache, close, or display reports using incompatible assumptions about whether finalized can be superseded by amended.
  - action: Separate immutable release/finalization facts from mutable amendment or display lifecycle state, such as keeping `released_at`/`finalized_at` as facts while allowing a lifecycle transition from finalized to amended. If the model intentionally treats `finalized` as non-terminal, add explicit corrected/amended precedence rules so EMR/LIS consumers know which status controls after post-release corrections.
- issue-010 (medium): STAT 긴급 주문 의미가 `Order.priority`의 `stat` 값, `Order.is_stat` boolean, `StatOrder` 하위 타입으로 동시에 표현되어 권위가 세 갈래로 나뉩니다. STAT은 하나의 canonical 표현으로 고정하고 나머지는 명시적 파생 projection 또는 제한된 확장으로 내려야 합니다.
  - root cause: STAT order meaning is represented simultaneously as a priority enum value, boolean flag, and subtype rather than one canonical concept with projections.
  - materiality: 이 문제는 EMR/LIS가 주문 우선순위, 라우팅 precedence, invalid-input behavior를 일관되게 해석해야 한다는 목적을 약화합니다. 같은 주문에서 `priority`, `is_stat`, `StatOrder`가 서로 다르거나 시스템별로 다른 필드를 STAT 권위로 삼으면 응급 라우팅, SLA 처리, 채혈 및 검사 우선순위가 통합 시스템마다 다르게 판단될 수 있습니다.
  - action: STAT의 authoritative representation을 하나로 선택해야 합니다. 권장 방향은 `priority=stat`를 canonical source로 삼고, `is_stat`는 제거하거나 `priority`에서 계산되는 derived projection으로 명시하며, `StatOrder`는 별도 타입이 아니라 `stat_reason` 같은 조건부 속성이나 STAT-specific constrained extension으로 재모델링하는 것입니다. 이 정리가 먼저 되어야 이후 라우팅 정책, SLA, 검증 규칙이 동일한 권위를 기준으로 안정적으로 연결됩니다.
- issue-012 (medium): issue-012는 하나의 material shared-root 이슈로 유지됩니다. 온톨로지가 관계와 workflow 상태를 attributes나 notes에는 인정하지만 명시적 authority model로 닫지 않아, relation graph projection과 specimen post-analysis lifecycle이 소비자마다 다르게 해석될 수 있습니다.
  - root cause: The ontology acknowledges operational workflow surfaces outside the explicit authority model, leaving consumers without authoritative state or relation closure.
  - materiality: 이 아티팩트의 선언 목적은 EMR/LIS 통합을 위한 entities, relationships, state/workflow structure의 concept authority가 되는 것입니다. 그런데 top-level relations를 canonical topology로 쓰는 구현자는 Patient, Assay, CriticalValue, Order-to-Test 같은 이미 선언된 연결을 놓칠 수 있고, 분석 이후 specimen retention, storage, disposal, rerun eligibility 같은 운영 상태도 권위 있게 재구성할 수 없습니다. 따라서 통합 매핑, graph validation, 이력 재구성이 불완전해질 수 있어 bounded concept authority로서의 신뢰를 약화합니다.
  - action: 다음 단계 전에 authority closure 방식을 결정하고 반영해야 합니다. 관계는 ref/workflow links를 top-level relations로 추가하거나, ref attributes가 authoritative relationships임을 선언하고 deterministic projection rule로 graph에 포함되게 해야 합니다. Specimen은 retained/stored, rejected/unsuitable, disposed, post-analysis retrieval/rerun eligibility 같은 disposition state 또는 event를 추가하고 departmental policy를 명시 상태나 이벤트에 연결해야 합니다.
  - unresolved disagreement: Deliberation은 이슈를 split하지 않고 하나의 shared-root authority-closure issue로 유지하되 narrowed 상태로 결론냈습니다. Structure, axiology, evolution은 shared root를 수용했고, coverage, logic, semantics는 각각 specimen lifecycle coverage, relation projection rule, authoritative relationship meaning의 sub-concern으로 수용 범위를 좁혔습니다.
- issue-013 (medium): Order.completed is under-defined because the ontology does not provide an explicit structural path from an Order's ordered tests to the Result instances that fulfill that Order.
  - root cause: The relation graph lacks an explicit Order-to-ordered-Test-to-Result membership closure for the completion rule.
  - materiality: This weakens the ontology's purpose as a workflow/state authority for EMR/LIS integration because completion is a shared state predicate. If the governed Result set is not structurally bounded, EMR, LIS, and reporting systems can evaluate the same Order against different Result collections and reach divergent completion states.
  - action: Add an explicit structural path that bounds completion evaluation, such as Result fulfills Test within Order or Order has_many Result through ordered_tests/specimens, and then rewrite the completion rule to reference that bounded path. The structural membership path should be defined before the state rule is finalized, because the rule depends on knowing which Results count for the Order.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-006: Deliberation은 high-impact catalog continuity failure를 보존하되 root mechanism을 Test/Assay mapping-authority defect로 좁혔습니다. evolution, coverage, structure는 이 framing을 수용했고, axiology, logic, semantics는 여전히 medium 수준의 mapping-authority defect로 낮추거나 좁히는 입장을 남겼습니다.
- issue-002: Deliberation은 broader authority/audit boundary failure로 좁혀 수용했지만, semantics 렌즈는 핵심 원인을 외부 권위 경계 전체가 아니라 boolean이 notification event의 의미를 담지 못하는 문제로 더 좁게 보았습니다.
- issue-012: Deliberation은 이슈를 split하지 않고 하나의 shared-root authority-closure issue로 유지하되 narrowed 상태로 결론냈습니다. Structure, axiology, evolution은 shared root를 수용했고, coverage, logic, semantics는 각각 specimen lifecycle coverage, relation projection rule, authoritative relationship meaning의 sub-concern으로 수용 범위를 좁혔습니다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-004: resolved
- issue-006: narrowed
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-012: narrowed
- issue-013: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 결과와 보고 상태의 권위·상태 모델을 신뢰 가능하게 정의하는 목적. / EMR/LIS 통합의 개념 권위 문서로서 결과 상태와 보고 상태의 의미·권위·전이 기준을 제공하는 목적.
- issue-004: Use as the EMR/LIS integration concept authority for entities, relations, and states from order through report. / 위험 결과와 통보 상태의 의미를 안전하게 교환하기 위한 EMR/LIS 개념 권위 목적.
- issue-006: EMR/LIS concept authority for stable catalog evolution when new tests or analyzer-specific assays are added. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 카탈로그 변경을 안정적으로 수용하는 목적.
- issue-002: EMR/LIS 통합에서 임상적으로 위험한 결과의 즉시 통보 책임과 상태를 개념적으로 정렬하는 목적.
- issue-003: EMR/LIS 통합에서 주문-검체-보고 흐름의 운영 의미와 지표를 일관되게 정의하는 목적.
- issue-005: EMR/LIS integration authority for orderable tests, analyzer-performed assays, specimen requirements, and catalog/code evolution. Source finding context: Use as EMR/LIS integration authority for ordering and laboratory execution concepts. Source finding context: EMR 주문 항목과 LIS/분석기 수행 항목 사이의 의미 매핑을 제공하는 목적. Source finding context: EMR/LIS 통합에서 검체 기반 주문 가능성, 수행 가능성, 결과 추적을 확장 가능한 공통 개념으로 유지하는 목적.
- issue-007: EMR/LIS 연동에서 결과 및 보고 상태 변경을 안정적으로 수용하고 임상의가 신뢰할 상태 권위를 유지하는 목적.
- issue-008: 운영 지표까지 포함한 EMR/LIS 통합 개념 권위 문서로서 변경 가능한 TAT 규칙을 일관되게 관리하는 목적.
- issue-009: EMR/LIS status integration authority for completion semantics and invalid/edge-case behavior. Source finding context: Use the ontology as the conceptual authority for EMR/LIS status integration and invalid/edge-case behavior.
- issue-010: Consistent EMR/LIS interpretation of order priority, routing precedence, and invalid-input behavior. Source finding context: 주문 상태와 우선순위의 의미를 통합 시스템에서 일관되게 해석하게 하는 목적.
- issue-012: Use as the EMR/LIS integration concept authority for entities, relationships, and state/workflow structure. / Use as a workflow concept authority for laboratory entity and state models.
- issue-013: Use as a workflow/state concept authority for EMR/LIS integration.

## Final Review Result
12 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result.status와 Report.result_status는 corrected/amended/finalized 같은 핵심 상태를 하나의 임상 상태처럼 다루면서도 서로 다른 vocabulary, 별도 권위 주장, 야간 지연 동기화를 허용하고 있습니다. 이 상태 모델은 단일 권위 모델 또는 명시적 매핑·전이 규칙으로 즉시 정리되어야 합니다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 병원 정책이나 실제 전화 기록 대장 스키마는 bounded evidence에 포함되지 않아, 결론은 온톨로지 내부의 누락된 권위 경계에 한정됩니다.
- 실제 대시보드 계산식은 허용된 입력 밖이므로, 관찰된 불일치가 아니라 권위 누락으로 인한 divergence risk로만 판단합니다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-004 (high): fix_now
- issue-006 (high): fix_before_release, accept_risk
- issue-002 (medium): fix_before_release, accept_risk, fix_now
- issue-003 (medium): follow_up
- issue-005 (medium): fix_before_release, fix_now
- issue-007 (medium): follow_up
- issue-008 (medium): follow_up
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now
- issue-012 (medium): fix_before_release, accept_risk
- issue-013 (medium): fix_before_release, fix_now

## Recommendations
- issue-011 (low): Specimen produces Result is a semantic naming issue that can mislead graph interpretation but is not shown as material under the bounded evidence. Source finding context: clinical-lab-ontology.yaml: Specimen-to-Result relation Source finding context: materialized-input.md:118-119 Source finding context: Specimen이 Result를 produces한다고 한 관계 이름은 검체의 실제 의미를 행위 주체처럼 왜곡한다. Source finding context: 검체는 결과의 원천 재료 또는 대상이지 결과를 생성하는 행위 주체가 아닙니다. 결과를 생산하는 행위는 분석 수행 또는 검사 프로세스에 가까운데, 현재 관계명은 물리적 실체인 Specimen에 생산 행위를 부여합니다. derived_from은 의미적으로 더 적절하므로 produces는 권위 문서에서 오해를 만듭니다. Source finding context: Specimen -> Result의 produces 관계를 제거하거나 source_for/input_to 같은 의미로 바꾸고, 결과 생성 행위는 Assay execution 또는 Test performance 같은 수행 개념이 담당하게 합니다. Source finding context: .onto/review/20260611-f1a64fc4/round1/semantics.findings.yaml#semantics-candidate-005

## Unique Finding Tagging
- issue-011 (low): Specimen produces Result is a semantic naming issue that can mislead graph interpretation but is not shown as material under the bounded evidence. Source finding context: clinical-lab-ontology.yaml: Specimen-to-Result relation Source finding context: materialized-input.md:118-119 Source finding context: Specimen이 Result를 produces한다고 한 관계 이름은 검체의 실제 의미를 행위 주체처럼 왜곡한다. Source finding context: 검체는 결과의 원천 재료 또는 대상이지 결과를 생성하는 행위 주체가 아닙니다. 결과를 생산하는 행위는 분석 수행 또는 검사 프로세스에 가까운데, 현재 관계명은 물리적 실체인 Specimen에 생산 행위를 부여합니다. derived_from은 의미적으로 더 적절하므로 produces는 권위 문서에서 오해를 만듭니다. Source finding context: Specimen -> Result의 produces 관계를 제거하거나 source_for/input_to 같은 의미로 바꾸고, 결과 생성 행위는 Assay execution 또는 Test performance 같은 수행 개념이 담당하게 합니다. Source finding context: .onto/review/20260611-f1a64fc4/round1/semantics.findings.yaml#semantics-candidate-005

## Shared Phenomenon Summary
- none
