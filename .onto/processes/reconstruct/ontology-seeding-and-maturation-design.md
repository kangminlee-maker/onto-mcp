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
- which separate competency-question artifact tests the seed
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
| `AnswerSupportLedger` | per-round support clusters that prove which questions can produce positive answer claims | host LLM authored with runtime refs, runtime validated |
| `MaturationAuthorityResponse` | user, runtime, external-system, or domain-standard answer to a closure-frontier authority request | user/runtime/external authority captured by runtime |
| `MaturationAnswerClaim` | positively supported answer to a maturation frontier question | host LLM authored, runtime validated |
| `OntologyExpansion` | validated semantic overlay that adds, refines, defers, or rejects ontology content without rewriting the seed | host LLM authored, runtime validated |
| `ActionabilityMatrix` | current runtime projection of static, kinetic, and dynamic maturity by purpose element and dimension | runtime |
| `MaturationSourceDelta` | source freshness comparison between consumed seed authority and current source authority | target design only until registry promotion |
| `RoundSourceObservationDelta` | per-round lineage record for newly observed source records from a validated frontier | active registry |
| `MaturationConvergenceLedger` | append-only closure ledger for material questions, source-delta rows, trace/audit rows, and remaining frontier | runtime |
| `MaturationContinuationDecision` | runtime continuation or terminal state derived from validated matrix and applicable frontier/support authorities | runtime |
| `ReconstructRunControl` | first durable runtime-control authority for atomically admitted session ownership, idempotency fingerprint, active-attempt lock ownership, duplicate-start diagnostics, and observed file-hash write checkpoints | runtime |
| `ClaimProjectionAuthority` | deterministic strongest-honest-claim projection consumed by status/result/API/MCP surfaces and cited as the final-output claim authority without restating pre-publication claim values | runtime |
| `MaterialAdmissionAuthority` | runtime-assembled admission authority for purpose-critical adequacy elements, with a separate phase for literal source-backed material values | runtime |
| `MaterialValueDisposition` | admission and closure decision for source-backed values that may affect actionability | host LLM authored, runtime validated |
| `DomainCompetencyAdmission` | run-manifest admission of domain competency questions into required, supporting, or diagnostic maturity coverage | runtime |
| `SourceSafetyAuthority` | validator-consumed lifecycle, authorization, privacy, redaction, proof-sufficiency, and replay state for observed source records, keyed by exact observation safety row id with derived visibility policy and conservative public/material defaults | runtime |
| `MutableVocabularyAuthority` | replayable identity, snapshot, mapping, alias, supersession, and migration state for external terms, standards, provider/framework terms, and profile-owned facets | planned until registry promotion |
| `SourceDeltaFact` | runtime-observed source freshness fact before semantic actionability interpretation | runtime |
| `SourceDeltaImpactJudgment` | source-delta impact interpretation against purpose, surfaces, and dimensions | host LLM authored, runtime validated |
| `TraceAuditOnlyClosure` | shared closure disposition for provenance/freshness/audit evidence that must not create ontology meaning by itself | shared closure concept |
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
- Profile-owned facet strings are labels, not replay identity. A run artifact that
  depends on a profile-owned facet must preserve the selected profile id,
  profile snapshot or definition hash, and the facet label used at that time.
- Before a profile-owned facet is renamed, split, merged, deprecated, or promoted,
  the profile or registry migration record must provide a stable local facet id,
  aliases, supersession mapping, migration refs, and the version or snapshot where
  the change became valid.
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
2. inferred purpose confirmation is separate from the seed and blocks readiness
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

Maturation adopts prior long-running ontology authoring practices only when they
serve the reconstruct goal: an actionable ontology whose meaning and context can
be explained from evidence. A practice is not accepted merely because it helped a
past session. It is accepted when it improves one of these properties:

- purpose-bound question generation;
- evidence-backed answer support;
- explicit non-semantic closure for findings that do not change actionability;
- artifact-level replay of why a question was answered, deferred, rejected, or
  closed as trace/audit only;
- source-delta awareness without expanding ontology meaning when the source
  change does not affect the declared purpose; or
- user-facing explanation of static, kinetic, and dynamic actionability.

The operating rule for maturation is:

```text
Do not keep adding meaning. Keep asking purpose-bound questions until every
material answer is evidence-backed, authority-backed, limitation-backed, or
explicitly outside the actionability claim.
```

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
2. Establish source authority state for the maturation round. When the source
   snapshot, document version, workbook version, database schema snapshot, or
   mixed-member source set changed since the consumed seed/run manifest,
   runtime records source-delta facts first. Semantic actionability impact is
   judged only after those facts validate.
3. Generate a `MaturationQuestionFrontier` from unanswered, partially answered,
   deferred, contradicted, or limitation-backed seed questions.
4. Classify each question by materiality, actionability surface, maturity
   dimension, purpose element, and expected answer kind.
5. Answer questions already answerable from the current ontology and evidence.
6. For unanswered material questions, author a `MaturationClosureFrontier` that
   names the next source refs or the missing user/external authority.
7. Runtime observes approved source refs and records round lineage.
8. Build a `AnswerSupportLedger` from direct authority, runtime proof,
   user confirmation, or repeated source signals that imply the same answer.
9. Author `MaturationAnswerClaims` only from convergent evidence or explicit
   authority.
10. Author `OntologyExpansion` rows only for semantic changes that add, refine,
    defer, or reject ontology content.
11. Validate expansion against seed refs, evidence refs, source lineage,
    surface coverage, and concept economy.
12. Update `ActionabilityMatrix` from validated baseline, answer claims,
    ontology expansion, limitations, and trace/audit-only support.
13. Close every material question and source-delta row in the convergence ledger
    with an explicit disposition: answered-and-expanded,
    answered-without-semantic-change, trace/audit only, deferred authority,
    rejected non-material, blocked, or out of scope.
14. Validate the convergence ledger and continuation decision.
15. Repeat until convergence or an explicit blocked/deferred state.
```

#### Maturation Artifact Plan

The table below is the target artifact plan. The executable authority graph is
still the registry. A row that is not present in
`reconstruct-contract-registry.yaml` is planned design until it is promoted with
an artifact authority, validation authority, gate, validator record,
`required_when` predicate, and activation condition. At the time of this design,
round-scoped `rounds/<round-id>/source-observation-delta.yaml`,
`rounds/<round-id>/source-observation-delta-validation.yaml`,
`rounds/<round-id>/source-observation-reentry-validation.yaml`,
`maturation-convergence-ledger.yaml`, and
`maturation-convergence-ledger-validation.yaml` are active runtime artifacts for
frontier-observation re-entry and first-pass closure projection.
`maturation-source-delta.yaml`, `maturation-source-delta-validation.yaml`,
`maturation-source-impact-judgment.yaml`, and
`maturation-source-impact-judgment-validation.yaml` remain target-design-only
artifacts not yet present in either active or planned registry catalogs.

Registry status claims in this prose are a design mirror, not the authority.
Runtime runs record the current registry snapshot in
`registry-verification-evidence.yaml` and validate it in
`registry-verification-evidence-validation.yaml`. This prose intentionally does
not carry a hard-coded registry hash; if this prose and the registry differ, the
registry wins for executable behavior and this document must be updated before it
is used as an implementation contract.

| Artifact | Registry status | Owner | Role |
|---|---|---|---|
| `maturation-baseline.yaml` | active registry | runtime | L0-L4 matrix from seed, CQs, limitations, and the validated seeding reconstruct record |
| `maturation-baseline-validation.yaml` | active registry | runtime | proves baseline rows derive from validated seed, purpose, CQ/proof, handoff authorities, and the source seeding record ref/hash |
| `maturation-promotion-request.yaml` | planned registry | runtime | durable request authority for maturation execution or planned gate promotion |
| `maturation-promotion-request-validation.yaml` | planned registry | runtime | proves request id, trigger refs, requested gates, and replay authority before promotion-readiness evaluation |
| `maturation-runtime-capability-profile.yaml` | planned registry | runtime | records runtime-observed writer, validator, predicate, and activation capability for planned maturation gates |
| `maturation-promotion-readiness.yaml` | planned registry | runtime | per-gate promotion decision before planned maturation gates become executable |
| `maturation-source-delta.yaml` | target design only | runtime | records no-delta, changed-source, unavailable-source, or mixed-member source authority differences for the maturation round |
| `maturation-source-delta-validation.yaml` | target design only | runtime | proves source-delta refs, hashes/versions, member lineage, comparison basis, and no-delta/changed/unavailable/comparison-unavailable factual states |
| `maturation-source-impact-judgment.yaml` | target design only | host LLM author | interprets validated source-delta facts against purpose, surfaces, and dimensions |
| `maturation-source-impact-judgment-validation.yaml` | target design only | runtime | proves impact judgments cite validated source-delta facts and do not turn runtime facts into unsupported ontology meaning |
| `maturation-question-frontier.yaml` | active registry | host LLM author | unanswered or weakly answered questions to mature |
| `maturation-question-frontier-validation.yaml` | active registry | runtime | question refs, materiality, surface, dimension, and seed-link validation |
| `maturation-closure-frontier.yaml` | active registry | host LLM author | next source refs or missing authority needed for material questions |
| `maturation-closure-frontier-validation.yaml` | active registry | runtime | frontier duplication, support, and boundary validation |
| `maturation-authority-response.yaml` | active registry | user/runtime/external authority captured by runtime | responses to non-source authority requests from the closure frontier |
| `maturation-authority-response-validation.yaml` | active registry | runtime | proves authority response scope, status, and refs before answer support or continuation decisions consume it |
| `rounds/<round-id>/source-observation-delta.yaml` | active registry | runtime | canonical per-round observation-lineage delta for newly observed source records from `source_frontier` or `maturation_closure_frontier`, distinguished by `frontier_kind`, `frontier_validation_ref`, `observation_batch_id`, and `triggering_frontier_validation_ref` |
| `rounds/<round-id>/source-observation-delta-validation.yaml` | active registry | runtime | proves delta rows match accepted frontier refs, observed source refs, material kind, observation hashes, observation batch identity, and frontier-validation identity |
| `rounds/<round-id>/source-observation-reentry-validation.yaml` | active registry | runtime | proves delta observations pass lineage and source-safety validation before prompt/context re-entry and answer-support consumption |
| `answer-support-ledger.yaml` | active registry | host LLM author + runtime refs | evidence clusters that support answer claims |
| `answer-support-ledger-validation.yaml` | active registry | runtime | evidence closure, independence, contradiction, and authority checks |
| `maturation-answer-claims.yaml` | active registry | host LLM author | source-backed answers to frontier questions |
| `maturation-answer-claims-validation.yaml` | active registry | runtime | answer claim refs, evidence, and limitation closure |
| `ontology-expansion.yaml` | active registry | host LLM author | ontology additions/refinements/deferred/rejected changes |
| `ontology-expansion-validation.yaml` | active registry | runtime | concept economy, ref closure, surface coverage, and regression guards |
| `actionability-matrix.yaml` | active registry | runtime | static/kinetic/dynamic by 7D and purpose element, with L0-L4 levels |
| `actionability-matrix-validation.yaml` | active registry | runtime | proves matrix rows derive from validated baseline and active maturation artifacts; promoted source-delta/source-impact authorities are consumed when activated |
| `maturation-convergence-ledger.yaml` | active registry | runtime | append-only round ledger of material question closure, trace/audit-only closure, round source-observation delta refs, and remaining frontier |
| `maturation-convergence-ledger-validation.yaml` | active registry | runtime | proves every blocker/high question is closed, carried forward, or blocked with refs before continuation is projected |
| `maturation-continuation-decision.yaml` | active registry | runtime | continue, ask user, blocked, actionable limited, or actionable ready |
| `maturation-continuation-decision-validation.yaml` | active registry | runtime | proves the continuation or terminal actionability state derives from the validated actionability matrix and any applicable frontier/support authorities |
| `actionable-ontology.yaml` | active registry | runtime | optional matured ontology projection when continuation reaches ready or limited, without inventing new semantic content |
| `actionable-ontology-validation.yaml` | active registry | runtime | actionability claim, row coverage, limitation, final re-question, and proof-boundary validation |

#### Maturation Authority Graph

After each artifact in the path is promoted into the registry, maturation
artifacts follow one target authority direction:

```text
validated seed + selected validated purpose frame + CQ assessment + proof validations
-> durable promotion request + runtime capability profile + promotion readiness validation when maturation gates are promoted
-> immutable maturation-baseline.yaml
-> maturation-baseline-validation.yaml
-> source-delta validation when the source authority has changed or must be
   proven unchanged
