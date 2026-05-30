# Review Lens Prompt Packet

session_id: 20260528-da9e31db
lens_id: structure
execution_realization: worker
host_runtime: codex
review_mode: full
session_domain: software-engineering
output_path: .onto/review/20260528-da9e31db/round1/structure.md
request_summary: Fresh verification review for the current reconstruct top-level concept discovery design patch after closing prior material issue issue-001 from session 20260528-391bbc3f. Confirm whether material documentation/design-contract issues remain in the current working tree diff, especially complete concept-centered lifecycle implementation guidance, retired-seat legacy migration mappings, concept/relation split/merge lifecycle continuity, pressure prior/new status transitions, answerability lifecycle refs, answerability status by list membership, source_authority_scope preservation, material coverage source-authority lifecycle events, README, and IMPLEMENTATION_MAP alignment.

## Canonical Role
You are structure.
Execute as a ContextIsolatedReasoningUnit.
Do not read other lens outputs during Round 1.

## Role Definition Source
.onto/roles/structure.md

# structure

## Perspective

이 lens는 대상 시스템을 **구조적 완결성**의 관점에서 본다. 모든 구성 요소가 적절히 연결되어 있는지, 필수 관계가 존재하는지, 고아(orphan) 요소가 없는지를 검증한다. 이 lens의 관심은 "존재해야 하는 연결이 실제로 있는가"이다.

이 관점은 이미 존재하는 요소들 사이의 연결 완결성에만 초점을 둔다. 도메인 차원의 영역 누락이나 관계 방향성의 정확성은 별도 관점의 범위이다.

### Observation focus

고아 요소, 끊어진 경로, 누락된 필수 관계, 설계 의도와 연결 구조 간의 불일치.

### Assertion type

존재 진술: "X는 어떤 관계에도 연결되어 있지 않다", "필수 관계 Y가 누락되었다".

## Core questions

- 어떤 관계에도 연결되지 않은 고아 요소가 있는가?
- 필수 관계가 누락되어 있는가?
- 구조적 연결성이 설계 의도와 일치하는가?

## Domain examples

- Software: 도달 불가능한 함수, 참조되지 않는 모듈, 누락된 에러 처리 경로
- Law: 정의 없이 사용된 용어, 참조되지 않는 부칙, 위임 규정의 대상 법률 누락
- Accounting: 계정과목표의 고아 계정, 상위 계정 없는 하위 계정

## Domain document

`.onto/domains/{domain}/structure_spec.md` (`session_domain`이 설정된 경우).

`session_domain`이 `none`이면 `.onto/processes/review/lens-prompt-contract.md` §9.3 Domain-None Fallback Rule에 따라 domain document 없이 실행한다.


## Authoritative Artifact Inputs
- materialized input: .onto/review/20260528-da9e31db/execution-preparation/materialized-input.md
- role definition: .onto/roles/structure.md
- interpretation: .onto/review/20260528-da9e31db/interpretation.yaml
- binding: .onto/review/20260528-da9e31db/binding.yaml
- review target profile: .onto/review/20260528-da9e31db/execution-preparation/review-target-profile.yaml
- review context manifest: .onto/review/20260528-da9e31db/execution-preparation/review-context-manifest.yaml

## Embedded Materialized Input

kind: single_text

## diff-target.patch
ref: /Users/kangmin/cowork/onto-mcp/.onto/review/20260528-da9e31db/diff-target.patch

diff --git a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
index 0c766ca..9d1f04c 100644
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
 
