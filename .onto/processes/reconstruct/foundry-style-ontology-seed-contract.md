# Reconstruct Actionable Ontology Seed Contract

> Status: active seed contract.
> Purpose: define the target `ActionableOntologySeed` produced by
> `reconstruct`.

## 1. Position

An `ActionableOntologySeed` is the smallest evidence-backed semantic contract
that can support decision-making and action design for the declared purpose.

It is intentionally smaller than a full ontology. It must still be operational:
it needs objects, actors, actions, permissions, data bindings, validation
questions, and handoff limits in addition to orientation concepts.

```text
ActionableOntologySeed
= purpose
+ decision context
+ conceptual frame
+ semantic layer
+ kinetic layer
+ dynamic layer
+ data binding layer
+ validation layer
+ candidate disposition authority ref
+ ontology-facing handoff mapping
+ source authority
+ handoff limitations
```

## 2. Design Rationale

Ontology is useful here because it turns source material into a basis for later
decisions and actions.

A concept map can explain a service, but it cannot by itself answer:

- who can act
- what object is acted on
- what state changes
- what permission or policy controls the action
- where the data is read from or written to
- which external question and assessment artifacts test the seed

The reconstruct run must therefore preserve every high-salience object, actor,
action, workflow, data source, and constraint candidate through the canonical
candidate-disposition artifact. A candidate may be promoted into a seed layer,
represented as a property or link, deferred, or rejected for the declared
purpose, but it must not vanish.

## 3. Ownership

The host LLM authors seed meaning. Runtime validates shape, ids, evidence refs,
layer closure, and handoff consistency.

Runtime may reject or mark a seed invalid. Runtime must not invent missing seed
content to make validation pass.

## 4. Seed Shape

The target artifact is `ontology-seed.yaml`.

Required root fields:

```yaml
seed_identity:
  schema_version:
  seed_id:
  title:
  target_refs: []
  generated_at:
  authoring_profile:

purpose:
  declared_purpose:
  intended_decisions: []
  intended_actions: []
  non_goals: []
  evidence_refs: []

decision_context:
  principal_user:
  downstream_use:
  decision_boundary:
  risk_notes: []

conceptual_frame:
  concepts: []
  associations: []

semantic_layer:
  object_types: []
  link_types: []
  value_types: []
  constraints: []

kinetic_layer:
  action_types: []
  functions: []
  workflows: []

dynamic_layer:
  actor_types: []
  actor_roles: []
  permission_policies: []
  state_models: []
  lifecycle_rules: []

data_binding_layer:
  source_bindings: []
  read_models: []
  writebacks: []
  provenance_bindings: []

validation_layer:
  question_authority_ref:
    authority_scope:
    projection_policy:
  coverage_axes: []
  unsupported_question_candidates: []
  runtime_validation_refs: []

candidate_disposition_authority_ref:
  authority_scope:
  projection_policy:
ontology_handoff:
  readiness_claim:
  classification_mapping:
  entity_identity_mapping:
  instance_assertion_mapping:
  terminology_mapping:
  relation_type_mapping:
  constraint_mapping:
  modularity_boundary:
  reasoning_or_formalism_profile:
  application_context_mapping:
  metadata_mapping:
  provenance_mapping:
  change_tracking_mapping:
  competency_scope_mapping:
  alignment_mapping:
  modeling_concern_applicability:
  reference_standard_mapping:
  pattern_catalog_mapping:
  query_access_contract:
  visualization_contract:
  graph_exploration_contract:
  graph_connectivity:
  limitation_refs: []
source_authority:
  evidence_scope:
  permission_scope:
  trust_boundary:
  instruction_authority:
  external_content_handling:
  included_source_refs: []
  excluded_source_refs: []
  restricted_source_refs: []
  source_gaps: []
  rationale:
handoff_limitations:
  - limitation_id:
    limitation_kind:
    description:
    affected_refs: []
    missing_source_refs: []
    mitigation_or_next_action:
    evidence_refs: []
```

## 5. Conceptual Frame

The conceptual frame orients a reader. It is not the full seed authority.

