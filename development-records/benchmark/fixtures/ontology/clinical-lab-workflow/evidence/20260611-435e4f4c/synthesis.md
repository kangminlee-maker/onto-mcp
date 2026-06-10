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
- issue-001 (high): Post-release correction handling is materially under-modeled: a corrected LIS result can leave Report.result_status appearing finalized and clinician-trusted until delayed propagation, while the ontology also lacks versioned correction/amendment evidence to reconstruct what changed.
  - root cause: The ontology treats corrected results and amended reports as mutable status labels with delayed propagation, without a safety-preserving amendment lifecycle, stale-state boundary, or versioned correction evidence.
  - materiality: This weakens the declared purpose because the ontology is meant to be the EMR/LIS integration authority for result/report state and clinician-facing trust. If Report.result_status is authoritative but can knowingly lag behind Result.status after a correction, downstream systems may display or exchange a stale trusted status during clinical use, and audit consumers cannot preserve the meaning of earlier released reports.
  - action: Define an explicit correction/amendment lifecycle now. The repair should specify synchronous or near-real-time amendment behavior, or an explicit clinician-visible pending/stale state with precedence and maximum latency, and add versioned ResultCorrection and ReportAmendment evidence including previous/new values or statuses, reason, actor, timestamps, report version, release metadata, and links to the affected Result and Report.
- issue-002 (high): CriticalValue notification authority is materially insufficient: the ontology records only notified=true/false while the operational evidence needed for immediate critical-value handling remains outside the model.
  - root cause: The ontology keeps only a lossy CriticalValue notification boolean while notification evidence remains outside the authority model.
  - materiality: This weakens the stated purpose because the ontology is meant to serve as conceptual authority for EMR/LIS integration with operational-risk emphasis. For critical values, integrators need to know who was notified, when, by whom, through which channel, whether acknowledgement occurred, and how any external phone log reconciles with EMR/LIS state. A boolean cannot support immediate notification, audit, or cross-system consistency as an authoritative contract.
  - action: Promote critical-value notification evidence into the ontology by adding a CriticalValueNotification or NotificationEvent with notified_at, recipient, notifier, channel, acknowledgement/status, and relations to CriticalValue, Result, and Order. If the telephone log remains authoritative, model it explicitly as an external authority with reconciliation and precedence rules before relying on notified=true as an integration contract.
- issue-005 (high): Critical-value notification is materially under-modeled: the ontology treats notification as a boolean while the safety-critical communication event and its proof are outside ontology authority.
  - root cause: The CriticalValue model represents notification as a boolean and places operational proof in an external phone log not modeled by the ontology.
  - materiality: This weakens the stated purpose because EMR/LIS integration and operational risk management require shared authority over whether a critical result was actually communicated, to whom, when, by whom, by what method, with what acknowledgement, and on what evidentiary basis. A boolean cannot support reliable exchange, audit, reconciliation, or escalation for patient-safety-critical reporting.
  - action: Add a critical-value notification event or entity linked to CriticalValue, Result, Order, and Staff, with fields for notified_at, notified_by, recipient, recipient role/contact, method, acknowledgement status/time, escalation path, and evidence/source reference. This must be fixed in the target authority model so notification evidence becomes exchangeable, auditable, and reconcilable rather than remaining an external side record.
