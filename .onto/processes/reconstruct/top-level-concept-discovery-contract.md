# Reconstruct Top-Level Concept Discovery Contract

> Status: active design/runtime contract for the transitional Seed path.
> Purpose: define how `reconstruct` discovers purpose-relative top-level
> concepts for an ontology Seed without turning the Seed into a broad claim
> ledger or a full ontology draft.

## 1. Position

`reconstruct` Seed generation is a top-level concept discovery process.

The Seed is not the full ontology. It is not a complete list of entities,
relations, actions, properties, rules, implementation details, or all possible
evidence-backed claims. Its purpose is to identify the smallest stable set of
top-level concepts that explains the declared purpose of the target material,
with explicit boundaries, evidence, supported/deferred/unsupported handoff
questions, and deferred lower-level details.

Top-level concepts are purpose-relative. They are not the highest possible
abstractions in a universal hierarchy. A concept is top-level for a reconstruct
run when it is the most useful stable axis for explaining the declared purpose
from the observed source evidence.

Example:

```text
RawIngestEvent
-> Usage Event
-> Usage Activity
-> User Behavior
-> Organizational Knowledge Flow
```

For an AI usage dashboard Seed, `Usage Event` may be a top-level concept while
`Organizational Knowledge Flow` is too abstract and `RawIngestEvent` is usually
a lower-level implementation detail.

## 2. Ownership Boundary

Runtime owns material-aware observation, source inventories, artifact refs,
validation gates, deterministic metrics, source frontier boundary checks,
artifact shape validation, evidence-ref validation, and provenance capture.

The host LLM owns semantic grouping, abstraction-level judgment, top-level
concept naming, boundary explanation, relation interpretation, convergence
interpretation, answerability interpretation, and final user-facing explanation.

Runtime must not decide that a source symbol, spreadsheet range, document
section, database table, UI component, or service method is a top-level concept.
Runtime may validate that LLM-authored top-level concept artifacts cite known
evidence refs, preserve declared artifact shape, preserve relation endpoint
integrity, and disclose unresolved pressures.

Runtime may validate deterministic compactness bounds, such as count range
warnings or duplicate labels. Runtime must not validate semantic compactness or
purpose fitness. Those judgments remain LLM-authored and lens-reviewed.

## 3. Reconstruct-Local Terms

These names are promoted for the current `reconstruct` transitional Seed
artifact and TypeScript implementation surface. They remain reconstruct-local:
cross-process vocabulary, stable MCP public fields, and core lexicon entries
still require the concept registration gate in
`reconstruct-boundary-contract.md`.

| Term | Seat | Meaning |
|---|---|---|
| `TopLevelConcept` | reconstruct-local semantic artifact candidate | Purpose-relative concept that explains multiple lower-level observations and remains stable across likely implementation changes. |
| `TopLevelConceptSet` | reconstruct-local semantic artifact candidate | Small selected set of top-level concepts for the declared purpose. |
| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, section, claim, or UI detail that supports a top-level concept rather than becoming the Seed center. |
| `FrontierPressure` | design shorthand | Lifecycle-tracked pressure record that may be open, resolved, deferred, superseded, or non-blocking, and may change the selected concept set, concept boundary, core relation, answerability, material coverage, or convergence confidence. |
| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, canonical relations, answerability scope, or material coverage for the declared purpose. |
| `SeedAnswerability` | design shorthand | Bounded set of questions and actions that the Seed can support for the declared purpose. |
| `SeedLifecycle` | design shorthand | Design-local identity, provenance, and change history for concepts, relations, lower-level placements, answerability, material coverage, frontier pressure, and convergence artifacts across exploration rounds. |

Do not introduce additional reconstruct-local concept names beyond this table as
new TypeScript concept types, MCP fields, public artifact fields, or enum values
before the concept registration gate is explicitly closed for those names. The
schema fields and enum surfaces explicitly listed in the obligation map below
are allowed implementation seats for this contract; they must preserve the
authorities defined here and must not be treated as cross-process ontology
concepts until promoted.

TypeScript names that model these artifact records, such as
`ReconstructTopLevelConcept`, `ReconstructFrontierPressure`, or
`ReconstructSeedLifecycle`, are implementation seats for the reconstruct Seed
runtime contract. They are not independent ontology concepts and do not promote
the corresponding semantic terms beyond the reconstruct-local boundary.

### 3.1 Obligation Status And Promotion Boundary

This contract separates reconstruct-local implementation authority from
cross-process promotion. A field name appearing in this document is not
automatically a cross-process public schema or core lexicon term until it passes
the registration and schema migration gate.

Obligation statuses:

| Status | Meaning |
|---|---|
| `current_required` | Required by the implemented runtime path now. |
| `transitional_required` | Required while legacy and concept-centered shapes coexist, if the related behavior is claimed. |
| `concept_centered_target_required` | Required before the concept-centered Seed shape can be called implemented. |
| `compatibility_allowed` | Allowed as a legacy projection, but not the authority. |
| `future_promotion_gated` | Reconstruct-local until promoted through core lexicon and public schema registration. |
| `derived_summary` | Computed or user-facing projection from an authority seat. |

Current obligation map:

| Area | Obligation status | Authority rule |
|---|---|---|
| Runtime shape, evidence-ref, enum, duplicate ID, endpoint, and artifact-ref validation | `current_required` | Runtime owns deterministic validation and must fail loud when the current path claims the check. |
| Existing `claim_id`, `entities`, `relations`, `actions`, `properties`, and `rules` fields | `compatibility_allowed` | They may remain in transitional artifacts but must not override concept-centered authorities. |
| `migration_records` | `transitional_required` | Required when a Seed exposes both legacy and concept-centered fields or claims migration compatibility; not required for a pure `concept_centered` Seed with no legacy projection. |
| `answerability_scope`, `top_level_concepts`, `top_level_relations`, `lower_level_detail_placements`, `frontier_pressure_log`, `material_coverage_checkpoint`, `convergence`, and `lifecycle` | `concept_centered_target_required` | Required for the concept-centered Seed target shape before implementation closure. |
| Reconstruct-local TypeScript artifact types and transitional artifact fields for the terms in Section 3 | `current_required` | Promoted only within the reconstruct Seed runtime contract; validator and authoring code may use these names as implementation seats. |
| MCP fields, cross-process stable schema fields, and core lexicon terms for the reconstruct-local names | `future_promotion_gated` | Promotion requires the concept registration gate and explicit schema migration. |
| Per-concept relation summaries, boundary summaries, final-output explanations, and progress summaries | `derived_summary` | They must derive from canonical artifact seats and cannot become competing truth. |