```yaml
conceptual_frame:
  concepts:
    - concept_id:
      name:
      definition:
      purpose_role:
      evidence_refs: []
      confidence: confirmed | provisional | unsupported
  associations:
    - association_id:
      source_concept_id:
      target_concept_id:
      association_kind:
      statement:
      evidence_refs: []
```

Use this layer to explain the service or material in compact language. Do not
use it to hide objects, actors, actions, permissions, or data bindings that need
their own operational representation.

## 6. Semantic Layer

The semantic layer answers "what exists?"

```yaml
semantic_layer:
  object_types:
    - object_type_id:
      name:
      object_kind: entity | event | document | dataset | surface | service | other
      description:
      primary_key:
        property_id:
        name:
        value_type:
        evidence_refs: []
      properties:
        - property_id:
          name:
          value_type:
          nullable:
          description:
          constraints: []
          evidence_refs: []
      backing_source_refs: []
      evidence_refs: []
      status: confirmed | provisional | deferred
  link_types:
    - link_type_id:
      source_object_type_id:
      target_object_type_id:
      cardinality: one_to_one | one_to_many | many_to_many | unknown
      business_meaning:
      evidence_refs: []
  value_types:
    - value_type_id:
      name:
      representation:
      constraints: []
      evidence_refs: []
  constraints:
    - constraint_id:
      target_ref:
      constraint_kind:
      statement:
      evidence_refs: []
```

Object types must represent business or operational meaning, not merely copy
file names, table names, sheet names, or component names.

## 7. Kinetic Layer

The kinetic layer answers "what can be done?"

```yaml
kinetic_layer:
  action_types:
    - action_type_id:
      name:
      description:
      actor_type_ids: []
      target_object_type_ids: []
      affected_object_type_ids: []
      parameters:
        - parameter_id:
          name:
          value_source: user_input | object_property | static_value | current_user | current_time | unknown
          value_type:
          required:
      preconditions:
        - precondition_id:
          statement:
          evidence_refs: []
      postconditions:
        - postcondition_id:
          statement:
          evidence_refs: []
      side_effects:
        - side_effect_id:
          statement:
          failure_behavior: cancels_action | records_failure | unknown
          evidence_refs: []
      writeback_behavior:
        writes: true | false | unknown
        writeback_source_refs: []
        rationale:
      evidence_refs: []
      status: confirmed | provisional | deferred
  functions:
    - function_id:
      name:
      input_type_refs: []
      return_type_ref:
      purity: read_only | state_changing | unknown
      evidence_refs: []
  workflows:
    - workflow_id:
      name:
      ordered_action_type_ids: []
      trigger:
      terminal_state:
      evidence_refs: []
```

An action without actor binding and object binding is not action-ready. It may
remain in the seed only if the missing binding is recorded as a limitation.

## 8. Dynamic Layer

The dynamic layer answers "who can do what, and under what state or policy?"

```yaml
dynamic_layer:
  actor_types:
    - actor_type_id:
      name:
      actor_kind: human_user | system_service | ai_agent | organization | external_system | unknown
      role_refs: []
      description:
      evidence_refs: []
  actor_roles:
    - role_id:
      name:
      holder_actor_type_ids: []
      authority_scope_refs: []
      evidence_refs: []
  permission_policies:
    - policy_id:
      actor_type_id:
      action_type_id:
      object_type_id:
      permission_kind: allowed | denied | conditional | unknown
      condition:
      evidence_refs: []
  state_models:
    - state_model_id:
      object_type_id:
      states: []
      transitions:
        - transition_id:
          from_state:
          to_state:
          action_type_id:
          evidence_refs: []
  lifecycle_rules:
    - rule_id:
      target_ref:
      statement:
      evidence_refs: []
```

`actor_kind` is limited to bearer categories. Administrative authority, owner
status, approver status, reviewer status, and similar authorization posture must
be represented as `actor_roles[]`, `permission_policies[]`, or candidate
disposition evidence, not as actor bearer kinds.

Sensitive actions or sensitive data must not be left without actor and
permission treatment. If source material does not expose this treatment, the
gap belongs in `handoff_limitations`.

## 9. Data Binding Layer

The data binding layer answers "where does the seed touch source data?"