- issue-007 (high): Test와 Assay가 별도 카탈로그로 유지되지만 이를 닫는 canonical mapping이나 실행 관계가 없어, 주문 가능한 검사(Test), 실제 수행 assay, 결과(Result)를 권위 있게 연결할 수 없습니다.
  - root cause: Test and Assay are maintained as separate order/performance catalog concepts, but the ontology lacks an explicit mapping, authority, and execution relation connecting Assay into the order-to-result path.
  - materiality: 이 온톨로지의 목적은 검사 주문부터 분석 수행과 결과 보고까지 EMR/LIS 통합의 개념 권위를 제공하는 것입니다. 현재 구조에서는 신규 검사, 장비별 assay, 패널 변경, 결과 매핑이 생길 때 주문 코드와 수행 코드의 관계를 문서 내부에서 결정할 수 없어 구현자별 해석, 중복 등록 누락, 추적성 손실이 발생할 수 있습니다.
  - action: Test-Assay 사이에 canonical mapping 또는 상위 CatalogItem 개념을 추가하고, 단일 등록 권위와 버전/유효기간 의미를 정의해야 합니다. 또한 orderable Test에서 performed Assay를 거쳐 Result로 이어지는 명시적 실행 관계를 추가해, 신규 항목과 장비별 변경이 기존 주문/결과 추적성을 깨지 않도록 해야 합니다.
- issue-009 (high): Order.completed is unstable as currently defined: an Order can remain completed after a Result moves from final to corrected, even though the all-results-final condition that justified completion is no longer true.
  - root cause: Order completion is defined over mutable Result.status values without specifying whether completion is a snapshot milestone, a live invariant, or a reversible/amendable lifecycle state.
  - materiality: This weakens the ontology's purpose as an EMR/LIS integration authority because downstream systems may treat Order.completed as a closed synchronization state while Result and Report state continues to change. Consumers can therefore derive incompatible closure meanings for the same order, reducing trust in lifecycle and state synchronization semantics.
  - action: Define Order completion explicitly as either a release-time snapshot milestone or a live invariant. If it is a snapshot milestone, rewrite the rule so completion is based on all reportable results being final at release time and add separate amendment tracking for later corrections. If it is live, add reopening or amended-order transitions so corrected results can revise the Order lifecycle consistently.
- issue-003 (medium): Turnaround-time(TAT) is named as an operational metric, but its executable calculation authority remains in a downstream dashboard formula. This makes the ontology weaker as the shared EMR/LIS authority because consumers can report different TAT values while still appearing to use the same workflow model.
  - root cause: The ontology declares a TAT metric boundary but leaves executable calculation authority with a downstream dashboard formula.
  - materiality: The affected purpose is shared conceptual authority for EMR/LIS integration and operational-risk review. When TAT is not canonically defined as a derived ontology concept, operational reporting can diverge across EMR, LIS, and dashboard consumers, reducing trust in the ontology as the source of truth for shared workflow metrics.
  - action: Define TAT as a derived ontology concept before the next stage, including authoritative source fields, inclusion and exclusion rules, null and late-release handling, formula ownership, version or effective-period semantics, and allowed projections. If dashboards need local variants, model them as explicitly named non-authoritative views or overrides with clear precedence so reporting flexibility does not replace the canonical metric.
  - unresolved disagreement: No material disagreement remains; the only narrowing is that the issue is about missing calculation authority and precedence, not a proven numeric dashboard mismatch within the available boundary.
- issue-004 (medium): Specimen lifecycle is materially incomplete because the ontology ends Specimen state at analyzed while acknowledging post-analysis handling outside the authority model.
  - root cause: The ontology stops the Specimen lifecycle at analyzed and delegates post-analysis handling to departmental policy instead of modeling disposition states.
  - materiality: The declared purpose is to serve as the EMR/LIS integration concept authority for clinical lab workflow entities, relations, and states. When specimens need to be stored, retained, transferred, disposed, audited, amended, or reconsidered after analysis, downstream systems have no authoritative states or disposition evidence to exchange or interpret. That leaves operationally important lifecycle meaning to departmental policy instead of the shared ontology.
  - action: Extend Specimen with explicit post-analysis disposition states such as stored, retained, transferred, disposed, and rejected or discarded as appropriate. Add disposition evidence fields or events for disposition time, responsible actor, retention policy, and reason, so lifecycle closure is modeled before the ontology is used as the integration authority.
