# Review Lens Prompt Packet

session_id: 20260528-29cea5a1
lens_id: logic
execution_realization: worker
host_runtime: codex
review_mode: full
session_domain: software-engineering
output_path: .onto/review/20260528-29cea5a1/round1/logic.md
request_summary: Fresh verification review for the current reconstruct top-level concept discovery design patch after closing material issues from sessions 20260528-391bbc3f, 20260528-da9e31db, and 20260528-3d59d774. Confirm whether material documentation/design-contract issues remain in the current working tree diff, especially demotion bridge from prior concept IDs to lower-level detail IDs, external migration artifact refs, declared handoff question closed inventory, relation_participation as exception/projection instead of connected redeclaration, simplified README and IMPLEMENTATION_MAP authority-reference summaries, retired boundary_notes mapping, alias_changed lifecycle provenance, source_authority_scope_changed state traceability, lifecycle split/merge continuity, pressure transitions, and answerability references.

## Canonical Role
You are logic.
Execute as a ContextIsolatedReasoningUnit.
Do not read other lens outputs during Round 1.

## Role Definition Source
.onto/roles/logic.md

# logic

## Perspective

이 lens는 대상 시스템을 **형식 논리적 일관성**의 관점에서 본다. 규칙·제약·정의 사이에 논리적 모순이 존재하는지, 모든 제약이 동시에 만족 가능한지를 검증한다. 이 lens의 관심은 "선언된 규칙들이 서로 모순 없이 공존할 수 있는가"이다.

이 관점은 규칙 체계의 논리적 일관성에만 초점을 둔다. 의미 정확성이나 관계 방향성은 별도 관점의 범위이며, 같은 현상이 여러 관점에서 독립적으로 관찰될 수 있다. Lens 간 경계 및 routing 은 §Boundary routing 을 따른다.

### Observation focus

논리적 모순, 타입 불일치, 제약 간 충돌, 제약 양상(필수/가능/의무) 구분 오류.

### Assertion type

형식 진술: "X와 Y는 논리적으로 양립 불가능하다", "이 제약 집합은 동시 만족 불가능하다".

## Core questions

- 컴포넌트 정의 사이에 논리적 모순이 존재하는가?
- 속성, 타입, 범위 정의가 서로 충돌하는가?
- 모든 제약이 동시에 만족 가능한가?
- 제약 양상(necessary/possible/obligatory)이 정확히 구분되어 있는가?

## Verdict schema

이 lens는 finding 마다 verdict state 와 logic-specific 출력 필드를 보유한다. 일반 출력 스키마는 `.onto/processes/review/lens-prompt-contract.md` §8.1 을 상속하며, 아래 요소를 추가한다.

### Verdict states

- `fail` — 명시된 claim/rule 집합이 동시 만족 불가능하다는 증거가 있다
- `pass` — 제시된 범위 내에서 모순이 관찰되지 않는다 (전역 만족 가능성 증명이 아니며, boundary 내 관찰 결과이다)
- `insufficient evidence` — 판정에 필요한 claim 이 형식화되지 않았거나, domain-specific rule 의존 judgment 인데 domain document 가 없다

verdict state 는 §8.1 `claim.severity` 와 구별된다. severity 는 모순의 심각도, verdict 는 판정 자체의 상태다.

### Logic-specific output fields

각 `fail` finding 은 아래 필드를 포함한다.

- `conflict_pair` — 모순을 형성하는 claim/rule 식별자 쌍 (파일경로:라인 또는 §번호). 단일 claim 내부 모순이면 동일 식별자 쌍으로 표기
- `satisfiability_note` — 단일 claim 내부 모순(intra-claim) vs 다중 claim 간 모순(inter-claim) 구분. "inter-claim" 이면 상호작용 맥락 1문장
- `modality_note` — 충돌이 발생한 modality 축 (`necessary` / `possible` / `obligatory` / `mixed`). 충돌이 modality 구분 오류에서 기인한 경우 그 오류 유형 명시
- `boundary_handoff_note` — 모순 원인의 일부가 logic 외 lens 범위(예: naming 모호, 구조 부재)에 있다고 판단되면 해당 lens 와 routing 근거 1~2문장. 없으면 빈 문자열