```yaml
data_binding_layer:
  source_bindings:
    - binding_id:
      seed_ref:
      source_ref:
      binding_kind: evidence | storage | read_source | write_target | derived_projection | configuration
      statement:
      evidence_refs: []
  read_models:
    - read_model_id:
      name:
      object_type_ids: []
      source_refs: []
      transformation_summary:
      evidence_refs: []
  writebacks:
    - writeback_id:
      action_type_id:
      target_source_refs: []
      write_mode: create | update | delete | append | none | unknown
      evidence_refs: []
  provenance_bindings:
    - provenance_id:
      seed_ref:
      source_ref:
      author_or_system:
      timestamp_ref:
      evidence_refs: []
```

The seed must distinguish source evidence from operational storage. A file,
table, sheet, or document section can be evidence without being the operational
place where an object lives.

## 10. Validation Layer

The validation layer declares how the seed should be tested. It does not own
pass/fail gate status and it does not own the authoritative competency-question
set.

Canonical authority:

- `competency-questions.yaml` owns the question set.
- `competency-question-assessment.yaml` owns answerability results.
- runtime-owned validation artifacts own gate status.
- `ontology-seed.yaml.validation_layer` owns only seed-side requirements,
  references, unsupported candidates, and expected coverage axes.

```yaml
validation_layer:
  question_authority_ref:
    artifact_ref: competency-questions.yaml
    authority_scope: canonical_question_set
  coverage_axes:
    - purpose
    - semantic_layer
    - kinetic_layer
    - dynamic_layer
    - data_binding_layer
    - ontology_handoff
    - limitation
    - source_authority
  unsupported_question_candidates:
    - candidate_id:
      question:
      unsupported_reason:
      needed_source_or_confirmation:
  runtime_validation_refs:
    - artifact_ref: ontology-seed-validation.yaml
      authority_scope: seed_shape_validation
    - artifact_ref: competency-questions-validation.yaml
      authority_scope: question_coverage_validation
    - artifact_ref: competency-question-assessment-validation.yaml
      authority_scope: question_assessment_validation
    - artifact_ref: seed-confirmation-validation.yaml
      authority_scope: seed_confirmation_validation
    - artifact_ref: handoff-decision-validation.yaml
      authority_scope: handoff_validation
```

`coverage_axis_refs[]` is the coarse question-level coverage axis projection for
`competency-questions.yaml`; seed-side expected axes remain in
`ontology-seed.yaml.validation_layer.coverage_axes[]`. The
allowed values are the `coverage_axis_registry` values in
`reconstruct-contract-registry.yaml`. Detailed operational proof belongs to
seed refs and validation gates, not to a second coverage-axis vocabulary.
Detailed ontology-facing coverage must use `ontology_handoff_axis_refs[]` on the
authoritative competency-question rows; do not reintroduce detailed
`ontology_*` values into `coverage_axis_refs[]`.

Competency questions must cover:

- declared purpose
- object identity and boundaries
- action availability and state effect
- actor and permission treatment
- data source, read, write, and provenance treatment
- ontology-facing mapping or limitation when the seed is used for ontology work,
  including classification, entity identity, terminology, relation typing, constraints,
  modularity, reasoning/formalism profile, application context, provenance,
  change tracking, competency scope, alignment, and graph connectivity
- known limitations

## 11. Candidate Disposition Authority

`candidate-disposition.yaml` is the canonical disposition authority. The seed
must reference that authority and may summarize its result in prose, but it must
not carry an independent disposition ledger that can drift.

```yaml
candidate_disposition_authority_ref:
  authority_scope: external_candidate_disposition
  projection_policy: reference_only
```

Every high-salience candidate must have exactly one row in
`candidate-disposition.yaml`. Concrete artifact refs live in
`reconstruct-record.yaml` and `reconstruct-run-manifest.yaml`, not inside the
seed. For `promoted_to_seed_layer`, `target_seed_refs[]` are planned canonical
seed refs that the later `ontology-seed.yaml` must realize. Runtime first
validates that every disposition has allowed shape, rationale, and evidence
refs, then validates that the seed realizes each planned promoted target.

## 12. Ontology-Facing Handoff

`ActionableOntologySeed` is not a full formal ontology. When the declared
downstream use is ontology review, ontology extension, or ontology-as-code work,
the seed must still disclose how it maps to ontology-facing expectations or why
those expectations remain limitations.