- issue-006 (medium): Specimen kinds, catalog-related values, and TAT authority are material modeling gaps because they are currently represented as local enum/string/formula surfaces instead of governed shared concepts that can carry ownership, mapping, version, and effective history across EMR/LIS boundaries.
  - root cause: Shared, time-dependent integration values are embedded as local fields instead of governed code or authority concepts with mappings, versions, and effective history.
  - materiality: This weakens the declared purpose of controlling EMR/LIS integration scope, precedence, and change resilience. When new specimen types, test/assay catalog changes, or TAT formula changes appear, multiple systems must reconcile the same operational meaning, but the ontology leaves that reconciliation to local fields, free strings, parallel registration, or dashboard-maintained formulas. That makes compatibility rules drift outside the ontology and makes historical reconstruction unreliable.
  - action: Promote the shared values into compact governed concepts before the next modeling stage: define reusable specimen/code concepts with labels, aliases, broad category, LIS codes, active periods, and references from Test, Specimen, and Assay; define catalog authority and mapping concepts such as TestCatalogEntry, AssayCatalogEntry, and TestAssayMapping with source system, owner, version, status, effective_from/effective_to, and deprecation rules; and define TATMetricDefinition with formula authority, version, validity period, and consuming systems. This should close the authority and history gap before downstream EMR/LIS integration rules depend on unstable local representations.
- issue-008 (medium): Result.status와 Report.result_status가 같은 결과 상태 의미를 별도 enum으로 중복 보유해, 새 상태나 외부 LIS/EMR 상태 코드가 생길 때 두 값과 동기화 규칙이 함께 흔들릴 수 있는 material issue입니다.
  - root cause: Result and Report status are duplicated as separate enum vocabularies without a single canonical status authority or precise projection boundary.
  - materiality: 이 문제는 결과/보고 상태가 EMR/LIS 간에 일관되게 진화하고 임상의에게 신뢰 가능한 상태를 제공해야 한다는 목적을 약화합니다. 상태 의미가 단일 권위가 아니라 코드명 매핑과 배치 동기화에 의존하므로, 확장 시 보고서의 권위 상태와 LIS 기록 상태가 분기할 수 있습니다.
  - action: ResultStatus를 canonical 상태 개념 또는 코드셋으로 분리하고, Report 상태는 그 canonical status의 명시적 projection이거나 별도 transition table로 정의해야 합니다. Report에 표시명이 필요하면 display mapping으로 두되, 상태 권위, projection 규칙, 동기화 지연 정책을 상태 모델 안에 포함해 다음 통합 설계가 중복 enum에 의존하지 않도록 먼저 닫아야 합니다.
- issue-010 (medium): Result.status와 Report.result_status는 같은 결과 상태를 가리키는 듯하지만 enum 이름, 권위 설명, 동기화 규칙이 서로 어긋나 있어 EMR/LIS 통합 설계에서 하나의 신뢰 가능한 상태 의미로 해석하기 어렵다.
  - root cause: The ontology duplicates the result-state concept across Result and Report while leaving the authority boundary between canonical state and clinician-facing projection unresolved.
  - materiality: 이 문서의 목적은 EMR/LIS 통합에서 결과 상태와 보고 상태를 일관되게 해석하게 하는 개념 권위 문서가 되는 것이다. 그런데 final/finalized, corrected/amended 같은 값이 동의어인지 별도 업무 단계인지 불명확하면 EMR이나 LIS가 Report.result_status를 독립 권위 값으로 구현하거나 단순 문자열 매핑으로 처리할 수 있고, 그 결과 정정 보고, 완료 판단, 상태 동기화의 신뢰도가 낮아진다.
  - action: 다음 단계 전에는 결과 상태의 canonical authority를 하나로 정해야 한다. 기본 해결은 LIS Result.status를 canonical enum으로 두고 Report.result_status를 표시/투영 필드로 명시하는 것이다. 만약 Report 상태가 별도 개념이라면 Result.status와 Report.result_status의 전이/투영 표, 지연 동기화 처리, corrected-to-amended 같은 매핑, 권위 우선순위를 명시해야 한다.
