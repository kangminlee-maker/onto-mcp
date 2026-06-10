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
- issue-001 (high): Issue-001 is a high-materiality authority/trust issue: Result.status and Report.result_status duplicate the same clinical status authority without a canonical status concept or explicit mapping and synchronization invariant, so clinician-facing report state can become stale or diverge from LIS truth.
  - root cause: Result.status and Report.result_status duplicate one status authority across LIS and clinician-facing report surfaces without a canonical status model, explicit mapping, or bounded synchronization rule.
  - materiality: This weakens the ontology's declared purpose as the EMR/LIS concept authority for result status and clinician-trusted report state. If Report.result_status is treated as the trusted clinician-facing value while corrections or future status additions depend on delayed or implicit synchronization, the ontology can authorize a report state that no longer reflects the current LIS result.
  - action: Define a canonical result status concept or explicit StatusMapping contract that covers Result status, Report display status, authority source, transition conditions, synchronization SLA, and pending or failed synchronization states. This should be fixed in the target before release because downstream report trust depends on knowing which state is authoritative, how quickly corrections must propagate, and what clinicians see while propagation is pending or failed.
- issue-004 (high): Issue-004는 CriticalValue를 독립적인 안전 범위/통보 상태 플래그로만 모델링해, 실제 Result/Report 흐름과 통보 증거를 연결하지 못한 고중요도 이슈입니다. 이 상태로는 EMR/LIS가 critical value 통보 완료 여부를 신뢰하더라도 책임자, 시각, 수신자, 승인, 근거를 공통 모델 안에서 재구성할 수 없습니다.
  - root cause: CriticalValue was modeled as a standalone safety range/status flag rather than as a connected notification/result workflow event with auditable evidence.
  - materiality: 대상 온톨로지는 검사 결과 워크플로우와 EMR/LIS 통합 위험의 개념 권위로 쓰이는 것이 목적입니다. Critical value 통보는 환자 안전과 감사 가능성에 직접 연결되는데, 현재 모델은 통보 완료 판단을 `notified` boolean 및 외부 전화 기록에 의존하게 만들어 통보 누락, 지연, 분쟁, 책임 추적을 공유 그래프 안에서 검증하지 못하게 합니다.
  - action: `CriticalValueNotification` 또는 일반화된 `NotificationEvent`를 추가해 `critical_value_ref` 또는 `result_ref`, `notified_at`, `notified_by`, `recipient`, `channel`, `acknowledged_at`, `outcome`, `evidence_ref`를 모델링해야 합니다. 또한 CriticalValue와 Result/Report 흐름을 관계로 연결해야 하며, `CriticalValue.notified`는 이 이벤트에서 파생되는 값으로 정의하거나 제거해야 합니다. 통보가 의도적으로 외부 시스템 권위라면 최소한 `Notification/CommunicationRecord` 참조나 명시적 boundary relation으로 범위를 안정화해야 합니다.
- issue-002 (medium): CriticalValue.notified를 단순 boolean으로 두면 critical-value 통보의 행위, 시각, 통보자, 수신자, 채널, 확인, 증거, 조정 권한을 EMR/LIS 권위 모델 안에서 판단할 수 없으므로, issue-002는 material한 notification-evidence 결함으로 유지되어야 합니다.
  - root cause: The model externalizes critical notification evidence while retaining only a lossy boolean in the ontology.
  - materiality: 검토 목적은 운영 리스크를 포함한 EMR/LIS 통합 개념 권위로서 온톨로지가 적절한지 평가하는 것입니다. Critical value는 즉시 통보가 필요한 안전 관련 상태인데, 모델이 통보 여부만 boolean으로 보관하고 who/when/recipient 같은 감사 증거를 외부 phone log로 밀어내면 통보의 적시성, 수신자, 신뢰 가능한 조정 기준을 권위 표면에서 확인할 수 없습니다. 그 결과 통합 시스템은 안전상 중요한 상태를 검증 가능한 workflow evidence가 아니라 손실된 플래그로만 보게 됩니다.
  - action: Critical-value notification을 first-class concept 또는 relation으로 모델링해야 합니다. 최소한 notified_at, recipient, notifier, channel, acknowledgement, evidence link, 그리고 외부 phone log와 LIS/EMR 상태를 reconcile하는 authority/precedence rule을 포함해야 합니다. 다만 이 이슈는 전체 Result/Report/CriticalValue workflow 단절이 아니라 notification evidence facet으로 좁혀졌으므로, broader workflow 수정은 issue-004와 중복되지 않게 연결하고 이 항목에서는 boolean authority gap을 닫는 것이 필요합니다.