### Claim unitization for prose targets

target 이 schema / model artifact 가 아닌 prose 계약 문서인 경우 claim 단위는 아래 셋 중 하나로 식별한다.

1. **Rule sentence** — "X 는 Y 이다", "X 는 Z 를 따라야 한다" 등 단일 서술
2. **Conditional rule** — "if A then B" 형식의 명시적 조건 서술
3. **Definition** — term 과 해당 정의가 한 쌍을 이루는 서술

선언적 형태가 없는 서술(설명 문단, 예시, 배경 동기)은 claim 으로 unitize 하지 않는다. 선언형으로 복구 가능한 표현이면 명시된 문장만 unitize 한다.

## Boundary routing

형식 논리적 모순이 인접 lens 범위에 걸칠 때의 primary-owner tie-breaker.

### Logic ↔ Semantics

- **logic 소유** — 모순 원인이 명시된 claim / rule 의 동시 만족 불가능에 있다
- **semantics 소유** — 모순이 동일 term 의 여러 의미 사용에서 발생한다 (naming 모호가 원인)
- **판정 기준** — 모호 제거 후에도 모순이 잔존하면 logic, 제거 시 사라지면 semantics. logic finding 은 `boundary_handoff_note` 에 semantics routing 근거 기록

### Logic ↔ Structure

- **구조 부재로 인한 unsatisfiability** (예: interface 선언만 있고 구현 부재, 필수 rule 이 적용될 target 누락) → `structure` primary. logic 은 "present claims 만으로 모순 형성 불가" 로 `insufficient evidence` 반환
- **명시 claim 과 구조 부재가 직접 모순** (예: "X 는 A 를 호출해야 한다" claim + "A 정의 부재") → logic `fail` + `boundary_handoff_note` 로 structure routing

### Logic ↔ Dependency

- **방향성으로 인한 type / range conflict** (upstream 변경이 downstream type 을 위반) → `dependency` primary. logic 은 직접 unsatisfiability 도출 불가 시 `insufficient evidence`
- **방향 무관 본질적 type 모순** (예: "X: int" + "X: string") → logic `fail`

### Logic ↔ Pragmatics

- **규칙이 실사용 맥락과 불일치** (예: rule 은 있으나 사용자가 위반 불가능한 조건) → `pragmatics` primary
- **규칙 간 형식 모순이 pragmatic 해석 여부와 독립적** → logic `fail`

## Lens reciprocity

이 role 은 `roles/semantics.md` 와 상호 거울 관계를 유지한다.

- semantics 는 name ↔ meaning 모호를 소유한다
- logic 은 모호 제거 후 잔존하는 형식 모순을 소유한다

양 방향의 경계 문서화는 두 role 모두에서 명시되어야 한다. `roles/semantics.md` 의 boundary 기술이 본 role 의 Logic ↔ Semantics 규칙과 정렬되지 않을 경우 해당 role 수정 시 동시 갱신한다.

## Domain examples

- Software: 클래스 간 타입 충돌, 인터페이스 계약 위반
- Law: 조항 간 모순, 적용 범위 불일치
- Accounting: 차변/대변 불일치, 분류 기준 충돌

## Domain document

`.onto/domains/{domain}/logic_rules.md` (`session_domain`이 설정된 경우).

`session_domain` 이 `none` 이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Fallback Rule 에 따라 domain document 없이 실행한다. 이때 logic lens 는 아래 generic check 를 수행한다.

- **Intra-claim 모순** — 동일 문서 내 단일 claim 이 자기 모순적인 경우 (예: "X 는 필수이다" 와 "X 는 금지된다" 가 동일 문서 내 공존)
- **명시된 claim 집합의 형식적 양립 가능성** — domain rule 참조 없이 claim 자체 구조만으로 unsatisfiability 판정 가능한 경우