- issue-011 (medium): CriticalValue는 재사용 가능한 위험값 기준과 환자/결과별 통보 완료 상태를 한 개념에 섞고 있으므로, 위험 기준 개념과 실제 critical-result 통보 사건 개념으로 분리해야 한다.
  - root cause: CriticalValue combines threshold-rule meaning and patient/result-specific notification-event state in one concept.
  - materiality: 이 문제는 임상검사 워크플로에서 위험 결과 통보의 개념 권위와 운영 상태를 명확히 모델링하려는 목적을 약화한다. 같은 CriticalValue 인스턴스가 기준 테이블인지 환자별 통보 상태인지 불분명하면 기준 변경, 통보 이력, 통보 완료 여부의 소속이 충돌하여 위험값 알림 누락이나 이력 오염으로 이어질 수 있다.
  - action: CriticalValue를 CriticalValueRule 또는 CriticalThreshold 같은 기준 개념과 CriticalResultAlert 또는 CriticalNotification 같은 사건/통보 개념으로 분리해야 한다. notified, notified_at, recipient 및 통보 증거는 사건/통보 쪽에 두고, 기준 개념은 검사별 판정 범위와 rule 권위만 맡게 하는 것이 다음 단계의 critical-value workflow 관계를 만들기 전 필요한 정리다.
- issue-012 (medium): STAT 주문 의미가 Order.priority 값, Order.is_stat boolean, StatOrder subtype에 동시에 들어 있어 canonical 기준이 불명확합니다. 이 상태에서는 STAT 라우팅, SLA 적용, stat_reason 검증이 서로 다른 표현을 기준으로 갈라질 수 있으므로 다음 모델링 단계 전에 정리해야 하는 material issue입니다.
  - root cause: STAT is represented simultaneously as an Order priority value, a boolean flag, and a subtype, without a canonical meaning location or invariants.
  - materiality: 이 이슈는 주문 상태와 우선순위 의미를 EMR/LIS 통합에서 일관되게 전달하려는 목적을 약화시킵니다. 인터페이스나 업무 규칙이 priority, is_stat, StatOrder 중 다른 필드를 기준으로 STAT 여부를 판단하면 응급 주문이 누락되거나 중복 라우팅되고, STAT 사유 필수 검증도 빠질 수 있습니다.
  - action: STAT 표현 하나를 canonical로 선택해야 합니다. priority enum 값을 유지할지, StatOrder subtype을 canonical로 둘지 먼저 정하고, 남는 필드는 파생 projection으로 정의한 뒤 priority=stat, is_stat=true, StatOrder, stat_reason 요구 조건 사이의 불변조건을 명시해야 합니다. 이 결정이 먼저 정리되어야 라우팅, SLA, 검증 규칙이 같은 기준을 사용할 수 있습니다.
- issue-014 (medium): Issue-014는 CriticalValue가 실제 Result, Report, 통보/확인 흐름과 구조적으로 연결되지 않은 문제입니다. 위험값 판정 규칙은 존재하지만, 어떤 실제 검사 결과가 위험값을 발생시키고 그 결과가 보고 또는 책임 있는 통보 경로로 이어지는지가 온톨로지 관계 그래프 안에서 닫히지 않습니다.
  - root cause: CriticalValue is introduced as a threshold entity with a Test reference, but no relation connects actual Result instances, Reports, or notification paths to the critical-value workflow.
  - materiality: 이 문제는 임상검사 워크플로에서 위험 결과 구조와 운영 책임 경로를 설명해야 하는 개념 권위성을 약화시킵니다. 검사 결과가 위험 범위에 해당하는 상황에서 즉시 통보 여부, 보고 반영, 책임 주체를 구조적으로 검증하거나 EMR/LIS 통합 구현 기준으로 삼기 어렵기 때문입니다.
  - action: 수정은 CriticalValue를 그대로 모든 흐름에 직접 배선하기보다, 먼저 threshold rule, 실제 critical result, notification 또는 acknowledgement event 중 어느 개념이 어떤 관계를 소유할지 결정해야 합니다. 그 결정에 따라 CriticalValue/Test 적용 관계, Result가 critical-result 또는 notification을 발생시키는 관계, Report와 Staff/수신자/통보완료 상태로 이어지는 관계를 명시해 위험값 처리 경로를 닫아야 합니다.