An implementation stage may be called complete only for the obligation statuses
it actually implements. If a runtime path exposes a `future_reconstruct_or_review_run`
consumer, it must either narrow the consumer to same-session continuation or
provide the lineage seats defined by the lifecycle contract.

## 4. Seed Answerability Contract

The Seed is a handoff artifact for purpose-relative top-level concept discovery.
It supports bounded interpretation and next-step decisions; it does not certify
full ontology readiness.

Minimum Seed consumers:

- `principal_user`: reads the Seed to understand the service purpose and the
  top-level structure discovered so far.
- `ontology_author`: uses the Seed as input for later ontology formalization.
- `runtime_validator`: checks shape, refs, identity stability, relation
  endpoint integrity, and disclosed convergence inputs.
- `future_reconstruct_or_review_run`: uses the Seed lineage and unresolved
  pressures for same-session continuation by default. Cross-run continuation is
  supported only when lifecycle lineage seats identify the parent Seed, source
  snapshot transition, prior/current ID arrays in identity events, and ID
  stability scope.

Allowed Seed-stage actions:

- explain the declared purpose in user-facing language
- inspect the selected top-level concepts and why they are top-level
- inspect relation hypotheses between selected top-level concepts
- decide whether more source exploration is needed before handoff
- identify deferred details and deferred or unsupported handoff questions for
  later ontology work
- plan a later registration, review, evolve, or implementation step

Unsupported Seed-stage actions:

- treat the Seed as a complete ontology graph
- treat `converged_for_seed` as full ontology design readiness
- treat relation labels as registered canonical ontology relation types
- treat lower-level details as exhaustive
- treat runtime validation as semantic approval

The Seed must carry `answerability_scope`:

```yaml
answerability_scope:
  declared_handoff_questions:
    - question_id:
      question:
      source: declared_purpose | user_request | domain_profile | lens_requirement
  supported_questions:
    - question_id:
      answered_by:
        concept_ids: []
        relation_ids: []
      confidence:
  deferred_questions:
    - question_id:
      reason_deferred:
      frontier_pressure_ids: []
  unsupported_questions:
    - question_id:
      reason_unsupported:
  supported_actions:
    - action_id:
      action:
      supported_by_question_ids: []
      readiness_statement:
  unsupported_actions:
    - action_id:
      action:
      reason_unsupported:
  handoff_readiness_statement:
  handoff_readiness_question_ids: []
```

Answerability validation is deterministic and reference-based:

- every `declared_handoff_questions[].question_id` is unique
- every `supported_questions[].question_id`, `deferred_questions[].question_id`,
  and `unsupported_questions[].question_id` is unique across the status buckets
- the union of `supported_questions`, `deferred_questions`, and
  `unsupported_questions` question IDs is exactly the
  `declared_handoff_questions` ID set
- every `supported_actions[].action_id` and `unsupported_actions[].action_id`
  is unique across the action buckets
- every `supported_questions[].answered_by.concept_ids[]` points to a known
  `top_level_concepts[].concept_id`
- every `supported_questions[].answered_by.relation_ids[]` points to a known
  `top_level_relations[].relation_id`
- each supported question has at least one answered-by concept or relation
- every `supported_actions[].supported_by_question_ids[]` points to a known
  `supported_questions[].question_id`
- `supported_actions[].supported_by_question_ids[]` is the canonical support
  edge from questions to actions; do not add a reverse action-readiness edge to
  supported questions
- every `deferred_questions[].frontier_pressure_ids[]` points to a known
  `frontier_pressure_log[].pressure_id`
- every `handoff_readiness_question_ids[]` points to a known
  `declared_handoff_questions[].question_id`

`converged_for_seed` means that the Seed is ready for top-level concept handoff
within this answerability scope. It does not mean full ontology readiness.
Question status is encoded by membership in `supported_questions`,
`deferred_questions`, or `unsupported_questions`; do not repeat a separate
`question_status` field inside those grouped items.

## 5. Discovery Strategy

Top-level concept discovery uses bottom-up observation, top-down purpose
constraint, graph compression, and frontier-directed iteration.

The process is not "keep climbing the hierarchy." It alternates between lifting
source details into candidate concepts and grounding those candidates back into
the declared purpose and observed evidence.

```text
material-aware source observations
-> local semantic labels and gaps
-> candidate concept clusters
-> abstraction-level tests
-> top-level concept set
-> canonical relation graph
-> source frontier aligned to unresolved frontier pressure
-> answerability and convergence assessment
```

### 5.1 Collect Local Candidates

The first semantic pass may name many local candidates from files, symbols,
tables, fields, formulas, headings, UI components, services, actions, states,
rules, and document claims. This pass should avoid deciding top-level status too
early.

Local candidates are evidence-bearing raw material for clustering. They are not
Seed output by default.

### 5.2 Cluster By Purpose Role

Local candidates should be clustered by the role they play in explaining the
declared purpose:

- shared lifecycle
- shared user-facing meaning
- shared source flow
- shared ownership or authority
- shared change fate
- repeated co-occurrence across material slices
- ability to explain multiple lower-level observations

Example for an AI usage dashboard:

| Local candidates | Candidate top-level concept |
|---|---|
| session row, session metrics, session context, session classification | `Usage Session` |
| raw payload, ingest event, fingerprint, deduplication status | `Usage Event` |
| billing aggregate, cost KPI, token cost, provider cost | `Usage Cost` |
| page, KPI cards, session table, analytics summary | `Dashboard View` |

### 5.3 Test Abstraction Level

