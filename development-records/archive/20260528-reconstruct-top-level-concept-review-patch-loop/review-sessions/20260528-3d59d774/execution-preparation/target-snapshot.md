## /Users/kangmin/cowork/onto-mcp/.onto/review/20260528-3d59d774/diff-target.patch

diff --git a/.onto/processes/reconstruct/top-level-concept-discovery-contract.md b/.onto/processes/reconstruct/top-level-concept-discovery-contract.md
index 0c766ca..89d0e55 100644
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
@@ -148,214 +284,769 @@ The concept set may be larger when the declared purpose or target bundle is
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
+    - round_id:
+      observed_source_refs: []
+      authoring_pass_ref:
+      changed_concept_ids: []
+      changed_relation_ids: []
+      changed_frontier_pressure_ids: []
+  concept_identity_events:
+    - event_id:
+      event_type: created | renamed | alias_changed | split | merged | demoted | boundary_changed
+      concept_ids: []
+      prior_concept_ids: []
+      current_concept_ids: []
+      prior_names: []
+      new_names: []
+      prior_aliases: []
+      current_aliases: []
+      reason:
+      evidence_refs: []
+      frontier_pressure_ids: []
+  relation_identity_events:
+    - event_id:
+      event_type: created | changed_direction | changed_kind | split | merged | removed
+      relation_ids: []
+      prior_relation_ids: []
+      current_relation_ids: []
+      reason:
+      evidence_refs: []
+      frontier_pressure_ids: []
+  pressure_events:
+    - event_id:
+      event_type: created | resolved | deferred | reopened | superseded | non_blocking
+      pressure_ids: []
+      prior_status:
+      new_status:
+      current_pressure_id:
+      superseded_by_pressure_id:
+      reason:
+      evidence_refs: []
+  detail_placement_events:
+    - event_id:
+      event_type: placed | changed_owner | changed_placement | removed
+      detail_ids: []
+      reason:
+      evidence_refs: []
+      frontier_pressure_ids: []
+  answerability_events:
+    - event_id:
+      event_type: question_supported | question_deferred | question_unsupported | action_supported | action_unsupported
+      question_ids: []
+      action_ids: []
+      frontier_pressure_ids: []
+      reason:
+  material_coverage_events:
+    - event_id:
+      event_type: source_slice_added | material_kind_excluded | coverage_gap_disclosed | coverage_gap_resolved | source_authority_scope_changed
+      source_refs: []
+      material_kinds: []
+      changed_authority_fields: []
+      prior_authority_state_ref:
+      current_authority_state_ref:
+      prior_authority_state:
+      current_authority_state:
+      frontier_pressure_ids: []
+      reason:
+  convergence_events:
+    - event_id:
+      prior_state:
+      new_state:
+      frontier_pressure_ids: []
+      reason:
+```
+
+This lifecycle projection is design-local until schema registration, but the
+runtime must preserve equivalent artifact truth before claiming iterative
+convergence, migration compatibility, or cross-run continuation. Same-session
+identity may use `id_stability_scope: session`; any cross-run consumer requires
+`id_stability_scope: lineage` plus parent Seed and prior/current mapping fields.
+For concept and relation `split` and `merged` lifecycle events, the array fields
+are the authority: `split` maps one prior item to multiple current items, and
+`merged` maps multiple prior items to one current item. Singular
+`prior_concept_id`, `current_concept_id`, `prior_relation_id`, and
+`current_relation_id` fields may exist as compatibility or display projections,
+but must not replace the array authority.
+`prior_*_mappings` are cross-Seed transition projections. `*_identity_events`
+are the event/provenance log within the lifecycle. When both exist for the same
+transition, mappings must be derivable from identity events or share enough IDs
+and evidence refs for deterministic consistency validation.
+
+## 7. Relation Graph Authority
+
+`top_level_relations` is the canonical relation graph authority for the Seed.
+Per-concept relation summaries may exist only as derived projections.
+
+Each selected top-level concept should participate in at least one
+`top_level_relations` entry as either `source_concept_id` or
+`target_concept_id` unless its `relation_participation.status` is
+`provisionally_isolated` or `boundary_isolated` with a reason and pressure refs.
+
+Top-level concept participation fields:
 
-Implementation details, fields, service methods, UI widgets, spreadsheet cells,
-schema columns, narrow rules, and action-level claims should be demoted unless
-they independently satisfy the top-level tests.
+```yaml
+top_level_concepts:
+  - concept_id:
+    relation_participation:
+      status: connected | provisionally_isolated | boundary_isolated
+      isolation_reason:
+      isolation_pressure_ids: []
+```
 
-Demotion does not discard evidence. The detail should be attached to one of:
+`relation_participation` is the concept-level validation seat for graph
+connectivity state. It is not a second relation authority and must not duplicate
+endpoint membership. For `connected`, runtime validates participation by
+checking whether the concept appears as `source_concept_id` or
+`target_concept_id` in at least one `top_level_relations` record. Isolation
+pressure refs must point to `frontier_pressure_log[].pressure_id`.
 
-- `included_lower_concepts`
-- `supporting_evidence`
-- `deferred_detail_candidates`
-- `open_questions`
-- `boundary_notes`
+Minimum relation record:
 
-## 5. Top-Levelness Criteria
+```yaml
+top_level_relations:
+  - relation_id:
+    source_concept_id:
+    target_concept_id:
+    relation_kind:
+    relation_axis:
+    relation_label:
+    direction_statement:
+    statement:
+    evidence_refs:
+    confidence:
+    provisional: true
+    registration_status: design_local
+```
 
-A top-level concept candidate is strong when it satisfies most of the criteria
-below.
+`source_concept_id` and `target_concept_id` are ordered endpoints. For
+directional relation kinds, endpoint order is the asserted semantic direction.
+For `related_to`, endpoint order is stable artifact serialization only, not a
+semantic direction claim. `direction_statement` must explain either the
+directional meaning or the absence of directional meaning in user-facing
+language.
+
+Design-local relation kinds:
+
+| Kind | Axis | Direction rule | Use when |
+|---|---|---|---|
+| `depends_on` | `dependency_flow` | source depends on target | One concept needs another to exist, be interpreted, or be computed. |
+| `enables` | `dependency_flow` | source enables target | One concept makes another possible or operational. |
+| `produces` | `dependency_flow` | source produces target | One concept creates or emits another. |
+| `consumes` | `dependency_flow` | source consumes target | One concept reads, uses, or aggregates another. |
+| `represents` | `representation_projection` | source represents target | One concept is a view, projection, or representation of another. |
+| `governs` | `governance_constraint` | source governs target | One concept constrains, validates, authorizes, or classifies another. |
+| `groups` | `grouping_taxonomy` | source groups target | One concept groups or organizes several instances of another. |
+| `part_of` | `structural_composition` | source is part of target | One concept is a component or bounded part of another. |
+| `related_to` | `association` | direction is not semantically asserted | A relation is observed but its specific kind is not yet stable. |
+
+Valid `relation_axis` values are `dependency_flow`,
+`structural_composition`, `representation_projection`,
+`governance_constraint`, `grouping_taxonomy`, and `association`.
+For every relation except `related_to`, runtime may validate that
+`relation_axis` matches `relation_kind`. For `related_to`, `direction_statement`
+must state that no directional semantic claim is being made and explain why the
+relation is still useful at Seed stage.
+
+Relation labels remain design-local until promoted. Runtime may validate
+endpoint integrity, allowed relation kind, allowed relation axis, kind-axis
+pairing, duplicate relation IDs, concept participation refs, isolation pressure
+refs, and evidence refs. Runtime must not decide semantic relation correctness.
+
+## 8. Lower-Level Detail Placement
+
+`lower_level_detail_placements` is the canonical authority for demoted details.
+Other fields may expose summaries, but they must derive from this placement
+authority.
+
+Canonical placement record:
 
-| Criterion | Question |
+```yaml
+lower_level_detail_placements:
+  - detail_id:
+    name:
+    material_kind:
+    source_ref:
+    placement:
+    owner_concept_id:
+    rationale:
+    evidence_refs:
+    follow_up_question:
+```
+
+Allowed `placement` values:
+
+| Placement | Meaning |
 |---|---|
-| Purpose criticality | Would the declared purpose become hard to explain without this concept? |
-| Explanatory compression | Does it explain multiple lower-level observations without losing important distinctions? |
-| Boundary clarity | Can the run state what belongs under this concept and what is excluded or deferred? |
-| Relation centrality | Does it participate in core relations with other selected concepts? |
-| Material grounding | Is it supported by concrete source observations from the current material boundary? |
-| User-facing intelligibility | Can the concept be named in service language, not only implementation language? |
-| Evolution stability | Would the concept likely survive refactors, UI rewrites, schema reshaping, or source-format changes? |
-| Split pressure | Is there no unresolved material reason to split it now? |
-| Merge pressure | Is there no unresolved material reason to merge it with another selected concept now? |
+| `included_support` | Detail supports the concept boundary but is not top-level. |
+| `excluded_boundary` | Detail is explicitly outside the concept boundary. |
+| `deferred_followup` | Detail may matter later but does not change Seed handoff now. |
+| `open_question` | Detail exposes a question that may change boundary or relation judgment. |
 
-No single criterion is sufficient. Frequent source mentions or central code
-location do not by themselves make a concept top-level.
+Concept-level fields such as `included_lower_concepts`,
+`excluded_or_deferred_details`, `open_questions`, and `boundary_notes` are
+allowed only as derived user-facing summaries or compatibility projections.
+They must not become competing authority seats.
 
-## 6. Source Frontier Alignment
+## 9. Source Frontier Artifact And Iteration
 
 Source frontier selection must align to top-level concept convergence.
 
 The frontier should not ask "what else can be read?" It should ask "what source
 could materially change the selected top-level concept set, concept boundaries,
-core relations, or convergence confidence?"
+core relations, answerability scope, or convergence confidence?"
 
-Each LLM-authored frontier ref should carry the decision pressure it is meant
-to resolve.
+`frontier_pressure_log` is the design-local authority for frontier pressure.
+Each LLM-authored frontier ref must carry the pressure it is meant to resolve.
+All pressure references in lifecycle, answerability, material coverage,
+convergence, relation participation, and final-output summaries must point to
+`frontier_pressure_log[].pressure_id`. Downstream fields may summarize pressure
+state, but they must be ID projections or derived text from this log.
 
-Recommended semantic payload:
+Canonical frontier pressure record:
 
 ```yaml