- issue-015 (medium): Issue-015는 Order 완료 판정에 필요한 권위 있는 Result 소속 집합이 온톨로지에 정의되지 않은 중간 심각도의 구조적 결함입니다. Order에서 Result로 가는 간접 경로는 여럿 있지만, 완료 predicate가 어느 Result 집합을 기준으로 “all final”을 판단해야 하는지 닫혀 있지 않습니다.
  - root cause: Order completion requires a Result set, but the ontology does not define the authoritative relationship or snapshot that determines which Results belong to the Order for that predicate.
  - materiality: 이 문제는 상태 모델의 구조적 완결성과 EMR/LIS 연동에서 Order 완료 판정의 권위 기준을 약화합니다. 자동 완료 산정이나 EMR/LIS 간 상태 동기화에서 시스템마다 Order->Specimen->Result 또는 Order->Report->Result 중 다른 경로를 기준으로 삼을 수 있어, 같은 Order에 대해 완료 여부가 달라질 수 있습니다.
  - action: Order-to-Result의 권위 있는 membership relation을 추가하거나, “Order results are exactly union(Specimen.produces)” 같은 등가 제약을 완료 규칙 옆에 명시해야 합니다. Report.contains가 보고서에 포함된 결과의 projection이라면 완료 판정의 권위 집합과 분리해 모델링해야 하며, semantics와 logic 렌즈가 지적한 snapshot/live predicate 경계도 함께 수리 조건으로 반영해야 합니다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-003: No material disagreement remains; the only narrowing is that the issue is about missing calculation authority and precedence, not a proven numeric dashboard mismatch within the available boundary.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-007: resolved
- issue-009: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-014: narrowed
- issue-015: resolved

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the EMR/LIS integration concept authority for result/report states, clinician-facing status trust, and operational-risk review. Source finding context: Use as the conceptual authority document for EMR/LIS integration and operational-risk review. Source finding context: Use the ontology as the authoritative model for result/report states in EMR/LIS integration.
- issue-002: Conceptual authority for EMR/LIS integration with emphasis on operational risks.
- issue-005: Use the ontology as a concept authority for EMR/LIS integration and operational risk around lab reporting.
- issue-007: Provide a concept authority for EMR/LIS integration from test ordering through assay execution and result reporting. Source finding context: EMR/LIS 연동 설계의 개념 권위 문서로서 검사 주문 카탈로그와 LIS 수행 단위의 안정적 연결을 제공하는 목적. Source finding context: 검사 주문부터 분석 수행 및 결과 보고까지의 EMR/LIS 개념 권위 제공 목적. Source finding context: EMR/LIS 통합의 개념 권위 문서로서 주문 카탈로그와 LIS 수행 단위를 연결하는 구조적 완결성
- issue-009: Use of the ontology as the concept authority for EMR/LIS integration state behavior.
- issue-003: Shared conceptual authority for EMR/LIS integration and operational-risk review.
- issue-004: Use the ontology as the EMR/LIS integration concept authority for clinical lab workflow entities, relations, and states.
- issue-006: Control EMR/LIS integration scope, precedence, and change resilience for shared catalog, specimen, and operational metric concepts. Source finding context: Use the ontology to control EMR/LIS integration scope, precedence, and authoritative concepts. Source finding context: EMR/LIS 통합에서 주문 가능 검체, 채취 검체, 분석기 검체 표현을 변경에 견디게 연결하는 목적.
- issue-008: 결과/보고 상태가 EMR/LIS 간에 일관되게 진화하고 임상의에게 신뢰 가능한 상태를 제공하는 목적.
- issue-010: EMR/LIS 통합의 개념 권위 문서로 결과 상태와 보고 상태의 의미를 일관되게 해석하게 하는 목적.
- issue-011: 임상검사 워크플로에서 위험 결과 통보의 개념 권위와 운영 상태를 명확히 모델링하는 목적.
- issue-012: 주문 상태와 우선순위 의미를 EMR/LIS 통합에서 일관되게 전달하는 목적.
- issue-014: 임상검사 워크플로의 위험 결과 구조와 운영 책임 경로를 설명하는 개념 권위성
- issue-015: 상태 모델의 구조적 완결성과 EMR/LIS 연동에서 Order 완료 판정의 권위 기준