Each candidate must pass both upward and downward tests.

Upward test:

- Does this candidate explain multiple lower-level observations?
- Does it survive likely implementation changes?
- Is it necessary to explain the declared purpose?
- Can a user understand it without reading implementation names?

Downward test:

- Is it still grounded in concrete evidence?
- Does it avoid becoming a generic business abstraction?
- Does it preserve enough boundary detail to guide later ontology work?
- Does it avoid hiding materially different concepts that must be split?

The target is the stable middle level that explains the purpose, not the most
abstract reachable parent.

### 5.4 Select A Small Concept Set

The Seed should prefer a compact top-level concept set. The normal target range
is small enough for a user to inspect in one pass, usually 3-7 concepts for a
bounded product slice.

The concept set may be larger when the declared purpose or target bundle is
explicitly broad, but growth must be justified by purpose coverage, not by
implementation surface area.

Runtime may warn when the concept count is outside configured deterministic
bounds. Runtime must not decide whether the concept set is semantically compact
enough.

## 6. Concept Identity And Lifecycle

Every design-local top-level concept and relation must have stable identity
within the reconstruct session.

Identity rules:

- `concept_id` and `relation_id` are opaque stable identifiers within the Seed.
- User-facing `name` may change when the LLM improves wording.
- Renaming a concept must preserve `concept_id` when the semantic boundary is
  unchanged.
- Splitting one concept into multiple concepts must create new concept IDs and
  record the source concept ID in `concept_identity_events`.
- Merging concepts must create or select a surviving concept ID and record the
  merged concept IDs in `concept_identity_events`.
- Demoting a concept to lower-level detail must preserve its prior ID in change
  history and move the current representation to the lower-level detail
  placement authority.
- Relation endpoint IDs must reference current top-level concept IDs.

The Seed must carry `lifecycle`:

```yaml
lifecycle:
  seed_id:
  parent_seed_ref:
  id_stability_scope: session | lineage
  session_id:
  source_snapshot_refs: []
  source_snapshot_transition:
    prior_snapshot_refs: []
    transition_reason:
  exploration_rounds:
    - round_id:
      observed_source_refs: []
      authoring_pass_ref:
      changed_concept_ids: []
      changed_relation_ids: []
      changed_frontier_pressure_ids: []
  concept_identity_events:
    - event_id:
      event_type: created | renamed | alias_changed | split | merged | demoted | boundary_changed
      prior_concept_ids: []
      current_concept_ids: []
      target_detail_ids: []
      prior_names: []
      new_names: []
      prior_aliases: []
      current_aliases: []
      reason:
      evidence_refs: []
      frontier_pressure_ids: []
  relation_identity_events:
    - event_id:
      event_type: created | changed_direction | changed_kind | split | merged | removed
      prior_relation_ids: []
      current_relation_ids: []
      reason:
      evidence_refs: []
      frontier_pressure_ids: []
  pressure_events:
    - event_id:
      event_type: created | resolved | deferred | reopened | superseded | non_blocking
      pressure_id:
      prior_status:
      new_status:
      superseded_by_pressure_id:
      reason:
      evidence_refs: []
  detail_placement_events:
    - event_id:
      event_type: placed | changed_owner | changed_placement | removed
      detail_ids: []
      reason:
      evidence_refs: []
      frontier_pressure_ids: []
  answerability_events:
    - event_id:
      event_type: question_supported | question_deferred | question_unsupported | action_supported | action_unsupported
      question_ids: []
      action_ids: []
      frontier_pressure_ids: []
      reason:
  material_coverage_events:
    - event_id:
      event_type: source_slice_added | material_kind_excluded | coverage_gap_disclosed | coverage_gap_resolved | source_authority_scope_changed
      source_refs: []
      material_kinds: []
      changed_authority_fields: []
      prior_authority_state_ref:
      current_authority_state_ref:
      prior_authority_state:
      current_authority_state:
      frontier_pressure_ids: []
      reason:
  convergence_events:
    - event_id:
      prior_state:
      new_state:
      frontier_pressure_ids: []
      reason:
```

Material coverage event material-kind authority is event-type specific:

- `source_slice_added` and `coverage_gap_resolved` must cite `source_refs`; each
  `material_kinds[]` value must be proven by those event-local source refs.
- `material_kind_excluded` uses
  `material_coverage_checkpoint.intentionally_excluded_material_kinds` as its
  material-kind authority; event-local `source_refs` do not authorize exclusion
  material kinds.
- `coverage_gap_disclosed` may name the disclosed gap kind without claiming that
  the kind was observed in a source slice.
- `source_authority_scope_changed` may carry material kinds only when they are
  tied to event-local `source_refs`; checkpoint-wide observed kinds are not a
  substitute for event provenance.

This lifecycle projection is design-local until schema registration, but the
runtime must preserve equivalent artifact truth before claiming iterative
convergence, migration compatibility, or cross-run continuation. Same-session
identity may use `id_stability_scope: session`; any cross-run consumer requires
`id_stability_scope: lineage` plus parent Seed and prior/current ID arrays in
`concept_identity_events` and `relation_identity_events`.
`source_snapshot_refs` is the current source snapshot authority.
`source_snapshot_transition` is required in concept-centered Seed artifacts so
lineage state is never implied only by prose.
`source_snapshot_transition.prior_snapshot_refs` records the previous source
snapshot set when a parent Seed exists. In the transitional runtime, prior
snapshot refs are parent-scope refs: validation requires `parent_seed_ref`,
non-empty prior refs for `id_stability_scope: lineage`, and non-overlap with
current `source_snapshot_refs`, but does not resolve prior refs against the
current source observation inventory unless parent metadata is loaded.
Do not repeat current source snapshot IDs inside `source_snapshot_transition`.
`concept_identity_events` and `relation_identity_events` are the canonical
authority for lifecycle transitions. For concept and relation `split` and
`merged` lifecycle events, their prior/current ID array fields are the
authority: `split` maps one prior item to multiple current items, and `merged`
maps multiple prior items to one current item. One-to-one transitions are also
encoded as one-element arrays so lifecycle transition authority has a single
shape. Derived transition summaries may be generated for display or migration
reports, but they must not be stored as parallel Seed lifecycle authority.
For `demoted`, `current_concept_ids` must be empty and `target_detail_ids` must
point to the `lower_level_detail_placements` record where the prior top-level
concept now lands.

