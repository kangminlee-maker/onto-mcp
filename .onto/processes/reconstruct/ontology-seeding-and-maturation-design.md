# Reconstruct Ontology Seeding And Maturation Design

> Status: active design plan.
> Purpose: define reconstruct as a two-stage process: first create an
> `OntologySeed`, then mature that seed into an `ActionableOntology` through
> evidence-backed question iteration.

## 1. Goal

Reconstruct has two named stages:

| Stage | Name | Output | Purpose |
|---|---|---|---|
| 1 | `Ontology Seeding` | `OntologySeed` / `ontology-seed.yaml` | create an evidence-backed starting ontology seed and frontier for later iteration |
| 2 | `Ontology Maturation` | `ActionableOntology` | repeatedly ask questions from the current ontology, collect answer support from source material, runtime proof, user authority, or external authority, answer those questions, and expand the ontology across the seven maturity dimensions until static, kinetic, and dynamic actionability are all satisfied |

The current runtime target output is `ontology-seed.yaml`, an `OntologySeed`
that contains:

- why the target exists
- what operational objects exist
- which actors participate
- what actions, decisions, records, or obligations matter
- which material-specific structure is required for the target purpose
- which rules, constraints, responsibilities, or policies govern that structure
- which source data or source records back, read, write, or prove the seed
- which external competency-question artifact tests the seed
- which limitations must be carried into the next step

The seed is complete enough when it can be handed to `Ontology Maturation`
without pretending that missing actors, actions, permissions, data bindings,
runtime proofs, or external alignments are known.

`OntologySeed` is not action-ready. `ActionableOntology` is reached only after
the maturation loop has filled the ontology dimensions enough for the declared
decision or action purpose.

The seven maturation dimensions are:

| Dimension | What matures |
|---|---|
| structure | stable concepts, objects, actors, actions, values, states, and data bindings |
| relation | links, dependencies, lifecycle paths, ownership, permissions, and interaction paths |
| intent | why each modeled element matters and which decision or action it supports |
| principle | rules for classification, permission, validation, change, and exception handling |
| context | runtime, organizational, material, domain, and usage boundaries |
| evidence | source observations, answer support, validation evidence, and provenance |
| external | standards, external systems, integrations, external ontologies, and interoperability boundaries |

The seven dimensions are detailed coverage axes. Actionability is judged through
three higher-level surfaces:

| Actionability surface | Question it must answer | Main seed locations |
|---|---|---|
| `static_surface` | What exists, what does it mean, and what evidence/source authority grounds it? | `purpose`, `conceptual_frame`, `semantic_layer`, `data_binding_layer`, `source_authority` |
| `kinetic_surface` | Who can do what, through which action/function/workflow, and what changes or is recorded afterward? | `kinetic_layer`, `dynamic_layer.state_models`, `data_binding_layer.writebacks` |
| `dynamic_surface` | Under which conditions, permissions, states, exceptions, runtime contexts, external dependencies, or unresolved decisions does the answer change? | `decision_context`, `dynamic_layer`, `purpose_adequacy_frame`, `source_authority`, `handoff_limitations` |

An ontology is not actionable if it is only static. Static coverage produces a
glossary or structure map. Static plus kinetic coverage produces a process
model. Only static, kinetic, and dynamic coverage together produce a basis for
decision and action.

An actionable ontology kernel is not complete because each dimension appears
somewhere. It is complete only when the source-derived purpose has a
material-kind-specific `PurposeAdequacyFrame`: the source-backed set of elements
that must be represented for the target to fulfill its purpose.

The frame is not a universal flow. A code product may need actor, action, state,
permission, and data facets. A meeting record may need subject, participants,
decisions, action items, owners, deadlines, rationale, and unresolved topics. A
spreadsheet may need inputs, formulas, outputs, assumptions, source data, and
decision cells. The seed must preserve whichever facets are material for the
classified target material kind.

The kernel is scoped by the source-derived target purpose, not by a generic user
request to reconstruct a service. It does not need to model every possible
object, action, source, or external standard, but it must not omit a material
element required by the source-derived `PurposeAdequacyFrame`.

## 2. Non-Negotiable Constraints

1. Runtime validates; the host LLM authors semantic meaning.
2. Active reconstruct prompts and contracts load only the active reconstruct
   contract set.
3. Source material kind is classified before observation and validation.
4. Conceptual orientation is only one layer of the seed.
5. Salient candidates must receive explicit disposition.
6. Seed validity is separate from process completion.
7. Partial results may be useful, but limitations must be explicit.
8. Inferred target purpose requires user confirmation before seed readiness can
   be projected as `ready` or `limited`.
9. `reconstruct-contract-registry.yaml` is the canonical machine-readable
   authority graph for active runtime artifacts, validation gates, result
   projections, source profile records, and reconstruct lens judgment records.

## 3. Active Concept Model

| Concept | Role | Owner |
|---|---|---|
| `OntologySeeding` | first reconstruct stage that creates the seed and frontier | host LLM authored, runtime validated |
| `OntologySeed` | primary reconstruct semantic artifact for stage 1 | host LLM authored, runtime validated |
| `OntologyMaturation` | second reconstruct stage that expands the seed through question/evidence/answer iteration | host LLM authored, runtime validated |
| `ActionableOntology` | matured ontology that may support the declared decision or action purpose | host LLM authored, runtime validated |
| `ActionabilitySurface` | static, kinetic, and dynamic coverage surface used to judge whether the ontology can support decision and action | registry-owned coverage axis, host LLM authored in questions |
| `MaturationQuestionFrontier` | unanswered questions generated from the current ontology | host LLM authored, runtime validated |
| `AnswerSupport` | direct authority, runtime proof, user confirmation, or convergent source evidence that can support a maturation answer claim | host LLM authored, runtime validated |
| `TargetMaterialKind` | source handling axis | shared contract |
| `SourceProfileDefinition` | material-specific observation guide | reconstruct contract |
| `SelectedSourceProfile` | runtime selection recorded after material classification | runtime |
| `SourceObservation` | structural evidence record | runtime |
| `SourceDerivedPurpose` | target purpose inferred or confirmed from source material | host LLM authored, runtime evidence-validated |
| `PurposeAdequacyFrame` | material-kind-specific structure required for the source-derived purpose to be adequately represented | host LLM authored, runtime evidence-validated |
| `PurposeConfirmation` | user confirmation, rejection, or revision of an inferred target purpose | user decision recorded by runtime |
| `ReconstructLensJudgment` | independent semantic judgment over observed evidence | host LLM |
| `ExplorationSynthesis` | integrated round result and next-source need | host LLM |
| `SourceFrontier` | requested next source refs | host LLM authored, runtime validated |
| `MaturationClosureFrontier` | maturity-question-driven next-authority frontier covering source requests and non-source authority requests | host LLM authored, runtime validated |
| `CandidateInventory` | salient candidate set found in evidence | host LLM |
| `CandidateDisposition` | placement decision for every salient candidate | host LLM |
| `CompetencyQuestion` | question used to test seed usefulness | host LLM |
| `SeedIterationReadinessValidation` | runtime gate projection proving the seed can honestly enter maturation | runtime |
| `ReconstructRecord` | structured run record and artifact truth index | runtime |

New runtime or MCP fields should reuse these concepts. A new concept is allowed
only when it changes ownership, lifecycle, validation behavior, public output,
or artifact authority.

## 4. Extensibility Model

The reconstruct seeding structure is intentionally extensible. It should become
more precise by running against more real sources, but extension must happen
through profile and registry evolution, not through ad hoc runtime invention.

Stable boundary:

- `OntologySeed` remains the common artifact shape.
- `TargetMaterialKind` remains the first dispatch axis.
- `SourceProfileDefinition` owns material-specific reading guidance.
- The selected, validated `PurposeAdequacyFrame` owns the
  material-kind-specific requirement authority for a source-derived purpose.
  Seed and maturation artifacts may project it, but they must not redefine it.
- `SourceFrontier` owns seeding next-source requests.
  `MaturationClosureFrontier` owns maturation next-authority requests; it may
  include source requests, user authority, external authority, domain-standard
  authority, or runtime-capability gaps.
- Runtime validates ids, evidence refs, seed refs, limitations, source-profile
  snapshots, registry snapshots, and migration mappings.
- The host LLM authors purpose and semantic seed meaning.

Evolving boundary:

- Each source profile may add purpose-bearing evidence cues, recommended
  adequacy facets, closure examples, and anti-examples.
- New facet names start as profile-owned strings, not global enums.
- A facet is promoted into a shared/global registry only when repeated
  real-source runs show that it is stable across material kinds or when public
  validation behavior depends on it.
- A new material kind, root candidate kind, readiness value, artifact field, or
  validation gate requires contract, registry, validator, and migration updates
  together.

Run behavior for unknown or emerging source patterns:

1. Do not force the source into an existing flow or frame.
2. Record the observed signal with source refs.
3. Represent the needed element in the selected
   `PurposeAdequacyFrame.required_elements[]` when it is source-backed.
4. If closure is incomplete, add a limitation or source frontier.
5. After multiple runs, update the source profile and registry if the pattern is
   stable enough to become a reusable rule.

This keeps early runs useful without pretending the current profile catalog is
complete.

## 5. Target Process

```text
1. Bind target and reconstruct intent
2. Classify material kind
3. Build source inventory
4. Observe selected source slices once into reusable `source-observations.yaml`
5. Project purpose-bearing evidence from observed records
6. Derive source purpose and purpose adequacy frame candidates
7. Validate purpose and purpose adequacy evidence closure
8. Ask the user to confirm inferred purpose when no direct purpose authority exists
9. Project semantic-use evidence from the same observed records
10. Run reconstruct lens judgments
11. Synthesize gaps and next-source frontier
12. Repeat observation with round lineage if frontier is valid and useful
13. Build candidate inventory
14. Record candidate disposition
15. Author OntologySeed
16. Validate seed-shape gates
17. Author claim-realization map
18. Validate claim-realization map
19. Confirm seed claims or record limitations
20. Validate seed confirmation and derive CQ eligibility
21. Author competency questions
22. Validate competency-question coverage
23. Assess competency questions
24. Validate competency-question assessment
25. Classify failures and propose bounded revision
26. Emit metrics and stop decision
27. Validate seed iteration readiness from runtime gates and stop decision
28. Emit final output and reconstruct record
```

Each step either writes an artifact or records why it cannot proceed.

The second stage, `Ontology Maturation`, begins after a valid seed is available:

```text
OntologySeed
-> generate questions from current ontology gaps
-> answer questions that the ontology can already answer
-> search source material for unanswered questions
-> collect answer support from source evidence, runtime proof, user authority, or external authority
-> author answer claims with evidence refs
-> expand structure, relation, intent, principle, context, evidence, or external dimensions
-> validate the expanded ontology and remaining frontier
-> repeat until the declared maturity threshold is met
-> ActionableOntology
```

### 5.1 Seeding Revision Design

The current seeding path already produces `OntologySeed` and validates that the
seed declares `static_surface`, `kinetic_surface`, and `dynamic_surface` in
`validation_layer.coverage_axes[]`. The next seeding revision must connect those
surface names to source-backed seed content. A seed that merely lists the three
surface ids is not yet sufficient.

Seeding revision goal:

```text
source-observations.yaml
-> source-purpose-candidates.yaml
-> purpose-confirmation.yaml when needed
-> PurposeAdequacyFrame with actionability surface mapping
-> candidate inventory and disposition with surface/facet mapping
-> OntologySeed with static, kinetic, and dynamic seed content or limitations
-> seed validation and seed iteration readiness
```

Implementation rule: promote seeding changes before maturation runtime changes.
Seeding is the authority boundary that decides whether maturation has a valid
kernel to continue from. Maturation implementation may start only after the
seeding runtime can produce source-purpose candidates, purpose confirmation
validation, surface-mapped candidate disposition, and surface-closure seed
validation against a real source.