## Final Review Result
14 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Post-release correction handling is materially under-modeled: a corrected LIS result can leave Report.result_status appearing finalized and clinician-trusted until delayed propagation, while the ontology also lacks versioned correction/amendment evidence to reconstruct what changed. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- The external phone log schema and governance were outside this unit boundary, so this synthesis does not judge that system.
- No dashboard formula was available within the unit boundary, so the synthesis does not claim an observed numeric mismatch.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-002 (high): fix_now
- issue-005 (high): fix_now
- issue-007 (high): fix_now
- issue-009 (high): fix_now
- issue-003 (medium): fix_before_release, follow_up
- issue-004 (medium): fix_before_release, follow_up
- issue-006 (medium): fix_before_release, follow_up
- issue-008 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-014 (medium): fix_before_release, accept_risk
- issue-015 (medium): fix_before_release, follow_up

## Recommendations
- issue-013 (low): The relation name 'produces' overstates the role of Specimen and can misattribute result-generation responsibility. Source finding context: clinical-lab-ontology.yaml: Specimen produces Result relation Source finding context: .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:54, .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:62, .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:119 Source finding context: 검체가 결과를 생산한다는 관계명은 실제 수행 주체와 의미가 맞지 않는다. Source finding context: Specimen은 결과의 물리적 원천 또는 입력 재료이지, 결과를 생산하는 수행 행위나 분석 절차가 아니다. 'produces'는 산출 주체를 의미하므로 결과 생성 책임과 과정이 Specimen에 귀속되는 듯한 잘못된 의미를 만든다. Source finding context: Specimen -> Result는 source_for, specimen_for, derived_into 같은 원천 관계로 바꾸고, 결과를 산출하는 수행 단위는 Test/Assay/Observation 또는 별도 TestRun/AssayRun 개념에 연결한다. Source finding context: .onto/review/20260611-435e4f4c/round1/semantics.findings.yaml#semantics-candidate-005

## Unique Finding Tagging
- issue-013 (low): The relation name 'produces' overstates the role of Specimen and can misattribute result-generation responsibility. Source finding context: clinical-lab-ontology.yaml: Specimen produces Result relation Source finding context: .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:54, .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:62, .onto/review/20260611-435e4f4c/execution-preparation/materialized-input.md:119 Source finding context: 검체가 결과를 생산한다는 관계명은 실제 수행 주체와 의미가 맞지 않는다. Source finding context: Specimen은 결과의 물리적 원천 또는 입력 재료이지, 결과를 생산하는 수행 행위나 분석 절차가 아니다. 'produces'는 산출 주체를 의미하므로 결과 생성 책임과 과정이 Specimen에 귀속되는 듯한 잘못된 의미를 만든다. Source finding context: Specimen -> Result는 source_for, specimen_for, derived_into 같은 원천 관계로 바꾸고, 결과를 산출하는 수행 단위는 Test/Assay/Observation 또는 별도 TestRun/AssayRun 개념에 연결한다. Source finding context: .onto/review/20260611-435e4f4c/round1/semantics.findings.yaml#semantics-candidate-005

## Shared Phenomenon Summary
- none