If `readiness_claim` is `ready`, each mapping object below must contain
substantive mapping content or explicit `limitation_refs[]`. Empty mapping
shells such as `{ limitation_refs: [] }` are invalid because they do not provide
handoff evidence.

```yaml
ontology_handoff:
  readiness_claim: ready | limited | not_ready | blocked
  classification_mapping:
    ontology_scope_kind:
    classification_axis_policy:
    classification_level_axis_refs: []
    inheritance_model:
    mece_status:
    seed_refs: []
    limitation_refs: []
  entity_identity_mapping:
    entity_id_policy:
    uri_or_iri_policy:
    canonical_identifier_refs: []
    alias_identifier_refs: []
    primitive_vs_defined_status:
    definition_criteria_refs: []
    limitation_refs: []
  instance_assertion_mapping:
    instance_availability_status: present | absent | unknown | not_applicable
    instance_refs: []
    example_assertion_refs: []
    abox_assertion_refs: []
    limitation_refs: []
  terminology_mapping:
    canonical_label_policy:
    alias_policy:
    hidden_label_policy:
    homonym_policy:
    multilingual_label_policy:
    language_tag_policy:
    limitation_refs: []
  relation_type_mapping:
    relation_type_refs: []
    formal_relation_semantics:
    domain_range_declaration_refs: []
    relation_property_constraint_refs: []
    unsupported_relation_candidates: []
    limitation_refs: []
  constraint_mapping:
    constraint_refs: []
    tbox_constraint_refs: []
    abox_assertion_constraint_refs: []
    shape_or_validation_constraint_refs: []
    policy_constraint_refs: []
    unsupported_constraint_candidates: []
    limitation_refs: []
  modularity_boundary:
    module_candidates: []
    import_or_reuse_refs: []
    limitation_refs: []
  reasoning_or_formalism_profile:
    representation_formalism: <registry:reasoning_or_formalism_profile_contract.representation_formalism_values>
    vocabulary_systems: []
    validation_formalisms: []
    ontology_type: <registry:reasoning_or_formalism_profile_contract.ontology_type_values>
    owl_profile: <registry:reasoning_or_formalism_profile_contract.owl_profile_values>
    alignment_posture: <registry:reasoning_or_formalism_profile_contract.alignment_posture_values>
    reasoning_expectations: []
    validation_expectations: []
    limitation_refs: []
  application_context_mapping:
    application_context_refs: []
    actor_or_surface_refs: []
    limitation_refs: []
  metadata_mapping:
    descriptive_metadata_refs: []
    bibliographic_metadata_refs: []
    resource_metadata_refs: []
    limitation_refs: []
  provenance_mapping:
    provenance_binding_refs: []
    evidence_scope_refs: []
    limitation_refs: []
  change_tracking_mapping:
    state_model_refs: []
    lifecycle_rule_refs: []
    migration_or_versioning_refs: []
    limitation_refs: []
  competency_scope_mapping:
    expected_coverage_axes: []
    required_handoff_axes: []
    unsupported_axes: []
    limitation_refs: []
  alignment_mapping:
    external_vocab_or_domain_refs: []
    mapped_seed_refs: []
    limitation_refs: []
  modeling_concern_applicability:
    rows:
      - concern_id:
        applies: true | false | unknown | not_applicable
        applicability_predicate_ref:
        trace_refs: []
        limitation_refs: []
  reference_standard_mapping:
    standard_refs: []
    mapped_concern_refs: []
    limitation_refs: []
  pattern_catalog_mapping:
    pattern_catalog_refs: []
    mapped_concern_refs: []
    limitation_refs: []
  query_access_contract:
    applies: true | false | unknown | not_applicable
    limitation_refs: []
  visualization_contract:
    applies: true | false | unknown | not_applicable
    limitation_refs: []
  graph_exploration_contract:
    applies: true | false | unknown | not_applicable
    limitation_refs: []
  graph_connectivity:
    connected_seed_refs: []
    isolated_seed_refs: []
    isolation_rationale_refs: []
  limitation_refs: []
handoff_limitations:
  - limitation_id:
    limitation_kind: missing_source | unsupported_axis | insufficient_evidence | unresolved_confirmation | runtime_capability_gap | external_standard_unselected
    description:
    affected_refs: []
    missing_source_refs: []
    mitigation_or_next_action:
    evidence_refs: []
```