Current active runtime requires source-purpose and purpose-confirmation refs for
seed validity and seed-iteration readiness projection. These refs are promoted
artifact authorities with runtime validators. `ontology-seed.yaml` may carry
only a bounded projection of the selected validated source-purpose authority and
confirmation result.

The first implementation must not create compatibility projections for legacy
seed names. If an old artifact shape remains in tests or docs, migrate or remove
the old reference instead of projecting it into the new runtime path.

#### Purpose Authority Split

Purpose inference and user confirmation must become their own authority
artifacts. `ontology-seed.yaml` may carry the confirmed purpose projection, but
it must not be the only place where inferred purpose was selected or confirmed.

| Artifact | Owner | Role |
|---|---|---|
| `source-purpose-candidates.yaml` | host LLM author | ranked source-derived purpose candidates and candidate `PurposeAdequacyFrame` rows |
| `source-purpose-candidates-validation.yaml` | runtime | evidence-ref, evidence-kind, contradiction, ranking, and material-kind closure |
| `purpose-confirmation.yaml` | user-mediated runtime artifact | confirmation, rejection, or revision of an inferred purpose |
| `purpose-confirmation-validation.yaml` | runtime | confirms that inferred purpose status can be used for seed readiness |

Purpose confirmation and seed confirmation are different gates. Purpose
confirmation validates the selected source-derived purpose before seed authoring
can honestly project readiness. `seed-confirmation.yaml` validates authored seed
claims after `ontology-seed.yaml` exists and before competency-question
assessment and seed-iteration readiness.

Direct P1 source-declared purpose may bypass user confirmation, but it still
needs `source-purpose-candidates.yaml` so the selected purpose, rejected
alternatives, and evidence policy remain auditable.

Implementable `source-purpose-candidates.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
target_material_kind:
source_observations_ref: source-observations.yaml
selected_source_profile_refs:
  - profile_id:
    target_material_kind:
    profile_ref:
    definition_sha256:
purpose_candidates:
  - purpose_candidate_id:
    statement:
    rank: primary | secondary | candidate | rejected
    purpose_source_status: explicit_source_declared | convergent_inferred | limitation_backed | unresolved
    evidence_kind_refs: [P1 | P2 | P3 | P4 | P5]
    supporting_evidence_refs: []
    contradicting_source_refs: []
    adequacy_frame:
      frame_id:
      frame_kind:
      frame_status: source_declared | evidence_inferred | limitation_backed | unresolved
      adequacy_claim:
      material_kind_requirements:
        target_material_kind:
        required_facets: []
        optional_facets: []
        rationale:
      required_elements:
        - element_id:
          element_kind:
          material_facet_kind:
          description:
          actionability_surface_refs: []
          maturity_dimension_refs: []
          member_scope_refs: []
          member_target_material_kind:
          member_source_refs: []
          cross_material_ref_refs: []
          supporting_evidence_refs: []
          expected_seed_ref_families: []
          closure_expectation: model_or_limit | frontier_required
    ranking_rationale:
    limitation_refs: []
selection:
  primary_purpose_candidate_id:
  selection_basis:
  confirmation_policy_hint:
  unresolved_reason:
```

Implementable `source-purpose-candidates-validation.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
source_purpose_candidates_ref: source-purpose-candidates.yaml
source_observations_ref: source-observations.yaml
registry_ref: .onto/processes/reconstruct/reconstruct-contract-registry.yaml
validation_status: valid | invalid
selected_purpose_candidate_id:
selected_purpose_frame_id:
confirmation_required:
validation_results: []
violations:
  - code:
    message:
    subject_id:
    evidence_ref:
```

The purpose candidate validator must enforce:

- exactly one `primary` candidate when the purpose is selected;
- every evidence ref resolves to `source-observations.yaml`;
- P5 evidence never establishes a primary purpose by itself;
- non-P1 primary candidates have at least two evidence kinds and one of them is
  P2, P3, or P4;
- every candidate adequacy-frame required element has a material facet,
  actionability surface refs, maturity dimension refs, and supporting evidence or
  an explicit unresolved/limitation state;
- for `target_material_kind: mixed`, every modeled required element has the
  full lineage set: `member_scope_refs[]`, `member_target_material_kind`,
  `member_source_refs[]`, and `cross_material_ref_refs[]`; a row may omit those
  fields only through a validated limitation-backed or out-of-scope exclusion;
- contradictions are preserved and make the primary candidate
  `limitation_backed` or `unresolved` unless a source-backed resolution is
  recorded;
- `confirmation_required` is the runtime predicate field derived from the
  selected candidate status and is the only source for the purpose-confirmation
  gate;
- the selected purpose candidate id and selected frame id are explicit so seed
  validation can prove projection equivalence.

`purpose_source_status` is the canonical field name for source-purpose candidate
status. Active artifacts must not introduce `source_purpose_status`,
`inference_status`, or other aliases; validators reject alias-only status fields
as schema drift. `contradicting_source_refs[]` is the canonical contradiction
field for source-purpose candidates because contradiction authority is the
observed source record, not an unscoped evidence label.

Implementable `purpose-confirmation.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
source_purpose_candidates_ref: source-purpose-candidates.yaml
source_purpose_candidates_validation_ref: source-purpose-candidates-validation.yaml
purpose_candidate_id:
confirmation_status: not_required | pending | confirmed | rejected | revised_pending_evidence_check | revised_confirmed | not_available
confirmed_statement:
revised_statement:
confirmed_frame_element_refs: []
rejected_frame_element_refs: []
user_response_summary:
source_conflict_policy:
limitation_refs: []
```

Implementable `purpose-confirmation-validation.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
purpose_confirmation_ref: purpose-confirmation.yaml
source_purpose_candidates_validation_ref: source-purpose-candidates-validation.yaml
validation_status: valid | invalid
purpose_projection_status: usable | blocked | rerun_required
confirmed_purpose_candidate_id:
confirmed_statement:
seed_readiness_effect: may_project_ready_or_limited | must_project_blocked | must_rerun_purpose_discovery
validation_results: []
violations:
  - code:
    message:
    subject_id:
```

`confirmation_required` is authoritative only in
`source-purpose-candidates-validation.yaml`. `purpose-confirmation.yaml` records
the user's response to that validated requirement and must not become a second
gate-applicability source.

`ontology-seed.yaml.purpose` is a bounded projection from these two purpose
authorities after promotion. The seed stores authority refs, selected ids, a
declared-purpose projection, and a seed-closure projection of the selected
adequacy frame. It must not copy the full candidate ledger, invent a new purpose
candidate, or erase rejected/contradicted purpose candidates from the
source-purpose authority.

#### PurposeAdequacyFrame Surface Mapping

The canonical `PurposeAdequacyFrame` row lives in the selected
`source-purpose-candidates.yaml` candidate after
`source-purpose-candidates-validation.yaml` proves evidence closure and selected
candidate consistency. The seed stores a projection of that frame so runtime can
validate seed closure. Maturation must resolve the frame through the selected
validated candidate and then verify that the seed projection is equivalent before
using it as a baseline input.

Each projected `purpose_adequacy_frame_projection.required_elements[]` row must
declare the actionability and maturity coverage it is meant to close.
`closure_status` is a seed-projection status, not canonical requirement meaning.

Seed frame projection fields:

```yaml
purpose_adequacy_frame_projection:
  required_elements:
    - element_id:
      element_kind:
      material_facet_kind:
      actionability_surface_refs: [static_surface | kinetic_surface | dynamic_surface]
      maturity_dimension_refs: [structure | relation | intent | principle | context | evidence | external]
      member_scope_refs: []
      member_target_material_kind:
      member_source_refs: []
      cross_material_ref_refs: []
      closure_status: modeled | limitation_backed | frontier_required
      seed_ref_refs: []
      evidence_refs: []
      limitation_refs: []
```

Runtime validation must fail loud when a required element has no surface refs,
no maturity dimension refs, or a `closure_status` inconsistent with its seed
refs, evidence refs, and limitation refs.

For `mixed` targets, runtime validation must also fail loud when a projected
required element loses the selected validated frame's member lineage. Each row
must preserve `member_scope_refs[]`, `member_target_material_kind`,
`member_source_refs[]`, and `cross_material_ref_refs[]`, or cite a
limitation-backed/out-of-scope exclusion validated by
`source-purpose-candidates-validation.yaml`. This applies even when aggregate
readiness is `ready`; member provenance is not only a blocked/limited
remediation field.

Surface closure is evaluated from seed ref families, not from prose. The first
validator implementation should use these path prefixes:

| Surface | Seed ref families that may close it |
|---|---|
| `static_surface` | `conceptual_frame.*`, `semantic_layer.object_types`, `semantic_layer.link_types`, `semantic_layer.value_types`, `semantic_layer.constraints`, `data_binding_layer.source_bindings`, `data_binding_layer.provenance_bindings`, `source_authority.*` |
| `kinetic_surface` | `kinetic_layer.action_types`, `kinetic_layer.functions`, `kinetic_layer.workflows`, `dynamic_layer.state_models`, `data_binding_layer.writebacks` |
| `dynamic_surface` | `decision_context.*`, `dynamic_layer.actor_types`, `dynamic_layer.actor_roles`, `dynamic_layer.permission_policies`, `dynamic_layer.state_models`, `dynamic_layer.lifecycle_rules`, `dynamic_layer.dynamic_boundaries`, `source_authority.source_gaps`, `handoff_limitations` |

`closure_status` must be interpreted deterministically:

| `closure_status` | Required refs |
|---|---|
| `modeled` | at least one `seed_ref_refs[]` item in an allowed family for every declared actionability surface, plus at least one evidence ref |
| `limitation_backed` | at least one limitation ref whose affected refs, missing source refs, or mitigation text names the same required element, plus supporting evidence or source-gap evidence |
| `frontier_required` | at least one limitation ref that names the next source, user, or external authority needed to model the element |

If a required element declares several actionability surfaces, each surface must
be independently closed. A static object ref cannot close the kinetic or dynamic
surface unless the element also cites action, state, permission, boundary,
writeback, or limitation refs for that surface.

#### Candidate Surface Mapping

Candidate inventory and disposition are the bridge from observed evidence to
seed layers. They must preserve the actionability role of each candidate before
the seed is authored.

Candidate mapping fields:

```yaml
candidate_inventory:
  candidates:
    - candidate_id:
      candidate_kind:
      material_facet_kind:
      actionability_surface_refs: []
      purpose_element_refs: []
      evidence_observation_ids: []

candidate_disposition:
  dispositions:
    - candidate_id:
      disposition_id:
      target_seed_refs: []
      satisfies_purpose_element_refs: []
      actionability_surface_refs: []
      rationale:
      evidence_observation_ids: []
```

The root `candidate_kind_registry` should remain compact. Material-specific
facet names begin as source-profile-owned strings through
`material_facet_kind`; they are promoted to a shared registry only after real
source runs prove the term is stable across material kinds or validation
behavior depends on it.

Candidate validation must additionally enforce:

- every high-salience candidate has `actionability_surface_refs[]` and at least
  one `purpose_element_refs[]` item unless it is explicitly rejected for the
  declared purpose;
- every disposition copies or narrows the candidate surface refs;
- `satisfies_purpose_element_refs[]` resolves to the selected
  `PurposeAdequacyFrame.required_elements[]`;
- every `promoted_to_seed_layer` disposition has `target_seed_refs[]`, and seed
  validation later proves those refs exist;
- `deferred_to_maturation` dispositions preserve relevant evidence-backed
  candidates that are not needed for the first valid seed kernel;
- `deferred_by_source_gap` dispositions cite a limitation or source frontier;
- rejected candidates keep evidence and rationale so salience is not silently
  lost.

#### Dynamic Boundary Rows

The existing dynamic layer covers actors, roles, permissions, state models, and
lifecycle rules. That is necessary but not sufficient for the broader dynamic
surface. Seeding needs one explicit place for conditions and boundaries that
change an answer without necessarily becoming a state machine.

Seed dynamic-boundary fields:

```yaml
dynamic_layer:
  dynamic_boundaries:
    - boundary_id:
      boundary_kind: condition | exception | runtime_context | external_dependency | unresolved_decision | failure_mode
      target_ref:
      statement:
      changes_answer_for:
      evidence_refs: []
      limitation_refs: []
```

Use `dynamic_boundaries[]` for runtime conditions, source gaps, external
dependencies, exception behavior, and user/product decisions that change whether
a question can be answered or an action can be trusted.

Dynamic-boundary validation is part of ontology seed validation:

- `boundary_id` is unique inside `dynamic_layer.dynamic_boundaries[]`;
- `boundary_kind` is one of the listed values;
- `target_ref` resolves to a known seed ref, purpose element ref, or limitation
  ref;
- `evidence_refs[]` resolves to `source-observations.yaml` unless the boundary is
  explicitly user-confirmed;
- `unresolved_decision` and `external_dependency` boundaries must cite
  `limitation_refs[]`;
- a purpose element that declares `dynamic_surface` cannot be `modeled` unless it
  cites at least one permission, state, lifecycle, dynamic-boundary, source-gap,
  or limitation ref.

#### Seeding Validation Additions

The seed validator must move from surface declaration to surface closure:

| Gate | Required validation behavior |
|---|---|
| purpose authority | selected purpose has a valid source-purpose candidate row and confirmation status when inferred |
| frame surface mapping | every required frame element maps to at least one actionability surface and one maturity dimension |
| static closure | static required elements cite object/value/constraint/data/source refs or limitation-backed frontier |
| kinetic closure | kinetic required elements cite action/function/workflow/writeback/state-effect refs or limitation-backed frontier |
| dynamic closure | dynamic required elements cite permission/state/lifecycle/dynamic-boundary/external/source-gap refs or limitation-backed frontier |
| candidate realization | every promoted or represented candidate satisfies its declared purpose element and surface mapping |
| limitation honesty | non-modeled required elements use `closure_status: limitation_backed` or `frontier_required` and resolve limitation refs |

This revision keeps the seed small. It does not try to finish actionability
during seeding; it ensures maturation receives the correct frontier instead of
rediscovering the target from zero.

Implementation order for seeding gates:

| Order | Runtime change | First passing evidence |
|---|---|---|
| S1 | add artifact types for source-purpose candidates and purpose confirmation | parser/fixture tests reject missing candidate ids, bad evidence refs, and unsupported status values |
| S2 | add source-purpose candidate author prompt after source observation and before candidate inventory | direct-call run writes `source-purpose-candidates.yaml` with ranked candidates from existing observations |
| S3 | add purpose candidate validator and registry gate | invalid P5-only purpose and dangling evidence refs fail before seed authoring |
| S4 | add purpose confirmation artifact and validator | inferred purpose blocks seed readiness until confirmation is valid |
| S5 | extend candidate inventory/disposition types and prompts with surface/facet mapping | high-salience candidates carry purpose element refs and actionability surface refs |
| S6 | extend seed author prompt and seed contract with required-element closure fields and `dynamic_boundaries[]` | seed contains mapped purpose elements and dynamic boundary rows where needed |
| S7 | extend ontology seed validator from axis declaration to surface closure | a seed that lists `static_surface`, `kinetic_surface`, and `dynamic_surface` but lacks content fails loud |
| S8 | update final output, status, record, and metrics projections | process completion, seed validity, purpose confirmation, and maturation frontier are reported separately |

The narrow release target for seeding is one real-source run that reaches
`ready` or `limited` honestly, or fails at the first invalid gate with a concrete
validation artifact. A mock-backed run may verify test coverage, but it does not
count as product completion.

#### Seeding Revision Completion Criteria

The seeding revision is complete when a fresh real-source run proves:

1. source purpose candidates are ranked, evidence-backed, and validation-closed;
2. inferred purpose confirmation is external to the seed and blocks readiness
   when absent;
3. every purpose adequacy required element declares actionability surface,
   maturity dimension, and closure status;
4. candidate inventory and disposition preserve surface/facet mapping;
5. `OntologySeed` includes static, kinetic, and dynamic content or explicit
   limitations for every material required element;
6. seed validation fails loud when a surface is declared but has no modeled or
   limitation-backed content; and
7. final output reports seed validity, seed iteration readiness, and maturation
   frontier separately.

### 5.2 Ontology Maturation Design

`Ontology Maturation` starts only after seeding produces a valid seed or a
limited seed that is explicitly usable for the next iteration. Maturation does
not rerun seeding. It consumes the seed, its validation artifacts, limitations,
competency-question assessment, and source observations.

Maturation input authority:

```text
ontology-seed.yaml
+ ontology-seed-validation.yaml
+ source-purpose-candidates.yaml
+ source-purpose-candidates-validation.yaml
+ purpose-confirmation-validation.yaml
+ candidate-disposition.yaml
+ claim-realization-map.yaml
+ claim-realization-map-validation.yaml
+ competency-questions.yaml
+ competency-questions-validation.yaml
+ competency-question-assessment.yaml
+ competency-question-assessment-validation.yaml
+ handoff-decision-validation.yaml
+ source-observations.yaml
+ reconstruct-record.yaml artifact refs and hashes
+ reconstruct-run-manifest.yaml snapshot refs and hashes
```

When the seed claims executable queryability, visualization, graph exploration,
API access, implementation access, or another explicit ontology access surface,
maturation must also consume the applicable proof authorities and validation
artifacts defined by `operational-ontology-seed-contract.md`:

```text
query-proofs.yaml
+ query-proofs-validation.yaml
+ visualization-proofs.yaml
+ visualization-proofs-validation.yaml
+ graph-exploration-proofs.yaml
+ graph-exploration-proofs-validation.yaml
```

These artifacts are not redefined by this design. `competency-questions.yaml`
is the question authority, `competency-question-assessment.yaml` is the
answerability-result authority, and conditional proof artifacts own executable
proof records. Maturation references those authorities when computing baseline,
answerability, readiness, and actionability.

#### Maturation Process

```text
1. Build the maturity baseline from seed refs, required purpose elements,
   actionability surfaces, seven maturity dimensions, CQ assessment, and
   limitations.
2. Generate a `MaturationQuestionFrontier` from unanswered, partially answered,
   deferred, contradicted, or limitation-backed seed questions.
3. Classify each question by materiality, actionability surface, maturity
   dimension, purpose element, and expected answer kind.
4. Answer questions already answerable from the current ontology and evidence.
5. For unanswered material questions, author a `MaturationClosureFrontier` that
   names the next source refs or the missing user/external authority.
6. Runtime observes approved source refs and records round lineage.
7. Build a `AnswerSupportLedger` from direct authority, runtime proof,
   user confirmation, or repeated source signals that imply the same answer.
8. Author `MaturationAnswerClaims` only from convergent evidence or explicit
   authority.
9. Author `OntologyExpansion` rows that add, refine, defer, or reject ontology
   content.
10. Validate expansion against seed refs, evidence refs, source lineage,
    surface coverage, and concept economy.
11. Update `ActionabilityMatrix` and remaining frontier.
12. Repeat until convergence or an explicit blocked/deferred state.
```

#### Maturation Artifact Plan

| Artifact | Owner | Role |
|---|---|---|
| `maturation-baseline.yaml` | runtime | L0-L4 matrix from seed, CQs, limitations, and handoff validation |
| `maturation-baseline-validation.yaml` | runtime | proves baseline rows derive from validated seed, purpose, CQ/proof, and handoff authorities |
| `maturation-promotion-request.yaml` | runtime | durable request authority for maturation execution or planned gate promotion |
| `maturation-promotion-request-validation.yaml` | runtime | proves request id, trigger refs, requested gates, and replay authority before promotion-readiness evaluation |
| `maturation-runtime-capability-profile.yaml` | runtime | records runtime-observed writer, validator, predicate, and activation capability for planned maturation gates |
| `maturation-promotion-readiness.yaml` | runtime | per-gate promotion decision before planned maturation gates become executable |
| `maturation-question-frontier.yaml` | host LLM author | unanswered or weakly answered questions to mature |
| `maturation-question-frontier-validation.yaml` | runtime | question refs, materiality, surface, dimension, and seed-link validation |
| `maturation-closure-frontier.yaml` | host LLM author | next source refs or missing authority needed for material questions |
| `maturation-closure-frontier-validation.yaml` | runtime | frontier duplication, support, and boundary validation |
| `maturation-authority-response.yaml` | user/runtime/external authority captured by runtime | responses to non-source authority requests from the closure frontier |
| `maturation-authority-response-validation.yaml` | runtime | proves authority response scope, status, and refs before answer support or continuation decisions consume it |
| `rounds/<round-id>/source-observation-delta.yaml` | runtime | canonical per-round source delta for `source_frontier` or `maturation_closure_frontier`, distinguished by `frontier_kind` and `frontier_validation_ref` |
| `answer-support-ledger.yaml` | host LLM author + runtime refs | evidence clusters that support answer claims |
| `answer-support-ledger-validation.yaml` | runtime | evidence closure, independence, contradiction, and authority checks |
| `maturation-answer-claims.yaml` | host LLM author | source-backed answers to frontier questions |
| `maturation-answer-claims-validation.yaml` | runtime | answer claim refs, evidence, and limitation closure |
| `ontology-expansion.yaml` | host LLM author | ontology additions/refinements/deferred/rejected changes |
| `ontology-expansion-validation.yaml` | runtime | concept economy, ref closure, surface coverage, and regression guards |
| `actionability-matrix.yaml` | runtime | static/kinetic/dynamic by 7D and purpose element, with L0-L4 levels |
| `actionability-matrix-validation.yaml` | runtime | proves matrix rows derive from validated baseline plus validated maturation deltas |
| `maturation-continuation-decision.yaml` | runtime | continue, ask user, blocked, actionable limited, or actionable ready |
| `maturation-continuation-decision-validation.yaml` | runtime | proves the continuation or terminal actionability state derives from the validated actionability matrix and any applicable frontier/support authorities |
| `actionable-ontology.yaml` | host LLM author | matured ontology projection when ready or limited |
| `actionable-ontology-validation.yaml` | runtime | final actionability, evidence, query/proof, and limitation validation |

#### Maturation Authority Graph

Maturation artifacts follow one authority direction:

```text
validated seed + selected validated purpose frame + CQ assessment + proof validations
-> durable promotion request + runtime capability profile + promotion readiness validation when maturation gates are promoted
-> immutable maturation-baseline.yaml
-> maturation-baseline-validation.yaml
-> question/closure frontier
-> answer support and answer claims
-> ontology expansion overlay
-> current actionability-matrix.yaml
-> actionability-matrix-validation.yaml
-> maturation-continuation-decision.yaml
-> maturation-continuation-decision-validation.yaml
-> optional actionable-ontology.yaml projection
```

`maturation-baseline.yaml` is an immutable first snapshot for the maturation
session. It records the starting L0-L4 state from seed refs, selected validated
purpose-frame rows, CQ assessment, proof validation, and limitations. It must not
be updated after the first maturation round. `maturation-baseline-validation.yaml`
is the authority that later frontier and matrix validators consume; raw baseline
rows are not sufficient by themselves.

`actionability-matrix.yaml` is the current runtime projection after applying
validated answer claims and ontology expansions. It may be recomputed each round
from the baseline plus validated deltas. If a row exists in both artifacts, the
baseline row is historical start state and the actionability row is current
state; neither may be used as the other's source authority without the
derivation inputs. `actionability-matrix-validation.yaml` proves the
recomputation before continuation-decision or actionable ontology projection.

In M1, no maturation deltas exist yet. That is a valid zero-delta matrix state:
the actionability matrix may derive only from
`maturation-baseline-validation.yaml`, and delta validation artifacts become
required only when their corresponding answer-claim or expansion artifacts
exist.