-> question/closure frontier
-> answer support and answer claims
-> ontology expansion overlay
-> current actionability-matrix.yaml
-> actionability-matrix-validation.yaml
-> convergence ledger
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

If maturation is resumed after time has passed, runtime must not assume the
source authority is unchanged. It writes a source-delta artifact when the host
or source profile can compare the consumed seed/run-manifest snapshot with the
current source authority. For code this may be repository commit or file hash
changes. For spreadsheets this may be workbook version, sheet/range hash, named
range, formula, or decision-cell changes. For documents and meeting records this
may be document version, section hash, decision/action-item changes, or metadata
changes. For databases this may be schema, view, grant, or sampled authority
snapshot changes. For mixed targets, every delta row preserves member lineage.

No-delta is also evidence. A no-delta result can close a freshness concern and
support a convergence claim, but it cannot by itself create ontology meaning.
A changed-source result must receive a validated source-impact judgment before
the LLM authors new semantic content from it.

#### Delta Boundary And Freshness Fail-Close

Maturation uses two different delta concepts. They must not be wired as aliases:

| Delta artifact | Owns | Does not own | Registry status | Primary consumers |
|---|---|---|---|---|
| `maturation-source-delta.yaml` | runtime factual freshness comparison between the consumed seed/run-manifest source authority and the current source authority; no-delta, changed-source, unavailable-source, and comparison-unavailable state | newly observed source-record lineage, frontier authorization, prompt/context re-entry proof, answer-support consumption proof, or semantic actionability-impact judgment | target design only until promoted with artifact, gate, validator, predicate, and activation condition | source-impact judgment, question-frontier validation, actionability matrix, convergence ledger, continuation decision, final re-question pass after promotion |
| `maturation-source-impact-judgment.yaml` | authored interpretation of validated source-delta facts against source-derived purpose, purpose elements, actionability surfaces, and maturity dimensions | source comparison facts, source snapshot authority, or observation lineage | target design only until promoted with artifact, gate, validator, predicate, and activation condition | question-frontier validation, answer support, matrix, convergence ledger, continuation decision |
| `rounds/<round-id>/source-observation-delta.yaml` | per-round lineage for newly observed source records created from `source_frontier` or `maturation_closure_frontier`; `frontier_kind`; `frontier_validation_ref`; observation batch identity | source freshness comparison against the consumed seed snapshot, no-delta authority, source-impact judgment, or actionability-impact interpretation of source changes | active registry as observation lineage; re-entry validation active for prompt/context reuse and answer-support consumption | broader downstream scanners remain planned until runtime evaluator support is promoted |

Current required behavior before `maturation-source-delta.yaml` promotion:

- runtime may expose only registry-backed maturation artifacts;
- a resumed run that cannot prove freshness through a promoted source-delta
  authority must project an explicit limitation, `blocked`, or `ask_user` when
  freshness can affect blocker/high rows;
- unpromoted source-delta prose must not be used as evidence for no-delta,
  source freshness closure, or actionable readiness; and
- the question frontier may still expose questions from the validated baseline,
  but it must not claim that those questions are fresh against a changed source.

After source-delta promotion, freshness-sensitive downstream validation is
fail-close:

- if source comparison is required and `maturation-source-delta-validation.yaml`
  is missing or invalid, question-frontier validation, matrix validation,
  convergence validation, and continuation validation must project `blocked` or a
  limitation-backed exclusion;
- `source_unavailable` and `comparison_unavailable` are authority-gap states, not
  no-delta states;
- `semantic_action_delta` or `may_change_actionability` may appear only in
  `maturation-source-impact-judgment.yaml`; once validated, those rows must become
  frontier questions, answer-support inputs, explicit limitations, or blocked
  rows before terminal actionability can be projected; and
- `trace_audit_delta` rows may close provenance or freshness work, but cannot
  raise a material row to L4 without separate positive answer support.

#### Maturation Source Delta Fact Recording

Source-delta fact recording is runtime-owned. It generalizes the source freshness
loop used in long-running code-backed ontology work without making code
repositories the only model. A source-delta fact row answers: "Did the source
authority change, become unavailable, or become incomparable against the source
snapshot consumed by this maturation session?"

Target implementable `maturation-source-delta.yaml` shape after registry
promotion:

```yaml
schema_version: "1"
session_id:
created_at:
round_id:
baseline_source_snapshot_ref:
current_source_snapshot_ref:
source_delta_status: no_delta | delta_detected | source_unavailable | comparison_unavailable
delta_rows:
  - delta_id:
    member_scope_refs: []
    member_target_material_kind:
    member_source_refs: []
    cross_material_ref_refs: []
    changed_source_refs: []
    factual_delta_kind: content_changed | metadata_changed | member_set_changed | source_unavailable | comparison_unavailable | no_observed_change
    comparison_basis: hash | version | timestamp | schema_snapshot | profile_snapshot | sampled_authority | unavailable
    rationale:
    supporting_refs: []
    limitation_refs: []
```

Naming containment:

- `MaturationSourceDelta` names the artifact family
  `maturation-source-delta.yaml` and its validation artifact.
- `SourceDeltaFact` names one factual row inside that artifact.
- Public fields, validators, and APIs should use `source_delta_fact` for row ids
  and `maturation_source_delta_ref` for the artifact ref.
- `MaturationSourceDelta` and `SourceDeltaFact` are not aliases; one is the
  container, the other is the row-level fact.
- Semantic impact fields never live on `SourceDeltaFact`; they live only in
  `SourceDeltaImpactJudgment` rows.

Impact judgments are authored only after `maturation-source-delta-validation.yaml`
passes:

```yaml
maturation-source-impact-judgment.yaml:
  schema_version: "1"
  session_id:
  created_at:
  round_id:
  source_delta_validation_ref: maturation-source-delta-validation.yaml
  impact_rows:
    - impact_id:
      source_delta_row_refs: []
      delta_kind: semantic_action_delta | evidence_strength_delta | trace_audit_delta | authority_gap_delta | out_of_scope_delta
      actionability_impact: changes_actionability | may_change_actionability | no_actionability_change | unknown
      affected_purpose_element_refs: []
      affected_surface_refs: []
      affected_dimension_refs: []
      expected_closure: generate_question | update_evidence_support | trace_audit_only | ask_authority | blocked | out_of_scope
      rationale:
      supporting_refs: []
      limitation_refs: []
```

Impact kinds are intentionally about actionability impact, not implementation
shape:

| Delta kind | Meaning | Allowed effect |
|---|---|---|
| `semantic_action_delta` | the source changed a purpose-critical object, actor, action, state, permission, policy, data binding, obligation, or external boundary | may generate frontier questions, answer claims, expansion, or matrix changes |
| `evidence_strength_delta` | the source gives stronger or weaker evidence for existing ontology meaning without changing the meaning itself | may change support refs, maturity level, or limitations, but not add/refine semantic content by itself |
| `trace_audit_delta` | the source changed in a way that is relevant for provenance, freshness, or audit only | may close a ledger row as trace/audit only, but must not create answer claims or expansion |
| `authority_gap_delta` | required source comparison or authority is unavailable or incomparable | may block, ask authority, or create limitation-backed frontier |
| `out_of_scope_delta` | the changed source is outside the selected purpose adequacy frame and actionability claim | may be recorded in the convergence ledger only |

`maturation-source-delta-validation.yaml` must prove:

- source snapshot refs, hashes, versions, or material-profile authority refs
  resolve against the consumed run manifest and current source authority;
- every changed source ref belongs to the target inventory or a validated mixed
  member source boundary;
- every mixed delta row preserves member material kind, member source refs, and
  cross-material refs or cites a limitation;
- `no_delta` can support freshness closure only when the comparison authority is
  valid for the material kind; and
- `comparison_unavailable` cannot be treated as no-delta.

`maturation-source-impact-judgment-validation.yaml` must prove:

- every impact row cites a valid source-delta validation row;
- impact rows cite purpose elements, surfaces, and dimensions when they can affect
  actionability;
- `semantic_action_delta` and `may_change_actionability` rows become frontier
  questions, answer-support inputs, or explicit blocker/limitation rows;
- `evidence_strength_delta` rows may update support and maturity levels only
  through validated evidence refs;
- `trace_audit_delta` rows reference `TraceAuditOnlyClosure` and cannot create
  answer claims, ontology-expansion rows, or new concepts; and