-frontier_refs:
-  - source_ref: src/services/usage-mart.service.ts
-    frontier_question: Is UsageMart a top-level concept or a lower-level read model under Usage Cost or Dashboard View?
-    target_concepts:
-      - Usage Cost
-      - Dashboard View
-      - Usage Mart
-    pressure_type: split_or_demote
-    expected_decision_impact: May demote UsageMart from top-level concept to supporting detail.
-    priority: high
+frontier_pressure_log:
+  - pressure_id:
+    origin: source_observation | lens_objection | material_coverage | answerability_check | lifecycle_event
+    origin_ref:
+    pressure_type:
+    pressure_question:
+    target_concept_ids: []
+    target_relation_ids: []
+    material_kind:
+    source_ref:
+    expected_decision_impact:
+    priority:
+    status: open | resolved | deferred | superseded | non_blocking
+    status_reason:
+    superseded_by_pressure_id:
+    evidence_refs: []
 ```
 
-The exact public artifact field names remain subject to the registration gate.
-Until then, runtime may preserve this information inside existing rationale
-fields or design-local prompt payloads.
-
-Valid frontier pressure categories:
+Valid `pressure_type` values:
 
 | Pressure | Use when |
 |---|---|
 | `missing_axis` | The declared purpose may require a top-level concept not yet represented. |
 | `split_or_merge` | Two candidates may be the same concept, or one candidate may hide two materially different concepts. |
-| `boundary` | The concept's included and excluded lower-level details are unclear. |
-| `core_relation` | The relation between selected concepts may be wrong or incomplete. |
+| `boundary` | A concept's included and excluded lower-level details are unclear. |
+| `core_relation` | A relation between selected concepts may be wrong, missing, mistyped, or directionally unstable. |
 | `abstraction_level` | A candidate may be too implementation-specific or too generic. |
 | `evidence_saturation` | The run needs to know whether additional source will introduce new top-level concepts or only reinforce existing ones. |
+| `answerability_gap` | The Seed cannot yet answer a purpose-facing question required for handoff. |
+| `material_coverage_gap` | A relevant source material kind or source slice may be underrepresented. |
 
-Frontier requests that only gather lower-level implementation detail are valid
-only when that detail can resolve one of these pressures.
+Do not use unregistered pressure labels such as `split_or_demote`.
+Demotion belongs in `expected_decision_impact` and, if realized, in
+`lower_level_detail_placements`.
 
-## 7. Convergence Conditions
+Valid `frontier_pressure_log[].status` values:
+
+| Status | Meaning | Validation requirement |
+|---|---|---|
+| `open` | The pressure is unresolved and may still change top-level concepts, boundaries, relations, answerability, coverage, or convergence confidence. | `converged_for_seed` must not be claimed while any pressure remains `open`. |
+| `resolved` | The pressure has been answered by observed source, lens resolution, or Seed revision. | `evidence_refs` includes the resolving source or review artifact. |
+| `deferred` | The pressure is real but intentionally left for a later stage or narrower purpose. | `status_reason` explains why deferral does not block the declared Seed purpose. |
+| `superseded` | A newer pressure replaces this pressure. | `superseded_by_pressure_id` points to a known pressure. |
+| `non_blocking` | The pressure remains visible but does not affect Seed-level handoff for the declared purpose. | `status_reason` explains why it does not block convergence. |
+
+Runtime validation rejects unknown pressure statuses, dangling
+`superseded_by_pressure_id` refs, and convergence claims that leave any `open`
+pressure unresolved.
+
+Example:
+
+```yaml
+frontier_pressure_log:
+  - pressure_id: pressure-usage-mart-abstraction
+    origin: source_observation
+    origin_ref: source-observation:src/services/usage-mart.service.ts
+    pressure_type: abstraction_level
+    pressure_question: Is UsageMart a top-level concept or a lower-level read model under Usage Cost or Dashboard View?
+    target_concept_ids:
+      - concept-usage-cost
+      - concept-dashboard-view
+      - concept-usage-mart
+    material_kind: code
+    source_ref: src/services/usage-mart.service.ts
+    expected_decision_impact: May demote UsageMart from top-level concept to supporting detail.
+    priority: high
+    status: open
+    status_reason: Awaiting source evidence that decides abstraction level.
+    superseded_by_pressure_id:
+    evidence_refs: []
+```
+
+### 9.1 Material Coverage Checkpoint
+
+Before a run can claim `evidence_saturation` or `converged_for_seed`, it must
+carry a material-aware coverage checkpoint:
+
+```yaml
+material_coverage_checkpoint:
+  observed_material_kinds: []
+  observed_source_slices: []
+  source_authority_scope:
+    permission_scope: within_declared_boundary | restricted | unknown
+    permission_basis_refs: []
+    trust_status: observed_evidence_only | user_provided_authority | external_untrusted | mixed
+    instruction_authority_status: none_data_only | declared_process_authority | mixed_requires_disclosure
+    external_content_handling: not_applicable | treated_as_untrusted_data | sanitized_or_quoted | excluded
+    restricted_source_refs: []
+    rationale:
+  intentionally_excluded_material_kinds: []
+  unexplored_source_categories: []
+  possible_missing_axis_pressure_ids: []
+  rationale_for_seed_level_sufficiency:
+  partial_support_disclosures: []
+```
+
+The checkpoint does not require reading every source file. It requires
+disclosing whether the observed material boundary is sufficient for Seed-level
+top-level concept handoff.
+
+`source_authority_scope` records the trust and permission boundary for source
+material that enters LLM-authored Seed authority artifacts. Source material is
+observational evidence by default; it does not gain instruction authority over
+the reconstruct process, schema, validation gates, or output obligations unless
+the run explicitly records `declared_process_authority`. Runtime validation can
+check the enum values and source refs, while the host LLM remains responsible
+for interpreting whether the recorded boundary is semantically sufficient.
+
+### 9.2 Bounded Iteration Rule
+
+Each exploration round must follow this loop:
+
+1. Observe the selected source frontier within the material boundary.
+2. Let the LLM update concepts, relations, lower-level placements,
+   answerability scope, and frontier pressure.
+3. Runtime validates shape, evidence refs, relation endpoints, pressure enum
+   values, material coverage checkpoint presence, and lifecycle continuity.
+4. Compare the current concept set, relation graph, frontier pressure log, and
+   answerability scope against the prior round.
+5. Decide one of:
+   - continue exploration
+   - provisionally hand off with disclosed unresolved pressures
+   - hand off as `converged_for_seed`
+   - halt with validation failure
+
+The loop may stop at `converged_for_seed` only when no pressure remains `open`.
+Any unresolved pressure that does not block Seed handoff must be recorded with a
+non-open status such as `deferred` or `non_blocking` and a status reason.
+
+## 10. Convergence Contract
 
 Top-level concept discovery converges when further source exploration is
 expected to refine evidence, properties, rules, or lower-level details, but is
 not expected to materially change the selected top-level concept set, each
-concept's boundary, or the core relations between concepts for the declared
-purpose.
+concept's boundary, the canonical relation graph, or the answerability scope for
+the declared purpose.
 
 Convergence is not the absence of all issues. It is a bounded claim about the
-stability of the top-level concept set.
+stability of the Seed as a top-level concept handoff artifact.
 
 The run may report one of three convergence states:
 
 | State | Meaning | Typical next action |
 |---|---|---|
-| `not_converged` | Top-level concept candidates, boundaries, or relations are still changing materially. | Continue source frontier exploration. |
-| `provisionally_converged` | The main concept set is stable, but some split, merge, boundary, or deferred-detail questions remain. | Present Seed with disclosed limits and revision proposals. |
-| `converged_for_seed` | Purpose coverage, concept boundaries, and core relations are stable enough for Seed handoff. | Present Seed as the current top-level concept discovery result. |
+| `not_converged` | Top-level concepts, boundaries, relations, answerability scope, or material coverage are still changing materially. | Continue source frontier exploration. |
+| `provisionally_converged` | The main Seed is stable, but some disclosed pressures remain that do not block bounded handoff. | Present Seed with limits and revision proposals. |
+| `converged_for_seed` | Purpose coverage, concept boundaries, canonical relations, answerability scope, and material coverage are stable enough for Seed handoff. | Present Seed as the current top-level concept discovery result. |
+
+Required convergence inputs:
+
+- latest `top_level_concepts`
+- latest canonical `top_level_relations`
+- latest `lower_level_detail_placements`
+- latest `frontier_pressure_log`
+- latest `answerability_scope`
+- latest `material_coverage_checkpoint`
+- lifecycle events for changes since the prior round
+- runtime validation result for deterministic shape and refs
+
+Optional review-confirmed convergence input:
+
+- reconstruct lens judgment artifacts may strengthen convergence only when the
+  run records the lens profile, lens set, execution status, degraded lenses, and
+  artifact refs.
+
+Absence of lens objections is positive convergence evidence only when a lens
+pass actually ran and its coverage limits are recorded. If lens review did not
+run, was skipped, or was degraded, convergence may still be reported from source
+evidence, but it must not claim review-confirmed convergence.
 
 Signals for convergence:
 
 - selected concept set is stable across the latest exploration round
-- new observations map into existing concepts rather than creating new top-level
-  concepts
-- remaining issues concern evidence depth, properties, rules, or lower-level
-  details
-- no lens raises a material objection that a selected concept is too broad, too
-  narrow, too generic, too implementation-specific, missing, or duplicated
+- new observations map into existing concepts rather than creating new
+  top-level concepts
+- remaining details map into `lower_level_detail_placements`
+- canonical relation graph is stable enough for Seed handoff
+- answerability scope supports the declared handoff questions
+- material coverage checkpoint discloses no open `missing_axis` or
+  `material_coverage_gap` pressure that blocks handoff
 - next frontier value is expected to improve confidence rather than change the
-  concept set
+  concept set, relation graph, or answerability scope
 
 Signals against convergence:
 
 - a new source slice introduces a previously missing purpose axis
 - selected concepts repeatedly require split or merge
-- relation direction between selected concepts changes
+- relation direction or kind between selected concepts changes
 - a selected concept cannot state included and excluded detail
+- answerability scope cannot support the declared handoff purpose
+- material coverage is biased toward one source surface without disclosure
 - a concept is only a code artifact, UI widget, schema artifact, spreadsheet
   range, or document section with no purpose-level role
 - the concept set explains source structure but not the declared purpose
 
-## 8. Seed Output Shape
+## 11. Seed Output Shape
 
 The Seed should center top-level concepts. Current artifacts may continue to use
 existing Seed claim fields while the contract migrates, but the semantic shape
 should project to:
 
 ```yaml