Conditional proof authorities are part of the maturation dependency path when
their downstream claim exists. `maturation-baseline-validation.yaml` consumes the
applicable proof validations before a runtime/query, visualization, or graph
claim can affect the baseline; `actionability-matrix-validation.yaml` preserves
those proof refs in row-level maturity; and `actionable-ontology-validation.yaml`
rechecks the same proof authority before projecting an actionable ontology claim.

Maturation implementation starts as a continuation path from a completed seeding
session. It must consume artifact refs and hashes from `reconstruct-record.yaml`
instead of reparsing the target from scratch. New source observation is allowed
only through a validated maturation closure frontier.

Common validation artifact shape for maturation validators:

```yaml
schema_version: "1"
session_id:
created_at:
validator_id:
validator_version:
input_authority_refs: []
validation_status: valid | invalid
validation_results: []
violations:
  - code:
    message:
    subject_id:
    artifact_ref:
    evidence_ref:
```

The first maturation implementation should be delivered in four slices:

| Slice | Active output | Runtime/LLM ownership | Done when |
|---|---|---|---|
| M1 baseline | `maturation-baseline.yaml`, `maturation-baseline-validation.yaml`, initial `actionability-matrix.yaml`, and `actionability-matrix-validation.yaml` | runtime projection from seed validation, selected validated purpose frame, CQ/proof assessment, and limitations | every purpose element x actionability surface x maturity dimension row has L0-L4 level, supporting refs, blockers, and next action; baseline is immutable, matrix is derived, and both have validation proof |
| M2 question frontier | `maturation-question-frontier.yaml` and validation | host LLM authors questions; runtime validates refs/materiality/surface/dimension | every blocker/high L0-L2 row has a frontier question or limitation/user-authority row |
| M3 support and claims | `maturation-closure-frontier.yaml`, observation delta, `answer-support-ledger.yaml`, `maturation-answer-claims.yaml`, validations | host LLM requests/claims; runtime validates closure frontier, observation lineage, and answer support closure | no answer claim exists without direct authority, runtime proof, user confirmation, or convergent source evidence |
| M4 expansion/continuation | `ontology-expansion.yaml`, `maturation-continuation-decision.yaml`, `maturation-continuation-decision-validation.yaml`, optional `actionable-ontology.yaml` | host LLM authors expansion; runtime validates matrix/continuation/final projection | continuation decision is `continue`, `ask_user`, `blocked`, `actionable_limited`, or `actionable_ready` from validated matrix and frontier state |

M1 and M2 are the minimum useful maturation surface. They let a seed expose its
next questions without claiming an actionable ontology. M3 and M4 are required
before the runtime may claim maturation can extend the ontology and project an
`ActionableOntology`.

#### Maturation Question Frontier

Each frontier question must be concrete enough to drive evidence search or
closure:

```yaml
questions:
  - question_id:
    question:
    materiality: blocker | high | medium | low | info
    materiality_ref:
    actionability_surface_refs: []
    maturity_dimension_refs: []
    purpose_element_refs: []
    baseline_row_refs: []
    competency_question_refs: []
    competency_assessment_refs: []
    domain_competency_trace_refs: []
    seed_ref_refs: []
    current_answer_status: answerable | partially_answerable | unsupported | deferred | contradicted | not_applicable
    expected_answer_kind: yes_no | explanation | list | mapping | gap_statement
    evidence_needed:
    authority_need:
      authority_kind: none | user | external_system | domain_standard | runtime_capability
      authority_scope:
      blocking_if_unavailable: true | false
      expected_response_kind: confirmation | value | policy | capability | external_reference | unavailable_reason
    closure_frontier_hint_refs: []
    limitation_refs: []
```

The frontier must preserve user-decision and external-authority gaps as first
class rows. They are not evidence-search questions unless source evidence can
actually change the answer.

Question-frontier validation must enforce:

- `question_id` uniqueness;
- `materiality`, `current_answer_status`, and `expected_answer_kind` values are
  allowed;
- every question has at least one actionability surface and one maturity
  dimension;
- every `purpose_element_refs[]`, `seed_ref_refs[]`, and `limitation_refs[]`
  entry resolves against the baseline authorities;
- every competency question, assessment, and domain trace ref resolves when
  present, so maturation does not lose domain or CQ coverage lineage;
- `authority_need` is first-class data when the next answer depends on user,
  external-system, domain-standard, or runtime-capability authority rather than
  source evidence;
- blocker/high questions cite a closure frontier hint, limitation, user authority
  need, or explicit reason why no next source can advance them;
- low/info questions cannot block the maturation continuation decision.

Implementable `maturation-baseline.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
source_seed_ref: ontology-seed.yaml
source_seed_validation_ref: ontology-seed-validation.yaml
source_claim_realization_map_validation_ref: claim-realization-map-validation.yaml
source_competency_assessment_ref: competency-question-assessment.yaml
source_reconstruct_record_ref: reconstruct-record.yaml
source_run_manifest_ref: reconstruct-run-manifest.yaml
source_handoff_decision_validation_ref:
purpose_frame_ref:
baseline_rows:
  - baseline_row_id:
    purpose_element_ref:
    actionability_surface_ref:
    maturity_dimension_ref:
    materiality: blocker | high | medium | low | info
    materiality_ref:
    member_scope_refs: []
    member_target_material_kind:
    member_source_refs: []
    cross_material_ref_refs: []
    competency_question_refs: []
    competency_assessment_refs: []
    domain_competency_trace_refs: []
    maturity_level: L0_missing | L1_identified | L2_modeled | L3_evidenced | L4_validated_for_purpose
    supporting_seed_refs: []
    supporting_evidence_refs: []
    supporting_validation_refs: []
    limitation_refs: []
    blocking_reason:
```

`maturation-baseline.yaml` is a runtime projection. It does not add ontology
meaning; it only scores existing seed and validation evidence into rows that the
question frontier can target.

`maturation-baseline-validation.yaml` must prove:

- every baseline row resolves to a selected purpose-frame required element,
  actionability surface, and maturity dimension;
- every row derives from validated seed refs, validated CQ/proof results,
  limitations, or a validated source-purpose/purpose-confirmation authority;
- every seed claim ref used by the baseline resolves through
  `claim-realization-map-validation.yaml`;
- baseline source refs and hashes match `reconstruct-record.yaml` and the
  selected run-manifest snapshot so a later maturation session can replay exactly
  which seed authority it consumed;
- `source_handoff_decision_validation_ref` points to the prior/source seed-session
  handoff authority, not the current terminal handoff artifact being computed;
- every mixed-material row preserves member source, member material kind, and
  cross-material lineage or an explicit limitation-backed exclusion;
- every row that originated from competency-question assessment preserves the
  competency question, assessment, and optional domain competency trace refs;
- blocker/high L0-L2 rows are not silently ignored and project a frontier,
  limitation, or user/external authority need;
- baseline input refs and hashes are immutable for the maturation session.

Materiality authority is explicit. `materiality_ref` may point only to:

- `maturation-baseline.yaml.baseline_rows[].baseline_row_id`
- `maturation-question-frontier.yaml.questions[].question_id`
- `competency-question-assessment.yaml` answerability rows that are admitted by
  `competency-question-assessment-validation.yaml`
- admitted domain competency trace refs recorded in the run manifest snapshot

When multiple refs apply, the stricter materiality wins. Runtime must not infer
materiality from prose after these artifacts exist.

Required domain competency failures are not diagnostic-only during maturation.
If an admitted domain competency question is required by the run-manifest
admission policy and its assessment is unsupported, contradicted, partial, or
deferred, maturation must project it into at least one of:

- a baseline row with materiality and competency refs;
- a maturation frontier question;
- a closure-frontier authority request;
- a limitation-backed exclusion visible to the continuation decision.

Implementable `maturation-closure-frontier.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
round_id:
question_frontier_ref: maturation-question-frontier.yaml
source_requests:
  - source_request_id:
    question_refs: []
    member_scope_refs: []
    member_source_refs: []
    cross_material_ref_refs: []
    requested_source_ref:
    requested_location:
    target_material_kind:
    expected_evidence_kind:
    reason:
authority_requests:
  - authority_request_id:
    question_refs: []
    authority_kind: user | external_system | domain_standard | runtime_capability
    authority_scope:
    request_summary:
    request_rationale:
    blocking_if_unavailable: true | false
    expected_response_kind: confirmation | value | policy | capability | external_reference | unavailable_reason
    limitation_refs: []
```

The closure-frontier validator must reject duplicate or already-observed source
requests, unsupported material refs, semantic-only locations, and requests whose
question refs do not resolve to material unanswered questions. For mixed
material targets, every source request must preserve member scope, member source,
and cross-material refs or cite an explicit limitation. Authority requests are
validated as authority gaps, not as source locations. It must also prove
authority request id uniqueness, allowed `authority_kind` and
`expected_response_kind` values, question-ref closure, blocking semantics against
question materiality, duplicate authority request detection by question/scope,
and source-request separation.

Implementable `maturation-authority-response.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
closure_frontier_ref: maturation-closure-frontier.yaml
responses:
  - authority_response_id:
    authority_request_ref:
    authority_kind: user | external_system | domain_standard | runtime_capability
    authority_identity:
      authority_id:
      authority_label:
      authority_role:
    authority_snapshot_ref:
    authority_version_or_timestamp:
    response_status: provided | unavailable | rejected | deferred | contradicted
    response_summary:
    response_source_ref:
    supporting_refs: []
    limitation_refs: []
```

Authority responses are not source observations. If a response supplies source
evidence, it must cite source observation refs and go through observation
lineage. Otherwise it is an authority artifact consumed by answer-support and
continuation-decision validators. Runtime records enough authority identity and
snapshot information to replay who or what supplied the answer, which request it
answered, and whether the same authority can be queried again.

#### Answer Support Rules

A material answer claim may be authored only when one of these support modes is
available:

| Support mode | Requirement |
|---|---|
| direct authority | source directly states the answer and is target-scoped |
| runtime proof | validated query, test, formula, execution, or artifact proof demonstrates the answer |
| user confirmation | user confirms a source-inferred purpose or decision boundary |
| authority response | user, runtime, external-system, or domain-standard authority answers a closure-frontier authority request |
| convergent source evidence | at least two independent evidence records imply the same answer, with contradictions recorded |

Weak naming, folder structure, or single ambiguous evidence may create a
frontier question, but it must not produce a material answer claim.

Implementable `answer-support-ledger.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
round_id:
evidence_clusters:
  - evidence_cluster_id:
    question_refs: []
    support_mode: direct_authority | runtime_proof | user_confirmation | authority_response | convergent_source_evidence
    proposed_answer_summary:
    evidence_refs: []
    proof_refs: []
    user_confirmation_refs: []
    authority_response_refs: []
    independence_basis:
    contradiction_refs: []
    limitation_refs: []
```

For `convergent_source_evidence`, runtime validation must require at least two
evidence refs with different source locations or evidence kinds unless the
selected source profile explicitly marks a single source record as direct
authority. Contradictions do not automatically invalidate a cluster, but they
must prevent answer-claim validation unless the claim records how the
contradiction is bounded.

Positive answer claims and non-positive closure states are different artifacts.
`maturation-answer-claims.yaml` may contain only answers that have a positive
support mode. Deferred, contradicted, unsupported, not applicable, blocked, and
limitation-only rows remain in `maturation-question-frontier.yaml`,
`maturation-continuation-decision.yaml`, or limitation artifacts. They may explain why the
run cannot answer a question, but they are not support for an answer claim.

Implementable `maturation-answer-claims.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
round_id:
answer_claims:
  - answer_claim_id:
    question_id:
    answer:
    answer_status: answered | partially_answered
    support_mode: direct_authority | runtime_proof | user_confirmation | authority_response | convergent_source_evidence
    evidence_cluster_refs: []
    supporting_evidence_refs: []
    target_surface_refs: []
    target_dimension_refs: []
    purpose_element_refs: []
    limitation_refs: []
```

Answer-claim validation must reject claims whose support mode is not backed by a
valid evidence cluster, proof, or user confirmation. An answer may be
`partially_answered` only when the answered portion has positive support and the
remaining gap is represented as a limitation or frontier question.

