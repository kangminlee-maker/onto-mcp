# 2026-06-03 Reconstruct Actor-Action-State Scout Design

> Status: Onto-reviewed design-contract pass; material issue count 0 in `.onto/review/20260603-f71217ae`; SourceScoutPack and SeedAuthoringReadiness runtime slices implemented
> Scope: reconstruct seeding and maturation input strategy
> Canonical runtime target after implementation: `.onto/processes/reconstruct/` contracts plus `src/core-runtime/reconstruct/`

## 1. Goal

Improve reconstruct so seeding starts from the actionable ontology spine:

```text
actor -> action -> state
```

The current live E2E evidence shows the pipeline can spend most of its time in
broad exploration and large retry loops. The design goal is not merely to shrink
prompts. The design goal is to preserve quality while making the first source
exploration more likely to find the evidence needed for an actionable ontology
seed.

Done when:

1. First exploration prioritizes actor/action/state evidence before broad
   historical or auxiliary material.
2. Runtime still does not decide semantic meaning.
3. Seed authoring is blocked or limited when selected-purpose actionability
   closure is not evidence-backed, limitation-backed, or frontier-backed.
4. Retry after seed/CQ validation failure reuses compatible upstream artifacts
   and repairs a narrow scope.
5. Live E2E can explain whether a seed was ready, limited, frontier-required,
   or budget-exhausted without overclaiming source completeness.

## 2. Starting Questions

Per repo guidance, every reconstruct change starts with these questions.

| Question | Answer |
|---|---|
| Which ontology concept changes? | `OntologySeeding` becomes actor-action-state-first at the scout layer. `SourceProfileDefinition` gains scout guidance. `PurposeAdequacyFrame` remains the owner of required seed adequacy elements. `SeedAuthoringReadiness` becomes the pre-seed selected-purpose actionability closure gate, while post-seed handoff readiness remains separate. |
| Canonical seat? | Source profile guidance lives in `.onto/processes/reconstruct/source-profiles/*.md`; active ids/status/hash remain in `reconstruct-contract-registry.yaml#source_profile_records`; runtime projections live in `src/core-runtime/reconstruct/`; historical rationale stays in this development record. |
| Target material kind impact? | Phase 1 is limited to single-member `code` and `document` targets. `mixed`, `spreadsheet`, `database`, and `unknown` remain limitation-backed or planned until member lineage and strict aggregate closure are implemented. |
| LLM or runtime owned? | Runtime owns scout signal extraction, source-safety filtering, traceability, pack validation, stale reuse gates, and seed-readiness validation from validated artifacts. LLM owns actor/action/state semantic interpretation and seed content. |
| Prompt-backed first? | Yes. First implementation can keep LLM authoring paths but provide only source-safety-validated scout rows as bounded input. |
| Bounded TS replacement? | Runtime deterministic source-role signal projection, source-safety admission, pack validation, source-profile snapshot checks, selected-purpose readiness closure, and narrow repair selection become TS steps. |

## 3. Current Failure Mode

Current reconstruct starts from material inventory and structural observations:

```text
target refs
  -> material detection
  -> source inventory
  -> source observations
  -> source observation directive
  -> lens exploration rounds
  -> purpose/candidates/seed
```

This can be valid, but it is inventory-first. On a large repository, first
exploration may spend time on historical ledgers, broad tests, or QA artifacts
before establishing the actor/action/state spine.

Observed live E2E pattern:

- One latest run contained a failed first attempt plus a successful resumed
  attempt.
- The failed attempt spent most time in five broad exploration rounds.
- The successful attempt still spent most time in ontology seed retry and
  competency-question loops.

The structural concern is that the pipeline asks "what source is important?"
before asking "who acts, what do they do, and what state changes?"

## 4. Design Options

| Option | Fit | Cost | Risk | Done when |
|---|---|---|---|---|
| A. Prompt-only actor-first wording | Fastest | Low | Weak; broad inventory still dominates input | Prompts mention actor/action/state but runtime artifacts do not enforce closure |
| B. Source-profile scout guidance plus runtime scout pack | Best default | Medium | Requires new projection/validation but keeps semantic ownership clean | First pack is actor-action-state oriented and traceable to observations |
| C. Full parser/domain extractor per material kind | Highest precision later | High | Can smuggle semantic judgment into runtime and slow rollout | Parsers produce high-confidence typed actor/action/state facts |
| D. LLM-only pre-scout over all files | Easy to prototype | Medium/high token cost | Recreates current broad prompt problem | Pre-scout chooses source refs but no deterministic closure |