- issue-003 (medium): Issue-003 stands: TAT is treated as a shared operational metric but its calculation authority is left to external dashboard formulas, so the ontology does not currently provide a trustworthy canonical basis for EMR/LIS reporting.
  - root cause: TAT is defined from ontology timestamps but calculation authority, policy, version, and precedence are delegated to external dashboard formulas.
  - materiality: This is material because the declared purpose is for the ontology to act as the concept authority for EMR/LIS operational metrics with bounded scope and precedence. If dashboard TAT can differ from the ontology's collected_at-to-released_at definition, operational reporting, SLA-like interpretation, and auditability can drift across dashboard, EMR, and LIS consumers.
  - action: Decide whether TAT is canonical or explicitly non-authoritative. If canonical, model it as an ontology-owned operational metric with source timestamp bindings, calculation policy and version/effective period, computed_at, computed_by/system, recomputation triggers, dashboard projections, and divergence/reconciliation rules; if non-authoritative, scope that limitation clearly so consumers do not treat dashboard values as ontology-governed truth.
- issue-005 (medium): Specimen lifecycle이 `analyzed`에서 사실상 끝나 현재 온톨로지는 분석 이후 보관, 이관/반출, 가용성, 폐기 상태를 EMR/LIS 공통 권위 모델로 표현하지 못한다. 따라서 재검, 결과 정정, 감사 시점에 검체가 아직 사용 가능한지와 폐기 책임이 시스템마다 다르게 해석될 수 있으므로 중간 수준의 material issue로 유지된다.
  - root cause: Specimen lifecycle is scoped only through analysis and leaves post-analysis retention, transfer, and disposal outside the ontology state model.
  - materiality: 선언된 목적은 최초 분석 흐름을 넘어서 결과 정정, 재검, 감사에 필요한 검체 상태를 EMR/LIS가 공통으로 해석하게 하는 것이다. 그러나 분석 이후 보관·폐기가 부서 내규에만 맡겨지고 온톨로지 상태나 관계로 표현되지 않으면, 재검 가능성, 폐기 완료 여부, 보관 위치와 책임 근거를 공통 모델에서 판단할 수 없다. 이 때문에 운영 시스템 간 상태 재구성과 감사 추적이 갈라져 목적 달성이 약해진다.
  - action: Specimen lifecycle에 `stored`, `retained`, `released/transferred`, `disposed`, `discard_blocked` 같은 post-analysis 상태 또는 이벤트를 추가해야 한다. 함께 보관 위치, 보관 시작/종료 시각, 폐기 시각, 폐기 승인과 근거, 관련 정책 참조를 표현해 부서 내규가 상태 전이 규칙의 파라미터로 연결되게 해야 한다. 이는 release 전 fix-now 성격의 보완이며, workflow 권위 모델이 재검·정정·감사까지 닫히도록 하는 선행 작업이다.
- issue-006 (medium): Issue-006은 Test/Assay의 개념 경계, 매핑 권위, lifecycle, 워크플로 연결, Result 산출 provenance가 함께 닫히지 않은 material 이슈입니다. 이는 형식적 모순이라기보다 EMR 주문 카탈로그와 LIS/분석기 수행 카탈로그를 공유 권위로 연결하기에 과소정의된 상태입니다.
  - root cause: The ontology has not resolved whether Test and Assay are distinct concepts or projections of one catalog item, so no authoritative relation between them is defined. / Assay was promoted to a standalone entity but not integrated into the authoritative workflow/catalog graph through Test-Assay and Assay-Result relations. / The ontology lacks an explicit execution/provenance node such as Assay/Test execution between Specimen and Result, causing both misnamed Specimen produces Result and orphaned Assay.
  - materiality: 이 온톨로지는 Order부터 Report까지 EMR/LIS 통합의 개념 권위가 되어야 하지만, Test와 Assay가 별도 엔티티로 병행 등록되면서도 주문 코드와 수행 코드의 매핑, 유효기간, 권위 시스템, 변경/단종 lifecycle이 정의되지 않았습니다. 그 결과 신규 항목 등록, 코드 변경, 과거 결과 해석, 결과 귀속이 구현자별 로컬 해석으로 밀려 통합 오류와 카탈로그 드리프트를 만들 수 있습니다.
  - action: 먼저 Test와 Assay의 canonical 관계를 결정해야 합니다. 별도 개념으로 유지한다면 Test는 orderable catalog item, Assay는 executable analytical procedure로 정의하고 `TestAssayMapping` 또는 `CatalogItemMapping`에 `test_ref`, `assay_ref`, 유효기간, 상태, mapping type, authority system, 승인 정보를 둬야 합니다. 이어 Test-to-Assay 카디널리티와 Assay produces Result 같은 실행 관계를 추가하고, Specimen-Result는 source/provenance 관계로 정합화해야 합니다. 동의어라면 별도 엔티티를 통합하고 alias/projection만 남기는 쪽이 맞습니다.