- runtime facts cannot be converted into semantic meaning without a validated
  impact judgment.

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

The first maturation implementation should be delivered in four slices. Rows
that mention source-delta or convergence-ledger artifacts describe target slice
outputs; those artifacts become active runtime outputs only after their registry
rows, gates, validators, and `required_when` predicates are promoted.

| Slice | Target output | Runtime/LLM ownership | Done when |
|---|---|---|---|
| M1 baseline/source state | `maturation-baseline.yaml`, `maturation-baseline-validation.yaml`, `maturation-source-delta.yaml` when applicable, `maturation-source-impact-judgment.yaml` when a changed source can affect actionability, initial `actionability-matrix.yaml`, and validations | runtime projection from seed validation, selected validated purpose frame, source authority comparison, CQ/proof assessment, and limitations; host-authored impact judgment only after source-delta facts validate | every purpose element x actionability surface x maturity dimension row has L0-L4 level, supporting refs, blockers, and next action; baseline is immutable, source facts are recorded, required impact judgments are validated, matrix is derived, and all have validation proof |
| M2 question frontier | `maturation-question-frontier.yaml` and validation | host LLM authors questions; runtime validates refs/materiality/surface/dimension | every blocker/high L0-L2 row has a frontier question or limitation/user-authority row |
| M3 support and claims | `maturation-closure-frontier.yaml`, observation delta, `answer-support-ledger.yaml`, `maturation-answer-claims.yaml`, validations | host LLM requests/claims; runtime validates closure frontier, observation lineage, and answer support closure | no answer claim exists without direct authority, runtime proof, user confirmation, or convergent source evidence |
| M4 expansion/closure/continuation | `ontology-expansion.yaml`, `maturation-convergence-ledger.yaml`, `maturation-continuation-decision.yaml`, `maturation-continuation-decision-validation.yaml`, optional `actionable-ontology.yaml` | host LLM authors semantic expansion; runtime validates closure disposition, matrix, continuation, final re-question evidence, and final projection | continuation decision is `continue`, `ask_user`, `blocked`, `actionable_limited`, or `actionable_ready` from validated matrix, frontier state, active convergence ledger, and promoted source-delta authorities when activated |

For the target maturation surface, M1 and M2 are the minimum useful slice. They
let a seed expose its next questions without claiming an actionable ontology.
If a row in M1 or M2 names an unpromoted planned artifact, the current runtime
may expose only the registry-backed subset and must not claim that the refined
slice is complete. M3 and M4 are required before the runtime may claim maturation
can extend the ontology and project an `ActionableOntology`.

#### Claim-Level Taxonomy

Runtime and MCP/API surfaces must state the strongest claim they can honestly
make. The claim level is separate from process completion.

| Claim level | May claim | Must not claim | Required authority |
|---|---|---|---|
| `seed_candidate` | a seed draft or partial seed exists | seed validity, maturation readiness, or actionability | authored seed artifact plus visible validation state or failure state |
| `seed_valid_for_maturation` | the first valid kernel can enter maturation, or can enter with named limitations | actionable ontology, complete 7D maturity, or answered decision/action support | seed validation, purpose authority, confirmation when required, CQ assessment, and handoff validation |
| `maturation_minimum_executable` | M1/M2 can expose baseline, actionability matrix, and question frontier for the next iteration | answer claims, ontology expansion, convergence, or actionable projection | baseline, matrix, question-frontier artifacts and validations |
| `maturation_in_progress` | some questions have validated support, claims, or expansion overlays | terminal readiness or global convergence | applicable M3 artifacts and validations for only the rows being claimed |
| `actionable_limited` | the ontology supports a bounded claim scope with named exclusions | readiness for excluded blocker/high rows or unvalidated runtime/query/API behavior | validated matrix, continuation decision, limitation refs, active convergence ledger, and promoted source-delta authorities when active |
| `actionable_ready` | every material static, kinetic, and dynamic row is L4 or outside the declared claim, and re-question closure finds no new blocker/high question | unresolved blocker/high gaps, stale source freshness, or unproven downstream access paths | validated matrix, active convergence ledger, final re-question pass, continuation validation, and proof authorities for claimed access surfaces |
| `blocked` | required source, user, runtime, external-system, or domain-standard authority is unavailable | limited or ready actionability | failed or missing applicable validation, authority-gap refs, and visible next action |

`continue` and `ask_user` are continuation states, not actionability claims. A
run may complete its current process step while still projecting
`maturation_minimum_executable`, `continue`, `ask_user`, or `blocked`.

`claim-projection.yaml` is the pre-publication authority for the strongest
honest public claim that final output and public result surfaces may cite:

```yaml
schema_version: "1"
session_id:
created_at:
source_authority_refs: []
projection_rows:
  - projection_id:
    projection_surface: status | result | final_output | mcp | api | handoff | material_kind_support
    claim_level: not_applicable | seed_candidate | seed_valid_for_maturation | maturation_minimum_executable | maturation_in_progress | actionable_limited | actionable_ready | blocked
    decision_state: continue | ask_user | blocked | actionable_limited | actionable_ready | not_applicable
    actionability_claim: none | limited | ready
    material_kind_capability_refs: []
    governance_scope:
      reconstruct_run_level: included | not_claimed
      operated_system_release_health: out_of_scope | planned_later | delegated_authority_ref
      rollback_quota_incident_governance: out_of_scope | planned_later | delegated_authority_ref
    member_capability_rows:
      - member_id:
        target_ref:
        target_material_kind:
        selected_source_profile_id:
        selected_source_profile_ref:
        selected_source_profile_definition_sha256:
        member_source_refs: []
        validation_ref:
        support_claim: unsupported | profile_supported | fixture_validated | golden_source_validated | real_source_validated | release_supported
        readiness_effect: supported | limited | blocked
        next_action:
        limitation_refs: []
    included_row_refs: []
    excluded_row_refs: []
    required_validation_refs: []
    registry_evidence_refs: []
    display_label:
    machine_status:
    timestamp:
      value:
      timezone:
      source_ref:
    locale_context:
      locale:
      value_format_refs: []
    limitation_refs: []
```

`claim-projection-validation.yaml` must prove that every status/result/API/MCP,
handoff, and material-kind support claim consumes one pre-publication projection row, and that
final-output claim sections cite the canonical projection refs without
restating pre-publication claim values; `claim_level` is not inferred from prose;
`decision_state` is separate from
`actionability_claim`; material-kind/member limits are visible with target ref,
selected profile snapshot, profile definition hash, member source refs,
validation ref, readiness effect, and next action; bounded UX fields
and governance scope are present for public surfaces; broader operated-system
governance is marked `out_of_scope`, `planned_later`, or delegated to an
authority ref before public surfaces can mention it; and any current/executable
claim has registry, gate, validator, or test evidence refs, or is marked pending
verification.

The claim projection consumes an immutable
`reconstruct-run-control.pre-publication-validation.yaml` checkpoint, not the
mutable final `reconstruct-run-control-validation.yaml` path that is rewritten
after final artifact publication. `material_kind_support` rows cite
`target-material-profile-validation.yaml`; the runtime may currently publish only
`unsupported` or `profile_supported` member support claims unless stronger
fixture/golden/real/release evidence gates are wired. Mixed-target projection
must not collapse member support into an aggregate status; every member row is
the public claim surface for what that member can support and what action
remains.

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

#### Maturation Closure Dispositions

Not every inspected issue should become ontology meaning. Maturation therefore
separates answer claims and ontology expansion from question closure. A question
closure disposition records what happened to a material question or source delta
after evidence and authority were checked.

This is a concept-economy boundary. `trace_audit_only` is not added as an
`ontology-expansion.yaml` operation because it does not add, refine, defer, or
reject ontology content. It is a closure result that belongs in the convergence
ledger. This keeps runtime evidence and provenance useful without inflating the
ontology.

Allowed closure dispositions:

| Disposition | Meaning | Actionability effect |
|---|---|---|
| `answered_and_expanded` | positive support produced a semantic add/refine/defer/reject overlay | may change matrix rows and actionable ontology projection |
| `answered_no_semantic_change` | positive support confirms the current ontology answer without needing semantic change | may raise evidence or validation level |
| `trace_audit_only` | source/evidence was inspected but does not change material actionability | may update provenance or freshness only |
| `deferred_user_decision` | the next authority is a user/product decision | projects `ask_user` or a limitation-backed exclusion |
| `deferred_external_authority` | the next authority is an external system, standard, or runtime capability | projects `ask_user`, `blocked`, or limitation-backed exclusion depending on availability |
| `rejected_non_material` | the candidate/question is real but outside the source-derived purpose adequacy frame | cannot block the actionability claim |
| `blocked_unavailable` | required source, proof, runtime capability, or authority is unavailable | blocks or limits actionability according to materiality |
| `out_of_scope` | the question belongs outside the declared claim scope | visible exclusion; cannot silently erase prior material rows |

Current active `maturation-convergence-ledger.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
rounds:
  - round_id:
    source_observation_delta_validation_ref:
    question_frontier_validation_ref:
    actionability_matrix_validation_ref:
    final_requestion_pass:
      pass_id:
      input_authority_refs: []
      generated_question_refs: []
      new_material_question_refs: []
      closed_as_non_material_refs: []
      pass_status: not_run | no_new_material_question | material_question_found
      rationale:
    closure_rows:
      - closure_id:
        question_refs: []
        source_observation_delta_validation_refs: []
        closure_disposition: answered_and_expanded | answered_no_semantic_change | trace_audit_only | deferred_user_decision | deferred_external_authority | rejected_non_material | blocked_unavailable | out_of_scope
        materiality: blocker | high | medium | low | info
        actionability_surface_refs: []
        maturity_dimension_refs: []
        purpose_element_refs: []
        affected_matrix_row_refs: []
        supporting_refs: []
        answer_claim_refs: []
        expansion_refs: []
        limitation_refs: []
        next_action:
    source_observation_closure_rows:
      - source_observation_closure_id:
        observation_id:
        delta_row_id:
        source_ref:
        source_observation_delta_validation_ref:
        question_refs: []
        evidence_cluster_refs: []
        answer_claim_refs: []
        expansion_refs: []
        closure_disposition: answered_and_expanded | answered_no_semantic_change | trace_audit_only | deferred_user_decision | deferred_external_authority | rejected_non_material | blocked_unavailable | out_of_scope
        limitation_refs: []
    remaining_frontier_refs: []
```

Current `maturation-convergence-ledger-validation.yaml` must prove:

- every blocker/high question in the validated frontier is either closed, carried
  forward, or blocked with refs;
- every `answered_and_expanded` row cites a valid answer claim and expansion;
- every `answered_no_semantic_change` row cites a valid answer claim or validated
  answer-support evidence cluster;
- `trace_audit_only` rows do not cite expansions and do not close blocker/high
  rows whose material answer is still unsupported;
- deferred and blocked rows cite support, limitations, or a next action;
- every ontology expansion appears in exactly one convergence ledger row for the
  round, and any round source-observation delta refs match the round
  `source_observation_delta_validation_ref`;
- every consumed source-observation delta row appears in exactly one
  `source_observation_closure_rows[]` row with a disposition; and
- remaining frontier refs resolve to validated frontier questions. The active
  first-pass ledger records `final_requestion_pass.pass_status: not_run`; final
  re-question closure becomes a stronger terminal projection gate when
  actionable ontology projection is implemented.

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
Trace/audit-only and evidence-only checks must not be encoded as no-op
expansions. After convergence-ledger promotion, they close through
`maturation-convergence-ledger.yaml`.

`ontology-expansion-validation.yaml` must enforce:

- every `answer_claim_refs[]` item resolves to a valid answer claim;
- every `evidence_refs[]` item resolves through the validated evidence ledger or
  prior seed/source observation authority;
- `operation: add` with `concept_economy_effect: increases_surface` includes a
  rationale that explains why reuse/refinement is insufficient;
- `operation: defer` or `reject` carries limitation refs or answered question
  refs;
- no expansion exists only to record freshness, provenance, or implementation
  trace when the convergence ledger can close it as trace/audit only;
- no expansion rewrites seed authority in place. The expansion is an overlay
  until the final `actionable-ontology.yaml` projection is validated.

Active `actionable-ontology.yaml` projection shape:

```yaml
schema_version: "1"
session_id:
created_at:
ontology_seed_ref: ontology-seed.yaml
ontology_seed_validation_ref: ontology-seed-validation.yaml
ontology_expansion_ref: ontology-expansion.yaml
ontology_expansion_validation_ref: ontology-expansion-validation.yaml
actionability_matrix_ref: actionability-matrix.yaml
actionability_matrix_validation_ref: actionability-matrix-validation.yaml
maturation_continuation_decision_ref: maturation-continuation-decision.yaml
maturation_continuation_decision_validation_ref: maturation-continuation-decision-validation.yaml
actionability_claim: actionable_ready | actionable_limited
final_requestion_pass_status: not_run | no_new_material_question | material_question_found
claim_scope:
  included_row_refs: []
  excluded_row_refs: []
  limitation_refs: []
  rationale:
downstream_claims:
  query_access: not_claimed
  visualization: not_claimed
  graph_exploration: not_claimed
projected_rows:
  - projection_row_id:
    matrix_row_ref:
    claim_scope: included | excluded
    actionability_surface_ref:
    maturity_dimension_ref:
    purpose_element_ref:
    materiality: blocker | high | medium | low | info
    maturity_level: L0_missing | L1_identified | L2_modeled | L3_evidenced | L4_validated_for_purpose
    member_readiness: closed | limitation_backed | frontier_required | out_of_scope
    seed_ref_refs: []
    expansion_refs: []
    evidence_refs: []
    supporting_refs: []
    limitation_refs: []
    rationale:
```

This projection is user-facing and downstream-facing. Its validation must prove
that every projected row traces back to seed refs, validated expansion refs, or
explicit limitation refs. It must not become a new uncontrolled semantic source.
The active projection does not claim query, visualization, or graph-exploration
runtime proof; those proof claims remain controlled by the registry-owned proof
authority contracts and are required only when a downstream proof surface is
claimed.

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

The active first-pass runtime keeps two matrix artifacts so artifact refs stay
truthful. `baseline-actionability-matrix.yaml` is the immutable
baseline-derived M1 matrix consumed by `maturation-question-frontier.yaml`.
After validated answer claims and ontology expansion exist, runtime writes the
current projection to `actionability-matrix.yaml`. `maturation-baseline.yaml`
remains the immutable start state; continuation and claim projection consume the
recomputed current matrix. The runtime must not raise a blocker/high row to
`closed` unless the row is `L4_validated_for_purpose` or limitation-backed
outside the claim scope.

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
- rows closed by `trace_audit_only` remain visible as provenance/freshness
  support but do not raise a material row to L4 unless another validation or
  proof authority supports the answer; and
- recomputation inputs are recorded so continuation decisions can be audited.

#### Material Value Authority

Long-running ontology work repeatedly surfaced policy-like values: time windows,
thresholds, lock durations, default values, formula thresholds, decision dates,
limits, and retry counts. These values can change actionability, but copying
them into prose makes the ontology stale. Maturation should therefore treat
material values as source-backed authority rows rather than incidental text.

This is material-kind-specific:

| Material kind | Value authority examples |
|---|---|
| `code` | policy constants, feature flags, timeout/retry/TTL values, permission limits, state thresholds |
| `spreadsheet` | input assumptions, formula constants, decision-cell thresholds, named-range defaults |
| `document` | criteria, dates, obligation terms, explicit scope limits, approval requirements |
| `database` | constraints, defaults, retention windows, derived view definitions, grants |
| `mixed` | per-member values plus cross-material mapping or contradiction rows |

Material values should be represented as constraints, dynamic boundaries, data
bindings, answer-support evidence, or maturation limitations according to their
role. They should not be embedded only in `rationale` or final prose. If a value
does not change any answer for the source-derived purpose, it is closed as
trace/audit only. If it changes a permission, state, action availability,
calculation, obligation, or trusted output, it becomes a material row in the
actionability matrix.

Material value and domain competency admission share one replayable authority
path. The path may be a standalone artifact or embedded canonical rows, but
runtime validators must consume the same row shape:

| Input | Admit when | Disposition values | Required refs |
|---|---|---|---|
| source-backed material value | the value can change permission, state, action availability, calculation, obligation, trusted output, evidence trust, or a dynamic boundary for the source-derived purpose | `admitted_material`, `trace_audit_only`, `out_of_scope`, `deferred_authority`, `rejected_ambiguous` | source refs, purpose element refs, actionability surface refs, maturity dimension refs, materiality ref, and value authority refs |
| domain competency question | the run manifest admits the domain competency snapshot and the question is required, supporting, or diagnostic for the declared purpose | `required_blocking`, `supporting_material`, `diagnostic_only`, `deferred_product_decision`, `out_of_scope` | competency id, domain snapshot ref, admission policy ref, purpose element refs, materiality ref, assessment ref, and limitation refs when unresolved |

Admission consequences:

- `admitted_material`, `required_blocking`, and `supporting_material` inputs must
  appear in a baseline row, frontier question, answer-support row, actionability
  matrix row, convergence closure row, or explicit limitation.
- `trace_audit_only` and `diagnostic_only` inputs remain visible for provenance
  and audit, but must not create ontology expansion or raise a material row to L4
  by themselves.
- `deferred_authority` and `deferred_product_decision` inputs must become
  `ask_user`, blocked, or limitation-backed exclusions when they affect
  blocker/high rows.
- `rejected_ambiguous` inputs require contradiction or ambiguity refs so the run
  can be replayed without silently discarding source evidence.

Canonical admission row shape:

```yaml
material-admission-ledger.yaml:
  schema_version: "1"
  session_id:
  created_at:
  admission_rows:
    - admission_id:
      admission_phase: pre_seed_purpose_element | pre_seed_material_value | post_cq_domain_competency | maturation_reassessment
      input_kind: purpose_adequacy_element | material_value | domain_competency_question
      input_ref:
      source_refs: []
      purpose_element_snapshot_ref:
      value_snapshot_ref:
      competency_snapshot_ref:
      admission_policy_ref:
      disposition: admitted_material | trace_audit_only | out_of_scope | deferred_authority | rejected_ambiguous | required_blocking | supporting_material | diagnostic_only | deferred_product_decision
      materiality: blocker | high | medium | low | info
      purpose_element_refs: []
      actionability_surface_refs: []
      maturity_dimension_refs: []
      downstream_authority_refs: []
      supersedes_admission_refs: []
      limitation_refs: []
      rationale:
```

`material-admission-ledger-validation.yaml` must prove row uniqueness, source and
snapshot refs, allowed dispositions by `input_kind` and `admission_phase`,
downstream closure for every admitted or required row, phase-appropriate
prerequisites, and no silent loss of diagnostic/deferred/out-of-scope rows.
Existing artifacts may embed this row shape only if their validators expose the
embedded rows as the same authority for replay and final claim projection.

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
a form that lets the user choose the next action. After source-delta and
convergence-ledger authorities are promoted into the registry, the continuation
decision shape also carries their validation refs.

Implementable `maturation-continuation-decision.yaml` shape:

```yaml
schema_version: "1"
session_id:
created_at:
actionability_matrix_validation_ref: actionability-matrix-validation.yaml
# required after convergence-ledger promotion
convergence_ledger_validation_ref: maturation-convergence-ledger-validation.yaml
# populated after source-delta promotion
source_delta_validation_refs: []
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

For the target M4 surface, after the convergence-ledger authority is promoted or
requested as an applicable planned gate, continuation-decision validation must
consume the validated convergence ledger. The matrix says what is mature; the
ledger says why each material question or delta is closed, carried forward,
blocked, deferred, or outside the claim. A terminal state may not rely on a
matrix row that lacks a corresponding ledger closure when a validated frontier
question or source delta created that row.

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
`triggering_frontier_validation_ref`, and `triggering_frontier_ref` on new
observation records and delta rows, and writes the
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
tied to the round/frontier before downstream semantic use. A delta row is
invalid when its observation lacks the same `round_id`,
`observation_batch_id`, and `triggering_frontier_validation_ref` that the
accepted frontier produced.

`source_frontier_gate` must validate duplicate status against current
`source-observations.yaml`, not only against the source inventory. The
`observation_reentry_gate` validates prompt/context re-entry for delta
observations, and `answer-support-ledger-validation.yaml` validates answer-support
consumption when evidence refs cite newly observed delta observations. Broader
downstream artifact consumption scanning remains planned until a runtime evaluator
can generate and validate the relevant
`frontier_observation_use_by_downstream_artifact` predicate instances. Active
runtime/public claims must therefore describe source-observation re-entry as
prompt/context and answer-support bounded, not as full downstream-consumption
safety.

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
`final-output.md` is emitted only after `handoff-decision-validation.yaml`
passes; it projects the validated seed iteration readiness result and cites the
canonical claim-projection refs without restating claim values. The final
`reconstruct-record.yaml` is assembled after claim projection validation closes
the public claim authority. Neither artifact is an input to the terminal
readiness validator.
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
| Source-delta and impact closure | Current source authority is proven unchanged, unavailable, or changed through validated source-delta facts; every changed row that may affect actionability has a validated source-impact judgment as semantic, evidence-strength, trace/audit, authority-gap, or out-of-scope with a closure |
| Closure disposition coverage | Every material frontier question and source-delta row has a convergence-ledger disposition |
| Frontier exhaustion by materiality | Remaining frontier questions are non-material, explicitly deferred, or cannot be advanced without new source/user authority |
| Re-question convergence | Regenerating questions from the current actionability matrix, admitted competency questions, and remaining limitations produces no new blocker/high question that can change the source-derived purpose adequacy frame |
| Static/kinetic/dynamic actionability | Static structure, kinetic behavior, and dynamic condition boundaries are each answerable from ontology refs and evidence refs, or limitation-backed without claiming actionability |

Maturation should continue when a frontier question can still change any
material purpose adequacy element, including object boundary, actor authority,
record completeness, decision/action availability, permission, state transition,
data binding, evidence trust, or external dependency. Maturation should not
continue merely to add explanatory detail that cannot change the declared
decision/action/record outcome.

The final re-question pass is not a second full source scan. It regenerates
questions from the validated actionability matrix, convergence ledger,
competency-question assessment, source-delta validation, and limitations. If the
pass finds a new blocker/high question that can be advanced by available source,
runtime, user, external, or domain-standard authority, maturation projects
`continue` or `ask_user`. If it finds only non-material detail, trace/audit-only
freshness concerns, or out-of-scope questions, those rows are closed in the
convergence ledger.

This gives maturation two separate stop signals:

| Stop signal | Meaning |
|---|---|
| Matrix closure | every material static/kinetic/dynamic x seven-dimension row is L4 or limitation-backed outside the claim |
| Re-question closure | a fresh frontier generated from the current artifacts yields no new material question that can change the actionability claim |

Both are required before `actionable_ready`; `actionable_limited` may exclude
named rows only when the convergence ledger explains the limitation and the
excluded rows do not undermine the included claim scope.

## 11. Artifact Plan

The executable artifact list is registry-owned at
`reconstruct-contract-registry.yaml#artifact_authorities` and
`#planned_artifact_authorities`. This design also names target artifacts that are
not executable until they are promoted into that registry set. This plan groups
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
`reconstruct-run-control.yaml` is the first runtime-control authority for
session ownership, idempotency fingerprinting, attempt lineage, active-attempt
lock leases, duplicate-start diagnostics, and observed file-hash write
transactions. Initial ownership admission must be atomic: if another run creates
the run-control artifact first, the later run follows the duplicate or explicit
resume path instead of constructing a second accepted owner. Run-control must be
valid before runtime or public surfaces trust any later artifact in the session
root. Retry/resume and partial-write recovery require
separate explicit promotion before they can be trusted as active behavior.
`maturation-convergence-ledger.yaml` is an active first-pass closure authority
consumed by continuation-decision validation. `maturation-source-delta.yaml`
remains a target maturation authority and is not runtime-consumable until its
registry rows, gates, validators, and `required_when` predicates are promoted.

### Cross-Cutting Authority Artifacts

The following target authorities close behavior that spans seeding, maturation,
status/result projection, replay, and MCP/API/final-output surfaces. They are not
runtime-consumable until promoted into `reconstruct-contract-registry.yaml` with
artifact authorities, validation authorities, gates, validators, predicates, and
activation conditions.

| Artifact | Owner | Role |
|---|---|---|
| `reconstruct-run-control.yaml` | runtime | atomically admitted session ownership, request fingerprint, lock lease, attempt lineage, idempotency, duplicate-start diagnostics, and observed file-hash write checkpoints |
| `reconstruct-run-control-validation.yaml` | runtime | proves the active run atomically owns the session root and may consume or write artifacts before any semantic or public projection |
| `reconstruct-run-control.pre-publication-validation.yaml` | runtime | immutable run-control checkpoint consumed by pre-publication claim projection before final output and final write publication mutate the final validation path |
| `reconstruct-run-bootstrap-diagnostic.yaml` | runtime | pre-trust diagnostic envelope used only when run-control validation fails before claim projection can be trusted |
| `claim-projection.yaml` | runtime | pre-publication strongest-honest-claim projection for status, result, MCP/API, handoff, material-kind support, and the final-output claim authority refs |
| `claim-projection-validation.yaml` | runtime | proves claim level, decision state, actionability claim, material-kind/member support, bounded UX fields, target-material profile validation, and pre-publication run-control/registry/validation evidence closure |
| `material-admission-ledger.yaml` | runtime | canonical admission/disposition rows for purpose-critical adequacy elements, and later source-backed material values when that phase is promoted |
| `material-admission-ledger-validation.yaml` | runtime | proves admitted, deferred, rejected, and out-of-scope admission rows are replayable and closed downstream |
| `source-safety-ledger.yaml` | runtime | lifecycle, authorization, privacy, redaction, proof sufficiency, and replay state for observed source records, keyed by exact observation safety row id with derived visibility policy and conservative public/material claim defaults |
| `source-safety-ledger-validation.yaml` | runtime | proves unsafe, retired, redacted, disposed, invalidated, unauthorized, privacy-sensitive, or proof-insufficient source refs fail closed or become limitations |
| `source-observation-lineage-index.yaml` | runtime | session-level index of every round-scoped source-observation delta, delta validation, re-entry validation, frontier kind, and added observation id consumed by answer-support validation |
| `source-observation-lineage-index-validation.yaml` | runtime | proves the session lineage index matches valid per-round delta validations, re-entry validations, frontier kinds, and source observation ids before semantic downstream consumption |
| `vocabulary-authority-ledger.yaml` | planned | identity, snapshot, mapping, applicability, alias, supersession, and migration rows for mutable vocabulary |
| `vocabulary-authority-ledger-validation.yaml` | planned | proves mutable vocabulary refs remain replayable and fail closed when identity or migration cannot be resolved after registry promotion |
| `registry-verification-evidence.yaml` | runtime | exact registry, gate, validator, source-profile, test, and implementation evidence for present-tense current/executable claims |
| `registry-verification-evidence-validation.yaml` | runtime | proves prose current-status claims are verified, or marks them `pending_verification` and prevents runtime consumption |

#### Runtime Control Authority

`reconstruct-run-control.yaml` is the first durable artifact for a reconstruct
session root. No seed, maturation, status, result, MCP/API, final-output, or
handoff artifact may be trusted unless the current attempt has valid run-control
ownership. Validated resume handoff from an earlier attempt is a future promoted
protocol, not an active same-session duplicate bypass.

```yaml
schema_version: "1"
session_id:
session_root:
created_at:
runtime_version:
request_rows:
  - request_id:
    idempotency_key_hash:
    request_fingerprint:
    target_signature_ref:
    requested_stage: seeding | maturation | handoff | resume | retry
    duplicate_policy: return_existing | continue_existing | reject_conflict | create_new_session
    request_status: accepted | duplicate_same_request | duplicate_conflict | rejected_conflict
attempt_rows:
  - attempt_id:
    parent_attempt_id:
    attempt_kind: initial | retry | resume | continuation | recovery
    trigger_ref:
    started_at:
    completed_at:
    attempt_status: running | completed | failed | halted | recovered | abandoned
    recovery_from_refs: []
lock_rows:
  - lock_id:
    lock_scope: session_root | artifact_path | promotion_request | source_snapshot | registry_promotion
    owner_attempt_id:
    lease_started_at:
    lease_expires_at:
    lock_token_hash:
    conflict_policy: fail_loud | optimistic_compare_and_swap | recover_expired_lease
    lock_status: held | released | expired | stolen_invalid | conflict_blocked
write_transactions:
  - transaction_id:
    owner_attempt_id:
    artifact_ref:
    temp_ref:
    expected_prior_hash:
    committed_hash:
    commit_method: atomic_rename | compare_and_swap | append_only | observed_file_hash
    transaction_status: prepared | committed | rolled_back | quarantined | failed
    recovery_ref:
resume_rows:
  - resume_id:
    resume_token_hash:
    source_attempt_id:
    checkpoint_refs: []
    trusted_artifact_refs: []
    stale_artifact_refs: []
    required_revalidation_refs: []
    resume_decision: resume_allowed | retry_required | blocked_conflict | blocked_stale | blocked_partial_write
```

`reconstruct-run-control-validation.yaml` must prove:

- `session_root`, `request_fingerprint`, target signature, runtime version, and
  idempotency key are replayable;
- two concurrent attempts cannot both own the same `session_root`,
  `artifact_path`, source snapshot, or promotion request unless an explicit
  append-only or compare-and-swap policy allows it;
- duplicate requests with the same fingerprint fail loud with
  `reconstruct-run-bootstrap-diagnostic.yaml` and `safe_recovery_action:
  return_existing` until an explicit result/status return surface is promoted;
- duplicate requests with conflicting fingerprints fail loud before semantic
  artifacts are written;
- every artifact write is recorded as a transaction and either committed through
  an atomic write method or truthfully marked as `observed_file_hash`; partial
  files are quarantined, rolled back, or recovered before downstream validators
  consume them;
- retry and resume attempts are not active trust claims until a promoted retry
  or resume surface proves source, registry, profile, and write-transaction
  recovery without overwriting trusted artifacts from a previous attempt.

Runtime-control validation is a prerequisite for all later validation gates. If
it is absent or invalid, the only allowed public projection is a
`claim-projection.yaml` row with `claim_level: blocked`,
`decision_state: blocked`, and a recovery action that names the conflicting,
partial, stale, or missing run-control authority.

Exception: when run-control validation fails before `claim-projection.yaml` can
itself be trusted, runtime may emit `reconstruct-run-bootstrap-diagnostic.yaml`.
This diagnostic is operational only and must not carry seed validity, maturation
readiness, actionability, material-kind support, or semantic ontology claims.

```yaml
reconstruct-run-bootstrap-diagnostic.yaml:
  schema_version: "1"
  emitted_at:
  attempted_session_root:
  request_fingerprint:
  idempotency_key_hash:
  failure_kind: lock_conflict | duplicate_conflict | partial_write_detected | stale_resume | invalid_request | missing_run_control
  conflicting_refs: []
  partial_refs: []
  safe_recovery_action: return_existing | retry_with_new_session | resume_after_recovery | manual_cleanup_required | ask_user
  diagnostic_source: runtime_control_bootstrap
```