Default method: **Option B**.

It improves first-candidate quality without asking runtime to decide ontology
meaning. It also extends existing source-profile responsibility instead of
creating a parallel domain taxonomy.

## 5. Concept Boundaries

The design reuses existing concepts where possible.

| Concept | Role |
|---|---|
| `SourceProfileDefinition` | Adds material-kind-local actor/action/state scout guidance. It still does not choose semantic meaning. |
| `SourceObservation` | Remains source authority for structural evidence. |
| `SourceObservationDirective` | Consumes scout pack and chooses evidence candidates. It remains LLM-authored and runtime-validated. |
| `PurposeAdequacyFrame` | Carries selected-purpose required elements. Actor/action/state can be an early scout focus, but readiness closure is keyed to these required elements. |
| `CandidateInventory` / `CandidateDisposition` | Become actor-first but remain LLM-authored. |
| `OntologySeed` | Must expose selected-purpose actionability closure or explicit limitations. |
| `SeedAuthoringReadiness` | Runtime pre-seed gate that decides whether seed authoring is allowed, limited, frontier-required, unsupported, or blocked from validated upstream artifacts only. |
| `HandoffDecisionValidation` | Existing runtime post-seed handoff gate, emitted as `handoff-decision-validation.yaml`, that validates the authored seed can honestly enter maturation. |

New concept candidate:

| Candidate | Canonical scope | Reason |
|---|---|---|
| `SourceScoutPack` | Runtime projection artifact, not semantic authority | Needed to make first exploration replayable, bounded, and auditable. |
| `SeedAuthoringReadiness` | Runtime pre-seed projection, separate from post-seed handoff readiness | Needed to stop seed authoring before a large invalid seed is generated when selected-purpose actionability closure is not validated. |

`SourceScoutPack` is intentionally named generically. `actor-action-state` is
the first scout focus, not a separate permanent material kind or semantic
authority.

Ordering rule: `SourceScoutPack` is upstream of source-purpose selection and
therefore must not cite `PurposeAdequacyFrame.required_elements[]` or any
selected-purpose required-element refs. It may only record profile-local scout
coverage. Selected-purpose closure begins later in
`SeedAuthoringReadiness.closure_rows[]`, after source-purpose candidates and the
purpose adequacy frame have been authored and validated.

The design also separates two internal surfaces that must not be conflated:

| Surface | Owner | Meaning |
|---|---|---|
| Scout signal coverage | Runtime projection | Which prompt-eligible observation rows look worth inspecting earlier. |
| Seed authoring claim closure | Runtime validation projection over LLM-authored and validated artifacts | Whether the selected purpose has enough validated closure, limitation, or frontier to allow seed authoring. |

## 6. Source Profile Extension

Add a profile-local section to source profile documents:

```text
## Actor-Action-State Scout Guidance

- actor_signal:
- action_signal:
- state_signal:
- guard_signal:
- object_signal:
- high_priority_source_patterns:
- low_priority_source_patterns:
- limitation_cues:
```

### Code Profile Guidance

Code-specific scout signals may include:

- actor signals: `user`, `admin`, `member`, `team`, `org`, `role`,
  `permission`, `principal`, `account`, `client`, `provider`, `worker`,
  `scheduler`
- action signals: route handlers, server actions, service methods, commands,
  queries, mutations, `create/update/delete`, `approve/reject`, `ingest`,
  `sync`, `classify`, `render`
- state signals: enum/status fields, lifecycle tables, queue state, retry
  fields, event logs, failure states
- guard signals: auth middleware, permission checks, validation schemas,
  allowlists, error classes, rate/visibility policies
- object signals: schema models, DTOs, API payloads, read models, source
  bindings

### Document Profile Guidance

Document-specific scout signals may include:

- actor signals: audience, owner, approver, responsible team, stakeholder,
  customer, operator, participant
- action signals: procedure, decision, approval, report, request, obligation,
  action item, acceptance criterion
- state signals: status, phase, risk state, lifecycle step, timeline,
  unresolved/open/resolved markers
- guard signals: policy condition, exception, rule, prohibition, review
  criterion, escalation path
- object signals: subject, resource, deliverable, report, system, data asset,
  referenced artifact