## 7. Relation Graph Authority

`top_level_relations` is the canonical relation graph authority for the Seed.
Per-concept relation summaries may exist only as derived projections.

Each selected top-level concept should participate in at least one
`top_level_relations` entry as either `source_concept_id` or
`target_concept_id`, unless it carries an explicit relation-participation
exception with a reason and pressure refs.

Relation participation exception projection:

```yaml
relation_participation_exceptions:
  - concept_id:
    isolation_reason:
    isolation_pressure_ids: []
```

`relation_participation_exceptions` is an exception/projection seat for concepts
that are not connected by `top_level_relations` yet. It is not a second relation
authority and must not duplicate endpoint membership. Connected participation is
derived by checking whether the concept appears as `source_concept_id` or
`target_concept_id` in at least one `top_level_relations` record. Isolation
pressure refs must point to `frontier_pressure_log[].pressure_id`.

Minimum relation record:

```yaml
top_level_relations:
  - relation_id:
    source_concept_id:
    target_concept_id:
    relation_kind:
    relation_label:
    direction_statement:
    statement:
    evidence_refs:
    confidence:
    provisional: true
    registration_status: design_local
```

`source_concept_id` and `target_concept_id` are ordered endpoints. For
directional relation kinds, endpoint order is the asserted semantic direction.
For `related_to`, endpoint order is stable artifact serialization only, not a
semantic direction claim. `direction_statement` must explain either the
directional meaning or the absence of directional meaning in user-facing
language.

Design-local relation kinds:

| Kind | Axis | Direction rule | Use when |
|---|---|---|---|
| `depends_on` | `dependency_flow` | source depends on target | One concept needs another to exist, be interpreted, or be computed. |
| `enables` | `dependency_flow` | source enables target | One concept makes another possible or operational. |
| `produces` | `dependency_flow` | source produces target | One concept creates or emits another. |
| `consumes` | `dependency_flow` | source consumes target | One concept reads, uses, or aggregates another. |
| `represents` | `representation_projection` | source represents target | One concept is a view, projection, or representation of another. |
| `governs` | `governance_constraint` | source governs target | One concept constrains, validates, authorizes, or classifies another. |
| `groups` | `grouping_taxonomy` | source groups target | One concept groups or organizes several instances of another. |
| `part_of` | `structural_composition` | source is part of target | One concept is a component or bounded part of another. |
| `related_to` | `association` | direction is not semantically asserted | A relation is observed but its specific kind is not yet stable. |

The `Axis` column is a derived projection of `relation_kind`, not a stored Seed
field. Valid derived axis values are `dependency_flow`,
`structural_composition`, `representation_projection`,
`governance_constraint`, `grouping_taxonomy`, and `association`. For
`related_to`, `direction_statement` must state that no directional semantic
claim is being made and explain why the relation is still useful at Seed stage.

Relation labels remain design-local until promoted. Runtime may validate
endpoint integrity, allowed relation kind, duplicate relation IDs, concept
participation refs, isolation pressure refs, derived relation axis projection,
and evidence refs. Runtime must not decide semantic relation correctness.

## 8. Lower-Level Detail Placement

`lower_level_detail_placements` is the canonical authority for demoted details.
Other fields may expose summaries, but they must derive from this placement
authority.
Demotion lineage from a prior top-level concept to a detail is not stored on the
detail placement record. That bridge is owned only by
`concept_identity_events[].target_detail_ids`.
Each placement must carry a non-empty `source_ref` that points to known observed
source material and is consistent with its evidence refs.

Canonical placement record:

```yaml
lower_level_detail_placements:
  - detail_id:
    name:
    material_kind:
    source_ref:
    placement:
    owner_concept_id:
    rationale:
    evidence_refs:
    follow_up_question:
```

Allowed `placement` values:

| Placement | Meaning |
|---|---|
| `included_support` | Detail supports the concept boundary but is not top-level. |
| `excluded_boundary` | Detail is explicitly outside the concept boundary. |
| `deferred_followup` | Detail may matter later but does not change Seed handoff now. |
| `open_question` | Detail exposes a question that may change boundary or relation judgment. |

Concept-level fields such as `included_lower_concepts`,
`excluded_or_deferred_details`, `open_questions`, and `boundary_notes` are
allowed only as derived user-facing summaries or compatibility projections.
They must not become competing authority seats.

## 9. Source Frontier Artifact And Iteration

Source frontier selection must align to top-level concept convergence.

The frontier should not ask "what else can be read?" It should ask "what source
could materially change the selected top-level concept set, concept boundaries,
core relations, answerability scope, or convergence confidence?"

`frontier_pressure_log` is the design-local authority for frontier pressure.
Each LLM-authored frontier ref must carry the pressure it is meant to resolve.
All pressure references in lifecycle, answerability, material coverage,
convergence, relation participation, and final-output summaries must point to
`frontier_pressure_log[].pressure_id`. Downstream fields may summarize pressure
state, but they must be ID projections or derived text from this log.

Canonical frontier pressure record:

```yaml
frontier_pressure_log:
  - pressure_id:
    origin: source_observation | lens_objection | material_coverage | answerability_check | lifecycle_event
    origin_ref:
    pressure_type:
    pressure_question:
    target_concept_ids: []
    target_relation_ids: []
    material_kind:
    source_ref:
    expected_decision_impact:
    priority:
    status: open | resolved | deferred | superseded | non_blocking
    status_reason:
    superseded_by_pressure_id:
    evidence_refs: []
```

Valid `pressure_type` values:

| Pressure | Use when |
|---|---|
| `missing_axis` | The declared purpose may require a top-level concept not yet represented. |
| `split_or_merge` | Two candidates may be the same concept, or one candidate may hide two materially different concepts. |
| `boundary` | A concept's included and excluded lower-level details are unclear. |
| `core_relation` | A relation between selected concepts may be wrong, missing, mistyped, or directionally unstable. |
| `abstraction_level` | A candidate may be too implementation-specific or too generic. |
| `evidence_saturation` | The run needs to know whether additional source will introduce new top-level concepts or only reinforce existing ones. |
| `answerability_gap` | The Seed cannot yet answer a purpose-facing question required for handoff. |
| `material_coverage_gap` | A relevant source material kind or source slice may be underrepresented. |

Do not use unregistered pressure labels such as `split_or_demote`.
Demotion belongs in `expected_decision_impact` and, if realized, in
`lower_level_detail_placements`.

Valid `frontier_pressure_log[].status` values:

| Status | Meaning | Validation requirement |
|---|---|---|
| `open` | The pressure is unresolved and may still change top-level concepts, boundaries, relations, answerability, coverage, or convergence confidence. | `converged_for_seed` must not be claimed while any pressure remains `open`. |
| `resolved` | The pressure has been answered by observed source, lens resolution, or Seed revision. | `evidence_refs` includes the resolving source or review artifact. |
| `deferred` | The pressure is real but intentionally left for a later stage or narrower purpose. | `status_reason` explains why deferral does not block the declared Seed purpose. |
| `superseded` | A newer pressure replaces this pressure. | `superseded_by_pressure_id` is non-empty and points to a known pressure. |
| `non_blocking` | The pressure remains visible but does not affect Seed-level handoff for the declared purpose. | `status_reason` explains why it does not block convergence. |

Only `resolved` pressure states and `resolved` lifecycle pressure events require
non-empty resolving `evidence_refs`. Other statuses still validate any supplied
evidence refs, but may be disclosed with `origin_ref`, `source_ref`, and
`status_reason` before resolving evidence exists.

Runtime validation rejects unknown pressure statuses, dangling or blank
`superseded_by_pressure_id` refs, successor refs on non-`superseded`
pressures, pressure event transition mismatches, final pressure-event status
that disagrees with `frontier_pressure_log[].status`, successor disagreement
between lifecycle pressure events and `frontier_pressure_log`, and convergence
claims that leave any `open` pressure unresolved. Pressure lifecycle events are
an ordered history per pressure: each event's `prior_status` must match the
previous event's `new_status` when a previous event exists; only the final event
must match the current pressure-log status.

Example:

```yaml
frontier_pressure_log:
  - pressure_id: pressure-usage-mart-abstraction
    origin: source_observation
    origin_ref: source-observation:src/services/usage-mart.service.ts
    pressure_type: abstraction_level
    pressure_question: Is UsageMart a top-level concept or a lower-level read model under Usage Cost or Dashboard View?
    target_concept_ids:
      - concept-usage-cost
      - concept-dashboard-view
      - concept-usage-mart
    material_kind: code
    source_ref: src/services/usage-mart.service.ts
    expected_decision_impact: May demote UsageMart from top-level concept to supporting detail.
    priority: high
    status: open
    status_reason: Awaiting source evidence that decides abstraction level.
    superseded_by_pressure_id:
    evidence_refs: []
```

### 9.1 Material Coverage Checkpoint

Before a run can claim `evidence_saturation` or `converged_for_seed`, it must
carry a material-aware coverage checkpoint:

```yaml
material_coverage_checkpoint:
  observed_material_kinds: []
  observed_source_slices: []
  source_authority_scope:
    permission_scope: within_declared_boundary | restricted | unknown
    permission_basis_refs: []
    trust_status: observed_evidence_only | user_provided_authority | external_untrusted | mixed
    instruction_authority_status: none_data_only | declared_process_authority | mixed_requires_disclosure
    external_content_handling: not_applicable | treated_as_untrusted_data | sanitized_or_quoted | excluded
    restricted_source_refs: []
    rationale:
  intentionally_excluded_material_kinds: []
  unexplored_source_categories: []
  possible_missing_axis_pressure_ids: []
  rationale_for_seed_level_sufficiency:
  partial_support_disclosures: []
```

The checkpoint does not require reading every source file. It requires
disclosing whether the observed material boundary is sufficient for Seed-level
top-level concept handoff.

`source_authority_scope` records the trust and permission boundary for source
material that enters LLM-authored Seed authority artifacts. Source material is
observational evidence by default; it does not gain instruction authority over
the reconstruct process, schema, validation gates, or output obligations unless
the run explicitly records `declared_process_authority`. Runtime validation can
check the enum values and source refs, while the host LLM remains responsible
for interpreting whether the recorded boundary is semantically sufficient.

### 9.2 Bounded Iteration Rule

Each exploration round must follow this loop:

1. Observe the selected source frontier within the material boundary.
2. Let the LLM update concepts, relations, lower-level placements,
   answerability scope, and frontier pressure.
3. Runtime validates shape, evidence refs, relation endpoints, pressure enum
   values, material coverage checkpoint presence, and lifecycle continuity.
4. Compare the current concept set, relation graph, frontier pressure log, and
   answerability scope against the prior round.
5. Decide one of:
   - continue exploration
   - provisionally hand off with disclosed unresolved pressures
   - hand off as `converged_for_seed`
   - halt with validation failure

The loop may stop at `converged_for_seed` only when no pressure remains `open`.
Any unresolved pressure that does not block Seed handoff must be recorded with a
non-open status such as `deferred` or `non_blocking` and a status reason.

## 10. Convergence Contract

Top-level concept discovery converges when further source exploration is
expected to refine evidence, properties, rules, or lower-level details, but is
not expected to materially change the selected top-level concept set, each
concept's boundary, the canonical relation graph, or the answerability scope for
the declared purpose.

Convergence is not the absence of all issues. It is a bounded claim about the
stability of the Seed as a top-level concept handoff artifact.

The run may report one of three convergence states:

| State | Meaning | Typical next action |
|---|---|---|
| `not_converged` | Top-level concepts, boundaries, relations, answerability scope, or material coverage are still changing materially. | Continue source frontier exploration. |
| `provisionally_converged` | The main Seed is stable, but some disclosed pressures remain that do not block bounded handoff. | Present Seed with limits and revision proposals. |
| `converged_for_seed` | Purpose coverage, concept boundaries, canonical relations, answerability scope, and material coverage are stable enough for Seed handoff. | Present Seed as the current top-level concept discovery result. |

Required convergence inputs:

- latest `top_level_concepts`
- latest canonical `top_level_relations`
- latest `lower_level_detail_placements`
- latest `frontier_pressure_log`
- latest `answerability_scope`
- latest `material_coverage_checkpoint`
- lifecycle events for changes since the prior round
- runtime validation result for deterministic shape and refs

Optional review-confirmed convergence input:

- reconstruct lens judgment artifacts may strengthen convergence only when the
  run records the lens profile, lens set, execution status, degraded lenses, and
  artifact refs.

Absence of lens objections is positive convergence evidence only when a lens
pass actually ran and its coverage limits are recorded. If lens review did not
run, was skipped, or was degraded, convergence may still be reported from source
evidence, but it must not claim review-confirmed convergence.

Signals for convergence:

- selected concept set is stable across the latest exploration round
- new observations map into existing concepts rather than creating new
  top-level concepts
- remaining details map into `lower_level_detail_placements`
- canonical relation graph is stable enough for Seed handoff
- answerability scope supports the declared handoff questions
- material coverage checkpoint discloses no open `missing_axis` or
  `material_coverage_gap` pressure that blocks handoff
- next frontier value is expected to improve confidence rather than change the
  concept set, relation graph, or answerability scope

Signals against convergence:

- a new source slice introduces a previously missing purpose axis
- selected concepts repeatedly require split or merge
- relation direction or kind between selected concepts changes
- a selected concept cannot state included and excluded detail
- answerability scope cannot support the declared handoff purpose
- material coverage is biased toward one source surface without disclosure
- a concept is only a code artifact, UI widget, schema artifact, spreadsheet
  range, or document section with no purpose-level role
- the concept set explains source structure but not the declared purpose

## 11. Seed Output Shape

The Seed should center top-level concepts. Current artifacts may continue to use
existing Seed claim fields while the contract migrates, but the semantic shape
should project to:

```yaml
seed_schema_version:
purpose:
  claim_id:
  name:
  statement:
  evidence_refs: []
answerability_scope:
  declared_handoff_questions:
    - question_id:
      question:
      source:
  supported_questions:
    - question_id:
      answered_by:
        concept_ids: []
        relation_ids: []
      confidence:
  deferred_questions:
    - question_id:
      reason_deferred:
      frontier_pressure_ids: []
  unsupported_questions:
    - question_id:
      reason_unsupported:
  supported_actions:
    - action_id:
      action:
      supported_by_question_ids: []
      readiness_statement:
  unsupported_actions:
    - action_id:
      action:
      reason_unsupported:
  handoff_readiness_statement:
  handoff_readiness_question_ids: []
top_level_concepts:
  - concept_id:
    name:
    aliases: []
    definition:
    why_top_level:
    evidence_refs: []
    boundary:
      included_summary:
      excluded_summary:
      deferred_summary:
    confidence:
    provisional:
top_level_relations:
  - relation_id:
    source_concept_id:
    target_concept_id:
    relation_kind:
    relation_label:
    direction_statement:
    statement:
    evidence_refs: []
    confidence:
    provisional:
    registration_status:
relation_participation_exceptions:
  - concept_id:
    isolation_reason:
    isolation_pressure_ids: []
lower_level_detail_placements:
  - detail_id:
    name:
    material_kind:
    source_ref:
    placement:
    owner_concept_id:
    rationale:
    evidence_refs: []
    follow_up_question:
frontier_pressure_log:
  - pressure_id:
    origin:
    origin_ref:
    pressure_type:
    pressure_question:
    target_concept_ids: []
    target_relation_ids: []
    material_kind:
    source_ref:
    expected_decision_impact:
    priority:
    status: open | resolved | deferred | superseded | non_blocking
    status_reason:
    superseded_by_pressure_id:
    evidence_refs: []
material_coverage_checkpoint:
  observed_material_kinds: []
  observed_source_slices: []
  source_authority_scope:
    permission_scope: within_declared_boundary | restricted | unknown
    permission_basis_refs: []
    trust_status: observed_evidence_only | user_provided_authority | external_untrusted | mixed
    instruction_authority_status: none_data_only | declared_process_authority | mixed_requires_disclosure
    external_content_handling: not_applicable | treated_as_untrusted_data | sanitized_or_quoted | excluded
    restricted_source_refs: []
    rationale:
  intentionally_excluded_material_kinds: []
  unexplored_source_categories: []
  possible_missing_axis_pressure_ids: []
  rationale_for_seed_level_sufficiency:
  partial_support_disclosures: []
convergence:
  state:
  source_convergence_rationale:
  review_confirmed:
  review_profile_ref:
  remaining_pressure_ids: []
lifecycle:
  seed_id:
  parent_seed_ref:
  id_stability_scope:
  session_id:
  source_snapshot_refs: []
  source_snapshot_transition:
    prior_snapshot_refs: []
    transition_reason:
  exploration_rounds: []
  concept_identity_events: []
  relation_identity_events: []
  pressure_events: []
  detail_placement_events: []
  answerability_events: []
  material_coverage_events: []
  convergence_events: []
migration_records:
  - migration_id:
    source_field:
    target_authority_field:
    migration_artifact_ref:
```

## 12. Legacy Compatibility

Existing `entities`, `relations`, `actions`, `properties`, `rules`, and
`claim_id` fields may be used before schema migration, but they are
compatibility projections, not the new semantic authority.

Compatibility rules:

- `seed_schema_version` must identify whether the artifact uses legacy,
  transitional, or concept-centered shape.
- `top_level_concepts` is the authority for selected top-level concepts.
- `top_level_relations` is the authority for relations between selected
  top-level concepts.
- `lower_level_detail_placements` is the authority for demoted details.
- `claim_id` remains a stable claim or record identifier and must not replace
  user-facing `name`.