This bootstrap diagnostic may be returned by status/result APIs, but it is not a
replacement for `claim-projection.yaml`. Once a valid run-control authority
exists, all public surfaces must return to the normal claim-projection path.

#### Cross-Cutting Authority Activation Order

The cross-cutting authorities must be activated in this order when their
`required_when` condition is true. Later authorities cannot consume earlier ones
through prose shortcuts.

| Order | Authority | Required when | First consumers | Fail-close behavior |
|---|---|---|---|---|
| 0 | `reconstruct-run-control-validation.yaml` | any seeding, maturation, retry, resume, status, result, or public projection writes/reads session artifacts | every writer, validator, status/result reader, final-output writer, record assembler | block or return existing trusted run before semantic artifacts are consumed |
| 1 | `registry-verification-evidence-validation.yaml` | prose or public surface claims `active`, `promoted`, `current`, `implemented`, `executable`, `ready`, or material-kind support | claim projection, final-output provenance, MCP/API/status/result, prompt packet materialization | mark `pending_verification` and prevent runtime/public consumption |
| 2 | `source-safety-ledger-validation.yaml` | an observed source record enters context assembly, a prompt packet, source observation re-entry, evidence support, or source-backed claim | prompt-packet materialization/context assembly, source observation re-entry, source-backed evidence support | exclude, redact, limit, or block according to lifecycle, authorization, privacy, redaction, proof sufficiency, replay, and observation-specific derived prompt visibility policy |
| 3 | `material-admission-ledger-validation.yaml` | source-backed values can affect actionability, evidence trust, dynamic boundaries, permissions, obligations, calculations, or public claims | candidate disposition, seed validation, maturation baseline, question frontier, matrix, convergence ledger | every admitted/required source-backed row must be consumed downstream or surfaced as limitation/blocked/out-of-scope |
| planned | `vocabulary-authority-ledger-validation.yaml` | mutable profile facets, domain terms, provider/framework terms, external standards, or reference patterns need active runtime vocabulary proof | source profile selection, seed rows, maturation rows, external boundary rows, claim projection | planned authority; current runtime must not claim this validation has active coverage |
| 5 | `claim-projection-validation.yaml` | any status/result/MCP/API/handoff surface reports success, readiness, actionability, `blocked`, `ask_user`, or material-kind support; final-output claim sections may only cite canonical refs until this closes | all public and downstream result surfaces | surfaces may not infer claim level or next action from distributed artifacts |

This order is a runtime dependency order, not a user-visible workflow. A single
implementation stage may write multiple authority artifacts together, but
validators still consume them in the order above.

#### Material Admission Authority

`MaterialAdmissionAuthority` is the runtime-assembled authority for
purpose-critical adequacy elements derived from the validated purpose adequacy
frame. It keeps those required elements distinct from literal source-backed
material values, which use the separate `pre_seed_material_value` phase only
when that value-specific producer and consumer path is promoted. Domain
competency admission is currently carried by the governing snapshot,
competency-question generation, and competency assessment path; domain competency
rows in `material-admission-ledger.yaml` are planned until that producer and
consumer path is promoted.

Material admission is phase-scoped so early seed construction does not require
artifacts that exist only after seed validation or competency assessment:

| Admission phase | May admit | Required before | Must not require |
|---|---|---|---|
| `pre_seed_purpose_element` | purpose adequacy required elements derived from source purpose | candidate disposition and seed validation when those elements affect seed claims | competency-question assessment or maturation baseline |
| `pre_seed_material_value` | literal source-backed material values discovered from source observation | candidate disposition and seed validation when those values affect seed claims | competency-question assessment or maturation baseline |
| `post_cq_domain_competency` | admitted domain competency questions and assessment results | handoff readiness, maturation baseline, question frontier, actionability matrix, and claim projection when domain CQs affect the claim | rewriting already validated seed rows |
| `maturation_reassessment` | values or domain questions whose materiality changes after source delta, authority response, or maturation answer support | convergence ledger, continuation decision, and actionable ontology projection | retroactive mutation of earlier phase rows without supersession refs |

The active runtime writes `pre_seed_purpose_element` rows. Later phases are
reserved for registry promotion and must not be presented as active admission
coverage before their producer and consumer validators exist.

| Consumer | Required material-admission consumption |
|---|---|
| candidate disposition | every admitted purpose-critical row or required/supporting domain competency has a candidate, limitation, or out-of-scope row |
| seed validation | every seed claim that depends on an admitted row cites its admission id |
| maturation baseline | admitted blocker/high rows create or update baseline rows with materiality and next action |
| question frontier | unsupported admitted blocker/high rows become frontier questions or authority requests |
| actionability matrix | matrix rows preserve admission materiality and cannot downgrade blocker/high without validated closure |
| convergence ledger | every admitted row is closed as answered, trace/audit-only, deferred, blocked, rejected, or out-of-scope |
| claim projection | included, excluded, blocked, and ask-user rows cite admission ids or validated non-applicability |

`material-admission-ledger-validation.yaml` must fail when an admitted or
required row has no downstream consumer, when a diagnostic row silently affects
actionability, or when a rejected/out-of-scope row lacks replayable evidence.

#### Source Safety Authority

`source-safety-ledger.yaml` is the runtime authority that turns each observed
source record's exact safety row identity into validator-consumed state. Safety
row identity is scoped by both observation and intended consumption:
`source_safety:<observation_id>:<intended_consumption>`.

Canonical source safety has exactly six independent validation axes:

1. `lifecycle_state`
2. `authorization_state`
3. `privacy_state`
4. `redaction_state`
5. `proof_sufficiency_state`
6. `replay_state`

`visibility_tier` is not a seventh axis. It is a deterministic sink/output policy
derived from the six canonical axes and the intended consumption
(`prompt_context`, `evidence_support`, `public_output`, `replay`, or
`material_claim`). Validators must preserve both the failing canonical axis and
the derived visibility tier when they limit or block consumption. One valid
prompt-context row never substitutes for evidence-support, public-output,
replay, or material-claim authority.

Generated source-safety rows are conservative for outward or material
consumption. Runtime read scope can authorize internal `prompt_context`,
`evidence_support`, and replay checks, but `public_output` and `material_claim`
rows must remain authority-gap rows (`authorization_state: unknown`,
`proof_sufficiency_state: insufficient_for_claim`, derived `no_prompt_use`, and
a limitation ref) unless the observed source explicitly authorizes that exact
intended consumption.

```yaml
schema_version: "1"
session_id:
created_at:
safety_rows:
  - safety_row_id:
    subject_ref:
    subject_kind: source_ref
    lifecycle_state: active | retired | disposed | invalidated | stale | missing
    authorization_state: authorized | unauthorized | unknown | not_required
    privacy_state: non_sensitive | privacy_sensitive | unknown
    redaction_state: none | redacted | required | insufficient
    proof_sufficiency_state: sufficient_for_claim | insufficient_for_claim | trace_only | unavailable
    replay_state: replay_allowed | replay_with_redaction | no_replay_use | unknown
    visibility_tier: consumption_allowed | internal_only | redacted_output_only | no_prompt_use | no_replay_use
    visibility_derivation:
      intended_consumption: prompt_context | evidence_support | public_output | replay | material_claim
      derived_from_axes:
        - lifecycle_state
        - authorization_state
        - privacy_state
        - redaction_state
        - proof_sufficiency_state
        - replay_state
      derivation_rule_ref:
    authorization_scope_ref:
    redaction_evidence:
      raw_value_available: true | false
      allowed_proof_forms: [raw_value | hash | bounded_summary | source_ref_only | unavailable]
      redaction_rule_ref:
    tombstone:
      tombstone_ref:
      reason:
      retired_at:
      downstream_refs: []
    limitation_refs: []
```

The first consumer is prompt-packet materialization/context assembly. Raw source
excerpts, document sections, spreadsheet cells, database comments, or other
observed source values must not enter LLM-facing context until a source-safety
row exists and validates for prompt use. If a row derives `no_prompt_use`, the
observation is excluded from prompt payloads; redacted rows may include only
allowed hash, bounded summary, or source-ref-only proof forms and must carry the
limitation forward.

`source-safety-ledger-validation.yaml` must be consumed by prompt-packet
materialization/context assembly and source-observation re-entry before observed
source rows re-enter semantic authoring. A validator must fail closed when a
source-backed claim requires an observed source ref whose lifecycle,
authorization, privacy, redaction, proof-sufficiency, or replay axis does not
support the intended consumption, whose scoped safety row is missing, or whose
derived `visibility_tier` prohibits that sink.

Answer-support validation consumes `source-observation-lineage-index.yaml`,
`source-observation-lineage-index-validation.yaml`, and
`source-safety-ledger-validation.yaml`. A source evidence ref introduced by a
frontier delta must resolve to the exact validated lineage row that introduced it
and to a lineage-index validation artifact that validates the same lineage index
ref and source-observations ref consumed by answer support. It must also resolve
to a valid re-entry validation. The same evidence ref must also have an
observation-specific `evidence_support` source-safety row that is sufficient for
claim support and replay; prompt visibility alone is not material evidence
authority.

Source safety validation has six independent axes. A row can pass one axis and
fail another; validators must preserve the specific failing axis in limitations,
blocked rows, and public recovery text.

| Axis | Required proof | Fails closed when |
|---|---|---|
| lifecycle | active snapshot or tombstone lineage | subject is retired, disposed, invalidated, stale, or missing for a material claim |
| authorization | authorization scope or user/runtime authority | the run is not allowed to inspect, prompt, replay, or display the subject |
| privacy | sensitivity classification and allowed disclosure basis | sensitive data would be exposed without an allowed disclosure basis |
| redaction | redaction status and proof form | raw value is unavailable and bounded summary/hash is insufficient for the claim |
| proof sufficiency | proof form matches claim level | trace-only proof is used to raise semantic or actionability level |
| replay | replay eligibility and allowed proof form | future replay would require a raw value or authority snapshot that is not replayable |

Derived visibility projection:

| Derived `visibility_tier` | Projection rule |
|---|---|
| `no_prompt_use` | any canonical axis blocks `prompt_context` consumption, or the only allowed form is unavailable for prompt materialization |
| `no_replay_use` | `replay_state` is `no_replay_use` or `unknown` for a replay-required material claim |
| `redacted_output_only` | the subject may be surfaced only through an allowed redacted, hashed, bounded-summary, or source-ref-only form |
| `internal_only` | the subject may support internal validation or evidence closure but must not appear in public output |
| `consumption_allowed` | all six canonical axes support the row's `intended_consumption`; public disclosure is allowed only when `intended_consumption` is `public_output` |

Top-level axis state fields are canonical. Nested detail fields such as
`redaction_evidence` are supporting proof only; they must not introduce a second
authority path for redaction or proof sufficiency. Validation must fail when a
supporting detail contradicts its top-level canonical state.

#### Mutable Vocabulary Authority

External standards, provider/framework terms, and profile-owned facets can affect
ontology claims only through `vocabulary-authority-ledger.yaml` after that
authority is promoted. Until then, reconstruct must not project public or
blocker/high claims that depend on unresolved mutable vocabulary proof as if the
runtime had validated vocabulary identity.

```yaml
schema_version: "1"
session_id:
created_at:
vocabulary_rows:
  - vocabulary_row_id:
    vocabulary_kind: source_profile_facet | external_standard | provider_term | framework_term | domain_term | reference_pattern
    vocabulary_subject_id:
    authority_id:
    authority_label:
    authority_version:
    authority_snapshot_ref:
    definition_hash:
    applicability: applicable | not_applicable | deferred | superseded | unknown
    canonical_term:
    alias_terms: []
    maps_to_refs: []
    affected_authority_refs: []
    supersedes_refs: []
    superseded_by_refs: []
    deprecation_refs: []
    split_from_refs: []
    split_into_refs: []
    merged_from_refs: []
    merged_into_refs: []
    promotion_refs: []
    migration_refs: []
    fail_close_when_unresolved: true | false
    limitation_refs: []
```

When promoted, `vocabulary-authority-ledger-validation.yaml` must prove that
every mutable term used by a seed, maturity row, external boundary, reference
standard, profile facet, provider/framework category, or final claim resolves to
an admitted vocabulary row. Unknown, duplicate, or unmigrated vocabulary identity
fails closed when it can affect a blocker/high row or a public claim.

Stable vocabulary identity is the tuple
`vocabulary_kind + vocabulary_subject_id + authority_id + authority_version +
authority_snapshot_ref + definition_hash`. `canonical_term`, aliases,
supersession, deprecation, split/merge, promotion, and migration metadata are
versioned properties of that identity, not the identity anchor itself. Public or
blocker/high claims that use a mutable display term must cite the stable
vocabulary row or project `blocked`/limitation until the mapping is validated.

#### Registry Verification Evidence

Current, promoted, active, implemented, and executable status claims require
`registry-verification-evidence.yaml`:

```yaml
schema_version: "1"
session_id:
created_at:
registry_ref:
registry_sha256:
active_artifact_authority_ids: []
active_validation_gate_ids: []
active_validator_ids: []
required_when_predicate_ids: []
source_profile_ids: []
evidence_rows:
  - evidence_id:
    evidence_kind: registry_snapshot | artifact_authority_row | validation_gate_row | validator_row | predicate_row | source_profile_row
    subject_id:
    evidence_ref:
    evidence_status: verified | pending_verification | invalid
    evidence_hash:
```

`registry-verification-evidence-validation.yaml` must prove that any
present-tense runtime status consumed by `claim-projection.yaml` has verified
current-registry evidence. It must compare `registry_sha256` to the current
registry file, compare active artifact/gate/validator/predicate/source-profile
subject lists to `reconstruct-contract-registry.yaml`, prove every active gate
has a validator record, prove every validator gate ref resolves to an active
gate, prove every active gate `required_when` predicate resolves, and require a
kind-specific verified evidence row for each current registry subject.
`pending_verification` or `invalid` rows may appear in design prose, but runtime,
MCP, API, status, result, and final-output surfaces must not consume them as
executable truth.

Claim projection is the only public-surface gate for success, readiness,
actionability, `blocked`, and `ask_user`. Status/result/MCP/API/final-output
writers may read underlying validation artifacts for diagnostics, but the label,
machine status, next required authority, excluded scope, material-kind support,
and recovery action must come from a validated `claim-projection.yaml` row.

## 12. Runtime Validation Plan

Runtime validation should be deterministic and fail loud. The list below is the
target validation catalog for this recomposition. A responsibility tied to a
planned artifact or planned gate becomes an active runtime responsibility only
when that artifact or gate is registry-backed, requested/promoted through the
planned registry catalogs, or explicitly named by the current implementation
stage.

Validation responsibilities:

- reconstruct run-control validation for session ownership, idempotency
  fingerprinting, active locks, duplicate-start diagnostics, observed file-hash
  write checkpoints, and conflict handling
- schema parse and required field checks
- allowed enum checks
- id uniqueness
- cross-reference closure
- evidence-ref closure
- material-kind/source-ref alignment
- maturation source-delta fact recording and no-delta authority validation
- maturation source-impact judgment validation before any actionability-impact
  claim is consumed
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
- maturation convergence-ledger closure for every blocker/high question and
  source-delta row
- final re-question pass validation before actionable-ready projection
- claim-projection validation for every public or downstream claim surface
- material-admission validation for purpose-critical adequacy elements, with
  source-backed material values only after their phase is promoted
- source-safety validation before prompt-packet materialization/context assembly
  and for lifecycle, authorization, privacy, redaction, proof sufficiency, replay
  eligibility, and derived visibility projection
- planned mutable-vocabulary validation for external/profile/provider/framework
  terms after registry promotion
- registry-verification evidence validation for current/executable status claims
- cross-cutting authority activation-order validation before any public or
  downstream surface consumes readiness, actionability, material-kind support,
  blocked, or ask-user claims
- stop-decision and handoff-validation consistency
- registry-selected artifact, gate, profile, lens judgment, and readiness
  projection consistency
- lifecycle-required seed confirmation and seed-iteration validation-result authority
  closure
- final-output provenance footer

Runtime may calculate metrics from artifacts, but metrics are not semantic truth.

### Source Safety And Artifact Lifecycle

Source material, authority responses, code comments, document text, spreadsheet
cells, database comments, and user-provided target content are data, not
instruction authority. Prompt packets must label those excerpts as untrusted
source evidence and keep system/developer/runtime contract instructions separate.

Safety and lifecycle rules:

- source text cannot override active reconstruct contracts, registry predicates,
  validators, tool policies, or user-confirmed run scope;
- prompt packets include only the minimum source excerpts needed for the current
  stage and preserve refs so omitted context can be audited;
- secrets, credentials, personal data, and sensitive business values are redacted
  from user-facing prose unless the user explicitly authorizes disclosure for the
  run; artifact truth may preserve hashes, refs, labels, or bounded summaries
  instead of raw sensitive text;
- authority responses record identity, scope, timestamp/version, and replay
  eligibility, and unavailable or rejected authority responses remain visible as
  limitations or blocked rows;
- stale source snapshots, stale profile snapshots, and unresolved migration refs
  cannot be treated as current authority;
- retirement, disposal, or redaction of an artifact must leave an audit-visible
  tombstone with artifact ref, hash when available, lifecycle state, reason, and
  downstream refs that can no longer be trusted; and
- replay must fail closed when a required source ref, redacted value, retired
  artifact, or authority snapshot is needed to prove a material claim.

These prose rules are implementation guidance only until
`source-safety-ledger.yaml` and `source-safety-ledger-validation.yaml` are
promoted. After promotion, validators consume the ledger rather than re-reading
this prose.

## 13. Prompt Plan

Prompt packets should give the host LLM:

- reconstruct intent, target refs, and source-derived purpose evidence
- material profile
- compact source observations
- source-delta and no-delta validation artifacts when the run is resumed or the
  source authority changed
- full artifact ref locations
- active seed contract
- required output schema for the current stage
- validation failure from the previous attempt, when retrying
- selected registry snapshot, source profile ids, and reconstruct lens ids
- validator ids, validator versions, and prior validation failure artifacts when
  retrying
- convergence ledger and actionability matrix rows from prior maturation rounds
  when continuing

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
- source-delta fact state, including no-delta, changed source, unavailable
  source, comparison-unavailable, and member-set changes
- validated source-impact judgment, including semantic-action delta,
  evidence-strength delta, trace/audit-only delta, and authority gap
- material questions closed without semantic change
- validation gates that passed or failed

No separate HTML UI is required. CLI/MCP hosts should receive progress through
LLM-presentable status text, status polling, and native progress notifications
where supported.

User-facing status and result surfaces should be machine-readable as well as
readable text. They must not rely on color alone, must include explicit timezone
and source for timestamps, and must preserve locale-sensitive values such as
currency, dates, decimal separators, and units with enough source context for
replay. Public UI accessibility is outside this implementation slice, but CLI and
MCP projections still need these bounded output guarantees.

After `claim-projection.yaml` promotion, bounded UX fields in the claim
projection row are the output contract for CLI, MCP, API, status, result, and
handoff surfaces. `final-output-provenance-validation.yaml` must verify that
human-readable text cites the canonical claim-projection refs and does not
invent claim labels before the runtime projection is published.

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
registry-backed first-pass maturation authorities that existed before this
source-delta and convergence-ledger refinement: baseline, baseline
actionability matrix, question frontier, closure frontier, answer support,
answer claims, ontology expansion, current actionability matrix, convergence,
and continuation decision. Multi-round source-observation delta and
source-observation re-entry validation are also active for frontier-triggered
observations before they re-enter prompt/context semantic authoring or
answer-support consumption. The
maturation source-delta authority, final re-question pass generation, and proof
authorities remain planned until their registry rows, runtime gates, and
validators are real behavior. The optional `actionable-ontology.yaml`
projection is active for `actionable_limited` or `actionable_ready` continuation
states and is validated as a runtime projection of existing seed, expansion,
matrix, convergence, and continuation authorities.

Required test path for each implementation slice:

1. add or update a narrow fixture test for the validator or prompt output shape;
2. add an integration test around `run.ts` for the changed artifact sequence;
3. run `npx vitest run` on the changed reconstruct tests;
4. run `npm run check:ts-core`;
5. run `npm run build:ts-core`;
6. for release or merge, run one real-source reconstruct E2E and verify the first
   invalid gate fails loud or the seed/maturation artifacts pass with named
   limitations.

Material-kind support claims require material-specific evidence:

| Support claim | Meaning | Minimum verification |
|---|---|---|
| `unsupported` | runtime recognizes the material kind but cannot run it | fail-loud unsupported or clarify halt |
| `profile_supported` | a source profile can be selected and validated | profile parser and material-profile validation tests |
| `fixture_validated` | deterministic fixtures prove structural observation and validation | fixture tests for source observations, purpose adequacy, and failure cases |
| `golden_source_validated` | a curated non-trivial target proves expected semantic artifacts | golden-source run with checked artifact refs and limitations |
| `real_source_validated` | an external real target proves the path under realistic source noise | real-source E2E with artifacts, validation results, and first-failure visibility |
| `release_supported` | the material kind can be claimed in user-facing docs/API | golden or real-source validation plus fail-loud unsupported/mixed-member behavior |

A code repository E2E proves `code` support only. Spreadsheet, document,
database, meeting-record, and mixed support each need their own support claim and
evidence. `mixed` can be release-supported only when every member kind has a
verified path or a limitation-backed unsupported member state.

Current public projection is constrained to `unsupported` and
`profile_supported`. `fixture_validated`, `golden_source_validated`,
`real_source_validated`, and `release_supported` remain taxonomy states until
their material-specific evidence artifacts and validators are wired.

Per-kind release evidence requirements:

| Material kind | Release-supported only when |
|---|---|
| `code` | real or golden repository run proves file/module/service observation, purpose inference or confirmation, actor/object/action/data-binding extraction, dependency and external-boundary mapping, validation failure visibility, and artifact refs |
| `document` | real or golden document run proves section/heading/decision/action-item observation, purpose extraction or inference, citation-preserving evidence refs, source-safety/redaction handling, and limitation output for ambiguous prose |
| `spreadsheet` | real or golden workbook run proves sheet/range/named-range/formula/decision-cell observation, source values and derived outputs are distinguished, formula or calculation evidence is replayable, and stale workbook or hidden-sheet gaps fail loud |
| `database` | real or golden database/schema snapshot proves table/view/key/grant/default/derived-view observation, sampled evidence boundaries are explicit, permission and retention constraints are represented, and unavailable credentials or schema drift block/limit claims |
| `meeting_record` | real or golden meeting artifact proves participants, decisions, action owners, due dates, open questions, and unresolved policy decisions are extracted as purpose-relevant evidence without inventing workflow paths |
| `mixed` | every member kind has its own validated support claim, cross-member refs preserve lineage, unsupported members are limitation-backed, and no member's evidence is used as a substitute for another kind |

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
  `target-material-profile-validation.yaml`; source-observation delta validation
  and source-observation re-entry validation are active gates for
  frontier-triggered observations, and `source-observation-lineage-index.yaml`
  plus `source-observation-lineage-index-validation.yaml` preserve and validate
  every round delta/re-entry ref before answer-support validation consumes newly
  observed evidence
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
  checks; active round-lineage and observation-reentry validators own pre-use
  lineage and safety-gated prompt/context re-entry plus answer-support
  consumption checks
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
- `baseline-actionability-matrix.yaml` records the immutable baseline-derived
  matrix consumed by question frontier authoring, and
  `baseline-actionability-matrix-validation.yaml` proves the zero-delta
  derivation before M2 starts
- `maturation-source-delta.yaml` records whether the consumed source authority is
  unchanged, changed, unavailable, or incomparable for the current maturation
  round; `maturation-source-delta-validation.yaml` proves the classification and
  member lineage after the artifact is promoted into the registry
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
- `ontology-expansion.yaml` does not contain trace/audit-only or evidence-only
  no-op operations; after convergence-ledger promotion, those close through
  `maturation-convergence-ledger.yaml`
- `actionability-matrix.yaml` records L0-L4 levels for static, kinetic, and
  dynamic surfaces across the seven dimensions, including
  `aggregate_readiness_effect` for mixed-member and aggregate rows
- `maturation-convergence-ledger.yaml` records every material question and
  round source-observation delta ref as answered-and-expanded,
  answered-without-semantic-change,
  trace/audit-only, deferred, blocked, rejected non-material, or out of scope;
  its active validation proves blocker/high rows are not hidden before
  continuation is projected
- `maturation-continuation-decision.yaml` projects `continue`, `ask_user`, `blocked`,
  `actionable_limited`, or `actionable_ready`
- `maturation-continuation-decision-validation.yaml` proves the projection
  follows the validated matrix, active convergence ledger, and any applicable
  frontier/evidence authorities; promoted source-delta authorities are consumed
  when activated
- final re-question pass is recorded inside the convergence ledger as `not_run`
  in the current first-pass implementation; it becomes required before
  `actionable_ready` is claimed by final actionable ontology projection
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
- material-kind support is reported with the highest proven support claim for
  each kind, not inferred from a different material kind's E2E.

### Stage 8. Operations And Runtime Governance

Expected result:

- reconstruct run-control records request fingerprint, idempotency key, lock
  lease, attempt lineage, duplicate-start diagnostics, and observed file-hash
  transactions before later artifacts are trusted
- run-control failures before claim projection emit only
  `reconstruct-run-bootstrap-diagnostic.yaml` with operational recovery data, not
  seed validity, maturation readiness, material-kind support, or actionability
- reconstruct run manifests record provider route, model, execution profile,
  runtime version, registry snapshot, source profile snapshots, and validator
  versions without secrets
- duplicate requests with matching fingerprints fail loud with a return-existing
  diagnostic until an explicit result/status return surface is promoted;
  duplicate requests with conflicting fingerprints fail loud before semantic
  artifacts are written
- partial artifact writes are rolled back, quarantined, or recovered through a
  recorded write transaction before downstream validators consume the path
- failed or halted runs classify provider outage, tool failure, validation
  failure, source access failure, source drift, unsupported predicate, and
  authority-unavailable incidents separately
- retry is allowed only from recorded validation failure, revision proposal, or
  explicit user/runtime authority; retry must not hide the first failed gate
- status/result APIs expose diagnostic artifact refs, halt reason, recovery
  option, and next safe action
- drift checks compare active registry/profile/validator snapshots against the
  run manifest before resumed maturation consumes old artifacts
- operational incidents do not create ontology meaning; they close through
  failure classification, revision proposal, limitations, or blocked state.

Broader operated-system governance that is outside a reconstruct run is delegated
to a future operations authority document. Until that document exists and is
linked from the registry, this recomposition may claim only run-level governance,
not release health, rollback, quota, resource-exhaustion, or post-incident
program completeness.

## 16. Completion Definition For This Recomposition

The recomposition is implemented when a fresh reconstruct run against a real
target produces:

1. `reconstruct-run-control.yaml` and validation proving session ownership,
   idempotency fingerprinting, active-attempt lock ownership, duplicate-start
   diagnostics, and observed file-hash write checkpoints, or a bootstrap
   diagnostic when run-control validation fails before trust can be established,
2. material-aware source observations,
3. source-purpose candidates, purpose candidate validation, and purpose
   confirmation validation when required,
4. candidate inventory and disposition with purpose-element and actionability
   surface mapping,
5. `ontology-seed.yaml` using the active seed contract,
6. source-derived purpose and purpose adequacy evidence closure,
7. user confirmation for inferred purpose when direct source purpose is absent,
8. deterministic validation artifacts for every gate,
9. canonical candidate-disposition, competency-question, assessment, and
   handoff-validation authorities, including diagnostic or claim-based P3
   competency-question disposition when ontology domain competency admission is present,
10. phase-scoped material admission rows and validation for pre-seed purpose
    elements, literal material-value rows, post-CQ domain competency rows, and
    maturation reassessment rows when each phase is applicable,
11. active source-frontier dependency validation, round source-observation
   delta/re-entry validation, and a validated session lineage index that
   preserves each newly observed source before answer-support consumption,
12. registry ref/hash plus active contract ref/hash, source profile migration,
   lens judgment, concrete gate-instance, validator, reference-standard,
   pattern-catalog URI/snapshot, and readiness-projection snapshots,
13. separate process-completion and seed-validity reporting,
14. final output that explains `OntologySeed` content, source-derived purpose,
    purpose adequacy frame, seed iteration readiness, maturation frontier, and
    limitations, and
15. a reconstruct record whose artifact refs are the source of truth,
16. claim projection rows and validation for status/result/MCP/API surfaces when
    those surfaces claim readiness, actionability, or material-kind support,
    citing `target-material-profile-validation.yaml` and the immutable
    pre-publication run-control checkpoint, and final-output claim sections that
    cite the canonical refs without restating pre-publication claim values,
17. source-safety authority rows and validations when observed source lifecycle,
    redaction, privacy, or authorization affects prompt/context use, plus planned
    mutable-vocabulary authority rows after registry promotion when external
    standards, provider/framework terms, or profile-owned facets affect a
    material claim,
    and
18. registry-verification evidence for any present-tense active, promoted,
    current, implemented, or executable claim.

The full maturation stage is implemented when the required target artifacts are
promoted into the registry and a fresh run can continue from that seed and
produce:

1. valid reconstruct run-control ownership or resume authorization for the
   maturation attempt,
2. `maturation-runtime-capability-profile.yaml`,
   `maturation-promotion-request.yaml`, `maturation-promotion-readiness.yaml`,
   and their validations when planned maturation gates are promoted or maturation
   execution is requested,
3. `maturation-baseline.yaml` and validation,
4. `baseline-actionability-matrix.yaml` and validation before question frontier
   authoring,
5. `maturation-source-delta.yaml` and validation when the source authority must
   be proven unchanged, unavailable, comparison-unavailable, or changed, plus
   source-impact judgment validation when a changed fact can affect actionability,
6. `maturation-question-frontier.yaml` and validation,
7. `maturation-closure-frontier.yaml` and validation when additional evidence is
   needed,
8. `answer-support-ledger.yaml` and validation,
9. `maturation-authority-response.yaml` and validation when user,
   runtime-capability, external-system, or domain-standard authority is needed,
10. `maturation-answer-claims.yaml` and validation,
11. `ontology-expansion.yaml` and validation,
12. `actionability-matrix.yaml` and validation after validated answer claims and
   ontology expansion,
13. `maturation-convergence-ledger.yaml` and validation,
14. `maturation-continuation-decision.yaml` and validation,
15. final re-question convergence evidence recorded inside the convergence
   ledger and consumed by continuation-decision validation, and
16. `claim-projection.yaml` plus validation for every public or downstream
   maturation/actionability claim,
17. source-delta impact judgment validation when source freshness can affect a
   material row, and
18. `actionable-ontology.yaml` plus validation when readiness is
   `actionable_limited` or `actionable_ready`.