The profile guidance is evidence-reading guidance only. It cannot declare that a
detected source is semantically important; it can only mark why a source is a
candidate for actor-action-state interpretation.

## 7. Runtime Scout Pack

Introduce a runtime projection:

```text
source-scout-pack.yaml
source-scout-pack-validation.yaml
```

Proposed shape:

```yaml
schema_version: "1"
session_id:
created_at:
scout_focus: actor_action_state
projector_id:
projector_version:
ranking_version:
slot_closure_rule_version:
source_observations_ref:
source_safety_ledger_ref:
source_safety_ledger_validation_ref:
target_material_profile_validation_ref:
source_observation_lineage_index_validation_ref:
source_profile_snapshot_refs: []
signal_rows:
  - signal_id:
    observation_id:
    source_ref:
    member_id:
    member_target_ref:
    target_material_kind:
    member_support_state:
    profile_id:
    selected_source_profile_snapshot_ref:
    signal_axis: actor | action | state | guard | object | declared_purpose | source_claim | instruction_cue | provenance_cue | limitation
    signal_basis: path | basename | heading | symbol | excerpt | schema | test | api | config
    signal_text:
    redaction_summary:
    intended_consumption: scout_prompt_input | evidence_support | replay | public_projection
    prompt_visibility_state: prompt_visible | redacted | blocked
    source_safety_row_refs: []
    source_safety_validation_ref:
    confidence_basis:
    ranking_basis:
scout_groups:
  - group_id:
    grouping_basis: same_file | same_section | same_symbol | same_route | same_schema | same_test | same_document_link
    signal_refs: []
    member_scope_refs: []
    source_ref_summary:
    non_semantic_note: Runtime grouping records co-location only; it does not claim the actor acts on the action or changes the state.
profile_scout_coverage_slots:
  - slot_id:
    profile_slot_axis: actor | action | object | state | guard | declared_purpose | source_claim | instruction_cue | provenance_cue | limitation | profile_local
    slot_status: present | missing | limitation_cue | blocked_by_safety
    member_scope_refs: []
    signal_refs: []
    limitation_refs: []
    frontier_refs: []
limitations: []
```

`source-scout-pack-validation.yaml` must emit the scout-scope projection:

```yaml
scout_scope:
  canonical_material_scope_ref: target-material-profile-validation.yaml
  scope_state: supported_single_member_code_or_document | unsupported_material_scope | member_scoped_composite
  scope_state_reason:
  derived_only: true
```

`target-material-profile-validation.yaml` remains the canonical material-scope
support seat. The scout-scope projection is a derived consumer view for the
scout pack only.

Validation checks:

1. Every signal row resolves to `source-observations.yaml`.
2. Every profile id/hash resolves to the selected source profile snapshot.
3. Every prompt-visible signal row resolves to an observation-specific
   `source-safety-ledger.yaml` row and a valid
   `source-safety-ledger-validation.yaml` ref for the intended consumption.
4. Blocked or redacted rows cannot be copied into prompt packets except through
   the recorded redaction summary.
5. Every scout group references existing signal rows and declares a
   deterministic grouping basis.
6. Phase 1 scout-scope validation fails closed for `mixed`, `spreadsheet`,
   `database`, and `unknown` targets unless a later member-scoped scout contract
   is active.
7. Runtime does not validate actor-action-state semantic correctness; it
   validates traceability, source safety, grouping basis, member scope, and
   closure refs only.

LLM-authored actor-action-state interpretation must be recorded later in
`SourcePurposeCandidates`, `PurposeAdequacyFrame`, `CandidateInventory`, and
`CandidateDisposition`. Runtime scout groups are not ontology claims.

If mixed support is promoted later, `SourceScoutPack` must change
`source-scout-pack-validation.yaml#scout_scope.scope_state` to a member-scoped
value and preserve `member_id`, selected profile snapshot refs, member support
state, cross-material refs, limitation/frontier lineage, and strictest-member
aggregate projection. Until that support exists, mixed targets are not
scout-enabled by this design.

## 8. Exploration Flow

New first exploration flow:

```text
source inventory
  -> source observations
  -> source-safety-ledger.yaml and validation
  -> source-scout-pack.yaml
  -> source-scout-pack-validation.yaml
  -> source-observation-directive.yaml
  -> actor-action-state interpretation in source-purpose/candidate artifacts
  -> seed-authoring-readiness gate
```

Round behavior:

1. First round receives only validated prompt-eligible scout rows plus bounded
   source observation summaries.
2. Lens judgments ask actor/action/state frontier questions before broad source
   expansion, but readiness closure remains selected-purpose and
   material-profile-aware.
3. `source-frontier.yaml` requests only concrete refs that can close declared
   selected-purpose actionability gaps.
4. If max round is exhausted, runtime records budget exhaustion separately from
   seed readiness.

## 9. Seed Authoring Readiness Gate

Introduce a pre-seed runtime projection:

```text
seed-authoring-readiness.yaml
seed-authoring-readiness-validation.yaml
```

This is separate from post-seed `handoff-decision-validation.yaml`.

Proposed fields:

```yaml
schema_version: "1"
taxonomy_version:
enum_owner: reconstruct-contract-registry.yaml#seed_authoring_readiness_taxonomy
selected_purpose_candidate_ref:
purpose_adequacy_frame_ref:
input_authority_refs:
  target_material_profile_validation_ref:
  source_scout_pack_validation_ref:
  source_observation_directive_validation_ref:
  source_purpose_candidates_validation_ref:
  purpose_confirmation_validation_ref:
  candidate_disposition_validation_ref:
  source_frontier_validation_refs: []
  source_observation_delta_validation_refs: []
  source_observation_reentry_validation_refs: []
  source_observation_lineage_index_validation_ref:
scope_support_ref: source-scout-pack-validation.yaml#scout_scope
readiness_classification:
  seed_ready | limited_seed_possible | frontier_required | purpose_confirmation_required | blocked_no_authority | blocked_validation_gap
missing_requirement_categories: []
frontier_availability:
  none | concrete_frontier_available | no_concrete_frontier | unknown
source_sufficiency_state:
  sufficient_for_claim_scope | insufficient_for_claim_scope | unknown_until_frontier | not_evaluated_due_validation_gap
exploration_budget_state:
  within_budget | max_round_exhausted
limitation_closure_state:
  none | limitation_backed | limitation_required | invalid_limitation
closure_rows:
  - closure_row_id:
    required_element_ref:
    closure_axis: purpose | actor | action | object_data | state_transition | guard_policy | static_core | profile_local
    claim_scope:
    closure_state: evidence_backed | limitation_backed | frontier_backed | missing | unsupported | blocked_by_validation_gap
    evidence_refs: []
    limitation_refs: []
    frontier_refs: []
    validated_upstream_refs: []
    member_scope_refs: []
    source_safety_refs: []
    llm_authority_refs: []
ontology_domain_required_category_rows:
  - category_id:
    category_name:
    category_source_ref:
    category_closure_state: included | evidence_backed | limitation_backed | frontier_backed | missing | blocked_by_validation_gap
    purpose_required_element_refs: []
    closure_row_refs: []
    limitation_refs: []
    frontier_refs: []
enum_aliases:
  actor_action_state_frontier_required: frontier_required with missing_requirement_categories populated
  source_frontier_required_budget_exhausted: frontier_required with exploration_budget_state=max_round_exhausted
```

Readiness rules:

- `seed_ready` requires every selected
  `PurposeAdequacyFrame.required_elements[]` row to have a closure row in
  `evidence_backed` or approved `limitation_backed` state for the declared seed
  authoring claim scope.
- `limited_seed_possible` allows missing areas only when closure rows are
  limitation-backed and excluded from stronger claims.
- `frontier_required` means at least one required element is unresolved and
  concrete frontier refs remain available. Missing categories live in
  `missing_requirement_categories[]`; they are not encoded into the state name.
- `max_round_exhausted` is recorded only in `exploration_budget_state`; it does
  not by itself prove source insufficiency.
- `blocked_validation_gap` is required when any input authority validation is
  missing, invalid, stale, or not applicable without a validated required-when
  decision.
- Material support is not encoded as a readiness state. Readiness reads
  `scope_support_ref`, which derives from `target-material-profile-validation`.
  Unsupported scout scope blocks readiness through `blocked_no_authority` plus
  the canonical scope ref, not through a second material-scope authority.
- `closure_state: unsupported` is row-local only. It can explain why a specific
  required element cannot be closed, but it is not the canonical material-scope
  support seat.