+seed_schema_version:
 purpose:
   claim_id:
   name:
   statement:
-  evidence_refs:
+  evidence_refs: []
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
 top_level_concepts:
   - concept_id:
     name:
+    aliases: []
     definition:
     why_top_level:
-    evidence_refs:
-    included_lower_concepts:
-    excluded_or_deferred_details:
-    core_relations:
-    open_questions:
+    evidence_refs: []
+    boundary:
+      included_summary:
+      excluded_summary:
+      deferred_summary:
     confidence:
+    provisional:
+    relation_participation:
+      status: connected | provisionally_isolated | boundary_isolated
+      isolation_reason:
+      isolation_pressure_ids: []
 top_level_relations:
   - relation_id:
     source_concept_id:
     target_concept_id:
-    relation:
+    relation_kind:
+    relation_axis:
+    relation_label:
+    direction_statement:
     statement:
-    evidence_refs:
-deferred_detail_candidates:
-  - name:
-    belongs_to_concept_id:
-    reason_deferred:
-    evidence_refs:
+    evidence_refs: []
+    confidence:
+    provisional:
+    registration_status:
+lower_level_detail_placements:
+  - detail_id:
+    name:
+    material_kind:
+    source_ref:
+    placement:
+    owner_concept_id:
+    rationale:
+    evidence_refs: []
+    follow_up_question:
+frontier_pressure_log:
+  - pressure_id:
+    origin:
+    origin_ref:
+    pressure_type:
+    pressure_question:
+    target_concept_ids: []
+    target_relation_ids: []
+    material_kind:
+    source_ref:
+    expected_decision_impact:
+    priority:
+    status: open | resolved | deferred | superseded | non_blocking
+    status_reason:
+    superseded_by_pressure_id:
+    evidence_refs: []
+material_coverage_checkpoint:
+  observed_material_kinds: []
+  observed_source_slices: []
+  source_authority_scope:
+    permission_scope: within_declared_boundary | restricted | unknown
+    permission_basis_refs: []
+    trust_status: observed_evidence_only | user_provided_authority | external_untrusted | mixed
+    instruction_authority_status: none_data_only | declared_process_authority | mixed_requires_disclosure
+    external_content_handling: not_applicable | treated_as_untrusted_data | sanitized_or_quoted | excluded
+    restricted_source_refs: []
+    rationale:
+  intentionally_excluded_material_kinds: []
+  unexplored_source_categories: []
+  possible_missing_axis_pressure_ids: []
+  rationale_for_seed_level_sufficiency:
+  partial_support_disclosures: []
 convergence:
   state:
-  rationale:
-  remaining_pressures:
+  source_convergence_rationale:
+  review_confirmed:
+  review_profile_ref:
+  remaining_pressure_ids: []
+lifecycle:
+  seed_id:
+  parent_seed_ref:
+  id_stability_scope:
+  session_id:
+  source_snapshot_refs: []
+  source_snapshot_transition:
+    prior_snapshot_refs: []
+    current_snapshot_refs: []
+    transition_reason:
+  prior_concept_mappings: []
+  prior_relation_mappings: []
+  exploration_rounds: []
+  concept_identity_events: []
+  relation_identity_events: []
+  pressure_events: []
+  detail_placement_events: []
+  answerability_events: []
+  material_coverage_events: []
+  convergence_events: []
+migration_records:
+  - migration_id:
+    source_field:
+    target_authority_field:
+    mapping_rule:
+    compatibility_status:
+    obligation_status:
+    rationale:
 ```
 
-If existing `entities`, `relations`, `actions`, `properties`, and `rules`
-fields are used before schema migration, they must be interpreted narrowly:
-
-- `entities` should contain only top-level concept candidates or explicitly
-  marked provisional top-level entities.
-- `relations` should contain only relations between top-level concepts.
-- `actions`, `properties`, and `rules` should be sparse and limited to
-  purpose-level facts that affect top-level concept boundaries or relations.
-- lower-level actions, properties, rules, fields, methods, UI elements, and
-  schema details should move to deferred detail or supporting notes.
-
-## 9. Lens Responsibilities
+## 12. Legacy Compatibility
+
+Existing `entities`, `relations`, `actions`, `properties`, `rules`, and
+`claim_id` fields may be used before schema migration, but they are
+compatibility projections, not the new semantic authority.
+
+Compatibility rules:
+
+- `seed_schema_version` must identify whether the artifact uses legacy,
+  transitional, or concept-centered shape.
+- `top_level_concepts` is the authority for selected top-level concepts.
+- `top_level_relations` is the authority for relations between selected
+  top-level concepts.
+- `lower_level_detail_placements` is the authority for demoted details.
+- `claim_id` remains a stable claim or record identifier and must not replace
+  user-facing `name`.
+- Legacy `entities` may mirror top-level concept candidates only when each item
+  maps to a `concept_id` or is explicitly marked provisional.
+- Legacy `relations` may mirror `top_level_relations` only when relation IDs and
+  endpoint IDs are preserved.
+- Legacy `actions`, `properties`, and `rules` must be sparse and limited to
+  purpose-level facts that affect top-level concept boundaries, relations, or
+  answerability.
+- Lower-level actions, properties, rules, fields, methods, UI elements, and
+  schema details must map to `lower_level_detail_placements`.
+- When both legacy and concept-centered fields exist, concept-centered fields
+  have precedence.
+
+Retired reconstruct-local seats must be mapped explicitly before an artifact can
+claim migration compatibility:
+
+| Retired or transitional seat | Target authority | Mapping requirement |
+|---|---|---|
+| `included_lower_concepts` | `lower_level_detail_placements` | Map each item to `placement: included_support` with `owner_concept_id`, source refs, and evidence refs. |
+| `excluded_or_deferred_details` | `lower_level_detail_placements` | Map excluded items to `excluded_boundary` and deferred items to `deferred_followup`; preserve rationale. |
+| `boundary_notes` | `top_level_concepts[].boundary` | Preserve boundary meaning in `included_summary`, `excluded_summary`, or `deferred_summary` according to the note's explicit inclusion, exclusion, or deferral meaning; final-output text remains derived from this boundary object. |
+| `core_relations` | `top_level_relations` | Preserve relation identity, endpoints, direction, kind, axis, and evidence refs; use relation lifecycle mappings/events for split or merge transitions. |
+| `open_questions` | `answerability_scope.deferred_questions` or `answerability_scope.unsupported_questions` | Preserve question IDs where possible; add frontier pressure refs when the question can change concept, relation, coverage, or convergence judgment. |
+| `deferred_detail_candidates` | `lower_level_detail_placements` | Map to `placement: deferred_followup`; add pressure refs when the deferred detail can affect Seed handoff readiness. |
+| `convergence.remaining_pressures` | `frontier_pressure_log` plus `convergence.remaining_pressure_ids` | Materialize each pressure as a pressure record with a non-ambiguous status; keep `remaining_pressure_ids` derived from known pressure IDs. |
+| prior `frontier_refs` shapes | `frontier_pressure_log`, `material_coverage_checkpoint`, and source frontier artifact refs | Preserve the source ref, pressure being resolved, observed or unexplored material slice, and evidence refs. |
+
+Migration records must preserve:
+
+- source field name
+- target authority field
+- mapping rule
+- compatibility status
+- obligation status
+- dropped or deferred fields with rationale
+- the specific retired seat mapping from the table above when the source field
+  is one of those seats
+
+`migration_records` is the canonical transitional migration seat. It may point
+to an external migration artifact when the record is too large for the Seed, but
+the Seed must still carry the ref and must not claim migration compatibility
+from prose alone.
+
+## 13. Lens Responsibilities
 
 Reconstruct lenses should evaluate top-level concept discovery rather than
 merely collecting claim improvements.
 
 | Lens | Discovery question |
 |---|---|
-| semantics | Are the concept names and definitions meaningfully distinct and grounded? |
-| structure | Is the concept set neither over-split nor over-merged? |
-| dependency | Do selected concepts have stable dependency and flow relations? |
-| pragmatics | Can target users understand and act on this concept set? |
-| evolution | Will the concepts survive likely implementation and material changes? |
-| coverage | Does the set cover the declared purpose without missing a major axis? |
-| logic | Are relations and boundaries coherent and non-contradictory? |
-| conciseness | Is the Seed compact enough to serve as a Seed rather than a full ontology? |
-| axiology | Does the concept set preserve what matters for trust, value, and declared purpose? |
-
-Lens disagreement should be represented as split, merge, boundary, abstraction,
-or missing-axis pressure when it can affect top-level convergence.
-
-## 10. Validation Expectations
+| semantics | Are concept names, definitions, legacy mappings, and relation labels meaningfully distinct and grounded? |
+| structure | Is the concept set neither over-split nor over-merged, and does the relation graph avoid orphan concepts unless explicitly provisional? |
+| dependency | Do selected concepts have stable dependency, flow, and direction relations? |
+| pragmatics | Can target users understand what questions and actions the Seed supports? |
+| evolution | Will identities, concepts, relations, and mappings survive likely implementation and material changes? |
+| coverage | Does the set cover the declared purpose across relevant material kinds without missing a major axis? |
+| logic | Are relations, boundaries, pressures, and convergence claims coherent and non-contradictory? |
+| conciseness | Is the Seed compact enough to serve as a Seed rather than a full ontology, without losing answerability? |
+| axiology | Does the concept set preserve what matters for trust, value, declared purpose, and authority boundaries? |
+
+Lens disagreement should be represented as `missing_axis`, `split_or_merge`,
+`boundary`, `core_relation`, `abstraction_level`, `answerability_gap`, or
+`material_coverage_gap` pressure when it can affect top-level convergence. A
+lens objection must first become a `frontier_pressure_log` entry with
+`origin: lens_objection` before convergence can treat it as resolved, deferred,
+or non-blocking.
+
+Lens outputs are optional convergence-strengthening evidence unless the
+specific runtime path declares them mandatory. When used for convergence, the
+runtime must record lens artifact refs, lens set, degraded lenses, and coverage
+limits.
+
+## 14. Validation Expectations
 
 Runtime validation should remain deterministic. It can validate:
 
 - artifact shape
 - required fields
 - known evidence refs
-- duplicate ids
+- duplicate IDs
 - relation endpoints referencing known top-level concepts
 - every top-level concept having at least one evidence ref
-- every top-level concept having a boundary statement
+- every top-level concept having a boundary object with included, excluded, and
+  deferred summaries
+- allowed `pressure_type` values
+- all pressure references pointing to known `frontier_pressure_log[].pressure_id`
+- allowed `frontier_pressure_log[].status` values and status-specific refs
+- no `converged_for_seed` claim while any frontier pressure remains `open`
+- pressure lifecycle event types, including `non_blocking`, matching known
+  pressure IDs, explicit prior/new status values, current pressure refs, and
+  supersession refs when applicable
+- concept lifecycle mapping/event types, including `split` and `merged`, with
+  prior/current concept ID arrays preserving continuity before cross-run
+  continuation or migration compatibility is claimed
+- concept lifecycle `alias_changed` events carrying prior and current alias
+  arrays so alias provenance can be reconstructed
+- relation lifecycle mapping/event types, including `split` and `merged`, with
+  prior/current relation ID arrays preserving continuity before cross-run
+  continuation or migration compatibility is claimed
+- answerability lifecycle event question/action refs pointing to known
+  `answerability_scope` question and action IDs
+- answerability question/action IDs being unique within `answerability_scope`
+- supported question answered-by concept and relation refs pointing to known Seed
+  authorities
+- supported action and action readiness refs pointing to known supported
+  questions/actions
+- allowed lower-level detail `placement` values
+- allowed `relation_kind` values
+- allowed `relation_axis` values and relation kind-axis pairing
+- concept `relation_participation` values, isolation refs, and connected status
+  by endpoint membership in `top_level_relations`
+- lifecycle continuity for preserved, renamed, split, merged, or demoted IDs
+- lifecycle lineage seats before cross-run continuation is claimed
+- migration records before legacy-to-concept-centered compatibility is claimed,
+  including explicit mappings for retired lower-detail, relation, question,
+  frontier, and pressure seats listed in the legacy compatibility section
+- `material_coverage_checkpoint` presence before `converged_for_seed`
+- material coverage source-authority enum values and source refs
+- material coverage lifecycle events for `source_authority_scope_changed`,
+  including changed authority field names and either prior/current state refs or
+  inline prior/current authority states
+- `possible_missing_axis_pressure_ids` and `remaining_pressure_ids` pointing to
+  known pressure IDs
 - convergence state being one of the allowed values once promoted
+- review-confirmed convergence not being claimed without review profile refs
 
 Runtime should not validate semantic truth such as whether `Usage Session` is
-really the right top-level concept. That remains LLM-authored and lens-reviewed.
+really the right top-level concept or whether a relation interpretation is
+meaningfully correct. That remains LLM-authored and lens-reviewed.
 
-## 11. Non-Goals
+## 15. Non-Goals
 
 This contract does not require:
 
@@ -366,22 +1057,50 @@ This contract does not require:
 - reading every source file
 - turning every source detail into a Seed claim
 - declaring lower-level implementation details final
+- registering relation labels as canonical ontology relation types at Seed time
+- proving full ontology design readiness
 
-## 12. Implementation Path
+## 16. Implementation Path
 
 Recommended implementation order:
 
-1. Update the Seed author prompt to make top-level concept discovery the primary
+1. Update the Seed author prompt to make top-level concept discovery,
+   answerability scope, and canonical relation graph authoring the primary
    objective.
-2. Add compact prompt payloads that pass candidate labels, gaps, evidence ids,
-   and unresolved top-levelness pressure rather than full artifacts.
-3. Add a design-local top-level concept projection in final output before
+2. Replace unregistered pressure labels with the canonical `pressure_type`
+   values. Use `abstraction_level` plus `expected_decision_impact` for demotion
+   decisions.
+3. Add compact prompt payloads that pass candidate labels, gaps, evidence IDs,
+   material slices, lifecycle refs, and unresolved frontier pressures rather
+   than full artifacts.
+4. Add a design-local top-level concept projection in final output before
    changing public schema.
-4. Add Seed validation checks for required `name`, boundary, evidence, compact
-   concept set, and relation endpoints.
-5. Add frontier rationale fields or prompt requirements that align every
-   source frontier request to top-level concept pressure.
-6. Add convergence projection to metrics and final output.
-7. Promote stable names through `.onto/authority/core-lexicon.yaml` only after
-   the artifact shape has stabilized.
-
+5. Add `top_level_relations` as the canonical relation authority and make
+   concept-level relation summaries derived.
+6. Add `lower_level_detail_placements` as the canonical demotion authority and
+   derive compatibility summaries from it.
+7. Add `frontier_pressure_log`, `material_coverage_checkpoint`, and bounded
+   iteration status to metrics and final output.
+8. Add `answerability_scope` and make `converged_for_seed` explicitly mean
+   Seed handoff readiness within that scope.
+9. Add lifecycle projections for the complete concept-centered Seed surface:
+   concept identity, relation identity, frontier pressure status transitions,
+   lower-level detail placement changes, answerability question/action changes,
+   material coverage and source-authority changes, and convergence changes.
+   Concept and relation lifecycle must cover provenance, aliasing, split, merge,
+   rename, demotion, direction/kind changes, and boundary changes where
+   applicable.
+10. Add legacy compatibility mapping for `entities`, `relations`, `actions`,
+    `properties`, `rules`, `claim_id`, and retired reconstruct-local seats such
+    as `included_lower_concepts`, `excluded_or_deferred_details`,
+    `core_relations`, `open_questions`, `deferred_detail_candidates`,
+    `convergence.remaining_pressures`, and prior `frontier_refs` shapes.
+11. Add deterministic Seed validation checks for required `name`, boundary,
+    evidence refs, allowed enum values, relation endpoints, lifecycle
+    continuity, retired-seat migration mappings, material coverage checkpoint
+    presence, and review profile refs when review-confirmed convergence is
+    claimed.
+12. Keep semantic compactness, concept correctness, relation correctness, and
+    purpose fitness under LLM authoring and lens review.
+13. Promote stable names through `.onto/authority/core-lexicon.yaml` only after
+    the artifact shape has stabilized.
diff --git a/IMPLEMENTATION_MAP.html b/IMPLEMENTATION_MAP.html
index fbb70ab..4542635 100644
--- a/IMPLEMENTATION_MAP.html
+++ b/IMPLEMENTATION_MAP.html
@@ -667,7 +667,7 @@
     <tr><td>Issue stance schema</td><td><span class="status active">active</span></td><td>Enum-valued stance fields use exact tokens; explanatory prose belongs in <code>rationale</code>.</td><td>keep validator fail-loud on enum drift</td></tr>
     <tr><td>Provider parity</td><td><span class="status design">later</span></td><td>Switcher shape and fail-loud pre-dispatch route guarantees exist for API/local providers; live provider quality/performance guarantees remain separate because they require real credentials/endpoints.</td><td>per-provider live conformance tasks with explicit credentials/endpoints</td></tr>
     <tr><td>Public binary boundary</td><td><span class="status active">active</span></td><td>Public binary exposes <code>onto mcp</code>; review execution remains available through MCP and repository-local development harnesses.</td><td>package/docs/tests alignment and TS check</td></tr>
-    <tr><td>reconstruct</td><td><span class="status active">direct-call integral path</span></td><td>Current contract lives under <code>.onto/processes/reconstruct/</code>. <code>top-level-concept-discovery-contract.md</code> defines the Seed as a purpose-relative top-level concept discovery artifact, not a full ontology or broad claim ledger; source frontier selection should target pressures that could change the top-level concept set, boundaries, core relations, or convergence confidence. It realigns reconstruct as a host-LLM-authored, runtime-gated ontology reconstruction path; source profiles are keyed by shared <code>target_material_kind</code> values from <code>.onto/processes/shared/target-material-kind-contract.md</code> and live under <code>.onto/processes/reconstruct/source-profiles/</code>, not active <code>explorers</code>. TS helpers write <code>target-material-profile.yaml</code>, <code>source-inventory.yaml</code>, <code>initial-source-frontier.yaml</code>, and <code>source-observations.yaml</code>, expand directory targets into per-member observations, validate source-observation boundaries, validate <code>SourceObservationDirective</code> evidence refs, validate <code>SeedCandidateDirective</code> shape, non-generic user-facing claim names, and evidence refs, and assemble primary <code>reconstruct-record.yaml</code> artifact refs. The material-aware runner now uses direct-call semantic authoring and host-mediated confirmation through the configured <code>llm</code> provider, then records round 1 lens judgments, exploration synthesis, source frontier plus validation, claim realization, bounded claim-summary confirmation, confirmation validation, competency-question validation/assessment with eligible-claim coverage, failure classification, revision proposal, <code>reconstruct-metrics.yaml</code>, <code>stop-decision.yaml</code>, provenance-checked <code>final-output.md</code>, and <code>reconstruct-run-manifest.yaml</code>. <code>src/core-api/reconstruct-api.ts</code> exposes prepare/run/status/result helpers; status/result include execution profile, skipped-stage authority impact, stage progress, liveness, count summaries, and artifact refs. MCP exposes <code>onto.list_source_profiles</code>, <code>onto.observe_source</code>, <code>onto.validate_reconstruct_directive</code>, <code>onto.reconstruct</code>, <code>onto.reconstruct_status</code>, and <code>onto.reconstruct_result</code>. Public runs default to <code>semanticAuthorRealization=direct_call</code> and <code>confirmationProviderRealization=direct_call</code>; provider/model/credential absence and invalid LLM-authored artifact shapes fail loud. Runtime validates artifacts and refs but does not author ontology meaning. Domain context selection remains the deferred artifact pair.</td><td>implement top-level concept projection/schema migration, then run live provider conformance with intentional credentials/endpoints and add real user-mediated confirmation when host support exists</td></tr>
+    <tr><td>reconstruct</td><td><span class="status active">direct-call integral path</span></td><td>Current contract lives under <code>.onto/processes/reconstruct/</code>. <code>top-level-concept-discovery-contract.md</code> defines the Seed as a purpose-relative top-level concept discovery artifact, not a full ontology or broad claim ledger; it now assigns authority for answerability scope, canonical <code>top_level_relations</code>, <code>lower_level_detail_placements</code>, frontier pressure, material coverage, convergence, lifecycle/provenance, obligation statuses, migration records, pressure ID normalization, pressure status semantics, answerability reference integrity, material source-authority boundaries, relation lifecycle continuity, complete concept-centered lifecycle coverage, relation participation/direction rules, and retired-seat legacy compatibility for the future concept-centered Seed shape. Source frontier selection should target pressures that could change the top-level concept set, boundaries, canonical relations, answerability scope, material coverage, or convergence confidence. It realigns reconstruct as a host-LLM-authored, runtime-gated ontology reconstruction path; source profiles are keyed by shared <code>target_material_kind</code> values from <code>.onto/processes/shared/target-material-kind-contract.md</code> and live under <code>.onto/processes/reconstruct/source-profiles/</code>, not active <code>explorers</code>. TS helpers write <code>target-material-profile.yaml</code>, <code>source-inventory.yaml</code>, <code>initial-source-frontier.yaml</code>, and <code>source-observations.yaml</code>, expand directory targets into per-member observations, validate source-observation boundaries, validate <code>SourceObservationDirective</code> evidence refs, validate <code>SeedCandidateDirective</code> shape, non-generic user-facing claim names, and evidence refs, and assemble primary <code>reconstruct-record.yaml</code> artifact refs. The material-aware runner now uses direct-call semantic authoring and host-mediated confirmation through the configured <code>llm</code> provider, then records round 1 lens judgments, exploration synthesis, source frontier plus validation, claim realization, bounded claim-summary confirmation, confirmation validation, competency-question validation/assessment with eligible-claim coverage, failure classification, revision proposal, <code>reconstruct-metrics.yaml</code>, <code>stop-decision.yaml</code>, provenance-checked <code>final-output.md</code>, and <code>reconstruct-run-manifest.yaml</code>. <code>src/core-api/reconstruct-api.ts</code> exposes prepare/run/status/result helpers; status/result include execution profile, skipped-stage authority impact, stage progress, liveness, count summaries, and artifact refs. MCP exposes <code>onto.list_source_profiles</code>, <code>onto.observe_source</code>, <code>onto.validate_reconstruct_directive</code>, <code>onto.reconstruct</code>, <code>onto.reconstruct_status</code>, and <code>onto.reconstruct_result</code>. Public runs default to <code>semanticAuthorRealization=direct_call</code> and <code>confirmationProviderRealization=direct_call</code>; provider/model/credential absence and invalid LLM-authored artifact shapes fail loud. Runtime validates artifacts and refs but does not author ontology meaning. Domain context selection remains the deferred artifact pair.</td><td>implement concept-centered Seed projection/schema migration, then run live provider conformance with intentional credentials/endpoints and add real user-mediated confirmation when host support exists</td></tr>
     <tr><td>future evolve</td><td><span class="status design">design contract</span></td><td><code>.onto/processes/evolve/material-kind-adapter-contract.md</code> keeps future brownfield evolve target handling material-aware: adapter dispatch starts from <code>target_material_kind</code>, non-code targets do not fall through to a code-product adapter, and runtime owns observations/refs while the host LLM and user-mediated flow own design inquiry and specification content. No active evolve runtime or MCP tool is wired.</td><td>design evolve core API and MCP surface only after review/reconstruct stabilize</td></tr>
     <tr><td>learn / govern</td><td><span class="status retired">archived</span></td><td>Legacy runtime code and process docs are outside the current product runtime and are isolated under <code>development-records/archive</code>. Review remains the only wired productized path.</td><td>separate MCP design after review/reconstruct stabilize</td></tr>
   </table>
diff --git a/README.md b/README.md
index a232c8e..0b17687 100644
--- a/README.md
+++ b/README.md
@@ -281,7 +281,15 @@ UX expectations in `.onto/processes/reconstruct/reconstruct-execution-ux-contrac
 Seed discovery is further constrained by
 `.onto/processes/reconstruct/top-level-concept-discovery-contract.md`, which
 defines the Seed as a purpose-relative top-level concept discovery artifact
-rather than a full ontology or broad claim ledger.
+rather than a full ontology or broad claim ledger. The contract defines
+answerability scope, canonical `top_level_relations`,
+`lower_level_detail_placements`, frontier pressure, material coverage,
+convergence, lifecycle/provenance, obligation statuses, migration records,
+pressure ID normalization, pressure status semantics, answerability reference
+integrity, material source-authority boundaries, relation lifecycle continuity,
+complete concept-centered lifecycle coverage, relation participation/direction
+rules, and retired-seat legacy compatibility authority for the future
+concept-centered Seed shape.
 
 ## Repository Map