If ontology-facing readiness is not claimed, `readiness_claim` may be `limited`
or `not_ready`, but the limitation must be explicit. Use `blocked` when missing
source or user confirmation prevents an honest ontology-facing readiness answer.
If `representation_formalism` is `owl` or `mixed`, `owl_profile` must be
explicit or the profile must cite a limitation explaining why the OWL profile is
not known. Vocabulary systems such as SKOS and validation formalisms such as
SHACL must be declared through their own fields, not collapsed into
`representation_formalism`. When ontology-facing handoff is claimed,
`ontology_type` must be explicit or limitation-backed.

`handoff_limitations[]` is the canonical limitation authority. Every
`limitation_refs[]` value in the seed, competency questions, assessments,
confirmation, terminal handoff readiness validation, query proof, visualization proof, or graph
exploration proof
must resolve to a `handoff_limitations[].limitation_id`; a free-text limitation
reference is invalid.

## 13. Query Proof Authority Contract

`query-proofs.yaml` is required when the seed claims executable queryability,
API access, implementation access, or another explicit ontology access surface.
It is separate from the seed so runtime can validate observed execution results
without making `ontology-seed.yaml` a transcript.

```yaml
query_proofs:
  - query_proof_id:
    question_ids: []
    query_language_or_api:
    query_engine_or_runtime_refs: []
    query_artifact_refs: []
    query_test_fixture_refs: []
    expected_answer_shape_refs: []
    observed_execution_result_refs: []
    evidence_refs: []
    limitation_refs: []
```

Runtime validates that every `query_proof_id` is unique, every `question_ids[]`
value points to `competency-questions.yaml`, and every `limitation_refs[]` value
points to `handoff_limitations[].limitation_id`. Proof rows own the canonical
question-to-proof relation through `question_ids[]`; competency-question rows and
seed-side handoff contracts do not duplicate proof refs.

`visualization-proofs.yaml` and `graph-exploration-proofs.yaml` are separate
conditional proof authorities. Visualization proves concrete visual surfaces or
overview shapes; graph exploration proves navigation, traversal, scale, or
expand/collapse capability. A run may satisfy one without satisfying the other.

```yaml
visualization_proofs:
  - visualization_proof_id:
    question_ids: []
    visualization_surface_refs: []
    expected_visualization_shape_refs: []
    observed_visualization_result_refs: []
    evidence_refs: []
    limitation_refs: []

graph_exploration_proofs:
  - graph_exploration_proof_id:
    question_ids: []
    graph_exploration_capability_refs: []
    scale_or_navigation_constraint_refs: []
    observed_exploration_result_refs: []
    evidence_refs: []
    limitation_refs: []
```

## 14. Competency-Question Authority Contract

`competency-questions.yaml` is the question-set authority. Each question row must
be concrete enough for runtime to validate coverage and for the host LLM to
assess answerability without inventing hidden scope.

```yaml
questions:
  - question_id:
    question:
    linked_claim_ids: []
    coverage_axis_refs: <registry:coverage_axis_registry.axis_id[]>
    ontology_handoff_axis_refs: <registry:ontology_handoff_axis_registry.axis_id[]>
    seed_ref_refs: []
    limitation_refs: []
    reasoning_or_formalism_facets: <registry:reasoning_or_formalism_profile_contract.facet_registry.facet_id[]>
    entity_identity_facets: <registry:ontology_handoff_facet_contract.entity_identity_facet_registry.facet_id[]>
    instance_assertion_facets: <registry:ontology_handoff_facet_contract.instance_assertion_facet_registry.facet_id[]>
    terminology_facets: <registry:ontology_handoff_facet_contract.terminology_facet_registry.facet_id[]>
    relation_type_facets: <registry:ontology_handoff_facet_contract.relation_type_facet_registry.facet_id[]>
    classification_facets: <registry:ontology_handoff_facet_contract.classification_facet_registry.facet_id[]>
    constraint_facets: <registry:ontology_handoff_facet_contract.constraint_facet_registry.facet_id[]>
    modeling_concern_facets: <registry:ontology_handoff_facet_contract.modeling_concern_applicability_registry.concern_id[]>
    reference_standard_refs: []
    pattern_catalog_refs: []
    query_access_contract_refs: []
    visualization_contract_refs: []
    graph_exploration_contract_refs: []
    domain_competency_trace_refs: []
    coverage_disposition: covered | limited | unsupported | deferred | not_applicable
    expected_answer_kind: yes_no | explanation | list | mapping | gap_statement
    handoff_relevance: required | supporting | diagnostic
    lifecycle_status: active | deferred | unsupported_candidate
    rationale:
```