- For `domain=ontology`, readiness validation must prove that ontology-domain
  required categories are represented in the selected purpose adequacy frame or
  are explicitly evidence-backed, limitation-backed, frontier-backed, or blocked
  by validation gap. At minimum, the category set must cover terminology or
  glossary, identity/relation candidates, constraints or policies,
  lifecycle/change tracking, modularity/boundaries, provenance, competency
  scope, classification consistency, and application context unless the active
  domain profile defines a stricter set. Any equivalence mapping that closes one
  of these categories under another row must be explicit in
  `category_source_ref` and validated before `seed_ready`.
- Runtime must not treat "not all source explored" as seed failure by itself.
- Runtime must not inspect unstructured source text to decide semantic
  sufficiency. It consumes validated upstream artifacts and checks whether their
  selected-purpose required elements are closed by evidence, frontier, user
  confirmation need, limitation, unsupported-scope records, or validation gaps.

Implementation note:

- The active Phase 2 runtime records unsupported or composite `SourceScoutPack`
  scope as a boundary note, not as automatic `blocked_no_authority`, when the
  selected `PurposeAdequacyFrame.required_elements[]` and material admission
  rows are otherwise evidence-backed. This keeps the deterministic gate from
  letting a phase-1 scout limitation override selected-purpose closure. Future
  member-scoped scout support can tighten this without changing the semantic
  authority boundary.

## 10. Seed Contract Pressure

The seed may be small, but selected-purpose required elements must be
evidence-backed, frontier-backed, or limitation-backed. Actor/action/state
signals shape the first exploration order; they do not replace
`PurposeAdequacyFrame.required_elements[]`.

| Closure area | Minimum closure |
|---|---|
| purpose | selected source-derived purpose or confirmation limitation |
| actor spine | at least one actor type or role with evidence |
| action surface | at least one actor-linked action |
| object/data | action target or consumed/produced data |
| state/transition | lifecycle/status/event/failure/retry state or explicit dynamic limitation |
| guard/policy | permission, validation, policy, or limitation |
| static/core facets | identity, relation, constraint, classification, provenance, or profile-local facets when required by the selected profile or purpose adequacy frame |
| source binding | source observation evidence refs |
| limitations/frontier | unresolved selected-purpose actionability gaps |
| competency questions | at least one CQ tied to selected-purpose claim scope |

Pre-seed authoring gate direction:

- missing or invalid input authority validation -> seed authoring blocked by
  validation gap
- no source-derived or user-confirmed purpose -> seed authoring blocked
- no actor signal interpreted into purpose/candidates when actor is required by
  the selected purpose frame -> seed authoring blocked
  or actor frontier required
- no action signal linked by LLM-authored candidate/purpose artifacts when
  action is required -> seed authoring blocked or limited
- no state/dynamic evidence -> seed may be limited only if dynamic limitation is
  explicit or the selected purpose frame does not require dynamic closure
- concrete unresolved selected-purpose frontier refs -> continue exploration
  while within budget
- Phase 1 mixed/spreadsheet/database/unknown scope -> seed authoring blocked or
  limitation-backed unless a member-scoped contract is active

Post-seed validation direction:

- actorless action claims fail or require limitation.
- actionless actor claims cannot support actionable readiness.
- state transition claims require source evidence or limitation.
- permission/policy claims require actor refs.
- workflow claims require actor responsibility or system boundary refs.

## 11. Stale Reuse And Pack Omission Gates

### Pack Omission

Runtime gates prevent hidden omission without deciding semantic sufficiency:

- required scout slots are present or limitation-backed
- all pack rows cite source observation ids and source refs
- all prompt-visible pack rows cite valid source-safety rows for the intended
  consumption
- all LLM-authored claims cite pack/source evidence or limitations
- omitted high-signal observations are summarized in coverage gaps, not hidden

`high-signal` is not a semantic importance score. Runtime may rank only by
deterministic source-candidate priority:

- source profile signal-axis match count
- selected source profile support state
- concrete source pattern match such as route, schema, section heading, status
  field, test, or policy section
- co-location grouping basis such as same file, same section, same route, same
  schema, or same document link
- source safety and replay eligibility

The pack records `ranking_basis` and `ranking_version` when ordering is used.
The rank means "inspect this earlier"; it does not mean "this is a true
ontology actor/action/state claim."

### Stale Reuse

Reuse is allowed only when compatible:

- target refs hash matches
- source inventory hash matches
- source observation hash matches
- target-material-profile validation hash matches
- source-safety-ledger validation hash matches for every reused prompt-visible
  or evidence-support row