@@ -58,18 +64,147 @@ registration gate in `reconstruct-boundary-contract.md`.
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
+```
+
+Answerability validation is deterministic and reference-based:
+
+- every `supported_questions[].question_id`, `deferred_questions[].question_id`,
+  and `unsupported_questions[].question_id` is unique across the
+  `answerability_scope`
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
@@ -81,11 +216,12 @@ material-aware source observations
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
@@ -95,7 +231,7 @@ early.
 Local candidates are evidence-bearing raw material for clustering. They are not
 Seed output by default.
 
-### 4.2 Cluster By Purpose Role
+### 5.2 Cluster By Purpose Role
 
 Local candidates should be clustered by the role they play in explaining the
 declared purpose:
@@ -117,7 +253,7 @@ Example for an AI usage dashboard:
 | billing aggregate, cost KPI, token cost, provider cost | `Usage Cost` |
 | page, KPI cards, session table, analytics summary | `Dashboard View` |
 
-### 4.3 Test Abstraction Level
+### 5.3 Test Abstraction Level
 
 Each candidate must pass both upward and downward tests.
 
@@ -138,7 +274,7 @@ Downward test:
 The target is the stable middle level that explains the purpose, not the most
 abstract reachable parent.
 
-### 4.4 Select A Small Concept Set
+### 5.4 Select A Small Concept Set
 
 The Seed should prefer a compact top-level concept set. The normal target range
 is small enough for a user to inspect in one pass, usually 3-7 concepts for a
@@ -148,214 +284,761 @@ The concept set may be larger when the declared purpose or target bundle is
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
+      current_concept_ids: []
+      mapping_type: preserved | renamed | split | merged | demoted | removed
+      rationale:
+  prior_relation_mappings:
+    - prior_relation_id:
+      prior_relation_ids: []
+      current_relation_id:
+      current_relation_ids: []
+      mapping_type: preserved | changed_direction | changed_kind | split | merged | removed
+      rationale:
+  exploration_rounds:

(truncated at 300 lines — full materialized input: .onto/review/20260528-da9e31db/execution-preparation/materialized-input.md)


## Optional Context Inputs
- session metadata: .onto/review/20260528-da9e31db/session-metadata.yaml
- target snapshot: .onto/review/20260528-da9e31db/execution-preparation/target-snapshot.md
- context candidate assembly: .onto/review/20260528-da9e31db/execution-preparation/context-candidate-assembly.yaml
- domain binding: .onto/review/20260528-da9e31db/execution-preparation/domain-binding.yaml
- review value-alignment criteria: .onto/review/20260528-da9e31db/execution-preparation/review-value-alignment-criteria.yaml
- consumer id: lens:structure
- allowed context source ids: context-candidate-assembly, domain:prompt_interface, domain:structure_spec, materialized-input, review-target-profile, review-value-alignment-criteria, target-snapshot

## Boundary Policy
- web research: denied
- repo exploration: allowed
- recursive reference expansion: denied
- filesystem allowed roots:
  - .
- source mutation: denied
- allowed output refs:
  - .onto/review/20260528-da9e31db/round1/logic.md
  - .onto/review/20260528-da9e31db/round1/structure.md
  - .onto/review/20260528-da9e31db/round1/dependency.md
  - .onto/review/20260528-da9e31db/round1/semantics.md
  - .onto/review/20260528-da9e31db/round1/pragmatics.md
  - .onto/review/20260528-da9e31db/round1/evolution.md
  - .onto/review/20260528-da9e31db/round1/coverage.md
  - .onto/review/20260528-da9e31db/round1/conciseness.md
  - .onto/review/20260528-da9e31db/round1/axiology.md
  - .onto/review/20260528-da9e31db/deliberation/round1/logic-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/structure-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/dependency-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/semantics-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/pragmatics-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/evolution-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/coverage-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/conciseness-deliberation.md
  - .onto/review/20260528-da9e31db/deliberation/round1/axiology-deliberation.md
  - .onto/review/20260528-da9e31db/finding-ledger.yaml
  - .onto/review/20260528-da9e31db/finding-relation-graph.yaml
  - .onto/review/20260528-da9e31db/issue-ledger.yaml
  - .onto/review/20260528-da9e31db/issue-stance-matrix.yaml
  - .onto/review/20260528-da9e31db/deliberation-plan.yaml
  - .onto/review/20260528-da9e31db/problem-framing.yaml
  - .onto/review/20260528-da9e31db/lens-completion-barrier.yaml
  - .onto/review/20260528-da9e31db/synthesis.md
  - .onto/review/20260528-da9e31db/deliberation.md
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
  - .onto/review/20260528-da9e31db/diff-target.patch
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
- Write your result to: .onto/review/20260528-da9e31db/round1/structure.md

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
- primary: .onto/domains/software-engineering/structure_spec.md
- supplementary:
  - .onto/domains/software-engineering/prompt_interface.md