`coverage_disposition` answers whether the question's covered scope is satisfied,
limited, unsupported, deferred, or not applicable. `handoff_relevance` answers
how strongly the question affects handoff. `lifecycle_status` answers whether
the row itself is active, deferred, or retained only as an unsupported candidate.
These fields are intentionally non-overlapping.
`required_evidence_scope` is runtime-owned and is emitted by
`competency-questions-validation.yaml.required_evidence_scope_projection[]`.
It is derived from the row's explicit reference fields rather than authored as a
second independent ref list.

Required ontology-handoff question coverage is validated from
`ontology_handoff_axis_refs[]`. The required axes are classification, entity identity,
instance assertion coverage, terminology, relation typing, constraints,
modularity, reasoning/formalism profile, application context, provenance, change
tracking, competency scope, alignment, graph connectivity, and explicit
limitations. If an axis is unsupported, the
question row must include that axis with `coverage_disposition: unsupported` or
`deferred` and cite the limitation or missing source instead of silently omitting
the axis.

Runtime validates that every `question_id` is unique, every `coverage_axis_refs[]`
value is allowed, every `ontology_handoff_axis_refs[]` value is allowed when
`coverage_axis_refs[]` includes `ontology_handoff`, every `seed_ref_refs[]` value
points to a known seed ref, every `limitation_refs[]` value points to
`handoff_limitations[].limitation_id`, and every required ontology-handoff axis
is either represented by an active question or recorded as unsupported/deferred
with a limitation ref.
When `ontology_handoff_axis_refs[]` includes `reasoning_or_formalism_profile`, the
question row must declare `reasoning_or_formalism_facets[]` from the registry
facet values. The question set must cover representation formalism, vocabulary
systems, validation formalisms, ontology type, alignment posture, and the OWL
profile when `representation_formalism` is `owl` or `mixed`, or it must cite the
limitation that makes those details unavailable.
When `ontology_handoff_axis_refs[]` includes `entity_identity`, question rows must
cover or limitation-back entity id policy, URI/IRI policy, canonical and alias
identifier refs, primitive-vs-defined status, and definition criteria refs.
When `ontology_handoff_axis_refs[]` includes `instance_assertion_coverage`, question
rows must cover or limitation-back instance availability status, concrete
instance refs, example assertion refs, and ABox assertion refs. If
`instance_availability_status` is `absent` or `unknown`, the seed must cite a
limitation explaining how that affects validation and downstream readiness.
When `ontology_handoff_axis_refs[]` includes `terminology`, question rows must cover
or limitation-back canonical label policy, alias policy, hidden-label/search
label policy, homonym policy, multilingual label policy, and language-tag
policy.
When `ontology_handoff_axis_refs[]` includes `relation_typing`, question rows must
cover or limitation-back relation type refs, formal relation semantics, formal
domain/range declarations, and relation-property constraints.
When `ontology_handoff_axis_refs[]` includes `classification`, question rows must
cover or limitation-back ontology scope kind, classification axis policy,
per-level classification axis refs, inheritance model, and MECE status. When
`ontology_handoff_axis_refs[]` includes
`constraints`, question rows must cover or limitation-back TBox constraints,
ABox assertion constraints, shape/validation constraints, and policy
constraints. When a `modeling_concern_applicability.rows[]` item has
`applies: true`, the question set must include a matching
`modeling_concern_facets[]` entry and, when a concrete reference standard is
selected, cite it through `reference_standard_refs[]`. When applicability is
`unknown`, the handoff must cite the missing source or confirmation needed to
decide it. Formalism, vocabulary, validation, metadata, dataset/catalog, and
queryability claims must cite registry-owned `reference_standard_refs[]` when a
standard such as OWL 2, RDFS, SKOS, SHACL, Dublin Core Terms, DCAT, PROV-O,
GeoSPARQL, QUDT, OM, W3C Time, RDF Data Cube, SOSA/SSN, or SPARQL is selected.
When the source or downstream use treats classes, properties, relation types,
shapes, or ontology design rules themselves as modeled things, the
`meta_modeling` concern must be covered or explicitly limitation-backed.
Ontology design pattern catalog selections are pattern-catalog refs, not
normative standard refs; they are recorded in
`ontology_handoff.pattern_catalog_mapping.pattern_catalog_refs[]` and may be
cited by question-level `pattern_catalog_refs[]` when
`concern_id: ontology_design_pattern` applies. Runtime validates those refs
against `reference_pattern_catalog_registry` and the selected run-manifest
pattern catalog snapshot. Pattern catalog canonical URIs are run-manifest facts:
the registry owns the policy that a selected catalog URI must be recorded,
non-empty, and bound to the selected catalog id and snapshot for that run.
When downstream use claims heterogeneous data integration, semantic
reconciliation, ontology-based ETL, or ontology-based data access, the
`data_integration` concern must be covered through data-binding, alignment, and
source-authority evidence or explicitly limitation-backed.
`query_interface` is
required when downstream use claims
queryability, API access, implementation access, or another explicit ontology
access surface; it must cite `query_access_contract_refs[]` with executable
proof-contract ids; `query-proofs.yaml` rows then own the question-to-proof
coverage through `question_ids[]`. Otherwise it must be limitation-backed.
`visualization_interface` is required when downstream use
claims static, hierarchical, dashboard, or overview visualization; it must cite
`visualization_contract_refs[]`; `visualization-proofs.yaml` rows own the
question-to-proof coverage through `question_ids[]`, or the question must be
marked not applicable or limitation-backed. `graph_exploration_interface` is
required when
downstream use claims large-graph navigation, traversal, graph exploration, or
expand/collapse behavior; it must cite `graph_exploration_contract_refs[]`;
`graph-exploration-proofs.yaml` rows own the question-to-proof coverage through
`question_ids[]`, or the question must be marked not applicable or
limitation-backed.
`domain_competency_trace_refs[]` records the admitted domain competency id that
makes the question necessary. Runtime validates those refs only against
`reconstruct-run-manifest.yaml#governing_snapshot.required_admitted_competency_ids`;
domain admission refs and source document refs are not trace refs. Untraced
generated questions must be diagnostic or limitation-backed. For every admitted
domain competency snapshot, runtime derives the admitted competency id set from
that snapshot: every P1 id is required, while P2 and P3 ids remain admitted
metadata until an explicit downstream promotion policy makes a row required or
supporting. Every required admitted id must be represented by exactly one
`competency-questions.yaml.questions[]` row.
Unsupported, deferred, and not-applicable cases are still question rows, using
`coverage_disposition`, `lifecycle_status`, `domain_competency_trace_refs[]`, and
`limitation_refs[]` as the single lookup path. Ontology handoff axes are
complementary coverage groups; they do not replace domain-competency
disposition completeness.