- source-observation-lineage-index validation hash and every consumed
  source-observation-delta/reentry validation hash match
- source-scout-pack hash and source-scout-pack-validation hash match
- source-scout-pack `schema_version`, `projector_id`, `projector_version`,
  `ranking_version`, `slot_closure_rule_version`, and
  `source-scout-pack-validation.yaml#scout_scope` identity are compatible
- seed-authoring-readiness validation hash, taxonomy version, and closure row
  rule version match when readiness artifacts are reused
- selected source profile snapshots and registry hash match
- intent hash and domain admission snapshot match
- reused artifact upstream refs are present in the current run
- validator versions and prompt contract versions are compatible

This proves artifact compatibility, not semantic quality. Semantic judgment
remains LLM-authored and revalidated against current artifacts.

## 12. Implementation Phases

### Phase 1: Design Contract And Prompt Path

- Scope Phase 1 to single-member `code` and `document` targets only.
  `mixed`, `spreadsheet`, `database`, and `unknown` targets record unsupported
  or planned scout scope and do not claim scout-enabled readiness.
- Add actor-action-state scout guidance to `code.md` and `document.md`, then
  update `reconstruct-contract-registry.yaml#source_profile_records`
  definition hashes in the same change.
- Add prompt-only `source-scout-pack` creation from existing observations and
  source-safety validation.
- Feed pack into `writeSourceObservationDirective`,
  `writeSourcePurposeCandidates`, and `writeCandidateInventory` only through
  source-safety-validated prompt-eligible rows.
- Add tests proving pack rows resolve to observations, selected source profile
  snapshots, target-material-profile validation, and source-safety validation.
- Add tests proving the initial pack has profile-local scout coverage only and
  no selected-purpose required-element refs.

Promotion checklist for new runtime artifacts:

- Add `source_scout_pack`, `source_scout_pack_validation`,
  `seed_authoring_readiness`, and `seed_authoring_readiness_validation` to the
  reconstruct stage id set when they become executable runtime stages.
- Add authority and validation refs to
  `reconstruct-contract-registry.yaml#artifact_authority_catalog` and the
  validation gate catalog.
- Add refs to `reconstruct-run-manifest.yaml`, `ReconstructRecord` artifact
  refs, and public API/MCP result projections only after the artifacts are
  executable and validated.
- Add source-safety, visibility/redaction, intended-consumption, proof/replay,
  and lineage refs before any prompt packet or public projection consumes scout
  rows.
- Declare `target-material-profile-validation.yaml` as the canonical material
  support seat and `source-scout-pack-validation.yaml#scout_scope` as the
  derived scout-scope projection; do not add independent material-scope
  authority in readiness states.
- Add post-publication claim-projection coverage only for claims that public
  status/result/final output actually expose.
- Keep design records as historical rationale; do not treat them as runtime
  authority.

### Phase 2: Runtime Validation And Readiness

- Add `source-scout-pack-validation.yaml`.
- Add `seed-authoring-readiness.yaml` before seed authoring.
- Add `seed-authoring-readiness-validation.yaml` with explicit input authority
  refs and fail-closed handling for missing, invalid, stale, or not-applicable
  upstream validations.
- Add readiness closure rows keyed to selected
  `PurposeAdequacyFrame.required_elements[]`.
- Add ontology-domain required category rows and require explicit limitation,
  frontier, validation-gap, or evidence-backed closure for every required
  ontology category, including classification consistency and application
  context, before `seed_ready`.
- Block seed authoring when selected-purpose actionability closure is neither
  evidence-backed, frontier-backed, nor limitation-backed.
- Add tests for budget-exhausted but seed-possible vs budget-exhausted and
  frontier-required.

### Phase 2B: Mixed Scope Decision

- Either keep mixed targets explicitly unsupported for scout/readiness in Phase
  1 product claims, or promote a member-scoped composite contract.
- A member-scoped contract must record member ids, member target refs, selected
  profile snapshot refs, member support states, cross-material refs,
  limitation/frontier lineage, source-safety refs, and strictest-member
  aggregate projection.
- Do not allow aggregate scout slots to close readiness for a purpose-critical
  unsupported member.

### Phase 3: Chunked Authoring And Repair

- Split ontology seed authoring into bounded sections or a validated repair
  loop keyed by seed section.
- Split competency-question authoring by actor/action/state coverage slots.
- Repair invalid chunks only.

### Phase 4: Live E2E And Tuning