domain rule 기반 judgment 가 필요한 finding 은 `insufficient evidence` + `upstream_evidence_required=true` 로 명시한다. 4요소 (symptom / evidence / remediation / ownership) 의 fallback mode 처리는 §9.3.2 를 따르며, 본 role 은 §9.3 의 canonical 기술을 재진술하지 않는다.


## Authoritative Artifact Inputs
- materialized input: .onto/review/20260528-29cea5a1/execution-preparation/materialized-input.md
- role definition: .onto/roles/logic.md
- interpretation: .onto/review/20260528-29cea5a1/interpretation.yaml
- binding: .onto/review/20260528-29cea5a1/binding.yaml
- review target profile: .onto/review/20260528-29cea5a1/execution-preparation/review-target-profile.yaml
- review context manifest: .onto/review/20260528-29cea5a1/execution-preparation/review-context-manifest.yaml

## Embedded Materialized Input

kind: single_text

## diff-target.patch
ref: /Users/kangmin/cowork/onto-mcp/.onto/review/20260528-29cea5a1/diff-target.patch

diff --git a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
index 0c766ca..f9c1fb0 100644
--- a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
+++ b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
@@ -13,8 +13,8 @@ The Seed is not the full ontology. It is not a complete list of entities,
 relations, actions, properties, rules, implementation details, or all possible
 evidence-backed claims. Its purpose is to identify the smallest stable set of
 top-level concepts that explains the declared purpose of the target material,
-with explicit boundaries, evidence, open questions, and deferred lower-level
-details.
+with explicit boundaries, evidence, supported questions, open questions, and
+deferred lower-level details.
 
 Top-level concepts are purpose-relative. They are not the highest possible
 abstractions in a universal hierarchy. A concept is top-level for a reconstruct
@@ -38,16 +38,22 @@ a lower-level implementation detail.
 ## 2. Ownership Boundary
 
 Runtime owns material-aware observation, source inventories, artifact refs,
-validation gates, deterministic metrics, and source frontier boundary checks.
+validation gates, deterministic metrics, source frontier boundary checks,
+artifact shape validation, evidence-ref validation, and provenance capture.
 
 The host LLM owns semantic grouping, abstraction-level judgment, top-level
 concept naming, boundary explanation, relation interpretation, convergence
-interpretation, and final user-facing explanation.
+interpretation, answerability interpretation, and final user-facing explanation.
 
 Runtime must not decide that a source symbol, spreadsheet range, document
 section, database table, UI component, or service method is a top-level concept.
 Runtime may validate that LLM-authored top-level concept artifacts cite known
-evidence refs and preserve declared artifact shape.
+evidence refs, preserve declared artifact shape, preserve relation endpoint
+integrity, and disclose unresolved pressures.
+
+Runtime may validate deterministic compactness bounds, such as count range
+warnings or duplicate labels. Runtime must not validate semantic compactness or
+purpose fitness. Those judgments remain LLM-authored and lens-reviewed.
 
 ## 3. Design-Local Terms
 
@@ -58,18 +64,158 @@ registration gate in `reconstruct-boundary-contract.md`.
 |---|---|---|
 | `TopLevelConcept` | reconstruct-local semantic artifact candidate | Purpose-relative concept that explains multiple lower-level observations and remains stable across likely implementation changes. |
 | `TopLevelConceptSet` | reconstruct-local semantic artifact candidate | Small selected set of top-level concepts for the declared purpose. |
-| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, or claim that should support a top-level concept rather than become the Seed center. |
-| `TopLevelnessPressure` | design shorthand | Unresolved reason that may change the selected concept set, concept boundary, or core relation. |
-| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, or core relations. |
+| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, section, claim, or UI detail that supports a top-level concept rather than becoming the Seed center. |
+| `FrontierPressure` | design shorthand | Lifecycle-tracked pressure record that may be open, resolved, deferred, superseded, or non-blocking, and may change the selected concept set, concept boundary, core relation, answerability, material coverage, or convergence confidence. |
+| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, canonical relations, answerability scope, or material coverage for the declared purpose. |
+| `SeedAnswerability` | design shorthand | Bounded set of questions and actions that the Seed can support for the declared purpose. |
+| `SeedLifecycle` | design shorthand | Design-local identity, provenance, and change history for concepts, relations, lower-level placements, answerability, material coverage, frontier pressure, and convergence artifacts across exploration rounds. |
 
 Do not introduce these names as TypeScript types, MCP fields, public artifact
 fields, or enum values before the concept registration gate is explicitly
-closed.
+closed. Public schema names may differ, but they must preserve the authorities
+defined in this contract.
+
+### 3.1 Obligation Status And Promotion Boundary
+
+This contract separates design authority from implementation obligation. A
+field name appearing in this document is not automatically a public schema
+field until it passes the registration and schema migration gate.
+
+Obligation statuses:
+
+| Status | Meaning |
+|---|---|
+| `current_required` | Required by the implemented runtime path now. |
+| `transitional_required` | Required while legacy and concept-centered shapes coexist, if the related behavior is claimed. |
+| `concept_centered_target_required` | Required before the concept-centered Seed shape can be called implemented. |
+| `compatibility_allowed` | Allowed as a legacy projection, but not the authority. |
+| `future_promotion_gated` | Design-local until promoted through core lexicon and public schema registration. |
+| `derived_summary` | Computed or user-facing projection from an authority seat. |
+
+Current obligation map:
 