#### Ontology Expansion Rules

`ontology-expansion.yaml` may add or refine ontology content only through
bounded operations:

```yaml
expansions:
  - expansion_id:
    operation: add | refine | defer | reject
    target_surface_refs: []
    target_dimension_refs: []
    target_seed_or_ontology_refs: []
    purpose_element_refs: []
    answer_claim_refs: []
    evidence_refs: []
    concept_economy_effect: reduces_surface | preserves_surface | increases_surface
    rationale:
    limitation_refs: []
```

Expansion must prefer reuse or refinement before adding a new concept. A new
concept is allowed only when it changes identity, lifecycle, validation,
authority, user-visible action, failure handling, or material decision behavior.

`ontology-expansion-validation.yaml` must enforce:

- every `answer_claim_refs[]` item resolves to a valid answer claim;
- every `evidence_refs[]` item resolves through the validated evidence ledger or
  prior seed/source observation authority;
- `operation: add` with `concept_economy_effect: increases_surface` includes a
  rationale that explains why reuse/refinement is insufficient;
- `operation: defer` or `reject` carries limitation refs or answered question
  refs;
- no expansion rewrites seed authority in place. The expansion is an overlay
  until the final `actionable-ontology.yaml` projection is validated.

Implementable `actionable-ontology.yaml` projection shape:

```yaml
schema_version: "1"
session_id:
created_at:
source_seed_ref: ontology-seed.yaml
applied_expansion_refs: []
declared_purpose:
actionability_claim: actionable_ready | actionable_limited
claim_scope:
  included_matrix_row_refs: []
  excluded_matrix_row_refs: []
  limitation_refs: []
ontology:
  structure: []
  relations: []
  intent: []
  principles: []
  context: []
  evidence: []
  external: []
action_surfaces:
  static_surface:
    status:
    supporting_refs: []
    limitation_refs: []
  kinetic_surface:
    status:
    supporting_refs: []
    limitation_refs: []
  dynamic_surface:
    status:
    supporting_refs: []
    limitation_refs: []
remaining_frontier_refs: []
limitation_refs: []
ontology_handoff_refs: []
query_proof_refs: []
visualization_proof_refs: []
graph_exploration_proof_refs: []
```

This projection is user-facing and downstream-facing. Its validation must prove
that every included ontology row traces back to the seed, a validated expansion,
or an explicit limitation. It must not become a new uncontrolled semantic source.
When ontology-domain completeness, external alignment, executable queryability,
visualization, or graph exploration is claimed, validation must resolve those
claims through the registry-owned handoff axes and the proof authority contracts
defined in `operational-ontology-seed-contract.md`.

#### Actionability Matrix

`actionability-matrix.yaml` is the runtime projection that tells whether
maturation is converging:

```yaml
rows:
  - matrix_row_id:
    baseline_row_refs: []
    purpose_element_ref:
    actionability_surface_ref:
    maturity_dimension_ref:
    materiality: blocker | high | medium | low | info
    materiality_ref:
    member_scope_refs: []
    member_target_material_kind:
    member_readiness: closed | limitation_backed | frontier_required | out_of_scope
    member_source_refs: []
    cross_material_ref_refs: []
    competency_question_refs: []
    competency_assessment_refs: []
    maturity_level: L0_missing | L1_identified | L2_modeled | L3_evidenced | L4_validated_for_purpose
    supporting_refs: []
    blocking_question_refs: []
    limitation_refs: []
    next_action:
```

`ActionableOntology` may be claimed only when every material row is L4 or
explicitly limitation-backed without making an actionability claim for that
limited area.

Runtime computes maturity levels with these minimum rules:

| Level | Minimum runtime evidence |
|---|---|
| `L0_missing` | no candidate, seed ref, evidence ref, answer claim, or limitation closes the row |
| `L1_identified` | candidate or frontier question exists, but no stable seed/ontology ref models the row |
| `L2_modeled` | seed or expansion ref models the row and refs close |
| `L3_evidenced` | modeled row has direct authority, answer support evidence, runtime proof, or user confirmation |
| `L4_validated_for_purpose` | required competency question, query/proof, or validation artifact proves the row is trustworthy for the declared purpose without implying operational runtime proof unless a runtime proof ref is present |

Rows with `materiality: blocker` or `high` cannot be ignored. They must become
`L4_validated_for_purpose`, limitation-backed outside the claim, or a
continuation state of `continue`, `ask_user`, or `blocked`.

`actionability-matrix-validation.yaml` must prove:

- every matrix row derives from a validated baseline row, a validated answer
  claim, a validated ontology expansion, or an explicit limitation;
- every matrix row has a stable `matrix_row_id` and closes
  `baseline_row_refs[]` against `maturation-baseline-validation.yaml`;
- every row preserves baseline materiality or derives materiality from blocking
  question refs, and every blocker/high row remains visible to continuation
  decision validation;
- every mixed-material row preserves member readiness, member material kind,
  member source refs, and cross-material refs or an explicit limitation-backed
  exclusion;
- every `maturity_level` is consistent with supporting refs, blocking questions,
  and limitation refs;
- blocker/high rows cannot be projected as action-ready unless they are
  `L4_validated_for_purpose` or limitation-backed outside the actionability
  claim;
- recomputation inputs are recorded so continuation decisions can be audited.

#### Maturation Continuation And Handoff States

Maturation should project one of these states:

| State | Meaning |
|---|---|
| `continue` | at least one material frontier question can be advanced by source evidence |
| `ask_user` | user decision or confirmation is the next required authority |
| `blocked` | required source, runtime capability, or external authority is unavailable |
| `actionable_limited` | material actionability is sufficient for a bounded purpose with named limitations |
| `actionable_ready` | static, kinetic, and dynamic surfaces are validated for the declared purpose; operational runtime proof is required only for rows that claim runtime/query/API behavior |

The runtime presents the state, evidence, limitations, and remaining frontier in
a form that lets the user choose the next action.

Implementable `maturation-continuation-decision.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
actionability_matrix_validation_ref: actionability-matrix-validation.yaml
decision_state: continue | ask_user | blocked | actionable_limited | actionable_ready
state_rationale:
blocking_row_refs: []
next_frontier_refs: []
authority_request_refs: []
authority_response_refs: []
claim_scope:
  included_row_refs: []
  excluded_row_refs: []
  exclusion_rationale:
limitation_refs: []
```

For `actionable_limited`, `claim_scope.included_row_refs[]` names the rows the
ontology may support, and `claim_scope.excluded_row_refs[]` names the rows that
remain outside the trusted claim. `actionable_ready` may not exclude blocker or
high material rows. Required domain competency failures must remain in
`blocking_row_refs[]`, `next_frontier_refs[]`, or `limitation_refs[]` until a
validated answer, authority response, or limitation-backed exclusion closes
them.

## 6. Source-Derived Purpose Strategy

The user's reconstruct intent explains why the run exists. It must not become
the target's purpose or adequacy frame. The target purpose must be derived from
source material.

Purpose discovery produces two semantic claims:

| Claim | Meaning |
|---|---|
| `source_derived_purpose` | what the target appears built to accomplish for its users or operators |
| `purpose_adequacy_frame` | what must be represented, for this material kind, to say the target purpose is adequately captured |

Purpose discovery must not cause a second full source scan. The runtime first
performs material-aware observation into `source-observations.yaml`; purpose
discovery and seed authoring are separate projections over that shared evidence
store. If user confirmation revises the inferred purpose, runtime checks whether
the existing observations already cover the revised purpose. Only missing
evidence becomes a targeted frontier. The run must not re-read the whole target
only because purpose confirmation occurred.

The `PurposeAdequacyFrame` is material-kind-specific. For code repositories it
may include product surface, actors, actions, state, permissions, data bindings,
and observable behavior. For spreadsheets it may include workbook purpose,
input ranges, formulas, output cells, assumptions, source data, and decision
cells. For documents it may include audience, thesis, claims, evidence, required
actions, decisions, and open questions. For meeting records it may include
meeting subject, participants, decisions, action items, owners, dates,
rationale, and unresolved topics. For databases it may include central tables,
relationships, constraints, query/report outputs, update boundaries, and
provenance.

Purpose evidence has a priority order:

| Priority | Evidence kind | Examples |
|---|---|---|
| P1 explicit target statement | direct source statement of product/service/workbook/document purpose | README summary, product title, introduction, manifest description, top-level documentation |
| P2 primary surface or record center | the source area that carries the target's main user/operator/reader meaning | first screen, dashboard route, default command, primary sheet, executive summary, decision table, meeting action-item section |
| P3 observable purpose support | concrete source evidence that the purpose is supported, executed, calculated, decided, or recorded | E2E test, quickstart, sample request, fixture workflow, formula output, decision log row, action item with owner |
| P4 domain model center | central objects/actions/records/data that other parts organize around | main entities, route/controller clusters, workbook input-output graph, core tables/views, recurring meeting sections |
| P5 naming and metadata signal | weaker hints from names, tags, package metadata, headings, or folder layout | package description, file names, sheet names, route names |

The source-derived purpose may be accepted from one P1 authority if the evidence
is direct and target-scoped. Otherwise, the purpose needs convergent evidence
from at least two different evidence kinds. P5 evidence cannot establish purpose
by itself.

When P1 evidence is absent, purpose discovery uses an evidence-weighted
inference ledger rather than a single narrative guess:

1. Collect purpose-bearing signals from observed source records.
2. Generate purpose candidates in outcome language: "enables
   [audience/stakeholder] to accomplish or understand [outcome/decision/obligation]
   using [source evidence]."
3. Map each candidate to a tentative `PurposeAdequacyFrame` selected by
   `TargetMaterialKind`.
4. Score candidates by evidence-kind diversity, material-kind adequacy coverage,
   source centrality, observable support, domain-model or record-model
   centrality, data/record alignment, terminology consistency, and contradiction
   count.
5. Select `primary` only when the candidate has convergent support and no
   unresolved contradiction that would change the purpose or adequacy frame.
6. Record weaker candidates as `secondary`, `candidate`, or `rejected`.

`convergent_inferred` requires support from at least two independent evidence
kinds, and at least one supporting kind must be P2, P3, or P4. P5 naming and
metadata may strengthen a candidate but must not be the strongest evidence.

When the selected purpose is inferred rather than directly source-declared, the
run must present the inferred purpose and `PurposeAdequacyFrame` to the user
before the seed can be treated as ready for maturation. The confirmation prompt
should show:

- the proposed source-derived purpose in outcome language
- the selected material-kind adequacy frame and required facets
- the top supporting source refs and evidence kinds
- competing secondary or candidate purposes, if any
- known contradictions or limitations

User response can have four outcomes:

| Outcome | Effect |
|---|---|
| `confirmed` | the inferred purpose may become `purpose.declared_purpose_projection.statement` |
| `revised` | the user-provided revision becomes a new purpose candidate; it is `revised_pending_evidence_check` until source evidence check passes, then `revised_confirmed` |
| `rejected` | the candidate cannot become the seed purpose; the run must choose another supported candidate or record purpose unresolved |
| `not_available` | the run is blocked for seed readiness if confirmation is required |

The user confirmation does not override source evidence. It confirms whether the
inferred purpose is the intended target for this reconstruct run. If the user
revision contradicts source material, the run records the contradiction and
opens a frontier rather than silently rewriting the source-derived purpose.

If P1 evidence conflicts with primary surface, record center, observable support,
or domain-model evidence, the run must not blindly prefer the prose. It records
the conflict and either ranks the candidate with a limitation or opens a
frontier to inspect the conflicting source area.

When multiple purposes compete, `source-purpose-candidates.yaml` must rank them:

- `primary` — best-supported purpose and adequacy frame for this target
- `secondary` — supported but not first-priority for seeding
- `candidate` — plausible but insufficiently supported
- `rejected` — considered and rejected with rationale