- Re-run day1co live reconstruct.
- Compare round count, total time, seed/CQ retry count, token volume, and final
  limitation honesty.
- Promote stable scout signals into profile text only after repeated
  real-source evidence.

## 13. Verification Plan

Static checks:

- source profile docs mention scout guidance but preserve "no semantic
  interpretation" boundary
- scout signal axes do not use `authority` as an observational cue
- registry selected profile hashes update in the same commit whenever active
  source profile docs change
- new scout/readiness artifacts are present in stage ids, artifact authority
  catalog, validation gate catalog, run manifest refs, record refs, and API/MCP
  projection refs before any public consumer relies on them
- TypeScript compile
- reconstruct unit tests

Runtime tests:

- code target with actor/action/state signals creates valid scout pack
- document target with owner/action/status sections creates valid scout pack
- initial scout pack validates before `PurposeAdequacyFrame.required_elements[]`
  exists and contains no selected-purpose required-element refs
- Phase 1 mixed target is not scout-enabled and records unsupported or planned
  scope
- pack row with unknown observation id fails
- prompt-visible pack row without valid source-safety validation fails
- blocked or redacted source-safety row cannot be copied into prompt packet text
- scout group ref drift fails
- scout group without deterministic grouping basis fails
- runtime grouping never creates actor-action-state ontology claims by itself
- runtime ranking basis never accepts semantic ontology labels as ranking input
- seed readiness fails closed when any required upstream validation artifact is
  missing, invalid, stale, or not applicable without validated required-when
- seed readiness writes closure rows for every selected purpose adequacy
  required element
- ontology-domain readiness cannot become `seed_ready` when terminology or
  glossary, identity/relation candidates, constraints or policies,
  lifecycle/change tracking, modularity/boundaries, provenance, competency
  scope, classification consistency, or application context categories are
  absent without validated limitation, frontier, or validation-gap rows
- seed readiness blocks actorless action seed when actor/action closure is
  required by the selected purpose frame
- max-round exhausted with closed limited seed remains possible
- max-round exhausted with material selected-purpose gap blocks or requires
  frontier according to orthogonal taxonomy fields
- stale reuse fails when scout projector version, ranking version,
  source-safety validation hash, source-observation lineage validation hash,
  or readiness taxonomy version changes
- unsupported mixed/spreadsheet/database/unknown public or readiness labels
  derive from `target-material-profile-validation.yaml` and
  `source-scout-pack-validation.yaml#scout_scope`, not from independent
  readiness enum authority

Live E2E:

- first source directive selects actor/action/state evidence in top rows
- first two rounds converge on actor/action/state frontier
- readiness output explains selected-purpose missing requirement categories,
  frontier availability, source sufficiency, limitation state, and exploration
  budget state separately
- seed generation avoids schema-invalid retry caused by oversized all-at-once
  response
- final output states source-depth and actor/action/state limitations honestly

## 14. Open Risks

| Risk | Mitigation |
|---|---|
| Profile scout guidance becomes domain-specific semantic policy | Keep guidance as signal patterns; runtime records `confidence_basis`, not meaning. |
| Actor-first bias hides non-actor static facts | Keep actor/action/state as scout focus only; readiness closure follows selected `PurposeAdequacyFrame.required_elements[]`. |
| Deterministic ranking becomes hidden semantic authority | Rank only source candidate priority, never ontology claim truth. |
| Pack omission hides material source | Validation records missing slots, source-safety exclusions, and omitted high-signal summaries; LLM can request frontier. |
| Scout pack bypasses source safety | Prompt-visible rows must cite valid source-safety validation for the intended consumption. |
| Mixed target aggregate closure hides unsupported members | Phase 1 does not scout-enable mixed targets; later mixed support must use member-scoped strictest-member projection. |
| More artifacts increase complexity | Start with one generic `SourceScoutPack`, not separate actor/action/state artifacts. |

## 15. Recommendation

Proceed with Option B:

```text
source profile scout guidance
  -> runtime source scout pack
  -> actor-action-state first source directive
  -> selected-purpose seed-authoring readiness gate
  -> bounded seed/CQ authoring
```

This is the smallest structural change that directly addresses the first
exploration problem while preserving the LLM/runtime ownership boundary. It is
implementation-ready only after the source-safety, validated closure row,
single-member Phase 1 scope, stale-reuse identity, readiness taxonomy, and
signal vocabulary repairs above are included.