-## 4. Discovery Strategy
+| Area | Obligation status | Authority rule |
+|---|---|---|
+| Runtime shape, evidence-ref, enum, duplicate ID, endpoint, and artifact-ref validation | `current_required` | Runtime owns deterministic validation and must fail loud when the current path claims the check. |
+| Existing `claim_id`, `entities`, `relations`, `actions`, `properties`, and `rules` fields | `compatibility_allowed` | They may remain in transitional artifacts but must not override concept-centered authorities. |
+| `migration_records` | `transitional_required` | Required when a Seed exposes both legacy and concept-centered fields or claims migration compatibility. |
+| `answerability_scope`, `top_level_concepts`, `top_level_relations`, `lower_level_detail_placements`, `frontier_pressure_log`, `material_coverage_checkpoint`, `convergence`, and `lifecycle` | `concept_centered_target_required` | Required for the concept-centered Seed target shape before implementation closure. |
+| Public TypeScript types, MCP fields, stable artifact schema fields, and core lexicon terms for the design-local names | `future_promotion_gated` | Promotion requires the concept registration gate and explicit schema migration. |
+| Per-concept relation summaries, boundary summaries, final-output explanations, and progress summaries | `derived_summary` | They must derive from canonical artifact seats and cannot become competing truth. |
+
+An implementation stage may be called complete only for the obligation statuses
+it actually implements. If a runtime path exposes a `future_reconstruct_or_review_run`
+consumer, it must either narrow the consumer to same-session continuation or
+provide the lineage seats defined by the lifecycle contract.
+
+## 4. Seed Answerability Contract
+
+The Seed is a handoff artifact for purpose-relative top-level concept discovery.
+It supports bounded interpretation and next-step decisions; it does not certify
+full ontology readiness.
+
+Minimum Seed consumers:
+
+- `principal_user`: reads the Seed to understand the service purpose and the
+  top-level structure discovered so far.
+- `ontology_author`: uses the Seed as input for later ontology formalization.
+- `runtime_validator`: checks shape, refs, identity stability, relation
+  endpoint integrity, and disclosed convergence inputs.
+- `future_reconstruct_or_review_run`: uses the Seed lineage and unresolved
+  pressures for same-session continuation by default. Cross-run continuation is
+  supported only when lifecycle lineage seats identify the parent Seed, source
+  snapshot transition, prior/current ID mappings, and ID stability scope.
+
+Allowed Seed-stage actions:
+
+- explain the declared purpose in user-facing language
+- inspect the selected top-level concepts and why they are top-level
+- inspect relation hypotheses between selected top-level concepts
+- decide whether more source exploration is needed before handoff
+- identify deferred details and open questions for later ontology work
+- plan a later registration, review, evolve, or implementation step
+
+Unsupported Seed-stage actions:
+
+- treat the Seed as a complete ontology graph
+- treat `converged_for_seed` as full ontology design readiness
+- treat relation labels as registered canonical ontology relation types
+- treat lower-level details as exhaustive
+- treat runtime validation as semantic approval
+
+The Seed must carry `answerability_scope`:
+
+```yaml
+answerability_scope:
+  declared_handoff_questions:
+    - question_id:
+      question:
+      source: declared_purpose | user_request | domain_profile | lens_requirement
+  supported_questions:
+    - question_id:
+      question:
+      answered_by:
+        concept_ids: []
+        relation_ids: []
+      action_readiness_refs: []
+      confidence:
+  deferred_questions:
+    - question_id:
+      question:
+      reason_deferred:
+      frontier_pressure_ids: []
+  unsupported_questions:
+    - question_id:
+      question:
+      reason_unsupported:
+  supported_actions:
+    - action_id:
+      action:
+      supported_by_question_ids: []
+      readiness_statement:
+  unsupported_actions:
+    - action_id:
+      action:
+      reason_unsupported:
+  handoff_readiness_statement:
+  handoff_readiness_question_ids: []
+```
+
+Answerability validation is deterministic and reference-based:
+
+- every `declared_handoff_questions[].question_id` is unique
+- every `supported_questions[].question_id`, `deferred_questions[].question_id`,
+  and `unsupported_questions[].question_id` is unique across the
+  `answerability_scope`
+- the union of `supported_questions`, `deferred_questions`, and
+  `unsupported_questions` question IDs is exactly the
+  `declared_handoff_questions` ID set
+- every `supported_actions[].action_id` and `unsupported_actions[].action_id`
+  is unique across the `answerability_scope`
+- every `supported_questions[].answered_by.concept_ids[]` points to a known
+  `top_level_concepts[].concept_id`
+- every `supported_questions[].answered_by.relation_ids[]` points to a known
+  `top_level_relations[].relation_id`
+- each supported question has at least one answered-by concept or relation
+- every `supported_questions[].action_readiness_refs[]` points to a known
+  `supported_actions[].action_id`
+- every `supported_actions[].supported_by_question_ids[]` points to a known
+  `supported_questions[].question_id`
+- every `deferred_questions[].frontier_pressure_ids[]` points to a known
+  `frontier_pressure_log[].pressure_id`
+- every `handoff_readiness_question_ids[]` points to a known
+  `declared_handoff_questions[].question_id`
+
+`converged_for_seed` means that the Seed is ready for top-level concept handoff
+within this answerability scope. It does not mean full ontology readiness.
+Question status is encoded by membership in `supported_questions`,
+`deferred_questions`, or `unsupported_questions`; do not repeat a separate
+`question_status` field inside those grouped items.
+
+## 5. Discovery Strategy
 
 Top-level concept discovery uses bottom-up observation, top-down purpose
-constraint, and graph compression.
+constraint, graph compression, and frontier-directed iteration.
 
 The process is not "keep climbing the hierarchy." It alternates between lifting
 source details into candidate concepts and grounding those candidates back into
@@ -81,11 +227,12 @@ material-aware source observations
 -> candidate concept clusters
 -> abstraction-level tests
 -> top-level concept set