- issue-007 (medium): Issue-007은 독립적인 root-level 결함으로 유지하기보다 issue-006 아래에 보존해야 하는 material한 카탈로그 연속성 요구사항입니다. Test와 Assay 사이의 권위 있는 매핑이 없어 신규 검사, 패널, 반사검사, 장비별 assay 변경 시 이중 등록과 불일치 위험이 생깁니다.
  - root cause: 주문 카탈로그(Test)와 수행 카탈로그(Assay)를 별도 엔티티로 두었지만 둘 사이의 권위 있는 매핑 관계를 모델링하지 않았다.
  - materiality: EMR/LIS 연동 설계의 개념 권위 문서는 주문 카탈로그(Test)와 수행 카탈로그(Assay)를 확장 가능하게 연결해야 합니다. 현재 구조는 변경 지점을 한 곳으로 수렴시키지 못하고 Test와 Assay를 각각 맞춰야 하므로, 확장 시 카탈로그 변경의 연속성, 추적성, 통합 신뢰가 약해집니다.
  - action: 필요한 조치는 issue-006의 해결 범위 안에 Test-to-Assay 수행 매핑 개념을 명시적으로 포함하는 것입니다. 이 매핑은 버전, 유효기간, 장비 또는 부서 조건, 1:N·N:1 대응을 표현해야 하며, Result가 어떤 Assay 수행에서 나온 값인지도 연결해야 합니다. 순서상 이 이슈를 별도 root로 풀기보다 broader Test/Assay authority 및 workflow 문제를 정리하면서 카탈로그 연속성 요구사항이 빠지지 않게 carry forward해야 합니다.
- issue-008 (medium): Specimen type should be treated as a shared SpecimenKind reference concept, not as separate field-local enums in Specimen/Test and free strings in Assay. The issue is material at medium severity because the current split makes new specimen subtypes and LIS/analyzer codes difficult to integrate consistently.
  - root cause: Specimen type is encoded as field-local enums or free strings instead of a reusable SpecimenKind reference concept.
  - materiality: The declared purpose is to use specimen type as a stable shared EMR/LIS integration concept across specimen records, test requirements, and assay execution. That purpose weakens when Specimen and Test require enum changes while Assay relies on string convention, because catalog updates, external code mappings, and historical interpretation can drift independently.
  - action: Introduce a shared SpecimenKind catalog/reference concept and have Specimen, Test, and Assay reference it. The catalog should carry display labels, local/LIS/analyzer/external codes, synonyms, and active periods as needed, so new specimen kinds and code mappings can be added as reference data rather than by changing unrelated fields or relying on string conventions.
- issue-009 (medium): Issue-009 is a material STAT authority issue: STAT order meaning is modeled in three places, but the ontology does not say which representation controls or how the others must stay consistent.
  - root cause: STAT order meaning is represented simultaneously as priority value, is_stat boolean, and StatOrder subtype without a canonical source or invariants.
  - materiality: This weakens the purpose of consistent EMR/LIS interpretation of order priority and emergency routing. If priority, is_stat, and StatOrder can each be treated as a valid STAT signal, routing, urgent notification, TAT calculation, and operational metrics can make different STAT decisions while still appearing compliant with the ontology.
  - action: Choose one canonical STAT representation, preferably priority=stat if priority is the control value, then define is_stat and/or StatOrder only as derived projections or deprecated aliases. If StatOrder remains, specify its creation conditions, priority invariant, transition behavior back to ordinary Order, and synchronization rules so routing, urgency, TAT, and metrics use the same authority.
- issue-010 (medium): Report-to-Result membership is materially underconstrained: a Report can contain Results without the ontology proving that each Result belongs to the Report's referenced Order, ordered Tests, and same-order Specimens.
  - root cause: The ontology declares pairwise Order, Specimen, Result, and Report edges but omits a lifecycle/membership invariant that binds Report contents back to the same order, tests, and specimens.
  - materiality: This weakens the ontology's declared purpose as the concept authority for validating Order-to-Report workflow structure. If report contents can be graph-compliant while coming from another order, EMR/LIS implementations could aggregate or accept cross-order results without violating the published contract, reducing integration trust.
  - action: Add structural invariants tying Report.contains Result to the Report's order_ref: each contained Result's test_ref must be one of Report.order_ref.ordered_tests, and each Result's derived Specimen must belong to the same Order as Report.order_ref. If the ontology needs canonical joins to express this cleanly, introduce them, such as Order has_many Result or an explicit Order orders Test relation, before relying on Report contents for validation.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- none