## 15. Competency-Question Assessment Contract

`competency-question-assessment.yaml` is the answerability result authority.
Each authoritative question must have exactly one assessment row.

```yaml
assessments:
  - question_id:
    answer_status: answerable | partially_answerable | unsupported | deferred | contradicted | not_applicable
    answer_summary:
    required_seed_refs: []
    evidence_refs: []
    missing_source_or_confirmation:
    ambiguity_notes: []
    downstream_effect: ready | limited | blocks_handoff | blocked_by_missing_source_or_confirmation | not_applicable
```

Runtime validates that `question_id` points to `competency-questions.yaml`, every
`required_seed_refs[]` is closed against the question row's `seed_ref_refs[]`,
every `evidence_refs[]` points to question-scoped observed source evidence, and
`downstream_effect` is consistent with `answer_status`.

## 16. Readiness Projection Contract

Runtime projects artifact-specific readiness fields into one canonical readiness
value before presenting status, final output, or result payloads.

| Canonical readiness | Meaning |
|---|---|
| `ready` | Required gates pass and the seed is safe for the declared downstream purpose |
| `limited` | Required gates pass or are explicitly bounded, and named limitations must travel with the seed |
| `not_ready` | Required gates failed or required ontology-facing coverage is unsupported |
| `blocked` | Missing source, unsupported runtime capability, or missing user confirmation prevents a valid readiness answer |