--> source frontier aligned to unresolved top-levelness pressure
--> convergence assessment
+-> canonical relation graph
+-> source frontier aligned to unresolved frontier pressure
+-> answerability and convergence assessment
 ```
 
-### 4.1 Collect Local Candidates
+### 5.1 Collect Local Candidates
 
 The first semantic pass may name many local candidates from files, symbols,
 tables, fields, formulas, headings, UI components, services, actions, states,
@@ -95,7 +242,7 @@ early.
 Local candidates are evidence-bearing raw material for clustering. They are not
 Seed output by default.
 
-### 4.2 Cluster By Purpose Role
+### 5.2 Cluster By Purpose Role
 
 Local candidates should be clustered by the role they play in explaining the
 declared purpose:
@@ -117,7 +264,7 @@ Example for an AI usage dashboard:
 | billing aggregate, cost KPI, token cost, provider cost | `Usage Cost` |
 | page, KPI cards, session table, analytics summary | `Dashboard View` |
 
-### 4.3 Test Abstraction Level
+### 5.3 Test Abstraction Level
 
 Each candidate must pass both upward and downward tests.
 
@@ -138,7 +285,7 @@ Downward test:
 The target is the stable middle level that explains the purpose, not the most
 abstract reachable parent.
 
-### 4.4 Select A Small Concept Set
+### 5.4 Select A Small Concept Set
 
 The Seed should prefer a compact top-level concept set. The normal target range
 is small enough for a user to inspect in one pass, usually 3-7 concepts for a
@@ -148,214 +295,786 @@ The concept set may be larger when the declared purpose or target bundle is
 explicitly broad, but growth must be justified by purpose coverage, not by
 implementation surface area.
 
-### 4.5 Demote Lower-Level Detail
+Runtime may warn when the concept count is outside configured deterministic
+bounds. Runtime must not decide whether the concept set is semantically compact
+enough.
+
+## 6. Concept Identity And Lifecycle
+
+Every design-local top-level concept and relation must have stable identity
+within the reconstruct session.
+
+Identity rules:
+
+- `concept_id` and `relation_id` are opaque stable identifiers within the Seed.
+- User-facing `name` may change when the LLM improves wording.
+- Renaming a concept must preserve `concept_id` when the semantic boundary is
+  unchanged.
+- Splitting one concept into multiple concepts must create new concept IDs and
+  record the source concept ID.
+- Merging concepts must create or select a surviving concept ID and record the
+  merged concept IDs.
+- Demoting a concept to lower-level detail must preserve its prior ID in change
+  history and move the current representation to the lower-level detail
+  placement authority.
+- Relation endpoint IDs must reference current top-level concept IDs.
+
+The Seed must carry `lifecycle`:
+
+```yaml
+lifecycle:
+  seed_id:
+  parent_seed_ref:
+  id_stability_scope: session | lineage
+  session_id:
+  source_snapshot_refs: []
+  source_snapshot_transition:
+    prior_snapshot_refs: []
+    current_snapshot_refs: []
+    transition_reason:
+  prior_concept_mappings:
+    - prior_concept_id:
+      prior_concept_ids: []
+      current_concept_id:

(truncated at 300 lines — full materialized input: .onto/review/20260528-29cea5a1/execution-preparation/materialized-input.md)


## Optional Context Inputs
- session metadata: .onto/review/20260528-29cea5a1/session-metadata.yaml
- target snapshot: .onto/review/20260528-29cea5a1/execution-preparation/target-snapshot.md
- context candidate assembly: .onto/review/20260528-29cea5a1/execution-preparation/context-candidate-assembly.yaml
- domain binding: .onto/review/20260528-29cea5a1/execution-preparation/domain-binding.yaml
- review value-alignment criteria: .onto/review/20260528-29cea5a1/execution-preparation/review-value-alignment-criteria.yaml
- consumer id: lens:logic
- allowed context source ids: context-candidate-assembly, domain:logic_rules, domain:prompt_interface, materialized-input, review-target-profile, review-value-alignment-criteria, target-snapshot

## Boundary Policy
- web research: denied
- repo exploration: allowed
- recursive reference expansion: denied
- filesystem allowed roots:
  - .