If no source-derived purpose reaches P1 authority or convergent support, the
seed must not invent a purpose or adequacy frame. It records a purpose
limitation and the next source frontier needed to resolve it.

Purpose discovery must avoid these mistakes:

- treating the user's reconstruct intent as the target purpose
- treating implementation mechanism as service purpose
- forcing every target into a flow model when the material kind is record,
  document, spreadsheet, database, or mixed material
- picking the most technically complex area instead of the purpose-critical
  surface, record, calculation, decision, or data model
- promoting a secondary admin, setup, export, or diagnostic concern over the
  target's main purpose without evidence
- hiding competing purpose candidates instead of ranking them

## 7. Exploration Strategy

Exploration should look for missing seed layers and maturation frontier, not
just missing orientation concepts.

The next source frontier should prefer source refs that may change:

- object identity or object boundaries
- actor roles and principals
- available actions
- workflow or state transition understanding
- permission or policy treatment
- data source, read model, write target, or provenance treatment
- competency-question answerability
- seed-iteration limitation severity and maturation-frontier priority
- source-derived purpose and purpose adequacy frame ranking

The frontier should not request more source only to add detail that cannot
change seed validity for the declared purpose.

Each repeated observation must be traceable. Runtime records an
`observation_batch_id`, `round_id`, `frontier_kind`, `frontier_validation_ref`,
and `triggering_frontier_ref` on new observation records, and writes the
canonical round-scoped `rounds/<round-id>/source-observation-delta.yaml`
artifact before new evidence can enter the next directive, lens judgment,
synthesis, maturation answer, ontology expansion, or candidate finalization
step. `frontier_kind` is `source_frontier` for seeding exploration and
`maturation_closure_frontier` for maturation exploration; the process does not
introduce a second maturation-only delta artifact.

The delta artifact is lineage evidence, not gate truth. Runtime must also write
`rounds/<round-id>/source-observation-delta-validation.yaml` to prove the
pre-use lineage check passed or failed. Frontier validation authorizes what may
be observed; delta validation proves what was actually observed and how it is
tied to the round/frontier before downstream semantic use.

`source_frontier_gate` must validate duplicate status against current
`source-observations.yaml`, not only against the source inventory. The
`observation_reentry_gate` is the only gate that validates downstream re-entry
from declared authority refs: lens judgments, exploration synthesis,
candidate inventory/disposition, seed validation artifacts, and maturation
downstream artifacts such as `answer-support-ledger.yaml`,
`maturation-answer-claims.yaml`, and `ontology-expansion.yaml` when those
artifacts can cite frontier-triggered observation ids. The validator must
consume the same downstream artifact authorities, or their validation artifacts,
that make the relevant generated
`frontier_observation_use_by_downstream_artifact` predicate instance true. The
aggregate `frontier_observation_used_downstream` predicate is derived from those
generated instances and must not maintain a separate artifact list.

Round-scoped artifacts are append-only. A later round may supersede a prior
question, evidence cluster, answer claim, or expansion only by writing a new row
with explicit prior refs; it must not mutate prior round authority in place.
Readers must resolve historical runs through the registry, active contract,
source profile, validator, reference-standard, and migration snapshots recorded
in `reconstruct-run-manifest.yaml` and `reconstruct-record.yaml`. If a required
snapshot cannot be resolved or migrated, runtime must project `blocked` before
semantic reuse.

## 8. Candidate Strategy

The candidate inventory is the bridge between source evidence and seed layers.
Root candidate kinds are owned by
`reconstruct-contract-registry.yaml#candidate_kind_registry`; this design does
not carry an independent candidate-kind enum.

Every high-salience candidate must appear in `candidate-disposition.yaml`.
Disposition is what prevents the seed from losing terms such as user, account,
admin, approval, dashboard, cost, export, permission, or invoice simply because
they do not fit the conceptual frame.

`candidate-inventory.yaml` is the candidate-set authority.
`candidate-disposition.yaml` is the candidate-disposition authority.
`ontology-seed.yaml` may reference those authorities, but it must not restate a
second authoritative disposition ledger.

For `promoted_to_seed_layer`, `target_seed_refs[]` names planned canonical seed
refs that the later `ontology-seed.yaml` must realize. The disposition artifact
therefore does not prove the seed already exists; it declares the placement
commitment that seed validation must close.

## 9. Seed Validity Strategy

Process completion means the run reached an end state and wrote records.

Seed validity means the authored seed and downstream validation artifacts pass
the gates needed for the next `Ontology Maturation` iteration.

Seed qualitative completion means the seed is the first valid kernel of an
actionable ontology. The seed is not expected to be action-ready, but it must
preserve enough operational structure for maturation to continue without
rediscovering the model from zero.

A seed satisfies first-kernel quality only when all conditions below hold:

| Condition | Seed requirement |
|---|---|
| Purpose boundary | Source-derived purpose, purpose adequacy frame, intended decisions/actions/records, non-goals, and risk boundary are explicit |
| Inferred purpose confirmation | If purpose is inferred rather than directly source-declared, user confirmation is recorded as confirmed or revised-and-evidence-checked |
| Material primitives | Material objects, actors, decisions, actions, records, states, policies, obligations, and data bindings are present or limitation-backed as required by the material kind |
| Purpose adequacy frame | Every required frame element has a seed ref, evidence ref, or limitation-backed frontier |
| Salience preservation | Every high-salience candidate has exactly one disposition and promoted candidates are realized in seed refs |
| Evidence stance | Claims distinguish observed runtime behavior, schema/contract presence, test/fixture evidence, declared design intent, deferred scope, and unknowns |
| Limitation honesty | Missing purpose-critical actors, records, decisions, actions, objects, policies, data, or evidence links are recorded as maturation limitations, not silently omitted |
| Frontier usefulness | Unanswered questions are mapped to seed refs, seven dimensions, and plausible next evidence targets |
| Validation closure | Required seed, candidate, confirmation, competency-question, assessment, and readiness gates pass or project an explicit limitation state |

If a seed lacks source-derived purpose authority, or lacks a purpose-critical
frame element or limitation-backed frontier for the target material kind, it is
not a valid first kernel even when its schema is valid.

Validation is lifecycle-scoped. A seed-shape validation artifact may not claim
final seed validity before seed confirmation, competency-question, assessment,
and seed-iteration readiness validation artifacts exist.

The complete gate and validation-artifact catalog is registry-owned at
`reconstruct-contract-registry.yaml#validation_gate_catalog`,
`#validator_records`, and `#readiness_projection.handoff_validation_policy`.
This design document names gate families only: material profile, source evidence
and frontier lineage, candidate disposition, seed layer and connectivity,
competency questions and assessment, seed confirmation, conditional query,
visualization and graph-exploration proofs, failure/revision handling, run
manifest validation, and terminal seed-iteration readiness validation.

Any planned artifact family becomes executable only as a complete registry set:
artifact authority, validation authority, validation gate, validator record,
`required_when` predicate, and activation condition must be promoted together.
Design prose may describe future artifacts, but runtime readiness may consume
only registry-backed validation results. A planned gate without a predicate or
validator is a contract defect, not an optional implementation detail.

Maturation activation is ordered. A planned maturation gate may be promoted only
after its upstream gates and validators are implemented:

| Gate family | Minimum activation prerequisite |
|---|---|
| baseline | source-purpose candidate authority and seed validation authorities |
| actionability matrix | baseline validation |
| question frontier | baseline validation |
| closure frontier | question-frontier validation |
| answer support | question-frontier validation and any applicable authority/proof validation |
| authority response | closure-frontier authority request validation |
| answer claims | answer-support validation |
| ontology expansion | answer-claim validation |
| continuation decision | actionability-matrix validation plus any applicable frontier/support/authority validation |
| actionable ontology | continuation-decision validation plus any applicable expansion/proof validation |

In registry activation terms, the continuation decision gate preserves this
predecessor explicitly: `maturation_continuation_decision_gate` requires
`actionability_matrix_runtime_is_implemented` before promotion. Its validator
then consumes `actionability-matrix-validation.yaml` as the evidence that the
matrix itself is valid for the concrete maturation state.

Registry activation prerequisites may include runtime capability predicates and
validation-state predicates. Runtime capability predicates prove that a writer,
validator, and predicate evaluator exist. Validation-state predicates prove that
the concrete upstream artifact for the current run is valid. Promotion readiness
must evaluate both classes; an unknown, missing, or false validation-state
predicate blocks promotion even when runtime capability exists.

Promotion readiness is itself a runtime authority. Before a planned maturation
gate is activated or a maturation execution is requested, runtime writes and
validates:

```yaml
maturation-promotion-request.yaml:
  request_id:
  request_kind: maturation_execution | gate_promotion | combined
  request_status: requested | accepted | rejected | superseded
  requested_at:
  requested_by: user | runtime | external_host
  trigger_ref:
  source_session_root:
  source_reconstruct_record_ref:
  source_run_manifest_ref:
  source_handoff_decision_validation_ref:
  requested_gate_ids: []
  minimum_required_output_gate_ids:
    - maturation_baseline_gate
    - actionability_matrix_gate
    - maturation_question_frontier_gate
  minimum_required_output_refs:
    - maturation-baseline.yaml
    - actionability-matrix.yaml
    - maturation-question-frontier.yaml
  request_rationale:
  supersedes_request_ref:
  limitation_refs: []

maturation-runtime-capability-profile.yaml:
  gate_capabilities:
    - gate_id:
      activation_condition:
      runtime_flag_observed: true | false
      artifact_writer_supported: true | false
      validator_supported: true | false
      required_when_predicate_supported: true | false
      validator_id:
      validator_version:
      missing_capability_refs: []

maturation-promotion-readiness.yaml:
  requested_gate_promotions:
    - gate_id:
      requested_activation_condition:
      upstream_validation_refs: []
      source_purpose_authority_required: true | false
      purpose_confirmation_required: true | false
      promotion_decision: promotable | blocked | deferred
      missing_authority_refs: []
      limitation_refs: []
```

`maturation-promotion-request-validation.yaml` must prove that the request is a
durable artifact, requested gates exist in the registry, `trigger_ref` resolves
to a user/runtime/external-host authority or prior run artifact, and no
runtime-local boolean is used as replay authority. For `request_kind:
maturation_execution` or `combined`, validation must also require the minimum
executable maturation outputs: `maturation-baseline.yaml`,
`actionability-matrix.yaml`, and `maturation-question-frontier.yaml`. If runtime
cannot produce one of those outputs, the request must project `blocked` or enter
failure/revision classification with explicit limitation refs.
`source_handoff_decision_validation_ref` must point to the prior/source seed
session handoff authority consumed by maturation. It must not point to the
current terminal handoff artifact being computed for the maturation execution
itself.

`maturation-promotion-readiness-validation.yaml` must prove that every requested
promotion has runtime-observed capability, a matching artifact writer, validator,
`required_when` predicate evaluator support, and concrete upstream validation
artifacts whose validation-state predicates are true for the current run.
Runtime capability flags are capability evidence only; they are not ordering
authority for concrete promotion. Baseline promotion additionally consumes the
source-purpose candidate authority when required and purpose-confirmation
validation when the selected purpose is inferred or limitation-backed.

Accepted maturation execution has a minimum output contract. The registry
predicates `maturation_baseline_required`, `actionability_matrix_required`, and
`maturation_question_frontier_required` become true when a validated
`maturation-promotion-request.yaml` has `request_kind: maturation_execution` or
`combined`. Missing validation artifacts for those outputs are therefore
required-gate failures, not `not_applicable` planned paths.

Once a planned gate is activated, its missing or failed validation artifact is
classified through the same failure/revision path as active seeding gates.
Failure classification must consume the failed gate validation artifact or the
recorded missing-gate projection; revision proposal then scopes the repair to
that gate's authority inputs. Planned maturation failures must not disappear just
because the current terminal seed-readiness path can still finish.