Mapping rules:

| Source field | Source value | Canonical readiness effect |
|---|---|---|
| `ontology_handoff.readiness_claim` | `ready` | `ready` |
| `ontology_handoff.readiness_claim` | `limited` | `limited` |
| `ontology_handoff.readiness_claim` | `not_ready` | `not_ready` |
| `ontology_handoff.readiness_claim` | `blocked` | `blocked` |
| `competency-question-assessment.downstream_effect` | `ready` | `ready` |
| `competency-question-assessment.downstream_effect` | `limited` | `limited` |
| `competency-question-assessment.downstream_effect` | `blocks_handoff` | `not_ready` |
| `competency-question-assessment.downstream_effect` | `blocked_by_missing_source_or_confirmation` | `blocked` |
| `competency-question-assessment.downstream_effect` | `not_applicable` | excluded from blockers |

`handoff-decision-validation.yaml` is the runtime authority that proves the
stop decision and readiness projection agree with validation artifacts before
final output and reconstruct record projection. It consumes
`reconstruct-run-manifest.pre-handoff-validation.yaml`; terminal output must not rely on an
unvalidated registry, contract, source-profile, validator, reference-standard,
version, or migration snapshot.
When readiness signals conflict, runtime projects the strictest value by this
order: `blocked`, `not_ready`, `limited`, `ready`. A missing required validation
artifact projects `blocked` only when its `required_when` condition applies; an
unmet `required_when` condition projects `not_applicable` for that artifact and
does not lower readiness by itself. A failed applicable validation artifact
projects `not_ready`; a skipped optional validation artifact projects `limited`.

Seed confirmation is required whenever seed validity or handoff readiness is
projected. If `seed-confirmation.yaml` or `seed-confirmation-validation.yaml` is
absent at that lifecycle point, runtime projects `blocked`. A limitation state is
allowed only when both artifacts exist and `seed-confirmation-validation.yaml`
proves the confirmation or limitation state against the validated seed. Assessment-aware
terminal readiness belongs to `handoff-decision-validation.yaml`.

## 17. Seed Validity

A seed is valid for handoff only when all required conditions are satisfied:

| Condition | Meaning |
|---|---|
| Purpose is explicit | The seed names the declared purpose, intended decisions, intended actions, and non-goals |
| Evidence closes | Every evidence ref points to an observed source record |
| Candidate disposition is complete | Every salient candidate has exactly one disposition |
| Objects are bounded | Every object type has a definition, evidence, and either a primary key or a limitation |
| Links close | Every link references known object types |
| Actions are bound | Every action references actors and affected objects or records a limitation |
| Dynamic treatment is explicit | Sensitive actions and data have permission treatment or a limitation |
| Data binding is explicit | Object and action state has source, read, write, or provenance treatment or a limitation |
| Ontology-facing handoff is explicit | Ontology-facing mapping or limitations cover the registry-owned `ontology_handoff_axis_registry`, including instance/ABox assertion coverage, reasoning/formalism profile, modeling concerns, reference-standard mapping, query access, visualization, graph exploration, graph connectivity, and limitations |
| Questions test the seed | `competency-questions.yaml` covers purpose, semantic, kinetic, dynamic, data, ontology-handoff, and limitation axes |
| Query proof is executable when claimed | `query-proofs-validation.yaml` proves query/API proof ids, fixtures, expected answer shapes, and observed results close to questions and evidence |
| Assessment is traceable | `competency-question-assessment.yaml` has exactly one traceable result per authoritative question |
| Seed confirmation is explicit | `seed-confirmation-validation.yaml` proves confirmation or limitation state matches the validated seed and derives CQ eligibility |
| Handoff is honest | `handoff-decision-validation.yaml` proves stop decision and readiness projection match validation results, including the validated pre-handoff run-manifest snapshot, before final output and record emission |

Validity does not mean the ontology is complete. It means the current seed is
safe to use for its declared downstream purpose with its limitations visible.