- Legacy `entities` may mirror top-level concept candidates only when each item
  maps to a `concept_id` or is explicitly marked provisional.
- Legacy `relations` may mirror `top_level_relations` only when relation IDs and
  endpoint IDs are preserved.
- Legacy `actions`, `properties`, and `rules` must be sparse and limited to
  purpose-level facts that affect top-level concept boundaries, relations, or
  answerability.
- Lower-level actions, properties, rules, fields, methods, UI elements, and
  schema details must map to `lower_level_detail_placements`.
- When both legacy and concept-centered fields exist, concept-centered fields
  have precedence.
- A pure `concept_centered` Seed may omit legacy projection arrays and
  `migration_records`.
- A `concept_centered` Seed that retains any legacy or retired projection field
  must include `migration_records` for each retained source field so the
  projection-to-authority dependency remains explicit.

Retired reconstruct-local seats must be mapped explicitly before an artifact can
claim migration compatibility:

| Retired or transitional seat | Target authority | Mapping requirement |
|---|---|---|
| `included_lower_concepts` | `lower_level_detail_placements` | Map each item to `placement: included_support` with `owner_concept_id`, source refs, and evidence refs. |
| `excluded_or_deferred_details` | `lower_level_detail_placements` | Map excluded items to `excluded_boundary` and deferred items to `deferred_followup`; preserve rationale. |
| `boundary_notes` | `top_level_concepts[].boundary` | Preserve boundary meaning in `included_summary`, `excluded_summary`, or `deferred_summary` according to the note's explicit inclusion, exclusion, or deferral meaning; final-output text remains derived from this boundary object. |
| `core_relations` | `top_level_relations` | Preserve relation identity, endpoints, direction, kind, and evidence refs; derive axis only from the design-local `relation_kind` table; use `relation_identity_events` for split or merge transitions. |
| `open_questions` | `answerability_scope.deferred_questions` or `answerability_scope.unsupported_questions` | Preserve question IDs where possible; add frontier pressure refs when the question can change concept, relation, coverage, or convergence judgment. Unsupported questions live in `answerability_scope.unsupported_questions`; the migration record must choose the exact accepted target that matches the question disposition. |
| `deferred_detail_candidates` | `lower_level_detail_placements` | Map to `placement: deferred_followup`; add pressure refs when the deferred detail can affect Seed handoff readiness. |
| `convergence.remaining_pressures` | `frontier_pressure_log` plus `convergence.remaining_pressure_ids` | Materialize each pressure as a pressure record with a non-ambiguous status; keep `remaining_pressure_ids` derived from known pressure IDs. |
| prior `frontier_refs` shapes | `frontier_pressure_log` | Preserve the source ref, pressure being resolved, observed or unexplored material slice, and evidence refs as frontier pressure records. Source-frontier artifacts and material coverage checkpoints may reference the same source slices, but they are not the migration target for this retired field. |

Migration records must preserve:

- source field name
- target authority field
- optional `migration_artifact_ref` when detailed migration evidence is too
  large for the Seed
- the exact retired or transitional seat being disclosed; mapping rules,
  compatibility status, obligation status, and registry rationale remain in the
  runtime mapping registry, not repeated in each Seed record

`migration_records` is the canonical transitional migration seat. It may point
to an external migration artifact through `migration_artifact_ref` when the
record is too large for the Seed, but the Seed must still carry the ref and must
not claim migration compatibility from prose alone.
The transitional runtime validates `migration_records[].target_authority_field`
against one source-field-specific mapping table. Some source fields have a
single accepted target; others have a small exact accepted-target set because
the legacy source field can carry multiple semantic dispositions. For example,
`actions` may target either `answerability_scope.supported_actions` or
`answerability_scope.unsupported_actions`; `properties` and `rules` may target
`lower_level_detail_placements`, `top_level_concepts.boundary`,
`top_level_relations`, or answerability question seats according to the
meaning being preserved. A migration record cannot target any accepted
authority prefix merely because that prefix exists; it must match one exact
accepted authority field for its `source_field`.

The current transitional runtime requires `migration_records` for the legacy
collection fields `entities`, `relations`, `actions`, `properties`, `rules`,
and `open_questions`. `claim_id` is not a separate migrated authority field in
this runtime stage; it remains a compatibility identifier inside legacy claim
projections unless a future schema introduces per-claim lineage seats.

## 13. Lens Responsibilities

Reconstruct lenses should evaluate top-level concept discovery rather than
merely collecting claim improvements.

| Lens | Discovery question |
|---|---|
| semantics | Are concept names, definitions, legacy mappings, and relation labels meaningfully distinct and grounded? |
| structure | Is the concept set neither over-split nor over-merged, and does the relation graph avoid orphan concepts unless explicitly provisional? |
| dependency | Do selected concepts have stable dependency, flow, and direction relations? |
| pragmatics | Can target users understand what questions and actions the Seed supports? |
| evolution | Will identities, concepts, relations, and mappings survive likely implementation and material changes? |
| coverage | Does the set cover the declared purpose across relevant material kinds without missing a major axis? |
| logic | Are relations, boundaries, pressures, and convergence claims coherent and non-contradictory? |
| conciseness | Is the Seed compact enough to serve as a Seed rather than a full ontology, without losing answerability? |
| axiology | Does the concept set preserve what matters for trust, value, declared purpose, and authority boundaries? |

Lens disagreement should be represented as `missing_axis`, `split_or_merge`,
`boundary`, `core_relation`, `abstraction_level`, `answerability_gap`, or
`material_coverage_gap` pressure when it can affect top-level convergence. A
lens objection must first become a `frontier_pressure_log` entry with
`origin: lens_objection` before convergence can treat it as resolved, deferred,
or non-blocking.

Lens outputs are optional convergence-strengthening evidence unless the
specific runtime path declares them mandatory. When used for convergence, the
runtime must record lens artifact refs, lens set, degraded lenses, and coverage
limits.

## 14. Validation Expectations

Runtime validation should remain deterministic. It can validate:

- artifact shape
- required fields
- known evidence refs
- duplicate IDs
- relation endpoints referencing known top-level concepts
- every top-level concept having at least one evidence ref
- every top-level concept having a boundary object with included, excluded, and
  deferred summaries
- allowed `pressure_type` values
- all pressure references pointing to known `frontier_pressure_log[].pressure_id`
- allowed `frontier_pressure_log[].status` values and status-specific refs
- no `converged_for_seed` claim while any frontier pressure remains `open`
- pressure lifecycle event types, including `non_blocking`, a single
  `pressure_id` pointing to a known pressure record, explicit prior/new status
  values, and supersession refs when applicable
- concept lifecycle event types, including `split` and `merged`, with
  prior/current concept ID arrays preserving continuity before cross-run
  continuation or migration compatibility is claimed
- concept identity events carrying affected concept identity only through
  `prior_concept_ids`, `current_concept_ids`, and `target_detail_ids`; generic
  affected concept ID summaries are derived display projections only
- concept lifecycle `alias_changed` events carrying prior and current alias
  arrays so alias provenance can be reconstructed
- concept demotion events linking prior concept IDs to known
  `lower_level_detail_placements[].detail_id` values through
  `concept_identity_events[].target_detail_ids`
- relation lifecycle event types, including `split` and `merged`, with
  prior/current relation ID arrays preserving continuity before cross-run
  continuation or migration compatibility is claimed
- relation identity events carrying affected relation identity only through
  `prior_relation_ids` and `current_relation_ids`; generic affected relation ID
  summaries are derived display projections only
- answerability lifecycle event question/action refs pointing to known
  `answerability_scope` question and action IDs
- `declared_handoff_questions` forming the exact closed question inventory for
  supported, deferred, and unsupported question IDs
- declared handoff question IDs being unique within
  `declared_handoff_questions`
- status-bucket question IDs being unique across the supported, deferred, and
  unsupported question buckets
- answerability action IDs being unique across supported and unsupported action
  buckets
- supported question answered-by concept and relation refs pointing to known Seed
  authorities
- supported action refs pointing to known supported questions through
  `supported_actions[].supported_by_question_ids[]`
- allowed lower-level detail `placement` values
- allowed `relation_kind` values
- derived relation axis projection from the design-local `relation_kind` table
- `relation_participation_exceptions` values, explicit isolation reasons, and
  isolation refs, with
  connected participation derived only from endpoint membership in
  `top_level_relations`
- lifecycle continuity for preserved, renamed, split, merged, or demoted IDs
- lifecycle lineage seats before cross-run continuation is claimed
- migration records before legacy-to-concept-centered compatibility is claimed,
  including explicit mappings for retired lower-detail, relation, question,
  frontier, and pressure seats listed in the legacy compatibility section, plus
  `migration_artifact_ref` when the migration record delegates detail to an
  external artifact
- `material_coverage_checkpoint` presence before `converged_for_seed`
- material coverage source-authority enum values and source refs
- material coverage lifecycle events for `source_authority_scope_changed`,
  including changed authority field names and either prior/current state refs or
  inline prior/current authority states
- `possible_missing_axis_pressure_ids` and `remaining_pressure_ids` pointing to
  known pressure IDs
- convergence state being one of the allowed values once promoted
- review-confirmed convergence not being claimed without review profile refs

Runtime should not validate semantic truth such as whether `Usage Session` is
really the right top-level concept or whether a relation interpretation is
meaningfully correct. That remains LLM-authored and lens-reviewed.

## 15. Non-Goals

This contract does not require:

- a full ontology graph
- exhaustive entity extraction
- automatic semantic repair by runtime
- a universal hierarchy of concepts
- reading every source file
- turning every source detail into a Seed claim
- declaring lower-level implementation details final
- registering relation labels as canonical ontology relation types at Seed time
- proving full ontology design readiness

## 16. Implementation Path

Recommended implementation order:

1. Update the Seed author prompt to make top-level concept discovery,
   answerability scope, and canonical relation graph authoring the primary
   objective.
2. Replace unregistered pressure labels with the canonical `pressure_type`
   values. Use `abstraction_level` plus `expected_decision_impact` for demotion
   decisions.
3. Add compact prompt payloads that pass candidate labels, gaps, evidence IDs,
   material slices, lifecycle refs, and unresolved frontier pressures rather
   than full artifacts.
4. Add a design-local top-level concept projection in final output before
   changing public schema.
5. Add `top_level_relations` as the canonical relation authority and make
   concept-level relation summaries derived.
6. Add `lower_level_detail_placements` as the canonical demotion authority and
   derive compatibility summaries from it.
7. Add `frontier_pressure_log`, `material_coverage_checkpoint`, and bounded
   iteration status to metrics and final output.
8. Add `answerability_scope` and make `converged_for_seed` explicitly mean
   Seed handoff readiness within that scope.
9. Add lifecycle projections for the complete concept-centered Seed surface:
   concept identity, relation identity, frontier pressure status transitions,
   lower-level detail placement changes, answerability question/action changes,
   material coverage and source-authority changes, and convergence changes.
   Concept and relation lifecycle must cover provenance, aliasing, split, merge,
   rename, demotion, direction/kind changes, and boundary changes where
   applicable.
10. Add legacy compatibility mapping for `entities`, `relations`, `actions`,
    `properties`, `rules`, `open_questions`, and retired reconstruct-local seats such
    as `included_lower_concepts`, `excluded_or_deferred_details`,
    `core_relations`, `deferred_detail_candidates`,
    `convergence.remaining_pressures`, and prior `frontier_refs` shapes.
11. Add deterministic Seed validation checks for required `name`, boundary,
    evidence refs, allowed enum values, relation endpoints, lifecycle
    continuity, retired-seat migration mappings, material coverage checkpoint
    presence, and review profile refs when review-confirmed convergence is
    claimed.
12. Keep semantic compactness, concept correctness, relation correctness, and
    purpose fitness under LLM authoring and lens review.
13. Promote stable names through `.onto/authority/core-lexicon.yaml` only after
    the artifact shape has stabilized.