`seed_confirmation_gate` is lifecycle-required whenever seed validity or seed
iteration readiness is projected. If `seed-confirmation.yaml` or
`seed-confirmation-validation.yaml` is absent at that lifecycle point, runtime
must project `blocked`. A limitation state is allowed only when both
`seed-confirmation.yaml` and `seed-confirmation-validation.yaml` exist and the
validation artifact proves the limitation state against the validated seed and
derives CQ eligibility. Assessment-aware seed iteration readiness is evaluated by
`handoff-decision-validation.yaml`.
`handoff-decision-validation.yaml` must validate against the validation-result
authorities that contribute to readiness, including
`reconstruct-run-manifest.pre-handoff-validation.yaml`; it may not rely only on raw authored
artifacts, unvalidated run manifests, or record projections.
The set of contributing validation artifacts is condition-aware. Runtime derives
applicability from each gate's `required_when`: missing required-and-applicable
validation artifacts project `blocked`, while unmet conditional paths project
`not_applicable` and do not block a clean run.
Terminal readiness evaluates active gates and promoted/requested planned gates
from the registry. Accepted maturation execution admits the baseline,
actionability matrix, and question-frontier gates into terminal gate projection
through their `*_required` predicates even when the corresponding artifact is
absent, so absence becomes `blocked` rather than invisible.
`handoff-decision-validation.yaml` must consume the applicable promoted/requested
planned-gate validation artifacts or their missing-gate projection, including
promotion request, runtime capability, promotion readiness, baseline,
actionability matrix, and question-frontier validations for accepted maturation
execution. Failure classification must cover those same missing or failed planned
gates before terminal output claims readiness.
The authoritative set of applicable planned-gate validation refs is derived from
`validation_gate_catalog` and `planned_validation_gate_catalog` by evaluating
their `required_when` predicates. Hand-maintained consumer lists in validators
are cache hints and must not be treated as the authority for terminal readiness
or failure classification.
Each `required_when` predicate is evaluated from the registry-owned predicate
catalog, which names input artifact refs, field-level truth expressions, unknown
projection, and the explanation template for status/result surfaces.
The `required-when-evaluation-validator` must resolve every concrete `gate_id`
against exactly one row from `validation_gate_catalog` or
`planned_validation_gate_catalog`, record the source catalog for the evaluated
gate instance, and fail closed on unknown or duplicate active/planned gate ids.
When multiple predicate rows share the same concept, the registry must model them
as generated instances of a predicate family. Frontier-observation downstream-use
predicates are generated instances of
`frontier_observation_use_by_downstream_artifact`, not separate ontology
concepts.
If an active gate names a predicate expression that the runtime evaluator does
not support, runtime treats that gate as unknown and fails the handoff closed
until the evaluator is implemented. Unsupported active predicates must not
silently project `not_applicable`.
Terminal `handoff-decision-validation.yaml` is produced by `handoff_gate`.
`final-output.md` and `reconstruct-record.yaml` are emitted only after
`handoff-decision-validation.yaml` passes; they are projections from the
validated seed iteration readiness result, not inputs to the terminal readiness
validator.
`final-output-provenance-validation.yaml` validates the post-handoff user-facing
projection. It is not a readiness gate for `handoff-decision-validation.yaml`.

The canonical seed iteration readiness projection must distinguish:

- ready for the next maturation iteration
- usable for maturation with named limitations
- not ready because required seed validity gates failed or the frontier is not actionable
- blocked because source or user confirmation is missing

Artifact-specific readiness fields may use local names, but status/result APIs
and final output must project one canonical readiness value:
`ready`, `limited`, `not_ready`, or `blocked`.

The same projection must expose the reason, not just the folded readiness value.
`handoff-decision-validation.yaml.gate_projection[]` is the authority for
status/result/final-output gate reporting. Each projected gate row must include
the concrete gate instance, `gate_id`, `source_catalog_id`,
`validation_artifact_ref`, `required_when` predicate, activation condition,
activation status, applicability, validation status, readiness effect,
limitation refs, and explanation. Unknown or duplicate active/planned gate ids,
hidden applicable gates, and missing applicable validation artifacts project
`blocked`.

For `mixed` targets, status/result/final-output surfaces must also expose the
member lineage that grounds modeled mixed-purpose elements and the member
lineage that caused any non-ready aggregate readiness:
`member_id`, `target_ref`, material kind, selected profile id, selected profile
snapshot ref, definition hash, support state, runtime implementation status,
source refs, cross-material refs, purpose element refs, validation ref,
limitation refs, aggregate readiness effect, and next action. A user or caller
must not need to re-resolve `target-material-profile.yaml` or candidate
artifacts to know which member grounds a seed element, which member blocked the
seed, which profile was selected, or what next action is required.

The registry predicate catalog should contain only executable predicates,
predicate-family instances that have current consumers, or explicitly reserved
predicates with a named future consumer. Unused executable-looking predicate
rows are removed rather than kept as compatibility aliases.

## 10. Maturation Convergence Strategy

`Ontology Maturation` converges when the ontology can support the declared
decision or action purpose without material unresolved questions. Convergence
does not mean the ontology is globally complete. It means the remaining gaps are
outside the source-derived purpose, explicitly deferred, or non-material to the
source-derived `PurposeAdequacyFrame`.

Maturation operates over a kernel completeness matrix:

| Level | Meaning |
|---|---|
| L0 missing | The element or dimension is absent |
| L1 identified | A candidate is named, but not yet structurally placed |
| L2 modeled | The element has a stable ref, type, relation, and declared role |
| L3 evidenced | Material claims are backed by convergent evidence or explicit authority |
| L4 validated for purpose | The purpose adequacy frame can answer the declared competency questions through positive validation or proof; operational proof is required only for rows that claim runtime/query/API behavior, and residual limitations are tracked outside the actionability claim |

Seed output should reach at least L2 for material purpose adequacy primitives,
with L1/L2 limitation-backed frontier for incomplete dimensions. Maturation
should reach L4 for every required purpose adequacy frame element and at least
L3 for supporting elements that affect interpretation, governance, or evidence
trust.

The kernel completeness matrix is evaluated separately for `static_surface`,
`kinetic_surface`, and `dynamic_surface`. A seed may be valid for maturation
with a limitation-backed `dynamic_surface`, but an `ActionableOntology` may not
claim actionability while any material static, kinetic, or dynamic surface is
absent, unsupported, or only named without evidence.

Maturation may claim the output is an `ActionableOntology` only when all
convergence conditions hold:

| Condition | Maturation requirement |
|---|---|
| Source-purpose coverage | Every required purpose adequacy frame element derived from source purpose is modeled, evidenced, or limitation-backed |
| Competency answerability | Required competency questions for the declared purpose are answerable from ontology refs, evidence refs, or validated query/proof artifacts |
| Material gap closure | No blocker or high-severity unresolved question remains for the source-derived purpose adequacy frame |
| Evidence convergence | Each material answer is supported by sufficient convergent evidence, or is explicitly marked as authority-provided or externally blocked |
| Runtime/query proof | Claimed query, graph, visualization, API, or implementation access paths are validated when they are part of the declared downstream use |
| Policy and permission closure | Sensitive actions and sensitive data have actor, role, permission, and exception treatment or an explicit non-actionable limitation |
| Data authority closure | Read sources, write targets, provenance, derived projections, and source gaps are distinguishable and closed for the declared purpose |
| External boundary closure | External systems, standards, integrations, and alignment requirements are either modeled, limitation-backed, or declared out of scope |
| Frontier exhaustion by materiality | Remaining frontier questions are non-material, explicitly deferred, or cannot be advanced without new source/user authority |
| Static/kinetic/dynamic actionability | Static structure, kinetic behavior, and dynamic condition boundaries are each answerable from ontology refs and evidence refs, or limitation-backed without claiming actionability |

Maturation should continue when a frontier question can still change any
material purpose adequacy element, including object boundary, actor authority,
record completeness, decision/action availability, permission, state transition,
data binding, evidence trust, or external dependency. Maturation should not
continue merely to add explanatory detail that cannot change the declared
decision/action/record outcome.

## 11. Artifact Plan

The complete target artifact list is registry-owned at
`reconstruct-contract-registry.yaml#artifact_authorities`. This plan groups the
artifact families as preparation/observation, round exploration,
candidate/disposition, seed/validation, competency questions and assessment,
confirmation, conditional proof authorities, failure/revision, metrics,
handoff, final output, run manifest, and reconstruct record.

`ontology-seed.yaml` is the seed semantic authority.
`candidate-disposition.yaml` is the disposition authority.
`claim-realization-map.yaml` is the per-seed-claim realization stance authority
registered in `reconstruct-contract-registry.yaml`; it records exactly one
realization row per seed claim and closes realization evidence refs against
`source-observations.yaml`. It is not a legacy compatibility projection.
`competency-questions.yaml` is the question authority.
`competency-question-assessment.yaml` is the answerability-result authority.
`reconstruct-contract-registry.yaml` is the active runtime authority graph.
`reconstruct-record.yaml` is the run authority and artifact index; it contains
refs, hashes, validation statuses, and bounded projections only.

## 12. Runtime Validation Plan

Runtime validation should be deterministic and fail loud.

Validation responsibilities:

- schema parse and required field checks
- allowed enum checks
- id uniqueness
- cross-reference closure
- evidence-ref closure
- material-kind/source-ref alignment
- pre-use round lineage, frontier-to-observation closure, and post-use
  observation re-entry closure
- seed layer closure
- source-derived purpose and purpose adequacy evidence closure
- inferred-purpose user confirmation closure
- candidate disposition completeness
- action actor/object binding
- permission coverage or declared limitation
- data binding coverage or declared limitation
- ontology-facing mapping or limitation coverage
- competency-question coverage and assessment trace
- failure classification and revision proposal bounds
- stop-decision and handoff-validation consistency
- registry-selected artifact, gate, profile, lens judgment, and readiness
  projection consistency
- lifecycle-required seed confirmation and seed-iteration validation-result authority
  closure
- final-output provenance footer

Runtime may calculate metrics from artifacts, but metrics are not semantic truth.

## 13. Prompt Plan

Prompt packets should give the host LLM:

- reconstruct intent, target refs, and source-derived purpose evidence
- material profile
- compact source observations
- full artifact ref locations
- active seed contract
- required output schema for the current stage
- validation failure from the previous attempt, when retrying
- selected registry snapshot, source profile ids, and reconstruct lens ids
- validator ids, validator versions, and prior validation failure artifacts when
  retrying

Prompt packets must not include development history. If the model needs to know
why a previous attempt failed, it should receive the validation artifact, not
archived design discussion.

## 14. Result UX Plan

The beginning of a run should state:

- target refs
- material kind and profile
- execution profile and provider route, without secrets
- reconstruct intent, discovered source purpose, purpose adequacy frame, and review direction
- expected artifact path

Progress updates should be stepwise:

```text
[1/8] Source classified
[2/8] Source evidence observed
[3/8] Semantic judgments running
[4/8] Candidate disposition built
[5/8] Seed authored
[6/8] Seed-shape validation running
[7/8] Questions, assessment, and seed-readiness validation running
[8/8] Final output and record written
```

Updates should include new information learned from artifacts, not only process
metadata. Example:

- newly identified object candidates
- unresolved actor or permission gaps
- actions found without writeback evidence
- source areas that changed the frontier
- validation gates that passed or failed

No separate HTML UI is required. CLI/MCP hosts should receive progress through
LLM-presentable status text, status polling, and native progress notifications
where supported.

## 15. Implementation Sequence

Use this sequence as the coding roadmap. Each stage must leave the runtime in a
verifiable state; do not start a later stage by stubbing semantic artifacts just
to make the process look complete.

Implementation file map:

| Concern | Primary files |
|---|---|
| artifact/type seats | `src/core-runtime/reconstruct/artifact-types.ts` |
| registry/gate authority | `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`, `src/core-runtime/reconstruct/contract-registry.ts` |
| seeding runtime sequence and prompts | `src/core-runtime/reconstruct/run.ts` |
| source-purpose candidate validation | `src/core-runtime/reconstruct/purpose-authority-validation.ts` plus tests |
| purpose confirmation validation | `src/core-runtime/reconstruct/purpose-authority-validation.ts` plus tests |
| maturation M1-M4 projection validation | `src/core-runtime/reconstruct/maturation-validation.ts` plus tests |
| candidate surface/facet validation | existing candidate-disposition validation path and tests |
| seed surface closure validation | `src/core-runtime/reconstruct/ontology-seed-validation.ts` and tests |
| post-seed readiness and terminal projection | `src/core-runtime/reconstruct/post-seed-validation.ts`, `src/core-runtime/reconstruct/terminal-validation.ts`, `src/core-runtime/reconstruct/record.ts` |
| MCP/API projection | `src/core-api/reconstruct-api.ts`, `src/mcp/server.ts` |
| active docs and user-facing guide | this document, `operational-ontology-seed-contract.md`, `README.md`, `IMPLEMENTATION_MAP.html` |

Current implementation has promoted seeding source-purpose authority and the
first-pass maturation surface M1-M4. Multi-round source-observation delta,
source-observation re-entry validation, proof authorities, and final
`actionable-ontology.yaml` projection remain planned until their runtime gates
and validators are real behavior.

Required test path for each implementation slice:

1. add or update a narrow fixture test for the validator or prompt output shape;
2. add an integration test around `run.ts` for the changed artifact sequence;
3. run `npx vitest run` on the changed reconstruct tests;
4. run `npm run check:ts-core`;
5. run `npm run build:ts-core`;
6. for release or merge, run one real-source reconstruct E2E and verify the first
   invalid gate fails loud or the seed/maturation artifacts pass with named
   limitations.

### Stage 0. Registry And Projection Substrate

Expected result:

- `src/core-runtime/reconstruct/contract-registry.ts` parses active and planned
  artifact authorities, validation gates, validators, activation conditions, and
  required-when predicates
- terminal validation evaluates active gates plus requested/promoted planned
  gates from the registry, not from hand-maintained consumer lists
- planned gates are inactive by default; a requested/promoted planned gate
  projects `inactive`, `requested`, `promoted`, `applicable`,
  `not_applicable`, `blocked_missing_runtime`,
  `blocked_missing_validation`, or `failed_validation`
- status/result/final-output surfaces expose gate projection rows with
  `source_catalog_id`, activation condition/status, applicability, validation
  refs/status, readiness effect, limitations, and explanation
- unknown or duplicate active/planned `gate_id` values fail closed
- `mixed` target status/result projection preserves member lineage from
  `target-material-profile-validation.yaml`, including the blocking member,
  modeled purpose element, member source refs, cross-material refs, selected
  profile, material kind, validation ref, limitation, and next action
- the required-when predicate catalog contains only predicates with current
  consumers or explicitly reserved predicates with a named future consumer

### Stage 1. Active Documentation Baseline

Expected result:

- active reconstruct docs reference only the current seed model
- active docs list the current contract set
- operation-facing docs do not load development history
- `README.md`, `AGENTS.md`, and `IMPLEMENTATION_MAP.html` point to the same
  seed target

### Stage 2. Schema And Type Seats

Expected result:

- TypeScript types exist for target artifacts and validation results
- current runtime artifact names match this design
- registry entries exist for every active artifact, validation gate, source
  profile, reconstruct lens judgment, and readiness projection
- old implementation-only shape names are removed from public status/result
  surfaces
- fixture parsers reject malformed seed layers and dangling refs

### Stage 3. Prompt Rewire

Expected result:

- author prompts request `candidate-inventory.yaml`,
  `candidate-disposition.yaml`, and `ontology-seed.yaml`
- author prompts request `source-purpose-candidates.yaml` before seed authoring
  and consume `purpose-confirmation-validation.yaml` when purpose is inferred
- author prompts derive target purpose and purpose adequacy frame from source
  evidence, not from the user's generic reconstruct intent
- seed authoring receives source-profile facet guidance and maps purpose
  adequacy required elements, candidates, and seed content to
  `static_surface`, `kinetic_surface`, and `dynamic_surface`
- prompt flow requests user confirmation before treating an inferred purpose as
  the seed purpose
- question prompts request `competency-questions.yaml` only after seed-shape
  validation succeeds or records explicit seed limitations
- prompts load only active contracts and compact source evidence
- retry prompts receive validation failures as the repair context

### Stage 4. Runtime Gates

Expected result:

- every validation gate named by the purpose discovery, seed validity, and
  maturation convergence strategies has a deterministic validator before it
  becomes active
- source-purpose candidate validation and purpose-confirmation validation are
  separate runtime gates before seed readiness can project `ready` or `limited`
- ontology seed validation checks actionability surface closure, not only
  declaration: required purpose elements must be modeled, limitation-backed, or
  frontier-backed across static, kinetic, and dynamic surfaces
- inferred-purpose confirmation is represented as a blocking gate when no direct
  source-declared purpose exists
- validation phases are split into seed-shape, question coverage, question
  assessment, confirmation, and seed iteration readiness validation
- active source-frontier validation records dependency proof on
  `target-material-profile-validation.yaml`; source-observation deltas,
  admission lineage, and post-use re-entry validation remain planned gates until
  their validators are promoted in the registry
- target material profile facts and material profile gate status are separated
  into `target-material-profile.yaml` and `target-material-profile-validation.yaml`
- source frontier validation is represented by `source_frontier_gate`
- seed confirmation validation is represented by `seed_confirmation_gate`
- seed confirmation is required before seed validity or seed iteration readiness is
  projected; missing confirmation projects `blocked` unless a valid limitation
  state is recorded
- seed-confirmation and seed-readiness validators consume validation-result authorities,
  not only raw authored artifacts or reconstruct-record projections
- seed-readiness validation applies each validation artifact through the registry's
  `required_when` conditions so inactive source-frontier, failure, or revision
  paths project `not_applicable` instead of `blocked`
- ontology seed validation may validate expected competency coverage axes, but
  it must not require downstream competency-question ids before
  `competency-questions.yaml` is authored
- source-frontier validation owns duplicate/inventory/upstream material-profile
  checks; planned round-lineage and observation-reentry validators own pre-use
  lineage and downstream re-entry checks after promotion
- failure classification and revision proposal validators run when required
  applicable validation artifacts are missing, gates fail, or halt conditions
  occur
- failure classification validation consumes failed-gate validation artifacts or
  runtime halt evidence, and revision proposal validation consumes
  `failure-classification-validation.yaml`
- failed gates write structured validation artifacts
- no gate repairs missing semantic content
- status/result APIs expose failed gates and seed-iteration limitations

### Stage 5. Final Output And Record

Expected result:

- final output presents purpose, seed layers, maturity frontier, trust limits,
  next iteration target, and artifact refs
- `reconstruct-record.yaml` indexes every artifact and validation result
- `handoff-decision-validation.yaml` proves the stop decision and runtime
  readiness projection agree with validation artifacts and the validated
  pre-handoff run-manifest snapshot before final output and record projections
  are emitted
- final output and status/result APIs expose one canonical seed iteration
  readiness projection
- seed validity and process completion are reported separately
- final output explains which source evidence established the purpose adequacy frame
- final output reports whether the purpose was directly source-declared or
  user-confirmed after inference

### Stage 6. Maturation Runtime Surface

Expected result:

- maturation begins from validated seed artifacts and does not rerun seeding
- `maturation-baseline.yaml` records the immutable starting matrix and
  `maturation-baseline-validation.yaml` proves its derivation
- `actionability-matrix.yaml` records the current derived projection and
  `actionability-matrix-validation.yaml` proves recomputation from validated
  baseline plus validated maturation deltas
- `maturation-question-frontier.yaml` classifies unanswered questions by
  materiality, actionability surface, maturity dimension, and purpose element
- `maturation-closure-frontier.yaml` requests only source refs or user/external
  authority that can change material answers
- `answer-support-ledger.yaml` separates direct authority, runtime proof,
  user confirmation, and convergent source evidence
- `maturation-authority-response.yaml` records user, runtime-capability,
  external-system, or domain-standard responses to closure-frontier authority
  requests; `maturation-authority-response-validation.yaml` is the intermediate
  authority that answer support and continuation logic consume
- `maturation-answer-claims.yaml` and `ontology-expansion.yaml` author bounded
  semantic changes from validated evidence only
- `actionability-matrix.yaml` records L0-L4 levels for static, kinetic, and
  dynamic surfaces across the seven dimensions, including
  `aggregate_readiness_effect` for mixed-member and aggregate rows
- `maturation-continuation-decision.yaml` projects `continue`, `ask_user`, `blocked`,
  `actionable_limited`, or `actionable_ready`
- `maturation-continuation-decision-validation.yaml` proves the projection follows the
  validated matrix and any applicable frontier/evidence authorities
- `actionable-ontology.yaml` is emitted only when final actionability validation
  passes or a bounded limited projection is explicit

### Stage 7. E2E Verification

Expected result:

- a real repository run produces `ontology-seed.yaml`
- source refs close against `source-observations.yaml`
- candidate disposition includes salient objects, actors, actions, permissions,
  and data sources
- source-derived purpose and purpose adequacy frame are ranked and evidence-backed
- inferred source purpose is user-confirmed before seed readiness projects
  `ready` or `limited`
- competency questions and assessments are authored from validated seed refs and
  close through traceable evidence
- round-scoped observation lineage links frontier-triggered observations back
  into lens judgment and synthesis
- run manifest records the registry ref/hash, active contract refs/hashes,
  source profile snapshots and migration mappings, lens ids, validator
  versions, reference authority snapshots, and pattern catalog URI/snapshot
  facts used for the run
- review over the produced seed can evaluate seed adequacy and maturation
  frontier without needing development history
- failures are visible at the first invalid gate

## 16. Completion Definition For This Recomposition

The recomposition is implemented when a fresh reconstruct run against a real
target produces:

1. material-aware source observations,
2. source-purpose candidates, purpose candidate validation, and purpose
   confirmation validation when required,
3. candidate inventory and disposition with purpose-element and actionability
   surface mapping,
4. `ontology-seed.yaml` using the active seed contract,
5. source-derived purpose and purpose adequacy evidence closure,
6. user confirmation for inferred purpose when direct source purpose is absent,
7. deterministic validation artifacts for every gate,
8. canonical candidate-disposition, competency-question, assessment, and
   handoff-validation authorities, including diagnostic or claim-based P3
   competency-question disposition when ontology domain competency admission is present,
9. active source-frontier dependency validation, plus promoted pre-use lineage
   and post-use re-entry validation when multi-round validators become active,
10. registry ref/hash plus active contract ref/hash, source profile migration,
   lens judgment, concrete gate-instance, validator, reference-standard,
   pattern-catalog URI/snapshot, and readiness-projection snapshots,
11. separate process-completion and seed-validity reporting,
12. final output that explains `OntologySeed` content, source-derived purpose,
   purpose adequacy frame, seed iteration readiness, maturation frontier, and
   limitations, and
13. a reconstruct record whose artifact refs are the source of truth.

The full maturation stage is implemented when a fresh run can continue from that
seed and produce:

1. `maturation-runtime-capability-profile.yaml`,
   `maturation-promotion-request.yaml`, `maturation-promotion-readiness.yaml`,
   and their validations when planned maturation gates are promoted or maturation
   execution is requested,
2. `maturation-baseline.yaml` and validation,
3. `actionability-matrix.yaml` and validation,
4. `maturation-question-frontier.yaml` and validation,
5. `maturation-closure-frontier.yaml` and validation when additional evidence is
   needed,
6. `answer-support-ledger.yaml` and validation,
7. `maturation-authority-response.yaml` and validation when user,
   runtime-capability, external-system, or domain-standard authority is needed,
8. `maturation-answer-claims.yaml` and validation,
9. `ontology-expansion.yaml` and validation,
10. `maturation-continuation-decision.yaml` and validation, and
11. `actionable-ontology.yaml` plus validation when readiness is
   `actionable_limited` or `actionable_ready`.