## Deliberation Decision
- issue-001: resolved
- issue-004: resolved
- issue-002: narrowed
- issue-003: no-deliberation-needed
- issue-005: no-deliberation-needed
- issue-006: resolved
- issue-007: narrowed
- issue-008: no-deliberation-needed
- issue-009: resolved
- issue-010: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: Use the ontology as the concept authority for EMR/LIS result status and clinician-trusted report state. Source finding context: Use the ontology as the concept authority document for EMR/LIS integration from Order through Report, with clinician-facing report status as trusted authority. Source finding context: 임상의가 신뢰하는 보고 상태와 LIS 결과 상태를 변경에도 안정적으로 연결하는 개념 권위 목적. Source finding context: EMR/LIS 통합의 개념 권위 문서로 결과 상태의 의미와 권위 값을 안정적으로 정의하는 목적.
- issue-004: EMR/LIS 통합의 개념 권위 문서로서 critical value 통보 상태와 증거를 신뢰 가능하게 공유하는 목적 / Use the ontology as an operational authority for laboratory result workflow and EMR/LIS integration risks.
- issue-002: Assess whether the ontology is appropriate as an EMR/LIS integration concept authority, especially for operational risks in entity, relation, and state models.
- issue-003: Use the ontology as a concept authority for EMR/LIS operational metrics with bounded scope control and precedence. Source finding context: Use the ontology as a concept authority for EMR/LIS integration, with bounded scope control and precedence for operational concepts. Source finding context: EMR/LIS 통합 권위 문서가 운영 지표를 일관되게 산출·해석하게 하는 목적
- issue-005: Allow EMR/LIS systems to share specimen state for result correction, retesting, and audit beyond the initial analysis workflow. Source finding context: 주문부터 보고까지뿐 아니라 결과 정정·재검·감사에 필요한 검체 상태를 EMR/LIS가 공통으로 해석하는 목적
- issue-006: EMR 주문 카탈로그와 LIS/분석기 수행 카탈로그를 일관되게 연결하는 개념 권위 목적 / EMR 주문 카탈로그와 LIS/분석기 수행 카탈로그의 의미를 연결하는 개념 권위 문서 목적. / Use the ontology as the concept authority for EMR/LIS integration from order through report. / 검체, 수행 행위, 결과 사이의 의미 관계를 정확히 정의해 LIS 워크플로 권위를 세우는 목적.
- issue-007: EMR/LIS 연동 설계의 개념 권위 문서로서 주문 카탈로그와 수행 카탈로그의 확장 가능한 연결을 제공하는 목적.
- issue-008: Use specimen type as a stable shared EMR/LIS integration concept across specimen records, test requirements, and assay execution. Source finding context: EMR/LIS 통합에서 검체 유형을 안정적인 공통 개념으로 사용하게 하는 목적.
- issue-009: Ensure EMR/LIS consumers interpret order priority and emergency routing consistently. Source finding context: 주문 우선순위와 응급 주문 의미를 EMR/LIS 양쪽에서 일관되게 해석하게 하는 목적.
- issue-010: Use the ontology as the concept authority for validating Order-to-Report workflow structure. Source finding context: Use the ontology as the concept authority for Order-to-Report workflow structure.

## Final Review Result
10 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Issue-001 is a high-materiality authority/trust issue: Result.status and Report.result_status duplicate the same clinical status authority without a canonical status concept or explicit mapping and synchronization invariant, so clinician-facing report state can become stale or diverge from LIS truth. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- none

## Immediate Actions Required
- issue-001 (high): fix_before_release, fix_now
- issue-004 (high): fix_now
- issue-002 (medium): fix_before_release, fix_now
- issue-003 (medium): follow_up, accept_risk
- issue-005 (medium): fix_before_release, fix_now
- issue-006 (medium): fix_before_release, accept_risk, fix_now
- issue-007 (medium): follow_up
- issue-008 (medium): follow_up
- issue-009 (medium): fix_before_release, fix_now
- issue-010 (medium): fix_before_release, fix_now

## Recommendations
- none

## Unique Finding Tagging
- none

## Shared Phenomenon Summary
- none