- source mutation: denied
- allowed output refs:
  - .onto/review/20260528-29cea5a1/round1/logic.md
  - .onto/review/20260528-29cea5a1/round1/structure.md
  - .onto/review/20260528-29cea5a1/round1/dependency.md
  - .onto/review/20260528-29cea5a1/round1/semantics.md
  - .onto/review/20260528-29cea5a1/round1/pragmatics.md
  - .onto/review/20260528-29cea5a1/round1/evolution.md
  - .onto/review/20260528-29cea5a1/round1/coverage.md
  - .onto/review/20260528-29cea5a1/round1/conciseness.md
  - .onto/review/20260528-29cea5a1/round1/axiology.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/logic-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/structure-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/dependency-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/semantics-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/pragmatics-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/evolution-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/coverage-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/conciseness-deliberation.md
  - .onto/review/20260528-29cea5a1/deliberation/round1/axiology-deliberation.md
  - .onto/review/20260528-29cea5a1/finding-ledger.yaml
  - .onto/review/20260528-29cea5a1/finding-relation-graph.yaml
  - .onto/review/20260528-29cea5a1/issue-ledger.yaml
  - .onto/review/20260528-29cea5a1/issue-stance-matrix.yaml
  - .onto/review/20260528-29cea5a1/deliberation-plan.yaml
  - .onto/review/20260528-29cea5a1/problem-framing.yaml
  - .onto/review/20260528-29cea5a1/lens-completion-barrier.yaml
  - .onto/review/20260528-29cea5a1/synthesis.md
  - .onto/review/20260528-29cea5a1/deliberation.md
- extra exploration citation required: true
- web source citation required: true

## Boundary Enforcement Profile
- prompt: prompt_declared_only
- filesystem: prompt_declared_only
- network: prompt_declared_only
- write: prompt_declared_only

## Effective Boundary State
- web research: requested=denied, effective=denied, guarantee=prompt_declared_only
- repo exploration: requested=allowed, effective=allowed, guarantee=prompt_declared_only
- recursive reference expansion: requested=denied, effective=denied, guarantee=prompt_declared_only
- source mutation: requested=denied, effective=denied, guarantee=prompt_declared_only
- filesystem effective allowed roots:
  - .
- filesystem guarantee: prompt_declared_only

## Session Summary
- requested target: .
- target scope kind: file
- resolved target refs:
  - .onto/review/20260528-29cea5a1/diff-target.patch
- review mode: full
- lens set: logic, structure, dependency, semantics, pragmatics, evolution, coverage, conciseness, axiology

## Execution Directives
- Read the role definition and the materialized input first.
- Prefer the smallest sufficient set of files.
- Only read optional context inputs if the primary inputs are not enough.
- Do not recursively chase additional document links or reference chains found inside the target text.
- Use the materialized input as the authoritative target input.
- Use only your lens-specific perspective.
- Perform structural inspection first when applicable.
- If you find an issue, state what, why, and how to fix it.
- If you find no issue, state why it is correct.
- Write your result to: .onto/review/20260528-29cea5a1/round1/logic.md

## Machine-Parsed Output Schema Gate
The review record assembler reads the two provenance sections below as YAML.
Allowed content for these sections is only valid YAML list content.

Use this exact shape:

```markdown
### Domain Constraints Used
- source_doc: ".onto/domains/{domain}/{domain-file}.md"
  source_version_or_snapshot_id: "{session snapshot or document version}"
  anchor: "{section heading, rule id, or stable line anchor}"

### Domain Context Assumptions
[]
```

Rules:
- For `session_domain=none`, `session_domain=@-`, or no domain document usage, write exactly `[]` under `### Domain Constraints Used`.
- For informal domain/context assumptions, write a YAML list of strings under `### Domain Context Assumptions`.
- Each `Domain Constraints Used` item must be an object with these required fields: `source_doc`, `source_version_or_snapshot_id`, `anchor`.
- These headings may be `###` or `##`, but their body must remain valid YAML list content.


## Domain Document Refs
- primary: .onto/domains/software-engineering/logic_rules.md
- supplementary:
  - .onto/domains/software-engineering/prompt_interface.md
